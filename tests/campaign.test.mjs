import test from 'node:test';import assert from 'node:assert/strict';
import {migrate,reduce,duration} from '../src/studio/sequence.js';
import {seedEdit} from '../src/editor.js';
import {campaignCut,revisionReport} from '../src/studio/campaign.js';
const state=()=>{const p={id:'campaign-test',example:true,brief:{refs:[]}};return migrate(p,seedEdit(p));};
test('approved shots block direct changes, overwrite and indirect ripple until reopened',()=>{
 const original=state();let s=reduce(original,{type:'shotReview',id:'shot-1',status:'approved'});const clip=s.clips[1];
 for(const a of [{type:'delete',id:clip.id},{type:'trim',id:clip.id,in:0,out:2},{type:'delete',id:s.clips[0].id,ripple:true},{type:'insert',id:'new',assetId:clip.assetId,trackId:'v1',at:5,out:2,mode:'overwrite'},{type:'assetMeta',id:clip.assetId,patch:{mediaId:'changed'}},{type:'track',id:'v1',patch:{hidden:true}}])assert.throws(()=>reduce(s,a),/Reopen/);
 s=reduce(s,{type:'shotReview',id:'shot-1',status:'needs-work',notes:'Replace the car'});assert.equal(revisionReport(s)[1].notes,'Replace the car');assert.equal(reduce(s,{type:'delete',id:clip.id}).clips.length,2);assert.equal(original.shots[1].status,undefined);
});
test('alternate cuts align all tracks, retain source offsets and preserve original',()=>{
 let s=state();const source={...s.assets[0],id:'music',kind:'audio',duration:20};s=reduce(s,{type:'asset',asset:source});s=reduce(s,{type:'insert',id:'audio',assetId:'music',trackId:'a1',at:0,in:2,out:17});s=reduce(s,{type:'marker',id:'note',at:6,name:'Beat'});
 const before=structuredClone(s),cut=campaignCut(s,{start:3,seconds:7,format:'9:16'});assert.equal(duration(cut),7);assert.deepEqual(cut.clips.find(c=>c.id==='audio'),{id:'audio',assetId:'music',trackId:'a1',at:0,in:5,out:12,gain:1,fadeIn:0,fadeOut:0});assert.equal(cut.markers[0].at,3);assert.equal(cut.format,'9:16');assert.deepEqual(s,before);assert.equal(cut.assets.length,s.assets.length);assert.equal(cut.shots[0].status,'unreviewed');
});
test('cuts reject invented duration, invalid format and nonfinite ranges',()=>{for(const args of [{start:0,seconds:60},{start:-1,seconds:5},{start:0,seconds:NaN},{start:0,seconds:5,format:'bad'}])assert.throws(()=>campaignCut(state(),args));});
