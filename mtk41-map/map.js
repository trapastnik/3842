(function () {
  const canvas = document.getElementById("map");
  const ctx = canvas.getContext("2d", { alpha: true });

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    graphite: "#435059",
    window: "#9DA3A6",
    black: "#000000",
  };

  // Equirectangular projection; view focused on Eurasia (Russia + neighbours).
  // The world is mapped into a worldW × worldH rectangle, and a viewport of
  // (width × height) is panned over it by (camX, camY).
  const map = {
    worldW: 0,
    worldH: 0,
    camX: 0,
    camY: 0,
    camVX: 0,
    camVY: 0,
    dragging: false,
    geojson: null,
    cached: null,
  };

  let width = 0, height = 0, dpr = 1;
  let geoLoaded = false;
  let monuments = [];                // raw items from data/mtk41.json
  let placedMonuments = [];          // monuments with screen positions, computed each frame

  let selectedIndex = -1;
  let pressIndex = -1;
  let didDrag = false;

  let lastPointerX = 0, lastPointerY = 0, lastPointerTime = 0;
  let pressStartX = 0, pressStartY = 0;
  const TAP_THRESHOLD = 8;           // px movement still counts as a tap

  let start = performance.now();
  let previousTime = 0;

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

  // --- Data-driven point styling -------------------------------------------

  // Year range across the corpus, used for size scaling.
  const YEAR_MIN = 1919;
  const YEAR_MAX = 1973;

  function pointRadius(item) {
    const y = item.year || 1925;
    const t = (y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
    const shortSide = Math.min(width, height);
    // base radius 0.5% .. 1.4% of the short side
    return shortSide * (0.005 + Math.max(0, Math.min(1, t)) * 0.014);
  }

  function statusColor(status) {
    switch (status) {
      case "extant":     return palette.red;
      case "demolished": return palette.graphite;
      case "relocated":  return palette.brass;
      default:           return palette.window;
    }
  }

  // --- World cache (country outlines, drawn once into an offscreen canvas) -

  function buildWorldCache() {
    if (!map.geojson) return;
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.floor(map.worldW));
    off.height = Math.max(1, Math.floor(map.worldH));
    const g = off.getContext("2d");

    g.fillStyle = "rgba(247, 249, 239, 0.02)";
    g.fillRect(0, 0, off.width, off.height);

    g.strokeStyle = cssColor(palette.window, 0.40);
    g.lineWidth = 0.9;
    g.fillStyle = "rgba(157, 163, 166, 0.07)";

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

      // Highlight Russia a bit
      const props = f.properties || {};
      const isRussia = (props.ADMIN === "Russia") || (props.NAME === "Russia") || (props.ISO_A2 === "RU");
      const fillColor = isRussia ? "rgba(210, 183, 115, 0.10)" : "rgba(157, 163, 166, 0.05)";
      const strokeColor = isRussia ? cssColor(palette.brass, 0.55) : cssColor(palette.window, 0.40);

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
        g.fillStyle = fillColor;
        g.strokeStyle = strokeColor;
        g.lineWidth = isRussia ? 1.1 : 0.7;
        g.fill();
        g.stroke();
      }
    }

    // Parallels every 10° as faint dashed guides
    g.strokeStyle = cssColor(palette.brass, 0.08);
    g.lineWidth = 0.5;
    g.setLineDash([2, 12]);
    for (let lat = -80; lat <= 80; lat += 10) {
      const y = ((90 - lat) / 180) * map.worldH;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(map.worldW, y);
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

    // Russia spans ~95° of latitude × ~170° of longitude. The "interesting"
    // window is ~25..140°E, 40..72°N — about 115° × 32°. Pick a target lng
    // span that fills the viewport: wide on landscape, narrower on portrait
    // (so Russia stays prominent instead of becoming a thin strip).
    const isPortrait = height > width;
    const targetLngSpan = isPortrait ? 75 : 110;
    map.worldW = (width / targetLngSpan) * 360;
    map.worldH = map.worldW / 2;

    // Initial camera centered on ~lng 70°, ~lat 60° (central Russia)
    const center = project(60, 70);
    map.camX = center.x - width * 0.5;
    map.camY = center.y - height * 0.5;

    if (map.geojson) buildWorldCache();
  }

  // --- Drawing -------------------------------------------------------------

  function pointToScreen(lat, lng) {
    const w = project(lat, lng);
    return { x: w.x - map.camX, y: w.y - map.camY };
  }

  function drawBaseMap() {
    if (!map.cached) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(map.cached, -map.camX, -map.camY);
    ctx.restore();
  }

  function drawMonuments() {
    placedMonuments.length = 0;
    for (let i = 0; i < monuments.length; i += 1) {
      const m = monuments[i];
      if (typeof m.lat !== "number" || typeof m.lng !== "number") continue;
      const s = pointToScreen(m.lat, m.lng);
      if (s.x < -50 || s.x > width + 50 || s.y < -50 || s.y > height + 50) continue;
      const r = pointRadius(m);
      placedMonuments.push({ i, x: s.x, y: s.y, r });
    }

    // Draw halo for selected first (under everything else)
    for (const pm of placedMonuments) {
      if (pm.i !== selectedIndex) continue;
      ctx.beginPath();
      ctx.arc(pm.x, pm.y, pm.r * 3.2, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(palette.brass, 0.18);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pm.x, pm.y, pm.r * 2.0, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(palette.brass, 0.32);
      ctx.fill();
    }

    // Marker dots
    for (const pm of placedMonuments) {
      const m = monuments[pm.i];
      const isSelected = pm.i === selectedIndex;

      // Outer ring (brass on selected)
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pm.x, pm.y, pm.r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = palette.brass;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Body
      ctx.beginPath();
      ctx.arc(pm.x, pm.y, pm.r, 0, Math.PI * 2);
      ctx.fillStyle = statusColor(m.status);
      ctx.globalAlpha = m.status === "unknown" ? 0.55 : 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Inner highlight for extant
      if (m.status === "extant") {
        ctx.beginPath();
        ctx.arc(pm.x - pm.r * 0.3, pm.y - pm.r * 0.3, pm.r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = cssColor(palette.paper, 0.25);
        ctx.fill();
      }

      // Outline
      ctx.beginPath();
      ctx.arc(pm.x, pm.y, pm.r, 0, Math.PI * 2);
      ctx.strokeStyle = cssColor(palette.paper, 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // City labels for selected + larger points
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const pm of placedMonuments) {
      const m = monuments[pm.i];
      const isSelected = pm.i === selectedIndex;
      if (!isSelected && pm.r < width * 0.008) continue;
      const label = m.city || (m.country || "");
      if (!label) continue;
      const size = Math.max(11, pm.r * (isSelected ? 2.2 : 1.6));
      ctx.font = `${isSelected ? 600 : 400} ${size}px "20 Kopeek", "Courier New", monospace`;
      const tx = pm.x + pm.r + 6;
      const ty = pm.y;
      // shadow
      ctx.fillStyle = cssColor(palette.black, 0.75);
      ctx.shadowColor = cssColor(palette.black, 0.6);
      ctx.shadowBlur = 6;
      ctx.fillText(label, tx + 1, ty + 1);
      ctx.shadowBlur = 0;
      ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.85);
      ctx.fillText(label, tx, ty);
    }
    ctx.restore();
  }

  function drawLoadingState() {
    ctx.save();
    ctx.fillStyle = cssColor(palette.paper, 0.45);
    ctx.font = `400 ${Math.min(width, height) * 0.018}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("загрузка карты…", width * 0.5, height * 0.5);
    ctx.restore();
  }

  function render(now) {
    const time = (now - start) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, time - previousTime));
    previousTime = time;

    applyDynamics(dt);

    ctx.clearRect(0, 0, width, height);
    if (geoLoaded) drawBaseMap();
    if (monuments.length) drawMonuments();
    else if (!geoLoaded) drawLoadingState();

    requestAnimationFrame(render);
  }

  // --- Dynamics ------------------------------------------------------------

  function applyDynamics(dt) {
    if (map.dragging) return;
    map.camX += map.camVX * dt;
    map.camY += map.camVY * dt;
    map.camVX *= Math.pow(0.88, dt * 60);
    map.camVY *= Math.pow(0.88, dt * 60);
    if (Math.abs(map.camVX) < 0.4) map.camVX = 0;
    if (Math.abs(map.camVY) < 0.4) map.camVY = 0;

    // Pan clamps — keep the interesting region visible
    const minX = project(0, 10).x - width * 0.1;
    const maxX = project(0, 170).x - width * 0.9;
    const minY = project(80, 0).y - height * 0.1;
    const maxY = project(30, 0).y - height * 0.9;
    if (map.camX < minX) map.camX = minX;
    if (map.camX > maxX) map.camX = maxX;
    if (map.camY < minY) map.camY = minY;
    if (map.camY > maxY) map.camY = maxY;
  }

  // --- Hit test ------------------------------------------------------------

  function findMonumentAt(x, y) {
    let best = -1;
    let bestDist = Infinity;
    for (const pm of placedMonuments) {
      const d = Math.hypot(x - pm.x, y - pm.y);
      const hitR = Math.max(pm.r + 14, 22);  // generous touch target
      if (d <= hitR && d < bestDist) {
        bestDist = d;
        best = pm.i;
      }
    }
    return best;
  }

  // --- Card delegation -----------------------------------------------------
  // All card UI lives in assets/mtk41/lib/card.{css,js}. We just call into it.

  function showMonument(index) {
    selectedIndex = index;
    if (window.MtkCard) window.MtkCard.show(monuments[index]);
  }
  function hideMonument() {
    if (window.MtkCard) window.MtkCard.hide();
  }
  document.addEventListener("mtk-card-hidden", () => { selectedIndex = -1; });

  // --- Pointer interactions ------------------------------------------------

  canvas.addEventListener("pointerdown", event => {
    map.dragging = true;
    didDrag = false;
    pressStartX = event.clientX;
    pressStartY = event.clientY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = performance.now();
    pressIndex = findMonumentAt(event.clientX, event.clientY);
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
    }
  });

  canvas.addEventListener("pointermove", event => {
    if (!map.dragging) return;
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    if (!didDrag) {
      const totalDx = event.clientX - pressStartX;
      const totalDy = event.clientY - pressStartY;
      if (Math.hypot(totalDx, totalDy) > TAP_THRESHOLD) didDrag = true;
    }
    if (didDrag) {
      const now = performance.now();
      const dt = Math.max(16, now - lastPointerTime) / 1000;
      map.camX -= dx;
      map.camY -= dy;
      map.camVX = -dx / dt;
      map.camVY = -dy / dt;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastPointerTime = now;
    }
  }, { passive: true });

  function endPointer(event) {
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    if (map.dragging && !didDrag) {
      // It was a tap
      const hit = findMonumentAt(event.clientX, event.clientY);
      if (hit >= 0) {
        showMonument(hit);
        map.camVX = 0;
        map.camVY = 0;
      } else {
        hideMonument();
      }
    }
    map.dragging = false;
    pressIndex = -1;
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => {
    map.dragging = false;
  });

  window.addEventListener("resize", resize);

  // --- Data loading --------------------------------------------------------

  function loadAll() {
    return Promise.all([
      fetch("../data/ne_110m_countries.geojson").then(r => r.json()).catch(() => null),
      fetch("../data/mtk41.json").then(r => r.json()),
    ]).then(([geo, mtk]) => {
      if (geo) {
        map.geojson = geo;
        if (map.worldW) buildWorldCache();
        geoLoaded = true;
      }
      monuments = (mtk.items || []).filter(it => typeof it.lat === "number" && typeof it.lng === "number");
    });
  }

  resize();
  loadAll().then(() => {
    // Ensure cache built after geojson load if size was unknown earlier
    if (map.geojson && !map.cached) buildWorldCache();
    requestAnimationFrame(render);
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.warn("Load failed:", err);
    requestAnimationFrame(render);
  });

  // Start rendering early so loading state is visible
  requestAnimationFrame(render);
})();
