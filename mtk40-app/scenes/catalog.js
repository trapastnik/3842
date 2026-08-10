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
 * Боковая колонка и алфавитная лента ОСТАЛИСЬ на экране, но стали ЯРЛЫКАМИ
 * (канон «Ярлык в финдер», 2026-08-10): тап шлёт тот же патч, что выбор в
 * панели, повторный тап шлёт null. Копии состояния в сцене нет — иначе
 * колонка и панель разошлись бы, а это ровно семья «индикатор против
 * состояния».
 *
 * ОСЬ, ТИП И ЯЗЫК СТАЛИ ОДНОЗНАЧНЫМИ. До переезда это были множества:
 * посетитель мог держать «им» + «о нём» разом. Панель кита однозначна (одно
 * значение на ключ, «—» снимает), и решением координатора единый контракт
 * важнее множественности на трёх коротких осях. Потеря названа вслух — в
 * отчёте сдачи и в протоколе приёмки; вернуть её можно только флагом в ките.
 *
 * Канвы здесь нет вовсе — всё DOM, поэтому размеры идут прямо от переменных
 * кита, без дизайн-единицы s.
 */
import { CORPUS_URL, M, corpusOf, createCard, chip, normQuery, matchQuery } from "./shared.js?v=44";

/* Типов в данных 19, половина встречается 1–2 раза. В фильтр идут только
 * заметные, остальное сворачивается в «прочее» — иначе строка чипов длиннее,
 * чем польза от неё. */
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
    /* Вес указан явно: "1em '20 Kopeek'" грузит только 400, а на канве
     * половина подписей — 600. Канва загрузку шрифта не запускает вовсе
     * (ctx.font молча берёт то, что уже загружено), поэтому жирное
     * начертание надо просить прероллом. */
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
   * нужно даже при keepAlive. */
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

    const box = document.createElement("div");
    box.className = "m40-catalog";
    box.innerHTML =
      /* Прокручивается ТОЛЬКО список групп; счётчик и «сбросить» стоят
       * отдельным этажом и не уезжают. Раньше прокручивалась вся колонка, и
       * на действующем масштабе 1.5 хвост оказывался ниже видимой части —
       * палец в «сбросить» не попадал. Прижать хвост липким слоем поверх
       * прокрутки я попробовал первым: он тут же накрыл собой три ярлыка
       * порядка. Слой поверх контролов — не решение, а обмен одного промаха
       * на три. */
      '<aside class="m40-cat__side">' +
        '<div class="m40-cat__groups kiosk-scroll">' +
          '<div class="m40-cat__g" data-g="bucket"></div>' +
          '<div class="m40-cat__g" data-g="type"></div>' +
          '<div class="m40-cat__g" data-g="lang"></div>' +
          '<div class="m40-cat__g" data-g="sort"></div>' +
        "</div>" +
        '<div class="m40-cat__tail"><span class="m40-cat__count"></span>' +
          '<button type="button" class="m40-chip m40-cat__reset"></button></div>' +
      "</aside>" +
      /* kiosk-scroll с ленты снят: она больше не прокручивается, а
       * переносится — прокручиваемый контейнер без прокрутки стенд считает
       * скрытой полосой. */
      '<div class="m40-cat__idx"><span class="m40-cat__legend"></span>' +
        '<div class="m40-chips m40-cat__alpha"></div></div>' +
      '<div class="m40-cat__grid kiosk-scroll"></div>';
    el.appendChild(box);
    this.box = box;
    this.sideEl = box.querySelector(".m40-cat__side");
    this.gridEl = box.querySelector(".m40-cat__grid");
    this.countEl = box.querySelector(".m40-cat__count");
    this.resetBtn = box.querySelector(".m40-cat__reset");
    this.alphaEl = box.querySelector(".m40-cat__alpha");
    this.idxLegendEl = box.querySelector(".m40-cat__legend");

    /* Сброс зовёт ЯДРО, а не чистит своё: своего у сцены больше нет, и
     * второй сброс рядом с китовым разошёлся бы с ним при первой правке. */
    this.resetBtn.addEventListener("click", () => this.app.resetFinder());

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
   * горит, а чипа с этим значением на экране уже нет — снять нечем.
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

  /* Счёт на ярлыке — ФАСЕТНЫЙ: «сколько будет, если выбрать эту строку».
   * Полный счёт по корпусу врал бы при любом отборе, а счёт со всеми
   * критериями сразу показывал бы нули на соседях выбранного значения —
   * ровно тогда, когда они нужны. */
  facet(axis, value) {
    const f = Object.assign({}, this.find.filters, { [axis]: value });
    return this.select(f).length;
  },

  /* Ярлык = переключатель: тап шлёт значение, повторный тап по выбранному
   * шлёт null. У панельных чипов семантика иная (выбор из ряда, снятие
   * чипом «—»), и расхождение осознанное — канон 2026-08-10. */
  markFilter(axis, value) {
    const cur = (this.find.filters || {})[axis];
    this.app.setFinder({ filters: { [axis]: cur === value ? null : value } });
  },

  // ---------- отрисовка ----------
  group(name, legend, nodes) {
    const g = this.box.querySelector(`[data-g="${name}"]`);
    g.innerHTML = "";
    const l = document.createElement("span");
    l.className = "m40-cat__legend";
    l.textContent = legend;
    const chips = document.createElement("div");
    chips.className = "m40-chips";
    nodes.forEach((n) => chips.appendChild(n));
    g.append(l, chips);
  },

  /* Значения осей для панели: те же списки, что на ярлыках, — панель и
   * колонка обязаны предлагать одно и то же. */
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

  buildFilters() {
    const t = (k, p) => this.app.t(k, p);
    const f = this.find.filters || {};

    this.group("bucket", t("catalog.axis"), M.BUCKETS.map((b) => chip(t("bucket." + b), {
      count: this.facet("bucket", b),
      accent: M.BUCKET_META[b].accent,
      pressed: f.bucket === b,
      onClick: () => this.markFilter("bucket", b),
    })));

    this.group("type", t("catalog.type"), this.typeOptions().map(([v, label]) => chip(label, {
      count: this.facet("type", v),
      pressed: f.type === v,
      onClick: () => this.markFilter("type", v),
    })));

    this.group("lang", t("catalog.lang"), this.langOptions().map(([v, label]) => chip(label, {
      count: this.facet("lang", v),
      pressed: f.lang === v,
      onClick: () => this.markFilter("lang", v),
    })));

    /* Порядок — не переключатель, а выбор: «никакого порядка» не бывает, и
     * нажатым показан ДЕЙСТВУЮЩИЙ, даже когда в ядре пусто. Иначе колонка
     * говорила бы «порядок не выбран» над списком, отсортированным по году,
     * — обещание наоборот, вторая половина той же оси. Повторный тап по
     * действующему ничего не шлёт: состояние и так это. */
    const eff = this.find.sort || SORTS[0].id;
    this.group("sort", t("catalog.order"), SORTS.map((x) => chip(t("sort." + x.id), {
      pressed: eff === x.id,
      onClick: () => { if (eff !== x.id) this.app.setFinder({ sort: x.id }); },
    })));

    this.resetBtn.textContent = t("catalog.reset");
  },

  buildAlpha() {
    const cur = (this.find.filters || {}).letter || null;
    this.idxLegendEl.textContent = this.app.t("catalog.index");
    this.alphaEl.innerHTML = "";
    this.alphaEl.appendChild(chip(this.app.t("catalog.all"), {
      pressed: cur === null,
      onClick: () => { if (cur !== null) this.app.setFinder({ filters: { letter: null } }); },
    }));
    for (const [l] of this.letterOptions()) {
      const n = this.facet("letter", l);
      /* Буква, за которой при нынешнем отборе нет ни одной книги, с ленты
       * уходит: оставить её нажимаемой значит обещать экран, который будет
       * пуст, а погасить pointer-events — завести ложный аффорданс (ловушка
       * пилота 39). Выбранную букву держим всегда, иначе её нечем снять. */
      if (!n && l !== cur) continue;
      /* Числа на буквах НЕТ намеренно. Фасетный счёт я сюда навесил и тут же
       * снял: значок расширил каждую букву примерно на двадцать пикселей, и
       * лента из 27 ярлыков перестала помещаться в строку — последняя буква
       * ушла за горизонтальную прокрутку (замер: «Т» на x=3788 при ленте до
       * 3776). Канон требует, чтобы ПОКАЗАННЫЙ счёт был фасетным, а не чтобы
       * счёт был показан везде; пустые буквы с ленты и так уходят. */
      const b = chip(l, {
        pressed: cur === l,
        onClick: () => this.markFilter("letter", l),
      });
      b.classList.add("m40-chip--alpha");
      this.alphaEl.appendChild(b);
    }
  },

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
    /* Чипы перерисовываем целиком: состояние живёт в state, а не в DOM. */
    this.buildFilters();
    this.buildAlpha();

    const list = this.visible();
    this.shown = list.length;
    this.countEl.textContent = this.app.t("catalog.count",
      { shown: list.length, total: this.corpus.items.length });
    this.gridEl.innerHTML = "";
    if (!list.length) {
      const p = document.createElement("div");
      p.className = "m40-cat__empty";
      p.textContent = this.app.t("catalog.empty");
      this.gridEl.appendChild(p);
      return;
    }
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
