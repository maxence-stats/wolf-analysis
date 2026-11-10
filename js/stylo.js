/* ================================================================================================
   STYLO D'ÉCRAN (2026-11-10) — pour annoter pendant une vidéo, sur N'IMPORTE quel onglet de l'appli.
   Bouton flottant en bas à gauche (ou Alt+D). Trois outils : stylo, surligneur, laser (le trait s'efface seul).
   « 🖱 Cliquer dessous » garde les traits affichés tout en rendant la page de nouveau cliquable.
   Rien n'est enregistré : ce sont des annotations éphémères (les dessins gardés avec une carte se font
   dans l'Atelier d'analyses, bouton « 🖌 Dessin »). C = tout effacer, Ctrl+Z = dernier trait, Échap = quitter.
   ================================================================================================ */
(function(){
'use strict';
const st = { on: false, pass: false, tool: 'pen', color: '#F0C877', width: 4, strokes: [], cur: null, raf: null };
const COLORS = ['#F0C877', '#E5636B', '#4A9FE0', '#4FD1A5', '#FFFFFF'];
let cv, ctx, bar, btn;

function build(){
  btn = document.createElement('button'); btn.type = 'button'; btn.id = 'styloBtn'; btn.className = 'stylo-btn'; btn.title = 'Stylo d\'écran pour annoter (Alt+D)'; btn.textContent = '✏️';
  btn.addEventListener('click', () => toggle());
  cv = document.createElement('canvas'); cv.id = 'styloCanvas'; cv.className = 'stylo-canvas';
  bar = document.createElement('div'); bar.id = 'styloBar'; bar.className = 'stylo-bar';
  document.body.append(cv, bar, btn);
  ctx = cv.getContext('2d');
  cv.addEventListener('pointerdown', e => { if (e.button !== 0) return; try { cv.setPointerCapture(e.pointerId); } catch(err){ /* pointeur déjà relâché */ }
    st.cur = { tool: st.tool, c: st.color, w: st.tool === 'hl' ? st.width * 5 : st.width, pts: [[e.clientX, e.clientY]], t: 0 }; st.strokes.push(st.cur); draw(); });
  cv.addEventListener('pointermove', e => { if (!st.cur) return; st.cur.pts.push([e.clientX, e.clientY]); draw(); });
  const end = () => { if (!st.cur) return; st.cur.t = performance.now(); st.cur = null; loop(); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  bar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.tool) st.tool = d.tool; else if (d.color) st.color = d.color; else if (d.w) st.width = +d.w;
    else if (d.undo !== undefined) st.strokes.pop(); else if (d.clear !== undefined) st.strokes = [];
    else if (d.pass !== undefined) st.pass = !st.pass; else if (d.quit !== undefined) return toggle(false);
    renderBar(); draw(); });
  window.addEventListener('resize', () => { if (st.on) size(); });
  // phase de capture : le stylo passe avant les raccourcis des onglets tant qu'il est actif
  window.addEventListener('keydown', e => {
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (e.altKey && (e.key === 'd' || e.key === 'D')){ e.preventDefault(); e.stopImmediatePropagation(); toggle(); return; }
    if (!st.on || typing) return;
    if (e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); toggle(false); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')){ e.preventDefault(); e.stopImmediatePropagation(); st.strokes.pop(); draw(); }
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'c' || e.key === 'C')){ e.preventDefault(); e.stopImmediatePropagation(); st.strokes = []; draw(); }
  }, true);
}
function size(){ const r = window.devicePixelRatio || 1; cv.width = Math.round(innerWidth * r); cv.height = Math.round(innerHeight * r); ctx.setTransform(r, 0, 0, r, 0, 0); draw(); }
function toggle(force){
  st.on = force === undefined ? !st.on : force;
  if (!st.on){ st.strokes = []; st.pass = false; st.cur = null; }
  document.body.classList.toggle('stylo-on', st.on);
  btn.classList.toggle('on', st.on);
  if (st.on) size();
  renderBar(); draw();
}
function renderBar(){
  cv.style.pointerEvents = st.on && !st.pass ? 'auto' : 'none';
  if (!st.on){ bar.innerHTML = ''; return; }
  const tb = (k, l, t) => '<button type="button" class="' + (st.tool === k ? 'on' : '') + '" data-tool="' + k + '" title="' + t + '">' + l + '</button>';
  bar.innerHTML = tb('pen', '✏️ Stylo', 'Trait qui reste') + tb('hl', '🖍 Surligneur', 'Trait large et transparent') + tb('laser', '🔦 Laser', 'Le trait s\'efface tout seul') + '<i></i>' +
    COLORS.map(c => '<button type="button" class="dot' + (st.color === c ? ' on' : '') + '" style="background:' + c + '" data-color="' + c + '"></button>').join('') + '<i></i>' +
    [2, 4, 8].map(w => '<button type="button" class="' + (st.width === w ? 'on' : '') + '" data-w="' + w + '">' + (w === 2 ? 'Fin' : w === 4 ? 'Moyen' : 'Épais') + '</button>').join('') + '<i></i>' +
    '<button type="button" data-undo title="Ctrl+Z">↶</button><button type="button" data-clear title="Touche C">Effacer</button>' +
    '<button type="button" class="' + (st.pass ? 'on' : '') + '" data-pass title="Garde les traits affichés et rend la page cliquable">🖱 Cliquer dessous</button><button type="button" data-quit title="Échap">✕</button>';
}
function draw(){
  if (!ctx) return;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  const now = performance.now();
  st.strokes = st.strokes.filter(s => !(s.tool === 'laser' && s.t && now - s.t > 1800));
  st.strokes.forEach(s => {
    let a = s.tool === 'hl' ? 0.35 : 1;
    if (s.tool === 'laser' && s.t) a = Math.max(0, 1 - (now - s.t) / 1800);
    ctx.globalAlpha = a; ctx.strokeStyle = s.tool === 'laser' ? '#FF4D5E' : s.c; ctx.lineWidth = s.tool === 'laser' ? Math.max(4, s.w) : s.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = s.tool === 'laser' ? '#FF4D5E' : 'transparent'; ctx.shadowBlur = s.tool === 'laser' ? 12 : 0;
    ctx.beginPath();
    const p = s.pts; ctx.moveTo(p[0][0], p[0][1]);
    if (p.length === 1) ctx.lineTo(p[0][0] + 0.1, p[0][1]);
    for (let i = 1; i < p.length - 1; i++){ const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my); }
    if (p.length > 1) ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
    ctx.stroke();
  });
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}
function loop(){ cancelAnimationFrame(st.raf); const step = () => { draw(); if (st.strokes.some(s => s.tool === 'laser' && s.t)) st.raf = requestAnimationFrame(step); }; st.raf = requestAnimationFrame(step); }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
