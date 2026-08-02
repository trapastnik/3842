// МТК 38 v3 · engine/ui.js — интерфейсная оболочка сцены.
//
// Приводит МТК 38 к общему знаменателю с МТК 41 и 42: на сцене — титульный блок
// (надзаголовок / заголовок / подпись), внизу справа круглая ⚙, из неё выезжает
// панель настроек с сегментами-радиогруппами и слайдерами, внизу «сбросить».
// Разметка и вид повторяют mtk41-map-hier / mtk42-museums-map.
//
// Главное отличие от прежнего тюнера: настройки РАЗДЕЛЕНЫ.
//   · посетительские (что показывать) — видны всегда;
//   · инженерные (свет, пост-обработка, отладка) — только под ?service=1,
//     тем же гейтом, что служебная кнопка ⚒ в хабе.
// Раньше экспозиция и DOF лежали в одном списке со слоями карты.
//
// API:
//   createUI({ kicker, title, subtitle, hint,
//              segments:[{key,label,options:[[v,label],…],value,service?}],
//              groups:[{title,service?,params:[{key,label,min,max,step,value,unit?}]}],
//              onChange })
//   → { values, set, get, dom, isService }

export const IS_SERVICE = new URLSearchParams(location.search).get('service') === '1';

const CSS = `
.mtk-ui{--brass:#D2B773;--paper:#F7F9EF;--graphite:#435059;--window:#9DA3A8;--telegrey:#CFD0CF}
.mtk-title{position:fixed;left:clamp(20px,3vw,52px);top:clamp(18px,3vh,44px);z-index:5;
  max-width:min(34em,40vw);pointer-events:none;isolation:isolate}
/* мягкая подложка: на «дожде» белый текст ложился на белые слова и пропадал */
.mtk-title::before,.mtk-hint::before{content:"";position:absolute;z-index:-1;
  inset:-22px -48px -18px -34px;border-radius:20px;
  background:radial-gradient(120% 150% at 0% 0%,rgba(8,11,14,.9) 0%,rgba(8,11,14,.62) 48%,transparent 80%)}
.mtk-title .kicker{font-family:'20 Kopeek',ui-monospace,monospace;font-size:11px;letter-spacing:.18em;
  text-transform:uppercase;color:var(--brass);opacity:.9}
.mtk-title h1{margin:.25em 0 .3em;font-family:'21 Cent',system-ui,sans-serif;font-weight:700;
  font-size:clamp(19px,2.2vw,30px);line-height:1.15;color:var(--paper)}
.mtk-title .subtitle{font-family:'21 Cent',system-ui,sans-serif;font-size:clamp(12px,1.15vw,15px);
  line-height:1.45;color:var(--telegrey);opacity:.82}

.mtk-gear{position:fixed;z-index:6;right:clamp(24px,3vw,56px);bottom:clamp(24px,4vh,64px);
  width:3em;height:3em;font-size:clamp(18px,2vh,26px);background:rgba(14,18,20,.7);color:var(--brass);
  border:1px solid var(--brass);border-radius:50%;cursor:pointer;backdrop-filter:blur(6px);
  transition:background 120ms ease,transform 120ms ease}
.mtk-gear:active{transform:scale(.94)}

.mtk-panel{position:fixed;z-index:7;right:clamp(24px,3vw,56px);
  bottom:calc(clamp(24px,4vh,64px) + 3.6em);width:min(26em,88vw);max-height:70vh;overflow-y:auto;
  padding:1.2em 1.4em 1em;background:rgba(14,18,20,.94);border:1px solid rgba(210,183,115,.34);
  border-radius:12px;backdrop-filter:blur(10px);color:var(--telegrey);
  font-family:'21 Cent',system-ui,sans-serif;font-size:14px;display:none}
.mtk-panel.on{display:block}
.mtk-panel::-webkit-scrollbar{width:8px}
.mtk-panel::-webkit-scrollbar-thumb{background:rgba(210,183,115,.28);border-radius:4px}

.mtk-row{margin:0 0 1.05em}
.mtk-row>span.lab{display:block;font-family:'20 Kopeek',ui-monospace,monospace;font-size:11px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--window);margin-bottom:.5em}
.mtk-seg{display:inline-flex;border:1px solid var(--brass);border-radius:3px;overflow:hidden;flex-wrap:wrap}
.mtk-seg button{padding:.45em 1em;background:transparent;color:var(--paper);border:0;cursor:pointer;
  font-family:inherit;font-size:13px;border-right:1px solid rgba(210,183,115,.35)}
.mtk-seg button:last-child{border-right:0}
.mtk-seg button.active{background:var(--brass);color:var(--graphite);font-weight:700}

.mtk-slider label{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.35em;
  font-family:'20 Kopeek',ui-monospace,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--window)}
.mtk-slider label b{color:var(--paper);font-weight:400}
.mtk-slider input{width:100%;accent-color:var(--brass);height:16px;margin:0}

.mtk-sect{margin:1.4em 0 .9em;padding-top:1em;border-top:1px solid rgba(210,183,115,.22);
  font-family:'20 Kopeek',ui-monospace,monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--brass);opacity:.85}
.mtk-reset{width:100%;margin-top:.4em;padding:.7em;background:transparent;border:1px solid rgba(210,183,115,.4);
  border-radius:8px;color:var(--brass);font-family:'20 Kopeek',ui-monospace,monospace;font-size:11px;
  letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.mtk-hint{position:fixed;left:clamp(20px,3vw,52px);bottom:12px;z-index:5;pointer-events:none;isolation:isolate;
  font-family:'20 Kopeek',ui-monospace,monospace;font-size:11px;color:var(--window);opacity:.6}
.mtk-hint b{color:var(--brass)}
`;

