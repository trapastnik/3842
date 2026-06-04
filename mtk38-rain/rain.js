(function () {
  const canvas = document.getElementById("rain");
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

  const particles = [];

  // Pointer state — repulsion source
  const pointer = {
    x: -10000, y: -10000,
    active: false,
    radius: 0,
    targetRadius: 0
  };

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

  function spawnParticle(rng, fromBottom) {
    // Tier picks size category. Mostly small, some medium, few large.
    const sizeRoll = rng();
    const tier =
      sizeRoll < 0.62 ? 0 :                                  // small
      sizeRoll < 0.88 ? 1 :                                  // medium
      sizeRoll < 0.98 ? 2 :                                  // large
                         3;                                  // hero (rare)
    const shortSide = Math.min(width, height);
    const sizes = [shortSide * 0.018, shortSide * 0.034, shortSide * 0.058, shortSide * 0.090];
    const size = sizes[tier];

    const word = words[Math.floor(rng() * words.length)];
    const weight = word.primary ? 600 : 400;
    const toneRoll = rng();
    const tone =
      word.primary && toneRoll < 0.06 ? "red" :
      toneRoll < 0.10 ? "brass" :
      "paper";

    return {
      word,
      x: rng() * width,
      y: fromBottom ? height + size * (1 + rng() * 6) : rng() * height,
      vx: (rng() - 0.5) * 12,
      // Negative vy = moving up.  Bigger words rise faster (more "thrust").
      vy: -(18 + tier * 22 + rng() * 30),
      angle: (rng() - 0.5) * 0.18,
      angularVelocity: (rng() - 0.5) * 0.5,
      size,
      tier,
      weight,
      tone,
      mass: 0.4 + tier * 0.8
    };
  }

  function buildParticles() {
    particles.length = 0;
    const rng = makeRng(0xD41D5A1);
    const count = 130;
    for (let i = 0; i < count; i += 1) {
      particles.push(spawnParticle(rng, false));
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildParticles();
  }

  const buoyancy = -110;      // px/s² acceleration toward TOP (negative y)
  const drag = 0.06;          // air resistance coefficient
  const respawnRng = makeRng(0xE1E1E1);

  function applyPhysics(dt) {
    pointer.radius += (pointer.targetRadius - pointer.radius) * Math.min(1, dt * 8);
    const pR = pointer.radius;
    const pR2 = pR * pR;

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];

      // Anti-gravity / buoyancy — pulls words upward.  Lighter (smaller)
      // particles get pushed up more, like bubbles in water.
      p.vy += buoyancy * dt / Math.max(0.6, p.mass);

      // Air resistance
      p.vx -= p.vx * drag * dt * 4;
      p.vy -= p.vy * drag * dt * 4;

      // Pointer repulsion (Newton-ish — inverse-distance push, capped)
      if (pointer.active && pR > 0) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < pR2 && d2 > 1) {
          const d = Math.sqrt(d2);
          const falloff = 1 - d / pR;
          const force = 1800 * falloff * falloff;
          const nx = dx / d;
          const ny = dy / d;
          p.vx += nx * force * dt / Math.max(0.6, p.mass);
          p.vy += ny * force * dt / Math.max(0.6, p.mass);
          // Spin from the deflection
          p.angularVelocity += (Math.sign(dx) * 1.5 - p.angularVelocity) * Math.min(1, dt * 4);
        }
      }

      // Integrate
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.angularVelocity * dt;
      p.angularVelocity *= Math.pow(0.94, dt * 60);

      // Bounds — wrap horizontally, respawn from bottom if risen above
      if (p.x < -p.size * 4) p.x = width + p.size * 4;
      if (p.x > width + p.size * 4) p.x = -p.size * 4;
      if (p.y < -p.size * 4) {
        // Respawn from bottom with new random word/size
        const fresh = spawnParticle(respawnRng, true);
        Object.assign(p, fresh);
      }
    }
  }

  function drawParticle(p) {
    const color =
      p.tone === "red" ? palette.red :
      p.tone === "brass" ? palette.brass :
      palette.paper;
    const alpha = p.tier === 3 ? 0.96 : p.tier === 2 ? 0.88 : p.tier === 1 ? 0.78 : 0.62;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.font = fontStack(p.word.script, p.size, p.weight);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = cssColor(palette.black, 0.6);
    ctx.shadowBlur = p.tier >= 2 ? 14 : 5;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillText(p.word.text, 0, 0);

    if (p.tone === "red" || p.tone === "brass") {
      ctx.globalAlpha = alpha * 0.25;
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = palette.brass;
      ctx.strokeText(p.word.text, 0, 0);
    }
    ctx.restore();
  }

  function drawPointerHalo() {
    if (!pointer.active || pointer.radius < 4) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, pointer.radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, pointer.radius);
    grad.addColorStop(0, "rgba(210, 183, 115, 0.10)");
    grad.addColorStop(0.7, "rgba(210, 183, 115, 0.04)");
    grad.addColorStop(1, "rgba(210, 183, 115, 0)");
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, pointer.radius * 0.78, 0, Math.PI * 2);
    ctx.strokeStyle = cssColor(palette.brass, 0.32);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 10]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function render(now) {
    const time = (now - start) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, time - previousTime));
    previousTime = time;
    applyPhysics(dt);

    ctx.clearRect(0, 0, width, height);

    // Sort by tier asc → smaller in back, bigger in front
    particles.sort((a, b) => a.tier - b.tier);
    for (let i = 0; i < particles.length; i += 1) drawParticle(particles[i]);

    drawPointerHalo();

    requestAnimationFrame(render);
  }

  window.addEventListener("resize", resize);

  canvas.addEventListener("pointermove", event => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
    pointer.targetRadius = Math.min(width, height) * 0.16;
  }, { passive: true });

  canvas.addEventListener("pointerdown", event => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
    pointer.targetRadius = Math.min(width, height) * 0.20; // stronger when pressed
  });

  canvas.addEventListener("pointerup", event => {
    pointer.targetRadius = Math.min(width, height) * 0.16;
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.active = false;
    pointer.targetRadius = 0;
  });

  canvas.addEventListener("pointercancel", () => {
    pointer.active = false;
    pointer.targetRadius = 0;
  });

  resize();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(render));
  } else {
    requestAnimationFrame(render);
  }
})();
