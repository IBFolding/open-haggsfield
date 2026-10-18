// Comfy node price_badge formulas checked 2026-10-17. Estimates, not invoices.
// Image-reference Max uses the upper token bound, not its cheaper base rate.
export function comfyEstimate(recipe){
 const rates={'MiniMax H3':{'768P':.1287,'2K':.1859},'MiniMax H3 Max':{'480P':.0715,'768P':.1144},'MiniMax H3 Max Turbo':{'480P':.03575,'768P':.0572}};
 const rate=rates[recipe.model]?.[recipe.resolution];if(!rate||!Number.isInteger(recipe.duration)||recipe.duration<4||recipe.duration>15)throw Error('A valid MiniMax recipe is required for pricing.');
 let cost=rate*recipe.duration;const count=recipe.referenceImages?.length||0;
 if(count&&recipe.model==='MiniMax H3')cost+=Math.max(0,count-5)*.0572;
 if(count&&recipe.model==='MiniMax H3 Max'){const maxTokens=count*(recipe.referenceDetail==='high'?10240:2560);cost+=Math.max(0,maxTokens-4096)*.0004*.0715;}
 return Math.ceil(cost*100);
}
