/* ============================================================
   MACROÉCONOMIE → SECTEUR — refonte v3 (maquette « Macro A v3 » validée le 2026-11-13)
   Données ETF sectoriels et taux prises sur TRADINGVIEW (serveur local, /api/tv/history) au lieu du Google Sheet.
   Mêmes calculs que le Sheet « DATA SECTORIELS US » / « DASHBOARD CYCLE » (vérifié le 2026-11-13 : performances 3 ans
   des 11 ETF identiques au centième) :
   - rotation : (ETF / ETF au départ) ÷ (SPY / SPY au départ), clôtures hebdomadaires, 3 ans ;
   - cycle : somme base 100 (XLK + XLF + XLI) ÷ somme base 100 (XLV + XLP + XLU), base = début des 3 dernières années,
     EMA 20 semaines, écart-type glissant 20 semaines, bandes ±1σ ±2σ (historique depuis 1999) ;
   - tableau : performances 1/2/3/6 mois et 1/2/3 ans (clôtures quotidiennes), Classement = 0,5 × 1m + 0,3 × 2m + 0,2 × 3m ;
     les lignes « Power » du Sheet (formule inconnue) deviennent « Force vs S&P » = performance − performance du SPY.
   Remplit les variables d'app.js (sectorEtfData, macroRotationData, macroCycleData, macroPowerData) puis appelle ses
   rendus : les 4 graphiques, le tableau et « Taux vs Actions/Secteurs » restent ceux d'app.js. Ajoute : verdict du loup,
   rotation des flux, flux de la semaine, carte des taux. Sans serveur local (site en ligne) : ancien chemin Google Sheet.
   ============================================================ */
(function(){
'use strict';
const isLocal = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const SECT = () => MACRO_ROTATION_SECTORS;
const CAT = { XLK:'SENSIBLE', XLV:'DÉFENSIF', XLP:'DÉFENSIF', XLY:'CYCLIQUE', XLF:'CYCLIQUE', XLI:'SENSIBLE', XLE:'SENSIBLE', XLB:'CYCLIQUE', XLU:'DÉFENSIF', XLRE:'CYCLIQUE', XLC:'SENSIBLE' };
const SHORTL = { techno:'Technologie', sante:'Santé', consobase:'Conso. de base', consodiscr:'Conso. discrét.', finance:'Finance', industrie:'Industrie', energie:'Énergie', materiaux:'Matériaux', services:'Services publics', immobilier:'Immobilier', telecoms:'Télécoms' };
const HEAD = { techno:'Technologie (%)', sante:'Santé (%)', consobase:'Conso de base (%)', consodiscr:'Conso discrét (%)', finance:'Finance (%)', industrie:'Industrie (%)', energie:'Energie (%)', materiaux:'Matériaux (%)', services:'Services Publics (%)', immobilier:'Immobilier (%)', telecoms:'Télecoms (%)' };
const RATE_SYMS = ['TVC:US10Y', 'TVC:US02Y', 'TVC:FR10Y', 'TVC:DE10Y'];
const WOLF_JUMELLES = 'IMAGE HORIZONTALE/Loup analyste au cœur des marchés d’or.png';
const st = { daily: {}, weekly: null, ranks: null, prevRanks: null, rates: {}, err: null, loading: false, rrgPeriod: '3m', rrgTail: 5, anim: null };

const iso = ts => new Date(ts * 1000).toISOString().slice(0, 10);
const nf = (v, d = 2) => v == null || !isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const sgn = (v, d = 1, u = '') => v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + u;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c]);

