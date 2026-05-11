(function () {
  const canvas = document.getElementById("mandala");
  const ctx = canvas.getContext("2d", { alpha: true });

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    window: "#9DA3A6",
    black: "#000000"
  };

  const words = [
    { text: "Ленин", script: "cyrillic" }, { text: "Lenin", script: "latin" },
    { text: "Lénine", script: "latin" }, { text: "لينين", script: "arabic" },
    { text: "列宁", script: "cjk" }, { text: "लेनिन", script: "devanagari" },
    { text: "লেনিন", script: "bengali" }, { text: "Lênin", script: "latin" },
    { text: "Lênin", script: "latin" }, { text: "Lenin", script: "latin" },
    { text: "Lenin", script: "latin" }, { text: "Lenin", script: "latin" },
    { text: "Lenin", script: "latin" }, { text: "Lenin", script: "latin" },
    { text: "Ленін", script: "cyrillic" }, { text: "Ленін", script: "cyrillic" },
    { text: "Ленин", script: "cyrillic" }, { text: "Ленин", script: "cyrillic" },
    { text: "Ленин", script: "cyrillic" }, { text: "Լենին", script: "armenian" },
    { text: "ლენინი", script: "georgian" }, { text: "Λένιν", script: "greek" },
    { text: "לנין", script: "hebrew" }, { text: "لنین", script: "arabic" },
    { text: "لینن", script: "arabic" }, { text: "レーニン", script: "cjk" },
    { text: "레닌", script: "hangul" }, { text: "เลนิน", script: "thai" },
    { text: "லெனின்", script: "tamil" }, { text: "లెనిన్", script: "telugu" },
    { text: "ಲೆನಿನ್", script: "kannada" }, { text: "ലെനിൻ", script: "malayalam" },
    { text: "ਲੈਨਿਨ", script: "gurmukhi" }, { text: "लेनिन", script: "devanagari" },
    { text: "लेनिन", script: "devanagari" }, { text: "ලෙනින්", script: "sinhala" },
    { text: "ሌኒን", script: "ethiopic" }, { text: "ເລນິນ", script: "lao" },
    { text: "លេនីន", script: "khmer" }, { text: "လီနင်", script: "myanmar" },
    { text: "Ленин", script: "cyrillic" }, { text: "Ленин", script: "cyrillic" }
  ];

  let width = 0, height = 0, dpr = 1;
  let start = performance.now();
  let previousTime = 0;

  function fontStack(script, size, weight) {
    const fallback = '"Noto Sans","Noto Serif","Arial Unicode MS","Arial",sans-serif';
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

  function makeRng(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  // Ring definitions: radius (as fraction of half-shortSide), fontSize fraction,
  // word count, natural angular speed (rad/s), tone, weight.
  const ringDefs = [
    { r: 0.32, fs: 0.052, count: 7,  speed: -0.16, tone: "brass", weight: 600 },
    { r: 0.46, fs: 0.034, count: 14, speed:  0.11, tone: "paper", weight: 400 },
    { r: 0.58, fs: 0.026, count: 22, speed: -0.085, tone: "brass", weight: 600 },
    { r: 0.70, fs: 0.022, count: 30, speed:  0.062, tone: "paper", weight: 400 },
    { r: 0.82, fs: 0.018, count: 40, speed: -0.048, tone: "paper", weight: 400 },
    { r: 0.92, fs: 0.014, count: 56, speed:  0.038, tone: "window", weight: 400 }
  ];

  const rings = ringDefs.map((def, i) => {
    const rng = makeRng(0xC0FFEE + i * 9173);
    const ringWords = [];
    for (let k = 0; k < def.count; k += 1) {
      ringWords.push(words[(Math.floor(rng() * 42) + k * 11) % words.length]);
    }
    return {
      ...def,
      words: ringWords,
      angleOffset: rng() * Math.PI * 2,
      angularVelocity: def.speed
    };
  });

  // Touch state
  let dragging = false;
  let activeRingIdx = -1;
  let lastPointerAngle = 0;
  let lastPointerTime = 0;
  let centerPulse = 0;

  function applyDynamics(dt) {
    for (const ring of rings) {
      ring.angleOffset += ring.angularVelocity * dt;
      // Spring back to natural speed
      const damp = Math.min(1, dt * 1.4);
      ring.angularVelocity += (ring.speed - ring.angularVelocity) * damp;
    }
    centerPulse += dt;
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

  function getMetrics() {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const shortSide = Math.min(width, height);
    const halfShort = shortSide * 0.5;
    return { cx, cy, shortSide, halfShort };
  }

  function drawRays(cx, cy, halfShort, time) {
    // Faint radial rays — gives sun-burst / propaganda emblem feel.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.04);
    const rays = 36;
    for (let i = 0; i < rays; i += 1) {
      const a = (i / rays) * Math.PI * 2;
      const x0 = Math.cos(a) * halfShort * 0.10;
      const y0 = Math.sin(a) * halfShort * 0.10;
      const x1 = Math.cos(a) * halfShort * 0.98;
      const y1 = Math.sin(a) * halfShort * 0.98;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = cssColor(palette.brass, i % 3 === 0 ? 0.07 : 0.025);
      ctx.lineWidth = i % 3 === 0 ? 1.0 : 0.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRingGuide(cx, cy, radius, active) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = cssColor(active ? palette.brass : palette.window, active ? 0.42 : 0.10);
    ctx.lineWidth = active ? 1.6 : 0.6;
    ctx.setLineDash(active ? [] : [3, 12]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawRingWords(ring, cx, cy, halfShort, isActive) {
    const radius = halfShort * ring.r;
    const fontSize = halfShort * ring.fs;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle =
      ring.tone === "brass" ? palette.brass :
      ring.tone === "red" ? palette.red :
      ring.tone === "window" ? cssColor(palette.window, 0.6) :
      palette.paper;
    ctx.shadowColor = cssColor(palette.black, 0.55);
    ctx.shadowBlur = isActive ? 12 : 6;
    ctx.globalAlpha = isActive ? 1 : 0.92;

    for (let i = 0; i < ring.words.length; i += 1) {
      const word = ring.words[i];
      const baseAngle = (i / ring.words.length) * Math.PI * 2;
      const angle = baseAngle + ring.angleOffset;

      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      // Tangent angle so text follows the curve
      let textAngle = angle + Math.PI / 2;
      // Flip text on bottom half so it's not upside-down
      if (Math.sin(angle) > 0) textAngle += Math.PI;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(textAngle);
      ctx.font = fontStack(word.script, fontSize, ring.weight);
      ctx.fillText(word.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawCenter(cx, cy, halfShort) {
    // Brass medallion + huge "Ленин" in red
    const r = halfShort * 0.22;
    const pulse = 1 + Math.sin(centerPulse * 1.3) * 0.018;

    ctx.save();
    // Medallion gradient
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.05, cx, cy, r * 1.1);
    grad.addColorStop(0, "rgba(247, 249, 239, 0.18)");
    grad.addColorStop(0.5, "rgba(210, 183, 115, 0.32)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0.85)");
    ctx.beginPath();
    ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Brass rim, double
    ctx.beginPath();
    ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = cssColor(palette.brass, 0.85);
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r * pulse * 1.06, 0, Math.PI * 2);
    ctx.strokeStyle = cssColor(palette.brass, 0.32);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Center label
    ctx.font = `600 ${halfShort * 0.10}px "Nolde", Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = cssColor(palette.black, 0.7);
    ctx.shadowBlur = 24;
    ctx.fillStyle = palette.red;
    ctx.fillText("Ленин", cx, cy);

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = palette.brass;
    ctx.strokeText("Ленин", cx, cy);
    ctx.restore();
  }

  function render(now) {
    const time = (now - start) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, time - previousTime));
    previousTime = time;
    applyDynamics(dt);

    ctx.clearRect(0, 0, width, height);
    const { cx, cy, halfShort } = getMetrics();

    drawRays(cx, cy, halfShort, time);

    // Ring guides (subtle) + words, back to front
    for (let i = rings.length - 1; i >= 0; i -= 1) {
      const ring = rings[i];
      const isActive = i === activeRingIdx;
      drawRingGuide(cx, cy, halfShort * ring.r, isActive);
    }
    for (let i = 0; i < rings.length; i += 1) {
      drawRingWords(rings[i], cx, cy, halfShort, i === activeRingIdx);
    }

    drawCenter(cx, cy, halfShort);

    requestAnimationFrame(render);
  }

  function findRingByRadius(x, y) {
    const { cx, cy, halfShort } = getMetrics();
    const dist = Math.hypot(x - cx, y - cy);
    let best = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < rings.length; i += 1) {
      const ringR = halfShort * rings[i].r;
      const delta = Math.abs(dist - ringR);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = i;
      }
    }
    // Tolerance scales with ring size (small rings → wider tolerance)
    return bestDelta < halfShort * 0.06 ? best : -1;
  }

  function pointerAngle(x, y) {
    const { cx, cy } = getMetrics();
    return Math.atan2(y - cy, x - cx);
  }

  window.addEventListener("resize", resize);

  canvas.addEventListener("pointerdown", event => {
    activeRingIdx = findRingByRadius(event.clientX, event.clientY);
    if (activeRingIdx < 0) return;
    dragging = true;
    lastPointerAngle = pointerAngle(event.clientX, event.clientY);
    lastPointerTime = performance.now();
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (!dragging || activeRingIdx < 0) return;
    const now = performance.now();
    const dt = Math.max(16, now - lastPointerTime) / 1000;
    const a = pointerAngle(event.clientX, event.clientY);
    let delta = a - lastPointerAngle;
    // Wrap delta to [-π, π]
    if (delta > Math.PI) delta -= Math.PI * 2;
    else if (delta < -Math.PI) delta += Math.PI * 2;
    const ring = rings[activeRingIdx];
    ring.angleOffset += delta;
    ring.angularVelocity = delta / dt;
    lastPointerAngle = a;
    lastPointerTime = now;
  }, { passive: true });

  canvas.addEventListener("pointerup", event => {
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    dragging = false;
    activeRingIdx = -1;
  });

  canvas.addEventListener("pointercancel", () => {
    dragging = false;
    activeRingIdx = -1;
  });

  resize();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(render));
  } else {
    requestAnimationFrame(render);
  }
})();
