/* ================================================================================================
   VALORISATION PAR MULTIPLES HISTORIQUES — EV/EBITDA lissé et Price-to-Book (onglet Analyse)
   ------------------------------------------------------------------------------------------------
   Données : UNIQUEMENT TradingView en direct (règle de l'utilisateur, jamais FMP ni le Google Sheet).
     - EBITDA 12 mois, EBITDA annuel sur ~20 ans (ebitda_fy_h), dette nette, actions, actif net par action,
       EV/EBITDA et P/B actuels : lus par le serveur local (/api/tv/snapshot) à chaque affichage.
     - Multiples MOYENS historiques (EV/EBITDA, P/B) : TradingView ne les expose pas en série par son
       serveur public -> l'utilisateur les relève dans l'appli TradingView et les saisit ici (un nombre,
       ou la liste des valeurs annuelles : la moyenne est faite automatiquement). Gardés en localStorage.
   Aucune prévision : uniquement des données TTM / historiques brutes.

   Utilisé par l'onglet VALORISATION (boutons « Valoriser avec l'EV/EBITDA » / « … le P/B », app.js) : les 3 scénarios
   y projettent l'EBITDA lissé par action ou l'actif net par action. Moteur pur et testable (sans DOM) :
   window.VALO_MULTIPLES — voir tests/valo-multiples.test.html.
   ================================================================================================ */
