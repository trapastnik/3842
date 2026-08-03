/* Сцена «Зеркало» — порт прототипа mtk40-mirror.
 *
 * Корпус разложен тремя ярусами: сверху написанное им, посередине узкая
 * полка прочитанного, снизу написанное о нём. Тап по корешку показывает
 * карточку и вытягивает ленты связей через середину кадра — отсюда
 * «зеркало»: верх и низ отражаются друг в друге через то, что он читал.
 */
import { M, DESIGN_W, createCanvas, corpusOf, createCard, unit } from "./shared.js?v=17";

const ORDER = ["by-lenin", "in-library", "about-lenin"];

function spineWidthBase(item) {
  const p = Math.max(8, item.pages_approx || 80);
  return Math.max(20, Math.min(96, 12 + Math.log2(p) * 6));
}

export const mirrorScene = {
  id: "mirror",
  title: { ru: "Зеркало", en: "Mirror", zh: "镜像" },
  keepAlive: true,

  preload: {
    data: { corpus: "../data/mtk40.json" },
    fonts: ["1em 'Nolde'", "1em '20 Kopeek'"],
  },

  settings: [
    { key: "libraryPerRow", type: "range", min: 10, max: 30, step: 1, unit: " шт.", default: 18,
      label: { ru: "Книг в ряду средней полки", en: "Books per middle-shelf row", zh: "中层每行书数" } },
    { key: "sideRows", type: "range", min: 1, max: 4, step: 1, unit: " ряд.", default: 2,
      label: { ru: "Рядов в верхнем и нижнем ярусе", en: "Rows in top and bottom tiers", zh: "上下层行数" } },
    { key: "titles", type: "toggle", default: true,
      label: { ru: "Названия на корешках", en: "Titles on spines", zh: "书脊上的书名" } },
  ],

  mount(el, ctx) {
    this.app = ctx.app;
    this.corpus = corpusOf(ctx.data.corpus);
    this.values = { libraryPerRow: 18, sideRows: 2, titles: true };
    this.activeId = null;
    this.layoutData = null;

    el.classList.add("m40-scene");
    this.root = el;

    this.cv = createCanvas(el, {
      onSize: () => this.computeLayout(),
      onFrame: () => this.render(),
    });
    this.card = createCard(el, this.corpus, this.app);
    this.card.onClose = () => { this.activeId = null; };

    this.cv.canvas.addEventListener("pointerdown", this.onTap);
    this.cv.observe();
    this.cv.sync();
  },

  unmount() {
    if (this.cv) {
      this.cv.canvas.removeEventListener("pointerdown", this.onTap);
      this.cv.destroy();
    }
    if (this.card) this.card.el.remove();
    this.cv = this.card = null;
    this.root.classList.remove("m40-scene");
  },

  pause() { if (this.cv) this.cv.stop(); },
  resume() { if (this.cv) this.cv.start(); },

  reset() {
    this.activeId = null;
    if (this.card) this.card.hide();
  },

  setLang() { if (this.card) this.card.setLang(); },
  setA11y() { this.computeLayout(); },

  applySettings(v) { this.values = v; this.computeLayout(); },

  healthcheck() {
    if (!this.cv) return { ok: false, detail: "сцена не смонтирована" };
    if (!this.corpus.items.length) return { ok: false, detail: "корпус пуст" };
    if (!this.cv.w) return { ok: true, detail: "слой скрыт, раскладки ещё не было" };
    if (!this.layoutData) return { ok: false, detail: "раскладка не посчитана" };
    const placed = ORDER.reduce((a, b) => a + this.layoutData.sections[b].items.length, 0);
    if (placed !== this.corpus.items.length) {
      return { ok: false, detail: "на ярусах " + placed + " из " + this.corpus.items.length };
    }
    return { ok: true, detail: "корешков на трёх ярусах " + placed };
  },

  get s() { return unit(this.app, this.cv ? this.cv.w : DESIGN_W); },

  // ---------- раскладка ----------
  computeLayout() {
    if (!this.cv || !this.cv.w) return;
    const s = this.s;
    const W = this.cv.w, H = this.cv.h;
    const margin = 24 * s;
    const usableH = H - margin * 2;

    /* Пропорции ярусов: 38 / 20 / 38 и зазоры. Середина уже краёв намеренно —
     * прочитанного меньше, и узкая полка держит метафору «зеркала». */
    const share = { "by-lenin": 0.38, "in-library": 0.20, "about-lenin": 0.38 };
    const sections = {};
    const gap = usableH * 0.02;
    let y = margin;
    for (const b of ORDER) {
      sections[b] = { top: y, height: usableH * share[b], items: [] };
      y += usableH * share[b] + gap;
    }

    const sideMargin = 30 * s;
    const usableW = W - 2 * sideMargin;
    const perRow = Math.max(4, this.values.libraryPerRow || 18);
    const sideRows = Math.max(1, this.values.sideRows || 2);

    for (const b of ORDER) {
      const items = this.corpus.items
        .filter((i) => i.bucket === b)
        .sort((a, c) => (a.year_first || 0) - (c.year_first || 0));
      const sec = sections[b];
      const rows = b === "in-library" ? Math.ceil(items.length / perRow) : sideRows;
      const cols = Math.ceil(items.length / Math.max(1, rows));
      const cellW = usableW / cols;
      const cellH = sec.height / Math.max(1, rows);
      Object.assign(sec, { cellW, cellH, rows, cols });

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const row = Math.floor(i / cols);
        const col = i % cols;
        const cx = sideMargin + col * cellW + cellW / 2;
        const baselineY = sec.top + (row + 1) * cellH - 8 * s;
        const w = Math.min(cellW * 0.78, spineWidthBase(item) * s);
        const h = Math.min(cellH * 0.82,
          cellH * 0.65 * Math.max(0.7, Math.min(1.18, (item.height_cm || 22) / 22)));
        sec.items.push({ item, cx, baselineY, w, h });
      }
    }
    this.layoutData = { sections, order: ORDER };
  },

  hitTest(px, py) {
    if (!this.layoutData) return null;
    for (const b of this.layoutData.order) {
      const sec = this.layoutData.sections[b];
      if (py < sec.top || py > sec.top + sec.height) continue;
      for (const slot of sec.items) {
        const x = slot.cx - slot.w / 2;
        const y = slot.baselineY - slot.h;
        if (px >= x && px <= x + slot.w && py >= y && py <= y + slot.h) return slot;
      }
    }
    return null;
  },

  onTap: function (ev) {
    const hit = this.hitTest(ev.offsetX, ev.offsetY);
    if (hit) {
      this.activeId = hit.item.id;
      this.card.show(hit.item);
    } else {
      this.activeId = null;
      this.card.hide();
    }
  },

  findSlot(id) {
    if (!this.layoutData) return null;
    for (const b of this.layoutData.order) {
      for (const slot of this.layoutData.sections[b].items) if (slot.item.id === id) return slot;
    }
    return null;
  },

  // ---------- кадр ----------
  render() {
    const ctx = this.cv.ctx;
    const s = this.s;
    ctx.clearRect(0, 0, this.cv.w, this.cv.h);
    if (!this.layoutData) return;

    for (const b of this.layoutData.order) {
      const sec = this.layoutData.sections[b];
      const meta = M.BUCKET_META[b];
      ctx.save();
      ctx.fillStyle = meta.accent;
      ctx.font = `600 ${15 * s}px "20 Kopeek", monospace`;
      ctx.textBaseline = "top";
      ctx.fillText(this.app.t("bucket." + b), 8 * s, sec.top + 4 * s);
      ctx.fillStyle = "rgba(247,249,239,0.5)";
      ctx.font = `400 ${11 * s}px "20 Kopeek", monospace`;
      ctx.fillText(this.app.t("bucket." + b + ".note").toUpperCase(), 8 * s, sec.top + 24 * s);
      ctx.textAlign = "right";
      ctx.fillText(this.app.t("units.items", { n: sec.items.length }), this.cv.w - 8 * s, sec.top + 4 * s);
      ctx.restore();

      /* Линии полок — по нижней кромке каждого ряда. */
      for (let r = 1; r <= sec.rows; r++) {
        const y = sec.top + r * sec.cellH - 8 * s;
        ctx.fillStyle = "rgba(210,183,115,0.18)";
        ctx.fillRect(10 * s, y, this.cv.w - 20 * s, 1 * s);
      }
    }

    const related = new Set();
    if (this.activeId) {
      related.add(this.activeId);
      for (const c of this.corpus.connsByItem.get(this.activeId) || []) {
        related.add(c.from === this.activeId ? c.to : c.from);
      }
    }
    for (const b of this.layoutData.order) {
      for (const slot of this.layoutData.sections[b].items) {
        this.renderSpine(slot, this.activeId && !related.has(slot.item.id));
      }
    }

    if (this.activeId) {
      const active = this.findSlot(this.activeId);
      for (const c of this.corpus.connsByItem.get(this.activeId) || []) {
        const other = this.findSlot(c.from === this.activeId ? c.to : c.from);
        if (active && other) this.renderConnection(active, other, c);
      }
      if (active) this.renderActiveMarker(active);
    }
  },

  renderSpine(slot, dim) {
    const ctx = this.cv.ctx;
    const s = this.s;
    const { item, cx, baselineY, w, h } = slot;
    const x = cx - w / 2;
    const y = baselineY - h;

    ctx.globalAlpha = dim ? 0.22 : 1;
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fillRect(x + 1 * s, y + 3 * s, w, h);
    ctx.fillStyle = item.cover_color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = M.adjustHex(item.cover_color, 26);
    ctx.fillRect(x, y, 1.5 * s, h);
    ctx.fillStyle = M.adjustHex(item.cover_color, -26);
    ctx.fillRect(x + w - 1.5 * s, y, 1.5 * s, h);
    ctx.fillStyle = M.adjustHex(item.cover_color, 18);
    ctx.fillRect(x, y, w, 3 * s);

    if (this.values.titles !== false && w >= 22 * s) {
      ctx.save();
      ctx.translate(cx, baselineY - 12 * s);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = M.adjustHex(item.cover_color, 95);
      const fs = Math.min(12 * s, w * 0.34);
      ctx.font = `400 ${fs}px Nolde, Georgia, serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      /* Режем по реальной ширине глифов: посимвольный лимит врёт на смеси
       * кириллицы с латиницей и выпускал название за корешок. */
      ctx.fillText(M.wrapLines(ctx, item.title, h - 28 * s, 1)[0] || "", 0, 0);
      ctx.restore();
    }
    if (item.significance === 5) {
      ctx.fillStyle = M.COLORS.brass;
      ctx.fillRect(cx - 2 * s, y + h - 8 * s, 4 * s, 4 * s);
    }
    ctx.globalAlpha = 1;
  },

  renderActiveMarker(slot) {
    const ctx = this.cv.ctx;
    const s = this.s;
    const { cx, baselineY, w, h } = slot;
    const x = cx - w / 2;
    const y = baselineY - h;
    ctx.strokeStyle = M.COLORS.brass;
    ctx.lineWidth = 2 * s;
    ctx.strokeRect(x - 4 * s, y - 4 * s, w + 8 * s, h + 8 * s);
    ctx.fillStyle = M.COLORS.brass;
    ctx.beginPath();
    ctx.arc(cx, baselineY + 4 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
  },

  renderConnection(a, b, conn) {
    const ctx = this.cv.ctx;
    const s = this.s;
    const style = M.CONN_STYLE[conn.type] || M.CONN_STYLE.source;
    const ax = a.cx, ay = a.baselineY - a.h / 2;
    const bx = b.cx, by = b.baselineY - b.h / 2;
    /* Управляющие точки тянутся к середине кадра — там же, где живёт полка
     * «читал», и лента проходит через неё, а не мимо. */
    const midY = this.cv.h / 2;

    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width * s;
    ctx.setLineDash(style.dash.map((d) => d * s));
    ctx.shadowColor = style.color;
    ctx.shadowBlur = 6 * s;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.bezierCurveTo(ax, ay + (midY - ay) * 0.6, bx, by + (midY - by) * 0.6, bx, by);
    ctx.stroke();
    ctx.restore();

    const text = this.app.t("conn." + conn.type).toUpperCase();
    const fs = 11 * s;
    ctx.save();
    ctx.font = `600 ${fs}px "20 Kopeek", monospace`;
    const w = ctx.measureText(text).width;
    const mx = (ax + bx) / 2;
    ctx.fillStyle = "rgba(12,16,18,0.8)";
    ctx.fillRect(mx - w / 2 - 8 * s, midY - fs * 0.85, w + 16 * s, fs * 1.7);
    ctx.fillStyle = style.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, mx, midY);
    ctx.restore();
  },
};

mirrorScene.onTap = mirrorScene.onTap.bind(mirrorScene);
