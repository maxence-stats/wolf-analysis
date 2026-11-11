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
const C = { bg: '#0E1114', card: '#171C22', card2: '#1F252C', line: '#2A323B', text: '#F2F3F5', dim: '#A2A9B4', faint: '#6B737E',
  gold: '#D9A441', gold2: '#E7C67A', green: '#4FD1A5', red: '#E5636B', blue: '#4A9FE0', white: '#FFFFFF' };
const F = { title: '"Roboto Slab", Georgia, serif', sub: 'Lora, Georgia, serif', mono: '"JetBrains Mono", Consolas, monospace', body: '"Plus Jakarta Sans", "Segoe UI", sans-serif' };
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

/* ======================= DESSIN ======================= */
function mk(fmt){
  const c = document.createElement('canvas'); c.width = W; c.height = HS[fmt]; const x = c.getContext('2d');
  x.fillStyle = C.bg; x.fillRect(0, 0, W, c.height);
  return { c, x, fmt, H: c.height, L: 70, R: W - 70, CW: W - 140, big: fmt === 'f916', small: fmt === 'f1' };
}
function setF(x, f){ x.font = f; }
function txt(x, s, X, Y, f, col, align){ x.font = f; x.fillStyle = col; x.textAlign = align || 'left'; x.textBaseline = 'alphabetic'; x.fillText(s, X, Y); }
function tracked(x, s, X, Y, size, col, track, align, weight){
  x.font = (weight || 500) + ' ' + size + 'px ' + F.mono; x.fillStyle = col; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  const chars = [...String(s)], wTot = chars.reduce((a, ch) => a + x.measureText(ch).width + track, 0) - track;
  let cx = align === 'right' ? X - wTot : align === 'center' ? X - wTot / 2 : X;
  chars.forEach(ch => { x.fillText(ch, cx, Y); cx += x.measureText(ch).width + track; });
  return wTot;
}
function wrap(x, s, f, maxW){
  x.font = f; const out = [];
  String(s).split('\n').forEach(par => { let line = ''; par.split(/\s+/).forEach(w => { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line){ out.push(line); line = w; } else line = t; }); out.push(line); });
  return out;
}
function fit(x, s, weightFamily, size, maxW, min){ let k = size; x.font = weightFamily.replace('%', k); while (k > (min || 20) && x.measureText(s).width > maxW){ k -= 2; x.font = weightFamily.replace('%', k); } return k; }
function rr(x, X, Y, w, h, r, fill, stroke){
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  if (fill){ x.fillStyle = fill; x.fill(); } if (stroke){ x.strokeStyle = stroke; x.lineWidth = 2; x.stroke(); }
}
function logoC(x, im, cx, cy, r, fallback){
  x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.closePath(); x.fillStyle = '#FFFFFF'; x.fill(); x.clip();
  if (im){ if (typeof drawLogoInCircle === 'function') drawLogoInCircle(x, im, cx, cy, r, im.src); else { const k = Math.max(2 * r / im.width, 2 * r / im.height); x.drawImage(im, cx - im.width * k / 2, cy - im.height * k / 2, im.width * k, im.height * k); } }
  else { x.fillStyle = C.card2; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); txt(x, String(fallback || '?').slice(0, 1).toUpperCase(), cx, cy + r * 0.36, '700 ' + Math.round(r) + 'px ' + F.title, C.gold, 'center'); }
  x.restore();
}
// En-tête et pied de page de la charte Wolf Academy (comme le Kit Investisseur du Loup)
async function frame(P, label, source){
  const x = P.x, head = await loadImg(WOLF);
  if (head){ const s = 58, k = s / Math.max(head.width, head.height); x.drawImage(head, P.L, 50, head.width * k, head.height * k); }
  const w = tracked(x, 'WOLF ACADEMY INVEST', P.L + 76, 88, 20, C.dim, 4);
  if (label){ x.fillStyle = C.gold; x.fillRect(P.L + 76 + w + 22, 81, 40, 3); tracked(x, label.toUpperCase(), P.L + 76 + w + 78, 88, 20, C.gold, 4); }
  x.fillStyle = C.line; x.fillRect(P.L, P.H - 96, P.CW, 2);
  txt(x, 'Contenu pédagogique — pas un conseil en investissement', P.L, P.H - 52, '500 21px ' + F.body, C.faint);
  if (source) tracked(x, source.toUpperCase(), P.R, P.H - 52, 17, C.faint, 2, 'right');
}
// Répartit les blocs dans l'espace libre (centrés, écarts réguliers)
function compose(P, blocks){
  blocks = blocks.filter(Boolean);
  const top = 150, bot = P.H - 140, area = bot - top, n = blocks.length;
  for (let guard = 0; guard < 20; guard++){ const tot = blocks.reduce((s, b) => s + b.h, 0) + 24 * (n - 1); if (tot <= area) break; const r = blocks.slice().reverse().find(b => b.shrink && b.shrink()); if (!r) break; }
  blocks = blocks.filter(b => b.h > 0); const sum = blocks.reduce((s, b) => s + b.h, 0);
  const m = blocks.length, gap = m > 1 ? Math.max(24, Math.min(P.big ? 120 : 84, (area - sum) / (m + 1))) : 0;
  let y = top + Math.max(0, (area - sum - gap * (m - 1)) / 2);
  blocks.forEach(b => { b.draw(y); y += b.h + gap; });
}

