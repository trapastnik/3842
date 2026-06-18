// МТК 38 v3 · engine/stats.js
// Скрываемое окошко системной нагрузки: бэкенд, FPS/кадр, буфер, draw calls, треугольники,
// геометрии/текстуры, JS heap. Тумблер: кнопка × / клавиша P (или З). Читает renderer.info.

const CSS = `
.v3stats{position:fixed;top:14px;right:14px;z-index:8;min-width:178px;
  background:rgba(18,22,26,.82);border:1px solid rgba(210,183,115,.34);border-radius:11px;
  color:#CFD0CF;font:12px/1.5 ui-monospace,"SF Mono",Menlo,monospace;backdrop-filter:blur(7px);overflow:hidden}
.v3stats-h{display:flex;justify-content:space-between;align-items:center;padding:7px 11px;
  background:rgba(210,183,115,.08);border-bottom:1px solid rgba(210,183,115,.18)}
.v3stats-h b{color:#D2B773;font-weight:600;letter-spacing:.06em;text-transform:uppercase;font-size:11px}
.v3stats-x{cursor:pointer;color:#9DA3A8;font-size:15px;line-height:1;padding:0 2px}
.v3stats-x:hover{color:#F7F9EF}
.v3stats-b{margin:0;padding:9px 11px;white-space:pre;color:#E4E6E1}
.v3stats-b .hi{color:#D2B773}
.v3stats-chip{position:fixed;top:14px;right:14px;z-index:8;cursor:pointer;border:1px solid rgba(210,183,115,.34);
  background:rgba(18,22,26,.82);border-radius:9px;padding:6px 9px;font-size:15px;backdrop-filter:blur(7px)}
`;

export function createStats(renderer, { extra } = {}) {
  if (!document.getElementById('v3stats-css')) {
    const st = document.createElement('style'); st.id = 'v3stats-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  const box = document.createElement('div');
  box.className = 'v3stats';
  box.innerHTML = `<div class="v3stats-h"><b>нагрузка</b><span class="v3stats-x" title="скрыть (P)">×</span></div><pre class="v3stats-b"></pre>`;
  const chip = document.createElement('button');
  chip.className = 'v3stats-chip'; chip.textContent = '📊'; chip.title = 'показать нагрузку (P)';
  chip.style.display = 'none';
  document.body.appendChild(box);
  document.body.appendChild(chip);
  const body = box.querySelector('.v3stats-b');

  const hide = () => { box.style.display = 'none'; chip.style.display = 'block'; };
  const show = () => { box.style.display = 'block'; chip.style.display = 'none'; };
  box.querySelector('.v3stats-x').onclick = hide;
  chip.onclick = show;
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'p' || k === 'з') (box.style.display === 'none' ? show() : hide());
  });

  let frames = 0, acc = 0, fps = 0, ms = 0, last = performance.now();
  const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : ('' + n);

  function update(backend) {
    const now = performance.now(), dt = now - last; last = now; acc += dt; frames++;
    if (acc >= 480) { fps = Math.round(1000 * frames / acc); ms = acc / frames; frames = 0; acc = 0; }
    const inf = renderer.info || {};
    const r = inf.render || {}, m = inf.memory || {}, c = inf.compute || {};
    const cv = renderer.domElement;
    const px = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
    let heap = '';
    if (performance.memory) heap = `\nJS heap   ${(performance.memory.usedJSHeapSize / 1048576) | 0} МБ`;
    body.textContent =
      `бэкенд    ${backend}\n` +
      `FPS       ${fps}  кадр ${ms.toFixed(1)} мс\n` +
      `буфер     ${cv.width}×${cv.height} @${px}\n` +
      `draw call ${r.drawCalls ?? '—'}\n` +
      `треуг.    ${fmt(r.triangles ?? 0)}\n` +
      `геом ${m.geometries ?? '—'} · текс ${m.textures ?? '—'}` +
      (c.computeCalls ? `\ncompute   ${c.computeCalls}` : '') +
      (extra ? `\n${extra()}` : '') +
      heap;
  }
  return { dom: box, update, show, hide };
}
