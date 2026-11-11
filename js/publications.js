/* =====================================================================
   Publications (2026-11-11) — onglet « 📣 Publications » : génère des posts (PNG 1080 px, carré / portrait / story)
   à partir des données de l'appli, à la charte Wolf Academy (Roboto Slab, Lora italique dorée, JetBrains Mono espacée,
   filet or, fond uni). Vrais logos TradingView. Seul le Wolf Portfolio est publiable (décision de l'utilisateur) : le PEA
   et le CTO ne sont jamais lus ici.

   Un modèle = { k, group, name, desc, fields (réglages), build(P, o) -> blocs }. Les posts sont DESSINÉS sur un <canvas>
   (export PNG fiable, sans librairie) : chaque bloc a une hauteur et une fonction de dessin, l'espace libre est réparti
   entre les blocs pour que les trois formats restent équilibrés.
   Ailleurs dans l'appli, window.WOLF_PUB.open(modèle, réglages) ouvre directement un modèle prérempli.
   ===================================================================== */
(function(){
'use strict';
const PAGE_ID = 'pagePublications';
const W = 1080, HS = { f1: 1080, f45: 1350, f916: 1920 };
// Thèmes de couleur des posts (fond uni, sans quadrillage). « Nuit » = sombre ; « Blanc » et « Beige » = clairs, surlignage
// INVERSÉ (bande noire, texte or) pour se démarquer ; « Or » = fond doré, texte noir.
const THEMES = {
  nuit:  { label: 'Nuit',  bg: '#111315', bg2: '#15181C', card: '#1C2026', card2: '#262B32', ink: '#F4F5F7', ink2: '#D3D7DD', dim: '#9AA1AB', faint: '#6F7782', track: '#2A2F36', grid: 'rgba(255,255,255,.06)',
    hlBg: '#F2B33D', hlInk: '#111111', sig: 'rgba(242,243,245,.7)', edge: 'rgba(255,255,255,.08)', shadow: 'rgba(0,0,0,.45)', wolfBg: '#0B0D10', gold: '#F2B33D', gold2: '#FFD27A', green: '#3DDC97', red: '#FF5C64' },
  blanc: { label: 'Blanc', bg: '#FFFFFF', bg2: '#FFFFFF', card: '#F1F2F4', card2: '#E4E6E9', ink: '#121316', ink2: '#2E3238', dim: '#6B717B', faint: '#9AA0A8', track: '#E2E4E7', grid: 'rgba(0,0,0,.07)',
    hlBg: '#121316', hlInk: '#F2B33D', sig: 'rgba(18,19,22,.62)', edge: 'rgba(0,0,0,.07)', shadow: 'rgba(0,0,0,.14)', wolfBg: '#121316', gold: '#D8941B', gold2: '#F2B33D', green: '#0FA968', red: '#E0434C' },
  beige: { label: 'Beige', bg: '#F3ECDF', bg2: '#F6F0E6', card: '#E8DDC9', card2: '#DDCFB6', ink: '#1C1813', ink2: '#3B3228', dim: '#7A6E5E', faint: '#A49883', track: '#DACCB3', grid: 'rgba(60,40,10,.08)',
    hlBg: '#1C1813', hlInk: '#F2B33D', sig: 'rgba(28,24,19,.62)', edge: 'rgba(60,40,10,.10)', shadow: 'rgba(60,40,10,.18)', wolfBg: '#1C1813', gold: '#C98516', gold2: '#E9A83A', green: '#1B9660', red: '#CF3E48' },
  or:    { label: 'Or',    bg: '#F2B33D', bg2: '#F5BF57', card: 'rgba(18,19,22,.10)', card2: 'rgba(18,19,22,.18)', ink: '#121316', ink2: '#2B2414', dim: '#5E4A1E', faint: '#7A6230', track: 'rgba(18,19,22,.18)', grid: 'rgba(18,19,22,.12)',
    hlBg: '#121316', hlInk: '#F2B33D', sig: 'rgba(18,19,22,.7)', edge: 'rgba(18,19,22,.12)', shadow: 'rgba(80,50,0,.25)', wolfBg: '#121316', gold: '#121316', gold2: '#3A2C10', green: '#0B6B42', red: '#A3202A' },
};
const C = Object.assign({ blue: '#4A9FE0', white: '#FFFFFF', line: '#2A2F36' }, THEMES.nuit);
function setTheme(k){ Object.assign(C, THEMES[k] || THEMES.nuit); }
const F = { title: 'Anton, Impact, "Arial Narrow", sans-serif', body: '"Plus Jakarta Sans", "Segoe UI", sans-serif' };
const WOLF = 'data/wolf-tete.png';
const SERIES = [C.gold, C.blue, C.green, '#B8A1F0', '#F08A4B', '#5CC8D7', C.red, '#8FA3B8'];
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = v => typeof v === 'number' && isFinite(v);
const fr = (v, d = 0) => isNum(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const sgn = (v, d = 1, u = ' %') => isNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + fr(Math.abs(v), d) + u : '—';
const CUR = { EUR: '€', USD: '$', GBP: '£', GBX: 'p', CHF: 'CHF', JPY: '¥', CAD: '$ CA', DKK: 'kr', SEK: 'kr', NOK: 'kr' };
const money = (v, ccy = 'EUR', d = 2) => isNum(v) ? fr(v, d) + ' ' + (CUR[String(ccy).toUpperCase()] || ccy) : '—';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS3 = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => iso(new Date());
const dt = s => new Date(s + 'T12:00:00');
const addD = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
const frDate = s => { const d = dt(s); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };
const shortDate = s => { const d = dt(s); return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS3[d.getMonth()]; };
const tsIso = t => isNum(t) ? iso(new Date(t * 1000)) : null;
const duree = days => !isNum(days) ? '—' : days < 45 ? Math.round(days) + ' jours' : days < 365 * 2 ? Math.round(days / 30.4) + ' mois' : fr(days / 365, 1) + ' ans';

/* ---------- images (logos) : toujours en CORS, jamais de canvas « tainté » ---------- */
const imgCache = {};
function loadImg(url){
  if (!url) return Promise.resolve(null);
  if (!imgCache[url]) imgCache[url] = new Promise(res => {
    const im = new Image();
    if (!/^(data:|blob:)/.test(url) && !url.startsWith(location.origin) && /^https?:/.test(url)) im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => res(null); im.src = url;
  });
  return imgCache[url];
}
const tvLogo = id => id ? 'https://s3-symbol-logo.tradingview.com/' + id + '--big.svg' : '';

/* ---------- données TradingView ---------- */
const snapMemo = {};
async function snap(sym, fresh){
  if (!sym || typeof tvFetchSnapshot !== 'function') return null;
  const k = sym + (fresh ? '|f' : '');
  if (!snapMemo[k]) snapMemo[k] = tvFetchSnapshot(sym, !fresh).catch(() => fresh ? tvFetchSnapshot(sym, true).catch(() => null) : null);
  return snapMemo[k];
}
const histMemo = {};
async function history(sym, from){
  const k = sym + '|' + from;
  if (!histMemo[k]) histMemo[k] = (async () => {
    const r = await fetch('/api/tv/history?symbols=' + encodeURIComponent(sym) + '&from=' + from + '&adj=1', { cache: 'no-store' });
    const j = await r.json(); const h = j.ok && j.data && j.data[sym];
    if (!h || !h.bars || !h.bars.length) throw new Error('cours TradingView indisponibles pour ' + sym);
    return { ccy: h.ccy, d: h.bars.map(b => iso(new Date(b[0] * 1000))), c: h.bars.map(b => b[1]) };
  })().catch(e => { delete histMemo[k]; throw e; });
  return histMemo[k];
}
async function logoFor(item){
  if (!item) return null;
  if (item.logoid) return loadImg(tvLogo(item.logoid));
  if (item.sym){ const s = await snap(item.sym); if (s && s.logoid){ item.logoid = s.logoid; return loadImg(tvLogo(s.logoid)); } }
  if (item.logo) return loadImg(item.logo);
  return null;
}

/* ---------- Wolf Portfolio (lecture seule, via « Mes portefeuilles ») ---------- */
async function wolf(){
  if (!window.MP_UI || !window.MP_ENGINE) throw new Error('Mes portefeuilles n\'est pas chargé.');
  let st = MP_UI._state();
  if (!st.D || !st.S || !Object.keys(st.S).length){ await MP_UI.reload(); st = MP_UI._state(); }
  if (!st.D) throw new Error('Données du Wolf Portfolio indisponibles (serveur local ?).');
  const D = st.D, ops = (D.accounts.wolf && D.accounts.wolf.ops) || [];
  const sym = s => { const m = D.symbols[s] || {}; return { sym: s, name: m.nom || s.split(':')[1] || s, logoid: m.logoid || null, ccy: m.ccy || 'EUR' }; };
  return { D, S: st.S || {}, ops, E: MP_ENGINE, sym, cac: D.config.cac || 'EURONEXT:PX1', spx: D.config.spx || 'SP:SPX' };
}

/* ======================= DESSIN (style validé le 2026-11-11 : titres condensés SANS accents, surlignage or,
   logos en grand, gros chiffres, fond uni à quadrillage léger, signature discrète en bas, sans pastille) ======================= */
const up = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
function mk(fmt){
  const c = document.createElement('canvas'); c.width = W; c.height = HS[fmt]; const x = c.getContext('2d');
  const g = x.createRadialGradient(W / 2, c.height * 0.4, 50, W / 2, c.height * 0.4, c.height * 0.8); g.addColorStop(0, C.bg2); g.addColorStop(1, C.bg);
  x.fillStyle = g; x.fillRect(0, 0, W, c.height);
  const P = { c, x, fmt, H: c.height, L: 76, R: W - 76, CW: W - 152, big: fmt === 'f916', small: fmt === 'f1', ov: {}, fields: [], info: null };
  // Texte modifiable à la main : chaque texte affiché est enregistré (clé, libellé, valeur d'origine) ; une valeur saisie le remplace.
  P.t = (key, label, val) => { if (val == null || val === '') return val; if (!P.fields.some(f => f.key === key)) P.fields.push({ key, label, val: String(val) }); const v = P.ov[key]; return v != null && v !== '' ? v : val; };
  return P;
}
function txt(x, s, X, Y, f, col, align){ x.font = f; x.fillStyle = col; x.textAlign = align || 'left'; x.textBaseline = 'alphabetic'; x.fillText(s, X, Y); }
function wrap(x, s, f, maxW){
  x.font = f; const out = [];
  String(s).split('\n').forEach(par => { let line = ''; par.split(/\s+/).forEach(w => { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line){ out.push(line); line = w; } else line = t; }); out.push(line); });
  return out;
}
function fit(x, s, fam, size, maxW, min){ let k = size; x.font = fam.replace('%', k); while (k > (min || 20) && x.measureText(s).width > maxW){ k -= 2; x.font = fam.replace('%', k); } return k; }
const TT = k => '400 ' + k + 'px ' + F.title;          // Anton (un seul graisse)
const BD = (w, k) => w + ' ' + k + 'px ' + F.body;
function rr(x, X, Y, w, h, r, fill, stroke){
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  if (fill){ x.fillStyle = fill; x.fill(); } if (stroke){ x.strokeStyle = stroke; x.lineWidth = 2; x.stroke(); }
}
function drawLogo(x, im, cx, cy, half){
  if (typeof drawLogoInCircle === 'function') drawLogoInCircle(x, im, cx, cy, half, im.src);
  else { const k = Math.max(2 * half / im.width, 2 * half / im.height); x.drawImage(im, cx - im.width * k / 2, cy - im.height * k / 2, im.width * k, im.height * k); }
}
function fallbackMark(x, cx, cy, r, name){ x.fillStyle = C.card2; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); txt(x, up(name).slice(0, 1), cx, cy + r * 0.38, TT(Math.round(r * 1.05)), C.gold, 'center'); }
// logo rond
function logoC(x, im, cx, cy, r, name){
  x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.closePath(); x.fillStyle = '#FFFFFF'; x.fill(); x.clip();
  if (im) drawLogo(x, im, cx, cy, r); else fallbackMark(x, cx, cy, r, name);
  x.restore();
}
// logo en tuile arrondie (façon icône d'appli), avec ombre
function logoT(x, im, X, Y, s, name){
  x.save(); x.shadowColor = C.shadow; x.shadowBlur = 36; x.shadowOffsetY = 16; rr(x, X, Y, s, s, s * 0.26, '#FFFFFF'); x.restore();
  x.save(); rr(x, X, Y, s, s, s * 0.26); x.clip(); if (im) drawLogo(x, im, X + s / 2, Y + s / 2, s / 2); else fallbackMark(x, X + s / 2, Y + s / 2, s / 2, name); x.restore();
  rr(x, X, Y, s, s, s * 0.26, null, C.edge);
}
// Signature discrète en bas (sans pastille) + source au-dessus
async function frame(P, label, source){
  const x = P.x, head = await loadImg(WOLF), cy = P.H - 64;
  x.font = BD(700, 28); const tw = x.measureText('Wolf Academy Invest').width, s = 46, tot = s + 14 + tw, X0 = (W - tot) / 2;
  if (head){ const k = s / Math.max(head.width, head.height); x.globalAlpha = 0.9; x.drawImage(head, X0, cy - head.height * k / 2, head.width * k, head.height * k); x.globalAlpha = 1; }
  txt(x, 'Wolf Academy Invest', X0 + s + 14, cy + 10, BD(700, 28), C.sig);
  if (source) txt(x, source, W / 2, P.H - 118, BD(500, 23), C.faint, 'center');
}
function compose(P, blocks){
  // Mise en page sûre : on retire / réduit des éléments tant que tout (titre + blocs + écarts minimaux) ne tient pas
  // entre le haut et la signature, puis on répartit l'espace restant en écarts égaux. Rien ne peut déborder.
  const top = P.big ? 150 : 96, bot = P.H - 160, area = bot - top, MIN = P.small ? 22 : 28;
  blocks = blocks.filter(Boolean);
  for (let guard = 0; guard < 40; guard++){
    const live = blocks.filter(b => b.h > 0), need = live.reduce((s, b) => s + b.h, 0) + MIN * live.length;
    if (need <= area) break;
    const r = blocks.slice().reverse().find(b => b.h > 0 && b.shrink && b.shrink()); if (!r) break;
  }
  blocks = blocks.filter(b => b.h > 0);
  const m = blocks.length; if (!m) return;
  const title = blocks[0], rest = blocks.slice(1), rs = rest.reduce((s, b) => s + b.h, 0);
  const free = Math.max(0, area - title.h - rs), g = rest.length ? Math.min(P.big ? 130 : 84, free / (rest.length + 1)) : 0;
  // le surplus éventuel (au-delà des écarts maximaux) est réparti : un tiers en haut, deux tiers en bas
  const extra = Math.max(0, free - g * (rest.length + 1)), off = extra / 3;
  let y = top; title.draw(y); y += title.h + g + off;
  P.layout = [{ y: top, h: title.h }];
  rest.forEach(b => { b.draw(y); P.layout.push({ y, h: b.h }); y += b.h + g; });
  P.bottom = y - g;
}
/* ---------- blocs ---------- */
const B = {
  // Titre condensé en capitales SANS accents + surlignage or (sous-titre ou, à défaut, sur-titre)
  title(P, eyebrow, title, sub){
    title = P.t('titre', 'Titre', title); sub = P.t('surl', 'Surlignage', sub || eyebrow || ''); eyebrow = null;
    const x = P.x, size = P.small ? 116 : 132, T = up(title), lines = wrap(x, T, TT(size), P.CW).slice(0, 3);
    const hl = sub || eyebrow || '', hf = BD(800, P.small ? 36 : 40);
    x.font = hf; let hlTxt = hl; while (hlTxt && x.measureText(hlTxt).width > P.CW - 40) hlTxt = hlTxt.slice(0, -2);
    if (hlTxt !== hl) hlTxt = hlTxt.trim() + '…';
    const h = lines.length * size * 0.94 + (hl ? 26 + (P.small ? 54 : 60) : 0);
    return { h, draw(y){
      lines.forEach((l, i) => txt(x, l, P.L, y + size * 0.86 + i * size * 0.94, TT(size), C.ink));
      if (hl){ const Y = y + lines.length * size * 0.94 + 26, hh = P.small ? 54 : 60; x.font = hf; const w = x.measureText(hlTxt).width + 34; rr(x, P.L, Y, w, hh, 9, C.hlBg); txt(x, hlTxt, P.L + 17, Y + hh * 0.72, hf, C.hlInk); }
    } };
  },
  big(P, value, color, caption){
    value = P.t('chiffre', 'Grand chiffre', value); caption = P.t('chiffreTxt', 'Texte sous le grand chiffre', caption);
    const x = P.x, size = P.small ? 210 : P.big ? 270 : 250, cf = BD(600, P.small ? 32 : 37);
    const k = fit(x, value, TT('%'), size, P.CW, 90);
    const caps = caption ? wrap(x, caption, cf, P.CW).slice(0, 2) : [];
    return { h: k * 0.92 + (caps.length ? 16 + caps.length * 46 : 0), draw(y){
      txt(x, value, P.L - 4, y + k * 0.86, TT(k), color || C.ink);
      caps.forEach((c, i) => txt(x, c, P.L, y + k * 0.92 + 16 + 36 + i * 46, cf, C.ink2));
    } };
  },
  kpis(P, items){
    items = items.filter(Boolean).map((it, i) => Object.assign({}, it, { l: P.t('k' + i + 'l', 'Case ' + (i + 1) + ' : titre', it.l), v: P.t('k' + i + 'v', 'Case ' + (i + 1) + ' : chiffre', it.v) }));
    items = items.filter(Boolean).slice(0, 3); const x = P.x, n = items.length, g = 20, w = (P.CW - g * (n - 1)) / n, h = P.small ? 140 : 160;
    const blk = { h, shrink(){ if (!blk.h || P.big) return false; blk.h = 0; return true; }, draw(y){ if (!blk.h) return; items.forEach((it, i) => { const X = P.L + i * (w + g); rr(x, X, y, w, h, 26, C.card);
      txt(x, it.l, X + 28, y + 50, BD(600, 27), C.dim);
      const k = fit(x, it.v, TT('%'), P.small ? 52 : 58, w - 56, 26); txt(x, it.v, X + 28, y + 50 + 16 + k * 0.95, TT(k), it.c || C.ink); }); } };
    return blk;
  },
  head(P, im, name, tag, tagColor, sub){
    name = P.t('nom', 'Nom', name); tag = P.t('etiq', 'Étiquette', tag);
    const x = P.x, s = P.small ? 170 : 200, h = s;
    return { h, draw(y){
      logoT(x, im, P.L, y, s, name);
      const X = P.L + s + 40, N = up(name), k = fit(x, N, TT('%'), P.small ? 92 : 108, P.R - X, 44);
      txt(x, N, X, y + s / 2 + (tag ? -2 : k * 0.35), TT(k), C.ink);
      if (tag){ const tf = BD(800, P.small ? 30 : 33); x.font = tf; const tw = x.measureText(tag).width + 70, th = P.small ? 54 : 60, Y = y + s / 2 + 22;
        const bg = tagColor === C.red ? 'rgba(255,92,100,.16)' : tagColor === C.green ? 'rgba(61,220,151,.16)' : 'rgba(242,179,61,.16)';
        rr(x, X, Y, tw, th, th / 2, bg); x.beginPath(); x.arc(X + 26, Y + th / 2, 7, 0, Math.PI * 2); x.fillStyle = tagColor || C.gold; x.fill(); txt(x, tag, X + 46, Y + th * 0.68, tf, tagColor || C.gold); }
      if (sub && !tag) txt(x, sub, X, y + s / 2 + 52, BD(600, 28), C.dim);
    } };
  },
  pills(P, items){
    items = items.filter(Boolean).map((it, i) => Object.assign({}, it, { v: P.t('p' + i, it.l, it.v) }));
    const x = P.x, h = 62;
    return { h, draw(y){ let X = P.L; items.filter(Boolean).forEach(it => { x.font = BD(600, 27); const w1 = x.measureText(it.l + '  ').width; x.font = BD(800, 27); const w = w1 + x.measureText(it.v).width + 44;
      rr(x, X, y, w, h, 16, C.card); txt(x, it.l, X + 22, y + 41, BD(600, 27), C.dim); txt(x, it.v, X + 22 + w1, y + 41, BD(800, 27), it.c || C.ink); X += w + 14; }); } };
  },
  rows(P, items){
    items = items.map((it, i) => Object.assign({}, it, { name: P.t('l' + i + 'n', 'Ligne ' + (i + 1) + ' : nom', it.name), sub: P.t('l' + i + 's', 'Ligne ' + (i + 1) + ' : détail', it.sub), mid: P.t('l' + i + 'm', 'Ligne ' + (i + 1) + ' : date', it.mid), right: P.t('l' + i + 'r', 'Ligne ' + (i + 1) + ' : chiffre', it.right) }));
    const x = P.x, rh = items.length <= 3 ? (P.small ? 112 : 128) : P.small ? 92 : 106, g = 14;
    const blk = { h: items.length * (rh + g) - g, shrink(){ if (!items.length) return false; items = items.slice(0, -1); blk.h = items.length ? items.length * (rh + g) - g : 0; return true; }, draw(y){ items.forEach((it, i) => { const Y = y + i * (rh + g); rr(x, P.L, Y, P.CW, rh, 22, C.card);
      const s = rh - 30; logoT(x, it.img, P.L + 15, Y + 15, s, it.name);
      const X = P.L + 15 + s + 24, rightW = it.right ? 250 : 0;
      const k = fit(x, it.name, BD(800, '%'), 34, P.R - X - rightW - (it.mid ? 230 : 0) - 20, 20);
      txt(x, it.name, X, Y + rh / 2 + (it.sub ? -4 : 12), BD(800, k), C.ink);
      if (it.sub) txt(x, it.sub, X, Y + rh / 2 + 32, BD(500, 24), C.dim);
      if (it.mid) txt(x, it.mid, P.R - rightW - 30, Y + rh / 2 + 11, BD(800, 28), C.gold, 'right');
      if (it.pill){ const pf = BD(800, 27); x.font = pf; const w = x.measureText(it.right).width + 58; rr(x, P.R - 22 - w, Y + rh / 2 - 26, w, 52, 26, it.pillBg);
        x.beginPath(); x.arc(P.R - 22 - w + 22, Y + rh / 2, 7, 0, Math.PI * 2); x.fillStyle = it.rightColor; x.fill(); txt(x, it.right, P.R - 22 - w + 38, Y + rh / 2 + 10, pf, it.rightColor); }
      else if (it.right){ txt(x, it.right, P.R - 26, Y + rh / 2 + (it.rightSub ? 0 : 15), TT(P.small ? 40 : 46), it.rightColor || C.ink, 'right');
        if (it.rightSub) txt(x, it.rightSub, P.R - 26, Y + rh / 2 + 34, BD(500, 21), C.dim, 'right'); }
    }); } };
    return blk;
  },
  rings(P, items, max){
    items = items.map((it, i) => Object.assign({}, it, { label: P.t('r' + i + 'l', 'Logo ' + (i + 1) + ' : étiquette', it.label), text: P.t('r' + i + 'v', 'Logo ' + (i + 1) + ' : chiffre', it.text) }));
    const x = P.x, cols = items.length <= 3 ? items.length : items.length <= 8 ? 4 : 5, rowsN = Math.ceil(items.length / cols), cw = P.CW / cols;
    const r = Math.min(cw * 0.36, P.small ? 66 : 74), rowH = 2 * r + (P.small ? 132 : 162);
    const blk = { h: rowsN * rowH, shrink(){ if (items.length <= cols) return false; items = items.slice(0, items.length - cols); blk.h = Math.ceil(items.length / cols) * rowH; return true; }, draw(y){ items.forEach((it, i) => { const cx = P.L + cw * (i % cols) + cw / 2, Y = y + Math.floor(i / cols) * rowH, cy = Y + 52 + r + 14;
      txt(x, it.label, cx, Y + 34, BD(700, P.small ? 26 : 30), C.ink2, 'center');
      x.beginPath(); x.arc(cx, cy, r + 13, 0, Math.PI * 2); x.strokeStyle = C.track; x.lineWidth = 9; x.stroke();
      const f = Math.max(0.02, Math.min(1, (it.ring != null ? it.ring : it.v / max)));
      x.beginPath(); x.arc(cx, cy, r + 13, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); x.strokeStyle = C.gold; x.lineCap = 'round'; x.stroke(); x.lineCap = 'butt';
      logoC(x, it.img, cx, cy, r, it.name);
      if (i < 3){ const bx = cx - r - 4, by = cy - r + 4; x.save(); x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 12; x.beginPath(); x.arc(bx, by, 24, 0, Math.PI * 2); x.fillStyle = C.hlBg; x.fill(); x.restore(); txt(x, String(i + 1), bx, by + 9, BD(800, 25), C.hlInk, 'center'); }
      txt(x, it.text, cx, cy + r + 70, TT(P.small ? 50 : 56), C.ink, 'center');
    }); } };
    return blk;
  },
  bars(P, items, max){
    items = items.map((it, i) => Object.assign({}, it, { text: P.t('b' + i, 'Barre ' + (i + 1) + ' (' + it.name + ')', it.text) }));
    const x = P.x, rh = P.small ? 66 : 78, g = P.small ? 16 : 22;
    const blk = { h: items.length * (rh + g) - g, shrink(){ if (items.length <= 2) return false; items = items.slice(0, -1); blk.h = items.length * (rh + g) - g; return true; }, draw(y){ items.forEach((it, i) => { const Y = y + i * (rh + g), r = rh / 2; logoC(x, it.img, P.L + r, Y + r, r, it.name);
      const X = P.L + 2 * r + 22, tw = 170, bw = P.R - X - tw - 16, f = Math.max(0.01, Math.min(1, Math.abs(it.v) / max));
      rr(x, X, Y + rh * 0.16, bw, rh * 0.68, rh * 0.22, C.card);
      const grd = x.createLinearGradient(X, 0, X + bw * f, 0); grd.addColorStop(0, it.v < 0 ? '#9C3F45' : C.gold); grd.addColorStop(1, it.v < 0 ? C.red : C.gold2);
      rr(x, X, Y + rh * 0.16, Math.max(rh * 0.44, bw * f), rh * 0.68, rh * 0.22, grd);
      txt(x, it.text, P.R, Y + r + 17, TT(P.small ? 44 : 50), C.ink, 'right');
    }); } };
    return blk;
  },
  // Barres verticales de comparaison (portefeuille contre indices), valeurs au-dessus, étiquette et pastille dessous
  scale(P, lines, cours, ccy){
    const x = P.x, h = P.small ? 260 : 320;
    return { h, draw(y){
      const vs = lines.map(l => l.v).concat([cours]), lo = Math.min(...vs) * 0.85, hi = Math.max(...vs) * 1.08, X0 = P.L + 10, X1 = P.R - 10, px = v => X0 + (X1 - X0) * (v - lo) / (hi - lo);
      const by = y + 120, bh = 26, g = x.createLinearGradient(X0, 0, X1, 0); g.addColorStop(0, C.green); g.addColorStop(0.5, C.gold); g.addColorStop(1, C.red);
      rr(x, X0, by, X1 - X0, bh, bh / 2, g);
      lines.slice().sort((a, b) => a.v - b.v).forEach((l, i) => { const X = px(l.v); x.fillStyle = C.bg; x.fillRect(X - 3, by - 6, 6, bh + 12);
        const name = l.label.split(' ')[0], f1 = BD(800, P.small ? 24 : 27), f2 = TT(P.small ? 36 : 42);
        txt(x, name, X, by + bh + 46, f1, l.color, 'center'); txt(x, money(l.v, ccy, 0), X, by + bh + 46 + (P.small ? 40 : 46), f2, C.ink, 'center'); });
      const cx = px(cours); x.beginPath(); x.moveTo(cx, by - 4); x.lineTo(cx - 16, by - 30); x.lineTo(cx + 16, by - 30); x.closePath(); x.fillStyle = C.ink; x.fill();
      const lab = 'Cours ' + money(cours, ccy, 0), lf = BD(800, 28); x.font = lf; const tw = x.measureText(lab).width + 30, tx = Math.max(X0, Math.min(X1 - tw, cx - tw / 2));
      rr(x, tx, by - 88, tw, 48, 14, C.ink); txt(x, lab, tx + 15, by - 54, lf, C.bg);
    } };
  },
  cmpBars(P, items){
    items = items.map((it, i) => Object.assign({}, it, { text: P.t('c' + i + 'v', it.label + ' : chiffre', it.text), label: P.t('c' + i + 'l', 'Barre ' + (i + 1) + ' : nom', it.label) }));
    const x = P.x;
    const blk = { h: P.small ? 470 : P.big ? 680 : 560, shrink(){ if (blk.h <= (P.small ? 320 : 380)) return false; blk.h -= 40; return true; }, draw(y){ const h = blk.h;
      const n = items.length, bw = Math.min(230, (P.CW - 60 * (n - 1)) / n), gap = (P.CW - bw * n) / Math.max(1, n - 1), base = y + h - 150, top = y + 90;
      const vals = items.map(i => i.v), mx = Math.max(...vals.map(Math.abs), 0.1);
      items.forEach((it, i) => { const X = P.L + i * (bw + gap), bh = Math.max(16, Math.abs(it.v) / mx * (base - top)), by = base - bh;
        let fill = it.color; if (it.grad){ fill = x.createLinearGradient(0, by, 0, by + bh); fill.addColorStop(0, C.gold2); fill.addColorStop(1, C.gold); }
        rr(x, X, by, bw, bh, Math.min(28, bh / 2, bw / 6), fill);
        txt(x, it.text, X + bw / 2, by - 22, TT(P.small ? 62 : 72), it.v > 0.05 ? C.green : it.v < -0.05 ? C.red : C.ink, 'center');
        const s = 84, ly = base + 26;
        if (it.img){ rr(x, X + bw / 2 - s / 2, ly, s, s, 22, C.wolfBg, it.ring || null); const k = (s - 14) / Math.max(it.img.width, it.img.height); x.drawImage(it.img, X + bw / 2 - it.img.width * k / 2, ly + s / 2 - it.img.height * k / 2, it.img.width * k, it.img.height * k); }
        else { rr(x, X + bw / 2 - s / 2, ly, s, s, 22, it.chip || '#C9CED5'); const t = it.short || ''; const k = fit(x, t, TT('%'), 40, s - 12, 18); txt(x, t, X + bw / 2, ly + s / 2 + k * 0.36, TT(k), '#111111', 'center'); }
        txt(x, it.label, X + bw / 2, ly + s + 40, BD(800, 29), C.ink, 'center');
      });
    } };
    return blk;
  },
  // Rangée de logos (opérations du mois) avec pastille + / −
  logoRow(P, items, caption){
    caption = P.t('logosTxt', 'Texte au-dessus des logos', caption);
    const x = P.x, s = P.small ? 104 : 124, h = s + (caption ? 64 : 0);
    const blk = { h, draw(y){
      if (caption) txt(x, caption, W / 2, y + 34, BD(700, 30), C.ink2, 'center');
      const n = items.length, g = 26, tot = n * s + (n - 1) * g; let X = (W - tot) / 2; const Y = y + (caption ? 64 : 0);
      items.forEach(it => { logoT(x, it.img, X, Y, s, it.name); if (it.badge){ x.beginPath(); x.arc(X + s - 6, Y + s - 6, 24, 0, Math.PI * 2); x.fillStyle = it.badgeColor; x.fill(); x.lineWidth = 6; x.strokeStyle = C.bg; x.stroke(); txt(x, it.badge, X + s - 6, Y + s + 4, BD(800, 28), '#111111', 'center'); } X += s + g; });
    }, shrink(){ if (!items.length) return false; items = []; blk.h = 0; return true; } };
    return blk;
  },
  vbars(P, labels, values, unit, h){
    const x = P.x;
    const blk = { h: h || (P.small ? 420 : P.big ? 640 : 520), shrink(){ if (blk.h <= 260) return false; blk.h -= 40; return true; }, draw(y){ const h = blk.h; const vals = values.map(v => isNum(v) ? v : 0), max = Math.max(...vals.map(Math.abs), 1e-9), n = vals.length, gw = P.CW / n, bw = Math.min(58, gw * 0.64), base = y + h - 46, top = y + 60;
      vals.forEach((v, i) => { const bh = Math.abs(v) / max * (base - top), X = P.L + gw * i + (gw - bw) / 2, last = i === n - 1;
        let fill = v < 0 ? C.red : C.gold; if (last){ fill = x.createLinearGradient(0, base - bh, 0, base); fill.addColorStop(0, C.gold2); fill.addColorStop(1, C.gold); }
        rr(x, X, base - bh, bw, Math.max(bh, 3), Math.min(12, bw / 3), fill);
        const st = Math.ceil(n / 10); if (n <= 12 || (i % st === 0 && n - 1 - i >= st) || last) txt(x, n > 12 ? '’' + String(labels[i]).slice(-2) : String(labels[i]), X + bw / 2, base + 38, BD(600, 22), C.dim, 'center');
        if (last || i === 0) txt(x, unit(v), X + bw / 2, base - bh - 16, TT(P.small ? 36 : 42), last ? C.gold2 : C.dim, 'center'); });
    } };
    return blk;
  },
  line(P, series, opts){
    opts = opts || {}; const x = P.x;
    const blk = { h: opts.h || (P.small ? 400 : P.big ? 620 : 500), shrink(){ if (blk.h <= (opts.noShrinkBelow || (P.small ? 170 : 240))) return false; blk.h -= 40; return true; }, draw(y){ const h = blk.h;
      const all = series.flatMap(s => s.values.filter(isNum)).concat((opts.hlines || []).map(l => l.v)), lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08 || 1;
      const min = lo - pad, max = hi + pad, X0 = P.L + 10, X1 = P.R - 10, Y0 = y + 24, Y1 = y + h - 50;
      const n = Math.max(...series.map(s => s.values.length)), px = i => X0 + (X1 - X0) * i / Math.max(1, n - 1), py = v => Y1 - (v - min) / (max - min) * (Y1 - Y0);
      rr(x, P.L - 6, y, P.CW + 12, h, 26, C.card);
      for (let k = 1; k < 4; k++){ x.fillStyle = C.grid; x.fillRect(X0, Y0 + (Y1 - Y0) * k / 4, X1 - X0, 2); }
      if (opts.zero && min < 0 && max > 0){ x.setLineDash([8, 10]); x.strokeStyle = C.track; x.lineWidth = 2; x.beginPath(); x.moveTo(X0, py(0)); x.lineTo(X1, py(0)); x.stroke(); x.setLineDash([]); }
      // Bande des prix justes, SOUS la courbe : rouge (pessimiste, le plus bas) → jaune (réaliste) → vert (optimiste, le plus haut), très transparente
      if (opts.band && (opts.hlines || []).length > 1){
        const vs = opts.hlines.map(l => l.v).sort((a, b) => a - b), lo = vs[0], hi = vs[vs.length - 1], mid = vs.length > 2 ? vs[1] : (lo + hi) / 2;
        const yT = py(hi), yB = py(lo), g = x.createLinearGradient(0, yB, 0, yT), t = hi > lo ? (mid - lo) / (hi - lo) : 0.5;
        g.addColorStop(0, 'rgba(255,92,100,0.24)'); g.addColorStop(Math.min(0.98, Math.max(0.02, t)), 'rgba(242,196,61,0.24)'); g.addColorStop(1, 'rgba(61,220,151,0.26)');
        x.fillStyle = g; x.fillRect(X0, yT, X1 - X0, yB - yT);
      }
      let lastLab = null; const labs = [];   // étiquettes dessinées APRÈS la courbe, pour rester lisibles
      (opts.hlines || []).slice().sort((a, b) => b.v - a.v).forEach(l => { x.setLineDash([12, 10]); x.strokeStyle = l.color; x.lineWidth = 3; x.beginPath(); x.moveTo(X0, py(l.v)); x.lineTo(X1, py(l.v)); x.stroke(); x.setLineDash([]);
        let ly = py(l.v) - 44; if (lastLab != null && ly < lastLab + 42) ly = lastLab + 42; lastLab = ly;
        const lf = BD(800, 23); x.font = lf; const tw = x.measureText(l.label).width + 26, lx = opts.band ? X0 + 4 : X1 - tw - 4; labs.push(() => { rr(x, lx, ly, tw, 36, 9, C.bg); txt(x, l.label, lx + 13, ly + 25, lf, l.color); }); });
      series.forEach((s, si) => {
        const pts = s.values.map((v, i) => isNum(v) ? [px(i), py(v)] : null).filter(Boolean); if (pts.length < 2) return;
        if (s.fill){ const g = x.createLinearGradient(0, Y0, 0, Y1); g.addColorStop(0, s.color + '55'); g.addColorStop(1, s.color + '00'); x.beginPath(); x.moveTo(pts[0][0], Y1); pts.forEach(p => x.lineTo(p[0], p[1])); x.lineTo(pts[pts.length - 1][0], Y1); x.closePath(); x.fillStyle = g; x.fill(); }
        x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.strokeStyle = s.color; x.lineWidth = s.width || 5; x.lineJoin = 'round'; x.stroke();
        const e = pts[pts.length - 1]; x.beginPath(); x.arc(e[0], e[1], si === series.length - 1 ? 11 : 8, 0, Math.PI * 2); x.fillStyle = s.color; x.fill();
        if (opts.last && si === series.length - 1){ const lf = BD(800, 28); x.font = lf; const tw = x.measureText(opts.last).width + 28, ty = Math.max(Y0 + 4, Math.min(Y1 - 44, e[1] - 58)); rr(x, e[0] - tw + 10, ty, tw, 44, 12, C.ink); txt(x, opts.last, e[0] - tw + 24, ty + 31, lf, C.bg); }
      });
      labs.forEach(f => f());
      if (opts.labels){ txt(x, opts.labels[0], X0, Y1 + 38, BD(600, 22), C.dim); txt(x, opts.labels[1], X1, Y1 + 38, BD(600, 22), C.dim, 'right'); }
      if (opts.legend){ let LX = X0 + 6; opts.legend.forEach(l => { x.fillStyle = l.color; rr(x, LX, Y0 + 2, 30, 8, 4, l.color); txt(x, l.label, LX + 42, Y0 + 14, BD(700, 24), C.dim); x.font = BD(700, 24); LX += 76 + x.measureText(l.label).width; }); }
    } };
    return blk;
  },
  donut(P, items, center){
    const x = P.x, h = P.small ? 480 : P.big ? 640 : 580;
    return { h, draw(y){
      const r = Math.min(h / 2 - 20, P.CW * 0.25), cx = P.L + r + 6, cy = y + h / 2, tot = items.reduce((s, i) => s + i.v, 0);
      let a = -Math.PI / 2; items.forEach((it, i) => { const da = it.v / tot * Math.PI * 2; x.beginPath(); x.arc(cx, cy, r, a, a + da); x.arc(cx, cy, r * 0.62, a + da, a, true); x.closePath(); x.fillStyle = it.color || SERIES[i % SERIES.length]; x.fill(); x.strokeStyle = C.bg; x.lineWidth = 5; x.stroke(); a += da; });
      if (center){ const s = r * 0.9, k = s / Math.max(center.width, center.height); x.drawImage(center, cx - center.width * k / 2, cy - center.height * k / 2, center.width * k, center.height * k); }
      const LX = cx + r + 54, rowH = Math.min(82, (h - 20) / items.length);
      items.forEach((it, i) => { const Y = y + (h - rowH * items.length) / 2 + i * rowH + rowH / 2;
        rr(x, LX, Y - 8, 22, 16, 5, it.color || SERIES[i % SERIES.length]);
        const NX = it.sym ? LX + 100 : LX + 42; if (it.sym) logoT(x, it.img, LX + 38, Y - rowH * 0.34, rowH * 0.68, it.name);
        const k = fit(x, it.name, BD(700, '%'), 29, P.R - NX - 130, 18); txt(x, it.name, NX, Y + 10, BD(700, k), C.ink);
        txt(x, fr(it.v / tot * 100, 1) + ' %', P.R, Y + 14, TT(38), C.ink, 'right'); });
    } };
  },
  duel(P, a, b){
    a = Object.assign({}, a, { value: P.t('dav', a.name + ' : montant', a.value), sub: P.t('das', a.name + ' : multiple', a.sub) }); b = Object.assign({}, b, { value: P.t('dbv', b.name + ' : montant', b.value), sub: P.t('dbs', b.name + ' : multiple', b.sub) });
    const x = P.x, h = P.small ? 360 : 410;
    return { h, draw(y){ [a, b].forEach((s, i) => { const w = (P.CW - 22) / 2, X = P.L + i * (w + 22); rr(x, X, y, w, h, 28, C.card);
      const ls = P.small ? 120 : 140; logoT(x, s.img, X + w / 2 - ls / 2, y + 34, ls, s.name);
      const k = fit(x, s.name, BD(800, '%'), 30, w - 40, 18); txt(x, s.name, X + w / 2, y + 34 + ls + 50, BD(800, k), C.dim, 'center');
      const kk = fit(x, s.value, TT('%'), P.small ? 78 : 92, w - 40, 30); txt(x, s.value, X + w / 2, y + 34 + ls + 56 + kk, TT(kk), s.win ? C.green : C.ink, 'center');
      txt(x, s.sub, X + w / 2, y + h - 26, BD(700, 26), C.dim, 'center'); }); } };
  },
  image(P, im, maxH){
    const x = P.x, k = Math.min(P.CW / im.width, (maxH || 700) / im.height), w = im.width * k, h = im.height * k;
    return { h: h + 40, draw(y){ rr(x, P.L, y, P.CW, h + 40, 26, C.card); x.drawImage(im, P.L + (P.CW - w) / 2, y + 20, w, h); } };
  },
  para(P, s, maxLines){
    s = P.t('texte', 'Texte', s);
    const x = P.x, f = BD(500, P.small ? 32 : 36), lines = wrap(x, s, f, P.CW - 60).slice(0, maxLines || 10), lh = P.small ? 46 : 52;
    return { h: lines.length * lh + 50, draw(y){ rr(x, P.L, y, P.CW, lines.length * lh + 50, 26, C.card); lines.forEach((l, i) => txt(x, l, P.L + 30, y + 25 + lh * (i + 1) - 12, f, C.ink)); } };
  },
  note(P, s){ s = P.t('note', 'Note en bas', s); const x = P.x; const blk = { h: 34, shrink(){ if (!blk.h) return false; blk.h = 0; return true; }, draw(y){ if (blk.h) txt(x, s, P.L, y + 26, BD(500, 24), C.faint); } }; return blk; },
};
const cap = (P, s, m, l) => P.small ? s : P.big ? l : m;   // nombre d'éléments selon le format

/* ======================= MODÈLES ======================= */
const SCEN = [['real', 'Réaliste'], ['pess', 'Pessimiste'], ['opt', 'Optimiste']];
const RANGES = [['1m', '1 mois', 30], ['3m', '3 mois', 91], ['6m', '6 mois', 182], ['1a', '1 an', 365], ['3a', '3 ans', 1096], ['5a', '5 ans', 1826], ['10a', '10 ans', 3652], ['20a', '20 ans', 7305]];
const METRICS = {
  net_margin_ttm: { l: 'Marge nette (12 mois)', u: '%', d: 1, t: 'Les rois des marges', s: 'Marge nette des 12 derniers mois' },
  operating_margin: { l: 'Marge opérationnelle', u: '%', d: 1, t: 'Qui gagne le plus sur ses ventes ?', s: 'Marge opérationnelle' },
  return_on_invested_capital_fy: { l: 'ROIC', u: '%', d: 1, t: 'Les meilleurs allocateurs de capital', s: 'Rentabilité du capital investi (ROIC)' },
  dividends_yield_current: { l: 'Rendement du dividende', u: '%', d: 2, t: 'Les plus gros dividendes', s: 'Rendement du dividende actuel' },
  price_free_cash_flow_ttm: { l: 'P/FCF (le plus bas d\'abord)', u: 'x', d: 1, asc: true, t: 'Les moins chères en cash-flow', s: 'Cours ÷ free cash-flow par action' },
  price_earnings_ttm: { l: 'PER (le plus bas d\'abord)', u: 'x', d: 1, asc: true, t: 'Les PER les plus bas', s: 'Cours ÷ bénéfice par action' },
  enterprise_value_ebitda_current: { l: 'EV/EBITDA (le plus bas d\'abord)', u: 'x', d: 1, asc: true, t: 'Les moins chères en EV/EBITDA', s: 'Valeur d\'entreprise ÷ EBITDA' },
  market_cap_basic: { l: 'Capitalisation', u: 'Md', d: 0, t: 'Les géants', s: 'Capitalisation boursière' },
};
const fmtMetric = (k, v) => { const m = METRICS[k]; if (!isNum(v)) return '—'; if (m.u === '%') return fr(v, v >= 10 ? 0 : 1) + ' %'; if (m.u === 'x') return fr(v, 1) + 'x'; return fr(v / 1e9, 0) + ' Md'; };
const HISTO = { ca: ['Chiffre d\'affaires', v => fr(v / 1000, 1) + ' Md'], fcfParAction: ['Free cash-flow par action', v => fr(v, 2)], dividende: ['Dividende par action', v => fr(v, 2)], eps: ['Bénéfice par action', v => fr(v, 2)], margeNette: ['Marge nette', v => fr(v, 1) + ' %'] };

function wolfOpsOptions(types){
  return async () => { const w = await wolf(); return w.E.sortOps(w.ops).filter(o => types.includes(o.type)).reverse().slice(0, 80)
    .map(o => [o.id, frDate(o.date) + ' · ' + ({ BUY: 'Achat', SELL: 'Vente', DIV: 'Dividende' }[o.type]) + ' · ' + w.sym(o.symbol).name + (o.qty ? ' (' + fr(o.qty, o.qty % 1 ? 2 : 0) + ')' : '')]); };
}
async function wolfHeld(){ const w = await wolf(); const st = w.E.replay(w.ops); return Object.keys(st.pos).map(s => w.sym(s)); }

const T = [
/* ----- Portefeuille (Wolf Portfolio) ----- */
{ k: 'tx', group: 'Portefeuille', ic: '🧾', name: 'Transaction', desc: 'Un achat ou une vente, le résultat en grand',
  fields: [{ id: 'op', type: 'select', label: 'Opération du Wolf Portfolio', options: wolfOpsOptions(['BUY', 'SELL']) }],
  async build(P, o){
    const w = await wolf(), sorted = w.E.sortOps(w.ops), op = sorted.find(x => x.id === o.op) || sorted.filter(x => x.type === 'BUY' || x.type === 'SELL').pop();
    if (!op) throw new Error('Aucun achat ni vente dans le Wolf Portfolio.');
    const s = w.sym(op.symbol), im = await logoFor(s), before = w.E.replay(sorted.slice(0, sorted.indexOf(op)));
    if (op.type === 'BUY'){
      const after = w.E.replay(sorted.slice(0, sorted.indexOf(op) + 1)), p = after.pos[op.symbol], tot = w.E.valueAt(w.ops, w.S, op.date).value, pe = w.E.priceEur(w.S, op.symbol, op.date) || (op.fx ? op.px * op.fx : op.px);
      return [B.title(P, 'Wolf Portfolio · ' + frDate(op.date), o.titre || 'Nouvel achat', o.sous || null), B.head(P, im, s.name, 'Achat', C.green),
        B.big(P, money(op.px, op.ccy), C.gold, 'Prix d\'achat le ' + frDate(op.date)),
        B.kpis(P, [{ l: 'Poids dans le portefeuille', v: p && tot > 0 ? fr(p.qty * pe / tot * 100, 1) + ' %' : '—' }, { l: 'Prix de revient moyen', v: p ? money(p.cost / p.qty, 'EUR') : '—' }])];
    }
    const p = before.pos[op.symbol]; if (!p) throw new Error('Position introuvable avant cette vente.');
    const pru = p.cost / p.qty, net = op.eur / op.qty, pct = (net / pru - 1) * 100, days = w.E.daysBetween(p.open, op.date), gain = op.eur - pru * op.qty;
    return [B.title(P, 'Wolf Portfolio · ' + frDate(op.date), o.titre || (pct >= 0 ? 'Prise de bénéfices' : 'Vente'), o.sous || null), B.head(P, im, s.name, 'Vente', C.red),
      B.big(P, sgn(pct), pct >= 0 ? C.green : C.red, 'Achetée le ' + frDate(p.open) + ' · vendue le ' + frDate(op.date) + ' (' + duree(days) + ')'),
      B.kpis(P, [{ l: 'Prix d\'achat', v: money(pru, 'EUR') }, { l: 'Prix de vente', v: money(op.px, op.ccy) }])];
  } },
{ k: 'recap', group: 'Portefeuille', ic: '📅', name: 'Récap semaine / mois', desc: 'Performance face aux indices, opérations en logos',
  fields: [{ id: 'per', type: 'select', label: 'Période', options: () => { const t = dt(today()), out = [['w0', 'Cette semaine'], ['w1', 'La semaine dernière'], ['m0', 'Ce mois-ci']];
    for (let i = 1; i <= 12; i++){ const d = new Date(t.getFullYear(), t.getMonth() - i, 1); out.push(['m:' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), MOIS[d.getMonth()] + ' ' + d.getFullYear()]); } return out; } },
    { id: 'courbe', type: 'check', label: 'Ajouter la courbe face aux indices' }],
  async build(P, o){
    const w = await wolf(), per = o.per || 'w1', t = today(); let from, to, label, eyebrow;
    if (per[0] === 'w'){ const d = dt(t), wd = (d.getDay() + 6) % 7, mon = addD(t, -wd - (per === 'w1' ? 7 : 0)); from = addD(mon, -1); to = per === 'w1' ? addD(mon, 4) : t;
      label = 'Semaine du ' + dt(mon).getDate() + (dt(mon).getMonth() !== dt(addD(mon, 4)).getMonth() ? ' ' + MOIS[dt(mon).getMonth()] : '') + ' au ' + dt(addD(mon, 4)).getDate() + ' ' + MOIS[dt(addD(mon, 4)).getMonth()]; eyebrow = 'Récap de la semaine'; }
    else { const ym = per === 'm0' ? t.slice(0, 7) : per.slice(2), y = +ym.slice(0, 4), m = +ym.slice(5, 7); from = addD(ym + '-01', -1); to = iso(new Date(y, m, 0)); if (to > t) to = t;
      label = MOIS[m - 1][0].toUpperCase() + MOIS[m - 1].slice(1) + ' ' + y; eyebrow = 'Récap du mois'; }
    const rows = w.E.periodRows(w.ops, w.S, { from, to, step: 'day' }); if (!rows.length) throw new Error('Pas de données pour cette période.');
    const perf = w.E.chain(rows) * 100, cac = w.E.chain(w.E.benchRows(rows, w.S, w.cac)) * 100, spx = w.E.chain(w.E.benchRows(rows, w.S, w.spx, 'FX_IDC:EURUSD')) * 100;
    const ops = w.E.sortOps(w.ops).filter(x => x.date > from && x.date <= to && ['BUY', 'SELL', 'DIV'].includes(x.type));
    const nb = { BUY: ops.filter(x => x.type === 'BUY').length, SELL: ops.filter(x => x.type === 'SELL').length, DIV: ops.filter(x => x.type === 'DIV').length };
    const capTxt = [nb.BUY ? nb.BUY + ' achat' + (nb.BUY > 1 ? 's' : '') : '', nb.SELL ? nb.SELL + ' vente' + (nb.SELL > 1 ? 's' : '') : '', nb.DIV ? nb.DIV + ' dividende' + (nb.DIV > 1 ? 's' : '') : ''].filter(Boolean).join(', ');
    const logos = await Promise.all(ops.slice(-cap(P, 5, 6, 7)).map(async x => { const s = w.sym(x.symbol); return { img: await logoFor(s), name: s.name, badge: x.type === 'BUY' ? '+' : x.type === 'SELL' ? '−' : '€', badgeColor: x.type === 'BUY' ? C.green : x.type === 'SELL' ? C.red : C.gold }; }));
    const blocks = [B.title(P, null, o.titre || label, o.sous || 'Wolf Portfolio vs les indices'),
      B.cmpBars(P, [{ v: perf, text: sgn(perf), label: 'Wolf', img: await loadImg(WOLF), ring: C.gold, grad: true }, { v: cac, text: sgn(cac), label: 'CAC 40', short: 'CAC', chip: C.blue, color: C.blue }, { v: spx, text: sgn(spx), label: 'S&P 500', short: 'S&P', chip: '#C9CED5', color: '#8E96A1' }])];
    if (o.courbe){ let a = 1, b = 1, c2 = 1; const cr = w.E.benchRows(rows, w.S, w.cac), sr = w.E.benchRows(rows, w.S, w.spx, 'FX_IDC:EURUSD');
      const pv = [0].concat(rows.map(r => ((a *= 1 + r.r) - 1) * 100)), cv = [0].concat(cr.map(r => ((b *= 1 + r.r) - 1) * 100)), sv = [0].concat(sr.map(r => ((c2 *= 1 + r.r) - 1) * 100));
      blocks.push(B.line(P, [{ values: cv, color: C.blue, width: 4 }, { values: sv, color: '#B4BAC4', width: 4 }, { values: pv, color: C.gold, width: 6, fill: true }], { zero: true, h: cap(P, 260, 320, 440), legend: [{ label: 'Wolf', color: C.gold }, { label: 'CAC 40', color: C.blue }, { label: 'S&P 500', color: '#B4BAC4' }] })); }
    if (logos.length) blocks.push(B.logoRow(P, logos, (per[0] === 'w' ? 'Cette semaine : ' : 'Ce mois-ci : ') + capTxt));
    return blocks;
  } },
{ k: 'compo', group: 'Portefeuille', ic: '🍩', name: 'Composition', desc: 'Les lignes du portefeuille et leur poids',
  fields: [],
  async build(P, o){
    const w = await wolf(), t = today(), st = w.E.replay(w.ops, t);
    let items = Object.keys(st.pos).map(s => { const pe = w.E.priceEur(w.S, s, t); return pe == null ? null : Object.assign(w.sym(s), { v: st.pos[s].qty * pe }); }).filter(Boolean).sort((a, b) => b.v - a.v);
    const nMax = cap(P, 5, 6, 8), rest = items.slice(nMax); items = items.slice(0, nMax);
    if (rest.length) items.push({ name: 'Autres (' + rest.length + ')', v: rest.reduce((s, x) => s + x.v, 0), color: '#4A535E' });
    if (st.cash > 1) items.push({ name: 'Liquidités', v: st.cash, color: '#2E3640' });
    for (const it of items) if (it.sym) it.img = await logoFor(it);
    return [B.title(P, 'Wolf Portfolio · ' + frDate(t), o.titre || 'Mon portefeuille', o.sous || (Object.keys(st.pos).length + ' lignes')), B.donut(P, items, await loadImg(WOLF))];
  } },
{ k: 'bilan', group: 'Portefeuille', ic: '🎯', name: 'Bilan des positions', desc: '% de gagnantes, gain et perte moyens, durées',
  fields: [{ id: 'open', type: 'check', label: 'Compter aussi les positions encore ouvertes' }],
  async build(P, o){
    const w = await wolf(), st = w.E.replay(w.ops), list = st.trades.concat(o.open ? w.E.openAsTrades(w.E.replay(w.ops, today()), w.S, today()) : []), s = w.E.tradeStats(list);
    if (!s.n) throw new Error('Aucune position clôturée pour l\'instant' + (o.open ? '' : ' (coche « positions ouvertes »)') + '.');
    const best = s.best && Object.assign(w.sym(s.best.symbol), { pct: s.best.pct }), worst = s.worst && Object.assign(w.sym(s.worst.symbol), { pct: s.worst.pct });
    return [B.title(P, 'Wolf Portfolio · bilan', o.titre || 'Mes positions', o.sous || s.n + ' positions ' + (o.open ? 'analysées' : 'clôturées')),
      B.big(P, fr(s.winRate, 0) + ' %', C.gold, 'de positions gagnantes (' + s.wins + ' sur ' + s.n + ')'),
      B.kpis(P, [{ l: 'Gain moyen', v: sgn(s.avgWinPct), c: C.green }, { l: 'Perte moyenne', v: sgn(s.avgLossPct), c: C.red }, { l: 'Durée moyenne', v: duree(s.avgDays) }]),
      !P.small && best && worst ? B.rows(P, [{ img: await logoFor(best), name: best.name, sub: 'Meilleure position', right: sgn(best.pct), rightColor: C.green }, { img: await logoFor(worst), name: worst.name, sub: 'Moins bonne position', right: sgn(worst.pct), rightColor: worst.pct >= 0 ? C.green : C.red }]) : null];
  } },
{ k: 'div', group: 'Portefeuille', ic: '💶', name: 'Dividende versé', desc: 'Le logo et le montant encaissé', mine: true,
  fields: [{ id: 'op', type: 'select', label: 'Dividende du Wolf Portfolio', options: wolfOpsOptions(['DIV']) }],
  async build(P, o){
    const w = await wolf(), sorted = w.E.sortOps(w.ops), op = sorted.find(x => x.id === o.op) || sorted.filter(x => x.type === 'DIV').pop();
    if (!op) throw new Error('Aucun dividende enregistré dans le Wolf Portfolio.');
    const s = w.sym(op.symbol), p = w.E.replay(sorted.slice(0, sorted.indexOf(op))).pos[op.symbol], per = p && p.qty ? op.eur / p.qty : null;
    return [B.title(P, 'Wolf Portfolio · ' + frDate(op.date), o.titre || 'Dividende encaissé', o.sous || null), B.head(P, await logoFor(s), s.name, 'Dividende', C.gold),
      B.big(P, '+' + money(op.eur, 'EUR'), C.gold, per ? fr(per, 2) + ' € net par action · ' + fr(p.qty, p.qty % 1 ? 2 : 0) + ' actions' : null)];
  } },
{ k: 'earn1', group: 'Portefeuille', ic: '📣', name: 'Publication des résultats', desc: 'Résultats d\'une ligne : battu ou manqué', mine: true,
  fields: [{ id: 'co', type: 'company', label: 'Entreprise', quick: 'held' }],
  async build(P, o){
    const co = o.co || (await wolfHeld())[0]; if (!co) throw new Error('Choisis une entreprise.');
    const d = await snap(co.sym, true); if (!d || !isNum(d.earnings_per_share_fq) || !isNum(d.earnings_per_share_forecast_fq)) throw new Error('TradingView ne donne pas encore le dernier résultat de ' + co.name + '.');
    // BPA publié / attendu : ceux de TradingView, ou ceux corrigés à la main (cases 1 et 2) ; l'écart et le verdict en découlent
    const pnum = t => { if (t == null || t === '') return null; const v = parseFloat(String(t).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '')); return isFinite(v) ? v : null; };
    const pub = pnum(P.ov.k0v) ?? d.earnings_per_share_fq, att = pnum(P.ov.k1v) ?? d.earnings_per_share_forecast_fq;
    const sur = isNum(pub) && isNum(att) && att !== 0 ? (pub / att - 1) * 100 * Math.sign(att) : null, beat = sur != null ? sur >= 0 : pub >= att;
    const ccy = d.fundamental_currency_code || d.currency, rev = isNum(d.revenue_fq) && isNum(d.revenue_forecast_fq) ? (d.revenue_fq / d.revenue_forecast_fq - 1) * 100 : null, date = tsIso(d.earnings_release_date);
    P.info = '⚠ À vérifier sur le communiqué de ' + co.name + ' avant de publier. TradingView : publié le ' + (date ? frDate(date) : '?') + ' · BPA ' + money(d.earnings_per_share_fq, ccy) + ' (attendu ' + money(d.earnings_per_share_forecast_fq, ccy) + ')' +
      (isNum(d.revenue_fq) ? ' · CA ' + fr(d.revenue_fq / 1e9, 2) + ' Md ' + (CUR[ccy] || ccy) + ' (attendu ' + fr(d.revenue_forecast_fq / 1e9, 2) + ')' : '') + '. Corrige un chiffre plus bas si besoin.';
    return [B.title(P, null, o.titre || 'Résultats', o.sous || (date ? 'Publiés le ' + frDate(date) : 'Dernier trimestre') + ' · face au consensus'), B.head(P, await logoFor(co), co.name, beat ? 'Battu' : 'Manqué', beat ? C.green : C.red),
      B.big(P, beat ? 'BATTU' : 'MANQUE', beat ? C.green : C.red, 'Bénéfice par action ' + sgn(sur) + ' par rapport au consensus'),
      B.kpis(P, [{ l: 'BPA publié', v: money(d.earnings_per_share_fq, ccy) }, { l: 'BPA attendu', v: money(d.earnings_per_share_forecast_fq, ccy) }, { l: 'Écart', v: sgn(sur), c: sur >= 0 ? C.green : C.red }])];
  } },
{ k: 'perfA', group: 'Portefeuille', ic: '📈', name: 'Performance d\'une action', desc: 'Le cours sur la période choisie, la hausse en gros', mine: true,
  fields: [{ id: 'co', type: 'company', label: 'Entreprise', quick: 'held' }, { id: 'range', type: 'select', label: 'Période', options: RANGES.map(r => [r[0], r[1]]) }],
  async build(P, o){
    const co = o.co || (await wolfHeld())[0]; if (!co) throw new Error('Choisis une entreprise.');
    const R = RANGES.find(r => r[0] === (o.range || '1a')) || RANGES[3], from = addD(today(), -R[2]), h = await history(co.sym, from);
    const i0 = h.d.findIndex(x => x >= from), d = h.d.slice(Math.max(0, i0)), c = h.c.slice(Math.max(0, i0)); if (c.length < 2) throw new Error('Pas assez de cours.');
    const chg = (c[c.length - 1] / c[0] - 1) * 100, yrs = R[2] / 365.25, step = Math.ceil(c.length / 400), vals = c.filter((_, i) => i % step === 0 || i === c.length - 1);
    return [B.title(P, null, o.titre || 'Performance', o.sous || 'Sur ' + R[1]), B.head(P, await logoFor(co), co.name, null), B.big(P, sgn(chg), chg >= 0 ? C.green : C.red, 'de ' + money(c[0], h.ccy) + ' à ' + money(c[c.length - 1], h.ccy) + ' (hors dividendes)'),
      B.line(P, [{ values: vals, color: C.gold, width: 5, fill: true }], { labels: [frDate(d[0]), frDate(d[d.length - 1])] }),
      yrs >= 1 ? B.kpis(P, [{ l: 'Par an', v: sgn((Math.pow(c[c.length - 1] / c[0], 1 / yrs) - 1) * 100), c: chg >= 0 ? C.green : C.red }, { l: 'Plus haut', v: money(Math.max(...c), h.ccy) }, { l: 'Plus bas', v: money(Math.min(...c), h.ccy) }]) : null];
  } },
