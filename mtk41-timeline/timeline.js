(function () {
  const canvas = document.getElementById("timeline");
  const ctx = canvas.getContext("2d", { alpha: true });

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    graphite: "#435059",
    window: "#9DA3A6",
    black: "#000000",
  };

  const YEAR_MIN = 1918;
  const YEAR_MAX = 1975;

  let width = 0, height = 0, dpr = 1;
  let monuments = [];
  let placed = [];                   // { i, year, x, y, r } per monument
  let selectedIndex = -1;

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

  // Best-known year for monuments where the JSON has null.
  // (For the 1920s cluster, we spread within their decade so dots don't overlap.)
  function effectiveYear(m, idxInBucket) {
    if (typeof m.year === "number") return m.year;
    // Hint: items titled "(1920-е)" — spread across 1922..1928
    if (m.id && m.id.includes("1920s")) {
      const baseYears = [1923, 1924, 1925, 1926, 1927];
      return baseYears[idxInBucket % baseYears.length];
    }
    // Pinchuk + Taurit composition: documented 1949 cast
    if (m.id === "gorki-pinchuk-taurit") return 1949;
    // fallback
    return 1930;
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

  // --- Layout: compute (x, y) for each monument so labels don't overlap ----

  function yearToX(year) {
    const pad = width * 0.08;
    const t = (year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
    return pad + t * (width - pad * 2);
  }

  function layout() {
    placed = [];
    // First pass: bucket by year (assign effective year for null-year items)
    const buckets = new Map();
    const decadeIdx = new Map();
    for (let i = 0; i < monuments.length; i += 1) {
      const m = monuments[i];
      let idxInBucket = 0;
      const decade = m.id && m.id.includes("1920s") ? "1920s" : "_";
      idxInBucket = decadeIdx.get(decade) || 0;
      decadeIdx.set(decade, idxInBucket + 1);
      const year = effectiveYear(m, idxInBucket);
      if (!buckets.has(year)) buckets.set(year, []);
      buckets.get(year).push(i);
    }

    // Vertical band where the timeline sits
    const axisY = height * 0.62;
    const stackUp = height * 0.36;  // how far up dots can stack

    // For each year bucket, stack monuments vertically
    for (const [year, indices] of buckets.entries()) {
      const x = yearToX(year);
      // sort by alpha city so order is stable across reloads
      indices.sort((a, b) => (monuments[a].city || "").localeCompare(monuments[b].city || ""));
      for (let k = 0; k < indices.length; k += 1) {
        const i = indices[k];
        const m = monuments[i];
        const offset = k * Math.min(stackUp / Math.max(1, indices.length - 0.5), height * 0.075);
        const y = axisY - offset - height * 0.035;
        const r = Math.max(8, Math.min(width, height) * 0.011);
        placed.push({ i, year, x, y, r });
      }
    }
  }

  // --- Draw axis ------------------------------------------------------------

  function drawAxis() {
    const axisY = height * 0.62;
    const pad = width * 0.08;
    const x0 = pad, x1 = width - pad;

    // Main rail
    ctx.strokeStyle = cssColor(palette.brass, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, axisY);
    ctx.lineTo(x1, axisY);
    ctx.stroke();

    // Year ticks
    ctx.font = `400 ${Math.max(10, height * 0.013)}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (let y = 1920; y <= 1975; y += 1) {
      const isDecade = y % 10 === 0;
      const isHalfDecade = y % 5 === 0;
      const x = yearToX(y);
      if (x < x0 - 8 || x > x1 + 8) continue;
      ctx.strokeStyle = cssColor(palette.paper, isDecade ? 0.6 : (isHalfDecade ? 0.32 : 0.15));
      ctx.lineWidth = isDecade ? 1.4 : (isHalfDecade ? 1 : 0.6);
      const tickH = isDecade ? 16 : (isHalfDecade ? 10 : 5);
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, axisY + tickH);
      ctx.stroke();
      if (isDecade) {
        ctx.fillStyle = cssColor(palette.paper, 0.85);
        ctx.font = `600 ${Math.max(14, height * 0.022)}px "20 Kopeek", "Courier New", monospace`;
        ctx.fillText(String(y), x, axisY + 22);
      } else if (isHalfDecade) {
        ctx.fillStyle = cssColor(palette.paper, 0.4);
        ctx.font = `400 ${Math.max(10, height * 0.013)}px "20 Kopeek", "Courier New", monospace`;
        ctx.fillText(String(y), x, axisY + 14);
      }
    }

    // Decade backgrounds (very faint)
    ctx.save();
    for (let dec = 1920; dec < 1980; dec += 20) {
      const x = yearToX(dec);
      const w = yearToX(dec + 10) - x;
      ctx.fillStyle = "rgba(247, 249, 239, 0.02)";
      ctx.fillRect(x, 0, w, height);
    }
    ctx.restore();

    // Key event annotations
    drawAnnotation("1924-01-21\nсмерть В.И.Ленина", 1924.06, axisY, "up", 0.46);
    drawAnnotation("1956\nXX съезд КПСС", 1956, axisY, "up", 0.20);
    drawAnnotation("1937 — год расстрелов", 1937, axisY, "down", 0.05);
  }

  function drawAnnotation(label, year, axisY, dir, intensity) {
    const x = yearToX(year);
    if (x < width * 0.05 || x > width * 0.95) return;
    const yEnd = dir === "up" ? axisY - height * 0.46 : axisY + height * 0.10;
    ctx.save();
    ctx.strokeStyle = cssColor(palette.red, 0.22 + intensity * 0.18);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(x, axisY);
    ctx.lineTo(x, yEnd);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = cssColor(palette.red, 0.7);
    ctx.font = `400 ${Math.max(11, height * 0.014)}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = dir === "up" ? "bottom" : "top";
    const lines = label.split("\n");
    const lh = Math.max(13, height * 0.017);
    const yStart = dir === "up" ? yEnd : yEnd;
    for (let i = 0; i < lines.length; i += 1) {
      const yL = dir === "up"
        ? yStart - (lines.length - 1 - i) * lh
        : yStart + i * lh;
      ctx.fillText(lines[i], x + 6, yL);
    }
    ctx.restore();
  }

  // --- Draw monument dots --------------------------------------------------

  function drawMonuments() {
    // Connector from each dot down to the axis
    const axisY = height * 0.62;
    for (const pm of placed) {
      ctx.strokeStyle = cssColor(palette.window, 0.32);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(pm.x, pm.y + pm.r);
      ctx.lineTo(pm.x, axisY);
      ctx.stroke();
    }

    // Halo for selected
    for (const pm of placed) {
      if (pm.i !== selectedIndex) continue;
      ctx.beginPath();
      ctx.arc(pm.x, pm.y, pm.r * 3, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(palette.brass, 0.18);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pm.x, pm.y, pm.r * 2, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(palette.brass, 0.30);
      ctx.fill();
    }

    // Dots
    for (const pm of placed) {
      const m = monuments[pm.i];
      const isSelected = pm.i === selectedIndex;

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pm.x, pm.y, pm.r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = palette.brass;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(pm.x, pm.y, pm.r, 0, Math.PI * 2);
      ctx.fillStyle = statusColor(m.status);
      ctx.globalAlpha = m.status === "unknown" ? 0.55 : 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(pm.x, pm.y, pm.r, 0, Math.PI * 2);
      ctx.strokeStyle = cssColor(palette.paper, 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // City labels
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const pm of placed) {
      const m = monuments[pm.i];
      const isSelected = pm.i === selectedIndex;
      const label = m.city || m.country || "";
      if (!label) continue;
      const size = Math.max(11, height * (isSelected ? 0.020 : 0.014));
      ctx.font = `${isSelected ? 600 : 400} ${size}px "20 Kopeek", "Courier New", monospace`;
      const tx = pm.x + pm.r + 8;
      const ty = pm.y;
      ctx.fillStyle = cssColor(palette.black, 0.7);
      ctx.shadowColor = cssColor(palette.black, 0.55);
      ctx.shadowBlur = 5;
      ctx.fillText(label, tx + 1, ty + 1);
      ctx.shadowBlur = 0;
      ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.82);
      ctx.fillText(label, tx, ty);
    }
  }

  function drawSummary() {
    // Statistic strip below the title
    const x = width * 0.07;
    const y = height * 0.93;
    const counts = { extant: 0, demolished: 0, unknown: 0, relocated: 0 };
    for (const m of monuments) counts[m.status || "unknown"] = (counts[m.status || "unknown"] || 0) + 1;
    const text = `${monuments.length} памятников · сохранился: ${counts.extant} · снесён: ${counts.demolished} · судьба неизв.: ${counts.unknown}`;
    ctx.fillStyle = cssColor(palette.paper, 0.45);
    ctx.font = `400 ${Math.max(11, height * 0.014)}px "20 Kopeek", "Courier New", monospace`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText(text, x, y);
  }

  function render() {
    ctx.clearRect(0, 0, width, height);
    drawAxis();
    if (monuments.length) drawMonuments();
    drawSummary();
    requestAnimationFrame(render);
  }

  // --- Hit testing ---------------------------------------------------------

  function findAt(x, y) {
    let best = -1;
    let bestDist = Infinity;
    for (const pm of placed) {
      const d = Math.hypot(x - pm.x, y - pm.y);
      const hitR = Math.max(pm.r + 16, 24);
      if (d <= hitR && d < bestDist) {
        bestDist = d;
        best = pm.i;
      }
    }
    return best;
  }

  // --- Card ----------------------------------------------------------------


  // --- Pointer interactions ------------------------------------------------

  canvas.addEventListener("pointerdown", event => {
    pointerDown = true;
    didDrag = false;
    pressStartX = event.clientX;
    pressStartY = event.clientY;
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
    }
  });

  canvas.addEventListener("pointermove", event => {
    if (!pointerDown || didDrag) return;
    if (Math.hypot(event.clientX - pressStartX, event.clientY - pressStartY) > TAP_THRESHOLD) {
      didDrag = true;
    }
  }, { passive: true });

  function endPointer(event) {
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    if (pointerDown && !didDrag) {
      const hit = findAt(event.clientX, event.clientY);
      if (hit >= 0) showMonument(hit);
      else hideMonument();
    }
    pointerDown = false;
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => { pointerDown = false; });

  window.addEventListener("resize", resize);

  // --- Load + start --------------------------------------------------------

  Promise.all([
    fetch("../data/mtk41.json").then(r => r.json()),
  ]).then(([mtk]) => {
    monuments = mtk.items || [];
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
