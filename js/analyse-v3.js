/* ============================================================
   ONGLET ANALYSE — refonte v3 (maquette validée le 2026-11-13, artboard « Analyse v3 »).
   Deux graphiques SÉPARÉS ajoutés sous les ratios, rien de l'existant n'est retiré :
   1) « Cours & régression linéaire » : clôtures hebdo TradingView (ajustées), droite de régression
      calculée sur la période affichée + bandes ±1σ ±2σ, position du cours en σ, moyennes 200 / 30
      semaines en option ;
   2) « Valorisation » : cours (dernier point = cours en direct de la fiche) face aux 3 scénarios SAISIS
      dans Prix par secteur (PRIX_UI.pubItems() : pessimiste rouge / réaliste jaune / optimiste vert) en
      lignes pointillées + dégradé rouge → jaune → vert, verdict « Trop chère ? +49 % au-dessus de mon prix
      juste ». Il remplace la jauge (masquée, code conservé pour les exports).
   Données : TradingView uniquement (loadTvWeeklyPrices d'app.js). Appelé par renderCompany().
   ============================================================ */
(function(){
'use strict';
const C = { price:'#F2C43D', white:'#E9EBEE', blue:'#4A9FE0', red:'#E5636B', yellow:'#F2C43D', green:'#3DC88C',
  sma200:'#F0A35E', sma100:'#8B7FE8', sma50:'#4FD1A5', grid:'#20272E', dim:'#8B93A0', bg:'#0D1013' };
const ui = { regRange: 10, valoRange: 2, bands: true, sma200: false, sma100: false, sma50: false };
try{ Object.assign(ui, JSON.parse(localStorage.getItem('wolfAnalyseV3') || '{}')); }catch(e){}
const saveUi = () => { try{ localStorage.setItem('wolfAnalyseV3', JSON.stringify(ui)); }catch(e){} };
const cache = {};          // nom -> { at, data:{dates, closes, ccy, sym} | null }
const charts = {};         // 'reg' | 'valo' | 'zoom'
let current = null, renderId = 0, lastCtx = null;

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const nf = (v, d = 2) => v == null || !isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 0) => (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d }) + ' %';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c]);

async function prices(nom){
  const c = cache[nom];
  if (c && Date.now() - c.at < 30 * 60000) return c.data;
  let data = null;
  try{ data = typeof loadTvWeeklyPrices === 'function' ? await loadTvWeeklyPrices(nom) : null; }catch(e){ data = null; }
  cache[nom] = { at: Date.now(), data };
  return data;
}
function curSym(latest){
  const d = latest && latest.devise;
  if (!d) return '€';
  if (d === 'GBX' || d === 'GBp') return 'p';
  return typeof fmpCurrencySymbol === 'function' ? fmpCurrencySymbol(d) : d;
}
// Série affichée : clôtures hebdo + cours en direct de la fiche en dernier point (s'il est cohérent avec la dernière clôture).
function seriesWithLive(px, latest){
  const dates = px.dates.slice(), closes = px.closes.slice();
  const live = latest && latest.prixActuel, last = closes[closes.length - 1];
  const today = new Date().toISOString().slice(0, 10);
  if (live && last && Math.abs(live / last - 1) < 0.25){
    if (dates[dates.length - 1] < today){ dates.push(today); closes.push(live); }
    else closes[closes.length - 1] = live;
  }
  return { dates, closes };
}
function sliceYears(s, years){
  if (!years || years === 'max') return s;
  const from = new Date(); from.setFullYear(from.getFullYear() - years);
  const iso = from.toISOString().slice(0, 10);
  let i = s.dates.findIndex(d => d >= iso); if (i < 0) i = 0;
  const out = { dates: s.dates.slice(i), closes: s.closes.slice(i) };
  Object.keys(s).forEach(k => { if (!out[k] && Array.isArray(s[k])) out[k] = s[k].slice(i); });
  return out;
}
function sma(closes, n){
  const out = new Array(closes.length).fill(null); let sum = 0;
  for (let i = 0; i < closes.length; i++){ sum += closes[i]; if (i >= n) sum -= closes[i - n]; if (i >= n - 1) out[i] = sum / n; }
  return out;
}
function regression(closes){
  const n = closes.length; if (n < 10) return null;
  const xm = (n - 1) / 2, ym = closes.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++){ num += (i - xm) * (closes[i] - ym); den += (i - xm) ** 2; }
  const slope = den ? num / den : 0, icp = ym - slope * xm;
  const line = closes.map((_, i) => slope * i + icp);
  const sd = Math.sqrt(closes.reduce((a, v, i) => a + (v - line[i]) ** 2, 0) / n);
  return { line, sd, z: sd ? (closes[n - 1] - line[n - 1]) / sd : 0 };
}
function zLabel(z){
  if (z <= -2) return { t: 'sous le canal (−2σ)', cls: 'pos' };
  if (z <= -1) return { t: 'bas du canal', cls: 'pos' };
  if (z < 1) return { t: 'milieu du canal', cls: 'mid' };
  if (z < 2) return { t: 'haut du canal', cls: 'neg' };
  return { t: 'au-dessus du canal (+2σ)', cls: 'neg' };
}