async function tvHistory(symbols, from){
  const r = await fetch('/api/tv/history?symbols=' + encodeURIComponent(symbols.join(',')) + '&from=' + from + '&adj=1', { cache: 'no-store' });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'TradingView indisponible');
  const out = {};
  Object.keys(j.data || {}).forEach(s => { const b = j.data[s].bars || []; out[s] = { dates: b.map(x => iso(x[0])), closes: b.map(x => x[1]) }; });
  return { data: out, errors: j.errors || {} };
}
// Clôture du dernier jour de chaque semaine, alignée sur les semaines du SPY (clé = lundi).
function mondayKey(d){ const x = new Date(d + 'T00:00:00Z'); const wd = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - wd); return x.toISOString().slice(0, 10); }
function toWeekly(){
  const spy = st.daily['AMEX:SPY'];
  const lastBy = sym => { const m = {}; const s = st.daily[sym]; if (!s) return m; s.dates.forEach((d, i) => { m[mondayKey(d)] = { d, c: s.closes[i] }; }); return m; };
  const spyW = lastBy('AMEX:SPY'), keys = Object.keys(spyW).sort();
  const w = { keys, dates: keys.map(k => spyW[k].d), spy: keys.map(k => spyW[k].c), etf: {} };
  SECT().forEach(s => { const m = lastBy('AMEX:' + s.ticker); w.etf[s.ticker] = keys.map(k => m[k] ? m[k].c : null); });
  return spy ? w : null;
}
function closeAtOrBefore(sym, isoDate){
  const s = st.daily[sym]; if (!s) return null;
  let lo = 0, hi = s.dates.length - 1, ans = -1;
  while (lo <= hi){ const m = (lo + hi) >> 1; if (s.dates[m] <= isoDate){ ans = m; lo = m + 1; } else hi = m - 1; }
  return ans >= 0 ? s.closes[ans] : null;
}
function shiftIso(isoDate, months, days){ const d = new Date(isoDate + 'T00:00:00Z'); if (months) d.setUTCMonth(d.getUTCMonth() - months); if (days) d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); }
function perfAt(sym, endIso, months){ const a = closeAtOrBefore(sym, endIso), b = closeAtOrBefore(sym, shiftIso(endIso, months)); return a != null && b ? (a / b - 1) * 100 : null; }

