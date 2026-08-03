/* Сцена «Маятник оценки» — точки в координатах (тон, год) + скользящее среднее.
 * Перенос из mtk42-pendulum/ на контракт сцены.
 *
 * Здесь же живёт аттрактор приложения: в standby маятник медленно
 * прокручивается сам — материал МТК красивее общей заставки ядра.
 * Петля идёт на setInterval 100 мс = 10 fps, ровно потолок стандарта. */
import {
  DATA, buildPeople, portraitList, personCardHtml, createOverlay, esc,
} from "./shared.js";

const YEAR_MIN = 1920, YEAR_MAX = 2026;
const TOP_PAD = 36, BOTTOM_PAD = 36;
const PX_PER_YEAR = 42;
const SMOOTH_WIN = 7;
/* «Канон» 1934–1985 сжимаем: 50 лет почти без голосов растянули бы ленту. */
const COMPRESSED = [{ from: 1934, to: 1985, scale: 0.18 }];

export const pendulumScene = {
  id: "pendulum",
  title: { ru: "Маятник", en: "Pendulum", zh: "钟摆" },

  preload: {
    data: { people: DATA.people, portraits: DATA.portraits },
    custom(ctx) {
      const urls = portraitList(ctx.data.portraits || {});
      return Promise.all(urls.map((u) => new Promise((res) => {
        const img = new Image();
        img.onload = img.onerror = () => res();
        img.src = u;
      })));
    },
  },

  mount(el, ctx) {
    this._app = ctx.app;
    this._content = ctx.data.people;
    this._items = buildPeople(ctx.data.people, ctx.data.portraits || {});
    this._drift = 0;

    const root = document.createElement("div");
    root.className = "m42-pend";
    root.innerHTML =
      '<header class="m42-head m42-head--over">' +
      '<h1 class="m42-head__title"></h1>' +
      '<p class="m42-head__sub"></p>' +
      "</header>" +
      '<div class="m42-pend__axis">' +
      '<span data-axis="neg"></span><span data-axis="mid"></span><span data-axis="pos"></span>' +
      "</div>" +
      '<div class="m42-pend__scroll kiosk-scroll"><div class="m42-pend__inner"></div></div>';
    el.appendChild(root);

    this._root = root;
    this._scrollEl = root.querySelector(".m42-pend__scroll");
    this._innerEl = root.querySelector(".m42-pend__inner");
    this._overlay = createOverlay(el, this._app);

    this._onDot = (e) => {
      const dot = e.target.closest("[data-id]");
      if (!dot) return;
      const it = this._items.find((x) => x.id === dot.getAttribute("data-id"));
      if (it) this._overlay.open(personCardHtml(this._app, it));
    };
    this._innerEl.addEventListener("click", this._onDot);

    /* Слой сцены при показе меняет размер с 0 на полный — наивный RO
     * перестраивал бы 140 точек на каждом переключении. Перестраиваем
     * только когда ширина реально изменилась. */
    this._lastW = 0;
    this._ro = new ResizeObserver(() => {
      const w = this._scrollEl ? this._scrollEl.clientWidth : 0;
      if (!w || Math.abs(w - this._lastW) < 2) return;
      this._lastW = w;
      this._build();
    });
    this._ro.observe(this._scrollEl);

    /* Драг вертикальной ленты — по тач-стандарту нужен призыв к жесту. */
    if (window.KioskHint) {
      this._hint = window.KioskHint.attach(this._scrollEl, { gesture: "drag" });
    }

    this._renderChrome();
    this._build();
    /* Входим не в пустой 1920-й, а туда, где голосов гуще. */
    this._scrollEl.scrollTop = Math.max(0, this._yearToY(1988) - this._scrollEl.clientHeight / 4);
  },

  unmount() {
    this._stopDrift();
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._hint && this._hint.destroy) this._hint.destroy();
    if (this._innerEl) this._innerEl.removeEventListener("click", this._onDot);
    if (this._overlay) this._overlay.destroy();
    if (this._root) this._root.remove();
    this._root = this._scrollEl = this._innerEl = this._overlay = this._app = null;
    this._items = this._content = this._hint = null;
  },

  /* Анимации в активном состоянии нет; на паузе глушим аттрактор, если он шёл. */
  pause() { this._stopDrift(); },
  resume() {},

  reset() {
    if (this._overlay) this._overlay.close();
    this._stopDrift();
    if (this._scrollEl) {
      this._scrollEl.scrollTop = Math.max(0, this._yearToY(1988) - this._scrollEl.clientHeight / 4);
    }
    this._build();
  },

  setLang() { this._renderChrome(); this._build(); },

  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
    this._build();
  },

  /* Аттрактор: медленный дрейф ленты сверху вниз и обратно, 10 fps. */
  standby() {
    const scroll = this._scrollEl;
    if (!scroll) return null;
    if (this._overlay) this._overlay.close();
    let dir = 1;
    this._driftTimer = setInterval(() => {
      const max = scroll.scrollHeight - scroll.clientHeight;
      if (max <= 0) return;
      let next = scroll.scrollTop + dir * 6;
      if (next >= max) { next = max; dir = -1; }
      if (next <= 0) { next = 0; dir = 1; }
      scroll.scrollTop = next;
    }, 100);
    return () => this._stopDrift();
  },

  _stopDrift() {
    if (this._driftTimer) { clearInterval(this._driftTimer); this._driftTimer = 0; }
  },

  /* ─── координаты ─────────────────────────────────────────────────────── */

  _segments() {
    const bp = new Set([YEAR_MIN, YEAR_MAX]);
    COMPRESSED.forEach((r) => { bp.add(r.from); bp.add(r.to); });
    const sorted = [...bp].filter((y) => y >= YEAR_MIN && y <= YEAR_MAX).sort((a, b) => a - b);
    const segs = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i], to = sorted[i + 1];
      const r = COMPRESSED.find((rr) => rr.from <= from && to <= rr.to);
      segs.push({ from, to, scale: r ? r.scale : 1 });
    }
    return segs;
  },

  _yearToY(year) {
    const y = Math.max(YEAR_MIN, Math.min(YEAR_MAX, year));
    const px = PX_PER_YEAR * this._scale();
    let acc = TOP_PAD;
    for (const s of this._segs || []) {
      if (y >= s.to) acc += (s.to - s.from) * px * s.scale;
      else if (y > s.from) { acc += (y - s.from) * px * s.scale; break; }
      else break;
    }
    return acc;
  },

  /* Всё в сцене нормировано на 1920 px ширины: на 4K вдвое крупнее. */
  _scale() { return Math.min(2, Math.max(1, window.innerWidth / 1920)); },

  _dotSize() {
    const base = Number(this._app.getSetting("pendulum.dotSize")) || 112;
    return base * this._scale() * (this._app.a11y ? 1.25 : 1);
  },

  _toneX(tone) {
    const t = Math.max(-1, Math.min(1, tone));
    return 12 + ((t + 1) / 2) * 76;
  },

  /* ─── сборка ─────────────────────────────────────────────────────────── */

  _renderChrome() {
    if (!this._root) return;
    const t = (k) => this._app.t(k);
    this._root.querySelector(".m42-head__title").textContent = t("pendulum.title");
    this._root.querySelector(".m42-head__sub").textContent = t("pendulum.subtitle");
    this._root.querySelector('[data-axis="neg"]').textContent = t("tone.negative");
    this._root.querySelector('[data-axis="mid"]').textContent = t("tone.neutral");
    this._root.querySelector('[data-axis="pos"]').textContent = t("tone.positive");
  },

  _build() {
    if (!this._innerEl) return;
    this._segs = this._segments();
    const inner = this._innerEl;
    inner.innerHTML = "";
    const height = this._yearToY(YEAR_MAX) + BOTTOM_PAD;
    inner.style.height = height + "px";

    this._drawEpochs(inner);
    this._drawRuler(inner);
    this._drawCurve(inner, height);
    this._drawDots(inner);
  },

  _drawEpochs(root) {
    const t = (k) => this._app.t(k);
    for (const ep of this._content.epochs || []) {
      const [y1, y2] = ep.years;
      if (y2 <= YEAR_MIN || y1 >= YEAR_MAX) continue;
      const a = Math.max(YEAR_MIN, y1), b = Math.min(YEAR_MAX, y2);
      const top = this._yearToY(a), h = this._yearToY(b) - top;
      const squeezed = COMPRESSED.some((r) => r.from <= a && b <= r.to);
      const band = document.createElement("div");
      band.className = "m42-pend__band" + (squeezed ? " is-compressed" : "");
      band.style.top = top + "px";
      band.style.height = h + "px";
      root.appendChild(band);

      const label = document.createElement("div");
      label.className = "m42-pend__epoch" + (squeezed ? " is-compressed" : "");
      label.style.top = (squeezed ? top + h / 2 : top + 18) + "px";
      label.innerHTML = esc(t("epoch." + ep.id)) +
        '<span class="m42-pend__epoch-years">' + y1 + "–" + y2 +
        (squeezed ? " · " + esc(t("pendulum.compressed")) : "") + "</span>";
      root.appendChild(label);
    }
  },

  _drawRuler(root) {
    const ruler = document.createElement("div");
    ruler.className = "m42-pend__ruler";
    const step = this._app.a11y ? 20 : 10;
    for (let y = YEAR_MIN; y <= YEAR_MAX; y += step) {
      if (COMPRESSED.find((r) => y > r.from && y < r.to)) continue;
      const tick = document.createElement("div");
      tick.className = "m42-pend__tick";
      tick.textContent = String(y);
      tick.style.top = this._yearToY(y) + "px";
      ruler.appendChild(tick);
    }
    root.appendChild(ruler);
    const zero = document.createElement("div");
    zero.className = "m42-pend__zero";
    zero.style.left = this._toneX(0) + "%";
    root.appendChild(zero);
  },

  _drawCurve(root, height) {
    if (this._app.getSetting("pendulum.showPendulum") === false) return;
    const width = root.clientWidth || 1200;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "m42-pend__svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("preserveAspectRatio", "none");

    const buckets = new Map();
    for (const it of this._items) {
      if (!buckets.has(it.year)) buckets.set(it.year, []);
      buckets.get(it.year).push(it.tone);
    }
    const pts = [];
    for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
      let sum = 0, count = 0;
      for (let yy = y - SMOOTH_WIN; yy <= y + SMOOTH_WIN; yy++) {
        const arr = buckets.get(yy);
        if (!arr) continue;
        const w = 1 - Math.abs(yy - y) / (SMOOTH_WIN + 1);
        for (const tn of arr) { sum += tn * w; count += w; }
      }
      if (count > 0) pts.push([(this._toneX(sum / count) / 100) * width, this._yearToY(y)]);
    }
    if (pts.length > 1) {
      let d = "M " + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
      for (let i = 1; i < pts.length; i++) {
        const [px, py] = pts[i - 1], [cx, cy] = pts[i];
        d += " Q " + px.toFixed(1) + " " + py.toFixed(1) + " " +
             ((px + cx) / 2).toFixed(1) + " " + ((py + cy) / 2).toFixed(1);
      }
      const path = document.createElementNS(NS, "path");
      path.setAttribute("class", "m42-pend__path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    root.appendChild(svg);
  },

  /* Точки одного года расталкиваются по горизонтали, чтобы не слипались. */
  _drawDots(root) {
    const size = this._dotSize();
    const containerW = root.clientWidth || 1200;
    const minDist = Math.max(40, size - 20);
    const vert = Math.max(60, size - 12);
    const halfPct = ((size / 2 + 4) / containerW) * 100;
    const placed = [];

    const sorted = [...this._items].sort((a, b) => a.year - b.year || a.tone - b.tone);
    for (const it of sorted) {
      let xPct = this._toneX(it.tone);
      const yPx = this._yearToY(it.year);
      for (let i = 0; i < 40; i++) {
        let hit = false;
        for (const p of placed) {
          if (Math.abs(p.yPx - yPx) > vert) continue;
          if (Math.abs((xPct - p.xPct) / 100 * containerW) < minDist) {
            xPct += (it.tone >= 0 ? 1 : -1) * 2.0;
            hit = true;
          }
        }
        if (!hit) break;
      }
      placed.push({ it, xPct: Math.max(halfPct, Math.min(100 - halfPct, xPct)), yPx });
    }

    const frag = document.createDocumentFragment();
    for (const p of placed) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "m42-dot is-" + p.it.category;
      dot.style.left = p.xPct + "%";
      dot.style.top = p.yPx + "px";
      dot.style.width = dot.style.height = size + "px";
      dot.setAttribute("data-id", p.it.id);
      dot.setAttribute("aria-label", p.it.name + ", " + p.it.year);
      dot.innerHTML = p.it.portrait
        ? '<img src="' + esc(p.it.portrait) + '" alt="" />'
        : '<span class="m42-dot__initials">' + esc(p.it.initials) + "</span>";
      frag.appendChild(dot);
    }
    root.appendChild(frag);
  },
};
