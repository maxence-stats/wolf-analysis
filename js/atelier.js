/* ================================================================================================
   ATELIER D'ANALYSES — espace de recherche en CARTES (refonte du 2026-11-11, remplace la carte mentale)
   ------------------------------------------------------------------------------------------------
   Un DOSSIER (entreprise, chaîne de valeur, carte libre) = des SECTIONS (Présentation, Business model, Analyse
   financière…) qui contiennent chacune une grille de CARTES. Trois formats : carré (s), vertical (v), horizontal (h),
   plus « replié » (une ligne). Deux vues du même dossier : GRILLE (sections les unes sous les autres) et ORGANIGRAMME
   (le logo au centre, les sections en pieuvre ; un clic sur une section fait sortir ses cartes en éventail, un autre
   les rabat). Bouton AGRANDIR sur chaque carte : elle grandit depuis sa place, le reste se floute, et la vue en grand
   montre plus de données (historique, tableau, statistiques). Édition dans un panneau à droite.

   Cartes (10) : texte, image (+ texte), kpi (indicateur), donut (camembert), barres, courbes, comparatif, concurrent
   (« Entreprise » : fiche d'une autre société, liée à son dossier), source (PDF, site, article), citation.

   DONNÉES SÉPARÉES DE LA PRÉSENTATION : une carte ne recopie pas les chiffres, elle se LIE à une donnée :
     - « tv:<champ> » : chiffres TradingView de l'onglet Analyse (companies[nom], historique annuel), toujours à jour ;
     - « f:<id> »      : donnée saisie dans « 📊 Données » du dossier (doc.facts : valeur, unité, période, source).
   Changer la donnée à sa source met à jour toutes les cartes qui l'utilisent.

   STOCKAGE (inchangé, voir CLAUDE.md) : data/mes-portefeuilles/atelier.json via le serveur local (révision / 409,
   copies datées, copie Documents, copie mensuelle, refus de toute disparition de dossier non déclarée), images et PDF
   en fichiers séparés jamais supprimés (/api/atelier/media). Rien n'est effacé pour de bon : corbeille (D.trash).
   Les anciennes versions « carte mentale » (v.nodes) sont CONVERTIES en sections + cartes au premier affichage ;
   leurs nœuds d'origine restent dans le fichier (v.nodes, v.root) : rien n'est perdu.
   Site public (aucun serveur) : copie data/public/atelier.json en lecture seule (RO).
   RÈGLE POUR CLAUDE : ne jamais écrire ce fichier à la main ; tests sur instance jetable (-StoreDir <tmp>).
   ================================================================================================ */
