/* ============================================================
   SCREENER → « 📋 Listes TradingView » (2026-11-13)
   Les watchlists TradingView de l'utilisateur, relevées par Claude avec le connecteur TradingView dans
   data/tv-watchlists.json (git-ignoré ; à refaire en demandant « mets à jour mes watchlists »). Chiffres EN DIRECT
   via le scanner public de TradingView (POST text/plain = sans pré-vérification CORS, accepté pour localhost).
   Lignes « ###… » de TradingView = titres de section. Clic sur une ligne : fiche Analyse si l'entreprise est suivie,
   sinon fiche TradingView à la volée (selectTvCompany).
   ============================================================ */
(function(){
'use strict';
const PAGE_ID = 'pageTvListes';
const COLS = ['description', 'close', 'change', 'Perf.YTD', 'Perf.Y', 'price_earnings_ttm', 'price_free_cash_flow_ttm', 'dividends_yield_current', 'market_cap_basic', 'currency', 'sector', 'logoid', 'type', 'base-currency-logoid'];
const SORTS = [['ordre', 'Ordre de la liste'], ['change', 'Variation du jour'], ['ytd', 'Depuis le 1er janvier'], ['y', 'Sur 1 an'], ['pe', 'PER'], ['pfcf', 'P/FCF'], ['div', 'Rendement'], ['cap', 'Capitalisation']];
const ui = { list: null, sort: 'ordre', q: '' };
try{ Object.assign(ui, JSON.parse(localStorage.getItem('wolfTvListesUi') || '{}')); }catch(e){}
const saveUi = () => { try{ localStorage.setItem('wolfTvListesUi', JSON.stringify(ui)); }catch(e){} };
let D = null, err = null;
const quotes = {}, quoteAt = {};
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c]);
const nf = (v, d = 2) => v == null || !isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 1) => v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
const cls = v => v == null || !isFinite(v) ? '' : v >= 0 ? 'pos' : 'neg';
const cap = v => v == null ? '—' : v >= 1e12 ? nf(v / 1e12, 2) + ' T' : v >= 1e9 ? nf(v / 1e9, 1) + ' Md' : nf(v / 1e6, 0) + ' M';
const CUR = { EUR: '€', USD: '$', GBP: '£', GBX: 'p', JPY: '¥', CHF: 'CHF', HKD: 'HK$', SEK: 'kr', NOK: 'kr', DKK: 'kr', CAD: 'C$', AUD: 'A$' };

