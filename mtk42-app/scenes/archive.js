/* Сцена «Картотека» — сетка карточек персон с фильтрами по эпохе и категории.
 * Перенос логики из mtk42-archive/, приведённый к контракту сцены.
 *
 * DOM-сцена без анимации: pause()/resume() пусты честно — останавливать
 * нечего, rAF и таймеров здесь нет вовсе. */
import {
  DATA, buildPeople, portraitList, personCardHtml, createOverlay, esc,
} from "./shared.js?v=16";

const EPOCH_FILTERS = ["all", "1920s", "soviet", "back-to-lenin", "delen", "renais", "now"];
const CAT_FILTERS = ["all", "leaders", "politician", "researcher", "writers"];

export const archiveScene = {
  id: "archive",
  title: { ru: "Картотека", en: "Card index", zh: "卡片目录" },

  /* Схема настроек v1.2. «Дизайн карточки героя» возвращён из прототипа
   * (опись SETTINGS-INVENTORY, класс А). Фильтры «Эпоха»/«Категория» —
   * класс Б, живут на сцене и сбрасываются по idle. */
  settings: [
    { key: "cardDesign", label: { ru: "Дизайн карточки героя" }, type: "select",
      default: "classic",
      options: [{ value: "classic", label: { ru: "Классика" } },
                { value: "air", label: { ru: "Больше воздуха" } }] },
    { key: "gapX", label: { ru: "Расстояние по ширине" }, type: "range",
      min: 8, max: 96, step: 4, unit: " px", default: 20 },
    { key: "gapY", label: { ru: "Расстояние по высоте" }, type: "range",
      min: 8, max: 96, step: 4, unit: " px", default: 20 },
  ],

  preload: {
    data: { people: DATA.people, portraits: DATA.portraits },
    /* Портреты греем в кеш браузера на сплэше: в рантайме сеть не трогаем. */
    custom(ctx) {
      const urls = portraitList(ctx.data.portraits || {});
      return Promise.all(urls.map((u) => new Promise((res) => {
        const img = new Image();
        img.onload = img.onerror = () => res();
        img.src = u;
      })));
    },
  },

  mount(el, ctx) {
    this._app = ctx.app;
    this._items = buildPeople(ctx.data.people, ctx.data.portraits || {});
    this._epoch = "all";
    this._cat = "all";

    const root = document.createElement("div");
    root.className = "m42-archive";
    root.innerHTML =
      '<header class="m42-head">' +
      '<h1 class="m42-head__title"></h1>' +
      '<p class="m42-head__sub"></p>' +
      "</header>" +
      '<div class="m42-filters">' +
      '<div class="m42-filters__row" data-row="epoch"></div>' +
      '<div class="m42-filters__row" data-row="cat"></div>' +
      "</div>" +
      '<div class="m42-archive__grid kiosk-scroll"></div>' +
      '<div class="m42-archive__counter"></div>';
    el.appendChild(root);

    this._root = root;
    this._gridEl = root.querySelector(".m42-archive__grid");
    this._counterEl = root.querySelector(".m42-archive__counter");
    this._epochRow = root.querySelector('[data-row="epoch"]');
    this._catRow = root.querySelector('[data-row="cat"]');
    this._overlay = createOverlay(el, this._app);

    this._onFilter = (e) => {
      const btn = e.target.closest("[data-value]");
      if (!btn) return;
      const row = btn.closest("[data-row]").getAttribute("data-row");
      if (row === "epoch") this._epoch = btn.getAttribute("data-value");
      else this._cat = btn.getAttribute("data-value");
      this._renderFilters();
      this._renderGrid();
    };
    this._epochRow.addEventListener("click", this._onFilter);
    this._catRow.addEventListener("click", this._onFilter);

    this._onCard = (e) => {
      const card = e.target.closest("[data-id]");
      if (!card) return;
      const it = this._items.find((x) => x.id === card.getAttribute("data-id"));
      if (it) this._overlay.open(personCardHtml(this._app, it));
    };
    this._gridEl.addEventListener("click", this._onCard);

    this._cfg = this._cfg || this._defaults();
    this._renderAll();
    this.applySettings(this._cfg);
  },

  unmount() {
    if (this._epochRow) this._epochRow.removeEventListener("click", this._onFilter);
    if (this._catRow) this._catRow.removeEventListener("click", this._onFilter);
    if (this._gridEl) this._gridEl.removeEventListener("click", this._onCard);
    if (this._overlay) this._overlay.destroy();
    if (this._root) this._root.remove();
    this._root = this._gridEl = this._counterEl = null;
    this._epochRow = this._catRow = this._overlay = this._app = null;
    this._items = null;
  },

  /* Схема v1.2: значения приходят готовыми. Расстояния — CSS-переменные,
   * чтобы не пересобирать сетку из 140 плиток на каждый чих ползунка. */
  applySettings(values) {
    this._cfg = Object.assign(this._defaults(), values || {});
    if (!this._root) return;
    this._root.style.setProperty("--m42-grid-gap-x", this._cfg.gapX + "px");
    this._root.style.setProperty("--m42-grid-gap-y", this._cfg.gapY + "px");
    this._root.setAttribute("data-card", this._cfg.cardDesign);
  },

  _defaults() {
    const d = {};
    for (const row of this.settings) d[row.key] = row.default;
    return d;
  },

  /* Пустая сетка при непустом отборе — авария. А вот пустой отбор бывает
   * ЛЕГАЛЬНО: в данных шесть комбинаций эпоха×категория без единой записи
   * (напр. «Назад к Ленину» × «Вожди»). Фильтры класса Б живут до idle-reset,
   * так что оператор может запустить стенд ровно в это окно — и получить
   * красный на здоровом киоске. Признак здоровья в таком случае — заглушка. */
  healthcheck() {
    if (!this._gridEl) return { ok: false, detail: "сцена не смонтирована" };
    const tiles = this._gridEl.querySelectorAll(".m42-tile").length;
    const want = this._items.filter((it) =>
      (this._epoch === "all" || it.epoch === this._epoch) &&
      (this._cat === "all" || it.category === this._cat)).length;
    if (want === 0) {
      const stub = !!this._gridEl.querySelector(".m42-archive__empty");
      return stub
        ? { ok: true, detail: "отбор пуст легально, показана заглушка" }
        : { ok: false, detail: "отбор пуст, но заглушки нет" };
    }
    return tiles === want
      ? { ok: true, detail: "карточек отрисовано " + tiles }
      : { ok: false, detail: "карточек отрисовано " + tiles + " из " + want };
  },

  pause() {},   // нет rAF и таймеров — останавливать нечего
  resume() {},

  reset() {
    this._epoch = "all";
    this._cat = "all";
    if (this._overlay) this._overlay.close();
    if (this._gridEl) this._gridEl.scrollTop = 0;
    this._renderAll();
  },

  setLang() { this._renderAll(); },

  /* В режиме слабовидящих карточки крупнее и без «мелочи»: тон-шкала и
   * ключевая работа в плитке прячутся, остаётся портрет + имя. */
  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
    this._renderGrid();
  },

  _renderAll() {
    if (!this._root) return;
    const t = (k, v) => this._app.t(k, v);
    this._root.querySelector(".m42-head__title").textContent = t("archive.title");
    this._root.querySelector(".m42-head__sub").textContent = t("archive.subtitle");
    if (this._overlay) this._overlay.close();
    this._renderFilters();
    this._renderGrid();
  },

  _renderFilters() {
    const t = (k) => this._app.t(k);
    const row = (list, cur, prefix) => list.map((v) =>
      '<button type="button" class="m42-filter kiosk-target' +
      (v === cur ? " is-active" : "") + '" data-value="' + v + '">' +
      esc(t(prefix + v)) + "</button>").join("");
    this._epochRow.innerHTML = row(EPOCH_FILTERS, this._epoch, "epoch.");
    this._catRow.innerHTML = row(CAT_FILTERS, this._cat, "cat.");
  },

  _renderGrid() {
    if (!this._gridEl) return;
    const t = (k, v) => this._app.t(k, v);
    const list = this._items.filter((it) =>
      (this._epoch === "all" || it.epoch === this._epoch) &&
      (this._cat === "all" || it.category === this._cat));

    this._gridEl.innerHTML = list.length
      ? list.map((it) => this._cardHtml(it, t)).join("")
      : '<p class="m42-archive__empty">' + esc(t("archive.empty")) + "</p>";

    this._counterEl.textContent = t("archive.counter", {
      shown: list.length, total: this._items.length,
    });
  },

  _cardHtml(it, t) {
    const a11y = this._app.a11y;
    const portrait = it.portrait
      ? '<img src="' + esc(it.portrait) + '" alt="" />'
      : '<span class="m42-tile__initials">' + esc(it.initials) + "</span>";
    const tone = a11y ? "" :
      '<div class="m42-tile__tone"><span class="m42-tile__tone-track">' +
      '<span class="m42-tile__tone-marker" style="left:' +
      (((it.tone + 1) / 2) * 100).toFixed(1) + '%"></span></span></div>';
    const meta = a11y ? "" :
      '<p class="m42-tile__meta">' + esc(it.keyWork || it.role) + "</p>";
    return (
      '<button type="button" class="m42-tile is-' + it.category + '" data-id="' +
      esc(it.id) + '" aria-label="' + esc(it.name + ", " + it.year) + '">' +
      '<span class="m42-tile__tag">' + esc(t(it.tagKey)) + " · " + it.year + "</span>" +
      '<span class="m42-tile__portrait">' + portrait + "</span>" +
      '<span class="m42-tile__body"><h3 class="m42-tile__name">' +
      esc(it.name) + "</h3>" + meta + "</span>" + tone +
      "</button>"
    );
  },
};
