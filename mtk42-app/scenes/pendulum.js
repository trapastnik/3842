/* Сцена «Маятник оценки» — точки в координатах (тон, год) + скользящее среднее.
 * Перенос из mtk42-pendulum/ на контракт сцены.
 *
 * Настройки объявлены декларативно (схема v1.2, PLAN-KIOSK): ядро/мост рисует
 * их в сервис-панели и отдаёт сюда через applySettings(values). Дефолты и
 * диапазоны — по описи SETTINGS-INVENTORY.md, чтобы ничего не потерялось при
 * переезде с прототипа.
 *
 * Категории — контрол ПОСЕТИТЕЛЯ (класс Б): чипы на сцене, персиста нет,
 * reset() возвращает «все включены».
 *
 * Здесь же аттрактор приложения: в standby лента медленно прокручивается.
 * Петля — штатный app.standbyTicker() (ядро 1.7.0), темп берётся из
 * timings.standbyFps; скорость дрейфа задана в px/с и от FPS не зависит. */
import {
  DATA, buildPeople, portraitList, personCardHtml, createOverlay, esc,
  applyPhotoMode,
} from "./shared.js?v=28";

const YEAR_MIN = 1920, YEAR_MAX = 2026;
const TOP_PAD = 36, BOTTOM_PAD = 36;
/* «Канон» 1934–1985 сжимаем: 50 лет почти без голосов растянули бы ленту. */
const COMPRESSED = [{ from: 1934, to: 1985, scale: 0.18 }];
const CATS = ["leaders", "politician", "researcher", "writers"];

