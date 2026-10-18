// Comfy Cloud node catalog verified October 17, 2026. Partner API, not local weights.
export const workflowVersion='minimax-h3-take-v1';
export const minimaxModels={
 'MiniMax H3':{resolutions:['768P','2K'],minSeconds:4},
 'MiniMax H3 Max':{resolutions:['480P','768P'],minSeconds:5},
 'MiniMax H3 Max Turbo':{resolutions:['480P','768P'],minSeconds:5},
};
export const minimaxRatios=['16:9','4:3','1:1','3:4','9:16','21:9'];
export function minimaxTake({prompt,seconds=5,seed=42,model='MiniMax H3',resolution='768P',ratio='16:9',watermark=false,firstFrame}={}){
 const settings=minimaxModels[model];
 if(!settings)throw Error('Choose a supported MiniMax model.');
 if(typeof prompt!=='string'||prompt.trim().length<4||prompt.length>4000)throw Error('Describe the take in 4–4000 characters.');
 if(!Number.isInteger(seconds)||seconds<settings.minSeconds||seconds>15)throw Error(`Choose ${settings.minSeconds}–15 whole seconds.`);
 if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Seed must be an integer from 0 to 4294967295.');
 if(!settings.resolutions.includes(resolution)||!minimaxRatios.includes(ratio))throw Error('Unsupported resolution or aspect ratio.');
 if(typeof watermark!=='boolean')throw Error('Invalid watermark setting.');
 if(firstFrame!==undefined&&(typeof firstFrame!=='string'||!/^[-a-zA-Z0-9_]{1,180}\.(png|jpe?g|webp)$/i.test(firstFrame)))throw Error('Choose an uploaded Comfy first-frame image.');
 const recipe={version:firstFrame?'minimax-h3-first-frame-v1':workflowVersion,model,duration:seconds,resolution,ratio,seed,outputNode:'20',mode:firstFrame?'image-to-video':'text-to-video',spatialRepair:false,partnerApi:true,...(firstFrame?{firstFrame}:{}),workflow:{
 '1':{class_type:'MinimaxHailuo03TextToVideoNode',inputs:{model,'model.prompt':prompt.trim(),'model.resolution':resolution,'model.ratio':ratio,'model.duration':seconds,...(model==='MiniMax H3'?{}:{'model.prompt_expansion_mode':'balanced'}),seed,watermark}},
 '20':{class_type:'SaveVideo',inputs:{video:['1',0],filename_prefix:'haggsfield/minimax',format:'mp4','format.codec':'h264'}},
 }};
 if(firstFrame){recipe.workflow['1'].class_type='MinimaxHailuo03FirstLastFrameNode';delete recipe.workflow['1'].inputs['model.ratio'];recipe.workflow['1'].inputs.first_frame=['2',0];recipe.workflow['2']={class_type:'LoadImage',inputs:{image:firstFrame}};}
 return recipe;
}
