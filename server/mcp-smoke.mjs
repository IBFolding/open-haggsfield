import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const client=new Client({name:'haggsfield-smoke-test',version:'1.0.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./mcp.mjs',import.meta.url))]}));
try{
 const list=await client.listTools();assert.equal(list.tools.length,11);console.log('MCP handshake: 11 tools discovered.');
 async function call(name,args={}){const r=await client.callTool({name,arguments:args});if(r.isError)throw Error(r.content[0].text);return JSON.parse(r.content[0].text);}
 console.log(await call('studio_status'));
 const p=await call('create_project',{brief:{title:'MCP Studio Test',idea:'A cinematic sunrise film with soft light drifting over a mountain ridge.',assetMode:'own'}});
 console.log('Created test project:',p.id);
 const plan=await call('get_production_plan',{projectId:p.id});assert(plan.assets.some(a=>a.state==='needed'));
 const blocked=await client.callTool({name:'control_demo_production',arguments:{projectId:p.id,action:'approve'}});assert.equal(blocked.isError,true);
 await call('attach_reference',{projectId:p.id,fileName:'reference-test.png'});
 const ready=await call('get_production_plan',{projectId:p.id});assert(!ready.assets.some(a=>a.state==='needed'));
 await call('update_brief',{projectId:p.id,brief:{title:'MCP — Sunrise Study'}});
 const timeline=await call('get_timeline',{projectId:p.id});const first=timeline.clips[0];
 await call('edit_timeline',{projectId:p.id,action:{type:'split',id:first.id,at:2}});
 const split=await call('get_timeline',{projectId:p.id});assert.equal(split.clips.length,timeline.clips.length+1);
 await call('edit_timeline',{projectId:p.id,action:{type:'undo'}});
 const restored=await call('get_timeline',{projectId:p.id});assert.equal(restored.clips.length,timeline.clips.length);
 const denied=await client.callTool({name:'attach_reference',arguments:{projectId:p.id,fileName:'../.env.local'}});assert.equal(denied.isError,true);
 await call('open_project',{projectId:p.id,editor:true});
 console.log('PASS: real MCP project/create/update, reference attachment, missing-asset gate, timeline split/undo, path boundary, and open editor.');
}finally{await client.close();}
