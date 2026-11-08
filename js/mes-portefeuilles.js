/* ================================================================================================
   MES PORTEFEUILLES — PEA (Crédit Agricole), CTO (Saxo), PEA + CTO combinés, Wolf Portfolio (public)
   ------------------------------------------------------------------------------------------------
   Remplace la saisie dans le Google Sheet (2026-11-08). Source de vérité = UN FICHIER sur le disque :
   data/mes-portefeuilles/portefeuilles.json, écrit par le serveur local (/api/store/save, mêmes protections
   que le Portefeuille IA : révision, écriture atomique, copies datées, copie dans Documents, aucune
   opération effacée sans déclaration). Jamais localStorage pour les données.
   Cours : TradingView uniquement (clôtures quotidiennes NON ajustées, /api/tv/history -> tv-data/tv_history.py).

   Opérations (montant `eur` = effet sur les liquidités du compte, en euros, signé) :
     DEPOT / RETRAIT   apport / retrait d'argent (flux externe)
     INIT              position déjà détenue au départ du suivi (qty, eur = valeur à cette date = flux externe,
                       pruEur facultatif = vrai prix de revient pour les statistiques)
     BUY / SELL        achat / vente (qty, px en devise de cotation, fx = € pour 1 unité de devise, fee €)
     DIV               dividende net reçu ; FRAIS frais divers (eur négatif) ; ATTRIB actions gratuites (qty)
   Performance : TWR (méthode Modified Dietz chaînée par mois : neutre aux apports, comparable aux indices) et
   TRI (XIRR : ton rendement réel, apports compris). Indices : CAC 40 (EURONEXT:PX1), S&P 500 converti en euros.
   Statistiques : une position = une transaction, de la première entrée à la sortie complète.
   Moteur pur et testable sans DOM : window.MP_ENGINE (tests/mes-portefeuilles.test.html).
   ================================================================================================ */
(function(){
'use strict';

/* ======================= MOTEUR (pur) ======================= */
const EPS = 1e-9;
const isNum = v => typeof v === 'number' && isFinite(v);
const dayMs = 86400000;
const toTime = iso => Date.parse(iso + 'T00:00:00Z');
const daysBetween = (a, b) => Math.round((toTime(b) - toTime(a)) / dayMs);
const isoOf = t => new Date(t).toISOString().slice(0, 10);
const isoToday = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const addDays = (iso, n) => isoOf(toTime(iso) + n * dayMs);
const monthEnd = iso => { const d = new Date(toTime(iso)); return isoOf(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); };
const TYPES = ['INIT', 'DEPOT', 'RETRAIT', 'BUY', 'SELL', 'DIV', 'FRAIS', 'ATTRIB'];
const ORDER = { INIT: 0, DEPOT: 1, ATTRIB: 2, BUY: 3, SELL: 4, DIV: 5, FRAIS: 6, RETRAIT: 7 };

function sortOps(ops){
  return ops.filter(o => !o.void).slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1
    : (ORDER[a.type] - ORDER[b.type]) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
}
// Flux EXTERNES (argent qui entre / sort du compte, du point de vue du portefeuille).
function externalFlow(o){
  if (o.type === 'DEPOT' || o.type === 'RETRAIT') return o.eur || 0;
  if (o.type === 'INIT') return o.eur || 0;
  return 0;
}
/* Rejoue les opérations jusqu'à `upTo` inclus. Positions : qty, cost (prix de revient restant, frais inclus),
   et le cycle de vie (première entrée, total investi, total récupéré, dividendes) pour les statistiques. */
function replay(ops, upTo){
  const pos = {}, trades = [], flows = [];
  let cash = 0;
  for (const o of sortOps(ops)){
    if (upTo && o.date > upTo) break;
    const f = externalFlow(o);
    if (f) flows.push({ date: o.date, amt: f });
    if (o.type === 'INIT' || o.type === 'BUY' || o.type === 'ATTRIB' || o.type === 'SELL' || o.type === 'DIV'){
      if (!o.symbol) continue;
    }
    const p = o.symbol ? (pos[o.symbol] = pos[o.symbol] || { qty: 0, cost: 0, invested: 0, returned: 0, divs: 0, open: null, fromInit: false, buys: 0 }) : null;
    switch (o.type){
      case 'DEPOT': case 'RETRAIT': case 'FRAIS': cash += o.eur || 0; break;
      case 'INIT': {
        const c = isNum(o.pruEur) ? o.qty * o.pruEur : (o.eur || 0);
        // achatDate (facultatif) = vraie date du premier achat, pour la durée de détention dans les statistiques
        if (p.qty < EPS){ p.open = o.achatDate || o.date; p.fromInit = !isNum(o.pruEur); p.refDate = o.date; }
        p.qty += o.qty; p.cost += c; p.invested += c; p.buys++; break;
      }
      case 'BUY': {
        if (p.qty < EPS){ p.open = o.date; p.fromInit = false; p.invested = 0; p.returned = 0; p.divs = 0; p.buys = 0; }
        cash += o.eur; p.qty += o.qty; p.cost += -o.eur; p.invested += -o.eur; p.buys++; break;
      }
      case 'ATTRIB': p.qty += o.qty || 0; break;
      case 'DIV': cash += o.eur || 0; p.divs += o.eur || 0; break;
      case 'SELL': {
        cash += o.eur;
        const q = Math.min(o.qty, p.qty);
        const share = p.qty > EPS ? q / p.qty : 1;
        p.cost -= p.cost * share; p.qty -= q; p.returned += o.eur;
        if (p.qty < 1e-7){
          const pnl = p.returned + p.divs - p.invested;
          trades.push({ symbol: o.symbol, open: p.open, close: o.date, days: daysBetween(p.open, o.date), invested: p.invested,
            returned: p.returned + p.divs, pnl, pct: p.invested > 0 ? pnl / p.invested * 100 : null, fromInit: p.fromInit, buys: p.buys });
          pos[o.symbol] = { qty: 0, cost: 0, invested: 0, returned: 0, divs: 0, open: null, fromInit: false, buys: 0 };
        }
        break;
      }
    }
  }
  Object.keys(pos).forEach(k => { if (pos[k].qty < 1e-7) delete pos[k]; });
  return { cash, pos, trades, flows };
}
/* Contrôles avant enregistrement : vente au-delà de la quantité détenue (refus), liquidités négatives (alerte). */
function validate(ops){
  const errors = [], warnings = [];
  const qty = {}; let cash = 0;
  for (const o of sortOps(ops)){
    if (!TYPES.includes(o.type)) errors.push('Type inconnu : ' + o.type);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date || '')) errors.push('Date invalide');
    if (['BUY', 'SELL', 'INIT', 'ATTRIB'].includes(o.type) && !(o.qty > 0)) errors.push('Quantité manquante (' + (o.symbol || o.type) + ', ' + o.date + ')');
    if (['BUY', 'SELL', 'INIT', 'ATTRIB', 'DIV'].includes(o.type) && !o.symbol) errors.push('Titre manquant (' + o.date + ')');
    if (o.type === 'SELL' && (qty[o.symbol] || 0) + 1e-6 < o.qty) errors.push('Vente de ' + o.qty + ' ' + o.symbol + ' le ' + o.date + ' : seulement ' + +(qty[o.symbol] || 0).toFixed(6) + ' détenu(s)');
    if (o.symbol && ['BUY', 'INIT', 'ATTRIB'].includes(o.type)) qty[o.symbol] = (qty[o.symbol] || 0) + o.qty;
    if (o.type === 'SELL') qty[o.symbol] = (qty[o.symbol] || 0) - o.qty;
    if (o.type !== 'INIT') cash += o.eur || 0;
    if (cash < -0.01) warnings.push('Liquidités négatives le ' + o.date + ' (' + cash.toFixed(2) + ' €)');
  }
  return { ok: !errors.length, errors, warnings: warnings.slice(0, 3) };
}

