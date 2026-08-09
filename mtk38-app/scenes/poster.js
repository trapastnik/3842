/* МТК 38 · сцена «Плакат» — типографский разворот, живущий сам по себе.
 *
 * Единственная сцена, которая читается как ПЕЧАТНЫЙ объект, а не как
 * интерактив: экран набран написаниями сплошь, крупные слова-герои стоят
 * поверх, мелкий текст их обтекает. Поэтому она и держит зал без единого
 * касания — остальные пять ждут, пока к ним подойдут.
 *
 * Наследник прототипа mtk38-poster. Что изменилось при переносе в киоск:
 *   · библиотека раскладки pretext вендорена локально (vendor/pretext) —
 *     прототип тянул её с esm.sh, а офлайн-киоск это убивает;
 *   · 42 языка, вписанные в код прототипа, заменены на канон (60 форм);
 *   · карточка языка — общая для всех сцен (scenes/card.js).
 *
 * Обтекание считает pretext: он разбивает поток на сегменты один раз, а
 * дальше по строкам отдаёт диапазоны под доступную ширину. Своими силами это
 * три экрана кода и заметно хуже на не-латинице.
 */
import {
  loadData, famBig, famWord, PAL, beginStandby, pollSize,
  bufferComplaint, offScreen, capDpr,
} from "./shared.js?v=17";
import { createCard } from "./card.js?v=17";
import {
  prepareWithSegments, layoutNextLineRange, materializeLineRange,
} from "../vendor/pretext/layout.js?v=0.0.8";

/* Ярусы героев: два огромных, потом мельче. Числа — доли короткой стороны,
 * поэтому раскладка одинаково держится и на 1080p, и на 4K. */
const TIERS = [
  { size: 0.20, count: 2 },
  { size: 0.115, count: 4 },
  { size: 0.075, count: 4 },
  { size: 0.05, count: 6 },
];

/* Слои заливки: крупный рисуется первым (в глубину), мелкий последним.
 * Каждый следующий обтекает боксы предыдущего — отсюда ощущение вёрстки. */
const LAYERS = [
  { size: 0.024, weight: 400, repeats: 14, lineHeight: 1.25, alpha: 0.78, tone: "paper" },
  { size: 0.038, weight: 600, repeats: 6, lineHeight: 1.2, alpha: 0.55, tone: "brass" },
  { size: 0.060, weight: 600, repeats: 3, lineHeight: 1.15, alpha: 0.18, tone: "paper" },
];

/* Насколько поздний слой может «поджать» бокс раннего. Ноль везде давал
 * решётку из пустых коридоров, единица — кашу; эти доли подобраны в прототипе. */
const SOFTNESS = [
  { prob: 0, max: 0 },
  { prob: 0.30, max: 0.18 },
  { prob: 0.35, max: 0.20 },
];

const makeRng = (seed) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

/* Стабильный хеш → [0,1). Мягкость бокса должна быть одинаковой от кадра к
 * кадру, иначе строки дрожали бы на месте. */
