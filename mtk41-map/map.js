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
    zoom: 1,                  // 1 = default; wheel/pinch updates it
  };
  const MIN_ZOOM_FLOOR = 0.4;
  const MAX_ZOOM = 5;
  function currentMinZoom() {
    if (!map.worldW || !map.worldH) return MIN_ZOOM_FLOOR;
    return Math.max(MIN_ZOOM_FLOOR, width / map.worldW, height / map.worldH);
  }
  function clampZoom(z) {
    return Math.max(currentMinZoom(), Math.min(MAX_ZOOM, z));
  }
  function clampCamera() {
    if (!map.worldW || !map.worldH) return;
    const z = map.zoom || 1;
    const halfW = width * 0.5 / z;
    const halfH = height * 0.5 / z;
    const cxMin = halfW - width * 0.5;
    const cxMax = map.worldW - width * 0.5 - halfW;
    const cyMin = halfH - height * 0.5;
    const cyMax = map.worldH - height * 0.5 - halfH;
    if (cxMax < cxMin) map.camX = (map.worldW - width) * 0.5;
    else if (map.camX < cxMin) map.camX = cxMin;
    else if (map.camX > cxMax) map.camX = cxMax;
    if (cyMax < cyMin) map.camY = (map.worldH - height) * 0.5;
    else if (map.camY < cyMin) map.camY = cyMin;
    else if (map.camY > cyMax) map.camY = cyMax;
  }
  const ACTIVE_POINTERS = new Map();  // pointerId → {x, y} for pinch tracking
  let pinchInitialDist = 0;
  let pinchInitialZoom = 1;

  let width = 0, height = 0, dpr = 1;
  let geoLoaded = false;
  let monuments = [];                // raw items from data/mtk41.json
  let placedMonuments = [];          // monuments with screen positions, computed each frame
  let clusters = [];                 // grid-cluster results; rebuilt per frame

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

  // Winkel Tripel projection — used for the world view. Better than
  // equirectangular for continents at high latitude (USA, Canada, Scandinavia)
  // and avoids the "stretched Alaska" problem while still readable.
  //   Reference: https://en.wikipedia.org/wiki/Winkel_tripel_projection
  //   Standard parallel: φ₁ = arccos(2/π) ≈ 50.4657°
  //   Output bounds: x ∈ [-(2+π)/2, (2+π)/2] ≈ ±2.5708, y ∈ [-π/2, π/2] ≈ ±1.5708
  //   Aspect ratio (2+π)/π ≈ 1.637
  const WT_COS_PHI1 = 2 / Math.PI;                    // cos(arccos(2/π)) = 2/π
  const WT_X_HALF = (2 + Math.PI) / 2;
  const WT_Y_HALF = Math.PI / 2;

  function project(lat, lng) {
    // lat, lng in degrees → world-px coords in [0, worldW] × [0, worldH]
    const phi = lat * Math.PI / 180;
    const lambda = lng * Math.PI / 180;
    const cosphi = Math.cos(phi);
    const cosLambdaHalf = Math.cos(lambda / 2);
    const alpha = Math.acos(cosphi * cosLambdaHalf);
    const sinc = alpha < 1e-9 ? 1 : Math.sin(alpha) / alpha;
    const wx = 0.5 * (lambda * WT_COS_PHI1 + 2 * cosphi * Math.sin(lambda / 2) / sinc);
    const wy = 0.5 * (phi + Math.sin(phi) / sinc);
    // Normalize to [0,1] then scale to worldW × worldH (north up → invert y)
    const x = (wx + WT_X_HALF) / (2 * WT_X_HALF) * map.worldW;
    const y = (WT_Y_HALF - wy) / (2 * WT_Y_HALF) * map.worldH;
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

  // --- Base map — vector paths, redrawn each frame ------------------------
  // См. mtk41-map-hier/map.js: раньше рендерили в offscreen bitmap → муть
  // на большом зуме. Теперь Path2D один раз при resize/load, каждый кадр
  // ctx.fill/stroke → чётко на любом зуме.

  function buildWorldPaths() {
    map.worldPaths = null;
    if (!map.geojson) return;
    const paths = [];
    const features = map.geojson.features || [];
    for (const f of features) {
      const geom = f.geometry;
      if (!geom) continue;
      const polys =
        geom.type === "Polygon" ? [geom.coordinates] :
        geom.type === "MultiPolygon" ? geom.coordinates :
        null;
      if (!polys) continue;
      const props = f.properties || {};
      const isRussia = (props.ADMIN === "Russia") || (props.NAME === "Russia") || (props.ISO_A2 === "RU");
      const path = new Path2D();
      for (const poly of polys) {
        for (let r = 0; r < poly.length; r += 1) {
          const ring = poly[r];
          if (!ring || ring.length < 2) continue;
          for (let k = 0; k < ring.length; k += 1) {
            const [lng, lat] = ring[k];
            // Winkel Tripel — та же проекция что для points.
            const p = project(lat, lng);
            if (k === 0) path.moveTo(p.x, p.y);
            else path.lineTo(p.x, p.y);
          }
          path.closePath();
        }
      }
      paths.push({
        path,
        fillColor: isRussia ? "rgba(210, 183, 115, 0.10)" : "rgba(157, 163, 166, 0.05)",
        strokeColor: isRussia ? cssColor(palette.brass, 0.55) : cssColor(palette.window, 0.40),
        lineWidthBase: isRussia ? 1.1 : 0.7,
      });
    }
    const par = new Path2D();
    for (let lat = -80; lat <= 80; lat += 10) {
      let first = true;
      for (let lng = -180; lng <= 180; lng += 5) {
        const p = project(lat, lng);
        if (first) { par.moveTo(p.x, p.y); first = false; }
        else par.lineTo(p.x, p.y);
      }
    }
    map.worldPaths = paths;
    map.parallelsPath = par;
  }
  function buildWorldCache() { buildWorldPaths(); }  // legacy alias

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // World coordinates use Winkel Tripel projection. Range: full 360° lng
    // covered by worldW; aspect ratio (2+π)/π ≈ 1.637.
    // targetLngSpan = how many degrees of longitude fit the viewport at zoom=1.
    // 236 памятников в 45 странах → удобно видеть большую часть мира разом.
    const isPortrait = height > width;
    const targetLngSpan = isPortrait ? 130 : 180;
    map.worldW = (width / targetLngSpan) * 360;
    map.worldH = map.worldW / 1.637;

    // Initial camera centered on ~lng 30°, ~lat 40° — покрывает Европу,
    // Северную Африку, Ближний Восток, ex-USSR западная половина.
    // США/Австралия/Дальний Восток — pan или zoom-out.
    const center = project(40, 30);
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
    if (!map.worldPaths) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.translate(-map.camX, -map.camY);
    const invZ = 1 / map.zoom;
    for (const p of map.worldPaths) {
      ctx.fillStyle = p.fillColor;
      ctx.fill(p.path);
      ctx.strokeStyle = p.strokeColor;
      ctx.lineWidth = p.lineWidthBase * invZ;
      ctx.stroke(p.path);
    }
    if (map.parallelsPath) {
      ctx.strokeStyle = cssColor(palette.brass, 0.08);
      ctx.lineWidth = 0.5 * invZ;
      ctx.setLineDash([2 * invZ, 12 * invZ]);
      ctx.stroke(map.parallelsPath);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawMonuments() {
    placedMonuments.length = 0;
    // Zoom-adjusted cull: at zoom<1 the viewport spans MORE pre-zoom units
    // than [0..width]. Without the correction Америки/Австралия отваливались.
    const zoom = Math.max(0.01, map.zoom);
    const halfViewW = width / (2 * zoom);
    const halfViewH = height / (2 * zoom);
    const viewMinX = width * 0.5 - halfViewW;
    const viewMaxX = width * 0.5 + halfViewW;
    const viewMinY = height * 0.5 - halfViewH;
    const viewMaxY = height * 0.5 + halfViewH;
    for (let i = 0; i < monuments.length; i += 1) {
      const m = monuments[i];
      if (typeof m.lat !== "number" || typeof m.lng !== "number") continue;
      const s = pointToScreen(m.lat, m.lng);
      if (s.x < viewMinX - 50 || s.x > viewMaxX + 50 ||
          s.y < viewMinY - 50 || s.y > viewMaxY + 50) continue;
      const r = pointRadius(m);
      placedMonuments.push({ i, x: s.x, y: s.y, r });
    }

    rebuildClusters();

    // Draw halo for selected (search by membership)
    for (const cl of clusters) {
      if (!cl.members.includes(selectedIndex)) continue;
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.r * 3.2, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(palette.brass, 0.18);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.r * 2.0, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(palette.brass, 0.32);
      ctx.fill();
    }

    // Cluster markers
    for (const cl of clusters) {
      const isCluster = cl.members.length > 1;
      const m = monuments[cl.members[0]];   // representative for N=1; for N>1 used only as colour fallback
      const hasSelected = cl.members.includes(selectedIndex);

      // Compute fill colour: cluster → mixed (brass if any extant, graphite if all demolished)
      let fill, alpha = 0.92;
      if (isCluster) {
        const extantCount = cl.members.reduce((acc, mi) =>
          acc + (monuments[mi].status === "extant" ? 1 : 0), 0);
        const demoCount = cl.members.reduce((acc, mi) =>
          acc + (monuments[mi].status === "demolished" ? 1 : 0), 0);
        if (extantCount === 0) fill = palette.graphite;
        else if (demoCount === 0) fill = palette.red;
        else fill = palette.brass;       // mixed
      } else {
        fill = statusColor(m.status);
        alpha = m.status === "unknown" ? 0.55 : 0.92;
      }

      if (hasSelected) {
        ctx.beginPath();
        ctx.arc(cl.x, cl.y, cl.r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = palette.brass;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (!isCluster && m.status === "extant") {
        ctx.beginPath();
        ctx.arc(cl.x - cl.r * 0.3, cl.y - cl.r * 0.3, cl.r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = cssColor(palette.paper, 0.25);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.r, 0, Math.PI * 2);
      ctx.strokeStyle = cssColor(palette.paper, 0.55);
      ctx.lineWidth = isCluster ? 1.5 : 1;
      ctx.stroke();

      // Count label inside cluster (only for N≥2)
      if (isCluster) {
        const fontPx = Math.max(10, cl.r * 0.95) / map.zoom;
        ctx.save();
        ctx.font = `600 ${fontPx}px "20 Kopeek", "Courier New", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = cssColor(palette.black, 0.85);
        ctx.fillText(String(cl.members.length), cl.x, cl.y);
        ctx.restore();
      }
    }

    // Labels — one per cluster (city of representative; clusters show N city).
    // Skip if it would overlap an already-drawn label.
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const drawnRects = [];
    function rectsOverlap(a, b) {
      return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
    }
    // Sort: clusters w/ selected first, then by size descending
    const order = clusters.slice().sort((a, b) => {
      const aSel = a.members.includes(selectedIndex);
      const bSel = b.members.includes(selectedIndex);
      if (aSel !== bSel) return bSel - aSel;
      return b.r - a.r;
    });

    const zoomedIn = map.zoom > 1.6;
    for (const cl of order) {
      cl.labelRect = null;   // reset — set below only for actually-drawn labels
      const isCluster = cl.members.length > 1;
      const isSelected = cl.members.includes(selectedIndex);
      if (!isSelected && !zoomedIn && cl.r < width * 0.008) continue;
      // Cluster label: city of representative
      const repIdx = cl.members[0];
      const m = monuments[repIdx];
      const label = m.city || (m.country || "");
      if (!label) continue;
      const size = Math.max(11, cl.r * (isSelected ? 2.2 : 1.4)) / map.zoom;
      ctx.font = `${isSelected ? 600 : 400} ${size}px "20 Kopeek", "Courier New", monospace`;
      const tx = cl.x + cl.r + 6;
      const ty = cl.y;
      const labelW = ctx.measureText(label).width;
      const rect = [tx - 2, ty - size * 0.6, tx + labelW + 2, ty + size * 0.6];
      if (!isSelected && drawnRects.some(r => rectsOverlap(r, rect))) continue;
      cl.labelRect = rect;   // persist so findClusterAt can hit-test the label too
      drawnRects.push(rect);
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

  // --- Clustering ----------------------------------------------------------
  // Grid-bucket clustering at constant viewport-px cell size: as zoom grows
  // the world-space cell shrinks → clusters break apart. At zoom = 1 a cell
  // is ~42px; zoom = 3 → ~14px; so by zoom > 2 most cities are individual.
  function rebuildClusters() {
    clusters.length = 0;
    if (!placedMonuments.length) return;
    const CELL_VPX = 42;
    const cellWorld = CELL_VPX / map.zoom;
    const grid = new Map();
    for (let i = 0; i < placedMonuments.length; i += 1) {
      const pm = placedMonuments[i];
      const cx = Math.floor(pm.x / cellWorld);
      const cy = Math.floor(pm.y / cellWorld);
      const key = cx + "," + cy;
      let bucket = grid.get(key);
      if (!bucket) { bucket = []; grid.set(key, bucket); }
      bucket.push(i);
    }
    for (const bucket of grid.values()) {
      let sx = 0, sy = 0;
      const members = [];
      for (const pmIdx of bucket) {
        const pm = placedMonuments[pmIdx];
        sx += pm.x;
        sy += pm.y;
        members.push(pm.i);
      }
      const x = sx / bucket.length;
      const y = sy / bucket.length;
      let r;
      if (bucket.length === 1) {
        r = placedMonuments[bucket[0]].r;
      } else {
        // Larger circle for higher member-count, capped so it doesn't dominate
        r = Math.min(28, 9 + Math.sqrt(bucket.length) * 4.5);
      }
      clusters.push({ x, y, r, members });
    }
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
    ctx.save();
    // Zoom centred on the viewport middle
    ctx.translate(width * 0.5, height * 0.5);
    ctx.scale(map.zoom, map.zoom);
    ctx.translate(-width * 0.5, -height * 0.5);
    if (geoLoaded) drawBaseMap();
    if (monuments.length) drawMonuments();
    ctx.restore();
    if (!geoLoaded) drawLoadingState();
    drawZoomHint();

    requestAnimationFrame(render);
  }

  function drawZoomHint() {
    ctx.save();
    ctx.font = `400 ${Math.max(11, Math.min(width, height) * 0.011)}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = cssColor(palette.brass, 0.55);
    const zoomLabel = map.zoom === 1 ? "" : `×${map.zoom.toFixed(2)} · `;
    ctx.fillText(zoomLabel + "PINCH/WHEEL = ZOOM · DRAG = PAN · TAP N = ZOOM IN", width - 12, height - 10);
    ctx.restore();
  }

  // --- Dynamics ------------------------------------------------------------

  function applyDynamics(dt) {
    if (map.dragging) { clampCamera(); return; }
    map.camX += map.camVX * dt;
    map.camY += map.camVY * dt;
    map.camVX *= Math.pow(0.88, dt * 60);
    map.camVY *= Math.pow(0.88, dt * 60);
    if (Math.abs(map.camVX) < 0.4) map.camVX = 0;
    if (Math.abs(map.camVY) < 0.4) map.camVY = 0;
    clampCamera();
  }

  // --- Hit test ------------------------------------------------------------

  // Convert raw client coords to the pre-transform space where placedMonuments live
  function clientToWorld(cx, cy) {
    return {
      x: (cx - width * 0.5) / map.zoom + width * 0.5,
      y: (cy - height * 0.5) / map.zoom + height * 0.5,
    };
  }

  // Returns the closest cluster to (cx, cy) or null if nothing nearby.
  // Two-pass: label rects win first (a click landing on the "Ижевск" text
  // must open Ижевск, even if Уфа's dot is closer to the click). Only when
  // no label rect contains the click do we fall back to dot proximity.
  function findClusterAt(cx, cy) {
    const p = clientToWorld(cx, cy);
    // Pass 1 — label hit
    let bestLabel = null;
    let bestLabelDist = Infinity;
    for (const cl of clusters) {
      const lr = cl.labelRect;
      if (!lr) continue;
      const pad = 4 / map.zoom;
      if (p.x >= lr[0] - pad && p.x <= lr[2] + pad &&
          p.y >= lr[1] - pad && p.y <= lr[3] + pad) {
        // Tie-break within overlapping labels: closer dot wins
        const d = Math.hypot(p.x - cl.x, p.y - cl.y);
        if (d < bestLabelDist) { bestLabelDist = d; bestLabel = cl; }
      }
    }
    if (bestLabel) return bestLabel;
    // Pass 2 — dot proximity
    let best = null;
    let bestDist = Infinity;
    for (const cl of clusters) {
      const d = Math.hypot(p.x - cl.x, p.y - cl.y);
      const hitR = Math.max(cl.r + 14, 22 / map.zoom);
      if (d <= hitR && d < bestDist) { bestDist = d; best = cl; }
    }
    return best;
  }

  // Zoom in onto the screen-space bounding box of a cluster's members,
  // aiming for the cluster to span ~55% of the viewport. Updates map.zoom
  // and re-centres the camera so the cluster's centre lands at viewport
  // middle.
  function zoomToCluster(cl) {
    if (!cl || cl.members.length < 2) return;
    // Determine the world-space bbox of the member positions
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const mi of cl.members) {
      const pm = placedMonuments.find(p => p.i === mi);
      if (!pm) continue;
      if (pm.x < minX) minX = pm.x;
      if (pm.x > maxX) maxX = pm.x;
      if (pm.y < minY) minY = pm.y;
      if (pm.y > maxY) maxY = pm.y;
    }
    if (!isFinite(minX)) return;
    const span = Math.max(60, Math.max(maxX - minX, maxY - minY) || 60);
    // Target zoom: span × zoom = 0.55 × viewport (so we don't overshoot)
    const targetSpanPx = Math.min(width, height) * 0.55;
    const factor = targetSpanPx / span;
    const newZoom = clampZoom(map.zoom * factor);
    if (newZoom <= map.zoom * 1.05) {
      // Already zoomed enough — bump 1.7× to break the cluster open
      map.zoom = Math.min(MAX_ZOOM, map.zoom * 1.7);
    } else {
      map.zoom = newZoom;
    }
    // Re-center camera so cluster lands at viewport middle. cl.x/y are in
    // world coords (pre-zoom). We want screenX(cl.x) === width/2.
    // screenX = (cl.x + viewport adjustment by camX) post zoom transform.
    // Actually the cluster is drawn at pre-transform (cl.x, cl.y), then
    // scaled around viewport centre. To land at viewport centre we need
    // cl.x === width/2 — adjust camX accordingly. cl.x is computed from
    // pointToScreen which subtracts camX. So shift camX by (cl.x - width/2).
    map.camX += cl.x - width * 0.5;
    map.camY += cl.y - height * 0.5;
    map.camVX = 0;
    map.camVY = 0;
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
    ACTIVE_POINTERS.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (ACTIVE_POINTERS.size === 2) {
      // Pinch start: record initial finger distance
      const pts = Array.from(ACTIVE_POINTERS.values());
      pinchInitialDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchInitialZoom = map.zoom;
      return;
    }
    map.dragging = true;
    didDrag = false;
    pressStartX = event.clientX;
    pressStartY = event.clientY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = performance.now();
    pressIndex = -1;   // resolved on tap-end via findClusterAt
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
    }
  });

  canvas.addEventListener("pointermove", event => {
    if (ACTIVE_POINTERS.has(event.pointerId)) {
      ACTIVE_POINTERS.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (ACTIVE_POINTERS.size === 2) {
      // Pinch zoom — recompute zoom from current finger distance
      const pts = Array.from(ACTIVE_POINTERS.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (pinchInitialDist > 0) {
        const target = pinchInitialZoom * (dist / pinchInitialDist);
        map.zoom = clampZoom(target);
      }
      didDrag = true;   // pinch cancels tap intent
      return;
    }
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
      // Drag delta in viewport px → world px (zoom-aware)
      map.camX -= dx / map.zoom;
      map.camY -= dy / map.zoom;
      map.camVX = -dx / dt / map.zoom;
      map.camVY = -dy / dt / map.zoom;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastPointerTime = now;
    }
  }, { passive: true });

  // Wheel = zoom toward cursor (desktop / trackpad)
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    const newZoom = clampZoom(map.zoom * factor);
    if (newZoom === map.zoom) return;
    map.zoom = newZoom;
  }, { passive: false });

  function endPointer(event) {
    ACTIVE_POINTERS.delete(event.pointerId);
    if (ACTIVE_POINTERS.size < 2) pinchInitialDist = 0;
    // If one finger of a pinch lifted but another remains, re-seed lastPointer
    // to its current position so we don't apply a giant catch-up pan delta.
    if (ACTIVE_POINTERS.size === 1) {
      const remaining = Array.from(ACTIVE_POINTERS.values())[0];
      lastPointerX = remaining.x;
      lastPointerY = remaining.y;
      didDrag = true;            // suppress tap intent — user was pinching
    }
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    if (ACTIVE_POINTERS.size === 0 && map.dragging && !didDrag) {
      const cl = findClusterAt(event.clientX, event.clientY);
      if (cl && cl.members.length > 1) {
        // Tap on a cluster — zoom in to break it open
        zoomToCluster(cl);
      } else if (cl && cl.members.length === 1) {
        showMonument(cl.members[0]);
        map.camVX = 0;
        map.camVY = 0;
      } else {
        hideMonument();
      }
    }
    if (ACTIVE_POINTERS.size === 0) map.dragging = false;
    pressIndex = -1;
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", event => {
    ACTIVE_POINTERS.delete(event.pointerId);
    if (ACTIVE_POINTERS.size === 0) map.dragging = false;
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
    if (map.geojson && !map.worldPaths) buildWorldCache();
    requestAnimationFrame(render);
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.warn("Load failed:", err);
    requestAnimationFrame(render);
  });

  // Start rendering early so loading state is visible
  requestAnimationFrame(render);
})();
