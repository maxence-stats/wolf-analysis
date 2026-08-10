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
  detteOCF:58, medianePFCF20:59
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

const PORTFOLIO_COLORS = ['#D9A441','#4A9FE0','#F0C877','#7DBEEA','#B8842E','#2E6FA3','#F5DDA3','#A8D4F0','#8A6420','#1F4E73'];
const WOLF_LOGO_URL = 'https://i.postimg.cc/43WmYDB1/20260714-LOGO-WINTER-PNG.png';

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
    afterDraw(chart){
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
    afterDraw(chart){
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
function classementRowHtml(nom, logo, rank, valueText, cls){
  return `<div class="classement-row" data-nom="${nom.replace(/"/g,'&quot;')}">
    <span class="classement-rank">${rank}</span>
    <div class="classement-logo"><img src="${logo || ''}" alt=""></div>
    <span class="classement-name">${nom}</span>
    <span class="classement-value${cls ? ' ' + cls : ''}">${valueText}</span>
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
  const divBox = document.getElementById('classementDiv');
  const valoBox = document.getElementById('classementValo');
  if (!divBox || !valoBox) return;
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
  const byValo = rows.filter(r => r.ecartValeur != null).sort((a, b) => a.ecartValeur - b.ecartValeur);

  divBox.innerHTML = byDiv.length
    ? byDiv.map((r, i) => classementRowHtml(r.nom, r.logo, i + 1, fmtPct(r.rendementDiv))).join('')
    : '<div class="objectifs-empty">Aucune donnée disponible pour ce secteur.</div>';

  valoBox.innerHTML = byValo.length
    ? byValo.map((r, i) => classementRowHtml(r.nom, r.logo, i + 1, fmtPct(r.ecartValeur * 100), r.ecartValeur < 0 ? 'pos' : 'neg')).join('')
    : '<div class="objectifs-empty">Aucune donnée disponible pour ce secteur.</div>';
}

function initClassement(){
  ['classementDiv', 'classementValo'].forEach(id => {
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
  hair: css.getPropertyValue('--hair').trim()
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

  loadStockChart(latest.ticker);
  renderValorisation(nom);

  const series = k => hist.map(r => r[k]);

  destroyCharts();

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

function setStockSourceNote(text){
  const el = document.getElementById('stockSourceNote');
  if (el) el.textContent = text;
}

async function loadStockChart(ticker){
  const statusEl = document.getElementById('stockStatus');
  const myId = ++stockRequestId;
  stockFull = null;
  if (chartInstances.stock){ chartInstances.stock.destroy(); delete chartInstances.stock; }

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
    const sma = closes.map((_, i) => i < 199 ? null : average(closes.slice(i - 199, i + 1)));
    stockFull = { dates, closes, sma };
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
    const sma = res.closes.map((_, i) => i < 199 ? null : average(res.closes.slice(i - 199, i + 1)));
    stockFull = { dates: res.dates, closes: res.closes, sma };
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

function renderStockChart(){
  if (!stockFull) return;
  const { dates, closes, sma } = stockFull;
  let startIdx = 0;
  if (stockRange !== 'max'){
    const years = parseInt(stockRange, 10);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const found = dates.findIndex(d => new Date(d) >= cutoff);
    startIdx = found === -1 ? 0 : found;
  }

  const labels = dates.slice(startIdx);
  const dataClose = closes.slice(startIdx);
  const dataSma = sma.slice(startIdx);

  const reg = computeRegressionChannel(dates, closes);
  const regLine = (offset) => labels.map(d => (reg && reg.byDate[d] != null) ? reg.byDate[d] + offset * reg.stdDev : null);

  if (chartInstances.stock) chartInstances.stock.destroy();

  // Couleurs demandées explicitement : moyenne en rouge, ±1σ en bleu, ±2σ en rouge
  // pointillé (pas les couleurs sémantiques habituelles pos/neg du site — ce sont des
  // repères statistiques, pas un jugement positif/négatif).
  const regStyle = (offset, label, showInLegend) => {
    const abs = Math.abs(offset);
    return {
      label, data: regLine(offset),
      borderColor: abs === 1 ? THEME.blue : THEME.red,
      borderWidth: offset === 0 ? 1.75 : 1.25,
      borderDash: abs === 2 ? [5,4] : [],
      pointRadius:0, spanGaps:false, tension:0, _legend: !!showInLegend
    };
  };

  const config = {
    type:'line',
    data:{ labels, datasets:[
      { label:'Clôture hebdo', data:dataClose, borderColor:THEME.gold, backgroundColor:'rgba(217,164,65,0.08)', fill:true, tension:0.12, pointRadius:0, borderWidth:1.5, _legend:true },
      { label:'Moyenne mobile 200 sem.', data:dataSma, borderColor:THEME.blue, borderWidth:1.5, pointRadius:0, spanGaps:true, tension:0.12, _legend:true },
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
  chartInstances.stock = makeChart('stock', 'chartStock', config);
}

document.getElementById('rangeButtons').addEventListener('click', e => {
  const btn = e.target.closest('button[data-range]');
  if (!btn) return;
  stockRange = btn.dataset.range;
  document.querySelectorAll('#rangeButtons button').forEach(b => b.classList.toggle('active', b === btn));
  renderStockChart();
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

function renderZoomRangeRow(){
  const row = document.getElementById('zoomRangeRow');
  if (!ZOOM_HISTORICAL_KEYS.includes(zoomKey)){ row.innerHTML = ''; return; }
  const ranges = [['5','5a'],['10','10a'],['20','20a'],['max','Max']];
  row.innerHTML = ranges.map(([val,label]) => `<button data-zrange="${val}" class="${zoomRange===val?'active':''}">${label}</button>`).join('');
}

function renderZoomChart(){
  const baseConfig = chartConfigs[zoomKey];
  if (!baseConfig) return;
  const nYears = (!ZOOM_HISTORICAL_KEYS.includes(zoomKey) || zoomRange === 'max') ? null : parseInt(zoomRange, 10);
  if (window.__zoomChart) window.__zoomChart.destroy();
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), sliceChartConfigByYears(baseConfig, nYears));
}

function openZoom(key, title){
  const config = chartConfigs[key];
  if (!config) return;
  zoomKey = key;
  zoomRange = 'max';
  document.getElementById('zoomTitle').textContent = title;
  renderZoomRangeRow();
  renderZoomCagrRow();
  renderZoomChart();
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
  zoomRange = btn.dataset.zrange;
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
      <h3 class="scenario-title">${s.label}</h3>
      <div class="scenario-row fixe">
        <div class="scenario-row-head"><span>FCF Actuel (Fixe)</span><span class="val" id="vo-${s.key}-fcf">—</span></div>
      </div>
      <div class="scenario-row">
        <div class="scenario-row-head"><span>CAGR FCF Prévu (%)</span><span class="val" id="vo-${s.key}-cagrVal">—</span></div>
        <input type="range" class="scenario-slider" id="vo-${s.key}-cagr" min="-10" max="30" step="0.1">
      </div>
      <div class="scenario-row">
        <div class="scenario-row-head"><span>Médiane FCF (Multiple)</span><span class="val" id="vo-${s.key}-multVal">—</span></div>
        <input type="range" class="scenario-slider" id="vo-${s.key}-mult" min="1" max="50" step="0.1">
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

function renderValorisation(nom){
  const hist = companies[nom];
  if (!hist) return;
  const latest = hist[hist.length - 1];
  const fcfActuel = latest.fcfParAction;
  const prixActuel = latest.prixActuel;
  const cagrHist = latest.cagrFcf10;
  const medianeHist = latest.medianePFCF;

  document.getElementById('voFcfActuel').textContent = fcfActuel != null ? fmtEUR(fcfActuel) : 'N/D';
  document.getElementById('voCagrHist').textContent = cagrHist != null ? fmtPct(cagrHist) : 'N/D';
  document.getElementById('voMedianeHist').textContent = medianeHist != null ? medianeHist.toLocaleString('fr-FR', {minimumFractionDigits:1}) + 'x' : 'N/D';
  document.getElementById('voMediane20').textContent = latest.medianePFCF20 != null ? latest.medianePFCF20.toLocaleString('fr-FR', {minimumFractionDigits:1}) + 'x' : 'N/D';

  scenarioValues = {};
  SCENARIOS.forEach(s => {
    scenarioValues[s.key] = {
      cagr: cagrHist != null ? +(cagrHist + s.deltaCagr).toFixed(1) : 0,
      multiple: medianeHist != null ? +(medianeHist + s.deltaMultiple).toFixed(1) : 0
    };
  });

  Object.values(scenarioCharts).forEach(ch => ch && ch.destroy());
  scenarioCharts = {};

  document.getElementById('scenarioGrid').innerHTML = SCENARIOS.map(scenarioCardHtml).join('');

  SCENARIOS.forEach(s => wireScenarioCard(s, hist, fcfActuel, prixActuel));

  renderObjectifsHistory(nom);
}

function wireScenarioCard(s, hist, fcfActuel, prixActuel){
  const cagrInput = document.getElementById('vo-' + s.key + '-cagr');
  const multInput = document.getElementById('vo-' + s.key + '-mult');
  document.getElementById('vo-' + s.key + '-fcf').textContent = fcfActuel != null ? fmtEUR(fcfActuel) : 'N/D';

  cagrInput.value = scenarioValues[s.key].cagr;
  multInput.value = scenarioValues[s.key].multiple;

  function update(){
    scenarioValues[s.key].cagr = parseFloat(cagrInput.value);
    scenarioValues[s.key].multiple = parseFloat(multInput.value);
    updateScenarioCard(s, hist, fcfActuel, prixActuel);
  }
  cagrInput.addEventListener('input', update);
  multInput.addEventListener('input', update);

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

function renderScenarioChart(s, hist, prixJusteSim, prixEst5A){
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

  if (scenarioCharts[s.key]) scenarioCharts[s.key].destroy();

  scenarioCharts[s.key] = new Chart(document.getElementById('vo-' + s.key + '-chart').getContext('2d'), {
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
  });
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
  objectifsStore[nom].push({ date: new Date().toISOString().slice(0, 10), scenarios: snapshot });
  persistObjectifsLocal();
  renderObjectifsHistory(nom);
}

function renderObjectifsHistory(nom){
  const box = document.getElementById('objectifsList');
  if (!box) return;
  const entries = (objectifsStore[nom] || []).slice().reverse();
  if (entries.length === 0){
    box.innerHTML = '<div class="objectifs-empty">Aucun objectif enregistré pour cette entreprise.</div>';
    return;
  }
  box.innerHTML = entries.map((e, idx) => {
    const realIdx = objectifsStore[nom].length - 1 - idx;
    const parts = SCENARIOS.map(s => {
      const v = e.scenarios[s.key];
      return v ? `<b>${s.label.replace('Scénario ', '')}</b> ${v.cagr}% / ${v.multiple}x` : '';
    }).filter(Boolean).join(' · ');
    return `<div class="objectifs-entry"><span class="date">${e.date}</span><span class="scen">${parts}</span><div class="objectifs-entry-actions"><button class="load" data-idx="${realIdx}">↻ Charger</button><button class="del" data-idx="${realIdx}" aria-label="Supprimer">✕</button></div></div>`;
  }).join('');
}

function applyObjectif(nom, idx){
  const entry = (objectifsStore[nom] || [])[idx];
  if (!entry) return;
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
  SCENARIOS.forEach(s => updateScenarioCard(s, hist, latest.fcfParAction, latest.prixActuel));
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
    const phases = phasesRaw.split(',').map(p => p.trim()).filter(Boolean).map(p => ({ nom:p, entreprises:[] }));
    const chain = { id:'c' + Date.now(), nom, phases: phases.length ? phases : [{ nom:'Amont', entreprises:[] }] };
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

function cerveauEntityChip(nom){
  const safe = nom.replace(/"/g, '&quot;');
  const tracked = companies[nom];
  const logo = tracked ? companies[nom][companies[nom].length - 1].lienImage : '';
  const noteCount = (cerveauData.notes[nom] || []).length;
  return `<div class="cerveau-entity-chip" data-nom="${safe}">
    ${logo ? `<img src="${logo}" alt="">` : `<span class="cerveau-entity-initial">${nom.charAt(0).toUpperCase()}</span>`}
    <span>${nom}</span>${noteCount ? `<span class="cerveau-note-badge">${noteCount}</span>` : ''}
  </div>`;
}

function renderCerveauPhases(box){
  const { secteur, chainId } = cerveauView;
  const chain = (cerveauData.chains[secteur] || []).find(c => c.id === chainId);
  if (!chain){ cerveauView = { level:'chaines', secteur }; renderCerveau(); return; }

  box.innerHTML = `
    <div class="cerveau-breadcrumb"><a data-back="secteurs">Secteurs</a> / <a data-back="chaines">${cerveauSectorLabel(secteur)}</a> / ${chain.nom}</div>
    <div class="cerveau-phase-grid">${chain.phases.map((ph, i) => `
      <div class="scenario-card cerveau-phase">
        <h3 class="scenario-title">${ph.nom}</h3>
        <div class="cerveau-entity-list" data-phase="${i}">${ph.entreprises.map(cerveauEntityChip).join('')}</div>
        <div class="cerveau-add-entity"><input type="text" placeholder="Ajouter une entreprise, Entrée pour valider…" data-phase="${i}"></div>
      </div>`).join('')}</div>`;

  box.querySelector('[data-back="secteurs"]').addEventListener('click', () => { cerveauView = { level:'secteurs' }; renderCerveau(); });
  box.querySelector('[data-back="chaines"]').addEventListener('click', () => { cerveauView = { level:'chaines', secteur }; renderCerveau(); });
  box.querySelectorAll('.cerveau-entity-list').forEach(list => {
    list.addEventListener('click', e => {
      const chip = e.target.closest('.cerveau-entity-chip[data-nom]');
      if (chip) openFiche(chip.dataset.nom);
    });
  });
  box.querySelectorAll('.cerveau-add-entity input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      chain.phases[parseInt(input.dataset.phase, 10)].entreprises.push(input.value.trim());
      persistCerveauData();
      renderCerveau();
    });
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
  closeFiche();
  openAnalyse(ficheEntite);
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
   évolue, l'ancienne analyse doit rester consultable).
   Stockage : cerveauData.analyses[nom] = [ {id, label, dateCreated,
   dateModified, sections:{...}, revenusPays:[], revenusSecteurs:[],
   concurrents:[]}, ... ] — même IndexedDB que chains/notes, jamais
   supprimé automatiquement.
   ============================================================ */
const CERVEAU_ANALYSE_SECTIONS = [
  { key:'presentation', label:"Présentation de l'entreprise", hint:'Stratégie, profil opérationnel et concurrentiel' },
  { key:'marche', label:'Analyse du marché' },
  { key:'moat', label:'Avantage concurrentiel (moat)' },
  { key:'secteursActivite', label:"Secteurs d'activité", hint:'Produits, perspectives de développement' },
  { key:'perspectives', label:'Perspectives de croissance' },
  { key:'risques', label:'Analyse du risque' },
  { key:'actionnariat', label:'Actionnariat principal', hint:"Chiffres, ou capture d'écran d'un graphique" },
  { key:'ratios', label:'Ratios financiers', hint:"Captures d'écran de l'application" },
  { key:'conclusion', label:'Conclusion', hint:'Business model, synthèse, datée automatiquement' }
];

let analyseEntite = null;
let analyseVersionId = null;
let analyseCharts = {};

function blankAnalyseVersion(label){
  const today = new Date().toISOString().slice(0, 10);
  const sections = {};
  CERVEAU_ANALYSE_SECTIONS.forEach(s => { sections[s.key] = { texte:'', images:[] }; });
  return { id:'v' + Date.now() + Math.random().toString(36).slice(2), label, dateCreated:today, dateModified:today, sections, revenusPays:[], revenusSecteurs:[], concurrents:[] };
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

function analyseSectionHtml(s, data){
  return `<div class="analyse-section">
    <h4>${s.label}</h4>
    ${s.hint ? `<p class="analyse-hint">${s.hint}</p>` : ''}
    <textarea class="analyse-textarea" data-key="${s.key}" placeholder="Texte…">${(data.texte || '').replace(/</g, '&lt;')}</textarea>
    <div class="analyse-images" data-key="${s.key}">${(data.images || []).map((src, i) => `<div class="analyse-image-thumb"><img src="${src}" alt=""><button class="analyse-image-del" data-key="${s.key}" data-idx="${i}">✕</button></div>`).join('')}</div>
    <label class="fiche-file-btn">+ Image<input type="file" accept="image/*" multiple class="analyse-image-input" data-key="${s.key}" hidden></label>
  </div>`;
}

function analyseRevenusHtml(key, label, rows){
  return `<div class="analyse-section">
    <h4>${label}</h4>
    <div class="analyse-revenus-body">
      <div>
        ${rows.map((r, i) => `<div class="analyse-revenus-row"><span>${r.label}</span><span>${r.pct}%</span><button class="analyse-revenus-del" data-key="${key}" data-idx="${i}">✕</button></div>`).join('')}
        <div class="analyse-revenus-add">
          <input type="text" placeholder="Libellé (ex. France)" class="analyse-revenus-label" data-key="${key}">
          <input type="number" placeholder="%" min="0" max="100" class="analyse-revenus-pct" data-key="${key}">
          <button class="analyse-revenus-addbtn" data-key="${key}">+ Ajouter</button>
        </div>
      </div>
      <div class="chart-holder analyse-revenus-chart"><canvas id="analyseChart_${key}"></canvas></div>
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
        <div class="analyse-images">${(c.images || []).map((src, j) => `<div class="analyse-image-thumb"><img src="${src}" alt=""><button class="analyse-competitor-image-del" data-idx="${i}" data-img="${j}">✕</button></div>`).join('')}</div>
        <label class="fiche-file-btn">+ Image<input type="file" accept="image/*" multiple class="analyse-competitor-image-input" data-idx="${i}" hidden></label>
        <div><button class="analyse-competitor-del" data-idx="${i}">Supprimer ce concurrent</button></div>
      </div>`).join('')}</div>
    <button class="cerveau-btn-cancel" id="analyseAddCompetitor">+ Ajouter un concurrent</button>
  </div>`;
}

function renderAnalyseCharts(v){
  [['revenusPays', v.revenusPays], ['revenusSecteurs', v.revenusSecteurs]].forEach(([key, rows]) => {
    const canvas = document.getElementById('analyseChart_' + key);
    if (analyseCharts[key]) { analyseCharts[key].destroy(); analyseCharts[key] = null; }
    if (!canvas || !rows.length) return;
    analyseCharts[key] = new Chart(canvas.getContext('2d'), {
      type:'pie',
      data:{ labels: rows.map(r => r.label), datasets:[{ data: rows.map(r => r.pct), backgroundColor: rows.map((_, i) => PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length]), borderColor:THEME.hair, borderWidth:2 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, usePointStyle:true, color:THEME.dim, font:{size:10.5} } } } }
    });
  });
}