/* ---------- calculs ---------- */
function buildRotationAndEtf(w){
  // sectorEtfData (app.js) : historique long ETF + SPY, mêmes dates pour tous (secteur isolé, « Taux vs Actions/Secteurs »)
  const data = {};
  SECT().forEach(s => { const v = w.etf[s.ticker], dates = [], values = []; v.forEach((x, i) => { if (x != null){ dates.push(w.dates[i]); values.push(x); } }); data[s.ticker] = { dates, values }; });
  data.SPY = { dates: w.dates.slice(), values: w.spy.slice() };
  sectorEtfData = data; sectorEtfLoadError = null;
  const from = shiftIso(w.dates[w.dates.length - 1], 36);
  let i0 = w.dates.findIndex(d => d >= from); if (i0 < 0) i0 = 0;
  const out = { dates: w.dates.slice(i0), series: {} };
  SECT().forEach(s => {
    const v = w.etf[s.ticker], b = v[i0], sb = w.spy[i0];
    out.series[s.key] = out.dates.map((_, j) => { const x = v[i0 + j], sp = w.spy[i0 + j]; return x != null && b && sp ? +((x / b) / (sp / sb)).toFixed(5) : null; });
  });
  macroRotationData = out;
  return i0;
}
function buildCycle(w, baseIdx){
  const off = ['XLK', 'XLF', 'XLI'], def = ['XLV', 'XLP', 'XLU'];
  const sum = (tks, i) => { let t = 0; for (const k of tks){ const x = w.etf[k][i], b = w.etf[k][baseIdx]; if (x == null || !b) return null; t += x / b * 100; } return t; };
  const out = { dates: [], ratio: [], ema: [], plus1: [], minus1: [], plus2: [], minus2: [], euphorie: [], panique: [] };
  const N = 20, k = 2 / (N + 1), win = [];
  let ema = null;
  w.dates.forEach((d, i) => {
    const a = sum(off, i), b = sum(def, i);
    if (a == null || !b) return;
    const r = a / b;
    win.push(r); if (win.length > N) win.shift();
    if (ema == null && win.length === N) ema = win.reduce((x, y) => x + y, 0) / N;
    else if (ema != null) ema = r * k + ema * (1 - k);
    let sd = null;
    if (win.length === N){ const m = win.reduce((x, y) => x + y, 0) / N; sd = Math.sqrt(win.reduce((x, y) => x + (y - m) ** 2, 0) / (N - 1)); }
    const e = ema, p2 = e != null && sd != null ? e + 2 * sd : null, m2 = e != null && sd != null ? e - 2 * sd : null;
    out.dates.push(d); out.ratio.push(+r.toFixed(5)); out.ema.push(e != null ? +e.toFixed(5) : null);
    out.plus1.push(e != null && sd != null ? e + sd : null); out.minus1.push(e != null && sd != null ? e - sd : null);
    out.plus2.push(p2); out.minus2.push(m2);
    out.euphorie.push(p2 != null && r > p2 ? 1 : 0); out.panique.push(m2 != null && r < m2 ? 1 : 0);
  });
  macroCycleData = out;
}
function powerRows(endIso){
  const spyP = m => perfAt('AMEX:SPY', endIso, m);
  const per = m => SECT().map(s => perfAt('AMEX:' + s.ticker, endIso, m));
  const p1 = per(1), p2 = per(2), p3 = per(3), p12 = per(12), sp12 = spyP(12), sp3 = spyP(3);
  const cl = p1.map((v, i) => v != null && p2[i] != null && p3[i] != null ? 0.5 * v + 0.3 * p2[i] + 0.2 * p3[i] : null);
  return [
    { label: 'Classement', values: cl },
    { label: 'Force vs S&P 1 an', values: p12.map(v => v != null && sp12 != null ? v - sp12 : null) },
    { label: 'Force vs S&P 3 mois', values: p3.map(v => v != null && sp3 != null ? v - sp3 : null) },
    { label: '1 moi', values: p1 }, { label: '2 mois', values: p2 }, { label: '3 mois', values: p3 },
    { label: '6 mois', values: per(6) }, { label: '1 ans', values: p12 }, { label: '2 ans', values: per(24) }, { label: '3 ans', values: per(36) }
  ];
}
function ranksOf(values){ const idx = values.map((v, i) => ({ v, i })).filter(x => x.v != null).sort((a, b) => b.v - a.v); const r = {}; idx.forEach((x, n) => { r[SECT()[x.i].key] = n + 1; }); return r; }
function buildPower(){
  const spy = st.daily['AMEX:SPY'], last = spy.dates[spy.dates.length - 1];
  const rows = powerRows(last);
  macroPowerData = { categories: SECT().map(s => CAT[s.ticker] || ''), headers: SECT().map(s => HEAD[s.key]), rows, source: 'tv', at: last };
  st.ranks = ranksOf(rows[0].values);
  st.prevRanks = ranksOf(powerRows(shiftIso(last, 0, 7))[0].values);
}
// Flèche de la semaine sur le classement (app.js l'ajoute au libellé du secteur si disponible)
window.macroRankArrow = function(header){
  if (!st.ranks || !st.prevRanks) return '';
  const s = SECT().find(x => HEAD[x.key] === header); if (!s) return '';
  const d = (st.prevRanks[s.key] || 0) - (st.ranks[s.key] || 0);
  return d > 0 ? '▲' + d : d < 0 ? '▼' + (-d) : '=';
};

