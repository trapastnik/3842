/* Сцена «Кто лепил Ленина» — корпус, разложенный по скульпторам.
 * Перенос из mtk41-authors/ на контракт сцены.
 *
 * Анимации нет: DOM строится один раз. rAF-петли не существует вовсе —
 * на паузе сцена гарантированно ничего не потребляет.
 *
 * Имена авторов в данных уже нормализованы (_normalize_names.py): до этого
 * Козлов разъезжался на «В. В.» и «В.В.» и первым по числу работ выглядел
 * Томский. Здесь на это опираемся и повторно не чистим. */
import {
  DATA,
  createCard,
  esc,
  label,
  plural,
  thumbUrl,
  preloadThumbs,
  createHint,
  FINDER_FIELDS,
  countryOptions,
  decadeOptions,
  APP,
  drawEmptyState,
  emptyVerdict,
  finderApply,
  finderSort,
  setCorpus,
  statusOptions,
} from "./shared.js?v=58";

/* Краткий контекст — только общеизвестное. Это контент, он остаётся на
 * русском (решение пилота 42), в словари не выносится. */
const SCULPTOR_BIO = {
  "С.Д. Меркуров": { years: "1881–1952", bio: "Снял посмертную маску Ленина. Главный монументалист 1930–40-х." },
  "Е.В. Вучетич": { years: "1908–1974", bio: "Автор «Родины-матери» в Волгограде; в Лениниане — последний по времени гигант, 1973." },
  "Г.Д. Алексеев": { years: "1881–1951", bio: "Лепил Ленина с натуры в 1919. Первое прижизненное скульптурное изображение." },
  "В.В. Козлов": { years: "1885–1940", bio: "Самый тиражированный автор ранней волны: одна модель разошлась по стране." },
  "Н.В. Томский": { years: "1900–1984", bio: "Президент Академии художеств; поздняя монументальная классика." },
  "М.Г. Манизер": { years: "1891–1966", bio: "Ленинградская школа; десятки повторений в городах Союза." },
  "Л.Е. Кербель": { years: "1917–2003", bio: "Поздняя советская монументалистика, работал до 1990-х." },
  "В.Б. Пинчук": { years: "1908–1987", bio: "Ленинградская монументалистика; пара с Тауритом — «Ленин и Сталин в Горках»." },
  "Р.К. Таурит": { years: "1910–1969", bio: "Соавтор Пинчука по «Ленин и Сталин в Горках»." },
  "Г.В. Нерода": { years: "1895–1983", bio: "Отец и сын Нерода слепили самую большую голову Ленина в мире — Улан-Удэ." },
  "Ю.Г. Нерода": { years: "1920–2006", bio: "Сын Г.В. Нероды; соавтор головы Ленина в Улан-Удэ." },
  "М.Я. Харламов": { years: "1875–1930", bio: "Ранняя волна: Вытегра, Кольчугино, первый монументальный Ленин Ленинграда." },
};

