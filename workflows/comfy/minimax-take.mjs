// Comfy Cloud node catalog verified October 17, 2026. Partner API, not local weights.
export const workflowVersion='minimax-h3-take-v1';
export const minimaxModels={
 'MiniMax H3':{resolutions:['768P','2K'],minSeconds:4},
 'MiniMax H3 Max':{resolutions:['480P','768P'],minSeconds:5},
 'MiniMax H3 Max Turbo':{resolutions:['480P','768P'],minSeconds:5},
};
export const minimaxRatios=['16:9','4:3','1:1','3:4','9:16','21:9'];
export function minimaxTake({prompt,seconds=5,seed=42,model='MiniMax H3',resolution='768P',ratio='16:9',watermark=false,firstFrame,lastFrame,referenceImages=[],referenceDetail='standard',promptExpansion='balanced',mode}={}){
 const settings=minimaxModels[model];
 if(!settings)throw Error('Choose a supported MiniMax model.');
 if(typeof prompt!=='string'||prompt.trim().length<4||prompt.length>4000)throw Error('Describe the take in 4–4000 characters.');
 if(!Number.isInteger(seconds)||seconds<settings.minSeconds||seconds>15)throw Error(`Choose ${settings.minSeconds}–15 whole seconds.`);
 if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Seed must be an integer from 0 to 4294967295.');
 if(!settings.resolutions.includes(resolution)||!minimaxRatios.includes(ratio))throw Error('Unsupported resolution or aspect ratio.');
 if(typeof watermark!=='boolean')throw Error('Invalid watermark setting.');
 if(firstFrame!==undefined&&(typeof firstFrame!=='string'||!/^[-a-zA-Z0-9_]{1,180}\.(png|jpe?g|webp)$/i.test(firstFrame)))throw Error('Choose an uploaded Comfy first-frame image.');
 if(!['standard','high'].includes(referenceDetail)||!['balanced','quality'].includes(promptExpansion))throw Error('Choose valid reference detail and prompt expansion.');
 if(!Array.isArray(referenceImages)||referenceImages.length>9||referenceImages.some(x=>typeof x!=='string'||!/^[-a-zA-Z0-9_]{1,180}\.(png|jpe?g|webp)$/i.test(x)))throw Error('Choose up to nine uploaded reference images.');
 if(lastFrame!==undefined&&(typeof lastFrame!=='string'||!/^[-a-zA-Z0-9_]{1,180}\.(png|jpe?g|webp)$/i.test(lastFrame)))throw Error('Choose an uploaded last-frame image.');
 if(lastFrame&&!firstFrame)throw Error('A last frame requires a first frame.');
 if(referenceImages.length&&(firstFrame||lastFrame))throw Error('Use reference images or first/last frames, not both.');
 if(referenceImages.length&&model==='MiniMax H3 Max Turbo')throw Error('Reference-to-video supports H3 or H3 Max.');
 if(referenceImages.length&&model==='MiniMax H3 Max'&&watermark)throw Error('H3 Max reference mode requires watermark off.');
 const inferred=referenceImages.length?'reference-to-video':lastFrame?'first-last-frame':firstFrame?'image-to-video':'text-to-video';
 if(mode!==undefined&&mode!==inferred)throw Error('Add the required media for the selected generation mode.');
 const recipe={version:firstFrame?'minimax-h3-first-frame-v1':workflowVersion,model,duration:seconds,resolution,ratio,seed,outputNode:'20',mode:firstFrame?'image-to-video':'text-to-video',spatialRepair:false,partnerApi:true,...(firstFrame?{firstFrame}:{}),workflow:{
 '1':{class_type:'MinimaxHailuo03TextToVideoNode',inputs:{model,'model.prompt':prompt.trim(),'model.resolution':resolution,'model.ratio':ratio,'model.duration':seconds,...(model==='MiniMax H3'?{}:{'model.prompt_expansion_mode':promptExpansion}),seed,watermark}},
 '20':{class_type:'SaveVideo',inputs:{video:['1',0],filename_prefix:'haggsfield/minimax',format:'mp4','format.codec':'h264'}},
 }};
 if(firstFrame){recipe.workflow['1'].class_type='MinimaxHailuo03FirstLastFrameNode';delete recipe.workflow['1'].inputs['model.ratio'];recipe.workflow['1'].inputs.first_frame=['2',0];recipe.workflow['2']={class_type:'LoadImage',inputs:{image:firstFrame}};}
 if(lastFrame){recipe.version='minimax-h3-first-last-frame-v1';recipe.mode='first-last-frame';recipe.lastFrame=lastFrame;recipe.workflow['3']={class_type:'LoadImage',inputs:{image:lastFrame}};recipe.workflow['1'].inputs.last_frame=['3',0];}
 if(referenceImages.length){
  recipe.version='minimax-h3-reference-v1';recipe.mode='reference-to-video';recipe.referenceImages=[...referenceImages];recipe.referenceDetail=referenceDetail;
  recipe.workflow['1'].class_type='MinimaxHailuo03ReferenceNode';
  if(model==='MiniMax H3 Max')recipe.workflow['1'].inputs['model.reference_detail']=referenceDetail;
  referenceImages.forEach((image,i)=>{const id=String(i+2);recipe.workflow[id]={class_type:'LoadImage',inputs:{image}};recipe.workflow['1'].inputs[`model.reference_images.image_${i+1}`]=[id,0];});
 }
 return recipe;
}
