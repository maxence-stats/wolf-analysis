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
// Décalage de +2 colonnes constaté (et vérifié champ par champ contre le JSON réel de
// l'API Apps Script — voir loadAllDataFromAppsScript) par rapport à l'ancien mapping
// CSV/gviz : deux colonnes ont dû être insérées dans le Sheet depuis la dernière
// vérification. Décalage uniforme sur tout le bloc, cohérent d'un champ à l'autre.
const PCOL = {
  actif:23, valorisation:24, investi:25, perf:26,             // X, Y, Z, AA
  capitalInvesti:28, valorisationTotale:31,                    // AC, AF
  gainsEuros:34, gainsPct:37,                                  // AI, AL
  cashEuros:40,                                                 // AO
  moisDate:43, moisValo:45, moisRendement:47, rendementTotal:48, // AR, AT, AV, AW
  spxPerfMensuelle:49, spxPerfTotale:50, spxValorisation:51     // AX, AY, AZ
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

/* Portefeuille Perso (PEA + CTO) — Google Sheet DÉDIÉ, distinct de "DATA BASE 20 ans"
   (fichier différent, donc PUBLISHED_ID/SHEET_ID propres, pas les constantes globales
   ci-dessus). Mise en page vérifiée directement sur le CSV réel avant d'écrire le
   parsing (piège technique déjà rencontré sur ce projet : ne jamais coder un mapping
   sur une description verbale) : deux blocs "tableau de bord" côte à côte sur les mêmes
   lignes — PEA (colonnes B à R) et CTO (colonnes U à AL) — chacun avec un sous-bloc
   évolution mensuelle + un sous-bloc positions. Le sous-bloc positions du CTO démarre
   UNE LIGNE PLUS BAS que celui du PEA (son titre "CTO - Saxo" occupe la ligne où le PEA
   a déjà ses en-têtes de colonnes) — d'où un parsing par RECONNAISSANCE DE CONTENU
   (ligne valide = nom de position non vide + valorisation numérique), jamais par
   position de ligne fixe, seule façon de rester correct malgré ce décalage. */
const PERSO_PUBLISHED_ID = "2PACX-1vQOpTAjavq-PV4Lg4_rWoI4fKbPNi9MnaQXm8SY1MmdJYNUIyr-Tg9ul4FwHVVjiW08GY7KqfByuBq6";
const PERSO_SHEET_ID = "1LeDGlvjnUZB_4S_jRAqwd7ynUn5hQLGIjTuEJB-IV34";
const PERSO_GID = "1457758875";
const PEA_COL = {
  mois:1, versement:2, valeurApresFlux:3, valeurPart:4, rendementPeriode:5, rendementCumule:6,
  cac40:7, valeurPartCac40:8, rendementPeriodeCac40:9,
  actif:11, valorisation:12, poids:13, valorisationTotale:14, valeurAchat:15, perfPct:16, perfEur:17,
  valeurAchatTotalCol:18 // "Valeur d'achat total" — capital investi réel (positions + cash), colonne S
};
const CTO_COL = {
  mois:20, versement:21, valeurApresFlux:22, valeurPart:23, rendementPeriode:24, rendementCumule:25,
  cac40:26, valeurPartCac40:27, rendementPeriodeCac40:28,
  actif:31, valorisation:32, poids:33, valorisationTotale:34, valeurAchat:35, perfPct:36, perfEur:37,
  valeurAchatTotalCol:38 // "Valeur d'achat total" — capital investi réel (positions + cash), colonne AM
};
// persoDataReal = les vraies données PEA/CTO (écrites par handlePersoRows). `persoData`
// est la variable que TOUTES les fonctions de rendu de cet onglet lisent (renderPerso*) —
// renderPersoPortfolio() la fait pointer vers persoDataReal si déverrouillé, ou vers
// PERSO_FAKE_DATA sinon, juste avant d'appeler ces fonctions telles quelles (aucune
// n'a besoin d'être modifiée pour gérer le verrou, voir "Perso PEA/CTO : verrou").
let persoDataReal = { pea:{ monthly:[], positions:[], valorisationTotale:null }, cto:{ monthly:[], positions:[], valorisationTotale:null } };
let persoData = persoDataReal;
let persoSparseFieldsFailed = false;

// ============================================================
// PERSO PEA/CTO — verrou par code (demande explicite utilisateur : partager le site en
// ligne sans exposer ce portefeuille précis à un visiteur quelconque). AUCUNE sécurité
// réelle possible ici — site 100% statique sans backend, donc pas d'authentification
// serveur : n'importe qui inspectant le code source ou mettant un point d'arrêt JS peut
// retrouver le code. Accepté explicitement par l'utilisateur après explication — le but
// est de décourager un visiteur casual tombant sur le lien, pas un vrai coffre-fort.
// Le code n'est pas stocké en clair (léger obstacle de plus à un simple Ctrl+F "4242"
// dans le fichier), comparé via un hash non cryptographique trivial.
// Tant que verrouillé, les vraies données ne sont JAMAIS écrites dans le DOM (pas juste
// floutées visuellement) : renderPersoPortfolio() bascule `persoData` sur un jeu de
// données fictif avant tout rendu, donc rien de réel n'est même présent à inspecter.
function persoSimpleHash(str){
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}
const PERSO_LOCK_HASH = 1598844; // hash de persoSimpleHash('4242')
let persoUnlocked = false;
try{ persoUnlocked = localStorage.getItem('wolfAnalysisPersoUnlocked') === '1'; }catch(e){ /* localStorage indisponible */ }

// Portefeuille fictif affiché tant que verrouillé — mêmes formes de données que
// persoDataReal (voir parsePersoBlock/parsePersoCashImmo), valeurs rondes et
// clairement génériques (pas de vraies entreprises suivies, pas de logo qui matcherait).
const PERSO_FAKE_DATA = {
  pea: {
    capitalInvestiTotal: 5000, valorisationTotale: 5320,
    positions: [
      { nom:'Position A', valorisation:2100, investi:1900, perfEur:200, perfPct:10.5, valeurAchat:1900 },
      { nom:'Position B', valorisation:1720, investi:1600, perfEur:120, perfPct:7.5, valeurAchat:1600 },
      { nom:'CASH', valorisation:1500, investi:1500, perfEur:0, perfPct:0, valeurAchat:1500 }
    ],
    monthly: [
      { mois:'Mois 1', valeurPart:100, valeurPartCac40:100 },
      { mois:'Mois 2', valeurPart:104, valeurPartCac40:102 },
      { mois:'Mois 3', valeurPart:108, valeurPartCac40:103 }
    ]
  },
  cto: {
    capitalInvestiTotal: 4000, valorisationTotale: 4180,
    positions: [
      { nom:'Position C', valorisation:2200, investi:2000, perfEur:200, perfPct:10, valeurAchat:2000 },
      { nom:'Position D', valorisation:1980, investi:1900, perfEur:80, perfPct:4.2, valeurAchat:1900 }
    ],
    monthly: [
      { mois:'Mois 1', valeurPart:100, valeurPartCac40:100 },
      { mois:'Mois 2', valeurPart:101, valeurPartCac40:102 },
      { mois:'Mois 3', valeurPart:105, valeurPartCac40:103 }
    ]
  },
  cashImmo: { cashTotal: 3000, immobilier: 8000 }
};

function renderPersoLockUI(){
  const box = document.getElementById('persoLockBox');
  if (!box) return;
  if (persoUnlocked){
    box.innerHTML = `<button class="zoom-btn objectifs-export" id="persoLockBtn">🔒 Verrouiller</button>`;
    document.getElementById('persoLockBtn').addEventListener('click', () => {
      persoUnlocked = false;
      try{ localStorage.removeItem('wolfAnalysisPersoUnlocked'); }catch(e){ /* localStorage indisponible */ }
      renderPersoLockUI();
      renderPersoPortfolio();
    });
    return;
  }
  box.innerHTML = `<div class="perso-lock-form">
    <span class="perso-lock-note">🔒 Verrouillé — chiffres fictifs affichés</span>
    <input type="password" inputmode="numeric" maxlength="8" id="persoLockInput" placeholder="Code">
    <button class="zoom-btn objectifs-export" id="persoLockSubmit">Déverrouiller</button>
    <span class="perso-lock-error" id="persoLockError" style="display:none;">Code incorrect.</span>
  </div>`;
  const input = document.getElementById('persoLockInput');
  const submit = () => {
    if (persoSimpleHash(input.value.trim()) === PERSO_LOCK_HASH){
      persoUnlocked = true;
      try{ localStorage.setItem('wolfAnalysisPersoUnlocked', '1'); }catch(e){ /* localStorage indisponible */ }
      renderPersoLockUI();
      renderPersoPortfolio();
    } else {
      document.getElementById('persoLockError').style.display = 'inline';
      input.value = '';
      input.focus();
    }
  };
  document.getElementById('persoLockSubmit').addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

/* ============================================================
   CHARGEMENT DES DONNÉES — 2 méthodes, avec repli automatique
   1) fetch() sur le CSV publié — la méthode standard une fois hébergé en ligne
   2) balise <script> (JSONP) — contourne les restrictions que Chrome applique
      aux requêtes réseau depuis un fichier ouvert en local (file://)
   ============================================================ */
const SHEET_ID = "1V4NaDx7PvnJkPMtddGgW23Hjn0jon1g0UjoC4o6FchM";

// Endpoint Apps Script unique (Web App déployé par l'utilisateur, "Anyone" access) —
// remplace le duo fetch()+gviz par source (jusqu'à ~14 requêtes simultanées vers
// docs.google.com, cause probable de la plupart des échecs de chargement constatés
// cette session) par UN seul appel qui renvoie toutes les données en JSON. Contrairement
// à fetch() direct vers docs.google.com, un Web App Apps Script envoie bien les en-têtes
// CORS nécessaires même depuis une origine null (file://) — vérifié en conditions
// réelles avant de basculer dessus. Chaque onglet est renvoyé en TABLEAU BRUT
// (sheet.getDataRange().getValues(), pas d'objets par en-tête — un premier essai avec
// des objets échouait pour les onglets "tableau de bord" à plusieurs blocs ET perdait
// des données pour Prix Action 20 ans, deux colonnes adjacentes partageant le même
// en-tête vide s'écrasant l'une l'autre), donc directement compatible avec les
// parseurs par reconnaissance de contenu déjà utilisés partout ailleurs sur le site —
// mêmes fonctions handleXxxRows(), juste une source de rows différente.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzyM-PCKaWjBpSh4y8ATEuyInO5JTRd9HO7cWDRqo_nMKjQSaSLxLIV1HkO6DcqwNj3/exec';

// Le JSON combiné (~3 Mo, tous les onglets fusionnés en un seul appel) met parfois
// plus de 20s à revenir (constaté en test : un fetch isolé a pris ~13s, et sous charge
// réelle — polices, Chart.js, fallback Yahoo/Stooq en parallèle — ça dépasse souvent ce
// délai), ce qui faisait échouer TOUT le chargement au hasard (écran d'erreur complet,
// y compris quand seul le Wolf Portfolio ou le Perso avaient besoin d'un peu plus de
// temps). Délai porté à 45s + une nouvelle tentative automatique avant d'abandonner.
async function loadAllDataFromAppsScript(retried){
  document.getElementById('loadingScreen').style.display = 'block';
  document.getElementById('errorScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'none';
  setSync('loading');
  setDebug(retried ? 'Nouvelle tentative de connexion…' : 'Connexion via la méthode alternative (script)…');
  try{
    const res = await Promise.race([
      fetch(APPS_SCRIPT_URL, { cache:'no-store' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 45000))
    ]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (typeof data !== 'object' || data === null) throw new Error('réponse invalide');
    setDebug('Connecté via la méthode alternative (script).');
    handleCsvRows(data['DATA BASE 20 ans'] || []);
    if (data['WOLF Portefeuille']) handlePortfolioRows(data['WOLF Portefeuille']);
    if (data['PRIX ACTION 20 ANS']){
      handlePriceHistoryRows(data['PRIX ACTION 20 ANS']);
      // handleCsvRows() ci-dessus a déjà rendu le Portefeuille Dividende une 1re fois
      // (via renderDividendPortfolio() en fin de fonction) — à ce moment-là,
      // priceHistoryData était encore vide, donc medianAnnualReturn() renvoyait null
      // pour tout le monde : les positions déjà enregistrées (baseline/localStorage)
      // affichaient "N/D" partout jusqu'à la prochaine interaction utilisateur (retour
      // explicite : "je vois... mais il y a marqué ND"). Un second rendu ici, une fois
      // priceHistoryData réellement peuplé, corrige l'affichage dès le chargement.
      renderDividendPortfolio();
    }
    if (data['DATA SECTORIELS US']){
      handleMacroRotationRows(data['DATA SECTORIELS US']);
      handleMacroCycleRowsFromSectoriels(data['DATA SECTORIELS US']);
    }
    if (data['DASHBOARD CYCLE']){
      handleMacroPowerRows(data['DASHBOARD CYCLE']);
      macroFundamentalsData = parseMacroFundamentalsFromDashboard(data['DASHBOARD CYCLE']);
      if (macroFundamentalsData) renderMacroFundamentalsTable(); else renderMacroFundamentalsError();
    }
    if (data['SYNTHESE PORTEFEUILLE']) handlePersoRows(data['SYNTHESE PORTEFEUILLE']);
  }catch(e){
    if (!retried){ loadAllDataFromAppsScript(true); return; }
    console.error('Erreur de chargement (Apps Script) :', e);
    showError("Impossible de charger les données depuis l'endpoint Apps Script après deux tentatives. Vérifie que le script est bien déployé (Déployer → Gérer les déploiements → Nouvelle version) et que le lien est correct. Détail technique en console (F12).");
  }
}

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
function escapeHtml(s){
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
      // OCF/action non présent en colonne brute dans le Sheet : dérivé de prixActuel/pOcf,
      // même principe déjà utilisé pour le toggle FCF/OCF de l'onglet Valorisation.
      ocfParAction: (prixActuel != null && parseNum(c[COL.pOcf])) ? prixActuel / parseNum(c[COL.pOcf]) : null,
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
  renderDividendPortfolio();
  renderConstructionPortfolio();
  renderComparaisonPicker();

  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('errorScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  setSync('ok');

  // Les sources secondaires (Portfolio, historique de prix, macro...) ne sont PLUS
  // déclenchées ici — voir loadAllDataFromAppsScript() : un seul appel réseau les
  // apporte toutes désormais, plus besoin de les étaler dans le temps pour éviter la
  // contention réseau (l'ancien problème que ce délai contournait).
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
        // La cellule Sheet est au format "Pourcentage" : l'API renvoie la fraction brute
        // (0,0086) et non la valeur affichée (0,86%) — contrairement à spxPerfMensuelle/
        // spxPerfTotale ci-dessous, qui sont déjà des nombres "pourcentage" bruts dans le
        // Sheet (14 pour 14%, pas 0,14). Confirmé en comparant à
        // (valorisationTotale-capitalInvesti)/capitalInvesti : sans ce ×100, le site
        // affichait "+0,0%" alors que le vrai gain était +0,86% (bug remonté par
        // l'utilisateur : "je ne peux pas avoir zéro pour cent... il y a un problème"),
        // et le graphique Wolf Portfolio vs S&P 500 traçait une ligne quasiment plate à
        // zéro à côté du S&P correctement à l'échelle (même cause racine que "la ligne
        // reste flat").
        const gainsPctRaw = parseNum(c[PCOL.gainsPct]);
        summary.gainsPct = gainsPctRaw != null ? gainsPctRaw * 100 : null;
        summary.cashEuros = parseNum(c[PCOL.cashEuros]);
        summaryFound = true;
      }
    }

    const moisDate = parseStr(c[PCOL.moisDate]);
    if (moisDate && moisDate.toUpperCase() !== 'MOIS'){
      const rendementMensuelRaw = parseNum(c[PCOL.moisRendement]);
      const rendementTotalRaw = parseNum(c[PCOL.rendementTotal]);
      monthly.push({
        mois: moisDate,
        // Même correctif ×100 que gainsPct ci-dessus, même cause (cellules "Pourcentage").
        rendementMensuel: rendementMensuelRaw != null ? rendementMensuelRaw * 100 : null,
        rendementTotal: rendementTotalRaw != null ? rendementTotalRaw * 100 : null,
        spxPerfMensuelle: parseNum(c[PCOL.spxPerfMensuelle]),
        spxPerfTotale: parseNum(c[PCOL.spxPerfTotale])
      });
    }
  }

  portfolioData = Object.assign({ holdings, monthly }, summary);
  renderPortfolio();
}

/* ============================================================
   PORTEFEUILLE PERSO (PEA + CTO) — chargement CSV+gviz dédié (fichier
   Sheet différent de "DATA BASE 20 ans", voir commentaire sur PERSO_PUBLISHED_ID).
   Même pattern double-méthode que le reste du site, mais paramétré sur ce fichier
   précis (loadSheetDual() reste réservé aux onglets du fichier principal).
   ============================================================ */
let persoLoadSettled = false;

function loadPersoData(){
  persoLoadSettled = false;
  const csvUrl = `https://docs.google.com/spreadsheets/d/e/${PERSO_PUBLISHED_ID}/pub?gid=${PERSO_GID}&single=true&output=csv`;
  const controller = new AbortController();
  const hardTimeout = setTimeout(() => controller.abort(), 8000);
  fetch(csvUrl + '&_=' + Date.now(), { signal: controller.signal, cache:'no-store' })
    .then(async res => {
      if (persoLoadSettled) return;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (text.trim().toLowerCase().startsWith('<')) throw new Error('HTML au lieu de CSV');
      const parsed = Papa.parse(text.trim(), { skipEmptyLines:false });
      if (!parsed.data || parsed.data.length < 3) throw new Error('CSV vide ou illisible');
      if (persoLoadSettled) return;
      persoLoadSettled = true;
      clearTimeout(hardTimeout);
      handlePersoRows(parsed.data);
    })
    .catch(() => { clearTimeout(hardTimeout); });

  const old = document.getElementById('gviz_persoPortfolio');
  if (old) old.remove();
  window.__handlePersoGviz = function(data){
    if (persoLoadSettled) return;
    try{
      if (!data || !data.table || !data.table.cols) throw new Error('table vide');
      const rows = [data.table.cols.map(c => c.label)].concat(
        (data.table.rows || []).map(r => (r.c || []).map(cell => cell ? (cell.f != null ? cell.f : cell.v) : ''))
      );
      persoLoadSettled = true;
      handlePersoRows(rows);
    }catch(e){ /* silencieux : le repli CSV ou le timeout de secours prendront le relais */ }
  };
  const script = document.createElement('script');
  script.id = 'gviz_persoPortfolio';
  script.src = `https://docs.google.com/spreadsheets/d/${PERSO_SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:__handlePersoGviz&gid=${PERSO_GID}&headers=1&_=${Date.now()}`;
  document.body.appendChild(script);
  setTimeout(() => { persoLoadSettled = true; }, 9000);
}

function parsePersoBlock(rows, col){
  const monthly = [];
  const positions = [];
  let valorisationTotale = null;
  for (let i = 0; i < rows.length; i++){
    const r = rows[i];
    if (!r) continue;
    const mois = parseStr(r[col.mois]);
    if (mois && mois.toUpperCase() !== 'MOIS'){
      monthly.push({
        mois, versement: parseNum(r[col.versement]), valeurApresFlux: parseNum(r[col.valeurApresFlux]),
        valeurPart: parseNum(r[col.valeurPart]), rendementPeriode: parseNum(r[col.rendementPeriode]),
        rendementCumule: parseNum(r[col.rendementCumule]), cac40: parseNum(r[col.cac40]),
        valeurPartCac40: parseNum(r[col.valeurPartCac40]), rendementPeriodeCac40: parseNum(r[col.rendementPeriodeCac40])
      });
    }
    const actif = parseStr(r[col.actif]);
    const valorisation = parseNum(r[col.valorisation]);
    // Ligne de position valide = nom non vide (hors en-tête "Action") ET valorisation
    // numérique — exclut aussi le titre de bloc ("PEA - Crédit Agricole"/"CTO - Saxo"),
    // qui partage la même colonne mais n'a jamais de valorisation en face.
    if (actif && actif.toUpperCase() !== 'ACTION' && valorisation != null){
      positions.push({
        nom: actif, valorisation, poids: parseNum(r[col.poids]),
        valeurAchat: parseNum(r[col.valeurAchat]), perfPct: parseNum(r[col.perfPct]), perfEur: parseNum(r[col.perfEur])
      });
      if (valorisationTotale == null) valorisationTotale = parseNum(r[col.valorisationTotale]);
    }
  }
  // "Valeur d'achat total" (capital réellement investi : positions + cash apporté au
  // compte, pas juste la somme des coûts d'acquisition des positions) — colonne dédiée
  // du Sheet, vérifiée valeur par valeur (PEA : colonne S ligne 6, 5 287,83€ ; CTO :
  // colonne AM ligne 7, 6 180,20€, confirmé par l'utilisateur directement sur le Sheet).
  // Recherche DIRECTE de la première valeur numérique de la colonne (comme pour le cash
  // Perso, voir parsePersoCashImmo) plutôt qu'une recherche par libellé texte : "Valeur
  // d'achat total" est une ligne à une seule cellule remplie que gviz compresse
  // silencieusement, et le refetch CSV de secours est de toute façon voué à l'échec en
  // file:// (CORS, voir refetchPersoSparseFieldsViaCsv) — la recherche par libellé
  // dépendait donc d'une ligne fragile ET d'un repli qui ne peut pas aboutir.
  const capitalInvestiTotal = findFirstNumInColumnRange(rows, col.valeurAchatTotalCol, 12);
  return { monthly, positions, valorisationTotale, capitalInvestiTotal };
}

// Cash (LDDS + Livret A) et Immobilier : blocs distincts, vérifiés colonne par colonne
// sur le CSV réel avant d'écrire ce parsing (comme pour PEA_COL/CTO_COL — voir "Pièges
// techniques" points 11/14). Chaque compte cash a son propre journal mensuel (Versement/
// Valorisation) suivi d'une ligne "snapshot" avec la valorisation actuelle — on prend la
// DERNIÈRE valeur numérique connue dans la colonne Valorisation du bloc (couvre aussi
// bien un mois réellement rempli que la ligne snapshot dédiée, sans dépendre d'un numéro
// de ligne fixe). Immobilier : bloc "Actif/quantité/.../somme live €/gains", la ligne
// "Total" donne la valorisation actuelle agrégée (colonne "somme live €").
// Recherche sur une PLAGE de colonnes (pas une colonne unique) : gviz et CSV ne
// compressent pas les colonnes creuses de la même façon sur ce fichier (même piège que
// les lignes vides du tableau Force relative sectorielle) — une colonne fixe pouvait
// être décalée de quelques positions selon la méthode de chargement gagnante. Renvoie
// {row, col} pour que l'appelant lise les valeurs à la colonne RÉELLEMENT trouvée.
function findPersoCellByLabel(rows, colCenter, colSpan, label){
  const target = label.toUpperCase();
  for (let r = 0; r < rows.length; r++){
    for (let c = Math.max(0, colCenter - colSpan); c <= colCenter + colSpan; c++){
      if ((parseStr(rows[r] && rows[r][c]) || '').toUpperCase() === target) return { row:r, col:c };
    }
  }
  return null;
}
function lastNumInColumn(rows, startRow, col, span){
  let last = null;
  for (let r = startRow; r < startRow + span && r < rows.length; r++){
    const v = parseNum(rows[r] && rows[r][col]);
    if (v != null) last = v;
  }
  return last;
}
// Cherche la première valeur numérique dans une colonne, sur une petite plage de lignes
// (tolère un léger décalage de ligne entre CSV/gviz sans risquer de tomber sur une
// valeur sans rapport plus bas dans la même colonne).
function findFirstNumInColumnRange(rows, col, maxRow){
  for (let r = 0; r < Math.min(maxRow, rows.length); r++){
    const v = parseNum(rows[r] && rows[r][col]);
    if (v != null) return v;
  }
  return null;
}
function parsePersoCashImmo(rows){
  const apCol = colToIdx('AP'), bhCol = colToIdx('BH');
  // ±4 colonnes de tolérance : constaté en test que la colonne réelle de "LDDS"/
  // "LIVRET A" se décale de quelques positions selon CSV vs gviz sur ce fichier (le
  // fixed apCol seul renvoyait null selon la méthode de chargement gagnante).
  const ldds0 = findPersoCellByLabel(rows, apCol, 4, 'LDDS');
  const livret0 = findPersoCellByLabel(rows, apCol, 4, 'LIVRET A');
  // LDDS et Livret A partagent la MÊME colonne (juste deux blocs empilés) : borner le
  // balayage de LDDS à la ligne où "LIVRET A" démarre est nécessaire, sinon on lit par
  // erreur une valeur du bloc Livret A comme si c'était celle de LDDS (constaté en test :
  // les deux remontaient la même valeur, celle de Livret A, sans cette borne).
  const lddsSpan = (livret0 && ldds0 && livret0.row > ldds0.row) ? (livret0.row - ldds0.row) : rows.length;
  const ldds = ldds0 ? lastNumInColumn(rows, ldds0.row, ldds0.col + 2, lddsSpan) : null;
  const livretA = livret0 ? lastNumInColumn(rows, livret0.row, livret0.col + 2, rows.length) : null;
  const total0 = findPersoCellByLabel(rows, bhCol, 4, 'Total');
  const immobilier = total0 ? parseNum(rows[total0.row][total0.col + 9]) : null;
  // Cellule relais dédiée (BE ligne 4, BF en secours identique) ajoutée par l'utilisateur
  // spécifiquement pour fiabiliser cette valeur — LDDS/LIVRET A restent des lignes quasi
  // vides que gviz compresse silencieusement (voir plus haut) ET nécessitaient un refetch
  // CSV dédié peu fiable en file:// ; cette cellule directe, dans une zone dense du
  // Sheet, survit aux deux méthodes de chargement sans repli supplémentaire. Préférée à
  // la somme LDDS+Livret A quand disponible.
  const cashTotalDirect = findFirstNumInColumnRange(rows, colToIdx('BE'), 8) || findFirstNumInColumnRange(rows, colToIdx('BF'), 8);
  return {
    ldds, livretA,
    cashTotal: cashTotalDirect != null ? cashTotalDirect : ((ldds != null || livretA != null) ? (ldds || 0) + (livretA || 0) : null),
    immobilier
  };
}
// Bug trouvé en test : "LDDS"/"LIVRET A"/"Valeur d'achat total" sont des lignes à UNE
// seule cellule remplie (~69 colonnes vides sur 70) — le point d'entrée gviz les
// compresse silencieusement (heuristique "ligne quasi vide" → supprimée), contrairement
// au CSV qui les garde tel quel. "Total" (bloc Immobilier) survit car sa ligne a
// plusieurs cellules remplies. Plutôt que de deviner un décalage, on refait un fetch CSV
// dédié (léger, un seul petit fichier) pour recalculer ces champs précis dès que la
// source gviz a gagné la course — le CSV donne toujours la bonne structure ici.
// fetch() peut rester bloqué INDÉFINIMENT sur file:// sans jamais résoudre/rejeter,
// y compris avec AbortController.abort() (piège documenté, voir CLAUDE.md "Pièges
// techniques" point 2) — Promise.race avec un simple timer (jamais soumis à cette
// restriction réseau) garantit qu'on continue de toute façon après 8s, que le fetch()
// sous-jacent ait fini ou non. Sans ce garde-fou, ce refetch pouvait rester en attente
// pour toujours sur un site ouvert en file://, laissant le cash/Livret A bloqués sur
// "N/D" en permanence sans aucune erreur visible (bug remonté par l'utilisateur).
async function refetchPersoSparseFieldsViaCsv(attempt){
  attempt = attempt || 1;
  try{
    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${PERSO_PUBLISHED_ID}/pub?gid=${PERSO_GID}&single=true&output=csv&_=${Date.now()}`;
    // 15s (pas 8) : ce refetch se déclenche pile pendant la salve de chargement des
    // autres sources (macro, portfolio, historique de prix...) — retour utilisateur
    // confirmé, échec systématique malgré un fetch() qui fonctionne bien isolément.
    const res = await Promise.race([
      fetch(csvUrl, { cache:'no-store' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
    ]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const parsed = Papa.parse(text.trim(), { skipEmptyLines:false });
    const cashImmo = parsePersoCashImmo(parsed.data);
    if (cashImmo.ldds != null || cashImmo.livretA != null) persoDataReal.cashImmo = cashImmo;
    const peaTotal = parsePersoBlock(parsed.data, PEA_COL).capitalInvestiTotal;
    const ctoTotal = parsePersoBlock(parsed.data, CTO_COL).capitalInvestiTotal;
    if (peaTotal != null) persoDataReal.pea.capitalInvestiTotal = peaTotal;
    if (ctoTotal != null) persoDataReal.cto.capitalInvestiTotal = ctoTotal;
  }catch(e){
    // Échec probablement dû à la contention réseau (beaucoup de sources en vol au même
    // moment) plutôt qu'à une panne réelle — un 2e essai a de bonnes chances de passer
    // une fois les autres requêtes retombées (même logique que loadMacroPowerData()).
    if (attempt < 2){ renderPersoPortfolio(); return refetchPersoSparseFieldsViaCsv(attempt + 1); }
    persoSparseFieldsFailed = true;
  }
  renderPersoPortfolio();
}
function handlePersoRows(rows){
  persoDataReal = { pea: parsePersoBlock(rows, PEA_COL), cto: parsePersoBlock(rows, CTO_COL), cashImmo: parsePersoCashImmo(rows) };
  // cashTotal peut désormais venir directement de la cellule relais (BE/BF ligne 4,
  // zone dense qui survit à gviz) même si ldds/livretA restent introuvables — pas la
  // peine de déclencher un refetch fetch()-only (peu fiable en file://, voir plus haut)
  // rien que pour un détail LDDS/Livret A déjà satisfait au niveau du total affiché.
  const needsRefetch = (persoDataReal.cashImmo.cashTotal == null)
    || persoDataReal.pea.capitalInvestiTotal == null || persoDataReal.cto.capitalInvestiTotal == null;
  if (needsRefetch) refetchPersoSparseFieldsViaCsv();
  renderPersoPortfolio();
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
  const s = String(str || '');
  // Sheet publié en CSV/gviz : "18/08/2006". Sheet lu via l'API Apps Script
  // (SpreadsheetApp.getValues()) : les cellules Date sérialisent en ISO 8601
  // ("2006-08-18T15:40:00.000Z") — les deux sources doivent rester lisibles ici, cette
  // fonction est partagée par tous les parseurs qui consomment l'une ou l'autre.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
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

// Performance glissante sur 1 an, calculée à CHAQUE point de l'historique (pas une
// seule fois par an) : pour chaque date, on cherche le point ~365 jours plus tôt (le
// plus proche disponible, tolérance 20 jours — l'historique dédié est hebdomadaire donc
// jamais pile à la date). Sert de base à la médiane demandée par l'utilisateur ("la
// performance sur un an, systématiquement") plutôt qu'un simple CAGR de bout en bout,
// qui masquerait la dispersion réelle d'une action à l'autre. Uniquement disponible
// pour les ~20 entreprises de l'onglet Sheet dédié "PRIX ACTION 20 ANS" (priceHistoryData)
// — pas de repli Yahoo/Stooq ici (fetch par entreprise, pas adapté à un calcul en lot).
function stockRollingAnnualReturns(nom){
  const series = findPriceHistoryForCompany(nom);
  if (!series || series.length < 60) return null;
  const MS_YEAR = 365 * 24 * 3600 * 1000;
  const TOLERANCE_MS = 20 * 24 * 3600 * 1000;
  const returns = [];
  let j = 0;
  for (let i = 0; i < series.length; i++){
    const targetTime = new Date(series[i].date).getTime() - MS_YEAR;
    while (j < series.length - 1 && new Date(series[j + 1].date).getTime() <= targetTime) j++;
    const baseTime = new Date(series[j].date).getTime();
    if (Math.abs(baseTime - targetTime) > TOLERANCE_MS) continue;
    if (baseTime >= new Date(series[i].date).getTime()) continue;
    const base = series[j].close;
    if (!base) continue;
    returns.push({ date: series[i].date, ret: series[i].close / base - 1 });
  }
  return returns;
}

// Médiane des performances glissantes sur 1 an, restreinte aux `years` dernières années
// — pas la médiane de TOUT l'historique dispo, sinon la fenêtre "5 ans" et "20 ans"
// donneraient le même résultat dès que l'action a plus de 5 ans de données. Retourne un
// pourcentage (ex. 8.4 pour +8,4%/an), ou null si pas assez de données sur la fenêtre.
function medianAnnualReturn(nom, years){
  const all = stockRollingAnnualReturns(nom);
  if (!all || !all.length) return null;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filtered = all.filter(r => r.date >= cutoffStr).map(r => r.ret).sort((a, b) => a - b);
  if (!filtered.length) return null;
  const mid = Math.floor(filtered.length / 2);
  const median = filtered.length % 2 ? filtered[mid] : (filtered[mid - 1] + filtered[mid]) / 2;
  return median * 100;
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
let macroCycleData = null; // { dates, ratio, ema, plus1, minus1, plus2, minus2, euphorie, panique }
let macroCycleRange = '20';

// L'ancien onglet dédié "Cycle de Marché" (gid 1014329874) a été fusionné par
// l'utilisateur dans "DATA SECTORIELS US" (même onglet que Rotation Sectorielle) —
// colonnes vérifiées directement contre le JSON réel de l'API Apps Script avant
// d'écrire ce mapping (voir loadAllDataFromAppsScript) : date=index 6 (partagée avec
// le bloc XLK de Rotation Sectorielle), ratio=81, EMA20=82, écart type=83, +2σ=84,
// -2σ=85, +1σ=86, -1σ=87 — un premier comptage à la main (77/78/80/81/82/83) était
// décalé de +4, corrigé après vérification programmatique des positions réelles dans
// row0 (super-en-têtes "RATIO"/"EMA 20"/"ECART TYPE"/"2 ECART TYPE"/...). Valeurs
// re-vérifiées après correction : ema proche du ratio, écart type petit (~0,02-0,04),
// p2/m2/p1/m1 cohérents avec ema±2×écart-type / ema±1×écart-type. Pas de colonnes
// "euphorie"/"panique" précalculées dans ce nouvel onglet fusionné (elles existaient
// dans l'ancien) — dérivées ici directement du ratio comparé aux bandes ±2σ, même
// seuil sémantique que l'ancien calcul Sheet.
function handleMacroCycleRowsFromSectoriels(rows){
  const col = { date:6, ratio:81, ema:82, p2:84, m2:85, p1:86, m1:87 };
  const out = { dates:[], ratio:[], ema:[], plus1:[], minus1:[], plus2:[], minus2:[], euphorie:[], panique:[] };
  for (let r = 2; r < rows.length; r++){
    const row = rows[r];
    if (!row) continue;
    const date = parseFrenchSheetDate(row[col.date]);
    const ratio = parseNum(row[col.ratio]);
    if (!date || ratio == null) continue;
    const plus2 = parseNum(row[col.p2]), minus2 = parseNum(row[col.m2]);
    out.dates.push(date);
    out.ratio.push(ratio);
    out.ema.push(parseNum(row[col.ema]));
    out.plus1.push(parseNum(row[col.p1]));
    out.minus1.push(parseNum(row[col.m1]));
    out.plus2.push(plus2);
    out.minus2.push(minus2);
    out.euphorie.push(plus2 != null && ratio > plus2 ? 1 : 0);
    out.panique.push(minus2 != null && ratio < minus2 ? 1 : 0);
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
  document.getElementById('zoomModal').style.display = 'flex';
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), buildMacroWeightChartConfig());
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

function loadMacroPowerData(retried){
  loadSheetDual(MACRO_POWER_GID, '__handleMacroPowerGviz', handleMacroPowerRows);
  // Ni le CSV ni le gviz n'ont d'état d'erreur visible en cas d'échec silencieux des deux
  // méthodes (throttle réseau, timeout — constaté en test, intermittent) — jamais
  // d'échec silencieux (convention du projet). Après le délai de secours de
  // loadSheetDual (9s), si toujours rien : UN réessai automatique (échec intermittent,
  // un second essai a de bonnes chances de passer), puis seulement si celui-ci échoue
  // aussi, message explicite plutôt qu'un tableau/graphique qui reste vide sans
  // explication.
  setTimeout(() => {
    if (macroPowerData) return;
    if (!retried){ loadMacroPowerData(true); return; }
    const box = document.getElementById('macroPowerTable');
    if (box) box.innerHTML = '<div class="objectifs-empty">Données indisponibles pour l\'instant (échec réseau) — clique sur ↻ Mettre à jour pour réessayer.</div>';
  }, 10000);
}

// Parsing par RECONNAISSANCE DE CONTENU (plus par position de ligne fixe — l'exception
// documentée à l'origine s'est révélée fausse : gviz et CSV ne compressent pas les
// lignes vides de la même façon sur ce fichier, voir "Pièges techniques" point 10, donc
// une ligne 15 fixe pointait vers autre chose selon la méthode de chargement gagnante,
// ce qui a fait disparaître silencieusement "Classement"/"Power 1 ans"/"Power 3 mois"/
// "1 moi"/"2 mois"/"3 mois" — bug constaté en test). headerRow = première ligne dont une
// cellule des colonnes Q à AA se termine par "(%)" ; catRow = la ligne juste au-dessus
// (toujours adjacente, la compression de lignes vides ne change pas l'ordre relatif) ;
// dataRows = toute ligne sous headerRow avec un libellé en colonne P ET au moins une
// valeur numérique en Q..AA (exclut les lignes de libellé sans données).
function handleMacroPowerRows(rows){
  const pIdx = colToIdx('P');
  const colStart = colToIdx('Q'), colEnd = colToIdx('AA');
  let headerRowIdx = -1;
  for (let r = 0; r < rows.length; r++){
    const row = rows[r];
    if (!row) continue;
    for (let c = colStart; c <= colEnd; c++){
      if (/\(%\)\s*$/.test(parseStr(row[c]))){ headerRowIdx = r; break; }
    }
    if (headerRowIdx >= 0) break;
  }
  if (headerRowIdx < 0) return;
  const headerRow = rows[headerRowIdx];
  // Re-vérifié sur le CSV réel (gid 30985186) : la ligne juste au-dessus des noms de
  // secteur contient les TICKERS (XLK/XLV/...), pas la catégorie Sensible/Défensif/
  // Cyclique — celle-ci est encore une ligne plus haut. Avant ce correctif, les tickers
  // s'affichaient à tort comme catégorie sous chaque secteur.
  const catRow = rows[headerRowIdx - 2] || [];
  const categories = [], headers = [];
  for (let c = colStart; c <= colEnd; c++){
    categories.push(parseStr(catRow[c]));
    headers.push(parseStr(headerRow[c]));
  }
  const dataRows = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++){
    const row = rows[r];
    if (!row) continue;
    const label = parseStr(row[pIdx]);
    if (!label) continue;
    const values = [];
    let hasNumber = false;
    for (let c = colStart; c <= colEnd; c++){
      const v = parseNum(row[c]);
      if (v != null) hasNumber = true;
      values.push(v);
    }
    if (!hasNumber) continue;
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
// Étendu à toutes les lignes de performance brute du tableau Force Relative (au-delà du
// seul Classement pondéré + 1/2/3 mois) — demande explicite pour comparer aussi sur
// 6 mois et 1/2/3 ans, mêmes libellés exacts que les lignes du Sheet (dont le typo
// "1 moi" volontairement conservé, voir CLAUDE.md).
const MACRO_RANKING_OPTIONS = [['Classement','Classement'],['1 moi','1 mois'],['2 mois','2 mois'],['3 mois','3 mois'],['6 mois','6 mois'],['1 ans','1 an'],['2 ans','2 ans'],['3 ans','3 ans']];
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
// Bug remonté (export PDF Analyse/Macro complète : graphiques absents) : `chart.resize()`
// sans argument redimensionne le canvas sur la taille COURANTE de son conteneur, telle
// que Chart.js/le navigateur la connaît à cet instant précis — dépend donc d'un
// ResizeObserver ayant déjà eu l'occasion de tourner. Constaté en test : un canvas peut
// se retrouver avec une taille de 0×0 (donc `toBase64Image()` renvoie l'image cassée
// "data:," ) si ce cycle n'a pas encore eu lieu, ce qui produit un bloc PDF vide sans
// erreur visible. Fix : lire la taille RÉELLE du conteneur DOM (`getBoundingClientRect`)
// et la passer explicitement à `resize(w, h)`, qui ne dépend d'aucun cycle implicite.
function chartToHiResDataUrl(chart, mime, scale){
  if (!chart) return null;
  const original = chart.options.devicePixelRatio || window.devicePixelRatio || 1;
  const HI_RES = scale || 3;
  const bump = original < HI_RES;
  const holder = chart.canvas && chart.canvas.parentElement;
  const rect = holder ? holder.getBoundingClientRect() : null;
  if (bump) chart.options.devicePixelRatio = HI_RES;
  if (rect && rect.width > 0 && rect.height > 0) chart.resize(rect.width, rect.height);
  else chart.resize();
  let dataUrl = chart.toBase64Image(mime || 'image/png', 1.0);
  if (dataUrl === 'data:,') dataUrl = null; // canvas toujours à 0×0 malgré tout — on omet plutôt qu'embarquer une image cassée
  if (bump) chart.options.devicePixelRatio = original;
  chart.resize();
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
// Panier d'export groupé (#exportCartWidget) : ajouter des graphiques depuis N'IMPORTE
// QUELLE page via le bouton "🧺 Ajouter au PDF groupé" de la modale de zoom générique,
// puis les exporter tous dans un seul PDF, dans l'ordre de sélection — demande explicite
// de l'utilisateur ("un qui est de la macroéconomie, un qui est le chiffre d'affaires...
// bien les mettre dans le même ordre qu'on les sélectionne"). Capture l'image AU MOMENT
// de l'ajout (pas une référence live au chart Chart.js) : le graphique source peut être
// détruit/recréé (changement d'entreprise, de page, fermeture de la modale...) bien avant
// l'export final — seul l'array `exportCart` doit survivre à la navigation.
let exportCart = [];
let exportCartClearConfirming = false;

// Capture générique d'une instance Chart.js vivante vers le panier — utilisée à la fois
// par le bouton de la modale de zoom (addCurrentZoomChartToCart) et par les petites
// icônes 🧺 posées directement sur chaque carte de graphique (Analyse/Macro/Valorisation),
// pour ajouter sans avoir à ouvrir le zoom. `btnEl` optionnel : retour visuel (✓/⚠) sur le
// bouton effectivement cliqué.
function addChartInstanceToCart(chart, title, btnEl){
  if (!chart){
    if (btnEl) flashCartBtn(btnEl, false);
    else alert("Le graphique n'a pas pu être généré — réessaie de l'ouvrir en grand.");
    return;
  }
  let dataUrl;
  // Canvas potentiellement "tainté" (donut Portfolio, logos dessinés sans crossOrigin —
  // voir CLAUDE.md piège #13) : toBase64Image lève alors SecurityError.
  try{ dataUrl = chartToHiResDataUrl(chart, 'image/png', 2); }
  catch(e){ alert("Ce graphique ne peut pas être ajouté au panier (image externe non compatible) — utilise le bouton d'export dédié de son onglet."); return; }
  if (!dataUrl){ if (btnEl) flashCartBtn(btnEl, false); return; }
  exportCart.push({ title, dataUrl });
  renderExportCartWidget();
  if (btnEl) flashCartBtn(btnEl, true);
}
function flashCartBtn(btnEl, success){
  const original = btnEl.textContent;
  btnEl.textContent = success ? '✓' : '⚠';
  btnEl.classList.toggle('cart-btn-flash-ok', success);
  btnEl.classList.toggle('cart-btn-flash-err', !success);
  btnEl.disabled = true;
  setTimeout(() => {
    btnEl.textContent = original;
    btnEl.classList.remove('cart-btn-flash-ok', 'cart-btn-flash-err');
    btnEl.disabled = false;
  }, 1000);
}

function addCurrentZoomChartToCart(){
  if (!window.__zoomChart){ alert("Le graphique n'a pas pu être généré — ferme la modale et rouvre-la en grand."); return; }
  const title = document.getElementById('zoomTitle').textContent || 'Graphique';
  addChartInstanceToCart(window.__zoomChart, title, document.getElementById('zoomAddToCartBtn'));
}

function removeFromExportCart(idx){
  exportCart.splice(idx, 1);
  renderExportCartWidget();
}

function renderExportCartWidget(){
  const widget = document.getElementById('exportCartWidget');
  const countEl = document.getElementById('exportCartCount');
  const listEl = document.getElementById('exportCartList');
  const exportBtn = document.getElementById('exportCartExportBtn');
  const clearBtn = document.getElementById('exportCartClearBtn');
  if (!widget) return;
  widget.style.display = exportCart.length > 0 ? 'block' : 'none';
  countEl.textContent = exportCart.length;
  exportBtn.disabled = exportCart.length === 0;
  listEl.innerHTML = exportCart.length === 0
    ? '<div class="export-cart-empty">Aucun graphique sélectionné</div>'
    : exportCart.map((item, i) => `
      <div class="export-cart-item">
        <span class="export-cart-item-num">${i + 1}</span>
        <span class="export-cart-item-title">${item.title}</span>
        <button class="export-cart-item-remove" data-cart-remove="${i}" title="Retirer">✕</button>
      </div>`).join('');
  if (clearBtn) clearBtn.textContent = exportCartClearConfirming ? 'Confirmer ?' : 'Vider';
}

// Titre du document éditable par l'utilisateur (#exportCartTitleInput) : demande
// explicite — l'utilisateur veut un document présentable en newsletter, pas le libellé
// technique "Export groupé" imposé par défaut. Mémorisé le temps de la session
// (exportCartTitle) pour ne pas se réinitialiser à chaque ajout/retrait d'un graphique.
let exportCartTitle = '';
function exportCartAsPdf(){
  if (exportCart.length === 0) return;
  const title = exportCartTitle.trim() || 'Wolf Analysis';
  const body = exportCart.map(item =>
    `<div class="print-section"><h3>${item.title}</h3><img class="print-chart-img" src="${item.dataUrl}" alt=""></div>`
  ).join('');
  exportSectionAsPdf(title, `${exportCart.length} graphique${exportCart.length > 1 ? 's' : ''}`, body);
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
    const url = chartToPrintDataUrl(chart);
    if (!url) return '';
    return `<div class="print-section"><h3>${title}</h3><img class="print-chart-img" src="${url}" alt=""></div>`;
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
// Export individuel d'un graphique de scénario — la page Valorisation n'avait jusque là
// que l'export PDF de la page entière, pas de PNG/JPEG par scénario comme sur Macro et
// Analyse (demande explicite).
function exportScenarioChartAsPdf(key){
  const chart = scenarioCharts[key];
  if (!chart) return;
  const s = SCENARIOS.find(sc => sc.key === key);
  const logo = companyLogoUrl(activeCompany);
  const body = `<div class="print-section"><img class="print-chart-img" src="${chartToHiResDataUrl(chart)}" alt=""></div>`;
  exportSectionAsPdf((s ? s.label : key), activeCompany, body, logo);
}
async function exportScenarioChartAsImage(key, format){
  const chart = scenarioCharts[key];
  if (!chart) return;
  const s = SCENARIOS.find(sc => sc.key === key);
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const rawUrl = chartToHiResDataUrl(chart, mime);
  const url = await roundedImageDataUrl(rawUrl, mime, format === 'jpg' ? '#151A1F' : null);
  const filename = (activeCompany || 'entreprise') + '-' + (s ? s.key : key);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.toLowerCase().replace(/\s+/g, '-') + '.' + (format === 'jpg' ? 'jpg' : 'png');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
function exportMacroTableAsPdf(boxId, title){
  const box = document.getElementById(boxId);
  if (!box) return;
  exportSectionAsPdf(title, null, `<div class="print-section">${box.innerHTML}</div>`);
}
// Rendu manuel du <table> vers un <canvas> (pas de librairie externe, même principe que
// le reste du site — voir "Choix technique" du print CSS) : les tableaux macro n'avaient
// jusqu'ici qu'un export PDF, pas PNG/JPEG comme tous les graphiques (demande explicite,
// "je n'ai pas la possibilité d'exporter mon PNG et JPEG" sur ces deux tableaux
// précisément). getComputedStyle() lit directement les couleurs déjà résolues par les
// classes CSS existantes (ex. mp-red-strong/mp-green-light sur Force Relative) — aucune
// couleur recopiée à la main, donc jamais désynchronisé si les seuils changent.
function tableToImageDataUrl(tableEl, title){
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (!rows.length) return null;
  const grid = rows.map(tr => Array.from(tr.children));
  const nCols = Math.max(...grid.map(r => r.length));
  const scale = 2;
  const padX = 14, rowH = 30, headH = 34, titleH = 56, footH = 34;
  // Largeur de colonne = texte le plus large de cette colonne (mesuré une fois avec un
  // contexte de mesure temporaire), colonne 0 plus large (libellés de ligne).
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  const colW = new Array(nCols).fill(70);
  grid.forEach(r => r.forEach((cell, ci) => {
    const cs = getComputedStyle(cell);
    mctx.font = (cs.fontWeight >= 600 ? '700 ' : '400 ') + '12px "Plus Jakarta Sans", sans-serif';
    const w = mctx.measureText(cell.textContent.trim()).width + padX * 2;
    if (w > colW[ci]) colW[ci] = w;
  }));
  const totalW = colW.reduce((a, b) => a + b, 0);
  const totalH = titleH + rows.length * rowH + footH + 10;
  const canvas = document.createElement('canvas');
  canvas.width = totalW * scale; canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#0D1013';
  ctx.fillRect(0, 0, totalW, totalH);
  ctx.fillStyle = THEME.gold;
  ctx.font = '700 16px "Space Grotesk", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, padX, titleH / 2 + 6);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(0, titleH); ctx.lineTo(totalW, titleH); ctx.stroke();
  let y = titleH;
  grid.forEach((r, ri) => {
    const isHead = ri === 0;
    const h = isHead ? headH : rowH;
    let x = 0;
    r.forEach((cell, ci) => {
      const cs = getComputedStyle(cell);
      const bg = cs.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'){
        ctx.fillStyle = bg;
        ctx.fillRect(x, y, colW[ci], h);
      } else if (!isHead && ri % 2 === 0){
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(x, y, colW[ci], h);
      }
      ctx.fillStyle = isHead ? '#8B93A0' : (cs.color || '#E9EBEE');
      ctx.textAlign = ci === 0 ? 'left' : 'center';
      const tx = ci === 0 ? x + padX : x + colW[ci] / 2;
      // Les en-têtes ont un sous-libellé imbriqué (.mp-cat, ex. "SENSIBLE" sous
      // "Technologie (%)") — cell.textContent les concatène sans séparateur ; on les
      // sépare en 2 lignes distinctes plutôt que de les coller.
      const catEl = isHead ? cell.querySelector('.mp-cat') : null;
      if (catEl){
        const mainText = cell.textContent.replace(catEl.textContent, '').trim();
        ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(mainText, tx, y + h / 2 - 7, colW[ci] - padX);
        ctx.fillStyle = '#5C6470';
        ctx.font = '400 8px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(catEl.textContent.trim(), tx, y + h / 2 + 7, colW[ci] - padX);
      } else {
        ctx.font = (isHead ? '700 10px' : (ci === 0 ? '600 12px' : '400 12px')) + ' "Plus Jakarta Sans", sans-serif';
        ctx.fillText(cell.textContent.trim(), tx, y + h / 2, colW[ci] - padX);
      }
      x += colW[ci];
    });
    y += h;
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(totalW, y); ctx.stroke();
  ctx.fillStyle = '#5C6470';
  ctx.font = '400 10px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Données fournies par Wolf Analysis', padX, y + footH / 2 + 4);
  return canvas.toDataURL('image/png');
}
// Agrandir un tableau macro (Force relative / Fondamentaux) et l'ajouter au panier
// d'export groupé — demandé explicitement, ces 2 tableaux n'avaient jusqu'ici que
// l'export PDF/PNG/JPG direct, pas de zoom ni d'accès au panier. Réutilise le rendu
// canvas déjà en place (tableToImageDataUrl) : pas de nouveau composant, juste la
// lightbox image existante (#imageZoomModal, déjà utilisée par le Cerveau numérique).
function zoomMacroTable(boxId, title){
  const box = document.getElementById(boxId);
  const tableEl = box && box.querySelector('table');
  if (!tableEl) return;
  const url = tableToImageDataUrl(tableEl, title);
  if (url) openImageZoom(url);
}
function addMacroTableToCart(boxId, title, btnEl){
  const box = document.getElementById(boxId);
  const tableEl = box && box.querySelector('table');
  const dataUrl = tableEl ? tableToImageDataUrl(tableEl, title) : null;
  if (!dataUrl){ flashCartBtn(btnEl, false); return; }
  exportCart.push({ title, dataUrl });
  renderExportCartWidget();
  flashCartBtn(btnEl, true);
}
async function exportMacroTableAsImage(boxId, title, format){
  const box = document.getElementById(boxId);
  const tableEl = box && box.querySelector('table');
  if (!tableEl) return;
  const rawUrl = tableToImageDataUrl(tableEl, title);
  if (!rawUrl) return;
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const url = await roundedImageDataUrl(rawUrl, mime, format === 'jpg' ? '#0D1013' : null);
  const a = document.createElement('a');
  a.href = url;
  a.download = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '.' + (format === 'jpg' ? 'jpg' : 'png');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
    const url = chartToPrintDataUrl(chart);
    if (!url) return '';
    return `<div class="print-section"><h3>${title}</h3><img class="print-chart-img" src="${url}" alt=""></div>`;
  }).join('');
  const tableHtml = MACRO_EXPORT_ALL_TABLES.map(([id, title]) => {
    const box = document.getElementById(id);
    if (!box || !box.querySelector('table')) return '';
    return `<div class="print-section"><h3>${title}</h3>${box.innerHTML}</div>`;
  }).join('');
  exportSectionAsPdf('Macroéconomie', "Vue d'ensemble — graphiques et tableaux", chartHtml + tableHtml);
}

// Indicateurs macro US (PIB, taux, inflation) : lus depuis l'onglet Sheet "DASHBOARD
// CYCLE" (table maintenue à la main par l'utilisateur) plutôt que les API BEA/FRED en
// direct — décision explicite de l'utilisateur après les problèmes de fiabilité
// réseau constatés cette session ("ne pas aller chercher les données macro sur le
// site de la FRED, ça ne fonctionne pas"). Plus de fetch réseau séparé ici : la table
// arrive déjà dans le même JSON que tout le reste (voir loadAllDataFromAppsScript).
let macroFundamentalsData = null;

// Recherche de contenu (jamais de position fixe, voir "Pièges techniques" #10) :
// repère la ligne d'en-tête via la cellule "C (%)", en déduit la position des autres
// colonnes par leur propre libellé (robuste à un éventuel décalage de colonne/ligne).
// Pas de PIB niveau/croissance dans cette table (contrairement aux données BEA
// précédemment utilisées) — ces deux champs restent à null, la colonne s'affichera
// "N/D" plutôt que d'inventer une valeur.
function parseMacroFundamentalsFromDashboard(rows){
  let headerRow = -1, cCol = -1;
  for (let r = 0; r < rows.length; r++){
    const row = rows[r];
    if (!row) continue;
    const idx = row.findIndex(cell => String(cell).trim() === 'C (%)');
    if (idx !== -1){ headerRow = r; cCol = idx; break; }
  }
  if (headerRow === -1) return null;
  const header = rows[headerRow];
  const findCol = label => header.findIndex(cell => String(cell).trim() === label);
  const col = {
    c: cCol,
    i: findCol('I (%)'),
    g: findCol('G (%)'),
    trade: findCol('X-M Billions of Dollars'),
    taux10: findCol('Taux à 10 ans (%)'),
    taux2: findCol('Taux à 2 ans (%)'),
    spread: findCol('Spreed 10-2Y (%)'),
    inflation: findCol('Inflation (%)'),
    realRate: findCol('Taux réel (%)')
  };
  const out = [];
  for (let r = headerRow + 1; r < rows.length; r++){
    const row = rows[r];
    if (!row) continue;
    // Le libellé trimestre ("Q1 2025") est quelques colonnes avant "C (%)" sur cette
    // ligne — recherche de contenu (regex) plutôt qu'un décalage fixe.
    const quarterCell = row.slice(0, col.c).reverse().find(v => /^Q[1-4]\s+\d{4}$/.test(String(v).trim()));
    if (!quarterCell) continue;
    out.push({
      quarter: String(quarterCell).trim(),
      gdp: null, gdpGrowth: null,
      c: parseNum(row[col.c]), i: parseNum(row[col.i]), g: parseNum(row[col.g]),
      trade: parseNum(row[col.trade]),
      taux10: parseNum(row[col.taux10]), taux2: parseNum(row[col.taux2]),
      spread: parseNum(row[col.spread]),
      inflation: parseNum(row[col.inflation]),
      realRate: parseNum(row[col.realRate])
    });
  }
  return out.length ? out : null;
}

function renderMacroFundamentalsError(){
  const box = document.getElementById('macroFundamentalsTable');
  if (box) box.innerHTML = `<p class="macro-fund-note">Impossible de trouver la table des indicateurs macro dans
    l'onglet "DASHBOARD CYCLE" du Sheet (libellé "C (%)" introuvable) — vérifie que la table n'a pas été déplacée
    ou renommée.</p>`;
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
    <p class="macro-fund-note" style="margin-top:10px;">Source : table "DASHBOARD CYCLE" du Sheet, maintenue
    manuellement — PIB (niveau/croissance) non disponible dans cette table.</p>`;
}

// Palette or/bleu (contrainte design system : jamais de violet, réservé au décoratif —
// voir CLAUDE.md). Revue suite à un retour explicite ("plusieurs teintes se
// ressemblent") : les 10 tons alternaient déjà or/bleu, mais les luminosités
// progressaient de façon quasi continue au sein de chaque famille, donc deux tons de
// même famille proches dans le tableau restaient difficiles à distinguer sur un petit
// segment de camembert. Luminosités volontairement non-monotones par famille (clair,
// très sombre, moyen, très clair, moyen-sombre) pour maximiser l'écart perçu entre
// segments voisins, quel que soit le nombre de positions du portefeuille.
const PORTFOLIO_COLORS = ['#E8B54D','#2D6FA8','#7A4F0E','#6FB8EA','#F5D896','#0F2A42','#C68A1F','#AEDBFA','#9C6A16','#164A73'];
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

// Bug remonté : sur un export à PLUSIEURS graphiques (page Analyse/Macro complète),
// les images de graphique n'apparaissaient pas dans le PDF alors que le texte/les
// tableaux s'affichaient bien. Cause trouvée : window.print() était appelé de façon
// SYNCHRONE juste après avoir posé les <img src="data:..."> dans le DOM — même une
// image en data URI (donc déjà "chargée" en mémoire) prend un tick asynchrone pour être
// décodée/mise en page par le navigateur avant de pouvoir être peinte à l'impression.
// Sur un export à une seule image, le navigateur a presque toujours le temps de
// rattraper avant que la boîte de dialogue d'impression ne se construise (d'où
// l'impression que ça marchait) ; sur 9 images cumulées (Analyse complète) ou 4+tableaux
// (Macro complète), la probabilité qu'au moins une ne soit pas encore décodée au moment
// du print() grimpe fortement. Fix : attendre que toutes les <img> du bloc à imprimer
// aient chargé (ou échoué) avant d'appeler window.print(), avec un filet de sécurité
// (timeout) pour ne jamais bloquer l'impression indéfiniment si une image traîne.
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

  const imgs = Array.from(area.querySelectorAll('img'));
  const waits = imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => {
    img.addEventListener('load', res, { once:true });
    img.addEventListener('error', res, { once:true });
  }));
  Promise.race([
    Promise.all(waits),
    new Promise(res => setTimeout(res, 4000)) // filet de sécurité, jamais de blocage indéfini
  ]).then(() => window.print());
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
  document.getElementById('zoomModal').style.display = 'flex';
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), config);
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

