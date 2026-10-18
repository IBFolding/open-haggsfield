import {config} from 'dotenv';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createStudio} from './studio.mjs';
export async function runtime(origin){config({path:[fileURLToPath(new URL('../.env.local',import.meta.url)),fileURLToPath(new URL('../.env.supabase.local',import.meta.url))],quiet:true});if(process.env.VERCEL&&!process.env.DATABASE_URL)throw Error('Hosted launch requires Supabase DATABASE_URL.');return createStudio({directory:resolve(process.env.STUDIO_DATA_DIR||fileURLToPath(new URL('../.haggsfield/studio',import.meta.url))),origin:process.env.APP_ORIGIN||origin,env:process.env});}
export function studioPlugin(){return {name:'studio-backend',apply:'serve',async configureServer(vite){const studio=await runtime('http://127.0.0.1:4191');vite.middlewares.use((req,res,next)=>req.url?.startsWith('/api/studio')?studio.app(req,res,next):next());vite.httpServer?.once('close',()=>studio.close());}};}
