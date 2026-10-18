// Catalog validation is read-only; it does not prove execution, quality or cost.
export function inspectWorkflow(workflow,catalog){
 const errors=[],warnings=[];
 for(const [id,node]of Object.entries(workflow)){
  const schema=catalog[node.class_type];if(!schema){errors.push(`${id}: missing node ${node.class_type}`);continue;}
  const required={...schema.input?.required},optional={...schema.input?.optional};
  const expand=(fields,prefix='')=>{for(const [key,spec]of Object.entries(fields||{})){
   const name=prefix+key;
   if(spec[0]==='COMFY_AUTOGROW_V3'){
    delete required[name];delete optional[name];
    const template=spec[1]?.template,child=Object.values(template?.input?.required||{})[0];
    if(template?.names&&child){for(const slot of template.names)optional[name+'.'+slot]=child;const count=template.names.filter(slot=>name+'.'+slot in node.inputs).length;if(count<(template.min||0))errors.push(`${id}: too few inputs for ${name}`);}
    else warnings.push(`${id}: unvalidated growable input ${name}`);
   }
   if(spec[0]==='COMFY_DYNAMICCOMBO_V3'){
    const selected=spec[1]?.options?.find(x=>x.key===node.inputs[name]);
    if(selected)for(const section of ['required','optional']){
     const target=section==='required'?required:optional;
     for(const [child,childSpec]of Object.entries(selected.inputs?.[section]||{}))target[name+'.'+child]=childSpec;
     expand(selected.inputs?.[section],name+'.');
    }
   }
  }};expand(schema.input?.required);expand(schema.input?.optional);
  for(const key of Object.keys(required))if(!(key in node.inputs))errors.push(`${id}: missing input ${key}`);
  for(const [key,value]of Object.entries(node.inputs)){
   const spec=required[key]||optional[key];if(!spec){errors.push(`${id}: unknown input ${key}`);continue;}
   if(Array.isArray(value)){
    const source=workflow[value[0]],out=catalog[source?.class_type]?.output;
    if(value.length!==2||!source||!Number.isInteger(value[1])||!out||value[1]<0||value[1]>=out.length)errors.push(`${id}: invalid link ${key}`);
    else if(typeof spec[0]==='string'&&spec[0]!==out[value[1]])errors.push(`${id}: incompatible link ${key}`);
    continue;
   }
   const options=Array.isArray(spec[0])?spec[0]:spec[1]?.options;
   if(options?.length&&!options.some(x=>(typeof x==='object'?x.key:x)===value))errors.push(`${id}: unsupported ${key}`);
   if(options?.length===0)warnings.push(`${id}: ${key} has no published choices; execution validation required`);
   if(['INT','FLOAT','FLOAT,INT'].includes(spec[0])&&(!Number.isFinite(value)||(spec[0]==='INT'&&!Number.isInteger(value))||value<(spec[1]?.min??-Infinity)||value>(spec[1]?.max??Infinity)))errors.push(`${id}: invalid numeric input ${key}`);
   if(spec[0]==='BOOLEAN'&&typeof value!=='boolean')errors.push(`${id}: invalid boolean ${key}`);
   if(spec[0]==='STRING'&&typeof value!=='string')errors.push(`${id}: invalid text ${key}`);
  }
 }
 return {compatible:errors.length===0,errors,warnings,executionVerified:false};
}
