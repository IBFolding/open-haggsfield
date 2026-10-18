import {newProject} from '../projects.js';
import {migrate,validate} from '../studio/sequence.js';
export const BRAND_KEY='open-haggsfield-brand-kit-v1';
export const initialBrief={template:'product-launch',look:'cinematic',referenceIds:{},brand:'',product:'',audience:'',benefit:'',detail:'',cta:'Shop now',color:'#e4ed83',font:'sans-serif',format:'9:16',duration:15,hook:0};
export const isSizzle=b=>b.template==='cinematic-sizzle';
export const looks={cinematic:'Restrained cinematic lighting, natural textures, controlled contrast and slow camera movement.',noir:'Low-key lighting, deep shadows, restrained colour and deliberate locked compositions.',dreamlike:'Soft backlight, atmospheric depth, gentle movement and tactile natural textures.'};
export function hooks(b){if(isSizzle(b))return [b.benefit||'Every promise has a price.',`What would ${b.audience||'your hero'} risk losing?`,b.detail||'Some things outlive us.'];return [`Meet ${b.product||'your next favourite'}.`,`${b.benefit||'A better everyday'}.`, `Made for ${b.audience||'your everyday'}.`];}
export function recipe(b){
 if(!b.product.trim()||!b.brand.trim()||!b.benefit.trim()||!b.audience.trim()||!b.cta.trim())throw Error(isSizzle(b)?'Add a studio, film title, lead character, story premise and end-card text.':'Add your brand, product, audience, main benefit and call to action.');
 if(!['9:16','1:1','16:9'].includes(b.format)||!(isSizzle(b)?[30,60]:[15,30]).includes(Number(b.duration))||!/^#[a-f\d]{6}$/i.test(b.color)||!['sans-serif','serif','monospace'].includes(b.font)||![0,1,2].includes(Number(b.hook)))throw Error('Choose valid format, duration and brand styling.');
 if(!Object.hasOwn(looks,b.look||'cinematic'))throw Error('Choose a valid visual direction.');
 if(isSizzle(b)){
  const d=Number(b.duration)/6;
  return [
   ['The promise',hooks(b)[b.hook],'Open on a quiet, intimate moment that establishes what the lead loves.'],
   ['The bond',b.audience,'Show a specific human connection. Preserve the supplied character design and wardrobe.'],
   ['The fracture',b.detail||'Everything can change.','Reveal the event that threatens the relationship. Keep violence implied.'],
   ['The cost',b.benefit,'Focus on the emotional consequence, an absence or an unfinished gesture.'],
   ['The choice','What would you give to keep it?','Escalate toward one decisive action. Do not resolve the story or invent canon.'],
   ['The title',b.cta,'End on a strong visual motif. Leave room for the title added in editing.']
  ].map(([name,text,direction],i)=>({name,text,direction,at:i*d,seconds:d,prompt:`${direction} Film: ${b.product}. Lead: ${b.audience}. Premise: ${b.benefit}. Stakes: ${b.detail}. ${looks[b.look||'cinematic']} Match the assigned reference; it guides appearance, not guaranteed identity. No generated text; titles are added in editing. ${b.format}.`}));
 }
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
 const beats=recipe(b);if(!refs.length)throw Error('Add at least one product image or story reference.');if(cards.length!==beats.length)throw Error('Create a title card for every beat first.');
 const p=newProject(id,Date.now(),{title:`${b.product} — ${isSizzle(b)?'cinematic sizzle':'product launch'}`,type:isSizzle(b)?'film':'product',idea:`${b.brand}: ${b.product}. ${b.benefit}. For ${b.audience}.`,audience:b.audience,format:b.format,duration:Number(b.duration),assetMode:'own',refs,needsOriginal:true});
 p.template={id:isSizzle(b)?'cinematic-sizzle':'product-launch',version:2,brief:{...b},beats};p.step=3;
 const s=migrate(p,{clips:[]});s.assets=[];s.shots=[];s.template=p.template;s.format=b.format;
 beats.forEach((beat,i)=>{const shotId=`launch-shot-${i}`,ref=refs.find(r=>r.id===b.referenceIds?.[i])||refs[i%refs.length];s.shots.push({id:shotId,sceneId:'scene-1',name:beat.name,notes:beat.prompt});
 for(const [kind,url,trackId] of [['product',ref.url,'v1'],['title',cards[i],'v2']]){const assetId=`${id}-${kind}-${i}`;s.assets.push({id:assetId,mediaId:assetId,name:kind==='title'?beat.text:`${beat.name} · ${ref.name}`,kind:'image',category:kind==='title'?'footage':'references',url,duration:beat.seconds,status:'unreviewed',tags:[p.template.id,kind],sceneId:'scene-1',shotId,take:1,prompt:beat.prompt});s.clips.push({id:`clip-${kind}-${i}`,assetId,trackId,at:beat.at,in:0,out:beat.seconds,gain:1,fadeIn:0,fadeOut:0});}
 s.markers.push({id:`beat-${i}`,at:beat.at,name:`${beat.name}: ${beat.text}`});});
 return {project:p,studio:validate(s)};
}
export function dimensions(format,size=720){return format==='9:16'?{width:size,height:Math.round(size*16/9)}:format==='1:1'?{width:size,height:size}:{width:Math.round(size*16/9),height:size};}