/* ---------- cours (séries TradingView) ---------- */
// hist[symbol] = { ccy, bars:[[sec, close], ...] } -> série triée { d:[iso...], c:[...] }
function makeSeries(h){
  if (!h || !Array.isArray(h.bars)) return null;
  const pts = h.bars.filter(b => isNum(b[1])).map(b => [isoOf(b[0] * 1000), b[1]]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  return { ccy: h.ccy, d: pts.map(p => p[0]), c: pts.map(p => p[1]) };
}
function at(series, iso){
  if (!series || !series.d.length) return null;
  let lo = 0, hi = series.d.length - 1, k = -1;
  while (lo <= hi){ const m = (lo + hi) >> 1; if (series.d[m] <= iso){ k = m; lo = m + 1; } else hi = m - 1; }
  return k >= 0 ? series.c[k] : null;
}
// Cours en euros : GBX/GBp = pence -> /100 en GBP ; change FX_IDC:EUR<CCY> (unités de devise pour 1 €).
function priceEur(S, sym, iso){
  const s = S[sym]; if (!s) return null;
  let px = at(s, iso); if (px == null) return null;
  let ccy = String(s.ccy || 'EUR').toUpperCase();
  if (ccy === 'GBX' || ccy === 'GBP_PENCE'){ px /= 100; ccy = 'GBP'; }
  if (s.ccy === 'GBp'){ px /= 100; ccy = 'GBP'; }
  if (ccy === 'EUR') return px;
  const fx = at(S['FX_IDC:EUR' + ccy], iso);
  return fx ? px / fx : null;
}
function valueAt(ops, S, iso){
  const r = replay(ops, iso);
  let v = r.cash, missing = [];
  for (const sym in r.pos){
    const pe = priceEur(S, sym, iso);
    if (pe == null){ missing.push(sym); continue; }
    v += r.pos[sym].qty * pe;
  }
  return { value: v, cash: r.cash, missing, state: r };
}
/* Série mensuelle : bornes = veille de la 1re opération, puis chaque fin de mois, puis aujourd'hui.
   Rendement de chaque mois en Modified Dietz : (V1 − V0 − F) / (V0 + Σ poids × F). */
/* Lignes de performance sur une période : bornes = début (veille de la 1re opération, ou opts.from), puis chaque jour
   ouvré / chaque semaine / chaque fin de mois (opts.step), puis la fin (opts.to ou aujourd'hui). Rendement de chaque
   intervalle en Modified Dietz : (V1 − V0 − F) / (V0 + Σ poids × F). */
function periodRows(ops, S, opts = {}){
  const sorted = sortOps(ops);
  if (!sorted.length) return [];
  const today = opts.today || isoToday();
  const firstPrev = addDays(sorted[0].date, -1);
  const start = opts.from && opts.from > firstPrev ? opts.from : firstPrev;
  const end = opts.to && opts.to < today ? opts.to : today;
  if (start >= end) return [];
  const step = opts.step || 'month';
  const bounds = [start];
  if (step === 'day'){
    for (let d = addDays(start, 1); d < end; d = addDays(d, 1)){ const wd = new Date(toTime(d)).getUTCDay(); if (wd !== 0 && wd !== 6) bounds.push(d); }
  } else if (step === 'week'){
    for (let d = addDays(start, 7); d < end; d = addDays(d, 7)) bounds.push(d);
  } else {
    let m = monthEnd(start) === start ? monthEnd(addDays(start, 1)) : monthEnd(start);
    while (m < end){ bounds.push(m); m = monthEnd(addDays(m, 1)); }
  }
  if (bounds[bounds.length - 1] !== end) bounds.push(end);
  const flows = replay(ops).flows;
  const rows = [];
  let prev = start === firstPrev ? { value: 0 } : valueAt(ops, S, start);
  for (let i = 1; i < bounds.length; i++){
    const a = bounds[i - 1], b = bounds[i];
    const v = valueAt(ops, S, b);
    const len = Math.max(1, daysBetween(a, b));
    let F = 0, W = 0;
    flows.forEach(f => { if (f.date > a && f.date <= b){ F += f.amt; W += f.amt * Math.min(1, (daysBetween(f.date, b) + 1) / len); } });
    const denom = prev.value + W;
    const r = Math.abs(denom) > 1e-6 ? (v.value - prev.value - F) / denom : 0;
    rows.push({ from: a, to: b, v0: prev.value, v1: v.value, flow: F, r, cash: v.cash, missing: v.missing });
    prev = v;
  }
  return rows;
}
function monthly(ops, S, opts = {}){ return periodRows(ops, S, Object.assign({}, opts, { step: 'month' })); }
function chain(rows){ return rows.reduce((acc, r) => acc * (1 + r.r), 1) - 1; }
function benchRows(rows, S, sym, toEurFx){
  return rows.map(r => {
    let a = at(S[sym], r.from), b = at(S[sym], r.to);
    if (toEurFx){ const fa = at(S[toEurFx], r.from), fb = at(S[toEurFx], r.to); a = a && fa ? a / fa : null; b = b && fb ? b / fb : null; }
    return { from: r.from, to: r.to, r: a && b ? b / a - 1 : 0 };
  });
}
/* TRI (XIRR) : flux du point de vue de l'investisseur (apport = négatif), valeur finale positive. Rendement annualisé. */
function xirr(cfs){
  if (cfs.length < 2 || !cfs.some(c => c.a > 0) || !cfs.some(c => c.a < 0)) return null;
  const t0 = toTime(cfs[0].d);
  const f = r => cfs.reduce((s, c) => s + c.a / Math.pow(1 + r, (toTime(c.d) - t0) / dayMs / 365), 0);
  let lo = -0.99, hi = 10, flo = f(lo), fhi = f(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++){
    const mid = (lo + hi) / 2, fm = f(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0){ hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}
// Rendement d'une période [from, to] : TWR chaîné + TRI (valeur de départ comptée comme apport).
function periodPerf(ops, S, rows, from, to){
  const sel = rows.filter(r => r.to > from && r.to <= to);
  if (!sel.length) return null;
  const v0 = sel[0].v0, v1 = sel[sel.length - 1].v1;
  const flows = replay(ops).flows.filter(f => f.date > sel[0].from && f.date <= to);
  const net = flows.reduce((s, f) => s + f.amt, 0);
  const cfs = [];
  if (v0 > 0) cfs.push({ d: sel[0].from, a: -v0 });
  flows.forEach(f => cfs.push({ d: f.date, a: -f.amt }));
  cfs.push({ d: sel[sel.length - 1].to, a: v1 });
  cfs.sort((a, b) => a.d < b.d ? -1 : 1);
  const days = daysBetween(sel[0].from, sel[sel.length - 1].to);
  const irr = xirr(cfs);
  return { twr: chain(sel), irr, irrPeriod: irr != null ? Math.pow(1 + irr, days / 365) - 1 : null, v0, v1, net, gain: v1 - v0 - net, rows: sel, days };
}
/* Statistiques sur les positions fermées (et, à part, les positions encore ouvertes au cours du jour). */
function tradeStats(trades){
  const t = trades.filter(x => x.pct != null);
  const win = t.filter(x => x.pnl > 0), loss = t.filter(x => x.pnl <= 0);
  const avg = (a, k) => a.length ? a.reduce((s, x) => s + x[k], 0) / a.length : null;
  const winRate = t.length ? win.length / t.length * 100 : null;
  const avgWin = avg(win, 'pct'), avgLoss = avg(loss, 'pct');
  return {
    n: t.length, wins: win.length, losses: loss.length, winRate,
    avgWinPct: avgWin, avgLossPct: avgLoss, avgPct: avg(t, 'pct'), avgPnl: avg(t, 'pnl'), totalPnl: t.reduce((s, x) => s + x.pnl, 0),
    avgDays: avg(t, 'days'), avgDaysWin: avg(win, 'days'), avgDaysLoss: avg(loss, 'days'),
    payoff: avgWin != null && avgLoss != null && avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : null,
    expectancy: winRate != null ? (winRate / 100) * (avgWin || 0) + (1 - winRate / 100) * (avgLoss || 0) : null,
    best: t.slice().sort((a, b) => b.pct - a.pct)[0] || null, worst: t.slice().sort((a, b) => a.pct - b.pct)[0] || null
  };
}
function openAsTrades(state, S, iso){
  return Object.keys(state.pos).map(sym => {
    const p = state.pos[sym], pe = priceEur(S, sym, iso);
    if (pe == null) return null;
    const val = p.qty * pe, invested = p.invested, pnl = val + p.returned + p.divs - invested;
    return { symbol: sym, open: p.open, close: null, days: daysBetween(p.open, iso), invested, returned: val + p.returned + p.divs, pnl,
      pct: invested > 0 ? pnl / invested * 100 : null, fromInit: p.fromInit, openPos: true };
  }).filter(Boolean);
}
// Montant net d'un achat / d'une vente : qty × cours × taux (€ pour 1 unité) ± frais.
function netAmount(type, qty, px, fxEurPerUnit, fee){
  const gross = qty * px * (fxEurPerUnit || 1);
  return type === 'BUY' ? -(gross + (fee || 0)) : gross - (fee || 0);
}
// Opération miroir Wolf Portfolio : même titre, même date, même cours ; quantité × ratio (fractionnée).
// Vente : si la position perso est soldée, la position Wolf l'est aussi ; sinon quantité × ratio plafonnée.
function mirrorOp(op, ratio, wolfOps, persoHeldBefore){
  const held = replay(wolfOps).pos[op.symbol];
  let qty = +(op.qty * ratio).toFixed(4);
  if (op.type === 'SELL'){
    if (!held) return null;
    if (persoHeldBefore != null && op.qty >= persoHeldBefore - 1e-9) qty = held.qty;
    qty = Math.min(qty, held.qty);
  }
  if (!(qty > 0)) return null;
  const fee = +((op.fee || 0) * ratio).toFixed(2);
  return Object.assign({}, op, { qty, fee, eur: +netAmount(op.type, qty, op.px, op.fx, fee).toFixed(2), linkedTo: op.id,
    note: 'Reproduit depuis ' + (op._acc || 'le portefeuille perso').toUpperCase() + ' (× ' + String(ratio).replace('.', ',') + ')', source: 'miroir' });
}

window.MP_ENGINE = { sortOps, replay, validate, makeSeries, at, priceEur, valueAt, monthly, periodRows, chain, benchRows, xirr, periodPerf,
  tradeStats, openAsTrades, netAmount, mirrorOp, daysBetween, isoToday, addDays, monthEnd };

/* ======================= INTERFACE (refonte 2026-11-08 : cartes de comptes, deux colonnes, logos, saisie en fenêtre) ======================= */
const PAGE_ID = 'pageMesPortefeuilles';
const E = window.MP_ENGINE;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const eur = (v, d = 2) => v == null || !isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
const sEur = (v, d = 2) => v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '−') + eur(Math.abs(v), d);
const pct = (v, d = 1) => v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
const num = (v, d = 2) => v == null || !isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d });
const cls = v => v == null || !isFinite(v) ? '' : v >= 0 ? 'pos' : 'neg';
const fmtD = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const monthLabel = iso => MOIS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);
const parseNum = v => { const t = String(v == null ? '' : v).replace(/[\s  ]/g, '').replace(',', '.'); if (!t) return null; const x = parseFloat(t); return isFinite(x) ? x : null; };
const TYPE_LABEL = { BUY: 'Achat', SELL: 'Vente', DIV: 'Dividende', DEPOT: 'Versement', RETRAIT: 'Retrait', FRAIS: 'Frais', ATTRIB: 'Actions gratuites', INIT: 'Position de départ' };
const TYPE_ICON = { BUY: '↗', SELL: '↘', DIV: '✦', DEPOT: '＋', RETRAIT: '－', FRAIS: '€', ATTRIB: '🎁', INIT: '◎' };
const ACCOUNTS = [
  { k: 'pea', label: 'PEA', sub: 'Crédit Agricole', icon: '🏦' },
  { k: 'cto', label: 'CTO', sub: 'Saxo', icon: '🌍' },
  { k: 'perso', label: 'PEA + CTO', sub: 'Mon patrimoine boursier', icon: 'Σ' },
  { k: 'wolf', label: 'Wolf Portfolio', sub: 'Public · 70 % de mes achats', icon: '🐺' }
];
const CCYS = ['EUR', 'USD', 'CAD', 'GBP', 'GBX', 'CHF', 'SEK', 'DKK', 'NOK', 'JPY', 'HKD'];
const PALETTE = ['#D9A441', '#4A9FE0', '#F0C877', '#2F7DBF', '#B8862E', '#7FBFEF', '#8C6A2A', '#9AD0F5', '#E8B860', '#3E6E99', '#C9A35E', '#5B8DB8'];

let D = null, serverOk = false, storeFile = '', loadErr = null;
let S = {};
let histErr = {}, histLoading = false, histAt = null;
let ui = { acc: 'pea', period: { k: 'all' }, modal: null, delConfirm: null, msg: null, showAllOps: false, includeOpen: false, saving: false };
let charts = {};
let searchTimer = null;
let cache = null;   // calculs du rendu en cours

const persoOk = () => { try { return typeof persoUnlocked !== 'undefined' && !!persoUnlocked; } catch(e){ return false; } };
/* VERROU (code de l'onglet Perso) : tant que PEA/CTO sont verrouillés, l'appli calcule et affiche un portefeuille
   FICTIF (titres publics du Wolf, quantités rondes) et floute tous les montants en euros — les vrais chiffres ne sont
   même pas calculés. Le Wolf Portfolio, public, reste toujours réel et lisible. */
