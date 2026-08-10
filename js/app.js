/* ============================================================
   CONFIG — à adapter si l'ID du fichier ou l'onglet changent
   ============================================================ */
const PUBLISHED_ID = "2PACX-1vTQNfcV1SOt2tfFCP8NYYmm_dPDiEeS_Z_LCQHSU9tRvgGi47wBMYeHyibKLSi2PXWqnvazg5fv3qnx";
const GID = "1880505297"; // onglet "DATA BASE 20 ans"
const CSV_URL = `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_ID}/pub?gid=${GID}&single=true&output=csv`;
// Pas de rafraîchissement automatique : on recharge au chargement de la page,
// et uniquement quand on clique sur "↻ Rafraîchir".

/* Index des colonnes A -> BG (0-based), tel que décrit dans l'onglet */
const COL = {
  nom:0, annee:1, lienImage:2, ticker:3, secteur:4, sousSecteur:5,
  prixActuel:7, prixJuste:8, prixCible:9, ecartValeur:10,
  dividende:20, rendementDiv:21, cagrDiv5:22, cagrDiv10:23, cagrDiv20:24,
  payoutFCF:25, payoutRatio:26,
  fcfpeg:35, fcfParAction:38, cagrFcf5:39, cagrFcf10:40, cagrFcf20:41, pFcf:13, medianePFCF:42,
  ca:44, cagrCA5:45, cagrCA10:46, cagrCA20:47, margeOp:48, roic:49,
  cash:52, cashInvesti:53, actions:54, cagrActions:55,
  detteOCF:58, medianePFCF20:59,
  // Valorisation alternative par OCF (bascule FCF/OCF, onglet Valorisation) : pas de
  // colonne "OCF par action" directe dans le Sheet — dérivée de prixActuel/pOcf, même
  // logique que le P/FCF existant. cagrOcf20 (AE) volontairement absent : comme
  // cagrFcf20, non utilisé dans les formules de scénario, seulement une donnée
  // disponible pour un futur badge éventuel.
  pOcf:12, cagrOcf10:29, medianePOcf:31, medianePOcf20:33
};

let companies = {};   // { nomEntreprise: [ {annee, ...valeurs}, ... ] sorted asc }
let activeCompany = null;
let chartInstances = {};

/* Onglet "Wolf portefeuille" — même fichier publié, gid différent */
const PORTFOLIO_GID = "58524400";
const PORTFOLIO_CSV_URL = `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_ID}/pub?gid=${PORTFOLIO_GID}&single=true&output=csv`;
const PCOL = {
  actif:21, valorisation:22, investi:23, perf:24,             // V, W, X, Y
  capitalInvesti:26, valorisationTotale:29,                    // AA, AD
  gainsEuros:32, gainsPct:35,                                  // AG, AJ
  cashEuros:38,                                                 // AM
  moisDate:41, moisValo:43, moisRendement:45, rendementTotal:46, // AP, AR, AT, AU
  spxPerfMensuelle:47, spxPerfTotale:48, spxValorisation:49     // AV, AW, AX
};
let portfolioData = { holdings:[], monthly:[], capitalInvesti:null, valorisationTotale:null, gainsEuros:null, gainsPct:null, cashEuros:null };

/* Onglet historique de prix dédié (20 ans, saisi manuellement par l'utilisateur pour
   contourner le manque de fiabilité du relais CORS Yahoo/Stooq) — même fichier publié,
   gid différent. Mise en page : row1 = nom d'entreprise (colonnes paires 0-indexées A,C,E…),
   row2 = libellés "Date,Close" (sans intérêt), row3+ = données. Chaque entreprise a SA
   PROPRE colonne de dates juste avant sa colonne de clôtures (pas d'axe de dates partagé —
   les historiques démarrent à des dates différentes selon l'entreprise), donc on apparie
   toujours date et prix de la même paire de colonnes, jamais contre une colonne A globale. */
const PRICE_HISTORY_GID = "1420785203";
const PRICE_HISTORY_CSV_URL = `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_ID}/pub?gid=${PRICE_HISTORY_GID}&single=true&output=csv`;
let priceHistoryData = {}; // { nomBrutDuSheet: [{date:'YYYY-MM-DD', close:number}, ...] tri croissant }

/* ============================================================
   CHARGEMENT DES DONNÉES — 2 méthodes, avec repli automatique
   1) fetch() sur le CSV publié — la méthode standard une fois hébergé en ligne
   2) balise <script> (JSONP) — contourne les restrictions que Chrome applique
      aux requêtes réseau depuis un fichier ouvert en local (file://)
   ============================================================ */
const SHEET_ID = "1V4NaDx7PvnJkPMtddGgW23Hjn0jon1g0UjoC4o6FchM";

let loadSettled = false; // partagé entre les deux méthodes, pour n'accepter que le premier succès

function loadData(){
  document.getElementById('loadingScreen').style.display = 'block';
  document.getElementById('errorScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'none';
  setSync('loading');
  setDebug('Tentative des deux méthodes de connexion en parallèle…');
  loadSettled = false;

  // Les deux méthodes démarrent en même temps. Chacune a son propre minuteur
  // qui ne dépend PAS de la requête réseau pour se déclencher (setTimeout pur),
  // donc même si l'une reste bloquée indéfiniment sans jamais répondre,
  // l'autre prend le relais et rien ne reste bloqué.
  tryFetchCSV();
  tryGvizScript();

  setTimeout(function(){
    if (!loadSettled){
      loadSettled = true;
      showError("Aucune des deux méthodes n'a abouti après 9 secondes. Cela signifie presque toujours que le fichier n'est pas encore publié pour cet onglet précis — vérifie dans Google Sheets : Fichier → Partager → Publier sur le web, sélectionne l'onglet « DATA BASE 20 ans », format CSV, puis clique sur Publier (et confirme si demandé).");
    }
  }, 9000);
}

function tryFetchCSV(){
  const controller = new AbortController();
  const hardTimeout = setTimeout(() => controller.abort(), 5000);

  fetch(CSV_URL + '&_=' + Date.now(), { signal: controller.signal, cache: 'no-store' })
    .then(async res => {
      if (loadSettled) return;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (text.trim().toLowerCase().startsWith('<!doctype') || text.trim().toLowerCase().startsWith('<html')){
        throw new Error('Réponse HTML au lieu de CSV');
      }
      const parsed = Papa.parse(text.trim(), { skipEmptyLines: true });
      if (!parsed.data || parsed.data.length < 2) throw new Error('CSV vide ou illisible');
      if (loadSettled) return;
      loadSettled = true;
      clearTimeout(hardTimeout);
      setDebug('Connecté via la méthode CSV (fetch).');
      handleCsvRows(parsed.data);
    })
    .catch(err => {
      clearTimeout(hardTimeout);
      if (!loadSettled){
        setDebug('Méthode CSV (fetch) : ' + (err.name === 'AbortError' ? 'bloquée / délai dépassé' : err.message) + ' — en attente de la méthode alternative…');
      }
    });
}

function tryGvizScript(){
  const old = document.getElementById('gvizScript');
  if (old) old.remove();

  window.google = window.google || {};
  window.google.visualization = window.google.visualization || {};

  window.google.visualization.Query = {
    setResponse: function(data){
      if (loadSettled) return;
      try{
        if (!data || !data.table || !data.table.rows) throw new Error('table vide');
        const rows = [data.table.cols.map(c => c.label)].concat(
          data.table.rows.map(r => (r.c || []).map(cell => cell ? (cell.f != null ? cell.f : cell.v) : ''))
        );
        loadSettled = true;
        setDebug('Connecté via la méthode alternative (script).');
        handleCsvRows(rows);
      }catch(e){
        if (!loadSettled) setDebug('Méthode alternative (script) : ' + e.message);
      }
    }
  };

  const script = document.createElement('script');
  script.id = 'gvizScript';
  script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}&headers=1&_=${Date.now()}`;
  script.onerror = function(){
    if (!loadSettled) setDebug('Méthode alternative (script) : requête réseau bloquée.');
  };
  document.body.appendChild(script);
}

function setDebug(msg){
  const el = document.getElementById('debugLine');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function showError(msg){
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('errorScreen').style.display = 'block';
  document.getElementById('errorDetail').textContent = msg;
  setSync('error');
}

function setSync(state){
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncLabel');
  if (state === 'loading'){
    dot.classList.add('stale');
    label.textContent = 'Connexion au Google Sheet…';
  } else if (state === 'error'){
    dot.classList.add('stale');
    label.textContent = 'Échec de connexion';
  } else {
    dot.classList.remove('stale');
    const now = new Date();
    label.textContent = 'Synchronisé à ' + now.toLocaleTimeString('fr-FR');
  }
}

function parseNum(raw){
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === '' || s.startsWith('#')) return null; // cases vides ou erreurs type #DIV/0!
  s = s.replace(/\s/g,'').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function parseStr(raw){
  return raw == null ? '' : String(raw).trim();
}

function handleCsvRows(rows){
  if (!rows || rows.length < 2){
    showError("Le fichier CSV reçu est vide. Vérifie que l'onglet « DATA BASE 20 ans » contient bien des données publiées.");
    return;
  }

  companies = {};
  // rows[0] = ligne d'en-têtes, on la saute
  for (let i = 1; i < rows.length; i++){
    const c = rows[i];
    const nom = parseStr(c[COL.nom]);
    const annee = parseNum(c[COL.annee]);
    const prixActuel = parseNum(c[COL.prixActuel]);
    if (!nom || !annee || prixActuel == null) continue; // ligne vide / année sans données

    const row = {
      annee,
      lienImage: parseStr(c[COL.lienImage]),
      ticker: parseStr(c[COL.ticker]),
      secteur: parseStr(c[COL.secteur]),
      sousSecteur: parseStr(c[COL.sousSecteur]),
      prixActuel,
      prixJuste: parseNum(c[COL.prixJuste]),
      prixCible: parseNum(c[COL.prixCible]),
      ecartValeur: parseNum(c[COL.ecartValeur]),
      dividende: parseNum(c[COL.dividende]),
      rendementDiv: parseNum(c[COL.rendementDiv]),
      cagrDiv5: parseNum(c[COL.cagrDiv5]),
      cagrDiv10: parseNum(c[COL.cagrDiv10]),
      cagrDiv20: parseNum(c[COL.cagrDiv20]),
      payoutRatio: parseNum(c[COL.payoutRatio]),
      fcfpeg: parseNum(c[COL.fcfpeg]),
      fcfParAction: parseNum(c[COL.fcfParAction]),
      cagrFcf5: parseNum(c[COL.cagrFcf5]),
      cagrFcf10: parseNum(c[COL.cagrFcf10]),
      cagrFcf20: parseNum(c[COL.cagrFcf20]),
      pFcf: parseNum(c[COL.pFcf]),
      medianePFCF: parseNum(c[COL.medianePFCF]),
      medianePFCF20: parseNum(c[COL.medianePFCF20]),
      pOcf: parseNum(c[COL.pOcf]),
      cagrOcf10: parseNum(c[COL.cagrOcf10]),
      medianePOcf: parseNum(c[COL.medianePOcf]),
      medianePOcf20: parseNum(c[COL.medianePOcf20]),
      ca: parseNum(c[COL.ca]),
      cagrCA5: parseNum(c[COL.cagrCA5]),
      cagrCA10: parseNum(c[COL.cagrCA10]),
      cagrCA20: parseNum(c[COL.cagrCA20]),
      margeOp: parseNum(c[COL.margeOp]),
      roic: parseNum(c[COL.roic]),
      detteOCF: parseNum(c[COL.detteOCF]),
      cash: parseNum(c[COL.cash]),
      cashInvesti: parseNum(c[COL.cashInvesti]),
      actions: parseNum(c[COL.actions]),
      cagrActions: parseNum(c[COL.cagrActions])
    };

    if (!companies[nom]) companies[nom] = [];
    companies[nom].push(row);
  }

  Object.keys(companies).forEach(nom => companies[nom].sort((a,b) => a.annee - b.annee));

  const names = Object.keys(companies);
  if (names.length === 0){
    showError("Aucune ligne exploitable n'a été trouvée dans l'onglet (colonnes NOM / Année / Prix Actuel vides).");
    return;
  }

  if (!activeCompany || !companies[activeCompany]) activeCompany = names[0];
  renderCompany(activeCompany);
  renderSectorView();
  renderClassement();
  renderWatchlist();
  renderAlertesTab();

  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('errorScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  setSync('ok');

  loadPortfolioData();
  loadPriceHistoryData();
  loadMacroCycleData();
  loadMacroRotationData();
  loadMacroPowerData();
}

/* ============================================================
   ONGLET PORTFOLIO — onglet "Wolf portefeuille" du même Sheet (gid
   différent). Chargement séquentiel APRÈS les données principales
   (pas en parallèle) : la méthode gviz réutilise le même point
   d'entrée global `google.visualization.Query.setResponse`, donc
   deux chargements gviz simultanés se marcheraient dessus — safe une
   fois que le chargement principal est réglé (loadSettled déjà true).
   Structure du Sheet : 3 blocs indépendants dans le même onglet, pas
   forcément le même nombre de lignes chacun — parsés séparément :
   - V/W/X/Y : un actif par ligne (actions + Cash), jusqu'à la 1re case
     vide en V
   - AA/AD/AG/AJ/AM : valeurs uniques du portefeuille (lues sur la
     1re ligne de données)
   - AP/AR/AT/AU/AV/AW/AX : un mois par ligne, jusqu'à la 1re case
     vide en AP (AQ et AS sont vides, non utilisées)
   ============================================================ */
let portfolioLoadSettled = false;

function loadPortfolioData(){
  portfolioLoadSettled = false;
  tryFetchPortfolioCSV();
  tryGvizPortfolioScript();
  setTimeout(() => { portfolioLoadSettled = true; }, 9000);
}

function tryFetchPortfolioCSV(){
  const controller = new AbortController();
  const hardTimeout = setTimeout(() => controller.abort(), 5000);
  fetch(PORTFOLIO_CSV_URL + '&_=' + Date.now(), { signal: controller.signal, cache:'no-store' })
    .then(async res => {
      if (portfolioLoadSettled) return;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (text.trim().toLowerCase().startsWith('<!doctype') || text.trim().toLowerCase().startsWith('<html')){
        throw new Error('Réponse HTML au lieu de CSV');
      }
      const parsed = Papa.parse(text.trim(), { skipEmptyLines:true });
      if (!parsed.data || parsed.data.length < 2) throw new Error('CSV vide ou illisible');
      if (portfolioLoadSettled) return;
      portfolioLoadSettled = true;
      clearTimeout(hardTimeout);
      handlePortfolioRows(parsed.data);
    })
    .catch(() => { clearTimeout(hardTimeout); });
}

// callback dédié (tqx=responseHandler:...) plutôt que le point d'entrée global
// google.visualization.Query.setResponse partagé avec le chargement principal — sinon,
// si le script gviz principal est encore en vol au moment où celui-ci se déclenche, les
// deux se marchent dessus et le portefeuille peut se retrouver avec les données de
// l'onglet "DATA BASE 20 ans" (bug constaté en test).
function tryGvizPortfolioScript(){
  const old = document.getElementById('gvizPortfolioScript');
  if (old) old.remove();

  window.__handlePortfolioGviz = function(data){
    if (portfolioLoadSettled) return;
    try{
      if (!data || !data.table || !data.table.rows) throw new Error('table vide');
      const rows = [data.table.cols.map(c => c.label)].concat(
        data.table.rows.map(r => (r.c || []).map(cell => cell ? (cell.f != null ? cell.f : cell.v) : ''))
      );
      portfolioLoadSettled = true;
      handlePortfolioRows(rows);
    }catch(e){ /* silencieux : le repli CSV ou le timeout de secours prendront le relais */ }
  };

  const script = document.createElement('script');
  script.id = 'gvizPortfolioScript';
  script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:__handlePortfolioGviz&gid=${PORTFOLIO_GID}&headers=1&_=${Date.now()}`;
  document.body.appendChild(script);
}

// Le Sheet a une mise en page "tableau de bord" : plusieurs lignes de titre avant
// chaque bloc, avec des espacements différents entre le bloc V:Y (actifs), AA:AM
// (résumé) et AP:AX (mensuel) alors qu'ils partagent la même ligne d'en-tête — et CSV
// vs gviz ne renvoient pas les mêmes lignes vides pour ce même fichier (gviz compresse,
// CSV les garde telles quelles). Donc aucun numéro de ligne fixe n'est fiable ici :
// chaque bloc est reconnu par son contenu (libellés d'en-tête connus ignorés), jamais
// par une position dans le tableau.
function handlePortfolioRows(rows){
  const holdings = [];
  const monthly = [];
  const summary = { capitalInvesti:null, valorisationTotale:null, gainsEuros:null, gainsPct:null, cashEuros:null };
  let summaryFound = false;

  for (let i = 0; i < rows.length; i++){
    const c = rows[i];

    const actif = parseStr(c[PCOL.actif]);
    if (actif && actif.toUpperCase() !== 'ACTIF'){
      holdings.push({
        nom: actif,
        valorisation: parseNum(c[PCOL.valorisation]),
        investi: parseNum(c[PCOL.investi]),
        perf: parseNum(c[PCOL.perf])
      });
    }

    if (!summaryFound){
      const capitalInvesti = parseNum(c[PCOL.capitalInvesti]);
      if (capitalInvesti != null){
        summary.capitalInvesti = capitalInvesti;
        summary.valorisationTotale = parseNum(c[PCOL.valorisationTotale]);
        summary.gainsEuros = parseNum(c[PCOL.gainsEuros]);
        summary.gainsPct = parseNum(c[PCOL.gainsPct]);
        summary.cashEuros = parseNum(c[PCOL.cashEuros]);
        summaryFound = true;
      }
    }

    const moisDate = parseStr(c[PCOL.moisDate]);
    if (moisDate && moisDate.toUpperCase() !== 'MOIS'){
      monthly.push({
        mois: moisDate,
        rendementMensuel: parseNum(c[PCOL.moisRendement]),
        rendementTotal: parseNum(c[PCOL.rendementTotal]),
        spxPerfMensuelle: parseNum(c[PCOL.spxPerfMensuelle]),
        spxPerfTotale: parseNum(c[PCOL.spxPerfTotale])
      });
    }
  }

  portfolioData = Object.assign({ holdings, monthly }, summary);
  renderPortfolio();
}

/* ============================================================
   HISTORIQUE DE PRIX DÉDIÉ — remplace le relais CORS Yahoo/Stooq comme source
   PRINCIPALE du graphique boursier (celui-ci reste en repli pour toute entreprise
   absente de cet onglet). Même chargement double CSV+gviz que les autres sources,
   avec son propre responseHandler gviz (3e source gviz simultanée sur la page —
   voir "Pièges techniques" point 9, chaque source gviz supplémentaire a besoin du
   sien, jamais du point d'entrée global partagé).
   ============================================================ */
let priceHistoryLoadSettled = false;

function loadPriceHistoryData(){
  priceHistoryLoadSettled = false;
  tryFetchPriceHistoryCSV();
  tryGvizPriceHistoryScript();
  setTimeout(() => { priceHistoryLoadSettled = true; }, 9000);
}

function tryFetchPriceHistoryCSV(){
  const controller = new AbortController();
  const hardTimeout = setTimeout(() => controller.abort(), 8000);
  fetch(PRICE_HISTORY_CSV_URL + '&_=' + Date.now(), { signal: controller.signal, cache:'no-store' })
    .then(async res => {
      if (priceHistoryLoadSettled) return;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (text.trim().toLowerCase().startsWith('<!doctype') || text.trim().toLowerCase().startsWith('<html')){
        throw new Error('Réponse HTML au lieu de CSV');
      }
      const parsed = Papa.parse(text.trim(), { skipEmptyLines:false });
      if (!parsed.data || parsed.data.length < 3) throw new Error('CSV vide ou illisible');
      if (priceHistoryLoadSettled) return;
      priceHistoryLoadSettled = true;
      clearTimeout(hardTimeout);
      handlePriceHistoryRows(parsed.data);
    })
    .catch(() => { clearTimeout(hardTimeout); });
}

function tryGvizPriceHistoryScript(){
  const old = document.getElementById('gvizPriceHistoryScript');
  if (old) old.remove();

  window.__handlePriceHistoryGviz = function(data){
    if (priceHistoryLoadSettled) return;
    try{
      if (!data || !data.table || !data.table.cols) throw new Error('table vide');
      const rows = [data.table.cols.map(c => c.label)].concat(
        (data.table.rows || []).map(r => (r.c || []).map(cell => cell ? (cell.f != null ? cell.f : cell.v) : ''))
      );
      priceHistoryLoadSettled = true;
      handlePriceHistoryRows(rows);
    }catch(e){ /* silencieux : le repli CSV ou le timeout de secours prendront le relais */ }
  };

  const script = document.createElement('script');
  script.id = 'gvizPriceHistoryScript';
  script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:__handlePriceHistoryGviz&gid=${PRICE_HISTORY_GID}&headers=1&_=${Date.now()}`;
  document.body.appendChild(script);
}

// Format du Sheet (voir commentaire sur PRICE_HISTORY_GID) : row0 = noms d'entreprise
// (colonnes paires 0-indexées), row1 = libellés "Date,Close" sans intérêt, row2+ =
// données. Chaque entreprise a SA PROPRE paire [colonne date, colonne clôture] — jamais
// d'axe de dates partagé entre entreprises (leurs historiques démarrent à des dates
// différentes), donc on n'apparie jamais une clôture à autre chose qu'à la date de SA
// propre colonne.
function parseFrenchSheetDate(str){
  const m = String(str || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return m[3] + '-' + m[2] + '-' + m[1]; // YYYY-MM-DD, même convention que Yahoo/Stooq
}

function handlePriceHistoryRows(rows){
  if (!rows || rows.length < 3) return;
  const header = rows[0];
  const nbEntreprises = Math.floor(header.length / 2);
  const result = {};

  for (let i = 0; i < nbEntreprises; i++){
    const nom = parseStr(header[2 * i]);
    if (!nom) continue;
    const dateCol = 2 * i, closeCol = 2 * i + 1;
    const series = [];
    for (let r = 2; r < rows.length; r++){
      const row = rows[r];
      if (!row) continue;
      const date = parseFrenchSheetDate(row[dateCol]);
      const close = parseNum(row[closeCol]);
      if (date && close != null) series.push({ date, close });
    }
    if (series.length) result[nom] = series.sort((a, b) => a.date < b.date ? -1 : 1);
  }

  priceHistoryData = result;

  // Si l'entreprise actuellement affichée vient d'obtenir sa source dédiée (chargée en
  // parallèle du reste, peut arriver après le premier rendu de l'onglet Analyse), on
  // relance le graphique boursier pour basculer dessus — stockRequestId invalide
  // proprement toute requête Yahoo/Stooq encore en vol pour l'ancienne source.
  if (activeCompany && companies[activeCompany]){
    const latest = companies[activeCompany][companies[activeCompany].length - 1];
    loadStockChart(latest.ticker, activeCompany);
  }
}

function findPriceHistoryForCompany(nom){
  const target = stripAccents(nom.toLowerCase());
  const key = Object.keys(priceHistoryData).find(k => stripAccents(k.toLowerCase()) === target);
  return key ? priceHistoryData[key] : null;
}

function fetchPriceHistorySeries(nom){
  const series = findPriceHistoryForCompany(nom);
  if (!series || series.length < 50) return null;
  return resampleWeekly(series.map(p => p.date), series.map(p => p.close));
}

/* ============================================================
   MACROÉCONOMIE — 3 onglets Sheet dédiés (même fichier publié, gids différents).
   Chargement générique factorisé (CSV + gviz, responseHandler dédié par source —
   voir "Pièges techniques" point 9, chaque source gviz supplémentaire a besoin du
   sien) : loadSheetDual() remplace la duplication qu'on aurait eue à écrire 3 fois de
   plus du même boilerplate déjà présent pour le Portfolio et l'historique de prix.
   ============================================================ */
function loadSheetDual(gid, handlerName, onRows){
  let settled = false;
  const csvUrl = `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_ID}/pub?gid=${gid}&single=true&output=csv`;
  const controller = new AbortController();
  const hardTimeout = setTimeout(() => controller.abort(), 8000);
  fetch(csvUrl + '&_=' + Date.now(), { signal: controller.signal, cache:'no-store' })
    .then(async res => {
      if (settled) return;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (text.trim().toLowerCase().startsWith('<')) throw new Error('HTML au lieu de CSV');
      const parsed = Papa.parse(text.trim(), { skipEmptyLines:false });
      if (!parsed.data || parsed.data.length < 3) throw new Error('CSV vide ou illisible');
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      onRows(parsed.data);
    })
    .catch(() => { clearTimeout(hardTimeout); });

  const old = document.getElementById('gviz_' + handlerName);
  if (old) old.remove();
  window[handlerName] = function(data){
    if (settled) return;
    try{
      if (!data || !data.table || !data.table.cols) throw new Error('table vide');
      const rows = [data.table.cols.map(c => c.label)].concat(
        (data.table.rows || []).map(r => (r.c || []).map(cell => cell ? (cell.f != null ? cell.f : cell.v) : ''))
      );
      settled = true;
      onRows(rows);
    }catch(e){ /* silencieux : le repli CSV ou le timeout de secours prendront le relais */ }
  };
  const script = document.createElement('script');
  script.id = 'gviz_' + handlerName;
  script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:${handlerName}&gid=${gid}&headers=1&_=${Date.now()}`;
  document.body.appendChild(script);
  setTimeout(() => { settled = true; }, 9000);
}

function colToIdx(letters){
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/* ---- Cycle de Marché : ratio Offensif (Techno+Finance+Industrie) vs Défensif
   (Santé+Conso. base+Services publics), déjà calculé dans le Sheet (EMA20 + écarts-
   types) — on lit directement les colonnes calculées, aucun recalcul de notre côté.
   Colonne Technologie réelle = O (pas K, qui contient encore XLK/100 brut : correction
   trouvée en inspectant le CSV réel, vérifiée valeur par valeur avant d'écrire ce code —
   voir "Pièges techniques" point 11). */
const MACRO_CYCLE_GID = '1014329874';
let macroCycleData = null; // { dates, ratio, ema, plus1, minus1, plus2, minus2, euphorie, panique }
let macroCycleRange = '20';

function loadMacroCycleData(){
  loadSheetDual(MACRO_CYCLE_GID, '__handleMacroCycleGviz', handleMacroCycleRows);
}

function handleMacroCycleRows(rows){
  const col = { date:colToIdx('G'), ratio:colToIdx('AV'), ema:colToIdx('AW'), p2:colToIdx('AY'), m2:colToIdx('AZ'), p1:colToIdx('BA'), m1:colToIdx('BB'), euph:colToIdx('BD'), pan:colToIdx('BE') };
  const out = { dates:[], ratio:[], ema:[], plus1:[], minus1:[], plus2:[], minus2:[], euphorie:[], panique:[] };
  for (let r = 2; r < rows.length; r++){
    const row = rows[r];
    if (!row) continue;
    const date = parseFrenchSheetDate(row[col.date]);
    const ratio = parseNum(row[col.ratio]);
    if (!date || ratio == null) continue;
    out.dates.push(date);
    out.ratio.push(ratio);
    out.ema.push(parseNum(row[col.ema]));
    out.plus1.push(parseNum(row[col.p1]));
    out.minus1.push(parseNum(row[col.m1]));
    out.plus2.push(parseNum(row[col.p2]));
    out.minus2.push(parseNum(row[col.m2]));
    out.euphorie.push(parseNum(row[col.euph]));
    out.panique.push(parseNum(row[col.pan]));
  }
  macroCycleData = out;
  document.getElementById('macroCycleStatus').style.display = 'none';
  renderMacroCycleChart();
}

function renderMacroCycleBadge(){
  const badge = document.getElementById('macroCycleBadge');
  if (!badge || !macroCycleData || !macroCycleData.dates.length) return;
  const i = macroCycleData.euphorie.length - 1;
  badge.className = 'macro-cycle-badge';
  if (macroCycleData.euphorie[i] === 1){ badge.textContent = '🔴 Euphorie'; badge.classList.add('euphorie'); }
  else if (macroCycleData.panique[i] === 1){ badge.textContent = '🔵 Panique'; badge.classList.add('panique'); }
  else badge.textContent = '⚪ Neutre';
}

function buildMacroCycleChartConfig(range){
  const d = macroCycleData;
  let startIdx = 0;
  if (range !== 'max'){
    const years = parseInt(range, 10);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const found = d.dates.findIndex(dt => new Date(dt) >= cutoff);
    startIdx = found === -1 ? 0 : found;
  }
  const slice = k => d[k].slice(startIdx);
  const labels = slice('dates');
  const bandStyle = (data, borderColor) => ({ data, borderColor, borderWidth:1.25, borderDash:[5,4], pointRadius:0, spanGaps:false, tension:0 });
  return {
    type:'line',
    data:{ labels, datasets:[
      { label:'Ratio Offensif/Défensif', data:slice('ratio'), borderColor:THEME.white, backgroundColor:'rgba(255,255,255,0.05)', fill:true, borderWidth:1.5, pointRadius:0, tension:0.12, spanGaps:false },
      { label:'EMA 20', data:slice('ema'), borderColor:THEME.red, borderWidth:1.75, pointRadius:0, spanGaps:false, tension:0.12 },
      Object.assign(bandStyle(slice('plus2'), THEME.red), { label:'+2σ' }),
      Object.assign(bandStyle(slice('minus2'), THEME.red), { label:'−2σ' }),
      Object.assign(bandStyle(slice('plus1'), THEME.blue), { label:'+1σ', _legend:false }),
      Object.assign(bandStyle(slice('minus1'), THEME.blue), { label:'−1σ', _legend:false })
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true, filter: item => item.datasetIndex < 4 } } },
      scales:{
        x:{ grid:{display:false}, ticks:{color:THEME.dim, maxTicksLimit:8}, border:{color:THEME.hair} },
        y:{ grid:baseGrid, ticks:{color:THEME.dim} }
      }
    }
  };
}

let macroCycleChart = null;
function renderMacroCycleChart(){
  if (!macroCycleData || !macroCycleData.dates.length) return;
  const canvas = document.getElementById('chartMacroCycle');
  if (!canvas) return;
  if (macroCycleChart) macroCycleChart.destroy();
  macroCycleChart = new Chart(canvas.getContext('2d'), buildMacroCycleChartConfig(macroCycleRange));
  renderMacroCycleBadge();
}

