/* Сцена «Институции · Таймлайн» — 56 музеев полосами 1923–2026 по регионам.
 * Перенос из mtk42-museums-timeline/ на контракт сцены.
 *
 * Полосы позиционируются в px внутри content-box, который начинается после
 * padding-left = --m42-label-col; ширину меряем по вычисленному padding
 * (переменная — clamp(), parseFloat по ней дал бы NaN). */
import { DATA, museumCardHtml, createOverlay, esc } from "./shared.js?v=35";

/* Без «all»: строку снятия («—») панель финдера подставляет сама. */
const STATUSES = ["active", "transformed", "private", "closed"];

/* Поля поиска. Ищем сами — ядро берёт отсюда только подписи. Описание музея в
 * поиск НЕ берём: длинный текст, и на полосе его не видно — попадание нечем
 * объяснить (расширение прецедента 39 «desc не в поиск»). */
const SEARCH_IN = [
  (it) => it.short,
  (it) => it.full_name,
  (it) => it.city,
  (it) => it.country,
];

function norm(s) {
  return String(s || "").toLowerCase().replace(/\u0451/g, "\u0435");
}

export const timelineScene = {
  id: "timeline",
  title: { ru: "Институции · Таймлайн", en: "Institutions · Timeline", zh: "机构 · 时间轴" },

  /* Финдер. Статус уехал со сцены в панель; регион и страна — новые фасеты,
   * чипами они не помещались. Сортировки объявлены, потому что ВИДИМО меняют
   * порядок строк: без сортировки полосы сгруппированы по регионам и внутри
   * идут по году открытия, с сортировкой группировка снимается и список
   * становится сплошным — это и есть видимый эффект. */
  finder: {
    search: {
      fields: [
        /* Два поля под одной подписью: full_name уточняет город в скобках. */
        { key: "short", label: { ru: "Название", en: "Name", zh: "名称" } },
        { key: "full_name", label: { ru: "Название", en: "Name", zh: "名称" } },
        { key: "city", label: { ru: "Город", en: "City", zh: "城市" } },
        { key: "country", label: { ru: "Страна", en: "Country", zh: "国家" } },
      ],
    },
    filters: [
      { key: "status", label: { ru: "Судьба", en: "Fate", zh: "命运" },
        options: (ctx) => STATUSES.map((v) => [v, ctx.app.t("status.one." + v)]) },
      { key: "region", label: { ru: "Регион", en: "Region", zh: "地区" },
        options: (ctx) => ((ctx.data.museums && ctx.data.museums.regions) || [])
          .slice().sort((a, b) => a.sort - b.sort)
          .map((r) => [r.id, ctx.app.t("region." + r.id)]) },
      { key: "country", label: { ru: "Страна", en: "Country", zh: "国家" },
        options: (ctx) => [...new Set(((ctx.data.museums && ctx.data.museums.items) || [])
          .map((i) => i.country))].sort((a, b) => String(a).localeCompare(String(b), "ru"))
          .map((c) => [c, c]) },
    ],
    sorts: [
      { key: "opened", label: { ru: "По году открытия", en: "By year opened", zh: "按开馆年份" } },
      { key: "closed", label: { ru: "По году закрытия", en: "By year closed", zh: "按闭馆年份" } },
      { key: "az", label: { ru: "По алфавиту", en: "A\u2192Z", zh: "\u6309\u5b57\u6bcd" } },
      { key: "life", label: { ru: "По длительности работы", en: "By lifespan", zh: "按存续时长" } },
    ],
  },

  /* Схема настроек v1.2. Вся типографика пяти блоков и высоты — из описи
   * SETTINGS-INVENTORY (в пилоте эти 17 позиций были потеряны в CSS). */
  settings: [
    { key: "regionSize", label: { ru: "Регионы: размер" }, type: "range",
      min: 14, max: 48, step: 1, unit: " px", default: 22 },
    { key: "regionOpacity", label: { ru: "Регионы: непрозрачность" }, type: "range",
      min: 30, max: 100, step: 5, unit: " %", default: 100 },
    { key: "regionBold", label: { ru: "Регионы: жирный" }, type: "toggle", default: false },

    { key: "museumSize", label: { ru: "Название музея: размер" }, type: "range",
      min: 10, max: 26, step: 1, unit: " px", default: 13 },
    { key: "museumOpacity", label: { ru: "Название музея: непрозрачность" }, type: "range",
      min: 40, max: 100, step: 5, unit: " %", default: 92 },
    { key: "museumBold", label: { ru: "Название музея: жирный" }, type: "toggle", default: false },

    { key: "citySize", label: { ru: "Город: размер" }, type: "range",
      min: 8, max: 20, step: 1, unit: " px", default: 12 },
    { key: "cityOpacity", label: { ru: "Город: непрозрачность" }, type: "range",
      min: 20, max: 100, step: 5, unit: " %", default: 50 },
    { key: "cityBold", label: { ru: "Город: жирный" }, type: "toggle", default: false },

    { key: "barLabelSize", label: { ru: "Год на бирке: размер" }, type: "range",
      min: 8, max: 20, step: 1, unit: " px", default: 12 },
    { key: "barLabelOpacity", label: { ru: "Год на бирке: непрозрачность" }, type: "range",
      min: 40, max: 100, step: 5, unit: " %", default: 90 },
    { key: "barLabelBold", label: { ru: "Год на бирке: жирный" }, type: "toggle", default: false },

    { key: "axisTickSize", label: { ru: "Годы на оси: размер" }, type: "range",
      min: 9, max: 24, step: 1, unit: " px", default: 12 },
    { key: "axisTickOpacity", label: { ru: "Годы на оси: непрозрачность" }, type: "range",
      min: 20, max: 100, step: 5, unit: " %", default: 55 },
    { key: "axisTickBold", label: { ru: "Годы на оси: жирный" }, type: "toggle", default: false },

    { key: "barHeight", label: { ru: "Высота полосы" }, type: "range",
      min: 8, max: 48, step: 1, unit: " px", default: 24 },
    { key: "rowHeight", label: { ru: "Высота строки" }, type: "range",
      min: 24, max: 96, step: 2, unit: " px", default: 44 },
  ],

  preload: { data: { museums: DATA.museums } },

  mount(el, ctx) {
    this._app = ctx.app;
    this._data = ctx.data.museums;
    this._yearMin = this._data.year_min || 1923;
    this._yearMax = this._data.year_max || 2026;
    this._find = this._find || { query: "", filters: {}, sort: null };

    const root = document.createElement("div");
    root.className = "m42-timeline";
    root.innerHTML =
      '<header class="m42-head">' +
      '<h1 class="m42-head__title"></h1>' +
      '<p class="m42-head__sub"></p>' +
      "</header>" +
      '<div class="m42-filters">' +
      '<div class="m42-filters__row" data-row="status"></div>' +
      '<div class="m42-timeline__counter"></div>' +
      "</div>" +
      '<div class="m42-timeline__axis"><div class="m42-timeline__ticks"></div></div>' +
      '<div class="m42-timeline__scroll kiosk-scroll"><div class="m42-timeline__inner"></div></div>';
    el.appendChild(root);

    this._root = root;
    this._counterEl = root.querySelector(".m42-timeline__counter");
    this._ticksEl = root.querySelector(".m42-timeline__ticks");
    this._scrollEl = root.querySelector(".m42-timeline__scroll");
    this._innerEl = root.querySelector(".m42-timeline__inner");
    this._overlay = createOverlay(el, this._app);

    this._onRow = (e) => {
      const hit = e.target.closest("[data-id]");
      if (!hit) return;
      const item = this._data.items.find((x) => x.id === hit.getAttribute("data-id"));
      if (item) this._overlay.open(museumCardHtml(this._app, item, this._data.regions));
    };
    this._innerEl.addEventListener("click", this._onRow);

    /* Полосы позиционируются по ширине контейнера — пересчёт на resize.
     * Показ слоя тоже дёргает RO (0 → полная ширина), поэтому сверяем
     * ширину: иначе каждое переключение сцены = полная переотрисовка. */
    this._lastW = 0;
    this._ro = new ResizeObserver(() => {
      const w = this._scrollEl ? this._scrollEl.clientWidth : 0;
      if (!w || Math.abs(w - this._lastW) < 2) return;
      this._lastW = w;
      this._renderRows();
    });
    this._ro.observe(this._scrollEl);

    this._cfg = this._cfg || this._defaults();
    this._renderAll();
    this.applySettings(this._cfg);
  },

  unmount() {
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._innerEl) this._innerEl.removeEventListener("click", this._onRow);
    if (this._overlay) this._overlay.destroy();
    if (this._root) this._root.remove();
    this._root = this._counterEl = null;
    this._ticksEl = this._scrollEl = this._innerEl = this._overlay = this._app = null;
    this._data = null;
  },

  /* Схема v1.2: типографика и высоты — через CSS-переменные сцены. Кегли
   * прототипа заданы для 1920 px, на 4K удваиваем тем же множителем, что
   * и остальная вёрстка; a11y домножает сверху своим --a11y-scale. */
  applySettings(values) {
    this._cfg = Object.assign(this._defaults(), values || {});
    if (!this._root) return;
    const c = this._cfg, st = this._root.style;
    const px = (v) => (v * this._scale()).toFixed(1) + "px";
    st.setProperty("--tl-region-size", px(c.regionSize));
    st.setProperty("--tl-region-opacity", (c.regionOpacity / 100).toFixed(2));
    st.setProperty("--tl-region-weight", c.regionBold ? "700" : "400");
    st.setProperty("--tl-museum-size", px(c.museumSize));
    st.setProperty("--tl-museum-opacity", (c.museumOpacity / 100).toFixed(2));
    st.setProperty("--tl-museum-weight", c.museumBold ? "700" : "400");
    st.setProperty("--tl-city-size", px(c.citySize));
    st.setProperty("--tl-city-opacity", (c.cityOpacity / 100).toFixed(2));
    st.setProperty("--tl-city-weight", c.cityBold ? "700" : "400");
    st.setProperty("--tl-barlabel-size", px(c.barLabelSize));
    st.setProperty("--tl-barlabel-opacity", (c.barLabelOpacity / 100).toFixed(2));
    st.setProperty("--tl-barlabel-weight", c.barLabelBold ? "700" : "400");
    st.setProperty("--tl-axis-size", px(c.axisTickSize));
    st.setProperty("--tl-axis-opacity", (c.axisTickOpacity / 100).toFixed(2));
    st.setProperty("--tl-axis-weight", c.axisTickBold ? "700" : "400");
    st.setProperty("--tl-bar-height", px(c.barHeight));
    st.setProperty("--tl-row-height", px(c.rowHeight));
    this._renderRows();
  },

  _defaults() {
    const d = {};
    for (const row of this.settings) d[row.key] = row.default;
    return d;
  },

  _scale() { return Math.min(2, Math.max(1, window.innerWidth / 1920)); },

  /* Отбор целиком, при любом изменении. Порядок канона: отбор → поиск →
   * сортировка. {shown,total} — по фактически показанному. */
  applyFinder({ query, filters, sort }) {
    this._find = { query: query || "", filters: filters || {}, sort: sort || null };
    this._renderAll();
    return { shown: this._visible().length, total: this._data.items.length };
  },

  /* Отбор → поиск → сортировка. Музеи без года закрытия («работает») при
   * сортировке по закрытию уходят в КОНЕЦ: выбравший «по году закрытия» ищет
   * годы, а не пустоты — прецедент 39 с year_named. */
  _visible() {
    if (!this._data) return [];
    const f = (this._find && this._find.filters) || {};
    let list = this._data.items.filter((it) =>
      (!f.status || it.status === f.status) &&
      (!f.region || it.region === f.region) &&
      (!f.country || it.country === f.country));

    const q = norm(this._find && this._find.query);
    if (q) list = list.filter((it) => SEARCH_IN.some((get) => norm(get(it)).includes(q)));

    const sort = this._find && this._find.sort;
    const конец = Number.POSITIVE_INFINITY;
    if (sort === "opened") list = list.slice().sort((a, b) => a.opened - b.opened);
    else if (sort === "closed") {
      list = list.slice().sort((a, b) =>
        (a.closed == null ? конец : a.closed) - (b.closed == null ? конец : b.closed));
    } else if (sort === "az") {
      list = list.slice().sort((a, b) => a.short.localeCompare(b.short, "ru"));
    } else if (sort === "life") {
      const срок = (it) => (it.closed == null ? this._yearMax : it.closed) - it.opened;
      list = list.slice().sort((a, b) => срок(b) - срок(a));
    }
    return list;
  },

  /* Полосы позиционируются по измеренной ширине: если контейнер оказался
   * нулевым, данные есть, а на экране пусто. */
  healthcheck() {
    if (!this._innerEl) return { ok: false, detail: "сцена не смонтирована" };
    const bars = this._innerEl.querySelectorAll(".m42-timeline__bar").length;
    const want = this._visible().length;
    /* Пустой отбор ЛЕГАЛЕН: сочетаний судьба×регион×страна много, и пустых
     * среди них хватает (перебор состояний нашёл 22). Признак здоровья в этом
     * случае — заглушка: голый экран без объяснения и есть дефект, а не ноль
     * сам по себе. Та же логика, что в картотеке. */
    if (want === 0) {
      const stub = !!this._innerEl.querySelector(".m42-timeline__empty");
      return stub
        ? { ok: true, detail: "отбор пуст легально, показана заглушка" }
        : { ok: false, detail: "отбор пуст, но заглушки нет" };
    }
    return bars === want
      ? { ok: true, detail: "полос отрисовано " + bars }
      : { ok: false, detail: "полос отрисовано " + bars + " из " + want };
  },

  pause() {},   // статичный DOM — ни rAF, ни таймеров
  resume() {},

  /* Отбор финдера гасит ядро, и до этого вызова — здесь только свой кеш. */
  reset() {
    this._find = { query: "", filters: {}, sort: null };
    if (this._overlay) this._overlay.close();
    if (this._scrollEl) this._scrollEl.scrollTop = 0;
    this._renderAll();
  },

  setLang() { this._renderAll(); },

  /* A11y: реже подписи лет на оси (каждые 20 лет вместо 10) и выше строки. */
  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
    this._renderAll();
  },

  _renderAll() {
    if (!this._root) return;
    const t = (k, v) => this._app.t(k, v);
    this._root.querySelector(".m42-head__title").textContent = t("museums.title");
    this._root.querySelector(".m42-head__sub").textContent = t("museums.timeline.subtitle");
    if (this._overlay) this._overlay.close();
    this._renderRows();
  },


  _barWidth() {
    const pad = parseFloat(getComputedStyle(this._innerEl).paddingLeft) || 240;
    return Math.max(120, this._innerEl.clientWidth - pad - 4);
  },

  _x(year, barW) {
    return ((year - this._yearMin) / (this._yearMax - this._yearMin)) * barW;
  },

  _renderRows() {
    if (!this._innerEl) return;
    const t = (k, v) => this._app.t(k, v);
    const barW = this._barWidth();
    const step = this._app.a11y ? 20 : 10;

    this._ticksEl.innerHTML = "";
    for (let y = this._yearMin; y <= this._yearMax; y += step) {
      const tick = document.createElement("div");
      tick.className = "m42-timeline__tick";
      tick.textContent = String(y);
      tick.style.left = this._x(y, barW) + "px";
      this._ticksEl.appendChild(tick);
    }

    const items = this._visible();
    const regions = this._data.regions.slice().sort((a, b) => a.sort - b.sort);
    /* С выбранной сортировкой группировка по регионам снимается: иначе порядок
     * менялся бы только внутри групп, и «по алфавиту» на экране читалось бы как
     * «ничего не произошло». Сплошной список — и есть видимый эффект. */
    const flat = !!(this._find && this._find.sort);

    let html =
      '<div class="m42-timeline__collapse" style="left:' + this._x(1991, barW) +
      "px;width:" + (this._x(1993, barW) - this._x(1991, barW)) + 'px"></div>';

    const группы = flat
      ? [{ title: null, arr: items }]
      : regions.map((region) => ({
          title: t("region." + region.id),
          arr: items.filter((it) => it.region === region.id)
            .sort((a, b) => a.opened - b.opened),
        }));

    for (const группа of группы) {
      const arr = группа.arr;
      if (!arr.length) continue;
      if (группа.title) html += '<h2 class="m42-timeline__region">' + esc(группа.title) + "</h2>";
      for (const it of arr) {
        const from = Math.max(this._yearMin, it.opened);
        const to = it.closed == null ? this._yearMax : Math.min(this._yearMax, it.closed);
        const left = this._x(from, barW);
        const width = Math.max(6, this._x(to, barW) - left);
        html +=
          '<div class="m42-timeline__row" data-id="' + esc(it.id) + '">' +
          '<div class="m42-timeline__label">' +
          '<span class="m42-timeline__name">' + esc(it.short) + "</span>" +
          '<span class="m42-timeline__city">' + esc(it.city) + "</span>" +
          "</div>" +
          '<button type="button" class="m42-timeline__bar is-' + it.status +
          (it.notable ? " is-notable" : "") + '" data-id="' + esc(it.id) +
          '" style="left:' + left + "px;width:" + width + 'px" aria-label="' +
          esc(it.short + ", " + it.opened + "—" + (it.closed || t("museums.today"))) + '">' +
          (width > 90 ? '<span class="m42-timeline__year">' + it.opened + "</span>" : "") +
          "</button></div>";
      }
    }
    /* Ничего не нашлось — говорим об этом словами. Без заглушки посетитель
       видит пустую сетку лет и не понимает, он сломал или так и надо. */
    this._innerEl.innerHTML = items.length ? html
      : '<p class="m42-timeline__empty">' + esc(t("museums.empty")) + "</p>";
    this._counterEl.textContent = t("museums.counter", {
      shown: items.length, total: this._data.items.length,
    });
  },
};
