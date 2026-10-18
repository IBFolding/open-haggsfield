// Browser-only prototype accounting. Never use this ledger to authorize real spending.
const KEY = 'open-higgs-demo-v1';
export const formatMoney = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export const quote = ({ kind, duration, resolution, model }) => Math.round((kind === 'image' ? 20 : 120 * (duration / 5)) * (resolution === '1080p' ? 1.5 : 1) * (model === 'Kling' ? 1.25 : 1));
export function initialState() { return { version: 1, wallet: false, balance: 2400, jobs: [], ledger: [{ id: 'welcome', label: 'Welcome demo credits', kind: 'credit', amount: 2400, at: Date.now() }] }; }
export function transition(state, action) {
  const addEntry = (entry, changes = {}) => ({ ...state, ...changes, ledger: [...state.ledger, { ...entry, at: Date.now() }] });
  if (action.type === 'wallet') return { ...state, wallet: !!action.connected };
  if (action.type === 'topup') {
    if (!state.wallet) throw new Error('Connect your demo wallet first.');
    if (![500, 1000, 2500].includes(action.amount)) throw new Error('Choose a supported demo top-up.');
    if (state.ledger.some(entry => entry.id === action.id)) return state;
    return addEntry({ id: action.id, label: 'Demo token top-up', kind: 'credit', amount: action.amount }, { balance: state.balance + action.amount });
  }
  if (action.type === 'reserve') {
    const { job } = action;
    if (state.jobs.some(item => item.id === job.id)) return state;
    if (state.jobs.some(item => item.status === 'running')) throw new Error('A demo generation is already running.');
    if (!Number.isSafeInteger(job.price) || job.price <= 0) throw new Error('Invalid generation quote.');
    if (job.price > state.balance) throw new Error('Not enough demo credits.');
    return addEntry({ id: `reserve-${job.id}`, label: `Demo ${job.kind} reservation`, kind: 'reserve', amount: -job.price }, { balance: state.balance - job.price, jobs: [...state.jobs, { ...job, status: 'running' }] });
  }
  const job = state.jobs.find(item => item.id === action.id);
  if (!job || job.status !== 'running') return state;
  if (action.type === 'complete') return { ...state, jobs: state.jobs.map(item => item.id === job.id ? { ...item, status: 'completed' } : item) };
  if (action.type === 'cancel') return addEntry({ id: `refund-${job.id}`, label: 'Demo generation canceled', kind: 'refund', amount: job.price }, { balance: state.balance + job.price, jobs: state.jobs.map(item => item.id === job.id ? { ...item, status: 'canceled' } : item) });
  return state;
}
export function recoverDemo(state) { return state.jobs.filter(job => job.status === 'running').reduce((next, job) => transition(next, { type: 'cancel', id: job.id }), state); }
export function loadDemo() {
  try { const data = JSON.parse(localStorage.getItem(KEY)); if (data?.version !== 1 || !Number.isSafeInteger(data.balance) || data.balance < 0 || !Array.isArray(data.jobs) || !Array.isArray(data.ledger)) return initialState(); const recovered = recoverDemo(data); persistDemo(recovered); return recovered; }
  catch { return initialState(); }
}
export function persistDemo(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; } }