/* ---------- blocs ---------- */
const B = {
  title(P, eyebrow, title, sub){
    const x = P.x, size = P.small ? 82 : 96, tf = '700 ' + size + 'px ' + F.title, lines = wrap(x, title, tf, P.CW).slice(0, 3);
    const sf = 'italic 400 ' + (P.small ? 34 : 38) + 'px ' + F.sub, subs = sub ? wrap(x, sub, sf, P.CW).slice(0, 2) : [];
    const h = (eyebrow ? 46 : 0) + lines.length * size * 1.06 + (subs.length ? 18 + subs.length * 48 : 0) + 34;
    return { h, draw(y){
      let Y = y;
      if (eyebrow){ tracked(x, eyebrow.toUpperCase(), P.L, Y + 24, 22, C.gold, 5); Y += 46; }
      lines.forEach(l => { Y += size * 1.02; txt(x, l, P.L, Y, tf, C.white); }); Y += size * 0.04 * lines.length;
      if (subs.length){ Y += 18; subs.forEach(s => { Y += 44; txt(x, s, P.L, Y, sf, C.gold2); }); Y += 4; }
      x.fillStyle = C.gold; x.fillRect(P.L, Y + 22, 84, 5);
    } };
  },
  big(P, value, color, caption){
    const x = P.x, size = P.small ? 168 : P.big ? 230 : 200, cf = '500 ' + (P.small ? 30 : 34) + 'px ' + F.body;
    const k = fit(x, value, '700 %px ' + F.title, size, P.CW, 90);
    const caps = caption ? wrap(x, caption, cf, P.CW).slice(0, 2) : [];
    return { h: k * 0.95 + (caps.length ? 20 + caps.length * 44 : 0), draw(y){
      txt(x, value, P.L - 4, y + k * 0.82, '700 ' + k + 'px ' + F.title, color || C.white);
      caps.forEach((c, i) => txt(x, c, P.L, y + k * 0.95 + 20 + 34 + i * 44, cf, C.dim));
    } };
  },
  kpis(P, items){
    items = items.filter(Boolean).slice(0, 3); const x = P.x, n = items.length, g = 18, w = (P.CW - g * (n - 1)) / n, h = P.small ? 138 : 158;
    return { h, draw(y){ items.forEach((it, i) => { const X = P.L + i * (w + g); rr(x, X, y, w, h, 22, C.card);
      tracked(x, it.l.toUpperCase(), X + 26, y + 46, 18, C.faint, 3);
      const k = fit(x, it.v, '700 %px ' + F.title, P.small ? 46 : 52, w - 52, 24); txt(x, it.v, X + 26, y + 46 + 18 + k, '700 ' + k + 'px ' + F.title, it.c || C.white); }); } };
  },
  head(P, im, name, tag, tagColor, sub){
    const x = P.x, r = P.small ? 72 : 84, h = 2 * r;
    return { h, draw(y){
      logoC(x, im, P.L + r, y + r, r, name); x.beginPath(); x.arc(P.L + r, y + r, r + 5, 0, Math.PI * 2); x.strokeStyle = 'rgba(217,164,65,.35)'; x.lineWidth = 3; x.stroke();
      const X = P.L + 2 * r + 34, k = fit(x, name, '700 %px ' + F.title, P.small ? 64 : 72, P.R - X, 34);
      txt(x, name, X, y + r + (tag || sub ? -6 : k * 0.35), '700 ' + k + 'px ' + F.title, C.white);
      let tx = X;
      if (tag){ x.font = '700 22px ' + F.mono; const tw = x.measureText(tag.toUpperCase()).width + tag.length * 4 + 28;
        rr(x, X, y + r + 18, tw, 46, 10, tagColor === C.red ? 'rgba(229,99,107,.16)' : tagColor === C.green ? 'rgba(79,209,165,.16)' : 'rgba(217,164,65,.16)');
        tracked(x, tag.toUpperCase(), X + 16, y + r + 50, 22, tagColor || C.gold, 4, 'left', 700); tx = X + tw + 18; }
      if (sub) txt(x, sub, tx, y + r + 50, '500 26px ' + F.body, C.dim);
    } };
  },
  pills(P, items){
    const x = P.x, h = 58;
    return { h, draw(y){ let X = P.L; items.filter(Boolean).forEach(it => { x.font = '600 25px ' + F.body; const w1 = x.measureText(it.l + '  ').width; x.font = '800 25px ' + F.body; const w = w1 + x.measureText(it.v).width + 40;
      rr(x, X, y, w, h, 14, C.card); txt(x, it.l, X + 20, y + 38, '600 25px ' + F.body, C.dim); txt(x, it.v, X + 20 + w1, y + 38, '800 25px ' + F.body, it.c || C.white); X += w + 14; }); } };
  },
  rows(P, items){
    const x = P.x, rh = items.length <= 3 ? (P.small ? 108 : 124) : P.small ? 88 : 102, g = 14;
    const blk = { h: items.length * (rh + g) - g, shrink(){ if (!items.length) return false; items = items.slice(0, -1); blk.h = items.length ? items.length * (rh + g) - g : 0; return true; }, draw(y){ items.forEach((it, i) => { const Y = y + i * (rh + g); rr(x, P.L, Y, P.CW, rh, 20, C.card);
      const r = rh * 0.34; logoC(x, it.img, P.L + 22 + r, Y + rh / 2, r, it.name);
      const X = P.L + 22 + 2 * r + 22, rightW = it.right ? 260 : 0;
      const k = fit(x, it.name, '700 %px ' + F.body, 32, P.R - X - rightW - (it.mid ? 230 : 0) - 20, 20);
      txt(x, it.name, X, Y + rh / 2 + (it.sub ? -4 : 11), '700 ' + k + 'px ' + F.body, C.white);
      if (it.sub) txt(x, it.sub, X, Y + rh / 2 + 30, '500 22px ' + F.body, C.faint);
      if (it.mid) txt(x, it.mid, P.R - rightW - 30, Y + rh / 2 + 10, '700 27px ' + F.body, C.gold, 'right');
      if (it.pill){ x.font = '700 24px ' + F.body; const w = x.measureText(it.right).width + 52; rr(x, P.R - 22 - w, Y + rh / 2 - 24, w, 48, 24, it.pillBg);
        x.beginPath(); x.arc(P.R - 22 - w + 20, Y + rh / 2, 6, 0, Math.PI * 2); x.fillStyle = it.rightColor; x.fill(); txt(x, it.right, P.R - 22 - w + 34, Y + rh / 2 + 9, '700 24px ' + F.body, it.rightColor); }
      else if (it.right){ txt(x, it.right, P.R - 26, Y + rh / 2 + (it.rightSub ? -2 : 11), '700 ' + (P.small ? 30 : 34) + 'px ' + F.title, it.rightColor || C.white, 'right');
        if (it.rightSub) txt(x, it.rightSub, P.R - 26, Y + rh / 2 + 30, '500 21px ' + F.body, C.faint, 'right'); }
    }); } };
    return blk;
  },
  rings(P, items, max){
    const x = P.x, cols = items.length <= 4 ? items.length : items.length <= 8 ? 4 : 5, rowsN = Math.ceil(items.length / cols), cw = P.CW / cols;
    const r = Math.min(cw * 0.36, P.small ? 62 : 76), rowH = 2 * r + (P.small ? 118 : 150);
    return { h: rowsN * rowH, draw(y){ items.forEach((it, i) => { const cx = P.L + cw * (i % cols) + cw / 2, Y = y + Math.floor(i / cols) * rowH, cy = Y + 44 + r + 10;
      txt(x, it.label, cx, Y + 32, '600 ' + (P.small ? 24 : 27) + 'px ' + F.mono, C.dim, 'center');
      x.beginPath(); x.arc(cx, cy, r + 9, 0, Math.PI * 2); x.strokeStyle = C.line; x.lineWidth = 9; x.stroke();
      const f = Math.max(0.02, Math.min(1, (it.ring != null ? it.ring : it.v / max)));
      x.beginPath(); x.arc(cx, cy, r + 9, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); x.strokeStyle = C.gold; x.lineCap = 'round'; x.stroke(); x.lineCap = 'butt';
      logoC(x, it.img, cx, cy, r, it.name);
      txt(x, it.text, cx, cy + r + 58, '700 ' + (P.small ? 30 : 34) + 'px ' + F.title, C.white, 'center');
    }); } };
  },
  bars(P, items, max){
    const x = P.x, rh = P.small ? 64 : 76, g = P.small ? 16 : 22;
    return { h: items.length * (rh + g) - g, draw(y){ items.forEach((it, i) => { const Y = y + i * (rh + g), r = rh / 2; logoC(x, it.img, P.L + r, Y + r, r, it.name);
      const X = P.L + 2 * r + 22, tw = 170, bw = P.R - X - tw - 16, f = Math.max(0.01, Math.min(1, Math.abs(it.v) / max));
      rr(x, X, Y + rh * 0.18, bw, rh * 0.64, rh * 0.2, C.card);
      const grd = x.createLinearGradient(X, 0, X + bw * f, 0); grd.addColorStop(0, it.v < 0 ? '#9C3F45' : '#A97A2A'); grd.addColorStop(1, it.v < 0 ? C.red : C.gold2);
      rr(x, X, Y + rh * 0.18, Math.max(rh * 0.4, bw * f), rh * 0.64, rh * 0.2, grd);
      txt(x, it.text, P.R, Y + r + 12, '700 ' + (P.small ? 32 : 36) + 'px ' + F.title, C.white, 'right');
    }); } };
  },
  vbars(P, labels, values, unit, h){
    const x = P.x; h = h || (P.small ? 420 : P.big ? 640 : 520);
    return { h, draw(y){ const vals = values.map(v => isNum(v) ? v : 0), max = Math.max(...vals.map(Math.abs), 1e-9), n = vals.length, gw = P.CW / n, bw = Math.min(56, gw * 0.62), base = y + h - 44, top = y + 54;
      x.fillStyle = C.line; x.fillRect(P.L, base, P.CW, 2);
      vals.forEach((v, i) => { const bh = Math.abs(v) / max * (base - top), X = P.L + gw * i + (gw - bw) / 2, last = i === n - 1;
        rr(x, X, base - bh, bw, Math.max(bh, 3), Math.min(10, bw / 3), last ? C.gold2 : v < 0 ? C.red : C.gold);
        const st = Math.ceil(n / 10); if (n <= 12 || (i % st === 0 && n - 1 - i >= st) || last) txt(x, n > 12 ? '’' + String(labels[i]).slice(-2) : String(labels[i]), X + bw / 2, base + 36, '500 20px ' + F.mono, C.faint, 'center');
        if (last || i === 0) txt(x, unit(v), X + bw / 2, base - bh - 14, '700 ' + (P.small ? 24 : 27) + 'px ' + F.body, last ? C.gold2 : C.dim, 'center'); });
    } };
  },
  line(P, series, opts){
    opts = opts || {}; const x = P.x, h = opts.h || (P.small ? 400 : P.big ? 620 : 500);
    return { h, draw(y){
      const all = series.flatMap(s => s.values.filter(isNum)).concat((opts.hlines || []).map(l => l.v)), lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08 || 1;
      const min = lo - pad, max = hi + pad, X0 = P.L, X1 = P.R - (opts.hlines && opts.hlines.length ? 0 : 0), Y0 = y + 20, Y1 = y + h - 44;
      const n = Math.max(...series.map(s => s.values.length)), px = i => X0 + (X1 - X0) * i / Math.max(1, n - 1), py = v => Y1 - (v - min) / (max - min) * (Y1 - Y0);
      rr(x, X0 - 10, y, X1 - X0 + 20, h, 22, C.card);
      for (let k = 1; k < 4; k++){ x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(X0, Y0 + (Y1 - Y0) * k / 4, X1 - X0, 2); }
      if (opts.zero && min < 0 && max > 0){ x.setLineDash([8, 10]); x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 2; x.beginPath(); x.moveTo(X0, py(0)); x.lineTo(X1, py(0)); x.stroke(); x.setLineDash([]); }
      (opts.hlines || []).forEach(l => { x.setLineDash([12, 10]); x.strokeStyle = l.color; x.lineWidth = 3; x.beginPath(); x.moveTo(X0, py(l.v)); x.lineTo(X1, py(l.v)); x.stroke(); x.setLineDash([]);
        x.font = '700 22px ' + F.body; const tw = x.measureText(l.label).width + 24; rr(x, X1 - tw - 6, py(l.v) - 42, tw, 34, 8, C.bg); txt(x, l.label, X1 - 18, py(l.v) - 18, '700 22px ' + F.body, l.color, 'right'); });
      series.forEach((s, si) => {
        const pts = s.values.map((v, i) => isNum(v) ? [px(i), py(v)] : null).filter(Boolean); if (pts.length < 2) return;
        if (s.fill){ const g = x.createLinearGradient(0, Y0, 0, Y1); g.addColorStop(0, s.color + '55'); g.addColorStop(1, s.color + '00'); x.beginPath(); x.moveTo(pts[0][0], Y1); pts.forEach(p => x.lineTo(p[0], p[1])); x.lineTo(pts[pts.length - 1][0], Y1); x.closePath(); x.fillStyle = g; x.fill(); }
        x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.strokeStyle = s.color; x.lineWidth = s.width || 5; x.lineJoin = 'round'; x.stroke();
        const e = pts[pts.length - 1]; x.beginPath(); x.arc(e[0], e[1], si === 0 ? 10 : 7, 0, Math.PI * 2); x.fillStyle = s.color; x.fill();
      });
      if (opts.labels){ txt(x, opts.labels[0], X0, Y1 + 36, '500 21px ' + F.mono, C.faint); txt(x, opts.labels[1], X1, Y1 + 36, '500 21px ' + F.mono, C.faint, 'right'); }
      if (opts.legend){ let LX = X0 + 6; opts.legend.forEach(l => { x.fillStyle = l.color; x.fillRect(LX, Y0 + 2, 30, 6); txt(x, l.label, LX + 40, Y0 + 12, '600 22px ' + F.body, C.dim); x.font = '600 22px ' + F.body; LX += 70 + x.measureText(l.label).width; }); }
    } };
  },
  donut(P, items, center){
    const x = P.x, h = P.small ? 470 : P.big ? 620 : 560;
    return { h, draw(y){
      const r = Math.min(h / 2 - 20, P.CW * 0.25), cx = P.L + r + 10, cy = y + h / 2, tot = items.reduce((s, i) => s + i.v, 0);
      let a = -Math.PI / 2; items.forEach((it, i) => { const da = it.v / tot * Math.PI * 2; x.beginPath(); x.arc(cx, cy, r, a, a + da); x.arc(cx, cy, r * 0.62, a + da, a, true); x.closePath(); x.fillStyle = it.color || SERIES[i % SERIES.length]; x.fill(); x.strokeStyle = C.bg; x.lineWidth = 4; x.stroke(); a += da; });
      if (center){ const s = r * 0.9, k = s / Math.max(center.width, center.height); x.drawImage(center, cx - center.width * k / 2, cy - center.height * k / 2, center.width * k, center.height * k); }
      const LX = cx + r + 60, rowH = Math.min(78, (h - 20) / items.length);
      items.forEach((it, i) => { const Y = y + (h - rowH * items.length) / 2 + i * rowH + rowH / 2;
        x.fillStyle = it.color || SERIES[i % SERIES.length]; rr(x, LX, Y - 7, 22, 14, 4, it.color || SERIES[i % SERIES.length]);
        const NX = it.sym ? LX + 94 : LX + 40; if (it.sym) logoC(x, it.img, LX + 58, Y, rowH * 0.32, it.name);
        const k = fit(x, it.name, '600 %px ' + F.body, 28, P.R - NX - 130, 18); txt(x, it.name, NX, Y + 10, '600 ' + k + 'px ' + F.body, C.text);
        txt(x, fr(it.v / tot * 100, 1) + ' %', P.R, Y + 11, '700 32px ' + F.title, C.white, 'right'); });
    } };
  },
  duel(P, a, b){
    const x = P.x, h = P.small ? 330 : 380;
    return { h, draw(y){ [a, b].forEach((s, i) => { const w = (P.CW - 20) / 2, X = P.L + i * (w + 20); rr(x, X, y, w, h, 26, C.card); x.fillStyle = s.color; x.fillRect(X + 26, y, 70, 5);
      logoC(x, s.img, X + w / 2, y + 96, 58, s.name);
      const k = fit(x, s.name, '700 %px ' + F.body, 30, w - 40, 18); txt(x, s.name, X + w / 2, y + 196, '700 ' + k + 'px ' + F.body, C.dim, 'center');
      const kk = fit(x, s.value, '700 %px ' + F.title, P.small ? 62 : 70, w - 40, 30); txt(x, s.value, X + w / 2, y + 196 + 26 + kk, '700 ' + kk + 'px ' + F.title, s.win ? C.green : C.white, 'center');
      txt(x, s.sub, X + w / 2, y + h - 30, '600 24px ' + F.body, C.faint, 'center'); }); } };
  },
  image(P, im, maxH){
    const x = P.x, k = Math.min(P.CW / im.width, (maxH || 700) / im.height), w = im.width * k, h = im.height * k;
    return { h: h + 40, draw(y){ rr(x, P.L, y, P.CW, h + 40, 24, C.card); x.drawImage(im, P.L + (P.CW - w) / 2, y + 20, w, h); } };
  },
  para(P, s, maxLines){
    const x = P.x, f = '400 ' + (P.small ? 32 : 36) + 'px ' + F.sub, lines = wrap(x, s, f, P.CW - 60).slice(0, maxLines || 10), lh = P.small ? 46 : 52;
    return { h: lines.length * lh + 50, draw(y){ rr(x, P.L, y, P.CW, lines.length * lh + 50, 24, C.card); lines.forEach((l, i) => txt(x, l, P.L + 30, y + 25 + lh * (i + 1) - 12, f, C.text)); } };
  },
  note(P, s){ const x = P.x; return { h: 34, draw(y){ txt(x, s, P.L, y + 26, 'italic 400 26px ' + F.sub, C.faint); } }; },
};
const cap = (P, s, m, l) => P.small ? s : P.big ? l : m;   // nombre d'éléments selon le format

