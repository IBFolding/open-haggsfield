import {config}from'dotenv';import{writeFile,mkdir}from'node:fs/promises';
import{minimaxTake}from'../workflows/comfy/minimax-take.mjs';
import{inspectWorkflow}from'../workflows/comfy/inspect-workflow.mjs';
config({path:'.env.local',quiet:true});
try{
 if(!process.env.COMFY_API_KEY)throw Error('COMFY_API_KEY is missing.');
 const r=await fetch('https://cloud.comfy.org/api/object_info',{headers:{'X-API-Key':process.env.COMFY_API_KEY},signal:AbortSignal.timeout(30000),redirect:'error'});
 if(!r.ok)throw Error(`Catalog request failed (HTTP ${r.status}).`);
 const recipe=minimaxTake({prompt:'A cinematic scene at sunset'}),report=inspectWorkflow(recipe.workflow,await r.json());
 await mkdir('artifacts/comfy',{recursive:true});
 await writeFile('artifacts/comfy/minimax-take.api.json',JSON.stringify(recipe.workflow,null,2));
 await writeFile('artifacts/comfy/preflight.json',JSON.stringify({checkedAt:new Date().toISOString(),version:recipe.version,...report,submitted:false},null,2));
 console.log(JSON.stringify(report,null,2));if(!report.compatible)process.exitCode=1;
}catch{console.error('Comfy workflow preflight could not complete. No render was submitted.');process.exitCode=1;}
