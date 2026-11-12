/* =====================================================================
   Sauvegardes (2026-11-11) — panneau « 🛟 Sauvegardes » + fichier de secours.

   Ce que le serveur local (.claude/static-server.ps1, v=17) fait déjà à CHAQUE enregistrement :
   écriture atomique, refus d'une révision périmée (autre onglet), refus de toute opération / tout dossier
   disparu sans suppression voulue, copie datée (1 / 10 min, la dernière de chaque jour gardée pour toujours),
   copie à part avant une restauration ou si le fichier fond d'un coup, copie du jour hors projet
   (Documents\Wolf Analysis - sauvegardes, 3 ans), copie mensuelle jamais supprimée, et réparation automatique
   d'un fichier abîmé à partir de la dernière copie valide.

   Ce module ajoute :
   - window.wolfRescue(nom, contenu) : quand un enregistrement est REFUSÉ (conflit entre onglets...), ce que
     l'appli avait en mémoire est écrit dans un fichier de secours (dossier secours/), jamais perdu ;
   - le panneau qui liste toutes les copies et permet de revenir à l'une d'elles (l'état actuel est gardé à part).
   ===================================================================== */
(function(){
'use strict';
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const STORES = [
  ['portefeuilles', 'Mes portefeuilles (PEA, CTO, Wolf, épargne)'],
  ['atelier', 'Atelier d\'analyses'],
  ['objectifs', 'Objectifs de valorisation'],
  ['multiples', 'EV/EBITDA historiques'],
  ['prix', 'Prix par secteur'],
  ['studio', 'Wolf Studio (miniatures, short)'],
];
const KIND = { backups: 'Copie automatique', mensuel: 'Copie mensuelle', secours: 'Secours (enregistrement refusé)' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fdt = iso => { try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch(e){ return iso; } };
const fsz = n => n > 1048576 ? (n / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
const H = { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' };

// ---------- secours : ne jamais perdre ce qui est en mémoire ----------
window.wolfRescue = async function(name, content){
  if (!isLocal) return false;
  try {
    const body = typeof content === 'string' ? content : JSON.stringify(content);
    const r = await fetch('/api/store/rescue?name=' + encodeURIComponent(name), { method: 'POST', headers: H, body });
    return r.ok;
  } catch(e){ return false; }
};

// ---------- résumé lisible d'un fichier (pour choisir la bonne copie) ----------
function summary(name, d){
  if (!d) return 'vide';
  try {
    if (name === 'portefeuilles'){
      const a = d.accounts || {}, n = k => (a[k] && a[k].ops ? a[k].ops.length : 0);
      return (n('pea') + n('cto') + n('wolf')) + ' opérations (PEA ' + n('pea') + ', CTO ' + n('cto') + ', Wolf ' + n('wolf') + ')' + (d.epargne && d.epargne.entries ? ', ' + d.epargne.entries.length + ' relevés d\'épargne' : '');
    }
    if (name === 'atelier'){
      const docs = Object.values(d.docs || {});
      const cards = docs.reduce((s, x) => s + (x.versions || []).reduce((t, v) => t + Object.keys(v.cards || v.nodes || {}).length, 0), 0);
      return docs.length + ' dossiers, ' + cards + ' cartes';
    }
    if (name === 'studio') return Object.keys(d.items || {}).length + ' miniatures enregistrées';
    if (name === 'objectifs') return Object.keys(d.objectifs || {}).length + ' entreprises avec objectifs';
    if (name === 'prix'){ const n = Object.values(d).filter(Array.isArray).reduce((s, x) => s + x.length, 0); return n ? n + ' lignes' : Object.keys(d).length + ' rubriques'; }
    return Object.keys(d).filter(k => !/^(version|revision|baseRevision|savedAt|deleted)$/.test(k)).length + ' rubriques';
  } catch(e){ return '—'; }
}

// ---------- panneau ----------
let host = null, open = {}, pending = null;   // pending = { name, dir, file, data, cur }
async function getJson(url){ const r = await fetch(url, { cache: 'no-store' }); const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.error || 'erreur ' + r.status); return j; }

async function render(){
  if (!host) return;
  host.innerHTML = '<div class="at-modal sv-modal" role="dialog" aria-label="Sauvegardes"><div class="sv-head"><h3>🛟 Sauvegardes</h3><button type="button" class="sv-x" data-sv-close aria-label="Fermer">✕</button></div><p class="sv-faint">Lecture des copies…</p></div>';
  const lists = await Promise.all(STORES.map(([n]) => getJson('/api/store/backups?name=' + n).catch(e => ({ error: e.message }))));
  const ext = (lists.find(l => l && l.ext) || {}).ext || '';
  const dir = (lists.find(l => l && l.dir) || {}).dir || '';
  let html = '<div class="at-modal sv-modal" role="dialog" aria-label="Sauvegardes"><div class="sv-head"><h3>🛟 Sauvegardes</h3><button type="button" class="sv-x" data-sv-close aria-label="Fermer">✕</button></div>' +
    '<div class="sv-layers"><b>Protections actives à chaque enregistrement</b><ul>' +
    '<li>Écriture sans risque de fichier à moitié écrit ; un fichier abîmé est réparé tout seul depuis la dernière copie valide.</li>' +
    '<li>Refus de toute opération ou de tout dossier qui disparaîtrait sans que tu l\'aies supprimé.</li>' +
    '<li>Copie datée toutes les 10 minutes d\'activité ; la dernière de chaque jour est gardée pour toujours.</li>' +
    '<li>Copie à part avant une restauration, ou si un fichier perd brutalement du contenu.</li>' +
    '<li>Enregistrement refusé (deux onglets ouverts…) : ce que tu avais à l\'écran part dans un fichier de secours.</li>' +
    '<li>Copie hors du projet : <code>' + esc(ext || '—') + '</code> (une par jour, 3 ans) et une copie par mois jamais supprimée.</li>' +
    '</ul><p class="sv-warn">⚠ Toutes ces copies sont sur ce PC. En cas de panne du disque ou de vol, il faut une copie ailleurs (voir la conversation avec Claude).</p></div>';
  STORES.forEach(([n, label], i) => {
    const l = lists[i] || {};
    if (l.error){ html += '<section class="sv-store"><h4>' + esc(label) + '</h4><p class="sv-err">⚠ ' + esc(l.error) + ' (serveur à relancer ?)</p></section>'; return; }
    const copies = l.copies || [], by = k => copies.filter(c => c.dir === k).length;
    html += '<section class="sv-store"><div class="sv-row"><h4>' + esc(label) + '</h4><span class="sv-faint">' + (l.main ? 'enregistré le ' + fdt(l.main.at) + ' · ' + fsz(l.main.size) : 'pas encore de fichier') + '</span>' +
      '<button type="button" class="sv-btn" data-sv-toggle="' + n + '">' + (open[n] ? 'Masquer' : 'Voir les ' + copies.length + ' copies') + '</button></div>' +
      '<div class="sv-faint">' + by('backups') + ' automatiques · ' + by('mensuel') + ' mensuelles · ' + by('secours') + ' de secours' + (copies[0] ? ' · la plus récente : ' + fdt(copies[0].at) : '') + '</div>';
    if (open[n]){
      html += '<div class="sv-list">' + copies.slice(0, 120).map(c => {
        const special = /avant-restauration/.test(c.file) ? 'Avant une restauration' : /avant-reduction/.test(c.file) ? 'Avant une forte réduction' : /corrompu/.test(c.file) ? 'Fichier abîmé (mis de côté)' : KIND[c.dir];
        const isPending = pending && pending.name === n && pending.file === c.file && pending.dir === c.dir;
        return '<div class="sv-item' + (isPending ? ' on' : '') + '"><span>' + fdt(c.at) + '</span><span class="sv-kind">' + esc(special) + '</span><span class="sv-faint">' + fsz(c.size) + '</span>' +
          (/corrompu/.test(c.file) ? '<span></span>' : '<button type="button" class="sv-btn" data-sv-pick="' + n + '|' + c.dir + '|' + esc(c.file) + '">Revenir à cette copie</button>') + '</div>' +
          (isPending ? pendingHtml() : '');
      }).join('') + (copies.length > 120 ? '<p class="sv-faint">… ' + (copies.length - 120) + ' copies plus anciennes (dans ' + esc(dir) + ')</p>' : '') + '</div>';
    }
    html += '</section>';
  });
  html += '<p class="sv-faint">Les copies sont dans <code>' + esc(dir) + '</code> (dossiers backups, mensuel, secours).</p></div>';
  host.innerHTML = html;
}
function pendingHtml(){
  const p = pending;
  if (p.error) return '<div class="sv-confirm err">⚠ ' + esc(p.error) + '</div>';
  if (!p.data) return '<div class="sv-confirm">Lecture de la copie…</div>';
  return '<div class="sv-confirm"><div><b>Cette copie :</b> ' + esc(summary(p.name, p.data)) + '</div><div><b>Aujourd\'hui :</b> ' + esc(summary(p.name, p.cur)) + '</div>' +
    '<p>L\'état actuel sera gardé à part (copie « avant une restauration ») : tu pourras y revenir. La page se recharge ensuite.</p>' +
    '<div class="sv-actions"><button type="button" class="sv-btn gold" data-sv-restore' + (p.busy ? ' disabled' : '') + '>' + (p.busy ? 'Restauration…' : 'Confirmer : revenir à cette copie') + '</button><button type="button" class="sv-btn" data-sv-cancel>Annuler</button></div></div>';
}
async function pick(name, dir, file){
  pending = { name, dir, file };
  open[name] = true; render();
  try {
    const [c, cur] = await Promise.all([getJson('/api/store/backup?name=' + name + '&dir=' + dir + '&file=' + encodeURIComponent(file)), getJson('/api/store/load?name=' + name)]);
    if (!pending || pending.file !== file) return;
    pending.data = c.data; pending.cur = cur.data;
    if (!c.data || c.data.version !== 1) pending.error = 'Cette copie n\'a pas le bon format : elle ne peut pas être restaurée.';
  } catch(e){ if (pending) pending.error = e.message; }
  render();
}
async function restore(){
  const p = pending; if (!p || !p.data || p.busy) return;
  p.busy = true; render();
  try {
    const cur = (await getJson('/api/store/load?name=' + p.name)).data || {};
    const rev = cur.revision || 0, data = p.data;
    let deleted = [];
    if (p.name === 'portefeuilles'){
      const ids = s => Object.values((s && s.accounts) || {}).flatMap(a => (a.ops || []).map(o => String(o.id)));
      const keep = new Set(ids(data)); deleted = ids(cur).filter(x => !keep.has(x));
    } else if (p.name === 'atelier'){
      const keep = new Set(Object.keys(data.docs || {})); deleted = Object.keys(cur.docs || {}).filter(x => !keep.has(x));
    } else if (p.name === 'studio'){
      const keep = new Set(Object.keys(data.items || {})); deleted = Object.keys(cur.items || {}).filter(x => !keep.has(x));
    }
    const body = Object.assign({}, data, { version: 1, revision: rev + 1, baseRevision: rev, deleted, savedAt: new Date().toISOString(), restoredFrom: p.dir + '/' + p.file });
    const r = await fetch('/api/store/save?name=' + p.name, { method: 'POST', headers: Object.assign({ 'X-Wolf-Restore': '1' }, H), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || 'restauration refusée');
    p.error = null; host.innerHTML = '<div class="at-modal sv-modal"><h3>✔ Copie restaurée</h3><p>La page se recharge…</p></div>';
    setTimeout(() => location.reload(), 900);
  } catch(e){ p.busy = false; p.error = 'Restauration impossible : ' + e.message + '. Rien n\'a été modifié.'; render(); }
}
function openPanel(){
  if (!host){
    host = document.createElement('div'); host.className = 'at-modal-bg sv-bg';
    host.addEventListener('click', e => {
      if (e.target === host || e.target.closest('[data-sv-close]')){ host.remove(); host = null; pending = null; return; }
      const t = e.target.closest('[data-sv-toggle]'); if (t){ open[t.dataset.svToggle] = !open[t.dataset.svToggle]; render(); return; }
      const pk = e.target.closest('[data-sv-pick]'); if (pk){ const [n, d, f] = pk.dataset.svPick.split('|'); pick(n, d, f); return; }
      if (e.target.closest('[data-sv-cancel]')){ pending = null; render(); return; }
      if (e.target.closest('[data-sv-restore]')) restore();
    });
    document.addEventListener('keydown', function k(e){ if (e.key === 'Escape' && host){ host.remove(); host = null; pending = null; } });
    document.body.appendChild(host);
  }
  render();
}
window.WOLF_SAUVEGARDES = { open: openPanel, summary };
function addButton(){
  if (!isLocal || document.getElementById('backupBtn')) return;
  const ref = document.getElementById('publishBtn') || document.getElementById('refreshBtn'); if (!ref){ setTimeout(addButton, 500); return; }
  const b = document.createElement('button'); b.type = 'button'; b.id = 'backupBtn'; b.className = 'refresh-btn publish-btn'; b.textContent = '🛟 Sauvegardes';
  b.title = 'Voir toutes les copies de tes données et revenir à l\'une d\'elles';
  b.addEventListener('click', openPanel);
  ref.parentNode.insertBefore(b, ref.nextSibling);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
})();