function openMacroCycleZoom(){
  if (!macroCycleData || !macroCycleData.dates.length) return;
  zoomMacroCycleRange = macroCycleRange;
  openZoom('macroCycle', 'Cycle de Marché — Offensif vs Défensif');
}

/* ---- Rotation Sectorielle GICS vs S&P 500 : 11 secteurs déjà exprimés en ratio
   (rebasé ~1.00 au début de la fenêtre disponible sur cet onglet, ~3 ans) — pas de
   ligne S&P 500 séparée à tracer, chaque secteur EST déjà "vs S&P 500", donc une simple
   ligne horizontale à 1.00 sert de repère (confirmé : pas de série S&P 500 dans la
   légende de la capture de référence fournie par l'utilisateur). */
const MACRO_ROTATION_GID = '1706659327';
const MACRO_ROTATION_SECTORS = [
  { key:'techno', label:'Technologie', col:'O' },
  { key:'sante', label:'Santé', col:'U' },
  { key:'consobase', label:'Consommation de base', col:'AA' },
  { key:'consodiscr', label:'Consommation discrétionnaire', col:'AG' },
  { key:'finance', label:'Finance', col:'AM' },
  { key:'industrie', label:'Industrie', col:'AS' },
  { key:'energie', label:'Energie', col:'AY' },
  { key:'materiaux', label:'Matériaux', col:'BE' },
  { key:'services', label:'Services Publics', col:'BK' },
  { key:'immobilier', label:'Immobilier', col:'BQ' },
  { key:'telecoms', label:'Télécoms', col:'BW' }
];
const MACRO_ROTATION_COLORS = ['#4A9FE0','#E5636B','#F0D63D','#4FD1A5','#D9A441','#8B7FE8','#F0C877','#7DBEEA','#E88AB0','#6FCF97','#B8842E'];
let macroRotationData = null; // { dates, series: { key: [valeurs] } }

function loadMacroRotationData(){
  loadSheetDual(MACRO_ROTATION_GID, '__handleMacroRotationGviz', handleMacroRotationRows);
}

function handleMacroRotationRows(rows){
  const dateIdx = colToIdx('G');
  const out = { dates:[], series:{} };
  MACRO_ROTATION_SECTORS.forEach(s => { out.series[s.key] = []; });
  const colIdx = {}; MACRO_ROTATION_SECTORS.forEach(s => { colIdx[s.key] = colToIdx(s.col); });

  for (let r = 2; r < rows.length; r++){
    const row = rows[r];
    if (!row) continue;
    const date = parseFrenchSheetDate(row[dateIdx]);
    if (!date) continue;
    out.dates.push(date);
    MACRO_ROTATION_SECTORS.forEach(s => out.series[s.key].push(parseNum(row[colIdx[s.key]])));
  }
  macroRotationData = out;
  document.getElementById('macroRotationStatus').style.display = 'none';
  renderMacroRotationChart();
  renderMacroWeightChart();
}

let macroRotationRange = '3';
function buildMacroRotationChartConfig(range){
  const d = macroRotationData;
  let startIdx = 0;
  if (range){
    const cutoff = new Date();
    // "m1"/"m2"/"m3" = mois (zoom fin, demandé explicitement en plus des plages en
    // années) ; sinon la valeur est un nombre d'années comme partout ailleurs.
    if (String(range).startsWith('m')) cutoff.setMonth(cutoff.getMonth() - parseInt(range.slice(1), 10));
    else cutoff.setFullYear(cutoff.getFullYear() - parseInt(range, 10));
    const found = d.dates.findIndex(dt => new Date(dt) >= cutoff);
    startIdx = found === -1 ? 0 : found;
  }
  const labels = d.dates.slice(startIdx);
  const datasets = MACRO_ROTATION_SECTORS.map((s, i) => ({
    label: s.label, data: d.series[s.key].slice(startIdx),
    borderColor: MACRO_ROTATION_COLORS[i], borderWidth:1.5, pointRadius:0, spanGaps:true, tension:0.1
  }));
  datasets.push({ label:'S&P 500 (repère)', data: labels.map(() => 1), borderColor:THEME.dim, borderWidth:1, borderDash:[3,3], pointRadius:0, spanGaps:false });
  return {
    type:'line',
    data:{ labels, datasets },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true, font:{size:9.5} } } },
      scales:{
        x:{ grid:{display:false}, ticks:{color:THEME.dim, maxTicksLimit:8}, border:{color:THEME.hair} },
        y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v.toLocaleString('fr-FR',{minimumFractionDigits:2})} }
      }
    }
  };
}

let macroRotationChart = null;
function renderMacroRotationChart(){
  if (!macroRotationData || !macroRotationData.dates.length) return;
  const canvas = document.getElementById('chartMacroRotation');
  if (!canvas) return;
  if (macroRotationChart) macroRotationChart.destroy();
  macroRotationChart = new Chart(canvas.getContext('2d'), buildMacroRotationChartConfig(macroRotationRange));
}

function openMacroRotationZoom(){
  if (!macroRotationData || !macroRotationData.dates.length) return;
  zoomMacroRotationRange = macroRotationRange;
  openZoom('macroRotation', 'Rotation Sectorielle GICS vs S&P 500');
}

// Poids relatif des secteurs : approximation à partir de la DERNIÈRE valeur de ratio
// de chaque secteur (macroRotationData), normalisée en %. Ce n'est PAS une vraie
// pondération de capitalisation boursière (les ratios sont rebasés à 1.00 au début de
// la fenêtre disponible, pas une mesure de taille absolue) — juste une lecture rapide
// de "qui pèse le plus dans le mouvement récent", d'où l'avertissement en sous-titre.
// Plugin custom pour afficher le % directement sur chaque part (Chart.js n'a pas de
// data labels intégrés) — afterDatasetsDraw comme les autres plugins custom du site
// (donut Portfolio), dessine après les segments mais avant tout plugin core.
function pieLabelsPlugin(){
  return {
    id:'pieLabels',
    afterDatasetsDraw(chart){
      const meta = chart.getDatasetMeta(0);
      const dataset = chart.data.datasets[0];
      const total = dataset.data.reduce((a, b) => a + b, 0);
      const ctx = chart.ctx;
      meta.data.forEach((arc, i) => {
        const pct = total ? dataset.data[i] / total * 100 : 0;
        if (pct < 3) return; // part trop fine pour un texte lisible
        const angle = (arc.startAngle + arc.endAngle) / 2;
        const r = (arc.innerRadius + arc.outerRadius) / 2;
        const x = arc.x + Math.cos(angle) * r;
        const y = arc.y + Math.sin(angle) * r;
        ctx.save();
        ctx.fillStyle = '#0D1013';
        ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pct.toLocaleString('fr-FR', {maximumFractionDigits:0}) + '%', x, y);
        ctx.restore();
      });
    }
  };
}
function buildMacroWeightChartConfig(){
  const d = macroRotationData;
  const lastIdx = d.dates.length - 1;
  const values = MACRO_ROTATION_SECTORS.map(s => {
    for (let r = lastIdx; r >= 0; r--){ const v = d.series[s.key][r]; if (v != null) return v; }
    return 0;
  });
  const total = values.reduce((a, b) => a + b, 0);
  return {
    type:'doughnut',
    data:{ labels: MACRO_ROTATION_SECTORS.map(s => s.label), datasets:[{ data: values, backgroundColor: MACRO_ROTATION_COLORS, borderColor:THEME.hair, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'45%',
      plugins:{
        legend:{ position:'right', labels:{ boxWidth:8, usePointStyle:true, font:{size:9.5}, color:THEME.dim } },
        tooltip:{ callbacks:{ label: ctx => {
          const pct = total ? (ctx.parsed / total * 100) : 0;
          return ctx.label + ' : ' + pct.toLocaleString('fr-FR', {minimumFractionDigits:1, maximumFractionDigits:1}) + '%';
        } } }
      }
    },
    plugins:[pieLabelsPlugin()]
  };
}
let macroWeightChart = null;
function renderMacroWeightChart(){
  if (!macroRotationData || !macroRotationData.dates.length) return;
  const canvas = document.getElementById('chartMacroWeight');
  if (!canvas) return;
  if (macroWeightChart) macroWeightChart.destroy();
  macroWeightChart = new Chart(canvas.getContext('2d'), buildMacroWeightChartConfig());
}
function openMacroWeightZoom(){
  if (!macroRotationData || !macroRotationData.dates.length) return;
  document.getElementById('zoomTitle').textContent = 'Poids relatif des secteurs';
  document.getElementById('zoomRangeRow').innerHTML = '';
  document.getElementById('zoomCagrRow').innerHTML = '';
  zoomKey = null;
  if (window.__zoomChart) window.__zoomChart.destroy();
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), buildMacroWeightChartConfig());
  document.getElementById('zoomModal').style.display = 'flex';
}

/* ---- Force relative sectorielle : onglet "Dashboard cycle", positions fixes (pas de
   reconnaissance de contenu ici — contrairement aux onglets "tableau de bord" comme
   Wolf Portfolio, celui-ci n'a qu'un seul petit bloc avec une mise en page stable,
   vérifiée directement sur le CSV réel avant d'écrire ce parsing). Colonne P = libellés
   de ligne, Q à AA = les 11 secteurs (labels + catégorie Cyclique/Défensif/Sensible lus
   directement du Sheet plutôt que codés en dur, pour rester fidèles à ses propres
   intitulés). */
const MACRO_POWER_GID = '30985186';
let macroPowerData = null; // { categories:[], headers:[], rows:[{label, values:[]}] }

function loadMacroPowerData(){
  loadSheetDual(MACRO_POWER_GID, '__handleMacroPowerGviz', handleMacroPowerRows);
}

function handleMacroPowerRows(rows){
  const pIdx = colToIdx('P');
  const colStart = colToIdx('Q'), colEnd = colToIdx('AA');
  const catRow = rows[12] || [];
  const headerRow = rows[14] || [];
  const categories = [], headers = [];
  for (let c = colStart; c <= colEnd; c++){
    categories.push(parseStr(catRow[c]));
    headers.push(parseStr(headerRow[c]));
  }
  const dataRows = [];
  for (let r = 15; r <= 24; r++){
    const row = rows[r];
    if (!row) continue;
    const label = parseStr(row[pIdx]);
    if (!label) continue;
    const values = [];
    for (let c = colStart; c <= colEnd; c++) values.push(parseNum(row[c]));
    dataRows.push({ label, values });
  }
  macroPowerData = { categories, headers, rows: dataRows };
  renderMacroPowerTable();
  renderMacroRankingChart();
}

// Version "couleur hex" des mêmes seuils que macroPowerColorClass(), pour les barres
// Chart.js (qui ont besoin d'une couleur directe, pas d'une classe CSS).
function macroPowerColorHex(v){
  if (v == null) return THEME.dim;
  if (v < -3) return THEME.red;
  if (v < 0) return 'rgba(229,99,107,0.55)';
  if (v < 5.5) return 'rgba(79,209,165,0.55)';
  return THEME.green;
}

// Graphique de classement : reprend directement la ligne "Classement" déjà calculée
// dans le Sheet (pondération 1/2/3 mois 0,5/0,3/0,2, confirmée par l'utilisateur —
// aucun recalcul nécessaire ici), triée du secteur le plus performant au moins
// performant.
// Sélecteur de ligne (pas une "plage" au sens strict, mais même famille d'usage) :
// pioche directement la ligne demandée dans macroPowerData (déjà calculée dans le
// Sheet, aucun recalcul) — "Classement" (score pondéré) ou une performance brute sur
// 1/2/3 mois. Les libellés "1 moi"/"2 mois"/"3 mois" reprennent exactement ceux du
// Sheet (dont un typo "moi" sans s, volontairement pas corrigé pour matcher la vraie
// ligne).
let macroRankingRow = 'Classement';
const MACRO_RANKING_OPTIONS = [['Classement','Classement'],['1 moi','1 mois'],['2 mois','2 mois'],['3 mois','3 mois']];
function buildMacroRankingChartConfig(rowLabel){
  const row = macroPowerData.rows.find(r => r.label === (rowLabel || macroRankingRow));
  if (!row) return null;
  const items = macroPowerData.headers
    .map((h, i) => ({ label:h, value:row.values[i] }))
    .filter(it => it.value != null)
    .sort((a, b) => b.value - a.value);
  return {
    type:'bar',
    data:{ labels: items.map(it => it.label), datasets:[{ data: items.map(it => it.value), backgroundColor: items.map(it => macroPowerColorHex(it.value)), borderRadius:4 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: ctx => (ctx.parsed.x >= 0 ? '+' : '') + ctx.parsed.x.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + '%' } } },
      scales:{
        x:{ grid:baseGrid, ticks:{ color:THEME.dim, callback:v=>v+'%' } },
        y:{ grid:{display:false}, ticks:{ color:THEME.dim, font:{size:10.5} } }
      }
    }
  };
}
let macroRankingChart = null;
function renderMacroRankingChart(){
  if (!macroPowerData) return;
  const config = buildMacroRankingChartConfig(macroRankingRow);
  if (!config) return;
  const canvas = document.getElementById('chartMacroRanking');
  if (!canvas) return;
  if (macroRankingChart) macroRankingChart.destroy();
  macroRankingChart = new Chart(canvas.getContext('2d'), config);
}
function openMacroRankingZoom(){
  zoomMacroRankingRow = macroRankingRow;
  openZoom('macroRanking', 'Classement sectoriel');
}

function macroPowerColorClass(v){
  if (v == null) return '';
  if (v < -3) return 'mp-red-strong';
  if (v < 0) return 'mp-red-light';
  if (v < 5.5) return 'mp-green-light';
  return 'mp-green-strong';
}

