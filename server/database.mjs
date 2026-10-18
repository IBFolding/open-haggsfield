import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
export function database(directory){
 mkdirSync(directory,{recursive:true,mode:0o700});
 const path=join(directory,'studio.sqlite');const db=new DatabaseSync(path);chmodSync(path,0o600);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, recovery TEXT NOT NULL, created INTEGER NOT NULL, customer TEXT UNIQUE, subscription TEXT, billing TEXT NOT NULL DEFAULT 'inactive', access_until INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, prompt TEXT NOT NULL, created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), project_id TEXT NOT NULL REFERENCES projects(id), token TEXT NOT NULL, fingerprint TEXT NOT NULL, input TEXT NOT NULL, endpoint TEXT NOT NULL, status TEXT NOT NULL, request_id TEXT, video_url TEXT, error TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL, UNIQUE(user_id,token));
 CREATE TABLE IF NOT EXISTS stripe_events(id TEXT PRIMARY KEY, created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS checkout(user_id TEXT PRIMARY KEY REFERENCES users(id), session_id TEXT, url TEXT, expires INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at INTEGER NOT NULL);`);
 // Additive migrations preserve existing accounts, jobs and checkout records.
 const add=(table,column,definition)=>{if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);};
 add('users','plan',"TEXT NOT NULL DEFAULT 'byok'");add('users','grant_id','TEXT');add('users','billing_hold','INTEGER NOT NULL DEFAULT 0');
 add('jobs','funding',"TEXT NOT NULL DEFAULT 'byok'");add('jobs','grant_id','TEXT');add('jobs','reserved_credits','INTEGER NOT NULL DEFAULT 0');
 add('checkout','plan',"TEXT NOT NULL DEFAULT 'byok'");
 db.exec(`CREATE TABLE IF NOT EXISTS credit_grants(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),subscription TEXT NOT NULL,plan TEXT NOT NULL,credits INTEGER NOT NULL CHECK(credits>=0),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),source_id TEXT NOT NULL,object_path TEXT UNIQUE NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,expected_bytes INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created INTEGER NOT NULL,UNIQUE(user_id,source_id));
 CREATE TABLE IF NOT EXISTS generation_quotes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),fingerprint TEXT NOT NULL,credits INTEGER NOT NULL,expires INTEGER NOT NULL);`);
 return db;
}
export function transact(db,fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