async function load(){
  if (D) return D;
  try{
    let r = await fetch('data/tv-watchlists.json?_=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) r = await fetch('data/public/tv-watchlists.json?_=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('fichier data/tv-watchlists.json introuvable');
    D = await r.json(); err = null;
  }catch(e){ err = e.message; D = null; }
  return D;
}
function sectionsOf(list){
  const out = []; let cur = { title: null, syms: [] };
  (list.symbols || []).forEach(s => { if (s.startsWith('###')){ if (cur.syms.length || cur.title) out.push(cur); cur = { title: s.slice(3).replace(/^[\s⁤]+/, ''), syms: [] }; } else if (s.includes(':')) cur.syms.push(s); });
  if (cur.syms.length || cur.title) out.push(cur);
  return out;
}
async function fetchQuotes(syms){
  const todo = syms.filter(s => !quotes[s] || Date.now() - quoteAt[s] > 60000);
  for (let i = 0; i < todo.length; i += 150){
    const part = todo.slice(i, i + 150);
    try{
      const r = await fetch('https://scanner.tradingview.com/global/scan', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ symbols: { tickers: part }, columns: COLS }) });
      const j = await r.json();
      (j.data || []).forEach(row => { const o = {}; COLS.forEach((c, k) => { o[c] = row.d[k]; }); quotes[row.s] = o; quoteAt[row.s] = Date.now(); });
      part.forEach(s => { if (!quotes[s]){ quotes[s] = { missing: true }; quoteAt[s] = Date.now(); } });
    }catch(e){ part.forEach(s => { if (!quotes[s]) quotes[s] = { error: true }; }); }
  }
}
function logoHtml(sym, q){
  const id = q && (q.logoid || q['base-currency-logoid']);
  const tk = sym.split(':')[1] || sym;
  return id ? `<img class="tl-logo" loading="lazy" alt="" src="https://s3-symbol-logo.tradingview.com/${esc(id)}--big.svg" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'tl-logo tl-ini',textContent:'${esc(tk.slice(0, 2))}'}))">`
    : `<span class="tl-logo tl-ini">${esc(tk.slice(0, 2))}</span>`;
}
function trackedName(sym){
  if (typeof companies === 'undefined') return null;
  for (const n of Object.keys(companies)){ const h = companies[n], l = h && h[h.length - 1]; if (l && (l.ticker === sym || l.tvSymbol === sym)) return n; }
  return null;
}
function sortVal(q, k){ if (!q) return null; return { change: q.change, ytd: q['Perf.YTD'], y: q['Perf.Y'], pe: q.price_earnings_ttm, pfcf: q.price_free_cash_flow_ttm, div: q.dividends_yield_current, cap: q.market_cap_basic }[k]; }
function rowHtml(sym){
  const q = quotes[sym] || {}, tracked = trackedName(sym), cur = q.currency ? (CUR[q.currency] || q.currency) : '';
  const name = q.description || sym.split(':')[1];
  return `<tr data-sym="${esc(sym)}" data-name="${esc(name)}" ${tracked ? `data-tracked="${esc(tracked)}"` : ''} title="${tracked ? 'Ouvrir la fiche Analyse' : 'Ouvrir la fiche TradingView'}">
    <td class="tl-co">${logoHtml(sym, q)}<span><b>${esc(name)}</b><small>${esc(sym)}${tracked ? ' · <i>suivie</i>' : ''}</small></span></td>
    <td class="tl-n">${q.close != null ? nf(q.close, q.close >= 1000 ? 0 : 2) + ' ' + esc(cur) : q.missing ? '<span class="tl-miss">introuvable</span>' : '—'}</td>
    <td class="tl-n ${cls(q.change)}">${pct(q.change, 2)}</td>
    <td class="tl-n ${cls(q['Perf.YTD'])}">${pct(q['Perf.YTD'])}</td>
    <td class="tl-n ${cls(q['Perf.Y'])}">${pct(q['Perf.Y'])}</td>
    <td class="tl-n">${q.price_earnings_ttm > 0 ? nf(q.price_earnings_ttm, 1) : '—'}</td>
    <td class="tl-n">${q.price_free_cash_flow_ttm > 0 ? nf(q.price_free_cash_flow_ttm, 1) : '—'}</td>
    <td class="tl-n">${q.dividends_yield_current != null ? nf(q.dividends_yield_current, 2) + ' %' : '—'}</td>
    <td class="tl-n">${cap(q.market_cap_basic)}</td>
    <td class="tl-sec">${esc(q.sector || (q.type && q.type !== 'stock' ? q.type : ''))}</td></tr>`;
}
const HEAD = '<tr><th>Valeur</th><th>Cours</th><th>Jour</th><th>Depuis 1er janv.</th><th>1 an</th><th>PER</th><th>P/FCF</th><th>Rendement</th><th>Capi.</th><th>Secteur</th></tr>';