(function(){
  'use strict';

  const isNum = v => typeof v === 'number' && isFinite(v);

  /* ---------- MÉTHODE 1 : EV / EBITDA ----------
     EV cible = EBITDA × multiple ; capitalisation cible = EV cible − dette nette ; prix = capitalisation / actions.
     Dette nette NÉGATIVE (trésorerie nette) : la soustraction l'AJOUTE naturellement à la valeur des actions. */
  function calculateEvEbitdaFairValue({ ebitda, multiple, netDebt, shares, price } = {}){
    if (!isNum(shares) || shares <= 0) return { ok:false, error:"Nombre d'actions nul ou inconnu : division impossible." };
    if (!isNum(ebitda)) return { ok:false, error:'EBITDA indisponible.' };
    if (ebitda <= 0) return { ok:false, error:'EBITDA négatif ou nul : la méthode EV/EBITDA ne s\'applique pas.' };
    if (!isNum(multiple) || multiple <= 0) return { ok:false, error:'Multiple EV/EBITDA historique à renseigner (> 0).' };
    if (!isNum(netDebt)) return { ok:false, error:'Dette nette indisponible.' };
    const evCible = ebitda * multiple;
    const capCible = evCible - netDebt;
    if (capCible <= 0) return { ok:false, evCible, capCible, error:"La dette nette dépasse la valeur d'entreprise cible : valeur des actions nulle." };
    const prixCible = capCible / shares;
    return Object.assign({ ok:true, evCible, capCible, prixCible, tresorerieNette: netDebt < 0 }, compare(price, prixCible));
  }

  /* ---------- MÉTHODE 2 : Price-to-Book ----------
     Prix cible = actif net par action × P/B moyen historique ; P/B actuel = prix / actif net par action.
     Signal d'opportunité : P/B actuel < P/B historique OU < 1 (sous l'actif net comptable). */
  function calculatePbFairValue({ bookValuePerShare, multiple, price } = {}){
    if (!isNum(bookValuePerShare)) return { ok:false, error:'Actif net par action indisponible.' };
    if (bookValuePerShare <= 0) return { ok:false, error:'Actif net comptable négatif ou nul : la méthode P/B ne s\'applique pas.' };
    const pbActuel = isNum(price) && price > 0 ? price / bookValuePerShare : null;
    if (!isNum(multiple) || multiple <= 0) return { ok:false, pbActuel, error:'Multiple P/B historique à renseigner (> 0).' };
    const prixCible = bookValuePerShare * multiple;
    const sousHisto = pbActuel != null && pbActuel < multiple;
    const sousActifNet = pbActuel != null && pbActuel < 1;
    return Object.assign({ ok:true, prixCible, pbActuel, sousHisto, sousActifNet, opportunite: sousHisto || sousActifNet }, compare(price, prixCible));
  }

  /* ---------- SCÉNARIO EV/EBITDA À 5 ANS (onglet Valorisation, méthode de l'utilisateur, 2026-11-08) ----------
     TOUT EST PAR ACTION et dans la devise du cours (EBITDA et dette nette déjà ÷ nombre d'actions par l'appelant) :
       Valeur actuelle       = EBITDA actuel/action × multiple − dette nette ACTUELLE/action
       EBITDA futur/action   = EBITDA actuel/action × (1 + CAGR)^5
       Prix dans 5 ans       = EBITDA futur/action × multiple de sortie − dette nette FUTURE/action
       Potentiel total (%)   = (prix futur / cours − 1) × 100
       Rendement annualisé   = ((prix futur / cours)^(1/5) − 1) × 100
     La dette nette n'est retirée qu'UNE fois, à la fin (EV → capitalisation) ; le multiple s'applique à l'EBITDA,
     jamais à la capitalisation. Dette future absente = dette actuelle (hypothèse affichée et modifiable).
     multipleSortie absent = même multiple que l'actuel. rachatPct (optionnel, %/an, défaut 0) : baisse des actions
     en plus de la tendance -> valeur par action × (1 + rachat)^5 (dette future exprimée sur le nombre d'actions actuel).
     Capitalisation négative (dette > EV) : prix ramené à 0 et signalé (negatif:true). */
  function evEbitdaScenario({ ebitdaPS, multiple, multipleSortie, cagr, detteNettePS, detteNetteFuturePS, prix, rachatPct, annees } = {}){
    const n = isNum(annees) && annees > 0 ? annees : 5;
    if (!isNum(ebitdaPS)) return { ok:false, error:'EBITDA par action indisponible.' };
    if (!isNum(multiple) || multiple < 0) return { ok:false, error:'Multiple EV/EBITDA à renseigner.' };
    const mSortie = isNum(multipleSortie) && multipleSortie >= 0 ? multipleSortie : multiple;
    const g = isNum(cagr) ? cagr : 0;
    const dn = isNum(detteNettePS) ? detteNettePS : 0;
    const dnFutAuto = !isNum(detteNetteFuturePS);
    const dnFut = dnFutAuto ? dn : detteNetteFuturePS;
    const rachatFactor = Math.pow(1 + (isNum(rachatPct) ? rachatPct : 0) / 100, n);
    const brutActuel = ebitdaPS * multiple - dn;
    const ebitdaFuturPS = ebitdaPS * Math.pow(1 + g / 100, n);
    const brutFutur = (ebitdaFuturPS * mSortie - dnFut) * rachatFactor;
    const prixTheoActuel = Math.max(0, brutActuel);
    const prixFutur = Math.max(0, brutFutur);
    const okPrix = isNum(prix) && prix > 0;
    return {
      ok:true, prixTheoActuel, ebitdaFuturPS, prixFutur, detteNetteFuturePS: dnFut, detteFutureAuto: dnFutAuto,
      multipleSortie: mSortie, negatif: brutActuel < 0 || brutFutur < 0,
      potentielActuel: okPrix ? (prixTheoActuel / prix - 1) * 100 : null,
      potentielTotal: okPrix ? (prixFutur / prix - 1) * 100 : null,
      rendementAnnualise: okPrix ? (Math.pow(prixFutur / prix, 1 / n) - 1) * 100 : null
    };
  }

  // Écart = prix actuel / prix cible − 1 (négatif = l'action cote SOUS sa valeur théorique = sous-évaluée).
  function compare(price, prixCible){
    if (!isNum(price) || price <= 0 || !isNum(prixCible) || prixCible <= 0) return { ecart:null, sousEvaluee:null };
    return { ecart: price / prixCible - 1, sousEvaluee: price < prixCible };
  }

  // Moyenne des n derniers exercices (série la plus RÉCENTE en premier, comme ebitda_fy_h de TradingView).
  function averageLastYears(seriesRecentFirst, n){
    if (!Array.isArray(seriesRecentFirst)) return null;
    const vals = seriesRecentFirst.slice(0, n).filter(isNum);
    if (vals.length < Math.min(n, 3)) return null;   // trop peu d'exercices pour parler de « moyenne lissée »
    return { value: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length };
  }

  // Saisie du multiple : « 9,5 » ou la liste des valeurs annuelles relevées sur TradingView (« 8,2 9,1 10,4 … »).
  function parseMultipleInput(txt){
    const parts = String(txt == null ? '' : txt).trim().split(/[\s;|\/]+/).filter(Boolean);
    const vals = parts.map(p => parseFloat(p.replace(/x$/i, '').replace(',', '.'))).filter(v => isFinite(v) && v > 0);
    if (!vals.length) return null;
    return { value: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length };
  }

  /* Extraction depuis l'instantané TradingView (après conversion de devise faite par tvFetchSnapshot dans app.js).
     Vérifié sur Schneider, TSMC, STMicro, Unilever, Nestlé (2026-11-07) : ebitda_fy_h est DÉJÀ dans la devise de
     COTATION (unité de base : livres et non pence pour Londres), contrairement aux champs _ttm/_fq (devise
     « fondamentale », convertis par app.js). Seule correction : ×100 pour un titre coté en pence. */
  function fromSnapshot(d){
    if (!d) return null;
    const n = v => isNum(v) ? v : null;
    const gbx = /GBX|GBp/.test(String(d.currency || '') + ' ' + String(d.currency_id || ''));
    const hist = Array.isArray(d.ebitda_fy_h) ? d.ebitda_fy_h.map(v => isNum(v) ? v * (gbx ? 100 : 1) : null) : null;
    return {
      serverOk: ('price_book_fq' in d) || ('ebitda_fy_h' in d),   // false = serveur local d'avant cette fonction
      price: n(d.close), ebitdaTtm: n(d.ebitda_ttm), ebitdaHist: hist, netDebt: n(d.net_debt_fq),
      shares: n(d.total_shares_outstanding_fundamental), bvps: n(d.book_value_per_share_fq),
      // EV/EBITDA ACTUEL (TTM) : `enterprise_value_ebitda_current` = valeur d'entreprise du jour ÷ EBITDA 12 mois, EXACTEMENT
      // celle de l'appli TradingView (Schneider 16,27x, vérifié le 2026-11-08). `enterprise_value_ebitda_ttm` (16,00x) mélange
      // deux taux de change quand les comptes sont publiés dans une autre devise : gardé seulement en repli.
      evEbitdaActuel: n(d.enterprise_value_ebitda_current) != null ? n(d.enterprise_value_ebitda_current) : n(d.enterprise_value_ebitda_ttm), pbActuel: n(d.price_book_fq), at: Date.now()
    };
  }

  /* Multiples MOYENS historiques saisis par l'utilisateur (relevés dans l'appli TradingView), par entreprise :
     { ev:'15,3' ou '14,5 15,2 …', pb:'0,7' }. localStorage (réglage personnel léger, comme les sliders). */
  const LS_KEY = 'wolfMultiplesHisto';
  function getSaved(nom){
    try { return (JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {})[nom] || {}; } catch(e){ return {}; }
  }
  function setSaved(nom, patch){
    try {
      const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
      all[nom] = Object.assign({}, all[nom], patch);
      localStorage.setItem(LS_KEY, JSON.stringify(all));
    } catch(e){ /* stockage indisponible : valeur gardée pour la session seulement */ }
  }

  // CAGR (%) entre l'exercice le plus récent et celui d'il y a n ans (série récente en premier), bornes > 0.
  function cagrRecentFirst(series, n){
    if (!Array.isArray(series)) return null;
    const k = Math.min(n, series.length - 1);
    const last = series[0], first = series[k];
    if (!isNum(last) || !isNum(first) || last <= 0 || first <= 0 || k <= 0) return null;
    return (Math.pow(last / first, 1 / k) - 1) * 100;
  }

  /* ---------- EV/EBITDA HISTORIQUE (2026-11-08) ----------
     Le serveur public TradingView n'a ni l'historique de l'EV ni celui de la trésorerie : l'utilisateur relève dans
     l'appli TradingView l'EV/EBITDA de chaque année et le saisit (plage d'années libre). On en tire :
       moyennes 5 / 10 / 15 / 20 ans (les N années les plus récentes saisies), médiane de toutes les années saisies,
       et les multiples par défaut des scénarios : PESSIMISTE = plus basse des moyennes, RÉALISTE = médiane DES MOYENNES
       (pas la médiane des années : quand le multiple monte avec le temps, celle-ci tombe sous la plus basse des moyennes
       et le « réaliste » devenait plus prudent que le pessimiste), OPTIMISTE = plus haute des moyennes. years = { '2006': 9.1, ... } ; valeurs ≤ 0 ignorées. */
  function evHistoryStats(years){
    const pts = Object.keys(years || {}).map(y => [+y, +years[y]]).filter(p => isNum(p[0]) && isNum(p[1]) && p[1] > 0).sort((a, b) => b[0] - a[0]);
    const vals = pts.map(p => p[1]);
    if (!vals.length) return { count: 0 };
    const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
    const sorted = vals.slice().sort((a, b) => a - b);
    const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const avgs = {};
    [5, 10, 15, 20].forEach(n => { if (vals.length >= Math.min(n, 3)) avgs[n] = { value: mean(vals.slice(0, n)), count: Math.min(n, vals.length) }; });
    // une moyenne « N ans » n'a de sens que si on a au moins N valeurs (sinon elle répète la précédente)
    const distinct = [5, 10, 15, 20].filter(n => avgs[n] && (n === 5 || vals.length >= n)).map(n => avgs[n].value);
    const ds = distinct.slice().sort((a, b) => a - b);
    const medianAvg = ds.length ? (ds.length % 2 ? ds[(ds.length - 1) / 2] : (ds[ds.length / 2 - 1] + ds[ds.length / 2]) / 2) : null;
    return { count: vals.length, first: pts[pts.length - 1][0], last: pts[0][0], avgs, median, medianAvg, min: sorted[0], max: sorted[sorted.length - 1],
      minAvg: ds.length ? ds[0] : null, maxAvg: ds.length ? ds[ds.length - 1] : null };
  }
  // Stockage FICHIER (data/mes-portefeuilles/multiples.json via le serveur local), jamais seulement le navigateur.
  let evStore = null, evStoreLoading = null;
  function loadEvStore(){
    if (evStoreLoading) return evStoreLoading;
    evStoreLoading = fetch('/api/store/load?name=multiples', { cache: 'no-store' }).then(r => r.json())
      .then(j => { evStore = (j && j.ok && j.data) || { version: 1, revision: 0, ev: {} }; evStore.ev = evStore.ev || {}; return evStore; })
      .catch(() => { evStore = null; evStoreLoading = null; return null; });
    return evStoreLoading;
  }
  function getEvHistory(nom){ return (evStore && evStore.ev[nom]) || null; }
  /* FCF NORMALISÉ (2026-11-11) : FCF par action saisi année par année (entreprises cycliques), même fichier, clé « fcf ».
     Statistiques : médiane de toutes les années, moyennes 5 / 10 / 15 / 20 ans (les années négatives COMPTENT : c'est tout
     l'intérêt d'une normalisation sur un cycle). years = { '2006': 3.1, ... }. */
  function getFcfNorm(nom){ return (evStore && evStore.fcf && evStore.fcf[nom]) || null; }
  function fcfNormStats(years){
    const pts = Object.keys(years || {}).map(y => [+y, +years[y]]).filter(p => isNum(p[0]) && isNum(p[1])).sort((a, b) => b[0] - a[0]);
    const vals = pts.map(p => p[1]); if (!vals.length) return { count: 0 };
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
    const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
    const avgs = {}; [5, 10, 15, 20].forEach(n => { if (vals.length >= n || (n === 5 && vals.length >= 3)) avgs[n] = mean(vals.slice(0, n)); });
    return { count: vals.length, first: pts[pts.length - 1][0], last: pts[0][0], median: med(vals), median10: vals.length >= 3 ? med(vals.slice(0, 10)) : null, avgs, min: Math.min(...vals), max: Math.max(...vals) };
  }
  async function saveFcfNorm(nom, entry){
    await loadEvStore();
    if (!evStore) throw new Error('Serveur local injoignable : relance le raccourci « Wolf Analysis ».');
    const body = Object.assign({}, evStore, { fcf: Object.assign({}, evStore.fcf || {}, { [nom]: entry }), revision: (evStore.revision || 0) + 1, baseRevision: evStore.revision || 0 });
    const r = await fetch('/api/store/save?name=multiples', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok){ if (window.wolfRescue) window.wolfRescue('multiples', body); evStoreLoading = null; await loadEvStore(); throw new Error(j.error || 'enregistrement refusé'); }
    evStore = body; evStore.revision = j.revision;
  }
  async function saveEvHistory(nom, entry){
    await loadEvStore();
    if (!evStore) throw new Error('Serveur local injoignable : relance le raccourci « Wolf Analysis ».');
    const body = Object.assign({}, evStore, { ev: Object.assign({}, evStore.ev, { [nom]: entry }), revision: (evStore.revision || 0) + 1, baseRevision: evStore.revision || 0 });
    const r = await fetch('/api/store/save?name=multiples', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok){ if (window.wolfRescue) window.wolfRescue('multiples', body); evStoreLoading = null; await loadEvStore(); throw new Error(j.error || 'enregistrement refusé'); }
    evStore = body; evStore.revision = j.revision;
  }

  window.VALO_MULTIPLES = { evHistoryStats, loadEvStore, getEvHistory, saveEvHistory, getFcfNorm, saveFcfNorm, fcfNormStats, calculateEvEbitdaFairValue, calculatePbFairValue, evEbitdaScenario, averageLastYears, parseMultipleInput, fromSnapshot,
    cagrRecentFirst, getSaved, setSaved };
})();