/* ======================= MODÈLES ======================= */
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
        B.big(P, money(op.px, op.ccy), C.gold, 'prix d\'achat · ' + fr(op.qty, op.qty % 1 ? 2 : 0) + ' actions'),
        B.kpis(P, [{ l: 'Montant', v: money(-op.eur, 'EUR', 0) }, { l: 'Poids', v: p && tot > 0 ? fr(p.qty * pe / tot * 100, 1) + ' %' : '—' }, { l: 'PRU', v: p ? money(p.cost / p.qty, 'EUR') : '—' }])];
    }
    const p = before.pos[op.symbol]; if (!p) throw new Error('Position introuvable avant cette vente.');
    const pru = p.cost / p.qty, net = op.eur / op.qty, pct = (net / pru - 1) * 100, days = w.E.daysBetween(p.open, op.date), gain = op.eur - pru * op.qty;
    return [B.title(P, 'Wolf Portfolio · ' + frDate(op.date), o.titre || (pct >= 0 ? 'Prise de bénéfices' : 'Vente'), o.sous || null), B.head(P, im, s.name, 'Vente', C.red),
      B.big(P, sgn(pct), pct >= 0 ? C.green : C.red, (gain >= 0 ? '+' : '−') + fr(Math.abs(gain), 0) + ' € de ' + (gain >= 0 ? 'plus' : 'moins') + '-value · détenue ' + duree(days)),
      B.kpis(P, [{ l: 'Prix de vente', v: money(op.px, op.ccy) }, { l: 'PRU', v: money(pru, 'EUR') }, { l: 'Par an', v: days >= 30 ? sgn((Math.pow(net / pru, 365 / Math.max(days, 1)) - 1) * 100) : '—', c: pct >= 0 ? C.green : C.red }])];
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
    const ops = w.E.sortOps(w.ops).filter(x => x.date > from && x.date <= to && ['BUY', 'SELL', 'DIV'].includes(x.type)).reverse();
    const n = o.courbe ? cap(P, 0, 2, 5) : cap(P, 3, 4, 7), shown = await Promise.all(ops.slice(0, n).map(async x => { const s = w.sym(x.symbol);
      return { img: await logoFor(s), name: s.name, sub: shortDate(x.date), right: x.type === 'DIV' ? '+' + fr(x.eur, 2) + ' €' : x.type === 'BUY' ? 'Achat' : 'Vente', rightColor: x.type === 'DIV' ? C.gold : x.type === 'BUY' ? C.green : C.red }; }));
    const blocks = [B.title(P, eyebrow, o.titre || label, o.sous || (perf >= cac ? 'Devant le CAC 40 de ' + fr(perf - cac, 1) + ' point' + (Math.abs(perf - cac) >= 2 ? 's' : '') : 'Derrière le CAC 40 de ' + fr(cac - perf, 1) + ' point' + (Math.abs(perf - cac) >= 2 ? 's' : ''))),
      B.big(P, sgn(perf, 2), perf >= 0 ? C.green : C.red, 'Wolf Portfolio'),
      B.pills(P, [{ l: 'CAC 40', v: sgn(cac, 2), c: cac >= 0 ? C.green : C.red }, { l: 'S&P 500 (€)', v: sgn(spx, 2), c: spx >= 0 ? C.green : C.red }])];
    if (o.courbe){ let a = 1, b = 1, c2 = 1; const cr = w.E.benchRows(rows, w.S, w.cac), sr = w.E.benchRows(rows, w.S, w.spx, 'FX_IDC:EURUSD');
      const pv = [0].concat(rows.map(r => ((a *= 1 + r.r) - 1) * 100)), cv = [0].concat(cr.map(r => ((b *= 1 + r.r) - 1) * 100)), sv = [0].concat(sr.map(r => ((c2 *= 1 + r.r) - 1) * 100));
      blocks.push(B.line(P, [{ values: cv, color: C.blue, width: 4 }, { values: sv, color: '#B4BAC4', width: 4 }, { values: pv, color: C.gold, width: 6, fill: true }], { zero: true, h: cap(P, 300, 360, 460), legend: [{ label: 'Wolf', color: C.gold }, { label: 'CAC 40', color: C.blue }, { label: 'S&P 500', color: '#B4BAC4' }] })); }
    if (shown.length) blocks.push(B.rows(P, shown));
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
    const beat = d.earnings_per_share_fq >= d.earnings_per_share_forecast_fq, sur = isNum(d.eps_surprise_percent_fq) ? d.eps_surprise_percent_fq : (d.earnings_per_share_fq / d.earnings_per_share_forecast_fq - 1) * 100;
    const ccy = d.fundamental_currency_code || d.currency, rev = isNum(d.revenue_fq) && isNum(d.revenue_forecast_fq) ? (d.revenue_fq / d.revenue_forecast_fq - 1) * 100 : null, date = tsIso(d.earnings_release_date);
    return [B.title(P, 'Résultats' + (date ? ' · ' + frDate(date) : ''), o.titre || co.name, o.sous || 'Le verdict face au consensus'), B.head(P, await logoFor(co), co.name, beat ? 'Battu' : 'Manqué', beat ? C.green : C.red),
      B.big(P, beat ? 'BATTU' : 'MANQUÉ', beat ? C.green : C.red, 'Bénéfice par action ' + sgn(sur) + ' par rapport au consensus'),
      B.kpis(P, [{ l: 'BPA publié', v: money(d.earnings_per_share_fq, ccy) }, { l: 'BPA attendu', v: money(d.earnings_per_share_forecast_fq, ccy) }, { l: 'CA vs attendu', v: sgn(rev), c: rev >= 0 ? C.green : C.red }])];
  } },
{ k: 'perfA', group: 'Portefeuille', ic: '📈', name: 'Performance d\'une action', desc: 'Le cours sur la période choisie, la hausse en gros', mine: true,
  fields: [{ id: 'co', type: 'company', label: 'Entreprise', quick: 'held' }, { id: 'range', type: 'select', label: 'Période', options: RANGES.map(r => [r[0], r[1]]) }],
  async build(P, o){
    const co = o.co || (await wolfHeld())[0]; if (!co) throw new Error('Choisis une entreprise.');
    const R = RANGES.find(r => r[0] === (o.range || '1a')) || RANGES[3], from = addD(today(), -R[2]), h = await history(co.sym, from);
    const i0 = h.d.findIndex(x => x >= from), d = h.d.slice(Math.max(0, i0)), c = h.c.slice(Math.max(0, i0)); if (c.length < 2) throw new Error('Pas assez de cours.');
    const chg = (c[c.length - 1] / c[0] - 1) * 100, yrs = R[2] / 365.25, step = Math.ceil(c.length / 400), vals = c.filter((_, i) => i % step === 0 || i === c.length - 1);
    return [B.title(P, 'Sur ' + R[1], o.titre || co.name, o.sous || null), B.big(P, sgn(chg), chg >= 0 ? C.green : C.red, 'de ' + money(c[0], h.ccy) + ' à ' + money(c[c.length - 1], h.ccy) + ' (hors dividendes)'),
      B.line(P, [{ values: vals, color: C.gold, width: 5, fill: true }], { labels: [frDate(d[0]), frDate(d[d.length - 1])] }),
      yrs >= 1 ? B.kpis(P, [{ l: 'Par an', v: sgn((Math.pow(c[c.length - 1] / c[0], 1 / yrs) - 1) * 100), c: chg >= 0 ? C.green : C.red }, { l: 'Plus haut', v: money(Math.max(...c), h.ccy) }, { l: 'Plus bas', v: money(Math.min(...c), h.ccy) }]) : null];
  } },
