/* Сцена «Картотека» — порт прототипа mtk40-catalog.
 *
 * Единственный режим, где корпус можно просто перебрать и найти нужное:
 * остальные — визуализации.
 *
 * ПОИСК ПОЯВИЛСЯ (кит 1.21.3). В прототипе его не было намеренно — «на
 * музейном киоске клавиатуры не будет»; кит принёс экранную, и причина
 * отпала. Отбор целиком переехал в финдер: состояние держит ЯДРО, сцена
 * применяет его одним applyFinder.
 *
 * ОТБОР И ПОИСК — ЦЕЛИКОМ В ПАНЕЛИ ФИНДЕРА (лупа). Боковая колонка-ярлыки и
 * алфавитный указатель УБРАНЫ (решение пользователя с прода, 2026-08-11): у
 * СПИСКА они буквально повторяли панель — те же ось/тип/язык/буква/
 * сортировка один-в-один, — и дубль оказался дороже экономии касания. Канон
 * «колонка-ярлыки» (2026-08-10) этим не отменён, а СУЖЕН: держится для
 * ПРОСТРАНСТВЕННЫХ сцен (карта, глобус), где ярлык оси лежит на содержимом и
 * панель его не повторяет; откатывается для СПИСКОВ-дублей. Критерий границы
 * — координатор (PLAN/COORDINATION): колонка буквально повторяет панель →
 * убрать; ярлык не-дубль → остаётся. На экране осталась только сетка карточек
 * во всю ширину; ось/тип/язык/буква/сортировка/поиск/«N из M»/«Сбросить» —
 * всё в панели.
 *
 * ОСЬ, ТИП И ЯЗЫК ОДНОЗНАЧНЫ. Панель кита держит одно значение на ключ («—»
 * снимает); до финдера это были множества (посетитель мог держать «им» + «о
 * нём» разом). Решением координатора единый контракт важнее множественности;
 * потеря названа в протоколе приёмки, вернуть можно только флагом в ките.
 *
 * Канвы здесь нет вовсе — всё DOM, поэтому размеры идут прямо от переменных
 * кита, без дизайн-единицы s.
 */
import { CORPUS_URL, M, corpusOf, createCard, normQuery, matchQuery } from "./shared.js?v=44";

/* Типов в данных 19, половина встречается 1–2 раза. В фильтр идут только
 * заметные, остальное сворачивается в «прочее» — иначе список значений в
 * панели длиннее, чем польза от него. */
const OTHER = "__other__";

/* Поля поиска. title_spine — короткая форма названия (17 записей из 99), она
 * идёт под ТОЙ ЖЕ подписью «Название», что и title: посетителю незачем знать,
 * что у книги два написания, — прецедент 39-го с латиницей и оригиналами.
 * short_text НЕ ищем: свободный текст даёт попадания, которые нечем
 * объяснить (их прецедент с desc). */
const FIELDS = ["title", "title_spine", "author", "place_first"];

const SORTS = [
  { id: "year-asc", cmp: (a, b) => a.year_first - b.year_first },
  { id: "year-desc", cmp: (a, b) => b.year_first - a.year_first },
  { id: "alpha", cmp: (a, b) => a.title.localeCompare(b.title, "ru") },
  { id: "pages", cmp: (a, b) => (b.pages_approx || 0) - (a.pages_approx || 0) },
  { id: "sig", cmp: (a, b) => (b.significance || 0) - (a.significance || 0) || a.year_first - b.year_first },
];

