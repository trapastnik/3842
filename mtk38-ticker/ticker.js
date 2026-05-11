(function () {
  const canvas = document.getElementById("ticker");
  const ctx = canvas.getContext("2d", { alpha: true });

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    window: "#9DA3A6",
    black: "#000000"
  };

  const words = [
    { text: "Ленин", script: "cyrillic", primary: true },
    { text: "Lenin", script: "latin", primary: true },
    { text: "Lénine", script: "latin", primary: true },
    { text: "Lenin", script: "latin", primary: true },
    { text: "لينين", script: "arabic", primary: true },
    { text: "列宁", script: "cjk", primary: true },
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

  // Band tier presets — fraction of height each band takes.
  // count + size + speed scale to give visual variety.
  const tierPresets = [
    { sizeFrac: 0.082, weight: 600, baseSpeed: 36,  tone: "paper", heightWeight: 4.4, glueGap: " · " },
    { sizeFrac: 0.034, weight: 400, baseSpeed: 88,  tone: "brass", heightWeight: 2.0, glueGap: "   ·   " },
    { sizeFrac: 0.020, weight: 400, baseSpeed: 140, tone: "paper", heightWeight: 1.3, glueGap: "  /  " },
    { sizeFrac: 0.054, weight: 600, baseSpeed: 52,  tone: "paper", heightWeight: 3.2, glueGap: " — " },
    { sizeFrac: 0.014, weight: 600, baseSpeed: 200, tone: "window", heightWeight: 0.95, glueGap: " " },
    { sizeFrac: 0.045, weight: 400, baseSpeed: 70,  tone: "brass", heightWeight: 2.7, glueGap: " · " },
    { sizeFrac: 0.024, weight: 400, baseSpeed: 110, tone: "paper", heightWeight: 1.6, glueGap: "   " },
    { sizeFrac: 0.066, weight: 600, baseSpeed: 44,  tone: "paper", heightWeight: 3.9, glueGap: " ⋅ " },
    { sizeFrac: 0.018, weight: 400, baseSpeed: 170, tone: "paper", heightWeight: 1.15, glueGap: "  /  " },
    { sizeFrac: 0.030, weight: 600, baseSpeed: 96,  tone: "brass", heightWeight: 1.85, glueGap: "   ·   " }
  ];

  const bands = [];

  function buildBands() {
    bands.length = 0;
    const shortSide = Math.min(width, height);
    // Sum of heightWeights determines vertical distribution
    const presets = tierPresets;
    const totalWeight = presets.reduce((a, b) => a + b.heightWeight, 0);
    const rng = makeRng(0x71C7E2);

    let yCursor = 0;
    presets.forEach((preset, idx) => {
      const bandHeight = (preset.heightWeight / totalWeight) * height;
      const fontSize = shortSide * preset.sizeFrac;
      // Build a long shuffled text stream for this band
      const stream = [];
      const reps = idx === 0 ? 5 : idx === 1 ? 8 : 14;
      for (let r = 0; r < reps; r += 1) {
        const shuffled = words.slice().sort(() => rng() - 0.5);
        for (let i = 0; i < shuffled.length; i += 1) stream.push(shuffled[i].text);
      }
      const text = stream.join(preset.glueGap);
      const direction = idx % 2 === 0 ? -1 : 1;        // alternate directions
      const speed = preset.baseSpeed * direction;

      // Measure full text width once (font set on real ctx for accuracy)
      ctx.font = fontStack("latin", fontSize, preset.weight);  // approximate; mixed scripts ok
      const measured = ctx.measureText(text);
      const textWidth = measured.width;

      bands.push({
        text,
        textWidth,
        font: fontStack("latin", fontSize, preset.weight),
        size: fontSize,
        weight: preset.weight,
        tone: preset.tone,
        y: yCursor,
        height: bandHeight,
        offset: rng() * Math.min(textWidth, 600), // random start offset
        speed,
        naturalSpeed: speed,
        index: idx
      });
      yCursor += bandHeight;
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildBands();
  }

  // Touch interaction — drag on a band changes its instantaneous speed.
  let activeBand = -1;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let lastPointerTime = 0;

  function applyDynamics(dt) {
    for (let i = 0; i < bands.length; i += 1) {
      const band = bands[i];
      band.offset += band.speed * dt;
      // Wrap offset modulo textWidth so the loop is seamless
      if (band.textWidth > 0) {
        band.offset = ((band.offset % band.textWidth) + band.textWidth) % band.textWidth;
      }
      // Speed decays toward natural after manual change
      if (i !== activeBand) {
        band.speed += (band.naturalSpeed - band.speed) * Math.min(1, dt * 0.9);
      }
    }
  }

  function drawBand(band) {
    ctx.save();
    ctx.font = band.font;
    ctx.textBaseline = "middle";
    ctx.fillStyle =
      band.tone === "brass" ? palette.brass :
      band.tone === "window" ? cssColor(palette.window, 0.62) :
      palette.paper;
    ctx.shadowColor = cssColor(palette.black, 0.55);
    ctx.shadowBlur = band.size > 40 ? 18 : band.size > 20 ? 8 : 3;
    ctx.globalAlpha = band.tone === "window" ? 0.65 : (band.size > 60 ? 0.94 : 0.86);

    // Draw text twice for seamless wrap
    const baselineY = band.y + band.height * 0.5;
    const x0 = -band.offset;
    ctx.fillText(band.text, x0, baselineY);
    ctx.fillText(band.text, x0 + band.textWidth, baselineY);
    ctx.restore();

    // Subtle horizontal separator (almost invisible)
    if (band.index < tierPresets.length - 1) {
      ctx.beginPath();
      ctx.moveTo(0, band.y + band.height);
      ctx.lineTo(width, band.y + band.height);
      ctx.strokeStyle = cssColor(palette.window, 0.045);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function render(now) {
    const time = (now - start) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, time - previousTime));
    previousTime = time;
    applyDynamics(dt);

    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < bands.length; i += 1) drawBand(bands[i]);

    requestAnimationFrame(render);
  }

  function findBandAt(y) {
    for (let i = 0; i < bands.length; i += 1) {
      const b = bands[i];
      if (y >= b.y && y < b.y + b.height) return i;
    }
    return -1;
  }

  window.addEventListener("resize", resize);

  canvas.addEventListener("pointerdown", event => {
    activeBand = findBandAt(event.clientY);
    if (activeBand < 0) return;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = performance.now();
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (activeBand < 0) return;
    const now = performance.now();
    const dt = Math.max(16, now - lastPointerTime) / 1000;
    const dx = event.clientX - lastPointerX;
    const band = bands[activeBand];
    // Direct manipulation: move offset by -dx so finger drags the strip
    band.offset -= dx;
    if (band.textWidth > 0) {
      band.offset = ((band.offset % band.textWidth) + band.textWidth) % band.textWidth;
    }
    band.speed = -dx / dt; // instantaneous speed for inertia after release
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = now;
  }, { passive: true });

  canvas.addEventListener("pointerup", event => {
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    activeBand = -1;
  });

  canvas.addEventListener("pointercancel", () => { activeBand = -1; });

  resize();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      buildBands();
      requestAnimationFrame(render);
    });
  } else {
    requestAnimationFrame(render);
  }
})();
