// Device-local, real-time export. No uploads or provider requests.
export function exportPlan(clips, urls={}) {
 if (!clips.length) throw Error('Add footage before exporting.');
 return clips.map(c=>{
  if(c.simulated) throw Error('Remove or undo demo repairs before exporting a movie.');
  const src=c.kind==='video'?(urls[c.assetId]||c.sourceUrl):c.image;
  if(!src) throw Error(`Relink ${c.name} before exporting.`);
  if(!Number.isFinite(c.in)||!Number.isFinite(c.out)||c.out<=c.in) throw Error('Invalid clip range.');
  return {...c,src};
 });
}
function ready(el,event,signal){return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>finish(Error('Media loading timed out. Relink a downloaded copy.')),20000);
 const ok=()=>finish(),bad=()=>finish(Error('Media could not load. Download and import a local copy.')),abort=()=>finish(Error('Export canceled.'));
 function finish(error){clearTimeout(timer);el.removeEventListener(event,ok);el.removeEventListener('error',bad);signal?.removeEventListener('abort',abort);error?reject(error):resolve();}
 el.addEventListener(event,ok,{once:true});el.addEventListener('error',bad,{once:true});signal?.addEventListener('abort',abort,{once:true});
 if(signal?.aborted)abort();
 });}
export async function exportMovie(clips,urls,{signal,onProgress=()=>{}}={}){
 const plan=exportPlan(clips,urls);
 if(!window.MediaRecorder)throw Error('This browser cannot record movies. Use a recent Chrome browser.');
 const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(x=>MediaRecorder.isTypeSupported(x));
 if(!mime)throw Error('No supported movie encoder is available.');
 const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
 const ctx=canvas.getContext('2d'),audio=new AudioContext(),dest=audio.createMediaStreamDestination();
 let recorder,stream;const media=[],chunks=[];let finished=0;
 const duration=plan.reduce((n,c)=>n+c.out-c.in,0);
 const abortCheck=()=>{if(signal?.aborted)throw Error('Export canceled.');if(document.hidden)throw Error('Export stopped because this tab became hidden. Keep it visible and try again.');};
 try{
 await audio.resume();
 // Keep a clocked audio track even for silent storyboard shots.
 const silence=audio.createOscillator(),gain=audio.createGain();gain.gain.value=0;silence.connect(gain).connect(dest);silence.start();
 // Preload and seek before recording, avoiding gaps between shots.
 for(const clip of plan){
  abortCheck();const el=document.createElement(clip.kind==='video'?'video':'img');el.crossOrigin='anonymous';
  media.push({el,clip});if(clip.kind==='video'){el.preload='auto';el.playsInline=true;}
  const loaded=ready(el,clip.kind==='video'?'loadeddata':'load',signal);el.src=clip.src;await loaded;
  if(clip.kind==='video'){
   if(clip.out>el.duration+.05)throw Error(`${clip.name} is shorter than its selected range.`);
   if(clip.in>0){const seek=ready(el,'seeked',signal);el.currentTime=clip.in;await seek;}
   audio.createMediaElementSource(el).connect(dest);
  }
 }
 function draw(el){const w=el.videoWidth||el.naturalWidth,h=el.videoHeight||el.naturalHeight,scale=Math.min(1280/w,720/h);ctx.fillStyle='#000';ctx.fillRect(0,0,1280,720);ctx.drawImage(el,(1280-w*scale)/2,(720-h*scale)/2,w*scale,h*scale);}
 draw(media[0].el);stream=canvas.captureStream(30);for(const track of dest.stream.getAudioTracks())stream.addTrack(track);
 recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});
 let recordingError;recorder.onerror=e=>{recordingError=e.error||Error('Movie encoding failed.');};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(250);
 for(const {el,clip} of media){
  abortCheck();if(clip.kind==='video')await el.play();const start=performance.now(),seconds=clip.out-clip.in;
  await new Promise((resolve,reject)=>{let lastTime=el.currentTime,lastMotion=performance.now();function frame(){try{abortCheck();if(recordingError)throw recordingError;
   const elapsed=clip.kind==='video'?el.currentTime-clip.in:(performance.now()-start)/1000;
   if(clip.kind==='video'&&el.currentTime!==lastTime){lastTime=el.currentTime;lastMotion=performance.now();}
   if(clip.kind==='video'&&performance.now()-lastMotion>5000)throw Error('Playback stalled. Relink a local copy and retry export.');
   if(el.ended&&elapsed<seconds-.1)throw Error('Footage ended before the selected cut.');
   draw(el);onProgress(Math.min(1,(finished+elapsed)/duration));if(elapsed>=seconds-.02){resolve();return;}requestAnimationFrame(frame);
  }catch(e){reject(e);}}frame();});
  if(clip.kind==='video')el.pause();finished+=seconds;
 }
 await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});if(recordingError)throw recordingError;
 const blob=new Blob(chunks,{type:recorder.mimeType});if(!blob.size)throw Error('The movie encoder returned an empty file.');onProgress(1);return {blob,extension:mime.includes('mp4')?'mp4':'webm'};
 }finally{
 if(recorder&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(t=>t.stop());dest.stream.getTracks().forEach(t=>t.stop());for(const {el} of media){el.pause?.();el.removeAttribute('src');el.load?.();}await audio.close();
 }
}
