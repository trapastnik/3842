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
 * Уровни детализации — по образцу mtk41-map-hier: при увеличении кружок
 * распадается на подкружки, между уровнями кроссфейд, тап на кружок с N>1 —
 * провал внутрь с доводкой камеры. Лестница у корпуса своя: города, потом
 * оси корпуса внутри города, потом отдельные книги.
 *
 *   ГОРОДА  (zf < thrAxis)          — один кружок на город, кольцо по осям
 *   ОСИ     (thrAxis..thrBook)      — до трёх кружков: ИМ / ЧИТАЛ / О НЁМ
 *   КНИГИ   (zf >= thrBook)         — отдельные книги
 *
 * Подкружки одного города выходят из одной точки, поэтому их расталкивает
 * релаксация, а к настоящей точке города тянется поводок — иначе непонятно,
 * откуда они взялись.
 */
(function () {
  const M = window.MTK40;
  const P = window.MTK40_PLACES;
  const WT = window.MtkProjection.WinkelTripel;

  const WORLD_W = 2000;
  const WORLD_H = WORLD_W / WT.ASPECT;
  const FIT_PAD = 0.14;
  const MIN_K = 0.4, MAX_K = 14;

  // Пороги в кратности к стартовому масштабу, а не в абсолютных единицах:
  // стартовый масштаб зависит от кадра, и абсолютные пороги ехали бы.
  const THR = { axis: 2.3, book: 5.5 };
  const FADE_HALF = 0.18;

  class Geography {
    constructor() {
      this.canvas = document.getElementById("view");
      this.ctx = this.canvas.getContext("2d");
      this.dpr = M.pickDpr();
      this.buckets = new Set();
      this.activeCity = null;
      this.selectedId = null;
      this.k = 1; this.k0 = 1; this.ox = 0; this.oy = 0;
      // до первой удачной раскладки кадра — безопасные значения,
      // иначе размеры считаются от undefined и уходят в NaN
      this.W = 0; this.H = 0; this.s = 1;
      this.fitted = false;
      this.drag = null;
      this.pointers = new Map();
      this.pinch = null;
      this.anim = null;
      this.worldPaths = [];
      this.lastClusters = [];
    }

    async start() {
      this.corpus = await M.loadCorpus();
      this.card = M.Card(document.getElementById("card"), this.corpus);
      this.card.onClose = () => { this.selectedId = null; };
      this.cityEl = document.getElementById("city");
      this.cityEl.querySelector(".city-panel__close")
        .addEventListener("click", () => { this.activeCity = null; this.cityEl.hidden = true; });
      this.homeChip = document.getElementById("home-chip");
      if (this.homeChip) this.homeChip.addEventListener("click", (e) => { e.stopPropagation(); this.goHome(); });

      this.groupByCity();
      this.buildFilters();

      fetch("../data/ne_110m_countries.geojson")
        .then((r) => r.json())
        .then((gj) => this.buildWorldPaths(gj))
        .catch(() => {});

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
      // Кадр может быть ещё не разложен (нулевой rect) — тогда подгонять не
      // по чему. Флаг не взводим: иначе первая же нулевая раскладка защёлкнет
      // масштаб в ноль навсегда, и вариант останется пустым.
      if (!f.W || !f.H) return;
      this.W = f.W; this.H = f.H; this.s = f.s;
      if (!this.fitted) { this.fitToCities(); this.fitted = true; }
    }

    fitToCities() {
      if (!this.cities.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of this.cities) {
        x0 = Math.min(x0, c.wx); x1 = Math.max(x1, c.wx);
        y0 = Math.min(y0, c.wy); y1 = Math.max(y1, c.wy);
      }
      const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
      const availW = this.W * (1 - 2 * FIT_PAD);
      const availH = this.H * (1 - 2 * FIT_PAD) - 90 * this.s;
      this.k = Math.min(availW / bw, availH / bh);
      this.k0 = this.k;
      this.ox = this.W / 2 - ((x0 + x1) / 2) * this.k;
      this.oy = (this.H / 2 + 40 * this.s) - ((y0 + y1) / 2) * this.k;
    }

    toScreen(wx, wy) { return { x: wx * this.k + this.ox, y: wy * this.k + this.oy }; }
    zf() { return this.k / (this.k0 || 1); }
    levelFor(zf) { return zf < THR.axis ? "CITY" : zf < THR.book ? "AXIS" : "BOOK"; }

    passes(item) { return !this.buckets.size || this.buckets.has(item.bucket); }
    shownItems(city) {
      return city.items.filter((i) => this.passes(i)).sort((a, b) => a.year_first - b.year_first);
    }

    // ---------- кластеры ----------
    buildClusters(level) {
      const out = [];
      // За кадром кластеры не строим: их поводки иначе тянутся через всю
      // карту от невидимых якорей. Запас — на расталкивание у самой кромки.
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
            add({
              items: sub, count: sub.length, label: M.BUCKET_META[b].label,
              kind: "axis", lane: b,
            });
          }
        } else {
          for (const it of items) {
            add({ items: [it], count: 1, label: it.title, kind: "book", book: it });
          }
        }

        // Подкружки города рождаются в одной точке. Расталкивание такой
        // вырожденный случай разводит не всегда: у Москвы «ИМ» и «ЧИТАЛ»
        // оставались под кольцом «О НЁМ». Поэтому сначала раскладываем их
        // по кольцу вокруг якоря — детерминированно, а релаксация потом
        // лишь доводит.
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
    }

    radiusFor(count) { return (7 + 4.6 * Math.sqrt(count)) * this.s; }

    materialize(clusters) {
      for (const c of clusters) c.r = this.radiusFor(c.count);
      // Подкружки одного города выходят из общей точки — расталкиваем.
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
    }

    // ---------- взаимодействие ----------
    onDown = (ev) => {
      this.pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
      if (this.pointers.size === 2) { this.startPinch(); return; }
      this.drag = { x: ev.offsetX, y: ev.offsetY, moved: false };
      this.anim = null;
      try { this.canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    };
    startPinch() {
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, k: this.k,
        cx: ((a.x + b.x) / 2) * this.dpr, cy: ((a.y + b.y) / 2) * this.dpr,
      };
      this.pinch.wx = (this.pinch.cx - this.ox) / this.k;
      this.pinch.wy = (this.pinch.cy - this.oy) / this.k;
      this.drag = null;
      this.anim = null;
    }
    onMove = (ev) => {
      if (this.pointers.has(ev.pointerId)) this.pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        this.k = Math.max(MIN_K, Math.min(MAX_K, this.pinch.k * (d / this.pinch.dist)));
        this.ox = this.pinch.cx - this.pinch.wx * this.k;
        this.oy = this.pinch.cy - this.pinch.wy * this.k;
        return;
      }
      if (!this.drag) return;
      const dx = (ev.offsetX - this.drag.x) * this.dpr;
      const dy = (ev.offsetY - this.drag.y) * this.dpr;
      if (Math.hypot(dx, dy) > 6 * this.dpr) this.drag.moved = true;
      if (!this.drag.moved) return;
      this.ox += dx; this.oy += dy;
      this.drag.x = ev.offsetX; this.drag.y = ev.offsetY;
    };
    onUp = (ev) => {
      this.pointers.delete(ev.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.drag && !this.drag.moved && this.pointers.size === 0) {
        const x = ev.offsetX * this.dpr, y = ev.offsetY * this.dpr;
        const hit = this.hitTest(x, y);
        if (hit && hit.count > 1) {
          this.drilldown(hit);
          this.showCity(hit.city, hit.lane);
        } else if (hit) {
          this.selectedId = hit.items[0].id;
          this.card.show(hit.items[0]);
        } else {
          this.activeCity = null; this.cityEl.hidden = true;
          this.card.hide(); this.selectedId = null;
        }
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
      this.anim = null;
    };

    hitTest(x, y) {
      let best = null, bestD = Infinity;
      for (const c of this.lastClusters) {
        const d = Math.hypot(x - c.x, y - c.y);
        const hitR = Math.max(c.r + 8 * this.s, 20 * this.s);
        if (d <= hitR && d < bestD) { bestD = d; best = c; }
      }
      return best;
    }

    // ---------- камера ----------
    animateTo(k, ox, oy, dur) {
      this.anim = { k0: this.k, k1: k, ox0: this.ox, ox1: ox, oy0: this.oy, oy1: oy,
                    t0: performance.now(), dur: dur || 420 };
    }
    updateAnim() {
      if (!this.anim) return;
      const a = this.anim;
      const t = Math.min(1, (performance.now() - a.t0) / a.dur);
      const e = 1 - Math.pow(1 - t, 3);
      this.k = a.k0 + (a.k1 - a.k0) * e;
      this.ox = a.ox0 + (a.ox1 - a.ox0) * e;
      this.oy = a.oy0 + (a.oy1 - a.oy0) * e;
      if (t >= 1) this.anim = null;
    }
    drilldown(cluster) {
      const lv = this.levelFor(this.zf());
      let targetZf;
      if (lv === "CITY") targetZf = THR.axis + 0.2;
      else if (lv === "AXIS") targetZf = THR.book + 0.2;
      else return;
      const k = Math.max(MIN_K, Math.min(MAX_K, this.k0 * targetZf));
      // держим точку города на месте: она и есть смысловой центр провала
      const wx = (cluster.ax - this.ox) / this.k;
      const wy = (cluster.ay - this.oy) / this.k;
      this.animateTo(k, this.W / 2 - wx * k, this.H * 0.54 - wy * k, 420);
    }
    goHome() {
      this.activeCity = null; this.cityEl.hidden = true;
      this.card.hide(); this.selectedId = null;
      const kFrom = this.k, oxFrom = this.ox, oyFrom = this.oy;
      this.fitted = false; this.resize();
      const kTo = this.k, oxTo = this.ox, oyTo = this.oy;
      this.k = kFrom; this.ox = oxFrom; this.oy = oyFrom;
      this.animateTo(kTo, oxTo, oyTo, 500);
    }

    showCity(city, lane) {
      this.activeCity = city;
      let list = this.shownItems(city);
      if (lane) list = list.filter((i) => i.bucket === lane);
      document.getElementById("city-name").textContent = city.label;
      const c = { "by-lenin": 0, "in-library": 0, "about-lenin": 0 };
      for (const i of city.items) c[i.bucket]++;
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
        b.addEventListener("click", () => { this.selectedId = item.id; this.card.show(item); });
        li.appendChild(b);
        ul.appendChild(li);
      }
      this.cityEl.hidden = false;
      this.cityEl.scrollTop = 0;
    }

    // ---------- отрисовка ----------
    loop = () => {
      if (!this.fitted) this.resize();   // догоняем, если кадр появился позже
      this.updateAnim();
      this.render();
      if (this.homeChip) this.homeChip.hidden = !(this.zf() > 1.05);
      requestAnimationFrame(this.loop);
    };

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.W, this.H);
      if (!this.cities.length) return;

      if (this.worldPaths.length) {
        ctx.save();
        ctx.setTransform(this.k, 0, 0, this.k, this.ox, this.oy);
        ctx.lineWidth = Math.max(0.4, 0.9 / this.k) * this.s;
        ctx.strokeStyle = M.rgba(M.COLORS.paper, 0.17);
        ctx.fillStyle = M.rgba(M.COLORS.graphite, 0.3);
        for (const p of this.worldPaths) { ctx.fill(p); ctx.stroke(p); }
        ctx.restore();
      }

      // кроссфейд между уровнями — как в mtk41-map-hier
      const zf = this.zf();
      const level = this.levelFor(zf);
      let band = null;
      for (const b of [{ z: THR.axis, lo: "CITY", hi: "AXIS" },
                       { z: THR.book, lo: "AXIS", hi: "BOOK" }]) {
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
    }

    drawLevel(clusters, alpha, level) {
      const ctx = this.ctx;
      const s = this.s;
      ctx.save();
      ctx.globalAlpha = alpha;

      // поводок от настоящей точки города к сдвинутому кружку
      ctx.strokeStyle = M.rgba(M.COLORS.paper, 0.25);
      ctx.lineWidth = 1 * s;
      for (const c of clusters) {
        const d = Math.hypot(c.x - c.ax, c.y - c.ay);
        // длинный поводок через полкарты читается как связь, а не как сдвиг
        if (d > c.r * 0.9 && d < 170 * s) {
          ctx.beginPath();
          ctx.moveTo(c.ax, c.ay);
          ctx.lineTo(c.x, c.y);
          ctx.stroke();
        }
      }
      // сама точка города — якорь остаётся виден на всех уровнях
      if (level !== "CITY") {
        ctx.fillStyle = M.rgba(M.COLORS.paper, 0.35);
        for (const c of clusters) {
          ctx.beginPath();
          ctx.arc(c.ax, c.ay, 2 * s, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const c of clusters) this.drawCluster(c, alpha, level);

      // подписи: крупные забирают место первыми, налезающие отбрасываются
      const taken = [];
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const c of clusters.slice().sort((a, b) => b.r - a.r)) {
        const fs = (c.kind === "book" ? 10 : 11) * s;
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
    }

    isSelected(c) {
      if (c.kind === "book") return c.book.id === this.selectedId;
      return this.activeCity === c.city;
    }

    drawCluster(c, alpha, level) {
      const ctx = this.ctx;
      const s = this.s;
      const sel = this.isSelected(c);

      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fillStyle = M.rgba(M.COLORS.ink, 0.72);
      ctx.fill();

      const ringW = Math.max(4 * s, c.r * 0.34);
      if (c.kind === "city") {
        // кольцо-состав: сразу видно, чем город занят
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
        ctx.font = `600 ${Math.max(10 * s, c.r * 0.52)}px "20 Kopeek", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(c.count), c.x, c.y);
      }
    }

    drawHud(level) {
      const ctx = this.ctx;
      const s = this.s;
      const human = level === "CITY" ? "ГОРОДА" : level === "AXIS" ? "ОСИ КОРПУСА" : "КНИГИ";
      ctx.save();
      ctx.font = `400 ${10 * s}px "20 Kopeek", monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = M.rgba(M.COLORS.brass, 0.5);
      ctx.fillText(`${human} · ×${this.zf().toFixed(2)} · КОЛЕСО/ЩИПОК = МАСШТАБ · DRAG = ПАН · ТАП = ВГЛУБЬ`,
        this.W - 14 * s, this.H - 12 * s);
      ctx.restore();
    }
  }

  new Geography().start();
})();