function renderMacroPowerTable(){
  const box = document.getElementById('macroPowerTable');
  if (!box || !macroPowerData) return;
  const { categories, headers, rows } = macroPowerData;
  box.innerHTML = `<table class="macro-power-table">
    <thead><tr><th></th>${headers.map((h, i) => `<th>${h}${categories[i] ? `<span class="mp-cat">${categories[i]}</span>` : ''}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr><td>${row.label}</td>${row.values.map(v => `<td class="${macroPowerColorClass(v)}">${v != null ? (v >= 0 ? '+' : '') + v.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + '%' : '—'}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

// Export PDF/PNG/JPEG des graphiques et tableaux macro. Getters (pas un accès direct
// via window[...]) car ces variables sont déclarées en `let` au niveau module — un
// top-level `let` ne devient PAS une propriété de `window` (contrairement à `var`),
// donc `window['macroCycleChart']` serait toujours undefined ; un getter lit la
// valeur actuelle de la variable à chaque appel, y compris après un destroy+recreate.
const MACRO_CHART_GETTERS = {
  cycle: () => macroCycleChart,
  rotation: () => macroRotationChart,
  weight: () => macroWeightChart,
  ranking: () => macroRankingChart
};
// Capture un graphique Chart.js en image haute résolution : Chart.js utilise par défaut
// window.devicePixelRatio pour la résolution interne du canvas, donc sur un écran non-Retina
// (dpr=1) un export PNG/JPEG/PDF ressort flou une fois zoomé/imprimé. On force temporairement
// une densité de 3x avant la capture, puis on restaure (resize() est nécessaire des deux
// côtés, Chart.js ne redimensionne pas le canvas tant qu'on ne le lui demande pas).
function chartToHiResDataUrl(chart, mime, scale){
  if (!chart) return null;
  const original = chart.options.devicePixelRatio || window.devicePixelRatio || 1;
  const HI_RES = scale || 3;
  const bump = original < HI_RES;
  if (bump){ chart.options.devicePixelRatio = HI_RES; chart.resize(); }
  const dataUrl = chart.toBase64Image(mime || 'image/png', 1.0);
  if (bump){ chart.options.devicePixelRatio = original; chart.resize(); }
  return dataUrl;
}
// Export PDF regroupant PLUSIEURS graphiques dans un seul document (Analyse complète,
// Valorisation complète, Macro complète) : signalé par l'utilisateur comme "les
// graphiques ne s'affichent pas" alors que le texte/les ratios s'affichent bien —
// cohérent avec une limite du moteur d'impression Chrome sur de très volumineuses
// images en base64 cumulées (plusieurs Mo au total à ×3), pas reproduit localement
// mais le risque est réel et le coût de la précaution est nul. Résolution réduite à
// ×2 (au lieu de ×3 pour un export à l'unité) pour un export groupé — encore net à
// l'impression, mais ~55% de volume de données en moins cumulé sur 9 images.
function chartToPrintDataUrl(chart){
  return chartToHiResDataUrl(chart, 'image/png', 2);
}
// Réencode une image en lui appliquant des coins arrondis (les PNG/JPEG téléchargés sont
// des pixels bruts — un border-radius CSS n'a d'effet que sur un <img> affiché/imprimé,
// jamais sur le fichier téléchargé lui-même, d'où ce passage par un canvas avec clip).
function roundedImageDataUrl(sourceDataUrl, mime, bgColor){
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      const r = Math.round(Math.min(img.width, img.height) * 0.025);
      if (bgColor){ ctx.fillStyle = bgColor; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, r);
      ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, r);
      ctx.arcTo(0, canvas.height, 0, 0, r);
      ctx.arcTo(0, 0, canvas.width, 0, r);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL(mime || 'image/png', 0.95));
    };
    img.onerror = () => resolve(sourceDataUrl);
    img.src = sourceDataUrl;
  });
}
// Export du graphique actuellement affiché dans la modale de zoom générique
// (#zoomModal, window.__zoomChart) — couvre les 9 graphiques de l'onglet Analyse (dont
// le cours de bourse), les graphiques macro zoomés et les camemberts de l'Analyse
// développée, sans dupliquer un bouton par type de graphique. Demande explicite :
// l'utilisateur ne trouvait cette possibilité que sur les graphiques macro.
function exportZoomChartAsPdf(){
  if (!window.__zoomChart) return;
  const title = document.getElementById('zoomTitle').textContent || 'Graphique';
  let dataUrl;
  // Canvas "tainté" possible (donut Portfolio, logos dessinés sans crossOrigin — voir
  // CLAUDE.md "Pièges techniques" point 13) : toBase64Image lève alors SecurityError.
  try{ dataUrl = chartToHiResDataUrl(window.__zoomChart); }
  catch(e){ alert("Ce graphique ne peut pas être exporté directement (image externe non compatible) — utilise le bouton d'export dédié de son onglet."); return; }
  const body = `<div class="print-section"><img class="print-chart-img" src="${dataUrl}" alt=""></div>`;
  exportSectionAsPdf(title, activeCompany || null, body);
}
async function exportZoomChartAsImage(format){
  if (!window.__zoomChart) return;
  const title = document.getElementById('zoomTitle').textContent || 'graphique';
  const filename = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'graphique';
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  let rawUrl;
  try{ rawUrl = chartToHiResDataUrl(window.__zoomChart, mime); }
  catch(e){ alert("Ce graphique ne peut pas être exporté directement (image externe non compatible) — utilise le bouton d'export dédié de son onglet."); return; }
  const url = await roundedImageDataUrl(rawUrl, mime, format === 'jpg' ? '#151A1F' : null);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename + '.' + (format === 'jpg' ? 'jpg' : 'png');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
function exportMacroChartAsPdf(key, title){
  const chart = MACRO_CHART_GETTERS[key] && MACRO_CHART_GETTERS[key]();
  if (!chart) return;
  const body = `<div class="print-section"><img class="print-chart-img" src="${chartToHiResDataUrl(chart)}" alt=""></div>`;
  exportSectionAsPdf(title, null, body);
}
async function exportMacroChartAsImage(key, filename, format){
  const chart = MACRO_CHART_GETTERS[key] && MACRO_CHART_GETTERS[key]();
  if (!chart) return;
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const rawUrl = chartToHiResDataUrl(chart, mime);
  const url = await roundedImageDataUrl(rawUrl, mime, format === 'jpg' ? '#151A1F' : null);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename + '.' + (format === 'jpg' ? 'jpg' : 'png');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
// Les tableaux (pas de canvas) n'ont que le PDF — un export PNG/JPEG fidèle d'un
// tableau HTML demanderait une librairie type html2canvas, écarté pour rester
// cohérent avec le choix déjà fait pour l'export PDF (voir "Pièges techniques" point 1
// : éviter d'ajouter une dépendance CDN de plus).
// Export complet des ratios : Analyse et Valorisation (demande explicite, en plus des
// exports déjà existants par graphique/onglet). Réutilise exportSectionAsPdf — les
// grilles de ratios (.ratio-grid/.ratio-card, .analyse-valo-*) sont des règles CSS
// globales (pas scoped à un média), donc leur outerHTML s'affiche correctement une
// fois copié dans #printArea sans dupliquer le CSS.
const ANALYSE_CHART_EXPORT_LIST = [
  ['stock', 'Cours de bourse'],
  ['div', 'Dividende & Payout ratio'],
  ['ca', "Chiffre d'affaires"],
  ['marges', 'Marge opérationnelle & ROIC'],
  ['fcf', 'FCF par action'],
  ['pfcf', 'P/FCF & Médiane P/FCF'],
  ['actions', 'Actions en circulation'],
  ['dette', 'Dette nette / OCF'],
  ['cash', 'Trésorerie & investissements']
];
function exportAnalyseFullAsPdf(){
  if (!activeCompany) return;
  const latest = companies[activeCompany][companies[activeCompany].length - 1];
  const logo = companyLogoUrl(activeCompany);
  const ratiosBox = document.querySelector('#pageAnalyse .ratio-grid');
  const ratiosHtml = ratiosBox ? `<div class="print-section"><h3>Ratios clés</h3>${ratiosBox.outerHTML}</div>` : '';
  const valoBox = document.getElementById('analyseValoCard');
  const valoHtml = (valoBox && valoBox.style.display !== 'none' && valoBox.innerHTML.trim())
    ? `<div class="print-section"><h3>Valorisation enregistrée</h3>${valoBox.outerHTML}</div>` : '';
  const chartsHtml = ANALYSE_CHART_EXPORT_LIST.map(([key, title]) => {
    const chart = chartInstances[key];
    if (!chart) return '';
    return `<div class="print-section"><h3>${title}</h3><img class="print-chart-img" src="${chartToPrintDataUrl(chart)}" alt=""></div>`;
  }).join('');
  exportSectionAsPdf(activeCompany, (latest.ticker || '') + ' — Analyse complète', ratiosHtml + valoHtml + chartsHtml, logo);
}
function exportValorisationFullAsPdf(){
  if (!activeCompany) return;
  const logo = companyLogoUrl(activeCompany);
  const summaryBox = document.querySelector('#pageValorisation .valo-summary');
  const summaryHtml = summaryBox ? `<div class="print-section"><h3>Résumé</h3>${summaryBox.outerHTML}</div>` : '';
  const scenariosHtml = SCENARIOS.map(s => {
    const v = scenarioValues[s.key];
    if (!v) return '';
    const chart = scenarioCharts[s.key];
    const img = chart ? `<img class="print-chart-img" src="${chartToPrintDataUrl(chart)}" alt="">` : '';
    const rows = ['prixJuste', 'prixCible', 'prixEst', 'rendement'].map(k => {
      const el = document.getElementById('vo-' + s.key + '-' + k);
      if (!el) return '';
      const kEl = el.parentElement && el.parentElement.querySelector('.r-k');
      return `<tr><td>${kEl ? kEl.textContent : k}</td><td>${el.textContent}</td></tr>`;
    }).join('');
    return `<div class="print-section"><h3>${s.label} — CAGR ${v.cagr}% / Multiple ${v.multiple}x</h3>${img}<table class="print-table">${rows}</table></div>`;
  }).join('');
  exportSectionAsPdf(activeCompany, valorisationMetric.toUpperCase() + ' — Simulations scénarisées', summaryHtml + scenariosHtml, logo);
}
function exportMacroTableAsPdf(boxId, title){
  const box = document.getElementById(boxId);
  if (!box) return;
  exportSectionAsPdf(title, null, `<div class="print-section">${box.innerHTML}</div>`);
}
// Export global demandé par l'utilisateur : les 4 graphiques + les 2 tableaux de
// l'onglet Macroéconomie dans un seul document PDF, plutôt que 6 exports séparés.
const MACRO_EXPORT_ALL_CHARTS = [
  ['cycle', 'Cycle de Marché — Offensif vs Défensif'],
  ['rotation', 'Rotation Sectorielle GICS vs S&P 500'],
  ['weight', 'Poids relatif des secteurs'],
  ['ranking', 'Classement sectoriel']
];
const MACRO_EXPORT_ALL_TABLES = [
  ['macroPowerTable', 'Force relative sectorielle'],
  ['macroFundamentalsTable', 'Indicateurs macroéconomiques (États-Unis)']
];
function exportMacroFullPageAsPdf(){
  const chartHtml = MACRO_EXPORT_ALL_CHARTS.map(([key, title]) => {
    const chart = MACRO_CHART_GETTERS[key] && MACRO_CHART_GETTERS[key]();
    if (!chart) return '';
    return `<div class="print-section"><h3>${title}</h3><img class="print-chart-img" src="${chartToPrintDataUrl(chart)}" alt=""></div>`;
  }).join('');
  const tableHtml = MACRO_EXPORT_ALL_TABLES.map(([id, title]) => {
    const box = document.getElementById(id);
    if (!box || !box.querySelector('table')) return '';
    return `<div class="print-section"><h3>${title}</h3>${box.innerHTML}</div>`;
  }).join('');
  exportSectionAsPdf('Macroéconomie', "Vue d'ensemble — graphiques et tableaux", chartHtml + tableHtml);
}

// Indicateurs macro US (PIB, taux, inflation) : en attente des 2 clés API gratuites
// (BEA + FRED, voir CLAUDE.md "Onglet Macroéconomie") pour un chargement automatique —
// tant qu'elles ne sont pas fournies, affiche un message explicite plutôt qu'un bloc vide.
// Clés fournies par l'utilisateur pour ce chargement 100% client (voir CLAUDE.md
// "Onglet Macroéconomie" — clés gratuites, faible privilège, pas de risque financier
// en cas d'exposition, contrairement à une clé payante).
const BEA_API_KEY = '856D6733-5908-4AA9-B95C-8A06DC3DD0B9';
const FRED_API_KEY = '20504787eb914aca27e3c1f273fd493a';
const MACRO_FUND_LS_KEY = 'wolfAnalysisMacroFundamentals';
const MACRO_FUND_MIN_YEAR = 2006; // même fenêtre que les autres historiques du site
const MACRO_FUND_CACHE_MS = 24 * 3600 * 1000; // 1 jour — évite de re-fetch à chaque visite
let macroFundamentalsData = null;

// BEA envoie Access-Control-Allow-Origin:* (vérifié directement), appelable en
// direct depuis le navigateur — contrairement à FRED (voir plus bas).
async function fetchBeaTable(tableName){
  const url = `https://apps.bea.gov/api/data?UserID=${BEA_API_KEY}&method=GetData&datasetname=NIPA&TableName=${tableName}&Frequency=Q&Year=X&ResultFormat=JSON`;
  const res = await fetch(url, { cache:'no-store' });
  const json = await res.json();
  return (json.BEAAPI && json.BEAAPI.Results && json.BEAAPI.Results.Data) || [];
}

function beaLineSeries(data, lineNumber){
  const out = {};
  data.forEach(r => {
    if (String(r.LineNumber) === String(lineNumber) && /^\d{4}Q[1-4]$/.test(r.TimePeriod)){
      const year = parseInt(r.TimePeriod.slice(0, 4), 10);
      if (year >= MACRO_FUND_MIN_YEAR) out[r.TimePeriod] = parseFloat(String(r.DataValue).replace(/,/g, ''));
    }
  });
  return out;
}

// FRED n'envoie aucun en-tête CORS (vérifié, même comportement que Yahoo/Stooq) —
// passe par le même relais déjà en place (fetchWithRetry/corsProxyUrls).
async function fetchFredSeries(seriesId, units){
  const params = `series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json${units ? '&units=' + units : ''}&observation_start=${MACRO_FUND_MIN_YEAR}-01-01`;
  const res = await fetchWithRetry(`https://api.stlouisfed.org/fred/series/observations?${params}`, { cache:'no-store' }, 15000);
  const json = await res.json();
  return json.observations || [];
}

// Dernière observation connue à la date donnée ou avant (fin de trimestre) — pas une
// moyenne, juste "où en était-on à ce moment-là".
function fredValueAtOrBefore(observations, dateStr){
  let val = null;
  for (const o of observations){
    if (o.date > dateStr) break;
    if (o.value !== '.') val = parseFloat(o.value);
  }
  return val;
}

const MACRO_FUND_QUARTER_END = { Q1:'-03-31', Q2:'-06-30', Q3:'-09-30', Q4:'-12-31' };

function renderMacroFundamentalsError(){
  const box = document.getElementById('macroFundamentalsTable');
  let staleNote = '';
  let stale = null;
  try{ stale = JSON.parse(localStorage.getItem(MACRO_FUND_LS_KEY) || 'null'); }catch(e){ /* ignore */ }
  if (stale && stale.rows && stale.rows.length){
    macroFundamentalsData = stale.rows;
    const ageDays = Math.floor((Date.now() - stale.fetchedAt) / 86400000);
    staleNote = `<p class="macro-fund-note">⚠️ Rafraîchissement échoué (BEA/FRED indisponibles ou relais CORS en
      panne temporaire) — dernières données connues affichées, mises à jour il y a ${ageDays} jour${ageDays > 1 ? 's' : ''}.</p>`;
    renderMacroFundamentalsTable();
    if (box) box.insertAdjacentHTML('afterbegin', staleNote);
    return;
  }
  if (box) box.innerHTML = `<p class="macro-fund-note">Impossible de charger les indicateurs macro pour le moment
    (BEA/FRED indisponibles, clé invalide, ou relais CORS temporairement en panne).
    <button id="macroFundRetryBtn" class="macro-fund-retry">↻ Réessayer</button></p>`;
  const retryBtn = document.getElementById('macroFundRetryBtn');
  if (retryBtn) retryBtn.addEventListener('click', () => loadMacroFundamentalsData(true));
}

async function loadMacroFundamentalsData(forceRefresh){
  if (!forceRefresh){
    try{
      const cached = JSON.parse(localStorage.getItem(MACRO_FUND_LS_KEY) || 'null');
      if (cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < MACRO_FUND_CACHE_MS){
        macroFundamentalsData = cached.rows;
        renderMacroFundamentalsTable();
        return;
      }
    }catch(e){ /* cache corrompu — on refetch normalement */ }
  }

  try{
    const [t10101, t10105, dgs10, dgs2, cpi] = await Promise.all([
      fetchBeaTable('T10101'), fetchBeaTable('T10105'),
      fetchFredSeries('DGS10'), fetchFredSeries('DGS2'), fetchFredSeries('CPIAUCSL', 'pc1')
    ]);

    // Lignes confirmées une par une contre les valeurs déjà saisies manuellement par
    // l'utilisateur dans le Sheet avant d'écrire ce mapping (mêmes précautions que pour
    // les colonnes de la feuille "Cycle de Marché", voir "Pièges techniques" point 14) :
    // T10101 L2=Consommation, L7=Investissement, L22=Dépenses publiques (% variation
    // annualisée) ; T10105 L1=PIB nominal, L15=Exportations nettes (niveau, $) — la
    // colonne "X-M Md$" du Sheet s'est avérée être la VARIATION trimestre sur trimestre
    // du niveau, pas le niveau lui-même (vérifié : la différence entre deux trimestres
    // consécutifs de L15 correspond exactement aux valeurs déjà présentes dans le Sheet).
    const cSeries = beaLineSeries(t10101, 2);
    const iSeries = beaLineSeries(t10101, 7);
    const gSeries = beaLineSeries(t10101, 22);
    const gdpSeries = beaLineSeries(t10105, 1);
    const netExSeries = beaLineSeries(t10105, 15);
    // Croissance RÉELLE du PIB (T10101 ligne 1, % variation annualisée, chaîné —
    // équivalent à la série FRED GDPC1/A191RL) en plus du niveau nominal — sans elle,
    // le PIB n'était affiché qu'en niveau brut ($ courants), sans indication de
    // croissance, ce qui pouvait donner une impression de donnée incomplète/incohérente.
    const gdpGrowthSeries = beaLineSeries(t10101, 1);

    const quarters = Object.keys(gdpSeries).sort();
    const rows = [];
    let prevNetEx = null;
    quarters.forEach(q => {
      const qn = q.slice(4);
      const endDate = q.slice(0, 4) + MACRO_FUND_QUARTER_END[qn];
      const taux10 = fredValueAtOrBefore(dgs10, endDate);
      const taux2 = fredValueAtOrBefore(dgs2, endDate);
      const inflation = fredValueAtOrBefore(cpi, endDate);
      const netEx = netExSeries[q] != null ? netExSeries[q] / 1000 : null;
      const trade = (netEx != null && prevNetEx != null) ? netEx - prevNetEx : null;
      if (netEx != null) prevNetEx = netEx;
      rows.push({
        quarter: qn + ' ' + q.slice(0, 4),
        gdp: gdpSeries[q] != null ? gdpSeries[q] / 1000 : null,
        gdpGrowth: gdpGrowthSeries[q],
        c: cSeries[q], i: iSeries[q], g: gSeries[q],
        trade, taux10, taux2,
        spread: (taux10 != null && taux2 != null) ? taux10 - taux2 : null,
        inflation,
        realRate: (taux10 != null && inflation != null) ? taux10 - inflation : null
      });
    });

    macroFundamentalsData = rows;
    try{ localStorage.setItem(MACRO_FUND_LS_KEY, JSON.stringify({ fetchedAt: Date.now(), rows })); }catch(e){ /* quota / navigateur privé */ }
    renderMacroFundamentalsTable();
  }catch(e){
    renderMacroFundamentalsError();
  }
}

// Seuils donnés explicitement par l'utilisateur pour ce tableau (distincts de ceux du
// tableau de force relative sectorielle) : négatif = rouge, [0,1) = vert clair,
// [1,2) = orange, ≥2 = vert vif. Appliqué uniquement aux colonnes en %
// (croissance/taux/spread/inflation) — PAS au niveau du PIB ni à la balance
// commerciale, exprimés en Md$, une échelle où ce seuillage n'aurait pas de sens.
function macroFundColorClass(v){
  if (v == null) return '';
  if (v < 0) return 'mf-red';
  if (v < 1) return 'mf-green-light';
  if (v < 2) return 'mf-orange';
  return 'mf-green-strong';
}

function renderMacroFundamentalsTable(){
  const box = document.getElementById('macroFundamentalsTable');
  if (!box || !macroFundamentalsData) return;
  const recent = macroFundamentalsData.slice(-12);
  const pct = (v, dec) => v != null ? (v >= 0 ? '+' : '') + v.toLocaleString('fr-FR', {minimumFractionDigits:dec || 2, maximumFractionDigits:dec || 2}) + '%' : '—';
  const pctCell = (v, dec) => `<td class="${macroFundColorClass(v)}">${pct(v, dec)}</td>`;
  const bn = v => v != null ? v.toLocaleString('fr-FR', {maximumFractionDigits:0}) + ' Md$' : '—';
  box.innerHTML = `<div style="overflow-x:auto"><table class="macro-fund-table"><thead><tr>
      <th>Trimestre</th><th>PIB (niveau)</th><th>PIB (croissance réelle)</th><th>Consommation</th><th>Investissement</th><th>Dépenses publ.</th>
      <th>Balance comm. (Δ)</th><th>Taux 10 ans</th><th>Taux 2 ans</th><th>Spread 10-2</th><th>Inflation</th><th>Taux réel</th>
    </tr></thead><tbody>${recent.map(r => `<tr>
      <td>${r.quarter}</td><td>${bn(r.gdp)}</td>${pctCell(r.gdpGrowth, 1)}${pctCell(r.c, 1)}${pctCell(r.i, 1)}${pctCell(r.g, 1)}
      <td>${r.trade != null ? (r.trade >= 0 ? '+' : '') + r.trade.toLocaleString('fr-FR', {maximumFractionDigits:0}) + ' Md$' : '—'}</td>
      ${pctCell(r.taux10, 2)}${pctCell(r.taux2, 2)}${pctCell(r.spread, 2)}${pctCell(r.inflation, 1)}${pctCell(r.realRate, 2)}
    </tr>`).join('')}</tbody></table></div>
    <p class="macro-fund-note" style="margin-top:10px;">Sources : BEA table T10101 (croissance réelle du PIB, de la
    consommation, de l'investissement, des dépenses publiques — % annualisé, révisé, jamais une projection) et
    T10105 (niveau du PIB, balance commerciale) ; FRED séries DGS10/DGS2 (taux quotidiens réels de marché) et
    CPIAUCSL (inflation YoY réelle) — spread et taux réel calculés par simple soustraction. Rechargé
    automatiquement toutes les 24h.</p>`;
}

const PORTFOLIO_COLORS = ['#D9A441','#4A9FE0','#F0C877','#7DBEEA','#B8842E','#2E6FA3','#F5DDA3','#A8D4F0','#8A6420','#1F4E73'];
const WOLF_LOGO_URL = 'https://i.postimg.cc/43WmYDB1/20260714-LOGO-WINTER-PNG.png';

/* ============================================================
   EXPORT PDF — window.print() + zone dédiée (#printArea), pas de librairie externe
   (jsPDF/html2canvas auraient ajouté une dépendance CDN fragile pour un site qui a
   déjà dû contourner ce problème pour Chart.js — voir "Pièges techniques"). Le
   bouton "Exporter PDF" construit le HTML imprimable dans #printArea puis déclenche
   window.print() ; la feuille @media print (style.css) masque tout le reste de la
   page et n'affiche que cette zone — le navigateur propose "Enregistrer en PDF"
   nativement dans sa boîte de dialogue d'impression.
   ============================================================ */
function printImagesRowHtml(images){
  if (!images || !images.length) return '';
  return `<div class="print-img-row">${images.map(src => `<img src="${src}" alt="">`).join('')}</div>`;
}
// Résout le logo d'une entreprise SUIVIE (companies[nom]), même correspondance que
// portfolioEntityLogo()/cerveauEntityCard() — résolu à chaque appel (jamais mis en
// cache en dur), donc apparaît automatiquement dès que l'entreprise est ajoutée au
// Sheet, sans changement de code.
function companyLogoUrl(nom){
  if (!nom) return null;
  const match = Object.keys(companies).find(n => stripAccents(n.toLowerCase()) === stripAccents(nom.toLowerCase()));
  return match ? companies[match][companies[match].length - 1].lienImage || null : null;
}

function exportSectionAsPdf(title, subtitle, bodyHtml, entityLogoUrl){
  const area = document.getElementById('printArea');
  const dateLabel = new Date().toLocaleDateString('fr-FR', { year:'numeric', month:'long', day:'numeric' });
  area.innerHTML = `
    <div class="print-header">
      <img src="${WOLF_LOGO_URL}" alt="">
      ${entityLogoUrl ? `<img class="print-entity-logo" src="${entityLogoUrl}" alt="">` : ''}
      <div>
        <div class="print-title">${title}</div>
        <div class="print-subtitle">${subtitle ? subtitle + ' — ' : ''}${dateLabel}</div>
      </div>
    </div>
    ${bodyHtml}
    <div class="print-footer">Wolf Analysis — document généré automatiquement</div>`;
  window.print();
}
// Capture un canvas Chart.js vivant en image (le canvas lui-même ne peut pas être
// déplacé/cloné dans #printArea sans perdre son rendu — Chart.js dessine sur un
// contexte précis, une copie DOM du <canvas> serait vierge).
function chartCanvasToImgHtml(canvasId, altLabel, chartInstance){
  const canvas = document.getElementById(canvasId);
  if (!canvas) return '';
  try{
    const dataUrl = chartInstance ? chartToHiResDataUrl(chartInstance) : canvas.toDataURL('image/png');
    return `<img class="print-chart-img" src="${dataUrl}" alt="${altLabel || ''}">`;
  }
  catch(e){ return ''; } // canvas taint (image cross-origin) — on omet simplement l'image
}

function portfolioEntityLogo(nom){
  const match = Object.keys(companies).find(n => stripAccents(n.toLowerCase()) === stripAccents(nom.toLowerCase()));
  return match ? companies[match][companies[match].length - 1].lienImage : null;
}

// Cache d'images pour le donut (logo central Wolf + logo de chaque position, dessinés
// sur le canvas via des plugins Chart.js custom — Chart.js seul ne sait pas placer une
// image sur un anneau). Une image manquante ou pas encore chargée ne bloque rien : le
// plugin redessine simplement sans elle, puis se redessine dès qu'elle arrive.
const portfolioImageCache = {};
function loadImageCached(src){
  if (!src) return Promise.resolve(null);
  if (portfolioImageCache[src]) return Promise.resolve(portfolioImageCache[src]);
  return new Promise(resolve => {
    // Pas de crossOrigin ici : ces logos ne sont jamais relus depuis le canvas
    // (pas de toDataURL/getImageData sur ce graphique), donc pas besoin d'un CORS
    // explicite — l'exiger ferait juste échouer le chargement des logos dont
    // l'hébergeur ne renvoie pas d'en-tête CORS (ex. Air Liquide).
    const img = new Image();
    img.onload = () => { portfolioImageCache[src] = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function portfolioCenterImagePlugin(){
  return {
    id: 'portfolioCenterImage',
    // afterDatasetsDraw (pas afterDraw) : les plugins "core" comme le tooltip
    // s'exécutent en afterDraw APRÈS les plugins custom passés dans la config —
    // dessiner ici plutôt garantit que le tooltip survolé reste au-dessus du logo
    // (et pas l'inverse, bug remonté par l'utilisateur).
    afterDatasetsDraw(chart){
      const img = portfolioImageCache[WOLF_LOGO_URL];
      const meta = chart.getDatasetMeta(0);
      if (!img || !meta.data[0]) return;
      const arc = meta.data[0];
      const inner = arc.innerRadius;
      const size = inner * 1.55;
      const ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.arc(arc.x, arc.y, inner * 0.92, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, arc.x - size / 2, arc.y - size / 2, size, size);
      ctx.restore();
    }
  };
}

function portfolioSegmentLogosPlugin(){
  return {
    id: 'portfolioSegmentLogos',
    // afterDatasetsDraw (pas afterDraw) : les plugins "core" comme le tooltip
    // s'exécutent en afterDraw APRÈS les plugins custom passés dans la config —
    // dessiner ici plutôt garantit que le tooltip survolé reste au-dessus du logo
    // (et pas l'inverse, bug remonté par l'utilisateur).
    afterDatasetsDraw(chart){
      const meta = chart.getDatasetMeta(0);
      const dataset = chart.data.datasets[0];
      const total = dataset.data.reduce((a, b) => a + b, 0);
      const ctx = chart.ctx;
      meta.data.forEach((arc, i) => {
        const pct = total ? dataset.data[i] / total : 0;
        if (pct < 0.02) return; // segment trop fin pour un logo lisible
        const angle = (arc.startAngle + arc.endAngle) / 2;
        const r = (arc.innerRadius + arc.outerRadius) / 2;
        const x = arc.x + Math.cos(angle) * r;
        const y = arc.y + Math.sin(angle) * r;
        const size = Math.min(56, Math.max(24, (arc.outerRadius - arc.innerRadius) * 0.9));
        const src = dataset._logos && dataset._logos[i];
        const img = src && portfolioImageCache[src];
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        const label = String(chart.data.labels[i]);
        if (img){
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, size / 2 - 1, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
          ctx.restore();
        } else if (label.toUpperCase() === 'CASH'){
          ctx.font = Math.round(size * 0.55) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('💶', x, y);
        } else {
          ctx.fillStyle = '#0D1013';
          ctx.font = 'bold ' + Math.round(size * 0.42) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label.charAt(0).toUpperCase(), x, y);
        }
        ctx.restore();
      });
    }
  };
}

// Construit une config Chart.js fraîche à chaque appel (jamais un objet partagé entre
// deux instances Chart.js vivantes : Chart.js mutant `options`/`cutout` en interne pour
// résoudre les valeurs scriptables, réutiliser le même objet entre le graphique normal
// et sa version zoomée fait planter la seconde instance — TypeError constaté en test).
function buildPortfolioDonutConfig(){
  const holdings = portfolioData.holdings.filter(h => h.valorisation != null && h.valorisation > 0);
  if (!holdings.length) return null;
  const total = holdings.reduce((s, h) => s + h.valorisation, 0);
  const logos = holdings.map(h => portfolioEntityLogo(h.nom));
  return {
    type:'doughnut',
    data:{
      labels: holdings.map(h => h.nom),
      datasets:[{
        data: holdings.map(h => h.valorisation),
        backgroundColor: holdings.map((_, i) => PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length]),
        borderColor: THEME.hair, borderWidth:2,
        _logos: logos
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'46%',
      plugins:{
        legend:{ display:false },
        // position:'nearest' + caretPadding : la bulle suit le curseur au lieu de
        // rester fixe au centre du segment (là où le logo est dessiné), ce qui évitait
        // de se superposer au logo — retour utilisateur ("le logo passe par-dessus").
        tooltip:{ position:'nearest', caretPadding:14, callbacks:{ label: ctx => {
          const pct = total ? (ctx.parsed / total * 100) : 0;
          return ctx.label + ' : ' + ctx.parsed.toLocaleString('fr-FR',{maximumFractionDigits:0}) + ' € (' + pct.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}) + '%)';
        } } }
      }
    },
    plugins:[portfolioCenterImagePlugin(), portfolioSegmentLogosPlugin()],
    _logos: logos
  };
}

let portfolioDonutChart = null;
async function renderPortfolioDonut(){
  const canvas = document.getElementById('chartPortfolioDonut');
  if (!canvas) return;
  if (portfolioDonutChart) portfolioDonutChart.destroy();
  const config = buildPortfolioDonutConfig();
  if (!config) return;

  // Précharge le logo central + ceux des positions avant de créer le graphique — pas
  // bloquant si une image échoue (loadImageCached résout quand même, avec null).
  Promise.all([WOLF_LOGO_URL, ...config._logos].map(loadImageCached)).then(() => {
    if (portfolioDonutChart) portfolioDonutChart.update();
  });

  portfolioDonutChart = new Chart(canvas.getContext('2d'), config);
}

// Zoom dédié (pas via chartConfigs/openZoom) : ce donut a des plugins custom et pas de
// notion d'années/CAGR, donc il ne correspond pas au système générique de zoom conçu
// pour les 8 graphiques historiques. Réutilise le même #zoomModal (donc le même pied de
// page "Données fournies par Wolf Analysis"), juste sans les lignes plage/CAGR.
function openPortfolioZoom(){
  const config = buildPortfolioDonutConfig();
  if (!config) return;
  document.getElementById('zoomTitle').textContent = 'Répartition — Wolf Portfolio';
  document.getElementById('zoomRangeRow').innerHTML = '';
  document.getElementById('zoomCagrRow').innerHTML = '';
  zoomKey = null;
  if (window.__zoomChart) window.__zoomChart.destroy();
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), config);
  document.getElementById('zoomModal').style.display = 'flex';
}

function renderPortfolioHoldingsList(){
  const box = document.getElementById('portfolioHoldingsList');
  if (!box) return;
  const holdings = portfolioData.holdings.filter(h => h.valorisation != null);
  const total = holdings.reduce((s, h) => s + h.valorisation, 0);

  box.innerHTML = holdings.length ? holdings
    .slice().sort((a, b) => b.valorisation - a.valorisation)
    .map((h, i) => {
      const pct = total ? (h.valorisation / total * 100) : 0;
      const logo = portfolioEntityLogo(h.nom);
      const perfClass = h.perf == null ? '' : (h.perf >= 0 ? 'pos' : 'neg');
      const swatch = PORTFOLIO_COLORS[holdings.indexOf(h) % PORTFOLIO_COLORS.length];
      return `<div class="portfolio-holding-row">
        <span class="portfolio-holding-swatch" style="background:${swatch}"></span>
        <div class="portfolio-holding-logo">${logo ? `<img src="${logo}" alt="">` : h.nom.toUpperCase() === 'CASH' ? `<span>💶</span>` : `<span>${h.nom.charAt(0).toUpperCase()}</span>`}</div>
        <div class="portfolio-holding-name">${h.nom}</div>
        <div class="portfolio-holding-pct">${pct.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</div>
        <div class="portfolio-holding-perf ${perfClass}">${h.perf != null ? (h.perf >= 0 ? '+' : '') + fmtPct(h.perf) : '—'}</div>
      </div>`;
    }).join('') : '<div class="objectifs-empty">Données du portefeuille indisponibles pour l\'instant.</div>';
}

// Le donut affiché à l'écran dessine les logos DES POSITIONS directement sur son canvas
// sans crossOrigin (voir portfolioSegmentLogosPlugin — volontaire, sinon les logos sans
// en-tête CORS comme Air Liquide ne se chargeraient plus). Ça "tainte" ce canvas :
// impossible d'en extraire une image (toDataURL lève SecurityError). Pour le PDF, on
// reconstruit donc un graphique jetable hors-écran — sans les logos de position custom —
// mais AVEC le logo Wolf au centre : contrairement aux logos de position (CORS non
// garanti selon l'hébergeur), le logo Wolf est hébergé sur postimg.cc qui envoie bien
// Access-Control-Allow-Origin (vérifié), donc le charger avec crossOrigin='anonymous'
// ici ne casse rien et ne tainte pas ce canvas dédié à l'export.
function loadImageCorsSafe(src){
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
async function buildPortfolioExportChartImg(holdings){
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 480;
  const wolfImg = await loadImageCorsSafe(WOLF_LOGO_URL);
  const centerLogoPlugin = {
    id:'exportCenterLogo',
    afterDatasetsDraw(chart){
      if (!wolfImg) return;
      const meta = chart.getDatasetMeta(0);
      if (!meta.data[0]) return;
      const arc = meta.data[0];
      const size = arc.innerRadius * 1.55;
      const ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.arc(arc.x, arc.y, arc.innerRadius * 0.92, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(wolfImg, arc.x - size / 2, arc.y - size / 2, size, size);
      ctx.restore();
    }
  };
  const chart = new Chart(canvas.getContext('2d'), {
    type:'doughnut',
    data:{ labels: holdings.map(h => h.nom), datasets:[{ data: holdings.map(h => h.valorisation), backgroundColor: holdings.map((_, i) => PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length]), borderColor:'#151A1F', borderWidth:2 }] },
    options:{ responsive:false, animation:false, cutout:'46%', devicePixelRatio:3,
      plugins:{ legend:{ position:'right', labels:{ boxWidth:10, font:{ size:11 }, color:'#E9EBEE' } } } },
    plugins:[centerLogoPlugin]
  });
  let dataUrl = '';
  try{ dataUrl = await roundedImageDataUrl(canvas.toDataURL('image/png'), 'image/png'); }catch(e){ /* improbable ici : seule image externe = logo Wolf, CORS-safe */ }
  chart.destroy();
  return dataUrl ? `<img class="print-chart-img" src="${dataUrl}" alt="Répartition du portefeuille">` : '';
}

async function exportPortfolioAsPdf(){
  const summary = `<div class="print-section"><h3>Résumé</h3>
    <table class="print-table"><tbody>
      <tr><th>Capital investi</th><td>${document.getElementById('pfCapitalInvesti').textContent}</td></tr>
      <tr><th>Valorisation actuelle</th><td>${document.getElementById('pfValorisation').textContent}</td></tr>
      <tr><th>Cash disponible</th><td>${document.getElementById('pfCash').textContent}</td></tr>
      <tr><th>Gains / pertes</th><td>${document.getElementById('pfGainsEuros').textContent}</td></tr>
      <tr><th>Performance</th><td>${document.getElementById('pfGainsPct').textContent}</td></tr>
    </tbody></table></div>`;

  const holdingsForChart = portfolioData.holdings.filter(h => h.valorisation != null && h.valorisation > 0);
  const chartImg = await buildPortfolioExportChartImg(holdingsForChart);
  const chartSection = chartImg ? `<div class="print-section"><h3>Répartition</h3>${chartImg}</div>` : '';

  // Le donut exporté ne peut pas porter les logos de position (canvas tainté par le
  // CORS, voir "Pièges techniques" point 13) — on les remet ici, dans le tableau, qui
  // n'a pas cette contrainte (de simples <img>, jamais relues en pixels).
  const holdings = portfolioData.holdings.filter(h => h.valorisation != null).slice().sort((a, b) => b.valorisation - a.valorisation);
  const total = holdings.reduce((s, h) => s + h.valorisation, 0);
  const rows = holdings.map(h => {
    const pct = total ? (h.valorisation / total * 100) : 0;
    const logo = companyLogoUrl(h.nom);
    const logoImg = logo ? `<img class="print-inline-logo" src="${logo}" alt="">` : '';
    return `<tr><td>${logoImg}${h.nom}</td><td>${pct.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</td><td>${h.perf != null ? (h.perf >= 0 ? '+' : '') + fmtPct(h.perf) : '—'}</td></tr>`;
  }).join('');
  const table = `<div class="print-section"><h3>Positions</h3><table class="print-table"><thead><tr><th>Entreprise</th><th>Poids</th><th>Performance</th></tr></thead><tbody>${rows}</tbody></table></div>`;

  exportSectionAsPdf('Wolf Portfolio — Composition', null, summary + chartSection + table);
}

let portfolioVsSpxChart = null;
function renderPortfolioVsSpx(){
  const canvas = document.getElementById('chartPortfolioVsSpx');
  if (!canvas) return;
  if (portfolioVsSpxChart) portfolioVsSpxChart.destroy();
  // Le Sheet a des lignes de mois pré-remplies au-delà du mois courant (dates futures
  // sans données) — on ne garde que les mois où au moins une des deux séries a une valeur.
  const monthly = portfolioData.monthly.filter(m => m.rendementTotal != null || m.spxPerfTotale != null);
  if (!monthly.length) return;

  portfolioVsSpxChart = new Chart(canvas.getContext('2d'), {
    type:'line',
    data:{
      labels: monthly.map(m => m.mois),
      datasets:[
        { label:'Wolf Portfolio', data: monthly.map(m => m.rendementTotal), borderColor:THEME.gold, backgroundColor:'rgba(217,164,65,0.08)', fill:true, tension:0.2, pointRadius:2, spanGaps:true },
        { label:'S&P 500', data: monthly.map(m => m.spxPerfTotale), borderColor:THEME.blue, borderWidth:1.5, pointRadius:2, tension:0.2, spanGaps:true }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true } } },
      scales:{
        x:{ grid:{display:false}, ticks:{color:THEME.dim}, border:{color:THEME.hair} },
        y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'%'} }
      }
    }
  });
}

let portfolioVsSpxMonthlyChart = null;
function renderPortfolioVsSpxMonthly(){
  const canvas = document.getElementById('chartPortfolioVsSpxMonthly');
  if (!canvas) return;
  if (portfolioVsSpxMonthlyChart) portfolioVsSpxMonthlyChart.destroy();
  const monthly = portfolioData.monthly.filter(m => m.rendementMensuel != null || m.spxPerfMensuelle != null);
  if (!monthly.length) return;

  portfolioVsSpxMonthlyChart = new Chart(canvas.getContext('2d'), {
    type:'line',
    data:{
      labels: monthly.map(m => m.mois),
      datasets:[
        { label:'Wolf Portfolio', data: monthly.map(m => m.rendementMensuel), borderColor:THEME.gold, backgroundColor:'rgba(217,164,65,0.08)', fill:true, tension:0.25, pointRadius:3, spanGaps:true },
        { label:'S&P 500', data: monthly.map(m => m.spxPerfMensuelle), borderColor:THEME.blue, borderWidth:1.5, pointRadius:3, tension:0.25, spanGaps:true }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true } } },
      scales:{
        x:{ grid:{display:false}, ticks:{color:THEME.dim}, border:{color:THEME.hair} },
        y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'%'} }
      }
    }
  });
}

function renderPortfolio(){
  const fmtSigned = v => v == null ? 'N/D' : (v >= 0 ? '+' : '') + v.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';

  document.getElementById('pfCapitalInvesti').textContent = portfolioData.capitalInvesti != null ? fmtEUR(portfolioData.capitalInvesti) : 'N/D';
  document.getElementById('pfValorisation').textContent = portfolioData.valorisationTotale != null ? fmtEUR(portfolioData.valorisationTotale) : 'N/D';
  document.getElementById('pfCash').textContent = portfolioData.cashEuros != null ? fmtEUR(portfolioData.cashEuros) : 'N/D';

  const gainsEurosEl = document.getElementById('pfGainsEuros');
  gainsEurosEl.className = 'v';
  gainsEurosEl.textContent = fmtSigned(portfolioData.gainsEuros);
  if (portfolioData.gainsEuros != null) gainsEurosEl.classList.add(portfolioData.gainsEuros >= 0 ? 'pos' : 'neg');

  const gainsPctEl = document.getElementById('pfGainsPct');
  gainsPctEl.className = 'v';
  if (portfolioData.gainsPct != null){
    gainsPctEl.textContent = (portfolioData.gainsPct >= 0 ? '+' : '') + fmtPct(portfolioData.gainsPct);
    gainsPctEl.classList.add(portfolioData.gainsPct >= 0 ? 'pos' : 'neg');
  } else gainsPctEl.textContent = 'N/D';

  renderPortfolioDonut();
  renderPortfolioHoldingsList();
  renderPortfolioVsSpx();
  renderPortfolioVsSpxMonthly();
}

/* ============================================================
   PAGE SECTEUR — répartition GICS
   ============================================================ */
const GICS_SECTORS = [
  { key:'energie', label:'Énergie', match:['energ'] },
  { key:'materiaux', label:'Matériaux', match:['materia','matière'] },
  { key:'industrie', label:'Industrie', match:['industr'] },
  { key:'conso-discretionnaire', label:'Consommation discrétionnaire', match:['discretionnaire','discrétionnaire','cyclique'] },
  { key:'conso-base', label:'Consommation de base', match:['base','essentiel','staple','defensive','défensive'] },
  { key:'sante', label:'Santé', match:['sant','health'] },
  { key:'finance', label:'Finance', match:['financ','bancair','banque','assurance'] },
  { key:'tech', label:'Technologies de l\'information', match:['techno','information technology','logiciel','semi-conducteur'] },
  { key:'communication', label:'Services de communication', match:['communicat','telecom','média','media'] },
  { key:'utilities', label:'Services publics', match:['utilit','service public','électricité','eau'] },
  { key:'immobilier', label:'Immobilier', match:['immobil','real estate','reit'] }
];

