/* Сцена «В одном масштабе» — 283 памятника на общей шкале высот.
 * Перенос из mtk41-scale/ на контракт сцены.
 *
 * Навигация. Лента при слоте 84 px — 23 772 px, на панели 3840 это 6,2 экрана
 * драга без ориентиров. Три способа двигаться по ней сведены переключателем:
 *   СКРАББЕР    полоса внизу со сжатой хронологией; тап — прыжок, драг —
 *               промотка. Штрих на памятник высотой ~ его росту, так что
 *               полоса читается и как спарклайн.
 *   ЗУМ         ширина слота переменная: от всего корпуса в экране до фигуры.
 *   ДЕСЯТИЛЕТИЯ промотки нет, страницы по десятилетиям.
 *
 * Масштаб метра считается ОДИН РАЗ по всему корпусу и не зависит от того, что
 * на экране. Иначе на странице 1920-х четырёхметровый бюст занял бы столько
 * же, сколько колосс 57 м, и «в одном масштабе» перестало бы быть правдой.
 *
 * Отличия от прототипа, требуемые киоском:
 *  - режим НЕ персистится в localStorage (в прототипе был mtk41-scale-mode):
 *    дефолт задаётся схемой настроек, а idle-сброс обязан вернуть именно его;
 *  - буфер канвы под потолком 8.3 Мп, размер меряется сам, ResizeObserver
 *    гардится на ноль;
 *  - pause() останавливает rAF полностью. */
import {
  DATA, FALLBACK_HEIGHT, HUMAN_HEIGHT_M, PALETTE, byYear, cardUrl, createCanvasHost,
  createCard, cssColor, preloadThumbs, statusColor,
  createHint,
  fillTextIfFits,
} from "./shared.js?v=35";

const MIN_SLOT_W = 84;
const PAD_LEFT = 0.13;
const STRIP_H = 74;
const STRIP_PAD = 28;
const FRICTION = 0.93;
const MIN_VELOCITY = 0.4;
const SLOT_MAX = 120;
const LABEL_MIN_SLOT = 34;
const YEAR_MIN_SLOT = 16;
const TAP_MIN_SLOT = 26;
const DOUBLE_TAP_MS = 320;
const TAP_THRESHOLD = 8;
const MODES = ["scrubber", "zoom", "decades"];

