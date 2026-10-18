import {config} from 'dotenv';import postgres from 'postgres';import {readFile} from 'node:fs/promises';
config({path:['.env.local','.env.supabase.local'],quiet:true});
if(!process.env.DATABASE_URL){console.error('Enter DATABASE_URL locally before running migrations.');process.exitCode=1;}else{
 const sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1,ssl:'require',connect_timeout:10,onnotice:()=>{}});
 try{const source=await readFile(new URL('../supabase/migrations/202609290001_studio.sql',import.meta.url),'utf8');await sql.unsafe(source);console.log('Supabase schema and private media bucket migrated. Runtime and paid flows still require verification.');}catch{console.error('Migration failed. Check project access and schema permissions; no credentials or provider responses were printed.');process.exitCode=1;}finally{await sql.end({timeout:5});}
}
