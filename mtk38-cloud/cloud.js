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
    { lang: "Русский", text: "Ленин", script: "cyrillic", primary: true },
    { lang: "English", text: "Lenin", script: "latin", primary: true },
    { lang: "Français", text: "Lénine", script: "latin", primary: true },
    { lang: "Español", text: "Lenin", script: "latin", primary: true },
    { lang: "العربية", text: "لينين", script: "arabic", primary: true },
    { lang: "中文", text: "列宁", script: "cjk", primary: true },
    { lang: "Hindi", text: "लेनिन", script: "devanagari" },
    { lang: "Bengali", text: "লেনিন", script: "bengali" },
    { lang: "Português", text: "Lênin", script: "latin" },
    { lang: "Deutsch", text: "Lenin", script: "latin" },
    { lang: "Italiano", text: "Lenin", script: "latin" },
    { lang: "Polski", text: "Lenin", script: "latin" },
    { lang: "Türkçe", text: "Lenin", script: "latin" },
    { lang: "Indonesia", text: "Lenin", script: "latin" },
    { lang: "Tiếng Việt", text: "Lênin", script: "latin" },
    { lang: "Kiswahili", text: "Lenin", script: "latin" },
    { lang: "Українська", text: "Ленін", script: "cyrillic" },
    { lang: "Беларуская", text: "Ленін", script: "cyrillic" },
    { lang: "Қазақша", text: "Ленин", script: "cyrillic" },
    { lang: "Кыргызча", text: "Ленин", script: "cyrillic" },
    { lang: "Монгол", text: "Ленин", script: "cyrillic" },
    { lang: "Հայերեն", text: "Լենին", script: "armenian" },
    { lang: "ქართული", text: "ლენინი", script: "georgian" },
    { lang: "Ελληνικά", text: "Λένιν", script: "greek" },
    { lang: "עברית", text: "לנין", script: "hebrew" },
    { lang: "فارسی", text: "لنین", script: "arabic" },
    { lang: "اردو", text: "لینن", script: "arabic" },
    { lang: "日本語", text: "レーニン", script: "cjk" },
    { lang: "한국어", text: "레닌", script: "hangul" },
    { lang: "ไทย", text: "เลนิน", script: "thai" },
    { lang: "தமிழ்", text: "லெனின்", script: "tamil" },
    { lang: "తెలుగు", text: "లెనిన్", script: "telugu" },
    { lang: "ಕನ್ನಡ", text: "ಲೆನಿನ್", script: "kannada" },
    { lang: "മലയാളം", text: "ലെനിൻ", script: "malayalam" },
    { lang: "ਪੰਜਾਬੀ", text: "ਲੈਨਿਨ", script: "gurmukhi" },
    { lang: "मराठी", text: "लेनिन", script: "devanagari" },
    { lang: "नेपाली", text: "लेनिन", script: "devanagari" },
    { lang: "සිංහල", text: "ලෙනින්", script: "sinhala" },
    { lang: "Amharic", text: "ሌኒን", script: "ethiopic" },
    { lang: "Lao", text: "ເລນິນ", script: "lao" },
    { lang: "Khmer", text: "លេនីន", script: "khmer" },
    { lang: "Burmese", text: "လီနင်", script: "myanmar" }
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

  function buildParticles() {
    particles.length = 0;
    const rng = makeRng(0xC10D5EE7);
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
        scale: item.primary ? 1.0 + (i === 0 ? 0.5 : 0.15) : 0.7 + rng() * 0.25,
        breathPhase: rng() * Math.PI * 2,
        accent: i === 0 ? "red" : (item.primary && (i % 7 === 0)) ? "brass" : "paper",
        rank: i
      });
    });
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

  buildParticles();
  resize();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(render));
  } else {
    requestAnimationFrame(render);
  }
})();