/* ---------- chargement ---------- */
async function load(force){
  if (!isLocal() || st.loading) return false;
  st.loading = true; st.err = null;
  setStatus('Chargement des ETF et des taux sur TradingView…');
  try{
    const [etf, rates] = await Promise.all([
      tvHistory(SECT().map(s => 'AMEX:' + s.ticker).concat(['AMEX:SPY']), '1998-12-01'),
      tvHistory(RATE_SYMS, '2005-01-01').catch(e => ({ data: {}, errors: { taux: e.message } }))
    ]);
    st.daily = etf.data; st.rates = rates.data;
    if (!st.daily['AMEX:SPY']) throw new Error('SPY indisponible');
    const w = toWeekly();
    const baseIdx = buildRotationAndEtf(w);
    buildCycle(w, baseIdx);
    buildPower();
    const errs = Object.keys(etf.errors || {});
    setStatus(errs.length ? '⚠ TradingView : ' + errs.join(', ') + ' (dernier cours connu)' : '');
    renderAppCharts();
    renderNew();
    st.loading = false;
    return true;
  }catch(e){
    st.loading = false; st.err = (e && e.message) || String(e);
    setStatus('⚠ ETF TradingView indisponibles (' + st.err + ') : relance le raccourci Wolf Analysis. Données du Google Sheet en attendant.');
    return false;
  }
}
function setStatus(t){ const el = document.getElementById('mxStatus'); if (el){ el.textContent = t; el.style.display = t ? '' : 'none'; } }
function renderAppCharts(){
  ['macroCycleStatus', 'macroRotationStatus'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  const safe = f => { try{ if (typeof f === 'function') f(); }catch(e){ console.error(e); } };
  safe(renderMacroCycleChart); safe(renderMacroRotationChart); safe(renderMacroWeightChart);
  safe(renderMacroPowerTable); safe(renderMacroRankingChart); safe(typeof renderRateOverlayChart === 'function' ? renderRateOverlayChart : null);
  safe(typeof renderMacroCycleRead === 'function' ? renderMacroCycleRead : null);
}

/* ---------- verdict du loup ---------- */
function isoWeek(d){ const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); }
function cycleNow(){
  const c = macroCycleData; if (!c || !c.dates.length) return null;
  const i = c.dates.length - 1, r = c.ratio[i], e = c.ema[i], sd = c.plus1[i] != null && e != null ? c.plus1[i] - e : null;
  return { r, e, z: sd ? (r - e) / sd : null, i };
}
function verdictOf(z){
  if (z == null) return { t: 'En observation', s: 'Données insuffisantes', cls: 'mid' };
  if (z <= -2) return { t: 'Il se met à l\'abri', s: 'Défensif · Panique', cls: 'neg' };
  if (z <= -1) return { t: 'Il devient prudent', s: 'Défensif', cls: 'neg' };
  if (z < 1) return { t: 'Il observe', s: 'Neutre', cls: 'mid' };
  if (z < 2) return { t: 'Il passe à l\'attaque', s: 'Offensif', cls: 'pos' };
  return { t: 'Il chasse en meute', s: 'Offensif · Euphorie', cls: 'pos' };
}
function lastOf(sym){ const s = st.rates[sym]; return s && s.closes.length ? { v: s.closes[s.closes.length - 1], d: s.dates[s.dates.length - 1] } : null; }
function renderVerdict(){
  const box = document.getElementById('mxVerdict'); if (!box) return;
  const c = cycleNow(), v = verdictOf(c && c.z), us10 = lastOf('TVC:US10Y');
  box.innerHTML = `<div class="mx-v-main"><div class="mx-v-txt"><span class="mx-v-eyebrow">LE VERDICT DU LOUP · SEMAINE ${isoWeek(new Date())}</span>
      <span class="mx-v-title">${esc(v.t)}</span><span class="mx-v-badge ${v.cls}">${esc(v.s)}</span></div>
    <div class="mx-v-tiles">
      <div><div class="mx-k">RATIO OFF. / DÉF.</div><div class="mx-n">${c ? nf(c.r, 2) : '—'}</div></div>
      <div><div class="mx-k">VS SA MOYENNE</div><div class="mx-n ${v.cls}">${c && c.z != null ? sgn(c.z, 1, ' σ') : '—'}</div></div>
      <div><div class="mx-k">TAUX US 10 ANS</div><div class="mx-n">${us10 ? nf(us10.v, 2) + ' %' : '—'}</div></div>
    </div></div>
    <div class="mx-v-wolf" role="img" aria-label="Le loup aux jumelles"><img alt="" src="/api/studio/wolf?f=${encodeURIComponent(WOLF_JUMELLES)}&s=f" onerror="this.parentNode.style.display='none'"></div>`;
}

