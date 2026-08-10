/* Сцена «Три шкалы» — корпус, разложенный по трём диапазонам высот, каждый со
 * своим увеличением. Перенос из mtk41-silhouettes-stacked/ на контракт сцены.
 *
 * Зачем отдельная сцена, если есть «В одном масштабе». Там метр стоит одинаково
 * на всей ленте, и это честно, но 57-метровый Волгоград прижимает бюст 56 см к
 * нулю: увидеть можно либо колоссов, либо мелочь. Здесь наоборот — три полосы
 * с РАЗНЫМ масштабом метра, и внутри каждой объекты сравнимы между собой.
 * Сравнивать полосы между собой нельзя, и подпись каждой это проговаривает.
 *
 * Промотка у каждой полосы своя: драг внутри полосы двигает только её. Общего
 * переключателя режимов здесь нет намеренно — полосы короткие (самая длинная
 * это малые, 0–8 м), скраббер и зум были бы избыточны. */
import {
  DATA,
  FALLBACK_HEIGHT,
  PALETTE,
  byYear,
  createCanvasHost,
  createCard,
  cssColor,
  plural,
  preloadThumbs,
  statusColor,
  createHint,
  FINDER_FIELDS,
  countryOptions,
  decadeOptions,
  APP,
  drawEmptyState,
  hintForEmpty,
  emptyVerdict,
  finderApply,
  finderSort,
  setCorpus,
  statusOptions,
  fillTextIfFits,
} from "./shared.js?v=60";

const BANDS = [
  { id: "small", maxM: 8 },
  { id: "medium", maxM: 20 },
  { id: "large", maxM: 60 },
];
const MIN_SLOT_W = 84;
const TAP_THRESHOLD = 8;
const FRICTION = 0.93;
const MIN_VELOCITY = 0.4;

