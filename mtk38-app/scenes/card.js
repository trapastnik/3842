/* МТК 38 · карточка языка для киоск-приложения.
 *
 * Макет — тот же, что был в прототипе mtk38-map и теперь во всех вариантах:
 * центр экрана, затемнение, написание крупно (Nolde), название языка латунным
 * моноширинным, факты строками, издание с обложкой. Копия живёт здесь, а не
 * подключается из mtk38-v3/: прототипы уйдут после миграции, приложение
 * должно остаться самодостаточным.
 *
 * Издания приходят готовой Map из scenes/shared.js (пути обложек уже с базой).
 */

// шрифт для САМОГО написания: бренд для латиницы/кириллицы, Noto — для своей письменности
const FAM = (sc) => (sc === 'Latn' || sc === 'Cyrl')
  ? `'Nolde','20 Kopeek','noto-fallback','Arial Unicode MS',sans-serif`
  : `'Arial Unicode MS','noto-fallback','noto-${sc}',sans-serif`;
// эндоним — тот же скрипт, но без Nolde: он декоративный и в мелком кегле нечитаем
const FAM_SMALL = (sc) => (sc === 'Latn' || sc === 'Cyrl')
  ? `'20 Kopeek','noto-fallback','Arial Unicode MS',sans-serif`
  : `'Arial Unicode MS','noto-fallback','noto-${sc}',sans-serif`;

