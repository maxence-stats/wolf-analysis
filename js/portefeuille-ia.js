/* ============================================================
   PORTEFEUILLE IA — 4 portefeuilles simulés (ChatGPT, Claude, Gemini, Grok), 10 000 € chacun,
   opérations libres, valorisés en EUROS, dividendes crédités au cash, comparés entre eux.
   Chargé APRÈS js/app.js (mêmes globaux : fmtEUR, THEME, fetchWithRetry, ensureChartJs...).

   DONNÉES : la source de vérité est le fichier data/portefeuille-ia/portefeuilles.json,
   écrit par le serveur local (POST /api/ia/save, voir .claude/static-server.ps1) — jamais
   localStorage/IndexedDB, cloisonnés par origine (le port du serveur change : c'est ce qui
   a fait "disparaître" les fiches VINCI). Le journal est APPEND-ONLY : une opération
   annulée reçoit void:true, elle n'est jamais retirée (le serveur refuse tout retrait).
   Les dividendes ne sont PAS stockés : ils sont dérivés du calendrier FMP à chaque calcul.

   CONVENTIONS DE CALCUL (vérifiées sur les données FMP, voir fmp-database/export_events.py) :
     - cours data/prices-*.json = ajustés des splits, pas des dividendes ;
     - dividendes = adjDividend (par action COURANTE, mêmes unités que le cours) ;
     => toute quantité est ramenée en actions "courantes" (× splits POSTÉRIEURS à l'opération),
        ainsi valeur = quantité × cours ajusté et dividende = quantité × adjDividend restent
        cohérents à n'importe quelle date.
     - devise de cotation = data/symbols-meta.json (c = devise de base, d = diviseur de
       sous-unité : pence, cents, fils) ; change = data/fx-{CCY}.json (unités de CCY pour 1 €).
   ============================================================ */
