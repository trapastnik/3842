/* Сцена «География изданий» — порт прототипа mtk40-geography.
 *
 * Где книга вышла впервые. Поле place_first — свободный текст, нормализация
 * в города и координаты живёт в assets/mtk40/lib/places.js (там же правила).
 *
 * Проекция — общий канон проекта, MtkProjection.WinkelTripel (COORDINATION,
 * 2026-07-08): своей математики здесь нет, аспект берётся из WT.ASPECT.
 *
 * Уровни детализации — по образцу mtk41-map-hier: при увеличении кружок
 * распадается на подкружки, между уровнями кроссфейд, тап на кружок с N>1 —
 * провал внутрь с доводкой камеры. Лестница своя: города → оси корпуса
 * внутри города → отдельные книги.
 */
import { CORPUS_URL, M, DESIGN_W, createCanvas, corpusOf, createCard, createHint, unit, chip,
         normQuery, matchQuery } from "./shared.js?v=44";

const P = () => window.MTK40_PLACES;
const WT = () => window.MtkProjection.WinkelTripel;

const WORLD_W = 2000;
const FIT_PAD = 0.14;
const MIN_K = 0.4, MAX_K = 14;
const FADE_HALF = 0.18;

export const geographyScene = {
  id: "geography",
  title: { ru: "География", en: "Geography", zh: "出版地理" },
  keepAlive: true,

  preload: {
    data: {
      corpus: CORPUS_URL,
      world: "../data/ne_110m_countries.geojson",
    },
    /* Вес указан явно: "1em '20 Kopeek'" грузит только 400, а на канве
     * половина подписей — 600. Канва загрузку шрифта не запускает вовсе
     * (ctx.font молча берёт то, что уже загружено), поэтому жирное
     * начертание надо просить прероллом. */
    fonts: ["1em 'Nolde'", "400 1em '20 Kopeek'", "600 1em '20 Kopeek'"],
  },

  settings: [
    { key: "thrAxis", type: "range", min: 1.4, max: 4, step: 0.1, unit: "×", default: 2.3,
      label: { ru: "Порог: города → оси", en: "Threshold: cities → axes", zh: "阈值：城市 → 轴" } },
    { key: "thrBook", type: "range", min: 3, max: 10, step: 0.1, unit: "×", default: 5.5,
      label: { ru: "Порог: оси → книги", en: "Threshold: axes → books", zh: "阈值：轴 → 书籍" } },
    { key: "dotScale", type: "range", min: 0.6, max: 1.8, step: 0.05, unit: "×", default: 1,
      label: { ru: "Размер кружков", en: "Circle size", zh: "圆点大小" } },
    { key: "showWorld", type: "toggle", default: true,
      label: { ru: "Контуры материков", en: "Continent outlines", zh: "大陆轮廓" } },
  ],

  /* Финдер здесь объявлен потому, что поиск осмыслен: 99 книг в 16 городах,
   * и «где вышел Капитал» — вопрос, на который карта отвечает лучше списка.
   * Ось переехала в отбор; чипы остались на сцене ЯРЛЫКАМИ.
   * Геттер, а не статика: подписи из словаря, панель перечитывает их сама. */
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
      ],
    };
  },

  /* Отбор целиком, при любом изменении. Кружки пересобираются на ближайшем
   * кадре сами (buildClusters читает shownItems), поэтому здесь достаточно
   * обновить ярлыки и открытую карточку города. */
  applyFinder({ query, filters }) {
    this.find = { query: query || "", filters: filters || {} };
    this.paintTools();
    if (this.activeCity) this.showCity(this.activeCity, this.activeLane);
    const shown = this.cities.reduce((a, c) => a + this.shownItems(c).length, 0);
    return { shown, total: this.corpus.items.length };
  },

  mount(el, ctx) {
    this.app = ctx.app;
    this.corpus = corpusOf(ctx.data.corpus);
    this.values = { thrAxis: 2.3, thrBook: 5.5, dotScale: 1, showWorld: true };

    /* Отбор держит ядро; до первого applyFinder (ядро зовёт его сразу после
     * mount) — пусто. Своего множества букетов у сцены больше нет. */
    this.find = { query: "", filters: {} };
    this.activeCity = null;
    this.activeLane = null;
    this.selectedId = null;
    this.k = 1; this.k0 = 1; this.ox = 0; this.oy = 0;
    this.fitted = false;
    this.drag = null;
    this.pointers = new Map();
    this.pinch = null;
    this.anim = null;
    this.worldPaths = [];
    this.lastClusters = [];

    el.classList.add("m40-scene");
    this.root = el;

    this.groupByCity();
    this.buildWorldPaths(ctx.data.world);

    this.cv = createCanvas(el, {
      onSize: () => { this.fitted = false; this.fitToCities(); },
      onFrame: () => this.frame(),
    });
    this.card = createCard(el, this.corpus, this.app);
    this.card.onClose = () => { this.selectedId = null; };

    this.tools = document.createElement("div");
    this.tools.className = "m40-chips m40-tools";
    el.appendChild(this.tools);

    this.cityEl = document.createElement("aside");
    this.cityEl.className = "m40-city kiosk-scroll";
    this.cityEl.hidden = true;
    this.cityEl.innerHTML =
      '<button type="button" class="m40-city__close"></button>' +
      '<div class="m40-city__name"></div>' +
      '<div class="m40-city__sub"></div>' +
      '<ul class="m40-city__list"></ul>';
    this.cityEl.querySelector(".m40-city__close").addEventListener("click", () => {
      this.activeCity = null; this.cityEl.hidden = true;
    });
    el.appendChild(this.cityEl);

    this.homeBtn = document.createElement("button");
    this.homeBtn.type = "button";
    this.homeBtn.className = "m40-home";
    this.homeBtn.hidden = true;
    this.homeBtn.addEventListener("click", (ev) => { ev.stopPropagation(); this.goHome(); });
    el.appendChild(this.homeBtn);

    const c = this.cv.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });

    this.hint = createHint(this.cv.plot, this.app, "pinch", "hint.zoom");

    this.setLang();
    this.cv.observe();
    this.cv.sync();
  },

  unmount() {
    const c = this.cv && this.cv.canvas;
    if (c) {
      c.removeEventListener("pointerdown", this.onDown);
      c.removeEventListener("pointermove", this.onMove);
      c.removeEventListener("pointerup", this.onUp);
      c.removeEventListener("pointercancel", this.onUp);
      c.removeEventListener("wheel", this.onWheel);
    }
    if (this.cv) this.cv.destroy();
    if (this.card) this.card.el.remove();
    for (const n of [this.tools, this.cityEl, this.homeBtn]) if (n) n.remove();
    if (this.hint) this.hint.destroy();
    this.cv = this.card = this.tools = this.cityEl = this.homeBtn = this.hint = null;
    this.root.classList.remove("m40-scene");
  },

  pause() { if (this.cv) this.cv.stop(); },
  resume() { if (this.cv) this.cv.start(); },

  /* Отбор гасит ядро — до этого вызова. Здесь только своё: камера,
   * открытый город, карточка. */
  reset() {
    this.activeCity = null;
    this.activeLane = null;
    this.selectedId = null;
    if (this.cityEl) this.cityEl.hidden = true;
    if (this.card) this.card.hide();
    this.anim = null;
    this.fitted = false;
    this.fitToCities();
    this.paintTools();
  },

  setLang() {
    if (this.card) this.card.setLang();
    if (this.homeBtn) this.homeBtn.textContent = this.app.t("geography.home");
    if (this.cityEl) this.cityEl.querySelector(".m40-city__close").textContent = "✕";
    this.paintTools();
    if (this.hint) this.hint.setLang();
    if (this.activeCity) this.showCity(this.activeCity, this.activeLane);
  },

  setA11y() { this.fitted = false; this.fitToCities(); },

  applySettings(v) { this.values = v; },

  healthcheck() {
    /* Несмонтированная сцена — не авария, а её штатное состояние до
     * первого показа (конвенция МТК 41). ok:false здесь давал стенду
     * ложные аварии по всем сценам, кроме активной. */
    if (!this.cv) return { ok: true, detail: "не смонтирована" };
    const buf = this.cv.bufferOk();
    if (!buf.ok) return { ok: false, detail: "буфер канвы " + buf.detail };
    const placed = this.cities.reduce((a, c) => a + c.items.length, 0);
    if (!this.cities.length) return { ok: false, detail: "ни один город не распознан" };
    if (placed < this.corpus.items.length) {
      /* Нормализация мест покрывает 99 из 99; расхождение означает, что
       * данные разъехались с правилами в places.js. */
      return { ok: false, detail: "на карте " + placed + " из " + this.corpus.items.length + " книг" };
    }
    if (!this.worldPaths.length) return { ok: false, detail: "контуры материков не разобраны" };
    if (!this.cv.w) return { ok: true, detail: "слой скрыт; городов " + this.cities.length };
    if (!this.lastClusters.length) {
      const probe = this.materialize(this.buildClusters(this.levelFor(this.zf())));
      if (probe.length) return { ok: true, detail: "кадра ещё не было; кружков " + probe.length };
      /* Пустой кадр бывает ЗАКОННЫМ: отбор мог обнулить все города в поле
       * зрения, а камеру — увести на океан (кламп держит четверть габарита,
       * но не гарантирует кружок в кадре). Авария — только если отбор снят
       * и камера в позе «вся карта»: тогда пусто по-настоящему (GRABLI,
       * «легально пустые состояния — не авария»). Критерии спрашиваем у
       * ядра: своих у сцены нет, и запрос обнуляет карту не хуже оси. */
      const f = this.find.filters || {};
      if (f.bucket || this.find.query) {
        return { ok: true, detail: "в кадре пусто из-за отбора — это законно" };
      }
      if (this.movedFromFit()) {
        return { ok: true, detail: "в кадре пусто: камера уведена от позы «вся карта»" };
      }
      return { ok: false, detail: "в кадре нет кружков при снятых фильтрах" };
    }
    return {
      ok: true,
      detail: "городов " + this.cities.length + ", кружков в кадре " + this.lastClusters.length,
    };
  },

  // ---------- данные ----------
  groupByCity() {
    const wt = WT();
    const worldH = WORLD_W / wt.ASPECT;
    const map = new Map();
    for (const item of this.corpus.items) {
      const place = P().of(item.place_first);
      if (!place) continue;
      if (!map.has(place.label)) {
        const w = wt.project(place.lat, place.lng, WORLD_W, worldH);
        map.set(place.label, {
          label: place.label,
          short: place.label.split(" · ")[0],
          wx: w.x, wy: w.y, items: [],
        });
      }
      map.get(place.label).items.push(item);
    }
    this.cities = [...map.values()].sort((a, b) => b.items.length - a.items.length);
  },

  buildWorldPaths(gj) {
    const wt = WT();
    const worldH = WORLD_W / wt.ASPECT;
    const ring = (coords) => {
      const p = new Path2D();
      for (let i = 0; i < coords.length; i++) {
        const [lng, lat] = coords[i];
        const w = wt.project(lat, lng, WORLD_W, worldH);
        if (i === 0) p.moveTo(w.x, w.y); else p.lineTo(w.x, w.y);
      }
      p.closePath();
      return p;
    };
    for (const f of (gj && gj.features) || []) {
      const g = f.geometry;
      if (!g) continue;
      const polys = g.type === "Polygon" ? [g.coordinates]
        : g.type === "MultiPolygon" ? g.coordinates : [];
      for (const poly of polys) for (const r of poly) this.worldPaths.push(ring(r));
    }
  },

  // ---------- обвязка ----------
  get s() { return unit(this.app, this.cv ? this.cv.w : DESIGN_W); },
  get W() { return this.cv ? this.cv.w : 0; },
  get H() { return this.cv ? this.cv.h : 0; },

  /* Чипы оси — ЯРЛЫКИ финдера: тап шлёт патч в ядро, повторный по выбранному
   * шлёт null. Своего состояния не держат, нажатое читается из ядра.
   * Счёт фасетный — «сколько останется, если выбрать эту ось»: с учётом
   * запроса, но без учёта самой оси. */
  paintTools() {
    if (!this.tools) return;
    const cur = (this.find.filters || {}).bucket || null;
    this.tools.innerHTML = "";
    for (const b of M.BUCKETS) {
      this.tools.appendChild(chip(this.app.t("bucket." + b), {
        count: this.facet(b),
        accent: M.BUCKET_META[b].accent,
        pressed: cur === b,
        onClick: () => this.app.setFinder({ filters: { bucket: cur === b ? null : b } }),
      }));
    }
  },

  facet(bucket) {
    const nq = normQuery(this.find.query);
    return this.corpus.items.filter((i) =>
      i.bucket === bucket && matchQuery(i, ["title", "title_spine", "author", "place_first"], nq)).length;
  },

  fitToCities() {
    if (!this.cv || !this.cv.w || !this.cities.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of this.cities) {
      x0 = Math.min(x0, c.wx); x1 = Math.max(x1, c.wx);
      y0 = Math.min(y0, c.wy); y1 = Math.max(y1, c.wy);
    }
    const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
    const availW = this.W * (1 - 2 * FIT_PAD);
    const availH = this.H * (1 - 2 * FIT_PAD) - 60 * this.s;
    this.k = Math.min(availW / bw, availH / bh);
    this.k0 = this.k;
    this.ox = this.W / 2 - ((x0 + x1) / 2) * this.k;
    this.oy = (this.H / 2 + 20 * this.s) - ((y0 + y1) / 2) * this.k;
    /* Поза «вся карта» — точка отсчёта для кнопки «домой»: уехать от неё
     * можно и без масштабирования. */
    this.fitOx = this.ox;
    this.fitOy = this.oy;
    this.fitted = true;
  },

  toScreen(wx, wy) { return { x: wx * this.k + this.ox, y: wy * this.k + this.oy }; },

  /* Габарит городов в мировых координатах — считается один раз, по нему
   * держится камера. */
  bbox() {
    if (this._bbox) return this._bbox;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of this.cities) {
      x0 = Math.min(x0, c.wx); x1 = Math.max(x1, c.wx);
      y0 = Math.min(y0, c.wy); y1 = Math.max(y1, c.wy);
    }
    this._bbox = { x0, y0, x1, y1 };
    return this._bbox;
  },

  /* Без клампа карту можно утащить за кадр целиком: кнопка «домой» появляется
   * только при zf > 1.05, и на общем плане посетитель оставался бы с пустым
   * экраном до простоя (а healthcheck давал ложную тревогу). Держим габарит
   * городов так, чтобы в кадре всегда оставалась хотя бы четверть его. */
  clampCamera() {
    if (!this.cities.length || !this.W) return;
    const b = this.bbox();
    const mx = this.W * 0.25, my = this.H * 0.25;
    const x0 = b.x0 * this.k + this.ox, x1 = b.x1 * this.k + this.ox;
    const y0 = b.y0 * this.k + this.oy, y1 = b.y1 * this.k + this.oy;
    if (x1 < mx) this.ox += mx - x1;
    else if (x0 > this.W - mx) this.ox -= x0 - (this.W - mx);
    if (y1 < my) this.oy += my - y1;
    else if (y0 > this.H - my) this.oy -= y0 - (this.H - my);
  },
  zf() { return this.k / (this.k0 || 1); },
  thr(key, def) { const v = this.values[key]; return typeof v === "number" ? v : def; },
  levelFor(zf) {
    return zf < this.thr("thrAxis", 2.3) ? "CITY"
      : zf < this.thr("thrBook", 5.5) ? "AXIS" : "BOOK";
  },

  /* Отбор → поиск, порядок канонический. Оба критерия живут в ядре. */
  passes(item) {
    const f = this.find.filters || {};
    if (f.bucket && item.bucket !== f.bucket) return false;
    return matchQuery(item, ["title", "title_spine", "author", "place_first"],
      normQuery(this.find.query));
  },
  shownItems(city) {
    return city.items.filter((i) => this.passes(i)).sort((a, b) => a.year_first - b.year_first);
  },

  // ---------- кластеры ----------
  buildClusters(level) {
    const out = [];
    /* За кадром кластеры не строим: их поводки иначе тянутся через всю карту
     * от невидимых якорей. Запас — на расталкивание у самой кромки. */
    const mx = this.W * 0.1, my = this.H * 0.1;
    for (const city of this.cities) {
      const items = this.shownItems(city);
      if (!items.length) continue;
      const anchor = this.toScreen(city.wx, city.wy);
      if (anchor.x < -mx || anchor.x > this.W + mx ||
          anchor.y < -my || anchor.y > this.H + my) continue;
      const add = (o) => out.push(Object.assign({
        city, ax: anchor.x, ay: anchor.y, x: anchor.x, y: anchor.y,
      }, o));

      const before = out.length;
      if (level === "CITY") {
        add({ items, count: items.length, label: city.short, kind: "city" });
      } else if (level === "AXIS") {
        for (const b of M.BUCKETS) {
          const sub = items.filter((i) => i.bucket === b);
          if (!sub.length) continue;
          add({ items: sub, count: sub.length, label: this.app.t("bucket." + b), kind: "axis", lane: b });
        }
      } else {
        for (const it of items) add({ items: [it], count: 1, label: it.title, kind: "book", book: it });
      }

      /* Подкружки города рождаются в одной точке. Расталкивание такой
       * вырожденный случай разводит не всегда: у Москвы «ИМ» и «ЧИТАЛ»
       * оставались под кольцом «О НЁМ». Поэтому сначала раскладываем их по
       * кольцу вокруг якоря — детерминированно, а релаксация лишь доводит. */
      const sibs = out.slice(before);
      if (sibs.length > 1) {
        for (const c of sibs) c.r = this.radiusFor(c.count);
        const maxR = Math.max(...sibs.map((c) => c.r));
        const ring = maxR * (sibs.length > 4 ? 1.9 : 1.5);
        sibs.forEach((c, i) => {
          const a = -Math.PI / 2 + (i / sibs.length) * Math.PI * 2;
          c.x = c.ax + Math.cos(a) * ring;
          c.y = c.ay + Math.sin(a) * ring;
        });
      }
    }
    return out;
  },

  radiusFor(count) { return (7 + 4.6 * Math.sqrt(count)) * this.s * this.thr("dotScale", 1); },

  materialize(clusters) {
    for (const c of clusters) c.r = this.radiusFor(c.count);
    for (let iter = 0; iter < 60; iter++) {
      let moved = 0;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const a = clusters[i], b = clusters[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          if (d < 0.01) {   // строго совпали — разводим по кругу
            const ang = (i * 2.399 + j) % (Math.PI * 2);
            dx = Math.cos(ang); dy = Math.sin(ang); d = 0.01;
          }
          const min = a.r + b.r + 3 * this.s;
          if (d < min) {
            const push = (min - d) / 2;
            const ux = dx / d, uy = dy / d;
            a.x -= ux * push; a.y -= uy * push;
            b.x += ux * push; b.y += uy * push;
            moved++;
          }
        }
      }
      if (!moved) break;
    }
    return clusters;
  },

  // ---------- ввод ----------
  onDown: function (ev) {
    this.pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
    if (this.pointers.size === 2) { this.startPinch(); return; }
    this.drag = { x: ev.offsetX, y: ev.offsetY, moved: false };
    this.anim = null;
    try { this.cv.canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  },
  startPinch() {
    const [a, b] = [...this.pointers.values()];
    this.pinch = {
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, k: this.k,
      cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
    };
    this.pinch.wx = (this.pinch.cx - this.ox) / this.k;
    this.pinch.wy = (this.pinch.cy - this.oy) / this.k;
    this.drag = null;
    this.anim = null;
  },
  onMove: function (ev) {
    if (this.pointers.has(ev.pointerId)) this.pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      this.k = Math.max(MIN_K, Math.min(MAX_K, this.pinch.k * (d / this.pinch.dist)));
      this.ox = this.pinch.cx - this.pinch.wx * this.k;
      this.oy = this.pinch.cy - this.pinch.wy * this.k;
      this.clampCamera();
      return;
    }
    if (!this.drag) return;
    const dx = ev.offsetX - this.drag.x;
    const dy = ev.offsetY - this.drag.y;
    if (Math.hypot(dx, dy) > 6 * this.s) this.drag.moved = true;
    if (!this.drag.moved) return;
    this.ox += dx; this.oy += dy;
    this.clampCamera();
    this.drag.x = ev.offsetX; this.drag.y = ev.offsetY;
  },
  onUp: function (ev) {
    this.pointers.delete(ev.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.drag && !this.drag.moved && this.pointers.size === 0) {
      const hit = this.hitTest(ev.offsetX, ev.offsetY);
      if (hit && hit.count > 1) {
        this.drilldown(hit);
        this.showCity(hit.city, hit.lane || null);
      } else if (hit) {
        this.selectedId = hit.items[0].id;
        this.card.show(hit.items[0]);
      } else {
        this.activeCity = null;
        this.cityEl.hidden = true;
        this.card.hide();
        this.selectedId = null;
      }
    }
    this.drag = null;
  },
  onWheel: function (ev) {
    ev.preventDefault();
    const px = ev.offsetX, py = ev.offsetY;
    const wx = (px - this.ox) / this.k, wy = (py - this.oy) / this.k;
    const next = Math.max(MIN_K, Math.min(MAX_K, this.k * Math.exp(-ev.deltaY * 0.0015)));
    if (next === this.k) return;
    this.k = next;
    this.ox = px - wx * this.k;
    this.oy = py - wy * this.k;
    this.clampCamera();
    this.anim = null;
  },

  hitTest(x, y) {
    let best = null, bestD = Infinity;
    for (const c of this.lastClusters) {
      const d = Math.hypot(x - c.x, y - c.y);
      const hitR = Math.max(c.r + 8 * this.s, 22 * this.s);
      if (d <= hitR && d < bestD) { bestD = d; best = c; }
    }
    return best;
  },

  // ---------- камера ----------
  animateTo(k, ox, oy, dur) {
    this.anim = { k0: this.k, k1: k, ox0: this.ox, ox1: ox, oy0: this.oy, oy1: oy,
                  t0: performance.now(), dur: dur || 420 };
  },
  updateAnim() {
    if (!this.anim) return;
    const a = this.anim;
    const t = Math.min(1, (performance.now() - a.t0) / a.dur);
    const e = 1 - Math.pow(1 - t, 3);
    this.k = a.k0 + (a.k1 - a.k0) * e;
    this.ox = a.ox0 + (a.ox1 - a.ox0) * e;
    this.oy = a.oy0 + (a.oy1 - a.oy0) * e;
    this.clampCamera();
    if (t >= 1) this.anim = null;
  },
  drilldown(cluster) {
    const lv = this.levelFor(this.zf());
    let targetZf;
    if (lv === "CITY") targetZf = this.thr("thrAxis", 2.3) + 0.2;
    else if (lv === "AXIS") targetZf = this.thr("thrBook", 5.5) + 0.2;
    else return;
    const k = Math.max(MIN_K, Math.min(MAX_K, this.k0 * targetZf));
    /* Держим точку города на месте: она и есть смысловой центр провала. */
    const wx = (cluster.ax - this.ox) / this.k;
    const wy = (cluster.ay - this.oy) / this.k;
    this.animateTo(k, this.W / 2 - wx * k, this.H * 0.54 - wy * k, 420);
  },
  goHome() {
    this.activeCity = null;
    if (this.cityEl) this.cityEl.hidden = true;
    this.card.hide();
    this.selectedId = null;
    const kFrom = this.k, oxFrom = this.ox, oyFrom = this.oy;
    this.fitToCities();
    const kTo = this.k, oxTo = this.ox, oyTo = this.oy;
    this.k = kFrom; this.ox = oxFrom; this.oy = oyFrom;
    this.animateTo(kTo, oxTo, oyTo, 500);
  },

  // ---------- панель города ----------
  showCity(city, lane) {
    this.activeCity = city;
    this.activeLane = lane || null;
    let list = this.shownItems(city);
    if (lane) list = list.filter((i) => i.bucket === lane);
    this.cityEl.querySelector(".m40-city__name").textContent = city.label;
    const per = M.BUCKETS.map((b) =>
      `${this.app.t("bucket." + b)} ${city.items.filter((i) => i.bucket === b).length}`).join(" · ");
    this.cityEl.querySelector(".m40-city__sub").textContent =
      this.app.t("geography.city.count", { shown: list.length, total: city.items.length }) + " · " + per;

    const ul = this.cityEl.querySelector(".m40-city__list");
    ul.innerHTML = "";
    for (const item of list) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.style.setProperty("--m40-spine", item.cover_color);
      const yr = document.createElement("span");
      yr.className = "m40-city__yr";
      yr.textContent = item.year_first;
      const t = document.createElement("span");
      t.textContent = item.title;
      b.append(yr, t);
      b.addEventListener("click", () => { this.selectedId = item.id; this.card.show(item); });
      li.appendChild(b);
      ul.appendChild(li);
    }
    this.cityEl.hidden = false;
    this.cityEl.scrollTop = 0;
  },

  // ---------- кадр ----------
  /* Кнопка «домой» пряталась при zf ≤ 1.05, но сдвинуть карту можно и на
   * общем плане: кламп держит в кадре четверть габарита, то есть до двух
   * третей городов посетитель всё равно уводит за край — и вернуться нечем
   * до самого простоя. Поэтому смотрим и на масштаб, и на сдвиг от позы
   * «вся карта». */
  movedFromFit() {
    if (this.zf() > 1.05) return true;
    if (this.fitOx == null || !this.W) return false;
    return Math.abs(this.ox - this.fitOx) > this.W * 0.08 ||
           Math.abs(this.oy - this.fitOy) > this.H * 0.08;
  },

  frame() {
    if (!this.fitted) this.fitToCities();   // догоняем, если кадр появился позже
    this.updateAnim();
    this.render();
    if (this.homeBtn) this.homeBtn.hidden = !this.movedFromFit();
  },

  render() {
    const ctx = this.cv.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    if (!this.cities.length || !this.W) return;

    if (this.values.showWorld !== false && this.worldPaths.length) {
      ctx.save();
      /* Трансформ канвы уже несёт масштаб буфера — камеру домножаем, а не
       * задаём setTransform'ом, иначе слетит пересчёт CSS-пикселей. */
      ctx.transform(this.k, 0, 0, this.k, this.ox, this.oy);
      ctx.lineWidth = Math.max(0.4, 0.9 / this.k) * this.s;
      ctx.strokeStyle = M.rgba(M.COLORS.paper, 0.17);
      ctx.fillStyle = M.rgba(M.COLORS.graphite, 0.3);
      for (const p of this.worldPaths) { ctx.fill(p); ctx.stroke(p); }
      ctx.restore();
    }

    const zf = this.zf();
    const level = this.levelFor(zf);
    let band = null;
    for (const b of [{ z: this.thr("thrAxis", 2.3), lo: "CITY", hi: "AXIS" },
                     { z: this.thr("thrBook", 5.5), lo: "AXIS", hi: "BOOK" }]) {
      if (Math.abs(zf - b.z) < FADE_HALF) { band = b; break; }
    }
    if (!band) {
      const cls = this.materialize(this.buildClusters(level));
      this.drawLevel(cls, 1, level);
      this.lastClusters = cls;
    } else {
      const t = (zf - (band.z - FADE_HALF)) / (2 * FADE_HALF);
      const lo = this.materialize(this.buildClusters(band.lo));
      const hi = this.materialize(this.buildClusters(band.hi));
      this.drawLevel(lo, 1 - t, band.lo);
      this.drawLevel(hi, t, band.hi);
      this.lastClusters = t >= 0.5 ? hi : lo;
    }
    this.drawHud(level);
  },

  drawLevel(clusters, alpha, level) {
    const ctx = this.cv.ctx;
    const s = this.s;
    ctx.save();
    ctx.globalAlpha = alpha;

    /* Поводок от настоящей точки города к сдвинутому кружку. Длинный поводок
     * через полкарты читается как связь, а не как сдвиг — такие не рисуем. */
    ctx.strokeStyle = M.rgba(M.COLORS.paper, 0.25);
    ctx.lineWidth = 1 * s;
    for (const c of clusters) {
      const d = Math.hypot(c.x - c.ax, c.y - c.ay);
      if (d > c.r * 0.9 && d < 170 * s) {
        ctx.beginPath();
        ctx.moveTo(c.ax, c.ay);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
      }
    }
    if (level !== "CITY") {
      ctx.fillStyle = M.rgba(M.COLORS.paper, 0.35);
      for (const c of clusters) {
        ctx.beginPath();
        ctx.arc(c.ax, c.ay, 2 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const c of clusters) this.drawCluster(c);

    /* Подписи: крупные забирают место первыми, налезающие отбрасываются. */
    const taken = [];
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const c of clusters.slice().sort((a, b) => b.r - a.r)) {
      const fs = (c.kind === "book" ? 11 : 12) * s;
      ctx.font = `400 ${fs}px "20 Kopeek", monospace`;
      const lines = M.wrapLines(ctx, c.label, (c.kind === "book" ? 118 : 150) * s,
        c.kind === "book" ? 2 : 1);
      if (!lines.length) continue;
      const w = Math.max(...lines.map((t) => ctx.measureText(t).width));
      const y = c.y + c.r + 5 * s;
      const box = [c.x - w / 2 - 3 * s, y, c.x + w / 2 + 3 * s, y + fs * 1.2 * lines.length];
      if (taken.some((t) => !(box[2] < t[0] || box[0] > t[2] || box[3] < t[1] || box[1] > t[3]))) continue;
      taken.push(box);
      for (let i = 0; i < lines.length; i++) {
        const ly = y + i * fs * 1.18;
        ctx.fillStyle = M.rgba(M.COLORS.ink, 0.75);
        ctx.fillText(lines[i], c.x + 1 * s, ly + 1 * s);
        ctx.fillStyle = this.isSelected(c) ? M.COLORS.brass : M.rgba(M.COLORS.paper, 0.8);
        ctx.fillText(lines[i], c.x, ly);
      }
    }
    ctx.restore();
  },

  isSelected(c) {
    if (c.kind === "book") return c.book.id === this.selectedId;
    return this.activeCity === c.city;
  },

  drawCluster(c) {
    const ctx = this.cv.ctx;
    const s = this.s;
    const sel = this.isSelected(c);

    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = M.rgba(M.COLORS.ink, 0.72);
    ctx.fill();

    const ringW = Math.max(4 * s, c.r * 0.34);
    if (c.kind === "city") {
      /* Кольцо-состав: сразу видно, чем город занят. */
      let a0 = -Math.PI / 2;
      for (const b of M.BUCKETS) {
        const n = c.items.filter((i) => i.bucket === b).length;
        if (!n) continue;
        const a1 = a0 + (n / c.count) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r - ringW / 2, a0, a1);
        ctx.strokeStyle = M.BUCKET_META[b].accent;
        ctx.lineWidth = ringW;
        ctx.stroke();
        a0 = a1;
      }
    } else {
      const color = c.kind === "axis" ? M.BUCKET_META[c.lane].accent : c.book.cover_color;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r - ringW / 2, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = ringW;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.strokeStyle = sel ? M.COLORS.brass : M.rgba(M.COLORS.paper, 0.3);
    ctx.lineWidth = (sel ? 2.4 : 1) * s;
    ctx.stroke();

    if (c.count > 1) {
      ctx.fillStyle = M.rgba(M.COLORS.paper, 0.92);
      ctx.font = `600 ${Math.max(11 * s, c.r * 0.52)}px "20 Kopeek", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(c.count), c.x, c.y);
    }
  },

  drawHud(level) {
    const ctx = this.cv.ctx;
    const s = this.s;
    const human = this.app.t(level === "CITY" ? "geography.level.city"
      : level === "AXIS" ? "geography.level.axis" : "geography.level.book");
    ctx.save();
    ctx.font = `400 ${10 * s}px "20 Kopeek", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = M.rgba(M.COLORS.brass, this.app.a11y ? 0.95 : 0.5);
    ctx.fillText(this.app.t("geography.hud", { level: human, zoom: this.zf().toFixed(2) }),
      this.W - 14 * s, this.H - 12 * s);
    ctx.restore();
  },
};

for (const k of ["onDown", "onMove", "onUp", "onWheel"]) {
  geographyScene[k] = geographyScene[k].bind(geographyScene);
}
