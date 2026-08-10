/* МТК 38 · сцена «Композиции» — облако, мандала, лента, стена.
 *
 * Наследник студии V2. Там композиций было семь, но глобус, дождь и карта в
 * киоске стали самостоятельными сценами с географией и физикой — здесь остались
 * четыре чисто пластические раскладки одного и того же множества написаний.
 * Переключатель — пилюлями на сцене: это главный выбор посетителя.
 *
 * Студия работала на Three r137 (UMD, EffectComposer). Здесь она переложена на
 * общий рендерер приложения (r184, WebGPU/WebGL2) — ради одной копии Three на
 * страницу вместо двух и одного пути пост-обработки на все сцены.
 */
import { loadData, PAL, beginStandby, pollSize, bufferComplaint, offScreen, attachHint } from "./shared.js?v=24";
import { createCard } from "./card.js?v=24";
import { ensureGPU, loadPostNodes, fitTo, attachCanvas, detachCanvas } from "./gpu.js?v=24";

const LAYOUTS = ["cloud", "mandala", "ticker", "wall"];
/* Отлёт камеры под раскладку: «стена» шире всех, «мандала» — компактное кольцо.
 * Одна дистанция на все четыре давала либо слова вплотную к зрителю в облаке,
 * либо стену, не влезающую в кадр. */
const CAM_Z = { cloud: 21, mandala: 22, ticker: 16, wall: 18 };
const TONES = [PAL.paper, PAL.telegrey];

