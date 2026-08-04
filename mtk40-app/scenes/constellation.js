/* Сцена «Созвездие влияний» — порт прототипа mtk40-constellation.
 *
 * Все 15 связей корпуса идут строго в одну сторону: ЧИТАЛ → ИМ. Граф
 * двудольный, поэтому это не облако узлов, а две колонки с лентами между
 * ними: слева прочитанное, справа написанное, лента — тип влияния.
 *
 * Связи покрывают 25 книг из 99. Остальные 74 не спрятаны, а лежат полосой
 * внизу — иначе сцена врала бы о размере корпуса; полоса кликабельна.
 */
import { M, DESIGN_W, createCanvas, corpusOf, createCard, unit } from "./shared.js?v=21";

const COL_L = 0.235;   // доли ширины кадра
const COL_R = 0.765;
const NODE_H_MAX = 40; // дизайн-px

export const constellationScene = {
  id: "constellation",
  title: { ru: "Созвездие", en: "Constellation", zh: "影响星座" },
  keepAlive: true,

  preload: {
    data: { corpus: "../data/mtk40.json" },
    /* Вес указан явно: "1em '20 Kopeek'" грузит только 400, а на канве
     * половина подписей — 600. Канва загрузку шрифта не запускает вовсе
     * (ctx.font молча берёт то, что уже загружено), поэтому жирное
     * начертание надо просить прероллом. */
    fonts: ["1em 'Nolde'", "400 1em '20 Kopeek'", "600 1em '20 Kopeek'"],
  },

  settings: [
    { key: "nodeWidth", type: "range", min: 160, max: 360, step: 10, unit: " px", default: 250,
      label: { ru: "Ширина плашки книги", en: "Book plate width", zh: "书条宽度" } },
    { key: "glow", type: "toggle", default: true,
      label: { ru: "Свечение лент", en: "Ribbon glow", zh: "连线发光" } },
    { key: "showStrip", type: "toggle", default: true,
      label: { ru: "Полоса «остальной корпус»", en: "«Rest of corpus» strip", zh: "其余书目条" } },
  ],

  mount(el, ctx) {
    this.app = ctx.app;
    this.corpus = corpusOf(ctx.data.corpus);
    this.values = { nodeWidth: 250, glow: true, showStrip: true };
    this.selectedId = null;
    this.nodes = [];
    this.strip = [];

    el.classList.add("m40-scene");
    this.root = el;

    const linked = new Set();
    for (const c of this.corpus.connections) { linked.add(c.from); linked.add(c.to); }
    const byYear = (a, b) => a.year_first - b.year_first;
    this.left = this.corpus.items.filter((i) => linked.has(i.id) && i.bucket === "in-library").sort(byYear);
    this.right = this.corpus.items.filter((i) => linked.has(i.id) && i.bucket === "by-lenin").sort(byYear);
    this.rest = this.corpus.items.filter((i) => !linked.has(i.id)).sort(byYear);

    this.cv = createCanvas(el, {
      onSize: () => this.layout(),
      onFrame: () => this.render(),
    });
    this.card = createCard(el, this.corpus, this.app);
    this.card.onClose = () => { this.selectedId = null; };

    this.legendEl = document.createElement("div");
    this.legendEl.className = "m40-legend";
    el.appendChild(this.legendEl);

    this.cv.canvas.addEventListener("pointerdown", this.onTap);

    this.paintLegend();
    this.cv.observe();
    this.cv.sync();
  },

  unmount() {
    if (this.cv) {
      this.cv.canvas.removeEventListener("pointerdown", this.onTap);
      this.cv.destroy();
    }
    if (this.card) this.card.el.remove();
    if (this.legendEl) this.legendEl.remove();
    this.cv = this.card = this.legendEl = null;
    this.root.classList.remove("m40-scene");
  },

  pause() { if (this.cv) this.cv.stop(); },
  resume() { if (this.cv) this.cv.start(); },

  reset() {
    this.selectedId = null;
    if (this.card) this.card.hide();
  },

  setLang() {
    if (this.card) this.card.setLang();
    this.paintLegend();
  },

  setA11y() { this.layout(); },

  applySettings(v) { this.values = v; this.layout(); },

  healthcheck() {
    /* Несмонтированная сцена — не авария, а её штатное состояние до
     * первого показа (конвенция МТК 41). ok:false здесь давал стенду
     * ложные аварии по всем сценам, кроме активной. */
    if (!this.cv) return { ok: true, detail: "не смонтирована" };
    if (!this.corpus.connections.length) return { ok: false, detail: "связей в данных нет" };
    const orphan = this.corpus.connections.filter((c) =>
      !this.left.some((i) => i.id === c.from) || !this.right.some((i) => i.id === c.to)).length;
    if (orphan) return { ok: false, detail: "связей без конца в колонках: " + orphan };
    if (!this.cv.w) return { ok: true, detail: "слой скрыт; лент " + this.corpus.connections.length };
    if (!this.nodes.length) return { ok: false, detail: "колонки пусты" };
    return {
      ok: true,
      detail: "плашек " + this.nodes.length + ", лент " + this.corpus.connections.length +
        ", в полосе " + this.strip.length,
    };
  },

  // ---------- обвязка ----------
  get s() { return unit(this.app, this.cv ? this.cv.w : DESIGN_W); },

  paintLegend() {
    if (!this.legendEl) return;
    this.legendEl.innerHTML = "";
    const used = new Set(this.corpus.connections.map((c) => c.type));
    for (const t of used) {
      const st = M.CONN_STYLE[t];
      if (!st) continue;
      const row = document.createElement("span");
      row.className = "m40-legend__row";
      const sw = document.createElement("span");
      sw.className = "m40-legend__sw";
      sw.style.borderTopColor = st.color;
      sw.style.borderTopStyle = st.dash.length ? "dashed" : "solid";
      const label = document.createElement("span");
      label.textContent = this.app.t("conn." + t);
      row.append(sw, label);
      this.legendEl.appendChild(row);
    }
  },

  // ---------- раскладка ----------
  layout() {
    if (!this.cv || !this.cv.w) return;
    const s = this.s;
    const W = this.cv.w, H = this.cv.h;
    const legendH = this.legendEl ? this.legendEl.getBoundingClientRect().height : 0;

    /* Низ кадра занят полосой «остальной корпус» и легендой; всё, что выше —
     * колонкам. Меряем легенду, а не держим константу: её высота зависит от
     * языка и режима слабовидящих. */
    this.stripY = H - legendH - 22 * s;
    this.stripLabelY = this.stripY - 24 * s;
    const top = 96 * s;
    const bottom = (this.values.showStrip === false ? H - legendH - 12 * s : this.stripLabelY - 24 * s);
    const usable = Math.max(1, bottom - top);
    const nodeW = (this.values.nodeWidth || 250) * s;

    this.nodes = [];
    const place = (list, cx) => {
      const pitch = Math.min(NODE_H_MAX * s, usable / Math.max(1, list.length));
      const h = pitch * 0.9;
      /* Колонку центрируем по вертикали: колонки разной длины (15 и 10),
       * прижатые к верху, читались бы как рассогласованные. */
      const start = top + (usable - pitch * list.length) / 2 + pitch / 2;
      list.forEach((item, i) => {
        this.nodes.push({ item, cx, cy: start + i * pitch, w: nodeW, h });
      });
    };
    place(this.left, W * COL_L);
    place(this.right, W * COL_R);

    const stripL = 0, stripR = W;
    const step = (stripR - stripL) / Math.max(1, this.rest.length);
    this.strip = this.rest.map((item, i) => ({
      item, cx: stripL + step * (i + 0.5), cy: this.stripY, r: Math.min(6 * s, step * 0.34),
    }));
  },

  nodeOf(id) { return this.nodes.find((n) => n.item.id === id) || null; },

  onTap: function (ev) {
    const x = ev.offsetX, y = ev.offsetY;
    for (const n of this.nodes) {
      if (Math.abs(x - n.cx) <= n.w / 2 && Math.abs(y - n.cy) <= n.h / 2) {
        this.selectedId = n.item.id;
        this.card.show(n.item);
        return;
      }
    }
    if (this.values.showStrip !== false) {
      for (const d of this.strip) {
        if (Math.hypot(x - d.cx, y - d.cy) <= Math.max(d.r + 8 * this.s, 18 * this.s)) {
          this.selectedId = d.item.id;
          this.card.show(d.item);
          return;
        }
      }
    }
    this.selectedId = null;
    this.card.hide();
  },

  related() {
    const set = new Set();
    if (!this.selectedId) return set;
    set.add(this.selectedId);
    for (const c of this.corpus.connsByItem.get(this.selectedId) || []) {
      set.add(c.from === this.selectedId ? c.to : c.from);
    }
    return set;
  },

  // ---------- кадр ----------
  render() {
    const ctx = this.cv.ctx;
    ctx.clearRect(0, 0, this.cv.w, this.cv.h);
    if (!this.nodes.length) return;
    const rel = this.related();
    const focus = this.selectedId != null;

    this.drawColumnHeads();
    /* Ленты — под узлами. */
    for (const c of this.corpus.connections) {
      const a = this.nodeOf(c.from);
      const b = this.nodeOf(c.to);
      if (!a || !b) continue;
      this.drawRibbon(a, b, c, focus && !(rel.has(c.from) && rel.has(c.to)));
    }
    for (const n of this.nodes) this.drawNode(n, focus && !rel.has(n.item.id));
    if (this.values.showStrip !== false) this.drawStrip(focus);
  },

  drawColumnHeads() {
    const ctx = this.cv.ctx;
    const s = this.s;
    const W = this.cv.w;
    const y = 34 * s;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [cx, key, n] of [
      [W * COL_L, "in-library", this.left.length],
      [W * COL_R, "by-lenin", this.right.length],
    ]) {
      const meta = M.BUCKET_META[key];
      ctx.fillStyle = meta.accent;
      ctx.font = `600 ${17 * s}px "20 Kopeek", monospace`;
      ctx.fillText(`${this.app.t("bucket." + key)} · ${n}`, cx, y);
      ctx.fillStyle = M.rgba(M.COLORS.paper, 0.45);
      ctx.font = `400 ${11 * s}px "20 Kopeek", monospace`;
      ctx.fillText(this.app.t("bucket." + key + ".note").toUpperCase(), cx, y + 20 * s);
    }
    /* Стрелка направления между колонками: весь смысл сцены в том, что связи
     * односторонние. */
    ctx.strokeStyle = M.rgba(M.COLORS.brass, 0.4);
    ctx.lineWidth = 1 * s;
    const mid = W / 2;
    ctx.beginPath();
    ctx.moveTo(mid - 26 * s, y);
    ctx.lineTo(mid + 22 * s, y);
    ctx.stroke();
    ctx.fillStyle = M.rgba(M.COLORS.brass, 0.55);
    ctx.beginPath();
    ctx.moveTo(mid + 28 * s, y);
    ctx.lineTo(mid + 20 * s, y - 5 * s);
    ctx.lineTo(mid + 20 * s, y + 5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  drawRibbon(a, b, conn, dim) {
    const ctx = this.cv.ctx;
    const s = this.s;
    const st = M.CONN_STYLE[conn.type] || M.CONN_STYLE.source;
    const x1 = a.cx + a.w / 2;
    const x2 = b.cx - b.w / 2;
    const bow = (x2 - x1) * 0.45;

    ctx.save();
    ctx.globalAlpha = dim ? 0.1 : 0.9;
    ctx.strokeStyle = st.color;
    ctx.lineWidth = st.width * s;
    ctx.setLineDash(st.dash.map((d) => d * s));
    if (!dim && this.values.glow !== false) { ctx.shadowColor = st.color; ctx.shadowBlur = 7 * s; }
    ctx.beginPath();
    ctx.moveTo(x1, a.cy);
    ctx.bezierCurveTo(x1 + bow, a.cy, x2 - bow, b.cy, x2, b.cy);
    ctx.stroke();
    ctx.restore();

    /* Подпись типа — только у выделенной нити, иначе середина зарастает. */
    if (!dim && this.selectedId) {
      const mx = (x1 + x2) / 2;
      const my = (a.cy + b.cy) / 2;
      const fs = 11 * s;
      ctx.save();
      ctx.font = `600 ${fs}px "20 Kopeek", monospace`;
      const text = this.app.t("conn." + conn.type).toUpperCase();
      const w = ctx.measureText(text).width;
      ctx.fillStyle = M.rgba(M.COLORS.ink, 0.88);
      ctx.fillRect(mx - w / 2 - 7 * s, my - fs * 0.85, w + 14 * s, fs * 1.7);
      ctx.fillStyle = st.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, mx, my);
      ctx.restore();
    }
  },

  drawNode(n, dim) {
    const ctx = this.cv.ctx;
    const s = this.s;
    const { item } = n;
    const x = n.cx - n.w / 2;
    const y = n.cy - n.h / 2;
    const sel = item.id === this.selectedId;

    ctx.save();
    ctx.globalAlpha = dim ? 0.2 : 1;
    ctx.fillStyle = M.rgba(M.COLORS.ink, 0.72);
    ctx.fillRect(x, y, n.w, n.h);
    ctx.fillStyle = item.cover_color;
    ctx.fillRect(x, y, 5 * s, n.h);
    ctx.strokeStyle = sel ? M.COLORS.brass : M.rgba(M.COLORS.paper, 0.16);
    ctx.lineWidth = (sel ? 2 : 1) * s;
    ctx.strokeRect(x, y, n.w, n.h);

    const padL = 12 * s;
    const textW = n.w - padL - 52 * s;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = sel ? M.COLORS.brass : M.rgba(M.COLORS.paper, 0.92);
    ctx.font = `400 ${13 * s}px Nolde, Georgia, serif`;
    ctx.fillText(M.wrapLines(ctx, item.title, textW, 1)[0] || "", x + padL, n.cy - 6 * s);
    ctx.fillStyle = M.rgba(M.COLORS.paper, 0.5);
    ctx.font = `400 ${9.5 * s}px "20 Kopeek", monospace`;
    ctx.fillText(M.wrapLines(ctx, item.author || "", textW, 1)[0] || "", x + padL, n.cy + 8 * s);
    ctx.textAlign = "right";
    ctx.fillStyle = M.rgba(M.COLORS.brass, 0.75);
    ctx.font = `400 ${11 * s}px "20 Kopeek", monospace`;
    ctx.fillText(String(item.year_first), x + n.w - 10 * s, n.cy);
    ctx.restore();
  },

  drawStrip(focus) {
    const ctx = this.cv.ctx;
    const s = this.s;
    ctx.save();
    ctx.fillStyle = M.rgba(M.COLORS.paper, 0.34);
    ctx.font = `400 ${11 * s}px "20 Kopeek", monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(this.app.t("constellation.rest", { n: this.rest.length }).toUpperCase(),
      0, this.stripLabelY);
    for (const d of this.strip) {
      const sel = d.item.id === this.selectedId;
      ctx.globalAlpha = focus && !sel ? 0.28 : 0.75;
      ctx.beginPath();
      ctx.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
      ctx.fillStyle = d.item.cover_color;
      ctx.fill();
      if (sel) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = M.COLORS.brass;
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.arc(d.cx, d.cy, d.r + 4 * s, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};

constellationScene.onTap = constellationScene.onTap.bind(constellationScene);
