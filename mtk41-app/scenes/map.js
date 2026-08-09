/* Сцена «Карта» — 283 памятника, иерархия макро-регион → страна → город →
 * памятник. Перенос из mtk41-map-hier/ на контракт сцены.
 *
 * Проекция — общий канон MtkProjection.WinkelTripel (COORDINATION 2026-07-08):
 * порядок аргументов (lat, lng), аспект только из WT.ASPECT, локальной
 * WT-математики здесь нет. Скрипт проекции подключается в index.html обычным
 * <script> — это не модуль, импортировать его нельзя.
 *
 * Математика иерархии (макро-разметка, агломеративное дерево, материализация
 * уровня, разведение кружков) вынесена в map-core.js и перенесена из
 * прототипа без изменений по существу: алгоритм проверен на корпусе, и
 * переписывать его ради переезда смысла не было.
 *
 * Здесь — жизненный цикл сцены, камера, ввод и отрисовка. */
import {
  DATA, PALETTE, createCanvasHost, createCard, cssColor, preloadThumbs, statusColor,
  createHint,
} from "./shared.js?v=35";
import { createMapCore } from "./map-core.js?v=35";

const PIXEL_BUDGET = 3840 * 2160;
const TAP_THRESHOLD = 8;

/* Пресеты стартового вида из описи настроек. */
const VIEW_PRESETS = {
  world: { lat: 15, lng: 20, zoom: 0.5 },
  eurasia: { lat: 42, lng: 30, zoom: 0.75 },
  "ex-ussr": { lat: 55, lng: 55, zoom: 1.2 },
};