const isLockedAcc = k => k !== 'wolf' && !persoOk();
const FAKE = { pea: [['EURONEXT:AI', 10], ['EURONEXT:MC', 3], ['XETR:NEM', 12]], cto: [['NYSE:MA', 2], ['NYSE:SPGI', 2], ['NASDAQ:CPRT', 20]] };
function fakeOps(k){
  const list = k === 'perso' ? FAKE.pea.concat(FAKE.cto) : FAKE[k] || [];
  const ops = [{ id: 'fake-cash-' + k, date: '2026-01-01', type: 'DEPOT', eur: k === 'perso' ? 2300 : k === 'pea' ? 1500 : 800 }];
  list.forEach(([sym, q], i) => {
    const pe = E.priceEur(S, sym, '2025-12-31');
    if (pe) ops.push({ id: 'fake-' + k + i, date: '2026-01-01', type: 'INIT', symbol: sym, qty: q, pruEur: +(pe * 0.9).toFixed(2), eur: +(q * pe).toFixed(2) });
  });
  const sell = list[1], pe2 = sell ? E.priceEur(S, sell[0], '2026-06-15') : null;
  if (pe2) ops.push({ id: 'fake-sell-' + k, date: '2026-06-15', type: 'SELL', symbol: sell[0], qty: sell[1], px: pe2, ccy: 'EUR', fx: 1, fee: 0, eur: +(sell[1] * pe2).toFixed(2) });
  return ops;
}
const accOps = k => isLockedAcc(k) ? fakeOps(k) : k === 'perso' ? D.accounts.pea.ops.concat(D.accounts.cto.ops) : (D.accounts[k] ? D.accounts[k].ops : []);
const symName = sym => (D.symbols[sym] && D.symbols[sym].nom) || (S[sym] && S[sym].name) || sym;
const symCcy = sym => (D.symbols[sym] && D.symbols[sym].ccy) || (S[sym] && S[sym].ccy) || 'EUR';
const newId = acc => acc + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
const accOfOp = id => ['pea', 'cto', 'wolf'].find(k => D.accounts[k].ops.some(o => o.id === id));
function logoUrl(sym){
  const s = D && D.symbols[sym];
  if (s && s.logoid) return 'https://s3-symbol-logo.tradingview.com/' + s.logoid + '--big.svg';
  if (ui.modal && ui.modal.symbol === sym && ui.modal.logoid) return 'https://s3-symbol-logo.tradingview.com/' + ui.modal.logoid + '--big.svg';
  try { if (typeof companyLogoUrl === 'function'){ const u = companyLogoUrl(symName(sym)); if (u) return u; } } catch(e){}
  return null;
}
function logoHtml(sym, size){
  const u = sym ? logoUrl(sym) : null, n = sym ? symName(sym) : '€';
  const st = size ? ` style="width:${size}px;height:${size}px;"` : '';
  return u ? `<img class="mp-logo" src="${esc(u)}" alt="" loading="lazy"${st} onerror="this.outerHTML='<span class=&quot;mp-logo mp-logo-txt&quot;${size ? ` style=&quot;width:${size}px;height:${size}px;&quot;` : ''}>${esc(n.charAt(0))}</span>'">`
    : `<span class="mp-logo mp-logo-txt"${st}>${esc(n.charAt(0))}</span>`;
}

/* ---------- persistance ---------- */
async function load(){
  try { const p = await fetch('/api/ia/ping', { cache: 'no-store' }); const j = await p.json(); serverOk = !!(j && j.ok && j.v >= 9); } catch(e){ serverOk = false; }
  if (!serverOk){ D = null; return; }
  try {
    const r = await fetch('/api/store/load?name=portefeuilles', { cache: 'no-store' }); const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'lecture impossible');
    storeFile = j.file || '';
    D = j.data || { version: 1, revision: 0, config: { wolfRatio: 0.7, debut: '2026-01-01', cac: 'EURONEXT:PX1', spx: 'SP:SPX' }, symbols: {},
      accounts: { pea: { label: 'PEA', ops: [] }, cto: { label: 'CTO', ops: [] }, wolf: { label: 'Wolf Portfolio', ops: [], public: true } } };
    loadErr = null;
  } catch(e){ loadErr = e.message; D = null; }
}
async function save(deleted){
  if (!serverOk || !D) throw new Error('Serveur local injoignable : rien n\'a été enregistré.');
  const body = Object.assign({}, D, { revision: (D.revision || 0) + 1, baseRevision: D.revision || 0, deleted: deleted || [], savedAt: new Date().toISOString() });
  const r = await fetch('/api/store/save?name=portefeuilles', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 409){ await load(); throw new Error('Le fichier a été modifié ailleurs (autre onglet) : données rechargées, refais la saisie.'); }
  if (!r.ok || !j.ok) throw new Error(j.error || 'enregistrement refusé');
  D.revision = j.revision;
}
function neededSymbols(){
  const syms = new Set([D.config.cac || 'EURONEXT:PX1', D.config.spx || 'SP:SPX', 'FX_IDC:EURUSD']);
  Object.values(D.accounts).forEach(a => a.ops.forEach(o => { if (o.symbol) syms.add(o.symbol); }));
  [...syms].forEach(s => { const c = symCcy(s).toUpperCase(); if (c !== 'EUR' && !s.startsWith('FX_IDC:')) syms.add('FX_IDC:EUR' + (c === 'GBX' ? 'GBP' : c)); });
  return [...syms];
}
async function loadHistory(fresh){
  if (!D) return;
  histLoading = true; render();
  const first = Object.values(D.accounts).flatMap(a => a.ops.map(o => o.date)).sort()[0] || D.config.debut;
  try {
    const r = await fetch('/api/tv/history?symbols=' + encodeURIComponent(neededSymbols().join(',')) + '&from=' + E.addDays(first, -40) + (fresh ? '&fresh=1' : ''), { cache: 'no-store' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'historique indisponible');
    Object.keys(j.data).forEach(k => { S[k] = Object.assign(E.makeSeries(j.data[k]), { name: j.data[k].name }); });
    histErr = j.errors || {}; histAt = new Date();
    const retry = Object.keys(histErr).filter(k => !/symbol_error|cours du/.test(histErr[k]));
    if (retry.length && !fresh && !loadHistory._retried){ loadHistory._retried = true; setTimeout(() => loadHistory(true), 15000); }
  } catch(e){ histErr = { _: e.message }; }
  histLoading = false; render();
}

/* ---------- période affichée ----------
   { k:'all' } depuis le début · '1m' / '3m' / '6m' glissants · 'ytd' depuis le 1er janvier · 'y' une année · 'custom' du … au …
   Bornes : from = veille du 1er jour inclus (valeur de départ), to = dernier jour inclus. */
function minusMonths(iso, n){ const d = new Date(toTimeUi(iso)); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); }
function toTimeUi(iso){ return Date.parse(iso + 'T00:00:00Z'); }
function periodRange(){
  const p = ui.period, t = E.isoToday();
  if (p.k === '1m') return { from: minusMonths(t, 1), to: t, label: 'sur 1 mois' };
  if (p.k === '3m') return { from: minusMonths(t, 3), to: t, label: 'sur 3 mois' };
  if (p.k === '6m') return { from: minusMonths(t, 6), to: t, label: 'sur 6 mois' };
  if (p.k === 'ytd') return { from: (+t.slice(0, 4) - 1) + '-12-31', to: t, label: 'depuis le 1er janvier' };
  if (p.k === 'y') return { from: (p.year - 1) + '-12-31', to: p.year + '-12-31', label: 'en ' + p.year };
  if (p.k === 'custom' && p.from && p.to) return { from: E.addDays(p.from, -1), to: p.to, label: 'du ' + fmtD(p.from) + ' au ' + fmtD(p.to) };
  return { from: null, to: null, label: null };
}
const inRange = (d, r) => (!r.from || d > r.from) && (!r.to || d <= r.to);

/* ---------- calculs ---------- */
function compute(acc){
  const ops = accOps(acc);
  if (!ops.length) return null;
  const today = E.isoToday();
  const range = periodRange();
  const first = E.addDays(E.sortOps(ops)[0].date, -1);
  const span = E.daysBetween(range.from && range.from > first ? range.from : first, range.to && range.to < today ? range.to : today);
  const step = span <= 62 ? 'day' : span <= 200 ? 'week' : 'month';
  const rows = E.periodRows(ops, S, { today, from: range.from, to: range.to, step });
  const perf = rows.length ? E.periodPerf(ops, S, rows, '0000', '9999') : null;
  const sel = perf ? perf.rows : [];
  const cac = E.benchRows(sel, S, D.config.cac || 'EURONEXT:PX1');
  const spx = E.benchRows(sel, S, D.config.spx || 'SP:SPX', 'FX_IDC:EURUSD');
  // tableau « mois par mois » : toujours des mois, sur la même période
  const mrows = step === 'month' ? rows : E.periodRows(ops, S, { today, from: range.from, to: range.to, step: 'month' });
  const mcac = step === 'month' ? cac : E.benchRows(mrows, S, D.config.cac || 'EURONEXT:PX1');
  const mspx = step === 'month' ? spx : E.benchRows(mrows, S, D.config.spx || 'SP:SPX', 'FX_IDC:EURUSD');
  const now = E.valueAt(ops, S, today);
  const st = E.replay(ops);
  let trades = st.trades.filter(t => inRange(t.close, range));
  if (ui.includeOpen) trades = trades.concat(E.openAsTrades(st, S, today));
  // Cours manquant = valeur sous-estimée : on le dit au lieu d'afficher un chiffre faux sans prévenir.
  const missing = [...new Set(now.missing.concat(...rows.map(r => r.missing)))];
  return { acc, ops, rows, perf, cac, spx, mrows, mcac, mspx, step, range, now, st, stats: E.tradeStats(trades), trades, today, cacT: E.chain(cac), spxT: E.chain(spx), missing };
}