// Panier : le donut affiché est tainté (logos de position sans crossOrigin, voir plus
// haut), donc addChartInstanceToCart() échouerait sur portfolioDonutChart directement —
// on réutilise le même graphique jetable hors-écran que l'export PDF.
async function addPortfolioDonutToCart(btnEl){
  const holdings = portfolioData.holdings.filter(h => h.valorisation != null && h.valorisation > 0);
  if (!holdings.length){ flashCartBtn(btnEl, false); return; }
  const imgHtml = await buildPortfolioExportChartImg(holdings);
  const match = imgHtml.match(/src="([^"]+)"/);
  if (!match){ flashCartBtn(btnEl, false); return; }
  exportCart.push({ title:'Répartition — Wolf Portfolio', dataUrl: match[1] });
  renderExportCartWidget();
  flashCartBtn(btnEl, true);
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
    // Repli initiale/emoji si l'entreprise n'est pas dans la base suivie (même pattern
    // qu'à l'écran, portfolioHoldingsList) — sans repli, une position type "S&P Global"
    // ou "Mastercard" (pas dans DATA BASE 20 ans) n'affichait RIEN, ce qui donnait
    // l'impression que le logo manquait partout alors que seules les entreprises
    // suivies en ont un.
    const logo = companyLogoUrl(h.nom);
    const logoImg = logo
      ? `<img class="print-inline-logo" src="${logo}" alt="">`
      : `<span class="print-inline-logo-fallback">${h.nom.toUpperCase() === 'CASH' ? '💶' : h.nom.charAt(0).toUpperCase()}</span>`;
    return `<tr><td>${logoImg}${h.nom}</td><td>${pct.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</td><td>${h.perf != null ? (h.perf >= 0 ? '+' : '') + fmtPct(h.perf) : '—'}</td></tr>`;
  }).join('');
  const table = `<div class="print-section"><h3>Positions</h3><table class="print-table"><thead><tr><th>Entreprise</th><th>Poids</th><th>Performance</th></tr></thead><tbody>${rows}</tbody></table></div>`;

  exportSectionAsPdf('Wolf Portfolio — Composition', null, summary + chartSection + table);
}

