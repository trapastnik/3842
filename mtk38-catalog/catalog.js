(function () {
  const canvas = document.getElementById("catalog");
  const ctx = canvas.getContext("2d", { alpha: true });

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    window: "#9DA3A6",
    black: "#000000"
  };

  // Each entry: word, language label, script tag, region tag (rough)
  const entries = [
    { text: "Ленин",   lang: "Русский",    script: "cyrillic",   tag: "RU",  region: "Россия" },
    { text: "Lenin",   lang: "English",    script: "latin",      tag: "EN",  region: "Великобритания, США" },
    { text: "Lénine",  lang: "Français",   script: "latin",      tag: "FR",  region: "Франция" },
    { text: "Lenin",   lang: "Español",    script: "latin",      tag: "ES",  region: "Испания, Лат. Америка" },
    { text: "لينين",   lang: "العربية",   script: "arabic",     tag: "AR",  region: "Ближний Восток" },
    { text: "列宁",     lang: "中文",        script: "cjk",        tag: "ZH",  region: "Китай" },
    { text: "लेनिन",   lang: "Hindi",      script: "devanagari", tag: "HI",  region: "Индия" },
    { text: "লেনিন",   lang: "Bengali",    script: "bengali",    tag: "BN",  region: "Бангладеш, Индия" },
    { text: "Lênin",   lang: "Português",  script: "latin",      tag: "PT",  region: "Португалия, Бразилия" },
    { text: "Lenin",   lang: "Deutsch",    script: "latin",      tag: "DE",  region: "Германия" },
    { text: "Lenin",   lang: "Italiano",   script: "latin",      tag: "IT",  region: "Италия" },
    { text: "Lenin",   lang: "Polski",     script: "latin",      tag: "PL",  region: "Польша" },
    { text: "Lenin",   lang: "Türkçe",     script: "latin",      tag: "TR",  region: "Турция" },
    { text: "Lenin",   lang: "Indonesia",  script: "latin",      tag: "ID",  region: "Индонезия" },
    { text: "Lênin",   lang: "Tiếng Việt", script: "latin",      tag: "VI",  region: "Вьетнам" },
    { text: "Lenin",   lang: "Kiswahili",  script: "latin",      tag: "SW",  region: "Восточная Африка" },
    { text: "Ленін",   lang: "Українська", script: "cyrillic",   tag: "UK",  region: "Украина" },
    { text: "Ленін",   lang: "Беларуская", script: "cyrillic",   tag: "BE",  region: "Беларусь" },
    { text: "Ленин",   lang: "Қазақша",    script: "cyrillic",   tag: "KK",  region: "Казахстан" },
    { text: "Ленин",   lang: "Кыргызча",   script: "cyrillic",   tag: "KY",  region: "Кыргызстан" },
    { text: "Ленин",   lang: "Монгол",     script: "cyrillic",   tag: "MN",  region: "Монголия" },
    { text: "Լենին",   lang: "Հայերեն",    script: "armenian",   tag: "HY",  region: "Армения" },
    { text: "ლენინი",  lang: "ქართული",    script: "georgian",   tag: "KA",  region: "Грузия" },
    { text: "Λένιν",   lang: "Ελληνικά",   script: "greek",      tag: "EL",  region: "Греция" },
    { text: "לנין",    lang: "עברית",     script: "hebrew",     tag: "HE",  region: "Израиль" },
    { text: "لنین",    lang: "فارسی",     script: "arabic",     tag: "FA",  region: "Иран" },
    { text: "لینن",    lang: "اردو",      script: "arabic",     tag: "UR",  region: "Пакистан" },
    { text: "レーニン", lang: "日本語",      script: "cjk",        tag: "JA",  region: "Япония" },
    { text: "레닌",     lang: "한국어",      script: "hangul",     tag: "KO",  region: "Корея" },
    { text: "เลนิน",   lang: "ไทย",       script: "thai",       tag: "TH",  region: "Таиланд" },
    { text: "லெனின்",  lang: "தமிழ்",     script: "tamil",      tag: "TA",  region: "Юж. Индия, Шри-Ланка" },
    { text: "లెనిన్",  lang: "తెలుగు",    script: "telugu",     tag: "TE",  region: "Андхра-Прадеш" },
    { text: "ಲೆನಿನ್",  lang: "ಕನ್ನಡ",     script: "kannada",    tag: "KN",  region: "Карнатака" },
    { text: "ലെനിൻ",  lang: "മലയാളം",   script: "malayalam",  tag: "ML",  region: "Керала" },
    { text: "ਲੈਨਿਨ",   lang: "ਪੰਜਾਬੀ",    script: "gurmukhi",   tag: "PA",  region: "Пенджаб" },
    { text: "लेनिन",   lang: "मराठी",     script: "devanagari", tag: "MR",  region: "Махараштра" },
    { text: "लेनिन",   lang: "नेपाली",    script: "devanagari", tag: "NE",  region: "Непал" },
    { text: "ලෙනින්",  lang: "සිංහල",    script: "sinhala",    tag: "SI",  region: "Шри-Ланка" },
    { text: "ሌኒን",     lang: "Amharic",   script: "ethiopic",   tag: "AM",  region: "Эфиопия" },
    { text: "ເລນິນ",   lang: "ລາວ",       script: "lao",        tag: "LO",  region: "Лаос" },
    { text: "លេនីន",   lang: "ខ្មែរ",      script: "khmer",      tag: "KM",  region: "Камбоджа" },
    { text: "လီနင်",   lang: "မြန်မာ",    script: "myanmar",    tag: "MY",  region: "Мьянма" }
  ];

  // Grid 6 cols × 7 rows when in portrait/square, 7×6 in landscape
  let cols = 6, rows = 7;

  let width = 0, height = 0, dpr = 1;
  let start = performance.now();
  let previousTime = 0;

  const cells = []; // [{x, y, w, h, entry, pulsePhase, hoverT}]
  let hoverIndex = -1;
  let pressIndex = -1;

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

  function buildGrid() {
    cells.length = 0;
    // Layout: choose orientation based on aspect ratio
    if (height >= width) {
      cols = 6; rows = 7;
    } else {
      cols = 7; rows = 6;
    }
    const marginX = Math.min(width, height) * 0.025;
    const marginY = Math.min(width, height) * 0.025;
    const cellW = (width - marginX * (cols + 1)) / cols;
    const cellH = (height - marginY * (rows + 1)) / rows;

    const rng = makeRng(0xCA7A106);
    for (let i = 0; i < entries.length; i += 1) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      if (r >= rows) break;
      cells.push({
        x: marginX + c * (cellW + marginX),
        y: marginY + r * (cellH + marginY),
        w: cellW,
        h: cellH,
        entry: entries[i],
        pulsePhase: rng() * Math.PI * 2,
        hoverT: 0
      });
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
    buildGrid();
  }

  function drawCell(cell, idx, time) {
    const isHover = idx === hoverIndex;
    const isPress = idx === pressIndex;
    const target = isPress ? 1.0 : isHover ? 0.55 : 0;
    cell.hoverT += (target - cell.hoverT) * 0.18;
    const h = cell.hoverT;

    const breath = 1 + Math.sin(time * 0.5 + cell.pulsePhase) * 0.012;
    const scale = 1 + h * 0.04;

    const cx = cell.x + cell.w * 0.5;
    const cy = cell.y + cell.h * 0.5;
    const w = cell.w * scale;
    const hgt = cell.h * scale;
    const x0 = cx - w * 0.5;
    const y0 = cy - hgt * 0.5;

    // Background card
    ctx.save();
    ctx.beginPath();
    const radius = Math.min(w, hgt) * 0.04;
    roundedRect(ctx, x0, y0, w, hgt, radius);
    const baseAlpha = 0.22 + h * 0.18;
    ctx.fillStyle = cssColor(palette.black, baseAlpha);
    ctx.fill();

    // Border — latún when hover, faint window otherwise
    ctx.lineWidth = 1 + h * 1.8;
    ctx.strokeStyle = cssColor(palette.brass, 0.18 + h * 0.6);
    ctx.stroke();
    ctx.restore();

    // Main word (large)
    const wordSize = Math.min(w, hgt) * 0.30 * breath;
    const weight = cell.entry.script === "latin" || cell.entry.script === "cyrillic" ? 600 : 400;
    ctx.save();
    ctx.font = fontStack(cell.entry.script, wordSize, weight);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = cssColor(palette.black, 0.6);
    ctx.shadowBlur = 10 + h * 16;
    ctx.fillStyle = h > 0.6 ? palette.brass : palette.paper;
    ctx.globalAlpha = 0.88 + h * 0.12;
    ctx.fillText(cell.entry.text, cx, cy - hgt * 0.06);
    ctx.restore();

    // Language label (small, mono)
    ctx.save();
    const labelSize = Math.min(w, hgt) * 0.085;
    ctx.font = `400 ${labelSize}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = cssColor(palette.paper, 0.62 + h * 0.3);
    ctx.fillText(cell.entry.lang, cx, y0 + hgt - hgt * 0.13);
    ctx.restore();

    // Script tag (top-left corner)
    ctx.save();
    const tagSize = Math.min(w, hgt) * 0.075;
    ctx.font = `600 ${tagSize}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = cssColor(palette.brass, 0.55 + h * 0.4);
    ctx.fillText(cell.entry.tag, x0 + w * 0.06, y0 + hgt * 0.07);
    ctx.restore();

    // Region label (revealed on hover)
    if (h > 0.05) {
      ctx.save();
      const regSize = Math.min(w, hgt) * 0.068;
      ctx.font = `400 ${regSize}px "20 Kopeek", "Courier New", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = cssColor(palette.brass, 0.35 + h * 0.4);
      ctx.globalAlpha = h;
      ctx.fillText(cell.entry.region, cx, y0 + hgt - hgt * 0.04);
      ctx.restore();
    }
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function render(now) {
    const time = (now - start) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, time - previousTime));
    previousTime = time;

    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < cells.length; i += 1) drawCell(cells[i], i, time);

    requestAnimationFrame(render);
  }

  function findCellAt(x, y) {
    for (let i = 0; i < cells.length; i += 1) {
      const c = cells[i];
      if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return i;
    }
    return -1;
  }

  window.addEventListener("resize", resize);

  canvas.addEventListener("pointermove", event => {
    hoverIndex = findCellAt(event.clientX, event.clientY);
  }, { passive: true });

  canvas.addEventListener("pointerleave", () => { hoverIndex = -1; });

  canvas.addEventListener("pointerdown", event => {
    pressIndex = findCellAt(event.clientX, event.clientY);
    hoverIndex = pressIndex;
    if (pressIndex >= 0 && canvas.setPointerCapture) {
      canvas.setPointerCapture(event.pointerId);
    }
  });

  canvas.addEventListener("pointerup", event => {
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    pressIndex = -1;
  });

  canvas.addEventListener("pointercancel", () => { pressIndex = -1; });

  resize();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      buildGrid();
      requestAnimationFrame(render);
    });
  } else {
    requestAnimationFrame(render);
  }
})();
