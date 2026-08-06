/* Сцена «Полка» — порт прототипа mtk40-shelf.
 *
 * Три полки: им · о нём · читал. Корешки по году, ширина ~ объёму, высота ~
 * формату. Драг по горизонтали независимо на каждой полке, инерция,
 * пружина на краях. Под полкой — дорожка с бегунком: о том, что полка
 * длиннее экрана, иначе ничего не говорит.
 */
import { M, DESIGN_W, createCanvas, corpusOf, createCard, createHint, unit } from "./shared.js?v=30";

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
    /* Вес указан явно: "1em '20 Kopeek'" грузит только 400, а на канве
     * половина подписей — 600. Канва загрузку шрифта не запускает вовсе
     * (ctx.font молча берёт то, что уже загружено), поэтому жирное
     * начертание надо просить прероллом. */
    fonts: ["1em 'Nolde'", "400 1em '20 Kopeek'", "600 1em '20 Kopeek'"],
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

    this.hint = createHint(this.cv.plot, this.app, "drag", "hint.shelf");

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
    if (this.hint) this.hint.destroy();
    this.cv = this.card = this.hint = null;
    this.root.classList.remove("m40-scene");
  },

  pause() { if (this.cv) this.cv.stop(); },
  resume() { if (this.cv) this.cv.start(); },

  /* Заставка: полки медленно едут в разные стороны. Корешок читается с
   * десяти метров, и метафора МТК видна без единого слова.
   *
   * Три условия канона, на которых спотыкались соседние МТК:
   *  - поза считается от времени и сразу конечная: никаких твинов, которые
   *    при остановленном rAF замерли бы на полпути (грабли 39);
   *  - скорость задана в px/с и умножается на дельту времени тикера, а не на
   *    номер кадра: оператор крутит FPS заставки ради нагрузки на панель, и
   *    полки от этого не должны разгоняться (грабли 42);
   *  - петлю держит ядро (standbyTicker), а не свой rAF: канон разрешает не
   *    выше 10 кадров в секунду.
   * Ход маятниковый, между началом полки и её концом: закольцованный сдвиг
   * давал бы рывок в момент перескока. */
  standby() {
    const SPEED = 26;                 // дизайн-px в секунду
    const RATE = [1, 0.78, 1.22];     // у каждой полки свой ход
    const SETTLE_TAU = 0.30;          // с, постоянная времени возврата из-за края

    /* Свою петлю ОБЯЗАНЫ остановить сами: при сценном аттракторе ядро сцены
     * не паузит («она же его и остановит»), и без этого rAF продолжал бы
     * рисовать все корешки с текстом каждый vsync на 4K всю ночь, а тикер
     * добавлял бы свои кадры сверху — ручка standbyFps не значила бы
     * ничего. */
    if (this.cv) this.cv.stop();

    /* Палец мог остаться лежать на стекле: посетитель опёрся, ребёнок
     * положил ладонь. pointermove ядро активностью не считает, поэтому
     * заставка не прервётся, а живой drag таскал бы полку против тикера и
     * по отрыву (moved=false) открыл бы карточку под вуалью. */
    this.dragging = null;

    /* Следы посетителя убираем: под вуалью заставки открытая карточка и
     * латунная рамка выделения оставались бы видны, если простой укоротили
     * и standby пришёл раньше reset. */
    this.activeId = null;
    if (this.card) this.card.hide();
    if (this.hint) this.hint.hide();

    /* Поза может законно покоиться В ОВЕРСКРОЛЛЕ: пружина живёт только в
     * rAF-петле, а она остановлена, и палец, отпущенный за краем без
     * скорости, оставляет scrollX отрицательным. Прыгнуть сразу на волну
     * нельзя — последний нарисованный кадр показывает ФАКТИЧЕСКУЮ позу, и
     * разрыв виден целиком (на 4K это была сотня с лишним пикселей).
     * Поэтому у каждой полки две фазы: сначала пружина доводит её до края,
     * и только потом начинается ход. Волна отсчитывается от момента входа
     * в диапазон, а не от начала заставки. */
    const phase = this.shelves.map(() => ({ settled: false, from: 0, t0: 0, last: null }));

    const stopTicker = this.app.standbyTicker((t) => {
      if (!this.cv) return;
      /* Страховка размера жила в rAF-петле, а она остановлена — тикеру нужна
       * своя, иначе слой, показанный в фоне, останется с чужим буфером. */
      this.cv.sync();
      if (!this.cv.w) return;
      const s = this.s;
      const offsetX = 100 * s;
      for (let i = 0; i < this.shelves.length; i++) {
        const shelf = this.shelves[i];
        const ph = phase[i];
        shelf.velocityX = 0;
        const span = Math.max(0, shelf.totalWidth + offsetX + 60 * s - this.cv.w);
        if (span <= 1) { shelf.scrollX = 0; continue; }

        if (!ph.settled) {
          const target = Math.min(Math.max(shelf.scrollX, 0), span);
          /* Сближение по дельте времени, а не по кадру: при любом standbyFps
           * возврат занимает одни и те же доли секунды.
           * Точку отсчёта берём ПО ПЕРВОМУ ТИКУ, а не по нулю эпохи:
           * standbyTicker ядра — setInterval, и первый колбэк приходит через
           * целый период. С нулём дельта первого кадра равнялась 1/standbyFps
           * (при штатных 10 к/с — 28% оверскролла одним шагом, при законных
           * операторских 1 к/с — 96%, то есть телепорт возвращался почти
           * целиком). С сентинелом первый НАРИСОВАННЫЙ кадр буквально равен
           * последнему живому. */
          if (ph.last === null) ph.last = t;
          const dt = Math.max(0, t - ph.last);
          ph.last = t;
          shelf.scrollX += (target - shelf.scrollX) * (1 - Math.exp(-dt / SETTLE_TAU));
          if (Math.abs(target - shelf.scrollX) < 0.5) {
            shelf.scrollX = target;
            ph.settled = true;
            ph.from = target;
            ph.t0 = t;
          }
        } else {
          /* Маятник: линейный ход отражается от краёв полки. Закольцованный
           * сдвиг давал бы рывок в момент перескока. Полки расходятся ходом
           * и длиной своего пути — разъезжаются сами. */
          const period = 2 * span;
          const raw = ph.from + SPEED * RATE[i] * s * (t - ph.t0);
          const x = ((raw % period) + period) % period;
          shelf.scrollX = x <= span ? x : period - x;
        }
      }
      this.render();
    });

    /* Симметрия: петлю остановили мы — мы же её и возвращаем. И возвращаем
     * подсказку: её одноразовый таймер к этому моменту давно отработал, а
     * будящее касание ушло в оверлей ядра, так что сама она не покажется. */
    return () => {
      stopTicker();
      if (this.cv) this.cv.start();
      if (this.hint) this.hint.show();
    };
  },

  reset() {
    for (const s of this.shelves) { s.scrollX = 0; s.velocityX = 0; }
    this.activeId = null;
    if (this.card) this.card.hide();
  },

  setLang() {
    if (this.card) this.card.setLang();
    if (this.hint) this.hint.setLang();
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
    /* Несмонтированная сцена — не авария, а её штатное состояние до
     * первого показа (конвенция МТК 41). ok:false здесь давал стенду
     * ложные аварии по всем сценам, кроме активной. */
    if (!this.cv) return { ok: true, detail: "не смонтирована" };
    const buf = this.cv.bufferOk();
    if (!buf.ok) return { ok: false, detail: "буфер канвы " + buf.detail };
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
