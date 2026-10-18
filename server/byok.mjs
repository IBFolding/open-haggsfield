import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHiggsfieldClient} from '@higgsfield/client/v2';
export const plan={name:'Studio',monthlyCents:1500,currency:'USD',providerMarkupPercent:0,checkoutEnabled:false};
const valid=v=>typeof v==='string'&&v.length<=2048&&/^[^:\s]+:[^:\s]+$/.test(v);
export async function createVault(directory,masterKey){
 await mkdir(directory,{recursive:true,mode:0o700});
 const keyPath=directory+'/vault.key';let key;
 if(masterKey)key=Buffer.from(masterKey,'base64');
 else try{key=await readFile(keyPath);}catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32);try{await writeFile(keyPath,key,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;key=await readFile(keyPath);}}
 if(key.length!==32)throw Error('Vault unavailable');
 const file=id=>{if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid session');return directory+'/'+createHash('sha256').update(id).digest('hex')+'.enc';};
 return {
  async save(id,credentials){if(!valid(credentials))throw Error('Use key-id:key-secret with exactly one colon and no spaces.');const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(id));const encrypted=Buffer.concat([cipher.update(credentials,'utf8'),cipher.final()]);const target=file(id),temp=target+'.'+randomBytes(8).toString('hex');await writeFile(temp,Buffer.concat([iv,cipher.getAuthTag(),encrypted]),{mode:0o600,flag:'wx'});await rename(temp,target);},
  async get(id){try{const bytes=await readFile(file(id));const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAAD(Buffer.from(id));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}},
  async remove(id){try{await unlink(file(id));}catch(e){if(e.code!=='ENOENT')throw e;}},
 };
}
// Explicit per-session client: never configure the SDK's shared global client.
export async function clientForSession(vault,id){const credentials=await vault.get(id);if(!credentials)throw Error('Connect your own Higgsfield API key first.');return createHiggsfieldClient({credentials,maxRetries:0,timeout:60000});}
export function byokMiddleware(vault){return async(req,res,next)=>{
 if(!req.url?.startsWith('/api/connections'))return next();
 const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 // Local development only. Reject cross-site requests and DNS rebinding, including GETs.
 const host=req.headers.host||'';
 if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==`http://${host}`))return send(403,{error:'Use the local studio origin.'});
 if(req.method!=='GET'&&req.headers.origin!==`http://${host}`)return send(403,{error:'Same-origin request required.'});
 let id=/(?:^|;\s*)oh_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
 if(!id){if(req.method!=='GET')return send(401,{error:'Reload Connections to start a session.'});id=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`oh_session=${id}; HttpOnly; SameSite=Strict; Path=/api/connections; Max-Age=2592000`);}
 try{
  if(req.url==='/api/connections'&&req.method==='GET')return send(200,{connected:Boolean(await vault.get(id)),verified:false,scope:'local browser session',plan});
  if(req.url==='/api/connections/higgsfield'&&req.method==='DELETE'){await vault.remove(id);return send(200,{connected:false});}
  if(req.url==='/api/connections/higgsfield'&&req.method==='POST'){
   if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON required.'});
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return send(413,{error:'Request too large.'});}
   let data;try{data=JSON.parse(body);}catch{return send(400,{error:'Invalid request.'});}
   if(!valid(data?.credentials))return send(400,{error:'Use key-id:key-secret with exactly one colon and no spaces.'});
   await vault.save(id,data.credentials);return send(200,{connected:true,verified:false});
  }
  if(req.url==='/api/connections/checkout'&&req.method==='POST')return send(503,{error:'Payments are not connected. No subscription or charge was created.'});
  return send(404,{error:'Not found.'});
 }catch{return send(503,{error:'Connection storage is unavailable. No credentials were returned.'});}
};}
export function byokPlugin(){return {name:'local-byok',apply:'serve',async configureServer(vite){const vault=await createVault(fileURLToPath(new URL('../.haggsfield/byok/',import.meta.url)));vite.middlewares.use(byokMiddleware(vault));}};}
