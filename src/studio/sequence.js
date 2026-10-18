export const FPS=30;
export const frame=n=>Math.round(Number(n)*FPS)/FPS;
export const span=c=>frame(c.out-c.in);
export const end=c=>frame(c.at+span(c));
export const duration=s=>Math.max(0,...s.clips.map(end));
export const uid=()=>crypto.randomUUID();
export const clock=n=>{const f=Math.round(Math.max(0,n)*FPS);return `${String(Math.floor(f/1800)).padStart(2,'0')}:${String(Math.floor(f/30)%60).padStart(2,'0')}:${String(f%30).padStart(2,'0')}`;};
const tracks=()=>[{id:'v2',name:'V2 · Overlay',kind:'video',locked:false,muted:false,hidden:false},{id:'v1',name:'V1 · Picture',kind:'video',locked:false,muted:false,hidden:false},{id:'a1',name:'A1 · Dialogue',kind:'audio',locked:false,muted:false,hidden:false},{id:'a2',name:'A2 · Music',kind:'audio',locked:false,muted:false,hidden:false}];
export function migrate(project,old){
 const assets=[],shots=[],clips=[];let at=0;
 for(const [i,c] of old.clips.entries()){
  const id=`legacy-${c.assetId}-${c.take||1}`,shotId=`shot-${i}`;
  if(!assets.some(a=>a.id===id))assets.push({id,mediaId:c.assetId,name:c.name,kind:c.kind==='sample'?'image':c.kind,category:c.kind==='sample'?'references':'footage',url:c.sourceUrl||c.image||null,image:c.image||null,fileName:c.fileName,duration:c.sourceDuration,status:'unreviewed',tags:[],sceneId:'scene-1',shotId,simulated:Boolean(c.simulated),take:c.take||1,prompt:c.fix||''});
  shots.push({id:shotId,sceneId:'scene-1',name:`Shot ${String(i+1).padStart(2,'0')}`,notes:''});
  clips.push({id:c.id,assetId:id,trackId:'v1',at,in:c.in,out:c.out,gain:1,fadeIn:0,fadeOut:0});at=frame(at+c.out-c.in);
 }
 for(const r of project.brief?.refs||[]){if(!shots.length)shots.push({id:'references',sceneId:'scene-1',name:'References',notes:''});assets.push({id:`reference-${r.id}`,mediaId:r.id,name:r.name,kind:'image',category:'references',url:r.url,duration:5,status:'unreviewed',tags:[],sceneId:'scene-1',shotId:shots[0].id,take:1});}
 if(!shots.length)shots.push({id:'shot-0',sceneId:'scene-1',name:'Shot 01',notes:''});
 return {version:2,projectId:project.id,scenes:[{id:'scene-1',name:'Scene 01',notes:''}],shots,assets,tracks:tracks(),clips,markers:[],renderLinks:[],past:[],future:[]};
}
export function snapshot(s){const {past,future,...value}=s;return structuredClone(value);}
export function validate(s){
 if(s.version!==2||!Array.isArray(s.assets)||!Array.isArray(s.tracks)||!Array.isArray(s.clips)||!Array.isArray(s.scenes)||!Array.isArray(s.shots)||!Array.isArray(s.markers)||!Array.isArray(s.renderLinks))throw Error('Invalid studio project.');
 for(const list of [s.assets,s.tracks,s.clips,s.scenes,s.shots,s.markers])if(new Set(list.map(x=>x.id)).size!==list.length)throw Error('Duplicate project identifiers.');
 for(const a of s.assets)if(!['video','audio','image'].includes(a.kind)||!Number.isFinite(a.duration)||a.duration<1/FPS||!s.scenes.some(x=>x.id===a.sceneId)||!s.shots.some(x=>x.id===a.shotId&&x.sceneId===a.sceneId))throw Error('Invalid library asset.');
 for(const c of s.clips)if(c.framing&&(!['fit','fill'].includes(c.framing.mode)||![c.framing.x,c.framing.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Invalid clip framing.');
 for(const c of s.clips){const a=s.assets.find(a=>a.id===c.assetId),t=s.tracks.find(t=>t.id===c.trackId);if(!a||!t||(a.kind==='audio')!==(t.kind==='audio')||![c.at,c.in,c.out,c.gain,c.fadeIn,c.fadeOut].every(Number.isFinite)||c.at<0||c.in<0||c.out>a.duration+.001||span(c)<1/FPS-.001||c.gain<0||c.gain>1||c.fadeIn<0||c.fadeOut<0||c.fadeIn+c.fadeOut>span(c)+.001)throw Error('Keep clips within their source duration, with valid sound levels and fades.');}
 for(const t of s.tracks){const cs=s.clips.filter(c=>c.trackId===t.id).sort((a,b)=>a.at-b.at);for(let i=1;i<cs.length;i++)if(cs[i].at<end(cs[i-1])-.001)throw Error('Clips overlap on this track. Choose Overwrite or move to another track.');}
 return s;
}
function unlocked(s,id){const t=s.tracks.find(t=>t.id===id);if(!t)throw Error('Select a track.');if(t.locked)throw Error('Unlock this track before editing it.');return t;}
function cutRange(clips,trackId,start,stop,id){return clips.flatMap(c=>{
 if(c.trackId!==trackId||end(c)<=start||c.at>=stop)return [c];const result=[];
 if(c.at<start)result.push({...c,out:frame(c.in+start-c.at),fadeIn:0,fadeOut:0});
 if(end(c)>stop)result.push({...c,id:`${id}-${c.id}-tail`,at:stop,in:frame(c.in+stop-c.at),fadeIn:0,fadeOut:0});return result;
});}
export function reduce(s,a){
 if(a.type==='undo'){if(!s.past.length)return s;return {...s.past.at(-1),past:s.past.slice(0,-1),future:[snapshot(s),...s.future]};}
 if(a.type==='redo'){if(!s.future.length)return s;return {...s.future[0],past:[...s.past,snapshot(s)],future:s.future.slice(1)};}
 let n=snapshot(s);const c=n.clips.find(c=>c.id===a.id);
 switch(a.type){
 case 'reframe':if(!c)throw Error('Select a clip.');if(!['fit','fill'].includes(a.mode)||![a.x,a.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid framing.');c.framing={mode:a.mode,x:a.x,y:a.y};break;
 case 'shotReview':{const shot=n.shots.find(x=>x.id===a.id);if(!shot)throw Error('Select a shot.');if(!['approved','needs-work','unreviewed'].includes(a.status))throw Error('Invalid review status.');shot.status=a.status;shot.notes=String(a.notes??shot.notes??'').slice(0,2000);break;}
 case 'scene':n.scenes.push({id:a.id,name:a.name.trim()||'Untitled scene',notes:''});break;
 case 'shot':if(!n.scenes.some(x=>x.id===a.sceneId))throw Error('Select a scene.');n.shots.push({id:a.id,sceneId:a.sceneId,name:a.name.trim()||'Untitled shot',notes:''});break;
 case 'asset':if(n.assets.some(x=>x.id===a.asset.id))return s;n.assets.push(a.asset);break;
 case 'assetMeta':n.assets=n.assets.map(x=>x.id===a.id?{...x,...Object.fromEntries(Object.entries(a.patch).filter(([k])=>['name','category','status','tags','sceneId','shotId','notes','url','mediaId'].includes(k)))}:x);break;
 case 'track':n.tracks=n.tracks.map(t=>t.id===a.id?{...t,...a.patch,id:t.id,kind:t.kind}:t);break;
 case 'addTrack':n.tracks.push({id:a.id,name:a.name,kind:a.kind,locked:false,muted:false,hidden:false});break;
 case 'insert':{
  unlocked(n,a.trackId);const asset=n.assets.find(x=>x.id===a.assetId);if(!asset)throw Error('Choose a take from the library.');
  const start=frame(a.at),sourceIn=frame(a.in||0),sourceOut=frame(a.out??Math.min(asset.duration,asset.kind==='image'?5:asset.duration));const len=frame(sourceOut-sourceIn);
  if(a.mode==='overwrite')n.clips=cutRange(n.clips,a.trackId,start,frame(start+len),a.id);
  if(a.mode==='insert')n.clips=n.clips.flatMap(x=>{if(x.trackId!==a.trackId)return [x];if(x.at>=start)return [{...x,at:frame(x.at+len)}];if(end(x)>start)return [{...x,out:frame(x.in+start-x.at),fadeIn:0,fadeOut:0},{...x,id:`${a.id}-${x.id}-split`,at:frame(start+len),in:frame(x.in+start-x.at),fadeIn:0,fadeOut:0}];return [x];});
  n.clips.push({id:a.id,assetId:a.assetId,trackId:a.trackId,at:start,in:sourceIn,out:sourceOut,gain:1,fadeIn:0,fadeOut:0});break;
 }
 case 'delete':case 'trim':case 'split':case 'move':case 'sound':case 'replace':{
  if(!c)throw Error('Select a timeline clip.');unlocked(n,c.trackId);
  if(a.type==='delete'){n.clips=n.clips.filter(x=>x.id!==c.id);if(a.ripple)n.clips=n.clips.map(x=>x.trackId===c.trackId&&x.at>=end(c)?{...x,at:frame(x.at-span(c))}:x);}
  if(a.type==='trim'){const oldEnd=end(c),oldSpan=span(c);c.in=frame(a.in);c.out=frame(a.out);c.fadeIn=0;c.fadeOut=0;if(a.ripple){const delta=span(c)-oldSpan;n.clips=n.clips.map(x=>x.id!==c.id&&x.trackId===c.trackId&&x.at>=oldEnd?{...x,at:frame(x.at+delta)}:x);}}
  if(a.type==='split'){const at=frame(a.at);if(at<=c.at||at>=end(c))throw Error('Place the playhead inside the selected clip.');const out=c.out;c.out=frame(c.in+at-c.at);c.fadeIn=0;c.fadeOut=0;n.clips.push({...c,id:a.newId,at,in:c.out,out});}
  if(a.type==='move'){unlocked(n,a.trackId);c.trackId=a.trackId;c.at=frame(a.at);}
  if(a.type==='sound'){c.gain=Number(a.gain);c.fadeIn=Number(a.fadeIn);c.fadeOut=Number(a.fadeOut);}
  if(a.type==='replace'){
   if(JSON.stringify(c)!==a.fingerprint)throw Error('The selected clip changed. Mark the range again.');const start=frame(a.from),stop=frame(a.to),sourceIn=frame(a.sourceIn??0),asset=n.assets.find(x=>x.id===a.assetId);
   if(!asset||![start,stop,sourceIn].every(Number.isFinite)||sourceIn<0||start<c.at||stop>end(c)||stop-start<1/FPS-.001||asset.duration+.001<frame(sourceIn+stop-start))throw Error('Replacement must cover the marked range.');
   n.clips=cutRange(n.clips,c.trackId,start,stop,a.newId);n.clips.push({id:a.newId,assetId:asset.id,trackId:c.trackId,at:start,in:sourceIn,out:frame(sourceIn+stop-start),gain:c.gain,fadeIn:0,fadeOut:0,...(c.framing?{framing:structuredClone(c.framing)}:{})});
  }break;
 }
 case 'marker':if(!Number.isFinite(a.at)||a.at<0)throw Error('Invalid marker time.');n.markers.push({id:a.id,at:frame(a.at),name:a.name||'Review note'});break;
 case 'deleteMarker':n.markers=n.markers.filter(m=>m.id!==a.id);break;
 case 'linkJob':if(!n.renderLinks.some(x=>x.jobId===a.link.jobId))n.renderLinks.push(a.link);break;
 default:return s;
 }
 // Enforce approval at the shared reducer boundary, including indirect ripple edits.
 if(a.type!=='shotReview')for(const shot of s.shots.filter(x=>x.status==='approved')){
  const ids=new Set(s.assets.filter(x=>x.shotId===shot.id).map(x=>x.id));
  const before=s.clips.filter(x=>ids.has(x.assetId)),after=n.clips.filter(x=>ids.has(x.assetId));
  const used=new Set(before.map(x=>x.assetId));
  const sources=state=>state.assets.filter(x=>used.has(x.id));
  const trackIds=new Set(before.map(x=>x.trackId));
  const outputTracks=state=>state.tracks.filter(x=>trackIds.has(x.id)).map(({id,muted,hidden})=>({id,muted,hidden}));
  if(JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(sources(s))!==JSON.stringify(sources(n))||JSON.stringify(outputTracks(s))!==JSON.stringify(outputTracks(n)))throw Error(`Reopen ${shot.name} for revision before changing its approved edit.`);
 }
 validate(n);return {...n,past:[...s.past,snapshot(s)].slice(-40),future:[]};
}
export function snap(s,time,{enabled=true,exclude,threshold=.15}={}){const t=Math.max(0,frame(time));if(!enabled)return t;const points=[0,...s.markers.map(m=>m.at),...s.clips.filter(c=>c.id!==exclude).flatMap(c=>[c.at,end(c)])];const hit=points.filter(x=>Math.abs(x-t)<=threshold).sort((a,b)=>Math.abs(a-t)-Math.abs(b-t))[0];return hit??t;}
export function activeClips(s,t){return s.clips.filter(c=>t>=c.at&&t<end(c));}
export function gainAt(c,t){const local=t-c.at,remain=end(c)-t;return c.gain*Math.max(0,Math.min(1,c.fadeIn?local/c.fadeIn:1,c.fadeOut?remain/c.fadeOut:1));}
