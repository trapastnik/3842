(function () {
  const canvas = document.getElementById("silhouettes");
  const ctx = canvas.getContext("2d", { alpha: true });

  // Curated rembg silhouettes per monument
  const silhouetteImages = {};   // id → HTMLImageElement (or absent)

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    graphite: "#435059",
    window: "#9DA3A6",
  };

  // Heights loaded from assets/mtk41/heights.json (curator's monument table).
  let HEIGHTS = {};
  const FALLBACK_HEIGHT = { statue: 5.0, pedestal: 2.0 };

  const HUMAN_HEIGHT_M = 1.75;

  let width = 0, height = 0, dpr = 1;
  let monuments = [];
  let placed = [];                     // { i, worldX, baseY, w, statueH, pedestalH, totalH }
  let selectedIndex = -1;

  // Horizontal pan state — items keep `worldX` (absolute), `viewOffsetX` scrolls
  let viewOffsetX = 0;
  let contentLeft = 0;
  let contentRight = 0;
  const PAD_LEFT = 0.13;
  const MIN_SLOT_W = 84;

  // Навигация — та же, что в mtk41-scale: 283 силуэта при слоте 84 px дают
  // ленту в 23 772 px, шесть экранов драга без единого ориентира. Механика
  // общая, но живёт копией в каждом прототипе: они самостоятельные папки,
  // и общий модуль связал бы их сильнее, чем нужно на стадии эскизов.
  const MODES = [
    { id: "scrubber", label: "Скраббер" },
    { id: "zoom", label: "Зум" },
    { id: "decades", label: "Десятилетия" },
  ];
  const STORAGE_KEY = "mtk41-silhouettes-mode";
  const STRIP_H = 74;
  const STRIP_PAD = 28;
  const FRICTION = 0.93;
  const MIN_VELOCITY = 0.4;
  const SLOT_MAX = 120;
  const LABEL_MIN_SLOT = 34;
  const YEAR_MIN_SLOT = 16;
  const TAP_MIN_SLOT = 26;
  const DOUBLE_TAP_MS = 320;

  let mode = "scrubber";
  let slotWZoom = 0;
  let fitSlotW = 0;
  let activeDecade = null;
  let globalMaxTotal = 0;
  let onStrip = false;
  let velocityX = 0;
  const pointers = new Map();
  let pinchStartDist = 0, pinchStartSlot = 0, pinchAnchorX = 0;
  let lastTapAt = 0;

  function hasStrip() { return mode === "scrubber"; }
  function stripTop() { return height - STRIP_H; }


  // --- Card delegation ----------------------------------------------------
  // All card UI lives in assets/mtk41/lib/card.{css,js}. Delegate to it.

  function showMonument(index) {
    selectedIndex = index;
    if (window.MtkCard) window.MtkCard.show(monuments[index]);
  }
  function hideMonument() {
    if (window.MtkCard) window.MtkCard.hide();
  }
  document.addEventListener("mtk-card-hidden", () => { selectedIndex = -1; });

  let pressStartX = 0, pressStartY = 0;
  let didDrag = false;
  let pointerDown = false;
  const TAP_THRESHOLD = 8;

  function cssColor(hex, alpha) {
    const v = hex.replace("#", "");
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function statusColor(status) {
    switch (status) {
      case "extant":     return palette.red;
      case "demolished": return palette.graphite;
      case "relocated":  return palette.brass;
      default:           return palette.window;
    }
  }

  function totalHeight(id) {
    const h = HEIGHTS[id] || FALLBACK_HEIGHT;
    return h.statue + h.pedestal;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
  }

  function layout() {
    placed = [];
    if (!monuments.length) return;

    // Sort chronologically (null years assigned to their decade midpoint)
    const all = monuments.map((m, i) => {
      let y = m.year;
      if (typeof y !== "number") {
        if (m.id && m.id.includes("1920s")) y = 1925;
        else if (m.id === "gorki-pinchuk-taurit") y = 1949;
        else y = 1930;
      }
      return { m, i, year: y };
    }).sort((a, b) => a.year - b.year);

    // Масштаб метра — по ВСЕМУ корпусу, а не по видимому: иначе на странице
    // 1920-х бюст занял бы столько же, сколько колосс 57 м, и сравнение
    // силуэтов в общем масштабе перестало бы работать.
    globalMaxTotal = 0;
    for (const it of all) globalMaxTotal = Math.max(globalMaxTotal, totalHeight(it.m.id));

    const items = (mode === "decades" && activeDecade !== null)
      ? all.filter(it => Math.floor(it.year / 10) * 10 === activeDecade)
      : all;
    if (!items.length) return;

    const left = width * PAD_LEFT;
    const right = width * 0.98;
    const viewportW = right - left;
    const baseY = hasStrip() ? (height - STRIP_H) * 0.84 : height * 0.86;
    const skyTop = height * 0.20;
    const usableHeight = baseY - skyTop;
    const mPx = (usableHeight * 0.9) / globalMaxTotal;

    fitSlotW = viewportW / items.length;
    let slotW;
    if (mode === "zoom") {
      if (!slotWZoom) slotWZoom = fitSlotW;
      slotWZoom = Math.min(SLOT_MAX, Math.max(fitSlotW, slotWZoom));
      slotW = slotWZoom;
    } else if (mode === "decades") {
      slotW = Math.max(30, Math.min(MIN_SLOT_W * 1.6, fitSlotW));
    } else {
      slotW = Math.max(MIN_SLOT_W, fitSlotW);
    }
    const figureW = Math.min(slotW * 0.55, 80);

    for (let k = 0; k < items.length; k += 1) {
      const it = items[k];
      const m = it.m;
      const h = HEIGHTS[m.id] || FALLBACK_HEIGHT;
      const worldX = left + slotW * (k + 0.5);
      const totalH = (h.statue + h.pedestal) * mPx;
      const statueH = h.statue * mPx;
      const pedestalH = h.pedestal * mPx;
      placed.push({
        i: it.i, year: it.year, m,
        worldX, baseY,
        w: figureW,
        statueH, pedestalH, totalH,
        h_statue: h.statue, h_pedestal: h.pedestal,
        estimated: !HEIGHTS[m.id],
      });
    }

    contentLeft = left;
    contentRight = left + slotW * items.length;
    clampPan();

    layout.mPx = mPx;
    layout.left = left;
    layout.right = right;
    layout.baseY = baseY;
    layout.slotW = slotW;
  }

  function clampPan() {
    const contentW = contentRight - contentLeft;
    const viewportW = (layout.right || width * 0.98) - (layout.left || width * PAD_LEFT);
    if (contentW <= viewportW) { viewOffsetX = 0; return; }
    const min = viewportW - contentW;
    const max = 0;
    if (viewOffsetX > max) viewOffsetX = max;
    if (viewOffsetX < min) viewOffsetX = min;
  }

  function screenX(worldX) { return worldX + viewOffsetX; }

  function drawScene() {
    const mPx = layout.mPx || 1;
    const baseY = layout.baseY || height * 0.86;

    // Ground line
    ctx.strokeStyle = cssColor(palette.brass, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(width, baseY);
    ctx.stroke();

    // Horizontal height guides (1.75, 5, 10, 25, 50 metres)
    const guides = [1.75, 5, 10, 25, 50];
    ctx.save();
    ctx.font = `400 ${Math.max(11, height * 0.013)}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const m of guides) {
      const y = baseY - m * mPx;
      if (y < height * 0.05) continue;
      const isHuman = m === HUMAN_HEIGHT_M;
      ctx.strokeStyle = isHuman ? cssColor(palette.brass, 0.4) : cssColor(palette.paper, 0.10);
      ctx.lineWidth = isHuman ? 1.2 : 0.7;
      ctx.setLineDash(isHuman ? [4, 6] : [2, 10]);
      ctx.beginPath();
      ctx.moveTo(width * 0.08, y);
      ctx.lineTo(width * 0.97, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cssColor(palette.paper, isHuman ? 0.9 : 0.45);
      const txt = isHuman ? `${m} м — человек` : `${m} м`;
      ctx.fillText(txt, width * 0.075, y);
    }
    ctx.restore();

    // Human figure for reference (at left edge, in front of the lineup)
    drawHumanFigure(width * 0.045, baseY, HUMAN_HEIGHT_M * mPx);
  }

  function drawHumanFigure(cx, baseY, totalPx) {
    // Stylised silhouette: head, body, legs in graphite tone
    const headR = totalPx * 0.075;
    const bodyT = totalPx * 0.55;     // body top
    const legT = totalPx * 0.20;      // legs start from
    ctx.save();
    ctx.fillStyle = cssColor(palette.paper, 0.55);

    // Head
    ctx.beginPath();
    ctx.arc(cx, baseY - totalPx + headR, headR, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.beginPath();
    ctx.moveTo(cx - totalPx * 0.06, baseY - totalPx + headR * 2);
    ctx.lineTo(cx + totalPx * 0.06, baseY - totalPx + headR * 2);
    ctx.lineTo(cx + totalPx * 0.08, baseY - legT);
    ctx.lineTo(cx - totalPx * 0.08, baseY - legT);
    ctx.closePath();
    ctx.fill();
    // Legs
    ctx.fillRect(cx - totalPx * 0.07, baseY - legT, totalPx * 0.05, legT);
    ctx.fillRect(cx + totalPx * 0.02, baseY - legT, totalPx * 0.05, legT);

    ctx.restore();
  }

  function drawProceduralFallback(pm) {
    // Used when a monument has no silhouette (kaluga / москва-октябрьская / вознесенье)
    const m = pm.m;
    const isSelected = pm.i === selectedIndex;
    const x = screenX(pm.worldX);
    const bottomOfStatue = pm.baseY - pm.pedestalH;

    ctx.fillStyle = isSelected ? cssColor(palette.brass, 0.5) : cssColor(palette.graphite, 0.92);
    ctx.fillRect(x - pm.w * 0.4, bottomOfStatue, pm.w * 0.8, pm.pedestalH);
    ctx.strokeStyle = isSelected ? palette.brass : cssColor(palette.window, 0.5);
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.setLineDash([3, 4]);
    ctx.strokeRect(x - pm.w * 0.4, bottomOfStatue, pm.w * 0.8, pm.pedestalH);
    ctx.setLineDash([]);

    const sBottom = bottomOfStatue;
    const sTop = sBottom - pm.statueH;
    ctx.save();
    ctx.fillStyle = isSelected ? palette.brass : statusColor(m.status);
    ctx.globalAlpha = m.status === "unknown" ? 0.4 : 0.6;
    // Прямоугольник корпуса + прямоугольник «головы» сверху —
    // stacked-blocks вид, без cone+sphere ассоциаций.
    const bodyW = pm.w * 0.5;
    const headW = pm.w * 0.32;
    const headH = pm.statueH * 0.22;
    const bodyTop = sTop + headH;
    ctx.fillRect(x - bodyW * 0.5, bodyTop, bodyW, sBottom - bodyTop);
    ctx.fillRect(x - headW * 0.5, sTop, headW, headH);
    ctx.restore();
  }

  function drawSilhouette(pm) {
    const m = pm.m;
    const img = silhouetteImages[m.id];
    if (!img || !img.complete || !img.naturalWidth) return false;

    const isSelected = pm.i === selectedIndex;
    const targetH = pm.totalH;
    const aspect = img.naturalWidth / img.naturalHeight;
    const targetW = targetH * aspect;
    const x = screenX(pm.worldX) - targetW / 2;
    const y = pm.baseY - targetH;

    // Coloured drop-shadow under the figure to encode status
    if (isSelected) {
      ctx.save();
      ctx.shadowColor = palette.brass;
      ctx.shadowBlur = 24;
      ctx.fillStyle = cssColor(palette.brass, 0.001);
      ctx.fillRect(x, y, targetW, targetH);
      ctx.restore();
    } else if (m.status === "extant") {
      ctx.save();
      ctx.shadowColor = cssColor(palette.red, 0.55);
      ctx.shadowBlur = 14;
      ctx.fillStyle = cssColor(palette.red, 0.001);
      ctx.fillRect(x, y, targetW, targetH);
      ctx.restore();
    }

    ctx.save();
    if (m.status === "unknown") ctx.globalAlpha = 0.65;
    if (m.status === "demolished") ctx.globalAlpha = 0.6;
    ctx.drawImage(img, x, y, targetW, targetH);
    ctx.restore();
    return true;
  }

  function drawMonuments() {
    for (const pm of placed) {
      // Try real silhouette first; if none, dashed-outline procedural fallback
      if (!drawSilhouette(pm)) drawProceduralFallback(pm);
    }

    // Labels (city + year + height) below pedestal, rotated -60° in
    // portrait or any narrow viewport so long names don't collide.
    const isPortrait = height > width;
    const slotW = layout.slotW || 60;
    // На обзорных масштабах подписи сливаются в кашу и мешают увидеть форму
    // корпуса, ради которой в мелкий масштаб и уходят.
    if (slotW < YEAR_MIN_SLOT) return;
    const showCity = slotW >= LABEL_MIN_SLOT;
    const needRotate = isPortrait || slotW < 90;

    for (const pm of placed) {
      const m = pm.m;
      const isSelected = pm.i === selectedIndex;
      const y = pm.baseY + 14;
      const fontSize = isPortrait
        ? Math.max(13, Math.min(slotW * 0.32, height * 0.014))
        : Math.max(10, Math.min(pm.w * 0.32, height * 0.013));
      ctx.save();
      ctx.font = `${isSelected ? 600 : 400} ${fontSize}px "20 Kopeek", "Courier New", monospace`;
      const cityRaw = m.city || m.country || "";
      const city = cityRaw.length > 18 ? cityRaw.slice(0, 16) + "…" : cityRaw;
      const yearLabel = pm.year ? String(pm.year) : "—";
      // «нет данных» вместо подставной высоты: у 52 памятников габаритов в
      // таблице куратора нет вовсе, и FALLBACK_HEIGHT выдавал их за измеренные.
      const heightLabel = pm.estimated
        ? "нет данных"
        : ((pm.h_statue + pm.h_pedestal).toFixed(
            pm.h_statue + pm.h_pedestal < 10 ? 1 : 0)) + " м";

      if (needRotate) {
        ctx.translate(screenX(pm.worldX), y);
        ctx.rotate(-Math.PI / 3);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.85);
        let row = 0;
        if (showCity) { ctx.fillText(city, 0, 0); row += 1; }
        ctx.fillStyle = cssColor(palette.brass, isSelected ? 0.95 : 0.6);
        ctx.fillText(yearLabel, 0, fontSize * 1.25 * row);
        if (showCity) {
          ctx.fillStyle = cssColor(palette.paper, 0.55);
          ctx.fillText(heightLabel, 0, fontSize * 2.5);
        }
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        let row = 0;
        if (showCity) {
          ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.78);
          ctx.fillText(city, screenX(pm.worldX), y);
          row += 1;
        }
        ctx.fillStyle = cssColor(palette.brass, isSelected ? 0.9 : 0.55);
        ctx.fillText(yearLabel, screenX(pm.worldX), y + fontSize * 1.4 * row);
        if (showCity) {
          ctx.fillStyle = cssColor(palette.paper, 0.55);
          ctx.fillText(heightLabel, screenX(pm.worldX), y + fontSize * 2.8);
        }
      }
      ctx.restore();
    }
  }

  // --- Полоса-скраббер -----------------------------------------------------

  function scrollFraction() {
    const contentW = contentRight - contentLeft;
    const viewportW = (layout.right || width) - (layout.left || 0);
    const span = contentW - viewportW;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, -viewOffsetX / span));
  }

  function scrollToFraction(f) {
    const contentW = contentRight - contentLeft;
    const viewportW = (layout.right || width) - (layout.left || 0);
    const span = contentW - viewportW;
    if (span <= 0) return;
    viewOffsetX = -Math.min(1, Math.max(0, f)) * span;
    clampPan();
  }

  function drawStrip() {
    if (!hasStrip() || !placed.length) return;
    const top = stripTop();
    const x0 = STRIP_PAD;
    const w = (width - STRIP_PAD) - x0;
    const barsTop = top + 20;
    const barsH = STRIP_H - 30;

    ctx.save();
    ctx.fillStyle = cssColor(palette.graphite, 0.5);
    ctx.fillRect(0, top, width, STRIP_H);
    ctx.strokeStyle = cssColor(palette.paper, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(width, top); ctx.stroke();

    const barW = Math.max(1, w / placed.length - 0.6);
    for (let k = 0; k < placed.length; k += 1) {
      const pm = placed[k];
      const bx = x0 + (w * k) / placed.length;
      const total = pm.h_statue + pm.h_pedestal;
      // sqrt — иначе 57-метровый Волгоград прижимает все остальные к нулю
      const bh = Math.max(2, barsH * Math.sqrt(total / globalMaxTotal));
      ctx.fillStyle = pm.i === selectedIndex
        ? palette.brass
        : cssColor(statusColor(pm.m.status), pm.estimated ? 0.35 : 0.75);
      ctx.fillRect(bx, barsTop + barsH - bh, barW, bh);
    }

    ctx.font = `400 11px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let lastLabelX = -Infinity;
    for (let k = 0; k < placed.length; k += 1) {
      const year = placed[k].year;
      if (!year) continue;
      const decade = Math.floor(year / 10) * 10;
      const prevDecade = k > 0 && placed[k - 1].year
        ? Math.floor(placed[k - 1].year / 10) * 10 : -1;
      if (decade === prevDecade) continue;
      const bx = x0 + (w * k) / placed.length;
      if (bx - lastLabelX < 46) continue;
      lastLabelX = bx;
      ctx.strokeStyle = cssColor(palette.paper, 0.18);
      ctx.beginPath(); ctx.moveTo(bx, barsTop); ctx.lineTo(bx, barsTop + barsH); ctx.stroke();
      ctx.fillStyle = cssColor(palette.paper, 0.5);
      ctx.fillText(String(decade), bx, top + 4);
    }

    const contentW = contentRight - contentLeft;
    const viewportW = (layout.right || width) - (layout.left || 0);
    const winW = Math.max(10, w * Math.min(1, viewportW / contentW));
    const winX = x0 + (w - winW) * scrollFraction();
    ctx.fillStyle = cssColor(palette.paper, 0.10);
    ctx.fillRect(winX, barsTop - 4, winW, barsH + 8);
    ctx.strokeStyle = palette.brass;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(winX, barsTop - 4, winW, barsH + 8);
    ctx.restore();
  }

  function stripFractionAt(clientX) {
    const x0 = STRIP_PAD;
    const w = (width - STRIP_PAD) - x0;
    const viewportW = (layout.right || width) - (layout.left || 0);
    const contentW = contentRight - contentLeft;
    const winW = Math.max(10, w * Math.min(1, viewportW / contentW));
    return (clientX - x0 - winW / 2) / Math.max(1, w - winW);
  }

  // --- Зум -----------------------------------------------------------------

  function setSlotW(next, anchorScreenX) {
    if (mode !== "zoom") return;
    const clamped = Math.min(SLOT_MAX, Math.max(fitSlotW, next));
    if (clamped === slotWZoom) return;
    const worldBefore = (anchorScreenX - viewOffsetX - (layout.left || 0)) / slotWZoom;
    slotWZoom = clamped;
    layout();
    viewOffsetX = anchorScreenX - (layout.left || 0) - worldBefore * slotWZoom;
    clampPan();
    syncControls();
  }

  // --- Панель управления ---------------------------------------------------

  function mkButton(label, count, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (count != null) {
      const sp = document.createElement("span");
      sp.className = "n";
      sp.textContent = String(count);
      b.appendChild(sp);
    }
    b.addEventListener("click", onClick);
    return b;
  }

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    viewOffsetX = 0;
    velocityX = 0;
    slotWZoom = 0;
    activeDecade = null;
    hideMonument();
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
    buildControls();
    resize();
  }

  function buildControls() {
    const bar = document.getElementById("nav-modes");
    const sub = document.getElementById("nav-sub");
    if (!bar || !sub) return;
    bar.textContent = "";
    for (const m of MODES) {
      const b = mkButton(m.label, null, () => setMode(m.id));
      b.dataset.mode = m.id;
      bar.appendChild(b);
    }
    sub.textContent = "";
    if (mode === "zoom") {
      const all = mkButton("Весь корпус", null, () => setSlotW(fitSlotW, width / 2));
      all.dataset.zoom = "all";
      const zin = mkButton("Крупно", null, () => setSlotW(SLOT_MAX * 0.7, width / 2));
      zin.dataset.zoom = "in";
      sub.append(all, zin);
    } else if (mode === "decades") {
      const counts = new Map();
      for (const m of monuments) {
        const y = typeof m.year === "number" ? m.year : 1930;
        const d = Math.floor(y / 10) * 10;
        counts.set(d, (counts.get(d) || 0) + 1);
      }
      const b = mkButton("Все", monuments.length, () => {
        activeDecade = null; viewOffsetX = 0; hideMonument(); layout(); syncControls();
      });
      b.dataset.decade = "all";
      sub.appendChild(b);
      for (const d of [...counts.keys()].sort((a, b2) => a - b2)) {
        const btn = mkButton(`${d}-е`, counts.get(d), () => {
          activeDecade = d; viewOffsetX = 0; hideMonument(); layout(); syncControls();
        });
        btn.dataset.decade = String(d);
        sub.appendChild(btn);
      }
    }
    syncControls();
  }

  function syncControls() {
    const bar = document.getElementById("nav-modes");
    const sub = document.getElementById("nav-sub");
    if (bar) {
      for (const b of bar.querySelectorAll("button")) {
        b.classList.toggle("is-on", b.dataset.mode === mode);
      }
    }
    if (!sub) return;
    if (mode === "zoom") {
      const atFit = slotWZoom <= fitSlotW + 0.5;
      for (const b of sub.querySelectorAll("button")) {
        b.classList.toggle("is-on", b.dataset.zoom === (atFit ? "all" : "in"));
      }
    } else if (mode === "decades") {
      const want = activeDecade === null ? "all" : String(activeDecade);
      for (const b of sub.querySelectorAll("button")) {
        b.classList.toggle("is-on", b.dataset.decade === want);
      }
    }
  }

  function render() {
    if (!pointerDown && Math.abs(velocityX) > MIN_VELOCITY) {
      viewOffsetX += velocityX;
      velocityX *= FRICTION;
      const before = viewOffsetX;
      clampPan();
      if (viewOffsetX !== before) velocityX = 0;
    }
    ctx.clearRect(0, 0, width, height);
    drawScene();
    if (placed.length) drawMonuments();
    drawStrip();
    requestAnimationFrame(render);
  }

  function findAt(x, y) {
    let best = -1;
    let bestDist = Infinity;
    for (const pm of placed) {
      const top = pm.baseY - pm.totalH;
      const bottom = pm.baseY;
      const hx = Math.max(pm.w, 24);
      if (x >= screenX(pm.worldX) - hx && x <= screenX(pm.worldX) + hx && y >= top - 14 && y <= bottom + 30) {
        const d = Math.abs(x - screenX(pm.worldX));
        if (d < bestDist) { bestDist = d; best = pm.i; }
      }
    }
    return best;
  }


  let lastPointerX = 0;

  canvas.addEventListener("pointerdown", event => {
    pointers.set(event.pointerId, event.clientX);
    if (mode === "zoom" && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.abs(a - b);
      pinchStartSlot = slotWZoom;
      pinchAnchorX = (a + b) / 2;
      pointerDown = false;
      return;
    }
    pointerDown = true;
    didDrag = false;
    velocityX = 0;
    pressStartX = event.clientX;
    pressStartY = event.clientY;
    lastPointerX = event.clientX;
    onStrip = hasStrip() && event.clientY >= stripTop();
    if (onStrip) scrollToFraction(stripFractionAt(event.clientX));
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
    }
  });

  canvas.addEventListener("pointermove", event => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, event.clientX);
    if (mode === "zoom" && pointers.size === 2 && pinchStartDist > 0) {
      const [a, b] = [...pointers.values()];
      setSlotW(pinchStartSlot * (Math.abs(a - b) / pinchStartDist), pinchAnchorX);
      return;
    }
    if (!pointerDown) return;
    if (onStrip) {
      scrollToFraction(stripFractionAt(event.clientX));
      lastPointerX = event.clientX;
      return;
    }
    if (!didDrag &&
        Math.hypot(event.clientX - pressStartX, event.clientY - pressStartY) > TAP_THRESHOLD) {
      didDrag = true;
    }
    if (didDrag) {
      const dx = event.clientX - lastPointerX;
      viewOffsetX += dx;
      velocityX = dx;
      clampPan();
    }
    lastPointerX = event.clientX;
  }, { passive: true });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    if (pointerDown && !didDrag && !onStrip) {
      const now = performance.now();
      if (mode === "zoom" && now - lastTapAt < DOUBLE_TAP_MS) {
        setSlotW(slotWZoom > fitSlotW + 0.5 ? fitSlotW : SLOT_MAX * 0.7, event.clientX);
        lastTapAt = 0;
      } else {
        lastTapAt = now;
        // На обзорном зуме силуэт уже 5 px — попасть в него пальцем нельзя.
        if ((layout.slotW || 0) >= TAP_MIN_SLOT) {
          const hit = findAt(event.clientX, event.clientY);
          if (hit >= 0) showMonument(hit);
          else hideMonument();
        }
      }
    }
    pointerDown = false;
    onStrip = false;
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", event => {
    pointers.delete(event.pointerId);
    pointerDown = false;
  });

  canvas.addEventListener("wheel", event => {
    if (mode !== "zoom") return;
    event.preventDefault();
    setSlotW(slotWZoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX);
  }, { passive: false });

  window.addEventListener("resize", resize);

  function loadSilhouettes() {
    return fetch("../assets/mtk41/silhouettes.json")
      .then(r => r.json())
      .then(m => {
        for (const [id, rel] of Object.entries(m)) {
          if (id.startsWith("_") || !rel) continue;
          const img = new Image();
          img.src = `../assets/mtk41/${id}/${encodeURI(rel)}`;
          silhouetteImages[id] = img;
        }
      })
      .catch(() => {});
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && MODES.some(m => m.id === saved)) mode = saved;
  } catch (e) {}

  Promise.all([
    fetch("../data/mtk41.json").then(r => r.json()),
    fetch("../assets/mtk41/heights.json").then(r => r.json()).catch(() => ({})),
    loadSilhouettes(),
  ]).then(([mtk, heights]) => {
    HEIGHTS = heights || {};
    monuments = mtk.items || [];
    buildControls();
    resize();
    requestAnimationFrame(render);
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.warn("Load failed:", err);
    resize();
    requestAnimationFrame(render);
  });

  resize();
  requestAnimationFrame(render);
})();
