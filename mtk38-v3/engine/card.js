// МТК 38 · engine/card.js
// Карточка языка — переиспользуемый модуль для ВСЕХ вариантов показа (v3 globe/rain/map,
// v2 studio/map). Верхний блок: написание в своей письменности · имя · эндоним ·
// письмо/семья/ареал · состояние проверки. Нижний блок «Издание»: обложка, заглавие на
// языке издания, русский перевод, город/издательство/год. Если изданий несколько
// (испанский — 10, английский — 5) — переключатель ‹ N/M ›. Если написание общее для
// нескольких языков (36 у «Ленин») — выбор языка чипами.
//
// Типографика по дизайн-коду (COORDINATION.md, 2026-05-12):
//   Nolde     — только крупные заголовки; здесь это САМО НАПИСАНИЕ (латиница/кириллица),
//               для прочих письменностей — их Noto, у Nolde нет этих глифов;
//   21 Cent   — читаемый текст: название языка, заглавия изданий;
//   20 Kopeek — подписи, метаданные, годы, технические строки.
// Красный — точечный акцент (метка «требует проверки»), не заливка.
//
// Тач-киоск: никаких hover-состояний, крупные зоны нажатия, закрытие ✕ / Esc / тап вне.

// шрифт для САМОГО написания: бренд для латиницы/кириллицы, Noto — для своей письменности
const FAM = (sc) => (sc === 'Latn' || sc === 'Cyrl')
  ? `'Nolde','20 Kopeek','noto-fallback','Arial Unicode MS',sans-serif`
  : `'Arial Unicode MS','noto-fallback','noto-${sc}',sans-serif`;
// эндоним — тот же скрипт, но без Nolde: он декоративный и в мелком кегле нечитаем
const FAM_SMALL = (sc) => (sc === 'Latn' || sc === 'Cyrl')
  ? `'20 Kopeek','noto-fallback','Arial Unicode MS',sans-serif`
  : `'Arial Unicode MS','noto-fallback','noto-${sc}',sans-serif`;

