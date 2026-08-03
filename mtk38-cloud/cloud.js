(function () {
  const canvas = document.getElementById("cloud");
  const ctx = canvas.getContext("2d", { alpha: true });

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    window: "#9DA3A6",
    graphite: "#435059",
    black: "#000000"
  };

  const words = [
    { lang: "Русский", text: "Ленин", script: "cyrillic", primary: true, id: "rus", langRu: "Русский", region: "Россия", speakers: 255 },
    { lang: "English", text: "Lenin", script: "latin", primary: true, id: "eng", langRu: "Английский", region: "Великобритания", speakers: 1500 },
    { lang: "Français", text: "Lénine", script: "latin", primary: true, id: "fra", langRu: "Французский", region: "Франция", speakers: 280 },
    { lang: "Español", text: "Lenin", script: "latin", primary: true, id: "spa", langRu: "Испанский", region: "Испания", speakers: 560 },
    { lang: "العربية", text: "لينين", script: "arabic", primary: true, id: "ara", langRu: "Арабский", region: "Египет", speakers: 370 },
    { lang: "中文", text: "列宁", script: "cjk", primary: true, id: "zho", langRu: "Китайский (упрощ.)", region: "Китай", speakers: 1100 },
    { lang: "Hindi", text: "लेनिन", script: "devanagari", id: "hin", langRu: "Хинди", region: "Индия" },
    { lang: "Bengali", text: "লেনিন", script: "bengali", id: "ben", langRu: "Бенгальский", region: "Бангладеш", speakers: 270 },
    { lang: "Português", text: "Lênin", script: "latin", id: "por", langRu: "Португальский", region: "Бразилия", speakers: 260 },
    { lang: "Deutsch", text: "Lenin", script: "latin", id: "deu", langRu: "Немецкий", region: "Германия" },
    { lang: "Italiano", text: "Lenin", script: "latin", id: "ita", langRu: "Итальянский", region: "Италия" },
    { lang: "Polski", text: "Lenin", script: "latin", id: "pol", langRu: "Польский", region: "Польша" },
    { lang: "Türkçe", text: "Lenin", script: "latin", id: "tur", langRu: "Турецкий", region: "Турция" },
    { lang: "Indonesia", text: "Lenin", script: "latin", id: "ind", langRu: "Индонезийский", region: "Индонезия" },
    { lang: "Tiếng Việt", text: "Lênin", script: "latin", id: "vie", langRu: "Вьетнамский", region: "Вьетнам" },
    { lang: "Kiswahili", text: "Lenin", script: "latin", id: "swa", langRu: "Суахили", region: "Танзания" },
    { lang: "Українська", text: "Ленін", script: "cyrillic", id: "ukr", langRu: "Украинский", region: "Украина" },
    { lang: "Беларуская", text: "Ленін", script: "cyrillic", id: "bel", langRu: "Белорусский", region: "Беларусь", speakers: 5 },
    { lang: "Қазақша", text: "Ленин", script: "cyrillic", id: "kaz", langRu: "Казахский", region: "Казахстан" },
    { lang: "Кыргызча", text: "Ленин", script: "cyrillic", id: "kir", langRu: "Киргизский", region: "Кыргызстан" },
    { lang: "Монгол", text: "Ленин", script: "cyrillic", id: "mon", langRu: "Монгольский", region: "Монголия" },
    { lang: "Հայերեն", text: "Լենին", script: "armenian", id: "hye", langRu: "Армянский", region: "Армения", speakers: 6.7 },
    { lang: "ქართული", text: "ლენინი", script: "georgian", id: "kat", langRu: "Грузинский", region: "Грузия", speakers: 3.7 },
    { lang: "Ελληνικά", text: "Λένιν", script: "greek", id: "ell", langRu: "Греческий", region: "Греция", speakers: 13 },
    { lang: "עברית", text: "לנין", script: "hebrew", id: "heb", langRu: "Иврит", region: "Израиль", speakers: 9 },
    { lang: "فارسی", text: "لنین", script: "arabic", id: "fas", langRu: "Персидский (фарси)", region: "Иран" },
    { lang: "اردو", text: "لینن", script: "arabic", id: "urd", langRu: "Урду", region: "Пакистан", speakers: 230 },
    { lang: "日本語", text: "レーニン", script: "cjk", id: "jpn", langRu: "Японский", region: "Япония", speakers: 125 },
    { lang: "한국어", text: "레닌", script: "hangul", id: "kor", langRu: "Корейский", region: "Респ. Корея", speakers: 82 },
    { lang: "ไทย", text: "เลนิน", script: "thai", id: "tha", langRu: "Тайский", region: "Таиланд" },
    { lang: "தமிழ்", text: "லெனின்", script: "tamil", id: "tam", langRu: "Тамильский", region: "Тамилнад", speakers: 86 },
    { lang: "తెలుగు", text: "లెనిన్", script: "telugu", id: "tel", langRu: "Телугу", region: "Телангана / Андхра", speakers: 83 },
    { lang: "ಕನ್ನಡ", text: "ಲೆನಿನ್", script: "kannada", id: "kan", langRu: "Каннада", region: "Карнатака", speakers: 44 },
    { lang: "മലയാളം", text: "ലെനിൻ", script: "malayalam", id: "mal", langRu: "Малаялам", region: "Керала", speakers: 38 },
    { lang: "ਪੰਜਾਬੀ", text: "ਲੈਨਿਨ", script: "gurmukhi", id: "pan", langRu: "Панджаби", region: "Пенджаб", speakers: 113 },
    { lang: "मराठी", text: "लेनिन", script: "devanagari", id: "mar", langRu: "Маратхи", region: "Махараштра" },
    { lang: "नेपाली", text: "लेनिन", script: "devanagari", id: "nep", langRu: "Непальский", region: "Непал" },
    { lang: "සිංහල", text: "ලෙනින්", script: "sinhala", id: "sin", langRu: "Сингальский", region: "Шри-Ланка", speakers: 17 },
    { lang: "Amharic", text: "ሌኒን", script: "ethiopic", id: "amh", langRu: "Амхарский", region: "Эфиопия", speakers: 57 },
    { lang: "Lao", text: "ເລນິນ", script: "lao", id: "lao", langRu: "Лаосский", region: "Лаос", speakers: 30 },
    { lang: "Khmer", text: "លេនីន", script: "khmer", id: "khm", langRu: "Кхмерский", region: "Камбоджа", speakers: 18 },
    { lang: "Burmese", text: "လီနင်", script: "myanmar", id: "mya", langRu: "Бирманский", region: "Мьянма", speakers: 43 }
  ];

  let width = 0;
  let height = 0;
  let dpr = 1;
  let start = performance.now();

  // Camera state — orbits origin
  const camera = {
    yaw: 0.4,
    pitch: -0.12,
    yawVelocity: 0.04,
    pitchVelocity: 0,
    cosYaw: 1,
    sinYaw: 0,
    cosPitch: 1,
    sinPitch: 0
  };
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let lastPointerTime = 0;

  // Particles — words floating in 3D volume (not on a sphere surface)
  const particles = [];

  function makeRng(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  // Density multiplier — bound to the UI slider, can be 1..20.
  // Total particles = words.length × densityMultiplier.
  let densityMultiplier = 4;

  function buildParticles() {
    particles.length = 0;
    const rng = makeRng(0xC10D5EE7);
    // Each of the 42 words is instantiated `densityMultiplier` times, scattered
    // through the volume.  Hero accents (red «Ленин», brass primaries) only on
    // copy 0 so the visual hierarchy isn't multiplied — extra copies are quiet fill.
    const COPIES = densityMultiplier;
    for (let copy = 0; copy < COPIES; copy += 1) {
      // Subsequent copies a bit smaller — feel like echo.  At high densities
      // (×10+) we taper even more so they don't choke the view.
      const copyScale =
        copy === 0 ? 1.0 :
        COPIES <= 4 ? 0.82 :
        COPIES <= 10 ? 0.72 :
                       0.62;
      words.forEach((item, i) => {
        // Distribute in an elongated volume (taller than wide for vertical 4K kiosk).
        // Use cube-root of uniform random for more uniform volumetric density.
        const u = rng();
        const v = rng();
        const w = rng();
        const radius = Math.cbrt(rng()) * 0.95;
        const theta = u * Math.PI * 2;
        const cosPhi = 1 - 2 * v;            // -1..+1
        const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
        const x = radius * sinPhi * Math.cos(theta);
        const y = radius * sinPhi * Math.sin(theta) * 1.45; // stretch vertical
        const z = radius * cosPhi;

        // Slow per-word drift
        const speed = 0.012 + rng() * 0.02;
        const driftDir = w * Math.PI * 2;

        const isHero = (copy === 0 && i === 0);
        const isBrass = (copy === 0 && item.primary && (i % 7 === 0));

        particles.push({
          item,
          baseX: x,
          baseY: y,
          baseZ: z,
          driftAmp: 0.04 + rng() * 0.05,
          driftPhase: rng() * Math.PI * 2,
          driftSpeed: speed,
          driftDirX: Math.cos(driftDir),
          driftDirY: Math.sin(driftDir) * 0.6,
          driftDirZ: Math.cos(driftDir + 1.7),
          scale: copyScale * (isHero ? 1.5 : (item.primary ? 1.15 : 0.7 + rng() * 0.25)),
          breathPhase: rng() * Math.PI * 2,
          accent: isHero ? "red" : isBrass ? "brass" : "paper",
          rank: copy * words.length + i
        });
      });
    }
  }

  function fontStack(script, size, weight) {
    const fallback = ["Noto Sans", "Noto Serif", "Arial Unicode MS", "Arial", "sans-serif"].join(", ");
    if (script === "latin" || script === "cyrillic" || script === "greek") {
      return `${weight} ${size}px "Nolde", ${fallback}`;
    }
    return `${weight} ${size}px ${fallback}`;
  }

  function cssColor(hex, alpha) {
    const v = hex.replace("#", "");
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function updateCameraTrig() {
    camera.cosYaw = Math.cos(camera.yaw);
    camera.sinYaw = Math.sin(camera.yaw);
    camera.cosPitch = Math.cos(camera.pitch);
    camera.sinPitch = Math.sin(camera.pitch);
  }

  function project(x, y, z, cx, cy, scaleBase) {
    // Rotate by yaw around Y axis
    const x1 = x * camera.cosYaw + z * camera.sinYaw;
    const z1 = -x * camera.sinYaw + z * camera.cosYaw;
    // Rotate by pitch around X axis
    const y1 = y * camera.cosPitch - z1 * camera.sinPitch;
    const z2 = y * camera.sinPitch + z1 * camera.cosPitch;

    // Mild perspective foreshortening: shrink things farther from camera
    const cameraDistance = 2.4;
    const persp = cameraDistance / (cameraDistance - z2 * 0.7);

    return {
      x: cx + x1 * scaleBase * persp,
      y: cy - y1 * scaleBase * persp,
      z: z2,
      persp
    };
  }

  const hits = [];

  function drawParticle(p, cx, cy, scaleBase, time) {
    const drift = Math.sin(time * p.driftSpeed + p.driftPhase) * p.driftAmp;
    const x = p.baseX + p.driftDirX * drift;
    const y = p.baseY + p.driftDirY * drift;
    const z = p.baseZ + p.driftDirZ * drift;

    const proj = project(x, y, z, cx, cy, scaleBase);
    const breath = 1 + Math.sin(time * 0.7 + p.breathPhase) * 0.04;

    const baseFontSize = scaleBase * 0.06 * p.scale * proj.persp * breath;
    const weight = p.item.primary ? 600 : 400;

    // Depth-based alpha and blur
    const depthNorm = clamp((proj.z + 1) / 2, 0, 1);   // 0 = far, 1 = near
    const alpha = 0.18 + depthNorm * 0.78;
    const shadowBlur = 4 + depthNorm * 22;

    const color =
      p.accent === "red" ? palette.red :
      p.accent === "brass" ? palette.brass :
      depthNorm > 0.45 ? palette.paper : palette.window;

    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.font = fontStack(p.item.script, baseFontSize, weight);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = cssColor(palette.black, depthNorm > 0.5 ? 0.7 : 0.3);
    ctx.shadowBlur = shadowBlur;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillText(p.item.text, 0, 0);
    // рамка слова для тапа (ближние перекрывают дальние — они позже в списке)
    hits.push({ x: proj.x, y: proj.y, w: ctx.measureText(p.item.text).width,
                h: baseFontSize, item: p.item });

    if ((p.accent === "red" || p.accent === "brass") && depthNorm > 0.5) {
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = palette.brass;
      ctx.strokeText(p.item.text, 0, 0);
    }
    ctx.restore();
  }

  function applyCameraInertia(deltaSeconds) {
    if (dragging) return;
    camera.yaw += camera.yawVelocity * deltaSeconds;
    camera.pitch = clamp(camera.pitch + camera.pitchVelocity * deltaSeconds, -0.95, 0.95);
    camera.yawVelocity *= Math.pow(0.965, deltaSeconds * 60);
    camera.pitchVelocity *= Math.pow(0.92, deltaSeconds * 60);
    if (Math.abs(camera.yawVelocity) < 0.022) {
      camera.yawVelocity = camera.yawVelocity < 0 ? -0.022 : 0.022;
    }
    if (Math.abs(camera.pitchVelocity) < 0.0005) camera.pitchVelocity = 0;
  }

  function render(now) {
    const time = (now - start) / 1000;
    const previousTime = render.previousTime || time;
    const deltaSeconds = Math.min(0.05, Math.max(0.001, time - previousTime));
    render.previousTime = time;
    applyCameraInertia(deltaSeconds);
    updateCameraTrig();

    ctx.clearRect(0, 0, width, height);

    const cx = width * 0.5;
    const cy = height * 0.5;
    const shortSide = Math.min(width, height);
    const scaleBase = Math.min(shortSide * 0.46, height * 0.42);

    // Sort particles by current depth (back → front)
    const projected = particles.map(p => {
      const drift = Math.sin(time * p.driftSpeed + p.driftPhase) * p.driftAmp;
      const x = p.baseX + p.driftDirX * drift;
      const y = p.baseY + p.driftDirY * drift;
      const z = p.baseZ + p.driftDirZ * drift;
      // Apply camera rotation only to z (we just need depth for sort)
      const z1 = -x * camera.sinYaw + z * camera.cosYaw;
      const z2 = y * camera.sinPitch + z1 * camera.cosPitch;
      return { p, depth: z2 };
    });
    hits.length = 0;
    projected.sort((a, b) => a.depth - b.depth);
    projected.forEach(entry => drawParticle(entry.p, cx, cy, scaleBase, time));

    requestAnimationFrame(render);
  }

  function getMetrics() {
    const shortSide = Math.min(width, height);
    return { scaleBase: Math.min(shortSide * 0.46, height * 0.42) };
  }

  window.addEventListener("resize", resize);

  canvas.addEventListener("pointermove", event => {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(16, now - lastPointerTime);
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    const { scaleBase } = getMetrics();
    const yawDelta = dx / Math.max(1, scaleBase * 0.85);
    const pitchDelta = dy / Math.max(1, scaleBase * 1.0);
    camera.yaw += yawDelta;
    camera.pitch = clamp(camera.pitch + pitchDelta, -0.95, 0.95);
    camera.yawVelocity = yawDelta / (dt / 1000);
    camera.pitchVelocity = pitchDelta / (dt / 1000);
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = now;
  }, { passive: true });

  canvas.addEventListener("pointerdown", event => {
    dragging = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = performance.now();
    if (canvas.setPointerCapture) {
      canvas.setPointerCapture(event.pointerId);
    }
  });

  canvas.addEventListener("pointerup", event => {
    if (canvas.releasePointerCapture) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch (error) {
        // ignore
      }
    }
    dragging = false;
  });

  canvas.addEventListener("pointercancel", () => {
    dragging = false;
  });

  // Density slider — live update of particle count
  const densityInput = document.getElementById("density");
  const densityValueEl = document.getElementById("density-value");
  const densityCountEl = document.getElementById("density-count");

  function updateDensityUI() {
    if (densityValueEl) densityValueEl.textContent = String(densityMultiplier);
    if (densityCountEl) densityCountEl.textContent = String(densityMultiplier * words.length);
  }

  if (densityInput) {
    // Defensive: stop any pointer events on slider from bubbling anywhere
    // and prevent native behaviour from being eaten by canvas listeners.
    ["pointerdown", "pointermove", "pointerup", "pointercancel",
     "mousedown", "mousemove", "mouseup", "touchstart", "touchmove",
     "touchend", "click"].forEach(t => {
      densityInput.addEventListener(t, e => e.stopPropagation(), { passive: true });
    });

    const applyDensity = () => {
      const next = clamp(parseInt(densityInput.value, 10) || 1, 1, 20);
      if (next === densityMultiplier) return;
      densityMultiplier = next;
      buildParticles();
      updateDensityUI();
    };
    densityInput.addEventListener("input", applyDensity);
    densityInput.addEventListener("change", applyDensity);

    // Init from slider's default value
    densityMultiplier = clamp(parseInt(densityInput.value, 10) || 4, 1, 20);
  }

  buildParticles();
  updateDensityUI();

  // ── карточка языка (общий модуль assets/mtk38/lib/card.js) ──────────
  // Рамки слов собираются в hits во время отрисовки: у каждой сцены своя
  // раскладка, и повторять её в обработчике тапа значило бы дублировать логику.
  const card = window.MTK38Card ? MTK38Card.create() : null;
  let tapX = 0, tapY = 0, tapT = 0, tapMoved = false;

  function pickHit(x, y) {
    let best = null, bd = Infinity;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      const dx = Math.abs(x - h.x), dy = Math.abs(y - h.y);
      if (dx > h.w * 0.5 + 12 || dy > h.h * 0.5 + 12) continue;
      const d = dx + dy;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  canvas.addEventListener("pointerdown", event => {
    if (card && card.isOpen()) return;
    tapX = event.clientX; tapY = event.clientY;
    tapT = performance.now(); tapMoved = false;
  }, { passive: true });

  canvas.addEventListener("pointermove", event => {
    if (Math.hypot(event.clientX - tapX, event.clientY - tapY) > 10) tapMoved = true;
  }, { passive: true });

  canvas.addEventListener("pointerup", event => {
    if (!card || tapMoved || performance.now() - tapT > 500) return;
    const h = pickHit(event.clientX, event.clientY);
    if (h) card.open(h.item);
  }, { passive: true });

  resize();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(render));
  } else {
    requestAnimationFrame(render);
  }
})();
