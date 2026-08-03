/* МТК 38 · сцена «Карта» — написания и издания на карте мира.
 *
 * Проекция — канон проекта Winkel Tripel (assets/shared/lib/projection.js),
 * как у МТК 41/42. Своей математики проекции здесь нет, аспект только из
 * WT.ASPECT. WT не цилиндрическая, поэтому камера по X зажимается, а не
 * заворачивается, и подложка рисуется одной копией.
 *
 * Два слоя. «Языки» — точка по «дому» языка. «Издания» — точка по ГОРОДУ
 * ПЕЧАТИ: без него десять испанских изданий из десяти стран Латинской Америки
 * сходились в одну точку в Мадриде, а Северная Америка пустовала совсем.
 * «Оба» дотягивает от издания к языку волосяную линию.
 */
import { loadData, famWord, PAL, rgba, beginStandby, standbyLoop, standbyFps } from "./shared.js?v=8";
import { createCard } from "./card.js?v=8";

const GEO_URL = "../data/ne_110m_countries.geojson";
const TEX = {
  relief: "../assets/mtk38/textures/earth-relief-wt.webp",
  physical: "../assets/mtk38/textures/earth-physical-wt.webp",
};

export const mapScene = {
  id: "map",
  title: { ru: "Карта", en: "Map", zh: "地图" },

  /* Схема настроек v1.2 — позиции класса А из SETTINGS-INVENTORY (v3 map).
   * Слой («показать») здесь НЕТ: это класс Б, он остаётся пилюлей на сцене. */
  settings: [
    /* Пары-массивы, а не {value,label}: ядро 1.5/1.6 рендерит label-объект как
     * «[object Object]» (заявка в kiosk-core, чинят к 1.7). */
    { key: "base", label: { ru: "Подложка" }, type: "select", default: "countries",
      options: [["countries", "Страны"], ["relief", "Рельеф"], ["physical", "Физическая"]] },
    { key: "routes", label: { ru: "Связи с Москвой" }, type: "toggle", default: true },
    { key: "dot", label: { ru: "Размер точек" }, type: "range", min: 0.4, max: 2, step: 0.05, default: 1 },
    { key: "borders", label: { ru: "Границы на растре" }, type: "toggle", default: true },
    { key: "label", label: { ru: "Размер подписей" }, type: "range",
      min: 0.5, max: 2.2, step: 0.05, default: 1 },
    { key: "glow", label: { ru: "Свечение" }, type: "range",
      min: 0, max: 1.5, step: 0.05, default: 0.5 },
    /* Параллели и меридианы. В Winkel Tripel они кривые и сэмплируются, но
     * куратор всё равно должен уметь их приглушить или снять совсем. */
    { key: "guides", label: { ru: "Сетка" }, type: "range",
      min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: "grain", label: { ru: "Зерно" }, type: "range",
      min: 0, max: 0.2, step: 0.005, default: 0.05 },
    { key: "vign", label: { ru: "Виньетка" }, type: "range",
      min: 0, max: 1, step: 0.02, default: 1 },
    { key: "bg", label: { ru: "Фон" }, type: "range",
      min: 8, max: 40, step: 1, default: 15 },
  ],

  preload: { data: { geo: GEO_URL }, custom: async () => { await loadData(); } },

  async mount(el, ctx) {
    this._app = ctx.app;
    const data = await loadData();
    this._langs = data.langs.filter((w) => w.lat != null && w.lng != null);
    this._pubs = data.pubs;

    /* точки изданий — по городу печати */
    this._places = [];
    for (const [langId, arr] of this._pubs) {
      const lang = this._langs.find((x) => x.id === langId) || null;
      arr.forEach((p, i) => {
        if (p.cityLat == null) return;
        this._places.push({ lang, pub: p, idx: i, lat: p.cityLat, lng: p.cityLng });
      });
    }

    this._layer = "lang";
    this._cfg = this._cfg || {};
    this._geo = null;
    this._tex = { relief: null, physical: null };
    this._cache = null;
    this._hits = [];
    this._map = { worldW: 0, worldH: 0, baseW: 0, zoom: 1, camX: 0, camY: 0,
                  camVX: 0, camVY: 0, camYAnchor: 0, dragging: false };

    const root = document.createElement("div");
    root.className = "m38-scene m38-map";
    root.innerHTML =
      '<canvas class="m38-canvas"></canvas>' +
      '<header class="m38-head"><div class="m38-kicker"></div>' +
      '<h1 class="m38-title"></h1><p class="m38-sub"></p></header>' +
      '<nav class="m38-pills" role="radiogroup"><span class="m38-pills__lab"></span>' +
      '<button type="button" class="m38-pill kiosk-target" data-layer="lang"></button>' +
      '<button type="button" class="m38-pill kiosk-target" data-layer="pub"></button>' +
      '<button type="button" class="m38-pill kiosk-target" data-layer="both"></button></nav>';
    el.appendChild(root);

    this._root = root;
    this._canvas = root.querySelector(".m38-canvas");
    this._ctx2d = this._canvas.getContext("2d");
    this._pills = root.querySelector(".m38-pills");
    this._card = createCard({ publications: this._pubs, t: (k) => (this._app ? this._app.t(k) : null),
      lang: () => (this._app ? this._app.lang : "ru") });

    // контуры стран пришли ещё на сплэше (preload) — второй раз не ходим
    const pre = ctx && ctx.data && ctx.data.geo;
    if (pre) { this._geo = pre; this._rebuild(); }
    else {
      fetch(GEO_URL).then((r) => r.json()).then((g) => {
        this._geo = g; this._rebuild(); this._draw();
      }).catch(() => {});
    }

    this._onPill = (e) => {
      const b = e.target.closest("[data-layer]");
      if (!b) return;
      this._layer = b.getAttribute("data-layer");
      this._syncPills();
      this._draw();
    };
    this._pills.addEventListener("click", this._onPill);

    this._bind();
    this._ro = new ResizeObserver(() => { this._size(); this._rebuild(); this._draw(); });
    this._ro.observe(this._canvas);

    if (window.KioskHint) this._hint = window.KioskHint.attach(this._canvas, { gesture: "pinch" });

    this.setLang(ctx.lang || "ru");
    this._size();
    this.applySettings(this._cfg);
  },

  unmount() {
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._hint && this._hint.destroy) this._hint.destroy();
    if (this._pills) this._pills.removeEventListener("click", this._onPill);
    this._unbind();
    if (this._card) { this._card.destroy(); this._card = null; }
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._root) this._root.remove();
    this._root = this._canvas = this._ctx2d = this._pills = null;
    this._geo = this._cache = this._langs = this._places = null;
  },

  pause() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } },
  resume() { if (!this._raf) this._loop(); },

  /* Контракт ядра: standby() без аргумента, возврат — стоп-функция аттрактора.
   * Карта статична, поэтому в заставке она сама показывает то, чего посетитель
   * мог не заметить: слои языков и изданий сменяют друг друга. */
  standby() {
    this.pause();
    if (this._card) this._card.close();
    this._standby = true;
    const stop = standbyLoop(standbyFps(this._app), () => this._draw());
    clearInterval(this._auto);
    this._auto = setInterval(() => {
      this._layer = this._layer === "lang" ? "pub" : "lang";
      this._syncPills();
    }, 8000);
    return beginStandby(() => {
      stop();
      clearInterval(this._auto); this._auto = 0;
      this._standby = false;
    });
  },

  reset() {
    this._layer = "lang";
    this._syncPills();
    if (this._card) this._card.close();
    this._map.zoom = 1;
    this._applyWorld();
    this._map.camX = 0;
    this._map.camY = this._map.camYAnchor;
    this._clamp();
    this._draw();
  },

  setLang(lang) {
    this._lang = lang || "ru";
    const T = {
      ru: { kicker: "МТК 38 · Ленин на языках мира", title: "Где напечатан «Ленин»",
            lab: "показать", lang: "языки", pub: "издания", both: "оба",
            sub: (a, b) => `${a} языков и ${b} изданий на карте мира. Тап — карточка языка и издания на нём.` },
      en: { kicker: "MTK 38 · Lenin in the world's languages", title: "Where “Lenin” was printed",
            lab: "show", lang: "languages", pub: "editions", both: "both",
            sub: (a, b) => `${a} languages and ${b} editions on the world map. Tap for the card.` },
      zh: { kicker: "МТК 38 · 世界语言中的列宁", title: "《列宁》的印刷地",
            lab: "显示", lang: "语言", pub: "版本", both: "两者",
            sub: (a, b) => `世界地图上的 ${a} 种语言和 ${b} 个版本。点按查看卡片。` },
    }[this._lang] || null;
    if (!T || !this._root) return;
    this._root.querySelector(".m38-kicker").textContent = T.kicker;
    this._root.querySelector(".m38-title").textContent = T.title;
    this._root.querySelector(".m38-sub").textContent = T.sub(this._langs.length, this._places.length);
    this._root.querySelector(".m38-pills__lab").textContent = T.lab;
    for (const b of this._pills.querySelectorAll("[data-layer]")) {
      b.textContent = T[b.getAttribute("data-layer")];
    }
    this._syncCardLang();
    this._syncPills();
  },

  _syncCardLang() { if (this._card && this._card.setLang) this._card.setLang(); },

  setA11y(on) { if (this._root) this._root.classList.toggle("is-a11y", !!on); },

  applySettings(values) {
    this._cfg = Object.assign({}, this._cfg, values || {});
    const c = this._cfg;
    if (this._root) {
      this._root.style.setProperty("--m38-grain", c.grain ?? 0.05);
      this._root.style.setProperty("--m38-vign", c.vign ?? 1);
    }
    if (c.base === "relief" && !this._tex.relief) this._loadTex("relief");
    if (c.base === "physical" && !this._tex.physical) this._loadTex("physical");
    this._rebuild();
    this._draw();
  },

  /* ── внутреннее ─────────────────────────────────────────────────── */

  _loadTex(kind) {
    const im = new Image();
    im.onload = () => { this._tex[kind] = im; this._rebuild(); this._draw(); };
    im.src = TEX[kind];
  },

  _syncPills() {
    if (!this._pills) return;
    for (const b of this._pills.querySelectorAll("[data-layer]")) {
      b.setAttribute("aria-checked", b.getAttribute("data-layer") === this._layer ? "true" : "false");
    }
  },

  get _WT() { return globalThis.MtkProjection.WinkelTripel; },
  _project(lat, lng) { return this._WT.project(lat, lng, this._map.worldW, this._map.worldH); },
  _applyWorld() {
    this._map.worldW = this._map.baseW * this._map.zoom;
    this._map.worldH = this._map.worldW / this._WT.ASPECT;
  },

  _size() {
    if (!this._canvas) return;
    const r = this._canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    this._W = Math.floor(r.width); this._H = Math.floor(r.height);
    this._canvas.width = Math.floor(this._W * dpr);
    this._canvas.height = Math.floor(this._H * dpr);
    this._ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    const old = this._map.worldW;
    this._map.baseW = this._W;
    this._applyWorld();
    this._map.camYAnchor = this._project(20, 0).y - this._H / 2;
    if (old < 2) { this._map.camX = 0; this._map.camY = this._map.camYAnchor; }
    this._clamp();
  },

  _clamp() {
    const m = this._map;
    if (m.worldW <= this._W) m.camX = (m.worldW - this._W) * 0.5;
    else {
      const g = m.worldW * 0.03;
      m.camX = Math.max(-g, Math.min(m.worldW - this._W + g, m.camX));
    }
    if (m.worldH < this._H) m.camY = m.camYAnchor;
    else {
      const mx = m.worldH - this._H + m.worldH * 0.04, mn = -m.worldH * 0.04;
      m.camY = Math.max(mn, Math.min(mx, m.camY));
    }
  },

  _toScreen(lat, lng) {
    const w = this._project(lat, lng);
    return { x: w.x - this._map.camX, y: w.y - this._map.camY };
  },

  /* Подложка кэшируется в фикс. разрешении и масштабируется при зуме —
   * так geojson не перерисовывается каждый кадр, а текст остаётся векторным. */
  _rebuild() {
    if (!this._ctx2d) return;
    const c = this._cfg, WT = this._WT;
    const CW = 4096, CH = Math.round(CW / WT.ASPECT);
    const proj = (lat, lng) => WT.project(lat, lng, CW, CH);
    const off = document.createElement("canvas");
    off.width = CW; off.height = CH;
    const g = off.getContext("2d");
    const s = Math.round(c.bg ?? 15);
    g.fillStyle = `rgb(${s},${s + 4},${s + 9})`;
    g.fillRect(0, 0, CW, CH);

    const tex = c.base === "relief" ? this._tex.relief : c.base === "physical" ? this._tex.physical : null;
    if (tex) { g.globalAlpha = 0.93; g.drawImage(tex, 0, 0, CW, CH); g.globalAlpha = 1; }

    if (this._geo && (c.base === "countries" || c.borders !== false)) {
      g.strokeStyle = c.base === "countries" ? rgba(PAL.window, 0.34) : rgba(PAL.brass, 0.5);
      g.lineWidth = 1.4; g.lineJoin = "round";
      if (c.base === "countries") g.fillStyle = rgba(PAL.window, 0.05);
      for (const f of this._geo.features) {
        const gm = f.geometry; if (!gm) continue;
        const polys = gm.type === "Polygon" ? [gm.coordinates]
          : gm.type === "MultiPolygon" ? gm.coordinates : null;
        if (!polys) continue;
        for (const poly of polys) for (const ring of poly) {
          if (!ring || ring.length < 2) continue;
          g.beginPath(); let px = null;
          for (let k = 0; k < ring.length; k++) {
            const pt = proj(ring[k][1], ring[k][0]);   // (lat, lng) — обратно GeoJSON
            if (px === null || Math.abs(pt.x - px) > CW * 0.5) g.moveTo(pt.x, pt.y);
            else g.lineTo(pt.x, pt.y);
            px = pt.x;
          }
          if (c.base === "countries") { g.closePath(); g.fill(); }
          g.stroke();
        }
      }
    }
    // сетка: в WT меридианы и параллели — кривые, поэтому сэмплируем
    const guides = c.guides ?? 0.5;
    if (guides > 0.001) {
      g.strokeStyle = rgba(PAL.brass, 0.18 * guides); g.lineWidth = 1.4; g.setLineDash([4, 26]);
      g.beginPath();
      for (let lng = -180; lng <= 180; lng += 2) {
        const p = proj(0, lng); lng === -180 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y);
      }
      g.stroke();
      for (let lng = -180; lng <= 180; lng += 30) {
        g.beginPath();
        for (let lat = -90; lat <= 90; lat += 2) {
          const p = proj(lat, lng); lat === -90 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y);
        }
        g.stroke();
      }
      g.setLineDash([]);
    }
    this._cache = off;
  },

  _draw() {
    const ctx = this._ctx2d;
    if (!ctx || !this._W) return;
    const c = this._cfg;
    ctx.clearRect(0, 0, this._W, this._H);
    if (this._cache) {
      ctx.save(); ctx.globalAlpha = 0.9;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this._cache, -this._map.camX, -this._map.camY, this._map.worldW, this._map.worldH);
      ctx.restore();
    }
    this._hits = [];
    if (this._layer !== "pub") this._drawLangs();
    if (this._layer !== "lang") this._drawPlaces();
  },

  _drawLangs() {
    const ctx = this._ctx2d, c = this._cfg;
    const cx = this._W * 0.5, cy = this._H * 0.5, ss = Math.min(this._W, this._H);
    const drawn = [];
    const order = this._langs.map((p, i) => i)
      .sort((a, b) => (this._langs[b].un - this._langs[a].un) || (this._langs[b].wt - this._langs[a].wt));
    for (const i of order) {
      const p = this._langs[i], s = this._toScreen(p.lat, p.lng);
      if (s.x < -30 || s.x > this._W + 30 || s.y < -30 || s.y > this._H + 30) continue;
      const prox = Math.max(0, 1 - Math.hypot(s.x - cx, s.y - cy) / (ss * 0.7));
      ctx.beginPath();
      ctx.arc(s.x, s.y, (2 + p.wt + prox * 1.6) * (c.dot ?? 1), 0, Math.PI * 2);
      ctx.fillStyle = PAL.red; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      this._hits.push({ x: s.x, y: s.y, r: Math.max(13, ss * 0.013), item: p, box: null });

      const sz = (ss * (0.013 + p.wt * 0.006) + prox * ss * 0.006) * (c.label ?? 1);
      ctx.font = `${p.wt >= 2 ? 600 : 400} ${sz}px ${famWord(p.sc)}`;
      const tw = ctx.measureText(p.w).width;
      const box = { x: s.x + sz * 0.5, y: s.y - sz * 0.68, w: tw + 4, h: sz * 1.6 };
      const important = p.un || p.wt >= 2;
      if (!important && drawn.some((d) => box.x < d.x + d.w && box.x + box.w > d.x
        && box.y < d.y + d.h && box.y + box.h > d.y)) continue;
      drawn.push(box);
      this._hits[this._hits.length - 1].box = box;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.shadowColor = rgba("#000000", 0.72); ctx.shadowBlur = 5 * (0.5 + (c.glow ?? 0.5));
      ctx.fillStyle = p.id === "rus" ? PAL.brass : PAL.paper;
      ctx.globalAlpha = 0.8 + prox * 0.2;
      ctx.fillText(p.w, s.x + sz * 0.5, s.y - sz * 0.08);
      ctx.font = `400 ${sz * 0.46}px "20 Kopeek",monospace`;
      ctx.shadowBlur = 3; ctx.fillStyle = rgba(PAL.brass, 0.62);
      ctx.fillText(p.n + (p.un ? " · ООН" : ""), s.x + sz * 0.5, s.y + sz * 0.5);
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
  },

  _drawPlaces() {
    const ctx = this._ctx2d, c = this._cfg;
    const cx = this._W * 0.5, cy = this._H * 0.5, ss = Math.min(this._W, this._H);
    const drawn = [];
    ctx.save();
    // «Связи с Москвой»: издания расходились из одного центра, и дуга к Москве
    // показывает это прямее любой подписи. Дуга, а не прямая, — чтобы линии
    // к соседним городам не сливались в один пучок.
    if (c.routes !== false) {
      const mo = this._toScreen(55.75, 37.62);
      ctx.strokeStyle = rgba(PAL.red, 0.16);
      ctx.lineWidth = 0.9;
      for (const pl of this._places) {
        const s = this._toScreen(pl.lat, pl.lng);
        if ((s.x < -40 && mo.x < -40) || (s.x > this._W + 40 && mo.x > this._W + 40)) continue;
        const mx = (mo.x + s.x) / 2, my = (mo.y + s.y) / 2 - Math.hypot(s.x - mo.x, s.y - mo.y) * 0.16;
        ctx.beginPath();
        ctx.moveTo(mo.x, mo.y);
        ctx.quadraticCurveTo(mx, my, s.x, s.y);
        ctx.stroke();
      }
    }
    for (const pl of this._places) {
      const s = this._toScreen(pl.lat, pl.lng);
      if (s.x < -40 || s.x > this._W + 40 || s.y < -40 || s.y > this._H + 40) continue;
      const prox = Math.max(0, 1 - Math.hypot(s.x - cx, s.y - cy) / (ss * 0.7));

      if (this._layer === "both" && pl.lang && pl.lang.lat != null) {
        const a = this._toScreen(pl.lang.lat, pl.lang.lng);
        ctx.strokeStyle = rgba(PAL.brass, 0.13); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
      // кольцо, а не заливка — чтобы издания не путались с точками языков
      const r = (3.4 + prox * 1.8) * (c.dot ?? 1);
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(PAL.brass, 0.18); ctx.fill();
      ctx.strokeStyle = rgba(PAL.brass, 0.9); ctx.lineWidth = 1.4; ctx.stroke();
      this._hits.push({ x: s.x, y: s.y, r: Math.max(13, ss * 0.013), place: pl, box: null });

      const sz = (ss * 0.011 + prox * ss * 0.004) * (c.label ?? 1);
      const label = [pl.pub.cityRu || pl.pub.cityNative, pl.pub.year].filter(Boolean).join(" · ");
      if (!label) continue;
      ctx.font = `400 ${sz}px "20 Kopeek",monospace`;
      const box = { x: s.x + sz * 0.6, y: s.y - sz * 0.6, w: ctx.measureText(label).width + 4, h: sz * 1.5 };
      if (drawn.some((d) => box.x < d.x + d.w && box.x + box.w > d.x
        && box.y < d.y + d.h && box.y + box.h > d.y)) continue;
      drawn.push(box);
      this._hits[this._hits.length - 1].box = box;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.shadowColor = rgba("#000000", 0.8); ctx.shadowBlur = 4;
      ctx.fillStyle = rgba(PAL.brass, 0.55 + prox * 0.35);
      ctx.fillText(label, s.x + sz * 0.6, s.y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  },

  _loop() {
    const step = () => {
      const m = this._map;
      if (!m.dragging) {
        m.camX += m.camVX * 0.016; m.camY += m.camVY * 0.016;
        m.camVX *= 0.9; m.camVY *= 0.9;
        if (Math.abs(m.camVX) < 0.5) m.camVX = 0;
        if (Math.abs(m.camVY) < 0.5) m.camVY = 0;
        this._clamp();
      }
      this._draw();
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  },

  _bind() {
    const cv = this._canvas, m = this._map;
    let down = null, moved = false, t0 = 0, lx = 0, ly = 0;
    this._h = {
      down: (e) => {
        down = e.pointerId; moved = false; t0 = performance.now();
        lx = e.clientX; ly = e.clientY; m.dragging = true;
        cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      },
      move: (e) => {
        if (down !== e.pointerId) return;
        const dx = e.clientX - lx, dy = e.clientY - ly;
        if (Math.hypot(dx, dy) > 8) moved = true;
        m.camX -= dx; m.camY -= dy;
        m.camVX = -dx * 60; m.camVY = -dy * 60;
        lx = e.clientX; ly = e.clientY;
        this._clamp(); this._draw();
      },
      up: (e) => {
        if (down !== e.pointerId) return;
        down = null; m.dragging = false;
        if (!moved && performance.now() - t0 < 450) this._tap(e.clientX, e.clientY);
      },
      wheel: (e) => {
        e.preventDefault();
        const k = Math.exp(-e.deltaY * 0.0016);
        const u = (e.clientX + m.camX) / m.worldW, v = (e.clientY + m.camY) / m.worldH;
        m.zoom = Math.max(1, Math.min(16, m.zoom * k));
        this._applyWorld();
        m.camX = u * m.worldW - e.clientX; m.camY = v * m.worldH - e.clientY;
        this._clamp(); this._draw();
      },
    };
    cv.addEventListener("pointerdown", this._h.down);
    cv.addEventListener("pointermove", this._h.move, { passive: true });
    cv.addEventListener("pointerup", this._h.up);
    cv.addEventListener("pointercancel", this._h.up);
    cv.addEventListener("wheel", this._h.wheel, { passive: false });
  },

  _unbind() {
    const cv = this._canvas;
    if (!cv || !this._h) return;
    cv.removeEventListener("pointerdown", this._h.down);
    cv.removeEventListener("pointermove", this._h.move);
    cv.removeEventListener("pointerup", this._h.up);
    cv.removeEventListener("pointercancel", this._h.up);
    cv.removeEventListener("wheel", this._h.wheel);
    this._h = null;
  },

  _tap(x, y) {
    let best = null, bd = 1e9;
    for (const h of this._hits) {
      const dd = Math.hypot(x - h.x, y - h.y);
      const inDot = dd < h.r + 12;
      const b = h.box;
      const inBox = b && x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4;
      if ((inDot || inBox) && dd < bd) { bd = dd; best = h; }
    }
    if (!best) { this._card.close(); return; }
    // тап по городу печати открывает карточку сразу на этом издании
    if (best.place) this._card.open(best.place.lang, best.place.idx);
    else this._card.open(best.item);
    this._map.camVX = this._map.camVY = 0;
  },
};
