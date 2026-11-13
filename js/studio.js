/* ======================= WOLF STUDIO (2026-11-12) =======================
   Onglet « 🎬 Studio » : 1) MINIATURES YouTube (17 modèles, 45 mises en page validés avec l'utilisateur sur maquette :
   https://claude.ai/artifact/B4bfYADeVQL6G83Q4kJ6WX) ; 2) SHORT « Wolf Portfolio de la semaine » enregistré avec la webcam et
   le micro du bureau (maquette https://claude.ai/artifact/Gg5cj3sSavP5FRYf14QgSL).
   Règles : textes SANS accents (up()), coin bas droit libre (durée YouTube), chiffres calculés (cours TradingView, Mes portefeuilles)
   mais toujours modifiables à la main (champs « calculé, modifiable » : vide = calcul). Loups = banque de l'utilisateur, lue par le
   serveur (/api/studio/wolves, /api/studio/wolf, versions allégées en cache), jamais modifiée. Images ajoutées = /api/atelier/media.
   Données = FICHIER data/mes-portefeuilles/studio.json (store « studio ») : miniatures enregistrées (items, jamais effacées sans
   déclaration), réglages du short, corbeille. Logos TradingView chargés en CORS (sinon export PNG impossible). */
(function(){
'use strict';
const PAGE_ID = 'pageStudio';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = v => typeof v === 'number' && isFinite(v);
const fr = (v, d = 0) => isNum(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '—';
const sgn = (v, d = 0) => isNum(v) ? (v >= 0 ? '+' : '−') + fr(Math.abs(v), d) + ' %' : '—';
const up = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => iso(new Date());
const dt = s => new Date(s + 'T12:00:00');
const addD = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
const Y = '#EEFF41', AF = 'Anton, Impact, "Arial Narrow", sans-serif', BF = '"Plus Jakarta Sans", "Segoe UI", sans-serif';

/* ---------- loups : banque de l'utilisateur ---------- */
const POSES = {"pointe": "IMAGE HORIZONTALE/ChatGPT Image 14 août 2026, 23_53_57.png", "loupe": "IMAGE HORIZONTALE/ChatGPT Image 16 août 2026, 13_49_27.png", "jumelles": "IMAGE HORIZONTALE/Loup analyste au cœur des marchés d’or.png", "calculatrice": "IMAGE HORIZONTALE/ChatGPT Image 20 août 2026, 23_34_38.png", "journal": "IMAGE HORIZONTALE/Loup analyste et marchés financiers.png", "calendrier": "IMAGE HORIZONTALE/Loup analyste et calendrier financier.png", "casque": "IMAGE HORIZONTALE/ChatGPT Image 15 août 2026, 00_14_00.png", "casque_rouge": "IMAGE HORIZONTALE/ChatGPT Image 21 août 2026, 10_58_57.png", "portefeuille": "IMAGE HORIZONTALE/ChatGPT Image 14 août 2026, 23_42_55.png", "billets": "IMAGE HORIZONTALE/ChatGPT Image 15 août 2026, 00_01_07.png", "eventail": "IMAGE HORIZONTALE/revenus.png", "coffre": "IMAGE HORIZONTALE/ChatGPT Image 16 août 2026, 13_48_34.png", "bouclier": "IMAGE HORIZONTALE/substituabilite.png", "question": "IMAGE HORIZONTALE/Loup penseur et point d’interrogation doré.png", "pensif": "IMAGE HORIZONTALE/ChatGPT Image 14 août 2026, 23_52_03.png", "explique": "IMAGE HORIZONTALE/ChatGPT Image 14 août 2026, 23_45_27.png", "bras_ouverts": "IMAGE HORIZONTALE/ChatGPT Image 20 août 2026, 13_10_29.png", "bras_croises": "IMAGE HORIZONTALE/conclusion.png", "boxe": "IMAGE HORIZONTALE/concurrents.png", "stop": "IMAGE HORIZONTALE/ChatGPT Image 14 août 2026, 23_46_23.png", "pancarte": "IMAGE HORIZONTALE/ChatGPT Image 15 août 2026, 00_03_48.png", "panique": "IMAGE HORIZONTALE/ChatGPT Image 15 août 2026, 14_09_16.png", "crash": "IMAGE HORIZONTALE/ChatGPT Image 21 août 2026, 10_56_54.png", "risques": "IMAGE HORIZONTALE/ChatGPT Image 6 sept. 2026, 16_16_30.png", "chaines": "IMAGE HORIZONTALE/ChatGPT Image 14 août 2026, 23_56_45 (1).png", "facepalm": "IMAGE HORIZONTALE/ChatGPT Image 14 août 2026, 23_51_12.png", "rire": "IMAGE HORIZONTALE/actionnariat.png", "hausse": "IMAGE HORIZONTALE/perspectives.png"};
const wolfUrl = (ref, small) => {
  if (!ref) return '';
  if (ref.startsWith('media:')) return '/api/atelier/media?f=' + encodeURIComponent(ref.slice(6));
  return '/api/studio/wolf?s=' + (small ? 't' : 'f') + '&f=' + encodeURIComponent(POSES[ref] || ref);
};
let bankList = null, bankAt = 0;   // fichiers des banques (chemins relatifs) ; relus à chaque ouverture de l'onglet (images ajoutées entre-temps)
async function loadBank(force){
  if (bankList && !force && Date.now() - bankAt < 20000) return bankList; bankAt = Date.now();
  try { const r = await fetch('/api/studio/wolves', { cache: 'no-store' }); const j = await r.json(); bankList = j.ok ? j.files || [] : []; } catch(e){ bankList = []; }
  return bankList;
}

/* ---------- images : CORS pour les logos (sinon export impossible) ---------- */
const IMGC = {};
function loadImg(url){
  if (!url) return Promise.resolve(null);
  if (!IMGC[url]) IMGC[url] = new Promise(res => {
    const im = new Image();
    if (/^https?:/.test(url) && !url.startsWith(location.origin)) im.crossOrigin = 'anonymous';
    im.onload = () => { im._ok = true; res(im); }; im.onerror = () => res(null); im.src = url;
  });
  return IMGC[url];
}
const imgNow = url => { const p = IMGC[url]; return p && p._v ? p._v : null; };
async function img(url){ const im = await loadImg(url); if (IMGC[url]) IMGC[url]._v = im; return im; }
const tvLogo = id => id ? 'https://s3-symbol-logo.tradingview.com/' + id + '--big.svg' : '';
const SPECIAL = { chatgpt: ['ChatGPT', 'data/ai-logos/chatgpt.svg'], claude: ['Claude', 'data/ai-logos/claude.svg'], gemini: ['Gemini', 'data/ai-logos/gemini.svg'], grok: ['Grok', 'data/ai-logos/grok.svg'], WOLF: ['Wolf Portfolio', 'data/wolf-tete.png'], EUR: ['Euro', ''], CAC: ['CAC 40', ''], SPX: ['S&P 500', ''] };
const logoUrl = it => !it ? '' : it.k ? (SPECIAL[it.k] ? SPECIAL[it.k][1] : '') : tvLogo(it.logoid);
const nameOf = it => !it ? '' : it.k ? (SPECIAL[it.k] ? SPECIAL[it.k][0] : it.k) : (it.name || (it.sym || '').split(':')[1] || '');
async function ensureLogo(it){
  if (!it || it.k) return;
  if (!it.logoid && it.sym){ const s = await snap(it.sym); if (s && s.logoid) it.logoid = s.logoid; }
}

/* ---------- données TradingView ---------- */
const SNAP = {};
function snap(sym){
  if (!sym || typeof tvFetchSnapshot !== 'function') return Promise.resolve(null);
  if (!SNAP[sym]) SNAP[sym] = tvFetchSnapshot(sym, true).catch(() => null);
  return SNAP[sym];
}
const HIST = {};
function history(sym){
  if (!HIST[sym]) HIST[sym] = (async () => {
    const r = await fetch('/api/tv/history?symbols=' + encodeURIComponent(sym) + '&from=2000-01-01&adj=1', { cache: 'no-store' });
    const j = await r.json(); const h = j.ok && j.data && j.data[sym];
    if (!h || !h.bars || !h.bars.length) throw new Error('cours indisponibles pour ' + sym);
    const w = [], wd = []; let last = null;   // une clôture par semaine (la dernière) + sa date (secondes)
    h.bars.forEach(([t, c]) => { const d = new Date(t * 1000), k = d.getUTCFullYear() + '-' + Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 6048e5); if (k !== last){ w.push(c); wd.push(t); last = k; } else { w[w.length - 1] = c; wd[wd.length - 1] = t; } });
    HIST[sym]._d = wd; HIST[sym]._v = w; return w;
  })().catch(e => { delete HIST[sym]; throw e; });
  return HIST[sym];
}
const histNow = sym => (sym && HIST[sym] && HIST[sym]._v) || [];
const histD = sym => (sym && HIST[sym] && HIST[sym]._d) || [];
const availY = it => Math.max(0, (histNow(it && it.sym).length - 1) / 52);
// Duel : même période pour les deux actions (bornée par l'historique le plus court, sinon comparaison injuste).
function duelY(s){ const a = availY(s.a && s.a[0]), b = availY(s.b && s.b[0]), m = Math.min(a || 99, b || 99); return Math.min(+s.yrs || 10, m); }
const yTxt = y => { const r = Math.round(y); return r <= 1 ? '1 an' : r + ' ans'; };
function hs(it, yrs){ const c = histNow(it && it.sym); return c.slice(-Math.round(yrs * 52) - 1); }
function drop(it, yrs){ const s = hs(it, yrs); if (s.length < 2) return { v: null, lab: '' }; const mx = Math.max(...s), l = s[s.length - 1];
  return l < mx * 0.97 ? { v: (l / mx - 1) * 100, lab: 'depuis son plus haut' } : { v: (l / s[0] - 1) * 100, lab: 'en ' + yrs + ' an' + (yrs > 1 ? 's' : '') }; }
function mult(it, yrs){ const s = hs(it, yrs); return s.length > 1 ? s[s.length - 1] / s[0] : null; }
const perf = (it, yrs) => { const m = mult(it, yrs); return m == null ? null : (m - 1) * 100; };
const yld = it => { const s = it && it.sym && SNAP[it.sym] && SNAP[it.sym]._v; return s && isNum(s.dividends_yield_current) ? s.dividends_yield_current : null; };
const OV = (s, k, auto) => (s[k] != null && String(s[k]).trim() !== '') ? String(s[k]) : auto;

/* ---------- Wolf Portfolio (lecture seule, via « Mes portefeuilles ») ---------- */
async function wolf(){
  if (!window.MP_UI || !window.MP_ENGINE) throw new Error('Mes portefeuilles n\'est pas chargé.');
  let st = MP_UI._state();
  if (!st.D || !st.S || !Object.keys(st.S).length){ await MP_UI.reload(); st = MP_UI._state(); }
  if (!st.D) throw new Error('Données du Wolf Portfolio indisponibles (serveur local ?).');
  const D2 = st.D, ops = (D2.accounts.wolf && D2.accounts.wolf.ops) || [];
  const sym = s => { const m = D2.symbols[s] || {}; return { sym: s, name: m.nom || s.split(':')[1] || s, logoid: m.logoid || null }; };
  return { D: D2, S: st.S || {}, ops, E: MP_ENGINE, sym, cac: D2.config.cac || 'EURONEXT:PX1', spx: D2.config.spx || 'SP:SPX' };
}
const WOLFC = { v: null, at: 0 };
async function wolfFacts(){
  if (WOLFC.v && Date.now() - WOLFC.at < 120000) return WOLFC.v;
  const w = await wolf(), t = today(), E = w.E, ops = E.sortOps(w.ops);
  const first = ops.length ? ops[0].date : t, st = E.replay(w.ops, t);
  const items = Object.keys(st.pos).map(s => { const pe = E.priceEur(w.S, s, t); return pe == null ? null : Object.assign(w.sym(s), { v: st.pos[s].qty * pe }); }).filter(Boolean);
  const value = items.reduce((a, b) => a + b.v, 0) + Math.max(0, st.cash);
  const flows = w.ops.filter(o => ['DEPOT', 'RETRAIT', 'INIT'].includes(o.type)).reduce((a, o) => a + (o.eur || 0), 0);
  const per = from => { try { const rows = E.periodRows(w.ops, w.S, { from, to: t, step: 'day' }); if (!rows.length) return null;
    return { wolf: E.chain(rows) * 100, cac: E.chain(E.benchRows(rows, w.S, w.cac)) * 100, spx: E.chain(E.benchRows(rows, w.S, w.spx, 'FX_IDC:EURUSD')) * 100 }; } catch(e){ return null; } };
  const m0 = addD(t.slice(0, 8) + '01', -1), y0 = addD(t.slice(0, 5) + '01-01', -1);
  const wdN = (dt(t).getDay() + 6) % 7, mon = addD(t, -wdN), wk = (() => { const d = dt(t), j = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); j.setUTCDate(j.getUTCDate() + 4 - (j.getUTCDay() || 7)); const y1 = new Date(Date.UTC(j.getUTCFullYear(), 0, 1)); return Math.ceil(((j - y1) / 864e5 + 1) / 7); })();
  const wOps = [...new Set(ops.filter(o => o.date >= mon && (o.type === 'BUY' || o.type === 'SELL')).map(o => o.symbol))].map(s0 => w.sym(s0));
  const v = { value, gain: value - flows, items: items.map(x => Object.assign(x, { w: x.v / value * 100 })).sort((a, b) => b.w - a.w), cashW: Math.max(0, st.cash) / value * 100,
    since: per(addD(first, -1)), month: per(m0), year: per(y0 < first ? addD(first, -1) : y0), first, week: per(addD(mon, -1)), wk, weekOps: wOps };
  WOLFC.v = v; WOLFC.at = Date.now(); return v;
}

/* ---------- Tier list (onglet Screener > Tier List) ---------- */
function tierData(){
  const store = (typeof tierListStore !== 'undefined' && tierListStore) || {};
  const rows = ['S', 'A', 'B', 'C', 'D', 'F'].map(k => [k, Object.keys(store).filter(n => store[n] === k)]);
  return rows.map(([k, noms]) => [k, noms.map(nom => { const h = (typeof companies !== 'undefined' && companies[nom]) || [], last = h[h.length - 1] || {};
    const sym = last.tvSymbol || (String(last.ticker || '').includes(':') ? last.ticker : null); return { sym, name: nom }; })]);
}

/* ======================= DESSIN ======================= */
let x;
function rr(X, Yy, w, h, r){ x.beginPath(); x.moveTo(X + r, Yy); x.arcTo(X + w, Yy, X + w, Yy + h, r); x.arcTo(X + w, Yy + h, X, Yy + h, r); x.arcTo(X, Yy + h, X, Yy, r); x.arcTo(X, Yy, X + w, Yy, r); x.closePath(); }
function fitSize(s, size, max){ x.font = `400 ${size}px ${AF}`; let z = size; while (x.measureText(s).width > max && z > 18){ z -= 2; x.font = `400 ${z}px ${AF}`; } return z; }
function txt(s, X, Yy, size, o = {}){ s = up(s); const z = fitSize(s, size, o.max || 600); x.textAlign = o.align || 'left'; x.textBaseline = 'alphabetic';
  x.lineJoin = 'round'; x.strokeStyle = '#000'; x.lineWidth = z * 0.13; x.strokeText(s, X, Yy); x.fillStyle = o.color || '#fff'; x.fillText(s, X, Yy); const w = x.measureText(s).width; x.textAlign = 'left'; return w; }
function ybox(s, X, Yy, size, o = {}){ s = up(s); const z = fitSize(s, size, (o.max || 600) - size * 0.34); const w = x.measureText(s).width, pad = z * 0.16, h = z * 1.08;
  const L = o.align === 'center' ? X - w / 2 - pad : X; rr(L, Yy - z * 0.93, w + pad * 2, h, z * 0.1); x.fillStyle = o.bg || Y; x.fill(); x.lineWidth = 3; x.strokeStyle = '#000'; x.stroke();
  x.textAlign = 'left'; x.fillStyle = o.ink || '#000'; x.fillText(s, L + pad, Yy); return w + pad * 2; }
function mixed(parts, X, Yy, size, max = 600){ let cx = X; parts.forEach(([s, yel]) => { const room = max - (cx - X); cx += (yel ? ybox(s, cx, Yy, size, { max: room }) : txt(s, cx, Yy, size, { max: room })) + size * 0.18; }); }
function tile(it, X, Yy, s, o = {}){
  x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 18; x.shadowOffsetY = 6; rr(X, Yy, s, s, s * 0.2); x.fillStyle = '#fff'; x.fill(); x.restore();
  x.save(); rr(X + s * 0.07, Yy + s * 0.07, s * 0.86, s * 0.86, s * 0.16); x.clip();
  const k = it && it.k;
  if (k === 'EUR' || k === 'CAC' || k === 'SPX'){ x.fillStyle = '#14161a'; x.fillRect(X, Yy, s, s); const t = k === 'EUR' ? '€' : k === 'CAC' ? 'CAC' : 'S&P';
    x.fillStyle = Y; x.font = `400 ${s * (k === 'EUR' ? 0.62 : 0.36)}px ${AF}`; x.textAlign = 'center'; x.fillText(t, X + s / 2, Yy + s * (k === 'EUR' ? 0.72 : 0.62)); x.textAlign = 'left'; }
  else { const im = imgNow(logoUrl(it));
    if (k === 'WOLF'){ x.fillStyle = '#14161a'; x.fillRect(X, Yy, s, s); if (im) x.drawImage(im, X + s * 0.12, Yy + s * 0.12, s * 0.76, s * 0.76); }
    else if (im) x.drawImage(im, X + s * 0.07, Yy + s * 0.07, s * 0.86, s * 0.86);
    else { x.fillStyle = '#20252C'; x.fillRect(X, Yy, s, s); x.fillStyle = Y; x.font = `400 ${s * 0.5}px ${AF}`; x.textAlign = 'center'; x.fillText(up(nameOf(it)).slice(0, 1) || '?', X + s / 2, Yy + s * 0.68); x.textAlign = 'left'; } }
  x.restore();
  if (o.cross){ x.save(); x.strokeStyle = '#E5262E'; x.lineWidth = s * 0.09; x.lineCap = 'round'; x.beginPath(); x.arc(X + s / 2, Yy + s / 2, s * 0.42, 0, 7); x.stroke(); x.beginPath(); x.moveTo(X + s * 0.2, Yy + s * 0.2); x.lineTo(X + s * 0.8, Yy + s * 0.8); x.stroke(); x.restore(); }
  if (o.q){ const r = s * 0.2; x.beginPath(); x.arc(X + s - r * 0.4, Yy + r * 0.4, r, 0, 7); x.fillStyle = Y; x.fill(); x.lineWidth = 3; x.strokeStyle = '#000'; x.stroke(); x.fillStyle = '#000'; x.font = `400 ${r * 1.4}px ${AF}`; x.textAlign = 'center'; x.fillText('?', X + s - r * 0.4, Yy + r * 0.4 + r * 0.5); x.textAlign = 'left'; }
}
function qtile(X, Yy, t){ x.fillStyle = Y; rr(X, Yy, t, t, t * 0.16); x.fill(); x.lineWidth = 3; x.strokeStyle = '#000'; x.stroke(); x.fillStyle = '#000'; x.font = `400 ${t * 0.75}px ${AF}`; x.textAlign = 'center'; x.fillText('?', X + t / 2, Yy + t * 0.78); x.textAlign = 'left'; }
function arrow(x1, y1, x2, y2, bend = 0.3){ const mx = (x1 + x2) / 2 + (y2 - y1) * bend, my = (y1 + y2) / 2 - (x2 - x1) * bend; x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
  for (const [c, w] of [['#000', 20], ['#fff', 11]]){ x.strokeStyle = c; x.lineWidth = w; x.beginPath(); x.moveTo(x1, y1); x.quadraticCurveTo(mx, my, x2, y2); x.stroke();
    const a = Math.atan2(y2 - my, x2 - mx), L = 34; x.beginPath(); x.moveTo(x2 - L * Math.cos(a - 0.5), y2 - L * Math.sin(a - 0.5)); x.lineTo(x2, y2); x.lineTo(x2 - L * Math.cos(a + 0.5), y2 - L * Math.sin(a + 0.5)); x.stroke(); } x.restore(); }
function pct(s, X, Yy, size, o = {}){ const neg = /^\s*[−-]/.test(s); return txt(s, X, Yy, size, Object.assign({ color: neg ? '#FF3B3B' : '#3DFF7A' }, o)); }
function check(X, Yy, s){ x.fillStyle = Y; rr(X, Yy, s, s, s * 0.18); x.fill(); x.lineWidth = 3; x.strokeStyle = '#000'; x.stroke(); x.lineWidth = s * 0.14; x.lineCap = 'round'; x.beginPath(); x.moveTo(X + s * 0.24, Yy + s * 0.52); x.lineTo(X + s * 0.43, Yy + s * 0.72); x.lineTo(X + s * 0.78, Yy + s * 0.3); x.stroke(); }
function chart(it, yrs, X0, Y0, W, H, o = {}){
  const s = hs(it, yrs); if (s.length < 2) return null; const card = !o.bare;
  if (card){ x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 20; rr(X0, Y0, W, H, 16); x.fillStyle = '#fff'; x.fill(); x.restore(); }
  const mn = Math.min(...s) * 0.97, mx = Math.max(...s) * 1.02, px = i => X0 + 18 + (W - 36) * i / (s.length - 1), py = v => Y0 + H - 16 - (H - 32) * (v - mn) / (mx - mn), im = s.indexOf(Math.max(...s)), l = s.length - 1, down = s[l] < s[im] * 0.97;
  if (!card){ x.beginPath(); s.forEach((v, i) => i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v))); x.lineTo(px(l), Y0 + H); x.lineTo(px(0), Y0 + H); x.closePath();
    const g = x.createLinearGradient(0, Y0, 0, Y0 + H); g.addColorStop(0, down ? 'rgba(229,38,46,.45)' : 'rgba(61,255,122,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fill(); }
  else if (down){ x.beginPath(); x.moveTo(px(im), py(s[im])); for (let i = im; i <= l; i++) x.lineTo(px(i), py(s[i])); x.lineTo(px(l), py(s[im])); x.closePath(); x.fillStyle = 'rgba(229,38,46,.16)'; x.fill(); }
  x.strokeStyle = card ? '#111' : '#fff'; x.lineWidth = card ? 4 : 6; x.lineJoin = 'round'; x.beginPath(); s.forEach((v, i) => i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v))); x.stroke();
  if (down){ x.strokeStyle = '#E5262E'; x.lineWidth = card ? 5 : 8; x.beginPath(); for (let i = im; i <= l; i++) i === im ? x.moveTo(px(i), py(s[i])) : x.lineTo(px(i), py(s[i])); x.stroke();
    x.setLineDash([10, 8]); x.lineWidth = 3; x.strokeStyle = card ? '#E5262E' : '#fff'; x.beginPath(); x.moveTo(px(im), py(s[im])); x.lineTo(px(l), py(s[im])); x.stroke(); x.setLineDash([]); }
  for (const [i, c] of [[l, down ? '#E5262E' : '#1B9E55']].concat(card ? [] : [[im, '#fff']])){ x.fillStyle = c; x.beginPath(); x.arc(px(i), py(s[i]), card ? 8 : 12, 0, 7); x.fill(); x.lineWidth = 3; x.strokeStyle = '#000'; x.stroke(); }
  return { px, py, im, l, s };
}
function treemap(items, X, Yy, W, H){ const out = []; let rest = items.slice(), x0 = X, y0 = Yy, w = W, h = H;
  while (rest.length){ const tot = rest.reduce((a, b) => a + b[1], 0), horiz = w >= h; let row = [], best = 1e9;
    for (let i = 1; i <= rest.length; i++){ const r = rest.slice(0, i), sum = r.reduce((a, b) => a + b[1], 0), side = horiz ? h : w, len = (horiz ? w : h) * sum / tot;
      const worst = Math.max(...r.map(e => { const l2 = side * e[1] / sum; return Math.max(len / l2, l2 / len); })); if (worst <= best){ best = worst; row = r; } else break; }
    const sum = row.reduce((a, b) => a + b[1], 0), len = (horiz ? w : h) * sum / tot; let off = 0;
    row.forEach(e => { const l2 = (horiz ? h : w) * e[1] / sum; out.push(horiz ? [e, x0, y0 + off, len, l2] : [e, x0 + off, y0, l2, len]); off += l2; });
    if (horiz){ x0 += len; w -= len; } else { y0 += len; h -= len; } rest = rest.slice(row.length); } return out; }
function bars(rows, X, Yy, rh, maxW){ const mx = Math.max(...rows.map(r => Math.abs(r[1] || 0)), 1); rows.forEach(([it, v, lab], i) => { const yy = Yy + i * rh; tile(it, X, yy, rh - 16); const bw = Math.max(14, maxW * Math.abs(v || 0) / mx);
  x.fillStyle = (v || 0) >= 0 ? '#3DFF7A' : '#FF3B3B'; rr(X + rh + 4, yy + (rh - 16) * 0.22, bw, (rh - 16) * 0.56, 8); x.fill(); x.lineWidth = 3; x.strokeStyle = '#000'; x.stroke(); pct(lab || sgn(v, 1), X + rh + 18 + bw, yy + (rh - 16) * 0.72, (rh - 16) * 0.62, { max: 220 }); }); }
function tierRows(rows, X, Yy, W, rh){ const C = { S: '#FF7F7F', A: '#FFBF7F', B: '#FFDF7F', C: '#BFFF7F', D: '#7FBFFF', F: '#BF7FBF' };
  rows.forEach(([L, ks], i) => { const yy = Yy + i * rh, h = rh - 8; x.fillStyle = 'rgba(20,20,22,.9)'; rr(X, yy, W, h, 8); x.fill(); x.fillStyle = C[L]; rr(X, yy, h, h, 8); x.fill();
    x.fillStyle = '#111'; x.font = `400 ${h * 0.62}px ${AF}`; x.textAlign = 'center'; x.fillText(L, X + h / 2, yy + h * 0.74); x.textAlign = 'left';
    const t = h - 12, maxN = Math.floor((W - h - 12) / (t + 10)); (ks.length ? ks : [null]).slice(0, maxN).forEach((it, j) => { const tx = X + h + 12 + j * (t + 10); if (!it) { if (L === 'F') qtile(tx, yy + 6, t); } else tile(it, tx, yy + 6, t); }); }); }
function bg(st){
  x.fillStyle = '#050608'; x.fillRect(0, 0, 1280, 720);
  const im = imgNow(wolfUrl(st.pose));
  if (im){ const z = +st.wz || 1, k = Math.max(1280 / im.width, 720 / im.height) * z, w = im.width * k, h = im.height * k;
    if (z < 1){ x.save(); x.filter = 'blur(10px) brightness(.75)'; x.drawImage(im, 0, 0, im.width * 0.3, im.height, -20, -20, 1320, 760); x.restore(); }
    // Images de la banque en 3:2 : plus hautes que le cadre 16:9. On garde le HAUT (oreilles, tête) par défaut ; « Position du loup » descend le cadrage.
    const wy = st.wy === '' || st.wy == null ? 0 : +st.wy, top = h > 720 ? -(h - 720) * wy : 720 - h;
    x.drawImage(im, 1280 - w, top, w, h); }
  const g = x.createLinearGradient(0, 0, 700, 0); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 700, 720);
}

