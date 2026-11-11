/* ================================================================================================
   PRIX PAR SECTEUR (2026-11-10) — ma liste d'entreprises rangée par secteur, avec mes prix
   ------------------------------------------------------------------------------------------------
   Les 11 secteurs sont déjà en place. Pour chaque entreprise : le cours, la base par action que j'ai retenue (FCF, OCF,
   BPA, EBITDA, actif net…), et pour chacun des 3 scénarios (pessimiste, réaliste, optimiste) la croissance annuelle et le
   multiple que j'ai utilisés. L'appli en déduit, par scénario :
     prix juste aujourd'hui = base × multiple − dette nette par action
     prix dans 5 ans        = base × (1 + croissance)^5 × multiple − dette nette par action
     rendement annuel       = (prix dans 5 ans / cours)^(1/5) − 1
   SAISIE DIRECTE (choix de l'utilisateur) : rien n'est repris automatiquement de l'onglet Valorisation ; « ↺ Préremplir »
   propose seulement le cours et le FCF par action connus de l'onglet Analyse.
   Chaque ligne est reliée à l'onglet Analyse (📊) et au dossier de l'Atelier d'analyses (🗂, créé s'il n'existe pas).
   Données : fichier data/mes-portefeuilles/prix.json (store « prix » du serveur local, mêmes copies de secours que le
   reste) ; suppression = corbeille. Site public : copie data/public/prix.json en lecture seule.
   ================================================================================================ */
