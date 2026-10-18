import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {readFile,realpath,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute,basename} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=new McpServer({name:'open-haggsfield',version:'1.0.0'});
async function control(op,args){let bridge;try{bridge=JSON.parse(await readFile(root+'.haggsfield/bridge.json','utf8'));}catch{throw Error('Start the local app with npm run dev and open it in your browser.');}
 const response=await fetch(`http://127.0.0.1:${bridge.port}/command`,{method:'POST',headers:{Authorization:`Bearer ${bridge.token}`,'Content-Type':'application/json'},body:JSON.stringify({op,args}),signal:AbortSignal.timeout(10000)});
 const body=await response.json();if(!response.ok||body.error)throw Error(body.error||'Bridge request failed.');return body.result;
}
function tool(name,description,inputSchema,op,readOnly=false,transform=async x=>x){server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,idempotentHint:readOnly,openWorldHint:false}},async args=>{try{return {content:[{type:'text',text:JSON.stringify(await control(op,await transform(args)))}]};}catch(e){return {isError:true,content:[{type:'text',text:e.name==='TimeoutError'?'Outcome unknown: inspect the project before retrying.':e.message.startsWith('fetch')?'Local bridge unavailable. Open the app and retry.':e.message}]};}});}
const projectId=z.string().min(1).max(100);
const brief=z.object({title:z.string().min(1).max(80).optional(),idea:z.string().max(2000).optional(),audience:z.string().max(180).optional(),type:z.enum(['film','ad','product','music','social','image','animation','custom']).optional(),style:z.enum(['cinematic','editorial','dreamlike','electric']).optional(),format:z.enum(['16:9','9:16','1:1']).optional(),duration:z.union([z.literal(15),z.literal(30),z.literal(60)]).optional(),count:z.union([z.literal(1),z.literal(4),z.literal(8)]).optional(),quality:z.enum(['fast','balanced','final']).optional(),assetMode:z.enum(['own','create']).optional(),audio:z.enum(['none','music','voice']).optional(),needsOriginal:z.boolean().optional(),budget:z.number().int().min(100).max(100000).describe('Demo spending cap in cents').optional(),retries:z.number().int().min(0).max(2).optional()}).strict();
tool('studio_status','Check the connected local app. No provider credentials or paid execution.',{},'status',true);
tool('list_projects','List projects from the browser workspace.',{},'list',true);
tool('get_project','Read a project. Reference bytes are omitted.',{projectId},'get',true);
tool('create_project','Create a saved draft in the same workspace as the UI.',{brief},'create');
tool('update_brief','Update a draft creative brief. Approved briefs are immutable.',{projectId,brief},'update');
tool('attach_reference','Attach a PNG/JPEG/WebP from the mcp-assets directory (max 1 MB). No arbitrary file access. Up to three per draft.',{projectId,fileName:z.string().min(1).max(200)},'reference',false,async args=>{
 if(isAbsolute(args.fileName)||args.fileName.split(/[\\/]/).includes('..')||args.fileName.startsWith('.'))throw Error('Reference must be inside mcp-assets.');
 const base=await realpath(root+'mcp-assets');const path=await realpath(resolve(base,args.fileName));const rel=relative(base,path);if(rel.startsWith('..')||isAbsolute(rel)||basename(path).startsWith('.'))throw Error('Reference must be inside mcp-assets.');
 const info=await stat(path);if(!info.isFile()||info.size>1_000_000)throw Error('Reference must be an image under 1 MB.');
 const bytes=await readFile(path);const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':null;if(!mime)throw Error('Only PNG, JPEG and WebP images are allowed.');
 return {projectId:args.projectId,name:basename(path),url:`data:image/${mime};base64,${bytes.toString('base64')}`};
});
tool('get_production_plan','Get model candidates, missing assets, shot plan, and illustrative costs. Does not generate anything.',{projectId},'plan',true);
tool('open_project','Open a project or its editing bay in the connected browser.',{projectId,editor:z.boolean().default(false)},'open');
tool('control_demo_production','SIMULATION ONLY: approve/pause/resume/cancel or advance a pending stage. No payment or AI request. Approval enforces missing assets and demo budget.',{projectId,action:z.enum(['approve','pause','resume','cancel','tick']),taskId:z.string().optional()},'production');
tool('get_timeline','Read saved timeline including clip IDs and undo history.',{projectId},'timeline',true);
const action=z.discriminatedUnion('type',[
 z.object({type:z.literal('shotReview'),id:z.string(),status:z.enum(['approved','needs-work','unreviewed']),notes:z.string().max(2000).optional()}),
 z.object({type:z.literal('trim'),id:z.string(),in:z.number().nonnegative(),out:z.number().positive()}),
 z.object({type:z.literal('split'),id:z.string(),at:z.number().positive()}),
 z.object({type:z.literal('delete'),id:z.string()}),
 z.object({type:z.literal('move'),id:z.string(),at:z.number().nonnegative(),trackId:z.string()}),
 z.object({type:z.literal('reorder'),id:z.string(),target:z.string()}),
 z.object({type:z.literal('undo')}),z.object({type:z.literal('redo')})]);
tool('edit_timeline','Review shot approval and notes, trim, split, move, delete, undo or redo the local timeline. Approved shots must be explicitly reopened before edits. Multitrack move uses absolute seconds and trackId; split uses seconds into the clip. Reorder is supported only in the original editor. Updates the open editor. Non-destructive source editing; no video render.',{projectId,action},'edit');
await server.connect(new StdioServerTransport());
