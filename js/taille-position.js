/* ================================================================================================
   TAILLE DE POSITION SELON LE STOP (2026-11-15) — repris du prototype « Calculateur de taille de position »
   (https://claude.ai/artifact/GKJC757RZ512EwxyPPucUi, 06/11/2026), mêmes calculs et mêmes tests.
   ------------------------------------------------------------------------------------------------
   Principe : on décide d'abord combien on accepte de perdre (risque, ex. 50 €), puis la taille découle de la
   distance entre le prix d'entrée et le stop : stop proche = plus d'actions, stop loin = moins d'actions.
   Un plafond (montant maximum investi par position) évite qu'un stop très serré donne une position énorme.
   - window.RISK_ENGINE : moteur pur (sans DOM), tests dans tests/taille-position.test.html.
   - window.TAILLE_UI.open({ store }) : calculateur complet en fenêtre (entrées multiples, stop par entrée ou
     commun, glissement, gap, change, frais, risque de tout le portefeuille). store = { get(), set(state) }
     fourni par Mes portefeuilles : les positions du calculateur sont rangées dans portefeuilles.json (D.sizing.calc).
   - Utilisé aussi par la fenêtre d'achat de Mes portefeuilles (bloc « 📐 Taille de position selon le stop »).
   Conventions : fx = unités de la devise de cotation pour 1 unité de la devise du portefeuille (1 € = 1,16 $ -> 1,16).
   ================================================================================================ */
