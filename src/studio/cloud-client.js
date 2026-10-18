import {studioApi as api,jsonPost} from '../studio-api.js';
import {restoreMedia,saveMedia} from '../media-store.js';
import {snapshot} from './sequence.js';
export async function saveCloud(project,doc,onProgress){
 const {user,cloudReady}=await api('/account');if(!user)throw Error('Sign in from Account & keys first.');if(!cloudReady)throw Error('Cloud storage is not configured. Your local edit remains saved.');
 const next=snapshot(doc),files=new Map(await restoreMedia(next.assets.map(a=>a.mediaId))),mapped=new Map();
 let cursor=0,done=0,failure,mediaQueue=Promise.resolve();
 function mediaApi(path,options){const pending=mediaQueue.then(async()=>{for(let attempt=0;;attempt++){try{return await api(path,options);}catch(e){if(e.http!==409||!e.message.startsWith('Another operation')||attempt>=7)throw e;await new Promise(r=>setTimeout(r,Math.min(8000,1000*2**attempt)));}}});mediaQueue=pending.catch(()=>{});return pending;}

 async function upload(a){
  if(!mapped.has(a.mediaId)){
   const originalId=a.mediaId;
   const pending=(async()=>{
    let file=files.get(originalId);if(!file&&a.url){const r=await fetch(a.url);if(!r.ok)throw Error(`Relink ${a.name} before cloud save.`);file=await r.blob();}if(!file)throw Error(`Relink ${a.name} before cloud save.`);
    if(file.size>50*1024*1024)throw Error(`${a.name} exceeds the 50 MB cloud file limit.`);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const media=await mediaApi('/media/prepare',jsonPost({sourceId:'sha256-'+digest,mime:file.type,bytes:file.size}));
    if(!media.ready){const r=await fetch(media.url,{method:'PUT',headers:{'Content-Type':file.type},body:file});if(!r.ok)throw Error('Media upload failed. Your local edit is safe.');await mediaApi(`/media/${media.id}/complete`,jsonPost({}));}
    return media.id;
   })();mapped.set(originalId,pending);
  }
  a.mediaId=await mapped.get(a.mediaId);a.url=null;a.image=null;done++;onProgress(`Saved media ${done}/${next.assets.length}`);
 }
 async function worker(){while(!failure&&cursor<next.assets.length){const a=next.assets[cursor++];try{await upload(a);}catch(e){failure=e;}}}
 onProgress(`Saving ${next.assets.length} media files…`);
 await Promise.all(Array.from({length:Math.min(3,next.assets.length)},()=>worker()));if(failure)throw failure;
 const revision=doc.cloud?.userId===user.id?doc.cloud.revision:0;
 const result=await api(`/edits/${project.id}`,{...jsonPost({title:project.brief.title||'Untitled film',document:next,revision}),method:'PUT'});
 return {userId:user.id,revision:result.revision};
}
export async function loadCloud(id,onProgress){
 const result=await api('/edits/'+encodeURIComponent(id));const assets=[...new Map(result.document.assets.map(a=>[a.mediaId,a])).values()];let cursor=0,done=0,failure;
 async function worker(){while(!failure&&cursor<assets.length){const a=assets[cursor++];try{const {url}=await api('/media/'+encodeURIComponent(a.mediaId)),r=await fetch(url);if(!r.ok)throw Error('A media file could not be restored. Existing local projects are unchanged.');await saveMedia(a.mediaId,await r.blob());onProgress(`Restored media ${++done}/${assets.length}`);}catch(e){failure=e;}}}
 await Promise.all(Array.from({length:Math.min(3,assets.length)},()=>worker()));if(failure)throw failure;return result;
}
