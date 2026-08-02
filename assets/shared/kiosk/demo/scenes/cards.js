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

  mount(el, ctx) {
    this._items = (ctx.data.demo && ctx.data.demo.cards) || [];
    this._app = ctx.app;
    this._filter = "all";

    const root = document.createElement("div");
    root.className = "demo-cards";
    root.innerHTML =
      '<div class="demo-cards__filters"></div>' +
      '<div class="demo-cards__state"></div>' +
      '<div class="demo-cards__grid kiosk-scroll"></div>';
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

    this._stateEl.textContent = t("cards.state", {
      filter: t("cards.filter." + this._filter),
      shown: list.length,
      total: this._items.length,
    });
    this._gridEl.innerHTML = list.map((it) =>
      '<article class="demo-card">' +
      `<div class="demo-card__kind">${it.kind}</div>` +
      `<h3 class="demo-card__title">${it.title}</h3>` +
      `<div class="demo-card__year">${it.year}</div>` +
      "</article>"
    ).join("");
  },
};
