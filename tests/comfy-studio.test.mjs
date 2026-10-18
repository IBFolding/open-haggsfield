import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import Stripe from 'stripe';
import {createStudio} from '../server/studio.mjs';
import {generationInput,applyResult} from '../server/generation.mjs';
import {vaultId} from '../server/auth.mjs';
async function fixture(options={}){
 const dir=await mkdtemp(join(tmpdir(),'studio-test-'));let studio;const server=createServer((q,s)=>studio.app(q,s));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 let submissions=0;const provider={submit:async(credentials)=>{assert.equal(credentials,'alice:fixture-secret');submissions++;return {status:'queued',request_id:'fixture-request'};},status:async()=>({status:'completed',request_id:'fixture-request',video:{url:'https://media.example/video.mp4'}})};
 studio=await createStudio({directory:dir,origin,pollMs:999999,provider,...options});
 async function call(path,{cookie,body,method=body?'POST':'GET',headers={}}={}){const r=await fetch(origin+'/api/studio'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function user(name){const r=await call('/register',{body:{username:name,password:'fixture-password-long'}});assert.equal(r.status,201);return {...r.data,cookie:r.cookie};}
 const activate=u=>studio.db.prepare("UPDATE users SET billing='active',access_until=? WHERE id=?").run(Date.now()+86400000,u.user.id);
 return {dir,studio,origin,call,user,activate,submissions:()=>submissions,async close(){server.closeAllConnections();await new Promise(r=>server.close(r));studio.close();await rm(dir,{recursive:true,force:true});}};
}
import {mp4Metadata} from '../server/video-metadata.mjs';
const box=(type,data)=>{const h=Buffer.alloc(8);h.writeUInt32BE(8+data.length);h.write(type,4);return Buffer.concat([h,data]);};
function video(){const tkhd=Buffer.alloc(84);tkhd.writeUInt32BE(1280*65536,76);tkhd.writeUInt32BE(720*65536,80);const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(1000,12);mdhd.writeUInt32BE(5000,16);const hdlr=Buffer.alloc(24);hdlr.write('vide',8);return Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('moov',box('trak',Buffer.concat([box('tkhd',tkhd),box('mdia',Buffer.concat([box('mdhd',mdhd),box('hdlr',hdlr)]))]))),box('mdat',Buffer.from('fixture'))]);}
function storageFixture(){const files=new Map();let failures=1;return{files,info:async p=>files.has(p)?{data:{size:files.get(p).length,contentType:'video/mp4'}}:{error:true},upload:async(p,b)=>{if(failures-->0)return{error:true};files.set(p,b);return{data:{}};},createSignedUrl:async()=>({data:{signedUrl:'https://storage.example/private-fixture'}})};}
test('MiniMax quote, idempotency, private delivery retry and ownership preserve one paid submission',async()=>{
 let submissions=0;const storage=storageFixture();const f=await fixture({storage,env:{COMFY_GENERATION_ENABLED:'true'},comfyClientFactory:({apiKey,transport})=>{assert.equal(apiKey,'comfyui-fixturelongkey');return{checkConnection:async()=>({connected:true}),submit:async({token})=>{assert.equal(transport,'sdk-v2');assert.equal(token,'comfy-fixture-token-1234');submissions++;return{requestId:'comfy-job',status:'queued'};},status:async()=>{assert.equal(transport,'sdk-v2');return{status:'completed'};},downloadVideo:async()=>{assert.equal(transport,'sdk-v2');return{bytes:video(),mime:'video/mp4'};}};}});
 try{
 const a=await f.user('alice'),b=await f.user('bobby');f.activate(a);const cookie=a.cookie;
 assert.equal((await f.call('/comfy/connection',{cookie,body:{key:'comfyui-fixturelongkey'}})).status,200);
 const p=(await f.call('/projects',{cookie,body:{title:'Test film',prompt:'Sunset'}})).data;
 const body={projectId:p.id,prompt:'A cinematic scene at sunset',duration:5,model:'MiniMax H3',resolution:'768P',ratio:'16:9',seed:42};
 const q=await f.call('/comfy/quote',{cookie,body});assert.equal(q.status,200);assert.equal(q.data.estimatedCents,65);
 const submit={...body,quoteId:q.data.id,confirmBillable:true,token:'comfy-fixture-token-1234'};
 const result=await f.call('/comfy/jobs',{cookie,body:submit});assert.equal(result.status,202);const id=result.data.id;
 assert.equal((await f.call('/comfy/jobs',{cookie,body:submit})).data.id,id);assert.equal(submissions,1);
 assert.equal((await f.call('/comfy/connection',{cookie,method:'DELETE'})).status,409);
 assert.equal((await f.call(`/comfy/jobs/${id}/refresh`,{cookie:b.cookie,body:{}})).status,404);
 await f.call(`/comfy/jobs/${id}/refresh`,{cookie,body:{}});assert.equal(f.studio.db.prepare('SELECT status FROM jobs WHERE id=?').get(id).status,'queued');
 await f.call(`/comfy/jobs/${id}/refresh`,{cookie,body:{}});const job=f.studio.db.prepare('SELECT status,video_url FROM jobs WHERE id=?').get(id);assert.equal(job.status,'completed');assert.match(job.video_url,/^\/api\/studio\/comfy/);assert.equal(storage.files.size,1);assert.equal(submissions,1);
 await f.call(`/jobs/${id}/refresh`,{cookie,body:{}});assert.equal(submissions,1);
 assert.equal((await f.call(`/comfy/jobs/${id}/video`,{cookie:b.cookie})).status,404);
 }finally{await f.close();}
});
test('uncertain Comfy submit cannot be repeated or fall back to operator credentials',async()=>{
 let submits=0;const f=await fixture({storage:storageFixture(),env:{COMFY_GENERATION_ENABLED:'true',COMFY_API_KEY:'operator-must-not-be-used'},comfyClientFactory:({apiKey})=>{assert.equal(apiKey,'comfyui-fixturelongkey');return{checkConnection:async()=>({connected:true}),submit:async()=>{submits++;throw Error('sensitive-provider-detail');}};}});
 try{const a=await f.user('alice');f.activate(a);const cookie=a.cookie;const p=(await f.call('/projects',{cookie,body:{title:'Test',prompt:'Sunset'}})).data;const body={projectId:p.id,prompt:'A cinematic scene at sunset',duration:5};assert.equal((await f.call('/comfy/quote',{cookie,body})).status,400);await f.call('/comfy/connection',{cookie,body:{key:'comfyui-fixturelongkey'}});const q=(await f.call('/comfy/quote',{cookie,body})).data;const request={...body,quoteId:q.id,confirmBillable:true,token:'uncertain-comfy-token'};const result=await f.call('/comfy/jobs',{cookie,body:request});assert.equal(result.data.status,'unknown');await f.call('/comfy/jobs',{cookie,body:request});assert.equal(submits,1);assert.equal((await f.call('/comfy/jobs',{cookie,body:{...request,token:'different-comfy-token'}})).status,409);assert.ok(!JSON.stringify((await f.call('/jobs',{cookie})).data).includes('sensitive-provider-detail'));}finally{await f.close();}
});
test('MP4 metadata rejects malformed containers and measures track duration',()=>{assert.deepEqual(mp4Metadata(video()),{width:1280,height:720,duration:5});for(const bytes of [Buffer.alloc(0),Buffer.from('not video'),video().subarray(0,30)])assert.throws(()=>mp4Metadata(bytes));});
test('first-frame uploads use the signed-in users key and anchored jobs remain deduplicated',async()=>{
 let submits=0,uploads=0;const f=await fixture({storage:storageFixture(),env:{COMFY_GENERATION_ENABLED:'true'},comfyClientFactory:({apiKey})=>{assert.equal(apiKey,'comfyui-fixturelongkey');return{checkConnection:async()=>({connected:true}),uploadImage:async()=>{uploads++;return{firstFrame:'hash_frame.png'};},submit:async({workflow})=>{assert.equal(workflow[1].class_type,'MinimaxHailuo03FirstLastFrameNode');assert.equal(workflow[2].inputs.image,'hash_frame.png');submits++;return{requestId:'anchor-job',status:'queued'};}};}});
 try{const a=await f.user('alice'),b=await f.user('bobby');f.activate(a);f.activate(b);const cookie=a.cookie;const image={base64:Buffer.alloc(50000,1).toString('base64'),mime:'image/png'};assert.equal((await f.call('/comfy/reference',{cookie:b.cookie,body:image})).status,400);assert.equal(uploads,0);await f.call('/comfy/connection',{cookie,body:{key:'comfyui-fixturelongkey'}});assert.equal((await f.call('/comfy/reference',{cookie,body:image})).data.firstFrame,'hash_frame.png');assert.equal(uploads,1);const p=(await f.call('/projects',{cookie,body:{title:'Anchor',prompt:'Love'}})).data;const body={projectId:p.id,prompt:'A quiet touch',duration:5,firstFrame:'hash_frame.png'};const q=(await f.call('/comfy/quote',{cookie,body})).data;const request={...body,quoteId:q.id,token:'anchored-request-token',confirmBillable:true};assert.equal((await f.call('/comfy/jobs',{cookie,body:request})).status,202);await f.call('/comfy/jobs',{cookie,body:request});assert.equal(submits,1);}finally{await f.close();}
});