/* ----- Entreprises (TradingView) ----- */
{ k: 'valo', group: 'Entreprises', ic: '⚖️', name: 'Valorisation', desc: 'Cours, prix juste, marge de sécurité',
  fields: [{ id: 'src', type: 'select', label: 'Où prendre le prix juste ?', rerender: true, options: [['prix', 'Prix par secteur (ma simulation)'], ['analyse', 'Fiche Analyse']] },
    { id: 'sc', type: 'select', label: 'Ton scénario (Prix par secteur)', options: SCEN },
    { id: 'aff', type: 'select', label: 'Affichage', options: [['graph', 'Graphique du cours'], ['echelle', 'Échelle des prix']] },
    { id: 'per', type: 'select', label: 'Période du graphique', options: [['2', '2 ans'], ['1', '1 an'], ['3', '3 ans']] },
    { id: 'nom', type: 'select', label: 'Entreprise', options: async o => (o.src || 'prix') === 'prix' ? (window.PRIX_UI ? (await PRIX_UI.pubItems()).filter(x => isNum(x.juste)).map(x => [x.nom, x.nom + ' · ' + x.secteurLabel]) : []) : followed().map(n => [n, n]) }],
  async build(P, o){
    const src = o.src || 'prix';
    let nom = o.nom, cours, juste, lines = [], ccy = 'EUR', sym = null, logo = null, extra;
    if (src === 'prix'){
      const all = window.PRIX_UI ? (await PRIX_UI.pubItems()).filter(x => isNum(x.juste)) : [], it = all.find(x => x.nom === nom) || all[0];
      if (!it) throw new Error('Aucune simulation dans « Prix par secteur ».');
      const scK = o.sc || 'real'; nom = it.nom; cours = it.cours; juste = it.sc[scK]; ccy = it.devise || 'EUR'; sym = it.sym; logo = it.logo;
      if (isNum(it.sc.pess)) lines.push({ v: it.sc.pess, color: C.red, label: 'Pessimiste ' + fr(it.sc.pess, 0) });
      lines.push({ v: juste, color: C.gold2, label: 'Réaliste ' + fr(juste, 0) });
      if (isNum(it.sc.opt)) lines.push({ v: it.sc.opt, color: C.green, label: 'Optimiste ' + fr(it.sc.opt, 0) });
      extra = { l: 'Rendement 5 ans', v: isNum(it.rdt) ? sgn(it.rdt * 100) + '/an' : '—', c: it.rdt >= 0 ? C.green : C.red };
      const sv = it.saisie[scK] || {};
      P.info = 'Chiffres : ta fiche « Prix par secteur », scénario ' + SCEN.find(z => z[0] === scK)[1].toLowerCase() + ' : base ' + fr(it.base, 2) + ' × multiple ' + fr(sv.mult, 1) + ' = ' + money(juste, ccy) + '. Cours ' + money(cours, ccy) + (it.coursAuto ? ' (cours de l\'appli)' : ' (saisi)') + '. Rien n\'est estimé par l\'appli : corrige plus bas si besoin.';
    } else {
      nom = nom || followed()[0]; const rows = (typeof companies !== 'undefined' && companies[nom]) || [], last = rows[rows.length - 1];
      if (!last || !isNum(last.prixJuste)) throw new Error('Pas de prix juste dans la fiche Analyse pour cette entreprise.');
      cours = last.prixActuel; juste = last.prixJuste; ccy = last.devise || 'EUR'; sym = last.ticker; logo = last.lienImage;
      lines.push({ v: juste, color: C.gold2, label: 'Prix juste ' + fr(juste, 0) }); if (isNum(last.prixCible)) lines.push({ v: last.prixCible, color: C.green, label: 'Prix cible ' + fr(last.prixCible, 0) });
      extra = { l: 'Prix cible', v: isNum(last.prixCible) ? money(last.prixCible, ccy, 0) : '—', c: C.green };
      P.info = 'Source : fiche Analyse (prix juste ' + money(juste, ccy) + ', calcul automatique). Vérifie que c\'est bien ton analyse.';
    }
    if (!isNum(cours) || !isNum(juste) || juste <= 0) throw new Error('Cours ou prix juste manquant pour ' + nom + '.');
    const yrs = +(o.per || 2), from = addD(today(), -Math.round(365.25 * yrs)), h0 = sym ? await history(sym, from).catch(() => null) : null;
    const i0 = h0 ? Math.max(0, h0.d.findIndex(x => x >= from)) : 0, h = h0 ? { ccy: h0.ccy, d: h0.d.slice(i0), c: h0.c.slice(i0) } : null;   // TradingView renvoie un peu plus que demandé
    const step = h ? Math.ceil(h.c.length / 260) : 1, marge = (juste / cours - 1) * 100;
    const ecart = (cours / juste - 1) * 100, msgTxt = ecart > 0 ? sgn(ecart, 0) + ' au-dessus de mon prix juste' : sgn(ecart, 0) + ' sous mon prix juste';
    const img = await logoFor({ sym, logo, name: nom });
    const title = o.titre || (ecart > 0 ? 'Trop chere ?' : 'Sous-evaluee ?');
    if ((o.aff || 'graph') === 'echelle')
      return [B.title(P, null, title, msgTxt), B.head(P, img, nom, null),
        B.big(P, money(cours, ccy, 0), ecart > 0 ? C.red : C.green, 'Cours du ' + frDate(today()) + ' · mon prix juste ' + money(juste, ccy, 0)),
        B.scale(P, lines, cours, ccy)];
    const vals = h ? h.c.filter((_, i) => i % step === 0 || i === h.c.length - 1) : [];
    return [B.title(P, null, title, msgTxt), B.head(P, img, nom, null),
      h ? B.line(P, [{ values: vals, color: C.ink, width: 5 }], { hlines: lines, band: true, last: money(cours, ccy, 0), labels: [frDate(h.d[0]), frDate(h.d[h.d.length - 1])], h: cap(P, 440, 640, 900), noShrinkBelow: 300 }) : B.big(P, money(cours, ccy, 0), C.ink, 'Cours actuel')];
  } },
{ k: 'rank', group: 'Entreprises', ic: '🏆', name: 'Classement comparatif', desc: '2 à 15 entreprises classées sur un chiffre',
  fields: [{ id: 'cos', type: 'companies', label: 'Entreprises', max: 15, quick: 'held' }, { id: 'metric', type: 'select', label: 'Chiffre comparé', options: Object.keys(METRICS).map(k => [k, METRICS[k].l]) },
    { id: 'aff', type: 'select', label: 'Affichage', options: [['rings', 'Logos en grille'], ['bars', 'Barres']] }],
  async build(P, o){
    const cos = (o.cos && o.cos.length ? o.cos : await wolfHeld()).slice(0, 15), mk_ = o.metric || 'net_margin_ttm', m = METRICS[mk_];
    if (cos.length < 2) throw new Error('Ajoute au moins deux entreprises.');
    const data = (await Promise.all(cos.map(async c => { const d = await snap(c.sym); return d && isNum(d[mk_]) ? Object.assign({}, c, { v: d[mk_], img: await logoFor(c) }) : null; }))).filter(Boolean)
      .sort((a, b) => m.asc ? a.v - b.v : b.v - a.v);
    if (!data.length) throw new Error('TradingView ne donne pas ce chiffre pour ces entreprises.');
    const max = Math.max(...data.map(d => Math.abs(d.v))), top = data[0];
    const items = data.map(d => ({ img: d.img, name: d.name, label: '$' + String(d.sym).split(':')[1], v: d.v, text: fmtMetric(mk_, d.v), ring: m.asc ? Math.min(...data.map(x => x.v)) / d.v : null }));
    const shown = items.slice(0, (o.aff || 'rings') === 'bars' ? cap(P, 7, 9, 13) : cap(P, 10, 15, 15));
    return [B.title(P, m.s, o.titre || m.t, o.sous || top.name + ' en tête : ' + fmtMetric(mk_, top.v)), (o.aff || 'rings') === 'bars' ? B.bars(P, shown, max) : B.rings(P, shown, max)];
  } },
{ k: 'duel', group: 'Entreprises', ic: '🥊', name: 'Duel 1 000 € investis', desc: 'A contre B depuis une année choisie',
  fields: [{ id: 'a', type: 'company', label: 'Entreprise A' }, { id: 'b', type: 'company', label: 'Entreprise B' }, { id: 'an', type: 'select', label: 'Depuis', options: () => { const y = new Date().getFullYear(), out = []; for (let i = y - 1; i >= 2006; i--) out.push([String(i), 'janvier ' + i]); return out; } }],
  async build(P, o){
    if (!o.a || !o.b) throw new Error('Choisis les deux entreprises.');
    const from = (o.an || '2016') + '-01-01', [ha, hb] = await Promise.all([history(o.a.sym, from), history(o.b.sym, from)]);
    const grow = h => { const i = h.d.findIndex(x => x >= from), c = h.c.slice(Math.max(0, i)); return c.map(v => v / c[0] * 1000); };
    const A = grow(ha), Bv = grow(hb), fa = A[A.length - 1], fb = Bv[Bv.length - 1], n = Math.min(A.length, Bv.length), step = Math.ceil(n / 300);
    const pick = arr => arr.slice(-n).filter((_, i) => i % step === 0);
    return [B.title(P, '1 000 € investis en ' + (o.an || '2016'), o.titre || o.a.name + ' ou ' + o.b.name + ' ?', o.sous || null),
      B.duel(P, { img: await logoFor(o.a), name: o.a.name, value: fr(fa, 0) + ' €', sub: '×' + fr(fa / 1000, 1), color: C.gold, win: fa >= fb }, { img: await logoFor(o.b), name: o.b.name, value: fr(fb, 0) + ' €', sub: '×' + fr(fb / 1000, 1), color: C.blue, win: fb > fa }),
      B.line(P, [{ values: pick(Bv), color: C.blue, width: 4 }, { values: pick(A), color: C.gold, width: 5 }], { h: cap(P, 300, 380, 520), labels: [from.slice(0, 4), String(new Date().getFullYear())] }),
      B.note(P, 'Évolution du cours hors dividendes, en devise de cotation.')];
  } },
{ k: 'histo', group: 'Entreprises', ic: '📊', name: 'Historique d\'un chiffre', desc: '20 ans de FCF, dividende, CA ou BPA',
  fields: [{ id: 'co', type: 'company', label: 'Entreprise' }, { id: 'metric', type: 'select', label: 'Chiffre', options: Object.keys(HISTO).map(k => [k, HISTO[k][0]]) }, { id: 'ans', type: 'select', label: 'Années', options: [['10', '10 ans'], ['15', '15 ans'], ['20', '20 ans']] }],
  async build(P, o){
    if (!o.co) throw new Error('Choisis une entreprise.');
    if (!window.ATELIER_UI || !ATELIER_UI.tvRowsFor) throw new Error('Atelier non chargé.');
    const r = await ATELIER_UI.tvRowsFor(o.co.name, o.co.sym), key = o.metric || 'fcfParAction', n = +(o.ans || 20);
    const rows = ((r && r.rows) || []).filter(x => isNum(x[key])).slice(-n); if (rows.length < 3) throw new Error('Pas assez d\'historique pour ce chiffre.');
    const a = rows[0][key], b = rows[rows.length - 1][key], yrs = rows[rows.length - 1].annee - rows[0].annee, g = a > 0 && b > 0 && yrs > 0 ? (Math.pow(b / a, 1 / yrs) - 1) * 100 : null;
    return [B.title(P, HISTO[key][0], o.titre || o.co.name, o.sous || (rows[0].annee + ' → ' + rows[rows.length - 1].annee)),
      B.big(P, g != null ? sgn(g) + '/an' : HISTO[key][1](b), g != null && g < 0 ? C.red : C.gold, g != null ? 'de croissance par an sur ' + yrs + ' ans' : null),
      B.vbars(P, rows.map(x => x.annee), rows.map(x => x[key]), HISTO[key][1])];
  } },