export const catalogScene = {
  id: "catalog",
  title: { ru: "Картотека", en: "Card index", zh: "书目卡" },
  keepAlive: true,

  preload: {
    data: { corpus: CORPUS_URL },
    /* Вес указан явно: "1em '20 Kopeek'" грузит только 400, а половине
     * подписей нужен 600; document.fonts.load без веса тянет только 400. */
    fonts: ["1em 'Nolde'", "400 1em '20 Kopeek'", "600 1em '20 Kopeek'"],
  },

  settings: [
    /* 520 px — не смена вида, а тот же размер, что у прототипа: там сетка
     * minmax(184px) жила внутри zoom = W/1280, то есть на 3840 давала
     * 184 × 3 = 552 реальных px. Здесь zoom'а нет, число указано сразу
     * в экранных пикселях. */
    { key: "minCard", type: "range", min: 320, max: 760, step: 20, unit: " px", default: 520,
      label: { ru: "Минимальная ширина карточки", en: "Min card width", zh: "卡片最小宽度" } },
    { key: "typeMinCount", type: "range", min: 2, max: 10, step: 1, default: 4,
      label: { ru: "Тип в фильтре от N книг", en: "Type in filter from N books", zh: "类型进入筛选的最少书数" } },
    { key: "showAuthor", type: "toggle", default: true,
      label: { ru: "Автор в карточке списка", en: "Author in list card", zh: "列表卡显示作者" } },
  ],

  /* Декларация финдера — ГЕТТЕР, а не статический объект: подписи живут в
   * словаре, и на смене языка панель должна перерисоваться его строками.
   * Ядро читает finder заново на каждую отрисовку панели, так что этого
   * достаточно. Геттер обязан быть безопасным до mount(): sweep и аудит
   * настроек читают декларации несмонтированных сцен. */
  get finder() {
    const t = (k) => (this.app ? this.app.t(k) : k);
    return {
      search: {
        fields: [
          { key: "title", label: t("find.title") },
          { key: "author", label: t("find.author") },
          { key: "place_first", label: t("find.place") },
        ],
      },
      filters: [
        { key: "bucket", label: t("catalog.axis"),
          options: () => M.BUCKETS.map((b) => [b, t("bucket." + b)]) },
        { key: "type", label: t("catalog.type"),
          options: () => this.typeOptions() },
        { key: "lang", label: t("catalog.lang"),
          options: () => this.langOptions() },
        /* Панель вертикальна и прокручивается — отдаём ВСЕ буквы, а не
         * усечённый набор: ровно тот случай, ради которого options и
         * разрешили функцией. */
        { key: "letter", label: t("catalog.letter"),
          options: () => this.letterOptions() },
      ],
      sorts: SORTS.map((s) => ({ key: s.id, label: t("sort." + s.id) })),
    };
  },

  /* Единственная точка применения: ядро зовёт её целиком при любом
   * изменении — и заново после mount(), поэтому помнить отбор сцене не
   * нужно даже при keepAlive. Возврат {shown,total} даёт строку «N из M» в
   * подвале панели — единственный теперь индикатор размера выборки (счётчик
   * из колонки ушёл вместе с колонкой). */
  applyFinder({ query, filters, sort }) {
    this.find = { query: query || "", filters: filters || {}, sort: sort || null };
    this.refresh();
    return { shown: this.shown, total: this.corpus.items.length };
  },

  mount(el, ctx) {
    this.app = ctx.app;
    this.corpus = corpusOf(ctx.data.corpus);
    this.values = { minCard: 520, typeMinCount: 4, showAuthor: true };
    /* Отбор здесь НЕ хранится — только то, что финдера не касается.
     * this.find — последнее, что прислало ядро; до первого applyFinder
     * (ядро зовёт его сразу после mount) это пустой отбор. */
    this.find = { query: "", filters: {}, sort: null };
    this.shown = 0;
    this.state = { activeId: null };
    this.computeTypes();

    el.classList.add("m40-scene");
    this.root = el;

    /* Только сетка карточек, во всю ширину: колонка и указатель убраны, весь
     * отбор — в панели финдера (лупа). */
    const box = document.createElement("div");
    box.className = "m40-catalog";
    box.innerHTML = '<div class="m40-cat__grid kiosk-scroll"></div>';
    el.appendChild(box);
    this.box = box;
    this.gridEl = box.querySelector(".m40-cat__grid");
    this.gridEl.style.setProperty("--m40-cat-min", this.values.minCard + "px");

    this.card = createCard(el, this.corpus, this.app);
    this.card.onClose = () => { this.state.activeId = null; this.paintPressed(); };

    this.refresh();
  },

  unmount() {
    if (this.box) this.box.remove();
    if (this.card) this.card.el.remove();
    this.box = this.card = null;
    this.root.classList.remove("m40-scene");
  },

  /* Кадров у сцены нет — останавливать нечего, но контракт зовёт обе. */
  pause() {},
  resume() {},

  /* Отбор к этому моменту уже погашен ядром — оно чистит финдер ДО reset()
   * сцены. Здесь остаётся только своё: открытая карточка. */
  reset() {
    this.state.activeId = null;
    if (this.card) this.card.hide();
    this.refresh();
  },

  setLang() {
    if (this.card) this.card.setLang();
    this.refresh();
  },

  setA11y() { /* размеры кита пересчитывает ядро, разметке хватает CSS */ },

  applySettings(v) {
    this.values = v;
    this.computeTypes();
    if (this.gridEl) {
      this.gridEl.style.setProperty("--m40-cat-min", (v.minCard || 520) + "px");
      this.dropUnreachableType();
      this.refresh();
    }
  },

  /* Порог «тип в фильтре от N книг» — операторская ручка, и она способна
   * увести ВЫБРАННЫЙ тип в «прочее». Тогда в ядре остаётся значение, под
   * которое больше не подходит ни одна книга: экран пуст, точка на лупе
   * горит, а строки с этим значением в панели уже нет — снять нечем.
   * Снимаем сами и ГОВОРИМ ВСЛУХ: тихо отброшенный критерий хуже
   * отвергнутого (GRABLI, «молчание бывает ложью»). */
  dropUnreachableType() {
    const v = this.find.filters.type;
    if (!v || v === OTHER || this.mainTypes.has(v)) return;
    this.app.log("warn", "картотека: тип «" + v + "» ушёл в «прочее» после смены " +
      "порога (тип в фильтре от " + (this.values.typeMinCount || 4) + " книг) — отбор по нему снят");
    this.app.setFinder({ filters: { type: null } });
  },

  healthcheck() {
    /* Несмонтированная сцена — не авария, а её штатное состояние до
     * первого показа (конвенция МТК 41). ok:false здесь давал стенду
     * ложные аварии по всем сценам, кроме активной. */
    if (!this.box) return { ok: true, detail: "не смонтирована" };
    if (!this.corpus.items.length) return { ok: false, detail: "корпус пуст" };
    const n = this.gridEl.querySelectorAll(".m40-cat__entry").length;
    /* Пустой список — законный результат отбора, но при снятом отборе это
     * уже поломка выборки. Критерии берём у ЯДРА: своих у сцены нет. */
    if (!n && !this.criteria()) {
      return { ok: false, detail: "отбор снят, а список пуст" };
    }
    /* Число в ответе и число на экране — одно и то же: считаем по DOM, а не
     * по своей переменной, иначе healthcheck подтвердил бы намерение, а не
     * результат. */
    return { ok: true, detail: "карточек в списке " + n + " из " + this.corpus.items.length +
      (this.criteria() ? " (критериев " + this.criteria() + ")" : "") };
  },

  // ---------- выборка ----------
  firstLetter(item) {
    const ch = (item.title || "").trim()[0];
    return ch ? ch.toUpperCase() : "#";
  },
  typeKey(item) { return this.mainTypes.has(item.type) ? item.type : OTHER; },

  /* Заметные типы — от операторского порога; всё остальное в «прочее». */
  computeTypes() {
    const counts = new Map();
    for (const i of this.corpus.items) counts.set(i.type, (counts.get(i.type) || 0) + 1);
    this.typeCounts = counts;
    const min = this.values.typeMinCount || 4;
    this.mainTypes = new Set([...counts].filter(([, n]) => n >= min).map(([x]) => x));
  },

  criteria() {
    const f = this.find.filters || {};
    let n = this.find.query ? 1 : 0;
    for (const k of ["bucket", "type", "lang", "letter"]) if (f[k]) n++;
    if (this.find.sort) n++;
    return n;
  },

  /* Отбор — однозначный по каждой оси; порядок применения канонический:
   * отбор → поиск → сортировка. */
  passes(item, f) {
    if (f.bucket && item.bucket !== f.bucket) return false;
    if (f.type && this.typeKey(item) !== f.type) return false;
    if (f.lang && item.language_first !== f.lang) return false;
    if (f.letter && this.firstLetter(item) !== f.letter) return false;
    return true;
  },

  select(filters) {
    const nq = normQuery(this.find.query);
    return this.corpus.items
      .filter((i) => this.passes(i, filters))
      .filter((i) => matchQuery(i, FIELDS, nq));
  },

  visible() {
    const sort = SORTS.find((x) => x.id === this.find.sort) || SORTS[0];
    return this.select(this.find.filters || {}).sort(sort.cmp);
  },

  /* Значения осей ДЛЯ ПАНЕЛИ финдера: ядро зовёт эти функции через
   * finder.filters[].options. Раньше те же списки питали и ярлыки колонки —
   * колонки нет, но панель осталась их единственным потребителем. */
  typeOptions() {
    if (!this.corpus) return [];
    const t = (k) => (this.app ? this.app.t(k) : k);
    const out = [...this.mainTypes]
      .sort((a, b) => this.typeCounts.get(b) - this.typeCounts.get(a))
      .map((x) => [x, t("type." + x)]);
    const otherN = this.corpus.items.filter((i) => !this.mainTypes.has(i.type)).length;
    if (otherN) out.push([OTHER, t("catalog.other")]);
    return out;
  },
  langOptions() {
    if (!this.corpus) return [];
    const t = (k) => (this.app ? this.app.t(k) : k);
    const counts = new Map();
    for (const i of this.corpus.items) counts.set(i.language_first, (counts.get(i.language_first) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([l]) => [l, t("lang." + l)]);
  },
  letterOptions() {
    if (!this.corpus) return [];
    const all = new Set(this.corpus.items.map((i) => this.firstLetter(i)));
    return [...all].sort((a, b) => a.localeCompare(b, "ru")).map((l) => [l, l]);
  },

  // ---------- отрисовка списка ----------
  entryNode(item) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "m40-cat__entry";
    el.dataset.id = item.id;
    el.style.setProperty("--m40-spine", item.cover_color);
    el.setAttribute("aria-pressed", String(this.state.activeId === item.id));

    const top = document.createElement("div");
    top.className = "m40-cat__top";
    const bucket = document.createElement("span");
    bucket.textContent = this.app.t("bucket." + item.bucket);
    const year = document.createElement("span");
    year.className = "m40-cat__year";
    year.textContent = item.year_first;
    top.append(bucket, year);

    const name = document.createElement("h3");
    name.className = "m40-cat__name";
    name.textContent = item.title;

    const meta = document.createElement("div");
    meta.className = "m40-cat__meta";
    const parts = [this.app.t("type." + item.type)];
    if (item.pages_approx) parts.push(this.app.t("card.pages", { n: item.pages_approx }));
    const conns = (this.corpus.connsByItem.get(item.id) || []).length;
    if (conns) parts.push(this.app.t("catalog.conns", { n: conns }));
    for (const p of parts) {
      const sp = document.createElement("span");
      sp.textContent = p;
      meta.appendChild(sp);
    }
    if (item.significance === 5) {
      const star = document.createElement("span");
      star.className = "m40-cat__star";
      star.textContent = "★";
      meta.appendChild(star);
    }

    el.append(top, name);
    if (this.values.showAuthor !== false && item.author) {
      const author = document.createElement("div");
      author.className = "m40-cat__author";
      author.textContent = item.author;
      el.appendChild(author);
    }
    el.appendChild(meta);

    el.addEventListener("click", () => {
      this.state.activeId = item.id;
      this.card.show(item);
      this.paintPressed();
    });
    return el;
  },

  paintPressed() {
    for (const el of this.gridEl.querySelectorAll(".m40-cat__entry")) {
      el.setAttribute("aria-pressed", String(el.dataset.id === this.state.activeId));
    }
  },

  refresh() {
    if (!this.box) return;
    const list = this.visible();
    this.shown = list.length;
    this.gridEl.innerHTML = "";
    if (!list.length) {
      const p = document.createElement("div");
      p.className = "m40-cat__empty";
      p.textContent = this.app.t("catalog.empty");
      this.gridEl.appendChild(p);
      return;
    }
    /* При сортировке по алфавиту — заголовки-буквы между группами. Это НЕ
     * дубль убранного указателя: там был отбор по букве, здесь — разделитель
     * внутри уже отсортированного списка, помощь глазу при длинной прокрутке. */
    let lastLetter = null;
    for (const item of list) {
      if (this.find.sort === "alpha") {
        const l = this.firstLetter(item);
        if (l !== lastLetter) {
          const h = document.createElement("div");
          h.className = "m40-cat__alphahead";
          h.textContent = l;
          this.gridEl.appendChild(h);
          lastLetter = l;
        }
      }
      this.gridEl.appendChild(this.entryNode(item));
    }
    this.gridEl.scrollTop = 0;
  },
};
