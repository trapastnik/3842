/* МТК 38 · сцена «Глобус» — имя, обернувшее планету.
 *
 * Написания стоят кольцами по параллелям вокруг географического шара, у
 * которого своя скорость вращения: параллакс между слоем имён и Землёй читается
 * как глубина. Тяни — поворот, тап по слову — карточка.
 *
 * Сцена по умолчанию, поэтому единственная, что грузит WebGPU на старте.
 * Кольца строятся по ФОРМАМ (60), а не по языкам (128), иначе половина сферы —
 * повторяющиеся «Ленин» и «Lenin».
 */
import { loadData, PAL, beginStandby, pollSize, bufferComplaint, offScreen, hushHint, attachHint } from "./shared.js?v=23";
import { createCard } from "./card.js?v=23";
import { ensureGPU, loadPostNodes, fitTo, attachCanvas, detachCanvas } from "./gpu.js?v=23";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RADIUS = 2.5;
const BASE_INSTANCES = 760;

export const globeScene = {
  id: "globe",
  title: { ru: "Глобус", en: "Globe", zh: "地球仪" },

  settings: [
    { key: "spin", label: { ru: "Вращение" }, type: "range", min: 0, max: 1.2, step: 0.01, default: 0.06 },
    { key: "density", label: { ru: "Плотность слов" }, type: "range", min: 0.5, max: 2.2, step: 0.05, default: 1 },
    { key: "earthSpin", label: { ru: "Скорость Земли" }, type: "range", min: 0, max: 0.5, step: 0.005, default: 0.028 },
    { key: "earthGlow", label: { ru: "Яркость линий" }, type: "range", min: 0, max: 1.5, step: 0.05, default: 0.7 },
    { key: "earthBorders", label: { ru: "Границы на растре" }, type: "toggle", default: false },
    { key: "exposure", label: { ru: "Экспозиция" }, type: "range", min: 0.4, max: 1.8, step: 0.02, default: 1 },
    { key: "bloom", label: { ru: "Свечение" }, type: "range", min: 0, max: 2, step: 0.02, default: 0.5 },
    { key: "bloomThr", label: { ru: "Порог свечения" }, type: "range", min: 0, max: 1, step: 0.02, default: 0.82 },
    { key: "atmo", label: { ru: "Атмосфера" }, type: "range", min: 0, max: 3, step: 0.05, default: 1 },
    { key: "dofBokeh", label: { ru: "DOF боке" }, type: "range", min: 0, max: 3, step: 0.05, default: 0 },
    { key: "dofFocus", label: { ru: "DOF фокус" }, type: "range", min: 4, max: 13, step: 0.1, default: 8.2 },
    { key: "ca", label: { ru: "Аберрация" }, type: "range", min: 0, max: 3, step: 0.05, default: 0.4 },
    { key: "fog", label: { ru: "Туман" }, type: "range", min: 0, max: 0.06, step: 0.002, default: 0.021 },
    { key: "grain", label: { ru: "Зерно" }, type: "range", min: 0, max: 0.2, step: 0.005, default: 0.07 },
    { key: "vign", label: { ru: "Виньетка" }, type: "range", min: 0, max: 1, step: 0.02, default: 1 },
  ],

  /* Всё тяжёлое — до сплэша. Посетитель не должен ждать загрузку у экрана,
   * а стенд приёмки требует тишины в сети после старта. */
  preload: {
    /* Каждый ВЕС отдельно: канва не запускает загрузку шрифта сама, а
     * «20 Kopeek 600» — отдельный файл. Без этой строки первые кадры каталога,
     * карты и дождя рисуют жирные подписи фолбэком (GRABLI.md · Шрифты). */
    fonts: [
      "400 1em '20 Kopeek'", "600 1em '20 Kopeek'",
      "400 1em 'Nolde'",
      "400 1em '21 Cent'", "700 1em '21 Cent'",
    ],
    custom: async () => { await Promise.all([ensureGPU(), loadData()]); },
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
    this._nLangs = data.langs.length;

    const root = document.createElement("div");
    root.className = "m38-scene m38-globe";
    root.innerHTML =
      '<div class="m38-vign"></div><div class="m38-grain"></div>' +
      '<header class="m38-head"><div class="m38-kicker"></div>' +
      '<h1 class="m38-title"></h1><p class="m38-sub"></p></header>' +
      '<nav class="m38-pills" role="radiogroup"><span class="m38-pills__lab"></span>' +
      '<button type="button" class="m38-pill kiosk-target" data-earth="countries"></button>' +
      '<button type="button" class="m38-pill kiosk-target" data-earth="relief"></button>' +
      '<button type="button" class="m38-pill kiosk-target" data-earth="physical"></button></nav>';
    el.appendChild(root);
    this._root = root;
    this._card = createCard({ publications: data.pubs, t: (k) => (this._app ? this._app.t(k) : null),
      lang: () => (this._app ? this._app.lang : "ru") });

    // глифы растеризуются в текстуры — без готовых шрифтов получим тофу
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }

    const gpu = await ensureGPU();
    this._gpu = gpu;
    const THREE = gpu.THREE;
    attachCanvas(gpu, root);

    const [globeMod, earthMod, tsl, post] = await Promise.all([
      import("../../mtk38-v3/scenes/globe-rings.js"),
      import("../../mtk38-v3/scenes/earth.js"),
      Promise.resolve(gpu.TSL),
      loadPostNodes(),
    ]);
    this._mkGlobe = globeMod.createGlobe;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12161a);
    scene.fog = new THREE.FogExp2(0x12161a, 0.021);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 8.2);
    camera.lookAt(0, 0, 0);
    this._scene = scene; this._camera = camera;

    this._globe = globeMod.createGlobe(THREE, {
      words: this._forms, radius: RADIUS, maxInstances: BASE_INSTANCES, density: 1, withBody: false,
    });
    scene.add(this._globe.group);

    this._earthMode = "countries";
    this._earthBorders = false;
    this._earthYaw = -0.25;
    this._earthSpin = 0.028;
    try {
      this._earth = await earthMod.createEarth(THREE, {
        radius: RADIUS * 0.965, mode: this._earthMode,
        geoUrl: "../mtk38-v3/geo/countries.geojson",
      });
      scene.add(this._earth.group);
    } catch (e) { console.warn("[earth off]", e); this._earth = null; }

    scene.add(new THREE.AmbientLight(0x9da3a8, 0.45));
    const key = new THREE.DirectionalLight(0xf7f9ef, 1.7); key.position.set(-4, 5, 4); scene.add(key);
    const warm = new THREE.PointLight(0xd2b773, 16, 32); warm.position.set(5, -2, 3); scene.add(warm);
    scene.add(this._makeHalo(THREE));

    this._u = {
      dofFocus: tsl.uniform(8.2), dofRange: tsl.uniform(6), dofBokeh: tsl.uniform(0),
      ca: tsl.uniform(0.4), atmo: tsl.uniform(1),
    };

    // латунный лимб — fresnel-оболочка, аддитивно
    try {
      const m = new THREE.MeshBasicNodeMaterial();
      m.transparent = true; m.depthWrite = false; m.depthTest = false;
      m.side = THREE.FrontSide; m.blending = THREE.AdditiveBlending;
      const fres = tsl.float(1).sub(tsl.normalView.dot(tsl.positionViewDirection).max(0)).pow(2.6);
      m.colorNode = tsl.vec3(0.823, 0.718, 0.451);
      m.opacityNode = fres.mul(this._u.atmo);
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.045, 64, 48), m);
      atmo.renderOrder = 5; scene.add(atmo);
      this._atmo = atmo;
    } catch (e) { console.warn("[atmo off]", e); }

    this._buildPost(THREE, tsl, post);
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
    // сцену разбираем, рендерер — нет: он общий и живёт всё время работы киоска
    if (this._globe) { this._globe.dispose(); this._globe = null; }
    if (this._earth) { this._earth.dispose(); this._earth = null; }
    if (this._post) { this._post.dispose && this._post.dispose(); this._post = null; }
    this._scene = this._camera = null;
    if (this._root) this._root.remove();
    this._root = null;
  },

  /* Слушатели ввода живут только пока сцена активна. Общий канвас один на три
   * GPU-сцены, и если не снимать их на паузе, то в «Дожде» перетаскивание
   * заодно крутило бы невидимый глобус, а один тап открывал бы две карточки. */
  pause() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    this._unbind();
  },

  resume() {
    hushHint(this._hint);
    if (this._raf || !this._scene) return;
    // забираем общий канвас обратно: пока сцена ждала, он был у соседки
    if (attachCanvas(this._gpu, this._root)) this._fit();
    if (!this._h) this._bind();
    this._prev = performance.now();
    const step = async () => {
      this._raf = requestAnimationFrame(step);
      await this._frame();
    };
    this._raf = requestAnimationFrame(step);
  },

  reset() {
    if (this._card) this._card.close();
    this._R = { yaw: -0.25, pitch: -0.14, vy: 0.10, vp: 0, drag: false, lx: 0, ly: 0, lt: 0, dx0: 0, dy0: 0, dt0: 0, moved: false };
    this._earthYaw = -0.25;
    this._earthMode = "countries";
    if (this._earth) this._earth.setMode(this._earthMode, this._earthBorders);
    this._syncPills();
  },

  /* Контракт ядра: standby() без аргумента, возврат — стоп-функция аттрактора.
   * Отдаём тротлённую петлю (timings.standbyFps): зритель издалека видит саму
   * сцену, а не оверлей ядра, при этом GPU ночью не молотит на 60 кадрах. */
  standby() {
    this.pause();                       // 60-FPS петля и слушатели ввода — прочь
    if (this._card) this._card.close();
    this._standby = true;               // в кадре: вращение вдвое живее
    return beginStandby(this._app, () => this._frame(), () => { this._standby = false; });
  },

  setLang(lang) {
    this._lang = lang || this._lang || "ru";
    const T = {
      ru: { kicker: "МТК 38 · Ленин на языках мира", title: "Имя, обернувшее планету",
            lab: "земля", countries: "страны", relief: "рельеф", physical: "физическая",
            sub: (f, l) => `${f} написаний «Ленин» на ${l} языках, кольцами по параллелям. Тяни — поворот. Тап по слову — карточка языка и издания на нём.` },
      en: { kicker: "MTK 38 · Lenin in the world's languages", title: "A name that wrapped the planet",
            lab: "earth", countries: "countries", relief: "relief", physical: "physical",
            sub: (f, l) => `${f} written forms of “Lenin” in ${l} languages, ringed along the parallels. Drag to rotate, tap a word for its card.` },
      zh: { kicker: "МТК 38 · 世界语言中的列宁", title: "环绕地球的名字",
            lab: "地球", countries: "国界", relief: "地形", physical: "自然",
            sub: (f, l) => `${l} 种语言中「列宁」的 ${f} 种写法，沿纬线成环。拖动旋转，点按查看卡片。` },
    }[this._lang];
    if (!T || !this._root) return;
    this._root.querySelector(".m38-kicker").textContent = T.kicker;
    this._root.querySelector(".m38-title").textContent = T.title;
    this._root.querySelector(".m38-sub").textContent = T.sub(this._forms.length, this._nLangs);
    this._root.querySelector(".m38-pills__lab").textContent = T.lab;
    for (const b of this._root.querySelectorAll("[data-earth]")) {
      b.textContent = T[b.getAttribute("data-earth")];
    }
    this._syncCardLang();
    if (this._hint && this._hint.setLabel) this._hint.setLabel(this._hintLabel());
  },

  _hintLabel() { return this._app ? this._app.t("hint.globe") : null; },

  _syncCardLang() { if (this._card && this._card.setLang) this._card.setLang(); },

  setA11y(on) { if (this._root) this._root.classList.toggle("is-a11y", !!on); },

  /* Готов ли ПОКАЗАТЬ, а не «что было в последнем кадре»: сцена законно
   * встречает проверку на любом повороте и в любой фазе вращения. */
  healthcheck() {
    /* «Не смонтирована» — зелёное только если монтирования и не начинали.
     * Начали и не доехали (ядро проглотило исключение) — красное. */
    if (!this._root) {
      return this._mountStarted
        ? { ok: false, detail: "монтирование не завершилось — слой пуст" }
        : { ok: true, detail: "не смонтирована" };
    }
    if (!this._scene) return { ok: false, detail: "монтирование не завершилось — сцены нет" };
    const n = (this._globe && this._globe.count) || 0;
    if (!n) return { ok: false, detail: "кольца пусты: ни одного написания в сцене" };
    if (offScreen(this._root)) {
      return { ok: true, detail: `надписей в кольцах ${n}, слой не на экране` };
    }
    const bad = bufferComplaint(this._gpu && this._gpu.canvas, this._dpr, this._root);
    if (bad) return { ok: false, detail: bad };
    /* count — это ЭКЗЕМПЛЯРЫ на кольцах: 60 форм повторяются по параллелям,
     * поэтому число законно больше числа написаний. */
    return { ok: true, detail: `надписей в кольцах ${n} (${this._forms.length} форм), `
      + `земля «${this._earthMode}»` + (this._earth ? "" : " (текстуры не поднялись)") };
  },

  /* Перебор для sweep: подложка Земли — выбор посетителя, в схеме её нет. */
  states() {
    return ["countries", "relief", "physical"].map((m) => ({
      name: "земля: " + m,
      apply: () => {
        this._earthMode = m;
        if (this._earth) this._earth.setMode(m, this._earthBorders);
        this._syncPills();
      },
    }));
  },

  applySettings(values) {
    this._cfg = Object.assign({}, this._cfg, values || {});
    const c = this._cfg;
    if (!this._scene) return;
    const set = (k, v) => { if (v != null) this._apply(k, v); };
    for (const s of this.settings) set(s.key, c[s.key] ?? s.default);
  },

  /* ── внутреннее ─────────────────────────────────────────────────── */

  _apply(k, v) {
    const r = this._gpu && this._gpu.renderer;
    switch (k) {
      case "spin": this._autoSpin = v; break;
      case "density": this._setDensity(v); break;
      case "exposure": if (r) r.toneMappingExposure = v; break;
      case "bloom": if (this._bloom) this._bloom.strength.value = v; break;
      case "bloomThr": if (this._bloom) this._bloom.threshold.value = v; break;
      case "atmo": this._u.atmo.value = v; break;
      case "dofBokeh": this._u.dofBokeh.value = v; break;
      case "dofFocus": this._u.dofFocus.value = v; break;
      case "ca": this._u.ca.value = v; break;
      case "fog": if (this._scene && this._scene.fog) this._scene.fog.density = v; break;
      case "grain": this._root && this._root.style.setProperty("--m38-grain", v); break;
      case "vign": this._root && this._root.style.setProperty("--m38-vign", v); break;
      case "earthSpin": this._earthSpin = v; break;
      case "earthGlow": if (this._earth) this._earth.setGlow(v); break;
      case "earthBorders":
        this._earthBorders = !!v;
        if (this._earth) this._earth.setMode(this._earthMode, this._earthBorders);
        break;
    }
  },

  _makeHalo(THREE) {
    const s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const x = cv.getContext("2d");
    const g = x.createRadialGradient(s / 2, s / 2, s * 0.16, s / 2, s / 2, s * 0.5);
    g.addColorStop(0, "rgba(210,183,115,0.34)");
    g.addColorStop(0.45, "rgba(210,183,115,0.10)");
    g.addColorStop(1, "rgba(210,183,115,0)");
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: t, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
    }));
    sp.scale.set(7.4, 7.4, 1); sp.position.set(0, 0, -2); sp.renderOrder = -10;
    return sp;
  },

  _buildPost(THREE, tsl, nodes) {
    try {
      const p = new THREE.PostProcessing(this._gpu.renderer);
      const sp = tsl.pass(this._scene, this._camera);
      const col = sp.getTextureNode("output");
      let base = col;
      if (nodes.dof) {
        try { base = nodes.dof(col, sp.getViewZNode(), this._u.dofFocus, this._u.dofRange, this._u.dofBokeh); }
        catch (e) { console.warn("[dof off]", e); base = col; }
      }
      const baseTex = tsl.convertToTexture(base);
      let out = baseTex;
      if (nodes.bloom) {
        try { this._bloom = nodes.bloom(baseTex, 0.5, 0.42, 0.82); out = baseTex.add(this._bloom); }
        catch (e) { console.warn("[bloom off]", e); }
      }
      if (nodes.ca) {
        try { out = nodes.ca(out, this._u.ca, tsl.vec2(0.5, 0.5), 1.1); }
        catch (e) { console.warn("[ca off]", e); }
      }
      p.outputNode = out;
      this._post = p;
    } catch (e) { console.warn("[post off]", e); this._post = null; }
  },

  // перестройка глобуса дорогая — копим движения ползунка
  _setDensity(d) {
    if (this._density === d) return;
    this._density = d;
    clearTimeout(this._densityTimer);
    this._densityTimer = setTimeout(() => {
      if (!this._scene || !this._mkGlobe) return;
      const old = this._globe;
      this._scene.remove(old.group);
      this._globe = this._mkGlobe(this._gpu.THREE, {
        words: this._forms, radius: RADIUS,
        maxInstances: Math.round(BASE_INSTANCES * d), density: d, withBody: false,
      });
      this._scene.add(this._globe.group);
      old.dispose();
    }, 180);
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
    this._R = this._R || { yaw: -0.25, pitch: -0.14, vy: 0.10, vp: 0, drag: false, lx: 0, ly: 0, lt: 0, dx0: 0, dy0: 0, dt0: 0, moved: false };
    const R = this._R;
    this._h = {
      down: (e) => {
        R.drag = true; R.moved = false; R.lx = e.clientX; R.ly = e.clientY; R.lt = performance.now();
        R.dx0 = e.clientX; R.dy0 = e.clientY; R.dt0 = R.lt;
        cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      },
      move: (e) => {
        if (!R.drag) return;
        if (Math.hypot(e.clientX - R.dx0, e.clientY - R.dy0) > 6) R.moved = true;
        const now = performance.now(), dt = Math.max(16, now - R.lt);
        const dx = e.clientX - R.lx, dy = e.clientY - R.ly;
        R.yaw += dx * 0.005; this._earthYaw += dx * 0.005;
        R.pitch = clamp(R.pitch + dy * 0.005, -1.15, 1.15);
        R.vy = dx * 0.005 / (dt / 1000); R.vp = dy * 0.005 / (dt / 1000);
        R.lx = e.clientX; R.ly = e.clientY; R.lt = now;
      },
      up: (e) => {
        if (R.drag && !R.moved && performance.now() - R.dt0 < 400) this._tap(e.clientX, e.clientY);
        R.drag = false;
      },
      cancel: () => { R.drag = false; },
      pill: (e) => {
        const b = e.target.closest("[data-earth]");
        if (!b) return;
        this._earthMode = b.getAttribute("data-earth");
        if (this._earth) this._earth.setMode(this._earthMode, this._earthBorders);
        this._syncPills();
      },
    };
    cv.addEventListener("pointerdown", this._h.down);
    cv.addEventListener("pointermove", this._h.move, { passive: true });
    cv.addEventListener("pointerup", this._h.up);
    cv.addEventListener("pointercancel", this._h.cancel);
    this._root.querySelector(".m38-pills").addEventListener("click", this._h.pill);
  },

  _unbind() {
    if (!this._h) return;
    const cv = this._gpu && this._gpu.canvas;
    if (cv) {
      cv.removeEventListener("pointerdown", this._h.down);
      cv.removeEventListener("pointermove", this._h.move);
      cv.removeEventListener("pointerup", this._h.up);
      cv.removeEventListener("pointercancel", this._h.cancel);
    }
    const pills = this._root && this._root.querySelector(".m38-pills");
    if (pills) pills.removeEventListener("click", this._h.pill);
    this._h = null;
  },

  _syncPills() {
    if (!this._root) return;
    for (const b of this._root.querySelectorAll("[data-earth]")) {
      b.setAttribute("aria-checked", b.getAttribute("data-earth") === this._earthMode ? "true" : "false");
    }
  },

  _tap(cx, cy) {
    const THREE = this._gpu.THREE;
    const r = this._gpu.canvas.getBoundingClientRect();
    this._ray = this._ray || new THREE.Raycaster();
    this._ndc = this._ndc || new THREE.Vector2();
    this._ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this._camera);
    // FrontSide → в попадания идут только обращённые к зрителю слова
    const hit = this._ray.intersectObjects(this._globe.meshes, false)[0];
    if (hit && hit.object.userData.wi != null) this._card.open(this._forms[hit.object.userData.wi]);
    else this._card.close();
  },

  async _frame() {
    if (!this._scene) return;
    // ResizeObserver в фоне молчит — держим размер из штатного пути кадра
    if (pollSize(this, this._root)) this._fit();
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._prev) / 1000);
    this._prev = now;
    const R = this._R;
    const spin = (this._autoSpin ?? 0.06) * (this._standby ? 2.2 : 1);
    if (!R.drag) {
      R.yaw += (R.vy + spin) * dt;
      R.pitch = clamp(R.pitch + R.vp * dt, -1.15, 1.15);
      R.vy *= Math.pow(0.94, dt * 60); R.vp *= Math.pow(0.9, dt * 60);
      this._earthYaw += this._earthSpin * dt;
    }
    this._globe.group.rotation.set(R.pitch, R.yaw, 0);
    if (this._earth) this._earth.group.rotation.set(R.pitch, this._earthYaw, 0);
    const rr = this._gpu.renderer;
    if (this._post) await this._post.renderAsync();
    else await rr.renderAsync(this._scene, this._camera);
  },
};