const CSS = `
.v3card{--paper:#F7F9EF;--brass:#D2B773;--red:#A02128;--window:#9DA3A8;--telegrey:#CFD0CF;
  position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(.96);z-index:9;
  width:min(720px,86vw);max-height:88vh;overflow-y:auto;-webkit-overflow-scrolling:touch;
  padding:clamp(24px,3vw,40px) clamp(28px,4vw,52px);
  background:rgba(18,22,26,.94);border:1.5px solid var(--brass);border-radius:18px;
  color:var(--paper);font-family:'21 Cent',Georgia,serif;text-align:center;
  box-shadow:0 24px 80px rgba(0,0,0,.75);isolation:isolate;overflow-x:hidden;
  opacity:0;visibility:hidden;transition:opacity .28s ease,transform .28s ease,visibility .28s}
.v3card.show{opacity:1;visibility:visible;transform:translate(-50%,-50%) scale(1)}
/* фирменные диагонали V1: латунный волосок и красная полоса за содержимым */
.v3card::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:-1;opacity:.55;
  background:
    linear-gradient(105deg,transparent 0,transparent 86%,var(--red) 86%,var(--red) 92%,transparent 92.2%),
    linear-gradient(105deg,transparent 0,transparent 64%,var(--brass) 64%,var(--brass) 64.16%,transparent 64.32%)}
.v3card::-webkit-scrollbar{width:8px}
.v3card::-webkit-scrollbar-thumb{background:rgba(210,183,115,.28);border-radius:4px}

.v3card .x{position:absolute;top:10px;right:12px;width:44px;height:44px;line-height:44px;text-align:center;
  cursor:pointer;color:var(--window);font-size:20px;border-radius:10px}

/* написание — Nolde, крупно, с тенью; как в карточке V1-карты */
.v3card .w{font-family:'Nolde',Georgia,serif;font-weight:600;
  font-size:clamp(52px,7vw,108px);line-height:1;color:var(--paper);
  text-shadow:0 6px 28px rgba(0,0,0,.75);word-break:break-word}
.v3card .head{margin:12px 0 20px;display:flex;flex-direction:column;gap:6px;align-items:center}
.v3card .n{font-family:'20 Kopeek',ui-monospace,monospace;font-size:clamp(18px,2vw,28px);
  letter-spacing:.22em;text-transform:uppercase;color:var(--brass)}
.v3card .e{font-family:'21 Cent',Georgia,serif;font-size:clamp(14px,1.3vw,18px);color:rgba(247,249,239,.5)}

/* строки-факты: ключ моноширинным в разрядку, значение читаемым, линейка снизу */
.v3card .rows{display:grid;gap:10px;margin-bottom:18px;text-align:left}
.v3card .rows>div{display:grid;grid-template-columns:clamp(130px,26%,210px) 1fr;gap:18px;align-items:baseline;
  font-size:clamp(14px,1.2vw,18px);padding-bottom:8px;border-bottom:1px solid rgba(210,183,115,.18)}
.v3card .rows>div:last-child{border-bottom:none}
.v3card .rows b{font-family:'20 Kopeek',ui-monospace,monospace;font-weight:400;font-size:.78em;
  letter-spacing:.16em;text-transform:uppercase;color:rgba(247,249,239,.55)}
.v3card .rows span{color:var(--paper)}

.v3card .ver{display:inline-flex;align-items:center;gap:8px;margin-bottom:8px;
  font-family:'20 Kopeek',ui-monospace,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;
  color:rgba(247,249,239,.42)}
.v3card .ver i{width:7px;height:7px;border-radius:50%;background:var(--brass);font-style:normal;flex:0 0 auto}
/* Не красный: статус «уточняется» — рабочая пометка, а не тревога, и стоит он
 * у 79 из 128 языков. Красным он превращал нормальное состояние каталога в
 * сплошное предупреждение (дизайн-код: красный — точечный акцент). */
.v3card .ver-warn{color:rgba(247,249,239,.42)}
.v3card .ver-warn i{background:var(--window)}

/* языки одной формы */
.v3card .many{margin-bottom:22px}
.v3card .many-n{font-family:'20 Kopeek',ui-monospace,monospace;font-size:11px;letter-spacing:.18em;
  text-transform:uppercase;color:rgba(247,249,239,.45);margin-bottom:10px}
.v3card .chips{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;max-height:132px;overflow-y:auto}
.v3card .chip{min-height:36px;padding:0 14px;border:1px solid rgba(210,183,115,.3);border-radius:999px;
  background:transparent;color:var(--telegrey);font-family:'20 Kopeek',ui-monospace,monospace;font-size:11px;
  letter-spacing:.14em;text-transform:uppercase;cursor:pointer;white-space:nowrap}
.v3card .chip[aria-current="true"]{background:var(--brass);color:#12161a;border-color:var(--brass)}

/* издание */
.v3card .pub{margin-top:4px;padding-top:18px;border-top:1px solid rgba(210,183,115,.22);display:none;text-align:left}
.v3card .pub.on{display:block}
.v3card .pub-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;min-height:38px}
.v3card .pub-head>span{font-family:'20 Kopeek',ui-monospace,monospace;font-size:11px;letter-spacing:.18em;
  text-transform:uppercase;color:rgba(247,249,239,.45)}
.v3card .nav{display:flex;align-items:center;gap:6px}
.v3card .nav button{width:38px;height:38px;border:1px solid rgba(210,183,115,.34);background:transparent;
  color:var(--brass);border-radius:999px;font-size:17px;cursor:pointer;font-family:inherit;padding:0;line-height:1}
.v3card .nav button:disabled{opacity:.28}
.v3card .nav i{font-style:normal;font-family:'20 Kopeek',ui-monospace,monospace;font-size:12px;
  color:rgba(247,249,239,.45);min-width:48px;text-align:center}
.v3card .pub-body{display:flex;gap:22px;align-items:flex-start}
.v3card .cover{width:132px;flex:0 0 132px;border-radius:3px;display:none;
  border:1px solid rgba(210,183,115,.22);box-shadow:0 8px 26px rgba(0,0,0,.5)}
.v3card .cover.on{display:block}
.v3card .pub-txt{flex:1 1 auto;min-width:0}
.v3card .t-nat{font-size:clamp(17px,1.5vw,21px);line-height:1.35;color:var(--paper);white-space:pre-line}
.v3card .t-ru{font-size:15px;line-height:1.4;color:rgba(247,249,239,.62);margin-top:8px}
.v3card .imp{font-family:'20 Kopeek',ui-monospace,monospace;font-size:12px;letter-spacing:.06em;
  color:var(--brass);margin-top:14px}
.v3card .imp em{font-style:normal;color:rgba(247,249,239,.42)}
.v3card .none{font-size:14px;color:rgba(247,249,239,.42);font-style:italic}

.v3card .hint{margin-top:18px;font-family:'20 Kopeek',ui-monospace,monospace;
  font-size:clamp(11px,1.1vw,13px);letter-spacing:.18em;text-transform:uppercase;color:rgba(247,249,239,.42)}

/* затемнение позади — как .info-backdrop в V1 */
.v3card-back{position:fixed;inset:0;z-index:8;background:rgba(0,0,0,.55);
  backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);
  opacity:0;visibility:hidden;transition:opacity .28s ease,visibility .28s}
.v3card-back.show{opacity:1;visibility:visible}

@media (max-width:560px){
  .v3card{padding:26px 22px}
  .v3card .pub-body{gap:14px}
  .v3card .cover{width:96px;flex:0 0 96px}
  .v3card .rows>div{grid-template-columns:1fr;gap:4px}
}
`;


