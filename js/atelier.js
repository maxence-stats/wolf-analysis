/* ================================================================================================
   ATELIER D'ANALYSES (2026-11-10) — répertoire visuel de toutes les analyses, en cartes mentales interactives
   ------------------------------------------------------------------------------------------------
   Un DOSSIER = une carte mentale (logo au centre, branches qui se déplient), rangée par secteur / sous-secteur.
   Trois types : analyse d'entreprise, chaîne de valeur d'un secteur (ses nœuds peuvent pointer vers un dossier
   d'entreprise), carte libre. Chaque dossier a plusieurs VERSIONS (copie complète datée). Chaque nœud ouvre une
   FICHE plein écran : textes, images (fichier, collage Ctrl+V, glisser-déposer), actualités datées, chiffres
   TradingView en direct, graphiques de l'historique. Deux mises en page par carte : « pieuvre » (rangement
   automatique) ou « libre » (chaque nœud placé à la main). Mode vidéo : tout l'habillage disparaît, on clique.

   DONNÉES — source de vérité = UN FICHIER, data/mes-portefeuilles/atelier.json, écrit par le serveur local
   (/api/store/save?name=atelier : révision / 409, écriture atomique, copies datées toutes les 10 min, copie dans
   Documents, copie mensuelle, refus de toute disparition de dossier non déclarée). Les images sont des fichiers à
   part (/api/atelier/media) que le serveur ne supprime JAMAIS. Rien n'est effacé pour de bon : nœuds, blocs,
   versions et dossiers supprimés vont dans la corbeille du fichier (D.trash), restaurables.
   RÈGLE POUR CLAUDE : ne jamais écrire ce fichier à la main ; tests sur instance jetable (-StoreDir <tmp>).
   ================================================================================================ */
