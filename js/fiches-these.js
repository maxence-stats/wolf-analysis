/* Fiches thèse du loup (2026-11-15) — bloc « 📄 Mes fiches thèse » de l'onglet Valorisation.
   Les fiches sont faites par le skill wolf-fiche-these (generer_fiche.py), qui envoie le PDF et les 2 aperçus au serveur
   (/api/atelier/media, jamais supprimés) et ajoute une entrée dans le fichier data/mes-portefeuilles/fiches.json (store « fiches ») :
   { version, revision, items:{ id:{ id, entreprise, symbole, date, createdAt, pdf, pages:[png, png], cours, devise, verdict,
     ecart, justes:{pess,real,opt}, decision:{mot,texte} } }, trash:[] }.
   Une nouvelle fiche de la même entreprise = une nouvelle version (l'ancienne reste). Supprimer = corbeille (« ↶ Annuler »). */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const media = f => '/api/atelier/media?f=' + encodeURIComponent(f);
  const DEV = { USD: '$', EUR: '€', GBP: '£', GBX: '£', CHF: 'CHF' };
  const money = (v, d) => v == null ? '—' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (DEV[(d || 'EUR').toUpperCase()] || d || '€');
  const fdate = iso => { try { const [y, m, j] = String(iso).slice(0, 10).split('-'); return j + '/' + m + '/' + y; } catch(e){ return iso; } };
  const VERD = { 'TROP CHÈRE': ['Trop chère', '#E5484D'], 'JUSTE PRIX': ['Juste prix', '#F2C43D'], 'EN SOLDE': ['En solde', '#5ECD6D'] };

  let D = null, loading = null, err = null, nomCourant = null, confirmId = null, lastTrash = null;

  function load(force){
    if (D && !force) return Promise.resolve(D);
    if (loading) return loading;
    loading = fetch('/api/store/load?name=fiches', { cache: 'no-store' }).then(r => r.json()).then(j => {
      if (!j.ok) throw new Error(j.error || 'lecture impossible');
      D = j.data || { version: 1, revision: 0, items: {}, trash: [] }; D.items = D.items || {}; D.trash = D.trash || []; err = null;
    }).catch(e => { err = /inconnu/.test(e.message) ? 'serveur à relancer (raccourci « Wolf Analysis »)' : e.message; D = null; })
      .then(() => { loading = null; return D; });
    return loading;
  }
  async function save(deleted){
    const body = JSON.stringify(Object.assign({}, D, { revision: (D.revision || 0) + 1, baseRevision: D.revision || 0, savedAt: new Date().toISOString(), deleted: deleted || [] }));
    const r = await fetch('/api/store/save?name=fiches', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wolf-IA': '1' }, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok){ if (window.wolfRescue) window.wolfRescue('fiches', body); throw new Error(r.status === 409 ? 'fichier modifié ailleurs : recharge la page' : (j.error || 'enregistrement refusé')); }
    D.revision = j.revision;
  }

  function fichesDe(nom){
    if (!D) return [];
    const n = norm(nom);
    return Object.values(D.items).filter(x => norm(x.entreprise) === n || norm(x.nom_prix) === n)
      .sort((a, b) => String(b.date + b.createdAt).localeCompare(String(a.date + a.createdAt)));
  }

  function carte(f, principale){
    const v = VERD[String(f.verdict || '').toUpperCase()] || [f.verdict || '—', '#9AA1AD'];
    const j = f.justes || {};
    const ec = f.ecart != null ? (f.ecart > 0 ? '+' : '') + Number(f.ecart).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %' : '';
    const pdf = f.pdf ? media(f.pdf) : null;
    const p1 = f.pages && f.pages[0] ? media(f.pages[0]) : null, p2 = f.pages && f.pages[1] ? media(f.pages[1]) : null;
    const del = confirmId === f.id
      ? `<button class="ft-btn ft-del on" data-ft-del="${esc(f.id)}">⚠️ Confirmer ?</button>`
      : `<button class="ft-btn ft-del" data-ft-del="${esc(f.id)}" title="Mettre à la corbeille">🗑</button>`;
    if (!principale){
      return `<div class="ft-old">${p1 ? `<a href="${pdf || p1}" target="_blank" rel="noopener"><img src="${p1}" alt=""></a>` : ''}
        <div class="ft-old-txt"><b>${esc(fdate(f.date))}</b><span class="ft-pill" style="--c:${v[1]}">${esc(v[0])}</span>
        <span>cours ${esc(money(f.cours, f.devise))} · réaliste ${esc(money(j.real, f.devise))}</span></div>
        <div class="ft-old-act">${pdf ? `<a class="ft-btn" href="${pdf}" target="_blank" rel="noopener">📄 PDF</a>` : ''}${del}</div></div>`;
    }
    return `<div class="ft-main">
      <div class="ft-thumbs">${p1 ? `<a href="${pdf || p1}" target="_blank" rel="noopener" title="Ouvrir le PDF"><img src="${p1}" alt="Page 1"></a>` : ''}${p2 ? `<a href="${pdf || p2}" target="_blank" rel="noopener" title="Ouvrir le PDF"><img src="${p2}" alt="Page 2"></a>` : ''}</div>
      <div class="ft-info">
        <div class="ft-date">Fiche thèse du ${esc(fdate(f.date))}</div>
        <div class="ft-verdict"><span class="ft-pill big" style="--c:${v[1]}">${esc(v[0])}</span>
          <span>cours ${esc(money(f.cours, f.devise))}${ec ? ` · <b>${esc(ec)}</b> vs mon prix juste réaliste` : ''}</span></div>
        <div class="ft-justes">
          <span style="--c:#F08488">Pessimiste <b>${esc(money(j.pess, f.devise))}</b></span>
          <span style="--c:#F2C43D">Réaliste <b>${esc(money(j.real, f.devise))}</b></span>
          <span style="--c:#5ECD6D">Optimiste <b>${esc(money(j.opt, f.devise))}</b></span></div>
        ${f.decision && f.decision.mot ? `<div class="ft-dec"><span>Ma décision</span><b>${esc(String(f.decision.mot).toUpperCase())}</b>${f.decision.texte ? `<p>${esc(f.decision.texte)}</p>` : ''}</div>` : ''}
        <div class="ft-act">${pdf ? `<a class="ft-btn gold" href="${pdf}" target="_blank" rel="noopener">📄 Ouvrir le PDF</a>` : ''}${del}</div>
      </div></div>`;
  }

  function draw(){
    const box = $('fichesThese'); if (!box) return;
    if (err){ box.innerHTML = `<p class="ft-empty">Fiches thèse indisponibles : ${esc(err)}.</p>`; return; }
    if (!D){ box.innerHTML = '<p class="ft-empty">Chargement des fiches thèse…</p>'; return; }
    const list = fichesDe(nomCourant);
    const autres = {};
    Object.values(D.items).forEach(x => { if (norm(x.entreprise) !== norm(nomCourant)) (autres[x.entreprise] = autres[x.entreprise] || []).push(x); });
    const chips = Object.entries(autres).sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([n, xs]) => {
      const last = xs.sort((a, b) => String(b.date + b.createdAt).localeCompare(String(a.date + a.createdAt)))[0];
      return last.pdf ? `<a class="ft-chip" href="${media(last.pdf)}" target="_blank" rel="noopener" title="Fiche du ${esc(fdate(last.date))}">${esc(n)}</a>` : '';
    }).join('');
    const undo = lastTrash ? `<div class="ft-undo">Fiche mise à la corbeille. <button class="ft-btn" data-ft-undo="1">↶ Annuler</button></div>` : '';
    box.innerHTML = undo + (list.length
      ? carte(list[0], true) + (list.length > 1 ? `<div class="ft-sub">Versions précédentes (${list.length - 1})</div>` + list.slice(1).map(f => carte(f, false)).join('') : '')
      : `<p class="ft-empty">Pas encore de fiche thèse pour ${esc(nomCourant || 'cette entreprise')}. Colle ta fiche ChatGPT à Claude (« /wolf-fiche-these ») : elle arrivera ici toute seule.</p>`)
      + (chips ? `<div class="ft-others"><span>Mes autres fiches :</span>${chips}</div>` : '');
  }

  document.addEventListener('click', async e => {
    const d = e.target.closest('[data-ft-del]'), u = e.target.closest('[data-ft-undo]');
    if (!d && !u) return;
    if (d){
      const id = d.getAttribute('data-ft-del');
      if (confirmId !== id){ confirmId = id; draw(); return; }
      confirmId = null;
      const it = D.items[id]; if (!it) return;
      delete D.items[id]; D.trash.push(Object.assign({}, it, { deletedAt: new Date().toISOString() })); lastTrash = id;
      try { await save([id]); } catch(x){ alertMsg(x.message); }
      draw();
    } else if (u && lastTrash){
      const i = D.trash.map(x => x.id).lastIndexOf(lastTrash);
      if (i >= 0){ const it = Object.assign({}, D.trash[i]); delete it.deletedAt; D.items[it.id] = it; D.trash.splice(i, 1); }
      lastTrash = null;
      try { await save([]); } catch(x){ alertMsg(x.message); }
      draw();
    }
  });
  function alertMsg(m){ const box = $('fichesThese'); if (box) box.insertAdjacentHTML('afterbegin', `<p class="ft-empty" style="color:#F08488">${esc(m)}</p>`); }

  let lastLoad = 0;
  function render(nom){
    const change = nom !== nomCourant;
    if (change){ confirmId = null; lastTrash = null; }
    nomCourant = nom;
    draw();
    // relu au changement d'entreprise ou toutes les 15 s : une fiche faite pendant que l'appli est ouverte apparaît sans recharger
    if (change || !D || Date.now() - lastLoad > 15000){ lastLoad = Date.now(); load(true).then(draw); }
  }
  window.FICHES_UI = { render, load, fichesDe };
})();
