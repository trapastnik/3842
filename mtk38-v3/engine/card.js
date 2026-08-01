// МТК 38 · engine/card.js
// Карточка языка — переиспользуемый модуль для ВСЕХ вариантов показа (v3 globe/rain/map,
// v2 studio/map). Верхний блок: написание в своей письменности · имя · эндоним ·
// письмо/семья/ареал/источник · бейдж верификатора.
// Нижний блок «Издание»: обложка, заглавие на языке издания, русский перевод,
// город/издательство/год. Если изданий несколько (испанский — 10, английский — 5) —
// переключатель ‹ N/M ›.
//
// Тач-киоск: никаких hover-состояний, крупные зоны нажатия, закрытие ✕ / Esc / тап вне.

const FAM = (sc) => (sc === 'Latn' || sc === 'Cyrl')
  ? `'20 Kopeek','noto-fallback','Arial Unicode MS',sans-serif`
  : `'Arial Unicode MS','noto-fallback','noto-${sc}',sans-serif`;

const CSS = `
.v3card{position:fixed;left:50%;bottom:-820px;transform:translateX(-50%);z-index:9;width:min(560px,92vw);
  max-height:86vh;overflow-y:auto;-webkit-overflow-scrolling:touch;
  background:rgba(20,25,28,.93);backdrop-filter:blur(14px);border:1px solid rgba(210,183,115,.4);border-radius:16px;
  padding:18px 22px;color:#CFD0CF;font-family:'20 Kopeek',ui-monospace,Menlo,monospace;
  transition:bottom .5s cubic-bezier(.2,.7,.2,1);box-shadow:0 18px 60px rgba(0,0,0,.5)}
.v3card.show{bottom:24px}
.v3card .x{position:absolute;top:6px;right:8px;width:40px;height:40px;line-height:40px;text-align:center;
  cursor:pointer;color:#9DA3A8;font-size:20px}
.v3card .w{font-size:clamp(34px,5vw,60px);color:#F7F9EF;line-height:1.1;text-shadow:0 0 24px rgba(247,249,239,.25)}
.v3card .n{font-size:19px;color:#F7F9EF;font-weight:600;margin-top:3px}
.v3card .e{font-size:15px;color:#D2B773}
.v3card .many{margin-top:10px}
.v3card .many-n{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9DA3A8;margin-bottom:7px}
.v3card .chips{display:flex;flex-wrap:wrap;gap:6px;max-height:132px;overflow-y:auto}
.v3card .chip{height:32px;padding:0 12px;border:1px solid rgba(210,183,115,.34);border-radius:8px;
  background:transparent;color:#CFD0CF;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.v3card .chip[aria-current="true"]{background:#D2B773;color:#1a1f23;border-color:#D2B773;font-weight:600}
.v3card .rows{margin-top:12px;font-size:13px;display:grid;grid-template-columns:auto 1fr;gap:4px 14px}
.v3card .rows b{color:#9DA3A8;font-weight:600}
.v3card .ver{margin-top:11px;display:inline-block;font-size:11px;padding:3px 10px;border-radius:10px}
.v3card .ver-ok{background:#D2B773;color:#1a1f23}
.v3card .ver-warn{background:#A02128;color:#fff}

.v3card .pub{margin-top:16px;padding-top:14px;border-top:1px solid rgba(210,183,115,.26);display:none}
.v3card .pub.on{display:block}
.v3card .pub-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;min-height:34px}
.v3card .pub-head>span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9DA3A8}
.v3card .nav{display:flex;align-items:center;gap:4px}
.v3card .nav button{width:36px;height:36px;border:1px solid rgba(210,183,115,.4);background:transparent;
  color:#D2B773;border-radius:8px;font-size:16px;cursor:pointer;font-family:inherit;padding:0}
.v3card .nav button:disabled{opacity:.3}
.v3card .nav i{font-style:normal;font-size:12px;color:#9DA3A8;min-width:46px;text-align:center}
.v3card .pub-body{display:flex;gap:14px;align-items:flex-start}
.v3card .cover{width:104px;flex:0 0 104px;border-radius:5px;display:none}
.v3card .cover.on{display:block}
.v3card .pub-txt{flex:1 1 auto;min-width:0}
.v3card .t-nat{font-size:15px;color:#F7F9EF;line-height:1.35;white-space:pre-line}
.v3card .t-ru{font-size:13px;color:#CFD0CF;margin-top:5px;line-height:1.35}
.v3card .imp{font-size:12px;color:#9DA3A8;margin-top:7px}
.v3card .none{font-size:12px;color:#9DA3A8;font-style:italic}
`;

/**
 * @param {Object} opts
 * @param {Map}    opts.publications  lang_id → [издание, …]; см. engine/data.js → loadPublications
 */
