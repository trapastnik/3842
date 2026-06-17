// МТК 38 v3 · tuner.js — переиспользуемая панель параметров (кит для сцен/МТК).
// API: createTuner({ title, groups:[{title,params:[{key,label,min,max,step,value}]}], onChange, collapsed })
//      onChange(key, value, allValues). Возвращает { dom, values, set, get, toggle }.
// Тема — бренд-палитра. Сворачивается (кнопка / клавиша T). Копировать пресет / Сброс.

const CSS = `
.v3tuner{position:fixed;top:14px;left:14px;z-index:8;width:226px;max-height:92vh;overflow:auto;
  background:rgba(18,22,26,.86);border:1px solid rgba(210,183,115,.30);border-radius:12px;
  color:#CFD0CF;font:12px/1.4 ui-monospace,"SF Mono",Menlo,monospace;backdrop-filter:blur(8px)}
.v3tuner-h{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:default;
  background:rgba(210,183,115,.08);border-bottom:1px solid rgba(210,183,115,.18)}
.v3tuner-h b{color:#D2B773;font-weight:600;letter-spacing:.06em;text-transform:uppercase;font-size:11px}
.v3tuner-x{cursor:pointer;color:#9DA3A8;font-size:14px;user-select:none}.v3tuner-x:hover{color:#F7F9EF}
.v3tuner-body{padding:6px 12px 10px}
.v3tuner-g{margin-top:8px}.v3tuner-g>span{color:#D2B773;font-size:10px;letter-spacing:.05em;text-transform:uppercase;opacity:.85}
.v3tuner-r{margin:7px 0}
.v3tuner-r label{display:flex;justify-content:space-between;margin-bottom:2px}
.v3tuner-r label i{font-style:normal;color:#9DA3A8}.v3tuner-r label b{color:#F7F9EF;font-weight:600}
.v3tuner input[type=range]{width:100%;accent-color:#D2B773;height:14px;margin:0}
.v3tuner-foot{display:flex;gap:7px;margin-top:11px}
.v3tuner-foot button{flex:1;border:0;border-radius:7px;padding:7px;font:inherit;font-weight:600;cursor:pointer}
.v3tuner-copy{background:#D2B773;color:#1a1f23}.v3tuner-reset{background:rgba(157,163,168,.22);color:#E4E6E1}
.v3tuner-chip{position:fixed;top:14px;left:14px;z-index:8;cursor:pointer;border:1px solid rgba(210,183,115,.30);
  background:rgba(18,22,26,.86);border-radius:9px;padding:6px 9px;font-size:15px;backdrop-filter:blur(8px)}
`;

export function createTuner({ title = 'параметры', groups = [], onChange, collapsed = false } = {}) {
  if (!document.getElementById('v3tuner-css')) {
    const st = document.createElement('style'); st.id = 'v3tuner-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  const defaults = {}, values = {};
  for (const g of groups) for (const p of g.params) { defaults[p.key] = p.value; values[p.key] = p.value; }

  const box = document.createElement('div'); box.className = 'v3tuner';
  const chip = document.createElement('button'); chip.className = 'v3tuner-chip'; chip.textContent = '⚙'; chip.title = 'параметры (T)'; chip.style.display = 'none';
  const fmt = (v) => (Math.abs(v) < 1 && v !== 0) ? (+v).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : ('' + (+v));
  box.innerHTML =
    `<div class="v3tuner-h"><b>${title}</b><span class="v3tuner-x" title="свернуть (T)">–</span></div>` +
    `<div class="v3tuner-body">` +
    groups.map((g) => `<div class="v3tuner-g">${g.title ? `<span>${g.title}</span>` : ''}` +
      g.params.map((p) =>
        `<div class="v3tuner-r"><label><i>${p.label}</i><b id="tv_${p.key}">${fmt(p.value)}</b></label>` +
        `<input type="range" id="tr_${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}"></div>`
      ).join('') + `</div>`).join('') +
    `<div class="v3tuner-foot"><button class="v3tuner-copy">Скопировать</button><button class="v3tuner-reset">Сброс</button></div>` +
    `</div>`;
  document.body.appendChild(box);
  document.body.appendChild(chip);

  const collapse = () => { box.style.display = 'none'; chip.style.display = 'block'; };
  const expand = () => { box.style.display = 'block'; chip.style.display = 'none'; };
  box.querySelector('.v3tuner-x').onclick = collapse;
  chip.onclick = expand;
  if (collapsed) collapse();
  addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if (k === 't' || k === 'е') (box.style.display === 'none' ? expand() : collapse()); });

  for (const g of groups) for (const p of g.params) {
    const r = box.querySelector('#tr_' + p.key), out = box.querySelector('#tv_' + p.key);
    r.oninput = (e) => { const v = parseFloat(e.target.value); values[p.key] = v; out.textContent = fmt(v); onChange && onChange(p.key, v, values); };
  }
  box.querySelector('.v3tuner-copy').onclick = () => {
    navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(values, null, 0));
    const b = box.querySelector('.v3tuner-copy'); b.textContent = 'Скопировано ✓'; setTimeout(() => b.textContent = 'Скопировать', 1100);
  };
  box.querySelector('.v3tuner-reset').onclick = () => {
    for (const k in defaults) {
      values[k] = defaults[k];
      box.querySelector('#tr_' + k).value = defaults[k];
      box.querySelector('#tv_' + k).textContent = fmt(defaults[k]);
      onChange && onChange(k, defaults[k], values);
    }
  };

  return { dom: box, values, get: () => values, set: (k, v) => { const r = box.querySelector('#tr_' + k); if (r) { r.value = v; values[k] = v; box.querySelector('#tv_' + k).textContent = fmt(v); onChange && onChange(k, v, values); } }, toggle: () => (box.style.display === 'none' ? expand() : collapse()) };
}