let portfolioVsSpxChart = null;
// "2026-04-05T22:00:00.000Z" -> "Avr. 2026" — le Sheet renvoie des dates ISO complètes
// (voir loadAllDataFromAppsScript) utilisées telles quelles comme labels d'axe X avant
// ce correctif : illisible, retour utilisateur explicite ("les dates... on n'y comprend
// rien du tout"). Mois abrégé en français, capitalisé (toLocaleDateString le renvoie en
// minuscules).
function fmtMonthLabel(iso){
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const s = d.toLocaleDateString('fr-FR', { month:'short', year:'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildPortfolioVsSpxConfig(monthly){
  return {
    type:'line',
    data:{
      labels: monthly.map(m => fmtMonthLabel(m.mois)),
      datasets:[
        { label:'Wolf Portfolio', data: monthly.map(m => m.rendementTotal), borderColor:THEME.gold, backgroundColor:'rgba(217,164,65,0.08)', fill:true, tension:0.2, pointRadius:2, spanGaps:true },
        { label:'S&P 500', data: monthly.map(m => m.spxPerfTotale), borderColor:THEME.blue, borderWidth:1.5, pointRadius:2, tension:0.2, spanGaps:true }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true } } },
      scales:{
        x:{ grid:{display:false}, ticks:{color:THEME.dim, maxRotation:0, autoSkipPadding:12}, border:{color:THEME.hair} },
        y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'%'} }
      }
    }
  };
}
function buildPortfolioVsSpxMonthlyConfig(monthly){
  return {
    type:'line',
    data:{
      labels: monthly.map(m => fmtMonthLabel(m.mois)),
      datasets:[
        { label:'Wolf Portfolio', data: monthly.map(m => m.rendementMensuel), borderColor:THEME.gold, backgroundColor:'rgba(217,164,65,0.08)', fill:true, tension:0.25, pointRadius:3, spanGaps:true },
        { label:'S&P 500', data: monthly.map(m => m.spxPerfMensuelle), borderColor:THEME.blue, borderWidth:1.5, pointRadius:3, tension:0.25, spanGaps:true }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true } } },
      scales:{
        x:{ grid:{display:false}, ticks:{color:THEME.dim, maxRotation:0, autoSkipPadding:12}, border:{color:THEME.hair} },
        y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'%'} }
      }
    }
  };
}
function renderPortfolioVsSpx(){
  const canvas = document.getElementById('chartPortfolioVsSpx');
  if (!canvas) return;
  if (portfolioVsSpxChart) portfolioVsSpxChart.destroy();
  // Le Sheet a des lignes de mois pré-remplies au-delà du mois courant (dates futures
  // sans données) — on ne garde que les mois où au moins une des deux séries a une valeur.
  const monthly = portfolioData.monthly.filter(m => m.rendementTotal != null || m.spxPerfTotale != null);
  if (!monthly.length) return;
  portfolioVsSpxChart = new Chart(canvas.getContext('2d'), buildPortfolioVsSpxConfig(monthly));
}
function openPortfolioVsSpxZoom(){
  const monthly = portfolioData.monthly.filter(m => m.rendementTotal != null || m.spxPerfTotale != null);
  if (!monthly.length) return;
  document.getElementById('zoomTitle').textContent = 'Wolf Portfolio vs S&P 500 — Performance cumulée';
  document.getElementById('zoomRangeRow').innerHTML = '';
  document.getElementById('zoomCagrRow').innerHTML = '';
  document.getElementById('zoomStockIndicatorRow').style.display = 'none';
  zoomKey = null;
  if (window.__zoomChart) window.__zoomChart.destroy();
  document.getElementById('zoomModal').style.display = 'flex';
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), buildPortfolioVsSpxConfig(monthly));
}

let portfolioVsSpxMonthlyChart = null;
function renderPortfolioVsSpxMonthly(){
  const canvas = document.getElementById('chartPortfolioVsSpxMonthly');
  if (!canvas) return;
  if (portfolioVsSpxMonthlyChart) portfolioVsSpxMonthlyChart.destroy();
  const monthly = portfolioData.monthly.filter(m => m.rendementMensuel != null || m.spxPerfMensuelle != null);
  if (!monthly.length) return;
  portfolioVsSpxMonthlyChart = new Chart(canvas.getContext('2d'), buildPortfolioVsSpxMonthlyConfig(monthly));
}
function openPortfolioVsSpxMonthlyZoom(){
  const monthly = portfolioData.monthly.filter(m => m.rendementMensuel != null || m.spxPerfMensuelle != null);
  if (!monthly.length) return;
  document.getElementById('zoomTitle').textContent = 'Wolf Portfolio vs S&P 500 — Performance mensuelle';
  document.getElementById('zoomRangeRow').innerHTML = '';
  document.getElementById('zoomCagrRow').innerHTML = '';
  document.getElementById('zoomStockIndicatorRow').style.display = 'none';
  zoomKey = null;
  if (window.__zoomChart) window.__zoomChart.destroy();
  document.getElementById('zoomModal').style.display = 'flex';
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), buildPortfolioVsSpxMonthlyConfig(monthly));
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
   PORTEFEUILLE PERSO (PEA + CTO) — rendu. Composition en donut
   Chart.js standard (pas les plugins de logos custom du Wolf
   Portfolio — inutile ici, les logos suffisent dans la liste de
   positions, réutilise le même pattern que portfolioHoldingsList)
   + évolution vs CAC 40 (valeur de part, base 100, déjà calculée
   dans le Sheet — pas de recalcul) + comparaison PEA/CTO en tête.
   ============================================================ */
// Capital investi/gains dérivés des positions (valeurAchat/perfEur, déjà calculés par
// le Sheet), PAS d'une somme des versements mensuels : le suivi mensuel ne remonte pas
// forcément jusqu'au tout premier apport (vu en test — "Valeur après flux" de mars
// dépassait largement le seul versement de mars, preuve d'un capital déjà présent avant
// le début du journal mensuel). Le coût d'acquisition par position est la source fiable.
function persoAccountStats(block){
  const positions = block.positions.filter(p => p.nom.toUpperCase() !== 'CASH');
  // "Valeur d'achat total" du Sheet (positions + cash réellement apporté au compte) est
  // la source la plus fiable quand disponible — la somme des coûts d'acquisition par
  // position (repli) sous-estime le capital investi si une partie est restée en cash
  // (constaté sur le CTO : 6 180€ au total contre ~5 039€ de somme positions seules).
  const capitalInvesti = block.capitalInvestiTotal != null ? block.capitalInvestiTotal : positions.reduce((s, p) => s + (p.valeurAchat || 0), 0);
  const valorisationActuelle = block.valorisationTotale;
  const gainsEuros = positions.reduce((s, p) => s + (p.perfEur || 0), 0);
  const gainsPct = capitalInvesti ? (gainsEuros / capitalInvesti * 100) : null;
  return { capitalInvesti, valorisationActuelle, gainsEuros, gainsPct };
}

function renderPersoCompare(){
  const box = document.getElementById('persoCompareGrid');
  if (!box) return;
  const peaStats = persoAccountStats(persoData.pea);
  const ctoStats = persoAccountStats(persoData.cto);
  const total = (peaStats.valorisationActuelle || 0) + (ctoStats.valorisationActuelle || 0);
  const block = (label, stats) => {
    const poids = total ? ((stats.valorisationActuelle || 0) / total * 100) : null;
    const perfClass = stats.gainsPct == null ? '' : (stats.gainsPct >= 0 ? 'pos' : 'neg');
    return `<div class="chart-card">
      <h3>${label}</h3>
      <div class="ratio-grid" style="grid-template-columns:repeat(2,1fr);margin-top:10px;">
        <div class="ratio-card"><div class="k">Valorisation actuelle</div><div class="v">${stats.valorisationActuelle != null ? fmtEUR(stats.valorisationActuelle, 0) : 'N/D'}</div></div>
        <div class="ratio-card"><div class="k">Performance</div><div class="v ${perfClass}">${stats.gainsPct != null ? (stats.gainsPct >= 0 ? '+' : '') + fmtPct(stats.gainsPct) : 'N/D'}</div></div>
        <div class="ratio-card"><div class="k">Poids dans le total</div><div class="v">${poids != null ? fmtPct(poids) : 'N/D'}</div></div>
        <div class="ratio-card"><div class="k">Capital investi</div><div class="v">${fmtEUR(stats.capitalInvesti, 0)}</div></div>
      </div>
    </div>`;
  };
  box.innerHTML = block('PEA — Crédit Agricole', peaStats) + block('CTO — Saxo', ctoStats);
}

function renderPersoAccountSummary(prefix, block){
  const box = document.getElementById(prefix + 'Summary');
  if (!box) return;
  const stats = persoAccountStats(block);
  const perfClass = stats.gainsPct == null ? '' : (stats.gainsPct >= 0 ? 'pos' : 'neg');
  box.innerHTML = `
    <div class="ratio-card"><div class="k">Capital investi</div><div class="v">${fmtEUR(stats.capitalInvesti, 0)}</div></div>
    <div class="ratio-card"><div class="k">Valorisation actuelle</div><div class="v">${stats.valorisationActuelle != null ? fmtEUR(stats.valorisationActuelle, 0) : 'N/D'}</div></div>
    <div class="ratio-card"><div class="k">Gains / pertes</div><div class="v ${perfClass}">${stats.gainsEuros != null ? (stats.gainsEuros >= 0 ? '+' : '') + fmtEUR(stats.gainsEuros, 0) : 'N/D'}</div></div>
    <div class="ratio-card"><div class="k">Performance</div><div class="v ${perfClass}">${stats.gainsPct != null ? (stats.gainsPct >= 0 ? '+' : '') + fmtPct(stats.gainsPct) : 'N/D'}</div></div>`;
}

function renderPersoHoldingsList(prefix, block){
  const box = document.getElementById(prefix + 'HoldingsList');
  if (!box) return;
  const holdings = block.positions.filter(h => h.valorisation != null);
  const total = holdings.reduce((s, h) => s + h.valorisation, 0);
  box.innerHTML = holdings.length ? holdings
    .slice().sort((a, b) => b.valorisation - a.valorisation)
    .map(h => {
      const pct = total ? (h.valorisation / total * 100) : 0;
      const logo = companyLogoUrl(h.nom);
      const swatch = PORTFOLIO_COLORS[holdings.indexOf(h) % PORTFOLIO_COLORS.length];
      const perfClass = h.perfPct == null ? '' : (h.perfPct >= 0 ? 'pos' : 'neg');
      return `<div class="portfolio-holding-row">
        <span class="portfolio-holding-swatch" style="background:${swatch}"></span>
        <div class="portfolio-holding-logo">${logo ? `<img src="${logo}" alt="">` : h.nom.toUpperCase() === 'CASH' ? `<span>💶</span>` : `<span>${h.nom.charAt(0).toUpperCase()}</span>`}</div>
        <div class="portfolio-holding-name">${h.nom}</div>
        <div class="portfolio-holding-pct">${pct.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</div>
        <div class="portfolio-holding-perf ${perfClass}">${h.perfPct != null ? (h.perfPct >= 0 ? '+' : '') + fmtPct(h.perfPct) : '—'}</div>
      </div>`;
    }).join('') : '<div class="objectifs-empty">Données indisponibles pour l\'instant.</div>';
}

// Logos directement sur les segments (mêmes plugins custom que le donut Wolf Portfolio,
// portfolioSegmentLogosPlugin() — générique, ne dépend pas de portfolioData) : demande
// explicite de l'utilisateur ("il faut mettre les logos des entreprises... si tu préfères
// avec des tirets si c'est plus visible"). Pas de logo central Wolf ici (contrairement au
// Wolf Portfolio) — 3 donuts sur le site avec le même centre serait redondant, non demandé.
// Légende à LOGOS, en dehors du graphique (pas les logos minuscules sur les segments,
// ni le texte seul de la légende Chart.js par défaut) — retour explicite : "des fois on
// n'arrive pas à les voir avec des petits traits comme des légendes". Simple liste HTML
// sous le donut, réutilise le même pattern logo/repli initiale que la liste de positions.
let persoDonutCharts = { pea:null, cto:null };
function buildPersoDonutConfig(prefix, block){
  const holdings = block.positions.filter(h => h.valorisation != null && h.valorisation > 0);
  if (!holdings.length) return null;
  const total = holdings.reduce((s, h) => s + h.valorisation, 0);
  // Logos sur les segments (portfolioSegmentLogosPlugin, même plugin que le donut Wolf
  // Portfolio) — manquant jusqu'ici malgré la légende à côté qui, elle, les affichait déjà :
  // bug signalé par l'utilisateur ("tu les as mis, mais pas sur le camembert").
  const logos = holdings.map(h => companyLogoUrl(h.nom));
  return {
    type:'doughnut',
    data:{ labels: holdings.map(h => h.nom), datasets:[{
      data: holdings.map(h => h.valorisation),
      backgroundColor: holdings.map((_, i) => PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length]),
      borderColor:THEME.hair, borderWidth:2,
      _logos: logos
    }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'46%',
      plugins:{ legend:{ display:false }, tooltip:{ position:'nearest', caretPadding:14, callbacks:{ label: ctx => {
        const pct = total ? (ctx.parsed / total * 100) : 0;
        return ctx.label + ' : ' + pct.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}) + '%';
      } } } }
    },
    plugins:[portfolioSegmentLogosPlugin()],
    _logos: logos
  };
}
function renderPersoDonutLegend(prefix, block){
  const box = document.getElementById(prefix + 'DonutLegend');
  if (!box) return;
  const holdings = block.positions.filter(h => h.valorisation != null && h.valorisation > 0);
  box.innerHTML = holdings.map((h, i) => {
    const logo = companyLogoUrl(h.nom);
    const swatch = PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length];
    return `<div class="donut-legend-chip">
      <span class="donut-legend-swatch" style="background:${swatch}"></span>
      <div class="donut-legend-logo">${logo ? `<img src="${logo}" alt="">` : h.nom.toUpperCase() === 'CASH' ? '<span>💶</span>' : `<span>${h.nom.charAt(0).toUpperCase()}</span>`}</div>
      <span class="donut-legend-name">${h.nom}</span>
    </div>`;
  }).join('');
}
function renderPersoDonut(prefix, block){
  const canvasId = 'chart' + prefix.charAt(0).toUpperCase() + prefix.slice(1) + 'Donut';
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (persoDonutCharts[prefix]) persoDonutCharts[prefix].destroy();
  const config = buildPersoDonutConfig(prefix, block);
  renderPersoDonutLegend(prefix, block);
  if (!config) return;
  persoDonutCharts[prefix] = new Chart(canvas.getContext('2d'), config);
  // Préchargement des logos avant premier dessin (loadImageCached résout même en cas
  // d'échec, avec null — voir portfolioImageCache) : sans ce .then(), le tout premier
  // rendu dessine avant que les images aient fini de charger, laissant les segments sans
  // logo jusqu'au prochain re-render.
  Promise.all(config._logos.map(loadImageCached)).then(() => {
    if (persoDonutCharts[prefix]) persoDonutCharts[prefix].update();
  });
}
function openPersoDonutZoom(prefix, block, label){
  const config = buildPersoDonutConfig(prefix, block);
  if (!config) return;
  document.getElementById('zoomTitle').textContent = 'Répartition — ' + label;
  document.getElementById('zoomRangeRow').innerHTML = '';
  document.getElementById('zoomCagrRow').innerHTML = '';
  document.getElementById('zoomStockIndicatorRow').style.display = 'none';
  zoomKey = null;
  if (window.__zoomChart) window.__zoomChart.destroy();
  document.getElementById('zoomModal').style.display = 'flex';
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), config);
  Promise.all(config._logos.map(loadImageCached)).then(() => {
    if (window.__zoomChart) window.__zoomChart.update();
  });
}

let persoVsCacCharts = { pea:null, cto:null };
function renderPersoVsCacChart(prefix, block, label){
  const canvasId = 'chart' + prefix.charAt(0).toUpperCase() + prefix.slice(1) + 'VsCac';
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (persoVsCacCharts[prefix]) persoVsCacCharts[prefix].destroy();
  const monthly = block.monthly.filter(m => m.valeurPart != null && m.valeurPartCac40 != null);
  if (!monthly.length) return;
  persoVsCacCharts[prefix] = new Chart(canvas.getContext('2d'), {
    type:'line',
    data:{
      // fmtMonthLabel() : labels bruts illisibles sinon (même bug déjà corrigé pour Wolf
      // Portfolio, jamais appliqué ici — signalé par l'utilisateur, "les dates elles sont
      // marquées bizarres").
      labels: monthly.map(m => fmtMonthLabel(m.mois)),
      datasets:[
        { label, data: monthly.map(m => m.valeurPart), borderColor:THEME.gold, backgroundColor:'rgba(217,164,65,0.08)', fill:true, tension:0.2, pointRadius:2, spanGaps:true },
        { label:'CAC 40', data: monthly.map(m => m.valeurPartCac40), borderColor:THEME.blue, borderWidth:1.5, pointRadius:2, tension:0.2, spanGaps:true }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true, color:THEME.dim } } },
      scales:{
        x:{ grid:{display:false}, ticks:{color:THEME.dim}, border:{color:THEME.hair} },
        y:{ grid:baseGrid, ticks:{color:THEME.dim} }
      }
    }
  });
}

// Vue d'ensemble globale (PEA + CTO + Cash + Immobilier) : demande explicite — voir où
// passe l'argent au global, pas seulement compte par compte. Cash = LDDS + Livret A,
// Immobilier = valorisation live agrégée (Corum, Pierreval santé...), tous deux lus
// directement depuis le Sheet dédié (voir parsePersoCashImmo), aucun recalcul de notre
// côté au-delà de la simple somme cash = LDDS + Livret A.
let persoOverviewChart = null;
function persoAccountValo(block){
  const stats = persoAccountStats(block);
  return stats.valorisationActuelle || 0;
}
function renderPersoOverview(){
  const summaryBox = document.getElementById('persoOverviewSummary');
  const canvas = document.getElementById('chartPersoOverview');
  if (!summaryBox || !canvas) return;
  const ci = persoData.cashImmo || {};
  const slices = [
    { label:'PEA', value: persoAccountValo(persoData.pea) },
    { label:'CTO', value: persoAccountValo(persoData.cto) },
    { label:'Cash (LDDS + Livret A)', value: ci.cashTotal || 0 },
    { label:'Immobilier', value: ci.immobilier || 0 }
  ].filter(s => s.value > 0);
  const total = slices.reduce((s, x) => s + x.value, 0);

  // "N/D" nu ne dit pas si la donnée est simplement absente du Sheet ou si le
  // chargement a échoué (timeout fetch() sur file://, voir refetchPersoSparseFieldsViaCsv)
  // — sans distinction, ça ressemble à un bug permanent plutôt qu'à un souci réseau
  // ponctuel. Message explicite + actionnable dans ce 2e cas (jamais d'échec silencieux).
  const sparseFail = '<span class="perso-load-fail" title="Échec du chargement (réseau) — recharge la page pour réessayer">Échec de chargement ⟳</span>';
  const cashDisplay = ci.cashTotal != null ? fmtEUR(ci.cashTotal, 0) : (persoSparseFieldsFailed ? sparseFail : 'N/D');
  const immoDisplay = ci.immobilier != null ? fmtEUR(ci.immobilier, 0) : (persoSparseFieldsFailed ? sparseFail : 'N/D');
  summaryBox.innerHTML = `
    <div class="ratio-card"><div class="k">Patrimoine total</div><div class="v">${fmtEUR(total, 0)}</div></div>
    <div class="ratio-card"><div class="k">Cash (LDDS + Livret A)</div><div class="v">${cashDisplay}</div></div>
    <div class="ratio-card"><div class="k">Immobilier</div><div class="v">${immoDisplay}</div></div>
    <div class="ratio-card"><div class="k">PEA + CTO</div><div class="v">${fmtEUR(persoAccountValo(persoData.pea) + persoAccountValo(persoData.cto), 0)}</div></div>`;

  if (persoOverviewChart) persoOverviewChart.destroy();
  if (!slices.length) return;
  persoOverviewChart = new Chart(canvas.getContext('2d'), {
    type:'doughnut',
    data:{ labels: slices.map(s => s.label), datasets:[{ data: slices.map(s => s.value), backgroundColor: slices.map((_, i) => PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length]), borderColor:THEME.hair, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'46%',
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true, color:THEME.dim, font:{size:10.5} } },
        tooltip:{ callbacks:{ label: ctx => {
          const pct = total ? (ctx.parsed / total * 100) : 0;
          return ctx.label + ' : ' + ctx.parsed.toLocaleString('fr-FR',{maximumFractionDigits:0}) + ' € (' + pct.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}) + '%)';
        } } } }
    }
  });
}

