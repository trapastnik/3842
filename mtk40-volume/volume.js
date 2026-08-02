/**
 * МТК 40 · Объём написанного.
 *
 * Плиточная карта (squarified treemap): площадь плитки — число страниц.
 * Верхний уровень — три оси корпуса, внутри каждой — книги.
 *
 * Разброс в данных 4 → 30 000 страниц, то есть 7500 крат. В честном
 * масштабе одно ПСС занимает треть картины, а «Декрет о земле» вырождается
 * в нитку тоньше пикселя — по нему нельзя попасть пальцем. Поэтому метрика
 * площади переключается: «страницы» показывают правду, «√ страниц» сжимает
 * пропорцию так, чтобы различались все 99. Оба режима подписаны, чтобы
 * второй не читался как настоящий масштаб.
 */
(function () {
  const M = window.MTK40;

  const PAD = { top: 196, bottom: 92, side: 32 };
  const GAP = 3;          // дизайн-px между плитками
  const GROUP_GAP = 10;

  const MODES = [
    { id: "pages", label: "страницы", f: (n) => n,
      note: "площадь строго пропорциональна числу страниц — как есть" },
    { id: "sqrt", label: "√ страниц", f: (n) => Math.sqrt(n),
      note: "площадь ~ корню из страниц: пропорция сжата, зато различимы все 99" },
  ];

  // Squarified treemap, Bruls–Huizing–van Wijk: раскладывает значения в
  // прямоугольник, стремясь к квадратным плиткам.
  function squarify(values, rect) {
    const out = [];
    const total = values.reduce((s, v) => s + v.value, 0);
    if (total <= 0) return out;
    let { x, y, w, h } = rect;
    let rest = values.slice().sort((a, b) => b.value - a.value);
    let scale = (w * h) / total;

    const worst = (row, side) => {
      const sum = row.reduce((s, v) => s + v.value, 0) * scale;
      const max = Math.max(...row.map((v) => v.value)) * scale;
      const min = Math.min(...row.map((v) => v.value)) * scale;
      const s2 = sum * sum;
      return Math.max((side * side * max) / s2, s2 / (side * side * min));
    };

    while (rest.length) {
      const side = Math.min(w, h);
      const row = [rest[0]];
      let i = 1;
      while (i < rest.length && worst(row.concat(rest[i]), side) <= worst(row, side)) {
        row.push(rest[i]); i++;
      }
      const sum = row.reduce((s, v) => s + v.value, 0) * scale;
      const thick = side > 0 ? sum / side : 0;
      let off = 0;
      for (const v of row) {
        const len = (v.value * scale) / (thick || 1);
        if (w >= h) out.push({ item: v, x, y: y + off, w: thick, h: len });
        else out.push({ item: v, x: x + off, y, w: len, h: thick });
        off += len;
      }
      if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
      rest = rest.slice(row.length);
      if (w <= 0 || h <= 0) break;
    }
    return out;
  }

  class Volume {
    constructor() {
      this.canvas = document.getElementById("view");
      this.ctx = this.canvas.getContext("2d");
      this.dpr = M.pickDpr();
      this.mode = MODES[0];
      this.selectedId = null;
      this.cells = [];
    }

    async start() {
      this.corpus = await M.loadCorpus();
      this.card = M.Card(document.getElementById("card"), this.corpus);
      this.card.onClose = () => { this.selectedId = null; };
      this.buildModes();
      this.totalPages = this.corpus.items.reduce((s, i) => s + (i.pages_approx || 0), 0);

      window.addEventListener("resize", () => this.resize());
      this.canvas.addEventListener("pointerdown", this.onTap);
      this.resize();
      requestAnimationFrame(this.loop);
    }

    buildModes() {
      const box = document.getElementById("modes");
      for (const m of MODES) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.textContent = m.label;
        b.setAttribute("aria-pressed", String(m === this.mode));
        b.addEventListener("click", () => {
          this.mode = m;
          for (const el of box.children) {
            el.setAttribute("aria-pressed", String(el.textContent === m.label));
          }
          this.layout();
          this.renderNote();
        });
        box.appendChild(b);
      }
      this.renderNote();
    }

    renderNote() {
      const box = document.getElementById("note");
      const perAxis = M.BUCKETS.map((b) => {
        const n = this.corpus
          ? this.corpus.items.filter((i) => i.bucket === b).reduce((s, i) => s + i.pages_approx, 0)
          : 0;
        return `${M.BUCKET_META[b].label} ${n.toLocaleString("ru")}`;
      }).join(" · ");
      box.innerHTML = "";
      const row = document.createElement("div");
      row.className = "legend-row";
      row.textContent = `${this.mode.note} · страниц по осям: ${perAxis}`;
      box.appendChild(row);
    }

    resize() {
      const f = M.fitCanvas(this.canvas, this.dpr);
      this.W = f.W; this.H = f.H; this.s = f.s;
      this.layout();
    }

    layout() {
      const s = this.s;
      const rect = {
        x: PAD.side * s,
        y: PAD.top * s,
        w: this.W - 2 * PAD.side * s,
        h: this.H - (PAD.top + PAD.bottom) * s,
      };
      if (rect.w <= 0 || rect.h <= 0) { this.cells = []; return; }

      const f = this.mode.f;
      const groups = M.BUCKETS.map((b) => {
        const items = this.corpus.items.filter((i) => i.bucket === b);
        return { bucket: b, items, value: items.reduce((acc, i) => acc + f(i.pages_approx || 1), 0) };
      });

      // Верхний уровень — три колонки в постоянном порядке ИМ / ЧИТАЛ / О НЁМ,
      // ширина по объёму. Через squarify порядок осей менялся при смене
      // метрики (в корневом масштабе «О НЁМ» обгоняет «ИМ»), и картинка
      // прыгала на ровном месте.
      const totalV = groups.reduce((s, g) => s + g.value, 0) || 1;
      let gx = rect.x;
      this.groupRects = groups.map((g) => {
        const w = (rect.w - GROUP_GAP * s * (groups.length - 1)) * (g.value / totalV);
        const r = { item: g, x: gx, y: rect.y, w, h: rect.h };
        gx += w + GROUP_GAP * s;
        return r;
      });
      this.cells = [];
      for (const g of this.groupRects) {
        const inner = {
          x: g.x + GROUP_GAP * s * 0.5,
          y: g.y + GROUP_GAP * s * 0.5 + 20 * s,   // место под шапку группы
          w: Math.max(1, g.w - GROUP_GAP * s),
          h: Math.max(1, g.h - GROUP_GAP * s - 20 * s),
        };
        const vals = g.item.items.map((i) => ({ value: f(i.pages_approx || 1), book: i }));
        for (const c of squarify(vals, inner)) {
          this.cells.push({ book: c.item.book, x: c.x, y: c.y, w: c.w, h: c.h, bucket: g.item.bucket });
        }
      }
    }

    onTap = (ev) => {
      const x = ev.offsetX * this.dpr;
      const y = ev.offsetY * this.dpr;
      // сверху вниз по площади: мелкие плитки лежат «поверх» в смысле выбора,
      // иначе в них невозможно попасть рядом с гигантами
      const hit = [...this.cells]
        .sort((a, b) => a.w * a.h - b.w * b.h)
        .find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
      if (hit) {
        this.selectedId = hit.book.id;
        this.card.show(hit.book);
      } else {
        this.selectedId = null;
        this.card.hide();
      }
    };

    loop = () => { this.render(); requestAnimationFrame(this.loop); };

    render() {
      const ctx = this.ctx;
      const s = this.s;
      ctx.clearRect(0, 0, this.W, this.H);
      if (!this.cells.length) return;

      for (const g of this.groupRects) {
        const meta = M.BUCKET_META[g.item.bucket];
        const pages = g.item.items.reduce((acc, i) => acc + i.pages_approx, 0);
        ctx.save();
        ctx.fillStyle = meta.accent;
        ctx.font = `600 ${13 * s}px "20 Kopeek", monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`${meta.label} · ${pages.toLocaleString("ru")} стр.`,
          g.x + GROUP_GAP * s * 0.5, g.y + 2 * s);
        ctx.restore();
      }

      for (const c of this.cells) this.drawCell(c);
    }

    drawCell(c) {
      const ctx = this.ctx;
      const s = this.s;
      const gap = GAP * s;
      const w = Math.max(0, c.w - gap);
      const h = Math.max(0, c.h - gap);
      if (w <= 0.4 || h <= 0.4) return;
      const sel = c.book.id === this.selectedId;

      ctx.save();
      ctx.fillStyle = c.book.cover_color;
      ctx.globalAlpha = sel ? 1 : 0.88;
      ctx.fillRect(c.x, c.y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = sel ? M.COLORS.brass : M.rgba(M.COLORS.ink, 0.55);
      ctx.lineWidth = (sel ? 2.5 : 1) * s;
      ctx.strokeRect(c.x, c.y, w, h);

      // Подпись только если плитка её вмещает: обрезки в узкой плитке
      // читаются как мусор, лучше ничего.
      const padX = 7 * s;
      if (w > 58 * s && h > 26 * s) {
        const fs = Math.min(13 * s, Math.max(9 * s, h * 0.17));
        ctx.font = `400 ${fs}px Nolde, Georgia, serif`;
        ctx.fillStyle = M.rgba(M.COLORS.ink, 0.86);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        const lines = this.wrap(c.book.title, w - padX * 2, 3);
        let ty = c.y + 6 * s;
        for (const ln of lines) { ctx.fillText(ln, c.x + padX, ty); ty += fs * 1.14; }
        if (h > 52 * s) {
          ctx.font = `400 ${Math.max(8 * s, fs * 0.72)}px "20 Kopeek", monospace`;
          ctx.fillStyle = M.rgba(M.COLORS.ink, 0.6);
          ctx.fillText(`${c.book.pages_approx.toLocaleString("ru")} стр.`, c.x + padX, ty + 2 * s);
        }
      }
      ctx.restore();
    }

    wrap(text, maxW, maxLines) {
      const ctx = this.ctx;
      const words = text.split(" ");
      const lines = [];
      let cur = "";
      for (const word of words) {
        const probe = cur ? cur + " " + word : word;
        if (ctx.measureText(probe).width <= maxW) { cur = probe; continue; }
        if (cur) lines.push(cur);
        cur = word;
        if (lines.length === maxLines) break;
      }
      if (cur && lines.length < maxLines) lines.push(cur);
      if (!lines.length) return [];
      const last = lines[lines.length - 1];
      if (lines.length === maxLines && ctx.measureText(last).width > maxW * 0.92) {
        lines[lines.length - 1] = last.slice(0, Math.max(1, last.length - 1)) + "…";
      }
      return lines;
    }
  }

  new Volume().start();
})();