// Axe des dates : années (ou mois/année sur une période courte), sans surcharge.
function xAxis(dates, short){
  return { grid: { display: false }, border: { color: '#262E36' },
    ticks: { color: C.dim, autoSkip: false, maxRotation: 0, font: { size: 11 },
      // Pas d'étiquette sur le tout premier point (souvent en milieu d'année : chevauchait l'année suivante) ;
      // une année sur deux au-delà de 12 ans.
      callback(v, i){ const d = dates[i], prev = dates[i - 1]; if (!d || !prev) return '';
        if (short) return prev.slice(0, 7) !== d.slice(0, 7) && (+d.slice(5, 7) - 1) % 3 === 0 ? d.slice(5, 7) + '/' + d.slice(2, 4) : '';
        const span = +dates[dates.length - 1].slice(0, 4) - +dates[0].slice(0, 4), y = +d.slice(0, 4);
        return prev.slice(0, 4) !== d.slice(0, 4) && (span <= 12 || y % 2 === 0) ? String(y) : ''; } } };
}
function yAxis(sym, extra){
  return Object.assign({ position: 'right', grid: { color: C.grid, drawTicks: false }, border: { display: false },
    ticks: { color: C.dim, font: { size: 11 }, padding: 6, callback: v => nf(v, v >= 100 ? 0 : 2) + ' ' + sym } }, extra || {});
}
const frDate = iso => { const [y, m, d] = iso.split('-'); return d + '/' + m + '/' + y; };
function tooltip(sym){
  return { backgroundColor: 'rgba(13,16,19,0.95)', borderColor: '#262E36', borderWidth: 1, padding: 10, titleColor: '#E9EBEE', bodyColor: '#E9EBEE',
    callbacks: { title: items => items.length ? frDate(items[0].label) : '',
      label: it => it.raw == null ? null : ' ' + it.dataset.label + ' : ' + nf(it.raw) + ' ' + sym } };
}
const line = (label, data, color, o) => Object.assign({ label, data, borderColor: color, backgroundColor: color, borderWidth: 1.2, pointRadius: 0, pointHoverRadius: 3, tension: 0, spanGaps: true, fill: false }, o || {});