function renderPersoPortfolio(){
  persoData = persoUnlocked ? persoDataReal : PERSO_FAKE_DATA;
  renderPersoLockUI();
  renderPersoOverview();
  renderPersoCompare();
  renderPersoAccountSummary('pea', persoData.pea);
  renderPersoAccountSummary('cto', persoData.cto);
  renderPersoHoldingsList('pea', persoData.pea);
  renderPersoHoldingsList('cto', persoData.cto);
  renderPersoDonut('pea', persoData.pea);
  renderPersoDonut('cto', persoData.cto);
  renderPersoVsCacChart('pea', persoData.pea, 'PEA');
  renderPersoVsCacChart('cto', persoData.cto, 'CTO');
  applyPersoBlur();
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
function classementRowHtml(nom, logo, rank, valueText, cls, rendHtml, showAddBtn){
  const safe = nom.replace(/"/g,'&quot;');
  const inDividendPortfolio = showAddBtn && dividendPortfolioStore.positions[nom] != null;
  const addBtn = showAddBtn
    ? `<button class="classement-add-btn${inDividendPortfolio ? ' active' : ''}" data-action="dividend-add" data-nom="${safe}" title="${inDividendPortfolio ? 'Déjà dans le portefeuille dividende' : 'Ajouter au portefeuille dividende'}">${inDividendPortfolio ? '✓' : '+'}</button>`
    : '';
  return `<div class="classement-row${rendHtml ? ' classement-row-valo' : ''}" data-nom="${safe}">
    <div class="classement-row-main">
      <span class="classement-rank">${rank}</span>
      <div class="classement-logo"><img src="${logo || ''}" alt=""></div>
      <span class="classement-name">${nom}</span>
      <span class="classement-value${cls ? ' ' + cls : ''}">${valueText}</span>
      ${addBtn}
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

  divLeftBox.innerHTML = divLeft.length ? divLeft.map((r, i) => classementRowHtml(r.nom, r.logo, i + 1, fmtPct(r.rendementDiv), null, null, true)).join('') : empty;
  divRightBox.innerHTML = divRight.map((r, i) => classementRowHtml(r.nom, r.logo, half + i + 1, fmtPct(r.rendementDiv), null, null, true)).join('');

  const sousValo = rows.filter(r => r.ecartValeur != null && r.ecartValeur < 0).sort((a, b) => a.ecartValeur - b.ecartValeur);
  const survalo = rows.filter(r => r.ecartValeur != null && r.ecartValeur >= 0).sort((a, b) => a.ecartValeur - b.ecartValeur);

  valoSousBox.innerHTML = sousValo.length
    ? sousValo.map((r, i) => classementRowHtml(r.nom, r.logo, i + 1, fmtPct(r.ecartValeur * 100), 'pos', classementRendementRowHtml(r.nom))).join('')
    : '<div class="objectifs-empty">Aucune entreprise sous-valorisée.</div>';
  valoSurvaloBox.innerHTML = survalo.length
    ? survalo.map((r, i) => classementRowHtml(r.nom, r.logo, i + 1, fmtPct(r.ecartValeur * 100), 'neg', classementRendementRowHtml(r.nom))).join('')
    : '<div class="objectifs-empty">Aucune entreprise survalorisée.</div>';
}

// Export PDF du Classement — n'existait pas jusqu'ici (demande explicite). Reconstruit
// les 3 listes depuis les mêmes données/tri que renderClassement() (pas un clonage du
// DOM affiché, qui est déjà scindé en 2 colonnes visuelles pour le rendement dividende —
// ici on veut un seul tableau classé, plus lisible à l'impression), respecte le filtre
// secteur actif au moment du clic.
function exportClassementAsPdf(){
  const filterSelect = document.getElementById('classementSecteurFilter');
  const secteurFiltre = filterSelect.value;
  const secteurLabel = secteurFiltre ? filterSelect.options[filterSelect.selectedIndex].text : null;

  const rows = Object.keys(companies).map(nom => {
    const latest = companies[nom][companies[nom].length - 1];
    return { nom, logo: latest.lienImage, rendementDiv: latest.rendementDiv, ecartValeur: latest.ecartValeur, secteurKey: normalizeSector(latest.secteur) || 'autre' };
  }).filter(r => !secteurFiltre || r.secteurKey === secteurFiltre);

  const byDiv = rows.filter(r => r.rendementDiv != null).sort((a, b) => b.rendementDiv - a.rendementDiv);
  const sousValo = rows.filter(r => r.ecartValeur != null && r.ecartValeur < 0).sort((a, b) => a.ecartValeur - b.ecartValeur);
  const survalo = rows.filter(r => r.ecartValeur != null && r.ecartValeur >= 0).sort((a, b) => a.ecartValeur - b.ecartValeur);

  const table = (list, valueFn) => list.length
    ? `<table class="print-table"><thead><tr><th>#</th><th>Entreprise</th><th>Valeur</th></tr></thead><tbody>${list.map((r, i) => {
        const logoImg = r.logo ? `<img class="print-inline-logo" src="${r.logo}" alt="">` : '';
        return `<tr><td>${i + 1}</td><td>${logoImg}${r.nom.replace(/</g,'&lt;')}</td><td>${valueFn(r)}</td></tr>`;
      }).join('')}</tbody></table>`
    : '<p style="color:#999">Aucune donnée disponible.</p>';

  const body = `
    <div class="print-section"><h3>Meilleur rendement du dividende</h3>${table(byDiv, r => fmtPct(r.rendementDiv))}</div>
    <div class="print-section"><h3>Sous-valorisées</h3>${table(sousValo, r => fmtPct(r.ecartValeur * 100))}</div>
    <div class="print-section"><h3>Survalorisées</h3>${table(survalo, r => fmtPct(r.ecartValeur * 100))}</div>`;
  exportSectionAsPdf('Classement', secteurLabel, body);
}

function initClassement(){
  ['classementDivLeft', 'classementDivRight', 'classementValoSous', 'classementValoSurvalo'].forEach(id => {
    const box = document.getElementById(id);
    if (!box) return;
    box.addEventListener('click', e => {
      const addBtn = e.target.closest('[data-action="dividend-add"]');
      if (addBtn){
        addDividendPosition(addBtn.dataset.nom);
        renderClassement();
        renderDividendPortfolio();
        return;
      }
      const row = e.target.closest('.classement-row[data-nom]');
      if (row) goToAnalyse(row.dataset.nom);
    });
  });
  const filter = document.getElementById('classementSecteurFilter');
  if (filter) filter.addEventListener('change', renderClassement);
  const exportPdfBtn = document.getElementById('classementExportPdfBtn');
  if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportClassementAsPdf);
}

/* ============================================================
   ONGLET PORTEFEUILLE DIVIDENDE — construit depuis l'onglet
   Classement (bouton "+ Ajouter" sur la liste "Meilleur rendement
   du dividende"). Montant investi par position saisi manuellement ;
   poids, dividende annuel estimé, CAGR et projection calculés à
   partir des données déjà mappées (rendementDiv, cagrDiv5/10/20),
   aucun nouvel appel réseau. Persistance identique aux autres
   onglets : localStorage + socle data/dividende.json + export JSON.
   ============================================================ */
const DIVIDEND_LS_KEY = 'wolfAnalysisDividendPortfolio';
const DIVIDEND_BASELINE_URL = 'data/dividende.json';
// positions[nom] = % du capital total (pas un montant € — retour utilisateur explicite :
// "je ne dois pas rentrer un prix, je dois rentrer un pourcentage de taille de position,
// c'est à toi de calculer le prix"). totalCapital = capital total à répartir, saisi une
// fois pour tout le portefeuille.
// growthWindows[nom] : '5'|'10'|'20'|'off' — quelle fenêtre de médiane de performance
// annuelle (voir medianAnnualReturn()) utiliser comme hypothèse de plus-value pour cette
// position dans le simulateur, ou 'off' pour l'exclure (défaut — retour utilisateur
// explicite : pouvoir "mettre zéro si on veut l'inclure ou pas", donc opt-in par action,
// pas une hypothèse imposée). Objet séparé de `positions` (qui reste les poids en %) et
// de `totalCapital`, pour ne pas perturber migrateDividendPortfolioToPercent().
let dividendPortfolioStore = { positions: {}, totalCapital: 0, growthWindows: {} };

// Migration : les stores existants (créés avant ce changement) ont positions[nom] en €
// bruts — reconvertit en % du total (déduit de la somme existante) une seule fois, sans
// perte de répartition relative. Détectée par l'absence de totalCapital > 0.
function migrateDividendPortfolioToPercent(){
  const noms = Object.keys(dividendPortfolioStore.positions);
  if (!noms.length || dividendPortfolioStore.totalCapital) return;
  const sum = noms.reduce((s, n) => s + (dividendPortfolioStore.positions[n] || 0), 0);
  if (!sum) return;
  dividendPortfolioStore.totalCapital = sum;
  noms.forEach(n => { dividendPortfolioStore.positions[n] = (dividendPortfolioStore.positions[n] / sum) * 100; });
  persistDividendPortfolioLocal();
}

function addDividendPosition(nom){
  if (dividendPortfolioStore.positions[nom] != null) return;
  dividendPortfolioStore.positions[nom] = 10;
  persistDividendPortfolioLocal();
}

function mergeDividendPortfolio(extra){
  if (!extra || !extra.positions) return;
  Object.keys(extra.positions).forEach(k => {
    if (dividendPortfolioStore.positions[k] == null) dividendPortfolioStore.positions[k] = extra.positions[k];
  });
  if (!dividendPortfolioStore.totalCapital && extra.totalCapital) dividendPortfolioStore.totalCapital = extra.totalCapital;
  if (extra.growthWindows){
    Object.keys(extra.growthWindows).forEach(k => {
      if (dividendPortfolioStore.growthWindows[k] == null) dividendPortfolioStore.growthWindows[k] = extra.growthWindows[k];
    });
  }
}

async function loadDividendPortfolioBaseline(){
  try{
    const res = await fetch(DIVIDEND_BASELINE_URL, { cache:'no-store' });
    if (res.ok){
      const json = await res.json();
      if (json && typeof json === 'object') mergeDividendPortfolio(json);
    }
  }catch(e){ /* fichier absent ou fetch bloqué (ex. file://) — non bloquant */ }
  try{
    const raw = localStorage.getItem(DIVIDEND_LS_KEY);
    if (raw) mergeDividendPortfolio(JSON.parse(raw));
  }catch(e){ /* localStorage indisponible ou JSON corrompu */ }
  migrateDividendPortfolioToPercent();
  renderDividendPortfolio();
}

function persistDividendPortfolioLocal(){
  try{ localStorage.setItem(DIVIDEND_LS_KEY, JSON.stringify(dividendPortfolioStore)); }catch(e){ /* quota / navigateur privé */ }
}

function exportDividendPortfolio(){
  const blob = new Blob([JSON.stringify(dividendPortfolioStore, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wolf-analysis-portefeuille-dividende.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

let dividendProjectionChart = null;

function dividendPositionMetrics(nom, pct, totalCapital){
  const hist = companies[nom];
  if (!hist) return null;
  const latest = hist[hist.length - 1];
  const rendement = latest.rendementDiv;
  const montant = totalCapital * pct / 100;
  const dividendeAnnuel = (rendement != null) ? montant * rendement / 100 : null;
  const growthWindow = dividendPortfolioStore.growthWindows[nom] || 'off';
  const medianReturns = { '5': medianAnnualReturn(nom, 5), '10': medianAnnualReturn(nom, 10), '20': medianAnnualReturn(nom, 20) };
  const selectedMedian = growthWindow !== 'off' ? medianReturns[growthWindow] : null;
  return {
    nom, pct, montant, logo: latest.lienImage,
    rendement, dividendeAnnuel,
    cagr5: latest.cagrDiv5, cagr10: latest.cagrDiv10, cagr20: latest.cagrDiv20,
    growthWindow, medianReturns, selectedMedian
  };
}

function renderDividendPortfolio(){
  const summaryBox = document.getElementById('dividendeSummary');
  const listBox = document.getElementById('dividendeList');
  if (!summaryBox || !listBox) return;

  const totalCapitalInput = document.getElementById('dividendeTotalCapital');
  if (totalCapitalInput && document.activeElement !== totalCapitalInput) totalCapitalInput.value = dividendPortfolioStore.totalCapital || '';
  const totalCapital = dividendPortfolioStore.totalCapital || 0;

  const noms = Object.keys(dividendPortfolioStore.positions);
  const rows = noms.map(nom => dividendPositionMetrics(nom, dividendPortfolioStore.positions[nom], totalCapital)).filter(Boolean);

  const pctAlloue = rows.reduce((s, r) => s + r.pct, 0);
  const capitalInvesti = rows.reduce((s, r) => s + r.montant, 0);
  const dividendeAnnuelTotal = rows.reduce((s, r) => s + (r.dividendeAnnuel || 0), 0);
  const rendementMoyen = capitalInvesti ? (dividendeAnnuelTotal / capitalInvesti * 100) : null;
  // CAGR moyen pondéré par le poids (%) de chaque position (10 ans, fenêtre la plus
  // représentative — même horizon que le reste du site), utilisé pour la projection.
  const cagrPondereSum = rows.reduce((s, r) => s + (r.cagr10 != null ? r.cagr10 * r.pct : 0), 0);
  const cagrPondereWeight = rows.reduce((s, r) => s + (r.cagr10 != null ? r.pct : 0), 0);
  const cagrMoyen = cagrPondereWeight ? (cagrPondereSum / cagrPondereWeight) : null;

  // Croissance du capital (plus-value) : moyenne pondérée par le poids (%) des seules
  // positions où l'utilisateur a choisi une fenêtre de médiane (voir growthWindow, défaut
  // 'off' = exclue) — 0% si aucune position n'en a une, comportement du simulateur
  // inchangé par rapport à avant cette fonctionnalité (voir computeDividendSimSeries()).
  const growthRows = rows.filter(r => r.growthWindow !== 'off' && r.selectedMedian != null);
  const growthWeight = growthRows.reduce((s, r) => s + r.pct, 0);
  dividendCapitalGrowthPct = growthWeight ? growthRows.reduce((s, r) => s + r.selectedMedian * r.pct, 0) / growthWeight : 0;

  summaryBox.innerHTML = `
    <div class="ratio-card"><div class="k">Capital investi</div><div class="v">${fmtEUR(capitalInvesti, 0)}</div><div class="sub">${rows.length} position${rows.length > 1 ? 's' : ''}</div></div>
    <div class="ratio-card"><div class="k">Alloué</div><div class="v${Math.round(pctAlloue) === 100 ? '' : ' warn'}">${pctAlloue.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</div><div class="sub">${Math.round(pctAlloue) === 100 ? 'du capital total' : 'sur 100% du capital total'}</div></div>
    <div class="ratio-card"><div class="k">Dividendes annuels estimés</div><div class="v">${fmtEUR(dividendeAnnuelTotal, 0)}</div><div class="sub">au rendement actuel</div></div>
    <div class="ratio-card"><div class="k">Rendement moyen pondéré</div><div class="v">${rendementMoyen != null ? fmtPct(rendementMoyen) : 'N/D'}</div><div class="sub">sur capital investi</div></div>`;

  // 3 badges cliquables affichant TOUJOURS les 3 fenêtres (5a/10a/20a), au lieu d'un
  // <select> qui cachait les valeurs derrière un menu déroulant — retour explicite de
  // l'utilisateur : "tu vas directement d'office les mettre les trois... sous chaque
  // entreprise". Cliquer sur la fenêtre déjà active la désactive (repasse à 'off') ;
  // "N/D" reste affiché tel quel (bouton désactivé) quand l'entreprise n'est pas dans
  // les ~20 de l'historique de prix dédié — pas un bug, une vraie limite de couverture.
  const growthWindowBadgesHtml = (nom, current, medians) => ['5','10','20'].map(w => {
    const val = medians[w];
    const disabled = val == null;
    const active = current === w;
    return `<button class="dividende-growth-badge${active ? ' active' : ''}" data-nom="${nom}" data-window="${w}" ${disabled ? 'disabled' : ''}>${w}a ${val != null ? (val >= 0 ? '+' : '') + fmtPct(val) : 'N/D'}</button>`;
  }).join('');

  listBox.innerHTML = rows.length ? rows.map(r => {
    const safe = r.nom.replace(/"/g,'&quot;');
    return `<div class="dividende-row" data-nom="${safe}">
      <div class="dividende-row-logo"><img src="${r.logo || ''}" alt=""></div>
      <div class="dividende-row-name">${r.nom}</div>
      <div class="dividende-row-field"><label>Poids (%)</label><input type="number" class="dividende-amount-input" data-nom="${safe}" value="${r.pct.toLocaleString('fr-FR',{maximumFractionDigits:2})}" min="0" max="100" step="0.5"></div>
      <div class="dividende-row-field"><label>Montant</label><span>${fmtEUR(r.montant, 0)}</span></div>
      <div class="dividende-row-field"><label>Rendement</label><span>${r.rendement != null ? fmtPct(r.rendement) : 'N/D'}</span></div>
      <div class="dividende-row-field"><label>Div. annuel</label><span>${r.dividendeAnnuel != null ? fmtEUR(r.dividendeAnnuel, 0) : 'N/D'}</span></div>
      <div class="dividende-row-field"><label>CAGR 5/10/20a</label><span>${fmtPct(r.cagr5)} / ${fmtPct(r.cagr10)} / ${fmtPct(r.cagr20)}</span></div>
      <div class="dividende-row-field dividende-row-field-wide"><label>Médiane perf./an (clic = activer pour le simulateur)</label><div class="dividende-growth-badges">${growthWindowBadgesHtml(safe, r.growthWindow, r.medianReturns)}</div></div>
      <button class="cec-remove" data-action="dividende-remove" data-nom="${safe}" title="Retirer">✕</button>
    </div>`;
  }).join('') : '<div class="objectifs-empty">Aucune position — ajoute des entreprises depuis l\'onglet Classement (liste "Meilleur rendement du dividende").</div>';

  wireDividendRows();
  updateDividendSimDefaults(capitalInvesti, rendementMoyen, cagrMoyen);
  computeDividendSimChart();
}

function wireDividendRows(){
  const totalCapitalInput = document.getElementById('dividendeTotalCapital');
  if (totalCapitalInput && !totalCapitalInput.dataset.wired){
    totalCapitalInput.dataset.wired = '1';
    totalCapitalInput.addEventListener('change', () => {
      const val = parseFloat(totalCapitalInput.value);
      dividendPortfolioStore.totalCapital = isNaN(val) ? 0 : val;
      persistDividendPortfolioLocal();
      renderDividendPortfolio();
    });
  }
  document.querySelectorAll('.dividende-amount-input').forEach(input => {
    input.addEventListener('change', () => {
      const val = parseFloat(input.value);
      dividendPortfolioStore.positions[input.dataset.nom] = isNaN(val) ? 0 : val;
      persistDividendPortfolioLocal();
      renderDividendPortfolio();
    });
  });
  document.querySelectorAll('[data-action="dividende-remove"]').forEach(btn => {
    btn.addEventListener('click', () => {
      delete dividendPortfolioStore.positions[btn.dataset.nom];
      delete dividendPortfolioStore.growthWindows[btn.dataset.nom];
      persistDividendPortfolioLocal();
      renderDividendPortfolio();
    });
  });
  document.querySelectorAll('.dividende-growth-badge').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = dividendPortfolioStore.growthWindows[btn.dataset.nom] || 'off';
      dividendPortfolioStore.growthWindows[btn.dataset.nom] = current === btn.dataset.window ? 'off' : btn.dataset.window;
      persistDividendPortfolioLocal();
      renderDividendPortfolio();
    });
  });
}

// ============================================================
// SIMULATEUR DE CROISSANCE — capital de départ + versement mensuel + rendement +
// croissance du dividende, composé sur un horizon choisi (5/10/15/20 ans). Distinct du
// résumé "positions réelles" au-dessus : demande explicite de l'utilisateur ("mettre un
// capital investi, combien on rajoute chaque mois, un rendement... que ça génère dans le
// graphique"), les 3 premiers champs sont pré-remplis depuis les positions réelles au
// premier rendu puis restent librement éditables (dividendSimTouched évite d'écraser une
// saisie utilisateur à chaque re-rendu du portefeuille).
// Modèle année par année (boucle, pas de formule fermée — nécessaire dès qu'on
// réinvestit, le capital de l'année t dépend du dividende de l'année t-1) :
// capital(t) = capital(t-1) + versementMensuel×12 [+ dividende(t-1) si réinvestissement
// actif cette année-là] ; rendementSurCout(t) = rendementSurCout(t-1) × (1+croissance%)
// (le rendement sur le coût de base augmente avec la croissance du dividende, modèle
// "yield on cost") ; dividende(t) = capital(t) × rendementSurCout(t).
// Réinvestissement optionnel (retour utilisateur explicite : "pendant vingt ans je les
// réinvestis, ensuite je les prends") — désactivable, et désactivable À PARTIR d'une
// année donnée (dividendeSimStopYear) tout en gardant les années précédentes composées.
let dividendSimTouched = false;
let dividendSimHorizon = 10;
// Croissance annuelle du CAPITAL (plus-value, pas le dividende) — moyenne pondérée des
// médianes de performance sur 1 an choisies par position (voir renderDividendPortfolio()
// et medianAnnualReturn()). 0 tant qu'aucune position n'a de fenêtre activée, pour ne
// jamais changer le comportement du simulateur sans action explicite de l'utilisateur.
let dividendCapitalGrowthPct = 0;
function updateDividendSimDefaults(capitalTotal, rendementMoyen, cagrMoyen){
  if (dividendSimTouched) return;
  const capitalEl = document.getElementById('dividendeSimCapital');
  const yieldEl = document.getElementById('dividendeSimYield');
  const cagrEl = document.getElementById('dividendeSimCagr');
  if (capitalEl) capitalEl.value = Math.round(capitalTotal || 0);
  if (yieldEl) yieldEl.value = rendementMoyen != null ? rendementMoyen.toFixed(1) : '';
  if (cagrEl) cagrEl.value = cagrMoyen != null ? cagrMoyen.toFixed(1) : '';
}
function dividendSimInputs(){
  const num = id => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? 0 : v; };
  const stopYearRaw = document.getElementById('dividendeSimStopYear')?.value;
  return {
    capital0: num('dividendeSimCapital'),
    monthly: num('dividendeSimMonthly'),
    yieldPct: num('dividendeSimYield'),
    cagr: num('dividendeSimCagr'),
    horizon: dividendSimHorizon,
    reinvest: !!document.getElementById('dividendeSimReinvest')?.checked,
    stopYear: stopYearRaw ? parseInt(stopYearRaw, 10) : null
  };
}
// overrides optionnel : {capital0, monthly} pour la recherche binaire de l'objectif,
// sans dépendre des valeurs actuellement affichées dans les champs.
function computeDividendSimSeries(overrides){
  const base = dividendSimInputs();
  const { yieldPct, cagr, horizon, reinvest, stopYear } = base;
  const capital0 = overrides && overrides.capital0 != null ? overrides.capital0 : base.capital0;
  const monthly = overrides && overrides.monthly != null ? overrides.monthly : base.monthly;
  const years = [0];
  const capital = [capital0];
  const dividende = [capital0 * (yieldPct / 100)];
  let yieldOnCost = yieldPct;
  for (let t = 1; t <= horizon; t++){
    const reinvestThisYear = reinvest && (stopYear == null || t <= stopYear);
    let cap = capital[t - 1] * (1 + dividendCapitalGrowthPct / 100) + monthly * 12;
    if (reinvestThisYear) cap += dividende[t - 1];
    yieldOnCost *= (1 + cagr / 100);
    years.push(t);
    capital.push(cap);
    dividende.push(cap * (yieldOnCost / 100));
  }
  return { years, capital, dividende };
}
function computeDividendSimChart(){
  const canvas = document.getElementById('chartDividendeProjection');
  const resultsBox = document.getElementById('dividendeSimResults');
  if (!canvas) return;
  const { years, capital, dividende } = computeDividendSimSeries();
  if (dividendProjectionChart) dividendProjectionChart.destroy();
  dividendProjectionChart = new Chart(canvas.getContext('2d'), {
    type:'line',
    data:{ labels: years.map(t => 'Année ' + t), datasets:[
      { label:'Dividendes annuels (€)', data: dividende.map(v => Math.round(v)), borderColor:THEME.gold, backgroundColor:'rgba(217,164,65,0.12)', fill:true, tension:0.3, pointRadius:3 }
    ] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ x:{ grid:{ display:false }, ticks:{ color:THEME.dim } }, y:{ grid:baseGrid, ticks:{ color:THEME.dim, callback:v=>v.toLocaleString('fr-FR')+' €' } } }
    }
  });
  if (resultsBox){
    const n = years.length - 1;
    resultsBox.innerHTML = `
      <div><div class="k">Montant investi (année ${n})</div><div class="v">${fmtEUR(capital[n], 0)}</div></div>
      <div><div class="k">Dividendes annuels (année ${n})</div><div class="v">${fmtEUR(dividende[n], 0)}</div></div>
      <div><div class="k">Croissance div. moyenne</div><div class="v">${dividendSimInputs().cagr.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})}%/an</div></div>
      <div><div class="k">Croissance capital (médiane)</div><div class="v">${dividendCapitalGrowthPct ? dividendCapitalGrowthPct.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}) + '%/an' : 'Off'}</div></div>`;
  }
  solveDividendGoal();
}

// Objectif inversé, intégré au simulateur (retour utilisateur explicite : "que ça fasse
// partie du simulateur", pas un widget séparé déconnecté du réinvestissement) : "si je
// veux X€/mois à l'horizon choisi, combien dois-je mettre" — résolu par recherche
// binaire sur computeDividendSimSeries() (le modèle composé, avec réinvestissement,
// n'a pas de formule fermée simple à inverser), en ajustant soit le capital de départ
// soit le versement mensuel au choix, l'autre restant fixé à sa valeur actuelle.
function solveDividendGoal(){
  const goalInput = document.getElementById('dividendeGoalInput');
  const result = document.getElementById('dividendeGoalResult');
  if (!goalInput || !result) return;
  const goalRaw = parseFloat(goalInput.value);
  if (!goalRaw){ result.textContent = '—'; return; }
  const period = document.getElementById('dividendeGoalPeriod')?.value || 'month';
  const goalAnnual = period === 'month' ? goalRaw * 12 : goalRaw;
  const lever = document.getElementById('dividendeGoalLever')?.value || 'capital0';
  const horizon = dividendSimHorizon;

  const dividendeAtHorizon = overrides => computeDividendSimSeries(overrides).dividende[horizon];

  let lo = 0, hi = 10000000;
  if (dividendeAtHorizon({ [lever]: hi }) < goalAnnual){
    result.textContent = "Objectif hors de portée à cet horizon, même avec un montant très élevé — augmente le rendement, la croissance ou l'horizon.";
    return;
  }
  for (let i = 0; i < 60; i++){
    const mid = (lo + hi) / 2;
    if (dividendeAtHorizon({ [lever]: mid }) < goalAnnual) lo = mid; else hi = mid;
  }
  const leverLabel = lever === 'capital0' ? 'de capital de départ' : 'de versement mensuel';
  result.textContent = `≈ ${fmtEUR(hi, 0)} ${leverLabel} pour atteindre ${fmtEUR(goalAnnual, 0)}/an de dividendes en année ${horizon} (réinvestissement ${dividendSimInputs().reinvest ? 'activé' : 'désactivé'}).`;
}

function openDividendeSimZoom(){
  const card = document.getElementById('dividendeSimCard');
  const body = document.getElementById('dividendeSimZoomBody');
  if (!card || !body) return;
  card._zoomHome = { parent: card.parentNode, next: card.nextSibling };
  body.appendChild(card);
  document.getElementById('dividendeSimZoomModal').style.display = 'flex';
  requestAnimationFrame(() => { if (dividendProjectionChart) dividendProjectionChart.resize(); });
}
function closeDividendeSimZoom(){
  const body = document.getElementById('dividendeSimZoomBody');
  const card = body.firstElementChild;
  if (card && card._zoomHome){
    const { parent, next } = card._zoomHome;
    try{
      if (next && next.parentNode === parent) parent.insertBefore(card, next);
      else parent.appendChild(card);
    }catch(e){ parent.appendChild(card); }
    requestAnimationFrame(() => { if (dividendProjectionChart) dividendProjectionChart.resize(); });
  }
  document.getElementById('dividendeSimZoomModal').style.display = 'none';
}

function initDividendPortfolio(){
  const exportBtn = document.getElementById('dividendeExportBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportDividendPortfolio);

  ['dividendeSimCapital', 'dividendeSimMonthly', 'dividendeSimYield', 'dividendeSimCagr', 'dividendeSimStopYear'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { dividendSimTouched = true; computeDividendSimChart(); });
  });
  const reinvestBox = document.getElementById('dividendeSimReinvest');
  if (reinvestBox) reinvestBox.addEventListener('change', () => { dividendSimTouched = true; computeDividendSimChart(); });
  ['dividendeGoalInput', 'dividendeGoalPeriod', 'dividendeGoalLever'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', solveDividendGoal);
  });
  const horizonRow = document.getElementById('dividendeSimHorizonButtons');
  if (horizonRow){
    horizonRow.addEventListener('click', e => {
      const btn = e.target.closest('button[data-horizon]');
      if (!btn) return;
      dividendSimHorizon = parseInt(btn.dataset.horizon, 10);
      horizonRow.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      computeDividendSimChart();
    });
  }
  const zoomBtn = document.getElementById('dividendeSimZoomBtn');
  if (zoomBtn) zoomBtn.addEventListener('click', openDividendeSimZoom);
}

// ============================================================
// CONSTRUCTION DE PORTEFEUILLE — sélection libre d'entreprises suivies (pas limité à la
// liste Classement, contrairement au Portefeuille Dividende) + simulation composée sur
// un horizon 5/10/15/20 ans, demandée explicitement par l'utilisateur : "pouvoir choisir
// des actions directement... composer son propre portefeuille et extrapoler la
// performance... en y mettant les dividendes, la possibilité de réinvestir ou non...
// voir le scénario pessimiste qui se trouve dans l'onglet Valorisation de chacune".
// Positions en MONTANT (€) directement, pas en % (contrairement au Dividende) — colle
// mieux à "choisir des actions et un montant" plutôt que répartir un capital déjà fixé.
const CONSTRUCTION_LS_KEY = 'wolfAnalysisConstruction';
const CONSTRUCTION_BASELINE_URL = 'data/construction.json';
let constructionStore = { positions: {} }; // positions[nom] = montant investi en €
let constructionSimHorizon = 10;

// Rendement annualisé du scénario Pessimiste (5 ans) d'une entreprise, réutilisant
// EXACTEMENT la même formule que l'onglet Valorisation (computeScenario()) — priorité au
// dernier objectif enregistré par l'utilisateur pour cette entreprise (objectifsStore,
// même source que l'historique des objectifs de Valorisation) s'il existe, sinon mêmes
// deltas par défaut que renderValorisation() (CAGR hist. -5pts, médiane hist. -3x).
// Jamais recalculé "à la main" ici : une seule source de vérité pour ce que "Pessimiste"
// veut dire sur tout le site.
function pessimisticScenarioForCompany(nom){
  const hist = companies[nom];
  if (!hist || !hist.length) return null;
  const latest = hist[hist.length - 1];
  const { fcfActuel, cagrHist, medianeHist } = valorisationInputs(latest);
  const prixActuel = latest.prixActuel;
  if (fcfActuel == null || prixActuel == null) return null;
  const savedList = objectifsStore[nom];
  const saved = savedList && savedList.length ? savedList[savedList.length - 1] : null;
  const savedPess = saved && saved.scenarios && saved.scenarios.pessimiste;
  const pess = savedPess || {
    cagr: cagrHist != null ? +(cagrHist - 5).toFixed(1) : 0,
    multiple: medianeHist != null ? +(medianeHist - 3).toFixed(1) : 0,
    rachat: 0
  };
  const { rendement5A } = computeScenario(fcfActuel, prixActuel, pess.cagr, pess.multiple, pess.rachat || 0);
  return { rendement5A, fromSaved: !!savedPess };
}

function addConstructionPosition(nom, montant){
  if (!companies[nom] || !montant) return;
  constructionStore.positions[nom] = (constructionStore.positions[nom] || 0) + montant;
  persistConstructionLocal();
  renderConstructionPortfolio();
}

function mergeConstruction(extra){
  if (!extra || !extra.positions) return;
  Object.keys(extra.positions).forEach(k => {
    if (constructionStore.positions[k] == null) constructionStore.positions[k] = extra.positions[k];
  });
}

async function loadConstructionBaseline(){
  try{
    const res = await fetch(CONSTRUCTION_BASELINE_URL, { cache:'no-store' });
    if (res.ok){
      const json = await res.json();
      if (json && typeof json === 'object') mergeConstruction(json);
    }
  }catch(e){ /* fichier absent ou fetch bloqué (ex. file://) — non bloquant */ }
  try{
    const raw = localStorage.getItem(CONSTRUCTION_LS_KEY);
    if (raw) mergeConstruction(JSON.parse(raw));
  }catch(e){ /* localStorage indisponible ou JSON corrompu */ }
  renderConstructionPortfolio();
}

function persistConstructionLocal(){
  try{ localStorage.setItem(CONSTRUCTION_LS_KEY, JSON.stringify(constructionStore)); }catch(e){ /* quota / navigateur privé */ }
}

function exportConstructionPortfolio(){
  const blob = new Blob([JSON.stringify(constructionStore, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wolf-analysis-construction-portefeuille.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function constructionPositionMetrics(nom, montant){
  const hist = companies[nom];
  if (!hist) return null;
  const latest = hist[hist.length - 1];
  const pess = pessimisticScenarioForCompany(nom);
  return {
    nom, montant, logo: latest.lienImage,
    rendementDiv: latest.rendementDiv, cagrDiv10: latest.cagrDiv10,
    pessRendement: pess ? pess.rendement5A : null
  };
}

let constructionProjectionChart = null;

function renderConstructionPortfolio(){
  const summaryBox = document.getElementById('constructionSummary');
  const listBox = document.getElementById('constructionList');
  const companyList = document.getElementById('constructionCompanyList');
  if (!summaryBox || !listBox) return;

  if (companyList && !companyList.childElementCount){
    companyList.innerHTML = Object.keys(companies).map(n => `<option value="${n.replace(/"/g,'&quot;')}">`).join('');
  }

  const noms = Object.keys(constructionStore.positions);
  const rows = noms.map(nom => constructionPositionMetrics(nom, constructionStore.positions[nom])).filter(Boolean);

  const totalCapital = rows.reduce((s, r) => s + r.montant, 0);
  const dividendeAnnuelTotal = rows.reduce((s, r) => s + (r.rendementDiv != null ? r.montant * r.rendementDiv / 100 : 0), 0);
  const weightedAvg = (field) => {
    const w = rows.reduce((s, r) => s + (r[field] != null ? r.montant : 0), 0);
    if (!w) return null;
    return rows.reduce((s, r) => s + (r[field] != null ? r[field] * r.montant : 0), 0) / w;
  };
  const rendementDivMoyen = weightedAvg('rendementDiv');
  const cagrDivMoyen = weightedAvg('cagrDiv10');
  const pessMoyen = weightedAvg('pessRendement');

  summaryBox.innerHTML = `
    <div class="ratio-card"><div class="k">Capital investi</div><div class="v">${fmtEUR(totalCapital, 0)}</div><div class="sub">${rows.length} position${rows.length > 1 ? 's' : ''}</div></div>
    <div class="ratio-card"><div class="k">Dividendes annuels estimés</div><div class="v">${fmtEUR(dividendeAnnuelTotal, 0)}</div><div class="sub">au rendement actuel</div></div>
    <div class="ratio-card"><div class="k">Rendement dividende moyen</div><div class="v">${rendementDivMoyen != null ? fmtPct(rendementDivMoyen) : 'N/D'}</div><div class="sub">pondéré par montant</div></div>
    <div class="ratio-card"><div class="k">Scénario Pessimiste pondéré</div><div class="v${pessMoyen != null && pessMoyen < 0 ? ' neg' : ''}">${pessMoyen != null ? (pessMoyen >= 0 ? '+' : '') + fmtPct(pessMoyen) : 'N/D'}</div><div class="sub">rendement annualisé (5a)</div></div>`;

  listBox.innerHTML = rows.length ? rows.map(r => {
    const safe = r.nom.replace(/"/g,'&quot;');
    const pct = totalCapital ? (r.montant / totalCapital * 100) : 0;
    return `<div class="dividende-row" data-nom="${safe}">
      <div class="dividende-row-logo"><img src="${r.logo || ''}" alt=""></div>
      <div class="dividende-row-name">${r.nom}</div>
      <div class="dividende-row-field"><label>Montant (€)</label><input type="number" class="dividende-amount-input" data-nom="${safe}" value="${r.montant}" min="0" step="100"></div>
      <div class="dividende-row-field"><label>Poids</label><span>${pct.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</span></div>
      <div class="dividende-row-field"><label>Rendement div.</label><span>${r.rendementDiv != null ? fmtPct(r.rendementDiv) : 'N/D'}</span></div>
      <div class="dividende-row-field"><label>Scénario Pessimiste (5a)</label><span${r.pessRendement != null && r.pessRendement < 0 ? ' class="neg"' : ''}>${r.pessRendement != null ? (r.pessRendement >= 0 ? '+' : '') + fmtPct(r.pessRendement) : 'N/D'}</span></div>
      <button class="cec-remove" data-action="construction-remove" data-nom="${safe}" title="Retirer">✕</button>
    </div>`;
  }).join('') : '<div class="objectifs-empty">Aucune position — ajoute une entreprise suivie ci-dessus avec un montant.</div>';

  listBox.querySelectorAll('.dividende-amount-input').forEach(input => {
    input.addEventListener('change', () => {
      const val = parseFloat(input.value);
      constructionStore.positions[input.dataset.nom] = isNaN(val) ? 0 : val;
      persistConstructionLocal();
      renderConstructionPortfolio();
    });
  });
  listBox.querySelectorAll('[data-action="construction-remove"]').forEach(btn => {
    btn.addEventListener('click', () => {
      delete constructionStore.positions[btn.dataset.nom];
      persistConstructionLocal();
      renderConstructionPortfolio();
    });
  });

  computeConstructionSimChart(totalCapital, rendementDivMoyen, cagrDivMoyen, pessMoyen);
}