// Enlève les accents avant comparaison : la colonne "secteur" du Sheet est saisie à la
// main et pas toujours accentuée de façon cohérente (ex. "Materiaux" vs "Matériaux"
// selon la ligne), ce qui faisait échouer le classement GICS pour certaines entreprises.
function stripAccents(s){
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeSector(raw){
  if (!raw) return null;
  const s = stripAccents(raw.toLowerCase());
  for (const sec of GICS_SECTORS){
    if (sec.match.some(kw => s.includes(stripAccents(kw)))) return sec.key;
  }
  return null;
}

function renderSectorView(){
  const grid = document.getElementById('sectorGrid');
  if (!grid) return;

  const buckets = {};
  GICS_SECTORS.forEach(s => buckets[s.key] = []);
  buckets['autre'] = [];

  Object.keys(companies).forEach(nom => {
    const hist = companies[nom];
    const latest = hist[hist.length - 1];
    const key = normalizeSector(latest.secteur) || 'autre';
    buckets[key].push({ nom, logo: latest.lienImage, secteurBrut: latest.secteur });
  });

  const allBuckets = GICS_SECTORS.concat([{ key:'autre', label:'Autre / non classé' }]);

  grid.innerHTML = allBuckets.map(sec => {
    const list = buckets[sec.key];
    const logosHtml = list.length === 0
      ? '<div class="sector-empty">Aucune entreprise</div>'
      : list.map(c => `<div class="sector-logo" title="${c.nom.replace(/"/g,'&quot;')}" data-nom="${c.nom.replace(/"/g,'&quot;')}"><img src="${c.logo || ''}" alt="${c.nom.replace(/"/g,'&quot;')}"></div>`).join('');
    return `<div class="sector-box"><h3>${sec.label}</h3><div class="count">${list.length} entreprise${list.length>1?'s':''}</div><div class="sector-companies">${logosHtml}</div></div>`;
  }).join('');
}

/* ============================================================
   PAGE CLASSEMENT — meilleur rendement dividende / meilleure
   opportunité de valorisation (écart de valeur, colonne K,
   négatif = sous-valorisé = plus intéressant, tri croissant)
   ============================================================ */
function classementRowHtml(nom, logo, rank, valueText, cls, rendHtml){
  return `<div class="classement-row${rendHtml ? ' classement-row-valo' : ''}" data-nom="${nom.replace(/"/g,'&quot;')}">
    <div class="classement-row-main">
      <span class="classement-rank">${rank}</span>
      <div class="classement-logo"><img src="${logo || ''}" alt=""></div>
      <span class="classement-name">${nom}</span>
      <span class="classement-value${cls ? ' ' + cls : ''}">${valueText}</span>
    </div>
    ${rendHtml || ''}
  </div>`;
}
// Rendement espéré (5 ans) FCF et OCF, scénario Pessimiste, à partir du dernier
// objectif enregistré pour l'entreprise sur chaque métrique (indépendants — une
// entreprise peut avoir un objectif FCF sans OCF ou l'inverse). Simple recalcul avec
// le prix/FCF-OCF actuels + les hypothèses (CAGR, multiple) figées dans l'objectif —
// pas une nouvelle saisie, juste la lecture de ce que l'utilisateur a déjà validé en
// Valorisation.
function lastObjectifForMetric(nom, metric){
  const entries = objectifsStore[nom] || [];
  for (let i = entries.length - 1; i >= 0; i--){
    if ((entries[i].metric || 'fcf') === metric) return entries[i];
  }
  return null;
}
function rendementEspereFromObjectif(nom, metric){
  const entry = lastObjectifForMetric(nom, metric);
  const v = entry && entry.scenarios && entry.scenarios.pessimiste;
  const hist = companies[nom];
  if (!v || !hist) return null;
  const latest = hist[hist.length - 1];
  const metricActuel = metric === 'ocf'
    ? (latest.prixActuel != null && latest.pOcf ? latest.prixActuel / latest.pOcf : null)
    : latest.fcfParAction;
  if (metricActuel == null || latest.prixActuel == null) return null;
  return computeScenario(metricActuel, latest.prixActuel, v.cagr, v.multiple).rendement5A;
}
function classementRendementRowHtml(nom){
  const fcf = rendementEspereFromObjectif(nom, 'fcf');
  const ocf = rendementEspereFromObjectif(nom, 'ocf');
  if (fcf == null && ocf == null) return '';
  const fmt = v => v == null ? 'N/D' : (v >= 0 ? '+' : '') + v.toLocaleString('fr-FR', { minimumFractionDigits:1, maximumFractionDigits:1 }) + '%';
  return `<div class="classement-rend-row" title="Rendement espéré à 5 ans, scénario Pessimiste, dernier objectif enregistré en Valorisation">
    <span class="classement-rend-tag fcf">FCF ${fmt(fcf)}</span>
    <span class="classement-rend-tag ocf">OCF ${fmt(ocf)}</span>
  </div>`;
}

function populateClassementSecteurFilter(){
  const select = document.getElementById('classementSecteurFilter');
  if (!select || select.dataset.filled) return;
  select.dataset.filled = '1';
  const allSectors = GICS_SECTORS.concat([{ key:'autre', label:'Autre / non classé' }]);
  allSectors.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.key;
    opt.textContent = s.label;
    select.appendChild(opt);
  });
}

function renderClassement(){
  const divLeftBox = document.getElementById('classementDivLeft');
  const divRightBox = document.getElementById('classementDivRight');
  const valoSousBox = document.getElementById('classementValoSous');
  const valoSurvaloBox = document.getElementById('classementValoSurvalo');
  if (!divLeftBox || !valoSousBox) return;
  populateClassementSecteurFilter();

  const secteurFiltre = document.getElementById('classementSecteurFilter').value;

  const rows = Object.keys(companies).map(nom => {
    const latest = companies[nom][companies[nom].length - 1];
    return {
      nom, logo: latest.lienImage, rendementDiv: latest.rendementDiv, ecartValeur: latest.ecartValeur,
      secteurKey: normalizeSector(latest.secteur) || 'autre'
    };
  }).filter(r => !secteurFiltre || r.secteurKey === secteurFiltre);

  const byDiv = rows.filter(r => r.rendementDiv != null).sort((a, b) => b.rendementDiv - a.rendementDiv);
  const half = Math.ceil(byDiv.length / 2);
  const divLeft = byDiv.slice(0, half);
  const divRight = byDiv.slice(half);
  const empty = '<div class="objectifs-empty">Aucune donnée disponible pour ce secteur.</div>';

  divLeftBox.innerHTML = divLeft.length ? divLeft.map((r, i) => classementRowHtml(r.nom, r.logo, i + 1, fmtPct(r.rendementDiv))).join('') : empty;
  divRightBox.innerHTML = divRight.map((r, i) => classementRowHtml(r.nom, r.logo, half + i + 1, fmtPct(r.rendementDiv))).join('');

  const sousValo = rows.filter(r => r.ecartValeur != null && r.ecartValeur < 0).sort((a, b) => a.ecartValeur - b.ecartValeur);
  const survalo = rows.filter(r => r.ecartValeur != null && r.ecartValeur >= 0).sort((a, b) => a.ecartValeur - b.ecartValeur);

  valoSousBox.innerHTML = sousValo.length
    ? sousValo.map((r, i) => classementRowHtml(r.nom, r.logo, i + 1, fmtPct(r.ecartValeur * 100), 'pos', classementRendementRowHtml(r.nom))).join('')
    : '<div class="objectifs-empty">Aucune entreprise sous-valorisée.</div>';
  valoSurvaloBox.innerHTML = survalo.length
    ? survalo.map((r, i) => classementRowHtml(r.nom, r.logo, i + 1, fmtPct(r.ecartValeur * 100), 'neg', classementRendementRowHtml(r.nom))).join('')
    : '<div class="objectifs-empty">Aucune entreprise survalorisée.</div>';
}

function initClassement(){
  ['classementDivLeft', 'classementDivRight', 'classementValoSous', 'classementValoSurvalo'].forEach(id => {
    const box = document.getElementById(id);
    if (!box) return;
    box.addEventListener('click', e => {
      const row = e.target.closest('.classement-row[data-nom]');
      if (row) goToAnalyse(row.dataset.nom);
    });
  });
  const filter = document.getElementById('classementSecteurFilter');
  if (filter) filter.addEventListener('change', renderClassement);
}

function initSectorGrid(){
  const grid = document.getElementById('sectorGrid');
  if (!grid) return;
  grid.addEventListener('click', e => {
    const logo = e.target.closest('.sector-logo[data-nom]');
    if (logo) goToAnalyse(logo.dataset.nom);
  });
}

function goToAnalyse(nom){
  switchPage('pageAnalyse');
  selectCompany(nom);
}

function switchPage(pageId){
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === pageId));
  document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
}

function selectCompany(nom){
  if (!companies[nom]) return;
  activeCompany = nom;
  const label = document.getElementById('activeCompanyLabel');
  if (label) label.innerHTML = 'Entreprise sélectionnée : <b>' + nom + '</b>';
  renderCompany(nom);
}

function initSearch(){
  const input = document.getElementById('companySearch');
  const box = document.getElementById('searchSuggestions');
  if (!input || !box) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q){ box.classList.remove('open'); box.innerHTML = ''; return; }
    const matches = Object.keys(companies).filter(n => n.toLowerCase().includes(q)).slice(0, 8);
    if (matches.length === 0){
      box.innerHTML = '<div class="search-suggestion" style="color:var(--text-faint);cursor:default;">Aucun résultat</div>';
    } else {
      box.innerHTML = matches.map(n => `<div class="search-suggestion" data-name="${n.replace(/"/g,'&quot;')}">${n}</div>`).join('');
    }
    box.classList.add('open');
  });

  box.addEventListener('click', e => {
    const item = e.target.closest('.search-suggestion[data-name]');
    if (!item) return;
    selectCompany(item.dataset.name);
    input.value = '';
    box.classList.remove('open');
    box.innerHTML = '';
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) box.classList.remove('open');
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape'){ box.classList.remove('open'); input.blur(); }
    if (e.key === 'Enter'){
      const first = box.querySelector('.search-suggestion[data-name]');
      if (first){ selectCompany(first.dataset.name); input.value=''; box.classList.remove('open'); box.innerHTML=''; }
    }
  });
}

/* ============================================================
   RENDU D'UNE ENTREPRISE
   ============================================================ */
const css = getComputedStyle(document.documentElement);
const THEME = {
  gold: css.getPropertyValue('--gold').trim(),
  blue: css.getPropertyValue('--blue').trim(),
  green: css.getPropertyValue('--green').trim(),
  red: css.getPropertyValue('--red').trim(),
  dim: css.getPropertyValue('--text-dim').trim(),
  hair: css.getPropertyValue('--hair').trim(),
  violet: css.getPropertyValue('--violet').trim(),
  white: '#FFFFFF',
  yellow: '#F0D63D'
};
function configureChartDefaults(){
  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = THEME.dim;
}
const baseAxis = { grid:{display:false}, ticks:{color:THEME.dim}, border:{color:THEME.hair} };
const baseGrid = { color: THEME.hair, drawTicks:false };

function fmtEUR(v, d=2){ return v==null ? 'N/D' : v.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}) + ' €'; }
function fmtPct(v, d=1){ return v==null ? 'N/D' : v.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}) + ' %'; }
function setBadge(id, label, value){
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('pos','neg');
  if (value == null){ el.textContent = label + ' —'; return; }
  el.textContent = label + ' ' + (value >= 0 ? '+' : '') + value.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}) + '%';
  el.classList.add(value >= 0 ? 'pos' : 'neg');
}

function renderCompany(nom){
  const hist = companies[nom];
  const latest = hist[hist.length - 1];
  const years = hist.map(r => r.annee);
  priceAlertEditing = false;

  document.getElementById('logoImg').src = latest.lienImage || '';
  document.getElementById('tickerLbl').textContent = latest.ticker || '—';
  document.getElementById('companyName').textContent = nom;
  document.getElementById('secteurTag').textContent = 'Secteur — ' + (latest.secteur || '—');
  document.getElementById('sousSecteurTag').textContent = 'Sous-secteur — ' + (latest.sousSecteur || '—');
  document.getElementById('prixActuel').innerHTML = latest.prixActuel.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' <sup>€</sup>';
  document.getElementById('priceYear').textContent = 'Exercice ' + latest.annee;
  renderPriceAlertWidget(nom, latest.prixActuel);

  document.getElementById('rPrixJuste').textContent = fmtEUR(latest.prixJuste);
  document.getElementById('rPrixCible').textContent = fmtEUR(latest.prixCible);
  const ecartEl = document.getElementById('rEcart');
  ecartEl.className = 'v';
  if (latest.ecartValeur != null){
    ecartEl.textContent = fmtPct(latest.ecartValeur*100);
    ecartEl.classList.add(latest.ecartValeur >= 0 ? 'pos' : 'neg');
  } else { ecartEl.textContent = 'N/D'; }

  document.getElementById('rRendDiv').textContent = fmtPct(latest.rendementDiv);
  const fcfpegEl = document.getElementById('rFcfpeg');
  fcfpegEl.className = 'v';
  if (latest.fcfpeg != null){
    fcfpegEl.textContent = latest.fcfpeg.toLocaleString('fr-FR',{minimumFractionDigits:2});
    // <1 = attractif (vert), 1 à 1,10 = zone grise (orange), >1,10 = cher (rouge)
    if (latest.fcfpeg < 1) fcfpegEl.classList.add('pos');
    else if (latest.fcfpeg <= 1.10) fcfpegEl.classList.add('warn');
    else fcfpegEl.classList.add('neg');
  } else { fcfpegEl.textContent = 'N/D'; }
  document.getElementById('rMedFcf').textContent = latest.medianePFCF != null ? latest.medianePFCF.toLocaleString('fr-FR',{minimumFractionDigits:1}) + 'x' : 'N/D';
  document.getElementById('rPayout').textContent = fmtPct(latest.payoutRatio);

  const rend5El = document.getElementById('rRend5');
  rend5El.className = 'v';
  if (latest.prixJuste != null && latest.prixActuel != null && latest.rendementDiv != null){
    const reversion = Math.pow(latest.prixJuste / latest.prixActuel, 1/5) - 1;
    const rend5 = reversion*100 + latest.rendementDiv;
    rend5El.textContent = (rend5>=0?'+':'') + fmtPct(rend5);
    rend5El.classList.add(rend5>=0 ? 'pos':'neg');
  } else { rend5El.textContent = 'N/D'; }

  drawGauge(latest);

  setBadge('badgeDiv', 'CAGR div. 10a', latest.cagrDiv10);
  setBadge('badgeCA', 'CAGR CA 10a', latest.cagrCA10);
  setBadge('badgeFcf', 'CAGR FCF 10a', latest.cagrFcf10);
  setBadge('badgeActions', 'CAGR actions 20a', latest.cagrActions);

  renderValorisation(nom);
  renderAnalyseValoSummary(nom);

  const series = k => hist.map(r => r[k]);

  // destroyCharts() vide chartInstances en bloc — appelé avant loadStockChart() pour ne
  // pas effacer le graphique boursier juste après sa création (piège révélé par la
  // nouvelle source de prix synchrone : contrairement à l'ancien relais Yahoo/Stooq,
  // toujours asynchrone, elle peut créer chartInstances.stock avant même que
  // destroyCharts() ne s'exécute plus loin dans cette fonction).
  destroyCharts();
  loadStockChart(latest.ticker, nom);

  chartInstances.div = makeChart('div', 'chartDiv', {
    type:'bar',
    data:{ labels:years, datasets:[
      { label:'Dividende (€)', data:series('dividende'), backgroundColor:THEME.gold, borderRadius:4, yAxisID:'y', order:2, barPercentage:0.55 },
      { label:'Payout ratio (%)', data:series('payoutRatio'), type:'line', borderColor:THEME.blue, backgroundColor:THEME.blue, yAxisID:'y1', tension:0.35, spanGaps:true, pointRadius:3, order:1 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true}}},
      scales:{ x: baseAxis, y:{ position:'left', grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+' €'} }, y1:{ position:'right', grid:{display:false}, ticks:{color:THEME.dim, callback:v=>v+'%'} } }
    }
  });

  chartInstances.ca = makeChart('ca', 'chartCA', {
    type:'line',
    data:{ labels:years, datasets:[{ label:'CA (Md€)', data:series('ca').map(v => v==null?null:+(v/1000).toFixed(1)), borderColor:THEME.gold, backgroundColor:'rgba(217,164,65,0.15)', fill:true, tension:0.35, pointRadius:3, spanGaps:true }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+' Md€'} } } }
  });

  chartInstances.marges = makeChart('marges', 'chartMarges', {
    type:'line',
    data:{ labels:years, datasets:[
      { label:'Marge opérationnelle (%)', data:series('margeOp'), borderColor:THEME.gold, backgroundColor:THEME.gold, tension:0.35, pointRadius:3, spanGaps:true },
      { label:'ROIC (%)', data:series('roic'), borderColor:THEME.blue, backgroundColor:THEME.blue, tension:0.35, pointRadius:3, spanGaps:true }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true}}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'%'} } } }
  });

  chartInstances.fcf = makeChart('fcf', 'chartFCF', {
    type:'bar',
    data:{ labels:years, datasets:[{ label:'FCF / action (€)', data:series('fcfParAction'), backgroundColor:THEME.blue, borderRadius:4, barPercentage:0.6 }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+' €'} } } }
  });

  chartInstances.pfcf = makeChart('pfcf', 'chartPFCF', {
    type:'bar',
    data:{ labels:years, datasets:[
      { label:'P/FCF (x)', data:series('pFcf'), backgroundColor:THEME.gold, borderRadius:4, barPercentage:0.6, order:2 },
      { label:'Médiane P/FCF (x)', data:series('medianePFCF'), type:'line', borderColor:THEME.blue, backgroundColor:THEME.blue, tension:0, spanGaps:true, pointRadius:0, borderWidth:2, order:1 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true}}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'x'} } } }
  });

  chartInstances.actions = makeChart('actions', 'chartActions', {
    type:'line',
    data:{ labels:years, datasets:[{ label:'Actions en circulation (M)', data:series('actions'), borderColor:THEME.blue, backgroundColor:'rgba(74,159,224,0.12)', fill:true, tension:0.35, pointRadius:3, spanGaps:true }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'M'} } } }
  });

  chartInstances.dette = makeChart('dette', 'chartDette', {
    type:'bar',
    data:{ labels:years, datasets:[{ label:'Dette / OCF (x)', data:series('detteOCF'), backgroundColor:THEME.blue, borderRadius:4, barPercentage:0.6 }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'x'} } } }
  });

  chartInstances.cash = makeChart('cash', 'chartCash', {
    type:'bar',
    data:{ labels:years, datasets:[
      { label:'Cash (M€)', data:series('cash'), backgroundColor:THEME.blue, borderRadius:4, barPercentage:0.55 },
      { label:'Cash investi (M€)', data:series('cashInvesti'), backgroundColor:THEME.gold, borderRadius:4, barPercentage:0.55 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true}}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+' M€'} } } }
  });
}

let chartConfigs = {};

function makeChart(key, id, config){
  chartConfigs[key] = config;
  return new Chart(document.getElementById(id).getContext('2d'), config);
}
function destroyCharts(){
  Object.values(chartInstances).forEach(ch => ch && ch.destroy());
  chartInstances = {};
  chartConfigs = {};
}

// Découpe un chartConfig sur les nYears dernières années (ou tout l'historique si
// nYears est null) — remplace cloneChartConfig, utilisé pour le zoom avec sélecteur
// de plage 5/10/20 ans sur les 8 graphiques historiques.
function sliceChartConfigByYears(config, nYears){
  const total = config.data.labels.length;
  const startIdx = nYears == null ? 0 : Math.max(0, total - nYears);
  return {
    type: config.type,
    data: {
      labels: config.data.labels.slice(startIdx),
      datasets: config.data.datasets.map(ds => Object.assign({}, ds, { data: ds.data.slice(startIdx) }))
    },
    options: config.options
  };
}

/* ============================================================
   COURS DE BOURSE — Yahoo Finance en priorité, repli sur Stooq
   si le fetch échoue (CORS non garanti côté Yahoo, pas d'API
   officielle). Hebdomadaire + SMA200.
   (Remplace un essai de widget TradingView : le widget public/anonyme
   ne dessert pas les données Euronext Paris, même pour des symboles
   valides — voir "Pièges techniques" point 8 dans CLAUDE.md. Ce fetch
   maison couvre toutes les bourses du portefeuille.)
   ============================================================ */
let stockFull = null;   // { dates, closes, sma }
let stockRange = 'max';
let stockRequestId = 0;

function mapTickerToYahoo(ticker){
  if (!ticker) return null;
  const parts = ticker.split(':');
  if (parts.length !== 2) return ticker;
  const [exch, sym] = parts;
  const map = {
    EPA:'.PA', PAR:'.PA', NASDAQ:'', NYSE:'', NYSEARCA:'',
    LON:'.L', LSE:'.L', ETR:'.DE', FRA:'.DE', XETR:'.DE',
    AMS:'.AS', BME:'.MC', MIL:'.MI', SWX:'.SW', TSE:'.T'
  };
  const suffix = map[exch.toUpperCase()];
  return sym + (suffix != null ? suffix : '');
}

function mapTickerToStooq(ticker){
  if (!ticker) return null;
  const parts = ticker.split(':');
  if (parts.length !== 2) return ticker.toLowerCase();
  const [exch, sym] = parts;
  const map = {
    EPA:'.fr', PAR:'.fr', NASDAQ:'.us', NYSE:'.us', NYSEARCA:'.us',
    LON:'.uk', LSE:'.uk', ETR:'.de', FRA:'.de', XETR:'.de',
    AMS:'.nl', BME:'.mc', MIL:'.mi', SWX:'.sw', TSE:'.jp'
  };
  const suffix = map[exch.toUpperCase()] || '.us';
  return sym.toLowerCase() + suffix;
}

function average(arr){ return arr.reduce((a,b) => a+b, 0) / arr.length; }

function isoWeekKey(dateStr){
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return d.getUTCFullYear() + '-W' + week;
}

// Regroupe des clôtures quotidiennes en clôtures hebdomadaires (dernier jour coté de
// chaque semaine ISO). Nécessaire car l'API Yahoo Finance renvoie silencieusement des
// données mensuelles quand on demande interval=1wk sur un très long historique (range=max)
// — le point d'entrée le plus fiable reste donc le quotidien, rééchantillonné nous-mêmes.
function resampleWeekly(dailyDates, dailyCloses){
  const dates = [], closes = [];
  let currentKey = null, lastDate = null, lastClose = null;
  for (let i = 0; i < dailyDates.length; i++){
    const key = isoWeekKey(dailyDates[i]);
    if (currentKey !== null && key !== currentKey){
      dates.push(lastDate);
      closes.push(lastClose);
    }
    currentKey = key;
    lastDate = dailyDates[i];
    lastClose = dailyCloses[i];
  }
  if (lastDate != null){
    dates.push(lastDate);
    closes.push(lastClose);
  }
  return { dates, closes };
}

// Ni Yahoo Finance ni Stooq n'envoient d'en-tête Access-Control-Allow-Origin sur ces
// endpoints (vérifié directement) : un fetch() direct depuis un navigateur est donc
// TOUJOURS bloqué par CORS, quel que soit l'hébergement (pas un problème de file:// ou
// de referrer). On relaie via des proxies CORS publics gratuits. Pas de clé, pas de
// backend à nous — mais chacun pris isolément est instable (confirmé par tests répétés :
// tantôt <1s, tantôt 15-40s ou échec pur), donc on en essaie plusieurs à la suite plutôt
// que de dépendre d'un seul (allorigins.win ET corsproxy.io fonctionnent tous les deux
// depuis un vrai fetch() navigateur, mais pas toujours au même moment).
function corsProxyUrls(url){
  const enc = encodeURIComponent(url);
  return [
    'https://api.allorigins.win/raw?url=' + enc,
    'https://corsproxy.io/?url=' + enc
  ];
}

async function fetchWithRetry(targetUrl, opts, timeoutMs){
  let lastErr;
  for (const proxyUrl of corsProxyUrls(targetUrl)){
    const controller = new AbortController();
    const hardTimeout = setTimeout(() => controller.abort(), timeoutMs);
    try{
      const res = await fetch(proxyUrl, Object.assign({}, opts, { signal: controller.signal }));
      clearTimeout(hardTimeout);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    }catch(e){
      clearTimeout(hardTimeout);
      lastErr = e;
    }
  }
  throw lastErr;
}