(function(){
'use strict';
const PAGE_ID = 'pagePrix';
const SC = [['pess', 'Pessimiste', 'var(--red)'], ['real', 'Réaliste', 'var(--blue)'], ['opt', 'Optimiste', 'var(--green)']];
const METRICS = ['FCF par action', 'OCF par action', 'BPA (bénéfice par action)', 'EBITDA par action', 'Actif net par action', 'Dividende par action', 'Autre'];
let D = null, serverOk = false, RO = false, loadErr = null, publishedAt = null;
let dirty = false, saving = false, timer = null, lastSaved = null, saveErr = null, conflict = false;
const ui = { q: '', modal: null, open: {}, focus: null };

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const num = v => { if (typeof v === 'number') return isFinite(v) ? v : null; const t = String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.').replace('%', ''); if (t === '' || t === '-') return null; const n = Number(t); return isFinite(n) ? n : null; };
const fmt = (v, d) => v == null || !isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const sectors = () => (typeof GICS_SECTORS !== 'undefined' ? GICS_SECTORS : []);
const frDate = iso => { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; };
function company(name){
  if (typeof companies === 'undefined' || !name) return null;
  const t = norm(name), key = Object.keys(companies).find(n => norm(n) === t || (typeof fmpDisplayName === 'function' && norm(fmpDisplayName(n)) === t));
  if (!key) return null;
  const h = companies[key], last = h[h.length - 1] || {};
  let logo = last.lienImage || ''; if (!logo && typeof companyLogoUrl === 'function') logo = companyLogoUrl(key) || '';
  const sec = norm(last.secteur), s = sectors().find(x => norm(x.label) === sec || (x.match || []).some(m => sec && sec.includes(norm(m))));
  const n = k => typeof last[k] === 'number' && isFinite(last[k]) ? last[k] : null;
  return { key, logo, cours: n('prixActuel'), fcf: n('fcfParAction'), div: n('rendementDiv'), pfcf: n('pFcf'), tvAt: last.tvLiveAt || null, devise: last.devise || 'EUR', secteur: s ? s.key : '', sousSecteur: last.sousSecteur || '' };
}
const devSym = d => ({ EUR: '€', USD: '$', GBP: '£', GBX: 'p', CHF: 'CHF', JPY: '¥' }[d] || d || '€');
// Cours : celui de l'onglet Analyse s'il est connu (à jour), sinon celui saisi dans la fiche.
function ratiosOf(it){
  const c = company(it.nom);
  if (c && (c.div != null || c.pfcf != null)) return { div: c.div, pfcf: c.pfcf, at: c.tvAt, src: 'onglet Analyse' };
  if (it.tv) return { div: it.tv.div, pfcf: it.tv.pfcf, at: it.tv.at, src: 'TradingView' };
  return { div: null, pfcf: null, at: null, src: '' };
}
// Entreprise hors onglet Analyse : rendement et P/FCF relus sur TradingView (serveur local) puis gardés dans la fiche.
const tvAsked = {};
async function fetchTvRatios(it){
  if (RO || tvAsked[it.id] || company(it.nom) || typeof tvFetchSnapshot !== 'function') return;
  if (it.tv && Date.now() - (it.tv.at || 0) < 12 * 3600 * 1000) return;
  tvAsked[it.id] = true;
  try {
    let sym = it.tvSym;
    if (!sym){ const r = await fetch('/api/tv/search?q=' + encodeURIComponent(it.nom.slice(0, 50)), { cache: 'no-store' }); const j = await r.json(); sym = j.ok && j.results && j.results[0] ? j.results[0].symbol : null; }
    if (!sym) return;
    const d = await tvFetchSnapshot(sym);
    it.tvSym = sym;
    it.tv = { div: typeof d.dividends_yield === 'number' ? d.dividends_yield : null, pfcf: typeof d.price_free_cash_flow_ttm === 'number' ? d.price_free_cash_flow_ttm : null, cours: typeof d.close === 'number' ? d.close : null, at: Date.now() };
    if (it.tv.cours != null && !it.cours) it.cours = it.tv.cours;
    markDirty(); render();
  } catch(e){ /* TradingView indisponible : la ligne reste sans ces deux chiffres */ }
}
function coursOf(it){ const c = company(it.nom); return c && c.cours != null ? { v: c.cours, auto: true } : { v: num(it.cours), auto: false }; }
function calc(it, k){
  const s = (it.sc || {})[k] || {}, base = num(it.base), mult = num(s.mult), cagr = num(s.cagr), dette = num(it.dette) || 0, cours = coursOf(it).v;
  if (base == null || mult == null) return null;
  const juste = base * mult - dette, p5 = cagr == null ? null : base * Math.pow(1 + cagr / 100, 5) * mult - dette;
  return { juste, p5, mult, cagr, ecart: cours && juste > 0 ? cours / juste - 1 : null, rdt: cours && p5 > 0 ? Math.pow(p5 / cours, 1 / 5) - 1 : null };
}

/* ---------- persistance ---------- */
async function load(){
  RO = false;
  try { const p = await fetch('/api/ia/ping', { cache: 'no-store' }); const j = await p.json(); serverOk = !!(j && j.ok && j.v >= 13); } catch(e){ serverOk = false; }
  if (!serverOk){
    try { const r = await fetch('data/public/prix.json?_=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('aucune copie publiée');
      D = await r.json(); D.items = D.items || {}; D.trash = []; RO = true; serverOk = true; publishedAt = D.publishedAt || null; loadErr = null; } catch(e){ D = null; }
    return;
  }
  try {
    const r = await fetch('/api/store/load?name=prix', { cache: 'no-store' }); const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'lecture impossible');
    D = j.data || { version: 1, revision: 0, items: {}, trash: [] }; D.items = D.items || {}; D.trash = D.trash || [];
    loadErr = null; dirty = false; conflict = false;
  } catch(e){ loadErr = e.message; D = null; }
}
function markDirty(){ if (RO) return; dirty = true; saveErr = null; status(); clearTimeout(timer); timer = setTimeout(save, 500); }
async function save(){
  if (RO || !D || conflict || !dirty) return;
  if (saving){ clearTimeout(timer); timer = setTimeout(save, 300); return; }
  saving = true; dirty = false; status();
  try {
    const r = await fetch('/api/store/save?name=prix', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' },
      body: JSON.stringify(Object.assign({}, D, { revision: (D.revision || 0) + 1, baseRevision: D.revision || 0, savedAt: new Date().toISOString() })) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409){ conflict = true; dirty = true; throw new Error('modifié dans un autre onglet : recharge la page'); }
    if (!r.ok || !j.ok) throw new Error(j.error || 'enregistrement refusé');
    D.revision = j.revision; lastSaved = new Date();
  } catch(e){ saveErr = e.message; dirty = true; if (!conflict){ clearTimeout(timer); timer = setTimeout(save, 4000); } }
  saving = false; status();
}
function status(){
  const el = $('lpStatus'); if (!el) return;
  if (RO){ el.textContent = '🌐 Lecture seule' + (publishedAt ? ' · publié le ' + frDate(publishedAt) : ''); el.className = 'at-status wait'; return; }
  el.textContent = saveErr ? '⚠ Non enregistré : ' + saveErr : (saving || dirty) ? '… enregistrement' : lastSaved ? '💾 Enregistré à ' + lastSaved.toLocaleTimeString('fr-FR') : '💾 Tout est enregistré';
  el.className = 'at-status ' + (saveErr ? 'err' : (saving || dirty) ? 'wait' : '');
}
window.addEventListener('beforeunload', e => { if (dirty && D && !RO && !conflict){ save(); e.preventDefault(); e.returnValue = ''; } });

/* ---------- rendu ---------- */
function logo(it, size){
  const c = company(it.nom), u = it.logo || (c && c.logo) || '', st = 'width:' + size + 'px;height:' + size + 'px;';
  return u ? '<img class="at-logo" style="' + st + '" src="' + esc(u) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '<span class="at-logo at-logo-txt" style="' + st + '">' + esc((it.nom || '?').charAt(0).toUpperCase()) + '</span>';
}
function cell(it, k, color, d){
  const r = calc(it, k);
  if (!r) return '<td class="lp-sc"><span class="at-faint">—</span></td>';
  const ec = r.ecart == null ? '' : '<small class="' + (r.ecart <= 0 ? 'pos' : 'neg') + '" title="Cours par rapport au prix juste">' + (r.ecart <= 0 ? 'décote ' : 'surcote ') + fmt(Math.abs(r.ecart) * 100, 0) + ' %</small>';
  return '<td class="lp-sc" style="--c:' + color + '"><div class="lp-juste"><b>' + fmt(r.juste, 2) + ' ' + d + '</b>' + ec + '</div>' +
    '<div class="lp-5a">5 ans : <b>' + fmt(r.p5, 2) + ' ' + d + '</b>' + (r.rdt != null ? ' · <span class="' + (r.rdt >= 0 ? 'pos' : 'neg') + '">' + (r.rdt >= 0 ? '+' : '') + fmt(r.rdt * 100, 1) + ' %/an</span>' : '') + '</div>' +
    '<div class="lp-hyp">multiple ' + fmt(r.mult, 1) + 'x' + (r.cagr != null ? ' · croissance ' + fmt(r.cagr, 1) + ' %/an' : '') + '</div></td>';
}
function rowHtml(it){
  const c = coursOf(it), d = devSym(it.devise), known = !!company(it.nom), hasDoc = window.ATELIER_UI && window.ATELIER_UI.hasDoc(it.nom), rt = ratiosOf(it);
  if (!known && !rt.at) setTimeout(() => fetchTvRatios(it), 0);
  return '<tr data-id="' + it.id + '"' + (ui.focus === it.id ? ' class="focus"' : '') + '><td class="lp-name">' + logo(it, 30) + '<div><b>' + esc(it.nom) + '</b><small>Mis à jour le ' + frDate(it.updatedAt) + '</small></div></td>' +
    '<td class="lp-num"><b>' + fmt(c.v, 2) + ' ' + d + '</b><small>' + (c.v == null ? 'à saisir' : c.auto ? 'cours de l\'appli' : 'saisi') + '</small></td>' +
    '<td class="lp-num lp-r"><b>' + (rt.div == null ? '—' : fmt(rt.div, 2) + ' %') + '</b><small>rendement</small></td>' +
    '<td class="lp-num lp-r"><b>' + (rt.pfcf == null ? '—' : fmt(rt.pfcf, 1) + 'x') + '</b><small>P/FCF actuel</small></td>' +
    '<td class="lp-num"><b>' + fmt(num(it.base), 2) + ' ' + d + '</b><small>' + esc(it.metric || '') + (num(it.dette) ? ' · dette ' + fmt(num(it.dette), 2) : '') + '</small></td>' +
    SC.map(s => cell(it, s[0], s[2], d)).join('') +
    '<td class="lp-acts">' + (known ? '<button type="button" data-a="analyse" title="Ouvrir dans l\'onglet Analyse">📊</button>' : '') +
    (RO && !hasDoc ? '' : '<button type="button" data-a="dossier" title="' + (hasDoc ? 'Ouvrir le dossier dans l\'Atelier d\'analyses' : 'Créer le dossier dans l\'Atelier d\'analyses') + '">🗂' + (hasDoc ? '' : '＋') + '</button>') +
    (RO ? '' : '<button type="button" data-a="edit" title="Modifier">✏</button><button type="button" data-a="del" title="Mettre à la corbeille">🗑</button>') + '</td></tr>' +
    (it.note ? '<tr class="lp-note"' + '><td colspan="9">📝 ' + esc(it.note) + '</td></tr>' : '');
}
function render(){
  const pg = $(PAGE_ID); if (!pg) return;
  if (!serverOk || !D){
    pg.innerHTML = '<div class="at-off"><h2>🎯 Prix par secteur</h2><p>' + (loadErr ? 'Lecture impossible : ' + esc(loadErr) : location.protocol === 'https:' ? 'La liste n\'a pas encore été publiée en ligne.' : 'Le serveur local ne répond pas, ou c\'est une ancienne version : ferme l\'appli puis relance le raccourci Bureau « Wolf Analysis ».') + '</p><button type="button" class="at-btn gold" id="lpRetry">Réessayer</button></div>';
    $('lpRetry').onclick = () => onShow(true); return;
  }
  const q = norm(ui.q), all = Object.values(D.items).filter(it => !q || norm(it.nom + ' ' + (it.sousSecteur || '')).includes(q));
  const groups = sectors().map(s => ({ key: s.key, label: s.label })).concat([{ key: '', label: 'Sans secteur' }]);
  const head = '<thead><tr><th>Entreprise</th><th>Cours</th><th>Dividende</th><th>P/FCF</th><th>Base retenue</th>' + SC.map(s => '<th style="color:' + s[2] + '">' + s[1] + '</th>').join('') + '<th></th></tr></thead>';
  let body = '';
  groups.forEach(g => {
    const list = all.filter(it => (it.secteur || '') === g.key).sort((a, b) => String(a.sousSecteur || '~').localeCompare(String(b.sousSecteur || '~'), 'fr') || a.nom.localeCompare(b.nom, 'fr'));
    // une ligne de titre par sous-secteur
    const rowsHtml = () => { let last = null, h = ''; list.forEach(it => { const ss = it.sousSecteur || 'Autres'; if (ss !== last){ h += '<tr class="lp-sub"><td colspan="9">' + esc(ss) + '</td></tr>'; last = ss; } h += rowHtml(it); }); return h; };
    if (!list.length && (q || g.key === '' || RO)) return;
    const open = ui.open[g.key] !== false;
    body += '<section class="lp-sec"><header><button type="button" class="lp-sec-h" data-tog="' + g.key + '">' + (open ? '▾' : '▸') + ' ' + esc(g.label) + ' <small>' + list.length + '</small></button>' +
      (RO ? '' : '<button type="button" class="at-btn sm" data-add="' + g.key + '">＋ Ajouter une entreprise</button>') + '</header>' +
      (open ? (list.length ? '<div class="lp-scroll"><table class="lp-table">' + head + '<tbody>' + rowsHtml() + '</tbody></table></div>' : '<p class="at-empty">Aucune entreprise dans ce secteur pour l\'instant.</p>') : '') + '</section>';
  });
  pg.innerHTML = '<div class="lp"><div class="lp-top"><div><div class="section-label" style="margin:0;">🎯 Prix par secteur</div><p class="at-faint">Mes prix par scénario, avec la base, la croissance et le multiple que j\'ai retenus. Prix juste = base × multiple ; prix à 5 ans = base × (1 + croissance)⁵ × multiple.</p></div>' +
    '<div class="lp-top-r"><span class="at-status" id="lpStatus"></span><input type="search" class="at-search" id="lpSearch" placeholder="Rechercher une entreprise…" value="' + esc(ui.q) + '">' + (RO ? '' : '<button type="button" class="at-btn gold" data-add="">＋ Ajouter une entreprise</button>') + '</div></div>' +
    (conflict ? '<div class="at-conflict">⚠ Liste modifiée dans un autre onglet : recharge la page avant de continuer.</div>' : '') + body +
    (!RO && D.trash.length ? '<section class="lp-sec"><header><button type="button" class="lp-sec-h" data-tog="_trash">' + (ui.open._trash ? '▾' : '▸') + ' Corbeille <small>' + D.trash.length + '</small></button></header>' +
      (ui.open._trash ? D.trash.map((t, i) => '<div class="at-trash-row"><span>' + esc(t.nom) + '</span><small>' + frDate(t.deletedAt) + '</small><button type="button" class="at-btn sm" data-restore="' + i + '">↶ Restaurer</button></div>').join('') : '') + '</section>' : '') +
    '</div><div id="lpModalHost"></div>';
  status(); wire();
  if (ui.modal) renderModal();
  if (ui.focus){ const tr = pg.querySelector('tr.focus'); if (tr) tr.scrollIntoView({ block: 'center' }); setTimeout(() => { ui.focus = null; }, 2500); }
}
function wire(){
  const pg = $(PAGE_ID), s = $('lpSearch');
  if (s) s.oninput = () => { ui.q = s.value; const p = s.selectionStart; render(); const n = $('lpSearch'); n.focus(); n.setSelectionRange(p, p); };
  pg.onclick = e => {
    const b = e.target.closest('button'); if (!b || b.closest('#lpModalHost')) return;
    const ds = b.dataset;
    if (ds.tog !== undefined){ ui.open[ds.tog] = ds.tog === '_trash' ? !ui.open._trash : ui.open[ds.tog] === false; return render(); }
    if (ds.add !== undefined){ ui.modal = { it: { id: null, nom: '', secteur: ds.add, sousSecteur: '', devise: 'EUR', metric: METRICS[0], sc: { pess: {}, real: {}, opt: {} } } }; return renderModal(); }
    if (ds.restore !== undefined){ const t = D.trash.splice(+ds.restore, 1)[0]; if (t){ delete t.deletedAt; D.items[t.id] = t; markDirty(); } return render(); }
    const tr = b.closest('tr[data-id]'), it = tr && D.items[tr.dataset.id]; if (!it) return;
    if (ds.a === 'edit'){ ui.modal = { it: JSON.parse(JSON.stringify(it)) }; return renderModal(); }
    if (ds.a === 'del'){ delete D.items[it.id]; it.deletedAt = new Date().toISOString(); D.trash.unshift(it); markDirty(); return render(); }
    if (ds.a === 'analyse'){ const c = company(it.nom); if (c && typeof goToAnalyse === 'function') goToAnalyse(c.key); return; }
    if (ds.a === 'dossier' && window.ATELIER_UI) return window.ATELIER_UI.openFor(it.nom, { secteur: it.secteur, sousSecteur: it.sousSecteur, logo: it.logo || '' });
  };
}
function renderModal(){
  const host = $('lpModalHost'); if (!host) return;
  const m = ui.modal; if (!m){ host.innerHTML = ''; return; }
  const it = m.it, v = x => x == null ? '' : esc(String(x).replace('.', ','));
  const names = typeof companies !== 'undefined' ? Object.keys(companies).slice(0, 4000) : [];
  const subs = [...new Set(Object.values(D.items).map(x => x.sousSecteur).filter(Boolean))];
  host.innerHTML = '<div class="at-modal-bg"><div class="at-modal lp-modal"><h3>' + (it.id ? 'Modifier ' + esc(it.nom) : 'Ajouter une entreprise') + '</h3>' +
    '<div class="at-row2"><label>Entreprise<input type="text" class="at-in" id="lpNom" list="lpNames" autocomplete="off" value="' + esc(it.nom) + '"><datalist id="lpNames">' + names.map(n => '<option value="' + esc(typeof fmpDisplayName === 'function' ? fmpDisplayName(n) : n) + '">').join('') + '</datalist></label>' +
    '<label>Secteur<select class="at-sel" id="lpSec"><option value="">— Sans secteur —</option>' + sectors().map(s => '<option value="' + s.key + '"' + (it.secteur === s.key ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('') + '</select></label></div>' +
    '<div class="at-row2"><label>Sous-secteur<input type="text" class="at-in" id="lpSub" list="lpSubs" value="' + esc(it.sousSecteur || '') + '"><datalist id="lpSubs">' + subs.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist></label>' +
    '<label>Devise<select class="at-sel" id="lpDev">' + ['EUR', 'USD', 'GBP', 'GBX', 'CHF', 'JPY', 'SEK', 'DKK', 'CAD', 'HKD'].map(d => '<option' + (it.devise === d ? ' selected' : '') + '>' + d + '</option>').join('') + '</select></label></div>' +
    '<div class="lp-fill"><button type="button" class="at-btn sm" id="lpFill">↺ Préremplir depuis l\'onglet Analyse</button><span class="at-faint" id="lpFillMsg">Cours, FCF par action, secteur et devise connus de l\'appli.</span></div>' +
    '<div class="lp-grid3"><label>Cours actuel<input type="text" inputmode="decimal" class="at-in" id="lpCours" value="' + v(it.cours) + '" placeholder="auto si l\'entreprise est connue"></label>' +
    '<label>Base utilisée<select class="at-sel" id="lpMetric">' + METRICS.map(x => '<option' + (it.metric === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
    '<label>Valeur de la base (par action)<input type="text" inputmode="decimal" class="at-in" id="lpBase" value="' + v(it.base) + '" placeholder="ex. 12,40"></label></div>' +
    '<label>Dette nette par action à retirer (EV/EBITDA seulement, sinon vide)<input type="text" inputmode="decimal" class="at-in" id="lpDette" value="' + v(it.dette) + '" placeholder="vide = 0"></label>' +
    '<div class="lp-scs">' + SC.map(s => { const x = (it.sc || {})[s[0]] || {};
      return '<div class="lp-scf" style="--c:' + s[2] + '"><b>' + s[1] + '</b><label>Croissance par an (%)<input type="text" inputmode="decimal" class="at-in" data-sc="' + s[0] + '" data-f="cagr" value="' + v(x.cagr) + '"></label>' +
        '<label>Multiple<input type="text" inputmode="decimal" class="at-in" data-sc="' + s[0] + '" data-f="mult" value="' + v(x.mult) + '"></label><div class="lp-prev" data-prev="' + s[0] + '"></div></div>'; }).join('') + '</div>' +
    '<label>Note (facultatif)<input type="text" class="at-in" id="lpNote" value="' + esc(it.note || '') + '" placeholder="ex. multiple = médiane P/FCF sur 10 ans"></label>' +
    '<div class="at-mbtns"><span class="at-warn" id="lpErr"></span><span style="flex:1"></span><button type="button" class="at-btn" id="lpCancel">Annuler</button><button type="button" class="at-btn gold" id="lpOk">Enregistrer</button></div></div></div>';
  const bg = host.firstElementChild, close = () => { ui.modal = null; host.innerHTML = ''; };
  const read = () => { const o = Object.assign({}, it, { nom: $('lpNom').value.trim(), secteur: $('lpSec').value, sousSecteur: $('lpSub').value.trim(), devise: $('lpDev').value, cours: num($('lpCours').value), metric: $('lpMetric').value, base: num($('lpBase').value), dette: num($('lpDette').value), note: $('lpNote').value.trim(), sc: {} });
    SC.forEach(s => { o.sc[s[0]] = { cagr: num(bg.querySelector('[data-sc="' + s[0] + '"][data-f="cagr"]').value), mult: num(bg.querySelector('[data-sc="' + s[0] + '"][data-f="mult"]').value) }; }); return o; };
  const preview = () => { const o = read(), d = devSym(o.devise); SC.forEach(s => { const r = calc(o, s[0]), el = bg.querySelector('[data-prev="' + s[0] + '"]');
    el.innerHTML = r ? 'Prix juste <b>' + fmt(r.juste, 2) + ' ' + d + '</b><br>Dans 5 ans <b>' + fmt(r.p5, 2) + ' ' + d + '</b>' + (r.rdt != null ? '<br>Rendement <b>' + fmt(r.rdt * 100, 1) + ' %/an</b>' : '') : '<span class="at-faint">base et multiple à saisir</span>'; }); };
  bg.addEventListener('input', preview); bg.addEventListener('change', preview); preview();
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  $('lpCancel').onclick = close;
  $('lpFill').onclick = () => { const c = company($('lpNom').value);
    if (!c){ $('lpFillMsg').textContent = 'Entreprise inconnue de l\'onglet Analyse : saisis les chiffres à la main.'; return; }
    if (c.cours != null) $('lpCours').value = String(+c.cours.toFixed(2)).replace('.', ',');
    if (c.fcf != null){ $('lpBase').value = String(+c.fcf.toFixed(2)).replace('.', ','); $('lpMetric').value = METRICS[0]; }
    if (c.secteur && !$('lpSec').value) $('lpSec').value = c.secteur;
    if (c.sousSecteur && !$('lpSub').value) $('lpSub').value = c.sousSecteur;
    if ([...$('lpDev').options].some(o => o.value === c.devise)) $('lpDev').value = c.devise;
    $('lpFillMsg').textContent = 'Repris : cours' + (c.fcf != null ? ' et FCF par action' : '') + '. Vérifie puis saisis tes scénarios.'; preview(); };
  $('lpOk').onclick = () => { const o = read();
    if (!o.nom){ $('lpErr').textContent = 'Indique le nom de l\'entreprise.'; $('lpNom').focus(); return; }
    if (o.base == null){ $('lpErr').textContent = 'Indique la valeur de la base par action.'; $('lpBase').focus(); return; }
    if (!o.id && Object.values(D.items).some(x => norm(x.nom) === norm(o.nom))){ $('lpErr').textContent = 'Cette entreprise est déjà dans la liste.'; return; }
    const c = company(o.nom); if (c && !o.logo) o.logo = c.logo;
    o.id = o.id || uid(); o.updatedAt = new Date().toISOString(); D.items[o.id] = o; ui.focus = o.id; ui.open[o.secteur || ''] = true;
    markDirty(); close(); render(); };
  if (!it.id) $('lpNom').focus();
}

/* ---------- liens avec le reste de l'appli ---------- */
// Pastille affichée dans la barre d'un dossier de l'Atelier : les 3 prix justes, cliquable vers cette liste.
function chip(name){
  if (!D) return '';
  const it = Object.values(D.items).find(x => norm(x.nom) === norm(name)); if (!it) return '';
  const d = devSym(it.devise), parts = SC.map(s => { const r = calc(it, s[0]); return r ? '<span style="color:' + s[2] + '">' + fmt(r.juste, 0) + '</span>' : null; }).filter(Boolean);
  return parts.length ? ' <button type="button" class="at-crumb lp-chip" data-goprix="' + it.id + '" title="Mes prix justes pessimiste / réaliste / optimiste — ouvrir la liste">🎯 ' + parts.join(' · ') + ' ' + d + '</button>' : '';
}
async function show(id){ if (typeof switchPage === 'function') switchPage(PAGE_ID); ui.focus = id || null; if (id && D && D.items[id]) ui.open[D.items[id].secteur || ''] = true; await onShow(); }
async function snapshot(){ if (!D || RO) await load(); if (!D || RO) return null; return { version: 1, publishedAt: new Date().toISOString(), items: D.items }; }
async function onShow(force){ if (!D || force === true) await load(); render(); }
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-page="' + PAGE_ID + '"]'); if (b) setTimeout(onShow, 0); });
// chargé dès l'ouverture de l'appli : la pastille de prix doit être disponible dans l'Atelier sans passer par cette page
load().catch(() => {});
window.PRIX_UI = { onShow, show, chip, snapshot, _state: () => ({ D, RO, ui }), _calc: calc };
})();
