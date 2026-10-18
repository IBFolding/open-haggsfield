import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {validate,snapshot} from '../src/studio/sequence.js';
import {transact} from './store.mjs';
const MAX=50*1024*1024,CAP=1024*1024*1024;
const mimeTypes=new Set(['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/wav','audio/x-wav','audio/mpeg','audio/mp4','audio/ogg']);
export function storageClient(env){if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return null;return createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('haggsfield-media');}
export function mountCloud(app,{db,storage,locked}){
 const unavailable=(req,res,next)=>{if(db.kind!=='postgres'||!storage)return res.status(503).json({error:'Cloud storage is not configured. Your local edit is safe.'});next();};
 app.use(['/api/studio/edits','/api/studio/media'],unavailable);
 // Send the HTTP receipt only after the database lease has been released.
 // Otherwise the next metadata request races the preceding response's cleanup.
 const mediaLocked=async(req,res,fn)=>{let status=200,body;const reply={status(value){status=value;return reply;},json(value){body=value;return value;}};await locked('media:'+req.user.id,()=>fn(reply));return res.status(status).json(body);};
 app.post('/api/studio/media/prepare',async(req,res)=>mediaLocked(req,res,async reply=>{
  if(req.user.billing!=='active'||req.user.billing_hold||req.user.access_until<=Date.now())return reply.status(402).json({error:'An active membership is required for cloud uploads.'});
  const {sourceId,mime,bytes}=req.body||{};if(typeof sourceId!=='string'||sourceId.length>200||!sourceId||!mimeTypes.has(mime)||!Number.isSafeInteger(bytes)||bytes<1||bytes>MAX)return reply.status(400).json({error:'Choose a supported media file under 50 MB.'});
  const existing=await db.prepare('SELECT * FROM media WHERE user_id=? AND source_id=?').get(req.user.id,sourceId);
  if(existing&&(Number(existing.expected_bytes)!==bytes||existing.mime!==mime))return reply.status(409).json({error:'This media reference belongs to a different file.'});
  if(existing?.state==='ready')return reply.json({id:existing.id,ready:true});
  if(existing){
   // A lost upload/completion response must not force a second PUT over the original object.
   const {data,error}=await storage.info(existing.object_path);
   if(!error&&data){if(Number(data.size)!==bytes||data.contentType!==mime)return reply.status(409).json({error:'Stored media does not match the declared file.'});await db.prepare("UPDATE media SET state='ready',bytes=? WHERE id=? AND user_id=?").run(bytes,existing.id,req.user.id);return reply.json({id:existing.id,ready:true});}
  }
  const id=existing?.id||randomUUID(),path=existing?.object_path||`${req.user.id}/${id}`;
  if(!existing)await transact(db,async()=>{const used=Number((await db.prepare('SELECT COALESCE(SUM(bytes),0) total FROM media WHERE user_id=?').get(req.user.id)).total);if(used+MAX>CAP)throw Object.assign(Error('Cloud media limit reached (1 GB).'),{http:409});await db.prepare('INSERT INTO media(id,user_id,source_id,object_path,mime,bytes,expected_bytes,state,created) VALUES (?,?,?,?,?,?,?,?,?)').run(id,req.user.id,sourceId,path,mime,MAX,bytes,'pending',Date.now());});
  await db.prepare('UPDATE media SET created=? WHERE id=? AND user_id=?').run(Date.now(),id,req.user.id);
  const {data,error}=await storage.createSignedUploadUrl(path,{upsert:false});if(error)throw Error('Upload preparation failed.');reply.json({id,ready:false,url:data.signedUrl});
 }));
 app.post('/api/studio/media/:id/complete',async(req,res)=>mediaLocked(req,res,async reply=>{
  const item=await db.prepare('SELECT * FROM media WHERE id=? AND user_id=?').get(req.params.id,req.user.id);if(!item)return reply.status(404).json({error:'Media not found.'});if(item.state==='ready')return reply.json({id:item.id,ready:true});
  const {data,error}=await storage.info(item.object_path);if(error)return reply.status(409).json({error:'Upload is not confirmed yet. Retry completion, not generation.'});
  if(Number(data.size)!==Number(item.expected_bytes)||data.contentType!==item.mime){await storage.remove([item.object_path]);await db.prepare('DELETE FROM media WHERE id=? AND user_id=?').run(item.id,req.user.id);return reply.status(400).json({error:'Uploaded media did not match its declared size or type.'});}
  await db.prepare("UPDATE media SET state='ready',bytes=? WHERE id=? AND user_id=?").run(Number(data.size),item.id,req.user.id);reply.json({id:item.id,ready:true});
 }));
 app.get('/api/studio/media/:id',async(req,res)=>{
  const item=await db.prepare("SELECT object_path FROM media WHERE id=? AND user_id=? AND state='ready'").get(req.params.id,req.user.id);if(!item)return res.status(404).json({error:'Media not found.'});const {data,error}=await storage.createSignedUrl(item.object_path,300);if(error)throw Error('Could not open private media.');res.json({url:data.signedUrl});
 });
 app.get('/api/studio/edits',async(req,res)=>res.json({edits:await db.prepare('SELECT id,title,revision,updated FROM edits WHERE user_id=? ORDER BY updated DESC LIMIT 200').all(req.user.id)}));
 app.get('/api/studio/edits/:id',async(req,res)=>{const item=await db.prepare('SELECT id,title,document,revision,updated FROM edits WHERE id=? AND user_id=?').get(req.params.id,req.user.id);if(!item)return res.status(404).json({error:'Cloud edit not found.'});res.json(item);});
 app.put('/api/studio/edits/:id',async(req,res)=>{
  if(req.user.billing!=='active'||req.user.billing_hold||req.user.access_until<=Date.now())return res.status(402).json({error:'An active membership is required to save cloud edits.'});
  const {title,document,revision}=req.body||{};if(!/^[a-zA-Z0-9-]{1,100}$/.test(req.params.id)||typeof title!=='string'||!title.trim()||title.length>150||!Number.isSafeInteger(revision)||revision<0)return res.status(400).json({error:'Invalid project revision.'});
  try{validate(document);if(document.assets.length>1000||document.clips.length>5000)throw Error();}catch{return res.status(400).json({error:'Invalid studio document.'});}
  const clean=snapshot(document);delete clean.cloud;clean.projectId=req.params.id;
  // Cloud documents reference only confirmed account-owned objects, never transient URLs.
  for(const a of clean.assets){const found=await db.prepare("SELECT id FROM media WHERE id=? AND user_id=? AND state='ready'").get(a.mediaId,req.user.id);if(!found)return res.status(400).json({error:'Upload all source media before saving this edit.'});a.url=null;a.image=null;}
  const next=await transact(db,async()=>{const current=await db.prepare('SELECT revision FROM edits WHERE id=? AND user_id=?').get(req.params.id,req.user.id);if(Number(current?.revision||0)!==revision)throw Object.assign(Error('This cloud edit changed elsewhere. Restore the newer copy before overwriting.'),{http:409});if(!current&&Number((await db.prepare('SELECT count(*) total FROM edits WHERE user_id=?').get(req.user.id)).total)>=200)throw Object.assign(Error('Cloud checkpoint limit reached (200 projects).'),{http:409});const value=revision+1;await db.prepare('INSERT INTO edits(id,user_id,title,document,revision,updated) VALUES (?,?,?,?::text::jsonb,?,?) ON CONFLICT(user_id,id) DO UPDATE SET title=excluded.title,document=excluded.document,revision=excluded.revision,updated=excluded.updated').run(req.params.id,req.user.id,title.trim(),JSON.stringify(clean),value,Date.now());return value;});res.json({revision:next});
 });
}

export async function cleanupCloud(db,storage,locked){if(db.kind!=='postgres'||!storage)return;const expired=await db.prepare("SELECT id,user_id FROM media WHERE state='pending' AND created<? LIMIT 10").all(Date.now()-130*60000);for(const item of expired){try{await locked('media:'+item.user_id,async()=>{const fresh=await db.prepare("SELECT object_path FROM media WHERE id=? AND state='pending' AND created<?").get(item.id,Date.now()-130*60000);if(!fresh)return;const {error}=await storage.remove([fresh.object_path]);if(!error)await db.prepare("DELETE FROM media WHERE id=? AND state='pending'").run(item.id);});}catch{}}}