/* ----- Agenda et marché ----- */
{ k: 'earn', group: 'Agenda et marché', ic: '🗓', name: 'Résultats à venir', desc: 'Dates et BPA attendus (TradingView)',
  fields: [{ id: 'cos', type: 'companies', label: 'Entreprises surveillées', max: 30, quick: 'held' }, { id: 'win', type: 'select', label: 'Fenêtre', options: [['7', '7 prochains jours'], ['14', '14 prochains jours'], ['30', '30 prochains jours'], ['90', '3 prochains mois']] }],
  async build(P, o){
    const cos = o.cos && o.cos.length ? o.cos : await wolfHeld(), lim = addD(today(), +(o.win || 30));
    const list = (await Promise.all(cos.map(async c => { const d = await snap(c.sym, true); const nd = d && tsIso(d.earnings_release_next_date);
      return nd && nd >= today() && nd <= lim ? Object.assign({}, c, { date: nd, eps: d.earnings_per_share_forecast_next_fq, ccy: d.fundamental_currency_code || d.currency, img: await logoFor(c) }) : null; }))).filter(Boolean).sort((a, b) => a.date < b.date ? -1 : 1);
    if (!list.length) throw new Error('Aucune publication prévue dans cette fenêtre pour ces entreprises.');
    const shown = list.slice(0, cap(P, 5, 7, 12));
    return [B.title(P, 'Agenda des résultats', o.titre || 'Ils publient', o.sous || 'Du ' + frDate(today()) + ' au ' + frDate(shown[shown.length - 1].date)),
      B.rows(P, shown.map(x => ({ img: x.img, name: x.name, right: shortDate(x.date), rightColor: C.ink })))];
  } },
{ k: 'verdict', group: 'Agenda et marché', ic: '⚖️', name: 'Verdict des résultats', desc: 'Battu ou manqué face au consensus',
  fields: [{ id: 'cos', type: 'companies', label: 'Entreprises', max: 30, quick: 'held' }, { id: 'win', type: 'select', label: 'Publiés dans les', options: [['7', '7 derniers jours'], ['14', '14 derniers jours'], ['30', '30 derniers jours'], ['90', '3 derniers mois']] }],
  async build(P, o){
    const cos = o.cos && o.cos.length ? o.cos : await wolfHeld(), lim = addD(today(), -(+(o.win || 14)));
    const list = (await Promise.all(cos.map(async c => { const d = await snap(c.sym, true); const ld = d && tsIso(d.earnings_release_date);
      if (!ld || ld < lim || !isNum(d.earnings_per_share_fq) || !isNum(d.earnings_per_share_forecast_fq)) return null;
      return Object.assign({}, c, { date: ld, beat: d.earnings_per_share_fq >= d.earnings_per_share_forecast_fq, sur: d.eps_surprise_percent_fq, img: await logoFor(c) }); }))).filter(Boolean).sort((a, b) => a.date < b.date ? -1 : 1);
    if (!list.length) throw new Error('Aucun résultat publié dans cette fenêtre pour ces entreprises.');
    const shown = list.slice(0, cap(P, 5, 8, 12)), beats = list.filter(x => x.beat).length;
    return [B.title(P, 'Résultats vs consensus', o.titre || 'Le verdict', o.sous || beats + ' sur ' + list.length + ' ont battu les attentes'),
      B.rows(P, shown.map(x => ({ img: x.img, name: x.name, sub: shortDate(x.date) + (isNum(x.sur) ? ' · BPA ' + sgn(x.sur) : ''), right: x.beat ? 'Battu' : 'Manqué', pill: true, rightColor: x.beat ? C.green : C.red, pillBg: x.beat ? 'rgba(79,209,165,.14)' : 'rgba(229,99,107,.14)' })))];
  } },
{ k: 'deals', group: 'Agenda et marché', ic: '🏷', name: 'Prix par secteur', desc: 'Tes prix justes face au cours, écart en gros',
  fields: [{ id: 'sec', type: 'select', label: 'Secteur (Prix par secteur)', rerender: true, options: async () => { const it = window.PRIX_UI ? await PRIX_UI.pubItems() : []; const m = {}; it.forEach(x => { m[x.secteur] = x.secteurLabel; }); return [['', 'Tous les secteurs']].concat(Object.keys(m).map(k => [k, m[k]])); } },
    { id: 'sc', type: 'select', label: 'Ton scénario à utiliser', options: SCEN },
    { id: 'pick', type: 'checks', label: 'Entreprises à mettre', options: async o => (window.PRIX_UI ? await PRIX_UI.pubItems() : []).filter(x => !o.sec || x.secteur === o.sec).map(x => [x.nom, x.nom]) }],
  async build(P, o){
    const sc = o.sc || 'real', all = window.PRIX_UI ? await PRIX_UI.pubItems() : [];
    let list = all.filter(x => (!o.sec || x.secteur === o.sec) && (!Array.isArray(o.pick) || o.pick.includes(x.nom)));
    list = list.map(x => Object.assign({}, x, { prix: x.sc[sc], e: isNum(x.sc[sc]) && x.sc[sc] > 0 && isNum(x.cours) ? x.cours / x.sc[sc] - 1 : null })).filter(x => x.e != null).sort((a, b) => a.e - b.e);
    if (!list.length) throw new Error('Aucune entreprise avec ton prix « ' + SCEN.find(z => z[0] === sc)[1] + ' » et un cours.');
    const shown = list.slice(0, cap(P, 5, 7, 11)), lab = o.sec ? (all.find(x => x.secteur === o.sec) || {}).secteurLabel : 'Tous secteurs', below = list.filter(x => x.e < 0).length;
    for (const x of shown){ const c = typeof companies !== 'undefined' && companies[x.nom]; const tk = c && c[c.length - 1] && c[c.length - 1].ticker; x.img = await logoFor({ sym: x.sym || tk, logo: x.logo }); }
    P.info = 'Chiffres : ta fiche « Prix par secteur », scénario ' + SCEN.find(z => z[0] === sc)[1].toLowerCase() + ' (' + shown.map(x => x.nom + ' : base ' + fr(x.base, 2) + ' × ' + fr((x.saisie[sc] || {}).mult, 1) + ' = ' + fr(x.prix, 0)).join(' ; ') + '). Écart = cours ÷ ton prix − 1. Rien n\'est estimé par l\'appli.';
    return [B.title(P, null, o.titre || lab, o.sous || below + ' sous mon prix · ' + (list.length - below) + ' au-dessus'),
      B.rows(P, shown.map(x => ({ img: x.img, name: x.nom, sub: 'Cours ' + money(x.cours, x.devise, 0) + ' · mon prix ' + money(x.prix, x.devise, 0), right: sgn(x.e * 100, 0), rightColor: x.e < 0 ? C.green : C.red })))];
  } },
{ k: 'atelier', group: 'Agenda et marché', ic: '🗂', name: 'Carte de l\'Atelier', desc: 'Une carte de l\'Atelier transformée en post',
  fields: [{ id: 'cid', type: 'select', label: 'Carte (du dossier ouvert dans l\'Atelier)', options: () => atelierCards().map(c => [c.id, c.label]) }],
  async build(P, o){
    const cards = atelierCards(), c = cards.find(x => x.id === o.cid) || cards[0];
    if (!c) throw new Error('Ouvre un dossier dans l\'Atelier d\'analyses, puis reviens ici.');
    const el = c.el, cv = el.querySelector('canvas'), doc = (document.querySelector('#pageAtelier .aw-doc-title, #pageAtelier h2') || {}).textContent || '';
    const blocks = [B.title(P, 'Atelier d\'analyses' + (doc ? ' · ' + doc.trim().slice(0, 40) : ''), o.titre || c.title || 'Analyse', o.sous || null)];
    if (cv && cv.width > 10){ try { const im = await loadImg(cv.toDataURL('image/png')); if (im) blocks.push(B.image(P, im, cap(P, 520, 700, 1000))); } catch(e){ blocks.push(B.para(P, 'Ce graphique contient une image externe : capture impossible.')); } }
    else blocks.push(B.para(P, (el.innerText || '').replace(/\n{2,}/g, '\n').trim().slice(0, 700), cap(P, 9, 12, 20)));
    return blocks;
  } },
];
function followed(){ if (typeof companies === 'undefined') return []; return Object.keys(companies).filter(n => { const r = companies[n]; const l = r && r[r.length - 1]; return l && isNum(l.prixJuste); }).sort((a, b) => a.localeCompare(b, 'fr')); }
function atelierCards(){
  return [...document.querySelectorAll('#pageAtelier [data-cid]')].map((el, i) => {
    const t = el.querySelector('[class*="title"], [class*="titre"], h3, h4'); const title = (t && t.textContent || '').trim();
    return { id: el.dataset.cid, el, title, label: (title || 'Carte ' + (i + 1)) + (el.querySelector('canvas') ? ' (graphique)' : '') };
  });
}