export function createUI({ kicker = '', title = '', subtitle = '', hint = '',
                           segments = [], groups = [], onChange } = {}) {
  if (!document.getElementById('mtk-ui-css')) {
    const st = document.createElement('style'); st.id = 'mtk-ui-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  document.body.classList.add('mtk-ui');

  if (kicker || title || subtitle) {
    const h = document.createElement('header');
    h.className = 'mtk-title'; h.setAttribute('aria-hidden', 'true');
    h.innerHTML = (kicker ? `<div class="kicker">${kicker}</div>` : '')
      + (title ? `<h1>${title}</h1>` : '')
      + (subtitle ? `<div class="subtitle">${subtitle}</div>` : '');
    document.body.appendChild(h);
  }
  if (hint) {
    const t = document.createElement('div');
    t.className = 'mtk-hint'; t.innerHTML = hint;
    document.body.appendChild(t);
  }

  const defaults = {}, values = {};
  for (const s of segments) { defaults[s.key] = s.value; values[s.key] = s.value; }
  for (const g of groups) for (const p of g.params) { defaults[p.key] = p.value; values[p.key] = p.value; }

  const panel = document.createElement('div');
  panel.className = 'mtk-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Настройки');

  const setters = {};

  const addSegment = (s) => {
    const row = document.createElement('div');
    row.className = 'mtk-row';
    row.innerHTML = `<span class="lab">${s.label}</span>`;
    const seg = document.createElement('div');
    seg.className = 'mtk-seg'; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', s.label);
    s.options.forEach(([val, lab]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = lab; b.setAttribute('role', 'radio');
      const sync = () => {
        const on = values[s.key] === val;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      };
      b.onclick = () => { values[s.key] = val; [...seg.children].forEach((c) => c._sync && c._sync()); onChange && onChange(s.key, val, values); };
      b._sync = sync; sync();
      seg.appendChild(b);
    });
    setters[s.key] = () => [...seg.children].forEach((c) => c._sync());
    row.appendChild(seg); panel.appendChild(row);
  };

  const addSlider = (p) => {
    const row = document.createElement('div');
    row.className = 'mtk-row mtk-slider';
    const val = document.createElement('b'); val.textContent = String(p.value) + (p.unit || '');
    const lab = document.createElement('label');
    lab.innerHTML = `<span>${p.label}</span>`; lab.appendChild(val);
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = p.min; inp.max = p.max; inp.step = p.step; inp.value = p.value;
    inp.oninput = () => {
      const v = parseFloat(inp.value);
      values[p.key] = v; val.textContent = String(v) + (p.unit || '');
      onChange && onChange(p.key, v, values);
    };
    setters[p.key] = () => { inp.value = values[p.key]; val.textContent = String(values[p.key]) + (p.unit || ''); };
    row.appendChild(lab); row.appendChild(inp); panel.appendChild(row);
  };

  // сперва посетительское, затем — если открыт сервисный режим — инженерное
  segments.filter((s) => !s.service).forEach(addSegment);
  groups.filter((g) => !g.service).forEach((g) => {
    if (g.title) { const t = document.createElement('div'); t.className = 'mtk-sect'; t.textContent = g.title; panel.appendChild(t); }
    g.params.forEach(addSlider);
  });

  const svcSegments = segments.filter((s) => s.service);
  const svcGroups = groups.filter((g) => g.service);
  if (IS_SERVICE && (svcSegments.length || svcGroups.length)) {
    const t = document.createElement('div');
    t.className = 'mtk-sect'; t.textContent = 'инженерные · ?service=1';
    panel.appendChild(t);
    svcSegments.forEach(addSegment);
    svcGroups.forEach((g) => {
      if (g.title) { const s = document.createElement('div'); s.className = 'mtk-sect'; s.textContent = g.title; panel.appendChild(s); }
      g.params.forEach(addSlider);
    });
  }

  const reset = document.createElement('button');
  reset.type = 'button'; reset.className = 'mtk-reset'; reset.textContent = 'сбросить настройки';
  reset.onclick = () => {
    for (const k of Object.keys(defaults)) {
      values[k] = defaults[k];
      setters[k] && setters[k]();
      onChange && onChange(k, defaults[k], values);
    }
  };
  panel.appendChild(reset);

  const gear = document.createElement('button');
  gear.type = 'button'; gear.className = 'mtk-gear'; gear.setAttribute('aria-label', 'Настройки');
  gear.textContent = '⚙';
  gear.onclick = () => panel.classList.toggle('on');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') panel.classList.remove('on'); });

  document.body.appendChild(panel);
  document.body.appendChild(gear);

  return {
    values, dom: panel, isService: IS_SERVICE,
    get: (k) => values[k],
    set: (k, v) => { values[k] = v; setters[k] && setters[k](); onChange && onChange(k, v, values); },
  };
}