export const pendulumScene = {
  id: "pendulum",
  title: { ru: "Маятник истории", en: "Pendulum of history", zh: "历史的钟摆" },

  /* ─── Схема настроек (v1.2). Диапазоны и дефолты — из описи. ─────────── */
  settings: [
    { key: "cardDesign", label: { ru: "Дизайн карточки героя" }, type: "select",
      default: "classic",
      options: [{ value: "classic", label: { ru: "Классика" } },
                { value: "air", label: { ru: "Больше воздуха" } }] },

    { key: "dotSize", label: { ru: "Размер точек" }, type: "range",
      min: 72, max: 160, step: 4, unit: " px", default: 112 },
    { key: "pxPerYear", label: { ru: "Плотность лет" }, type: "range",
      min: 22, max: 60, step: 1, unit: " px/год", default: 42 },
    { key: "minGap", label: { ru: "Зазор между точками (0 — авто)" }, type: "range",
      min: 0, max: 220, step: 4, unit: " px", default: 0 },

    { key: "showPendulum", label: { ru: "Кривая маятника" }, type: "toggle", default: true },
    { key: "strokeWidth", label: { ru: "Кривая: толщина" }, type: "range",
      min: 1, max: 16, step: 1, unit: " px", default: 6 },
    { key: "smoothWindow", label: { ru: "Кривая: сглаживание" }, type: "range",
      min: 1, max: 15, step: 1, unit: " ± лет", default: 7 },
    { key: "strokeOpacity", label: { ru: "Кривая: непрозрачность" }, type: "range",
      min: 10, max: 100, step: 1, unit: " %", default: 62 },

    { key: "showRuler", label: { ru: "Шкала лет справа" }, type: "toggle", default: true },
    { key: "showEpochs", label: { ru: "Подписи эпох" }, type: "toggle", default: true },
    { key: "compressCanon", label: { ru: "Сжать эпоху «Канон»" }, type: "toggle", default: true },

    { key: "axisSize", label: { ru: "Ось: размер" }, type: "range",
      min: 8, max: 40, step: 1, unit: " px", default: 12 },
    { key: "axisOpacity", label: { ru: "Ось: непрозрачность" }, type: "range",
      min: 20, max: 100, step: 1, unit: " %", default: 72 },
    { key: "axisBold", label: { ru: "Ось: жирный" }, type: "toggle", default: false },

    { key: "epochSize", label: { ru: "Эпохи: размер" }, type: "range",
      min: 12, max: 64, step: 1, unit: " px", default: 28 },
    { key: "epochOpacity", label: { ru: "Эпохи: непрозрачность" }, type: "range",
      min: 5, max: 100, step: 1, unit: " %", default: 20 },
    { key: "epochBold", label: { ru: "Эпохи: жирный" }, type: "toggle", default: false },

    { key: "yearSize", label: { ru: "Годы: размер" }, type: "range",
      min: 8, max: 48, step: 1, unit: " px", default: 22 },
    { key: "yearOpacity", label: { ru: "Годы: непрозрачность" }, type: "range",
      min: 20, max: 100, step: 1, unit: " %", default: 65 },
    { key: "yearBold", label: { ru: "Годы: жирный" }, type: "toggle", default: false },
  ],

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
    this._cats = new Set(CATS);            // посетительский фильтр, деф. «все»
    this._cfg = this._cfg || this._defaults();

    const root = document.createElement("div");
    root.className = "m42-pend";
    root.innerHTML =
      '<header class="m42-head">' +
      '<h1 class="m42-head__title"></h1>' +
      '<p class="m42-head__sub"></p>' +
      "</header>" +
      '<div class="m42-filters m42-pend__cats" data-row="cat"></div>' +
      '<div class="m42-pend__axis">' +
      '<span data-axis="neg"></span><span data-axis="mid"></span><span data-axis="pos"></span>' +
      "</div>" +
      '<div class="m42-pend__scroll kiosk-scroll"><div class="m42-pend__inner"></div></div>';
    el.appendChild(root);

    this._root = root;
    this._catsEl = root.querySelector('[data-row="cat"]');
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

    /* Категории — множественный выбор: снять «Вождей», оставить «Литературу». */
    this._onCat = (e) => {
      const btn = e.target.closest("[data-value]");
      if (!btn) return;
      const v = btn.getAttribute("data-value");
      if (v === "all") this._cats = new Set(CATS);
      else if (this._cats.has(v)) {
        this._cats.delete(v);
        if (!this._cats.size) this._cats = new Set(CATS);   // пустой экран не отдаём
      } else this._cats.add(v);
      this._renderCats();
      this._build();
    };
    this._catsEl.addEventListener("click", this._onCat);

    /* Слой сцены при показе меняет размер с 0 на полный — наивный RO
     * перестраивал бы 140 точек на каждом переключении. */
    this._lastW = 0;
    this._ro = new ResizeObserver(() => {
      const w = this._scrollEl ? this._scrollEl.clientWidth : 0;
      if (!w || Math.abs(w - this._lastW) < 2) return;
      this._lastW = w;
      this._build();
    });
    this._ro.observe(this._scrollEl);

    /* Вешаем на КОРЕНЬ сцены, а не на ленту прокрутки: подсказка позиционируется
     * absolute от контейнера, и внутри скроллера её «bottom» отсчитывается от
     * всего содержимого (тысячи px), а не от видимой области — замер показал
     * y = −188, то есть за верхней кромкой экрана. Гасители работают: события
     * из ленты всплывают до корня. */
    if (window.KioskHint) {
      this._hint = window.KioskHint.attach(root, {
        gesture: "drag", label: this._app.t("hint.drag"),
      });
    }

    this._applyVars();
    this._renderChrome();
    this._renderCats();
    this._build();
    this._scrollEl.scrollTop = Math.max(0, this._yearToY(1988) - this._scrollEl.clientHeight / 4);
  },

  unmount() {
    this._stopDrift();
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._hint && this._hint.destroy) this._hint.destroy();
    if (this._innerEl) this._innerEl.removeEventListener("click", this._onDot);
    if (this._catsEl) this._catsEl.removeEventListener("click", this._onCat);
    if (this._overlay) this._overlay.destroy();
    if (this._root) this._root.remove();
    this._root = this._scrollEl = this._innerEl = this._overlay = this._app = null;
    this._catsEl = this._items = this._content = this._hint = null;
  },

  pause() { this._stopDrift(); },
  resume() {},

  reset() {
    if (this._overlay) this._overlay.close();
    this._stopDrift();
    this._cats = new Set(CATS);          // посетительский фильтр — сбрасывается
    this._renderCats();
    if (this._scrollEl) {
      this._scrollEl.scrollTop = Math.max(0, this._yearToY(1988) - this._scrollEl.clientHeight / 4);
    }
    this._build();
  },

  setLang() {
    this._renderChrome();
    this._renderCats();
    if (this._hint) this._hint.setLabel(this._app.t("hint.drag"));
    this._build();
  },

  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
    this._applyVars();
    this._build();
  },

  /* Схема v1.2: ядро (пока — мост) отдаёт готовые значения. */
  /* Общая настройка МТК: ядро зовёт это у всех смонтированных сцен.
   * Реализация одна на всех — см. shared.js. */
  applyAppSettings(values) { applyPhotoMode(values); },

  applySettings(values) {
    this._cfg = Object.assign(this._defaults(), values || {});
    if (!this._root) return;
    this._applyVars();
    this._build();
  },

  _defaults() {
    const d = {};
    for (const row of this.settings) d[row.key] = row.default;
    return d;
  },

  /* Аттрактор на штатной петле ядра (1.7.0): темп берётся из
   * timings.standbyFps, свой setInterval больше не нужен. */
  standby() {
    const scroll = this._scrollEl;
    if (!scroll) return null;
    if (this._overlay) this._overlay.close();
    let dir = 1, prev = 0;
    const SPEED = 60;   // px/с — независимо от standbyFps
    this._driftStop = this._app.standbyTicker((t) => {
      const max = scroll.scrollHeight - scroll.clientHeight;
      const dt = Math.max(0, Math.min(1, t - prev));
      prev = t;
      if (max <= 0) return;
      let next = scroll.scrollTop + dir * SPEED * dt;
      if (next >= max) { next = max; dir = -1; }
      if (next <= 0) { next = 0; dir = 1; }
      scroll.scrollTop = next;
    });
    /* Подсказку на время заставки гасит ядро (KioskHint.suppressAll, кит
     * 1.13.0), поэтому здесь только остановка дрейфа.
     *
     * Своего rearm() тут больше нет, и это не упрощение ради упрощения:
     * suppressAll(false) зовёт applyMute() у каждой живой подсказки, а тот на
     * неподавленной вызывает arm() — то есть ядро взводит 30-секундный цикл
     * само, ещё ДО этой стоп-функции. Мой вызов перевзводил бы тот же таймер
     * вторым заходом в ту же долю секунды. Прежнее обоснование («таймер за
     * время простоя откручен, без перевзвода посетитель останется без
     * призыва») было верно до 1.20.3 и с этим китом уже неверно. */
    return () => this._stopDrift();
  },

  _stopDrift() {
    if (this._driftStop) { this._driftStop(); this._driftStop = null; }
  },

  /* «Загружено, но пусто» ловится по числу отрисованных портретов: данные
   * могут прийти, а раскладка — упасть на нуле ширины контейнера. */
  healthcheck() {
    if (!this._innerEl) return { ok: false, detail: "сцена не смонтирована" };
    const dots = this._innerEl.querySelectorAll(".m42-dot").length;
    const want = this._visible().length;
    return dots >= want && want > 0
      ? { ok: true, detail: "точек отрисовано " + dots }
      : { ok: false, detail: "точек отрисовано " + dots + " из " + want };
  },

  /* ─── настройки → CSS-переменные ─────────────────────────────────────── */

  /* Кегли прототипа заданы для 1920 px; на 4K удваиваем, a11y множит сверху. */
  _px(v) { return (v * this._scale()).toFixed(1) + "px"; },

  _applyVars() {
    if (!this._root) return;
    const c = this._cfg, s = this._root.style;
    s.setProperty("--pend-axis-size", this._px(c.axisSize));
    s.setProperty("--pend-axis-opacity", (c.axisOpacity / 100).toFixed(2));
    s.setProperty("--pend-axis-weight", c.axisBold ? "700" : "400");
    s.setProperty("--pend-epoch-size", this._px(c.epochSize));
    s.setProperty("--pend-epoch-opacity", (c.epochOpacity / 100).toFixed(2));
    s.setProperty("--pend-epoch-weight", c.epochBold ? "700" : "400");
    s.setProperty("--pend-year-size", this._px(c.yearSize));
    s.setProperty("--pend-year-opacity", (c.yearOpacity / 100).toFixed(2));
    s.setProperty("--pend-year-weight", c.yearBold ? "700" : "400");
    s.setProperty("--pend-stroke", String(c.strokeWidth));
    s.setProperty("--pend-stroke-opacity", (c.strokeOpacity / 100).toFixed(2));
    this._root.setAttribute("data-card", c.cardDesign);
  },

  /* ─── координаты ─────────────────────────────────────────────────────── */

  _ranges() { return this._cfg.compressCanon ? COMPRESSED : []; },

  _segments() {
    const ranges = this._ranges();
    const bp = new Set([YEAR_MIN, YEAR_MAX]);
    ranges.forEach((r) => { bp.add(r.from); bp.add(r.to); });
    const sorted = [...bp].filter((y) => y >= YEAR_MIN && y <= YEAR_MAX).sort((a, b) => a - b);
    const segs = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i], to = sorted[i + 1];
      const r = ranges.find((rr) => rr.from <= from && to <= rr.to);
      segs.push({ from, to, scale: r ? r.scale : 1 });
    }
    return segs;
  },

  _yearToY(year) {
    const y = Math.max(YEAR_MIN, Math.min(YEAR_MAX, year));
    const px = this._cfg.pxPerYear * this._scale();
    let acc = TOP_PAD;
    for (const s of this._segs || []) {
      if (y >= s.to) acc += (s.to - s.from) * px * s.scale;
      else if (y > s.from) { acc += (y - s.from) * px * s.scale; break; }
      else break;
    }
    return acc;
  },

  _scale() { return Math.min(2, Math.max(1, window.innerWidth / 1920)); },

  _dotSize() {
    return this._cfg.dotSize * this._scale() * (this._app.a11y ? 1.25 : 1);
  },

  _toneX(tone) {
    const t = Math.max(-1, Math.min(1, tone));
    return 12 + ((t + 1) / 2) * 76;
  },

  _visible() {
    return this._items.filter((it) => this._cats.has(it.category));
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

  _renderCats() {
    if (!this._catsEl) return;
    const t = (k) => this._app.t(k);
    const all = this._cats.size === CATS.length;
    const btn = (v, on) =>
      '<button type="button" class="m42-filter kiosk-target' + (on ? " is-active" : "") +
      '" data-value="' + v + '">' + esc(t(v === "all" ? "cat.all" : "cat." + v)) + "</button>";
    this._catsEl.innerHTML =
      btn("all", all) + CATS.map((c) => btn(c, this._cats.has(c))).join("");
  },

  _build() {
    if (!this._innerEl) return;
    this._segs = this._segments();
    const inner = this._innerEl;
    inner.innerHTML = "";
    const height = this._yearToY(YEAR_MAX) + BOTTOM_PAD;
    inner.style.height = height + "px";

    if (this._cfg.showEpochs) this._drawEpochs(inner);
    if (this._cfg.showRuler) this._drawRuler(inner);
    this._drawZero(inner);
    if (this._cfg.showPendulum) this._drawCurve(inner, height);
    this._drawDots(inner);
  },

  _drawEpochs(root) {
    const t = (k) => this._app.t(k);
    const ranges = this._ranges();
    for (const ep of this._content.epochs || []) {
      const [y1, y2] = ep.years;
      if (y2 <= YEAR_MIN || y1 >= YEAR_MAX) continue;
      const a = Math.max(YEAR_MIN, y1), b = Math.min(YEAR_MAX, y2);
      const top = this._yearToY(a), h = this._yearToY(b) - top;
      const squeezed = ranges.some((r) => r.from <= a && b <= r.to);
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
    const ranges = this._ranges();
    const step = this._app.a11y ? 20 : 10;
    for (let y = YEAR_MIN; y <= YEAR_MAX; y += step) {
      if (ranges.find((r) => y > r.from && y < r.to)) continue;
      const tick = document.createElement("div");
      tick.className = "m42-pend__tick";
      tick.textContent = String(y);
      tick.style.top = this._yearToY(y) + "px";
      ruler.appendChild(tick);
    }
    root.appendChild(ruler);
  },

  _drawZero(root) {
    const zero = document.createElement("div");
    zero.className = "m42-pend__zero";
    zero.style.left = this._toneX(0) + "%";
    root.appendChild(zero);
  },

  _drawCurve(root, height) {
    const items = this._visible();
    if (!items.length) return;
    const width = root.clientWidth || 1200;
    const win = Math.max(1, this._cfg.smoothWindow);
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "m42-pend__svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("preserveAspectRatio", "none");

    const buckets = new Map();
    for (const it of items) {
      if (!buckets.has(it.year)) buckets.set(it.year, []);
      buckets.get(it.year).push(it.tone);
    }
    const pts = [];
    for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
      let sum = 0, count = 0;
      for (let yy = y - win; yy <= y + win; yy++) {
        const arr = buckets.get(yy);
        if (!arr) continue;
        const w = 1 - Math.abs(yy - y) / (win + 1);
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
    const gap = Number(this._cfg.minGap);
    const minDist = gap > 0 ? gap * this._scale() : Math.max(40, size - 20);
    const vert = Math.max(60, size - 12);
    const halfPct = ((size / 2 + 4) / containerW) * 100;
    const placed = [];

    const sorted = [...this._visible()].sort((a, b) => a.year - b.year || a.tone - b.tone);
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
