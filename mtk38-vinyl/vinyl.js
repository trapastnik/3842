(function () {
  const canvas = document.getElementById("vinyl");
  const ctx = canvas.getContext("2d", { alpha: true });

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    window: "#9DA3A6",
    black: "#000000",
    deep: "#0B0B0C"
  };

  const words = [
    { text: "Ленин", script: "cyrillic" }, { text: "Lenin", script: "latin" },
    { text: "Lénine", script: "latin" }, { text: "Lenin", script: "latin" },
    { text: "لينين", script: "arabic" }, { text: "列宁", script: "cjk" },
    { text: "लेनिन", script: "devanagari" }, { text: "লেনিন", script: "bengali" },
    { text: "Lênin", script: "latin" }, { text: "Lenin", script: "latin" },
    { text: "Lenin", script: "latin" }, { text: "Lenin", script: "latin" },
    { text: "Lenin", script: "latin" }, { text: "Lenin", script: "latin" },
    { text: "Lênin", script: "latin" }, { text: "Lenin", script: "latin" },
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
    { text: "លេនីន", script: "khmer" }, { text: "လီနင်", script: "myanmar" }
  ];

  let width = 0, height = 0, dpr = 1;
  let start = performance.now();
  let previousTime = 0;

  // Single disk rotation
  const disk = {
    angle: 0,
    angularVelocity: 0.32,      // natural 33 RPM-ish slow spin
    naturalSpeed: 0.32,
    dragging: false
  };

  let lastPointerAngle = 0;
  let lastPointerTime = 0;

  // Cached "vinyl body" texture — drawn once per resize on offscreen canvas
  const bodyTex = {
    canvas: document.createElement("canvas"),
    ctx: null,
    halfShort: 0
  };
  bodyTex.ctx = bodyTex.canvas.getContext("2d");

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

  function buildBodyTexture() {
    const shortSide = Math.min(width, height);
    const halfShort = shortSide * 0.5;
    bodyTex.halfShort = halfShort;
    const size = Math.ceil(halfShort * 2 + 20);
    bodyTex.canvas.width = size;
    bodyTex.canvas.height = size;
    const g = bodyTex.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);

    const cx = size * 0.5;
    const cy = size * 0.5;
    const outerR = halfShort * 0.95;
    const labelR = halfShort * 0.28;
    const innerHoleR = halfShort * 0.012;

    // Main black disk
    g.beginPath();
    g.arc(cx, cy, outerR, 0, Math.PI * 2);
    g.fillStyle = palette.deep;
    g.fill();

    // Slight body gradient — light from top-left
    const grad = g.createRadialGradient(cx - outerR * 0.35, cy - outerR * 0.45, outerR * 0.05, cx, cy, outerR);
    grad.addColorStop(0, "rgba(247, 249, 239, 0.08)");
    grad.addColorStop(0.45, "rgba(40, 40, 44, 0.0)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0.5)");
    g.fillStyle = grad;
    g.fill();

    // Grooves — many concentric circles between labelR and outerR
    const grooveCount = 220;
    for (let i = 0; i < grooveCount; i += 1) {
      const t = i / grooveCount;
      const r = labelR + (outerR - labelR) * t;
      // Slightly modulated brightness — like fine variations in vinyl pressing
      const mod = 0.04 + Math.sin(i * 0.18) * 0.015 + Math.sin(i * 1.31 + 0.5) * 0.01;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.strokeStyle = cssColor(palette.window, mod);
      g.lineWidth = 0.5;
      g.stroke();
    }

    // "Track separator" bands — slightly darker concentric rings at song boundaries
    const rng = makeRng(0xB5B5);
    for (let b = 0; b < 5; b += 1) {
      const t = 0.18 + b * 0.18 + rng() * 0.04;
      const r = labelR + (outerR - labelR) * t;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.strokeStyle = "rgba(0, 0, 0, 0.5)";
      g.lineWidth = 2.2;
      g.stroke();
    }

    // Highlight reflection band — top-left rim shine
    g.save();
    g.beginPath();
    g.arc(cx, cy, outerR, 0, Math.PI * 2);
    g.clip();
    const shine = g.createLinearGradient(cx - outerR, cy - outerR, cx + outerR * 0.2, cy + outerR * 0.2);
    shine.addColorStop(0, "rgba(247, 249, 239, 0.14)");
    shine.addColorStop(0.3, "rgba(247, 249, 239, 0.06)");
    shine.addColorStop(0.6, "rgba(247, 249, 239, 0)");
    g.fillStyle = shine;
    g.fillRect(0, 0, size, size);
    g.restore();

    // Center spindle hole
    g.beginPath();
    g.arc(cx, cy, innerHoleR, 0, Math.PI * 2);
    g.fillStyle = "#1a1a1c";
    g.fill();
    g.strokeStyle = "rgba(0, 0, 0, 0.9)";
    g.lineWidth = 1.2;
    g.stroke();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildBodyTexture();
  }

  function applyDynamics(dt) {
    if (disk.dragging) return;
    disk.angle += disk.angularVelocity * dt;
    // Spring toward natural speed (so after scratch, returns to playback)
    disk.angularVelocity += (disk.naturalSpeed - disk.angularVelocity) * Math.min(1, dt * 1.2);
  }

  function getMetrics() {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const shortSide = Math.min(width, height);
    const halfShort = shortSide * 0.5;
    return { cx, cy, shortSide, halfShort };
  }

  function drawLabel(cx, cy, halfShort) {
    const labelR = halfShort * 0.28;
    const labelInnerR = halfShort * 0.02;

    // Brass label disc
    ctx.beginPath();
    ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(cx - labelR * 0.25, cy - labelR * 0.3, labelR * 0.05, cx, cy, labelR);
    grad.addColorStop(0, "#E9D798");
    grad.addColorStop(0.55, palette.brass);
    grad.addColorStop(1, "#9F8643");
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner thin rings (decoration)
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, labelR * (0.5 + i * 0.16), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(80, 60, 20, 0.4)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Red ring around label edge
    ctx.beginPath();
    ctx.arc(cx, cy, labelR * 0.94, 0, Math.PI * 2);
    ctx.strokeStyle = palette.red;
    ctx.lineWidth = labelR * 0.06;
    ctx.stroke();

    // Main "Ленин" text
    ctx.fillStyle = "#36120D";
    ctx.font = `600 ${labelR * 0.42}px "Nolde", Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Ленин", cx, cy - labelR * 0.04);

    // Sub-label
    ctx.fillStyle = "rgba(50, 25, 12, 0.7)";
    ctx.font = `600 ${labelR * 0.10}px "20 Kopeek", "Courier New", monospace`;
    ctx.fillText("на 42 языках мира", cx, cy + labelR * 0.34);

    // Spindle hole rim
    ctx.beginPath();
    ctx.arc(cx, cy, labelInnerR * 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(60, 30, 12, 0.5)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, labelInnerR, 0, Math.PI * 2);
    ctx.fillStyle = "#080808";
    ctx.fill();
  }

  // Two text rings near the outer rim — the "vinyl pressing" text
  // (like "Made in USSR. Side A" but with Lenin words instead)
  function drawTextRings(cx, cy, halfShort) {
    const ringDefs = [
      { radius: halfShort * 0.85, fontSize: halfShort * 0.022, weight: 600, count: 50, tone: "paper" },
      { radius: halfShort * 0.40, fontSize: halfShort * 0.028, weight: 400, count: 26, tone: "brass" }
    ];

    for (const def of ringDefs) {
      ctx.save();
      ctx.fillStyle = def.tone === "brass" ? palette.brass : palette.paper;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = cssColor(palette.black, 0.7);
      ctx.shadowBlur = 4;
      ctx.globalAlpha = def.tone === "brass" ? 0.78 : 0.86;

      for (let i = 0; i < def.count; i += 1) {
        const word = words[(i * 7 + 3) % words.length];
        const baseAngle = (i / def.count) * Math.PI * 2;
        const angle = baseAngle;
        const x = cx + Math.cos(angle) * def.radius;
        const y = cy + Math.sin(angle) * def.radius;
        let textAngle = angle + Math.PI / 2;
        if (Math.sin(angle) > 0) textAngle += Math.PI;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(textAngle);
        ctx.font = fontStack(word.script, def.fontSize, def.weight);
        ctx.fillText(word.text, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  function render(now) {
    const time = (now - start) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, time - previousTime));
    previousTime = time;
    applyDynamics(dt);

    ctx.clearRect(0, 0, width, height);
    const { cx, cy, halfShort } = getMetrics();

    // Body (cached) + text rings + label, all rotated together
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(disk.angle);

    const size = bodyTex.canvas.width;
    ctx.drawImage(bodyTex.canvas, -size * 0.5, -size * 0.5);

    drawTextRings(0, 0, halfShort);
    drawLabel(0, 0, halfShort);

    ctx.restore();

    // Subtle non-rotating tonearm hint at right — purely decorative
    drawTonearmHint(cx, cy, halfShort);

    requestAnimationFrame(render);
  }

  function drawTonearmHint(cx, cy, halfShort) {
    // Thin brass line from upper-right edge to near the disk — suggests a tonearm
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = palette.brass;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + halfShort * 0.96, cy - halfShort * 0.86);
    ctx.lineTo(cx + halfShort * 0.42, cy - halfShort * 0.55);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx + halfShort * 0.96, cy - halfShort * 0.86, halfShort * 0.025, 0, Math.PI * 2);
    ctx.fillStyle = palette.brass;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx + halfShort * 0.42, cy - halfShort * 0.55, halfShort * 0.012, 0, Math.PI * 2);
    ctx.fillStyle = palette.red;
    ctx.fill();
    ctx.restore();
  }

  function pointerAngle(x, y) {
    const { cx, cy } = getMetrics();
    return Math.atan2(y - cy, x - cx);
  }

  function pointerOnDisk(x, y) {
    const { cx, cy, halfShort } = getMetrics();
    const d = Math.hypot(x - cx, y - cy);
    return d < halfShort * 0.95 && d > halfShort * 0.02;
  }

  window.addEventListener("resize", resize);

  canvas.addEventListener("pointerdown", event => {
    if (!pointerOnDisk(event.clientX, event.clientY)) return;
    disk.dragging = true;
    lastPointerAngle = pointerAngle(event.clientX, event.clientY);
    lastPointerTime = performance.now();
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (!disk.dragging) return;
    const now = performance.now();
    const dt = Math.max(16, now - lastPointerTime) / 1000;
    const a = pointerAngle(event.clientX, event.clientY);
    let delta = a - lastPointerAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    else if (delta < -Math.PI) delta += Math.PI * 2;
    disk.angle += delta;
    disk.angularVelocity = delta / dt;
    lastPointerAngle = a;
    lastPointerTime = now;
  }, { passive: true });

  canvas.addEventListener("pointerup", event => {
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    disk.dragging = false;
  });

  canvas.addEventListener("pointercancel", () => { disk.dragging = false; });

  resize();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      buildBodyTexture();
      requestAnimationFrame(render);
    });
  } else {
    requestAnimationFrame(render);
  }
})();
