/* Сцена «Картотека» — сетка карточек персон с фильтрами по эпохе и категории.
 * Перенос логики из mtk42-archive/, приведённый к контракту сцены.
 *
 * DOM-сцена без анимации: pause()/resume() пусты честно — останавливать
 * нечего, rAF и таймеров здесь нет вовсе. */
import {
  DATA, buildPeople, portraitList, personCardHtml, createOverlay, esc,
  applyPhotoMode,
} from "./shared.js?v=33";

/* Без «all»: строку снятия («—») панель финдера подставляет сама. */
const EPOCHS = ["1920s", "soviet", "back-to-lenin", "delen", "renais", "now"];
const CATS = ["leaders", "politician", "researcher", "writers"];

/* Поля поиска. Ищем сами — ядро берёт отсюда только подписи для строки
 * «ищем по…». Сознательно НЕ ищем по summary и key_work: пересказ и
 * библиография не показаны на плитке, и объяснить посетителю, почему запись
 * нашлась, было бы нечем (расширение прецедента 39 «desc не в поиск»). */
const SEARCH_IN = [
  (it) => it.name,
  (it) => it.role,
  (it) => (it.quote && it.quote.text) || "",
];

/* «Ё» и регистр: посетитель наберёт «еременко», а в данных «Ерёменко». */
function norm(s) {
  return String(s || "").toLowerCase().replace(/ё/g, "е");
}

export const archiveScene = {
  id: "archive",
  title: { ru: "Картотека", en: "Card index", zh: "卡片目录" },

  /* Финдер (канон PLAN-KIOSK, тираж после пилота 39). Эпоха и категория
   * уехали со сцены в панель — это отбор картотечного типа, ему там место;
   * своих чипов у сцены больше нет. Сортировки объявлены все три, потому что
   * каждая ВИДИМО меняет порядок плиток. */
  finder: {
    search: {
      fields: [
        { key: "name", label: { ru: "Имя", en: "Name", zh: "姓名" } },
        { key: "role", label: { ru: "Кто это", en: "Who", zh: "身份" } },
        { key: "quote", label: { ru: "Цитата", en: "Quote", zh: "引文" } },
      ],
    },
    filters: [
      { key: "epoch", label: { ru: "Эпоха", en: "Period", zh: "时期" },
        options: (ctx) => EPOCHS.map((v) => [v, ctx.app.t("epoch." + v)]) },
      { key: "category", label: { ru: "Категория", en: "Category", zh: "类别" },
        options: (ctx) => CATS.map((v) => [v, ctx.app.t("cat." + v)]) },
    ],
    sorts: [
      { key: "az", label: { ru: "По алфавиту", en: "A→Z", zh: "按字母" } },
      { key: "year", label: { ru: "По году высказывания", en: "By year", zh: "按年份" } },
      { key: "tone", label: { ru: "От критики к почитанию", en: "Critique → reverence", zh: "由批评到崇敬" } },
    ],
  },

  /* Схема настроек v1.2. «Дизайн карточки героя» возвращён из прототипа
   * (опись SETTINGS-INVENTORY, класс А). */
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
    /* Отбор держит ядро; сцена хранит только последний присланный срез, и то
     * ради healthcheck и счётчика. Копии состояния на сцене канон запрещает. */
    this._find = this._find || { query: "", filters: {}, sort: null };

    const root = document.createElement("div");
    root.className = "m42-archive";
    root.innerHTML =
      '<header class="m42-head">' +
      '<h1 class="m42-head__title"></h1>' +
      '<p class="m42-head__sub"></p>' +
      "</header>" +
      '<div class="m42-archive__grid kiosk-scroll"></div>' +
      '<div class="m42-archive__counter"></div>';
    el.appendChild(root);

    this._root = root;
    this._gridEl = root.querySelector(".m42-archive__grid");
    this._counterEl = root.querySelector(".m42-archive__counter");
    this._overlay = createOverlay(el, this._app);

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
    if (this._gridEl) this._gridEl.removeEventListener("click", this._onCard);
    if (this._overlay) this._overlay.destroy();
    if (this._root) this._root.remove();
    this._root = this._gridEl = this._counterEl = null;
    this._overlay = this._app = null;
    this._items = null;
  },

  /* Схема v1.2: значения приходят готовыми. Расстояния — CSS-переменные,
   * чтобы не пересобирать сетку из 140 плиток на каждый чих ползунка. */
  /* Общая настройка МТК: ядро зовёт это у всех смонтированных сцен.
   * Реализация одна на всех — см. shared.js. */
  applyAppSettings(values) { applyPhotoMode(values); },

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

  /* Отбор целиком, при любом изменении. Порядок канона: отбор → поиск →
   * сортировка. Возврат {shown,total} — по ФАКТИЧЕСКИ показанному: строка
   * в подвале панели обязана объяснять экран, а не состояние панели. */
  applyFinder({ query, filters, sort }) {
    this._find = { query: query || "", filters: filters || {}, sort: sort || null };
    this._renderGrid();
    return { shown: this._visible().length, total: this._items.length };
  },

  /* Пустая сетка при непустом отборе — авария. А вот пустой отбор бывает
   * ЛЕГАЛЬНО: в данных шесть комбинаций эпоха×категория без единой записи
   * (напр. «Назад к Ленину» × «Вожди»), да и поиск легко не находит ничего.
   * Отбор финдера живёт до idle-сброса, так что стенд может застать ровно это
   * окно — и получить красный на здоровом киоске. Признак здоровья — заглушка. */
  healthcheck() {
    if (!this._gridEl) return { ok: false, detail: "сцена не смонтирована" };
    const tiles = this._gridEl.querySelectorAll(".m42-tile").length;
    const want = this._visible().length;
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

  /* Отбор финдера ядро гасит САМО и до этого вызова — здесь только свой кеш,
   * чтобы сцена не отрисовала срез, которого в ядре уже нет. */
  reset() {
    this._find = { query: "", filters: {}, sort: null };
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
    this._renderGrid();
  },

  /* Отбор → поиск → сортировка, ровно в этом порядке. */
  _visible() {
    const f = (this._find && this._find.filters) || {};
    let list = (this._items || []).filter((it) =>
      (!f.epoch || it.epoch === f.epoch) &&
      (!f.category || it.category === f.category));

    const q = norm(this._find && this._find.query);
    if (q) list = list.filter((it) => SEARCH_IN.some((get) => norm(get(it)).includes(q)));

    const sort = this._find && this._find.sort;
    if (sort === "az") list = list.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));
    else if (sort === "year") list = list.slice().sort((a, b) => a.year - b.year);
    else if (sort === "tone") list = list.slice().sort((a, b) => a.tone - b.tone);
    return list;
  },

  _renderGrid() {
    if (!this._gridEl) return;
    const t = (k, v) => this._app.t(k, v);
    const list = this._visible();

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