function wireAnalyseSectionEvents(){
  const v = currentAnalyseVersion();
  const box = document.getElementById('analyseBody');

  box.querySelectorAll('.analyse-textarea').forEach(ta => {
    ta.addEventListener('input', () => { v.sections[ta.dataset.key].texte = ta.value; });
  });
  box.querySelectorAll('.analyse-image-input').forEach(input => {
    input.addEventListener('change', async () => {
      for (const file of input.files) v.sections[input.dataset.key].images.push(await readFileAsDataURL(file));
      input.value = '';
      renderAnalyse();
    });
  });
  box.querySelectorAll('.analyse-image-del').forEach(btn => {
    btn.addEventListener('click', () => { v.sections[btn.dataset.key].images.splice(parseInt(btn.dataset.idx, 10), 1); renderAnalyse(); });
  });

  box.querySelectorAll('.analyse-revenus-addbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const labelInput = box.querySelector(`.analyse-revenus-label[data-key="${key}"]`);
      const pctInput = box.querySelector(`.analyse-revenus-pct[data-key="${key}"]`);
      const label = labelInput.value.trim();
      const pct = parseFloat(pctInput.value);
      if (!label || isNaN(pct)) return;
      v[key].push({ label, pct });
      renderAnalyse();
    });
  });
  box.querySelectorAll('.analyse-revenus-del').forEach(btn => {
    btn.addEventListener('click', () => { v[btn.dataset.key].splice(parseInt(btn.dataset.idx, 10), 1); renderAnalyse(); });
  });

  box.querySelectorAll('.analyse-competitor-nom').forEach(input => {
    input.addEventListener('input', () => { v.concurrents[parseInt(input.dataset.idx, 10)].nom = input.value; });
  });
  box.querySelectorAll('.analyse-competitor-texte').forEach(ta => {
    ta.addEventListener('input', () => { v.concurrents[parseInt(ta.dataset.idx, 10)].texte = ta.value; });
  });
  box.querySelectorAll('.analyse-competitor-image-input').forEach(input => {
    input.addEventListener('change', async () => {
      const idx = parseInt(input.dataset.idx, 10);
      for (const file of input.files) v.concurrents[idx].images.push(await readFileAsDataURL(file));
      input.value = '';
      renderAnalyse();
    });
  });
  box.querySelectorAll('.analyse-competitor-image-del').forEach(btn => {
    btn.addEventListener('click', () => { v.concurrents[parseInt(btn.dataset.idx, 10)].images.splice(parseInt(btn.dataset.img, 10), 1); renderAnalyse(); });
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
  const box = document.getElementById('analyseBody');
  box.innerHTML = CERVEAU_ANALYSE_SECTIONS.map(s => analyseSectionHtml(s, v.sections[s.key])).join('')
    + analyseRevenusHtml('revenusPays', 'Revenus par pays', v.revenusPays)
    + analyseRevenusHtml('revenusSecteurs', "Revenus par secteur d'activité", v.revenusSecteurs)
    + analyseConcurrentsHtml(v.concurrents);
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

function initAnalyseModal(){
  document.getElementById('analyseVersionSelect').addEventListener('change', e => { analyseVersionId = e.target.value; renderAnalyse(); });
  document.getElementById('analyseDuplicateBtn').addEventListener('click', duplicateAnalyseVersion);
  document.getElementById('analyseNewBtn').addEventListener('click', newBlankAnalyseVersion);
  document.getElementById('analyseSaveBtn').addEventListener('click', saveAnalyseVersion);
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

async function loadIdeesBaseline(){
  try{
    const res = await fetch(IDEES_BASELINE_URL, { cache:'no-store' });
    if (res.ok){
      const json = await res.json();
      IDEES_CATS.forEach(c => { if (json && Array.isArray(json[c.key])) ideesStore[c.key] = json[c.key]; });
    }
  }catch(e){ /* socle absent ou fetch bloqué (ex. file://) — non bloquant */ }
  try{
    const raw = localStorage.getItem(IDEES_LS_KEY);
    if (raw){
      const parsed = JSON.parse(raw);
      IDEES_CATS.forEach(c => { if (Array.isArray(parsed[c.key])) ideesStore[c.key] = parsed[c.key]; });
    }
  }catch(e){ /* localStorage indisponible ou JSON corrompu */ }
  renderIdees();
}

function persistIdeesLocal(){
  try{ localStorage.setItem(IDEES_LS_KEY, JSON.stringify(ideesStore)); }catch(e){ /* quota / navigateur privé */ }
}

function exportIdees(){
  const blob = new Blob([JSON.stringify(ideesStore, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wolf-analysis-idees.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderIdees(){
  const box = document.getElementById('ideesContent');
  if (!box) return;
  box.innerHTML = `
    <div class="idees-actions"><button class="zoom-btn objectifs-export" id="ideesExportBtn">⭳ Exporter</button></div>
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
      </div>`).join('')}</div>`;

  document.getElementById('ideesExportBtn').addEventListener('click', exportIdees);
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
document.getElementById('openAnalyseTag').addEventListener('click', () => { if (activeCompany) openAnalyse(activeCompany); });
loadCerveauData();
loadIdeesBaseline();

(async function init(){
  const ok = await ensureChartJs();
  if (!ok){
    showError("Impossible de charger la librairie de graphiques (Chart.js), quelle que soit la source essayée. C'est presque toujours un bloqueur de publicité, un antivirus ou une restriction réseau qui bloque les CDN (cdnjs.cloudflare.com, jsdelivr.net, unpkg.com). Essaie de désactiver temporairement tes extensions de navigateur, ou ouvre la page en navigation privée.");
    return;
  }
  configureChartDefaults();
  loadData();
})();

