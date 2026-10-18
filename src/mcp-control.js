import {newProject,makePlan,projectReducer} from './projects.js';
import {loadEdit,editReducer} from './editor.js';
import {readStudio,saveStudio} from './studio/storage.js';
import {reduce as reduceStudio} from './studio/sequence.js';
export function executeControl(command,{getStore,saveStore,storage,notifyEdit,navigate}){
 const {op,args={}}=command;const s=getStore();const p=s.projects.find(p=>p.id===args.projectId);
 const clean=p=>({...p,brief:{...p.brief,refs:p.brief.refs.map(({id,name})=>({id,name}))}});
 const apply=a=>{const next=projectReducer(getStore(),a);saveStore(next);return next;};
 if(op==='status')return {name:'Open Haggsfield',mode:'local demo',paidGeneration:false,projectCount:s.projects.length};
 if(op==='list')return {projects:s.projects.map(p=>({id:p.id,title:p.brief.title,status:p.status,referenceCount:p.brief.refs.length}))};
 if(op==='create'){const project=newProject(crypto.randomUUID(),Date.now(),args.brief);apply({type:'create',project});return clean(project);}
 if(!p)throw Error('Project not found. List projects first.');
 if(op==='get')return clean(p);
 if(op==='update'){apply({type:'edit',id:p.id,brief:args.brief});return clean(getStore().projects.find(x=>x.id===p.id));}
 if(op==='reference'){
  if(p.brief.refs.length>=3)throw Error('Maximum three references.');
  if(!/^data:image\/(png|jpeg|webp);base64,/.test(args.url)||args.url.length>1_400_000)throw Error('Invalid reference image.');
  const ref={id:crypto.randomUUID(),name:args.name,url:args.url};apply({type:'edit',id:p.id,brief:{refs:[...p.brief.refs,ref]}});return {referenceId:ref.id,name:ref.name};
 }
 if(op==='plan')return {mode:'simulation',...makePlan(p.brief)};
 if(op==='open'){navigate(`${args.editor?'editor':'project'}/${p.id}`);return {opened:p.id};}
 if(op==='production'){
  const allowed=['approve','pause','resume','cancel','tick'];if(!allowed.includes(args.action))throw Error('Unsupported demo action.');
  const next=apply({type:args.action,id:p.id,taskId:args.taskId});return {mode:'simulation',project:clean(next.projects.find(x=>x.id===p.id)),balance:next.balance};
 }
 if(op==='timeline'||op==='edit'){
  if(storage.getItem(`open-haggsfield-studio-v2-${p.id}`)){
   const old=readStudio(p,storage),cleanStudio=s=>({...s,assets:s.assets.map(({url,image,...a})=>a),past:[],future:[],undoCount:s.past.length,redoCount:s.future.length});
   if(op==='timeline')return cleanStudio(old);const a=args.action;
   if(!['shotReview','trim','split','delete','move','undo','redo'].includes(a.type))throw Error('Unsupported multitrack edit. Use move with trackId and timeline time instead of reorder.');
   const clip=old.clips.find(c=>c.id===a.id);
   const next=reduceStudio(old,{...a,...(a.type==='split'?{at:(clip?.at||0)+a.at}:{}),newId:crypto.randomUUID()});saveStudio(next,storage);notifyEdit(p.id,next);return cleanStudio(next);
  }
  const old=loadEdit(p,storage);if(op==='timeline')return old;
  const a=args.action;if(!['trim','split','delete','reorder','undo','redo'].includes(a.type))throw Error('Unsupported timeline edit.');
  if(a.id&&!old.clips.some(c=>c.id===a.id))throw Error('Clip not found.');
  const next=editReducer(old,{...a,newId:crypto.randomUUID()});storage.setItem(`open-higgs-edit-${p.id}`,JSON.stringify(next));notifyEdit(p.id,next);return next;
 }
 throw Error('Unknown MCP operation.');
}
