(function () {
  const canvas = document.getElementById("globe");
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

  const ringLats = [-74, -66, -58, -50, -42, -34, -26, -18, -10, -2, 6, 14, 22, 30, 38, 46, 54, 62, 70];
  const rings = ringLats.map((lat, index) => {
    const equatorWeight = Math.cos(Math.abs(lat) * Math.PI / 180);
    const direction = index % 2 === 0 ? 1 : -1;
    return {
      lat,
      speed: direction * (0.09 + equatorWeight * 0.16),
      offset: index * 0.69,
      size: 0.46 + equatorWeight * 0.4
    };
  });

  let width = 0;
  let height = 0;
  let dpr = 1;
  let start = performance.now();
  let sphereDrag = false;
  const sphere = {
    yaw: -0.18,
    pitch: -0.18,
    yawVelocity: 0.035,
    pitchVelocity: 0,
    cosYaw: 1,
    sinYaw: 0,
    cosPitch: 1,
    sinPitch: 0
  };
  let lastPointerX = 0;
  let lastPointerY = 0;
  let lastPointerTime = 0;
  const textWidthCache = new Map();

  const grain = {
    canvas: document.createElement("canvas"),
    ctx: null,
    width: 0,
    height: 0,
    lastBuiltSeed: -1
  };
  grain.ctx = grain.canvas.getContext("2d");

  function cssColor(hex, alpha) {
    const value = hex.replace("#", "");
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
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
    grain.canvas.width = width;
    grain.canvas.height = height;
    grain.width = width;
    grain.height = height;
    grain.lastBuiltSeed = -1;
  }

  function fontStack(script, size, weight) {
    const fallback = [
      "Noto Sans",
      "Noto Serif",
      "Arial Unicode MS",
      "Arial",
      "sans-serif"
    ].join(", ");

    if (script === "latin" || script === "cyrillic" || script === "greek") {
      return `${weight} ${size}px "Nolde", ${fallback}`;
    }

    return `${weight} ${size}px ${fallback}`;
  }

  function measureWord(item, size, weight) {
    const roundedSize = Math.round(size * 10) / 10;
    const key = `${item.text}|${item.script}|${roundedSize}|${weight}`;
    if (textWidthCache.has(key)) return textWidthCache.get(key);
    ctx.font = fontStack(item.script, roundedSize, weight);
    const widthValue = ctx.measureText(item.text).width;
    textWidthCache.set(key, widthValue);
    return widthValue;
  }

  function ringLabelSlots(ring, ringIndex, r, phase) {
    const phi = Math.abs(ring.lat) * Math.PI / 180;
    const ringRadius = Math.max(1, Math.cos(phi) * r);
    const maxFontSize = 20 * ring.size * 1.22;
    const gap = Math.max(10, maxFontSize * 0.72);
    const circumference = Math.PI * 2 * ringRadius;
    const slots = [];
    let arc = 0;
    let step = 0;

    while (arc < circumference && step < 96) {
      const item = words[(step * 11 + ringIndex * 7) % words.length];
      const weight = item.primary ? 600 : 400;
      const measuredWidth = measureWord(item, maxFontSize, weight);
      const stepWidth = measuredWidth * 1.16 + gap;
      if (arc + stepWidth > circumference) break;
      slots.push({
        item,
        index: step,
        theta: phase + (arc + stepWidth * 0.5) / ringRadius
      });
      arc += stepWidth;
      step += 1;
    }

    return slots;
  }

  function updateSphereTrig() {
    sphere.cosYaw = Math.cos(sphere.yaw);
    sphere.sinYaw = Math.sin(sphere.yaw);
    sphere.cosPitch = Math.cos(sphere.pitch);
    sphere.sinPitch = Math.sin(sphere.pitch);
  }

  function rotateSpherePoint(x, y, z) {
    const x1 = x * sphere.cosYaw + z * sphere.sinYaw;
    const z1 = -x * sphere.sinYaw + z * sphere.cosYaw;
    return {
      x: x1,
      y: y * sphere.cosPitch - z1 * sphere.sinPitch,
      z: y * sphere.sinPitch + z1 * sphere.cosPitch
    };
  }

  function projectSpherePoint(lat, theta, radius, cx, cy) {
    const phi = lat * Math.PI / 180;
    const cosPhi = Math.cos(phi);
    const rotated = rotateSpherePoint(
      cosPhi * Math.cos(theta),
      Math.sin(phi),
      cosPhi * Math.sin(theta)
    );

    return {
      x: cx + rotated.x * radius,
      y: cy - rotated.y * radius,
      z: rotated.z
    };
  }

  function sphereTangentAngle(lat, theta, radius, cx, cy) {
    const a = projectSpherePoint(lat, theta, radius, cx, cy);
    const b = projectSpherePoint(lat, theta + 0.012, radius, cx, cy);
    let angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (Math.cos(angle) < 0) angle += Math.PI;
    return angle;
  }

  function buildGrain() {
    const seedNow = Math.floor((performance.now() - start) / 180);
    if (seedNow === grain.lastBuiltSeed) return;
    grain.lastBuiltSeed = seedNow;
    const g = grain.ctx;
    g.clearRect(0, 0, grain.width, grain.height);
    g.globalAlpha = 0.18;
    g.fillStyle = palette.paper;
    const step = 19;
    for (let y = (seedNow % step) - step; y < grain.height; y += step) {
      for (let x = ((seedNow + y) % step) - step; x < grain.width; x += step) {
        if ((x * 13 + y * 7 + seedNow) % 11 === 0) {
          g.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  function drawBackgroundGrain() {
    buildGrain();
    ctx.drawImage(grain.canvas, 0, 0);
  }

  function drawSphereBase(cx, cy, r) {
    ctx.save();
    const glow = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.45, r * 0.08, cx, cy, r * 1.05);
    glow.addColorStop(0, "rgba(247, 249, 239, 0.13)");
    glow.addColorStop(0.18, "rgba(210, 183, 115, 0.10)");
    glow.addColorStop(0.52, "rgba(67, 80, 89, 0.42)");
    glow.addColorStop(0.82, "rgba(0, 0, 0, 0.72)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0.94)");

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.strokeStyle = cssColor(palette.brass, 0.5);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.025, 0, Math.PI * 2);
    ctx.strokeStyle = cssColor(palette.paper, 0.08);
    ctx.lineWidth = 18;
    ctx.stroke();
    ctx.restore();
  }

  function drawSphereGuides(cx, cy, r, time) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.setLineDash([3, 18]);

    rings.forEach((ring, ringIndex) => {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 96; i += 1) {
        const theta = (i / 96) * Math.PI * 2;
        const point = projectSpherePoint(ring.lat, theta, r, cx, cy);
        if (point.z < -0.62) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(point.x, point.y);
          started = true;
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }
      ctx.strokeStyle = cssColor(palette.window, 0.1);
      ctx.lineWidth = 0.8;
      ctx.lineDashOffset = -(time * ring.speed) * 38 + ringIndex * 3;
      ctx.stroke();
    });

    ctx.setLineDash([]);
    for (let meridian = 0; meridian < 12; meridian += 1) {
      const theta = meridian / 12 * Math.PI * 2;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 80; i += 1) {
        const lat = -80 + (i / 80) * 160;
        const point = projectSpherePoint(lat, theta, r, cx, cy);
        if (point.z < -0.45) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(point.x, point.y);
          started = true;
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }
      ctx.strokeStyle = cssColor(palette.window, 0.07);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawWord(item, x, y, z, angle, ringScale, activeGlow, tone) {
    const depth = (z + 1) / 2;
    const front = z > -0.18;
    const size = (front ? 20 : 14) * ringScale * (0.7 + depth * 0.5);
    const weight = tone === "bright" || tone === "red" ? 600 : 400;
    const alpha = front ? 0.2 + depth * 0.68 : 0.035 + depth * 0.16;
    const color = tone === "red"
      ? palette.red
      : tone === "brass"
        ? palette.brass
        : front ? palette.paper : palette.window;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(1 + depth * 0.12, 0.92 + depth * 0.18);
    ctx.font = fontStack(item.script, size, weight);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = cssColor(palette.black, front ? 0.75 : 0.2);
    ctx.shadowBlur = front ? 16 + activeGlow * 16 : 4;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillText(item.text, 0, 0);

    if ((tone === "red" || tone === "brass") && front) {
      ctx.globalAlpha = 0.08 + depth * 0.1;
      ctx.strokeStyle = palette.brass;
      ctx.lineWidth = 0.75;
      ctx.strokeText(item.text, 0, 0);
    }
    ctx.restore();
  }

  function drawSphereWords(cx, cy, r, time) {
    const jobs = [];

    rings.forEach((ring, ringIndex) => {
      const phase = ring.offset + time * ring.speed;
      const slots = ringLabelSlots(ring, ringIndex, r, phase);
      slots.forEach(slot => {
        const point = projectSpherePoint(ring.lat, slot.theta, r, cx, cy);
        if (point.z < -0.72) return;

        const item = slot.item;
        const accentSeed = (slot.index + ringIndex * 3) % 19;
        jobs.push({
          item,
          x: point.x,
          y: point.y,
          z: point.z,
          angle: sphereTangentAngle(ring.lat, slot.theta, r, cx, cy),
          ringScale: ring.size * 0.92,
          activeGlow: sphereDrag ? 0.22 : 0,
          tone: item.primary && accentSeed === 0 ? "red" : accentSeed === 5 ? "brass" : "paper"
        });
      });
    });

    jobs.sort((a, b) => a.z - b.z);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.01, 0, Math.PI * 2);
    ctx.clip();
    jobs.forEach(job => drawWord(job.item, job.x, job.y, job.z, job.angle, job.ringScale, job.activeGlow, job.tone));
    ctx.restore();
  }

  function drawAtmosphere(cx, cy, r, time) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.008, 0, Math.PI * 2);
    ctx.strokeStyle = cssColor(palette.brass, 0.23 + Math.sin(time * 1.7) * 0.04);
    ctx.lineWidth = 5;
    ctx.shadowColor = cssColor(palette.brass, 0.55);
    ctx.shadowBlur = 26;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.998, 0, Math.PI * 2);
    ctx.strokeStyle = cssColor(palette.red, 0.18);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function applySphereInertia(deltaSeconds) {
    if (sphereDrag) return;

    sphere.yaw += sphere.yawVelocity * deltaSeconds;
    sphere.pitch = clamp(sphere.pitch + sphere.pitchVelocity * deltaSeconds, -0.95, 0.95);
    sphere.yawVelocity *= Math.pow(0.965, deltaSeconds * 60);
    sphere.pitchVelocity *= Math.pow(0.92, deltaSeconds * 60);

    if (Math.abs(sphere.yawVelocity) < 0.018) {
      sphere.yawVelocity = sphere.yawVelocity < 0 ? -0.018 : 0.018;
    }
    if (Math.abs(sphere.pitchVelocity) < 0.0005) sphere.pitchVelocity = 0;
  }

  function render(now) {
    const time = (now - start) / 1000;
    const previousTime = render.previousTime || time;
    const deltaSeconds = Math.min(0.05, Math.max(0.001, time - previousTime));
    render.previousTime = time;
    applySphereInertia(deltaSeconds);
    updateSphereTrig();

    ctx.clearRect(0, 0, width, height);
    drawBackgroundGrain();

    const shortSide = Math.min(width, height);
    const r = Math.min(shortSide * 0.48, height * 0.36);
    const cx = width * 0.5;
    const cy = height * 0.5;

    drawSphereBase(cx, cy, r);
    drawSphereGuides(cx, cy, r, time);
    drawSphereWords(cx, cy, r, time);
    drawAtmosphere(cx, cy, r, time);

    requestAnimationFrame(render);
  }

  function getGlobeMetrics() {
    const shortSide = Math.min(width, height);
    const r = Math.min(shortSide * 0.48, height * 0.36);
    return { r, cx: width * 0.5, cy: height * 0.5 };
  }

  window.addEventListener("resize", resize);

  canvas.addEventListener("pointermove", event => {
    if (!sphereDrag) return;
    const now = performance.now();
    const dt = Math.max(16, now - lastPointerTime);
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    const { r } = getGlobeMetrics();
    const yawDelta = dx / Math.max(1, r * 0.72);
    const pitchDelta = dy / Math.max(1, r * 0.88);
    sphere.yaw += yawDelta;
    sphere.pitch = clamp(sphere.pitch + pitchDelta, -0.95, 0.95);
    sphere.yawVelocity = yawDelta / (dt / 1000);
    sphere.pitchVelocity = pitchDelta / (dt / 1000);
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = now;
  }, { passive: true });

  canvas.addEventListener("pointerdown", event => {
    sphereDrag = true;
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
        // pointer capture may already be released by the browser
      }
    }
    sphereDrag = false;
  });

  canvas.addEventListener("pointercancel", () => {
    sphereDrag = false;
  });

  resize();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(render));
  } else {
    requestAnimationFrame(render);
  }
})();
