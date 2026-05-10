(function () {
  const canvas = document.getElementById("globe");
  const ctx = canvas.getContext("2d", { alpha: true });
  const modeButtons = Array.from(document.querySelectorAll(".mode-button"));

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

  const BASE_TILT = 0.56;
  const ringLats = [-74, -66, -58, -50, -42, -34, -26, -18, -10, -2, 6, 14, 22, 30, 38, 46, 54, 62, 70];
  const rings = ringLats.map((lat, index) => {
    const equatorWeight = Math.cos(Math.abs(lat) * Math.PI / 180);
    const direction = index % 2 === 0 ? 1 : -1;
    return {
      lat,
      speed: direction * (0.09 + equatorWeight * 0.16),
      offset: index * 0.69,
      size: 0.46 + equatorWeight * 0.4,
      targetCount: Math.round(12 + equatorWeight * 36),
      userOffset: 0,
      userVelocity: 0
    };
  });

  let width = 0;
  let height = 0;
  let dpr = 1;
  let start = performance.now();
  let mode = "rings";
  let activeRing = null;
  let sphereDrag = false;
  const sphere = {
    yaw: -0.18,
    pitch: -0.18,
    yawVelocity: 0.035,
    pitchVelocity: 0
  };
  let lastPointerX = 0;
  let lastPointerY = 0;
  let lastPointerTime = 0;
  const textWidthCache = new Map();

  function cssColor(hex, alpha) {
    const value = hex.replace("#", "");
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

  function project(lat, theta, radius, tilt) {
    const phi = lat * Math.PI / 180;
    const cosPhi = Math.cos(phi);
    const x = cosPhi * Math.cos(theta);
    const y0 = Math.sin(phi);
    const z0 = cosPhi * Math.sin(theta);
    const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
    const z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
    return { x: x * radius, y: y * radius, z };
  }

  function rotateSpherePoint(x, y, z) {
    const cosYaw = Math.cos(sphere.yaw);
    const sinYaw = Math.sin(sphere.yaw);
    const cosPitch = Math.cos(sphere.pitch);
    const sinPitch = Math.sin(sphere.pitch);

    const x1 = x * cosYaw + z * sinYaw;
    const z1 = -x * sinYaw + z * cosYaw;
    const y1 = y;

    return {
      x: x1,
      y: y1 * cosPitch - z1 * sinPitch,
      z: y1 * sinPitch + z1 * cosPitch
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
      z: rotated.z,
      unit: rotated
    };
  }

  function sphereTangentAngle(lat, theta, radius, cx, cy) {
    const a = projectSpherePoint(lat, theta, radius, cx, cy);
    const b = projectSpherePoint(lat, theta + 0.012, radius, cx, cy);
    let angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (Math.cos(angle) < 0) angle += Math.PI;
    return angle;
  }

  function tangentAngle(lat, theta, tilt) {
    const phi = lat * Math.PI / 180;
    const cosPhi = Math.cos(phi);
    const dx = -cosPhi * Math.sin(theta);
    const dz = cosPhi * Math.cos(theta);
    const dy = -dz * Math.sin(tilt);
    let angle = Math.atan2(dy, dx);
    if (Math.cos(angle) < 0) angle += Math.PI;
    return angle;
  }

  function ringGeometry(ring, cx, cy, r, tilt) {
    const phi = ring.lat * Math.PI / 180;
    const cosPhi = Math.cos(phi);
    const centerY = cy + Math.sin(phi) * r * Math.cos(tilt);
    const rx = Math.max(6, cosPhi * r);
    const ry = Math.max(4, cosPhi * r * Math.abs(Math.sin(tilt)));
    return { centerY, rx, ry };
  }

  function drawBackgroundGrain() {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = palette.paper;
    const step = 19;
    const seed = Math.floor((performance.now() - start) / 180);
    for (let y = (seed % step) - step; y < height; y += step) {
      for (let x = ((seed + y) % step) - step; x < width; x += step) {
        if ((x * 13 + y * 7 + seed) % 11 === 0) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    ctx.restore();
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

  function drawGuideLines(cx, cy, r, tilt, time) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    rings.forEach((ring, ringIndex) => {
      const { centerY, rx, ry } = ringGeometry(ring, cx, cy, r, tilt);
      const active = activeRing === ring;
      ctx.beginPath();
      ctx.ellipse(cx, centerY, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = cssColor(active ? palette.brass : palette.window, active ? 0.55 : 0.12);
      ctx.lineWidth = active ? 2.4 : 0.8;
      ctx.setLineDash([3 + (ringIndex % 4), 16]);
      ctx.lineDashOffset = -(time * ring.speed + ring.userOffset) * 42;
      ctx.stroke();
    });

    ctx.setLineDash([]);
    for (let i = 0; i < 10; i += 1) {
      const angle = time * 0.08 + i * Math.PI / 10;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * Math.abs(Math.cos(angle)), r, 0, -Math.PI / 2, Math.PI / 2);
      ctx.strokeStyle = cssColor(palette.window, 0.08);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSphereGuides(cx, cy, r, time) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.setLineDash([3, 18]);

    rings.forEach((ring, ringIndex) => {
      const active = false;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 96; i += 1) {
        const theta = (i / 96) * Math.PI * 2 + ring.userOffset + time * ring.speed + ring.offset;
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
      ctx.strokeStyle = cssColor(active ? palette.brass : palette.window, active ? 0.55 : 0.1);
      ctx.lineWidth = active ? 2 : 0.8;
      ctx.lineDashOffset = -(time * ring.speed + ring.userOffset) * 38 + ringIndex * 3;
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

  function drawWords(cx, cy, r, tilt, time) {
    const jobs = [];

    rings.forEach((ring, ringIndex) => {
      const phase = ring.offset + ring.userOffset + time * ring.speed;
      const slots = ringLabelSlots(ring, ringIndex, r, phase);
      const isActiveRing = activeRing === ring;
      slots.forEach(slot => {
        const item = slot.item;
        const theta = slot.theta;
        const point = project(ring.lat, theta, r, tilt);
        const angle = tangentAngle(ring.lat, theta, tilt);
        const x = cx + point.x;
        const y = cy + point.y;
        const accentSeed = (slot.index + ringIndex * 3) % 19;
        jobs.push({
          item,
          x,
          y,
          z: point.z,
          angle,
          ringScale: ring.size,
          activeGlow: isActiveRing ? 0.65 : 0,
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

  function drawSphereWords(cx, cy, r, time) {
    const jobs = [];

    rings.forEach((ring, ringIndex) => {
      const phase = ring.offset + ring.userOffset + time * ring.speed;
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

  function applyRingInertia(deltaSeconds) {
    rings.forEach(ring => {
      ring.userOffset += ring.userVelocity * deltaSeconds;
      ring.userVelocity *= Math.pow(0.92, deltaSeconds * 60);
      if (Math.abs(ring.userVelocity) < 0.0005) {
        ring.userVelocity = 0;
      }
    });
  }

  function applySphereInertia(deltaSeconds) {
    if (mode !== "sphere" || sphereDrag) return;

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
    applyRingInertia(deltaSeconds);
    applySphereInertia(deltaSeconds);

    ctx.clearRect(0, 0, width, height);
    drawBackgroundGrain();

    const shortSide = Math.min(width, height);
    const r = Math.min(shortSide * 0.48, height * 0.36);
    const cx = width * 0.5;
    const cy = height * 0.5;
    const tilt = BASE_TILT;

    drawSphereBase(cx, cy, r);
    if (mode === "sphere") {
      drawSphereGuides(cx, cy, r, time);
      drawSphereWords(cx, cy, r, time);
    } else {
      drawGuideLines(cx, cy, r, tilt, time);
      drawWords(cx, cy, r, tilt, time);
    }
    drawAtmosphere(cx, cy, r, time);

    requestAnimationFrame(render);
  }

  function getGlobeMetrics() {
    const shortSide = Math.min(width, height);
    const r = Math.min(shortSide * 0.48, height * 0.36);
    return {
      r,
      cx: width * 0.5,
      cy: height * 0.5,
      tilt: BASE_TILT
    };
  }

  function nearestRing(x, y) {
    const { r, cx, cy, tilt } = getGlobeMetrics();
    let best = null;
    let bestDistance = Infinity;
    rings.forEach(ring => {
      const { centerY, rx } = ringGeometry(ring, cx, cy, r, tilt);
      const inBand = Math.abs(x - cx) < rx * 1.08;
      const distance = Math.abs(y - centerY) + (inBand ? 0 : r * 0.18);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = ring;
      }
    });
    return bestDistance < r * 0.16 ? best : null;
  }

  function setMode(nextMode) {
    mode = nextMode === "sphere" ? "sphere" : "rings";
    activeRing = null;
    sphereDrag = false;
    modeButtons.forEach(button => {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    });
  }

  modeButtons.forEach(button => {
    button.addEventListener("click", () => {
      setMode(button.dataset.mode);
    });
  });

  window.addEventListener("resize", resize);
  canvas.addEventListener("pointermove", event => {
    const now = performance.now();
    const dt = Math.max(16, now - lastPointerTime);
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    const { r } = getGlobeMetrics();

    if (mode === "sphere") {
      if (!sphereDrag) return;
      const yawDelta = dx / Math.max(1, r * 0.72);
      const pitchDelta = dy / Math.max(1, r * 0.88);
      sphere.yaw += yawDelta;
      sphere.pitch = clamp(sphere.pitch + pitchDelta, -0.95, 0.95);
      sphere.yawVelocity = yawDelta / (dt / 1000);
      sphere.pitchVelocity = pitchDelta / (dt / 1000);
    } else {
      if (!activeRing) return;
      const delta = dx / Math.max(1, r * 0.72);
      activeRing.userOffset += delta;
      activeRing.userVelocity = delta / (dt / 1000);
    }

    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = now;
  }, { passive: true });
  canvas.addEventListener("pointerdown", event => {
    if (mode === "sphere") {
      sphereDrag = true;
    } else {
      activeRing = nearestRing(event.clientX, event.clientY);
    }
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = performance.now();
    if ((activeRing || sphereDrag) && canvas.setPointerCapture) {
      canvas.setPointerCapture(event.pointerId);
    }
  });
  canvas.addEventListener("pointerup", event => {
    if (canvas.releasePointerCapture) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Pointer capture may already be released by the browser.
      }
    }
    activeRing = null;
    sphereDrag = false;
  });
  canvas.addEventListener("pointercancel", () => {
    activeRing = null;
    sphereDrag = false;
  });

  setMode(new URLSearchParams(window.location.search).get("mode"));
  resize();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(render));
  } else {
    requestAnimationFrame(render);
  }
})();