/* ---------- 1) Cours & régression ---------- */
function regConfig(ctx, big){
  const s = sliceYears(ctx.full, ui.regRange);
  const r = regression(s.closes);
  const ds = [];
  if (r && ui.bands){
    const band = k => r.line.map(v => v + k * r.sd);
    const w = big ? 2.2 : 1.6;
    ds.push(line('+2σ', band(2), C.red, { borderDash: [6, 5], borderWidth: w, fill: '+1', backgroundColor: 'rgba(139,127,232,0.07)' }));
    ds.push(line('−2σ', band(-2), C.red, { borderDash: [6, 5], borderWidth: w }));
    ds.push(line('+1σ', band(1), C.blue, { borderDash: [6, 5], borderWidth: w }));
    ds.push(line('−1σ', band(-1), C.blue, { borderDash: [6, 5], borderWidth: w }));
  }
  const k = big ? 1.5 : 1;
  if (r) ds.push(line('Régression', r.line, C.white, { borderWidth: 1.6 * k }));
  if (ui.sma200) ds.push(line('MM 200 sem.', s.sma200, C.sma200, { borderWidth: 1.8 * k }));
  if (ui.sma100) ds.push(line('MM 100 sem.', s.sma100, C.sma100, { borderWidth: 1.8 * k }));
  if (ui.sma50) ds.push(line('MM 50 sem.', s.sma50, C.sma50, { borderWidth: 1.8 * k }));
  ds.push(line('Cours', s.closes, C.price, { borderWidth: 2.2 * k, pointRadius: s.closes.map((_, i) => i === s.closes.length - 1 ? 5 : 0) }));
  return { type: 'line', data: { labels: s.dates, datasets: ds },
    options: { responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: tooltip(ctx.sym) },
      scales: { x: xAxis(s.dates, ui.regRange !== 'max' && ui.regRange <= 2), y: yAxis(ctx.sym) } },
    _r: r };
}

/* ---------- 2) Valorisation à zones ---------- */
function valoConfig(ctx, big){
  const s = sliceYears(ctx.full, ui.valoRange);
  const sc = ctx.sc, n = s.dates.length;
  const flat = v => v == null ? null : new Array(n).fill(v);
  const vals = [s.closes, [sc.pess, sc.real, sc.opt].filter(v => v != null)].flat();
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.08 || hi * 0.05;
  const ds = [];
  const iPess = sc.pess != null ? ds.push(line('Pessimiste', flat(sc.pess), C.red, { borderDash: [8, 6], borderWidth: big ? 2.6 : 1.8, pointHoverRadius: 0 })) - 1 : -1;
  if (sc.real != null) ds.push(line(ctx.scSource === 'fiche' ? 'Prix juste' : 'Réaliste', flat(sc.real), C.yellow, { borderDash: [8, 6], borderWidth: big ? 2.6 : 1.8, pointHoverRadius: 0 }));
  if (sc.opt != null) ds.push(line('Optimiste', flat(sc.opt), C.green, { borderDash: [8, 6], borderWidth: big ? 2.6 : 1.8, pointHoverRadius: 0,
    fill: iPess >= 0 ? iPess : false, backgroundColor: gradientFill }));
  ds.push(line('Cours', s.closes, '#FFFFFF', { borderWidth: big ? 3.2 : 2.2, pointRadius: s.closes.map((_, i) => i === n - 1 ? 4 : 0) }));
  return { type: 'line', data: { labels: s.dates, datasets: ds },
    options: { responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { left: 4 } },
      plugins: { legend: { display: false }, tooltip: tooltip(ctx.sym) },
      scales: { x: xAxis(s.dates, ui.valoRange <= 2), y: yAxis(ctx.sym, { suggestedMin: Math.max(0, lo - pad), suggestedMax: hi + pad }) } },
    plugins: [labelsPlugin(ctx)] };
  // Dégradé rouge (pessimiste) → jaune (réaliste) → vert (optimiste), calé sur la position réelle des lignes.
  function gradientFill(c){
    const ch = c.chart, a = ch.chartArea, y = ch.scales && ch.scales.y;
    if (!a || !y || sc.pess == null || sc.opt == null) return 'rgba(242,196,61,0.12)';
    const yP = y.getPixelForValue(sc.pess), yO = y.getPixelForValue(sc.opt);
    if (!isFinite(yP) || !isFinite(yO) || yP === yO) return 'rgba(242,196,61,0.12)';
    const g = ch.ctx.createLinearGradient(0, yP, 0, yO);
    g.addColorStop(0, 'rgba(229,99,107,0.30)');
    if (sc.real != null){ const t = (y.getPixelForValue(sc.real) - yP) / (yO - yP); if (t > 0 && t < 1) g.addColorStop(t, 'rgba(242,196,61,0.24)'); }
    g.addColorStop(1, 'rgba(61,200,140,0.30)');
    return g;
  }
}
// Étiquettes « Optimiste 78 » à gauche des lignes + bulle du cours au dernier point.
function labelsPlugin(ctx){
  return { id: 'av3Labels', afterDatasetsDraw(ch){
    const g = ch.ctx, a = ch.chartArea, y = ch.scales.y; if (!a || !y) return;
    g.save(); g.font = "800 12px 'Plus Jakarta Sans', sans-serif"; g.textBaseline = 'middle';
    const tag = (txt, color, yy, x, fill, txtColor) => { const w = g.measureText(txt).width + 14;
      g.fillStyle = fill; roundRect(g, x, yy - 11, w, 22, 6); g.fill(); g.fillStyle = txtColor || color; g.fillText(txt, x + 7, yy + 0.5); return w; };
    const items = [['Optimiste', ctx.sc.opt, C.green], [ctx.scSource === 'fiche' ? 'Prix juste' : 'Réaliste', ctx.sc.real, C.yellow], ['Pessimiste', ctx.sc.pess, C.red]];
    items.forEach(([l, v, col]) => { if (v == null) return; const yy = y.getPixelForValue(v); if (yy < a.top - 2 || yy > a.bottom + 2) return;
      tag(l + ' ' + nf(v, v >= 100 ? 0 : 2), col, Math.min(a.bottom - 12, Math.max(a.top + 12, yy)), a.left + 6, 'rgba(13,16,19,0.88)'); });
    const meta = ch.getDatasetMeta(ch.data.datasets.length - 1), pt = meta && meta.data[meta.data.length - 1];
    if (pt){ const txt = nf(ctx.live, ctx.live >= 100 ? 0 : 2); const w = g.measureText(txt).width + 14;
      tag(txt, '#0D1013', Math.max(a.top + 12, pt.y - 18), Math.min(a.right - w, pt.x - w / 2), '#E9EBEE', '#0D1013'); }
    g.restore(); } };
}
function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function verdict(live, real, src){
  if (live == null || real == null) return null;
  const e = live / real - 1, mot = src === 'fiche' ? 'du prix juste' : 'de mon prix juste';
  if (e >= 0.15) return { t: 'Trop chère ? ' + pct(e * 100) + ' au-dessus ' + mot, cls: 'neg' };
  if (e <= -0.15) return { t: 'En solde ? ' + pct(e * 100) + ' sous ' + (src === 'fiche' ? 'le prix juste' : 'mon prix juste'), cls: 'pos' };
  return { t: 'Au juste prix ? ' + pct(e * 100) + ' vs ' + (src === 'fiche' ? 'le prix juste' : 'mon prix juste'), cls: 'mid' };
}