/* ======================= MODÈLES DE MINIATURES ======================= */
const S_ = (sym, name, logoid) => ({ sym, name, logoid: logoid || null });
const K_ = k => ({ k });
const NEED = { hist: 1, yield: 2, wolf: 3, tier: 4 };
const T = [
 { id: 'question4', name: 'Lequel je vends ?', vid: 'Analyse hebdo · Portefeuille', pose: 'pointe',
  f: [['l1', 'Ligne blanche', 't'], ['l2', 'Encadré jaune', 'y'], ['logos', 'Logos', 'L', 4]], d: { l1: 'Lequel', l2: 'Je vends ?', logos: [S_('EURONEXT:ASML', 'ASML', 'asml'), S_('EURONEXT:TTE', 'TotalEnergies', 'total'), S_('EURONEXT:AI', 'Air Liquide', 'liquide'), S_('EURONEXT:BNP', 'BNP Paribas', 'paribas')] },
  v: [['A', 'Grille 2×2', s => { s.logos.slice(0, 4).forEach((k, i) => tile(k, 40 + (i % 2) * 190, 36 + Math.floor(i / 2) * 190, 170)); txt(s.l1, 40, 540, 130); ybox(s.l2, 40, 680, 120); }],
     ['B', 'Texte en haut, logos en ligne', s => { txt(s.l1, 40, 140, 130); ybox(s.l2, 40, 290, 125); s.logos.slice(0, 4).forEach((k, i) => tile(k, 40 + i * 150, 370, 136)); }],
     ['C', '3 logos marqués « ? »', s => { txt(s.l1, 40, 135, 130); ybox(s.l2, 40, 285, 125); s.logos.slice(0, 3).forEach((k, i) => tile(k, 40 + i * 200, 360, 176, { q: 1 })); }],
     ['D', 'Grand « ? » au centre', s => { s.logos.slice(0, 4).forEach((k, i) => tile(k, 40 + (i % 2) * 215, 30 + Math.floor(i / 2) * 215, 185)); x.beginPath(); x.arc(252, 242, 74, 0, 7); x.fillStyle = Y; x.fill(); x.lineWidth = 5; x.strokeStyle = '#000'; x.stroke();
      x.fillStyle = '#000'; x.font = `400 112px ${AF}`; x.textAlign = 'center'; x.fillText('?', 252, 282); x.textAlign = 'left'; txt(s.l1, 40, 560, 100); ybox(s.l2, 40, 680, 100); }]] },
 { id: 'rangee', name: "J'investis 10 000 € avec 4 IA", vid: 'Portefeuille IA', pose: 'portefeuille',
  f: [['l1', 'Ligne 1', 't'], ['l2', 'Encadré jaune', 'y'], ['l3', 'Ligne 3', 't'], ['logos', 'Logos en ligne', 'L', 5]], d: { l1: "J'investis", l2: '10 000 €', l3: 'Avec 4 IA', logos: [K_('chatgpt'), K_('claude'), K_('gemini'), K_('grok')] },
  v: [['A', 'Version validée', s => { txt(s.l1, 40, 150, 130); ybox(s.l2, 40, 300, 135); txt(s.l3, 40, 440, 110); s.logos.slice(0, 5).forEach((k, i) => tile(k, 40 + i * 138, 520, 124)); arrow(580, 430, 720, 540, -0.3); }],
     ['B', 'Logos en haut', s => { s.logos.slice(0, 5).forEach((k, i) => tile(k, 40 + i * 138, 36, 124)); txt(s.l1, 40, 330, 120); ybox(s.l2, 40, 480, 135); txt(s.l3, 40, 620, 110); }]] },
 { id: 'chute', name: 'Jusqu’où ?', vid: 'Analyse express', pose: 'crash', need: [NEED.hist], auto: { p: s => sgn(drop(s.logo[0], s.yrs).v) },
  f: [['l1', 'Encadré jaune', 'y'], ['logo', 'Action (le graphique suit)', 'L', 1], ['yrs', 'Période', 'sel', [1, 2, 3, 5, 10]], ['p', 'Chiffre', 'ov']], d: { l1: 'Jusqu’où ?', logo: [S_('EURONEXT:SU', 'Schneider Electric', 'schneider')], yrs: 2, p: '' },
  v: [['A', 'Graphique + logo + chiffre', s => { const p = OV(s, 'p', sgn(drop(s.logo[0], s.yrs).v)); ybox(s.l1, 40, 130, 120); chart(s.logo[0], s.yrs, 40, 170, 560, 300); tile(s.logo[0], 40, 500, 180); pct(p, 250, 650, 170, { max: 390 }); }],
     ['B', 'Chiffre géant en haut', s => { const p = OV(s, 'p', sgn(drop(s.logo[0], s.yrs).v)); pct(p, 40, 200, 200, { max: 560 }); chart(s.logo[0], s.yrs, 40, 250, 560, 280); tile(s.logo[0], 52, 262, 92); ybox(s.l1, 40, 680, 110); }],
     ['C', 'Sans graphique', s => { const r = drop(s.logo[0], s.yrs), p = OV(s, 'p', sgn(r.v)); tile(s.logo[0], 40, 40, 250); txt(r.lab, 320, 180, 56, { max: 300 }); pct(p, 40, 540, 230, { max: 600 }); ybox(s.l1, 40, 680, 100); }],
     ['D', 'Courbe en fond, sans cadre', s => { const p = OV(s, 'p', sgn(drop(s.logo[0], s.yrs).v)); const c = chart(s.logo[0], s.yrs, 20, 150, 640, 430, { bare: 1 }); tile(s.logo[0], 40, 30, 130); ybox(s.l1, 195, 140, 110, { max: 440 });
      if (c && c.s[c.l] < c.s[c.im] * 0.97){ arrow(c.px(c.im) + 30, c.py(c.s[c.im]) - 10, c.px(c.l) - 6, c.py(c.s[c.l]) - 26, -0.35); } pct(p, 40, 680, 130, { max: 420 }); }]] },
 { id: 'tier', name: 'Tier list', vid: 'Tier list', pose: 'question', need: [NEED.tier], note: 'Rempli avec ta Tier list (Screener > Tier List).',
  f: [['l0', 'Thème (jaune)', 'y'], ['l1', 'Question', 't'], ['l2', 'Question (jaune)', 'y']], d: { l0: 'Luxe', l1: 'Qui est', l2: 'en F ?' },
  v: [['A', 'Grand classement', (s, c) => { mixed([['Tier list', 0], [s.l0, 1]], 40, 100, 96); tierRows(c.tier, 40, 128, 560, 90); }],
     ['B', 'Question en grand', (s, c) => { txt(s.l1, 40, 120, 110); ybox(s.l2, 40, 250, 115); tierRows(c.tier, 40, 285, 520, 70); }],
     ['C', 'En colonnes', (s, c) => { mixed([['Tier list', 0], [s.l0, 1]], 40, 100, 96); const CC = { S: '#FF7F7F', A: '#FFBF7F', B: '#FFDF7F', C: '#BFFF7F', D: '#7FBFFF', F: '#BF7FBF' }, mx = Math.min(4, Math.max(1, ...c.tier.map(r => r[1].length)));
      c.tier.forEach(([L, ks], i) => { const X = 40 + i * 100; x.fillStyle = CC[L]; rr(X, 140, 92, 80, 8); x.fill(); x.lineWidth = 3; x.strokeStyle = '#000'; x.stroke();
        x.fillStyle = '#111'; x.font = `400 58px ${AF}`; x.textAlign = 'center'; x.fillText(L, X + 46, 202); x.textAlign = 'left'; x.fillStyle = 'rgba(20,20,22,.85)'; rr(X, 228, 92, 24 + mx * 88, 8); x.fill();
        (ks.length ? ks : (L === 'F' ? [null] : [])).slice(0, mx).forEach((k, j) => { k ? tile(k, X + 8, 240 + j * 88, 76) : qtile(X + 8, 240 + j * 88, 76); }); });
      mixed([[s.l1, 0], [s.l2, 1]], 40, 640, 110); }]] },
 { id: 'portefeuille', name: 'Mon portefeuille', vid: 'Portefeuille (mensuel)', pose: 'pensif', need: [NEED.wolf], note: 'Composition réelle du Wolf Portfolio.',
  auto: { v: (s, c) => c.wolf ? fr(c.wolf.value) + ' €' : '—', g: (s, c) => c.wolf ? (c.wolf.gain >= 0 ? '+' : '−') + fr(Math.abs(c.wolf.gain)) + ' €' : '—', cashP: (s, c) => c.wolf ? fr(c.wolf.cashW, c.wolf.cashW < 10 ? 1 : 0) + ' %' : '—' },
  f: [['l1', 'Encadré jaune', 'y'], ['l2', 'Ligne blanche', 't'], ['v', 'Valeur', 'ov'], ['g', 'Gain', 'ov'], ['cash', 'Liquidités (camembert)', 'sel', [['logo', 'Logo € seul'], ['pct', 'Logo € + pourcentage'], ['none', 'Rien (part grise seule)']]], ['cashP', 'Liquidités (%)', 'ov']], d: { l1: 'Mon portefeuille', l2: 'Je vends laquelle ?', v: '', g: '', cash: 'logo', cashP: '' },
  v: [['A', 'Mosaïque (taille = poids)', (s, c) => { ybox(s.l1, 40, 100, 92); txt(s.l2, 40, 200, 78); const W = c.wolf; if (!W) return;
      treemap(W.items.slice(0, 9).map(i => [i, i.w]).concat(W.cashW > 1 ? [[K_('EUR'), W.cashW]] : []).sort((a, b) => b[1] - a[1]), 40, 232, 580, 456).forEach(([e, X, Yy, w, h]) => {
        x.fillStyle = e[0].k === 'EUR' ? '#16181c' : 'rgba(255,255,255,.08)'; rr(X + 3, Yy + 3, w - 6, h - 6, 12); x.fill(); x.strokeStyle = 'rgba(238,255,65,.55)'; x.lineWidth = 2; x.stroke();
        const t = Math.min(130, w * 0.62, h * 0.5), fz = Math.min(46, h * 0.2, w * 0.24); tile(e[0], X + w / 2 - t / 2, Yy + h / 2 - t * 0.66, t); txt(e[0].k === 'EUR' ? OV(s, 'cashP', fr(e[1], e[1] < 10 ? 1 : 0) + ' %') : fr(e[1], e[1] < 10 ? 1 : 0) + ' %', X + w / 2, Yy + h / 2 + t * 0.34 + fz + 4, fz, { align: 'center', max: w - 12 }); }); }],
     ['B', 'Top 5 en barres', (s, c) => { ybox(s.l1, 40, 100, 92); txt(OV(s, 'v', T[4].auto.v(s, c)), 40, 215, 100); pct(OV(s, 'g', T[4].auto.g(s, c)), 40, 280, 54); const W = c.wolf; if (!W) return; const mx = Math.max(...W.items.slice(0, 5).map(i => i.w), 1);
      W.items.slice(0, 5).forEach((it, i) => { const yy = 320 + i * 76; tile(it, 40, yy, 64); const bw = 380 * it.w / mx; x.fillStyle = Y; rr(120, yy + 14, bw, 36, 8); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 3; x.stroke(); txt(fr(it.w, 1) + ' %', 134 + bw, yy + 48, 40, { max: 150 }); }); }],
     ['C', 'Grand camembert, logos dedans', (s, c) => { ybox(s.l1, 40, 96, 88); txt(s.l2, 40, 180, 70); const W = c.wolf; if (!W) return; const cx = 305, cy = 455, R = 240, r = 128; let a = -Math.PI / 2;
      const cols = ['#F2B33D', '#4A86C5', '#2EBD6B', '#B06BD0', '#E07A3A', '#3AA7B8', '#E5262E', '#8F7A5A', '#6E7F96', '#C46FA0'];
      const parts = W.items.map(i => [i, i.w]).concat(W.cashW > 0.5 ? [[K_('EUR'), W.cashW]] : []);
      parts.forEach(([it, v], i) => { const sw = 2 * Math.PI * v / 100; x.beginPath(); x.arc(cx, cy, R, a, a + sw); x.arc(cx, cy, r, a + sw, a, true); x.closePath(); x.fillStyle = it.k === 'EUR' ? '#2A2E35' : cols[i % cols.length]; x.fill(); x.strokeStyle = '#050608'; x.lineWidth = 4; x.stroke();
        const m = a + sw / 2, rm = (R + r) / 2; if (it.k === 'EUR'){ const mode = s.cash || 'logo';   // petit logo € fait maison, rien qui déborde de l'anneau
          const rt = mode === 'pct' ? rm + 22 : rm, ts = mode === 'pct' ? 44 : 50;
          if (mode !== 'none' && v >= 3) tile(it, cx + Math.cos(m) * rt - ts / 2, cy + Math.sin(m) * rt - ts / 2, ts);
          if (mode === 'pct' && v >= 3) txt(OV(s, 'cashP', fr(v, v < 10 ? 1 : 0) + ' %'), cx + Math.cos(m) * (rm - 34), cy + Math.sin(m) * (rm - 34) + 10, 28, { align: 'center', max: 70 }); }
        else if (v >= 5) tile(it, cx + Math.cos(m) * rm - 25, cy + Math.sin(m) * rm - 25, 50); a += sw; });
      txt(OV(s, 'v', T[4].auto.v(s, c)), cx, cy + 10, 50, { align: 'center', max: 220 }); pct(OV(s, 'g', T[4].auto.g(s, c)), cx, cy + 56, 36, { align: 'center', max: 200 }); }]] },
 { id: 'duel', name: 'Duel', vid: 'Analyse express · Duel', pose: 'boxe', need: [NEED.hist], auto: { na: s => nameOf(s.a[0]), nb: s => nameOf(s.b[0]), pa: s => sgn(perf(s.a[0], duelY(s))), pb: s => sgn(perf(s.b[0], duelY(s))) },
  f: [['a', 'Action A', 'L', 1], ['b', 'Action B', 'L', 1], ['na', 'Nom affiché A (raccourci)', 'ov'], ['nb', 'Nom affiché B (raccourci)', 'ov'], ['yrs', 'Période', 'sel', [1, 2, 3, 5, 7, 10, 15, 20, 25, [99, 'Max (historique commun)']]], ['pa', 'Chiffre A', 'ov'], ['pb', 'Chiffre B', 'ov']], d: { a: [S_('EURONEXT:MC', 'LVMH', 'lvmh')], b: [S_('EURONEXT:RMS', 'Hermès', 'hermes')], yrs: 10, na: '', nb: '', pa: '', pb: '' },
  v: [['A', 'Le ring : barres qui montent', s => { const Y2 = duelY(s), va = perf(s.a[0], Y2) || 0, vb = perf(s.b[0], Y2) || 0, pa = OV(s, 'pa', sgn(va)), pb = OV(s, 'pb', sgn(vb)), mx = Math.max(Math.abs(va), Math.abs(vb), 1);
      txt(OV(s, 'na', nameOf(s.a[0])) + ' ou ' + OV(s, 'nb', nameOf(s.b[0])) + ' ?', 40, 100, 86, { max: 580 }); [[s.a[0], va, pa, 40], [s.b[0], vb, pb, 350]].forEach(([k, v, p, X]) => { tile(k, X + 25, 130, 170); const h = Math.max(30, 250 * Math.abs(v) / mx), base = 700;
        x.fillStyle = v >= 0 ? '#3DFF7A' : '#FF3B3B'; rr(X + 45, base - h, 130, h, 10); x.fill(); x.lineWidth = 4; x.strokeStyle = '#000'; x.stroke(); txt(p, X + 110, base - h - 14, 62, { align: 'center', max: 220 }); });
      ybox('VS', 305, 240, 66, { align: 'center' }); txt('en ' + yTxt(Y2), 305, 345, 36, { align: 'center' }); }],
     ['B', 'Les deux courbes', s => { const Y2 = duelY(s), A = hs(s.a[0], Y2), B2 = hs(s.b[0], Y2); ybox('Qui gagne ?', 40, 130, 110); if (A.length < 2 || B2.length < 2) return;
      const n = Math.min(A.length, B2.length), a = A.slice(-n).map(v => v / A[A.length - n] * 100), b = B2.slice(-n).map(v => v / B2[B2.length - n] * 100);
      const all = a.concat(b), mn = Math.min(...all), mx = Math.max(...all), X0 = 40, W = 520, Y0 = 180, H = 430, px = i => X0 + W * i / (n - 1), py = v => Y0 + H - H * (v - mn) / (mx - mn);
      [[b, '#fff'], [a, Y]].forEach(([d, c]) => { x.strokeStyle = '#000'; x.lineWidth = 14; x.lineJoin = 'round'; x.beginPath(); d.forEach((v, i) => i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v))); x.stroke(); x.strokeStyle = c; x.lineWidth = 7; x.stroke(); });
      let ya = py(a[n - 1]) - 42, yb = py(b[n - 1]) - 42; if (Math.abs(ya - yb) < 92){ if (ya < yb) yb = ya + 92; else ya = yb + 92; } tile(s.a[0], 572, ya, 84); tile(s.b[0], 572, yb, 84);
      x.strokeStyle = Y; x.lineWidth = 4; x.strokeRect(568, ya - 4, 92, 92); txt('en ' + yTxt(Y2) + ' · base 100', 40, 680, 40); }],
     ['C', 'Multiplicateurs', s => { const Y2 = duelY(s), ma = mult(s.a[0], Y2) || 1, mb = mult(s.b[0], Y2) || 1, win = ma >= mb; txt('En ' + yTxt(Y2), 40, 100, 80);
      [[s.a[0], ma, 160, win], [s.b[0], mb, 400, !win]].forEach(([k, m, Yy, w]) => { tile(k, 40, Yy, 190); const t = 'x' + fr(m, 1); if (w) ybox(t, 260, Yy + 140, 150, { max: 340 }); else txt(t, 260, Yy + 140, 150, { max: 340 }); }); txt('Lequel ?', 40, 690, 70); }]] },
 { id: 'achete', name: 'Le loup achète', vid: 'Portefeuille · Opérations', pose: 'eventail',
  f: [['l1', 'Ligne blanche', 't'], ['l2', 'Encadré jaune', 'y'], ['logo', 'Vendu (barré)', 'L', 1], ['logos', 'Achetés', 'L', 3]], d: { l1: 'Le loup', l2: 'Achète', logo: [S_('EURONEXT:AI', 'Air Liquide', 'liquide')], logos: [S_('NYSE:SPGI', 'S&P Global', 's-and-p-global'), S_('NYSE:RMD', 'ResMed', 'resmed'), S_('MIL:RACE', 'Ferrari', 'ferrari')] },
  v: [['A', 'Vendu au-dessus, achats en dessous', s => { txt(s.l1, 40, 130, 120); ybox(s.l2, 40, 275, 130); tile(s.logo[0], 40, 320, 170, { cross: 1 }); arrow(222, 400, 256, 544, 0.42); s.logos.slice(0, 3).forEach((k, i) => tile(k, 40 + i * 150, 560, 132)); }],
     ['B', 'Échange gauche → droite', s => { txt(s.l1, 40, 130, 120); ybox(s.l2, 40, 275, 130); tile(s.logo[0], 40, 330, 190, { cross: 1 }); arrow(250, 425, 350, 425, 0.25); tile(s.logos[0], 370, 330, 190); }]] },
 { id: 'top5', name: 'Top rendement', vid: 'Dividendes', pose: 'coffre', need: [NEED.yield], note: 'Rendements TradingView du jour.',
  f: [['l1', 'Encadré jaune', 'y'], ['l2', 'Ligne blanche', 't'], ['logos', 'Entreprises', 'L', 5]], d: { l1: 'Top 5', l2: 'Rendement', logos: [S_('EURONEXT:BNP', 'BNP Paribas', 'paribas'), S_('EURONEXT:SAN', 'Sanofi'), S_('EURONEXT:DG', 'Vinci'), S_('EURONEXT:TTE', 'TotalEnergies', 'total'), S_('EURONEXT:MC', 'LVMH', 'lvmh')] },
  v: [['A', 'Liste numérotée', s => { mixed([[s.l1, 1], [s.l2, 0]], 40, 110, 100); s.logos.slice(0, 5).forEach((k, i) => { const yy = 150 + i * 112; txt('#' + (i + 1), 40, yy + 80, 66); tile(k, 130, yy, 96); if (yld(k) != null) pct('+' + fr(yld(k), 1) + ' %', 250, yy + 78, 72, { max: 300 }); }); }],
     ['B', 'Podium top 3', s => { mixed([['Top 3', 1], [s.l2, 0]], 40, 105, 96); const L = s.logos.slice(0, 3);
      [[1, 40, 420], [0, 232, 330], [2, 424, 480]].forEach(([i, X, top]) => { const k = L[i]; if (!k) return; x.fillStyle = ['#E8C35A', '#C9CED6', '#C98A4B'][i]; rr(X, top, 176, 705 - top, 10); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 3; x.stroke();
        tile(k, X + 28, top - 136, 120); x.fillStyle = '#111'; x.font = `400 58px ${AF}`; x.textAlign = 'center'; x.fillText('#' + (i + 1), X + 88, top + 66); x.textAlign = 'left'; if (yld(k) != null) pct('+' + fr(yld(k), 1) + ' %', X + 88, top + 126, 46, { align: 'center', max: 160 }); }); }],
     ['C', 'Le n°1 en grand', s => { const L = s.logos.slice(0, 5); mixed([['N°1', 1], [s.l2, 0]], 40, 110, 100); if (!L[0]) return; tile(L[0], 40, 150, 230); if (yld(L[0]) != null) pct('+' + fr(yld(L[0]), 1) + ' %', 300, 330, 150, { max: 330 });
      L.slice(1).forEach((k, i) => { tile(k, 40 + i * 140, 500, 100); if (yld(k) != null) txt(fr(yld(k), 1) + ' %', 90 + i * 140, 660, 40, { align: 'center', max: 130 }); }); }],
     ['D', 'Barres de rendement', s => { mixed([[s.l1, 1], [s.l2, 0]], 40, 110, 100); bars(s.logos.slice(0, 5).map(k => [k, yld(k) || 0, '+' + fr(yld(k) || 0, 1) + ' %']), 40, 150, 108, 280); }]] },
 { id: 'chiffre', name: 'Le chiffre choc', vid: 'Portefeuille · Analyse express', pose: 'bras_croises',
  f: [['l1', 'Ligne blanche', 't'], ['logo', 'Entreprise', 'L', 1], ['p', 'Encadré jaune (chiffre)', 'y'], ['l3', 'Ligne du bas', 't']], d: { l1: "J'ai vendu", logo: [S_('EURONEXT:AI', 'Air Liquide', 'liquide')], p: '+22,8 %', l3: 'En 8 mois' },
  v: [['A', 'Logo + chiffre à côté', s => { txt(s.l1, 40, 140, 128); tile(s.logo[0], 40, 190, 250); ybox(s.p, 320, 350, 150, { max: 420 }); txt(s.l3, 40, 600, 110); arrow(490, 575, 660, 500, -0.25); }],
     ['B', 'Chiffre géant', s => { txt(s.l1, 40, 130, 120); ybox(s.p, 40, 350, 200); tile(s.logo[0], 40, 430, 170); txt(s.l3, 240, 560, 96, { max: 400 }); }],
     ['C', 'Chiffre vert, durée en jaune', s => { tile(s.logo[0], 40, 40, 200); txt(s.l1, 270, 170, 96, { max: 360 }); pct(s.p, 40, 470, 230, { max: 600 }); ybox(s.l3, 40, 640, 100); }]] },
 { id: 'hebdo', name: "Je vends ou j'achète ?", vid: 'Analyse hebdo', pose: 'explique',
  f: [['l1', 'Encadré jaune', 'y'], ['l2', 'Ligne blanche', 't'], ['logos', 'Entreprises de la semaine', 'L', 6]], d: { l1: 'Je vends', l2: "Ou j'achète ?", logos: [S_('EURONEXT:AI', 'Air Liquide', 'liquide'), S_('NASDAQ:BKNG', 'Booking', 'booking'), S_('NASDAQ:META', 'Meta', 'meta-platforms'), S_('EURONEXT:DG', 'Vinci'), S_('NYSE:MCD', "McDonald's", 'mcdonalds')] },
  v: [['A', 'Grille sous le texte', s => { ybox(s.l1, 40, 125, 120); txt(s.l2, 40, 250, 110); s.logos.slice(0, 6).forEach((k, i) => tile(k, 40 + (i % 3) * 170, 300 + Math.floor(i / 3) * 170, 150)); }],
     ['B', 'Même grille, logos marqués « ? »', s => { ybox(s.l1, 40, 125, 120); txt(s.l2, 40, 250, 110); s.logos.slice(0, 6).forEach((k, i) => tile(k, 40 + (i % 3) * 175, 305 + Math.floor(i / 3) * 178, 148, { q: 1 })); }]] },
 { id: 'guide', name: 'Guide', vid: 'Pédagogie', pose: 'explique',
  f: [['l0', 'Petit titre', 't'], ['l2', 'Mot clé (jaune)', 'y'], ['l3', 'Sous-titre', 't'], ['s1', 'Étape 1', 't'], ['s2', 'Étape 2', 't'], ['s3', 'Étape 3', 't']], d: { l0: 'Guide 2026', l2: 'PEA', l3: 'Explique simplement', s1: 'Ouvrir', s2: 'Choisir', s3: 'Investir' },
  v: [['A', 'Mot géant', s => { txt(s.l0, 40, 110, 70); ybox(s.l2, 40, 400, 270, { max: 600 }); txt(s.l3, 40, 540, 72); }],
     ['B', '3 étapes cochées', s => { ybox(s.l2, 40, 140, 130); txt(s.l0, 40, 240, 64); [s.s1, s.s2, s.s3].forEach((t, i) => { check(40, 290 + i * 130, 96); txt(t, 160, 365 + i * 130, 92, { max: 440 }); }); }]] },
 { id: 'resultat', name: 'Résultat du Wolf Portfolio', vid: 'Wolf Portfolio (mensuel)', pose: 'hausse', need: [NEED.wolf], note: 'Performances calculées par Mes portefeuilles.',
  auto: { pw: (s, c) => { const p = c.wolf && c.wolf[s.per]; return p ? sgn(p.wolf, 1) : '—'; } },
  f: [['l2', 'Encadré jaune', 'y'], ['l1', 'Ligne blanche', 't'], ['per', 'Période', 'sel', [['month', 'Ce mois-ci'], ['year', 'Cette année'], ['since', 'Depuis le début']]], ['cmp', 'Comparer à', 'sel', [['cac', 'CAC 40'], ['both', 'CAC 40 + S&P 500']]], ['pw', 'Performance du Wolf', 'ov']],
  d: { l2: MOIS[new Date().getMonth()] + ' ' + new Date().getFullYear(), l1: 'Depuis le debut', per: 'since', cmp: 'cac', pw: '' },
  v: [['A', 'Wolf contre les indices', (s, c) => { ybox(s.l2, 40, 110, 100); txt(s.l1, 40, 210, 64); const p = c.wolf && c.wolf[s.per]; if (!p) return;
      const rows = [[K_('WOLF'), p.wolf, OV(s, 'pw', sgn(p.wolf, 1))], [K_('CAC'), p.cac]]; if (s.cmp === 'both') rows.push([K_('SPX'), p.spx]); bars(rows, 40, 260, 130, 300); }],
     ['B', 'Le chiffre du mois', (s, c) => { tile(K_('WOLF'), 40, 40, 150); txt('Wolf', 215, 110, 86); txt('Portfolio', 215, 185, 70); ybox(s.l2, 40, 330, 96); pct(OV(s, 'pw', T[11].auto.pw(s, c)), 40, 560, 220, { max: 600 }); txt(s.l1, 40, 640, 56); }]] },
 { id: 'analyse', name: 'Analyse express', vid: 'Analyse express', pose: 'loupe',
  f: [['logo', 'Entreprise', 'L', 1], ['l1', 'Verdict (jaune)', 'y'], ['l2', 'Ligne blanche', 't'], ['l3', 'Ligne du bas', 't']], d: { logo: [S_('EURONEXT:SU', 'Schneider Electric', 'schneider')], l1: 'Sous-evaluee ?', l2: 'Analyse', l3: "A ce prix, j'achete ?" },
  v: [['A', 'Logo + verdict', s => { tile(s.logo[0], 40, 40, 230); txt(s.l2, 300, 170, 96, { max: 320 }); ybox(s.l1, 40, 430, 120); txt(s.l3, 40, 550, 64); }],
     ['B', 'Logo sous la loupe', s => { const cx = 300, cy = 370, R = 190; x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 30; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fillStyle = '#fff'; x.fill(); x.restore();
      const im = imgNow(logoUrl(s.logo[0])); x.save(); x.beginPath(); x.arc(cx, cy, R - 26, 0, 7); x.clip(); if (im) x.drawImage(im, cx - R * 0.7, cy - R * 0.7, R * 1.4, R * 1.4); x.restore();
      x.lineWidth = 26; x.strokeStyle = '#C9A13A'; x.beginPath(); x.arc(cx, cy, R - 13, 0, 7); x.stroke(); x.lineWidth = 4; x.strokeStyle = '#000'; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.stroke();
      x.lineCap = 'round'; x.strokeStyle = '#000'; x.lineWidth = 46; x.beginPath(); x.moveTo(cx - R * 0.72, cy + R * 0.72); x.lineTo(cx - R * 1.02, cy + R * 1.02); x.stroke(); x.strokeStyle = '#2A2118'; x.lineWidth = 34; x.stroke();
      txt(s.l2, 40, 100, 90); ybox(s.l1, 40, 690, 92, { max: 600 }); }],
     ['C', 'Tampon « à acheter ? »', s => { tile(s.logo[0], 40, 60, 260); txt(s.l2, 330, 190, 92, { max: 290 }); txt(nameOf(s.logo[0]), 330, 270, 64, { max: 290, color: Y });
      x.save(); x.translate(330, 470); x.rotate(-0.12); x.lineWidth = 10; x.strokeStyle = '#FF3B3B'; rr(-290, -80, 580, 150, 18); x.stroke(); x.lineWidth = 4; rr(-276, -66, 552, 122, 12); x.stroke();
      const st = up(s.l1 && /achet/i.test(s.l1) ? s.l1 : 'A acheter ?'); x.fillStyle = '#FF3B3B'; x.textAlign = 'center'; x.font = `400 ${fitSize(st, 104, 520)}px ${AF}`; x.fillText(st, 0, 30); x.textAlign = 'left'; x.restore(); txt('A ce prix ?', 40, 670, 70); }]] },
 { id: 'radar', name: 'Sur mon radar', vid: 'Analyse hebdo · Watchlist', pose: 'jumelles',
  f: [['l1', 'Encadré jaune', 'y'], ['logos', 'Entreprises', 'L', 4], ['l2', 'Ligne blanche', 't']], d: { l1: 'Sur mon radar', logos: [S_('EURONEXT:ASML', 'ASML', 'asml'), S_('MIL:RACE', 'Ferrari', 'ferrari'), S_('NASDAQ:NVDA', 'Nvidia', 'nvidia')], l2: "J'achete ?" },
  v: [['A', '3 logos à surveiller', s => { ybox(s.l1, 40, 120, 110); s.logos.slice(0, 3).forEach((k, i) => tile(k, 40 + i * 200, 190, 176, { q: 1 })); txt(s.l2, 40, 560, 120); }],
     ['B', 'Écran radar', s => { const cx = 320, cy = 440, R = 235; x.save(); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fillStyle = 'rgba(10,30,14,.85)'; x.fill(); x.clip();
      if (x.createConicGradient){ const g = x.createConicGradient(-Math.PI / 2, cx, cy); g.addColorStop(0, 'rgba(61,255,122,.55)'); g.addColorStop(0.18, 'rgba(61,255,122,0)'); g.addColorStop(1, 'rgba(61,255,122,0)'); x.fillStyle = g; x.fillRect(cx - R, cy - R, 2 * R, 2 * R); }
      x.strokeStyle = 'rgba(61,255,122,.6)'; x.lineWidth = 3; [1, 0.66, 0.33].forEach(f => { x.beginPath(); x.arc(cx, cy, R * f, 0, 7); x.stroke(); }); x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke(); x.restore();
      x.lineWidth = 6; x.strokeStyle = Y; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.stroke();
      [[-0.55, 0.62], [0.5, 0.35], [-0.15, -0.62], [0.35, -0.25]].slice(0, s.logos.length).forEach(([a, b], i) => tile(s.logos[i], cx + a * R - 46, cy + b * R - 46, 92)); ybox(s.l1, 40, 120, 110); }]] },
 { id: 'dividende', name: 'Revenus de dividendes', vid: 'Dividendes', pose: 'calendrier',
  f: [['l1', 'Ligne blanche', 't'], ['l2', 'Encadré jaune', 'y'], ['l3', 'Ligne 3', 't'], ['logos', 'Payeurs', 'L', 4]], d: { l1: 'Je touche', l2: '250 € / mois', l3: 'de dividendes', logos: [S_('EURONEXT:TTE', 'TotalEnergies', 'total'), S_('EURONEXT:SAN', 'Sanofi'), S_('EURONEXT:BNP', 'BNP Paribas', 'paribas'), S_('EURONEXT:DG', 'Vinci')] },
  v: [['A', 'Montant + payeurs', s => { txt(s.l1, 40, 140, 120); ybox(s.l2, 40, 290, 125); txt(s.l3, 40, 400, 80); s.logos.slice(0, 4).forEach((k, i) => tile(k, 40 + i * 150, 470, 130)); }]] },
 { id: 'erreur', name: "L'erreur à éviter", vid: 'Pédagogie · Psychologie', pose: 'stop',
  f: [['l1', 'Encadré jaune', 'y'], ['l2', 'Ligne blanche', 't'], ['logo', 'Objet barré', 'L', 1]], d: { l1: "L'erreur", l2: 'Qui coute cher', logo: [K_('EUR')] },
  v: [['A', 'Objet barré sous le texte', s => { ybox(s.l1, 40, 170, 150); txt(s.l2, 40, 310, 100); tile(s.logo[0], 40, 370, 240, { cross: 1 }); }],
     ['B', 'Objet barré en haut', s => { tile(s.logo[0], 40, 40, 230, { cross: 1 }); ybox(s.l1, 40, 470, 150); txt(s.l2, 40, 610, 100); }],
     ['C', 'Objet barré à droite du texte', s => { ybox(s.l1, 40, 160, 140); txt(s.l2, 40, 290, 90); tile(s.logo[0], 330, 330, 250, { cross: 1 }); txt('A eviter', 40, 470, 80, { color: '#FF3B3B', max: 270 }); arrow(260, 520, 320, 470, 0.3); }]] },
 { id: 'investi', name: 'Si tu avais investi', vid: 'Analyse express · Pédagogie', pose: 'billets', need: [NEED.hist],
  auto: { r: s => { const m = mult(s.logo[0], s.yrs); return m == null ? '—' : fr(Math.round(s.m * m / 10) * 10) + ' €'; } },
  f: [['logo', 'Action (calcul réel)', 'L', 1], ['m', 'Montant de départ', 'sel', [[1000, '1 000 €'], [5000, '5 000 €'], [10000, '10 000 €']]], ['yrs', 'Il y a', 'sel', [3, 5, 10]], ['r', 'Résultat', 'ov']], d: { logo: [S_('EURONEXT:RMS', 'Hermès', 'hermes')], m: 1000, yrs: 10, r: '' },
  v: [['A', 'Montant de départ → résultat', s => { const r = OV(s, 'r', T[16].auto.r(s)); ybox(fr(+s.m) + ' €', 40, 150, 120); const dw = txt('dans', 40, 270, 90); tile(s.logo[0], 40 + dw + 44, 190, 110); txt('il y a ' + s.yrs + ' ans', 40, 380, 90); pct('= ' + r, 40, 560, 150); txt('hors dividendes', 40, 630, 40, { color: '#C9CED6' }); }],
     ['B', 'Résultat en très grand', s => { const r = OV(s, 'r', T[16].auto.r(s)); tile(s.logo[0], 40, 40, 170); txt(fr(+s.m) + ' € il y a ' + s.yrs + ' ans', 240, 150, 70, { max: 400 }); ybox(r, 40, 420, 190); txt("aujourd'hui", 40, 560, 90); }]] },
 { id: 'hebdoW', name: 'Analyse hebdo', vid: 'Analyse hebdo (samedi)', pose: 'casque', need: [NEED.wolf], note: 'Loup au casque : version DORÉE si le Wolf monte cette semaine, ROUGE s’il baisse (réglage « Ambiance »). Chiffres de la semaine en cours.',
  auto: { sem: (s, c) => c.wolf ? 'Semaine ' + c.wolf.wk : 'Semaine', p: (s, c) => c.wolf && c.wolf.week ? sgn(c.wolf.week.wolf, 1) : '—', cac: (s, c) => c.wolf && c.wolf.week ? 'CAC 40 : ' + sgn(c.wolf.week.cac, 1) : '' },
  poseOf: (s, c) => { if (s.pose !== 'casque' && s.pose !== 'casque_rouge') return s.pose; if (s.amb === 'or') return 'casque'; if (s.amb === 'rouge') return 'casque_rouge'; const v = c.wolf && c.wolf.week ? c.wolf.week.wolf : 0; return v >= 0 ? 'casque' : 'casque_rouge'; },
  f: [['l1', 'Titre', 't'], ['sem', 'Encadré jaune (semaine)', 'ov'], ['p', 'Performance de la semaine', 'ov'], ['cac', 'Ligne de l’indice', 'ov'], ['q', 'Question (mise en page C)', 'y'], ['logos', 'Entreprises (vide = opérations de la semaine)', 'L', 4], ['amb', 'Ambiance du loup', 'sel', [['auto', 'Selon la semaine (or / rouge)'], ['or', 'Toujours dorée'], ['rouge', 'Toujours rouge']]]],
  d: { l1: 'Analyse hebdo', sem: '', p: '', cac: '', q: "J'achète ?", logos: [], amb: 'auto' },
  v: [['A', 'Semaine + performance', (s, c) => { const H = T.find(z => z.id === 'hebdoW'), L = hebdoLogos(s, c);
        txt(s.l1, 40, 105, 92); ybox(OV(s, 'sem', H.auto.sem(s, c)), 40, 205, 76); pct(OV(s, 'p', H.auto.p(s, c)), 40, 420, 200, { max: 580 }); txt(OV(s, 'cac', H.auto.cac(s, c)), 40, 495, 46, { color: '#C9CED6', max: 580 });
        L.slice(0, 4).forEach((k, i) => tile(k, 40 + i * 145, 540, 130)); }],
     ['B', 'Wolf contre le CAC 40', (s, c) => { const H = T.find(z => z.id === 'hebdoW'), w0 = c.wolf && c.wolf.week;
        txt(s.l1, 40, 105, 92); ybox(OV(s, 'sem', H.auto.sem(s, c)), 40, 205, 76);
        if (w0) bars([[K_('WOLF'), w0.wolf, OV(s, 'p', sgn(w0.wolf, 1))], [K_('CAC'), w0.cac, sgn(w0.cac, 1)]], 40, 290, 150, 330);
        const L = hebdoLogos(s, c); L.slice(0, 4).forEach((k, i) => tile(k, 40 + i * 115, 605, 95)); }],
     ['C', 'Question + logos « ? »', (s, c) => { const H = T.find(z => z.id === 'hebdoW'), L = hebdoLogos(s, c);
        txt(OV(s, 'sem', H.auto.sem(s, c)), 40, 100, 74); ybox(s.q, 40, 230, 120); L.slice(0, 4).forEach((k, i) => tile(k, 40 + (i % 2) * 190, 290 + Math.floor(i / 2) * 200, 170, { q: 1 }));
        if (!L.length) pct(OV(s, 'p', H.auto.p(s, c)), 40, 470, 180, { max: 560 }); }]] }
];