/* ---------- rotation des flux (force vs S&P en x, vitesse en y) ---------- */
const RRG_L = { '1m': 4, '3m': 13, '6m': 26, '1a': 52 };
function rrgPoints(period, tail){
  const rot = sectorEtfData, spy = rot && rot.SPY; if (!spy) return [];
  const L = RRG_L[period] || 13, k = Math.max(1, Math.round(L / 4));
  return SECT().map((s, si) => {
    const e = rot[s.ticker]; if (!e) return null;
    const spyBy = {}; spy.dates.forEach((d, i) => { spyBy[d] = spy.values[i]; });
    const rs = [], dates = []; e.dates.forEach((d, i) => { const sp = spyBy[d]; if (sp){ rs.push(e.values[i] / sp); dates.push(d); } });
    const n = rs.length; if (n < L + k + tail + 2) return null;
    const xs = [];
    for (let i = n - tail - k; i < n; i++){ const win = rs.slice(i - L + 1, i + 1); const m = win.reduce((a, b) => a + b, 0) / win.length; xs.push(100 * rs[i] / m); }
    const pts = [];
    for (let j = k; j < xs.length; j++) pts.push({ x: +xs[j].toFixed(3), y: +(100 * xs[j] / xs[j - k]).toFixed(3), d: dates[n - xs.length + j] });
    return { key: s.key, label: SHORTL[s.key], color: MACRO_ROTATION_COLORS[si], pts };
  }).filter(Boolean);
}
const QUAD = [
  { n: 'En tête', c: 'rgba(79,209,165,0.08)', t: '#4FD1A5', qx: 1, qy: 1 },
  { n: 'S\'essouffle', c: 'rgba(242,196,61,0.08)', t: '#F2C43D', qx: 1, qy: -1 },
  { n: 'À la traîne', c: 'rgba(229,99,107,0.08)', t: '#E5636B', qx: -1, qy: -1 },
  { n: 'Se redresse', c: 'rgba(74,159,224,0.08)', t: '#4A9FE0', qx: -1, qy: 1 }
];
let rrgChart = null;
function renderRrg(showN){
  const canvas = document.getElementById('mxRrgCanvas'); if (!canvas || typeof Chart === 'undefined') return;
  const series = rrgPoints(st.rrgPeriod, st.rrgTail);
  if (!series.length) return;
  const all = series.flatMap(s => s.pts);
  const dx = Math.max(1.5, ...all.map(p => Math.abs(p.x - 100))) * 1.15, dy = Math.max(1.5, ...all.map(p => Math.abs(p.y - 100))) * 1.15;
  const cut = showN == null ? null : showN;
  const ds = series.map(s => {
    const pts = cut == null ? s.pts : s.pts.slice(0, Math.max(1, cut));
    return { label: s.label, data: pts, borderColor: s.color, backgroundColor: s.color, showLine: true, borderWidth: 2, tension: 0,
      pointRadius: pts.map((_, i) => i === pts.length - 1 ? 7 : 2.5), pointHoverRadius: 8 };
  });
  const quad = { id: 'mxQuad', beforeDatasetsDraw(ch){
    const g = ch.ctx, a = ch.chartArea, x = ch.scales.x, y = ch.scales.y; const cx = x.getPixelForValue(100), cy = y.getPixelForValue(100);
    g.save();
    QUAD.forEach(q => { const x0 = q.qx > 0 ? cx : a.left, x1 = q.qx > 0 ? a.right : cx, y0 = q.qy > 0 ? a.top : cy, y1 = q.qy > 0 ? cy : a.bottom;
      g.fillStyle = q.c; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = q.t; g.font = "800 13px 'Plus Jakarta Sans', sans-serif"; g.textBaseline = q.qy > 0 ? 'top' : 'bottom'; g.textAlign = q.qx > 0 ? 'right' : 'left';
      g.fillText(q.n.toUpperCase(), q.qx > 0 ? a.right - 8 : a.left + 8, q.qy > 0 ? a.top + 8 : a.bottom - 8); });
    g.strokeStyle = '#3A444F'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, a.top); g.lineTo(cx, a.bottom); g.moveTo(a.left, cy); g.lineTo(a.right, cy); g.stroke();
    g.restore(); },
    afterDatasetsDraw(ch){
      // étiquettes au bout de chaque traînée, écartées verticalement quand elles se chevauchent
      const g = ch.ctx; g.save(); g.font = "800 12px 'Plus Jakarta Sans', sans-serif"; g.textBaseline = 'middle';
      const labs = ch.data.datasets.map((d, i) => { const m = ch.getDatasetMeta(i); const p = !m.hidden && m.data[m.data.length - 1]; return p ? { t: d.label, c: d.borderColor, x: p.x + 10, y: p.y, w: g.measureText(d.label).width } : null; }).filter(Boolean).sort((a, b) => a.y - b.y);
      for (let i = 1; i < labs.length; i++) for (let j = 0; j < i; j++){ const a = labs[j], b = labs[i]; if (Math.abs(a.y - b.y) < 14 && a.x < b.x + b.w && b.x < a.x + a.w) b.y = a.y + 14; }
      labs.forEach(l => { g.fillStyle = 'rgba(13,16,19,0.75)'; g.fillRect(l.x - 3, l.y - 8, l.w + 6, 16); g.fillStyle = l.c; g.fillText(l.t, l.x, l.y); });
      g.restore(); } };
  if (rrgChart){ rrgChart.destroy(); rrgChart = null; }
  rrgChart = new Chart(canvas, { type: 'scatter', data: { datasets: ds }, plugins: [quad],
    options: { responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: it => ' ' + it.dataset.label + ' (' + it.raw.d.split('-').reverse().join('/') + ') : force ' + nf(it.raw.x, 1) + ' · vitesse ' + nf(it.raw.y, 1) } } },
      scales: { x: { min: 100 - dx, max: 100 + dx, grid: { display: false }, border: { color: '#262E36' }, title: { display: true, text: 'Force vs S&P 500 →', color: '#8B93A0', font: { weight: 700 } }, ticks: { color: '#8B93A0', callback: v => nf(v, 0) } },
        y: { min: 100 - dy, max: 100 + dy, grid: { display: false }, border: { color: '#262E36' }, title: { display: true, text: 'Vitesse ↑', color: '#8B93A0', font: { weight: 700 } }, ticks: { color: '#8B93A0', callback: v => nf(v, 0) } } } } });
}
function replayRrg(){
  clearInterval(st.anim); let n = 1; const max = st.rrgTail;
  renderRrg(n);
  st.anim = setInterval(() => { n++; renderRrg(n); if (n >= max){ clearInterval(st.anim); st.anim = null; } }, 450);
}

