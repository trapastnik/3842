(function () {
  const canvas = document.getElementById("scale");
  const ctx = canvas.getContext("2d", { alpha: true });

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    graphite: "#435059",
    window: "#9DA3A6",
  };

  // Heights are best-effort, based on Wikipedia / source descriptions in the JSON.
  // statue = sculpture only; pedestal = base/podium. Total = statue + pedestal.
  // For monuments where no source data is available, conservative typical values.
  const HEIGHTS = {
    "alekseev-1919-bust":            { statue: 0.6,  pedestal: 0.0,  note: "Бюст ~0.6 м, без постамента (натурный бюст)" },
    "leningrad-1920s":               { statue: 4.0,  pedestal: 3.0,  note: "Типичный для 1920-х памятник в Ленинграде, ≈7 м" },
    "kaluga-1920s":                  { statue: 3.5,  pedestal: 2.5,  note: "Типичный памятник 1920-х, ≈6 м" },
    "yaroslavl-1920s":               { statue: 4.5,  pedestal: 3.0,  note: "На Красной площади, ≈7.5 м" },
    "vladivostok-1920s":             { statue: 3.5,  pedestal: 2.5,  note: "Типичный 1920-х, ≈6 м" },
    "ufa-1924-larionov":             { statue: 3.0,  pedestal: 2.0,  note: "В сквере Ленина, ≈5 м" },
    "moscow-oktyabrskaya-1925":      { statue: 2.5,  pedestal: 1.5,  note: "Скромный объект на станции, ≈4 м" },
    "nizhny-tagil-1925":             { statue: 4.0,  pedestal: 2.5,  note: "Типичный, ≈6.5 м" },
    "chelyabinsk-aloe-pole-1925":    { statue: 1.5,  pedestal: 5.0,  note: "Бюст в нише мавзолея; здание ≈6.5 м" },
    "voznesenye-1925-capital-bust":  { statue: 1.0,  pedestal: 1.5,  note: "Бюст на трёх томах «Капитала» в посёлке" },
    "kostroma-1928":                 { statue: 4.0,  pedestal: 8.0,  note: "На постаменте 300-летия Романовых ≈12 м" },
    "moscow-canal-1937-merkurov":    { statue: 25.0, pedestal: 12.0, note: "Колосс Меркурова, ≈37 м" },
    "gorki-pinchuk-taurit":          { statue: 2.5,  pedestal: 0.8,  note: "Скульптурная группа, в натуральную величину" },
    "kazan-1954-young-volodya":      { statue: 3.0,  pedestal: 2.0,  note: "Молодой Володя-студент, ≈5 м" },
    "rybinsk-1957-askar-saryja":     { statue: 4.5,  pedestal: 2.5,  note: "На Красной площади Рыбинска, ≈7 м" },
    "merkurov-1958-funeral":         { statue: 2.5,  pedestal: 0.5,  note: "Композиция «Похороны вождя», группа фигур" },
    "ulan-ude-1970-zilberman":       { statue: 7.7,  pedestal: 6.3,  note: "Самая большая голова Ленина в мире — 14 м" },
    "volgograd-1973-vuchetich":      { statue: 27.0, pedestal: 30.0, note: "Самый большой памятник реальному человеку — 57 м" },
  };

  const HUMAN_HEIGHT_M = 1.75;

  let width = 0, height = 0, dpr = 1;
  let monuments = [];
  let placed = [];                     // { i, x, baseY, w, statueH, pedestalH, totalH }
  let selectedIndex = -1;

  // Curated silhouette images, loaded once and keyed by monument id.
  const silhouetteImages = {};        // id → HTMLImageElement (may be null if no silhouette)
  let silhouettesReady = false;

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
    const h = HEIGHTS[id] || { statue: 5, pedestal: 2 };
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
    const items = monuments.map((m, i) => {
      let y = m.year;
      if (typeof y !== "number") {
        if (m.id && m.id.includes("1920s")) y = 1925;
        else if (m.id === "gorki-pinchuk-taurit") y = 1949;
        else y = 1930;
      }
      return { m, i, year: y };
    }).sort((a, b) => a.year - b.year);

    const left = width * 0.10;
    const right = width * 0.96;
    const baseY = height * 0.86;                     // ground line
    const skyTop = height * 0.20;                    // top reserved for title
    const usableHeight = baseY - skyTop;

    // Find the tallest monument → scale so it fills usableHeight × 0.9
    let maxTotal = 0;
    for (const it of items) maxTotal = Math.max(maxTotal, totalHeight(it.m.id));
    // 1 metre in pixels:
    const mPx = (usableHeight * 0.9) / maxTotal;

    const slotW = (right - left) / items.length;
    const figureW = Math.min(slotW * 0.55, 60);

    for (let k = 0; k < items.length; k += 1) {
      const it = items[k];
      const m = it.m;
      const h = HEIGHTS[m.id] || { statue: 5, pedestal: 2 };
      const cx = left + slotW * (k + 0.5);
      const totalH = (h.statue + h.pedestal) * mPx;
      const statueH = h.statue * mPx;
      const pedestalH = h.pedestal * mPx;
      placed.push({
        i: it.i, year: it.year, m,
        x: cx, baseY: baseY,
        w: figureW,
        statueH, pedestalH, totalH,
        h_statue: h.statue, h_pedestal: h.pedestal,
      });
    }

    layout.mPx = mPx;
    layout.left = left;
    layout.right = right;
    layout.baseY = baseY;
  }

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

  function drawProceduralMonument(pm) {
    const m = pm.m;
    const isSelected = pm.i === selectedIndex;
    const x = pm.x;
    const bottomOfStatue = pm.baseY - pm.pedestalH;

    ctx.fillStyle = isSelected ? cssColor(palette.brass, 0.5) : cssColor(palette.graphite, 0.92);
    ctx.fillRect(x - pm.w * 0.4, bottomOfStatue, pm.w * 0.8, pm.pedestalH);
    ctx.strokeStyle = isSelected ? palette.brass : cssColor(palette.window, 0.5);
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(x - pm.w * 0.4, bottomOfStatue, pm.w * 0.8, pm.pedestalH);

    const sBottom = bottomOfStatue;
    const sTop = sBottom - pm.statueH;
    const statueFill = isSelected ? palette.brass : statusColor(m.status);
    const statueOpacity = m.status === "unknown" ? 0.55 : 0.92;

    ctx.save();
    ctx.fillStyle = statueFill;
    ctx.globalAlpha = statueOpacity;
    const bodyW = pm.w * 0.55;
    const headR = Math.min(pm.statueH * 0.18, pm.w * 0.32);
    const bodyTop = sTop + headR * 1.4;
    ctx.beginPath();
    ctx.moveTo(x - bodyW * 0.5, sBottom);
    ctx.lineTo(x + bodyW * 0.5, sBottom);
    ctx.lineTo(x + bodyW * 0.35, bodyTop);
    ctx.lineTo(x - bodyW * 0.35, bodyTop);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, sTop + headR, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSilhouette(pm) {
    const m = pm.m;
    const img = silhouetteImages[m.id];
    if (!img || !img.complete || !img.naturalWidth) return false;
    const isSelected = pm.i === selectedIndex;

    // Real-world height of the monument in pixels
    const targetH = pm.totalH;
    const aspect = img.naturalWidth / img.naturalHeight;
    const targetW = targetH * aspect;
    const x = pm.x - targetW / 2;
    const y = pm.baseY - targetH;

    // Status-coloured glow underneath the silhouette
    if (isSelected) {
      ctx.save();
      ctx.shadowColor = palette.brass;
      ctx.shadowBlur = 22;
      ctx.fillStyle = cssColor(palette.brass, 0.001);
      ctx.fillRect(x, y, targetW, targetH);
      ctx.restore();
    } else if (m.status === "extant") {
      ctx.save();
      ctx.shadowColor = cssColor(palette.red, 0.5);
      ctx.shadowBlur = 14;
      ctx.fillStyle = cssColor(palette.red, 0.001);
      ctx.fillRect(x, y, targetW, targetH);
      ctx.restore();
    }

    ctx.save();
    if (m.status === "unknown") ctx.globalAlpha = 0.6;
    if (m.status === "demolished") ctx.globalAlpha = 0.55;
    ctx.drawImage(img, x, y, targetW, targetH);
    ctx.restore();
    return true;
  }

  function drawMonuments() {
    for (const pm of placed) {
      // Try real silhouette first; fall back to procedural shape
      if (!drawSilhouette(pm)) drawProceduralMonument(pm);
    }

    // Labels (city + year) below pedestal
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const pm of placed) {
      const m = pm.m;
      const isSelected = pm.i === selectedIndex;
      const y = pm.baseY + 12;
      const fontSize = Math.max(10, Math.min(pm.w * 0.32, height * 0.013));
      ctx.font = `${isSelected ? 600 : 400} ${fontSize}px "20 Kopeek", "Courier New", monospace`;
      ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.78);
      const label = m.city || (m.country || "");
      ctx.fillText(label, pm.x, y);
      ctx.fillStyle = cssColor(palette.brass, isSelected ? 0.9 : 0.55);
      ctx.fillText(pm.year ? String(pm.year) : "—", pm.x, y + fontSize * 1.4);
      // Total height in metres
      const totalH = (pm.h_statue + pm.h_pedestal).toFixed(pm.h_statue + pm.h_pedestal < 10 ? 1 : 0);
      ctx.fillStyle = cssColor(palette.paper, 0.55);
      ctx.fillText(`${totalH} м`, pm.x, y + fontSize * 2.8);
    }
  }

  function render() {
    ctx.clearRect(0, 0, width, height);
    drawScene();
    if (placed.length) drawMonuments();
    requestAnimationFrame(render);
  }

  function findAt(x, y) {
    let best = -1;
    let bestDist = Infinity;
    for (const pm of placed) {
      const top = pm.baseY - pm.totalH;
      const bottom = pm.baseY;
      const hx = Math.max(pm.w, 24);
      if (x >= pm.x - hx && x <= pm.x + hx && y >= top - 14 && y <= bottom + 30) {
        const d = Math.abs(x - pm.x);
        if (d < bestDist) { bestDist = d; best = pm.i; }
      }
    }
    return best;
  }


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
        silhouettesReady = true;
      })
      .catch(() => {});
  }

  Promise.all([
    fetch("../data/mtk41.json").then(r => r.json()),
    loadSilhouettes(),
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
