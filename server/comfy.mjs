import {ComfyLow} from '@comfyorg/sdk/low';
// Server-only transport. Not enabled for customer billing until a workflow is verified.
// Contract: https://docs.comfy.org/openapi-cloud.yaml
export function createComfyClient({apiKey,fetchImpl=fetch,transport='legacy'}={}) {
 if(typeof apiKey!=='string'||!apiKey.trim())throw Error('Comfy API key is not configured.');
 // Official SDK low-level surface intentionally has no orchestration retries.
 // Fixed origin prevents COMFY_BASE_URL from redirecting customer credentials.
 const sdk=new ComfyLow('https://cloud.comfy.org',apiKey,{clientInfo:'open-haggsfield',fetch:async(url,init)=>{
  const target=new URL(url);if(target.origin!=='https://cloud.comfy.org')throw Error('Untrusted Comfy destination');
  const response=await fetchImpl(url,{...init,redirect:'manual',signal:init?.signal||AbortSignal.timeout(30000)});
  if([301,302,303,307,308].includes(response.status)){
   const signed=new URL(response.headers.get('location'));
   if(init?.method!=='GET'||!target.pathname.startsWith('/api/v2/assets/')||signed.protocol!=='https:'||signed.hostname!=='storage.googleapis.com'||signed.port||signed.username||signed.password)throw Error('Untrusted Comfy redirect');
   await response.body?.cancel();return fetchImpl(signed.href,{redirect:'error',signal:AbortSignal.timeout(60000)});
  }
  return response;
 }});
 async function sdkRequest(action,submission=false){try{return await action();}catch(e){throw Object.assign(Error(submission?'Comfy submission not confirmed. Check the original job; do not resubmit.':'Comfy SDK request unavailable.'),{outcome:submission&&e.httpStatus>=400&&e.httpStatus<500&&e.code!=='idempotency_key_reuse'?'rejected':submission?'unknown':'unavailable'});}}
 async function request(path,body){
  let response;
  try{response=await fetchImpl(`https://cloud.comfy.org${path}`,{method:body?'POST':'GET',headers:{'X-API-Key':apiKey,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000),redirect:'error'});}
  catch{throw Object.assign(Error(body?'Comfy submission outcome is unknown. Do not resubmit automatically.':'Comfy is unavailable.'),{outcome:body?'unknown':'unavailable'});}
  if(!response.ok)throw Object.assign(Error(`Comfy request failed (HTTP ${response.status}).`),{outcome:body&&response.status>=500?'unknown':'rejected'});
  try{return await response.json();}catch{throw Object.assign(Error('Comfy returned an unreadable response.'),{outcome:body?'unknown':'unavailable'});}
 }
 return {
  async uploadImage(bytes,{mime='image/png'}={}){
   const png=bytes?.length>24&&Buffer.from(bytes).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
   const jpeg=bytes?.length>4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
   const webp=bytes?.length>12&&Buffer.from(bytes).toString('ascii',0,4)==='RIFF'&&Buffer.from(bytes).toString('ascii',8,12)==='WEBP';
   if(!bytes?.length||bytes.length>4*1024*1024||!((mime==='image/png'&&png)||(mime==='image/jpeg'&&jpeg)||(mime==='image/webp'&&webp)))throw Error('Choose a PNG, JPEG or WebP first frame under 4 MB.');
   const form=new FormData();form.append('image',new Blob([bytes],{type:mime}),'frame.'+(png?'png':jpeg?'jpg':'webp'));form.append('type','input');
   let response;try{response=await fetchImpl('https://cloud.comfy.org/api/upload/image',{method:'POST',headers:{'X-API-Key':apiKey},body:form,signal:AbortSignal.timeout(60000),redirect:'error'});}catch{throw Error('First-frame upload unavailable. No render was submitted.');}
   if(!response.ok)throw Error('Comfy did not accept the first frame. No render was submitted.');
   const result=await response.json();if(typeof result.name!=='string'||!/^[-a-zA-Z0-9_]{1,180}\.(png|jpe?g|webp)$/i.test(result.name))throw Error('Comfy returned an unsupported first-frame name.');
   return {firstFrame:result.name};
  },
  async downloadVideo(requestId,{outputNode='20',maxBytes=50*1024*1024}={}){
   if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>50*1024*1024)throw Error('Invalid output size limit.');
   const job=await this.status(requestId);
   if(job.status!=='completed')throw Error('Comfy job is not completed. No media was downloaded.');
   const output=job.outputs[outputNode]||{};
   const candidates=[...(Array.isArray(output.video)?output.video:[]),...(Array.isArray(output.videos)?output.videos:[]),...(Array.isArray(output.gifs)?output.gifs:[]),...(Array.isArray(output.images)?output.images:[])].filter(x=>typeof x.filename==='string'&&/\.(mp4|webm)$/i.test(x.filename)&&x.type==='output');
   if(candidates.length!==1)throw Error('Expected exactly one output video. Review the workflow outputs.');
   const item=candidates[0],query=new URLSearchParams({filename:item.filename,subfolder:item.subfolder||'',type:'output'});
   let response;
   try{
    if(transport==='sdk-v2')response=await sdkRequest(()=>sdk.getAssetContent(item.assetId,{signal:AbortSignal.timeout(60000)}));
    else response=await fetchImpl(`https://cloud.comfy.org/api/view?${query}`,{headers:{'X-API-Key':apiKey},signal:AbortSignal.timeout(60000),redirect:'manual'});
    if([301,302,303,307,308].includes(response.status)){
     const target=new URL(response.headers.get('location'));
     if(target.protocol!=='https:'||target.hostname!=='storage.googleapis.com'||target.port||target.username||target.password)throw Error('Untrusted media destination');
     await response.body?.cancel();
     // Signed storage URL already authorizes the file. Never forward Comfy keys.
     response=await fetchImpl(target.href,{signal:AbortSignal.timeout(60000),redirect:'error'});
    }
   }catch{throw Error('Comfy output download failed. Retry download, not generation.');}
   if(!response.ok)throw Error(`Comfy output unavailable (HTTP ${response.status}).`);
   const mime=(response.headers.get('content-type')||'').split(';')[0];
   if(!['video/mp4','video/webm','application/octet-stream'].includes(mime))throw Error('Comfy output is not video media.');
   if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw Error('Output exceeds the 50 MB limit.');}
   const chunks=[];let size=0;const reader=response.body.getReader();
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw Error('Output exceeds the 50 MB limit.');chunks.push(value);}}finally{await reader.cancel();}
   const bytes=Buffer.concat(chunks);
   const mp4=bytes.length>12&&bytes.toString('ascii',4,8)==='ftyp';
   const webm=bytes.length>4&&bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
   if(!mp4&&!webm)throw Error('Output has no supported video container signature.');
   return {bytes,mime:mp4?'video/mp4':'video/webm',extension:mp4?'mp4':'webm',requestId,outputNode,mediaVerified:false};
  },
  async checkConnection(){await request('/api/prompt');return {connected:true};},
  async submit({workflow,confirmBillable=false,token}){
   if(!confirmBillable)throw Error('Explicit billable confirmation is required.');
   if(!workflow||typeof workflow!=='object'||Array.isArray(workflow)||!Object.keys(workflow).length)throw Error('A validated API-format workflow is required.');
   if(transport==='sdk-v2'){
    if(typeof token!=='string'||!/^[-a-zA-Z0-9]{16,100}$/.test(token))throw Object.assign(Error('A stable request token is required.'),{outcome:'rejected'});
    const job=await sdkRequest(()=>sdk.postJobs(workflow,{idempotencyKey:token,extraData:{api_key_comfy_org:apiKey}}),true);
    if(typeof job.id!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(job.id))throw Object.assign(Error('Comfy returned no usable job receipt.'),{outcome:'unknown'});
    return {requestId:job.id,status:'queued'};
   }
   // Partner nodes consume a hidden execution credential separately from the
   // Cloud transport header. Never put it in the graph, journal, or client UI.
   const result=await request('/api/prompt',{prompt:workflow,extra_data:{api_key_comfy_org:apiKey}});
   if(typeof result.prompt_id!=='string'||!result.prompt_id||Object.keys(result.node_errors||{}).length)throw Object.assign(Error('Comfy did not confirm a usable job. Reconcile before resubmitting.'),{outcome:'unknown'});
   return {requestId:result.prompt_id,status:'queued'};
  },
  async status(requestId,{includeWorkflow=false}={}){
   if(!/^[a-zA-Z0-9-]{1,100}$/.test(requestId))throw Error('Invalid Comfy job identifier.');
   if(transport==='sdk-v2'){
    const result=await sdkRequest(()=>sdk.getJob(requestId));
    const states={queued:'queued',running:'in_progress',canceling:'in_progress',succeeded:'completed',failed:'failed',canceled:'canceled',expired:'failed'};
    const executed=includeWorkflow?await sdkRequest(()=>sdk.getJobWorkflow(requestId)):null;
    const outputs={};for(const o of result.outputs||[]){if(['video','image','file'].includes(o.type)&&typeof o.name==='string'&&/\.(mp4|webm)$/i.test(o.name)&&typeof o.id==='string'&&/^[-a-zA-Z0-9]{1,100}$/.test(o.id)){(outputs[o.node_id]??={videos:[]}).videos.push({filename:o.name,type:'output',assetId:o.id});}}
    return {...(executed?.format==='api'?{workflow:executed.workflow}:{}),requestId:result.id,status:states[result.status]||'unknown',outputs,mediaVerified:false,...(['failed','canceled','expired'].includes(result.status)?{error:'Comfy generation ended without a usable video. Check provider usage before any separately authorized retry.'}:{})};
   }
   const result=await request(`/api/jobs/${requestId}`);
   const states={pending:'queued',in_progress:'in_progress',completed:'completed',failed:'failed',cancelled:'canceled'};
   // Outputs are provider file descriptors, not public video URLs. A separate
   // authenticated transfer into private storage must verify playable media.
   const failure=result.execution_error?.exception_message;
   const error=result.status==='failed'?(typeof failure==='string'&&/unauthorized|please login/i.test(failure)?'Comfy partner-node authentication failed. No video was produced. Check the connection before a separately authorized retry.':'Comfy generation failed. No video was produced; check provider usage before retrying.'):result.status==='cancelled'?'Comfy generation was canceled.':null;
   return {status:states[result.status]||'unknown',outputs:result.outputs||{},mediaVerified:false,...(error?{error}:{}),...(result.workflow?{workflow:result.workflow}:{}),...(result.id?{requestId:result.id}:{})};
  }
 };
}
