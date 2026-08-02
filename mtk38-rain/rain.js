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
    { text: "Ленин", script: "cyrillic", primary: true, id: "rus", langRu: "Русский", lang: "Русский", region: "Россия", speakers: 255 },
    { text: "Lenin", script: "latin", primary: true, id: "eng", langRu: "Английский", lang: "English", region: "Великобритания", speakers: 1500 },
    { text: "Lénine", script: "latin", primary: true, id: "fra", langRu: "Французский", lang: "Français", region: "Франция", speakers: 280 },
    { text: "Lenin", script: "latin", primary: true, id: "spa", langRu: "Испанский", lang: "Español", region: "Испания", speakers: 560 },
    { text: "لينين", script: "arabic", primary: true, id: "ara", langRu: "Арабский", lang: "العربية", region: "Египет", speakers: 370 },
    { text: "列宁", script: "cjk", primary: true, id: "zho", langRu: "Китайский (упрощ.)", lang: "中文", region: "Китай", speakers: 1100 },
    { text: "लेनिन", script: "devanagari", id: "hin", langRu: "Хинди", lang: "Hindi", region: "Индия" }, { text: "লেনিন", script: "bengali", id: "ben", langRu: "Бенгальский", lang: "Bengali", region: "Бангладеш", speakers: 270 },
    { text: "Lênin", script: "latin", id: "por", langRu: "Португальский", lang: "Português", region: "Бразилия", speakers: 260 }, { text: "Lenin", script: "latin", id: "deu", langRu: "Немецкий", lang: "Deutsch", region: "Германия" },
    { text: "Lenin", script: "latin", id: "ita", langRu: "Итальянский", lang: "Italiano", region: "Италия" }, { text: "Lenin", script: "latin", id: "pol", langRu: "Польский", lang: "Polski", region: "Польша" },
    { text: "Lenin", script: "latin", id: "tur", langRu: "Турецкий", lang: "Türkçe", region: "Турция" }, { text: "Lenin", script: "latin", id: "ind", langRu: "Индонезийский", lang: "Indonesia", region: "Индонезия" },
    { text: "Lênin", script: "latin", id: "vie", langRu: "Вьетнамский", lang: "Tiếng Việt", region: "Вьетнам" }, { text: "Lenin", script: "latin", id: "swa", langRu: "Суахили", lang: "Kiswahili", region: "Танзания" },
    { text: "Ленін", script: "cyrillic", id: "ukr", langRu: "Украинский", lang: "Українська", region: "Украина" }, { text: "Ленін", script: "cyrillic", id: "bel", langRu: "Белорусский", lang: "Беларуская", region: "Беларусь", speakers: 5 },
    { text: "Ленин", script: "cyrillic", id: "kaz", langRu: "Казахский", lang: "Қазақша", region: "Казахстан" }, { text: "Ленин", script: "cyrillic", id: "kir", langRu: "Киргизский", lang: "Кыргызча", region: "Кыргызстан" },
    { text: "Ленин", script: "cyrillic", id: "mon", langRu: "Монгольский", lang: "Монгол", region: "Монголия" }, { text: "Լենին", script: "armenian", id: "hye", langRu: "Армянский", lang: "Հայերեն", region: "Армения", speakers: 6.7 },
    { text: "ლენინი", script: "georgian", id: "kat", langRu: "Грузинский", lang: "ქართული", region: "Грузия", speakers: 3.7 }, { text: "Λένιν", script: "greek", id: "ell", langRu: "Греческий", lang: "Ελληνικά", region: "Греция", speakers: 13 },
    { text: "לנין", script: "hebrew", id: "heb", langRu: "Иврит", lang: "עברית", region: "Израиль", speakers: 9 }, { text: "لنین", script: "arabic", id: "fas", langRu: "Персидский (фарси)", lang: "فارسی", region: "Иран" },
    { text: "لینن", script: "arabic", id: "urd", langRu: "Урду", lang: "اردو", region: "Пакистан", speakers: 230 }, { text: "レーニン", script: "cjk", id: "jpn", langRu: "Японский", lang: "日本語", region: "Япония", speakers: 125 },
    { text: "레닌", script: "hangul", id: "kor", langRu: "Корейский", lang: "한국어", region: "Респ. Корея", speakers: 82 }, { text: "เลนิน", script: "thai", id: "tha", langRu: "Тайский", lang: "ไทย", region: "Таиланд" },
    { text: "லெனின்", script: "tamil", id: "tam", langRu: "Тамильский", lang: "தமிழ்", region: "Тамилнад", speakers: 86 }, { text: "లెనిన్", script: "telugu", id: "tel", langRu: "Телугу", lang: "తెలుగు", region: "Телангана / Андхра", speakers: 83 },
    { text: "ಲೆನಿನ್", script: "kannada", id: "kan", langRu: "Каннада", lang: "ಕನ್ನಡ", region: "Карнатака", speakers: 44 }, { text: "ലെനിൻ", script: "malayalam", id: "mal", langRu: "Малаялам", lang: "മലയാളം", region: "Керала", speakers: 38 },
    { text: "ਲੈਨਿਨ", script: "gurmukhi", id: "pan", langRu: "Панджаби", lang: "ਪੰਜਾਬੀ", region: "Пенджаб", speakers: 113 }, { text: "लेनिन", script: "devanagari", id: "mar", langRu: "Маратхи", lang: "मराठी", region: "Махараштра" },
    { text: "लेनिन", script: "devanagari", id: "nep", langRu: "Непальский", lang: "नेपाली", region: "Непал" }, { text: "ලෙනින්", script: "sinhala", id: "sin", langRu: "Сингальский", lang: "සිංහල", region: "Шри-Ланка", speakers: 17 },
    { text: "ሌኒን", script: "ethiopic", id: "amh", langRu: "Амхарский", lang: "Amharic", region: "Эфиопия", speakers: 57 }, { text: "ເລນິນ", script: "lao", id: "lao", langRu: "Лаосский", lang: "ລາວ", region: "Лаос", speakers: 30 },
    { text: "លេនីន", script: "khmer", id: "khm", langRu: "Кхмерский", lang: "ខ្មែរ", region: "Камбоджа", speakers: 18 }, { text: "လီနင်", script: "myanmar", id: "mya", langRu: "Бирманский", lang: "မြန်မာ", region: "Мьянма", speakers: 43 }
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

  const hits = [];

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
    // рамка слова для тапа; крупные ярусы рисуются позже и перекрывают мелкие
    hits.push({ x: p.x, y: p.y, w: ctx.measureText(p.word.text).width, h: p.size, item: p.word });

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
    hits.length = 0;
    particles.sort((a, b) => a.tier - b.tier);
    for (let i = 0; i < particles.length; i += 1) drawParticle(particles[i]);

    drawPointerHalo();

    requestAnimationFrame(render);
  }


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
