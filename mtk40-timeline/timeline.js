/**
 * МТК 40 · Библиотека Ленина — хронология с уровнями детализации.
 *
 * Уровни по оси времени (переключаются масштабом):
 *   DECADE (z < thrDecade)      — декада как кружок размера √N с числом внутри
 *   YEAR   (thrDecade..thrYear) — год как кружок
 *   LEAF   (z >= thrYear)       — отдельные книги, названия, карточка по тапу
 *
 * Три дорожки — три оси корпуса:
 *   верх    ИМ     — что писал сам Ленин
 *   центр   ЧИТАЛ  — что он читал из чужого
 *   низ     О НЁМ  — что писали о нём
 *
 * Связи «прочитал → написал» (data/mtk40.json → connections) рисуются при
 * выборе книги: от неё к её источникам и отголоскам, на любом уровне —
 * если другой конец сейчас внутри кластера, линия идёт к кластеру.
 *
 * Ось горизонтальная. Wheel/pinch — масштаб, drag — пан, тап на кластер —
 * провал внутрь, тап на пустоту — шаг назад.
 */

// Общее для вариантов МТК 40 — в assets/mtk40/lib/mtk40.js: палитра, оси
// корпуса, типы связей, масштаб под киоск, карточка. Здесь только псевдонимы,
// чтобы не расходились четыре копии одних и тех же констант.
const M = window.MTK40;
const COLORS = M.COLORS;
const BUCKET_META = M.BUCKET_META;
const adjustHex = M.adjustHex;
const DESIGN_W = M.DESIGN_W;
const CONN_STYLE = M.CONN_STYLE;

// Границы поля графика в долях кадра.
const PLOT_L = 0.135;
const PLOT_R = 0.97;

const MIN_ZOOM = 1.0;
const MAX_ZOOM = 30;
const FADE_HALF = 0.15;
const TAP_THRESHOLD = 8;

const rgba = M.rgba;

class TimelineApp {
  constructor() {
    this.canvas = document.getElementById("timeline");
    this.ctx = this.canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = 0; this.H = 0; this.s = 1;

    this.items = [];
    this.selectedId = null;
    this.zoom = 1;
    this.yearCenter = (AXIS_MIN + AXIS_MAX) / 2;
    this.velYears = 0;
    this.anim = null;
    this.lastClusters = [];

    this.dragging = false;
    this.didDrag = false;
    this.pointers = new Map();
    this.pinchDist = 0;
    this.pinchZoom = 1;
    this.prevTime = 0;

    this.settings = this.loadSettings();

    this.cardEl = document.getElementById("card");
    this.cardConnsEl = document.getElementById("card-conns");
    this.homeChip = document.getElementById("home-chip");
    this.settingsToggle = document.getElementById("settings-toggle");
    this.settingsPanel = document.getElementById("settings-panel");
  }

  loadSettings() {
    try {
      const raw = sessionStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (e) { return { ...DEFAULT_SETTINGS }; }
  }
  saveSettings() {
    try { sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) {}
  }

  async start() {
    const r = await fetch("../data/mtk40.json?v=" + Date.now());
    this.data = await r.json();
    this.items = this.data.items;
    this.itemsById = new Map(this.items.map((i) => [i.id, i]));
    this.indexById = new Map(this.items.map((i, n) => [i.id, n]));

    this.connsByItem = new Map();
    for (const c of this.data.connections || []) {
      for (const end of [c.from, c.to]) {
        if (!this.connsByItem.has(end)) this.connsByItem.set(end, []);
        this.connsByItem.get(end).push(c);
      }
    }

    this.rebuildAggregates();
    this.bindEvents();
    this.wireSettings();
    this.resize();
    requestAnimationFrame(this.loop);
  }

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
  }

