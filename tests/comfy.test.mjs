import test from 'node:test';import assert from 'node:assert/strict';
import {createComfyClient} from '../server/comfy.mjs';
test('Comfy submits only after explicit authorization, using the documented server API',async()=>{
 let calls=0;const client=createComfyClient({apiKey:'fixture',fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://cloud.comfy.org/api/prompt');assert.equal(options.headers['X-API-Key'],'fixture');assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body),{prompt:{1:{}},extra_data:{api_key_comfy_org:'fixture'}});return {ok:true,json:async()=>({prompt_id:'job-1'})};}});
 await assert.rejects(client.submit({workflow:{1:{}}}),/confirmation/);assert.equal(calls,0);
 assert.deepEqual(await client.submit({workflow:{1:{}},confirmBillable:true}),{requestId:'job-1',status:'queued'});assert.equal(calls,1);
});
test('Comfy uncertain submission never retries and does not reveal provider error text',async()=>{
 let calls=0;const client=createComfyClient({apiKey:'secret-fixture',fetchImpl:async()=>{calls++;throw Error('secret-fixture');}});
 await assert.rejects(client.submit({workflow:{1:{}},confirmBillable:true}),e=>e.outcome==='unknown'&&!e.message.includes('secret-fixture'));assert.equal(calls,1);
});
test('Comfy cancellation and failure remain failures; completed jobs do not imply playable media',async()=>{
 for(const [status,expected] of [['cancelled','canceled'],['failed','failed'],['completed','completed'],['new_status','unknown']]){
 const client=createComfyClient({apiKey:'fixture',fetchImpl:async()=>({ok:true,json:async()=>({status})})});
 const result=await client.status('job-1');assert.equal(result.status,expected);assert.deepEqual(result.outputs,{});assert.equal(result.mediaVerified,false);if(['failed','canceled'].includes(expected))assert.ok(result.error);
 }
});
test('output download is restricted to completed job output and checks size and container',async()=>{
 const bytes=Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0]);let calls=[];
 const client=createComfyClient({apiKey:'fixture',fetchImpl:async(url)=>{calls.push(url);if(url.includes('/jobs/'))return {ok:true,json:async()=>({status:'completed',outputs:{20:{images:[{filename:'take.mp4',type:'output',metadata:{kind:'video'}}]}}})};return new Response(bytes,{headers:{'content-type':'video/mp4'}});}});
 const result=await client.downloadVideo('job-1');assert.deepEqual(result.bytes,bytes);assert.equal(result.mediaVerified,false);assert.match(calls[1],/^https:\/\/cloud.comfy.org\/api\/view\?/);
 await assert.rejects(client.downloadVideo('job-1',{maxBytes:4}),/limit/);
 const pending=createComfyClient({apiKey:'fixture',fetchImpl:async()=>({ok:true,json:async()=>({status:'pending'})})});await assert.rejects(pending.downloadVideo('job-1'),/not completed/);
});
test('HTML masquerading as video is rejected',async()=>{
 const client=createComfyClient({apiKey:'fixture',fetchImpl:async(url)=>url.includes('/jobs/')?{ok:true,json:async()=>({status:'completed',outputs:{20:{images:[{filename:'take.mp4',type:'output',metadata:{kind:'video'}}]}}})}:new Response('<html>failure</html>',{headers:{'content-type':'video/mp4'}})});await assert.rejects(client.downloadVideo('job-1'),/signature/);
});

test('partner authentication failure is actionable without exposing provider traceback or keys',async()=>{
 const client=createComfyClient({apiKey:'secret-fixture',fetchImpl:async()=>({ok:true,json:async()=>({status:'failed',execution_error:{exception_message:'Unauthorized: Please login first to use this node. secret-fixture',traceback:['private-debug']}})})});
 const result=await client.status('job-1');assert.match(result.error,/authentication failed/);assert.ok(!JSON.stringify(result).includes('secret-fixture'));assert.ok(!JSON.stringify(result).includes('private-debug'));
});
test('signed storage redirects never receive the Comfy key and reject other hosts',async()=>{
 const bytes=Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0]);
 for(const host of ['storage.googleapis.com','attacker.example']){
  let downloaded=false;
  const client=createComfyClient({apiKey:'secret-fixture',fetchImpl:async(url,options)=>{
   if(url.includes('/api/jobs/'))return{ok:true,json:async()=>({status:'completed',outputs:{20:{images:[{filename:'take.mp4',type:'output'}]}}})};
   if(url.includes('/api/view?'))return new Response(null,{status:302,headers:{location:`https://${host}/signed.mp4?token=fixture`}});
   assert.equal(options.headers,undefined);assert.equal(options.redirect,'error');downloaded=true;return new Response(bytes,{headers:{'content-type':'video/mp4'}});
  }});
  if(host==='storage.googleapis.com'){assert.equal((await client.downloadVideo('job-1')).bytes.length,bytes.length);assert.equal(downloaded,true);}else{await assert.rejects(client.downloadVideo('job-1'),/download failed/);assert.equal(downloaded,false);}
 }
});
test('first-frame upload uses authenticated multipart and never submits a render',async()=>{
 let calls=0;const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(24)]);
 const c=createComfyClient({apiKey:'fixture-key',fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://cloud.comfy.org/api/upload/image');assert.equal(options.headers['X-API-Key'],'fixture-key');assert.ok(options.body instanceof FormData);assert.equal(options.body.get('type'),'input');return{ok:true,json:async()=>({name:'upload_hash.png'})};}});
 assert.deepEqual(await c.uploadImage(png),{firstFrame:'upload_hash.png'});assert.equal(calls,1);await assert.rejects(c.uploadImage(Buffer.from('bad')));assert.equal(calls,1);
});
