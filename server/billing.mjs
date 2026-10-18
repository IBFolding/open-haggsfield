import Stripe from 'stripe';
import { PLANS, configuredPlans } from './plans.mjs';
import { transact } from './store.mjs';
export function billingClient(env) {
  return env.STRIPE_API_KEY ? new Stripe(env.STRIPE_API_KEY, {
    maxNetworkRetries: 0
  }) : null;
}
export function billingReady(env, plan = 'byok') {
  return Boolean(PLANS[plan] && env.STRIPE_API_KEY && env[PLANS[plan].priceEnv] && env.STRIPE_WEBHOOK_SECRET);
}
export const subscriptionOpen = status => Boolean(status) && !['inactive', 'canceled', 'incomplete_expired'].includes(status);
export async function syncSubscription(db, stripe, customer, configuration) {
  const plans = typeof configuration === 'string' ? [{
    ...PLANS.byok,
    priceId: configuration
  }] : configuredPlans(configuration);
  const user = await db.prepare('SELECT * FROM users WHERE customer=?').get(customer);
  if (!user) return;
  const all = [];
  let cursor;
  do {
    const page = await stripe.subscriptions.list({
      customer,
      status: 'all',
      limit: 100,
      expand: ['data.latest_invoice'],
      ...(cursor ? {
        starting_after: cursor
      } : {})
    });
    all.push(...page.data);
    if (page.has_more && !page.data.length) throw Error('Incomplete subscription listing.');
    cursor = page.has_more ? page.data.at(-1).id : null;
  } while (cursor);
  const planFor = s => plans.find(p => s.items.data.some(i => i.price.id === p.priceId));
  const matches = all.filter(planFor);
  const paid = matches.find(s => s.status === 'active' && s.latest_invoice?.status === 'paid');
  const selected = paid || matches.find(s => subscriptionOpen(s.status)) || matches[0];
  const plan = selected ? planFor(selected) : PLANS.byok;
  const until = paid ? Math.max(...paid.items.data.filter(i => i.price.id === plan.priceId).map(i => i.current_period_end || paid.current_period_end || 0)) * 1000 : 0;
  const invoice = paid?.latest_invoice;
  // Only full, paid recurring invoices grant included usage. Discounts/prorations
  // must never replenish a full allowance or turn a free invoice into provider spend.
  const eligible = paid && plan.credits > 0 && !user.billing_hold && until > Date.now() && typeof invoice.id === 'string' && invoice.currency === 'usd' && invoice.amount_paid >= plan.monthlyCents && invoice.subtotal >= plan.monthlyCents && !(invoice.total_discount_amounts || []).some(d => d.amount > 0) && ['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason);
  await transact(db, async () => {
    const blocked=(await db.prepare('SELECT billing_hold FROM users WHERE id=?').get(user.id)).billing_hold;
    if (eligible&&!blocked) await db.prepare('INSERT OR IGNORE INTO credit_grants VALUES (?,?,?,?,?,?)').run(invoice.id, user.id, paid.id, plan.id, plan.credits, until);
    // An invoice cannot be remapped to another plan or subscriber after issuance.
    const grant = eligible&&!blocked ? await db.prepare('SELECT id FROM credit_grants WHERE id=? AND user_id=? AND subscription=? AND plan=?').get(invoice.id, user.id, paid.id, plan.id) : null;
    await db.prepare('UPDATE users SET subscription=?,billing=?,access_until=?,plan=?,grant_id=? WHERE id=?').run(selected?.id || null, blocked ? 'on_hold' : paid ? 'active' : selected?.status || 'inactive', blocked ? 0 : until, plan.id, grant?.id || null, user.id);
  });
}
export async function validatePrice(stripe, id, plan = PLANS.byok) {
  const p = await stripe.prices.retrieve(id);
  if (!p.active || p.currency !== 'usd' || p.unit_amount !== plan.monthlyCents || p.recurring?.interval !== 'month' || p.recurring?.interval_count !== 1 || p.billing_scheme === 'tiered' || p.recurring?.usage_type === 'metered') throw Error('Subscription price does not match the configured monthly plan.');
  return p;
}