(function(){
'use strict';

const PAGE_ID = 'pageAtelier';
const PALETTE = ['#D9A441', '#4A9FE0', '#4FD1A5', '#E5636B', '#F08A4B', '#5CC8D7', '#B8A1F0', '#C9D1D9'];
const ICONS = ['🏢', '⚙️', '🌍', '🏰', '📊', '💰', '👔', '⚠️', '🚀', '📰', '✅', '🔗', '🏭', '🚚', '🛒', '🔬', '💡', '📈', '📉', '🧩', '🎯', '🧠', '🛡️', '⛏️', '🔋', '💻', '🏦', '🧪', '📌', '❓'];
const TYPE_LABEL = { entreprise: 'Analyse d\'entreprise', chaine: 'Chaîne de valeur', libre: 'Carte libre' };
const GRAPHS = { ca: ['Chiffre d\'affaires (M)', 'line'], fcfParAction: ['FCF par action', 'bar'], dividende: ['Dividende par action', 'bar'], margeOp: ['Marge opérationnelle (%)', 'line'],
  roic: ['ROIC (%)', 'line'], actions: ['Actions en circulation (M)', 'line'], pFcf: ['P/FCF', 'bar'], prixActuel: ['Cours (fin d\'exercice)', 'line'] };
const T = (titre, icon, kids) => ({ titre, icon, kids: kids || [] });
const BUILTIN = {
  // Trame complète en 18 points (checklist de l'utilisateur du 2026-11-10, qui reprend l'ancienne « Analyse développée » :
  // présentation, revenus par pays / secteur, concurrents, marché, moat, activités, perspectives, risques, actionnariat,
  // ratios, conclusion). « Activité 1 » est à DUPLIQUER (⧉) pour chaque grande activité d'un groupe diversifié.
  'wolf-entreprise': { id: 'wolf-entreprise', nom: 'Template analyse — 10/11/2026', type: 'entreprise', builtin: true, tree: T('', '', [
    T('1. Présentation', '🏢', [T('Histoire & dates clés'), T('Activités'), T('Implantation'), T('Dirigeants')]),
    T('2. Modèle économique', '⚙️', [T('Comment elle gagne de l\'argent'), T('Clients'), T('Produits & services'), T('Récurrence des revenus'), T('Structure des coûts')]),
    T('3. Répartition du chiffre d\'affaires', '🧩', [T('Par pays & régions'), T('Par secteurs & activités'), T('Par filiales'), T('Évolution historique')]),
    T('4. Analyse des segments', '📊', [T('Activité 1 (à dupliquer ⧉)', '', [T('Chiffre d\'affaires & croissance'), T('Marge opérationnelle & rentabilité'), T('Contribution aux résultats'), T('Marché'), T('Concurrence'), T('Moat'), T('Perspectives')])]),
    T('5. Marché', '🌍', [T('Taille (TAM / SAM / SOM)'), T('Croissance'), T('Tendances'), T('Réglementation'), T('Facteurs cycliques')]),
    T('6. Chaîne de valeur', '🔗', [T('Fournisseurs'), T('Clients & distributeurs'), T('Position de l\'entreprise'), T('Dépendances stratégiques')]),
    T('7. Avantage concurrentiel (moat)', '🏰', [T('Marque'), T('Coûts de changement'), T('Économies d\'échelle'), T('Brevets & technologie'), T('Effet de réseau'), T('Coûts de production'), T('Barrières à l\'entrée')]),
    T('8. Concurrence', '🎯', [T('Concurrents par activité'), T('Parts de marché'), T('Positionnement'), T('Forces & faiblesses'), T('Substituts & risque de remplacement'), T('Conclusion sur la concurrence')]),
    T('9. Perspectives de croissance', '🚀', [T('Moteurs organiques'), T('Acquisitions'), T('Nouveaux marchés'), T('Investissements & innovations'), T('Perspectives par segment')]),
    T('10. Risques', '⚠️', [T('Opérationnels'), T('Financiers'), T('Réglementaires'), T('Géopolitiques'), T('Technologiques'), T('Concurrentiels'), T('Dépendance clients / fournisseurs')]),
    T('11. Management & gouvernance', '👔', [T('Dirigeants & historique'), T('Stratégie'), T('Rémunération'), T('Qualité de l\'exécution'), T('Décisions passées')]),
    T('12. Actionnariat', '🧑‍🤝‍🧑', [T('Principaux actionnaires'), T('Fondateurs'), T('Investisseurs institutionnels'), T('Flottant'), T('Conflits d\'intérêts éventuels')]),
    T('13. Allocation du capital', '💸', [T('Dividendes'), T('Rachats d\'actions'), T('Acquisitions'), T('Désendettement'), T('Investissements'), T('Rendement du capital investi')]),
    T('14. Analyse financière historique', '📈', [T('Chiffre d\'affaires'), T('Marges'), T('Bénéfices'), T('Cash-flow'), T('Dette'), T('Dilution'), T('ROIC / ROE'), T('Ratios financiers')]),
    T('15. Qualité financière', '🔬', [T('Conversion des bénéfices en trésorerie'), T('Besoin en fonds de roulement'), T('Dépenses d\'investissement'), T('Solidité du bilan'), T('Cyclicité')]),
    T('16. Valorisation', '💰', [T('Méthodes adaptées au secteur'), T('Hypothèses'), T('Scénario pessimiste'), T('Scénario central'), T('Scénario optimiste'), T('Valeur intrinsèque & marge de sécurité')]),
    T('17. Wolf Score', '🐺', [T('Critères'), T('Notation'), T('Justification')]),
    T('18. Conclusion', '✅', [T('Points forts'), T('Points faibles'), T('Risques majeurs'), T('Qualité globale'), T('À surveiller'), T('Thèse d\'investissement')]),
    T('Actualités', '📰')]) },
  'wolf-chaine': { id: 'wolf-chaine', nom: 'Chaîne de valeur — 4 maillons', type: 'chaine', builtin: true, tree: T('', '', [
    T('Amont', '⛏️'), T('Transformation', '🏭'), T('Distribution', '🚚'), T('Services & aval', '🛒')]) },
  'vide': { id: 'vide', nom: 'Carte vide', type: 'libre', builtin: true, tree: T('', '', []) }
};

/* ---------- état ---------- */
let D = null, serverOk = false, loadErr = null, storeFile = '';
let dirty = false, saving = false, saveTimer = null, lastSaved = null, saveErr = null, conflict = false, pendingDeleted = [];
const ui = { docId: null, sel: null, video: false, fiche: null, draw: null, modal: null, toast: null, side: true, q: '', open: {}, editing: null, pop: null };
const cam = { x: 0, y: 0, k: 1 };
let pos = {}, els = {}, sizes = {}, tween = null, camTween = null, charts = [];

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => (p || 'n') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const frDate = iso => { if (!iso) return ''; const p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const mediaUrl = f => '/api/atelier/media?f=' + encodeURIComponent(f);
const sectors = () => (typeof GICS_SECTORS !== 'undefined' ? GICS_SECTORS : []);
const sectorLabel = k => { const s = sectors().find(x => x.key === k); return s ? s.label : ''; };
function sectorKeyFromText(txt){
  const t = norm(txt); if (!t) return '';
  const s = sectors().find(x => norm(x.label) === t || x.key === t || (x.match || []).some(m => t.includes(norm(m))));
  return s ? s.key : '';
}
// Seules les balises de mise en forme simples sont gardées (le contenu vient d'un champ éditable, mais on ne fait confiance à rien).
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

/* ---------- modèle ---------- */
const doc = () => D && ui.docId ? D.docs[ui.docId] : null;
const ver = d => { d = d || doc(); if (!d) return null; return d.versions.find(v => v.id === d.cur) || d.versions[d.versions.length - 1]; };
function buildTree(v, t, parent){
  const id = uid('n');
  v.nodes[id] = { id, parent: parent || null, kids: [], titre: t.titre || '', icon: t.icon || '', color: t.color || '', collapsed: !!parent && (t.kids || []).length > 0, blocks: [] };
  (t.kids || []).forEach(k => v.nodes[id].kids.push(buildTree(v, k, id)));
  return id;
}
function treeOf(v, id){ const n = v.nodes[id]; return { titre: n.titre, icon: n.icon, color: n.color, kids: n.kids.filter(k => v.nodes[k] && !v.nodes[k].link).map(k => treeOf(v, k)) }; }
function newVersion(tpl, label){
  const v = { id: uid('v'), label: label || 'Version du ' + frDate(today()), date: today(), mode: 'pieuvre', root: null, nodes: {}, strokes: [] };
  v.root = buildTree(v, tpl.tree, null);
  return v;
}
function touch(){ const d = doc(); if (d) d.updatedAt = new Date().toISOString(); markDirty(); }
function colorOf(v, n){
  let c = n, lvl1 = null;
  while (c){ if (c.color) return c.color; if (c.parent === v.root) lvl1 = c; c = v.nodes[c.parent]; }
  if (lvl1){ const i = v.nodes[v.root].kids.indexOf(lvl1.id); return PALETTE[(i < 0 ? 0 : i) % PALETTE.length]; }
  return PALETTE[0];
}
const depthOf = (v, n) => { let d = 0, c = n; while (c && c.parent){ d++; c = v.nodes[c.parent]; } return d; };
function descendants(v, id, out){ out = out || []; (v.nodes[id] ? v.nodes[id].kids : []).forEach(k => { out.push(k); descendants(v, k, out); }); return out; }
function findCompany(name){
  if (typeof companies === 'undefined' || !name) return null;
  const t = norm(name);
  const key = Object.keys(companies).find(n => norm(n) === t || (typeof fmpDisplayName === 'function' && norm(fmpDisplayName(n)) === t));
  if (!key) return null;
  const h = companies[key], last = h[h.length - 1] || {};
  let logo = last.lienImage || ''; if (!logo && typeof companyLogoUrl === 'function') logo = companyLogoUrl(key) || '';
  return { key, logo, tv: String(last.ticker || '').includes(':') ? last.ticker : (last.tvSymbol || ''), secteur: sectorKeyFromText(last.secteur), sousSecteur: last.sousSecteur || '' };
}

/* ---------- persistance ---------- */
async function load(){
  try { const p = await fetch('/api/ia/ping', { cache: 'no-store' }); const j = await p.json(); serverOk = !!(j && j.ok && j.v >= 12); } catch(e){ serverOk = false; }
  if (!serverOk){ D = null; return; }
  try {
    const r = await fetch('/api/store/load?name=atelier', { cache: 'no-store' }); const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'lecture impossible');
    storeFile = j.file || '';
    D = j.data || { version: 1, revision: 0, docs: {}, templates: {}, trash: [] };
    D.docs = D.docs || {}; D.templates = D.templates || {}; D.trash = D.trash || [];
    loadErr = null; dirty = false; conflict = false; pendingDeleted = [];
  } catch(e){ loadErr = e.message; D = null; }
}
function markDirty(){
  dirty = true; saveErr = null; statusLabel();
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 700);
}
async function save(keepalive){
  if (!serverOk || !D || conflict || !dirty) return;
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
  if (conflict){ t = '⚠ Modifié dans un autre onglet'; c = 'err'; }
  else if (saveErr){ t = '⚠ Non enregistré : ' + saveErr + ' (nouvel essai…)'; c = 'err'; }
  else if (saving || dirty){ t = '… enregistrement'; c = 'wait'; }
  else t = lastSaved ? '💾 Enregistré à ' + lastSaved.toLocaleTimeString('fr-FR') : '💾 Tout est enregistré';
  el.textContent = t; el.className = 'at-status ' + c;
}
window.addEventListener('beforeunload', e => { if (dirty && D && !conflict){ save(true); e.preventDefault(); e.returnValue = ''; } });
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
  if (t.kind === 'doc'){ if (!D.docs[t.data.id]){ D.docs[t.data.id] = t.data; ok = true; } }
  else {
    const d = D.docs[t.docId], v = d && d.versions.find(x => x.id === t.verId);
    if (t.kind === 'version' && d){ d.versions.push(t.data); ok = true; }
    else if (t.kind === 'node' && v){
      const par = v.nodes[t.parent] ? t.parent : v.root;
      t.data.forEach(n => { v.nodes[n.id] = n; });
      t.data[0].parent = par; v.nodes[par].kids.splice(Math.min(t.index, v.nodes[par].kids.length), 0, t.data[0].id); ok = true;
    } else if (t.kind === 'block' && v && v.nodes[t.node]){ v.nodes[t.node].blocks.splice(Math.min(t.index, v.nodes[t.node].blocks.length), 0, t.data); ok = true; }
    else if (t.kind === 'strokes' && v){ v.strokes = t.data.concat(v.strokes || []); ok = true; }
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

/* ---------- actions sur les dossiers ---------- */
function createDoc(o){
  const tpl = D.templates[o.tpl] || BUILTIN[o.tpl] || BUILTIN.vide;
  const c = o.type === 'entreprise' ? findCompany(o.titre) : null;
  const d = { id: uid('d'), type: o.type, titre: o.titre, nom: c ? c.key : '', logo: o.logo || (c ? c.logo : ''), tv: c ? c.tv : '', secteur: o.secteur || (c ? c.secteur : ''), sousSecteur: o.sousSecteur || (c ? c.sousSecteur : ''),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), versions: [], cur: null };
  const v = newVersion(tpl, 'Version 1 — ' + frDate(today()));
  v.nodes[v.root].titre = o.titre;
  d.versions.push(v); d.cur = v.id;
  D.docs[d.id] = d; markDirty();
  return d;
}
function openDoc(id, focusNode){
  if (!D.docs[id]) return;
  ui.docId = id; ui.sel = focusNode || null; ui.fiche = null; ui.draw = null; ui.editing = null; ui.pop = null;
  pos = {}; els = {}; sizes = {};
  renderShell();
  requestAnimationFrame(() => fitAll(false));
}
function deleteDoc(id){
  const d = D.docs[id]; if (!d) return;
  delete D.docs[id]; pendingDeleted.push(id);
  if (ui.docId === id) ui.docId = null;
  trash({ kind: 'doc', data: d }, 'Dossier « ' + d.titre + ' »'); markDirty(); renderShell();
}
function deleteNode(nid){
  const d = doc(), v = ver(); const n = v.nodes[nid]; if (!n || nid === v.root) return;
  const ids = [nid].concat(descendants(v, nid));
  const data = ids.map(i => v.nodes[i]);
  const par = v.nodes[n.parent], index = par.kids.indexOf(nid);
  par.kids.splice(index, 1); ids.forEach(i => { delete v.nodes[i]; });
  ui.sel = n.parent;
  trash({ kind: 'node', docId: d.id, verId: v.id, parent: n.parent, index, data }, 'Branche « ' + (n.titre || 'sans titre') + ' »' + (ids.length > 1 ? ' (' + ids.length + ' nœuds)' : ''));
  touch(); renderMap();
}
// Copie complète d'une branche (sous-branches et contenu des fiches), insérée juste après l'originale. Les liens vers un dossier
// d'entreprise ne sont pas recopiés (un dossier n'apparaît qu'une fois dans une chaîne).
function duplicateNode(nid){
  const v = ver(), src = v.nodes[nid]; if (!src || nid === v.root) return;
  const copy = (id, parent, top) => {
    const o = v.nodes[id], c = JSON.parse(JSON.stringify(o)); c.id = uid('n'); c.parent = parent; c.kids = []; delete c.link;
    (c.blocks || []).forEach(b => { b.id = uid('b'); });
    if (top){ c.titre = (o.titre || '').replace(/\s*\(à dupliquer ⧉\)/, '').replace(/\s+\d+$/, '') + ' ' + (v.nodes[o.parent].kids.length + 1); if (typeof c.y === 'number') c.y += 70; }
    else if (typeof c.y === 'number') c.y += 70;
    v.nodes[c.id] = c;
    o.kids.forEach(k => { if (v.nodes[k] && !v.nodes[k].link) c.kids.push(copy(k, c.id, false)); });
    return c.id;
  };
  const par = v.nodes[src.parent], id = copy(nid, src.parent, true);
  par.kids.splice(par.kids.indexOf(nid) + 1, 0, id);
  ui.sel = id; ui.pop = null; touch(); renderMap();
}
function addNode(parentId, o){
  const v = ver(), p = v.nodes[parentId]; if (!p) return null;
  const id = uid('n');
  const n = v.nodes[id] = Object.assign({ id, parent: parentId, kids: [], titre: '', icon: '', color: '', collapsed: false, blocks: [] }, o || {});
  if (v.mode === 'libre' && pos[parentId]){
    const dir = parentId === v.root ? (p.kids.length % 2 ? -1 : 1) : (pos[parentId].dir || 1);
    n.x = Math.round(pos[parentId].x + dir * 240); n.y = Math.round(pos[parentId].y + (p.kids.length - 0.5) * 60 - 30);
  }
  p.kids.push(id); p.collapsed = false;
  touch(); return n;
}

/* ====================== RENDU GÉNÉRAL ====================== */
function page(){ return $(PAGE_ID); }
function renderShell(){
  const pg = page(); if (!pg) return;
  charts.forEach(c => { try { c.destroy(); } catch(e){} }); charts = [];
  if (!serverOk || !D){
    pg.innerHTML = '<div class="at-off"><h2>🗂 Atelier d\'analyses</h2><p>' + (loadErr ? 'Lecture impossible : ' + esc(loadErr) : 'Le serveur local ne répond pas, ou c\'est une ancienne version.') +
      '</p><p>Ferme l\'appli puis relance le raccourci Bureau <b>« Wolf Analysis »</b>. Rien n\'est modifiable tant que la sauvegarde sur le disque n\'est pas disponible : aucune donnée ne reste seulement en mémoire.</p><button type="button" class="at-btn gold" id="atRetry">Réessayer</button></div>';
    $('atRetry').onclick = onShow.bind(null, true); return;
  }
  const d = doc();
  pg.className = 'page active at-page' + (ui.video ? ' at-video' : '') + (ui.side ? '' : ' at-noside');
  pg.innerHTML = (conflict ? '<div class="at-conflict">⚠ Ce fichier a été modifié depuis un autre onglet : tes dernières modifications ici ne sont pas enregistrées. <button type="button" class="at-btn" id="atReload">Recharger la dernière version</button></div>' : '') +
    '<div class="at-layout"><aside class="at-side" id="atSide">' + sideHtml() + '</aside><section class="at-main" id="atMain">' + (d ? mainHtml(d) : homeHtml()) + '</section></div>' +
    '<div id="atFicheHost"></div><div id="atModalHost"></div>';
  wireShell();
  statusLabel();
  if (d){ els = {}; renderMap(true); if (ui.fiche) renderFiche(false); }
  if (ui.modal) renderModal();
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
  if (libres.length) html += '<div class="at-grp"><div class="at-grp-h">Cartes libres <small>' + libres.length + '</small></div>' + libres.map(row).join('') + '</div>';
  if (!all.length) html = '<p class="at-empty">' + (q ? 'Aucun dossier ne correspond.' : 'Aucun dossier pour l\'instant.') + '</p>';
  return '<div class="at-side-top"><button type="button" class="at-home" data-home>🗂 Atelier d\'analyses</button><div class="at-status" id="atStatus"></div>' +
    '<button type="button" class="at-btn gold wide" data-new>＋ Nouveau dossier</button><input type="search" class="at-search" id="atSearch" placeholder="Rechercher un dossier…" value="' + esc(ui.q) + '"></div><div class="at-tree">' + html + '</div>';
}

/* ---------- accueil ---------- */
function homeHtml(){
  const list = Object.values(D.docs).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const card = d => { const v = ver(d), n = Object.keys(v.nodes).length, nb = Object.values(v.nodes).reduce((s, x) => s + (x.blocks || []).length, 0);
    return '<button type="button" class="at-card" data-open="' + d.id + '">' + docLogo(d, 54) + '<b>' + esc(d.titre) + '</b><span>' + esc(TYPE_LABEL[d.type]) + (d.secteur ? ' · ' + esc(sectorLabel(d.secteur)) : '') + '</span>' +
      '<small>' + n + ' nœuds · ' + nb + ' contenus · ' + d.versions.length + ' version' + (d.versions.length > 1 ? 's' : '') + '</small><small>Modifié le ' + frDate(d.updatedAt) + '</small></button>'; };
  const tpls = Object.values(D.templates);
  return '<div class="at-home-wrap"><div class="at-hero"><h2>Atelier d\'analyses</h2><p>Toutes tes analyses au même endroit : une carte mentale par entreprise, rangée par secteur et par chaîne de valeur. Tout est enregistré automatiquement dans un fichier sur ton ordinateur, avec des copies de secours.</p>' +
    '<div class="at-hero-btns"><button type="button" class="at-btn gold" data-new="entreprise">＋ Analyse d\'entreprise</button><button type="button" class="at-btn" data-new="chaine">＋ Chaîne de valeur</button><button type="button" class="at-btn" data-new="libre">＋ Carte libre</button></div></div>' +
    (list.length ? '<h3 class="at-h3">Dossiers récents</h3><div class="at-cards">' + list.map(card).join('') + '</div>' : '') +
    '<h3 class="at-h3">Mes modèles de structure</h3><div class="at-tpls">' + (tpls.length ? tpls.map(t => '<div class="at-tpl"><b>' + esc(t.nom) + '</b><small>' + esc(TYPE_LABEL[t.type] || '') + ' · ' + countTree(t.tree) + ' branches</small><button type="button" class="at-x" data-deltpl="' + t.id + '" title="Supprimer ce modèle">✕</button></div>').join('')
      : '<p class="at-empty">Aucun modèle personnel. Ouvre un dossier, construis ta structure, puis « 💾 Modèle » : elle sera proposée à chaque nouveau dossier.</p>') + '</div>' +
    '<h3 class="at-h3">Sauvegarde</h3><div class="at-save-box"><p>Fichier : <code>' + esc(storeFile || 'data/mes-portefeuilles/atelier.json') + '</code><br>Copies automatiques : toutes les 10 minutes (300 gardées), une par jour dans <code>Documents\\Wolf Analysis - sauvegardes</code>, et une copie figée chaque mois. Les images sont des fichiers séparés, jamais supprimés.</p>' +
    '<button type="button" class="at-btn" data-export>⬇ Télécharger une copie (.json)</button></div>' +
    '<h3 class="at-h3">Corbeille <small>(' + D.trash.length + ')</small></h3><div class="at-trash">' + (D.trash.length ? D.trash.slice(0, 60).map(t => '<div class="at-trash-row"><span>' + esc(t.label) + '</span><small>' + frDate(t.at) + '</small><button type="button" class="at-btn sm" data-restore="' + t.id + '">↶ Restaurer</button></div>').join('')
      : '<p class="at-empty">Vide. Tout ce que tu supprimes arrive ici et peut être restauré.</p>') + '</div></div>';
}
const countTree = t => (t.kids || []).reduce((s, k) => s + 1 + countTree(k), 0);

/* ---------- barre du dossier ---------- */
function crumbHtml(d){
  const parts = [];
  if (d.secteur) parts.push(esc(sectorLabel(d.secteur)));
  if (d.sousSecteur) parts.push(esc(d.sousSecteur));
  if (d.chaine && D.docs[d.chaine.doc]){
    const cd = D.docs[d.chaine.doc], cv = ver(cd), link = Object.values(cv.nodes).find(n => n.link === d.id), mail = link && cv.nodes[link.parent];
    parts.push('<button type="button" class="at-crumb" data-open="' + cd.id + '">🔗 ' + esc(cd.titre) + '</button>');
    if (mail && mail.id !== cv.root) parts.push(esc(mail.titre));
  }
  return parts.length ? parts.join(' › ') : '<span class="at-faint">Non rangé — ⚙ pour choisir un secteur</span>';
}
function mainHtml(d){
  const v = ver(d);
  const drawBar = ui.draw ? '<div class="at-drawbar">🖌 Dessin sur la carte : ' + ['#F0C877', '#E5636B', '#4A9FE0', '#4FD1A5', '#FFFFFF'].map(c => '<button type="button" class="at-dot' + (ui.draw.c === c ? ' on' : '') + '" style="background:' + c + '" data-dc="' + c + '"></button>').join('') +
    [3, 6, 12].map(w => '<button type="button" class="at-btn sm' + (ui.draw.w === w ? ' on' : '') + '" data-dw="' + w + '">' + (w === 3 ? 'Fin' : w === 6 ? 'Moyen' : 'Épais') + '</button>').join('') +
    '<button type="button" class="at-btn sm" data-dundo>↶ Dernier trait</button><button type="button" class="at-btn sm" data-dclear>Tout effacer</button><button type="button" class="at-btn sm gold" data-ddone>Terminé</button></div>' : '';
  return '<div class="at-top"><button type="button" class="at-btn ico" data-side title="Afficher / masquer le répertoire">☰</button>' + docLogo(d, 30) +
    '<div class="at-top-t"><b>' + esc(d.titre) + '</b><span>' + crumbHtml(d) + '</span></div>' +
    '<select class="at-sel" id="atVer" title="Version affichée">' + d.versions.map(x => '<option value="' + x.id + '"' + (x.id === v.id ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('') + '</select>' +
    '<button type="button" class="at-btn sm" data-newver title="Copie complète de cette version, que tu peux modifier sans toucher à l\'ancienne">＋ Version</button>' +
    '<span class="at-seg"><button type="button" class="' + (v.mode !== 'libre' ? 'on' : '') + '" data-mode="pieuvre" title="Branches rangées automatiquement">Pieuvre</button><button type="button" class="' + (v.mode === 'libre' ? 'on' : '') + '" data-mode="libre" title="Tu places chaque nœud à la main">Libre</button></span>' +
    '<button type="button" class="at-btn sm" data-exp="1">Tout déplier</button><button type="button" class="at-btn sm" data-exp="0">Tout replier</button><button type="button" class="at-btn sm" data-fit title="Voir toute la carte (touche F)">⤢ Vue d\'ensemble</button>' +
    '<button type="button" class="at-btn sm" data-draw title="Dessiner sur la carte (enregistré avec elle)">🖌 Dessin</button><button type="button" class="at-btn sm" data-savetpl title="Garder cette structure pour la réutiliser">💾 Modèle</button>' +
    '<button type="button" class="at-btn sm" data-props title="Nom, secteur, logo, version">⚙</button><button type="button" class="at-btn sm gold" data-video title="Masque tout l\'habillage pour la vidéo">🎬 Mode vidéo</button></div>' + drawBar +
    '<div class="at-view' + (ui.draw ? ' drawing' : '') + '" id="atView"><div class="at-world" id="atWorld"><svg class="at-svg" id="atSvg"><g id="atStrokes"></g><g id="atEdges"></g></svg><div id="atNodes"></div></div>' +
    '<div class="at-vbar"><button type="button" data-zoom="-1">−</button><button type="button" data-fit>⤢</button><button type="button" data-zoom="1">＋</button>' + (ui.video ? '<button type="button" data-exp="0" title="Tout replier">⏮</button><button type="button" class="gold" data-video>✕ Quitter le mode vidéo</button>' : '') + '</div>' +
    '<div class="at-hint">' + (ui.video ? 'Clic sur une branche : elle se déplie · 📄 : ouvre la fiche · F : vue d\'ensemble' : 'Clic : sélectionner · Double-clic : ouvrir la fiche · Tab : nouvelle branche · Entrée : même niveau · F2 : renommer · Suppr : corbeille') + '</div></div>';
}

/* ====================== CARTE MENTALE ====================== */
function visKids(v, n){ return n.collapsed ? [] : n.kids.map(i => v.nodes[i]).filter(Boolean); }
function visibleSet(v){ const out = []; const go = n => { out.push(n); visKids(v, n).forEach(go); }; if (v.nodes[v.root]) go(v.nodes[v.root]); return out; }
function autoLayout(v, sz, rightOnly){
  const P = {}, H = {}, HG = 64, VG = 14, VG1 = 26;
  const s = id => sz[id] || { w: 170, h: 40 };
  const sub = n => { let t = 0; visKids(v, n).forEach((k, i) => { t += sub(k) + (i ? VG : 0); }); return (H[n.id] = Math.max(s(n.id).h, t)); };
  const place = (n, x, y, dir) => { P[n.id] = { x, y, dir }; const ks = visKids(v, n); if (!ks.length) return;
    let tot = 0; ks.forEach((k, i) => { tot += H[k.id] + (i ? VG : 0); });
    let yy = y - tot / 2;
    ks.forEach(k => { place(k, x + dir * (s(n.id).w / 2 + HG + s(k.id).w / 2), yy + H[k.id] / 2, dir); yy += H[k.id] + VG; }); };
  const root = v.nodes[v.root]; P[root.id] = { x: 0, y: 0, dir: 0 };
  const ks = visKids(v, root), half = rightOnly ? ks.length : Math.ceil(ks.length / 2);
  [[ks.slice(0, half), 1], [ks.slice(half), -1]].forEach(([arr, dir]) => {
    let tot = 0; arr.forEach((k, i) => { tot += sub(k) + (i ? VG1 : 0); });
    let yy = -tot / 2;
    arr.forEach(k => { place(k, dir * (s(root.id).w / 2 + HG + 24 + s(k.id).w / 2), yy + H[k.id] / 2, dir); yy += H[k.id] + VG1; });
  });
  return P;
}
function layout(v, d){
  const A = autoLayout(v, sizes, d.type === 'chaine');
  if (v.mode !== 'libre') return A;
  const P = {};
  visibleSet(v).forEach(n => {
    const par = v.nodes[n.parent];
    if (typeof n.x !== 'number'){ n.x = Math.round(A[n.id].x); n.y = Math.round(A[n.id].y); }
    P[n.id] = { x: n.x, y: n.y, dir: par ? (n.x >= (par.x || 0) ? 1 : -1) : 0 };
  });
  return P;
}
function nodeHtml(d, v, n){
  const isRoot = n.id === v.root, link = n.link && D.docs[n.link], nb = (n.blocks || []).length, hidden = n.collapsed ? descendants(v, n.id).length : 0;
  const titre = link ? link.titre : n.titre;
  let h = '';
  if (isRoot) h += d.logo ? '<img class="at-root-logo" src="' + esc(d.logo) + '" alt="" draggable="false" onerror="this.style.display=\'none\'">' : '<span class="at-root-ini">' + esc(d.type === 'chaine' ? '🔗' : (d.titre || '?').charAt(0).toUpperCase()) + '</span>';
  else if (link) h += docLogo(link, 26);
  else if (n.icon) h += '<span class="at-ico">' + esc(n.icon) + '</span>';
  h += ui.editing === n.id ? '<span class="at-t" contenteditable="true" spellcheck="false" id="atEdit">' + esc(titre) + '</span>' : '<span class="at-t">' + (esc(titre) || '<i>Sans titre</i>') + '</span>';
  if (nb) h += '<button type="button" class="at-badge" data-act="fiche" title="Ouvrir la fiche (' + nb + ' contenu' + (nb > 1 ? 's' : '') + ')">📄 ' + nb + '</button>';
  if (link) h += '<button type="button" class="at-badge" data-act="golink" title="Ouvrir le dossier de cette entreprise">📁</button>';
  if (n.kids.length) h += '<button type="button" class="at-chev" data-act="toggle" title="' + (n.collapsed ? 'Déplier' : 'Replier') + '">' + (n.collapsed ? '＋' + hidden : '−') + '</button>';
  if (ui.sel === n.id && !ui.video && !ui.draw && ui.editing !== n.id){
    const i = isRoot ? -1 : v.nodes[n.parent].kids.indexOf(n.id);
    h += '<div class="at-actions"><button type="button" data-act="add" title="Nouvelle branche (Tab)">＋ Branche</button>' + (d.type === 'chaine' ? '<button type="button" data-act="addco" title="Rattacher un dossier d\'entreprise à ce maillon">＋ Entreprise</button>' : '') +
      '<button type="button" data-act="fiche" title="Ouvrir la fiche (double-clic)">📄 Fiche</button>' + (link ? '' : '<button type="button" data-act="rename" title="Renommer (F2)">✏</button>') + '<button type="button" data-act="style" title="Icône et couleur">🎨</button>' +
      (isRoot || link ? '' : '<button type="button" data-act="dup" title="Dupliquer cette branche (structure et contenu)">⧉</button>') +
      (isRoot ? '' : (v.mode !== 'libre' ? '<button type="button" data-act="up"' + (i <= 0 ? ' disabled' : '') + '>↑</button><button type="button" data-act="down"' + (i >= v.nodes[n.parent].kids.length - 1 ? ' disabled' : '') + '>↓</button>' : '') + '<button type="button" data-act="del" title="Mettre à la corbeille (Suppr)">🗑</button>') + '</div>';
    if (ui.pop === 'style') h += '<div class="at-pop" data-nopan><div class="at-pop-colors">' + PALETTE.map(c => '<button type="button" class="at-dot' + (n.color === c ? ' on' : '') + '" style="background:' + c + '" data-color="' + c + '"></button>').join('') + '<button type="button" class="at-btn sm" data-color="">Auto</button></div>' +
      '<div class="at-pop-icons">' + ICONS.map(i2 => '<button type="button" data-icon="' + i2 + '">' + i2 + '</button>').join('') + '<button type="button" data-icon="">∅</button></div></div>';
    if (ui.pop === 'addco') h += '<div class="at-pop" data-nopan><input type="search" class="at-search" id="atCoQ" placeholder="Chercher un dossier d\'entreprise…"><div id="atCoList" class="at-colist"></div></div>';
  }
  return h;
}
function renderMap(instant){
  const d = doc(), v = ver(); const host = $('atNodes'); if (!d || !v || !host) return;
  const vis = visibleSet(v), ids = new Set(vis.map(n => n.id));
  vis.forEach(n => {
    let el = els[n.id];
    if (!el || !el.isConnected){ el = els[n.id] = document.createElement('div'); el.dataset.id = n.id; host.appendChild(el); el._new = true; }
    el._leaving = false;
    const dp = depthOf(v, n);
    el.className = 'at-node l' + Math.min(dp, 3) + (n.id === v.root ? ' root' : '') + (ui.sel === n.id ? ' sel' : '') + (n.link ? ' link' : '') + ((n.blocks || []).length ? ' has' : '') + (n.free ? ' free' : '');
    el.style.setProperty('--c', colorOf(v, n));
    el.innerHTML = nodeHtml(d, v, n);
    sizes[n.id] = { w: el.offsetWidth, h: el.offsetHeight };
  });
  const target = layout(v, d);
  Object.keys(els).forEach(id => {
    if (ids.has(id)) return;
    const el = els[id]; if (!el) return;
    if (instant || !pos[id]){ el.remove(); delete els[id]; delete pos[id]; return; }
    let a = v.nodes[id] && v.nodes[v.nodes[id].parent]; while (a && !ids.has(a.id)) a = v.nodes[a.parent];
    el._leaving = true; target[id] = { x: a ? target[a.id].x : 0, y: a ? target[a.id].y : 0, dir: pos[id].dir, o: 0 };
  });
  const from = {};
  Object.keys(target).forEach(id => {
    const el = els[id];
    if (el && el._new){ const par = v.nodes[id] && v.nodes[id].parent, pp = par && (pos[par] || target[par]); from[id] = { x: pp ? pp.x : target[id].x, y: pp ? pp.y : target[id].y, o: instant ? 1 : 0 }; el._new = false; }
    else from[id] = pos[id] ? { x: pos[id].x, y: pos[id].y, o: pos[id].o == null ? 1 : pos[id].o } : { x: target[id].x, y: target[id].y, o: 1 };
    if (target[id].o == null) target[id].o = 1;
  });
  cancelAnimationFrame(tween);
  const t0 = performance.now(), dur = instant ? 0 : 380;
  const step = now => {
    const p = dur ? Math.min(1, (now - t0) / dur) : 1, e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    Object.keys(target).forEach(id => { pos[id] = { x: from[id].x + (target[id].x - from[id].x) * e, y: from[id].y + (target[id].y - from[id].y) * e, o: from[id].o + (target[id].o - from[id].o) * e, dir: target[id].dir }; });
    paint(v);
    if (p < 1) tween = requestAnimationFrame(step);
    else Object.keys(els).forEach(id => { if (els[id]._leaving){ els[id].remove(); delete els[id]; delete pos[id]; } });
  };
  step(t0); if (dur) tween = requestAnimationFrame(step);
  drawStrokes(v);
  const ed = $('atEdit'); if (ed){ ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  const q = $('atCoQ'); if (q){ q.oninput = fillCoList; fillCoList(); q.focus(); }
}
function paint(v){
  let path = '';
  Object.keys(pos).forEach(id => {
    const el = els[id]; if (!el) return; const p = pos[id], s = sizes[id] || { w: 0, h: 0 };
    el.style.transform = 'translate(' + (p.x - s.w / 2).toFixed(1) + 'px,' + (p.y - s.h / 2).toFixed(1) + 'px)';
    el.style.opacity = p.o;
    const n = v.nodes[id]; if (!n || !n.parent || n.free || !pos[n.parent]) return;
    const pp = pos[n.parent], ps = sizes[n.parent] || { w: 0, h: 0 }, dir = v.mode === 'libre' ? (p.x >= pp.x ? 1 : -1) : (p.dir || 1);
    const x1 = pp.x + dir * ps.w / 2, y1 = pp.y, x2 = p.x - dir * s.w / 2, y2 = p.y, mx = (x1 + x2) / 2;
    path += '<path d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' C' + mx.toFixed(1) + ' ' + y1.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + y2.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '" stroke="' + colorOf(v, n) + '" stroke-width="' + (n.parent === v.root ? 3.2 : 2) + '" opacity="' + (p.o * 0.75).toFixed(2) + '"/>';
  });
  const g = $('atEdges'); if (g) g.innerHTML = path;
}
function drawStrokes(v){ const g = $('atStrokes'); if (g) g.innerHTML = (v.strokes || []).map(s => '<path d="' + s.d + '" stroke="' + esc(s.c) + '" stroke-width="' + (+s.w || 4) + '"/>').join(''); }
function applyCam(){
  const w = $('atWorld'), vw = $('atView'); if (!w || !vw) return;
  w.style.transform = 'translate(' + (vw.clientWidth / 2 + cam.x) + 'px,' + (vw.clientHeight / 2 + cam.y) + 'px) scale(' + cam.k + ')';
  w.style.setProperty('--ik', 1 / cam.k);
}
function camTo(x, y, k, animate){
  cancelAnimationFrame(camTween);
  if (!animate){ cam.x = x; cam.y = y; cam.k = k; applyCam(); return; }
  const a = { x: cam.x, y: cam.y, k: cam.k }, t0 = performance.now(), dur = 520;
  const step = now => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    cam.x = a.x + (x - a.x) * e; cam.y = a.y + (y - a.y) * e; cam.k = a.k + (k - a.k) * e; applyCam(); if (p < 1) camTween = requestAnimationFrame(step); };
  camTween = requestAnimationFrame(step);
}
function bbox(ids, v){
  const T2 = layout(v, doc()); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  ids.forEach(id => { const p = T2[id], s = sizes[id]; if (!p || !s) return; x0 = Math.min(x0, p.x - s.w / 2); x1 = Math.max(x1, p.x + s.w / 2); y0 = Math.min(y0, p.y - s.h / 2); y1 = Math.max(y1, p.y + s.h / 2); });
  return x0 > x1 ? null : { x0, y0, x1, y1 };
}
function fitBox(b, animate, maxK){
  const vw = $('atView'); if (!vw || !b) return;
  const pad = 70, k = Math.max(0.15, Math.min(maxK || 1.15, (vw.clientWidth - pad * 2) / Math.max(60, b.x1 - b.x0), (vw.clientHeight - pad * 2) / Math.max(60, b.y1 - b.y0)));
  camTo(-(b.x0 + b.x1) / 2 * k, -(b.y0 + b.y1) / 2 * k, k, animate);
}
function fitAll(animate){ const v = ver(); if (v) fitBox(bbox(visibleSet(v).map(n => n.id), v), animate !== false); }
// Après avoir déplié une branche : la caméra glisse pour montrer la branche et ses enfants, sans zoomer plus qu'avant.
function focusBranch(id){
  const v = ver(), n = v.nodes[id]; if (!n) return;
  const b = bbox([id].concat(visKids(v, n).map(k => k.id)).concat(n.parent ? [n.parent] : []), v), vw = $('atView'); if (!b || !vw) return;
  const k = cam.k, sx0 = vw.clientWidth / 2 + cam.x + b.x0 * k, sx1 = vw.clientWidth / 2 + cam.x + b.x1 * k, sy0 = vw.clientHeight / 2 + cam.y + b.y0 * k, sy1 = vw.clientHeight / 2 + cam.y + b.y1 * k;
  if (sx0 > 40 && sy0 > 40 && sx1 < vw.clientWidth - 40 && sy1 < vw.clientHeight - 40) return;
  if ((b.x1 - b.x0) * k > vw.clientWidth - 80 || (b.y1 - b.y0) * k > vw.clientHeight - 80) fitBox(b, true, k); else camTo(-(b.x0 + b.x1) / 2 * k, -(b.y0 + b.y1) / 2 * k, k, true);
}
function toggle(id){
  const v = ver(), n = v.nodes[id]; if (!n || !n.kids.length) return;
  n.collapsed = !n.collapsed; touch(); renderMap();
  if (!n.collapsed) setTimeout(() => focusBranch(id), 60);
}
function setExpanded(open){
  const v = ver(); Object.values(v.nodes).forEach(n => { n.collapsed = !open && n.kids.length > 0; });
  touch(); renderMap(); setTimeout(() => fitAll(true), 400);
}
function setMode(m){
  const v = ver(), d = doc(); if (v.mode === m) return;
  if (m === 'libre'){
    // placement de départ = le rangement automatique, toutes branches dépliées (les nœuds jamais mesurés prennent une taille type)
    const saved = {}; Object.values(v.nodes).forEach(n => { saved[n.id] = n.collapsed; n.collapsed = false; });
    const A = autoLayout(v, sizes, d.type === 'chaine');
    Object.values(v.nodes).forEach(n => { n.collapsed = saved[n.id]; if (typeof n.x !== 'number' && A[n.id]){ n.x = Math.round(A[n.id].x); n.y = Math.round(A[n.id].y); } });
  }
  v.mode = m; touch(); renderShell(); requestAnimationFrame(() => fitAll(false));
}
function fillCoList(){
  const box = $('atCoList'), q = norm(($('atCoQ') || {}).value); if (!box) return;
  const v = ver(), used = new Set(Object.values(v.nodes).map(n => n.link).filter(Boolean));
  const list = Object.values(D.docs).filter(x => x.type === 'entreprise' && !used.has(x.id) && (!q || norm(x.titre).includes(q))).slice(0, 12);
  box.innerHTML = list.map(x => '<button type="button" data-linkdoc="' + x.id + '">' + docLogo(x, 20) + esc(x.titre) + '</button>').join('') + '<button type="button" class="new" data-linknew>＋ Créer un nouveau dossier d\'entreprise' + (q ? ' « ' + esc($('atCoQ').value.trim()) + ' »' : '') + '</button>';
}
function linkCompany(parentId, target){
  const d = doc(); const n = addNode(parentId, { link: target.id });
  target.chaine = { doc: d.id, node: n.id }; if (!target.secteur && d.secteur) target.secteur = d.secteur;
  ui.pop = null; ui.sel = n.id; touch(); renderShell();
}
function commitEdit(){
  const ed = $('atEdit'); if (!ed || !ui.editing) return;
  const v = ver(), n = v.nodes[ui.editing], txt = ed.textContent.replace(/\s+/g, ' ').trim();
  ui.editing = null;
  if (n && n.titre !== txt){ n.titre = txt; if (n.id === v.root && txt){ doc().titre = txt; } touch(); }
  if (n && n.id === v.root) renderShell(); else renderMap();
}

/* ---------- événements de la carte ---------- */
function nodeAction(act, id){
  const v = ver(), d = doc(), n = v.nodes[id]; if (!n) return;
  if (act === 'toggle') return toggle(id);
  if (act === 'fiche') return openFiche(id);
  if (act === 'golink') return n.link && openDoc(n.link);
  if (act === 'add'){ const c = addNode(id, {}); ui.sel = c.id; ui.editing = c.id; ui.pop = null; renderMap(); setTimeout(() => focusBranch(id), 60); return; }
  if (act === 'rename'){ ui.editing = id; ui.pop = null; return renderMap(); }
  if (act === 'style' || act === 'addco'){ ui.pop = ui.pop === act ? null : act; return renderMap(); }
  if (act === 'del') return deleteNode(id);
  if (act === 'dup') return duplicateNode(id);
  if (act === 'up' || act === 'down'){ const ks = v.nodes[n.parent].kids, i = ks.indexOf(id), j = i + (act === 'up' ? -1 : 1); if (j < 0 || j >= ks.length) return; ks.splice(i, 1); ks.splice(j, 0, id); touch(); return renderMap(); }
}
function wireMap(){
  const view = $('atView'); if (!view) return;
  let drag = null;
  const world = e => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left - view.clientWidth / 2 - cam.x) / cam.k, y: (e.clientY - r.top - view.clientHeight / 2 - cam.y) / cam.k }; };
  view.addEventListener('wheel', e => {
    if (e.target.closest('[data-nopan]')) return;
    e.preventDefault(); cancelAnimationFrame(camTween);
    const r = view.getBoundingClientRect(), px = e.clientX - r.left - view.clientWidth / 2, py = e.clientY - r.top - view.clientHeight / 2;
    const k2 = Math.max(0.12, Math.min(3, cam.k * Math.exp(-e.deltaY * 0.0015)));
    cam.x = px - (px - cam.x) * k2 / cam.k; cam.y = py - (py - cam.y) * k2 / cam.k; cam.k = k2; applyCam();
  }, { passive: false });
  view.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.at-vbar,[data-nopan],button,[contenteditable="true"]')) return;
    if (ui.editing) commitEdit();
    const v = ver();
    if (ui.draw){ const p = world(e); drag = { kind: 'draw', pts: [p] }; try { view.setPointerCapture(e.pointerId); } catch(err){ /* pointeur déjà relâché */ } return; }
    const nel = e.target.closest('.at-node');
    drag = { kind: nel ? 'node' : 'pan', id: nel && nel.dataset.id, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    if (nel && v.mode === 'libre' && !ui.video){ const ids = [drag.id].concat(descendants(v, drag.id)); drag.start = ids.map(i => ({ n: v.nodes[i], x: v.nodes[i].x, y: v.nodes[i].y })); }
    try { view.setPointerCapture(e.pointerId); } catch(err){ /* pointeur déjà relâché */ }
  });
  view.addEventListener('pointermove', e => {
    if (!drag) return;
    const v = ver();
    if (drag.kind === 'draw'){ const p = world(e), l = drag.pts[drag.pts.length - 1]; if (Math.hypot(p.x - l.x, p.y - l.y) * cam.k < 2) return; drag.pts.push(p);
      const g = $('atStrokes'); let live = g.querySelector('.live'); if (!live){ live = document.createElementNS('http://www.w3.org/2000/svg', 'path'); live.setAttribute('class', 'live'); g.appendChild(live); }
      live.setAttribute('d', 'M' + drag.pts.map(q => q.x.toFixed(0) + ' ' + q.y.toFixed(0)).join(' L')); live.setAttribute('stroke', ui.draw.c); live.setAttribute('stroke-width', ui.draw.w); return; }
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true; cancelAnimationFrame(camTween);
    if (drag.kind === 'node' && drag.start){
      drag.start.forEach(s => { if (typeof s.x === 'number'){ s.n.x = Math.round(s.x + dx / cam.k); s.n.y = Math.round(s.y + dy / cam.k); if (pos[s.n.id]){ pos[s.n.id].x = s.n.x; pos[s.n.id].y = s.n.y; } } });
      paint(v);
    } else { cam.x = drag.cx + dx; cam.y = drag.cy + dy; applyCam(); }
  });
  const up = e => {
    if (!drag) return; const g = drag; drag = null;
    const v = ver();
    if (g.kind === 'draw'){ if (g.pts.length > 1){ v.strokes = v.strokes || []; v.strokes.push({ c: ui.draw.c, w: ui.draw.w, d: 'M' + g.pts.map(q => q.x.toFixed(0) + ' ' + q.y.toFixed(0)).join(' L') }); touch(); } drawStrokes(v); return; }
    if (g.moved){ if (g.kind === 'node' && g.start) touch(); return; }
    if (g.kind === 'pan'){ if (ui.sel || ui.pop){ ui.sel = null; ui.pop = null; renderMap(); } return; }
    const n = v.nodes[g.id]; if (!n) return;
    if (ui.video){ if (n.kids.length) toggle(n.id); else if (n.link) openDoc(n.link); else openFiche(n.id); return; }
    if (ui.sel !== n.id || ui.pop){ ui.sel = n.id; ui.pop = null; renderMap(); }
  };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  view.addEventListener('dblclick', e => { const nel = e.target.closest('.at-node'); if (nel && !ui.video && !ui.draw && !e.target.closest('button,[contenteditable="true"],[data-nopan]')) openFiche(nel.dataset.id); });
  view.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const nel = b.closest('.at-node'), id = nel && nel.dataset.id, v = ver();
    if (b.dataset.act && id) return nodeAction(b.dataset.act, id);
    if (id && b.dataset.color !== undefined){ v.nodes[id].color = b.dataset.color; touch(); return renderMap(); }
    if (id && b.dataset.icon !== undefined){ v.nodes[id].icon = b.dataset.icon; touch(); return renderMap(); }
    if (id && b.dataset.linkdoc) return linkCompany(id, D.docs[b.dataset.linkdoc]);
    if (id && b.dataset.linknew !== undefined){ const name = ($('atCoQ').value || '').trim(); if (!name){ $('atCoQ').focus(); return; } const nd = createDoc({ type: 'entreprise', titre: name, tpl: 'wolf-entreprise', secteur: doc().secteur }); return linkCompany(id, nd); }
    if (b.dataset.zoom){ const k = Math.max(0.12, Math.min(3, cam.k * (b.dataset.zoom === '1' ? 1.25 : 0.8))); return camTo(cam.x * k / cam.k, cam.y * k / cam.k, k, true); }
  });
  view.addEventListener('keydown', e => { if (e.target.id === 'atEdit'){ if (e.key === 'Enter'){ e.preventDefault(); commitEdit(); } else if (e.key === 'Escape'){ e.preventDefault(); ui.editing = null; renderMap(); } e.stopPropagation(); } });
  view.addEventListener('focusout', e => { if (e.target.id === 'atEdit') setTimeout(() => { if (ui.editing && document.activeElement !== $('atEdit')) commitEdit(); }, 0); });
  applyCam();
}
document.addEventListener('keydown', e => {
  const pg = page(); if (!pg || !pg.classList.contains('active') || !doc()) return;
  if (e.key === 'Escape'){ if (ui.light){ closeLight(); return; } if (ui.modal){ ui.modal = null; renderModal(); return; } if (ui.fiche){ closeFiche(); return; } if (ui.video && !document.querySelector('.stylo-on')){ ui.video = false; renderShell(); requestAnimationFrame(() => fitAll(false)); return; } }
  const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (ui.fiche || ui.modal || e.ctrlKey || e.metaKey || e.altKey) return;
  const v = ver();
  if (e.key === 'f' || e.key === 'F'){ e.preventDefault(); return fitAll(true); }
  if (ui.video || !ui.sel || !v.nodes[ui.sel]) return;
  const n = v.nodes[ui.sel];
  if (e.key === 'Tab'){ e.preventDefault(); nodeAction('add', n.id); }
  else if (e.key === 'Enter'){ e.preventDefault(); nodeAction('add', n.parent || n.id); }
  else if (e.key === 'F2'){ e.preventDefault(); if (!n.link) nodeAction('rename', n.id); }
  else if (e.key === 'Delete'){ e.preventDefault(); deleteNode(n.id); }
  else if (e.key === ' '){ e.preventDefault(); toggle(n.id); }
});

