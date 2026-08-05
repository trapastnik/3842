/* Сцена «Объём написанного» — порт прототипа mtk40-volume.
 *
 * Плиточная карта (squarified treemap): площадь плитки — число страниц.
 * Верхний уровень — три оси корпуса, внутри каждой — книги.
 *
 * Разброс в данных 4 → 30 000 страниц, то есть 7500 крат. В честном масштабе
 * одно ПСС занимает треть картины, а «Декрет о земле» вырождается в нитку
 * тоньше пикселя — по нему нельзя попасть пальцем. Поэтому метрика площади
 * переключается: «страницы» показывают правду, «√ страниц» сжимает пропорцию
 * так, чтобы различались все 99. Оба режима подписаны, чтобы второй не
 * читался как настоящий масштаб.
 */
import { M, DESIGN_W, createCanvas, corpusOf, createCard, unit, chip } from "./shared.js?v=27";

const GAP = 3;          // дизайн-px между плитками
const GROUP_GAP = 10;

const MODES = [
  { id: "pages", f: (n) => n },
  { id: "sqrt", f: (n) => Math.sqrt(n) },
];

/* Squarified treemap, Bruls–Huizing–van Wijk: раскладывает значения в
 * прямоугольник, стремясь к квадратным плиткам. */
function squarify(values, rect) {
  const out = [];
  const total = values.reduce((s, v) => s + v.value, 0);
  if (total <= 0) return out;
  let { x, y, w, h } = rect;
  let rest = values.slice().sort((a, b) => b.value - a.value);
  const scale = (w * h) / total;

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

export const volumeScene = {
  id: "volume",
  title: { ru: "Объём", en: "Volume", zh: "篇幅" },
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
    { key: "areaMode", type: "select", default: "pages",
      label: { ru: "Метрика площади", en: "Area metric", zh: "面积度量" },
      options: [
        ["pages", { ru: "страницы", en: "pages", zh: "页数" }],
        ["sqrt", { ru: "√ страниц", en: "√ pages", zh: "√ 页数" }],
      ] },
    { key: "labels", type: "toggle", default: true,
      label: { ru: "Названия на плитках", en: "Titles on tiles", zh: "色块上的书名" } },
    { key: "tileGap", type: "range", min: 0, max: 8, step: 1, unit: " px", default: GAP,
      label: { ru: "Зазор между плитками", en: "Gap between tiles", zh: "色块间距" } },
  ],

  mount(el, ctx) {
    this.app = ctx.app;
    this.corpus = corpusOf(ctx.data.corpus);
    /* Два слоя значений: operator — последний пуш схемы настроек, values —
     * он же плюс зрительские правки чипами. Простой возвращает первый, иначе
     * следующий посетитель получал бы метрику, выбранную предыдущим. */
    this.operator = { areaMode: "pages", labels: true, tileGap: GAP };
    this.values = { ...this.operator };
    this.selectedId = null;
    this.cells = [];
    this.groupRects = [];

    el.classList.add("m40-scene");
    this.root = el;

    this.cv = createCanvas(el, {
      onSize: () => this.layout(),
      onFrame: () => this.render(),
    });
    this.card = createCard(el, this.corpus, this.app);
    this.card.onClose = () => { this.selectedId = null; };

    /* Метрика площади — выбор зрителя, а не только оператора: в схеме она
     * задаёт стартовое значение, на экране переключается чипами. */
    this.tools = document.createElement("div");
    this.tools.className = "m40-chips m40-tools";
    el.appendChild(this.tools);

    this.noteEl = document.createElement("div");
    this.noteEl.className = "m40-note";
    el.appendChild(this.noteEl);

    this.cv.canvas.addEventListener("pointerdown", this.onTap);

    this.paintTools();
    this.cv.observe();
    this.cv.sync();
  },

  unmount() {
    if (this.cv) {
      this.cv.canvas.removeEventListener("pointerdown", this.onTap);
      this.cv.destroy();
    }
    if (this.card) this.card.el.remove();
    if (this.tools) this.tools.remove();
    if (this.noteEl) this.noteEl.remove();
    this.cv = this.card = this.tools = this.noteEl = null;
    this.root.classList.remove("m40-scene");
  },

  pause() { if (this.cv) this.cv.stop(); },
  resume() { if (this.cv) this.cv.start(); },

  reset() {
    this.selectedId = null;
    if (this.card) this.card.hide();
    this.values = { ...this.operator };
    this.paintTools();
    this.layout();
  },

  setLang() {
    if (this.card) this.card.setLang();
    this.paintTools();
  },

  setA11y() { this.layout(); },

  applySettings(v) {
    this.operator = { ...v };
    this.values = { ...v };
    this.paintTools();
    this.layout();
  },

  healthcheck() {
    /* Несмонтированная сцена — не авария, а её штатное состояние до
     * первого показа (конвенция МТК 41). ok:false здесь давал стенду
     * ложные аварии по всем сценам, кроме активной. */
    if (!this.cv) return { ok: true, detail: "не смонтирована" };
    const buf = this.cv.bufferOk();
    if (!buf.ok) return { ok: false, detail: "буфер канвы " + buf.detail };
    if (!this.corpus.items.length) return { ok: false, detail: "корпус пуст" };
    if (!this.cv.w) return { ok: true, detail: "слой скрыт, раскладки ещё не было" };
    if (!this.cells.length) return { ok: false, detail: "плиток нет — раскладка пуста" };
    const thin = this.cells.filter((c) => c.w < 1 || c.h < 1).length;
    return {
      ok: true,
      detail: "плиток " + this.cells.length + ", тоньше пикселя " + thin,
    };
  },

  // ---------- обвязка ----------
  get s() { return unit(this.app, this.cv ? this.cv.w : DESIGN_W); },
  mode() { return MODES.find((m) => m.id === this.values.areaMode) || MODES[0]; },
  num(n) { return Number(n || 0).toLocaleString(this.app.lang === "zh" ? "zh-CN" : this.app.lang); },

  paintTools() {
    if (!this.tools) return;
    this.tools.innerHTML = "";
    for (const m of MODES) {
      this.tools.appendChild(chip(this.app.t("volume.mode." + m.id), {
        pressed: this.values.areaMode === m.id,
        onClick: () => {
          this.values = { ...this.values, areaMode: m.id };
          this.paintTools();
          this.layout();
        },
      }));
    }
    const perAxis = M.BUCKETS.map((b) => this.app.t("volume.axis.total", {
      label: this.app.t("bucket." + b),
      n: this.num(this.corpus.items.filter((i) => i.bucket === b)
        .reduce((acc, i) => acc + (i.pages_approx || 0), 0)),
    })).join(" · ");
    this.noteEl.textContent = this.app.t("volume.note." + this.values.areaMode) + " · " + perAxis;
  },

  // ---------- раскладка ----------
  layout() {
    if (!this.cv || !this.cv.w) return;
    const s = this.s;
    /* Верх занят чипами режима, низ — строкой пояснения: меряем их, а не
     * держим константу, иначе режим слабовидящих (таргеты ×1.25) наедет на
     * первую строку плиток. */
    const padTop = (this.tools ? this.tools.getBoundingClientRect().height : 0) + 16 * s;
    const padBottom = (this.noteEl ? this.noteEl.getBoundingClientRect().height : 0) + 16 * s;
    const rect = {
      x: 0, y: padTop,
      w: this.cv.w,
      h: this.cv.h - padTop - padBottom,
    };
    if (rect.w <= 0 || rect.h <= 0) { this.cells = []; return; }

    const f = this.mode().f;
    const groups = M.BUCKETS.map((b) => {
      const items = this.corpus.items.filter((i) => i.bucket === b);
      return { bucket: b, items, value: items.reduce((acc, i) => acc + f(i.pages_approx || 1), 0) };
    });

    /* Верхний уровень — три колонки в постоянном порядке ИМ / ЧИТАЛ / О НЁМ,
     * ширина по объёму. Через squarify порядок осей менялся при смене метрики
     * (в корневом масштабе «О НЁМ» обгоняет «ИМ»), и картинка прыгала на
     * ровном месте. */
    const totalV = groups.reduce((acc, g) => acc + g.value, 0) || 1;
    let gx = rect.x;
    this.groupRects = groups.map((g) => {
      const w = (rect.w - GROUP_GAP * s * (groups.length - 1)) * (g.value / totalV);
      const r = { item: g, x: gx, y: rect.y, w, h: rect.h };
      gx += w + GROUP_GAP * s;
      return r;
    });

    this.cells = [];
    for (const g of this.groupRects) {
      const head = 26 * s;                 // место под шапку группы
      const inner = {
        x: g.x + GROUP_GAP * s * 0.5,
        y: g.y + GROUP_GAP * s * 0.5 + head,
        w: Math.max(1, g.w - GROUP_GAP * s),
        h: Math.max(1, g.h - GROUP_GAP * s - head),
      };
      const vals = g.item.items.map((i) => ({ value: f(i.pages_approx || 1), book: i }));
      for (const c of squarify(vals, inner)) {
        this.cells.push({ book: c.item.book, x: c.x, y: c.y, w: c.w, h: c.h, bucket: g.item.bucket });
      }
    }
  },

  onTap: function (ev) {
    /* Сверху вниз по площади: мелкие плитки «выше» в смысле выбора, иначе в
     * них невозможно попасть рядом с гигантами. */
    const hit = [...this.cells]
      .sort((a, b) => a.w * a.h - b.w * b.h)
      .find((c) => ev.offsetX >= c.x && ev.offsetX <= c.x + c.w &&
                   ev.offsetY >= c.y && ev.offsetY <= c.y + c.h);
    if (hit) {
      this.selectedId = hit.book.id;
      this.card.show(hit.book);
    } else {
      this.selectedId = null;
      this.card.hide();
    }
  },

  // ---------- кадр ----------
  render() {
    const ctx = this.cv.ctx;
    const s = this.s;
    ctx.clearRect(0, 0, this.cv.w, this.cv.h);
    if (!this.cells.length) return;

    for (const g of this.groupRects) {
      const meta = M.BUCKET_META[g.item.bucket];
      const pages = g.item.items.reduce((acc, i) => acc + (i.pages_approx || 0), 0);
      ctx.save();
      ctx.fillStyle = meta.accent;
      ctx.font = `600 ${15 * s}px "20 Kopeek", monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      /* Шапку режем по ширине своей колонки: у «ЧИТАЛ» она вчетверо уже, чем
       * у «ИМ», и полная строка залезала на соседнюю ось — читалось как одна
       * общая подпись. */
      const head = M.wrapLines(ctx,
        this.app.t("volume.axis.total", { label: this.app.t("bucket." + g.item.bucket), n: this.num(pages) }),
        Math.max(1, g.w - GROUP_GAP * s), 1)[0] || "";
      ctx.fillText(head, g.x + GROUP_GAP * s * 0.5, g.y + 2 * s);
      ctx.restore();
    }

    for (const c of this.cells) this.drawCell(c);
  },

  drawCell(c) {
    const ctx = this.cv.ctx;
    const s = this.s;
    const gap = (this.values.tileGap ?? GAP) * s;
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

    /* Подпись только если плитка её вмещает: обрезки в узкой плитке читаются
     * как мусор, лучше ничего. */
    const padX = 7 * s;
    if (this.values.labels !== false && w > 58 * s && h > 26 * s) {
      const fs = Math.min(14 * s, Math.max(10 * s, h * 0.17));
      ctx.font = `400 ${fs}px Nolde, Georgia, serif`;
      ctx.fillStyle = M.rgba(M.COLORS.ink, 0.86);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const lines = M.wrapLines(ctx, c.book.title, w - padX * 2, 3);
      let ty = c.y + 6 * s;
      for (const ln of lines) { ctx.fillText(ln, c.x + padX, ty); ty += fs * 1.14; }
      if (h > 52 * s) {
        ctx.font = `400 ${Math.max(9 * s, fs * 0.72)}px "20 Kopeek", monospace`;
        ctx.fillStyle = M.rgba(M.COLORS.ink, 0.6);
        ctx.fillText(this.app.t("card.pages", { n: this.num(c.book.pages_approx) }), c.x + padX, ty + 2 * s);
      }
    }
    ctx.restore();
  },
};

/* Обработчик объявлен свойством объекта-сцены — привязываем к нему. */
volumeScene.onTap = volumeScene.onTap.bind(volumeScene);