export const authorsScene = {
  id: "authors",
  title: { ru: "Кто лепил Ленина", en: "Who sculpted Lenin", zh: "谁塑造了列宁" },

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

  /* Финдер. Объявляем только то, у чего есть ВИДИМЫЙ эффект: отбор виден
   * всегда, сортировка — не везде (см. отказы в декларации). */
  finder: {
    search: { fields: FINDER_FIELDS },
    filters: [
      { key: "status", label: { ru: "Судьба", en: "Fate" },
        options: function () { return statusOptions(APP()); } },
      { key: "country", label: { ru: "Страна", en: "Country" },
        options: function () { return countryOptions(); } },
    ],
    sorts: [
      { key: "count", label: { ru: "По числу работ", en: "By works" } },
      { key: "az", label: { ru: "По алфавиту", en: "A→Z" } },
    ],
  },

  settings: [
    { key: "minWorks", label: { ru: "Минимум работ у автора", en: "Min works per author" },
      type: "range", min: 1, max: 8, step: 1, unit: "", default: 2 },
    { key: "colWidth", label: { ru: "Ширина колонки", en: "Column width" },
      type: "range", min: 220, max: 520, step: 20, unit: " px", default: 320 },
    { key: "showBio", label: { ru: "Справка об авторе", en: "Author note" },
      type: "toggle", default: true },
    { key: "showAnon", label: { ru: "Колонка «без автора»", en: "Anonymous column" },
      type: "toggle", default: true },
  ],

  mount(el, ctx) {
    this._ctx = ctx;
    this._app = ctx.app;

    const root = document.createElement("div");
    root.className = "m41-scene m41-authors";
    root.innerHTML =
      '<header class="m41-head"><h1 class="m41-head__title"></h1>' +
      '<p class="m41-head__sub"></p></header>' +
      '<div class="m41-authors__cols kiosk-scroll"></div>';
    el.appendChild(root);

    this._root = root;
    this._cols = root.querySelector(".m41-authors__cols");
    this._titleEl = root.querySelector(".m41-head__title");
    this._subEl = root.querySelector(".m41-head__sub");
    this._card = createCard(el, ctx.app, ctx);

    /* На корень сцены, а не на .kiosk-scroll-грид: в прокручиваемом
     * контейнере absolute считается от высоты содержимого, и подсказка
     * уехала бы далеко вниз за пределы экрана. */
    this._hint = createHint(this._root, "tap", "hint." + this.id, ctx.app);

    this._onTap = (e) => {
      const w = e.target.closest("[data-idx]");
      if (!w) return;
      const m = this._items[Number(w.getAttribute("data-idx"))];
      if (m) this._card.open(m);
    };
    this._cols.addEventListener("click", this._onTap);

    this._src = ctx.data.monuments.items || [];
    setCorpus(ctx.data.monuments.items || [], ctx.app);
    this._applyFind();
    this.applySettings(this._cfg || {});
  },

  unmount() {
    if (this._hint) { this._hint.destroy(); this._hint = null; }
    if (this._cols) this._cols.removeEventListener("click", this._onTap);
    if (this._card) this._card.destroy();
    if (this._root) this._root.remove();
    this._root = this._cols = this._card = null;
  },

  pause() {},
  resume() {},

  reset() {
    if (this._card) this._card.close();
    if (this._cols) { this._cols.scrollLeft = 0; this._cols.scrollTop = 0; }
  },

  setLang() { this._render(); if (this._hint) this._hint.relabel(); },

  applyFinder(find) {
    this._find = find;
    this._applyFind();
    if (this._cols) this._render();
    return { shown: this._items.length, total: (this._src || []).length };
  },

  _applyFind() {
    this._items = finderApply(this._src || [], this._find);
    this._buckets = buildBuckets(this._items);
    /* buildBuckets отдаёт ОБЪЕКТ {named, anon}, а не массив: сортировать
     * надо колонки внутри named. Первая редакция звала slice() на объекте и
     * тихо превратила бы колонки в пустоту. Порядок по умолчанию — по числу
     * работ, его строит сам buildBuckets. */
    if ((this._find || {}).sort === "az") {
      this._buckets = {
        named: this._buckets.named.slice()
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru")),
        anon: this._buckets.anon,
      };
    }
  },

  healthcheck() {
    if (!this._cols) return { ok: true, detail: "не смонтирована" };
    /* Считаем КОЛОНКИ (.m41-author), а не детей: заглушка «ничего не найдено»
     * — тоже ребёнок, и на childElementCount пустая сцена БЕЗ отбора
     * перестала бы быть аварией. Класс списан с разметки, а не придуман:
     * первая правка искала .m41-col, которого в этой сцене нет. */
    const cols = this._cols.querySelectorAll(".m41-author").length;
    if (!cols) return emptyVerdict(this._find, "ни одной колонки авторов");
    const works = this._cols.querySelectorAll(".m41-work").length;
    if (!works) return { ok: false, detail: "колонки есть, работ в них нет" };
    return { ok: true, detail: `колонок ${cols}, работ ${works}` };
  },

  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
  },

  applySettings(values) {
    this._cfg = Object.assign({ minWorks: 2, colWidth: 320, showBio: true, showAnon: true },
      values || {});
    if (!this._root) return;
    this._root.style.setProperty("--m41-col-w", this._cfg.colWidth + "px");
    this._render();
  },

  _render() {
    const app = this._app, ctx = this._ctx, cfg = this._cfg;
    const shown = this._buckets.named.filter((b) => b.indices.length >= cfg.minWorks);

    const top = this._buckets.named[0];
    const sc = this._buckets.named.length;
    const n = this._items.length;
    this._titleEl.textContent = app.t("authors.title");
    this._subEl.textContent = app.t("authors.subtitle", {
      s: sc + " " + plural(sc, ["скульптор", "скульптора", "скульпторов"]),
      n: n + " " + plural(n, ["памятник", "памятника", "памятников"]),
      top: top ? top.name : "—",
      topN: top ? top.indices.length : 0,
    });

    const parts = shown.map((b) => this._colHtml(b, cfg));
    if (cfg.showAnon && this._buckets.anon.length) {
      parts.push(this._colHtml(
        { name: app.t("authors.anon"), indices: this._buckets.anon, anon: true }, cfg));
    }
    /* Заглушка вместо пустоты: панель пишет «0 из 283», но сцена без
     * подписи — чистый экран без объяснения. */
    this._cols.innerHTML = parts.length ? parts.join("")
      : '<div class="m41-empty"><p class="m41-empty__t">' +
        esc(app.t("finder.empty")) + '</p><p class="m41-empty__h">' +
        esc(app.t("finder.emptyHint")) + "</p></div>";
  },

  _colHtml(b, cfg) {
    const ctx = this._ctx;
    const bio = SCULPTOR_BIO[b.name];
    const head =
      '<div class="m41-author__name">' + esc(b.name) + "</div>" +
      (bio && bio.years ? '<div class="m41-author__years">' + esc(bio.years) + "</div>" : "") +
      (cfg.showBio && bio && bio.bio
        ? '<div class="m41-author__bio">' + esc(bio.bio) + "</div>" : "") +
      '<div class="m41-author__count">' + b.indices.length + "</div>";

    const works = b.indices
      .slice()
      .sort((x, y) => (this._items[x].year || 9999) - (this._items[y].year || 9999))
      .map((idx) => {
        const m = this._items[idx];
        const thumb = thumbUrl(ctx.data.thumbs, m.id);
        /* Кавычки внутри url() — только одинарные, иначе рвётся сам style="…". */
        const st = thumb ? " style=\"background-image:url('" + encodeURI(thumb) + "')\"" : "";
        return '<button type="button" class="m41-work" data-idx="' + idx +
          '" data-status="' + esc(m.status || "unknown") + '">' +
          '<span class="m41-work__thumb' + (thumb ? "" : " is-empty") + '"' + st + '>' +
          (thumb ? "" : "Л") + "</span>" +
          '<span class="m41-work__text"><span class="m41-work__year">' +
          esc(m.year ? String(m.year) : "—") + '</span><span class="m41-work__title">' +
          esc(label(m)) + "</span></span></button>";
      }).join("");

    return '<section class="m41-author' + (b.anon ? " is-anon" : "") + '">' +
      head + '<div class="m41-author__works kiosk-scroll">' + works + "</div></section>";
  },
};

/* Раскладка по авторам. Памятники без атрибуции не выбрасываем: у шести
 * записей автор в источнике не указан, и молча терять их нельзя. */
function buildBuckets(items) {
  const map = new Map();
  const anon = [];
  for (let i = 0; i < items.length; i += 1) {
    const list = (items[i].sculptors || []).filter(Boolean);
    if (!list.length) { anon.push(i); continue; }
    for (const name of list) {
      let b = map.get(name);
      if (!b) { b = { name, indices: [] }; map.set(name, b); }
      b.indices.push(i);
    }
  }
  const named = [...map.values()].sort(
    (a, b) => b.indices.length - a.indices.length || a.name.localeCompare(b.name));
  return { named, anon };
}
