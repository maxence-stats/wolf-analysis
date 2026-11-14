/* ================================================================================================
   ATELIER — IMPORT D'UN PAQUET « wolf-atelier/2.1 » (ChatGPT → Claude → Atelier), 2026-11-14
   ------------------------------------------------------------------------------------------------
   Module PUR (aucun DOM, aucun réseau) : contrôle des lots, fusion, conversion en VERSION d'un dossier de l'Atelier,
   moteurs de calcul (valorisation modules A / B, pont d'acquisition). Testable sous Node :
     node tests/atelier-paquet.test.js
   Contrat complet : docs/contrat-atelier-v2.md. Règle d'or : une valeur manquante reste null (« non disponible »),
   jamais 0, jamais inventée ; un calcul qui en dépend est « incomplet », sans résultat.
   La version créée garde le paquet complet dans v.reg (sources, données, hypothèses, affirmations, notes) : chaque
   chiffre affiché reste rattaché à sa source, sa définition, son périmètre et son statut.
   ================================================================================================ */
(function(root){
'use strict';

const CONTRAT = 'wolf-atelier/2.1';
const STATUTS = ['publie', 'ajuste', 'calcule', 'estimation', 'non_disponible'];
const STATUT_L = { publie: 'publié', ajuste: 'ajusté', calcule: 'calculé', estimation: 'estimation', non_disponible: 'non disponible', hypothese: 'hypothèse' };
const CARD_TYPES = ['texte', 'citation', 'chiffre', 'barres', 'courbes', 'donut', 'monde', 'comparatif', 'profil', 'image', 'these', 'auto',
  'marche', 'risque', 'acquisition', 'valorisation', 'chronologie', 'decision', 'score'];
const SIZE = { petite: 's', haute: 'v', large: 'h' };
const FUNCS = ['mediane', 'moyenne', 'somme', 'min', 'max', 'abs', 'cagr'];
const MONEY_UNITS = ['Md', 'M', 'par_action'];

const isNum = v => typeof v === 'number' && isFinite(v);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const firstWord = s => norm(s).split(/[\s.,()&]+/).filter(Boolean)[0] || '';

/* ---------------------------------------------------------------- fusion des lots */
// lots : [{ name, data }] (data = objet JSON déjà lu). Retourne le paquet fusionné + les erreurs de fusion.
function merge(lots){
  const P = { contrat: null, type: null, meta: {}, sources: [], donnees: [], hypotheses: [], affirmations: [], sections: [], notes: [], lots: [] };
  const errs = [];
  (lots || []).forEach(({ name, data }) => {
    const L = data || {};
    if (L.contrat !== CONTRAT) errs.push(name + ' : contrat « ' + (L.contrat || '?') + ' » (attendu ' + CONTRAT + ')');
    P.contrat = P.contrat || L.contrat; P.type = P.type || L.type;
    P.lots.push({ name, lot: L.lot });
    Object.assign(P.meta, L.meta || {});
    ['sources', 'donnees', 'hypotheses', 'affirmations', 'notes'].forEach(k => { if (Array.isArray(L[k])) P[k] = P[k].concat(L[k]); });
    const secs = L.presentation && L.presentation.sections; if (Array.isArray(secs)) P.sections = P.sections.concat(secs);
  });
  P.sections.sort((a, b) => (isNum(a.ordre) ? a.ordre : 999) - (isNum(b.ordre) ? b.ordre : 999));
  return { pkg: P, errs };
}

/* ---------------------------------------------------------------- contrôle */
// Mêmes règles que le contrôle fait à la main (docs/controle-prysmian-*.md). E = bloquant, W = à corriger plus tard.
function check(pkg){
  const E = [], W = [];
  const src = {}, don = {}, hyp = {}, aff = {}, count = {};
  pkg.sources.forEach(s => { src[s.id] = s; count[s.id] = (count[s.id] || 0) + 1; });
  pkg.donnees.forEach(d => { don[d.id] = d; count[d.id] = (count[d.id] || 0) + 1; });
  pkg.hypotheses.forEach(h => { hyp[h.id] = h; count[h.id] = (count[h.id] || 0) + 1; });
  pkg.affirmations.forEach(a => { aff[a.id] = a; count[a.id] = (count[a.id] || 0) + 1; });
  Object.keys(count).forEach(i => { if (count[i] > 1) E.push('Identifiant en double : ' + i + ' (' + count[i] + ' fois)'); });
  if (!pkg.meta.entreprise) E.push('meta.entreprise manquant');

  const point = (ctx, d, pt) => {
    const o = Object.assign({}, d, pt || {}), st = o.statut, v = o.valeur;
    if (!STATUTS.includes(st)) E.push(ctx + ' : statut « ' + st + ' » inconnu');
    if (typeof v === 'string') E.push(ctx + ' : valeur écrite en texte (« ' + v + ' »)');
    if (v == null && st && st !== 'non_disponible') E.push(ctx + ' : valeur vide sans statut « non_disponible »');
    if (v === 0) W.push(ctx + ' : valeur 0 (vrai zéro ou valeur inconnue ?)');
    if (st === 'calcule'){ if (!o.formule) E.push(ctx + ' : calculé sans formule'); }
    else if (st && st !== 'non_disponible'){
      if (!o.source) E.push(ctx + ' : sans source');
      else if (!src[o.source]) E.push(ctx + ' : source inconnue « ' + o.source + ' »');
      if (!o.page) W.push(ctx + ' : sans page');
      else if (!/\d/.test(String(o.page))) W.push(ctx + ' : page sans numéro (« ' + o.page + ' »)');
    }
  };
  pkg.donnees.forEach(d => {
    const id = d.id;
    ['libelle', 'unite', 'definition', 'perimetre'].forEach(k => { if (!d[k]) E.push(id + ' : champ « ' + k + ' » manquant'); });
    if (MONEY_UNITS.includes(d.unite) && !d.devise && !/action/.test(norm(d.libelle + ' ' + d.definition))) W.push(id + ' : unité « ' + d.unite + ' » sans devise');
    if (d.devise && d.unite === '%') W.push(id + ' : devise « ' + d.devise + ' » sur une valeur en %');
    if (d.unite === 'x') ['denominateur', 'fenetre', 'methode_calcul'].forEach(k => { if (!d[k]) E.push(id + ' : multiple sans « ' + k + ' »'); });
    if (/_(19|20)\d\d(\b|_)/.test(id)) W.push(id + ' : année dans l\'identifiant');
    ['composante_de', 'hors_de'].forEach(k => { if (d[k] && !don[d[k]]) E.push(id + ' : ' + k + ' → « ' + d[k] + ' » inconnu'); });
    if (d.formule) (String(d.formule).match(/[a-z][a-z0-9_]{2,}/g) || []).forEach(t => { if (!don[t] && !hyp[t] && !FUNCS.includes(t)) W.push(id + ' : la formule cite « ' + t + ' » (inconnu)'); });
    if (Array.isArray(d.serie)){
      const per = d.serie.map(p => p.periode);
      if (new Set(per).size !== per.length) E.push(id + ' : périodes en double dans la série');
      d.serie.forEach(p => {
        point(id + ' [' + p.periode + ']', d, p);
        if (p.rupture && !['perimetre', 'methode_comptable', 'definition'].includes(p.rupture.type)) E.push(id + ' [' + p.periode + '] : type de rupture « ' + (p.rupture.type || '?') + ' » inconnu');
      });
    } else {
      if (!d.periode) E.push(id + ' : période manquante');
      point(id, d, null);
    }
  });
  pkg.hypotheses.forEach(h => {
    if (h.statut !== 'hypothese') E.push(h.id + ' : hypothèse avec le statut « ' + h.statut + ' »');
    ['justification', 'date_revision'].forEach(k => { if (!h[k]) E.push(h.id + ' : hypothèse sans « ' + k + ' »'); });
    if (!h.confiance) W.push(h.id + ' : hypothèse sans niveau de confiance');
    if (!isNum(h.valeur)) E.push(h.id + ' : hypothèse sans valeur numérique');
    (h.fondee_sur || []).forEach(r => { if (!don[r] && !hyp[r]) E.push(h.id + ' : fondee_sur → « ' + r + ' » inconnu'); });
  });
  pkg.affirmations.forEach(a => {
    if (!['fait', 'interpretation', 'consensus'].includes(a.nature)) E.push(a.id + ' : nature « ' + a.nature + ' » inconnue');
    if (a.nature !== 'interpretation' && !(a.sources || []).length) E.push(a.id + ' : affirmation sans source');
    (a.sources || []).forEach(r => { if (!src[r]) E.push(a.id + ' : source « ' + r + ' » inconnue'); });
    (a.donnees || []).forEach(r => { if (!don[r] && !hyp[r]) E.push(a.id + ' : donnée « ' + r + ' » inconnue'); });
  });

  // présentation
  const secIds = new Set(), cardIds = new Set(), cards = [];
  const walk = (s, parent) => {
    if (!s.id) E.push('Section sans identifiant : « ' + (s.titre || '?') + ' »');
    if (secIds.has(s.id)) E.push('Section en double : ' + s.id);
    secIds.add(s.id);
    (s.cartes || []).forEach(c => { if (cardIds.has(c.id)) E.push('Carte en double : ' + c.id); cardIds.add(c.id); cards.push({ sid: s.id, c }); });
    if (!parent) (s.sous_sections || []).forEach(x => walk(x, s));
  };
  pkg.sections.forEach(s => walk(s, null));
  const known = id => !!(don[id] || hyp[id] || aff[id] || src[id]);
  const valoNames = new Set();
  cards.forEach(({ c }) => { if (c.type === 'valorisation') valoResultNames().forEach(n => valoNames.add(n)); });
  const textRefs = (ctx, s) => {
    String(s || '').replace(/\{\{(aff|d):([a-z0-9_]+)\}\}/g, (m, k, id) => { if (!known(id)) E.push(ctx + ' : renvoi « ' + m + ' » inconnu'); return m; })
      .replace(/\[\[([a-z0-9_]+)\]\]/g, (m, id) => { if (!src[id]) E.push(ctx + ' : source « ' + id + ' » inconnue'); return m; });
  };
  const ref = (ctx, id) => { if (id == null || id === '') return; if (typeof id !== 'string') return; if (id.startsWith('valo:')){ if (!valoNames.has(id.slice(5))) E.push(ctx + ' : résultat « ' + id + ' » inconnu'); return; } if (id === 'auto') return; if (!known(id)) E.push(ctx + ' : « ' + id + ' » inconnu'); };
  cards.forEach(({ sid, c }) => {
    const ctx = 'Carte ' + (c.id || '?') + ' (' + c.type + ', ' + sid + ')';
    if (!CARD_TYPES.includes(c.type)) E.push(ctx + ' : type inconnu');
    if (c.taille && !SIZE[c.taille]) W.push(ctx + ' : taille « ' + c.taille + ' » (attendu petite, haute ou large)');
    ['contenu', 'logique', 'resume', 'mecanisme', 'impact'].forEach(k => textRefs(ctx, c[k]));
    ['donnee', 'comparer_a', 'taille_marche', 'croissance', 'part_entreprise', 'prix', 'dette_reprise', 'base', 'prix_entree'].forEach(k => ref(ctx, c[k]));
    (c.series || []).forEach(x => ref(ctx, x));
    (c.parts || []).forEach(x => ref(ctx, x.donnee));
    (c.zones || []).forEach(x => ref(ctx, x.donnee));
    Object.values(c.valeurs || {}).forEach(a => (a || []).forEach(x => ref(ctx, x)));
    Object.values(c.pont || {}).forEach(x => ref(ctx, x));
    (c.financement || []).forEach(x => ref(ctx, x.donnee));
    Object.values(c.contribution || {}).forEach(x => ref(ctx, x));
    Object.values(c.synergies || {}).forEach(x => ref(ctx, x));
    (c.hypotheses || []).forEach(x => ref(ctx, x));
    (c.references_multiple || []).forEach(x => ref(ctx, x));
    (c.resultats || []).forEach(x => ref(ctx, x));
    (c.affirmations || []).forEach(x => ref(ctx, x));
    (c.sources || []).forEach(x => ref(ctx, x));
    if (c.module_a){ Object.values(c.module_a.cagr || {}).forEach(x => ref(ctx, x)); ref(ctx, c.module_a.multiple); }
    if (c.module_b){ ref(ctx, c.module_b.cagr); Object.values(c.module_b.multiples || {}).forEach(x => ref(ctx, x)); }
    (c.criteres || []).forEach(k => (k.sources || []).forEach(x => ref(ctx, x)));
    if (c.type === 'decision'){
      ['verdict', 'hypotheses', 'prix_entree', 'risques', 'invalidation'].forEach(k => { const v = c[k]; if (!v || (Array.isArray(v) && !v.length)) E.push(ctx + ' : décision sans « ' + k + ' »'); });
      (c.risques || []).forEach(r => { if (!cardIds.has(r)) E.push(ctx + ' : risque « ' + r + ' » inconnu'); });
    }
    if (c.type === 'image' && (!c.lien || !c.page)) W.push(ctx + ' : image sans lien direct ou sans page d\'origine');
    if (c.type === 'marche' && c.taille && !SIZE[c.taille] && !c.taille_marche) W.push(ctx + ' : « taille » sert à la taille du marché : utiliser « taille_marche » (corrigé à l\'import)');
    (c.segments_concernes || []).forEach(s => { if (!secIds.has(s)) W.push(ctx + ' : segment « ' + s + ' » inconnu'); });
    if (c.segment && !secIds.has(c.segment)) W.push(ctx + ' : segment « ' + c.segment + ' » inconnu');
  });
  pkg.notes.forEach(n => { if (!secIds.has(n.cible) && !cardIds.has(n.cible)) E.push('Note → cible « ' + n.cible + ' » inconnue'); });

  const nd = pkg.donnees.filter(d => d.statut === 'non_disponible' || (Array.isArray(d.serie) && d.serie.every(p => p.valeur == null))).length;
  return { errors: E, warnings: W, stats: { sources: pkg.sources.length, donnees: pkg.donnees.length, nonDisponibles: nd, hypotheses: pkg.hypotheses.length, affirmations: pkg.affirmations.length, sections: secIds.size, cartes: cards.length, notes: pkg.notes.length } };
}

/* ---------------------------------------------------------------- registre (v.reg) */
function buildReg(pkg){
  const by = a => { const o = {}; a.forEach(x => { o[x.id] = x; }); return o; };
  return { contrat: pkg.contrat, meta: pkg.meta, importedAt: new Date().toISOString(), lots: pkg.lots,
    sources: by(pkg.sources), donnees: by(pkg.donnees), hypotheses: by(pkg.hypotheses), affirmations: by(pkg.affirmations), notes: pkg.notes.slice() };
}
// Une donnée ou une hypothèse du registre : { item, kind }.
function regItem(reg, id){
  if (!reg || !id) return null;
  if (reg.donnees[id]) return { item: reg.donnees[id], kind: 'donnee' };
  if (reg.hypotheses[id]) return { item: reg.hypotheses[id], kind: 'hypothese' };
  return null;
}
// Points d'une donnée : [{ periode, valeur, statut, source, page, definition, perimetre, rupture }]
function regPoints(item){
  if (!item) return [];
  if (Array.isArray(item.serie)) return item.serie.map(p => Object.assign({}, item, { serie: undefined }, p));
  return [Object.assign({}, item)];
}
// Dernière valeur connue (non nulle) d'une donnée ou d'une hypothèse.
function regLast(item){
  const pts = regPoints(item).filter(p => isNum(p.valeur));
  return pts.length ? pts[pts.length - 1] : null;
}
// Unité d'affichage de l'Atelier (fmtVal) : Mcur = millions dans la devise, cur = par action, sinon texte d'unité.
function unitOf(item){
  const u = item && item.unite, dev = item && item.devise;
  if (u === '%') return { u: '%', devise: '' };
  if (u === 'x') return { u: 'x', devise: '' };
  if (u === 'par_action') return { u: 'cur', devise: dev || 'EUR' };
  if (u === 'M' && dev) return { u: 'Mcur', devise: dev, mult: 1 };
  if (u === 'Md' && dev) return { u: 'Mcur', devise: dev, mult: 1000 };
  if (u === 'M') return { u: 'M', devise: '' };
  return { u: u || '', devise: '' };
}

/* ---------------------------------------------------------------- texte : Markdown simple + renvois */
const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const frN = (v, d) => isNum(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const CUR = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', JPY: '¥' };
function fmtItem(item, p){
  const pt = p || regLast(item); if (!pt || !isNum(pt.valeur)) return 'non disponible';
  const v = pt.valeur, u = item.unite, cur = CUR[item.devise] || item.devise || '';
  if (u === '%') return frN(v, Math.abs(v) < 10 ? 1 : 0) + ' %';
  if (u === 'x') return frN(v, 1) + 'x';
  if (u === 'par_action') return frN(v, 2) + ' ' + (cur || '€') + '/action';
  if (u === 'M' && cur) return Math.abs(v) >= 1000 ? frN(v / 1000, 2) + ' Md' + cur : frN(v, 0) + ' M' + cur;
  if (u === 'Md') return frN(v, Math.abs(v) < 10 ? 2 : 1) + ' Md' + cur;
  return frN(v, Math.abs(v) < 10 ? 2 : 0) + (u ? ' ' + u : '');
}
// Markdown → HTML compatible avec clean() de l'Atelier (b, ul/li, div, a, mark). Les renvois sont résolus à l'import.
function mdToHtml(md, reg){
  const inline = s => {
    let t = escH(s);
    t = t.replace(/\{\{d:([a-z0-9_]+)\}\}/g, (m, id) => { const r = regItem(reg, id); if (!r) return m; const p = regLast(r.item); return '<b>' + escH(fmtItem(r.item)) + '</b>' + (p && p.periode ? ' (' + escH(p.periode) + ')' : ''); });
    t = t.replace(/\{\{aff:([a-z0-9_]+)\}\}/g, (m, id) => { const a = reg && reg.affirmations[id]; if (!a) return m;
      const srcs = (a.sources || []).map(s => reg.sources[s]).filter(Boolean);
      return escH(a.texte) + (a.nature === 'interpretation' ? ' <mark>[interprétation]</mark>' : '') + srcs.map(s => s.url ? ' <a href="' + escH(s.url) + '">[' + escH(s.editeur || s.titre) + ']</a>' : ' [' + escH(s.titre) + ']').join(''); });
    t = t.replace(/\[\[([a-z0-9_]+)\]\]/g, (m, id) => { const s = reg && reg.sources[id]; if (!s) return m; return s.url ? '<a href="' + escH(s.url) + '">[' + escH(s.titre) + ']</a>' : '[' + escH(s.titre) + ']'; });
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    return t;
  };
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  let out = '', list = false;
  lines.forEach(l => {
    const m = /^\s*[-•]\s+(.*)$/.exec(l);
    if (m){ if (!list){ out += '<ul>'; list = true; } out += '<li>' + inline(m[1]) + '</li>'; return; }
    if (list){ out += '</ul>'; list = false; }
    if (l.trim()) out += '<div>' + inline(l) + '</div>';
  });
  if (list) out += '</ul>';
  return out;
}

/* ---------------------------------------------------------------- conversion en version de l'Atelier */
// opts : { uid(prefix), docName, palette:[couleurs], seriesColors:[couleurs], keep:[cartes de l'ancienne version à reprendre] }
// Retourne { version, imagesToFetch:[{cardId, url, leg, page}], info:[messages] }.
function convert(pkg, opts){
  const o = opts || {}, uid = o.uid || (p => p + Math.random().toString(36).slice(2, 10));
  const pal = o.palette || ['#D9A441', '#4A9FE0', '#4FD1A5', '#E5636B', '#F08A4B', '#5CC8D7', '#B8A1F0', '#8FA3B8'];
  const scol = o.seriesColors || pal;
  const reg = buildReg(pkg), info = [], imgs = [];
  const today = (new Date()).toISOString().slice(0, 10);
  const v = { id: uid('v'), label: 'Import ' + (pkg.meta.auteur || 'ChatGPT') + ' — ' + today.split('-').reverse().join('/'), date: today, kind: 'cards', sections: [], cards: {}, reg, importedFrom: o.fromVersion || null };
  const cid = pid => 'p_' + String(pid || uid('c')).replace(/[^a-z0-9_]/gi, '_');
  const sidOf = pid => 'ps_' + String(pid).replace(/[^a-z0-9_]/gi, '_');
  const selfW = firstWord(o.docName || pkg.meta.entreprise);
  const nowIso = new Date().toISOString();

  const convCard = c => {
    const base = { id: cid(c.id), pid: c.id || null, type: c.type, size: SIZE[c.taille] || 'h', titre: c.titre || '', createdAt: nowIso, fromImport: true };
    if (c.type === 'marche' && c.taille && !SIZE[c.taille]){ base.size = 'h'; if (!c.taille_marche) c = Object.assign({}, c, { taille_marche: c.taille }); }
    const unitTxt = item => { const uo = unitOf(item); return uo.u === 'Mcur' ? 'Mcur' : uo.u; };
    switch (c.type){
      case 'texte': return Object.assign(base, { html: mdToHtml(c.contenu, reg), md: c.contenu || '' });
      case 'citation': return Object.assign(base, { html: mdToHtml(c.contenu, reg), titre: c.etiquette || c.titre || '' });
      case 'chiffre': return Object.assign(base, { type: 'kpi', bind: 'r:' + c.donnee, cmp: c.comparer_a || null, size: SIZE[c.taille] || 's' });
      case 'barres': case 'courbes': {
        const items = (c.series || []).map(id => regItem(reg, id)).filter(Boolean).map(r => r.item);
        const labels = [];
        items.forEach(it => regPoints(it).forEach(p => { const l = String(p.periode); if (!labels.includes(l)) labels.push(l); }));
        labels.sort((a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true }));
        const u0 = items[0] ? unitOf(items[0]) : { u: '' };
        const ruptures = [];
        const series = items.map((it, i) => {
          const uo = unitOf(it), pts = regPoints(it);
          return { name: it.libelle, ref: it.id, color: scol[i % scol.length], values: labels.map(l => { const p = pts.find(x => String(x.periode) === l); if (p && p.rupture) ruptures.push({ serie: it.libelle, periode: l, type: p.rupture.type, texte: p.rupture.texte || '' }); return p && isNum(p.valeur) ? p.valeur * (uo.mult || 1) : null; }) };
        });
        const sameUnit = items.every(it => unitOf(it).u === u0.u);
        if (!sameUnit) info.push('« ' + (c.titre || c.id) + ' » mélange des unités : la première sert d\'axe.');
        // une rupture coupe les comparaisons automatiques : pas de Δ % sur un graphique qui en contient
        const yoy = !!c.evolution && !ruptures.length;
        if (c.evolution && ruptures.length) info.push('« ' + (c.titre || c.id) + ' » : Δ % désactivé (rupture de série).');
        return Object.assign(base, { mode: 'manuel', labels, series, unit: u0.u, devise: u0.devise || '', yoy, ruptures, refs: (c.series || []).slice() });
      }
      case 'donut': {
        const rows = (c.parts || []).map(p => { const r = regItem(reg, p.donnee), l = r && regLast(r.item); return { label: p.libelle, v: l ? l.valeur : null, ref: p.donnee }; });
        const it = (c.parts || []).map(p => regItem(reg, p.donnee)).find(Boolean);
        return Object.assign(base, { rows, unit: it ? (it.item.unite === 'M' && it.item.devise ? 'M' + (CUR[it.item.devise] || it.item.devise) : it.item.unite === '%' ? '%' : it.item.unite) : '' , size: SIZE[c.taille] || 's' });
      }
      case 'monde': {
        const rows = (c.zones || []).map(z => { const r = regItem(reg, z.donnee), l = r && regLast(r.item); return { zone: z.zone, v: l ? l.valeur : null, ref: z.donnee }; });
        const it = (c.zones || []).map(z => regItem(reg, z.donnee)).find(Boolean);
        return Object.assign(base, { type: 'geo', rows, unit: it ? (it.item.unite === 'M' && it.item.devise ? 'M' + (CUR[it.item.devise] || it.item.devise) : it.item.unite) : '' });
      }
      case 'comparatif': {
        const custom = (c.colonnes || []).map((k, i) => ({ k: 'xp' + i, l: k.libelle, u: k.unite === '%' ? '%' : k.unite === 'x' ? 'x' : k.unite === 'par_action' ? 'cur' : (k.unite === 'M' || k.unite === 'Md') ? 'Mcur' : '', dir: k.sens === 'haut' ? 'high' : k.sens === 'bas' ? 'low' : '' }));
        const cols = [], vals = {}, refs = {};
        (c.entreprises || []).forEach(n => {
          const self = selfW && firstWord(n) === selfW;
          cols.push(self ? '@self' : n);
          const key = norm(self ? (o.selfDisplay || n) : n);
          vals[key] = {}; refs[key] = {};
          ((c.valeurs || {})[n] || []).forEach((id, i) => {
            const r = regItem(reg, id); if (!r || !custom[i]) return;
            refs[key][custom[i].k] = id;
            const l = regLast(r.item); if (!l) { vals[key][custom[i].k] = 'n.d.'; return; }
            const val = l.valeur * (r.item.unite === 'Md' ? 1000 : 1);
            vals[key][custom[i].k] = String(Math.round(val * 100) / 100).replace('.', ',');
          });
        });
        return Object.assign(base, { cols, withConc: false, metrics: custom.map(x => x.k), custom, vals, refs });
      }
      case 'profil': {
        if (c.photo) imgs.push({ cardId: base.id, url: c.photo, page: c.photo_page || '', leg: '' });
        return Object.assign(base, { type: 'profil', nom: c.nom || '', poste: c.poste || '', depuis: c.depuis || '', detention: c.detention || '', remu: c.remuneration || '', parcours: c.parcours || '', imgs: [], size: SIZE[c.taille] || 'v' });
      }
      case 'image': {
        if (c.lien) imgs.push({ cardId: base.id, url: c.lien, page: c.page || '', leg: c.legende || '' });
        return Object.assign(base, { imgs: [], html: c.credit ? '<div>Crédit : ' + escH(c.credit) + '</div>' : '', size: SIZE[c.taille] || 's' });
      }
      case 'these': return Object.assign(base, { phase: c.phase === 'finale' ? 'finale' : 'depart', answers: (c.reponses || []).slice(0, 7), date: pkg.meta.date_analyse || '' });
      case 'auto': {
        const q = String(c.quoi || '');
        if (q === 'cours') return Object.assign(base, { type: 'bourse', range: '5a' });
        if (q === 'cours_compares') return Object.assign(base, { type: 'multicours', cols: ['@self'], withConc: false, range: '5a' });
        if (q === 'chaine_valeur') return Object.assign(base, { type: 'vchain', autoChain: true });
        if (q.startsWith('historique_tv:')) return Object.assign(base, { type: 'barres', mode: 'tv', keys: [q.split(':')[1]], years: 10 });
        info.push('Carte automatique « ' + q + ' » inconnue : ignorée.');
        return null;
      }
      default: {
        // nouveaux types (marche, risque, acquisition, valorisation, chronologie, decision, score) : le contenu est gardé tel quel
        const x = JSON.parse(JSON.stringify(c)); delete x.id; delete x.taille;
        if (c.type === 'decision' && Array.isArray(x.risques)) x.risques = x.risques.map(cid);
        return Object.assign(base, x, { type: c.type, id: base.id, pid: base.pid, size: base.size, titre: c.titre || '' });
      }
    }
  };

  let i = 0;
  const addSec = (s, parentId) => {
    const sec = { id: sidOf(s.id), pid: s.id, titre: s.titre || 'Section', hint: [], color: pal[i++ % pal.length], collapsed: false, cards: [] };
    if (parentId) sec.parent = parentId;
    (s.cartes || []).forEach(c => { const n = convCard(c); if (!n) return; if (v.cards[n.id]) n.id = n.id + '_' + uid(''); v.cards[n.id] = n; sec.cards.push(n.id); });
    v.sections.push(sec);
    if (!parentId) (s.sous_sections || []).forEach(x => addSec(x, sec.id));
  };
  pkg.sections.forEach(s => addSec(s, null));
  // notes « À dire » : cible = identifiant de la version (jamais affichées dans la page)
  reg.notes = pkg.notes.map(n => ({ cible: v.sections.some(s => s.pid === n.cible) ? sidOf(n.cible) : cid(n.cible), texte: n.texte }));

  // cartes visuelles reprises de la version précédente (images, dirigeants, sources, cours comparés…)
  if (o.keep && o.keep.length){
    const sec = { id: uid('s'), titre: 'Repris de la version précédente', hint: ['Images, dirigeants et documents de ta version précédente : glisse-les dans les sections voulues.'], color: '#8FA3B8', collapsed: false, cards: [] };
    o.keep.forEach(c0 => { const c = JSON.parse(JSON.stringify(c0)); c.id = uid('c'); c.keptFrom = c0.id; v.cards[c.id] = c; sec.cards.push(c.id); });
    v.sections.push(sec);
    info.push(o.keep.length + ' carte(s) reprise(s) de la version précédente.');
  }
  return { version: v, imagesToFetch: imgs, info };
}

/* ---------------------------------------------------------------- moteur de valorisation (modules A et B) */
// F0 = FCF/action de départ, g = CAGR en %, M = multiple P/FCF, r = rendement visé en %, n = années, cours = cours actuel.
function valoScenario(F0, g, M, r, n, cours){
  if (![F0, g, M, r, n].every(isNum)) return null;
  const F5 = F0 * Math.pow(1 + g / 100, n), P5 = F5 * M, Pmax = P5 / Math.pow(1 + r / 100, n);
  const R = isNum(cours) && cours > 0 && P5 > 0 ? (Math.pow(P5 / cours, 1 / n) - 1) * 100 : null;
  const marge = isNum(cours) && Pmax > 0 ? (Pmax - cours) / Pmax * 100 : null;   // (P_max − cours) ÷ P_max
  return { F0, g, M, F5, P5, Pmax, R, marge };
}
const SCEN = ['pessimiste', 'realiste', 'optimiste'], MULTS = ['bas', 'central', 'haut'];
function valoResultNames(){ return SCEN.flatMap(s => ['prix_futur_' + s, 'prix_max_' + s, 'rendement_' + s, 'marge_' + s]).concat(MULTS.flatMap(m => ['prix_futur_mult_' + m, 'prix_max_mult_' + m])); }
// c = carte valorisation ; val(id) = valeur courante d'une hypothèse ou donnée (curseur compris) ; cours = cours actuel.
function valoCompute(c, val, cours){
  const n = isNum(c.horizon) ? c.horizon : 5, r = isNum(c.rendement_cible) ? c.rendement_cible : 12, F0 = val(c.base);
  const A = {}, B = {}, named = {};
  const a = c.module_a || {}, b = c.module_b || {};
  SCEN.forEach(s => { A[s] = valoScenario(F0, val((a.cagr || {})[s]), val(a.multiple), r, n, cours);
    if (A[s]){ named['prix_futur_' + s] = A[s].P5; named['prix_max_' + s] = A[s].Pmax; named['rendement_' + s] = A[s].R; named['marge_' + s] = A[s].marge; } });
  MULTS.forEach(m => { B[m] = valoScenario(F0, val(b.cagr), val((b.multiples || {})[m]), r, n, cours);
    if (B[m]){ named['prix_futur_mult_' + m] = B[m].P5; named['prix_max_mult_' + m] = B[m].Pmax; } });
  return { n, r, F0, cours, A, B, named, incomplete: !isNum(F0) };
}

/* ---------------------------------------------------------------- pont d'acquisition */
// Lignes dans l'ordre d'affichage, avec le signe appliqué au FCF pro forma.
const PONT = [
  ['fcf_acquereur', 'FCF de l\'acquéreur', 1], ['fcf_cible', 'FCF de la cible', 1],
  ['anciens_interets_cible', 'Anciens intérêts de la cible (retraités)', 1], ['nouveaux_interets', 'Nouveaux intérêts après impôt', -1],
  ['capex_supplementaire', 'Investissements supplémentaires', -1], ['bfr_normalise', 'Variation de BFR normalisée', -1],
  ['couts_integration_recurrents', 'Coûts d\'intégration récurrents', -1], ['synergies_realisees', 'Synergies réalisées', 1],
  ['coupons_hybrides', 'Coupons des hybrides (si absents du FCF retenu)', -1]
];
// val(id) → nombre ou null ; c = carte acquisition. Retourne les lignes, le FCF pro forma « prouvé », « avec synergies
// hypothétiques », le FCF/action et la dilution. Une entrée manquante rend le résultat INCOMPLET (aucune valeur).
function pontCompute(c, val, force){
  const p = c.pont || {}, inc = c.inclus_dans_fcf_retenu || {};
  const lines = PONT.map(([k, l, sign]) => {
    let s = sign, skip = false;
    if (k === 'anciens_interets_cible' && inc.anciens_interets_cible === false) skip = true;   // pas déduits du FCF retenu : rien à rajouter
    if (k === 'coupons_hybrides' && inc.coupons_hybrides === true) skip = true;              // déjà dans le FCF retenu
    const id = p[k], v = id ? val(id) : null;
    return { k, l, id: id || null, sign: s, v, skip, missing: !skip && !!id && v == null, absent: !id };
  });
  const missing = lines.filter(x => x.missing || (x.absent && ['fcf_acquereur', 'fcf_cible'].includes(x.k)));
  const sum = lines.reduce((t, x) => x.skip || x.v == null ? t : t + x.sign * x.v, 0);
  const hypo = p.synergies_hypothetiques ? val(p.synergies_hypothetiques) : null;
  const avant = p.actions_avant ? val(p.actions_avant) : null, emises = p.actions_emises ? val(p.actions_emises) : null;
  const ponct = p.couts_integration_ponctuels ? val(p.couts_integration_ponctuels) : null;
  const okShares = isNum(avant) && isNum(emises) && avant + emises > 0;
  const complete = !missing.length && okShares;
  const show = complete || !!force;
  return {
    lines, missing: missing.map(x => x.l).concat(okShares ? [] : ['Nombre d\'actions avant / émises']),
    complete, forced: !complete && !!force,
    fcf: show ? sum : null, fcfHypo: show && isNum(hypo) ? sum + hypo : null, hypo,
    fcfParAction: show && okShares ? sum / (avant + emises) : null,
    fcfParActionHypo: show && okShares && isNum(hypo) ? (sum + hypo) / (avant + emises) : null,
    dilution: isNum(avant) && isNum(emises) && avant > 0 ? emises / avant * 100 : null, ponctuels: ponct
  };
}

const API = { CONTRAT, STATUT_L, CARD_TYPES, merge, check, buildReg, regItem, regPoints, regLast, unitOf, fmtItem, mdToHtml, convert, valoScenario, valoCompute, valoResultNames, pontCompute, PONT, isNum };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.ATELIER_PAQUET = API;
})(typeof window !== 'undefined' ? window : globalThis);
