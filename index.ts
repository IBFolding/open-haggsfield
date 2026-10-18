// Server-only CLI. Never import this file into src/ or the browser bundle.
import { config as loadEnvironment } from 'dotenv';
import { config, higgsfield } from '@higgsfield/client/v2';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function completedVideo(result: unknown): string {
  const response = result as { status?: string; video?: { url?: string } } | null;
  switch (response?.status) {
    case 'completed': break;
    case 'failed': throw new Error('Generation failed. No successful video was returned.');
    case 'canceled':
    case 'cancelled': throw new Error('Generation was canceled. No successful video was returned.');
    case 'nsfw':
    case 'moderated': throw new Error('Generation was moderated. No successful video was returned.');
    default: throw new Error('No confirmed completion. Check the request in the Higgsfield console before retrying.');
  }
  const url = response.video?.url;
  if (typeof url !== 'string') throw new Error('Completed response did not include a video URL.');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Provider returned an invalid video URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Provider returned an unsupported video URL.');
  return url;
}

async function main(): Promise<void> {
  // Load only in this Node process; never inspect or print the parsed environment.
  loadEnvironment({ path: fileURLToPath(new URL('./.env.local', import.meta.url)), quiet: true });
  const credentials = process.env.HF_CREDENTIALS;
  if (!credentials || !/^[^:\s]+:[^:\s]+$/.test(credentials)) {
    console.error('BLOCKED: Set HF_CREDENTIALS locally in .env.local as key-id:key-secret, save, then rerun. No request submitted.');
    process.exitCode = 1;
    return;
  }
  config({ credentials, maxRetries: 0, timeout: 60_000, pollInterval: 5_000, maxPollTime: 15 * 60_000 });
  console.error('Submitting one billable Seedance 2.5 request: 5 seconds, 720p, 16:9. Waiting for completion.');
  const progress = setInterval(() => console.error('Still waiting for provider completion; no additional generation has been submitted.'), 60_000);
  try {
    const result = await higgsfield.subscribe('bytedance/seedance-2.5/text-to-video', {
      input: {
        prompt: 'A cinematic scene at sunset',
        duration: 5,
        resolution: '720p',
        aspect_ratio: '16:9',
        output_format: 'mp4',
        generate_audio: true,
      },
      withPolling: true,
    });
    // Only fixed validation messages and the successful URL are printed, never raw responses/errors.
    let url: string;
    try { url = completedVideo(result); }
    catch (error) { console.error((error as Error).message); process.exitCode = 1; return; }
    console.error('Generation completed successfully.');
    console.log(url);
  } catch (error: unknown) {
    const e = error as { statusCode?: number; name?: string };
    if (Number.isInteger(e.statusCode)) console.error(`Provider HTTP status: ${e.statusCode}`);
    if (e.statusCode === 401 || e.name === 'AuthenticationError') console.error('BLOCKED: Higgsfield rejected authentication. Check your local credentials.');
    else if (e.statusCode === 402 || e.statusCode === 403 || e.name === 'NotEnoughCreditsError') console.error('BLOCKED: Higgsfield reports insufficient API credits. Check billing for the account associated with this API key.');
    else if ([403,404,423,503].includes(e.statusCode ?? 0)) console.error('BLOCKED: Provider access or availability error. Verify Seedance 2.5 access in your account.');
    else if ([400,422].includes(e.statusCode ?? 0)) console.error('BLOCKED: Higgsfield rejected the request parameters. No successful video confirmed.');
    else console.error('BLOCKED: Request or polling failed/timed out. Outcome is unconfirmed; it may still be billable. Check the provider console before rerunning.');
    // Do not log SDK error objects: they may contain authorization headers.
    process.exitCode = 1;
  } finally { clearInterval(progress); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Setup failed; no successful generation confirmed.'); process.exitCode = 1; });
}
