import {newProject} from '../projects.js';
import {migrate,validate} from '../studio/sequence.js';
export const BRAND_KEY='open-haggsfield-brand-kit-v1';
export const initialBrief={brand:'',product:'',audience:'',benefit:'',detail:'',cta:'Shop now',color:'#e4ed83',font:'sans-serif',format:'9:16',duration:15,hook:0};
export function hooks(b){return [`Meet ${b.product||'your next favourite'}.`,`${b.benefit||'A better everyday'}.`, `Made for ${b.audience||'your everyday'}.`];}
export function recipe(b){
 if(!b.product.trim()||!b.brand.trim()||!b.benefit.trim()||!b.audience.trim()||!b.cta.trim())throw Error('Add your brand, product, audience, main benefit and call to action.');
 if(!['9:16','1:1','16:9'].includes(b.format)||![15,30].includes(Number(b.duration))||!/^#[a-f\d]{6}$/i.test(b.color)||!['sans-serif','serif','monospace'].includes(b.font)||![0,1,2].includes(Number(b.hook)))throw Error('Choose valid format, duration and brand styling.');
 const d=Number(b.duration)/5;
 return [
  {name:'Hook',text:hooks(b)[b.hook],direction:'Open on the supplied product, with strong contrast and a restrained camera push.'},
  {name:'Product reveal',text:b.product,direction:'Clean hero composition. Keep the product shape, label and colour unchanged.'},
  {name:'Main benefit',text:b.benefit,direction:'Illustrate the user-supplied benefit. Do not invent claims or product capabilities.'},
  {name:'Detail',text:b.detail||`Designed for ${b.audience}`,direction:'Close detail of the supplied product. Use the second reference when supplied.'},
  {name:'Call to action',text:b.cta,direction:'Hold on a clear product end card with readable brand and call to action.'}
 ].map((x,i)=>({...x,at:i*d,seconds:d,prompt:`${x.direction} Product: ${b.product}. Brand: ${b.brand}. Audience: ${b.audience}. On-screen copy is added in editing; do not generate text. ${b.format}.`}));
}
export function assemble(b,refs,cards,id=crypto.randomUUID()){
 const beats=recipe(b);if(!refs.length)throw Error('Add at least one product image.');if(cards.length!==beats.length)throw Error('Create all five title cards first.');
 const p=newProject(id,Date.now(),{title:`${b.product} — product launch`,type:'product',idea:`${b.brand}: ${b.product}. ${b.benefit}. For ${b.audience}.`,audience:b.audience,format:b.format,duration:Number(b.duration),assetMode:'own',refs,needsOriginal:true});
 p.template={id:'product-launch',version:1,brief:{...b},beats};p.step=3;
 const s=migrate(p,{clips:[]});s.assets=[];s.shots=[];s.template=p.template;s.format=b.format;
 beats.forEach((beat,i)=>{const shotId=`launch-shot-${i}`,ref=refs[i%refs.length];s.shots.push({id:shotId,sceneId:'scene-1',name:beat.name,notes:beat.prompt});
 for(const [kind,url,trackId] of [['product',ref.url,'v1'],['title',cards[i],'v2']]){const assetId=`${id}-${kind}-${i}`;s.assets.push({id:assetId,mediaId:assetId,name:kind==='title'?beat.text:`${beat.name} · ${ref.name}`,kind:'image',category:kind==='title'?'footage':'references',url,duration:beat.seconds,status:'unreviewed',tags:['product-launch',kind],sceneId:'scene-1',shotId,take:1,prompt:beat.prompt});s.clips.push({id:`clip-${kind}-${i}`,assetId,trackId,at:beat.at,in:0,out:beat.seconds,gain:1,fadeIn:0,fadeOut:0});}
 s.markers.push({id:`beat-${i}`,at:beat.at,name:`${beat.name}: ${beat.text}`});});
 return {project:p,studio:validate(s)};
}
export function dimensions(format,size=720){return format==='9:16'?{width:size,height:Math.round(size*16/9)}:format==='1:1'?{width:size,height:size}:{width:Math.round(size*16/9),height:size};}
