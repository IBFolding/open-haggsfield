import test from 'node:test';import assert from 'node:assert/strict';import{minimaxTake,minimaxModels}from'../workflows/comfy/minimax-take.mjs';import{inspectWorkflow}from'../workflows/comfy/inspect-workflow.mjs';
test('MiniMax is a bounded partner workflow with native video output and model-specific settings',()=>{
 for(const model of Object.keys(minimaxModels)){const r=minimaxTake({prompt:'A cinematic sunset',model});assert.equal(r.workflow['1'].class_type,'MinimaxHailuo03TextToVideoNode');assert.equal(r.workflow['1'].inputs['model.duration'],5);assert.deepEqual(r.workflow['20'].inputs.video,['1',0]);assert.equal(r.partnerApi,true);assert.equal(r.spatialRepair,false);assert.ok(!JSON.stringify(r.workflow).includes('LTX'));}
 for(const patch of [{seconds:3},{seconds:16},{seconds:5.5},{seed:-1},{seed:4294967296},{resolution:'720P'},{ratio:'2:1'},{model:'unknown'},{model:'MiniMax H3 Max',resolution:'2K'},{model:'MiniMax H3 Max',seconds:4}])assert.throws(()=>minimaxTake({prompt:'A cinematic sunset',...patch}));
});
test('dynamic input inspection checks selected branch and nested required fields',()=>{
 const catalog={Generate:{input:{required:{model:['COMFY_DYNAMICCOMBO_V3',{options:[{key:'H3',inputs:{required:{duration:['INT',{min:4,max:15}]}}}]}]}},output:['VIDEO']}};
 const graph={1:{class_type:'Generate',inputs:{model:'H3','model.duration':5}}};assert.equal(inspectWorkflow(graph,catalog).compatible,true);delete graph[1].inputs['model.duration'];assert.equal(inspectWorkflow(graph,catalog).compatible,false);graph[1].inputs['model.duration']=30;assert.equal(inspectWorkflow(graph,catalog).compatible,false);
});
test('first-frame motion links the uploaded image and never substitutes a text-only recipe',()=>{
 const r=minimaxTake({prompt:'She holds his hand',firstFrame:'abcdef1234.png'});assert.equal(r.mode,'image-to-video');assert.equal(r.workflow[1].class_type,'MinimaxHailuo03FirstLastFrameNode');assert.deepEqual(r.workflow[1].inputs.first_frame,['2',0]);assert.equal(r.workflow[2].inputs.image,'abcdef1234.png');assert.equal(r.workflow[1].inputs['model.ratio'],undefined);
 for(const firstFrame of ['/etc/passwd','../frame.png','https://attacker/image.png','frame.svg','x.png?key=secret'])assert.throws(()=>minimaxTake({prompt:'She holds his hand',firstFrame}));
});