export function createCard(opts = {}) {
  const pubs = opts.publications || new Map();

  if (!document.getElementById('v3card-css')) {
    const st = document.createElement('style'); st.id = 'v3card-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.className = 'v3card';
  el.innerHTML = `<span class="x">✕</span>
    <div class="w"></div>
    <div class="many"><div class="many-n"></div><div class="chips"></div></div>
    <div class="n"></div><div class="e"></div>
    <div class="rows"></div><span class="ver"></span>
    <div class="pub">
      <div class="pub-head">
        <span>издание</span>
        <div class="nav"><button class="prev" aria-label="предыдущее издание">‹</button><i></i><button class="next" aria-label="следующее издание">›</button></div>
      </div>
      <div class="pub-body">
        <img class="cover" alt="">
        <div class="pub-txt"><div class="t-nat"></div><div class="t-ru"></div><div class="imp"></div></div>
      </div>
    </div>`;
  document.body.appendChild(el);

  const q = (s) => el.querySelector(s);
  const close = () => el.classList.remove('show');
  let list = [], idx = 0;

  q('.x').onclick = close;
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  // Тап мимо карточки закрывает её. Слушаем на фазе перехвата (иначе сцена успеет
  // обработать тап первой), поэтому свои нажатия отсеиваем проверкой цели —
  // stopPropagation внутри карточки до перехвата просто не доходит.
  addEventListener('pointerdown', (e) => {
    if (el.classList.contains('show') && !el.contains(e.target)) close();
  }, true);

  q('.prev').onclick = () => { if (idx > 0) { idx--; renderPub(); } };
  q('.next').onclick = () => { if (idx < list.length - 1) { idx++; renderPub(); } };

  function renderPub() {
    const box = q('.pub');
    if (!list.length) { box.classList.remove('on'); return; }
    box.classList.add('on');
    const p = list[idx];
    q('.nav').style.visibility = list.length > 1 ? 'visible' : 'hidden';
    q('.nav i').textContent = `${idx + 1} / ${list.length}`;
    q('.prev').disabled = idx === 0;
    q('.next').disabled = idx === list.length - 1;

    const img = q('.cover');
    if (p.covers && p.covers.length) {
      img.classList.add('on');
      img.onerror = () => img.classList.remove('on');
      img.src = p.covers[0];
    } else { img.classList.remove('on'); img.removeAttribute('src'); }

    const nat = q('.t-nat');
    if (p.titleNative || p.titleRu) {
      nat.textContent = p.titleNative || '';
      q('.t-ru').textContent = p.titleRu ? (p.titleNative ? `— ${p.titleRu}` : p.titleRu) : '';
    } else {
      nat.innerHTML = '<span class="none">описания издания в источнике нет</span>';
      q('.t-ru').textContent = '';
    }
    const imp = [p.cityRu || p.cityNative, p.publisherRu || p.publisherNative, p.year]
      .filter(Boolean).join(', ');
    q('.imp').textContent = [imp, p.area ? `· ${p.area}` : ''].filter(Boolean).join(' ');
  }

  // Показ одного языка (внутри формы или самостоятельного). Написание задаётся формой
  // и не меняется при переключении языков — оно у них общее, в этом весь смысл группы.
  function renderLang(w) {
    const ff = FAM(w.sc);
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

    list = pubs.get(w.id) || [];
    idx = 0;
    renderPub();
  }

  const plural = (n) => n % 10 === 1 && n % 100 !== 11 ? 'язык'
    : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'языка' : 'языков';

  function open(w) {
    if (!w) return;
    const cw = q('.w'); cw.textContent = w.w; cw.style.fontFamily = FAM(w.sc);

    // форма, общая для нескольких языков → чипы с выбором; иначе блок скрыт
    const langs = (w.langs && w.langs.length > 1) ? w.langs : null;
    const many = q('.many');
    many.style.display = langs ? 'block' : 'none';
    if (langs) {
      q('.many-n').textContent = `так пишут ${langs.length} ${plural(langs.length)}`;
      const chips = q('.chips');
      chips.innerHTML = '';
      langs.forEach((l, k) => {
        const b = document.createElement('button');
        b.className = 'chip'; b.textContent = l.n;
        b.setAttribute('aria-current', k === 0 ? 'true' : 'false');
        b.onclick = () => {
          [...chips.children].forEach((c, j) => c.setAttribute('aria-current', j === k ? 'true' : 'false'));
          renderLang(l);
        };
        chips.appendChild(b);
      });
      renderLang(langs[0]);
    } else {
      renderLang(w);
    }
    el.scrollTop = 0;
    el.classList.add('show');
  }

  return { open, close, dom: el };
}