// logos de la miniature hebdo : ceux choisis, sinon les opérations de la semaine, sinon les 3 plus grosses lignes
function hebdoLogos(s, c){ if (s.logos && s.logos.length) return s.logos; const w = c.wolf; if (!w) return []; return (w.weekOps && w.weekOps.length ? w.weekOps : w.items.slice(0, 3)).slice(0, 4); }

/* ---------- préparation des données d'un modèle (avant dessin synchrone) ---------- */
async function prep(t, s){
  const ctx = {}, jobs = [img(wolfUrl(s.pose))];
  const items = [];
  t.f.forEach(([k, , ty]) => { if (ty === 'L' && Array.isArray(s[k])) items.push(...s[k]); });
  if (t.id === 'resultat' || t.id === 'portefeuille') items.push(K_('WOLF'));
  if ((t.need || []).includes(NEED.tier)){ ctx.tier = tierData(); ctx.tier.forEach(r => items.push(...r[1])); if (!ctx.tier.some(r => r[1].length)) ctx.err = 'Ta Tier list est vide : classe tes entreprises dans Screener > Tier List, elles apparaîtront ici.'; }
  await Promise.all(items.map(it => ensureLogo(it).catch(() => {})));
  items.forEach(it => { const u = logoUrl(it); if (u) jobs.push(img(u)); });
  if ((t.need || []).includes(NEED.hist)) t.f.forEach(([k, , ty]) => { if (ty === 'L' && s[k] && s[k][0] && s[k][0].sym) jobs.push(history(s[k][0].sym).catch(() => null)); });
  if ((t.need || []).includes(NEED.yield)) s.logos.forEach(it => { if (it.sym) jobs.push(snap(it.sym).then(v => { if (SNAP[it.sym]) SNAP[it.sym]._v = v; })); });
  if ((t.need || []).includes(NEED.wolf)) jobs.push(wolfFacts().then(v => { ctx.wolf = v; return Promise.all(v.items.concat(v.weekOps || []).map(it => img(tvLogo(it.logoid)))); }).catch(e => { ctx.err = e.message; }));
  if (t.poseOf) ['casque', 'casque_rouge'].forEach(k => jobs.push(img(wolfUrl(k))));
  await Promise.all(jobs);
  return ctx;
}
function render(cv, t, st, ctx){ x = cv.getContext('2d'); x.setTransform(cv.width / 1280, 0, 0, cv.height / 720, 0, 0); x.filter = 'none';
  let ps = st; if (t.poseOf){ try { ps = Object.assign({}, st, { pose: t.poseOf(st, ctx || {}) || st.pose }); } catch(e){} } bg(ps); try { t.v[st.vi][2](st, ctx || {}); } catch(e){ console.warn('Studio', e); } }