/* ---------- rendu de la page ---------- */
function render(){
  const page = document.getElementById(PAGE_ID);
  if (!page || !page.classList.contains('active')) return;
  closeZoom();
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} }); charts = {};
  if (!serverOk){ page.innerHTML = titleHtml() + `<div class="mp-banner err">⚠ Le serveur local n'est pas à jour ou pas lancé. Ferme la fenêtre du serveur puis relance le raccourci <b>« Wolf Analysis »</b> du Bureau.</div>`; return; }
  if (loadErr || !D){ page.innerHTML = titleHtml() + `<div class="mp-banner err">⚠ Fichier illisible (${esc(loadErr)}) : aucune écriture ne sera faite.</div>`; return; }
  const locked = isLockedAcc(ui.acc);
  cache = {};
  ['pea', 'cto', 'perso', 'wolf'].forEach(k => { cache[k] = compute(k); });
  const c = cache[ui.acc];
  let body;
  const lockBar = locked ? `<div class="mp-card mp-lock"><div class="mp-lock-ico">🔒</div><div><b>Chiffres fictifs et montants floutés</b><p>Les vrais montants du PEA et du CTO s'affichent avec ton code.</p></div>
      <input type="password" inputmode="numeric" maxlength="8" id="mpLockInput" placeholder="Code"><button class="refresh-btn" id="mpLockBtn">Déverrouiller</button></div>`
    : ui.acc !== 'wolf' ? `<div class="mp-relock"><button class="mp-ghost" id="mpRelockBtn" title="Revenir aux chiffres fictifs floutés (avant une vidéo, par exemple)">🔒 Verrouiller</button></div>` : '';
  if (!c){
    body = toolbarHtml() + `<div class="mp-card mp-empty">Aucune opération sur ce compte pour l'instant. Commence par « + Versement » ou « + Achat ».</div>`;
  } else if (!histAt){
    body = `<div class="mp-card mp-empty">⏳ Lecture des cours TradingView…</div>`;
  } else {
    body = (c.missing.length ? `<div class="mp-banner err">⚠ Cours introuvables pour ${c.missing.map(s => esc(symName(s))).join(', ')} : les valeurs et performances affichées sont incomplètes. Clique sur « ↻ Cours » dans un moment.</div>` : '')
      + lockBar + toolbarHtml()
      + `<div class="mp-grid"><div class="mp-card mp-span2">${chartCardHtml(c)}</div><div class="mp-card">${kpiHtml(c)}</div></div>`
      + `<div class="mp-grid"><div class="mp-card mp-span2">${positionsHtml(c)}</div><div class="mp-card">${allocationHtml(c)}</div></div>`
      + `<div class="mp-grid mp-grid-eq"><div class="mp-card">${monthsHtml(c)}</div><div class="mp-card">${statsHtml(c)}</div></div>`
      + `<div class="mp-card">${journalHtml()}</div>`;
  }
  page.innerHTML = `<div class="mp${locked ? ' mp-locked' : ''}">${titleHtml()}${accountCardsHtml()}${body}</div>` + (ui.modal ? `<div class="mp-modal-bg" id="mpModalBg"><div class="mp-modal" id="mpModal">${modalHtml()}</div></div>` : '');
  wire();
  if (c && histAt && typeof Chart !== 'undefined'){ drawPerfChart(c); drawDonut(c, locked); }
  if (ui.modal) wireModal();
}
function titleHtml(){
  const nErr = Object.keys(histErr).length;
  return `<div class="mp-title"><div><div class="section-label" style="margin:0;">📒 Mes portefeuilles</div>
      <p>Fichier sur ton PC, sauvegardé à chaque saisie (copies datées + copie dans Documents) · cours TradingView</p></div>
    <div class="mp-title-right">${histLoading ? '<span class="mp-pill">⏳ Cours TradingView…</span>' : histAt ? `<span class="mp-pill">Cours de ${histAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}
      ${nErr ? `<span class="mp-pill warn" title="${esc(Object.keys(histErr).join(', '))}">⚠ ${nErr} cours manquant(s)</span>` : ''}
      <button class="mp-ghost" data-mp-refresh title="Relire les cours TradingView">↻ Cours</button></div></div>
    ${ui.msg ? `<div class="mp-banner ${ui.msg.err ? 'err' : 'ok'}"><span>${esc(ui.msg.text)}</span><span>${ui.msg.undo ? `<button class="mp-ghost" data-mp-restore="${esc(ui.msg.undo)}">↶ Annuler</button>` : ''}<button class="mp-x" data-mp-msgx>✕</button></span></div>` : ''}`;
}
function accountCardsHtml(){
  return `<div class="mp-accounts">${ACCOUNTS.map(a => {
    const c = cache[a.k], lockedA = a.k !== 'wolf' && !persoOk();
    const v = c ? c.now.value : null, p = c && c.perf ? c.perf.twr * 100 : null;
    return `<button class="mp-acc ${ui.acc === a.k ? 'active' : ''} ${a.k === 'perso' ? 'mp-acc-sum' : ''}" data-mp-acc="${a.k}">
      <span class="mp-acc-top"><span class="mp-acc-ico">${a.icon}</span><span><b>${a.label}</b><small>${a.sub}</small></span></span>
      <span class="mp-acc-val${lockedA ? ' mp-blur' : ''}">${histLoading && !histAt ? '…' : eur(v, 0)}${c && c.missing.length && !lockedA ? ' <span class="mp-acc-warn" title="Cours manquants : valeur incomplète">⚠</span>' : ''}</span>
      <span class="mp-acc-perf ${cls(p)}">${lockedA ? '🔒 chiffres fictifs' : pct(p) + ' ' + (periodRange().label || 'depuis le début')}</span></button>`;
  }).join('')}</div>`;
}
function toolbarHtml(){
  const years = [...new Set(Object.values(D.accounts).flatMap(a => a.ops.map(o => o.date.slice(0, 4))))].sort().reverse();
  const P = ui.period;
  const b = (k, l) => `<button class="${P.k === k ? 'active' : ''}" data-mp-period="${k}">${l}</button>`;
  const ys = b('1m', '1 mois') + b('3m', '3 mois') + b('6m', '6 mois') + b('ytd', 'Cette année') + b('all', 'Depuis le début')
    + `<select class="mp-year-sel ${P.k === 'y' ? 'active' : ''}" data-mp-yearsel><option value="">Année…</option>${years.map(y => `<option value="${y}" ${P.k === 'y' && P.year === +y ? 'selected' : ''}>${y}</option>`).join('')}</select>`
    + b('custom', 'Période…')
    + (P.k === 'custom' ? `<span class="mp-custom">du <input type="date" data-mp-from value="${esc(P.from || '')}"> au <input type="date" data-mp-to value="${esc(P.to || E.isoToday())}"> <button class="mp-ghost" data-mp-applyrange>OK</button></span>` : '');
  const canAdd = ui.acc !== 'perso' && !isLockedAcc(ui.acc);
  const quick = canAdd ? ['BUY', 'SELL', 'DIV', 'DEPOT'].map(t => `<button class="mp-quick mp-q-${t}" data-mp-add="${t}"><span>${TYPE_ICON[t]}</span>${TYPE_LABEL[t]}</button>`).join('')
    + `<button class="mp-quick" data-mp-add="RETRAIT">Autre…</button>` : `<span class="mp-hint">Pour saisir, choisis le PEA ou le CTO.</span>`;
  return `<div class="mp-toolbar"><div class="mp-seg">${ys}</div><div class="mp-quicks">${quick}</div></div>`;
}
function kpiHtml(c){
  const p = c.perf; if (!p) return '';
  const per = c.range.label || 'depuis le ' + fmtD(E.addDays(p.rows[0].from, 1));
  const k = (label, val, sub, kl) => `<div class="mp-kpi"><span>${label}</span><b class="${kl || ''}">${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  return `<h3 class="mp-h">Performance <small>${per}</small></h3><div class="mp-kpis">
    ${k('Plus-value', sEur(p.gain), 'hors apports', cls(p.gain))}
    ${k('Performance', pct(p.twr * 100), 'comparable aux indices', cls(p.twr))}
    ${k('Rendement réel (TRI)', pct(p.irrPeriod != null ? p.irrPeriod * 100 : null), p.irr != null && p.days >= 365 ? pct(p.irr * 100) + ' par an' : 'tient compte de tes apports', cls(p.irrPeriod))}
    ${k('Apports nets', sEur(p.net), p.v0 > 0 ? 'valeur de départ ' + eur(p.v0, 0) : '')}
    ${k('vs CAC 40', pct((p.twr - c.cacT) * 100), 'CAC 40 : ' + pct(c.cacT * 100), cls(p.twr - c.cacT))}
    ${k('vs S&P 500 (€)', pct((p.twr - c.spxT) * 100), 'S&P 500 : ' + pct(c.spxT * 100), cls(p.twr - c.spxT))}
  </div>`;
}
function perfLegendHtml(c){
  return `<div class="mp-legend"><span><i style="background:#D9A441"></i>${esc(ACCOUNTS.find(a => a.k === c.acc).label)} <b class="${cls(c.perf && c.perf.twr)}">${pct(c.perf ? c.perf.twr * 100 : null)}</b></span>
    <span><i style="background:#4A9FE0"></i>CAC 40 <b>${pct(c.cacT * 100)}</b></span><span><i style="background:#E9EBEE"></i>S&P 500 (€) <b>${pct(c.spxT * 100)}</b></span></div>`;
}
function chartCardHtml(c){
  return `<div class="mp-h-row"><h3 class="mp-h">Ma performance face aux indices <small>${esc(c.range.label || 'depuis le début')}</small></h3>
    <div class="mp-h-tools">${perfLegendHtml(c)}<button class="mp-zoom-btn" data-mp-zoom="perf" title="Agrandir">⤢</button></div></div>
    <div class="mp-chart-box"><canvas id="mpChart"></canvas></div>`;
}
// Config Chart.js de la courbe de performance (reconstruite à chaque appel : une config ne se partage pas entre 2 instances).
function buildPerfConfig(ctx, c, big){
  const cum = rows => { let a = 1; return [0].concat(rows.map(r => { a *= 1 + r.r; return +((a - 1) * 100).toFixed(2); })); };
  const dates = [E.addDays(c.perf.rows[0].from, 1)].concat(c.perf.rows.map(r => r.to));
  const labels = c.step === 'month' ? dates.map(d => MOIS[+d.slice(5, 7) - 1].slice(0, 4) + '. ' + d.slice(2, 4)) : dates.map(d => d.slice(8, 10) + '/' + d.slice(5, 7));
  const grad = ctx.createLinearGradient(0, 0, 0, big ? 620 : 260); grad.addColorStop(0, 'rgba(217,164,65,0.28)'); grad.addColorStop(1, 'rgba(217,164,65,0)');
  const fs = big ? 14 : 11;
  return { type: 'line', data: { labels, datasets: [
    { label: ACCOUNTS.find(a => a.k === c.acc).label, data: cum(c.perf.rows), borderColor: '#D9A441', backgroundColor: grad, fill: true, borderWidth: big ? 3.5 : 2.5, pointRadius: 0, pointHoverRadius: 5, tension: 0.3 },
    { label: 'CAC 40', data: cum(c.cac), borderColor: '#4A9FE0', borderWidth: big ? 2.2 : 1.6, pointRadius: 0, tension: 0.3 },
    { label: 'S&P 500 (€)', data: cum(c.spx), borderColor: 'rgba(233,235,238,0.75)', borderWidth: big ? 2 : 1.4, borderDash: [4, 4], pointRadius: 0, tension: 0.3 } ] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: !!big, position: 'top', labels: { color: '#E9EBEE', usePointStyle: true, font: { size: fs } } }, tooltip: { callbacks: { label: x => ' ' + x.dataset.label + ' : ' + pct(x.parsed.y) } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#8B93A0', maxTicksLimit: big ? 14 : 8, font: { size: fs } } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8B93A0', font: { size: fs }, callback: v => v + ' %' } } } } };
}
function drawPerfChart(c){
  const cv = document.getElementById('mpChart'); if (!cv || !c.perf) return;
  charts.perf = new Chart(cv.getContext('2d'), buildPerfConfig(cv.getContext('2d'), c, false));
}
function positionRows(c){
  const today = c.today;
  const accOfSym = sym => c.acc !== 'perso' ? null : ['pea', 'cto'].filter(k => E.replay(D.accounts[k].ops).pos[sym]).map(k => k.toUpperCase()).join(' + ');
  return Object.keys(c.st.pos).map(sym => {
    const p = c.st.pos[sym], pe = E.priceEur(S, sym, today), val = pe != null ? p.qty * pe : null;
    return { sym, p, pe, val, pv: val != null ? val - p.cost : null, pvPct: val != null && p.cost ? (val - p.cost) / p.cost * 100 : null, acc: accOfSym(sym) };
  }).sort((a, b) => (b.val || 0) - (a.val || 0));
}
function positionsHtml(c){
  const rows = positionRows(c), total = c.now.value || 1;
  const items = rows.map(r => `<div class="mp-pos">
      ${logoHtml(r.sym, 36)}
      <div class="mp-pos-name"><b>${esc(symName(r.sym))}</b><small>${num(r.p.qty, 4)} titre${r.p.qty > 1 ? 's' : ''} · PRU ${eur(r.p.qty ? r.p.cost / r.p.qty : null)}${r.acc ? ` · <span class="mp-tag">${r.acc}</span>` : ''}</small></div>
      <div class="mp-pos-px"><small>Cours</small>${eur(r.pe)}</div>
      <div class="mp-pos-val"><b>${eur(r.val)}</b><small><span class="mp-bar"><i style="width:${Math.max(2, Math.min(100, (r.val || 0) / total * 100)).toFixed(1)}%"></i></span>${num((r.val || 0) / total * 100, 1)} %</small></div>
      <div class="mp-pos-pv ${cls(r.pv)}"><b>${sEur(r.pv)}</b><small>${pct(r.pvPct)}</small></div></div>`).join('');
  return `<div class="mp-h-row"><h3 class="mp-h">Positions <small>${rows.length} ligne${rows.length > 1 ? 's' : ''}</small></h3><span class="mp-h-val">${eur(c.now.value)}</span></div>
    <div class="mp-pos-list">${items || '<div class="mp-empty">Aucune position ouverte.</div>'}
      <div class="mp-pos mp-pos-cash"><span class="mp-logo mp-logo-txt">€</span><div class="mp-pos-name"><b>Liquidités</b><small>disponibles sur le compte</small></div><div></div>
      <div class="mp-pos-val"><b>${eur(c.now.cash)}</b><small>${num(c.now.cash / total * 100, 1)} %</small></div><div></div></div></div>`;
}
function allocationHtml(c){
  const wolf = c.acc === 'wolf';
  return `<div class="mp-h-row"><h3 class="mp-h">Répartition</h3><button class="mp-zoom-btn" data-mp-zoom="donut" title="Agrandir">⤢</button></div>
    <div class="mp-donut ${wolf ? 'mp-donut-wolf' : ''}"><canvas id="mpDonut"></canvas>${wolf ? '' : `<div class="mp-donut-center"><small>Valeur</small><b>${eur(c.now.value, 0)}</b></div>`}</div>
    ${wolf ? `<div class="mp-donut-total">Valeur <b>${eur(c.now.value, 0)}</b></div>` : ''}
    <div class="mp-alloc-legend" id="mpAllocLegend"></div>`;
}
/* Camembert : logos des titres en « bulles » autour de l'anneau (plugins d'app.js portfolioSegmentLogosPlugin /
   portfolioCenterImagePlugin, déjà utilisés par l'ancien onglet Wolf) et, pour le Wolf Portfolio, le loup au centre. */
// Logo « € » des liquidités (SVG en data URI : aucun appel réseau, jamais de « L » générique sur l'anneau).
const CASH_LOGO = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="32" fill="#1B2128"/><text x="32" y="43" font-family="Arial" font-size="32" font-weight="700" text-anchor="middle" fill="#D9A441">€</text></svg>');
function donutData(c){
  // Grandes et petites lignes ALTERNÉES autour de l'anneau : triées par taille, les petites se retrouvaient côte à
  // côte et leurs logos se chevauchaient.
  const sorted = positionRows(c).filter(r => r.val > 0);
  const rows = [];
  for (let i = 0, j = sorted.length - 1; i <= j; i++, j--){ rows.push(sorted[i]); if (i !== j) rows.push(sorted[j]); }
  const labels = rows.map(r => symName(r.sym)).concat(c.now.cash > 0.5 ? ['Liquidités'] : []);
  const vals = rows.map(r => r.val).concat(c.now.cash > 0.5 ? [c.now.cash] : []);
  const colors = labels.map((_, i) => i === rows.length ? '#3A434D' : PALETTE[i % PALETTE.length]);
  const logos = rows.map(r => logoUrl(r.sym)).concat(c.now.cash > 0.5 ? [CASH_LOGO] : []);
  return { rows, labels, vals, colors, logos };
}
function buildDonutConfig(c, locked, big){
  const d = donutData(c), wolf = c.acc === 'wolf';
  const plugins = [];
  if (typeof portfolioSegmentLogosPlugin === 'function') plugins.push(portfolioSegmentLogosPlugin());
  if (wolf && typeof portfolioCenterImagePlugin === 'function') plugins.push(portfolioCenterImagePlugin());
  const ds = { data: d.vals, backgroundColor: d.colors, borderColor: '#151A1F', borderWidth: big ? 3 : 2, hoverOffset: 8 };
  ds._logos = d.logos;
  return { type: 'doughnut', data: { labels: d.labels, datasets: [ds] }, plugins,
    options: { responsive: true, maintainAspectRatio: false, cutout: wolf ? '56%' : '64%', layout: { padding: big ? 84 : 80 },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: x => ' ' + x.label + (locked ? '' : ' : ' + eur(x.parsed)) + ' (' + num(x.parsed / c.now.value * 100, 1) + ' %)' } } } } };
}
function preloadDonutImages(c, chart){
  const urls = donutData(c).logos.filter(Boolean);
  if (c.acc === 'wolf' && typeof WOLF_LOGO_URL !== 'undefined') urls.push(WOLF_LOGO_URL);
  if (typeof loadImageCached !== 'function') return;
  urls.forEach(u => loadImageCached(u).then(img => { if (img && chart && chart.ctx) chart.draw(); }));
}
function drawDonut(c, locked){
  const cv = document.getElementById('mpDonut'); if (!cv) return;
  charts.donut = new Chart(cv.getContext('2d'), buildDonutConfig(c, locked, false));
  preloadDonutImages(c, charts.donut);
  const d = donutData(c);
  const lg = document.getElementById('mpAllocLegend');
  if (lg) lg.innerHTML = d.labels.map((l, i) => `<div><i style="background:${d.colors[i]}"></i>${d.rows[i] ? logoHtml(d.rows[i].sym, 18) : '<span class="mp-logo mp-logo-txt" style="width:18px;height:18px;font-size:10px">€</span>'}<span>${esc(l)}</span><b>${num(d.vals[i] / c.now.value * 100, 1)} %</b></div>`).join('');
}
/* Agrandir (⤢) : fenêtre plein écran avec le même graphique reconstruit en grand. */
function openZoom(kind){
  const c = cache && cache[ui.acc]; if (!c || !c.perf) return;
  const locked = isLockedAcc(ui.acc);
  const acc = ACCOUNTS.find(a => a.k === ui.acc);
  closeZoom();
  const el = document.createElement('div');
  el.className = 'mp-modal-bg mp-zoom-bg'; el.id = 'mpZoom';
  const d = kind === 'donut' ? donutData(c) : null;
  const side = kind === 'donut' ? `<div class="mp-zoom-side${locked ? ' mp-locked' : ''}">${d.labels.map((l, i) => `<div class="mp-zoom-row"><i style="background:${d.colors[i]}"></i>${d.rows[i] ? logoHtml(d.rows[i].sym, 30) : '<span class="mp-logo mp-logo-txt" style="width:30px;height:30px">€</span>'}
      <span class="mp-zoom-name">${esc(l)}</span><b>${num(d.vals[i] / c.now.value * 100, 1)} %</b><small class="mp-blur-if">${eur(d.vals[i], 0)}</small></div>`).join('')}
      <div class="mp-zoom-row mp-zoom-total"><span class="mp-zoom-name">Total</span><b></b><small class="mp-blur-if">${eur(c.now.value, 0)}</small></div></div>` : '';
  el.innerHTML = `<div class="mp-zoom-panel ${locked ? 'mp-locked' : ''}">
    <div class="mp-modal-head"><div class="mp-zoom-title">${kind === 'donut' && c.acc === 'wolf' ? '<span class="mp-zoom-wolf">🐺</span>' : ''}<h3>${kind === 'donut' ? 'Répartition' : 'Performance face aux indices'} · ${esc(acc.label)}</h3>
      <small>${esc(c.range.label || 'depuis le début')}${locked ? ' · chiffres fictifs' : ''}</small></div><button class="mp-x" data-mp-zoomclose>✕</button></div>
    ${kind === 'perf' ? perfLegendHtml(c) : ''}
    <div class="mp-zoom-body ${kind === 'donut' ? 'mp-zoom-body-donut' : ''}"><div class="mp-zoom-canvas"><canvas id="mpZoomCanvas"></canvas></div>${side}</div>
    <div class="mp-zoom-foot">Données TradingView · Wolf Analysis${typeof WOLF_LOGO_URL !== 'undefined' ? ` <img src="${esc(WOLF_LOGO_URL)}" alt="">` : ''}</div></div>`;
  document.body.appendChild(el);
  el.addEventListener('mousedown', e => { if (e.target === el) closeZoom(); });
  el.querySelector('[data-mp-zoomclose]').addEventListener('click', closeZoom);
  document.addEventListener('keydown', zoomEsc);
  // Graphique créé APRÈS la mise en page de la fenêtre (sinon Chart.js le dimensionne sur une taille provisoire et le
  // dessine petit dans un coin), puis redimensionné une fois de plus par sécurité.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const cv = document.getElementById('mpZoomCanvas'); if (!cv) return;
    const ctx = cv.getContext('2d');
    charts.zoom = new Chart(ctx, kind === 'donut' ? buildDonutConfig(c, locked, true) : buildPerfConfig(ctx, c, true));
    if (kind === 'donut') preloadDonutImages(c, charts.zoom);
    setTimeout(() => { if (charts.zoom) charts.zoom.resize(); }, 120);
  }));
}
function zoomEsc(e){ if (e.key === 'Escape') closeZoom(); }
function closeZoom(){
  const el = document.getElementById('mpZoom'); if (el) el.remove();
  if (charts.zoom){ try { charts.zoom.destroy(); } catch(e){} delete charts.zoom; }
  document.removeEventListener('keydown', zoomEsc);
}
function monthsHtml(c){
  if (!c.perf) return '';
  const opsOf = r => E.sortOps(c.ops).filter(o => o.date > r.from && o.date <= r.to && o.type !== 'INIT');
  if (!c.mrows || !c.mrows.length) return '<h3 class="mp-h">Mois par mois</h3><div class="mp-empty">Pas de mois complet sur cette période.</div>';
  const items = c.mrows.map((r, i) => {
    const ops = opsOf(r);
    const chips = ops.filter(o => o.symbol).slice(0, 8).map(o => `<span class="mp-chip mp-c-${o.type}" title="${esc(TYPE_LABEL[o.type] + ' ' + symName(o.symbol) + ' le ' + fmtD(o.date) + ' : ' + sEur(o.eur))}">${logoHtml(o.symbol, 16)}${esc(TYPE_LABEL[o.type])} ${esc(symName(o.symbol))}</span>`).join('');
    const money = ops.filter(o => o.type === 'DEPOT' || o.type === 'RETRAIT').reduce((s, o) => s + o.eur, 0);
    const diff = r.r - c.mcac[i].r;
    return `<div class="mp-month">
      <div class="mp-month-head"><b>${monthLabel(r.to)}${r.to === c.today ? ' <small>en cours</small>' : ''}</b><span class="mp-pillv ${cls(r.r)}">${pct(r.r * 100)}</span></div>
      <div class="mp-month-sub"><span>CAC 40 <b class="${cls(c.mcac[i].r)}">${pct(c.mcac[i].r * 100)}</b></span><span>S&P 500 <b class="${cls(c.mspx[i].r)}">${pct(c.mspx[i].r * 100)}</b></span>
        <span>écart CAC <b class="${cls(diff)}">${pct(diff * 100)}</b></span><span>valeur fin de mois <b>${eur(r.v1, 0)}</b></span>${money ? `<span>argent versé <b>${sEur(money, 0)}</b></span>` : ''}</div>
      ${chips ? `<div class="mp-chips">${chips}${ops.filter(o => o.symbol).length > 8 ? `<span class="mp-chip">+${ops.filter(o => o.symbol).length - 8}</span>` : ''}</div>` : ''}</div>`;
  }).reverse().join('');
  return `<h3 class="mp-h">Mois par mois</h3><div class="mp-months">${items}</div>`;
}
function statsHtml(c){
  const s = c.stats;
  const d = v => v == null ? '—' : Math.round(v) + ' j';
  const wr = s.winRate == null ? 0 : s.winRate, R = 42, L = 2 * Math.PI * R;
  const ring = `<svg viewBox="0 0 100 100" class="mp-ring"><circle cx="50" cy="50" r="${R}" class="bg"/><circle cx="50" cy="50" r="${R}" class="fg" stroke-dasharray="${(wr / 100 * L).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 50 50)"/>
    <text x="50" y="48" text-anchor="middle" class="big">${s.winRate == null ? '—' : num(s.winRate, 0) + '%'}</text><text x="50" y="64" text-anchor="middle" class="small">gagnantes</text></svg>`;
  const trades = c.trades.slice().sort((a, b) => String(b.close || '9').localeCompare(String(a.close || '9')));
  const list = trades.map(t => `<div class="mp-trade">${logoHtml(t.symbol, 26)}<div class="mp-trade-name"><b>${esc(symName(t.symbol))}</b>
      <small>${fmtD(t.open)} → ${t.close ? fmtD(t.close) : 'en cours'} · ${d(t.days)}${t.fromInit ? ' · <span class="mp-tag" title="Prix d\'achat inconnu : mesuré depuis la valeur au début du suivi">depuis le début du suivi</span>' : ''}</small></div>
      <div class="mp-trade-res ${cls(t.pnl)}"><b>${pct(t.pct)}</b><small>${sEur(t.pnl)}</small></div></div>`).join('');
  return `<h3 class="mp-h">Mes transactions <small>${c.range.label ? 'clôturées ' + c.range.label : 'toutes'}</small></h3>
    <div class="mp-stats-top">${ring}<div class="mp-stats-kv">
      <div><span>Gagnantes / perdantes</span><b>${s.wins} / ${s.losses}</b></div>
      <div><span>Gain moyen quand je gagne</span><b class="pos">${pct(s.avgWinPct)}</b><small>en ${d(s.avgDaysWin)}</small></div>
      <div><span>Perte moyenne quand je perds</span><b class="neg">${pct(s.avgLossPct)}</b><small>en ${d(s.avgDaysLoss)}</small></div>
      <div><span>Résultat moyen</span><b class="${cls(s.avgPct)}">${pct(s.avgPct)}</b><small>${sEur(s.avgPnl)} · durée ${d(s.avgDays)}</small></div>
      <div><span>Gain moyen ÷ perte moyenne</span><b>${s.payoff == null ? '—' : num(s.payoff, 2) + 'x'}</b><small>total ${sEur(s.totalPnl)}</small></div></div></div>
    <label class="mp-check"><input type="checkbox" id="mpIncludeOpen" ${ui.includeOpen ? 'checked' : ''}> Inclure les positions ouvertes (comme si je vendais aujourd'hui)</label>
    <div class="mp-trades">${list || '<div class="mp-empty">Aucune position vendue sur la période.</div>'}</div>`;
}
function journalHtml(){
  const range = periodRange();
  const ops = E.sortOps(accOps(ui.acc)).reverse().filter(o => o.type === 'INIT' ? !range.from : inRange(o.date, range));
  const shown = ui.showAllOps ? ops : ops.slice(0, 30);
  let cur = '', html = '';
  shown.forEach(o => {
    const m = o.date.slice(0, 7);
    if (m !== cur){ cur = m; html += `<div class="mp-j-month">${monthLabel(o.date)}</div>`; }
    const what = o.symbol ? `<b>${esc(symName(o.symbol))}</b>${o.qty ? `<small>${num(o.qty, 4)} × ${num(o.px, 4)} ${esc(o.ccy || '')}${o.fee ? ' · frais ' + eur(o.fee) : ''}</small>` : ''}` : `<b>${esc(TYPE_LABEL[o.type])}</b>`;
    html += `<div class="mp-j-row">
      <span class="mp-j-date">${o.date.slice(8, 10)}</span>
      ${o.symbol ? logoHtml(o.symbol, 30) : `<span class="mp-logo mp-logo-txt mp-c-${o.type}">${TYPE_ICON[o.type]}</span>`}
      <div class="mp-j-what">${what}${o.note ? `<em>${esc(o.note)}</em>` : ''}</div>
      <span class="mp-typepill mp-c-${o.type}">${TYPE_LABEL[o.type]}${ui.acc === 'perso' ? ' · ' + accOfOp(o.id).toUpperCase() : ''}${o.linkedTo ? ' · copie' : ''}</span>
      <b class="mp-j-amt ${o.type === 'INIT' ? '' : cls(o.eur)}">${o.type === 'INIT' ? eur(o.eur) : o.eur ? sEur(o.eur) : '—'}</b>
      ${ui.acc !== 'perso' && !isLockedAcc(ui.acc) ? `<button class="mp-del ${ui.delConfirm === o.id ? 'confirm' : ''}" data-mp-del="${esc(o.id)}" title="Supprimer">${ui.delConfirm === o.id ? 'Confirmer' : '🗑'}</button>` : '<span></span>'}</div>`;
  });
  const trash = isLockedAcc(ui.acc) ? [] : (D.trash || []).filter(t => ui.acc === 'perso' ? t.acc !== 'wolf' : t.acc === ui.acc).slice().reverse();
  const groups = [...new Set(trash.map(t => t.group))];
  const trashHtml = !groups.length ? '' : `<details class="mp-trash"><summary>🗑 Corbeille (${groups.length}) — opérations supprimées, restaurables</summary>
    ${groups.map(g => { const it = trash.filter(t => t.group === g), o = it[0].op;
      return `<div class="mp-j-row"><span class="mp-j-date">${o.date.slice(8, 10)}</span>${o.symbol ? logoHtml(o.symbol, 30) : `<span class="mp-logo mp-logo-txt">${TYPE_ICON[o.type]}</span>`}
        <div class="mp-j-what"><b>${esc(TYPE_LABEL[o.type])}${o.symbol ? ' ' + esc(symName(o.symbol)) : ''}</b><small>du ${fmtD(o.date)} · supprimée le ${fmtD(it[0].deletedAt.slice(0, 10))}${it.length > 1 ? ' · avec sa copie Wolf' : ''}</small></div>
        <span class="mp-typepill">${it[0].acc.toUpperCase()}</span><b class="mp-j-amt">${o.type === 'INIT' ? eur(o.eur) : sEur(o.eur)}</b>
        <button class="mp-ghost" data-mp-restore="${esc(g)}">↶ Restaurer</button></div>`; }).join('')}</details>`;
  return `<div class="mp-h-row"><h3 class="mp-h">Journal des opérations <small>${ops.length}</small></h3></div><div class="mp-journal">${html}</div>${trashHtml}
    ${ops.length > 30 ? `<button class="mp-ghost" data-mp-allops>${ui.showAllOps ? 'Voir moins' : 'Voir les ' + ops.length + ' opérations'}</button>` : ''}`;
}