// Même moteur que le simulateur Dividende (capital(t) = capital(t-1)×(1+croissance%) +
// versements [+ dividende réinvesti]), mais la croissance vient ici du scénario
// Pessimiste pondéré (toggle possible) plutôt que d'une médiane de prix par action —
// et le capital de départ est directement le total des montants investis (pas de champ
// séparé, "composer son portefeuille" fixe déjà le capital de départ).
function computeConstructionSimSeries(totalCapital, rendementDivMoyen, cagrDivMoyen, pessMoyen){
  const monthly = parseFloat(document.getElementById('constructionSimMonthly')?.value) || 0;
  const reinvest = !!document.getElementById('constructionSimReinvest')?.checked;
  const includeGrowth = !!document.getElementById('constructionSimGrowth')?.checked;
  const horizon = constructionSimHorizon;
  const growthPct = includeGrowth && pessMoyen != null ? pessMoyen : 0;
  const yieldPct = rendementDivMoyen || 0;
  const cagrDiv = cagrDivMoyen || 0;

  const years = [0];
  const capital = [totalCapital];
  const dividende = [totalCapital * (yieldPct / 100)];
  let yieldOnCost = yieldPct;
  for (let t = 1; t <= horizon; t++){
    let cap = capital[t - 1] * (1 + growthPct / 100) + monthly * 12;
    if (reinvest) cap += dividende[t - 1];
    yieldOnCost *= (1 + cagrDiv / 100);
    years.push(t);
    capital.push(cap);
    dividende.push(cap * (yieldOnCost / 100));
  }
  return { years, capital, dividende };
}

function computeConstructionSimChart(totalCapital, rendementDivMoyen, cagrDivMoyen, pessMoyen){
  const canvas = document.getElementById('chartConstructionProjection');
  const resultsBox = document.getElementById('constructionSimResults');
  if (!canvas) return;
  const { years, capital, dividende } = computeConstructionSimSeries(totalCapital, rendementDivMoyen, cagrDivMoyen, pessMoyen);
  if (constructionProjectionChart) constructionProjectionChart.destroy();
  constructionProjectionChart = new Chart(canvas.getContext('2d'), {
    type:'line',
    data:{ labels: years.map(t => 'Année ' + t), datasets:[
      { label:'Valorisation (€)', data: capital.map(v => Math.round(v)), borderColor:THEME.blue, backgroundColor:'rgba(74,159,224,0.10)', fill:true, tension:0.3, pointRadius:3, yAxisID:'y' },
      { label:'Dividendes annuels (€)', data: dividende.map(v => Math.round(v)), borderColor:THEME.gold, backgroundColor:'rgba(217,164,65,0.12)', fill:true, tension:0.3, pointRadius:3, yAxisID:'y1' }
    ] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true } } },
      scales:{
        x:{ grid:{ display:false }, ticks:{ color:THEME.dim } },
        y:{ position:'left', grid:baseGrid, ticks:{ color:THEME.dim, callback:v=>v.toLocaleString('fr-FR')+' €' } },
        y1:{ position:'right', grid:{ display:false }, ticks:{ color:THEME.dim, callback:v=>v.toLocaleString('fr-FR')+' €' } }
      }
    }
  });
  if (resultsBox){
    const n = years.length - 1;
    resultsBox.innerHTML = `
      <div><div class="k">Montant investi (année 0)</div><div class="v">${fmtEUR(totalCapital, 0)}</div></div>
      <div><div class="k">Valorisation projetée (année ${n})</div><div class="v">${fmtEUR(capital[n], 0)}</div></div>
      <div><div class="k">Dividendes annuels (année ${n})</div><div class="v">${fmtEUR(dividende[n], 0)}</div></div>
      <div><div class="k">Croissance capital utilisée</div><div class="v">${document.getElementById('constructionSimGrowth')?.checked && pessMoyen != null ? (pessMoyen >= 0 ? '+' : '') + fmtPct(pessMoyen) + '/an' : 'Off'}</div></div>`;
  }
}

function initConstruction(){
  const addBtn = document.getElementById('constructionAddBtn');
  const nomInput = document.getElementById('constructionCompanyInput');
  const amountInput = document.getElementById('constructionAmountInput');
  const submitConstruction = () => {
    const nom = nomInput.value.trim();
    const montant = parseFloat(amountInput.value);
    if (!companies[nom]){ alert("Entreprise inconnue — choisis un nom dans la liste suggérée."); return; }
    if (!montant || montant <= 0){ alert('Indique un montant positif.'); return; }
    addConstructionPosition(nom, montant);
    nomInput.value = '';
  };
  if (addBtn) addBtn.addEventListener('click', submitConstruction);
  // Cliquer une suggestion de la <datalist> ne déclenche pas d'événement clavier, donc
  // le champ se remplissait sans que rien ne se passe (même bug déjà rencontré et
  // corrigé sur le sélecteur d'entreprise du Cerveau numérique) — on soumet
  // automatiquement dès que la valeur correspond exactement à une entreprise suivie.
  if (nomInput) nomInput.addEventListener('input', () => {
    if (companies[nomInput.value.trim()]) submitConstruction();
  });
  const exportBtn = document.getElementById('constructionExportBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportConstructionPortfolio);
  ['constructionSimMonthly'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderConstructionPortfolio);
  });
  ['constructionSimReinvest', 'constructionSimGrowth'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderConstructionPortfolio);
  });
  const horizonRow = document.getElementById('constructionSimHorizonButtons');
  if (horizonRow){
    horizonRow.addEventListener('click', e => {
      const btn = e.target.closest('button[data-horizon]');
      if (!btn) return;
      constructionSimHorizon = parseInt(btn.dataset.horizon, 10);
      horizonRow.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      renderConstructionPortfolio();
    });
  }
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

const PORTFOLIO_GROUP_PAGES = ['pagePortfolio', 'pageDividende', 'pagePerso', 'pageConstruction'];
// Valorisation redevient une page à part entière (comme avant la tâche #74), mais
// accessible via un SOUS-onglet sous "Analyse" plutôt qu'un bouton de nav séparé —
// retour explicite : l'avoir append en bas de la même page #pageAnalyse forçait à
// défiler bien plus bas que voulu ("il faut descendre trop bas, ce n'est pas ça que je
// veux"). Même mécanique de groupe que PORTFOLIO_GROUP_PAGES, juste un second groupe.
const ANALYSE_GROUP_PAGES = ['pageAnalyse', 'pageValorisation'];
// Secteur/Classement/Watchlist regroupés sous "🔍 Screener" (même pattern que
// Portefeuille) — demande explicite pour désencombrer la nav principale.
const SCREENER_GROUP_PAGES = ['pageSecteur', 'pageClassement', 'pageWatchlist', 'pageComparaison'];
const NAV_GROUPS = [
  { key:'portfolio', subnavId:'portfolioSubnav', pages:PORTFOLIO_GROUP_PAGES },
  { key:'screener', subnavId:'screenerSubnav', pages:SCREENER_GROUP_PAGES }
];
function switchPage(pageId){
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === pageId));
  document.querySelectorAll('.page-nav-btn').forEach(b => b.classList.toggle('active',
    b.dataset.page === pageId ||
    NAV_GROUPS.some(g => b.dataset.group === g.key && g.pages.includes(pageId)) ||
    (b.dataset.page === 'pageAnalyse' && ANALYSE_GROUP_PAGES.includes(pageId))
  ));
  NAV_GROUPS.forEach(g => {
    const subnav = document.getElementById(g.subnavId);
    if (!subnav) return;
    subnav.style.display = g.pages.includes(pageId) ? 'flex' : 'none';
    subnav.querySelectorAll('.page-subnav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
  });
  const analyseSubnav = document.getElementById('analyseSubnav');
  if (analyseSubnav){
    analyseSubnav.style.display = ANALYSE_GROUP_PAGES.includes(pageId) ? 'flex' : 'none';
    analyseSubnav.querySelectorAll('.page-subnav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
  }
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
// Une médiane P/FCF ou P/OCF est un chiffre unique (pas une série qui varie dans le
// temps) — affichée en badge au-dessus du graphique, pas en ligne plate dessus (retour
// utilisateur explicite, voir renderPfcfPocfChart()). Pas de sémantique pos/neg ici
// (un multiple n'est ni "positif" ni "négatif" en soi), contrairement à setBadge().
function medianeBadgeHtml(label, value){
  return `<span class="chart-badge mediane-badge">${label} <b>${value != null ? value.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}) + 'x' : '—'}</b></span>`;
}
// P/FCF et P/OCF superposés, chacun activable/désactivable indépendamment (retour
// utilisateur : "possibilité de désactiver les P/FCF ou les P/OCF") — fonction
// autonome (pas de paramètres hist/years) pour être rappelable telle quelle depuis le
// handler de toggle, qui n'a pas accès aux variables locales de renderCompany().
let pfcfPocfVisible = { pfcf:true, pocf:true };
function renderPfcfPocfChart(){
  const hist = activeCompany && companies[activeCompany];
  if (!hist) return;
  const years = hist.map(r => r.annee);
  const series = k => hist.map(r => r[k]);
  const datasets = [];
  if (pfcfPocfVisible.pfcf) datasets.push({ label:'P/FCF (x)', data:series('pFcf'), backgroundColor:THEME.gold, borderRadius:4, barPercentage:0.5 });
  if (pfcfPocfVisible.pocf) datasets.push({ label:'P/OCF (x)', data:series('pOcf'), backgroundColor:THEME.blue, borderRadius:4, barPercentage:0.5 });
  if (chartInstances.pfcfpocf) chartInstances.pfcfpocf.destroy();
  chartInstances.pfcfpocf = makeChart('pfcfpocf', 'chartPFCFPOCF', {
    type:'bar',
    data:{ labels:years, datasets },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true}}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'x'} } } }
  });
}
function togglePfcfPocfSeries(key){
  pfcfPocfVisible[key] = !pfcfPocfVisible[key];
  document.querySelectorAll(`[data-series="${key}"]`).forEach(b => b.classList.toggle('active', pfcfPocfVisible[key]));
  renderPfcfPocfChart();
  if (zoomKey === 'pfcfpocf') renderZoomChart();
}
document.getElementById('pfcfPocfToggles').addEventListener('click', e => {
  const btn = e.target.closest('button[data-series]');
  if (btn) togglePfcfPocfSeries(btn.dataset.series);
});
document.getElementById('zoomPfcfPocfToggles').addEventListener('click', e => {
  const btn = e.target.closest('button[data-series]');
  if (btn) togglePfcfPocfSeries(btn.dataset.series);
});

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

  // Retour utilisateur explicite : une médiane est un chiffre unique, pas une série qui
  // varie dans le temps — une ligne plate sur tout le graphique n'apporte rien ("ça n'a
  // aucun intérêt"). Remplacé par des badges texte au-dessus du graphique (même logique
  // que les badges CAGR existants), voir medianeBadgeHtml()/#medianeBadgesPfcf plus bas.
  chartInstances.pfcf = makeChart('pfcf', 'chartPFCF', {
    type:'bar',
    data:{ labels:years, datasets:[
      { label:'P/FCF (x)', data:series('pFcf'), backgroundColor:THEME.gold, borderRadius:4, barPercentage:0.6 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+'x'} } } }
  });
  document.getElementById('medianeBadgesPfcf').innerHTML =
    medianeBadgeHtml('Médiane 10a', latest.medianePFCF) + medianeBadgeHtml('Médiane 20a', latest.medianePFCF20);

  chartInstances.ocf = makeChart('ocf', 'chartOCF', {
    type:'bar',
    data:{ labels:years, datasets:[{ label:'OCF / action (€)', data:series('ocfParAction'), backgroundColor:THEME.gold, borderRadius:4, barPercentage:0.6 }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x: baseAxis, y:{ grid:baseGrid, ticks:{color:THEME.dim, callback:v=>v+' €'} } } }
  });

  // P/FCF et P/OCF superposés (retour utilisateur : juste les deux séries, activables/
  // désactivables séparément — voir #pfcfPocfToggles/togglePfcfPocfSeries()) — familles
  // de couleur or=FCF / bleu=OCF, cohérent avec le reste du site.
  renderPfcfPocfChart();
  document.getElementById('medianeBadgesPfcfPocf').innerHTML =
    medianeBadgeHtml('Médiane P/FCF 10a', latest.medianePFCF) + medianeBadgeHtml('Médiane P/FCF 20a', latest.medianePFCF20) +
    medianeBadgeHtml('Médiane P/OCF 10a', latest.medianePOcf) + medianeBadgeHtml('Médiane P/OCF 20a', latest.medianePOcf20);

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
// Chart.js peut laisser un canvas "orphelin" enregistré en interne si new Chart() plante
// en cours de construction (ex. bug setLineDash déjà rencontré sur certains overlays du
// cours de bourse) : la variable JS censée recevoir l'instance n'est jamais assignée,
// mais le canvas reste marqué "in use" côté Chart.js — toute tentative suivante échoue
// avec "Canvas is already in use" même après avoir corrigé la cause du premier échec.
// Nettoyage + une seule reprise, même pattern que renderStockChart() (constaté en test :
// suffit dans la quasi-totalité des cas). Retourne null si les deux tentatives échouent,
// jamais d'exception qui remonte jusqu'à l'appelant.
function newChartWithOrphanCleanup(canvasEl, config){
  const orphan = typeof Chart.getChart === 'function' ? Chart.getChart(canvasEl) : null;
  if (orphan) orphan.destroy();
  try{
    return new Chart(canvasEl.getContext('2d'), config);
  }catch(e){
    console.error('Erreur de construction du graphique (1re tentative) :', e);
    try{
      const orphan2 = typeof Chart.getChart === 'function' ? Chart.getChart(canvasEl) : null;
      if (orphan2) orphan2.destroy();
      return new Chart(canvasEl.getContext('2d'), config);
    }catch(e2){
      console.error('Erreur de construction du graphique (2e tentative) :', e2);
      return null;
    }
  }
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
// Indicateurs affichables/masquables sur le graphique boursier (bouton par indicateur,
// demande explicite : "beaucoup d'informations", pouvoir en isoler certains à la fois).
let stockIndicators = { price:true, regression:true, sma200:true, sma30:true, prixJusteCible:false };
// Overlay universel (retour utilisateur : combiner n'importe quelle métrique
// historique sur le graphique boursier, sans limite de nombre) + mode d'échelle,
// choisi par l'utilisateur à chaque fois plutôt qu'un mode par défaut imposé.
let stockOverlays = { div:false, ca:false, margeOp:false, roic:false, detteOcf:false, actions:false, fcfAction:false, pfcf:false, cash:false };
let stockScaleMode = 'normal'; // 'normal' | 'indexed' | 'log'
// Couleurs limitées à gold/blue/green/red (répétées, distinguées par un trait plein vs
// pointillé) pour ne pas entrer en collision avec yellow/white/violet déjà réservés au
// prix/SMA200/SMA30 en mode normal (seul mode où les deux familles coexistent sur le
// même graphique).
// `marked:true` (au lieu d'un `borderDash`) distingue les 5 métriques qui partagent leur
// couleur avec une autre : Chart.js 4.4.4 plante de façon reproductible ("Failed to
// execute 'setLineDash'... cannot be converted to a sequence") dès qu'un borderDash non
// vide est appliqué à CES séries précises (overlay sur axe caché, données annuelles très
// creuses avec spanGaps) — confirmé en isolant chaque overlay un par un dans un graphique
// dédié : les 5 avec un dash (ex-[6,3]/[2,2]) plantent TOUJOURS, les 4 en dash:[] (solide)
// jamais ; retirer juste borderDash sur les 5 suffit à supprimer le plantage. Remplacé par
// des points visibles (pointRadius) plutôt qu'un simple trait solide identique à l'overlay
// de même couleur, pour garder une distinction visuelle quand plusieurs overlays sont
// combinés — cohérent avec la nature de ces séries (une valeur par an, donc des points
// espacés ont plus de sens qu'un pointillé continu de toute façon).
const STOCK_OVERLAY_METRICS = {
  div:       { label:'Dividende/action',      field:'dividende',    color:THEME.gold,  marked:false },
  ca:        { label:'Chiffre d\'affaires',    field:'ca',           color:THEME.blue,  marked:false },
  margeOp:   { label:'Marge opérationnelle',  field:'margeOp',      color:THEME.green, marked:false },
  detteOcf:  { label:'Dette / OCF',           field:'detteOCF',     color:THEME.red,   marked:false },
  actions:   { label:'Actions en circulation',field:'actions',      color:THEME.gold,  marked:true },
  fcfAction: { label:'FCF/action',            field:'fcfParAction', color:THEME.blue,  marked:true },
  pfcf:      { label:'P/FCF',                 field:'pFcf',         color:THEME.green, marked:true },
  cash:      { label:'Trésorerie',            field:'cash',         color:THEME.red,   marked:true },
  roic:      { label:'ROIC',                  field:'roic',         color:THEME.gold,  marked:true }
};
// Reprojette une série ANNUELLE (hist, indexée par année) sur l'axe hebdomadaire réel
// du cours de bourse : chaque valeur est placée au label le plus proche du 1er juillet
// de son année ("milieu d'année"), le reste à null (spanGaps relie visuellement les
// points connus). Écarté (> ~200 jours) si aucun label de la plage affichée ne
// correspond réellement à cette année (ex. plage "1a" avec un historique de 20 ans) —
// sans ce garde-fou, une valeur ancienne se retrouverait plaquée au bord du graphique.
function mapAnnualSeriesToWeeklyLabels(labels, field, nom){
  const hist = ((nom || activeCompany) && companies[nom || activeCompany]) || [];
  const arr = labels.map(() => null);
  const MAX_DIFF_MS = 200 * 24 * 3600 * 1000;
  hist.forEach(row => {
    const val = row[field];
    if (val == null) return;
    const target = new Date(row.annee, 6, 1).getTime();
    let bestIdx = -1, bestDiff = Infinity;
    for (let i = 0; i < labels.length; i++){
      const diff = Math.abs(new Date(labels[i]).getTime() - target);
      if (diff < bestDiff){ bestDiff = diff; bestIdx = i; }
    }
    if (bestIdx !== -1 && bestDiff <= MAX_DIFF_MS) arr[bestIdx] = val;
  });
  return arr;
}

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

  // Prix juste / prix cible : lignes horizontales constantes sur toute la plage
  // affichée, mêmes couleurs sémantiques que la jauge de valorisation (JUSTE=or,
  // CIBLE=vert) — activables/désactivables séparément des autres indicateurs
  // (demande explicite, pour ne pas surcharger le graphique par défaut).
  const latestStock = activeCompany && companies[activeCompany] ? companies[activeCompany][companies[activeCompany].length - 1] : null;
  const flatLine = (value) => labels.map(() => value);

  const datasets = [];
  if (stockIndicators.price) datasets.push({ label:'Clôture hebdo', data:dataClose, borderColor:THEME.yellow, backgroundColor:'rgba(240,214,61,0.06)', fill:true, tension:0.12, pointRadius:0, borderWidth:1.5, _legend:true, _indexable:true });

  // Régression/SMA/prix juste-cible : outils d'analyse technique sur le PRIX BRUT —
  // rebasés en indexé, une SMA ou une ligne "prix juste" (valeur constante) s'effondre
  // en ligne plate à 100 par rapport à elle-même : du bruit, pas de l'information.
  // Réservés au mode normal, où prix et overlays partagent encore la même logique
  // d'échelle qu'avant l'ajout de cette fonctionnalité (comportement inchangé).
  if (stockScaleMode === 'normal'){
    if (stockIndicators.sma200) datasets.push({ label:'Moyenne mobile 200 sem.', data:dataSma, borderColor:THEME.white, borderWidth:2.5, pointRadius:0, spanGaps:true, tension:0.12, _legend:true });
    if (stockIndicators.sma30) datasets.push({ label:'Moyenne mobile 30 sem.', data:dataSma30, borderColor:THEME.violet, borderWidth:1, pointRadius:0, spanGaps:true, tension:0.12, _legend:true });
    if (stockIndicators.regression){
      datasets.push(
        regStyle(0, 'Régression linéaire (20 ans max)', true),
        regStyle(1, '+1σ', false), regStyle(-1, '−1σ', false),
        regStyle(2, '+2σ', false), regStyle(-2, '−2σ', false)
      );
    }
    if (stockIndicators.prixJusteCible && latestStock){
      if (latestStock.prixJuste != null) datasets.push({ label:'Prix juste', data:flatLine(latestStock.prixJuste), borderColor:THEME.gold, borderWidth:1.5, borderDash:[6,3], pointRadius:0, spanGaps:false, tension:0, _legend:true });
      if (latestStock.prixCible != null) datasets.push({ label:'Prix cible', data:flatLine(latestStock.prixCible), borderColor:THEME.green, borderWidth:1.5, borderDash:[6,3], pointRadius:0, spanGaps:false, tension:0, _legend:true });
    }
  }

  // Overlays : les 8 métriques historiques, combinables librement (aucune limite,
  // retour utilisateur explicite). Annuelles à l'origine, reprojetées sur l'axe hebdo
  // du cours. En mode normal, chacune reçoit son PROPRE axe Y masqué (valeurs réelles,
  // juste pour ne pas écraser visuellement le prix par une échelle commune) ; en
  // indexé/log, elles partagent le même axe que le prix (voir transform plus bas).
  const overlayAxisIds = [];
  Object.keys(stockOverlays).forEach(key => {
    if (!stockOverlays[key]) return;
    const meta = STOCK_OVERLAY_METRICS[key];
    const axisId = 'yOv_' + key;
    const ds = { label:meta.label, data:mapAnnualSeriesToWeeklyLabels(labels, meta.field), borderColor:meta.color, backgroundColor:meta.color, borderWidth:1.75, pointRadius:meta.marked ? 3 : 0, pointHoverRadius:meta.marked ? 5 : 3, spanGaps:true, tension:0.15, _legend:true, _indexable:true };
    if (stockScaleMode === 'normal'){ ds.yAxisID = axisId; overlayAxisIds.push(axisId); }
    datasets.push(ds);
  });

  // Transform d'échelle : appliqué uniquement aux séries "comparables" (prix +
  // overlays, marquées _indexable) — jamais aux outils techniques, déjà exclus du
  // mode non-normal ci-dessus.
  let scaleNote = '';
  if (stockScaleMode === 'indexed'){
    datasets.forEach(ds => {
      if (!ds._indexable) return;
      const base = ds.data.find(v => v != null && v !== 0);
      if (base == null) return;
      ds.data = ds.data.map(v => v == null ? null : (v / base) * 100);
    });
  } else if (stockScaleMode === 'log'){
    let filteredSomething = false;
    datasets.forEach(ds => {
      if (!ds._indexable) return;
      ds.data = ds.data.map(v => {
        if (v != null && v <= 0){ filteredSomething = true; return null; }
        return v;
      });
    });
    if (filteredSomething){
      scaleNote = "Échelle logarithmique : les valeurs nulles ou négatives (ex. marge opérationnelle négative) ne peuvent pas s'y afficher et sont masquées.";
    }
  }

  // type:'linear' toujours explicite (jamais laissé à l'inférence de Chart.js) : sans
  // ça, un axe caché sans aucun dataset visible pointant dessus dans certains ordres de
  // rendu peut faire planter Chart.js à la création de l'instance (constaté en test :
  // clic sur certains overlays plantait toute l'app) — l'explicite ne coûte rien et
  // supprime le risque quel que soit le comportement d'inférence de la version chargée.
  const scalesExtra = {};
  overlayAxisIds.forEach(id => { scalesExtra[id] = { display:false, type:'linear' }; });

  const config = {
    type:'line',
    data:{ labels, datasets },
    options:{ responsive:true, maintainAspectRatio:false,
      // animation:false — sans ça, Chart.js anime la première apparition d'un nouvel
      // axe (ex. overlay "Actions en circulation" ajouté à la volée) et interpole ses
      // options en cours de route, y compris borderDash ([6,3] devenant transitoirement
      // le simple nombre 6) : plante avec "Failed to execute 'setLineDash'... cannot be
      // converted to a sequence", laissant le canvas totalement vide sans jamais se
      // corriger (constaté en test réel : reproductible au clic sur "Actions en circ.",
      // mais UNIQUEMENT la toute première fois qu'un axe overlay apparaît dans la
      // session — les bascules suivantes, même sur un overlay différent, ne replantent
      // pas, cohérent avec un bug de transition d'animation plutôt qu'un problème de
      // données). Un graphique boursier n'a de toute façon aucun besoin d'animation
      // d'apparition.
      animation:false,
      plugins:{ legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true, font:{size:9}, filter: item => item.text && config.data.datasets[item.datasetIndex]._legend}} },
      scales:{
        x:{ grid:{display:false}, ticks:{color:THEME.dim, maxTicksLimit:8}, border:{color:THEME.hair} },
        y:{ grid:baseGrid, ticks:{color:THEME.dim}, type: stockScaleMode === 'log' ? 'logarithmic' : 'linear',
            title: stockScaleMode === 'indexed' ? { display:true, text:'Base 100', color:THEME.dim } : undefined },
        ...scalesExtra
      }
    }
  };
  config._scaleNote = scaleNote;
  return config;
}

