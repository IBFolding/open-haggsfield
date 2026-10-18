import {useState} from 'react';
import {BRAND_KEY,initialBrief,hooks,recipe,assemble,isSizzle,looks} from './recipe.js';
import {saveMedia,mediaBlob} from '../media-store.js';
import {saveStudio} from '../studio/storage.js';
import {titleCard} from './title-card.js';
import './templates.css';

export function TemplateStudio({onCreate}){
 const [b,setB]=useState(()=>{try{return {...initialBrief,...JSON.parse(localStorage.getItem(BRAND_KEY)||'{}')};}catch{return initialBrief;}});
 const [refs,setRefs]=useState([]),[step,setStep]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const cinematic=isSizzle(b),set=(key,value)=>setB(v=>({...v,[key]:value}));
 const fields=cinematic?[['brand','Studio / creator'],['product','Film title'],['audience','Lead character & relationship'],['benefit','Story premise'],['detail','What can they lose?'],['cta','End-card text']]:[['brand','Brand name'],['product','Product name'],['audience','Who is it for?'],['benefit','One clear benefit'],['detail','Supporting detail (optional)'],['cta','Call to action']];
 function choose(template){setB(v=>({...v,template,format:template==='cinematic-sizzle'?'16:9':'9:16',duration:template==='cinematic-sizzle'?60:15,cta:template==='cinematic-sizzle'?'Coming soon':'Shop now',hook:0}));setStep(0);setError('');}
 async function upload(e){const files=Array.from(e.target.files||[]);e.target.value='';setBusy(true);setError('');try{const added=[];for(const f of files.slice(0,6-refs.length)){if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>10*1024*1024)throw Error('Use JPG, PNG or WebP under 10 MB.');const image=await createImageBitmap(f),c=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(image.width,image.height));c.width=image.width*scale;c.height=image.height*scale;c.getContext('2d').drawImage(image,0,0,c.width,c.height);image.close();added.push({id:crypto.randomUUID(),name:f.name,url:c.toDataURL('image/jpeg',.86)});}setRefs(r=>[...r,...added]);}catch(e){setError(e.message);}finally{setBusy(false);}}
 function next(){try{recipe(b);if(!refs.length)throw Error('Add at least one original image to build your first cut.');setError('');setStep(1);}catch(e){setError(e.message);}}
 async function build(){setBusy(true);setError('');try{const {project,studio}=assemble(b,refs,recipe(b).map(beat=>titleCard(b,beat.text)));for(const asset of studio.assets){const blob=await mediaBlob(asset.url);await saveMedia(asset.mediaId,blob);asset.url=null;}saveStudio(studio);onCreate(project);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <main className="tpl-page">
  <div className="tpl-heading"><div><p className="tpl-eyebrow">FROM REFERENCES TO THE FINAL CUT</p><h1>Give your story a structure.</h1><p>Choose a recipe. Bring your look. Keep control of every shot.</p></div><span className="tpl-pill">EDIT FIRST · GENERATE WHEN READY</span></div>
  <div className="tpl-recipes" role="group" aria-label="Choose a creator recipe">
   <button aria-pressed={!cinematic} onClick={()=>choose('product-launch')}><small>01 / CREATOR & PRODUCT</small><strong>Stop the scroll.</strong><span>Hook → reveal → benefit → detail → action<br/>15 or 30 seconds · vertical, square or wide</span></button>
   <button aria-pressed={cinematic} onClick={()=>choose('cinematic-sizzle')}><small>02 / CINEMATIC SIZZLE</small><strong>Make them feel it.</strong><span>Promise → bond → fracture → cost → choice → title<br/>30 or 60 seconds · a complete emotional arc</span></button>
  </div>
  <div className="tpl-steps"><button onClick={()=>setStep(0)} aria-current={step===0?'step':undefined}>01 · Brief & references</button><button onClick={next} aria-current={step===1?'step':undefined}>02 · Direct your cut</button><span>03 · Refine in the studio</span></div>
  {error&&<p role="alert" className="tpl-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className="tpl-layout"><section className="tpl-form">{step===0?<>
   <h2>{cinematic?'Start with what matters.':'Make it yours.'}</h2><p>{cinematic?'Give the audience someone to love, something to lose and a reason to keep watching.':'Use your own product photos and real claims. Choose your opening before you generate.'}</p>
   <div className="tpl-fields">{fields.map(([key,label])=><label key={key}>{label}<input maxLength={key==='benefit'||key==='detail'?180:100} value={b[key]} onChange={e=>set(key,e.target.value)}/></label>)}
    <label>Accent colour<input type="color" value={b.color} onChange={e=>set('color',e.target.value)}/></label>
    <label>Typography<select value={b.font} onChange={e=>set('font',e.target.value)}><option value="sans-serif">Modern sans</option><option value="serif">Editorial serif</option><option value="monospace">Technical mono</option></select></label>
    <label>Delivery format<select value={b.format} onChange={e=>set('format',e.target.value)}><option>9:16</option><option>1:1</option><option>16:9</option></select></label>
    <label>Length<select value={b.duration} onChange={e=>set('duration',Number(e.target.value))}>{(cinematic?[30,60]:[15,30]).map(n=><option key={n} value={n}>{n} seconds</option>)}</select></label>
    {cinematic&&<label>Visual direction<select value={b.look} onChange={e=>set('look',e.target.value)}>{Object.keys(looks).map(k=><option key={k} value={k}>{k[0].toUpperCase()+k.slice(1)}</option>)}</select></label>}
   </div>
   <button className="tpl-secondary" onClick={()=>{try{localStorage.setItem(BRAND_KEY,JSON.stringify({brand:b.brand,color:b.color,font:b.font}));setNotice('Creator name, colour and typography saved on this device.');}catch{setError('Device storage is full. Brand kit was not saved.');}}}>Save reusable styling</button>
   <h3>{cinematic?'Characters, world & visual references':'Product & lifestyle references'}</h3><p>1–6 original images. Assign the right reference to each beat in the next step. Local assembly is free.</p>
   <div className="tpl-refs">{refs.map(r=><div key={r.id}><img src={r.url} alt={r.name}/><button onClick={()=>setRefs(refs.filter(x=>x.id!==r.id))}>Remove {r.name}</button></div>)}</div>
   <label className="tpl-upload">{busy?'Preparing images…':'Add reference images'}<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy||refs.length>=6} onChange={upload}/></label>
   <button className="tpl-primary" onClick={next} disabled={busy}>Direct your cut →</button>
  </>:<>
   <h2>{cinematic?'Build the feeling. Then the film.':'Win the first three seconds.'}</h2><p>Choose an opening and assign each image. These originals and titles become separate editable tracks.</p>
   <div className="tpl-hooks">{hooks(b).map((h,i)=><button key={i} aria-pressed={Number(b.hook)===i} onClick={()=>set('hook',i)}><small>OPENING 0{i+1}</small><strong>{h}</strong></button>)}</div>
   <ol className="tpl-beats">{recipe(b).map((x,i)=><li key={x.name}><time>{x.at}–{x.at+x.seconds}s</time><div><strong>{x.name}</strong><p>{x.text}</p><details><summary>Shot direction</summary><p>{x.direction}</p></details><label>Reference<select aria-label={`Reference for ${x.name}`} value={refs.some(r=>r.id===b.referenceIds?.[i])?b.referenceIds[i]:refs[i%refs.length]?.id} onChange={e=>set('referenceIds',{...b.referenceIds,[i]:e.target.value})}>{refs.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label></div></li>)}</ol>
   <div className="tpl-budget"><strong>Editable first cut · $0 provider spend</strong><p>{cinematic?'Six':'Five'} photo scenes, separate title overlays and shot prompts. This is a photo assembly. Generated motion, music and narration are not included.</p><p>Next: select a shot in the studio → Generate → MiniMax H3. Review a price before submitting. Completed takes return for comparison; replace only the part you choose.</p></div>
   <button className="tpl-primary" onClick={build} disabled={busy}>{busy?'Building your cut…':'Build editable first cut →'}</button><button className="tpl-secondary" onClick={()=>setStep(0)}>Back to references</button>
  </>}</section>
  <aside className="tpl-preview"><p className="tpl-eyebrow">YOUR OPENING / LIVE PREVIEW</p><div className="tpl-poster" style={{aspectRatio:b.format.replace(':','/'),fontFamily:b.font}}>{refs[0]?<img src={refs.find(r=>r.id===b.referenceIds?.[0])?.url||refs[0].url} alt="Opening reference preview"/>:<div className="tpl-placeholder">Your reference goes here</div>}<span style={{color:b.color}}>{b.brand||'YOUR NAME'}</span><div><i style={{background:b.color}}/><h2>{hooks(b)[b.hook]}</h2></div></div><p>Originals stay in your library. Compare takes, replace a section, undo and export your cut.</p><div className="tpl-included"><strong>{cinematic?'Cinematic sizzle':'Creator / product reel'} · {b.duration}s</strong><p>{cinematic?6:5} shots · independent titles · assigned references · timed markers · shot prompts · {b.format}</p></div><p>No account or subscription needed for local editing. Cloud backup and provider generation have separate requirements.</p></aside></div>
 </main>;
}