/* ======================= STOCKAGE (fichier studio.json) ======================= */
let D = null, serverOk = false, dirty = false, saving = false, saveTimer = null, conflict = false, saveErr = null, lastSaved = null, pendingDeleted = [];
async function load(){
  try { const p = await fetch('/api/ia/ping', { cache: 'no-store' }); const j = await p.json(); serverOk = !!(j && j.ok && j.v >= 20); } catch(e){ serverOk = false; }
  if (!serverOk){ D = null; return; }
  try {
    const r = await fetch('/api/store/load?name=studio', { cache: 'no-store' }); const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'lecture impossible');
    D = j.data || { version: 1, revision: 0, items: {}, custom: [], short: {}, trash: [] };
    D.items = D.items || {}; D.custom = D.custom || []; D.fav = Array.isArray(D.fav) ? D.fav : []; D.short = D.short || {}; D.trash = D.trash || [];
  } catch(e){ D = null; ui.err = e.message; }
}
function markDirty(){ if (!D) return; dirty = true; saveErr = null; status(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 800); }
async function save(keepalive){
  if (!serverOk || !D || conflict || !dirty) return;
  if (saving){ clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); return; }
  saving = true; dirty = false; status();
  const deleted = pendingDeleted.slice();
  const body = JSON.stringify(Object.assign({}, D, { revision: (D.revision || 0) + 1, baseRevision: D.revision || 0, deleted, savedAt: new Date().toISOString() }));
  try {
    const r = await fetch('/api/store/save?name=studio', { method: 'POST', keepalive: !!keepalive && body.length < 60000, headers: { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' }, body });
    const j = await r.json().catch(() => ({}));
    if ((!r.ok || !j.ok) && window.wolfRescue && Date.now() - (window.__wolfRescued_studio || 0) > 60000){ window.__wolfRescued_studio = Date.now(); window.wolfRescue('studio', body); }
    if (r.status === 409){ conflict = true; dirty = true; throw new Error('Modifié depuis un autre onglet (ton travail est gardé dans le dossier secours).'); }
    if (!r.ok || !j.ok) throw new Error(j.error || 'enregistrement refusé');
    D.revision = j.revision; lastSaved = new Date(); pendingDeleted = pendingDeleted.filter(x2 => !deleted.includes(x2)); saveErr = null;
  } catch(e){ saveErr = e.message || 'erreur'; dirty = true; if (!conflict){ clearTimeout(saveTimer); saveTimer = setTimeout(save, 4000); } }
  saving = false; status();
}
function status(){ const el = $('sdStatus'); if (!el) return;
  let t, c = '';
  if (!serverOk){ t = '⚠ Serveur local absent : lance l’appli avec le raccourci « Wolf Analysis » (rien ne peut être enregistré)'; c = 'err'; }
  else if (conflict){ t = '⚠ Modifié dans un autre onglet'; c = 'err'; }
  else if (saveErr){ t = '⚠ Non enregistré : ' + saveErr + ' (nouvel essai…)'; c = 'err'; }
  else if (saving || dirty){ t = '… enregistrement'; c = 'wait'; }
  else t = lastSaved ? '💾 Enregistré à ' + lastSaved.toLocaleTimeString('fr-FR') : '💾 Tout est enregistré';
  el.textContent = t; el.className = 'sd-status ' + c; }
window.addEventListener('beforeunload', e => { if (dirty && D && !conflict){ save(true); e.preventDefault(); e.returnValue = ''; } });

/* ======================= INTERFACE ======================= */
const ui = { tab: 'thumb', cur: 0, st: null, itemId: null, wolfTab: 'fav', bankQ: '', sugg: {}, err: null, busy: false };
const newState = i => Object.assign({ pose: T[i].pose, vi: 0, wz: '', wy: '' }, JSON.parse(JSON.stringify(T[i].d)));
let drawSeq = 0;
async function draw(){
  const t = T[ui.cur], s = ui.st, cv = $('sdBig'); if (!cv || !t) return;
  const seq = ++drawSeq; cv.classList.add('busy');
  let ctx = {};
  try { ctx = await prep(t, s); } catch(e){ ctx = { err: e.message }; }
  if (seq !== drawSeq) return;
  render(cv, t, s, ctx); cv.classList.remove('busy');
  ['sdFeedD', 'sdFeedM'].forEach(id => { const c = $(id); if (!c) return; const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.clearRect(0, 0, c.width, c.height); cx.drawImage(cv, 0, 0, c.width, c.height); badge(c, cx); });
  if ($('sdZone') && $('sdZone').checked){ const z = cv.getContext('2d'); z.setTransform(1, 0, 0, 1, 0, 0); z.save(); z.setLineDash([12, 8]); z.strokeStyle = '#FF3B3B'; z.lineWidth = 4; z.strokeRect(1090, 630, 180, 80); z.fillStyle = 'rgba(255,59,59,.18)'; z.fillRect(1090, 630, 180, 80); z.restore(); }
  const warn = $('sdWarn'); if (warn) warn.textContent = ctx.err ? '⚠ ' + ctx.err : '';
  if (t.auto) Object.keys(t.auto).forEach(k => { const el = $('sdf_' + k); if (el){ try { el.placeholder = 'Auto : ' + t.auto[k](s, ctx); } catch(e){} } });
}
function badge(c, cx){ const w = c.width, h = c.height, k = w / 360, bw = 38 * k, bh = 17 * k; cx.fillStyle = 'rgba(0,0,0,.85)'; cx.beginPath(); cx.rect(w - bw - 5 * k, h - bh - 5 * k, bw, bh); cx.fill(); cx.fillStyle = '#fff'; cx.font = `600 ${11 * k}px ${BF}`; cx.textAlign = 'center'; cx.fillText('18:35', w - bw / 2 - 5 * k, h - 9 * k); cx.textAlign = 'left'; }

function shell(){
  const el = $(PAGE_ID); if (!el) return;
  el.innerHTML = `<div class="sd-wrap">
    <div class="sd-head"><h2>🎬 Wolf Studio</h2>
      <div class="sd-tabs" role="tablist"><button type="button" data-sd-tab="thumb" class="${ui.tab === 'thumb' ? 'on' : ''}">🖼 Miniatures</button><button type="button" data-sd-tab="short" class="${ui.tab === 'short' ? 'on' : ''}">📱 Short Wolf Portfolio</button></div>
      <span id="sdStatus" class="sd-status"></span></div>
    <div id="sdBody"></div></div>`;
  status();
  ui.tab === 'thumb' ? thumbView() : SHORT.view();
}

/* ---------- Miniatures ---------- */
function thumbView(){
  const b = $('sdBody'); if (!b) return;
  if (!ui.st) ui.st = newState(ui.cur);
  b.innerHTML = `<div class="sd-editor">
    <div class="sd-left">
      <canvas id="sdBig" width="1280" height="720" aria-label="Aperçu de la miniature"></canvas>
      <p id="sdWarn" class="sd-warn"></p>
      <div class="sd-under">
        <div class="sd-feed"><canvas id="sdFeedD" width="360" height="202"></canvas><span><b>Fil YouTube, ordinateur</b></span></div>
        <div class="sd-feed"><canvas id="sdFeedM" width="168" height="94"></canvas><span><b>Suggestions, téléphone</b></span></div>
        <div class="sd-actions">
          <label class="sd-tog"><input type="checkbox" id="sdZone"> Zone de la durée</label>
          <label class="sd-f sd-title">Nom dans ta bibliothèque<input id="sdItemTitle" value="${esc(ui.itemId && D && D.items[ui.itemId] ? D.items[ui.itemId].title : '')}" placeholder="Ex. Analyse hebdo 46"></label>
          <div class="sd-btns"><button type="button" class="sd-main" data-sd-act="save">💾 ${ui.itemId ? 'Mettre à jour' : 'Enregistrer'}</button>${ui.itemId ? '<button type="button" data-sd-act="saveas">＋ Enregistrer une copie</button>' : ''}<button type="button" data-sd-act="png">⬇ Télécharger le PNG</button></div>
        </div>
      </div>
    </div>
    <div class="sd-panel" id="sdPanel"></div>
   </div>
   <div class="sd-gal" id="sdGal"><h3>Tous les modèles <small>clique sur un modèle pour l'ouvrir</small></h3>
    <div class="sd-tplgrid">${T.map((t, i) => [t, i]).sort((a, b) => (b[0].id === 'hebdoW') - (a[0].id === 'hebdoW')).map(([t, i]) => `<button type="button" data-sd-tpl="${i}" class="${i === ui.cur ? 'on' : ''}"><canvas data-sd-th="${i}" width="320" height="180"></canvas><b>${esc(t.name)}</b><small>${esc(t.vid)} · ${t.v.length} mise${t.v.length > 1 ? 's' : ''} en page</small></button>`).join('')}</div></div>
   <div class="sd-lib"><h3>Ma bibliothèque de miniatures</h3><div id="sdLib"></div></div>`;
  panel(); lib(); draw(); galThumbs();
}
// Aperçus de la galerie : chaque modèle dessiné une fois (réglages par défaut), gardé en mémoire.
const THUMBS = {}; let galRun = 0;
async function galThumbs(){
  const run = ++galRun;
  const put = i => { const c = document.querySelector(`[data-sd-th="${i}"]`); if (c && THUMBS[i]) c.getContext('2d').drawImage(THUMBS[i], 0, 0, 320, 180); };
  T.forEach((t, i) => put(i));
  for (let i = 0; i < T.length; i++){
    if (THUMBS[i]) continue;
    const st = newState(i); let ctx = {};
    try { ctx = await prep(T[i], st); } catch(e){}
    if (run !== galRun) return;
    const big = document.createElement('canvas'); big.width = 1280; big.height = 720; render(big, T[i], st, ctx);
    const sm = document.createElement('canvas'); sm.width = 320; sm.height = 180; const sx = sm.getContext('2d'); sx.imageSmoothingQuality = 'high'; sx.drawImage(big, 0, 0, 320, 180);
    THUMBS[i] = sm; put(i);
  }
}
function fieldHtml(t, s, [k, l, ty, n]){
  if (ty === 't' || ty === 'y') return `<label class="sd-f">${ty === 'y' ? '<span><i class="sd-y"></i>' + esc(l) + '</span>' : esc(l)}<input id="sdf_${k}" data-sd-k="${k}" value="${esc(s[k])}"></label>`;
  if (ty === 'ov') return `<label class="sd-f">${esc(l)} · calculé, modifiable<input id="sdf_${k}" data-sd-k="${k}" value="${esc(s[k])}" placeholder="Auto : …"></label>`;
  if (ty === 'sel') return `<label class="sd-f">${esc(l)}<select id="sdf_${k}" data-sd-k="${k}">${n.map(o => { const [v, lab] = Array.isArray(o) ? o : [o, o + ' an' + (o > 1 ? 's' : '')]; return `<option value="${esc(v)}" ${String(s[k]) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select></label>`;
  const list = s[k] || [];
  return `<div class="sd-grp"><span>${esc(l)}${n > 1 ? ' · ' + n + ' au plus' : ''}</span>
    <div class="sd-chips">${list.map((it, i) => `<span class="sd-chip">${logoUrl(it) ? `<img src="${esc(logoUrl(it))}" alt="">` : '<i>' + esc(up(nameOf(it)).slice(0, 1)) + '</i>'}${esc(nameOf(it))}${n > 1 ? `<button type="button" data-sd-mv="${k}|${i}|-1" aria-label="Avancer">‹</button><button type="button" data-sd-mv="${k}|${i}|1" aria-label="Reculer">›</button>` : ''}<button type="button" data-sd-rm="${k}|${i}" aria-label="Retirer">✕</button></span>`).join('')}</div>
    <input class="sd-search" data-sd-q="${k}" placeholder="Chercher une entreprise ou un ETF (TradingView)…" autocomplete="off">
    <div class="sd-sugg" id="sdSugg_${k}"></div>
    <div class="sd-presets">${['chatgpt', 'claude', 'gemini', 'grok', 'EUR'].map(p => `<button type="button" data-sd-pre="${k}|${p}">${esc(SPECIAL[p][0])}</button>`).join('')}</div></div>`;
}
function panel(){
  const p = $('sdPanel'); if (!p) return; const t = T[ui.cur], s = ui.st;
  const fav = Object.keys(POSES);
  p.innerHTML = `<div class="sd-phead"><h3>${esc(t.name)}</h3><button type="button" class="sd-chg" data-sd-act="gal">▦ Changer de modèle</button></div><p class="sd-sub">Vidéos : ${esc(t.vid)}${t.note ? ' · ' + esc(t.note) : ''}</p>
   <div class="sd-grp"><span>Mise en page</span><div class="sd-vars">${t.v.map((v, i) => `<button type="button" data-sd-v="${i}" class="${s.vi === i ? 'on' : ''}">${v[0]} · ${esc(v[1])}</button>`).join('')}</div></div>
   ${t.f.map(f => fieldHtml(t, s, f)).join('')}
   <div class="sd-grp"><span>Loup</span>
    <div class="sd-wtabs"><button type="button" data-sd-wt="fav" class="${ui.wolfTab === 'fav' ? 'on' : ''}">Mes poses${D && D.fav.length ? ' · ★ ' + D.fav.length : ''}</button><button type="button" data-sd-wt="bank" class="${ui.wolfTab === 'bank' ? 'on' : ''}">Toute la banque</button><button type="button" data-sd-wt="mine" class="${ui.wolfTab === 'mine' ? 'on' : ''}">Mes images</button></div>
    ${ui.wolfTab === 'bank' ? '<input class="sd-search" id="sdBankQ" placeholder="Filtrer (nom de fichier ou dossier : panique, emoji, vertical…)" value="' + esc(ui.bankQ) + '"><p class="sd-sub" id="sdBankN"></p>' : ''}
    ${ui.wolfTab === 'mine' ? '<label class="sd-upl">＋ Ajouter une image (fichier, ou Ctrl+V ici)<input type="file" id="sdUpload" accept="image/png,image/jpeg,image/webp" hidden></label>' : ''}
    <div class="sd-poses" id="sdPoses">${ui.wolfTab === 'fav' ? ((D && D.fav.length ? '<p class="sd-sub sd-full">★ Mes favoris</p>' + D.fav.map(r => poseBtn(r, String(r).split('/').pop())).join('') + '<p class="sd-sub sd-full">Poses de base</p>' : '') + fav.map(k => poseBtn(k, k.replace('_', ' '), false)).join('')) : ui.wolfTab === 'mine' ? (D && D.custom.length ? D.custom.map(c => poseBtn('media:' + c.f, c.name || 'image')).join('') : '<p class="sd-sub">Aucune image ajoutée.</p>') : '<p class="sd-sub">Chargement…</p>'}</div>
    <label class="sd-f">Taille du loup<select data-sd-k="wz">${[['', 'Normale'], ['.92', '92 %'], ['.86', '86 %'], ['.8', '80 %']].map(([v, l]) => `<option value="${v}" ${String(s.wz) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="sd-f">Position du loup (si l’image est plus haute que la miniature)<select data-sd-k="wy">${[['', 'Haut de l’image (tête entière)'], ['.25', 'Un peu plus bas'], ['.5', 'Centré'], ['1', 'Bas de l’image']].map(([v, l]) => `<option value="${v}" ${String(s.wy == null ? '' : s.wy) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
   </div>`;
  if (ui.wolfTab === 'bank') bankGrid();
}
// Favoris de la banque : chemins gardés dans studio.json (D.fav), affichés dans « Mes poses ».
const isFav = ref => !!(D && D.fav && D.fav.includes(ref));
const poseBtn = (ref, label, star = true) => `<span class="sd-pw"><button type="button" data-sd-pose="${esc(ref)}" class="${ui.st.pose === ref ? 'on' : ''}" title="${esc(label)}"><img loading="lazy" src="${esc(wolfUrl(ref, true))}" alt="${esc(label)}"></button>${star && D ? `<button type="button" class="sd-star ${isFav(ref) ? 'on' : ''}" data-sd-fav="${esc(ref)}" title="${isFav(ref) ? 'Retirer des favoris' : 'Ajouter aux favoris'}" aria-label="${isFav(ref) ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${isFav(ref) ? '★' : '☆'}</button>` : ''}</span>`;
async function bankGrid(){
  const box = $('sdPoses'); if (!box) return; const list = await loadBank(); const q = ui.bankQ.trim().toLowerCase();
  const f = list.filter(n => !q || n.toLowerCase().includes(q)).slice(0, 240);
  if (!box.isConnected) return;
  const nEl = $('sdBankN'); if (nEl) nEl.textContent = list.length + ' images (banque d’images + visuels ChatGPT, dont les loups détourés)' + (q ? ' · ' + f.length + ' trouvées' : '');
  box.innerHTML = f.length ? f.map(n => poseBtn(n, n.split('/').pop())).join('') + (list.length > f.length && !q ? '<p class="sd-sub">240 premières images ; filtre par nom pour les autres.</p>' : '') : '<p class="sd-sub">Aucune image (la banque est lue dans « Bureau\\Wolf Academy\\IMAGE DE MARQUE ET TAMPLATE\\BANQUE DIMAGES »).</p>';
}
function lib(){
  const el = $('sdLib'); if (!el) return;
  if (!D){ el.innerHTML = '<p class="sd-sub">' + (serverOk ? 'Chargement…' : 'Bibliothèque indisponible sans le serveur local.') + '</p>'; return; }
  const items = Object.entries(D.items).sort((a, b) => (b[1].updatedAt || '').localeCompare(a[1].updatedAt || ''));
  el.innerHTML = (items.length ? `<div class="sd-libgrid">${items.map(([id, it]) => `<div class="sd-libit ${id === ui.itemId ? 'on' : ''}"><button type="button" data-sd-open="${id}"><img src="${esc(it.preview || '')}" alt=""><b>${esc(it.title || T.find(t => t.id === it.tpl)?.name || 'Miniature')}</b><span>${new Date(it.updatedAt || Date.now()).toLocaleDateString('fr-FR')} · ${esc(T.find(t => t.id === it.tpl)?.name || '')}</span></button><button type="button" class="sd-del" data-sd-del="${id}" aria-label="Mettre à la corbeille">🗑</button></div>`).join('')}</div>` : '<p class="sd-sub">Aucune miniature enregistrée. « 💾 Enregistrer » garde le modèle, les textes, le loup et les logos.</p>')
    + (D.trash.length ? `<details class="sd-trash"><summary>Corbeille (${D.trash.length})</summary>${D.trash.slice().reverse().map((it, i) => `<div><span>${esc(it.title || 'Miniature')} · supprimée le ${new Date(it.deletedAt).toLocaleDateString('fr-FR')}</span><button type="button" data-sd-restore="${D.trash.length - 1 - i}">↶ Restaurer</button></div>`).join('')}</details>` : '');
}
function previewJpeg(){ const c = document.createElement('canvas'); c.width = 320; c.height = 180; c.getContext('2d').drawImage($('sdBig'), 0, 0, 320, 180); try { return c.toDataURL('image/jpeg', 0.72); } catch(e){ return ''; } }
function saveItem(asNew){
  if (!D){ alertMsg('Enregistrement impossible : serveur local absent.'); return; }
  const id = (!asNew && ui.itemId) || ('m' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const prev = D.items[id] || {};
  D.items[id] = { tpl: T[ui.cur].id, state: JSON.parse(JSON.stringify(ui.st)), title: ($('sdItemTitle') && $('sdItemTitle').value.trim()) || prev.title || T[ui.cur].name, preview: previewJpeg(), createdAt: prev.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  ui.itemId = id; markDirty(); thumbView();
}
function alertMsg(m){ const w = $('sdWarn'); if (w) w.textContent = '⚠ ' + m; }
function downloadPng(){
  const cv = $('sdBig'); const name = (($('sdItemTitle') && $('sdItemTitle').value.trim()) || T[ui.cur].name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'miniature';
  try { cv.toBlob(b => { if (!b){ alertMsg('Export impossible.'); return; } const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name + '.png'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }, 'image/png'); }
  catch(e){ alertMsg('Export impossible : une image n\'autorise pas la copie (' + e.message + ').'); }
}
async function uploadImage(file){
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)){ alertMsg('Formats acceptés : PNG, JPEG, WebP.'); return; }
  if (!D){ alertMsg('Serveur local absent : image non enregistrée.'); return; }
  try { const r = await fetch('/api/atelier/media', { method: 'POST', headers: { 'Content-Type': file.type, 'X-Wolf-IA': '1' }, body: file }); const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'refusé');
    D.custom.push({ f: j.file, name: (file.name || 'image collée').slice(0, 80), at: new Date().toISOString() }); markDirty();
    ui.st.pose = 'media:' + j.file; panel(); draw();
  } catch(e){ alertMsg('Image non enregistrée : ' + e.message); }
}
let suggTimer = null;
async function search(k, q){
  const box = $('sdSugg_' + k); if (!box) return;
  if (q.trim().length < 2){ box.innerHTML = ''; return; }
  try { const r = await fetch('/api/tv/search?all=1&q=' + encodeURIComponent(q.trim().slice(0, 50)), { cache: 'no-store' }); const j = await r.json(); ui.sugg[k] = j.ok ? (j.results || []).slice(0, 8) : []; }
  catch(e){ ui.sugg[k] = []; }
  box.innerHTML = ui.sugg[k].length ? ui.sugg[k].map((r, i) => `<button type="button" data-sd-pick="${k}|${i}">${r.logoid ? `<img src="${esc(tvLogo(r.logoid))}" alt="">` : '<i></i>'}<b>${esc(r.name)}</b><span>${esc(r.symbol)}</span></button>`).join('') : '<p class="sd-sub">Aucun résultat (serveur local ?).</p>';
}
function addItem(k, it){ const t = T[ui.cur], f = t.f.find(z => z[0] === k), n = f ? f[3] : 1, arr = ui.st[k] = ui.st[k] || [];
  if (n === 1) ui.st[k] = [it]; else { if (arr.some(a => (a.sym && a.sym === it.sym) || (a.k && a.k === it.k))) return; if (arr.length >= n) arr.pop(); arr.push(it); }
  panel(); draw(); }

/* ---------- événements ---------- */
document.addEventListener('click', e => {
  const page = $(PAGE_ID); if (!page || !page.contains(e.target)) return;
  const b = e.target.closest('button'); if (!b) return; const ds = b.dataset;
  if (ds.sdTab){ if (ui.tab === 'short' && ds.sdTab !== 'short') SHORT.stop(); ui.tab = ds.sdTab; shell(); return; }
  if (ds.sdTpl != null){ ui.cur = +ds.sdTpl; ui.st = newState(ui.cur); ui.itemId = null; thumbView(); const top = $('sdBody'); if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (ds.sdV != null){ ui.st.vi = +ds.sdV; panel(); draw(); return; }
  if (ds.sdWt){ ui.wolfTab = ds.sdWt; if (ds.sdWt === 'bank') bankAt = 0; panel(); return; }
  if (ds.sdFav != null){ if (!D){ alertMsg('Favoris indisponibles sans le serveur local.'); return; } const r = ds.sdFav, i = D.fav.indexOf(r); if (i >= 0) D.fav.splice(i, 1); else D.fav.push(r); markDirty();
    const on = D.fav.includes(r); b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; b.title = on ? 'Retirer des favoris' : 'Ajouter aux favoris';
    const wt = page.querySelector('[data-sd-wt="fav"]'); if (wt) wt.textContent = 'Mes poses' + (D.fav.length ? ' · ★ ' + D.fav.length : ''); if (ui.wolfTab === 'fav') panel(); return; }
  if (ds.sdPose){ ui.st.pose = ds.sdPose; page.querySelectorAll('[data-sd-pose]').forEach(z => z.classList.toggle('on', z === b)); draw(); return; }
  if (ds.sdRm){ const [k, i] = ds.sdRm.split('|'); ui.st[k].splice(+i, 1); panel(); draw(); return; }
  if (ds.sdMv){ const [k, i, d] = ds.sdMv.split('|'), a = ui.st[k], j = +i + +d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; panel(); draw(); return; }
  if (ds.sdPre){ const [k, p] = ds.sdPre.split('|'); addItem(k, K_(p)); return; }
  if (ds.sdPick){ const [k, i] = ds.sdPick.split('|'), r = (ui.sugg[k] || [])[+i]; if (r) addItem(k, S_(r.symbol, r.name, r.logoid)); return; }
  if (ds.sdAct === 'save'){ saveItem(false); return; }
  if (ds.sdAct === 'saveas'){ saveItem(true); return; }
  if (ds.sdAct === 'png'){ downloadPng(); return; }
  if (ds.sdAct === 'gal'){ const g = $('sdGal'); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (ds.sdOpen){ const it = D.items[ds.sdOpen]; const i = T.findIndex(t => t.id === it.tpl); if (i < 0) return; ui.cur = i; ui.st = Object.assign(newState(i), JSON.parse(JSON.stringify(it.state))); ui.itemId = ds.sdOpen; thumbView(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (ds.sdDel){ if (b.dataset.armed !== '1'){ b.dataset.armed = '1'; b.textContent = 'Sûr ?'; setTimeout(() => { if (b.isConnected){ b.dataset.armed = ''; b.textContent = '🗑'; } }, 3000); return; }
    const it = D.items[ds.sdDel]; D.trash.push(Object.assign({ id: ds.sdDel, deletedAt: new Date().toISOString() }, it)); delete D.items[ds.sdDel]; pendingDeleted.push(ds.sdDel); if (ui.itemId === ds.sdDel) ui.itemId = null; markDirty(); lib(); return; }
  if (ds.sdRestore != null){ const it = D.trash.splice(+ds.sdRestore, 1)[0]; if (!it) return; const id = it.id || ('m' + Date.now().toString(36)); delete it.id; delete it.deletedAt; D.items[id] = it; pendingDeleted = pendingDeleted.filter(z => z !== id); markDirty(); lib(); return; }
  if (SHORT.click(b)) return;
});
document.addEventListener('input', e => {
  const page = $(PAGE_ID); if (!page || !page.contains(e.target)) return;
  const k = e.target.dataset.sdK;
  if (k){ const v = e.target.value; ui.st[k] = e.target.tagName === 'SELECT' && v !== '' && !isNaN(+v) ? +v : v; draw(); return; }
  if (e.target.dataset.sdQ){ const kk = e.target.dataset.sdQ, q = e.target.value; clearTimeout(suggTimer); suggTimer = setTimeout(() => search(kk, q), 250); return; }
  if (e.target.id === 'sdBankQ'){ ui.bankQ = e.target.value; clearTimeout(suggTimer); suggTimer = setTimeout(bankGrid, 200); return; }
  if (e.target.id === 'sdZone'){ draw(); return; }
  SHORT.input(e);
});
document.addEventListener('change', e => { if (e.target.id === 'sdUpload' && e.target.files[0]) uploadImage(e.target.files[0]); if (e.target.id === 'sdZone') draw(); SHORT.change && SHORT.change(e); });
document.addEventListener('paste', e => { const page = $(PAGE_ID); if (!page || !page.classList.contains('active') || ui.tab !== 'thumb' || ui.wolfTab !== 'mine') return;
  const f = [...(e.clipboardData && e.clipboardData.files || [])].find(z => /^image\//.test(z.type)); if (f){ e.preventDefault(); uploadImage(f); } });

/* ======================= SHORT « WOLF PORTFOLIO DE LA SEMAINE » ======================= */
const SHORT = (() => {
  const THEMES = {
    beige: { bg: '#F3ECDF', card: '#E8DDC9', ink: '#1C1813', ink2: '#3B3228', dim: '#7A6E5E', track: '#DACCB3', hlBg: '#F2B33D', hlInk: '#111111', sig: 'rgba(28,24,19,.62)', gold: '#C98516', green: '#1B9660', red: '#CF3E48', cam1: '#3A3128', cam2: '#1C1813', line2: '#3B3228', line3: '#4A86C5' },
    nuit: { bg: '#111315', card: '#1C2026', ink: '#F4F5F7', ink2: '#D3D7DD', dim: '#9AA1AB', track: '#2A2F36', hlBg: '#F2B33D', hlInk: '#111111', sig: 'rgba(242,243,245,.7)', gold: '#F2B33D', green: '#3DDC97', red: '#FF5C64', cam1: '#2A3038', cam2: '#16191D', line2: '#C9CED6', line3: '#4A9FE0' },
    or: { bg: '#F2B33D', card: 'rgba(18,19,22,.10)', ink: '#121316', ink2: '#2B2414', dim: '#5E4A1E', track: 'rgba(18,19,22,.18)', hlBg: '#FFFFFF', hlInk: '#111111', sig: 'rgba(18,19,22,.7)', gold: '#121316', green: '#0B6B42', red: '#A3202A', cam1: '#3A2C10', cam2: '#121316', line2: '#2B2414', line3: '#1F4E8C' }
  };

  /* --- stickers : loups détourés de « BANQUE VISUELS CHATGPT » (servis par le serveur avec leur transparence) --- */
  const SX = 'VISUELS/01 LOUP PERSONNAGE/EXPRESSIONS MINIATURES/9_expressions_loup_png/loup_expression_', SE = 'VISUELS/04 DISCORD/EMOJIS/emojis_loup_discord_complet_22/haute_resolution_512/loup_', SE2 = 'VISUELS/04 DISCORD/EMOJIS/emojis_loup_discord/haute_resolution_512/loup_';
  const STK = { surpris: ['Surpris', SX + '01_surpris.png'], reflexion: ['Réfléchit', SX + '02_reflexion.png'], pointe: ['Pointe du doigt', SX + '03_pointe_du_doigt.png'], panique: ['Panique', SX + '04_panique.png'],
    fier: ['Fier', SX + '05_fier.png'], chuchote: ['Chuchote', SX + '06_chuchote.png'], decourage: ['Découragé', SX + '07_decourage.png'], rire: ['Éclate de rire', SX + '08_eclate_de_rire.png'], croises: ['Bras croisés', SX + '09_bras_croises.png'],
    triste: ['Emoji triste', SE + 'triste.png'], facepalm: ['Emoji facepalm', SE + 'facepalm.png'], fusee: ['Emoji fusée', SE + 'fusee.png'], feu: ['Emoji feu', SE + 'feu.png'], argent: ['Emoji argent', SE + 'argent.png'], popcorn: ['Emoji popcorn', SE + 'popcorn.png'],
    loupe: ['Emoji loupe', SE + 'loupe.png'], bravo: ['Emoji bravo', SE + 'bravo.png'], couronne: ['Emoji couronne', SE + 'couronne.png'], hurle: ['Emoji hurle', SE + 'hurle.png'], coeur: ['Emoji cœur', SE + 'coeur.png'], cafe: ['Emoji café', SE + 'cafe.png'], rire2: ['Emoji rire', SE + 'rire.png'],
    choque: ['Emoji choqué', SE2 + 'choque.png'], diamond: ['Emoji diamond hands', SE2 + 'diamond_hands.png'], taureau: ['Emoji taureau', SE2 + 'taureau.png'], ours: ['Emoji ours', SE2 + 'ours.png'], hype: ['Emoji hype', SE2 + 'hype.png'], pouce: ['Emoji pouce', SE2 + 'pouce.png'], dort: ['Emoji dort', SE2 + 'dort.png'], salut: ['Emoji salut', SE2 + 'salu.png'] };
  const stkUrl = k => (k && STK[k]) ? wolfUrl(STK[k][1]) : '';

  /* --- modèles (formats) de shorts --- */
  const lines = s => String(s || '').split(/\n+/).map(z => z.trim()).filter(Boolean);
  const SCN_HEBDO = [
    { k: 'hook', t: 'Accroche', d: 'Le chiffre de la semaine', dur: 3.4, say: d => `Semaine ${d.week} pour le Wolf Portfolio : ${sgn(d.wolf, 1)}, pendant que le CAC 40 fait ${sgn(d.cac, 1)}.` },
    { k: 'duel', t: 'Wolf vs indices', d: 'Barres Wolf / CAC 40 / S&P 500', dur: 4, say: d => `Le CAC 40 fait ${sgn(d.cac, 1)}, le S&P 500 ${sgn(d.spx, 1)} en euros.` },
    { k: 'since', t: 'Depuis le début', d: 'Courbe base 100', dur: 5, say: d => `Depuis le lancement : ${sgn(d.since.wolf, 1)}.` },
    { k: 'op', t: "L'opération", d: 'Achat ou vente de la semaine', dur: 4.4, say: d => d.op ? `L'opération de la semaine : ${d.op.type === 'SELL' ? 'vente' : 'achat'} de ${d.op.nom}.` : 'Pas d’opération cette semaine.', ok: d => !!(d && d.op) },
    { k: 'topflop', t: 'Top & flop', d: '3 meilleures et 3 pires lignes', dur: 4.4, say: d => d.top[0] ? `${d.top[0].name} en tête cette semaine${d.flop[0] ? ', ' + d.flop[0].name + ' ferme la marche' : ''}.` : '' },
    { k: 'compo', t: 'Composition', d: 'Camembert, logos, tête de loup', dur: 4.6, say: d => `${fr(d.cashW)} % de liquidités dans le portefeuille.` },
    { k: 'end', t: 'Fin', d: 'Renvoi vers la vidéo du samedi', dur: 3, say: d => `L'analyse complète, c'est samedi sur la chaîne. Abonne-toi pour la semaine ${d.week + 1}.` }
  ];
  const FIN = { k: 'fin', t: 'Fin', d: 'Tête de loup + abonne-toi', dur: 2.6, say: (d, p) => p.fin || 'Abonne-toi pour la suite, et dis-moi en commentaire ce que tu en penses.' };
  const FMT = {
    hebdo: { name: '📊 Récap de la semaine', desc: 'Wolf Portfolio vs CAC 40 et S&P 500', manual: false, scenes: SCN_HEBDO, p: {} },
    ecran: { name: '🖥 Écran partagé', desc: 'Ta tête + ton écran (graphique, appli…)', manual: true, p: { titre: 'Regarde ce graphique', sous: 'Je t’explique', sticker: 'pointe', zoom: '1', focus: 'c', fin: '' },
      scenes: [{ k: 'titre', t: 'Accroche', d: 'Titre + loup', dur: 2.6, say: (d, p) => p.titre }, { k: 'ecran', t: 'Écran partagé', d: 'Ton écran en haut, toi en bas', dur: 1.2, say: () => 'Tu parles librement : l’écran reste affiché tant que tu ne passes pas à la suite.' }, FIN] },
    explique: { name: '💡 Je t’explique', desc: 'Un titre, puis tes points un par un', manual: true, p: { titre: 'Le PER expliqué en 30 secondes', sous: 'Simple et rapide', points: 'Le PER, c’est le prix payé pour 1 € de bénéfice\nUn PER de 20 = 20 ans de bénéfices pour rembourser ton achat\nÀ comparer au secteur et à l’historique, jamais seul', sticker: 'reflexion', stickerFin: 'pouce', co: null, fin: '' },
      scenes: [{ k: 'titre', t: 'Titre', d: 'Titre + loup', dur: 2.6, say: (d, p) => p.titre }].concat([1, 2, 3, 4, 5].map(i => ({ k: 'p' + i, t: 'Point ' + i, d: 'Apparaît sous les précédents', dur: 1.6, say: (d, p) => lines(p.points)[i - 1] || '', ok: (d, p) => lines(p.points).length >= i }))).concat([FIN]) },
    chute: { name: '📉 Action qui chute', desc: 'Baisse depuis le plus haut, pourquoi, opportunité ?', manual: true, p: { co: { sym: 'EURONEXT:SU', name: 'Schneider Electric', logoid: 'schneider' }, yrs: '2', raisons: 'Résultats en dessous des attentes\nCroissance qui ralentit\nValorisation encore exigeante', question: 'Opportunité ou piège ?', verdict: 'Je la surveille de près', sticker: 'panique', sticker2: 'loupe', fin: '' },
      scenes: [{ k: 'hook', t: 'Le choc', d: 'Chiffre géant + loup paniqué', dur: 2.4, say: d => `${d.name} a perdu ${fr(Math.abs(d.drop), 0)} % depuis son plus haut.` },
        { k: 'graph', t: 'Le graphique', d: 'La courbe se dessine', dur: 3.2, say: d => `Plus haut à ${money(d.max, d.ccy)}, aujourd'hui ${money(d.last, d.ccy)}.` },
        { k: 'raisons', t: 'Pourquoi ?', d: 'Tes raisons, une par une', dur: 3, say: (d, p) => lines(p.raisons).join(' · ') },
        { k: 'question', t: 'La question', d: 'Opportunité ou piège ?', dur: 2.4, say: (d, p) => p.verdict }, FIN] },
    valo: { name: '🎯 Valorisation', desc: 'Tes 3 scénarios de « Prix par secteur » posés sur le cours', manual: true, p: { nom: '', sticker: '', gyrs: '2', verdictT: '', fin: '' },
      scenes: [{ k: 'intro', t: 'Le cours', d: 'Logo + cours actuel', dur: 2.4, say: d => `${d.nom} cote aujourd'hui ${money(d.cours, d.ccy)}. Quel est son prix juste ?` },
        { k: 'gcours', t: 'Le graphique', d: 'La courbe du cours se dessine', dur: 2.2, say: d => d.S ? `Voilà le cours sur ${d.gy} an${d.gy > 1 ? 's' : ''} : ${d.trend >= 0 ? '+' : '−'}${fr(Math.abs(d.trend), 0)} %.` : '', ok: d => !!(d && d.S) },
        { k: 'pess', t: 'Pessimiste', d: 'La ligne rouge apparaît sur le graphique', dur: 1.8, say: d => `Scénario pessimiste : ${money(d.sc.pess, d.ccy)}, soit ${sgn(pot(d, 'pess'))} par rapport au cours.` },
        { k: 'real', t: 'Réaliste', d: 'La ligne jaune + le dégradé', dur: 1.8, say: d => `Scénario réaliste, mon prix juste : ${money(d.sc.real, d.ccy)}, soit ${sgn(pot(d, 'real'))}.` },
        { k: 'opt', t: 'Optimiste', d: 'La ligne verte, dégradé complet', dur: 1.8, say: d => `Scénario optimiste : ${money(d.sc.opt, d.ccy)}, soit ${sgn(pot(d, 'opt'))}.` },
        { k: 'verdict', t: 'Mon verdict', d: 'Titre + écart au prix juste, sur le graphique', dur: 2.2, say: d => { const e = ecartJ(d); return isNum(e) ? `Le cours est ${fr(Math.abs(e), 0)} % ${e >= 0 ? 'au-dessus' : 'en dessous'} de mon prix juste de ${money(d.sc.real, d.ccy)}.` : ''; } }, FIN] },
    trans: { name: '🔁 Mon achat / ma vente', desc: 'Une opération du Wolf Portfolio, posée sur le cours', manual: true, p: { op: '', raisons: 'Objectif de cours atteint\nJe préfère renforcer une autre ligne', sticker: 'fier', fin: '' },
      scenes: [{ k: 'hook', t: 'Accroche', d: 'J’ai vendu / j’ai acheté', dur: 2.2, say: d => `${d.type === 'SELL' ? "J'ai vendu" : "J'ai acheté"} ${d.name}.` },
        { k: 'gachat', t: "L'achat", d: 'Point d’achat sur le cours', dur: 2.4, say: d => `Acheté le ${dl(d.buyDate)}${isNum(d.bpx) ? ' à ' + money(d.bpx, d.bccy) : ''}.` },
        { k: 'gvente', t: 'La vente', d: 'Point de vente + performance sur le cours', dur: 2.6, say: d => `Vendu le ${dl(d.sellDate)}${isNum(d.spx) ? ' à ' + money(d.spx, d.sccy) : ''} : ${sgn(d.perf, 1)}.`, ok: d => d && d.type === 'SELL' },
        { k: 'gdepuis', t: 'Depuis l’achat', d: 'Le cours jusqu’à aujourd’hui + performance', dur: 2.6, say: d => `Depuis l'achat : ${sgn(d.perf, 1)}.`, ok: d => d && d.type === 'BUY' },
        { k: 'bilan', t: 'Le bilan', d: 'La performance en grand (facultatif)', dur: 2, say: d => `${sgn(d.perf, 1)} en ${dur(d.days)}${d.divs > 0 ? ', dividendes compris' : ''}.` },
        { k: 'pourquoi', t: 'Pourquoi', d: 'Tes raisons, une par une', dur: 3, say: (d, p) => lines(p.raisons).join(' · ') }, FIN] }
  };
  const FMT_KEYS = Object.keys(FMT);
  const money = (v, ccy) => { if (!isNum(v)) return '—'; const s = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', JPY: '¥', DKK: 'kr', SEK: 'kr', NOK: 'kr', CAD: '$ CA' }[ccy] || ccy || '€'; return fr(v, Math.abs(v) < 100 ? 2 : 0) + ' ' + s; };
  const pot = (d, k) => d && isNum(d.sc[k]) && d.cours ? (d.sc[k] / d.cours - 1) * 100 : null;
  const dl = s => s ? dt(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const ecartJ = d => d && isNum(d.sc.real) && d.sc.real > 0 && isNum(d.cours) ? (d.cours / d.sc.real - 1) * 100 : null;   // cours vs prix juste
  const dur = n => n < 45 ? Math.round(n) + ' jours' : n < 700 ? Math.round(n / 30.4) + ' mois' : fr(n / 365.25, 1) + ' ans';
  const dS = t => new Date(t * 1000).toLocaleDateString('fr-FR');

  let C = THEMES.beige, cfg = null, DATA = null, dataErr = null, dataFor = null, tt = 0, playing = false, raf = 0, LAY = 'bulle';
  let cam = null, camVideo = null, scr = null, scrVideo = null, rec = null, recChunks = [], recording = false, countdown = 0, pubOv = { yt: null, fb: null }, coSugg = [], valoList = null, opsList = null;
  let sx;   // contexte du canvas du short
  const defFx = f => ({ scenes: FMT[f].scenes.map(s => ({ k: s.k, on: true, dur: s.dur })), texts: {}, manual: FMT[f].manual, p: JSON.parse(JSON.stringify(FMT[f].p)) });
  const defCfg = () => ({ fmt: 'hebdo', per: 'w0', layout: 'bulle', theme: 'beige', scenes: SCN_HEBDO.map(s => ({ k: s.k, on: true, dur: s.dur })), texts: {}, manual: false, fx: {} });
  function getCfg(){
    if (!cfg){ cfg = Object.assign(defCfg(), D && D.short && D.short.scenes ? JSON.parse(JSON.stringify(D.short)) : {}); cfg.fx = cfg.fx || {}; cfg.p = cfg.p || {}; if (!FMT[cfg.fmt]) cfg.fmt = 'hebdo';
      SCN_HEBDO.forEach(s => { if (!cfg.scenes.some(z => z.k === s.k)) cfg.scenes.push({ k: s.k, on: true, dur: s.dur }); }); }
    return cfg; }
  // réglages du modèle en cours (le récap hebdo garde sa place historique à la racine)
  function fc(){ const c = getCfg(), f = c.fmt; if (f === 'hebdo') return c;
    if (!c.fx[f]) c.fx[f] = defFx(f); const o = c.fx[f]; o.p = Object.assign(JSON.parse(JSON.stringify(FMT[f].p)), o.p || {}); o.texts = o.texts || {};
    FMT[f].scenes.forEach((s, i) => { if (o.scenes.some(z => z.k === s.k)) return;   // étape ajoutée depuis : insérée à sa place (avant l'étape qui la suit dans le modèle)
      const nx = FMT[f].scenes.slice(i + 1).map(z => o.scenes.findIndex(y => y.k === z.k)).find(j => j >= 0); o.scenes.splice(nx == null ? o.scenes.length : nx, 0, { k: s.k, on: true, dur: s.dur }); }); return o; }
  const F = () => FMT[getCfg().fmt];
  function persist(){ if (D){ D.short = JSON.parse(JSON.stringify(cfg)); markDirty(); } }
  const scn = k => F().scenes.find(s => s.k === k);
  const active = () => { const o = fc(); const a = o.scenes.filter(s => { const d0 = scn(s.k); return d0 && s.on && (!d0.ok || d0.ok(DATA, o.p)); }); return a.length ? a : o.scenes.slice(0, 1); };
  const total = () => active().reduce((a, s) => a + (+s.dur || 3), 0);
  function at(time){ let acc = 0; for (const s of active()){ const d = +s.dur || 3; if (time < acc + d) return { s, p: (time - acc) / d, a: acc, b: acc + d }; acc += d; } const a = active(); const s = a[a.length - 1]; return s ? { s, p: 1, a: acc - (+s.dur || 3), b: acc } : null; }

  /* --- données --- */
  async function loadData(){
    const f = getCfg().fmt, o = fc(); DATA = null; dataErr = null; const sig = f + JSON.stringify(f === 'hebdo' ? getCfg().per : [o.p.co, o.p.yrs, o.p.nom, o.p.op, o.p.gyrs]); dataFor = sig;
    let d = null;
    try { d = await LOAD[f](o.p); } catch(e){ if (dataFor === sig) dataErr = e.message || String(e); return; }
    if (dataFor !== sig) return;
    DATA = d;
    const stk = ['sticker', 'sticker2', 'stickerFin'].map(k => stkUrl(o.p[k])).filter(Boolean);
    await Promise.all(stk.map(u => img(u)).concat([img('data/wolf-tete.png')]));
  }
  const LOAD = {
    async hebdo(){
      const w = await wolf(), E = w.E, t = today(), d0 = dt(t), wd = (d0.getDay() + 6) % 7, mon = addD(t, -wd - (getCfg().per === 'w1' ? 7 : 0));
      const from = addD(mon, -1), to = getCfg().per === 'w1' ? addD(mon, 4) : t;
      const rows = E.periodRows(w.ops, w.S, { from, to, step: 'day' }); if (!rows.length) throw new Error('pas de cours pour cette semaine');
      const week = (() => { const d = dt(mon), j = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); j.setUTCDate(j.getUTCDate() + 4 - (j.getUTCDay() || 7)); const y0 = new Date(Date.UTC(j.getUTCFullYear(), 0, 1)); return Math.ceil(((j - y0) / 864e5 + 1) / 7); })();
      const sorted = E.sortOps(w.ops), first = sorted.length ? sorted[0].date : from;
      const sr = E.periodRows(w.ops, w.S, { from: addD(first, -1), to, step: 'week' }), cr = E.benchRows(sr, w.S, w.cac), xr = E.benchRows(sr, w.S, w.spx, 'FX_IDC:EURUSD');
      let a = 100, b = 100, c = 100; const pts = [[100, 100, 100]].concat(sr.map((r, i) => [a *= 1 + r.r, b *= 1 + ((cr[i] && cr[i].r) || 0), c *= 1 + ((xr[i] && xr[i].r) || 0)]));
      const ops = sorted.filter(o => o.date > from && o.date <= to && (o.type === 'BUY' || o.type === 'SELL'));
      let op = null; const lo = ops[ops.length - 1];
      if (lo){ const s = w.sym(lo.symbol); if (lo.type === 'SELL'){ const before = E.replay(sorted.slice(0, sorted.indexOf(lo))), p = before.pos[lo.symbol];
          const divs = sorted.filter(o => o.type === 'DIV' && o.symbol === lo.symbol && p && o.date >= p.open && o.date <= lo.date).reduce((x2, o) => x2 + (o.eur || 0), 0);
          if (p) op = { type: 'SELL', item: s, nom: s.name, perf: ((lo.eur + divs) / p.cost - 1) * 100, open: p.open, date: lo.date, days: E.daysBetween(p.open, lo.date), all: Math.abs(p.qty - lo.qty) < 1e-6 }; }
        else op = { type: 'BUY', item: s, nom: s.name, date: lo.date, px: lo.px, ccy: lo.ccy }; }
      const stT = E.replay(w.ops, to), held = Object.keys(stT.pos);
      const moves = held.map(sy => { const p1 = E.priceEur(w.S, sy, from), p2 = E.priceEur(w.S, sy, to); return p1 && p2 ? Object.assign(w.sym(sy), { v: (p2 / p1 - 1) * 100 }) : null; }).filter(Boolean).sort((p, q) => q.v - p.v);
      const vals = held.map(sy => { const pe = E.priceEur(w.S, sy, to); return pe ? Object.assign(w.sym(sy), { val: stT.pos[sy].qty * pe }) : null; }).filter(Boolean), tot = vals.reduce((p, q) => p + q.val, 0) + Math.max(0, stT.cash);
      const D2 = { week, from, to, mon, wolf: E.chain(rows) * 100, cac: E.chain(E.benchRows(rows, w.S, w.cac)) * 100, spx: E.chain(E.benchRows(rows, w.S, w.spx, 'FX_IDC:EURUSD')) * 100,
        since: { pts, wolf: pts[pts.length - 1][0] - 100, cac: pts[pts.length - 1][1] - 100, spx: pts[pts.length - 1][2] - 100, first },
        op, top: moves.slice(0, 3), flop: moves.slice(-3).reverse().filter(m => !moves.slice(0, 3).includes(m)),
        compo: vals.map(v => Object.assign(v, { w: v.val / tot * 100 })).sort((p, q) => q.w - p.w), cashW: Math.max(0, stT.cash) / tot * 100 };
      const logos = [D2.op && D2.op.item].concat(D2.top, D2.flop, D2.compo).filter(Boolean);
      await Promise.all(logos.map(it => img(tvLogo(it.logoid))));
      return D2;
    },
    async ecran(p){ return { ok: true }; },
    async explique(p){ if (p.co){ await ensureLogo(p.co); if (p.co.logoid) await img(tvLogo(p.co.logoid)); } return { ok: true }; },
    async chute(p){
      const co = p.co; if (!co || !co.sym) throw new Error('choisis une action (recherche TradingView)');
      await ensureLogo(co); await history(co.sym); if (co.logoid) await img(tvLogo(co.logoid));
      const yrs = p.yrs === 'max' ? 99 : +p.yrs || 2, S = hs(co, yrs); if (S.length < 3) throw new Error('cours indisponibles pour ' + co.sym);
      let im = 0; S.forEach((v, i) => { if (v > S[im]) im = i; }); const max = S[im], last = S[S.length - 1];
      let ccy = 'EUR'; try { const r = await fetch('/api/tv/history?symbols=' + encodeURIComponent(co.sym) + '&from=2000-01-01&adj=1'); const j = await r.json(); ccy = (j.data && j.data[co.sym] && j.data[co.sym].ccy) || 'EUR'; } catch(e){}
      return { co, name: co.name || co.sym, S, im, max, last, drop: (last / max - 1) * 100, weeksAgo: S.length - 1 - im, yrs: Math.min(yrs, availY(co)), ccy };
    },
    async valo(p){
      if (!window.PRIX_UI) throw new Error('« Prix par secteur » n’est pas chargé');
      const list = valoList = await PRIX_UI.pubItems(); if (!list.length) throw new Error('aucune fiche dans « Prix par secteur »');
      const it = list.find(x => x.nom === p.nom) || list.find(x => isNum(x.sc.real) && isNum(x.cours)); if (!it) throw new Error('aucune fiche avec un scénario réaliste et un cours');
      if (!p.nom) p.nom = it.nom;
      const item = { name: it.nom, sym: it.sym || null, logoid: null, logoUrl: it.logo || '' };
      if (item.sym){ await ensureLogo(item); }
      if (item.logoid) await img(tvLogo(item.logoid)); else if (item.logoUrl) await img(item.logoUrl);
      if (!isNum(it.cours)) throw new Error('pas de cours pour ' + it.nom);
      let S = null, Dd = null, gy = 0;
      if (item.sym){ try { await history(item.sym); const yrs = p.gyrs === 'max' ? 99 : +p.gyrs || 2; S = hs(item, yrs).slice(); Dd = histD(item.sym).slice(-S.length); gy = Math.max(1, Math.round(Math.min(yrs, availY(item))));
        const r = S.length ? S[S.length - 1] / it.cours : 1; if (r > 60 && r < 160) S = S.map(v => v / 100); else if (r < 0.5 || r > 2) S = null;   // unité incohérente : pas de graphique faux
        if (S && S.length < 3) S = null; } catch(e){ S = null; } }
      return { nom: it.nom, item, cours: it.cours, ccy: it.devise || 'EUR', sc: it.sc, metric: it.metric, S, Dd, gy, trend: S ? (S[S.length - 1] / S[0] - 1) * 100 : 0 };
    },
    async trans(p){
      const w = await wolf(), E = w.E, sorted = E.sortOps(w.ops);
      opsList = sorted.filter(o => o.type === 'BUY' || o.type === 'SELL').slice().reverse().map(o => ({ id: o.id, label: dl(o.date) + ' · ' + (o.type === 'SELL' ? 'Vente' : 'Achat') + ' · ' + w.sym(o.symbol).name }));
      const o = sorted.find(z => z.id === p.op) || sorted.slice().reverse().find(z => z.type === 'SELL' || z.type === 'BUY'); if (!o) throw new Error('aucune opération dans le Wolf Portfolio');
      if (!p.op) p.op = o.id;
      const s = w.sym(o.symbol); if (s.logoid) await img(tvLogo(s.logoid));
      const before = E.replay(sorted.slice(0, sorted.indexOf(o))), pos = before.pos[o.symbol];
      // cours hebdo TradingView : un peu avant l'achat jusqu'à aujourd'hui (on voit aussi ce qu'il s'est passé après une vente)
      const chartFor = async (from, mark) => { try { await history(o.symbol); } catch(e){ return null; } const C0 = histNow(o.symbol), D0 = histD(o.symbol); if (C0.length < 3) return null;
        const t0 = Date.parse(from) / 1000, t1 = Date.now() / 1000, a = t0 - Math.max(56 * 86400, (t1 - t0) * 0.3); let i0 = D0.findIndex(t => t >= a); if (i0 < 0) return null; i0 = Math.max(0, i0 - 1);
        const S = C0.slice(i0), Dd = D0.slice(i0), idx = ds => { const tt = Date.parse(ds) / 1000; const k = Dd.findIndex(t => t >= tt); return k < 0 ? Dd.length - 1 : k; };
        return S.length >= 3 ? { S, Dd, ib: idx(from), is: mark ? idx(mark) : S.length - 1 } : null; };
      if (o.type === 'SELL'){ if (!pos) throw new Error('position introuvable avant la vente');
        const divs = sorted.filter(z => z.type === 'DIV' && z.symbol === o.symbol && z.date >= pos.open && z.date <= o.date).reduce((a, z) => a + (z.eur || 0), 0);
        const ob = sorted.find(z => (z.type === 'BUY' || z.type === 'INIT') && z.symbol === o.symbol && z.date >= pos.open);
        return { type: 'SELL', item: s, name: s.name, buyDate: pos.open, buyPx: pos.cost / pos.qty, sellDate: o.date, sellPx: o.eur / o.qty, divs,
          bpx: ob && isNum(ob.px) ? ob.px : null, bccy: (ob && ob.ccy) || 'EUR', spx: isNum(o.px) ? o.px : null, sccy: o.ccy || 'EUR', chart: await chartFor(pos.open, o.date),
          perf: ((o.eur / o.qty * Math.min(o.qty, pos.qty) + divs * Math.min(1, o.qty / pos.qty)) / (pos.cost * Math.min(1, o.qty / pos.qty)) - 1) * 100, days: E.daysBetween(pos.open, o.date), all: Math.abs(pos.qty - o.qty) < 1e-6 }; }
      const buyPx = Math.abs(o.eur) / o.qty, now = E.priceEur(w.S, o.symbol, today());
      return { type: 'BUY', item: s, name: s.name, buyDate: o.date, buyPx, nowPx: now, perf: now ? (now / buyPx - 1) * 100 : null, days: E.daysBetween(o.date, today()), divs: 0,
        bpx: isNum(o.px) ? o.px : null, bccy: o.ccy || 'EUR', chart: await chartFor(o.date, null) };
    }
  };

  /* --- dessin (1080×1920) --- */
  const clamp = v => Math.max(0, Math.min(1, v)), segp = (p, a, b) => clamp((p - a) / (b - a)), ease = q => 1 - Math.pow(1 - q, 3), back = q => { const c = 1.6; return 1 + (c + 1) * Math.pow(q - 1, 3) + c * Math.pow(q - 1, 2); };
  function R2(X, Yy, w, h, r){ sx.beginPath(); sx.moveTo(X + r, Yy); sx.arcTo(X + w, Yy, X + w, Yy + h, r); sx.arcTo(X + w, Yy + h, X, Yy + h, r); sx.arcTo(X, Yy + h, X, Yy, r); sx.arcTo(X, Yy, X + w, Yy, r); sx.closePath(); }
  function T2(s, X, Yy, size, color, align = 'center', font = AF, w = 400){ sx.font = `${w} ${size}px ${font}`; sx.fillStyle = color; sx.textAlign = align; sx.textBaseline = 'alphabetic'; sx.fillText(s, X, Yy); }
  function fit2(s, size, max, font = AF, w = 400){ sx.font = `${w} ${size}px ${font}`; let z = size; while (sx.measureText(s).width > max && z > 10){ z -= 2; sx.font = `${w} ${z}px ${font}`; } return z; }
  function hl2(s, cx, cy, size){ s = up(s); size = fit2(s, size, 960); sx.font = `400 ${size}px ${AF}`; const w = sx.measureText(s).width + size * 0.5, h = size * 1.18; R2(cx - w / 2, cy - h * 0.78, w, h, size * 0.14); sx.fillStyle = C.hlBg; sx.fill(); T2(s, cx, cy + size * 0.08, size, C.hlInk); }
  function wrap(s, maxW, size, font = BF, w = 700){ sx.font = `${w} ${size}px ${font}`; const out = []; let cur = ''; String(s || '').split(/\s+/).filter(Boolean).forEach(wd => { const t = cur ? cur + ' ' + wd : wd; if (sx.measureText(t).width > maxW && cur){ out.push(cur); cur = wd; } else cur = t; }); if (cur) out.push(cur); return out; }
  function para(s, X, Yy, maxW, size, color, align = 'center', font = BF, w = 700, lh = 1.24){ const L = wrap(s, maxW, size, font, w); L.forEach((l, i) => T2(l, X, Yy + i * size * lh, size, color, align, font, w)); return L.length * size * lh; }
  // titre Anton en capitales, sur 1 à 3 lignes, taille réduite jusqu'à tenir
  function title(s, cx, y, size, maxLines = 3, color = C.ink){ s = up(s); let z = size, L = wrap(s, 980, z, AF, 400); while (L.length > maxLines && z > 40){ z -= 6; L = wrap(s, 980, z, AF, 400); } L.forEach((l, i) => T2(l, cx, y + i * z * 1.05, z, color)); return L.length * z * 1.05; }
  function logo2(it, cx, cy, r, ring){ sx.save(); sx.beginPath(); sx.arc(cx, cy, r, 0, 7); sx.closePath();
    if (it === 'CASH'){ sx.fillStyle = C.track; sx.fill(); T2('€', cx, cy + r * 0.36, r * 1.05, C.ink, 'center', BF, 800); }
    else if (it === 'WOLF'){ sx.fillStyle = '#1C1813'; sx.fill(); sx.clip(); const im = imgNow('data/wolf-tete.png'); if (im) sx.drawImage(im, cx - r * 0.82, cy - r * 0.82, r * 1.64, r * 1.64); }
    else if (it === 'CAC' || it === 'SPX'){ sx.fillStyle = C.track; sx.fill(); T2(it === 'CAC' ? 'CAC' : 'S&P', cx, cy + r * 0.22, r * 0.62, C.ink, 'center', BF, 800); }
    else { sx.fillStyle = '#fff'; sx.fill(); sx.clip(); const im = imgNow(it && it.logoid ? tvLogo(it.logoid) : (it && it.logoUrl) || ''); if (im){ const k2 = it.logoid ? 1 : 0.8; sx.drawImage(im, cx - r * k2, cy - r * k2, 2 * r * k2, 2 * r * k2); } else T2(up((it && it.name) || '?').slice(0, 1), cx, cy + r * 0.35, r, '#333', 'center', AF); }
    sx.restore(); if (ring){ sx.beginPath(); sx.arc(cx, cy, r + 5, 0, 7); sx.strokeStyle = C.gold; sx.lineWidth = 5; sx.stroke(); } }
  // sticker animé : « pop » à l'entrée, puis flotte (ou tremble pour la panique) ; figé quand l'écran est figé (le temps tt ne bouge plus)
  function stk(k, cx, cy, size, p, mode){ const u = stkUrl(k); if (!u) return; const im = imgNow(u); if (!im){ if (!IMGC[u]) img(u); return; }
    mode = mode || (/panique|choque|decourage|triste|facepalm/.test(k) ? 'shake' : 'float');
    const b = back(segp(p, 0, 0.35)); if (b <= 0) return; const rot = mode === 'shake' ? Math.sin(tt * 22) * 0.09 : Math.sin(tt * 1.7) * 0.04, dy = mode === 'shake' ? 0 : Math.sin(tt * 2.3) * 12;
    const r = im.width / im.height, w = r >= 1 ? size : size * r, h = r >= 1 ? size / r : size;
    sx.save(); sx.translate(cx, cy + dy); sx.rotate(rot); sx.scale(b, b); sx.drawImage(im, -w / 2, -h / 2, w, h); sx.restore(); }
  const col = v => v >= 0 ? C.green : C.red;
  function region(){ if (LAY === 'split') return { x: 0, y: 720, w: 1080, h: 860, k: 0.78 }; if (LAY === 'bulle') return { x: 0, y: 110, w: 1080, h: 1170, k: 1 }; return { x: 0, y: 150, w: 1080, h: 1330, k: 1.05 }; }
  function camDraw(X, Yy, w, h, round, rad){
    sx.save(); sx.beginPath(); if (round) sx.arc(X + w / 2, Yy + h / 2, w / 2, 0, 7); else if (rad) R2(X, Yy, w, h, rad); else sx.rect(X, Yy, w, h); sx.clip();
    if (camVideo && camVideo.readyState >= 2){ const vw = camVideo.videoWidth, vh = camVideo.videoHeight, k = Math.max(w / vw, h / vh); sx.translate(X + w / 2, Yy + h / 2); sx.scale(-1, 1); sx.drawImage(camVideo, -vw * k / 2, -vh * k / 2, vw * k, vh * k); }
    else { const g = sx.createLinearGradient(0, Yy, 0, Yy + h); g.addColorStop(0, C.cam1); g.addColorStop(1, C.cam2); sx.fillStyle = g; sx.fillRect(X, Yy, w, h); T2('WEBCAM', X + w / 2, Yy + h / 2 + 12, round ? 30 : 40, 'rgba(255,255,255,.5)', 'center', BF, 800); }
    sx.restore(); }
  function screenDraw(X, Yy, w, h){
    sx.save(); R2(X, Yy, w, h, 22); sx.clip(); sx.fillStyle = '#0b0c0e'; sx.fillRect(X, Yy, w, h);
    if (scrVideo && scrVideo.readyState >= 2){ const p = fc().p, z = Math.max(1, +p.zoom || 1), vw = scrVideo.videoWidth, vh = scrVideo.videoHeight;
      const sw = vw / z, sh = vh / z, fx = { c: 0.5, hg: 0, hd: 1, bg: 0, bd: 1, h: 0.5, b: 0.5, g: 0, d: 1 }[p.focus] ?? 0.5, fy = { c: 0.5, hg: 0, hd: 0, bg: 1, bd: 1, h: 0, b: 1, g: 0.5, d: 0.5 }[p.focus] ?? 0.5;
      const sxx = (vw - sw) * fx, syy = (vh - sh) * fy, k = Math.min(w / sw, h / sh), dw = sw * k, dh = sh * k; sx.drawImage(scrVideo, sxx, syy, sw, sh, X + (w - dw) / 2, Yy + (h - dh) / 2, dw, dh); }
    else { T2('TON ECRAN', X + w / 2, Yy + h / 2, 70, 'rgba(255,255,255,.35)'); T2('Bouton « Partager un écran » dans les réglages', X + w / 2, Yy + h / 2 + 60, 30, 'rgba(255,255,255,.35)', 'center', BF, 700); }
    sx.restore(); sx.lineWidth = 5; sx.strokeStyle = C.gold; R2(X, Yy, w, h, 22); sx.stroke(); }
  function cards(list, y0, maxH, p, Rg, opts = {}){   // liste de cartes révélées une à une
    const k = Rg.k, n = list.length; if (!n) return; let size = opts.size || 60 * k, H, Ls;
    for (;;){ Ls = list.map(s => wrap(s, 780, size)); H = Ls.reduce((a, L) => a + Math.max(1, L.length) * size * 1.24 + 44, 0) + (n - 1) * 18; if (H <= maxH || size < 26) break; size -= 3; }
    let y = y0; Ls.forEach((L, i) => { const h = Math.max(1, L.length) * size * 1.24 + 44, a = opts.reveal ? opts.reveal(i) : ease(segp(p, 0.1 + i * 0.22, 0.35 + i * 0.22)), cur = opts.cur === i;
      sx.save(); sx.globalAlpha *= (opts.dimOld && !cur ? 0.55 : 1) * a; sx.translate((1 - a) * 90, 0); sx.fillStyle = cur ? C.hlBg : C.card; R2(60, y, 960, h, 26); sx.fill();
      sx.beginPath(); sx.arc(124, y + h / 2, 34, 0, 7); sx.fillStyle = cur ? C.hlInk : C.gold; sx.fill(); T2(String(i + 1), 124, y + h / 2 + 15, 42, cur ? C.hlBg : '#fff', 'center', AF);
      L.forEach((l, j) => T2(l, 186, y + 22 + size * 0.92 + j * size * 1.24, size, cur ? C.hlInk : C.ink, 'left', BF, 700)); sx.restore(); y += h + 18; }); }

  // graphique de cours commun aux shorts Valorisation et Achat/Vente
  function pxFrame(S, Dd, box, extra){ const n = S.length, all = S.concat((extra || []).filter(isNum)), mn = Math.min(...all), mx = Math.max(...all), pad = (mx - mn) * 0.08 || 1, lo = mn - pad, hi = mx + pad;
    const px = i => box.x + box.w * i / Math.max(1, n - 1), py = v => box.y + box.h - box.h * (v - lo) / (hi - lo);
    sx.fillStyle = C.card; R2(box.x - 28, box.y - 36, box.w + 56, box.h + 100, 30); sx.fill();
    if (Dd && Dd.length){ T2(dS(Dd[0]), box.x, box.y + box.h + 50, 30, C.dim, 'left', BF, 700); T2(dS(Dd[n - 1]), box.x + box.w, box.y + box.h + 50, 30, C.dim, 'right', BF, 700); }
    return { n, px, py,
      curve(a, color, lw, from, to){ const i0 = from || 0, i1 = Math.min(to == null ? n - 1 : to, i0 + Math.max(1, Math.floor(a * ((to == null ? n - 1 : to) - i0)))); sx.strokeStyle = color; sx.lineWidth = lw; sx.lineJoin = 'round'; sx.lineCap = 'round'; sx.beginPath(); for (let i = i0; i <= i1; i++) i === i0 ? sx.moveTo(px(i), py(S[i])) : sx.lineTo(px(i), py(S[i])); sx.stroke(); return i1; } }; }
  function chipD(t0, X, Yy, size, bg, fg, align){ sx.font = `800 ${size}px ${BF}`; const w = sx.measureText(t0).width + size * 0.9, h = size * 1.5, L = align === 'right' ? X - w : align === 'center' ? X - w / 2 : X;
    R2(L, Yy - h / 2, w, h, h * 0.28); sx.fillStyle = bg; sx.fill(); T2(t0, L + size * 0.45, Yy + size * 0.36, size, fg, 'left', BF, 800); return { L, w, h }; }
  function drawHebdo(s, p, Rg){
    const d = DATA, k = Rg.k, Yf = f => Rg.y + Rg.h * f, cx = 540;
    if (s.k === 'hook'){ T2('WOLF PORTFOLIO', cx, Yf(0.15), 110 * k, C.ink); hl2('SEMAINE ' + d.week, cx, Yf(0.26), 78 * k); T2('CETTE SEMAINE', cx, Yf(0.355), 44 * k, C.dim, 'center', BF, 800);
      const v = d.wolf * ease(segp(p, 0.12, 0.55)); T2(sgn(v, 1), cx, Yf(0.6), fit2(sgn(v, 1), 290 * k, 960), col(d.wolf));
      sx.globalAlpha *= ease(segp(p, 0.5, 0.7)); T2('CAC 40 : ' + sgn(d.cac, 1) + '   ·   S&P 500 : ' + sgn(d.spx, 1), cx, Yf(0.74), 40 * k, C.ink2, 'center', BF, 700); }
    if (s.k === 'duel'){ T2('LA SEMAINE', cx, Yf(0.12), 96 * k, C.ink); hl2('WOLF VS INDICES', cx, Yf(0.22), 60 * k);
      const rows = [['WOLF', 'Wolf Portfolio', d.wolf], ['CAC', 'CAC 40', d.cac], ['SPX', 'S&P 500 (en €)', d.spx]], max = Math.max(...rows.map(r => Math.abs(r[2])), 0.1) * 1.05, axis = 380, span = 620;
      rows.forEach((r, i) => { const yy = Yf(0.38 + i * 0.18), a = ease(segp(p, 0.12 + i * 0.12, 0.55 + i * 0.12)); logo2(r[0], 130, yy, 58 * k, r[0] === 'WOLF');
        T2(r[1], 210, yy - 30 * k, 36 * k, C.ink2, 'left', BF, 700); T2(sgn(r[2] * a, 1), 1000, yy - 24 * k, 64 * k, col(r[2]), 'right');
        sx.fillStyle = C.track; R2(210, yy - 6 * k, 790, 44 * k, 22 * k); sx.fill(); const w = Math.max(6, (span - 30) * Math.abs(r[2]) / max * a), xs = r[2] >= 0 ? axis : axis - w;
        sx.fillStyle = col(r[2]); R2(xs, yy - 6 * k, w, 44 * k, 22 * k); sx.fill(); sx.fillStyle = C.ink; sx.fillRect(axis - 2, yy - 14 * k, 4, 60 * k); }); }
    if (s.k === 'since'){ T2('DEPUIS LE DEBUT', cx, Yf(0.11), 96 * k, C.ink); hl2(sgn(d.since.wolf, 1), cx, Yf(0.215), 78 * k); T2('base 100', cx, Yf(0.29), 32 * k, C.dim, 'center', BF, 700);
      const P = d.since.pts, L = 100, Rr = 790, top = Yf(0.36), bot = Yf(0.8), all = P.flat(), mn = Math.min(...all) - 1, mx = Math.max(...all) + 1;
      const px = i => L + (Rr - L) * i / Math.max(1, P.length - 1), py = v => bot - (bot - top) * (v - mn) / (mx - mn);
      sx.strokeStyle = C.track; sx.lineWidth = 2; sx.setLineDash([8, 10]); sx.beginPath(); sx.moveTo(L, py(100)); sx.lineTo(Rr, py(100)); sx.stroke(); sx.setLineDash([]);
      const a = ease(segp(p, 0.08, 0.8)), n = Math.max(1, Math.floor(a * (P.length - 1)));
      const series = [[2, C.line3, 5, 'S&P 500', d.since.spx], [1, C.line2, 5, 'CAC 40', d.since.cac], [0, C.gold, 11, 'Wolf', d.since.wolf]];
      series.forEach(([c, color, lw]) => { sx.strokeStyle = color; sx.lineWidth = lw; sx.lineJoin = 'round'; sx.lineCap = 'round'; sx.beginPath(); for (let i = 0; i <= n; i++){ const v = P[i][c]; i ? sx.lineTo(px(i), py(v)) : sx.moveTo(px(i), py(v)); } sx.stroke(); });
      sx.globalAlpha *= ease(segp(p, 0.75, 0.9));
      const ends = series.map(s0 => ({ y: py(P[P.length - 1][s0[0]]), s: s0 })).sort((a2, b2) => a2.y - b2.y); for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 84 * k) ends[i].y = ends[i - 1].y + 84 * k;
      ends.forEach(e => { sx.fillStyle = e.s[1]; sx.beginPath(); sx.arc(Rr, py(P[P.length - 1][e.s[0]]), e.s[2] + 4, 0, 7); sx.fill(); T2(e.s[3], Rr + 22, e.y - 4, 26 * k, C.dim, 'left', BF, 700); T2(sgn(e.s[4], 1), Rr + 22, e.y + 30, 36 * k, e.s[1] === C.gold ? C.gold : C.ink2, 'left'); }); }
    if (s.k === 'op' && d.op){ const o = d.op; T2("L'OPERATION", cx, Yf(0.11), 96 * k, C.ink); hl2('DE LA SEMAINE', cx, Yf(0.21), 60 * k);
      const b = back(segp(p, 0.05, 0.4)); sx.save(); sx.translate(cx, Yf(0.385)); sx.scale(b, b); logo2(o.item, 0, 0, 110 * k, true); sx.restore();
      sx.globalAlpha *= ease(segp(p, 0.2, 0.4)); T2(up(o.nom), cx, Yf(0.56), fit2(up(o.nom), 76 * k, 940), C.ink);
      const lab = o.type === 'SELL' ? (o.all ? 'VENTE TOTALE' : 'VENTE') : 'ACHAT'; sx.font = `800 ${34 * k}px ${BF}`; const tw = sx.measureText(lab).width + 44; R2(cx - tw / 2, Yf(0.595), tw, 58 * k, 29 * k); sx.fillStyle = o.type === 'SELL' ? C.red : C.green; sx.fill(); T2(lab, cx, Yf(0.595) + 40 * k, 34 * k, '#fff', 'center', BF, 800);
      if (o.type === 'SELL'){ const v = o.perf * ease(segp(p, 0.35, 0.75)); T2(sgn(v, 1), cx, Yf(0.82), 190 * k, col(o.perf)); T2('dividendes compris · ' + (o.days < 45 ? Math.round(o.days) + ' jours' : Math.round(o.days / 30.4) + ' mois'), cx, Yf(0.885), 34 * k, C.ink2, 'center', BF, 700); }
      else T2('le ' + dt(o.date).toLocaleDateString('fr-FR'), cx, Yf(0.8), 60 * k, C.ink2, 'center', BF, 800); }
    if (s.k === 'topflop'){ T2('TOP & FLOP', cx, Yf(0.11), 104 * k, C.ink); hl2('DE LA SEMAINE', cx, Yf(0.21), 60 * k);
      const top0 = Yf(0.29), lab = 56 * k, gap = 26 * k, step = Math.min(100 * k, (Rg.h * 0.69 - 2 * lab - gap) / 6), rh = step * 0.86;
      const block = (list, y0, label, c, off) => { T2(label, 90, y0 + lab * 0.7, 40 * k, c, 'left'); list.forEach((r, i) => { const a = ease(segp(p, 0.12 + i * 0.08 + off, 0.4 + i * 0.08 + off)), yy = y0 + lab + i * step;
        sx.save(); sx.globalAlpha *= a; sx.translate((1 - a) * -80, 0); sx.fillStyle = C.card; R2(80, yy, 920, rh, rh / 2); sx.fill(); logo2(r, 80 + rh / 2, yy + rh / 2, rh * 0.4);
        T2(r.name, 80 + rh + 14 * k, yy + rh * 0.62, fit2(r.name, 38 * k, 560, BF, 700), C.ink, 'left', BF, 700); T2(sgn(r.v, 1), 980, yy + rh * 0.7, 54 * k, col(r.v), 'right'); sx.restore(); }); };
      block(d.top, top0, '▲ TOP', C.green, 0); if (d.flop.length) block(d.flop, top0 + lab + 3 * step + gap, '▼ FLOP', C.red, 0.25); }
    if (s.k === 'compo'){ T2('COMPOSITION', cx, Yf(0.11), 100 * k, C.ink); hl2('DU WOLF', cx, Yf(0.21), 60 * k);
      const cy = Yf(0.53), r0 = 225 * k, r1 = 140 * k, a = ease(segp(p, 0.05, 0.6)), cols = ['#C98516', '#4A86C5', '#1B9660', '#B06BD0', '#E07A3A', '#3AA7B8', '#CF3E48', '#8F7A5A', '#6E7F96'];
      let ang = -Math.PI / 2; const parts = d.compo.map(c2 => [c2, c2.w]).concat(d.cashW > 0.5 ? [['CASH', d.cashW]] : []);
      parts.forEach(([it, v], i) => { const sw = 2 * Math.PI * v / 100 * a; sx.beginPath(); sx.arc(cx, cy, r0, ang, ang + sw); sx.arc(cx, cy, r1, ang + sw, ang, true); sx.closePath(); sx.fillStyle = it === 'CASH' ? C.track : cols[i % cols.length]; sx.fill(); sx.strokeStyle = C.bg; sx.lineWidth = 4; sx.stroke();
        if (a > 0.95 && v >= 5){ const m = ang + sw / 2, la = ease(segp(p, 0.55 + i * 0.03, 0.7 + i * 0.03)); sx.save(); sx.globalAlpha *= la; logo2(it, cx + Math.cos(m) * (r0 + 72 * k), cy + Math.sin(m) * (r0 + 72 * k), 46 * k); sx.restore(); } ang += sw; });
      const b = back(segp(p, 0.4, 0.65)), im = imgNow('data/wolf-tete.png'); if (im){ sx.save(); sx.translate(cx, cy); sx.scale(b, b); sx.drawImage(im, -100 * k, -100 * k, 200 * k, 200 * k); sx.restore(); }
      sx.globalAlpha *= ease(segp(p, 0.7, 0.85)); T2(fr(d.cashW) + ' % EN LIQUIDITES', cx, Yf(0.915), 58 * k, C.ink); T2(d.compo.length + ' lignes en portefeuille', cx, Yf(0.965), 32 * k, C.dim, 'center', BF, 700); }
    if (s.k === 'end'){ const im = imgNow('data/wolf-tete.png'); if (im){ const b = back(segp(p, 0, 0.35)); sx.save(); sx.translate(cx, Yf(0.28)); sx.scale(b, b); sx.drawImage(im, -170 * k, -170 * k, 340 * k, 340 * k); sx.restore(); }
      sx.globalAlpha *= ease(segp(p, 0.2, 0.45)); T2('ANALYSE COMPLETE', cx, Yf(0.58), 104 * k, C.ink); hl2('CE SAMEDI', cx, Yf(0.69), 84 * k); T2('Abonne-toi pour la semaine ' + (d.week + 1), cx, Yf(0.81), 40 * k, C.ink2, 'center', BF, 700); }
  }
  function drawFin(p, Rg, pp){ const k = Rg.k, Yf = f => Rg.y + Rg.h * f, im = imgNow('data/wolf-tete.png');
    if (im){ const b = back(segp(p, 0, 0.35)); sx.save(); sx.translate(540, Yf(0.27)); sx.scale(b, b); sx.drawImage(im, -160 * k, -160 * k, 320 * k, 320 * k); sx.restore(); }
    sx.globalAlpha *= ease(segp(p, 0.2, 0.45)); T2('ABONNE-TOI', 540, Yf(0.56), 120 * k, C.ink); hl2(pp.fin || 'Pour la suite', 540, Yf(0.67), 70 * k); T2('Wolf Academy Invest', 540, Yf(0.78), 40 * k, C.ink2, 'center', BF, 700); }
  // le dessin des autres modèles : chaque scène a sa mise en page, l'entrée est animée sur la durée de la scène
  function drawFmt(f, s, p, Rg){
    const d = DATA, pp = fc().p, k = Rg.k, Yf = q => Rg.y + Rg.h * q, cx = 540;
    if (s.k === 'fin') return drawFin(p, Rg, pp);
    if (f === 'ecran' && s.k === 'titre'){ title(pp.titre, cx, Yf(0.18), 130 * k, 3); sx.save(); sx.globalAlpha *= ease(segp(p, 0.2, 0.45)); if (pp.sous) hl2(pp.sous, cx, Yf(0.47), 70 * k); sx.restore(); stk(pp.sticker, cx, Yf(0.75), 380 * k, segp(p, 0.3, 1)); }
    if (f === 'explique'){
      const pts = lines(pp.points);
      if (s.k === 'titre'){ let y = Yf(0.12); if (pp.co){ const b = back(segp(p, 0, 0.35)); sx.save(); sx.translate(cx, y); sx.scale(b, b); logo2(pp.co, 0, 0, 80 * k, true); sx.restore(); y += 150 * k; }
        const h = title(pp.titre, cx, y, 120 * k, 3); sx.save(); sx.globalAlpha *= ease(segp(p, 0.25, 0.5)); if (pp.sous) hl2(pp.sous, cx, y + h + 30 * k, 64 * k); sx.restore(); stk(pp.sticker, cx, Yf(0.76), 380 * k, segp(p, 0.35, 1)); }
      else { const i = +s.k.slice(1) - 1; T2(up(pp.titre).slice(0, 60), cx, Yf(0.07), fit2(up(pp.titre).slice(0, 60), 64 * k, 960), C.ink);
        cards(pts.slice(0, i + 1), Yf(0.12), Rg.h * 0.78, p, Rg, { cur: i, dimOld: true, reveal: j => j < i ? 1 : ease(segp(p, 0, 0.5)) }); } }
    if (f === 'chute'){
      const co = d.co, dropTxt = sgn(d.drop * (s.k === 'hook' ? ease(segp(p, 0.15, 0.7)) : 1), 0);
      if (s.k === 'hook'){ const b = back(segp(p, 0, 0.3)); sx.save(); sx.translate(cx, Yf(0.1)); sx.scale(b, b); logo2(co, 0, 0, 78 * k, true); sx.restore();
        T2(up(d.name), cx, Yf(0.27), fit2(up(d.name), 84 * k, 960), C.ink); T2(dropTxt, cx, Yf(0.5), fit2(dropTxt, 300 * k, 980), C.red);
        sx.save(); sx.globalAlpha *= ease(segp(p, 0.55, 0.75)); hl2('depuis son plus haut', cx, Yf(0.56), 58 * k); sx.restore(); stk(pp.sticker, cx, Yf(0.8), 360 * k, segp(p, 0.4, 1)); }
      if (s.k === 'graph'){ logo2(co, 130, Yf(0.07), 54 * k); T2(up(d.name), 205, Yf(0.07) + 22 * k, fit2(up(d.name), 64 * k, 560), C.ink, 'left'); T2(sgn(d.drop, 0), 1000, Yf(0.07) + 24 * k, 72 * k, C.red, 'right');
        const S = d.S, n = S.length, X0 = 70, W = 940, top = Yf(0.2), bot = Yf(0.8), mn = Math.min(...S) * 0.96, mx = Math.max(...S) * 1.03, px = i => X0 + W * i / (n - 1), py = v => bot - (bot - top) * (v - mn) / (mx - mn);
        const a = ease(segp(p, 0, 0.75)), m = Math.max(1, Math.floor(a * (n - 1)));
        sx.fillStyle = C.card; R2(40, top - 40, 1000, bot - top + 80, 26); sx.fill();
        sx.strokeStyle = C.ink; sx.lineWidth = 7; sx.lineJoin = 'round'; sx.beginPath(); for (let i = 0; i <= Math.min(m, d.im); i++) i ? sx.lineTo(px(i), py(S[i])) : sx.moveTo(px(i), py(S[i])); sx.stroke();
        if (m > d.im){ sx.strokeStyle = C.red; sx.lineWidth = 10; sx.beginPath(); for (let i = d.im; i <= m; i++) i === d.im ? sx.moveTo(px(i), py(S[i])) : sx.lineTo(px(i), py(S[i])); sx.stroke(); }
        if (m >= d.im){ sx.setLineDash([14, 12]); sx.lineWidth = 4; sx.strokeStyle = C.red; sx.beginPath(); sx.moveTo(px(d.im), py(d.max)); sx.lineTo(px(n - 1), py(d.max)); sx.stroke(); sx.setLineDash([]);
          sx.fillStyle = C.ink; sx.beginPath(); sx.arc(px(d.im), py(d.max), 13, 0, 7); sx.fill(); T2('PLUS HAUT ' + money(d.max, d.ccy), Math.min(px(d.im), 760), py(d.max) - 26, 38 * k, C.ink, 'center', BF, 800); }
        if (a > 0.98){ sx.fillStyle = C.red; sx.beginPath(); sx.arc(px(n - 1), py(d.last), 15, 0, 7); sx.fill(); T2(money(d.last, d.ccy), px(n - 1) - 20, py(d.last) + 62, 46 * k, C.red, 'right', BF, 800); }
        T2((d.yrs >= 1 ? 'sur ' + Math.round(d.yrs) + ' an' + (Math.round(d.yrs) > 1 ? 's' : '') : 'sur 1 an') + ' · cours TradingView', cx, Yf(0.88), 32 * k, C.dim, 'center', BF, 700); }
      if (s.k === 'raisons'){ T2('POURQUOI', cx, Yf(0.09), 120 * k, C.ink); hl2('CA CHUTE ?', cx, Yf(0.19), 70 * k); cards(lines(pp.raisons), Yf(0.27), Rg.h * 0.66, p, Rg); }
      if (s.k === 'question'){ logo2(co, cx, Yf(0.1), 70 * k, true); title(pp.question, cx, Yf(0.25), 120 * k, 2); stk(pp.sticker2, cx, Yf(0.56), 360 * k, segp(p, 0.15, 1));
        sx.save(); sx.globalAlpha *= ease(segp(p, 0.45, 0.7)); if (pp.verdict) hl2(pp.verdict, cx, Yf(0.83), 60 * k); sx.restore(); } }
    if (f === 'valo'){
      const it = d.item;
      if (d.S && ['gcours', 'pess', 'real', 'opt', 'verdict'].includes(s.k)){ drawValoChart(d, s.k, p, Rg, pp); return; }
      if (s.k === 'graph' && d.S){   // le cours, puis chaque scénario devient une ligne horizontale, puis la zone d'achat
        logo2(it, 120, Yf(0.06), 52 * k); T2(up(d.nom), 190, Yf(0.06) + 20 * k, fit2(up(d.nom), 60 * k, 820), C.ink, 'left'); hl2('Sur le graphique', cx, Yf(0.155), 60 * k);
        const S = d.S, n = S.length, order = ['pess', 'real', 'opt'], lab = { pess: 'PESSIMISTE', real: 'REALISTE', opt: 'OPTIMISTE' }, cc = { pess: C.red, real: C.line3, opt: C.green };
        const buy = isNum(d.sc.real) ? d.sc.real * 0.8 : null, vals = S.concat(order.map(z => d.sc[z]).filter(isNum)).concat(isNum(buy) ? [buy] : []);
        const mn = Math.min(...vals) * 0.94, mx = Math.max(...vals) * 1.05, X0 = 60, W = 700, top = Yf(0.22), bot = Yf(0.9), px = i => X0 + W * i / (n - 1), py = v => bot - (bot - top) * (v - mn) / (mx - mn);
        sx.fillStyle = C.card; R2(30, top - 30, 1020, bot - top + 60, 26); sx.fill();
        const zoneA = ease(segp(p, 0.8, 0.95));   // zone d'achat : sous 80 % du prix juste réaliste
        if (isNum(buy) && zoneA > 0){ sx.save(); sx.globalAlpha *= 0.22 * zoneA; sx.fillStyle = C.green; sx.fillRect(X0, py(buy), W, bot - py(buy)); sx.restore();
          sx.save(); sx.globalAlpha *= zoneA; T2('ZONE D’ACHAT < ' + money(buy, d.ccy), X0 + 16, Math.min(bot - 14, py(buy) + 40 * k), 30 * k, C.green, 'left', BF, 800); sx.restore(); }
        const a = ease(segp(p, 0, 0.3)), m = Math.max(1, Math.floor(a * (n - 1)));
        sx.strokeStyle = C.ink; sx.lineWidth = 6; sx.lineJoin = 'round'; sx.beginPath(); for (let i = 0; i <= m; i++) i ? sx.lineTo(px(i), py(S[i])) : sx.moveTo(px(i), py(S[i])); sx.stroke();
        if (a > 0.98){ sx.fillStyle = C.ink; sx.beginPath(); sx.arc(px(n - 1), py(S[n - 1]), 12, 0, 7); sx.fill(); }
        const tags = [{ z: 'cours', v: d.cours, a: a > 0.98 ? 1 : 0 }].concat(order.filter(z => isNum(d.sc[z])).map((z, i) => ({ z, v: d.sc[z], a: ease(segp(p, 0.3 + i * 0.16, 0.42 + i * 0.16)) })));
        tags.forEach(t0 => { if (t0.z === 'cours' || t0.a <= 0) return; const yy = py(t0.v); sx.save(); sx.globalAlpha *= t0.a; sx.setLineDash([16, 12]); sx.strokeStyle = cc[t0.z]; sx.lineWidth = 5; sx.beginPath(); sx.moveTo(X0, yy); sx.lineTo(X0 + W * t0.a, yy); sx.stroke(); sx.setLineDash([]); sx.restore(); });
        const shown = tags.filter(t0 => t0.a > 0).map(t0 => Object.assign({ y: py(t0.v) }, t0)).sort((a2, b2) => a2.y - b2.y);
        for (let i = 1; i < shown.length; i++) if (shown[i].y - shown[i - 1].y < 74 * k) shown[i].y = shown[i - 1].y + 74 * k;
        shown.forEach(t0 => { const cl = t0.z === 'cours' ? C.ink : cc[t0.z]; sx.save(); sx.globalAlpha *= t0.a; sx.fillStyle = cl; R2(X0 + W + 14, t0.y - 32 * k, 270, 64 * k, 32 * k); sx.fill();
          T2(t0.z === 'cours' ? 'COURS' : lab[t0.z], X0 + W + 30, t0.y - 4 * k, 22 * k, t0.z === 'cours' ? C.bg : '#fff', 'left', BF, 800);
          T2(money(t0.v, d.ccy), X0 + W + 30, t0.y + 24 * k, 28 * k, t0.z === 'cours' ? C.bg : '#fff', 'left', BF, 800);
          if (t0.z !== 'cours' && isNum(pot(d, t0.z))) T2(sgn(pot(d, t0.z)), X0 + W + 272, t0.y + 24 * k, 24 * k, '#fff', 'right', BF, 800); sx.restore(); });
        T2('cours sur ' + d.gy + ' an' + (d.gy > 1 ? 's' : '') + ' · TradingView · scénarios de ma simulation', cx, bot + 70 * k, 26 * k, C.dim, 'center', BF, 700);
      }
      if (s.k === 'intro'){ const b = back(segp(p, 0, 0.3)); sx.save(); sx.translate(cx, Yf(0.17)); sx.scale(b, b); logo2(it, 0, 0, 120 * k, true); sx.restore();
        T2(up(d.nom), cx, Yf(0.36), fit2(up(d.nom), 96 * k, 960), C.ink); T2('COURS ACTUEL', cx, Yf(0.46), 44 * k, C.dim, 'center', BF, 800);
        const v = d.cours * ease(segp(p, 0.2, 0.6)), t0 = money(v, d.ccy); T2(t0, cx, Yf(0.6), fit2(t0, 200 * k, 960), C.ink);
        sx.save(); sx.globalAlpha *= ease(segp(p, 0.6, 0.85)); hl2('Quel prix juste ?', cx, Yf(0.74), 76 * k); sx.restore(); if (pp.sticker) stk(pp.sticker, 860, Yf(0.88), 220 * k, segp(p, 0.6, 1)); }
      else if (s.k === 'pess' || s.k === 'real' || s.k === 'opt' || s.k === 'verdict'){
        const order = ['pess', 'real', 'opt'], shown = s.k === 'verdict' ? order : order.slice(0, order.indexOf(s.k) + 1), lab = { pess: 'PESSIMISTE', real: 'REALISTE', opt: 'OPTIMISTE' }, cc = { pess: C.red, real: C.line3, opt: C.green };
        logo2(it, 120, Yf(0.06), 52 * k); T2(up(d.nom), 190, Yf(0.06) + 20 * k, fit2(up(d.nom), 60 * k, 820), C.ink, 'left');
        if (s.k !== 'verdict'){ const v = d.sc[s.k], q = pot(d, s.k), a = ease(segp(p, 0, 0.4)); T2('SCENARIO ' + lab[s.k], cx, Yf(0.165), 56 * k, cc[s.k], 'center', AF);
          const tv = money(isNum(v) ? v * (0.6 + 0.4 * a) : null, d.ccy); T2(tv, cx, Yf(0.275), fit2(tv, 150 * k, 960), C.ink); if (isNum(q)){ sx.save(); sx.globalAlpha *= ease(segp(p, 0.35, 0.6)); hl2(sgn(q) + ' vs le cours', cx, Yf(0.35), 54 * k); sx.restore(); } }
        else { const q = pot(d, 'real'), verdict = !isNum(q) ? '' : q >= 15 ? 'DECOTE' : q >= -5 ? 'PRIX CORRECT' : 'TROP CHER';
          T2('MON PRIX JUSTE', cx, Yf(0.165), 60 * k, C.ink); const tv = money(d.sc.real, d.ccy); T2(tv, cx, Yf(0.275), fit2(tv, 150 * k, 960), C.line3);
          sx.save(); sx.globalAlpha *= ease(segp(p, 0.2, 0.45)); hl2(verdict + (isNum(q) ? ' · ' + sgn(q) : ''), cx, Yf(0.35), 54 * k); sx.restore();
          const st = pp.sticker || (verdict === 'DECOTE' ? 'fusee' : verdict === 'TROP CHER' ? 'facepalm' : 'reflexion'); stk(st, 935, Yf(0.235), 190 * k, segp(p, 0.3, 1)); }
        // échelle des prix : cours actuel + scénarios déjà annoncés
        const vals = [d.cours].concat(order.map(z => d.sc[z])).filter(isNum), mn = Math.min(...vals) * 0.9, mx = Math.max(...vals) * 1.08, top = Yf(0.45), bot = Yf(0.94), py = v => bot - (bot - top) * (v - mn) / (mx - mn), AX = 250;
        sx.fillStyle = C.track; R2(AX - 9, top - 10, 18, bot - top + 20, 9); sx.fill();
        const marks = shown.filter(z => isNum(d.sc[z])).map(z => ({ z, y: py(d.sc[z]), v: d.sc[z] })).concat([{ z: 'cours', y: py(d.cours), v: d.cours }]).sort((a2, b2) => a2.y - b2.y);
        for (let i = 1; i < marks.length; i++) if (marks[i].y - marks[i - 1].y < 96 * k) marks[i].y = marks[i - 1].y + 96 * k;
        marks.forEach(mk => { const isNew = mk.z === s.k, a = isNew ? ease(segp(p, 0.05, 0.4)) : 1, ry = py(mk.v); sx.save(); sx.globalAlpha *= a;
          if (mk.z === 'cours'){ sx.setLineDash([10, 10]); sx.strokeStyle = C.ink; sx.lineWidth = 3; sx.beginPath(); sx.moveTo(AX - 120, ry); sx.lineTo(1020, ry); sx.stroke(); sx.setLineDash([]); T2('COURS', AX - 30, ry - 14, 30 * k, C.ink, 'right', BF, 800); }
          sx.fillStyle = mk.z === 'cours' ? C.ink : cc[mk.z]; sx.beginPath(); sx.arc(AX, ry, mk.z === 'cours' ? 16 : 22, 0, 7); sx.fill();
          const xo = (1 - a) * 80; sx.fillStyle = mk.z === 'cours' ? C.card : cc[mk.z]; R2(AX + 50 + xo, mk.y - 40 * k, 720, 80 * k, 40 * k); sx.fill();
          const tc = mk.z === 'cours' ? C.ink : '#fff'; T2(mk.z === 'cours' ? "AUJOURD'HUI" : lab[mk.z], AX + 82 + xo, mk.y + 13 * k, 34 * k, tc, 'left', BF, 800);
          T2(money(mk.v, d.ccy) + (mk.z !== 'cours' && isNum(pot(d, mk.z)) ? '  ' + sgn(pot(d, mk.z)) : ''), AX + 740 + xo, mk.y + 13 * k, 38 * k, tc, 'right', BF, 800); sx.restore(); }); } }
    if (f === 'trans' && d.chart && ['gachat', 'gvente', 'gdepuis'].includes(s.k)){ drawTransChart(d, s.k, p, Rg, pp); return; }
    if (f === 'trans' && s.k === 'bilan'){ const win = (d.perf || 0) >= 0; logo2(d.item, 540, Yf(0.13), 90 * k, true); T2(up(d.name), 540, Yf(0.3), fit2(up(d.name), 84 * k, 960), C.ink); hl2('Le bilan', 540, Yf(0.4), 70 * k);
      const v = (d.perf || 0) * ease(segp(p, 0.1, 0.6)), tv = isNum(d.perf) ? sgn(v, 1) : '—'; T2(tv, 540, Yf(0.66), fit2(tv, 260 * k, 980), win ? C.green : C.red);
      T2('en ' + dur(d.days) + (d.divs > 0 ? ' · dividendes compris' : ''), 540, Yf(0.75), 44 * k, C.ink2, 'center', BF, 700); if (pp.sticker) stk(win ? pp.sticker : 'decourage', 540, Yf(0.9), 200 * k, segp(p, 0.4, 1)); return; }
    if (f === 'trans'){
      const it = d.item, sell = d.type === 'SELL';
      s = { k: { gachat: 'achat', gvente: 'vente', gdepuis: 'depuis' }[s.k] || s.k };
      if (s.k === 'hook'){ title(sell ? "J'ai vendu" : "J'ai achete", cx, Yf(0.13), 150 * k, 1); const b = back(segp(p, 0.1, 0.45)); sx.save(); sx.translate(cx, Yf(0.38)); sx.scale(b, b); logo2(it, 0, 0, 150 * k, true); sx.restore();
        sx.save(); sx.globalAlpha *= ease(segp(p, 0.35, 0.55)); T2(up(d.name), cx, Yf(0.6), fit2(up(d.name), 90 * k, 960), C.ink); hl2(sell ? (isNum(d.perf) ? sgn(d.perf, 1) : 'Vente') : 'Achat du ' + dt(d.buyDate).toLocaleDateString('fr-FR'), cx, Yf(0.7), 80 * k); sx.restore();
        if (pp.sticker) stk(pp.sticker, cx, Yf(0.87), 240 * k, segp(p, 0.5, 1)); }
      const row = (lab, val, y, a, color) => { sx.save(); sx.globalAlpha *= a; sx.translate((1 - a) * 80, 0); sx.fillStyle = C.card; R2(60, y, 960, 150 * k, 30); sx.fill(); T2(lab, 100, y + 62 * k, 36 * k, C.dim, 'left', BF, 800); T2(val, 990, y + 112 * k, fit2(val, 72 * k, 900), color || C.ink, 'right'); sx.restore(); };
      const head = t0 => { logo2(it, 120, Yf(0.07), 54 * k); T2(up(d.name), 190, Yf(0.07) + 20 * k, fit2(up(d.name), 60 * k, 820), C.ink, 'left'); hl2(t0, cx, Yf(0.19), 70 * k); };
      if (s.k === 'achat'){ head("L'achat"); row('DATE', dl(d.buyDate), Yf(0.27), ease(segp(p, 0.1, 0.4))); row('PRIX MOYEN', money(d.buyPx, 'EUR'), Yf(0.27) + 175 * k, ease(segp(p, 0.3, 0.6))); }
      if (s.k === 'vente'){ head('La vente'); row('DATE', dl(d.sellDate), Yf(0.27), ease(segp(p, 0.05, 0.3))); row('PRIX DE VENTE', money(d.sellPx, 'EUR'), Yf(0.27) + 175 * k, ease(segp(p, 0.2, 0.45)));
        const v = d.perf * ease(segp(p, 0.4, 0.85)), tv = sgn(v, 1); T2(tv, cx, Yf(0.8), fit2(tv, 220 * k, 980), col(d.perf));
        T2((d.days < 45 ? Math.round(d.days) + ' jours' : Math.round(d.days / 30.4) + ' mois') + ' de détention' + (d.divs > 0 ? ' · dividendes compris' : ''), cx, Yf(0.87), 36 * k, C.ink2, 'center', BF, 700); }
      if (s.k === 'depuis'){ head("Depuis l'achat"); row('PRIX D’ACHAT', money(d.buyPx, 'EUR'), Yf(0.27), ease(segp(p, 0.05, 0.3))); row("AUJOURD'HUI", money(d.nowPx, 'EUR'), Yf(0.27) + 175 * k, ease(segp(p, 0.2, 0.45)));
        if (isNum(d.perf)){ const v = d.perf * ease(segp(p, 0.4, 0.85)), tv = sgn(v, 1); T2(tv, cx, Yf(0.8), fit2(tv, 220 * k, 980), col(d.perf)); } }
      if (s.k === 'pourquoi'){ head('Pourquoi ?'); cards(lines(pp.raisons), Yf(0.27), Rg.h * 0.66, p, Rg); } }
  }
  function drawValoChart(d, k0, p, Rg, pp){
    const k = Rg.k, Yf = q => Rg.y + Rg.h * q, order = ['pess', 'real', 'opt'], cc = { pess: C.red, real: '#E3A21A', opt: C.green }, lab = { pess: 'Pessimiste', real: 'Réaliste', opt: 'Optimiste' };
    const shown = k0 === 'gcours' ? [] : k0 === 'verdict' ? order : order.slice(0, order.indexOf(k0) + 1), isNew = z => z === k0, an = ease(segp(p, 0.05, 0.55));
    // titre + encadré noir (comme la carte de publication)
    const e = ecartJ(d), verdict = pp.verdictT || (!isNum(e) ? 'Mon prix juste' : e >= 15 ? 'Trop chere ?' : e <= -15 ? 'En solde ?' : 'Au juste prix ?');
    const head = k0 === 'gcours' ? 'Quel prix juste ?' : k0 === 'verdict' ? verdict : 'Scenario ' + lab[k0].toLowerCase();
    const sub = k0 === 'gcours' ? 'Cours : ' + money(d.cours, d.ccy) : k0 === 'verdict' ? (isNum(e) ? (e >= 0 ? '+' : '−') + fr(Math.abs(e), 0) + ' % ' + (e >= 0 ? 'au-dessus' : 'en dessous') + ' de mon prix juste' : '') : money(d.sc[k0], d.ccy) + (isNum(pot(d, k0)) ? ' · ' + sgn(pot(d, k0)) + ' vs le cours' : '');
    sx.save(); if (k0 !== 'gcours' && k0 !== 'pess') { /* titre fixe */ } T2(up(head), 60, Yf(0.085), fit2(up(head), 112 * k, 960), C.ink, 'left'); sx.restore();
    if (sub){ sx.save(); sx.globalAlpha *= ease(segp(p, 0.1, 0.35)); chipD(sub, 60, Yf(0.135), fit2(sub, 40 * k, 900, BF, 800), '#16130F', '#F2B33D'); sx.restore(); }
    // logo + nom
    sx.save(); sx.fillStyle = '#fff'; R2(60, Yf(0.17), 130 * k, 130 * k, 30 * k); sx.fill(); sx.restore(); logo2(d.item, 60 + 65 * k, Yf(0.17) + 65 * k, 52 * k);
    T2(up(d.nom), 60 + 160 * k, Yf(0.17) + 92 * k, fit2(up(d.nom), 96 * k, 960 - 160 * k), C.ink, 'left');
    // le graphique
    const box = { x: 80, y: Yf(0.33), w: 920, h: Rg.h * 0.54 }, G = pxFrame(d.S, d.Dd, box, order.map(z => d.sc[z]));
    // dégradé rouge → jaune → vert entre les scénarios déjà annoncés
    const sv = shown.filter(z => isNum(d.sc[z])).map(z => ({ z, v: d.sc[z] })).sort((a, b) => a.v - b.v);
    if (sv.length >= 2){ const lo = sv[0], hi = sv[sv.length - 1], yT = G.py(hi.v), yB = G.py(lo.v), g = sx.createLinearGradient(0, yB, 0, yT), rgb = { pess: '229,99,107', real: '242,196,61', opt: '61,200,140' };
      sv.forEach(o => g.addColorStop(clamp((o.v - lo.v) / ((hi.v - lo.v) || 1)), `rgba(${rgb[o.z]},0.30)`)); sx.save(); sx.globalAlpha *= sv.some(o => isNew(o.z)) ? an : 1; sx.fillStyle = g; sx.fillRect(box.x, yT, box.w, yB - yT); sx.restore(); }
    // lignes pointillées + étiquettes
    const labs = [];
    shown.filter(z => isNum(d.sc[z])).forEach(z => { const a = isNew(z) ? an : 1, yy = G.py(d.sc[z]); sx.save(); sx.setLineDash([16, 12]); sx.strokeStyle = cc[z]; sx.lineWidth = 5; sx.beginPath(); sx.moveTo(box.x, yy); sx.lineTo(box.x + box.w * a, yy); sx.stroke(); sx.restore(); labs.push({ z, y: yy - 36, a }); });
    labs.sort((a, b) => a.y - b.y); for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 60) labs[i].y = labs[i - 1].y + 60;
    // la courbe du cours (par-dessus) + étiquette du dernier cours
    const a = k0 === 'gcours' ? ease(segp(p, 0, 0.8)) : 1, last = G.curve(a, C.ink, 7);
    if (a > 0.98){ const xe = G.px(G.n - 1), ye = G.py(d.S[G.n - 1]); sx.fillStyle = C.ink; sx.beginPath(); sx.arc(xe, ye, 14, 0, 7); sx.fill(); chipD(money(d.S[G.n - 1], d.ccy), xe + 8, Math.max(box.y - 4, ye - 50), 34, C.ink, C.bg, 'right'); }
    labs.forEach(l => { sx.save(); sx.globalAlpha *= l.a; chipD(lab[l.z] + ' ' + fr(d.sc[l.z], d.sc[l.z] < 100 ? 2 : 0), box.x + 10, l.y, 32, C.bg, cc[l.z]); sx.restore(); });
    if (k0 === 'verdict'){ const st = pp.sticker || (isNum(e) && e >= 15 ? 'facepalm' : isNum(e) && e <= -15 ? 'fusee' : 'reflexion'); stk(st, 930, Yf(0.205), 170 * k, segp(p, 0.25, 1)); }
  }
  function drawTransChart(d, k0, p, Rg, pp){
    const k = Rg.k, Yf = q => Rg.y + Rg.h * q, ch = d.chart, sell = d.type === 'SELL', win = (d.perf || 0) >= 0;
    logo2(d.item, 120, Yf(0.06), 54 * k, true); T2(up(d.name), 192, Yf(0.06) + 22 * k, fit2(up(d.name), 70 * k, 820), C.ink, 'left');
    hl2(k0 === 'gachat' ? "L'achat" : k0 === 'gvente' ? 'La vente' : "Depuis l'achat", 540, Yf(0.165), 70 * k);
    const box = { x: 80, y: Yf(0.3), w: 920, h: Rg.h * 0.44 }, G = pxFrame(ch.S, ch.Dd, box, []);
    const a = k0 === 'gachat' ? ease(segp(p, 0, 0.45)) : 1; G.curve(a, C.ink, 6);
    // segment détenu, en vert ou rouge
    const segTo = k0 === 'gachat' ? null : sell ? ch.is : G.n - 1;
    if (segTo != null){ const sa = ease(segp(p, 0.05, 0.6)); G.curve(sa, win ? C.green : C.red, 11, ch.ib, segTo); }
    const mark = (i, t0, sub, color, slot, alpha) => { const xx = G.px(i), yy = G.py(ch.S[i]), ty = box.y + 34 + slot * 96; sx.save(); sx.globalAlpha *= alpha;
      sx.setLineDash([8, 9]); sx.strokeStyle = color; sx.lineWidth = 3; sx.beginPath(); sx.moveTo(xx, ty + 30); sx.lineTo(xx, yy); sx.stroke(); sx.setLineDash([]);
      sx.fillStyle = color; sx.beginPath(); sx.arc(xx, yy, 16, 0, 7); sx.fill(); sx.strokeStyle = C.bg; sx.lineWidth = 5; sx.stroke();
      const al = xx < box.x + 260 ? 'left' : xx > box.x + box.w - 260 ? 'right' : 'center'; const c1 = chipD(t0, al === 'left' ? xx - 20 : al === 'right' ? xx + 20 : xx, ty, 30, color, '#fff', al);
      if (sub) T2(sub, al === 'left' ? c1.L + 4 : al === 'right' ? c1.L + c1.w - 4 : xx, ty + 52, 28, C.ink2, al === 'left' ? 'left' : al === 'right' ? 'right' : 'center', BF, 800); sx.restore(); };
    const bAlpha = k0 === 'gachat' ? ease(segp(p, 0.45, 0.7)) : 1;
    mark(ch.ib, 'ACHAT · ' + dt(d.buyDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }), isNum(d.bpx) ? money(d.bpx, d.bccy) : '', C.ink, 0, bAlpha);
    if (sell && k0 === 'gvente') mark(ch.is, 'VENTE · ' + dt(d.sellDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }), isNum(d.spx) ? money(d.spx, d.sccy) : '', win ? C.green : C.red, 1, ease(segp(p, 0.3, 0.55)));
    if (!sell && k0 === 'gdepuis'){ const xe = G.px(G.n - 1), ye = G.py(ch.S[G.n - 1]); sx.save(); sx.globalAlpha *= ease(segp(p, 0.3, 0.55)); sx.fillStyle = win ? C.green : C.red; sx.beginPath(); sx.arc(xe, ye, 16, 0, 7); sx.fill(); chipD("AUJOURD'HUI", xe + 20, box.y + 34 + 96, 30, win ? C.green : C.red, '#fff', 'right'); sx.restore(); }
    if (k0 !== 'gachat' && isNum(d.perf)){ const v = d.perf * ease(segp(p, 0.45, 0.9)), tv = sgn(v, 1); sx.save(); sx.globalAlpha *= ease(segp(p, 0.4, 0.6));
      const z = fit2(tv, 130 * k, 900); T2(tv, 540, box.y + box.h + 85 + 120 * k, z, win ? C.green : C.red); T2(dur(d.days) + (sell && d.divs > 0 ? ' · dividendes compris' : ''), 540, box.y + box.h + 85 + 168 * k, 34 * k, C.ink2, 'center', BF, 700); sx.restore(); }
  }
  function sceneDraw(s, p, Rg){ const f = getCfg().fmt; if (f === 'hebdo') drawHebdo(s, p, Rg); else drawFmt(f, s, p, Rg); }
  function frame(){
    const cv = $('sdShortCv'); if (!cv) return; sx = cv.getContext('2d'); C = THEMES[getCfg().theme] || THEMES.beige; LAY = getCfg().layout;
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalAlpha = 1; sx.fillStyle = C.bg; sx.fillRect(0, 0, 1080, 1920);
    if (!DATA){ T2(dataErr ? 'Donnees indisponibles' : 'Chargement…', 540, 900, 60, C.ink); if (dataErr) para(dataErr, 540, 980, 900, 30, C.dim); return; }
    const cur = at(tt), manual = !!fc().manual;
    if (cur && cur.s.k === 'ecran'){   // écran partagé : ton écran en haut, ta webcam en dessous (toujours)
      const pp = fc().p, a = ease(segp(cur.p, 0, 1)); sx.save(); sx.globalAlpha = a; T2(up(pp.titre).slice(0, 48), 540, 150, fit2(up(pp.titre).slice(0, 48), 70, 980), C.ink);
      screenDraw(30, 200, 1020, 760); camDraw(130, 1000, 820, 600, false, 40); sx.lineWidth = 6; sx.strokeStyle = C.gold; R2(130, 1000, 820, 600, 40); sx.stroke(); sx.restore();
      const im = imgNow('data/wolf-tete.png'); if (im) sx.drawImage(im, 350, 1622, 52, 52); T2('Wolf Academy Invest', 565, 1660, 32, C.sig, 'center', BF, 700); }
    else {
      const Rg = region();
      if (LAY === 'split') camDraw(0, 0, 1080, 700, false);
      if (cur){ sx.save(); sx.beginPath(); sx.rect(Rg.x, Rg.y, Rg.w, Rg.h); sx.clip(); const p = cur.p, ain = ease(segp(p, 0, 0.1)), aout = (manual || cur.s.k === 'end' || cur.s.k === 'fin') ? 1 : 1 - segp(p, 0.93, 1);
        sx.globalAlpha = Math.min(ain, aout); sx.translate(0, (1 - ain) * 30); try { sceneDraw(scn(cur.s.k), p, Rg); } catch(e){ console.warn('Short', e); } sx.restore(); sx.globalAlpha = 1; }
      if (LAY === 'bulle'){ camDraw(70, 1300, 300, 300, true); sx.beginPath(); sx.arc(220, 1450, 156, 0, 7); sx.strokeStyle = C.gold; sx.lineWidth = 8; sx.stroke();
        T2('WOLF', 400, 1430, 64, C.ink, 'left'); T2('ACADEMY INVEST', 400, 1490, 42, C.ink2, 'left'); T2(getCfg().fmt === 'hebdo' ? 'Chaque semaine, le vrai portefeuille' : 'La bourse, simplement', 400, 1534, 28, C.dim, 'left', BF, 700); }
      else { const im = imgNow('data/wolf-tete.png'), y = LAY === 'split' ? 1640 : 1560; if (im) sx.drawImage(im, 350, y - 38, 52, 52); T2('Wolf Academy Invest', 565, y - 2, 32, C.sig, 'center', BF, 700); } }
    const a = active(); let acc = 0; const gp = 8, W = (1080 - 120 - gp * (a.length - 1)) / Math.max(1, a.length);
    a.forEach((s, i) => { const X = 60 + i * (W + gp); sx.fillStyle = C.track; R2(X, 40, W, 10, 5); sx.fill(); const fq = clamp((tt - acc) / (+s.dur || 3)); if (fq > 0){ sx.fillStyle = C.gold; R2(X, 40, Math.max(10, W * fq), 10, 5); sx.fill(); } acc += +s.dur || 3; });
    if (countdown > 0){ sx.fillStyle = 'rgba(0,0,0,.55)'; sx.fillRect(0, 0, 1080, 1920); T2(String(countdown), 540, 1040, 360, '#fff'); }
    if ($('sdSafe') && $('sdSafe').checked && !recording){ sx.fillStyle = 'rgba(255,40,40,.22)'; sx.fillRect(0, 1580, 1080, 340); sx.fillRect(930, 860, 150, 720); T2('Cache par YouTube', 540, 1700, 34, '#fff', 'center', BF, 800); }
  }
  let last = 0;
  // Mode « à la main » : chaque scène joue son animation puis RESTE affichée jusqu'à → (ou clic / télécommande).
  function loop(now){ const dtm = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing && countdown <= 0){ const T0 = total();
      if (fc().manual){ const cur = at(tt); tt = Math.min(tt + dtm, (cur ? cur.b : T0) - 0.001); }
      else { tt += dtm; if (tt >= T0){ if (recording){ stopRec(); tt = T0 - 0.001; playing = false; } else tt = 0; } } }
    frame(); uiTick(); raf = requestAnimationFrame(loop); }
  function next(){ const cur = at(tt); if (!cur) return; if (cur.b < total() - 0.002) tt = cur.b + 0.0005; playing = true; last = performance.now(); syncPlay(); }
  function prev(){ const cur = at(tt); if (!cur) return; tt = tt - cur.a > 0.6 || cur.a <= 0 ? cur.a + 0.0005 : Math.max(0, at(cur.a - 0.001).a + 0.0005); playing = true; last = performance.now(); syncPlay(); }
  function syncPlay(){ const pb = document.querySelector('[data-sd-s="play"]'); if (pb) pb.textContent = playing ? '⏸ Figer' : '▶ Lecture'; }
  // Espace : fige l'écran (animations, défilement) — la webcam et le micro continuent d'être enregistrés.
  function toggleFreeze(){ if (countdown > 0) return; playing = !playing; last = performance.now(); syncPlay(); }
  let lastK = null;
  function uiTick(){ const el = $('sdShortTime'); if (el){ const cur = at(tt), a = active(), i = cur ? a.indexOf(cur.s) + 1 : 0;
      el.textContent = (fc().manual ? 'Étape ' + i + ' / ' + a.length : fr(tt, 1) + ' s / ' + Math.round(total()) + ' s') + (!playing ? ' · ❄ figé' : '') + (recording ? ' · ⏺ ENREGISTREMENT' : ''); }
    const cur = at(tt), pt = $('sdPrompt'); if (cur && pt && cur.s.k !== lastK){ lastK = cur.s.k; const o = fc(), S0 = scn(cur.s.k); pt.textContent = (o.texts[cur.s.k] != null && o.texts[cur.s.k] !== '' ? o.texts[cur.s.k] : (DATA && S0 ? safeSay(S0) : '')); document.querySelectorAll('#sdScenes li').forEach(li => li.classList.toggle('on', li.dataset.k === cur.s.k)); } }
  const safeSay = S0 => { try { return S0.say(DATA, fc().p) || ''; } catch(e){ return ''; } };

  /* --- interface --- */
  const stkSel = (key, label) => `<label class="sd-f">${esc(label)}<select data-sd-p="${key}"><option value="">Aucun</option>${Object.entries(STK).map(([k2, v]) => `<option value="${k2}" ${fc().p[key] === k2 ? 'selected' : ''}>${esc(v[0])}</option>`).join('')}</select></label>`;
  const txtIn = (key, label, ph) => `<label class="sd-f">${esc(label)}<input data-sd-p="${key}" value="${esc(fc().p[key] || '')}" placeholder="${esc(ph || '')}"></label>`;
  const area = (key, label, ph) => `<label class="sd-f">${esc(label)}<textarea data-sd-p="${key}" rows="4" placeholder="${esc(ph || '')}">${esc(fc().p[key] || '')}</textarea></label>`;
  const coPick = label => { const co = fc().p.co; return `<div class="sd-grp"><span>${esc(label)}</span>${co ? `<div class="sd-chips"><span class="sd-chip">${co.logoid ? `<img src="${esc(tvLogo(co.logoid))}" alt="">` : ''}${esc(co.name || co.sym)}<button type="button" data-sd-s="corm" aria-label="Retirer">✕</button></span></div>` : ''}
    <input class="sd-search" id="sdCoQ" placeholder="Chercher une action ou un ETF (TradingView)…" autocomplete="off"><div class="sd-sugg" id="sdCoSugg"></div></div>`; };
  function fmtSettings(){
    const f = getCfg().fmt, p = fc().p, c = getCfg();
    if (f === 'hebdo') return `<label class="sd-f">Semaine<select data-sd-sc="per"><option value="w0" ${c.per === 'w0' ? 'selected' : ''}>Cette semaine</option><option value="w1" ${c.per === 'w1' ? 'selected' : ''}>La semaine dernière</option></select></label>`;
    if (f === 'ecran') return txtIn('titre', 'Titre (accroche et bandeau au-dessus de l’écran)') + txtIn('sous', 'Encadré sous le titre') + stkSel('sticker', 'Loup de l’accroche')
      + `<div class="sd-devs"><button type="button" data-sd-s="scr">${scr ? '🖥 Écran partagé ✔ (changer)' : '🖥 Partager un écran ou une fenêtre'}</button>${scr ? '<button type="button" data-sd-s="scrstop">Arrêter le partage</button>' : ''}</div>
      <label class="sd-f">Zoom sur l’écran<select data-sd-p="zoom">${[['1', 'Écran entier'], ['1.5', 'Zoom ×1,5'], ['2', 'Zoom ×2'], ['3', 'Zoom ×3']].map(([v, l]) => `<option value="${v}" ${String(p.zoom) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="sd-f">Zone zoomée<select data-sd-p="focus">${[['c', 'Centre'], ['hg', 'Haut gauche'], ['h', 'Haut'], ['hd', 'Haut droite'], ['g', 'Gauche'], ['d', 'Droite'], ['bg', 'Bas gauche'], ['b', 'Bas'], ['bd', 'Bas droite']].map(([v, l]) => `<option value="${v}" ${p.focus === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="sd-sub">Astuce : partage une FENÊTRE (TradingView, l’onglet Analyse…) et garde le Studio visible à côté pour utiliser → et Espace. Le zoom se change même pendant l’enregistrement.</p>` + txtIn('fin', 'Encadré de fin', 'Pour la suite');
    if (f === 'explique') return txtIn('titre', 'Titre') + txtIn('sous', 'Encadré sous le titre') + area('points', 'Tes points (un par ligne, 5 au plus)', 'Un point par ligne') + coPick('Entreprise (logo, facultatif)') + stkSel('sticker', 'Loup du titre') + txtIn('fin', 'Encadré de fin', 'Pour la suite');
    if (f === 'chute') return coPick('Action') + `<label class="sd-f">Plus haut cherché sur<select data-sd-p="yrs">${[['1', '1 an'], ['2', '2 ans'], ['3', '3 ans'], ['5', '5 ans'], ['10', '10 ans'], ['max', 'Tout l’historique']].map(([v, l]) => `<option value="${v}" ${String(p.yrs) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`
      + stkSel('sticker', 'Loup du choc') + area('raisons', 'Pourquoi ça chute (une raison par ligne)') + txtIn('question', 'La question') + txtIn('verdict', 'Ton verdict (apparaît sous la question)') + stkSel('sticker2', 'Loup de la question') + txtIn('fin', 'Encadré de fin', 'Pour la suite');
    if (f === 'valo') return `<label class="sd-f">Entreprise (fiches de « Prix par secteur »)<select data-sd-p="nom">${(valoList || []).map(x => `<option value="${esc(x.nom)}" ${p.nom === x.nom ? 'selected' : ''}>${esc(x.nom)}${isNum(x.sc.real) ? '' : ' (pas de scénario réaliste)'}</option>`).join('') || '<option>Chargement…</option>'}</select></label>
      <p class="sd-sub">Les 3 prix viennent de TA simulation dans « Prix par secteur » (rien n’est estimé ici). Annonce-les un par un avec → : chaque scénario devient une ligne sur le graphique du cours, avec le dégradé rouge → jaune → vert.</p>
      ${txtIn('verdictT', 'Titre du verdict (vide = automatique : « Trop chère ? », « En solde ? », « Au juste prix ? »)')}
      <label class="sd-f">Période du graphique<select data-sd-p="gyrs">${[['1', '1 an'], ['2', '2 ans'], ['3', '3 ans'], ['5', '5 ans'], ['10', '10 ans'], ['max', 'Tout l’historique']].map(([v, l]) => `<option value="${v}" ${String(p.gyrs) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` + stkSel('sticker', 'Loup (vide = choisi selon le verdict)') + txtIn('fin', 'Encadré de fin', 'Pour la suite');
    if (f === 'trans') return `<label class="sd-f">Opération du Wolf Portfolio<select data-sd-p="op">${(opsList || []).map(o => `<option value="${esc(o.id)}" ${p.op === o.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('') || '<option>Chargement…</option>'}</select></label>
      <p class="sd-sub">Dates, prix et performance (dividendes compris) calculés depuis ton journal. Wolf Portfolio seulement, jamais le PEA ni le CTO.</p>` + stkSel('sticker', 'Loup de l’accroche') + area('raisons', 'Pourquoi (une raison par ligne)') + txtIn('fin', 'Encadré de fin', 'Pour la suite');
    return '';
  }
  function view(){
    const b = $('sdBody'); if (!b) return; const c = getCfg(), o = fc(), FF = F();
    b.innerHTML = `<div class="sd-short">
      <div class="sd-phonebox"><div class="sd-phone"><canvas id="sdShortCv" width="1080" height="1920" aria-label="Aperçu du short (clic = étape suivante)"></canvas></div>
        <div class="sd-sctrl"><button type="button" data-sd-s="prev" aria-label="Étape précédente">◀</button><button type="button" class="sd-main" data-sd-s="next">Suivant ▶</button><button type="button" data-sd-s="play">${playing ? '⏸ Figer' : '▶ Lecture'}</button><button type="button" data-sd-s="restart">↺</button><span id="sdShortTime" class="sd-time"></span></div>
        <div class="sd-sctrl"><button type="button" class="sd-rec" id="sdRecBtn" data-sd-s="rec">${recording ? '⏹ Arrêter l’enregistrement' : '⏺ Enregistrer le short'}</button></div>
        <p class="sd-sub"><b>Pendant que tu filmes :</b> <kbd>→</kbd> ou clic sur l’aperçu = étape suivante, <kbd>←</kbd> = précédente (une télécommande de présentation marche aussi), <kbd>Espace</kbd> = figer l’écran (ta webcam et ta voix continuent d’être enregistrées). Ces boutons ne sont pas filmés.</p></div>
      <div class="sd-sside">
        <div class="sd-prompt"><small>Prompteur · texte de l’étape en cours</small><p id="sdPrompt"></p></div>
        <div class="sd-card"><h3>Modèle de short</h3><div class="sd-fmts">${FMT_KEYS.map(k2 => `<button type="button" data-sd-fmt="${k2}" class="${c.fmt === k2 ? 'on' : ''}"><b>${esc(FMT[k2].name)}</b><small>${esc(FMT[k2].desc)}</small></button>`).join('')}</div></div>
        <div class="sd-card"><h3>${esc(FF.name)}</h3>${fmtSettings()}
          <label class="sd-tog"><input type="checkbox" id="sdManual" ${o.manual ? 'checked' : ''}> Avancer à la main (→ / clic), sinon les étapes défilent seules</label></div>
        <div class="sd-card"><h3>Réglages</h3>
          <label class="sd-f">Webcam<select data-sd-sc="layout">${[['bulle', 'Bulle en bas'], ['split', 'Écran partagé (toi en haut)'], ['none', 'Sans webcam']].map(([v, l]) => `<option value="${v}" ${c.layout === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="sd-f">Thème<select data-sd-sc="theme">${[['beige', 'Beige'], ['nuit', 'Nuit'], ['or', 'Or']].map(([v, l]) => `<option value="${v}" ${c.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <div class="sd-devs"><button type="button" data-sd-s="cam">${cam ? '📷 Webcam et micro activés' : '📷 Activer webcam et micro'}</button><select id="sdCamSel" aria-label="Caméra"></select><select id="sdMicSel" aria-label="Micro"></select></div>
          <label class="sd-tog"><input type="checkbox" id="sdSafe"> Montrer les zones cachées par YouTube</label>
        </div>
        <div class="sd-card"><h3>Structure du short</h3><p class="sd-sub">Coche, ordonne, règle la durée de l’animation et le texte du prompteur de chaque étape (vide = texte proposé).</p>
          <ol id="sdScenes" class="sd-scenes">${o.scenes.map((z, i) => { const S0 = scn(z.k); if (!S0) return ''; return `<li data-k="${z.k}"><div class="sd-srow"><input type="checkbox" data-sd-on="${i}" ${z.on ? 'checked' : ''} aria-label="Garder ${esc(S0.t)}"><b>${esc(S0.t)}</b><span>${esc(S0.d)}</span>
            <input type="number" min="0.5" max="10" step="0.5" value="${z.dur}" data-sd-dur="${i}" aria-label="Durée en secondes"> s<button type="button" data-sd-up="${i}" aria-label="Monter">↑</button><button type="button" data-sd-down="${i}" aria-label="Descendre">↓</button><button type="button" data-sd-go="${i}">Voir</button></div>
            <textarea data-sd-txt="${z.k}" rows="2" placeholder="${esc(DATA ? safeSay(S0) : '')}">${esc(o.texts[z.k] || '')}</textarea></li>`; }).join('')}</ol></div>
        <div class="sd-card"><h3>Texte de publication</h3><p class="sd-sub">Généré avec les chiffres du short, modifiable avant de copier.</p>
          ${['yt', 'fb'].map(k2 => `<div class="sd-pub"><div class="sd-pubh"><b>${k2 === 'yt' ? '▶ YouTube Shorts (titre + description)' : 'f Facebook'}</b><button type="button" data-sd-copy="${k2}">📋 Copier</button></div>
            <textarea id="sdPub_${k2}" data-sd-pub="${k2}" rows="${k2 === 'yt' ? 12 : 9}">${esc(pubText(k2))}</textarea></div>`).join('')}
          <div class="sd-sctrl"><button type="button" data-sd-s="pubreset">↻ Régénérer les textes</button><span id="sdPubMsg" class="sd-time"></span></div></div>
        ${dataErr ? '<p class="sd-warn">⚠ ' + esc(dataErr) + '</p>' : ''}
      </div></div>`;
    lastK = null; devices();
    const cv = $('sdShortCv'); if (cv) cv.addEventListener('click', () => { if (!countdown) next(); });
    if (!raf){ last = performance.now(); raf = requestAnimationFrame(loop); }
    if (!DATA && !dataErr) loadData().then(() => { if (ui.tab === 'short' && !recording) view(); });
  }
  function reload(){ pubOv = { yt: null, fb: null }; DATA = null; dataErr = null; if (!recording){ tt = 0; } view(); }
  async function coSearch(q){ const box = $('sdCoSugg'); if (!box) return; if (q.trim().length < 2){ box.innerHTML = ''; return; }
    try { const r = await fetch('/api/tv/search?all=1&q=' + encodeURIComponent(q.trim().slice(0, 50)), { cache: 'no-store' }); const j = await r.json(); coSugg = j.ok ? (j.results || []).slice(0, 8) : []; } catch(e){ coSugg = []; }
    box.innerHTML = coSugg.length ? coSugg.map((r, i) => `<button type="button" data-sd-copick="${i}">${r.logoid ? `<img src="${esc(tvLogo(r.logoid))}" alt="">` : '<i></i>'}<b>${esc(r.name)}</b><span>${esc(r.symbol)}</span></button>`).join('') : '<p class="sd-sub">Aucun résultat (serveur local ?).</p>'; }
  async function devices(){ if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try { const ds = await navigator.mediaDevices.enumerateDevices(), cs = $('sdCamSel'), ms = $('sdMicSel'); if (!cs || !ms) return;
      cs.innerHTML = ds.filter(d => d.kind === 'videoinput').map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Caméra ' + (i + 1))}</option>`).join('') || '<option value="">Aucune caméra</option>';
      ms.innerHTML = ds.filter(d => d.kind === 'audioinput').map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Micro ' + (i + 1))}</option>`).join('') || '<option value="">Aucun micro</option>';
      const c = getCfg(); if (c.cam) cs.value = c.cam; if (c.mic) ms.value = c.mic; } catch(e){} }
  async function startCam(){
    stopCam(); const c = getCfg(), cs = $('sdCamSel'), ms = $('sdMicSel');
    const vid = cs && cs.value ? { deviceId: { exact: cs.value } } : true, aud = ms && ms.value ? { deviceId: { exact: ms.value }, echoCancellation: true, noiseSuppression: true } : true;
    try { cam = await navigator.mediaDevices.getUserMedia({ video: Object.assign(typeof vid === 'object' ? vid : {}, { width: { ideal: 1280 }, height: { ideal: 720 } }), audio: aud });
      camVideo = document.createElement('video'); camVideo.muted = true; camVideo.playsInline = true; camVideo.srcObject = cam; await camVideo.play();
      if (cs) c.cam = cs.value; if (ms) c.mic = ms.value; persist(); }
    catch(e){ cam = null; camVideo = null; const w = $('sdPrompt'); if (w) w.textContent = '⚠ Webcam ou micro refusés : ' + e.message; }
    if (!recording) view();
  }
  function stopCam(){ if (cam) cam.getTracks().forEach(tk => tk.stop()); cam = null; camVideo = null; }
  async function startScreen(){
    try { const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false }); stopScreen(); scr = s;
      scrVideo = document.createElement('video'); scrVideo.muted = true; scrVideo.playsInline = true; scrVideo.srcObject = scr; await scrVideo.play();
      scr.getVideoTracks().forEach(t => t.addEventListener('ended', () => { scr = null; scrVideo = null; if (!recording) view(); })); }
    catch(e){ const w = $('sdPrompt'); if (w) w.textContent = '⚠ Partage d’écran annulé ou refusé : ' + e.message; }
    if (!recording) view(); }
  function stopScreen(){ if (scr) scr.getTracks().forEach(tk => tk.stop()); scr = null; scrVideo = null; }
  function pickMime(){ const L = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']; return L.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''; }
  async function startRec(){
    if (!DATA){ return; } if (getCfg().layout !== 'none' && !cam) await startCam(); if (getCfg().fmt === 'ecran' && !cam) await startCam();
    const cv = $('sdShortCv'); if (!cv || !cv.captureStream){ const w = $('sdPrompt'); if (w) w.textContent = '⚠ Enregistrement impossible dans ce navigateur (utilise Chrome ou Edge).'; return; }
    const stream = cv.captureStream(30); if (cam) cam.getAudioTracks().forEach(tk => stream.addTrack(tk));
    const mime = pickMime(); recChunks = [];
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined); } catch(e){ const w = $('sdPrompt'); if (w) w.textContent = '⚠ ' + e.message; return; }
    rec.ondataavailable = ev => { if (ev.data && ev.data.size) recChunks.push(ev.data); };
    rec.onstop = () => { const type = (rec && rec.mimeType) || mime || 'video/webm', blob = new Blob(recChunks, { type }), ext = /mp4/.test(type) ? 'mp4' : 'webm';
      const nm = getCfg().fmt === 'hebdo' ? 'wolf-portfolio-semaine-' + (DATA ? DATA.week : '') : 'wolf-short-' + getCfg().fmt + '-' + today();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nm + '.' + ext; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
      recording = false; rec = null; view(); };
    tt = 0; playing = false; for (countdown = 3; countdown > 0; countdown--){ await new Promise(r => setTimeout(r, 1000)); }
    countdown = 0; recording = true; rec.start(250); playing = true; last = performance.now(); syncPlay();
    const rb = $('sdRecBtn'); if (rb) rb.textContent = '⏹ Arrêter l’enregistrement';   // jamais view() ici : le canvas filmé serait remplacé
  }
  function stopRec(){ if (rec && rec.state !== 'inactive') rec.stop(); playing = false; }

  /* --- texte de publication (YouTube / Facebook) --- */
  const tag = n => '#' + String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
  const deN = n => /^[aeiouyhâéèêîïôûAEIOUYHÂÉÈÊÎÏÔÛ]/.test(n) ? 'd’' + n : 'de ' + n;
  const WARN = '⚠️ Contenu éducatif, pas un conseil en investissement.';
  const BASE_TAGS = '#shorts #bourse #investissement #actions #wolfacademyinvest';
  function pubText(k){
    if (pubOv[k] != null) return pubOv[k];
    const d = DATA, f = getCfg().fmt, pp = fc().p; if (!d) return dataErr ? '' : 'Chargement des chiffres…';
    const pr = v => sgn(v, 1);
    const pack = (yt1, body, fbBody, extraTags) => k === 'yt' ? `${yt1} #shorts\n\n${body}\n\n🎥 Abonne-toi pour la suite.\n${WARN}\n\n${BASE_TAGS} ${extraTags || ''}`.trim() : `${fbBody}\n\nEt toi, tu en penses quoi ? Dis-le en commentaire 👇\n\n⚠️ Pas un conseil en investissement.\n#bourse #investissement ${extraTags || ''}`.trim();
    if (f === 'hebdo'){
      const names = [d.op && d.op.nom].concat(d.top.map(t => t.name)).filter(Boolean), firm = [...new Set(names.map(tag))].filter(t => t.length > 2).slice(0, 3);
      const opLine = d.op ? (d.op.type === 'SELL' ? `Vente ${deN(d.op.nom)}${isNum(d.op.perf) ? ' (' + pr(d.op.perf) + ' en ' + d.op.days + ' jours)' : ''}` : `Achat ${deN(d.op.nom)}`) : 'Aucune opération cette semaine';
      const ec = d.wolf - d.cac, pts = `${fr(Math.abs(ec), 1)} point${Math.abs(ec) >= 2 ? 's' : ''}`, verdict = ec >= 0 ? pts + ' devant le CAC 40' : pts + ' derrière le CAC 40';
      if (k === 'yt') return `Wolf Portfolio, semaine ${d.week} : ${pr(d.wolf)} (${verdict}) #shorts\n\nLe bilan de la semaine ${d.week} de mon portefeuille public, le Wolf Portfolio.\n\n📊 Cette semaine\n• Wolf Portfolio : ${pr(d.wolf)}\n• CAC 40 : ${pr(d.cac)}\n• S&P 500 (en euros) : ${pr(d.spx)}\n• Depuis le lancement : ${pr(d.since.wolf)}\n\n🔁 ${opLine}${d.top[0] ? `\n🥇 En tête : ${d.top[0].name} (${pr(d.top[0].v)})` : ''}${d.flop[0] ? `\n🔻 Lanterne rouge : ${d.flop[0].name} (${pr(d.flop[0].v)})` : ''}\n\n🎥 L'analyse complète, c'est samedi sur la chaîne. Abonne-toi pour ne pas la rater.\n⚠️ Contenu éducatif, pas un conseil en investissement. Les performances passées ne préjugent pas des performances futures.\n\n#shorts #bourse #investissement #wolfportfolio #cac40 #sp500 #actions #portefeuille #pea #wolfacademyinvest ${firm.join(' ')}`.trim();
      return `🐺 Semaine ${d.week} pour le Wolf Portfolio : ${pr(d.wolf)} !\n\nPendant ce temps, le CAC 40 fait ${pr(d.cac)} et le S&P 500 ${pr(d.spx)} en euros. Depuis le lancement, le portefeuille affiche ${pr(d.since.wolf)}.\n\n👉 ${opLine}.${d.top[0] ? `\n🥇 ${d.top[0].name} mène la danse (${pr(d.top[0].v)}).` : ''}\n\nEt toi, ta semaine en bourse, c'était comment ? Dis-le en commentaire 👇\nL'analyse complète arrive samedi sur YouTube.\n\n⚠️ Pas un conseil en investissement.\n#bourse #investissement #wolfportfolio ${firm.slice(0, 2).join(' ')}`.trim(); }
    if (f === 'ecran') return pack(pp.titre || 'Regarde ça', `${pp.titre || ''}${pp.sous ? ' : ' + pp.sous : ''}`, `🐺 ${pp.titre || ''}${pp.sous ? '\n' + pp.sous : ''}`, '');
    if (f === 'explique'){ const L = lines(pp.points), t0 = pp.co ? tag(pp.co.name) : ''; return pack(pp.titre, `${pp.titre}\n\n${L.map((l, i) => (i + 1) + '. ' + l).join('\n')}`, `💡 ${pp.titre}\n\n${L.map(l => '👉 ' + l).join('\n')}`, '#educationfinanciere #apprendre ' + t0); }
    if (f === 'chute'){ const t0 = tag(d.name); return pack(`${d.name} : ${sgn(d.drop, 0)} depuis son plus haut`, `${d.name} a perdu ${fr(Math.abs(d.drop), 0)} % depuis son plus haut (${money(d.max, d.ccy)} → ${money(d.last, d.ccy)}).\n\nPourquoi ?\n${lines(pp.raisons).map(l => '• ' + l).join('\n')}\n\n${pp.question}${pp.verdict ? ' ' + pp.verdict + '.' : ''}`,
      `📉 ${d.name} : ${sgn(d.drop, 0)} depuis son plus haut.\n\n${lines(pp.raisons).map(l => '• ' + l).join('\n')}\n\n${pp.question}`, t0 + ' #krach #opportunite'); }
    if (f === 'valo'){ const t0 = tag(d.nom), q = pot(d, 'real'); return pack(`${d.nom} : mon prix juste${isNum(q) ? ' (' + sgn(q) + ')' : ''}`, `Cours actuel : ${money(d.cours, d.ccy)}\n\n🔴 Pessimiste : ${money(d.sc.pess, d.ccy)}\n🔵 Réaliste : ${money(d.sc.real, d.ccy)}\n🟢 Optimiste : ${money(d.sc.opt, d.ccy)}\n\nMon prix juste : ${money(d.sc.real, d.ccy)}.`,
      `🎯 ${d.nom} cote ${money(d.cours, d.ccy)}. Mon prix juste : ${money(d.sc.real, d.ccy)}${isNum(q) ? ' (' + sgn(q) + ')' : ''}.\n\nPessimiste ${money(d.sc.pess, d.ccy)} · Réaliste ${money(d.sc.real, d.ccy)} · Optimiste ${money(d.sc.opt, d.ccy)}`, t0 + ' #valorisation #prixjuste'); }
    if (f === 'trans'){ const t0 = tag(d.name), sell = d.type === 'SELL';
      return pack(`${sell ? "J'ai vendu" : "J'ai acheté"} ${d.name}${isNum(d.perf) ? ' (' + pr(d.perf) + ')' : ''}`, `${sell ? 'Vente' : 'Achat'} ${deN(d.name)} dans le Wolf Portfolio.\n\n📅 Achat : ${dl(d.buyDate)}${sell ? `\n📅 Vente : ${dl(d.sellDate)}` : ''}${isNum(d.perf) ? `\n📈 Performance : ${pr(d.perf)}${sell && d.divs > 0 ? ' (dividendes compris)' : ''}` : ''}\n\nPourquoi ?\n${lines(pp.raisons).map(l => '• ' + l).join('\n')}`,
        `🐺 ${sell ? "J'ai vendu" : "J'ai acheté"} ${d.name}${isNum(d.perf) ? ' : ' + pr(d.perf) : ''}.\n\n${lines(pp.raisons).map(l => '• ' + l).join('\n')}`, t0 + ' #wolfportfolio'); }
    return '';
  }
  async function copyPub(k){ const ta = $('sdPub_' + k), msg = $('sdPubMsg'); if (!ta) return;
    try { await navigator.clipboard.writeText(ta.value); } catch(e){ ta.select(); document.execCommand('copy'); }
    if (msg){ msg.textContent = (k === 'yt' ? 'Texte YouTube' : 'Texte Facebook') + ' copié ✔'; setTimeout(() => { if (msg.isConnected) msg.textContent = ''; }, 2500); } }

  const DATA_KEYS = ['co', 'yrs', 'nom', 'op', 'gyrs'];
  return {
    view,
    _seek(i, q){ const a = active(), s = a[Math.min(i, a.length - 1)]; let acc = 0; for (const z of a){ if (z === s) break; acc += +z.dur || 3; } tt = acc + (+s.dur || 3) * Math.min(q, 0.999); playing = false; frame(); return $('sdShortCv').toDataURL('image/jpeg', 0.6); },
    _n: () => active().length,
    stop(){ playing = false; if (recording) stopRec(); stopCam(); stopScreen(); cancelAnimationFrame(raf); raf = 0; },
    key(e){ if (e.code === 'Space'){ toggleFreeze(); return true; } if (['ArrowRight', 'PageDown'].includes(e.key)){ if (!countdown) next(); return true; } if (['ArrowLeft', 'PageUp'].includes(e.key)){ if (!countdown) prev(); return true; } return false; },
    click(b){ const ds = b.dataset;
      if (ds.sdS === 'play'){ toggleFreeze(); return true; }
      if (ds.sdS === 'next'){ next(); return true; }
      if (ds.sdS === 'prev'){ prev(); return true; }
      if (ds.sdS === 'restart'){ tt = 0; playing = true; last = performance.now(); syncPlay(); return true; }
      if (ds.sdS === 'cam'){ cam ? (stopCam(), view()) : startCam(); return true; }
      if (ds.sdS === 'scr'){ startScreen(); return true; }
      if (ds.sdS === 'scrstop'){ stopScreen(); view(); return true; }
      if (ds.sdS === 'rec'){ recording ? stopRec() : (countdown > 0 ? null : startRec()); return true; }
      if (ds.sdS === 'pubreset'){ pubOv = { yt: null, fb: null }; ['yt', 'fb'].forEach(k => { const ta = $('sdPub_' + k); if (ta) ta.value = pubText(k); }); return true; }
      if (ds.sdS === 'corm'){ fc().p.co = null; persist(); reload(); return true; }
      if (ds.sdCopy){ copyPub(ds.sdCopy); return true; }
      if (ds.sdFmt){ if (recording) return true; getCfg().fmt = ds.sdFmt; persist(); playing = false; reload(); return true; }
      if (ds.sdCopick != null){ const r = coSugg[+ds.sdCopick]; if (r){ fc().p.co = { sym: r.symbol, name: r.name, logoid: r.logoid || null }; persist(); reload(); } return true; }
      const o = fc();
      if ((ds.sdUp != null || ds.sdDown != null) && !recording){ const i = +(ds.sdUp != null ? ds.sdUp : ds.sdDown), j = i + (ds.sdUp != null ? -1 : 1); if (j < 0 || j >= o.scenes.length) return true; [o.scenes[i], o.scenes[j]] = [o.scenes[j], o.scenes[i]]; persist(); view(); return true; }
      if (ds.sdGo != null){ const z = o.scenes[+ds.sdGo]; let acc = 0; for (const s of active()){ if (s === z) break; acc += +s.dur || 3; } tt = acc + 0.01; playing = true; syncPlay(); return true; }
      return false; },
    input(e){ const t = e.target, o = fc();
      if (t.id === 'sdCoQ'){ clearTimeout(t._tm); t._tm = setTimeout(() => coSearch(t.value), 250); return; }
      if (t.dataset.sdPub){ pubOv[t.dataset.sdPub] = t.value; return; }
      if (t.dataset.sdP && t.tagName !== 'SELECT'){ o.p[t.dataset.sdP] = t.value; persist(); pubOv = { yt: null, fb: null }; lastK = null; return; }
      if (t.dataset.sdTxt){ o.texts[t.dataset.sdTxt] = t.value; persist(); lastK = null; return; }
      if (t.dataset.sdDur != null){ const v = Math.max(0.5, Math.min(10, +t.value || 3)); o.scenes[+t.dataset.sdDur].dur = v; persist(); return; } },
    change(e){ const t = e.target, c = getCfg(), o = fc();
      if (t.dataset && t.dataset.sdP && t.tagName === 'SELECT'){ o.p[t.dataset.sdP] = t.value; persist(); if (DATA_KEYS.includes(t.dataset.sdP)) reload(); else { const u = stkUrl(t.value); if (u) img(u); pubOv = { yt: null, fb: null }; } return; }
      if (t.dataset && t.dataset.sdP && t.tagName !== 'SELECT'){ if (!recording) { pubOv = { yt: null, fb: null }; ['yt', 'fb'].forEach(k => { const ta = $('sdPub_' + k); if (ta) ta.value = pubText(k); }); } return; }
      if (t.id === 'sdManual'){ o.manual = t.checked; persist(); return; }
      if (t.dataset && t.dataset.sdSc){ c[t.dataset.sdSc] = t.value; persist(); if (t.dataset.sdSc === 'per' && !recording) reload(); return; }
      if (t.dataset && t.dataset.sdOn != null){ o.scenes[+t.dataset.sdOn].on = t.checked; persist(); tt = Math.min(tt, Math.max(0, total() - 0.01)); return; }
      if (t.id === 'sdCamSel' || t.id === 'sdMicSel'){ if (cam) startCam(); } }
  };
})();

/* ---------- clavier (short) : → / ← (ou télécommande) = étapes, Espace = figer l'écran ---------- */
const shortKeyOk = e => { if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return false; if (!['Space', 'ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp'].includes(e.code)) return false;
  const page = $(PAGE_ID); if (!page || !page.classList.contains('active') || ui.tab !== 'short') return false;
  const t = e.target; return !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))); };
document.addEventListener('keydown', e => { if (!shortKeyOk(e)) return; if (SHORT.key(e)) e.preventDefault(); });
document.addEventListener('keyup', e => { if (e.code === 'Space' && shortKeyOk(e)) e.preventDefault(); });   // un bouton qui a le focus ne doit pas être « cliqué » en plus

/* ---------- ouverture de la page ---------- */
let loaded = false;
async function onShow(){
  if (!loaded){ loaded = true; await load(); }
  shell();
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-page]'); if (!b) return; if (b.dataset.page === PAGE_ID) setTimeout(onShow, 0); else if (ui.tab === 'short') SHORT.stop(); });
window.STUDIO_UI = { onShow, _T: T, _short: SHORT, _render: async (i, vi, st) => { const t = T[i], s = Object.assign(newState(i), st || {}, { vi: vi || 0 }), cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; render(cv, t, s, await prep(t, s)); return cv; } };
})();
