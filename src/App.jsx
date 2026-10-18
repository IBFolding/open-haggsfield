import { useEffect, useId, useRef, useState } from 'react';
import { Aperture, ArrowRight, ArrowLeft, Image as ImageIcon, VideoCamera, Wallet, Plus, X, Play, Pause, CornersOut, DownloadSimple, Check, Clock, WarningCircle, SpinnerGap, MagnifyingGlass, Coins, Receipt } from '@phosphor-icons/react';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import { initialState, transition, quote, formatMoney, loadDemo, persistDemo } from './demo.js';

const samples = [
  { id: 'tokyo', title: 'Tokyo Nights', image: '/assets/tokyo-nights.png', prompt: 'A lone figure under an umbrella on a rain-soaked Tokyo street. Neon reflections, slow tracking shot, cinematic grain.' },
  { id: 'portrait', title: 'Neon Portrait', image: '/assets/neon-portrait.png', prompt: 'An intimate portrait in the rain. Blue neon light, shallow depth of field, delicate film grain.' },
  { id: 'clouds', title: 'Above the Clouds', image: '/assets/above-clouds.png', prompt: 'A mountain temple above a sea of clouds at sunrise. Slow aerial drift, warm light, cinematic scale.' },
];
const hero = { id: 'hero', title: 'Tokyo Drift', image: '/assets/tokyo-car.png', prompt: 'A silver sports car on a rain-soaked Tokyo street. Slow tracking shot, neon reflections, cinematic grain.' };
const initialReferences = [{ id: 'street', name: 'Tokyo street reference', url: '/assets/tokyo-nights.png' }, { id: 'car', name: 'Sports car reference', url: '/assets/tokyo-car.png' }];

function Select({ label, value, onChange, children, ...props }) {
  return <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} {...props}>{children}</select>;
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => { const lastFocus = document.activeElement; ref.current.showModal(); return () => { lastFocus?.focus?.(); }; }, []);
  return <dialog className={wide ? 'modal wide' : 'modal'} ref={ref} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-head"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={22} /></button></div>{children}</dialog>;
}
function SceneCard({ scene, onSelect, isJob = false }) {
  return <button className="scene-card" onClick={() => onSelect(scene)} aria-label={`Open ${scene.title}`}><div className="scene-image"><img src={scene.image} alt={scene.title} loading="lazy" /><span className="card-play"><Play weight="fill" size={18} /></span><span className="duration">{isJob && scene.kind === 'image' ? 'Image' : `0:${String(scene.duration || 5).padStart(2, '0')}`} </span></div><strong>{scene.title}</strong><span>{isJob ? 'Demo' : 'Sample'} · {scene.kind === 'image' ? 'Image' : 'Motion preview'} · {scene.ratio || '16:9'}</span></button>;
}