export const compositionsScene = {
  id: "compositions",
  title: { ru: "Композиции", en: "Compositions", zh: "构图" },

  settings: [
    { key: "speed", label: { ru: "Скорость" }, type: "range", min: 0, max: 4, step: 0.05, default: 1 },
    { key: "size", label: { ru: "Размер слов" }, type: "range", min: 0.4, max: 2.4, step: 0.05, default: 1 },
    { key: "depth", label: { ru: "Затухание дальних" }, type: "range", min: 0, max: 1, step: 0.02, default: 0.55 },
    { key: "brass", label: { ru: "Доля латуни, %" }, type: "range", min: 0, max: 80, step: 1, default: 34 },
    { key: "red", label: { ru: "Доля красного, %" }, type: "range", min: 0, max: 25, step: 1, default: 5 },
    { key: "exposure", label: { ru: "Экспозиция" }, type: "range", min: 0.4, max: 2, step: 0.02, default: 1.1 },
    { key: "bloom", label: { ru: "Свечение" }, type: "range", min: 0, max: 2.5, step: 0.02, default: 0.85 },
    { key: "bloomThr", label: { ru: "Порог свечения" }, type: "range", min: 0, max: 1, step: 0.02, default: 0.7 },
    { key: "bloomRadius", label: { ru: "Радиус свечения" }, type: "range", min: 0, max: 1, step: 0.01, default: 0.55 },
    /* «Плотность ×» из прототипа mtk38-cloud: разброс облака. Собственной
     * сцены у облака больше нет, поэтому настройка живёт здесь и действует
     * на раскладку «облако». */
    { key: "cloudDensity", label: { ru: "Плотность облака" }, type: "range", min: 0.4, max: 2.5, step: 0.05, default: 1 },
    { key: "fog", label: { ru: "Туман" }, type: "range", min: 0, max: 1, step: 0.02, default: 0.22 },
    { key: "bg", label: { ru: "Фон (светлота)" }, type: "range", min: 24, max: 60, step: 1, default: 44 },
    { key: "grain", label: { ru: "Зерно" }, type: "range", min: 0, max: 0.2, step: 0.005, default: 0.055 },
    { key: "vign", label: { ru: "Виньетка" }, type: "range", min: 0, max: 1, step: 0.02, default: 0.5 },
    /* Цитаты — слой поверх сцены (модуль V2). По умолчанию выключен: включает
     * куратор, когда МТК работает как фон зала, а не как интерактив. */
    { key: "quotesOn", label: { ru: "Цитаты Ленина" }, type: "toggle", default: false },
    { key: "quoteMode", label: { ru: "Размещение цитат" }, type: "select", default: "center",
      options: [["center", "Центр"], ["lower", "Низ"], ["side", "Сбоку"], ["scene", "Сцена"], ["corner", "Уголок"]] },
    { key: "qGlow", label: { ru: "Цитаты · свечение" }, type: "range", min: 0, max: 2, step: 0.05, default: 1 },
    { key: "qBlur", label: { ru: "Цитаты · разблюр фона" }, type: "range", min: 0, max: 30, step: 1, default: 16 },
    { key: "qScrim", label: { ru: "Цитаты · затемнение" }, type: "range", min: 0, max: 2, step: 0.05, default: 1 },
    { key: "qScale", label: { ru: "Цитаты · размер" }, type: "range", min: 0.6, max: 2, step: 0.05, default: 1 },
  ],

  preload: {
    data: { quotes: "../data/mtk38-quotes.json" },
    custom: async () => {
      await Promise.all([ensureGPU(), loadData(), import("../../mtk38-v3/engine/text.js")]);
    },
  },

  async mount(el, ctx) {
    /* Ядро глотает исключение mount и всё равно считает сцену смонтированной.
     * Флаг отличает «ещё не начинали» от «начали и не доехали»: во втором
     * случае посетитель смотрит в пустой слой, и зелёный healthcheck был бы
     * прямым враньём (пропал data/mtk38.json → чёрный экран при зелёном стенде). */
    this._mountStarted = true;
    this._app = ctx && ctx.app;
    const data = await loadData();
    this._forms = data.forms;

    const root = document.createElement("div");
    root.className = "m38-scene m38-comps";
    root.innerHTML =
      '<div class="m38-vign"></div><div class="m38-grain"></div>' +
      '<header class="m38-head"><div class="m38-kicker"></div>' +
      '<h1 class="m38-title"></h1><p class="m38-sub"></p></header>' +
      '<nav class="m38-pills" role="radiogroup"><span class="m38-pills__lab"></span>' +
      LAYOUTS.map((k) => `<button type="button" class="m38-pill kiosk-target" data-layout="${k}"></button>`).join("") +
      "</nav>";
    el.appendChild(root);
    this._root = root;
    this._card = createCard({ publications: data.pubs, t: (k) => (this._app ? this._app.t(k) : null),
      lang: () => (this._app ? this._app.lang : "ru") });

    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }

    const gpu = await ensureGPU();
    this._gpu = gpu;
    const THREE = gpu.THREE, tsl = gpu.TSL;
    attachCanvas(gpu, root);

    const [textMod, post] = await Promise.all([
      import("../../mtk38-v3/engine/text.js"),
      loadPostNodes(),
    ]);
    this._mkTex = textMod.makeWordTexture;

    this._scene = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    // Раскладки тюнились на 53 словах; на 60 формах кадр уплотняется — отводим
    // камеру пропорционально корню из числа слов. Разводить сами раскладки нельзя:
    // «облако» тогда обступает камеру и читается как каша вплотную к зрителю.
    this._K = Math.sqrt(this._forms.length / 53);
    this._R = 6.4 * this._K;
    this._camera.position.z = CAM_Z.cloud * this._K;
    this._group = new THREE.Group();
    this._scene.add(this._group);

    // детерминированный псевдослучай: раскладка одинакова от запуска к запуску,
    // иначе после каждого перезапуска киоска «облако» выглядит другим объектом
    let seed = 1;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    this._rv = this._forms.map(() => ({ x: rng() * 2 - 1, y: rng() * 2 - 1, z: rng() * 2 - 1, sp: 0.6 + rng() * 0.8 }));

    // слой цитат — общий модуль V2 (window.Quotes); без него сцена работает как есть
    if (globalThis.Quotes && !this._quotes) {
      try {
        const doc = (ctx && ctx.data && ctx.data.quotes)
          || await fetch("../data/mtk38-quotes.json").then((r) => r.json());
        const list = (doc.quotes || []).filter((q) => q.show !== false);
        this._quotes = globalThis.Quotes.create({ quotes: list, on: false, mode: "center" });
      } catch (e) { console.warn("[quotes off]", e); }
    }

    this._sprites = [];
    this._targets = [];
    this._texCache = new Map();
    this._layout = "cloud";
    this._build();

    this._u = { ca: tsl.uniform(0.25) };
    try {
      const p = new THREE.PostProcessing(gpu.renderer);
      const sp = tsl.pass(this._scene, this._camera);
      const baseTex = tsl.convertToTexture(sp.getTextureNode("output"));
      let out = baseTex;
      if (post.bloom) {
        try { this._bloom = post.bloom(baseTex, 0.85, 0.55, 0.7); out = baseTex.add(this._bloom); }
        catch (e) { console.warn("[bloom off]", e); }
      }
      p.outputNode = out;
      this._post = p;
    } catch (e) { console.warn("[post off]", e); this._post = null; }

    this._bind();
    this._syncPills();
    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(root);
    this._fit();
    /* Подсказку вешаем на СЛОЙ СЦЕНЫ, а не на канвас: div внутри <canvas> —
     * fallback-контент, браузер его не рисует. Подпись берём из словаря и
     * обновляем в setLang: иначе на EN/ZH вся сцена переведена, а призыв
     * к жесту остаётся русским (умолчание кита). */
    this._hint = attachHint(this._app, root, { gesture: "drag", label: this._hintLabel() });

    this.setLang(ctx && ctx.lang);
    this.applySettings(this._cfg || {});
    this._prev = performance.now();
    this.resume();
  },

  unmount() {
    this._mountStarted = false;
    this.pause();
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._hint && this._hint.destroy) this._hint.destroy();
    this._hint = null;
    this._unbind();
    if (this._card) { this._card.destroy(); this._card = null; }
    detachCanvas(this._gpu);
    for (const sp of this._sprites) { sp.material.dispose(); }
    for (const t of this._texCache.values()) t.texture.dispose();
    this._texCache.clear();
    this._sprites = []; this._targets = [];
    if (this._post) { this._post.dispose && this._post.dispose(); this._post = null; }
    this._scene = this._camera = this._group = null;
    if (this._root) this._root.remove();
    this._root = null;
  },

  /* Слушатели ввода живут только пока сцена активна. Общий канвас один на три
   * GPU-сцены, и если не снимать их на паузе, то в «Дожде» перетаскивание
   * заодно крутило бы невидимый глобус, а один тап открывал бы две карточки. */
  pause() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    this._unbind();
    // цитаты живут поверх ВСЕГО приложения, поэтому уходят вместе со сценой
    if (this._quotes) this._quotes.setEnabled(false);
  },

  resume() {
    if (this._raf || !this._scene) return;
    // забираем общий канвас обратно: пока сцена ждала, он был у соседки
    if (attachCanvas(this._gpu, this._root)) this._fit();
    if (!this._h) this._bind();
    if (this._quotes && this._cfg && this._cfg.quotesOn) this._quotes.setEnabled(true);
    this._prev = performance.now();
    const step = async () => { this._raf = requestAnimationFrame(step); await this._frame(); };
    this._raf = requestAnimationFrame(step);
  },

  reset() {
    if (this._card) this._card.close();
    this._setLayout("cloud");
  },

  /* Контракт ядра: standby() без аргумента, возврат — стоп-функция аттрактора.
   * Отдаём тротлённую петлю (timings.standbyFps): зритель издалека видит саму
   * сцену, а не оверлей ядра, при этом GPU ночью не молотит на 60 кадрах. */
  standby() {
    this.pause();
    if (this._card) this._card.close();
    this._standby = true;
    const tick = () => this._frame();
    // раскладки сменяют друг друга — сцена в заставке не должна замирать
    clearInterval(this._auto);
    this._auto = setInterval(() => {
      const i = LAYOUTS.indexOf(this._layout);
      this._setLayout(LAYOUTS[(i + 1) % LAYOUTS.length]);
    }, 12000);
    return beginStandby(this._app, tick, () => {
      clearInterval(this._auto); this._auto = 0;
      this._standby = false;
    });
  },

  setLang(lang) {
    this._lang = lang || this._lang || "ru";
    const T = {
      ru: { kicker: "МТК 38 · Ленин на языках мира", title: "Композиции",
            lab: "композиция", cloud: "облако", mandala: "мандала", ticker: "лента", wall: "стена",
            sub: (n) => `${n} написаний в четырёх раскладках. Тяни — поворот. Тап по слову — карточка языка и издания на нём.` },
      en: { kicker: "MTK 38 · Lenin in the world's languages", title: "Compositions",
            lab: "layout", cloud: "cloud", mandala: "mandala", ticker: "ticker", wall: "wall",
            sub: (n) => `${n} written forms in four layouts. Drag to rotate, tap a word for its card.` },
      zh: { kicker: "МТК 38 · 世界语言中的列宁", title: "构图",
            lab: "构图", cloud: "云", mandala: "曼陀罗", ticker: "字幕带", wall: "墙",
            sub: (n) => `${n} 种写法的四种排布。拖动旋转，点按查看卡片。` },
    }[this._lang];
    if (!T || !this._root) return;
    this._root.querySelector(".m38-kicker").textContent = T.kicker;
    this._root.querySelector(".m38-title").textContent = T.title;
    this._root.querySelector(".m38-sub").textContent = T.sub(this._forms.length);
    this._root.querySelector(".m38-pills__lab").textContent = T.lab;
    for (const b of this._root.querySelectorAll("[data-layout]")) {
      b.textContent = T[b.getAttribute("data-layout")];
    }
    this._syncCardLang();
    if (this._hint && this._hint.setLabel) this._hint.setLabel(this._hintLabel());
  },

  _hintLabel() { return this._app ? this._app.t("hint.compositions") : null; },

  _syncCardLang() { if (this._card && this._card.setLang) this._card.setLang(); },

  setA11y(on) { if (this._root) this._root.classList.toggle("is-a11y", !!on); },

  healthcheck() {
    /* «Не смонтирована» — зелёное только если монтирования и не начинали.
     * Начали и не доехали (ядро проглотило исключение) — красное. */
    if (!this._root) {
      return this._mountStarted
        ? { ok: false, detail: "монтирование не завершилось — слой пуст" }
        : { ok: true, detail: "не смонтирована" };
    }
    if (!this._scene) return { ok: false, detail: "монтирование не завершилось — сцены нет" };
    const bad = offScreen(this._root) ? null
      : bufferComplaint(this._gpu && this._gpu.canvas, this._dpr, this._root);
    if (bad) return { ok: false, detail: bad };
    const n = this._sprites.length;
    if (!n) return { ok: false, detail: "в сцене ни одного написания" };
    /* Спрайты долетают до целей лерпом — на проверке они законно в пути. */
    return { ok: true, detail: `написаний ${n}, раскладка «${this._layout}»`
      + (this._quotes && this._cfg && this._cfg.quotesOn ? ", цитаты включены" : "") };
  },

  states() {
    return LAYOUTS.map((k) => ({ name: "раскладка: " + k, apply: () => this._setLayout(k) }));
  },

  applySettings(values) {
    this._cfg = Object.assign({}, this._cfg, values || {});
    if (!this._scene) return;
    for (const s of this.settings) {
      const v = this._cfg[s.key] ?? s.default;
      if (v != null) this._apply(s.key, v);
    }
  },

  /* ── внутреннее ─────────────────────────────────────────────────── */

  _apply(k, v) {
    const THREE = this._gpu.THREE, r = this._gpu.renderer;
    switch (k) {
      case "speed": this._speed = v; break;
      case "size": this._size = v; this._scale(); break;
      case "depth": this._depth = v; break;
      case "brass": case "red": this._cfg[k] = v; this._recolor(); break;
      case "exposure": r.toneMappingExposure = v; break;
      case "bloom": if (this._bloom) this._bloom.strength.value = v; break;
      case "bloomThr": if (this._bloom) this._bloom.threshold.value = v; break;
      case "bloomRadius": if (this._bloom && this._bloom.radius) this._bloom.radius.value = v; break;
      case "cloudDensity":
        // плотнее облако — теснее разброс; пересобираем цели только для него
        if (this._layout === "cloud") { this._computeTargets(); }
        break;
      case "fog": case "bg": {
        const s = Math.round(this._cfg.bg ?? 44);
        const col = new THREE.Color(`rgb(${s - 6},${s + 6},${s + 13})`);
        this._scene.background = col;
        this._scene.fog = new THREE.FogExp2(col.getHex(), (this._cfg.fog ?? 0.22) * 0.06);
        break;
      }
      case "grain": this._root.style.setProperty("--m38-grain", v); break;
      case "vign": this._root.style.setProperty("--m38-vign", v); break;
      default:
        // ключи цитат модуль разбирает сам (quotesOn / quoteMode / qGlow / …)
        if (this._quotes) this._quotes.handle(k, v);
    }
  },

  _tex(text, sc, color) {
    const key = text + "|" + color;
    let t = this._texCache.get(key);
    if (!t) { t = this._mkTex(this._gpu.THREE, { text, script: sc, color }); this._texCache.set(key, t); }
    return t;
  },

  _tone(i) {
    const c = this._cfg || {};
    const h = (i * 131) % 100;
    if (h < (c.red ?? 5)) return PAL.red;
    if (h < (c.red ?? 5) + (c.brass ?? 34)) return PAL.brass;
    return TONES[i % 2];
  },

  _build() {
    const THREE = this._gpu.THREE;
    this._forms.forEach((d, i) => {
      const { texture, aspect } = this._tex(d.w, d.sc, this._tone(i));
      const baseOp = 0.55 + (d.wt - 1) * 0.2;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture, transparent: true, depthWrite: false, fog: true, opacity: baseOp,
      }));
      sp.userData = { i, aspect, baseOp };
      this._group.add(sp);
      this._sprites.push(sp);
      this._targets.push(new THREE.Vector3());
    });
    this._scale();
    this._computeTargets();
    this._sprites.forEach((s, i) => s.position.copy(this._targets[i]));
  },

  _scale() {
    const k = this._size ?? 1;
    this._sprites.forEach((sp, i) => {
      const s = (0.9 + this._forms[i].wt * 0.5) * k;
      sp.scale.set(s * sp.userData.aspect, s, 1);
    });
  },

  _recolor() {
    this._sprites.forEach((sp, i) => {
      const { texture, aspect } = this._tex(this._forms[i].w, this._forms[i].sc, this._tone(i));
      sp.material.map = texture;
      sp.userData.aspect = aspect;
      sp.material.needsUpdate = true;
    });
    this._scale();
  },

  _computeTargets() {
    const N = this._forms.length, gold = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const t = this._targets[i], d = this._forms[i], rv = this._rv[i];
      if (this._layout === "cloud") {
        const k = 1 / (this._cfg && this._cfg.cloudDensity ? this._cfg.cloudDensity : 1);
        t.set(rv.x * 8 * k, rv.y * 5.5 * k, rv.z * 8 * k);
      }
      else if (this._layout === "mandala") {
        const ring = 1 + (i % 5), a = gold * i, rr = ring * 1.5;
        t.set(Math.cos(a) * rr, Math.sin(a) * rr, (d.wt - 2) * 0.6);
      } else if (this._layout === "wall") {
        const cols = Math.ceil(Math.sqrt(N * 1.7)), rows = Math.ceil(N / cols);
        t.set(((i % cols) - (cols - 1) / 2) * 2.4, ((rows - 1) / 2 - Math.floor(i / cols)) * 1.5, rv.z * 0.6);
      } else {   // ticker
        const rowN = 7, row = i % rowN;
        t.set(rv.x * 8.5, ((rowN - 1) / 2 - row) * 1.6, rv.z * 3);
      }
    }
  },

  _setLayout(k) {
    this._layout = k;
    this._camera.position.z = (CAM_Z[k] || 18) * this._K;
    this._computeTargets();
    this._group.rotation.set(0, 0, 0);
    this._vx = this._vy = 0;
    this._syncPills();
  },

  _syncPills() {
    if (!this._root) return;
    for (const b of this._root.querySelectorAll("[data-layout]")) {
      b.setAttribute("aria-checked", b.getAttribute("data-layout") === this._layout ? "true" : "false");
    }
  },

  _fit() {
    if (!this._gpu || !this._root) return;
    // dpr держим у себя: healthcheck сверяет буфер с ожиданием по ФАКТИЧЕСКОМУ
    // масштабу, а он ниже единицы, когда кап 8.3 Мп режет крупный бокс
    this._dpr = fitTo(this._gpu.renderer, this._camera, this._root).dpr;
    if (this._post) this._post.needsUpdate = true;
  },

  _bind() {
    const cv = this._gpu.canvas;
    const S = { drag: false, lx: 0, ly: 0, dx0: 0, dy0: 0, t0: 0, moved: false };
    this._vx = this._vy = 0; this._dir = 1;
    this._h = {
      down: (e) => {
        S.drag = true; S.moved = false;
        S.lx = S.dx0 = e.clientX; S.ly = S.dy0 = e.clientY; S.t0 = performance.now();
        this._vx = this._vy = 0;
        cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      },
      move: (e) => {
        if (!S.drag) return;
        const dx = e.clientX - S.lx, dy = e.clientY - S.ly;
        S.lx = e.clientX; S.ly = e.clientY;
        if (Math.hypot(e.clientX - S.dx0, e.clientY - S.dy0) > 10) S.moved = true;
        this._vy = dx * 0.005; this._vx = dy * 0.005;
        if (dx) this._dir = dx < 0 ? -1 : 1;
        this._group.rotation.y += this._vy;
        this._group.rotation.x += this._vx;
      },
      up: (e) => {
        if (S.drag && !S.moved && performance.now() - S.t0 < 450) this._tap(e.clientX, e.clientY);
        S.drag = false;
      },
      pill: (e) => {
        const b = e.target.closest("[data-layout]");
        if (b) this._setLayout(b.getAttribute("data-layout"));
      },
    };
    cv.addEventListener("pointerdown", this._h.down);
    cv.addEventListener("pointermove", this._h.move, { passive: true });
    cv.addEventListener("pointerup", this._h.up);
    cv.addEventListener("pointercancel", () => { S.drag = false; });
    this._root.querySelector(".m38-pills").addEventListener("click", this._h.pill);
  },

  _unbind() {
    if (!this._h) return;
    const cv = this._gpu && this._gpu.canvas;
    if (cv) {
      cv.removeEventListener("pointerdown", this._h.down);
      cv.removeEventListener("pointermove", this._h.move);
      cv.removeEventListener("pointerup", this._h.up);
    }
    const pills = this._root && this._root.querySelector(".m38-pills");
    if (pills) pills.removeEventListener("click", this._h.pill);
    this._h = null;
  },

  _tap(cx, cy) {
    const THREE = this._gpu.THREE;
    const r = this._gpu.canvas.getBoundingClientRect();
    this._ray = this._ray || new THREE.Raycaster();
    this._v2 = this._v2 || new THREE.Vector2();
    this._v2.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._scene.updateMatrixWorld();
    this._ray.setFromCamera(this._v2, this._camera);
    const h = this._ray.intersectObjects(this._sprites, false)[0];
    if (h && h.object.userData.i != null) this._card.open(this._forms[h.object.userData.i]);
    else this._card.close();
  },

  async _frame() {
    if (!this._scene) return;
    // ResizeObserver в фоне молчит — держим размер из штатного пути кадра
    if (pollSize(this, this._root)) this._fit();
    const now = performance.now();
    const dtms = Math.min(40, now - this._prev);
    this._prev = now;
    const speed = (this._speed ?? 1) * (this._standby ? 1.5 : 1);
    const N = this._forms.length;

    this._group.rotation.y += this._vy; this._vy *= 0.95;
    this._group.rotation.x += this._vx; this._vx *= 0.92;
    if (Math.abs(this._vx) < 1e-4) this._vx = 0;
    const base = speed * 0.0016;
    if (this._layout === "cloud") { if (this._vy > -base && this._vy < base) this._vy = base * this._dir; }
    else if (this._layout === "mandala") this._group.rotation.z += speed * 0.0009;
    else this._group.rotation.x *= 0.95;

    if (this._layout === "ticker") {
      for (let i = 0; i < N; i++) {
        const dir = (i % 7) % 2 ? 1 : -1;
        const t = this._targets[i];
        t.x += dir * this._rv[i].sp * speed * 0.012 * dtms;
        const lim = 9;
        if (t.x > lim) t.x = -lim; else if (t.x < -lim) t.x = lim;
      }
    }
    for (let i = 0; i < N; i++) this._sprites[i].position.lerp(this._targets[i], 0.06);

    // затухание дальних — глубина без честного DOF, дёшево и предсказуемо
    const fade = this._depth ?? 0.55, R = this._R, R2 = 2 * R;
    const e = (this._e = this._e || new this._gpu.THREE.Vector3());
    for (const sp of this._sprites) {
      e.copy(sp.position).applyEuler(this._group.rotation);
      const t = Math.max(0, Math.min(1, (e.z + R) / R2));
      sp.material.opacity = sp.userData.baseOp * ((1 - fade) + fade * Math.pow(t, 1.4));
    }

    if (this._post) await this._post.renderAsync();
    else await this._gpu.renderer.renderAsync(this._scene, this._camera);
  },
};