function hash01(a, b, c) {
  let h = 2654435761;
  h = ((h ^ (a | 0)) * 16777619) >>> 0;
  h = ((h ^ (b | 0)) * 16777619) >>> 0;
  h = ((h ^ (c | 0)) * 16777619) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function rotatedAabb(cx, cy, w, h, angle) {
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
  const halfW = (w * cos + h * sin) / 2, halfH = (w * sin + h * cos) / 2;
  return { x0: cx - halfW, y0: cy - halfH, x1: cx + halfW, y1: cy + halfH };
}

const overlap = (a, b) => !(a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0);

export const posterScene = {
  id: "poster",
  title: { ru: "Плакат", en: "Poster", zh: "海报" },

  settings: [
    { key: "density", label: { ru: "Плотность набора" }, type: "range", min: 0.5, max: 1.8, step: 0.05, default: 1 },
    { key: "hero", label: { ru: "Размер героев" }, type: "range", min: 0.6, max: 1.5, step: 0.05, default: 1 },
    { key: "drift", label: { ru: "Скорость дрейфа" }, type: "range", min: 0, max: 3, step: 0.1, default: 1 },
    { key: "push", label: { ru: "Расталкивание пальцем" }, type: "range", min: 0, max: 2, step: 0.05, default: 1 },
    { key: "brass", label: { ru: "Доля латуни, %" }, type: "range", min: 0, max: 60, step: 1, default: 18 },
    { key: "red", label: { ru: "Доля красного, %" }, type: "range", min: 0, max: 25, step: 1, default: 6 },
    { key: "grain", label: { ru: "Зерно" }, type: "range", min: 0, max: 0.2, step: 0.005, default: 0.05 },
    { key: "vign", label: { ru: "Виньетка" }, type: "range", min: 0, max: 1, step: 0.02, default: 0.85 },
  ],

  preload: {
    fonts: [
      "400 1em 'Nolde'", "400 1em '20 Kopeek'", "600 1em '20 Kopeek'",
      "400 1em '21 Cent'", "700 1em '21 Cent'",
    ],
    custom: async () => { await loadData(); },
  },

  async mount(el, ctx) {
    /* Ядро глотает исключение mount и всё равно считает сцену смонтированной.
     * Флаг отличает «ещё не начинали» от «начали и не доехали». */
    this._mountStarted = true;
    this._app = ctx && ctx.app;
    const data = await loadData();
    this._forms = data.forms;
    this._pubsOk = data.pubsOk;

    const root = document.createElement("div");
    root.className = "m38-scene m38-poster";
    root.innerHTML =
      '<canvas class="m38-canvas"></canvas>' +
      '<div class="m38-vign"></div><div class="m38-grain"></div>' +
      '<header class="m38-head"><div class="m38-kicker"></div>' +
      '<h1 class="m38-title"></h1><p class="m38-sub"></p></header>';
    el.appendChild(root);

    this._root = root;
    this._canvas = root.querySelector(".m38-canvas");
    this._ctx2d = this._canvas.getContext("2d", { alpha: true });
    this._card = createCard({
      publications: data.pubs,
      t: (k) => (this._app ? this._app.t(k) : null),
      lang: () => (this._app ? this._app.lang : "ru"),
    });

    this._cfg = this._cfg || {};
    this._heroes = [];
    this._layers = [];
    this._hits = [];
    this._world = { width: 0, height: 0 };
    this._drift = { x: 0, y: 0, t: 0 };
    /* Палец — не жёсткий круг, а груз на пружине: текст расступается плавно
     * и так же плавно смыкается, когда руку убрали. */
    this._push = { x: -1e5, y: -1e5, tx: -1e5, ty: -1e5, vx: 0, vy: 0, r: 0, on: false,
                   stiffness: 220, damping: 26, mass: 1 };

    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }

    this._bind();
    this._ro = new ResizeObserver(() => { this._size(); this._build(); });
    this._ro.observe(this._canvas);

    /* Подсказку вешаем на СЛОЙ СЦЕНЫ, а не на канвас: div внутри <canvas> —
     * fallback-контент, браузер его не рисует. */
    if (window.KioskHint) {
      this._hint = window.KioskHint.attach(root,
        { gesture: "tap", label: this._hintLabel() });
    }

    this.setLang(ctx && ctx.lang);
    this._size();
    this._build();
    this.applySettings(this._cfg);
    this._t0 = performance.now();
    this._prev = 0;
    this.resume();
  },

  unmount() {
    this._mountStarted = false;
    this.pause();
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._hint && this._hint.destroy) this._hint.destroy();
    this._hint = null;
    this._unbind();
    if (this._card) { this._card.destroy(); this._card = null; }
    if (this._root) this._root.remove();
    this._root = this._canvas = this._ctx2d = null;
    this._heroes = []; this._layers = []; this._hits = [];
  },

  pause() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } },

  resume() {
    if (this._raf || !this._root) return;
    const step = () => { this._raf = requestAnimationFrame(step); this._frame(); };
    this._raf = requestAnimationFrame(step);
  },

  reset() {
    if (this._card) this._card.close();
    this._push.on = false;
    this._drift.x = this._drift.y = this._drift.t = 0;
  },

  /* Контракт ядра: standby() без аргумента, возврат — стоп-функция петли.
   * Плакату заставка идёт лучше всех: он и в работе никого не ждёт, только
   * дрейф ускоряем, чтобы с трёх метров читалось движение. */
  standby() {
    this.pause();
    if (this._card) this._card.close();
    this._push.on = false;
    this._standby = true;
    return beginStandby(this._app, () => this._frame(), () => { this._standby = false; });
  },

  setLang(lang) {
    this._lang = lang || this._lang || "ru";
    const T = {
      ru: { kicker: "МТК 38 · Ленин на языках мира", title: "Имя набором",
            sub: (n) => `${n} написаний, набранных в один разворот. Тап по крупному слову — карточка языка и издания на нём.` },
      en: { kicker: "MTK 38 · Lenin in the world's languages", title: "The name, typeset",
            sub: (n) => `${n} written forms set as one spread. Tap a large word for the language card and its edition.` },
      zh: { kicker: "МТК 38 · 世界语言中的列宁", title: "排版之名",
            sub: (n) => `${n} 种写法排成一整版。点按大字查看卡片。` },
    }[this._lang];
    if (!T || !this._root) return;
    this._root.querySelector(".m38-kicker").textContent = T.kicker;
    this._root.querySelector(".m38-title").textContent = T.title;
    this._root.querySelector(".m38-sub").textContent = T.sub(this._forms.length);
    this._syncCardLang();
    if (this._hint && this._hint.setLabel) this._hint.setLabel(this._hintLabel());
  },

  _hintLabel() { return this._app ? this._app.t("hint.poster") : null; },

  _syncCardLang() { if (this._card && this._card.setLang) this._card.setLang(); },

  setA11y(on) {
    this._a11y = !!on;
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
    /* Слабовидящим мелкий слой не нужен вовсе — он декоративный, а читаемое
     * здесь это герои. Пересобираем набор крупнее и реже. */
    this._build();
  },

  applySettings(values) {
    this._cfg = Object.assign({}, this._cfg, values || {});
    if (!this._root) return;
    this._root.style.setProperty("--m38-grain", this._cfg.grain ?? 0.05);
    this._root.style.setProperty("--m38-vign", this._cfg.vign ?? 0.85);
    this._build();
  },

  healthcheck() {
    if (!this._root) {
      return this._mountStarted
        ? { ok: false, detail: "монтирование не завершилось — слой пуст" }
        : { ok: true, detail: "не смонтирована" };
    }
    if (!this._canvas) return { ok: false, detail: "монтирование не завершилось — канваса нет" };
    if (!this._forms || !this._forms.length) return { ok: false, detail: "канон не загрузился" };
    /* Порядок важен: и герои, и слои набора раскладываются ОТ РАЗМЕРА, а
     * размер приходит из кадра. В неактивном слое их законно ноль — это не
     * «загружено, но пусто», и красным здесь горела бы исправная сцена
     * (ловится перебором: он проверяет состояния, не показывая сцену). */
    if (offScreen(this._root)) {
      return { ok: true, detail: `${this._forms.length} форм готовы, слой не на экране` };
    }
    if (!this._heroes.length) return { ok: false, detail: "ни одного слова-героя не размещено" };
    if (!this._layers.length) return { ok: false, detail: "слои набора не собраны" };
    const bad = bufferComplaint(this._canvas, this._dpr, this._root);
    if (bad) return { ok: false, detail: bad };
    return { ok: true, detail: `героев ${this._heroes.length}, слоёв набора ${this._layers.length}, `
      + `тапаемых слов в кадре ${this._hits.length}` };
  },

  /* Перебору отдаём то, чего нет в схеме: набор без мелкого слоя — законное
   * состояние (режим слабовидящих), и оно должно проверяться отдельно. */
  states() {
    return [
      { name: "обычный набор", apply: () => { this._a11y = false; this._build(); } },
      { name: "режим слабовидящих", apply: () => { this._a11y = true; this._build(); } },
    ];
  },

  /* ── сборка ─────────────────────────────────────────────────────── */

  _size() {
    if (!this._canvas) return;
    const r = this._canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this._W = Math.floor(r.width); this._H = Math.floor(r.height);
    const dpr = capDpr(this._W, this._H);      // общий бюджет 8.3 Мп
    this._dpr = dpr;
    this._canvas.width = Math.floor(this._W * dpr);
    this._canvas.height = Math.floor(this._H * dpr);
    this._ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  _build() {
    if (!this._ctx2d || !this._W) return;
    this._buildHeroes();
    this._buildLayers();
  },

  /* Герои — самые весомые формы: языки ООН и крупные по числу носителей.
   * Прототип брал 16 позиций по индексам в захардкоженном массиве; теперь
   * порядок берётся из канона, поэтому набор осмысленный, а не случайный. */
  _buildHeroes() {
    const c = this._cfg || {};
    const scale = c.hero ?? 1;
    const short = Math.min(this._W, this._H);
    const rng = makeRng(0xA001F00D);
    const ctx = this._ctx2d;

    this._world.width = this._W * 1.5;
    this._world.height = this._H * 1.5;
    this._heroes = [];

    const picks = [...this._forms]
      .sort((a, b) => (b.un - a.un) || (b.wt - a.wt) || (b.speakers || 0) - (a.speakers || 0))
      .slice(0, TIERS.reduce((n, t) => n + t.count, 0));

    const margin = short * 0.04;
    const placed = [];
    let pick = 0;

    TIERS.forEach((tier, tierIndex) => {
      const size = short * tier.size * scale;
      for (let i = 0; i < tier.count && pick < picks.length; i++, pick++) {
        const item = picks[pick];
        const weight = item.pr ? 600 : 400;
        ctx.font = `${weight} ${size}px ${famBig(item.sc)}`;
        const w = ctx.measureText(item.w).width;
        const h = size * 1.05;

        const angle = tierIndex === 0 ? 0
          : rng() < 0.4 ? -15 * Math.PI / 180
          : rng() < 0.18 ? Math.PI / 2 : 0;

        let cx = 0, cy = 0, box = null, ok = false;
        for (let a = 0; a < 80; a++) {
          cx = margin + rng() * (this._world.width - margin * 2);
          cy = margin + rng() * (this._world.height - margin * 2);
          box = rotatedAabb(cx, cy, w + margin * 0.6, h + margin * 0.3, angle);
          if (box.x0 < margin || box.y0 < margin
            || box.x1 > this._world.width - margin || box.y1 > this._world.height - margin) continue;
          if (!placed.some((p) => overlap(box, p))) { ok = true; break; }
        }
        if (!ok) continue;

        const r = rng() * 100;
        const tone = pick === 0 ? "red"
          : r < (c.red ?? 6) ? "red"
          : r < (c.red ?? 6) + (c.brass ?? 18) ? "brass" : "paper";

        placed.push(box);
        this._heroes.push({
          item, x: cx, y: cy, size, angle, weight, tone, tier: tierIndex,
          padW: w + size * 0.5, padH: h + size * 0.3,
        });
      }
    });
  },

  _buildLayers() {
    const c = this._cfg || {};
    const density = (c.density ?? 1) * (this._a11y ? 0.55 : 1);
    const short = Math.min(this._W, this._H);
    this._layers = [];

    /* В режиме слабовидящих мелкий слой снимаем совсем: он декоративный,
     * а на крупном кегле сливается в шум. */
    const configs = this._a11y ? LAYERS.slice(1) : LAYERS;

    configs.forEach((cfg, idx) => {
      const rng = makeRng(0xF11E8521 + idx * 7919);
      const size = short * cfg.size / density;
      const stream = [];
      for (let r = 0; r < Math.max(1, Math.round(cfg.repeats * density)); r++) {
        const shuffled = this._forms.slice().sort(() => rng() - 0.5);
        for (const f of shuffled) stream.push(f.w);
      }
      const text = stream.join("   ·   ");
      /* pretext берёт ОДИН шрифт на абзац, а канвас разрешает подмену
       * по глифам на отрисовке — поэтому меряем брендовым стеком, а не
       * стеком конкретной письменности. */
      const font = `${cfg.weight} ${size}px ${famWord("Latn")}`;
      this._layers.push({
        ...cfg, size, font, text,
        prepared: prepareWithSegments(text, font),
        lineHeightPx: size * cfg.lineHeight,
      });
    });
  },

  /* ── кадр ───────────────────────────────────────────────────────── */

  _frame() {
    if (!this._ctx2d || !this._root) return;
    if (pollSize(this, this._canvas)) { this._size(); this._build(); }
    if (!this._W) return;

    const now = performance.now();
    const t = (now - this._t0) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, t - this._prev));
    this._prev = t;

    this._spring(dt);
    this._applyDrift(dt);

    const ctx = this._ctx2d;
    ctx.clearRect(0, 0, this._W, this._H);

    const boxes = this._obstacles();
    for (let i = this._layers.length - 1; i >= 0; i--) this._drawLayer(i, boxes);

    this._hits = [];
    for (const h of this._heroes) this._drawHero(h);
  },

  _applyDrift(dt) {
    const k = (this._cfg.drift ?? 1) * (this._standby ? 1.6 : 1);
    if (!this._world.width || !k) return;
    this._drift.t += dt;
    const vx = (Math.sin(this._drift.t * 0.11) * 9 + Math.sin(this._drift.t * 0.063 + 1.4) * 6) * k;
    const vy = (Math.cos(this._drift.t * 0.087) * 7 + Math.sin(this._drift.t * 0.051 + 2.3) * 5) * k;
    const W = this._world.width, H = this._world.height;
    this._drift.x = (((this._drift.x + vx * dt) % W) + W) % W;
    this._drift.y = (((this._drift.y + vy * dt) % H) + H) % H;
  },

  _spring(dt) {
    const p = this._push;
    if (!p.on) {
      p.r *= Math.pow(0.86, dt * 60);
      if (p.r < 1) p.r = 0;
      return;
    }
    const ax = (p.stiffness * (p.tx - p.x) - p.damping * p.vx) / p.mass;
    const ay = (p.stiffness * (p.ty - p.y) - p.damping * p.vy) / p.mass;
    p.vx += ax * dt; p.vy += ay * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const target = Math.min(this._W, this._H) * 0.085 * (this._cfg.push ?? 1);
    p.r += (target - p.r) * Math.min(1, dt * 6);
  },

  /* Каждый герой может быть виден в нескольких местах сразу: мир шире экрана
   * и заворачивается, у кромки нужны обе копии — уходящая и входящая. */
  _occurrences(hero) {
    const W = this._world.width, H = this._world.height;
    if (!W || !H) return [];
    const bx = ((hero.x - this._drift.x) % W + W) % W;
    const by = ((hero.y - this._drift.y) % H + H) % H;
    const out = [];
    for (let i = 0; i < 4; i++) {
      const x = bx + ((i & 1) ? -W : 0), y = by + ((i & 2) ? -H : 0);
      if (x + hero.padW / 2 < 0 || x - hero.padW / 2 > this._W) continue;
      if (y + hero.padH / 2 < 0 || y - hero.padH / 2 > this._H) continue;
      out.push({ x, y });
    }
    return out;
  },

  _obstacles() {
    const list = [];
    for (const h of this._heroes) {
      for (const o of this._occurrences(h)) {
        const box = rotatedAabb(o.x, o.y, h.padW, h.padH, h.angle);
        box.soft = 0;
        list.push(box);
      }
    }
    const p = this._push;
    if (p.on && p.r > 0) {
      list.push({ x0: p.x - p.r, y0: p.y - p.r, x1: p.x + p.r, y1: p.y + p.r, soft: 0 });
    }
    return list;
  },

  /* Свободные отрезки строки на высоте y: всё, что не занято препятствиями. */
  _segmentsAt(y, lineH, boxes) {
    const blocks = [];
    for (const b of boxes) {
      if (b.y1 < y || b.y0 > y + lineH) continue;
      let x0 = b.x0, x1 = b.x1;
      if (b.soft > 0) {
        const inset = (x1 - x0) * b.soft * 0.5;
        x0 += inset; x1 -= inset;
      }
      blocks.push([Math.max(0, x0), Math.min(this._W, x1)]);
    }
    blocks.sort((a, b) => a[0] - b[0]);

    const segs = [];
    let cursor = 0;
    for (const [x0, x1] of blocks) {
      if (x0 > cursor) segs.push({ x0: cursor, x1: Math.min(x0, this._W) });
      cursor = Math.max(cursor, x1);
    }
    if (cursor < this._W) segs.push({ x0: cursor, x1: this._W });
    return segs.filter((s) => s.x1 - s.x0 > 14);   // огрызки не набираем
  },

  _drawLayer(idx, boxes) {
    const layer = this._layers[idx];
    const ctx = this._ctx2d;
    ctx.save();
    ctx.font = layer.font;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = layer.tone === "brass" ? PAL.brass : PAL.paper;
    ctx.globalAlpha = layer.alpha;
    ctx.shadowColor = "rgba(0,0,0,.4)";
    ctx.shadowBlur = 4;

    const soft = SOFTNESS[idx] || { prob: 0, max: 0 };
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };
    let y = layer.lineHeightPx;
    const top0 = layer.lineHeightPx * 0.85, bot0 = layer.lineHeightPx * 0.15;

    while (y < this._H + layer.lineHeightPx) {
      const lineTop = y - top0, lineBot = y + bot0;
      const segs = this._segmentsAt(lineTop, lineBot - lineTop, boxes);
      if (!segs.length) { y += layer.lineHeightPx; continue; }

      let advanced = false;
      for (const seg of segs) {
        const segW = seg.x1 - seg.x0 - 6;
        if (segW <= 0) continue;
        let range = layoutNextLineRange(layer.prepared, cursor, segW);
        if (range === null) {
          cursor = { segmentIndex: 0, graphemeIndex: 0 };   // поток по кругу
          range = layoutNextLineRange(layer.prepared, cursor, segW);
          if (range === null) break;
        }
        const line = materializeLineRange(layer.prepared, range);
        const x = seg.x0 + 3;
        ctx.fillText(line.text, x, y);
        cursor = range.end;
        advanced = true;

        const w = Math.min(line.width || segW, segW);
        const r = hash01(idx, Math.floor(y), Math.floor(x));
        const s = r < soft.prob ? soft.max * (0.4 + r / soft.prob * 0.6) : 0;
        boxes.push({ x0: x - 2, y0: lineTop, x1: x + w + 2, y1: lineBot, soft: s });
      }
      if (!advanced) break;
      y += layer.lineHeightPx;
    }
    ctx.restore();
  },

  _drawHero(hero) {
    for (const o of this._occurrences(hero)) {
      const ctx = this._ctx2d;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(hero.angle);
      ctx.font = `${hero.weight} ${hero.size}px ${famBig(hero.item.sc)}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,.55)";
      ctx.shadowBlur = hero.tier === 0 ? 28 : hero.tier === 1 ? 16 : 8;
      ctx.fillStyle = hero.tone === "red" ? PAL.red
        : hero.tone === "brass" ? PAL.brass : PAL.paper;
      ctx.globalAlpha = hero.tier === 0 ? 0.96 : hero.tier === 1 ? 0.92 : 0.82;
      ctx.fillText(hero.item.w, 0, 0);

      const w = ctx.measureText(hero.item.w).width;
      /* Тапаем только героев: мелкий набор режется по строкам, точной рамки
       * у слова там нет, и попадание было бы случайным. */
      this._hits.push({ x: o.x, y: o.y, w, h: hero.size, item: hero.item });

      if (hero.tone !== "paper") {
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = PAL.brass;
        ctx.strokeText(hero.item.w, 0, 0);
      }
      ctx.restore();
    }
  },

  /* ── ввод ───────────────────────────────────────────────────────── */

  _bind() {
    const cv = this._canvas;
    const T = { x: 0, y: 0, t: 0, moved: false };
    this._h = {
      move: (e) => {
        const r = cv.getBoundingClientRect();
        const p = this._push;
        p.tx = e.clientX - r.left; p.ty = e.clientY - r.top;
        if (!p.on) { p.on = true; p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; }
        if (Math.hypot(e.clientX - T.x, e.clientY - T.y) > 10) T.moved = true;
      },
      leave: () => { this._push.on = false; },
      down: (e) => { T.x = e.clientX; T.y = e.clientY; T.t = performance.now(); T.moved = false; this._h.move(e); },
      up: (e) => {
        if (T.moved || performance.now() - T.t > 500) return;
        const r = cv.getBoundingClientRect();
        const hit = this._pick(e.clientX - r.left, e.clientY - r.top);
        if (hit) this._card.open(hit.item); else this._card.close();
      },
    };
    cv.addEventListener("pointermove", this._h.move, { passive: true });
    cv.addEventListener("pointerleave", this._h.leave);
    cv.addEventListener("pointerdown", this._h.down);
    cv.addEventListener("pointerup", this._h.up);
  },

  _unbind() {
    if (!this._h || !this._canvas) { this._h = null; return; }
    const cv = this._canvas;
    cv.removeEventListener("pointermove", this._h.move);
    cv.removeEventListener("pointerleave", this._h.leave);
    cv.removeEventListener("pointerdown", this._h.down);
    cv.removeEventListener("pointerup", this._h.up);
    this._h = null;
  },

  _pick(x, y) {
    let best = null, bd = Infinity;
    for (let i = this._hits.length - 1; i >= 0; i--) {
      const h = this._hits[i];
      const dx = Math.abs(x - h.x), dy = Math.abs(y - h.y);
      if (dx > h.w * 0.5 + 12 || dy > h.h * 0.5 + 12) continue;
      const d = dx + dy;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  },
};
