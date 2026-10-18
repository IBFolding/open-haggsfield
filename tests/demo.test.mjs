import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, transition, quote, recoverDemo } from '../src/demo.js';
const job = { id: 'job-1', kind: 'video', price: 120 };
test('duplicate reservation and completion charge once', () => {
  let state = transition(initialState(), { type: 'reserve', job });
  state = transition(state, { type: 'reserve', job });
  state = transition(state, { type: 'complete', id: job.id });
  state = transition(state, { type: 'complete', id: job.id });
  assert.equal(state.balance, 2280); assert.equal(state.jobs.length, 1); assert.equal(state.jobs[0].status, 'completed'); assert.equal(state.ledger.length, 2);
});
test('cancel, duplicate cancel and late completion cannot spend or refund twice', () => {
  let state = transition(initialState(), { type: 'reserve', job });
  state = transition(state, { type: 'cancel', id: job.id });
  state = transition(state, { type: 'cancel', id: job.id });
  state = transition(state, { type: 'complete', id: job.id });
  assert.equal(state.balance, 2400); assert.equal(state.jobs[0].status, 'canceled'); assert.equal(state.ledger.length, 3);
});
test('refresh recovers interrupted reservations once', () => {
  let state = transition(initialState(), { type: 'reserve', job });
  state = recoverDemo(recoverDemo(state));
  assert.equal(state.balance, 2400); assert.equal(state.ledger.filter(e => e.kind === 'refund').length, 1);
});
test('insufficient balance and concurrent jobs fail without mutating state', () => {
  const state = initialState();
  assert.throws(() => transition(state, { type: 'reserve', job: { ...job, price: 9999 } }), /Not enough/);
  assert.equal(state.balance, 2400);
  const running = transition(state, { type: 'reserve', job });
  assert.throws(() => transition(running, { type: 'reserve', job: { ...job, id: 'job-2' } }), /already running/);
  assert.equal(running.jobs.length, 1);
});
test('duplicate top-up id only credits once and requires demo wallet', () => {
  const action = { type: 'topup', id: 'payment-1', amount: 1000 };
  assert.throws(() => transition(initialState(), action), /Connect/);
  let state = transition(initialState(), { type: 'wallet', connected: true });
  state = transition(transition(state, action), action);
  assert.equal(state.balance, 3400); assert.equal(state.ledger.length, 2);
});
test('sample quote reflects duration, resolution and media mode', () => {
  assert.equal(quote({ kind: 'video', duration: 5, resolution: '720p', model: 'Higgsfield' }), 120);
  assert.equal(quote({ kind: 'video', duration: 10, resolution: '1080p', model: 'Higgsfield' }), 360);
  assert.equal(quote({ kind: 'image', duration: 5, resolution: '720p', model: 'Higgsfield' }), 20);
});
