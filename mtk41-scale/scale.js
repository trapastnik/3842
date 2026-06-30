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

  // Heights loaded from assets/mtk41/heights.json (sourced from the curator's
  // monument table — column «Размеры»). Conservative fallback for entries
  // without a height in the catalog.
  let HEIGHTS = {};
  const FALLBACK_HEIGHT = { statue: 5.0, pedestal: 2.0 };

  const HUMAN_HEIGHT_M = 1.75;

  let width = 0, height = 0, dpr = 1;
  let monuments = [];
  let placed = [];                     // { i, x, baseY, w, statueH, pedestalH, totalH }
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
      const h = HEIGHTS[m.id] || FALLBACK_HEIGHT;
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

  function drawMonuments() {
    for (const pm of placed) {
      const m = pm.m;
      const isSelected = pm.i === selectedIndex;
      const x = pm.x;
      const bottomOfStatue = pm.baseY - pm.pedestalH;

      // Pedestal: graphite rectangle
      ctx.fillStyle = isSelected
        ? cssColor(palette.brass, 0.5)
        : cssColor(palette.graphite, 0.92);
      ctx.fillRect(x - pm.w * 0.4, bottomOfStatue, pm.w * 0.8, pm.pedestalH);

      // Pedestal outline
      ctx.strokeStyle = isSelected
        ? palette.brass
        : cssColor(palette.window, 0.5);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(x - pm.w * 0.4, bottomOfStatue, pm.w * 0.8, pm.pedestalH);

      // Statue: stylised — trapezoid body topped with sphere head
      const sBottom = bottomOfStatue;
      const sTop = sBottom - pm.statueH;
      const statueFill = isSelected
        ? palette.brass
        : statusColor(m.status);
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

      // Statue outline
      ctx.save();
      ctx.strokeStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.5);
      ctx.lineWidth = isSelected ? 2 : 0.8;
      ctx.beginPath();
      ctx.moveTo(x - bodyW * 0.5, sBottom);
      ctx.lineTo(x + bodyW * 0.5, sBottom);
      ctx.lineTo(x + bodyW * 0.35, bodyTop);
      ctx.lineTo(x - bodyW * 0.35, bodyTop);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, sTop + headR, headR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Labels (city + year + height) below pedestal.
    // In portrait the slot is narrow → labels rotate -60° so they don't
    // overlap their neighbours.
    const isPortrait = height > width;
    const slotW = placed.length ? (placed[1] ? placed[1].x - placed[0].x : 60) : 60;
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
      const heightLabel = ((pm.h_statue + pm.h_pedestal).toFixed(
        pm.h_statue + pm.h_pedestal < 10 ? 1 : 0)) + " м";

      if (needRotate) {
        // Rotate labels -60° so a long city name doesn't collide with
        // the next slot. Year + height sit on parallel lines.
        ctx.translate(pm.x, y);
        ctx.rotate(-Math.PI / 3);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.85);
        ctx.fillText(city, 0, 0);
        ctx.fillStyle = cssColor(palette.brass, isSelected ? 0.95 : 0.6);
        ctx.fillText(yearLabel, 0, fontSize * 1.25);
        ctx.fillStyle = cssColor(palette.paper, 0.55);
        ctx.fillText(heightLabel, 0, fontSize * 2.5);
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.78);
        ctx.fillText(city, pm.x, y);
        ctx.fillStyle = cssColor(palette.brass, isSelected ? 0.9 : 0.55);
        ctx.fillText(yearLabel, pm.x, y + fontSize * 1.4);
        ctx.fillStyle = cssColor(palette.paper, 0.55);
        ctx.fillText(heightLabel, pm.x, y + fontSize * 2.8);
      }
      ctx.restore();
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

  Promise.all([
    fetch("../data/mtk41.json").then(r => r.json()),
    fetch("../assets/mtk41/heights.json").then(r => r.json()).catch(() => ({})),
  ]).then(([mtk, heights]) => {
    monuments = mtk.items || [];
    HEIGHTS = heights || {};
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
