/* Сцена «Хронология» — порт прототипа mtk40-timeline.
 *
 * Уровни детализации по масштабу: ДЕКАДЫ → ГОДЫ → КНИГИ, с кроссфейдом на
 * границе. Три дорожки — три оси корпуса (им · читал · о нём). Тап на
 * кластер — провал на уровень вниз, тап на пустоту — шаг назад.
 *
 * Отличия от прототипа:
 *  - рисуем в CSS-пикселях (dpr спрятан в трансформе канвы), поэтому
 *    указатель берётся как есть, без умножений;
 *  - подписи эпох, исторических дат и уровней идут через словарь ядра;
 *  - двенадцать тюнингов прототипа объявлены схемой settings[] — панель их
 *    рисует и хранит сама, sessionStorage больше не нужен.
 */
import { M, DESIGN_W, createCanvas, corpusOf, createCard, unit } from "./shared.js?v=16";

const COLORS = M.COLORS;
const BUCKET_META = M.BUCKET_META;
const CONN_STYLE = M.CONN_STYLE;
const rgba = M.rgba;

/* Сверху вниз: середина — то, что он читал; из неё растёт верх, на неё
 * откликается низ. */
const LANES = ["by-lenin", "in-library", "about-lenin"];

/* Ось покрывает 1800–2025: в неё попадает 98 книг из 99. Аристотель (−350)
 * живёт в «кармане» слева за разрывом оси — линейная шкала от античности
 * расплющила бы весь XIX–XX век. */
const AXIS_MIN = 1800;
const AXIS_MAX = 2025;
const TOTAL_YEARS = AXIS_MAX - AXIS_MIN;

/* rank — приоритет подписи при тесноте: на общем плане в кадр влезает
 * пять-шесть, и выбирает значимость, а не порядок в массиве. Штрихи
 * рисуются для всех дат независимо от подписи. */
const TICKS = [
  { year: 1917, key: "october",    rank: 1 },
  { year: 1870, key: "birth",      rank: 2 },
  { year: 1924, key: "death",      rank: 3 },
  { year: 1848, key: "manifesto",  rank: 4 },
  { year: 1956, key: "congress20", rank: 5 },
  { year: 1991, key: "ussr-end",   rank: 6 },
  { year: 1895, key: "union",      rank: 7 },
  { year: 1958, key: "pss5",       rank: 8 },
  { year: 1903, key: "congress2",  rank: 8 },
  { year: 1914, key: "ww1",        rank: 9 },
  { year: 2017, key: "oct100",     rank: 10 },
];

/* Границы зон — НЕ вторая сетка: каждая совпадает с датой из TICKS, то есть
 * зона начинается ровно там, где стоит её штрих. Собственной линии у границы
 * поэтому нет — её роль играет пунктир даты. */
const PERIODS = [
  { from: -1000, to: 1870, key: "pre" },
  { from: 1870, to: 1895, key: "premarx" },
  { from: 1895, to: 1917, key: "underground" },
  { from: 1917, to: 1924, key: "power" },
  { from: 1924, to: 1956, key: "canon" },
  { from: 1956, to: 1991, key: "latesoviet" },
  { from: 1991, to: 3000, key: "post" },
];

/* Ширина подписи книги и предел строк: длинное название должно занять угол
 * кадра, а не треть его ширины. */
const LABEL_MAX_W = 132;      // дизайн-px
const LABEL_MAX_LINES = 3;

/* Слева отступ шире правого: в него уходят подписи дорожек и карман с
 * книгами вне шкалы. */
const PLOT_L = 0.19;
const PLOT_R = 0.97;

const MIN_ZOOM = 1.0;
const MAX_ZOOM = 30;
const FADE_HALF = 0.15;
const TAP_THRESHOLD = 8;      // дизайн-px

