/* Сцена «В одном масштабе» — 283 памятника на общей шкале высот.
 * Перенос из mtk41-scale/ на контракт сцены.
 *
 * Навигация. Лента при слоте 84 px — 23 772 px, на панели 3840 это 6,2 экрана
 * драга без ориентиров. Два способа двигаться по ней сведены переключателем:
 *   СКРАББЕР    полоса внизу со сжатой хронологией; тап — прыжок, драг —
 *               промотка. Штрих на памятник высотой ~ его росту, так что
 *               полоса читается и как спарклайн.
 *   ЗУМ         ширина слота переменная: от всего корпуса в экране до фигуры.
 *
 * Был третий — ДЕСЯТИЛЕТИЯ, страницы по декадам. Снят вместе с переездом
 * отбора по декаде в финдер (решение координатора 2026-08-10): его чипы
 * делали `_all.filter(...)`, то есть были ОТБОРОМ, а не видом. После переезда
 * фильтр действует в обоих оставшихся режимах, а группировка по декадам и так
 * читается на оси лет. Ключи `mode.decades` и `mode.all` удалены из всех трёх
 * словарей: правка состава должна быть полной, иначе через полгода мёртвый
 * ключ прочтут как забытую функцию.
 *
 * Масштаб метра. Считался ОДИН РАЗ по всему корпусу — из опасения, что иначе
 * четырёхметровый бюст займёт столько же, сколько колосс 57 м, и «в одном
 * масштабе» перестанет быть правдой. На живом экране опасение обернулось
 * своей противоположностью: при медиане 9.1 м и максимуме 57 м (Волгоград-
 * Красноармейский) окно 1920-х отдавало под содержимое десятую часть высоты,
 * а шкала показывала 25 и 50 м в пустоте. Смотреть было не на что.
 *
 * Теперь масштаб берётся от самого высокого В КАДРЕ (настройка «Масштаб
 * высоты по», прежнее поведение осталось вариантом «Всему корпусу»). Цена
 * названа прямо: два памятника, не попавшие в кадр одновременно, больше не
 * сравнимы на глаз по размеру. Расплата закрыта тем, что вместе с масштабом
 * пересчитываются отметки высот и фигура человека 1.75 м — абсолютная
 * величина читается в любой момент, а сравнение всё равно происходит внутри
 * одного экрана. Человек при этом не может уйти за кромку: пол по нему
 * жёсткий, иначе кадр из одних бюстов растянул бы их во весь экран.
 *
 * Отличия от прототипа, требуемые киоском:
 *  - режим НЕ персистится в localStorage (в прототипе был mtk41-scale-mode):
 *    дефолт задаётся схемой настроек, а idle-сброс обязан вернуть именно его;
 *  - буфер канвы под потолком 8.3 Мп, размер меряется сам, ResizeObserver
 *    гардится на ноль;
 *  - pause() останавливает rAF полностью. */
import {
  DATA,
  FALLBACK_HEIGHT,
  HUMAN_HEIGHT_M,
  PALETTE,
  byYear,
  cardUrl,
  createCanvasHost,
  createCard,
  cssColor,
  preloadThumbs,
  statusColor,
  createHint,
  fillTextIfFits,
  FINDER_FIELDS,
  countryOptions,
  decadeOptions,
  APP,
  drawEmptyState,
  hintForEmpty,
  emptyVerdict,
  finderApply,
  finderSort,
  setCorpus,
  statusOptions,
} from "./shared.js?v=66";

const MIN_SLOT_W = 84;
const PAD_LEFT = 0.13;
export const STRIP_H = 74;
const STRIP_PAD = 28;
const FRICTION = 0.93;
const MIN_VELOCITY = 0.4;
const SLOT_MAX = 120;
const LABEL_MIN_SLOT = 34;
const YEAR_MIN_SLOT = 16;
const TAP_MIN_SLOT = 26;
const DOUBLE_TAP_MS = 320;
const TAP_THRESHOLD = 8;
/* Какую долю слота разрешено занять фигуре по ширине. Остаток — воздух между
 * соседями: при 1.0 силуэты соприкасались бы кромками и читались как один
 * сплошной частокол. */
const WIDTH_HEADROOM = 0.86;
/* Режимов два, а было три. «Десятилетия» СНЯТ вместе с переездом отбора по
 * декаде в финдер (утверждено координатором 2026-08-10, вариант 1).
 *
 * Почему снят, а не оставлен рядом: чипы декад делали `_all.filter(...)`,
 * то есть это был ОТБОР, а не вид, и по канону отбор переезжает в панель.
 * После переезда фильтр действует во ВСЕХ режимах — посетителю лучше, — и у
 * режима не осталось ничего своего: он превратился бы в «Скраббер» с
 * наложенным фильтром. Группировка по декадам при этом никуда не делась,
 * она читается на самой оси лет.
 *
 * В протокол приёмки внесена строка «где режим „Десятилетия“» — это точка
 * возврата решения, если на живом экране оно не понравится. */
const MODES = ["scrubber", "zoom"];