// Certaines combinaisons d'overlays (ex. "Actions en circulation" sur un axe caché,
// série très creuse avec spanGaps) font planter Chart.js EN COURS de construction
// (bug interne "Failed to execute 'setLineDash'... cannot be converted to a sequence",
// confirmé en test réel, cause exacte non identifiée côté Chart.js 4.4.4). Le vrai
// problème n'est pas ce plantage isolé mais ses conséquences : si `new Chart()` explose
// AVANT de retourner, `chartInstances.stock = makeChart(...)` n'est jamais exécuté, donc
// notre propre référence ne pointe jamais vers cette instance ratée — mais Chart.js l'a
// quand même enregistrée en interne contre le <canvas>. Résultat : PLUS AUCUN rendu
// futur sur ce canvas ne peut réussir, avec une 2e erreur distincte ("Canvas is already
// in use... must be destroyed before the canvas... can be reused") qui casse le
// graphique DÉFINITIVEMENT pour le reste de la session — exactement le symptôme "je
// clique et après plus rien ne fonctionne" remonté par l'utilisateur. Chart.getChart(canvas)
// retrouve cette instance orpheline (invisible depuis chartInstances) et permet de la
// détruire malgré tout, avant une nouvelle tentative — rend le graphique résilient à ce
// bug quelle que soit sa cause exacte, plutôt que de courir après la cause précise.
function renderStockChartAttempt(canvasEl){
  const config = buildStockChartConfig(stockRange);
  chartInstances.stock = makeChart('stock', 'chartStock', config);
  const noteEl = document.getElementById('stockScaleNote');
  noteEl.textContent = config._scaleNote || '';
  noteEl.style.display = config._scaleNote ? 'block' : 'none';
}
function renderStockChart(){
  if (!stockFull) return;
  const canvasEl = document.getElementById('chartStock');
  if (chartInstances.stock) chartInstances.stock.destroy();
  delete chartInstances.stock;
  const orphan = typeof Chart.getChart === 'function' ? Chart.getChart(canvasEl) : null;
  if (orphan) orphan.destroy();
  const statusEl = document.getElementById('stockStatus');
  try{
    renderStockChartAttempt(canvasEl);
    statusEl.style.display = 'none';
  }catch(e){
    console.error('Erreur graphique boursier (1re tentative) :', e);
    // Nouvelle tentative après nettoyage de l'orpheline laissée par l'échec ci-dessus —
    // dans la quasi-totalité des cas observés en test, elle réussit du premier coup.
    try{
      const orphan2 = typeof Chart.getChart === 'function' ? Chart.getChart(canvasEl) : null;
      if (orphan2) orphan2.destroy();
      renderStockChartAttempt(canvasEl);
      statusEl.style.display = 'none';
      return;
    }catch(e2){
      // Jamais d'échec silencieux, et surtout jamais d'exception qui remonte non
      // attrapée depuis un clic sur un toggle (ça peut laisser l'app entière dans un état
      // cassé) — message visible + détail en console pour diagnostiquer.
      console.error('Erreur graphique boursier (2e tentative) :', e2);
    }
    delete chartInstances.stock;
    statusEl.textContent = "Erreur d'affichage du graphique avec cette combinaison d'options — désactive le dernier réglage changé. (Détail en console.)";
    statusEl.style.display = 'block';
  }
}

document.getElementById('rangeButtons').addEventListener('click', e => {
  const btn = e.target.closest('button[data-range]');
  if (!btn) return;
  stockRange = btn.dataset.range;
  document.querySelectorAll('#rangeButtons button').forEach(b => b.classList.toggle('active', b === btn));
  renderStockChart();
});
// Un seul état partagé (stockIndicators) piloté par DEUX rangées de boutons — la carte
// normale ET la modale de zoom (demande explicite : "tu ne les as pas mis dedans" quand
// zoomé) — donc on resynchronise les DEUX rangées et on redessine les DEUX graphiques
// (celui actuellement caché derrière la modale inclus) à chaque clic, où qu'il ait eu lieu.
function toggleStockIndicator(key){
  stockIndicators[key] = !stockIndicators[key];
  document.querySelectorAll(`[data-indicator="${key}"]`).forEach(b => b.classList.toggle('active', stockIndicators[key]));
  renderStockChart();
  if (zoomKey === 'stock') renderZoomChart();
}
document.getElementById('stockIndicatorToggles').addEventListener('click', e => {
  const btn = e.target.closest('button[data-indicator]');
  if (btn) toggleStockIndicator(btn.dataset.indicator);
});
document.getElementById('zoomStockIndicatorRow').addEventListener('click', e => {
  const btn = e.target.closest('button[data-indicator]');
  if (btn) toggleStockIndicator(btn.dataset.indicator);
});
// Même principe (état partagé, deux rangées de boutons à resynchroniser) pour les
// overlays de métriques et le mode d'échelle du graphique boursier.
function toggleStockOverlay(key){
  stockOverlays[key] = !stockOverlays[key];
  document.querySelectorAll(`[data-overlay="${key}"]`).forEach(b => b.classList.toggle('active', stockOverlays[key]));
  renderStockChart();
  if (zoomKey === 'stock') renderZoomChart();
}
function setStockScaleMode(mode){
  stockScaleMode = mode;
  document.querySelectorAll('[data-scale-mode]').forEach(b => b.classList.toggle('active', b.dataset.scaleMode === mode));
  renderStockChart();
  if (zoomKey === 'stock') renderZoomChart();
}
document.getElementById('stockOverlayToggles').addEventListener('click', e => {
  const btn = e.target.closest('button[data-overlay]');
  if (btn) toggleStockOverlay(btn.dataset.overlay);
});
document.getElementById('zoomStockOverlayRow').addEventListener('click', e => {
  const btn = e.target.closest('button[data-overlay]');
  if (btn) toggleStockOverlay(btn.dataset.overlay);
});
document.getElementById('stockScaleModeRow').addEventListener('click', e => {
  const btn = e.target.closest('button[data-scale-mode]');
  if (btn) setStockScaleMode(btn.dataset.scaleMode);
});
document.getElementById('zoomStockScaleModeRow').addEventListener('click', e => {
  const btn = e.target.closest('button[data-scale-mode]');
  if (btn) setStockScaleMode(btn.dataset.scaleMode);
});

/* ---------- Onglet Comparaison : sélection libre d'entreprises (filtre secteur
   optionnel, mélange possible entre secteurs — cadré par question explicite), cours
   de bourse + dividende/action + FCF/action superposés, tous indexés base 100 (seul
   mode qui reste lisible pour comparer des entreprises à échelles très différentes,
   cadré par question explicite). Sans limite de nombre d'entreprises. */
let comparaisonSelected = [];
let comparaisonRange = '5';
const comparaisonPriceCache = {}; // nom -> {dates, closes}, mis en cache pour éviter de refetcher à chaque changement de plage
let comparaisonPriceRequestId = 0;
// Objet DÉDIÉ, volontairement séparé de chartInstances : ce dernier est vidé en bloc par
// destroyCharts() à CHAQUE changement d'entreprise sur l'onglet Analyse (piège déjà
// documenté), ce qui effacerait silencieusement les graphiques Comparaison — indépendants
// de l'entreprise active — sans jamais les redessiner (aucun code de changement
// d'entreprise ne sait qu'il doit re-render Comparaison).
let comparaisonChartInstances = {};
const COMPARAISON_PALETTE = [THEME.gold, THEME.blue, THEME.green, THEME.red, THEME.violet, THEME.yellow, THEME.white];
function comparaisonColor(idx){
  const round = Math.floor(idx / COMPARAISON_PALETTE.length);
  return { color: COMPARAISON_PALETTE[idx % COMPARAISON_PALETTE.length], dash: round % 2 === 1 ? [6,3] : [] };
}

function populateComparaisonSectorFilter(){
  const select = document.getElementById('comparaisonSectorFilter');
  if (!select || select.dataset.filled) return;
  select.dataset.filled = '1';
  GICS_SECTORS.concat([{ key:'autre', label:'Autre / non classé' }]).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.key;
    opt.textContent = s.label;
    select.appendChild(opt);
  });
}

function renderComparaisonPicker(){
  populateComparaisonSectorFilter();
  const sectorVal = document.getElementById('comparaisonSectorFilter').value;
  const searchVal = stripAccents((document.getElementById('comparaisonSearch').value || '').trim().toLowerCase());
  const list = document.getElementById('comparaisonCompanyList');
  const names = Object.keys(companies).sort((a,b) => a.localeCompare(b, 'fr')).filter(nom => {
    if (sectorVal){
      const latest = companies[nom][companies[nom].length - 1];
      const sec = normalizeSector(latest.secteur);
      if (sectorVal === 'autre' ? sec !== null : sec !== sectorVal) return false;
    }
    if (searchVal && !stripAccents(nom.toLowerCase()).includes(searchVal)) return false;
    return true;
  });
  list.innerHTML = names.map(nom => {
    const checked = comparaisonSelected.includes(nom);
    const logo = companyLogoUrl(nom);
    return `<label class="comparaison-company-row${checked ? ' active' : ''}">
      <input type="checkbox" data-comparaison-toggle="${escapeHtml(nom)}" ${checked ? 'checked' : ''}>
      ${logo ? `<img src="${escapeHtml(logo)}" alt="">` : '<span class="comparaison-company-noimg"></span>'}
      <span>${escapeHtml(nom)}</span>
    </label>`;
  }).join('') || '<p class="valo-intro">Aucune entreprise ne correspond à ce filtre.</p>';

  const chips = document.getElementById('comparaisonSelectedChips');
  chips.innerHTML = comparaisonSelected.map((nom, i) => `<span class="comparaison-chip" style="border-color:${comparaisonColor(i).color}">${escapeHtml(nom)}<button data-comparaison-remove="${escapeHtml(nom)}">✕</button></span>`).join('');
}

function comparaisonToggleCompany(nom){
  const idx = comparaisonSelected.indexOf(nom);
  if (idx === -1) comparaisonSelected.push(nom); else comparaisonSelected.splice(idx, 1);
  renderComparaisonPicker();
  renderComparaisonCharts();
}

document.getElementById('comparaisonSectorFilter').addEventListener('change', renderComparaisonPicker);
document.getElementById('comparaisonSearch').addEventListener('input', renderComparaisonPicker);
document.getElementById('comparaisonCompanyList').addEventListener('change', e => {
  const box = e.target.closest('input[data-comparaison-toggle]');
  if (box) comparaisonToggleCompany(box.dataset.comparaisonToggle);
});
document.getElementById('comparaisonSelectedChips').addEventListener('click', e => {
  const btn = e.target.closest('button[data-comparaison-remove]');
  if (btn) comparaisonToggleCompany(btn.dataset.comparaisonRemove);
});
document.getElementById('comparaisonRangeButtons').addEventListener('click', e => {
  const btn = e.target.closest('button[data-range]');
  if (!btn) return;
  comparaisonRange = btn.dataset.range;
  document.querySelectorAll('#comparaisonRangeButtons button').forEach(b => b.classList.toggle('active', b === btn));
  renderComparaisonCharts();
});

// Même chaîne de repli que loadStockChart() (Sheet dédié → Yahoo → Stooq), mais
// paramétrable par entreprise et mise en cache pour ne pas refetcher à chaque
// changement de plage ou d'entreprise déjà chargée.
async function ensureComparaisonPriceData(nom){
  if (comparaisonPriceCache[nom]) return comparaisonPriceCache[nom];
  const sheetSeries = fetchPriceHistorySeries(nom);
  if (sheetSeries){ comparaisonPriceCache[nom] = sheetSeries; return sheetSeries; }
  const rows = companies[nom];
  const ticker = rows && rows[rows.length - 1].ticker;
  if (!ticker) return null;
  try{
    const r = await fetchYahooWeekly(mapTickerToYahoo(ticker));
    comparaisonPriceCache[nom] = r;
    return r;
  }catch(e){}
  try{
    const r = await fetchStooqWeekly(mapTickerToStooq(ticker));
    comparaisonPriceCache[nom] = r;
    return r;
  }catch(e){}
  return null;
}

// Refonte demandée explicitement : plus de 3 graphiques fixes (prix/dividende/FCF),
// UN seul graphique où n'importe quelle métrique est activable/désactivable, pour
// n'importe quelle entreprise sélectionnée, toutes indexées base 100. L'axe est
// TOUJOURS l'axe hebdomadaire du cours (même si "Prix" est désactivé) : c'est le seul
// axe assez fin pour rester lisible une fois zoomé, et mapAnnualSeriesToWeeklyLabels()
// sait déjà reprojeter n'importe quelle métrique annuelle dessus.
const COMPARAISON_METRICS = {
  price:     { label:'Prix',                   field:null,           cagr:null },
  div:       { label:'Dividende/action',       field:'dividende',    cagr:{5:'cagrDiv5',10:'cagrDiv10',20:'cagrDiv20'} },
  ca:        { label:'Chiffre d\'affaires',    field:'ca',           cagr:{5:'cagrCA5',10:'cagrCA10',20:'cagrCA20'} },
  margeOp:   { label:'Marge opérationnelle',   field:'margeOp',      cagr:null },
  roic:      { label:'ROIC',                   field:'roic',         cagr:null },
  fcfAction: { label:'FCF/action',             field:'fcfParAction', cagr:{5:'cagrFcf5',10:'cagrFcf10',20:'cagrFcf20'} },
  pfcf:      { label:'P/FCF',                  field:'pFcf',         cagr:null },
  actions:   { label:'Actions en circulation', field:'actions',      cagr:{20:'cagrActions'} },
  detteOcf:  { label:'Dette/OCF',              field:'detteOCF',     cagr:null },
  cash:      { label:'Trésorerie',             field:'cash',         cagr:null }
};
let comparaisonMetrics = { price:true, div:false, ca:false, margeOp:false, roic:false, fcfAction:false, pfcf:false, actions:false, detteOcf:false, cash:false };
// Un trait par métrique (en plus de la couleur par entreprise) pour les distinguer sur
// le même graphique — légende Chart.js cliquable pour masquer une combinaison précise
// si ça devient trop chargé (retour utilisateur déjà appliqué au overlay boursier).
const COMPARAISON_METRIC_DASHES = [[],[6,3],[2,2],[8,3,2,3],[1,3],[10,2],[4,4],[6,2,2,2],[3,3,1,3],[12,3]];

// CAGR d'une métrique pour une entreprise : réutilise le champ précalculé du Sheet
// quand il existe (cohérent avec le reste du site), sinon calcul direct premier/dernier
// point sur la fenêtre demandée (couvre marge op./ROIC/P/FCF/dette-OCF/trésorerie, qui
// n'ont pas de CAGR précalculé dans le Sheet).
function computeMetricCagr(nom, key, years){
  const meta = COMPARAISON_METRICS[key];
  const hist = companies[nom];
  if (!hist || !hist.length || !meta.field) return null;
  const latest = hist[hist.length - 1];
  if (meta.cagr && meta.cagr[years] && latest[meta.cagr[years]] != null) return latest[meta.cagr[years]];
  const past = [...hist].reverse().find(r => r.annee <= latest.annee - years);
  if (!past || past[meta.field] == null || latest[meta.field] == null || past[meta.field] <= 0 || latest[meta.field] <= 0) return null;
  return (Math.pow(latest[meta.field] / past[meta.field], 1 / years) - 1) * 100;
}

// Même chaîne de repli que loadStockChart() (Sheet dédié → Yahoo → Stooq), mais
// paramétrable par entreprise et mise en cache — sert d'axe hebdomadaire même quand
// "Prix" est désactivé (voir plus haut).
async function ensureComparaisonPriceData(nom){
  if (comparaisonPriceCache[nom]) return comparaisonPriceCache[nom];
  const sheetSeries = fetchPriceHistorySeries(nom);
  if (sheetSeries){ comparaisonPriceCache[nom] = sheetSeries; return sheetSeries; }
  const rows = companies[nom];
  const ticker = rows && rows[rows.length - 1].ticker;
  if (!ticker) return null;
  try{
    const r = await fetchYahooWeekly(mapTickerToYahoo(ticker));
    comparaisonPriceCache[nom] = r;
    return r;
  }catch(e){}
  try{
    const r = await fetchStooqWeekly(mapTickerToStooq(ticker));
    comparaisonPriceCache[nom] = r;
    return r;
  }catch(e){}
  return null;
}

// Construction SYNCHRONE de la config (lit comparaisonPriceCache déjà rempli) — sur le
// même principe que buildStockChartConfig(), réutilisable telle quelle par la carte ET
// par le zoom (voir zoomSpecialChartConfig()).
function buildComparaisonChartConfig(range){
  let cutoffTime = null;
  if (range !== 'max'){
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - parseInt(range, 10));
    cutoffTime = cutoff.getTime();
  }
  const dateSet = new Set();
  comparaisonSelected.forEach(nom => {
    const s = comparaisonPriceCache[nom];
    if (!s) return;
    s.dates.forEach(d => { if (cutoffTime == null || new Date(d).getTime() >= cutoffTime) dateSet.add(d); });
  });
  const labels = Array.from(dateSet).sort();

  const datasets = [];
  comparaisonSelected.forEach((nom, i) => {
    const { color } = comparaisonColor(i);
    Object.keys(comparaisonMetrics).forEach((key, mi) => {
      if (!comparaisonMetrics[key]) return;
      const meta = COMPARAISON_METRICS[key];
      let raw;
      if (key === 'price'){
        const s = comparaisonPriceCache[nom];
        if (!s) return;
        const byDate = {};
        s.dates.forEach((d, j) => { byDate[d] = s.closes[j]; });
        raw = labels.map(d => byDate[d] != null ? byDate[d] : null);
      } else {
        raw = mapAnnualSeriesToWeeklyLabels(labels, meta.field, nom);
      }
      const base = raw.find(v => v != null && v !== 0);
      if (base == null) return;
      const data = raw.map(v => v == null ? null : (v / base) * 100);
      datasets.push({
        label: `${nom} — ${meta.label}`, data,
        borderColor:color, backgroundColor:color, borderWidth:1.5,
        borderDash: COMPARAISON_METRIC_DASHES[mi % COMPARAISON_METRIC_DASHES.length],
        pointRadius:0, spanGaps:true, tension:0.12
      });
    });
  });

  return {
    type:'line',
    data:{ labels, datasets },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true, font:{size:8.5}}} },
      scales:{
        x:{ grid:{display:false}, ticks:{color:THEME.dim, maxTicksLimit:8} },
        y:{ grid:baseGrid, ticks:{color:THEME.dim}, title:{display:true, text:'Base 100', color:THEME.dim} }
      }
    }
  };
}

