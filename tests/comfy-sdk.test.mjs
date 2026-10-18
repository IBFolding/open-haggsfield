import test from 'node:test';import assert from 'node:assert/strict';
import {createComfyClient} from '../server/comfy.mjs';
import {directedPrompt} from '../src/studio/direction.js';
const workflow={10:{class_type:'Test',inputs:{prompt:'A scene'}}},token='stable-request-token-0001';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('official Comfy SDK carries stable token and partner credential with exactly one submit',async()=>{
 let count=0;const c=createComfyClient({apiKey:'fixture',transport:'sdk-v2',fetchImpl:async(url,init)=>{count++;assert.equal(url,'https://cloud.comfy.org/api/v2/jobs');const h=new Headers(init.headers);assert.equal(h.get('Idempotency-Key'),token);assert.equal(h.get('Authorization'),'Bearer fixture');assert.deepEqual(JSON.parse(init.body),{workflow,extra_data:{api_key_comfy_org:'fixture'}});return json({id:'job-v2',status:'queued'},201);}});
 await assert.rejects(c.submit({workflow,token}),/confirmation/);await assert.rejects(c.submit({workflow,confirmBillable:true}),/token/);assert.equal(count,0);assert.deepEqual(await c.submit({workflow,token,confirmBillable:true}),{requestId:'job-v2',status:'queued'});assert.equal(count,1);
});
test('SDK queue full, duplicate token, server failure and lost response never retry or leak errors',async()=>{
 for(const [status,code,outcome] of [[429,'queue_full','rejected'],[422,'idempotency_key_reuse','unknown'],[500,'internal_error','unknown'],[0,'network','unknown']]){let count=0;const c=createComfyClient({apiKey:'private-fixture',transport:'sdk-v2',fetchImpl:async()=>{count++;if(!status)throw Error('private-fixture');return json({error:{code,message:'private-fixture'}},status);}});await assert.rejects(c.submit({workflow,token,confirmBillable:true}),e=>e.outcome===outcome&&!e.message.includes('private-fixture'));assert.equal(count,1);}
});
test('SDK completed video is bounded, container checked and storage never receives credentials',async()=>{
 const bytes=Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0]);let downloads=0;
 const c=createComfyClient({apiKey:'private-fixture',transport:'sdk-v2',fetchImpl:async(url,init)=>{
  if(url.endsWith('/jobs/job-v2'))return json({id:'job-v2',status:'succeeded',outputs:[{id:'asset-id',node_id:'20',name:'take.mp4',type:'image'}]});
  if(url.includes('/api/v2/assets/'))return new Response(null,{status:302,headers:{location:'https://storage.googleapis.com/bucket/take.mp4?token=test'}});
  assert.equal(new Headers(init.headers).has('Authorization'),false);assert.equal(init.redirect,'error');downloads++;return new Response(bytes,{headers:{'content-type':'video/mp4'}});
 }});
 assert.deepEqual((await c.downloadVideo('job-v2')).bytes,bytes);assert.equal(downloads,1);await assert.rejects(c.downloadVideo('job-v2',{maxBytes:4}),/limit/);
});
test('SDK terminal failures and unknown states are never completed',async()=>{for(const [state,expected] of [['failed','failed'],['canceled','canceled'],['expired','failed'],['moderated','unknown']]){const c=createComfyClient({apiKey:'fixture',transport:'sdk-v2',fetchImpl:async()=>json({id:'job-v2',status:state,outputs:[],error:{message:'sensitive'}})});const result=await c.status('job-v2');assert.equal(result.status,expected);assert.ok(!JSON.stringify(result).includes('sensitive'));await assert.rejects(c.downloadVideo('job-v2'),/not completed/);}});
test('camera directions are explicit prompt additions with a combined length bound',()=>{assert.equal(directedPrompt('  A scene  '),'A scene');assert.match(directedPrompt('A scene','intimate'),/A scene\n\nIntimate close-up/);assert.throws(()=>directedPrompt('x'.repeat(4000),'hero'),/4,000/);assert.throws(()=>directedPrompt('A scene','invented'),/valid/);});