(function(){
'use strict';

/* ---------- constantes ---------- */
const AI_KEYS = ['chatgpt', 'claude', 'gemini', 'grok'];
const SP_KEY = 'sp500';                                  // 5e portefeuille : S&P 500 (ETF distribuant), versements mensuels manuels
const SP_SYMBOL = 'SPY';                                 // ETF proposé par défaut (SPDR S&P 500, distribuant)
const PF_KEYS = AI_KEYS.concat([SP_KEY]);
const AI_INFO = {
  chatgpt: { label:'ChatGPT', maker:'OpenAI',    logo:'data/ai-logos/chatgpt.svg', color:'#4FD1A5' },
  claude:  { label:'Claude',  maker:'Anthropic', logo:'data/ai-logos/claude.svg',  color:'#F0A04B' },
  gemini:  { label:'Gemini',  maker:'Google',    logo:'data/ai-logos/gemini.svg',  color:'#4A9FE0' },
  grok:    { label:'Grok',    maker:'xAI',       logo:'data/ai-logos/grok.svg',    color:'#B8A9FF' },
  sp500:   { label:'S&P 500', maker:'ETF distribuant (SPY)', logo:'data/ai-logos/sp500.svg', color:'#E9EBEE' }
};
const IA_DIR = 'data/portefeuille-ia/';
const IA_FILE = IA_DIR + 'portefeuilles.json';
const SUBUNITS = { GBp:['GBP', 100], GBX:['GBP', 100], ZAc:['ZAR', 100], ZAC:['ZAR', 100], KWF:['KWD', 1000], ILA:['ILS', 100] };
const EPS = 1e-9;

/* ---------- petits utilitaires ---------- */
function p2(n){ return String(n).padStart(2, '0'); }
function isoToday(){ const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
function addDays(iso, n){
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`;
}
function businessDays(fromIso, toIso){
  const out = [];
  let cur = fromIso, guard = 0;
  while (cur <= toIso && guard++ < 20000){
    const [y, m, d] = cur.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
function isoWeekKey(iso){
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${p2(week)}`;
}
function normCcy(code){
  if (!code) return [null, 1];
  if (SUBUNITS[code]) return SUBUNITS[code];
  return [String(code).toUpperCase(), 1];
}
function newId(){ return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function r6(x){ return Math.round(x * 1e6) / 1e6; }

/* ---------- séries de cours (tableaux parallèles t/c, dates ISO triées) ---------- */
function seriesFromRows(rows){ return { t: rows.map(r => r.t), c: rows.map(r => r.c) }; }
// Dernière valeur dont la date est <= date (repli sur la 1re valeur si la date précède l'historique).
function lookup(series, date){
  if (!series || !series.t.length) return null;
  let lo = 0, hi = series.t.length - 1, ans = -1;
  while (lo <= hi){
    const mid = (lo + hi) >> 1;
    if (series.t[mid] <= date){ ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (ans < 0) ans = 0;
  return { t: series.t[ans], c: series.c[ans] };
}
// Curseur à avancement monotone : pour des requêtes de dates CROISSANTES (séries quotidiennes).
function makeCursor(series){
  if (!series || !series.t.length) return null;
  let i = -1;
  return function(date){
    while (i + 1 < series.t.length && series.t[i + 1] <= date) i++;
    const k = i < 0 ? 0 : i;
    return { t: series.t[k], c: series.c[k] };
  };
}
function splitFactorAfter(ev, date){
  let f = 1;
  if (ev && ev.spl) for (const s of ev.spl) if (s.d > date) f *= s.n / s.m;
  return f;
}
// Taux : unités de ccy pour 1 EUR à une date (série FMP, sinon change live, sinon null).
function fxAt(ctx, ccy, date){
  if (!ccy || ccy === 'EUR') return 1;
  const s = ctx.fx && ctx.fx[ccy];
  if (s && s.t.length) return lookup(s, date).c;
  if (ctx.liveFx && ctx.liveFx[ccy]) return ctx.liveFx[ccy];
  return null;
}

/* ============================================================
   MOTEUR (fonctions pures, sans DOM) — rejoue le journal d'un portefeuille.
   ctx = { meta, prices:{sym:series|null}, events:{sym:{div,spl}|null}, fx:{ccy:series|null},
           liveFx:{ccy:taux}, today }
   cfg = { capitalInitial, dateDepart }
   ============================================================ */
function cmpTrades(a, b){
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ca = a.createdAt || '', cb = b.createdAt || '';
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function replay(pf, cfg, ctx){
  const today = ctx.today || isoToday();
  const meta = ctx.meta || {};
  const errors = [], warnings = [];
  const allActive = (pf.trades || []).filter(t => !t.void).slice().sort(cmpTrades);
  const active = allActive.filter(t => t.type !== 'DIV');          // achats / ventes
  const divEntries = allActive.filter(t => t.type === 'DIV');      // dividendes saisis à la main
  const pos = {}, timelines = {}, cashEvents = [];
  cashEvents.push({ date: cfg.dateDepart, delta: cfg.capitalInitial, kind: 'init' });
  let realizedTotal = 0, feesTotal = 0, investedTotal = 0, proceedsTotal = 0;

  for (const t of active){
    if (t.date < cfg.dateDepart) errors.push(`Opération du ${t.date} antérieure à la date de départ (${cfg.dateDepart}).`);
    const f = splitFactorAfter((ctx.events || {})[t.symbol], t.date);
    const p = pos[t.symbol] || (pos[t.symbol] = {
      symbol: t.symbol, nom: t.nom || t.symbol, ccy: t.ccy, qty: 0, cost: 0, realized: 0,
      firstDate: t.date, lastDate: t.date, buys: 0, sells: 0
    });
    // Quantité en actions COURANTES. "Tout vendre" (all) vide exactement la position : pas de
    // reliquat d'arrondi (6 décimales) multiplié par un facteur de split.
    const qtyC = (t.type === 'SELL' && t.all) ? p.qty : t.qty * f;
    p.lastDate = t.date;
    if (t.nom) p.nom = t.nom;
    const tl = timelines[t.symbol] || (timelines[t.symbol] = { dates: [], qty: [], pxEur: [], fx: [] });
    if (t.type === 'BUY'){
      // Frais de transaction (facultatifs) : décaissés EN PLUS du montant investi et intégrés au prix de revient.
      const fee = t.fee || 0;
      feesTotal += fee; investedTotal += t.eur + fee; p.qty += qtyC; p.cost += t.eur + fee; p.buys++;
      cashEvents.push({ date: t.date, delta: -(t.eur + fee), kind: 'buy', id: t.id });
    } else {
      if (qtyC > p.qty + 1e-6) errors.push(`Vente de ${p.nom} le ${t.date} supérieure à la quantité détenue.`);
      const frac = p.qty > EPS ? Math.min(1, qtyC / p.qty) : 1;
      const costRemoved = p.cost * frac;
      const fee = t.fee || 0;                                       // frais de vente : déduits du produit
      feesTotal += fee; proceedsTotal += t.eur - fee;
      const gain = (t.eur - fee) - costRemoved;
      p.realized += gain; realizedTotal += gain;
      p.qty = Math.max(0, p.qty - qtyC); p.cost -= costRemoved; p.sells++;
      if (p.qty < 1e-7){ p.qty = 0; p.cost = 0; }
      cashEvents.push({ date: t.date, delta: t.eur - fee, kind: 'sell', id: t.id });
    }
    tl.dates.push(t.date); tl.qty.push(p.qty);
    tl.pxEur.push(qtyC > EPS ? t.eur / qtyC : (tl.pxEur.length ? tl.pxEur[tl.pxEur.length - 1] : 0));
    tl.fx.push(t.fx || 1);
  }

  // Dividendes DÉRIVÉS : quantité détenue à la clôture de la veille de l'ex-date (opérations
  // strictement antérieures), crédit à la date de paiement si elle est passée.
  const entitled = (sym, exDate) => {
    const tl = timelines[sym];
    if (!tl) return 0;
    let lo = 0, hi = tl.dates.length - 1, ans = -1;
    while (lo <= hi){ const mid = (lo + hi) >> 1; if (tl.dates[mid] < exDate){ ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans < 0 ? 0 : tl.qty[ans];
  };
  let dividends = [];
  const calDivs = [], upcoming = [], anomalies = [];
  for (const sym of Object.keys(pos)){
    if (cfg.dividendes === false) break;              // réglage : dividendes exclus (comparaison en cours seuls)
    const ev = (ctx.events || {})[sym];
    if (ev === null) warnings.push(`Calendrier des dividendes indisponible pour ${pos[sym].nom} (actualise les données).`);
    if (!ev || !ev.div) continue;
    const m = meta[sym] || {};
    const dv = m.d || 1, ccy = m.c || pos[sym].ccy;
    for (const d of ev.div){
      const q = entitled(sym, d.d);
      if (q < EPS) continue;
      const creditDate = (d.p && d.p >= d.d) ? d.p : d.d;
      const perShare = d.a / dv;                      // devise de base par action
      const local = q * perShare;
      const priceRow = lookup((ctx.prices || {})[sym], d.d);
      const price = priceRow ? priceRow.c / dv : null;
      if (price && perShare / price > 0.25){          // ex. ADR/OTC en devise mélangée
        anomalies.push({ symbol: sym, nom: pos[sym].nom, exDate: d.d, perShare, price });
        continue;
      }
      if (creditDate > today){ upcoming.push({ symbol: sym, nom: pos[sym].nom, exDate: d.d, payDate: creditDate, qty: q, local, ccy }); continue; }
      const fxr = fxAt(ctx, ccy, creditDate) || fxAt(ctx, ccy, d.d);
      if (!fxr){ warnings.push(`Change ${ccy} indisponible : dividende de ${pos[sym].nom} (${d.d}) ignoré.`); continue; }
      const eur = local / fxr;
      calDivs.push({ symbol: sym, nom: pos[sym].nom, exDate: d.d, payDate: creditDate, qty: q, local, ccy, fx: fxr, eur, perShare });
    }
  }
  // Mode "auto" : dividendes du calendrier FMP. Mode "manuel" (défaut) : uniquement ceux saisis par
  // l'utilisateur (type DIV) ; le calendrier ne sert alors qu'à RAPPELER ceux qui restent à saisir.
  if (cfg.dividendes !== false) {
    if (cfg.dividendesMode === 'auto') dividends = calDivs.slice();
    else dividends = divEntries.map(t => ({ id: t.id, manual: true, symbol: t.symbol, nom: t.nom || t.symbol, exDate: t.refEx || null, payDate: t.date, qty: t.qty, perShare: t.perShare, local: t.perShare * t.qty, ccy: t.ccy, fx: t.fx, eur: t.eur, note: t.note || '' }));
    dividends.forEach(d => { if (d.payDate < cfg.dateDepart) errors.push(`Dividende du ${d.payDate} antérieur à la date de départ.`); cashEvents.push({ date: d.payDate, delta: d.eur, kind: 'div' }); });
  }
  dividends.sort((a, b) => a.payDate < b.payDate ? -1 : a.payDate > b.payDate ? 1 : 0);

  const order = { init: 0, div: 1, sell: 2, buy: 3 };
  cashEvents.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : order[a.kind] - order[b.kind]);
  let cash = 0, minCash = Infinity, minCashDate = null;
  for (const e of cashEvents){
    cash += e.delta;
    if (cash < minCash){ minCash = cash; minCashDate = e.date; }
  }
  if (minCash < -0.005) errors.push(`Cash insuffisant le ${minCashDate}.`);
  const dividendsTotal = dividends.reduce((s, d) => s + d.eur, 0);
  return { feesTotal, investedTotal, proceedsTotal, active, divEntries, calendarDividends: calDivs, pos, timelines, cashEvents, cash, realizedTotal, dividends, dividendsTotal, upcoming, anomalies, errors, warnings };
}

function daysBetween(a, b){ return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }
// Actions détenues (en actions courantes) à la fin d'une date, d'après les opérations déjà passées.
function heldQtyAt(model, sym, date){
  const tl = model.timelines[sym];
  if (!tl) return 0;
  let q = 0;
  for (let i = 0; i < tl.dates.length; i++) { if (tl.dates[i] <= date) q = tl.qty[i]; else break; }
  return q;
}
// Dividendes du calendrier FMP dont le versement est passé et qui n'ont PAS encore été saisis à la main.
function pendingDividends(model, cfg){
  if (cfg.dividendes === false || cfg.dividendesMode === 'auto') return [];
  return model.calendarDividends.filter(d => !model.divEntries.some(e => e.symbol === d.symbol && (e.refEx === d.exDate || Math.abs(daysBetween(e.date, d.payDate)) <= 20)));
}

// Série de valeur totale (cash + positions valorisées en €) sur une liste de dates croissantes.
function buildSeries(model, ctx, dates){
  const cashEv = model.cashEvents;
  let ci = 0, cash = 0, inv = 0, proc = 0;
  const meta = ctx.meta || {};
  const states = Object.keys(model.timelines).map(sym => {
    const m = meta[sym] || {};
    const ccy = m.c || model.pos[sym].ccy;
    return { sym, tl: model.timelines[sym], i: -1, dv: m.d || 1, ccy,
             price: makeCursor((ctx.prices || {})[sym]),
             fx: makeCursor(ctx.fx && ctx.fx[ccy]) };
  });
  const out = new Array(dates.length), outPos = new Array(dates.length), outInv = new Array(dates.length), outProc = new Array(dates.length);
  dates.forEach((date, k) => {
    while (ci < cashEv.length && cashEv[ci].date <= date){
      const ev = cashEv[ci];
      cash += ev.delta;
      if (ev.kind === 'buy') inv -= ev.delta; else if (ev.kind === 'sell') proc += ev.delta;
      ci++;
    }
    let total = cash, posSum = 0;
    for (const s of states){
      while (s.i + 1 < s.tl.dates.length && s.tl.dates[s.i + 1] <= date) s.i++;
      const q = s.i >= 0 ? s.tl.qty[s.i] : 0;
      if (q < EPS) continue;
      const pr = s.price ? s.price(date) : null;
      if (pr){
        const fxr = s.ccy === 'EUR' ? 1 : (s.fx ? s.fx(date).c : ((ctx.liveFx && ctx.liveFx[s.ccy]) || s.tl.fx[s.i]));
        posSum += q * pr.c / s.dv / fxr;
      } else {
        posSum += q * s.tl.pxEur[s.i];              // repli : dernier prix d'opération (cours indisponibles)
      }
    }
    out[k] = total + posSum; outPos[k] = posSum; outInv[k] = inv; outProc[k] = proc;
  });
  // pos = valeur des positions seules, inv = argent investi cumulé (frais inclus), proc = produit net des ventes cumulé
  out.pos = outPos; out.inv = outInv; out.proc = outProc;
  return out;
}

// Valorisation "maintenant" (cours live si fournis, sinon dernière clôture FMP).
function valueNow(model, cfg, ctx, live){
  const meta = ctx.meta || {};
  const positions = [];
  let positionsValue = 0, invested = 0, unrealized = 0;
  for (const sym of Object.keys(model.pos)){
    const p = model.pos[sym];
    if (p.qty < 1e-7) continue;
    const m = meta[sym] || {};
    const dv = m.d || 1, ccy = m.c || p.ccy;
    let priceLocal = null, source = 'cloture', asOf = null;
    const q = live && live.quotes && live.quotes[sym];
    if (q && q.ccy === ccy && q.price > 0 && !q.suspect){ priceLocal = q.price; source = 'live'; asOf = q.time; }
    else {
      const s = (ctx.prices || {})[sym];
      if (s && s.t.length){ priceLocal = s.c[s.c.length - 1] / dv; asOf = s.t[s.t.length - 1]; }
    }
    let fxr = null;
    if (ccy === 'EUR') fxr = 1;
    else if (live && live.fx && live.fx[ccy]) fxr = live.fx[ccy];
    else { const s = ctx.fx && ctx.fx[ccy]; if (s && s.t.length) fxr = s.c[s.c.length - 1]; }
    let valueEur, estimated = false;
    if (priceLocal != null && fxr){ valueEur = p.qty * priceLocal / fxr; }
    else { valueEur = p.cost; estimated = true; }
    const pnl = valueEur - p.cost;
    positions.push({
      symbol: sym, nom: p.nom, ccy, qty: p.qty, costEur: p.cost, pruEur: p.qty > EPS ? p.cost / p.qty : 0,
      priceLocal, priceEur: (priceLocal != null && fxr) ? priceLocal / fxr : null, valueEur, pnlEur: pnl,
      pnlPct: p.cost > EPS ? pnl / p.cost * 100 : null, source, asOf, estimated, realized: p.realized, firstDate: p.firstDate
    });
    positionsValue += valueEur; invested += p.cost; unrealized += pnl;
  }
  const total = model.cash + positionsValue;
  positions.forEach(x => { x.weight = total > EPS ? x.valueEur / total * 100 : 0; });
  positions.sort((a, b) => b.valueEur - a.valueEur);
  return { total, cash: model.cash, positionsValue, invested, unrealized, positions };
}

function maxDrawdownPct(values){
  let peak = -Infinity, dd = 0;
  for (const v of values){ if (v > peak) peak = v; if (peak > 0) dd = Math.min(dd, (v - peak) / peak * 100); }
  return dd;
}

function computeMetrics(model, cfg, now, series){
  const gain = now.total - cfg.capitalInitial;
  const investedTotal = model.investedTotal || 0, proceeds = model.proceedsTotal || 0;
  const gainInv = now.positionsValue + proceeds - investedTotal;   // latent + réalisé, frais déduits
  const withPnl = now.positions.filter(p => p.pnlPct != null);
  const best = withPnl.slice().sort((a, b) => b.pnlPct - a.pnlPct)[0] || null;
  const worst = withPnl.slice().sort((a, b) => a.pnlPct - b.pnlPct)[0] || null;
  return {
    total: now.total, gainEur: gain, gainPct: cfg.capitalInitial > EPS ? gain / cfg.capitalInitial * 100 : 0,
    cash: now.cash, cashPct: now.total > EPS ? now.cash / now.total * 100 : 0,
    invested: now.invested, unrealized: now.unrealized, realized: model.realizedTotal, dividends: model.dividendsTotal, fees: model.feesTotal || 0,
    investedTotal, proceeds, gainInv, positionsValue: now.positionsValue, perfInv: investedTotal > EPS ? gainInv / investedTotal * 100 : null,
    nPositions: now.positions.length, nTrades: model.active.length,
    winners: withPnl.filter(p => p.pnlEur > 0).length, withPnl: withPnl.length, best, worst,
    maxDrawdown: series && series.length ? maxDrawdownPct(series) : 0
  };
}

// Cash disponible + contrôle de cohérence d'un journal candidat (utilisé avant d'enregistrer).
function validateTrades(pf, cfg, ctx){
  const m = replay(pf, cfg, ctx);
  return m.errors;
}

/* ---------- construction d'opérations ---------- */
// Achat : eur autoritaire ; qty = eur × fx / px (fx = unités de devise pour 1 €).
function makeBuy({ symbol, nom, eur, px, ccy, fx, date, source, note, fee }){
  const t = { id: newId(), type: 'BUY', date, symbol, nom, eur: Math.round(eur * 100) / 100, qty: r6(eur * fx / px),
              px, ccy, fx, source: source || 'manuel', note: note || '', createdAt: new Date().toISOString() };
  if (fee > 0) t.fee = Math.round(fee * 100) / 100;
  return t;
}
// Dividende saisi à la main : eur = quantité x dividende par action (devise du titre) / change.
function makeDiv({ symbol, nom, qty, perShare, ccy, fx, date, note, refEx }){
  const t = { id: newId(), type: 'DIV', date, symbol, nom, qty: r6(qty), perShare, ccy, fx, eur: Math.round(qty * perShare / fx * 10000) / 10000, note: note || '', createdAt: new Date().toISOString() };
  if (refEx) t.refEx = refEx;
  return t;
}
// Vente : qtyTraded en unités de l'époque de la vente (unités courantes / facteur de splits ultérieurs).
function makeSell({ symbol, nom, qtyTraded, px, ccy, fx, date, source, note, all, fee }){
  const eur = Math.round(qtyTraded * px / fx * 100) / 100;
  const t = { id: newId(), type: 'SELL', date, symbol, nom, eur, qty: r6(qtyTraded),
              px, ccy, fx, source: source || 'manuel', note: note || '', createdAt: new Date().toISOString() };
  if (all) t.all = true;
  if (fee > 0) t.fee = Math.round(fee * 100) / 100;
  return t;
}

/* ---------- S&P 500 : versements mensuels de référence ---------- */
function addMonths(iso, k){
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + k + 1, 0)).getUTCDate();   // dernier jour du mois cible
  const dt = new Date(Date.UTC(y, m - 1 + k, Math.min(d, last)));
  return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`;
}
// Valeur d'un portefeuille de référence : même capital de départ que les IA (le cash non investi
// compte au pair), puis `mensuel` € investis dans l'indice le jour de départ et chaque mois ensuite
// (1er jour de bourse à partir de la même date du mois). benchVals = indice converti en € par date.
function sp500Dca(dates, benchVals, c, startIdx){
  const M = c.sp500Mensuel || 0;
  if (!benchVals || !(M > 0) || startIdx < 0) return null;
  // Mêmes frais que pour les IA (fixes + %), ajoutés au montant : la comparaison reste équitable.
  const fee = Math.round(((c.fraisFixes || 0) + (c.fraisPct || 0) / 100 * M) * 100) / 100;
  const cost = M + fee;
  const pos = new Array(dates.length).fill(null), contrib = new Array(dates.length).fill(null);
  let units = 0, contributed = 0, k = 0;
  for (let i = startIdx; i < dates.length; i++) {
    if (benchVals[i] == null) continue;
    while (contributed + cost <= c.capitalInitial + 1e-9 && dates[i] >= addMonths(c.dateDepart, k)) {
      units += M / benchVals[i]; contributed += cost; k++;
    }
    pos[i] = units * benchVals[i]; contrib[i] = contributed;
  }
  return { pos, contrib, contributed, units, fee };
}

/* ---------- pertinence : performance de CHAQUE achat ---------- */
// Chaque achat est valorisé comme s'il était encore détenu (quantité ramenée en actions
// courantes x cours actuel en €), ce qui isole la qualité du CHOIX de l'IA, indépendamment des
// renforcements successifs. Titre entièrement vendu : cours de la dernière vente. Écart avec le
// S&P 500 = ce qu'aurait donné le même montant placé dans l'indice le même jour.
function analyzePurchases(model, ctx, now, dates, benchVals){
  const posBySym = {}, lastSell = {};
  now.positions.forEach(p => { posBySym[p.symbol] = p; });
  model.active.forEach(t => { if (t.type === 'SELL') lastSell[t.symbol] = t; });
  const benchNow = benchVals && benchVals.length ? benchVals[benchVals.length - 1] : null;
  const benchAt = d => {
    if (!benchVals) return null;
    let lo = 0, hi = dates.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (dates[mid] <= d) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans < 0 ? null : benchVals[ans];
  };
  const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
  const today = ctx.today || isoToday();
  const lots = [];
  model.active.forEach(t => {
    if (t.type !== 'BUY') return;
    const ev = (ctx.events || {})[t.symbol];
    const qtyC = t.qty * splitFactorAfter(ev, t.date);
    const p = posBySym[t.symbol];
    let priceEur = null, status = 'detenu', endDate = today;
    if (p && p.priceEur != null) priceEur = p.priceEur;
    else if (!p && lastSell[t.symbol]) {
      const s = lastSell[t.symbol];
      priceEur = s.px / splitFactorAfter(ev, s.date) / s.fx; status = 'vendu'; endDate = s.date;
    }
    if (priceEur == null || !(t.eur > 0)) return;
    const cost = t.eur + (t.fee || 0);                              // frais inclus
    const value = qtyC * priceEur, perf = (value / cost - 1) * 100;
    const b0 = benchAt(t.date);
    const sp = (status === 'detenu' && b0 && benchNow) ? (benchNow / b0 - 1) * 100 : (b0 && benchAt(endDate) ? (benchAt(endDate) / b0 - 1) * 100 : null);
    lots.push({ id: t.id, date: t.date, symbol: t.symbol, nom: t.nom || t.symbol, eur: cost, value, perf, sp, alpha: sp == null ? null : perf - sp, days: Math.max(0, dayDiff(t.date, endDate)), status });
  });
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const perfs = lots.map(l => l.perf), alphas = lots.filter(l => l.alpha != null).map(l => l.alpha);
  const lines = {};
  lots.forEach(l => { (lines[l.symbol] || (lines[l.symbol] = { symbol: l.symbol, nom: l.nom, lots: [] })).lots.push(l); });
  const byLine = Object.values(lines).map(L => {
    const eurSum = L.lots.reduce((s, l) => s + l.eur, 0), valSum = L.lots.reduce((s, l) => s + l.value, 0);
    const al = L.lots.filter(l => l.alpha != null).map(l => l.alpha);
    return Object.assign(L, { nBuys: L.lots.length, eur: eurSum, value: valSum, avgPerf: mean(L.lots.map(l => l.perf)), weightedPerf: (valSum / eurSum - 1) * 100, avgAlpha: mean(al) });
  }).sort((a, b) => b.avgPerf - a.avgPerf);
  const eurAll = lots.reduce((s, l) => s + l.eur, 0), valAll = lots.reduce((s, l) => s + l.value, 0);
  const sorted = lots.slice().sort((a, b) => b.perf - a.perf);
  return {
    lots, byLine, n: lots.length,
    avgPerf: mean(perfs), medianPerf: median(perfs), weightedPerf: eurAll > 0 ? (valAll / eurAll - 1) * 100 : null,
    winners: lots.filter(l => l.perf > 0).length, avgAlpha: mean(alphas), beatSp: lots.filter(l => l.alpha != null && l.alpha > 0).length, nAlpha: alphas.length,
    avgDays: mean(lots.map(l => l.days)), repeated: byLine.filter(L => L.nBuys >= 2).length,
    best: sorted[0] || null, worst: sorted[sorted.length - 1] || null
  };
}

window.IA_ENGINE = { AI_KEYS, AI_INFO, replay, heldQtyAt, pendingDividends, daysBetween, buildSeries, valueNow, computeMetrics, validateTrades, makeBuy, makeSell, makeDiv, addMonths, sp500Dca, analyzePurchases,
  seriesFromRows, lookup, makeCursor, splitFactorAfter, fxAt, businessDays, addDays, isoToday, isoWeekKey, normCcy,
  maxDrawdownPct, cmpTrades, newId };

/* ============================================================
   COUCHE INTERFACE
   ============================================================ */
const PAGE_ID = 'pagePortefeuilleIA';
const LIVE_TTL_MS = 10 * 60 * 1000;
const g = name => (typeof window[name] !== 'undefined' ? window[name] : null);   // globaux de app.js
const esc = s => (g('escapeHtml') ? g('escapeHtml')(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])));
const eur = (v, d = 2) => v == null || !isFinite(v) ? 'N/D' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
const pct = (v, d = 1) => v == null || !isFinite(v) ? 'N/D' : (v >= 0 ? '+' : '') + v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
const signedEur = (v, d = 2) => v == null || !isFinite(v) ? 'N/D' : (v >= 0 ? '+' : '−') + eur(Math.abs(v), d);
const numFr = (v, d = 2) => v == null || !isFinite(v) ? 'N/D' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtQty = q => q == null ? 'N/D' : q.toLocaleString('fr-FR', { maximumFractionDigits: q < 1 ? 4 : 3 });
const fmtDate = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
const cls = v => v == null ? '' : (v >= 0 ? 'pos' : 'neg');

/* ---------- état ---------- */
let S = null;                 // contenu de portefeuilles.json
let loadError = null;         // fichier illisible : on BLOQUE l'écriture (jamais écraser)
let serverOk = false;         // endpoints /api/ia/* joignables (raccourci Wolf Analysis)
let serverInfo = {};          // chemins de sauvegarde annoncés par le serveur (panneau « Sauvegarde »)
let view = 'compare';         // 'compare' | clé d'une IA
let range = 'all';
let computed = null;          // { ctx, byKey:{model,now,series,metrics}, dates, bench, warnings }
let live = { quotes: {}, fx: {}, at: null, fetching: false, failed: 0, total: 0 };
let ui = { buy: null, sell: null, showSettings: false, histAll: false, voidConfirm: null, msg: null };
let refreshPoll = null, refreshInfo = null;
const charts = {};
const cache = { meta: null, bench: null, prices: {}, events: {}, fx: {} };

function defaultState(){
  const today = isoToday();
  const portfolios = {};
  PF_KEYS.forEach(k => { portfolios[k] = { label: AI_INFO[k].label, modele: k === SP_KEY ? AI_INFO[k].maker : '', trades: [] }; });
  return { version: 1, revision: 0, config: { capitalInitial: 12000, montantHebdo: 100, dateDepart: today, strategie: '', sp500Mensuel: 1000, dividendes: false, dividendesMode: 'manuel', fraisFixes: 0, fraisPct: 1 }, portfolios };
}
function cfg(){ return S.config; }
const trades = key => (S.portfolios[key].trades || []);

/* ---------- persistance (fichier disque via le serveur local) ---------- */
async function iaPing(){
  try {
    const r = await fetch('/api/ia/ping', { cache: 'no-store' });
    const j = await r.json();
    serverOk = !!(r.ok && j && j.ok && j.writable);
    serverInfo = serverOk ? j : {};
  } catch (e) { serverOk = false; }
}
async function iaLoad(){
  loadError = null;
  try {
    const r = await fetch(IA_FILE, { cache: 'no-store' });
    if (r.status === 404) { S = defaultState(); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j || j.version !== 1 || !j.portfolios || AI_KEYS.some(k => !j.portfolios[k])) throw new Error('format inattendu');
    // Un ancien fichier n'a que les 4 IA : le portefeuille S&P 500 est créé en mémoire (écrit au premier enregistrement).
    if (!j.portfolios[SP_KEY]) j.portfolios[SP_KEY] = { label: AI_INFO[SP_KEY].label, modele: AI_INFO[SP_KEY].maker, trades: [] };
    PF_KEYS.forEach(k => { if (!Array.isArray(j.portfolios[k].trades)) j.portfolios[k].trades = []; });
    j.dividendesForces = undefined;
    j.config = Object.assign({ capitalInitial: 12000, montantHebdo: 100, dateDepart: isoToday(), strategie: '', sp500Mensuel: 1000, dividendes: false, dividendesMode: 'manuel', fraisFixes: 0, fraisPct: 1 }, j.config || {});
    j.config.dividendes = false;      // dividendes non comptés (ni IA ni S&P 500) : comparaison simple et équitable
    // 100 €/mois = ANCIEN défaut (S&P de référence calculé) ; le versement mensuel voulu est 1 000 €. Correction en mémoire
    // seulement : le fichier de l'utilisateur n'est pas réécrit (il l'est s'il enregistre ses réglages).
    if (j.config.sp500Mensuel === 100) j.config.sp500Mensuel = 1000;
    delete j.baseRevision; delete j.deleted;
    j.config = Object.assign({}, j.config);
    S = j;
  } catch (e) {
    loadError = 'Impossible de lire ' + IA_FILE + ' (' + (e.message || e) + '). Rien n\'a été modifié : corrige le fichier ou restaure une copie de data/portefeuille-ia/backups/.';
    if (!S) S = defaultState();
  }
}
let saveChain = Promise.resolve();
// Toute écriture passe par ici, l'une après l'autre : copie profonde -> mutation -> POST avec
// la révision de base. En cas de conflit (autre onglet) on recharge et on refuse, jamais de fusion à l'aveugle.
function iaSave(mutator, deletedIds){
  const run = async () => {
    if (loadError) return { ok: false, error: 'Fichier illisible : écriture bloquée par sécurité.' };
    if (!serverOk) return { ok: false, error: 'Sauvegarde impossible : serveur local injoignable.' };
    const next = JSON.parse(JSON.stringify(S));
    mutator(next);
    next.baseRevision = S.revision;
    next.revision = S.revision + 1;
    if (deletedIds && deletedIds.length) next.deleted = deletedIds.slice();   // suppression voulue, déclarée au serveur
    let res, j = {};
    try {
      res = await fetch('/api/ia/save', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' }, body: JSON.stringify(next) });
      j = await res.json().catch(() => ({}));
    } catch (e) { return { ok: false, error: 'Serveur local injoignable : rien n\'a été enregistré.' }; }
    if (res.ok && j.ok) { delete next.baseRevision; delete next.deleted; next.revision = j.revision; S = next; return { ok: true }; }
    if (res.status === 409) { await iaLoad(); return { ok: false, conflict: true, error: 'Le fichier a été modifié ailleurs (autre onglet ?). Données rechargées : refais ton action.' }; }
    return { ok: false, error: 'Enregistrement refusé : ' + (j.error || ('HTTP ' + (res && res.status))) };
  };
  const p = saveChain.then(run, run);
  saveChain = p.catch(() => {});
  return p;
}

/* ---------- chargeurs de données de marché (cache mémoire) ---------- */
async function fetchJson(url){
  try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
const loadMeta = () => cache.meta || (cache.meta = fetchJson('data/symbols-meta.json').then(m => m || {}));
// Indice de référence : dividendes réinvestis (^SP500TR) si les dividendes des IA sont comptés, cours seuls
// (^GSPC) sinon — la comparaison reste équitable dans les deux cas. Repli sur l'autre fichier si absent.
const loadBench = withDiv => {
  const key = withDiv ? 'tr' : 'px';
  if (!cache.bench) cache.bench = {};
  if (!cache.bench[key]) {
    const first = withDiv ? 'data/bench-sp500tr.json' : 'data/bench-sp500.json', second = withDiv ? 'data/bench-sp500.json' : 'data/bench-sp500tr.json';
    cache.bench[key] = fetchJson(first).then(r => r || fetchJson(second)).then(r => r && r.length ? seriesFromRows(r) : null);
  }
  return cache.bench[key];
};
const loadPrices = s => cache.prices[s] || (cache.prices[s] = fetchJson('data/prices-' + encodeURIComponent(s) + '.json').then(r => r && r.length ? seriesFromRows(r) : null));
const loadEvents = s => cache.events[s] || (cache.events[s] = fetchJson('data/events-' + encodeURIComponent(s) + '.json'));
const loadFx = c => cache.fx[c] || (cache.fx[c] = fetchJson('data/fx-' + c + '.json').then(r => r && r.length ? seriesFromRows(r) : null));
function clearMarketCache(){ cache.bench = null; cache.prices = {}; cache.events = {}; cache.fx = {}; }

/* ---------- cours en direct (Yahoo via relais CORS, repli sur la dernière clôture) ---------- */
async function fetchYahooMeta(ySymbol){
  // 1) le serveur local interroge Yahoo lui-même (rapide, sans relais tiers) ;
  // 2) repli sur les relais CORS gratuits du navigateur (instables).
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
    const r = await fetch('/api/ia/quote?symbol=' + encodeURIComponent(ySymbol), { cache: 'no-store', signal: ctl.signal });
    clearTimeout(to);
    if (r.ok) { const j = await r.json(); if (j && j.ok && j.price > 0) return { regularMarketPrice: j.price, currency: j.currency, regularMarketTime: j.time }; }
  } catch (e) { /* repli ci-dessous */ }
  const fwr = g('fetchWithRetry');
  if (!fwr) throw new Error('relais indisponible');
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ySymbol) + '?range=5d&interval=1d';
  const res = await fwr(url, { cache: 'no-store' }, 12000);
  const json = await res.json();
  const m = json && json.chart && json.chart.result && json.chart.result[0] && json.chart.result[0].meta;
  if (!m || !(m.regularMarketPrice > 0)) throw new Error('réponse invalide');
  return m;
}
async function fetchLiveQuote(sym, meta){
  const c = live.quotes[sym];
  if (c && Date.now() - c.fetchedAt < LIVE_TTL_MS) return c;
  const m = await fetchYahooMeta(sym);
  const [base, div] = normCcy(m.currency);
  const q = { price: m.regularMarketPrice / div, ccy: base, time: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString().slice(0, 10) : isoToday(), fetchedAt: Date.now(), suspect: false };
  const s = await loadPrices(sym);
  const dv = (meta[sym] && meta[sym].d) || 1;
  if (s && s.t.length) {
    const last = s.c[s.c.length - 1] / dv;
    if (last > 0 && (q.price / last > 1.7 || q.price / last < 0.55)) q.suspect = true;   // split probable
  }
  live.quotes[sym] = q;
  return q;
}
async function fetchLiveFx(ccy){
  if (!ccy || ccy === 'EUR') return 1;
  const c = live.fx['_t_' + ccy];
  if (c && Date.now() - c.at < LIVE_TTL_MS) return c.v;
  const m = await fetchYahooMeta('EUR' + ccy + '=X');
  live.fx['_t_' + ccy] = { v: m.regularMarketPrice, at: Date.now() };
  live.fx[ccy] = m.regularMarketPrice;
  return m.regularMarketPrice;
}
function heldSymbols(){
  const set = new Set();
  PF_KEYS.forEach(k => { if (computed && computed.byKey[k]) computed.byKey[k].now.positions.forEach(p => set.add(p.symbol)); });
  return [...set];
}
let liveRunning = false;
async function refreshLive(){
  if (liveRunning || !computed) return;
  liveRunning = true; live.fetching = true; live.failed = 0;
  const meta = computed.ctx.meta;
  const syms = heldSymbols();
  const ccys = [...new Set(syms.map(s => (meta[s] && meta[s].c) || null).filter(c => c && c !== 'EUR'))];
  live.total = syms.length;
  renderStatusLine();
  const queue = syms.slice();
  const worker = async () => {
    while (queue.length) {
      const s = queue.shift();
      try { await fetchLiveQuote(s, meta); } catch (e) { live.failed++; }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  for (const c of ccys) { try { await fetchLiveFx(c); } catch (e) { /* repli : dernier change du fichier */ } }
  live.at = Date.now(); live.fetching = false; liveRunning = false;
  await recompute();
  softRender();
}

/* ---------- calcul ---------- */
async function buildCtx(){
  const meta = await loadMeta();
  const syms = new Set(), ccys = new Set(['USD']);
  PF_KEYS.forEach(k => trades(k).forEach(t => { if (!t.void) { syms.add(t.symbol); const c = (meta[t.symbol] && meta[t.symbol].c) || t.ccy; if (c && c !== 'EUR') ccys.add(c); } }));
  const ctx = { meta, prices: {}, events: {}, fx: {}, liveFx: {}, today: isoToday() };
  await Promise.all([
    ...[...syms].map(async s => { ctx.prices[s] = await loadPrices(s); ctx.events[s] = await loadEvents(s); }),
    ...[...ccys].map(async c => { ctx.fx[c] = await loadFx(c); })
  ]);
  Object.keys(live.fx).forEach(k => { if (k.indexOf('_t_') !== 0) ctx.liveFx[k] = live.fx[k]; });
  return ctx;
}
function benchInEur(ctx, bench, dates, capital){
  if (!bench) return null;
  const cb = makeCursor(bench), cf = makeCursor(ctx.fx.USD);
  const vals = dates.map(d => { const f = cf ? cf(d).c : ctx.liveFx.USD; return f ? cb(d).c / f : null; });
  const v0 = vals.find(v => v != null);
  return v0 ? vals.map(v => v == null ? null : capital * v / v0) : null;
}
// Lundi de la semaine d'une date ISO (origine des graphiques = semaine de la première transaction).
function mondayOf(iso){
  const [y, m, d] = iso.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;   // lundi = 0
  return addDays(iso, -dow);
}
async function recompute(){
  if (!S) return;
  const ctx = await buildCtx();
  const c = cfg();
  const withDiv = c.dividendes !== false;
  const bench = await loadBench(withDiv);
  // Grille de jours ouvrés : depuis le début de l'expérience, prolongée jusqu'à 90 jours en arrière
  // pour que le S&P 500 soit tracé dès le premier jour (les IA n'existent qu'à partir de la date de départ).
  const preStart = addDays(ctx.today, -90);
  const dates = businessDays(c.dateDepart < preStart ? c.dateDepart : preStart, ctx.today);
  if (!dates.length || dates[dates.length - 1] < ctx.today) dates.push(ctx.today);   // week-end : dernier point = aujourd'hui
  let startIdx = dates.findIndex(d => d >= c.dateDepart);
  if (startIdx < 0) startIdx = dates.length - 1;
  const benchVals = benchInEur(ctx, bench, dates, c.capitalInitial);
  // Origine des comparaisons et des graphiques : lundi de la semaine de la PREMIÈRE transaction (toutes IA
  // confondues). Sans aucune transaction : lundi de la semaine en cours (rien ne s'est passé avant).
  const allTradeDates = [];
  PF_KEYS.forEach(k => trades(k).forEach(t => { if (!t.void) allTradeDates.push(t.date); }));
  const hasTrades = allTradeDates.length > 0;
  const originMonday = mondayOf(hasTrades ? allTradeDates.sort()[0] : ctx.today);
  let originIdx = dates.findIndex(d => d >= originMonday);
  if (originIdx < 0) originIdx = dates.length - 1;
  const byKey = {}, warnings = [];
  PF_KEYS.forEach(k => {
    const model = replay(S.portfolios[k], c, ctx);
    const now = valueNow(model, c, ctx, live);
    const built = buildSeries(model, ctx, dates);
    const series = built.map((v, i) => i < startIdx ? null : v);
    if (series.length) series[series.length - 1] = now.total;
    // Performance sur l'ARGENT INVESTI (et non sur la réserve de cash) : (positions + produit des ventes - investi) / investi
    const posS = built.pos.slice();
    if (posS.length) posS[posS.length - 1] = now.positionsValue;
    const perf = dates.map((d, i) => built.inv[i] > EPS ? (posS[i] + built.proc[i] - built.inv[i]) / built.inv[i] * 100 : null);
    byKey[k] = { model, now, series, perf, metrics: computeMetrics(model, c, now, series.slice(startIdx)), analysis: analyzePurchases(model, ctx, now, dates, benchVals) };
    model.errors.forEach(e => warnings.push(AI_INFO[k].label + ' : ' + e));
    model.warnings.forEach(e => warnings.push(AI_INFO[k].label + ' : ' + e));
    model.anomalies.forEach(a => warnings.push(`${AI_INFO[k].label} : dividende de ${a.nom} (${fmtDate(a.exDate)}) ignoré — montant incohérent avec le cours, à vérifier.`));
  });
  Object.keys(live.quotes).forEach(s => { if (live.quotes[s].suspect) warnings.push(`Cours en direct de ${s} ignoré : écart de plus de 40 % avec la dernière clôture (split ? clique « Actualiser les données »).`); });
  // Portefeuille S&P de référence : mêmes règles, mais versements à partir de la même origine que les courbes.
  const dca = null;   // le S&P 500 est désormais un VRAI portefeuille (SP_KEY) saisi à la main, plus un calcul de référence
  const dcaPerf = dca ? dates.map((d, i) => dca.contrib[i] > 0 ? (dca.pos[i] - dca.contrib[i]) / dca.contrib[i] * 100 : null) : null;
  const benchPerf = benchVals ? dates.map((d, i) => i >= originIdx && benchVals[originIdx] > 0 && benchVals[i] != null ? (benchVals[i] / benchVals[originIdx] - 1) * 100 : null) : null;
  computed = { ctx, byKey, dates, startIdx, originIdx, hasTrades, bench: benchVals, dca, dcaPerf, benchPerf, withDiv, warnings: [...new Set(warnings)] };
}

/* ---------- univers de titres (sélecteur) ---------- */
let universe = null;
async function getUniverse(){
  if (universe) return universe;
  const meta = await loadMeta();
  const strip = g('stripAccents') || (s => s);
  const sheetName = {};
  try { (typeof rankingSummaryData !== 'undefined' ? rankingSummaryData : []).forEach(e => { if (e.symbol && e.nom) sheetName[e.symbol] = e.nom; }); } catch (e) { /* facultatif */ }
  // Devises réellement supportées = celles pour lesquelles un fichier de change existe (~28 lectures
  // locales, mises en cache : elles servent ensuite aux valorisations).
  const ccys = [...new Set(Object.values(meta).map(m => m.c).filter(c => c && c !== 'EUR'))];
  const ok = new Set(['EUR']);
  await Promise.all(ccys.map(async c => { if (await loadFx(c)) ok.add(c); }));
  universe = Object.keys(meta).filter(s => meta[s].on !== 0 && ok.has(meta[s].c)).map(s => {
    const m = meta[s], alias = sheetName[s] || '';
    return { sym: s, name: m.n || alias || s, alias, ccy: m.c, x: m.x || '', hay: strip(((m.n || '') + ' ' + alias).toLowerCase()), symLow: s.toLowerCase() };
  });
  return universe;
}
async function searchUniverse(q){
  const strip = g('stripAccents') || (s => s);
  const n = strip(q.trim().toLowerCase());
  if (n.length < 1) return [];
  const u = await getUniverse();
  const scored = [];
  for (const e of u) {
    let sc = -1;
    if (e.symLow === n) sc = 0;
    else if (e.symLow.startsWith(n)) sc = 1;
    else if (e.hay.startsWith(n)) sc = 2;
    else if (n.length >= 2 && e.hay.includes(n)) sc = 3;
    else if (n.length >= 2 && e.symLow.includes(n)) sc = 4;
    if (sc >= 0) scored.push([sc, e]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length);
  return scored.slice(0, 12).map(x => x[1]);
}
function logoHtml(sym, name){
  let url = null;
  try {
    const sheet = (typeof rankingSummaryData !== 'undefined' ? rankingSummaryData : []).find(e => e.symbol === sym);
    if (sheet && g('companyLogoUrl')) url = g('companyLogoUrl')(sheet.nom);
  } catch (e) { /* repli ci-dessous */ }
  url = url || ('data/logos/' + encodeURIComponent(sym) + '.png');
  const initial = esc((name || sym || '?').trim().charAt(0).toUpperCase());
  return `<span class="ia-logo"><span class="ia-logo-i">${initial}</span><img src="${esc(url)}" alt="" onerror="this.remove()"></span>`;
}
function aiLogoHtml(key, size){
  return `<span class="ia-ai-logo" style="width:${size}px;height:${size}px;"><img src="${AI_INFO[key].logo}" alt="${esc(AI_INFO[key].label)}"></span>`;
}

/* ---------- prix & change d'une opération ---------- */
async function resolveQuote(sym, date){
  const meta = await loadMeta();
  const m = meta[sym];
  if (!m) return { error: 'Titre inconnu dans la base.' };
  const ccy = m.c, dv = m.d || 1, today = isoToday();
  const [s, ev] = await Promise.all([loadPrices(sym), loadEvents(sym)]);
  let px = null, source = null, asOf = null, warn = null, error = null;
  if (date >= today) {
    try {
      // Les relais CORS sont lents/instables : on n'attend pas plus de 8 s (la requête continue en
      // arrière-plan et alimente le cache pour la prochaine fois), puis repli sur la dernière clôture.
      const q = await Promise.race([fetchLiveQuote(sym, meta), new Promise((_, rej) => setTimeout(() => rej(new Error('délai')), 8000))]);
      if (q.ccy !== ccy) warn = `Le cours en direct est en ${q.ccy} alors que la base cote en ${ccy} : vérifie le prix.`;
      else if (q.suspect) warn = 'Cours en direct très éloigné de la dernière clôture connue (split ?). Vérifie le prix, ou clique « Actualiser les données ».';
      else { px = q.price; source = 'live'; asOf = q.time; }
    } catch (e) { /* repli sur la dernière clôture */ }
    if (px == null && s) {
      const i = s.t.length - 1;
      if (s.t[i] < addDays(today, -4)) {
        // Fichier FMP ancien : un achat "aujourd'hui" à un prix de plusieurs jours fausserait tout de suite la
        // performance (constaté : -10 % affiché sur un achat neuf). On force la saisie du prix du jour.
        asOf = s.t[i];
        if (!warn) warn = 'Cours en direct indisponible et dernière clôture trop ancienne (' + fmtDate(asOf) + ') : saisis le prix du jour, ou clique « Actualiser les données » puis recommence.';
      } else {
        px = s.c[i] / dv; source = 'cloture'; asOf = s.t[i];
        if (!warn) warn = 'Cours en direct indisponible : dernière clôture connue (' + fmtDate(asOf) + '). Modifie le prix si besoin.';
      }
    }
  } else if (s) {
    const row = lookup(s, date);
    if (row && row.t <= date) { px = row.c * splitFactorAfter(ev, date) / dv; source = 'cloture'; asOf = row.t; }   // cours ajusté -> unités de l'époque
    else warn = 'Aucun cours connu à cette date : saisis le prix.';
  }
  if (px == null && !warn) error = 'Aucun cours disponible pour ce titre : saisis le prix à la main.';
  let fx = 1, fxSource = 'EUR';
  if (ccy !== 'EUR') {
    fx = null;
    if (date >= today) { try { fx = await Promise.race([fetchLiveFx(ccy), new Promise((_, rej) => setTimeout(() => rej(new Error('délai')), 8000))]); fxSource = 'live'; } catch (e) { fx = null; } }
    if (!fx) { const fs = await loadFx(ccy); if (fs) { fx = lookup(fs, date).c; fxSource = 'fichier'; } }
    if (!fx) error = 'Change EUR/' + ccy + ' indisponible : impossible de valoriser cette devise.';
  }
  return { px, source, asOf, ccy, fx, fxSource, warn, error, name: m.n };
}
const parseNum = v => { const n = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : null; };
// Modifier un achat déjà enregistré (date, montant, prix, change, frais, note) : même formulaire, prérempli.
// Les ventes ne se modifient pas (supprime-la et refais-la).
function openEditBuy(key, id){
  if (!serverOk || loadError) return;
  const t = trades(key).find(x => x.id === id);
  if (!t || t.type !== 'BUY') return;
  ui.form = { type: 'BUY', editId: id, key, sym: t.symbol, name: t.nom || t.symbol, q: '', date: t.date, eur: String(t.eur), px: String(t.px), pxManual: true, pxEdited: false, source: t.source, asOf: null, ccy: t.ccy, fx: t.fx, fxSource: 'enregistré', note: t.note || '', qty: '', sellAll: true, fee: t.fee ? String(t.fee) : '', feeManual: true, warn: null, error: null, busy: false, loading: false, suggestions: [] };
  renderForm();
  const b = document.getElementById('iaFormBox');
  if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function heldPosition(key, sym){ const c = computed && computed.byKey[key]; return c ? c.now.positions.find(p => p.symbol === sym) : null; }
// Frais par défaut d'une opération : fixe + pourcentage du montant (réglages).
function defaultFee(amount){
  const c = cfg();
  const v = (c.fraisFixes || 0) + (c.fraisPct || 0) / 100 * (amount || 0);
  return v > 0 ? Math.round(v * 100) / 100 : 0;
}
function formCalc(f){
  if (f.type === 'DIV') {
    const ps = parseNum(f.perShare), fxr = f.fx;
    const held = computed.byKey[f.key] ? heldQtyAt(computed.byKey[f.key].model, f.sym, f.date) : 0;
    const q = f.qtyManual ? parseNum(f.qty) : held;
    if (!(ps > 0) || !(fxr > 0) || !(q > 0)) return { ok: false, held, fx: fxr };
    return { ok: true, held, qty: q, perShare: ps, fx: fxr, local: q * ps, eur: q * ps / fxr };
  }
  const px = parseNum(f.px), fx = f.fx;
  const out = { px, fx, ok: false };
  if (!(px > 0) || !(fx > 0)) return out;
  if (f.type === 'BUY') {
    const e = parseNum(f.eur);
    if (!(e > 0)) return out;
    if (!f.feeManual) f.fee = defaultFee(e) ? String(defaultFee(e)) : '';
    Object.assign(out, { eur: e, qtyTraded: e * fx / px, fee: Math.max(0, parseNum(f.fee) || 0), ok: true });
  } else {
    const pos = heldPosition(f.key, f.sym);
    if (!pos) return out;
    const ev = computed.ctx.events[f.sym];
    const factor = splitFactorAfter(ev, f.date);
    const qtyCur = f.sellAll ? pos.qty : parseNum(f.qty);
    if (!(qtyCur > 0)) return out;
    const qtyTraded = qtyCur / factor;
    const proceeds = qtyTraded * px / fx;
    if (!f.feeManual) f.fee = defaultFee(proceeds) ? String(defaultFee(proceeds)) : '';
    Object.assign(out, { qtyCur, qtyTraded, eur: proceeds, fee: Math.max(0, parseNum(f.fee) || 0), ok: true, held: pos.qty });
  }
  return out;
}
function previewHtml(f, calc){
  if (!calc.ok) return '';
  if (f.type === 'DIV') return `<b>${fmtQty(calc.qty)}</b> action(s) × ${numFr(calc.perShare, 4)} ${esc(f.ccy || '')} = ${numFr(calc.local, 2)} ${esc(f.ccy || '')} → <b>${eur(calc.eur)}</b> crédités dans le cash`;
  if (f.type === 'BUY') return `≈ <b>${fmtQty(calc.qtyTraded)}</b> action(s) pour <b>${eur(calc.eur)}</b>${calc.fee ? ` + ${eur(calc.fee)} de frais = <b>${eur(calc.eur + calc.fee)}</b> débités` : ''}`;
  return `Vente de <b>${fmtQty(calc.qtyCur)}</b> action(s) ≈ <b>${eur(calc.eur)}</b>${calc.fee ? ` − ${eur(calc.fee)} de frais = <b>${eur(calc.eur - calc.fee)}</b>` : ''} reçus dans le cash`;
}

/* ---------- formulaire d'achat / vente ---------- */
async function openForm(type, key, sym){
  if (!serverOk || loadError) return;
  ui.form = { type, key, sym: sym || null, name: '', q: '', date: isoToday(), eur: String((key === SP_KEY ? cfg().sp500Mensuel : cfg().montantHebdo) || 100), px: '', pxManual: false, source: null, asOf: null, ccy: null, fx: null, fxSource: null, note: '', qty: '', sellAll: true, fee: '', feeManual: false, warn: null, error: null, busy: false, loading: false, suggestions: [] };
  if (sym) { const p = heldPosition(key, sym); const mt = await loadMeta(); ui.form.name = p ? p.nom : ((mt[sym] && mt[sym].n) || sym); await refreshFormQuote(); }
  renderForm();
  const el = document.querySelector('#iaFormBox input[data-ia-field="f-q"]');
  if (el) el.focus();
}
async function openDivForm(key, sym, pre){
  if (!serverOk || loadError) return;
  const model = computed.byKey[key].model;
  const p = heldPosition(key, sym) || model.pos[sym];
  const meta = await loadMeta();
  pre = pre || {};
  ui.form = { type: 'DIV', key, sym, name: p ? p.nom : sym, date: pre.date || isoToday(), perShare: pre.perShare ? String(pre.perShare) : '', qty: '', qtyManual: false, refEx: pre.refEx || null, ccy: (meta[sym] && meta[sym].c) || null, fx: null, fxSource: null, note: '', warn: null, error: null, busy: false, loading: false };
  await refreshDivFx();
  const el = document.querySelector('#iaFormBox input[data-ia-field="f-ps"]');
  if (el) el.focus();
}
async function refreshDivFx(){
  const f = ui.form;
  if (!f || f.type !== 'DIV') return;
  f.loading = true; renderForm();
  let fx = 1, src = 'EUR';
  if (f.ccy && f.ccy !== 'EUR') {
    fx = null;
    if (f.date >= isoToday()) { try { fx = await Promise.race([fetchLiveFx(f.ccy), new Promise((_, rej) => setTimeout(() => rej(new Error('délai')), 8000))]); src = 'live'; } catch (e) { fx = null; } }
    if (!fx) { const fs = await loadFx(f.ccy); if (fs) { fx = lookup(fs, f.date).c; src = 'fichier'; } }
  }
  if (ui.form !== f) return;
  f.fx = fx; f.fxSource = src; f.loading = false; f.error = fx ? null : 'Change EUR/' + f.ccy + ' indisponible.';
  renderForm();
}
async function refreshFormQuote(){
  const f = ui.form;
  if (!f || !f.sym) return;
  f.loading = true; f.error = null; renderForm();
  const r = await resolveQuote(f.sym, f.date);
  if (ui.form !== f) return;
  f.loading = false; f.warn = r.warn || null; f.error = r.error || null;
  f.ccy = r.ccy; f.fx = r.fx; f.fxSource = r.fxSource; f.source = r.source; f.asOf = r.asOf;
  if (!f.name) f.name = r.name || f.sym;
  if (!f.pxManual && r.px != null) f.px = String(+r.px.toFixed(4));
  renderForm();
}
function sourceLabel(f){
  if (f.editId && !f.pxEdited) return 'prix enregistré (modifiable)';
  if (f.pxManual) return 'saisi à la main';
  if (f.source === 'live') return 'cours en direct' + (f.asOf ? ' (' + fmtDate(f.asOf) + ')' : '');
  if (f.source === 'cloture') return 'clôture du ' + fmtDate(f.asOf);
  return '';
}
function renderForm(){
  const box = document.getElementById('iaFormBox');
  if (!box) return;
  const f = ui.form;
  if (!f || f.key !== view) { box.innerHTML = ''; return; }
  const isBuy = f.type === 'BUY', isDiv = f.type === 'DIV';
  const calc = f.sym ? formCalc(f) : { ok: false };
  const title = isDiv ? 'Enregistrer un dividende — ' + esc(f.name) : f.editId ? 'Modifier l\'achat — ' + esc(f.name) : isBuy ? 'Enregistrer un achat' : 'Enregistrer une vente — ' + esc(f.name);
  let body = '';
  if (isDiv) {
    body += `<div class="ia-form-line">${logoHtml(f.sym, f.name)}<b>${esc(f.name)}</b><span class="ia-dim">${esc(f.sym)}${f.ccy ? ' · dividende en ' + esc(f.ccy) : ''}</span></div>
      <div class="ia-form-grid">
        <label class="ia-field"><span>Date de versement</span><input type="date" data-ia-field="f-date" value="${esc(f.date)}" max="${isoToday()}"></label>
        <label class="ia-field"><span>Dividende par action${f.ccy ? ' (en ' + esc(f.ccy) + (f.ccy === 'GBP' ? ', pas en pence' : '') + ')' : ''}</span><input type="text" inputmode="decimal" data-ia-field="f-ps" value="${esc(f.perShare)}" placeholder="ex. 0,53"></label>
        <label class="ia-field"><span>Actions détenues à cette date</span><input type="text" inputmode="decimal" data-ia-field="f-qty" value="${f.qtyManual ? esc(f.qty) : esc(String(+(calc.held || 0).toFixed(6)))}"></label>
      </div>
      <div class="ia-form-hint">${f.loading ? 'Recherche du change…' : (f.ccy && f.ccy !== 'EUR' && f.fx ? '1 € = ' + numFr(f.fx, 4) + ' ' + esc(f.ccy) + (f.fxSource === 'live' ? ' (en direct)' : ' (fichier, à la date choisie)') : 'Dividende en euros, pas de conversion.')} · Le nombre d'actions est calculé d'après tes opérations, modifiable.</div>
      <div class="ia-form-preview">${previewHtml(f, calc)}</div>
      <label class="ia-field ia-field-wide"><span>Note (facultatif)</span><textarea data-ia-field="f-note" rows="2">${esc(f.note)}</textarea></label>
      ${f.error ? `<div class="ia-form-error">${esc(f.error)}</div>` : ''}
      <div class="ia-form-actions"><button type="button" class="ia-btn ia-btn-primary" data-ia-action="form-submit" ${f.busy || !calc.ok ? 'disabled' : ''}>${f.busy ? 'Enregistrement…' : 'Enregistrer le dividende'}</button>
        <button type="button" class="ia-btn" data-ia-action="form-cancel">Annuler</button></div>`;
  } else if (isBuy && !f.sym) {
    body += `<label class="ia-field ia-field-wide"><span>Entreprise (nom ou ticker)</span>
      <input type="text" data-ia-field="f-q" value="${esc(f.q)}" placeholder="ex. Air Liquide, KO, LVMH…" autocomplete="off"></label>
      <div class="ia-suggest" id="iaSuggest"></div>`;
  } else {
    const pos = !isBuy ? heldPosition(f.key, f.sym) : null;
    body += `<div class="ia-form-line">${logoHtml(f.sym, f.name)}<b>${esc(f.name)}</b><span class="ia-dim">${esc(f.sym)}${f.ccy ? ' · cotée en ' + esc(f.ccy) : ''}</span>
      ${isBuy && !f.editId ? '<button type="button" class="ia-link" data-ia-action="form-change-sym">changer</button>' : ''}</div>`;
    body += `<div class="ia-form-grid">`;
    if (isBuy) body += `<label class="ia-field"><span>Montant investi (€)</span><input type="text" inputmode="decimal" data-ia-field="f-eur" value="${esc(f.eur)}"></label>`;
    else {
      body += `<label class="ia-field"><span>Quantité à vendre (max ${fmtQty(pos ? pos.qty : 0)})</span>
        <input type="text" inputmode="decimal" data-ia-field="f-qty" value="${f.sellAll ? esc(fmtQty(pos ? pos.qty : 0).replace(/\s/g, '')) : esc(f.qty)}"></label>
        <div class="ia-field"><span>Part de la position</span><div class="ia-pct-btns">${[25, 50, 75, 100].map(p => `<button type="button" data-ia-action="sell-pct" data-p="${p}">${p} %</button>`).join('')}</div></div>`;
    }
    body += `<label class="ia-field"><span>Frais de transaction (€)</span><input type="text" inputmode="decimal" data-ia-field="f-fee" value="${esc(f.fee || '')}" placeholder="0"></label>
      <label class="ia-field"><span>Date de l'opération</span><input type="date" data-ia-field="f-date" value="${esc(f.date)}" max="${isoToday()}"></label>
      <label class="ia-field"><span>Prix par action${f.ccy ? ' (en ' + esc(f.ccy) + (f.ccy === 'GBP' ? ', pas en pence' : '') + ')' : ''}</span>
        <input type="text" inputmode="decimal" data-ia-field="f-px" value="${esc(f.px)}" ${f.loading ? 'placeholder="chargement…"' : ''}></label>
      </div>
      <div class="ia-form-hint">${f.loading ? 'Recherche du cours…' : (sourceLabel(f) ? 'Prix : ' + sourceLabel(f) + (f.fx && f.ccy && f.ccy !== 'EUR' ? ' · 1 € = ' + numFr(f.fx, 4) + ' ' + esc(f.ccy) + (f.fxSource === 'live' ? ' (en direct)' : f.fxSource === 'enregistré' ? ' (enregistré)' : ' (fichier)') : '') : '')}</div>`;
    if (f.warn) body += `<div class="ia-form-warn">⚠ ${esc(f.warn)}</div>`;
    body += `<div class="ia-form-preview">${previewHtml(f, calc)}</div>`;
    body += `<label class="ia-field ia-field-wide"><span>Raison donnée par l'IA (facultatif)</span>
      <textarea data-ia-field="f-note" rows="2" placeholder="Copie ici l'explication de l'IA…">${esc(f.note)}</textarea></label>`;
    if (f.error) body += `<div class="ia-form-error">${esc(f.error)}</div>`;
    body += `<div class="ia-form-actions"><button type="button" class="ia-btn ia-btn-primary" data-ia-action="form-submit" ${f.busy || !calc.ok ? 'disabled' : ''}>${f.busy ? 'Enregistrement…' : (f.editId ? 'Enregistrer les modifications' : isBuy ? 'Enregistrer l\'achat' : 'Enregistrer la vente')}</button>
      ${isBuy && !f.editId ? `<button type="button" class="ia-btn" data-ia-action="form-stash" ${f.busy || !calc.ok ? 'disabled' : ''} title="Garde cet achat en attente : tu l'enregistres avec les autres IA en un seul clic">Mettre de côté</button>` : ''}
      <button type="button" class="ia-btn" data-ia-action="form-cancel">Annuler</button></div>`;
  }
  box.innerHTML = `<div class="ia-form"><div class="ia-form-title">${title}<button type="button" class="ia-x" data-ia-action="form-cancel" aria-label="Fermer">✕</button></div>${body}</div>`;
  if (isBuy && !f.sym) renderSuggestions();
}
async function renderSuggestions(){
  const f = ui.form, box = document.getElementById('iaSuggest');
  if (!f || !box) return;
  const list = await searchUniverse(f.q || '');
  if (ui.form !== f || !document.getElementById('iaSuggest')) return;
  if (!f.q || !f.q.trim()) { box.innerHTML = ''; return; }
  box.innerHTML = list.length ? list.map(e => `<button type="button" class="ia-suggest-row" data-ia-action="buy-pick" data-sym="${esc(e.sym)}" data-name="${esc(e.name)}">
      ${logoHtml(e.sym, e.name)}<span class="ia-suggest-name">${esc(e.name)}</span><span class="ia-dim">${esc(e.sym)} · ${esc(e.x)} · ${esc(e.ccy)}</span></button>`).join('')
    : '<div class="ia-dim ia-suggest-empty">Aucun résultat (titres inactifs ou devises non gérées exclus).</div>';
}
async function submitForm(stash){
  const f = ui.form;
  if (!f || f.busy) return;
  const calc = formCalc(f);
  const today = isoToday();
  const fail = m => { f.error = m; f.busy = false; renderForm(); };
  if (!calc.ok) return fail(f.type === 'DIV' ? 'Vérifie la date, le dividende par action et le nombre d\'actions.' : 'Vérifie le montant, le prix et la date.');
  if (f.date > today) return fail('La date ne peut pas être dans le futur.');
  if (f.date < cfg().dateDepart) return fail('La date est antérieure au début de l\'expérience (' + fmtDate(cfg().dateDepart) + ').');
  f.busy = true; f.error = null; renderForm();
  const orig = f.editId ? trades(f.key).find(x => x.id === f.editId) : null;
  const source = orig && !f.pxEdited ? orig.source : (f.pxManual ? 'manuel' : (f.source || 'manuel'));
  const base = { symbol: f.sym, nom: f.name, px: calc.px, ccy: f.ccy, fx: calc.fx, date: f.date, source, note: (f.note || '').trim(), fee: calc.fee };
  const trade = f.type === 'DIV'
    ? makeDiv({ symbol: f.sym, nom: f.name, qty: calc.qty, perShare: calc.perShare, ccy: f.ccy, fx: calc.fx, date: f.date, note: (f.note || '').trim(), refEx: f.refEx })
    : f.type === 'BUY'
      ? makeBuy(Object.assign({ eur: calc.eur }, base))
      : makeSell(Object.assign({ qtyTraded: calc.qtyTraded, all: !!f.sellAll || (calc.held && calc.qtyCur >= calc.held * (1 - 1e-9)) }, base));
  if (orig) { trade.id = orig.id; trade.createdAt = orig.createdAt; }
  // Validation chronologique complète (cash jamais négatif, quantités, dividendes) AVANT d'écrire.
  const ctx = computed.ctx;
  const vctx = Object.assign({}, ctx, { prices: Object.assign({}, ctx.prices), events: Object.assign({}, ctx.events), fx: Object.assign({}, ctx.fx) });
  vctx.prices[f.sym] = await loadPrices(f.sym); vctx.events[f.sym] = await loadEvents(f.sym);
  if (f.ccy !== 'EUR' && !vctx.fx[f.ccy]) vctx.fx[f.ccy] = await loadFx(f.ccy);
  const journal = orig ? trades(f.key).map(x => x.id === orig.id ? trade : x) : trades(f.key).concat([trade]);
  const errors = validateTrades({ trades: journal }, cfg(), vctx);
  if (errors.length) return fail(errors[0]);
  if (stash && !orig) {
    // Achat validé mais PAS écrit : il attend d'être enregistré avec les autres (un brouillon par portefeuille).
    if (!ui.drafts) ui.drafts = {};
    ui.drafts[f.key] = trade; saveDrafts();
    ui.form = null;
    setMsg((S.portfolios[f.key].label || AI_INFO[f.key].label) + ' : achat de ' + f.name + ' (' + eur(trade.eur) + ') mis de côté. Remplis les autres IA puis clique « Enregistrer … d\'un coup ».', 'ok');
    render();
    return;
  }
  const res = await iaSave(next => { const L = next.portfolios[f.key].trades; if (orig) { const i = L.findIndex(x => x.id === orig.id); if (i >= 0) L[i] = trade; else L.push(trade); } else L.push(trade); });
  if (!res.ok) { if (res.conflict) { await recompute(); render(); } return fail(res.error); }
  ui.form = null;
  const doneMsg = (f.type === 'DIV' ? 'Dividende' : f.type === 'BUY' ? 'Achat' : 'Vente') + ' de ' + f.name + (orig ? ' modifié ✔ (' : ' enregistré ✔ (') + eur(trade.eur) + ').';
  setMsg(doneMsg, 'ok');
  await recompute();
  render();
  refreshLive();
  // Fichiers de cours FMP anciens pour ce titre (dernière clôture > 5 jours) : on lance l'actualisation
  // des titres détenus tout de suite, sinon dividendes et splits récents manqueraient dans les calculs.
  const sp = vctx.prices[f.sym], lastClose = sp && sp.t.length ? sp.t[sp.t.length - 1] : null;
  if (!orig && f.type === 'BUY' && (!lastClose || lastClose < addDays(isoToday(), -5)) && !(refreshInfo && refreshInfo.state === 'running')) {
    await startRefresh(doneMsg + ' Données FMP de ce titre anciennes (' + (lastClose ? 'dernière clôture du ' + fmtDate(lastClose) : 'aucun cours') + ').');
  }
}
// Suppression DÉFINITIVE d'une opération (achat, vente ou dividende), par exemple des tests. Refusée si
// d'autres opérations en dépendent (ex. vente ultérieure). Le serveur exige que l'id soit déclaré et
// force une copie de sauvegarde datée avant d'écrire.
async function deleteTrade(key, id){
  const t = trades(key).find(x => x.id === id);
  if (!t) return;
  const candidate = trades(key).filter(x => x.id !== id);
  const errors = replay({ trades: candidate }, cfg(), computed.ctx).errors;
  ui.voidConfirm = null;
  if (errors.length && !t.void) { setMsg('Suppression impossible : ' + errors[0] + ' Supprime d\'abord les opérations qui en dépendent.', 'err'); render(); return; }
  const res = await iaSave(next => { next.portfolios[key].trades = next.portfolios[key].trades.filter(y => y.id !== id); }, [id]);
  setMsg(res.ok ? 'Opération supprimée définitivement (copie de sauvegarde conservée dans backups/).' : res.error, res.ok ? 'ok' : 'err');
  await recompute();
  render();
}

/* ---------- rendu ---------- */
// Rendu "doux" pour les mises à jour asynchrones (cours en direct, actualisation) : si un
// formulaire est ouvert on ne reconstruit PAS la page (le curseur de l'utilisateur sauterait).
function softRender(){ if (ui.form) { renderStatusLine(); setRefreshStatusUi(); } else render(); }
function setMsg(text, kind){ ui.msg = text ? { text, kind: kind || 'ok' } : null; }
function bannerHtml(){
  if (!serverOk) return `<div class="ia-banner ia-banner-err"><b>Sauvegarde impossible.</b> Le serveur local n'est pas joignable : ouvre l'appli avec le raccourci « Wolf Analysis » du Bureau (pas en double-cliquant index.html). Si tu viens de mettre l'appli à jour, ferme la fenêtre du serveur (ou redémarre le PC) puis relance le raccourci : le serveur doit être redémarré une fois pour activer la sauvegarde. Achats, ventes et actualisation sont désactivés pour ne rien perdre.</div>`;
  if (loadError) return `<div class="ia-banner ia-banner-err"><b>Fichier illisible.</b> ${esc(loadError)}</div>`;
  return '';
}
function statusText(){
  if (live.fetching) return `Cours en direct : récupération… (${live.total} titre${live.total > 1 ? 's' : ''})`;
  if (!heldSymbols().length) return 'Aucune position pour l\'instant.';
  const ok = heldSymbols().filter(s => live.quotes[s] && !live.quotes[s].suspect).length;
  const at = live.at ? new Date(live.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;
  if (ok === live.total && ok > 0) return `Cours en direct à ${at}.`;
  if (ok > 0) return `Cours en direct pour ${ok}/${heldSymbols().length} titres (${at}), les autres à la dernière clôture.`;
  return 'Cours en direct indisponibles : valorisation à la dernière clôture connue.';
}
function renderStatusLine(){
  const el = document.getElementById('iaStatus');
  if (el) el.textContent = statusText();
}
function refreshStatusHtml(){
  const r = refreshInfo;
  if (!r) return '';
  if (r.state === 'running') return `<span class="ia-refresh-run">⏳ Actualisation ${r.done || 0}/${r.total || '?'}${r.current ? ' — ' + esc(r.current) : ''}</span>`;
  if (r.state === 'ok') return `<span class="ia-ok">✔ Données actualisées${r.finishedAt ? ' le ' + esc(new Date(r.finishedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) : ''}${r.errors && r.errors.length ? ' — ' + r.errors.length + ' avertissement(s) : ' + esc(r.errors.slice(0, 3).join(' ; ')) : ''}</span>`;
  if (r.state === 'error') return `<span class="ia-err">✖ ${esc(r.message || 'Échec de l\'actualisation')}</span>`;
  return '';
}
function tilesHtml(key){
  const m = computed.byKey[key].metrics;
  const nBuys = trades(key).filter(t => !t.void && t.type === 'BUY').length;
  const tile = (k, v, sub, c) => `<div class="ratio-card"><div class="k">${k}</div><div class="v ${c || ''}">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  return `<div class="portfolio-summary ia-tiles">
    ${tile('Argent investi', eur(m.investedTotal, 0), 'cumulé, frais inclus · ' + nBuys + ' achat' + (nBuys > 1 ? 's' : ''))}
    ${tile('Performance', m.perfInv == null ? 'N/D' : pct(m.perfInv, 2), 'gain ÷ argent investi', cls(m.gainInv))}
    ${tile('Gain total', signedEur(m.gainInv, 2), 'latent + réalisé, frais déduits', cls(m.gainInv))}
    ${tile('Valeur des positions', eur(m.positionsValue, 0), m.nPositions + ' position' + (m.nPositions > 1 ? 's' : ''))}
    ${tile('Cash de réserve', eur(m.cash, 0), 'sur ' + eur(cfg().capitalInitial, 0))}
    ${tile('Gain latent', signedEur(m.unrealized, 2), 'positions ouvertes', cls(m.unrealized))}
    ${tile('Gain réalisé', signedEur(m.realized, 2), 'ventes', cls(m.realized))}
    ${tile('Frais payés', eur(m.fees || 0), 'achats et ventes')}
  </div>`;
}
function positionsHtml(key){
  const now = computed.byKey[key].now;
  if (!now.positions.length) return '<div class="objectifs-empty">Aucune position. Clique « + Acheter » pour enregistrer le premier achat de ' + esc(AI_INFO[key].label) + '.</div>';
  const colors = ['#D9A441', '#4A9FE0', '#4FD1A5', '#8B7FE8', '#F0C877', '#E5636B', '#7FB8E8', '#B8A9FF'];
  const canEdit = serverOk && !loadError;
  const manualDiv = cfg().dividendes !== false && cfg().dividendesMode !== 'auto';
  return now.positions.map((p, i) => {
    const src = p.estimated ? '<span class="ia-badge ia-badge-warn">valeur estimée (prix de revient)</span>'
      : p.source === 'live' ? '<span class="ia-badge ia-badge-live">en direct</span>' : `<span class="ia-badge">clôture du ${fmtDate(p.asOf)}</span>`;
    return `<div class="ia-pos">
      <div class="portfolio-holding-row">
        <span class="portfolio-holding-swatch" style="background:${colors[i % colors.length]}"></span>
        <div class="portfolio-holding-logo">${logoHtml(p.symbol, p.nom)}</div>
        <div class="portfolio-holding-name">${esc(p.nom)} <span class="ia-dim">${esc(p.symbol)}</span></div>
        <div class="portfolio-holding-amount">${eur(p.valueEur, 2)}</div>
        <div class="portfolio-holding-achat" title="Prix de revient">${eur(p.costEur, 0)}</div>
        <div class="portfolio-holding-gain ${cls(p.pnlEur)}">${signedEur(p.pnlEur, 2)}</div>
        <div class="portfolio-holding-pct">${numFr(p.weight, 1)} %</div>
        <div class="portfolio-holding-perf ${cls(p.pnlPct)}">${p.pnlPct == null ? '—' : pct(p.pnlPct)}</div>
      </div>
      <div class="ia-pos-sub">
        <span>${fmtQty(p.qty)} action(s)</span><span>PRU ${eur(p.pruEur)}</span>
        <span>cours ${p.priceLocal == null ? 'N/D' : numFr(p.priceLocal, 2) + ' ' + esc(p.ccy)}</span>${src}
        ${p.realized ? `<span class="${cls(p.realized)}">réalisé ${signedEur(p.realized, 2)}</span>` : ''}
        <button type="button" class="ia-btn ia-btn-small" data-ia-action="buy-more" data-sym="${esc(p.symbol)}" ${canEdit ? '' : 'disabled'} title="Acheter de nouveau ce titre (deuxième achat, renfort)">+ Renforcer</button>
        ${manualDiv ? `<button type="button" class="ia-btn ia-btn-small" data-ia-action="div-open" data-sym="${esc(p.symbol)}" ${canEdit ? '' : 'disabled'} title="Saisir un dividende reçu">+ Dividende</button>` : ''}
        <button type="button" class="ia-btn ia-btn-small" data-ia-action="sell-open" data-sym="${esc(p.symbol)}" ${canEdit ? '' : 'disabled'}>Vendre</button>
      </div>
      ${lotsDetailsHtml(key, p.symbol)}
    </div>`;
  }).join('');
}
// Rappel : dividendes du calendrier FMP déjà versés (d'après tes actions) et pas encore saisis.
function pendingHtml(key){
  const list = pendingDividends(computed.byKey[key].model, cfg());
  if (!list.length) return '';
  const canEdit = serverOk && !loadError;
  return `<div class="ia-pending"><div class="ia-pending-title">🔔 ${list.length} dividende${list.length > 1 ? 's' : ''} à saisir</div>
    <p class="ia-dim">D'après le calendrier FMP et tes achats. Vérifie le montant sur ton relevé ou sur le site de l'entreprise, puis clique « Saisir » (préremplit la date et le dividende par action).</p>
    ${list.map(d => `<div class="ia-pending-row"><span><b>${esc(d.nom)}</b> · ${numFr(d.perShare, 4)} ${esc(d.ccy)}/action · détaché le ${fmtDate(d.exDate)}, versé le ${fmtDate(d.payDate)}</span><span class="ia-dim">${fmtQty(d.qty)} action(s) ≈ ${eur(d.eur)}</span>
      <button type="button" class="ia-btn ia-btn-small ia-btn-primary" data-ia-action="div-fill" data-sym="${esc(d.symbol)}" data-date="${esc(d.payDate)}" data-ps="${esc(String(+d.perShare.toFixed(6)))}" data-ex="${esc(d.exDate)}" ${canEdit ? '' : 'disabled'}>Saisir</button></div>`).join('')}</div>`;
}
function lotRowHtml(l){
  return `<div class="ia-lot"><span class="ia-hist-date">${fmtDate(l.date)}</span><span>${eur(l.eur, 0)}</span>
    <span class="${cls(l.perf)}">${pct(l.perf)}</span><span class="${cls(l.alpha)}" title="Écart avec le même montant placé dans le S&P 500 ce jour-là">${l.alpha == null ? '—' : (l.alpha >= 0 ? '+' : '') + numFr(l.alpha, 1) + ' pt vs S&P'}</span>
    <span class="ia-dim">${l.status === 'vendu' ? 'vendu' : l.days + ' j'}</span></div>`;
}
// Détail des achats d'une ligne (visible dès qu'un titre a été acheté plusieurs fois).
function lotsDetailsHtml(key, sym){
  const L = computed.byKey[key].analysis.byLine.find(x => x.symbol === sym);
  if (!L) return '';
  return `<details class="ia-lots"><summary>${L.nBuys} achat${L.nBuys > 1 ? 's' : ''} · performance moyenne par achat <b class="${cls(L.avgPerf)}">${pct(L.avgPerf)}</b>${L.avgAlpha == null ? '' : ` · <span class="${cls(L.avgAlpha)}">${(L.avgAlpha >= 0 ? '+' : '') + numFr(L.avgAlpha, 1)} pt vs S&amp;P</span>`}</summary>
    ${L.lots.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(lotRowHtml).join('')}</details>`;
}
function analysisHtml(key){
  const a = computed.byKey[key].analysis;
  if (!a.n) return '<div class="objectifs-empty">L\'analyse apparaîtra dès le premier achat enregistré.</div>';
  const tile = (k, v, sub, c) => `<div class="ratio-card"><div class="k">${k}</div><div class="v ${c || ''}">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  const line = (l, label) => l ? `<span>${label} : <b>${esc(l.nom)}</b> (${fmtDate(l.date)}) <b class="${cls(l.perf)}">${pct(l.perf)}</b></span>` : '';
  const rows = a.byLine.map(L => `<details class="ia-an-line"><summary>
      <span class="ia-an-name">${logoHtml(L.symbol, L.nom)}<b>${esc(L.nom)}</b></span><span>${L.nBuys} achat${L.nBuys > 1 ? 's' : ''}</span><span>${eur(L.eur, 0)}</span><span>${eur(L.value, 0)}</span>
      <span class="${cls(L.avgPerf)}"><b>${pct(L.avgPerf)}</b></span><span class="${cls(L.weightedPerf)}">${pct(L.weightedPerf)}</span><span class="${cls(L.avgAlpha)}">${L.avgAlpha == null ? '—' : (L.avgAlpha >= 0 ? '+' : '') + numFr(L.avgAlpha, 1) + ' pt'}</span></summary>
      ${L.lots.slice().sort((x, y) => x.date < y.date ? -1 : 1).map(lotRowHtml).join('')}</details>`).join('');
  return `<div class="portfolio-summary ia-tiles">
      ${tile('Performance moyenne par achat', pct(a.avgPerf), 'médiane ' + pct(a.medianPerf), cls(a.avgPerf))}
      ${tile('Performance pondérée', pct(a.weightedPerf), 'selon les montants investis', cls(a.weightedPerf))}
      ${tile('Achats gagnants', a.winners + ' / ' + a.n, numFr(a.n ? a.winners / a.n * 100 : 0, 0) + ' % des achats')}
      ${tile('Écart moyen vs S&P 500', a.avgAlpha == null ? 'N/D' : (a.avgAlpha >= 0 ? '+' : '') + numFr(a.avgAlpha, 1) + ' pt', a.nAlpha ? a.beatSp + ' / ' + a.nAlpha + ' achats font mieux que l\'indice' : 'indice indisponible', cls(a.avgAlpha))}
      ${tile('Durée moyenne de détention', numFr(a.avgDays, 0) + ' j', 'depuis chaque achat')}
      ${tile('Titres rachetés', String(a.repeated), a.repeated > 1 ? 'lignes achetées 2 fois ou plus' : 'ligne achetée 2 fois ou plus')}
    </div>
    <div class="ia-an-best">${line(a.best, 'Meilleur achat')}${line(a.worst, 'Moins bon achat')}</div>
    <div class="ia-an-table"><div class="ia-an-head"><span>Titre</span><span>Achats</span><span>Investi</span><span>Valeur</span><span>Perf. moy. / achat</span><span>Perf. pondérée</span><span>vs S&amp;P / achat</span></div>${rows}</div>
    <p class="ia-foot">Chaque achat est valorisé comme s'il était encore détenu (hors dividendes), au cours actuel ; un titre entièrement vendu l'est au prix de sa dernière vente. Si l'IA te propose deux fois la même entreprise, clique « + Renforcer » sur la ligne : les deux achats restent séparés ici et dans l'historique.</p>`;
}

function historyRows(key){
  const model = computed.byKey[key].model;
  const rows = [];
  trades(key).forEach(t => rows.push({ kind: t.type === 'BUY' ? 'buy' : t.type === 'DIV' ? 'divm' : 'sell', date: t.date, sort: (t.createdAt || '') + t.id, t }));
  model.dividends.forEach(d => { if (!d.manual) rows.push({ kind: 'div', date: d.payDate, sort: 'z' + d.exDate, d }); });
  model.upcoming.forEach(d => rows.push({ kind: 'upc', date: d.payDate, sort: 'z' + d.exDate, d }));
  rows.sort((a, b) => a.date !== b.date ? (a.date < b.date ? 1 : -1) : (a.sort < b.sort ? 1 : -1));
  return rows;
}
function historyHtml(key){
  let all = historyRows(key);
  const nVoid = all.filter(r => r.t && r.t.void).length;
  if (ui.hideVoid) all = all.filter(r => !(r.t && r.t.void));
  if (!all.length) return '<div class="objectifs-empty">Aucune opération enregistrée.</div>';
  const rows = ui.histAll ? all : all.slice(0, 25);
  const canEdit = serverOk && !loadError;
  const html = rows.map(r => {
    if (r.kind === 'div' || r.kind === 'upc') {
      const d = r.d;
      return `<div class="ia-hist ia-hist-div">
        <span class="ia-hist-date">${fmtDate(r.date)}</span><span class="ia-badge ia-badge-div">${r.kind === 'upc' ? 'Dividende à venir' : 'Dividende'}</span>
        <span class="ia-hist-name">${esc(d.nom)}</span>
        <span class="ia-hist-amt pos">${r.kind === 'upc' ? '≈ ' + numFr(d.local, 2) + ' ' + esc(d.ccy) : '+' + eur(d.eur)}</span>
        <span class="ia-hist-detail">${fmtQty(d.qty)} action(s) · détachement le ${fmtDate(d.exDate)}${r.kind === 'div' && d.ccy !== 'EUR' ? ' · ' + numFr(d.local, 2) + ' ' + esc(d.ccy) + ' au change de ' + numFr(d.fx, 4) : ''}</span>
        <span></span></div>`;
    }
    const t = r.t, buy = t.type === 'BUY';
    const confirming = ui.voidConfirm === t.id;
    const delBtn = `<button type="button" class="ia-btn ia-btn-small${confirming ? ' ia-btn-danger' : ''}" data-ia-action="del" data-id="${esc(t.id)}" ${canEdit ? '' : 'disabled'} title="Supprimer définitivement cette opération (une copie de sauvegarde est conservée)">${confirming ? 'Confirmer ?' : '🗑 Supprimer'}</button>`;
    if (r.kind === 'divm') {
      const counted = cfg().dividendesMode !== 'auto' && cfg().dividendes !== false;
      return `<div class="ia-hist ia-hist-div${t.void ? ' ia-void' : ''}"><span class="ia-hist-date">${fmtDate(t.date)}</span><span class="ia-badge ia-badge-div">Dividende saisi</span>
        <span class="ia-hist-name">${esc(t.nom || t.symbol)} <span class="ia-dim">${esc(t.symbol)}</span></span>
        <span class="ia-hist-amt pos">+${eur(t.eur)}</span>
        <span class="ia-hist-detail">${fmtQty(t.qty)} action(s) × ${numFr(t.perShare, 4)} ${esc(t.ccy)}${t.ccy !== 'EUR' ? ' (1 € = ' + numFr(t.fx, 4) + ')' : ''}${counted ? '' : ' · non compté (dividendes automatiques ou exclus)'}${t.note ? `<span class="ia-hist-note">« ${esc(t.note)} »</span>` : ''}</span>${delBtn}</div>`;
    }
    return `<div class="ia-hist${t.void ? ' ia-void' : ''}">
      <span class="ia-hist-date">${fmtDate(t.date)}</span><span class="ia-badge ${buy ? 'ia-badge-buy' : 'ia-badge-sell'}">${buy ? 'Achat' : 'Vente'}</span>
      <span class="ia-hist-name">${esc(t.nom || t.symbol)} <span class="ia-dim">${esc(t.symbol)}</span></span>
      <span class="ia-hist-amt ${buy ? '' : 'pos'}">${buy ? '−' : '+'}${eur(t.eur)}</span>
      <span class="ia-hist-detail">${t.all ? 'toute la position' : fmtQty(t.qty) + ' action(s)'} à ${numFr(t.px, 2)} ${esc(t.ccy)}${t.ccy !== 'EUR' ? ' (1 € = ' + numFr(t.fx, 4) + ')' : ''} · ${esc(t.source === 'live' ? 'cours en direct' : t.source === 'cloture' ? 'clôture' : 'prix saisi')}${t.fee ? ' · frais ' + eur(t.fee) : ''}${t.void ? ' · ANNULÉE' : ''}
        ${t.note ? `<span class="ia-hist-note">« ${esc(t.note)} »</span>` : ''}</span>
      <span class="ia-hist-btns">${buy && !t.void ? `<button type="button" class="ia-btn ia-btn-small" data-ia-action="edit-buy" data-id="${esc(t.id)}" ${canEdit ? '' : 'disabled'} title="Corriger cet achat (date, montant, prix, frais, note)">✏ Modifier</button>` : ''}${delBtn}</span>
    </div>`;
  }).join('');
  const voidBtn = nVoid ? `<button type="button" class="ia-btn ia-btn-small" data-ia-action="void-toggle">${ui.hideVoid ? 'Afficher' : 'Masquer'} ${nVoid > 1 ? 'les ' + nVoid + ' opérations annulées' : 'l\'opération annulée'}</button>` : '';
  return voidBtn + html + (all.length > 25 && !ui.histAll ? `<button type="button" class="ia-btn" data-ia-action="hist-more">Voir les ${all.length - 25} autres</button>` : '');
}
function recentWeeks(n){
  const today = isoToday(), out = [];
  for (let i = n - 1; i >= 0; i--) out.push(isoWeekKey(addDays(today, -7 * i)));
  return out;
}
function weekPillsHtml(key, weeks){
  const has = new Set(trades(key).filter(t => !t.void && t.type === 'BUY').map(t => isoWeekKey(t.date)));
  const startWeek = isoWeekKey(cfg().dateDepart);
  return weeks.map((w, i) => {
    const before = w < startWeek;
    const cur = i === weeks.length - 1;
    return `<span class="ia-wk ${before ? 'ia-wk-na' : has.has(w) ? 'ia-wk-ok' : (cur ? 'ia-wk-cur' : 'ia-wk-miss')}" title="${w}${before ? ' (avant le début)' : has.has(w) ? ' : achat enregistré' : ' : pas d\'achat'}"></span>`;
  }).join('');
}
function compareHtml(){
  const c = cfg();
  const rankRow = (key, i, isRef) => {
    const m = computed.byKey[key].metrics, a = computed.byKey[key].analysis;
    const al = a.avgAlpha;
    const label = S.portfolios[key].label || AI_INFO[key].label;
    const sub = isRef ? `ETF distribuant · ${eur(c.sp500Mensuel || 0, 0)}/mois · sans dividendes` : (S.portfolios[key].modele || AI_INFO[key].maker);
    const extra = isRef
      ? `<div class="ia-rank-vs"></div>`
      : `<div class="ia-rank-vs ${cls(al)}" title="Performance moyenne de chaque achat, comparée au même montant placé dans le S&P 500 le même jour">${al == null ? '—' : (al >= 0 ? '+' : '') + numFr(al, 1) + ' pt / achat vs S&P'}</div>`;
    const tail = isRef
      ? `<div class="ia-weeks" title="Versement de ce mois-ci"></div>`
      : `<div class="ia-weeks" title="8 dernières semaines : un achat par semaine ?">${weekPillsHtml(key, recentWeeks(8))}</div>`;
    return `<div class="ia-rank${isRef ? ' ia-rank-ref' : ''}">
      <div class="ia-rank-n">${isRef ? '—' : i + 1}</div>${aiLogoHtml(key, 40)}
      <div class="ia-rank-name"><b>${esc(label)}</b><span class="ia-dim">${esc(sub)}</span></div>
      <div class="ia-rank-val"><b class="${cls(m.gainInv)}">${m.perfInv == null ? 'N/D' : pct(m.perfInv, 2)}</b><span class="${cls(m.gainInv)}">${m.investedTotal > 0 ? signedEur(m.gainInv, 2) + ' sur ' + eur(m.investedTotal, 0) + ' investis' : 'rien investi pour l\'instant'}</span></div>
      ${extra}
      <div class="ia-rank-meta"><span>${m.nPositions} position${m.nPositions > 1 ? 's' : ''} · ${eur(m.positionsValue, 0)}</span><span>cash ${eur(m.cash, 0)}</span><span>${m.nTrades} opération${m.nTrades > 1 ? 's' : ''}</span></div>
      ${tail}
      <button type="button" class="ia-btn ia-btn-small" data-ia-action="tab" data-key="${key}">Ouvrir</button>
    </div>`;
  };
  const rows = AI_KEYS.slice().sort((a, b) => {
    const pa = computed.byKey[a].metrics.perfInv, pb = computed.byKey[b].metrics.perfInv;
    return (pb == null ? -Infinity : pb) - (pa == null ? -Infinity : pa);
  });
  const rank = rows.map((k, i) => rankRow(k, i, false)).join('') + rankRow(SP_KEY, 0, true);
  const weeks = recentWeeks(8);
  const cur = weeks[weeks.length - 1];
  const pills = AI_KEYS.map(k => {
    const done = trades(k).some(t => !t.void && t.type === 'BUY' && isoWeekKey(t.date) === cur);
    return `<span class="ia-pill ${done ? 'ia-pill-ok' : 'ia-pill-miss'}">${done ? '✔' : '✖'} ${esc(AI_INFO[k].label)}</span>`;
  }).join('');
  const monthKey = isoToday().slice(0, 7);
  const spDone = trades(SP_KEY).some(t => !t.void && t.type === 'BUY' && t.date.slice(0, 7) === monthKey);
  const spPill = `<span class="ia-pill ${spDone ? 'ia-pill-ok' : 'ia-pill-miss'}" title="Versement mensuel du S&P 500">${spDone ? '✔' : '✖'} S&amp;P 500 (ce mois-ci)</span>`;
  const ranges = [['1m', '1 M'], ['3m', '3 M'], ['6m', '6 M'], ['1y', '1 A'], ['all', 'Depuis le début']];
  const preview = !computed.hasTrades;
  return `<div class="ia-week"><b>Cette semaine (${cur}) :</b> ${pills} <span class="ia-dim">·</span> ${spPill}</div>
    <div class="ia-ranking">${rank}</div>
    <div class="chart-card ia-chart-card">
      <div class="chart-card-head"><div><h3>Performance de l'argent investi</h3><p>${preview ? 'Aucune transaction pour l\'instant : les courbes démarrent au premier achat.' : 'Gain ÷ argent réellement investi (frais inclus), cumulé depuis le début. Le cash de réserve n\'entre pas dans le calcul.'}</p></div>
        <div class="ia-ranges">${ranges.map(([k, l]) => `<button type="button" class="${range === k ? 'active' : ''}" data-ia-action="range" data-r="${k}">${l}</button>`).join('')}</div></div>
      <div class="chart-holder" style="height:420px;"><canvas id="iaCompareChart"></canvas></div>
    </div>
    <p class="ia-foot">Performance = (valeur des positions + produit des ventes − argent investi) ÷ argent investi, frais inclus, sans dividendes. Le portefeuille « S&amp;P 500 » est un ETF distribuant (dividendes non comptés) alimenté à la main, comme les IA. « pt / achat vs S&amp;P » = performance moyenne de chaque achat moins celle du même montant placé dans l'indice S&amp;P 500 le même jour.</p>`;
}
function aiHtml(key){
  const p = S.portfolios[key];
  const canEdit = serverOk && !loadError;
  return `<div class="ia-ai-head">${aiLogoHtml(key, 52)}<div><h3>${esc(p.label || AI_INFO[key].label)}</h3><span class="ia-dim">${esc(p.modele || AI_INFO[key].maker)} · départ le ${fmtDate(cfg().dateDepart)} · réserve de ${eur(cfg().capitalInitial, 0)}</span></div>
      <div class="ia-ai-actions"><button type="button" class="ia-btn ia-btn-primary" data-ia-action="buy-open" data-sym="${key === SP_KEY ? SP_SYMBOL : ''}" ${canEdit ? '' : 'disabled'}>${key === SP_KEY ? '+ Verser ' + eur(cfg().sp500Mensuel || 0, 0) + ' (' + SP_SYMBOL + ')' : '+ Acheter'}</button></div></div>
    ${tilesHtml(key)}
    ${pendingHtml(key)}
    <div id="iaFormBox"></div>
    <div class="ia-two">
      <div><div class="section-label">Positions</div><div class="portfolio-holdings-list">${positionsHtml(key)}</div></div>
      <div class="chart-card portfolio-donut-card"><div class="chart-card-head"><div><h3>Répartition</h3><p>Poids en valeur, cash inclus</p></div></div><div class="chart-holder donut-holder" style="height:300px;"><canvas id="iaDonut"></canvas></div></div>
    </div>
    <div class="section-label">Pertinence du portefeuille — performance de chaque achat</div>${analysisHtml(key)}
    <div class="section-label">Historique des opérations</div><div class="ia-history">${historyHtml(key)}</div>`;
}
// Où sont les données et comment les sauvegarder / restaurer (demande explicite : jamais de perte).
function backupHtml(){
  const nOps = PF_KEYS.reduce((n, k) => n + trades(k).length, 0);
  return `<div class="ia-settings">
    <div class="ia-form-title">Sauvegarde de tes données<button type="button" class="ia-x" data-ia-action="backup-toggle" aria-label="Fermer">✕</button></div>
    <p class="ia-backup-line"><b>Fichier principal</b> (${nOps} opération${nOps > 1 ? 's' : ''}, révision ${S ? S.revision : 0}) :<br><code>${esc(serverInfo.dataFile || 'data/portefeuille-ia/portefeuilles.json')}</code></p>
    <p class="ia-backup-line"><b>Copies datées automatiques</b> (à chaque modification, et toujours avant une suppression) :<br><code>${esc(serverInfo.backups || 'data/portefeuille-ia/backups')}</code></p>
    <p class="ia-backup-line"><b>Copie hors du dossier de l'appli</b> (mise à jour à chaque enregistrement, une copie par jour) :<br><code>${esc(serverInfo.extBackup || 'indisponible : redémarre le serveur (raccourci Wolf Analysis)')}</code></p>
    <div class="ia-form-actions"><button type="button" class="ia-btn ia-btn-primary" data-ia-action="backup-download">⬇ Télécharger une copie maintenant</button></div>
    <div class="ia-form-hint">Pour restaurer : ferme l'appli, remplace <code>portefeuilles.json</code> par une des copies ci-dessus, puis rouvre l'appli. Les mises à jour de l'appli ne touchent jamais à ce dossier.</div>
  </div>`;
}
async function downloadBackup(){
  try {
    const r = await fetch(IA_FILE, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const d = new Date();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `portefeuille-ia-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setMsg('Copie téléchargée ✔ (dossier Téléchargements de ton navigateur).', 'ok');
  } catch (e) { setMsg('Téléchargement impossible : ' + (e.message || e), 'err'); }
  render();
}
function settingsHtml(){
  const locked = PF_KEYS.some(k => trades(k).some(t => !t.void));
  const c = cfg();
  return `<div class="ia-settings">
    <div class="ia-form-title">Réglages de l'expérience<button type="button" class="ia-x" data-ia-action="settings-toggle" aria-label="Fermer">✕</button></div>
    <div class="ia-form-grid">
      <label class="ia-field"><span>Date de départ</span><input type="date" id="iaSetStart" value="${esc(c.dateDepart)}" ${locked ? 'disabled' : ''}></label>
      <label class="ia-field"><span>Réserve de cash par IA (€)</span><input type="text" inputmode="decimal" id="iaSetCap" value="${esc(String(c.capitalInitial))}"></label>
      <label class="ia-field"><span>Montant hebdomadaire par défaut (€)</span><input type="text" inputmode="decimal" id="iaSetWeek" value="${esc(String(c.montantHebdo))}"></label>
      <label class="ia-field"><span>Portefeuille S&amp;P 500 : versement mensuel proposé (€)</span><input type="text" inputmode="decimal" id="iaSetSp" value="${esc(String(c.sp500Mensuel == null ? 1000 : c.sp500Mensuel))}"></label>
      <label class="ia-field"><span>Frais fixes par transaction (€)</span><input type="text" inputmode="decimal" id="iaSetFeeFix" value="${esc(String(c.fraisFixes || 0))}"></label>
      <label class="ia-field"><span>Frais proportionnels (% du montant)</span><input type="text" inputmode="decimal" id="iaSetFeePct" value="${esc(String(c.fraisPct || 0))}"></label>
    </div>
    <div class="ia-form-hint">La réserve sert uniquement à financer les achats : la performance est calculée sur l'argent réellement investi, jamais sur la réserve.${locked ? ' La date de départ est verrouillée dès qu\'une opération existe.' : ''}</div>
    <div class="ia-form-grid">${AI_KEYS.map(k => `<label class="ia-field"><span>Modèle — ${esc(AI_INFO[k].label)}</span><input type="text" data-set-model="${k}" value="${esc(S.portfolios[k].modele || '')}" placeholder="ex. GPT-5"></label>`).join('')}</div>
    <label class="ia-field ia-field-wide"><span>Stratégie donnée aux 4 IA (mémo)</span><textarea id="iaSetStrat" rows="3" placeholder="Le texte de stratégie que tu donnes à chaque IA…">${esc(c.strategie || '')}</textarea></label>
    <div class="ia-form-hint">Hypothèses de calcul : frais selon tes réglages (0 par défaut, modifiables à chaque opération), dividendes non comptés (ni pour les IA, ni pour le S&P 500 pris en indice de cours), actions fractionnées possibles, aucun versement après le départ. Données : <code>data/portefeuille-ia/portefeuilles.json</code> (copies datées dans <code>backups/</code>).</div>
    <div class="ia-form-actions"><button type="button" class="ia-btn ia-btn-primary" data-ia-action="settings-save" ${serverOk && !loadError ? '' : 'disabled'}>Enregistrer les réglages</button></div>
  </div>`;
}
function render(){
  const page = document.getElementById(PAGE_ID);
  if (!page || !S) return;
  const y = window.scrollY;
  Object.keys(charts).forEach(k => { try { charts[k].destroy(); } catch (e) { /* déjà détruit */ } delete charts[k]; });
  const canEdit = serverOk && !loadError;
  const tabs = [`<button type="button" class="ia-tab${view === 'compare' ? ' active' : ''}" data-ia-action="tab" data-key="compare">Comparatif</button>`]
    .concat(PF_KEYS.map(k => `<button type="button" class="ia-tab${view === k ? ' active' : ''}" data-ia-action="tab" data-key="${k}">${aiLogoHtml(k, 22)}${esc(S.portfolios[k].label || AI_INFO[k].label)}</button>`)).join('');
  page.innerHTML = `${bannerHtml()}
    <div class="section-label">Portefeuille IA — 4 IA, ${eur(cfg().capitalInitial, 0)} chacune</div>
    <p class="valo-intro">Chaque IA choisit ses actions ; tu enregistres ses achats et ventes ici. Tout est valorisé en euros, dividendes crédités au cash.</p>
    <div class="ia-toolbar">
      <button type="button" class="zoom-btn objectifs-export" data-ia-action="refresh" ${canEdit && !(refreshInfo && refreshInfo.state === 'running') ? '' : 'disabled'}>↻ Actualiser les données</button>
      <button type="button" class="zoom-btn objectifs-export" data-ia-action="live-refresh">↻ Cours en direct</button>
      <button type="button" class="zoom-btn objectifs-export" data-ia-action="export-img">📷 Exporter l'image</button>
      <button type="button" class="zoom-btn objectifs-export" data-ia-action="thumb" title="Image 16:9 avec une seule courbe et le logo de chaque IA">🖼 Miniature YouTube</button>
      <button type="button" class="zoom-btn objectifs-export${ui.showBackup ? ' active' : ''}" data-ia-action="backup-toggle">💾 Sauvegarde</button>
      <button type="button" class="zoom-btn objectifs-export${ui.showSettings ? ' active' : ''}" data-ia-action="settings-toggle">⚙ Réglages</button>
      <span class="ia-status" id="iaStatus">${esc(statusText())}</span><span id="iaRefreshStatus">${refreshStatusHtml()}</span>
    </div>
    ${ui.msg ? `<div class="ia-msg ia-msg-${ui.msg.kind}">${esc(ui.msg.text)}<button type="button" class="ia-x" data-ia-action="msg-close" aria-label="Fermer">✕</button></div>` : ''}
    ${computed && computed.warnings.length ? `<details class="ia-warnings"><summary>⚠ ${computed.warnings.length} point(s) à vérifier</summary>${computed.warnings.map(w => `<div>${esc(w)}</div>`).join('')}</details>` : ''}
    ${draftsBarHtml()}
    ${ui.showBackup ? backupHtml() : ''}
    ${ui.showSettings ? settingsHtml() : ''}
    <div class="ia-tabs">${tabs}</div>
    <div id="iaBody">${view === 'compare' ? compareHtml() : aiHtml(view)}</div>`;
  renderForm();
  if (view === 'compare') drawCompareChart(); else drawDonut(view);
  window.scrollTo(0, y);
}

/* ---------- achats mis de côté : chaque IA se remplit dans son onglet, puis UN seul enregistrement ---------- */
// Le brouillon n'est PAS dans le fichier de données : c'est un achat prêt (validé) qui attend. Conservé dans le
// navigateur (localStorage, simple confort) pour survivre à un rechargement. "Enregistrer tout" = tout ou rien.
const DRAFTS_LS = 'wolfIaAchatsEnAttente';
function loadDrafts(){
  ui.drafts = {};
  try {
    const j = JSON.parse(localStorage.getItem(DRAFTS_LS) || '{}');
    PF_KEYS.forEach(k => { const t = j && j[k]; if (t && t.id && t.type === 'BUY' && t.symbol && t.eur > 0) ui.drafts[k] = t; });
  } catch (e) { /* stockage indisponible : brouillons en mémoire seulement */ }
}
function saveDrafts(){ try { localStorage.setItem(DRAFTS_LS, JSON.stringify(ui.drafts || {})); } catch (e) { /* ignoré */ } }
function draftKeys(){ return PF_KEYS.filter(k => ui.drafts && ui.drafts[k]); }
function draftsBarHtml(){
  const keys = draftKeys();
  if (!keys.length) return '';
  const canEdit = serverOk && !loadError;
  return `<div class="ia-drafts"><div class="ia-drafts-title">📥 ${keys.length} achat${keys.length > 1 ? 's' : ''} en attente — pas encore enregistré${keys.length > 1 ? 's' : ''}</div>
    <div class="ia-drafts-list">${keys.map(k => { const t = ui.drafts[k]; return `<span class="ia-draft">${aiLogoHtml(k, 22)}<b>${esc(S.portfolios[k].label || AI_INFO[k].label)}</b> ${esc(t.nom || t.symbol)} · ${eur(t.eur, 0)}${t.fee ? ' + ' + eur(t.fee, 2) + ' de frais' : ''}<button type="button" class="ia-x" data-ia-action="draft-remove" data-key="${k}" title="Retirer cet achat en attente" aria-label="Retirer">✕</button></span>`; }).join('')}</div>
    <div class="ia-form-actions"><button type="button" class="ia-btn ia-btn-primary" data-ia-action="drafts-commit" ${canEdit && !ui.commitBusy ? '' : 'disabled'}>${ui.commitBusy ? 'Enregistrement…' : (keys.length > 1 ? 'Enregistrer les ' + keys.length + ' achats d\'un coup' : 'Enregistrer cet achat')}</button>
      <button type="button" class="ia-btn" data-ia-action="drafts-clear">Tout retirer</button></div></div>`;
}
async function commitDrafts(){
  const keys = draftKeys();
  if (!keys.length || ui.commitBusy) return;
  ui.commitBusy = true; render();
  const stop = m => { ui.commitBusy = false; setMsg(m + ' Rien n\'a été enregistré.', 'err'); render(); };
  // Validation complète de CHAQUE portefeuille avant toute écriture : tout ou rien.
  const ctx = computed.ctx;
  const vctx = Object.assign({}, ctx, { prices: Object.assign({}, ctx.prices), events: Object.assign({}, ctx.events), fx: Object.assign({}, ctx.fx) });
  for (const k of keys) {
    const t = ui.drafts[k];
    vctx.prices[t.symbol] = await loadPrices(t.symbol); vctx.events[t.symbol] = await loadEvents(t.symbol);
    if (t.ccy !== 'EUR' && !vctx.fx[t.ccy]) vctx.fx[t.ccy] = await loadFx(t.ccy);
  }
  for (const k of keys) {
    const errors = validateTrades({ trades: trades(k).concat([ui.drafts[k]]) }, cfg(), vctx);
    if (errors.length) return stop((S.portfolios[k].label || AI_INFO[k].label) + ' : ' + errors[0]);
  }
  const res = await iaSave(next => { keys.forEach(k => next.portfolios[k].trades.push(ui.drafts[k])); });
  if (!res.ok) { if (res.conflict) await recompute(); return stop(res.error); }
  const names = keys.map(k => S.portfolios[k].label || AI_INFO[k].label).join(', ');
  keys.forEach(k => { delete ui.drafts[k]; });
  saveDrafts();
  ui.commitBusy = false;
  setMsg(keys.length + ' achat' + (keys.length > 1 ? 's' : '') + ' enregistré' + (keys.length > 1 ? 's' : '') + ' d\'un coup ✔ (' + names + ').', 'ok');
  await recompute();
  render();
  refreshLive();
}

/* ---------- miniature YouTube : UNE courbe, les 4 IA, leur logo au bout de chaque ligne ---------- */
// Petit visuel COMPACT (2000x1200) à poser dans un coin d'une miniature : pas d'axes, pas de date, pas de tableau,
// seulement des courbes épaisses + gros logos + gros pourcentages (lisibles même réduits à ~300 px de large).
// Deux variantes : fond transparent (à superposer dans l'éditeur de miniature) ou panneau sombre arrondi.
// Même fenêtre de temps que le graphique du Comparatif (bouton de plage sélectionné).
async function buildThumbnail(dark){
  const { i0 } = chartBase();
  const dates = computed.dates.slice(i0);
  const series = AI_KEYS.map(k => ({ key: k, vals: computed.byKey[k].perf.slice(i0) }));
  const all = [];
  series.forEach(sr => sr.vals.forEach(v => { if (v != null && isFinite(v)) all.push(v); }));
  if (!all.length || dates.length < 2) return null;
  const logos = await Promise.all(AI_KEYS.map(k => loadImg(AI_INFO[k].logo)));
  const W = 1000, H = 600, SC = 2;
  const cv = document.createElement('canvas'); cv.width = W * SC; cv.height = H * SC;
  const c = cv.getContext('2d');
  c.scale(SC, SC);
  const font = "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif";
  if (dark) {
    c.save();
    c.beginPath(); c.roundRect(0, 0, W, H, 40); c.clip();
    c.fillStyle = '#0D1013'; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W * 0.85, -40, 0, W * 0.85, -40, 620);
    g.addColorStop(0, 'rgba(139,127,232,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.restore();
  }
  const R_LOGO = 50, L = 36, R = W - 400, T = 40, B = H - 40;
  let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const span = Math.max(hi - lo, 1), pad = span * 0.08;
  lo -= pad; hi += pad;
  const X = i => L + (R - L) * i / (dates.length - 1);
  const Y = v => B - (B - T) * (v - lo) / (hi - lo);
  // seul repère : la ligne du 0 %
  c.strokeStyle = 'rgba(233,235,238,0.6)'; c.lineWidth = 3; c.setLineDash([14, 12]);
  c.beginPath(); c.moveTo(L, Y(0)); c.lineTo(R, Y(0)); c.stroke(); c.setLineDash([]);
  // courbes épaisses
  const ends = [];
  series.forEach(sr => {
    const col = AI_INFO[sr.key].color;
    c.strokeStyle = col; c.lineWidth = 11; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    let started = false, lastI = -1, count = 0;
    sr.vals.forEach((v, i) => {
      if (v == null || !isFinite(v)) return;
      if (!started) { c.moveTo(X(i), Y(v)); started = true; } else c.lineTo(X(i), Y(v));
      lastI = i; count++;
    });
    c.stroke();
    if (lastI >= 0) ends.push({ key: sr.key, x: X(lastI), y: Y(sr.vals[lastI]), v: sr.vals[lastI], count });
  });
  // étiquettes de fin : gros logo + gros pourcentage, espacées pour ne jamais se chevaucher
  ends.sort((a, b) => a.y - b.y);
  const GAP = R_LOGO * 2 + 14, top0 = T + R_LOGO, bottom0 = B - R_LOGO;
  const ly = ends.map(e => Math.min(Math.max(e.y, top0), bottom0));
  for (let i = 1; i < ly.length; i++) if (ly[i] - ly[i - 1] < GAP) ly[i] = ly[i - 1] + GAP;
  const over = ly.length ? ly[ly.length - 1] - bottom0 : 0;
  if (over > 0) for (let i = 0; i < ly.length; i++) ly[i] -= over;
  ends.forEach((e, i) => {
    const col = AI_INFO[e.key].color, y = ly[i], lx = R + 30 + R_LOGO;
    c.strokeStyle = col; c.globalAlpha = 0.6; c.lineWidth = 5;
    c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(lx - R_LOGO, y); c.stroke(); c.globalAlpha = 1;
    c.fillStyle = col; c.beginPath(); c.arc(e.x, e.y, 13, 0, Math.PI * 2); c.fill();
    c.save(); c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 14;
    c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(lx, y, R_LOGO, 0, Math.PI * 2); c.fill(); c.restore();
    c.lineWidth = 7; c.strokeStyle = col; c.beginPath(); c.arc(lx, y, R_LOGO, 0, Math.PI * 2); c.stroke();
    const img = logos[AI_KEYS.indexOf(e.key)], ir = R_LOGO - 13;
    if (img) c.drawImage(img, lx - ir, y - ir, ir * 2, ir * 2);
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = `800 56px ${font}`;
    const txt = (e.v > 0 ? '+' : '') + numFr(e.v, 1) + ' %';
    c.save(); c.shadowColor = 'rgba(0,0,0,0.75)'; c.shadowBlur = 10; c.lineJoin = 'round'; c.lineWidth = 10;
    c.strokeStyle = 'rgba(13,16,19,0.85)'; c.strokeText(txt, lx + R_LOGO + 16, y);
    c.restore();
    c.fillStyle = e.v >= 0 ? '#4FD1A5' : '#FF6B73';
    c.fillText(txt, lx + R_LOGO + 16, y);
  });
  return cv.toDataURL('image/png');
}
async function exportThumbnail(){
  if (!computed) return;
  let urlT, urlD;
  try { urlT = await buildThumbnail(false); urlD = urlT ? await buildThumbnail(true) : null; }
  catch (e) { setMsg('Miniature impossible : ' + (e.message || e), 'err'); render(); return; }
  if (!urlT) { setMsg('Pas encore de courbe à exporter : enregistre au moins un achat (2 jours de données).', 'err'); render(); return; }
  const old = document.getElementById('iaThumbModal');
  if (old) old.remove();
  const m = document.createElement('div');
  m.id = 'iaThumbModal'; m.className = 'ia-thumb-modal';
  m.innerHTML = `<div class="ia-thumb-hint">Visuel compact à poser sur ta miniature (2000 × 1200 px) — aperçu sur damier = fond transparent</div>
    <img src="${urlT}" alt="Miniature" class="ia-thumb-img">
    <div class="ia-form-actions"><button type="button" class="ia-btn ia-btn-primary" data-t="dl-t">⬇ Fond transparent</button><button type="button" class="ia-btn ia-btn-primary" data-t="dl-d">⬇ Fond sombre</button><button type="button" class="ia-btn" data-t="close">Fermer</button></div>`;
  document.body.appendChild(m);
  const save = (url, suffix) => { const a = document.createElement('a'); a.href = url; a.download = 'miniature-portefeuille-ia-' + suffix + '-' + isoToday() + '.png'; document.body.appendChild(a); a.click(); a.remove(); };
  m.addEventListener('click', ev => {
    const t = ev.target.closest('[data-t]');
    const k = t && t.dataset.t;
    if (k === 'dl-t') save(urlT, 'transparent');
    else if (k === 'dl-d') save(urlD, 'sombre');
    else if (k === 'close' || ev.target === m) m.remove();
  });
}

/* ---------- graphiques ---------- */
// Point de départ du graphique. Tant que l'expérience a moins de 2 jours, on n'a rien à comparer
// entre IA : on affiche alors ~3 mois de S&P 500 seul ("aperçu"), pour que le graphique existe dès le début.
function chartBase(){
  const dates = computed.dates, n = dates.length, s = computed.originIdx;
  let i0 = s;
  if (range !== 'all') {
    const days = { '1m': 30, '3m': 91, '6m': 182, '1y': 365 }[range] || 0;
    const i = dates.findIndex(d => d >= addDays(isoToday(), -days));
    i0 = Math.max(i < 0 ? 0 : i, s);
  }
  if (n - i0 < 2) i0 = Math.max(0, n - 2);   // tout début : au moins deux points pour tracer une courbe
  return { i0, preview: false };
}
// Configuration Chart.js du comparatif, partagée par l'affichage écran et l'export image
// (l'export dessine sur un canvas hors-écran de taille fixe : indépendant de la mise en page).
function compareChartConfig(forExport){
  const { i0 } = chartBase();
  const labels = computed.dates.slice(i0);
  const win = arr => arr ? arr.slice(i0) : null;
  const T = (typeof THEME !== 'undefined') ? THEME : { dim: '#8B93A0', hair: '#262E36' };
  const lw = forExport ? 3 : 2;
  const datasets = PF_KEYS.map(k => ({ label: S.portfolios[k].label || AI_INFO[k].label, data: win(computed.byKey[k].perf), borderColor: AI_INFO[k].color, backgroundColor: AI_INFO[k].color, borderWidth: k === SP_KEY ? lw + 1 : lw, borderDash: k === SP_KEY ? [6, 4] : undefined, pointRadius: 0, pointHoverRadius: 4, tension: 0.15, spanGaps: false }));
  // Tant que le portefeuille S&P 500 n'a rien investi, on trace l'indice lui-même (repère) pour que la courbe existe.
  if (!(computed.byKey[SP_KEY].metrics.investedTotal > 0) && computed.benchPerf) {
    const i = datasets.findIndex((d, idx) => PF_KEYS[idx] === SP_KEY);
    datasets[i] = { label: 'S&P 500 (indice, en attente de ton 1er versement)', data: win(computed.benchPerf), borderColor: '#E9EBEE', backgroundColor: '#E9EBEE', borderWidth: lw, borderDash: [2, 4], pointRadius: 0, pointHoverRadius: 4, tension: 0.15 };
  }
  const fs = forExport ? 16 : 12;
  const pctTick = v => (v >= 0 ? '+' : '') + numFr(v, 1) + ' %';
  return {
    labels, datasets, preview: false,
    config: {
      type: 'line', data: { labels, datasets },
      options: Object.assign({
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: T.dim, usePointStyle: true, boxWidth: 8, font: { size: fs } } }, tooltip: { callbacks: { title: it => fmtDate(it[0].label), label: it => ' ' + it.dataset.label + ' : ' + (it.parsed.y >= 0 ? '+' : '') + numFr(it.parsed.y, 2) + ' %' } } },
        scales: { x: { grid: { display: false }, ticks: { color: T.dim, maxTicksLimit: 8, font: { size: fs }, callback: function (v) { return fmtDate(this.getLabelForValue(v)); } }, border: { color: T.hair } },
                  y: { grid: { color: T.hair, drawTicks: false }, ticks: { color: T.dim, font: { size: fs }, callback: pctTick }, border: { display: false } } }
      }, forExport ? { responsive: false, animation: false, devicePixelRatio: 1 } : { responsive: true, maintainAspectRatio: false })
    }
  };
}
async function drawCompareChart(){
  const canvas = document.getElementById('iaCompareChart');
  if (!canvas) return;
  const ok = g('ensureChartJs') ? await g('ensureChartJs')() : !!window.Chart;
  if (!ok || !window.Chart || document.getElementById('iaCompareChart') !== canvas) return;
  const { labels, config } = compareChartConfig(false);
  if (labels.length < 2) { canvas.parentElement.innerHTML = '<div class="objectifs-empty">Le graphique apparaîtra dès que l\'expérience aura au moins deux jours de données.</div>'; return; }
  charts.compare = new Chart(canvas, config);
}
async function drawDonut(key){
  const canvas = document.getElementById('iaDonut');
  if (!canvas) return;
  const ok = g('ensureChartJs') ? await g('ensureChartJs')() : !!window.Chart;
  if (!ok || !window.Chart || document.getElementById('iaDonut') !== canvas) return;
  const now = computed.byKey[key].now;
  const T = (typeof THEME !== 'undefined') ? THEME : { dim: '#8B93A0' };
  const colors = ['#D9A441', '#4A9FE0', '#4FD1A5', '#8B7FE8', '#F0C877', '#E5636B', '#7FB8E8', '#B8A9FF'];
  const labels = now.positions.map(p => p.nom).concat(['Cash']);
  const data = now.positions.map(p => p.valueEur).concat([Math.max(0, now.cash)]);
  charts.donut = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: now.positions.map((p, i) => colors[i % colors.length]).concat(['#5C6470']), borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: T.dim, usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: it => ' ' + it.label + ' : ' + eur(it.parsed, 0) } } } }
  });
}

/* ---------- actualisation des données FMP (bouton) ---------- */
async function readRefreshStatus(){ return await fetchJson('data/portefeuille-ia/refresh-status.json'); }
function setRefreshStatusUi(){
  const el = document.getElementById('iaRefreshStatus');
  if (el) el.innerHTML = refreshStatusHtml();
}
async function pollRefresh(){
  clearTimeout(refreshPoll);
  const st = await readRefreshStatus();
  if (st) { refreshInfo = st; setRefreshStatusUi(); }
  if (st && st.state === 'running') { refreshPoll = setTimeout(pollRefresh, 3000); return; }
  if (st && (st.state === 'ok' || st.state === 'error')) {
    if (st.state === 'ok') { clearMarketCache(); await recompute(); }
    softRender();
  }
}
async function startRefresh(prefix){
  if (!serverOk || loadError) return;
  let res, j = {};
  try {
    res = await fetch('/api/ia/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' }, body: '{}' });
    j = await res.json().catch(() => ({}));
  } catch (e) { setMsg('Serveur local injoignable : actualisation impossible.', 'err'); render(); return; }
  if (res.status === 409) { setMsg('Une actualisation est déjà en cours.', 'ok'); }
  else if (res.status === 429) { setMsg((prefix ? prefix + ' ' : '') + 'Une actualisation vient de se terminer : patiente une minute avant de relancer.', prefix ? 'ok' : 'err'); render(); return; }
  else if (!res.ok) { setMsg('Actualisation refusée : ' + (j.error || ('HTTP ' + res.status)), 'err'); render(); return; }
  else setMsg((prefix ? prefix + ' ' : '') + 'Actualisation lancée : cours, splits, changes et S&P 500 des titres détenus.', 'ok');
  refreshInfo = { state: 'running', done: 0, total: 0 };
  render();
  refreshPoll = setTimeout(pollRefresh, 1500);
}
// Les dividendes ne sont connus que via les fichiers FMP : à l'ouverture de l'onglet, si des titres sont
// détenus et que la dernière actualisation réussie a plus de 24 h, on la relance automatiquement.
let autoRefreshChecked = false;
async function maybeAutoRefresh(){
  if (autoRefreshChecked || !serverOk || loadError || !computed) return;
  autoRefreshChecked = true;
  const st = await readRefreshStatus();
  if (st && st.state === 'running') return;
  const last = st && st.state === 'ok' && st.finishedAt ? new Date(st.finishedAt).getTime() : 0;
  if (Date.now() - last > 24 * 3600 * 1000) await startRefresh('Actualisation quotidienne automatique (cours, splits, S&P 500).');
}
async function checkRefreshStatus(){
  const st = await readRefreshStatus();
  if (!st) return;
  refreshInfo = st;
  const age = st.updatedAt ? Date.now() - new Date(st.updatedAt).getTime() : Infinity;
  if (st.state === 'running' && age < 15 * 60 * 1000) refreshPoll = setTimeout(pollRefresh, 2000);
  else if (st.state === 'running') refreshInfo = null;   // reste d'un processus interrompu
}

/* ---------- export image (classement + graphique) pour les vidéos ---------- */
function loadImg(src){ return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
async function exportImage(){
  if (!computed) return;
  const W = 1400, H = 980;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const font = "'Plus Jakarta Sans', sans-serif";
  c.fillStyle = '#0D1013'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#E9EBEE'; c.font = `700 34px ${font}`; c.fillText('Portefeuille IA — qui investit le mieux ?', 50, 66);
  c.fillStyle = '#8B93A0'; c.font = `500 18px ${font}`;
  c.fillText(`${fmtDate(cfg().dateDepart)} → ${fmtDate(isoToday())} · performance de l'argent investi, frais inclus, en euros`, 50, 98);
  const rows = PF_KEYS.map(k => ({ k, m: computed.byKey[k].metrics })).sort((a, b) => (b.m.perfInv == null ? -Infinity : b.m.perfInv) - (a.m.perfInv == null ? -Infinity : a.m.perfInv));
  const imgs = await Promise.all(rows.map(r => loadImg(AI_INFO[r.k].logo)));
  rows.forEach((r, i) => {
    const y = 130 + i * 74;
    c.fillStyle = '#151A1F'; c.fillRect(50, y, 1300, 62);
    c.fillStyle = '#D9A441'; c.font = `700 26px ${font}`; c.fillText(String(i + 1), 72, y + 41);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(144, y + 31, 22, 0, Math.PI * 2); c.fill();
    if (imgs[i]) c.drawImage(imgs[i], 126, y + 13, 36, 36);
    c.fillStyle = '#E9EBEE'; c.font = `700 24px ${font}`; c.fillText(S.portfolios[r.k].label || AI_INFO[r.k].label, 190, y + 40);
    c.textAlign = 'right';
    c.font = `700 26px ${font}`; c.fillStyle = '#E9EBEE'; c.fillText(r.m.investedTotal > 0 ? eur(r.m.investedTotal, 0) + ' investis' : 'rien investi', 1010, y + 41);
    c.fillStyle = (r.m.gainInv || 0) >= 0 ? '#4FD1A5' : '#E5636B'; c.fillText(r.m.perfInv == null ? 'N/D' : pct(r.m.perfInv, 2), 1190, y + 41);
    c.font = `500 18px ${font}`; c.fillStyle = '#8B93A0'; c.fillText(r.m.nPositions + ' pos.', 1330, y + 40);
    c.textAlign = 'left';
  });
  const okChart = g('ensureChartJs') ? await g('ensureChartJs')() : !!window.Chart;
  if (okChart && window.Chart) {
    const { labels, config } = compareChartConfig(true);
    if (labels.length >= 2) {
      const oc = document.createElement('canvas'); oc.width = 1300; oc.height = 420;
      const tmp = new Chart(oc, config);
      const ci = await loadImg(oc.toDataURL('image/png'));
      tmp.destroy();
      if (ci) c.drawImage(ci, 50, 510, 1300, 420);
    }
  }
  c.fillStyle = '#5C6470'; c.font = `500 15px ${font}`;
  c.fillText('Wolf Analysis · simulation pédagogique, pas un conseil en investissement. Portefeuille S&P 500 = ETF distribuant, dividendes non comptés.', 50, 962);
  const a = document.createElement('a');
  a.href = cv.toDataURL('image/png'); a.download = 'portefeuille-ia-' + isoToday() + '.png';
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- événements ---------- */
async function onClick(ev){
  const el = ev.target.closest('[data-ia-action]');
  if (!el || el.disabled) return;
  const a = el.dataset.iaAction;
  switch (a) {
    case 'tab': view = el.dataset.key; ui.form = null; ui.histAll = false; ui.voidConfirm = null; render(); break;
    case 'range': range = el.dataset.r; render(); break;
    case 'msg-close': ui.msg = null; render(); break;
    case 'backup-toggle': ui.showBackup = !ui.showBackup; render(); break;
    case 'backup-download': await downloadBackup(); break;
    case 'settings-toggle': ui.showSettings = !ui.showSettings; render(); break;
    case 'settings-save': await saveSettings(); break;
    case 'refresh': await startRefresh(); break;
    case 'live-refresh': Object.keys(live.quotes).forEach(k => { live.quotes[k].fetchedAt = 0; }); Object.keys(live.fx).forEach(k => { if (k.indexOf('_t_') === 0) live.fx[k].at = 0; }); refreshLive(); break;
    case 'export-img': await exportImage(); break;
    case 'thumb': await exportThumbnail(); break;
    case 'buy-open': await openForm('BUY', view, el.dataset.sym || null); break;
    case 'sell-open': await openForm('SELL', view, el.dataset.sym); break;
    case 'buy-more': await openForm('BUY', view, el.dataset.sym); { const b = document.getElementById('iaFormBox'); if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); } break;
    case 'void-toggle': ui.hideVoid = !ui.hideVoid; render(); break;
    case 'form-cancel': ui.form = null; renderForm(); break;
    case 'form-change-sym': if (ui.form) { Object.assign(ui.form, { sym: null, name: '', px: '', pxManual: false, warn: null, error: null }); renderForm(); const i = document.querySelector('#iaFormBox input[data-ia-field="f-q"]'); if (i) i.focus(); } break;
    case 'buy-pick': if (ui.form) { ui.form.sym = el.dataset.sym; ui.form.name = el.dataset.name; await refreshFormQuote(); } break;
    case 'sell-pct': if (ui.form) { const p = +el.dataset.p; const pos = heldPosition(ui.form.key, ui.form.sym); ui.form.sellAll = p === 100; ui.form.qty = pos ? String(+(pos.qty * p / 100).toFixed(6)) : ''; renderForm(); } break;
    case 'form-submit': await submitForm(false); break;
    case 'form-stash': await submitForm(true); break;
    case 'draft-remove': if (ui.drafts) { delete ui.drafts[el.dataset.key]; saveDrafts(); render(); } break;
    case 'drafts-clear': ui.drafts = {}; saveDrafts(); render(); break;
    case 'drafts-commit': await commitDrafts(); break;
    case 'hist-more': ui.histAll = true; render(); break;
    case 'edit-buy': openEditBuy(view, el.dataset.id); break;
    case 'del':
      if (ui.voidConfirm === el.dataset.id) await deleteTrade(view, el.dataset.id);
      else { ui.voidConfirm = el.dataset.id; render(); }
      break;
    case 'div-open': await openDivForm(view, el.dataset.sym, {}); { const b = document.getElementById('iaFormBox'); if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); } break;
    case 'div-fill': await openDivForm(view, el.dataset.sym, { date: el.dataset.date, perShare: el.dataset.ps, refEx: el.dataset.ex }); { const b = document.getElementById('iaFormBox'); if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); } break;
  }
}
function onInput(ev){
  const el = ev.target.closest('[data-ia-field]');
  const f = ui.form;
  if (!el || !f) return;
  const k = el.dataset.iaField;
  if (k === 'f-q') { f.q = el.value; renderSuggestions(); return; }
  if (k === 'f-note') { f.note = el.value; return; }
  if (k === 'f-eur') f.eur = el.value;
  if (k === 'f-px') { f.px = el.value; f.pxManual = true; f.pxEdited = true; }
  if (k === 'f-fee') { f.fee = el.value; f.feeManual = true; }
  if (k === 'f-ps') f.perShare = el.value;
  if (k === 'f-qty') { f.qty = el.value; if (f.type === 'DIV') f.qtyManual = true; else f.sellAll = false; }
  updatePreviewOnly();
}
function updatePreviewOnly(){
  const f = ui.form;
  if (!f) return;
  const calc = formCalc(f);
  const pv = document.querySelector('#iaFormBox .ia-form-preview');
  const btn = document.querySelector('#iaFormBox [data-ia-action="form-submit"]');
  if (btn) btn.disabled = !calc.ok || f.busy;
  const html = previewHtml(f, calc);
  const fi = document.querySelector('#iaFormBox [data-ia-field="f-fee"]');
  if (fi && !f.feeManual) fi.value = f.fee || '';
  if (pv) pv.innerHTML = html; else if (calc.ok) renderForm();
}
async function onChange(ev){
  const el = ev.target.closest('[data-ia-field="f-date"]');
  if (!el || !ui.form) return;
  if (!el.value) return;
  ui.form.date = el.value;
  if (ui.form.type === 'DIV') await refreshDivFx(); else await refreshFormQuote();
}
async function saveSettings(){
  const val = id => document.getElementById(id);
  const locked = PF_KEYS.some(k => trades(k).some(t => !t.void));
  const week = parseNum(val('iaSetWeek').value), cap = parseNum(val('iaSetCap').value), start = val('iaSetStart').value;
  if (!(week > 0)) { setMsg('Montant hebdomadaire invalide.', 'err'); render(); return; }
  if (!(cap > 0) || (!locked && !/^\d{4}-\d{2}-\d{2}$/.test(start))) { setMsg('Réserve de cash ou date de départ invalide.', 'err'); render(); return; }
  const models = {};
  document.querySelectorAll('[data-set-model]').forEach(i => { models[i.dataset.setModel] = i.value.trim(); });
  const strat = val('iaSetStrat').value;
  const sp = parseNum(val('iaSetSp').value);
  const feeFix = parseNum(val('iaSetFeeFix').value) || 0, feePct = parseNum(val('iaSetFeePct').value) || 0;
  if (feeFix < 0 || feePct < 0) { setMsg('Les frais ne peuvent pas être négatifs.', 'err'); render(); return; }
  if (sp == null || sp < 0) { setMsg('Versement mensuel du S&P 500 invalide (0 ou plus).', 'err'); render(); return; }
  const res = await iaSave(next => {
    next.config.montantHebdo = week; next.config.strategie = strat; next.config.sp500Mensuel = sp; next.config.dividendes = false;
    next.config.fraisFixes = feeFix; next.config.fraisPct = feePct;
    next.config.capitalInitial = cap;
    if (!locked) next.config.dateDepart = start;
    AI_KEYS.forEach(k => { next.portfolios[k].modele = models[k] || ''; });
  });
  setMsg(res.ok ? 'Réglages enregistrés ✔' : res.error, res.ok ? 'ok' : 'err');
  if (res.ok) ui.showSettings = false;
  await recompute();
  render();
}

/* ---------- démarrage ---------- */
let inited = false, initing = false;
async function onShow(){
  if (initing) return;
  initing = true;
  try {
    const page = document.getElementById(PAGE_ID);
    if (!page) return;
    if (!inited) {
      inited = true;
      loadDrafts();
      page.addEventListener('click', onClick);
      page.addEventListener('input', onInput);
      page.addEventListener('change', onChange);
      page.innerHTML = '<div class="objectifs-empty">Chargement du Portefeuille IA…</div>';
    }
    if (!ui.form) {                                  // ne jamais recharger sous les doigts pendant une saisie
      await iaPing();
      await iaLoad();
      await recompute();
      render();
      await checkRefreshStatus();
      refreshLive();
      maybeAutoRefresh();
    }
  } catch (e) {
    const page = document.getElementById(PAGE_ID);
    if (page) page.innerHTML = `<div class="ia-banner ia-banner-err"><b>Erreur d'affichage du Portefeuille IA.</b> ${esc(e && e.message ? e.message : e)}. Rien n'a été modifié dans tes données.</div>`;
    console.error('Portefeuille IA', e);
  } finally { initing = false; }
}
(function hookNavigation(){
  const orig = window.switchPage;
  if (typeof orig !== 'function') return;
  window.switchPage = function (pageId) {
    const r = orig.apply(this, arguments);
    if (pageId === PAGE_ID) onShow();
    return r;
  };
  const page = document.getElementById(PAGE_ID);
  if (page && page.classList.contains('active')) onShow();
})();
window.IA_UI = { getState: () => S, getComputed: () => computed, getCharts: () => charts, recompute, render, onShow };

})();