const CSS = `
.v3card{--paper:#F7F9EF;--brass:#D2B773;--red:#A02128;--window:#9DA3A8;--telegrey:#CFD0CF;--graphite:#435059;
  position:fixed;left:50%;bottom:-880px;transform:translateX(-50%);z-index:9;
  width:min(620px,94vw);max-height:88vh;overflow-y:auto;-webkit-overflow-scrolling:touch;
  background:rgba(24,29,33,.95);backdrop-filter:blur(16px);
  border:1px solid rgba(210,183,115,.34);border-radius:18px;
  padding:30px 34px 28px;color:var(--telegrey);
  font-family:'21 Cent',system-ui,sans-serif;
  transition:bottom .5s cubic-bezier(.2,.7,.2,1);box-shadow:0 22px 70px rgba(0,0,0,.55)}
.v3card.show{bottom:26px}
.v3card::-webkit-scrollbar{width:8px}
.v3card::-webkit-scrollbar-thumb{background:rgba(210,183,115,.28);border-radius:4px}

.v3card .x{position:absolute;top:12px;right:14px;width:44px;height:44px;line-height:44px;text-align:center;
  cursor:pointer;color:var(--window);font-size:20px;border-radius:10px}

/* написание — главный герой карточки */
.v3card .w{font-size:clamp(44px,6.4vw,74px);color:var(--paper);line-height:1.06;
  letter-spacing:.01em;text-shadow:0 0 30px rgba(247,249,239,.22);word-break:break-word}
.v3card .head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:12px;
  padding-bottom:16px;border-bottom:1px solid rgba(210,183,115,.2)}
.v3card .n{font-size:21px;font-weight:700;color:var(--paper)}
.v3card .e{font-size:16px;color:var(--brass)}

/* метаданные: подпись 20 Kopeek в разрядку, значение — читаемым 21 Cent */
.v3card .rows{margin-top:16px;display:grid;grid-template-columns:auto 1fr;gap:9px 20px;align-items:baseline}
.v3card .rows b{font-family:'20 Kopeek',ui-monospace,monospace;font-weight:400;font-size:11px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--window);white-space:nowrap}
.v3card .rows span{font-size:15px;line-height:1.4;color:var(--telegrey)}

.v3card .ver{margin-top:18px;display:inline-flex;align-items:center;gap:8px;
  font-family:'20 Kopeek',ui-monospace,monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;
  padding:7px 14px;border-radius:11px;border:1px solid rgba(210,183,115,.4);color:var(--brass)}
.v3card .ver i{width:7px;height:7px;border-radius:50%;background:var(--brass);font-style:normal;flex:0 0 auto}
.v3card .ver-warn{border-color:rgba(160,33,40,.65);color:#E2777C}
.v3card .ver-warn i{background:var(--red)}

/* языки одного написания */
.v3card .many{margin-top:18px}
.v3card .many-n{font-family:'20 Kopeek',ui-monospace,monospace;font-size:11px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--window);margin-bottom:9px}
.v3card .chips{display:flex;flex-wrap:wrap;gap:7px;max-height:140px;overflow-y:auto;padding-right:2px}
.v3card .chip{height:36px;padding:0 14px;border:1px solid rgba(210,183,115,.3);border-radius:9px;
  background:transparent;color:var(--telegrey);font-family:'21 Cent',system-ui,sans-serif;font-size:13px;
  cursor:pointer;white-space:nowrap}
.v3card .chip[aria-current="true"]{background:var(--brass);color:#1a1f23;border-color:var(--brass);font-weight:700}

/* издание */
.v3card .pub{margin-top:22px;padding-top:18px;border-top:1px solid rgba(210,183,115,.2);display:none}
.v3card .pub.on{display:block}
.v3card .pub-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;min-height:38px}
.v3card .pub-head>span{font-family:'20 Kopeek',ui-monospace,monospace;font-size:11px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--window)}
.v3card .nav{display:flex;align-items:center;gap:6px}
.v3card .nav button{width:38px;height:38px;border:1px solid rgba(210,183,115,.34);background:transparent;
  color:var(--brass);border-radius:9px;font-size:17px;cursor:pointer;font-family:inherit;padding:0;line-height:1}
.v3card .nav button:disabled{opacity:.28}
.v3card .nav i{font-style:normal;font-family:'20 Kopeek',ui-monospace,monospace;font-size:12px;
  color:var(--window);min-width:48px;text-align:center}
.v3card .pub-body{display:flex;gap:20px;align-items:flex-start}
.v3card .cover{width:132px;flex:0 0 132px;border-radius:3px;display:none;
  border:1px solid rgba(210,183,115,.22);box-shadow:0 8px 26px rgba(0,0,0,.5)}
.v3card .cover.on{display:block}
.v3card .pub-txt{flex:1 1 auto;min-width:0}
.v3card .t-nat{font-size:18px;line-height:1.35;color:var(--paper);white-space:pre-line}
.v3card .t-ru{font-size:15px;line-height:1.4;color:var(--telegrey);margin-top:8px}
.v3card .imp{font-family:'20 Kopeek',ui-monospace,monospace;font-size:12px;letter-spacing:.04em;
  color:var(--brass);margin-top:12px}
.v3card .imp em{font-style:normal;color:var(--window)}
.v3card .none{font-size:14px;color:var(--window);font-style:italic}

@media (max-width:560px){
  .v3card{padding:24px 20px 22px}
  .v3card .pub-body{gap:14px}
  .v3card .cover{width:96px;flex:0 0 96px}
}
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
    <div class="head"><span class="n"></span><span class="e"></span></div>
    <div class="many"><div class="many-n"></div><div class="chips"></div></div>
    <div class="rows"></div><span class="ver"><i></i><em></em></span>
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
  let list = [], idx = 0, startIdx = 0;

  q('.x').onclick = close;
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  // Тап мимо карточки закрывает её. Слушаем на фазе перехвата (иначе сцена обработает тап
  // первой), поэтому свои нажатия отсеиваем проверкой цели, а не stopPropagation.
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
      nat.textContent = p.titleNative || p.titleRu;
      q('.t-ru').textContent = (p.titleNative && p.titleRu) ? p.titleRu : '';
    } else {
      nat.innerHTML = '<span class="none">описания издания в источнике нет</span>';
      q('.t-ru').textContent = '';
    }
    // выходные данные: город · издательство · год, ареал приглушённо в конце
    const imp = [p.cityRu || p.cityNative, p.publisherRu || p.publisherNative, p.year].filter(Boolean);
    q('.imp').innerHTML = imp.join(' · ')
      + (p.area ? `${imp.length ? ' <em>· </em>' : ''}<em>${p.area}</em>` : '');
  }

  // Показ одного языка формы. Написание общее для всех её языков и не меняется.
  function renderLang(w) {
    q('.n').textContent = w.n;
    const ce = q('.e'); ce.textContent = w.e; ce.style.fontFamily = FAM_SMALL(w.sc);
    const also = (w.also && w.also.length) ? ` · также ${w.also.join(', ')}` : '';
    q('.rows').innerHTML =
      `<b>письмо</b><span>${w.scn}</span>` +
      `<b>семья</b><span>${w.f}</span>` +
      `<b>ареал</b><span>${w.r}${also}</span>`;
    const ver = q('.ver'), warn = w.ver === 'needs-verification';
    ver.className = 'ver' + (warn ? ' ver-warn' : '');
    ver.querySelector('em').textContent = warn
      ? 'написание ждёт проверки носителем'
      : `написание выверено · ${w.src}`;

    list = pubs.get(w.id) || [];
    // startIdx — тап по точке города печати на карте открывает сразу это издание
    idx = Math.min(Math.max(0, startIdx), Math.max(0, list.length - 1));
    startIdx = 0;
    renderPub();
  }

  const plural = (n) => n % 10 === 1 && n % 100 !== 11 ? 'язык'
    : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'языка' : 'языков';

  /**
   * @param w         язык или форма (см. groupByWriting)
   * @param pubIndex  какое издание раскрыть сразу (тап по точке города печати)
   */
  function open(w, pubIndex) {
    if (!w) return;
    startIdx = Number.isInteger(pubIndex) ? pubIndex : 0;
    const cw = q('.w'); cw.textContent = w.w; cw.style.fontFamily = FAM(w.sc);

    const langs = (w.langs && w.langs.length > 1) ? w.langs : null;
    q('.many').style.display = langs ? 'block' : 'none';
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
      q('.chips').innerHTML = '';   // иначе в DOM висят чипы предыдущей карточки
      renderLang(w);
    }
    el.scrollTop = 0;
    el.classList.add('show');
  }

  return { open, close, dom: el };
}