/* ====================== FICHE D'UN NŒUD ====================== */
function ficheNode(){ const v = ver(); return v && ui.fiche ? v.nodes[ui.fiche] : null; }
function openFiche(id){
  const v = ver(), n = v.nodes[id]; if (!n) return;
  if (n.link && D.docs[n.link] && ui.video) return openDoc(n.link);
  const el = els[id]; ui.ficheFrom = el ? el.getBoundingClientRect() : null;
  ui.fiche = id; ui.sel = id; ui.pop = null; renderFiche(true);
}
function closeFiche(){
  flushFiche(); const host = $('atFicheHost'), f = host && host.firstElementChild;
  charts.forEach(c => { try { c.destroy(); } catch(e){} }); charts = [];
  ui.fiche = null;
  if (f){ f.classList.remove('on'); setTimeout(() => { if (!ui.fiche) host.innerHTML = ''; }, 260); }
  renderMap();
}
function pathTo(v, n){ const out = []; let c = v.nodes[n.parent]; while (c){ out.unshift(c.titre || (c.link && D.docs[c.link] ? D.docs[c.link].titre : '')); c = v.nodes[c.parent]; } return out.filter(Boolean); }
function blockHtml(b, i, n, ro){
  const lbl = { texte: '📝 Texte', actu: '📰 Actualité', image: '🖼 Images', tv: '📡 Chiffres en direct', graph: '📈 Graphique' }[b.type] || '';
  let body = '';
  if (b.type === 'tv') body = '<div class="at-tv" data-tv="' + b.id + '">' + tvTiles(b.snap, b.snapAt) + '</div>';
  else if (b.type === 'graph') body = (ro ? '' : '<select class="at-sel" data-metric>' + Object.keys(GRAPHS).map(k => '<option value="' + k + '"' + (b.metric === k ? ' selected' : '') + '>' + esc(GRAPHS[k][0]) + '</option>').join('') + '</select>') + '<div class="at-graph"><canvas data-graph="' + b.id + '"></canvas></div>';
  else {
    if (b.type === 'actu') body += ro ? (b.source ? '<div class="at-src">Source : ' + (/^https?:\/\//i.test(b.source) ? '<a href="' + esc(b.source) + '" target="_blank" rel="noopener">' + esc(b.source.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) + '</a>' : esc(b.source)) + '</div>' : '')
      : '<input type="text" class="at-in" data-f="source" placeholder="Source (nom ou lien)" value="' + esc(b.source || '') + '">';
    if (!ro) body += '<div class="at-rt" data-nopan><button type="button" data-cmd="bold" title="Gras"><b>G</b></button><button type="button" data-cmd="italic" title="Italique"><i>I</i></button><button type="button" data-cmd="underline" title="Souligné"><u>S</u></button><button type="button" data-cmd="hilite" title="Surligner">🖍</button><button type="button" data-cmd="h2" title="Titre">T</button><button type="button" data-cmd="insertUnorderedList" title="Liste">•</button><button type="button" data-cmd="link" title="Lien">🔗</button><button type="button" data-cmd="removeFormat" title="Retirer la mise en forme">⌫</button></div>';
    if (!ro || b.html) body += '<div class="at-text" ' + (ro ? '' : 'contenteditable="true" data-ph="' + (b.type === 'image' ? 'Commentaire (facultatif)…' : 'Écris ici… (Ctrl+V pour coller une image)') + '"') + '>' + clean(b.html) + '</div>';
    body += '<div class="at-imgs">' + (b.imgs || []).map((im, k) => '<figure class="at-img"><img src="' + esc(mediaUrl(im.f)) + '" alt="" data-light="' + esc(im.f) + '" loading="lazy">' +
      (ro ? (im.leg ? '<figcaption>' + esc(im.leg) + '</figcaption>' : '') : '<input type="text" class="at-in" data-leg="' + k + '" placeholder="Légende" value="' + esc(im.leg || '') + '"><button type="button" class="at-x" data-rmimg="' + k + '" title="Retirer l\'image de ce bloc (le fichier est gardé)">✕</button>') + '</figure>').join('') +
      (ro ? '' : '<button type="button" class="at-addimg" data-addimg>＋ Image</button>') + '</div>';
  }
  const head = ro ? '<div class="at-bhead ro">' + (b.date && b.type !== 'tv' && b.type !== 'graph' ? '<span class="at-date">' + frDate(b.date) + '</span>' : '') + (b.titre ? '<b>' + esc(b.titre) + '</b>' : '') + '</div>'
    : '<div class="at-bhead"><span class="at-btype">' + lbl + '</span><input type="date" class="at-in date" data-f="date" value="' + esc(b.date || '') + '"><input type="text" class="at-in titre" data-f="titre" placeholder="Titre (facultatif)" value="' + esc(b.titre || '') + '">' +
      '<span class="at-btools"><button type="button" data-bw title="Largeur : pleine ou moitié">' + (b.half ? '◧ ½' : '▭ 1') + '</button><button type="button" data-bup' + (i ? '' : ' disabled') + '>↑</button><button type="button" data-bdown' + (i < n.blocks.length - 1 ? '' : ' disabled') + '>↓</button><button type="button" data-bdel title="Mettre à la corbeille">🗑</button></span></div>';
  return '<article class="at-block t-' + b.type + (b.half ? ' half' : '') + '" data-b="' + b.id + '" style="--i:' + i + '">' + head + body + '</article>';
}
function renderFiche(animate){
  const host = $('atFicheHost'), d = doc(), v = ver(), n = ficheNode(); if (!host || !n){ if (host) host.innerHTML = ''; return; }
  const ro = ui.video, link = n.link && D.docs[n.link], titre = link ? link.titre : n.titre, sc = host.querySelector('.at-fiche-body'), st = sc ? sc.scrollTop : 0;
  charts.forEach(c => { try { c.destroy(); } catch(e){} }); charts = [];
  host.innerHTML = '<div class="at-fiche' + (animate ? '' : ' on') + (ro ? ' ro' : '') + '" style="--c:' + colorOf(v, n) + '"><div class="at-fiche-in"><header class="at-fiche-head">' +
    (n.id === v.root ? docLogo(d, 44) : (n.icon ? '<span class="at-fiche-ico">' + esc(n.icon) + '</span>' : '')) + '<div><small>' + esc([d.titre].concat(pathTo(v, n).slice(1)).join(' › ')) + '</small><h2>' + (esc(titre) || 'Sans titre') + '</h2></div>' +
    (link ? '<button type="button" class="at-btn" data-golink>📁 Ouvrir le dossier</button>' : '') + '<button type="button" class="at-btn ico" data-fclose title="Fermer (Échap)">✕</button></header>' +
    (ro ? '' : '<div class="at-fiche-bar"><button type="button" class="at-btn sm" data-addb="texte">＋ Texte</button><button type="button" class="at-btn sm" data-addb="image">＋ Images</button><button type="button" class="at-btn sm" data-addb="actu">＋ Actualité datée</button>' +
      '<button type="button" class="at-btn sm" data-addb="tv">＋ Chiffres en direct</button><button type="button" class="at-btn sm" data-addb="graph">＋ Graphique</button><button type="button" class="at-btn sm" data-sortb title="Du plus récent au plus ancien">⇅ Trier par date</button><span class="at-faint">Colle (Ctrl+V) ou glisse une image n\'importe où</span></div>') +
    '<div class="at-fiche-body"><div class="at-blocks">' + (n.blocks.length ? n.blocks.map((b, i) => blockHtml(b, i, n, ro)).join('') : '<p class="at-empty big">' + (ro ? 'Rien ici pour l\'instant.' : 'Fiche vide. Ajoute un texte, une image, une actualité datée, des chiffres en direct ou un graphique.') + '</p>') + '</div></div></div></div>';
  const f = host.firstElementChild;
  if (animate){ const r = ui.ficheFrom; if (r){ f.style.setProperty('--ox', (r.left + r.width / 2) + 'px'); f.style.setProperty('--oy', (r.top + r.height / 2) + 'px'); } setTimeout(() => f.classList.add('on'), 30); }
  else host.querySelector('.at-fiche-body').scrollTop = st;
  wireFiche(f, n);
  n.blocks.forEach(b => { if (b.type === 'tv') refreshTv(b); if (b.type === 'graph') drawGraph(b); });
}
function flushFiche(){
  const n = ficheNode(), host = $('atFicheHost'); if (!n || !host || ui.video) return;
  let ch = false;
  host.querySelectorAll('.at-block').forEach(el => { const b = n.blocks.find(x => x.id === el.dataset.b), t = el.querySelector('.at-text[contenteditable]'); if (b && t){ const h = clean(t.innerHTML); if (h !== (b.html || '')){ b.html = h; ch = true; } } });
  if (ch) touch();
}
async function upload(file){
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Format non pris en charge (' + (file.type || 'inconnu') + ') : png, jpg, webp ou gif.');
  const r = await fetch('/api/atelier/media', { method: 'POST', headers: { 'Content-Type': file.type, 'X-Wolf-IA': '1' }, body: file });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || 'envoi de l\'image refusé');
  return j.file;
}
async function addImages(files, blockId){
  const n = ficheNode(); if (!n || !files.length) return;
  flushFiche();
  let b = blockId && n.blocks.find(x => x.id === blockId);
  if (!b){ b = { id: uid('b'), type: 'image', date: today(), titre: '', html: '', imgs: [] }; n.blocks.push(b); }
  b.imgs = b.imgs || [];
  for (const f of files){ try { b.imgs.push({ f: await upload(f), leg: '' }); } catch(e){ ui.toast = { text: '⚠ ' + e.message }; showToast(); } }
  touch(); renderFiche(false);
}
function wireFiche(f, n){
  const bOf = el => { const a = el.closest('.at-block'); return a && n.blocks.find(x => x.id === a.dataset.b); };
  f.addEventListener('click', e => {
    if (e.target === f) return closeFiche();
    const im = e.target.closest('[data-light]'); if (im && (ui.video || !e.target.closest('button'))) return openLight(im.dataset.light);
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fclose !== undefined) return closeFiche();
    if (b.dataset.golink !== undefined) return openDoc(n.link);
    if (b.dataset.cmd){ e.preventDefault(); const c = b.dataset.cmd;
      if (c === 'hilite') document.execCommand('hiliteColor', false, 'rgba(240,200,119,0.45)');
      else if (c === 'h2') document.execCommand('formatBlock', false, document.queryCommandValue('formatBlock').toLowerCase() === 'h2' ? 'div' : 'h2');
      else if (c === 'link'){ const s = String(getSelection()); if (/^https?:\/\/\S+$/i.test(s.trim())) document.execCommand('createLink', false, s.trim()); else { ui.toast = { text: 'Sélectionne d\'abord une adresse complète (https://…) dans le texte pour en faire un lien.' }; showToast(); } }
      else document.execCommand(c, false, null);
      return; }
    flushFiche();
    if (b.dataset.addb){ const t = b.dataset.addb, nb = { id: uid('b'), type: t, date: today(), titre: '', html: '', imgs: [] }; if (t === 'graph') nb.metric = 'ca';
      if (t === 'actu') n.blocks.unshift(nb); else n.blocks.push(nb); touch(); renderFiche(false);
      const el = f.ownerDocument.querySelector('[data-b="' + nb.id + '"]'); if (el){ el.scrollIntoView({ block: 'center', behavior: 'smooth' }); const tx = el.querySelector('.at-text'); if (tx) tx.focus(); if (t === 'image') pickImages(nb.id); } return; }
    if (b.dataset.sortb !== undefined){ n.blocks.sort((a, c) => String(c.date || '').localeCompare(String(a.date || ''))); touch(); return renderFiche(false); }
    const blk = bOf(b); if (!blk) return; const i = n.blocks.indexOf(blk);
    if (b.dataset.addimg !== undefined) return pickImages(blk.id);
    if (b.dataset.rmimg !== undefined){ blk.imgs.splice(+b.dataset.rmimg, 1); touch(); return renderFiche(false); }
    if (b.dataset.bw !== undefined){ blk.half = !blk.half; touch(); return renderFiche(false); }
    if (b.dataset.bup !== undefined && i > 0){ n.blocks.splice(i, 1); n.blocks.splice(i - 1, 0, blk); touch(); return renderFiche(false); }
    if (b.dataset.bdown !== undefined && i < n.blocks.length - 1){ n.blocks.splice(i, 1); n.blocks.splice(i + 1, 0, blk); touch(); return renderFiche(false); }
    if (b.dataset.bdel !== undefined){ n.blocks.splice(i, 1); trash({ kind: 'block', docId: doc().id, verId: ver().id, node: n.id, index: i, data: blk }, 'Bloc « ' + (blk.titre || { texte: 'texte', actu: 'actualité', image: 'images', tv: 'chiffres', graph: 'graphique' }[blk.type]) + ' »'); touch(); return renderFiche(false); }
  });
  f.querySelectorAll('.at-rt button').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));   // garde la sélection du texte
  f.addEventListener('input', e => {
    const t = e.target, blk = bOf(t); if (!blk) return;
    if (t.dataset.f){ blk[t.dataset.f] = t.value; touch(); }
    else if (t.dataset.leg !== undefined){ blk.imgs[+t.dataset.leg].leg = t.value; touch(); }
    else if (t.classList.contains('at-text')){ clearTimeout(wireFiche.tm); wireFiche.tm = setTimeout(flushFiche, 600); dirty = true; statusLabel(); }
  });
  f.addEventListener('change', e => { const t = e.target, blk = bOf(t); if (blk && t.dataset.metric !== undefined){ blk.metric = t.value; touch(); drawGraph(blk); } });
  f.addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('at-text')) flushFiche(); });
  f.addEventListener('paste', e => {
    if (ui.video) return;
    const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter(x => x.type.startsWith('image/'));
    const blk = bOf(e.target);
    if (files.length){ e.preventDefault(); addImages(files, blk && blk.type !== 'tv' && blk.type !== 'graph' ? blk.id : null); return; }
    if (e.target.closest && e.target.closest('.at-text')){ e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); }
  });
  f.addEventListener('dragover', e => { if (!ui.video && e.dataTransfer && [...e.dataTransfer.types].includes('Files')){ e.preventDefault(); f.classList.add('drop'); } });
  f.addEventListener('dragleave', () => f.classList.remove('drop'));
  f.addEventListener('drop', e => { f.classList.remove('drop'); if (ui.video) return; const files = [...(e.dataTransfer ? e.dataTransfer.files : [])].filter(x => x.type.startsWith('image/')); if (files.length){ e.preventDefault(); const blk = bOf(e.target); addImages(files, blk && blk.type !== 'tv' && blk.type !== 'graph' ? blk.id : null); } });
}
function pickImages(blockId){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif'; inp.multiple = true;
  inp.onchange = () => addImages([...inp.files], blockId); inp.click();
}
function openLight(f){ ui.light = true; let el = $('atLight'); if (!el){ el = document.createElement('div'); el.id = 'atLight'; el.className = 'at-light'; document.body.appendChild(el); el.onclick = closeLight; }
  el.innerHTML = '<img src="' + esc(mediaUrl(f)) + '" alt="">'; setTimeout(() => el.classList.add('on'), 20); }