/* ---------- fenêtre de saisie (formulaire à gauche, récapitulatif en direct à droite) ---------- */
function openModal(type){
  ui.modal = { type, date: E.isoToday(), ccy: 'EUR', mirror: true, sugg: [] };
  ui.msg = null; render();
  setTimeout(() => { const el = document.querySelector('#mpModal [data-f="symbol-search"]') || document.querySelector('#mpModal [data-f="amount"]'); if (el) el.focus(); }, 30);
}
function heldPositions(){ return E.replay(D.accounts[ui.acc].ops).pos; }
function modalHtml(){
  const f = ui.modal, t = f.type, trade = t === 'BUY' || t === 'SELL', withSym = ['BUY', 'SELL', 'DIV', 'ATTRIB', 'INIT'].includes(t);
  const types = ['BUY', 'SELL', 'DIV', 'DEPOT', 'RETRAIT', 'FRAIS', 'ATTRIB', 'INIT'].map(k => `<button class="mp-type-btn mp-c-${k} ${k === t ? 'active' : ''}" data-mp-type="${k}"><span>${TYPE_ICON[k]}</span>${TYPE_LABEL[k]}</button>`).join('');
  const held = heldPositions();
  const heldChips = Object.keys(held).sort((a, b) => symName(a).localeCompare(symName(b))).map(sym => `<button class="mp-pick ${f.symbol === sym ? 'active' : ''}" data-mp-pick="${esc(sym)}">${logoHtml(sym, 18)}${esc(symName(sym))}</button>`).join('');
  const symField = !withSym ? '' : (t === 'SELL' || t === 'DIV' || t === 'ATTRIB')
    ? `<div class="mp-f-full"><label>Titre</label><div class="mp-picks">${heldChips || '<span class="mp-hint">Aucune position sur ce compte.</span>'}</div></div>`
    : `<div class="mp-f-full mp-search"><label>Titre</label>
        ${f.symbol ? `<div class="mp-picked">${logoHtml(f.symbol, 28)}<div><b>${esc(f.symName || symName(f.symbol))}</b><small>${esc(f.symbol)} · ${esc(f.ccyQuote || symCcy(f.symbol))}</small></div><button class="mp-x" data-mp-unpick>Changer</button></div>`
          : `<input data-f="symbol-search" placeholder="Nom de l'entreprise ou de l'ETF (ex. Air Liquide, MSCI World)…" autocomplete="off" value="${esc(f.q || '')}"><div class="mp-sugg" id="mpSugg">${suggHtml()}</div>`}</div>`;
  const ratio = D.config.wolfRatio || 0.7;
  const fld = (k, label, val, extra) => `<div><label>${label}</label><input inputmode="decimal" data-f="${k}" value="${esc(val == null ? '' : val)}" ${extra || ''}></div>`;
  return `<div class="mp-modal-head"><h3>Nouvelle opération · ${esc(ACCOUNTS.find(a => a.k === ui.acc).label)}</h3><button class="mp-x" data-mp-close>✕</button></div>
  <div class="mp-types">${types}</div>
  <div class="mp-modal-body"><div class="mp-modal-form">
    <div class="mp-f-grid">
      <div><label>Date</label><input type="date" data-f="date" value="${esc(f.date)}"></div>
      ${symField}
      ${withSym && t !== 'DIV' ? fld('qty', t === 'ATTRIB' ? 'Actions reçues' : 'Quantité', f.qty, t === 'SELL' && f.symbol && held[f.symbol] ? `placeholder="max ${num(held[f.symbol].qty, 4)}"` : '') : ''}
      ${t === 'SELL' && f.symbol && held[f.symbol] ? `<div class="mp-f-btn"><button class="mp-ghost" data-mp-sellall>Tout vendre (${num(held[f.symbol].qty, 4)})</button></div>` : ''}
      ${trade || t === 'INIT' ? fld('px', 'Cours (' + esc(f.ccy || 'EUR') + ')', f.px) + `<div><label>Devise</label><select data-f="ccy">${CCYS.map(x => `<option ${x === (f.ccy || 'EUR') ? 'selected' : ''}>${x}</option>`).join('')}</select></div>` : ''}
      ${trade && f.ccy && f.ccy !== 'EUR' ? fld('fx', 'Taux : 1 ' + esc(f.ccy === 'GBX' ? 'GBP' : f.ccy) + ' = ? €', f.fx) : ''}
      ${trade ? fld('fee', 'Frais (€)', f.fee) : ''}
      ${t === 'DIV' ? fld('dps', 'Dividende par action (facultatif)', f.dps) : ''}
      ${t === 'INIT' ? fld('pru', 'Prix de revient / action (€)', f.pru) : ''}
      ${t !== 'ATTRIB' ? fld('amount', trade ? 'Montant net (€) — vide = automatique' : t === 'INIT' ? 'Valeur à cette date (€)' : t === 'DIV' ? 'Montant net reçu (€)' : 'Montant (€)', f.amount, `placeholder="${esc(f.autoAmount || '')}"`) : ''}
      <div class="mp-f-full"><label>Note (facultatif)</label><input data-f="note" value="${esc(f.note || '')}"></div>
    </div></div>
    <div class="mp-modal-recap" id="mpRecap">${recapHtml()}</div></div>
  <div class="mp-modal-foot">${f.error ? `<span class="mp-err">${esc(f.error)}</span>` : '<span></span>'}
    <div><button class="mp-ghost" data-mp-close>Annuler</button><button class="refresh-btn" data-mp-submit ${ui.saving ? 'disabled' : ''}>${ui.saving ? 'Enregistrement…' : 'Enregistrer'}</button></div></div>`;
}
function suggHtml(){
  const f = ui.modal; const q = (f.q || '').trim().toLowerCase();
  if (q.length < 2) return '';
  const local = Object.keys(D.symbols).filter(s => symName(s).toLowerCase().includes(q) || s.toLowerCase().includes(q)).slice(0, 5)
    .map(s => ({ symbol: s, name: symName(s), currency: symCcy(s), exchange: s.split(':')[0], local: true }));
  const remote = (f.sugg || []).filter(r => !local.some(l => l.symbol === r.symbol)).slice(0, 8);
  const all = local.concat(remote);
  if (!all.length) return `<div class="mp-sugg-empty">${f.searching ? 'Recherche…' : 'Aucun résultat'}</div>`;
  return all.map(r => `<button class="mp-sugg-item" data-mp-sugg="${esc(r.symbol)}" data-name="${esc(r.name)}" data-ccy="${esc(r.currency || '')}" data-logo="${esc(r.logoid || '')}">
    ${r.local ? logoHtml(r.symbol, 24) : r.logoid ? `<img class="mp-logo" style="width:24px;height:24px" src="https://s3-symbol-logo.tradingview.com/${esc(r.logoid)}--big.svg" alt="">` : `<span class="mp-logo mp-logo-txt" style="width:24px;height:24px">${esc((r.name || '?').charAt(0))}</span>`}
    <span><b>${esc(r.name)}</b><small>${esc(r.symbol)} · ${esc(r.currency || '')}${r.local ? ' · déjà suivi' : ''}</small></span></button>`).join('');
}
function fxDefault(ccy, date){
  if (!ccy || ccy === 'EUR') return '';
  const v = E.at(S['FX_IDC:EUR' + (ccy === 'GBX' ? 'GBP' : ccy)], date || E.isoToday());
  return v ? String(+(1 / v).toFixed(6)).replace('.', ',') : '';
}
function formValues(){
  const f = ui.modal, n = k => parseNum(f[k]);
  const qty = n('qty'), px = n('px'), fee = n('fee') || 0;
  let fx = f.ccy && f.ccy !== 'EUR' ? n('fx') : 1;
  if (f.ccy === 'GBX' && fx) fx = fx / 100;
  let auto = null;
  if ((f.type === 'BUY' || f.type === 'SELL') && qty && px && fx) auto = E.netAmount(f.type, qty, px, fx, fee);
  if (f.type === 'INIT' && qty && px) auto = qty * px * (fx || 1);
  if (f.type === 'DIV' && n('dps') && f.symbol && heldPositions()[f.symbol]) auto = n('dps') * heldPositions()[f.symbol].qty;
  return { qty, px, fee, fx, amount: n('amount'), auto };
}
function recapHtml(){
  const f = ui.modal, v = formValues(), t = f.type;
  const net = v.amount != null ? Math.abs(v.amount) : v.auto != null ? Math.abs(v.auto) : null;
  const sign = ['BUY', 'RETRAIT', 'FRAIS'].includes(t) ? -1 : 1;
  const held = f.symbol ? heldPositions()[f.symbol] : null;
  const lines = [];
  if ((t === 'BUY' || t === 'SELL') && v.qty && v.px) lines.push(`<div><span>${num(v.qty, 4)} × ${num(v.px, 4)} ${esc(f.ccy)}${f.ccy !== 'EUR' && v.fx ? ' × ' + num(f.ccy === 'GBX' ? v.fx * 100 : v.fx, 6) : ''}</span><b>${eur(v.qty * v.px * (v.fx || 1))}</b></div>`);
  if (t === 'BUY' || t === 'SELL') lines.push(`<div><span>Frais</span><b>${eur(v.fee || 0)}</b></div>`);
  if (held) lines.push(`<div><span>Détenu sur ce compte</span><b>${num(held.qty, 4)} · PRU ${eur(held.cost / held.qty)}</b></div>`);
  if (t === 'BUY' && v.qty && net) { const q2 = (held ? held.qty : 0) + v.qty; lines.push(`<div><span>Après l'achat</span><b>${num(q2, 4)} titre${q2 > 1 ? 's' : ''}</b></div>`); }
  if (t === 'SELL' && held && v.qty && net){ const pv = net - held.cost * Math.min(1, v.qty / held.qty); lines.push(`<div><span>Plus-value réalisée</span><b class="${cls(pv)}">${sEur(pv)}</b></div>`); }
  const ratio = D.config.wolfRatio || 0.7;
  const mirror = (ui.acc === 'pea' || ui.acc === 'cto') && (t === 'BUY' || t === 'SELL');
  let mirrorTxt = '';
  if (mirror && v.qty){
    const wolfHeld = (E.replay(D.accounts.wolf.ops).pos[f.symbol] || {}).qty || 0;
    const q = t === 'SELL' ? (held && v.qty >= held.qty - 1e-9 ? wolfHeld : Math.min(wolfHeld, v.qty * ratio)) : v.qty * ratio;
    mirrorTxt = t === 'SELL' && !wolfHeld ? 'pas de position sur le Wolf : rien à reproduire' : (t === 'BUY' ? 'achat de ' : 'vente de ') + num(q, 4) + ' titre(s) ≈ ' + eur(net ? net * (q / v.qty) : null);
  }
  return `<div class="mp-recap-card">
    ${f.symbol ? `<div class="mp-recap-sym">${logoHtml(f.symbol, 40)}<div><b>${esc(f.symName || symName(f.symbol))}</b><small>${esc(f.symbol)}</small></div></div>` : ''}
    <small>${t === 'BUY' ? 'Débité du compte' : t === 'SELL' ? 'Crédité sur le compte' : t === 'DIV' ? 'Dividende reçu' : t === 'INIT' ? 'Valeur de départ' : t === 'ATTRIB' ? 'Actions gratuites' : 'Mouvement de liquidités'}</small>
    <div class="mp-recap-amt ${t === 'INIT' || t === 'ATTRIB' ? '' : sign > 0 ? 'pos' : 'neg'}">${t === 'ATTRIB' ? '+' + num(v.qty || 0, 4) + ' titres' : net == null ? '—' : (t === 'INIT' ? '' : sign > 0 ? '+' : '−') + eur(net)}</div>
    <div class="mp-recap-lines">${lines.join('')}</div>
    ${mirror ? `<label class="mp-mirror"><input type="checkbox" data-f="mirror" ${f.mirror !== false ? 'checked' : ''}><span><b>🐺 Reproduire sur le Wolf Portfolio</b><small>× ${String(ratio).replace('.', ',')} : ${esc(mirrorTxt || 'saisis une quantité')}</small></span></label>` : ''}
  </div>`;
}
function refreshModalBits(){
  const f = ui.modal; if (!f) return;
  const v = formValues();
  f.autoAmount = v.auto != null ? String(Math.abs(+v.auto.toFixed(2))).replace('.', ',') : '';
  const a = document.querySelector('#mpModal [data-f="amount"]'); if (a) a.placeholder = f.autoAmount;
  const r = document.getElementById('mpRecap'); if (r){ r.innerHTML = recapHtml(); const m = r.querySelector('[data-f="mirror"]'); if (m) m.addEventListener('change', () => { f.mirror = m.checked; }); }
}
function buildOp(){
  const f = ui.modal, v = formValues();
  const o = { id: newId(ui.acc), date: f.date, type: f.type, createdAt: new Date().toISOString() };
  if (f.note) o.note = f.note.trim();
  if (['BUY', 'SELL', 'DIV', 'ATTRIB', 'INIT'].includes(f.type)){
    if (!f.symbol) throw new Error('Choisis le titre.');
    o.symbol = f.symbol;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || '')) throw new Error('Date invalide.');
  if (f.type === 'BUY' || f.type === 'SELL'){
    if (!v.qty || !v.px) throw new Error('Quantité et cours obligatoires.');
    if (!v.fx) throw new Error('Taux de change obligatoire pour une devise autre que l\'euro.');
    Object.assign(o, { qty: v.qty, px: v.px, ccy: f.ccy || 'EUR', fx: +v.fx.toFixed(8), fee: v.fee });
    const net = v.amount != null ? Math.abs(v.amount) : Math.abs(v.auto);
    o.eur = +(f.type === 'BUY' ? -net : net).toFixed(2);
  } else if (f.type === 'INIT'){
    if (!v.qty) throw new Error('Quantité obligatoire.');
    o.qty = v.qty; if (v.px){ o.px = v.px; o.ccy = f.ccy || 'EUR'; }
    o.eur = +(v.amount != null ? v.amount : (v.auto || 0)).toFixed(2);
    if (parseNum(f.pru) != null) o.pruEur = parseNum(f.pru);
  } else if (f.type === 'ATTRIB'){
    if (!v.qty) throw new Error('Quantité obligatoire.'); o.qty = v.qty; o.eur = 0;
  } else {
    const a = v.amount != null ? Math.abs(v.amount) : v.auto != null ? Math.abs(v.auto) : null;
    if (!a) throw new Error('Montant obligatoire.');
    o.eur = +(f.type === 'DEPOT' || f.type === 'DIV' ? a : -a).toFixed(2);
    if (f.type === 'DIV' && parseNum(f.dps) != null) o.dps = parseNum(f.dps);
  }
  return o;
}
async function submit(){
  const f = ui.modal;
  let op;
  try { op = buildOp(); } catch(e){ f.error = e.message; render(); return; }
  const acc = ui.acc, ops = D.accounts[acc].ops;
  const chk = E.validate(ops.concat([op]));
  if (!chk.ok){ f.error = chk.errors[0]; render(); return; }
  const added = [[acc, op]];
  if ((acc === 'pea' || acc === 'cto') && (op.type === 'BUY' || op.type === 'SELL') && f.mirror !== false){
    const heldBefore = (E.replay(ops, op.date).pos[op.symbol] || {}).qty;
    const m = E.mirrorOp(Object.assign({}, op, { _acc: acc }), D.config.wolfRatio || 0.7, D.accounts.wolf.ops, heldBefore);
    if (m){ delete m._acc; m.id = newId('wolf'); if (E.validate(D.accounts.wolf.ops.concat([m])).ok) added.push(['wolf', m]); }
  }
  const newSym = op.symbol && !D.symbols[op.symbol];
  if (newSym) D.symbols[op.symbol] = Object.assign({ nom: f.symName || op.symbol, ccy: f.ccyQuote || f.ccy || 'EUR' }, f.logoid ? { logoid: f.logoid } : {});
  added.forEach(([k, o]) => D.accounts[k].ops.push(o));
  ui.saving = true; render();
  try {
    await save();
    ui.msg = { text: '✔ ' + TYPE_LABEL[op.type] + (op.symbol ? ' ' + symName(op.symbol) : '') + ' enregistré' + (added.length > 1 ? ' — reproduit sur le Wolf Portfolio (' + num(added[1][1].qty, 4) + ' titre(s))' : '') + '.' };
    ui.modal = null;
    if (op.symbol && !S[op.symbol]) loadHistory();
  } catch(e){
    added.forEach(([k, o]) => { const a = D.accounts[k].ops; const i = a.indexOf(o); if (i >= 0) a.splice(i, 1); });
    if (newSym) delete D.symbols[op.symbol];
    f.error = e.message;
  }
  ui.saving = false; render();
}
async function del(id){
  if (ui.delConfirm !== id){ ui.delConfirm = id; render(); return; }
  const acc = accOfOp(id);
  // L'opération copiée sur le Wolf Portfolio (linkedTo) part avec l'opération perso qui l'a créée.
  const targets = [[acc, id]].concat(acc !== 'wolf' ? D.accounts.wolf.ops.filter(o => o.linkedTo === id).map(o => ['wolf', o.id]) : []);
  for (const k of new Set(targets.map(t => t[0]))){
    const ids = targets.filter(t => t[0] === k).map(t => t[1]);
    const chk = E.validate(D.accounts[k].ops.filter(o => !ids.includes(o.id)));
    if (!chk.ok){ ui.msg = { err: true, text: 'Suppression impossible : ' + chk.errors[0] }; ui.delConfirm = null; render(); return; }
  }
  const backup = {}, trashBefore = (D.trash || []).slice();
  targets.forEach(([k]) => { backup[k] = D.accounts[k].ops.slice(); });
  // CORBEILLE : une opération supprimée n'est jamais perdue, elle part dans D.trash (dans le même fichier) et se restaure
  // d'un clic (« ↶ Annuler » juste après, ou plus tard depuis la corbeille sous le journal).
  const deletedAt = new Date().toISOString(), group = 'g-' + Date.now().toString(36);
  D.trash = trashBefore.concat(targets.map(([k, x]) => ({ acc: k, op: D.accounts[k].ops.find(o => o.id === x), deletedAt, group })));
  targets.forEach(([k, x]) => { D.accounts[k].ops = D.accounts[k].ops.filter(o => o.id !== x); });
  try { await save(targets.map(t => t[1])); ui.msg = { text: 'Opération supprimée' + (targets.length > 1 ? ' (et sa copie sur le Wolf Portfolio)' : '') + ' — elle est dans la corbeille.', undo: group }; }
  catch(e){ Object.keys(backup).forEach(k => { D.accounts[k].ops = backup[k]; }); D.trash = trashBefore; ui.msg = { err: true, text: e.message }; }
  ui.delConfirm = null; render();
}
// Restaure un groupe d'opérations supprimées ensemble (une opération perso + sa copie Wolf) depuis la corbeille.
async function restore(group){
  const items = (D.trash || []).filter(t => t.group === group);
  if (!items.length) return;
  for (const k of new Set(items.map(t => t.acc))){
    const chk = E.validate(D.accounts[k].ops.concat(items.filter(t => t.acc === k).map(t => t.op)));
    if (!chk.ok){ ui.msg = { err: true, text: 'Restauration impossible : ' + chk.errors[0] }; render(); return; }
  }
  const backup = {}, trashBefore = D.trash.slice();
  items.forEach(t => { backup[t.acc] = backup[t.acc] || D.accounts[t.acc].ops.slice(); });
  items.forEach(t => { if (!D.accounts[t.acc].ops.some(o => o.id === t.op.id)) D.accounts[t.acc].ops.push(t.op); });
  D.trash = D.trash.filter(t => t.group !== group);
  try { await save(); ui.msg = { text: '↶ Opération restaurée' + (items.length > 1 ? ' (avec sa copie sur le Wolf Portfolio)' : '') + '.' }; }
  catch(e){ Object.keys(backup).forEach(k => { D.accounts[k].ops = backup[k]; }); D.trash = trashBefore; ui.msg = { err: true, text: e.message }; }
  render();
}
async function searchSymbols(q){
  const f = ui.modal; if (!f) return;
  f.searching = true;
  try {
    const r = await fetch('/api/tv/search?all=1&q=' + encodeURIComponent(q)); const j = await r.json();
    if (ui.modal === f && f.q === q){ f.sugg = j.ok ? j.results : []; }
  } catch(e){ f.sugg = []; }
  f.searching = false;
  const box = document.getElementById('mpSugg'); if (box && ui.modal === f){ box.innerHTML = suggHtml(); wireSugg(); }
}
function wireSugg(){
  document.querySelectorAll('#mpModal [data-mp-sugg]').forEach(b => b.addEventListener('click', () => {
    const f = ui.modal, sym = b.dataset.mpSugg;
    f.symbol = sym; f.symName = b.dataset.name; f.logoid = b.dataset.logo || null;
    f.ccyQuote = (D.symbols[sym] && D.symbols[sym].ccy) || String(b.dataset.ccy || 'EUR').toUpperCase();
    f.ccy = f.ccyQuote; f.fx = fxDefault(f.ccy, f.date); f.q = '';
    render();
    const q = document.querySelector('#mpModal [data-f="qty"]'); if (q) q.focus();
  }));
}
function wireModal(){
  const m = document.getElementById('mpModal'), f = ui.modal;
  document.getElementById('mpModalBg').addEventListener('mousedown', e => { if (e.target.id === 'mpModalBg'){ ui.modal = null; render(); } });
  m.querySelectorAll('[data-mp-close]').forEach(b => b.addEventListener('click', () => { ui.modal = null; render(); }));
  m.querySelectorAll('[data-mp-type]').forEach(b => b.addEventListener('click', () => { f.type = b.dataset.mpType; f.error = null; if (['DEPOT', 'RETRAIT', 'FRAIS'].includes(f.type)) f.symbol = null; render(); }));
  m.querySelectorAll('[data-mp-pick]').forEach(b => b.addEventListener('click', () => { f.symbol = b.dataset.mpPick; f.ccy = symCcy(f.symbol) === 'GBX' ? 'GBX' : symCcy(f.symbol); f.fx = fxDefault(f.ccy, f.date); render(); }));
  const un = m.querySelector('[data-mp-unpick]'); if (un) un.addEventListener('click', () => { f.symbol = null; f.symName = null; render(); setTimeout(() => { const s = m.ownerDocument.querySelector('#mpModal [data-f="symbol-search"]'); if (s) s.focus(); }, 20); });
  const sa = m.querySelector('[data-mp-sellall]'); if (sa) sa.addEventListener('click', () => { f.qty = String(heldPositions()[f.symbol].qty).replace('.', ','); render(); });
  m.querySelector('[data-mp-submit]').addEventListener('click', submit);
  wireSugg();
  m.querySelectorAll('[data-f]').forEach(el => {
    const k = el.dataset.f;
    const ev = el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      f[k] = el.type === 'checkbox' ? el.checked : el.value; f.error = null;
      if (k === 'symbol-search'){
        f.q = el.value; const box = document.getElementById('mpSugg'); if (box){ box.innerHTML = suggHtml(); wireSugg(); }
        clearTimeout(searchTimer); if (el.value.trim().length >= 2) searchTimer = setTimeout(() => searchSymbols(el.value.trim()), 280);
        return;
      }
      if (k === 'ccy'){ f.fx = fxDefault(f.ccy, f.date); render(); return; }
      refreshModalBits();
    });
    if (el.tagName === 'INPUT') el.addEventListener('keydown', e => { if (e.key === 'Enter' && k !== 'symbol-search') submit(); if (e.key === 'Escape'){ ui.modal = null; render(); } });
  });
  refreshModalBits();
}

