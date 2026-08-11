/* Сцена «Хронология» — 280 датированных памятников, распад декада → год →
 * памятник. Перенос из mtk41-timeline-hier/ на контракт сцены.
 *
 * Три дорожки по судьбе объекта: верх — сохранились, центр — судьба
 * неизвестна, низ — снесены. Ось только горизонтальная (годы).
 *
 * Отступы слева и справа считаются по ФАКТИЧЕСКОЙ ширине подписей дорожек
 * (measurePads), а не долями ширины: «сохранились» рисуется справа налево от
 * левой границы и при отступе «на глаз» уходило в отрицательные координаты.
 * По той же причине лента центрируется по середине РАБОЧЕЙ области, а не
 * экрана — иначе при разных отступах последние десятилетия вываливались. */
import {
  DATA,
  PALETTE,
  createCanvasHost,
  createCard,
  cssColor,
  plural,
  preloadThumbs,
  statusColor,
  createHint,
  FINDER_FIELDS,
  countryOptions,
  decadeOptions,
  APP,
  drawEmptyState,
  hintForEmpty,
  emptyVerdict,
  finderApply,
  finderSort,
  setCorpus,
  statusOptions,
} from "./shared.js?v=66";

const YEAR_MIN = 1918;
const YEAR_MAX = 2026;
const TOTAL_YEARS = YEAR_MAX - YEAR_MIN;
const MIN_ZOOM = 1.0;
const MAX_ZOOM = 20;
const TAP_THRESHOLD = 8;
const LANE_ORDER = ["extant", "unknown", "demolished"];
const LEAF_R_FRAC = 0.006;

/* Контекст эпохи. Контент — остаётся на русском, как у пилота 42. */
const EVENTS = [
  { year: 1924.06, label: "смерть В. И. Ленина" },
  { year: 1956, label: "XX съезд КПСС" },
  { year: 1991, label: "распад СССР" },
  { year: 2014, label: "Крым в РФ" },
  { year: 2022.75, label: "4 области в РФ" },
];

