export const PLANS=Object.freeze({
 byok:{id:'byok',name:'Bring your own key',monthlyCents:1500,credits:0,priceEnv:'STRIPE_PRICE_ID'},
 starter:{id:'starter',name:'Starter',monthlyCents:2500,credits:500,priceEnv:'STRIPE_STARTER_PRICE_ID'},
 // Keep existing IDs stable for saved subscriptions and credit grants.
 creator:{id:'creator',name:'Mid',monthlyCents:4900,credits:1000,priceEnv:'STRIPE_CREATOR_PRICE_ID'},
 studio:{id:'studio',name:'Pro',monthlyCents:9900,credits:3000,priceEnv:'STRIPE_STUDIO_PRICE_ID'}
});
export const configuredPlans=env=>Object.values(PLANS).filter(p=>env[p.priceEnv]).map(p=>({...p,priceId:env[p.priceEnv]}));
export function platformReady(env,now=Date.now()){
 const rate=Number(env.PLATFORM_MAX_CENTS_PER_SECOND),until=Date.parse(env.PLATFORM_RATE_VALID_UNTIL||''),cap=Number(env.PLATFORM_MONTHLY_CAP_CENTS);
 return env.PLATFORM_GENERATION_ENABLED==='true'&&/^[^:\s]+:[^:\s]+$/.test(env.HF_PLATFORM_CREDENTIALS||'')&&Number.isSafeInteger(rate)&&rate>0&&rate<=10000&&Number.isFinite(until)&&until>now&&until<=now+86400000&&Number.isSafeInteger(cap)&&cap>0;
}
export function platformQuote(env,parsed){
 if(!platformReady(env))throw Error('Included generation is not available: platform funding or verified pricing needs attention.');
 // Expand this allowlist only after verifying the cost ceiling for each new option.
 if(parsed.endpoint!=='bytedance/seedance-2.5/text-to-video'||parsed.input.generate_audio||parsed.input.resolution!=='720p')throw Error('Included generation currently supports text-to-video at 720p without audio. References and audio require your own key.');
 const credits=parsed.input.duration*Number(env.PLATFORM_MAX_CENTS_PER_SECOND);
 return {credits,expiresAt:Math.min(Date.now()+300000,Date.parse(env.PLATFORM_RATE_VALID_UNTIL)),mode:'platform'};
}