/* ---------- rendu ---------- */
function seg(group, opts, val){
  return opts.map(([v, l]) => `<button type="button" class="av3-chip${String(v) === String(val) ? ' on' : ''}" data-${group}="${v}">${l}</button>`).join('');
}
function headsHtml(ctx){
  const r = ctx.full ? regression(sliceYears(ctx.full, ui.regRange).closes) : null;
  const zl = r ? zLabel(r.z) : null;
  document.getElementById('av3RegBadge').innerHTML = zl ? `<span class="av3-badge ${zl.cls}">${(r.z >= 0 ? '+' : '−') + nf(Math.abs(r.z), 1)} σ : ${zl.t}</span>` : '';
  document.getElementById('av3RegTools').innerHTML =
    `<button type="button" class="av3-chip${ui.bands ? ' on-w' : ''}" data-tog="bands">${ui.bands ? '✓ ' : ''}±1σ ±2σ</button>` +
    [200, 100, 50].map(n => `<button type="button" class="av3-chip${ui['sma' + n] ? ' on-w' : ''}" data-tog="sma${n}" title="Moyenne mobile ${n} semaines">${ui['sma' + n] ? '✓ ' : ''}MM${n}</button>`).join('') +
    '<span class="av3-sep"></span>' + seg('reg', [[1, '1a'], [3, '3a'], [5, '5a'], [10, '10a'], [20, '20a'], ['max', 'Max']], ui.regRange) +
    '<button type="button" class="av3-zoom-btn" data-zoom="reg" aria-label="Agrandir le graphique cours et régression">⤢</button>';
  const v = verdict(ctx.live, ctx.sc.real, ctx.scSource);
  document.getElementById('av3ValoBadge').innerHTML = v ? `<span class="av3-badge ${v.cls}">${esc(v.t)}</span>` : '';
  document.getElementById('av3ValoTools').innerHTML = seg('valo', [[1, '1a'], [2, '2a'], [5, '5a'], [10, '10a']], ui.valoRange) +
    '<button type="button" class="av3-zoom-btn" data-zoom="valo" aria-label="Agrandir le graphique de valorisation">⤢</button>';
  const note = document.getElementById('av3ValoNote');
  if (ctx.scSource === 'prix') note.innerHTML = 'Scénarios saisis dans <a href="#" data-goprix="1">Prix par secteur</a>' + (ctx.scAt ? ' (mis à jour le ' + new Date(ctx.scAt).toLocaleDateString('fr-FR') + ')' : '') + ' · cours TradingView' + (ctx.liveAt ? ' en direct' : '');
  else if (ctx.scSource === 'fiche') note.innerHTML = '⚠ Pas encore de valorisation dans <a href="#" data-goprix="1">Prix par secteur</a> pour cette entreprise : seul le prix juste de la fiche est affiché. Fais-la dans l\'onglet Valorisation puis « 🎯 Envoyer dans Prix par secteur ».';
  else note.innerHTML = '⚠ Aucune valorisation pour cette entreprise (ni dans Prix par secteur, ni sur la fiche).';
}
function draw(key, canvas, cfg){
  if (charts[key]){ charts[key].destroy(); delete charts[key]; }
  if (!canvas || typeof Chart === 'undefined') return;
  charts[key] = new Chart(canvas, cfg);
}
function drawAll(){
  if (!lastCtx) return;
  headsHtml(lastCtx);
  const regEmpty = document.getElementById('av3RegEmpty'), valoEmpty = document.getElementById('av3ValoEmpty');
  const ok = !!lastCtx.full;
  regEmpty.style.display = valoEmpty.style.display = ok ? 'none' : 'flex';
  regEmpty.textContent = valoEmpty.textContent = lastCtx.loading ? 'Chargement du cours TradingView…' : 'Cours TradingView indisponible pour cette entreprise (serveur local arrêté ou symbole inconnu).';
  if (!ok){ ['reg', 'valo'].forEach(k => { if (charts[k]){ charts[k].destroy(); delete charts[k]; } }); return; }
  draw('reg', document.getElementById('av3RegCanvas'), regConfig(lastCtx));
  draw('valo', document.getElementById('av3ValoCanvas'), valoConfig(lastCtx));
}

