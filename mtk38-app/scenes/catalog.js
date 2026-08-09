/* МТК 38 · сцена «Каталог» — сетка карточек-написаний.
 *
 * Наследник прототипа mtk38-catalog, но там были жёстко вписаны 42 языка на
 * один экран. В финальном МТК канон — 128 языков, поэтому сетка листается
 * страницами, а фильтр (все / ООН / с изданием) — пилюлями на сцене: это выбор
 * посетителя, а не настройка киоска.
 *
 * Canvas 2D, а не DOM: у каждого написания свой шрифт своей письменности, и
 * рисовать их вручную дешевле, чем биться с переносом строк в 128 ячейках.
 */
import { loadData, famBig, famWord, PAL, rgba, beginStandby, pollSize, bufferComplaint, offScreen, capDpr } from "./shared.js?v=17";
import { createCard } from "./card.js?v=17";

export const catalogScene = {
  id: "catalog",
  title: { ru: "Каталог", en: "Catalogue", zh: "目录" },

  settings: [
    { key: "cols", label: { ru: "Колонок" }, type: "range", min: 4, max: 10, step: 1, default: 7 },
    { key: "rows", label: { ru: "Строк" }, type: "range", min: 3, max: 8, step: 1, default: 5 },
    { key: "gap", label: { ru: "Просвет" }, type: "range", min: 0.008, max: 0.05, step: 0.002, default: 0.022 },
    { key: "breath", label: { ru: "Дыхание ячеек" }, type: "range", min: 0, max: 0.04, step: 0.002, default: 0.012 },
    { key: "word", label: { ru: "Кегль написания" }, type: "range", min: 0.6, max: 1.6, step: 0.05, default: 1 },
    { key: "grain", label: { ru: "Зерно" }, type: "range", min: 0, max: 0.2, step: 0.005, default: 0.05 },
    { key: "vign", label: { ru: "Виньетка" }, type: "range", min: 0, max: 1, step: 0.02, default: 0.8 },
  ],

  preload: { custom: async () => { await loadData(); } },

  async mount(el, ctx) {
    /* Ядро глотает исключение mount и всё равно считает сцену смонтированной.
     * Флаг отличает «ещё не начинали» от «начали и не доехали»: во втором
     * случае посетитель смотрит в пустой слой, и зелёный healthcheck был бы
     * прямым враньём (пропал data/mtk38.json → чёрный экран при зелёном стенде). */
    this._mountStarted = true;
    this._app = ctx && ctx.app;
    const data = await loadData();
    this._all = [...data.langs].sort((a, b) => (b.un - a.un) || (b.wt - a.wt) || a.n.localeCompare(b.n, "ru"));
    this._pubs = data.pubs;
    this._pubsOk = data.pubsOk;

    const root = document.createElement("div");
    root.className = "m38-scene m38-catalog";
    root.innerHTML =
      '<canvas class="m38-canvas"></canvas>' +
      '<div class="m38-vign"></div><div class="m38-grain"></div>' +
      '<header class="m38-head"><div class="m38-kicker"></div>' +
      '<h1 class="m38-title"></h1><p class="m38-sub"></p></header>' +
      '<nav class="m38-pills" role="radiogroup"><span class="m38-pills__lab"></span>' +
      '<button type="button" class="m38-pill kiosk-target" data-filter="all"></button>' +
      '<button type="button" class="m38-pill kiosk-target" data-filter="un"></button>' +
      '<button type="button" class="m38-pill kiosk-target" data-filter="pub"></button></nav>' +
      '<div class="m38-pager">' +
      '<button type="button" class="m38-pager__btn kiosk-target" data-page="-1" aria-label="назад">‹</button>' +
      '<span class="m38-pager__num"></span>' +
      '<button type="button" class="m38-pager__btn kiosk-target" data-page="1" aria-label="вперёд">›</button></div>';
    el.appendChild(root);

    this._root = root;
    this._canvas = root.querySelector(".m38-canvas");
    this._ctx2d = this._canvas.getContext("2d");
    this._card = createCard({ publications: this._pubs, t: (k) => (this._app ? this._app.t(k) : null),
      lang: () => (this._app ? this._app.lang : "ru") });
    this._filter = "all";
    this._page = 0;
    this._hover = -1;
    this._press = -1;
    this._cells = [];
    this._cfg = this._cfg || {};

    this._h = {
      pills: (e) => {
        const b = e.target.closest("[data-filter]");
        if (!b) return;
        this._filter = b.getAttribute("data-filter");
        this._page = 0;
        this._build();
      },
      pager: (e) => {
        const b = e.target.closest("[data-page]");
        if (!b) return;
        this._turn(+b.getAttribute("data-page"));
      },
      move: (e) => {
        const r = this._canvas.getBoundingClientRect();
        this._hover = this._at(e.clientX - r.left, e.clientY - r.top);
      },
      leave: () => { this._hover = -1; },
      down: (e) => {
        if (this._card.isOpen && this._card.isOpen()) return;
        const r = this._canvas.getBoundingClientRect();
        this._press = this._at(e.clientX - r.left, e.clientY - r.top);
        this._hover = this._press;
        this._downAt = { i: this._press, t: performance.now(), x: e.clientX, y: e.clientY };
      },
      up: (e) => {
        const d = this._downAt;
        this._press = -1;
        if (!d || d.i < 0) return;
        const r = this._canvas.getBoundingClientRect();
        const up = this._at(e.clientX - r.left, e.clientY - r.top);
        if (up === d.i && performance.now() - d.t < 600) {
          const cell = this._cells[up];
          if (cell) this._card.open(cell.item);
        }
      },
      // свайп по сетке листает страницы — привычнее, чем целиться в стрелку
      swipe: (e) => {
        if (!this._downAt) return;
        const dx = e.clientX - this._downAt.x;
        if (Math.abs(dx) > 90) { this._turn(dx < 0 ? 1 : -1); this._downAt = null; }
      },
    };
    root.querySelector(".m38-pills").addEventListener("click", this._h.pills);
    root.querySelector(".m38-pager").addEventListener("click", this._h.pager);
    this._canvas.addEventListener("pointermove", this._h.move, { passive: true });
    this._canvas.addEventListener("pointermove", this._h.swipe, { passive: true });
    this._canvas.addEventListener("pointerleave", this._h.leave);
    this._canvas.addEventListener("pointerdown", this._h.down);
    this._canvas.addEventListener("pointerup", this._h.up);
    this._canvas.addEventListener("pointercancel", () => { this._press = -1; });

    this._ro = new ResizeObserver(() => { this._size(); this._build(); });
    this._ro.observe(this._canvas);
    /* Подсказку вешаем на СЛОЙ СЦЕНЫ, а не на канвас: div внутри <canvas> —
     * fallback-контент, браузер его не рисует. Подпись берём из словаря и
     * обновляем в setLang: иначе на EN/ZH вся сцена переведена, а призыв
     * к жесту остаётся русским (умолчание кита). */
    if (window.KioskHint) {
      this._hint = window.KioskHint.attach(root,
        { gesture: "swipe", label: this._hintLabel() });
    }

    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }
    this.setLang(ctx && ctx.lang);
    this._size();
    this.applySettings(this._cfg);
    this.resume();
  },

  unmount() {
    this._mountStarted = false;
    this.pause();
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._hint && this._hint.destroy) this._hint.destroy();
    this._hint = null;
    if (this._card) { this._card.destroy(); this._card = null; }
    if (this._root) this._root.remove();
    this._root = this._canvas = this._ctx2d = null;
    this._cells = [];
  },

  pause() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } },

  resume() {
    if (this._raf || !this._root) return;
    this._t0 = performance.now();
    const step = () => { this._raf = requestAnimationFrame(step); this._draw(); };
    this._raf = requestAnimationFrame(step);
  },

  reset() {
    if (this._card) this._card.close();
    this._filter = "all"; this._page = 0; this._hover = -1;
    this._build();
  },

  /* Контракт ядра: standby() без аргумента, возврат — стоп-функция аттрактора.
   * Отдаём тротлённую петлю (timings.standbyFps): зритель издалека видит саму
   * сцену, а не оверлей ядра, при этом GPU ночью не молотит на 60 кадрах. */
  standby() {
    this.pause();
    if (this._card) this._card.close();
    this._standby = true;
    const tick = () => this._draw();
    // сетка статична — в заставке она листается сама, иначе экран мёртвый
    clearInterval(this._auto);
    this._auto = setInterval(() => this._turn(1), 7000);
    return beginStandby(this._app, tick, () => {
      clearInterval(this._auto); this._auto = 0;
      this._standby = false;
    });
  },

  setLang(lang) {
    this._lang = lang || this._lang || "ru";
    const T = {
      ru: { kicker: "МТК 38 · Ленин на языках мира", title: "Каталог написаний",
            lab: "показать", all: "все", un: "языки ООН", pub: "с изданием",
            sub: (n) => `${n} языков в сетке. Тап по ячейке — карточка языка и издания на нём.` },
      en: { kicker: "MTK 38 · Lenin in the world's languages", title: "Catalogue of forms",
            lab: "show", all: "all", un: "UN languages", pub: "with edition",
            sub: (n) => `${n} languages in a grid. Tap a cell for the language card and its edition.` },
      zh: { kicker: "МТК 38 · 世界语言中的列宁", title: "写法目录",
            lab: "显示", all: "全部", un: "联合国语言", pub: "有出版物",
            sub: (n) => `网格中的 ${n} 种语言。点按查看卡片。` },
    }[this._lang];
    if (!T || !this._root) return;
    this._T = T;
    this._root.querySelector(".m38-kicker").textContent = T.kicker;
    this._root.querySelector(".m38-title").textContent = T.title;
    this._root.querySelector(".m38-pills__lab").textContent = T.lab;
    for (const b of this._root.querySelectorAll("[data-filter]")) {
      b.textContent = T[b.getAttribute("data-filter")];
    }
    this._syncCardLang();
    if (this._hint && this._hint.setLabel) this._hint.setLabel(this._hintLabel());
    this._build();
  },

  _hintLabel() { return this._app ? this._app.t("hint.catalog") : null; },

  _syncCardLang() { if (this._card && this._card.setLang) this._card.setLang(); },

  healthcheck() {
    /* «Не смонтирована» — зелёное только если монтирования и не начинали.
     * Начали и не доехали (ядро проглотило исключение) — красное. */
    if (!this._root) {
      return this._mountStarted
        ? { ok: false, detail: "монтирование не завершилось — слой пуст" }
        : { ok: true, detail: "не смонтирована" };
    }
    if (!this._canvas) return { ok: false, detail: "монтирование не завершилось — канваса нет" };
    const bad = offScreen(this._root) ? null : bufferComplaint(this._canvas, this._dpr, this._root);
    if (bad) return { ok: false, detail: bad };
    /* Пусто по фильтру и пусто из-за непрочитанных данных — разные вещи.
     * Фильтр «с изданием» на несостоявшейся загрузке изданий обязан краснеть
     * ровно так же, как слой изданий на карте: корень один. */
    if (this._filter === "pub" && this._pubsOk === false) {
      return { ok: false, detail: "издания не загрузились — фильтр «с изданием» пуст не по данным" };
    }
    const total = this._list().length;
    /* Легально пустое состояние: фильтр «с изданием» на урезанном каноне может
     * дать ноль — это честный ответ данных, а не поломка сцены. Красным здесь
     * горело бы то, что посетителю показывают правильно. */
    if (!total) return { ok: true, detail: `фильтр «${this._filter}» — языков нет (пусто по данным)` };
    /* Сетка раскладывается от размера контейнера, а размер приходит из кадра.
     * В скрытом слое ячеек законно ноль — это не «загружено, но пусто». */
    if (offScreen(this._root)) {
      return { ok: true, detail: `фильтр «${this._filter}»: ${total} языков готовы, слой не на экране` };
    }
    if (!this._cells.length) {
      return { ok: false, detail: `в фильтре «${this._filter}» ${total} языков, а на странице ноль ячеек` };
    }
    return { ok: true, detail: `ячеек на странице ${this._cells.length}, `
      + `страница ${this._page + 1} из ${this._pages}, фильтр «${this._filter}» (${total} языков)` };
  },

  /* Фильтр — выбор посетителя, в схеме настроек его нет: даём sweep явно. */
  states() {
    return ["all", "un", "pub"].map((k) => ({
      name: "фильтр: " + k,
      apply: () => { this._filter = k; this._page = 0; this._build(); },
    }));
  },

  setA11y(on) {
    this._a11y = !!on;
    if (this._root) this._root.classList.toggle("is-a11y", !!on);
    // слабовидящим — крупнее и меньше на экране
    this._build();
  },

  applySettings(values) {
    this._cfg = Object.assign({}, this._cfg, values || {});
    if (!this._root) return;
    this._root.style.setProperty("--m38-grain", this._cfg.grain ?? 0.05);
    this._root.style.setProperty("--m38-vign", this._cfg.vign ?? 0.8);
    this._build();
  },

  /* ── внутреннее ─────────────────────────────────────────────────── */

  _list() {
    if (this._filter === "un") return this._all.filter((l) => l.un);
    if (this._filter === "pub") return this._all.filter((l) => this._pubs.has(l.id));
    return this._all;
  },

  _size() {
    if (!this._canvas) return;
    const r = this._canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this._W = Math.round(r.width); this._H = Math.round(r.height);
    /* Тот же бюджет 8.3 Мп, что у GPU-сцен: Canvas 2D дешевле в отрисовке, но
     * 4K-бокс при dpr 2 давал буфер под 40 Мп — это память и просадка на
     * каждой заливке, а на киоске экран как раз 4K. */
    const dpr = capDpr(this._W, this._H);
    this._dpr = dpr;
    this._canvas.width = Math.round(this._W * dpr);
    this._canvas.height = Math.round(this._H * dpr);
    this._ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  _build() {
    if (!this._root || !this._W) return;
    const c = this._cfg || {};
    const list = this._list();
    let cols = Math.round(c.cols ?? 7), rows = Math.round(c.rows ?? 5);
    if (this._a11y) { cols = Math.max(3, cols - 2); rows = Math.max(2, rows - 1); }
    if (this._H > this._W) { const t = cols; cols = Math.max(3, rows); rows = t; }

    const per = cols * rows;
    this._pages = Math.max(1, Math.ceil(list.length / per));
    this._page = Math.max(0, Math.min(this._pages - 1, this._page));

    // поля: сверху панель посетителя и заголовок, снизу пилюли, пагинатор и
    // навигация ядра — сетка не должна залезать ни под то, ни под другое
    const gap = Math.min(this._W, this._H) * (c.gap ?? 0.022);
    const top = this._H * 0.34, bottom = this._H * 0.2;
    const cw = (this._W - gap * (cols + 1)) / cols;
    const ch = (this._H - top - bottom - gap * (rows + 1)) / rows;

    this._cells = [];
    const from = this._page * per;
    for (let i = 0; i < per && from + i < list.length; i++) {
      const r = Math.floor(i / cols), cc = i % cols;
      this._cells.push({
        x: gap + cc * (cw + gap), y: top + gap + r * (ch + gap), w: cw, h: ch,
        item: list[from + i], t: 0, phase: ((from + i) * 2.399) % (Math.PI * 2),
      });
    }

    const T = this._T;
    if (T) this._root.querySelector(".m38-sub").textContent = T.sub(list.length);
    this._root.querySelector(".m38-pager__num").textContent = `${this._page + 1} / ${this._pages}`;
    for (const b of this._root.querySelectorAll("[data-filter]")) {
      b.setAttribute("aria-checked", b.getAttribute("data-filter") === this._filter ? "true" : "false");
    }
  },

  _turn(d) {
    if (!this._pages) return;
    this._page = (this._page + d + this._pages) % this._pages;
    this._hover = -1;
    this._build();
  },

  _at(x, y) {
    for (let i = 0; i < this._cells.length; i++) {
      const c = this._cells[i];
      if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return i;
    }
    return -1;
  },

  _draw() {
    const ctx = this._ctx2d;
    // ResizeObserver в фоне молчит, в том числе на первой доставке: без этого
    // сетка, собранная в скрытом слое, осталась бы пустой навсегда
    if (pollSize(this, this._canvas)) { this._size(); this._build(); }
    if (!ctx || !this._W) return;
    const cfg = this._cfg || {};
    const time = (performance.now() - this._t0) / 1000;
    ctx.clearRect(0, 0, this._W, this._H);
    for (let i = 0; i < this._cells.length; i++) {
      const cell = this._cells[i];
      const target = i === this._press ? 1 : i === this._hover ? 0.55 : 0;
      cell.t += (target - cell.t) * 0.18;
      this._cell(ctx, cell, time, cfg);
    }
  },

  _cell(ctx, cell, time, cfg) {
    const h = cell.t;
    const breath = 1 + Math.sin(time * 0.5 + cell.phase) * (cfg.breath ?? 0.012);
    const s = 1 + h * 0.04;
    const cx = cell.x + cell.w / 2, cy = cell.y + cell.h / 2;
    const w = cell.w * s, hh = cell.h * s;
    const x0 = cx - w / 2, y0 = cy - hh / 2;
    const it = cell.item;
    const m = Math.min(w, hh);

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x0, y0, w, hh, m * 0.04);
    ctx.fillStyle = rgba("#000000", 0.22 + h * 0.18);
    ctx.fill();
    ctx.lineWidth = 1 + h * 1.8;
    ctx.strokeStyle = rgba(PAL.brass, 0.18 + h * 0.6);
    ctx.stroke();
    ctx.restore();

    // написание — крупно; латиница/кириллица брендовым Nolde, остальное — своей Noto
    ctx.save();
    let size = m * 0.3 * breath * (cfg.word ?? 1);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `${it.sc === "Latn" || it.sc === "Cyrl" ? 600 : 400} ${size}px ${famBig(it.sc)}`;
    // длинные написания (тибетское, бирманское) ужимаем по ширине ячейки
    const max = w * 0.84;
    const tw = ctx.measureText(it.w).width;
    if (tw > max) {
      size *= max / tw;
      ctx.font = `${it.sc === "Latn" || it.sc === "Cyrl" ? 600 : 400} ${size}px ${famBig(it.sc)}`;
    }
    ctx.shadowColor = rgba("#000000", 0.6);
    ctx.shadowBlur = 10 + h * 16;
    ctx.fillStyle = h > 0.6 ? PAL.brass : PAL.paper;
    ctx.globalAlpha = 0.88 + h * 0.12;
    ctx.fillText(it.w, cx, cy - hh * 0.05);
    ctx.restore();

    // название языка
    ctx.save();
    ctx.font = `400 ${m * 0.085}px "20 Kopeek","Courier New",monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = rgba(PAL.paper, 0.62 + h * 0.3);
    ctx.fillText(fit(ctx, it.n, w * 0.86), cx, y0 + hh - hh * 0.13);
    ctx.restore();

    // код письменности слева сверху; точка справа — есть издание
    ctx.save();
    ctx.font = `600 ${m * 0.075}px "20 Kopeek","Courier New",monospace`;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = rgba(PAL.brass, 0.55 + h * 0.4);
    ctx.fillText(it.sc, x0 + w * 0.06, y0 + hh * 0.07);
    ctx.restore();
    if (this._pubs.has(it.id)) {
      ctx.beginPath();
      ctx.arc(x0 + w * 0.92, y0 + hh * 0.1, m * 0.018, 0, Math.PI * 2);
      ctx.fillStyle = rgba(PAL.red, 0.75 + h * 0.25);
      ctx.fill();
    }

    if (h > 0.05) {
      ctx.save();
      ctx.font = `400 ${m * 0.068}px "20 Kopeek","Courier New",monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = rgba(PAL.brass, 0.35 + h * 0.4);
      ctx.globalAlpha = h;
      ctx.fillText(fit(ctx, it.r, w * 0.86), cx, y0 + hh - hh * 0.04);
      ctx.restore();
    }
  },
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
}

/* Обрезаем по МЕТРИКЕ, а не по числу символов: «Каракалпакский» и «ᏣᎳᎩ» при
 * равной длине занимают разную ширину. */
function fit(ctx, text, max) {
  if (!text) return "";
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s + "…";
}