(function(){
'use strict';

/* ======================= MOTEUR DE CALCUL (pur, sans DOM) ======================= */
const RiskEngine = (() => {
  // Convertit une saisie en nombre, ou null si vide/incorrecte (jamais NaN).
  function n(v){
    if (v === '' || v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).replace(/[\s  ]/g, '').replace(',', '.');
    if (s === '' || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
    const x = parseFloat(s);
    return Number.isFinite(x) ? x : null;
  }
  // Arrondi À LA BAISSE au pas de quantité (1 = actions entières, 0.0001 = fractionnaires).
  function floorStep(q, step){
    if (!(q > 0)) return 0;
    const st = step > 0 ? step : 0.0001;
    const k = Math.floor(q / st + 1e-9);
    return Math.max(0, +(k * st).toFixed(10));
  }
  // riskMode 'eur' = risque fixe en euros par position (ex. 50 €) ; 'pct' = % d'un capital (comme le prototype).
  function settingsNums(s){
    return {
      riskMode: s.riskMode === 'pct' ? 'pct' : 'eur', riskEur: n(s.riskEur),
      capital: n(s.capital), riskPctPos: n(s.riskPctPos), riskPctPf: n(s.riskPctPf),
      cap: n(s.cap),
      slip: Math.max(0, n(s.slipPct) || 0), gap: Math.max(0, n(s.gapPct) || 0),
      fxStress: Math.max(0, n(s.fxStressPct) || 0),
      feeFixed: Math.max(0, n(s.feeFixed) || 0), feePct: Math.max(0, n(s.feePct) || 0),
      sizeOn: s.sizeOn === 'gap' ? 'gap' : 'inv'
    };
  }
  // Budget de risque d'une position (en devise du portefeuille), ou null s'il n'est pas calculable.
  function budgetOf(s){
    if (s.riskMode === 'pct') return s.capital > 0 && s.riskPctPos > 0 ? s.capital * s.riskPctPos / 100 : null;
    return s.riskEur > 0 ? s.riskEur : null;
  }
  function lotStep(pos){ return pos.lot === 'frac' ? 0.0001 : 1; }

  // Niveau de stop effectif d'une entrée (mode A individuel / B commun).
  function invOf(e, pos, P, errs){
    if (pos.mode === 'common'){
      const c = n(pos.commonInv);
      if (!(c > 0)) { errs.push('Stop commun manquant'); return null; }
      return c;
    }
    if (e.invType === 'pct'){
      const p = n(e.invValue);
      if (p === null) { errs.push('% du stop manquant'); return null; }
      if (p >= 100) { errs.push('% du stop ≥ 100 %'); return null; }
      return P > 0 ? P * (1 - p / 100) : null;
    }
    const v = n(e.invValue);
    if (!(v > 0)) { errs.push('Prix du stop manquant'); return null; }
    return v;
  }

  function entryCalc(e, pos, sRaw){
    const s = settingsNums(sRaw);
    const errs = [];
    const P = n(e.price);
    const fxNow = pos.ccy === pos.refCcy ? 1 : n(pos.fx);
    const fxE = pos.ccy === pos.refCcy ? 1 : (n(e.fx) ?? fxNow);
    if (!(P > 0)) errs.push("Prix d'achat manquant ou ≤ 0");
    if (!(fxNow > 0)) errs.push('Taux de change de la position manquant');
    if (!(fxE > 0)) errs.push("Taux de change de l'entrée manquant");
    let qty = null, cost = null;
    if (e.inputMode === 'qty'){
      const q = n(e.qty);
      if (!(q > 0)) errs.push('Quantité manquante ou ≤ 0');
      else { qty = q; if (P > 0 && fxE > 0) cost = q * P / fxE; }
    } else {
      const a = n(e.amount);
      if (!(a > 0)) errs.push('Montant investi manquant ou ≤ 0');
      else { cost = a; if (P > 0 && fxE > 0) qty = a * fxE / P; }
    }
    const inv = invOf(e, pos, P, errs);
    const feeIn = n(e.fee);
    if (feeIn !== null && feeIn < 0) errs.push('Frais négatifs');
    if (errs.length) return { ok: false, errs, qty, cost, inv, P };

    const buyFee = feeIn !== null ? feeIn : (s.feeFixed + s.feePct / 100 * cost);
    const fxX = fxNow * (1 + s.fxStress / 100);            // change défavorable à la sortie
    const exitPx = inv * (1 - s.slip / 100);                // stop + glissement
    const gapPx = Math.min(exitPx, inv * (1 - s.gap / 100)); // scénario gap (jamais meilleur que le cas normal)
    const resultAt = px => {
      const eur = qty * px / fxX;
      const sellFee = s.feeFixed + s.feePct / 100 * eur;
      return eur - cost - buyFee - sellFee;
    };
    const pnl = resultAt(exitPx), pnlGap = resultAt(gapPx);
    return {
      ok: true, errs: [], P, qty, cost, buyFee, inv, exitPx, gapPx, fxE, fxNow,
      distPct: (P - inv) / P * 100,
      above: inv >= P,
      pnl, pnlGap, loss: Math.max(0, -pnl), lossGap: Math.max(0, -pnlGap)
    };
  }

  // Calcul complet d'une position. overrides : {mode, commonInv} pour comparer les scénarios.
  function positionCalc(posIn, sRaw, overrides){
    const pos = Object.assign({}, posIn, overrides || {});
    const s = settingsNums(sRaw);
    const rows = (pos.entries || []).map(e => entryCalc(e, pos, sRaw));
    const ok = rows.filter(r => r.ok);
    const sum = f => ok.reduce((a, r) => a + f(r), 0);
    const qty = sum(r => r.qty);
    const invested = sum(r => r.cost);
    const fees = sum(r => r.buyFee);
    const pru = qty > 0 ? sum(r => r.qty * r.P) / qty : null;
    const gross = sum(r => r.loss);            // risque brut : seulement les pertes
    const net = sum(r => r.pnl);               // résultat net au stop
    const grossGap = sum(r => r.lossGap), netGap = sum(r => r.pnlGap);
    const fxNow = pos.ccy === pos.refCcy ? 1 : n(pos.fx);
    const cur = n(pos.current);
    const value = (cur > 0 && fxNow > 0) ? qty * cur / fxNow : null;
    const latent = value !== null ? value - invested - fees : null;
    const budget = budgetOf(s);
    const riskBase = s.sizeOn === 'gap' ? grossGap : gross;
    const available = budget !== null ? budget - riskBase : null;
    const consumed = budget ? riskBase / budget : null;
    const capLeft = s.cap > 0 ? s.cap - invested : null;
    const incomplete = rows.length > ok.length;
    let status = 'ok';
    if (consumed === null) status = 'na';
    else if (consumed > 1 + 1e-12) status = 'over';
    else if (consumed >= 0.8) status = 'warn';
    return { pos, rows, nOk: ok.length, incomplete, qty, invested, fees, pru, gross, net, grossGap, netGap,
             riskBase, cur, value, latent, budget, available, consumed, status, fxNow, capLeft };
  }

  // Taille maximale d'une nouvelle entrée sans dépasser le risque disponible NI le plafond.
  // Ne s'appuie JAMAIS sur les gains latents des entrées existantes (available vient du risque brut).
  // capLeft : montant encore investissable sous le plafond (undefined = plafond entier, null = pas de plafond).
  function sizeNewEntry(pos, sRaw, ne, available, capLeft){
    const s = settingsNums(sRaw);
    const errs = [];
    const P = n(ne.price);
    const fxNow = pos.ccy === pos.refCcy ? 1 : n(pos.fx);
    if (!(P > 0)) errs.push("Prix d'entrée manquant");
    if (!(fxNow > 0)) errs.push('Taux de change manquant');
    let inv = null;
    if (ne.invType === 'pct'){
      const p = n(ne.invValue);
      if (p === null) errs.push('Stop manquant');
      else if (p >= 100) errs.push('% du stop ≥ 100 %');
      else if (P > 0) inv = P * (1 - p / 100);
    } else {
      inv = n(ne.invValue);
      if (!(inv > 0)) { errs.push('Stop manquant'); inv = null; }
    }
    if (available === null || available === undefined || !Number.isFinite(available)) errs.push('Risque par position non renseigné');
    if (errs.length) return { ok: false, code: 'input', errs, qty: 0, amount: 0, inv };

    const capRoom = capLeft !== undefined ? capLeft : (s.cap > 0 ? s.cap : null);
    const fxX = fxNow * (1 + s.fxStress / 100);
    const exitPx = inv * (1 - s.slip / 100);
    const gapPx = Math.min(exitPx, inv * (1 - s.gap / 100));
    const X = s.sizeOn === 'gap' ? gapPx : exitPx;
    const fp = s.feePct / 100;
    // Perte par action (frais variables inclus) et frais fixes d'achat + de vente.
    const perShare = (P / fxNow) * (1 + fp) - (X / fxX) * (1 - fp);
    const fixed = 2 * s.feeFixed;
    const lossOf = q => q > 0 ? fixed + q * perShare : 0;
    const lossAt = (q, px) => { if (!(q > 0)) return 0; const eur = q * px / fxX; return Math.max(0, -(eur * (1 - fp) - s.feeFixed - (q * P / fxNow) * (1 + fp) - s.feeFixed)); };
    const base = { inv, exitPx, gapPx, P, fxNow, distPct: (P - inv) / P * 100, capRoom };
    const step = lotStep(pos);
    const qCapOf = () => capRoom === null ? Infinity : floorStep(capRoom / (P / fxNow), step);
    if (available <= 0) return Object.assign(base, { ok: true, code: 'consumed', qty: 0, amount: 0, loss: 0, lossGap: 0, available });
    if (capRoom !== null && capRoom <= 0) return Object.assign(base, { ok: true, code: 'cap', qty: 0, amount: 0, loss: 0, lossGap: 0, available });
    if (perShare <= 0){
      // Stop au-dessus du prix : le risque ne limite pas la taille ; seul le plafond s'applique s'il existe.
      if (capRoom === null) return Object.assign(base, { ok: true, code: 'unlimited', qty: null, amount: null, loss: 0, lossGap: 0, available });
      const q = qCapOf();
      return Object.assign(base, { ok: true, code: q > 0 ? 'ok' : 'lot', capped: true, qty: q, amount: q * P / fxNow, buyFee: s.feeFixed + fp * q * P / fxNow, loss: 0, lossGap: lossAt(q, gapPx), lossInv: 0, available });
    }
    const qMax = (available - fixed) / perShare;
    if (!(qMax > 0)) return Object.assign(base, { ok: true, code: 'fees', qty: 0, amount: 0, loss: 0, lossGap: 0, available });
    let q = floorStep(qMax, step);
    // Garde-fou : l'arrondi ne doit jamais faire dépasser le budget.
    let guard = 0;
    while (q > 0 && lossOf(q) > available + 1e-9 && guard++ < 1000) q = +(Math.max(0, q - step)).toFixed(10);
    const qRisk = q;
    const qCap = qCapOf();
    const capped = qCap < q;
    if (capped) q = qCap;
    if (q <= 0) return Object.assign(base, { ok: true, code: capped ? 'cap' : 'lot', qty: 0, amount: 0, loss: 0, lossGap: 0, available, qMax });
    return Object.assign(base, { ok: true, code: 'ok', qty: q, qMax, qRisk, capped, amount: q * P / fxNow,
      buyFee: s.feeFixed + fp * q * P / fxNow, loss: lossOf(q), lossGap: lossAt(q, gapPx), lossInv: lossAt(q, exitPx), available });
  }

  // Niveau de stop commun le plus bas qui garde le risque des entrées existantes dans le budget.
  function minCommonLevel(pos, sRaw){
    const s = settingsNums(sRaw);
    const budget = budgetOf(s);
    if (!budget) return null;
    const risk = L => positionCalc(pos, sRaw, { mode: 'common', commonInv: L }).riskBase;
    const test = positionCalc(pos, sRaw, { mode: 'common', commonInv: 1 });
    if (test.nOk === 0) return null;
    const prices = test.rows.filter(r => r.ok).map(r => r.P);
    let hi = Math.max(...prices) * 3, lo = 1e-9;
    if (risk(hi) > budget) return { level: null, budget };
    if (risk(lo) <= budget) return { level: 0, budget };
    for (let i = 0; i < 80; i++){ const m = (lo + hi) / 2; if (risk(m) <= budget) hi = m; else lo = m; }
    return { level: Math.ceil(hi * 100 - 1e-7) / 100, budget };   // arrondi au centime supérieur (côté prudent)
  }

  // Comparaison des deux choix de stop pour une nouvelle entrée envisagée.
  function compareScenarios(pos, sRaw, ne){
    const out = {};
    const neInv = sizeNewEntry(pos, sRaw, ne, 1).inv;
    const scen = { A: { mode: 'individual' }, B: { mode: 'common', commonInv: neInv } };
    for (const k of ['A', 'B']){
      const pc = positionCalc(pos, sRaw, scen[k]);
      const sz = sizeNewEntry(pos, sRaw, ne, pc.available, pc.capLeft);
      const after = pc.riskBase + (sz.code === 'ok' ? sz.loss : 0);
      out[k] = { pc, sz, level: k === 'B' ? neInv : null, after, afterPct: pc.budget ? after / pc.budget : null };
    }
    return out;
  }

  // Agrégation : jamais de compensation des gains d'une position avec les pertes d'une autre.
  function portfolioCalc(positions, sRaw){
    const s = settingsNums(sRaw);
    const list = positions.map(p => ({ p, c: positionCalc(p, sRaw) }));
    const gross = list.reduce((a, x) => a + x.c.gross, 0);
    const grossGap = list.reduce((a, x) => a + x.c.grossGap, 0);
    const lossNets = list.reduce((a, x) => a + Math.min(0, x.c.net), 0);
    const gainNets = list.reduce((a, x) => a + Math.max(0, x.c.net), 0);
    const budgetPf = s.capital > 0 && s.riskPctPf > 0 ? s.capital * s.riskPctPf / 100 : null;
    const base = s.sizeOn === 'gap' ? grossGap : gross;
    const group = key => {
      const m = {};
      list.forEach(x => { const g = (x.p[key] || '').trim() || 'Non renseigné'; (m[g] = m[g] || { name: g, n: 0, gross: 0 }); m[g].n++; m[g].gross += x.c.gross; });
      return Object.values(m).sort((a, b) => b.gross - a.gross);
    };
    return { list: list.sort((a, b) => b.c.gross - a.c.gross), gross, grossGap, lossNets, gainNets, budgetPf,
             pctCapital: s.capital > 0 ? gross / s.capital : null,
             consumed: budgetPf ? base / budgetPf : null, bySector: group('secteur'), byDriver: group('moteur') };
  }

  return { n, floorStep, entryCalc, positionCalc, sizeNewEntry, minCommonLevel, compareScenarios, portfolioCalc, settingsNums, budgetOf };
})();

/* ======================= TESTS (données d'essai, jamais tes positions) ======================= */
const RiskTests = (() => {
  const E = RiskEngine;
  const S0 = { riskMode: 'pct', capital: 30000, riskPctPos: 1, riskPctPf: 6, slipPct: 0, gapPct: 10, fxStressPct: 0, feeFixed: 0, feePct: 0, sizeOn: 'inv' };
  const S = o => Object.assign({}, S0, o || {});
  const P = o => Object.assign({ id: 't', nom: 'Test', ccy: 'USD', refCcy: 'EUR', fx: 1.1, lot: 'whole', mode: 'individual', commonInv: '', entries: [] }, o);
  const ent = o => Object.assign({ inputMode: 'amount', amount: '', qty: '', price: '', fee: '', fx: '', invType: 'price', invValue: '' }, o);
  const FX_RMD = 1.12279;
  const resmed = () => P({ nom: 'ResMed', ticker: 'RMD', fx: FX_RMD, entries: [
    ent({ price: 230, amount: 3000, invType: 'pct', invValue: 22 }),
    ent({ price: 230, amount: 3000, invType: 'pct', invValue: 22 }) ] });
  const T = [];
  const t = (name, fn) => T.push({ name, fn });
  const close = (a, b, tol, label) => { if (a === null || b === null || !(Math.abs(a - b) <= (tol ?? 0.01))) throw new Error(`${label || ''} attendu ${b}, obtenu ${a}`); };
  const is = (c, msg) => { if (!c) throw new Error(msg); };

  t('Entrée unique (USD, portefeuille EUR)', () => {
    const c = E.positionCalc(P({ entries: [ent({ price: 100, amount: 1000, invValue: 90 })] }), S());
    close(c.qty, 11, 1e-9, 'quantité'); close(c.gross, 100, 1e-9, 'risque'); close(c.net, -100, 1e-9, 'net');
  });
  t('Trois entrées de tailles différentes (montant et quantité)', () => {
    const c = E.positionCalc(P({ mode: 'common', commonInv: 90, entries: [
      ent({ price: 100, amount: 1000 }), ent({ price: 110, amount: 2000 }), ent({ price: 95, inputMode: 'qty', qty: 5 }) ] }), S());
    close(c.qty, 36, 1e-9, 'qté'); close(c.pru, 3775 / 36, 1e-9, 'PRU');
    close(c.invested, 3000 + 5 * 95 / 1.1, 1e-9, 'investi');
    close(c.gross, 100 + 2000 * (1 - 90 / 110) + 5 * 5 / 1.1, 1e-9, 'risque');
  });
  t('Stops par entrée (% et prix)', () => {
    const c = E.positionCalc(P({ entries: [
      ent({ price: 100, amount: 1000, invType: 'pct', invValue: 10 }),
      ent({ price: 110, amount: 2000, invType: 'price', invValue: 99 }),
      ent({ price: 95, inputMode: 'qty', qty: 5, invType: 'pct', invValue: 5 }) ] }), S());
    close(c.rows[0].inv, 90, 1e-9); close(c.rows[2].inv, 90.25, 1e-9);
    close(c.gross, 100 + 200 + 5 * 4.75 / 1.1, 1e-9, 'risque');
  });
  t('Stop commun appliqué à toutes les entrées', () => {
    const p = P({ entries: [ent({ price: 100, amount: 1000, invValue: 80 }), ent({ price: 110, amount: 1100, invValue: 80 })] });
    const a = E.positionCalc(p, S()), b = E.positionCalc(p, S(), { mode: 'common', commonInv: 95 });
    close(a.gross, 200 + 300, 1e-9, 'A'); close(b.gross, 50 + 1100 * (1 - 95 / 110), 1e-9, 'B');
    is(b.rows.every(r => r.inv === 95), 'niveau commun non appliqué');
  });
  t("Stop au-dessus du prix d'achat = gain, hors risque brut", () => {
    const c = E.positionCalc(P({ entries: [ent({ price: 100, amount: 1000, invValue: 105 }), ent({ price: 110, amount: 2000, invValue: 99 })] }), S());
    is(c.rows[0].above && c.rows[0].loss === 0, 'entrée 1 devrait être un gain');
    close(c.rows[0].pnl, 50, 1e-9, 'gain'); close(c.gross, 200, 1e-9, 'brut'); close(c.net, -150, 1e-9, 'net');
  });
  t('Les gains latents ne créent pas de budget supplémentaire', () => {
    const c = E.positionCalc(P({ entries: [ent({ price: 100, amount: 1000, invValue: 150 }), ent({ price: 110, amount: 2000, invValue: 99 })] }), S({ capital: 20000 }));
    close(c.available, 0, 1e-9, 'disponible');
    is(E.sizeNewEntry(c.pos, S({ capital: 20000 }), { price: 120, invType: 'pct', invValue: 10 }, c.available).qty === 0, 'aucune entrée attendue');
  });
  t('Budget entièrement consommé', () => {
    const st = S({ capital: 10000 });
    const c = E.positionCalc(P({ entries: [ent({ price: 100, amount: 1000, invValue: 90 })] }), st);
    close(c.available, 0, 1e-9); is(c.status === 'warn', 'statut attendu : limite');
    const sz = E.sizeNewEntry(c.pos, st, { price: 100, invType: 'pct', invValue: 5 }, c.available);
    is(sz.code === 'consumed' && sz.qty === 0 && sz.amount === 0, 'taille devrait être 0');
  });
  t('Budget dépassé : jamais de taille négative, dépassement visible', () => {
    const st = S({ capital: 5000 });
    const c = E.positionCalc(P({ entries: [ent({ price: 100, amount: 1000, invValue: 90 })] }), st);
    close(c.available, -50, 1e-9); is(c.status === 'over', 'statut attendu : dépassé');
    const sz = E.sizeNewEntry(c.pos, st, { price: 100, invType: 'pct', invValue: 5 }, c.available);
    is(sz.qty === 0 && sz.amount === 0 && sz.code === 'consumed', 'taille devrait être 0');
  });
  t('USD dans un portefeuille EUR + marge de change défavorable', () => {
    const p = P({ fx: FX_RMD, entries: [ent({ price: 230, amount: 3000, invType: 'pct', invValue: 22 })] });
    const c0 = E.positionCalc(p, S());
    close(c0.qty, 3000 * FX_RMD / 230, 1e-9, 'qté'); close(c0.gross, 660, 1e-9, 'risque sans stress');
    const c1 = E.positionCalc(p, S({ fxStressPct: 2 }));
    close(c1.gross, 3000 - (3000 * FX_RMD / 230) * 179.4 / (FX_RMD * 1.02), 1e-9, 'risque avec stress');
    is(c1.gross > c0.gross, 'le stress de change doit augmenter le risque');
  });
  t('Frais et glissement (calcul manuel)', () => {
    const st = S({ slipPct: 1, feeFixed: 2, feePct: 0.1 });
    const c = E.positionCalc(P({ fx: 1, ccy: 'EUR', entries: [ent({ price: 100, amount: 1000, invValue: 90 })] }), st);
    close(c.gross, 114.891, 1e-9, 'perte frais + glissement');
    const sz = E.sizeNewEntry(P({ fx: 1, ccy: 'EUR', lot: 'whole' }), st, { price: 50, invType: 'pct', invValue: 10 }, 200);
    is(sz.qty === 35, 'qté attendue 35, obtenue ' + sz.qty); close(sz.loss, 4 + 35 * 5.54455, 1e-9, 'perte');
    is(sz.loss <= 200, 'dépasse le budget');
  });
  t("Scénario gap : perte plus forte qu'au stop", () => {
    const c = E.positionCalc(P({ fx: 1, ccy: 'EUR', entries: [ent({ price: 100, amount: 1000, invValue: 90 })] }), S({ gapPct: 10 }));
    close(c.grossGap, 1000 - 10 * 81, 1e-9, 'perte gap'); is(c.grossGap > c.gross, 'gap doit être pire');
  });
  t('Valeurs manquantes ou incorrectes : pas de NaN, position signalée incomplète', () => {
    const c = E.positionCalc(P({ fx: '', entries: [ent({ price: 'abc', amount: -5, invType: 'pct', invValue: 150 }), ent({ price: 100, amount: 1000, invValue: 90 })] }), S());
    is(c.rows.every(r => !r.ok), 'les entrées devraient être refusées sans taux de change');
    is(c.incomplete && c.gross === 0 && !Number.isNaN(c.net), 'NaN ou incomplet non signalé');
    const c2 = E.positionCalc(P({ entries: [ent({ price: 100, amount: 1000, invType: 'pct', invValue: 150 })] }), S());
    is(!c2.rows[0].ok && c2.incomplete, '% ≥ 100 devrait être refusé');
    is(E.n('1 234,5') === 1234.5 && E.n('12abc') === null && E.n('') === null, 'lecture des nombres');
    const sz = E.sizeNewEntry(P({}), S(), { price: '', invType: 'pct', invValue: '' }, 100);
    is(!sz.ok && sz.qty === 0, 'saisie incomplète devrait donner 0');
  });
  t('Arrondis : 3 000 tirages aléatoires, jamais au-dessus du budget ni du plafond', () => {
    let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 3000; i++){
      const st = S({ slipPct: rnd() * 2, feeFixed: rnd() * 5, feePct: rnd() * 0.5, gapPct: rnd() * 20, fxStressPct: rnd() * 3, sizeOn: rnd() < .5 ? 'gap' : 'inv' });
      const pos = P({ fx: 0.5 + rnd(), lot: rnd() < .5 ? 'whole' : 'frac' });
      const avail = rnd() * 800 - 50;
      const capLeft = rnd() < .5 ? null : rnd() * 3000 - 100;
      const sz = E.sizeNewEntry(pos, st, { price: 1 + rnd() * 900, invType: 'pct', invValue: 1 + rnd() * 40 }, avail, capLeft);
      if (sz.qty !== null && sz.qty < 0) throw new Error('taille négative');
      if (sz.code === 'ok'){
        if (sz.loss > avail + 1e-9) throw new Error(`dépassement : ${sz.loss} > ${avail}`);
        if (capLeft !== null && sz.amount > capLeft + 1e-9) throw new Error(`plafond dépassé : ${sz.amount} > ${capLeft}`);
        if (pos.lot === 'whole' && Math.abs(sz.qty - Math.round(sz.qty)) > 1e-9) throw new Error('quantité non entière');
      } else if (avail <= 0 && sz.qty !== 0) throw new Error('budget nul mais taille > 0');
    }
  });
  t('ResMed — stops par entrée (−22 %)', () => {
    const c = E.positionCalc(resmed(), S());
    close(c.rows[0].qty, 3000 * FX_RMD / 230, 1e-9, 'qté'); close(c.rows[0].inv, 179.4, 1e-9, 'niveau');
    close(c.gross, 1320, 1e-9, 'risque brut'); close(c.net, -1320, 1e-9, 'net');
    close(c.budget, 300, 1e-9); close(c.available, -1020, 1e-9, 'disponible'); is(c.status === 'over', 'doit être dépassé');
    const sz = E.sizeNewEntry(c.pos, S(), { price: 236, invType: 'pct', invValue: 8 }, c.available);
    close(sz.inv, 217.12, 1e-9, 'stop entrée 3'); is(sz.qty === 0 && sz.code === 'consumed', 'aucune 3e entrée possible');
  });
  t('ResMed — stop commun à 217,12 $', () => {
    const cmp = E.compareScenarios(resmed(), S(), { price: 236, invType: 'pct', invValue: 8 });
    close(cmp.B.level, 217.12, 1e-9, 'niveau commun');
    close(cmp.B.pc.gross, 336, 1e-9, 'risque brut'); close(cmp.B.pc.available, -36, 1e-9, 'disponible');
    is(cmp.B.sz.qty === 0, 'aucune 3e entrée possible'); close(cmp.A.pc.gross, 1320, 1e-9, 'scénario A');
  });
  t('ResMed — stop commun minimal pour tenir dans 300 €', () => {
    const m = E.minCommonLevel(resmed(), S());
    close(m.level, 218.5, 0.005, 'niveau');
    close(E.positionCalc(resmed(), S(), { mode: 'common', commonInv: m.level }).gross, 300, 0.01, 'risque à ce niveau');
  });
  t('ResMed — 3e entrée seule avec 300 € de budget', () => {
    const whole = E.sizeNewEntry(P({ fx: FX_RMD, lot: 'whole' }), S(), { price: 236, invType: 'pct', invValue: 8 }, 300);
    is(whole.qty === 17, 'entières : 17 attendues, obtenu ' + whole.qty);
    close(whole.amount, 17 * 236 / FX_RMD, 1e-9, 'montant'); close(whole.loss, 17 * 236 * 0.08 / FX_RMD, 1e-9, 'perte');
    const frac = E.sizeNewEntry(P({ fx: FX_RMD, lot: 'frac' }), S(), { price: 236, invType: 'pct', invValue: 8 }, 300);
    is(frac.loss <= 300 && frac.loss > 299.99, 'fractionnaire : perte ' + frac.loss);
  });
  t('ResMed avec 0,5 % de glissement', () => {
    const c = E.positionCalc(resmed(), S({ slipPct: 0.5 }));
    close(c.gross, 2 * 3000 * (1 - 179.4 * 0.995 / 230), 1e-9, 'risque');
  });
  t("Portefeuille : les gains d'une position ne compensent pas le risque d'une autre", () => {
    const a = P({ id: 'a', secteur: 'Santé', entries: [ent({ price: 100, amount: 1000, invValue: 150 })] });
    const b = P({ id: 'b', secteur: 'Santé', entries: [ent({ price: 100, amount: 1000, invValue: 80 })] });
    const pf = E.portfolioCalc([a, b], S());
    close(pf.gross, 200, 1e-9, 'brut agrégé'); close(pf.lossNets, -200, 1e-9); close(pf.gainNets, 500, 1e-9);
    is(pf.bySector[0].name === 'Santé' && pf.bySector[0].n === 2, 'regroupement secteur');
  });
  // ----- ajouts 2026-11-15 : risque fixe en euros et plafond -----
  const EUR50 = o => S(Object.assign({ riskMode: 'eur', riskEur: 50 }, o || {}));
  const pe = o => P(Object.assign({ ccy: 'EUR', fx: 1 }, o || {}));
  t('Risque fixe 50 € : stop proche = plus d\'actions, stop loin = moins', () => {
    const near = E.sizeNewEntry(pe(), EUR50(), { price: 100, invType: 'price', invValue: 98 }, 50);
    const far = E.sizeNewEntry(pe(), EUR50(), { price: 100, invType: 'price', invValue: 90 }, 50);
    is(near.qty === 25 && far.qty === 5, `25 et 5 attendues, obtenu ${near.qty} et ${far.qty}`);
    close(near.loss, 50, 1e-9, 'perte stop proche'); close(far.loss, 50, 1e-9, 'perte stop loin');
    close(E.positionCalc(pe({ entries: [ent({ price: 100, amount: 500, invValue: 90 })] }), EUR50()).budget, 50, 1e-9, 'budget = 50 €');
  });
  t('Plafond 1 000 € : un stop très serré ne dépasse pas le plafond', () => {
    const sz = E.sizeNewEntry(pe(), EUR50({ cap: 1000 }), { price: 100, invType: 'price', invValue: 99 }, 50);
    is(sz.qRisk === 50 && sz.qty === 10 && sz.capped, `10 actions plafonnées attendues (50 au risque), obtenu ${sz.qty}`);
    close(sz.amount, 1000, 1e-9, 'montant'); close(sz.loss, 10, 1e-9, 'perte réelle au stop');
  });
  t('Plafond : ce qui est déjà investi compte', () => {
    const st = EUR50({ cap: 1000 });
    const c = E.positionCalc(pe({ entries: [ent({ price: 100, amount: 700, invValue: 99.5 })] }), st);
    close(c.capLeft, 300, 1e-9, 'reste sous le plafond');
    const sz = E.sizeNewEntry(c.pos, st, { price: 100, invType: 'price', invValue: 99 }, c.available, c.capLeft);
    is(sz.qty === 3 && sz.capped, '3 actions attendues, obtenu ' + sz.qty);
    const full = E.sizeNewEntry(c.pos, st, { price: 100, invType: 'price', invValue: 99 }, c.available, 0);
    is(full.code === 'cap' && full.qty === 0, 'plafond atteint : 0 attendu');
  });
  t('Stop au-dessus du prix avec plafond : taille = plafond', () => {
    const sz = E.sizeNewEntry(pe(), EUR50({ cap: 500 }), { price: 100, invType: 'price', invValue: 101 }, 50);
    is(sz.code === 'ok' && sz.qty === 5 && sz.capped, '5 actions attendues, obtenu ' + sz.qty);
  });

  function run(){
    return T.map(x => { try { x.fn(); return { name: x.name, ok: true }; } catch (e) { return { name: x.name, ok: false, msg: e.message }; } });
  }
  return { run };
})();

/* ======================= CALCULATEUR EN FENÊTRE ======================= */
const E = RiskEngine;
const CCY = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'JPY', 'DKK', 'SEK', 'NOK', 'AUD', 'HKD'];
const SYM = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', CAD: 'C$', JPY: '¥', DKK: 'kr', SEK: 'kr', NOK: 'kr', AUD: 'A$', HKD: 'HK$' };
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DEFAULT_SETTINGS = { riskMode: 'eur', riskEur: 50, cap: '', capital: '', refCcy: 'EUR', riskPctPos: 1, riskPctPf: 6, slipPct: 0, gapPct: 10, fxStressPct: 0, feeFixed: 0, feePct: 0, sizeOn: 'inv' };

let state = null, store = null, root = null, saveTimer = null, saveState = '', opts = {};
const S = () => state.settings;
const active = () => state.positions.find(p => p.id === state.activeId) || null;
const withRef = p => Object.assign({}, p, { refCcy: S().refCcy });
const fmt = (v, d = 2) => v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (v, d = 2) => v === null || v === undefined || !Number.isFinite(v) ? '—' : fmt(v, d) + ' ' + (SYM[S().refCcy] || S().refCcy);
const px = (v, ccy) => v === null || v === undefined || !Number.isFinite(v) ? '—' : fmt(v, 2) + ' ' + (SYM[ccy] || ccy);
const sgn = v => v === null || !Number.isFinite(v) ? '' : v > 0.004 ? 'tp-pos' : v < -0.004 ? 'tp-neg' : '';
const pct = (v, d = 1) => v === null || v === undefined || !Number.isFinite(v) ? '—' : fmt(v * 100, d) + ' %';
const qtyFmt = (q, pos) => q === null || q === undefined ? '—' : fmt(q, pos && pos.lot === 'frac' ? 4 : (Math.abs(q - Math.round(q)) < 1e-9 ? 0 : 4));
const statusOf = c => c === null ? 'na' : c > 1 + 1e-12 ? 'over' : c >= 0.8 ? 'warn' : 'ok';
const statusLabel = { ok: 'Budget respecté', warn: 'Proche de la limite', over: 'Budget dépassé', na: '—' };
const barColor = st => st === 'over' ? 'var(--red)' : st === 'warn' ? 'var(--gold)' : 'var(--green)';
const $ = id => root && root.querySelector('#' + id);

function fxFor(ccy){
  if (ccy === S().refCcy) return { v: 1, note: 'Même devise' };
  const v = opts.fx ? opts.fx(ccy) : null;
  return v ? { v: +v.toFixed(6), note: 'Taux TradingView (dernière clôture) — modifiable' } : { v: '', note: 'Taux à renseigner (aucun taux inventé)' };
}
function newEntry(o){ return Object.assign({ id: uid(), date: today(), price: '', inputMode: 'amount', amount: '', qty: '', fee: '', fx: '', invType: 'price', invValue: '' }, o || {}); }
function newPosition(o){
  const ccy = (o && o.ccy) || 'EUR';
  const fx = fxFor(ccy);
  return Object.assign({ id: uid(), nom: 'Nouvelle position', ticker: '', secteur: '', moteur: '', ccy, fx: fx.v, fxNote: fx.note, current: '', lot: 'whole',
    mode: 'individual', commonInv: '', invHistory: [], entries: [], ne: { price: '', invType: 'price', invValue: '' } }, o || {}, { fx: fx.v, fxNote: fx.note });
}

/* ---------- enregistrement (dans le fichier des portefeuilles, via Mes portefeuilles) ---------- */
function persist(){
  if (!store || !store.set){ saveState = 'mem'; paintSave(); return; }
  clearTimeout(saveTimer); saveState = 'pending'; paintSave();
  saveTimer = setTimeout(async () => {
    try { await store.set(JSON.parse(JSON.stringify(state))); saveState = 'ok'; }
    catch (e){ saveState = 'err:' + (e && e.message || 'refusé'); }
    paintSave();
  }, 1200);
}
function paintSave(){
  const el = $('tpSave'); if (!el) return;
  el.className = 'tp-save' + (saveState.startsWith('err') ? ' tp-neg' : '');
  el.textContent = saveState === 'pending' ? '… enregistrement' : saveState === 'ok' ? '💾 Enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : saveState === 'mem' ? (opts.memoNote || '⚠ Non enregistré (serveur local absent)') : saveState.startsWith('err') ? '⚠ ' + saveState.slice(4) : '';
}

/* ---------- paramètres ---------- */
function settingsHtml(){
  const s = S(), pctMode = s.riskMode === 'pct', ref = SYM[s.refCcy] || s.refCcy;
  const inp = (k, u, extra) => `<div class="tp-unit"><input inputmode="decimal" data-s="${k}" value="${esc(s[k])}" ${extra || ''}><span>${u}</span></div>`;
  const f = (label, ctl, hint) => `<label class="tp-f">${label}${ctl}${hint ? `<small>${hint}</small>` : ''}</label>`;
  return `<div class="tp-fields">
    ${f('Risque par position', `<select data-s="riskMode"><option value="eur" ${!pctMode ? 'selected' : ''}>Montant fixe (€)</option><option value="pct" ${pctMode ? 'selected' : ''}>% d'un capital</option></select>`)}
    ${pctMode ? f('Capital du portefeuille', inp('capital', ref)) + f('Risque max par position', inp('riskPctPos', '%')) : f('Perte acceptée au stop', inp('riskEur', ref), 'ex. 50 € par position')}
    ${f('Plafond par position', inp('cap', ref, 'placeholder="sans plafond"'), 'Montant investi maximum')}
    ${pctMode ? f('Risque max du portefeuille', inp('riskPctPf', '%')) : ''}
    ${f('Glissement à la sortie', inp('slipPct', '%'), 'Marge sous le stop')}
    ${f('Scénario gap défavorable', inp('gapPct', '%'), 'Sortie à X % sous le stop')}
    ${f('Marge de change défavorable', inp('fxStressPct', '%'), 'Baisse de la devise à la sortie')}
    ${f('Frais fixes par ordre', inp('feeFixed', ref))}
    ${f('Frais variables par ordre', inp('feePct', '%'))}
    ${f('Dimensionner sur', `<select data-s="sizeOn"><option value="inv" ${s.sizeOn !== 'gap' ? 'selected' : ''}>Stop + glissement</option><option value="gap" ${s.sizeOn === 'gap' ? 'selected' : ''}>Scénario gap (plus prudent)</option></select>`)}
    <div class="tp-f">Budget de risque par position<div class="tp-big" id="tpBudget"></div></div>
  </div>`;
}
function updateBudget(){
  const b = E.budgetOf(E.settingsNums(S()));
  const el = $('tpBudget'); if (el) el.textContent = b ? eur(b) : (S().riskMode === 'pct' ? 'Capital ou % manquant' : 'Montant manquant');
}

/* ---------- fenêtre ---------- */
function shellHtml(){
  return `<div class="tp-modal" role="dialog" aria-label="Calculateur de taille de position">
    <div class="tp-head"><div><h2>📐 Taille de position selon le stop</h2><p class="tp-dim">Tu fixes ce que tu acceptes de perdre ; la taille découle de la distance au stop.</p></div>
      <div class="tp-head-r"><span id="tpSave" class="tp-save"></span><button class="tp-x" data-tp-close title="Fermer (Échap)">✕</button></div></div>
    <div class="tp-tabs" id="tpTabs">
      <button class="tp-tab active" data-tab="position">Position</button>
      <button class="tp-tab" data-tab="portfolio">Risque du portefeuille</button>
      <button class="tp-tab" data-tab="tests">Tests des calculs</button>
    </div>
    <section id="tp-tab-position">
      <div class="tp-card"><h3 class="tp-h">Mes règles de risque</h3><div id="tpSettings"></div></div>
      <div class="tp-card"><div class="tp-row">
        <select id="tpPosSelect" style="max-width:300px"></select>
        <button data-tp="newpos">+ Nouvelle position</button>
        ${opts.held && opts.held.length ? `<select id="tpFromHeld" style="max-width:260px"><option value="">Partir d'une ligne détenue…</option>${opts.held.map((h, i) => `<option value="${i}">${esc(h.nom)}</option>`).join('')}</select>` : ''}
        <button data-tp="delpos" class="tp-danger" id="tpDelPos">Supprimer la position</button>
      </div></div>
      <div id="tpPosArea"></div>
    </section>
    <section id="tp-tab-portfolio" hidden></section>
    <section id="tp-tab-tests" hidden></section>
  </div>`;
}
function renderSettings(){ $('tpSettings').innerHTML = settingsHtml(); updateBudget(); }
function renderPosSelect(){
  const sel = $('tpPosSelect');
  sel.innerHTML = state.positions.length ? state.positions.map(p => `<option value="${p.id}" ${p.id === state.activeId ? 'selected' : ''}>${esc(p.nom)}${p.ticker ? ' (' + esc(p.ticker) + ')' : ''}</option>`).join('') : '<option>Aucune position</option>';
  $('tpDelPos').disabled = !active();
}
function renderPosition(){
  const area = $('tpPosArea');
  const p = active();
  if (!p){ area.innerHTML = `<div class="tp-card"><p class="tp-dim">Crée une position (« + Nouvelle position ») : prix d'entrée, stop, et le calculateur te donne le nombre d'actions.</p></div>`; return; }
  const sameCcy = p.ccy === S().refCcy;
  const sym = SYM[p.ccy] || p.ccy;
  const common = p.mode === 'common';
  area.innerHTML = `
  <div class="tp-card tp-next">
    <h3 class="tp-h">Combien acheter ?</h3>
    <div class="tp-fields" style="margin-bottom:12px">
      <label class="tp-f">Prix d'entrée envisagé<div class="tp-unit"><input inputmode="decimal" data-ne="price" value="${esc(p.ne.price)}"><span>${sym}</span></div></label>
      <label class="tp-f">Stop de cette entrée<div class="tp-unit"><select data-ne="invType" style="width:120px"><option value="price" ${p.ne.invType !== 'pct' ? 'selected' : ''}>Prix</option><option value="pct" ${p.ne.invType === 'pct' ? 'selected' : ''}>% sous le prix</option></select><input inputmode="decimal" data-ne="invValue" value="${esc(p.ne.invValue)}"></div></label>
    </div>
    <div id="tpSim"></div>
  </div>
  <div class="tp-kpis" id="tpKpis"></div>
  <div class="tp-card">
    <h3 class="tp-h">Position</h3>
    <div class="tp-fields">
      <label class="tp-f">Nom<input data-p="nom" value="${esc(p.nom)}"></label>
      <label class="tp-f">Ticker<input data-p="ticker" value="${esc(p.ticker)}"></label>
      <label class="tp-f">Secteur<input data-p="secteur" value="${esc(p.secteur)}"></label>
      <label class="tp-f">Moteur économique<input data-p="moteur" value="${esc(p.moteur)}" placeholder="ex. IA / data centers"></label>
      <label class="tp-f">Devise de cotation<select data-p="ccy">${CCY.map(c => `<option ${p.ccy === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="tp-f">Taux de change<div class="tp-unit"><span>1 ${S().refCcy} =</span><input inputmode="decimal" data-p="fx" value="${sameCcy ? 1 : esc(p.fx)}" ${sameCcy ? 'disabled' : ''}><span>${p.ccy}</span></div><small>${sameCcy ? 'Même devise' : esc(p.fxNote || 'Saisi à la main')}</small></label>
      <label class="tp-f">Cours actuel (facultatif)<div class="tp-unit"><input inputmode="decimal" data-p="current" value="${esc(p.current)}"><span>${sym}</span></div></label>
      <label class="tp-f">Quantités<select data-p="lot"><option value="whole" ${p.lot !== 'frac' ? 'selected' : ''}>Actions entières</option><option value="frac" ${p.lot === 'frac' ? 'selected' : ''}>Fractionnaires (0,0001)</option></select></label>
    </div>
  </div>
  <div class="tp-card">
    <h3 class="tp-h">Entrées déjà faites <span class="tp-faint" style="font-size:12px;font-weight:500">pour renforcer une position existante</span></h3>
    <div class="tp-row" style="margin-bottom:10px">
      <div class="tp-seg"><button data-mode="individual" class="${common ? '' : 'on'}">A · Un stop par entrée</button><button data-mode="common" class="${common ? 'on' : ''}">B · Stop commun</button></div>
      ${common ? `<label class="tp-f" style="flex-direction:row;align-items:center;gap:8px">Stop commun<div class="tp-unit"><input inputmode="decimal" style="width:110px" data-p="commonInv" data-invtrack="common" data-prev="${esc(p.commonInv)}" value="${esc(p.commonInv)}"><span>${sym}</span></div></label>` : ''}
    </div>
    ${p.entries.length ? `<div class="tp-tbl"><table class="tp-entries">
      <thead><tr><th>#</th><th>Date</th><th>Prix d'achat</th><th>Saisie</th><th>Montant / qté</th><th>Change à l'achat</th><th>Frais</th><th>Stop</th>
        <th class="num">Quantité</th><th class="num">Investi</th><th class="num">Niveau</th><th class="num">Distance</th><th class="num">Risque</th><th class="num">Résultat au stop</th><th class="num">Avec gap</th><th></th></tr></thead>
      <tbody>${p.entries.map((e, i) => entryRow(p, e, i, common, sym, sameCcy)).join('')}</tbody>
      <tfoot id="tpFoot"></tfoot>
    </table></div>` : '<p class="tp-dim" style="margin:0 0 8px">Aucune entrée : le calcul ci-dessus porte sur une nouvelle position.</p>'}
    <div class="tp-row" style="margin-top:10px"><button data-tp="addentry" ${p.entries.length >= 6 ? 'disabled' : ''}>+ Ajouter une entrée déjà faite</button><span class="tp-dim" id="tpEntryErr"></span></div>
    <div class="tp-notice" style="margin-top:10px">Les stops sont saisis par toi, d'après la structure du graphique. L'outil ne déplace jamais un stop tout seul, même si le cours monte.</div>
    <div id="tpInvHist"></div>
    <div id="tpCmpWrap"></div>
  </div>
  <div class="tp-card"><h3 class="tp-h">Carte des niveaux</h3><div id="tpViz"></div></div>
  <div class="tp-notice">Estimations théoriques. Un stop ne garantit jamais le prix : un gap d'ouverture ou un marché sans acheteurs peut faire perdre davantage que le risque affiché. Le scénario gap sert à mesurer ce cas.</div>`;
  renderComputed();
}
function entryRow(p, e, i, common, sym, sameCcy){
  const isQty = e.inputMode === 'qty';
  return `<tr>
    <td>${i + 1}</td>
    <td><input type="date" class="w-l" data-e="date" data-id="${e.id}" value="${esc(e.date)}"></td>
    <td><div class="tp-unit"><input inputmode="decimal" class="w-s" data-e="price" data-id="${e.id}" value="${esc(e.price)}"><span>${sym}</span></div></td>
    <td><select class="w-m" data-e="inputMode" data-id="${e.id}" data-rerender="1"><option value="amount" ${!isQty ? 'selected' : ''}>Montant</option><option value="qty" ${isQty ? 'selected' : ''}>Quantité</option></select></td>
    <td><div class="tp-unit"><input inputmode="decimal" class="w-s" data-e="${isQty ? 'qty' : 'amount'}" data-id="${e.id}" value="${esc(isQty ? e.qty : e.amount)}"><span>${isQty ? 'act.' : SYM[S().refCcy]}</span></div></td>
    <td><input inputmode="decimal" class="w-s" data-e="fx" data-id="${e.id}" value="${sameCcy ? '' : esc(e.fx)}" placeholder="${sameCcy ? '1' : esc(p.fx)}" ${sameCcy ? 'disabled' : ''}></td>
    <td><input inputmode="decimal" class="w-s" data-e="fee" data-id="${e.id}" value="${esc(e.fee)}" placeholder="auto"></td>
    <td>${common ? '<span class="tp-pill info">commun</span>' : `<div class="tp-unit"><select class="w-m" data-e="invType" data-id="${e.id}"><option value="price" ${e.invType !== 'pct' ? 'selected' : ''}>Prix</option><option value="pct" ${e.invType === 'pct' ? 'selected' : ''}>% sous</option></select><input inputmode="decimal" class="w-s" data-e="invValue" data-id="${e.id}" data-invtrack="${e.id}" data-prev="${esc(e.invValue)}" value="${esc(e.invValue)}"></div>`}</td>
    <td class="num" data-c="${e.id}-qty"></td><td class="num" data-c="${e.id}-cost"></td><td class="num" data-c="${e.id}-inv"></td><td class="num" data-c="${e.id}-dist"></td>
    <td class="num" data-c="${e.id}-loss"></td><td class="num" data-c="${e.id}-pnl"></td><td class="num" data-c="${e.id}-gap"></td>
    <td><button class="tp-danger" data-delentry="${e.id}" title="Retirer l'entrée">✕</button></td></tr>`;
}
function kpi(label, value, sub, cl){ return `<div class="tp-kpi ${cl || ''}"><div class="l">${label}</div><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`; }
function renderComputed(){
  updateBudget();
  const p = active(); if (!p) return;
  const pos = withRef(p), s = S();
  const c = E.positionCalc(pos, s);
  c.rows.forEach((r, i) => {
    const id = p.entries[i].id, set = (k, h) => { const el = root.querySelector(`[data-c="${id}-${k}"]`); if (el) el.innerHTML = h; };
    if (!r.ok){ ['qty', 'cost', 'inv', 'dist', 'loss', 'pnl', 'gap'].forEach(k => set(k, '<span class="tp-faint">—</span>')); set('loss', `<span class="tp-neg" title="${esc(r.errs.join(' · '))}">incomplet</span>`); return; }
    set('qty', qtyFmt(r.qty, { lot: 'frac' })); set('cost', eur(r.cost)); set('inv', px(r.inv, p.ccy));
    set('dist', r.above ? `<span class="tp-pos">+${fmt(-r.distPct, 1)} %</span>` : `−${fmt(r.distPct, 1)} %`);
    set('loss', r.loss > 0 ? `<span class="tp-neg">${eur(r.loss)}</span>` : '<span class="tp-faint">0</span>');
    set('pnl', `<span class="${sgn(r.pnl)}">${r.pnl > 0 ? '+' : ''}${eur(r.pnl)}</span>${r.above ? ' <span class="tp-pill ok">gain</span>' : ''}`);
    set('gap', `<span class="${sgn(r.pnlGap)}">${r.pnlGap > 0 ? '+' : ''}${eur(r.pnlGap)}</span>`);
  });
  const errs = c.rows.map((r, i) => r.ok ? null : `Entrée ${i + 1} : ${r.errs.join(', ')}`).filter(Boolean);
  const ee = $('tpEntryErr'); if (ee) ee.innerHTML = errs.length ? `<span class="tp-neg">${esc(errs.join(' · '))} — le risque affiché n'inclut pas ces entrées.</span>` : '';
  const foot = $('tpFoot');
  if (foot) foot.innerHTML = `<tr><td colspan="8" class="tp-dim">Total · PRU ${px(c.pru, p.ccy)}</td><td class="num">${qtyFmt(c.qty, { lot: 'frac' })}</td><td class="num">${eur(c.invested)}</td><td></td><td></td>
    <td class="num tp-neg">${eur(c.gross)}</td><td class="num ${sgn(c.net)}">${eur(c.net)}</td><td class="num ${sgn(c.netGap)}">${eur(c.netGap)}</td><td></td></tr>`;

  const sz = E.sizeNewEntry(pos, s, p.ne, c.available, c.capLeft);
  const st = c.status;
  const hasEntries = p.entries.length > 0;
  $('tpKpis').innerHTML = !hasEntries ? '' :
    kpi('Budget de risque', eur(c.budget), s.sizeOn === 'gap' ? 'comparé au scénario gap' : 'comparé au risque brut') +
    kpi('Risque brut de la position', `<span class="${c.gross > 0 ? 'tp-neg' : ''}">${eur(c.gross)}</span>`, `Avec gap : ${eur(c.grossGap)}${c.incomplete ? ' · <span class="tp-neg">entrées incomplètes</span>' : ''}`, st) +
    kpi('Résultat net au stop', `<span class="${sgn(c.net)}">${c.net > 0 ? '+' : ''}${eur(c.net)}</span>`, 'gains et pertes de toutes les entrées') +
    `<div class="tp-kpi ${st}"><div class="l">Budget consommé</div><div class="v">${pct(c.consumed, 0)}</div><div class="s"><span class="tp-pill ${st}">${statusLabel[st]}</span></div><div class="tp-bar"><i style="width:${Math.min(100, (c.consumed || 0) * 100)}%;background:${barColor(st)}"></i></div></div>` +
    kpi('Quantité détenue', qtyFmt(c.qty, { lot: 'frac' }), `PRU ${px(c.pru, p.ccy)}`) +
    kpi('Montant investi', eur(c.invested), c.capLeft !== null ? `reste ${eur(c.capLeft)} sous le plafond` : (c.fees ? `+ frais ${eur(c.fees)}` : 'hors frais')) +
    kpi('Valeur actuelle', eur(c.value), c.value === null ? 'renseigne le cours actuel' : `cours ${px(c.cur, p.ccy)}`) +
    kpi('Performance latente', c.latent === null ? '—' : `<span class="${sgn(c.latent)}">${c.latent > 0 ? '+' : ''}${eur(c.latent)}</span>`, c.latent === null ? '' : pct(c.latent / (c.invested + c.fees)));

  $('tpSim').innerHTML = simBox(sz, c, p);
  const cw = $('tpCmpWrap');
  if (cw) cw.innerHTML = hasEntries ? `<h3 class="tp-h" style="margin-top:14px">Comparer les deux choix de stop</h3><div class="tp-tbl" id="tpCmp"></div><div id="tpMin" style="margin-top:8px"></div>` : '';
  if (hasEntries){ renderCompare(pos, p); renderMinLevel(pos, p); }
  renderHistory(p);
  renderViz(c, sz, p);
}
function simBox(sz, c, p){
  if (!sz.ok) return `<div class="tp-notice">${esc(sz.errs.join(' · '))}</div>`;
  const head = p.entries.length
    ? `Risque disponible : <b class="${c.available < 0 ? 'tp-neg' : ''}">${eur(c.available)}</b> (budget ${eur(c.budget)} − risque brut ${eur(c.riskBase)}). Distance au stop : ${fmt(sz.distPct, 1)} %.`
    : `Risque accepté : <b>${eur(c.budget)}</b>${sz.capRoom !== null && sz.capRoom !== undefined ? ` · plafond ${eur(sz.capRoom)}` : ''}. Distance au stop : ${fmt(sz.distPct, 1)} %.`;
  let body;
  if (sz.code === 'consumed') body = `<div class="tp-alert"><b>Aucune nouvelle entrée ne respecte tes règles.</b> Le budget de risque de cette position est déjà ${c.available < 0 ? `dépassé de ${eur(-c.available)}` : 'entièrement consommé'}. Les gains latents des entrées précédentes ne comptent pas comme marge.</div>`;
  else if (sz.code === 'cap') body = `<div class="tp-alert"><b>Plafond atteint.</b> Le montant investi sur cette position a déjà atteint ton plafond.</div>`;
  else if (sz.code === 'unlimited') body = `<div class="tp-notice">Le stop est au-dessus du prix envisagé : à ce niveau, l'entrée sortirait en gain. Le risque ne limite pas la taille ; fixe un plafond pour en avoir une.</div>`;
  else if (sz.code !== 'ok') body = `<div class="tp-alert">Taille possible : 0. ${sz.code === 'fees' ? 'Les frais fixes dépassent le risque restant.' : 'Le risque restant ne permet même pas une action entière.'}</div>`;
  else body = `<div class="tp-okbox"><span class="tp-huge">${qtyFmt(sz.qty, p)} action${sz.qty > 1 ? 's' : ''}</span> <span class="tp-big2">soit ${eur(sz.amount)}</span> à ${px(sz.P, p.ccy)}<br>
    <span class="tp-dim">Perte si sortie au stop (${px(sz.exitPx, p.ccy)}) : <b>${eur(sz.loss)}</b> · avec gap (${px(sz.gapPx, p.ccy)}) : ${eur(sz.lossGap)}. Arrondi à la baisse : le budget n'est jamais dépassé.</span>
    ${sz.capped ? `<div class="tp-capnote">🧢 Plafond appliqué : le risque permettait ${qtyFmt(sz.qRisk, p)} actions (${eur(sz.qRisk * sz.P / sz.fxNow)}). Ta perte au stop est donc plus petite que ton risque accepté.</div>` : ''}
    <div class="tp-row" style="margin-top:8px"><button class="tp-primary" data-tp="usesize">Ajouter cette entrée à la position</button>${opts.onUse ? `<button data-tp="usebuy">↗ Saisir cet achat</button>` : ''}</div></div>`;
  return `<p class="tp-dim" style="margin:0 0 6px">${head}</p>${body}`;
}
function renderCompare(pos, p){
  const box = $('tpCmp');
  const cmp = E.compareScenarios(pos, S(), p.ne);
  if (!cmp.B.level){ box.innerHTML = '<p class="tp-dim">Saisis le prix et le stop de la prochaine entrée.</p>'; return; }
  const lvA = p.entries.map(e => e.invType === 'pct' ? `−${esc(e.invValue)} %` : px(E.n(e.invValue), p.ccy)).join(' / ') || '—';
  const r = (label, fa, fb) => `<tr><td class="tp-dim">${label}</td><td class="num">${fa}</td><td class="num">${fb}</td></tr>`;
  const sizeCell = x => x.sz.code === 'ok' ? `<b>${eur(x.sz.amount)}</b> · ${qtyFmt(x.sz.qty, p)} act.${x.sz.capped ? ' 🧢' : ''}` : x.sz.code === 'unlimited' ? 'non limitée' : x.sz.code === 'cap' ? '<span class="tp-neg">0 — plafond atteint</span>' : '<span class="tp-neg">0 — budget consommé</span>';
  const A = cmp.A, B = cmp.B;
  box.innerHTML = `<table><thead><tr><th></th><th class="num">A · Les entrées gardent leur stop</th><th class="num">B · Stop commun ${px(B.level, p.ccy)}</th></tr></thead><tbody>
    ${r('Stop des entrées existantes', lvA, px(B.level, p.ccy))}
    ${r('Risque brut des entrées existantes', `<span class="tp-neg">${eur(A.pc.gross)}</span>`, `<span class="tp-neg">${eur(B.pc.gross)}</span>`)}
    ${r('Résultat net au stop', `<span class="${sgn(A.pc.net)}">${eur(A.pc.net)}</span>`, `<span class="${sgn(B.pc.net)}">${eur(B.pc.net)}</span>`)}
    ${r('Risque disponible', `<span class="${A.pc.available < 0 ? 'tp-neg' : ''}">${eur(A.pc.available)}</span>`, `<span class="${B.pc.available < 0 ? 'tp-neg' : ''}">${eur(B.pc.available)}</span>`)}
    ${r('Taille max. de la nouvelle entrée', sizeCell(A), sizeCell(B))}
    ${r('Risque total après cette entrée', `${eur(A.after)} <span class="tp-pill ${statusOf(A.afterPct)}">${pct(A.afterPct, 0)}</span>`, `${eur(B.after)} <span class="tp-pill ${statusOf(B.afterPct)}">${pct(B.afterPct, 0)}</span>`)}
  </tbody></table>
  <p class="tp-faint" style="margin:6px 0 0;font-size:12px">Le choix B n'est jamais appliqué tout seul : pour l'adopter, passe en « B · Stop commun » et saisis le niveau.</p>`;
}
function renderMinLevel(pos, p){
  const m = E.minCommonLevel(pos, S());
  const el = $('tpMin'); if (!el) return;
  if (!m){ el.innerHTML = ''; return; }
  el.innerHTML = m.level === null ? `<div class="tp-alert">Même avec un stop très haut, les frais dépassent le budget.</div>`
    : `<div class="tp-notice">Pour que les entrées existantes tiennent dans le budget de ${eur(m.budget)}, un stop commun devrait être <b>au moins à ${px(m.level, p.ccy)}</b>. À ce niveau, il ne reste rien pour une nouvelle entrée. Ce n'est qu'un repère de calcul, pas un niveau technique.</div>`;
}
function renderHistory(p){
  const h = (p.invHistory || []).slice(-8).reverse();
  const el = $('tpInvHist'); if (!el) return;
  el.innerHTML = h.length ? `<h3 class="tp-h" style="margin-top:12px">Historique des changements de stop</h3><ul class="tp-hist">${h.map(x =>
    `<li>${esc(x.at.slice(0, 16).replace('T', ' '))} · ${esc(x.target)} : <b>${esc(x.from || '—')}</b> → <b>${esc(x.to || '—')}</b> · risque brut ${eur(x.riskFrom)} → <span class="${x.riskTo > x.riskFrom ? 'tp-neg' : 'tp-pos'}">${eur(x.riskTo)}</span> (${x.riskTo > x.riskFrom ? '+' : ''}${eur(x.riskTo - x.riskFrom)})${x.wider ? ' <span class="tp-pill warn">stop élargi</span>' : ''}</li>`).join('')}</ul>` : '';
}
function renderViz(c, sz, p){
  const el = $('tpViz');
  const ok = c.rows.filter(r => r.ok);
  if (!ok.length && !(sz.ok && sz.P)){ el.innerHTML = '<p class="tp-dim">Saisis un prix d\'entrée et un stop.</p>'; return; }
  const items = [];
  ok.forEach(r => items.push({ v: r.P, label: `Entrée ${c.rows.indexOf(r) + 1}`, color: 'var(--gold)', dash: '' }));
  [...new Set(ok.map(r => +r.inv.toFixed(4)))].forEach(v => items.push({ v, label: 'Stop', color: 'var(--red)', dash: '' }));
  if (ok.length){
    items.push({ v: Math.min(...ok.map(r => r.gapPx)), label: 'Sortie avec gap', color: 'var(--red)', dash: '4 4' });
    if (c.pru) items.push({ v: c.pru, label: 'PRU', color: 'var(--text-dim)', dash: '2 3' });
  }
  if (c.cur > 0) items.push({ v: c.cur, label: 'Cours actuel', color: 'var(--blue)', dash: '' });
  if (sz.ok && sz.P){ items.push({ v: sz.P, label: 'Entrée envisagée', color: 'var(--gold-2)', dash: '6 4' }); items.push({ v: sz.inv, label: 'Stop envisagé', color: 'var(--red)', dash: '6 4' }); if (!ok.length) items.push({ v: sz.gapPx, label: 'Sortie avec gap', color: 'var(--red)', dash: '4 4' }); }
  const vals = items.map(x => x.v).filter(Number.isFinite);
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.08 || hi * 0.05; lo -= pad; hi += pad;
  const W = 640, H = 260, x0 = 70, x1 = 400;
  const y = v => 12 + (hi - v) / (hi - lo) * (H - 24);
  const tops = ok.length ? ok.map(r => r.P) : [sz.P], lows = ok.length ? ok.map(r => r.inv) : [sz.inv], gaps = ok.length ? ok.map(r => r.gapPx) : [sz.gapPx];
  const topE = Math.max(...tops), lowInv = Math.min(...lows), lowX = Math.min(...gaps);
  const lab = items.map(it => ({ ...it, y: y(it.v) })).sort((a, b) => a.y - b.y);
  lab.forEach((it, i) => { it.ly = i === 0 ? it.y : Math.max(it.y, lab[i - 1].ly + 14); });
  const VH = Math.max(H, (lab.length ? lab[lab.length - 1].ly : 0) + 12);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${VH}" width="100%" style="max-height:320px" role="img" aria-label="Niveaux de prix de la position">
    ${Number.isFinite(topE) && Number.isFinite(lowInv) ? `<rect x="${x0}" y="${y(topE)}" width="${x1 - x0}" height="${Math.max(0, y(lowInv) - y(topE))}" fill="rgba(229,99,107,0.13)"/>
      <rect x="${x0}" y="${y(lowInv)}" width="${x1 - x0}" height="${Math.max(0, y(lowX) - y(lowInv))}" fill="rgba(229,99,107,0.06)"/>
      <text x="${(x0 + x1) / 2}" y="${(y(topE) + y(lowInv)) / 2 + 4}" text-anchor="middle" fill="rgba(229,99,107,0.8)" font-size="12" font-weight="700">Zone de risque</text>` : ''}
    ${lab.map(it => `<line x1="${x0}" x2="${x1}" y1="${it.y}" y2="${it.y}" stroke="${it.color}" stroke-width="2" ${it.dash ? `stroke-dasharray="${it.dash}"` : ''}/>
      <text x="${x0 - 6}" y="${it.y + 4}" text-anchor="end" fill="var(--text-dim)" font-size="11">${fmt(it.v, 2)}</text>
      <line x1="${x1}" x2="${x1 + 14}" y1="${it.y}" y2="${it.ly}" stroke="${it.color}" stroke-width="1" opacity=".5"/>
      <text x="${x1 + 18}" y="${it.ly + 4}" fill="${it.color}" font-size="12" font-weight="600">${esc(it.label)}</text>`).join('')}
  </svg><p class="tp-faint" style="font-size:12px;margin:4px 0 0">Prix en ${esc(p.ccy)}. Zone rouge foncée : de l'entrée la plus haute au stop ; zone claire : glissement et gap.</p>`;
}
function renderPortfolio(){
  const el = $('tp-tab-portfolio');
  const pf = E.portfolioCalc(state.positions.map(withRef), S());
  const s = E.settingsNums(S());
  const st = statusOf(pf.consumed);
  if (!state.positions.length){ el.innerHTML = '<div class="tp-card"><p class="tp-dim">Aucune position.</p></div>'; return; }
  const groupTbl = (title, g) => `<div class="tp-card"><h3 class="tp-h">${title}</h3><div class="tp-tbl"><table><thead><tr><th></th><th class="num">Positions</th><th class="num">Risque brut</th><th class="num">Part du risque</th></tr></thead><tbody>
    ${g.map(x => { const share = pf.gross ? x.gross / pf.gross : 0; return `<tr><td>${esc(x.name)} ${x.n >= 2 && share >= 0.4 ? '<span class="tp-pill warn">concentration</span>' : ''}</td><td class="num">${x.n}</td><td class="num">${eur(x.gross)}</td><td class="num">${pct(share, 0)}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  el.innerHTML = `
  <div class="tp-kpis">
    ${kpi('Risque brut agrégé', `<span class="tp-neg">${eur(pf.gross)}</span>`, `${pf.pctCapital !== null ? pct(pf.pctCapital, 2) + ' du capital · ' : ''}gap ${eur(pf.grossGap)}`, st)}
    ${kpi('Budget de risque du portefeuille', eur(pf.budgetPf), pf.budgetPf ? `${fmt(s.riskPctPf, 2)} % du capital` : 'mode « % d\'un capital » seulement')}
    <div class="tp-kpi ${st}"><div class="l">Budget global consommé</div><div class="v">${pct(pf.consumed, 0)}</div><div class="s"><span class="tp-pill ${st}">${statusLabel[st]}</span></div><div class="tp-bar"><i style="width:${Math.min(100, (pf.consumed || 0) * 100)}%;background:${barColor(st)}"></i></div></div>
    ${kpi('Résultats nets au stop', `<span class="tp-neg">${eur(pf.lossNets)}</span>`, `positions perdantes seulement · gains non déduits : +${eur(pf.gainNets)}`)}
  </div>
  <div class="tp-card"><h3 class="tp-h">Positions classées par risque</h3><div class="tp-tbl"><table><thead><tr><th>Position</th><th>Secteur</th><th>Moteur</th><th class="num">Risque brut</th><th class="num">Budget position</th><th class="num">Part du risque total</th><th class="num">Résultat net</th></tr></thead><tbody>
    ${pf.list.map(({ p, c }) => `<tr data-open="${p.id}" style="cursor:pointer"><td><b>${esc(p.nom)}</b> ${c.incomplete ? '<span class="tp-pill over">incomplète</span>' : ''}</td><td>${esc(p.secteur)}</td><td class="tp-dim">${esc(p.moteur)}</td>
      <td class="num tp-neg">${eur(c.gross)}</td><td class="num"><span class="tp-pill ${c.status}">${pct(c.consumed, 0)}</span></td>
      <td class="num">${pct(pf.gross ? c.gross / pf.gross : 0, 0)}</td><td class="num ${sgn(c.net)}">${eur(c.net)}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="tp-faint" style="font-size:12px">Le risque brut agrégé additionne seulement les pertes possibles. Un gain théorique sur une position ne réduit jamais le risque d'une autre.</p></div>
  <div class="tp-two">${groupTbl('Exposition par secteur', pf.bySector)}${groupTbl('Exposition par moteur économique', pf.byDriver)}</div>`;
}
function renderTests(){
  const res = RiskTests.run();
  const ok = res.filter(r => r.ok).length;
  $('tp-tab-tests').innerHTML = `<div class="tp-card"><h3 class="tp-h">Tests des calculs <span class="tp-pill ${ok === res.length ? 'ok' : 'over'}">${ok}/${res.length} réussis</span></h3>
    <p class="tp-dim">Lancés sur des données d'essai (jamais tes positions). Change ResMed : 1 € = 1,12279 $, frais et glissement à 0 sauf mention.</p>
    <ul style="padding-left:18px">${res.map(r => `<li class="${r.ok ? 'tp-pos' : 'tp-neg'}">${r.ok ? '✔' : '✖'} ${esc(r.name)}${r.ok ? '' : ` — <span>${esc(r.msg)}</span>`}</li>`).join('')}</ul></div>`;
  return { ok, total: res.length };
}

/* ---------- événements (limités à la fenêtre) ---------- */
function setEntry(id, k, v){ const e = active().entries.find(x => x.id === id); if (e) e[k] = v; }
function logInv(p, target, from, to, riskFrom, riskTo){
  (p.invHistory = p.invHistory || []).push({ at: new Date().toISOString(), target, from, to, riskFrom, riskTo, wider: riskTo > riskFrom + 1e-9 });
  persist(); renderHistory(p);
}
function onInput(ev){
  const t = ev.target;
  if (t.tagName === 'SELECT') return;
  if (t.dataset.s){ S()[t.dataset.s] = t.value; persist(); renderComputed(); return; }
  const p = active(); if (!p) return;
  if (t.dataset.p){ p[t.dataset.p] = t.value; if (t.dataset.p === 'fx') p.fxNote = 'Saisi à la main'; if (t.dataset.p === 'nom' || t.dataset.p === 'ticker') renderPosSelect(); }
  else if (t.dataset.e) setEntry(t.dataset.id, t.dataset.e, t.value);
  else if (t.dataset.ne) p.ne[t.dataset.ne] = t.value;
  else return;
  t.classList.toggle('tp-bad', t.inputMode === 'decimal' && t.value !== '' && E.n(t.value) === null);
  persist();
  renderComputed();
}
function onChange(ev){
  const t = ev.target, p = active();
  if (t.id === 'tpPosSelect'){ state.activeId = t.value; persist(); renderPosition(); renderPosSelect(); return; }
  if (t.id === 'tpFromHeld'){
    const h = opts.held[+t.value]; t.value = ''; if (!h) return;
    const np = newPosition({ nom: h.nom, ticker: h.ticker || '', ccy: h.ccy || 'EUR', current: h.current != null ? String(h.current) : '',
      entries: h.qty > 0 ? [newEntry({ price: h.pru != null ? String(+h.pru.toFixed(4)) : '', inputMode: 'qty', qty: String(h.qty) })] : [] });
    if (h.current) np.ne.price = String(h.current);
    state.positions.push(np); state.activeId = np.id; persist(); renderPosSelect(); renderPosition(); return;
  }
  if (t.tagName === 'SELECT'){
    if (t.dataset.s){ S()[t.dataset.s] = t.value; persist(); renderSettings(); renderComputed(); return; }
    if (!p) return;
    if (t.dataset.p){
      p[t.dataset.p] = t.value;
      if (t.dataset.p === 'ccy'){ const f = fxFor(p.ccy); p.fx = f.v; p.fxNote = f.note; }
      persist(); renderPosition(); return;
    }
    if (t.dataset.e){ setEntry(t.dataset.id, t.dataset.e, t.value); persist(); renderPosition(); return; }
    if (t.dataset.ne){ p.ne[t.dataset.ne] = t.value; persist(); renderComputed(); return; }
    return;
  }
  if (t.dataset.invtrack && p){
    const prev = t.dataset.prev ?? '', isCommon = t.dataset.invtrack === 'common';
    if (prev !== t.value){
      const old = JSON.parse(JSON.stringify(p));
      if (isCommon) old.commonInv = prev; else { const oe = old.entries.find(e => e.id === t.dataset.invtrack); if (oe) oe.invValue = prev; }
      const riskFrom = E.positionCalc(withRef(old), S()).gross, riskTo = E.positionCalc(withRef(p), S()).gross;
      const target = isCommon ? 'Stop commun' : `Entrée ${p.entries.findIndex(e => e.id === t.dataset.invtrack) + 1}`;
      const unit = isCommon || (p.entries.find(e => e.id === t.dataset.invtrack) || {}).invType !== 'pct' ? ' ' + (SYM[p.ccy] || p.ccy) : ' % sous';
      logInv(p, target, prev ? prev + unit : '', t.value ? t.value + unit : '', riskFrom, riskTo);
      t.dataset.prev = t.value;
    }
  }
}
function onClick(ev){
  const t = ev.target.closest('button,[data-open]'); if (!t || !root.contains(t)) return;
  const p = active();
  if (t.hasAttribute('data-tp-close')){ close(); return; }
  if (t.dataset.tab){
    root.querySelectorAll('.tp-tab').forEach(b => b.classList.toggle('active', b === t));
    ['position', 'portfolio', 'tests'].forEach(k => { $('tp-tab-' + k).hidden = k !== t.dataset.tab; });
    if (t.dataset.tab === 'portfolio') renderPortfolio();
    if (t.dataset.tab === 'tests') renderTests();
    return;
  }
  if (t.dataset.open){ state.activeId = t.dataset.open; persist(); root.querySelector('[data-tab="position"]').click(); renderPosSelect(); renderPosition(); return; }
  const a = t.dataset.tp;
  if (a === 'newpos'){ const np = newPosition(); state.positions.push(np); state.activeId = np.id; persist(); renderPosSelect(); renderPosition(); setTimeout(() => { const i = root.querySelector('[data-ne="price"]'); if (i) i.focus(); }, 20); return; }
  if (a === 'delpos' && p){
    if (t.dataset.confirm !== '1'){ t.dataset.confirm = '1'; t.textContent = 'Confirmer la suppression ?'; setTimeout(() => { if (t.isConnected){ t.dataset.confirm = ''; t.textContent = 'Supprimer la position'; } }, 4000); return; }
    (state.trash = state.trash || []).push({ position: p, deletedAt: new Date().toISOString() });   // gardée dans le fichier, jamais effacée
    state.positions = state.positions.filter(x => x.id !== p.id); state.activeId = state.positions[0] ? state.positions[0].id : null;
    t.dataset.confirm = ''; t.textContent = 'Supprimer la position'; persist(); renderPosSelect(); renderPosition(); return;
  }
  if (t.dataset.mode && p){
    if (t.dataset.mode === 'common' && p.mode !== 'common' && !E.n(p.commonInv)){
      const c = E.positionCalc(withRef(p), S()); const lows = c.rows.filter(r => r.ok).map(r => r.inv);
      if (lows.length) p.commonInv = +Math.min(...lows).toFixed(2);   // départ = le stop actuel le plus bas (aucune remontée automatique)
    }
    if (p.mode !== t.dataset.mode){
      const riskFrom = E.positionCalc(withRef(p), S()).gross;
      const fromMode = p.mode; p.mode = t.dataset.mode;
      const riskTo = E.positionCalc(withRef(p), S()).gross;
      const lbl = m => m === 'common' ? `commun ${E.n(p.commonInv) !== null ? '(' + p.commonInv + ' ' + (SYM[p.ccy] || p.ccy) + ')' : ''}` : 'par entrée';
      logInv(p, 'Mode', lbl(fromMode), lbl(p.mode), riskFrom, riskTo);
    }
    persist(); renderPosition(); return;
  }
  if (a === 'addentry' && p){ p.entries.push(newEntry()); persist(); renderPosition(); return; }
  if (t.dataset.delentry && p){
    if (t.dataset.confirm !== '1'){ t.dataset.confirm = '1'; t.textContent = 'Sûr ?'; setTimeout(() => { if (t.isConnected){ t.dataset.confirm = ''; t.textContent = '✕'; } }, 3000); return; }
    p.entries = p.entries.filter(e => e.id !== t.dataset.delentry); persist(); renderPosition(); return;
  }
  if ((a === 'usesize' || a === 'usebuy') && p){
    const c = E.positionCalc(withRef(p), S()); const sz = E.sizeNewEntry(withRef(p), S(), p.ne, c.available, c.capLeft);
    if (sz.code !== 'ok') return;
    if (a === 'usebuy'){ const r = { qty: sz.qty, price: sz.P, stop: sz.inv, ccy: p.ccy, nom: p.nom, ticker: p.ticker }; close(); opts.onUse(r); return; }
    const e = newEntry({ price: p.ne.price, inputMode: 'qty', qty: String(sz.qty) });
    if (p.mode !== 'common'){ e.invType = p.ne.invType; e.invValue = p.ne.invValue; }
    p.entries.push(e); persist(); renderPosition(); return;
  }
}
function onKey(e){ if (e.key === 'Escape' && root) close(); }

function close(){
  if (!root) return;
  if (saveState === 'pending'){ clearTimeout(saveTimer); if (store && store.set) store.set(JSON.parse(JSON.stringify(state))).catch(() => {}); }
  document.removeEventListener('keydown', onKey);
  root.remove(); root = null;
  document.body.classList.remove('tp-noscroll');
}
/* open({ store:{get, set}, fx(ccy) -> unités de ccy pour 1 €, held:[{nom, ticker, ccy, qty, pru, current}], onUse(r), memoNote, prefill }) */
function open(o){
  if (root) close();
  opts = o || {};
  store = opts.store || null;
  const saved = store && store.get ? store.get() : null;
  state = saved && saved.settings && Array.isArray(saved.positions) ? JSON.parse(JSON.stringify(saved))
    : { settings: Object.assign({}, DEFAULT_SETTINGS), positions: [], activeId: null, trash: [] };
  state.settings = Object.assign({}, DEFAULT_SETTINGS, state.settings);
  if (opts.prefill){ const np = newPosition(opts.prefill); if (opts.prefill.price) np.ne.price = String(opts.prefill.price); state.positions.push(np); state.activeId = np.id; }
  if (!state.activeId && state.positions[0]) state.activeId = state.positions[0].id;
  root = document.createElement('div');
  root.className = 'tp-bg'; root.id = 'tpRoot';
  root.innerHTML = shellHtml();
  root.addEventListener('mousedown', e => { if (e.target === root) close(); });
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(root);
  document.body.classList.add('tp-noscroll');
  saveState = store && store.set ? '' : 'mem';
  renderSettings(); renderPosSelect(); renderPosition(); paintSave();
  const res = RiskTests.run();
  root.querySelector('[data-tab="tests"]').textContent = `Tests des calculs (${res.filter(r => r.ok).length}/${res.length})`;
  if (opts.prefill) setTimeout(() => { const i = root.querySelector('[data-ne="invValue"]'); if (i) i.focus(); }, 30);
}

window.RISK_ENGINE = RiskEngine;
window.RISK_TESTS = RiskTests;
window.TAILLE_UI = { open, close, DEFAULT_SETTINGS };
})();
