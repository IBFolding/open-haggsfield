import { createHiggsfieldClient } from '@higgsfield/client/v2';
export const cinemaModel='higgsfield/cinema-studio/4.0';
export const videoModel = 'bytedance/seedance-2.5/text-to-video';
export const imageModel = 'bytedance/seedance-2.5/image-to-video';
export function publicHttps(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && u.hostname !== 'localhost' && !/^([\d.]+|\[.*\])$/.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}
export function generationInput(body) {
  if (typeof body.prompt !== 'string' || body.prompt.trim().length < 4 || body.prompt.length > 4000) throw Error('Describe the shot in 4–4000 characters.');
  if(body.model&& !['seedance','cinema'].includes(body.model))throw Error('Unsupported model.');
  if(body.model==='cinema'){
    if(body.funding==='platform')throw Error('Cinema Studio currently requires your own API key; included pricing is not configured.');
    if(body.imageUrl||body.endImageUrl)throw Error('Cinema reference inputs are not enabled in this integration yet.');
    if(![5,10,15,20,30].includes(body.duration))throw Error('Choose a supported Cinema duration.');
    if(!['16:9','9:16','1:1'].includes(body.aspectRatio||'16:9'))throw Error('Unsupported aspect ratio.');
    return {endpoint:cinemaModel,input:{prompt:body.prompt.trim(),duration:body.duration,resolution:'720p',aspect_ratio:body.aspectRatio||'16:9',generate_audio:Boolean(body.audio)}};
  }
  if (![5, 10, 15].includes(body.duration)) throw Error('Choose 5, 10 or 15 seconds.');
  const input = {
    prompt: body.prompt.trim(),
    duration: body.duration,
    resolution: '720p',
    output_format: 'mp4',
    generate_audio: Boolean(body.audio)
  };
  let endpoint = videoModel;
  if (body.imageUrl) {
    if (!publicHttps(body.imageUrl)) throw Error('Use a public HTTPS start-frame URL.');
    input.image_url = body.imageUrl;
    endpoint = imageModel;
    if (body.endImageUrl) {
      if (!publicHttps(body.endImageUrl)) throw Error('Use a public HTTPS end-frame URL.');
      input.end_image_url = body.endImageUrl;
    }
  } else {
    if (body.endImageUrl) throw Error('An end frame requires a start frame.');
    input.aspect_ratio = '16:9';
  }
  return {
    endpoint,
    input
  };
}
export const provider = {
  async submit(credentials, endpoint, input) {
    return createHiggsfieldClient({
      credentials,
      maxRetries: 0,
      timeout: 60000
    }).subscribe(endpoint, {
      input,
      withPolling: false
    });
  },
  async status(credentials, id) {
    const r = await fetch(`https://api.higgsfield.ai/requests/${encodeURIComponent(id)}/status`, {
      headers: {
        Authorization: `Key ${credentials}`
      },
      signal: AbortSignal.timeout(20000),
      redirect: 'error'
    });
    if (!r.ok) throw Object.assign(Error('Provider status unavailable'), {
      statusCode: r.status
    });
    return r.json();
  }
};
export function safeFailure(e) {
  const code = e?.statusCode;
  if (e?.name === 'AuthenticationError' || code === 401) return 'Higgsfield rejected this API key.';
  if (code === 403 || code === 402) return 'Your Higgsfield API balance has insufficient credits.';
  if (code === 404) return 'This model is not available to this API account.';
  if (code === 400 || code === 422) return 'Higgsfield rejected the shot parameters.';
  if (code === 423 || code === 503) return 'Higgsfield reports that this model is unavailable.';
  return 'Submission outcome is unknown. Check the provider console before any new attempt.';
}
export async function applyResult(db, id, result) {
  const current = await db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
  if (!current||['completed','failed','nsfw','canceled','rejected'].includes(current.status)) return;
  const status = ['queued', 'in_progress', 'completed', 'failed', 'nsfw', 'canceled'].includes(result?.status) ? result.status : 'unknown';
  const requestId = typeof result?.request_id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(result.request_id) ? result.request_id : current.request_id;
  const video = status === 'completed' ? publicHttps(result.video?.url) : null;
  const finalStatus = status === 'completed' && !video ? 'unknown' : !requestId && ['queued', 'in_progress'].includes(status) ? 'unknown' : status;
  const error = finalStatus === 'unknown' ? 'Unconfirmed provider outcome; do not resubmit automatically.' : ['failed', 'nsfw', 'canceled'].includes(finalStatus) ? `Provider ended this request: ${finalStatus}.` : null;
  await db.prepare('UPDATE jobs SET status=?,request_id=?,video_url=?,error=?,updated=? WHERE id=? AND status NOT IN (\'completed\',\'failed\',\'nsfw\',\'canceled\',\'rejected\')').run(finalStatus, requestId, video, error, Date.now(), id);
}
