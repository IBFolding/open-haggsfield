import {validate,span,duration} from './sequence.js';
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const t=s=>`${Math.round(s*30)}/30s`;
export function fcpxml(doc,title='Open Haggsfield edit'){
 validate(doc);if(!doc.clips.length)throw Error('Add clips before exporting.');
 const used=doc.assets.filter(a=>doc.clips.some(c=>c.assetId===a.id));
 if(used.some(a=>a.simulated))throw Error('Remove simulated assets before interchange export.');
 const resource=a=>`r${used.indexOf(a)+2}`;
 const [w,h]=doc.format==='9:16'?[720,1280]:doc.format==='1:1'?[720,720]:[1280,720];
 const resources=used.map(a=>`<asset id="${resource(a)}" name="${xml(a.name)}" start="0s" duration="${t(a.duration)}" ${a.kind==='audio'?'hasAudio="1" audioSources="1" audioChannels="2" audioRate="48000"':'hasVideo="1" format="r1"'}><media-rep kind="original-media" src="file:///Haggsfield-Media/${encodeURIComponent(a.fileName||a.mediaId||a.id)}"/></asset>`).join('');
 const clips=doc.clips.map(c=>{const a=used.find(a=>a.id===c.assetId),track=doc.tracks.find(t=>t.id===c.trackId),lane=track.kind==='audio'?-(doc.tracks.filter(t=>t.kind==='audio').indexOf(track)+1):doc.tracks.filter(t=>t.kind==='video').length-doc.tracks.filter(t=>t.kind==='video').indexOf(track);return `<asset-clip name="${xml(a.name)}" ref="${resource(a)}" lane="${lane}" offset="${t(c.at)}" start="${t(c.in)}" duration="${t(span(c))}" enabled="${track.hidden?'0':'1'}"><adjust-volume amount="${track.muted||c.gain===0?'-96':(20*Math.log10(c.gain)).toFixed(3)}dB"/></asset-clip>`;}).join('');
 return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE fcpxml><fcpxml version="1.10"><resources><format id="r1" frameDuration="1/30s" width="${w}" height="${h}"/>${resources}</resources><library><event name="Open Haggsfield"><project name="${xml(title)}"><sequence format="r1" duration="${t(duration(doc))}" tcStart="0s" tcFormat="NDF"><spine><gap name="Timeline" offset="0s" start="0s" duration="${t(duration(doc))}">${clips}</gap></spine></sequence></project></event></library></fcpxml>`;
}
