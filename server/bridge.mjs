import {createServer} from 'node:http';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('../.haggsfield/',import.meta.url));
export function mcpBridge(){return {name:'haggsfield-local-mcp',apply:'serve',async configureServer(vite){
 const token=randomBytes(32).toString('hex');let browser=null,pending=null;
 vite.ws.on('haggsfield:ready',(_,client)=>{browser=client;});
 vite.ws.on('haggsfield:result',(data,client)=>{if(pending&&client===pending.client&&data.id===pending.id){clearTimeout(pending.timer);const finish=pending.finish;pending=null;finish(data.error?400:200,data);}});
 const server=createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.headers.origin||!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')){send(403,{error:'Local MCP clients only.'});return;}
  const auth=Buffer.from(req.headers.authorization||'');const expected=Buffer.from(`Bearer ${token}`);
  if(auth.length!==expected.length||!timingSafeEqual(auth,expected)){send(401,{error:'Unauthorized.'});return;}
  if(req.method!=='POST'||req.url!=='/command'){send(404,{error:'Not found.'});return;}
  if(!browser){send(503,{error:'Open the local Open Haggsfield app first.'});return;}
  if(pending){send(409,{error:'Another command is in progress. Read current state before retrying.'});return;}
  try{let body='';for await(const part of req){body+=part;if(body.length>1_500_000){send(413,{error:'Request too large.'});return;}}
   const command=JSON.parse(body);const id=randomUUID();
   pending={id,client:browser,finish:send,timer:setTimeout(()=>{pending=null;send(504,{error:'Browser did not acknowledge. Outcome unknown; inspect state before retrying.'});},8000)};
   browser.send('haggsfield:command',{id,...command});
  }catch{if(pending){clearTimeout(pending.timer);pending=null;}send(400,{error:'Invalid command or disconnected browser.'});}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 await mkdir(directory,{recursive:true,mode:0o700});await writeFile(directory+'bridge.json',JSON.stringify({port:server.address().port,token}),{mode:0o600});
 vite.httpServer?.once('close',()=>{server.close();if(pending)clearTimeout(pending.timer);});
}};}