export const scaleScene = {
  id: "scale",
  title: { ru: "В одном масштабе", en: "At one scale", zh: "同一比例" },

  preload: {
    data: {
      monuments: DATA.monuments,
      photos: DATA.photos,
      thumbs: DATA.thumbs,
      cards: DATA.cards,
      heights: DATA.heights,
    },
    custom: preloadThumbs,
  },

  settings: [
    { key: "mode", label: { ru: "Способ промотки", en: "Scrolling" },
      type: "choice", default: "scrubber",
      options: [{ value: "scrubber", label: { ru: "Скраббер", en: "Scrubber" } },
                { value: "zoom", label: { ru: "Зум", en: "Zoom" } },
                { value: "decades", label: { ru: "Десятилетия", en: "Decades" } }] },
    { key: "slotW", label: { ru: "Ширина слота", en: "Slot width" },
      type: "range", min: 48, max: 160, step: 4, unit: " px", default: MIN_SLOT_W },
    { key: "showStrip", label: { ru: "Полоса-скраббер", en: "Scrubber strip" },
      type: "toggle", default: true },
    { key: "showGuides", label: { ru: "Линии высот", en: "Height guides" },
      type: "toggle", default: true },
    { key: "showHuman", label: { ru: "Фигура человека 1.75 м", en: "Human 1.75 m" },
      type: "toggle", default: true },
  ],

  mount(el, ctx) {
    this._ctx = ctx;
    this._app = ctx.app;

    const root = document.createElement("div");
    root.className = "m41-scene m41-scale";
    root.innerHTML =
      '<header class="m41-head"><h1 class="m41-head__title"></h1>' +
      '<p class="m41-head__sub"></p></header>' +
      '<div class="m41-scale__stage"></div>' +
      '<div class="m41-nav"><div class="m41-nav__row" data-modes></div>' +
      '<div class="m41-nav__row m41-nav__row--sub" data-sub></div></div>';
    el.appendChild(root);

    this._root = root;
    this._stage = root.querySelector(".m41-scale__stage");
    this._titleEl = root.querySelector(".m41-head__title");
    this._subEl = root.querySelector(".m41-head__sub");
    this._modesEl = root.querySelector("[data-modes]");
    this._subEl2 = root.querySelector("[data-sub]");
    this._card = createCard(el, ctx.app, ctx);
    this._card.onClose(() => { this._selected = -1; });

    this._host = createCanvasHost(this._stage, "m41-scale__canvas");

    /* Подсказка — на СТОЛ, не на канву: детей <canvas> браузер не рисует.
     * Стол ужимается, когда растут собственные контролы (режим слабовидящих
     * растит --ui-scale), поэтому подсказка не наезжает на них ни в одном
     * режиме — защита структурная, а не подобранным числом. */
    this._hint = createHint(this._stage, "swipe", "hint." + this.id, ctx.app);
    this._host.observe(() => { this._layout(); });

    this._items = ctx.data.monuments.items || [];
    this._heights = ctx.data.heights || {};
    this._all = byYear(this._items);
    this._selected = -1;
    this._view = { offset: 0, velocity: 0, slotZoom: 0, fitSlot: 0, decade: null };
    this._placed = [];

    this._bindPointer();
    this._onNav = (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      this._onControl(b.getAttribute("data-act"), b.getAttribute("data-val"));
    };
    root.querySelector(".m41-nav").addEventListener("click", this._onNav);

    this.applySettings(this._cfg || {});
  },

  unmount() {
    if (this._hint) { this._hint.destroy(); this._hint = null; }
    if (this._host) this._host.destroy();
    if (this._card) this._card.destroy();
    if (this._root) {
      const nav = this._root.querySelector(".m41-nav");
      if (nav) nav.removeEventListener("click", this._onNav);
      this._root.remove();
    }
    this._root = this._host = this._card = null;
  },

  /* Неактивная сцена — 0 rAF и 0 таймеров. Проверяется на приёмке. */
  pause() { if (this._host) this._host.stop(); },

  resume() {
    if (!this._host) return;
    /* Меряем сами: ResizeObserver в скрытой вкладке не доставляется, и первая
     * раскладка после возврата иначе осталась бы от старого размера. */
    this._host.measure();
    this._layout();
    this._host.start(() => this._frame());
  },

  reset() {
    if (this._card) this._card.close();
    this._selected = -1;
    /* Режим возвращается к дефолту СХЕМЫ, а не к последнему выбранному:
     * персиста нет намеренно — следующий посетитель должен получить экран
     * таким, каким его задумал оператор. */
    this._mode = (this._cfg && this._cfg.mode) || "scrubber";
    this._view.offset = 0;
    this._view.velocity = 0;
    this._view.slotZoom = 0;
    this._view.decade = null;
    this._buildControls();
    this._layout();
  },

  setLang() { this._renderHead(); this._buildControls(); if (this._hint) this._hint.relabel(); },

  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
    this._layout();
  },

  healthcheck() {
    if (!this._host) return { ok: true, detail: "не смонтирована" };
    /* Канвовая сцена без размера — это «ещё не показывалась», а не поломка:
     * ядро держит слой скрытым (0×0), пока сцену не откроют, и меряться там
     * нечему. Тот же случай, что и «не смонтирована», принятый в канон ядра
     * по заявке МТК 41. */
    if (!this._host.width) return { ok: true, detail: "ещё не показывалась" };

    /* Буфер сверяем ПО ФАКТИЧЕСКОМУ dpr, а не по ширине бокса: счётчик фигур
     * бывает зелёным, пока сцена рисует всё до одной — но в чужом разрешении
     * (карта 42 так рисовала в 4%). Формула одна с отрисовкой — bufferFor(). */
    const buf = this._host.bufferOk();
    if (!buf.ok) return { ok: false, detail: "буфер " + buf.detail };
    if (!this._placed.length) return { ok: false, detail: "на шкале нет ни одной фигуры" };
    const measured = this._placed.filter((p) => !p.estimated).length;
    return { ok: true, detail: `фигур ${this._placed.length}, с габаритами ${measured}, буфер ${buf.detail}` };
  },

  applySettings(values) {
    this._cfg = Object.assign(
      { mode: "scrubber", slotW: MIN_SLOT_W, showStrip: true, showGuides: true, showHuman: true },
      values || {});
    if (!this._host) return;
    if (!this._mode) this._mode = this._cfg.mode;
    this._buildControls();
    this._host.measure();
    this._layout();
    if (!this._host.running()) this._host.start(() => this._frame());
  },

  /* ─── раскладка ─────────────────────────────────────────────────────── */

  _layout() {
    const h = this._host;
    if (!h || !h.width || !this._all || !this._all.length) return;

    /* Максимум по ВСЕМУ корпусу — см. шапку файла. */
    this._maxTotal = 0;
    for (const it of this._all) {
      const hh = this._heights[it.m.id] || FALLBACK_HEIGHT;
      this._maxTotal = Math.max(this._maxTotal, hh.statue + hh.pedestal);
    }

    const items = (this._mode === "decades" && this._view.decade !== null)
      ? this._all.filter((it) => Math.floor(it.year / 10) * 10 === this._view.decade)
      : this._all;
    if (!items.length) return;

    const strip = this._hasStrip();
    const left = h.width * PAD_LEFT;
    const right = h.width * 0.98;
    const viewportW = right - left;
    const baseY = strip ? (h.height - STRIP_H) * 0.84 : h.height * 0.9;
    const skyTop = h.height * 0.06;
    const mPx = ((baseY - skyTop) * 0.9) / this._maxTotal;

    this._view.fitSlot = viewportW / items.length;
    let slot;
    if (this._mode === "zoom") {
      if (!this._view.slotZoom) this._view.slotZoom = this._view.fitSlot;
      this._view.slotZoom = Math.min(SLOT_MAX, Math.max(this._view.fitSlot, this._view.slotZoom));
      slot = this._view.slotZoom;
    } else if (this._mode === "decades") {
      slot = Math.max(30, Math.min(this._cfg.slotW * 1.6, this._view.fitSlot));
    } else {
      slot = Math.max(this._cfg.slotW, this._view.fitSlot);
    }

    const figureW = Math.min(slot * 0.55, 80);
    this._placed = items.map((it, k) => {
      const hh = this._heights[it.m.id] || FALLBACK_HEIGHT;
      return {
        i: it.i, year: it.year, m: it.m,
        worldX: left + slot * (k + 0.5),
        baseY, w: figureW,
        statueH: hh.statue * mPx,
        pedestalH: hh.pedestal * mPx,
        totalH: (hh.statue + hh.pedestal) * mPx,
        hs: hh.statue, hp: hh.pedestal,
        /* Габаритов нет у 52 из 283 — рисуем пунктиром и подписываем «нет
         * данных», а не выдаём подставную высоту за измеренную. */
        estimated: !this._heights[it.m.id],
      };
    });

    this._geom = { left, right, baseY, mPx, slot, viewportW,
      contentW: slot * items.length };
    this._clamp();
    this._renderHead();
  },

  _hasStrip() { return this._mode === "scrubber" && this._cfg.showStrip; },

  _clamp() {
    const g = this._geom;
    if (!g) return;
    if (g.contentW <= g.viewportW) { this._view.offset = 0; return; }
    const min = g.viewportW - g.contentW;
    if (this._view.offset > 0) this._view.offset = 0;
    if (this._view.offset < min) this._view.offset = min;
  },

  _screenX(worldX) { return worldX + this._view.offset; },

  _renderHead() {
    if (!this._titleEl) return;
    const app = this._app;
    this._titleEl.textContent = app.t("scale.title");
    const byId = new Map(this._items.map((m) => [m.id, m]));
    const totals = Object.entries(this._heights)
      .map(([id, h]) => ({ id, total: (h.statue || 0) + (h.pedestal || 0) }))
      .filter((e) => e.total > 0 && byId.has(e.id))
      .sort((a, b) => a.total - b.total);
    if (!totals.length) { this._subEl.textContent = ""; return; }
    const lo = totals[0], hi = totals[totals.length - 1];
    const fmt = (v) => (v < 1 ? Math.round(v * 100) + " см" : (+v.toFixed(1)) + " м");
    const name = (e) => byId.get(e.id).city + ", " + byId.get(e.id).year;
    this._subEl.textContent = app.t("scale.range", {
      lo: fmt(lo.total), loName: name(lo), hi: fmt(hi.total), hiName: name(hi),
    });
  },

  /* ─── органы управления ─────────────────────────────────────────────── */

  _buildControls() {
    if (!this._modesEl) return;
    const app = this._app;
    const btn = (label, act, val, on, n) =>
      '<button type="button" class="kiosk-target' + (on ? " is-on" : "") +
      '" data-act="' + act + '" data-val="' + val + '">' + label +
      (n != null ? '<span class="m41-nav__n">' + n + "</span>" : "") + "</button>";

    this._modesEl.innerHTML = MODES
      .map((m) => btn(app.t("mode." + m), "mode", m, this._mode === m)).join("");

    if (this._mode === "zoom") {
      const atFit = this._view.slotZoom <= this._view.fitSlot + 0.5;
      this._subEl2.innerHTML =
        btn(app.t("mode.whole"), "zoom", "fit", atFit) +
        btn(app.t("mode.close"), "zoom", "in", !atFit);
    } else if (this._mode === "decades") {
      const counts = new Map();
      for (const it of this._all) {
        const d = Math.floor(it.year / 10) * 10;
        counts.set(d, (counts.get(d) || 0) + 1);
      }
      let html = btn(app.t("mode.all"), "decade", "all",
        this._view.decade === null, this._all.length);
      for (const d of [...counts.keys()].sort((a, b) => a - b)) {
        html += btn(d + "-е", "decade", String(d), this._view.decade === d, counts.get(d));
      }
      this._subEl2.innerHTML = html;
    } else {
      this._subEl2.innerHTML = "";
    }
  },

  _onControl(act, val) {
    if (act === "mode") {
      if (this._mode === val) return;
      this._mode = val;
      this._view.offset = 0;
      this._view.velocity = 0;
      this._view.slotZoom = 0;
      this._view.decade = null;
      if (this._card) this._card.close();
    } else if (act === "zoom") {
      this._setSlot(val === "fit" ? this._view.fitSlot : SLOT_MAX * 0.7, this._host.width / 2);
    } else if (act === "decade") {
      this._view.decade = val === "all" ? null : Number(val);
      this._view.offset = 0;
      if (this._card) this._card.close();
    }
    this._buildControls();
    this._layout();
  },

  _setSlot(next, anchorX) {
    if (this._mode !== "zoom" || !this._geom) return;
    const clamped = Math.min(SLOT_MAX, Math.max(this._view.fitSlot, next));
    if (clamped === this._view.slotZoom) return;
    /* Точка под пальцем остаётся на месте: без этого зум уводил бы к центру. */
    const before = (anchorX - this._view.offset - this._geom.left) / this._view.slotZoom;
    this._view.slotZoom = clamped;
    this._layout();
    this._view.offset = anchorX - this._geom.left - before * this._view.slotZoom;
    this._clamp();
    this._buildControls();
  },

  /* ─── ввод ──────────────────────────────────────────────────────────── */

  _bindPointer() {
    const c = this._host.canvas;
    const st = { down: false, drag: false, onStrip: false, x0: 0, y0: 0, lastX: 0,
      pointers: new Map(), pinchDist: 0, pinchSlot: 0, pinchX: 0, lastTap: 0 };
    this._pst = st;

    this._onDown = (e) => {
      st.pointers.set(e.pointerId, e.clientX);
      if (this._mode === "zoom" && st.pointers.size === 2) {
        const [a, b] = [...st.pointers.values()];
        st.pinchDist = Math.abs(a - b);
        st.pinchSlot = this._view.slotZoom;
        st.pinchX = (a + b) / 2;
        st.down = false;
        return;
      }
      st.down = true; st.drag = false; this._view.velocity = 0;
      st.x0 = e.clientX; st.y0 = e.clientY; st.lastX = e.clientX;
      const r = c.getBoundingClientRect();
      st.onStrip = this._hasStrip() && (e.clientY - r.top) >= this._host.height - STRIP_H;
      if (st.onStrip) this._scrollToFraction(this._stripFraction(e.clientX - r.left));
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
    };

    this._onMove = (e) => {
      if (st.pointers.has(e.pointerId)) st.pointers.set(e.pointerId, e.clientX);
      if (this._mode === "zoom" && st.pointers.size === 2 && st.pinchDist > 0) {
        const [a, b] = [...st.pointers.values()];
        const r = c.getBoundingClientRect();
        this._setSlot(st.pinchSlot * (Math.abs(a - b) / st.pinchDist), st.pinchX - r.left);
        return;
      }
      if (!st.down) return;
      const r = c.getBoundingClientRect();
      if (st.onStrip) {
        this._scrollToFraction(this._stripFraction(e.clientX - r.left));
        st.lastX = e.clientX;
        return;
      }
      if (!st.drag && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > TAP_THRESHOLD) {
        st.drag = true;
      }
      if (st.drag) {
        const dx = e.clientX - st.lastX;
        this._view.offset += dx;
        this._view.velocity = dx;
        this._clamp();
      }
      st.lastX = e.clientX;
    };

    this._onUp = (e) => {
      st.pointers.delete(e.pointerId);
      if (st.pointers.size < 2) st.pinchDist = 0;
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* не критично */ }
      if (st.down && !st.drag && !st.onStrip) {
        const now = Date.now();
        const r = c.getBoundingClientRect();
        if (this._mode === "zoom" && now - st.lastTap < DOUBLE_TAP_MS) {
          const atFit = this._view.slotZoom > this._view.fitSlot + 0.5;
          this._setSlot(atFit ? this._view.fitSlot : SLOT_MAX * 0.7, e.clientX - r.left);
          this._buildControls();
          st.lastTap = 0;
        } else {
          st.lastTap = now;
          /* На обзорном зуме фигура уже 5 px — попасть пальцем нельзя, и
           * «промах» с закрытием карточки только раздражал бы. */
          if (this._geom && this._geom.slot >= TAP_MIN_SLOT) {
            const hit = this._hitTest(e.clientX - r.left, e.clientY - r.top);
            if (hit) { this._selected = hit.i; this._card.open(hit.m); this._app.poke(); }
            else this._card.close();
          }
        }
      }
      st.down = false; st.onStrip = false;
    };

    this._onWheel = (e) => {
      if (this._mode !== "zoom") return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this._setSlot(this._view.slotZoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left);
      this._buildControls();
    };

    c.addEventListener("pointerdown", this._onDown);
    c.addEventListener("pointermove", this._onMove, { passive: true });
    c.addEventListener("pointerup", this._onUp);
    c.addEventListener("pointercancel", this._onUp);
    c.addEventListener("wheel", this._onWheel, { passive: false });
  },

  _hitTest(x, y) {
    let best = null, bestD = Infinity;
    for (const pm of this._placed) {
      const sx = this._screenX(pm.worldX);
      const hx = Math.max(pm.w, 24);
      if (x >= sx - hx && x <= sx + hx && y >= pm.baseY - pm.totalH - 14 && y <= pm.baseY + 30) {
        const d = Math.abs(x - sx);
        if (d < bestD) { bestD = d; best = pm; }
      }
    }
    return best;
  },

  _scrollFraction() {
    const g = this._geom;
    if (!g) return 0;
    const span = g.contentW - g.viewportW;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, -this._view.offset / span));
  },

  _scrollToFraction(f) {
    const g = this._geom;
    if (!g) return;
    const span = g.contentW - g.viewportW;
    if (span <= 0) return;
    this._view.offset = -Math.min(1, Math.max(0, f)) * span;
    this._clamp();
  },

  _stripFraction(x) {
    const g = this._geom;
    const w = (this._host.width - STRIP_PAD) - STRIP_PAD;
    const winW = Math.max(10, w * Math.min(1, g.viewportW / g.contentW));
    /* Тап ставит ЦЕНТР окна в точку касания, а не его левый край. */
    return (x - STRIP_PAD - winW / 2) / Math.max(1, w - winW);
  },

  /* ─── отрисовка ─────────────────────────────────────────────────────── */

  _frame() {
    const h = this._host;
    if (!h || !this._geom) return;
    if (!this._pst.down && Math.abs(this._view.velocity) > MIN_VELOCITY) {
      this._view.offset += this._view.velocity;
      this._view.velocity *= FRICTION;
      const before = this._view.offset;
      this._clamp();
      if (this._view.offset !== before) this._view.velocity = 0;
    }
    const ctx = h.ctx;
    ctx.clearRect(0, 0, h.width, h.height);
    this._drawScene();
    this._drawFigures();
    this._drawStrip();
  },

  _drawScene() {
    const h = this._host, ctx = h.ctx, g = this._geom;
    ctx.strokeStyle = cssColor(PALETTE.brass, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, g.baseY);
    ctx.lineTo(h.width, g.baseY);
    ctx.stroke();

    if (this._cfg.showGuides) {
      const guides = [HUMAN_HEIGHT_M, 5, 10, 25, 50];
      ctx.save();
      ctx.font = `400 ${Math.max(11, h.height * 0.013)}px "20 Kopeek", monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (const m of guides) {
        const y = g.baseY - m * g.mPx;
        if (y < h.height * 0.02) continue;
        const isHuman = m === HUMAN_HEIGHT_M;
        ctx.strokeStyle = isHuman ? cssColor(PALETTE.brass, 0.4) : cssColor(PALETTE.paper, 0.1);
        ctx.lineWidth = isHuman ? 1.2 : 0.7;
        ctx.setLineDash(isHuman ? [4, 6] : [2, 10]);
        ctx.beginPath();
        ctx.moveTo(h.width * 0.08, y);
        ctx.lineTo(h.width * 0.97, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = cssColor(PALETTE.paper, isHuman ? 0.9 : 0.45);
        ctx.fillText(isHuman ? this._app.t("legend.human", { n: m }) : m + " м",
          h.width * 0.075, y);
      }
      ctx.restore();
    }

    if (this._cfg.showHuman) this._drawHuman(h.width * 0.045, g.baseY, HUMAN_HEIGHT_M * g.mPx);
  },

  _drawHuman(cx, baseY, px) {
    const ctx = this._host.ctx;
    const headR = px * 0.075, legT = px * 0.2;
    ctx.save();
    ctx.fillStyle = cssColor(PALETTE.paper, 0.55);
    ctx.beginPath();
    ctx.arc(cx, baseY - px + headR, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - px * 0.06, baseY - px + headR * 2);
    ctx.lineTo(cx + px * 0.06, baseY - px + headR * 2);
    ctx.lineTo(cx + px * 0.08, baseY - legT);
    ctx.lineTo(cx - px * 0.08, baseY - legT);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - px * 0.07, baseY - legT, px * 0.05, legT);
    ctx.fillRect(cx + px * 0.02, baseY - legT, px * 0.05, legT);
    ctx.restore();
  },

  _drawFigures() {
    const h = this._host, ctx = h.ctx, g = this._geom;
    for (const pm of this._placed) {
      const x = this._screenX(pm.worldX);
      if (x < -80 || x > h.width + 80) continue;      // за кадром — не рисуем
      const sel = pm.i === this._selected;
      const bottom = pm.baseY - pm.pedestalH;

      ctx.save();
      if (!pm.estimated) {
        ctx.fillStyle = sel ? cssColor(PALETTE.brass, 0.5) : cssColor(PALETTE.graphite, 0.92);
        ctx.fillRect(x - pm.w * 0.4, bottom, pm.w * 0.8, pm.pedestalH);
      } else {
        ctx.setLineDash([4, 4]);
      }
      ctx.strokeStyle = sel ? PALETTE.brass
        : cssColor(PALETTE.window, pm.estimated ? 0.7 : 0.5);
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(x - pm.w * 0.4, bottom, pm.w * 0.8, pm.pedestalH);
      ctx.restore();

      const sTop = bottom - pm.statueH;
      const bodyW = pm.w * 0.5, headW = pm.w * 0.32, headH = pm.statueH * 0.22;
      ctx.save();
      if (pm.estimated) {
        ctx.strokeStyle = cssColor(sel ? PALETTE.brass : PALETTE.window, 0.7);
        ctx.lineWidth = sel ? 2 : 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x - bodyW * 0.5, sTop + headH, bodyW, bottom - sTop - headH);
        ctx.strokeRect(x - headW * 0.5, sTop, headW, headH);
      } else {
        ctx.fillStyle = sel ? PALETTE.brass : statusColor(pm.m.status);
        ctx.globalAlpha = pm.m.status === "unknown" ? 0.55 : 0.92;
        ctx.fillRect(x - bodyW * 0.5, sTop + headH, bodyW, bottom - sTop - headH);
        ctx.fillRect(x - headW * 0.5, sTop, headW, headH);
      }
      ctx.restore();
    }

    /* Подписи вынесены в отдельный метод: их переиспользует сцена «Силуэты»,
     * где своя отрисовка фигур, но ровно те же пороги читаемости и повороты. */
    this._drawLabels(g);
  },

  _drawLabels(g) {
    const h = this._host, ctx = h.ctx;
    /* Подписи гаснут, когда слот уже порога читаемости: название города в
     * 13 px — каша, которая мешает увидеть форму корпуса. */
    if (g.slot < YEAR_MIN_SLOT) return;
    const showCity = g.slot >= LABEL_MIN_SLOT;
    const rotate = g.slot < 90;
    for (const pm of this._placed) {
      const x = this._screenX(pm.worldX);
      if (x < -120 || x > h.width + 120) continue;
      const sel = pm.i === this._selected;
      const y = pm.baseY + 14;
      const fs = Math.max(10, Math.min(pm.w * 0.32, h.height * 0.016));
      ctx.save();
      ctx.font = `${sel ? 600 : 400} ${fs}px "20 Kopeek", monospace`;
      const cityRaw = pm.m.city || pm.m.country || "";
      /* Никаких «Благовещенск-Аму…»: канон подписей запрещает огрызок на
       * объекте. Длинное имя либо помещается целиком, либо не рисуется —
       * фигура различима и без него, имя даёт тап. */
      const city = cityRaw;
      const year = pm.year ? String(pm.year) : "—";
      const height = pm.estimated ? this._app.t("card.nodata")
        : (pm.hs + pm.hp).toFixed(pm.hs + pm.hp < 10 ? 1 : 0) + " м";
      if (rotate) {
        ctx.translate(x, y);
        ctx.rotate(-Math.PI / 3);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        let row = 0;
        if (showCity) {
          ctx.fillStyle = sel ? PALETTE.brass : cssColor(PALETTE.paper, 0.85);
          if (fillTextIfFits(ctx, city, 0, 0)) row = 1;
        }
        ctx.fillStyle = cssColor(PALETTE.brass, sel ? 0.95 : 0.6);
        fillTextIfFits(ctx, year, 0, fs * 1.25 * row);
        if (showCity) {
          ctx.fillStyle = cssColor(PALETTE.paper, 0.55);
          fillTextIfFits(ctx, height, 0, fs * 2.5);
        }
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        let row = 0;
        if (showCity) {
          ctx.fillStyle = sel ? PALETTE.brass : cssColor(PALETTE.paper, 0.78);
          if (fillTextIfFits(ctx, city, x, y)) row = 1;
        }
        ctx.fillStyle = cssColor(PALETTE.brass, sel ? 0.9 : 0.55);
        fillTextIfFits(ctx, year, x, y + fs * 1.4 * row);
        if (showCity) {
          ctx.fillStyle = cssColor(PALETTE.paper, 0.55);
          fillTextIfFits(ctx, height, x, y + fs * 2.8);
        }
      }
      ctx.restore();
    }
  },

  _drawStrip() {
    if (!this._hasStrip() || !this._placed.length) return;
    const h = this._host, ctx = h.ctx, g = this._geom;
    const top = h.height - STRIP_H;
    const x0 = STRIP_PAD, w = (h.width - STRIP_PAD) - x0;
    const barsTop = top + 20, barsH = STRIP_H - 30;

    ctx.save();
    ctx.fillStyle = cssColor(PALETTE.graphite, 0.5);
    ctx.fillRect(0, top, h.width, STRIP_H);
    ctx.strokeStyle = cssColor(PALETTE.paper, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(h.width, top);
    ctx.stroke();

    const barW = Math.max(1, w / this._placed.length - 0.6);
    for (let k = 0; k < this._placed.length; k += 1) {
      const pm = this._placed[k];
      const bx = x0 + (w * k) / this._placed.length;
      /* sqrt — иначе 57-метровый Волгоград прижимает всё остальное к нулю. */
      const bh = Math.max(2, barsH * Math.sqrt((pm.hs + pm.hp) / this._maxTotal));
      ctx.fillStyle = pm.i === this._selected ? PALETTE.brass
        : cssColor(statusColor(pm.m.status), pm.estimated ? 0.35 : 0.75);
      ctx.fillRect(bx, barsTop + barsH - bh, barW, bh);
    }

    ctx.font = '400 11px "20 Kopeek", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let lastX = -Infinity;
    for (let k = 0; k < this._placed.length; k += 1) {
      const year = this._placed[k].year;
      if (!year) continue;
      const dec = Math.floor(year / 10) * 10;
      const prev = k > 0 && this._placed[k - 1].year
        ? Math.floor(this._placed[k - 1].year / 10) * 10 : -1;
      /* Метка на ПЕРВЫЙ памятник десятилетия, а не на памятник ровного года:
       * в 1940-е и 2000-е ни один не пришёлся на год, кратный десяти. */
      if (dec === prev) continue;
      const bx = x0 + (w * k) / this._placed.length;
      if (bx - lastX < 46) continue;
      lastX = bx;
      ctx.strokeStyle = cssColor(PALETTE.paper, 0.18);
      ctx.beginPath();
      ctx.moveTo(bx, barsTop);
      ctx.lineTo(bx, barsTop + barsH);
      ctx.stroke();
      ctx.fillStyle = cssColor(PALETTE.paper, 0.5);
      ctx.fillText(String(dec), bx, top + 4);
    }

    const winW = Math.max(10, w * Math.min(1, g.viewportW / g.contentW));
    const winX = x0 + (w - winW) * this._scrollFraction();
    ctx.fillStyle = cssColor(PALETTE.paper, 0.1);
    ctx.fillRect(winX, barsTop - 4, winW, barsH + 8);
    ctx.strokeStyle = PALETTE.brass;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(winX, barsTop - 4, winW, barsH + 8);
    ctx.restore();
  },
};
