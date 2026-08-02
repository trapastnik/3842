/**
 * МТК 40 · География изданий.
 *
 * Где книга вышла впервые. Поле place_first — свободный текст, нормализация
 * в города и координаты живёт в assets/mtk40/lib/places.js (там же правила).
 *
 * Проекция — общий канон проекта, MtkProjection.WinkelTripel
 * (COORDINATION.md, 2026-07-08): своей математики здесь нет, аспект берётся
 * из WT.ASPECT.
 *
 * Кольцо города разбито на три дуги по осям корпуса: сразу видно, что
 * Женева и Цюрих — почти чистое «ИМ» (эмигрантские типографии), а Лондон и
 * Нью-Йорк — «О НЁМ» (западные биографии).
 */
(function () {
  const M = window.MTK40;
  const P = window.MTK40_PLACES;
  const WT = window.MtkProjection.WinkelTripel;

  const WORLD_W = 2000;
  const WORLD_H = WORLD_W / WT.ASPECT;
  const FIT_PAD = 0.14;      // доля кадра на поля при первой подгонке
  const MIN_K = 0.4, MAX_K = 14;

  class Geography {
    constructor() {
      this.canvas = document.getElementById("view");
      this.ctx = this.canvas.getContext("2d");
      this.dpr = M.pickDpr();
      this.buckets = new Set();
      this.activeCity = null;
      this.k = 1; this.ox = 0; this.oy = 0;
      this.fitted = false;
      this.drag = null;
      this.pointers = new Map();
      this.pinch = null;
      this.worldPaths = [];
    }

    async start() {
      this.corpus = await M.loadCorpus();
      this.card = M.Card(document.getElementById("card"), this.corpus);
      this.cityEl = document.getElementById("city");
      this.cityEl.querySelector(".city-panel__close")
        .addEventListener("click", () => { this.activeCity = null; this.cityEl.hidden = true; });

      this.groupByCity();
      this.buildFilters();

      // очертания стран — общий вендоренный Natural Earth из data/
      fetch("../data/ne_110m_countries.geojson")
        .then((r) => r.json())
        .then((gj) => this.buildWorldPaths(gj))
        .catch(() => {});   // без подложки карта всё ещё читается по городам

      window.addEventListener("resize", () => this.resize());
      const c = this.canvas;
      c.addEventListener("pointerdown", this.onDown);
      c.addEventListener("pointermove", this.onMove);
      c.addEventListener("pointerup", this.onUp);
      c.addEventListener("pointercancel", this.onUp);
      c.addEventListener("wheel", this.onWheel, { passive: false });

      this.resize();
      requestAnimationFrame(this.loop);
    }

    groupByCity() {
      const map = new Map();
      for (const item of this.corpus.items) {
        const place = P.of(item.place_first);
        if (!place) continue;
        if (!map.has(place.label)) {
          const w = WT.project(place.lat, place.lng, WORLD_W, WORLD_H);
          map.set(place.label, {
            label: place.label,
            // на карте — короткое имя: «Петербург · Петроград · Ленинград»
            // подписью перекрывает пол-Европы, полное остаётся в панели
            short: place.label.split(" · ")[0],
            wx: w.x, wy: w.y, items: [],
          });
        }
        map.get(place.label).items.push(item);
      }
      this.cities = [...map.values()].sort((a, b) => b.items.length - a.items.length);
    }

    buildFilters() {
      const box = document.getElementById("filters");
      for (const b of M.BUCKETS) {
        const meta = M.BUCKET_META[b];
        const n = this.corpus.items.filter((i) => i.bucket === b).length;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip";
        btn.setAttribute("aria-pressed", "false");
        btn.style.setProperty("--chip-accent", meta.accent);
        btn.innerHTML = `${meta.label}<span class="chip__n">${n}</span>`;
        btn.addEventListener("click", () => {
          if (this.buckets.has(b)) this.buckets.delete(b); else this.buckets.add(b);
          btn.setAttribute("aria-pressed", String(this.buckets.has(b)));
          if (this.activeCity) this.showCity(this.activeCity);
        });
        box.appendChild(btn);
      }
    }

    buildWorldPaths(gj) {
      const ring = (coords) => {
        const p = new Path2D();
        for (let i = 0; i < coords.length; i++) {
          const [lng, lat] = coords[i];
          const w = WT.project(lat, lng, WORLD_W, WORLD_H);
          if (i === 0) p.moveTo(w.x, w.y); else p.lineTo(w.x, w.y);
        }
        p.closePath();
        return p;
      };
      for (const f of gj.features || []) {
        const g = f.geometry;
        if (!g) continue;
        const polys = g.type === "Polygon" ? [g.coordinates]
          : g.type === "MultiPolygon" ? g.coordinates : [];
        for (const poly of polys) for (const r of poly) this.worldPaths.push(ring(r));
      }
    }

    resize() {
      const f = M.fitCanvas(this.canvas, this.dpr);
      this.W = f.W; this.H = f.H; this.s = f.s;
      if (!this.fitted) { this.fitToCities(); this.fitted = true; }
      this.layout();
    }

    // Кадр подгоняется по городам, а не по всему миру: 16 точек лежат между
    // Нью-Йорком и Новосибирском, мир целиком оставил бы половину экрана пустой.
    fitToCities() {
      if (!this.cities.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of this.cities) {
        x0 = Math.min(x0, c.wx); x1 = Math.max(x1, c.wx);
        y0 = Math.min(y0, c.wy); y1 = Math.max(y1, c.wy);
      }
      const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
      const availW = this.W * (1 - 2 * FIT_PAD);
      const availH = this.H * (1 - 2 * FIT_PAD) - 90 * this.s;   // место под заголовок
      this.k = Math.min(availW / bw, availH / bh);
      this.ox = this.W / 2 - ((x0 + x1) / 2) * this.k;
      this.oy = (this.H / 2 + 40 * this.s) - ((y0 + y1) / 2) * this.k;
    }

    toScreen(wx, wy) { return { x: wx * this.k + this.ox, y: wy * this.k + this.oy }; }

    layout() {
      const s = this.s;
      for (const c of this.cities) {
        const p = this.toScreen(c.wx, c.wy);
        c.x = p.x; c.y = p.y;
        c.r = (7 + 4.6 * Math.sqrt(c.items.length)) * s;
      }
      // Города на одной точке (Москва и Горки — 0.2° врозь) на общем плане
      // сливаются. Слегка расталкиваем символы: обычная картографическая
      // практика, смещение ограничено, при увеличении они расходятся сами.
      for (let iter = 0; iter < 40; iter++) {
        let moved = 0;
        for (let i = 0; i < this.cities.length; i++) {
          for (let j = i + 1; j < this.cities.length; j++) {
            const a = this.cities[i], b = this.cities[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 0.01;
            const min = a.r + b.r + 3 * s;
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
    }

    countsOf(city) {
      const out = { "by-lenin": 0, "in-library": 0, "about-lenin": 0 };
      for (const i of city.items) out[i.bucket]++;
      return out;
    }
    passes(item) {
      return !this.buckets.size || this.buckets.has(item.bucket);
    }
    shownItems(city) {
      return city.items.filter((i) => this.passes(i)).sort((a, b) => a.year_first - b.year_first);
    }

    // ---------- взаимодействие ----------
    // Колесо есть только на превью; на киоске масштаб меняют щипком, поэтому
    // два пальца обрабатываются наравне с wheel.
    onDown = (ev) => {
      this.pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
      if (this.pointers.size === 2) { this.startPinch(); return; }
      this.drag = { x: ev.offsetX, y: ev.offsetY, moved: false };
      try { this.canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    };
    startPinch() {
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        k: this.k,
        cx: ((a.x + b.x) / 2) * this.dpr,
        cy: ((a.y + b.y) / 2) * this.dpr,
      };
      this.pinch.wx = (this.pinch.cx - this.ox) / this.k;
      this.pinch.wy = (this.pinch.cy - this.oy) / this.k;
      this.drag = null;
    }
    onMove = (ev) => {
      if (this.pointers.has(ev.pointerId)) {
        this.pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
      }
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        this.k = Math.max(MIN_K, Math.min(MAX_K, this.pinch.k * (d / this.pinch.dist)));
        this.ox = this.pinch.cx - this.pinch.wx * this.k;
        this.oy = this.pinch.cy - this.pinch.wy * this.k;
        this.layout();
        return;
      }
      if (!this.drag) return;
      const dx = (ev.offsetX - this.drag.x) * this.dpr;
      const dy = (ev.offsetY - this.drag.y) * this.dpr;
      if (Math.hypot(dx, dy) > 6 * this.dpr) this.drag.moved = true;
      if (!this.drag.moved) return;
      this.ox += dx; this.oy += dy;
      this.drag.x = ev.offsetX; this.drag.y = ev.offsetY;
      this.layout();
    };
    onUp = (ev) => {
      this.pointers.delete(ev.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.drag && !this.drag.moved && this.pointers.size === 0) {
        const x = ev.offsetX * this.dpr, y = ev.offsetY * this.dpr;
        let hit = null;
        for (const c of this.cities) {
          if (Math.hypot(x - c.x, y - c.y) <= Math.max(c.r + 8 * this.s, 20 * this.s)) { hit = c; break; }
        }
        if (hit) this.showCity(hit);
        else { this.activeCity = null; this.cityEl.hidden = true; this.card.hide(); }
      }
      this.drag = null;
    };
    onWheel = (ev) => {
      ev.preventDefault();
      const px = ev.offsetX * this.dpr, py = ev.offsetY * this.dpr;
      const wx = (px - this.ox) / this.k, wy = (py - this.oy) / this.k;
      const next = Math.max(MIN_K, Math.min(MAX_K, this.k * Math.exp(-ev.deltaY * 0.0015)));
      if (next === this.k) return;
      this.k = next;
      this.ox = px - wx * this.k;
      this.oy = py - wy * this.k;
      this.layout();
    };

    showCity(city) {
      this.activeCity = city;
      const list = this.shownItems(city);
      document.getElementById("city-name").textContent = city.label;
      const c = this.countsOf(city);
      document.getElementById("city-sub").textContent =
        `${list.length} из ${city.items.length} · ИМ ${c["by-lenin"]} · ЧИТАЛ ${c["in-library"]} · О НЁМ ${c["about-lenin"]}`;
      const ul = document.getElementById("city-list");
      ul.innerHTML = "";
      for (const item of list) {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.style.setProperty("--spine", item.cover_color);
        const yr = document.createElement("span");
        yr.className = "yr";
        yr.textContent = item.year_first;
        const t = document.createElement("span");
        t.textContent = item.title;
        b.append(yr, t);
        b.addEventListener("click", () => this.card.show(item));
        li.appendChild(b);
        ul.appendChild(li);
      }
      this.cityEl.hidden = false;
      this.cityEl.scrollTop = 0;
    }

    // ---------- отрисовка ----------
    loop = () => { this.render(); requestAnimationFrame(this.loop); };

    render() {
      const ctx = this.ctx;
      const s = this.s;
      ctx.clearRect(0, 0, this.W, this.H);
      if (!this.cities.length) return;

      // подложка
      if (this.worldPaths.length) {
        ctx.save();
        ctx.setTransform(this.k, 0, 0, this.k, this.ox, this.oy);
        ctx.lineWidth = Math.max(0.4, 0.9 / this.k) * s;
        ctx.strokeStyle = M.rgba(M.COLORS.paper, 0.17);
        ctx.fillStyle = M.rgba(M.COLORS.graphite, 0.3);
        for (const p of this.worldPaths) { ctx.fill(p); ctx.stroke(p); }
        ctx.restore();
      }

      const anyFilter = this.buckets.size > 0;
      for (const c of this.cities) {
        const shown = this.shownItems(c).length;
        if (anyFilter && !shown) continue;
        this.drawCity(c, shown);
      }
      this.drawCityLabels(anyFilter);
    }

    drawCity(city, shown) {
      const ctx = this.ctx;
      const s = this.s;
      const counts = this.countsOf(city);
      const total = city.items.length;
      const active = this.activeCity === city;
      // радиус по числу видимых книг, чтобы фильтр было видно на карте
      const r = this.buckets.size
        ? (7 + 4.6 * Math.sqrt(Math.max(1, shown))) * s
        : city.r;

      ctx.save();
      ctx.beginPath();
      ctx.arc(city.x, city.y, r, 0, Math.PI * 2);
      ctx.fillStyle = M.rgba(M.COLORS.ink, 0.72);
      ctx.fill();

      // кольцо-состав
      let a0 = -Math.PI / 2;
      const ringW = Math.max(4 * s, r * 0.34);
      for (const b of M.BUCKETS) {
        const n = this.buckets.size
          ? city.items.filter((i) => i.bucket === b && this.passes(i)).length
          : counts[b];
        if (!n) continue;
        const denom = this.buckets.size ? Math.max(1, shown) : total;
        const a1 = a0 + (n / denom) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(city.x, city.y, r - ringW / 2, a0, a1);
        ctx.strokeStyle = M.BUCKET_META[b].accent;
        ctx.lineWidth = ringW;
        ctx.stroke();
        a0 = a1;
      }

      ctx.beginPath();
      ctx.arc(city.x, city.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = active ? M.COLORS.brass : M.rgba(M.COLORS.paper, 0.3);
      ctx.lineWidth = (active ? 2.4 : 1) * s;
      ctx.stroke();

      ctx.fillStyle = M.rgba(M.COLORS.paper, 0.92);
      ctx.font = `600 ${Math.max(10 * s, r * 0.52)}px "20 Kopeek", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(this.buckets.size ? shown : total), city.x, city.y);
      ctx.restore();
    }

    // Подписи городов: крупные забирают место первыми, налезающие отбрасываются.
    drawCityLabels(anyFilter) {
      const ctx = this.ctx;
      const s = this.s;
      const taken = [];
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const c of [...this.cities].sort((a, b) => b.items.length - a.items.length)) {
        const shown = this.shownItems(c).length;
        if (anyFilter && !shown) continue;
        const r = anyFilter ? (7 + 4.6 * Math.sqrt(Math.max(1, shown))) * s : c.r;
        const fs = 11 * s;
        ctx.font = `400 ${fs}px "20 Kopeek", monospace`;
        const w = ctx.measureText(c.short).width;
        const x = c.x, y = c.y + r + 5 * s;
        const box = [x - w / 2 - 3 * s, y, x + w / 2 + 3 * s, y + fs * 1.2];
        if (taken.some((t) => !(box[2] < t[0] || box[0] > t[2] || box[3] < t[1] || box[1] > t[3]))) continue;
        taken.push(box);
        ctx.fillStyle = M.rgba(M.COLORS.ink, 0.75);
        ctx.fillText(c.short, x + 1 * s, y + 1 * s);
        ctx.fillStyle = this.activeCity === c ? M.COLORS.brass : M.rgba(M.COLORS.paper, 0.8);
        ctx.fillText(c.short, x, y);
      }
      ctx.restore();
    }
  }

  new Geography().start();
})();
