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
test('accounts persist ownership, secret isolation, logout and one-time recovery',async()=>{
 const f=await fixture();try{const a=await f.user('alice'),b=await f.user('bobby');
 assert.equal((await f.call('/connection')).status,401);
 assert.equal((await f.call('/connection',{cookie:a.cookie,body:{credentials:'alice:fixture-secret'}})).status,200);
 assert.equal((await f.call('/connection',{cookie:b.cookie})).data.connected,false);
 assert.equal((await f.call('/connection',{cookie:a.cookie})).data.connected,true);
 assert.equal(JSON.stringify((await f.call('/connection',{cookie:a.cookie})).data).includes('fixture-secret'),false);
 assert.equal((await f.call('/projects',{cookie:a.cookie,body:{title:'Private',prompt:'Alice only'}})).status,201);
 assert.equal((await f.call('/projects',{cookie:b.cookie})).data.projects.length,0);
 assert.equal((await f.call('/logout',{cookie:a.cookie,body:{},headers:{Origin:'https://evil.example'}})).status,403);
 await f.call('/logout',{cookie:a.cookie,body:{}});assert.equal((await f.call('/projects',{cookie:a.cookie})).status,401);
 const recovered=await f.call('/recover',{body:{username:'alice',recoveryCode:a.recoveryCode,password:'new-fixture-password'}});assert.equal(recovered.status,200);
 assert.equal((await f.call('/recover',{body:{username:'alice',recoveryCode:a.recoveryCode,password:'new-fixture-password'}})).status,401);
 assert.equal((await f.call('/connection',{cookie:recovered.cookie})).data.connected,true);
 assert.equal((await f.call('/login',{body:{username:'alice',password:'new-fixture-password'}})).status,200);
 }finally{await f.close();}
});
test('paid gate, idempotent jobs, completed URL, ownership, failure and no auto retry',async()=>{
 const f=await fixture();try{const a=await f.user('alice'),b=await f.user('bobby');const p=(await f.call('/projects',{cookie:a.cookie,body:{title:'Film',prompt:'Cinematic sunset'}})).data;
 await f.call('/connection',{cookie:a.cookie,body:{credentials:'alice:fixture-secret'}});
 const body={projectId:p.id,prompt:'Cinematic sunset',duration:5,confirmBillable:true,token:'fixture-request-token-001'};
 assert.equal((await f.call('/jobs',{cookie:a.cookie,body})).status,402);assert.equal(f.submissions(),0);f.activate(a);
 assert.equal((await f.call('/jobs',{cookie:a.cookie,body:{...body,confirmBillable:false}})).status,400);
 const j=(await f.call('/jobs',{cookie:a.cookie,body})).data;assert.equal(j.status,'queued');
 assert.equal((await f.call('/jobs',{cookie:a.cookie,body})).data.id,j.id);assert.equal(f.submissions(),1);
 assert.equal((await f.call('/jobs',{cookie:a.cookie,body:{...body,prompt:'Different scene'}})).status,409);
 assert.equal((await f.call('/connection',{cookie:a.cookie,method:'DELETE'})).status,409);
 assert.equal((await f.call(`/jobs/${j.id}/refresh`,{cookie:b.cookie,body:{}})).status,404);
 await f.call(`/jobs/${j.id}/refresh`,{cookie:a.cookie,body:{}});
 const complete=(await f.call('/jobs',{cookie:a.cookie})).data.jobs[0];assert.equal(complete.status,'completed');assert.equal(complete.video_url,'https://media.example/video.mp4');
 assert.equal((await f.call('/jobs',{cookie:b.cookie})).data.jobs.length,0);
 await applyResult(f.studio.db,j.id,{status:'failed'});assert.equal(f.studio.db.prepare('SELECT status FROM jobs WHERE id=?').get(j.id).status,'completed');
 f.studio.db.prepare("UPDATE jobs SET status='queued' WHERE id=?").run(j.id);
 await applyResult(f.studio.db,j.id,{status:'completed',video:{url:'javascript:alert(1)'}});assert.equal(f.studio.db.prepare('SELECT status FROM jobs WHERE id=?').get(j.id).status,'unknown');
 for(const status of ['failed','nsfw','canceled']){f.studio.db.prepare("UPDATE jobs SET status='queued' WHERE id=?").run(j.id);await applyResult(f.studio.db,j.id,{status});assert.equal(f.studio.db.prepare('SELECT status,video_url FROM jobs WHERE id=?').get(j.id).video_url,null);}
 assert.equal(f.submissions(),1);
 }finally{await f.close();}
});
test('uncertain submission is retained and never automatically duplicated',async()=>{
 let count=0;const f=await fixture({provider:{submit:async()=>{count++;throw Error('timeout with secret in error');},status:async()=>{throw Error('unavailable');}}});
 try{const a=await f.user('alice');f.activate(a);const p=(await f.call('/projects',{cookie:a.cookie,body:{title:'Film',prompt:'Sunset'}})).data;await f.call('/connection',{cookie:a.cookie,body:{credentials:'alice:fixture-secret'}});
 const body={projectId:p.id,prompt:'Cinematic sunset',duration:5,confirmBillable:true,token:'fixture-request-token-002'};
 const j=(await f.call('/jobs',{cookie:a.cookie,body})).data;assert.equal(j.status,'unknown');await f.call('/jobs',{cookie:a.cookie,body});assert.equal(count,1);
 const stored=(await f.call('/jobs',{cookie:a.cookie})).data.jobs[0];assert.equal(stored.error.includes('secret'),false);
 assert.equal((await f.call('/jobs',{cookie:a.cookie,body:{...body,token:'another-request-token'}})).status,409);
 }finally{await f.close();}
});
test('subscription checkout and verified webhooks activate once; cancellation revokes access',async()=>{
 const signing='whsec_fixture_only',real=new Stripe('sk_test_fixture');let paid=false,checkoutCalls=0;
 const stripe={webhooks:real.webhooks,prices:{retrieve:async()=>({active:true,currency:'usd',unit_amount:1500,recurring:{interval:'month',interval_count:1}})},customers:{create:async()=>({id:'cus_fixture'})},subscriptions:{list:async()=>({data:paid?[{id:'sub_fixture',status:'active',latest_invoice:{status:'paid'},items:{data:[{price:{id:'price_fixture'},current_period_end:Math.floor(Date.now()/1000)+86400}]}}]:[]})},checkout:{sessions:{create:async()=>{checkoutCalls++;return {id:'cs_fixture',url:'https://checkout.stripe.com/c/fixture',expires_at:Math.floor(Date.now()/1000)+3600};},retrieve:async()=>({status:'open',url:'https://checkout.stripe.com/c/fixture'})}},billingPortal:{sessions:{create:async()=>({url:'https://billing.stripe.com/p/fixture'})}}};
 const f=await fixture({stripe,env:{STRIPE_API_KEY:'fixture',STRIPE_PRICE_ID:'price_fixture',STRIPE_WEBHOOK_SECRET:signing}});
 try{const a=await f.user('alice');assert.equal((await f.call('/checkout',{cookie:a.cookie,body:{}})).status,200);assert.equal((await f.call('/checkout',{cookie:a.cookie,body:{}})).status,200);assert.equal(checkoutCalls,1);
 assert.equal((await f.call('/account',{cookie:a.cookie})).data.user.billing,'inactive');
 const payload=JSON.stringify({id:'evt_fixture',type:'invoice.paid',data:{object:{customer:'cus_fixture'}}});
 const invalid=await fetch(f.origin+'/api/studio/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':'bad'},body:payload});assert.equal(invalid.status,400);
 paid=true;const send=()=>fetch(f.origin+'/api/studio/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':real.webhooks.generateTestHeaderString({payload,secret:signing})},body:payload});assert.equal((await send()).status,200);assert.equal((await send()).status,200);
 assert.equal(f.studio.db.prepare('SELECT count(*) AS n FROM stripe_events').get().n,1);assert.equal((await f.call('/account',{cookie:a.cookie})).data.user.billing,'active');
 paid=false;await f.call('/billing/refresh',{cookie:a.cookie,body:{}});assert.equal((await f.call('/account',{cookie:a.cookie})).data.user.billing,'inactive');
 }finally{await f.close();}
});
test('reference-aware input uses image endpoint and rejects unsafe anchors',()=>{
 assert.equal(generationInput({prompt:'A new cinematic shot',duration:5,imageUrl:'https://assets.example/first.png',endImageUrl:'https://assets.example/last.png'}).input.end_image_url,'https://assets.example/last.png');
 for(const imageUrl of ['http://localhost/a','https://127.0.0.1/a','https://u:p@example.com/a','file:///a'])assert.throws(()=>generationInput({prompt:'A new shot',duration:5,imageUrl}));
 assert.throws(()=>generationInput({prompt:'A new shot',duration:60}));
});
test('restart preserves accounts and keys; interrupted submission becomes unknown',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-restart-'));let studio=await createStudio({directory:dir,pollMs:999999});try{
 const now=Date.now();studio.db.prepare('INSERT INTO users(id,username,password,recovery,created) VALUES (?,?,?,?,?)').run('fixture-user','restart-user','unused','unused',now);
 const u={id:'fixture-user'};await studio.vault.save(vaultId(u),'fixture-id:fixture-secret');
 studio.db.prepare('INSERT INTO projects VALUES (?,?,?,?,?)').run('fixture-project',u.id,'Persisted project','Sunset',now);
 studio.db.prepare('INSERT INTO jobs(id,user_id,project_id,token,fingerprint,input,endpoint,status,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?)').run('fixture-job',u.id,'fixture-project','fixture-token','hash','{}','model','submitting',now,now);
 studio.close();studio=await createStudio({directory:dir,pollMs:999999});
 assert.equal(studio.db.prepare('SELECT username FROM users WHERE id=?').get(u.id).username,'restart-user');
 assert.equal(await studio.vault.get(vaultId(u)),'fixture-id:fixture-secret');assert.equal(studio.db.prepare('SELECT status FROM jobs WHERE id=?').get('fixture-job').status,'unknown');
 }finally{studio.close();await rm(dir,{recursive:true,force:true});}
});