(function(){
'use strict';

const PAGE_ID = 'pageAtelier';
const PALETTE = ['#D9A441', '#4A9FE0', '#4FD1A5', '#E5636B', '#F08A4B', '#5CC8D7', '#B8A1F0', '#8FA3B8'];
const SERIES_COLORS = ['#D9A441', '#4A9FE0', '#F0C877', '#8FA3B8', '#4FD1A5', '#B8A1F0', '#F08A4B', '#5CC8D7'];
const DOC_LABEL = { entreprise: 'Analyse d\'entreprise', chaine: 'Chaîne de valeur', libre: 'Carte libre' };
const TYPES = {
  texte:      { l: 'Texte',        c: '#C9D1D9', size: 's', cat: 'Rédaction',  d: 'Titre, paragraphes, listes, gras, surligné' },
  image:      { l: 'Image',        c: '#F0C877', size: 's', cat: 'Rédaction',  d: 'Photo ou capture (fichier, Ctrl+V ou adresse internet)' },
  citation:   { l: 'Citation',     c: '#D9A441', size: 's', cat: 'Rédaction',  d: 'Une idée ou une conclusion mise en avant' },
  kpi:        { l: 'Indicateur',   c: '#D9A441', size: 's', cat: 'Chiffres',   d: 'Un chiffre, son évolution, mini-historique' },
  bourse:     { l: 'Cours de bourse', c: '#4A9FE0', size: 'h', cat: 'Chiffres', d: 'Le cours TradingView, figé au jour de l\'analyse' },
  overlay:    { l: 'Graphique superposé', c: '#4A9FE0', size: 'h', cat: 'Chiffres', d: 'Cours + FCF par action, dividende, BPA… sur un même graphique' },
  donut:      { l: 'Camembert',    c: '#4A9FE0', size: 's', cat: 'Chiffres',   d: 'Répartition : les parts se calculent seules' },
  geo:        { l: 'Carte du monde', c: '#4FD1A5', size: 'h', cat: 'Chiffres', d: 'Chiffre d\'affaires par pays ou par grande région' },
  barres:     { l: 'Barres',       c: '#4A9FE0', size: 'h', cat: 'Chiffres',   d: 'Plusieurs années, plusieurs séries' },
  courbes:    { l: 'Courbes',      c: '#4A9FE0', size: 'h', cat: 'Chiffres',   d: 'Évolution d\'un ou plusieurs indicateurs' },
  comparatif: { l: 'Comparatif',   c: '#B8A1F0', size: 'h', cat: 'Entreprises et personnes', d: 'Entreprises en colonnes, meilleure valeur surlignée' },
  concurrent: { l: 'Entreprise',   c: '#E5636B', size: 'v', cat: 'Entreprises et personnes', d: 'Concurrent, client, fournisseur : logo, chiffres, forces' },
  profil:     { l: 'Dirigeant',    c: '#F08A4B', size: 'v', cat: 'Entreprises et personnes', d: 'Photo, poste, parcours, actions détenues' },
  these:      { l: 'Thèse',        c: '#D9A441', size: 'h', cat: 'Thèse', d: 'Tes 7 questions, au départ ou à la fin de l\'analyse' },
  thesecmp:   { l: 'Thèse : avant / après', c: '#D9A441', size: 'h', cat: 'Thèse', d: 'Départ et fin côte à côte, avec un verdict' },
  source:     { l: 'Source',       c: '#8FA3B8', size: 's', cat: 'Documents',  d: 'PDF, site, article, avec tes notes' }
};
const THESE_Q = ['Pourquoi cette entreprise est-elle intéressante ?', 'Quels sont ses principaux avantages concurrentiels ?', 'Quels sont ses moteurs de croissance futurs ?',
  'Pourquoi peut-elle créer de la valeur à long terme ?', 'Qu\'est-ce que le marché pourrait sous-estimer ?', 'Quels risques pourraient invalider la thèse ?', 'Que dois-je surveiller pour vérifier que la thèse reste valable ?'];
const THESE_SHORT = ['Pourquoi elle', 'Avantages', 'Croissance', 'Création de valeur', 'Sous-estimé', 'Risques', 'À surveiller'];
const VERDICTS = { ok: ['Confirmée', '#4FD1A5'], nuance: ['Nuancée', '#D9A441'], ko: ['Invalidée', '#E5636B'] };
// Chiffres TradingView de l'onglet Analyse (companies[nom] : une ligne par exercice). u : unité d'affichage.
const TVF = {
  prixActuel:   { l: 'Cours',                    u: 'cur',  d: 2 },
  ca:           { l: 'Chiffre d\'affaires',      u: 'Mcur', d: 0 },
  croissanceCA: { l: 'Croissance du CA (5 ans)', u: '%',    d: 1, calc: true },
  margeOp:      { l: 'Marge opérationnelle',     u: '%',    d: 1 },
  roic:         { l: 'ROIC',                     u: '%',    d: 1 },
  fcfParAction: { l: 'FCF par action',           u: 'cur',  d: 2 },
  eps:          { l: 'BPA',                      u: 'cur',  d: 2 },
  dividende:    { l: 'Dividende par action',     u: 'cur',  d: 2 },
  rendementDiv: { l: 'Rendement du dividende',   u: '%',    d: 2 },
  payoutRatio:  { l: 'Taux de distribution',     u: '%',    d: 0 },
  per:          { l: 'PER',                      u: 'x',    d: 1, low: true },
  pFcf:         { l: 'P/FCF',                    u: 'x',    d: 1, low: true },
  detteOCF:     { l: 'Dette nette / OCF',        u: 'x',    d: 1, low: true },
  actions:      { l: 'Actions en circulation',   u: 'M',    d: 1, low: true },
  cash:         { l: 'Trésorerie',               u: 'Mcur', d: 0 },
  margeNette:   { l: 'Marge nette',              u: '%',    d: 1 },
  resultatNet:  { l: 'Résultat net',             u: 'Mcur', d: 0 },
  fcf:          { l: 'Free cash-flow',           u: 'Mcur', d: 0 }
};
const C = (type, titre, o) => Object.assign({ type, titre: titre || '' }, o || {});
// Modèle intégré : les 18 points de la checklist de l'utilisateur (2026-11-10) + Actualités + Sources. Les sous-points
// s'affichent en « à couvrir » sous le titre de chaque section ; quelques cartes reliées aux chiffres TradingView sont
// déjà posées, elles se remplissent toutes seules pour une entreprise connue de l'onglet Analyse.
const WOLF_SECTIONS = [
  ['Thèse de départ', ['À écrire AVANT l\'analyse : on la comparera à la thèse finale'], [C('these', '', { phase: 'depart', size: 'h' })]],
  ['Présentation', ['Histoire & dates clés', 'Activités', 'Implantation', 'Dirigeants', 'Mission & vision', 'Effectifs'], [C('texte', '', { size: 'h' }), C('bourse', '', { size: 'h' })]],
  ['Modèle économique', ['Comment elle gagne de l\'argent', 'Clients', 'Produits & services', 'Récurrence des revenus', 'Structure des coûts', 'Pouvoir de fixation des prix'], [C('texte', '', { size: 'h' })]],
  ['Répartition du chiffre d\'affaires', ['Par pays & régions', 'Par activités', 'Par filiales', 'Évolution historique'], [C('geo', '', { size: 'h' }), C('donut', '')]],
  ['Analyse des segments', ['Chiffre d\'affaires & croissance', 'Marges', 'Contribution aux résultats', 'Marché, concurrence, moat et perspectives par activité'], []],
  ['Marché', ['Taille (TAM / SAM / SOM)', 'Croissance', 'Tendances', 'Réglementation', 'Facteurs cycliques', 'Parts de marché'], []],
  ['Chaîne de valeur', ['Fournisseurs', 'Clients & distributeurs', 'Position de l\'entreprise', 'Dépendances stratégiques', 'Matières premières'], []],
  ['Avantage concurrentiel (moat)', ['Marque', 'Coûts de changement', 'Économies d\'échelle', 'Brevets', 'Effet de réseau', 'Coûts de production', 'Barrières à l\'entrée', 'Durabilité du moat'], []],
  ['Concurrence', ['Concurrents par activité', 'Parts de marché', 'Positionnement', 'Forces & faiblesses', 'Substituts', 'Nouveaux entrants'], [C('comparatif', '', { self: true })]],
  ['Perspectives de croissance', ['Moteurs organiques', 'Acquisitions', 'Nouveaux marchés', 'Investissements & innovations', 'Objectifs de la direction'], []],
  ['Risques', ['Opérationnels', 'Financiers', 'Réglementaires', 'Géopolitiques', 'Technologiques', 'Concurrentiels', 'Dépendances', 'ESG & litiges'], []],
  ['Management & gouvernance', ['Dirigeants & historique', 'Stratégie', 'Rémunération', 'Qualité de l\'exécution', 'Actions détenues par la direction'], [C('profil', '')]],
  ['Actionnariat', ['Principaux actionnaires', 'Fondateurs', 'Institutionnels', 'Flottant', 'Conflits d\'intérêts'], [C('donut', '')]],
  ['Allocation du capital', ['Dividendes', 'Rachats d\'actions', 'Acquisitions', 'Désendettement', 'Rendement du capital investi'], [C('kpi', '', { bind: 'tv:rendementDiv' }), C('kpi', '', { bind: 'tv:actions' })]],
  ['Analyse financière', ['CA, marges, bénéfices, cash-flow, dette, dilution, ROIC sur 5 à 10 ans'], [C('kpi', '', { bind: 'tv:ca' }), C('kpi', '', { bind: 'tv:margeOp' }), C('barres', '', { mode: 'tv', keys: ['ca'] }), C('kpi', '', { bind: 'tv:roic' }), C('kpi', '', { bind: 'tv:fcfParAction' }), C('courbes', '', { mode: 'tv', keys: ['eps', 'fcfParAction'] })]],
  ['Qualité financière', ['Conversion des bénéfices en trésorerie', 'Besoin en fonds de roulement', 'Investissements', 'Solidité du bilan', 'Cyclicité'], [C('kpi', '', { bind: 'tv:detteOCF' })]],
  ['Valorisation', ['Méthodes adaptées au secteur', 'Hypothèses', 'Scénarios pessimiste / central / optimiste', 'Valeur intrinsèque & marge de sécurité'], [C('kpi', '', { bind: 'tv:per' }), C('kpi', '', { bind: 'tv:pFcf' }), C('courbes', '', { mode: 'tv', keys: ['per', 'pFcf'] })]],
  ['Wolf Score', ['Critères', 'Notation', 'Justification'], []],
  ['Conclusion', ['Points forts', 'Points faibles', 'Risques majeurs', 'À surveiller'], [C('citation', '', { size: 'h' })]],
  ['Thèse finale', ['À écrire APRÈS l\'analyse'], [C('these', '', { phase: 'finale', size: 'h' }), C('thesecmp', '', { size: 'h' })]],
  ['Actualités', [], []],
  ['Sources', [], [C('source', '')]]
];
const BUILTIN = {
  'wolf-entreprise': { id: 'wolf-entreprise', nom: 'Template analyse — 10/11/2026', type: 'entreprise', builtin: true, sections: WOLF_SECTIONS.map(([titre, hint, cards]) => ({ titre, hint, cards })) },
  'wolf-chaine': { id: 'wolf-chaine', nom: 'Chaîne de valeur — 4 maillons', type: 'chaine', builtin: true, sections: ['Amont', 'Transformation', 'Distribution', 'Services & aval'].map(titre => ({ titre, hint: [], cards: [] })) },
  'vide': { id: 'vide', nom: 'Dossier vide (une section)', type: 'libre', builtin: true, sections: [{ titre: 'Notes', hint: [], cards: [] }] }
};

/* ---------- état ---------- */
let D = null, serverOk = false, loadErr = null, storeFile = '';
let RO = false, publishedAt = null;
let dirty = false, saving = false, saveTimer = null, lastSaved = null, saveErr = null, conflict = false, pendingDeleted = [];
const ui = { docId: null, view: 'grid', video: false, edit: null, big: null, modal: null, toast: null, side: true, q: '', open: {}, orgOpen: {}, menu: null, lib: null, drag: null };
let charts = [], bigCharts = [], editTimer = null;
const isRo = () => ui.video || RO;

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => (p || 'n') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const frDate = iso => { if (!iso) return ''; const p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const mediaUrl = f => RO ? 'data/public/media/' + encodeURIComponent(f) : '/api/atelier/media?f=' + encodeURIComponent(f);
const sectors = () => (typeof GICS_SECTORS !== 'undefined' ? GICS_SECTORS : []);
const sectorLabel = k => { const s = sectors().find(x => x.key === k); return s ? s.label : ''; };
const num = v => { if (typeof v === 'number') return isFinite(v) ? v : null; const t = String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.').replace('%', ''); if (t === '' || t === '-') return null; const n = Number(t); return isFinite(n) ? n : null; };
const fr = (v, d) => v == null || !isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const ICO = {
  expand: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 2h4v4M6 14H2v-4M14 2l-5 5M2 14l5-5"/></svg>',
  dots: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>',
  chevD: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>',
  chevR: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>',
  plus: '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M7 2v10M2 7h10"/></svg>',
  close: '<svg width="13" height="13" viewBox="0 0 12 12" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg>',
  left: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>',
  right: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>',
  shrink: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 6h-4V2M2 10h4v4M10 6l5-5M6 10l-5 5"/></svg>'
};
function sectorKeyFromText(txt){
  const t = norm(txt); if (!t) return '';
  const s = sectors().find(x => norm(x.label) === t || x.key === t || (x.match || []).some(m => t.includes(norm(m))));
  return s ? s.key : '';
}
// Seules les balises de mise en forme simples sont gardées.
function clean(html){
  const t = document.createElement('template'); t.innerHTML = String(html || '');
  const OK = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, MARK: 1, SPAN: 1, BR: 1, DIV: 1, P: 1, UL: 1, OL: 1, LI: 1, H2: 1, H3: 1, A: 1, FONT: 1 };
  const walk = node => { [...node.childNodes].forEach(ch => {
    if (ch.nodeType === 1){
      if (!OK[ch.tagName]){ if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(ch.tagName)) ch.remove(); else { walk(ch); ch.replaceWith(...ch.childNodes); } return; }
      [...ch.attributes].forEach(a => {
        if (a.name === 'href' && ch.tagName === 'A' && /^https?:\/\//i.test(a.value)) return;
        if (a.name === 'style'){ const m = /background(?:-color)?\s*:\s*([^;]+)/i.exec(a.value); ch.removeAttribute('style'); if (m && /^[#a-z0-9(),.\s%]+$/i.test(m[1])) ch.style.backgroundColor = m[1].trim(); return; }
        ch.removeAttribute(a.name);
      });
      if (ch.tagName === 'A'){ ch.target = '_blank'; ch.rel = 'noopener'; }
      walk(ch);
    } else if (ch.nodeType !== 3) ch.remove();
  }); };
  walk(t.content);
  return t.innerHTML;
}
const plain = html => { const t = document.createElement('div'); t.innerHTML = clean(html); return t.textContent.replace(/\s+/g, ' ').trim(); };

/* ---------- modèle ---------- */
const doc = () => D && ui.docId ? D.docs[ui.docId] : null;
const ver = d => { d = d || doc(); if (!d) return null; return d.versions.find(v => v.id === d.cur) || d.versions[d.versions.length - 1]; };
function touch(){ const d = doc(); if (d) d.updatedAt = new Date().toISOString(); markDirty(); }
function newCard(type, o){ return Object.assign({ id: uid('c'), type, size: TYPES[type] ? TYPES[type].size : 's', titre: '', createdAt: new Date().toISOString() }, JSON.parse(JSON.stringify(o || {})), { type }); }
function sectionsFromTemplate(tpl){
  if (tpl.sections) return tpl.sections;
  // ancien modèle « carte mentale » (arbre) : une section par branche principale, les sous-branches en « à couvrir »
  return ((tpl.tree && tpl.tree.kids) || []).map(k => ({ titre: k.titre, hint: (k.kids || []).map(x => x.titre), cards: [] }));
}
function newVersion(tpl, label){
  const v = { id: uid('v'), label: label || 'Version du ' + frDate(today()), date: today(), kind: 'cards', sections: [], cards: {} };
  sectionsFromTemplate(tpl).forEach((s, i) => {
    const sec = { id: uid('s'), titre: s.titre, hint: (s.hint || []).slice(), color: s.color || PALETTE[i % PALETTE.length], collapsed: false, cards: [] };
    (s.cards || []).forEach(c => { const n = newCard(c.type, c); delete n.self; if (c.self) n.cols = ['@self']; if (n.type === 'comparatif' && !n.metrics) n.metrics = ['croissanceCA', 'margeOp', 'roic', 'per', 'pFcf']; if (n.type === 'geo' && !n.rows) n.rows = [{ zone: 'Europe', v: null }, { zone: 'Amérique du Nord', v: null }, { zone: 'Asie-Pacifique', v: null }, { zone: 'Reste du monde', v: null }]; v.cards[n.id] = n; sec.cards.push(n.id); });
    v.sections.push(sec);
  });
  return v;
}
// Conversion d'une ancienne version « carte mentale » : une section par branche principale, chaque contenu de fiche
// devient une carte. Les nœuds d'origine restent dans la version (v.nodes / v.root) : rien n'est effacé.
function migrateVersion(v){
  if (v.kind === 'cards' || !v.nodes || !v.root || !v.nodes[v.root]) { if (!v.sections){ v.kind = 'cards'; v.sections = v.sections || []; v.cards = v.cards || {}; } return false; }
  v.kind = 'cards'; v.sections = []; v.cards = {}; v.migratedAt = new Date().toISOString();
  const root = v.nodes[v.root];
  const addBlocks = (sec, n, prefix) => {
    if (n.link){ const c = newCard('concurrent', { titre: '', nom: D.docs[n.link] ? D.docs[n.link].titre : '', docId: n.link }); v.cards[c.id] = c; sec.cards.push(c.id); return; }
    (n.blocks || []).forEach(b => {
      let c;
      const t = [prefix, b.titre].filter(Boolean).join(' — ');
      if (b.type === 'texte' || b.type === 'actu') c = newCard('texte', { titre: t, html: b.html || '', date: b.date || '', source: b.source || '', imgs: b.imgs || [] });
      else if (b.type === 'image') c = newCard('image', { titre: t, html: b.html || '', date: b.date || '', imgs: b.imgs || [] });
      else if (b.type === 'tv') c = newCard('kpi', { bind: 'tv:prixActuel' });
      else if (b.type === 'graph') c = newCard('barres', { titre: t, mode: 'tv', keys: [TVF[b.metric] ? b.metric : 'ca'] });
      if (c){ if ((c.imgs || []).length && c.type === 'texte'){ c.type = 'image'; } v.cards[c.id] = c; sec.cards.push(c.id); }
    });
    (n.kids || []).forEach(k => { if (v.nodes[k]) addBlocks(sec, v.nodes[k], v.nodes[k].titre); });
  };
  if ((root.blocks || []).length){ const s0 = { id: uid('s'), titre: 'Général', hint: [], color: PALETTE[0], cards: [] }; addBlocks(s0, { blocks: root.blocks, kids: [] }, ''); v.sections.push(s0); }
  root.kids.forEach((k, i) => {
    const n = v.nodes[k]; if (!n) return;
    const sec = { id: uid('s'), titre: (n.link && D.docs[n.link] ? D.docs[n.link].titre : n.titre) || 'Section', hint: (n.kids || []).map(x => v.nodes[x] && !(v.nodes[x].blocks || []).length ? v.nodes[x].titre : null).filter(Boolean), color: n.color || PALETTE[i % PALETTE.length], collapsed: false, cards: [] };
    addBlocks(sec, n.link ? { link: n.link } : { blocks: n.blocks, kids: n.kids }, '');
    v.sections.push(sec);
  });
  return true;
}
function migrateAll(){
  let ch = false;
  Object.values(D.docs).forEach(d => d.versions.forEach(v => {
    if (migrateVersion(v)) ch = true;
    Object.values(v.cards || {}).forEach(c => { if (c.type === 'comparatif' && !c.metrics){ c.metrics = ['croissanceCA', 'margeOp', 'roic', 'per', 'pFcf']; ch = true; } });
  }));
  Object.values(D.templates).forEach(t => { if (!t.sections && t.tree){ t.sections = sectionsFromTemplate(t); ch = true; } });
  return ch;
}
function findCompany(name){
  if (typeof companies === 'undefined' || !name) return null;
  const t = norm(name);
  const key = Object.keys(companies).find(n => norm(n) === t || (typeof fmpDisplayName === 'function' && norm(fmpDisplayName(n)) === t));
  if (!key) return null;
  const h = companies[key], last = h[h.length - 1] || {};
  let logo = last.lienImage || ''; if (!logo && typeof companyLogoUrl === 'function') logo = companyLogoUrl(key) || '';
  return { key, rows: h, last, logo, tv: String(last.ticker || '').includes(':') ? last.ticker : (last.tvSymbol || ''), secteur: sectorKeyFromText(last.secteur), sousSecteur: last.sousSecteur || '', devise: last.devise || 'EUR' };
}
const curSym = d => ({ EUR: '€', USD: '$', GBP: '£', GBX: 'p', GBp: 'p', CHF: 'CHF', JPY: '¥' }[d] || d || '€');
function fmtVal(v, u, devise, d){
  if (v == null || !isFinite(v)) return '—';
  const s = curSym(devise);
  if (u === '%') return fr(v, d == null ? 1 : d) + ' %';
  if (u === 'x') return fr(v, d == null ? 1 : d) + 'x';
  if (u === 'cur') return fr(v, d == null ? 2 : d) + ' ' + s;
  if (u === 'Mcur') return Math.abs(v) >= 1000 ? fr(v / 1000, 1) + ' Md' + s : fr(v, 0) + ' M' + s;
  if (u === 'M') return fr(v, d == null ? 1 : d) + ' M';
  return fr(v, d == null ? 2 : d) + (u ? ' ' + u : '');
}
// Série annuelle d'un champ TradingView pour une entreprise (lignes de companies[nom]) — calcul EN DIRECT.
function tvSeries(co, key, years){
  if (!co) return { labels: [], values: [] };
  return seriesFromRows(co.rows, key, years);
}
function seriesFromRows(rows0, key, years){
  let rows = (rows0 || []).filter(r => r.annee);
  if (key === 'croissanceCA'){
    const ca = rows.filter(r => typeof r.ca === 'number' && r.ca > 0);
    const out = { labels: [], values: [] };
    ca.forEach((r, i) => { if (i >= 5){ out.labels.push(r.annee); out.values.push((Math.pow(r.ca / ca[i - 5].ca, 1 / 5) - 1) * 100); } });
    if (years) { out.labels = out.labels.slice(-years); out.values = out.values.slice(-years); }
    return out;
  }
  rows = rows.filter(r => typeof r[key] === 'number' && isFinite(r[key]));
  if (years) rows = rows.slice(-years);
  return { labels: rows.map(r => r.annee), values: rows.map(r => r[key]) };
}
// Série FIGÉE (relevée sur TradingView et enregistrée dans la version, v.tvData) ; à défaut, calcul en direct.
// name = null : l'entreprise du dossier ; sinon une autre entreprise (comparatif, carte Entreprise).
function frozenOf(name){
  const v = ver(), t = v && v.tvData; if (!t) return null;
  return name == null ? t.self : (t.others || {})[norm(name)] || null;
}
function getSeries(name, key, years){
  const f = frozenOf(name);
  if (f && f.rows) return seriesFromRows(f.rows, key, years);
  const d = doc();
  return tvSeries(findCompany(name == null ? (d.nom || d.titre) : name), key, years);
}
function deviseOf(name){
  const f = frozenOf(name); if (f && f.devise) return f.devise;
  const d = doc(), co = findCompany(name == null ? (d.nom || d.titre) : name); return co ? co.devise : 'EUR';
}
function knownData(name){ const f = frozenOf(name); if (f && f.rows && f.rows.length) return true; const d = doc(); return !!findCompany(name == null ? (d.nom || d.titre) : name); }
// Valeur liée d'une carte : { v, prev, label, u, d, devise, src, period, series }
function resolveBind(doc, bind){
  if (!bind) return null;
  if (bind.startsWith('tv:')){
    const key = bind.slice(3), f = TVF[key]; if (!f) return null;
    const s = getSeries(null, key), n = s.values.length, t = ver() && ver().tvData;
    return { v: n ? s.values[n - 1] : null, prev: n > 1 ? s.values[n - 2] : null, label: f.l, u: f.u, d: f.d, devise: deviseOf(null), src: 'TradingView' + (t && t.at ? ' · ' + frDate(t.at) : ''), period: n ? String(s.labels[n - 1]) : '', series: s, low: !!f.low, known: knownData(null) };
  }
  if (bind.startsWith('f:')){
    const f = (doc.facts || {})[bind.slice(2)]; if (!f) return null;
    return { v: num(f.value), prev: num(f.prev), label: f.label, u: f.unit, d: null, devise: '', src: f.source || 'Saisie', period: f.period || '', series: null, fact: true };
  }
  return null;
}
const bindLabel = (doc, bind) => { const r = resolveBind(doc, bind); return r ? r.label : ''; };

/* ---------- relevé TradingView (figé dans la version, « ↻ Actualiser » pour le refaire) ---------- */
const TV_KEEP = ['annee', 'prixActuel', 'ca', 'margeOp', 'roic', 'fcfParAction', 'eps', 'dividende', 'rendementDiv', 'payoutRatio', 'per', 'pFcf', 'detteOCF', 'actions', 'cash', 'margeNette', 'resultatNet', 'fcf'];
// Historique annuel TradingView (20 exercices, le plus récent en premier, en devise de cotation) -> lignes par année.
// FCF par action = FCF × BPA ÷ résultat net (le scanner ne donne pas l'historique du nombre d'actions).
function rowsFromHistory(snap){
  const fy = parseInt(snap && snap.fiscal_period_fy, 10); if (!fy) return [];
  const H = k => Array.isArray(snap[k]) ? snap[k] : [];
  const rev = H('total_revenue_fy_h'), eps = H('earnings_per_share_diluted_fy_h'), dps = H('dps_common_stock_prim_issue_fy_h'), fcf = H('free_cash_flow_fy_h'), ni = H('net_income_fy_h');
  const n = Math.max(rev.length, eps.length, dps.length, fcf.length, ni.length), out = [];
  const ok = v => typeof v === 'number' && isFinite(v);
  for (let i = 0; i < n; i++){
    const r = { annee: fy - i };
    if (ok(rev[i])) r.ca = rev[i] / 1e6;
    if (ok(eps[i])) r.eps = eps[i];
    if (ok(dps[i])) r.dividende = dps[i];
    if (ok(ni[i])) r.resultatNet = ni[i] / 1e6;
    if (ok(fcf[i])) r.fcf = fcf[i] / 1e6;
    if (ok(fcf[i]) && ok(ni[i]) && ok(eps[i]) && ni[i] !== 0 && eps[i] !== 0 && ni[i] / eps[i] > 0) r.fcfParAction = fcf[i] / (ni[i] / eps[i]);
    if (ok(ni[i]) && ok(rev[i]) && rev[i] > 0) r.margeNette = ni[i] / rev[i] * 100;
    if (Object.keys(r).length > 1) out.push(r);
  }
  return out.reverse();
}
// Complète des lignes annuelles par l'historique TradingView (une valeur déjà présente n'est jamais remplacée).
function mergeRows(base, extra){
  const by = {}; (base || []).forEach(r => { by[r.annee] = Object.assign({}, r); });
  (extra || []).forEach(r => { const t = by[r.annee] = by[r.annee] || { annee: r.annee }; Object.keys(r).forEach(k => { if (t[k] == null) t[k] = r[k]; }); });
  return Object.values(by).sort((a, b) => a.annee - b.annee);
}
// Cours de fin d'année (dernière clôture hebdomadaire de chaque année) et ratios qui en découlent.
function addYearEndPrices(rows, prices){
  if (!prices || !prices.dates || !prices.dates.length) return rows;
  const last = {}; prices.dates.forEach((d, i) => { last[d.slice(0, 4)] = prices.closes[i]; });
  return rows.map(r => {
    const px = last[String(r.annee)]; if (px == null) return r;
    const o = Object.assign({}, r); if (o.prixActuel == null) o.prixActuel = px;
    if (o.per == null && o.eps > 0) o.per = o.prixActuel / o.eps;
    if (o.pFcf == null && o.fcfParAction > 0) o.pFcf = o.prixActuel / o.fcfParAction;
    if (o.rendementDiv == null && o.dividende != null && o.prixActuel) o.rendementDiv = o.dividende / o.prixActuel * 100;
    if (o.payoutRatio == null && o.dividende != null && o.eps > 0) o.payoutRatio = o.dividende / o.eps * 100;
    return o;
  });
}
const slimRows = rows => (rows || []).filter(r => r.annee).map(r => { const o = {}; TV_KEEP.forEach(k => { if (r[k] != null && (k === 'annee' || isFinite(r[k]))) o[k] = r[k]; }); return o; });
async function tvSymbolFor(name, known){
  const co = findCompany(name); if (co && co.tv) return co.tv;
  if (known) return known;
  try { const r = await fetch('/api/tv/search?q=' + encodeURIComponent(String(name).slice(0, 50)), { cache: 'no-store' }); const j = await r.json(); return j.ok && j.results && j.results[0] ? j.results[0].symbol : ''; } catch(e){ return ''; }
}
// Lignes annuelles d'une entreprise : l'historique de l'onglet Analyse si elle y est ; sinon les chiffres ACTUELS TradingView.
// Logo TradingView (rond, servi par TradingView : s'affiche aussi sur le site public, contrairement aux logos locaux).
async function tvLogo(sym){
  if (!sym || typeof tvRawSnapshot !== 'function') return '';
  try { const sn = await tvRawSnapshot(sym, true); return sn && sn.logoid ? 'https://s3-symbol-logo.tradingview.com/' + sn.logoid + '--big.svg' : ''; } catch(e){ return ''; }
}
async function tvRowsFor(name, sym){
  const co = findCompany(name), s2 = (co && co.tv) || sym;
  let snap = null;
  if (s2 && typeof tvFetchSnapshot === 'function'){ try { snap = await tvFetchSnapshot(s2); } catch(e){ snap = null; } }
  const hist = snap ? rowsFromHistory(snap) : [];
  const logo = snap && snap.logoid ? 'https://s3-symbol-logo.tradingview.com/' + snap.logoid + '--big.svg' : '';
  if (co && co.rows.length > 1) return { rows: mergeRows(slimRows(co.rows), hist), devise: co.devise, sym: s2, logo };
  if (!snap || typeof tvRowsFromSnapshot !== 'function') return co ? { rows: mergeRows(slimRows(co.rows), hist), devise: co.devise, sym: s2, logo } : null;
  const r = tvRowsFromSnapshot(s2, snap)[0];
  return { rows: mergeRows(slimRows([r]), hist), devise: r.devise || snap.currency || 'EUR', sym: s2, logo: logo || r.lienImage || '' };
}
let tvBusy = false;
async function captureTv(){
  const d = doc(), v = ver(); if (!d || !v || RO || tvBusy) return;
  tvBusy = true; ui.tvMsg = 'Relevé des chiffres TradingView…'; tvBar();
  try {
    const sym = await tvSymbolFor(d.nom || d.titre, d.tv);
    const self = d.type === 'entreprise' ? await tvRowsFor(d.nom || d.titre, sym) : null;
    if (self && self.sym && !d.tv){ d.tv = self.sym; }
    if (self && self.logo && (!d.logo || /^data\/logos\//.test(d.logo))) d.logo = self.logo;
    const t = { hv: 2, at: new Date().toISOString(), sym: self ? self.sym : '', self: self ? { rows: self.rows, devise: self.devise } : null, others: {}, prices: null };
    // cours hebdomadaires (cartes « Cours de bourse »)
    if (t.sym){
      try {
        const r = await fetch('/api/tv/history?symbols=' + encodeURIComponent(t.sym) + '&from=2006-01-01&adj=1', { cache: 'no-store' }); const j = await r.json();
        const h = j.ok && j.data && j.data[t.sym];
        if (h && h.bars && h.bars.length > 5){
          const iso = ts => new Date(ts * 1000).toISOString().slice(0, 10);
          const w = typeof resampleWeekly === 'function' ? resampleWeekly(h.bars.map(b => iso(b[0])), h.bars.map(b => b[1])) : { dates: h.bars.map(b => iso(b[0])), closes: h.bars.map(b => b[1]) };
          t.prices = { dates: w.dates, closes: w.closes, ccy: h.ccy || (self && self.devise) || '' };
        }
      } catch(e){ /* sans cours : les cartes Cours de bourse le disent */ }
    }
    if (t.self && t.prices) t.self.rows = addYearEndPrices(t.self.rows, t.prices);
    // autres entreprises citées (comparatif, cartes Entreprise)
    const names = new Set();
    Object.values(v.cards).forEach(c => { if (c.type === 'concurrent' && c.nom) names.add(c.nom); if (c.type === 'comparatif') compCols(c).forEach((n, i) => { if (!(i === 0 && (c.cols || [])[0] === '@self')) names.add(n); }); });
    for (const n of names){ try { const o = await tvRowsFor(n, await tvSymbolFor(n)); if (o) t.others[norm(n)] = { rows: o.rows, devise: o.devise, logo: o.logo || '' }; } catch(e){} }
    v.tvData = t; ui.tvMsg = null; touch(); renderShell();
  } catch(e){ ui.tvMsg = '⚠ TradingView indisponible : ' + (e.message || 'erreur'); tvBar(); }
  tvBusy = false;
}
function tvBar(){ const el = $('awTvBar'); if (el) el.innerHTML = tvBarHtml(); }
function tvBarHtml(){
  const v = ver(), t = v && v.tvData;
  if (ui.tvMsg) return '<span class="aw-tvinfo">' + esc(ui.tvMsg) + '</span>';
  if (!t) return RO ? '' : '<span class="aw-tvinfo">Chiffres TradingView pas encore relevés</span>' + (isRo() ? '' : '<button type="button" class="at-btn sm" data-tvrefresh>↻ Relever</button>');
  return '<span class="aw-tvinfo" title="Les chiffres TradingView de cette version sont figés à cette date">TradingView · figé le ' + frDate(t.at) + (t.sym ? ' · ' + esc(t.sym) : '') + '</span>' + (isRo() ? '' : '<button type="button" class="at-btn sm" data-tvrefresh title="Relire les chiffres et le cours sur TradingView (remplace ceux de cette version)">↻ Actualiser</button>');
}


/* ---------- persistance ---------- */
async function load(){
  try { const p = await fetch('/api/ia/ping', { cache: 'no-store' }); const j = await p.json(); serverOk = !!(j && j.ok && j.v >= 12); } catch(e){ serverOk = false; }
  if (!serverOk){
    try {
      const r = await fetch('data/public/atelier.json?_=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('aucune copie publiée');
      D = await r.json(); D.docs = D.docs || {}; D.templates = {}; D.trash = [];
      RO = true; serverOk = true; loadErr = null; publishedAt = D.publishedAt || null;
      migrateAll();
    } catch(e){ D = null; }
    return;
  }
  try {
    const r = await fetch('/api/store/load?name=atelier', { cache: 'no-store' }); const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'lecture impossible');
    storeFile = j.file || '';
    D = j.data || { version: 1, revision: 0, docs: {}, templates: {}, trash: [] };
    D.docs = D.docs || {}; D.templates = D.templates || {}; D.trash = D.trash || [];
    loadErr = null; dirty = false; conflict = false; pendingDeleted = [];
    if (migrateAll()) markDirty();
  } catch(e){ loadErr = e.message; D = null; }
}
function markDirty(){
  if (RO) return;
  dirty = true; saveErr = null; statusLabel();
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 700);
}
async function save(keepalive){
  if (!serverOk || !D || conflict || !dirty || RO) return;
  if (saving){ clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); return; }
  saving = true; dirty = false; statusLabel();
  const deleted = pendingDeleted.slice();
  const body = JSON.stringify(Object.assign({}, D, { revision: (D.revision || 0) + 1, baseRevision: D.revision || 0, deleted, savedAt: new Date().toISOString() }));
  try {
    const r = await fetch('/api/store/save?name=atelier', { method: 'POST', keepalive: !!keepalive && body.length < 60000, headers: { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' }, body });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409){ conflict = true; dirty = true; throw new Error('Le fichier a été modifié depuis un autre onglet.'); }
    if (!r.ok || !j.ok) throw new Error(j.error || 'enregistrement refusé');
    D.revision = j.revision; lastSaved = new Date(); pendingDeleted = pendingDeleted.filter(x => !deleted.includes(x)); saveErr = null;
  } catch(e){ saveErr = e.message || 'erreur'; dirty = true; if (!conflict){ clearTimeout(saveTimer); saveTimer = setTimeout(save, 4000); } }
  saving = false; statusLabel();
  if (conflict) renderShell();
}
function statusLabel(){
  const el = $('atStatus'); if (!el) return;
  let t, c = '';
  if (RO){ el.textContent = '🌐 Lecture seule' + (publishedAt ? ' · publié le ' + frDate(publishedAt) : ''); el.className = 'at-status wait'; return; }
  if (conflict){ t = '⚠ Modifié dans un autre onglet'; c = 'err'; }
  else if (saveErr){ t = '⚠ Non enregistré : ' + saveErr + ' (nouvel essai…)'; c = 'err'; }
  else if (saving || dirty){ t = '… enregistrement'; c = 'wait'; }
  else t = lastSaved ? '💾 Enregistré à ' + lastSaved.toLocaleTimeString('fr-FR') : '💾 Tout est enregistré';
  el.textContent = t; el.className = 'at-status ' + c;
}
window.addEventListener('beforeunload', e => { if (dirty && D && !conflict && !RO){ save(true); e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) save(true); });

/* ---------- corbeille ---------- */
function trash(entry, label){
  entry.at = new Date().toISOString(); entry.label = label; entry.id = uid('t');
  D.trash.unshift(entry);
  ui.toast = { text: '🗑 ' + label + ' : mis à la corbeille', undo: entry.id }; showToast();
}
function restore(tid){
  const i = D.trash.findIndex(t => t.id === tid); if (i < 0) return;
  const t = D.trash[i]; let ok = false;
  if (t.kind === 'doc'){ if (!D.docs[t.data.id]){ D.docs[t.data.id] = t.data; migrateAll(); ok = true; } }
  else if (t.kind === 'template'){ D.templates[t.data.id] = t.data; ok = true; }
  else {
    const d = D.docs[t.docId], v = d && d.versions.find(x => x.id === t.verId);
    if (t.kind === 'version' && d){ d.versions.push(t.data); migrateAll(); ok = true; }
    else if (t.kind === 'card' && v){
      const sec = v.sections.find(s => s.id === t.secId) || v.sections[0];
      if (sec){ v.cards[t.data.id] = t.data; sec.cards.splice(Math.min(t.index, sec.cards.length), 0, t.data.id); ok = true; }
    } else if (t.kind === 'section' && v){
      t.cards.forEach(c => { v.cards[c.id] = c; });
      v.sections.splice(Math.min(t.index, v.sections.length), 0, t.data); ok = true;
    } else if (t.kind === 'fact' && d){ d.facts = d.facts || {}; d.facts[t.data.id] = t.data; ok = true; }
  }
  if (!ok){ ui.toast = { text: 'Impossible de restaurer : l\'emplacement d\'origine n\'existe plus (l\'élément reste dans la corbeille).' }; showToast(); return; }
  D.trash.splice(i, 1); markDirty();
  ui.toast = { text: '↶ Restauré' }; showToast(); renderShell();
}
function showToast(){
  let el = $('atToast'); if (!el){ el = document.createElement('div'); el.id = 'atToast'; el.className = 'at-toast'; document.body.appendChild(el); }
  const t = ui.toast; if (!t){ el.classList.remove('on'); return; }
  el.innerHTML = '<span>' + esc(t.text) + '</span>' + (t.undo ? '<button type="button" data-undo="' + t.undo + '">↶ Annuler</button>' : '');
  el.classList.add('on');
  const u = el.querySelector('[data-undo]'); if (u) u.onclick = () => restore(t.undo);
  clearTimeout(showToast.tm); showToast.tm = setTimeout(() => { el.classList.remove('on'); }, t.undo ? 9000 : 3500);
}

/* ---------- actions ---------- */
function createDoc(o){
  const tpl = D.templates[o.tpl] || BUILTIN[o.tpl] || BUILTIN.vide;
  const c = o.type === 'entreprise' ? findCompany(o.titre) : null;
  const d = { id: uid('d'), type: o.type, titre: o.titre, nom: c ? c.key : '', logo: o.logo || (c ? c.logo : ''), tv: c ? c.tv : '', secteur: o.secteur || (c ? c.secteur : ''), sousSecteur: o.sousSecteur || (c ? c.sousSecteur : ''),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), versions: [], cur: null, facts: {} };
  const v = newVersion(tpl, 'Version 1 — ' + frDate(today()));
  d.versions.push(v); d.cur = v.id;
  D.docs[d.id] = d; markDirty();
  return d;
}
function openDoc(id){
  if (!D.docs[id]) return;
  ui.docId = id; ui.edit = null; ui.big = null; ui.menu = null; ui.orgOpen = {}; ui.tvMsg = null;
  renderShell();
  const v = ver(); // hv 2 = relevé avec l'historique 20 ans et les cours ajustés : un relevé plus ancien (sans historique) est refait une fois
  if (v && (!v.tvData || v.tvData.hv !== 2) && !RO && serverOk && D.docs[id].type === 'entreprise') captureTv();
  const m = $('atMain'); if (m) m.scrollTop = 0;
}
function deleteDoc(id){
  const d = D.docs[id]; if (!d) return;
  delete D.docs[id]; pendingDeleted.push(id);
  if (ui.docId === id) ui.docId = null;
  trash({ kind: 'doc', data: d }, 'Dossier « ' + d.titre + ' »'); markDirty(); renderShell();
}
const secOf = (v, cid) => v.sections.find(s => s.cards.includes(cid));
function addCard(secId, type, o){
  const v = ver(), sec = v.sections.find(s => s.id === secId) || v.sections[0]; if (!sec) return null;
  const c = newCard(type, o || {});
  if (type === 'comparatif' && !c.cols) c.cols = ['@self'];
  if (type === 'comparatif' && !c.metrics) c.metrics = ['croissanceCA', 'margeOp', 'roic', 'per', 'pFcf'];
  if (type === 'kpi' && !c.bind && doc().type === 'entreprise' && findCompany(doc().nom || doc().titre)) c.bind = 'tv:ca';
  if ((type === 'barres' || type === 'courbes') && !c.mode) { if (findCompany(doc().nom || doc().titre)){ c.mode = 'tv'; c.keys = type === 'barres' ? ['ca'] : ['eps']; } else { c.mode = 'manuel'; c.labels = ['2022', '2023', '2024', '2025']; c.series = [{ name: 'Série 1', values: [], color: SERIES_COLORS[0] }]; } }
  if (type === 'donut' && !c.rows) c.rows = [{ label: 'Catégorie 1', v: null }, { label: 'Catégorie 2', v: null }];
  if (type === 'geo' && !c.rows) c.rows = [{ zone: 'Europe', v: null }, { zone: 'Amérique du Nord', v: null }, { zone: 'Asie-Pacifique', v: null }, { zone: 'Reste du monde', v: null }];
  if (type === 'these' && !c.phase) c.phase = Object.values(ver().cards).some(x => x.type === 'these' && x.phase !== 'finale' && x.id !== c.id) ? 'finale' : 'depart';
  if (type === 'bourse' && !ver().tvData && !RO) setTimeout(captureTv, 50);
  if (type === 'overlay'){ if (!c.keys) c.keys = ['fcfParAction', 'dividende']; if (!c.range) c.range = '10a'; if (!ver().tvData && !RO) setTimeout(captureTv, 50); }
  v.cards[c.id] = c; sec.cards.push(c.id); sec.collapsed = false;
  touch(); return c;
}
function deleteCard(cid){
  const v = ver(), sec = secOf(v, cid), c = v.cards[cid]; if (!sec || !c) return;
  const index = sec.cards.indexOf(cid); sec.cards.splice(index, 1); delete v.cards[cid];
  if (ui.edit === cid) ui.edit = null;
  trash({ kind: 'card', docId: doc().id, verId: v.id, secId: sec.id, index, data: c }, 'Carte « ' + (cardTitle(c) || TYPES[c.type].l) + ' »');
  touch(); renderBody();
}
function duplicateCard(cid){
  const v = ver(), sec = secOf(v, cid), c = v.cards[cid]; if (!sec || !c) return;
  const n = JSON.parse(JSON.stringify(c)); n.id = uid('c'); n.createdAt = new Date().toISOString();
  v.cards[n.id] = n; sec.cards.splice(sec.cards.indexOf(cid) + 1, 0, n.id); touch(); renderBody();
}
function moveCard(cid, toSec, beforeCid){
  const v = ver(), from = secOf(v, cid), to = v.sections.find(s => s.id === toSec); if (!from || !to || cid === beforeCid) return;
  from.cards.splice(from.cards.indexOf(cid), 1);
  const i = beforeCid ? to.cards.indexOf(beforeCid) : -1;
  if (i >= 0) to.cards.splice(i, 0, cid); else to.cards.push(cid);
  to.collapsed = false; touch(); renderBody();
}
function addSection(titre){
  const v = ver(); const s = { id: uid('s'), titre: titre || 'Nouvelle section', hint: [], color: PALETTE[v.sections.length % PALETTE.length], collapsed: false, cards: [] };
  v.sections.push(s); touch(); return s;
}
function deleteSection(sid){
  const v = ver(), i = v.sections.findIndex(s => s.id === sid); if (i < 0) return;
  const s = v.sections[i], cards = s.cards.map(id => v.cards[id]).filter(Boolean);
  v.sections.splice(i, 1); s.cards.forEach(id => { delete v.cards[id]; });
  trash({ kind: 'section', docId: doc().id, verId: v.id, index: i, data: s, cards }, 'Section « ' + s.titre + ' »' + (cards.length ? ' (' + cards.length + ' cartes)' : ''));
  touch(); renderBody();
}

/* ====================== RENDU GÉNÉRAL ====================== */
function page(){ return $(PAGE_ID); }
function destroyCharts(list){ list.forEach(c => { try { c.destroy(); } catch(e){} }); list.length = 0; }
function renderShell(){
  const pg = page(); if (!pg) return;
  destroyCharts(charts);
  if (!serverOk || !D){
    pg.innerHTML = '<div class="at-off"><h2>🗂 Atelier d\'analyses</h2><p>' + (loadErr ? 'Lecture impossible : ' + esc(loadErr) : location.protocol === 'https:' ? 'Aucune analyse n\'a encore été publiée en ligne (bouton « 🌐 Publier en ligne » sur le PC).' : 'Le serveur local ne répond pas, ou c\'est une ancienne version.') +
      '</p>' + (location.protocol === 'https:' ? '' : '<p>Ferme l\'appli puis relance le raccourci Bureau <b>« Wolf Analysis »</b>. Rien n\'est modifiable tant que la sauvegarde sur le disque n\'est pas disponible : aucune donnée ne reste seulement en mémoire.</p>') + '<button type="button" class="at-btn gold" id="atRetry">Réessayer</button></div>';
    $('atRetry').onclick = () => onShow(true); return;
  }
  const d = doc();
  pg.className = 'page active at-page' + (ui.video ? ' at-video' : '') + (ui.side ? '' : ' at-noside') + (RO ? ' at-ro' : '');
  pg.innerHTML = (conflict ? '<div class="at-conflict">⚠ Ce fichier a été modifié depuis un autre onglet : tes dernières modifications ici ne sont pas enregistrées. <button type="button" class="at-btn" id="atReload">Recharger la dernière version</button></div>' : '') +
    '<div class="at-layout aw-layout"><aside class="at-side" id="atSide">' + sideHtml() + '</aside><section class="at-main aw-main" id="atMain">' + (d ? docHtml(d) : homeHtml()) + '</section></div>' +
    '<div id="atModalHost"></div><div id="awEditHost"></div>';
  wireShell();
  statusLabel();
  if (d) renderBody();
  if (ui.modal) renderModal();
  if (ui.edit) renderEditor();
}

/* ---------- répertoire (colonne de gauche) ---------- */
function docLogo(d, size){
  const st = 'width:' + size + 'px;height:' + size + 'px;';
  const ini = '<span class="at-logo at-logo-txt" style="' + st + '">' + esc(d.type === 'chaine' ? '🔗' : d.type === 'libre' ? '🧩' : (d.titre || '?').charAt(0).toUpperCase()) + '</span>';
  return d.logo ? '<img class="at-logo" style="' + st + '" src="' + esc(d.logo) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : ini;
}
function sideHtml(){
  const q = norm(ui.q), all = Object.values(D.docs).filter(d => !q || norm(d.titre + ' ' + d.sousSecteur + ' ' + sectorLabel(d.secteur)).includes(q));
  const row = d => '<button type="button" class="at-doc' + (d.id === ui.docId ? ' on' : '') + '" data-open="' + d.id + '">' + docLogo(d, 22) + '<span class="at-doc-t">' + esc(d.titre) + '</span>' +
    (d.versions.length > 1 ? '<small>v' + d.versions.length + '</small>' : '') + '</button>';
  const groups = sectors().map(s => ({ key: s.key, label: s.label })).concat([{ key: '', label: 'Sans secteur' }]);
  let html = '';
  groups.forEach(g => {
    const list = all.filter(d => (d.secteur || '') === g.key && d.type !== 'libre'); if (!list.length) return;
    const openG = q || ui.open['s:' + g.key] !== false;
    html += '<div class="at-grp"><button type="button" class="at-grp-h" data-tog="s:' + g.key + '">' + (openG ? '▾' : '▸') + ' ' + esc(g.label) + ' <small>' + list.length + '</small></button>';
    if (openG){
      const chains = list.filter(d => d.type === 'chaine'); if (chains.length) html += '<div class="at-sub-h">Chaînes de valeur</div>' + chains.map(row).join('');
      const subs = {}; list.filter(d => d.type === 'entreprise').forEach(d => { (subs[d.sousSecteur || ''] = subs[d.sousSecteur || ''] || []).push(d); });
      Object.keys(subs).sort((a, b) => a.localeCompare(b, 'fr')).forEach(s => { html += '<div class="at-sub-h">' + esc(s || 'Entreprises') + '</div>' + subs[s].sort((a, b) => a.titre.localeCompare(b.titre, 'fr')).map(row).join(''); });
    }
    html += '</div>';
  });
  const libres = all.filter(d => d.type === 'libre');
  if (libres.length) html += '<div class="at-grp"><div class="at-grp-h">Dossiers libres <small>' + libres.length + '</small></div>' + libres.map(row).join('') + '</div>';
  if (!all.length) html = '<p class="at-empty">' + (q ? 'Aucun dossier ne correspond.' : 'Aucun dossier pour l\'instant.') + '</p>';
  return '<div class="at-side-top"><button type="button" class="at-home" data-home>🗂 Atelier d\'analyses</button><div class="at-status" id="atStatus"></div>' +
    (RO ? '' : '<button type="button" class="at-btn gold wide" data-new>＋ Nouveau dossier</button>') + '<input type="search" class="at-search" id="atSearch" placeholder="Rechercher un dossier…" value="' + esc(ui.q) + '"></div><div class="at-tree">' + html + '</div>';
}

/* ---------- accueil ---------- */
function homeHtml(){
  const list = Object.values(D.docs).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const card = d => { const v = ver(d), nc = Object.keys(v.cards || {}).length;
    return '<button type="button" class="at-card" data-open="' + d.id + '">' + docLogo(d, 54) + '<b>' + esc(d.titre) + '</b><span>' + esc(DOC_LABEL[d.type]) + (d.secteur ? ' · ' + esc(sectorLabel(d.secteur)) : '') + '</span>' +
      '<small>' + (v.sections || []).length + ' sections · ' + nc + ' cartes · ' + d.versions.length + ' version' + (d.versions.length > 1 ? 's' : '') + '</small><small>Modifié le ' + frDate(d.updatedAt) + '</small></button>'; };
  const tpls = Object.values(D.templates);
  return '<div class="at-home-wrap"><div class="at-hero"><h2>Atelier d\'analyses</h2><p>Toutes tes analyses au même endroit, en cartes rangées par sections, avec une vue organigramme pour les vidéos. Tout est enregistré automatiquement dans un fichier sur ton ordinateur, avec des copies de secours.</p>' +
    (RO ? '' : '<div class="at-hero-btns"><button type="button" class="at-btn gold" data-new="entreprise">＋ Analyse d\'entreprise</button><button type="button" class="at-btn" data-new="chaine">＋ Chaîne de valeur</button><button type="button" class="at-btn" data-new="libre">＋ Dossier libre</button></div>') + '</div>' +
    (list.length ? '<h3 class="at-h3">Dossiers récents</h3><div class="at-cards">' + list.map(card).join('') + '</div>' : '') +
    (RO ? '' : '<h3 class="at-h3">Mes modèles de structure</h3><div class="at-tpls">' + (tpls.length ? tpls.map(t => '<div class="at-tpl"><b>' + esc(t.nom) + '</b><small>' + esc(DOC_LABEL[t.type] || '') + ' · ' + sectionsFromTemplate(t).length + ' sections</small><button type="button" class="at-x" data-deltpl="' + t.id + '" title="Supprimer ce modèle">✕</button></div>').join('')
      : '<p class="at-empty">Aucun modèle personnel. Ouvre un dossier, organise tes sections et tes cartes, puis « 💾 Modèle » : la structure sera proposée à chaque nouveau dossier.</p>') + '</div>' +
    '<h3 class="at-h3">Sauvegarde</h3><div class="at-save-box"><p>Fichier : <code>' + esc(storeFile || 'data/mes-portefeuilles/atelier.json') + '</code><br>Copies automatiques : toutes les 10 minutes (300 gardées), une par jour dans <code>Documents\\Wolf Analysis - sauvegardes</code>, et une copie figée chaque mois. Les images et PDF sont des fichiers séparés, jamais supprimés.</p>' +
    '<button type="button" class="at-btn" data-export>⬇ Télécharger une copie (.json)</button></div>' +
    '<h3 class="at-h3">Corbeille <small>(' + D.trash.length + ')</small></h3><div class="at-trash">' + (D.trash.length ? D.trash.slice(0, 80).map(t => '<div class="at-trash-row"><span>' + esc(t.label) + '</span><small>' + frDate(t.at) + '</small><button type="button" class="at-btn sm" data-restore="' + t.id + '">↶ Restaurer</button></div>').join('')
      : '<p class="at-empty">Vide. Tout ce que tu supprimes arrive ici et peut être restauré.</p>') + '</div>') + '</div>';
}

/* ---------- en-tête du dossier ---------- */
function docHtml(d){
  const v = ver(d), co = findCompany(d.nom || d.titre), fz = v.tvData && v.tvData.self, last = fz && fz.rows.length ? Object.assign({}, fz.rows[fz.rows.length - 1], { tvLiveAt: 1 }) : (co ? co.last : null);
  const chips = [d.secteur ? sectorLabel(d.secteur) : '', d.sousSecteur || '', DOC_LABEL[d.type]].filter(Boolean).map(t => '<span class="aw-chip">' + esc(t) + '</span>').join('') +
    '<span class="aw-chip gold">' + esc(v.label) + '</span>';
  const prix = d.type === 'entreprise' && window.PRIX_UI ? window.PRIX_UI.chip(d.titre) : '';
  let chain = '';
  if (d.chaine && D.docs[d.chaine.doc]) chain = '<button type="button" class="at-crumb" data-open="' + d.chaine.doc + '">🔗 ' + esc(D.docs[d.chaine.doc].titre) + '</button>';
  const cours = last && typeof last.prixActuel === 'number' ? '<div class="aw-price"><small>Cours</small><b>' + fmtVal(last.prixActuel, 'cur', fz ? fz.devise : co.devise) + '</b>' + (v.tvData ? '<span>au ' + frDate(v.tvData.at) + '</span>' : '') + '</div>' : '';
  return '<header class="aw-head">' + (ui.video ? '' : '<button type="button" class="at-btn ico" data-side title="Afficher / masquer le répertoire">☰</button>') + docLogo(d, 54) +
    '<div class="aw-head-t"><div class="aw-chips">' + chips + chain + prix + '</div><h1>' + esc(d.titre) + '</h1>' + (ui.video ? '' : '<div class="aw-tvbar" id="awTvBar">' + tvBarHtml() + '</div>') + '</div>' + cours + '</header>' +
    '<div class="aw-bar">' +
      '<span class="at-seg"><button type="button" class="' + (ui.view === 'grid' ? 'on' : '') + '" data-view="grid">Grille</button><button type="button" class="' + (ui.view === 'org' ? 'on' : '') + '" data-view="org">Organigramme</button></span>' +
      (ui.video ? '' : '<select class="at-sel" id="atVer" title="Version affichée">' + d.versions.map(x => '<option value="' + x.id + '"' + (x.id === v.id ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('') + '</select>') +
      (isRo() ? '' : '<button type="button" class="at-btn sm" data-newver title="Copie complète de cette version, l\'ancienne reste intacte">＋ Version</button><button type="button" class="at-btn sm" data-facts title="Les chiffres du dossier, utilisés par les cartes">📊 Données</button><button type="button" class="at-btn sm" data-savetpl title="Garder cette structure pour la réutiliser">💾 Modèle</button><button type="button" class="at-btn sm" data-props title="Nom, secteur, logo, version">⚙</button>') +
      '<span style="flex:1"></span>' +
      (ui.view === 'grid' ? '<button type="button" class="at-btn sm" data-allsec="0">Tout replier</button><button type="button" class="at-btn sm" data-allsec="1">Tout déplier</button>' : '<button type="button" class="at-btn sm" data-orgall="1">Tout ouvrir</button><button type="button" class="at-btn sm" data-orgall="0">Tout rabattre</button>') +
      (isRo() ? '' : '<button type="button" class="at-btn sm" data-addsec>＋ Section</button>') +
      (RO ? '' : '<button type="button" class="at-btn sm ' + (ui.video ? 'gold' : '') + '" data-video title="Masque tout l\'habillage pour la vidéo">' + (ui.video ? '✕ Quitter le mode vidéo' : '🎬 Mode vidéo') + '</button>') +
    '</div><div id="awBody"></div>';
}

/* ====================== CARTES ====================== */
function cardTitle(c){
  if (c.titre) return c.titre;
  if (c.type === 'profil') return c.nom || '';
  if (c.type === 'these') return c.phase === 'finale' ? 'Thèse finale' : 'Thèse de départ';
  if (c.type === 'thesecmp') return 'Thèse : avant / après';
  if (c.type === 'bourse') return 'Cours de bourse';
  if (c.type === 'overlay') return 'Cours et fondamentaux';
  if (c.type === 'kpi'){ const d = doc(); return c.bind ? bindLabel(d, c.bind) : (c.label || ''); }
  if (c.type === 'concurrent') return c.nom || '';
  return '';
}
const sourceOf = (v, c) => c.srcId && v.cards[c.srcId] ? v.cards[c.srcId] : null;
function chromeHtml(c, body, foot, extraCls){
  const ro = isRo();
  const btns = '<span class="aw-cbtns"><button type="button" class="aw-kb" data-c-big title="Agrandir">' + ICO.expand + '</button>' +
    (ro ? '' : '<button type="button" class="aw-kb" data-c-menu title="Actions">' + ICO.dots + '</button>') + '</span>';
  const head = c.titre ? '<div class="aw-chead"><h3 class="aw-ct">' + esc(c.titre) + '</h3></div>' : '';
  return '<article class="aw-card sz-' + (c.collapsed ? 'z' : c.size || 's') + ' t-' + c.type + (c.titre ? '' : ' notitle') + (extraCls ? ' ' + extraCls : '') + '" data-cid="' + c.id + '"' + (ro ? '' : ' draggable="true"') + '>' + head + btns +
    '<div class="aw-cbody">' + body + '</div>' + (foot ? '<div class="aw-foot">' + foot + '</div>' : '') +
    (ro ? '' : '<span class="aw-resize" data-c-resize title="Glisser pour changer le format"></span>') + '</article>';
}
function collapsedHtml(c){
  const t = TYPES[c.type];
  return '<article class="aw-card sz-z" data-cid="' + c.id + '"' + (isRo() ? '' : ' draggable="true"') + '><button type="button" class="aw-zrow" data-c-unfold title="Déplier"><span class="aw-chev">' + ICO.chevR + '</span><b>' + esc(cardTitle(c) || t.l) + '</b><span class="aw-zval">' + esc(keyFigure(c)) + '</span></button>' +
    '<button type="button" class="aw-kb" data-c-big title="Agrandir">' + ICO.expand + '</button>' + (isRo() ? '' : '<button type="button" class="aw-kb" data-c-menu title="Actions">' + ICO.dots + '</button>') + '</article>';
}
// Le chiffre clé d'une carte (aperçu replié, organigramme).
function keyFigure(c){
  const d = doc();
  if (c.type === 'kpi'){ const r = kpiData(c); return r ? fmtVal(r.v, r.u, r.devise, r.d) : ''; }
  if (c.type === 'donut'){ const rows = (c.rows || []).filter(r => num(r.v) > 0), tot = rows.reduce((s, r) => s + num(r.v), 0); if (!tot) return ''; const top = rows.slice().sort((a, b) => num(b.v) - num(a.v))[0]; return top.label + ' ' + fr(num(top.v) / tot * 100, 0) + ' %'; }
  if (c.type === 'barres' || c.type === 'courbes'){ const s = seriesData(c, d); const f = s.sets[0]; if (!f) return ''; const n = f.values.length; return n ? s.labels[n - 1] + ' : ' + fmtVal(f.values[n - 1], f.u, f.devise) : ''; }
  if (c.type === 'comparatif') return (c.cols || []).length + ' entreprises';
  if (c.type === 'concurrent') return c.pays || '';
  if (c.type === 'source') return ({ pdf: 'PDF', web: 'Site web', article: 'Article', video: 'Vidéo' }[c.kind] || '') + (c.pages ? ' · ' + c.pages + ' p.' : '');
  if (c.type === 'bourse'){ const p = ver().tvData && ver().tvData.prices; return p && p.closes.length ? fr(p.closes[p.closes.length - 1], 2) + ' ' + curSym(p.ccy) : ''; }
  if (c.type === 'geo'){ const rows = (c.rows || []).filter(r => num(r.v) > 0), tot = rows.reduce((t, r) => t + num(r.v), 0); if (!tot) return ''; const top = rows.slice().sort((a, b) => num(b.v) - num(a.v))[0]; return top.zone + ' ' + fr(num(top.v) / tot * 100, 0) + ' %'; }
  if (c.type === 'profil') return [c.nom, c.poste].filter(Boolean).join(' · ');
  if (c.type === 'these') return c.phase === 'finale' ? 'Thèse finale' : 'Thèse de départ';
  if (c.type === 'thesecmp') return Object.values(c.verdicts || {}).filter(Boolean).length + ' / 7 verdicts';
  return plain(c.html).slice(0, 60);
}
function kpiData(c){
  const d = doc();
  if (c.bind){ const r = resolveBind(d, c.bind); if (r) return r; }
  return { v: num(c.value), prev: num(c.prev), label: c.label || 'Indicateur', u: c.unit || '', d: null, devise: '', src: c.source || '', period: c.period || '', series: null };
}
function sparkSvg(vals, color, h){
  vals = (vals || []).filter(x => x != null && isFinite(x)); if (vals.length < 2) return '';
  const mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1, W = 200;
  const pts = vals.map((v, i) => (i / (vals.length - 1) * W).toFixed(1) + ',' + (h - 3 - (v - mn) / rg * (h - 6)).toFixed(1)).join(' ');
  return '<svg class="aw-spark" viewBox="0 0 ' + W + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>';
}
function deltaHtml(r){
  if (r.v == null || r.prev == null || !isFinite(r.prev) || r.prev === 0) return '';
  const pts = r.u === '%' || r.u === 'x';
  const dv = pts ? r.v - r.prev : (r.v / r.prev - 1) * 100;
  const good = r.low ? dv < 0 : dv >= 0;
  return '<span class="aw-delta ' + (good ? 'pos' : 'neg') + '">' + (dv >= 0 ? '+' : '') + fr(dv, 1) + (pts ? (r.u === '%' ? ' pt' : 'x') : ' %') + '</span>';
}
function cardHtml(c){
  if (c.collapsed) return collapsedHtml(c);
  const d = doc(), v = ver(), src = sourceOf(v, c);
  let body = '', foot = '';
  const srcFoot = src ? '<button type="button" class="aw-srcchip" data-c-big="' + src.id + '">📄 ' + esc(src.titre || 'Source') + '</button>' : (c.source ? '<span>' + esc(c.source) + '</span>' : '');
  switch (c.type){
    case 'texte':
      body = (c.date ? '<span class="aw-date">' + frDate(c.date) + '</span>' : '') + '<div class="aw-text">' + (clean(c.html) || '<span class="at-faint">' + (isRo() ? '' : 'Vide — ⋯ › Modifier pour écrire.') + '</span>') + '</div>';
      foot = srcFoot; break;
    case 'image': {
      const im = (c.imgs || [])[0];
      body = '<div class="aw-imgbox">' + (im ? '<img src="' + esc(mediaUrl(im.f)) + '" alt="" loading="lazy">' : '<span>Aucune image</span>') + (c.date ? '<span class="aw-date over">' + frDate(c.date) + '</span>' : '') + ((c.imgs || []).length > 1 ? '<span class="aw-more">+' + (c.imgs.length - 1) + '</span>' : '') + '</div>' +
        (plain(c.html) ? '<div class="aw-text sm">' + clean(c.html) + '</div>' : '');
      foot = srcFoot; break;
    }
    case 'citation':
      body = '<div class="aw-quote-mark">«</div><div class="aw-quote">' + (clean(c.html) || '<span class="at-faint">Ta phrase clé…</span>') + '</div>';
      foot = '<span class="aw-quote-l">' + esc(c.titre || '') + (c.date ? ' · ' + frDate(c.date) : '') + '</span>'; break;
    case 'kpi': {
      const r = kpiData(c);
      body = '<div class="aw-kpi-l">' + esc(r.label) + (r.period ? ' <span>' + esc(r.period) + '</span>' : '') + '</div><div class="aw-kpi-v">' + fmtVal(r.v, r.u, r.devise, r.d) + '</div>' +
        '<div class="aw-kpi-d">' + deltaHtml(r) + (r.prev != null ? '<span class="at-faint">avant : ' + fmtVal(r.prev, r.u, r.devise, r.d) + '</span>' : '') + '</div>' + (r.series ? sparkSvg(r.series.values.slice(-10), '#D9A441', 40) : '');
      foot = c.bind ? '' : (r.src ? '<span>' + esc(r.src) + '</span>' : '');
      if (c.bind && r.known === false) foot = '<span class="aw-warn">' + (ver().tvData ? 'pas de chiffre TradingView' : 'chiffres TradingView pas encore relevés') + '</span>';
      break;
    }
    case 'donut': {
      const rows = (c.rows || []).filter(r => num(r.v) > 0), tot = rows.reduce((s, r) => s + num(r.v), 0);
      body = tot ? '<div class="aw-donut"><div class="aw-donut-c"><canvas data-chart="' + c.id + '"></canvas><div class="aw-donut-t"><b>' + fr(tot, tot >= 100 ? 0 : 1) + '</b><span>' + esc(c.unit || '') + '</span></div></div><div class="aw-legend">' +
        rows.map((r, i) => '<div><span class="aw-dot" style="background:' + (r.color || SERIES_COLORS[i % SERIES_COLORS.length]) + '"></span><span class="lb">' + esc(r.label) + '</span><b>' + fr(num(r.v) / tot * 100, 0) + ' %</b></div>').join('') + '</div></div>'
        : '<p class="at-faint">Ajoute des catégories et leurs montants (⋯ › Modifier).</p>';
      foot = srcFoot; break;
    }
    case 'barres': case 'courbes': {
      const s = seriesData(c, d);
      body = s.labels.length ? '<div class="aw-chart"><canvas data-chart="' + c.id + '"></canvas></div>' : '<p class="at-faint">' + (c.mode === 'tv' ? (ver().tvData ? 'Pas d\'historique TradingView pour ce chiffre.' : 'Chiffres TradingView en cours de relevé…') : 'Saisis les années et les valeurs (⋯ › Modifier).') + '</p>';
      foot = srcFoot; break;
    }
    case 'comparatif': body = compTableHtml(c, false); foot = srcFoot; break;
    case 'bourse': body = bourseHtml(c, false); break;
    case 'overlay': body = overlayHtml(c, false); break;
    case 'geo': body = geoHtml(c, false); foot = srcFoot; break;
    case 'profil': body = profilHtml(c, false); break;
    case 'these': body = theseHtml(c, false); break;
    case 'thesecmp': body = theseCmpHtml(c, false); break;
    case 'concurrent': body = concHtml(c, false); break;
    case 'source': body = srcHtml(c, false, v); break;
  }
  return chromeHtml(c, body, foot);
}
// Colonnes : celles choisies, puis (sauf si décoché) les entreprises des cartes « Entreprise » du dossier : ajouter un
// concurrent l'ajoute aussi au comparatif.
function compCols(c){
  const d = doc(), v = ver();
  const cols = (c.cols || []).map(n => n === '@self' ? (d.nom ? (typeof fmpDisplayName === 'function' ? fmpDisplayName(d.nom) : d.nom) : d.titre) : n).filter(Boolean);
  if (c.withConc !== false && v) Object.values(v.cards).forEach(x => { if (x.type === 'concurrent' && x.nom && !cols.some(n => norm(n) === norm(x.nom))) cols.push(x.nom); });
  return cols;
}
function compValue(c, colName, key, ci){
  const ov = c.over && c.over[key] && c.over[key][ci];
  if (ov != null && ov !== '') return num(ov);
  const d = doc(), self = ci === 0 && (c.cols || [])[0] === '@self';
  const s = getSeries(self ? null : colName, key); return s.values.length ? s.values[s.values.length - 1] : null;
}
function compTableHtml(c, big){
  const cols = compCols(c), metrics = (c.metrics || []).filter(k => TVF[k]);
  if (!cols.length || !metrics.length) return '<p class="at-faint">Ajoute des entreprises et des indicateurs (⋯ › Modifier).</p>';
  const head = '<tr><th></th>' + cols.map((n, i) => { const co = findCompany(n); return '<th class="' + (i === 0 && (c.cols || [])[0] === '@self' ? 'me' : '') + '">' + (big && co && co.logo ? '<img src="' + esc(co.logo) + '" alt="" class="aw-tlogo">' : '') + esc(n.length > 16 && !big ? n.slice(0, 15) + '…' : n) + '</th>'; }).join('') + '</tr>';
  const body = metrics.map(k => {
    const f = TVF[k], vals = cols.map((n, i) => compValue(c, n, k, i)), ok = vals.filter(x => x != null);
    const best = ok.length > 1 ? (f.low ? Math.min(...ok) : Math.max(...ok)) : null, worst = ok.length > 2 ? (f.low ? Math.max(...ok) : Math.min(...ok)) : null;
    const mx = Math.max(...ok.map(Math.abs), 0) || 1;
    return '<tr><td class="lb">' + esc(f.l) + '</td>' + vals.map((x, i) => '<td><span class="' + (x != null && x === best ? 'best' : x != null && x === worst ? 'worst' : '') + '">' + fmtVal(x, f.u, deviseOf(i === 0 && (c.cols || [])[0] === '@self' ? null : cols[i]), f.d) + '</span>' +
      (big && x != null ? '<i class="aw-cbar" style="width:' + Math.max(4, Math.abs(x) / mx * 100).toFixed(0) + '%"></i>' : '') + '</td>').join('') + '</tr>';
  }).join('');
  return '<div class="aw-tscroll"><table class="aw-table' + (big ? ' big' : '') + '"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
}
function concHtml(c, big){
  const co = findCompany(c.nom), fz = frozenOf(c.nom), logo = c.logo || (fz && fz.logo) || (co ? co.logo : '') || '', linked = c.docId && D.docs[c.docId] ? D.docs[c.docId] : Object.values(D.docs).find(x => x.type === 'entreprise' && norm(x.titre) === norm(c.nom) && x.id !== ui.docId);
  const keys = big ? ['ca', 'croissanceCA', 'margeOp', 'roic', 'per', 'pFcf', 'rendementDiv', 'detteOCF'] : ['margeOp', 'croissanceCA', 'per'];
  const known = knownData(c.nom || '?');
  const metrics = known ? '<div class="aw-cmetrics' + (big ? ' big' : '') + '">' + keys.map(k => { const s = getSeries(c.nom, k), v = s.values.length ? s.values[s.values.length - 1] : null; return '<div><b>' + fmtVal(v, TVF[k].u, deviseOf(c.nom), TVF[k].d) + '</b><span>' + esc(TVF[k].l) + '</span></div>'; }).join('') + '</div>' : '';
  return '<div class="aw-conc-top"><div class="aw-conc-logo">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : '<span>' + esc((c.nom || '?').slice(0, 2).toUpperCase()) + '</span>') + '</div><div><div class="aw-conc-n">' + esc(c.nom || 'Entreprise') + '</div><div class="aw-conc-s">' + esc([c.pays, c.role].filter(Boolean).join(' · ')) + '</div></div></div>' +
    (c.tags ? '<div class="aw-tags">' + String(c.tags).split(',').map(t => t.trim()).filter(Boolean).map(t => '<span>' + esc(t) + '</span>').join('') + '</div>' : '') + metrics +
    (c.forces ? '<div class="aw-fw"><b class="pos">Forces</b><p>' + esc(c.forces) + '</p></div>' : '') + (c.faiblesses ? '<div class="aw-fw"><b class="neg">Faiblesses</b><p>' + esc(c.faiblesses) + '</p></div>' : '') +
    (big && known ? '<div class="aw-chart big2"><canvas data-chart="conc-' + c.id + '"></canvas></div>' : '') +
    (linked ? '<button type="button" class="aw-linkbtn" data-open="' + linked.id + '">Ouvrir son dossier ›</button>' : '');
}
function srcHtml(c, big, v){
  const used = Object.values(v.cards).filter(x => x.srcId === c.id).length;
  const kind = { pdf: 'PDF', web: 'Site web', article: 'Article', video: 'Vidéo' }[c.kind] || 'Document';
  const isPdf = c.file && /\.pdf$/i.test(c.file), isImg = c.file && !isPdf;
  const prev = isImg ? '<img class="aw-src-img" src="' + esc(mediaUrl(c.file)) + '" alt="">' : '<div class="aw-src-page" aria-hidden="true"><i></i><i></i><i></i><i class="s"></i><i class="b"></i></div>';
  let h = '<div class="aw-src">' + prev + '<div><div class="aw-src-t">' + esc(c.titre || 'Source') + '</div><div class="aw-src-s">' + esc(kind + (c.pages ? ' · ' + c.pages + ' pages' : '') + (c.date ? ' · ' + frDate(c.date) : '')) + '</div>' +
    (c.url && /^https?:\/\//i.test(c.url) ? '<a href="' + esc(c.url) + '" target="_blank" rel="noopener" class="aw-src-u">' + esc(c.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) + '</a>' : '') + '</div></div>' +
    (c.note ? '<p class="aw-src-note">' + esc(c.note) + '</p>' : '') + (used ? '<span class="aw-link">utilisée par ' + used + ' carte' + (used > 1 ? 's' : '') + '</span>' : '');
  if (big && isPdf) h += '<object class="aw-pdf" data="' + esc(mediaUrl(c.file)) + '" type="application/pdf"><a href="' + esc(mediaUrl(c.file)) + '" target="_blank" rel="noopener">Ouvrir le PDF</a></object>';
  else if (c.file && isPdf) h += '<a class="aw-linkbtn" href="' + esc(mediaUrl(c.file)) + '" target="_blank" rel="noopener">Ouvrir le PDF ›</a>';
  return h;
}
// Données d'un graphique barres / courbes : liées à TradingView (relevé figé de la version) ou saisies.
function seriesData(c, d){
  if (c.mode === 'tv'){
    const name = d && d.__other ? d.__other : null, keys = (c.keys || []).filter(k => TVF[k]);
    const per = keys.map(k => getSeries(name, k, c.years || 10));
    const labels = [...new Set(per.flatMap(s => s.labels))].sort((a, b) => a - b);
    return { labels, sets: keys.map((k, i) => ({ name: TVF[k].l, u: TVF[k].u, devise: deviseOf(name), color: SERIES_COLORS[i % SERIES_COLORS.length], values: labels.map(y => { const j = per[i].labels.indexOf(y); return j >= 0 ? per[i].values[j] : null; }) })) };
  }
  const labels = (c.labels || []).map(String);
  return { labels, sets: (c.series || []).map((s, i) => ({ name: s.name || 'Série ' + (i + 1), u: c.unit || '', devise: '', color: s.color || SERIES_COLORS[i % SERIES_COLORS.length], values: labels.map((_, j) => num((s.values || [])[j])) })) };
}
// ---------- Cours de bourse (relevé TradingView figé : clôtures hebdomadaires) ----------
const RANGES = [['1a', 1, '1 an'], ['5a', 5, '5 ans'], ['10a', 10, '10 ans'], ['max', 99, 'Max']];
function pricesFor(c){
  const p = ver().tvData && ver().tvData.prices; if (!p || !p.closes.length) return null;
  const yrs = (RANGES.find(r => r[0] === (c.range || '5a')) || RANGES[1])[1];
  const from = new Date(Date.now() - yrs * 365.25 * 864e5).toISOString().slice(0, 10);
  const i0 = Math.max(0, p.dates.findIndex(x => x >= from));
  return { dates: p.dates.slice(i0), closes: p.closes.slice(i0), ccy: p.ccy, all: p };
}
function bourseHtml(c, big){
  const p = pricesFor(c), t = ver().tvData;
  if (!p) return '<p class="at-faint">' + (t ? 'Pas de cours TradingView pour cette entreprise.' : 'Cours TradingView en cours de relevé…') + '</p>';
  const first = p.closes[0], last = p.closes[p.closes.length - 1], perf = first ? (last / first - 1) * 100 : null;
  const seg = '<span class="aw-range">' + RANGES.map(r => '<button type="button" data-range="' + r[0] + '" class="' + ((c.range || '5a') === r[0] ? 'on' : '') + '">' + r[2] + '</button>').join('') + '</span>';
  let h = '<div class="aw-bourse-h"><b>' + fr(last, 2) + ' ' + curSym(p.ccy) + '</b>' + (perf != null ? '<span class="aw-delta ' + (perf >= 0 ? 'pos' : 'neg') + '">' + (perf >= 0 ? '+' : '') + fr(perf, 1) + ' %</span>' : '') + seg + '</div><div class="aw-chart' + (big ? ' xl' : '') + '"><canvas data-chart="' + c.id + '"></canvas></div>';
  if (big){
    const all = p.all, yr = n => { const from = new Date(new Date(t.at).getTime() - n * 365.25 * 864e5).toISOString().slice(0, 10); const i = all.dates.findIndex(x => x >= from); return i >= 0 && i < all.closes.length - 1 ? all.closes[i] : null; };
    const L = all.closes[all.closes.length - 1], st = (l, v) => '<div class="aw-stat"><span>' + l + '</span><b>' + v + '</b></div>';
    const ann = n => { const a = yr(n); return a ? fr((Math.pow(L / a, 1 / n) - 1) * 100, 1) + ' %/an' : '—'; };
    const a1 = yr(1);
    h += '<div class="aw-stats">' + st('Sur 1 an', a1 ? fr((L / a1 - 1) * 100, 1) + ' %' : '—') + st('Par an sur 5 ans', ann(5)) + st('Par an sur 10 ans', ann(10)) +
      st('Plus haut de la période', fr(Math.max(...p.closes), 2) + ' ' + curSym(p.ccy)) + st('Plus bas de la période', fr(Math.min(...p.closes), 2) + ' ' + curSym(p.ccy)) + '</div><p class="aw-note">TradingView, clôtures hebdomadaires, relevé du ' + frDate(t.at) + '.</p>';
  }
  return h;
}
// ---------- Graphique superposé : cours (gauche) + chiffres par action (droite), ou tout en base 100 ----------
const OV_COLORS = ['#4A9FE0', '#4FD1A5', '#B8A1F0', '#F08A4B', '#5CC8D7', '#E5636B', '#8FA3B8'];   // jamais d'or : réservé au cours
const OV_KEYS = ['fcfParAction', 'dividende', 'eps', 'ca', 'margeNette', 'fcf', 'resultatNet', 'per', 'pFcf'];
function overlayData(c){
  const t = ver().tvData, p = t && t.prices, yrs = (RANGES.find(r => r[0] === (c.range || '10a')) || RANGES[2])[1];
  const keys = (c.keys || ['fcfParAction', 'dividende']).filter(k => TVF[k]);
  const fromY = new Date().getFullYear() - yrs;
  let labels, priceSet = null;
  if (p && p.closes.length && c.price !== false){
    const i0 = Math.max(0, p.dates.findIndex(x => x.slice(0, 4) >= String(fromY)));
    labels = p.dates.slice(i0); priceSet = p.closes.slice(i0);
  } else labels = [...new Set(keys.flatMap(k => getSeries(null, k).labels))].filter(y => y >= fromY).sort((a, b) => a - b).map(y => y + '-12-31');
  const yearIdx = {}; labels.forEach((d, i) => { yearIdx[d.slice(0, 4)] = i; });   // dernier point de chaque année
  const sets = keys.map((k, n) => { const s = getSeries(null, k), arr = labels.map(() => null);
    s.labels.forEach((y, j) => { const i = yearIdx[String(y)]; if (i != null) arr[i] = s.values[j]; });
    return { k, name: TVF[k].l, u: TVF[k].u, color: OV_COLORS[n % OV_COLORS.length], values: arr }; });
  if (c.norm){
    const base = a => { const f = a.find(v => v != null && v > 0); return f ? a.map(v => v == null ? null : v / f * 100) : a.map(() => null); };
    if (priceSet) priceSet = base(priceSet);
    sets.forEach(x => { x.values = base(x.values); x.u = 'base100'; });
  }
  return { labels, priceSet, sets, ccy: p ? p.ccy : '' };
}
function overlayHtml(c, big){
  const t = ver().tvData; if (!t) return '<p class="at-faint">Chiffres TradingView en cours de relevé…</p>';
  const seg = '<span class="aw-range">' + RANGES.map(r => '<button type="button" data-range="' + r[0] + '" class="' + ((c.range || '10a') === r[0] ? 'on' : '') + '">' + r[2] + '</button>').join('') + '</span>';
  const keys = (c.keys || ['fcfParAction', 'dividende']);
  const leg = '<div class="aw-ov-leg">' + (c.price !== false ? '<span><i style="background:#D9A441"></i>Cours</span>' : '') + keys.filter(k => TVF[k]).map((k, n) => '<span><i style="background:' + OV_COLORS[n % OV_COLORS.length] + '"></i>' + esc(TVF[k].l) + '</span>').join('') + (c.norm ? '<span class="at-faint">base 100</span>' : '') + '</div>';
  return '<div class="aw-bourse-h">' + leg + seg + '</div><div class="aw-chart' + (big ? ' xl' : '') + '"><canvas data-chart="' + c.id + '"></canvas></div>' + (big ? '<p class="aw-note">Cours hebdomadaire TradingView et chiffres annuels (fin d\'exercice) relevés le ' + frDate(t.at) + (c.norm ? ' · tout est ramené à 100 au début de la période pour comparer les croissances.' : ' · cours à gauche, chiffres par action à droite.') + '</p>' : '');
}
// ---------- Carte du monde (chiffre d'affaires par pays ou région) ----------
const ZONES = {
  'Europe': x => x.r === 'Europe', 'Europe de l\'Ouest': x => ['Western Europe', 'Northern Europe', 'Southern Europe', 'Central Europe'].includes(x.s),
  'Europe de l\'Est': x => ['Eastern Europe', 'Southeast Europe'].includes(x.s), 'Zone euro': x => ['FRA', 'DEU', 'ITA', 'ESP', 'NLD', 'BEL', 'AUT', 'PRT', 'FIN', 'IRL', 'GRC', 'SVK', 'SVN', 'LTU', 'LVA', 'EST', 'LUX', 'HRV'].includes(x.id),
  'Amérique du Nord': x => ['USA', 'CAN', 'MEX'].includes(x.id), 'Amériques': x => x.r === 'Americas', 'Amérique latine': x => x.r === 'Americas' && !['USA', 'CAN'].includes(x.id),
  'Amérique du Sud': x => x.s === 'South America', 'Asie': x => x.r === 'Asia', 'Asie-Pacifique': x => (x.r === 'Asia' && !['Western Asia', 'Central Asia'].includes(x.s)) || x.r === 'Oceania',
  'Moyen-Orient': x => x.s === 'Western Asia' || x.id === 'EGY', 'Afrique': x => x.r === 'Africa', 'Afrique et Moyen-Orient': x => x.r === 'Africa' || x.s === 'Western Asia',
  'EMEA': x => x.r === 'Europe' || x.r === 'Africa' || x.s === 'Western Asia', 'Océanie': x => x.r === 'Oceania', 'Reste du monde': () => true, 'Autres': () => true
};
let MONDE = null, mondeLoading = null;
function loadMonde(){ if (MONDE) return Promise.resolve(MONDE); if (!mondeLoading) mondeLoading = fetch('data/geo/monde.json').then(r => r.json()).then(j => (MONDE = j)).catch(() => null); return mondeLoading; }
function geoAssign(rows){
  // chaque pays prend la ligne la plus précise qui le contient : un pays nommé, sinon la plus petite région, sinon « Reste du monde »
  const out = {}; if (!MONDE) return out;
  const cand = rows.map((r, i) => { const z = String(r.zone || '').trim(), zn = norm(z); const country = MONDE.c.find(x => norm(x.n) === zn || x.id === z.toUpperCase());
    const f = country ? (x => x.id === country.id) : (Object.keys(ZONES).find(k => norm(k) === zn) ? ZONES[Object.keys(ZONES).find(k => norm(k) === zn)] : null);
    const rest = /reste|autres|other/.test(zn);
    return { i, f, size: country ? 1 : f && !rest ? MONDE.c.filter(f).length : 9999 }; }).filter(x => x.f);
  cand.sort((a, b) => a.size - b.size);
  MONDE.c.forEach(x => { const m = cand.find(k => k.f(x)); if (m) out[x.id] = m.i; });
  return out;
}
function geoHtml(c, big){
  const rows = (c.rows || []).filter(r => num(r.v) > 0), tot = rows.reduce((t, r) => t + num(r.v), 0);
  if (!tot) return '<div class="aw-geo" data-geo="' + c.id + '"></div><p class="at-faint">Saisis le chiffre d\'affaires par pays ou par région (⋯ › Modifier).</p>';
  const legend = '<div class="aw-geo-leg">' + rows.map((r, i) => '<div><span class="aw-dot" style="background:' + SERIES_COLORS[i % SERIES_COLORS.length] + '"></span><span class="lb">' + esc(r.zone) + '</span><b>' + fr(num(r.v) / tot * 100, 0) + ' %</b>' + (big ? '<small>' + fr(num(r.v), 1) + ' ' + esc(c.unit || '') + '</small>' : '') + '</div>').join('') + '</div>';
  return '<div class="aw-geo-wrap' + (big ? ' big' : '') + '"><div class="aw-geo" data-geo="' + c.id + '"></div>' + legend + '</div>';
}
function drawGeos(root){
  const els = root.querySelectorAll('[data-geo]'); if (!els.length) return;
  loadMonde().then(m => { if (!m) return;
    els.forEach(el => { const c = ver().cards[el.dataset.geo]; if (!c) return;
      const rows = (c.rows || []).map((r, i) => Object.assign({ i }, r)), assign = geoAssign((c.rows || []).filter(r => num(r.v) > 0).length ? c.rows : []);
      const tot = (c.rows || []).reduce((t, r) => t + (num(r.v) > 0 ? num(r.v) : 0), 0);
      const vis = (c.rows || []).filter(r => num(r.v) > 0);
      el.innerHTML = '<svg viewBox="0 30 ' + m.w + ' ' + (m.h - 60) + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Carte du chiffre d\'affaires">' + m.c.filter(x => x.id !== 'ATA').map(x => {
        const k = assign[x.id], r = k != null ? (c.rows || [])[k] : null, vi = r ? vis.indexOf(r) : -1;
        const col = vi >= 0 ? SERIES_COLORS[vi % SERIES_COLORS.length] : '#262E36', op = vi >= 0 && tot ? (0.45 + 0.55 * Math.min(1, num(r.v) / tot * 2.5)).toFixed(2) : 1;
        return '<path d="' + x.d + '" fill="' + col + '" fill-opacity="' + op + '" stroke="#0F1317" stroke-width="0.5"><title>' + esc(x.n + (r ? ' — ' + r.zone + ' : ' + fr(num(r.v) / tot * 100, 0) + ' %' : '')) + '</title></path>';
      }).join('') + '</svg>';
    });
  });
}
// ---------- Dirigeant ----------
function profilHtml(c, big){
  const im = (c.imgs || [])[0];
  return '<div class="aw-prof' + (big ? ' big' : '') + '"><div class="aw-prof-ph">' + (im ? '<img src="' + esc(mediaUrl(im.f)) + '" alt="">' : '<span>' + esc((c.nom || '?').split(' ').map(x => x[0] || '').join('').slice(0, 2).toUpperCase()) + '</span>') + '</div>' +
    '<div class="aw-prof-n">' + esc(c.nom || 'Nom du dirigeant') + '</div><div class="aw-prof-p">' + esc([c.poste, c.depuis ? 'depuis ' + c.depuis : ''].filter(Boolean).join(' · ')) + '</div></div>' +
    ((c.detention || c.remu) ? '<div class="aw-cmetrics">' + (c.detention ? '<div><b>' + esc(c.detention) + '</b><span>Actions détenues</span></div>' : '') + (c.remu ? '<div><b>' + esc(c.remu) + '</b><span>Rémunération</span></div>' : '') + '</div>' : '') +
    (c.parcours ? '<div class="aw-text' + (big ? ' xl' : ' sm2') + '">' + esc(c.parcours).replace(/\n/g, '<br>') + '</div>' : '');
}
// ---------- Thèse ----------
function theseHtml(c, big){
  const a = c.answers || [];
  const done = THESE_Q.filter((_, i) => (a[i] || '').trim()).length;
  return '<div class="aw-these-h"><span class="aw-these-tag ' + (c.phase === 'finale' ? 'fin' : '') + '">' + (c.phase === 'finale' ? 'Thèse finale' : 'Thèse de départ') + '</span>' + (c.date ? '<span class="at-faint">' + frDate(c.date) + '</span>' : '') + '<span class="at-faint">' + done + ' / 7</span></div>' +
    '<ol class="aw-these' + (big ? ' big' : '') + '">' + THESE_Q.map((q, i) => '<li><b>' + esc(big ? q : THESE_SHORT[i]) + '</b><span>' + (esc(a[i] || '') || '<i class="at-faint">—</i>') + '</span></li>').join('') + '</ol>';
}
function theseCmpHtml(c, big){
  const v = ver(), cards = Object.values(v.cards), dep = cards.find(x => x.type === 'these' && x.phase !== 'finale'), fin = cards.find(x => x.type === 'these' && x.phase === 'finale');
  if (!dep && !fin) return '<p class="at-faint">Ajoute une carte « Thèse » de départ et une finale : elles s\'afficheront ici côte à côte.</p>';
  const A = (x, i) => esc(x && x.answers ? x.answers[i] || '' : '') || '<i class="at-faint">—</i>';
  return '<div class="aw-tscroll"><table class="aw-table aw-tcmp' + (big ? ' big' : '') + '"><thead><tr><th></th><th>Départ' + (dep && dep.date ? ' · ' + frDate(dep.date) : '') + '</th><th>Finale' + (fin && fin.date ? ' · ' + frDate(fin.date) : '') + '</th><th>Verdict</th></tr></thead><tbody>' +
    THESE_Q.map((q, i) => { const vd = VERDICTS[(c.verdicts || {})[i]]; return '<tr><td class="lb">' + esc(big ? q : THESE_SHORT[i]) + '</td><td class="tx">' + A(dep, i) + '</td><td class="tx">' + A(fin, i) + '</td><td>' + (vd ? '<span class="aw-verdict" style="--vc:' + vd[1] + '">' + vd[0] + '</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
}
function chartConfig(c, d, big){
  const tick = { color: '#8B93A0', font: { family: "'Plus Jakarta Sans', sans-serif", size: big ? 13 : 11 } };
  if (c.type === 'overlay'){
    const o = overlayData(c), perShare = o.sets.some(x => ['cur'].includes(x.u)), datasets = [];
    if (o.priceSet) datasets.push({ label: 'Cours', data: o.priceSet, borderColor: '#D9A441', backgroundColor: 'rgba(217,164,65,0.08)', fill: !c.norm, borderWidth: 2, pointRadius: 0, tension: 0.15, yAxisID: 'y', _u: c.norm ? 'base100' : 'cur', _dev: o.ccy });
    o.sets.forEach(x => datasets.push({ label: x.name, data: x.values, borderColor: x.color, backgroundColor: x.color, borderWidth: 2.6, pointRadius: o.priceSet ? 4 : 3, pointHoverRadius: 6, spanGaps: true, tension: 0.25, yAxisID: c.norm || !o.priceSet ? 'y' : 'y1', _u: x.u, _dev: o.ccy }));
    const sc = { x: { grid: { display: false }, ticks: Object.assign({ maxTicksLimit: big ? 12 : 6, callback: function(v){ return String(this.getLabelForValue(v)).slice(0, 4); } }, tick) }, y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: tick } };
    if (!c.norm && o.priceSet && o.sets.length) sc.y1 = { position: 'right', grid: { display: false }, ticks: tick };
    return { type: 'line', data: { labels: o.labels, datasets }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 600 }, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { filter: x => x.raw != null, callbacks: { title: x => frDate(x[0].label), label: x => ' ' + x.dataset.label + ' : ' + (x.dataset._u === 'base100' ? fr(x.raw, 0) : fmtVal(x.dataset._u === 'Mcur' ? x.raw : x.raw, x.dataset._u, x.dataset._dev)) } } }, scales: sc } };
  }
  if (c.type === 'bourse'){
    const p = pricesFor(c) || { dates: [], closes: [], ccy: '' }, up = p.closes.length > 1 && p.closes[p.closes.length - 1] >= p.closes[0];
    return { type: 'line', data: { labels: p.dates, datasets: [{ data: p.closes, borderColor: '#D9A441', backgroundColor: 'rgba(217,164,65,0.10)', fill: true, borderWidth: 2.2, pointRadius: 0, tension: 0.15 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 600 }, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: x => frDate(x[0].label), label: x => ' ' + fr(x.raw, 2) + ' ' + curSym(p.ccy) } } },
        scales: { x: { grid: { display: false }, ticks: Object.assign({ maxTicksLimit: big ? 10 : 5, callback: function(v){ return String(this.getLabelForValue(v)).slice(0, 4); } }, tick) }, y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: tick } } } };
  }
  if (c.type === 'donut'){
    const rows = (c.rows || []).filter(r => num(r.v) > 0);
    return { type: 'doughnut', data: { labels: rows.map(r => r.label), datasets: [{ data: rows.map(r => num(r.v)), backgroundColor: rows.map((r, i) => r.color || SERIES_COLORS[i % SERIES_COLORS.length]), borderColor: '#161B21', borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '64%', animation: { duration: 600 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: x => ' ' + x.label + ' : ' + fr(x.raw, 1) + ' ' + (c.unit || '') } } } } };
  }
  const s = seriesData(c, d), first = s.sets[0];
  const datasets = s.sets.map((x, i) => {
    const isLine = c.type === 'courbes' || (i > 0 && first && x.u !== first.u);
    const scale = x.u ? (x.u === '%' ? 'pct' : x.u === 'x' ? 'mul' : 'val') : 'val';
    return { type: isLine ? 'line' : 'bar', label: x.name, data: x.values.map(v => v == null ? null : (x.u === 'Mcur' ? v / 1000 : v)), backgroundColor: isLine ? x.color : x.color, borderColor: x.color, borderWidth: isLine ? 3 : 0, borderRadius: 5, tension: 0.3, pointRadius: isLine ? (big ? 4 : 2.5) : 0, spanGaps: true, yAxisID: c.type === 'barres' && i > 0 && first && x.u !== first.u ? 'y1' : 'y', _u: x.u, _dev: x.devise, order: isLine ? 0 : 1 };
  });
  const fmtTick = u => v => u === '%' ? fr(v, 0) + ' %' : u === 'x' ? fr(v, 0) + 'x' : u === 'Mcur' ? fr(v, 1) + ' Md' : fr(v, Math.abs(v) < 10 ? 1 : 0);
  const u2 = s.sets.find((x, i) => i > 0 && first && x.u !== first.u);
  const scales = { x: { grid: { display: false }, ticks: tick }, y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: Object.assign({ callback: fmtTick(first ? first.u : '') }, tick), beginAtZero: c.type === 'barres' } };
  if (c.type === 'barres' && u2) scales.y1 = { position: 'right', grid: { display: false }, ticks: Object.assign({ callback: fmtTick(u2.u) }, tick) };
  return { type: 'bar', data: { labels: s.labels, datasets }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 600 }, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: datasets.length > 1, labels: { color: '#B4BAC4', boxWidth: 10, boxHeight: 10, font: tick.font } }, tooltip: { callbacks: { label: x => ' ' + x.dataset.label + ' : ' + fmtVal(x.dataset._u === 'Mcur' ? x.raw * 1000 : x.raw, x.dataset._u, x.dataset._dev) } } }, scales } };
}
function drawCharts(root, list, big){
  if (!window.Chart) return;
  const d = doc(), v = ver();
  root.querySelectorAll('canvas[data-chart]').forEach(cv => {
    const id = cv.dataset.chart;
    if (id.startsWith('conc-')){
      const c = v.cards[id.slice(5)]; if (!c) return;
      list.push(new Chart(cv, chartConfig({ type: 'barres', mode: 'tv', keys: ['ca', 'eps'] }, { __other: c.nom }, big))); return;
    }
    if (id.startsWith('kpi-')){
      const c = v.cards[id.slice(4)], r = c && kpiData(c); if (!r || !r.series) return;
      list.push(new Chart(cv, { type: 'line', data: { labels: r.series.labels, datasets: [{ data: r.series.values.map(x => r.u === 'Mcur' ? x / 1000 : x), borderColor: '#D9A441', backgroundColor: 'rgba(217,164,65,0.12)', fill: true, borderWidth: 2.6, tension: 0.25, pointRadius: 3.5, pointBackgroundColor: '#D9A441' }] },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 700 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: x => ' ' + fmtVal(r.u === 'Mcur' ? x.raw * 1000 : x.raw, r.u, r.devise, r.d) } } },
          scales: { x: { grid: { display: false }, ticks: { color: '#8B93A0' } }, y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#8B93A0' }, beginAtZero: true } } } }));
      return;
    }
    const c = v.cards[id]; if (!c) return;
    try { list.push(new Chart(cv, chartConfig(c, d, big))); } catch(e){ /* graphique impossible : la carte reste lisible */ }
  });
}

/* ---------- corps : grille ou organigramme ---------- */
function renderBody(){
  const host = $('awBody'); if (!host) return;
  destroyCharts(charts);
  ui.menu = null; closeMenu();
  if (ui.view === 'org'){ host.innerHTML = '<div class="aw-org" id="awOrg"><div class="aw-org-w" id="awOrgW"><svg class="aw-org-svg" id="awOrgSvg"></svg></div></div>'; orgEls = {}; renderOrg(true); return; }
  const v = ver(), ro = isRo();
  host.innerHTML = v.sections.map((s, si) => {
    const cards = s.cards.map(id => v.cards[id]).filter(Boolean);
    return '<section class="aw-sec' + (s.collapsed ? ' closed' : '') + '" data-sid="' + s.id + '" style="--sc:' + (s.color || PALETTE[si % PALETTE.length]) + '"><div class="aw-sec-h">' +
      '<button type="button" class="aw-kb" data-s-tog title="' + (s.collapsed ? 'Déplier' : 'Replier') + '">' + (s.collapsed ? ICO.chevR : ICO.chevD) + '</button><span class="aw-sec-dot"></span>' +
      '<h2' + (ro ? '' : ' class="aw-editable" data-s-title title="Clic pour renommer"') + '>' + esc(s.titre) + '</h2><span class="aw-sec-n">' + cards.length + ' carte' + (cards.length > 1 ? 's' : '') + '</span>' +
      (s.collapsed && cards.length ? '<span class="aw-sec-peek">' + cards.slice(0, 4).map(c => '<span>' + esc(cardTitle(c) || TYPES[c.type].l) + (keyFigure(c) && ['kpi', 'donut', 'barres', 'courbes'].includes(c.type) ? ' <b>' + esc(keyFigure(c)) + '</b>' : '') + '</span>').join('') + '</span>' : '') +
      '<span style="flex:1"></span>' +
      (ro ? '' : '<button type="button" class="aw-kb" data-s-up title="Monter"' + (si ? '' : ' disabled') + '>↑</button><button type="button" class="aw-kb" data-s-down title="Descendre"' + (si < v.sections.length - 1 ? '' : ' disabled') + '>↓</button><button type="button" class="aw-kb" data-s-del title="Mettre la section à la corbeille">🗑</button><button type="button" class="at-btn sm gold" data-s-add>' + ICO.plus + ' Carte</button>') + '</div>' +
      (s.collapsed ? '' : ((s.hint || []).length && !ro ? '<div class="aw-hint">À couvrir : ' + s.hint.map(h => '<span>' + esc(h) + '</span>').join('') + '</div>' : '') +
        '<div class="aw-grid" data-drop="' + s.id + '">' + cards.map(cardHtml).join('') + (ro || cards.length ? '' : '<button type="button" class="aw-empty" data-s-add>' + ICO.plus + ' Ajouter une première carte</button>') + '</div>') + '</section>';
  }).join('') + (v.sections.length ? '' : '<p class="at-empty big">' + (ro ? 'Dossier vide.' : 'Aucune section. « ＋ Section » pour commencer.') + '</p>');
  drawCharts(host, charts, false);
  drawGeos(host);
  wireBody(host);
}
function wireBody(host){
  const v = ver();
  host.onclick = e => {
    const b = e.target.closest('button,[data-s-title]'); if (!b) return;
    const sEl = b.closest('[data-sid]'), sid = sEl && sEl.dataset.sid, sec = sid && v.sections.find(s => s.id === sid);
    const cEl = b.closest('[data-cid]'), cid = cEl && cEl.dataset.cid, c = cid && v.cards[cid];
    const ds = b.dataset;
    if (ds.open){ openDoc(ds.open); return; }
    if (ds.cBig !== undefined){ openBig(ds.cBig || cid, cEl); return; }
    if (ds.cMenu !== undefined){ openMenu(cid, b); return; }
    if (ds.cUnfold !== undefined && c){ c.collapsed = false; touch(); renderBody(); return; }
    if (ds.range && c){ c.range = ds.range; if (!isRo()) touch(); refreshCard(c); return; }
    if (ds.sTog !== undefined && sec){ sec.collapsed = !sec.collapsed; if (!RO) touch(); renderBody(); return; }
    if (ds.sTitle !== undefined && sec && !isRo()){ inlineRename(b, sec.titre, t => { sec.titre = t; touch(); renderBody(); }); return; }
    if (isRo()) return;
    if (ds.sAdd !== undefined && sec){ ui.lib = { secId: sec.id, q: '' }; renderLibrary(); return; }
    if (ds.sDel !== undefined && sec){ deleteSection(sec.id); return; }
    if ((ds.sUp !== undefined || ds.sDown !== undefined) && sec){ const i = v.sections.indexOf(sec), j = i + (ds.sUp !== undefined ? -1 : 1); if (j < 0 || j >= v.sections.length) return; v.sections.splice(i, 1); v.sections.splice(j, 0, sec); touch(); renderBody(); }
  };
  host.ondblclick = e => { const cEl = e.target.closest('[data-cid]'); if (cEl && !e.target.closest('button,a')) openBig(cEl.dataset.cid, cEl); };
  if (isRo()) return;
  // glisser-déposer : sur une autre carte = s'insère avant elle ; dans le vide d'une section = à la fin
  host.ondragstart = e => { const cEl = e.target.closest('[data-cid]'); if (!cEl || e.target.closest('[data-c-resize]')) return; ui.drag = cEl.dataset.cid; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', ui.drag); } catch(err){} setTimeout(() => cEl.classList.add('dragging'), 0); };
  host.ondragend = () => { ui.drag = null; host.querySelectorAll('.dragging,.drop-before,.drop-end').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-end')); };
  host.ondragover = e => {
    if (!ui.drag) return;
    const cEl = e.target.closest('[data-cid]'), g = e.target.closest('[data-drop],[data-sid]'); if (!cEl && !g) return;
    e.preventDefault(); host.querySelectorAll('.drop-before,.drop-end').forEach(x => x.classList.remove('drop-before', 'drop-end'));
    if (cEl && cEl.dataset.cid !== ui.drag) cEl.classList.add('drop-before'); else if (g){ const grid = g.matches('[data-drop]') ? g : g.querySelector('[data-drop]'); if (grid) grid.classList.add('drop-end'); else g.classList.add('drop-end'); }
  };
  host.ondrop = e => {
    if (!ui.drag) return; e.preventDefault();
    const cEl = e.target.closest('[data-cid]'), sEl = e.target.closest('[data-sid]'), cid = ui.drag; ui.drag = null;
    if (cEl && cEl.dataset.cid !== cid){ const to = secOf(v, cEl.dataset.cid); if (to) moveCard(cid, to.id, cEl.dataset.cid); }
    else if (sEl) moveCard(cid, sEl.dataset.sid, null);
  };
  // poignée de format : vers la droite = horizontal, vers le bas = vertical, sinon carré
  host.onpointerdown = e => {
    const hd = e.target.closest('[data-c-resize]'); if (!hd) return;
    e.preventDefault(); const cEl = hd.closest('[data-cid]'), c = v.cards[cEl.dataset.cid], x0 = e.clientX, y0 = e.clientY, r = cEl.getBoundingClientRect();
    const mv = ev => { const dx = ev.clientX - x0, dy = ev.clientY - y0; cEl.style.outline = '2px dashed #D9A441'; cEl.dataset.next = dx > r.width * 0.45 ? 'h' : dy > r.height * 0.45 ? 'v' : (dx < -r.width * 0.3 || dy < -r.height * 0.3) ? 's' : c.size; };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); cEl.style.outline = ''; const n = cEl.dataset.next; if (n && n !== c.size){ c.size = n; touch(); renderBody(); } };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
}
function inlineRename(el, cur, done){
  const inp = document.createElement('input'); inp.className = 'at-in aw-rename'; inp.value = cur; el.replaceWith(inp); inp.focus(); inp.select();
  let fin = false; const end = ok => { if (fin) return; fin = true; const t = inp.value.trim(); if (ok && t && t !== cur) done(t); else renderBody(); };
  inp.onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); end(true); } else if (e.key === 'Escape') end(false); e.stopPropagation(); };
  inp.onblur = () => end(true);
}

/* ---------- menu d'une carte ---------- */
function closeMenu(){ const m = $('awMenu'); if (m) m.remove(); }
function openMenu(cid, anchor){
  closeMenu();
  const v = ver(), c = v.cards[cid]; if (!c) return;
  const r = anchor.getBoundingClientRect();
  const m = document.createElement('div'); m.id = 'awMenu'; m.className = 'aw-menu';
  m.innerHTML = '<button type="button" data-m="edit">Modifier</button><button type="button" data-m="big">Agrandir</button><button type="button" data-m="dup">Dupliquer</button>' +
    '<div class="aw-menu-row"><span>Format</span>' + [['s', 'Carré'], ['v', 'Vertical'], ['h', 'Horizontal']].map(([k, l]) => '<button type="button" class="' + (c.size === k ? 'on' : '') + '" data-size="' + k + '">' + l + '</button>').join('') + '</div>' +
    '<label class="aw-menu-sel">Déplacer vers<select data-m="move">' + v.sections.map(s => '<option value="' + s.id + '"' + (secOf(v, cid) === s ? ' selected' : '') + '>' + esc(s.titre) + '</option>').join('') + '</select></label>' +
    '<button type="button" data-m="fold">' + (c.collapsed ? 'Déplier' : 'Replier') + '</button><div class="aw-menu-sep"></div><button type="button" class="danger" data-m="del">Mettre à la corbeille</button>';
  document.body.appendChild(m);
  const w = 236; m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
  const h = m.offsetHeight; m.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  m.onclick = e => { const b = e.target.closest('button'); if (!b) return; const k = b.dataset.m;
    if (b.dataset.size){ c.size = b.dataset.size; c.collapsed = false; touch(); closeMenu(); renderBody(); return; }
    closeMenu();
    if (k === 'edit'){ ui.edit = cid; renderEditor(); }
    else if (k === 'big') openBig(cid, document.querySelector('[data-cid="' + cid + '"]'));
    else if (k === 'dup') duplicateCard(cid);
    else if (k === 'fold'){ c.collapsed = !c.collapsed; touch(); renderBody(); }
    else if (k === 'del') deleteCard(cid);
  };
  m.querySelector('select').onchange = e => { closeMenu(); moveCard(cid, e.target.value, null); };
  setTimeout(() => document.addEventListener('pointerdown', function off(ev){ if (!m.contains(ev.target)){ closeMenu(); document.removeEventListener('pointerdown', off); } }), 0);
}

/* ====================== VUE ORGANIGRAMME ====================== */
let orgEls = {};
// Pieuvre : le logo au centre, la première moitié des sections à droite, la seconde à gauche ; les cartes d'une section
// ouverte sortent en colonne, à l'extérieur. Les colonnes de cartes ne comptent dans la largeur que si une section de
// ce côté est ouverte (sinon la pieuvre serait inutilement réduite).
function orgLayout(v, d){
  const W0 = 230, SW = 260, SH = 76, CW = 330, CH = 70, GAP = 10, SG = 16, G1 = 80, G2 = 70;
  const n = v.sections.length, half = Math.ceil(n / 2);
  const sides = [{ dir: 1, secs: v.sections.slice(0, half) }, { dir: -1, secs: v.sections.slice(half) }];
  const P = {}; let H = 200, minX = 0, maxX = W0;
  sides.forEach(side => {
    const blocks = side.secs.map(s => { const cards = ui.orgOpen[s.id] ? s.cards.map(id => v.cards[id]).filter(Boolean) : []; const ch = cards.length ? cards.length * (CH + GAP) - GAP : 0; return { s, cards, h: Math.max(SH, ch) }; });
    const Hs = blocks.reduce((t, b) => t + b.h + SG, -SG); H = Math.max(H, Hs);
    const sx = side.dir > 0 ? W0 + G1 : -G1 - SW, cx = side.dir > 0 ? sx + SW + G2 : sx - G2 - CW;
    if (blocks.length){ minX = Math.min(minX, sx); maxX = Math.max(maxX, sx + SW); }
    if (blocks.some(b => b.cards.length)){ minX = Math.min(minX, cx); maxX = Math.max(maxX, cx + CW); }
    let y = -Hs / 2;
    blocks.forEach(b => {
      P['s:' + b.s.id] = { x: sx, y: y + (b.h - SH) / 2, w: SW, h: SH, dir: side.dir };
      let cy = y + (b.h - (b.cards.length ? b.cards.length * (CH + GAP) - GAP : 0)) / 2;
      b.cards.forEach(c => { P['c:' + c.id] = { x: cx, y: cy, w: CW, h: CH, from: 's:' + b.s.id, dir: side.dir }; cy += CH + GAP; });
      y += b.h + SG;
    });
  });
  P.root = { x: 0, y: -100, w: W0, h: 200 };
  Object.values(P).forEach(p => { p.x -= minX; });
  return { P, W: maxX - minX + 10, top: -H / 2, H };
}
function orgNodeHtml(key, v, d){
  if (key === 'root') return '<div class="aw-org-root">' + docLogo(d, 92) + '<b>' + esc(d.titre) + '</b></div>';
  if (key.startsWith('s:')){
    const s = v.sections.find(x => x.id === key.slice(2)), cards = s.cards.map(id => v.cards[id]).filter(Boolean);
    const ratios = cards.filter(c => c.type === 'kpi').slice(0, 2).map(c => { const r = kpiData(c); return '<span>' + esc(shortLabel(r.label)) + ' <b>' + fmtVal(r.v, r.u, r.devise, r.d) + '</b></span>'; }).join('');
    return '<button type="button" class="aw-org-sec' + (ui.orgOpen[s.id] ? ' open' : '') + '" data-org-sec="' + s.id + '" style="--sc:' + s.color + '"><span class="t">' + esc(s.titre) + '</span><span class="n">' + cards.length + '</span>' + (ratios ? '<span class="r">' + ratios + '</span>' : '') + '</button>';
  }
  const c = v.cards[key.slice(2)], t = TYPES[c.type], kf = keyFigure(c);
  return '<div class="aw-org-card" data-cid="' + c.id + '"><span class="aw-dot" style="background:' + t.c + '"></span><div class="tx"><small>' + esc(t.l) + '</small><b>' + esc(cardTitle(c) || t.l) + '</b></div>' +
    (kf && ['kpi', 'donut', 'barres', 'courbes'].includes(c.type) ? '<span class="kf">' + esc(kf) + '</span>' : '') + '<button type="button" class="aw-kb" data-c-big title="Agrandir">' + ICO.expand + '</button></div>';
}
const shortLabel = l => ({ 'Chiffre d\'affaires': 'CA', 'Marge opérationnelle': 'Marge op.', 'Rendement du dividende': 'Rendement', 'Actions en circulation': 'Actions', 'FCF par action': 'FCF/action', 'Dette nette / OCF': 'Dette/OCF' }[l] || l);
function renderOrg(instant){
  const box = $('awOrg'), w = $('awOrgW'), svg = $('awOrgSvg'); if (!box || !w) return;
  const d = doc(), v = ver(), L = orgLayout(v, d), P = L.P;
  const scale = Math.min(1.15, (box.clientWidth - 30) / L.W, Math.max(420, window.innerHeight * (ui.video ? 0.86 : 0.74)) / (L.H + 60));
  w.style.marginLeft = Math.max(0, (box.clientWidth - 30 - L.W * scale) / 2) + 'px';
  w.style.transform = 'scale(' + scale + ')'; w.style.width = L.W + 'px'; w.style.height = (L.H + 60) + 'px';
  box.style.height = ((L.H + 60) * scale + 20) + 'px';
  const oy = -L.top + 30, keys = Object.keys(P);
  keys.forEach(k => {
    let el = orgEls[k];
    const p = P[k];
    if (!el){
      el = orgEls[k] = document.createElement('div'); el.className = 'aw-org-el'; el.dataset.k = k; w.appendChild(el);
      const from = p.from && P[p.from] ? P[p.from] : null;
      el.style.transform = 'translate(' + (from && !instant ? from.x : p.x) + 'px,' + ((from && !instant ? from.y : p.y) + oy) + 'px)';
      el.style.opacity = instant || !from ? 1 : 0;
      el.getBoundingClientRect();   // force le point de départ de l'animation
    }
    el.innerHTML = orgNodeHtml(k, v, d);
    el.style.width = p.w + 'px'; el.style.height = p.h + 'px';
    el.style.transform = 'translate(' + p.x + 'px,' + (p.y + oy) + 'px)'; el.style.opacity = 1; el._gone = false;
  });
  Object.keys(orgEls).forEach(k => {
    if (P[k] || orgEls[k]._gone) return;
    const el = orgEls[k]; el._gone = true;
    const sk = el._from || ('s:' + (v.sections.find(s => s.cards.includes(k.slice(2))) || {}).id), sp = P[sk];
    if (sp){ el.style.transform = 'translate(' + sp.x + 'px,' + (sp.y + oy) + 'px)'; }
    el.style.opacity = 0; setTimeout(() => { if (el._gone){ el.remove(); delete orgEls[k]; } }, 380);
  });
  keys.forEach(k => { if (P[k].from) orgEls[k]._from = P[k].from; });
  // liens courbes
  let paths = '';
  const r = P.root, ry = r.y + r.h / 2 + oy;
  v.sections.forEach(s => {
    const p = P['s:' + s.id], y2 = p.y + p.h / 2 + oy, right = p.dir > 0;
    const rx = right ? r.x + r.w : r.x, sx = right ? p.x : p.x + p.w, mx = (rx + sx) / 2;
    paths += '<path d="M' + rx + ' ' + ry + ' C' + mx + ' ' + ry + ' ' + mx + ' ' + y2 + ' ' + sx + ' ' + y2 + '" stroke="' + s.color + '" stroke-width="' + (ui.orgOpen[s.id] ? 3.5 : 2.2) + '" opacity="' + (ui.orgOpen[s.id] ? 1 : 0.6) + '"/>';
    if (ui.orgOpen[s.id]) s.cards.forEach(id => { const c = P['c:' + id]; if (!c) return; const x1 = right ? p.x + p.w : p.x, x2 = right ? c.x : c.x + c.w, cy = c.y + c.h / 2 + oy, m2 = (x1 + x2) / 2; paths += '<path class="aw-org-in" d="M' + x1 + ' ' + y2 + ' C' + m2 + ' ' + y2 + ' ' + m2 + ' ' + cy + ' ' + x2 + ' ' + cy + '" stroke="' + s.color + '" stroke-width="2" opacity="0.75"/>'; });
  });
  svg.setAttribute('width', L.W); svg.setAttribute('height', L.H + 60);
  svg.innerHTML = '<g fill="none" stroke-linecap="round">' + paths + '</g>';
  if (!box._wired){
    box._wired = true;
    box.onclick = e => {
      const sb = e.target.closest('[data-org-sec]');
      if (sb){ const id = sb.dataset.orgSec; ui.orgOpen[id] = !ui.orgOpen[id]; renderOrg(false); return; }
      const bb = e.target.closest('[data-c-big]'), cEl = e.target.closest('[data-cid]');
      if (bb || cEl) openBig(cEl.dataset.cid, cEl);
    };
  }
}
window.addEventListener('resize', () => { if (ui.view === 'org' && $('awOrg')) renderOrg(true); });

/* ====================== CARTE AGRANDIE (arrière-plan flouté) ====================== */
function bigBody(c){
  const d = doc(), v = ver();
  const statBox = (l, val) => '<div class="aw-stat"><span>' + esc(l) + '</span><b>' + val + '</b></div>';
  switch (c.type){
    case 'kpi': {
      const r = kpiData(c), s = r.series;
      let stats = '', table = '';
      if (s && s.values.length > 1){
        const vals = s.values, n = vals.length, cagr = (k) => n > k && vals[n - 1 - k] > 0 && vals[n - 1] > 0 && r.u !== '%' && r.u !== 'x' ? (Math.pow(vals[n - 1] / vals[n - 1 - k], 1 / k) - 1) * 100 : null;
        const sorted = vals.slice().sort((a, b) => a - b), med = sorted[Math.floor(n / 2)];
        stats = '<div class="aw-stats">' + statBox('Croissance annuelle 5 ans', cagr(5) == null ? '—' : fr(cagr(5), 1) + ' %/an') + statBox('Croissance annuelle 10 ans', cagr(10) == null ? '—' : fr(cagr(10), 1) + ' %/an') +
          statBox('Plus bas (' + s.labels[vals.indexOf(sorted[0])] + ')', fmtVal(sorted[0], r.u, r.devise, r.d)) + statBox('Plus haut (' + s.labels[vals.indexOf(sorted[n - 1])] + ')', fmtVal(sorted[n - 1], r.u, r.devise, r.d)) + statBox('Médiane', fmtVal(med, r.u, r.devise, r.d)) + '</div>';
        table = '<div class="aw-tscroll"><table class="aw-table big"><thead><tr><th></th>' + s.labels.slice(-12).map(y => '<th>' + y + '</th>').join('') + '</tr></thead><tbody><tr><td class="lb">' + esc(r.label) + '</td>' + s.values.slice(-12).map(x => '<td>' + fmtVal(x, r.u, r.devise, r.d) + '</td>').join('') + '</tr></tbody></table></div>';
      }
      return '<div class="aw-big-kpi"><div><div class="aw-kpi-l">' + esc(r.label) + (r.period ? ' <span>' + esc(r.period) + '</span>' : '') + '</div><div class="aw-kpi-v xl">' + fmtVal(r.v, r.u, r.devise, r.d) + '</div><div class="aw-kpi-d">' + deltaHtml(r) + (r.prev != null ? '<span class="at-faint">exercice précédent : ' + fmtVal(r.prev, r.u, r.devise, r.d) + '</span>' : '') + '</div>' + (c.note ? '<p class="aw-note">' + esc(c.note) + '</p>' : '') + '</div>' +
        (s && s.values.length > 1 ? '<div class="aw-chart big"><canvas data-chart="kpi-' + c.id + '"></canvas></div>' : '') + '</div>' + stats + table + '<div class="aw-foot">' + (c.bind ? '<span class="aw-link">lié · ' + esc(r.label) + '</span>' : '') + '<span>Source : ' + esc(r.src || '—') + '</span></div>';
    }
    case 'donut': {
      const rows = (c.rows || []).filter(r => num(r.v) > 0), tot = rows.reduce((s, r) => s + num(r.v), 0);
      if (!tot) return '<p class="at-faint">Aucune donnée.</p>';
      const sorted = rows.map((r, i) => Object.assign({ i }, r)).sort((a, b) => num(b.v) - num(a.v)), top = sorted[0];
      return '<div class="aw-big-split"><div class="aw-donut-c xl"><canvas data-chart="' + c.id + '"></canvas><div class="aw-donut-t"><b>' + fr(tot, tot >= 100 ? 0 : 1) + '</b><span>' + esc(c.unit || 'total') + '</span></div></div><div>' +
        '<p class="aw-lead">« ' + esc(top.label) + ' » pèse <b>' + fr(num(top.v) / tot * 100, 0) + ' %</b> du total' + (sorted[1] ? ', devant « ' + esc(sorted[1].label) + ' » (' + fr(num(sorted[1].v) / tot * 100, 0) + ' %)' : '') + '.</p>' +
        '<table class="aw-table big"><thead><tr><th></th><th>Montant</th><th>Part</th></tr></thead><tbody>' + rows.map((r, i) => '<tr><td class="lb"><span class="aw-dot" style="background:' + (r.color || SERIES_COLORS[i % SERIES_COLORS.length]) + '"></span> ' + esc(r.label) + '</td><td>' + fr(num(r.v), 1) + ' ' + esc(c.unit || '') + '</td><td><b>' + fr(num(r.v) / tot * 100, 1) + ' %</b></td></tr>').join('') +
        '<tr class="tot"><td class="lb">Total</td><td>' + fr(tot, 1) + ' ' + esc(c.unit || '') + '</td><td>100 %</td></tr></tbody></table></div></div>' + (sourceOf(v, c) ? '<div class="aw-foot"><span>Source : ' + esc(sourceOf(v, c).titre) + '</span></div>' : '');
    }
    case 'barres': case 'courbes': {
      const s = seriesData(c, d);
      if (!s.labels.length) return '<p class="at-faint">Aucune donnée.</p>';
      const cagrs = s.sets.map(x => { const vals = x.values.filter(y => y != null); const n = vals.length; if (n < 2 || x.u === '%' || x.u === 'x' || vals[0] <= 0 || vals[n - 1] <= 0) return null; return { name: x.name, g: (Math.pow(vals[n - 1] / vals[0], 1 / (n - 1)) - 1) * 100, n: n - 1 }; }).filter(Boolean);
      return '<div class="aw-chart xl"><canvas data-chart="' + c.id + '"></canvas></div>' +
        (cagrs.length ? '<div class="aw-stats">' + cagrs.map(g => statBox(g.name + ' : croissance annuelle sur ' + g.n + ' ans', fr(g.g, 1) + ' %/an')).join('') + '</div>' : '') +
        '<div class="aw-tscroll"><table class="aw-table big"><thead><tr><th></th>' + s.labels.map(y => '<th>' + esc(y) + '</th>').join('') + '</tr></thead><tbody>' + s.sets.map(x => '<tr><td class="lb"><span class="aw-dot" style="background:' + x.color + '"></span> ' + esc(x.name) + '</td>' + x.values.map(y => '<td>' + fmtVal(y, x.u, x.devise) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    }
    case 'comparatif': return compTableHtml(c, true) + '<p class="aw-note">Vert : la meilleure valeur de la ligne · rouge : la moins bonne. Chiffres TradingView' + (ver().tvData ? ' relevés le ' + frDate(ver().tvData.at) : '') + ', sauf valeurs saisies à la main.</p>';
    case 'bourse': return bourseHtml(c, true);
    case 'overlay': return overlayHtml(c, true);
    case 'geo': {
      const rows = (c.rows || []).filter(r => num(r.v) > 0), tot = rows.reduce((t, r) => t + num(r.v), 0);
      const top = rows.slice().sort((a, b) => num(b.v) - num(a.v));
      return geoHtml(c, true) + (top.length ? '<p class="aw-lead">« ' + esc(top[0].zone) + ' » représente <b>' + fr(num(top[0].v) / tot * 100, 0) + ' %</b> du chiffre d\'affaires' + (top[1] ? ', devant « ' + esc(top[1].zone) + ' » (' + fr(num(top[1].v) / tot * 100, 0) + ' %)' : '') + '.</p>' : '');
    }
    case 'profil': return profilHtml(c, true);
    case 'these': return theseHtml(c, true);
    case 'thesecmp': return theseCmpHtml(c, true);
    case 'concurrent': return concHtml(c, true);
    case 'source': return srcHtml(c, true, v);
    case 'image': return '<div class="aw-big-imgs">' + (c.imgs || []).map(im => '<figure><img src="' + esc(mediaUrl(im.f)) + '" alt="">' + (im.leg ? '<figcaption>' + esc(im.leg) + '</figcaption>' : '') + '</figure>').join('') + '</div>' + (plain(c.html) ? '<div class="aw-text xl">' + clean(c.html) + '</div>' : '');
    case 'citation': return '<div class="aw-quote-mark xl">«</div><div class="aw-quote xl">' + clean(c.html) + '</div><div class="aw-quote-l">' + esc(c.titre || '') + (c.date ? ' · ' + frDate(c.date) : '') + '</div>';
    default: return (c.date ? '<span class="aw-date">' + frDate(c.date) + '</span>' : '') + '<div class="aw-text xl">' + clean(c.html) + '</div>' + (c.source ? '<p class="aw-note">Source : ' + esc(c.source) + '</p>' : '') + '<div class="aw-big-imgs">' + (c.imgs || []).map(im => '<figure><img src="' + esc(mediaUrl(im.f)) + '" alt=""></figure>').join('') + '</div>';
  }
}
function bigOrder(cid){ const v = ver(), s = secOf(v, cid); return s ? s.cards.filter(id => v.cards[id]) : [cid]; }
function openBig(cid, fromEl){
  const v = ver(), c = v.cards[cid]; if (!c) return;
  closeMenu();
  ui.big = cid;
  let ov = $('awBig');
  const fresh = !ov;
  if (fresh){ ov = document.createElement('div'); ov.id = 'awBig'; ov.className = 'aw-big'; document.body.appendChild(ov); }
  destroyCharts(bigCharts);
  const t = TYPES[c.type], sec = secOf(v, cid), order = bigOrder(cid), i = order.indexOf(cid);
  ov.innerHTML = '<div class="aw-big-bg" data-big-close></div>' + (order.length > 1 ? '<button type="button" class="aw-big-nav l" data-big-go="-1" aria-label="Carte précédente">' + ICO.left + '</button><button type="button" class="aw-big-nav r" data-big-go="1" aria-label="Carte suivante">' + ICO.right + '</button>' : '') +
    '<div class="aw-big-p t-' + c.type + '"><div class="aw-big-h"><div><div class="aw-tl"><span class="aw-dot" style="background:' + t.c + '"></span>' + esc((sec ? sec.titre + ' · ' : '') + t.l) + '</div><h2>' + esc(cardTitle(c) || t.l) + '</h2></div><span style="flex:1"></span>' +
    (isRo() ? '' : '<button type="button" class="at-btn sm" data-big-edit>Modifier</button>') + '<span class="aw-big-i">' + (i + 1) + ' / ' + order.length + '</span><button type="button" class="aw-kb lg" data-big-close aria-label="Réduire">' + ICO.shrink + '</button></div><div class="aw-big-b">' + bigBody(c) + '</div></div>';
  const p = ov.querySelector('.aw-big-p');
  if (fresh){
    const r = fromEl && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect() : null;
    if (r && r.width){ p.style.transformOrigin = '0 0'; const pr = p.getBoundingClientRect(); p.style.transform = 'translate(' + (r.left - pr.left) + 'px,' + (r.top - pr.top) + 'px) scale(' + (r.width / pr.width) + ',' + (r.height / pr.height) + ')'; p.style.opacity = '0.4'; ov._from = r; }
    p.getBoundingClientRect();
    requestAnimationFrame(() => { ov.classList.add('on'); p.style.transform = ''; p.style.opacity = ''; });
  } else ov.classList.add('on');
  setTimeout(() => { drawCharts(p, bigCharts, true); drawGeos(p); }, fresh ? 380 : 0);
  ov.onclick = e => {
    if (e.target.closest('[data-big-close]')) return closeBig();
    const g = e.target.closest('[data-big-go]'); if (g){ const o = bigOrder(ui.big), j = (o.indexOf(ui.big) + Number(g.dataset.bigGo) + o.length) % o.length; openBig(o[j]); return; }
    if (e.target.closest('[data-big-edit]')){ const id = ui.big; closeBig(); ui.edit = id; renderEditor(); return; }
    const op = e.target.closest('[data-open]'); if (op){ closeBig(); openDoc(op.dataset.open); return; }
    const rg = e.target.closest('[data-range]'); if (rg){ const c = ver().cards[ui.big]; if (c){ c.range = rg.dataset.range; if (!isRo()) touch(); refreshCard(c); openBig(c.id); } }
  };
}
function closeBig(){
  const ov = $('awBig'); if (!ov) return;
  ui.big = null; ov.classList.remove('on');
  const p = ov.querySelector('.aw-big-p'), r = ov._from;
  if (p && r){ const pr = p.getBoundingClientRect(); p.style.transformOrigin = '0 0'; p.style.transform = 'translate(' + (r.left - pr.left) + 'px,' + (r.top - pr.top) + 'px) scale(' + (r.width / pr.width) + ',' + (r.height / pr.height) + ')'; p.style.opacity = '0'; }
  setTimeout(() => { destroyCharts(bigCharts); ov.remove(); }, 320);
}

/* ====================== ÉDITION (panneau à droite) ====================== */
const companyOptions = () => typeof companies === 'undefined' ? '' : Object.keys(companies).slice(0, 4000).map(n => '<option value="' + esc(typeof fmpDisplayName === 'function' ? fmpDisplayName(n) : n) + '">').join('');
function bindOptions(d, cur, allowNone){
  const facts = Object.values(d.facts || {});
  return (allowNone ? '<option value="">Saisie à la main</option>' : '') + '<optgroup label="TradingView (onglet Analyse)">' + Object.keys(TVF).map(k => '<option value="tv:' + k + '"' + (cur === 'tv:' + k ? ' selected' : '') + '>' + esc(TVF[k].l) + '</option>').join('') + '</optgroup>' +
    (facts.length ? '<optgroup label="Données du dossier">' + facts.map(f => '<option value="f:' + f.id + '"' + (cur === 'f:' + f.id ? ' selected' : '') + '>' + esc(f.label || 'Sans nom') + '</option>').join('') + '</optgroup>' : '');
}
const RT = '<div class="at-rt"><button type="button" data-cmd="bold" title="Gras"><b>G</b></button><button type="button" data-cmd="italic" title="Italique"><i>I</i></button><button type="button" data-cmd="underline" title="Souligné"><u>S</u></button><button type="button" data-cmd="hilite" title="Surligner">🖍</button><button type="button" data-cmd="h2" title="Titre">T</button><button type="button" data-cmd="insertUnorderedList" title="Liste">•</button><button type="button" data-cmd="removeFormat" title="Retirer la mise en forme">⌫</button></div>';
function editorFields(c, d, v){
  const val = x => x == null ? '' : esc(String(x).replace('.', ','));
  const srcs = Object.values(v.cards).filter(x => x.type === 'source' && x.id !== c.id);
  const common = '<label>Titre (facultatif)<input class="at-in" data-f="titre" value="' + esc(c.titre || '') + '" placeholder="Aucun titre"></label>';
  const srcSel = srcs.length ? '<label>Source utilisée<select class="at-sel" data-f="srcId"><option value="">—</option>' + srcs.map(s => '<option value="' + s.id + '"' + (c.srcId === s.id ? ' selected' : '') + '>' + esc(s.titre || 'Source') + '</option>').join('') + '</select></label>' : '';
  const dateF = '<label>Date (facultatif)<input type="date" class="at-in" data-f="date" value="' + esc(c.date || '') + '"></label>';
  const rich = ph => RT + '<div class="aw-rich" contenteditable="true" data-rich data-ph="' + esc(ph) + '">' + clean(c.html) + '</div>';
  const imgs = '<div class="aw-ed-imgs">' + (c.imgs || []).map((im, k) => '<div class="aw-ed-img"><img src="' + esc(mediaUrl(im.f)) + '" alt=""><input class="at-in" data-leg="' + k + '" value="' + esc(im.leg || '') + '" placeholder="Légende"><button type="button" class="at-x" data-rmimg="' + k + '" title="Retirer (le fichier est gardé)">✕</button></div>').join('') + '<div class="aw-ed-row"><button type="button" class="at-btn sm" data-addimg>＋ Fichier (ou Ctrl+V)</button></div><div class="aw-ed-row"><input class="at-in" data-imgurl placeholder="ou colle l\'adresse d\'une image internet (https://…)"><button type="button" class="at-btn sm" data-addurl>Ajouter</button></div></div>';
  switch (c.type){
    case 'texte': return common + dateF + rich('Écris ici… (Ctrl+V pour coller une image)') + imgs + srcSel + '<label>Source (texte libre)<input class="at-in" data-f="source" value="' + esc(c.source || '') + '"></label>';
    case 'image': return common + dateF + imgs + rich('Description (facultatif)') + srcSel;
    case 'citation': return '<label>Étiquette<input class="at-in" data-f="titre" value="' + esc(c.titre || '') + '" placeholder="ex. Thèse d\'investissement"></label>' + dateF + rich('Ta phrase clé…');
    case 'kpi': return '<label>Donnée affichée<select class="at-sel" data-f="bind">' + bindOptions(d, c.bind || '', true) + '</select></label>' +
      (c.bind ? '<p class="at-faint">Le chiffre, la comparaison avec l\'année précédente et le mini-historique se mettent à jour tout seuls.</p>' :
        '<label>Libellé<input class="at-in" data-f="label" value="' + esc(c.label || '') + '"></label><div class="at-row2"><label>Valeur<input class="at-in" data-f="value" data-num value="' + val(c.value) + '"></label><label>Unité<input class="at-in" data-f="unit" value="' + esc(c.unit || '') + '" placeholder="%, x, €, Md€…"></label></div><div class="at-row2"><label>Valeur précédente<input class="at-in" data-f="prev" data-num value="' + val(c.prev) + '"></label><label>Période<input class="at-in" data-f="period" value="' + esc(c.period || '') + '" placeholder="2025"></label></div><label>Source<input class="at-in" data-f="source" value="' + esc(c.source || '') + '"></label><p class="at-faint">Astuce : saisis plutôt la donnée dans « 📊 Données » du dossier, puis choisis-la ici : elle pourra servir à plusieurs cartes.</p>') +
      '<label>Note<input class="at-in" data-f="note" value="' + esc(c.note || '') + '"></label>';
    case 'donut': return common + '<label>Unité<input class="at-in" data-f="unit" value="' + esc(c.unit || '') + '" placeholder="Md€, %…"></label><div class="aw-ed-rows">' +
      (c.rows || []).map((r, k) => '<div class="aw-ed-row"><select class="aw-colsel" data-row-color="' + k + '" style="background:' + (r.color || SERIES_COLORS[k % SERIES_COLORS.length]) + '">' + SERIES_COLORS.map(col => '<option value="' + col + '" style="background:' + col + '"' + ((r.color || SERIES_COLORS[k % SERIES_COLORS.length]) === col ? ' selected' : '') + '></option>').join('') + '</select><input class="at-in" data-row-label="' + k + '" value="' + esc(r.label || '') + '" placeholder="Catégorie"><input class="at-in num" data-row-v="' + k + '" value="' + val(r.v) + '" placeholder="Montant"><button type="button" class="at-x" data-row-del="' + k + '">✕</button></div>').join('') +
      '<button type="button" class="at-btn sm" data-row-add>＋ Catégorie</button></div>' + srcSel;
    case 'barres': case 'courbes': {
      const tv = c.mode === 'tv';
      return common + '<div class="at-seg big"><button type="button" class="' + (tv ? 'on' : '') + '" data-mode="tv">TradingView</button><button type="button" class="' + (tv ? '' : 'on') + '" data-mode="manuel">Saisie à la main</button></div>' +
        (tv ? '<div class="aw-ed-checks">' + Object.keys(TVF).filter(k => k !== 'croissanceCA' || true).map(k => '<label><input type="checkbox" data-key="' + k + '"' + ((c.keys || []).includes(k) ? ' checked' : '') + '> ' + esc(TVF[k].l) + '</label>').join('') + '</div><label>Années affichées<select class="at-sel" data-f="years">' + [5, 10, 15, 20].map(n => '<option value="' + n + '"' + ((c.years || 10) === n ? ' selected' : '') + '>' + n + ' ans</option>').join('') + '</select></label>'
          : '<label>Années ou périodes (séparées par des virgules)<input class="at-in" data-labels value="' + esc((c.labels || []).join(', ')) + '"></label><label>Unité<input class="at-in" data-f="unit" value="' + esc(c.unit || '') + '"></label><div class="aw-ed-rows">' +
            (c.series || []).map((s, k) => '<div class="aw-ed-series"><div class="aw-ed-row"><select class="aw-colsel" data-ser-color="' + k + '" style="background:' + (s.color || SERIES_COLORS[k]) + '">' + SERIES_COLORS.map(col => '<option value="' + col + '" style="background:' + col + '"' + ((s.color || SERIES_COLORS[k]) === col ? ' selected' : '') + '></option>').join('') + '</select><input class="at-in" data-ser-name="' + k + '" value="' + esc(s.name || '') + '" placeholder="Nom de la série"><button type="button" class="at-x" data-ser-del="' + k + '">✕</button></div><input class="at-in" data-ser-values="' + k + '" value="' + esc((s.values || []).map(x => x == null ? '' : String(x).replace('.', ',')).join('; ')) + '" placeholder="Valeurs séparées par ; (ex. 6,1; 6,4; 6,9)"></div>').join('') +
            '<button type="button" class="at-btn sm" data-ser-add>＋ Série</button></div>') + srcSel;
    }
    case 'comparatif': {
      const cols = compCols(c);
      return common + '<div class="aw-ed-rows"><b class="aw-ed-h">Entreprises</b>' + (c.cols || []).map((n, k) => '<div class="aw-ed-row"><input class="at-in" list="awCos" data-col="' + k + '" value="' + esc(n === '@self' ? cols[k] + ' (ce dossier)' : n) + '"' + (n === '@self' ? ' disabled' : '') + '><button type="button" class="at-x" data-col-del="' + k + '">✕</button></div>').join('') + '<button type="button" class="at-btn sm" data-col-add>＋ Entreprise</button><datalist id="awCos">' + companyOptions() + '</datalist></div>' +
        '<label class="aw-ed-check"><input type="checkbox" data-withconc' + (c.withConc !== false ? ' checked' : '') + '> Ajouter tout seul les cartes « Entreprise » du dossier</label>' +
        '<b class="aw-ed-h">Indicateurs</b><div class="aw-ed-checks">' + Object.keys(TVF).map(k => '<label><input type="checkbox" data-metric="' + k + '"' + ((c.metrics || []).includes(k) ? ' checked' : '') + '> ' + esc(TVF[k].l) + '</label>').join('') + '</div>' +
        '<b class="aw-ed-h">Corriger une valeur (vide = TradingView)</b><div class="aw-tscroll"><table class="aw-table ed"><thead><tr><th></th>' + cols.map(n => '<th>' + esc(n.slice(0, 12)) + '</th>').join('') + '</tr></thead><tbody>' + (c.metrics || []).filter(k => TVF[k]).map(k => '<tr><td class="lb">' + esc(TVF[k].l) + '</td>' + cols.map((n, i) => { const ov = c.over && c.over[k] && c.over[k][i]; const auto = compValue(Object.assign({}, c, { over: {} }), n, k, i); return '<td><input class="at-in num" data-over="' + k + '|' + i + '" value="' + (ov != null && ov !== '' ? esc(String(ov).replace('.', ',')) : '') + '" placeholder="' + (auto == null ? '—' : esc(fr(auto, TVF[k].d))) + '"></td>'; }).join('') + '</tr>').join('') + '</tbody></table></div>';
    }
    case 'concurrent': return '<label>Entreprise<input class="at-in" list="awCos" data-f="nom" value="' + esc(c.nom || '') + '"><datalist id="awCos">' + companyOptions() + '</datalist></label>' +
      '<div class="at-row2"><label>Pays<input class="at-in" data-f="pays" value="' + esc(c.pays || '') + '"></label><label>Rôle<input class="at-in" data-f="role" value="' + esc(c.role || '') + '" placeholder="Concurrent direct, client…"></label></div>' +
      '<label>Étiquettes (séparées par des virgules)<input class="at-in" data-f="tags" value="' + esc(c.tags || '') + '"></label><label>Forces<textarea class="at-in" rows="3" data-f="forces">' + esc(c.forces || '') + '</textarea></label><label>Faiblesses<textarea class="at-in" rows="3" data-f="faiblesses">' + esc(c.faiblesses || '') + '</textarea></label>' +
      '<label>Son dossier dans l\'Atelier<select class="at-sel" data-f="docId"><option value="">— (trouvé par son nom s\'il existe)</option>' + Object.values(D.docs).filter(x => x.type === 'entreprise' && x.id !== d.id).map(x => '<option value="' + x.id + '"' + (c.docId === x.id ? ' selected' : '') + '>' + esc(x.titre) + '</option>').join('') + '</select></label>' +
      '<label>Logo (adresse d\'image, facultatif)<input class="at-in" data-f="logo" value="' + esc(c.logo || '') + '"></label><p class="at-faint">Si l\'entreprise est connue de l\'onglet Analyse, son logo et ses chiffres s\'affichent tout seuls.</p>';
    case 'bourse': return common + '<label>Période affichée<select class="at-sel" data-f="range">' + RANGES.map(r => '<option value="' + r[0] + '"' + ((c.range || '5a') === r[0] ? ' selected' : '') + '>' + r[2] + '</option>').join('') + '</select></label><p class="at-faint">Le cours vient de TradingView et reste figé à la date du relevé du dossier (« ↻ Actualiser » en haut pour le relire).</p>';
    case 'overlay': return common + '<label class="aw-ed-check"><input type="checkbox" data-ovprice' + (c.price !== false ? ' checked' : '') + '> Afficher le cours</label><label class="aw-ed-check"><input type="checkbox" data-ovnorm' + (c.norm ? ' checked' : '') + '> Tout en base 100 (comparer les croissances)</label>' +
      '<b class="aw-ed-h">Chiffres superposés (historique TradingView, fin d\'exercice)</b><div class="aw-ed-checks">' + OV_KEYS.map(k => '<label><input type="checkbox" data-key="' + k + '"' + ((c.keys || ['fcfParAction', 'dividende']).includes(k) ? ' checked' : '') + '> ' + esc(TVF[k].l) + '</label>').join('') + '</div>' +
      '<label>Période<select class="at-sel" data-f="range">' + RANGES.map(r => '<option value="' + r[0] + '"' + ((c.range || '10a') === r[0] ? ' selected' : '') + '>' + r[2] + '</option>').join('') + '</select></label>';
    case 'geo': return common + '<label>Unité<input class="at-in" data-f="unit" value="' + esc(c.unit || '') + '" placeholder="Md€, M$, %…"></label><div class="aw-ed-rows"><b class="aw-ed-h">Pays ou régions, comme dans le rapport annuel</b>' +
      (c.rows || []).map((r, k) => '<div class="aw-ed-row"><input class="at-in" list="awZones" data-geo-zone="' + k + '" value="' + esc(r.zone || '') + '" placeholder="ex. France, Europe, Asie-Pacifique"><input class="at-in num" data-geo-v="' + k + '" value="' + val(r.v) + '" placeholder="Montant"><button type="button" class="at-x" data-geo-del="' + k + '">✕</button></div>').join('') +
      '<button type="button" class="at-btn sm" data-geo-add>＋ Pays ou région</button><datalist id="awZones">' + Object.keys(ZONES).map(z => '<option value="' + esc(z) + '">').join('') + (MONDE ? MONDE.c.map(x => '<option value="' + esc(x.n) + '">').join('') : '') + '</datalist></div>' +
      '<p class="at-faint">Un pays nommé garde sa couleur ; une région colore tous ses pays qui ne sont pas déjà nommés ; « Reste du monde » colore tout le reste.</p>' + srcSel;
    case 'profil': return '<label>Nom<input class="at-in" data-f="nom" value="' + esc(c.nom || '') + '"></label><div class="at-row2"><label>Poste<input class="at-in" data-f="poste" value="' + esc(c.poste || '') + '" placeholder="PDG, directeur financier…"></label><label>En poste depuis<input class="at-in" data-f="depuis" value="' + esc(c.depuis || '') + '" placeholder="2019"></label></div>' +
      '<b class="aw-ed-h">Photo</b>' + imgs + '<div class="at-row2"><label>Actions détenues<input class="at-in" data-f="detention" value="' + esc(c.detention || '') + '" placeholder="ex. 1,2 % du capital"></label><label>Rémunération<input class="at-in" data-f="remu" value="' + esc(c.remu || '') + '" placeholder="ex. 3,4 M€ / an"></label></div>' +
      '<label>Parcours<textarea class="at-in" rows="5" data-f="parcours">' + esc(c.parcours || '') + '</textarea></label>';
    case 'these': return '<div class="at-seg big"><button type="button" class="' + (c.phase !== 'finale' ? 'on' : '') + '" data-phase="depart">Thèse de départ</button><button type="button" class="' + (c.phase === 'finale' ? 'on' : '') + '" data-phase="finale">Thèse finale</button></div>' + dateF +
      THESE_Q.map((q, i) => '<label>' + (i + 1) + '. ' + esc(q) + '<textarea class="at-in" rows="3" data-ans="' + i + '">' + esc((c.answers || [])[i] || '') + '</textarea></label>').join('');
    case 'thesecmp': return '<p class="at-faint">Les réponses viennent des cartes « Thèse » de départ et finale du dossier. Donne ici ton verdict pour chaque question.</p>' +
      THESE_Q.map((q, i) => '<label>' + (i + 1) + '. ' + esc(THESE_SHORT[i]) + '<select class="at-sel" data-verdict="' + i + '"><option value="">—</option>' + Object.keys(VERDICTS).map(k => '<option value="' + k + '"' + ((c.verdicts || {})[i] === k ? ' selected' : '') + '>' + VERDICTS[k][0] + '</option>').join('') + '</select></label>').join('');
    case 'source': return common + '<label>Type<select class="at-sel" data-f="kind">' + [['pdf', 'PDF'], ['web', 'Site web'], ['article', 'Article'], ['video', 'Vidéo']].map(([k, l]) => '<option value="' + k + '"' + (c.kind === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
      '<label>Lien (facultatif)<input class="at-in" data-f="url" value="' + esc(c.url || '') + '" placeholder="https://…"></label><div class="aw-ed-row"><button type="button" class="at-btn sm" data-addfile>' + (c.file ? 'Remplacer le fichier' : '＋ Joindre un PDF ou une image') + '</button>' + (c.file ? '<span class="at-faint">' + esc(c.file) + '</span>' : '') + '</div>' +
      '<div class="at-row2"><label>Pages<input class="at-in" data-f="pages" value="' + esc(c.pages || '') + '"></label>' + dateF + '</div><label>Mes notes<textarea class="at-in" rows="4" data-f="note">' + esc(c.note || '') + '</textarea></label>';
  }
  return common;
}
function renderEditor(){
  const host = $('awEditHost'); if (!host) return;
  if (ui.edit && !MONDE && ver() && ver().cards[ui.edit] && ver().cards[ui.edit].type === 'geo') loadMonde().then(() => { if (ui.edit) renderEditor(); });
  const v = ver(), c = ui.edit && v ? v.cards[ui.edit] : null;
  if (!c || isRo()){ host.innerHTML = ''; ui.edit = null; return; }
  const d = doc(), t = TYPES[c.type];
  host.innerHTML = '<aside class="aw-ed"><div class="aw-ed-top"><span class="aw-tl"><span class="aw-dot" style="background:' + t.c + '"></span>Modifier · ' + esc(t.l) + '</span><span style="flex:1"></span><button type="button" class="aw-kb" data-ed-close aria-label="Fermer">' + ICO.close + '</button></div>' +
    '<div class="aw-ed-body">' + editorFields(c, d, v) + '</div><div class="aw-ed-foot"><span class="at-faint">Enregistré automatiquement</span><button type="button" class="at-btn" data-ed-close>Fermer</button></div></aside>';
  wireEditor(host.firstElementChild, c);
}
function refreshCard(c){
  const el = document.querySelector('#awBody [data-cid="' + c.id + '"]');
  if (!el || ui.view !== 'grid'){ if (ui.view === 'org') renderOrg(true); return; }
  charts.filter(ch => el.contains(ch.canvas)).forEach(ch => { ch.destroy(); charts.splice(charts.indexOf(ch), 1); });
  const tmp = document.createElement('div'); tmp.innerHTML = cardHtml(c); const n = tmp.firstElementChild; el.replaceWith(n);
  drawCharts(n, charts, false);
  drawGeos(n);
}
function wireEditor(p, c){
  const v = ver();
  const changed = (rerenderEditor) => { touch(); clearTimeout(editTimer); editTimer = setTimeout(() => refreshCard(c), 150); if (rerenderEditor) renderEditor(); };
  p.addEventListener('input', e => {
    const t = e.target, ds = t.dataset;
    if (ds.f){ c[ds.f] = ds.num !== undefined ? num(t.value) : t.value; if (ds.f === 'nom' && c.type === 'concurrent'){ const co = findCompany(t.value); if (co && !c.pays) {} } changed(false); }
    else if (ds.rich !== undefined){ c.html = clean(t.innerHTML); changed(false); }
    else if (ds.leg !== undefined){ c.imgs[+ds.leg].leg = t.value; changed(false); }
    else if (ds.rowLabel !== undefined){ c.rows[+ds.rowLabel].label = t.value; changed(false); }
    else if (ds.rowV !== undefined){ c.rows[+ds.rowV].v = num(t.value); changed(false); }
    else if (ds.labels !== undefined){ c.labels = t.value.split(',').map(x => x.trim()).filter(Boolean); changed(false); }
    else if (ds.serName !== undefined){ c.series[+ds.serName].name = t.value; changed(false); }
    else if (ds.serValues !== undefined){ c.series[+ds.serValues].values = t.value.split(';').map(x => num(x)); changed(false); }
    else if (ds.col !== undefined){ c.cols[+ds.col] = t.value.trim(); changed(false); }
    else if (ds.ans !== undefined){ c.answers = c.answers || []; c.answers[+ds.ans] = t.value; changed(false); }
    else if (ds.geoZone !== undefined){ c.rows[+ds.geoZone].zone = t.value; changed(false); }
    else if (ds.geoV !== undefined){ c.rows[+ds.geoV].v = num(t.value); changed(false); }
    else if (ds.over !== undefined){ const [k, i] = ds.over.split('|'); c.over = c.over || {}; c.over[k] = c.over[k] || []; c.over[k][+i] = t.value.trim() === '' ? null : num(t.value); changed(false); }
  });
  p.addEventListener('change', e => {
    const t = e.target, ds = t.dataset;
    if (ds.verdict !== undefined){ c.verdicts = c.verdicts || {}; c.verdicts[ds.verdict] = t.value; changed(false); return; }
    if (ds.f === 'bind' || ds.f === 'years' || ds.f === 'srcId' || ds.f === 'kind' || ds.f === 'docId' || ds.f === 'range'){ c[ds.f] = ds.f === 'years' ? Number(t.value) : t.value; changed(ds.f === 'bind'); }
    else if (ds.key !== undefined){ c.keys = c.keys || (c.type === 'overlay' ? ['fcfParAction', 'dividende'] : []); if (t.checked && !c.keys.includes(ds.key)) c.keys.push(ds.key); if (!t.checked) c.keys = c.keys.filter(k => k !== ds.key); changed(false); }
    else if (ds.metric !== undefined){ c.metrics = c.metrics || []; if (t.checked && !c.metrics.includes(ds.metric)) c.metrics.push(ds.metric); if (!t.checked) c.metrics = c.metrics.filter(k => k !== ds.metric); changed(true); }
    else if (ds.withconc !== undefined){ c.withConc = t.checked; changed(true); }
    else if (ds.ovprice !== undefined){ c.price = t.checked; changed(false); }
    else if (ds.ovnorm !== undefined){ c.norm = t.checked; changed(false); }
    else if (ds.rowColor !== undefined){ c.rows[+ds.rowColor].color = t.value; t.style.background = t.value; changed(false); }
    else if (ds.serColor !== undefined){ c.series[+ds.serColor].color = t.value; t.style.background = t.value; changed(false); }
  });
  p.querySelectorAll('.at-rt button').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
  p.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const ds = b.dataset;
    if (ds.edClose !== undefined){ ui.edit = null; renderEditor(); return; }
    if (ds.cmd){ const k = ds.cmd; if (k === 'hilite') document.execCommand('hiliteColor', false, 'rgba(240,200,119,0.45)'); else if (k === 'h2') document.execCommand('formatBlock', false, document.queryCommandValue('formatBlock').toLowerCase() === 'h2' ? 'div' : 'h2'); else document.execCommand(k, false, null); const r = p.querySelector('[data-rich]'); if (r){ c.html = clean(r.innerHTML); changed(false); } return; }
    if (ds.mode){ c.mode = ds.mode; if (c.mode === 'manuel' && !c.series){ const s = seriesData(Object.assign({}, c, { mode: 'tv' }), doc()); c.labels = s.labels.length ? s.labels.map(String) : ['2023', '2024', '2025']; c.series = s.sets.length ? s.sets.map(x => ({ name: x.name, values: x.values, color: x.color })) : [{ name: 'Série 1', values: [], color: SERIES_COLORS[0] }]; } changed(true); return; }
    if (ds.rowAdd !== undefined){ c.rows = c.rows || []; c.rows.push({ label: '', v: null }); changed(true); return; }
    if (ds.rowDel !== undefined){ c.rows.splice(+ds.rowDel, 1); changed(true); return; }
    if (ds.serAdd !== undefined){ c.series = c.series || []; c.series.push({ name: '', values: [], color: SERIES_COLORS[c.series.length % SERIES_COLORS.length] }); changed(true); return; }
    if (ds.serDel !== undefined){ c.series.splice(+ds.serDel, 1); changed(true); return; }
    if (ds.colAdd !== undefined){ c.cols = c.cols || []; c.cols.push(''); changed(true); return; }
    if (ds.colDel !== undefined){ c.cols.splice(+ds.colDel, 1); Object.values(c.over || {}).forEach(a => a.splice(+ds.colDel, 1)); changed(true); return; }
    if (ds.rmimg !== undefined){ c.imgs.splice(+ds.rmimg, 1); changed(true); return; }
    if (ds.addimg !== undefined) return pick('image/png,image/jpeg,image/webp,image/gif', true, files => addFiles(c, files, 'img'));
    if (ds.addfile !== undefined) return pick('application/pdf,image/png,image/jpeg,image/webp', false, files => addFiles(c, files, 'file'));
    if (ds.phase){ c.phase = ds.phase; changed(true); return; }
    if (ds.geoAdd !== undefined){ c.rows = c.rows || []; c.rows.push({ zone: '', v: null }); changed(true); return; }
    if (ds.geoDel !== undefined){ c.rows.splice(+ds.geoDel, 1); changed(true); return; }
    if (ds.addurl !== undefined){ const inp = p.querySelector('[data-imgurl]'); return addImageUrl(c, inp ? inp.value.trim() : ''); }
  });
  p.addEventListener('paste', e => {
    const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter(x => x.type.startsWith('image/'));
    if (files.length && ['texte', 'image', 'profil'].includes(c.type)){ e.preventDefault(); addFiles(c, files, 'img'); return; }
    if (e.target.closest && e.target.closest('[data-rich]')){ e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); }
  });
}
function pick(accept, multi, cb){ const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.multiple = multi; inp.onchange = () => cb([...inp.files]); inp.click(); }
async function upload(file){
  if (!/^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(file.type)) throw new Error('Format non pris en charge (' + (file.type || 'inconnu') + ') : png, jpg, webp, gif ou pdf.');
  const r = await fetch('/api/atelier/media', { method: 'POST', headers: { 'Content-Type': file.type, 'X-Wolf-IA': '1' }, body: file });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || 'envoi du fichier refusé (relance le raccourci « Wolf Analysis » si le serveur est ancien)');
  return j.file;
}
async function addImageUrl(c, url){
  if (!/^https?:\/\//i.test(url)){ ui.toast = { text: 'Colle une adresse complète qui commence par https://' }; showToast(); return; }
  ui.toast = { text: 'Téléchargement de l\'image…' }; showToast();
  try {
    const r = await fetch('/api/atelier/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' }, body: JSON.stringify({ url }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || 'image refusée (relance le raccourci « Wolf Analysis » si le serveur est ancien)');
    c.imgs = c.imgs || []; c.imgs.push({ f: j.file, leg: '', from: url });
    ui.toast = { text: '✓ Image enregistrée sur ton ordinateur' }; showToast();
    touch(); refreshCard(c); renderEditor();
  } catch(e){ ui.toast = { text: '⚠ ' + e.message }; showToast(); }
}
async function addFiles(c, files, kind){
  for (const f of files){
    try { const name = await upload(f); if (kind === 'file'){ c.file = name; if (!c.titre) c.titre = f.name.replace(/\.[a-z0-9]+$/i, ''); if (f.type === 'application/pdf') c.kind = 'pdf'; } else { c.imgs = c.imgs || []; c.imgs.push({ f: name, leg: '' }); if (c.type === 'texte' && !plain(c.html)) {} } }
    catch(e){ ui.toast = { text: '⚠ ' + e.message }; showToast(); }
  }
  touch(); refreshCard(c); renderEditor();
}

/* ====================== BIBLIOTHÈQUE « Ajouter une carte » ====================== */
function renderLibrary(){
  let host = $('awLib');
  if (!ui.lib){ if (host) host.remove(); return; }
  if (!host){ host = document.createElement('div'); host.id = 'awLib'; host.className = 'at-modal-bg'; document.body.appendChild(host); }
  const v = ver(), sec = v.sections.find(s => s.id === ui.lib.secId), q = norm(ui.lib.q);
  const cats = ['Rédaction', 'Chiffres', 'Entreprises et personnes', 'Thèse', 'Documents'];
  const custom = Object.values(D.templates).filter(t => t.card);
  host.innerHTML = '<div class="at-modal aw-lib"><div class="aw-lib-h"><h3>Ajouter une carte</h3><span class="at-faint">dans « ' + esc(sec ? sec.titre : '') + ' »</span><span style="flex:1"></span><input type="search" class="at-search" id="awLibQ" placeholder="Rechercher : camembert, concurrent, PDF…" value="' + esc(ui.lib.q) + '"><button type="button" class="aw-kb" data-lib-close aria-label="Fermer">' + ICO.close + '</button></div>' +
    cats.map(cat => { const list = Object.keys(TYPES).filter(k => TYPES[k].cat === cat && (!q || norm(TYPES[k].l + ' ' + TYPES[k].d).includes(q))); if (!list.length) return '';
      return '<h4>' + esc(cat) + '</h4><div class="aw-lib-tiles">' + list.map(k => '<button type="button" class="aw-lib-tile" data-lib-add="' + k + '"><span class="aw-lib-prev">' + libPreview(k) + '</span><b>' + esc(TYPES[k].l) + '</b><span>' + esc(TYPES[k].d) + '</span></button>').join('') + '</div>'; }).join('') + '</div>';
  host.onclick = e => {
    if (e.target === host || e.target.closest('[data-lib-close]')){ ui.lib = null; renderLibrary(); return; }
    const b = e.target.closest('[data-lib-add]'); if (!b) return;
    const c = addCard(ui.lib.secId, b.dataset.libAdd); ui.lib = null; renderLibrary(); renderBody();
    if (c){ ui.edit = c.id; renderEditor(); setTimeout(() => { const el = document.querySelector('[data-cid="' + c.id + '"]'); if (el){ el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('aw-new'); } }, 50); }
  };
  const qi = $('awLibQ'); qi.oninput = () => { ui.lib.q = qi.value; const p = qi.selectionStart; renderLibrary(); const n = $('awLibQ'); n.focus(); n.setSelectionRange(p, p); };
  if (!ui.lib.q) qi.focus();
}
function libPreview(k){
  switch (k){
    case 'texte': return '<i class="ln w6 hi"></i><i class="ln"></i><i class="ln"></i><i class="ln w8"></i>';
    case 'image': return '<i class="ph"></i><i class="ln w6 hi"></i>';
    case 'citation': return '<em>«</em>';
    case 'kpi': return '<strong>12,4 Md</strong><small>+8,2 %</small>';
    case 'donut': return '<svg viewBox="0 0 60 60" width="44" height="44"><g transform="rotate(-90 30 30)" fill="none" stroke-width="10"><circle cx="30" cy="30" r="22" stroke="#D9A441" stroke-dasharray="64 138"/><circle cx="30" cy="30" r="22" stroke="#4A9FE0" stroke-dasharray="39 138" stroke-dashoffset="-65"/><circle cx="30" cy="30" r="22" stroke="#F0C877" stroke-dasharray="33 138" stroke-dashoffset="-105"/></g></svg>';
    case 'barres': return '<span class="bars"><i style="height:40%"></i><i style="height:55%"></i><i style="height:70%"></i><i style="height:92%" class="last"></i></span>';
    case 'courbes': return '<svg viewBox="0 0 100 50" width="76" height="38"><polyline points="0,40 20,34 40,36 60,22 80,16 100,8" fill="none" stroke="#4A9FE0" stroke-width="3"/><polyline points="0,45 20,43 40,40 60,37 80,33 100,30" fill="none" stroke="#D9A441" stroke-width="3"/></svg>';
    case 'comparatif': return '<span class="cmp"><i></i><i class="g"></i><i></i><i class="r"></i></span>';
    case 'concurrent': return '<span class="logo">AB</span>';
    case 'source': return '<span class="pg"></span>';
    case 'bourse': return '<svg viewBox="0 0 100 50" width="80" height="40"><polyline points="0,38 10,30 20,34 30,22 40,26 50,14 60,20 70,12 80,18 90,6 100,10" fill="none" stroke="#D9A441" stroke-width="2.5"/></svg>';
    case 'overlay': return '<svg viewBox="0 0 100 50" width="80" height="40"><polyline points="0,38 10,30 20,34 30,22 40,26 50,14 60,20 70,12 80,18 90,6 100,10" fill="none" stroke="#D9A441" stroke-width="2"/><polyline points="0,44 25,40 50,33 75,26 100,20" fill="none" stroke="#4A9FE0" stroke-width="2.5"/><polyline points="0,47 25,45 50,42 75,40 100,37" fill="none" stroke="#F0C877" stroke-width="2.5"/></svg>';
    case 'geo': return '<svg viewBox="0 0 100 50" width="84" height="42"><ellipse cx="22" cy="20" rx="14" ry="10" fill="#4A9FE0"/><ellipse cx="52" cy="16" rx="9" ry="7" fill="#D9A441"/><ellipse cx="56" cy="34" rx="8" ry="10" fill="#8FA3B8"/><ellipse cx="80" cy="22" rx="14" ry="9" fill="#F0C877"/></svg>';
    case 'profil': return '<span class="logo" style="border-radius:50%;background:#F08A4B">JD</span>';
    case 'these': return '<span class="cmp"><i class="g"></i><i></i><i></i></span>';
    case 'thesecmp': return '<span class="cmp"><i></i><i class="g"></i><i class="r"></i></span>';
  }
  return '';
}

/* ====================== DONNÉES DU DOSSIER ====================== */
function renderFacts(){
  let host = $('awFacts');
  if (!ui.facts){ if (host) host.remove(); return; }
  if (!host){ host = document.createElement('div'); host.id = 'awFacts'; host.className = 'at-modal-bg'; document.body.appendChild(host); }
  const d = doc(), co = findCompany(d.nom || d.titre), facts = Object.values(d.facts || {});
  const used = id => Object.values(ver().cards).filter(c => c.bind === 'f:' + id).length;
  host.innerHTML = '<div class="at-modal aw-facts"><div class="aw-lib-h"><h3>📊 Données du dossier</h3><span style="flex:1"></span><button type="button" class="aw-kb" data-f-close aria-label="Fermer">' + ICO.close + '</button></div>' +
    '<p class="at-faint">Une donnée est saisie ici une seule fois, avec son unité, sa période et sa source. Les cartes « Indicateur » qui la choisissent se mettent toutes à jour quand tu la modifies.</p>' +
    '<h4>Mes données</h4><div class="aw-facts-t"><div class="aw-facts-r h"><span>Libellé</span><span>Valeur</span><span>Unité</span><span>Période</span><span>Source</span><span></span></div>' +
    facts.map(f => '<div class="aw-facts-r" data-fid="' + f.id + '"><input class="at-in" data-ff="label" value="' + esc(f.label || '') + '"><input class="at-in num" data-ff="value" value="' + esc(f.value == null ? '' : String(f.value).replace('.', ',')) + '"><input class="at-in" data-ff="unit" value="' + esc(f.unit || '') + '"><input class="at-in" data-ff="period" value="' + esc(f.period || '') + '"><input class="at-in" data-ff="source" value="' + esc(f.source || '') + '"><button type="button" class="at-x" data-f-del title="Corbeille' + (used(f.id) ? ' (utilisée par ' + used(f.id) + ' carte(s))' : '') + '">✕</button></div>').join('') +
    '</div><button type="button" class="at-btn sm" data-f-add>＋ Donnée</button>' +
    '<h4>TradingView (figé le ' + (ver().tvData ? frDate(ver().tvData.at) : '—') + ', « ↻ Actualiser » pour relire)</h4>' + (knownData(null) ? '<div class="aw-facts-tv">' + Object.keys(TVF).map(k => { const s = getSeries(null, k); const n = s.values.length; return '<div><span>' + esc(TVF[k].l) + '</span><b>' + fmtVal(n ? s.values[n - 1] : null, TVF[k].u, deviseOf(null), TVF[k].d) + '</b><small>' + (n ? s.labels[n - 1] : '') + '</small></div>'; }).join('') + '</div>'
      : '<p class="at-faint">Cette entreprise n\'est pas reconnue dans l\'onglet Analyse. Vérifie son nom dans ⚙ (« Nom dans l\'onglet Analyse »).</p>') + '</div>';
  host.oninput = e => { const r = e.target.closest('[data-fid]'), k = e.target.dataset.ff; if (!r || !k) return; const f = d.facts[r.dataset.fid]; f[k] = k === 'value' ? num(e.target.value) : e.target.value; touch(); clearTimeout(editTimer); editTimer = setTimeout(renderBody, 300); };
  host.onclick = e => {
    if (e.target === host || e.target.closest('[data-f-close]')){ ui.facts = false; renderFacts(); renderBody(); return; }
    if (e.target.closest('[data-f-add]')){ d.facts = d.facts || {}; const id = uid('f'); d.facts[id] = { id, label: '', value: null, unit: '', period: '', source: '' }; touch(); renderFacts(); return; }
    const del = e.target.closest('[data-f-del]'); if (del){ const id = del.closest('[data-fid]').dataset.fid, f = d.facts[id]; delete d.facts[id]; trash({ kind: 'fact', docId: d.id, data: f }, 'Donnée « ' + (f.label || 'sans nom') + ' »'); touch(); renderFacts(); }
  };
}

/* ====================== FENÊTRES (nouveau dossier, réglages, modèle) ====================== */
function renderModal(){
  const host = $('atModalHost'); if (!host) return;
  const m = ui.modal; if (!m){ host.innerHTML = ''; return; }
  const secOpts = sel => '<option value="">— Aucun —</option>' + sectors().map(s => '<option value="' + s.key + '"' + (sel === s.key ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('');
  const subs = [...new Set(Object.values(D.docs).map(d => d.sousSecteur).filter(Boolean))];
  let h = '';
  if (m.kind === 'new'){
    const tpls = Object.values(BUILTIN).concat(Object.values(D.templates)).filter(t => t.type === m.type || t.id === 'vide');
    h = '<h3>Nouveau dossier</h3><div class="at-seg big">' + Object.keys(DOC_LABEL).map(t => '<button type="button" class="' + (m.type === t ? 'on' : '') + '" data-mtype="' + t + '">' + esc(DOC_LABEL[t]) + '</button>').join('') + '</div>' +
      '<label>' + (m.type === 'entreprise' ? 'Entreprise' : m.type === 'chaine' ? 'Nom de la chaîne de valeur (ex. Semi-conducteurs)' : 'Titre du dossier') + '<input type="text" class="at-in" id="atMName" list="atMNames" value="' + esc(m.titre || '') + '" autocomplete="off"></label>' +
      (m.type === 'entreprise' ? '<datalist id="atMNames">' + companyOptions() + '</datalist><p class="at-faint">Si l\'entreprise est connue de l\'onglet Analyse, son logo, son secteur et ses chiffres TradingView sont repris automatiquement.</p>' : '') +
      (m.type !== 'libre' ? '<div class="at-row2"><label>Secteur<select class="at-sel" id="atMSec">' + secOpts(m.secteur || '') + '</select></label>' + (m.type === 'entreprise' ? '<label>Sous-secteur<input type="text" class="at-in" id="atMSub" list="atMSubs" value="' + esc(m.sousSecteur || '') + '"><datalist id="atMSubs">' + subs.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist></label>' : '') + '</div>' : '') +
      '<label>Structure de départ<select class="at-sel" id="atMTpl">' + tpls.map(t => '<option value="' + t.id + '">' + esc(t.nom) + (t.builtin ? '' : ' (mon modèle)') + '</option>').join('') + '</select></label>' +
      '<div class="at-mbtns"><button type="button" class="at-btn" data-mclose>Annuler</button><button type="button" class="at-btn gold" data-mok>Créer le dossier</button></div>';
  } else if (m.kind === 'props'){
    const d = doc(), v = ver();
    h = '<h3>Réglages du dossier</h3><label>Titre<input type="text" class="at-in" id="atPTitre" value="' + esc(d.titre) + '"></label>' +
      '<div class="at-row2"><label>Secteur<select class="at-sel" id="atPSec">' + secOpts(d.secteur || '') + '</select></label><label>Sous-secteur<input type="text" class="at-in" id="atPSub" list="atMSubs" value="' + esc(d.sousSecteur || '') + '"><datalist id="atMSubs">' + subs.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist></label></div>' +
      (d.type === 'entreprise' ? '<div class="at-row2"><label>Symbole TradingView<input type="text" class="at-in" id="atPTv" placeholder="ex. EURONEXT:ASML" value="' + esc(d.tv || '') + '"></label><label>Nom dans l\'onglet Analyse<input type="text" class="at-in" id="atPNom" list="atMNames" value="' + esc(d.nom || '') + '"><datalist id="atMNames">' + companyOptions() + '</datalist></label></div>' : '') +
      '<label>Logo (adresse d\'une image)<input type="text" class="at-in" id="atPLogo" placeholder="https://…" value="' + esc(d.logo || '') + '"></label>' +
      '<label>Nom de la version affichée<input type="text" class="at-in" id="atPVer" value="' + esc(v.label) + '"></label>' +
      '<div class="at-mbtns"><button type="button" class="at-btn danger" data-deldoc>🗑 Dossier à la corbeille</button>' + (d.versions.length > 1 ? '<button type="button" class="at-btn danger" data-delver>🗑 Cette version</button>' : '') + '<span style="flex:1"></span><button type="button" class="at-btn" data-mclose>Annuler</button><button type="button" class="at-btn gold" data-mok>Enregistrer</button></div>';
  } else if (m.kind === 'tpl'){
    h = '<h3>Enregistrer cette structure comme modèle</h3><p class="at-faint">Les sections et les cartes sont gardées (types, titres, formats, liens aux chiffres TradingView), sans leur contenu. Le modèle sera proposé à chaque nouveau dossier.</p>' +
      '<label>Nom du modèle<input type="text" class="at-in" id="atTName" value="' + esc(m.nom || '') + '"></label><div class="at-mbtns"><button type="button" class="at-btn" data-mclose>Annuler</button><button type="button" class="at-btn gold" data-mok>Enregistrer le modèle</button></div>';
  }
  host.innerHTML = '<div class="at-modal-bg"><div class="at-modal">' + h + '</div></div>';
  const bg = host.firstElementChild, close = () => { ui.modal = null; host.innerHTML = ''; };
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  const first = bg.querySelector('input[type=text]'); if (first){ first.focus(); first.select(); }
  const ok = () => {
    if (m.kind === 'new'){
      const titre = $('atMName').value.trim(); if (!titre){ $('atMName').focus(); return; }
      const nd = createDoc({ type: m.type, titre, tpl: $('atMTpl').value, secteur: $('atMSec') ? $('atMSec').value : '', sousSecteur: $('atMSub') ? $('atMSub').value.trim() : '' });
      close(); openDoc(nd.id);
    } else if (m.kind === 'props'){
      const d = doc(), v = ver(), t = $('atPTitre').value.trim();
      if (t) d.titre = t;
      d.secteur = $('atPSec').value; d.sousSecteur = $('atPSub').value.trim(); d.logo = $('atPLogo').value.trim();
      if ($('atPTv')){ d.tv = $('atPTv').value.trim().toUpperCase(); const co = findCompany($('atPNom').value.trim()); d.nom = co ? co.key : $('atPNom').value.trim(); if (co && !d.logo) d.logo = co.logo; }
      v.label = $('atPVer').value.trim() || v.label;
      touch(); close(); renderShell();
    } else if (m.kind === 'tpl'){
      const nom = $('atTName').value.trim(); if (!nom){ $('atTName').focus(); return; }
      const d = doc(), v = ver(), id = uid('m');
      D.templates[id] = { id, nom, type: d.type, sections: v.sections.map(s => ({ titre: s.titre, hint: s.hint || [], color: s.color, cards: s.cards.map(cid => v.cards[cid]).filter(Boolean).map(c => { const o = { type: c.type, titre: c.titre || '', size: c.size }; ['bind', 'mode', 'keys', 'years', 'metrics', 'unit'].forEach(k => { if (c[k] != null) o[k] = JSON.parse(JSON.stringify(c[k])); }); if (c.type === 'comparatif' && (c.cols || []).includes('@self')) o.self = true; if (c.type === 'donut' && c.rows) o.rows = c.rows.map(r => ({ label: r.label, v: null, color: r.color })); return o; }) })) };
      markDirty(); close(); ui.toast = { text: '💾 Modèle « ' + nom + ' » enregistré' }; showToast();
    }
  };
  bg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT'){ e.preventDefault(); ok(); } });
  bg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mclose !== undefined) return close();
    if (b.dataset.mok !== undefined) return ok();
    if (b.dataset.mtype){ m.titre = $('atMName').value; m.type = b.dataset.mtype; return renderModal(); }
    if (b.dataset.deldoc !== undefined){ close(); return deleteDoc(ui.docId); }
    if (b.dataset.delver !== undefined){ const d = doc(), v = ver(), i = d.versions.indexOf(v); d.versions.splice(i, 1); d.cur = d.versions[d.versions.length - 1].id;
      trash({ kind: 'version', docId: d.id, data: v }, 'Version « ' + v.label + ' » de ' + d.titre); touch(); close(); return openDoc(d.id); }
  });
  const nameInp = $('atMName');
  if (nameInp && m.kind === 'new' && m.type === 'entreprise') nameInp.addEventListener('change', () => { const c = findCompany(nameInp.value); if (c){ if (c.secteur && !$('atMSec').value) $('atMSec').value = c.secteur; if (c.sousSecteur && !$('atMSub').value) $('atMSub').value = c.sousSecteur; } });
}

/* ---------- événements généraux ---------- */
function wireShell(){
  const pg = page();
  pg.onclick = e => {
    const b = e.target.closest('button'); if (!b || b.closest('#awBody') || b.closest('#atModalHost') || b.closest('#awEditHost')) return;
    const ds = b.dataset;
    if (b.id === 'atReload'){ load().then(() => { if (ui.docId && !(D && D.docs[ui.docId])) ui.docId = null; renderShell(); }); return; }
    if (ds.home !== undefined){ ui.docId = null; ui.edit = null; return renderShell(); }
    if (ds.open) return openDoc(ds.open);
    if (ds.goprix !== undefined){ if (window.PRIX_UI) window.PRIX_UI.show(ds.goprix); return; }
    if (ds.new !== undefined){ ui.modal = { kind: 'new', type: ds.new || 'entreprise' }; return renderModal(); }
    if (ds.tog){ ui.open[ds.tog] = ui.open[ds.tog] === false; $('atSide').innerHTML = sideHtml(); statusLabel(); return wireSearch(); }
    if (ds.restore) return restore(ds.restore);
    if (ds.deltpl){ const t = D.templates[ds.deltpl]; delete D.templates[ds.deltpl]; trash({ kind: 'template', data: t }, 'Modèle « ' + t.nom + ' »'); markDirty(); return renderShell(); }
    if (ds.export !== undefined){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(D, null, 1)], { type: 'application/json' })); a.download = 'atelier-analyses-' + today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return; }
    if (!doc()) return;
    const v = ver(), d = doc();
    if (ds.side !== undefined){ ui.side = !ui.side; pg.classList.toggle('at-noside', !ui.side); if (ui.view === 'org') setTimeout(() => renderOrg(true), 30); return; }
    if (ds.view){ ui.view = ds.view; renderShell(); return; }
    if (ds.allsec !== undefined){ v.sections.forEach(s => { s.collapsed = ds.allsec === '0'; }); if (!RO) touch(); renderBody(); return; }
    if (ds.orgall !== undefined){ v.sections.forEach(s => { ui.orgOpen[s.id] = ds.orgall === '1'; }); renderOrg(false); return; }
    if (ds.addsec !== undefined){ const s = addSection(); renderBody(); setTimeout(() => { const h = document.querySelector('[data-sid="' + s.id + '"] [data-s-title]'); if (h){ h.scrollIntoView({ block: 'center' }); h.click(); } }, 30); return; }
    if (ds.newver !== undefined){ const c = JSON.parse(JSON.stringify(v)); c.id = uid('v'); c.label = 'Version du ' + frDate(today()) + (d.versions.some(x => x.label === 'Version du ' + frDate(today())) ? ' (' + (d.versions.length + 1) + ')' : ''); c.date = today(); d.versions.push(c); d.cur = c.id; touch(); openDoc(d.id); ui.toast = { text: 'Nouvelle version créée : l\'ancienne reste intacte dans la liste.' }; return showToast(); }
    if (ds.facts !== undefined){ ui.facts = true; return renderFacts(); }
    if (ds.tvrefresh !== undefined) return captureTv();
    if (ds.savetpl !== undefined){ ui.modal = { kind: 'tpl', nom: d.type === 'entreprise' ? 'Ma trame d\'analyse' : d.titre }; return renderModal(); }
    if (ds.props !== undefined){ ui.modal = { kind: 'props' }; return renderModal(); }
    if (ds.video !== undefined){ ui.video = !ui.video; ui.edit = null; renderShell(); return; }
  };
  const vs = $('atVer'); if (vs) vs.onchange = () => { doc().cur = vs.value; touch(); openDoc(ui.docId); };
  wireSearch();
}
function wireSearch(){ const s = $('atSearch'); if (s) s.oninput = () => { ui.q = s.value; const p = s.selectionStart; $('atSide').innerHTML = sideHtml(); statusLabel(); wireSearch(); const n = $('atSearch'); n.focus(); n.setSelectionRange(p, p); }; }
document.addEventListener('keydown', e => {
  const pg = page(); if (!pg || !pg.classList.contains('active')) return;
  if (ui.big){
    if (e.key === 'Escape'){ e.preventDefault(); closeBig(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft'){ e.preventDefault(); const o = bigOrder(ui.big), j = (o.indexOf(ui.big) + (e.key === 'ArrowRight' ? 1 : -1) + o.length) % o.length; openBig(o[j]); return; }
    return;
  }
  if (e.key === 'Escape'){
    if (ui.lib){ ui.lib = null; renderLibrary(); return; }
    if (ui.facts){ ui.facts = false; renderFacts(); renderBody(); return; }
    if (ui.modal){ ui.modal = null; renderModal(); return; }
    if (ui.edit){ ui.edit = null; renderEditor(); return; }
    if (ui.video && !document.querySelector('.stylo-on')){ ui.video = false; renderShell(); }
  }
});

async function onShow(force){
  if (!D || force === true){ await load(); }
  renderShell();
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-page="' + PAGE_ID + '"]'); if (b) setTimeout(onShow, 0); });

// Ouvre le dossier d'une entreprise (créé avec le modèle d'analyse s'il n'existe pas encore) — appelé par la liste de prix.
async function openFor(name, o){
  if (!D) await load();
  if (!D) return;
  let d = Object.values(D.docs).find(x => x.type === 'entreprise' && norm(x.titre) === norm(name));
  if (!d){ if (RO) return; d = createDoc({ type: 'entreprise', titre: name, tpl: 'wolf-entreprise', secteur: (o && o.secteur) || '', sousSecteur: (o && o.sousSecteur) || '', logo: (o && o.logo) || '' }); }
  if (typeof switchPage === 'function') switchPage(PAGE_ID);
  openDoc(d.id);
}
// Copie destinée au site public : tout sauf la corbeille. Liste des images et PDF réellement utilisés.
async function snapshot(){
  if (!D || RO) await load();
  if (!D || RO) return null;
  const media = new Set();
  Object.values(D.docs).forEach(d => d.versions.forEach(v => {
    Object.values(v.cards || {}).forEach(c => { (c.imgs || []).forEach(i => media.add(i.f)); if (c.file) media.add(c.file); });
    Object.values(v.nodes || {}).forEach(n => (n.blocks || []).forEach(b => (b.imgs || []).forEach(i => media.add(i.f))));
  }));
  return { data: { version: 1, publishedAt: new Date().toISOString(), docs: D.docs }, media: [...media] };
}
window.ATELIER_UI = { onShow, openFor, snapshot, hasDoc: name => !!(D && Object.values(D.docs).some(x => x.type === 'entreprise' && norm(x.titre) === norm(name))), _state: () => ({ D, ui, RO }), _test: { migrateVersion, resolveBind, seriesData, keyFigure, addCard, openBig } };
})();
