/* Сцена «Институции · Карта» — 56 музеев на векторной подложке.
 * Перенос из mtk42-museums-map/ на контракт сцены.
 *
 * Проекция — общий канон MtkProjection.WinkelTripel (COORDINATION 2026-07-08):
 * порядок аргументов (lat, lng), аспект только из WT.ASPECT, локальной
 * WT-математики здесь нет.
 *
 * Анимации нет: перерисовка только по жесту. Поэтому rAF-петли не существует
 * вовсе — на паузе сцена гарантированно ничего не потребляет. */
import { DATA, STATUS_COLOR, museumCardHtml, createOverlay, esc } from "./shared.js?v=27";

const STATUSES = ["all", "active", "transformed", "private", "closed"];
/* Пресеты кадра из прототипа — «Кадр карты» в описи. */
const VIEW_PRESETS = {
  full:   { lonMin: -12, lonMax: 120, latMin:  8, latMax: 72 },
  core:   { lonMin:  -8, lonMax: 118, latMin: 22, latMax: 72 },
  ussr:   { lonMin:  20, lonMax: 115, latMin: 36, latMax: 70 },
  europe: { lonMin:  -6, lonMax:  56, latMin: 38, latMax: 70 },
};
const PIXEL_BUDGET = 3840 * 2160;   /* потолок буфера, ~8.3 Мп */
const MIN_ZOOM = 0.05, MAX_ZOOM = 40;

