(function () {
  const canvas = document.getElementById("map");
  const ctx = canvas.getContext("2d", { alpha: true });

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    window: "#9DA3A6",
    black: "#000000"
  };

  // Languages with primary geographic coordinates (city / region center).
  // `weight` ~ rough scaling for visual emphasis of main languages.
  // `speakers` in millions (native + L2, rough order-of-magnitude).
  const points = [
    { text: "Ленин",   lang: "Русский",    script: "cyrillic",   lat: 55.75,  lng: 37.62,  weight: 3, speakers: 258,  region: "Россия, СНГ" },
    { text: "Lenin",   lang: "English",    script: "latin",      lat: 51.51,  lng: -0.13,  weight: 3, speakers: 1456, region: "Великобритания, США, мир" },
    { text: "Lénine",  lang: "Français",   script: "latin",      lat: 48.85,  lng: 2.35,   weight: 3, speakers: 274,  region: "Франция, Зап. и Центр. Африка" },
    { text: "Lenin",   lang: "Español",    script: "latin",      lat: 40.42,  lng: -3.70,  weight: 3, speakers: 559,  region: "Испания, Латинская Америка" },
    { text: "لينين",   lang: "العربية",   script: "arabic",     lat: 30.04,  lng: 31.24,  weight: 3, speakers: 422,  region: "Арабский мир" },
    { text: "列宁",     lang: "中文",        script: "cjk",        lat: 39.90,  lng: 116.41, weight: 3, speakers: 1138, region: "Китай, Тайвань, диаспора" },
    { text: "लेनिन",   lang: "Hindi",      script: "devanagari", lat: 28.61,  lng: 77.21,  weight: 2, speakers: 609,  region: "Север Индии" },
    { text: "লেনিন",   lang: "Bengali",    script: "bengali",    lat: 23.81,  lng: 90.41,  weight: 2, speakers: 273,  region: "Бангладеш, Зап. Бенгалия" },
    { text: "Lênin",   lang: "Português",  script: "latin",      lat: 38.72,  lng: -9.14,  weight: 2, speakers: 263,  region: "Португалия, Бразилия, Ангола" },
    { text: "Lenin",   lang: "Deutsch",    script: "latin",      lat: 52.52,  lng: 13.40,  weight: 2, speakers: 133,  region: "Германия, Австрия, Швейцария" },
    { text: "Lenin",   lang: "Italiano",   script: "latin",      lat: 41.89,  lng: 12.49,  weight: 2, speakers: 65,   region: "Италия, Швейцария" },
    { text: "Lenin",   lang: "Polski",     script: "latin",      lat: 52.23,  lng: 21.01,  weight: 1, speakers: 41,   region: "Польша" },
    { text: "Lenin",   lang: "Türkçe",     script: "latin",      lat: 39.93,  lng: 32.86,  weight: 1, speakers: 88,   region: "Турция, Кипр" },
    { text: "Lenin",   lang: "Indonesia",  script: "latin",      lat: -6.21,  lng: 106.85, weight: 2, speakers: 199,  region: "Индонезия" },
    { text: "Lênin",   lang: "Tiếng Việt", script: "latin",      lat: 21.03,  lng: 105.85, weight: 1, speakers: 86,   region: "Вьетнам" },
    { text: "Lenin",   lang: "Kiswahili",  script: "latin",      lat: -6.79,  lng: 39.21,  weight: 1, speakers: 200,  region: "Восточная Африка" },
    { text: "Ленін",   lang: "Українська", script: "cyrillic",   lat: 50.45,  lng: 30.52,  weight: 1, speakers: 40,   region: "Украина" },
    { text: "Ленін",   lang: "Беларуская", script: "cyrillic",   lat: 53.90,  lng: 27.57,  weight: 1, speakers: 5,    region: "Беларусь" },
    { text: "Ленин",   lang: "Қазақша",    script: "cyrillic",   lat: 51.17,  lng: 71.45,  weight: 1, speakers: 13,   region: "Казахстан" },
    { text: "Ленин",   lang: "Кыргызча",   script: "cyrillic",   lat: 42.87,  lng: 74.59,  weight: 1, speakers: 7,    region: "Кыргызстан" },
    { text: "Ленин",   lang: "Монгол",     script: "cyrillic",   lat: 47.92,  lng: 106.92, weight: 1, speakers: 5,    region: "Монголия" },
    { text: "Լենին",   lang: "Հայերեն",    script: "armenian",   lat: 40.18,  lng: 44.51,  weight: 1, speakers: 6,    region: "Армения, диаспора" },
    { text: "ლენინი",  lang: "ქართული",   script: "georgian",   lat: 41.72,  lng: 44.79,  weight: 1, speakers: 4,    region: "Грузия" },
    { text: "Λένιν",   lang: "Ελληνικά",   script: "greek",      lat: 37.98,  lng: 23.73,  weight: 1, speakers: 13,   region: "Греция, Кипр" },
    { text: "לנין",    lang: "עברית",     script: "hebrew",     lat: 31.78,  lng: 35.22,  weight: 1, speakers: 9,    region: "Израиль" },
    { text: "لنین",    lang: "فارسی",     script: "arabic",     lat: 35.69,  lng: 51.39,  weight: 1, speakers: 110,  region: "Иран, Афганистан, Таджикистан" },
    { text: "لینن",    lang: "اردو",      script: "arabic",     lat: 24.86,  lng: 67.00,  weight: 1, speakers: 232,  region: "Пакистан, Север Индии" },
    { text: "レーニン", lang: "日本語",      script: "cjk",        lat: 35.68,  lng: 139.69, weight: 2, speakers: 125,  region: "Япония" },
    { text: "레닌",     lang: "한국어",      script: "hangul",     lat: 37.57,  lng: 126.98, weight: 1, speakers: 81,   region: "Корея" },
    { text: "เลนิน",   lang: "ไทย",       script: "thai",       lat: 13.76,  lng: 100.50, weight: 1, speakers: 60,   region: "Таиланд" },
    { text: "லெனின்",  lang: "தமிழ்",     script: "tamil",      lat: 13.08,  lng: 80.27,  weight: 1, speakers: 86,   region: "Юж. Индия, Шри-Ланка" },
    { text: "లెనిన్",  lang: "తెలుగు",    script: "telugu",     lat: 17.39,  lng: 78.49,  weight: 1, speakers: 96,   region: "Андхра-Прадеш, Телангана" },
    { text: "ಲೆನಿನ್",  lang: "ಕನ್ನಡ",     script: "kannada",    lat: 12.97,  lng: 77.59,  weight: 1, speakers: 56,   region: "Карнатака" },
    { text: "ലെനിൻ",  lang: "മലയാളം",   script: "malayalam",  lat: 9.93,   lng: 76.27,  weight: 1, speakers: 38,   region: "Керала" },
    { text: "ਲੈਨਿਨ",   lang: "ਪੰਜਾਬੀ",    script: "gurmukhi",   lat: 31.55,  lng: 74.34,  weight: 1, speakers: 113,  region: "Пенджаб (Индия / Пакистан)" },
    { text: "लेनिन",   lang: "मराठी",     script: "devanagari", lat: 19.08,  lng: 72.88,  weight: 1, speakers: 99,   region: "Махараштра" },
    { text: "लेनिन",   lang: "नेपाली",    script: "devanagari", lat: 27.71,  lng: 85.32,  weight: 1, speakers: 32,   region: "Непал" },
    { text: "ලෙනින්",  lang: "සිංහල",    script: "sinhala",    lat: 6.93,   lng: 79.86,  weight: 1, speakers: 17,   region: "Шри-Ланка" },
    { text: "ሌኒን",     lang: "Amharic",   script: "ethiopic",   lat: 9.03,   lng: 38.74,  weight: 1, speakers: 32,   region: "Эфиопия" },
    { text: "ເລນິນ",   lang: "ລາວ",       script: "lao",        lat: 17.97,  lng: 102.60, weight: 1, speakers: 30,   region: "Лаос, Сев.-Восток Таиланда" },
    { text: "លេនីន",   lang: "ខ្មែរ",     script: "khmer",      lat: 11.55,  lng: 104.92, weight: 1, speakers: 17,   region: "Камбоджа" },
    { text: "လီနင်",   lang: "မြန်မာ",   script: "myanmar",    lat: 19.74,  lng: 96.08,  weight: 1, speakers: 33,   region: "Мьянма" }
  ];

  let width = 0, height = 0, dpr = 1;
  let start = performance.now();
  let previousTime = 0;

  // Map: equirectangular projection.  World fits into a "world rect" of size
  // (worldW, worldH) where worldW = 2 × worldH, lon [-180,180] → [0, worldW].
  // The view is a sub-rect of this, panned by (camX, camY).
  const map = {
    worldW: 0,
    worldH: 0,
    camX: 0,
    camY: 0,
    camVX: 0,
    camVY: 0,
    dragging: false,
    geojson: null,
    cached: null    // offscreen canvas with the map drawn once
  };

  let geoLoaded = false;

  let hoverIndex = -1;
  let lastPointerX = 0, lastPointerY = 0, lastPointerTime = 0;

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

  function project(lat, lng) {
    const x = ((lng + 180) / 360) * map.worldW;
    const y = ((90 - lat) / 180) * map.worldH;
    return { x, y };
  }

  function buildWorldCache() {
    if (!map.geojson) return;
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.floor(map.worldW));
    off.height = Math.max(1, Math.floor(map.worldH));
    const g = off.getContext("2d");

    // Soft tint over the whole map area
    g.fillStyle = "rgba(247, 249, 239, 0.018)";
    g.fillRect(0, 0, off.width, off.height);

    // Country outlines
    g.strokeStyle = cssColor(palette.window, 0.32);
    g.lineWidth = 0.8;
    g.fillStyle = "rgba(157, 163, 166, 0.06)";

    const features = map.geojson.features || [];
    for (let i = 0; i < features.length; i += 1) {
      const f = features[i];
      const geom = f.geometry;
      if (!geom) continue;
      const polys =
        geom.type === "Polygon" ? [geom.coordinates] :
        geom.type === "MultiPolygon" ? geom.coordinates :
        null;
      if (!polys) continue;
      for (const poly of polys) {
        const ring = poly[0];
        if (!ring || ring.length < 2) continue;
        g.beginPath();
        for (let k = 0; k < ring.length; k += 1) {
          const [lng, lat] = ring[k];
          const x = ((lng + 180) / 360) * map.worldW;
          const y = ((90 - lat) / 180) * map.worldH;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.fill();
        g.stroke();
      }
    }

    // Equator and meridian guides — very faint
    g.strokeStyle = cssColor(palette.brass, 0.10);
    g.lineWidth = 0.6;
    g.setLineDash([2, 14]);
    // Equator
    g.beginPath();
    g.moveTo(0, map.worldH * 0.5);
    g.lineTo(map.worldW, map.worldH * 0.5);
    g.stroke();
    // Meridians every 30°
    for (let lng = -180; lng <= 180; lng += 30) {
      const x = ((lng + 180) / 360) * map.worldW;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, map.worldH);
      g.stroke();
    }
    g.setLineDash([]);

    map.cached = off;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Map scale: fit the bounding box of the actual points (with padding)
    // into the canvas width.  We don't need the whole world — the 42 points
    // sit roughly between lng -10° (Lisbon) and +140° (Tokyo), lat -7° to +56°.
    const padLng = 10;   // extra degrees on each side
    const padLat = 8;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const bboxMinLat = minLat - padLat;
    const bboxMaxLat = maxLat + padLat;
    const bboxMinLng = minLng - padLng;
    const bboxMaxLng = maxLng + padLng;
    const lngSpan = bboxMaxLng - bboxMinLng;

    // Scale world so the bbox's lng span fills the viewport width.
    map.worldW = width * (360 / lngSpan);
    map.worldH = map.worldW / 2;

    // Centre camera on the bbox.
    const topLeft = project(bboxMaxLat, bboxMinLng);
    const bottomRight = project(bboxMinLat, bboxMaxLng);
    const bboxCenterX = (topLeft.x + bottomRight.x) / 2;
    const bboxCenterY = (topLeft.y + bottomRight.y) / 2;
    map.camX = bboxCenterX - width / 2;
    map.camY = bboxCenterY - height / 2;
    map.camYAnchor = map.camY;       // remember for vertical lock

    if (map.geojson) buildWorldCache();
  }

  function applyDynamics(dt) {
    if (map.dragging) return;
    map.camX += map.camVX * dt;
    map.camY += map.camVY * dt;
    map.camVX *= Math.pow(0.91, dt * 60);
    map.camVY *= Math.pow(0.91, dt * 60);
    if (Math.abs(map.camVX) < 0.5) map.camVX = 0;
    if (Math.abs(map.camVY) < 0.5) map.camVY = 0;

    // Vertical: lock to the camY set in resize() (centres the bbox of points).
    // If user-dragged off too far, snap back so something is still visible.
    if (map.worldH < height) {
      map.camY = map.camYAnchor;
      map.camVY = 0;
    } else {
      const maxY = map.worldH - height + map.worldH * 0.04;
      const minY = -map.worldH * 0.04;
      if (map.camY > maxY) map.camY = maxY;
      if (map.camY < minY) map.camY = minY;
    }
    // Horizontal: wrap around the globe.
    if (map.camX < 0) map.camX += map.worldW;
    if (map.camX >= map.worldW) map.camX -= map.worldW;
  }

  function pointToScreen(lat, lng) {
    const w = project(lat, lng);
    let x = w.x - map.camX;
    if (x < -map.worldW * 0.5) x += map.worldW;
    else if (x > map.worldW * 0.5) x -= map.worldW;
    return { x, y: w.y - map.camY };
  }

  function drawBaseMap() {
    if (!map.cached) return;
    // Draw the world cache twice on x to allow seamless horizontal pan
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(map.cached, -map.camX, -map.camY);
    ctx.drawImage(map.cached, -map.camX + map.worldW, -map.camY);
    ctx.drawImage(map.cached, -map.camX - map.worldW, -map.camY);
    ctx.restore();
  }

  function drawConnections() {
    // Brass lines between primary languages (weight ≥ 2) — like ideological routes
    ctx.save();
    ctx.strokeStyle = cssColor(palette.brass, 0.12);
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 8]);
    const primaries = points.filter(p => p.weight >= 2);
    const moscow = points[0];
    // Spokes from Moscow to each primary
    for (const p of primaries) {
      if (p === moscow) continue;
      const a = pointToScreen(moscow.lat, moscow.lng);
      const b = pointToScreen(p.lat, p.lng);
      // Skip lines that span impossibly long (world wrap edges)
      if (Math.abs(a.x - b.x) > width * 1.2) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawPoints() {
    const cxCanvas = width * 0.5;
    const cyCanvas = height * 0.5;
    const shortSide = Math.min(width, height);

    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const s = pointToScreen(p.lat, p.lng);
      if (s.x < -200 || s.x > width + 200 || s.y < -100 || s.y > height + 100) continue;

      // Distance from screen center → emphasis
      const dx = s.x - cxCanvas;
      const dy = s.y - cyCanvas;
      const d = Math.hypot(dx, dy);
      const proximity = Math.max(0, 1 - d / (shortSide * 0.55));
      const isHover = i === hoverIndex;

      // Marker dot
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2 + p.weight * 1.2 + proximity * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = palette.red;
      ctx.globalAlpha = 0.86;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Word
      const baseSize = shortSide * (0.018 + p.weight * 0.008) + proximity * shortSide * 0.012;
      const weight = p.weight >= 2 ? 600 : 400;
      const tone = isHover ? "brass" : p.weight >= 3 ? "paper" : "paper";
      const color = isHover ? palette.brass : palette.paper;

      ctx.font = fontStack(p.script, baseSize, weight);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.shadowColor = cssColor(palette.black, 0.75);
      ctx.shadowBlur = 8 + proximity * 14;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5 + proximity * 0.5;

      // Word offset above-right of the marker
      const ox = baseSize * 0.4;
      const oy = -baseSize * 0.15;
      ctx.fillText(p.text, s.x + ox, s.y + oy);

      // Language sub-label
      if (proximity > 0.25 || isHover) {
        ctx.font = `400 ${baseSize * 0.45}px "20 Kopeek", "Courier New", monospace`;
        ctx.shadowBlur = 4;
        ctx.fillStyle = cssColor(palette.brass, 0.6 + proximity * 0.3);
        ctx.fillText(p.lang, s.x + ox, s.y + oy + baseSize * 0.6);
      }
      ctx.globalAlpha = 1;
    }
  }

  function render(now) {
    const time = (now - start) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, time - previousTime));
    previousTime = time;
    applyDynamics(dt);

    ctx.clearRect(0, 0, width, height);
    if (geoLoaded) drawBaseMap();
    drawConnections();
    drawPoints();

    if (!geoLoaded) {
      ctx.save();
      ctx.fillStyle = cssColor(palette.paper, 0.4);
      ctx.font = `400 ${Math.min(width, height) * 0.022}px "20 Kopeek", "Courier New", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("загрузка контуров…", width * 0.5, height * 0.5);
      ctx.restore();
    }

    requestAnimationFrame(render);
  }

  function findPointAt(x, y) {
    const shortSide = Math.min(width, height);
    let best = -1;
    let bestDist = shortSide * 0.06;
    for (let i = 0; i < points.length; i += 1) {
      const s = pointToScreen(points[i].lat, points[i].lng);
      const d = Math.hypot(x - s.x, y - s.y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  window.addEventListener("resize", resize);

  // ── Modal info window ────────────────────────────────────────────────
  const modal = document.getElementById("info-modal");
  const backdrop = document.getElementById("info-backdrop");
  const elWord = document.getElementById("info-word");
  const elLang = document.getElementById("info-lang");
  const elRegion = document.getElementById("info-region");
  const elSpeakers = document.getElementById("info-speakers");
  const elScript = document.getElementById("info-script");
  let modalOpen = false;

  const scriptNames = {
    cyrillic: "Кириллица",
    latin: "Латиница",
    arabic: "Арабская",
    cjk: "Иероглифика",
    devanagari: "Деванагари",
    bengali: "Бенгальская",
    armenian: "Армянская",
    georgian: "Грузинская",
    greek: "Греческая",
    hebrew: "Еврейская",
    hangul: "Хангыль",
    thai: "Тайская",
    tamil: "Тамильская",
    telugu: "Телугу",
    kannada: "Каннада",
    malayalam: "Малаялам",
    gurmukhi: "Гурмукхи",
    sinhala: "Сингальская",
    ethiopic: "Эфиопская",
    lao: "Лаосская",
    khmer: "Кхмерская",
    myanmar: "Бирманская"
  };

  function formatSpeakers(millions) {
    if (millions >= 1000) {
      const bln = millions / 1000;
      const s = bln >= 10 ? bln.toFixed(0) : bln.toFixed(1);
      return `≈ ${s.replace(".", ",")} млрд носителей`;
    }
    return `≈ ${millions} млн носителей`;
  }

  function openModal(entry) {
    elWord.textContent = entry.text;
    elLang.textContent = entry.lang;
    elRegion.textContent = entry.region || "—";
    elSpeakers.textContent = formatSpeakers(entry.speakers || 0);
    elScript.textContent = scriptNames[entry.script] || entry.script;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    modalOpen = true;
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    modalOpen = false;
  }

  backdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
  });

  // ── Pointer / tap detection ──────────────────────────────────────────
  let pointerDownX = 0, pointerDownY = 0, pointerDownTime = 0;
  let movedDuringDrag = false;
  const TAP_MOVE_THRESHOLD = 12;     // px
  const TAP_TIME_THRESHOLD = 500;    // ms

  canvas.addEventListener("pointerdown", event => {
    if (modalOpen) return;             // ignore canvas interactions while modal is up
    map.dragging = true;
    movedDuringDrag = false;
    pointerDownX = event.clientX;
    pointerDownY = event.clientY;
    pointerDownTime = performance.now();
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = performance.now();
    hoverIndex = findPointAt(event.clientX, event.clientY);
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (map.dragging) {
      const totalDx = event.clientX - pointerDownX;
      const totalDy = event.clientY - pointerDownY;
      if (Math.hypot(totalDx, totalDy) > TAP_MOVE_THRESHOLD) {
        movedDuringDrag = true;
      }
      const now = performance.now();
      const dt = Math.max(16, now - lastPointerTime) / 1000;
      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      map.camX -= dx;
      map.camY -= dy;
      map.camVX = -dx / dt;
      map.camVY = -dy / dt;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastPointerTime = now;
    } else {
      hoverIndex = findPointAt(event.clientX, event.clientY);
    }
  }, { passive: true });

  canvas.addEventListener("pointerup", event => {
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    // Tap detection: short, near-stationary press on a point opens its modal.
    if (!movedDuringDrag && (performance.now() - pointerDownTime) < TAP_TIME_THRESHOLD) {
      const hit = findPointAt(event.clientX, event.clientY);
      if (hit >= 0) {
        openModal(points[hit]);
        // Cancel any drag inertia from the tap
        map.camVX = 0;
        map.camVY = 0;
      }
    }
    map.dragging = false;
    movedDuringDrag = false;
  });

  canvas.addEventListener("pointerleave", () => {
    map.dragging = false;
    hoverIndex = -1;
  });

  canvas.addEventListener("pointercancel", () => {
    map.dragging = false;
    movedDuringDrag = false;
  });

  // Load GeoJSON from the data/ directory (owned by bold-booth chat — read-only here)
  fetch("../data/ne_110m_countries.geojson")
    .then(r => {
      if (!r.ok) throw new Error("geojson load failed: " + r.status);
      return r.json();
    })
    .then(json => {
      map.geojson = json;
      buildWorldCache();
      geoLoaded = true;
    })
    .catch(err => {
      // eslint-disable-next-line no-console
      console.warn("Could not load countries geojson:", err);
      // Render still works — just no country outlines.
      geoLoaded = false;
    });

  resize();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(render));
  } else {
    requestAnimationFrame(render);
  }
})();
