// МТК 38 v3 · engine/card.js
// Карточка языка Р2 — переиспользуемый модуль, 1:1 по образцу v2 (mtk38-v2/globe.html):
// написание (в своей письменности) · имя · эндоним · письмо/семья/ареал/источник · бейдж верификатора.
// Любая v3-сцена (или другой МТК) подключает одной строкой; данные — запись из words.js.

const FAM = (sc) => (sc === 'Latn' || sc === 'Cyrl')
  ? `'20 Kopeek','Arial Unicode MS',sans-serif`
  : `'Arial Unicode MS','noto-${sc}',sans-serif`;

const CSS = `
.v3card{position:fixed;left:50%;bottom:-360px;transform:translateX(-50%);z-index:9;width:min(540px,92vw);
  background:rgba(20,25,28,.93);backdrop-filter:blur(14px);border:1px solid rgba(210,183,115,.4);border-radius:16px;
  padding:18px 22px;color:#CFD0CF;font-family:'20 Kopeek',ui-monospace,Menlo,monospace;
  transition:bottom .5s cubic-bezier(.2,.7,.2,1);box-shadow:0 18px 60px rgba(0,0,0,.5)}
.v3card.show{bottom:24px}
.v3card .x{position:absolute;top:10px;right:15px;cursor:pointer;color:#9DA3A8;font-size:20px;line-height:1}
.v3card .x:hover{color:#F7F9EF}
.v3card .w{font-size:clamp(34px,5vw,60px);color:#F7F9EF;line-height:1.1;text-shadow:0 0 24px rgba(247,249,239,.25)}
.v3card .n{font-size:19px;color:#F7F9EF;font-weight:600;margin-top:3px}
.v3card .e{font-size:15px;color:#D2B773}
.v3card .rows{margin-top:12px;font-size:13px;display:grid;grid-template-columns:auto 1fr;gap:4px 14px}
.v3card .rows b{color:#9DA3A8;font-weight:600}
.v3card .ver{margin-top:11px;display:inline-block;font-size:11px;padding:3px 10px;border-radius:10px}
.v3card .ver-ok{background:#D2B773;color:#1a1f23}
.v3card .ver-warn{background:#A02128;color:#fff}
`;

export function createCard() {
  if (!document.getElementById('v3card-css')) {
    const st = document.createElement('style'); st.id = 'v3card-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.className = 'v3card';
  el.innerHTML = `<span class="x">✕</span>
    <div class="w"></div><div class="n"></div><div class="e"></div>
    <div class="rows"></div><span class="ver"></span>`;
  document.body.appendChild(el);
  const q = (s) => el.querySelector(s);
  const close = () => el.classList.remove('show');
  q('.x').onclick = close;
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  function open(w) {
    if (!w) return;
    const ff = FAM(w.sc);
    const cw = q('.w'); cw.textContent = w.w; cw.style.fontFamily = ff;
    q('.n').textContent = w.n;
    const ce = q('.e'); ce.textContent = w.e; ce.style.fontFamily = ff;
    const also = (w.also && w.also.length) ? ` · также: ${w.also.join(', ')}` : '';
    q('.rows').innerHTML =
      `<b>письмо</b><span>${w.scn} (${w.sc})</span>` +
      `<b>семья</b><span>${w.f}</span>` +
      `<b>ареал</b><span>${w.r}${also}</span>` +
      `<b>источник</b><span>${w.src}</span>`;
    const ver = q('.ver'), warn = w.ver === 'needs-verification';
    ver.textContent = warn ? '⚠ требует проверки носителем' : '✓ ' + w.ver;
    ver.className = 'ver ' + (warn ? 'ver-warn' : 'ver-ok');
    el.classList.add('show');
  }
  return { open, close, dom: el };
}