export const timelineScene = {
  id: "timeline",
  title: { ru: "Хронология", en: "Chronology", zh: "年表" },

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

  /* Финдер: отбор и поиск. Сортировка объявляется только там, где у
   * порядка есть видимый эффект (см. декларацию, утверждённую 2026-08-10). */
  finder: {
    search: { fields: FINDER_FIELDS },
    filters: [
      { key: "status", label: { ru: "Судьба", en: "Fate" },
        options: function () { return statusOptions(APP()); } },
      { key: "country", label: { ru: "Страна", en: "Country" },
        options: function () { return countryOptions(); } },
    ],
  },

  settings: [
    { key: "sizeMode", label: { ru: "Размер кружка", en: "Circle size" },
      type: "choice", default: "sqrt",
      options: [{ value: "sqrt", label: { ru: "√N" } },
                { value: "linear", label: { ru: "N" } },
                { value: "log", label: { ru: "log N" } }] },
    { key: "thrDecade", label: { ru: "Порог: декада → год" },
      type: "range", min: 1.0, max: 3.0, step: 0.1, default: 1.8 },
    { key: "thrYear", label: { ru: "Порог: год → памятник" },
      type: "range", min: 3.0, max: 9.0, step: 0.1, default: 5.0 },
    { key: "labelScale", label: { ru: "Размер названий" },
      type: "range", min: 0.8, max: 2.2, step: 0.05, unit: "×", default: 1.4 },
    { key: "showEvents", label: { ru: "События на оси" },
      type: "toggle", default: true },
    { key: "crossfade", label: { ru: "Кроссфейд уровней" },
      type: "toggle", default: true },
  ],

  mount(el, ctx) {
    this._ctx = ctx;
    this._app = ctx.app;

    const root = document.createElement("div");
    root.className = "m41-scene m41-timeline";
    root.innerHTML =
      '<header class="m41-head"><h1 class="m41-head__title"></h1>' +
      '<p class="m41-head__sub"></p></header>' +
      '<div class="m41-timeline__stage"></div>';
    el.appendChild(root);

    this._root = root;
    this._stage = root.querySelector(".m41-timeline__stage");
    this._titleEl = root.querySelector(".m41-head__title");
    this._subEl = root.querySelector(".m41-head__sub");
    this._card = createCard(el, ctx.app, ctx);
    this._card.onClose(() => { this._selected = -1; });

    this._host = createCanvasHost(this._stage, "m41-timeline__canvas");

    /* Подсказка — на СТОЛ, не на канву: детей <canvas> браузер не рисует.
     * Стол ужимается, когда растут собственные контролы (режим слабовидящих
     * растит --ui-scale), поэтому подсказка не наезжает на них ни в одном
     * режиме — защита структурная, а не подобранным числом. */
    this._hint = createHint(this._stage, "drag", "hint." + this.id, ctx.app);
    this._host.observe(() => { this._measurePads(); });

    /* Только датированные: у трёх записей года нет вовсе, и на оси времени
     * им не место — они видны в других сценах. */
    this._src = (ctx.data.monuments.items || []).filter((m) => typeof m.year === "number");
    this._items = this._src;
    setCorpus(ctx.data.monuments.items || [], ctx.app);
    this._selected = -1;
    this._view = { zoom: 1, yearCenter: (YEAR_MIN + YEAR_MAX) / 2 };
    this._pads = { left: 80, right: 40 };
    this._clusters = [];

    this._rebuild();
    this._bindPointer();
    this.applySettings(this._cfg || {});
  },

  unmount() {
    if (this._hint) { this._hint.destroy(); this._hint = null; }
    if (this._host) this._host.destroy();
    if (this._card) this._card.destroy();
    if (this._root) this._root.remove();
    this._root = this._host = this._card = null;
  },

  pause() { if (this._host) this._host.stop(); },

  resume() {
    if (!this._host) return;
    this._host.measure();
    this._measurePads();
    this._host.start(() => this._frame());
  },

  reset() {
    if (this._card) this._card.close();
    this._selected = -1;
    /* Уровень иерархии — в стартовый: посетитель мог провалиться до года.
     * Через кламп, как и жест: единственный путь к зуму мимо ограничителя
     * стал бы единственным путём выехать за него (правило семьи, см. карту). */
    this._view.zoom = this._clampZoom(1);
    this._view.yearCenter = (YEAR_MIN + YEAR_MAX) / 2;
  },

  setLang() { this._renderHead(); if (this._hint) this._hint.relabel(); },

  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
    this._measurePads();
  },

  healthcheck() {
    if (!this._host) return { ok: true, detail: "не смонтирована" };
    /* Канвовая сцена без размера — «ещё не показывалась», а не поломка
     * (канон кита, README п. про healthcheck; конвенция принята по заявке
     * МТК 41). Спрашиваем ЖИВОЙ бокс: host.width — это память о последнем
     * измерении, она переживает скрытие слоя и соврёт по неактивной сцене. */
    if (!this._host.liveBox().w) return { ok: true, detail: "ещё не показывалась" };

    /* Буфер сверяем ПО ФАКТИЧЕСКОМУ dpr, а не по ширине бокса: счётчик фигур
     * бывает зелёным, пока сцена рисует всё до одной — но в чужом разрешении
     * (карта 42 так рисовала в 4%). Формула одна с отрисовкой — bufferFor(). */
    const buf = this._host.bufferOk();
    if (!buf.ok) return { ok: false, detail: "буфер " + buf.detail };
    if (!this._items.length) return emptyVerdict(this._find, "ни одного датированного памятника");
    if (!this._clusters.length) return emptyVerdict(this._find, "на оси не построено ни одного кружка");
    return { ok: true, detail: `датированных ${this._items.length}, кружков ${this._clusters.length}, буфер ${buf.detail}` };
  },

  /* Отбор целиком, при любом изменении. {shown,total} возвращаем: без него
   * панель не объяснит, почему на сцене поредело. */
  applyFinder(find) {
    this._find = find;
    this._applyFind();
    return { shown: this._items.length, total: (this._src || []).length };
  },
  _applyFind() {
    this._items = finderApply(this._src || [], this._find);
    /* Меряем ЖИВОЙ бокс перед пересборкой. Геометрия, от которой зависит
     * healthcheck, обязана считаться вне кадра (канон GRABLI): _host.width —
     * это кеш последнего measure(), а measure() живёт в rAF. Стенд приёмки
     * разворачивает каждый фильтр в состояние и зовёт healthcheck БЕЗ
     * отрисовки — на кеше он получил бы «ни одной фигуры» у исправной сцены. */
    if (this._host && !this._host.width) this._host.measure();
    this._rebuild();
    /* Второй замер — ПОСЛЕ перестройки DOM вокруг холста (шапка, чипы, режим
     * слабовидящих). Первый ловит ещё старый бокс, и healthcheck колеблется.
     * На киоске лечит наблюдатель размера, но в скрытой вкладке он НЕ
     * ДОСТАВЛЯЕТСЯ ВООБЩЕ — а стенд приёмки работает именно в скрытой.
     * Правило вешаем на СЕМЬЮ: строку получают все канвовые сцены. */
    if (this._host) this._host.measure();
  },

  applySettings(values) {
    this._cfg = Object.assign({
      sizeMode: "sqrt", thrDecade: 1.8, thrYear: 5.0, labelScale: 1.4,
      showEvents: true, crossfade: true,
    }, values || {});
    if (!this._host) return;
    this._host.measure();
    this._measurePads();
    this._renderHead();
    if (!this._host.running()) this._host.start(() => this._frame());
  },

  /* ─── агрегаты ──────────────────────────────────────────────────────── */

  _rebuild() {
    this._byDecade = new Map();
    this._byYear = new Map();
    for (let i = 0; i < this._items.length; i += 1) {
      const m = this._items[i];
      const lane = m.status === "extant" ? "extant"
        : m.status === "demolished" ? "demolished" : "unknown";
      const dec = Math.floor(m.year / 10) * 10;
      let d = this._byDecade.get(dec);
      if (!d) { d = { extant: [], unknown: [], demolished: [] }; this._byDecade.set(dec, d); }
      d[lane].push(i);
      const yk = m.year + ":" + lane;
      let y = this._byYear.get(yk);
      if (!y) { y = []; this._byYear.set(yk, y); }
      y.push(i);
    }
  },

  /* ─── геометрия ─────────────────────────────────────────────────────── */

  /* Кружки пересобираются и вне кадра — по той же причине, что и на карте:
   * healthcheck не должен зависеть от того, была ли отрисовка. */
  _refreshClusters() {
    if (this._host && this._host.width) this._clusters = this._buildClusters(this._level());
  },

  _measurePads() {
    const h = this._host;
    if (!h || !h.width) return;
    const fontPx = this._fontPx();
    const ctx = h.ctx;
    ctx.save();
    ctx.font = `600 ${fontPx * 0.85}px "20 Kopeek", monospace`;
    let maxLane = 0;
    for (const k of LANE_ORDER) {
      maxLane = Math.max(maxLane, ctx.measureText(this._app.t("lane." + k)).width);
    }
    ctx.restore();
    this._pads.left = Math.min(h.width * 0.22, maxLane + 28);
    this._pads.right = Math.min(h.width * 0.14, Math.max(48, fontPx * 3.2));
    this._refreshClusters();
  },

  _fontPx() {
    const h = this._host;
    return Math.max(11, Math.min(h.height * 0.02, 24)) * (this._cfg ? this._cfg.labelScale : 1.4);
  },

  _usableW() { return Math.max(50, this._host.width - this._pads.left - this._pads.right); },
  _centerX() { return this._pads.left + this._usableW() * 0.5; },
  _pxPerYear() { return (this._usableW() / TOTAL_YEARS) * this._view.zoom; },
  _yearToX(y) { return this._centerX() + (y - this._view.yearCenter) * this._pxPerYear(); },
  _xToYear(x) { return this._view.yearCenter + (x - this._centerX()) / this._pxPerYear(); },

  _laneY(lane) {
    const h = this._host.height;
    const c = h * 0.55, spread = h * 0.2;
    if (lane === "extant") return c - spread;
    if (lane === "demolished") return c + spread;
    return c;
  },

  _clampCamera() {
    const half = TOTAL_YEARS / (2 * this._view.zoom);
    const lo = YEAR_MIN + half, hi = YEAR_MAX - half;
    if (hi < lo) this._view.yearCenter = (YEAR_MIN + YEAR_MAX) / 2;
    else this._view.yearCenter = Math.min(hi, Math.max(lo, this._view.yearCenter));
  },

  _clampZoom(z) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  },

  /* Поставить ГОД year под экранную координату x при зуме next.
   *
   * Не то же, что «зум в точку касания»: там год берётся из-под пальца в
   * момент вызова, поэтому перенос двух пальцев сам себя гасит — что было под
   * серединой, то под ней и остаётся. Здесь год приходит извне, запомненный в
   * начале щипка, и потому едет вместе с руками: расстояние даёт зум,
   * середина — сдвиг оси. Тот же приём, что на карте, только измерение одно. */
  _placeAt(next, year, x) {
    if (typeof year !== "number" || !isFinite(year)) return false;
    this._view.zoom = this._clampZoom(next);
    /* _pxPerYear читает уже НОВЫЙ зум — порядок строк тут значащий. */
    this._view.yearCenter = year - (x - this._centerX()) / this._pxPerYear();
    this._clampCamera();
    return true;
  },

  /* Зум в точку касания: год под пальцем остаётся на месте. */
  _zoomAt(next, x) {
    const z = this._clampZoom(next);
    if (z === this._view.zoom) return;
    this._placeAt(z, this._xToYear(x), x);
  },

  _level() {
    const z = this._view.zoom;
    if (z < this._cfg.thrDecade) return "DECADE";
    if (z < this._cfg.thrYear) return "YEAR";
    return "LEAF";
  },

  _sizeFor(count) {
    const s = Math.min(this._host.width, this._host.height);
    const base = s * 0.01, cap = s * 0.055;
    const mode = this._cfg.sizeMode;
    let r;
    if (mode === "linear") r = base + s * 0.0016 * count;
    else if (mode === "log") r = base + s * 0.011 * Math.log2(count + 1);
    else r = base + s * 0.0055 * Math.sqrt(count);
    return Math.min(cap, r);
  },

  _buildClusters(level) {
    const out = [];
    const leafR = Math.min(this._host.width, this._host.height) * LEAF_R_FRAC;
    if (level === "DECADE") {
      for (const [dec, lanes] of this._byDecade) {
        for (const lane of LANE_ORDER) {
          const idx = lanes[lane];
          if (!idx.length) continue;
          /* Кружок стоит на СРЕДНЕМ годе своих памятников, а не на середине
           * десятилетия: у 1910-х в корпусе один Осташков 1919, и при
           * decade+5 кружок уезжал левее начала оси, наползая на подпись. */
          let sum = 0;
          for (const i of idx) sum += this._items[i].year;
          const mean = sum / idx.length;
          out.push({ x: this._yearToX(mean), y: this._laneY(lane),
            r: idx.length > 1 ? this._sizeFor(idx.length) : leafR,
            count: idx.length, indices: idx, lane, label: dec + "s", time: mean });
        }
      }
      return out;
    }
    if (level === "YEAR") {
      for (const [key, idx] of this._byYear) {
        const [ys, lane] = key.split(":");
        const year = Number(ys);
        out.push({ x: this._yearToX(year), y: this._laneY(lane),
          r: idx.length > 1 ? this._sizeFor(idx.length) : leafR,
          count: idx.length, indices: idx, lane, label: String(year), time: year });
      }
      return out;
    }
    for (let i = 0; i < this._items.length; i += 1) {
      const m = this._items[i];
      const lane = m.status === "extant" ? "extant"
        : m.status === "demolished" ? "demolished" : "unknown";
      out.push({ x: this._yearToX(m.year), y: this._laneY(lane), r: leafR,
        count: 1, indices: [i], lane, label: m.city || "", time: m.year });
    }
    return out;
  },

  /* ─── ввод ──────────────────────────────────────────────────────────── */

  _bindPointer() {
    const c = this._host.canvas;
    const st = { down: false, drag: false, x0: 0, y0: 0, lx: 0,
      pointers: new Map(), pinchDist: 0, pinchZoom: 1, pinchYear: null };
    this._pst = st;

    this._onDown = (e) => {
      const r = c.getBoundingClientRect();
      st.pointers.set(e.pointerId, e.clientX - r.left);
      if (st.pointers.size === 2) {
        const [a, b] = [...st.pointers.values()];
        st.pinchDist = Math.abs(a - b);
        st.pinchZoom = this._view.zoom;
        /* Год-якорь запоминаем ОДИН раз, в начале щипка (см. _placeAt). */
        st.pinchYear = this._xToYear((a + b) / 2);
        st.down = false;
        return;
      }
      st.down = true; st.drag = false;
      st.x0 = e.clientX; st.y0 = e.clientY; st.lx = e.clientX;
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
    };

    this._onMove = (e) => {
      const r = c.getBoundingClientRect();
      if (st.pointers.has(e.pointerId)) st.pointers.set(e.pointerId, e.clientX - r.left);
      if (st.pointers.size === 2 && st.pinchDist > 0) {
        const [a, b] = [...st.pointers.values()];
        /* Через _placeAt, а не _zoomAt: последний выходит досрочно при
         * неизменном расстоянии, и чистый перенос двумя пальцами не доезжал. */
        this._placeAt(st.pinchZoom * (Math.abs(a - b) / st.pinchDist),
          st.pinchYear, (a + b) / 2);
        st.drag = true;
        return;
      }
      if (!st.down) return;
      if (!st.drag && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > TAP_THRESHOLD) {
        st.drag = true;
      }
      if (st.drag) {
        this._view.yearCenter -= (e.clientX - st.lx) / this._pxPerYear();
        this._clampCamera();
      }
      st.lx = e.clientX;
    };

    this._onUp = (e) => {
      st.pointers.delete(e.pointerId);
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* не критично */ }
      if (st.pointers.size >= 2) return;          // щипок продолжается

      if (st.pinchDist > 0) {
        /* Из щипка вышел один палец — оставшийся продолжает вести ось.
         * Раньше st.down гас на втором касании и не зажигался обратно, и ось
         * стояла, пока не отпустят вторую руку. Тапа тут нет: жест был
         * щипком, а не касанием. */
        st.pinchDist = 0;
        const rest = st.pointers.values().next().value;
        if (typeof rest === "number") {
          const r = c.getBoundingClientRect();
          st.down = true; st.drag = true;
          st.lx = st.x0 = rest + r.left;
          st.y0 = e.clientY;
        } else {
          st.down = false;
        }
        return;
      }

      if (st.down && !st.drag) {
        const r = c.getBoundingClientRect();
        this._tap(e.clientX - r.left, e.clientY - r.top);
      }
      st.down = false;
    };

    this._onWheel = (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this._zoomAt(this._view.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left);
    };

    c.addEventListener("pointerdown", this._onDown);
    c.addEventListener("pointermove", this._onMove, { passive: true });
    c.addEventListener("pointerup", this._onUp);
    c.addEventListener("pointercancel", this._onUp);
    c.addEventListener("wheel", this._onWheel, { passive: false });
  },

  _tap(x, y) {
    let best = null, bestD = Infinity;
    for (const cl of this._clusters) {
      const d = Math.hypot(x - cl.x, y - cl.y);
      if (d <= Math.max(cl.r, 22) && d < bestD) { bestD = d; best = cl; }
    }
    if (!best) { this._card.close(); return; }
    if (best.count === 1) {
      this._selected = best.indices[0];
      this._card.open(this._items[best.indices[0]]);
      this._app.poke();
      return;
    }
    /* Кластер — провал на уровень глубже, с центром на нём. */
    this._zoomAt(this._view.zoom * 2.2, best.x);
  },

  /* ─── отрисовка ─────────────────────────────────────────────────────── */

  _frame() {
    const h = this._host;
    if (!h) return;
    if (h.width && !this._pads.measured) { this._measurePads(); this._pads.measured = true; }
    if (!h.width) return;
    const ctx = h.ctx;

    /* Отбор не дал совпадений — рисуем заглушку вместо пустого поля.
     * Панель пишет «0 из 283», но сцена без подписи это чистый экран без
     * объяснения: посетитель не поймёт ни что случилось, ни как вернуться. */
    if (this._items && !this._items.length) {
      ctx.clearRect(0, 0, h.width, h.height);
      drawEmptyState(ctx, h.width, h.height, this._app);
      hintForEmpty(this, true);
      return;
    }
    hintForEmpty(this, false);
    ctx.clearRect(0, 0, h.width, h.height);
    this._drawAxis();
    if (this._cfg.showEvents) this._drawEvents();
    this._clusters = this._buildClusters(this._level());
    this._drawClusters();
  },

  _drawAxis() {
    const h = this._host, ctx = h.ctx;
    const fontPx = this._fontPx();
    ctx.save();
    for (const lane of LANE_ORDER) {
      const y = this._laneY(lane);
      ctx.strokeStyle = cssColor(PALETTE.paper, 0.08);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this._pads.left, y);
      ctx.lineTo(h.width - this._pads.right, y);
      ctx.stroke();
    }

    ctx.font = `500 ${fontPx}px "20 Kopeek", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = cssColor(PALETTE.paper, 0.6);
    const step = this._pxPerYear() > 30 ? 5 : 10;
    const yLab = this._laneY("demolished") + h.height * 0.06;
    for (let y = Math.ceil(YEAR_MIN / step) * step; y <= YEAR_MAX; y += step) {
      const x = this._yearToX(y);
      if (x < -30 || x > h.width + 30) continue;
      const t = String(y);
      ctx.fillText(t, this._clampLabel(x, ctx.measureText(t).width), yLab);
    }

    /* Подписи дорожек — справа налево от левой границы; отступ под них уже
     * посчитан measurePads(), поэтому в отрицательные координаты не уходят. */
    ctx.font = `600 ${fontPx * 0.85}px "20 Kopeek", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const colors = { extant: cssColor(PALETTE.red, 0.7),
      unknown: cssColor(PALETTE.window, 0.6), demolished: cssColor(PALETTE.paper, 0.5) };
    for (const lane of LANE_ORDER) {
      ctx.fillStyle = colors[lane];
      ctx.fillText(this._app.t("lane." + lane), this._pads.left - 12, this._laneY(lane));
    }
    ctx.restore();
  },

  _clampLabel(x, w) {
    const half = w * 0.5 + 6;
    return Math.min(this._host.width - half, Math.max(half, x));
  },

  _drawEvents() {
    const h = this._host, ctx = h.ctx;
    const fontPx = Math.max(10, Math.min(h.height * 0.017, 20)) * this._cfg.labelScale;
    ctx.save();
    ctx.font = `400 ${fontPx}px "20 Kopeek", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.strokeStyle = cssColor(PALETTE.red, 0.4);
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.2;
    const top = this._laneY("extant") - h.height * 0.08;
    const bottom = this._laneY("demolished") + h.height * 0.08;
    /* Занятые подписями отрезки по X на каждой строке: «Крым в РФ 2014» и
     * «4 области в РФ 2022» разделяют 8 лет — на общем зуме это меньше их
     * ширины, и они наезжали друг на друга. Пересеклись — строкой выше. */
    const rows = [];
    for (const ev of EVENTS) {
      const x = this._yearToX(ev.year);
      if (x < -30 || x > h.width + 30) continue;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();

      const lw = ctx.measureText(ev.label).width;
      const cx = this._clampLabel(x, lw);
      const span = [cx - lw * 0.5 - 8, cx + lw * 0.5 + 8];
      let row = 0;
      while (rows[row] && rows[row].some((r) => span[0] < r[1] && span[1] > r[0])) row += 1;
      if (!rows[row]) rows[row] = [];
      rows[row].push(span);
      const yLab = top - fontPx * (1.6 + row * 2.4);

      /* Тень обязательна: справа подписи попадают на красную фоновую полосу,
       * и красный текст на красном фоне исчезал совсем. */
      ctx.shadowColor = cssColor(PALETTE.black, 0.85);
      ctx.shadowBlur = 6;
      ctx.fillStyle = cssColor(PALETTE.red, 0.9);
      ctx.fillText(ev.label, cx, yLab);
      ctx.fillStyle = cssColor(PALETTE.red, 0.7);
      const ys = String(Math.floor(ev.year));
      ctx.fillText(ys, this._clampLabel(x, ctx.measureText(ys).width), yLab + fontPx * 1.2);
      ctx.shadowBlur = 0;
    }
    ctx.setLineDash([]);
    ctx.restore();
  },

  _drawClusters() {
    const h = this._host, ctx = h.ctx;
    const fontPx = this._fontPx();
    const drawn = [];
    for (const cl of this._clusters) {
      if (cl.x < -80 || cl.x > h.width + 80) continue;
      const sel = cl.count === 1 && cl.indices[0] === this._selected;
      const single = cl.count === 1;
      const status = single ? this._items[cl.indices[0]].status : null;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.r, 0, Math.PI * 2);
      ctx.fillStyle = sel ? PALETTE.brass
        : single ? statusColor(status)
        : cl.lane === "extant" ? cssColor(PALETTE.red, 0.85) : cssColor(PALETTE.window, 0.7);
      ctx.fill();
      ctx.strokeStyle = cssColor(PALETTE.paper, sel ? 0.9 : 0.3);
      ctx.lineWidth = sel ? 2 : 1;
      ctx.stroke();
      if (!single && cl.r > 12) {
        ctx.fillStyle = "#1c2226";
        ctx.font = `600 ${Math.min(cl.r * 0.95, 34)}px "20 Kopeek", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(cl.count), cl.x, cl.y);
      }
      ctx.restore();

      if (!cl.label || cl.r < 6) continue;
      ctx.save();
      ctx.font = `400 ${fontPx}px "20 Kopeek", monospace`;
      const w = ctx.measureText(cl.label).width;
      const lx = this._clampLabel(cl.x, w);
      const ly = cl.y + cl.r + fontPx * 0.75;
      const rect = [lx - w * 0.5 - 4, ly - fontPx * 0.6, lx + w * 0.5 + 4, ly + fontPx * 0.6];
      /* Подписи не наслаиваем: пересеклись — эту пропускаем. */
      if (drawn.some((r) => rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1])) {
        ctx.restore();
        continue;
      }
      drawn.push(rect);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.shadowColor = cssColor(PALETTE.black, 0.7);
      ctx.shadowBlur = 4;
      ctx.fillStyle = sel ? PALETTE.brass : cssColor(PALETTE.paper, 0.88);
      ctx.fillText(cl.label, lx, ly - fontPx * 0.5);
      ctx.restore();
    }
  },

  _renderHead() {
    if (!this._titleEl) return;
    const app = this._app;
    const years = this._items.map((m) => m.year);
    this._titleEl.textContent = app.t("timeline.title");
    this._subEl.textContent = app.t("timeline.subtitle", {
      n: this._items.length + " " +
        plural(this._items.length, ["памятник", "памятника", "памятников"]),
      years: years.length ? Math.min(...years) + "–" + Math.max(...years) : "",
    });
  },
};
