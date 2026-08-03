/* Сцена «Полка» — порт прототипа mtk40-shelf.
 *
 * Три полки: им · о нём · читал. Корешки по году, ширина ~ объёму, высота ~
 * формату. Драг по горизонтали независимо на каждой полке, инерция,
 * пружина на краях. Под полкой — дорожка с бегунком: о том, что полка
 * длиннее экрана, иначе ничего не говорит.
 */
import { M, DESIGN_W, createCanvas, corpusOf, createCard, unit } from "./shared.js?v=10";

const BUCKET_ORDER = ["by-lenin", "about-lenin", "in-library"];

function spineWidth(item) {
  const p = Math.max(8, item.pages_approx || 80);
  return Math.max(22, Math.min(110, 14 + Math.log2(p) * 7));
}

export const shelfScene = {
  id: "shelf",
  title: { ru: "Полка", en: "Shelf", zh: "书架" },
  keepAlive: true,

  preload: {
    data: { corpus: "../data/mtk40.json" },
    fonts: ["1em 'Nolde'", "1em '20 Kopeek'"],
  },

  settings: [
    { key: "spineGap", label: { ru: "Зазор между корешками", en: "Gap between spines" },
      type: "range", min: 0, max: 10, step: 1, unit: " px", default: 2 },
    { key: "titles", label: { ru: "Названия на корешках", en: "Titles on spines" },
      type: "toggle", default: true },
    { key: "scrollbar", label: { ru: "Дорожка прокрутки", en: "Scroll track" },
      type: "toggle", default: true },
  ],

  mount(el, ctx) {
    this.ctx = ctx;
    this.app = ctx.app;
    this.corpus = corpusOf(ctx.data.corpus);
    this.values = { spineGap: 2, titles: true, scrollbar: true };
    this.activeId = null;
    this.dragging = null;

    el.classList.add("m40-scene");
    this.root = el;

    this.shelves = BUCKET_ORDER.map((b) => ({
      bucket: b,
      items: this.corpus.items.filter((i) => i.bucket === b)
        .sort((a, c) => (a.year_first || 0) - (c.year_first || 0)),
      scrollX: 0, velocityX: 0, spineRects: [], totalWidth: 0,
    }));

    this.cv = createCanvas(el, {
      onSize: () => this.layout(),
      onFrame: () => this.frame(),
    });
    this.card = createCard(el, this.corpus, this.app);
    this.card.onClose = () => { this.activeId = null; };

    const c = this.cv.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("pointerleave", this.onUp);

    this.setLang(ctx.lang);
    this.cv.observe();
    this.cv.sync();
  },

  unmount() {
    const c = this.cv && this.cv.canvas;
    if (c) {
      c.removeEventListener("pointerdown", this.onDown);
      c.removeEventListener("pointermove", this.onMove);
      c.removeEventListener("pointerup", this.onUp);
      c.removeEventListener("pointercancel", this.onUp);
      c.removeEventListener("pointerleave", this.onUp);
    }
    if (this.cv) this.cv.destroy();
    if (this.card) this.card.el.remove();
    this.cv = this.card = null;
    this.root.classList.remove("m40-scene");
  },

  pause() { if (this.cv) this.cv.stop(); },
  resume() { if (this.cv) this.cv.start(); },

  reset() {
    for (const s of this.shelves) { s.scrollX = 0; s.velocityX = 0; }
    this.activeId = null;
    if (this.card) this.card.hide();
  },

  setLang() {
    /* Подпись о жесте несёт сама дорожка прокрутки на канве — отдельной
     * строки-подсказки у этой сцены нет. */
    if (this.card) this.card.setLang();
  },

  setA11y() { this.layout(); },

  applySettings(v) {
    this.values = v;
    this.layout();
  },

  /* Признак живого содержимого: корпус разошёлся по трём полкам и раскладка
   * посчитала корешки. Структурные проверки этого не видят — канва на месте
   * и при пустом корпусе. */
  healthcheck() {
    if (!this.cv) return { ok: false, detail: "сцена не смонтирована" };
    const empty = this.shelves.filter((s) => !s.items.length).map((s) => s.bucket);
    if (empty.length) return { ok: false, detail: "пустые полки: " + empty.join(", ") };
    /* Скрытый слой — не «пусто»: раскладка считается от ширины канвы, а у
     * неактивной сцены она нулевая. Состав полок при этом проверен выше. */
    if (!this.cv.w) {
      const n0 = this.shelves.reduce((a, s) => a + s.items.length, 0);
      return { ok: true, detail: "слой скрыт, раскладки ещё не было; книг " + n0 };
    }
    if (!this.shelves.some((s) => s.spineRects.length)) {
      return { ok: false, detail: "раскладка не посчитана — корешков нет" };
    }
    const n = this.shelves.reduce((a, s) => a + s.items.length, 0);
    return { ok: true, detail: "корешков " + n + " на трёх полках" };
  },

  // ---------- раскладка ----------
  get s() { return unit(this.app, this.cv ? this.cv.w : DESIGN_W); },

  titleArea() { return 148 * this.s; },
  shelfHeight() { return (this.cv.h - this.titleArea()) / 3; },

  layout() {
    if (!this.cv || !this.cv.w) return;
    const s = this.s;
    const baseH = this.shelfHeight();
    const maxSpineH = baseH * 0.78;
    const gap = (this.values.spineGap ?? 2) * s;
    for (const shelf of this.shelves) {
      let x = 0;
      shelf.spineRects = [];
      for (const item of shelf.items) {
        const w = spineWidth(item) * s;
        const hRatio = (item.height_cm || 22) / 22;
        shelf.spineRects.push({ item, x, w, h: maxSpineH * Math.max(0.66, Math.min(1.18, hRatio)) });
        x += w + gap;
      }
      shelf.totalWidth = x;
    }
  },

  // ---------- ввод ----------
  onDown: function (ev) {
    ev.preventDefault();
    const idx = this.shelfIndexAtY(ev.offsetY);
    if (idx < 0) return;
    try { this.cv.canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    this.dragging = { idx, startX: ev.offsetX, lastX: ev.offsetX, lastT: performance.now(), lastVx: 0, moved: false };
    this.shelves[idx].velocityX = 0;
  },
  onMove: function (ev) {
    if (!this.dragging) return;
    const now = performance.now();
    const dx = ev.offsetX - this.dragging.lastX;
    const dt = Math.max(1, now - this.dragging.lastT);
    this.shelves[this.dragging.idx].scrollX -= dx;
    this.dragging.lastX = ev.offsetX;
    this.dragging.lastT = now;
    this.dragging.lastVx = -dx / dt;
    if (Math.abs(ev.offsetX - this.dragging.startX) > 6 * this.s) this.dragging.moved = true;
  },
  onUp: function (ev) {
    if (!this.dragging) return;
    if (!this.dragging.moved) {
      const hit = this.hitTest(ev.offsetX, ev.offsetY);
      if (hit) { this.activeId = hit.item.id; this.card.show(hit.item); }
      else { this.activeId = null; this.card.hide(); }
    } else {
      this.shelves[this.dragging.idx].velocityX = (this.dragging.lastVx || 0) * 16;
    }
    this.dragging = null;
  },

  shelfIndexAtY(y) {
    const top = this.titleArea();
    if (y < top) return -1;
    const idx = Math.floor((y - top) / this.shelfHeight());
    return idx >= 0 && idx <= 2 ? idx : -1;
  },

  hitTest(px, py) {
    const idx = this.shelfIndexAtY(py);
    if (idx < 0) return null;
    const s = this.s;
    const shelf = this.shelves[idx];
    const top = this.titleArea() + idx * this.shelfHeight();
    const baseline = top + this.shelfHeight() - 36 * s;
    const offsetX = 100 * s;
    for (const rect of shelf.spineRects) {
      const x = rect.x - shelf.scrollX + offsetX;
      if (px >= x && px <= x + rect.w && py >= baseline - rect.h && py <= baseline) return rect;
    }
    return null;
  },

  // ---------- кадр ----------
  frame() {
    const s = this.s;
    for (const shelf of this.shelves) {
      if (Math.abs(shelf.velocityX) > 0.05) {
        shelf.scrollX += shelf.velocityX;
        shelf.velocityX *= 0.94;
      } else shelf.velocityX = 0;
      const offsetX = 100 * s;
      const maxScroll = Math.max(0, shelf.totalWidth + offsetX + 60 * s - this.cv.w);
      if (shelf.scrollX < -40 * s) {
        shelf.scrollX += (-40 * s - shelf.scrollX) * 0.18;
        shelf.velocityX *= 0.78;
      } else if (shelf.scrollX > maxScroll + 40 * s) {
        shelf.scrollX += (maxScroll + 40 * s - shelf.scrollX) * 0.18;
        shelf.velocityX *= 0.78;
      }
    }
    this.render();
  },

  render() {
    const ctx = this.cv.ctx;
    ctx.clearRect(0, 0, this.cv.w, this.cv.h);
    if (!this.shelves[0].spineRects.length) this.layout();
    const top = this.titleArea();
    const h = this.shelfHeight();
    for (let i = 0; i < this.shelves.length; i++) this.renderShelf(this.shelves[i], top + i * h, h);
  },

  renderShelf(shelf, top, height) {
    const ctx = this.cv.ctx;
    const s = this.s;
    const W = this.cv.w;
    const baseline = top + height - 36 * s;
    const offsetX = 100 * s;
    const meta = M.BUCKET_META[shelf.bucket];

    ctx.fillStyle = "rgba(210,183,115,0.45)";
    ctx.fillRect(0, baseline + 1, W, 4 * s);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, baseline + 5 * s, W, 14 * s);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, baseline + 19 * s, W, 6 * s);

    ctx.save();
    ctx.fillStyle = meta.accent;
    ctx.font = `600 ${15 * s}px "20 Kopeek", monospace`;
    ctx.textBaseline = "top";
    ctx.fillText(this.app.t("bucket." + shelf.bucket), 26 * s, top + 16 * s);
    ctx.fillStyle = "rgba(247,249,239,0.55)";
    ctx.font = `400 ${10 * s}px "20 Kopeek", monospace`;
    ctx.fillText(this.app.t("bucket." + shelf.bucket + ".note").toUpperCase(), 26 * s, top + 38 * s);
    ctx.fillStyle = "rgba(247,249,239,0.5)";
    ctx.textAlign = "right";
    ctx.fillText(this.app.t("units.items", { n: shelf.items.length }), W - 26 * s, top + 16 * s);
    ctx.textAlign = "left";
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX - 4 * s, top + 60 * s, W - offsetX, baseline - top - 56 * s);
    ctx.clip();
    for (const rect of shelf.spineRects) {
      const x = rect.x - shelf.scrollX + offsetX;
      if (x + rect.w < offsetX - 8 * s || x > W + 8 * s) continue;
      this.renderSpine(rect, x, baseline);
    }
    ctx.restore();

    const fadeW = 24 * s;
    const grL = ctx.createLinearGradient(offsetX, 0, offsetX + fadeW, 0);
    grL.addColorStop(0, "rgba(12,16,18,0.85)");
    grL.addColorStop(1, "rgba(12,16,18,0)");
    ctx.fillStyle = grL;
    ctx.fillRect(offsetX - 4 * s, top + 60 * s, fadeW + 4 * s, baseline - top - 60 * s);
    const grR = ctx.createLinearGradient(W - fadeW, 0, W, 0);
    grR.addColorStop(0, "rgba(12,16,18,0)");
    grR.addColorStop(1, "rgba(12,16,18,0.85)");
    ctx.fillStyle = grR;
    ctx.fillRect(W - fadeW, top + 60 * s, fadeW, baseline - top - 60 * s);

    if (this.values.scrollbar !== false) this.renderScrollbar(shelf, baseline, offsetX);
  },

  renderScrollbar(shelf, baseline, offsetX) {
    const ctx = this.cv.ctx;
    const s = this.s;
    const W = this.cv.w;
    const trackR = W - 96 * s;
    const trackW = trackR - offsetX;
    const total = shelf.totalWidth + offsetX + 60 * s;
    if (total <= W + 1) return;

    const y = baseline + 18 * s;
    ctx.save();
    ctx.fillStyle = "rgba(247,249,239,0.10)";
    ctx.fillRect(offsetX, y, trackW, 2 * s);
    const maxScroll = Math.max(1, total - W);
    const thumbW = Math.max(28 * s, trackW * Math.min(1, W / total));
    const t = Math.min(1, Math.max(0, shelf.scrollX / maxScroll));
    ctx.fillStyle = "rgba(210,183,115,0.55)";
    ctx.fillRect(offsetX + (trackW - thumbW) * t, y - 1 * s, thumbW, 4 * s);
    ctx.fillStyle = "rgba(210,183,115,0.55)";
    ctx.font = `400 ${10 * s}px "20 Kopeek", monospace`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillText(this.app.t(t < 0.98 ? "shelf.hint.right" : "shelf.hint.left"), W - 26 * s, y + 1 * s);
    ctx.restore();
  },

  renderSpine({ item, w, h }, x, baselineY) {
    const ctx = this.cv.ctx;
    const s = this.s;
    const y = baselineY - h;

    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(x + 2 * s, y + 4 * s, w, h);
    ctx.fillStyle = item.cover_color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = M.adjustHex(item.cover_color, 28);
    ctx.fillRect(x, y, 2 * s, h);
    ctx.fillStyle = M.adjustHex(item.cover_color, -28);
    ctx.fillRect(x + w - 2 * s, y, 2 * s, h);
    ctx.fillStyle = M.adjustHex(item.cover_color, 18);
    ctx.fillRect(x, y, w, 4 * s);
    ctx.fillStyle = M.adjustHex(item.cover_color, 36);
    ctx.fillRect(x + 4 * s, y + 16 * s, w - 8 * s, 1 * s);
    ctx.fillRect(x + 4 * s, y + h - 22 * s, w - 8 * s, 1 * s);

    // Название меряем, а не считаем символы: кегль зависит от ширины корешка,
    // и посимвольный лимит выпускал текст за корешок.
    if (this.values.titles !== false && w >= 22 * s) {
      ctx.save();
      ctx.translate(x + w / 2, y + h - 26 * s);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = M.adjustHex(item.cover_color, 95);
      const fs = Math.max(8 * s, Math.min(13 * s, w * 0.32));
      ctx.font = `400 ${fs}px Nolde, Georgia, serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const lines = M.wrapLines(ctx, item.title, h - 52 * s, w >= fs * 2.6 ? 2 : 1);
      const step = fs * 1.05;
      const off = -((lines.length - 1) * step) / 2;
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 0, off + i * step);
      ctx.restore();
    }

    if (item.significance === 5) {
      ctx.fillStyle = M.COLORS.brass;
      ctx.fillRect(x + w / 2 - 2 * s, y + h - 10 * s, 4 * s, 4 * s);
    }
    if (this.activeId === item.id) {
      ctx.strokeStyle = M.COLORS.brass;
      ctx.lineWidth = 2 * s;
      ctx.strokeRect(x - 3 * s, y - 3 * s, w + 6 * s, h + 6 * s);
    }
  },
};

/* Обработчики ввода объявлены как свойства объекта-сцены, поэтому их надо
 * привязать к нему: иначе внутри `this` будет канва. */
for (const k of ["onDown", "onMove", "onUp"]) shelfScene[k] = shelfScene[k].bind(shelfScene);