/**
 * @param {Object}   opts
 * @param {Map}      opts.publications  lang_id → [издание, …]; см. engine/data.js → loadPublications
 * @param {Function} [opts.t]           словарь ядра: t("card.area") → подпись на языке киоска
 * @param {Function} [opts.lang]        текущий язык киоска: нужен для числовых форм
 *
 * Переводятся ПОДПИСИ (хром), но не содержание: названия языков, ареалы и
 * выходные сведения существуют в каноне только по-русски — их перевод
 * кураторская работа, а не техническая (Этап A, PLAN-KIOSK).
 */
export function createCard(opts = {}) {
  const pubs = opts.publications || new Map();
  const FALLBACK = {
    'card.area': 'регион', 'card.speakers': 'носители', 'card.script': 'письменность',
    'card.family': 'семья', 'card.edition': 'издание',
    'card.verified': 'написание выверено', 'card.unverified': 'написание уточняется',
    'card.hint': 'коснитесь снаружи, чтобы закрыть',
    'card.also': 'также', 'card.no-edition': 'описания издания в источнике нет',
    'card.prev': 'предыдущее издание', 'card.next': 'следующее издание',
    'card.langs': 'так пишут', 'card.speakers-mln': 'млн носителей',
    'card.speakers-mlrd': 'млрд носителей',
    'card.lang-one': 'язык', 'card.lang-few': 'языка',
    'card.lang-many': 'языков', 'card.lang-other': 'языка',
  };
  /* Страховка на случай карточки без переводчика (сцена не передала t) или
   * пустого словаря. У ядра фолбэк свой — текущий язык → ru → ключ, — поэтому
   * при живом словаре эта ветка не срабатывает. */
  const t = (key) => {
    const v = opts.t ? opts.t(key) : null;
    return (!v || v === key) ? (FALLBACK[key] || key) : v;
  };

  if (!document.getElementById('v3card-css')) {
    const st = document.createElement('style'); st.id = 'v3card-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.className = 'v3card kiosk-scroll';
  el.innerHTML = `<span class="x">✕</span>
    <div class="w"></div>
    <div class="head"><span class="n"></span><span class="e"></span></div>
    <div class="many"><div class="many-n"></div><div class="chips"></div></div>
    <div class="rows"></div><span class="ver"><i></i><em></em></span>
    <div class="pub">
      <div class="pub-head">
        <span>${t('card.edition')}</span>
        <div class="nav"><button class="prev" aria-label="${t('card.prev')}">‹</button><i></i><button class="next" aria-label="${t('card.next')}">›</button></div>
      </div>
      <div class="pub-body">
        <img class="cover" alt="">
        <div class="pub-txt"><div class="t-nat"></div><div class="t-ru"></div><div class="imp"></div></div>
      </div>
    </div>
    <div class="hint">${t('card.hint')}</div>`;
  // затемнение позади карточки — как .info-backdrop в V1-карте
  const back = document.createElement('div');
  back.className = 'v3card-back';
  document.body.appendChild(back);
  document.body.appendChild(el);

  const q = (s) => el.querySelector(s);
  const close = () => { el.classList.remove('show'); back.classList.remove('show'); };
  let list = [], idx = 0, startIdx = 0, lastShown = null;

  q('.x').onclick = close;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  // Тап мимо карточки закрывает её. Слушаем на фазе перехвата (иначе сцена обработает тап
  // первой), поэтому свои нажатия отсеиваем проверкой цели, а не stopPropagation.
  const onDown = (e) => {
    if (el.classList.contains('show') && !el.contains(e.target)) close();
  };
  addEventListener('keydown', onKey);
  addEventListener('pointerdown', onDown, true);

  /* Киоск живёт сменами и переключает сцены сотнями раз. Карточка вешает узлы
   * в <body> и два слушателя на window, поэтому сцена ОБЯЗАНА звать destroy()
   * в unmount: иначе к вечеру в документе висит полсотни мёртвых карточек,
   * каждая со своим перехватчиком pointerdown. */
  const destroy = () => {
    close();
    removeEventListener('keydown', onKey);
    removeEventListener('pointerdown', onDown, true);
    back.remove();
    el.remove();
  };

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
      nat.innerHTML = `<span class="none">${t('card.no-edition')}</span>`;
      q('.t-ru').textContent = '';
    }
    // выходные данные: город · издательство · год, ареал приглушённо в конце
    const imp = [p.cityRu || p.cityNative, p.publisherRu || p.publisherNative, p.year].filter(Boolean);
    q('.imp').innerHTML = imp.join(' · ')
      + (p.area ? `${imp.length ? ' <em>· </em>' : ''}<em>${p.area}</em>` : '');
  }

  // Показ одного языка формы. Написание общее для всех её языков и не меняется.
  function renderLang(w) {
    lastShown = w;
    q('.n').textContent = w.n;
    const ce = q('.e'); ce.textContent = w.e; ce.style.fontFamily = FAM_SMALL(w.sc);
    const also = (w.also && w.also.length) ? ` · ${t('card.also')} ${w.also.join(', ')}` : '';
    const row = (k, v) => `<div><b>${k}</b><span>${v}</span></div>`;
    const sp = (typeof w.speakers === 'number' && isFinite(w.speakers))
      ? (w.speakers >= 1000 ? `≈ ${(w.speakers / 1000).toFixed(1).replace('.', ',')} ${t('card.speakers-mlrd')}`
                            : `≈ ${w.speakers} ${t('card.speakers-mln')}`) : '';
    q('.rows').innerHTML =
      row(t('card.area'), w.r + also) +
      (sp ? row(t('card.speakers'), sp) : '') +
      row(t('card.script'), w.scn) +
      row(t('card.family'), w.f);
    const ver = q('.ver'), warn = w.ver === 'needs-verification';
    ver.className = 'ver' + (warn ? ' ver-warn' : '');
    ver.querySelector('em').textContent = warn
      ? t('card.unverified')
      : `${t('card.verified')} · ${w.src}`;

    list = pubs.get(w.id) || [];
    // startIdx — тап по точке города печати на карте открывает сразу это издание
    idx = Math.min(Math.max(0, startIdx), Math.max(0, list.length - 1));
    startIdx = 0;
    renderPub();
  }

  /* Форма слова «язык» — из словаря, а не из русского правила в коде: иначе на
   * английском выходило «written so by 3 языка». Категорию (one/few/many/other)
   * даёт Intl по языку киоска, словарь отвечает только за текст. */
  const plural = (n) => {
    let cat = 'other';
    try { cat = new Intl.PluralRules(opts.lang ? opts.lang() : 'ru').select(n); } catch (_) {}
    return t('card.lang-' + cat);
  };

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
      q('.many-n').textContent = `${t('card.langs')} ${langs.length} ${plural(langs.length)}`;
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
    back.classList.add('show');
    el.classList.add('show');
  }

  /* Язык киоска меняется кнопкой на сцене, поэтому подписи пересобираются на
   * лету; открытая карточка перерисовывается тем же языком, что показывала. */
  function setLang() {
    q('.pub-head span').textContent = t('card.edition');
    q('.prev').setAttribute('aria-label', t('card.prev'));
    q('.next').setAttribute('aria-label', t('card.next'));
    q('.hint').textContent = t('card.hint');
    if (el.classList.contains('show') && lastShown) renderLang(lastShown);
  }

  return { open, close, destroy, setLang, isOpen: () => el.classList.contains('show'), dom: el };
}
