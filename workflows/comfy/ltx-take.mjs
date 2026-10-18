// A bounded open-weight T2V graph, following Lightricks' LTX-2.5 single-stage
// distilled example. Text conditioning runs locally on Comfy, not a partner API.
export const workflowVersion='ltx-2.5-take-v1';
export function ltxTake({prompt,seconds=5,seed=42}={}){
 if(typeof prompt!=='string'||prompt.trim().length<4||prompt.length>4000)throw Error('Describe the take in 4–4000 characters.');
 if(!Number.isFinite(seconds)||seconds<1||seconds>10)throw Error('Choose 1–10 seconds.');
 if(!Number.isSafeInteger(seed)||seed<0)throw Error('Use a nonnegative integer seed.');
 const fps=24,frames=Math.ceil((seconds*fps-1)/8)*8+1;
 const n=(class_type,inputs)=>({class_type,inputs});
 const promptGraph={
 '1':n('UNETLoader',{unet_name:'ltx-2.5-22b-distilled-transformer-bf16.safetensors',weight_dtype:'default'}),
 '2':n('CLIPLoader',{clip_name:'gemma4-12b-with-proj-ltx-2.5-bf16.safetensors',type:'ltxv',device:'default'}),
 '3':n('VAELoader',{vae_name:'ltx-2.5-video-vae-bf16.safetensors'}),
 '4':n('VAELoader',{vae_name:'ltx-2.5-audio-vae-bf16.safetensors'}),
 '5':n('CLIPTextEncode',{clip:['2',0],text:prompt.trim()}),
 '6':n('CLIPTextEncode',{clip:['2',0],text:'blurry, distorted, flickering'}),
 '7':n('LTXVConditioning',{positive:['5',0],negative:['6',0],frame_rate:fps}),
 '8':n('EmptyLTXVLatentVideo',{width:960,height:544,length:frames,batch_size:1}),
 '9':n('LTXVEmptyLatentAudio',{audio_vae:['4',0],frames_number:frames,frame_rate:fps,batch_size:1}),
 '10':n('LTXVConcatAVLatent',{video_latent:['8',0],audio_latent:['9',0]}),
 '11':n('RandomNoise',{noise_seed:seed}),
 '12':n('CFGGuider',{model:['1',0],positive:['7',0],negative:['7',1],cfg:1}),
 '13':n('KSamplerSelect',{sampler_name:'euler_ancestral'}),
 '14':n('ManualSigmas',{sigmas:'1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0'}),
 '15':n('SamplerCustomAdvanced',{noise:['11',0],guider:['12',0],sampler:['13',0],sigmas:['14',0],latent_image:['10',0]}),
 '16':n('LTXVSeparateAVLatent',{av_latent:['15',0]}),
 '17':n('VAEDecodeTiled',{samples:['16',0],vae:['3',0],tile_size:512,overlap:64,temporal_size:128,temporal_overlap:32}),
 '18':n('LTXVAudioVAEDecode',{samples:['16',1],audio_vae:['4',0]}),
 '19':n('CreateVideo',{images:['17',0],audio:['18',0],fps}),
 '20':n('SaveVideo',{video:['19',0],filename_prefix:'haggsfield/take',format:'mp4',codec:'h264'}),
 };
 return {version:workflowVersion,workflow:promptGraph,outputNode:'20',width:960,height:544,fps,frames,duration:frames/fps,seed,mode:'text-to-video',spatialRepair:false};
}
export {inspectWorkflow} from './inspect-workflow.mjs';
