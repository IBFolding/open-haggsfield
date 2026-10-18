-- Server-only persistence schema. Do not expose this schema through the Data API.
-- This prepares the target schema; it does not switch the existing SQLite runtime.
begin;
create schema if not exists haggsfield;
revoke all on schema haggsfield from public, anon, authenticated;
create table if not exists haggsfield.users (
 id text primary key, username text unique not null, password text not null,
 recovery text not null, created bigint not null, customer text unique,
 subscription text, billing text not null default 'inactive',access_until bigint not null default 0,
 plan text not null default 'byok',grant_id text,billing_hold integer not null default 0
);
create table if not exists haggsfield.sessions (
 hash text primary key,user_id text not null references haggsfield.users(id),expires bigint not null
);
create index if not exists sessions_user_idx on haggsfield.sessions(user_id);
create table if not exists haggsfield.projects (
 id text primary key,user_id text not null references haggsfield.users(id),title text not null,prompt text not null,created bigint not null
);
create table if not exists haggsfield.jobs (
 id text primary key,user_id text not null references haggsfield.users(id),project_id text not null references haggsfield.projects(id),
 token text not null,fingerprint text not null,input text not null,endpoint text not null,status text not null,
 request_id text,video_url text,error text,created bigint not null,updated bigint not null,
 funding text not null default 'byok',grant_id text,reserved_credits integer not null default 0 check(reserved_credits>=0),unique(user_id,token)
);
create index if not exists jobs_owner_idx on haggsfield.jobs(user_id,created desc);
create index if not exists jobs_pending_idx on haggsfield.jobs(status);
create table if not exists haggsfield.stripe_events(id text primary key,created bigint not null);
create table if not exists haggsfield.checkout(user_id text primary key references haggsfield.users(id),session_id text,url text,expires bigint not null default 0,plan text not null default 'byok');
create table if not exists haggsfield.rate_limits(key text primary key,count integer not null,until_at bigint not null);
create table if not exists haggsfield.credit_grants(id text primary key,user_id text not null references haggsfield.users(id),subscription text not null,plan text not null,credits integer not null check(credits>=0),expires bigint not null);
create table if not exists haggsfield.generation_quotes(id text primary key,user_id text not null references haggsfield.users(id),fingerprint text not null,credits integer not null check(credits>=0),expires bigint not null);
-- Only encrypted AES-GCM envelopes belong here, never raw provider credentials.
create table if not exists haggsfield.provider_keys(vault_id text primary key,encrypted bytea not null,updated bigint not null);
create table if not exists haggsfield.edits(id text not null,user_id text not null references haggsfield.users(id),title text not null,document jsonb not null,revision bigint not null default 1,updated bigint not null,primary key(user_id,id));
create table if not exists haggsfield.media(id text primary key,user_id text not null references haggsfield.users(id),source_id text not null,object_path text unique not null,mime text not null,bytes bigint not null check(bytes>=0),expected_bytes bigint not null,state text not null default 'pending',created bigint not null,unique(user_id,source_id));
create table if not exists haggsfield.operation_leases(key text primary key,owner text not null,expires bigint not null);
revoke all on all tables in schema haggsfield from public,anon,authenticated;
alter default privileges in schema haggsfield revoke all on tables from public,anon,authenticated;
-- No client policies: service access must authenticate users and enforce ownership.
do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='haggsfield' loop execute format('alter table haggsfield.%I enable row level security',t.tablename); end loop; end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('haggsfield-media','haggsfield-media',false,52428800,ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/wav','audio/x-wav','audio/mpeg','audio/mp4','audio/ogg']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
commit;
