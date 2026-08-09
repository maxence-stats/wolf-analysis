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
  dividende:20, rendementDiv:21, cagrDiv10:23,
  payoutFCF:25, payoutRatio:26,
  fcfpeg:35, fcfParAction:38, cagrFcf10:40, pFcf:13, medianePFCF:42,
  ca:44, cagrCA10:46, margeOp:48, roic:49,
  cash:52, cashInvesti:53, actions:54, cagrActions:55,
  detteOCF:58
};

let companies = {};   // { nomEntreprise: [ {annee, ...valeurs}, ... ] sorted asc }
let activeCompany = null;
let chartInstances = {};

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
      cagrDiv10: parseNum(c[COL.cagrDiv10]),
      payoutRatio: parseNum(c[COL.payoutRatio]),
      fcfpeg: parseNum(c[COL.fcfpeg]),
      fcfParAction: parseNum(c[COL.fcfParAction]),
      cagrFcf10: parseNum(c[COL.cagrFcf10]),
      pFcf: parseNum(c[COL.pFcf]),
      medianePFCF: parseNum(c[COL.medianePFCF]),
      ca: parseNum(c[COL.ca]),
      cagrCA10: parseNum(c[COL.cagrCA10]),
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

  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('errorScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  setSync('ok');
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

function normalizeSector(raw){
  if (!raw) return null;
  const s = raw.toLowerCase();
  for (const sec of GICS_SECTORS){
    if (sec.match.some(kw => s.includes(kw))) return sec.key;
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
  Chart.defaults.font.family = "'JetBrains Mono', monospace";
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

  document.getElementById('logoImg').src = latest.lienImage || '';
  document.getElementById('tickerLbl').textContent = latest.ticker || '—';
  document.getElementById('companyName').textContent = nom;
  document.getElementById('secteurTag').textContent = 'Secteur — ' + (latest.secteur || '—');
  document.getElementById('sousSecteurTag').textContent = 'Sous-secteur — ' + (latest.sousSecteur || '—');
  document.getElementById('prixActuel').innerHTML = latest.prixActuel.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' <sup>€</sup>';
  document.getElementById('priceYear').textContent = 'Exercice ' + latest.annee;

  document.getElementById('rPrixJuste').textContent = fmtEUR(latest.prixJuste);
  document.getElementById('rPrixCible').textContent = fmtEUR(latest.prixCible);
  const ecartEl = document.getElementById('rEcart');
  ecartEl.className = 'v';
  if (latest.ecartValeur != null){
    ecartEl.textContent = fmtPct(latest.ecartValeur*100);
    ecartEl.classList.add(latest.ecartValeur >= 0 ? 'pos' : 'neg');
  } else { ecartEl.textContent = 'N/D'; }

  document.getElementById('rRendDiv').textContent = fmtPct(latest.rendementDiv);
  document.getElementById('rFcfpeg').textContent = latest.fcfpeg != null ? latest.fcfpeg.toLocaleString('fr-FR',{minimumFractionDigits:2}) : 'N/D';
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

function cloneChartConfig(config){
  return {
    type: config.type,
    data: {
      labels: config.data.labels.slice(),
      datasets: config.data.datasets.map(ds => Object.assign({}, ds, { data: ds.data.slice() }))
    },
    options: config.options
  };
}

/* ============================================================
   COURS DE BOURSE — Yahoo Finance en priorité, repli sur Stooq
   si le fetch échoue (CORS non garanti côté Yahoo, pas d'API
   officielle). Hebdomadaire + SMA200.
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

async function fetchYahooWeekly(symbol){
  // period1/period2 explicites plutôt que range=max : Yahoo sous-échantillonne
  // silencieusement (mensuel au lieu de quotidien) quand range=max est combiné à un
  // très long historique, ce qui faussait la moyenne mobile 200 semaines.
  const period1 = Math.floor(new Date('1990-01-01T00:00:00Z').getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
  const controller = new AbortController();
  const hardTimeout = setTimeout(() => controller.abort(), 8000);
  try{
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
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
  } finally {
    clearTimeout(hardTimeout);
  }
}

async function fetchStooqWeekly(symbol){
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=w&_=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
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
  statusEl.textContent = 'Chargement du cours…';
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

  if (chartInstances.stock) chartInstances.stock.destroy();

  const config = {
    type:'line',
    data:{ labels, datasets:[
      { label:'Clôture hebdo', data:dataClose, borderColor:THEME.gold, backgroundColor:'rgba(217,164,65,0.08)', fill:true, tension:0.12, pointRadius:0, borderWidth:1.5 },
      { label:'Moyenne mobile 200 sem.', data:dataSma, borderColor:THEME.blue, borderWidth:1.5, pointRadius:0, spanGaps:true, tension:0.12 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom', labels:{boxWidth:8, usePointStyle:true}}},
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

function openZoom(key, title){
  const config = chartConfigs[key];
  if (!config) return;
  document.getElementById('zoomTitle').textContent = title;
  if (window.__zoomChart) window.__zoomChart.destroy();
  window.__zoomChart = new Chart(document.getElementById('zoomCanvas').getContext('2d'), cloneChartConfig(config));
  document.getElementById('zoomModal').style.display = 'flex';
}
function closeZoom(){
  document.getElementById('zoomModal').style.display = 'none';
  if (window.__zoomChart){ window.__zoomChart.destroy(); window.__zoomChart = null; }
}
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
      <text x="${xv}" y="${top-10}" text-anchor="middle" fill="${color}" font-size="13" font-weight="700" font-family="JetBrains Mono, monospace">${label}</text>
      <text x="${xv}" y="${top+barH+22}" text-anchor="middle" fill="${THEME.dim}" font-size="12" font-family="JetBrains Mono, monospace">${value.toFixed(1)} €</text>
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
    return `<div class="objectifs-entry"><span class="date">${e.date}</span><span class="scen">${parts}</span><button class="del" data-idx="${realIdx}" aria-label="Supprimer">✕</button></div>`;
  }).join('');
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

document.getElementById('saveObjectifBtn').addEventListener('click', () => { if (activeCompany) saveObjectif(activeCompany); });
document.getElementById('exportObjectifsBtn').addEventListener('click', exportObjectifs);
document.getElementById('objectifsList').addEventListener('click', e => {
  const btn = e.target.closest('.del[data-idx]');
  if (!btn || !activeCompany) return;
  objectifsStore[activeCompany].splice(parseInt(btn.dataset.idx, 10), 1);
  persistObjectifsLocal();
  renderObjectifsHistory(activeCompany);
});
loadObjectifsBaseline();

(async function init(){
  const ok = await ensureChartJs();
  if (!ok){
    showError("Impossible de charger la librairie de graphiques (Chart.js), quelle que soit la source essayée. C'est presque toujours un bloqueur de publicité, un antivirus ou une restriction réseau qui bloque les CDN (cdnjs.cloudflare.com, jsdelivr.net, unpkg.com). Essaie de désactiver temporairement tes extensions de navigateur, ou ouvre la page en navigation privée.");
    return;
  }
  configureChartDefaults();
  loadData();
})();