  // ---------- камера ----------
  // Слева оставлен отступ шире правого: в него уходят подписи дорожек и
  // «карман» с книгами вне шкалы (см. drawOutliers).
  plotL() { return this.W * PLOT_L; }
  plotR() { return this.W * PLOT_R; }
  usableW() { return this.plotR() - this.plotL(); }
  plotAnchor() { return (this.plotL() + this.plotR()) / 2; }
  pxPerYear() { return (this.usableW() / TOTAL_YEARS) * this.zoom; }
  yearToX(y) { return this.plotAnchor() + (y - this.yearCenter) * this.pxPerYear(); }
  xToYear(x) { return this.yearCenter + (x - this.plotAnchor()) / this.pxPerYear(); }
  clampZoom(z) { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)); }
  clampCamera() {
    const half = TOTAL_YEARS / (2 * this.zoom);
    const lo = AXIS_MIN + half;
    const hi = AXIS_MAX - half;
    if (hi < lo) this.yearCenter = (AXIS_MIN + AXIS_MAX) / 2;
    else this.yearCenter = Math.max(lo, Math.min(hi, this.yearCenter));
  }

  laneY(lane) {
    const center = this.H * 0.54;
    const spread = this.H * 0.185;
    if (lane === "by-lenin") return center - spread;
    if (lane === "about-lenin") return center + spread;
    return center;
  }

  levelFor(z) {
    if (z < this.settings.thrDecade) return "DECADE";
    if (z < this.settings.thrYear) return "YEAR";
    return "LEAF";
  }

  // ---------- размеры ----------
  radiusFor(count) {
    const base = 6 * this.s;
    const cap = 46 * this.s;
    return Math.min(cap, base + 5 * this.s * Math.sqrt(count));
  }
  leafRadius(item) {
    const sig = item.significance || 3;
    return (6 + (sig >= 5 ? 3.5 : sig >= 4 ? 2 : 0)) * this.s;
  }

  // ---------- кластеры ----------
  buildClusters(level) {
    const out = [];
    const push = (o) => out.push(o);

    if (level === "LEAF") {
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        if (typeof it.year_first !== "number") continue;
        if (it.year_first < AXIS_MIN) continue;   // рисуется отдельно, в кармане
        if (!BUCKET_META[it.bucket]) continue;
        push({
          x: this.yearToX(it.year_first), y: this.laneY(it.bucket),
          r: this.leafRadius(it), count: 1, indices: [i], lane: it.bucket,
          label: it.title, timeCenter: it.year_first, timeSpan: 1,
          fill: it.cover_color,
        });
      }
    } else {
      const src = level === "DECADE" ? this.byDecade : this.byYear;
      for (const [key, idx] of src) {
        const [numStr, lane] = key.split(":");
        const num = +numStr;
        const center = level === "DECADE" ? num + 5 : num;
        push({
          x: this.yearToX(center), y: this.laneY(lane),
          r: idx.length > 1 ? this.radiusFor(idx.length) : this.leafRadius(this.items[idx[0]]),
          count: idx.length, indices: idx.slice(), lane,
          label: level === "DECADE" ? num + "-е" : String(num),
          timeCenter: center, timeSpan: level === "DECADE" ? 10 : 1,
          fill: idx.length > 1 ? BUCKET_META[lane].accent : this.items[idx[0]].cover_color,
        });
      }
    }
    return out;
  }

  // Кружки одной дорожки не должны наезжать друг на друга — расталкиваем
  // по горизонтали, y дорожки не трогаем.
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
  }

  // ---------- события ----------
  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointermove", this.onPointerMove, { passive: true });
    c.addEventListener("pointerup", this.onPointerUp);
    c.addEventListener("pointercancel", this.onPointerUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    this.cardEl.querySelector(".card__close").addEventListener("click", () => this.deselect());
    this.homeChip.addEventListener("click", (e) => { e.stopPropagation(); this.goHome(); });
  }

  onPointerDown = (ev) => {
    if (!this.settingsPanel.hidden) this.settingsPanel.hidden = true;
    this.pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
    if (this.pointers.size === 2) {
      const p = [...this.pointers.values()];
      this.pinchDist = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      this.pinchZoom = this.zoom;
      return;
    }
    ev.preventDefault();
    try { this.canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    this.dragging = true;
    this.didDrag = false;
    this.pressX = ev.offsetX; this.pressY = ev.offsetY;
    this.lastX = ev.offsetX;
    this.lastT = performance.now();
    this.anim = null;
  };

  onPointerMove = (ev) => {
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
    if (!this.didDrag && Math.hypot(ev.offsetX - this.pressX, ev.offsetY - this.pressY) > TAP_THRESHOLD) {
      this.didDrag = true;
    }
    if (!this.didDrag) return;
    const now = performance.now();
    const dt = Math.max(16, now - this.lastT) / 1000;
    const dxCanvas = (ev.offsetX - this.lastX) * this.dpr;
    const shift = -dxCanvas / this.pxPerYear();
    this.yearCenter += shift;
    this.velYears = shift / dt;
    this.lastX = ev.offsetX;
    this.lastT = now;
    this.clampCamera();
  };

  onPointerUp = (ev) => {
    this.pointers.delete(ev.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    try { this.canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
    if (this.pointers.size === 0 && this.dragging && !this.didDrag) {
      const hit = this.hitTest(ev.offsetX * this.dpr, ev.offsetY * this.dpr);
      if (hit && hit.count > 1) {
        this.drilldown(hit);
      } else if (hit) {
        this.select(this.items[hit.indices[0]]);
        this.velYears = 0;
      } else if (this.selectedId) {
        this.deselect();
      } else {
        this.zoomOutOneLevel();
      }
    }
    if (this.pointers.size === 0) this.dragging = false;
  };

  onWheel = (ev) => {
    ev.preventDefault();
    const px = ev.offsetX * this.dpr;
    const before = this.xToYear(px);
    const next = this.clampZoom(this.zoom * Math.exp(-ev.deltaY * 0.0015));
    if (next === this.zoom) return;
    this.zoom = next;
    this.yearCenter += before - this.xToYear(px);
    this.clampCamera();
    this.anim = null;
  };

  // ---------- навигация ----------
  animateTo(zoom, yearCenter, dur) {
    this.anim = {
      z0: this.zoom, z1: zoom,
      c0: this.yearCenter, c1: yearCenter,
      t0: performance.now(), dur: dur || 420,
    };
    this.velYears = 0;
  }
  updateAnim() {
    if (!this.anim) return;
    const a = this.anim;
    const t = Math.min(1, (performance.now() - a.t0) / a.dur);
    const e = 1 - Math.pow(1 - t, 3);
    this.zoom = a.z0 + (a.z1 - a.z0) * e;
    this.yearCenter = a.c0 + (a.c1 - a.c0) * e;
    if (t >= 1) this.anim = null;
  }
  // Один тап — ровно один уровень вниз. Если целиться сразу «вписать декаду
  // в кадр», масштаб перепрыгивает через уровень годов и обещание
  // «декада → год → книги» не выполняется.
  drilldown(cluster) {
    const cur = this.levelFor(this.zoom);
    const { thrDecade, thrYear } = this.settings;
    const desired = (TOTAL_YEARS / Math.max(1, cluster.timeSpan)) * 0.55;
    let target;
    if (cur === "DECADE") target = Math.min(thrYear - 0.2, Math.max(thrDecade + 0.15, desired));
    else if (cur === "YEAR") target = Math.max(thrYear + 0.15, Math.min(MAX_ZOOM, desired));
    else return;
    this.animateTo(this.clampZoom(target), cluster.timeCenter, 420);
  }
  zoomOutOneLevel() {
    const cur = this.levelFor(this.zoom);
    let target;
    if (cur === "LEAF") target = this.settings.thrDecade + 0.1;
    else if (cur === "YEAR") target = this.settings.thrDecade - 0.1;
    else target = 1.0;
    this.animateTo(this.clampZoom(target), this.yearCenter, 380);
  }
  goHome() {
    this.deselect();
    this.animateTo(1.0, (AXIS_MIN + AXIS_MAX) / 2, 500);
  }

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
  }

  // ---------- карточка ----------
  select(item) {
    this.selectedId = item.id;
    const meta = BUCKET_META[item.bucket];
    const q = (sel) => this.cardEl.querySelector(sel);
    q('[data-bind="cat"]').textContent = `${meta.label} · ${item.year_first || ""}`;
    q('[data-bind="name"]').textContent = item.title;
    q('[data-bind="author"]').textContent = item.author || "";
    q('[data-bind="where"]').textContent =
      [item.place_first, item.pages_approx ? `${item.pages_approx} стр.` : null].filter(Boolean).join(" · ");
    q('[data-bind="short"]').textContent = item.short_text || "";

    const conns = this.connsByItem.get(item.id) || [];
    if (!conns.length) {
      this.cardConnsEl.hidden = true;
    } else {
      this.cardConnsEl.innerHTML = "";
      for (const c of conns) {
        const otherId = c.from === item.id ? c.to : c.from;
        const other = this.itemsById.get(otherId);
        const li = document.createElement("li");
        li.innerHTML = `<b>${(CONN_STYLE[c.type] || {}).label || c.type}</b> ${c.from === item.id ? "→" : "←"} ${other ? other.title : otherId}`;
        this.cardConnsEl.appendChild(li);
      }
      this.cardConnsEl.hidden = false;
    }
    this.cardEl.hidden = false;
  }
  deselect() {
    this.selectedId = null;
    this.cardEl.hidden = true;
  }

  // ---------- цикл ----------
  loop = (now) => {
    const t = now / 1000;
    const dt = Math.min(0.05, Math.max(0.001, t - this.prevTime));
    this.prevTime = t;
    this.updateAnim();
    if (!this.dragging && !this.anim) {
      this.yearCenter += this.velYears * dt;
      this.velYears *= Math.pow(0.88, dt * 60);
      if (Math.abs(this.velYears) < 0.01) this.velYears = 0;
      this.clampCamera();
    }
    this.render();
    this.homeChip.hidden = !(this.zoom > 1.05);
    requestAnimationFrame(this.loop);
  };

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const scale = rect.width / DESIGN_W;
    this.s = this.dpr * scale;
    document.documentElement.style.setProperty("--zoom", scale);
    this.W = Math.round(rect.width * this.dpr);
    this.H = Math.round(rect.height * this.dpr);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.clampCamera();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    if (!this.items.length) return;
    this.drawLanes();
    if (this.settings.showEvents) this.drawEvents();
    this.drawAxis();
    this.drawClusters();
    this.drawOutliers();
    if (this.settings.showConns) this.drawConnections();
    this.drawHud();
  }

  drawLanes() {
    const ctx = this.ctx;
    ctx.save();
    for (const lane of LANES) {
      const y = this.laneY(lane);
      const meta = BUCKET_META[lane];
      ctx.strokeStyle = rgba(COLORS.paper, 0.14);
      ctx.lineWidth = 1 * this.s;
      ctx.beginPath();
      ctx.moveTo(this.plotL(), y);
      ctx.lineTo(this.plotR(), y);
      ctx.stroke();

      // Подписи дорожек живут в левом отступе — под кружки не лезут.
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = meta.accent;
      ctx.font = `600 ${14 * this.s * this.settings.labelScale}px "20 Kopeek", monospace`;
      ctx.fillText(meta.label, this.W * 0.028, y - 14 * this.s);
      ctx.fillStyle = rgba(COLORS.paper, 0.45);
      ctx.font = `400 ${9.5 * this.s * this.settings.labelScale}px "20 Kopeek", monospace`;
      ctx.fillText(meta.note.toUpperCase(), this.W * 0.028, y - 3 * this.s);
    }
    ctx.restore();
  }

  drawAxis() {
    const ctx = this.ctx;
    const ppy = this.pxPerYear();
    const step = ppy > 60 * this.s ? 1 : ppy > 20 * this.s ? 5 : 10;
    const axisY = this.laneY("about-lenin") + this.H * 0.115;

    ctx.save();
    ctx.strokeStyle = rgba(COLORS.brass, 0.45);
    ctx.lineWidth = 1 * this.s;
    ctx.beginPath();
    ctx.moveTo(this.plotL(), axisY);
    ctx.lineTo(this.plotR(), axisY);
    ctx.stroke();

    const labelStep = ppy > 30 * this.s ? step : step * 2;
    ctx.font = `400 ${12 * this.s * this.settings.labelScale}px "20 Kopeek", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let y = Math.ceil(AXIS_MIN / step) * step; y <= AXIS_MAX; y += step) {
      const x = this.yearToX(y);
      if (x < this.plotL() - 2 * this.s || x > this.plotR() + 2 * this.s) continue;
      const major = y % labelStep === 0;
      ctx.fillStyle = rgba(COLORS.paper, major ? 0.5 : 0.18);
      ctx.fillRect(x, axisY, 1 * this.s, (major ? 8 : 4) * this.s);
      if (major) {
        ctx.fillStyle = rgba(COLORS.paper, 0.62);
        ctx.fillText(String(y), x, axisY + 13 * this.s);
      }
    }
    ctx.restore();
  }

  // Исторические якоря. Подписи отбраковываются по пересечению — на общем
  // плане их десять на весь экран и раньше они слипались в кашу.
  drawEvents() {
    const ctx = this.ctx;
    const top = this.laneY("by-lenin") - this.H * 0.12;
    const bottom = this.laneY("about-lenin") + this.H * 0.10;
    const fs = 11 * this.s * this.settings.labelScale;
    ctx.save();
    ctx.font = `600 ${fs}px "20 Kopeek", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    // штрихи — для всех дат
    ctx.strokeStyle = rgba(COLORS.red, 0.32);
    ctx.setLineDash([4 * this.s, 6 * this.s]);
    ctx.lineWidth = 1.2 * this.s;
    for (const t of TIMELINE_TICKS) {
      const x = this.yearToX(t.year);
      if (x < this.plotL() || x > this.plotR()) continue;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // подписи — по убыванию значимости, налезающие отбрасываются
    const taken = [];
    ctx.fillStyle = rgba(COLORS.brass, 0.85);
    for (const t of [...TIMELINE_TICKS].sort((a, b) => a.rank - b.rank)) {
      const x = this.yearToX(t.year);
      if (x < this.plotL() || x > this.plotR()) continue;
      const text = `${t.year} · ${t.label}`;
      const half = ctx.measureText(text).width / 2 + 8 * this.s;
      if (taken.some(([l, r]) => x - half < r && x + half > l)) continue;
      taken.push([x - half, x + half]);
      ctx.fillText(text, x, top - 4 * this.s);
    }
    ctx.restore();
  }

  drawClusters() {
    const z = this.zoom;
    const level = this.levelFor(z);
    const bands = [
      { z: this.settings.thrDecade, lower: "DECADE", upper: "YEAR" },
      { z: this.settings.thrYear, lower: "YEAR", upper: "LEAF" },
    ];
    let band = null;
    if (this.settings.crossfade) {
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
  }

  drawLevel(clusters, alpha, level) {
    const ctx = this.ctx;
    this.relaxHoriz(clusters, 4 * this.s, 30);
    const dimming = this.selectedId != null && level === "LEAF";
    const related = new Set();
    if (dimming) {
      related.add(this.selectedId);
      for (const c of this.connsByItem.get(this.selectedId) || []) {
        related.add(c.from === this.selectedId ? c.to : c.from);
      }
    }

    ctx.save();
    for (const cl of clusters) {
      // за пределы поля не выпускаем — слева отступ занят подписями дорожек
      if (cl.x < this.plotL() || cl.x > this.plotR()) continue;
      const isCluster = cl.count > 1;
      const sel = cl.indices.some((i) => this.items[i].id === this.selectedId);
      const dim = dimming && !cl.indices.some((i) => related.has(this.items[i].id));
      const a = alpha * (dim ? 0.16 : 1);

      if (sel) {
        ctx.beginPath();
        ctx.arc(cl.x, cl.y, cl.r + 5 * this.s, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.brass;
        ctx.lineWidth = 2.5 * this.s;
        ctx.globalAlpha = alpha;
        ctx.stroke();
      }
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.r, 0, Math.PI * 2);
      ctx.fillStyle = cl.fill;
      ctx.fill();
      ctx.strokeStyle = rgba(COLORS.paper, 0.5);
      ctx.lineWidth = (isCluster ? 1.4 : 1) * this.s;
      ctx.stroke();

      if (isCluster) {
        ctx.font = `600 ${Math.max(11 * this.s, cl.r * 0.72)}px "20 Kopeek", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = rgba(COLORS.ink, 0.85);
        ctx.fillText(String(cl.count), cl.x, cl.y);
      }
    }
    ctx.globalAlpha = 1;

    // Подписи: крупные кружки забирают место первыми, налезающие отбрасываются.
    const drawn = [];
    const order = clusters.slice().sort((a, b) => b.r - a.r);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const cl of order) {
      cl.labelRect = null;
      if (!cl.label) continue;
      if (cl.x < this.plotL() || cl.x > this.plotR()) continue;
      const sel = cl.indices.some((i) => this.items[i].id === this.selectedId);
      const dim = dimming && !cl.indices.some((i) => related.has(this.items[i].id));
      if (dim) continue;
      const fs = Math.max(11 * this.s, Math.min(24 * this.s, cl.r * 0.62)) * this.settings.labelScale;
      ctx.font = `${sel ? 600 : 400} ${fs}px "20 Kopeek", monospace`;
      let text = cl.label;
      if (level === "LEAF" && text.length > 30) text = text.slice(0, 29) + "…";
      const w = ctx.measureText(text).width;
      const py = cl.y + cl.r + fs * 0.75;
      const rect = [cl.x - w / 2 - 4 * this.s, py - fs * 0.6, cl.x + w / 2 + 4 * this.s, py + fs * 0.6];
      if (drawn.some((r) => !(rect[2] < r[0] || rect[0] > r[2] || rect[3] < r[1] || rect[1] > r[3]))) continue;
      drawn.push(rect);
      cl.labelRect = rect;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rgba(COLORS.ink, 0.7);
      ctx.fillText(text, cl.x + 1 * this.s, py + 1 * this.s);
      ctx.fillStyle = sel ? COLORS.brass : rgba(COLORS.paper, 0.86);
      ctx.fillText(text, cl.x, py);
    }
    ctx.restore();
  }

  // Книги, не влезающие в шкалу (Аристотель, −350). Карман слева за разрывом
  // оси — иначе линейная шкала от античности расплющила бы весь XIX-XX век.
  drawOutliers() {
    if (!this.outliers.length) return;
    const ctx = this.ctx;
    const axisStart = this.yearToX(AXIS_MIN);
    const x = axisStart - 62 * this.s;
    if (x < -40 * this.s || x > this.W) return;

    ctx.save();
    // знак разрыва оси между карманом и началом шкалы
    ctx.strokeStyle = rgba(COLORS.paper, 0.35);
    ctx.lineWidth = 1.4 * this.s;
    for (const off of [-6, 0]) {
      ctx.beginPath();
      ctx.moveTo(axisStart - 30 * this.s + off * this.s, this.H * 0.5 - 8 * this.s);
      ctx.lineTo(axisStart - 22 * this.s + off * this.s, this.H * 0.5 + 8 * this.s);
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
      ctx.lineWidth = (sel ? 2.5 : 1) * this.s;
      ctx.stroke();
      const fs = 11 * this.s * this.settings.labelScale;
      ctx.font = `400 ${fs}px "20 Kopeek", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = rgba(COLORS.paper, 0.7);
      ctx.fillText(`${it.year_first} · ${it.title}`, x, y + r + fs * 0.9);
      this.lastClusters.push({
        x, y, r, count: 1, indices: [i], lane: it.bucket,
        label: it.title, labelRect: null, timeCenter: it.year_first, timeSpan: 1,
      });
    }
    ctx.restore();
  }

  // Позиция книги на экране сейчас — сама книга, если она отдельный кружок,
  // либо кластер, внутри которого она свёрнута.
  positionOfItem(id) {
    const idx = this.indexById.get(id);
    if (idx === undefined) return null;
    for (const cl of this.lastClusters) if (cl.indices.includes(idx)) return cl;
    return null;
  }

  drawConnections() {
    if (!this.selectedId) return;
    const conns = this.connsByItem.get(this.selectedId) || [];
    if (!conns.length) return;
    const ctx = this.ctx;
    const from = this.positionOfItem(this.selectedId);
    if (!from) return;

    if (from.x < this.plotL() || from.x > this.plotR()) return;

    ctx.save();
    for (const c of conns) {
      const otherId = c.from === this.selectedId ? c.to : c.from;
      const to = this.positionOfItem(otherId);
      if (!to || to === from) continue;
      const st = CONN_STYLE[c.type] || CONN_STYLE.source;

      // Другой конец может быть далеко за кадром — тогда упираем линию в край
      // поля и ставим уголок «продолжение там». Иначе кривая уходит в
      // бесконечность и читается как случайный луч через весь экран.
      let tx = to.x, off = 0;
      if (tx < this.plotL() + 16 * this.s) { tx = this.plotL() + 16 * this.s; off = -1; }
      else if (tx > this.plotR() - 16 * this.s) { tx = this.plotR() - 16 * this.s; off = 1; }

      const midY = (from.y + to.y) / 2;
      const bow = Math.min(120 * this.s, Math.abs(tx - from.x) * 0.28 + 30 * this.s);

      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width * this.s;
      ctx.setLineDash(st.dash.map((d) => d * this.s));
      ctx.shadowColor = st.color;
      ctx.shadowBlur = 6 * this.s;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.bezierCurveTo(from.x + bow, midY, tx - bow, midY, tx, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      if (off) {
        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.moveTo(tx + off * 11 * this.s, to.y);
        ctx.lineTo(tx, to.y - 6 * this.s);
        ctx.lineTo(tx, to.y + 6 * this.s);
        ctx.closePath();
        ctx.fill();
      }

      const fs = 10 * this.s * this.settings.labelScale;
      ctx.font = `600 ${fs}px "20 Kopeek", monospace`;
      const text = st.label.toUpperCase();
      const w = ctx.measureText(text).width;
      const mx = Math.max(this.plotL() + w / 2 + 8 * this.s,
        Math.min(this.plotR() - w / 2 - 8 * this.s, (from.x + tx) / 2));
      ctx.fillStyle = rgba(COLORS.ink, 0.85);
      ctx.fillRect(mx - w / 2 - 6 * this.s, midY - fs * 0.8, w + 12 * this.s, fs * 1.6);
      ctx.fillStyle = st.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, mx, midY);
    }
    ctx.restore();
  }

  drawHud() {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `400 ${10 * this.s}px "20 Kopeek", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = rgba(COLORS.brass, 0.5);
    const level = this.levelFor(this.zoom);
    const human = level === "DECADE" ? "ДЕКАДЫ" : level === "YEAR" ? "ГОДЫ" : "КНИГИ";
    ctx.fillText(`${human} · ×${this.zoom.toFixed(2)} · КОЛЕСО = МАСШТАБ · DRAG = ПАН · ТАП = ВГЛУБЬ`,
      this.W - 14 * this.s, this.H - 12 * this.s);
    ctx.restore();
  }

  // ---------- панель настроек ----------
  wireSettings() {
    this.settingsToggle.addEventListener("click", () => {
      this.settingsPanel.hidden = !this.settingsPanel.hidden;
    });
    const range = (id, key, fmt) => {
      const el = document.getElementById(id);
      const out = this.settingsPanel.querySelector(`[data-value-for="${id}"]`);
      el.value = String(this.settings[key]);
      if (out) out.textContent = fmt(this.settings[key]);
      el.addEventListener("input", () => {
        this.settings[key] = parseFloat(el.value);
        if (out) out.textContent = fmt(this.settings[key]);
        this.saveSettings();
      });
    };
    const check = (id, key) => {
      const el = document.getElementById(id);
      el.checked = !!this.settings[key];
      el.addEventListener("change", () => {
        this.settings[key] = !!el.checked;
        this.saveSettings();
      });
    };
    range("thr-decade", "thrDecade", (v) => v.toFixed(2) + "×");
    range("thr-year", "thrYear", (v) => v.toFixed(2) + "×");
    range("opt-label-scale", "labelScale", (v) => v.toFixed(2) + "×");
    check("opt-events", "showEvents");
    check("opt-conns", "showConns");
    check("opt-crossfade", "crossfade");
    document.getElementById("opt-reset").addEventListener("click", () => {
      Object.assign(this.settings, DEFAULT_SETTINGS);
      this.saveSettings();
      for (const [id, key] of [["thr-decade", "thrDecade"], ["thr-year", "thrYear"], ["opt-label-scale", "labelScale"]]) {
        const el = document.getElementById(id);
        el.value = String(this.settings[key]);
        const out = this.settingsPanel.querySelector(`[data-value-for="${id}"]`);
        if (out) out.textContent = this.settings[key].toFixed(2) + "×";
      }
      document.getElementById("opt-events").checked = this.settings.showEvents;
      document.getElementById("opt-conns").checked = this.settings.showConns;
      document.getElementById("opt-crossfade").checked = this.settings.crossfade;
    });
  }
}

const app = new TimelineApp();
app.start();
