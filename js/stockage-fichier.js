/* ============================================================
   DONNÉES DU NAVIGATEUR RECOPIÉES DANS UN FICHIER (2026-11-14)
   Demande de l'utilisateur : tout ce qu'il saisit doit être dans Google Drive. Plusieurs onglets ne gardaient leurs
   données QUE dans le navigateur (localStorage) : Watchlist, Tier list, Alertes, Idées, Revue, Dividende, Construction,
   Concurrents, Wolf Labo… Ce module recopie ces rubriques dans data/mes-portefeuilles/navigateur.json (store
   « navigateur » du serveur : révisions, copies datées, copie mensuelle, copie dans Documents = Google Drive).

   Chargé AVANT app.js. Chaque écriture localStorage d'une rubrique suivie est envoyée au fichier 1,5 s plus tard.
   Au démarrage, une rubrique plus récente dans le fichier que dans ce navigateur (autre navigateur, autre port,
   navigateur vidé) est remise dans localStorage, puis la page se recharge UNE fois pour que l'appli la relise.
   Horodatage par rubrique : le plus récent gagne. Rien n'est jamais retiré du fichier (une rubrique effacée
   y est gardée avec la valeur null), et le serveur refuse toute disparition non déclarée.
   ============================================================ */
(function(){
'use strict';
if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;   // site public : pas de serveur local
const KEYS = ['wolfAnalysisWatchlist', 'wolfAnalysisWatchlistCustom', 'wolfAnalysisAlertes', 'wolfAnalysisIdees', 'wolfAnalysisIdeesArchive',
  'wolfAnalysisIdeesLastMonth', 'wolfAnalysisRevue', 'wolfAnalysisDividendPortfolio', 'wolfAnalysisTierList', 'wolfAnalysisTierListHistory',
  'wolfTierListLogos', 'wolfAnalysisConstruction', 'wolfAnalysisCompetiteurs', 'wolfAnalysisAnalyseScores', 'wolfAnalysisLaboDrawings',
  'wolfAnalysisLaboExperiments', 'wolfAnalysisLaboLists', 'wolfAnalysisLaboSketches', 'wolfAnalysisLaboStylePresets', 'wolfAnalysisLaboChartStyle',
  'wolfAnalysisValoFcfOverrides', 'wolfAnalysisValoMetric', 'wolfMultiplesHisto', 'wolfIaAchatsEnAttente', 'wolfPubPrefs', 'wolfAnalyseV3'];
const TRACK = new Set(KEYS);
const META = 'wolfFichierSyncMeta';          // { rubrique: date (ms) de la dernière modification connue dans CE navigateur }
const RELOADED = 'wolfFichierRecharge';
const H = { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' };
let ls;
try { ls = window.localStorage; } catch(e){ return; }
const origSet = Storage.prototype.setItem, origRemove = Storage.prototype.removeItem;
let meta = {};
try { meta = JSON.parse(ls.getItem(META) || '{}') || {}; } catch(e){ meta = {}; }
const saveMeta = () => { try { origSet.call(ls, META, JSON.stringify(meta)); } catch(e){} };
let D = null, loaded = false, timer = null, busy = false;
const dirty = new Set();
const status = { state: 'chargement', at: null, error: null };
window.WOLF_FICHIER = { status, keys: KEYS, flush: () => flush() };

function mark(k){ meta[k] = Date.now(); saveMeta(); dirty.add(k); schedule(); }
Storage.prototype.setItem = function(k, v){
  origSet.call(this, k, v);
  if (this === ls && TRACK.has(k)) mark(k);
};
Storage.prototype.removeItem = function(k){
  origRemove.call(this, k);
  if (this === ls && TRACK.has(k)) mark(k);
};
function schedule(){ if (!loaded) return; clearTimeout(timer); timer = setTimeout(flush, 1500); }

async function loadFile(){
  const r = await fetch('/api/store/load?name=navigateur', { cache: 'no-store' });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j.data && j.data.keys ? j.data : { version: 1, revision: (j.data && j.data.revision) || 0, keys: {} };
}
async function init(){
  try { D = await loadFile(); }
  catch(e){ status.state = 'erreur'; status.error = 'fichier injoignable (' + e.message + ') : données gardées dans le navigateur seulement'; return; }
  let restored = 0;
  KEYS.forEach(k => {
    const f = D.keys[k], local = ls.getItem(k), lat = meta[k] || 0;
    if (f && (f.at || 0) > lat && f.v !== local){
      // le fichier est plus récent (autre navigateur, autre port, navigateur vidé) : il gagne
      if (f.v == null) origRemove.call(ls, k); else origSet.call(ls, k, f.v);
      meta[k] = f.at; restored++;
    } else if ((local != null || f) && (!f || f.v !== local)){
      if (!meta[k]) meta[k] = Date.now();
      dirty.add(k);
    }
  });
  saveMeta();
  if (restored){
    let again = false; try { again = !!sessionStorage.getItem(RELOADED); } catch(e){}
    if (!again){ try { sessionStorage.setItem(RELOADED, '1'); } catch(e){} location.reload(); return; }
  }
  try { sessionStorage.removeItem(RELOADED); } catch(e){}
  loaded = true; status.state = 'ok';
  if (dirty.size) flush();
}
async function flush(retried){
  if (!loaded || busy || !dirty.size) return;
  busy = true; clearTimeout(timer);
  const ks = [...dirty]; dirty.clear();
  const next = { version: 1, keys: Object.assign({}, D.keys) };
  ks.forEach(k => {
    const at = meta[k] || Date.now(), cur = next.keys[k];
    if (!cur || at >= (cur.at || 0)) next.keys[k] = { v: ls.getItem(k), at };
  });
  const rev = D.revision || 0;
  next.revision = rev + 1; next.baseRevision = rev; next.savedAt = new Date().toISOString();
  let ok = false, conflict = false, err = null;
  try {
    const r = await fetch('/api/store/save?name=navigateur', { method: 'POST', headers: H, body: JSON.stringify(next) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok){ delete next.baseRevision; next.revision = j.revision; D = next; ok = true; }
    else if (r.status === 409) conflict = true;
    else err = j.error || ('HTTP ' + r.status);
  } catch(e){ err = 'serveur local injoignable'; }
  busy = false;
  if (ok){ status.state = 'ok'; status.at = Date.now(); status.error = null; if (dirty.size) schedule(); return; }
  ks.forEach(k => dirty.add(k));
  if (conflict && !retried){
    // un autre onglet a écrit : on relit le fichier et on refait la fusion (le plus récent gagne, rubrique par rubrique)
    try { D = await loadFile(); } catch(e){}
    return flush(true);
  }
  status.state = 'erreur'; status.error = err || 'enregistrement refusé';
  if (window.wolfRescue) window.wolfRescue('navigateur', next);
  timer = setTimeout(flush, 30000);   // nouvel essai plus tard ; les données restent aussi dans le navigateur
}
// fermeture de l'onglet : dernier envoi (petits volumes)
window.addEventListener('pagehide', () => {
  if (!loaded || !dirty.size) return;
  const next = { version: 1, keys: Object.assign({}, D.keys) };
  dirty.forEach(k => { next.keys[k] = { v: ls.getItem(k), at: meta[k] || Date.now() }; });
  const rev = D.revision || 0; next.revision = rev + 1; next.baseRevision = rev;
  const body = JSON.stringify(next);
  if (body.length < 60000) try { fetch('/api/store/save?name=navigateur', { method: 'POST', headers: H, body, keepalive: true }); } catch(e){}
});
init();
})();