// Badges au-dessus du graphique : performance sur la plage choisie (si "Prix" actif) +
// CAGR 5/10/20a par métrique active × entreprise (retour utilisateur explicite : "même
// quand je zoome, tu vas me marquer chacun leur croissance... quand je clique sur un an,
// ça va me marquer en haut la performance sur un an").
function comparaisonBadgesHtml(){
  if (!comparaisonSelected.length) return '';
  let html = '';
  if (comparaisonMetrics.price){
    let cutoffTime = null;
    if (comparaisonRange !== 'max'){
      const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - parseInt(comparaisonRange, 10));
      cutoffTime = cutoff.getTime();
    }
    html += comparaisonSelected.map(nom => {
      const s = comparaisonPriceCache[nom];
      if (!s) return '';
      const pts = s.dates.map((d, i) => ({ d, c: s.closes[i] })).filter(p => cutoffTime == null || new Date(p.d).getTime() >= cutoffTime);
      if (pts.length < 2) return '';
      const perf = ((pts[pts.length - 1].c / pts[0].c) - 1) * 100;
      const perfTxt = (perf >= 0 ? '+' : '') + perf.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}) + '%';
      return `<span class="chart-badge mediane-badge">${escapeHtml(nom)} · Perf. <b>${perfTxt}</b></span>`;
    }).join('');
  }
  Object.keys(COMPARAISON_METRICS).forEach(key => {
    if (key === 'price' || !comparaisonMetrics[key]) return;
    comparaisonSelected.forEach(nom => {
      const c5 = computeMetricCagr(nom, key, 5), c10 = computeMetricCagr(nom, key, 10), c20 = computeMetricCagr(nom, key, 20);
      if (c5 == null && c10 == null && c20 == null) return;
      const fmt = v => v != null ? (v >= 0 ? '+' : '') + v.toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}) + '%' : '—';
      html += `<span class="chart-badge mediane-badge">${escapeHtml(nom)} · ${COMPARAISON_METRICS[key].label} CAGR <b>${fmt(c5)}/${fmt(c10)}/${fmt(c20)}</b></span>`;
    });
  });
  return html;
}
function renderComparaisonBadges(){
  const html = comparaisonBadgesHtml();
  const box = document.getElementById('comparaisonBadgesRow');
  if (box) box.innerHTML = html;
  const zoomBox = document.getElementById('zoomComparaisonBadgesRow');
  if (zoomBox && zoomKey === 'comparaison') zoomBox.innerHTML = html;
}

async function renderComparaisonCharts(){
  const statusEl = document.getElementById('comparaisonStatus');
  if (!comparaisonSelected.length){
    if (comparaisonChartInstances.unified){ comparaisonChartInstances.unified.destroy(); delete comparaisonChartInstances.unified; }
    statusEl.textContent = 'Sélectionne au moins une entreprise pour afficher la comparaison.';
    statusEl.style.display = 'block';
    renderComparaisonBadges();
    if (zoomKey === 'comparaison') renderZoomChart();
    return;
  }
  statusEl.textContent = 'Chargement des historiques de cours…';
  statusEl.style.display = 'block';
  const myToken = ++comparaisonPriceRequestId;
  const selection = comparaisonSelected.slice();
  const results = await Promise.all(selection.map(ensureComparaisonPriceData));
  if (myToken !== comparaisonPriceRequestId) return; // sélection changée entre-temps, résultat obsolète
  const missing = selection.filter((nom, i) => !results[i]);

  if (comparaisonChartInstances.unified) comparaisonChartInstances.unified.destroy();
  comparaisonChartInstances.unified = makeChart('comparaison', 'chartComparaison', buildComparaisonChartConfig(comparaisonRange));
  statusEl.textContent = missing.length ? ('Cours indisponible pour : ' + missing.join(', ')) : '';
  statusEl.style.display = missing.length ? 'block' : 'none';
  renderComparaisonBadges();
  if (zoomKey === 'comparaison') renderZoomChart();
}

function toggleComparaisonMetric(key){
  comparaisonMetrics[key] = !comparaisonMetrics[key];
  document.querySelectorAll(`[data-metric="${key}"]`).forEach(b => b.classList.toggle('active', comparaisonMetrics[key]));
  renderComparaisonCharts();
}
document.getElementById('comparaisonMetricToggles').addEventListener('click', e => {
  const btn = e.target.closest('button[data-metric]');
  if (btn) toggleComparaisonMetric(btn.dataset.metric);
});
document.getElementById('zoomComparaisonMetricToggles').addEventListener('click', e => {
  const btn = e.target.closest('button[data-metric]');
  if (btn) toggleComparaisonMetric(btn.dataset.metric);
});

let zoomComparaisonRange = '5';
function openComparaisonZoom(){
  zoomComparaisonRange = comparaisonRange;
  openZoom('comparaison', 'Comparaison multi-entreprises');
}

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
const ZOOM_HISTORICAL_KEYS = ['div','ca','marges','fcf','pfcf','actions','dette','cash','ocf','pfcfpocf'];
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
  comparaison: ZOOM_STOCK_RANGES,
  macroCycle: ZOOM_MACRO_CYCLE_RANGES,
  macroRotation: ZOOM_MACRO_ROTATION_RANGES,
  macroRanking: MACRO_RANKING_OPTIONS
};
function zoomSpecialRangeGet(){
  if (zoomKey === 'stock') return zoomStockRange;
  if (zoomKey === 'comparaison') return zoomComparaisonRange;
  if (zoomKey === 'macroCycle') return zoomMacroCycleRange;
  if (zoomKey === 'macroRotation') return zoomMacroRotationRange;
  if (zoomKey === 'macroRanking') return zoomMacroRankingRow;
  return null;
}
function zoomSpecialRangeSet(val){
  if (zoomKey === 'stock') zoomStockRange = val;
  else if (zoomKey === 'comparaison'){ zoomComparaisonRange = val; comparaisonRange = val; document.querySelectorAll('#comparaisonRangeButtons button').forEach(b => b.classList.toggle('active', b.dataset.range === val)); }
  else if (zoomKey === 'macroCycle') zoomMacroCycleRange = val;
  else if (zoomKey === 'macroRotation') zoomMacroRotationRange = val;
  else if (zoomKey === 'macroRanking') zoomMacroRankingRow = val;
}
function zoomSpecialChartConfig(){
  if (zoomKey === 'stock') return buildStockChartConfig(zoomStockRange);
  if (zoomKey === 'comparaison') return buildComparaisonChartConfig(zoomComparaisonRange);
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
  const canvasEl = document.getElementById('zoomCanvas');
  // newChartWithOrphanCleanup() gère elle-même l'échec de construction (voir sa doc) —
  // jamais d'exception non attrapée depuis ce point, une combinaison d'overlays qui
  // plante ne doit pas laisser toute la modale/l'app cassée. Bug remonté : sans ce
  // nettoyage, un premier échec (ex. bug setLineDash) laissait window.__zoomChart à null
  // en permanence, rendant le bouton panier/export silencieusement inopérant même après
  // avoir rouvert le zoom.
  if (ZOOM_SPECIAL_RANGES[zoomKey]){
    const config = zoomSpecialChartConfig();
    if (config) window.__zoomChart = newChartWithOrphanCleanup(canvasEl, config);
    if (zoomKey === 'stock'){
      const noteEl = document.getElementById('zoomStockScaleNote');
      noteEl.textContent = (config && config._scaleNote) || '';
      noteEl.style.display = (config && config._scaleNote) ? 'block' : 'none';
    }
    return;
  }
  const baseConfig = chartConfigs[zoomKey];
  if (!baseConfig) return;
  const nYears = (!ZOOM_HISTORICAL_KEYS.includes(zoomKey) || zoomRange === 'max') ? null : parseInt(zoomRange, 10);
  window.__zoomChart = newChartWithOrphanCleanup(canvasEl, sliceChartConfigByYears(baseConfig, nYears));
}