async function scenariosFor(nom, latest){
  let items = [];
  try{ if (window.PRIX_UI && PRIX_UI.pubItems) items = await PRIX_UI.pubItems(); }catch(e){ items = []; }
  const k = norm(nom), disp = typeof fmpDisplayName === 'function' ? norm(fmpDisplayName(nom)) : k, tk = latest && latest.ticker;
  const it = items.find(i => norm(i.nom) === k || norm(i.nom) === disp || (tk && i.sym && i.sym === tk));
  if (it && (it.sc.pess != null || it.sc.real != null || it.sc.opt != null)) return { sc: it.sc, src: 'prix', at: it.maj };
  if (latest && latest.prixJuste != null) return { sc: { pess: null, real: latest.prixJuste, opt: null }, src: 'fiche' };
  return { sc: { pess: null, real: null, opt: null }, src: 'none' };
}

async function render(nom){
  if (!document.getElementById('av3RegCanvas') || !nom || typeof companies === 'undefined' || !companies[nom]) return;
  const id = ++renderId;
  const hist = companies[nom], latest = hist[hist.length - 1];
  const sym = curSym(latest);
  if (current !== nom || !lastCtx) lastCtx = { nom, sym, full: null, loading: true, sc: { pess: null, real: null, opt: null }, scSource: 'none', live: latest.prixActuel };
  current = nom;
  const [px, scen] = await Promise.all([prices(nom), scenariosFor(nom, latest)]);
  if (id !== renderId) return;
  let full = null;
  if (px && px.closes && px.closes.length > 20){
    const s = seriesWithLive(px, latest);
    full = { dates: s.dates, closes: s.closes, sma200: sma(s.closes, 200), sma100: sma(s.closes, 100), sma50: sma(s.closes, 50) };
  }
  lastCtx = { nom, sym, full, loading: false, sc: scen.sc, scSource: scen.src, scAt: scen.at, live: full ? full.closes[full.closes.length - 1] : latest.prixActuel, liveAt: latest.tvLiveAt };
  drawAll();
}

