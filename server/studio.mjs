import {mountComfy} from './comfy-studio.mjs';
import {mountCloud,storageClient,cleanupCloud} from './cloud.mjs';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { openStore, transact } from './store.mjs';
import { databaseVault } from './database-vault.mjs';
import { hash, token, passwordHash, passwordMatches, limited, sessionUser, issueSession, vaultId } from './auth.mjs';
import { createVault } from './byok.mjs';
import { provider as defaultProvider, generationInput, applyResult, safeFailure } from './generation.mjs';
import { billingClient, billingReady, syncSubscription, validatePrice, subscriptionOpen } from './billing.mjs';
import { PLANS, platformReady, platformQuote } from './plans.mjs';
import { allowance, reserveAllowed } from './credits.mjs';
const activeStates = "'submitting','queued','in_progress','unknown'";
export async function createStudio({
  directory,
  origin = 'http://127.0.0.1:4191',
  env = {},
  provider = defaultProvider,
  stripe = billingClient(env),
  pollMs = 10000, store = null, storage = storageClient(env), comfyClientFactory
} = {}) {
  const url = new URL(origin),
    secure = url.protocol === 'https:';
  if (env.NODE_ENV === 'production' && (!secure || !env.VAULT_KEY_BASE64)) throw Error('Production requires HTTPS APP_ORIGIN and VAULT_KEY_BASE64.');
  const db = store || await openStore({directory,env}),
    vault = db.kind === 'postgres' ? databaseVault(db,env.VAULT_KEY_BASE64) : await createVault(directory + '/keys',env.VAULT_KEY_BASE64);
  // A process could have stopped after submitting but before recording the receipt. Never resubmit.
  await db.prepare("UPDATE jobs SET status='unknown',error='Server restarted during submission. Check the original provider before creating another take.' WHERE status='submitting' AND updated<?").run(db.kind==='postgres'?Date.now()-120000:Date.now()+1);
  const app = express();
  app.disable('x-powered-by');
  const locks = new Set();
  const locked = async (key, fn) => {
    if(db.withLock)return db.withLock(key,fn);
    if (locks.has(key)) throw Object.assign(Error('Another operation is in progress.'), {
      http: 409
    });
    locks.add(key);
    try {
      return await fn();
    } finally {
      locks.delete(key);
    }
  };
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin'
    });
    next();
  });
  app.post('/api/studio/stripe/webhook', express.raw({
    type: 'application/json',
    limit: '256kb'
  }), async (req, res) => {
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return res.status(503).json({
      error: 'Billing not configured.'
    });
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return res.status(400).json({
        error: 'Invalid webhook signature.'
      });
    }
    if (await db.prepare('SELECT id FROM stripe_events WHERE id=?').get(event.id)) return res.json({
      received: true
    });
    try {
      const object = event.data.object;
      if (['charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created'].includes(event.type)) {
        const charge = event.type === 'charge.refunded' ? object : await stripe.charges.retrieve(typeof object.charge === 'string' ? object.charge : object.charge.id);
        if (typeof charge.customer === 'string') await db.prepare("UPDATE users SET billing_hold=1,billing='on_hold',access_until=0 WHERE customer=?").run(charge.customer);
      }
      const handled = /^(customer\.subscription\.|invoice\.(paid|payment_failed)|checkout\.session\.(completed|async_payment_succeeded))/.test(event.type);
      if (handled && typeof object.customer === 'string') await locked('billing:' + object.customer, () => syncSubscription(db, stripe, object.customer, env));
      await db.prepare('INSERT OR IGNORE INTO stripe_events VALUES (?,?)').run(event.id, Date.now());
      res.json({
        received: true
      });
    } catch {
      res.status(503).json({
        error: 'Subscription synchronization failed; retry delivery.'
      });
    }
  });
  app.get('/api/studio/internal/poll',async(req,res)=>{
    if(!env.CRON_SECRET||hash(req.headers.authorization||'')!==hash('Bearer '+env.CRON_SECRET))return res.status(401).json({error:'Unauthorized.'});
    res.json(await pollPending());
  });
  app.use('/api/studio', async (req, res, next) => {
    if (req.headers.host !== url.host || req.headers.origin && req.headers.origin !== url.origin || req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({
      error: 'Use the studio’s own origin.'
    });
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== url.origin) return res.status(403).json({
      error: 'Same-origin request required.'
    });
    if (!['GET', 'HEAD'].includes(req.method) && !req.headers['content-type']?.startsWith('application/json')) return res.status(415).json({
      error: 'JSON required.'
    });
    if (await limited(db, 'api:' + req.socket.remoteAddress, 500, 60000)) return res.status(429).json({
      error: 'Too many requests. Try again shortly.'
    });
    next();
  });
  app.use('/api/studio/edits',express.json({limit:'2mb'}));
  app.use('/api/studio/comfy/reference',express.json({limit:'6mb'}));
  app.use('/api/studio',express.json({limit:'20kb'}));
  const publicUser = async u => u ? {
    id: u.id,
    username: u.username,
    billing: u.billing,
    hasSubscription: subscriptionOpen(u.billing),
    hasBillingAccount: Boolean(u.customer),
    accessUntil: u.access_until,
    plan: u.plan,
    allowance: await allowance(db, u)
  } : null;
  app.get('/api/studio/account', async (req, res) => res.json({
    user: await publicUser(await sessionUser(db, req)),
    billingReady: billingReady(env),
    billingMode: !env.STRIPE_API_KEY ? 'unconfigured' : /^(sk|rk)_test_/.test(env.STRIPE_API_KEY) ? 'sandbox' : /^(sk|rk)_live_/.test(env.STRIPE_API_KEY) ? 'live' : 'unknown',
    cloudReady:db.kind==='postgres'&&Boolean(storage),
    monthlyCents: 1500,
    platformReady: platformReady(env),
    plans: Object.values(PLANS).map(p => ({
      id: p.id,
      name: p.name,
      monthlyCents: p.monthlyCents,
      credits: p.credits,
      available: billingReady(env, p.id) && (p.id === 'byok' || platformReady(env))
    })),
    mode: env.NODE_ENV === 'production' ? 'hosted' : 'local server'
  }));
  const authLimit = async (req, res, next) => {
    if (await limited(db, 'auth:' + req.socket.remoteAddress, 15, 900000)) return res.status(429).json({
      error: 'Too many sign-in attempts. Wait 15 minutes.'
    });
    next();
  };
  app.post('/api/studio/register', authLimit, async (req, res) => {
    const {
      username,
      password
    } = req.body || {};
    if (typeof username !== 'string' || !/^[-a-zA-Z0-9_]{3,40}$/.test(username) || typeof password !== 'string' || password.length < 12 || password.length > 128) return res.status(400).json({
      error: 'Use a 3–40 character username and a 12–128 character password.'
    });
    const normalized = username.toLowerCase();
    const id = randomUUID(),
      recovery = token();
    const stored = await passwordHash(password);
    try {
      await db.prepare('INSERT INTO users(id,username,password,recovery,created) VALUES (?,?,?,?,?)').run(id, normalized, stored, hash(recovery), Date.now());
    } catch {
      return res.status(409).json({
        error: 'That username is unavailable.'
      });
    }
    await issueSession(db, res, id, secure);
    res.status(201).json({
      user: await publicUser(await db.prepare('SELECT * FROM users WHERE id=?').get(id)),
      recoveryCode: recovery
    });
  });
  app.post('/api/studio/login', authLimit, async (req, res) => {
    const {
      username,
      password
    } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 128) return res.status(401).json({
      error: 'Invalid username or password.'
    });
    const u = await db.prepare('SELECT * FROM users WHERE username=?').get(username.toLowerCase());
    const fallback = '00'.repeat(16) + ':' + '00'.repeat(64);
    const matches = await passwordMatches(password, u?.password || fallback);
    if (!u || !matches) return res.status(401).json({
      error: 'Invalid username or password.'
    });
    await issueSession(db, res, u.id, secure);
    res.json({
      user: await publicUser(u)
    });
  });
  app.post('/api/studio/recover', authLimit, async (req, res) => {
    const {
      username,
      recoveryCode,
      password
    } = req.body || {};
    if (typeof username !== 'string' || typeof recoveryCode !== 'string' || typeof password !== 'string' || password.length < 12 || password.length > 128) return res.status(400).json({
      error: 'Username, recovery code and a new 12–128 character password are required.'
    });
    const u = await db.prepare('SELECT * FROM users WHERE username=? AND recovery=?').get(username.toLowerCase(), hash(recoveryCode));
    if (!u) return res.status(401).json({
      error: 'Invalid recovery details.'
    });
    const newRecovery = token(),
      newPassword = await passwordHash(password);
    const changed = await transact(db, async () => {
      const r = await db.prepare('UPDATE users SET password=?,recovery=? WHERE id=? AND recovery=?').run(newPassword, hash(newRecovery), u.id, hash(recoveryCode));
      if (r.changes) await db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
      return r.changes;
    });
    if (!changed) return res.status(401).json({
      error: 'Recovery code has already been used.'
    });
    await issueSession(db, res, u.id, secure);
    res.json({
      recoveryCode: newRecovery
    });
  });
  app.use('/api/studio', async (req, res, next) => {
    req.user = await sessionUser(db, req);
    if (!req.user) return res.status(401).json({
      error: 'Sign in to your studio account.'
    });
    next();
  });
  mountCloud(app,{db,storage,locked});
  const comfy=mountComfy(app,{db,vault,storage,locked,env,clientFactory:comfyClientFactory});
  app.get('/api/studio/account/export',async(req,res)=>{
    const projects=await db.prepare('SELECT id,title,prompt,created FROM projects WHERE user_id=?').all(req.user.id);
    const jobs=await db.prepare('SELECT id,project_id,input,endpoint,status,created,updated,funding,reserved_credits FROM jobs WHERE user_id=?').all(req.user.id);
    const edits=db.kind==='postgres'?await db.prepare('SELECT id,title,document,revision,updated FROM edits WHERE user_id=?').all(req.user.id):[];
    res.setHeader('Content-Disposition','attachment; filename="open-haggsfield-account.json"');
    res.json({version:1,exportedAt:new Date().toISOString(),account:await publicUser(req.user),projects,jobs,edits,note:'Credentials and session tokens are excluded. Download media and device-local projects separately.'});
  });
  app.post('/api/studio/account/sign-out-all',async(req,res)=>{
    if(typeof req.body?.password!=='string'||!(await passwordMatches(req.body.password,req.user.password)))return res.status(403).json({error:'Confirm your password.'});
    await db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id);
    res.clearCookie('oh_account',{path:'/api',httpOnly:true,sameSite:'strict',secure});res.json({signedOut:true});
  });
  app.post('/api/studio/logout', async (req, res) => {
    const value = /(?:^|;\s*)oh_account=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
    if (value) await db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(value));
    res.clearCookie('oh_account', {
      path: '/api',
      httpOnly: true,
      sameSite: 'strict',
      secure
    });
    res.json({
      signedOut: true
    });
  });
  const inFlight = async id => await db.prepare(`SELECT id FROM jobs WHERE user_id=? AND status IN (${activeStates}) LIMIT 1`).get(id);
  app.get('/api/studio/connection', async (req, res) => res.json({
    connected: Boolean(await vault.get(vaultId(req.user))),
    verified: false
  }));
  app.post('/api/studio/connection', async (req, res) => locked('key:' + req.user.id, async () => {
    if (await inFlight(req.user.id)) return res.status(409).json({
      error: 'Resolve active or unknown jobs before replacing your key.'
    });
    const value = req.body?.credentials;
    if (typeof value !== 'string' || value.length > 2048 || !/^[^:\s]+:[^:\s]+$/.test(value)) return res.status(400).json({
      error: 'Enter your key ID and secret separately, without colons or spaces.'
    });
    await vault.save(vaultId(req.user), value);
    res.json({
      connected: true,
      verified: false
    });
  }));
  app.delete('/api/studio/connection', async (req, res) => locked('key:' + req.user.id, async () => {
    if (await inFlight(req.user.id)) return res.status(409).json({
      error: 'Resolve active or unknown jobs before deleting your key.'
    });
    await vault.remove(vaultId(req.user));
    res.json({
      connected: false
    });
  }));
  app.get('/api/studio/projects', async (req, res) => res.json({
    projects: await db.prepare('SELECT id,title,prompt,created FROM projects WHERE user_id=? ORDER BY created DESC').all(req.user.id)
  }));
  app.post('/api/studio/projects', async (req, res) => {
    const {
      title,
      prompt
    } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.length > 100 || typeof prompt !== 'string' || prompt.length > 4000) return res.status(400).json({
      error: 'Add a title and a prompt under 4000 characters.'
    });
    const id = randomUUID();
    await db.prepare('INSERT INTO projects VALUES (?,?,?,?,?)').run(id, req.user.id, title.trim(), prompt, Date.now());
    res.status(201).json({
      id,
      title: title.trim(),
      prompt
    });
  });
  app.get('/api/studio/jobs', async (req, res) => res.json({
    jobs: (await db.prepare('SELECT id,project_id,token,input,endpoint,status,request_id,video_url,error,created,funding,reserved_credits FROM jobs WHERE user_id=? ORDER BY created DESC LIMIT 100').all(req.user.id)).map(j => ({
      ...j,
      input: JSON.parse(j.input)
    }))
  }));
  async function pollJob(j) {
    if(j.endpoint===comfy.endpoint)return comfy.poll(j);
    return locked('poll:' + j.id, async () => {
      const user = await db.prepare('SELECT * FROM users WHERE id=?').get(j.user_id);
      const credentials = j.funding === 'platform' ? env.HF_PLATFORM_CREDENTIALS : await vault.get(vaultId(user));
      if (!credentials) return;
      try {
        await applyResult(db, j.id, await provider.status(credentials, j.request_id));
      } catch {
        await db.prepare('UPDATE jobs SET error=? WHERE id=?').run('Status check failed. The original request is retained; no new generation was submitted.', j.id);
      }
    });
  }
  app.post('/api/studio/jobs/:id/refresh', async (req, res) => {
    const j = await db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!j) return res.status(404).json({
      error: 'Job not found.'
    });
    if (j.request_id && ['queued', 'in_progress', 'unknown'].includes(j.status)) await pollJob(j);
    res.json({
      status: (await db.prepare('SELECT status FROM jobs WHERE id=?').get(j.id)).status
    });
  });
  app.post('/api/studio/jobs/:id/reconcile', async (req, res) => locked('key:' + req.user.id, async () => {
    const j = await db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if(j?.endpoint===comfy.endpoint)return res.status(409).json({error:'Use Comfy job reconciliation for this request.'});
    if (!j || j.status !== 'unknown') return res.status(400).json({
      error: 'Only an uncertain request needs reconciliation.'
    });
    if (j.funding === 'platform') return res.status(409).json({
      error: 'Support must reconcile uncertain platform-funded requests; do not submit a replacement.'
    });
    const requestId = req.body?.requestId;
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId)) return res.status(400).json({
      error: 'Enter the request ID from your Higgsfield console.'
    });
    const credentials = await vault.get(vaultId(req.user));
    if (!credentials) return res.status(400).json({
      error: 'The original API key is needed.'
    });
    const result = await provider.status(credentials, requestId);
    if (result.request_id !== requestId) return res.status(400).json({
      error: 'Provider did not confirm that request ID.'
    });
    await applyResult(db, j.id, result);
    res.json({
      status: (await db.prepare('SELECT status FROM jobs WHERE id=?').get(j.id)).status
    });
  }));
  app.post('/api/studio/quote', async (req, res) => {
    try {
      const parsed = generationInput(req.body || {}),
        quote = platformQuote(env, parsed);
      if (!req.user.grant_id || (await allowance(db, req.user)).remaining < quote.credits) return res.status(402).json({
        error: 'An active included-generation plan with enough credits is required.'
      });
      const id = randomUUID(),
        fingerprint = hash(JSON.stringify({
          projectId: req.body.projectId,
          ...parsed,
          funding: 'platform'
        }));
      await db.prepare('DELETE FROM generation_quotes WHERE expires<?').run(Date.now());
      await db.prepare('INSERT INTO generation_quotes VALUES (?,?,?,?,?)').run(id, req.user.id, fingerprint, quote.credits, quote.expiresAt);
      res.json({
        ...quote,
        id
      });
    } catch (e) {
      res.status(400).json({
        error: e.message
      });
    }
  });
  app.post('/api/studio/jobs', async (req, res) => locked('key:' + req.user.id, async () => {
    const b = req.body || {},
      funding = b.funding || 'byok';
    if (!['byok', 'platform'].includes(funding)) return res.status(400).json({
      error: 'Choose a valid generation funding option.'
    });
    if (b.confirmBillable !== true) return res.status(400).json({
      error: 'Confirm the provider charge before generating.'
    });
    if (typeof b.token !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(b.token)) return res.status(400).json({
      error: 'A request token is required.'
    });
    let parsed;
    try {
      parsed = generationInput(b);
    } catch (e) {
      return res.status(400).json({
        error: e.message
      });
    }
    const fingerprint = hash(JSON.stringify({
      projectId: b.projectId,
      ...parsed,
      ...(funding === 'platform' ? {
        funding
      } : {})
    }));
    const prior = await db.prepare('SELECT * FROM jobs WHERE user_id=? AND token=?').get(req.user.id, b.token);
    if (prior) {
      if (prior.fingerprint !== fingerprint) return res.status(409).json({
        error: 'This request token belongs to a different shot.'
      });
      return res.json({
        id: prior.id,
        status: prior.status
      });
    }
    if (req.user.billing !== 'active' || req.user.access_until <= Date.now()) return res.status(402).json({
      error: 'An active, paid Studio subscription is required.'
    });
    if (!(await db.prepare('SELECT id FROM projects WHERE id=? AND user_id=?').get(b.projectId, req.user.id))) return res.status(404).json({
      error: 'Project not found.'
    });
    if (await inFlight(req.user.id)) return res.status(409).json({
      error: 'Finish or reconcile your existing job before starting another.'
    });
    let quote;
    if (funding === 'platform') {
      let freshQuote;
      try {
        freshQuote = platformQuote(env, parsed);
      } catch (e) {
        return res.status(503).json({
          error: e.message
        });
      }
      quote = await db.prepare('SELECT * FROM generation_quotes WHERE id=? AND user_id=? AND fingerprint=? AND expires>?').get(b.quoteId || '', req.user.id, fingerprint, Date.now());
      if (!quote || quote.credits !== freshQuote.credits) return res.status(409).json({
        error: 'Get a fresh credit quote and confirm it before generating.'
      });
    }
    const credentials = funding === 'platform' ? env.HF_PLATFORM_CREDENTIALS : await vault.get(vaultId(req.user));
    if (!credentials) return res.status(400).json({
      error: 'Connect your own Higgsfield key first.'
    });
    const id = randomUUID(),
      now = Date.now();
    await transact(db, async () => {
      const current = await db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
      if (current.billing !== 'active' || current.billing_hold || current.access_until <= now) throw Object.assign(Error('Paid membership is required.'), {
        http: 402
      });
      if(await inFlight(current.id))throw Object.assign(Error('An active request already exists.'),{http:409});
      if (funding === 'platform') await reserveAllowed(db, current, quote.credits, env);
      await db.prepare('INSERT INTO jobs(id,user_id,project_id,token,fingerprint,input,endpoint,status,created,updated,funding,grant_id,reserved_credits) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, current.id, b.projectId, b.token, fingerprint, JSON.stringify(parsed.input), parsed.endpoint, 'submitting', now, now, funding, funding === 'platform' ? current.grant_id : null, quote?.credits || 0);
    });
    try {
      await applyResult(db, id, await provider.submit(credentials, parsed.endpoint, parsed.input));
    } catch (e) {
      const definite = [400, 401, 402, 403, 404, 422, 423].includes(e.statusCode) || e.name === 'AuthenticationError';
      await db.prepare('UPDATE jobs SET status=?,error=?,updated=? WHERE id=?').run(definite ? 'rejected' : 'unknown', safeFailure(e), Date.now(), id);
      if (definite) await db.prepare('UPDATE jobs SET reserved_credits=0 WHERE id=?').run(id);
    }
    res.status(202).json({
      id,
      status: (await db.prepare('SELECT status FROM jobs WHERE id=?').get(id)).status
    });
  }));
  app.post('/api/studio/checkout', async (req, res) => locked('checkout:' + req.user.id, async () => {
    const plan = PLANS[req.body?.plan || 'byok'];
    if (!plan) return res.status(400).json({
      error: 'Unknown subscription plan.'
    });
    if (plan.credits && !platformReady(env)) return res.status(503).json({
      error: 'Included generation is not open for subscriptions yet.'
    });
    if (!billingReady(env, plan.id) || !stripe) return res.status(503).json({
      error: 'Stripe checkout is awaiting server configuration. No charge was made.'
    });
    const priceId = env[plan.priceEnv];
    await validatePrice(stripe, priceId, plan);
    let user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (!user.customer) {
      const customer = await stripe.customers.create({
        metadata: {
          studio_user: user.id
        }
      }, {
        idempotencyKey: 'studio-customer-' + user.id
      });
      await db.prepare('UPDATE users SET customer=? WHERE id=?').run(customer.id, user.id);
      user = {
        ...user,
        customer: customer.id
      };
    }
    await syncSubscription(db, stripe, user.customer, env);
    const fresh = await db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
    if (subscriptionOpen(fresh.billing)) return res.status(409).json({
      error: 'You already have a subscription. Use Manage subscription to resolve payment or cancellation, then refresh status.'
    });
    const existing = await db.prepare('SELECT * FROM checkout WHERE user_id=?').get(user.id);
    if (existing?.session_id && existing.expires > Date.now()) {
      const session = await stripe.checkout.sessions.retrieve(existing.session_id);
      if (session.status === 'open') {
        if (existing.plan !== plan.id) return res.status(409).json({
          error: 'An unfinished checkout exists for another plan. Complete or let it expire before switching.'
        });
        return res.json({
          url: session.url
        });
      }
      if (session.status === 'complete') return res.status(409).json({
        error: 'Checkout has completed. Refresh subscription status instead of paying again.'
      });
    }
    const bucket = Math.floor(Date.now() / 1800000);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: user.customer,
      client_reference_id: user.id,
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      subscription_data: {
        billing_mode: {
          type: 'flexible'
        },
        metadata: {
          studio_user: user.id
        }
      },
      success_url: origin + '/#/connections',
      cancel_url: origin + '/#/connections',
      integration_identifier: 'open_haggsfield_studio_qjmxptva'
    }, {
      idempotencyKey: `studio-checkout-${user.id}-${plan.id}-${bucket}`
    });
    await db.prepare('INSERT INTO checkout(user_id,session_id,url,expires,plan) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET session_id=excluded.session_id,url=excluded.url,expires=excluded.expires,plan=excluded.plan').run(user.id, session.id, session.url, session.expires_at * 1000, plan.id);
    res.json({
      url: session.url
    });
  }));
  app.post('/api/studio/billing/refresh', async (req, res) => {
    if (!env.STRIPE_API_KEY || !env.STRIPE_WEBHOOK_SECRET || !stripe) return res.status(503).json({
      error: 'Stripe is not configured.'
    });
    if (req.user.customer) await locked('billing:' + req.user.customer, () => syncSubscription(db, stripe, req.user.customer, env));
    res.json({
      user: await publicUser(await db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id))
    });
  });
  app.post('/api/studio/billing/portal', async (req, res) => {
    if (!stripe || !req.user.customer) return res.status(400).json({
      error: 'No billing account is connected.'
    });
    const portal = await stripe.billingPortal.sessions.create({
      customer: req.user.customer,
      return_url: origin + '/#/connections',
      ...(env.STRIPE_PORTAL_CONFIG_ID ? {
        configuration: env.STRIPE_PORTAL_CONFIG_ID
      } : {})
    });
    res.json({
      url: portal.url
    });
  });
  app.use('/api/studio', (_req, res) => res.status(404).json({
    error: 'Not found.'
  }));
  app.use((err, _req, res, _next) => res.status(err.http || err.status || 500).json({
    error: err.http ? err.message : err.type === 'entity.parse.failed' ? 'Invalid JSON request.' : 'The server could not complete this operation. No secret details are logged.'
  }));
  let polling = false;
  async function pollPending(){
    if(polling)return {checked:0};polling=true;
    try{
      await db.prepare("UPDATE jobs SET status='unknown',error='Submission receipt not confirmed. Reconcile before any new request.' WHERE status='submitting' AND updated<?").run(Date.now()-120000);
      const jobs=await db.prepare("SELECT * FROM jobs WHERE request_id IS NOT NULL AND status IN ('queued','in_progress','unknown') ORDER BY updated LIMIT 10").all();
      await Promise.allSettled(jobs.map(pollJob));await cleanupCloud(db,storage,locked);return {checked:jobs.length};
    }finally{polling=false;}
  }
  const timer=env.VERCEL?null:setInterval(()=>pollPending().catch(()=>{}),pollMs);
  timer?.unref();
  return {
    app,
    db:db.raw||db,
    vault,
    pollPending,
    close() {
      clearInterval(timer);
      return db.close();
    }
  };
}