export const scaleScene = {
  id: "scale",
  title: { ru: "В одном масштабе", en: "At one scale", zh: "同一比例" },

  preload: {
    data: {
      monuments: DATA.monuments,
      photos: DATA.photos,
      thumbs: DATA.thumbs,
      cards: DATA.cards,
      heights: DATA.heights,
    },
    custom: preloadThumbs,
  },

  /* Финдер. Декада здесь — полноценный фильтр, переехавший из чипов режима.
   * Сортировка «по высоте» объявлена потому, что ось высот — главный герой
   * сцены: рейтинг вместо хронологии это второй честный взгляд на те же
   * данные, и эффект максимально видимый. */
  finder: {
    search: { fields: FINDER_FIELDS },
    filters: [
      { key: "status", label: { ru: "Судьба", en: "Fate" },
        options: function () { return statusOptions(APP()); } },
      { key: "country", label: { ru: "Страна", en: "Country" },
        options: function () { return countryOptions(); } },
      { key: "decade", label: { ru: "Десятилетие", en: "Decade" },
        options: function () { return decadeOptions(); } },
    ],
    sorts: [
      { key: "year", label: { ru: "По годам", en: "By year" } },
      { key: "height", label: { ru: "По высоте", en: "By height" } },
    ],
  },

  settings: [
    { key: "mode", label: { ru: "Способ промотки", en: "Scrolling" },
      type: "choice", default: "scrubber",
      options: [{ value: "scrubber", label: { ru: "Скраббер", en: "Scrubber" } },
                { value: "zoom", label: { ru: "Зум", en: "Zoom" } },
                ] },
    { key: "slotW", label: { ru: "Ширина слота", en: "Slot width" },
      type: "range", min: 48, max: 160, step: 4, unit: " px", default: MIN_SLOT_W },
    { key: "fitMode", label: { ru: "Масштаб высоты по", en: "Height scale from" },
      type: "choice", default: "view",
      options: [{ value: "view", label: { ru: "Видимым", en: "Visible" } },
                { value: "corpus", label: { ru: "Всему корпусу", en: "Whole corpus" } },
                ] },
    { key: "fitShare", label: { ru: "Доля экрана под самый высокий", en: "Tallest fills" },
      type: "range", min: 40, max: 90, step: 5, unit: " %", default: 66 },
    { key: "showStrip", label: { ru: "Полоса-скраббер", en: "Scrubber strip" },
      type: "toggle", default: true },
    { key: "showGuides", label: { ru: "Линии высот", en: "Height guides" },
      type: "toggle", default: true },
    { key: "showHuman", label: { ru: "Фигура человека 1.75 м", en: "Human 1.75 m" },
      type: "toggle", default: true },
  ],

  mount(el, ctx) {
    this._ctx = ctx;
    this._app = ctx.app;

    const root = document.createElement("div");
    root.className = "m41-scene m41-scale";
    root.innerHTML =
      '<header class="m41-head"><h1 class="m41-head__title"></h1>' +
      '<p class="m41-head__sub"></p></header>' +
      '<div class="m41-scale__stage"></div>' +
      '<div class="m41-nav"><div class="m41-nav__row" data-modes></div>' +
      '<div class="m41-nav__row m41-nav__row--sub" data-sub></div></div>';
    el.appendChild(root);

    this._root = root;
    this._stage = root.querySelector(".m41-scale__stage");
    this._titleEl = root.querySelector(".m41-head__title");
    this._subEl = root.querySelector(".m41-head__sub");
    this._modesEl = root.querySelector("[data-modes]");
    this._subEl2 = root.querySelector("[data-sub]");
    this._card = createCard(el, ctx.app, ctx);
    this._card.onClose(() => { this._selected = -1; });

    this._host = createCanvasHost(this._stage, "m41-scale__canvas");

    /* Подсказка — на СТОЛ, не на канву: детей <canvas> браузер не рисует.
     * Стол ужимается, когда растут собственные контролы (режим слабовидящих
     * растит --ui-scale), поэтому подсказка не наезжает на них ни в одном
     * режиме — защита структурная, а не подобранным числом. */
    this._hint = createHint(this._stage, "swipe", "hint." + this.id, ctx.app);
    this._host.observe(() => { this._layout(); });

    this._src = ctx.data.monuments.items || [];
    this._items = this._src;
    setCorpus(ctx.data.monuments.items || [], ctx.app);
    this._heights = ctx.data.heights || {};
    this._selected = -1;
    this._view = { offset: 0, velocity: 0, slotZoom: 0, fitSlot: 0 };
    this._placed = [];
    /* В mount() строим только ПОРЯДОК, без раскладки: _layout читает
     * this._cfg, а его ставит applySettings — она идёт в самом конце mount.
     * Полный _applyFind() здесь падал на _cfg.slotW, и журнал это показал
     * («mount() — Cannot read properties of undefined»), пока стенд молчал.
     * Раскладку сделает applySettings, отбор — ядро сразу после mount. */
    this._all = byYear(this._items);


    this._bindPointer();
    this._onNav = (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      this._onControl(b.getAttribute("data-act"), b.getAttribute("data-val"));
    };
    root.querySelector(".m41-nav").addEventListener("click", this._onNav);

    this.applySettings(this._cfg || {});
  },

  unmount() {
    if (this._hint) { this._hint.destroy(); this._hint = null; }
    if (this._host) this._host.destroy();
    if (this._card) this._card.destroy();
    if (this._root) {
      const nav = this._root.querySelector(".m41-nav");
      if (nav) nav.removeEventListener("click", this._onNav);
      this._root.remove();
    }
    this._root = this._host = this._card = null;
  },

  /* Неактивная сцена — 0 rAF и 0 таймеров. Проверяется на приёмке. */
  pause() { if (this._host) this._host.stop(); },

  resume() {
    if (!this._host) return;
    /* Меряем сами: ResizeObserver в скрытой вкладке не доставляется, и первая
     * раскладка после возврата иначе осталась бы от старого размера. */
    this._host.measure();
    this._layout();
    this._host.start(() => this._frame());
  },

  reset() {
    if (this._card) this._card.close();
    this._selected = -1;
    /* Режим возвращается к дефолту СХЕМЫ, а не к последнему выбранному:
     * персиста нет намеренно — следующий посетитель должен получить экран
     * таким, каким его задумал оператор. */
    this._mode = (this._cfg && this._cfg.mode) || "scrubber";
    this._view.offset = 0;
    this._view.velocity = 0;
    this._view.slotZoom = 0;
    this._buildControls();
    this._layout();
  },

  setLang() { this._renderHead(); this._buildControls(); if (this._hint) this._hint.relabel(); },

  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
    this._layout();
  },

  healthcheck() {
    if (!this._host) return { ok: true, detail: "не смонтирована" };
    /* Канвовая сцена без размера — «ещё не показывалась», а не поломка
     * (канон кита, README п. про healthcheck; конвенция принята по заявке
     * МТК 41). Спрашиваем ЖИВОЙ бокс: host.width — это память о последнем
     * измерении, она переживает скрытие слоя и соврёт по неактивной сцене. */
    if (!this._host.liveBox().w) return { ok: true, detail: "ещё не показывалась" };

    /* Буфер сверяем ПО ФАКТИЧЕСКОМУ dpr, а не по ширине бокса: счётчик фигур
     * бывает зелёным, пока сцена рисует всё до одной — но в чужом разрешении
     * (карта 42 так рисовала в 4%). Формула одна с отрисовкой — bufferFor(). */
    const buf = this._host.bufferOk();
    if (!buf.ok) return { ok: false, detail: "буфер " + buf.detail };
    /* _placed может ещё не существовать: _applyFind зовётся из mount() до
     * его инициализации, а healthcheck стенд может позвать в любой момент. */
    if (!(this._placed || []).length) return emptyVerdict(this._find, "на шкале нет ни одной фигуры");
    const measured = (this._placed || []).filter((p) => !p.estimated).length;
    return { ok: true, detail: `фигур ${(this._placed || []).length}, с габаритами ${measured}, буфер ${buf.detail}` };
  },

  /* Отбор целиком, при любом изменении. Порядок канона: отбор → поиск →
   * сортировка. */
  applyFinder(find) {
    this._find = find;
    this._applyFind();
    return { shown: this._items.length, total: (this._src || []).length };
  },

  _applyFind() {
    this._items = finderApply(this._src || [], this._find);
    const sort = (this._find || {}).sort;
    this._all = sort === "height"
      ? finderSort(this._items, "height", this._heights)
          .map((m, k) => ({ m, i: (this._src || []).indexOf(m), year: m.year || 0, k }))
      : byYear(this._items).map((it) => ({ ...it, i: (this._src || []).indexOf(it.m) }));
    /* Промотку сбрасываем: при смене набора старое смещение указывает в
     * никуда. Проверка на _view осталась как дешёвая страховка — настоящую
     * защиту даёт условие в _layout, оно закрывает все пути сразу. */
    if (this._view) { this._view.offset = 0; this._view.velocity = 0; }
    /* Меряем ЖИВОЙ бокс перед пересборкой. Геометрия, от которой зависит
     * healthcheck, обязана считаться вне кадра (канон GRABLI): _host.width —
     * это кеш последнего measure(), а measure() живёт в rAF. Стенд приёмки
     * разворачивает каждый фильтр в состояние и зовёт healthcheck БЕЗ
     * отрисовки — на кеше он получил бы «ни одной фигуры» у исправной сцены. */
    /* Меряем ВСЕГДА, а не только при нулевом кеше: смена отбора меняет и
     * раскладку вокруг (у сцены пропал ряд чипов — стол стал выше), а буфер
     * остался бы от прежнего бокса, и healthcheck честно ругался бы на
     * несоответствие. measure() дешёвый и сам возвращает false, если размер
     * не менялся. */
    if (this._host) this._host.measure();
    /* Пустую выборку обнуляем ЗДЕСЬ: _layout выходит в самом начале, если
     * список пуст, и до внутренней очистки дело не доходит — старые фигуры
     * переживали отбор, а healthcheck рапортовал «фигур 283» при нуле
     * показанных. Индикатор, переживший данные. */
    if (!this._all.length) this._placed = [];
    else if (this._host && this._host.width) this._layout();
    /* Шапку зовём ОТСЮДА, а не изнутри _layout: у той несколько ранних
     * выходов (нет размера, пустая выборка), и на каждом заголовок терялся —
     * на пустом отборе экран оставался даже без названия сцены. Заголовок от
     * выборки не зависит, значит и от её раскладки зависеть не должен. */
    this._renderHead();

    /* И ЕЩЁ РАЗ меряем — уже ПОСЛЕ того, как перестроились шапка и ряд чипов.
     *
     * Смена отбора меняет DOM вокруг холста, стол меняет высоту, и первый
     * замер ловит ещё старый бокс: healthcheck начинал колебаться «844 вместо
     * 894» и обратно. На киоске это лечится наблюдателем размера — но он в
     * скрытой вкладке НЕ ДОСТАВЛЯЕТСЯ ВООБЩЕ, а стенд приёмки работает именно
     * в скрытой. То есть ложный провал увидел бы каждый, кто прогонит стенд.
     *
     * Чтение getBoundingClientRect синхронно и отдаёт уже новую раскладку,
     * поэтому второй замер здесь честен и не требует кадра. */
    if (this._host && this._host.measure() && this._all.length) this._layout();
  },

  applySettings(values) {
    this._cfg = Object.assign(
      { mode: "scrubber", slotW: MIN_SLOT_W, showStrip: true, showGuides: true, showHuman: true },
      values || {});
    if (!this._host) return;
    if (!this._mode) this._mode = this._cfg.mode;
    this._buildControls();
    this._host.measure();
    this._layout();
    if (!this._host.running()) this._host.start(() => this._frame());
  },

  /* ─── раскладка ─────────────────────────────────────────────────────── */

  _layout() {
    const h = this._host;
    /* ПРЕДУСЛОВИЯ РАСКЛАДКИ, а не гард у каждого вызывающего.
     *
     * Раскладка пишет в this._view и читает this._cfg. Оба создаются в mount()
     * — и порядок вызовов оказался хрупким: стоило позвать _applyFind() чуть
     * выше, как _layout падал на `_view.fitSlot`, mount обрывался, _view так и
     * не создавался, и КАЖДЫЙ последующий resume() падал снова. На живом
     * экране это убивало обе ленты; в скрытой вкладке пряталось, потому что
     * при боксе 0×0 до этих строк дело не доходило.
     *
     * Гард у одного вызывающего лечит один путь. Условие здесь лечит все:
     * функция сама отказывается работать без того, что ей нужно. */
    if (!h || !h.width || !this._view || !this._cfg) return;
    if (!this._all || !this._all.length) return;

    /* Максимум по ВСЕМУ корпусу — см. шапку файла. */
    this._maxTotal = 0;
    for (const it of this._all) {
      const hh = this._heights[it.m.id] || FALLBACK_HEIGHT;
      this._maxTotal = Math.max(this._maxTotal, hh.statue + hh.pedestal);
    }

    /* Набор задаёт финдер, а не режим: декада переехала в панель и теперь
     * действует в обоих режимах. */
    const items = this._all;
    /* Пустая выборка обязана обнулить раскладку. Иначе ранний выход оставляет
     * СТАРЫЕ фигуры в _placed, и healthcheck рапортует «фигур 283» при нуле
     * показанных — индикатор, переживший данные. */
    if (!items.length) {
      /* Шапку рисуем ДО выхода: заголовок сцены не зависит от выборки, а
       * ранний выход её проглатывал — на пустом отборе экран оставался без
       * названия, и было непонятно даже, где ты находишься. */
      this._placed = [];
      this._renderHead();
      return;
    }

    const strip = this._hasStrip();
    const left = h.width * PAD_LEFT;
    const right = h.width * 0.98;
    const viewportW = right - left;
    const baseY = strip ? (h.height - STRIP_H) * 0.84 : h.height * 0.9;
    const skyTop = h.height * 0.06;
    const sky = baseY - skyTop;
    /* Прежний масштаб — от самого высокого во ВСЁМ корпусе. Остаётся как
     * вариант настройки и как запасной ответ, когда считать по видимым не от
     * чего (пустой кадр). */
    const mPxCorpus = (sky * 0.9) / this._maxTotal;

    /* Масштаб ПО ВЫБОРКЕ — им меряем слот. Слот обязан быть статичен на
     * промотке (иначе лента поедет под пальцем), поэтому ширину считаем от
     * выборки, а не от того, что сейчас в кадре. */
    let maxSel = 0;
    for (const it of items) {
      const hh = this._heights[it.m.id] || FALLBACK_HEIGHT;
      maxSel = Math.max(maxSel, hh.statue + hh.pedestal);
    }
    const mPxSel = maxSel > 0 ? (sky * this._fitShare()) / maxSel : mPxCorpus;

    this._view.fitSlot = viewportW / items.length;
    let slot;
    if (this._mode === "zoom") {
      if (!this._view.slotZoom) this._view.slotZoom = this._view.fitSlot;
      this._view.slotZoom = Math.min(SLOT_MAX, Math.max(this._view.fitSlot, this._view.slotZoom));
      slot = this._view.slotZoom;
    } else {
      slot = Math.max(this._cfg.slotW, this._view.fitSlot);
    }

    /* ШИРИНА СЛОТА ИДЁТ ЗА МАСШТАБОМ. У силуэтов ширина фигуры считается от
     * высоты (пропорции снимка), поэтому подъём масштаба раздвигает фигуры —
     * и без этого пола они налезли бы друг на друга. Считаем по самой широкой
     * в выборке при масштабе выборки: слот статичен, а расстояние между
     * памятниками растёт вместе с их размером. */
    let needSlot = 0;
    for (const it of items) {
      const hh = this._heights[it.m.id] || FALLBACK_HEIGHT;
      const ar = this._figureAspect(it.m);
      if (ar > 0) needSlot = Math.max(needSlot, (hh.statue + hh.pedestal) * mPxSel * ar);
    }
    if (needSlot > 0) slot = Math.max(slot, needSlot / WIDTH_HEADROOM);

    const figureW = Math.min(slot * 0.55, 80);
    this._placed = items.map((it, k) => {
      const hh = this._heights[it.m.id] || FALLBACK_HEIGHT;
      return {
        i: it.i, year: it.year, m: it.m,
        worldX: left + slot * (k + 0.5),
        baseY, w: figureW,
        statueH: hh.statue * mPxCorpus,
        pedestalH: hh.pedestal * mPxCorpus,
        totalH: (hh.statue + hh.pedestal) * mPxCorpus,
        hs: hh.statue, hp: hh.pedestal,
        /* Габаритов нет у 52 из 283 — рисуем пунктиром и подписываем «нет
         * данных», а не выдаём подставную высоту за измеренную. */
        estimated: !this._heights[it.m.id],
      };
    });

    this._geom = { left, right, baseY, sky, mPx: mPxCorpus, mPxCorpus, slot, viewportW,
      contentW: slot * items.length };
    this._clamp();
    /* Мгновенно, без плавности: при входе в сцену и на ресайзе разгон масштаба
     * с корпусного до кадрового читался бы как самопроизвольное движение. */
    this._updateScale(true);
    this._renderHead();
  },

  _fitShare() {
    const v = this._cfg && this._cfg.fitShare;
    return Math.max(0.4, Math.min(0.9, (typeof v === "number" ? v : 66) / 100));
  },

  /* Отношение ширины фигуры к её высоте — или 0, если ширина от высоты НЕ
   * зависит. У «Масштаба» фигура процедурная: её ширина задана слотом, и рост
   * масштаба её не раздувает. У «Силуэтов» ширина идёт от пропорций снимка —
   * там переопределено. */
  _figureAspect() { return 0; },

  /* Целевой масштаб метра.
   *
   * «Корпус» — прежнее поведение: масштаб от самого высокого из 283, один на
   * всю ленту. Честно для сравнения, но на ранних десятилетиях, где всё по
   * 3–7 м против колосса 57 м, отдаёт под содержимое десятую часть экрана.
   *
   * «Видимым» — от самого высокого В КАДРЕ: экран занят всегда. Цена названа
   * прямо: два памятника, не попавшие в кадр одновременно, больше не
   * сравнимы «на глаз» по размеру. Поэтому линии высот и фигура человека
   * пересчитываются вместе с масштабом — абсолютная величина остаётся
   * читаемой в любой момент, и «в одном масштабе» продолжает выполняться
   * там, где сравнение и происходит: внутри одного экрана. */
  _scaleTarget() {
    const g = this._geom, h = this._host;
    if (!g || !h) return 0;
    if (!this._cfg || this._cfg.fitMode === "corpus") return g.mPxCorpus;

    let maxM = 0, capPx = Infinity;
    for (const pm of this._placed) {
      const x = this._screenX(pm.worldX);
      if (x < -g.slot || x > h.width + g.slot) continue;
      const total = pm.hs + pm.hp;
      if (total > maxM) maxM = total;
      /* Потолок по ширине: расти можно, пока соседи не соприкоснулись. */
      const ar = this._figureAspect(pm.m);
      if (ar > 0 && total > 0) capPx = Math.min(capPx, (g.slot * WIDTH_HEADROOM) / (total * ar));
    }
    if (!(maxM > 0)) return g.mPxCorpus;          // в кадре нет ничего с высотой
    /* ЧЕЛОВЕК ОБЯЗАН ОСТАТЬСЯ В КАДРЕ. Иначе кадр с одними бюстами по 0.6 м
     * растянул бы их на две трети экрана, а отметка 1.75 м уехала бы за
     * верхнюю кромку — и пропал бы единственный ориентир, по которому видно,
     * что фигуры мелкие. Тогда «в одном масштабе» превратилось бы в «каждый
     * во весь экран». */
    const humanCap = (g.sky * 0.9) / HUMAN_HEIGHT_M;
    return Math.min((g.sky * this._fitShare()) / maxM, capPx, humanCap);
  },

  /* Пересчёт масштаба под текущий кадр. Зовётся каждый кадр — набор видимых
   * меняется на промотке, а не только на раскладке. */
  _updateScale(instant) {
    const g = this._geom;
    if (!g || !this._placed || !this._placed.length) return;
    const target = this._scaleTarget();
    if (!(target > 0) || !isFinite(target)) return;
    const cur = g.mPx;
    /* Плавно: масштаб меняется прямо во время промотки, и рывок читался бы
     * как подмена данных, а не как приближение. Порог — чтобы не гонять
     * пересчёт 283 фигур на исчезающе малой разнице. */
    const next = (instant || Math.abs(target - cur) < cur * 0.004)
      ? target : cur + (target - cur) * 0.16;
    if (next === cur) return;
    g.mPx = next;
    for (const pm of this._placed) {
      pm.statueH = pm.hs * next;
      pm.pedestalH = pm.hp * next;
      pm.totalH = (pm.hs + pm.hp) * next;
    }
  },

  _hasStrip() { return this._mode === "scrubber" && this._cfg.showStrip; },

  _clamp() {
    const g = this._geom;
    if (!g) return;
    if (g.contentW <= g.viewportW) { this._view.offset = 0; return; }
    const min = g.viewportW - g.contentW;
    if (this._view.offset > 0) this._view.offset = 0;
    if (this._view.offset < min) this._view.offset = min;
  },

  _screenX(worldX) { return worldX + this._view.offset; },

  _renderHead() {
    if (!this._titleEl) return;
    const app = this._app;
    this._titleEl.textContent = app.t("scale.title");
    const byId = new Map(this._items.map((m) => [m.id, m]));
    const totals = Object.entries(this._heights)
      .map(([id, h]) => ({ id, total: (h.statue || 0) + (h.pedestal || 0) }))
      .filter((e) => e.total > 0 && byId.has(e.id))
      .sort((a, b) => a.total - b.total);
    if (!totals.length) { this._subEl.textContent = ""; return; }
    const lo = totals[0], hi = totals[totals.length - 1];
    const fmt = (v) => (v < 1 ? Math.round(v * 100) + " см" : (+v.toFixed(1)) + " м");
    const name = (e) => byId.get(e.id).city + ", " + byId.get(e.id).year;
    this._subEl.textContent = app.t("scale.range", {
      lo: fmt(lo.total), loName: name(lo), hi: fmt(hi.total), hiName: name(hi),
    });
  },

  /* ─── органы управления ─────────────────────────────────────────────── */

  _buildControls() {
    if (!this._modesEl) return;
    const app = this._app;
    const btn = (label, act, val, on, n) =>
      '<button type="button" class="kiosk-target' + (on ? " is-on" : "") +
      '" data-act="' + act + '" data-val="' + val + '">' + label +
      (n != null ? '<span class="m41-nav__n">' + n + "</span>" : "") + "</button>";

    this._modesEl.innerHTML = MODES
      .map((m) => btn(app.t("mode." + m), "mode", m, this._mode === m)).join("");

    if (this._mode === "zoom") {
      const atFit = this._view.slotZoom <= this._view.fitSlot + 0.5;
      this._subEl2.innerHTML =
        btn(app.t("mode.whole"), "zoom", "fit", atFit) +
        btn(app.t("mode.close"), "zoom", "in", !atFit);
    } else {
      this._subEl2.innerHTML = "";
    }
  },

  _onControl(act, val) {
    if (act === "mode") {
      if (this._mode === val) return;
      this._mode = val;
      this._view.offset = 0;
      this._view.velocity = 0;
      this._view.slotZoom = 0;
      if (this._card) this._card.close();
    } else if (act === "zoom") {
      this._setSlot(val === "fit" ? this._view.fitSlot : SLOT_MAX * 0.7, this._host.width / 2);
    }
    this._buildControls();
    this._layout();
  },

  _setSlot(next, anchorX) {
    if (this._mode !== "zoom" || !this._geom) return;
    const clamped = Math.min(SLOT_MAX, Math.max(this._view.fitSlot, next));
    if (clamped === this._view.slotZoom) return;
    /* Точка под пальцем остаётся на месте: без этого зум уводил бы к центру. */
    const before = (anchorX - this._view.offset - this._geom.left) / this._view.slotZoom;
    this._view.slotZoom = clamped;
    this._layout();
    this._view.offset = anchorX - this._geom.left - before * this._view.slotZoom;
    this._clamp();
    this._buildControls();
  },

  /* ─── ввод ──────────────────────────────────────────────────────────── */

  _bindPointer() {
    const c = this._host.canvas;
    const st = { down: false, drag: false, onStrip: false, x0: 0, y0: 0, lastX: 0,
      pointers: new Map(), pinchDist: 0, pinchSlot: 0, pinchX: 0, lastTap: 0 };
    this._pst = st;

    this._onDown = (e) => {
      st.pointers.set(e.pointerId, e.clientX);
      if (this._mode === "zoom" && st.pointers.size === 2) {
        const [a, b] = [...st.pointers.values()];
        st.pinchDist = Math.abs(a - b);
        st.pinchSlot = this._view.slotZoom;
        st.pinchX = (a + b) / 2;
        st.down = false;
        return;
      }
      st.down = true; st.drag = false; this._view.velocity = 0;
      st.x0 = e.clientX; st.y0 = e.clientY; st.lastX = e.clientX;
      const r = c.getBoundingClientRect();
      st.onStrip = this._hasStrip() && (e.clientY - r.top) >= this._host.height - STRIP_H;
      if (st.onStrip) this._scrollToFraction(this._stripFraction(e.clientX - r.left));
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
    };

    this._onMove = (e) => {
      if (st.pointers.has(e.pointerId)) st.pointers.set(e.pointerId, e.clientX);
      if (this._mode === "zoom" && st.pointers.size === 2 && st.pinchDist > 0) {
        const [a, b] = [...st.pointers.values()];
        const r = c.getBoundingClientRect();
        this._setSlot(st.pinchSlot * (Math.abs(a - b) / st.pinchDist), st.pinchX - r.left);
        return;
      }
      if (!st.down) return;
      const r = c.getBoundingClientRect();
      if (st.onStrip) {
        this._scrollToFraction(this._stripFraction(e.clientX - r.left));
        st.lastX = e.clientX;
        return;
      }
      if (!st.drag && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > TAP_THRESHOLD) {
        st.drag = true;
      }
      if (st.drag) {
        const dx = e.clientX - st.lastX;
        this._view.offset += dx;
        this._view.velocity = dx;
        this._clamp();
      }
      st.lastX = e.clientX;
    };

    this._onUp = (e) => {
      st.pointers.delete(e.pointerId);
      if (st.pointers.size < 2) st.pinchDist = 0;
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* не критично */ }
      if (st.down && !st.drag && !st.onStrip) {
        const now = Date.now();
        const r = c.getBoundingClientRect();
        if (this._mode === "zoom" && now - st.lastTap < DOUBLE_TAP_MS) {
          const atFit = this._view.slotZoom > this._view.fitSlot + 0.5;
          this._setSlot(atFit ? this._view.fitSlot : SLOT_MAX * 0.7, e.clientX - r.left);
          this._buildControls();
          st.lastTap = 0;
        } else {
          st.lastTap = now;
          /* На обзорном зуме фигура уже 5 px — попасть пальцем нельзя, и
           * «промах» с закрытием карточки только раздражал бы. */
          if (this._geom && this._geom.slot >= TAP_MIN_SLOT) {
            const hit = this._hitTest(e.clientX - r.left, e.clientY - r.top);
            if (hit) { this._selected = hit.i; this._card.open(hit.m); this._app.poke(); }
            else this._card.close();
          }
        }
      }
      st.down = false; st.onStrip = false;
    };

    this._onWheel = (e) => {
      if (this._mode !== "zoom") return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this._setSlot(this._view.slotZoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left);
      this._buildControls();
    };

    c.addEventListener("pointerdown", this._onDown);
    c.addEventListener("pointermove", this._onMove, { passive: true });
    c.addEventListener("pointerup", this._onUp);
    c.addEventListener("pointercancel", this._onUp);
    c.addEventListener("wheel", this._onWheel, { passive: false });
  },

  _hitTest(x, y) {
    let best = null, bestD = Infinity;
    for (const pm of this._placed) {
      const sx = this._screenX(pm.worldX);
      const hx = Math.max(pm.w, 24);
      if (x >= sx - hx && x <= sx + hx && y >= pm.baseY - pm.totalH - 14 && y <= pm.baseY + 30) {
        const d = Math.abs(x - sx);
        if (d < bestD) { bestD = d; best = pm; }
      }
    }
    return best;
  },

  _scrollFraction() {
    const g = this._geom;
    if (!g) return 0;
    const span = g.contentW - g.viewportW;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, -this._view.offset / span));
  },

  _scrollToFraction(f) {
    const g = this._geom;
    if (!g) return;
    const span = g.contentW - g.viewportW;
    if (span <= 0) return;
    this._view.offset = -Math.min(1, Math.max(0, f)) * span;
    this._clamp();
  },

  _stripFraction(x) {
    const g = this._geom;
    const w = (this._host.width - STRIP_PAD) - STRIP_PAD;
    const winW = Math.max(10, w * Math.min(1, g.viewportW / g.contentW));
    /* Тап ставит ЦЕНТР окна в точку касания, а не его левый край. */
    return (x - STRIP_PAD - winW / 2) / Math.max(1, w - winW);
  },

  /* ─── отрисовка ─────────────────────────────────────────────────────── */

  _frame() {
    const h = this._host;
    if (!h || !this._geom) return;
    if (!this._pst.down && Math.abs(this._view.velocity) > MIN_VELOCITY) {
      this._view.offset += this._view.velocity;
      this._view.velocity *= FRICTION;
      const before = this._view.offset;
      this._clamp();
      if (this._view.offset !== before) this._view.velocity = 0;
    }
    const ctx = h.ctx;
    /* Отбор не дал совпадений — заглушка вместо пустого поля: панель пишет
     * «0 из 283», но сцена без подписи это чистый экран без объяснения. */
    if (this._items && !this._items.length) {
      ctx.clearRect(0, 0, h.width, h.height);
      drawEmptyState(ctx, h.width, h.height, this._app);
      hintForEmpty(this, true);
      return;
    }
    hintForEmpty(this, false);
    ctx.clearRect(0, 0, h.width, h.height);
    /* ДО отрисовки: набор видимых меняется на промотке, и линии высот с
     * фигурой человека обязаны быть в том же масштабе, что и фигуры. */
    this._updateScale();
    this._drawScene();
    this._drawFigures();
    this._drawStrip();
  },

  _drawScene() {
    const h = this._host, ctx = h.ctx, g = this._geom;
    ctx.strokeStyle = cssColor(PALETTE.brass, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, g.baseY);
    ctx.lineTo(h.width, g.baseY);
    ctx.stroke();

    if (this._cfg.showGuides) {
      const guides = this._guideValues();
      ctx.save();
      ctx.font = `400 ${Math.max(11, h.height * 0.013)}px "20 Kopeek", monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (const m of guides) {
        const y = g.baseY - m * g.mPx;
        if (y < h.height * 0.02) continue;
        const isHuman = m === HUMAN_HEIGHT_M;
        ctx.strokeStyle = isHuman ? cssColor(PALETTE.brass, 0.4) : cssColor(PALETTE.paper, 0.1);
        ctx.lineWidth = isHuman ? 1.2 : 0.7;
        ctx.setLineDash(isHuman ? [4, 6] : [2, 10]);
        ctx.beginPath();
        ctx.moveTo(h.width * 0.08, y);
        ctx.lineTo(h.width * 0.97, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = cssColor(PALETTE.paper, isHuman ? 0.9 : 0.45);
        ctx.fillText(isHuman ? this._app.t("legend.human", { n: m }) : m + " м",
          h.width * 0.075, y);
      }
      ctx.restore();
    }

    if (this._cfg.showHuman) this._drawHuman(h.width * 0.045, g.baseY, HUMAN_HEIGHT_M * g.mPx);
  },

  /* Отметки высоты под ТЕКУЩИЙ масштаб.
   *
   * Раньше стоял неподвижный список [1.75, 5, 10, 25, 50]. При масштабе от
   * всего корпуса он и был верен, а при масштабе по кадру половина отметок
   * уходит за верхнюю кромку: на экране с шестиметровыми фигурами ось
   * показывала «25 м» и «50 м» в пустоте, и шкала выглядела сломанной. Шаг
   * берём «круглый» (1-2-5 × 10ⁿ), чтобы отметок было 3–5 при любом масштабе.
   * Человек 1.75 м остаётся всегда: это единственный якорь, по которому
   * посетитель понимает величину без чтения цифр. */
  _guideValues() {
    const g = this._geom, h = this._host;
    if (!g || !g.mPx) return [HUMAN_HEIGHT_M];
    const topM = (g.baseY - h.height * 0.02) / g.mPx;
    if (!(topM > 0) || !isFinite(topM)) return [HUMAN_HEIGHT_M];
    /* Шаг — наименьший круглый, при котором отметок не больше шести. Через
     * лестницу, а не через log-округление: у последнего на границе (n чуть
     * больше 2) шаг перескакивал с 20 на 50, и вместо пяти отметок
     * оставалась одна. */
    let step = 0;
    for (let p = -1; p <= 3 && !step; p++) {
      for (const b of [1, 2, 5]) {
        const cand = b * Math.pow(10, p);
        if (topM / cand <= 5) { step = cand; break; }
      }
    }
    if (!step) step = 1000;
    const out = [HUMAN_HEIGHT_M];
    for (let v = step; v <= topM; v += step) {
      /* Отметку вплотную к человеку не ставим: две подписи в одной строке
       * наезжают друг на друга. */
      if (Math.abs(v - HUMAN_HEIGHT_M) > step * 0.35) out.push(+v.toFixed(2));
    }
    return out;
  },

  _drawHuman(cx, baseY, px) {
    const ctx = this._host.ctx;
    const headR = px * 0.075, legT = px * 0.2;
    ctx.save();
    ctx.fillStyle = cssColor(PALETTE.paper, 0.55);
    ctx.beginPath();
    ctx.arc(cx, baseY - px + headR, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - px * 0.06, baseY - px + headR * 2);
    ctx.lineTo(cx + px * 0.06, baseY - px + headR * 2);
    ctx.lineTo(cx + px * 0.08, baseY - legT);
    ctx.lineTo(cx - px * 0.08, baseY - legT);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - px * 0.07, baseY - legT, px * 0.05, legT);
    ctx.fillRect(cx + px * 0.02, baseY - legT, px * 0.05, legT);
    ctx.restore();
  },

  _drawFigures() {
    const h = this._host, ctx = h.ctx, g = this._geom;
    for (const pm of this._placed) {
      const x = this._screenX(pm.worldX);
      if (x < -80 || x > h.width + 80) continue;      // за кадром — не рисуем
      const sel = pm.i === this._selected;
      const bottom = pm.baseY - pm.pedestalH;

      ctx.save();
      if (!pm.estimated) {
        ctx.fillStyle = sel ? cssColor(PALETTE.brass, 0.5) : cssColor(PALETTE.graphite, 0.92);
        ctx.fillRect(x - pm.w * 0.4, bottom, pm.w * 0.8, pm.pedestalH);
      } else {
        ctx.setLineDash([4, 4]);
      }
      ctx.strokeStyle = sel ? PALETTE.brass
        : cssColor(PALETTE.window, pm.estimated ? 0.7 : 0.5);
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(x - pm.w * 0.4, bottom, pm.w * 0.8, pm.pedestalH);
      ctx.restore();

      const sTop = bottom - pm.statueH;
      const bodyW = pm.w * 0.5, headW = pm.w * 0.32, headH = pm.statueH * 0.22;
      ctx.save();
      if (pm.estimated) {
        ctx.strokeStyle = cssColor(sel ? PALETTE.brass : PALETTE.window, 0.7);
        ctx.lineWidth = sel ? 2 : 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x - bodyW * 0.5, sTop + headH, bodyW, bottom - sTop - headH);
        ctx.strokeRect(x - headW * 0.5, sTop, headW, headH);
      } else {
        ctx.fillStyle = sel ? PALETTE.brass : statusColor(pm.m.status);
        ctx.globalAlpha = pm.m.status === "unknown" ? 0.55 : 0.92;
        ctx.fillRect(x - bodyW * 0.5, sTop + headH, bodyW, bottom - sTop - headH);
        ctx.fillRect(x - headW * 0.5, sTop, headW, headH);
      }
      ctx.restore();
    }

    /* Подписи вынесены в отдельный метод: их переиспользует сцена «Силуэты»,
     * где своя отрисовка фигур, но ровно те же пороги читаемости и повороты. */
    this._drawLabels(g);
  },

  _drawLabels(g) {
    const h = this._host, ctx = h.ctx;
    /* Подписи гаснут, когда слот уже порога читаемости: название города в
     * 13 px — каша, которая мешает увидеть форму корпуса. */
    if (g.slot < YEAR_MIN_SLOT) return;
    const showCity = g.slot >= LABEL_MIN_SLOT;
    const rotate = g.slot < 90;
    for (const pm of this._placed) {
      const x = this._screenX(pm.worldX);
      if (x < -120 || x > h.width + 120) continue;
      const sel = pm.i === this._selected;
      const y = pm.baseY + 14;
      const fs = Math.max(10, Math.min(pm.w * 0.32, h.height * 0.016));
      ctx.save();
      ctx.font = `${sel ? 600 : 400} ${fs}px "20 Kopeek", monospace`;
      const cityRaw = pm.m.city || pm.m.country || "";
      /* Никаких «Благовещенск-Аму…»: канон подписей запрещает огрызок на
       * объекте. Длинное имя либо помещается целиком, либо не рисуется —
       * фигура различима и без него, имя даёт тап. */
      const city = cityRaw;
      const year = pm.year ? String(pm.year) : "—";
      const height = pm.estimated ? this._app.t("card.nodata")
        : (pm.hs + pm.hp).toFixed(pm.hs + pm.hp < 10 ? 1 : 0) + " м";
      if (rotate) {
        ctx.translate(x, y);
        ctx.rotate(-Math.PI / 3);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        let row = 0;
        if (showCity) {
          ctx.fillStyle = sel ? PALETTE.brass : cssColor(PALETTE.paper, 0.85);
          if (fillTextIfFits(ctx, city, 0, 0)) row = 1;
        }
        ctx.fillStyle = cssColor(PALETTE.brass, sel ? 0.95 : 0.6);
        fillTextIfFits(ctx, year, 0, fs * 1.25 * row);
        if (showCity) {
          ctx.fillStyle = cssColor(PALETTE.paper, 0.55);
          fillTextIfFits(ctx, height, 0, fs * 2.5);
        }
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        let row = 0;
        if (showCity) {
          ctx.fillStyle = sel ? PALETTE.brass : cssColor(PALETTE.paper, 0.78);
          if (fillTextIfFits(ctx, city, x, y)) row = 1;
        }
        ctx.fillStyle = cssColor(PALETTE.brass, sel ? 0.9 : 0.55);
        fillTextIfFits(ctx, year, x, y + fs * 1.4 * row);
        if (showCity) {
          ctx.fillStyle = cssColor(PALETTE.paper, 0.55);
          fillTextIfFits(ctx, height, x, y + fs * 2.8);
        }
      }
      ctx.restore();
    }
  },

  _drawStrip() {
    if (!this._hasStrip() || !this._placed.length) return;
    const h = this._host, ctx = h.ctx, g = this._geom;
    const top = h.height - STRIP_H;
    const x0 = STRIP_PAD, w = (h.width - STRIP_PAD) - x0;
    const barsTop = top + 20, barsH = STRIP_H - 30;

    ctx.save();
    ctx.fillStyle = cssColor(PALETTE.graphite, 0.5);
    ctx.fillRect(0, top, h.width, STRIP_H);
    ctx.strokeStyle = cssColor(PALETTE.paper, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(h.width, top);
    ctx.stroke();

    const barW = Math.max(1, w / this._placed.length - 0.6);
    for (let k = 0; k < this._placed.length; k += 1) {
      const pm = this._placed[k];
      const bx = x0 + (w * k) / this._placed.length;
      /* sqrt — иначе 57-метровый Волгоград прижимает всё остальное к нулю. */
      const bh = Math.max(2, barsH * Math.sqrt((pm.hs + pm.hp) / this._maxTotal));
      ctx.fillStyle = pm.i === this._selected ? PALETTE.brass
        : cssColor(statusColor(pm.m.status), pm.estimated ? 0.35 : 0.75);
      ctx.fillRect(bx, barsTop + barsH - bh, barW, bh);
    }

    ctx.font = '400 11px "20 Kopeek", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let lastX = -Infinity;
    for (let k = 0; k < this._placed.length; k += 1) {
      const year = this._placed[k].year;
      if (!year) continue;
      const dec = Math.floor(year / 10) * 10;
      const prev = k > 0 && this._placed[k - 1].year
        ? Math.floor(this._placed[k - 1].year / 10) * 10 : -1;
      /* Метка на ПЕРВЫЙ памятник десятилетия, а не на памятник ровного года:
       * в 1940-е и 2000-е ни один не пришёлся на год, кратный десяти. */
      if (dec === prev) continue;
      const bx = x0 + (w * k) / this._placed.length;
      if (bx - lastX < 46) continue;
      lastX = bx;
      ctx.strokeStyle = cssColor(PALETTE.paper, 0.18);
      ctx.beginPath();
      ctx.moveTo(bx, barsTop);
      ctx.lineTo(bx, barsTop + barsH);
      ctx.stroke();
      ctx.fillStyle = cssColor(PALETTE.paper, 0.5);
      ctx.fillText(String(dec), bx, top + 4);
    }

    const winW = Math.max(10, w * Math.min(1, g.viewportW / g.contentW));
    const winX = x0 + (w - winW) * this._scrollFraction();
    ctx.fillStyle = cssColor(PALETTE.paper, 0.1);
    ctx.fillRect(winX, barsTop - 4, winW, barsH + 8);
    ctx.strokeStyle = PALETTE.brass;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(winX, barsTop - 4, winW, barsH + 8);
    ctx.restore();
  },
};