/* ---------- agrandir ---------- */
function openZoom(key){
  if (!lastCtx || !lastCtx.full) return;
  let ov = document.getElementById('av3Zoom');
  if (!ov){
    ov = document.createElement('div'); ov.id = 'av3Zoom'; ov.className = 'av3-zoom';
    ov.innerHTML = '<div class="av3-zoom-panel" role="dialog" aria-modal="true"><div class="av3-head"><h2 class="av3-title" id="av3ZoomTitle"></h2><span id="av3ZoomBadge"></span><span class="av3-tools" id="av3ZoomTools"></span><button type="button" class="av3-zoom-btn" data-close="1" aria-label="Fermer">✕</button></div><div class="av3-zoom-holder"><canvas id="av3ZoomCanvas"></canvas></div><div class="av3-zoom-foot"><img src="data/wolf-tete.png" alt="" width="28" height="28"> Données fournies par Wolf Analysis · TradingView</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.closest('[data-close]')) return closeZoom();
      onToolClick(e, true);
    });
  }
  ov.dataset.key = key;
  ov.style.display = 'flex';
  refreshZoom();
}
function refreshZoom(){
  const ov = document.getElementById('av3Zoom'); if (!ov || ov.style.display === 'none') return;
  const key = ov.dataset.key;
  document.getElementById('av3ZoomTitle').textContent = (key === 'reg' ? 'Cours & régression linéaire' : 'Valorisation') + ' — ' + (typeof fmpDisplayName === 'function' ? fmpDisplayName(lastCtx.nom) : lastCtx.nom);
  document.getElementById('av3ZoomBadge').innerHTML = document.getElementById(key === 'reg' ? 'av3RegBadge' : 'av3ValoBadge').innerHTML;
  document.getElementById('av3ZoomTools').innerHTML = document.getElementById(key === 'reg' ? 'av3RegTools' : 'av3ValoTools').innerHTML.replace(/<button[^>]*data-zoom[^>]*>.*?<\/button>/, '');
  setTimeout(() => draw('zoom', document.getElementById('av3ZoomCanvas'), key === 'reg' ? regConfig(lastCtx, true) : valoConfig(lastCtx, true)), 0);
}
function closeZoom(){
  const ov = document.getElementById('av3Zoom'); if (ov) ov.style.display = 'none';
  if (charts.zoom){ charts.zoom.destroy(); delete charts.zoom; }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ const ov = document.getElementById('av3Zoom'); if (ov && ov.style.display !== 'none') closeZoom(); } });

function onToolClick(e, inZoom){
  const b = e.target.closest('button, a[data-goprix]'); if (!b) return;
  if (b.dataset.goprix){ e.preventDefault(); if (typeof switchPage === 'function') switchPage('pagePrix'); return; }
  if (b.dataset.zoom) return openZoom(b.dataset.zoom);
  let changed = false;
  if (b.dataset.tog){ ui[b.dataset.tog] = !ui[b.dataset.tog]; changed = true; }
  if (b.dataset.reg){ ui.regRange = b.dataset.reg === 'max' ? 'max' : +b.dataset.reg; changed = true; }
  if (b.dataset.valo){ ui.valoRange = +b.dataset.valo; changed = true; }
  if (!changed) return;
  saveUi(); drawAll(); if (inZoom) refreshZoom();
}
function wire(){
  const box = document.getElementById('av3Charts');
  if (!box || box.dataset.wired) return;
  box.dataset.wired = '1';
  box.addEventListener('click', e => onToolClick(e, false));
}
document.addEventListener('DOMContentLoaded', wire); wire();

window.ANALYSE_V3 = { render: nom => { wire(); return render(nom); }, refresh: () => current && render(current), _ui: ui, _ctx: () => lastCtx, _regression: regression };
})();
