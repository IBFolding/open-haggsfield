import {syncCampaign} from './campaign.js';
import {loadEdit} from '../editor.js';
import {migrate,validate,snapshot} from './sequence.js';
const key=id=>`open-haggsfield-studio-v2-${id}`;
export function readStudio(project,storage=localStorage){const raw=storage.getItem(key(project.id));if(raw){const s=JSON.parse(raw);validate(s);return {...s,past:s.past||[],future:s.future||[]};}return migrate(project,loadEdit(project,storage));}
export function saveStudio(s,storage=localStorage){storage.setItem(key(s.projectId),JSON.stringify(s));}
export function versions(id,storage=localStorage){try{return JSON.parse(storage.getItem(key(id)+'-versions'))||[];}catch{return [];}}
export function saveVersion(s,name,storage=localStorage){const list=versions(s.projectId,storage);const v={id:crypto.randomUUID(),name:name||'Saved version',created:Date.now(),state:snapshot(s)};storage.setItem(key(s.projectId)+'-versions',JSON.stringify([v,...list].slice(0,15)));return v;}
// Move embedded stills out of edit history without losing any source version.
export async function externalizeStudio(s,persist){const next=structuredClone(s),mapped=new Map();for(const state of [next,...(next.past||[]),...(next.future||[])])for(const a of state.assets||[]){if(!a.url?.startsWith('data:image/'))continue;let id=mapped.get(a.url);if(!id){id=crypto.randomUUID();await persist(id,a.url);mapped.set(a.url,id);}a.mediaId=id;a.url=null;}return next;}

export function parseBackup(text,projectId){
 if(typeof text!=='string'||text.length>10000000)throw Error('Choose a studio JSON backup under 10 MB.');
 const value=JSON.parse(text);validate(value);
 if(value.assets.length>10000||value.clips.length>10000)throw Error('This backup is too large.');
 return {...snapshot(value),projectId,past:[],future:[]};
}

export function syncCampaignVersions(master,storage=localStorage){
 if(master.campaign)throw Error('Restore the master edit before syncing its campaign.');
 const list=versions(master.projectId,storage),reports=[];
 const next=list.map(v=>{if(!v.state.campaign)return v;const result=syncCampaign(master,v.state);reports.push({name:v.name,updated:result.updated,conflicts:result.conflicts});return {...v,state:result.state};});
 storage.setItem(key(master.projectId)+'-versions',JSON.stringify(next));return reports;
}