function openZoom(key, title){
  if (!ZOOM_SPECIAL_RANGES[key] && !chartConfigs[key]) return;
  zoomKey = key;
  zoomRange = 'max';
  document.getElementById('zoomTitle').textContent = title;
  // La modale doit être rendue visible AVANT de construire le graphique : Chart.js lit
  // les dimensions réelles du <canvas> à la création, et un canvas encore dans un
  // ancêtre display:none mesure 0×0 — le graphique se crée bien (pas d'erreur) mais ne
  // dessine rien, et ne se corrige jamais tout seul ensuite (rien ne déclenche de resize
  // après coup). Constaté en test direct : 0×0 avant ce réordonnancement, dimensions
  // réelles après.
  document.getElementById('zoomModal').style.display = 'flex';
  renderZoomRangeRow();
  renderZoomCagrRow();
  renderZoomChart();
  const indicatorRow = document.getElementById('zoomStockIndicatorRow');
  indicatorRow.style.display = key === 'stock' ? 'flex' : 'none';
  if (key === 'stock') indicatorRow.querySelectorAll('button[data-indicator]').forEach(b => b.classList.toggle('active', stockIndicators[b.dataset.indicator]));
  const overlayRow = document.getElementById('zoomStockOverlayRow');
  overlayRow.style.display = key === 'stock' ? 'flex' : 'none';
  if (key === 'stock') overlayRow.querySelectorAll('button[data-overlay]').forEach(b => b.classList.toggle('active', stockOverlays[b.dataset.overlay]));
  const scaleModeRow = document.getElementById('zoomStockScaleModeRow');
  scaleModeRow.style.display = key === 'stock' ? 'flex' : 'none';
  if (key === 'stock') scaleModeRow.querySelectorAll('button[data-scale-mode]').forEach(b => b.classList.toggle('active', b.dataset.scaleMode === stockScaleMode));
  // Médianes P/FCF (et P/OCF) + toggle P/FCF vs P/OCF : visibles seulement en petit sur
  // la carte avant ce correctif (retour utilisateur : "quand je zoome je dois pouvoir le
  // voir") — reproduits ici depuis les mêmes données déjà en mémoire (latest).
  const medianeRow = document.getElementById('zoomMedianeBadgesRow');
  const pfcfPocfRow = document.getElementById('zoomPfcfPocfToggles');
  const latestZoom = activeCompany && companies[activeCompany] ? companies[activeCompany][companies[activeCompany].length - 1] : null;
  if ((key === 'pfcf' || key === 'pfcfpocf') && latestZoom){
    medianeRow.innerHTML = key === 'pfcf'
      ? medianeBadgeHtml('Médiane 10a', latestZoom.medianePFCF) + medianeBadgeHtml('Médiane 20a', latestZoom.medianePFCF20)
      : medianeBadgeHtml('Médiane P/FCF 10a', latestZoom.medianePFCF) + medianeBadgeHtml('Médiane P/FCF 20a', latestZoom.medianePFCF20) +
        medianeBadgeHtml('Médiane P/OCF 10a', latestZoom.medianePOcf) + medianeBadgeHtml('Médiane P/OCF 20a', latestZoom.medianePOcf20);
  } else {
    medianeRow.innerHTML = '';
  }
  pfcfPocfRow.style.display = key === 'pfcfpocf' ? 'flex' : 'none';
  if (key === 'pfcfpocf') pfcfPocfRow.querySelectorAll('button[data-series]').forEach(b => b.classList.toggle('active', pfcfPocfVisible[b.dataset.series]));
  const comparaisonMetricRow = document.getElementById('zoomComparaisonMetricToggles');
  comparaisonMetricRow.style.display = key === 'comparaison' ? 'flex' : 'none';
  if (key === 'comparaison'){
    comparaisonMetricRow.querySelectorAll('button[data-metric]').forEach(b => b.classList.toggle('active', comparaisonMetrics[b.dataset.metric]));
    document.getElementById('zoomComparaisonBadgesRow').innerHTML = comparaisonBadgesHtml();
  } else {
    document.getElementById('zoomComparaisonBadgesRow').innerHTML = '';
  }
  // Logo de l'entreprise affiché UNIQUEMENT en zoom (pas sur la petite carte, demande
  // explicite) — pour que l'export PDF d'un graphique zoomé reste identifiable. Ne
  // concerne que les graphiques liés à une entreprise (historiques + cours de bourse),
  // pas les graphiques macro qui partagent le même #zoomModal.
  const logoEl = document.getElementById('zoomEntityLogo');
  const isCompanyChart = key === 'stock' || ZOOM_HISTORICAL_KEYS.includes(key);
  const logo = isCompanyChart && activeCompany ? companyLogoUrl(activeCompany) : null;
  logoEl.style.display = logo ? '' : 'none';
  if (logo) logoEl.src = logo;
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

// rachatPct (%/an) : levier optionnel sur les actions en circulation, demande explicite
// de l'utilisateur ("introduire dans le calcul les actions en circulation... la baisse
// moyenne des actions"). Défaut 0 pour les 3 scénarios (voir renderValorisation) — le
// comportement existant est inchangé tant que l'utilisateur ne touche pas ce champ.
// Volontairement traité comme un levier ADDITIONNEL et non un recalcul automatique
// depuis cagrActions (historique déjà en mémoire, colonne cagrActions) : le CAGR
// FCF/OCF saisi dans chaque scénario est déjà celui du FCF/OCF PAR ACTION historique
// (fcfParAction), qui intègre donc déjà l'effet des rachats passés — en déduire
// automatiquement un 2e ajustement dans la même formule risquerait de compter l'effet
// des rachats deux fois. Ici rachatPct exprime explicitement une hypothèse
// SUPPLÉMENTAIRE, au-delà de la tendance déjà capturée par le CAGR historique — positif
// = rachats nets (dilution du nombre d'actions), négatif = émission nette (dilution de
// la valeur par action).
function computeScenario(fcfActuel, prixActuel, cagr, multiple, rachatPct){
  const prixJusteSim = fcfActuel * multiple;
  const prixCible = prixJusteSim * 0.8;
  const rachatFactor = Math.pow(1 + (rachatPct || 0) / 100, 5);
  const prixEst5A = fcfActuel * Math.pow(1 + cagr / 100, 5) * multiple * rachatFactor;
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
      <div class="scenario-row">
        <div class="scenario-row-head"><span>Rachat d'actions suppl. (%/an)</span><span class="val" id="vo-${s.key}-rachatVal">—</span></div>
        <input type="number" class="scenario-number" id="vo-${s.key}-rachat" step="0.1" title="Hypothèse additionnelle de baisse des actions en circulation, au-delà de la tendance déjà intégrée dans le CAGR ci-dessus. 0 = pas d'hypothèse supplémentaire.">
      </div>
      <div class="scenario-results">
        <div><div class="r-k">Prix juste sim.</div><div class="r-v" id="vo-${s.key}-prixJuste">—</div></div>
        <div><div class="r-k">Prix cible (-20%)</div><div class="r-v" id="vo-${s.key}-prixCible">—</div></div>
        <div><div class="r-k">Prix est. (5a)</div><div class="r-v" id="vo-${s.key}-prixEst">—</div></div>
        <div><div class="r-k">Rendement (5a)</div><div class="r-v" id="vo-${s.key}-rendement">—</div></div>
      </div>
      <div class="scenario-chart-holder"><canvas id="vo-${s.key}-chart"></canvas><button class="chart-card-cart-btn" onclick="addChartInstanceToCart(scenarioCharts['${s.key}'], '${s.label}', this)" title="Ajouter au panier d'export" aria-label="Ajouter au panier d'export">🧺</button></div>
      <div class="macro-export-row">
        <button onclick="exportScenarioChartAsPdf('${s.key}')">PDF</button>
        <button onclick="exportScenarioChartAsImage('${s.key}','png')">PNG</button>
        <button onclick="exportScenarioChartAsImage('${s.key}','jpg')">JPG</button>
      </div>
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
  // Libellés dynamiques FCF/OCF sur les tuiles CAGR et médiane — sans ça, rien ne
  // distinguait "CAGR (historique)" d'un CAGR FCF ou OCF une fois la valorisation
  // enregistrée/rechargée, source de doute signalée explicitement par l'utilisateur.
  document.getElementById('voCagrLabel').textContent = 'CAGR ' + label + ' (historique)';
  document.getElementById('voMedianeLabel').textContent = 'Médiane ' + label + ' (historique)';
  document.getElementById('voMediane20Label').textContent = 'Médiane ' + label + ' (20 ans)';
  document.getElementById('voCagrHist').textContent = cagrHist != null ? fmtPct(cagrHist) : 'N/D';
  document.getElementById('voMedianeHist').textContent = medianeHist != null ? medianeHist.toLocaleString('fr-FR', {minimumFractionDigits:1}) + 'x' : 'N/D';
  document.getElementById('voMediane20').textContent = mediane20 != null ? mediane20.toLocaleString('fr-FR', {minimumFractionDigits:1}) + 'x' : 'N/D';

  scenarioValues = {};
  SCENARIOS.forEach(s => {
    scenarioValues[s.key] = {
      cagr: cagrHist != null ? +(cagrHist + s.deltaCagr).toFixed(1) : 0,
      multiple: medianeHist != null ? +(medianeHist + s.deltaMultiple).toFixed(1) : 0,
      rachat: 0
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
  const rachatInput = document.getElementById('vo-' + s.key + '-rachat');
  document.getElementById('vo-' + s.key + '-fcf').textContent = fcfActuel != null ? fmtEUR(fcfActuel) : 'N/D';

  cagrInput.value = scenarioValues[s.key].cagr;
  multInput.value = scenarioValues[s.key].multiple;
  rachatInput.value = scenarioValues[s.key].rachat;

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
    scenarioValues[s.key].rachat = parseFloat(rachatInput.value) || 0;
    syncQuickButtons();
    updateScenarioCard(s, hist, fcfActuel, prixActuel);
  }
  cagrInput.addEventListener('input', update);
  multInput.addEventListener('input', update);
  rachatInput.addEventListener('input', update);
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
  const { cagr, multiple, rachat } = scenarioValues[s.key];
  document.getElementById('vo-' + s.key + '-cagrVal').textContent = cagr.toLocaleString('fr-FR', {minimumFractionDigits:1}) + '%';
  document.getElementById('vo-' + s.key + '-multVal').textContent = multiple.toLocaleString('fr-FR', {minimumFractionDigits:1}) + 'x';
  document.getElementById('vo-' + s.key + '-rachatVal').textContent = (rachat >= 0 ? '+' : '') + rachat.toLocaleString('fr-FR', {minimumFractionDigits:1}) + '%';

  if (fcfActuel == null || prixActuel == null){
    ['prixJuste','prixCible','prixEst','rendement'].forEach(k => { document.getElementById('vo-'+s.key+'-'+k).textContent = 'N/D'; });
    return;
  }

  const { prixJusteSim, prixCible, prixEst5A, rendement5A } = computeScenario(fcfActuel, prixActuel, cagr, multiple, rachat);

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
  // requestAnimationFrame plutôt qu'un resize() synchrone immédiat : déplacer la carte
  // + changer sa classe ne force pas de reflow tout de suite, donc Chart.js pouvait lire
  // les DIMENSIONS D'AVANT le changement (encore celles de la petite carte) et figer le
  // canvas à cette taille — symptôme observé à l'ouverture comme à la fermeture ("il
  // s'étend trop grand"). On laisse le navigateur reflow avant de mesurer.
  requestAnimationFrame(() => { if (scenarioCharts[key]) scenarioCharts[key].resize(); });
}
function closeScenarioZoom(){
  const body = document.getElementById('scenarioZoomBody');
  const card = body.firstElementChild;
  if (card && card._zoomHome){
    card.classList.remove('scenario-card-zoomed');
    const { parent, next } = card._zoomHome;
    // `next` peut être devenu un nœud orphelin si #scenarioGrid a été reconstruit
    // (changement FCF/OCF, changement d'entreprise) pendant que la carte était zoomée —
    // insertBefore lèverait alors une exception et laisserait la carte coincée hors du
    // DOM normal. Repli sûr : simplement l'ajouter à la fin du conteneur actuel.
    try{
      if (next && next.parentNode === parent) parent.insertBefore(card, next);
      else parent.appendChild(card);
    }catch(e){ parent.appendChild(card); }
    const key = card.dataset.key;
    requestAnimationFrame(() => { if (scenarioCharts[key]) scenarioCharts[key].resize(); });
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
  SCENARIOS.forEach(s => { snapshot[s.key] = { cagr: scenarioValues[s.key].cagr, multiple: scenarioValues[s.key].multiple, rachat: scenarioValues[s.key].rachat || 0 }; });
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
    scenarioValues[s.key] = { cagr: v.cagr, multiple: v.multiple, rachat: v.rachat || 0 };
    const cagrInput = document.getElementById('vo-' + s.key + '-cagr');
    const multInput = document.getElementById('vo-' + s.key + '-mult');
    const rachatInput = document.getElementById('vo-' + s.key + '-rachat');
    if (cagrInput) cagrInput.value = v.cagr;
    if (multInput) multInput.value = v.multiple;
    if (rachatInput) rachatInput.value = v.rachat || 0;
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
  box.innerHTML = blocks.join('') + `<button class="analyse-valo-link" onclick="switchPage('pageValorisation')">Voir la Valorisation →</button>`;
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
      ? `<table class="print-table"><thead><tr><th>Entreprise</th></tr></thead><tbody>${noms.map(n => {
          const logo = companyLogoUrl(n);
          const logoImg = logo ? `<img class="print-inline-logo" src="${logo}" alt="">` : '';
          return `<tr><td>${logoImg}${n.replace(/</g,'&lt;')}</td></tr>`;
        }).join('')}</tbody></table>`
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
// Phase agrandie en plein écran (index dans chain.phases, ou null) — CSS pur, pas de
// déplacement de nœud DOM comme le zoom scénario : quasi toute interaction dans une
// phase (ajouter une entreprise, éditer un texte...) redéclenche renderCerveauPhases()
// qui reconstruit tout le HTML depuis zéro, ce qui casserait une référence DOM déplacée.
// Un simple flag relu à chaque rendu survit intact à ces reconstructions.
let cerveauZoomedPhase = null;

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

// ⚠️⚠️⚠️ DONNÉES CRITIQUES — NE JAMAIS SUPPRIMER/ÉCRASER cerveauData EN DEHORS D'UNE
// ACTION UTILISATEUR EXPLICITE (bouton ✕/Retirer/Supprimer cliqué PAR l'utilisateur). ⚠️⚠️⚠️
// L'utilisateur saisit ici des heures de contenu (chaînes de valeur, analyses, notes)
// qu'il ne peut pas reconstituer facilement. Toute future modification de ce module —
// migration de schéma, refactoring, changement de structure — DOIT être strictement
// ADDITIVE : migrateCerveauChains() ne fait que convertir/compléter des champs
// existants, jamais purger un champ dont la conversion échoue (voir son usage de
// `|| valeurExistante` partout). Ne jamais réinitialiser cerveauData à {} avant un
// rechargement IndexedDB, ne jamais remplacer un objet stocké au lieu de le fusionner
// (voir loadCerveauData() : `Object.keys(stored.chains).forEach(k => cerveauData.chains[k] = ...)`,
// jamais `cerveauData.chains = stored.chains`). En cas de doute sur une migration,
// GARDER l'ancien champ en plus du nouveau plutôt que de le supprimer (coût de stockage
// négligeable face au risque de perte de données).
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

// Confirmation en 2 clics inline (jamais confirm() natif, voir "Pièges techniques"
// point 7) — remis à null à chaque re-render de ce niveau pour ne jamais rester coincé
// en état "confirmation en attente" après avoir navigué ailleurs (même logique que
// analyseDeleteConfirming pour la suppression d'une fiche Analyse développée).
let cerveauDeleteConfirmingChainId = null;
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
      ? chains.map(c => `<div class="sector-box cerveau-chain-box" data-chain="${c.id}">
          <button class="cec-remove cerveau-chain-delete" data-delete-chain="${c.id}" title="Supprimer la chaîne">${cerveauDeleteConfirmingChainId === c.id ? '⚠️' : '✕'}</button>
          <h3>${c.nom}</h3><div class="count">${c.phases.length} phases</div>
        </div>`).join('')
      : '<div class="objectifs-empty">Aucune chaîne de valeur pour ce secteur pour l\'instant.</div>'}</div>`;

  box.querySelector('[data-back="secteurs"]').addEventListener('click', () => { cerveauView = { level:'secteurs' }; renderCerveau(); });
  box.querySelectorAll('.cerveau-chain-box').forEach(el => {
    el.addEventListener('click', () => { cerveauView = { level:'phases', secteur, chainId: el.dataset.chain }; renderCerveau(); });
  });
  box.querySelectorAll('[data-delete-chain]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const chainId = btn.dataset.deleteChain;
      if (cerveauDeleteConfirmingChainId !== chainId){ cerveauDeleteConfirmingChainId = chainId; renderCerveauChaines(box); return; }
      cerveauData.chains[secteur] = cerveauData.chains[secteur].filter(c => c.id !== chainId);
      cerveauDeleteConfirmingChainId = null;
      persistCerveauData();
      renderCerveauChaines(box);
    });
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
          // texte en clair (texte) → HTML (texteHtml) pour permettre le gras inline via
          // sélection (voir cerveauTextBlockHtml) — texte existant simplement échappé,
          // aucune perte, migration idempotente (ne touche pas texteHtml déjà présent).
          b.textBlocks.forEach(tb => {
            if (tb.texteHtml == null) tb.texteHtml = escapeHtml(tb.texte || '');
          });
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

// Icônes "B" compactes (gras=Titre, italique=Sous-titre, normal=Corps) plutôt que des
// boutons texte pleine largeur — demande explicite : les libellés "Titre/Sous-titre/
// Corps" empilés au-dessus de chaque texte prenaient trop de place dès qu'on ajoute
// plusieurs blocs de texte. Positionnées sur le CÔTÉ (colonne verticale à gauche du
// textarea, voir cerveauTextBlockHtml) plutôt qu'au-dessus.
// Toolbar globale unique (retour utilisateur explicite : "que tu le mettes une seule
// fois tout en haut de l'écran", plus de contrôles répétés sur chaque bloc) — agit sur
// le DERNIER bloc de texte ayant reçu le focus (cerveauActiveTB), quelle que soit la
// carte/phase où il se trouve. Gras/italique via execCommand sur la SÉLECTION en cours
// (comme avant, comportement fiable confirmé en test réel) ; style/taille sur tout le
// bloc actif (un point de police par caractère isolé n'existe pas dans le modèle de
// données actuel, ni dans la demande — "je sélectionne mon texte, en bold ou pas").
// Simplifié suite à un vrai bug remonté (sélectionner un mot et cliquer "Titre"
// mettait tout le BLOC en titre et "effaçait" visuellement du contenu) : la version
// précédente appliquait style/taille à tout le tb (propriété de bloc), pas à la
// sélection — contraire à la demande initiale ("gras, texte normal, italique", jamais
// mention de tailles/titres). Gras/Italique/Normal uniquement, tous via execCommand sur
// la SÉLECTION en cours — même mécanisme fiable déjà validé pour le gras, jamais de
// Range API manuelle (piège connu, voir plus haut : produit des résultats imprévisibles
// dès que la sélection touche une mise en forme existante). Aucun renderCerveau() après
// coup : execCommand modifie déjà le DOM visible directement, un re-render perdrait le
// focus/la sélection pour rien.
let cerveauActiveTB = null;
function syncCerveauToolbarState(){
  const toolbar = document.getElementById('cerveauTextToolbar');
  if (!toolbar) return;
  toolbar.classList.toggle('cerveau-toolbar-disabled', !(cerveauActiveTB && document.body.contains(cerveauActiveTB.el)));
}
(function initCerveauTextToolbar(){
  const toolbar = document.getElementById('cerveauTextToolbar');
  if (!toolbar) return;
  toolbar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || !cerveauActiveTB || !document.body.contains(cerveauActiveTB.el)) return;
    const { tb, el } = cerveauActiveTB;
    el.focus();
    if (btn.dataset.action === 'tb-bold') document.execCommand('bold');
    else if (btn.dataset.action === 'tb-italic') document.execCommand('italic');
    else if (btn.dataset.action === 'tb-normal') document.execCommand('removeFormat');
    else return;
    tb.texteHtml = el.innerHTML;
    persistCerveauData();
  });
})();

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
const CERVEAU_FONT_SIZE_DEFAULTS = { titre:17, soustitre:13, corps:12 };
const CERVEAU_FONT_SIZE_MIN = 9;
const CERVEAU_FONT_SIZE_MAX = 32;
// Rangée horizontale : icônes de style + bouton gras + boutons +/- taille en colonne
// étroite à GAUCHE, zone de texte à droite (flex:1) — libère la hauteur qu'occupait la
// rangée de boutons pleine largeur au-dessus de chaque texte, important quand plusieurs
// blocs de texte sont empilés sur la même carte. Zone de texte en `contenteditable`
// (plus un `<textarea>`) : demande explicite — pouvoir surligner un passage et le mettre
// en gras SANS changer le style de tout le bloc, pour composer titre+texte normal dans
// un seul segment plutôt que d'empiler des blocs séparés. `texteHtml` (au lieu de
// `texte` en clair) stocke ce gras inline ; migré automatiquement depuis `texte` par
// migrateCerveauChains(). Bénéfice secondaire : un contenteditable sans hauteur fixée
// épouse nativement la hauteur de son contenu, plus besoin d'autoGrowTextarea ici — un
// titre d'une ligne reste donc aussi bas qu'une ligne.
// Contrôles en rangée HORIZONTALE compacte, sous le texte (près de "+ Texte/+ Image/+
// Lien/✕ Retirer ce bloc") — remplace l'ancienne colonne verticale à côté du texte
// (retour explicite : la colonne prenait de la largeur au texte en permanence, la
// hauteur/largeur du bloc ne pouvait donc jamais suivre un texte court). Le texte
// occupe maintenant toute la largeur disponible, le bloc peut donc vraiment épouser sa
// taille (court = étroit/bas, long = large/haut).
// Gras sur la sélection : document.execCommand('bold') — un essai précédent avec une
// implémentation manuelle (Range API, extractContents/insertNode) produisait des
// résultats imprévisibles sur de vraies sélections souris (mettait en gras plus que la
// zone sélectionnée dès que la sélection touchait un <b> existant, confirmé en test
// réel avec de vrais clics/glissés). execCommand('bold') est le comportement NATIF du
// navigateur pour ce geste précis (toggle correct y compris sur sélections partielles/
// imbriquées, exactement le comportement "comme sur Word" demandé) — fiable ici car
// déclenché par un vrai clic utilisateur (mousedown+preventDefault juste avant préserve
// la sélection sans perdre le geste "trusted").
// Contrôles de style/gras/taille RETIRÉS d'ici (retour utilisateur explicite : répétés
// sur chaque bloc, prenaient trop de place dès qu'on empile plusieurs textes) — déplacés
// une seule fois en haut de l'écran, voir #cerveauTextToolbar/cerveauApplyToolbarAction()
// plus bas. Ne reste ici que le bouton de suppression, propre à CE bloc précis.
function cerveauTextBlockHtml(tb){
  const size = tb.fontSize || CERVEAU_FONT_SIZE_DEFAULTS[tb.style || 'corps'];
  const html = tb.texteHtml != null ? tb.texteHtml : escapeHtml(tb.texte || '');
  return `<div class="cec-textblock" data-tb="${tb.id}">
    <div class="cec-free-text cec-free-text-${tb.style || 'corps'}" style="font-size:${size}px" contenteditable="true" data-action="free-text" data-placeholder="Texte…">${html}</div>
    <div class="cec-textblock-controls">
      <button class="cec-remove" data-action="free-text-delete" title="Retirer ce texte">✕ Retirer ce texte</button>
    </div>
  </div>`;
}
function cerveauFreeBlockHtml(bloc, phaseIdx, blocIdx){
  const width = bloc.width || 200;
  const textBlocks = bloc.textBlocks || [];
  const textZone = textBlocks.map(tb => cerveauTextBlockHtml(tb)).join('');
  // Zone image optionnelle, symétrique au texte : affichée seulement si une image
  // existe déjà ou si l'utilisateur vient de cliquer "+ Image" (bloc._imageOpen,
  // transitoire) — sinon un bloc purement texte n'a plus besoin d'y consacrer de place.
  const showImage = !!bloc.image || bloc._imageOpen;
  const imageZone = showImage ? cerveauImageZoneHtml(bloc.image, 'free', bloc.imgHeight || 110) : '';
  // Sans zone image, il n'y a plus de poignée de redimensionnement (normalement portée
  // par .cec-image) — on en ajoute une dédiée à la largeur seule sur le bloc.
  const widthOnlyHandle = showImage ? '' : `<div class="cec-resize-handle cec-resize-handle-width" data-action="free-resize-width" title="Redimensionner la largeur (glisser)"></div>`;
  const addImageBtn = showImage ? '' : `<button class="cec-add-text-btn" data-action="free-add-image">+ Image</button>`;
  // Lien cliquable indépendant de l'image (URL vers un site/concurrent/produit) —
  // demande explicite, distincte de "image ajoutée par URL" (qui existait déjà via le
  // bouton 🔗 sur la zone image). Chip affichée si `bloc.lien` est défini ; sinon un
  // champ de saisie si `bloc._linkOpen` (transitoire) ; sinon juste le bouton "+ Lien".
  let linkZone = '';
  if (bloc.lien){
    const safeLien = bloc.lien.replace(/"/g, '&quot;');
    linkZone = `<div class="cec-link-chip-row"><a class="cec-link-chip" href="${safeLien}" target="_blank" rel="noopener">🔗 ${escapeHtml(bloc.lien.replace(/^https?:\/\//,'').slice(0,40))}</a><button class="cec-remove" data-action="free-link-clear" title="Retirer le lien">✕</button></div>`;
  } else if (bloc._linkOpen){
    linkZone = `<div class="cec-url-row"><input type="text" class="cec-url-input" data-role="link-input" placeholder="Coller un lien (https://…)"><button class="cec-url-ok" data-action="free-link-ok">OK</button></div>`;
  }
  const addLinkBtn = (bloc.lien || bloc._linkOpen) ? '' : `<button class="cec-add-text-btn" data-action="free-add-link">+ Lien</button>`;
  return `<div class="cerveau-freeblock" style="width:${width}px;position:relative;" data-phase="${phaseIdx}" data-bloc="${blocIdx}">
    ${imageZone}
    <div class="cec-body">
      ${textZone}
      ${linkZone}
      <div class="cerveau-freeblock-actions">
        <button class="cec-add-text-btn" data-action="free-add-text">+ Texte</button>
        ${addImageBtn}
        ${addLinkBtn}
      </div>
      <button class="cec-remove cec-remove-free" data-action="free-delete">✕ Retirer ce bloc</button>
    </div>
    ${widthOnlyHandle}
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
  const textHtml = (bloc.textBlocks || []).filter(tb => (tb.texteHtml || tb.texte)).map(tb => `<p class="print-cec-text-${tb.style || 'corps'}">${tb.texteHtml != null ? tb.texteHtml : escapeHtml(tb.texte)}</p>`).join('');
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
    ${cerveauZoomedPhase != null ? '<div class="cerveau-phase-backdrop" data-action="phase-zoom-close"></div>' : ''}
    <div class="cerveau-phase-grid">${chain.phases.map((ph, i) => `
      <div class="scenario-card cerveau-phase${cerveauZoomedPhase === i ? ' cerveau-phase-zoomed' : ''}">
        <h3 class="scenario-title">${ph.nom}<button class="zoom-btn cerveau-phase-zoom-btn" data-action="phase-zoom" data-phase-zoom="${i}" title="${cerveauZoomedPhase === i ? 'Réduire' : 'Agrandir en plein écran'}">${cerveauZoomedPhase === i ? '✕' : '⤢'}</button></h3>
        <div class="cerveau-entity-list" data-phase="${i}">${ph.entreprises.map((e, j) => cerveauEntityCard(e, i, j)).join('')}</div>
        <div class="cerveau-freeblock-list" data-phase="${i}">${(ph.blocsLibres || []).map((b, j) => cerveauFreeBlockHtml(b, i, j)).join('')}</div>
        <button class="cerveau-add-free" data-phase="${i}" data-action="free-add">+ Bloc libre (image / texte)</button>
        <div class="cerveau-add-entity"><input type="text" list="cerveauCompanyList" placeholder="Ajouter une entreprise, Entrée pour valider…" data-phase="${i}"></div>
      </div>`).join('')}</div>`;

  box.querySelectorAll('[data-action="phase-zoom"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.phaseZoom, 10);
      cerveauZoomedPhase = cerveauZoomedPhase === i ? null : i;
      renderCerveau();
    });
  });
  const backdrop = box.querySelector('[data-action="phase-zoom-close"]');
  if (backdrop) backdrop.addEventListener('click', () => { cerveauZoomedPhase = null; renderCerveau(); });

  box.querySelector('[data-back="secteurs"]').addEventListener('click', () => { cerveauZoomedPhase = null; cerveauView = { level:'secteurs' }; renderCerveau(); });
  box.querySelector('[data-back="chaines"]').addEventListener('click', () => { cerveauZoomedPhase = null; cerveauView = { level:'chaines', secteur }; renderCerveau(); });
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
    // Zone image optionnelle : "+ Image" la révèle (bloc._imageOpen, transitoire, pas
    // persisté), symétrique à "+ Texte" — un bloc purement texte n'a jamais besoin d'y
    // consacrer de place tant qu'aucune image n'est ajoutée.
    const addImageBtn = card.querySelector('[data-action="free-add-image"]');
    if (addImageBtn){
      addImageBtn.addEventListener('click', () => {
        bloc._imageOpen = true;
        renderCerveau();
      });
    }
    const addLinkBtn = card.querySelector('[data-action="free-add-link"]');
    if (addLinkBtn){
      addLinkBtn.addEventListener('click', () => { bloc._linkOpen = true; renderCerveau(); });
    }
    const linkInput = card.querySelector('[data-role="link-input"]');
    if (linkInput){
      linkInput.focus();
      const submitLink = () => {
        const v = linkInput.value.trim();
        if (!v) return;
        bloc.lien = /^https?:\/\//.test(v) ? v : 'https://' + v;
        bloc._linkOpen = false;
        persistCerveauData();
        renderCerveau();
      };
      card.querySelector('[data-action="free-link-ok"]').addEventListener('click', submitLink);
      linkInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitLink(); });
    }
    const linkClearBtn = card.querySelector('[data-action="free-link-clear"]');
    if (linkClearBtn){
      linkClearBtn.addEventListener('click', () => {
        bloc.lien = '';
        persistCerveauData();
        renderCerveau();
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
      // Zone de texte en contenteditable (voir cerveauTextBlockHtml) : hauteur suit
      // nativement le contenu, plus besoin d'autoGrowTextarea ici. Gras/italique/style/
      // taille pilotés depuis la toolbar globale (#cerveauTextToolbar) — ce bloc se
      // contente de signaler qu'il est actif au focus, voir cerveauActiveTB plus bas.
      const text = tbEl.querySelector('[data-action="free-text"]');
      text.addEventListener('focus', () => { cerveauActiveTB = { el: text, tb }; syncCerveauToolbarState(); });
      text.addEventListener('blur', () => { tb.texteHtml = text.innerHTML; persistCerveauData(); });
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

  // Bloc libre sans zone image affichée (texte seul) : pas de .cec-image donc pas de
  // poignée portée par elle — poignée dédiée sur le coin du bloc entier, largeur
  // uniquement (pas de hauteur d'image à ajuster puisqu'il n'y en a pas).
  box.querySelectorAll('[data-action="free-resize-width"]').forEach(handle => {
    const card = handle.closest('.cerveau-freeblock');
    const phaseIdx = parseInt(card.dataset.phase, 10);
    const bloc = chain.phases[phaseIdx].blocsLibres[parseInt(card.dataset.bloc, 10)];

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      const phaseBox = card.closest('.cerveau-phase');
      const maxWidth = phaseBox ? phaseBox.clientWidth - 44 : 640;
      const startX = e.clientX;
      const startWidth = card.getBoundingClientRect().width;

      function onMove(ev){
        let w = Math.round((startWidth + (ev.clientX - startX)) / CERVEAU_RESIZE_STEP) * CERVEAU_RESIZE_STEP;
        w = Math.max(CERVEAU_MIN_WIDTH, Math.min(w, maxWidth));
        card.style.width = w + 'px';
        bloc.width = w;
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
        // hors boutons) sert de prise pour déplacer le bloc. `.cec-free-text` (zone de
        // texte, passée de <textarea> à contenteditable) DOIT être exclue ici : sans ça,
        // le preventDefault() ci-dessous bloquait le focus/curseur natif du navigateur
        // sur CE `<div>` précis — bug réel trouvé en test (clic sur un bloc de texte
        // existant n'importe où dans la carte ne le rendait plus éditable, le focus
        // restait bloqué sur le dernier bloc programmatique-focus après ajout).
        if (e.target.closest('input, textarea, button, a, .cec-resize-handle, .cec-image, .cec-free-text')) return;
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
    // Un bloc libre purement texte (zone image masquée tant que "+ Image" n'a pas été
    // cliqué) n'a aucun de ces éléments dans son DOM — rien à câbler pour cette carte.
    const pickEl = card.querySelector('[data-action$="-pick"]');
    if (!pickEl) return;
    const phaseIdx = parseInt(card.dataset.phase, 10);
    const isFree = card.classList.contains('cerveau-freeblock');
    const target = isFree
      ? chain.phases[phaseIdx].blocsLibres[parseInt(card.dataset.bloc, 10)]
      : chain.phases[phaseIdx].entreprises[parseInt(card.dataset.ent, 10)];
    const urlRow = card.querySelector('[data-role="url-row"]');

    pickEl.addEventListener('click', e => {
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
// Ordre demandé explicitement : Secteur d'activité → Analyse du marché → Moat, puis
// Concurrents juste après (MID_A avant le bloc concurrents, MID_B après — perspectives/
// risques non repositionnés par la demande, gardés après concurrents dans leur ordre
// existant).
const CERVEAU_ANALYSE_SECTIONS_MID_A = [
  { key:'secteursActivite', label:"Secteurs d'activité", hint:'Produits, perspectives de développement' },
  { key:'marche', label:'Analyse du marché' },
  { key:'moat', label:'Avantage concurrentiel (moat)' }
];
const CERVEAU_ANALYSE_SECTIONS_MID_B = [
  { key:'perspectives', label:'Perspectives de croissance' },
  { key:'risques', label:'Analyse du risque' }
];
const CERVEAU_ANALYSE_SECTIONS_BOTTOM = [
  { key:'ratios', label:'Ratios financiers', hint:"Captures d'écran de l'application" },
  { key:'conclusion', label:'Conclusion', hint:'Business model, synthèse, datée automatiquement' }
];
const CERVEAU_ANALYSE_SECTIONS_ALL = CERVEAU_ANALYSE_SECTIONS_TOP.concat(CERVEAU_ANALYSE_SECTIONS_MID_A, CERVEAU_ANALYSE_SECTIONS_MID_B, CERVEAU_ANALYSE_SECTIONS_BOTTOM);

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
  // Modale visible AVANT la création du graphique (même correctif que openZoom() : un
  // canvas encore dans un ancêtre display:none mesure 0×0 pour Chart.js, qui dessine
  // alors dans le vide sans jamais se corriger tout seul ensuite).
  document.getElementById('zoomModal').style.display = 'flex';
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), {
    type:'pie',
    data:{ labels: rows.map(r => r.label), datasets:[{ data: rows.map(r => r.valeur), backgroundColor: rows.map((_, i) => PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length]), borderColor:THEME.hair, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true } } } }
  });
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
    + CERVEAU_ANALYSE_SECTIONS_MID_A.map(s => printAnalyseSectionHtml(s, v.sections[s.key])).join('')
    + printAnalyseConcurrentsHtml(v.concurrents)
    + CERVEAU_ANALYSE_SECTIONS_MID_B.map(s => printAnalyseSectionHtml(s, v.sections[s.key])).join('')
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
    + CERVEAU_ANALYSE_SECTIONS_MID_A.map(s => analyseSectionHtml(s, v.sections[s.key])).join('')
    + analyseConcurrentsHtml(v.concurrents)
    + CERVEAU_ANALYSE_SECTIONS_MID_B.map(s => analyseSectionHtml(s, v.sections[s.key])).join('')
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
    ${f.lien ? `<a class="cec-link-chip" href="${f.lien.replace(/"/g,'&quot;')}" target="_blank" rel="noopener">🔗 Source</a>` : ''}
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
      <button class="zoom-btn objectifs-export" id="revueGeminiBtn">🔎 Rechercher via Gemini (7 derniers jours)</button>
      <button class="zoom-btn objectifs-export" id="revueExportBtn">⭳ Exporter</button>
    </div>
    <div id="revueGeminiStatus" class="stock-status" style="display:none;"></div>
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
  document.getElementById('revueGeminiBtn').addEventListener('click', runGeminiRevueSearch);
  document.getElementById('revueAddBtn').addEventListener('click', addRevueFiche);
  box.querySelectorAll('.revue-fiche-del').forEach(btn => {
    btn.addEventListener('click', () => {
      revueStore.fiches = (revueStore.fiches || []).filter(f => f.id !== btn.dataset.id);
      persistRevueLocal();
      renderRevue();
    });
  });
}

// Recherche automatisée via l'API Gemini (grounding Google Search) : scanne les 7
// derniers jours de notes d'analystes/actualités publiques, synthétise des opportunités
// value investing correspondant à la stratégie du site, avec la source gardée pour
// chaque fiche. 3 clés fournies par l'utilisateur (chacune son propre quota gratuit
// indépendant) — sur 429, on bascule IMMÉDIATEMENT sur la clé suivante (pas d'attente,
// une clé différente n'a aucune raison d'être limitée en même temps) ; seule la
// DERNIÈRE clé, si elle échoue aussi, déclenche un court réessai avec pause.
const GEMINI_API_KEYS = [
  'AQ.Ab8RN6JotMiA1nAwJ8iQyLscEQ9R7Z45VjZYrC_Drk4JC96jtQ',
  'AQ.Ab8RN6KJ80fs_k49jzv-vva9YxbsOexKuPSIWFT-Zd4jpt6fbA',
  'AQ.Ab8RN6KfW6_-c8XcnmD0FOtQ7JV8HqoOdBWMSMjGJeBVTT5bNg'
];
// Alias "latest" plutôt qu'une version figée (gemini-2.5-flash renvoyait déjà une 404
// "no longer available to new users" en test) — évite de se retrouver bloqué à chaque
// dépréciation de version par Google.
const GEMINI_MODEL = 'gemini-flash-latest';
async function geminiRequestOnce(key, body){
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  if (res.ok) return { ok:true, data: await res.json() };
  if (res.status !== 429){
    const errText = await res.text();
    return { ok:false, fatal:true, error: 'HTTP ' + res.status + ' — ' + errText.slice(0, 200) };
  }
  return { ok:false, fatal:false };
}
async function callGeminiWithRetry(body, status){
  for (let ki = 0; ki < GEMINI_API_KEYS.length; ki++){
    const isLastKey = ki === GEMINI_API_KEYS.length - 1;
    const maxAttempts = isLastKey ? 3 : 1; // retour utilisateur : retenter longtemps contre un quota à plat ne sert à rien
    for (let attempt = 1; attempt <= maxAttempts; attempt++){
      status.textContent = GEMINI_API_KEYS.length > 1 ? `Interrogation de Gemini (clé ${ki + 1}/${GEMINI_API_KEYS.length})…` : 'Interrogation de Gemini…';
      const result = await geminiRequestOnce(GEMINI_API_KEYS[ki], body);
      if (result.ok) return result.data;
      if (result.fatal) throw new Error(result.error);
      if (!isLastKey) break; // 429 sur cette clé : bascule tout de suite sur la suivante, pas d'attente
      if (attempt === maxAttempts) throw new Error("Quota gratuit Gemini épuisé sur les 3 clés — il se reconstitue sur plusieurs heures, pas la peine de réessayer tout de suite. Réessaie plus tard dans la journée.");
      const waitS = 20;
      for (let s = waitS; s > 0; s--){
        status.textContent = `Quota Gemini momentanément saturé sur toutes les clés — nouvelle tentative dans ${s}s…`;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
}
async function runGeminiRevueSearch(){
  const btn = document.getElementById('revueGeminiBtn');
  const status = document.getElementById('revueGeminiStatus');
  btn.disabled = true;
  btn.textContent = '⏳ Recherche en cours…';
  status.style.display = 'block';
  status.textContent = 'Interrogation de Gemini (recherche Google intégrée)…';
  try{
    // Restreint aux 4 sites choisis par l'utilisateur (qualité de l'info avant tout,
    // plutôt que le web ouvert) — Gemini avec grounding respecte assez bien une
    // consigne de domaines explicite dans le prompt, même sans opérateur "site:" strict
    // côté API (pas de paramètre dédié pour ça dans l'API Gemini).
    const prompt = `Cherche UNIQUEMENT sur ces 4 sites : marketscreener.com, morningstar.com, seekingalpha.com, investing.com — des notes d'analystes et articles publiés durant les 7 derniers jours (aujourd'hui : ${new Date().toLocaleDateString('fr-FR')}) qui identifient des opportunités d'actions sous-valorisées, dans un style "value investing" (marge de sécurité, fondamentaux solides, prix inférieur à la valeur intrinsèque). N'utilise aucune autre source. Réponds UNIQUEMENT avec un tableau JSON valide (pas de texte autour, pas de balises markdown), au format exact :
[{"entreprise":"nom de l'entreprise","source":"nom de la source/analyste","lien":"URL de la source (doit pointer vers l'un des 4 sites listés)","objectifCours":"objectif de cours si mentionné, sinon chaîne vide","points":["point clé 1","point clé 2","point clé 3"]}]
Maximum 5 entreprises (volontairement réduit pour rester dans le quota gratuit). Si tu ne trouves rien de pertinent sur ces 4 sites, réponds avec un tableau vide [].`;
    const data = await callGeminiWithRetry({
      contents:[{ parts:[{ text: prompt }] }],
      tools:[{ google_search:{} }]
    }, status);
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Réponse Gemini sans JSON exploitable : ' + text.slice(0, 200));
    const items = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(items) || !items.length){
      status.textContent = 'Aucune opportunité trouvée sur les 7 derniers jours.';
    } else {
      const today = new Date().toISOString().slice(0, 10);
      if (!revueStore.fiches) revueStore.fiches = [];
      items.forEach((it, i) => {
        revueStore.fiches.push({
          id: 'r' + Date.now() + '_' + i,
          entreprise: it.entreprise || '',
          source: it.source || '',
          lien: it.lien || '',
          objectifCours: it.objectifCours || '',
          points: Array.isArray(it.points) ? it.points.slice(0, 3) : [],
          date: today
        });
      });
      persistRevueLocal();
      // renderRevue() reconstruit tout #revueContent (donc aussi #revueGeminiStatus) —
      // écrire le message AVANT ce renderRevue() le faisait disparaître aussitôt
      // remplacé par une version fraîche masquée (bug confirmé : "il ne se passe rien"
      // alors que les fiches étaient en fait bien ajoutées). On récupère la référence
      // FRAÎCHE après coup pour que le message survive au réaffichage.
      renderRevue();
      const freshStatus = document.getElementById('revueGeminiStatus');
      if (freshStatus){ freshStatus.style.display = 'block'; freshStatus.textContent = `${items.length} fiche(s) ajoutée(s) via Gemini.`; }
    }
  }catch(e){
    status.textContent = 'Échec de la recherche Gemini : ' + e.message;
  }
  const freshBtn = document.getElementById('revueGeminiBtn');
  if (freshBtn){ freshBtn.disabled = false; freshBtn.textContent = '🔎 Rechercher via Gemini (7 derniers jours)'; }
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

document.getElementById('refreshBtn').addEventListener('click', loadAllDataFromAppsScript);
document.querySelectorAll('.page-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});
document.querySelectorAll('.page-subnav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});
initSearch();
initSectorGrid();
initClassement();

// Panier d'export groupé (voir renderExportCartWidget/addCurrentZoomChartToCart) — pas de
// prompt()/confirm() natifs pour "Vider" (voir CLAUDE.md piège #7), confirmation en 2 clics
// inline comme le pattern déjà retenu pour la suppression de fiche Analyse développée.
document.getElementById('exportCartToggleBtn').addEventListener('click', () => {
  const panel = document.getElementById('exportCartPanel');
  panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
});
document.getElementById('exportCartExportBtn').addEventListener('click', exportCartAsPdf);
document.getElementById('exportCartClearBtn').addEventListener('click', () => {
  if (!exportCartClearConfirming){
    exportCartClearConfirming = true;
    renderExportCartWidget();
    setTimeout(() => { exportCartClearConfirming = false; renderExportCartWidget(); }, 3000);
    return;
  }
  exportCart = [];
  exportCartClearConfirming = false;
  renderExportCartWidget();
});
document.getElementById('exportCartList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cart-remove]');
  if (btn) removeFromExportCart(parseInt(btn.dataset.cartRemove, 10));
});
document.getElementById('exportCartTitleInput').addEventListener('input', (e) => { exportCartTitle = e.target.value; });
renderExportCartWidget();

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
document.getElementById('openAnalyseTag').addEventListener('click', () => { if (activeCompany) openAnalyse(activeCompany); });
loadCerveauData();
loadIdeesBaseline();
loadRevueBaseline();
initDividendPortfolio();
initConstruction();
document.getElementById('portfolioVsSpxZoomBtn').addEventListener('click', openPortfolioVsSpxZoom);
document.getElementById('portfolioVsSpxMonthlyZoomBtn').addEventListener('click', openPortfolioVsSpxMonthlyZoom);
document.getElementById('peaDonutZoomBtn').addEventListener('click', () => openPersoDonutZoom('pea', persoData.pea, 'PEA — Crédit Agricole'));
document.getElementById('ctoDonutZoomBtn').addEventListener('click', () => openPersoDonutZoom('cto', persoData.cto, 'CTO — Saxo'));

// Floutage des montants (pas les %) — activable/désactivable, pour partager un écran/
// une capture du portefeuille perso sans montrer les sommes exactes. Approche par
// CONTENU (pas par template à marquer partout) : n'importe quelle valeur affichée dans
// #pagePerso dont le texte ne se termine PAS par "%" est considérée comme un montant.
let persoBlurEnabled = false;
function applyPersoBlur(){
  const page = document.getElementById('pagePerso');
  if (!page) return;
  page.querySelectorAll('.ratio-card .v').forEach(el => {
    const isPct = el.textContent.trim().endsWith('%');
    el.classList.toggle('perso-blurred', persoBlurEnabled && !isPct);
  });
}
document.getElementById('persoBlurToggleBtn').addEventListener('click', function(){
  persoBlurEnabled = !persoBlurEnabled;
  this.textContent = persoBlurEnabled ? '👁 Afficher les montants' : '🙈 Flouter les montants';
  this.classList.toggle('active', persoBlurEnabled);
  applyPersoBlur();
});

(async function init(){
  const ok = await ensureChartJs();
  if (!ok){
    showError("Impossible de charger la librairie de graphiques (Chart.js), quelle que soit la source essayée. C'est presque toujours un bloqueur de publicité, un antivirus ou une restriction réseau qui bloque les CDN (cdnjs.cloudflare.com, jsdelivr.net, unpkg.com). Essaie de désactiver temporairement tes extensions de navigateur, ou ouvre la page en navigation privée.");
    return;
  }
  configureChartDefaults();
  // Après confirmation que Chart.js est chargé (sinon "Chart is not defined" si la
  // réponse arrive trop vite, bug déjà rencontré cette session). loadDividendPortfolioBaseline()
  // ne dépend que d'un fichier JSON local (data/dividende.json), sans rapport avec
  // Google Sheets ; loadAllDataFromAppsScript() apporte tout le reste (données
  // principales, Portfolio, historique de prix, macro, Perso) en un seul appel.
  loadDividendPortfolioBaseline();
  loadConstructionBaseline();
  loadAllDataFromAppsScript();
})();