export const timelineScene = {
  id: "timeline",
  title: { ru: "Хронология", en: "Timeline", zh: "年表" },
  keepAlive: true,

  preload: {
    data: { corpus: "../data/mtk40.json" },
    fonts: ["1em 'Nolde'", "1em '20 Kopeek'"],
  },

  /* Двенадцать тюнингов прототипа. Три способа разложить подписи книг: на
   * плотных годах (1917–18) их физически больше, чем места под дорожкой, и
   * вопрос лишь в том, чем платить — отброшенными подписями, вертикальным
   * местом или поводками. */
  settings: [
    { key: "labelMode", type: "select", default: "place",
      label: { ru: "Раскладка подписей", en: "Label layout", zh: "标签排布" },
      options: [
        ["place", { ru: "по месту", en: "in place", zh: "原位" }],
        ["stagger", { ru: "шахматка", en: "staggered", zh: "交错" }],
        ["leader", { ru: "выносные", en: "leader lines", zh: "引出线" }],
      ] },
    { key: "thrDecade", type: "range", min: 1.2, max: 3.5, step: 0.05, unit: "×", default: 1.8,
      label: { ru: "Порог: декады → годы", en: "Threshold: decades → years", zh: "阈值：十年 → 年份" } },
    { key: "thrYear", type: "range", min: 3, max: 14, step: 0.1, unit: "×", default: 6,
      label: { ru: "Порог: годы → книги", en: "Threshold: years → books", zh: "阈值：年份 → 书籍" } },
    { key: "labelScale", type: "range", min: 0.6, max: 1.6, step: 0.05, unit: "×", default: 1,
      label: { ru: "Кегль подписей", en: "Label size", zh: "标签字号" } },
    { key: "dotScale", type: "range", min: 0.6, max: 1.8, step: 0.05, unit: "×", default: 1,
      label: { ru: "Размер кружков", en: "Circle size", zh: "圆点大小" } },
    { key: "laneBand", type: "range", min: 0, max: 2, step: 0.05, unit: "×", default: 1,
      label: { ru: "Яркость дорожек", en: "Lane band", zh: "轨道底色" } },
    { key: "showEvents", type: "toggle", default: true,
      label: { ru: "Исторические даты", en: "Historical dates", zh: "历史日期" } },
    { key: "showPeriods", type: "toggle", default: true,
      label: { ru: "Полосы эпох", en: "Era bands", zh: "时代分区" } },
    { key: "showAxis", type: "toggle", default: true,
      label: { ru: "Ось лет", en: "Year axis", zh: "年份轴" } },
    { key: "showOutliers", type: "toggle", default: true,
      label: { ru: "Карман «вне шкалы»", en: "Off-scale pocket", zh: "超出刻度的书" } },
    { key: "showConns", type: "toggle", default: true,
      label: { ru: "Связи выбранной книги", en: "Links of selected book", zh: "所选书籍的关联" } },
    { key: "crossfade", type: "toggle", default: true,
      label: { ru: "Кроссфейд уровней", en: "Level crossfade", zh: "层级淡入淡出" } },
  ],

  mount(el, ctx) {
    this.ctx = ctx;
    this.app = ctx.app;
    this.corpus = corpusOf(ctx.data.corpus);
    this.items = this.corpus.items;
    this.indexById = new Map(this.items.map((it, n) => [it.id, n]));
    this.values = {};

    this.selectedId = null;
    this.zoom = 1;
    this.yearCenter = (AXIS_MIN + AXIS_MAX) / 2;
    this.velYears = 0;
    this.anim = null;
    this.lastClusters = [];
    this.prevTime = 0;

    this.dragging = false;
    this.didDrag = false;
    this.pointers = new Map();
    this.pinchDist = 0;
    this.pinchZoom = 1;

    el.classList.add("m40-scene");
    this.root = el;

    this.rebuildAggregates();

    this.cv = createCanvas(el, {
      onSize: () => {},           // раскладка целиком считается в кадре
      onFrame: () => this.frame(),
    });
    this.card = createCard(el, this.corpus, this.app);
    this.card.onClose = () => { this.selectedId = null; };

    this.homeBtn = document.createElement("button");
    this.homeBtn.type = "button";
    this.homeBtn.className = "m40-home";
    this.homeBtn.hidden = true;
    this.homeBtn.addEventListener("click", (ev) => { ev.stopPropagation(); this.goHome(); });
    el.appendChild(this.homeBtn);

    const c = this.cv.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove, { passive: true });
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });

    this.setLang(ctx.lang);
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
    if (this.homeBtn) this.homeBtn.remove();
    this.cv = this.card = this.homeBtn = null;
    this.root.classList.remove("m40-scene");
  },

  pause() { if (this.cv) this.cv.stop(); },
  resume() { if (this.cv) this.cv.start(); },

  reset() {
    this.zoom = 1;
    this.yearCenter = (AXIS_MIN + AXIS_MAX) / 2;
    this.velYears = 0;
    this.anim = null;
    this.pointers.clear();
    this.dragging = false;
    this.deselect();
  },

  setLang() {
    if (this.homeBtn) this.homeBtn.textContent = this.app.t("timeline.home");
    if (this.card) this.card.setLang();
  },

  setA11y() { /* размеры считаются от unit(), новый content-scale подхватится сам */ },

  applySettings(v) { this.values = v; },

  /* «Загружено, но пусто» структурные проверки не видят: канва на месте и
   * при пустом корпусе. Живое содержимое здесь — кружки в кадре. */
  healthcheck() {
    if (!this.cv) return { ok: false, detail: "сцена не смонтирована" };
    if (!this.items.length) return { ok: false, detail: "корпус пуст" };
    if (!this.byDecade.size) return { ok: false, detail: "ни одна книга не легла на ось" };
    if (this.lastClusters.length) {
      return {
        ok: true,
        detail: "кружков в кадре " + this.lastClusters.length +
          ", декад " + this.byDecade.size + ", вне шкалы " + this.outliers.length,
      };
    }
    /* Кадра ещё не было: сцену либо не показывали, либо вкладка в фоне и rAF
     * заморожен. Пустой lastClusters тогда говорит о заморозке, а не о пустоте,
     * поэтому проверяем сам путь «данные → геометрия» напрямую. */
    const probe = this.buildClusters(this.levelFor(this.zoom));
    if (!probe.length) return { ok: false, detail: "на текущем масштабе кружков нет" };
    return { ok: true, detail: "кадра ещё не было; на текущем масштабе кружков " + probe.length };
  },

  // ---------- агрегаты ----------
  rebuildAggregates() {
    this.byDecade = new Map();   // "decade:lane" → [idx]
    this.byYear = new Map();     // "year:lane"   → [idx]
    this.outliers = [];          // не влезающие в ось (год < AXIS_MIN)
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const y = it.year_first;
      if (typeof y !== "number") continue;
      if (y < AXIS_MIN) { this.outliers.push(i); continue; }
      const lane = it.bucket;
      if (!BUCKET_META[lane]) continue;
      const dk = Math.floor(y / 10) * 10 + ":" + lane;
      if (!this.byDecade.has(dk)) this.byDecade.set(dk, []);
      this.byDecade.get(dk).push(i);
      const yk = y + ":" + lane;
      if (!this.byYear.has(yk)) this.byYear.set(yk, []);
      this.byYear.get(yk).push(i);
    }
  },

  // ---------- камера ----------
  get s() { return unit(this.app, this.cv ? this.cv.w : DESIGN_W); },
  get W() { return this.cv ? this.cv.w : 0; },
  get H() { return this.cv ? this.cv.h : 0; },

  plotL() { return this.W * PLOT_L; },
  plotR() { return this.W * PLOT_R; },
  plotAnchor() { return (this.plotL() + this.plotR()) / 2; },
  pxPerYear() { return ((this.plotR() - this.plotL()) / TOTAL_YEARS) * this.zoom; },
  yearToX(y) { return this.plotAnchor() + (y - this.yearCenter) * this.pxPerYear(); },
  xToYear(x) { return this.yearCenter + (x - this.plotAnchor()) / this.pxPerYear(); },
  clampZoom(z) { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)); },
  clampCamera() {
    const half = TOTAL_YEARS / (2 * this.zoom);
    const lo = AXIS_MIN + half;
    const hi = AXIS_MAX - half;
    if (hi < lo) this.yearCenter = (AXIS_MIN + AXIS_MAX) / 2;
    else this.yearCenter = Math.max(lo, Math.min(hi, this.yearCenter));
  },

  /* В киоске у сцены нет собственного заголовка — место, которое в прототипе
   * занимала шапка, отдано дорожкам. */
  laneY(lane) {
    const center = this.H * 0.47;
    const spread = this.H * 0.2;
    if (lane === "by-lenin") return center - spread;
    if (lane === "about-lenin") return center + spread;
    return center;
  },
  axisY() { return this.laneY("about-lenin") + this.H * 0.13; },

  thr(key, fallback) {
    const v = this.values[key];
    return typeof v === "number" ? v : fallback;
  },
  levelFor(z) {
    if (z < this.thr("thrDecade", 1.8)) return "DECADE";
    if (z < this.thr("thrYear", 6)) return "YEAR";
    return "LEAF";
  },

  // ---------- размеры ----------
  radiusFor(count) {
    const s = this.s;
    return Math.min(46 * s, 6 * s + 5 * s * Math.sqrt(count)) * this.thr("dotScale", 1);
  },
  leafRadius(item) {
    const sig = item.significance || 3;
    return (6 + (sig >= 5 ? 3.5 : sig >= 4 ? 2 : 0)) * this.s * this.thr("dotScale", 1);
  },

  // ---------- кластеры ----------
  buildClusters(level) {
    const out = [];
    if (level === "LEAF") {
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        if (typeof it.year_first !== "number") continue;
        if (it.year_first < AXIS_MIN) continue;   // рисуется в кармане
        if (!BUCKET_META[it.bucket]) continue;
        out.push({
          x: this.yearToX(it.year_first), y: this.laneY(it.bucket),
          r: this.leafRadius(it), count: 1, indices: [i], lane: it.bucket,
          label: it.title, timeCenter: it.year_first, timeSpan: 1,
          fill: it.cover_color,
        });
      }
      return out;
    }
    const src = level === "DECADE" ? this.byDecade : this.byYear;
    for (const [key, idx] of src) {
      const [numStr, lane] = key.split(":");
      const num = +numStr;
      const center = level === "DECADE" ? num + 5 : num;
      out.push({
        x: this.yearToX(center), y: this.laneY(lane),
        r: idx.length > 1 ? this.radiusFor(idx.length) : this.leafRadius(this.items[idx[0]]),
        count: idx.length, indices: idx.slice(), lane,
        label: level === "DECADE" ? num + "-е" : String(num),
        timeCenter: center, timeSpan: level === "DECADE" ? 10 : 1,
        fill: idx.length > 1 ? BUCKET_META[lane].accent : this.items[idx[0]].cover_color,
      });
    }
    return out;
  },

  /* Кружки одной дорожки не должны наезжать друг на друга — расталкиваем по
   * горизонтали, y дорожки не трогаем. */
  relaxHoriz(clusters, gap, iters) {
    for (let k = 0; k < iters; k++) {
      let moved = 0;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const a = clusters[i], b = clusters[j];
          if (a.lane !== b.lane) continue;
          const dx = b.x - a.x;
          const d = Math.abs(dx);
          const minD = a.r + b.r + gap;
          if (d < minD) {
            const push = (minD - d) * 0.5;
            const sign = dx >= 0 ? 1 : -1;
            a.x -= sign * push;
            b.x += sign * push;
            moved++;
          }
        }
      }
      if (!moved) break;
    }
  },

  // ---------- ввод ----------
  onDown: function (ev) {
    this.pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
    if (this.pointers.size === 2) {
      const p = [...this.pointers.values()];
      this.pinchDist = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      this.pinchZoom = this.zoom;
      return;
    }
    ev.preventDefault();
    try { this.cv.canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    this.dragging = true;
    this.didDrag = false;
    this.pressX = ev.offsetX; this.pressY = ev.offsetY;
    this.lastX = ev.offsetX;
    this.lastT = performance.now();
    this.anim = null;
  },

  onMove: function (ev) {
    if (this.pointers.has(ev.pointerId)) this.pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
    if (this.pointers.size === 2) {
      const p = [...this.pointers.values()];
      const d = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      if (this.pinchDist > 0) this.zoom = this.clampZoom(this.pinchZoom * (d / this.pinchDist));
      this.didDrag = true;
      this.clampCamera();
      return;
    }
    if (!this.dragging) return;
    if (!this.didDrag &&
        Math.hypot(ev.offsetX - this.pressX, ev.offsetY - this.pressY) > TAP_THRESHOLD * this.s) {
      this.didDrag = true;
    }
    if (!this.didDrag) return;
    const now = performance.now();
    const dt = Math.max(16, now - this.lastT) / 1000;
    const shift = -(ev.offsetX - this.lastX) / this.pxPerYear();
    this.yearCenter += shift;
    this.velYears = shift / dt;
    this.lastX = ev.offsetX;
    this.lastT = now;
    this.clampCamera();
  },

  onUp: function (ev) {
    this.pointers.delete(ev.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    try { this.cv.canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
    if (this.pointers.size === 0 && this.dragging && !this.didDrag) {
      const hit = this.hitTest(ev.offsetX, ev.offsetY);
      if (hit && hit.count > 1) this.drilldown(hit);
      else if (hit) { this.select(this.items[hit.indices[0]]); this.velYears = 0; }
      else if (this.selectedId) this.deselect();
      else this.zoomOutOneLevel();
    }
    if (this.pointers.size === 0) this.dragging = false;
  },

  onWheel: function (ev) {
    ev.preventDefault();
    const before = this.xToYear(ev.offsetX);
    const next = this.clampZoom(this.zoom * Math.exp(-ev.deltaY * 0.0015));
    if (next === this.zoom) return;
    this.zoom = next;
    this.yearCenter += before - this.xToYear(ev.offsetX);
    this.clampCamera();
    this.anim = null;
  },

  // ---------- навигация ----------
  animateTo(zoom, yearCenter, dur) {
    this.anim = {
      z0: this.zoom, z1: zoom,
      c0: this.yearCenter, c1: yearCenter,
      t0: performance.now(), dur: dur || 420,
    };
    this.velYears = 0;
  },
  updateAnim() {
    if (!this.anim) return;
    const a = this.anim;
    const t = Math.min(1, (performance.now() - a.t0) / a.dur);
    const e = 1 - Math.pow(1 - t, 3);
    this.zoom = a.z0 + (a.z1 - a.z0) * e;
    this.yearCenter = a.c0 + (a.c1 - a.c0) * e;
    if (t >= 1) this.anim = null;
  },

  /* Один тап — ровно один уровень вниз. Если целиться сразу «вписать декаду
   * в кадр», масштаб перепрыгивает через уровень годов и обещание
   * «декада → год → книги» не выполняется. */
  drilldown(cluster) {
    const cur = this.levelFor(this.zoom);
    const thrDecade = this.thr("thrDecade", 1.8);
    const thrYear = this.thr("thrYear", 6);
    const desired = (TOTAL_YEARS / Math.max(1, cluster.timeSpan)) * 0.55;
    let target;
    if (cur === "DECADE") target = Math.min(thrYear - 0.2, Math.max(thrDecade + 0.15, desired));
    else if (cur === "YEAR") target = Math.max(thrYear + 0.15, Math.min(MAX_ZOOM, desired));
    else return;
    this.animateTo(this.clampZoom(target), cluster.timeCenter, 420);
  },
  zoomOutOneLevel() {
    const cur = this.levelFor(this.zoom);
    const thrDecade = this.thr("thrDecade", 1.8);
    let target;
    if (cur === "LEAF") target = thrDecade + 0.1;
    else if (cur === "YEAR") target = thrDecade - 0.1;
    else target = 1.0;
    this.animateTo(this.clampZoom(target), this.yearCenter, 380);
  },
  goHome() {
    this.deselect();
    this.animateTo(1.0, (AXIS_MIN + AXIS_MAX) / 2, 500);
  },

  // ---------- попадание ----------
  hitTest(px, py) {
    let best = null, bestD = Infinity;
    for (const cl of this.lastClusters) {
      const lr = cl.labelRect;
      if (lr && px >= lr[0] && px <= lr[2] && py >= lr[1] && py <= lr[3]) {
        const d = Math.hypot(px - cl.x, py - cl.y);
        if (d < bestD) { bestD = d; best = cl; }
      }
    }
    if (best) return best;
    for (const cl of this.lastClusters) {
      const d = Math.hypot(px - cl.x, py - cl.y);
      const hitR = Math.max(cl.r + 12 * this.s, 22 * this.s);
      if (d <= hitR && d < bestD) { bestD = d; best = cl; }
    }
    return best;
  },

  select(item) {
    this.selectedId = item.id;
    this.card.show(item);
  },
  deselect() {
    this.selectedId = null;
    if (this.card) this.card.hide();
  },

  // ---------- кадр ----------
  frame() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, Math.max(0.001, now - this.prevTime));
    this.prevTime = now;
    this.updateAnim();
    if (!this.dragging && !this.anim) {
      this.yearCenter += this.velYears * dt;
      this.velYears *= Math.pow(0.88, dt * 60);
      if (Math.abs(this.velYears) < 0.01) this.velYears = 0;
      this.clampCamera();
    }
    this.render();
    if (this.homeBtn) this.homeBtn.hidden = !(this.zoom > 1.05);
  },

  render() {
    const ctx = this.cv.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    if (!this.items.length || !this.W) return;
    if (this.values.showPeriods !== false) this.drawPeriods();
    this.drawLanes();
    if (this.values.showEvents !== false) this.drawEvents();
    if (this.values.showAxis !== false) this.drawAxis();
    this.drawClusters();
    if (this.values.showOutliers !== false) this.drawOutliers();
    if (this.values.showConns !== false) this.drawConnections();
    this.drawHud();
  },

  /* Полосы эпох «лёгкие»: заливка чуть заметная, вся работа на границах и
   * подписи, иначе фон начинает спорить с кружками. */
  drawPeriods() {
    const ctx = this.cv.ctx;
    const s = this.s;
    const top = this.laneY("by-lenin") - this.H * 0.16;
    const axisY = this.axisY();
    const L = this.plotL(), R = this.plotR();

    ctx.save();
    ctx.beginPath();
    ctx.rect(L, top, R - L, axisY - top);
    ctx.clip();
    PERIODS.forEach((p, i) => {
      const x0 = Math.max(L, this.yearToX(p.from));
      const x1 = Math.min(R, this.yearToX(p.to));
      if (x1 <= x0 || i % 2) return;
      ctx.fillStyle = rgba(COLORS.paper, 0.028);
      ctx.fillRect(x0, top, x1 - x0, axisY - top);
    });
    ctx.restore();

    /* Подписи эпох — под осью лет: вверху уже живут исторические даты, и две
     * группы подписей в одной строке слипались в кашу. */
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const scale = this.thr("labelScale", 1);
    ctx.font = `600 ${10 * s * scale}px "20 Kopeek", monospace`;
    ctx.fillStyle = rgba(COLORS.paper, 0.3);
    const cy = axisY + 34 * s;
    for (const p of PERIODS) {
      const x0 = Math.max(L, this.yearToX(p.from));
      const x1 = Math.min(R, this.yearToX(p.to));
      if (x1 - x0 < 60 * s) continue;
      const label = this.app.t("timeline.period." + p.key).toUpperCase();
      const text = M.wrapLines(ctx, label, x1 - x0 - 12 * s, 1)[0];
      if (text) ctx.fillText(text, (x0 + x1) / 2, cy);
    }
    ctx.restore();
  },

  /* Три одинаковые серые линии не читались: понять, где «ИМ», а где «О НЁМ»,
   * можно было только по мелкой подписи слева. У каждой дорожки своя подложка
   * в цвете оси, закладка на левом крае и крупная подпись. */
  drawLanes() {
    const ctx = this.cv.ctx;
    const s = this.s;
    const L = this.plotL(), R = this.plotR();
    const scale = this.thr("labelScale", 1);
    const halfBand = this.H * 0.075 * this.thr("laneBand", 1);

    for (const lane of LANES) {
      const y = this.laneY(lane);
      const meta = BUCKET_META[lane];
      ctx.save();
      if (this.thr("laneBand", 1) > 0.01) {
        const g = ctx.createLinearGradient(0, y - halfBand, 0, y + halfBand);
        g.addColorStop(0, rgba(meta.accent, 0));
        g.addColorStop(0.5, rgba(meta.accent, 0.13));
        g.addColorStop(1, rgba(meta.accent, 0));
        ctx.fillStyle = g;
        ctx.fillRect(this.W * 0.02, y - halfBand, R - this.W * 0.02, halfBand * 2);
      }
      ctx.fillStyle = meta.accent;
      ctx.fillRect(this.W * 0.02, y - halfBand * 0.55, 4 * s, halfBand * 1.1);
      ctx.strokeStyle = rgba(meta.accent, 0.5);
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(L, y);
      ctx.lineTo(R, y);
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = meta.accent;
      ctx.font = `600 ${17 * s * scale}px "20 Kopeek", monospace`;
      ctx.fillText(this.app.t("bucket." + lane), this.W * 0.028 + 8 * s, y - 14 * s);
      ctx.fillStyle = rgba(COLORS.paper, 0.5);
      ctx.font = `400 ${9.5 * s * scale}px "20 Kopeek", monospace`;
      const noteMax = L - this.W * 0.028 - 74 * s;
      const note = M.wrapLines(ctx, this.app.t("bucket." + lane + ".note").toUpperCase(), noteMax, 1)[0] || "";
      ctx.fillText(note, this.W * 0.028 + 8 * s, y - 3 * s);
      ctx.restore();
    }
  },

  drawAxis() {
    const ctx = this.cv.ctx;
    const s = this.s;
    const ppy = this.pxPerYear();
    const step = ppy > 60 * s ? 1 : ppy > 20 * s ? 5 : 10;
    const axisY = this.axisY();

    ctx.save();
    ctx.strokeStyle = rgba(COLORS.brass, 0.45);
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(this.plotL(), axisY);
    ctx.lineTo(this.plotR(), axisY);
    ctx.stroke();

    const labelStep = ppy > 30 * s ? step : step * 2;
    ctx.font = `400 ${12 * s * this.thr("labelScale", 1)}px "20 Kopeek", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let y = Math.ceil(AXIS_MIN / step) * step; y <= AXIS_MAX; y += step) {
      const x = this.yearToX(y);
      if (x < this.plotL() - 2 * s || x > this.plotR() + 2 * s) continue;
      const major = y % labelStep === 0;
      ctx.fillStyle = rgba(COLORS.paper, major ? 0.5 : 0.18);
      ctx.fillRect(x, axisY, 1 * s, (major ? 8 : 4) * s);
      if (major) {
        ctx.fillStyle = rgba(COLORS.paper, 0.62);
        ctx.fillText(String(y), x, axisY + 13 * s);
      }
    }
    ctx.restore();
  },

  /* Исторические якоря. Подписи отбраковываются по пересечению — иначе на
   * общем плане десяток дат слипается в кашу. */
  drawEvents() {
    const ctx = this.cv.ctx;
    const s = this.s;
    const top = this.laneY("by-lenin") - this.H * 0.13;
    const bottom = this.laneY("about-lenin") + this.H * 0.11;
    const fs = 11 * s * this.thr("labelScale", 1);

    ctx.save();
    ctx.font = `600 ${fs}px "20 Kopeek", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.strokeStyle = rgba(COLORS.red, 0.32);
    ctx.setLineDash([4 * s, 6 * s]);
    ctx.lineWidth = 1.2 * s;
    for (const t of TICKS) {
      const x = this.yearToX(t.year);
      if (x < this.plotL() || x > this.plotR()) continue;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const taken = [];
    ctx.fillStyle = rgba(COLORS.brass, 0.85);
    for (const t of [...TICKS].sort((a, b) => a.rank - b.rank)) {
      const x = this.yearToX(t.year);
      if (x < this.plotL() || x > this.plotR()) continue;
      const text = `${t.year} · ${this.app.t("timeline.event." + t.key)}`;
      const half = ctx.measureText(text).width / 2 + 8 * s;
      if (taken.some(([l, r]) => x - half < r && x + half > l)) continue;
      taken.push([x - half, x + half]);
      ctx.fillText(text, x, top - 4 * s);
    }
    ctx.restore();
  },

  drawClusters() {
    const z = this.zoom;
    const level = this.levelFor(z);
    const bands = [
      { z: this.thr("thrDecade", 1.8), lower: "DECADE", upper: "YEAR" },
      { z: this.thr("thrYear", 6), lower: "YEAR", upper: "LEAF" },
    ];
    let band = null;
    if (this.values.crossfade !== false) {
      for (const b of bands) if (Math.abs(z - b.z) < FADE_HALF) { band = b; break; }
    }
    if (!band) {
      const cls = this.buildClusters(level);
      this.drawLevel(cls, 1, level);
      this.lastClusters = cls;
      return;
    }
    const t = (z - (band.z - FADE_HALF)) / (2 * FADE_HALF);
    const lower = this.buildClusters(band.lower);
    const upper = this.buildClusters(band.upper);
    this.drawLevel(lower, 1 - t, band.lower);
    this.drawLevel(upper, t, band.upper);
    this.lastClusters = t >= 0.5 ? upper.concat(lower) : lower.concat(upper);
  },

  drawLevel(clusters, alpha, level) {
    const ctx = this.cv.ctx;
    const s = this.s;
    this.relaxHoriz(clusters, 4 * s, 30);
    const dimming = this.selectedId != null && level === "LEAF";
    const related = new Set();
    if (dimming) {
      related.add(this.selectedId);
      for (const c of this.corpus.connsByItem.get(this.selectedId) || []) {
        related.add(c.from === this.selectedId ? c.to : c.from);
      }
    }

    ctx.save();
    for (const cl of clusters) {
      if (cl.x < this.plotL() || cl.x > this.plotR()) continue;
      const isCluster = cl.count > 1;
      const sel = cl.indices.some((i) => this.items[i].id === this.selectedId);
      const dim = dimming && !cl.indices.some((i) => related.has(this.items[i].id));
      const a = alpha * (dim ? 0.16 : 1);

      if (sel) {
        ctx.beginPath();
        ctx.arc(cl.x, cl.y, cl.r + 5 * s, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.brass;
        ctx.lineWidth = 2.5 * s;
        ctx.globalAlpha = alpha;
        ctx.stroke();
      }
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.r, 0, Math.PI * 2);
      ctx.fillStyle = cl.fill;
      ctx.fill();
      ctx.strokeStyle = rgba(COLORS.paper, 0.5);
      ctx.lineWidth = (isCluster ? 1.4 : 1) * s;
      ctx.stroke();

      if (isCluster) {
        ctx.font = `600 ${Math.max(11 * s, cl.r * 0.72)}px "20 Kopeek", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = rgba(COLORS.ink, 0.85);
        ctx.fillText(String(cl.count), cl.x, cl.y);
      }
    }
    ctx.globalAlpha = 1;

    this.drawLabels(clusters, alpha, level, dimming, related);
    ctx.restore();
  },

  /* Подписи книг: три раскладки, выбор в настройках. */
  drawLabels(clusters, alpha, level, dimming, related) {
    const ctx = this.cv.ctx;
    const s = this.s;
    const scale = this.thr("labelScale", 1);
    const mode = this.values.labelMode || "place";

    const cands = [];
    for (const cl of clusters) {
      cl.labelRect = null;
      if (!cl.label) continue;
      if (cl.x < this.plotL() || cl.x > this.plotR()) continue;
      if (dimming && !cl.indices.some((i) => related.has(this.items[i].id))) continue;
      const sel = cl.indices.some((i) => this.items[i].id === this.selectedId);
      const fs = Math.max(11 * s, Math.min(24 * s, cl.r * 0.62)) * scale;
      ctx.font = `${sel ? 600 : 400} ${fs}px "20 Kopeek", monospace`;
      // Названия книг длинные — переносим по словам, а не режем в одну
      // строку: иначе подпись растягивается на треть кадра.
      const maxW = (level === "LEAF" ? LABEL_MAX_W : 999) * s * scale;
      const lines = M.wrapLines(ctx, cl.label, maxW, level === "LEAF" ? LABEL_MAX_LINES : 1);
      if (!lines.length) continue;
      const w = Math.max(...lines.map((t) => ctx.measureText(t).width));
      cands.push({ cl, sel, fs, lines, w, lh: fs * 1.16 });
    }

    const drawn = [];
    const free = (r) => !drawn.some((d) =>
      !(r[2] < d[0] || r[0] > d[2] || r[3] < d[1] || r[1] > d[3]));
    // py — центр ПЕРВОЙ строки блока; блок растёт вниз
    const put = (c, py, leaderFrom) => {
      const { cl, fs, w, lines, lh } = c;
      const bottom = py + (lines.length - 1) * lh;
      const rect = [cl.x - w / 2 - 4 * s, py - fs * 0.6, cl.x + w / 2 + 4 * s, bottom + fs * 0.6];
      if (!free(rect)) return false;
      drawn.push(rect);
      cl.labelRect = rect;
      ctx.globalAlpha = alpha;
      ctx.font = `${c.sel ? 600 : 400} ${fs}px "20 Kopeek", monospace`;
      if (leaderFrom != null && Math.abs(py - leaderFrom) > 4 * s) {
        ctx.strokeStyle = c.sel ? COLORS.brass : rgba(COLORS.paper, 0.32);
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.moveTo(cl.x, leaderFrom);
        ctx.lineTo(cl.x, py - fs * 0.55);
        ctx.stroke();
      }
      for (let i = 0; i < lines.length; i++) {
        const ly = py + i * lh;
        ctx.fillStyle = rgba(COLORS.ink, 0.7);
        ctx.fillText(lines[i], cl.x + 1 * s, ly + 1 * s);
        ctx.fillStyle = c.sel ? COLORS.brass : rgba(COLORS.paper, 0.86);
        ctx.fillText(lines[i], cl.x, ly);
      }
      return true;
    };

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (mode === "stagger") {
      // Через одну над и под дорожкой — вдвое больше места почти даром.
      for (const lane of LANES) {
        const inLane = cands.filter((c) => c.cl.lane === lane).sort((a, b) => a.cl.x - b.cl.x);
        inLane.forEach((c, i) => {
          const block = (c.lines.length - 1) * c.lh;
          const py = i % 2 === 0
            ? c.cl.y + c.cl.r + c.fs * 0.75
            : c.cl.y - c.cl.r - c.fs * 0.75 - block;   // вверх блок растёт от нижней строки
          put(c, py, null);
        });
      }
    } else if (mode === "leader") {
      // Несколько строк под дорожкой: подпись съезжает в первую свободную,
      // к кружку тянется волосок. Строк не больше трёх — дальше начинается
      // соседняя дорожка.
      const MAX_ROWS = 3;
      for (const lane of LANES) {
        const inLane = cands.filter((c) => c.cl.lane === lane).sort((a, b) => a.cl.x - b.cl.x);
        const rowEnd = new Array(MAX_ROWS).fill(-Infinity);
        for (const c of inLane) {
          const half = c.w / 2 + 6 * s;
          let row = 0;
          while (row < MAX_ROWS && c.cl.x - half < rowEnd[row]) row++;
          if (row >= MAX_ROWS) continue;
          rowEnd[row] = c.cl.x + half;
          const anchorY = c.cl.y + c.cl.r;
          put(c, anchorY + c.fs * 0.75 + row * (c.lh * LABEL_MAX_LINES * 0.62), anchorY);
        }
      }
    } else {
      // По месту: крупные кружки забирают место первыми, налезающие отброшены.
      for (const c of cands.slice().sort((a, b) => b.cl.r - a.cl.r)) {
        put(c, c.cl.y + c.cl.r + c.fs * 0.75, null);
      }
    }
    ctx.globalAlpha = 1;
  },

  /* Книги вне шкалы (Аристотель, −350) — карман слева за разрывом оси. */
  drawOutliers() {
    if (!this.outliers.length) return;
    const ctx = this.cv.ctx;
    const s = this.s;
    const scale = this.thr("labelScale", 1);
    const axisStart = this.yearToX(AXIS_MIN);
    const x = axisStart - 46 * s;
    if (x < -40 * s || x > this.W) return;

    ctx.save();
    /* Знак разрыва — на самой оси лет, где разрыву и место. По центру кадра
     * он попадал ровно на дорожку «ЧИТАЛ» и мешался с её подписью. */
    const axisY = this.axisY();
    ctx.strokeStyle = rgba(COLORS.paper, 0.4);
    ctx.lineWidth = 1.4 * s;
    for (const off of [-5, 1]) {
      ctx.beginPath();
      ctx.moveTo(axisStart - 20 * s + off * s, axisY - 6 * s);
      ctx.lineTo(axisStart - 12 * s + off * s, axisY + 6 * s);
      ctx.stroke();
    }

    for (const i of this.outliers) {
      const it = this.items[i];
      const y = this.laneY(it.bucket);
      const r = this.leafRadius(it);
      const sel = it.id === this.selectedId;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = it.cover_color;
      ctx.fill();
      ctx.strokeStyle = sel ? COLORS.brass : rgba(COLORS.paper, 0.5);
      ctx.lineWidth = (sel ? 2.5 : 1) * s;
      ctx.stroke();

      // Подпись в две строки — так карман остаётся узким и не наползает ни на
      // подписи дорожек слева, ни на начало шкалы справа.
      const fs = 10.5 * s * scale;
      ctx.font = `400 ${fs}px "20 Kopeek", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = rgba(COLORS.paper, 0.45);
      ctx.fillText(String(it.year_first), x, y + r + fs * 0.95);
      ctx.fillStyle = rgba(COLORS.paper, 0.72);
      const title = M.wrapLines(ctx, it.title, 84 * s * scale, 1)[0] || "";
      ctx.fillText(title, x, y + r + fs * 2.15);

      this.lastClusters.push({
        x, y, r, count: 1, indices: [i], lane: it.bucket,
        label: it.title, labelRect: null, timeCenter: it.year_first, timeSpan: 1,
      });
    }
    ctx.restore();
  },

  /* Позиция книги на экране сейчас — сама книга, если она отдельный кружок,
   * либо кластер, внутри которого она свёрнута. */
  positionOfItem(id) {
    const idx = this.indexById.get(id);
    if (idx === undefined) return null;
    for (const cl of this.lastClusters) if (cl.indices.includes(idx)) return cl;
    return null;
  },

  drawConnections() {
    if (!this.selectedId) return;
    const conns = this.corpus.connsByItem.get(this.selectedId) || [];
    if (!conns.length) return;
    const ctx = this.cv.ctx;
    const s = this.s;
    const from = this.positionOfItem(this.selectedId);
    if (!from) return;
    if (from.x < this.plotL() || from.x > this.plotR()) return;

    ctx.save();
    for (const c of conns) {
      const otherId = c.from === this.selectedId ? c.to : c.from;
      const to = this.positionOfItem(otherId);
      if (!to || to === from) continue;
      const st = CONN_STYLE[c.type] || CONN_STYLE.source;

      /* Другой конец может быть далеко за кадром — упираем линию в край поля
       * и ставим уголок «продолжение там». Иначе кривая уходит в
       * бесконечность и читается как случайный луч через весь экран. */
      let tx = to.x, off = 0;
      if (tx < this.plotL() + 16 * s) { tx = this.plotL() + 16 * s; off = -1; }
      else if (tx > this.plotR() - 16 * s) { tx = this.plotR() - 16 * s; off = 1; }

      const midY = (from.y + to.y) / 2;
      const bow = Math.min(120 * s, Math.abs(tx - from.x) * 0.28 + 30 * s);

      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width * s;
      ctx.setLineDash(st.dash.map((d) => d * s));
      ctx.shadowColor = st.color;
      ctx.shadowBlur = 6 * s;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.bezierCurveTo(from.x + bow, midY, tx - bow, midY, tx, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      if (off) {
        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.moveTo(tx + off * 11 * s, to.y);
        ctx.lineTo(tx, to.y - 6 * s);
        ctx.lineTo(tx, to.y + 6 * s);
        ctx.closePath();
        ctx.fill();
      }

      const fs = 10 * s * this.thr("labelScale", 1);
      ctx.font = `600 ${fs}px "20 Kopeek", monospace`;
      const text = this.app.t("conn." + c.type).toUpperCase();
      const w = ctx.measureText(text).width;
      const mx = Math.max(this.plotL() + w / 2 + 8 * s,
        Math.min(this.plotR() - w / 2 - 8 * s, (from.x + tx) / 2));
      ctx.fillStyle = rgba(COLORS.ink, 0.85);
      ctx.fillRect(mx - w / 2 - 6 * s, midY - fs * 0.8, w + 12 * s, fs * 1.6);
      ctx.fillStyle = st.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, mx, midY);
    }
    ctx.restore();
  },

  drawHud() {
    const ctx = this.cv.ctx;
    const s = this.s;
    const level = this.levelFor(this.zoom);
    const human = this.app.t(level === "DECADE" ? "timeline.level.decade"
      : level === "YEAR" ? "timeline.level.year" : "timeline.level.book");
    ctx.save();
    ctx.font = `400 ${10 * s}px "20 Kopeek", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = rgba(COLORS.brass, 0.5);
    ctx.fillText(this.app.t("timeline.hud", { level: human, zoom: this.zoom.toFixed(2) }),
      this.W - 14 * s, this.H - 12 * s);
    ctx.restore();
  },
};

/* Обработчики ввода объявлены свойствами объекта-сцены, поэтому их надо
 * привязать к нему: иначе внутри `this` будет канва. */
for (const k of ["onDown", "onMove", "onUp", "onWheel"]) {
  timelineScene[k] = timelineScene[k].bind(timelineScene);
}