async function render(){
  const page = $(PAGE_ID); if (!page) return;
  await load();
  if (!D){ page.innerHTML = `<div class="tl-empty">⚠ ${esc(err || 'Listes indisponibles')}. Demande à Claude : « mets à jour mes watchlists TradingView ».</div>`; return; }
  const lists = D.lists.filter(l => (l.symbols || []).some(s => s.includes(':')) || l.note);
  if (!ui.list || !lists.find(l => String(l.id) === String(ui.list))) ui.list = lists[0] && lists[0].id;
  const L = lists.find(l => String(l.id) === String(ui.list));
  const count = l => (l.symbols || []).filter(s => !s.startsWith('###') && s.includes(':')).length;
  page.innerHTML = `<div class="tl-head"><h1 class="tl-title">Mes listes TradingView</h1>
      <span class="tl-sub">${lists.length} listes · relevées le ${esc((D.importedAt || '').split('-').reverse().join('/'))} · chiffres TradingView en direct</span></div>
    <div class="tl-wrap">
      <nav class="tl-side" aria-label="Listes">${lists.map(l => `<button type="button" class="tl-li${String(l.id) === String(ui.list) ? ' on' : ''}" data-list="${l.id}"><span>${esc(l.name)}</span><b>${count(l)}</b></button>`).join('')}</nav>
      <section class="tl-main">
        <div class="tl-bar"><h2 class="tl-h2">${esc(L.name)}</h2>
          <input type="search" class="tl-q" id="tlQ" placeholder="Filtrer (nom, symbole)…" value="${esc(ui.q)}">
          <label class="tl-sort">Trier <select id="tlSort">${SORTS.map(s => `<option value="${s[0]}" ${ui.sort === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}</select></label>
          <button type="button" class="tl-btn" id="tlRefresh" title="Relire les cours sur TradingView">↻</button></div>
        ${L.description ? `<p class="tl-desc">${esc(L.description)}</p>` : ''}
        ${L.note ? `<div class="tl-empty">${esc(L.note)}</div>` : ''}
        <div class="tl-table-box" id="tlBox"><div class="tl-empty">Lecture des cours TradingView…</div></div>
      </section></div>`;
  wire();
  const secs = sectionsOf(L);
  await fetchQuotes(secs.flatMap(s => s.syms));
  if (String(ui.list) !== String(L.id)) return;
  drawTable(secs);
}
function drawTable(secs){
  const box = $('tlBox'); if (!box) return;
  const q = ui.q.trim().toLowerCase();
  const keep = s => !q || s.toLowerCase().includes(q) || String((quotes[s] || {}).description || '').toLowerCase().includes(q);
  let html = '';
  if (ui.sort === 'ordre'){
    secs.forEach(sec => { const rows = sec.syms.filter(keep); if (!rows.length) return;
      html += (sec.title ? `<tr class="tl-sect"><td colspan="10">${esc(sec.title)} <small>${rows.length}</small></td></tr>` : '') + rows.map(rowHtml).join(''); });
  } else {
    const all = [...new Set(secs.flatMap(s => s.syms))].filter(keep);
    const asc = ui.sort === 'pe' || ui.sort === 'pfcf';
    all.sort((a, b) => { const x = sortVal(quotes[a], ui.sort), y = sortVal(quotes[b], ui.sort);
      if (x == null || (asc && x <= 0)) return 1; if (y == null || (asc && y <= 0)) return -1; return asc ? x - y : y - x; });
    html = all.map(rowHtml).join('');
  }
  box.innerHTML = html ? `<table class="tl-table"><thead>${HEAD}</thead><tbody>${html}</tbody></table>` : '<div class="tl-empty">Aucune valeur.</div>';
}
function wire(){
  const page = $(PAGE_ID);
  if (!page.dataset.wired){
    page.dataset.wired = '1';
    page.addEventListener('click', e => {
      const li = e.target.closest('[data-list]'); if (li){ ui.list = li.dataset.list; saveUi(); render(); return; }
      if (e.target.closest('#tlRefresh')){ Object.keys(quoteAt).forEach(k => { quoteAt[k] = 0; }); render(); return; }
      const tr = e.target.closest('tr[data-sym]'); if (!tr) return;
      if (tr.dataset.tracked && typeof selectCompany === 'function'){ selectCompany(tr.dataset.tracked); if (typeof switchPage === 'function') switchPage('pageAnalyse'); window.scrollTo(0, 0); return; }
      if (typeof selectTvCompany === 'function'){ selectTvCompany(tr.dataset.sym, tr.dataset.name); if (typeof switchPage === 'function') switchPage('pageAnalyse'); window.scrollTo(0, 0); }
    });
    page.addEventListener('input', e => { if (e.target.id === 'tlQ'){ ui.q = e.target.value; saveUi(); const L = D && D.lists.find(l => String(l.id) === String(ui.list)); if (L) drawTable(sectionsOf(L)); } });
    page.addEventListener('change', e => { if (e.target.id === 'tlSort'){ ui.sort = e.target.value; saveUi(); const L = D && D.lists.find(l => String(l.id) === String(ui.list)); if (L) drawTable(sectionsOf(L)); } });
  }
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-page]'); if (b && b.dataset.page === PAGE_ID) setTimeout(render, 0); });
window.TV_LISTES = { render, _quotes: quotes };
})();