/* ======================= INTERFACE ======================= */
const ui = { tpl: null, fmt: 'f45', theme: 'beige', opts: {}, busy: false, err: null, canvas: null, sugg: {}, q: {}, editSig: '' };
function prefs(){ try { return JSON.parse(localStorage.getItem('wolfPubPrefs') || '{}'); } catch(e){ return {}; } }
function savePrefs(){ try { const p = prefs(); p[ui.tpl] = ui.opts; p._fmt = ui.fmt; p._theme = ui.theme; localStorage.setItem('wolfPubPrefs', JSON.stringify(p)); } catch(e){} }
function page(){ return $(PAGE_ID); }

function renderPage(){
  const el = page(); if (!el) return;
  if (!ui.tpl){
    const groups = [...new Set(T.map(t => t.group))];
    el.innerHTML = '<div class="pb-wrap"><div class="pb-head"><h2>📣 Publications</h2><p>Choisis un modèle, règle les données, télécharge l\'image (carré, portrait ou story). Charte Wolf Academy, vrais logos TradingView. Seul le Wolf Portfolio est publiable.</p></div>' +
      groups.map(g => '<section class="pb-grp"><h3>' + esc(g) + (g === 'Portefeuille' ? ' <span>(Wolf Portfolio)</span>' : g === 'Entreprises' ? ' <span>(TradingView)</span>' : '') + '</h3><div class="pb-tpls">' +
        T.filter(t => t.group === g).map(t => '<button type="button" class="pb-tpl" data-pb-tpl="' + t.k + '"><span class="pb-ic">' + t.ic + '</span><b>' + esc(t.name) + '</b><span>' + esc(t.desc) + '</span></button>').join('') + '</div></section>').join('') + '</div>';
    return;
  }
  const t = T.find(x => x.k === ui.tpl);
  el.innerHTML = '<div class="pb-wrap"><div class="pb-bar"><button type="button" class="pb-back" data-pb-back>← Modèles</button><h2>' + t.ic + ' ' + esc(t.name) + '</h2></div>' +
    '<div class="pb-editor"><div class="pb-ctl" id="pbCtl"><p class="pb-faint">Chargement des réglages…</p></div>' +
    '<div class="pb-prev"><div class="pb-seg" id="pbFmt">' + [['f1', 'Carré'], ['f45', 'Portrait'], ['f916', 'Story']].map(f => '<button type="button" data-pb-fmt="' + f[0] + '" class="' + (ui.fmt === f[0] ? 'on' : '') + '">' + f[1] + '</button>').join('') + '</div>' +
    '<div class="pb-seg pb-themes" id="pbTheme">' + Object.keys(THEMES).map(k => '<button type="button" data-pb-theme="' + k + '" class="' + (ui.theme === k ? 'on' : '') + '"><i style="background:' + THEMES[k].bg + ';border-color:' + THEMES[k].hlBg + '"></i>' + THEMES[k].label + '</button>').join('') + '</div>' +
    '<div class="pb-canvas" id="pbCanvas"><p class="pb-faint">Préparation…</p></div>' +
    '<div class="pb-actions"><button type="button" class="pb-go" data-pb-dl>⬇ Télécharger l\'image</button><button type="button" class="pb-sec" data-pb-copy>📋 Copier</button></div><p class="pb-msg" id="pbMsg"></p></div></div></div>';
  renderControls(t).then(draw);
}
async function renderControls(t){
  const box = $('pbCtl'); if (!box) return;
  let html = '';
  for (const f of t.fields){
    if (f.type === 'select'){
      let opts = []; try { opts = typeof f.options === 'function' ? await f.options(ui.opts) : f.options; } catch(e){ opts = []; html += '<p class="pb-err">' + esc(e.message) + '</p>'; }
      if ((ui.opts[f.id] == null || !opts.some(o => String(o[0]) === String(ui.opts[f.id]))) && opts[0]) ui.opts[f.id] = opts[0][0];
      html += '<label>' + esc(f.label) + '<select data-pb-f="' + f.id + '">' + (opts.length ? opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(ui.opts[f.id]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') : '<option value="">(rien à choisir)</option>') + '</select></label>';
    } else if (f.type === 'checks'){
      let opts = []; try { opts = await f.options(ui.opts); } catch(e){ opts = []; }
      const sel = Array.isArray(ui.opts[f.id]) ? ui.opts[f.id] : null;
      html += '<div class="pb-field"><span class="pb-lab">' + esc(f.label) + '</span><div class="pb-checks">' + (opts.length ? opts.map(o => '<label class="pb-check"><input type="checkbox" data-pb-chk="' + f.id + '" value="' + esc(o[0]) + '"' + (!sel || sel.includes(o[0]) ? ' checked' : '') + '> ' + esc(o[1]) + '</label>').join('') : '<span class="pb-faint">Aucune entreprise.</span>') + '</div></div>';
    } else if (f.type === 'check'){
      html += '<label class="pb-check"><input type="checkbox" data-pb-f="' + f.id + '"' + (ui.opts[f.id] ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
    } else if (f.type === 'company' || f.type === 'companies'){
      const multi = f.type === 'companies', val = ui.opts[f.id], list = multi ? (val || []) : (val ? [val] : []);
      html += '<div class="pb-field"><span class="pb-lab">' + esc(f.label) + (multi ? ' (' + list.length + ')' : '') + '</span><div class="pb-chips">' +
        list.map((c, i) => '<span class="pb-chip">' + (c.logoid ? '<img src="' + tvLogo(c.logoid) + '" alt="">' : '') + esc(c.name) + '<button type="button" data-pb-rm="' + f.id + '|' + i + '" aria-label="Retirer">✕</button></span>').join('') + '</div>' +
        '<div class="pb-search"><input type="search" data-pb-q="' + f.id + '" placeholder="' + (multi ? 'Ajouter une entreprise…' : 'Rechercher une entreprise…') + '" value="' + esc(ui.q[f.id] || '') + '" autocomplete="off"><div class="pb-sugg" id="pbSugg_' + f.id + '">' + suggHtml(f.id) + '</div></div>' +
        (f.quick === 'held' ? '<button type="button" class="pb-sec small" data-pb-held="' + f.id + '">' + (multi ? '+ Les lignes du Wolf Portfolio' : 'Choisir une ligne du Wolf') + '</button>' : '') + '</div>';
    }
  }
  html += '<div id="pbEdit" class="pb-edit"></div>';
  box.innerHTML = html;
}
function suggHtml(fid){
  const s = ui.sugg[fid]; if (!s) return '';
  if (s === 'busy') return '<div class="pb-faint">Recherche…</div>';
  if (!s.length) return '<div class="pb-faint">Aucun résultat</div>';
  return s.slice(0, 8).map((r, i) => '<button type="button" data-pb-pick="' + fid + '|' + i + '">' + (r.logoid ? '<img src="' + tvLogo(r.logoid) + '" alt="">' : '<i></i>') + '<b>' + esc(r.name) + '</b><span>' + esc(r.symbol) + '</span></button>').join('');
}
let qTimer = null;
async function search(fid, q){
  ui.q[fid] = q; clearTimeout(qTimer);
  if (q.trim().length < 2){ ui.sugg[fid] = null; const b = $('pbSugg_' + fid); if (b) b.innerHTML = ''; return; }
  qTimer = setTimeout(async () => {
    ui.sugg[fid] = 'busy'; let b = $('pbSugg_' + fid); if (b) b.innerHTML = suggHtml(fid);
    try { const r = await fetch('/api/tv/search?all=1&q=' + encodeURIComponent(q.trim().slice(0, 50)), { cache: 'no-store' }); const j = await r.json(); ui.sugg[fid] = j.ok ? j.results || [] : []; }
    catch(e){ ui.sugg[fid] = []; }
    b = $('pbSugg_' + fid); if (b) b.innerHTML = suggHtml(fid);
  }, 300);
}
let drawSeq = 0, drawTimer = null;
function schedule(){ clearTimeout(drawTimer); drawTimer = setTimeout(draw, 250); }
async function fontsReady(){
  try { await Promise.all(['400 40px Anton', '500 20px "Plus Jakarta Sans"', '600 20px "Plus Jakarta Sans"', '700 20px "Plus Jakarta Sans"', '800 20px "Plus Jakarta Sans"'].map(f => document.fonts.load(f))); } catch(e){}
}
async function draw(){
  const t = T.find(x => x.k === ui.tpl), box = $('pbCanvas'); if (!t || !box) return;
  const seq = ++drawSeq; savePrefs();
  box.classList.add('busy');
  try {
    await fontsReady();
    setTheme(ui.theme); const P = mk(ui.fmt); P.ov = ui.opts.ov || {}; const blocks = await t.build(P, ui.opts);
    if (seq !== drawSeq) return;
    await frame(P, t.name, t.group === 'Portefeuille' ? null : 'Données TradingView · ' + frDate(today()));
    compose(P, blocks);
    ui.canvas = P.c; P.c.className = 'pb-out'; box.innerHTML = ''; box.appendChild(P.c); msg(''); renderEdit(P);
  } catch(e){ if (seq !== drawSeq) return; ui.canvas = null; box.innerHTML = '<p class="pb-err">⚠ ' + esc(e.message || 'erreur') + '</p>'; }
  box.classList.remove('busy');
}
// Panneau « Modifier les textes et chiffres » : un champ par texte affiché (vide = valeur d'origine, en gris)
function renderEdit(P){
  const el = $('pbEdit'); if (!el) return;
  const ov = ui.opts.ov || {}, sig = P.fields.map(f => f.key).join('|') + '#' + (P.info || '');
  if (sig === ui.editSig && el.childElementCount){ P.fields.forEach(f => { const i = el.querySelector('[data-pb-ov="' + f.key + '"]'); if (i) i.placeholder = f.val; }); return; }
  ui.editSig = sig;
  el.innerHTML = (P.info ? '<p class="pb-info">' + esc(P.info) + '</p>' : '') + '<details class="pb-more" open><summary>✏ Modifier les textes et chiffres</summary>' +
    P.fields.map(f => '<label>' + esc(f.label) + '<input type="text" data-pb-ov="' + esc(f.key) + '" value="' + esc(ov[f.key] || '') + '" placeholder="' + esc(f.val) + '"></label>').join('') +
    '<button type="button" class="pb-sec small" data-pb-ovreset>↺ Revenir aux valeurs d\'origine</button></details>';
}
function msg(s, ok){ const m = $('pbMsg'); if (m){ m.textContent = s; m.className = 'pb-msg' + (ok ? ' ok' : ''); } }
function fileName(){ const t = T.find(x => x.k === ui.tpl); return 'wolf-' + t.k + '-' + today() + '-' + ({ f1: 'carre', f45: 'portrait', f916: 'story' }[ui.fmt]) + '.png'; }
function download(){
  if (!ui.canvas) return msg('Rien à télécharger : corrige le réglage indiqué.');
  try { ui.canvas.toBlob(b => { if (!b) return msg('Export impossible.'); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fileName(); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); msg('✔ Image téléchargée : ' + fileName(), true); }, 'image/png'); }
  catch(e){ msg('Export impossible : une image externe bloque la capture.'); }
}
async function copy(){
  if (!ui.canvas) return;
  try { const b = await new Promise(r => ui.canvas.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); msg('✔ Image copiée : colle-la où tu veux.', true); }
  catch(e){ msg('Copie impossible dans ce navigateur : utilise « Télécharger ».'); }
}
function wire(){
  const el = page(); if (!el || el._pbWired) return; el._pbWired = true;
  el.addEventListener('click', async e => {
    const b = e.target.closest('button, summary'); if (!b) return;
    const ds = b.dataset;
    if (ds.pbTpl){ ui.tpl = ds.pbTpl; ui.opts = Object.assign({}, prefs()[ui.tpl] || {}); ui.sugg = {}; ui.q = {}; return renderPage(); }
    if (ds.pbBack !== undefined){ ui.tpl = null; return renderPage(); }
    if (ds.pbFmt){ ui.fmt = ds.pbFmt; el.querySelectorAll('[data-pb-fmt]').forEach(x => x.classList.toggle('on', x === b)); return draw(); }
    if (ds.pbTheme){ ui.theme = ds.pbTheme; el.querySelectorAll('[data-pb-theme]').forEach(x => x.classList.toggle('on', x === b)); return draw(); }
    if (ds.pbOvreset !== undefined){ ui.opts.ov = {}; ui.editSig = ''; return draw(); }
    if (ds.pbDl !== undefined) return download();
    if (ds.pbCopy !== undefined) return copy();
    if (ds.pbPick){ const [fid, i] = ds.pbPick.split('|'), r = (ui.sugg[fid] || [])[+i]; if (!r) return; const c = { sym: r.symbol, name: r.name, logoid: r.logoid || null };
      const f = T.find(x => x.k === ui.tpl).fields.find(x => x.id === fid);
      if (f.type === 'companies'){ ui.opts[fid] = (ui.opts[fid] || []).filter(x => x.sym !== c.sym).concat([c]).slice(0, f.max || 15); } else ui.opts[fid] = c;
      ui.sugg[fid] = null; ui.q[fid] = ''; await renderControls(T.find(x => x.k === ui.tpl)); return schedule(); }
    if (ds.pbRm){ const [fid, i] = ds.pbRm.split('|'); if (Array.isArray(ui.opts[fid])) ui.opts[fid].splice(+i, 1); else ui.opts[fid] = null; await renderControls(T.find(x => x.k === ui.tpl)); return schedule(); }
    if (ds.pbHeld){ const fid = ds.pbHeld, f = T.find(x => x.k === ui.tpl).fields.find(x => x.id === fid); try { const h = await wolfHeld();
      if (f.type === 'companies'){ const cur = ui.opts[fid] || []; ui.opts[fid] = cur.concat(h.filter(x => !cur.some(y => y.sym === x.sym))).slice(0, f.max || 15); }
      else { ui.sugg[fid] = h.map(x => ({ symbol: x.sym, name: x.name, logoid: x.logoid })); const bx = $('pbSugg_' + fid); if (bx) bx.innerHTML = suggHtml(fid); return; }
      await renderControls(T.find(x => x.k === ui.tpl)); schedule(); } catch(err){ msg(err.message); } return; }
  });
  // changer une donnée (opération, entreprise, période…) efface les corrections manuelles, qui ne valaient que pour l'ancienne donnée
  el.addEventListener('change', async e => { const t = e.target;
    if (t.dataset && t.dataset.pbChk){ const id = t.dataset.pbChk; ui.opts[id] = [...el.querySelectorAll('[data-pb-chk="' + id + '"]')].filter(x => x.checked).map(x => x.value); ui.opts.ov = {}; ui.editSig = ''; return schedule(); }
    const f = t.dataset && t.dataset.pbF; if (!f) return; ui.opts[f] = t.type === 'checkbox' ? t.checked : t.value; ui.opts.ov = {}; ui.editSig = '';
    const fd = (T.find(x => x.k === ui.tpl) || { fields: [] }).fields.find(x => x.id === f); if (fd && fd.rerender){ if (f === 'sec') ui.opts.pick = null; await renderControls(T.find(x => x.k === ui.tpl)); } schedule(); });
  el.addEventListener('input', e => { const t = e.target; if (t.dataset && t.dataset.pbOv){ ui.opts.ov = Object.assign({}, ui.opts.ov, { [t.dataset.pbOv]: t.value }); return schedule(); }
    if (t.dataset && t.dataset.pbQ) return search(t.dataset.pbQ, t.value); if (t.dataset && (t.dataset.pbF === 'titre' || t.dataset.pbF === 'sous')){ ui.opts[t.dataset.pbF] = t.value; schedule(); } });
}
function onShow(){ wire(); const p = prefs(); if (p._fmt) ui.fmt = p._fmt; if (p._theme && THEMES[p._theme]) ui.theme = p._theme; renderPage(); }
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-page="' + PAGE_ID + '"]'); if (b) setTimeout(onShow, 0); });
// Ouvre directement un modèle prérempli (boutons « 📤 Publier » ailleurs dans l'appli)
function open(k, preset){
  if (typeof switchPage === 'function') switchPage(PAGE_ID);
  wire(); ui.tpl = k; ui.opts = Object.assign({}, prefs()[k] || {}, preset || {}); ui.sugg = {}; ui.q = {}; renderPage();
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e){}
}
window.WOLF_PUB = { open, templates: T.map(t => t.k), _render: async (k, opts, fmt, theme) => { await fontsReady(); setTheme(theme || 'nuit'); const t = T.find(x => x.k === k), P = mk(fmt || 'f45'); P.ov = (opts && opts.ov) || {}; const b = await t.build(P, opts || {}); await frame(P, t.name, 'test'); compose(P, b); P.c._layout = { blocks: P.layout, bottom: P.bottom, limit: P.H - 160 }; return P.c; } };
})();