test('checkout recovers every nonterminal subscription, including behind a page of canceled history',async()=>{
 let state='past_due',checkoutCalls=0,portalCalls=0;const pages=[];
 const item={price:{id:'price_fixture'},current_period_end:Math.floor(Date.now()/1000)+86400};
 const stripe={prices:{retrieve:async()=>({active:true,currency:'usd',unit_amount:1500,recurring:{interval:'month',interval_count:1}})},subscriptions:{list:async args=>{pages.push(args.starting_after);return args.starting_after?{data:[{id:'sub_existing',status:state,latest_invoice:{status:'open'},items:{data:[item]}}],has_more:false}:{data:[{id:'sub_new_canceled',status:'canceled',items:{data:[item]}}],has_more:true};}},checkout:{sessions:{create:async args=>{checkoutCalls++;assert.equal(args.subscription_data.billing_mode.type,'flexible');return {id:'cs_new',url:'https://checkout.stripe.com/c/fixture',expires_at:Math.floor(Date.now()/1000)+3600};}}},billingPortal:{sessions:{create:async args=>{portalCalls++;assert.equal(args.customer,'cus_existing');return {url:'https://billing.stripe.com/p/fixture'};}}}};
 const f=await fixture({stripe,env:{STRIPE_API_KEY:'fixture',STRIPE_PRICE_ID:'price_fixture',STRIPE_WEBHOOK_SECRET:'fixture'}});
 try{const a=await f.user('alice');f.studio.db.prepare('UPDATE users SET customer=? WHERE id=?').run('cus_existing',a.user.id);
 for(state of ['active','past_due','unpaid','incomplete','paused','trialing']){
  const r=await f.call('/checkout',{cookie:a.cookie,body:{}});assert.equal(r.status,409,state);assert.match(r.data.error,/Manage subscription/);
  const stored=f.studio.db.prepare('SELECT * FROM users WHERE id=?').get(a.user.id);assert.equal(stored.subscription,'sub_existing');assert.equal(stored.access_until,0,'unpaid invoices never grant access');
  const account=(await f.call('/account',{cookie:a.cookie})).data;assert.equal(account.user.hasSubscription,true);
  assert.equal((await f.call('/billing/portal',{cookie:a.cookie,body:{}})).status,200);
 }
 assert.equal(checkoutCalls,0);assert.equal(portalCalls,6);assert.ok(pages.includes('sub_new_canceled'));
 state='incomplete_expired';assert.equal((await f.call('/checkout',{cookie:a.cookie,body:{}})).status,200);assert.equal(checkoutCalls,1);
 }finally{await f.close();}
});

