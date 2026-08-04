/* Сцена «Картотека» — порт прототипа mtk40-catalog.
 *
 * Единственный режим, где корпус можно просто перебрать и найти нужное:
 * остальные — визуализации. Поля поиска нет намеренно: на музейном киоске
 * клавиатуры не будет. Вместо него фильтры (ось / тип / язык), порядок и
 * алфавитный указатель.
 *
 * Канвы здесь нет вовсе — всё DOM, поэтому размеры идут прямо от переменных
 * кита, без дизайн-единицы s.
 */
import { M, corpusOf, createCard, chip } from "./shared.js?v=21";

/* Типов в данных 19, половина встречается 1–2 раза. В фильтр идут только
 * заметные, остальное сворачивается в «прочее» — иначе строка чипов длиннее,
 * чем польза от неё. */
const OTHER = "__other__";

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
    data: { corpus: "../data/mtk40.json" },
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

  mount(el, ctx) {
    this.app = ctx.app;
    this.corpus = corpusOf(ctx.data.corpus);
    this.values = { minCard: 520, typeMinCount: 4, showAuthor: true };
    this.state = {
      buckets: new Set(), types: new Set(), langs: new Set(),
      sort: "year-asc", alpha: null, activeId: null,
    };

    el.classList.add("m40-scene");
    this.root = el;

    const box = document.createElement("div");
    box.className = "m40-catalog";
    box.innerHTML =
      '<aside class="m40-cat__side kiosk-scroll">' +
        '<div class="m40-cat__g" data-g="bucket"></div>' +
        '<div class="m40-cat__g" data-g="type"></div>' +
        '<div class="m40-cat__g" data-g="lang"></div>' +
        '<div class="m40-cat__g" data-g="sort"></div>' +
        '<div class="m40-cat__tail"><span class="m40-cat__count"></span>' +
          '<button type="button" class="m40-chip m40-cat__reset"></button></div>' +
      "</aside>" +
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

    this.resetBtn.addEventListener("click", () => {
      const s = this.state;
      s.buckets.clear(); s.types.clear(); s.langs.clear();
      s.sort = "year-asc"; s.alpha = null;
      this.refresh();
    });

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

  reset() {
    const s = this.state;
    s.buckets.clear(); s.types.clear(); s.langs.clear();
    s.sort = "year-asc"; s.alpha = null; s.activeId = null;
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
    if (this.gridEl) {
      this.gridEl.style.setProperty("--m40-cat-min", (v.minCard || 520) + "px");
      this.refresh();
    }
  },

  healthcheck() {
    /* Несмонтированная сцена — не авария, а её штатное состояние до
     * первого показа (конвенция МТК 41). ok:false здесь давал стенду
     * ложные аварии по всем сценам, кроме активной. */
    if (!this.box) return { ok: true, detail: "не смонтирована" };
    if (!this.corpus.items.length) return { ok: false, detail: "корпус пуст" };
    const n = this.gridEl.querySelectorAll(".m40-cat__entry").length;
    /* Пустой список — законный результат фильтров, но при пустых фильтрах
     * это уже поломка выборки. */
    if (!n && !this.state.buckets.size && !this.state.types.size &&
        !this.state.langs.size && !this.state.alpha) {
      return { ok: false, detail: "фильтры сняты, а список пуст" };
    }
    return { ok: true, detail: "карточек в списке " + n + " из " + this.corpus.items.length };
  },

  // ---------- выборка ----------
  firstLetter(item) {
    const ch = (item.title || "").trim()[0];
    return ch ? ch.toUpperCase() : "#";
  },
  typeKey(item) { return this.mainTypes.has(item.type) ? item.type : OTHER; },

  /* Пул для указателя — всё, что прошло прочие фильтры: буква без единой
   * книги гасится, а не даёт пустой экран по нажатию. */
  pool() {
    const s = this.state;
    return this.corpus.items.filter((i) => {
      if (s.buckets.size && !s.buckets.has(i.bucket)) return false;
      if (s.types.size && !s.types.has(this.typeKey(i))) return false;
      if (s.langs.size && !s.langs.has(i.language_first)) return false;
      return true;
    });
  },
  visible() {
    const s = this.state;
    return this.pool()
      .filter((i) => !s.alpha || this.firstLetter(i) === s.alpha)
      .sort(SORTS.find((x) => x.id === s.sort).cmp);
  },

  toggle(set, key) {
    if (set.has(key)) set.delete(key); else set.add(key);
    this.refresh();
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

  buildFilters() {
    const t = (k, p) => this.app.t(k, p);
    const items = this.corpus.items;
    const s = this.state;

    this.group("bucket", t("catalog.axis"), M.BUCKETS.map((b) => {
      const meta = M.BUCKET_META[b];
      return chip(t("bucket." + b), {
        count: items.filter((i) => i.bucket === b).length,
        accent: meta.accent, pressed: s.buckets.has(b),
        onClick: () => this.toggle(s.buckets, b),
      });
    }));

    const counts = new Map();
    for (const i of items) counts.set(i.type, (counts.get(i.type) || 0) + 1);
    const minCount = this.values.typeMinCount || 4;
    this.mainTypes = new Set([...counts].filter(([, n]) => n >= minCount).map(([x]) => x));
    const typeNodes = [...this.mainTypes]
      .sort((a, b) => counts.get(b) - counts.get(a))
      .map((x) => chip(t("type." + x), {
        count: counts.get(x), pressed: s.types.has(x),
        onClick: () => this.toggle(s.types, x),
      }));
    const otherN = items.filter((i) => !this.mainTypes.has(i.type)).length;
    if (otherN) {
      typeNodes.push(chip(t("catalog.other"), {
        count: otherN, pressed: s.types.has(OTHER),
        onClick: () => this.toggle(s.types, OTHER),
      }));
    }
    this.group("type", t("catalog.type"), typeNodes);

    const langCounts = new Map();
    for (const i of items) langCounts.set(i.language_first, (langCounts.get(i.language_first) || 0) + 1);
    this.group("lang", t("catalog.lang"), [...langCounts]
      .sort((a, b) => b[1] - a[1])
      .map(([l, n]) => chip(t("lang." + l), {
        count: n, pressed: s.langs.has(l),
        onClick: () => this.toggle(s.langs, l),
      })));

    this.group("sort", t("catalog.order"), SORTS.map((x) => chip(t("sort." + x.id), {
      pressed: s.sort === x.id,
      onClick: () => { s.sort = x.id; this.refresh(); },
    })));

    this.resetBtn.textContent = t("catalog.reset");
  },

  buildAlpha() {
    const s = this.state;
    this.idxLegendEl.textContent = this.app.t("catalog.index");
    this.alphaEl.innerHTML = "";
    const present = new Map();
    for (const i of this.pool()) {
      const l = this.firstLetter(i);
      present.set(l, (present.get(l) || 0) + 1);
    }
    this.alphaEl.appendChild(chip(this.app.t("catalog.all"), {
      pressed: s.alpha === null,
      onClick: () => { s.alpha = null; this.refresh(); },
    }));
    for (const l of [...present.keys()].sort((a, b) => a.localeCompare(b, "ru"))) {
      const b = chip(l, {
        pressed: s.alpha === l,
        onClick: () => { s.alpha = s.alpha === l ? null : l; this.refresh(); },
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
      if (this.state.sort === "alpha") {
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
