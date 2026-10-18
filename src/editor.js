export const length = c => Math.round((c.out-c.in)*1000)/1000;
export const total = clips => clips.reduce((n,c)=>n+length(c),0);
export function positions(clips){let at=0;return clips.map(c=>{const item={...c,start:at,end:at+length(c)};at=item.end;return item;});}
export const time = n => `${String(Math.floor(n/60)).padStart(2,'0')}:${(n%60).toFixed(1).padStart(4,'0')}`;
export function seedEdit(project){if(!project.example)return {version:1,clips:[],past:[],future:[]};const tasks=project.tasks?.length?project.tasks:[];const shots=tasks.filter(t=>['shot','image'].includes(t.kind));return {version:1,clips:(shots.length?shots:[{id:'opening',name:'Night drive',image:'/assets/tokyo-car.png'},{id:'street',name:'City interlude',image:'/assets/tokyo-nights.png'},{id:'portrait',name:'The arrival',image:'/assets/neon-portrait.png'}]).map((t,i)=>({id:`clip-${i}`,assetId:t.id,name:t.name,kind:'sample',image:t.image||'/assets/tokyo-car.png',in:0,out:t.seconds||5,sourceDuration:t.seconds||5,take:1})),past:[],future:[]};}
function valid(clips){if(clips.some(c=>!Number.isFinite(c.in)||!Number.isFinite(c.out)||c.in<0||c.out>c.sourceDuration+.001||length(c)<.1))throw Error('Keep at least 0.1 seconds inside the source clip.');if(new Set(clips.map(c=>c.id)).size!==clips.length)throw Error('Duplicate clip ID.');}
export function editReducer(s,a){
 if(a.type==='undo'){if(!s.past.length)return s;return {...s,clips:s.past.at(-1),past:s.past.slice(0,-1),future:[s.clips,...s.future]};}
 if(a.type==='redo'){if(!s.future.length)return s;return {...s,clips:s.future[0],past:[...s.past,s.clips],future:s.future.slice(1)};}
 let clips=s.clips;const i=clips.findIndex(c=>c.id===a.id),c=clips[i];
 if(a.type==='add')clips=[...clips,a.clip];
 else if(!c)return s;
 else if(a.type==='trim')clips=clips.map(x=>x.id===c.id?{...x,in:Number(a.in),out:Number(a.out)}:x);
 else if(a.type==='split'){const at=Number(a.at);if(at<.1||at>length(c)-.1)throw Error('Move the playhead inside the clip to split it.');clips=[...clips.slice(0,i),{...c,out:c.in+at},{...c,id:a.newId,in:c.in+at},...clips.slice(i+1)];}
 else if(a.type==='delete')clips=clips.filter(x=>x.id!==c.id);
 else if(a.type==='reorder'){const target=clips.findIndex(x=>x.id===a.target);if(target<0||target===i)return s;clips=[...clips];clips.splice(i,1);clips.splice(target,0,c);}
 else if(a.type==='move'){const j=i+a.direction;if(j<0||j>=clips.length)return s;clips=[...clips];[clips[i],clips[j]]=[clips[j],clips[i]];}
 else if(a.type==='replaceMedia'){
  if(JSON.stringify(c)!==a.fingerprint)throw Error('This clip changed. Select its range again.');
  const span=a.to-a.from;
  if(!Number.isFinite(a.from)||!Number.isFinite(a.to)||a.from<0||a.to>length(c)||span<.1||!a.media||a.media.kind!=='video'||a.media.sourceDuration<span)throw Error('The replacement must cover the entire selected range.');
  const pieces=[];if(a.from>0)pieces.push({...c,out:c.in+a.from});
  pieces.push({...a.media,id:a.newId,in:0,out:span,take:(c.take||1)+1,fix:a.prompt||'Imported replacement',simulated:false});
  if(a.to<length(c))pieces.push({...c,id:`${a.newId}-after`,in:c.in+a.to});
  clips=[...clips.slice(0,i),...pieces,...clips.slice(i+1)];
 }
 else if(a.type==='replace'){
  if(JSON.stringify(c)!==a.fingerprint)throw Error('This clip changed. Create a new take for the current edit.');
  if(!a.prompt?.trim()||a.from<0||a.to>length(c)||a.to-a.from<.1)throw Error('Choose a valid range and describe the fix.');
  const start=c.in+a.from,end=c.in+a.to;
  const pieces=[];if(a.from>.001)pieces.push({...c,out:start});
  pieces.push({...c,id:a.newId,in:start,out:end,take:(c.take||1)+1,fix:a.prompt,simulated:true});
  if(length(c)-a.to>.001)pieces.push({...c,id:`${a.newId}-after`,in:end});
  clips=[...clips.slice(0,i),...pieces,...clips.slice(i+1)];
 }else return s;
 valid(clips);return {...s,clips,past:[...s.past,s.clips].slice(-40),future:[]};
}
export function loadEdit(project,storage){try{const s=JSON.parse(storage.getItem(`open-higgs-edit-${project.id}`));if(s?.version===1&&Array.isArray(s.clips)&&Array.isArray(s.past)&&Array.isArray(s.future)){valid(s.clips);return s;}}catch{}return seedEdit(project);}
