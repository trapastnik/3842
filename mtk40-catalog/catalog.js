/**
 * МТК 40 · Картотека — единственный режим, где корпус можно просто перебрать
 * и найти нужное: остальные четыре варианта — визуализации.
 *
 * Поля поиска нет намеренно: на музейном киоске клавиатуры не будет.
 * Вместо него — фильтры (ось / тип / язык), порядок и алфавитный указатель.
 */
(function () {
  const M = window.MTK40;
  const $ = (id) => document.getElementById(id);

  // Типов в данных 19, из них половина встречается 1–2 раза. В фильтр идут
  // только заметные, остальное сворачивается в «прочее» — иначе строка чипов
  // длиннее, чем польза от неё.
  const TYPE_MIN_COUNT = 4;
  const OTHER = "__other__";

  const SORTS = [
    { id: "year-asc",  label: "год ↑",       cmp: (a, b) => a.year_first - b.year_first },
    { id: "year-desc", label: "год ↓",       cmp: (a, b) => b.year_first - a.year_first },
    { id: "alpha",     label: "по алфавиту", cmp: (a, b) => a.title.localeCompare(b.title, "ru") },
    { id: "pages",     label: "объём ↓",     cmp: (a, b) => (b.pages_approx || 0) - (a.pages_approx || 0) },
    { id: "sig",       label: "значимость ↓", cmp: (a, b) => (b.significance || 0) - (a.significance || 0) || a.year_first - b.year_first },
  ];

  const state = {
    buckets: new Set(),
    types: new Set(),
    langs: new Set(),
    sort: "year-asc",
    alpha: null,
    activeId: null,
  };

  let corpus, card, entriesEl, mainTypes;

  function firstLetter(item) {
    const ch = (item.title || "").trim()[0];
    return ch ? ch.toUpperCase() : "#";
  }
  function typeKey(item) {
    return mainTypes.has(item.type) ? item.type : OTHER;
  }

  function visible() {
    return corpus.items.filter((i) => {
      if (state.buckets.size && !state.buckets.has(i.bucket)) return false;
      if (state.types.size && !state.types.has(typeKey(i))) return false;
      if (state.langs.size && !state.langs.has(i.language_first)) return false;
      if (state.alpha && firstLetter(i) !== state.alpha) return false;
      return true;
    }).sort(SORTS.find((s) => s.id === state.sort).cmp);
  }

  function chip(label, opts) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (opts.alpha ? " chip--alpha" : "");
    b.setAttribute("aria-pressed", String(!!opts.pressed));
    b.innerHTML = opts.count == null
      ? label
      : `${label}<span class="chip__n">${opts.count}</span>`;
    if (opts.accent) {
      b.dataset.accent = "1";
      b.style.setProperty("--chip-accent", opts.accent);
    }
    if (opts.disabled) b.disabled = true;
    b.addEventListener("click", opts.onClick);
    return b;
  }

  function buildFilters() {
    // ось
    const bucketBox = $("f-bucket");
    for (const b of M.BUCKETS) {
      const meta = M.BUCKET_META[b];
      const n = corpus.items.filter((i) => i.bucket === b).length;
      bucketBox.appendChild(chip(meta.label, {
        count: n, accent: meta.accent, pressed: state.buckets.has(b),
        onClick: () => toggle(state.buckets, b),
      }));
    }

    // тип
    const counts = new Map();
    for (const i of corpus.items) counts.set(i.type, (counts.get(i.type) || 0) + 1);
    mainTypes = new Set([...counts].filter(([, n]) => n >= TYPE_MIN_COUNT).map(([t]) => t));
    const typeBox = $("f-type");
    const ordered = [...mainTypes].sort((a, b) => counts.get(b) - counts.get(a));
    for (const t of ordered) {
      typeBox.appendChild(chip(M.TYPE_LABEL[t] || t, {
        count: counts.get(t), pressed: state.types.has(t),
        onClick: () => toggle(state.types, t),
      }));
    }
    const otherN = corpus.items.filter((i) => !mainTypes.has(i.type)).length;
    if (otherN) {
      typeBox.appendChild(chip("прочее", {
        count: otherN, pressed: state.types.has(OTHER),
        onClick: () => toggle(state.types, OTHER),
      }));
    }

    // язык
    const langBox = $("f-lang");
    const langCounts = new Map();
    for (const i of corpus.items) langCounts.set(i.language_first, (langCounts.get(i.language_first) || 0) + 1);
    for (const [l, n] of [...langCounts].sort((a, b) => b[1] - a[1])) {
      langBox.appendChild(chip(M.LANG_LABEL[l] || l, {
        count: n, pressed: state.langs.has(l),
        onClick: () => toggle(state.langs, l),
      }));
    }

    // порядок
    const sortBox = $("f-sort");
    for (const s of SORTS) {
      sortBox.appendChild(chip(s.label, {
        pressed: state.sort === s.id,
        onClick: () => { state.sort = s.id; refresh(); },
      }));
    }

    $("reset").addEventListener("click", () => {
      state.buckets.clear(); state.types.clear(); state.langs.clear();
      state.sort = "year-asc"; state.alpha = null;
      refresh();
    });
  }

  function toggle(set, key) {
    if (set.has(key)) set.delete(key); else set.add(key);
    refresh();
  }

  // Указатель строится по книгам, прошедшим все прочие фильтры: буква без
  // единой книги гасится, а не молчит и не даёт пустой экран по нажатию.
  function buildAlpha() {
    const box = $("f-alpha");
    box.innerHTML = "";
    const pool = corpus.items.filter((i) => {
      if (state.buckets.size && !state.buckets.has(i.bucket)) return false;
      if (state.types.size && !state.types.has(typeKey(i))) return false;
      if (state.langs.size && !state.langs.has(i.language_first)) return false;
      return true;
    });
    const present = new Map();
    for (const i of pool) {
      const l = firstLetter(i);
      present.set(l, (present.get(l) || 0) + 1);
    }
    box.appendChild(chip("все", {
      pressed: state.alpha === null,
      onClick: () => { state.alpha = null; refresh(); },
    }));
    const letters = [...present.keys()].sort((a, b) => a.localeCompare(b, "ru"));
    for (const l of letters) {
      box.appendChild(chip(l, {
        alpha: true, pressed: state.alpha === l,
        onClick: () => { state.alpha = state.alpha === l ? null : l; refresh(); },
      }));
    }
  }

  function entryNode(item) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "entry";
    el.style.setProperty("--spine", item.cover_color);
    el.setAttribute("aria-pressed", String(state.activeId === item.id));
    const meta = M.BUCKET_META[item.bucket];
    const conns = (corpus.connsByItem.get(item.id) || []).length;
    el.innerHTML =
      `<div class="entry__top"><span>${meta.label}</span><span class="entry__year">${item.year_first}</span></div>` +
      `<h3 class="entry__name"></h3>` +
      `<div class="entry__author"></div>` +
      `<div class="entry__meta">` +
        `<span>${M.TYPE_LABEL[item.type] || item.type}</span>` +
        `<span>${item.pages_approx} стр.</span>` +
        (item.significance === 5 ? `<span class="entry__star">★</span>` : "") +
        (conns ? `<span>связей: ${conns}</span>` : "") +
      `</div>`;
    // названия и авторы — из данных, вставляем текстом, не разметкой
    el.querySelector(".entry__name").textContent = item.title;
    el.querySelector(".entry__author").textContent = item.author || "";
    el.addEventListener("click", () => {
      state.activeId = item.id;
      card.show(item);
      refreshPressed();
    });
    return el;
  }

  function refreshPressed() {
    for (const el of entriesEl.querySelectorAll(".entry")) {
      el.setAttribute("aria-pressed", String(el.dataset.id === state.activeId));
    }
  }

  function refresh() {
    // чипы перерисовываем целиком — состояние живёт в state, не в DOM
    for (const id of ["f-bucket", "f-type", "f-lang", "f-sort"]) $(id).innerHTML = "";
    buildFilters();
    buildAlpha();

    const list = visible();
    $("count").textContent = `${list.length} из ${corpus.items.length}`;
    entriesEl.innerHTML = "";
    if (!list.length) {
      const p = document.createElement("div");
      p.className = "empty";
      p.textContent = "ничего не нашлось — снимите часть фильтров";
      entriesEl.appendChild(p);
      return;
    }
    let lastLetter = null;
    for (const item of list) {
      if (state.sort === "alpha") {
        const l = firstLetter(item);
        if (l !== lastLetter) {
          const h = document.createElement("div");
          h.className = "alpha-head";
          h.textContent = l;
          entriesEl.appendChild(h);
          lastLetter = l;
        }
      }
      const node = entryNode(item);
      node.dataset.id = item.id;
      entriesEl.appendChild(node);
    }
    entriesEl.scrollTop = 0;
  }

  async function start() {
    corpus = await M.loadCorpus();
    entriesEl = $("catalog");
    card = M.Card($("card"), corpus);
    card.onClose = () => { state.activeId = null; refreshPressed(); };
    // масштаб обвязки под кадр — канвы здесь нет, считаем от сцены
    const applyZoom = () => {
      document.documentElement.style.setProperty(
        "--zoom", document.querySelector(".stage").getBoundingClientRect().width / M.DESIGN_W);
    };
    applyZoom();
    window.addEventListener("resize", applyZoom);
    refresh();
  }

  start();
})();
