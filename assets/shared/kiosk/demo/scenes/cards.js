/* Демо-сцена 3 «Картотека» — DOM, без rAF. Показывает:
 *  - преролл данных (ядро кладёт JSON в ctx.data.demo),
 *  - состояние сцены (активный фильтр) и его сброс в reset(),
 *  - что сцена без анимации ничего не делает на паузе сама собой.
 */

/* Подписи фильтров НЕ хардкодятся — идут через словари приложения
 * (i18n/*.json), как требует Киоск-стандарт v2, п. 11. */
const KINDS = ["all", "документ", "фотография", "плакат"];

export const cardsScene = {
  id: "cards",
  title: { ru: "Картотека", en: "Card index", zh: "卡片目录" },

  preload: { data: { demo: "./demo.json" } },

  settings: [
    { key: "minCard", label: { ru: "Ширина карточки", en: "Card width", zh: "卡片宽度" },
      type: "range", min: 240, max: 640, step: 20, unit: " px", default: 420 },
    { key: "showYear", label: { ru: "Показывать год", en: "Show year", zh: "显示年份" },
      type: "toggle", default: true },
  ],

  applySettings(v) {
    this._opts = v;
    if (this._gridEl) {
      this._gridEl.style.gridTemplateColumns =
        "repeat(auto-fill, minmax(" + (v.minCard || 420) + "px, 1fr))";
      this._render();
    }
  },

  mount(el, ctx) {
    this._items = (ctx.data.demo && ctx.data.demo.cards) || [];
    this._app = ctx.app;
    this._filter = "all";

    const root = document.createElement("div");
    root.className = "demo-cards";
    /* .kiosk-content — поле контента из настроек киоска (ширина/высота
     * в % и центрирование). Хром сцены при этом остаётся во всю
     * рабочую область. */
    root.innerHTML =
      '<div class="demo-cards__filters"></div>' +
      '<div class="demo-cards__state"></div>' +
      '<div class="demo-cards__body kiosk-content">' +
      '<div class="demo-cards__grid kiosk-scroll"></div>' +
      "</div>";
    el.appendChild(root);

    this._root = root;
    this._filtersEl = root.querySelector(".demo-cards__filters");
    this._gridEl = root.querySelector(".demo-cards__grid");
    this._stateEl = root.querySelector(".demo-cards__state");

    this._onFilter = (e) => {
      const btn = e.target.closest("[data-kind]");
      if (!btn) return;
      this._filter = btn.getAttribute("data-kind");
      this._render();
    };
    this._filtersEl.addEventListener("click", this._onFilter);

    this._render();
  },

  unmount() {
    if (this._filtersEl) this._filtersEl.removeEventListener("click", this._onFilter);
    if (this._root) this._root.remove();
    this._root = this._filtersEl = this._gridEl = this._stateEl = this._app = null;
  },

  pause() {},   // нечему останавливаться — сцена статична
  resume() {},

  /* Посетительские состояния для перебора (tools/sweep.js). В схему
   * настроек оператора фильтры не входят — их сцена объявляет сама.
   * ПЕРВОЕ считается дефолтным: перебор вернёт его в конце. */
  states() {
    const self = this;
    return KINDS.map((k) => ({
      name: k,
      apply() { self._filter = k; self._render(); },
    }));
  },

  /* Явный возврат — надёжнее договорённости «первое = дефолт», и
   * побеждает её, если объявлен. */
  restoreState() {
    this._filter = "all";
    if (this._gridEl) { this._gridEl.scrollTop = 0; this._render(); }
  },

  /* «Загружено, но пусто» — самый незаметный отказ: DOM на месте, сеть
   * чиста, а карточек нет (данные не доехали, фильтр всё срезал). */
  healthcheck() {
    if (!this._gridEl) return { ok: false, detail: "сцена не смонтирована" };
    var n = this._gridEl.children.length;
    if (!this._items.length) return { ok: false, detail: "данные не загружены" };
    if (!n) return { ok: false, detail: "ни одной карточки на экране" };
    return { ok: true, detail: "карточек " + n + " из " + this._items.length };
  },

  reset() {
    this._filter = "all";
    if (this._gridEl) {
      this._gridEl.scrollTop = 0;
      this._render();
    }
  },

  setLang() {
    if (this._root) this._render();
  },

  setA11y() {},

  _render() {
    const t = (k, v) => this._app.t(k, v);
    this._filtersEl.innerHTML = KINDS.map((k) =>
      `<button type="button" class="demo-cards__filter${k === this._filter ? " is-active" : ""}" ` +
      `data-kind="${k}">${t("cards.filter." + k)}</button>`
    ).join("");

    const list = this._filter === "all"
      ? this._items
      : this._items.filter((it) => it.kind === this._filter);

    this._shown = list.length;   /* сцена сама сообщает, сколько осталось */

    this._stateEl.textContent = t("cards.state", {
      filter: t("cards.filter." + this._filter),
      shown: list.length,
      total: this._items.length,
    });
    this._gridEl.innerHTML = list.map((it) =>
      '<article class="demo-card">' +
      `<div class="demo-card__kind">${it.kind}</div>` +
      `<h3 class="demo-card__title">${it.title}</h3>` +
      ((this._opts || {}).showYear === false ? "" : `<div class="demo-card__year">${it.year}</div>`) +
      "</article>"
    ).join("");
  },
};

/* Финдер: сцена ОБЪЯВЛЯЕТ, чем можно искать, и применяет ОДНИМ методом.
 * options функцией — фасеты выводятся из загруженных данных, а декларация
 * статична в объекте сцены. */
/* ФИНДЕР. Сцена ОБЪЯВЛЯЕТ, чем можно искать, а применяет ОДНИМ методом:
 * состояние держит ядро, сцена только пересчитывает выборку. options
 * функцией — виды берутся из ЗАГРУЖЕННЫХ данных, а декларация статична
 * в объекте сцены и на момент её чтения данных ещё нет. */
cardsScene.finder = {
  search: { fields: [{ key: "title", label: { ru: "Название", en: "Title" } }] },
  filters: [
    {
      key: "kind",
      label: { ru: "Вид", en: "Kind" },
      options() {
        return KINDS.filter((k) => k !== "all").map((k) => [k, k]);
      },
    },
  ],
  sorts: [
    { key: "az", label: { ru: "По алфавиту", en: "A→Z" } },
    { key: "rev", label: { ru: "В обратном порядке", en: "Reversed" } },
  ],
};

cardsScene.applyFinder = function (state) {
  this._find = state;
  this._filter = state.filters.kind || "all";
  if (this._gridEl) this._render();
  const total = (this._items || []).length;
  return { shown: this._shown == null ? total : this._shown, total };
};
