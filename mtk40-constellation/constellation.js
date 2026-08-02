/**
 * МТК 40 · Созвездие влияний.
 *
 * Все 15 связей корпуса идут строго в одну сторону: ЧИТАЛ → ИМ. Граф
 * двудольный, поэтому это не облако узлов, а две колонки с лентами между
 * ними: слева прочитанное, справа написанное, лента — тип влияния.
 *
 * Связи покрывают 25 книг из 99. Остальные 74 не спрятаны, а лежат
 * полосой внизу — иначе вариант врал бы о размере корпуса; полоса
 * кликабельна, карточка открывается и оттуда.
 */
(function () {
  const M = window.MTK40;

  // Вертикаль тесная: 15 плашек слева должны уместиться между заголовком и
  // нижней полосой, поэтому отступы подобраны под самую длинную колонку.
  const PAD = { top: 212, bottom: 118, side: 40 };
  const COL_L = 0.235;   // доли ширины кадра
  const COL_R = 0.765;
  const NODE_W = 250;    // дизайн-px
  const NODE_H_MAX = 40;

  class Constellation {
    constructor() {
      this.canvas = document.getElementById("view");
      this.ctx = this.canvas.getContext("2d");
      this.dpr = M.pickDpr();
      this.selectedId = null;
      this.nodes = [];
      this.strip = [];
    }

    async start() {
      this.corpus = await M.loadCorpus();
      this.card = M.Card(document.getElementById("card"), this.corpus);
      this.card.onClose = () => { this.selectedId = null; };
      this.buildLegend();

      const linked = new Set();
      for (const c of this.corpus.connections) { linked.add(c.from); linked.add(c.to); }
      const byYear = (a, b) => a.year_first - b.year_first;
      this.left = this.corpus.items.filter((i) => linked.has(i.id) && i.bucket === "in-library").sort(byYear);
      this.right = this.corpus.items.filter((i) => linked.has(i.id) && i.bucket === "by-lenin").sort(byYear);
      this.rest = this.corpus.items.filter((i) => !linked.has(i.id)).sort(byYear);

      window.addEventListener("resize", () => this.resize());
      this.canvas.addEventListener("pointerdown", this.onTap);
      this.resize();
      requestAnimationFrame(this.loop);
    }

    buildLegend() {
      const box = document.getElementById("legend");
      const used = new Set(this.corpus.connections.map((c) => c.type));
      for (const t of used) {
        const st = M.CONN_STYLE[t];
        if (!st) continue;
        const row = document.createElement("div");
        row.className = "legend-row";
        const sw = document.createElement("span");
        sw.className = "swatch";
        sw.style.borderTopColor = st.color;
        sw.style.borderTopStyle = st.dash.length ? "dashed" : "solid";
        row.appendChild(sw);
        const label = document.createElement("span");
        label.textContent = st.label;
        row.appendChild(label);
        box.appendChild(row);
      }
    }

    resize() {
      const f = M.fitCanvas(this.canvas, this.dpr);
      this.W = f.W; this.H = f.H; this.s = f.s;
      this.layout();
    }

    layout() {
      const s = this.s;
      const top = PAD.top * s;
      const bottom = this.H - PAD.bottom * s;
      const usable = bottom - top;
      this.nodes = [];

      const place = (list, cx) => {
        const pitch = Math.min(NODE_H_MAX * s, usable / Math.max(1, list.length));
        const h = pitch * 0.9;
        // колонку центрируем по вертикали: колонки разной длины (15 и 10),
        // прижатые к верху они читались бы как рассогласованные
        const start = top + (usable - pitch * list.length) / 2 + pitch / 2;
        list.forEach((item, i) => {
          this.nodes.push({
            item, cx, cy: start + i * pitch,
            w: NODE_W * s, h,
            side: cx < this.W / 2 ? -1 : 1,
          });
        });
      };
      place(this.left, this.W * COL_L);
      place(this.right, this.W * COL_R);

      // полоса «остальной корпус» — выше легенды, она живёт в HTML внизу
      const stripY = this.H - 78 * s;
      const stripL = PAD.side * s;
      const stripR = this.W - PAD.side * s;
      const step = (stripR - stripL) / Math.max(1, this.rest.length);
      this.strip = this.rest.map((item, i) => ({
        item, cx: stripL + step * (i + 0.5), cy: stripY, r: Math.min(5 * s, step * 0.34),
      }));
    }

    nodeOf(id) {
      return this.nodes.find((n) => n.item.id === id) || null;
    }

    onTap = (ev) => {
      const x = ev.offsetX * this.dpr;
      const y = ev.offsetY * this.dpr;
      for (const n of this.nodes) {
        if (Math.abs(x - n.cx) <= n.w / 2 && Math.abs(y - n.cy) <= n.h / 2) {
          this.selectedId = n.item.id;
          this.card.show(n.item);
          return;
        }
      }
      for (const d of this.strip) {
        if (Math.hypot(x - d.cx, y - d.cy) <= Math.max(d.r + 8 * this.s, 14 * this.s)) {
          this.selectedId = d.item.id;
          this.card.show(d.item);
          return;
        }
      }
      this.selectedId = null;
      this.card.hide();
    };

    related() {
      const set = new Set();
      if (!this.selectedId) return set;
      set.add(this.selectedId);
      for (const c of this.corpus.connsByItem.get(this.selectedId) || []) {
        set.add(c.from === this.selectedId ? c.to : c.from);
      }
      return set;
    }

    loop = () => { this.render(); requestAnimationFrame(this.loop); };

    render() {
      const ctx = this.ctx;
      const s = this.s;
      ctx.clearRect(0, 0, this.W, this.H);
      if (!this.nodes.length) return;
      const rel = this.related();
      const focus = this.selectedId != null;

      this.drawColumnHeads();

      // ленты — под узлами
      for (const c of this.corpus.connections) {
        const a = this.nodeOf(c.from);
        const b = this.nodeOf(c.to);
        if (!a || !b) continue;
        const dim = focus && !(rel.has(c.from) && rel.has(c.to));
        this.drawRibbon(a, b, c, dim);
      }
      for (const n of this.nodes) this.drawNode(n, focus && !rel.has(n.item.id));
      this.drawStrip(focus);
    }

    drawColumnHeads() {
      const ctx = this.ctx;
      const s = this.s;
      const y = (PAD.top - 48) * s;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const [cx, key, n] of [
        [this.W * COL_L, "in-library", this.left.length],
        [this.W * COL_R, "by-lenin", this.right.length],
      ]) {
        const meta = M.BUCKET_META[key];
        ctx.fillStyle = meta.accent;
        ctx.font = `600 ${15 * s}px "20 Kopeek", monospace`;
        ctx.fillText(`${meta.label} · ${n}`, cx, y);
        ctx.fillStyle = M.rgba(M.COLORS.paper, 0.45);
        ctx.font = `400 ${10 * s}px "20 Kopeek", monospace`;
        ctx.fillText(meta.note.toUpperCase(), cx, y + 17 * s);
      }
      // стрелка направления между колонками
      ctx.strokeStyle = M.rgba(M.COLORS.brass, 0.4);
      ctx.lineWidth = 1 * s;
      const mid = this.W / 2;
      ctx.beginPath();
      ctx.moveTo(mid - 26 * s, y + 4 * s);
      ctx.lineTo(mid + 22 * s, y + 4 * s);
      ctx.stroke();
      ctx.fillStyle = M.rgba(M.COLORS.brass, 0.55);
      ctx.beginPath();
      ctx.moveTo(mid + 28 * s, y + 4 * s);
      ctx.lineTo(mid + 20 * s, y - 1 * s);
      ctx.lineTo(mid + 20 * s, y + 9 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawRibbon(a, b, conn, dim) {
      const ctx = this.ctx;
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
      if (!dim) { ctx.shadowColor = st.color; ctx.shadowBlur = 7 * s; }
      ctx.beginPath();
      ctx.moveTo(x1, a.cy);
      ctx.bezierCurveTo(x1 + bow, a.cy, x2 - bow, b.cy, x2, b.cy);
      ctx.stroke();
      ctx.restore();

      // подпись типа — только у выделенной нити, иначе середина зарастает
      if (!dim && this.selectedId) {
        const mx = (x1 + x2) / 2;
        const my = (a.cy + b.cy) / 2;
        const fs = 10 * s;
        ctx.save();
        ctx.font = `600 ${fs}px "20 Kopeek", monospace`;
        const text = st.label.toUpperCase();
        const w = ctx.measureText(text).width;
        ctx.fillStyle = M.rgba(M.COLORS.ink, 0.88);
        ctx.fillRect(mx - w / 2 - 7 * s, my - fs * 0.85, w + 14 * s, fs * 1.7);
        ctx.fillStyle = st.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, mx, my);
        ctx.restore();
      }
    }

    drawNode(n, dim) {
      const ctx = this.ctx;
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
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = sel ? M.COLORS.brass : M.rgba(M.COLORS.paper, 0.92);
      ctx.font = `400 ${12 * s}px Nolde, Georgia, serif`;
      ctx.fillText(this.fit(item.title, n.w - padL - 46 * s), x + padL, n.cy - 6 * s);
      ctx.fillStyle = M.rgba(M.COLORS.paper, 0.5);
      ctx.font = `400 ${8.5 * s}px "20 Kopeek", monospace`;
      ctx.fillText(this.fit(item.author || "", n.w - padL - 46 * s), x + padL, n.cy + 7 * s);
      ctx.textAlign = "right";
      ctx.fillStyle = M.rgba(M.COLORS.brass, 0.75);
      ctx.font = `400 ${10 * s}px "20 Kopeek", monospace`;
      ctx.fillText(String(item.year_first), x + n.w - 10 * s, n.cy);
      ctx.restore();
    }

    // Обрезаем по реальной ширине глифов, а не по числу символов: названия
    // тут кириллица вперемешку с латиницей, посимвольный лимит врёт.
    fit(text, maxW) {
      const ctx = this.ctx;
      if (ctx.measureText(text).width <= maxW) return text;
      let lo = 0, hi = text.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid;
        else hi = mid - 1;
      }
      return text.slice(0, Math.max(1, lo)) + "…";
    }

    drawStrip(focus) {
      const ctx = this.ctx;
      const s = this.s;
      ctx.save();
      ctx.fillStyle = M.rgba(M.COLORS.paper, 0.34);
      ctx.font = `400 ${9.5 * s}px "20 Kopeek", monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(
        `ОСТАЛЬНОЙ КОРПУС — ${this.rest.length} КНИГ БЕЗ ПРОСЛЕЖЕННЫХ СВЯЗЕЙ`,
        PAD.side * s, this.H - 94 * s);
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
    }
  }

  new Constellation().start();
})();
