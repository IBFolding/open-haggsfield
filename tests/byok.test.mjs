import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createVault,byokMiddleware} from '../server/byok.mjs';
test('encrypted storage survives restart, isolates sessions and deletes secrets',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byok-test-'));try{const vault=await createVault(dir),a='a'.repeat(64),b='b'.repeat(64);await vault.save(a,'fixture-id:fixture-secret');assert.equal(await vault.get(b),null);for(const f of await readdir(dir)){const bytes=await readFile(join(dir,f));assert.equal(bytes.includes(Buffer.from('fixture-secret')),false);assert.equal((await stat(join(dir,f))).mode&0o777,0o600);}assert.equal(await (await createVault(dir)).get(a),'fixture-id:fixture-secret');await assert.rejects(vault.save(a,'bad:two:colons'));await vault.remove(a);assert.equal(await vault.get(a),null);}finally{await rm(dir,{recursive:true,force:true});}
});
test('HTTP never returns keys; origin gate, session isolation and checkout fail closed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'byok-http-'));const middleware=byokMiddleware(await createVault(dir));const server=createServer((req,res)=>middleware(req,res,()=>{res.writeHead(404);res.end();}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/api/connections';try{
 const first=await fetch(url),cookie=first.headers.get('set-cookie').split(';')[0];assert.equal((await first.json()).connected,false);
 const headers={Origin:origin,Cookie:cookie,'Content-Type':'application/json'};
 let r=await fetch(url+'/higgsfield',{method:'POST',headers,body:JSON.stringify({credentials:'fixture:private-value'})});assert.equal(r.status,200);assert.equal((await r.text()).includes('private-value'),false);
 assert.equal((await (await fetch(url,{headers:{Cookie:cookie}})).json()).connected,true);
 assert.equal((await (await fetch(url)).json()).connected,false);
 assert.equal((await fetch(url+'/higgsfield',{method:'DELETE',headers:{...headers,Origin:'https://evil.example'}})).status,403);
 assert.equal((await fetch(url,{headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await fetch(url+'/checkout',{method:'POST',headers})).status,503);
 assert.equal((await fetch(url+'/higgsfield',{method:'POST',headers,body:'{"credentials":"a:b:c"}'})).status,400);
 assert.equal((await fetch(url+'/higgsfield',{method:'DELETE',headers})).status,200);
 assert.equal((await (await fetch(url,{headers:{Cookie:cookie}})).json()).connected,false);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