// Canal de régression linéaire (moyenne ± 1 et 2 écarts-types) calculé sur les
// vingt dernières années de clôtures hebdo (ou tout l'historique dispo si plus court) —
// permet de voir où se situe le prix actuel par rapport à sa tendance longue durée.
// Toujours calculé sur cette fenêtre fixe (jusqu'à 20 ans), indépendamment de la plage
// affichée par les boutons 1a/2a/.../Max : sur une plage plus courte on ne voit qu'un
// extrait de ce même canal, sur "Max" au-delà de 20 ans le canal s'arrête (pas de repli
// de tendance millénaire, pas de sens).
function computeRegressionChannel(dates, closes){
  const maxPoints = 20 * 52;
  const startIdx = Math.max(0, closes.length - maxPoints);
  const winDates = dates.slice(startIdx);
  const winCloses = closes.slice(startIdx);
  const n = winCloses.length;
  if (n < 10) return null;

  const xMean = (n - 1) / 2;
  const yMean = winCloses.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++){
    num += (i - xMean) * (winCloses[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  let sumSqResid = 0;
  for (let i = 0; i < n; i++){
    sumSqResid += (winCloses[i] - (slope * i + intercept)) ** 2;
  }
  const stdDev = Math.sqrt(sumSqResid / n);

  const byDate = {};
  winDates.forEach((d, i) => { byDate[d] = slope * i + intercept; });
  return { byDate, stdDev };
}

async function fetchYahooWeekly(symbol){
  // period1/period2 explicites plutôt que range=max : Yahoo sous-échantillonne
  // silencieusement (mensuel au lieu de quotidien) quand range=max est combiné à un
  // très long historique, ce qui faussait la moyenne mobile 200 semaines.
  const period1 = Math.floor(new Date('1990-01-01T00:00:00Z').getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
  const res = await fetchWithRetry(url, { cache: 'no-store' }, 12000);
  const json = await res.json();
  const result = json && json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error((json && json.chart && json.chart.error && json.chart.error.description) || 'réponse Yahoo Finance invalide');
  const ts = result.timestamp;
  const closes = result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close;
  if (!ts || !closes) throw new Error('données Yahoo Finance incomplètes');

  const dailyDates = [], dailyCloses = [];
  for (let i = 0; i < ts.length; i++){
    if (closes[i] == null) continue;
    dailyDates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
    dailyCloses.push(closes[i]);
  }
  if (dailyCloses.length < 50) throw new Error('pas assez de données renvoyées par Yahoo Finance');
  const { dates, closes: vals } = resampleWeekly(dailyDates, dailyCloses);
  return { dates, closes: vals };
}

async function fetchStooqWeekly(symbol){
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=w&_=${Date.now()}`;
  const res = await fetchWithRetry(url, { cache: 'no-store' }, 12000);
  const text = await res.text();
  if (!text || text.trim().toLowerCase().startsWith('<')) throw new Error('réponse invalide');

  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  const rows = (parsed.data || []).filter(r => r.Date && r.Close && !isNaN(parseFloat(r.Close)));
  if (rows.length < 10) throw new Error('pas assez de données renvoyées');

  return { dates: rows.map(r => r.Date), closes: rows.map(r => parseFloat(r.Close)) };
}

function computeSMA(closes, period){
  return closes.map((_, i) => i < period - 1 ? null : average(closes.slice(i - period + 1, i + 1)));
}

function setStockSourceNote(text){
  const el = document.getElementById('stockSourceNote');
  if (el) el.textContent = text;
}

async function loadStockChart(ticker, nom){
  const statusEl = document.getElementById('stockStatus');
  const myId = ++stockRequestId;
  stockFull = null;
  if (chartInstances.stock){ chartInstances.stock.destroy(); delete chartInstances.stock; }

  // Source principale : l'onglet historique dédié du Sheet (fiable, pas de CORS) —
  // le relais Yahoo/Stooq ci-dessous ne sert que de repli pour une entreprise absente
  // de cet onglet.
  if (nom){
    const sheetSeries = fetchPriceHistorySeries(nom);
    if (sheetSeries){
      const sma = computeSMA(sheetSeries.closes, 200);
      const sma30 = computeSMA(sheetSeries.closes, 30);
      stockFull = { dates: sheetSeries.dates, closes: sheetSeries.closes, sma, sma30 };
      statusEl.style.display = 'none';
      setStockSourceNote('Source : historique Wolf Analysis (Google Sheet)');
      renderStockChart();
      return;
    }
  }

  if (!ticker){
    statusEl.textContent = 'Ticker manquant pour cette entreprise, impossible de charger le cours.';
    statusEl.style.display = 'block';
    return;
  }
  statusEl.textContent = 'Chargement du cours… (peut prendre jusqu\'à 20-30 secondes, via un relais)';
  statusEl.style.display = 'block';

  const ySymbol = mapTickerToYahoo(ticker);
  try{
    const { dates, closes } = await fetchYahooWeekly(ySymbol);
    if (myId !== stockRequestId) return;
    const sma = computeSMA(closes, 200);
    const sma30 = computeSMA(closes, 30);
    stockFull = { dates, closes, sma, sma30 };
    statusEl.style.display = 'none';
    setStockSourceNote('Source : Yahoo Finance (symbole ' + ySymbol + ')');
    renderStockChart();
    return;
  }catch(e){
    if (myId !== stockRequestId) return;
    // Yahoo Finance indisponible (CORS non garanti) — on tente le repli Stooq.
  }

  const sSymbol = mapTickerToStooq(ticker);
  try{
    const res = await fetchStooqWeekly(sSymbol);
    if (myId !== stockRequestId) return;
    const sma = computeSMA(res.closes, 200);
    const sma30 = computeSMA(res.closes, 30);
    stockFull = { dates: res.dates, closes: res.closes, sma, sma30 };
    statusEl.style.display = 'none';
    setStockSourceNote('Source : Stooq (repli, Yahoo Finance indisponible pour ce ticker — symbole ' + sSymbol + ')');
    renderStockChart();
  }catch(e){
    if (myId !== stockRequestId) return;
    stockFull = null;
    statusEl.textContent = "Cours indisponible pour ce ticker, ni via Yahoo Finance (" + ySymbol + ") ni via Stooq (" + sSymbol + "). Le mapping automatique de la bourse d'origine ne couvre pas forcément tous les cas — dis-moi le bon symbole si besoin.";
    statusEl.style.display = 'block';
  }
}

// Factory extraite (comme les scénarios/graphiques macro) pour être réutilisable par
// le zoom, qui a besoin de son propre sélecteur de plage indépendant de la carte
// normale — demande explicite ("même quand on zoome").
function buildStockChartConfig(range){
  const { dates, closes, sma, sma30 } = stockFull;
  let startIdx = 0;
  if (range !== 'max'){
    const years = parseInt(range, 10);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const found = dates.findIndex(d => new Date(d) >= cutoff);
    startIdx = found === -1 ? 0 : found;
  }

  const labels = dates.slice(startIdx);
  const dataClose = closes.slice(startIdx);
  const dataSma = sma.slice(startIdx);
  const dataSma30 = sma30.slice(startIdx);

  const reg = computeRegressionChannel(dates, closes);
  const regLine = (offset) => labels.map(d => (reg && reg.byDate[d] != null) ? reg.byDate[d] + offset * reg.stdDev : null);

  // Couleurs v2 (révision explicite) : clôture en jaune, SMA200 en blanc, SMA30
  // (inchangée) en violet fin — seule exception au "violet jamais utilisé pour de la
  // donnée" du design system. ±2σ et la ligne de régression centrale en rouge
  // pointillé ; ±1σ inchangé en bleu pointillé.
  const regStyle = (offset, label, showInLegend) => ({
    label, data: regLine(offset),
    borderColor: Math.abs(offset) === 2 || offset === 0 ? THEME.red : THEME.blue,
    borderWidth: offset === 0 ? 1.75 : 1.25,
    borderDash: [5,4],
    pointRadius:0, spanGaps:false, tension:0, _legend: !!showInLegend
  });

  const config = {
    type:'line',
    data:{ labels, datasets:[
      { label:'Clôture hebdo', data:dataClose, borderColor:THEME.yellow, backgroundColor:'rgba(240,214,61,0.06)', fill:true, tension:0.12, pointRadius:0, borderWidth:1.5, _legend:true },
      { label:'Moyenne mobile 200 sem.', data:dataSma, borderColor:THEME.white, borderWidth:2.5, pointRadius:0, spanGaps:true, tension:0.12, _legend:true },
      { label:'Moyenne mobile 30 sem.', data:dataSma30, borderColor:THEME.violet, borderWidth:1, pointRadius:0, spanGaps:true, tension:0.12, _legend:true },
      regStyle(0, 'Régression linéaire (20 ans max)', true),
      regStyle(1, '+1σ', false), regStyle(-1, '−1σ', false),
      regStyle(2, '+2σ', false), regStyle(-2, '−2σ', false)
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true, filter: item => item.text && config.data.datasets[item.datasetIndex]._legend}} },
      scales:{
        x:{ grid:{display:false}, ticks:{color:THEME.dim, maxTicksLimit:8}, border:{color:THEME.hair} },
        y:{ grid:baseGrid, ticks:{color:THEME.dim} }
      }
    }
  };
  return config;
}

function renderStockChart(){
  if (!stockFull) return;
  if (chartInstances.stock) chartInstances.stock.destroy();
  chartInstances.stock = makeChart('stock', 'chartStock', buildStockChartConfig(stockRange));
}

document.getElementById('rangeButtons').addEventListener('click', e => {
  const btn = e.target.closest('button[data-range]');
  if (!btn) return;
  stockRange = btn.dataset.range;
  document.querySelectorAll('#rangeButtons button').forEach(b => b.classList.toggle('active', b === btn));
  renderStockChart();
});
document.getElementById('macroCycleRangeButtons').addEventListener('click', e => {
  const btn = e.target.closest('button[data-range]');
  if (!btn) return;
  macroCycleRange = btn.dataset.range;
  document.querySelectorAll('#macroCycleRangeButtons button').forEach(b => b.classList.toggle('active', b === btn));
  renderMacroCycleChart();
});
document.getElementById('macroRotationRangeButtons').addEventListener('click', e => {
  const btn = e.target.closest('button[data-range]');
  if (!btn) return;
  macroRotationRange = btn.dataset.range;
  document.querySelectorAll('#macroRotationRangeButtons button').forEach(b => b.classList.toggle('active', b === btn));
  renderMacroRotationChart();
});
document.getElementById('macroRankingRowButtons').addEventListener('click', e => {
  const btn = e.target.closest('button[data-row]');
  if (!btn) return;
  macroRankingRow = btn.dataset.row;
  document.querySelectorAll('#macroRankingRowButtons button').forEach(b => b.classList.toggle('active', b === btn));
  renderMacroRankingChart();
});

/* ---------- Zoom : sélecteur de plage (5/10/20 ans) + CAGR sur les graphiques
   historiques (pas le cours de bourse, qui a déjà son propre sélecteur sur la carte
   principale). CAGR affiché uniquement quand la période sélectionnée correspond à une
   donnée réellement présente dans le Sheet — sinon case vide (« — »), jamais inventée. */
const ZOOM_HISTORICAL_KEYS = ['div','ca','marges','fcf','pfcf','actions','dette','cash'];
// Les 3 périodes sont toujours affichées ensemble (pas liées au sélecteur de plage
// 5/10/20/Max, qui ne change que la fenêtre du graphique) : chaque champ manquant
// (pas encore mappé depuis le Sheet) affiche « — » plutôt qu'une valeur inventée.
const ZOOM_CAGR_META = {
  div: [{ years:5, field:'cagrDiv5' }, { years:10, field:'cagrDiv10' }, { years:20, field:'cagrDiv20' }],
  ca: [{ years:5, field:'cagrCA5' }, { years:10, field:'cagrCA10' }, { years:20, field:'cagrCA20' }],
  fcf: [{ years:5, field:'cagrFcf5' }, { years:10, field:'cagrFcf10' }, { years:20, field:'cagrFcf20' }],
  actions: [{ years:5, field:'cagrActions5' }, { years:10, field:'cagrActions10' }, { years:20, field:'cagrActions' }]
};
let zoomKey = null;
let zoomRange = 'max';
// Plages indépendantes de la carte normale pour les zooms qui ont leur propre
// sélecteur (cours de bourse + les 2 graphiques macro) — changer la plage en zoom
// n'affecte pas la carte normale, et vice versa.
let zoomStockRange = 'max';
let zoomMacroCycleRange = '20';
let zoomMacroRotationRange = '3';
const ZOOM_STOCK_RANGES = [['1','1a'],['2','2a'],['3','3a'],['5','5a'],['10','10a'],['20','20a'],['max','Max']];
const ZOOM_MACRO_CYCLE_RANGES = [['5','5a'],['10','10a'],['20','20a'],['max','Max']];
const ZOOM_MACRO_ROTATION_RANGES = [['1','1a'],['2','2a'],['3','3a'],['m1','1m'],['m2','2m'],['m3','3m']];

function renderZoomCagrRow(){
  const box = document.getElementById('zoomCagrRow');
  const metas = ZOOM_CAGR_META[zoomKey];
  if (!metas || !activeCompany){ box.innerHTML = ''; return; }
  const latest = companies[activeCompany][companies[activeCompany].length - 1];
  box.innerHTML = metas.map(m => {
    const val = latest[m.field];
    const txt = val != null ? (val >= 0 ? '+' : '') + val.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}) + '%' : '—';
    return `<div class="zoom-cagr-chip">CAGR ${m.years}a : <b>${txt}</b></div>`;
  }).join('');
}

// Zooms "spéciaux" (pas dans chartConfigs/ZOOM_HISTORICAL_KEYS) qui ont leur propre
// sélecteur de plage indépendant de la carte normale — cours de bourse + les 2
// graphiques macro à ratio temporel (demande explicite : pouvoir changer la plage
// même en plein écran, pas seulement sur la petite carte).
let zoomMacroRankingRow = 'Classement';
const ZOOM_SPECIAL_RANGES = {
  stock: ZOOM_STOCK_RANGES,
  macroCycle: ZOOM_MACRO_CYCLE_RANGES,
  macroRotation: ZOOM_MACRO_ROTATION_RANGES,
  macroRanking: MACRO_RANKING_OPTIONS
};
function zoomSpecialRangeGet(){
  if (zoomKey === 'stock') return zoomStockRange;
  if (zoomKey === 'macroCycle') return zoomMacroCycleRange;
  if (zoomKey === 'macroRotation') return zoomMacroRotationRange;
  if (zoomKey === 'macroRanking') return zoomMacroRankingRow;
  return null;
}
function zoomSpecialRangeSet(val){
  if (zoomKey === 'stock') zoomStockRange = val;
  else if (zoomKey === 'macroCycle') zoomMacroCycleRange = val;
  else if (zoomKey === 'macroRotation') zoomMacroRotationRange = val;
  else if (zoomKey === 'macroRanking') zoomMacroRankingRow = val;
}
function zoomSpecialChartConfig(){
  if (zoomKey === 'stock') return buildStockChartConfig(zoomStockRange);
  if (zoomKey === 'macroCycle') return buildMacroCycleChartConfig(zoomMacroCycleRange);
  if (zoomKey === 'macroRotation') return buildMacroRotationChartConfig(zoomMacroRotationRange);
  if (zoomKey === 'macroRanking') return buildMacroRankingChartConfig(zoomMacroRankingRow);
  return null;
}

function renderZoomRangeRow(){
  const row = document.getElementById('zoomRangeRow');
  if (ZOOM_SPECIAL_RANGES[zoomKey]){
    const current = zoomSpecialRangeGet();
    row.innerHTML = ZOOM_SPECIAL_RANGES[zoomKey].map(([val,label]) => `<button data-zrange="${val}" class="${current===val?'active':''}">${label}</button>`).join('');
    return;
  }
  if (!ZOOM_HISTORICAL_KEYS.includes(zoomKey)){ row.innerHTML = ''; return; }
  const ranges = [['5','5a'],['10','10a'],['20','20a'],['max','Max']];
  row.innerHTML = ranges.map(([val,label]) => `<button data-zrange="${val}" class="${zoomRange===val?'active':''}">${label}</button>`).join('');
}

function renderZoomChart(){
  if (window.__zoomChart){ window.__zoomChart.destroy(); window.__zoomChart = null; }
  if (ZOOM_SPECIAL_RANGES[zoomKey]){
    const config = zoomSpecialChartConfig();
    if (config) window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), config);
    return;
  }
  const baseConfig = chartConfigs[zoomKey];
  if (!baseConfig) return;
  const nYears = (!ZOOM_HISTORICAL_KEYS.includes(zoomKey) || zoomRange === 'max') ? null : parseInt(zoomRange, 10);
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), sliceChartConfigByYears(baseConfig, nYears));
}

function openZoom(key, title){
  if (!ZOOM_SPECIAL_RANGES[key] && !chartConfigs[key]) return;
  zoomKey = key;
  zoomRange = 'max';
  document.getElementById('zoomTitle').textContent = title;
  renderZoomRangeRow();
  renderZoomCagrRow();
  renderZoomChart();
  // Logo de l'entreprise affiché UNIQUEMENT en zoom (pas sur la petite carte, demande
  // explicite) — pour que l'export PDF d'un graphique zoomé reste identifiable. Ne
  // concerne que les graphiques liés à une entreprise (historiques + cours de bourse),
  // pas les graphiques macro qui partagent le même #zoomModal.
  const logoEl = document.getElementById('zoomEntityLogo');
  const isCompanyChart = key === 'stock' || ZOOM_HISTORICAL_KEYS.includes(key);
  const logo = isCompanyChart && activeCompany ? companyLogoUrl(activeCompany) : null;
  logoEl.style.display = logo ? '' : 'none';
  if (logo) logoEl.src = logo;
  document.getElementById('zoomModal').style.display = 'flex';
}
function closeZoom(){
  document.getElementById('zoomModal').style.display = 'none';
  if (window.__zoomChart){ window.__zoomChart.destroy(); window.__zoomChart = null; }
  zoomKey = null;
}
document.getElementById('zoomRangeRow').addEventListener('click', e => {
  const btn = e.target.closest('button[data-zrange]');
  if (!btn) return;
  if (ZOOM_SPECIAL_RANGES[zoomKey]) zoomSpecialRangeSet(btn.dataset.zrange);
  else zoomRange = btn.dataset.zrange;
  renderZoomRangeRow();
  renderZoomCagrRow();
  renderZoomChart();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeZoom(); });

function drawGauge(latest){
  const svg = document.getElementById('gaugeSvg');
  const badge = document.getElementById('verdictBadge');
  badge.className = 'gauge-verdict';

  if (latest.prixCible == null || latest.prixJuste == null || latest.prixActuel == null){
    svg.innerHTML = '';
    badge.textContent = 'Données insuffisantes';
    return;
  }

  const W = 1000, H = 90, top = 30, barH = 14;
  const lo = Math.min(latest.prixCible, latest.prixJuste, latest.prixActuel) * 0.85;
  const hi = Math.max(latest.prixCible, latest.prixJuste, latest.prixActuel) * 1.12;
  const x = v => 20 + (v - lo) / (hi - lo) * (W - 40);

  const xCible = x(latest.prixCible);
  const xJuste = x(latest.prixJuste);
  const xActuel = x(latest.prixActuel);

  let html = '';
  html += `<rect x="20" y="${top}" width="${xCible-20}" height="${barH}" rx="7" fill="${THEME.green}" opacity="0.28"/>`;
  html += `<rect x="${xCible}" y="${top}" width="${xJuste-xCible}" height="${barH}" fill="${THEME.gold}" opacity="0.28"/>`;
  html += `<rect x="${xJuste}" y="${top}" width="${W-20-xJuste}" height="${barH}" rx="7" fill="${THEME.red}" opacity="0.28"/>`;
  html += `<rect x="20" y="${top}" width="${W-40}" height="${barH}" rx="7" fill="none" stroke="${THEME.hair}"/>`;

  function marker(xv, label, value, color){
    return `
      <line x1="${xv}" y1="${top-4}" x2="${xv}" y2="${top+barH+4}" stroke="${color}" stroke-width="2"/>
      <circle cx="${xv}" cy="${top+barH/2}" r="4" fill="${color}"/>
      <text x="${xv}" y="${top-10}" text-anchor="middle" fill="${color}" font-size="13" font-weight="700" font-family="Plus Jakarta Sans, sans-serif">${label}</text>
      <text x="${xv}" y="${top+barH+22}" text-anchor="middle" fill="${THEME.dim}" font-size="12" font-family="Plus Jakarta Sans, sans-serif">${value.toFixed(1)} €</text>
    `;
  }
  html += marker(xCible, 'CIBLE', latest.prixCible, THEME.green);
  html += marker(xJuste, 'JUSTE', latest.prixJuste, THEME.gold);
  html += marker(xActuel, 'ACTUEL', latest.prixActuel, THEME.red);
  svg.innerHTML = html;

  if (latest.prixActuel > latest.prixJuste){
    badge.textContent = 'Survalorisée';
    badge.classList.add('verdict-over');
  } else if (latest.prixActuel > latest.prixCible){
    badge.textContent = 'Valorisation équitable';
    badge.classList.add('verdict-fair');
  } else {
    badge.textContent = "Zone d'achat";
    badge.classList.add('verdict-under');
  }
}

/* ============================================================
   ONGLET VALORISATION — simulations scénarisées
   Prix Juste Sim.  = FCF actuel × Médiane P/FCF
   Prix Cible       = Prix Juste Sim. × 0.8 (marge de sécurité 20%)
   Prix Est. (5a)   = FCF actuel × (1 + CAGR FCF)^5 × Médiane P/FCF
   Rendement (5a)   = (Prix Est. 5a / Prix actuel)^(1/5) - 1
   Historique de prix : colonne H (prixActuel), déjà en mémoire par année,
   PAS de nouvel appel réseau (ni Yahoo Finance, ni Stooq) pour ce graphique.
   ============================================================ */
const SCENARIOS = [
  { key:'optimiste', label:'Scénario Optimiste', color:'green', deltaCagr:5, deltaMultiple:3 },
  { key:'realiste', label:'Scénario Réaliste', color:'blue', deltaCagr:0, deltaMultiple:0 },
  { key:'pessimiste', label:'Scénario Pessimiste', color:'red', deltaCagr:-5, deltaMultiple:-3 }
];

let scenarioValues = {};
let scenarioCharts = {};
// Raccourcis de multiple les plus utilisés par l'utilisateur pour la médiane FCF/OCF —
// un clic règle directement le champ plutôt que de devoir taper la valeur.
const SCENARIO_QUICK_MULTIPLES = [10, 15, 20, 25];

function computeScenario(fcfActuel, prixActuel, cagr, multiple){
  const prixJusteSim = fcfActuel * multiple;
  const prixCible = prixJusteSim * 0.8;
  const prixEst5A = fcfActuel * Math.pow(1 + cagr / 100, 5) * multiple;
  const rendement5A = prixActuel > 0 ? (Math.pow(prixEst5A / prixActuel, 1 / 5) - 1) * 100 : null;
  return { prixJusteSim, prixCible, prixEst5A, rendement5A };
}

function scenarioCardHtml(s){
  return `
    <div class="scenario-card ${s.key}" data-key="${s.key}">
      <div class="scenario-title-row">
        <h3 class="scenario-title">${s.label}</h3>
        <button class="zoom-btn scenario-zoom-btn" data-zoom-scenario="${s.key}" title="Agrandir">⤢</button>
      </div>
      <div class="scenario-fcf-history">
        <span>Médiane P/${valorisationMetric.toUpperCase()} 10 ans <b>${document.getElementById('voMedianeHist').textContent}</b></span>
        <span>Médiane P/${valorisationMetric.toUpperCase()} 20 ans <b>${document.getElementById('voMediane20').textContent}</b></span>
      </div>
      <div class="scenario-row fixe">
        <div class="scenario-row-head"><span>${valorisationMetric.toUpperCase()} Actuel (Fixe)</span><span class="val" id="vo-${s.key}-fcf">—</span></div>
      </div>
      <div class="scenario-row">
        <div class="scenario-row-head"><span>CAGR ${valorisationMetric.toUpperCase()} Prévu (%)</span><span class="val" id="vo-${s.key}-cagrVal">—</span></div>
        <input type="number" class="scenario-number" id="vo-${s.key}-cagr" step="0.1">
      </div>
      <div class="scenario-row">
        <div class="scenario-row-head"><span>Médiane ${valorisationMetric.toUpperCase()} (Multiple)</span><span class="val" id="vo-${s.key}-multVal">—</span></div>
        <input type="number" class="scenario-number" id="vo-${s.key}-mult" min="0" step="0.1">
        <div class="scenario-quick-picks">
          ${SCENARIO_QUICK_MULTIPLES.map(v => `<button type="button" class="scenario-quick-btn" data-quick-mult="${v}">${v}x</button>`).join('')}
        </div>
      </div>
      <div class="scenario-results">
        <div><div class="r-k">Prix juste sim.</div><div class="r-v" id="vo-${s.key}-prixJuste">—</div></div>
        <div><div class="r-k">Prix cible (-20%)</div><div class="r-v" id="vo-${s.key}-prixCible">—</div></div>
        <div><div class="r-k">Prix est. (5a)</div><div class="r-v" id="vo-${s.key}-prixEst">—</div></div>
        <div><div class="r-k">Rendement (5a)</div><div class="r-v" id="vo-${s.key}-rendement">—</div></div>
      </div>
      <div class="scenario-chart-holder"><canvas id="vo-${s.key}-chart"></canvas></div>
    </div>
  `;
}

// Bascule FCF/OCF : mêmes formules exactement (computeScenario/wireScenarioCard ne
// connaissent que des noms génériques fcfActuel/cagr/multiple, indifférents à la
// métrique réelle derrière) — seule la SOURCE des 4 valeurs change. Pas de colonne
// "OCF par action" directe dans le Sheet, dérivée de prixActuel/pOcf (même principe
// que le P/FCF existant, juste inversé : ratio connu, prix connu, on en tire le FCF/
// OCF par action). Persisté (localStorage) et mémorisé dans chaque objectif enregistré
// pour ne pas se retrouver avec des sliders réglés pour une métrique en affichant une
// autre au rechargement.
let valorisationMetric = localStorage.getItem('wolfAnalysisValoMetric') || 'fcf';
function setValorisationMetric(metric){
  valorisationMetric = metric;
  try{ localStorage.setItem('wolfAnalysisValoMetric', metric); }catch(e){ /* ignore */ }
  document.querySelectorAll('#valoMetricToggle button').forEach(b => b.classList.toggle('active', b.dataset.metric === metric));
  if (activeCompany) renderValorisation(activeCompany);
}
function valorisationInputs(latest){
  if (valorisationMetric === 'ocf'){
    const ocfActuel = (latest.prixActuel != null && latest.pOcf) ? latest.prixActuel / latest.pOcf : null;
    return { fcfActuel: ocfActuel, cagrHist: latest.cagrOcf10, medianeHist: latest.medianePOcf, mediane20: latest.medianePOcf20, label:'OCF' };
  }
  return { fcfActuel: latest.fcfParAction, cagrHist: latest.cagrFcf10, medianeHist: latest.medianePFCF, mediane20: latest.medianePFCF20, label:'FCF' };
}

function renderValorisation(nom){
  const hist = companies[nom];
  if (!hist) return;
  const latest = hist[hist.length - 1];
  const { fcfActuel, cagrHist, medianeHist, mediane20, label } = valorisationInputs(latest);
  const prixActuel = latest.prixActuel;

  document.getElementById('voPrixActuel').textContent = prixActuel != null ? fmtEUR(prixActuel) : 'N/D';
  document.getElementById('voFcfLabel').textContent = label + ' actuel';
  document.getElementById('voFcfActuel').textContent = fcfActuel != null ? fmtEUR(fcfActuel) : 'N/D';
  document.getElementById('voCagrHist').textContent = cagrHist != null ? fmtPct(cagrHist) : 'N/D';
  document.getElementById('voMedianeHist').textContent = medianeHist != null ? medianeHist.toLocaleString('fr-FR', {minimumFractionDigits:1}) + 'x' : 'N/D';
  document.getElementById('voMediane20').textContent = mediane20 != null ? mediane20.toLocaleString('fr-FR', {minimumFractionDigits:1}) + 'x' : 'N/D';

  scenarioValues = {};
  SCENARIOS.forEach(s => {
    scenarioValues[s.key] = {
      cagr: cagrHist != null ? +(cagrHist + s.deltaCagr).toFixed(1) : 0,
      multiple: medianeHist != null ? +(medianeHist + s.deltaMultiple).toFixed(1) : 0
    };
  });

  Object.values(scenarioCharts).forEach(ch => ch && ch.destroy());
  scenarioCharts = {};

  const scenarioGrid = document.getElementById('scenarioGrid');
  scenarioGrid.innerHTML = SCENARIOS.map(scenarioCardHtml).join('');
  scenarioGrid.querySelectorAll('[data-zoom-scenario]').forEach(btn => {
    btn.addEventListener('click', () => openScenarioZoom(btn.dataset.zoomScenario));
  });

  SCENARIOS.forEach(s => wireScenarioCard(s, hist, fcfActuel, prixActuel));

  renderObjectifsHistory(nom);
}

function wireScenarioCard(s, hist, fcfActuel, prixActuel){
  const cagrInput = document.getElementById('vo-' + s.key + '-cagr');
  const multInput = document.getElementById('vo-' + s.key + '-mult');
  document.getElementById('vo-' + s.key + '-fcf').textContent = fcfActuel != null ? fmtEUR(fcfActuel) : 'N/D';

  cagrInput.value = scenarioValues[s.key].cagr;
  multInput.value = scenarioValues[s.key].multiple;

  const card = document.querySelector(`.scenario-card[data-key="${s.key}"]`);
  function syncQuickButtons(){
    if (!card) return;
    card.querySelectorAll('.scenario-quick-btn').forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.quickMult) === scenarioValues[s.key].multiple);
    });
  }
  function update(){
    scenarioValues[s.key].cagr = parseFloat(cagrInput.value);
    scenarioValues[s.key].multiple = parseFloat(multInput.value);
    syncQuickButtons();
    updateScenarioCard(s, hist, fcfActuel, prixActuel);
  }
  cagrInput.addEventListener('input', update);
  multInput.addEventListener('input', update);
  syncQuickButtons();

  if (card){
    card.querySelectorAll('.scenario-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        multInput.value = btn.dataset.quickMult;
        update();
      });
    });
  }

  updateScenarioCard(s, hist, fcfActuel, prixActuel);
}

function updateScenarioCard(s, hist, fcfActuel, prixActuel){
  const { cagr, multiple } = scenarioValues[s.key];
  document.getElementById('vo-' + s.key + '-cagrVal').textContent = cagr.toLocaleString('fr-FR', {minimumFractionDigits:1}) + '%';
  document.getElementById('vo-' + s.key + '-multVal').textContent = multiple.toLocaleString('fr-FR', {minimumFractionDigits:1}) + 'x';

  if (fcfActuel == null || prixActuel == null){
    ['prixJuste','prixCible','prixEst','rendement'].forEach(k => { document.getElementById('vo-'+s.key+'-'+k).textContent = 'N/D'; });
    return;
  }

  const { prixJusteSim, prixCible, prixEst5A, rendement5A } = computeScenario(fcfActuel, prixActuel, cagr, multiple);

  document.getElementById('vo-'+s.key+'-prixJuste').textContent = fmtEUR(prixJusteSim);
  document.getElementById('vo-'+s.key+'-prixCible').textContent = fmtEUR(prixCible);
  document.getElementById('vo-'+s.key+'-prixEst').textContent = fmtEUR(prixEst5A);
  const rendEl = document.getElementById('vo-'+s.key+'-rendement');
  rendEl.textContent = (rendement5A >= 0 ? '+' : '') + rendement5A.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + '%';
  rendEl.className = 'r-v ' + (rendement5A >= 0 ? 'pos' : 'neg');

  renderScenarioChart(s, hist, prixJusteSim, prixEst5A);
}

function buildScenarioChartConfig(s, hist, prixJusteSim, prixEst5A){
  const years = hist.map(r => r.annee);
  const prices = hist.map(r => r.prixActuel);
  const targetYear = years[years.length - 1] + 5;
  const labels = years.concat([targetYear + ' (Est.)']);

  const histData = prices.concat([null]);
  const prixJusteLine = labels.map(() => prixJusteSim);
  const prixEstLine = labels.map(() => prixEst5A);
  const projection = labels.map(() => null);
  projection[labels.length - 2] = prices[prices.length - 1];
  projection[labels.length - 1] = prixEst5A;

  const accent = THEME[s.color];

  return {
    type:'line',
    data:{ labels, datasets:[
      { label:'Historique', data:histData, borderColor:THEME.blue, backgroundColor:'transparent', tension:0.15, pointRadius:2, borderWidth:1.5, spanGaps:false },
      { label:'Prix juste', data:prixJusteLine, borderColor:THEME.gold, borderWidth:1, borderDash:[3,3], pointRadius:0 },
      { label:'Prix est. (5a)', data:prixEstLine, borderColor:accent, borderWidth:1, borderDash:[3,3], pointRadius:0 },
      { label:'Ligne projection', data:projection, borderColor:accent, borderWidth:1.5, borderDash:[6,4], pointRadius:2, spanGaps:true }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top', labels:{boxWidth:8, usePointStyle:true, font:{size:9.5}}}},
      scales:{
        x:{ grid:{display:false}, ticks:{color:THEME.dim, maxTicksLimit:8, font:{size:9.5}}, border:{color:THEME.hair} },
        y:{ grid:baseGrid, ticks:{color:THEME.dim, font:{size:9.5}, callback:v=>v+' €'} }
      }
    }
  };
}

function renderScenarioChart(s, hist, prixJusteSim, prixEst5A){
  if (scenarioCharts[s.key]) scenarioCharts[s.key].destroy();
  scenarioCharts[s.key] = new Chart(document.getElementById('vo-' + s.key + '-chart').getContext('2d'), buildScenarioChartConfig(s, hist, prixJusteSim, prixEst5A));
}

// Zoom scénario : au lieu de reconstruire un graphique isolé (ce qui perdait les
// sliders/FCF/CAGR/prix juste déjà visibles sur la petite carte), on DÉPLACE la carte
// entière (DOM) dans la modale — sliders, résultats et canvas restent le même élément,
// donc toujours vivants et synchronisés, pas de duplication de logique de rendu.
function openScenarioZoom(key){
  const card = document.querySelector('.scenario-card[data-key="' + key + '"]');
  const body = document.getElementById('scenarioZoomBody');
  if (!card || !body) return;
  card._zoomHome = { parent: card.parentNode, next: card.nextSibling };
  body.appendChild(card);
  card.classList.add('scenario-card-zoomed');
  const logoEl = document.getElementById('scenarioZoomEntityLogo');
  const logo = activeCompany ? companyLogoUrl(activeCompany) : null;
  logoEl.style.display = logo ? '' : 'none';
  if (logo) logoEl.src = logo;
  document.getElementById('scenarioZoomModal').style.display = 'flex';
  if (scenarioCharts[key]) scenarioCharts[key].resize();
}
function closeScenarioZoom(){
  const body = document.getElementById('scenarioZoomBody');
  const card = body.firstElementChild;
  if (card && card._zoomHome){
    card.classList.remove('scenario-card-zoomed');
    const { parent, next } = card._zoomHome;
    if (next) parent.insertBefore(card, next); else parent.appendChild(card);
    const key = card.dataset.key;
    if (scenarioCharts[key]) scenarioCharts[key].resize();
  }
  document.getElementById('scenarioZoomModal').style.display = 'none';
}

/* ============================================================
   HISTORIQUE DES OBJECTIFS — fiche par entreprise (date + valeurs
   des 3 scénarios), persistée dans le navigateur (localStorage).
   Pas d'écriture vers le Google Sheet (source en lecture seule).
   data/objectifs.json sert de socle optionnel, mis à jour par
   Claude Code quand l'utilisateur exporte et transmet le fichier.
   ============================================================ */
const OBJECTIFS_BASELINE_URL = 'data/objectifs.json';
const OBJECTIFS_LS_KEY = 'wolfAnalysisObjectifs';
let objectifsStore = {};

function mergeObjectifs(base, extra){
  const merged = {};
  Object.keys(base || {}).forEach(nom => { merged[nom] = (base[nom] || []).slice(); });
  Object.keys(extra || {}).forEach(nom => {
    merged[nom] = (merged[nom] || []).concat(extra[nom] || []);
  });
  return merged;
}

async function loadObjectifsBaseline(){
  try{
    const res = await fetch(OBJECTIFS_BASELINE_URL, { cache:'no-store' });
    if (res.ok){
      const json = await res.json();
      if (json && typeof json === 'object') objectifsStore = mergeObjectifs(json, objectifsStore);
    }
  }catch(e){ /* fichier absent ou fetch bloqué (ex. file://) — non bloquant */ }
  loadObjectifsLocal();
  if (activeCompany) renderObjectifsHistory(activeCompany);
}

function loadObjectifsLocal(){
  try{
    const raw = localStorage.getItem(OBJECTIFS_LS_KEY);
    if (raw) objectifsStore = mergeObjectifs(objectifsStore, JSON.parse(raw));
  }catch(e){ /* localStorage indisponible ou JSON corrompu */ }
}

function persistObjectifsLocal(){
  try{ localStorage.setItem(OBJECTIFS_LS_KEY, JSON.stringify(objectifsStore)); }catch(e){ /* quota / navigateur privé */ }
}

function saveObjectif(nom){
  if (!objectifsStore[nom]) objectifsStore[nom] = [];
  const snapshot = {};
  SCENARIOS.forEach(s => { snapshot[s.key] = { cagr: scenarioValues[s.key].cagr, multiple: scenarioValues[s.key].multiple }; });
  objectifsStore[nom].push({ date: new Date().toISOString().slice(0, 10), scenarios: snapshot, metric: valorisationMetric });
  persistObjectifsLocal();
  renderObjectifsHistory(nom);
}

// Regroupe les entrées par date pour afficher FCF et OCF de la même date côte à côte
// (2 colonnes) plutôt qu'en pleine largeur l'une sous l'autre — demande explicite de
// l'utilisateur, l'ancien affichage "prenait trop de place" pour des entrées courtes.
function renderObjectifsHistory(nom){
  const box = document.getElementById('objectifsList');
  if (!box) return;
  const entries = (objectifsStore[nom] || []).map((e, i) => ({ e, realIdx: i })).reverse();
  if (entries.length === 0){
    box.innerHTML = '<div class="objectifs-empty">Aucun objectif enregistré pour cette entreprise.</div>';
    return;
  }
  const groups = [];
  entries.forEach(item => {
    let g = groups.find(g => g.date === item.e.date);
    if (!g){ g = { date: item.e.date, items: [] }; groups.push(g); }
    g.items.push(item);
  });
  box.innerHTML = groups.map(g => {
    const cards = g.items.map(({ e, realIdx }) => {
      const metric = e.metric === 'ocf' ? 'ocf' : 'fcf';
      const parts = SCENARIOS.map(s => {
        const v = e.scenarios[s.key];
        return v ? `<b>${s.label.replace('Scénario ', '')}</b> ${v.cagr}% / ${v.multiple}x` : '';
      }).filter(Boolean).join(' · ');
      return `<div class="objectifs-entry">
        <div class="objectifs-entry-head">
          <span class="objectifs-metric-tag ${metric}">${metric.toUpperCase()}</span>
          <div class="objectifs-entry-actions"><button class="load" data-idx="${realIdx}">↻ Charger</button><button class="del" data-idx="${realIdx}" aria-label="Supprimer">✕</button></div>
        </div>
        <span class="scen">${parts}</span>
      </div>`;
    }).join('');
    return `<div class="objectifs-date-group"><span class="objectifs-date-label">${g.date}</span><div class="objectifs-date-row">${cards}</div></div>`;
  }).join('');
}

function applyObjectif(nom, idx){
  const entry = (objectifsStore[nom] || [])[idx];
  if (!entry) return;
  setValorisationMetric(entry.metric || 'fcf');
  SCENARIOS.forEach(s => {
    const v = entry.scenarios[s.key];
    if (!v) return;
    scenarioValues[s.key] = { cagr: v.cagr, multiple: v.multiple };
    const cagrInput = document.getElementById('vo-' + s.key + '-cagr');
    const multInput = document.getElementById('vo-' + s.key + '-mult');
    if (cagrInput) cagrInput.value = v.cagr;
    if (multInput) multInput.value = v.multiple;
  });
  const hist = companies[nom];
  const latest = hist[hist.length - 1];
  const { fcfActuel } = valorisationInputs(latest);
  SCENARIOS.forEach(s => updateScenarioCard(s, hist, fcfActuel, latest.prixActuel));
}

// Connecte l'onglet Analyse à l'onglet Valorisation : affiche un résumé compact du
// dernier objectif enregistré (FCF et/ou OCF) directement sous les ratios clés, sans
// devoir changer d'onglet — demande explicite de l'utilisateur ("créer du sens entre
// les deux"). Purement une lecture de objectifsStore, aucun nouveau calcul/état.
function renderAnalyseValoSummary(nom){
  const label = document.getElementById('analyseValoSectionLabel');
  const box = document.getElementById('analyseValoCard');
  if (!label || !box) return;
  const hist = companies[nom];
  const latest = hist[hist.length - 1];

  const blocks = ['fcf', 'ocf'].map(metric => {
    const entry = lastObjectifForMetric(nom, metric);
    if (!entry) return '';
    const metricActuel = metric === 'ocf'
      ? (latest.prixActuel != null && latest.pOcf ? latest.prixActuel / latest.pOcf : null)
      : latest.fcfParAction;
    const rows = SCENARIOS.map(s => {
      const v = entry.scenarios[s.key];
      if (!v || metricActuel == null || latest.prixActuel == null) return '';
      const { prixJusteSim, rendement5A } = computeScenario(metricActuel, latest.prixActuel, v.cagr, v.multiple);
      const rendCls = rendement5A >= 0 ? 'pos' : 'neg';
      return `<div class="analyse-valo-row ${s.color}">
        <span class="analyse-valo-scen">${s.label.replace('Scénario ', '')}</span>
        <span class="analyse-valo-pj">Prix juste ${fmtEUR(prixJusteSim)}</span>
        <span class="analyse-valo-rend ${rendCls}">${(rendement5A >= 0 ? '+' : '') + rendement5A.toLocaleString('fr-FR', { minimumFractionDigits:1, maximumFractionDigits:1 })}%</span>
      </div>`;
    }).filter(Boolean).join('');
    if (!rows) return '';
    return `<div class="analyse-valo-block">
      <div class="analyse-valo-block-head"><span class="objectifs-metric-tag ${metric}">${metric.toUpperCase()}</span><span class="analyse-valo-date">${entry.date}</span></div>
      ${rows}
    </div>`;
  }).filter(Boolean);

  if (blocks.length === 0){
    label.style.display = 'none';
    box.style.display = 'none';
    return;
  }
  label.style.display = '';
  box.style.display = '';
  box.innerHTML = blocks.join('') + `<button class="analyse-valo-link" onclick="switchPage('pageValorisation')">Ouvrir dans Valorisation →</button>`;
}

function exportObjectifs(){
  const blob = new Blob([JSON.stringify(objectifsStore, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wolf-analysis-objectifs.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   ONGLET WATCHLIST — glisser-déposer natif HTML5, 4 listes.
   Même pattern de persistance que l'historique des objectifs :
   localStorage + export JSON + socle data/watchlist.json optionnel.
   ============================================================ */
const WATCHLIST_LISTS = ['achat', 'idee', 'surveiller', 'analyser'];
const WATCHLIST_BASELINE_URL = 'data/watchlist.json';
const WATCHLIST_LS_KEY = 'wolfAnalysisWatchlist';
let watchlistStore = { achat:[], idee:[], surveiller:[], analyser:[] };

function mergeWatchlist(extra){
  WATCHLIST_LISTS.forEach(key => {
    (extra[key] || []).forEach(nom => { if (!watchlistStore[key].includes(nom)) watchlistStore[key].push(nom); });
  });
}

async function loadWatchlistBaseline(){
  try{
    const res = await fetch(WATCHLIST_BASELINE_URL, { cache:'no-store' });
    if (res.ok){
      const json = await res.json();
      if (json && typeof json === 'object') mergeWatchlist(json);
    }
  }catch(e){ /* fichier absent ou fetch bloqué (ex. file://) — non bloquant */ }
  try{
    const raw = localStorage.getItem(WATCHLIST_LS_KEY);
    if (raw) mergeWatchlist(JSON.parse(raw));
  }catch(e){ /* localStorage indisponible ou JSON corrompu */ }
  renderWatchlist();
}

function persistWatchlistLocal(){
  try{ localStorage.setItem(WATCHLIST_LS_KEY, JSON.stringify(watchlistStore)); }catch(e){ /* quota / navigateur privé */ }
}

function exportWatchlist(){
  const blob = new Blob([JSON.stringify(watchlistStore, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wolf-analysis-watchlist.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const WATCHLIST_LABELS = { achat:"Liste d'achat", idee:'Idée du moment', surveiller:'À surveiller', analyser:'À analyser' };
function exportWatchlistAsPdf(){
  const body = WATCHLIST_LISTS.map(key => {
    const noms = watchlistStore[key] || [];
    const rows = noms.length
      ? `<table class="print-table"><thead><tr><th>Entreprise</th></tr></thead><tbody>${noms.map(n => `<tr><td>${n.replace(/</g,'&lt;')}</td></tr>`).join('')}</tbody></table>`
      : '<p style="color:#999">Aucune entreprise dans cette liste.</p>';
    return `<div class="print-section"><h3>${WATCHLIST_LABELS[key]} (${noms.length})</h3>${rows}</div>`;
  }).join('');
  exportSectionAsPdf('Watchlist', null, body);
}

function watchlistLocationOf(nom){
  return WATCHLIST_LISTS.find(key => watchlistStore[key].includes(nom)) || null;
}

function moveToWatchlist(nom, listKey){
  WATCHLIST_LISTS.forEach(key => {
    const idx = watchlistStore[key].indexOf(nom);
    if (idx !== -1) watchlistStore[key].splice(idx, 1);
  });
  if (listKey) watchlistStore[listKey].push(nom);
  persistWatchlistLocal();
  renderWatchlist();
}

function watchlistChipHtml(nom, logo){
  const safe = nom.replace(/"/g, '&quot;');
  return `<div class="watchlist-chip" draggable="true" data-nom="${safe}" title="${safe}"><img src="${logo || ''}" alt=""></div>`;
}

function applyWatchlistSearchFilter(){
  const input = document.getElementById('watchlistSearch');
  if (!input) return;
  const q = stripAccents(input.value.trim().toLowerCase());
  document.querySelectorAll('#watchlistPool .watchlist-chip[data-nom]').forEach(chip => {
    const match = !q || stripAccents(chip.dataset.nom.toLowerCase()).includes(q);
    chip.classList.toggle('filtered-out', !match);
  });
}

function renderWatchlist(){
  const pool = document.getElementById('watchlistPool');
  if (!pool) return;

  const unassigned = Object.keys(companies).filter(nom => !watchlistLocationOf(nom));
  pool.innerHTML = unassigned.length
    ? unassigned.map(nom => watchlistChipHtml(nom, companies[nom][companies[nom].length - 1].lienImage)).join('')
    : '<div class="objectifs-empty">Toutes les entreprises sont déjà classées dans une liste.</div>';
  applyWatchlistSearchFilter();

  WATCHLIST_LISTS.forEach(key => {
    const zone = document.querySelector(`.watchlist-dropzone[data-list="${key}"]`);
    if (!zone) return;
    zone.innerHTML = watchlistStore[key]
      .filter(nom => companies[nom])
      .map(nom => watchlistChipHtml(nom, companies[nom][companies[nom].length - 1].lienImage))
      .join('');
  });
}

function initWatchlist(){
  const page = document.getElementById('pageWatchlist');
  if (!page) return;

  page.addEventListener('dragstart', e => {
    const chip = e.target.closest('.watchlist-chip[data-nom]');
    if (!chip) return;
    e.dataTransfer.setData('text/plain', chip.dataset.nom);
    e.dataTransfer.effectAllowed = 'move';
    chip.classList.add('dragging');
  });
  page.addEventListener('dragend', e => {
    const chip = e.target.closest('.watchlist-chip');
    if (chip) chip.classList.remove('dragging');
  });

  const dropTargets = [document.getElementById('watchlistPool'), ...page.querySelectorAll('.watchlist-dropzone')];
  dropTargets.forEach(zone => {
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const nom = e.dataTransfer.getData('text/plain');
      if (!nom) return;
      moveToWatchlist(nom, zone.dataset.list || null);
    });
  });

  page.addEventListener('click', e => {
    const chip = e.target.closest('.watchlist-chip[data-nom]');
    if (chip) goToAnalyse(chip.dataset.nom);
  });

  const searchInput = document.getElementById('watchlistSearch');
  if (searchInput) searchInput.addEventListener('input', applyWatchlistSearchFilter);

  const exportBtn = document.getElementById('watchlistExportBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportWatchlist);
  const exportPdfBtn = document.getElementById('watchlistExportPdfBtn');
  if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportWatchlistAsPdf);
}

/* ============================================================
   ALERTES DE PRIX — pas de notification/email (choix explicite de
   l'utilisateur : une vraie alerte en arrière-plan demanderait un
   backend planifié, hors périmètre du site statique actuel). Seuil
   programmé depuis l'onglet Analyse (widget sous le prix actuel),
   liste consultable dans l'onglet Alertes, mise en évidence visuelle
   quand le seuil est atteint. Persistance identique aux autres
   onglets : localStorage + socle data/alertes.json.
   ============================================================ */
const ALERTES_LS_KEY = 'wolfAnalysisAlertes';
const ALERTES_BASELINE_URL = 'data/alertes.json';
let alertesStore = {}; // { [nom]: [{ id, seuil, direction: 'up'|'down' }, ...] } — plusieurs alertes par entreprise
let priceAlertEditing = false;

// D'anciennes données locales peuvent avoir été enregistrées au format { seuil, direction }
// (une seule alerte par entreprise) avant le passage aux alertes multiples — migré ici
// vers un tableau plutôt que perdu, conformément à la règle "ne jamais rien supprimer".
function migrateAlertesFormat(){
  Object.keys(alertesStore).forEach(nom => {
    const v = alertesStore[nom];
    if (!Array.isArray(v)){
      alertesStore[nom] = v && v.seuil != null ? [Object.assign({ id: 'a' + Date.now() + Math.random().toString(36).slice(2) }, v)] : [];
    }
  });
}

async function loadAlertesBaseline(){
  try{
    const res = await fetch(ALERTES_BASELINE_URL, { cache:'no-store' });
    if (res.ok){
      const json = await res.json();
      if (json && typeof json === 'object') Object.assign(alertesStore, json);
    }
  }catch(e){ /* socle absent ou fetch bloqué (ex. file://) — non bloquant */ }
  try{
    const raw = localStorage.getItem(ALERTES_LS_KEY);
    if (raw) Object.assign(alertesStore, JSON.parse(raw));
  }catch(e){ /* localStorage indisponible ou JSON corrompu */ }
  migrateAlertesFormat();
  renderAlertesTab();
  if (activeCompany) renderPriceAlertWidget(activeCompany, companies[activeCompany][companies[activeCompany].length - 1].prixActuel);
}

function persistAlertesLocal(){
  try{ localStorage.setItem(ALERTES_LS_KEY, JSON.stringify(alertesStore)); }catch(e){ /* quota / navigateur privé */ }
}

function exportAlertes(){
  const blob = new Blob([JSON.stringify(alertesStore, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wolf-analysis-alertes.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function addAlerte(nom, seuil, prixActuelRef){
  if (!alertesStore[nom]) alertesStore[nom] = [];
  alertesStore[nom].push({ id: 'a' + Date.now() + Math.random().toString(36).slice(2), seuil, direction: seuil <= prixActuelRef ? 'down' : 'up' });
  persistAlertesLocal();
}
function removeAlerte(nom, id){
  if (!alertesStore[nom]) return;
  alertesStore[nom] = alertesStore[nom].filter(a => a.id !== id);
  if (!alertesStore[nom].length) delete alertesStore[nom];
  persistAlertesLocal();
}
function isAlerteTriggered(alerte, prixActuel){
  if (!alerte || prixActuel == null) return false;
  return alerte.direction === 'down' ? prixActuel <= alerte.seuil : prixActuel >= alerte.seuil;
}

function renderPriceAlertWidget(nom, prixActuel){
  const box = document.getElementById('priceAlertWidget');
  if (!box) return;
  const alertes = alertesStore[nom] || [];

  const badges = alertes.map(a => {
    const triggered = isAlerteTriggered(a, prixActuel);
    return `<div class="price-alert-badge${triggered ? ' triggered' : ''}">
      🔔 ${a.seuil.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} €${triggered ? ' — atteinte' : ''}
      <button class="price-alert-del" data-id="${a.id}" aria-label="Supprimer">✕</button>
    </div>`;
  }).join('');

  const formOrButton = priceAlertEditing
    ? `<div class="price-alert-form">
        <input type="number" step="0.01" min="0" id="priceAlertInput" placeholder="Seuil en €">
        <button id="priceAlertSave" aria-label="Enregistrer">✓</button>
        <button id="priceAlertCancel" aria-label="Annuler">✕</button>
      </div>`
    : `<button class="price-alert-set-btn" id="priceAlertSetBtn">🔔 ${alertes.length ? 'Ajouter une alerte' : 'Programmer une alerte'}</button>`;

  box.innerHTML = `<div class="price-alert-list">${badges}</div>${formOrButton}`;

  box.querySelectorAll('.price-alert-del').forEach(btn => {
    btn.addEventListener('click', () => { removeAlerte(nom, btn.dataset.id); renderPriceAlertWidget(nom, prixActuel); renderAlertesTab(); });
  });

  if (priceAlertEditing){
    const input = document.getElementById('priceAlertInput');
    input.focus();
    const submit = () => {
      const v = parseFloat(input.value);
      if (isNaN(v) || v <= 0){ input.focus(); return; }
      addAlerte(nom, v, prixActuel);
      priceAlertEditing = false;
      renderPriceAlertWidget(nom, prixActuel);
      renderAlertesTab();
    };
    document.getElementById('priceAlertSave').addEventListener('click', submit);
    document.getElementById('priceAlertCancel').addEventListener('click', () => { priceAlertEditing = false; renderPriceAlertWidget(nom, prixActuel); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  } else {
    document.getElementById('priceAlertSetBtn').addEventListener('click', () => { priceAlertEditing = true; renderPriceAlertWidget(nom, prixActuel); });
  }
}

function renderAlertesTab(){
  const box = document.getElementById('alertesList');
  if (!box) return;

  const rows = [];
  Object.keys(alertesStore).forEach(nom => {
    if (!companies[nom]) return;
    const latest = companies[nom][companies[nom].length - 1];
    (alertesStore[nom] || []).forEach(alerte => {
      rows.push({ nom, logo: latest.lienImage, prixActuel: latest.prixActuel, seuil: alerte.seuil, triggered: isAlerteTriggered(alerte, latest.prixActuel) });
    });
  });
  rows.sort((a, b) => (b.triggered ? 1 : 0) - (a.triggered ? 1 : 0));

  box.innerHTML = rows.length ? rows.map(r => `
    <div class="alerte-row${r.triggered ? ' triggered' : ''}" data-nom="${r.nom.replace(/"/g, '&quot;')}">
      <div class="alerte-logo"><img src="${r.logo || ''}" alt=""></div>
      <div class="alerte-name">${r.nom}</div>
      <div class="alerte-seuil">Seuil : ${r.seuil.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} €</div>
      <div class="alerte-prix">Actuel : ${r.prixActuel.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})} €</div>
      <div class="alerte-status">${r.triggered ? '🔔 Déclenchée' : 'En attente'}</div>
    </div>`).join('')
    : '<div class="objectifs-empty">Aucune alerte programmée pour l\'instant. Depuis l\'onglet Analyse, clique sur « 🔔 Programmer une alerte » sous le prix actuel d\'une entreprise.</div>';
}

function initAlertes(){
  const box = document.getElementById('alertesList');
  if (!box) return;
  box.addEventListener('click', e => {
    const row = e.target.closest('.alerte-row[data-nom]');
    if (row) goToAnalyse(row.dataset.nom);
  });
  const exportBtn = document.getElementById('alertesExportBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportAlertes);
}

/* ============================================================
   ONGLET CERVEAU NUMÉRIQUE — 11 secteurs GICS → chaînes de valeur
   définies par l'utilisateur (nom + phases libres) → entreprises
   assignées par phase → fiche par entité (texte, images, croquis).
   Stockage IndexedDB (pas localStorage : trop petit pour des images).
   data/cerveau.json sert de socle optionnel, mis à jour par Claude
   quand l'utilisateur exporte et transmet le fichier.
   ============================================================ */
const CERVEAU_DB_NAME = 'wolfAnalysisCerveau';
const CERVEAU_STORE = 'state';
let cerveauDB = null;
let cerveauData = { chains:{}, notes:{}, analyses:{} };
let cerveauView = { level:'secteurs' };

function openCerveauDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CERVEAU_DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(CERVEAU_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadCerveauData(){
  GICS_SECTORS.forEach(s => { if (!cerveauData.chains[s.key]) cerveauData.chains[s.key] = []; });
  if (!cerveauData.chains.autre) cerveauData.chains.autre = [];

  try{
    const res = await fetch('data/cerveau.json', { cache:'no-store' });
    if (res.ok){
      const json = await res.json();
      if (json && json.chains) Object.assign(cerveauData.chains, json.chains);
      if (json && json.notes) Object.assign(cerveauData.notes, json.notes);
      if (json && json.analyses) Object.assign(cerveauData.analyses, json.analyses);
    }
  }catch(e){ /* socle absent ou fetch bloqué (ex. file://) — non bloquant */ }

  try{
    cerveauDB = await openCerveauDB();
    const stored = await new Promise((resolve, reject) => {
      const req = cerveauDB.transaction(CERVEAU_STORE, 'readonly').objectStore(CERVEAU_STORE).get('state');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (stored){
      if (stored.chains) Object.keys(stored.chains).forEach(k => { cerveauData.chains[k] = stored.chains[k]; });
      if (stored.notes) Object.keys(stored.notes).forEach(k => { cerveauData.notes[k] = stored.notes[k]; });
      if (stored.analyses) Object.keys(stored.analyses).forEach(k => { cerveauData.analyses[k] = stored.analyses[k]; });
    }
  }catch(e){ /* IndexedDB indisponible (navigation privée stricte...) — non bloquant */ }

  migrateCerveauChains();
  renderCerveau();
}

function persistCerveauData(){
  if (!cerveauDB) return;
  try{ cerveauDB.transaction(CERVEAU_STORE, 'readwrite').objectStore(CERVEAU_STORE).put(cerveauData, 'state'); }
  catch(e){ /* ignore */ }
}

function exportCerveau(){
  const blob = new Blob([JSON.stringify(cerveauData, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wolf-analysis-cerveau.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function cerveauSectorLabel(key){
  return (GICS_SECTORS.find(s => s.key === key) || { label:'Autre / non classé' }).label;
}

function renderCerveau(){
  const box = document.getElementById('cerveauContent');
  if (!box) return;
  if (cerveauView.level === 'chaines') return renderCerveauChaines(box);
  if (cerveauView.level === 'phases') return renderCerveauPhases(box);
  renderCerveauSecteurs(box);
}

function renderCerveauSecteurs(box){
  const allSectors = GICS_SECTORS.concat([{ key:'autre', label:'Autre / non classé' }]);
  box.innerHTML = `
    <div class="cerveau-actions"><button class="zoom-btn objectifs-export" id="cerveauExportBtn">⭳ Exporter</button></div>
    <div class="sector-grid">${allSectors.map(s => {
      const n = (cerveauData.chains[s.key] || []).length;
      return `<div class="sector-box cerveau-sector-box" data-secteur="${s.key}"><h3>${s.label}</h3><div class="count">${n} chaîne${n > 1 ? 's' : ''} de valeur</div></div>`;
    }).join('')}</div>`;
  document.getElementById('cerveauExportBtn').addEventListener('click', exportCerveau);
  box.querySelectorAll('.cerveau-sector-box').forEach(el => {
    el.addEventListener('click', () => { cerveauView = { level:'chaines', secteur: el.dataset.secteur }; renderCerveau(); });
  });
}

function renderCerveauChaines(box){
  const secteur = cerveauView.secteur;
  const chains = cerveauData.chains[secteur] || [];
  const creating = !!cerveauView.creatingChain;
  box.innerHTML = `
    <div class="cerveau-breadcrumb"><a data-back="secteurs">Secteurs</a> / ${cerveauSectorLabel(secteur)}</div>
    <div class="cerveau-actions">${creating ? '' : '<button class="refresh-btn" id="cerveauNewChain">+ Nouvelle chaîne de valeur</button>'}</div>
    ${creating ? `
    <div class="cerveau-new-chain-form">
      <label for="cerveauChainName">Nom de la chaîne de valeur</label>
      <input type="text" id="cerveauChainName" placeholder="ex. Équipements électriques">
      <label for="cerveauChainPhases">Phases (séparées par des virgules)</label>
      <input type="text" id="cerveauChainPhases" value="Amont, Transformation, Distribution, Services">
      <div class="cerveau-new-chain-actions">
        <button class="refresh-btn" id="cerveauChainCreate">Créer</button>
        <button class="cerveau-btn-cancel" id="cerveauChainCancel">Annuler</button>
      </div>
    </div>` : ''}
    <div class="cerveau-chain-grid">${chains.length
      ? chains.map(c => `<div class="sector-box cerveau-chain-box" data-chain="${c.id}"><h3>${c.nom}</h3><div class="count">${c.phases.length} phases</div></div>`).join('')
      : '<div class="objectifs-empty">Aucune chaîne de valeur pour ce secteur pour l\'instant.</div>'}</div>`;

  box.querySelector('[data-back="secteurs"]').addEventListener('click', () => { cerveauView = { level:'secteurs' }; renderCerveau(); });
  box.querySelectorAll('.cerveau-chain-box').forEach(el => {
    el.addEventListener('click', () => { cerveauView = { level:'phases', secteur, chainId: el.dataset.chain }; renderCerveau(); });
  });

  if (!creating){
    document.getElementById('cerveauNewChain').addEventListener('click', () => {
      cerveauView = { level:'chaines', secteur, creatingChain:true };
      renderCerveau();
    });
    return;
  }

  const nameInput = document.getElementById('cerveauChainName');
  nameInput.focus();
  document.getElementById('cerveauChainCancel').addEventListener('click', () => {
    cerveauView = { level:'chaines', secteur };
    renderCerveau();
  });
  const submit = () => {
    const nom = nameInput.value.trim();
    if (!nom){ nameInput.focus(); return; }
    const phasesRaw = document.getElementById('cerveauChainPhases').value;
    const phases = phasesRaw.split(',').map(p => p.trim()).filter(Boolean).map(p => ({ nom:p, entreprises:[], blocsLibres:[] }));
    const chain = { id:'c' + Date.now(), nom, phases: phases.length ? phases : [{ nom:'Amont', entreprises:[], blocsLibres:[] }] };
    cerveauData.chains[secteur].push(chain);
    persistCerveauData();
    cerveauView = { level:'phases', secteur, chainId: chain.id };
    renderCerveau();
  };
  document.getElementById('cerveauChainCreate').addEventListener('click', submit);
  box.querySelectorAll('.cerveau-new-chain-form input').forEach(input => {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  });
}

// Migration : les anciennes chaînes stockaient ph.entreprises comme un tableau de noms
// (string). Passage à des objets {nom,image,legende} pour les cartes illustrées — les
// entrées string existantes sont converties sans perte au premier chargement.
// 4 tailles : M/L (verticales, image en haut) puis XL/XXL "en longueur" (paysage,
// image à gauche) — remplace l'ancien trio S/M/L (S retiré à la demande explicite,
// jugé pas assez utile face aux tailles "en longueur").
// Anciennes tailles fixes (M/L/XL/XXL) → largeur/hauteur d'image libres en px.
// Remplacées par un redimensionnement à la souris (voir wireCerveauResize) suite à un
// retour explicite ("ça prend trop de place", "laisse-moi la possibilité de le faire
// moi-même") — ces valeurs ne servent plus qu'à convertir les anciennes données une
// seule fois, plus aucune notion de taille fixe ensuite.
const CERVEAU_TAILLE_DEFAULTS = { M:{ width:200, imgHeight:110 }, L:{ width:300, imgHeight:180 }, XL:{ width:420, imgHeight:150 }, XXL:{ width:640, imgHeight:170 } };
const CERVEAU_MIN_WIDTH = 160;
const CERVEAU_MIN_IMG_HEIGHT = 70;
function migrateCerveauChains(){
  Object.keys(cerveauData.chains).forEach(sec => {
    (cerveauData.chains[sec] || []).forEach(chain => {
      (chain.phases || []).forEach(ph => {
        ph.entreprises = (ph.entreprises || []).map(e => typeof e === 'string' ? { nom:e, image:'', legende:'' } : e);
        ph.entreprises.forEach(e => {
          if (!e.width || !e.imgHeight){
            const d = CERVEAU_TAILLE_DEFAULTS[e.taille] || CERVEAU_TAILLE_DEFAULTS.M;
            e.width = e.width || d.width;
            e.imgHeight = e.imgHeight || d.imgHeight;
          }
          delete e.taille;
        });
        if (!Array.isArray(ph.blocsLibres)) ph.blocsLibres = [];
        ph.blocsLibres.forEach(b => {
          if (!b.width || !b.imgHeight){
            const d = CERVEAU_TAILLE_DEFAULTS[b.taille] || CERVEAU_TAILLE_DEFAULTS.M;
            b.width = b.width || d.width;
            b.imgHeight = b.imgHeight || d.imgHeight;
          }
          delete b.taille;
          // texte/style (un seul segment) → textBlocks (plusieurs segments empilés,
          // chacun avec son propre style) — demande explicite : pouvoir composer un
          // titre + un sous-titre + un corps sur le même bloc plutôt qu'un seul texte.
          if (!Array.isArray(b.textBlocks)){
            b.textBlocks = (b.texte && b.texte.trim()) ? [{ id:'tb' + Date.now() + Math.random().toString(36).slice(2, 6), texte:b.texte, style:b.style || 'corps' }] : [];
          }
          delete b.texte;
          delete b.style;
        });
      });
    });
  });
}

function cerveauImageZoneHtml(image, actionPrefix, imgHeight){
  return `
    <div class="cec-image ${image ? '' : 'cec-image-empty'}" data-action="${actionPrefix}-pick" style="height:${imgHeight}px;">
      ${image ? `<img src="${image}" alt="">` : `<span class="cec-image-plus">+ image</span>`}
      <button class="cec-img-url" data-action="${actionPrefix}-url" title="Ajouter par lien">🔗</button>
      ${image ? `<button class="cec-img-remove" data-action="${actionPrefix}-clear" title="Retirer l'image">✕</button>` : ''}
      <div class="cec-resize-handle" data-action="${actionPrefix}-resize" title="Redimensionner (glisser)"></div>
    </div>
    <div class="cec-url-row" data-role="url-row" style="display:none">
      <input type="text" class="cec-url-input" placeholder="Coller un lien d'image…">
      <button class="cec-url-ok" data-action="${actionPrefix}-url-ok">OK</button>
    </div>`;
}

const CERVEAU_TEXT_STYLES = [['titre', 'Titre'], ['soustitre', 'Sous-titre'], ['corps', 'Corps']];
function cerveauTextStyleButtonsHtml(actionName, current){
  return `<div class="cec-style-row">${CERVEAU_TEXT_STYLES.map(([key, label]) => `<button class="cec-style-btn${(current || 'corps') === key ? ' active' : ''}" data-action="${actionName}" data-style="${key}">${label}</button>`).join('')}</div>`;
}

function cerveauEntityCard(ent, phaseIdx, entIdx){
  const safe = ent.nom.replace(/"/g, '&quot;');
  const tracked = companies[ent.nom];
  const logo = tracked ? companies[ent.nom][companies[ent.nom].length - 1].lienImage : '';
  const noteCount = (cerveauData.notes[ent.nom] || []).length;
  const width = ent.width || 200;
  return `<div class="cerveau-entity-card" style="width:${width}px;" data-phase="${phaseIdx}" data-ent="${entIdx}">
    ${cerveauImageZoneHtml(ent.image, 'ent', ent.imgHeight || 110)}
    <div class="cec-body">
      <div class="cec-head">
        ${logo ? `<img class="cec-mini-logo" src="${logo}" alt="">` : `<span class="cerveau-entity-initial">${ent.nom.charAt(0).toUpperCase()}</span>`}
        <span class="cec-name" title="${safe}">${ent.nom}</span>${noteCount ? `<span class="cerveau-note-badge">${noteCount}</span>` : ''}
        <button class="cec-remove" data-action="ent-delete" title="Retirer de la phase">✕</button>
      </div>
      <input type="text" class="cec-legend" data-action="ent-legend" placeholder="Légende…" value="${(ent.legende || '').replace(/"/g, '&quot;')}">
      <button class="cec-fiche-btn" data-action="ent-fiche">📇 Ouvrir la fiche</button>
    </div>
  </div>`;
}

// Texte optionnel ET multiple : un bloc sans aucun textBlocks affiche juste "+ Texte"
// (l'image peut alors occuper toute la carte, demande explicite) ; chaque clic sur
// "+ Texte" AJOUTE un nouveau segment empilé sous les précédents (plutôt que de n'en
// permettre qu'un seul) — permet de composer par ex. un titre + un sous-titre + un
// corps sur la même carte, chacun avec son propre style et sa propre suppression.
function cerveauTextBlockHtml(tb, blocIdx){
  return `<div class="cec-textblock" data-tb="${tb.id}">
    <div class="cec-textblock-head">
      ${cerveauTextStyleButtonsHtml('free-style', tb.style)}
      <button class="cec-remove" data-action="free-text-delete" title="Retirer ce texte">✕</button>
    </div>
    <textarea class="cec-free-text cec-free-text-${tb.style || 'corps'}" data-action="free-text" placeholder="Texte…">${(tb.texte || '').replace(/</g, '&lt;')}</textarea>
  </div>`;
}
function cerveauFreeBlockHtml(bloc, phaseIdx, blocIdx){
  const width = bloc.width || 200;
  const textBlocks = bloc.textBlocks || [];
  const textZone = textBlocks.map(tb => cerveauTextBlockHtml(tb, blocIdx)).join('');
  return `<div class="cerveau-freeblock" style="width:${width}px;" data-phase="${phaseIdx}" data-bloc="${blocIdx}">
    ${cerveauImageZoneHtml(bloc.image, 'free', bloc.imgHeight || 110)}
    <div class="cec-body">
      ${textZone}
      <button class="cec-add-text-btn" data-action="free-add-text">+ Texte</button>
      <button class="cec-remove cec-remove-free" data-action="free-delete">✕ Retirer ce bloc</button>
    </div>
  </div>`;
}

function printCerveauEntityHtml(ent){
  const imgs = ent.image ? `<div class="print-img-row"><img src="${ent.image}" alt=""></div>` : '';
  const logo = companyLogoUrl(ent.nom);
  const logoImg = logo ? `<img class="print-inline-logo" src="${logo}" alt="">` : '';
  return `<div style="margin-bottom:10px">${logoImg}<strong>${ent.nom.replace(/</g, '&lt;')}</strong>${ent.legende ? `<p>${ent.legende.replace(/</g, '&lt;')}</p>` : ''}${imgs}</div>`;
}
function printCerveauFreeBlockHtml(bloc){
  const imgs = bloc.image ? `<div class="print-img-row"><img src="${bloc.image}" alt=""></div>` : '';
  const textHtml = (bloc.textBlocks || []).filter(tb => tb.texte).map(tb => `<p class="print-cec-text-${tb.style || 'corps'}">${tb.texte.replace(/</g, '&lt;')}</p>`).join('');
  return `<div style="margin-bottom:10px">${textHtml}${imgs}</div>`;
}
function exportChainAsPdf(chain, secteur){
  const body = chain.phases.map(ph => {
    const entHtml = ph.entreprises.map(printCerveauEntityHtml).join('') || '<p style="color:#999">Aucune entreprise.</p>';
    const freeHtml = (ph.blocsLibres || []).map(printCerveauFreeBlockHtml).join('');
    return `<div class="print-section"><h3>${ph.nom}</h3>${entHtml}${freeHtml}</div>`;
  }).join('');
  exportSectionAsPdf('Chaîne de valeur — ' + chain.nom, cerveauSectorLabel(secteur), body);
}

function renderCerveauPhases(box){
  const { secteur, chainId } = cerveauView;
  const chain = (cerveauData.chains[secteur] || []).find(c => c.id === chainId);
  if (!chain){ cerveauView = { level:'chaines', secteur }; renderCerveau(); return; }

  box.innerHTML = `
    <div class="cerveau-breadcrumb"><a data-back="secteurs">Secteurs</a> / <a data-back="chaines">${cerveauSectorLabel(secteur)}</a> / ${chain.nom}</div>
    <div class="cerveau-actions"><button class="zoom-btn objectifs-export" id="cerveauChainExportPdfBtn">🖨 Exporter PDF</button></div>
    <datalist id="cerveauCompanyList">${Object.keys(companies).map(n => `<option value="${n.replace(/"/g, '&quot;')}">`).join('')}</datalist>
    <div class="cerveau-phase-grid">${chain.phases.map((ph, i) => `
      <div class="scenario-card cerveau-phase">
        <h3 class="scenario-title">${ph.nom}</h3>
        <div class="cerveau-entity-list" data-phase="${i}">${ph.entreprises.map((e, j) => cerveauEntityCard(e, i, j)).join('')}</div>
        <div class="cerveau-freeblock-list" data-phase="${i}">${(ph.blocsLibres || []).map((b, j) => cerveauFreeBlockHtml(b, i, j)).join('')}</div>
        <button class="cerveau-add-free" data-phase="${i}" data-action="free-add">+ Bloc libre (image / texte)</button>
        <div class="cerveau-add-entity"><input type="text" list="cerveauCompanyList" placeholder="Ajouter une entreprise, Entrée pour valider…" data-phase="${i}"></div>
      </div>`).join('')}</div>`;

  box.querySelector('[data-back="secteurs"]').addEventListener('click', () => { cerveauView = { level:'secteurs' }; renderCerveau(); });
  box.querySelector('[data-back="chaines"]').addEventListener('click', () => { cerveauView = { level:'chaines', secteur }; renderCerveau(); });
  document.getElementById('cerveauChainExportPdfBtn').addEventListener('click', () => exportChainAsPdf(chain, secteur));

  box.querySelectorAll('.cerveau-add-entity input').forEach(input => {
    const submit = () => {
      if (!input.value.trim()) return;
      chain.phases[parseInt(input.dataset.phase, 10)].entreprises.push({ nom: input.value.trim(), image:'', legende:'' });
      persistCerveauData();
      renderCerveau();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    // Cliquer une suggestion de la <datalist> ne déclenche pas 'keydown Enter' (c'est
    // une sélection souris, pas une frappe clavier) — seul 'input' se déclenche dans ce
    // cas. On soumet automatiquement uniquement quand la valeur correspond exactement à
    // une entreprise suivie (donc bien une suggestion choisie, pas une frappe en cours).
    input.addEventListener('input', () => {
      if (companies[input.value.trim()]) submit();
    });
  });

  box.querySelectorAll('.cerveau-add-free').forEach(btn => {
    btn.addEventListener('click', () => {
      chain.phases[parseInt(btn.dataset.phase, 10)].blocsLibres.push({ image:'', texte:'' });
      persistCerveauData();
      renderCerveau();
    });
  });

  wireCerveauImageZones(box, chain);

  box.querySelectorAll('.cerveau-entity-card').forEach(card => {
    const phaseIdx = parseInt(card.dataset.phase, 10);
    const entIdx = parseInt(card.dataset.ent, 10);
    const ent = chain.phases[phaseIdx].entreprises[entIdx];
    card.querySelector('[data-action="ent-fiche"]').addEventListener('click', () => openFiche(ent.nom));
    card.querySelector('.cec-name').addEventListener('click', () => openFiche(ent.nom));
    card.querySelector('[data-action="ent-delete"]').addEventListener('click', () => {
      chain.phases[phaseIdx].entreprises.splice(entIdx, 1);
      persistCerveauData();
      renderCerveau();
    });
    const legend = card.querySelector('[data-action="ent-legend"]');
    const saveLegend = () => { ent.legende = legend.value; persistCerveauData(); };
    legend.addEventListener('blur', saveLegend);
    legend.addEventListener('keydown', e => { if (e.key === 'Enter') legend.blur(); });
  });

  box.querySelectorAll('.cerveau-freeblock').forEach(card => {
    const phaseIdx = parseInt(card.dataset.phase, 10);
    const blocIdx = parseInt(card.dataset.bloc, 10);
    const bloc = chain.phases[phaseIdx].blocsLibres[blocIdx];
    if (!Array.isArray(bloc.textBlocks)) bloc.textBlocks = [];
    card.querySelector('[data-action="free-delete"]').addEventListener('click', () => {
      chain.phases[phaseIdx].blocsLibres.splice(blocIdx, 1);
      persistCerveauData();
      renderCerveau();
    });
    const addTextBtn = card.querySelector('[data-action="free-add-text"]');
    if (addTextBtn){
      addTextBtn.addEventListener('click', () => {
        const newId = 'tb' + Date.now() + Math.random().toString(36).slice(2, 6);
        bloc.textBlocks.push({ id:newId, texte:'', style:'corps' });
        persistCerveauData();
        renderCerveau();
        const newTa = document.querySelector(`.cerveau-freeblock[data-phase="${phaseIdx}"][data-bloc="${blocIdx}"] [data-tb="${newId}"] [data-action="free-text"]`);
        if (newTa) newTa.focus();
      });
    }
    card.querySelectorAll('.cec-textblock').forEach(tbEl => {
      const tbId = tbEl.dataset.tb;
      const tb = bloc.textBlocks.find(t => t.id === tbId);
      if (!tb) return;
      tbEl.querySelector('[data-action="free-text-delete"]').addEventListener('click', () => {
        bloc.textBlocks = bloc.textBlocks.filter(t => t.id !== tbId);
        persistCerveauData();
        renderCerveau();
      });
      tbEl.querySelectorAll('[data-action="free-style"]').forEach(btn => {
        btn.addEventListener('click', () => {
          tb.style = btn.dataset.style;
          persistCerveauData();
          renderCerveau();
        });
      });
      const text = tbEl.querySelector('[data-action="free-text"]');
      autoGrowTextarea(text);
      text.addEventListener('input', () => autoGrowTextarea(text));
      text.addEventListener('blur', () => { tb.texte = text.value; persistCerveauData(); });
    });
  });

  wireCerveauResize(box, chain);
  wireCerveauBlockDrag(box, chain);
}

// Textarea qui grandit avec son contenu, jamais de scroll interne ni de troncature —
// demande explicite ("le texte ne doit pas être coupé, je dois tout voir").
function autoGrowTextarea(el){
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// Redimensionnement libre à la souris (largeur de la carte + hauteur de l'image),
// remplace les 4 tailles fixes M/L/XL/XXL. Un seul geste de glisser sur la poignée en
// bas à droite de l'image pilote les deux axes à la fois, comme un redimensionnement
// de fenêtre classique. Largeur bornée par la largeur du conteneur de phase (« il ne
// faut pas qu'il dépasse du cadre ») ; pas de grille visible, juste un arrondi à 10px
// pendant le glisser pour un alignement propre entre cartes (« grille invisible »).
const CERVEAU_RESIZE_STEP = 10;
function wireCerveauResize(box, chain){
  box.querySelectorAll('[data-action="ent-resize"], [data-action="free-resize"]').forEach(handle => {
    const card = handle.closest('.cerveau-entity-card, .cerveau-freeblock');
    const isFree = card.classList.contains('cerveau-freeblock');
    const phaseIdx = parseInt(card.dataset.phase, 10);
    const obj = isFree
      ? chain.phases[phaseIdx].blocsLibres[parseInt(card.dataset.bloc, 10)]
      : chain.phases[phaseIdx].entreprises[parseInt(card.dataset.ent, 10)];
    const imageZone = card.querySelector('.cec-image');

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      const phaseBox = card.closest('.cerveau-phase');
      const maxWidth = phaseBox ? phaseBox.clientWidth - 44 : 640;
      const startX = e.clientX, startY = e.clientY;
      const startWidth = card.getBoundingClientRect().width;
      const startHeight = imageZone.getBoundingClientRect().height;

      function onMove(ev){
        let w = Math.round((startWidth + (ev.clientX - startX)) / CERVEAU_RESIZE_STEP) * CERVEAU_RESIZE_STEP;
        let h = Math.round((startHeight + (ev.clientY - startY)) / CERVEAU_RESIZE_STEP) * CERVEAU_RESIZE_STEP;
        w = Math.max(CERVEAU_MIN_WIDTH, Math.min(w, maxWidth));
        h = Math.max(CERVEAU_MIN_IMG_HEIGHT, Math.min(h, 500));
        card.style.width = w + 'px';
        imageZone.style.height = h + 'px';
        obj.width = w;
        obj.imgHeight = h;
      }
      function onUp(){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        persistCerveauData();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// Réordonnancement des blocs (cartes entreprise entre elles, blocs libres entre eux —
// jamais les deux mélangés, formes de données différentes) et déplacement inter-phases
// de la même chaîne (ex. Amont → Transformation). Réécrit en glisser-déposer "maison"
// piloté à la souris (mousedown/mousemove/mouseup + document.elementFromPoint), plus
// fiable que le drag-and-drop HTML5 natif utilisé avant : ce dernier dépendait de
// dragover/drop délégués précisément sur chaque élément survolé, et la cible réelle du
// drop était recalculée à partir d'un index capturé AVANT le retrait de l'élément
// source — pour un réordonnancement dans la même liste, ce retrait décale les index
// suivants d'un cran, donnant un résultat correct un coup sur deux selon le sens du
// glisser (symptôme rapporté : "des fois ça remplace un autre bloc, d'autres fois
// non"). Ici, la position d'insertion est entièrement recalculée à la relâche de la
// souris à partir de l'ordre RÉEL du DOM à cet instant, jamais d'un index mis en cache.
function wireCerveauBlockDrag(box, chain){
  box.querySelectorAll('.cerveau-entity-list, .cerveau-freeblock-list').forEach(list => {
    const isFree = list.classList.contains('cerveau-freeblock-list');
    const selector = isFree ? '.cerveau-freeblock' : '.cerveau-entity-card';
    const listSelector = isFree ? '.cerveau-freeblock-list' : '.cerveau-entity-list';

    list.querySelectorAll(selector).forEach(card => {
      card.addEventListener('mousedown', e => {
        // Ne pas capturer le clic si l'utilisateur interagit avec un champ, un bouton
        // ou la poignée de redimensionnement — seule la carte "vide" (corps, en-tête
        // hors boutons) sert de prise pour déplacer le bloc.
        if (e.target.closest('input, textarea, button, a, .cec-resize-handle, .cec-image')) return;
        e.preventDefault();

        const sourceList = card.closest(listSelector);
        const sourcePhase = parseInt(sourceList.dataset.phase, 10);
        const sourceArr = isFree ? chain.phases[sourcePhase].blocsLibres : chain.phases[sourcePhase].entreprises;
        const sourceIdx = Array.prototype.indexOf.call(sourceList.querySelectorAll(selector), card);
        let moved = false;

        function clearHighlights(){
          document.querySelectorAll('.cec-drop-target').forEach(el => el.classList.remove('cec-drop-target'));
        }
        // Une liste vide (ou avec peu de blocs) ne fait que quelques pixels de haut —
        // viser précisément ce mince rectangle est peu fiable au clavier/souris ET
        // difficile même en test automatisé. On élargit la cible à toute la CARTE de
        // phase (le cadre visuel entier), et on retrouve la liste du bon type à
        // l'intérieur — bien plus tolérant, sans changer la sémantique (toujours
        // impossible de déposer une carte entreprise dans une liste de blocs libres).
        function findDropList(el){
          const phaseCard = el && el.closest('.cerveau-phase');
          return phaseCard ? phaseCard.querySelector(listSelector) : null;
        }
        function onMove(ev){
          if (!moved){
            moved = true;
            card.classList.add('cec-dragging');
          }
          clearHighlights();
          const targetList = findDropList(document.elementFromPoint(ev.clientX, ev.clientY));
          if (targetList) targetList.classList.add('cec-drop-target');
        }
        function onUp(ev){
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          card.classList.remove('cec-dragging');
          clearHighlights();
          if (!moved) return; // simple clic, pas un glisser — rien à faire

          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          const targetList = findDropList(el);
          if (!targetList) return; // relâché hors de toute phase valide

          const targetPhase = parseInt(targetList.dataset.phase, 10);
          const targetArr = isFree ? chain.phases[targetPhase].blocsLibres : chain.phases[targetPhase].entreprises;
          const siblings = Array.prototype.slice.call(targetList.querySelectorAll(selector));
          const targetCard = el.closest(selector);
          let insertIdx;
          if (targetCard && siblings.includes(targetCard)){
            const rect = targetCard.getBoundingClientRect();
            const insertBefore = ev.clientX < rect.left + rect.width / 2;
            insertIdx = siblings.indexOf(targetCard) + (insertBefore ? 0 : 1);
          } else {
            insertIdx = siblings.length; // zone vide de la liste → ajoute à la fin
          }

          if (targetArr === sourceArr && (insertIdx === sourceIdx || insertIdx === sourceIdx + 1)) return; // pas de déplacement réel

          const [item] = sourceArr.splice(sourceIdx, 1);
          let finalIdx = insertIdx;
          if (targetArr === sourceArr && sourceIdx < insertIdx) finalIdx -= 1;
          targetArr.splice(finalIdx, 0, item);
          persistCerveauData();
          renderCerveau();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  });
}

// Gère les zones image des cartes entreprise ET des blocs libres (upload fichier + URL
// collée), pour un même input fichier global réutilisé (cerveauImagePickerTarget retient
// la cible en cours : {getEntity} renvoie l'objet {image} à muter, entité ou bloc libre).
let cerveauImagePickerTarget = null;
function wireCerveauImageZones(box, chain){
  box.querySelectorAll('.cerveau-entity-card, .cerveau-freeblock').forEach(card => {
    const phaseIdx = parseInt(card.dataset.phase, 10);
    const isFree = card.classList.contains('cerveau-freeblock');
    const target = isFree
      ? chain.phases[phaseIdx].blocsLibres[parseInt(card.dataset.bloc, 10)]
      : chain.phases[phaseIdx].entreprises[parseInt(card.dataset.ent, 10)];
    const urlRow = card.querySelector('[data-role="url-row"]');

    card.querySelector('[data-action$="-pick"]').addEventListener('click', e => {
      if (e.target.closest('[data-action$="-url"], [data-action$="-clear"]')) return;
      cerveauImagePickerTarget = target;
      document.getElementById('cerveauImageFileInput').click();
    });
    card.querySelector('[data-action$="-url"]').addEventListener('click', () => {
      urlRow.style.display = urlRow.style.display === 'none' ? 'flex' : 'none';
      if (urlRow.style.display === 'flex') urlRow.querySelector('.cec-url-input').focus();
    });
    card.querySelector('[data-action$="-url-ok"]').addEventListener('click', () => {
      const val = urlRow.querySelector('.cec-url-input').value.trim();
      if (!val) return;
      target.image = val;
      persistCerveauData();
      renderCerveau();
    });
    const clearBtn = card.querySelector('[data-action$="-clear"]');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      target.image = '';
      persistCerveauData();
      renderCerveau();
    });
  });
}

function initCerveauImagePicker(){
  document.getElementById('cerveauImageFileInput').addEventListener('change', async function(){
    if (!cerveauImagePickerTarget || !this.files[0]) return;
    cerveauImagePickerTarget.image = await readFileAsDataURL(this.files[0]);
    persistCerveauData();
    cerveauImagePickerTarget = null;
    this.value = '';
    renderCerveau();
  });
}

/* ---------- Fiche entité : journal daté (texte + images + croquis) ---------- */
let ficheEntite = null;
let fichePendingImages = [];
let sketchDrawing = false;

function openFiche(nom){
  ficheEntite = nom;
  fichePendingImages = [];
  document.getElementById('ficheTitle').textContent = nom;
  document.getElementById('ficheText').value = '';
  document.getElementById('fichePendingImages').innerHTML = '';
  document.getElementById('ficheSketchWrap').style.display = 'none';
  clearSketchCanvas();
  renderFicheEntries();
  document.getElementById('ficheModal').style.display = 'flex';
}

function openAnalyseFromFiche(){
  if (!ficheEntite) return;
  const nom = ficheEntite;
  closeFiche();
  openAnalyse(nom);
}
function closeFiche(){
  document.getElementById('ficheModal').style.display = 'none';
  ficheEntite = null;
}

function renderFicheEntries(){
  const box = document.getElementById('ficheEntries');
  const entries = (cerveauData.notes[ficheEntite] || []).slice().reverse();
  box.innerHTML = entries.length ? entries.map(e => `
    <div class="fiche-entry">
      <div class="date">${e.date}</div>
      ${e.texte ? `<div class="txt">${e.texte.replace(/</g, '&lt;')}</div>` : ''}
      <div class="media">${(e.images || []).concat(e.sketches || []).map(src => `<img src="${src}" alt="">`).join('')}</div>
    </div>`).join('') : '<div class="objectifs-empty">Aucune entrée pour le moment.</div>';
}

function renderPendingImages(){
  document.getElementById('fichePendingImages').innerHTML = fichePendingImages.map(src => `<img src="${src}" alt="">`).join('');
}

function readFileAsDataURL(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clearSketchCanvas(){
  const canvas = document.getElementById('ficheSketchCanvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function initFicheModal(){
  document.getElementById('ficheOpenAnalyseBtn').addEventListener('click', openAnalyseFromFiche);
  const imageInput = document.getElementById('ficheImageInput');
  imageInput.addEventListener('change', async () => {
    for (const file of imageInput.files){
      fichePendingImages.push(await readFileAsDataURL(file));
    }
    imageInput.value = '';
    renderPendingImages();
  });

  document.getElementById('ficheSketchToggle').addEventListener('click', () => {
    const wrap = document.getElementById('ficheSketchWrap');
    const show = wrap.style.display === 'none';
    wrap.style.display = show ? 'block' : 'none';
    if (show) clearSketchCanvas();
  });
  document.getElementById('ficheSketchClear').addEventListener('click', clearSketchCanvas);

  const canvas = document.getElementById('ficheSketchCanvas');
  const ctx = canvas.getContext('2d');
  function pos(e){
    const rect = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: cx * (canvas.width / rect.width), y: cy * (canvas.height / rect.height) };
  }
  function start(e){ sketchDrawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e){
    if (!sketchDrawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = document.getElementById('ficheSketchColor').value;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function end(){ sketchDrawing = false; }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start);
  canvas.addEventListener('touchmove', move);
  canvas.addEventListener('touchend', end);

  document.getElementById('ficheSaveBtn').addEventListener('click', () => {
    const texte = document.getElementById('ficheText').value.trim();
    const wrap = document.getElementById('ficheSketchWrap');
    const sketches = wrap.style.display === 'block' ? [document.getElementById('ficheSketchCanvas').toDataURL('image/png')] : [];
    if (!texte && fichePendingImages.length === 0 && sketches.length === 0) return;

    if (!cerveauData.notes[ficheEntite]) cerveauData.notes[ficheEntite] = [];
    cerveauData.notes[ficheEntite].push({ date: new Date().toISOString().slice(0, 10), texte, images: fichePendingImages.slice(), sketches });
    persistCerveauData();

    document.getElementById('ficheText').value = '';
    fichePendingImages = [];
    renderPendingImages();
    wrap.style.display = 'none';
    renderFicheEntries();
    renderCerveau();
  });
}

/* ============================================================
   ANALYSE DÉVELOPPÉE — trame structurée réutilisable par entreprise
   (n'importe quel nom, comme le journal ci-dessus), accessible depuis
   le Cerveau (bouton 📊 dans la fiche journal) et depuis l'onglet
   Analyse (tag "📊 Analyse développée"). Contrairement au journal
   (append-only), c'est UNE fiche qu'on modifie sur place — mais on
   peut la DUPLIQUER pour garder plusieurs versions datées sans jamais
   écraser une version existante (demande explicite : l'entreprise
   évolue, l'ancienne analyse doit rester consultable), et la
   supprimer si besoin (double-clic de confirmation, pas de confirm()
   natif — voir "Pièges techniques" point 7).
   Les 3 blocs graphiques (revenus par pays/secteur, actionnariat)
   prennent des VALEURS BRUTES ({label, valeur}), jamais un pourcentage
   saisi à la main — le pourcentage affiché et le camembert sont
   calculés à partir du total des lignes (demande explicite : les
   données dispo sont en valeur absolue, pas déjà en %).
   Stockage : cerveauData.analyses[nom] = [ {id, label, dateCreated,
   dateModified, sections:{...}, revenusPays:[], revenusSecteurs:[],
   actionnariat:[], concurrents:[]}, ... ] — même IndexedDB que
   chains/notes, jamais supprimé automatiquement.
   ============================================================ */
const ANALYSE_CHART_KEYS = ['revenusPays', 'revenusSecteurs', 'actionnariat'];
const ANALYSE_CHART_LABELS = { revenusPays:'Revenus par pays', revenusSecteurs:"Revenus par secteur d'activité", actionnariat:'Actionnariat principal' };

// Ordre demandé explicitement : présentation d'abord, puis revenus/concurrents (les
// données brutes) tout en haut, la conclusion reste toujours en tout dernier.
const CERVEAU_ANALYSE_SECTIONS_TOP = [
  { key:'presentation', label:"Présentation de l'entreprise", hint:'Stratégie, profil opérationnel et concurrentiel' }
];
const CERVEAU_ANALYSE_SECTIONS_MID = [
  { key:'marche', label:'Analyse du marché' },
  { key:'moat', label:'Avantage concurrentiel (moat)' },
  { key:'secteursActivite', label:"Secteurs d'activité", hint:'Produits, perspectives de développement' },
  { key:'perspectives', label:'Perspectives de croissance' },
  { key:'risques', label:'Analyse du risque' }
];
const CERVEAU_ANALYSE_SECTIONS_BOTTOM = [
  { key:'ratios', label:'Ratios financiers', hint:"Captures d'écran de l'application" },
  { key:'conclusion', label:'Conclusion', hint:'Business model, synthèse, datée automatiquement' }
];
const CERVEAU_ANALYSE_SECTIONS_ALL = CERVEAU_ANALYSE_SECTIONS_TOP.concat(CERVEAU_ANALYSE_SECTIONS_MID, CERVEAU_ANALYSE_SECTIONS_BOTTOM);

let analyseEntite = null;
let analyseVersionId = null;
let analyseCharts = {};
let analyseDeleteConfirming = false;
let draggedImageRef = null; // { arr, idx } — référence directe au tableau d'images en cours de glisser-déposer

function blankAnalyseVersion(label){
  const today = new Date().toISOString().slice(0, 10);
  const sections = {};
  CERVEAU_ANALYSE_SECTIONS_ALL.forEach(s => { sections[s.key] = { texte:'', images:[] }; });
  return { id:'v' + Date.now() + Math.random().toString(36).slice(2), label, dateCreated:today, dateModified:today, sections, revenusPays:[], revenusSecteurs:[], actionnariat:[], concurrents:[] };
}

function currentAnalyseVersion(){
  const list = cerveauData.analyses[analyseEntite] || [];
  return list.find(v => v.id === analyseVersionId) || list[list.length - 1];
}

function openAnalyse(nom){
  analyseEntite = nom;
  if (!cerveauData.analyses[nom] || !cerveauData.analyses[nom].length){
    cerveauData.analyses[nom] = [blankAnalyseVersion('Version 1')];
    persistCerveauData();
  }
  analyseVersionId = cerveauData.analyses[nom][cerveauData.analyses[nom].length - 1].id;
  document.getElementById('analyseTitle').textContent = 'Analyse développée — ' + nom;
  renderAnalyse();
  document.getElementById('analyseModal').style.display = 'flex';
}
function closeAnalyse(){
  document.getElementById('analyseModal').style.display = 'none';
  Object.values(analyseCharts).forEach(c => c && c.destroy());
  analyseCharts = {};
  analyseEntite = null;
}

function renderAnalyseVersionSelect(){
  const sel = document.getElementById('analyseVersionSelect');
  const list = cerveauData.analyses[analyseEntite] || [];
  sel.innerHTML = list.map(v => `<option value="${v.id}"${v.id === analyseVersionId ? ' selected' : ''}>${v.label} (${v.dateModified})</option>`).join('');
}

function analyseImagesHtml(images, ownerAttr){
  return `<div class="analyse-images" ${ownerAttr}>${images.map((src, i) => `
    <div class="analyse-image-thumb" draggable="true" ${ownerAttr} data-img-idx="${i}">
      <img src="${src}" alt="" data-zoom-src="${src.replace(/"/g,'&quot;')}">
      <button class="analyse-image-del" ${ownerAttr} data-idx="${i}">✕</button>
    </div>`).join('')}</div>`;
}

function analyseImageAddRowHtml(ownerAttr){
  return `<div class="analyse-image-add-row">
    <label class="fiche-file-btn">+ Image<input type="file" accept="image/*" multiple class="analyse-image-input" ${ownerAttr} hidden></label>
    <input type="text" class="analyse-image-url" ${ownerAttr} placeholder="ou coller un lien URL d'image…">
    <button class="analyse-image-url-btn" ${ownerAttr}>Ajouter</button>
  </div>`;
}

function analyseSectionHtml(s, data){
  return `<div class="analyse-section">
    <h4>${s.label}</h4>
    ${s.hint ? `<p class="analyse-hint">${s.hint}</p>` : ''}
    <textarea class="analyse-textarea" data-key="${s.key}" placeholder="Texte…">${(data.texte || '').replace(/</g, '&lt;')}</textarea>
    ${analyseImagesHtml(data.images || [], `data-key="${s.key}"`)}
    ${analyseImageAddRowHtml(`data-key="${s.key}"`)}
  </div>`;
}

function analyseChartSectionHtml(key, rows){
  const total = rows.reduce((s, r) => s + (r.valeur || 0), 0);
  return `<div class="analyse-section analyse-chart-section">
    <div class="chart-card-head">
      <h4>${ANALYSE_CHART_LABELS[key]}</h4>
      <button class="zoom-btn" data-chart-zoom="${key}" aria-label="Agrandir">⤢</button>
    </div>
    <div class="analyse-chart-body">
      <div class="chart-holder analyse-chart-canvas-holder"><canvas id="analyseChart_${key}"></canvas></div>
      <div class="analyse-chart-table">
        ${rows.map((r, i) => {
          const pct = total ? (r.valeur / total * 100) : 0;
          return `<div class="analyse-chart-row"><span>${r.label}</span><span>${(r.valeur || 0).toLocaleString('fr-FR')}</span><span>${pct.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</span><button class="analyse-chart-del" data-key="${key}" data-idx="${i}">✕</button></div>`;
        }).join('')}
        <div class="analyse-chart-add">
          <input type="text" placeholder="Libellé" class="analyse-chart-label" data-key="${key}">
          <input type="number" placeholder="Valeur brute" class="analyse-chart-valeur" data-key="${key}">
          <button class="analyse-chart-addbtn" data-key="${key}">+</button>
        </div>
      </div>
    </div>
  </div>`;
}

function analyseConcurrentsHtml(list){
  return `<div class="analyse-section">
    <h4>Concurrents</h4>
    <p class="analyse-hint">Au moins 3-4 fiches : logo/image produit, description rapide</p>
    <div class="analyse-competitors">${list.map((c, i) => `
      <div class="analyse-competitor">
        <input type="text" class="analyse-competitor-nom" data-idx="${i}" placeholder="Nom du concurrent" value="${(c.nom || '').replace(/"/g, '&quot;')}">
        <textarea class="analyse-competitor-texte" data-idx="${i}" placeholder="Description…">${(c.texte || '').replace(/</g, '&lt;')}</textarea>
        ${analyseImagesHtml(c.images || [], `data-competitor="${i}"`)}
        ${analyseImageAddRowHtml(`data-competitor="${i}"`)}
        <div><button class="analyse-competitor-del" data-idx="${i}">Supprimer ce concurrent</button></div>
      </div>`).join('')}</div>
    <button class="cerveau-btn-cancel" id="analyseAddCompetitor">+ Ajouter un concurrent</button>
  </div>`;
}

function renderAnalyseCharts(v){
  ANALYSE_CHART_KEYS.forEach(key => {
    const canvas = document.getElementById('analyseChart_' + key);
    if (analyseCharts[key]) { analyseCharts[key].destroy(); analyseCharts[key] = null; }
    const rows = v[key];
    if (!canvas || !rows.length) return;
    analyseCharts[key] = new Chart(canvas.getContext('2d'), {
      type:'pie',
      data:{ labels: rows.map(r => r.label), datasets:[{ data: rows.map(r => r.valeur), backgroundColor: rows.map((_, i) => PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length]), borderColor:THEME.hair, borderWidth:2 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true, color:THEME.dim, font:{size:10.5} } } } }
    });
  });
}

function openAnalyseChartZoom(key){
  const v = currentAnalyseVersion();
  const rows = v[key];
  if (!rows || !rows.length) return;
  document.getElementById('zoomTitle').textContent = ANALYSE_CHART_LABELS[key];
  document.getElementById('zoomRangeRow').innerHTML = '';
  document.getElementById('zoomCagrRow').innerHTML = '';
  zoomKey = null;
  if (window.__zoomChart) window.__zoomChart.destroy();
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), {
    type:'pie',
    data:{ labels: rows.map(r => r.label), datasets:[{ data: rows.map(r => r.valeur), backgroundColor: rows.map((_, i) => PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length]), borderColor:THEME.hair, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true } } } }
  });
  document.getElementById('zoomModal').style.display = 'flex';
}

function printAnalyseSectionHtml(s, data){
  const imgs = printImagesRowHtml(data.images);
  const text = (data.texte || '').replace(/</g, '&lt;');
  return `<div class="print-section"><h3>${s.label}</h3>${text ? `<p>${text}</p>` : ''}${imgs}</div>`;
}
function printAnalyseChartHtml(key, rows){
  if (!rows || !rows.length) return '';
  return `<div class="print-section"><h3>${ANALYSE_CHART_LABELS[key]}</h3>${chartCanvasToImgHtml('analyseChart_' + key, ANALYSE_CHART_LABELS[key], analyseCharts[key])}</div>`;
}
function printAnalyseConcurrentsHtml(list){
  if (!list || !list.length) return '';
  const body = list.map(c => `<div style="margin-bottom:10px"><strong>${(c.nom || 'Sans nom').replace(/</g, '&lt;')}</strong><p>${(c.texte || '').replace(/</g, '&lt;')}</p>${printImagesRowHtml(c.images)}</div>`).join('');
  return `<div class="print-section"><h3>Concurrents</h3>${body}</div>`;
}
function exportAnalyseAsPdf(){
  const v = currentAnalyseVersion();
  if (!v || !analyseEntite) return;
  const body = CERVEAU_ANALYSE_SECTIONS_TOP.map(s => printAnalyseSectionHtml(s, v.sections[s.key])).join('')
    + printAnalyseChartHtml('revenusPays', v.revenusPays)
    + printAnalyseChartHtml('revenusSecteurs', v.revenusSecteurs)
    + printAnalyseConcurrentsHtml(v.concurrents)
    + CERVEAU_ANALYSE_SECTIONS_MID.map(s => printAnalyseSectionHtml(s, v.sections[s.key])).join('')
    + printAnalyseChartHtml('actionnariat', v.actionnariat)
    + CERVEAU_ANALYSE_SECTIONS_BOTTOM.map(s => printAnalyseSectionHtml(s, v.sections[s.key])).join('');
  exportSectionAsPdf('Analyse développée — ' + analyseEntite, v.label, body, companyLogoUrl(analyseEntite));
}

// Récupère le tableau d'images (et son objet propriétaire pour la sauvegarde) à partir
// d'un élément qui porte soit data-key (section fixe), soit data-competitor (concurrent).
function analyseImagesArrayFromEl(v, el){
  if (el.dataset.key != null) return v.sections[el.dataset.key].images;
  return v.concurrents[parseInt(el.dataset.competitor, 10)].images;
}

function wireAnalyseImageEvents(v, box){
  box.querySelectorAll('.analyse-image-input').forEach(input => {
    input.addEventListener('change', async () => {
      const arr = analyseImagesArrayFromEl(v, input);
      for (const file of input.files) arr.push(await readFileAsDataURL(file));
      input.value = '';
      renderAnalyse();
    });
  });
  box.querySelectorAll('.analyse-image-url-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      const url = input.value.trim();
      if (!url) return;
      analyseImagesArrayFromEl(v, btn).push(url);
      renderAnalyse();
    });
  });
  box.querySelectorAll('.analyse-image-del').forEach(btn => {
    btn.addEventListener('click', () => { analyseImagesArrayFromEl(v, btn).splice(parseInt(btn.dataset.idx, 10), 1); renderAnalyse(); });
  });
  box.querySelectorAll('.analyse-image-thumb img').forEach(img => {
    img.addEventListener('click', () => openImageZoom(img.dataset.zoomSrc));
  });
  // Glisser-déposer pour réordonner les images à l'intérieur d'un même bloc.
  box.querySelectorAll('.analyse-image-thumb').forEach(thumb => {
    thumb.addEventListener('dragstart', () => { draggedImageRef = { arr: analyseImagesArrayFromEl(v, thumb), idx: parseInt(thumb.dataset.imgIdx, 10) }; });
    thumb.addEventListener('dragover', e => e.preventDefault());
    thumb.addEventListener('drop', e => {
      e.preventDefault();
      if (!draggedImageRef) return;
      const targetArr = analyseImagesArrayFromEl(v, thumb);
      if (targetArr !== draggedImageRef.arr) return; // pas de glisser entre deux blocs différents
      const targetIdx = parseInt(thumb.dataset.imgIdx, 10);
      const [moved] = targetArr.splice(draggedImageRef.idx, 1);
      targetArr.splice(targetIdx, 0, moved);
      draggedImageRef = null;
      renderAnalyse();
    });
  });
}

function wireAnalyseSectionEvents(){
  const v = currentAnalyseVersion();
  const box = document.getElementById('analyseBody');

  box.querySelectorAll('.analyse-textarea').forEach(ta => {
    ta.addEventListener('input', () => { v.sections[ta.dataset.key].texte = ta.value; });
  });
  wireAnalyseImageEvents(v, box);

  ANALYSE_CHART_KEYS.forEach(key => {
    const btn = box.querySelector(`.zoom-btn[data-chart-zoom="${key}"]`);
    if (btn) btn.addEventListener('click', () => openAnalyseChartZoom(key));
  });
  box.querySelectorAll('.analyse-chart-addbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const labelInput = box.querySelector(`.analyse-chart-label[data-key="${key}"]`);
      const valeurInput = box.querySelector(`.analyse-chart-valeur[data-key="${key}"]`);
      const label = labelInput.value.trim();
      const valeur = parseFloat(valeurInput.value);
      if (!label || isNaN(valeur)) return;
      v[key].push({ label, valeur });
      renderAnalyse();
    });
  });
  box.querySelectorAll('.analyse-chart-del').forEach(btn => {
    btn.addEventListener('click', () => { v[btn.dataset.key].splice(parseInt(btn.dataset.idx, 10), 1); renderAnalyse(); });
  });

  box.querySelectorAll('.analyse-competitor-nom').forEach(input => {
    input.addEventListener('input', () => { v.concurrents[parseInt(input.dataset.idx, 10)].nom = input.value; });
  });
  box.querySelectorAll('.analyse-competitor-texte').forEach(ta => {
    ta.addEventListener('input', () => { v.concurrents[parseInt(ta.dataset.idx, 10)].texte = ta.value; });
  });
  box.querySelectorAll('.analyse-competitor-del').forEach(btn => {
    btn.addEventListener('click', () => { v.concurrents.splice(parseInt(btn.dataset.idx, 10), 1); renderAnalyse(); });
  });
  document.getElementById('analyseAddCompetitor').addEventListener('click', () => { v.concurrents.push({ nom:'', texte:'', images:[] }); renderAnalyse(); });
}

function renderAnalyse(){
  renderAnalyseVersionSelect();
  const v = currentAnalyseVersion();
  document.getElementById('analyseUpdatedLabel').textContent = 'Dernière modification : ' + v.dateModified;
  analyseDeleteConfirming = false;
  const delBtn = document.getElementById('analyseDeleteBtn');
  delBtn.textContent = '🗑 Supprimer cette fiche';
  delBtn.classList.remove('analyse-delete-confirm');

  const box = document.getElementById('analyseBody');
  box.innerHTML = CERVEAU_ANALYSE_SECTIONS_TOP.map(s => analyseSectionHtml(s, v.sections[s.key])).join('')
    + `<div class="analyse-charts-row">${analyseChartSectionHtml('revenusPays', v.revenusPays)}${analyseChartSectionHtml('revenusSecteurs', v.revenusSecteurs)}</div>`
    + analyseConcurrentsHtml(v.concurrents)
    + CERVEAU_ANALYSE_SECTIONS_MID.map(s => analyseSectionHtml(s, v.sections[s.key])).join('')
    + analyseChartSectionHtml('actionnariat', v.actionnariat)
    + CERVEAU_ANALYSE_SECTIONS_BOTTOM.map(s => analyseSectionHtml(s, v.sections[s.key])).join('');
  wireAnalyseSectionEvents();
  renderAnalyseCharts(v);
}

function saveAnalyseVersion(){
  const v = currentAnalyseVersion();
  v.dateModified = new Date().toISOString().slice(0, 10);
  persistCerveauData();
  renderAnalyseVersionSelect();
  document.getElementById('analyseUpdatedLabel').textContent = 'Dernière modification : ' + v.dateModified + ' — enregistré ✓';
}

function duplicateAnalyseVersion(){
  const list = cerveauData.analyses[analyseEntite];
  const src = currentAnalyseVersion();
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = 'v' + Date.now() + Math.random().toString(36).slice(2);
  copy.label = src.label + ' (copie)';
  copy.dateCreated = new Date().toISOString().slice(0, 10);
  copy.dateModified = copy.dateCreated;
  list.push(copy);
  analyseVersionId = copy.id;
  persistCerveauData();
  renderAnalyse();
}

function newBlankAnalyseVersion(){
  const list = cerveauData.analyses[analyseEntite];
  const v = blankAnalyseVersion('Version ' + (list.length + 1));
  list.push(v);
  analyseVersionId = v.id;
  persistCerveauData();
  renderAnalyse();
}

// Suppression avec confirmation en 2 clics inline (pas de confirm() natif, voir
// "Pièges techniques" point 7) : le 1er clic change juste le texte du bouton.
function deleteAnalyseVersion(){
  const list = cerveauData.analyses[analyseEntite];
  const idx = list.findIndex(v => v.id === analyseVersionId);
  if (idx !== -1) list.splice(idx, 1);
  persistCerveauData();
  if (!list.length){ closeAnalyse(); return; }
  analyseVersionId = list[list.length - 1].id;
  renderAnalyse();
}

function initAnalyseModal(){
  document.getElementById('analyseVersionSelect').addEventListener('change', e => { analyseVersionId = e.target.value; renderAnalyse(); });
  document.getElementById('analyseDuplicateBtn').addEventListener('click', duplicateAnalyseVersion);
  document.getElementById('analyseNewBtn').addEventListener('click', newBlankAnalyseVersion);
  document.getElementById('analyseSaveBtn').addEventListener('click', saveAnalyseVersion);
  document.getElementById('analyseDeleteBtn').addEventListener('click', () => {
    const btn = document.getElementById('analyseDeleteBtn');
    if (!analyseDeleteConfirming){
      analyseDeleteConfirming = true;
      btn.textContent = '⚠️ Confirmer la suppression ?';
      btn.classList.add('analyse-delete-confirm');
      return;
    }
    deleteAnalyseVersion();
  });
  document.getElementById('analyseExportPdfBtn').addEventListener('click', exportAnalyseAsPdf);
}

function openImageZoom(src){
  document.getElementById('imageZoomImg').src = src;
  document.getElementById('imageZoomModal').style.display = 'flex';
}
function closeImageZoom(){
  document.getElementById('imageZoomModal').style.display = 'none';
}

/* ============================================================
   ONGLET REVUE DE LA SEMAINE — fiches de synthèse d'opportunités
   de sous-valorisation, façon revue de presse. Pas d'automatisation
   RSS/Gemini côté client (décision explicite : site 100% statique,
   pas de cron possible sans backend — voir aussi Idées/Alertes pour
   la même limite) : le déclenchement est manuel, en conversation
   ("fais la revue de la semaine"), Claude renseigne alors
   data/revue.json (commit+push), qui redevient le socle chargé par
   tous les appareils. L'utilisateur peut aussi ajouter/retirer des
   fiches directement depuis l'onglet, mêmes mécaniques de
   persistance que les autres onglets (localStorage + export JSON).
   ============================================================ */
const REVUE_LS_KEY = 'wolfAnalysisRevue';
const REVUE_BASELINE_URL = 'data/revue.json';
let revueStore = { fiches: [] };

function mergeRevue(extra){
  (extra.fiches || []).forEach(f => {
    if (!revueStore.fiches.find(x => x.id === f.id)) revueStore.fiches.push(f);
  });
}

async function loadRevueBaseline(){
  try{
    const res = await fetch(REVUE_BASELINE_URL, { cache:'no-store' });
    if (res.ok){
      const json = await res.json();
      if (json && typeof json === 'object') mergeRevue(json);
    }
  }catch(e){ /* fichier absent ou fetch bloqué (ex. file://) — non bloquant */ }
  try{
    const raw = localStorage.getItem(REVUE_LS_KEY);
    if (raw) mergeRevue(JSON.parse(raw));
  }catch(e){ /* localStorage indisponible ou JSON corrompu */ }
  renderRevue();
}

function persistRevueLocal(){
  try{ localStorage.setItem(REVUE_LS_KEY, JSON.stringify(revueStore)); }catch(e){ /* quota / navigateur privé */ }
}

function exportRevue(){
  const blob = new Blob([JSON.stringify(revueStore, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wolf-analysis-revue.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Numéro de semaine ISO approximatif — suffisant pour regrouper visuellement les
// fiches par semaine, pas besoin d'une conformité ISO 8601 stricte ici.
function revueWeekKey(dateStr){
  const d = new Date(dateStr);
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return d.getFullYear() + ' — Semaine ' + String(week).padStart(2, '0');
}

function revueFicheHtml(f){
  const logo = companyLogoUrl(f.entreprise);
  const pointsHtml = (f.points || []).filter(Boolean).map(p => `<li>${p.replace(/</g, '&lt;')}</li>`).join('');
  return `<div class="revue-fiche" data-id="${f.id}">
    <div class="revue-fiche-head">
      <div class="revue-fiche-logo">${logo ? `<img src="${logo}" alt="">` : `<span>${(f.entreprise || '?').charAt(0).toUpperCase()}</span>`}</div>
      <div class="revue-fiche-title">
        <div class="revue-fiche-nom">${(f.entreprise || '').replace(/</g, '&lt;')}</div>
        <div class="revue-fiche-source">${(f.source || 'Source non précisée').replace(/</g, '&lt;')}${f.objectifCours ? ' · Objectif ' + f.objectifCours.replace(/</g, '&lt;') : ''}</div>
      </div>
      <button class="revue-fiche-del" data-id="${f.id}" aria-label="Supprimer">✕</button>
    </div>
    ${pointsHtml ? `<ul class="revue-fiche-points">${pointsHtml}</ul>` : ''}
  </div>`;
}

function renderRevue(){
  const box = document.getElementById('revueContent');
  if (!box) return;
  const fiches = (revueStore.fiches || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const groups = [];
  fiches.forEach(f => {
    const key = revueWeekKey(f.date || new Date().toISOString().slice(0, 10));
    let g = groups.find(g => g.key === key);
    if (!g){ g = { key, items: [] }; groups.push(g); }
    g.items.push(f);
  });

  box.innerHTML = `
    <div class="idees-actions">
      <button class="zoom-btn objectifs-export" id="revueExportBtn">⭳ Exporter</button>
    </div>
    <div class="revue-add-card">
      <div class="revue-add-row">
        <input type="text" id="revueEntrepriseInput" list="revueCompanyList" placeholder="Entreprise">
        <datalist id="revueCompanyList">${Object.keys(companies).map(n => `<option value="${n.replace(/"/g, '&quot;')}">`).join('')}</datalist>
        <input type="text" id="revueSourceInput" placeholder="Source / analyste">
        <input type="text" id="revueObjectifInput" placeholder="Objectif de cours (optionnel)">
      </div>
      <textarea id="revuePointsInput" placeholder="3 points clés sur les fondamentaux, un par ligne…" rows="3"></textarea>
      <button id="revueAddBtn" class="revue-add-btn">+ Ajouter la fiche</button>
    </div>
    ${groups.length === 0 ? '<div class="objectifs-empty">Aucune fiche pour l\'instant.</div>' : groups.map(g => `
      <div class="revue-week-group">
        <div class="revue-week-label">${g.key}</div>
        <div class="revue-week-fiches">${g.items.map(revueFicheHtml).join('')}</div>
      </div>`).join('')}
  `;

  document.getElementById('revueExportBtn').addEventListener('click', exportRevue);
  document.getElementById('revueAddBtn').addEventListener('click', addRevueFiche);
  box.querySelectorAll('.revue-fiche-del').forEach(btn => {
    btn.addEventListener('click', () => {
      revueStore.fiches = (revueStore.fiches || []).filter(f => f.id !== btn.dataset.id);
      persistRevueLocal();
      renderRevue();
    });
  });
}

function addRevueFiche(){
  const entrepriseInput = document.getElementById('revueEntrepriseInput');
  const entreprise = entrepriseInput.value.trim();
  if (!entreprise){ entrepriseInput.focus(); return; }
  const source = document.getElementById('revueSourceInput').value.trim();
  const objectifCours = document.getElementById('revueObjectifInput').value.trim();
  const points = document.getElementById('revuePointsInput').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3);
  if (!revueStore.fiches) revueStore.fiches = [];
  revueStore.fiches.push({ id: 'r' + Date.now(), entreprise, source, objectifCours, points, date: new Date().toISOString().slice(0, 10) });
  persistRevueLocal();
  renderRevue();
}

/* ============================================================
   ONGLET IDÉES DE DÉVELOPPEMENT — bloc-notes personnel pour
   centraliser les idées d'évolution du site, 3 rangées de priorité
   (urgent / bientôt / plus tard), case à cocher quand c'est fait.
   Persistance identique aux autres onglets : localStorage +
   socle data/idees.json.
   ============================================================ */
const IDEES_LS_KEY = 'wolfAnalysisIdees';
const IDEES_BASELINE_URL = 'data/idees.json';
const IDEES_CATS = [
  { key:'urgent', label:'À faire urgemment' },
  { key:'bientot', label:'Bientôt' },
  { key:'plus_tard', label:'Plus tard' }
];
let ideesStore = { urgent:[], bientot:[], plus_tard:[] };

// Archivage mensuel automatique (pas de backend => pas de vrai cron ; à chaque ouverture
// du site, si un nouveau mois a commencé depuis la dernière visite, l'état précédent est
// figé silencieusement dans ideesArchive avant que la liste active continue d'évoluer).
const IDEES_ARCHIVE_LS_KEY = 'wolfAnalysisIdeesArchive';
const IDEES_LAST_MONTH_LS_KEY = 'wolfAnalysisIdeesLastMonth';
let ideesArchive = [];
let ideesArchiveViewing = null;

const MOIS_NOMS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
function formatMoisLabel(moisKey){
  const [y, m] = moisKey.split('-').map(Number);
  return MOIS_NOMS_FR[m - 1] + ' ' + y;
}

function checkAndArchiveIdeesIfNewMonth(){
  const currentMonth = new Date().toISOString().slice(0, 7);
  let lastMonth = null;
  try{ lastMonth = localStorage.getItem(IDEES_LAST_MONTH_LS_KEY); }catch(e){ /* ignore */ }
  if (lastMonth === currentMonth) return;
  if (lastMonth){
    const hasContent = IDEES_CATS.some(c => (ideesStore[c.key] || []).length > 0);
    if (hasContent){
      const data = {};
      IDEES_CATS.forEach(c => { data[c.key] = (ideesStore[c.key] || []).map(i => ({ ...i })); });
      ideesArchive.push({ mois: lastMonth, label: formatMoisLabel(lastMonth), archivedAt: new Date().toISOString(), data });
      persistIdeesArchiveLocal();
    }
  }
  try{ localStorage.setItem(IDEES_LAST_MONTH_LS_KEY, currentMonth); }catch(e){ /* ignore */ }
}

function persistIdeesArchiveLocal(){
  try{ localStorage.setItem(IDEES_ARCHIVE_LS_KEY, JSON.stringify(ideesArchive)); }catch(e){ /* quota / navigateur privé */ }
}

async function loadIdeesBaseline(){
  try{
    const res = await fetch(IDEES_BASELINE_URL, { cache:'no-store' });
    if (res.ok){
      const json = await res.json();
      IDEES_CATS.forEach(c => { if (json && Array.isArray(json[c.key])) ideesStore[c.key] = json[c.key]; });
      if (json && Array.isArray(json.archive)) ideesArchive = json.archive;
    }
  }catch(e){ /* socle absent ou fetch bloqué (ex. file://) — non bloquant */ }
  try{
    const raw = localStorage.getItem(IDEES_LS_KEY);
    if (raw){
      const parsed = JSON.parse(raw);
      IDEES_CATS.forEach(c => { if (Array.isArray(parsed[c.key])) ideesStore[c.key] = parsed[c.key]; });
    }
  }catch(e){ /* localStorage indisponible ou JSON corrompu */ }
  try{
    const rawArchive = localStorage.getItem(IDEES_ARCHIVE_LS_KEY);
    if (rawArchive){
      const parsedArchive = JSON.parse(rawArchive);
      if (Array.isArray(parsedArchive) && parsedArchive.length) ideesArchive = parsedArchive;
    }
  }catch(e){ /* localStorage indisponible ou JSON corrompu */ }
  checkAndArchiveIdeesIfNewMonth();
  renderIdees();
}

function persistIdeesLocal(){
  try{ localStorage.setItem(IDEES_LS_KEY, JSON.stringify(ideesStore)); }catch(e){ /* quota / navigateur privé */ }
}

function exportIdees(){
  const blob = new Blob([JSON.stringify({ ...ideesStore, archive: ideesArchive }, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wolf-analysis-idees.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportIdeesAsPdf(){
  const body = IDEES_CATS.map(c => {
    const items = ideesStore[c.key] || [];
    const rows = items.length
      ? items.map(i => `<p>${i.done ? '☑' : '☐'} ${i.texte.replace(/</g, '&lt;')}</p>`).join('')
      : '<p style="color:#999">Aucune idée.</p>';
    return `<div class="print-section"><h3>${c.label}</h3>${rows}</div>`;
  }).join('');
  exportSectionAsPdf('Idées de développement', null, body);
}

function ideesArchiveViewHtml(entry){
  if (!entry) return '';
  return `<div class="idees-grid idees-archive-view">${IDEES_CATS.map(c => `
    <div class="idees-column idees-${c.key}">
      <h3>${c.label}</h3>
      <div class="idees-list">${(entry.data[c.key] || []).map(item => `
        <div class="idee-item readonly${item.done ? ' done' : ''}">
          <span class="idee-text">${item.texte.replace(/</g, '&lt;')}</span>
        </div>`).join('') || '<div class="objectifs-empty">Vide.</div>'}</div>
    </div>`).join('')}</div>`;
}

function renderIdees(){
  const box = document.getElementById('ideesContent');
  if (!box) return;
  box.innerHTML = `
    <div class="idees-actions">
      <button class="zoom-btn objectifs-export" id="ideesExportBtn">⭳ Exporter</button>
      <button class="zoom-btn objectifs-export" id="ideesExportPdfBtn">🖨 Exporter PDF</button>
    </div>
    <div class="idees-grid">${IDEES_CATS.map(c => `
      <div class="idees-column idees-${c.key}">
        <h3>${c.label}</h3>
        <div class="idees-list">${(ideesStore[c.key] || []).map(item => `
          <div class="idee-item${item.done ? ' done' : ''}" data-cat="${c.key}" data-id="${item.id}">
            <input type="checkbox" class="idee-check" ${item.done ? 'checked' : ''}>
            <span class="idee-text">${item.texte.replace(/</g, '&lt;')}</span>
            <button class="idee-del" aria-label="Supprimer">✕</button>
          </div>`).join('')}</div>
        <div class="idee-add">
          <input type="text" placeholder="Nouvelle idée…" data-cat="${c.key}">
          <button class="idee-add-btn" data-cat="${c.key}">+ Ajouter</button>
        </div>
      </div>`).join('')}</div>
    ${ideesArchive.length ? `
    <div class="idees-archive">
      <h3 class="idees-archive-title">📅 Historique mensuel</h3>
      <div class="idees-archive-months">${ideesArchive.slice().reverse().map(a => `
        <button class="idees-archive-month${ideesArchiveViewing === a.mois ? ' active' : ''}" data-mois="${a.mois}">${a.label}</button>`).join('')}</div>
      ${ideesArchiveViewing ? ideesArchiveViewHtml(ideesArchive.find(a => a.mois === ideesArchiveViewing)) : ''}
    </div>` : ''}`;

  document.getElementById('ideesExportBtn').addEventListener('click', exportIdees);
  document.getElementById('ideesExportPdfBtn').addEventListener('click', exportIdeesAsPdf);
  box.querySelectorAll('.idees-archive-month').forEach(btn => {
    btn.addEventListener('click', () => {
      ideesArchiveViewing = ideesArchiveViewing === btn.dataset.mois ? null : btn.dataset.mois;
      renderIdees();
    });
  });
  box.querySelectorAll('.idee-check').forEach(cb => {
    cb.addEventListener('change', e => {
      const item = e.target.closest('.idee-item');
      const idee = ideesStore[item.dataset.cat].find(i => i.id === item.dataset.id);
      if (idee){ idee.done = !idee.done; persistIdeesLocal(); renderIdees(); }
    });
  });
  box.querySelectorAll('.idee-del').forEach(btn => {
    btn.addEventListener('click', e => {
      const item = e.target.closest('.idee-item');
      ideesStore[item.dataset.cat] = ideesStore[item.dataset.cat].filter(i => i.id !== item.dataset.id);
      persistIdeesLocal();
      renderIdees();
    });
  });
  const submitIdee = (catKey, input) => {
    if (!input.value.trim()) { input.focus(); return; }
    ideesStore[catKey].push({ id:'i' + Date.now(), texte: input.value.trim(), done:false });
    persistIdeesLocal();
    renderIdees();
  };
  box.querySelectorAll('.idee-add input').forEach(input => {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submitIdee(input.dataset.cat, input); });
  });
  box.querySelectorAll('.idee-add-btn').forEach(btn => {
    btn.addEventListener('click', () => submitIdee(btn.dataset.cat, btn.previousElementSibling));
  });
}

/* ============================================================
   INIT — on s'assure d'abord que Chart.js est bien chargé
   (avec plusieurs sources de secours si la première est bloquée
   par un bloqueur de publicité ou une restriction réseau),
   puis seulement ensuite on démarre le chargement des données.
   ============================================================ */
function loadScriptOnce(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error('échec: ' + src));
    document.head.appendChild(s);
  });
}

async function ensureChartJs(){
  if (window.Chart) return true;
  const sources = [
    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
    'https://unpkg.com/chart.js@4.4.4/dist/chart.umd.min.js'
  ];
  for (const src of sources){
    try{
      await loadScriptOnce(src);
      if (window.Chart) return true;
    }catch(e){ /* on essaie la source suivante */ }
  }
  return false;
}

document.getElementById('refreshBtn').addEventListener('click', loadData);
document.querySelectorAll('.page-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});
initSearch();
initSectorGrid();
initClassement();

document.getElementById('saveObjectifBtn').addEventListener('click', () => { if (activeCompany) saveObjectif(activeCompany); });
document.getElementById('exportObjectifsBtn').addEventListener('click', exportObjectifs);
document.getElementById('objectifsList').addEventListener('click', e => {
  if (!activeCompany) return;
  const delBtn = e.target.closest('.del[data-idx]');
  if (delBtn){
    objectifsStore[activeCompany].splice(parseInt(delBtn.dataset.idx, 10), 1);
    persistObjectifsLocal();
    renderObjectifsHistory(activeCompany);
    return;
  }
  const loadBtn = e.target.closest('.load[data-idx]');
  if (loadBtn) applyObjectif(activeCompany, parseInt(loadBtn.dataset.idx, 10));
});
loadObjectifsBaseline();
initWatchlist();
loadWatchlistBaseline();
initAlertes();
loadAlertesBaseline();
initFicheModal();
initAnalyseModal();
initCerveauImagePicker();
loadMacroFundamentalsData();
document.getElementById('openAnalyseTag').addEventListener('click', () => { if (activeCompany) openAnalyse(activeCompany); });
loadCerveauData();
loadIdeesBaseline();
loadRevueBaseline();

(async function init(){
  const ok = await ensureChartJs();
  if (!ok){
    showError("Impossible de charger la librairie de graphiques (Chart.js), quelle que soit la source essayée. C'est presque toujours un bloqueur de publicité, un antivirus ou une restriction réseau qui bloque les CDN (cdnjs.cloudflare.com, jsdelivr.net, unpkg.com). Essaie de désactiver temporairement tes extensions de navigateur, ou ouvre la page en navigation privée.");
    return;
  }
  configureChartDefaults();
  loadData();
})();