/* ----- Entreprises (TradingView) ----- */
{ k: 'valo', group: 'Entreprises', ic: '⚖️', name: 'Valorisation', desc: 'Cours, prix juste, marge de sécurité',
  fields: [{ id: 'nom', type: 'select', label: 'Entreprise suivie (onglet Analyse)', options: () => followed().map(n => [n, n]) }],
  async build(P, o){
    const nom = o.nom || followed()[0], rows = (typeof companies !== 'undefined' && companies[nom]) || []; const last = rows[rows.length - 1];
    if (!last || !isNum(last.prixJuste)) throw new Error('Pas de prix juste pour cette entreprise.');
    const sym = last.ticker, h = sym ? await history(sym, addD(today(), -1826)).catch(() => null) : null, cours = isNum(last.prixActuel) ? last.prixActuel : h && h.c[h.c.length - 1];
    const marge = (last.prixJuste / cours - 1) * 100, ccy = last.devise || (h && h.ccy) || 'EUR', step = h ? Math.ceil(h.c.length / 300) : 1;
    return [B.title(P, 'Valorisation', o.titre || (marge >= 0 ? nom + ' sous-évaluée ?' : nom + ' trop chère ?'), o.sous || null),
      B.big(P, sgn(marge, 0), marge >= 0 ? C.green : C.red, marge >= 0 ? 'de potentiel jusqu\'au prix juste' : 'au-dessus du prix juste'),
      h ? B.line(P, [{ values: h.c.filter((_, i) => i % step === 0), color: C.blue, width: 4, fill: true }], { hlines: [{ v: last.prixJuste, color: C.gold2, label: 'Prix juste ' + fr(last.prixJuste, 0) }].concat(isNum(last.prixCible) ? [{ v: last.prixCible, color: C.green, label: 'Prix cible ' + fr(last.prixCible, 0) }] : []), labels: [frDate(h.d[0]), frDate(h.d[h.d.length - 1])], h: cap(P, 280, 380, 560) }) : null,
      B.kpis(P, [{ l: 'Cours', v: money(cours, ccy, 0) }, { l: 'Prix juste', v: money(last.prixJuste, ccy, 0), c: C.gold2 }, { l: 'Prix cible', v: isNum(last.prixCible) ? money(last.prixCible, ccy, 0) : '—', c: C.green }])];
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
      B.rows(P, shown.map(x => ({ img: x.img, name: x.name, mid: shortDate(x.date), right: isNum(x.eps) ? money(x.eps, x.ccy) : '—', rightSub: 'BPA attendu', rightColor: C.white })))];
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
{ k: 'deals', group: 'Agenda et marché', ic: '🏷', name: 'Bonnes affaires du secteur', desc: 'Sous leur prix juste, écart en gros',
  fields: [{ id: 'sec', type: 'select', label: 'Secteur (Prix par secteur)', options: async () => { const it = window.PRIX_UI ? await PRIX_UI.pubItems() : []; const m = {}; it.forEach(x => { m[x.secteur] = x.secteurLabel; }); return [['', 'Tous les secteurs']].concat(Object.keys(m).map(k => [k, m[k]])); } }],
  async build(P, o){
    const all = window.PRIX_UI ? await PRIX_UI.pubItems() : [], list = all.filter(x => (!o.sec || x.secteur === o.sec) && isNum(x.ecart) && x.ecart < 0).sort((a, b) => a.ecart - b.ecart);
    if (!list.length) throw new Error('Aucune entreprise sous son prix juste dans ce secteur.');
    const shown = list.slice(0, cap(P, 5, 7, 11)), lab = o.sec ? (all.find(x => x.secteur === o.sec) || {}).secteurLabel : 'Tous secteurs';
    for (const x of shown){ const c = typeof companies !== 'undefined' && companies[x.nom]; const tk = c && c[c.length - 1] && c[c.length - 1].ticker; x.img = await logoFor({ sym: x.sym || tk, logo: x.logo }); }
    return [B.title(P, 'Prix par secteur · ' + lab, o.titre || 'Les bonnes affaires', o.sous || shown.length + ' entreprise' + (shown.length > 1 ? 's' : '') + ' sous leur prix juste'),
      B.rows(P, shown.map(x => ({ img: x.img, name: x.nom, sub: 'Cours ' + money(x.cours, x.devise, 0) + ' · prix juste ' + money(x.juste, x.devise, 0), right: sgn(x.ecart * 100, 0), rightColor: C.green })))];
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
const ui = { tpl: null, fmt: 'f45', opts: {}, busy: false, err: null, canvas: null, sugg: {}, q: {} };
function prefs(){ try { return JSON.parse(localStorage.getItem('wolfPubPrefs') || '{}'); } catch(e){ return {}; } }
function savePrefs(){ try { const p = prefs(); p[ui.tpl] = ui.opts; p._fmt = ui.fmt; localStorage.setItem('wolfPubPrefs', JSON.stringify(p)); } catch(e){} }
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
    '<div class="pb-canvas" id="pbCanvas"><p class="pb-faint">Préparation…</p></div>' +
    '<div class="pb-actions"><button type="button" class="pb-go" data-pb-dl>⬇ Télécharger l\'image</button><button type="button" class="pb-sec" data-pb-copy>📋 Copier</button></div><p class="pb-msg" id="pbMsg"></p></div></div></div>';
  renderControls(t).then(draw);
}
async function renderControls(t){
  const box = $('pbCtl'); if (!box) return;
  let html = '';
  for (const f of t.fields){
    if (f.type === 'select'){
      let opts = []; try { opts = typeof f.options === 'function' ? await f.options() : f.options; } catch(e){ opts = []; html += '<p class="pb-err">' + esc(e.message) + '</p>'; }
      if (ui.opts[f.id] == null && opts[0]) ui.opts[f.id] = opts[0][0];
      html += '<label>' + esc(f.label) + '<select data-pb-f="' + f.id + '">' + (opts.length ? opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(ui.opts[f.id]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') : '<option value="">(rien à choisir)</option>') + '</select></label>';
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
  html += '<details class="pb-more"' + (ui.opts.titre || ui.opts.sous ? ' open' : '') + '><summary>Titre et sous-titre</summary><label>Titre (vide = automatique)<input type="text" data-pb-f="titre" value="' + esc(ui.opts.titre || '') + '" maxlength="70"></label>' +
    '<label>Sous-titre<input type="text" data-pb-f="sous" value="' + esc(ui.opts.sous || '') + '" maxlength="90"></label></details>';
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
  try { await Promise.all(['700 40px "Roboto Slab"', 'italic 400 40px Lora', '500 20px "JetBrains Mono"', '700 20px "JetBrains Mono"', '600 20px "Plus Jakarta Sans"', '800 20px "Plus Jakarta Sans"'].map(f => document.fonts.load(f))); } catch(e){}
}
async function draw(){
  const t = T.find(x => x.k === ui.tpl), box = $('pbCanvas'); if (!t || !box) return;
  const seq = ++drawSeq; savePrefs();
  box.classList.add('busy');
  try {
    await fontsReady();
    const P = mk(ui.fmt), blocks = await t.build(P, ui.opts);
    if (seq !== drawSeq) return;
    await frame(P, t.name, t.group === 'Portefeuille' ? 'Wolf Portfolio' : 'Données TradingView · ' + frDate(today()));
    compose(P, blocks);
    ui.canvas = P.c; P.c.className = 'pb-out'; box.innerHTML = ''; box.appendChild(P.c); msg('');
  } catch(e){ if (seq !== drawSeq) return; ui.canvas = null; box.innerHTML = '<p class="pb-err">⚠ ' + esc(e.message || 'erreur') + '</p>'; }
  box.classList.remove('busy');
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
  el.addEventListener('change', e => { const t = e.target, f = t.dataset && t.dataset.pbF; if (!f) return; ui.opts[f] = t.type === 'checkbox' ? t.checked : t.value; schedule(); });
  el.addEventListener('input', e => { const t = e.target; if (t.dataset && t.dataset.pbQ) return search(t.dataset.pbQ, t.value); if (t.dataset && (t.dataset.pbF === 'titre' || t.dataset.pbF === 'sous')){ ui.opts[t.dataset.pbF] = t.value; schedule(); } });
}
function onShow(){ wire(); if (ui.fmt === 'f45' && prefs()._fmt) ui.fmt = prefs()._fmt; renderPage(); }
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-page="' + PAGE_ID + '"]'); if (b) setTimeout(onShow, 0); });
// Ouvre directement un modèle prérempli (boutons « 📤 Publier » ailleurs dans l'appli)
function open(k, preset){
  if (typeof switchPage === 'function') switchPage(PAGE_ID);
  wire(); ui.tpl = k; ui.opts = Object.assign({}, prefs()[k] || {}, preset || {}); ui.sugg = {}; ui.q = {}; renderPage();
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e){}
}
window.WOLF_PUB = { open, templates: T.map(t => t.k), _render: async (k, opts, fmt) => { await fontsReady(); const t = T.find(x => x.k === k), P = mk(fmt || 'f45'), b = await t.build(P, opts || {}); await frame(P, t.name, 'test'); compose(P, b); return P.c; } };
})();
