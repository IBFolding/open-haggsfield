import {platformReady} from './plans.mjs';
export function launchReadiness(env={}){
 const checks={
  httpsOrigin:/^https:\/\/[^/]+\/?$/.test(env.APP_ORIGIN||''),
  stripeRuntimeKey:Boolean(env.STRIPE_API_KEY),
  stripeLiveKey:/^(sk|rk)_live_/.test(env.STRIPE_API_KEY||''),
  stripeWebhook:Boolean(env.STRIPE_WEBHOOK_SECRET),
  byokPrice:Boolean(env.STRIPE_PRICE_ID),
  includedPrices:['STRIPE_STARTER_PRICE_ID','STRIPE_CREATOR_PRICE_ID','STRIPE_STUDIO_PRICE_ID'].every(k=>Boolean(env[k])),
  vaultKey:Buffer.from(env.VAULT_KEY_BASE64||'','base64').length===32,
  supabaseUrl:/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(env.SUPABASE_URL||''),
  supabaseDatabase:Boolean(env.DATABASE_URL),
  supabaseServiceKey:Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  schedulerSecret:Boolean(env.CRON_SECRET),
  includedGenerationConfigured:platformReady(env),
 };
 return {readyForPaidLaunch:false,checks,implementationBlockers:['Re-verify deployed account flow before release; earlier hosting evidence is recorded in LAUNCH_AUDIT.md.','Cross-device browser restore and hosted cloud media flows still require verification.','Successful deployed Stripe checkout, signed webhook and provider generation have not been verified.'],note:'Configuration presence is not external verification. Values are never returned. No paid operation is performed.'};
}
