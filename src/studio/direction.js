// Prompt directions, not claims of native camera controls or guaranteed motion.
export const cameraDirections={
 none:{label:'My own direction',prompt:''},
 intimate:{label:'Intimate close-up',prompt:'Intimate close-up at eye level, shallow depth of field, a slow restrained push in. Prioritize a subtle emotional gesture.'},
 reveal:{label:'World reveal',prompt:'Wide establishing composition, a gentle forward camera move revealing the environment. Keep the subject silhouette readable.'},
 tension:{label:'Held tension',prompt:'Locked medium shot, deliberate negative space, minimal movement. Let the tension come from the subject rather than camera shake.'},
 hero:{label:'Product hero',prompt:'Clean product hero composition, controlled studio lighting, a slow camera arc. Preserve the supplied product shape, label and colour.'},
 detail:{label:'Tactile detail',prompt:'Macro detail with soft directional light, a slow lateral camera move and tactile surface detail. Preserve the reference design.'}
};
export function directedPrompt(prompt,preset='none',{change='',preserve=''}={}){
 if(!Object.hasOwn(cameraDirections,preset))throw Error('Choose a valid camera direction.');
 const result=[prompt.trim(),change.trim()?`Requested change: ${change.trim()}`:'',preserve.trim()?`Preserve: ${preserve.trim()}`:'',cameraDirections[preset].prompt].filter(Boolean).join('\n\n');
 if(result.length>4000)throw Error('Shorten the description so the complete direction stays under 4,000 characters.');
 return result;
}
