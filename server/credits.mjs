export async function allowance(db, user, now = Date.now()) {
  if (!user?.grant_id || user.billing !== 'active' || user.billing_hold || user.access_until <= now) return {
    credits: 0,
    remaining: 0,
    expiresAt: null
  };
  const grant = await db.prepare('SELECT * FROM credit_grants WHERE id=? AND user_id=? AND plan=? AND expires>?').get(user.grant_id, user.id, user.plan, now);
  if (!grant) return {
    credits: 0,
    remaining: 0,
    expiresAt: null
  };
  const used = (await db.prepare('SELECT COALESCE(SUM(reserved_credits),0) AS total FROM jobs WHERE grant_id=?').get(grant.id)).total;
  return {
    credits: grant.credits,
    remaining: Math.max(0, grant.credits - used),
    expiresAt: grant.expires
  };
}
// Called inside the same IMMEDIATE transaction that inserts the job.
export async function reserveAllowed(db, user, credits, env) {
  if ((await allowance(db, user)).remaining < credits) throw Object.assign(Error('Not enough included credits. Wait for your paid renewal or use your own API key.'), {
    http: 402
  });
  const d = new Date(),
    start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  // Unresolved requests from earlier months still count; unknown never means free.
  const spent = (await db.prepare("SELECT COALESCE(SUM(reserved_credits),0) AS total FROM jobs WHERE funding='platform' AND (created>=? OR status IN ('submitting','queued','in_progress','unknown'))").get(start)).total;
  if (spent + credits > Number(env.PLATFORM_MONTHLY_CAP_CENTS)) throw Object.assign(Error('Included generation is paused at the platform spending limit.'), {
    http: 503
  });
}
