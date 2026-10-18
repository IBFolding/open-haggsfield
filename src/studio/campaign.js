import {snapshot,validate,frame,end,duration} from './sequence.js';
// A manual time-window cut preserves source offsets and alignment on every track.
export function campaignCut(doc,{start=0,seconds,format='16:9',name='Alternate cut'}){
 validate(doc);start=frame(start);seconds=frame(seconds);
 if(!Number.isFinite(start)||!Number.isFinite(seconds)||start<0||seconds<=0||start+seconds>duration(doc)+.001)throw Error('Choose a range inside the existing sequence. Cuts never invent or repeat footage.');
 if(!['16:9','9:16','1:1'].includes(format))throw Error('Choose a supported format.');
 const result=snapshot(doc),stop=frame(start+seconds);
 result.clips=doc.clips.filter(c=>c.at<stop&&end(c)>start).map(c=>{const left=Math.max(start,c.at),right=Math.min(stop,end(c));return {...c,at:frame(left-start),in:frame(c.in+left-c.at),out:frame(c.in+right-c.at),fadeIn:0,fadeOut:0};});
 if(!result.clips.length)throw Error('This range contains no clips.');
 result.markers=doc.markers.filter(m=>m.at>=start&&m.at<stop).map(m=>({...m,at:frame(m.at-start)}));
 result.shots=result.shots.map(s=>({...s,status:'unreviewed'}));
 result.format=format;result.campaign={name:String(name).slice(0,120),sourceProject:doc.projectId,start,seconds,created:Date.now(),sourceAssets:Object.fromEntries(doc.assets.map(a=>[a.id,structuredClone(a)]))};
 result.past=[];result.future=[];return validate(result);
}
export function revisionReport(doc){return doc.shots.map(shot=>{const assets=doc.assets.filter(a=>a.shotId===shot.id),ids=new Set(assets.map(a=>a.id)),clips=doc.clips.filter(c=>ids.has(c.assetId));return {id:shot.id,name:shot.name,status:shot.status||'unreviewed',notes:shot.notes||'',takes:assets.length,clips:clips.length};});}
// Three-way source sync: keep local overrides and require reopening approved shots.
export function syncCampaign(master,cut){
 if(cut.campaign?.sourceProject!==master.projectId)throw Error('This cut belongs to another campaign.');
 const next=snapshot(cut),conflicts=[],updated=[];
 const base=cut.campaign.sourceAssets||{};
 next.assets=next.assets.map(a=>{const incoming=master.assets.find(x=>x.id===a.id);if(!incoming||JSON.stringify(incoming)===JSON.stringify(base[a.id]))return a;
 if(!base[a.id]||JSON.stringify(a)!==JSON.stringify(base[a.id])||next.shots.find(s=>s.id===a.shotId)?.status==='approved'){conflicts.push(a.name);return a;}
 if(next.clips.some(c=>c.assetId===a.id&&c.out>incoming.duration)){conflicts.push(a.name);return a;}
 updated.push(a.name);next.campaign.sourceAssets[a.id]=structuredClone(incoming);return structuredClone(incoming);});
 validate(next);return {state:next,conflicts,updated};
}
