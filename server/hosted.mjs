// One initialization per warm instance; failures remain sanitized and retryable.
export function hostedHandler(initialize,env=process.env){
 let ready;
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!env.DATABASE_URL||!env.VAULT_KEY_BASE64||!/^https:\/\//.test(env.APP_ORIGIN||''))return res.status(503).json({error:'Hosted studio setup is incomplete.'});
  try{ready??=initialize(env.APP_ORIGIN);const studio=await ready;return studio.app(req,res,()=>res.status(404).json({error:'Not found.'}));}
  catch{ready=null;return res.status(503).json({error:'Studio temporarily unavailable. No request was automatically retried.'});}
 };
}