/* ---------- flux de la semaine + taux ---------- */
function renderFlux(){
  const box = document.getElementById('mxFlux'); if (!box) return;
  if (!st.ranks || !st.prevRanks){ box.innerHTML = '<p class="mx-p">En attente des données TradingView…</p>'; return; }
  const moves = SECT().map(s => ({ s, now: st.ranks[s.key], d: (st.prevRanks[s.key] || 0) - (st.ranks[s.key] || 0) })).filter(m => m.now);
  const total = moves.length;
  const pick = moves.filter(m => m.d !== 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 4);
  const phrase = m => m.d > 0 ? (m.now === 1 ? 'passe en tête' : m.now <= 3 ? 'entre dans le haut du classement' : 'gagne ' + m.d + ' place' + (m.d > 1 ? 's' : ''))
    : (m.now === total ? 'chute à la dernière place' : m.now > total - 3 ? 'tombe dans le bas du classement' : 'recule de ' + (-m.d) + ' place' + (m.d < -1 ? 's' : ''));
  const lines = pick.length ? pick.map(m => `<div class="mx-flux-row"><span class="mx-mv ${m.d > 0 ? 'pos' : 'neg'}">${m.d > 0 ? '▲' : '▼'}${Math.abs(m.d)}</span><span><b>${esc(SHORTL[m.s.key])}</b> ${phrase(m)}</span></div>`).join('')
    : '<p class="mx-p">Aucun changement de place cette semaine.</p>';
  // bascule du cycle : dernier croisement du ratio et de sa moyenne
  const c = macroCycleData; let msg = '';
  if (c && c.dates.length > 30){
    const n = c.dates.length; const above = i => c.ratio[i] >= c.ema[i];
    let j = n - 1; while (j > 0 && c.ema[j - 1] != null && above(j - 1) === above(n - 1)) j--;
    const weeks = n - 1 - j, up = above(n - 1);
    msg = weeks <= 8 ? `Bascule ${up ? 'défensif → offensif' : 'offensif → défensif'} détectée : le ratio a croisé sa moyenne à la ${up ? 'hausse' : 'baisse'} il y a ${weeks || 'moins d\'une'} semaine${weeks > 1 ? 's' : ''}.`
      : `Pas de bascule récente : le ratio est ${up ? 'au-dessus' : 'en dessous'} de sa moyenne depuis ${weeks} semaines.`;
  }
  box.innerHTML = lines + (msg ? `<p class="mx-p">${esc(msg)}</p>` : '');
}
function renderRates(){
  const box = document.getElementById('mxRates'); if (!box) return;
  const us10 = st.rates['TVC:US10Y'], us2 = lastOf('TVC:US02Y'), fr = lastOf('TVC:FR10Y'), de = lastOf('TVC:DE10Y'), l10 = lastOf('TVC:US10Y');
  if (!l10){ box.innerHTML = '<p class="mx-p">Taux TradingView indisponibles pour l\'instant.</p>'; return; }
  const m1 = (() => { const t = shiftIso(l10.d, 1); let v = null; us10.dates.forEach((d, i) => { if (d <= t) v = us10.closes[i]; }); return v; })();
  const cpiReady = typeof creditIndicatorsData !== 'undefined' && creditIndicatorsData && creditIndicatorsData.cpi;
  if (!cpiReady && (renderRates.tries = (renderRates.tries || 0) + 1) < 15) setTimeout(renderRates, 4000);   // l'inflation (FRED) arrive après
  const cpi = typeof creditIndicatorsData !== 'undefined' && creditIndicatorsData && creditIndicatorsData.cpi && creditIndicatorsData.cpi.values.length ? creditIndicatorsData.cpi.values[creditIndicatorsData.cpi.values.length - 1] : null;
  box.innerHTML = `<div class="mx-rate-top"><span class="mx-rate-big">${nf(l10.v, 2)} %</span><span class="mx-mv ${m1 != null && l10.v - m1 > 0 ? 'neg' : 'pos'}">${m1 != null ? sgn(l10.v - m1, 2, ' pt') + ' / 1 mois' : ''}</span></div>
    <div class="mx-rate-grid">
      <div><div class="mx-k">10A − 2A</div><b>${us2 ? sgn(l10.v - us2.v, 2, ' pt') : '—'}</b></div>
      <div><div class="mx-k">TAUX RÉEL</div><b>${cpi != null ? sgn(l10.v - cpi, 2, ' %') : '—'}</b></div>
      <div><div class="mx-k">OAT / BUND</div><b>${fr && de ? sgn(fr.v - de.v, 2, ' pt') : '—'}</b></div>
    </div>
    <p class="mx-p">Taux US 10 ans, 2 ans, OAT et Bund : TradingView (au ${l10.d.split('-').reverse().join('/')}). Taux réel = 10 ans − inflation (CPI). Superposable à la rotation sectorielle (« + Superposer »).</p>`;
}
function renderNew(){ renderVerdict(); renderRrg(); renderFlux(); renderRates(); wire(); }
function wire(){
  const tools = document.getElementById('mxRrgTools');
  if (tools){
    tools.innerHTML = ['1m', '3m', '6m', '1a'].map(p => `<button type="button" class="av3-chip${st.rrgPeriod === p ? ' on' : ''}" data-rrg="${p}">${p}</button>`).join('') + '<button type="button" class="av3-chip" data-rrg="play">▶ rejouer</button>';
    if (!tools.dataset.wired){ tools.dataset.wired = '1';
      tools.addEventListener('click', e => { const b = e.target.closest('button[data-rrg]'); if (!b) return;
        if (b.dataset.rrg === 'play') return replayRrg();
        st.rrgPeriod = b.dataset.rrg; clearInterval(st.anim); wire(); renderRrg(); }); }
  }
}

window.MACRO_TV = { load, isLocal, render: renderNew, _st: st, _rrg: rrgPoints };
})();
