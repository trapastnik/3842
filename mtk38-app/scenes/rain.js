/* МТК 38 · сцена «Дождь имён» — написания всплывают снизу вверх.
 *
 * Основной путь — GPU-compute (TSL, scenes/rain.js из v3): тысячи частиц,
 * отталкивание пальцем, попадание тапом через readback буфера позиций.
 *
 * Фоллбэк — Canvas 2D. Compute-шейдеров в WebGL2 нет, поэтому на машине без
 * WebGPU сцена не «деградирует по качеству», а физически не запускается. Для
 * киоска чёрный экран недопустим, и вместо него идёт честный 2D-дождь по тем же
 * данным и той же логике (плавучесть, ярусы, отталкивание, respawn).
 */
import { loadData, famWord, PAL, beginStandby, pollSize, bufferComplaint, offScreen, capDpr, attachHint } from "./shared.js?v=24";
import { createCard } from "./card.js?v=24";
import { ensureGPU, loadPostNodes, fitTo, attachCanvas, detachCanvas } from "./gpu.js?v=24";

const TONES = [PAL.paper, PAL.brass, PAL.red];
const TIERS = [0.34, 0.58, 0.95, 1.55];

export const rainScene = {
  id: "rain",
  title: { ru: "Дождь имён", en: "Rain of names", zh: "名字之雨" },

  settings: [
    { key: "count", label: { ru: "Количество" }, type: "range", min: 100, max: 4000, step: 50, default: 500 },
    { key: "speed", label: { ru: "Скорость" }, type: "range", min: 0.4, max: 6, step: 0.1, default: 2.4 },
    { key: "size", label: { ru: "Размер" }, type: "range", min: 0.4, max: 2.2, step: 0.05, default: 1 },
    { key: "repel", label: { ru: "Отталкивание" }, type: "range", min: 0, max: 30, step: 0.5, default: 11 },
    { key: "exposure", label: { ru: "Экспозиция" }, type: "range", min: 0.4, max: 1.8, step: 0.02, default: 1 },
    { key: "bloom", label: { ru: "Свечение" }, type: "range", min: 0, max: 2.5, step: 0.02, default: 0.26 },
    { key: "bloomThr", label: { ru: "Порог свечения" }, type: "range", min: 0, max: 1, step: 0.02, default: 0.78 },
    { key: "dofBokeh", label: { ru: "DOF боке" }, type: "range", min: 0, max: 3, step: 0.05, default: 0 },
    { key: "dofFocus", label: { ru: "DOF фокус" }, type: "range", min: 14, max: 40, step: 0.5, default: 26 },
    { key: "ca", label: { ru: "Аберрация" }, type: "range", min: 0, max: 2.5, step: 0.05, default: 0.3 },
    { key: "fog", label: { ru: "Туман" }, type: "range", min: 0, max: 0.03, step: 0.001, default: 0.005 },
    { key: "grain", label: { ru: "Зерно" }, type: "range", min: 0, max: 0.2, step: 0.005, default: 0.06 },
    { key: "vign", label: { ru: "Виньетка" }, type: "range", min: 0, max: 1, step: 0.02, default: 1 },
  ],

  preload: {
    custom: async () => {
      await Promise.all([
        ensureGPU(), loadData(),
        import("../../mtk38-v3/engine/atlas.js"),
        import("../../mtk38-v3/scenes/rain.js"),
      ]);
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
    root.className = "m38-scene m38-rain";
    root.innerHTML =
      '<div class="m38-vign"></div><div class="m38-grain"></div>' +
      '<header class="m38-head"><div class="m38-kicker"></div>' +
      '<h1 class="m38-title"></h1><p class="m38-sub"></p></header>';
    el.appendChild(root);
    this._root = root;
    this._card = createCard({ publications: data.pubs, t: (k) => (this._app ? this._app.t(k) : null),
      lang: () => (this._app ? this._app.lang : "ru") });

    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }

    const gpu = await ensureGPU();
    this._gpu = gpu;
    this._gpuMode = gpu.backend === "WebGPU";
    if (this._gpuMode) await this._mountGPU();
    else this._mount2D();

    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(root);
    this._fit();
    /* Подсказку вешаем на СЛОЙ СЦЕНЫ, а не на канвас: div внутри <canvas> —
     * fallback-контент, браузер его не рисует. Подпись берём из словаря и
     * обновляем в setLang: иначе на EN/ZH вся сцена переведена, а призыв
     * к жесту остаётся русским (умолчание кита). */
    this._hint = attachHint(this._app, root, { gesture: "tap", label: this._hintLabel() });

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
    if (this._gpuMode) {
      detachCanvas(this._gpu);
      if (this._rain) { this._scene.remove(this._rain.mesh); this._rain.mesh.geometry.dispose(); this._rain.mesh.material.dispose(); this._rain = null; }
      if (this._post) { this._post.dispose && this._post.dispose(); this._post = null; }
      this._scene = this._camera = null;
    }
    this._particles = null;
    if (this._root) this._root.remove();
    this._root = null; this._canvas = null;
  },

  /* Слушатели ввода живут только пока сцена активна. Общий канвас один на три
   * GPU-сцены, и если не снимать их на паузе, то в «Дожде» перетаскивание
   * заодно крутило бы невидимый глобус, а один тап открывал бы две карточки. */
  pause() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    this._unbind();
  },

  resume() {
    if (this._raf || !this._root) return;
    // GPU-путь делит канвас с глобусом и композициями — забираем его назад
    if (this._gpuMode && attachCanvas(this._gpu, this._root)) { this._canvas = this._gpu.canvas; this._fit(); }
    if (!this._h) (this._gpuMode ? this._bindGPU() : this._bind2D());
    this._prev = performance.now();
    const step = async () => {
      this._raf = requestAnimationFrame(step);
      await this._frame();
    };
    this._raf = requestAnimationFrame(step);
  },

  reset() {
    if (this._card) this._card.close();
    if (this._rain) this._rain.setPointer(new this._gpu.THREE.Vector3(0, 0, 0), 0);
    this._pr = 0;
  },

  /* Контракт ядра: standby() без аргумента, возврат — стоп-функция аттрактора.
   * Отдаём тротлённую петлю (timings.standbyFps): зритель издалека видит саму
   * сцену, а не оверлей ядра, при этом GPU ночью не молотит на 60 кадрах. */
  standby() {
    this.pause();
    if (this._card) this._card.close();
    if (this._rain) this._rain.setPointer(new this._gpu.THREE.Vector3(0, 0, 0), 0);
    this._pr = 0;
    this._standby = true;
    return beginStandby(this._app, () => this._frame(), () => { this._standby = false; });
  },

  setLang(lang) {
    this._lang = lang || this._lang || "ru";
    const T = {
      ru: { kicker: "МТК 38 · Ленин на языках мира", title: "Дождь имён",
            sub: (f) => `${f} написаний всплывают снизу вверх. Веди пальцем — расталкивай. Тап по слову — карточка языка и издания на нём.` },
      en: { kicker: "MTK 38 · Lenin in the world's languages", title: "Rain of names",
            sub: (f) => `${f} written forms drift upward. Move your finger to push them apart, tap a word for its card.` },
      zh: { kicker: "МТК 38 · 世界语言中的列宁", title: "名字之雨",
            sub: (f) => `${f} 种写法自下而上浮起。滑动手指可推开，点按查看卡片。` },
    }[this._lang];
    if (!T || !this._root) return;
    this._root.querySelector(".m38-kicker").textContent = T.kicker;
    this._root.querySelector(".m38-title").textContent = T.title;
    this._root.querySelector(".m38-sub").textContent = T.sub(this._forms.length);
    this._syncCardLang();
    if (this._hint && this._hint.setLabel) this._hint.setLabel(this._hintLabel());
  },

  _hintLabel() { return this._app ? this._app.t("hint.rain") : null; },

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
    const bad = offScreen(this._root) ? null
      : bufferComplaint(this._canvas, this._dpr, this._root);
    if (bad) return { ok: false, detail: bad };
    /* Фоллбэк — не авария, а штатный путь без WebGPU: проверяем то, что
     * есть в этом режиме, и говорим, в каком именно сцена работает. */
    const n = this._gpuMode ? ((this._rain && this._rain.count) || 0)
                            : ((this._particles && this._particles.length) || 0);
    if (!n) return { ok: false, detail: "частиц ноль" };
    return { ok: true, detail: `частиц ${n}, режим ${this._gpuMode ? "WebGPU-compute" : "Canvas 2D (фоллбэк)"}` };
  },

  applySettings(values) {
    this._cfg = Object.assign({}, this._cfg, values || {});
    if (!this._root) return;
    for (const s of this.settings) {
      const v = this._cfg[s.key] ?? s.default;
      if (v != null) this._apply(s.key, v);
    }
  },

  /* ── GPU-путь ───────────────────────────────────────────────────── */

  async _mountGPU() {
    const gpu = this._gpu, THREE = gpu.THREE, tsl = gpu.TSL;
    attachCanvas(gpu, this._root);
    this._canvas = gpu.canvas;

    const [atlasMod, rainMod, post] = await Promise.all([
      import("../../mtk38-v3/engine/atlas.js"),
      import("../../mtk38-v3/scenes/rain.js"),
      loadPostNodes(),
    ]);
    this._mkRain = rainMod.createRain;

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x10141a);
    this._scene.fog = new THREE.FogExp2(0x10141a, 0.005);
    this._camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this._camera.position.set(0, 0, 26);
    this._camera.lookAt(0, 0, 0);

    this._atlas = atlasMod.makeWordAtlas(THREE, this._forms, {});
    this._rain = await rainMod.createRain(THREE, gpu.renderer, { atlas: this._atlas, count: 500 });
    this._scene.add(this._rain.mesh);

    this._u = {
      dofFocus: tsl.uniform(26), dofRange: tsl.uniform(11),
      dofBokeh: tsl.uniform(0), ca: tsl.uniform(0.3),
    };
    try {
      const p = new THREE.PostProcessing(gpu.renderer);
      const sp = tsl.pass(this._scene, this._camera);
      const col = sp.getTextureNode("output");
      let base = col;
      if (post.dof) {
        try { base = post.dof(col, sp.getViewZNode(), this._u.dofFocus, this._u.dofRange, this._u.dofBokeh); }
        catch (e) { console.warn("[dof off]", e); base = col; }
      }
      const baseTex = tsl.convertToTexture(base);
      let out = baseTex;
      if (post.bloom) {
        try { this._bloom = post.bloom(baseTex, 0.26, 0.55, 0.78); out = baseTex.add(this._bloom); }
        catch (e) { console.warn("[bloom off]", e); }
      }
      if (post.ca) {
        try { out = post.ca(out, this._u.ca, tsl.vec2(0.5, 0.5), 1.1); }
        catch (e) { console.warn("[ca off]", e); }
      }
      p.outputNode = out;
      this._post = p;
    } catch (e) { console.warn("[post off]", e); this._post = null; }

    this._bindGPU();
  },

  _toWorld(cx, cy) {
    const THREE = this._gpu.THREE;
    const r = this._canvas.getBoundingClientRect();
    this._ndc = this._ndc || new THREE.Vector2();
    this._ray = this._ray || new THREE.Raycaster();
    this._ndc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
    this._ray.setFromCamera(this._ndc, this._camera);
    const t = -this._ray.ray.origin.z / this._ray.ray.direction.z;
    return this._ray.ray.origin.clone().addScaledVector(this._ray.ray.direction, t);
  },

  _bindGPU() {
    const cv = this._canvas;
    const T = { x: 0, y: 0, t: 0, moved: false };
    this._pr = 0;
    this._h = {
      move: (e) => {
        if (Math.hypot(e.clientX - T.x, e.clientY - T.y) > 6) T.moved = true;
        this._pr = this._pr || 5.5;
        this._rain.setPointer(this._toWorld(e.clientX, e.clientY), this._pr);
      },
      leave: () => { this._pr = 0; this._rain.setPointer(new this._gpu.THREE.Vector3(0, 0, 0), 0); },
      down: (e) => {
        this._pr = 8.5;
        this._rain.setPointer(this._toWorld(e.clientX, e.clientY), this._pr);
        T.x = e.clientX; T.y = e.clientY; T.t = performance.now(); T.moved = false;
      },
      up: async (e) => {
        this._pr = 5.5;
        if (T.moved || performance.now() - T.t > 400) return;
        this._toWorld(e.clientX, e.clientY);   // обновляет this._ray под текущий тап
        const wi = await this._rain.pick(this._ray.ray);
        if (wi != null && this._forms[wi]) this._card.open(this._forms[wi]);
        else this._card.close();
      },
    };
    cv.addEventListener("pointermove", this._h.move, { passive: true });
    cv.addEventListener("pointerleave", this._h.leave);
    cv.addEventListener("pointerdown", this._h.down);
    cv.addEventListener("pointerup", this._h.up);
  },

  /* ── Фоллбэк Canvas 2D ──────────────────────────────────────────── */

  _mount2D() {
    const cv = document.createElement("canvas");
    cv.className = "m38-canvas";
    this._root.insertBefore(cv, this._root.firstChild);
    this._canvas = cv;
    this._ctx2d = cv.getContext("2d");
    this._particles = [];
    this._pointer = { x: -1e5, y: -1e5, r: 0 };
    this._spawn2D(500);

    this._bind2D();
  },

  _bind2D() {
    const cv = this._canvas;
    this._h = {
      move: (e) => {
        const r = cv.getBoundingClientRect();
        this._pointer.x = e.clientX - r.left; this._pointer.y = e.clientY - r.top;
        this._pointer.r = Math.min(r.width, r.height) * 0.16;
      },
      leave: () => { this._pointer.r = 0; },
      down: (e) => { this._t2d = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }; this._h.move(e); },
      up: (e) => {
        const t = this._t2d;
        if (!t || performance.now() - t.t > 400 || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 6) return;
        const r = cv.getBoundingClientRect();
        this._tap2D(e.clientX - r.left, e.clientY - r.top);
      },
    };
    cv.addEventListener("pointermove", this._h.move, { passive: true });
    cv.addEventListener("pointerleave", this._h.leave);
    cv.addEventListener("pointerdown", this._h.down);
    cv.addEventListener("pointerup", this._h.up);
  },

  _spawn2D(n) {
    const arr = this._particles;
    const h = this._H || 1000;
    while (arr.length > n) arr.pop();
    while (arr.length < n) {
      const tier = Math.min(3, Math.floor(Math.random() * Math.random() * 4));
      const r = Math.random();
      arr.push({
        f: this._forms[(Math.random() * this._forms.length) | 0],
        tier, tone: r < 0.045 ? 2 : r < 0.14 ? 1 : 0,
        x: Math.random(), y: Math.random() * h, vx: 0, vy: 0,
        seed: Math.random(), w: 0,
      });
    }
  },

  _tap2D(x, y) {
    let best = null, bd = 1e9;
    for (const p of this._particles) {
      if (!p.w) continue;
      const px = p.x * this._W;
      const d = Math.hypot(x - px, y - p.y);
      if (d < Math.max(28, p.w * 0.6) && d < bd) { bd = d; best = p; }
    }
    if (best) this._card.open(best.f); else this._card.close();
  },

  _step2D(dt) {
    const ctx = this._ctx2d, W = this._W, H = this._H;
    if (!ctx || !W) return;
    const c = this._cfg || {};
    const scale = (c.size ?? 1) * Math.min(W, H) / 900;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#10141a"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const buoy = (c.speed ?? 2.4) * 26 * (this._standby ? 1.4 : 1);
    const repel = (c.repel ?? 11) * 0.9;
    for (const p of this._particles) {
      const mass = 0.5 + p.tier * 0.7;
      p.vy -= (buoy / mass + 8) * dt;                       // вверх = уменьшение y
      p.vy *= Math.max(0, 1 - 0.6 * dt);
      p.vx *= Math.max(0, 1 - 0.9 * dt);
      const px = p.x * W;
      if (this._pointer.r > 0) {
        const dx = px - this._pointer.x, dy = p.y - this._pointer.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.001 && d < this._pointer.r) {
          const k = 1 - d / this._pointer.r;
          const f = (repel * k * k * 60) / mass;
          p.vx += (dx / d) * f * dt; p.vy += (dy / d) * f * dt;
        }
      }
      p.x += (p.vx * dt) / W; p.y += p.vy * dt;
      if (p.y < -80) { p.y = H + 60; p.vy = 0; p.vx = 0; }
      if (p.x < -0.06) p.x += 1.12; else if (p.x > 1.06) p.x -= 1.12;

      const size = TIERS[p.tier] * 42 * scale;
      ctx.font = `${p.tier >= 2 ? 600 : 400} ${size}px ${famWord(p.f.sc)}`;
      p.w = ctx.measureText(p.f.w).width;
      ctx.globalAlpha = 0.82 + p.tier * 0.06;
      ctx.fillStyle = TONES[p.tone];
      ctx.fillText(p.f.w, p.x * W, p.y);
    }
    ctx.globalAlpha = 1;
  },

  /* ── общее ──────────────────────────────────────────────────────── */

  _apply(k, v) {
    const r = this._gpu && this._gpu.renderer;
    if (!this._gpuMode) {
      if (k === "count") this._spawn2D(Math.round(v));
      if (k === "grain") this._root.style.setProperty("--m38-grain", v);
      if (k === "vign") this._root.style.setProperty("--m38-vign", v);
      return;   // остальные — про пост-обработку, которой в 2D нет
    }
    switch (k) {
      case "count": this._setCount(Math.round(v)); break;
      case "speed": if (this._rain) this._rain.params.uBuoy.value = v; break;
      case "repel": if (this._rain) this._rain.params.uRepel.value = v; break;
      case "size": if (this._rain) this._rain.params.uSizeScale.value = v; break;
      case "exposure": if (r) r.toneMappingExposure = v; break;
      case "bloom": if (this._bloom) this._bloom.strength.value = v; break;
      case "bloomThr": if (this._bloom) this._bloom.threshold.value = v; break;
      case "dofBokeh": this._u.dofBokeh.value = v; break;
      case "dofFocus": this._u.dofFocus.value = v; break;
      case "ca": this._u.ca.value = v; break;
      case "fog": if (this._scene && this._scene.fog) this._scene.fog.density = v; break;
      case "grain": this._root.style.setProperty("--m38-grain", v); break;
      case "vign": this._root.style.setProperty("--m38-vign", v); break;
    }
  },

  // пересборка частиц асинхронная и не мгновенная — копим движение ползунка
  _setCount(n) {
    if (this._count === n || !this._mkRain) return;
    this._count = n;
    clearTimeout(this._countTimer);
    this._countTimer = setTimeout(async () => {
      if (!this._scene) return;
      const old = this._rain;
      const nw = await this._mkRain(this._gpu.THREE, this._gpu.renderer, { atlas: this._atlas, count: n });
      nw.params.uSizeScale.value = old.params.uSizeScale.value;
      nw.params.uBuoy.value = old.params.uBuoy.value;
      nw.params.uRepel.value = old.params.uRepel.value;
      this._rain = nw;
      this._scene.add(nw.mesh); this._scene.remove(old.mesh);
      old.mesh.geometry.dispose(); old.mesh.material.dispose();
    }, 280);
  },

  _fit() {
    if (!this._root || !this._canvas) return;
    const r = this._root.getBoundingClientRect();
    this._W = Math.max(1, Math.round(r.width));
    this._H = Math.max(1, Math.round(r.height));
    if (this._gpuMode) {
      this._dpr = fitTo(this._gpu.renderer, this._camera, this._root).dpr;
      if (this._post) this._post.needsUpdate = true;
    } else {
      const dpr = capDpr(this._W, this._H);   // тот же бюджет 8.3 Мп, что у GPU-пути
      this._dpr = dpr;
      this._canvas.width = Math.round(this._W * dpr);
      this._canvas.height = Math.round(this._H * dpr);
      this._ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  },

  _unbind() {
    if (!this._h || !this._canvas) { this._h = null; return; }
    const cv = this._canvas;
    cv.removeEventListener("pointermove", this._h.move);
    cv.removeEventListener("pointerleave", this._h.leave);
    cv.removeEventListener("pointerdown", this._h.down);
    cv.removeEventListener("pointerup", this._h.up);
    this._h = null;
  },

  async _frame() {
    // ResizeObserver в фоне молчит — держим размер из штатного пути кадра
    if (pollSize(this, this._root)) this._fit();
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._prev) / 1000);
    this._prev = now;
    if (!this._gpuMode) { this._step2D(dt); return; }
    if (!this._rain || !this._scene) return;
    await this._rain.update(dt);
    if (this._post) await this._post.renderAsync();
    else await this._gpu.renderer.renderAsync(this._scene, this._camera);
  },
};
