(function () {
  const canvas = document.getElementById("stacked");
  const ctx = canvas.getContext("2d", { alpha: true });

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    graphite: "#435059",
    window: "#9DA3A6",
  };

  // Three height bands: each gets its own pixel-per-metre scale.
  // (Layout reserves equal vertical real estate per band so small monuments
  // are visible even though Volgograd is 95× taller than the 1919 bust.)
  const BANDS = [
    { id: "small",  label: "0–8 м · бюсты и типовые памятники",   maxM: 8 },
    { id: "medium", label: "8–20 м · крупные монументы",            maxM: 20 },
    { id: "large",  label: "20–60 м · колоссы",                     maxM: 60 },
  ];

  // Heights loaded from assets/mtk41/heights.json (curator's monument table).
  let HEIGHTS = {};
  const FALLBACK_HEIGHT = { statue: 5.0, pedestal: 2.0 };

  const HUMAN_HEIGHT_M = 1.75;

  let width = 0, height = 0, dpr = 1;
  let monuments = [];
  let placed = [];                   // { i, m, band, worldX, baseY, h_statue, h_pedestal, mPx, totalH, bandTopY, bandBaseY }
  let selectedIndex = -1;

  // Pan state — shared X offset; pointer drag in a band only pans that band.
  const PAD_LEFT_PX = 0;               // bands already start at width*0.10
  const MIN_SLOT_W = 84;
  const viewOffsetX = { small: 0, medium: 0, large: 0 };
  const contentBounds = { small: [0,0], medium: [0,0], large: [0,0] };

  const silhouetteImages = {};

  function cssColor(hex, alpha) {
    const v = hex.replace("#", "");
    return `rgba(${parseInt(v.slice(0, 2), 16)}, ${parseInt(v.slice(2, 4), 16)}, ${parseInt(v.slice(4, 6), 16)}, ${alpha})`;
  }
  function statusColor(s) {
    switch (s) {
      case "extant":     return palette.red;
      case "demolished": return palette.graphite;
      case "relocated":  return palette.brass;
      default:           return palette.window;
    }
  }
  function totalH(id) {
    const h = HEIGHTS[id] || FALLBACK_HEIGHT;
    return h.statue + h.pedestal;
  }
  function chooseBand(h) {
    for (const b of BANDS) if (h <= b.maxM) return b.id;
    return BANDS[BANDS.length - 1].id;
  }

  // --- Card delegation ----------------------------------------------------
  function showMonument(idx) {
    selectedIndex = idx;
    if (window.MtkCard) window.MtkCard.show(monuments[idx]);
  }
  document.addEventListener("mtk-card-hidden", () => { selectedIndex = -1; });

  let pressStartX = 0, pressStartY = 0;
  let didDrag = false;
  let pointerDown = false;
  const TAP_THRESHOLD = 8;

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

    // Sort each monument into its band
    const byBand = { small: [], medium: [], large: [] };
    for (let i = 0; i < monuments.length; i += 1) {
      const m = monuments[i];
      const h = totalH(m.id);
      const bandId = chooseBand(h);
      byBand[bandId].push({ i, m, h });
    }
    // Sort each band chronologically
    for (const id of Object.keys(byBand)) {
      byBand[id].sort((a, b) => {
        const ya = a.m.year || (a.m.id && a.m.id.includes("1920s") ? 1925 : a.m.id === "gorki-pinchuk-taurit" ? 1949 : 1930);
        const yb = b.m.year || (b.m.id && b.m.id.includes("1920s") ? 1925 : b.m.id === "gorki-pinchuk-taurit" ? 1949 : 1930);
        return ya - yb;
      });
    }

    // Layout: title eats top ~20%, then three equal-height bands below
    const topReserve = height * 0.20;
    const bandsArea = height - topReserve - height * 0.05;
    const bandH = bandsArea / 3;
    const gap = height * 0.005;
    const left = width * 0.10;
    const right = width * 0.97;

    layout.bands = BANDS.map((band, k) => {
      const topY = topReserve + bandsArea * k / 3;
      const baseY = topY + bandH - gap;
      const usableH = bandH - gap - 38;       // leave room for labels below
      const mPx = (usableH * 0.94) / band.maxM;
      return { ...band, topY, baseY, mPx };
    });

    for (const b of layout.bands) {
      const items = byBand[b.id];
      if (!items.length) continue;
      const viewportW = right - left;
      // touch-friendly minimum slot width; if items fit naturally use that
      const slotW = Math.max(MIN_SLOT_W, viewportW / items.length);
      const figW = Math.min(slotW * 0.75, 110);
      contentBounds[b.id] = [left, left + slotW * items.length];
      for (let k = 0; k < items.length; k += 1) {
        const it = items[k];
        const h = HEIGHTS[it.m.id] || FALLBACK_HEIGHT;
        const worldX = left + slotW * (k + 0.5);
        placed.push({
          i: it.i, m: it.m, band: b.id,
          worldX, baseY: b.baseY, bandTopY: b.topY, bandBaseY: b.baseY,
          w: figW,
          h_statue: h.statue, h_pedestal: h.pedestal,
          mPx: b.mPx,
          totalH: (h.statue + h.pedestal) * b.mPx,
        });
      }
    }
  }

  // --- Drawing ------------------------------------------------------------

  function clampPan(bandId) {
    const [cl, cr] = contentBounds[bandId];
    const contentW = cr - cl;
    const viewportW = (layout.right || width * 0.97) - (layout.left || width * 0.10);
    if (contentW <= viewportW) { viewOffsetX[bandId] = 0; return; }
    const min = viewportW - contentW;
    const max = 0;
    if (viewOffsetX[bandId] > max) viewOffsetX[bandId] = max;
    if (viewOffsetX[bandId] < min) viewOffsetX[bandId] = min;
  }

  function screenX(worldX, bandId) {
    return worldX + (viewOffsetX[bandId] || 0);
  }

  function drawBands() {
    for (const b of layout.bands || []) {
      // band background tint
      ctx.fillStyle = "rgba(247, 249, 239, 0.012)";
      ctx.fillRect(width * 0.06, b.topY + 4, width * 0.92, b.baseY - b.topY - 4);

      // baseline
      ctx.strokeStyle = cssColor(palette.brass, 0.45);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, b.baseY);
      ctx.lineTo(width, b.baseY);
      ctx.stroke();

      // band label, top-right
      ctx.fillStyle = cssColor(palette.brass, 0.7);
      ctx.font = `600 ${Math.max(11, height * 0.013)}px "20 Kopeek", monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(b.label.toUpperCase(), width * 0.97, b.topY + 6);

      // height guides per band
      ctx.save();
      ctx.font = `400 ${Math.max(10, height * 0.011)}px "20 Kopeek", monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const guides = b.id === "small" ? [1.75, 5] :
                     b.id === "medium" ? [10, 15] :
                     [25, 50];
      for (const m of guides) {
        const y = b.baseY - m * b.mPx;
        if (y < b.topY + 18) continue;
        const isHuman = m === HUMAN_HEIGHT_M;
        ctx.strokeStyle = isHuman ? cssColor(palette.brass, 0.45) : cssColor(palette.paper, 0.10);
        ctx.lineWidth = isHuman ? 1.1 : 0.6;
        ctx.setLineDash(isHuman ? [4, 6] : [2, 10]);
        ctx.beginPath();
        ctx.moveTo(width * 0.085, y);
        ctx.lineTo(width * 0.97, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = cssColor(palette.paper, isHuman ? 0.85 : 0.42);
        ctx.fillText(isHuman ? `${m} м` : `${m} м`, width * 0.082, y);
      }
      ctx.restore();
    }

    // Human reference figure (only in the small band)
    const small = (layout.bands || []).find(b => b.id === "small");
    if (small) drawHuman(width * 0.045, small.baseY, HUMAN_HEIGHT_M * small.mPx);
  }

  function drawHuman(cx, baseY, totalPx) {
    const headR = totalPx * 0.075;
    const legT = totalPx * 0.20;
    ctx.save();
    ctx.fillStyle = cssColor(palette.paper, 0.55);
    ctx.beginPath();
    ctx.arc(cx, baseY - totalPx + headR, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - totalPx * 0.06, baseY - totalPx + headR * 2);
    ctx.lineTo(cx + totalPx * 0.06, baseY - totalPx + headR * 2);
    ctx.lineTo(cx + totalPx * 0.08, baseY - legT);
    ctx.lineTo(cx - totalPx * 0.08, baseY - legT);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - totalPx * 0.07, baseY - legT, totalPx * 0.05, legT);
    ctx.fillRect(cx + totalPx * 0.02, baseY - legT, totalPx * 0.05, legT);
    ctx.restore();
  }

  function drawSilhouette(pm) {
    const img = silhouetteImages[pm.m.id];
    if (!img || !img.complete || !img.naturalWidth) return false;
    const isSelected = pm.i === selectedIndex;
    const targetH = pm.totalH;
    const aspect = img.naturalWidth / img.naturalHeight;
    const targetW = targetH * aspect;
    const x = screenX(pm.worldX, pm.band) - targetW / 2;
    const y = pm.baseY - targetH;

    // Status-coloured glow underneath
    if (isSelected || pm.m.status === "extant") {
      ctx.save();
      ctx.shadowColor = isSelected ? palette.brass : cssColor(palette.red, 0.5);
      ctx.shadowBlur = isSelected ? 22 : 12;
      ctx.fillStyle = "rgba(0,0,0,0.001)";
      ctx.fillRect(x, y, targetW, targetH);
      ctx.restore();
    }

    ctx.save();
    if (pm.m.status === "unknown") ctx.globalAlpha = 0.6;
    if (pm.m.status === "demolished") ctx.globalAlpha = 0.55;
    if (isSelected) ctx.globalAlpha = 1;
    ctx.drawImage(img, x, y, targetW, targetH);
    ctx.restore();
    return true;
  }

  function drawProceduralFallback(pm) {
    const m = pm.m;
    const isSelected = pm.i === selectedIndex;
    const x = screenX(pm.worldX, pm.band);
    const sH = pm.h_statue * pm.mPx;
    const pH = pm.h_pedestal * pm.mPx;
    const bottomStatue = pm.baseY - pH;
    const sTop = bottomStatue - sH;

    ctx.fillStyle = isSelected ? cssColor(palette.brass, 0.45) : cssColor(palette.graphite, 0.85);
    ctx.fillRect(x - pm.w * 0.4, bottomStatue, pm.w * 0.8, pH);
    ctx.strokeStyle = isSelected ? palette.brass : cssColor(palette.window, 0.55);
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.setLineDash([3, 4]);
    ctx.strokeRect(x - pm.w * 0.4, bottomStatue, pm.w * 0.8, pH);
    ctx.setLineDash([]);

    ctx.save();
    ctx.fillStyle = isSelected ? palette.brass : statusColor(m.status);
    ctx.globalAlpha = 0.55;
    // Прямоугольник + прямоугольник — stacked-blocks вид.
    const bodyW = pm.w * 0.5;
    const headW = pm.w * 0.32;
    const headH = sH * 0.22;
    const bodyTop = sTop + headH;
    ctx.fillRect(x - bodyW * 0.5, bodyTop, bodyW, bottomStatue - bodyTop);
    ctx.fillRect(x - headW * 0.5, sTop, headW, headH);
    ctx.restore();
  }

  function drawFigures() {
    for (const pm of placed) {
      if (!drawSilhouette(pm)) drawProceduralFallback(pm);
    }
    // Labels: city + year + height. Rotate -60° on portrait so the
    // densely packed small-band labels don't collide.
    const isPortrait = height > width;
    for (const pm of placed) {
      const m = pm.m;
      const isSelected = pm.i === selectedIndex;
      const y = pm.baseY + 8;
      const fontSize = isPortrait
        ? Math.max(12, Math.min(pm.w * 0.22, height * 0.012))
        : Math.max(10, Math.min(pm.w * 0.18, height * 0.012));
      ctx.save();
      ctx.font = `${isSelected ? 600 : 400} ${fontSize}px "20 Kopeek", monospace`;
      const cityRaw = m.city || m.country || "";
      const city = cityRaw.length > 18 ? cityRaw.slice(0, 16) + "…" : cityRaw;
      const yearLabel = m.year ? String(m.year) :
        (m.id && m.id.includes("1920s")) ? "1920-е" :
        (m.id === "gorki-pinchuk-taurit") ? "≈1949" : "—";
      const h = pm.h_statue + pm.h_pedestal;
      const heightLabel = h < 10 ? `${h.toFixed(1)} м` : `${Math.round(h)} м`;

      if (isPortrait) {
        ctx.translate(screenX(pm.worldX, pm.band), y);
        ctx.rotate(-Math.PI / 3);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.85);
        ctx.fillText(city, 0, 0);
        ctx.fillStyle = cssColor(palette.brass, isSelected ? 0.95 : 0.55);
        ctx.fillText(yearLabel, 0, fontSize * 1.2);
        ctx.fillStyle = cssColor(palette.paper, 0.5);
        ctx.fillText(heightLabel, 0, fontSize * 2.4);
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.85);
        ctx.fillText(city, screenX(pm.worldX, pm.band), y);
        ctx.fillStyle = cssColor(palette.brass, isSelected ? 0.95 : 0.55);
        ctx.fillText(yearLabel, screenX(pm.worldX, pm.band), y + fontSize * 1.35);
        ctx.fillStyle = cssColor(palette.paper, 0.5);
        ctx.fillText(heightLabel, screenX(pm.worldX, pm.band), y + fontSize * 2.7);
      }
      ctx.restore();
    }
  }

  function render() {
    ctx.clearRect(0, 0, width, height);
    drawBands();
    if (placed.length) drawFigures();
    requestAnimationFrame(render);
  }

  function findAt(x, y) {
    let best = -1;
    let bestDist = Infinity;
    for (const pm of placed) {
      const top = pm.baseY - pm.totalH;
      const bottom = pm.baseY + 30;
      const hx = Math.max(pm.w, 28);
      if (x >= screenX(pm.worldX, pm.band) - hx && x <= screenX(pm.worldX, pm.band) + hx && y >= top - 14 && y <= bottom) {
        const d = Math.abs(x - screenX(pm.worldX, pm.band));
        if (d < bestDist) { bestDist = d; best = pm.i; }
      }
    }
    return best;
  }

  let lastPointerX = 0;
  let pressedBand = null;

  function bandAt(y) {
    for (const b of layout.bands || []) {
      if (y >= b.topY && y <= b.baseY + 24) return b.id;
    }
    return null;
  }

  canvas.addEventListener("pointerdown", e => {
    pointerDown = true; didDrag = false;
    pressStartX = e.clientX; pressStartY = e.clientY;
    lastPointerX = e.clientX;
    pressedBand = bandAt(e.clientY);
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
  });
  canvas.addEventListener("pointermove", e => {
    if (!pointerDown) return;
    if (!didDrag &&
        Math.hypot(e.clientX - pressStartX, e.clientY - pressStartY) > TAP_THRESHOLD) {
      didDrag = true;
    }
    if (didDrag && pressedBand) {
      viewOffsetX[pressedBand] += e.clientX - lastPointerX;
      clampPan(pressedBand);
    }
    lastPointerX = e.clientX;
  }, { passive: true });
  function endPointer(e) {
    if (canvas.releasePointerCapture) { try { canvas.releasePointerCapture(e.pointerId); } catch (err) {} }
    if (pointerDown && !didDrag) {
      const hit = findAt(e.clientX, e.clientY);
      if (hit >= 0) showMonument(hit);
      else if (window.MtkCard) window.MtkCard.hide();
    }
    pointerDown = false;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => { pointerDown = false; });

  window.addEventListener("resize", resize);

  function loadFlatSilhouettes() {
    return fetch("../assets/mtk41/silhouettes_flat.json")
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

  Promise.all([
    fetch("../data/mtk41.json").then(r => r.json()),
    fetch("../assets/mtk41/heights.json").then(r => r.json()).catch(() => ({})),
    loadFlatSilhouettes(),
  ]).then(([mtk, heights]) => {
    HEIGHTS = heights || {};
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
