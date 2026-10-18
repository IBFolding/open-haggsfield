import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {database} from './database.mjs';
// Application SQL uses positional ? parameters; quotes must never be rewritten.
export function postgresQuery(source){let i=0;let sql=source.replace(/'(?:''|[^'])*'|\?/g,m=>m==='?'?`$${++i}`:m);if(/^INSERT OR IGNORE /i.test(sql))sql=sql.replace(/^INSERT OR IGNORE /i,'INSERT ')+' ON CONFLICT DO NOTHING';return sql;}
function numberRows(rows){return rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v])));}
export function postgresStore(client,{embedded=false}={}){
 const ctx=new AsyncLocalStorage();
 const raw=async(tx,sql,args=[])=>{const result=embedded?await tx.query(sql,args):await tx.unsafe(sql,args);return {rows:numberRows(embedded?result.rows:Array.from(result)),changes:embedded?result.affectedRows:result.count};};
 const begin=fn=>embedded?client.transaction(fn):client.begin(fn);
 const within=fn=>begin(async tx=>{await raw(tx,'SET LOCAL search_path TO haggsfield');return ctx.run(tx,()=>fn(tx));});
 const query=(sql,args)=>ctx.getStore()?raw(ctx.getStore(),postgresQuery(sql),args):within(tx=>raw(tx,postgresQuery(sql),args));
 const store={kind:'postgres',prepare:sql=>({get:async(...args)=>(await query(sql,args)).rows[0],all:async(...args)=>(await query(sql,args)).rows,run:async(...args)=>({changes:(await query(sql,args)).changes})}),
  transaction:fn=>ctx.getStore()?fn():within(async tx=>{await raw(tx,'SELECT pg_advisory_xact_lock(782341901)');return fn();}),
  close:()=>embedded?client.close():client.end({timeout:5})};
 store.withLock=async(key,fn)=>{const owner=randomUUID(),now=Date.now();const row=await store.prepare('INSERT INTO operation_leases(key,owner,expires) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE operation_leases.expires<? RETURNING owner').get(key,owner,now+300000,now);if(!row)throw Object.assign(Error('Another operation is in progress. Try again shortly.'),{http:409});try{return await fn();}finally{await store.prepare('DELETE FROM operation_leases WHERE key=? AND owner=?').run(key,owner);}};
 return store;
}
export function sqliteStore(directory){const raw=database(directory),ctx=new AsyncLocalStorage();let queue=Promise.resolve();const serial=fn=>{const r=queue.then(fn);queue=r.catch(()=>{});return r;};const store={kind:'sqlite',raw,prepare:sql=>Object.fromEntries(['get','all','run'].map(method=>[method,(...args)=>ctx.getStore()?raw.prepare(sql)[method](...args):serial(()=>raw.prepare(sql)[method](...args))])),transaction:fn=>ctx.getStore()?fn():serial(()=>ctx.run(true,async()=>{raw.exec('BEGIN IMMEDIATE');try{const result=await fn();raw.exec('COMMIT');return result;}catch(e){raw.exec('ROLLBACK');throw e;}})),close:()=>raw.close()};return store;}
export async function openStore({directory,env}){if(env.DATABASE_URL){const db=postgresStore(postgres(env.DATABASE_URL,{types:{bigint:postgres.BigInt},prepare:false,max:1,ssl:'require',connect_timeout:10,idle_timeout:20,onnotice:()=>{}}));try{await db.prepare('SELECT id FROM users LIMIT 1').all();await db.prepare('SELECT key FROM operation_leases LIMIT 1').all();return db;}catch{await db.close();throw Error('Supabase database unavailable or migrations missing. Check local server configuration.');}}if(env.VERCEL)throw Error('Hosted runtime requires the Supabase DATABASE_URL.');return sqliteStore(directory);}
export async function transact(db,fn){if(db.transaction)return db.transaction(fn);db.exec('BEGIN IMMEDIATE');try{const value=await fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