export function App() {
  const [state, setState] = useState(loadDemo);
  const stateRef = useRef(state);
  const [view, setView] = useState('studio');
  const [kind, setKind] = useState('video');
  const [model, setModel] = useState('Higgsfield');
  const [prompt, setPrompt] = useState(hero.prompt);
  const [ratio, setRatio] = useState('16:9');
  const [duration, setDuration] = useState('5');
  const [resolution, setResolution] = useState('720p');
  const [references, setReferences] = useState(initialReferences);
  const [selected, setSelected] = useState(hero);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [topup, setTopup] = useState('10');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const fileRef = useRef(null);
  const previewRef = useRef(null);
  const objectUrls = useRef([]);
  const generationTimer = useRef(null);
  const price = quote({ kind, duration: Number(duration), resolution, model });
  const activeJob = state.jobs.find(job => job.status === 'running');
  const previewDuration = selected.duration || 5;
  const completed = state.jobs.filter(job => job.status === 'completed').slice().reverse();
  const allScenes = [...completed, ...samples];
  const commit = action => {
    const next = action.type === 'reset' ? initialState() : transition(stateRef.current, action); stateRef.current = next; setState(next);
    if (!persistDemo(next)) setNotice('Browser storage is unavailable. This demo will last for this visit only.');
    return next;
  };
  useEffect(() => () => { objectUrls.current.forEach(URL.revokeObjectURL); clearTimeout(generationTimer.current); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (!playing) return; const timer = setInterval(() => setProgress(p => Math.min(100, p + 10 / previewDuration)), 100); return () => clearInterval(timer); }, [playing, previewDuration]);
  useEffect(() => { if (progress >= 100) setPlaying(false); }, [progress]);
  function selectScene(scene) { setSelected(scene); setPlaying(false); setProgress(0); setView('studio'); setPrompt(scene.prompt); setKind(scene.kind || 'video'); if (scene.ratio) setRatio(scene.ratio); }
  function generate() {
    setError('');
    if (!prompt.trim()) { setError('Add a prompt to describe your scene.'); return; }
    if (activeJob) return;
    if (stateRef.current.balance < price) { setModal('credits'); setNotice('Add demo credits before generating.'); return; }
    const source = /portrait|woman|face/i.test(prompt) ? samples[1] : /cloud|mountain|temple/i.test(prompt) ? samples[2] : /umbrella|figure/i.test(prompt) ? samples[0] : hero;
    const job = { id: crypto.randomUUID(), title: prompt.trim().split(/[.!?]/)[0].slice(0, 48), prompt: prompt.trim(), kind, model, ratio, duration: Number(duration), resolution, image: source.image, price, createdAt: Date.now() };
    try { commit({ type: 'reserve', job }); setPlaying(false); setProgress(0); generationTimer.current = setTimeout(() => { commit({ type: 'complete', id: job.id }); setSelected(job); setNotice('Demo complete. A sample scene was saved; no AI request was sent.'); }, 3600); }
    catch (err) { setError(err.message); }
  }
  function cancelGeneration() { if (!activeJob) return; clearTimeout(generationTimer.current); commit({ type: 'cancel', id: activeJob.id }); setNotice('Demo canceled. Reserved credits were returned.'); }
  function uploadFiles(event) {
    const files = Array.from(event.target.files || []);
    const accepted = files.filter(file => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024).slice(0, 3 - references.length);
    if (accepted.length < files.length) setNotice('Use up to 3 JPG, PNG, or WebP images, each under 10 MB.');
    setReferences(prev => [...prev, ...accepted.map(file => { const url = URL.createObjectURL(file); objectUrls.current.push(url); return { id: crypto.randomUUID(), name: file.name, url }; })]); event.target.value = '';
  }
  function addCredits() { if (!stateRef.current.wallet) { setModal('wallet'); return; } commit({ type: 'topup', id: crypto.randomUUID(), amount: Number(topup) * 100 }); setModal(null); setNotice(`${formatMoney(Number(topup) * 100)} in demo credits added. No tokens were transferred.`); }
  function play() { if (progress >= 100) setProgress(0); setPlaying(v => !v); }
  async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await previewRef.current.requestFullscreen(); } catch { setNotice('Fullscreen is not available in this browser.'); } }

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setView('studio')} aria-label="Open Haggsfield home"><Aperture weight="fill" size={31} /><span>OPEN HAGGSFIELD</span></button><nav aria-label="Main navigation"><button className={view === 'studio' ? 'active' : ''} onClick={() => setView('studio')}>Studio</button><button className={view === 'library' ? 'active' : ''} onClick={() => setView('library')}>Library{completed.length > 0 && <span className="nav-count">{completed.length}</span>}</button></nav><div className="account"><button className="balance-button" onClick={() => setModal('credits')}><span className="credit-label">Demo credits</span><span className="credit-label-short">Demo</span><strong>{formatMoney(state.balance)}</strong></button><span className="account-divider" /><button className="wallet-button" onClick={() => setModal('wallet')} aria-label={state.wallet ? 'Demo wallet' : 'Connect wallet'}><Wallet size={19} /><span>{state.wallet ? 'Demo wallet' : 'Connect wallet'}</span></button></div></header>
    {view === 'studio' ? <main className="studio-layout">
      <aside className="composer" aria-label="Creation controls"><h1>Create something <br />unreal</h1>
        <div className="mode-toggle" role="group" aria-label="Generation type"><button aria-pressed={kind === 'image'} className={kind === 'image' ? 'selected' : ''} onClick={() => { setKind('image'); setPlaying(false); }}><ImageIcon size={19} />Image</button><button aria-pressed={kind === 'video'} className={kind === 'video' ? 'selected' : ''} onClick={() => setKind('video')}><VideoCamera size={20} />Video</button></div>
        <div className="field"><label htmlFor="model">Model</label><Select label="Model" id="model" value={model} onChange={setModel}><option>Higgsfield</option><option>Kling</option></Select></div>
        <div className="field prompt-field"><label htmlFor="prompt">Prompt</label><textarea id="prompt" value={prompt} onChange={e => { setPrompt(e.target.value); setError(''); }} maxLength={2000} placeholder="Describe the scene you want to create…" aria-invalid={!!error} aria-describedby={error ? 'prompt-error' : undefined} /></div>
        <div className="field references-field"><span className="label">Reference images <span>(optional)</span></span><div className="reference-row">{references.map(ref => <div className={`reference ${ref.id === 'car' ? 'car-reference' : ''}`} key={ref.id}><img src={ref.url} alt={ref.name} /><button aria-label={`Remove ${ref.name}`} onClick={() => setReferences(prev => prev.filter(r => r.id !== ref.id))}><X size={14} /></button></div>)}{references.length < 3 && <button className="upload-tile" onClick={() => fileRef.current.click()}><Plus size={22} /><span>Add image</span></button>}</div><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={uploadFiles} hidden /></div>
        <div className="settings-row"><Select label="Aspect ratio" value={ratio} onChange={setRatio}><option>16:9</option><option>9:16</option><option>1:1</option></Select>{kind === 'video' ? <Select label="Duration" value={duration} onChange={setDuration}><option value="5">5 seconds</option><option value="10">10 seconds</option></Select> : <div className="setting-fixed">1 image</div>}<Select label="Resolution" value={resolution} onChange={setResolution}><option>720p</option><option>1080p</option></Select></div>
        {error && <p id="prompt-error" className="error" role="alert"><WarningCircle size={17} />{error}</p>}
        <button className="generate-button" onClick={generate} disabled={!!activeJob}>{activeJob ? <><SpinnerGap size={21} className="spin" />Simulating generation…</> : <><Play size={20} weight="fill" />Generate {kind}</>}</button><p className="price-line">Sample quote · {price} tokens / {formatMoney(price)}</p><button className="text-link pay-link" onClick={() => setModal('credits')}>Pay with Open Haggsfield<ArrowRight size={17} /></button>{activeJob && <button className="cancel-link" onClick={cancelGeneration}>Cancel demo & return credits</button>}
      </aside>
      <section className="workspace" aria-label="Preview and recent creations"><p className="demo-caption">Interactive preview · simulated prices and results</p>
        <div className={`preview ${playing ? 'is-playing' : ''}`} ref={previewRef}><img className="preview-image" src={selected.image} alt={selected.title} style={{ width: selected.ratio === '9:16' ? '31.64%' : selected.ratio === '1:1' ? '56.25%' : '100%', transform: `scale(${1 + progress * 0.0009}) translateX(${-progress * 0.012}%)` }} />
          {activeJob ? <div className="generation-overlay" role="status"><SpinnerGap size={35} className="spin" /><strong>Bringing your demo to life</strong><span>Simulated generation · no API charge</span><button onClick={cancelGeneration}>Cancel demo</button></div> : <>{(selected.kind || 'video') === 'video' && <button className="play-button" onClick={play} aria-label={playing ? 'Pause motion preview' : 'Play motion preview'}>{playing ? <Pause weight="fill" size={30} /> : <Play weight="fill" size={32} />}</button>}<div className="preview-bottom"><span>{playing || progress > 0 ? 'Motion preview · animated still' : 'Sample preview'}</span><div className="preview-tools">{(selected.kind || 'video') === 'video' && <span>0:{String(Math.floor(progress * previewDuration / 100)).padStart(2, '0')} / 0:{String(previewDuration).padStart(2, '0')}</span>}<a href={selected.image} download={`${selected.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-sample.png`} title="Download sample still" aria-label="Download sample still"><DownloadSimple size={20} /></a><button aria-label="Expand preview" onClick={fullscreen}><CornersOut size={22} /></button></div></div></>}
        </div>
        <div className="recent-heading"><h2>Recent creations</h2><button className="text-link" onClick={() => setView('library')}>View library<ArrowRight size={17} /></button></div><div className="recent-grid">{allScenes.slice(0, 3).map(scene => <SceneCard key={scene.id} scene={scene} onSelect={selectScene} isJob={!!scene.createdAt} />)}</div>
      </section>
    </main> : <main className="library"><div className="library-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Your creations</h1><p>Samples and your simulated generations, saved in this browser.</p></div><button className="small-primary" onClick={() => setView('studio')}><Plus size={19} />Create new</button></div><div className="library-controls"><div className="filters" role="group" aria-label="Library filter">{['all', 'video', 'image'].map(f => <button key={f} className={filter === f ? 'active' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All creations' : f === 'video' ? 'Video' : 'Images'}</button>)}</div><label className="search"><MagnifyingGlass size={19} /><input aria-label="Search creations" placeholder="Search creations" value={query} onChange={e => setQuery(e.target.value)} /></label></div><div className="library-grid">{allScenes.filter(scene => (filter === 'all' || (scene.kind || 'video') === filter) && scene.title.toLowerCase().includes(query.toLowerCase())).map(scene => <SceneCard key={scene.id} scene={scene} onSelect={selectScene} isJob={!!scene.createdAt} />)}</div>{!allScenes.some(scene => (filter === 'all' || (scene.kind || 'video') === filter) && scene.title.toLowerCase().includes(query.toLowerCase())) && <div className="empty-state"><ImageIcon size={35} /><h2>No creations here yet</h2><p>{query ? 'Try a different search.' : 'Create a demo image to see it here.'}</p><button className="text-link" onClick={() => { setKind('image'); setView('studio'); }}>Back to studio<ArrowRight size={18} /></button></div>}</main>}
    <footer><span className="footer-brand">OPEN HAGGSFIELD</span><span>Independent AI studio. Not affiliated with Higgsfield.</span><button onClick={() => setModal('funding')}>How credits work<ArrowRight size={14} /></button></footer>
    {notice && <div className="toast" role="status"><Check size={19} /><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={17} /></button></div>}
    {modal === 'wallet' && <Modal title={state.wallet ? 'Your demo wallet' : 'Connect to your studio'} onClose={() => setModal(null)}><div className="modal-symbol"><Wallet size={33} /></div><p className="modal-intro">Try the complete credit flow with a demo wallet. No extension, signature, or real funds needed.</p>{state.wallet ? <><div className="wallet-summary"><span>Demo wallet</span><strong>Connected <Check size={17} /></strong></div><button className="generate-button" onClick={() => setModal('credits')}>Manage demo credits<ArrowRight size={18} /></button><button className="secondary full" onClick={() => { commit({ type: 'wallet', connected: false }); setModal(null); }}>Disconnect demo wallet</button></> : <button className="generate-button" onClick={() => { commit({ type: 'wallet', connected: true }); setModal('credits'); }}>Try demo wallet<ArrowRight size={19} /></button>}<button className="reset-demo text-link" onClick={() => setModal('reset')}>Reset demo workspace</button><p className="modal-footnote">Live wallet payments will be available after the token and payment route are configured.</p></Modal>}
    {modal === 'reset' && <Modal title="Reset this demo?" onClose={() => setModal(null)}><p className="modal-intro">Remove this browser’s simulated jobs and credit activity, and start again with $24 in demo credits. No real funds or files are affected.</p><button className="generate-button" onClick={() => { clearTimeout(generationTimer.current); commit({ type: 'reset' }); setSelected(hero); setPrompt(hero.prompt); setKind('video'); setModel('Higgsfield'); setRatio('16:9'); setDuration('5'); setResolution('720p'); setReferences(initialReferences); setPlaying(false); setProgress(0); setView('studio'); setNotice(''); setModal(null); }}>Reset demo</button><button className="secondary full" onClick={() => setModal('wallet')}>Keep my demo</button></Modal>}
    {modal === 'credits' && <Modal title="Power your next creation" onClose={() => setModal(null)}><p className="modal-intro">Top up once. Create at your own pace.</p><div className="credit-overview"><span>Available demo credits</span><strong>{formatMoney(state.balance)}</strong>{activeJob && <span>{formatMoney(activeJob.price)} reserved for your current demo</span>}</div><label className="label" htmlFor="topup">Add demo credits</label><div className="topup-options" id="topup" role="group" aria-label="Top-up amount">{['5', '10', '25'].map(amount => <button key={amount} className={topup === amount ? 'selected' : ''} aria-pressed={topup === amount} onClick={() => setTopup(amount)}>${amount}</button>)}</div><div className="quote-summary"><span>Sample Open Haggsfield payment</span><strong>{(Number(topup) * 100).toLocaleString()} tokens</strong></div><p className="modal-footnote">Illustrative conversion only, not a token market price. No tokens move in this preview.</p><button className="generate-button" onClick={addCredits}><Wallet size={19} />{state.wallet ? `Add $${topup} demo credits` : 'Connect demo wallet'}</button><div className="modal-links"><button className="text-link" onClick={() => setModal('ledger')}><Receipt size={17} />View activity</button><button className="text-link" onClick={() => setModal('funding')}>How it works<ArrowRight size={16} /></button></div></Modal>}
    {modal === 'ledger' && <Modal title="Credit activity" onClose={() => setModal(null)} wide><p className="modal-intro">Demo entries only. Kept in this browser.</p><div className="ledger">{state.ledger.slice().reverse().map(entry => <div className="ledger-row" key={entry.id}><div><strong>{entry.label}</strong><span>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {entry.kind === 'refund' ? 'Credits returned' : 'Simulated'}</span></div><b className={entry.amount > 0 ? 'positive' : ''}>{entry.amount > 0 ? '+' : ''}{formatMoney(entry.amount)}</b></div>)}</div><button className="secondary full" onClick={() => setModal('credits')}><ArrowLeft size={17} />Back to credits</button></Modal>}
    {modal === 'funding' && <Modal title="A little credit. A lot of possibility." onClose={() => setModal(null)}><p className="modal-intro">The planned Open Haggsfield funding flow.</p><ol className="funding-steps"><li><Wallet size={23} /><div><strong>Pay with Open Haggsfield</strong><p>Convert a quoted token payment into generation credits.</p></div></li><li><VideoCamera size={23} /><div><strong>See the price before you create</strong><p>Reserve credits for each job. No unlimited spending permissions.</p></div></li><li><Coins size={23} /><div><strong>Trading fees can help fund creation</strong><p>Collected Pons creator fees can support a capped community credit pool.</p></div></li></ol><div className="info-note"><Clock size={21} /><p>Preview stage. Token payments, Pons fee collection, and Higgsfield generation are not connected.</p></div><button className="generate-button" onClick={() => setModal('credits')}>Try demo credits<ArrowRight size={18} /></button></Modal>}
  </div>;
}
