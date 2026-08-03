/* Сцена «Иконостас» — плиточная композиция из всех 283 памятников.
 * Перенос из mtk41-canon/ на контракт сцены.
 *
 * Анимации нет: DOM-сетка строится один раз. Поэтому rAF-петли не существует
 * вовсе — на паузе сцена гарантированно ничего не потребляет.
 *
 * Плитки берут МИНИАТЮРЫ, а не оригиналы: 282 первых фото это 2097 Мп, то
 * есть ~7.8 ГБ декодированными, и преролл ядра держал бы их живыми. Оригиналы
 * в приложении не показываются нигде — см. preloadThumbs() в shared.js. */
import {
  DATA, byYear, createCard, esc, plural, thumbUrl, preloadThumbs,
} from "./shared.js?v=3";

/* Иконичные памятники крупнее — композиция, а не равномерная сетка. */
const WEIGHTS = {
  "ulan-ude-1970-zilberman": 3,
  "volgograd-krasnoarmeiskii-1973": 3,
  "chelyabinsk-aloe-pole-1925": 2,
  "ostashkov-1919": 2,
  "vin-2024": 2,
  "ukhta-vetlosyan-1970": 2,
  "blagoveshchensk-rb-geoglif-1970": 2,
};
const SPAN = { 1: { col: 1, row: 1 }, 2: { col: 2, row: 1 }, 3: { col: 2, row: 2 } };

export const canonScene = {
  id: "canon",
  title: { ru: "Иконостас", en: "Iconostasis", zh: "图像集" },

  preload: {
    data: {
      monuments: DATA.monuments,
      photos: DATA.photos,
      thumbs: DATA.thumbs,
      heights: DATA.heights,
    },
    /* Миниатюры всех 289 памятников — на сплэше. Список известен только из
     * thumbs.json, поэтому не через preload.images, а своим custom(). */
    custom: preloadThumbs,
  },

  settings: [
    { key: "tileMin", label: { ru: "Минимальная плитка", en: "Min tile" },
      type: "range", min: 90, max: 320, step: 10, unit: " px", default: 160 },
    { key: "showYear", label: { ru: "Годы на плитках", en: "Years on tiles" },
      type: "toggle", default: true },
    { key: "showStatus", label: { ru: "Метка статуса", en: "Status pip" },
      type: "toggle", default: true },
  ],

  mount(el, ctx) {
    this._ctx = ctx;
    this._app = ctx.app;

    const root = document.createElement("div");
    root.className = "m41-scene m41-canon";
    root.innerHTML =
      '<header class="m41-head">' +
      '<h1 class="m41-head__title"></h1>' +
      '<p class="m41-head__sub"></p></header>' +
      '<div class="m41-canon__grid kiosk-scroll"></div>';
    el.appendChild(root);

    this._root = root;
    this._grid = root.querySelector(".m41-canon__grid");
    this._titleEl = root.querySelector(".m41-head__title");
    this._subEl = root.querySelector(".m41-head__sub");

    this._card = createCard(el, ctx.app, ctx);

    /* Делегирование вместо слушателя на каждой из 283 плиток: меньше DOM-работы
     * при монтировании и нечего снимать в unmount(). */
    this._onTap = (e) => {
      const tile = e.target.closest("[data-idx]");
      if (!tile) return;
      const m = this._items[Number(tile.getAttribute("data-idx"))];
      if (m) this._card.open(m);
    };
    this._grid.addEventListener("click", this._onTap);

    this._items = ctx.data.monuments.items || [];
    this._order = byYear(this._items);
    this._render();
    this.applySettings(this._cfg || {});
  },

  unmount() {
    if (this._grid) this._grid.removeEventListener("click", this._onTap);
    if (this._card) this._card.destroy();
    if (this._root) this._root.remove();
    this._root = this._grid = this._card = null;
  },

  /* Петли нет — останавливать нечего, но метод обязан существовать. */
  pause() {},
  resume() {},

  reset() {
    if (this._card) this._card.close();
    if (this._grid) this._grid.scrollTop = 0;
  },

  setLang() { this._renderHead(); },

  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
  },

  applySettings(values) {
    this._cfg = values || {};
    if (!this._root) return;
    const min = this._cfg.tileMin || 160;
    this._root.style.setProperty("--m41-tile-min", min + "px");
    this._root.classList.toggle("no-year", this._cfg.showYear === false);
    this._root.classList.toggle("no-status", this._cfg.showStatus === false);
  },

  _renderHead() {
    const app = this._app;
    const years = this._order.length
      ? this._order[0].year + "–" + this._order[this._order.length - 1].year : "";
    const n = this._items.length;
    this._titleEl.textContent = app.t("canon.title");
    this._subEl.textContent = app.t("canon.subtitle", {
      n: n + " " + plural(n, ["изображение", "изображения", "изображений"]),
      years,
    });
  },

  _render() {
    const ctx = this._ctx;
    const parts = [];
    for (const it of this._order) {
      const m = it.m;
      const span = SPAN[WEIGHTS[m.id] || 1];
      const thumb = thumbUrl(ctx.data.thumbs, m.id);
      /* Кавычки внутри url() — только одинарные: двойные закрыли бы сам
       * атрибут style="…", и фон молча приходил пустым (url("")). */
      const style = "grid-column:span " + span.col + ";grid-row:span " + span.row +
        (thumb ? ";background-image:url('" + encodeURI(thumb) + "')" : "");
      const year = m.year ? String(m.year) : "—";
      parts.push(
        '<button type="button" class="m41-tile' + (thumb ? "" : " is-empty") +
        '" data-idx="' + it.i + '" style="' + style + '" aria-label="' +
        esc((m.title || "") + " " + year) + '">' +
        (thumb ? "" : '<span class="m41-tile__mono">Л</span>') +
        '<span class="m41-tile__pip" data-status="' + esc(m.status || "unknown") + '"></span>' +
        '<span class="m41-tile__cap"><span class="m41-tile__city">' +
        esc(m.city || m.country || "—") + '</span><span class="m41-tile__year">' +
        esc(year) + "</span></span></button>"
      );
    }
    this._grid.innerHTML = parts.join("");
    this._renderHead();
  },
};
