import {directedPrompt} from './direction.js';
import {minimaxTake} from '../../workflows/comfy/minimax-take.mjs';
export const revisionActions={
 new:{label:'Create a new take',help:'Start from a description. Every result is a separate take.'},
 animate:{label:'Animate a reference',help:'Use your image as the opening frame. It guides appearance; identity is not guaranteed.'},
 reference:{label:'Keep characters & style',help:'Use up to nine ordered image references. Describe their roles as Image 1, Image 2, and so on.'},
 bridge:{label:'Connect two frames',help:'Generate motion from your opening image toward your ending image.'},
 continue:{label:'Continue from last frame',help:'Capture the end of the selected clip as a new first frame. This does not preserve the original audio or condition on the whole video.'}
};
export function revisionInput({action,prompt,direction='none',change='',preserve='',seconds,seed,model,resolution,ratio,firstFrame,lastFrame,referenceImages=[],referenceDetail='standard',promptExpansion='balanced'}){
 if(!Object.hasOwn(revisionActions,action))throw Error('Choose a supported revision action.');
 const mode=action==='new'?'text-to-video':action==='reference'?'reference-to-video':action==='bridge'?'first-last-frame':'image-to-video';
 const input={prompt:directedPrompt(prompt,direction,{change,preserve}),duration:seconds,seed,model,resolution,ratio,mode,...(action==='reference'?{referenceImages,referenceDetail}:{}),...(action!=='new'&&action!=='reference'?{firstFrame}:{}),...(action==='bridge'?{lastFrame}:{}),promptExpansion};
 minimaxTake({...input,seconds:input.duration});return input;
}
export async function readFrame(file){
 if(!file||file.size>4*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP under 4 MB.');
 const image=await createImageBitmap(file);try{const ratio=image.width/image.height;if(image.width<256||image.height<256||ratio<.4||ratio>2.5)throw Error('References need at least 256 pixels on each edge and an aspect ratio between 2:5 and 5:2.');}finally{image.close();}
 return file;
}
export async function workflowBundle(input,frames){
 const recipe=minimaxTake({...input,seconds:input.duration});const {zipSync,strToU8}=await import('fflate');
 const files={'workflow.api.json':strToU8(JSON.stringify(recipe.workflow,null,2)),'README.txt':strToU8('Open Haggsfield — prepared MiniMax workflow\n\nNo generation was submitted. Extract this ZIP, copy the image files into your ComfyUI input directory, and open workflow.api.json. Review provider pricing before running partner nodes. Comfy Cloud use requires uploading these input files to that workspace.\n\nH3 Max reference generation has a verified paid proof. First/last-frame modes are schema-checked; paid results remain unverified. Camera directions and preservation instructions are prompt guidance, not guarantees.\n')};
 for(const {name,file}of frames)files[name]=new Uint8Array(await file.arrayBuffer());
 return new Blob([zipSync(files,{level:0})],{type:'application/zip'});
}
