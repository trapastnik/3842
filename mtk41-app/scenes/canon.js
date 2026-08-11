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
  DATA,
  byYear,
  cardUrl,
  createCard,
  esc,
  plural,
  thumbUrl,
  preloadThumbs,
  createHint,
  FINDER_FIELDS,
  countryOptions,
  decadeOptions,
  finderApply,
  APP,
  drawEmptyState,
  emptyVerdict,
  finderSort,
  setCorpus,
  statusOptions,
} from "./shared.js?v=66";

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
      cards: DATA.cards,
      heights: DATA.heights,
    },
    /* Миниатюры всех 289 памятников — на сплэше. Список известен только из
     * thumbs.json, поэтому не через preload.images, а своим custom(). */
    custom: preloadThumbs,
  },

  /* Финдер. 283 плитки — найти свой город глазами трудно, поиском легко.
   * Сортировка объявлена, потому что у порядка здесь ВИДИМЫЙ эффект: сетка
   * читается слева направо, и «по городу» перестраивает её целиком. */
  finder: {
    search: { fields: FINDER_FIELDS },
    filters: [
      { key: "status", label: { ru: "Судьба", en: "Fate" },
        options: function () { return statusOptions(APP()); } },
      { key: "country", label: { ru: "Страна", en: "Country" },
        options: function () { return countryOptions(); } },
    ],
    sorts: [
      { key: "year", label: { ru: "По годам", en: "By year" } },
      { key: "az", label: { ru: "По городам А→Я", en: "By city A→Z" } },
    ],
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

    /* На корень сцены, а не на .kiosk-scroll-грид: в прокручиваемом
     * контейнере absolute считается от высоты содержимого, и подсказка
     * уехала бы далеко вниз за пределы экрана. */
    this._hint = createHint(this._root, "tap", "hint." + this.id, ctx.app);

    /* Делегирование вместо слушателя на каждой из 283 плиток: меньше DOM-работы
     * при монтировании и нечего снимать в unmount(). */
    this._onTap = (e) => {
      const tile = e.target.closest("[data-idx]");
      if (!tile) return;
      /* data-idx — индекс в ПОЛНОМ списке, а не в отфильтрованном: при
       * отборе позиции в выборке съезжают, и плитка открыла бы чужую
       * карточку. Полный список неподвижен. */
      const m = this._all[Number(tile.getAttribute("data-idx"))];
      if (m) this._card.open(m);
    };
    this._grid.addEventListener("click", this._onTap);

    this._all = ctx.data.monuments.items || [];
    setCorpus(ctx.data.monuments.items || [], ctx.app);
    this._applyFind();
    this._render();
    this.applySettings(this._cfg || {});
  },

  unmount() {
    if (this._hint) { this._hint.destroy(); this._hint = null; }
    if (this._grid) this._grid.removeEventListener("click", this._onTap);
    if (this._card) this._card.destroy();
    if (this._root) this._root.remove();
    this._root = this._grid = this._card = null;
  },

  /* Петли нет — останавливать нечего, но метод обязан существовать. */
  pause() {},
  resume() {},

  /* Сброс обязан чистить ДАННЫЕ, а не только индикатор: ядро гасит точку на
   * лупе само, но выборку считает сцена, и посетитель №2 иначе увидел бы
   * «5 из 283» при погашенной точке (грабля idle-сброса финдера). */
  reset() {
    if (this._card) this._card.close();
    if (this._grid) this._grid.scrollTop = 0;
    this._find = null;
    this._applyFind();
    if (this._grid) this._render();
  },

  setLang() { this._renderHead(); if (this._hint) this._hint.relabel(); },

  /* Отбор целиком, при любом изменении. Порядок канона: отбор → поиск →
   * сортировка. Возврат {shown,total} делаем: без него панель не покажет
   * «N из 283», и посетитель не поймёт, почему иконостас поредел. */
  applyFinder(find) {
    this._find = find;
    this._applyFind();
    if (this._grid) this._render();
    return { shown: this._items.length, total: (this._all || []).length };
  },

  _applyFind() {
    const all = this._all || [];
    this._items = finderApply(all, this._find);
    const sorted = finderSort(this._items, (this._find || {}).sort);
    this._order = (this._find || {}).sort === "az"
      ? sorted.map((m, i) => ({ m, i: all.indexOf(m), year: m.year || 0 }))
      : byYear(this._items).map((it) => ({ ...it, i: all.indexOf(it.m) }));
  },

  /* Ловит «загружено, но пусто»: корпус приехал, DOM построен, а плиток нет
   * (например, разъехались id между mtk41.json и thumbs.json). */
  healthcheck() {
    /* Стенд зовёт healthcheck у всех включённых сцен, в том числе ещё не
     * смонтированных (ядро монтирует сцену при первом показе). «Пусто, потому
     * что не смонтирована» — не поломка, и путать эти два случая нельзя. */
    if (!this._grid) return { ok: true, detail: "не смонтирована" };
    /* Считаем ПЛИТКИ, а не детей: заглушка «ничего не найдено» — тоже
     * ребёнок грида, и на childElementCount она выдавала «плиток 1»,
     * из-за чего пустая сцена БЕЗ отбора переставала быть аварией.
     * Заглушка, притворяющаяся содержимым, — тот же класс, что индикатор,
     * притворяющийся данными. */
    const tiles = this._grid.querySelectorAll(".m41-tile").length;
    if (!tiles) return emptyVerdict(this._find, "ни одной плитки в иконостасе");
    const withPhoto = this._grid.querySelectorAll(".m41-tile:not(.is-empty)").length;
    return { ok: true, detail: `плиток ${tiles}, с фото ${withPhoto}` };
  },

  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
  },

  /* ─── Аттрактор простоя ──────────────────────────────────────────────
   * Медленная ротация фотографий с городом и годом (решение координатора
   * 2026-08-04 — выбрано вместо дрейфа силуэтов: материал настоящий).
   *
   * Три вещи, из-за которых это не просто «показать картинку»:
   *  1. Снимок берём из карточного тира (1100 px), а не из миниатюры:
   *     480 px на панели 3840 растянулись бы в мыло. Тир догружается по
   *     одному кадру за такт — легально, checkNetwork с 1.7 понимает
   *     разницу между локальным диском и внешним хостом.
   *  2. Даже 1100 на 3840 — это ×3.5, поэтому не full-bleed: снимок стоит
   *     по центру в своём размере, а фон закрывает растянутая и размытая
   *     миниатюра. Мыло в подложке под блюром незаметно, в кадре — заметно.
   *  3. Пока снимок грузится, показываем миниатюру: пустых кадров в
   *     заставке быть не должно.
   *
   * Петля — standbyTicker ядра, а не свой rAF: он держит standbyFps из
   * конфига (деф. 10) и сам гасится при касании. */
  standby() {
    if (!this._root) return null;

    const withPhoto = this._order.filter((it) => thumbUrl(this._ctx.data.thumbs, it.m.id));
    if (!withPhoto.length) return null;

    const box = document.createElement("div");
    box.className = "m41-standby";
    box.innerHTML =
      '<div class="m41-standby__bg"></div>' +
      '<figure class="m41-standby__frame"><img alt="" /></figure>' +
      '<div class="m41-standby__cap"><div class="m41-standby__city"></div>' +
      '<div class="m41-standby__year"></div></div>';
    this._root.appendChild(box);

    const bg = box.querySelector(".m41-standby__bg");
    const img = box.querySelector(".m41-standby__frame img");
    const cityEl = box.querySelector(".m41-standby__city");
    const yearEl = box.querySelector(".m41-standby__year");

    const PERIOD = 7;              // секунд на кадр
    let shown = -1;
    let token = 0;                 // отсекает догрузку кадра, который уже сменился
    /* Старт со случайного места: иначе заставка всегда начинается с Осташкова
     * 1919 и посетитель, дважды заставший простой, видит одно и то же. */
    const offset = Math.floor(Math.random() * withPhoto.length);

    const step = (t) => {
      const idx = (offset + Math.floor(t / PERIOD)) % withPhoto.length;
      if (idx === shown) return;
      shown = idx;
      const m = withPhoto[idx].m;
      const thumb = thumbUrl(this._ctx.data.thumbs, m.id);
      const big = cardUrl(this._ctx.data.cards, m.id);

      box.classList.remove("is-in");
      if (thumb) {
        img.src = thumb;
        bg.style.backgroundImage = "url('" + encodeURI(thumb) + "')";
      }
      cityEl.textContent = m.city || m.country || "";
      yearEl.textContent = m.year ? String(m.year) : "";
      /* Перезапуск перехода — через принудительный рефлоу, а НЕ через
       * requestAnimationFrame: в скрытой вкладке rAF не вызывается вовсе
       * (README ядра), и класс is-in не навешивался — кадр с подписью
       * оставались прозрачными, на экране был один размытый фон. */
      void box.offsetWidth;
      box.classList.add("is-in");

      if (big) {
        const my = ++token;
        const probe = new Image();
        probe.onload = () => { if (my === token && img.isConnected) img.src = big; };
        probe.src = big;
      }
    };

    step(0);
    /* Призыв к жесту здесь больше не трогаем. С 1.13.0 ядро само зовёт
     * KioskHint.suppressAll(true) при входе в заставку и держит подавление
     * через смены сцен, а снимает его ПЕРВЫМ ДЕЛОМ в _exitStandby — раньше,
     * чем позовут стоп-функцию сцены.
     *
     * До этого здесь стоял обход: poke() в каждом тике, потому что у кита не
     * было способа сказать «держи погашенной». Он работал (замер: 53 вызова
     * за 53 с, подсказка тёмная на 74-й секунде), но имел цену — верность
     * зависела от того, что такт тикера короче 30 с, то есть от чужой
     * настройки standbyFps, со смыслом подсказки никак не связанной. Теперь
     * этой связи нет.
     *
     * rearm() в стоп-функции ОСТАЁТСЯ: подавление и одноразовый таймер
     * простоя — разные вещи, таймер к моменту выхода уже отработал. */
    const stop = this._app.standbyTicker(step);
    return () => {
      stop();
      token += 1;
      box.remove();
      if (this._hint) this._hint.rearm();
    };
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
    /* Та же заглушка, что у «Авторов»: пустая сетка молчит, а посетителю
     * нужно объяснение и путь назад. */
    this._grid.innerHTML = parts.length ? parts.join("")
      : '<div class="m41-empty"><p class="m41-empty__t">' +
        esc(this._app.t("finder.empty")) + '</p><p class="m41-empty__h">' +
        esc(this._app.t("finder.emptyHint")) + "</p></div>";
    this._renderHead();
  },
};
