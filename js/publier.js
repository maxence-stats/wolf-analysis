/* ================================================================================================
   PUBLIER EN LIGNE + VERSION À JOUR (2026-11-10)
   ------------------------------------------------------------------------------------------------
   Les données vivent dans des fichiers du PC (serveur local). Le site public (GitHub Pages, ouvert depuis un téléphone
   ou un autre ordinateur) n'a pas ce serveur : il lit des COPIES EN LECTURE SEULE rangées dans data/public/.
   Le bouton « 🌐 Publier en ligne » (visible seulement sur le PC) prépare ces copies et les envoie sur GitHub :
     - Wolf Portfolio seul (JAMAIS le PEA ni le CTO : la copie est construite par MP_UI.publicSnapshot),
     - Atelier d'analyses (sans la corbeille) et ses images,
     - Prix par secteur,
     - données de l'onglet Analyse (data/tv-analyse.json, choix de l'utilisateur du 2026-11-10).
   Rien n'est publié automatiquement : uniquement au clic.

   VERSION À JOUR : quand l'onglet redevient visible (ou toutes les 10 minutes), la page compare sa version à celle du
   serveur et se recharge seule s'il y en a une plus récente et qu'aucune saisie n'est en cours.
   ================================================================================================ */
(function(){
'use strict';
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const post = (url, body, raw) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' }, body: raw ? body : JSON.stringify(body) });

function setMsg(t, kind){
  let el = document.getElementById('publishMsg');
  if (!el){ el = document.createElement('div'); el.id = 'publishMsg'; el.className = 'at-toast'; document.body.appendChild(el); }
  el.innerHTML = '<span></span>'; el.firstChild.textContent = t;
  el.style.borderColor = kind === 'err' ? 'var(--red)' : kind === 'ok' ? 'var(--green)' : '';
  el.classList.add('on');
  clearTimeout(setMsg.tm); if (kind) setMsg.tm = setTimeout(() => el.classList.remove('on'), kind === 'err' ? 12000 : 7000);
}
async function publish(btn){
  if (btn.disabled) return; btn.disabled = true;
  try {
    setMsg('Préparation des copies à publier…');
    const done = [];
    const send = async (name, data) => { const r = await post('/api/publish/file?name=' + name, data); const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(name + ' : ' + (j.error || 'refusé')); };
    const wolf = window.MP_UI && window.MP_UI.publicSnapshot ? await window.MP_UI.publicSnapshot() : null;
    if (wolf){
      // garde-fou : la copie ne doit contenir AUCUNE opération du PEA ni du CTO
      if ((wolf.D.accounts.pea.ops || []).length || (wolf.D.accounts.cto.ops || []).length) throw new Error('copie du portefeuille invalide (comptes personnels présents) : rien n\'a été publié');
      await send('portefeuille-wolf.json', wolf); done.push('Wolf Portfolio');
    }
    const at = window.ATELIER_UI && window.ATELIER_UI.snapshot ? await window.ATELIER_UI.snapshot() : null;
    if (at){ await send('atelier.json', at.data); done.push('Atelier d\'analyses'); }
    const px = window.PRIX_UI && window.PRIX_UI.snapshot ? await window.PRIX_UI.snapshot() : null;
    if (px){ await send('prix.json', px); done.push('Prix par secteur'); }
    setMsg('Envoi sur le site public…');
    const r = await post('/api/publish/go', { media: at ? at.media : [], tv: true });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error((j.error || 'envoi refusé') + (j.log ? ' — ' + String(j.log).trim().split('\n').pop() : ''));
    if (j.tv) done.push('données de l\'onglet Analyse');
    setMsg(j.test ? '🧪 Instance de test : copies écrites, rien n\'a été envoyé.' : '🌐 Publié : ' + done.join(', ') + '. Le site public se met à jour d\'ici 1 à 2 minutes.', 'ok');
  } catch(e){ setMsg('⚠ Publication impossible : ' + (e.message || 'erreur'), 'err'); }
  btn.disabled = false;
}
function addButton(){
  if (!isLocal) return;
  const ref = document.getElementById('refreshBtn'); if (!ref || document.getElementById('publishBtn')) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'publishBtn'; b.className = 'refresh-btn publish-btn'; b.textContent = '🌐 Publier en ligne';
  b.title = 'Met à jour le site public (téléphone, autres ordinateurs) : Wolf Portfolio, Atelier d\'analyses, Prix par secteur, onglet Analyse. Jamais le PEA ni le CTO.';
  b.addEventListener('click', () => publish(b));
  ref.parentNode.insertBefore(b, ref.nextSibling);
}

/* ---------- toujours la dernière version ---------- */
const myVersion = () => [...document.querySelectorAll('script[src*="?v="], link[href*="?v="]')].map(e => (e.getAttribute('src') || e.getAttribute('href'))).join('|');
let checking = false;
async function checkVersion(){
  if (checking || document.hidden) return; checking = true;
  try {
    const r = await fetch('index.html?_=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw 0;
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const remote = [...doc.querySelectorAll('script[src*="?v="], link[href*="?v="]')].map(e => (e.getAttribute('src') || e.getAttribute('href'))).join('|');
    const a = document.activeElement, typing = a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
    const busy = typing || document.querySelector('.at-modal-bg, .mp-modal-bg, .at-fiche, .stylo-on');
    if (remote && remote !== myVersion() && !busy) location.reload();
  } catch(e){ /* hors ligne : on réessaiera */ }
  checking = false;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
setInterval(checkVersion, 10 * 60 * 1000);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
})();