export const mapScene = {
  id: "map",
  title: { ru: "Институции · Карта", en: "Institutions · Map", zh: "机构 · 地图" },

  /* Схема настроек v1.2 — все позиции класса А из описи SETTINGS-INVENTORY.
   * Проекция оставлена настройкой, а не константой: WT — канон, но плоская
   * нужна для сверки, и прототип её умел. */
  settings: [
    { key: "projection", label: { ru: "Проекция" }, type: "select", default: "wt",
      options: [{ value: "wt", label: { ru: "Winkel Tripel" } },
                { value: "flat", label: { ru: "Плоская" } }] },
    { key: "viewPreset", label: { ru: "Кадр карты" }, type: "select", default: "core",
      options: [{ value: "full", label: { ru: "Евразия" } },
                { value: "core", label: { ru: "СССР + В. Европа" } },
                { value: "ussr", label: { ru: "СССР" } },
                { value: "europe", label: { ru: "Европа" } },
                { value: "custom", label: { ru: "Свой (по слайдерам)" } }] },
    { key: "lonMin", label: { ru: "Кадр: запад (долгота)" }, type: "range",
      min: -15, max: 60, step: 1, unit: " °", default: -8 },
    { key: "lonMax", label: { ru: "Кадр: восток (долгота)" }, type: "range",
      min: 30, max: 145, step: 1, unit: " °", default: 118 },
    { key: "latMin", label: { ru: "Кадр: юг (широта)" }, type: "range",
      min: 0, max: 55, step: 1, unit: " °", default: 22 },
    { key: "latMax", label: { ru: "Кадр: север (широта)" }, type: "range",
      min: 45, max: 82, step: 1, unit: " °", default: 72 },

    { key: "dotRadius", label: { ru: "Размер точек" }, type: "range",
      min: 4, max: 24, step: 1, unit: " px", default: 10 },
    { key: "borderWidth", label: { ru: "Толщина границ" }, type: "range",
      min: 0, max: 3, step: 0.1, unit: " px", default: 0.8 },

    { key: "showCities", label: { ru: "Названия городов" }, type: "toggle", default: true },
    { key: "citySize", label: { ru: "Города: размер" }, type: "range",
      min: 9, max: 22, step: 1, unit: " px", default: 12 },
    { key: "cityOpacity", label: { ru: "Города: непрозрачность" }, type: "range",
      min: 30, max: 100, step: 5, unit: " %", default: 70 },

    { key: "zoomSensitivity", label: { ru: "Чувствительность колёсика" }, type: "range",
      min: 0.5, max: 3, step: 0.1, default: 1.5 },

    { key: "titleSize", label: { ru: "Заголовок: размер" }, type: "range",
      min: 24, max: 96, step: 2, unit: " px", default: 48 },
    { key: "titleOpacity", label: { ru: "Заголовок: непрозрачность" }, type: "range",
      min: 30, max: 100, step: 5, unit: " %", default: 100 },
    { key: "titleBold", label: { ru: "Заголовок: жирный" }, type: "toggle", default: false },

    { key: "filterSize", label: { ru: "Кнопки-фильтры: размер" }, type: "range",
      min: 8, max: 24, step: 1, unit: " px", default: 16 },
    { key: "filterOpacity", label: { ru: "Кнопки-фильтры: непрозрачность" }, type: "range",
      min: 30, max: 100, step: 5, unit: " %", default: 78 },
    { key: "filterBold", label: { ru: "Кнопки-фильтры: жирный" }, type: "toggle", default: false },
  ],

  preload: { data: { museums: DATA.museums, countries: DATA.countries } },

  mount(el, ctx) {
    this._app = ctx.app;
    this._data = ctx.data.museums;
    this._geo = ctx.data.countries;
    this._status = "all";
    this._cam = { worldW: 0, worldH: 0, camX: 0, camY: 0, zoom: 1 };
    this._hitIdx = 0;
    this._lastHitKey = "";
    this._cfg = this._cfg || this._defaults();

    const root = document.createElement("div");
    root.className = "m42-map";
    root.innerHTML =
      '<canvas class="m42-map__canvas"></canvas>' +
      '<header class="m42-head m42-head--over">' +
      '<h1 class="m42-head__title"></h1>' +
      '<p class="m42-head__sub"></p>' +
      "</header>" +
      '<div class="m42-filters m42-filters--bottom">' +
      '<div class="m42-filters__row" data-row="status"></div>' +
      '<button type="button" class="m42-filter kiosk-target" data-reset="1"></button>' +
      "</div>";
    el.appendChild(root);

    this._root = root;
    this._canvas = root.querySelector(".m42-map__canvas");
    this._ctx2d = this._canvas.getContext("2d");
    this._statusRow = root.querySelector('[data-row="status"]');
    this._resetBtn = root.querySelector("[data-reset]");
    this._overlay = createOverlay(el, this._app);

    this._onFilter = (e) => {
      const btn = e.target.closest("[data-value]");
      if (!btn) return;
      this._status = btn.getAttribute("data-value");
      this._renderFilters();
      this._draw();
    };
    this._statusRow.addEventListener("click", this._onFilter);
    this._onReset = () => { this._fit(); this._draw(); };
    this._resetBtn.addEventListener("click", this._onReset);

    this._bindGestures();

    /* Сравниваем обе стороны: при чисто вертикальном ресайзе ширина не
     * меняется, и проверка только по width оставляла бы c.height stale. */
    this._lastW = 0; this._lastH = 0;
    this._ro = new ResizeObserver(() => {
      const c2 = this._canvas;
      if (!c2) return;
      const w = c2.clientWidth, h = c2.clientHeight;
      if (!w || !h) return;
      if (Math.abs(w - this._lastW) < 2 && Math.abs(h - this._lastH) < 2) return;
      this._lastW = w; this._lastH = h;
      this._size(); this._fit(); this._draw();
      /* Теснота считается не только от высоты бара: экран может стать ниже при
       * той же раскладке чипов, и подсказка упрётся в шапку без участия бара. */
      this._liftHint();
    });
    this._ro.observe(this._canvas);

    /* Лифт подсказки над собственными чипами — ОДИН механизм: наблюдатель на
     * самом баре фильтров. Он закрывает разом язык (длина слов переносит
     * строку), a11y (таргеты ×1.25), размер кнопок из настроек И ресайз окна
     * (сужение переносит чипы во второй ряд). Точечные вызовы после каждого из
     * этих событий не годятся: перелайаут чипов внутри .kiosk-layer
     * (content-visibility) материализуется только на СЛЕДУЮЩЕМ кадре, а
     * setTimeout(0) штатно бежит раньше — замер отдавал старую высоту.
     * «А если RO молчит в фоне?» — там и раскладка не меняется, а на выходе
     * из фона придёт первичная доставка. */
    this._barRo = new ResizeObserver(() => this._liftHint());
    this._barRo.observe(root.querySelector(".m42-filters--bottom"));

    /* Призыв к жесту по тач-стандарту (п. 4): на карте есть зум и пан.
     * Вешаем на КОРЕНЬ сцены, а не на канвас: div внутри <canvas> — это
     * fallback-контент, браузер его не рисует, и подсказка была невидима
     * (находка ревью ядра 1.8.1). События гасителя всё равно долетают —
     * pointerdown с канваса всплывает до корня. */
    if (window.KioskHint) {
      this._hint = window.KioskHint.attach(root, {
        gesture: "pinch", label: this._app.t("hint.pinch"),
      });
    }

    this._renderAll();
    this.applySettings(this._cfg);
  },

  unmount() {
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._barRo) { this._barRo.disconnect(); this._barRo = null; }
    if (this._hint && this._hint.destroy) this._hint.destroy();
    this._unbindGestures();
    if (this._statusRow) this._statusRow.removeEventListener("click", this._onFilter);
    if (this._resetBtn) this._resetBtn.removeEventListener("click", this._onReset);
    if (this._overlay) this._overlay.destroy();
    if (this._root) this._root.remove();
    this._root = this._canvas = this._ctx2d = null;
    this._statusRow = this._resetBtn = this._overlay = this._app = null;
    this._data = this._geo = this._hint = null;
  },

  /* Схема v1.2. Типографика — CSS-переменными, геометрия — прямо в отрисовке. */
  applySettings(values) {
    const prev = this._cfg;
    this._cfg = Object.assign(this._defaults(), values || {});
    if (!this._root) return;
    const c = this._cfg, st = this._root.style;
    const px = (v) => (v * this._uiScale()).toFixed(1) + "px";
    st.setProperty("--map-title-size", px(c.titleSize));
    st.setProperty("--map-title-opacity", (c.titleOpacity / 100).toFixed(2));
    st.setProperty("--map-title-weight", c.titleBold ? "700" : "400");
    st.setProperty("--map-filter-size", px(c.filterSize));
    st.setProperty("--map-filter-opacity", (c.filterOpacity / 100).toFixed(2));
    st.setProperty("--map-filter-weight", c.filterBold ? "700" : "400");
    /* Смена проекции или кадра требует пересчёта мира и подгонки вида. */
    const reframe = !prev || prev.projection !== c.projection ||
      prev.viewPreset !== c.viewPreset || prev.lonMin !== c.lonMin ||
      prev.lonMax !== c.lonMax || prev.latMin !== c.latMin || prev.latMax !== c.latMax;
    if (reframe) { this._size(); this._fit(); }
    this._draw();   // высоту бара пересчитает наблюдатель на нём же
  },

  _defaults() {
    const d = {};
    for (const row of this.settings) d[row.key] = row.default;
    return d;
  },

  /* Кадр: пресет задаёт границы, «Свой» — берёт их со слайдеров. */
  _view() {
    const c = this._cfg;
    const p = VIEW_PRESETS[c.viewPreset];
    return p ? p : { lonMin: c.lonMin, lonMax: c.lonMax, latMin: c.latMin, latMax: c.latMax };
  },

  _uiScale() { return Math.min(2, Math.max(1, window.innerWidth / 1920)); },

  /* Канвас нельзя опросить как DOM, поэтому считаем в самой отрисовке:
   * _draw() кладёт сюда число нарисованных точек и размер буфера. */
  healthcheck() {
    if (!this._canvas) return { ok: false, detail: "сцена не смонтирована" };
    const drawn = this._drawn || 0;
    const want = this._items().length;
    const r = this._canvas.getBoundingClientRect();
    const buf = this._canvas.width;
    /* Не только «нарисовано столько же», но и «нарисовано в нужном
     * разрешении». Сверяем не с шириной бокса, а с ОЖИДАНИЕМ по
     * фактическому dpr: бюджет 8.3 Мп законно опускает масштаб ниже
     * единицы на боксе крупнее 4K (зум браузера 67% → dpr≈0.67), и
     * сравнение с боксом горело бы красным на корректном буфере. */
    const wantBuf = Math.floor(r.width * (this._dpr || 1));
    if (r.width && buf < wantBuf * 0.9) {
      return { ok: false, detail: "буфер " + this._canvas.width + "×" +
        this._canvas.height + " при ожидании " + wantBuf + " по ширине" +
        " (бокс " + Math.round(r.width) + "×" + Math.round(r.height) + ")" };
    }
    return drawn === want && want > 0
      ? { ok: true, detail: "точек нарисовано " + drawn + ", буфер " +
          this._canvas.width + "×" + this._canvas.height }
      : { ok: false, detail: "точек нарисовано " + drawn + " из " + want };
  },

  pause() {},   // петли нет: рисуем только по жесту
  resume() { this._ensureSized(); this._draw(); },

  reset() {
    this._status = "all";
    this._hitIdx = 0;
    this._lastHitKey = "";
    if (this._overlay) this._overlay.close();
    this._renderAll();
    this._fit();
    this._draw();
  },

  /* Подпись подсказки — тоже контент: без setLabel китайский посетитель
   * читал бы русский дефолт KioskHint. */
  setLang() {
    this._renderAll();
    if (this._hint) this._hint.setLabel(this._app.t("hint.pinch"));
    this._draw();
  },

  /* Лифт подсказки не трогаем: бар подрастёт от токенов a11y, и наблюдатель
   * на баре пересчитает сам — на том кадре, когда перелайаут действительно
   * случится. */
  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
    this._draw();   // точки крупнее, подписи городов гаснут — см. _draw()
  },

  /* ─── геометрия ─────────────────────────────────────────────────────── */

  _size() {
    const c = this._canvas;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const budget = Math.sqrt(PIXEL_BUDGET / Math.max(1, rect.width * rect.height));
    /* Пол в 1 нельзя ставить снаружи: на боксе крупнее 4K бюджет требует
     * масштаба МЕНЬШЕ единицы, а Math.max(1, …) это требование обнулял бы.
     * На прод-4K недостижимо, но формула должна быть верной. */
    const dpr = Math.min(Math.max(1, Math.min(2, window.devicePixelRatio || 1)), budget);
    c.width = Math.max(1, Math.floor(rect.width * dpr));
    c.height = Math.max(1, Math.floor(rect.height * dpr));
    this._dpr = dpr;
    const proj = this._projection();
    this._cam.worldW = (rect.width / 180) * 360;
    this._cam.worldH = this._cam.worldW / proj.ASPECT;
  },

  /* Канон — Winkel Tripel; плоская оставлена настройкой для сверки. */
  _projection() {
    return this._cfg && this._cfg.projection === "flat"
      ? window.MtkProjection.Equirectangular
      : window.MtkProjection.WinkelTripel;
  },

  _project(lat, lng) {
    return this._projection().project(lat, lng, this._cam.worldW, this._cam.worldH);
  },

  _fit() {
    const c = this._canvas;
    if (!c || !this._cam.worldW) return;
    const rect = c.getBoundingClientRect();
    const V = this._view();
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
      const lat = V.latMin + (V.latMax - V.latMin) * (i / 8);
      const lng = V.lonMin + (V.lonMax - V.lonMin) * (j / 8);
      const p = this._project(lat, lng);
      if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
    }
    const w = Math.max(1, xMax - xMin), h = Math.max(1, yMax - yMin);
    this._cam.zoom = this._clampZoom(Math.min(rect.width / w, rect.height / h));
    this._cam.camX = (xMin + xMax) / 2 - rect.width / 2;
    this._cam.camY = (yMin + yMax) / 2 - rect.height / 2;
  },

  _clampZoom(z) { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)); },

  _toScreen(wx, wy) {
    const r = this._canvas.getBoundingClientRect();
    const m = this._cam;
    return {
      x: r.width / 2 + (wx - m.camX - r.width / 2) * m.zoom,
      y: r.height / 2 + (wy - m.camY - r.height / 2) * m.zoom,
    };
  },

  _toWorld(cx, cy) {
    const r = this._canvas.getBoundingClientRect();
    const m = this._cam;
    return {
      x: (cx - r.width / 2) / m.zoom + r.width / 2 + m.camX,
      y: (cy - r.height / 2) / m.zoom + r.height / 2 + m.camY,
    };
  },

  _items() {
    return this._data.items.filter((it) =>
      this._status === "all" || it.status === this._status);
  },

  /* ─── отрисовка ─────────────────────────────────────────────────────── */

  /* Буфер обязан соответствовать CSS-боксу. Сцена монтируется в невидимом
   * слое, где ResizeObserver может не сработать ни разу, — тогда канвас
   * остаётся с дефолтными 300×150 и карта рисуется в 4% разрешения.
   * Поэтому сверяем перед каждой отрисовкой: это одно сравнение. */
  _ensureSized() {
    const c = this._canvas;
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const wantW = Math.floor(r.width * (this._dpr || 1));
    const wantH = Math.floor(r.height * (this._dpr || 1));
    if (Math.abs(c.width - wantW) > 1 || Math.abs(c.height - wantH) > 1 ||
        !this._cam.worldW) {
      const first = !this._cam.worldW;
      this._size();
      if (first) this._fit();
    }
  },

  _draw() {
    const c = this._canvas, ctx = this._ctx2d;
    if (!c || !ctx) return;
    this._ensureSized();
    const r = c.getBoundingClientRect();
    const W = r.width, H = r.height;
    const a11y = this._app.a11y;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 50, W * 0.5, H * 0.5, Math.max(W, H));
    bg.addColorStop(0, "rgba(67, 80, 89, 0.40)");
    bg.addColorStop(1, "rgba(12, 16, 18, 0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const m = this._cam;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(m.zoom, m.zoom);
    ctx.translate(-W / 2, -H / 2);
    ctx.translate(-m.camX, -m.camY);
    this._drawCountries(ctx);
    ctx.restore();

    this._drawDots(ctx, a11y);
    if (!a11y && this._cfg.showCities !== false) this._drawCities(ctx);
  },

  _drawCountries(ctx) {
    const feats = (this._geo && this._geo.features) || [];
    ctx.fillStyle = "rgba(12, 16, 18, 0.55)";
    ctx.strokeStyle = "rgba(210, 183, 115, 0.22)";
    ctx.lineWidth = Number(this._cfg.borderWidth) / this._cam.zoom;
    for (const f of feats) {
      const g = f.geometry;
      if (!g) continue;
      const polys = g.type === "Polygon" ? [g.coordinates]
        : g.type === "MultiPolygon" ? g.coordinates : [];
      for (const poly of polys) {
        for (const ring of poly) {
          ctx.beginPath();
          for (let i = 0; i < ring.length; i++) {
            const p = this._project(ring[i][1], ring[i][0]);
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  },

  _dotRadius(a11y) {
    const base = Number(this._cfg.dotRadius) || 10;
    /* На 3840 точки крупнее вдвое; в режиме слабовидящих — ещё в полтора. */
    const vw = Math.min(2, Math.max(1, window.innerWidth / 1920));
    return base * vw * (a11y ? 1.5 : 1);
  },

  _drawDots(ctx, a11y) {
    const R = this._dotRadius(a11y);
    this._drawn = 0;
    for (const it of this._items()) {
      if (typeof it.lat !== "number") continue;
      const w = this._project(it.lat, it.lng);
      const p = this._toScreen(w.x, w.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.fillStyle = STATUS_COLOR[it.status] || "#d2b773";
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, R * 0.14);
      ctx.strokeStyle = "rgba(12, 16, 18, 0.75)";
      ctx.stroke();
      this._drawn++;
    }
  },

  _drawCities(ctx) {
    const R = this._dotRadius(false);
    const size = Math.max(20, Number(this._cfg.citySize) * this._uiScale() * 1.6);
    ctx.save();
    ctx.font = '500 ' + size + 'px "20 Kopeek", "Courier New", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(247, 249, 239, " + (Number(this._cfg.cityOpacity) / 100).toFixed(2) + ")";
    const seen = new Set();
    for (const it of this._items()) {
      if (typeof it.lat !== "number" || seen.has(it.city)) continue;
      seen.add(it.city);
      const w = this._project(it.lat, it.lng);
      const p = this._toScreen(w.x, w.y);
      ctx.fillText(it.city, p.x + R + 8, p.y);
    }
    ctx.restore();
  },

  /* ─── жесты ─────────────────────────────────────────────────────────── */

  _bindGestures() {
    const c = this._canvas;
    const pts = new Map();
    let dragged = false, lastDist = 0, last = null, lastMid = null;

    this._onDown = (e) => {
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragged = false;
      last = { x: e.clientX, y: e.clientY };
      lastDist = 0; lastMid = null;
    };
    this._onMove = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const arr = [...pts.values()];
      if (arr.length >= 2) {
        const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
        const mid = { x: (arr[0].x + arr[1].x) / 2, y: (arr[0].y + arr[1].y) / 2 };
        if (lastDist) {
          this._zoomAt(mid, d / lastDist);
          /* Карта должна ехать за пальцами: смещение середины щипка —
           * это пан. Без него двумя пальцами можно было только масштаб. */
          if (lastMid) {
            this._cam.camX -= (mid.x - lastMid.x) / this._cam.zoom;
            this._cam.camY -= (mid.y - lastMid.y) / this._cam.zoom;
          }
          dragged = true;
        }
        lastDist = d;
        lastMid = mid;
        this._draw();
        return;
      }
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
      this._cam.camX -= dx / this._cam.zoom;
      this._cam.camY -= dy / this._cam.zoom;
      last = { x: e.clientX, y: e.clientY };
      this._draw();
    };
    this._onUp = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) { lastDist = 0; lastMid = null; }
      if (pts.size === 0) {
        if (!dragged) this._pick(e.clientX, e.clientY);
        last = null;
      }
    };
    this._onWheel = (e) => {
      e.preventDefault();
      this._zoomAt({ x: e.clientX, y: e.clientY },
        Math.exp(-e.deltaY * Number(this._cfg.zoomSensitivity) / 1000));
      this._draw();
    };

    c.addEventListener("pointerdown", this._onDown);
    c.addEventListener("pointermove", this._onMove);
    c.addEventListener("pointerup", this._onUp);
    c.addEventListener("pointercancel", this._onUp);
    c.addEventListener("wheel", this._onWheel, { passive: false });
  },

  _unbindGestures() {
    const c = this._canvas;
    if (!c) return;
    c.removeEventListener("pointerdown", this._onDown);
    c.removeEventListener("pointermove", this._onMove);
    c.removeEventListener("pointerup", this._onUp);
    c.removeEventListener("pointercancel", this._onUp);
    c.removeEventListener("wheel", this._onWheel);
  },

  /* Принимает КЛИЕНТСКИЕ координаты и сам переводит их в локальные.
   * Раньше колесо слало локальные, а пинч — клиентские, и разница
   * маскировалась только тем, что канвас занимает весь экран. */
  _zoomAt(clientPt, k) {
    const r = this._canvas.getBoundingClientRect();
    const x = clientPt.x - r.left, y = clientPt.y - r.top;
    const before = this._toWorld(x, y);
    this._cam.zoom = this._clampZoom(this._cam.zoom * k);
    const after = this._toWorld(x, y);
    this._cam.camX += before.x - after.x;
    this._cam.camY += before.y - after.y;
  },

  /* Точки перекрываются — повторный тап в ту же зону открывает соседнюю. */
  _pick(clientX, clientY) {
    const r = this._canvas.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    const R = this._dotRadius(this._app.a11y);
    /* Тач-стандарт п.1: попадание не меньше 64 px, даже если точка мельче. */
    const hitR = Math.max(R + 12, 64);
    const hits = [];
    for (const it of this._items()) {
      if (typeof it.lat !== "number") continue;
      const w = this._project(it.lat, it.lng);
      const p = this._toScreen(w.x, w.y);
      if (Math.hypot(p.x - x, p.y - y) <= hitR) hits.push(it);
    }
    if (!hits.length) return;
    const key = hits.map((h) => h.id).join(",");
    this._hitIdx = key === this._lastHitKey ? (this._hitIdx + 1) % hits.length : 0;
    this._lastHitKey = key;
    this._overlay.open(museumCardHtml(this._app, hits[this._hitIdx], this._data.regions));
  },

  /* ─── хром сцены ────────────────────────────────────────────────────── */

  _renderAll() {
    if (!this._root) return;
    const t = (k) => this._app.t(k);
    this._root.querySelector(".m42-head__title").textContent = t("museums.title");
    this._root.querySelector(".m42-head__sub").textContent = t("museums.map.subtitle");
    this._resetBtn.textContent = t("map.reset");
    if (this._overlay) this._overlay.close();
    this._renderFilters();
  },

  _renderFilters() {
    const t = (k) => this._app.t(k);
    this._statusRow.innerHTML = STATUSES.map((v) =>
      '<button type="button" class="m42-filter kiosk-target' +
      (v === this._status ? " is-active" : "") + '" data-value="' + v + '">' +
      esc(t("status." + v)) + "</button>").join("");
  },

  /* Сколько своя нижняя панель фильтров занимает над линией --chrome-bottom.
   * В CSS высоту соседнего элемента не узнать, поэтому меряем и публикуем
   * переменной. Единственный вызов — из наблюдателя на самом баре (см. mount):
   * он приходит тогда, когда перелайаут уже случился.
   *
   * Инвариант приёмки — «зазор между низом подсказки и верхом чипов РОВНО
   * столько-то», а не расплывчатое «перекрытий нет». Величина зависит от
   * режима, потому что база кита складывается как need + 12 × --ui-scale:
   * 12 px в обычном режиме и 15 px в режиме слабовидящих (12 × 1.25).
   * Число рядов чипов на это не влияет — лифт следует за высотой бара.
   * (Прежняя редакция говорила «РОВНО 24» — это от старого переопределения
   * с собственным запасом, снятого при переходе на кит 1.12.0.) */
  _liftHint() {
    if (!this._root) return;
    const bar = this._root.querySelector(".m42-filters--bottom");
    const h = bar ? Math.ceil(bar.getBoundingClientRect().height) : 0;
    this._root.style.setProperty("--m42-hint-lift", h + "px");

    /* На узко-высоком экране в a11y бар разрастается до трёх рядов, подсказка
     * уезжает вверх и упирается в заголовок сцены (замер координатора:
     * 1280×1080, бар 400 → хинт на y=196). Зазор до чипов при этом честные 24,
     * но выше места уже нет — держать оба инварианта физически невозможно.
     * Выбор: гасим подсказку, а не заголовок. Она вспомогательная и всё равно
     * исчезает по первому касанию, а перечёркнутый заголовок выглядит поломкой.
     * Гасим через visibility, а не display: бокс остаётся измеримым, иначе
     * следующий замер увидел бы нули и класс залип бы навсегда. */
    const hint = this._root.querySelector(".kiosk-hint");
    const head = this._root.querySelector(".m42-head");
    if (!hint || !head) return;
    const hr = hint.getBoundingClientRect(), fr = head.getBoundingClientRect();
    if (!hr.height) return;                       // ещё не отрисована — не судим
    this._root.classList.toggle("is-hint-cramped", hr.top < fr.bottom + 12);
  },
};