export const mapScene = {
  id: "map",
  title: { ru: "Карта", en: "Map", zh: "地图" },

  preload: {
    data: {
      monuments: DATA.monuments,
      photos: DATA.photos,
      thumbs: DATA.thumbs,
      cards: DATA.cards,
      heights: DATA.heights,
      countries: DATA.countries,
    },
    custom: preloadThumbs,
  },

  /* Двенадцать позиций класса А из SETTINGS-INVENTORY → «МТК 41». Порядок
   * и дефолты сохранены как в описи, чтобы сверка на приёмке была прямой. */
  settings: [
    { key: "view", label: { ru: "Стартовый вид", en: "Start view" },
      type: "choice", default: "eurasia",
      options: [{ value: "world", label: { ru: "Мир", en: "World" } },
                { value: "eurasia", label: { ru: "Европа + СССР", en: "Europe + USSR" } },
                { value: "ex-ussr", label: { ru: "Бывший СССР", en: "ex-USSR" } }] },
    { key: "sizeMode", label: { ru: "Размер кружка", en: "Circle size" },
      type: "choice", default: "sqrt",
      options: [{ value: "sqrt", label: { ru: "√N" } },
                { value: "linear", label: { ru: "N" } },
                { value: "log", label: { ru: "log N" } }] },
    { key: "thrCountry", label: { ru: "Порог: макро → страна" },
      type: "range", min: 0.6, max: 1.6, step: 0.05, default: 1.0 },
    { key: "thrRegion", label: { ru: "Порог: страна → регион" },
      type: "range", min: 1.2, max: 2.4, step: 0.05, default: 1.7 },
    { key: "thrCity", label: { ru: "Порог: регион → город" },
      type: "range", min: 1.8, max: 3.0, step: 0.05, default: 2.3 },
    { key: "thrLeaf", label: { ru: "Порог: город → памятник" },
      type: "range", min: 2.4, max: 4.5, step: 0.05, default: 3.2 },
    { key: "gap", label: { ru: "Зазор между кружками" },
      type: "range", min: 0, max: 20, step: 1, unit: " px", default: 6 },
    { key: "labelScale", label: { ru: "Размер названий" },
      type: "range", min: 0.8, max: 2.2, step: 0.05, unit: "×", default: 1.4 },
    { key: "showMacroLabels", label: { ru: "Лейблы макро-регионов" },
      type: "toggle", default: true },
    { key: "showConnectors", label: { ru: "Связки к кружкам" },
      type: "toggle", default: true },
    { key: "showOutliers", label: { ru: "Антарктида и Шпицберген" },
      type: "toggle", default: true },
    { key: "crossfade", label: { ru: "Кроссфейд уровней" },
      type: "toggle", default: true },
  ],

  mount(el, ctx) {
    this._ctx = ctx;
    this._app = ctx.app;

    const root = document.createElement("div");
    root.className = "m41-scene m41-map";
    root.innerHTML =
      '<header class="m41-head"><h1 class="m41-head__title"></h1>' +
      '<p class="m41-head__sub"></p></header>' +
      '<div class="m41-map__stage"></div>' +
      '<div class="m41-nav"><div class="m41-nav__row" data-nav></div></div>';
    el.appendChild(root);

    this._root = root;
    this._stage = root.querySelector(".m41-map__stage");
    this._titleEl = root.querySelector(".m41-head__title");
    this._subEl = root.querySelector(".m41-head__sub");
    this._navEl = root.querySelector("[data-nav]");
    this._card = createCard(el, ctx.app, ctx);
    this._card.onClose(() => { this._selected = -1; });

    this._host = createCanvasHost(this._stage, "m41-map__canvas");

    /* Подсказка — на СТОЛ, не на канву: детей <canvas> браузер не рисует.
     * Стол ужимается, когда растут собственные контролы (режим слабовидящих
     * растит --ui-scale), поэтому подсказка не наезжает на них ни в одном
     * режиме — защита структурная, а не подобранным числом. */
    this._hint = createHint(this._stage, "drag", "hint." + this.id, ctx.app);
    this._host.observe(() => { this._resized(); });

    this._items = (ctx.data.monuments.items || [])
      .filter((m) => typeof m.lat === "number" && typeof m.lng === "number");
    this._geo = ctx.data.countries || null;
    this._selected = -1;
    this._map = { zoom: 0.8, camX: 0, camY: 0, worldW: 0, worldH: 0 };
    this._anim = null;
    this._clusters = [];

    /* Зависимости для вынесенной математики: она чистая и берёт всё отсюда.
     * Через геттеры, а не значения: настройки и размер меняются в рантайме,
     * а ядро должно видеть текущие. */
    const self = this;
    this._core = createMapCore({
      monuments: this._items,
      map: this._map,
      get settings() { return self._cfg || {}; },
      get width() { return self._host ? self._host.width : 0; },
      get height() { return self._host ? self._host.height : 0; },
      project: (lat, lng) => this._project(lat, lng),
      pointToScreen: (wx, wy) => this._pointToScreen(wx, wy),
      shortSide: () => Math.min(this._host.width, this._host.height),
    });

    this._bindPointer();
    this._onNav = (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      if (b.getAttribute("data-act") === "home") this._applyPreset(this._cfg.view, false);
      else if (b.getAttribute("data-act") === "out") this._zoomOut();
    };
    this._navEl.addEventListener("click", this._onNav);

    this.applySettings(this._cfg || {});
  },

  unmount() {
    if (this._deferId) { clearTimeout(this._deferId); this._deferId = 0; }
    if (this._hint) { this._hint.destroy(); this._hint = null; }
    if (this._host) this._host.destroy();
    if (this._card) this._card.destroy();
    if (this._navEl) this._navEl.removeEventListener("click", this._onNav);
    if (this._root) this._root.remove();
    this._root = this._host = this._card = null;
  },

  /* Неактивная сцена — 0 rAF и 0 таймеров: гасим и отложенный замер тоже. */
  pause() {
    if (this._deferId) { clearTimeout(this._deferId); this._deferId = 0; }
    if (this._host) this._host.stop();
  },

  resume() {
    if (!this._host) return;
    this._host.measure();
    this._resized();
    this._deferMeasure();
    this._host.start(() => this._frame());
  },

  /* Отложенный повторный замер. В момент resume() слой ещё может быть 0×0:
   * ядро показывает его следующим кадром. rAF для этого не годится — в
   * скрытой вкладке он не вызывается вовсе, а таймер, пусть и задушенный,
   * всё-таки сработает. Один раз, не в цикле. */
  _deferMeasure() {
    if (this._deferId) clearTimeout(this._deferId);
    this._deferId = setTimeout(() => {
      this._deferId = 0;
      if (!this._host) return;
      this._host.measure();
      this._resized();
      if (!this._built) this._built = this._applyPreset(this._cfg.view, true);
    }, 0);
  },

  reset() {
    if (this._card) this._card.close();
    this._selected = -1;
    this._anim = null;
    /* Уровень иерархии — в стартовый: посетитель мог провалиться до города,
     * и следующий не должен начинать с чужого масштаба. */
    this._applyPreset((this._cfg && this._cfg.view) || "eurasia", true);
  },

  setLang() { this._renderHead(); this._buildNav(); if (this._hint) this._hint.relabel(); },

  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
  },

  healthcheck() {
    if (!this._host) return { ok: true, detail: "не смонтирована" };
    /* Канвовая сцена без размера — это «ещё не показывалась», а не поломка:
     * ядро держит слой скрытым (0×0), пока сцену не откроют, и меряться там
     * нечему. Тот же случай, что и «не смонтирована», принятый в канон ядра
     * по заявке МТК 41. */
    if (!this._host.width) return { ok: true, detail: "ещё не показывалась" };

    /* Буфер сверяем ПО ФАКТИЧЕСКОМУ dpr, а не по ширине бокса: счётчик фигур
     * бывает зелёным, пока сцена рисует всё до одной — но в чужом разрешении
     * (карта 42 так рисовала в 4%). Формула одна с отрисовкой — bufferFor(). */
    const buf = this._host.bufferOk();
    if (!buf.ok) return { ok: false, detail: "буфер " + buf.detail };
    if (!this._items.length) return { ok: false, detail: "ни одной точки с координатами" };
    if (!this._clusters.length) return { ok: false, detail: "на карте не построено ни одного кружка" };
    const shown = this._clusters.reduce((a, c) => a + c.count, 0);
    return { ok: true, detail: `точек ${this._items.length}, в кружках ${shown}, буфер ${buf.detail}` };
  },

  applySettings(values) {
    this._cfg = Object.assign({
      view: "eurasia", sizeMode: "sqrt",
      thrCountry: 1.0, thrRegion: 1.7, thrCity: 2.3, thrLeaf: 3.2,
      gap: 6, labelScale: 1.4,
      showMacroLabels: true, showConnectors: true, showOutliers: true, crossfade: true,
    }, values || {});
    /* Прототип держал те же ключи под другими именами — маппим один раз, чтобы
     * вынесенная математика читала привычные ей поля. */
    this._cfg.thrCluster = { country: this._cfg.thrCountry, region: this._cfg.thrRegion,
      city: this._cfg.thrCity };
    if (!this._host) return;
    this._host.measure();
    this._rebuild();
    if (!this._built) this._built = this._applyPreset(this._cfg.view, true);
    this._buildNav();
    this._renderHead();
    this._deferMeasure();
    if (!this._host.running()) this._host.start(() => this._frame());
  },

  /* ─── геометрия ─────────────────────────────────────────────────────── */

  _project(lat, lng) {
    const WT = window.MtkProjection && window.MtkProjection.WinkelTripel;
    if (!WT) return { x: 0, y: 0 };
    return WT.project(lat, lng, this._map.worldW, this._map.worldH);
  },

  _resized() {
    const h = this._host;
    if (!h || !h.width) return;
    const WT = window.MtkProjection && window.MtkProjection.WinkelTripel;
    if (!WT) return;
    /* Аспект берём ТОЛЬКО из канона: хардкодить его запрещено конвенцией. */
    this._map.worldW = (h.width / 180) * 360;
    this._map.worldH = this._map.worldW / WT.ASPECT;
    this._rebuild();
  },

  _rebuild() {
    if (!this._core || !this._map.worldW) return;
    this._core.buildTree();
    this._rebuildClusters();
  },

  /* Кружки считаются и вне кадра. Иначе healthcheck зависел бы от того,
   * успела ли пройти отрисовка: в скрытой вкладке rAF не вызывается, и стенд
   * приёмки видел бы пустую сцену там, где на киоске всё нарисовано. */
  _rebuildClusters() {
    if (!this._core || !this._map.worldW || !this._host || !this._host.width) return "MACRO";
    const level = this._levelFor(this._map.zoom);
    const world = this._core.buildLevelClusters(level);
    this._clusters = this._core.materializeToScreen(world, this._cfg.sizeMode);
    this._core.relaxNonOverlap(this._clusters, this._cfg.gap, 60);
    return level;
  },

  _pointToScreen(wx, wy) {
    return { x: wx - this._map.camX, y: wy - this._map.camY };
  },

  _clientToWorld(cx, cy) {
    const h = this._host;
    return {
      x: (cx - h.width * 0.5) / this._map.zoom + h.width * 0.5 + this._map.camX,
      y: (cy - h.height * 0.5) / this._map.zoom + h.height * 0.5 + this._map.camY,
    };
  },

  /* Зум в точку касания, а не к центру вьюпорта: иначе, чтобы рассмотреть
   * Прибалтику, её сперва надо подтащить в центр. */
  _zoomAt(next, cx, cy) {
    const z = Math.max(0.2, Math.min(40, next));
    if (z === this._map.zoom) return false;
    const p = this._clientToWorld(cx, cy);
    const h = this._host;
    this._map.zoom = z;
    this._map.camX = p.x - h.width * 0.5 - (cx - h.width * 0.5) / z;
    this._map.camY = p.y - h.height * 0.5 - (cy - h.height * 0.5) / z;
    this._clampCamera();
    return true;
  },

  _clampCamera() {
    const m = this._map, h = this._host;
    if (!m.worldW || !h) return;
    const halfW = h.width * 0.5 / m.zoom, halfH = h.height * 0.5 / m.zoom;
    const xMin = halfW - h.width * 0.5, xMax = m.worldW - h.width * 0.5 - halfW;
    const yMin = halfH - h.height * 0.5, yMax = m.worldH - h.height * 0.5 - halfH;
    if (xMax < xMin) m.camX = (m.worldW - h.width) * 0.5;
    else m.camX = Math.min(xMax, Math.max(xMin, m.camX));
    if (yMax < yMin) m.camY = (m.worldH - h.height) * 0.5;
    else m.camY = Math.min(yMax, Math.max(yMin, m.camY));
  },

  /* Возвращает true, если вид действительно применён. Это важно: пока мир не
   * получил размер (worldW = 0), применять нечего, и вызывающий не должен
   * помечать стартовый вид выставленным — иначе повторной попытки не будет
   * и камера навсегда останется в нуле, а кружки за кадром. */
  _applyPreset(name, instant) {
    const p = VIEW_PRESETS[name] || VIEW_PRESETS.eurasia;
    const h = this._host;
    if (!h || !h.width || !this._map.worldW) return false;
    const target = this._project(p.lat, p.lng);
    const set = () => {
      this._map.zoom = p.zoom;
      this._map.camX = target.x - h.width * 0.5;
      this._map.camY = target.y - h.height * 0.5;
      this._clampCamera();
    };
    this._anim = null;
    set();
    return true;
  },

  _zoomOut() {
    const h = this._host;
    this._zoomAt(this._map.zoom / 1.9, h.width * 0.5, h.height * 0.5);
  },

  _buildNav() {
    if (!this._navEl) return;
    const t = (k) => this._app.t(k);
    this._navEl.innerHTML =
      '<button type="button" class="kiosk-target" data-act="out">' + t("map.out") + "</button>" +
      '<button type="button" class="kiosk-target" data-act="home">' + t("map.home") + "</button>";
  },

  _renderHead() {
    if (!this._titleEl) return;
    const app = this._app;
    this._titleEl.textContent = app.t("map.title");
    const years = this._items.map((m) => m.year).filter((y) => typeof y === "number");
    const countries = new Set(this._items.map((m) => m.country).filter(Boolean));
    this._subEl.textContent = app.t("map.subtitle", {
      n: this._items.length,
      c: countries.size,
      years: years.length ? Math.min(...years) + "–" + Math.max(...years) : "",
    });
  },

  /* ─── ввод ──────────────────────────────────────────────────────────── */

  _bindPointer() {
    const c = this._host.canvas;
    const st = { down: false, drag: false, x0: 0, y0: 0, lx: 0, ly: 0,
      pointers: new Map(), pinchDist: 0, pinchZoom: 1 };
    this._pst = st;

    this._onDown = (e) => {
      const r = c.getBoundingClientRect();
      st.pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      if (st.pointers.size === 2) {
        const [a, b] = [...st.pointers.values()];
        st.pinchDist = Math.hypot(b.x - a.x, b.y - a.y);
        st.pinchZoom = this._map.zoom;
        st.down = false;
        return;
      }
      st.down = true; st.drag = false;
      st.x0 = e.clientX; st.y0 = e.clientY;
      st.lx = e.clientX; st.ly = e.clientY;
      this._anim = null;
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
    };

    this._onMove = (e) => {
      const r = c.getBoundingClientRect();
      if (st.pointers.has(e.pointerId)) {
        st.pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      }
      if (st.pointers.size === 2 && st.pinchDist > 0) {
        const [a, b] = [...st.pointers.values()];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        /* Якорь — живая середина между пальцами: щипок увеличивает то место,
         * которое держат, а не центр экрана. */
        this._zoomAt(st.pinchZoom * (d / st.pinchDist), (a.x + b.x) / 2, (a.y + b.y) / 2);
        st.drag = true;
        return;
      }
      if (!st.down) return;
      const dx = e.clientX - st.lx, dy = e.clientY - st.ly;
      if (!st.drag && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > TAP_THRESHOLD) {
        st.drag = true;
      }
      if (st.drag) {
        this._map.camX -= dx / this._map.zoom;
        this._map.camY -= dy / this._map.zoom;
        this._clampCamera();
      }
      st.lx = e.clientX; st.ly = e.clientY;
    };

    this._onUp = (e) => {
      st.pointers.delete(e.pointerId);
      if (st.pointers.size < 2) st.pinchDist = 0;
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* не критично */ }
      if (st.down && !st.drag) {
        const r = c.getBoundingClientRect();
        this._tap(e.clientX - r.left, e.clientY - r.top);
      }
      st.down = false;
    };

    this._onWheel = (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this._zoomAt(this._map.zoom * Math.exp(-e.deltaY * 0.0015),
        e.clientX - r.left, e.clientY - r.top);
    };

    c.addEventListener("pointerdown", this._onDown);
    c.addEventListener("pointermove", this._onMove, { passive: true });
    c.addEventListener("pointerup", this._onUp);
    c.addEventListener("pointercancel", this._onUp);
    c.addEventListener("wheel", this._onWheel, { passive: false });
  },

  _tap(x, y) {
    const hit = this._findAt(x, y);
    if (!hit) { this._card.close(); return; }
    /* Одиночный памятник — карточка; кластер — провал на уровень глубже. */
    if (hit.count === 1 && hit.indices && hit.indices.length === 1) {
      this._selected = hit.indices[0];
      this._card.open(this._items[hit.indices[0]]);
      this._app.poke();
      return;
    }
    this._zoomAt(this._map.zoom * 2.1, hit.sx, hit.sy);
  },

  _findAt(x, y) {
    let best = null, bestD = Infinity;
    for (const cl of this._clusters) {
      const d = Math.hypot(x - cl.sx, y - cl.sy);
      const r = Math.max(cl.rVpx, 22);
      if (d <= r && d < bestD) { bestD = d; best = cl; }
    }
    return best;
  },

  /* ─── отрисовка ─────────────────────────────────────────────────────── */

  _frame() {
    const h = this._host;
    if (!h) return;
    /* Самовосстановление раскладки. На ResizeObserver полагаться нельзя: в
     * скрытой вкладке он не доставляется вовсе (README ядра), а при первом
     * показе сцены слой ещё 0×0 — измерение возвращает ноль, мир не строится
     * и дерево остаётся пустым. Здесь ловим момент, когда размер наконец
     * появился, и дособираем то, чего не хватает. */
    if (h.width && (!this._map.worldW || !this._core.tree.children.length)) {
      this._host.measure();
      this._resized();
    }
    if (!this._map.worldW) return;
    /* Стартовый вид пробуем КАЖДЫЙ кадр, пока не применится, а не внутри
     * условия выше: мир мог собраться отложенным замером, когда слой был ещё
     * 0×0 — тогда условие уже ложно, а камера так и осталась в нуле и все
     * кружки оказались за кадром. Проверка — один булев флаг. */
    if (!this._built) this._built = this._applyPreset(this._cfg.view, true);
    const ctx = h.ctx;
    ctx.clearRect(0, 0, h.width, h.height);

    ctx.save();
    ctx.translate(h.width * 0.5, h.height * 0.5);
    ctx.scale(this._map.zoom, this._map.zoom);
    ctx.translate(-h.width * 0.5, -h.height * 0.5);
    this._drawBase();
    ctx.restore();

    const level = this._rebuildClusters();
    this._drawClusters(level);
  },

  _levelFor(z) {
    const c = this._cfg;
    if (z < c.thrCountry) return "MACRO";
    if (z < c.thrRegion) return "COUNTRY";
    if (z < c.thrCity) return "REGION";
    if (z < c.thrLeaf) return "CITY";
    return "LEAF";
  },

  _drawBase() {
    const h = this._host, ctx = h.ctx, m = this._map;
    if (!this._geo || !this._geo.features) return;
    const invZ = 1 / m.zoom;
    ctx.save();
    ctx.fillStyle = cssColor(PALETTE.graphite, 0.34);
    ctx.strokeStyle = cssColor(PALETTE.brass, 0.18);
    ctx.lineWidth = Math.max(0.4, invZ);
    for (const f of this._geo.features) {
      const g = f.geometry;
      if (!g) continue;
      const polys = g.type === "Polygon" ? [g.coordinates]
        : g.type === "MultiPolygon" ? g.coordinates : [];
      for (const poly of polys) {
        for (const ring of poly) {
          ctx.beginPath();
          for (let i = 0; i < ring.length; i += 1) {
            /* GeoJSON — [lng, lat]; канон проекции ждёт (lat, lng). */
            const p = this._project(ring[i][1], ring[i][0]);
            const s = this._pointToScreen(p.x, p.y);
            if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  },

  _drawClusters(level) {
    const h = this._host, ctx = h.ctx;
    const fs = Math.max(11, Math.min(h.height * 0.02, 30)) * this._cfg.labelScale;

    for (const cl of this._clusters) {
      if (cl.sx < -120 || cl.sx > h.width + 120) continue;
      if (this._cfg.showConnectors && cl.anchorX != null) {
        ctx.save();
        ctx.strokeStyle = cssColor(PALETTE.paper, 0.22);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cl.anchorX, cl.anchorY);
        ctx.lineTo(cl.sx, cl.sy);
        ctx.stroke();
        ctx.restore();
      }

      const single = cl.count === 1;
      const status = single && cl.indices ? this._items[cl.indices[0]].status : null;
      const sel = single && cl.indices && cl.indices[0] === this._selected;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cl.sx, cl.sy, cl.rVpx, 0, Math.PI * 2);
      ctx.fillStyle = sel ? PALETTE.brass
        : single ? statusColor(status) : cssColor(PALETTE.brass, 0.82);
      ctx.fill();
      ctx.strokeStyle = cssColor(PALETTE.paper, sel ? 0.9 : 0.35);
      ctx.lineWidth = sel ? 2 : 1;
      ctx.stroke();

      if (!single && cl.rVpx > 12) {
        ctx.fillStyle = "#1c2226";
        ctx.font = `600 ${Math.min(cl.rVpx * 0.9, 34)}px "20 Kopeek", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(cl.count), cl.sx, cl.sy);
      }
      ctx.restore();

      const wantLabel = level === "MACRO" ? this._cfg.showMacroLabels : true;
      if (wantLabel && cl.label && cl.rVpx > 8) {
        ctx.save();
        ctx.font = `400 ${fs}px "Nolde", Georgia, serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.shadowColor = cssColor(PALETTE.black, 0.75);
        ctx.shadowBlur = 6;
        ctx.fillStyle = cssColor(PALETTE.paper, 0.9);
        ctx.fillText(cl.label, cl.sx + cl.rVpx + 8, cl.sy);
        ctx.restore();
      }
    }
  },
};
