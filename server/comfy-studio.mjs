import{randomUUID}from'node:crypto';
import{hash}from'./auth.mjs';
import{transact}from'./store.mjs';
import{createComfyClient}from'./comfy.mjs';
import{minimaxTake}from'../workflows/comfy/minimax-take.mjs';
import{mp4Metadata}from'./video-metadata.mjs';
const endpoint='comfy/minimax-h3',active="('submitting','queued','in_progress','unknown')",MAX=50*1024*1024;
const fail=(message,http=400)=>Object.assign(Error(message),{http});
const identity=u=>hash('comfy:'+u.id);
const entitled=u=>u.billing==='active'&&!u.billing_hold&&u.access_until>Date.now();
// Conservative estimate from Comfy's Oct 17 catalog. Operator must enable only
// after checking current pricing. BYOK is charged by Comfy; no platform credits.
export function comfyEstimate(recipe){const rate=recipe.model==='MiniMax H3'?{'768P':.1287,'2K':.1859}[recipe.resolution]:recipe.model==='MiniMax H3 Max'?{'480P':.0715,'768P':.1144}[recipe.resolution]:{'480P':.03575,'768P':.0572}[recipe.resolution];return Math.ceil(rate*recipe.duration*100);}
export function mountComfy(app,{db,vault,storage,locked,env,clientFactory=createComfyClient}){
 const enabled=()=>env.COMFY_GENERATION_ENABLED==='true'&&Boolean(storage);
 const credential=async user=>{const value=await vault.get(identity(user));return value?.startsWith('comfy:')?value.slice(6):null;};
 const inFlight=async user=>await db.prepare(`SELECT id FROM jobs WHERE user_id=? AND status IN ${active} LIMIT 1`).get(user.id);
 const recipeFor=b=>{try{return minimaxTake({prompt:b.prompt,seconds:b.duration,model:b.model,resolution:b.resolution,ratio:b.ratio,seed:b.seed,firstFrame:b.firstFrame});}catch(e){throw fail(e.message);}};
 const fingerprint=(projectId,recipe)=>hash(JSON.stringify({projectId,recipe}));
 const owned=async(req)=>{const j=await db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=? AND endpoint=?').get(req.params.id,req.user.id,endpoint);if(!j)throw fail('Job not found.',404);return j;};
 app.get('/api/studio/comfy/connection',async(req,res)=>res.json({connected:Boolean(await credential(req.user)),enabled:enabled(),membership:entitled(req.user),funding:'byok',pricingAsOf:'2026-10-17'}));
 app.post('/api/studio/comfy/reference',async(req,res)=>{
  if(!entitled(req.user))throw fail('An active membership is required.',402);
  const key=await credential(req.user);if(!key)throw fail('Connect your own Comfy key first.');
  const {base64,mime}=req.body||{};if(typeof base64!=='string'||base64.length>5600000||!(/^[a-zA-Z0-9+/]+={0,2}$/).test(base64))throw fail('Choose a first-frame image under 4 MB.');
  try{res.json(await clientFactory({apiKey:key}).uploadImage(Buffer.from(base64,'base64'),{mime}));}catch{throw fail('First-frame upload failed. Choose a PNG, JPEG or WebP under 4 MB. No render was submitted.');}
 });
 app.post('/api/studio/comfy/connection',async(req,res)=>locked('key:'+req.user.id,async()=>{
  if(await inFlight(req.user))throw fail('Resolve active or unknown jobs before replacing keys.',409);
  const key=req.body?.key;if(typeof key!=='string'||!/^comfyui-[A-Za-z0-9_-]{10,300}$/.test(key))throw fail('Enter a Comfy API key.');
  try{await clientFactory({apiKey:key}).checkConnection();}catch{throw fail('Comfy could not verify this key.',400);}
  await vault.save(identity(req.user),'comfy:'+key);res.json({connected:true,verified:true});
 }));
 app.delete('/api/studio/comfy/connection',async(req,res)=>locked('key:'+req.user.id,async()=>{if(await inFlight(req.user))throw fail('Resolve active or unknown jobs before deleting keys.',409);await vault.remove(identity(req.user));res.json({connected:false});}));
 app.post('/api/studio/comfy/quote',async(req,res)=>{
  if(!enabled())throw fail('MiniMax generation is not enabled on this server.',503);
  if(!entitled(req.user))throw fail('An active membership is required.',402);
  const b=req.body||{},recipe=recipeFor(b);if(!await db.prepare('SELECT id FROM projects WHERE id=? AND user_id=?').get(b.projectId,req.user.id))throw fail('Project not found.',404);
  if(!await credential(req.user))throw fail('Connect your own Comfy key first.');
  const id=randomUUID(),expiresAt=Date.now()+300000,cents=comfyEstimate(recipe);
  await db.prepare('INSERT INTO generation_quotes VALUES (?,?,?,?,?)').run(id,req.user.id,fingerprint(b.projectId,recipe),cents,expiresAt);
  res.json({id,estimatedCents:cents,currency:'USD',expiresAt,funding:'byok',note:'Estimate, not a provider price guarantee. Comfy charges your connected account.'});
 });
 app.post('/api/studio/comfy/jobs',async(req,res)=>locked('key:'+req.user.id,async()=>{
  const b=req.body||{};if(b.confirmBillable!==true||typeof b.token!=='string'||!/^[-a-zA-Z0-9]{16,100}$/.test(b.token))throw fail('Confirm one billable request and provide a request token.');
  const recipe=recipeFor(b),fp=fingerprint(b.projectId,recipe);
  const prior=await db.prepare('SELECT id,status,fingerprint FROM jobs WHERE user_id=? AND token=?').get(req.user.id,b.token);if(prior){if(prior.fingerprint!==fp)throw fail('This token belongs to a different request.',409);return res.json({id:prior.id,status:prior.status});}
  if(!enabled())throw fail('MiniMax generation is not enabled on this server.',503);
  if(!entitled(req.user))throw fail('An active membership is required.',402);
  const key=await credential(req.user);if(!key)throw fail('Connect your own Comfy key first.');
  const id=randomUUID(),now=Date.now();
  await transact(db,async()=>{
   const user=await db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);if(!entitled(user))throw fail('Active membership required.',402);
   const count=Number((await db.prepare(`SELECT COUNT(*) total FROM jobs WHERE user_id=? AND status IN ${active}`).get(user.id)).total);
   const concurrency=Math.max(1,Math.min(3,Number.parseInt(env.COMFY_MAX_CONCURRENT_JOBS||'1',10)||1));
   if(await db.prepare("SELECT id FROM jobs WHERE user_id=? AND status IN ('unknown','submitting') LIMIT 1").get(user.id))throw fail('Reconcile the uncertain request before submitting another take.',409);
   if(count>=concurrency)throw fail('Finish or reconcile the existing request first.',409);
   if(!await db.prepare('SELECT id FROM projects WHERE id=? AND user_id=?').get(b.projectId,user.id))throw fail('Project not found.',404);
   const q=await db.prepare('SELECT * FROM generation_quotes WHERE id=? AND user_id=? AND fingerprint=? AND expires>?').get(b.quoteId||'',user.id,fp,now);
   if(!q||q.credits!==comfyEstimate(recipe))throw fail('Get a fresh quote before generating.',409);
   await db.prepare('INSERT INTO jobs(id,user_id,project_id,token,fingerprint,input,endpoint,status,created,updated,funding) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,user.id,b.projectId,b.token,fp,JSON.stringify({prompt:b.prompt,duration:recipe.duration,recipe,transport:'sdk-v2',estimatedCents:q.credits}),endpoint,'submitting',now,now,'byok');
  });
  try{const result=await clientFactory({apiKey:key,transport:'sdk-v2'}).submit({workflow:recipe.workflow,confirmBillable:true,token:b.token});await db.prepare('UPDATE jobs SET status=?,request_id=?,updated=? WHERE id=?').run(result.status,result.requestId,Date.now(),id);}
  catch(e){await db.prepare('UPDATE jobs SET status=?,error=?,updated=? WHERE id=?').run(e.outcome==='rejected'?'rejected':'unknown','Submission not confirmed. Check Comfy; do not submit another request.',Date.now(),id);}
  const j=await db.prepare('SELECT id,status FROM jobs WHERE id=?').get(id);res.status(202).json(j);
 }));
 async function poll(j){return locked('poll:'+j.id,async()=>{
  j=await db.prepare('SELECT * FROM jobs WHERE id=?').get(j.id);if(!j||!['queued','in_progress','unknown'].includes(j.status)||!j.request_id)return;
  const key=await credential({id:j.user_id});if(!key)return;
  try{
   const client=clientFactory({apiKey:key,transport:JSON.parse(j.input).transport||'legacy'}),result=await client.status(j.request_id);
   if(result.status!=='completed'){await db.prepare('UPDATE jobs SET status=?,error=?,updated=? WHERE id=?').run(result.status,result.error||null,Date.now(),j.id);return;}
   if(!storage)throw Error('Storage unavailable');
   await locked('media:'+j.user_id,async()=>{
    const sourceId='comfy-job:'+j.id;let media=await db.prepare('SELECT * FROM media WHERE user_id=? AND source_id=?').get(j.user_id,sourceId);
    if(media?.state!=='ready'){
     const output=await client.downloadVideo(j.request_id,{outputNode:JSON.parse(j.input).recipe.outputNode});if(output.mime!=='video/mp4')throw Error('MP4 required');
     const metadata=mp4Metadata(output.bytes),expected=JSON.parse(j.input).duration;if(metadata.duration<expected-.25||metadata.duration>expected+1)throw Error('Unexpected output duration');
     if(!media){const id=randomUUID(),path=j.user_id+'/'+id;await transact(db,async()=>{const used=Number((await db.prepare('SELECT COALESCE(SUM(bytes),0) total FROM media WHERE user_id=?').get(j.user_id)).total);if(used+MAX>1024*1024*1024)throw Error('Storage quota reached');await db.prepare('INSERT INTO media(id,user_id,source_id,object_path,mime,bytes,expected_bytes,state,created) VALUES (?,?,?,?,?,?,?,?,?)').run(id,j.user_id,sourceId,path,'video/mp4',MAX,output.bytes.length,'pending',Date.now());});media=await db.prepare('SELECT * FROM media WHERE id=?').get(id);}
     const existing=await storage.info(media.object_path);
     if(existing.error){const upload=await storage.upload(media.object_path,output.bytes,{contentType:'video/mp4',upsert:false});if(upload.error)throw Error('Upload failed');}
     const confirmed=await storage.info(media.object_path);if(confirmed.error||Number(confirmed.data.size)!==output.bytes.length||confirmed.data.contentType!=='video/mp4')throw Error('Storage verification failed');
     await db.prepare("UPDATE media SET state='ready',bytes=?,expected_bytes=? WHERE id=?").run(output.bytes.length,output.bytes.length,media.id);
    }
    await db.prepare("UPDATE jobs SET status='completed',video_url=?,error=NULL,updated=? WHERE id=?").run('/api/studio/comfy/jobs/'+j.id+'/video',Date.now(),j.id);
   });
  }catch{await db.prepare('UPDATE jobs SET error=?,updated=? WHERE id=?').run('Status or media delivery needs retry. The original job is retained; no new render was submitted.',Date.now(),j.id);}
 });}
 app.post('/api/studio/comfy/jobs/:id/refresh',async(req,res)=>{const j=await owned(req);await poll(j);res.json(await db.prepare('SELECT id,status,error FROM jobs WHERE id=?').get(j.id));});

 app.post('/api/studio/comfy/jobs/:id/reconcile',async(req,res)=>locked('key:'+req.user.id,async()=>{
  const j=await owned(req),requestId=req.body?.requestId;
  if(j.status!=='unknown'||j.request_id)throw fail('Only a submission without a confirmed receipt needs this step.',409);
  if(typeof requestId!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(requestId))throw fail('Enter the original Comfy job ID.');
  if(await db.prepare('SELECT id FROM jobs WHERE request_id=? AND endpoint=?').get(requestId,endpoint))throw fail('This Comfy job is already linked.',409);
  const key=await credential(req.user);if(!key)throw fail('The original Comfy key is required.');
  const result=await clientFactory({apiKey:key,transport:JSON.parse(j.input).transport||'legacy'}).status(requestId,{includeWorkflow:true}),expected=JSON.parse(j.input).recipe.workflow;
  const canonical=w=>JSON.stringify(Object.entries(w||{}).sort(([a],[b])=>a.localeCompare(b)).map(([id,n])=>[id,n.class_type,Object.entries(n.inputs||{}).sort(([a],[b])=>a.localeCompare(b))]));
  if(result.requestId!==requestId||canonical(result.workflow)!==canonical(expected))throw fail('Comfy did not confirm the original workflow. Support must reconcile this job.',409);
  await db.prepare("UPDATE jobs SET request_id=?,status='queued',error=NULL,updated=? WHERE id=?").run(requestId,Date.now(),j.id);
  res.json({id:j.id,status:'queued'});
 }));
 app.get('/api/studio/comfy/jobs/:id/video',async(req,res)=>{const j=await owned(req);if(j.status!=='completed'||!storage)throw fail('Video is not ready.',409);const m=await db.prepare("SELECT object_path FROM media WHERE user_id=? AND source_id=? AND state='ready'").get(req.user.id,'comfy-job:'+j.id);if(!m)throw fail('Video is not available.',404);const {data,error}=await storage.createSignedUrl(m.object_path,300);if(error)throw fail('Could not open video.',503);res.redirect(302,data.signedUrl);});
 return {poll,endpoint};
}
