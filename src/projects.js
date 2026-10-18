// Local, simulated production planner. No model request or financial transaction occurs here.
export const PROJECT_KEY = 'open-higgs-projects-v2';
export const money = n => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(n/100);
export const TYPES = [
  {id:'film',name:'Short film',hint:'A story worth watching',icon:'FilmSlate',image:'/assets/tokyo-car.png'},
  {id:'ad',name:'Ad campaign',hint:'Make them stop scrolling',icon:'Megaphone',image:'/assets/neon-portrait.png'},
  {id:'product',name:'Product video',hint:'Put your product in the spotlight',icon:'Cube',image:'/assets/tokyo-car.png'},
  {id:'music',name:'Music video',hint:'Give your sound a world',icon:'MusicNotes',image:'/assets/tokyo-nights.png'},
  {id:'social',name:'Social clip',hint:'A small moment. A big impression.',icon:'DeviceMobile',image:'/assets/neon-portrait.png'},
  {id:'image',name:'Image collection',hint:'Campaigns, portraits, and worlds',icon:'Images',image:'/assets/above-clouds.png'},
  {id:'animation',name:'Animation',hint:'Bring the impossible to life',icon:'Sparkle',image:'/assets/above-clouds.png'},
  {id:'custom',name:'Something else',hint:'Start with your own idea',icon:'Plus',image:'/assets/tokyo-nights.png'},
];
export const STYLES = [
  {id:'cinematic',name:'Cinematic',sub:'Film grain. Dramatic light.',image:'/assets/tokyo-car.png'},
  {id:'editorial',name:'Editorial',sub:'Expressive. Intimate. Intentional.',image:'/assets/neon-portrait.png'},
  {id:'dreamlike',name:'Dreamlike',sub:'Extraordinary worlds.',image:'/assets/above-clouds.png'},
  {id:'electric',name:'Electric',sub:'Color. Energy. Movement.',image:'/assets/tokyo-nights.png'},
];
export const defaultBrief = () => ({type:'film',title:'',idea:'',audience:'',style:'cinematic',format:'16:9',duration:15,count:4,quality:'balanced',assetMode:'create',refs:[],audio:'none',needsOriginal:false,soundtrackName:'',budget:1500,retries:1});
export function newProject(id, now=Date.now(), prefill={}) { return {id,brief:{...defaultBrief(),...prefill},step:0,status:'draft',tasks:[],spent:0,held:0,retriesUsed:0,approvedCap:0,createdAt:now,updatedAt:now}; }
export function chosenModel(b) {
 return {name:b.type==='image'?'Image generation not implemented':'Seedance 2.5',reason:b.type==='image'?'Import your own still images. This app does not currently submit image-generation requests.':'The connected video adapter supports Seedance 2.5. This is a fixed integration, not automatic model selection; account access and current cost are checked separately.',source:'https://console.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference'};
}
export function assetList(b) {
  return [
    {name:'Creative brief',detail:'Your idea, audience, and direction',state:b.idea.trim().length>=12?'ready':'needed'},
    {name:'Visual references',detail:b.refs.length?`${b.refs.length} local preview${b.refs.length===1?'':'s'} supplied`:b.assetMode==='own'?'Upload at least one reference':'Create a reference look from your brief',state:b.refs.length?'ready':b.assetMode==='own'?'needed':'create'},
    ...(b.needsOriginal?[{name:'Original product / brand image',detail:'Upload the exact product or brand asset you need preserved',state:b.refs.length?'ready':'needed'}]:[]),
    ...(b.type==='music'?[{name:'Your soundtrack',detail:b.soundtrackName||'Select your own licensed audio track',state:b.soundtrackName?'ready':'needed'}]:[]),
    ...(b.audio==='voice'?[{name:'Voiceover script',detail:'Draft copy for your review; no voice clone',state:'create'}]:[]),
    {name:b.type==='image'?'Image compositions':'Shot list & storyboard',detail:'Build a consistent sequence from your brief',state:'create'},
    ...(b.type!=='image'?[{name:'Assembly & export',detail:'A separate editing stage after shot approval',state:'create'}]:[]),
  ];
}
export function makePlan(b) {
  const isImage=b.type==='image'; const count=isImage?Number(b.count):Math.ceil(Number(b.duration)/5);
  const rate=b.quality==='final'?160:b.quality==='fast'?65:100;
  const stillRate=b.quality==='final'?40:20;
  const shotCost=isImage?stillRate:rate;
  const cover=STYLES.find(s=>s.id===b.style)?.image||STYLES[0].image;
  const beats=isImage?['Hero composition','Detail study','Alternate angle','Campaign variation']:['Set the scene','Introduce the subject','Build the moment','Find the detail','Shift the perspective','Leave an impression'];
  const tasks=[{id:'direction',name:'Draft creative direction',kind:'writing',cost:0,model:'Open Haggsfield planner',note:'Template-based draft in this preview',status:'pending'},
    ...(!b.refs.length?[{id:'references',name:'Create the visual reference',kind:'reference',cost:stillRate,model:'Marketing Studio Image',note:'Establish the look before producing shots',status:'pending'}]:[]),
    ...Array.from({length:count},(_,i)=>({id:`shot-${i+1}`,name:beats[i%beats.length],kind:isImage?'image':'shot',cost:shotCost,model:chosenModel(b).name,status:'pending',image: i%3===0?cover:i%3===1?'/assets/neon-portrait.png':'/assets/above-clouds.png',note:`${b.idea} — ${beats[i%beats.length].toLowerCase()}. ${b.style} style, ${b.format}.`,seconds:isImage?0:Math.min(5,Number(b.duration)-i*5)})),
    ...(!isImage?[{id:'assembly',name:'Assemble the review sequence',kind:'assembly',cost:25,model:'Open Haggsfield editor',note:'Storyboard preview only; no rendered film in demo',status:'pending'}]:[])];
  const base=tasks.reduce((sum,t)=>sum+t.cost,0); const retryReserve=Number(b.retries)*shotCost;
  return {tasks,base,retryReserve,total:base+retryReserve,shotCost,count,model:chosenModel(b),assets:assetList(b)};
}
export function initialProjects() {
  const a=newProject('sample-night-drive',Date.now()-3600000,{title:'Night Drive',idea:'A cinematic launch film for a silver sports car. Follow its journey through the neon streets of Tokyo.',style:'cinematic',duration:15}); a.step=3;a.example=true;
  const b=newProject('sample-above-clouds',Date.now()-86400000,{title:'Somewhere above the clouds',type:'image',idea:'A collection of dreamlike mountain temples above a sea of clouds, touched by warm sunrise.',style:'dreamlike',format:'1:1'});b.step=1;b.example=true;
  return {version:2,projects:[a,b],lastId:a.id,balance:5000,wallet:false,events:[]};
}
export function projectReducer(state,a) {
  const event=(kind,amount,projectId)=>({id:a.eventId||`${a.type}-${a.id||''}-${Date.now()}`,kind,amount,projectId,at:Date.now()});
  if(a.type==='create')return {...state,lastId:a.project.id,projects:[a.project,...state.projects]};
  if(a.type==='open')return {...state,lastId:a.id};
  if(a.type==='wallet')return {...state,wallet:a.value};
  if(a.type==='topup') {
    if(!state.wallet)throw Error('Connect the demo wallet first.');
    if(![1000,2500,5000].includes(a.amount))throw Error('Choose a demo top-up amount.');
    if(state.events.some(e=>e.id===a.eventId))return state;
    return {...state,balance:state.balance+a.amount,events:[...state.events,event('Demo top-up',a.amount)]};
  }
  const p=state.projects.find(p=>p.id===a.id); if(!p)return state;
  const replace=(next,extra={})=>({...state,...extra,projects:state.projects.map(x=>x.id===p.id?{...next,updatedAt:Date.now()}:x)});
  if(a.type==='edit') {
    if(!['draft'].includes(p.status))throw Error('Duplicate this project to change its approved brief.');
    return replace({...p,...a.patch,brief:{...p.brief,...a.brief}});
  }
  if(a.type==='plan')return replace({...p,step:3});
  if(a.type==='approve') {
    if(p.status!=='draft')return state;
    if(p.brief.idea.trim().length<12||!p.brief.title.trim())throw Error('Add a project name and a short brief.');
    const plan=makePlan(p.brief);
    if(plan.assets.some(x=>x.state==='needed'))throw Error('Supply the required originals before starting.');
    if(!Number.isSafeInteger(p.brief.budget)||p.brief.budget<=0||plan.total>p.brief.budget)throw Error('The plan exceeds your spending cap. Adjust the plan or raise the cap.');
    if(state.balance<plan.total)throw Error('Add demo credits to cover this plan.');
    return replace({...p,status:'running',tasks:plan.tasks,approvedCap:p.brief.budget,held:plan.total,spent:0}, {balance:state.balance-plan.total,events:[...state.events,event('Production budget reserved',-plan.total,p.id)]});
  }
  if(a.type==='pause'&&p.status==='running')return replace({...p,status:'paused'});
  if(a.type==='resume'&&p.status==='paused')return replace({...p,status:'running'});
  if(a.type==='cancel'&&['running','paused'].includes(p.status))return replace({...p,status:'canceled',held:0},{balance:state.balance+p.held,events:[...state.events,event('Unspent budget returned',p.held,p.id)]});
  if(a.type==='tick'&&p.status==='running') {
    const task=p.tasks.find(t=>t.status==='pending'); if(!task||task.id!==a.taskId)return state;
    if(task.cost>p.held||p.spent+task.cost>p.approvedCap) return replace({...p,status:'paused'});
    const tasks=p.tasks.map(t=>t.id===task.id?{...t,status:'done'}:t);const done=tasks.every(t=>t.status==='done');const held=p.held-task.cost;
    return replace({...p,tasks,spent:p.spent+task.cost,held:done?0:held,status:done?'review':'running'},done?{balance:state.balance+held,events:[...state.events,event('Unused retry reserve returned',held,p.id)]}:{});
  }
  if(a.type==='retry'&&p.status==='review') {
    const task=p.tasks.find(t=>t.id===a.taskId&&['shot','image'].includes(t.kind));if(!task)return state;
    if(p.retriesUsed>=p.brief.retries)throw Error('The approved retry limit has been reached.');
    if(p.spent+task.cost>p.approvedCap)throw Error('This retry exceeds your approved spending cap.');
    if(state.balance<task.cost)throw Error('Not enough demo credits for a retry.');
    return replace({...p,status:'running',held:task.cost,retriesUsed:p.retriesUsed+1,tasks:p.tasks.map(t=>t.id===task.id?{...t,status:'pending'}:t)},{balance:state.balance-task.cost,events:[...state.events,event('Shot retry reserved',-task.cost,p.id)]});
  }
  return state;
}
export function readProjects() {
  try { const s=JSON.parse(localStorage.getItem(PROJECT_KEY));if(s?.version!==2||!Array.isArray(s.projects)||!Number.isSafeInteger(s.balance))return initialProjects();return {...s,projects:s.projects.map(p=>p.status==='running'?{...p,status:'paused'}:p)}; } catch{return initialProjects();}
}