function closeLight(){ ui.light = false; const el = $('atLight'); if (el) el.classList.remove('on'); }

/* ---------- chiffres TradingView en direct ---------- */
function tvTiles(s, at){
  if (!s) return '<p class="at-empty">Chargement des chiffres TradingView…</p>';
  const f = (v, d, suf) => (typeof v === 'number' && isFinite(v)) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + (suf || '') : '—';
  const cap = s.market_cap_basic, capTxt = typeof cap === 'number' ? (cap >= 1e9 ? f(cap / 1e9, 1, ' Md') : f(cap / 1e6, 0, ' M')) : '—';
  const tiles = [['Cours', f(s.close, 2, ' ' + (s.currency || ''))], ['Capitalisation', capTxt], ['PER', f(s.price_earnings_ttm, 1, 'x')], ['P/FCF', f(s.price_free_cash_flow_ttm, 1, 'x')],
    ['EV/EBITDA', f(s.enterprise_value_ebitda_current != null ? s.enterprise_value_ebitda_current : s.enterprise_value_ebitda_ttm, 1, 'x')], ['P/B', f(s.price_book_fq, 2, 'x')],
    ['Rendement', f(s.dividends_yield, 2, ' %')], ['ROIC', f(s.return_on_invested_capital_fy, 1, ' %')], ['Marge op.', f(s.operating_margin, 1, ' %')]];
  return '<div class="at-tiles">' + tiles.map(t => '<div class="at-tile"><small>' + t[0] + '</small><b>' + t[1] + '</b></div>').join('') + '</div><div class="at-tv-at">TradingView · ' + (at ? 'relevé le ' + new Date(at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '') + '</div>';
}
async function refreshTv(b){
  const d = doc(), box = () => document.querySelector('[data-tv="' + b.id + '"]');
  try {
    if (typeof tvFetchSnapshot !== 'function') throw new Error('lecture TradingView indisponible');
    if (!d.tv){
      if (d.nom && typeof tvResolveSymbol === 'function') d.tv = await tvResolveSymbol(d.nom) || '';
      if (!d.tv){ const r = await fetch('/api/tv/search?q=' + encodeURIComponent(d.titre.slice(0, 50)), { cache: 'no-store' }); const j = await r.json(); if (j.ok && j.results && j.results[0]) d.tv = j.results[0].symbol; }
      if (!d.tv) throw new Error('symbole TradingView introuvable : indique-le dans ⚙ (ex. EURONEXT:ASML)');
      touch();
    }
    const s = await tvFetchSnapshot(d.tv);
    const meta = (typeof tvSnapMeta !== 'undefined' && tvSnapMeta[d.tv]) || {};
    const keep = {}; ['close', 'currency', 'market_cap_basic', 'price_earnings_ttm', 'price_free_cash_flow_ttm', 'enterprise_value_ebitda_current', 'enterprise_value_ebitda_ttm', 'price_book_fq', 'dividends_yield', 'return_on_invested_capital_fy', 'operating_margin'].forEach(k => { keep[k] = s[k]; });
    const at = meta.stale ? meta.at : Date.now();
    if (!b.snapAt || Date.now() - b.snapAt > 3600000 || !b.snap){ b.snap = keep; b.snapAt = at; markDirty(); } else { b.snap = keep; b.snapAt = at; }
    if (box()) box().innerHTML = tvTiles(keep, at) + (meta.stale ? '<div class="at-warn">⚠ TradingView ne répond pas : derniers chiffres connus.</div>' : '');
  } catch(e){ if (box()) box().innerHTML = tvTiles(b.snap, b.snapAt).replace('Chargement des chiffres TradingView…', '') + '<div class="at-warn">⚠ ' + esc(e.message || 'erreur') + '</div>'; }
}
function drawGraph(b){
  const cv = document.querySelector('[data-graph="' + b.id + '"]'), d = doc(); if (!cv) return;
  const old = charts.find(c => c.canvas === cv); if (old){ old.destroy(); charts = charts.filter(c => c !== old); }
  const c = findCompany(d.nom || d.titre), box = cv.parentElement, G = GRAPHS[b.metric] || GRAPHS.ca;
  const rows = c && typeof companies !== 'undefined' ? companies[c.key].filter(r => typeof r[b.metric] === 'number' && isFinite(r[b.metric])) : [];
  box.querySelectorAll('.at-warn').forEach(x => x.remove());
  if (!window.Chart || rows.length < 2){ cv.style.display = 'none'; box.insertAdjacentHTML('beforeend', '<div class="at-warn">' + (!c ? 'Cette entreprise n\'est pas dans la base de l\'onglet Analyse : ouvre-la une fois dans « Analyse » (ou vérifie le nom dans ⚙).' : 'Pas assez d\'historique pour ce graphique.') + '</div>'); return; }
  cv.style.display = '';
  const gold = '#D9A441', blue = '#4A9FE0', col = G[1] === 'bar' ? gold : blue;
  charts.push(new Chart(cv, { type: G[1], data: { labels: rows.map(r => r.annee), datasets: [{ label: G[0], data: rows.map(r => r[b.metric]), backgroundColor: G[1] === 'bar' ? gold : 'rgba(74,159,224,0.15)', borderColor: col, borderWidth: 2.5, tension: 0.3, fill: G[1] !== 'bar', pointRadius: 3, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 700 }, plugins: { legend: { display: false }, title: { display: true, text: G[0] + ' — ' + d.titre, color: '#E9EBEE', font: { size: 14, family: "'Plus Jakarta Sans', sans-serif" } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#8B93A0' } }, y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#8B93A0' } } } } }));
}

/* ====================== FENÊTRES (nouveau dossier, propriétés, modèle) ====================== */
function renderModal(){
  const host = $('atModalHost'); if (!host) return;
  const m = ui.modal; if (!m){ host.innerHTML = ''; return; }
  const secOpts = sel => '<option value="">— Aucun —</option>' + sectors().map(s => '<option value="' + s.key + '"' + (sel === s.key ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('');
  const subs = [...new Set(Object.values(D.docs).map(d => d.sousSecteur).filter(Boolean))];
  let h = '';
  if (m.kind === 'new'){
    const tpls = Object.values(BUILTIN).concat(Object.values(D.templates)).filter(t => t.type === m.type || t.id === 'vide');
    const names = typeof companies !== 'undefined' ? Object.keys(companies).slice(0, 4000) : [];
    h = '<h3>Nouveau dossier</h3><div class="at-seg big">' + Object.keys(TYPE_LABEL).map(t => '<button type="button" class="' + (m.type === t ? 'on' : '') + '" data-mtype="' + t + '">' + esc(TYPE_LABEL[t]) + '</button>').join('') + '</div>' +
      '<label>' + (m.type === 'entreprise' ? 'Entreprise' : m.type === 'chaine' ? 'Nom de la chaîne de valeur (ex. Semi-conducteurs)' : 'Titre de la carte') + '<input type="text" class="at-in" id="atMName" list="atMNames" value="' + esc(m.titre || '') + '" autocomplete="off"></label>' +
      (m.type === 'entreprise' ? '<datalist id="atMNames">' + names.map(n => '<option value="' + esc(typeof fmpDisplayName === 'function' ? fmpDisplayName(n) : n) + '">').join('') + '</datalist><p class="at-faint">Si l\'entreprise est connue de l\'onglet Analyse, son logo, son secteur et ses chiffres TradingView sont repris automatiquement.</p>' : '') +
      (m.type !== 'libre' ? '<div class="at-row2"><label>Secteur<select class="at-sel" id="atMSec">' + secOpts(m.secteur || '') + '</select></label>' + (m.type === 'entreprise' ? '<label>Sous-secteur<input type="text" class="at-in" id="atMSub" list="atMSubs" value="' + esc(m.sousSecteur || '') + '"><datalist id="atMSubs">' + subs.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist></label>' : '') + '</div>' : '') +
      '<label>Structure de départ<select class="at-sel" id="atMTpl">' + tpls.map(t => '<option value="' + t.id + '">' + esc(t.nom) + (t.builtin ? '' : ' (mon modèle)') + '</option>').join('') + '</select></label>' +
      '<div class="at-mbtns"><button type="button" class="at-btn" data-mclose>Annuler</button><button type="button" class="at-btn gold" data-mok>Créer le dossier</button></div>';
  } else if (m.kind === 'props'){
    const d = doc(), v = ver();
    h = '<h3>Réglages du dossier</h3><label>Titre<input type="text" class="at-in" id="atPTitre" value="' + esc(d.titre) + '"></label>' +
      '<div class="at-row2"><label>Secteur<select class="at-sel" id="atPSec">' + secOpts(d.secteur || '') + '</select></label><label>Sous-secteur<input type="text" class="at-in" id="atPSub" list="atMSubs" value="' + esc(d.sousSecteur || '') + '"><datalist id="atMSubs">' + subs.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist></label></div>' +
      (d.type === 'entreprise' ? '<div class="at-row2"><label>Symbole TradingView<input type="text" class="at-in" id="atPTv" placeholder="ex. EURONEXT:ASML" value="' + esc(d.tv || '') + '"></label><label>Nom dans l\'onglet Analyse<input type="text" class="at-in" id="atPNom" value="' + esc(d.nom || '') + '"></label></div>' : '') +
      '<label>Logo (adresse d\'une image)<input type="text" class="at-in" id="atPLogo" placeholder="https://…" value="' + esc(d.logo || '') + '"></label>' +
      '<label>Nom de la version affichée<input type="text" class="at-in" id="atPVer" value="' + esc(v.label) + '"></label>' +
      '<div class="at-mbtns"><button type="button" class="at-btn danger" data-deldoc>🗑 Dossier à la corbeille</button>' + (d.versions.length > 1 ? '<button type="button" class="at-btn danger" data-delver>🗑 Cette version</button>' : '') + '<span style="flex:1"></span><button type="button" class="at-btn" data-mclose>Annuler</button><button type="button" class="at-btn gold" data-mok>Enregistrer</button></div>';
  } else if (m.kind === 'tpl'){
    h = '<h3>Enregistrer cette structure comme modèle</h3><p class="at-faint">Seules les branches (titres, icônes, couleurs) sont gardées, pas le contenu des fiches. Le modèle sera proposé à chaque nouveau dossier.</p>' +
      '<label>Nom du modèle<input type="text" class="at-in" id="atTName" value="' + esc(m.nom || '') + '"></label><div class="at-mbtns"><button type="button" class="at-btn" data-mclose>Annuler</button><button type="button" class="at-btn gold" data-mok>Enregistrer le modèle</button></div>';
  }
  host.innerHTML = '<div class="at-modal-bg"><div class="at-modal">' + h + '</div></div>';
  const bg = host.firstElementChild, close = () => { ui.modal = null; host.innerHTML = ''; };
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  const first = bg.querySelector('input[type=text]'); if (first && !m.noFocus){ first.focus(); first.select(); }
  const ok = () => {
    if (m.kind === 'new'){
      const titre = $('atMName').value.trim(); if (!titre){ $('atMName').focus(); return; }
      const nd = createDoc({ type: m.type, titre, tpl: $('atMTpl').value, secteur: $('atMSec') ? $('atMSec').value : '', sousSecteur: $('atMSub') ? $('atMSub').value.trim() : '' });
      close(); openDoc(nd.id);
    } else if (m.kind === 'props'){
      const d = doc(), v = ver(), t = $('atPTitre').value.trim();
      if (t){ d.titre = t; v.nodes[v.root].titre = t; }
      d.secteur = $('atPSec').value; d.sousSecteur = $('atPSub').value.trim(); d.logo = $('atPLogo').value.trim();
      if ($('atPTv')){ d.tv = $('atPTv').value.trim().toUpperCase(); d.nom = $('atPNom').value.trim(); }
      v.label = $('atPVer').value.trim() || v.label;
      touch(); close(); renderShell();
    } else if (m.kind === 'tpl'){
      const nom = $('atTName').value.trim(); if (!nom){ $('atTName').focus(); return; }
      const d = doc(), v = ver(), id = uid('m'); D.templates[id] = { id, nom, type: d.type, tree: Object.assign(treeOf(v, v.root), { titre: '' }) };
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
    const b = e.target.closest('button'); if (!b || b.closest('#atView') || b.closest('#atFicheHost') || b.closest('#atModalHost')) return;
    const ds = b.dataset;
    if (b.id === 'atReload'){ load().then(() => { if (ui.docId && !(D && D.docs[ui.docId])) ui.docId = null; renderShell(); if (doc()) requestAnimationFrame(() => fitAll(false)); }); return; }
    if (ds.home !== undefined){ ui.docId = null; return renderShell(); }
    if (ds.open) return openDoc(ds.open);
    if (ds.new !== undefined){ ui.modal = { kind: 'new', type: ds.new || 'entreprise' }; return renderModal(); }
    if (ds.tog){ ui.open[ds.tog] = ui.open[ds.tog] === false; $('atSide').innerHTML = sideHtml(); statusLabel(); return wireSearch(); }
    if (ds.restore) return restore(ds.restore);
    if (ds.deltpl){ const t = D.templates[ds.deltpl]; delete D.templates[ds.deltpl]; D.trash.unshift({ id: uid('t'), kind: 'template', at: new Date().toISOString(), label: 'Modèle « ' + t.nom + ' »', data: t }); markDirty(); return renderShell(); }
    if (ds.export !== undefined){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(D, null, 1)], { type: 'application/json' })); a.download = 'atelier-analyses-' + today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return; }
    if (!doc()) return;
    const v = ver(), d = doc();
    if (ds.side !== undefined){ ui.side = !ui.side; pg.classList.toggle('at-noside', !ui.side); return setTimeout(applyCam, 0); }
    if (ds.newver !== undefined){ const c = JSON.parse(JSON.stringify(v)); c.id = uid('v'); c.label = 'Version du ' + frDate(today()) + (d.versions.some(x => x.label === 'Version du ' + frDate(today())) ? ' (' + (d.versions.length + 1) + ')' : ''); c.date = today(); d.versions.push(c); d.cur = c.id; touch(); openDoc(d.id); ui.toast = { text: 'Nouvelle version créée : l\'ancienne reste intacte dans la liste.' }; return showToast(); }
    if (ds.mode) return setMode(ds.mode);
    if (ds.exp !== undefined) return setExpanded(ds.exp === '1');
    if (ds.fit !== undefined) return fitAll(true);
    if (ds.draw !== undefined){ ui.draw = ui.draw ? null : { c: '#F0C877', w: 6 }; ui.sel = null; renderShell(); return; }
    if (ds.dc){ ui.draw.c = ds.dc; return renderShell(); }
    if (ds.dw){ ui.draw.w = +ds.dw; return renderShell(); }
    if (ds.dundo !== undefined){ if ((v.strokes || []).length){ v.strokes.pop(); touch(); drawStrokes(v); } return; }
    if (ds.dclear !== undefined){ if ((v.strokes || []).length){ const old = v.strokes; v.strokes = []; trash({ kind: 'strokes', docId: d.id, verId: v.id, data: old }, 'Dessins de la carte'); touch(); drawStrokes(v); } return; }
    if (ds.ddone !== undefined){ ui.draw = null; return renderShell(); }
    if (ds.savetpl !== undefined){ ui.modal = { kind: 'tpl', nom: d.type === 'entreprise' ? 'Ma trame d\'analyse' : d.titre }; return renderModal(); }
    if (ds.props !== undefined){ ui.modal = { kind: 'props' }; return renderModal(); }
    if (ds.video !== undefined){ flushFiche(); ui.video = !ui.video; ui.sel = null; ui.draw = null; renderShell(); return requestAnimationFrame(() => fitAll(false)); }
  };
  const vs = $('atVer'); if (vs) vs.onchange = () => { doc().cur = vs.value; touch(); openDoc(ui.docId); };
  wireSearch(); wireMap();
}
function wireSearch(){ const s = $('atSearch'); if (s) s.oninput = () => { ui.q = s.value; const p = s.selectionStart; $('atSide').innerHTML = sideHtml(); statusLabel(); wireSearch(); const n = $('atSearch'); n.focus(); n.setSelectionRange(p, p); }; }
window.addEventListener('resize', () => { if (doc()) applyCam(); });

async function onShow(force){
  if (!D || force === true){ await load(); }
  renderShell();
  if (doc()) requestAnimationFrame(() => fitAll(false));
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-page="' + PAGE_ID + '"]'); if (b) setTimeout(onShow, 0); });
window.ATELIER_UI = { onShow, _state: () => ({ D, ui, cam, pos, sizes }) };
})();
