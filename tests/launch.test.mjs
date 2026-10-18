import test from 'node:test';import assert from 'node:assert/strict';
import {launchReadiness} from '../server/readiness.mjs';
import {parseBackup} from '../src/studio/storage.js';
import {migrate} from '../src/studio/sequence.js';
test('configuration never claims a successful paid launch or returns secrets',()=>{const r=launchReadiness({STRIPE_API_KEY:'sk_live_secret-sentinel',SUPABASE_SERVICE_ROLE_KEY:'secret-sentinel',DATABASE_URL:'postgres://secret-sentinel'});assert.equal(r.readyForPaidLaunch,false);assert.equal(r.checks.stripeLiveKey,true);assert(!JSON.stringify(r).includes('secret-sentinel'));assert(r.implementationBlockers.length);});
test('backup restore validates before replacing an edit and binds to the current project',()=>{const doc=migrate({id:'original',brief:{refs:[]}},{clips:[]});assert.equal(parseBackup(JSON.stringify(doc),'current').projectId,'current');assert.throws(()=>parseBackup('{bad','current'));assert.throws(()=>parseBackup(JSON.stringify({version:2,clips:[]}), 'current'));assert.throws(()=>parseBackup('a'.repeat(10000001),'current'),/10 MB/);});