const platformEnv=()=>({PLATFORM_GENERATION_ENABLED:'true',HF_PLATFORM_CREDENTIALS:'platform:fixture-only',PLATFORM_MAX_CENTS_PER_SECOND:'20',PLATFORM_RATE_VALID_UNTIL:new Date(Date.now()+3600000).toISOString(),PLATFORM_MONTHLY_CAP_CENTS:'10000'});
function grant(f,a,credits=1000){f.activate(a);f.studio.db.prepare('INSERT INTO credit_grants VALUES (?,?,?,?,?,?)').run('invoice-'+a.user.id,a.user.id,'sub-fixture','creator',credits,Date.now()+86400000);f.studio.db.prepare("UPDATE users SET plan='creator',grant_id=? WHERE id=?").run('invoice-'+a.user.id,a.user.id);}
async function shot(f,a){const project=(await f.call('/projects',{cookie:a.cookie,body:{title:'Included film',prompt:'A sunset scene'}})).data;const body={projectId:project.id,prompt:'A cinematic sunset scene',duration:5,funding:'platform',confirmBillable:true,token:'platform-token-'+a.user.id};const q=await f.call('/quote',{cookie:a.cookie,body});return {...body,quoteId:q.data.id};}
test('included credits use only platform credentials; reserve once, reject stale quotes and preserve BYOK isolation',async()=>{
 let calls=0;const f=await fixture({env:platformEnv(),provider:{submit:async key=>{assert.equal(key,'platform:fixture-only');calls++;return {status:'completed',request_id:'platform-receipt',video:{url:'https://media.example/clip.mp4'}};}}});
 try{const a=await f.user('creator');grant(f,a);const body=await shot(f,a);
 assert.equal((await f.call('/jobs',{cookie:a.cookie,body:{...body,quoteId:'bad'}})).status,409);
 assert.equal((await f.call('/jobs',{cookie:a.cookie,body:{...body,funding:'byok'}})).status,400,'never fall back to platform key');
 const [one,two]=await Promise.all([f.call('/jobs',{cookie:a.cookie,body}),f.call('/jobs',{cookie:a.cookie,body})]);assert.ok([one.status,two.status].includes(202));assert.equal(calls,1);
 assert.equal((await f.call('/account',{cookie:a.cookie})).data.user.allowance.remaining,900);
 assert.equal((await f.call('/jobs',{cookie:a.cookie,body})).data.id,one.data.id||two.data.id);assert.equal(calls,1);
 const b=await f.user('outsider');grant(f,b);assert.equal((await f.call('/jobs',{cookie:b.cookie,body})).status,404);
 const changed={...body,token:body.token+'-changed',duration:10};assert.equal((await f.call('/jobs',{cookie:a.cookie,body:changed})).status,409);
 f.studio.db.prepare('UPDATE generation_quotes SET expires=0').run();assert.equal((await f.call('/jobs',{cookie:a.cookie,body:{...body,token:body.token+'-new'}})).status,409);
 }finally{await f.close();}
});
test('shared platform cap is atomic across accounts; unknown outcomes retain reservations and cannot reconcile arbitrary receipts',async()=>{
 let calls=0;const env={...platformEnv(),PLATFORM_MONTHLY_CAP_CENTS:'100'};
 const f=await fixture({env,provider:{submit:async()=>{calls++;throw Error('uncertain');}}});try{const a=await f.user('creator'),b=await f.user('second');grant(f,a);grant(f,b);const ba=await shot(f,a),bb=await shot(f,b);
 const responses=await Promise.all([f.call('/jobs',{cookie:a.cookie,body:ba}),f.call('/jobs',{cookie:b.cookie,body:bb})]);assert.equal(calls,1);assert.deepEqual(responses.map(r=>r.status).sort(),[202,503]);
 const index=responses.findIndex(r=>r.status===202),owner=index===0?a:b,j=responses[index].data;
 assert.equal(j.status,'unknown');assert.equal((await f.call('/account',{cookie:owner.cookie})).data.user.allowance.remaining,900);
 assert.equal((await f.call(`/jobs/${j.id}/reconcile`,{cookie:owner.cookie,body:{requestId:'another-users-receipt'}})).status,409);
 }finally{await f.close();}
});
test('definite rejection releases credits, exhausted allowances and unsupported variants never reach provider',async()=>{
 let calls=0;const f=await fixture({env:platformEnv(),provider:{submit:async()=>{calls++;throw Object.assign(Error('rejected'),{statusCode:403});}}});try{const a=await f.user('creator');grant(f,a,100);const body=await shot(f,a);
 assert.equal((await f.call('/jobs',{cookie:a.cookie,body})).data.status,'rejected');assert.equal((await f.call('/account',{cookie:a.cookie})).data.user.allowance.remaining,100);
 assert.equal((await f.call('/quote',{cookie:a.cookie,body:{...body,audio:true}})).status,400);
 assert.equal((await f.call('/quote',{cookie:a.cookie,body:{...body,duration:10}})).status,402);assert.equal(calls,1);
 }finally{await f.close();}
});
test('disabled or stale platform pricing blocks quotes and subscription sales',async()=>{
 const env=platformEnv();env.PLATFORM_RATE_VALID_UNTIL=new Date(Date.now()-1000).toISOString();const f=await fixture({env});try{const a=await f.user('creator');grant(f,a);assert.equal((await f.call('/quote',{cookie:a.cookie,body:{prompt:'Sunset scene',duration:5}})).status,400);assert.equal((await f.call('/checkout',{cookie:a.cookie,body:{plan:'creator'}})).status,503);assert.equal(f.submissions(),0);}finally{await f.close();}
});
test('full paid recurring invoices grant once; renewal resets; discounts, proration, payment failures and holds cannot grant spend',async()=>{
 const {syncSubscription}=await import('../server/billing.mjs');let invoice={id:'in_first',status:'paid',currency:'usd',amount_paid:4900,subtotal:4900,billing_reason:'subscription_create'},status='active',period=Math.floor(Date.now()/1000)+86400;
 const stripe={subscriptions:{list:async()=>({data:[{id:'sub_creator',status,latest_invoice:invoice,items:{data:[{price:{id:'price_creator'},current_period_end:period}]}}]})}};
 const f=await fixture();try{const a=await f.user('creator');f.studio.db.prepare('UPDATE users SET customer=? WHERE id=?').run('cus_creator',a.user.id);const sync=()=>syncSubscription(f.studio.db,stripe,'cus_creator',{STRIPE_CREATOR_PRICE_ID:'price_creator'});
 await sync();await sync();assert.equal(f.studio.db.prepare('SELECT count(*) n FROM credit_grants').get().n,1);assert.equal((await f.call('/account',{cookie:a.cookie})).data.user.allowance.remaining,1000);
 invoice={...invoice,id:'in_second',billing_reason:'subscription_cycle'};period+=2592000;await sync();assert.equal(f.studio.db.prepare('SELECT count(*) n FROM credit_grants').get().n,2);
 invoice={...invoice,id:'in_discount',amount_paid:100};await sync();assert.equal((await f.call('/account',{cookie:a.cookie})).data.user.allowance.remaining,0);
 invoice={...invoice,id:'in_prorate',amount_paid:4900,billing_reason:'subscription_update'};await sync();assert.equal((await f.call('/account',{cookie:a.cookie})).data.user.allowance.remaining,0);
 status='past_due';await sync();assert.equal((await f.call('/account',{cookie:a.cookie})).data.user.allowance.remaining,0);
 status='active';invoice={...invoice,id:'in_third',billing_reason:'subscription_cycle'};f.studio.db.prepare('UPDATE users SET billing_hold=1 WHERE id=?').run(a.user.id);await sync();assert.equal((await f.call('/account',{cookie:a.cookie})).data.user.billing,'on_hold');assert.equal(f.studio.db.prepare('SELECT count(*) n FROM credit_grants').get().n,2);
 }finally{await f.close();}
});
test('Creator checkout charges the configured tier and signed refund events stop spending after refresh',async()=>{
 const real=new Stripe('sk_test_fixture'),signing='whsec_platform_fixture';let paid=false,checkedPrice;
 const stripe={webhooks:real.webhooks,prices:{retrieve:async id=>{checkedPrice=id;return {active:true,currency:'usd',unit_amount:4900,recurring:{interval:'month',interval_count:1}};}},customers:{create:async()=>({id:'cus_creator'})},subscriptions:{list:async()=>({data:paid?[{id:'sub_creator',status:'active',latest_invoice:{id:'in_creator',status:'paid',currency:'usd',amount_paid:4900,subtotal:4900,billing_reason:'subscription_create'},items:{data:[{price:{id:'price_creator'},current_period_end:Math.floor(Date.now()/1000)+86400}]}}]:[]})},checkout:{sessions:{create:async args=>{assert.equal(args.line_items[0].price,'price_creator');return {id:'cs_creator',url:'https://checkout.stripe.com/c/fixture',expires_at:Math.floor(Date.now()/1000)+3600};}}}};
 const f=await fixture({env:{...platformEnv(),STRIPE_API_KEY:'fixture',STRIPE_CREATOR_PRICE_ID:'price_creator',STRIPE_WEBHOOK_SECRET:signing},stripe});try{const a=await f.user('creator');assert.equal((await f.call('/checkout',{cookie:a.cookie,body:{plan:'creator'}})).status,200);assert.equal(checkedPrice,'price_creator');paid=true;
 async function event(id,type,object){const payload=JSON.stringify({id,type,data:{object}});return fetch(f.origin+'/api/studio/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':real.webhooks.generateTestHeaderString({payload,secret:signing})},body:payload});}
 assert.equal((await event('evt_paid','invoice.paid',{customer:'cus_creator'})).status,200);assert.equal((await f.call('/account',{cookie:a.cookie})).data.user.allowance.remaining,1000);
 assert.equal((await event('evt_refund','charge.refunded',{customer:'cus_creator'})).status,200);await f.call('/billing/refresh',{cookie:a.cookie,body:{}});const u=(await f.call('/account',{cookie:a.cookie})).data.user;assert.equal(u.billing,'on_hold');assert.equal(u.allowance.remaining,0);
 }finally{await f.close();}
});