export const stackedScene = {
  id: "stacked",
  title: { ru: "Три шкалы", en: "Three scales", zh: "三种比例" },

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

  /* Финдер: отбор и поиск. Сортировка объявляется только там, где у
   * порядка есть видимый эффект (см. декларацию, утверждённую 2026-08-10). */
  finder: {
    search: { fields: FINDER_FIELDS },
    filters: [
      { key: "status", label: { ru: "Судьба", en: "Fate" },
        options: function () { return statusOptions(APP()); } },
      { key: "country", label: { ru: "Страна", en: "Country" },
        options: function () { return countryOptions(); } },
    ],
  },

  settings: [
    { key: "slotW", label: { ru: "Ширина слота", en: "Slot width" },
      type: "range", min: 48, max: 160, step: 4, unit: " px", default: MIN_SLOT_W },
    { key: "showBandLabels", label: { ru: "Подписи полос", en: "Band captions" },
      type: "toggle", default: true },
    { key: "showCities", label: { ru: "Города под фигурами", en: "City labels" },
      type: "toggle", default: true },
  ],

  mount(el, ctx) {
    this._ctx = ctx;
    this._app = ctx.app;

    const root = document.createElement("div");
    root.className = "m41-scene m41-stacked";
    root.innerHTML =
      '<header class="m41-head"><h1 class="m41-head__title"></h1>' +
      '<p class="m41-head__sub"></p></header>' +
      '<div class="m41-stacked__stage"></div>';
    el.appendChild(root);

    this._root = root;
    this._stage = root.querySelector(".m41-stacked__stage");
    this._titleEl = root.querySelector(".m41-head__title");
    this._subEl = root.querySelector(".m41-head__sub");
    this._card = createCard(el, ctx.app, ctx);
    this._card.onClose(() => { this._selected = -1; });

    this._host = createCanvasHost(this._stage, "m41-stacked__canvas");

    /* Подсказка — на СТОЛ, не на канву: детей <canvas> браузер не рисует.
     * Стол ужимается, когда растут собственные контролы (режим слабовидящих
     * растит --ui-scale), поэтому подсказка не наезжает на них ни в одном
     * режиме — защита структурная, а не подобранным числом. */
    this._hint = createHint(this._stage, "swipe", "hint." + this.id, ctx.app);
    this._host.observe(() => { this._layout(); });

    this._src = ctx.data.monuments.items || [];
    this._items = this._src;
    setCorpus(ctx.data.monuments.items || [], ctx.app);
    this._heights = ctx.data.heights || {};
    this._selected = -1;
    this._placed = [];
    /* Смещение и инерция — на каждую полосу свои. */
    this._pan = { small: 0, medium: 0, large: 0 };
    this._vel = { small: 0, medium: 0, large: 0 };
    this._bounds = {};

    this._bindPointer();
    this.applySettings(this._cfg || {});
  },

  unmount() {
    if (this._hint) { this._hint.destroy(); this._hint = null; }
    if (this._host) this._host.destroy();
    if (this._card) this._card.destroy();
    if (this._root) this._root.remove();
    this._root = this._host = this._card = null;
  },

  pause() { if (this._host) this._host.stop(); },

  resume() {
    if (!this._host) return;
    this._host.measure();
    this._layout();
    this._host.start(() => this._frame());
  },

  reset() {
    if (this._card) this._card.close();
    this._selected = -1;
    for (const b of BANDS) { this._pan[b.id] = 0; this._vel[b.id] = 0; }
  },

  setLang() { this._renderHead(); if (this._hint) this._hint.relabel(); },

  setA11y(on) {
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
    this._layout();
  },

  healthcheck() {
    if (!this._host) return { ok: true, detail: "не смонтирована" };
    /* Канвовая сцена без размера — «ещё не показывалась», а не поломка
     * (канон кита, README п. про healthcheck; конвенция принята по заявке
     * МТК 41). Спрашиваем ЖИВОЙ бокс: host.width — это память о последнем
     * измерении, она переживает скрытие слоя и соврёт по неактивной сцене. */
    if (!this._host.liveBox().w) return { ok: true, detail: "ещё не показывалась" };

    /* Буфер сверяем ПО ФАКТИЧЕСКОМУ dpr, а не по ширине бокса: счётчик фигур
     * бывает зелёным, пока сцена рисует всё до одной — но в чужом разрешении
     * (карта 42 так рисовала в 4%). Формула одна с отрисовкой — bufferFor(). */
    const buf = this._host.bufferOk();
    if (!buf.ok) return { ok: false, detail: "буфер " + buf.detail };
    /* _placed может ещё не существовать: _applyFind зовётся из mount() до
     * его инициализации, а healthcheck стенд может позвать в любой момент. */
    if (!(this._placed || []).length) return emptyVerdict(this._find, "ни одной фигуры ни в одной полосе");
    const per = BANDS.map((b) =>
      b.id + ": " + (this._placed || []).filter((p) => p.band === b.id).length);
    return { ok: true, detail: `фигур ${(this._placed || []).length} (${per.join(", ")}), буфер ${buf.detail}` };
  },

  /* Отбор целиком, при любом изменении. {shown,total} возвращаем: без него
   * панель не объяснит, почему на сцене поредело. */
  applyFinder(find) {
    this._find = find;
    this._applyFind();
    return { shown: this._items.length, total: (this._src || []).length };
  },
  _applyFind() {
    this._items = finderApply(this._src || [], this._find);
    /* Меряем ЖИВОЙ бокс перед пересборкой. Геометрия, от которой зависит
     * healthcheck, обязана считаться вне кадра (канон GRABLI): _host.width —
     * это кеш последнего measure(), а measure() живёт в rAF. Стенд приёмки
     * разворачивает каждый фильтр в состояние и зовёт healthcheck БЕЗ
     * отрисовки — на кеше он получил бы «ни одной фигуры» у исправной сцены. */
    if (this._host && !this._host.width) this._host.measure();
    this._layout();
    /* Второй замер — ПОСЛЕ перестройки DOM вокруг холста (шапка, чипы, режим
     * слабовидящих). Первый ловит ещё старый бокс, и healthcheck колеблется.
     * На киоске лечит наблюдатель размера, но в скрытой вкладке он НЕ
     * ДОСТАВЛЯЕТСЯ ВООБЩЕ — а стенд приёмки работает именно в скрытой.
     * Правило вешаем на СЕМЬЮ: строку получают все канвовые сцены. */
    if (this._host) this._host.measure();
  },

  applySettings(values) {
    this._cfg = Object.assign(
      { slotW: MIN_SLOT_W, showBandLabels: true, showCities: true }, values || {});
    if (!this._host) return;
    this._host.measure();
    this._layout();
    this._renderHead();
    if (!this._host.running()) this._host.start(() => this._frame());
  },

  /* ─── раскладка ─────────────────────────────────────────────────────── */

  _bandOf(totalM) {
    for (const b of BANDS) if (totalM <= b.maxM) return b.id;
    return BANDS[BANDS.length - 1].id;
  },

  _layout() {
    const h = this._host;
    /* Предусловия раскладки — в самой раскладке, а не у вызывающих: у
     * «Масштаба» хрупкий порядок в mount() убил обе ленты на живом экране
     * (см. scale.js). Правило вешаем на семью. */
    if (!h || !h.width || !h.height || !this._cfg) return;

    const buckets = { small: [], medium: [], large: [] };
    for (const it of byYear(this._items)) {
      const hh = this._heights[it.m.id] || FALLBACK_HEIGHT;
      const total = hh.statue + hh.pedestal;
      buckets[this._bandOf(total)].push({ i: it.i, m: it.m, hh,
        estimated: !this._heights[it.m.id] });
    }

    const area = h.height - h.height * 0.04;
    const bandH = area / 3;
    const gap = h.height * 0.008;
    const left = h.width * 0.1;
    const right = h.width * 0.97;

    this._bands = BANDS.map((band, k) => {
      const topY = bandH * k;
      const baseY = topY + bandH - gap - h.height * 0.055;   // место под подписи
      const usableH = baseY - topY;
      return Object.assign({}, band, { topY, baseY, mPx: (usableH * 0.94) / band.maxM });
    });

    this._placed = [];
    for (const b of this._bands) {
      const items = buckets[b.id];
      this._bounds[b.id] = [left, left];
      if (!items.length) continue;
      const viewportW = right - left;
      const slotW = Math.max(this._cfg.slotW, viewportW / items.length);
      const figW = Math.min(slotW * 0.75, 110);
      this._bounds[b.id] = [left, left + slotW * items.length];
      for (let k = 0; k < items.length; k += 1) {
        const it = items[k];
        this._placed.push({
          i: it.i, m: it.m, band: b.id, estimated: it.estimated,
          worldX: left + slotW * (k + 0.5),
          baseY: b.baseY, topY: b.topY, w: figW,
          hs: it.hh.statue, hp: it.hh.pedestal,
          statueH: it.hh.statue * b.mPx,
          pedestalH: it.hh.pedestal * b.mPx,
          totalH: (it.hh.statue + it.hh.pedestal) * b.mPx,
        });
      }
      this._clampPan(b.id);
    }
    this._geom = { left, right, viewportW: right - left };
  },

  _clampPan(bandId) {
    const [cl, cr] = this._bounds[bandId] || [0, 0];
    const contentW = cr - cl;
    const viewportW = this._geom ? this._geom.viewportW : this._host.width * 0.87;
    if (contentW <= viewportW) { this._pan[bandId] = 0; return; }
    const min = viewportW - contentW;
    this._pan[bandId] = Math.min(0, Math.max(min, this._pan[bandId]));
  },

  _bandAtY(y) {
    if (!this._bands) return null;
    for (const b of this._bands) {
      if (y >= b.topY && y < b.topY + (this._host.height / 3)) return b.id;
    }
    return this._bands[this._bands.length - 1].id;
  },

  _renderHead() {
    if (!this._titleEl) return;
    this._titleEl.textContent = this._app.t("stacked.title");
    this._subEl.textContent = this._app.t("stacked.subtitle");
  },

  /* ─── ввод ──────────────────────────────────────────────────────────── */

  _bindPointer() {
    const c = this._host.canvas;
    const st = { down: false, drag: false, x0: 0, y0: 0, lx: 0, band: null };
    this._pst = st;

    this._onDown = (e) => {
      const r = c.getBoundingClientRect();
      st.down = true; st.drag = false;
      st.x0 = e.clientX; st.y0 = e.clientY; st.lx = e.clientX;
      /* Полоса определяется в момент касания и дальше не меняется: иначе при
       * вертикальном уводе пальца драг перескакивал бы на соседнюю. */
      st.band = this._bandAtY(e.clientY - r.top);
      if (st.band) this._vel[st.band] = 0;
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
    };

    this._onMove = (e) => {
      if (!st.down || !st.band) return;
      if (!st.drag && Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > TAP_THRESHOLD) {
        st.drag = true;
      }
      if (st.drag) {
        const dx = e.clientX - st.lx;
        this._pan[st.band] += dx;
        this._vel[st.band] = dx;
        this._clampPan(st.band);
      }
      st.lx = e.clientX;
    };

    this._onUp = (e) => {
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* не критично */ }
      if (st.down && !st.drag) {
        const r = c.getBoundingClientRect();
        this._tap(e.clientX - r.left, e.clientY - r.top);
      }
      st.down = false; st.band = null;
    };

    c.addEventListener("pointerdown", this._onDown);
    c.addEventListener("pointermove", this._onMove, { passive: true });
    c.addEventListener("pointerup", this._onUp);
    c.addEventListener("pointercancel", this._onUp);
  },

  _tap(x, y) {
    let best = null, bestD = Infinity;
    for (const pm of this._placed) {
      const sx = pm.worldX + this._pan[pm.band];
      const hx = Math.max(pm.w * 0.6, 24);
      if (x >= sx - hx && x <= sx + hx && y >= pm.baseY - pm.totalH - 12 && y <= pm.baseY + 26) {
        const d = Math.abs(x - sx);
        if (d < bestD) { bestD = d; best = pm; }
      }
    }
    if (!best) { this._card.close(); return; }
    this._selected = best.i;
    this._card.open(best.m);
    this._app.poke();
  },

  /* ─── отрисовка ─────────────────────────────────────────────────────── */

  _frame() {
    const h = this._host;
    if (!h) return;
    if (h.width && !this._bands) { this._host.measure(); this._layout(); }
    if (!this._bands) return;
    for (const b of BANDS) {
      if (this._pst.down || Math.abs(this._vel[b.id]) <= MIN_VELOCITY) continue;
      this._pan[b.id] += this._vel[b.id];
      this._vel[b.id] *= FRICTION;
      const before = this._pan[b.id];
      this._clampPan(b.id);
      if (this._pan[b.id] !== before) this._vel[b.id] = 0;
    }
    const ctx = h.ctx;
    /* Отбор не дал совпадений — заглушка вместо пустого поля: панель пишет
     * «0 из 283», но сцена без подписи это чистый экран без объяснения. */
    if (this._items && !this._items.length) {
      ctx.clearRect(0, 0, h.width, h.height);
      drawEmptyState(ctx, h.width, h.height, this._app);
      hintForEmpty(this, true);
      return;
    }
    hintForEmpty(this, false);
    ctx.clearRect(0, 0, h.width, h.height);
    this._drawBands();
    this._drawFigures();
  },

  _drawBands() {
    const h = this._host, ctx = h.ctx;
    const fs = Math.max(11, Math.min(h.height * 0.017, 20));
    ctx.save();
    for (const b of this._bands) {
      ctx.strokeStyle = cssColor(PALETTE.brass, 0.4);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, b.baseY);
      ctx.lineTo(h.width, b.baseY);
      ctx.stroke();

      if (!this._cfg.showBandLabels) continue;
      ctx.font = `600 ${fs}px "20 Kopeek", monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = cssColor(PALETTE.paper, 0.55);
      ctx.fillText(this._app.t("band." + b.id), 8, b.topY + 4);
    }
    ctx.restore();
  },

  _drawFigures() {
    const h = this._host, ctx = h.ctx;
    const fs = Math.max(9, Math.min(h.height * 0.013, 15));
    for (const pm of this._placed) {
      const x = pm.worldX + this._pan[pm.band];
      if (x < -80 || x > h.width + 80) continue;
      const sel = pm.i === this._selected;
      const bottom = pm.baseY - pm.pedestalH;
      const sTop = bottom - pm.statueH;
      const bodyW = pm.w * 0.42, headW = pm.w * 0.27, headH = pm.statueH * 0.22;

      ctx.save();
      if (pm.estimated) {
        /* Габаритов нет — только пунктир, как и в остальных сценах: подставная
         * высота не должна выглядеть измеренной. */
        ctx.strokeStyle = cssColor(sel ? PALETTE.brass : PALETTE.window, 0.6);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x - pm.w * 0.34, bottom, pm.w * 0.68, pm.pedestalH);
        ctx.strokeRect(x - bodyW * 0.5, sTop + headH, bodyW, bottom - sTop - headH);
        ctx.strokeRect(x - headW * 0.5, sTop, headW, headH);
      } else {
        ctx.fillStyle = cssColor(PALETTE.graphite, 0.92);
        ctx.fillRect(x - pm.w * 0.34, bottom, pm.w * 0.68, pm.pedestalH);
        ctx.fillStyle = sel ? PALETTE.brass : statusColor(pm.m.status);
        ctx.globalAlpha = pm.m.status === "unknown" ? 0.55 : 0.92;
        ctx.fillRect(x - bodyW * 0.5, sTop + headH, bodyW, bottom - sTop - headH);
        ctx.fillRect(x - headW * 0.5, sTop, headW, headH);
      }
      ctx.restore();

      if (!this._cfg.showCities || pm.w < 26) continue;
      ctx.save();
      ctx.font = `${sel ? 600 : 400} ${fs}px "20 Kopeek", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      /* Никакого slice: «Санкт-Петербур» и «Иваново-Вознес» — тот же обрубок,
       * что и с многоточием, только без маркера, и оттого хуже — многоточие
       * хотя бы честно сообщает, что имя урезано. В корпусе 13 городов длиннее
       * 14 знаков, и на дефолтном виде они были видны все.
       *
       * Срез пережил мой же коммит про канон подписей, потому что проверка
       * искала «…» и выход за рамку — маркерless-срез невидим обоим критериям.
       * Это ровно та грабля «перехват проверяет кадр, а не код», которую я сам
       * и записал: против такого работает только греп по местам, где строится
       * подпись. */
      const city = pm.m.city || "";
      ctx.fillStyle = sel ? PALETTE.brass : cssColor(PALETTE.paper, 0.72);
      fillTextIfFits(ctx, city, x, pm.baseY + 4);
      ctx.fillStyle = cssColor(PALETTE.brass, 0.6);
      fillTextIfFits(ctx, pm.m.year ? String(pm.m.year) : "—", x, pm.baseY + 4 + fs * 1.25);
      ctx.restore();
    }
  },
};
