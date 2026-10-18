import {useState} from 'react';
import {assemble,initialBrief,recipe} from './recipe.js';
import {titleCard} from './title-card.js';
import {saveMedia} from '../media-store.js';
import {saveStudio} from '../studio/storage.js';
import './templates.css';
export function TryStudio({onCreate}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function start(){setBusy(true);setError('');try{
  const brief={...initialBrief,template:'cinematic-sizzle',brand:'OPEN HAGGSFIELD',product:'Night Drive · editing practice',audience:'A driver searching for a lost connection',benefit:'One last journey through the city',detail:'The person waiting may already be gone',cta:'NIGHT DRIVE',duration:30,format:'16:9'};
  const refs=[{id:'car',name:'Car composition · illustrative still',url:'/assets/tokyo-car.png'},{id:'city',name:'City atmosphere · illustrative still',url:'/assets/tokyo-nights.png'},{id:'portrait',name:'Character mood · illustrative still',url:'/assets/neon-portrait.png'}];
  const {project,studio}=assemble(brief,refs,recipe(brief).map(beat=>titleCard(brief,beat.text)));
  project.practice=true;
  for(const a of studio.assets){const response=await fetch(a.url);if(!response.ok)throw Error('A practice image could not load.');await saveMedia(a.mediaId,await response.blob());a.url=null;}
  saveStudio(studio);onCreate(project);
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 return <main className="tpl-page"><div className="tpl-heading"><div><p className="tpl-eyebrow">TRY THE EDITOR / NO SIGN-IN</p><h1>Your cut. Your decisions.</h1><p>Explore the real editing tools without a subscription or a generation charge.</p></div><a href="https://github.com/IBFolding/open-haggsfield">Open-source code ↗</a></div><div className="tpl-layout"><section className="tpl-form"><h2>Night Drive · editing practice</h2><p>Open a fresh 30-second photo sequence with six shots, separate title overlays and original references. These are illustrative stills made for the app, not MiniMax-generated video.</p><ol><li>Select a timeline clip and trim its beginning or end.</li><li>Move clips, edit titles or import a video from your device.</li><li>Keep the original source, compare takes and undo changes.</li><li>Export your sequence from the browser.</li></ol><button className="tpl-primary" disabled={busy} onClick={start}>{busy?'Preparing your practice cut…':'Open a fresh practice cut →'}</button><a className="tpl-secondary" href="#/templates">Start with my own references</a>{error&&<p role="alert" className="tpl-error">{error}</p>}<div className="tpl-budget"><strong>What requires an account?</strong><p>Private cloud checkpoints require sign-in. Paid generation requires your own provider key, a membership, an enabled server and explicit cost confirmation. This practice cut makes no provider requests.</p></div></section><aside className="tpl-preview"><img style={{width:'100%',borderRadius:12}} src="/assets/tokyo-car.png" alt="Night Drive illustrative reference"/><p>Each visit creates an independent project. Earlier edits stay intact.</p><a href="#/contest">Watch the contest walkthrough →</a></aside></div></main>;
}