test('account export excludes secrets and other users; sign-out-all requires password',async()=>{
 const f=await fixture();try{const a=await f.user('exportalice'),b=await f.user('exportbob');await f.call('/projects',{cookie:a.cookie,body:{title:'Alice film',prompt:'A scene'}});await f.call('/projects',{cookie:b.cookie,body:{title:'Bob private',prompt:'A scene'}});await f.call('/connection',{cookie:a.cookie,body:{credentials:'alice:fixture-secret'}});
 assert.equal((await f.call('/account/export')).status,401);const out=await f.call('/account/export',{cookie:a.cookie});assert.equal(out.status,200);const text=JSON.stringify(out.data);for(const forbidden of ['fixture-secret','Bob private','recovery','password','oh_account'])assert.ok(!text.includes(forbidden));assert.equal(out.data.projects.length,1);
 assert.equal((await f.call('/account/sign-out-all',{cookie:a.cookie,body:{password:'wrong'}})).status,403);assert.equal((await f.call('/account/sign-out-all',{cookie:a.cookie,body:{password:'fixture-password-long'}})).status,200);assert.equal((await f.call('/projects',{cookie:a.cookie})).status,401);assert.equal((await f.call('/projects',{cookie:b.cookie})).status,200);
 }finally{await f.close();}
});