function wire(){
  const page = document.getElementById(PAGE_ID);
  page.querySelectorAll('[data-mp-acc]').forEach(b => b.addEventListener('click', () => { ui.acc = b.dataset.mpAcc; ui.msg = null; ui.delConfirm = null; render(); }));
  page.querySelectorAll('[data-mp-period]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.mpPeriod;
    if (k === 'custom'){ ui.period = { k: 'custom', from: ui.period.from || E.addDays(E.isoToday(), -90), to: ui.period.to || E.isoToday(), pending: true }; render(); return; }
    ui.period = { k }; render();
  }));
  const ysel = page.querySelector('[data-mp-yearsel]'); if (ysel) ysel.addEventListener('change', () => { if (ysel.value){ ui.period = { k: 'y', year: +ysel.value }; render(); } });
  const ap = page.querySelector('[data-mp-applyrange]');
  if (ap) ap.addEventListener('click', () => {
    const f = page.querySelector('[data-mp-from]').value, t = page.querySelector('[data-mp-to]').value;
    if (f && t && f < t){ ui.period = { k: 'custom', from: f, to: t }; render(); }
  });
  page.querySelectorAll('[data-mp-add]').forEach(b => b.addEventListener('click', () => openModal(b.dataset.mpAdd)));
  const rf = page.querySelector('[data-mp-refresh]'); if (rf) rf.addEventListener('click', () => loadHistory(true));
  const mx = page.querySelector('[data-mp-msgx]'); if (mx) mx.addEventListener('click', () => { ui.msg = null; render(); });
  const lk = page.querySelector('#mpLockBtn');
  if (lk){ const go = () => { const inp = page.querySelector('#mpLockInput'), v = inp.value.trim();
      if (typeof persoSimpleHash === 'function' && typeof PERSO_LOCK_HASH !== 'undefined' && persoSimpleHash(v) === PERSO_LOCK_HASH){
        try { persoUnlocked = true; localStorage.setItem('wolfAnalysisPersoUnlocked', '1'); } catch(e){}
        if (typeof renderPersoLockUI === 'function') renderPersoLockUI();
        render();
      } else { inp.value = ''; inp.placeholder = 'Code incorrect'; } };
    lk.addEventListener('click', go); page.querySelector('#mpLockInput').addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); }
  const rl = page.querySelector('#mpRelockBtn');
  if (rl) rl.addEventListener('click', () => {
    try { persoUnlocked = false; localStorage.removeItem('wolfAnalysisPersoUnlocked'); } catch(e){}
    if (typeof renderPersoLockUI === 'function') renderPersoLockUI();
    render();
  });
  const io = page.querySelector('#mpIncludeOpen'); if (io) io.addEventListener('change', () => { ui.includeOpen = io.checked; render(); });
  const all = page.querySelector('[data-mp-allops]'); if (all) all.addEventListener('click', () => { ui.showAllOps = !ui.showAllOps; render(); });
  page.querySelectorAll('[data-mp-del]').forEach(b => b.addEventListener('click', () => del(b.dataset.mpDel)));
  page.querySelectorAll('[data-mp-zoom]').forEach(b => b.addEventListener('click', () => openZoom(b.dataset.mpZoom)));
  page.querySelectorAll('[data-mp-restore]').forEach(b => b.addEventListener('click', () => restore(b.dataset.mpRestore)));
}

async function onShow(){
  if (!D){ await load(); render(); if (D) loadHistory(); }
  else render();
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-page="' + PAGE_ID + '"]');
  if (b) setTimeout(onShow, 0);
});
window.MP_UI = { onShow, render, reload: async () => { await load(); await loadHistory(); }, _state: () => ({ D, S, histErr, ui }) };
})();
