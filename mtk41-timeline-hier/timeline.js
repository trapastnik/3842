/**
 * МТК 41 · Хронология Ленинианы, иерархическая версия.
 *
 * Уровни LOD по оси времени:
 *   DECADE (z < thrDecade)   — 10 декад (1920s..2020s), кружки размера √N
 *   YEAR   (thrDecade..thrYear) — год как один кружок с числом
 *   LEAF   (z >= thrYear)    — индивидуальные памятники, лейблы, карточки
 *
 * Три дорожки по статусу:
 *   верх    — сохранился
 *   центр   — судьба неизвестна
 *   низ     — снесён
 *
 * Ось только горизонтальная (годы). Wheel/pinch — zoom по времени,
 * drag — пан по годам. Тап на кластер N>1 — анимация к его временному
 * диапазону + переход на следующий уровень. Тап на LEAF — карточка.
 */
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

  // ---------- Time bounds ----------
  const YEAR_MIN = 1918;   // 1919 первый бюст, отступ
  const YEAR_MAX = 2024;   // 2020 последний памятник + запас
  const TOTAL_YEARS = YEAR_MAX - YEAR_MIN;

  // ---------- Camera ----------
  const view = {
    zoom: 1.0,             // 1 = весь диапазон в viewport
    yearCenter: (YEAR_MIN + YEAR_MAX) / 2,
    velY: 0,               // пан-инерция по годам
  };
  const MIN_ZOOM_FLOOR = 1.0;
  const MAX_ZOOM = 30;

  // ---------- State ----------
  let width = 0, height = 0, dpr = 1;
  let items = [];
  let selectedIndex = -1;
  let didDrag = false;
  let dragging = false;
  let pressStartX = 0, pressStartY = 0;
  let lastPointerX = 0, lastPointerY = 0, lastPointerTime = 0;
  const TAP_THRESHOLD = 8;
  const ACTIVE_POINTERS = new Map();
  let pinchInitialDist = 0, pinchInitialZoom = 1;

  let start = performance.now();
  let previousTime = 0;

  // ---------- Settings ----------
  const SETTINGS_KEY = "mtk41-timeline-hier-settings";
  const DEFAULT_SETTINGS = {
    sizeMode: "sqrt",
    thrDecade: 1.8,
    thrYear: 5.0,
    labelScale: 1.4,
    showEvents: true,
    crossfade: true,
    show3D: true,
  };
  function loadSettings() {
    try {
      const raw = sessionStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) { return { ...DEFAULT_SETTINGS }; }
  }
  function saveSettings() {
    try { sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }
  const settings = loadSettings();

  // ---------- Historical events ----------
  const HISTORICAL_EVENTS = [
    { year: 1924.06, label: "смерть В. И. Ленина" },
    { year: 1956, label: "XX съезд КПСС" },
    { year: 1991, label: "распад СССР" },
    { year: 2014, label: "Крым в РФ" },
    { year: 2022.75, label: "4 области в РФ" },
  ];

  // ---------- Utilities ----------
  function cssColor(hex, alpha) {
    const v = hex.replace("#", "");
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function statusLane(status) {
    if (status === "extant") return "extant";
    if (status === "demolished") return "demolished";
    return "unknown";
  }

  function statusColor(status) {
    switch (status) {
      case "extant":     return palette.red;
      case "demolished": return palette.graphite;
      case "relocated":  return palette.brass;
      default:           return palette.window;
    }
  }

  const LANE_ORDER = ["extant", "unknown", "demolished"];
  function laneY(lane) {
    const centerY = height * 0.55;
    const spread  = height * 0.20;
    if (lane === "extant")     return centerY - spread;
    if (lane === "demolished") return centerY + spread;
    return centerY;   // unknown
  }

  // ---------- Coord ----------
  const PAD_LEFT_FRAC  = 0.05;
  const PAD_RIGHT_FRAC = 0.03;
  function usableWidth() {
    return width * (1 - PAD_LEFT_FRAC - PAD_RIGHT_FRAC);
  }
  function pxPerYear() {
    return (usableWidth() / TOTAL_YEARS) * view.zoom;
  }
  function yearToScreen(y) {
    return width * 0.5 + (y - view.yearCenter) * pxPerYear();
  }
  function screenToYear(sx) {
    return view.yearCenter + (sx - width * 0.5) / pxPerYear();
  }

  function clampZoom(z) {
    return Math.max(MIN_ZOOM_FLOOR, Math.min(MAX_ZOOM, z));
  }
  // Clamp yearCenter so viewport stays within [YEAR_MIN, YEAR_MAX] as much
  // as possible. At zoom=1 the whole range fits and yearCenter is locked
  // to the middle.
  function clampCamera() {
    const halfYearsInView = TOTAL_YEARS / (2 * view.zoom);
    const minCenter = YEAR_MIN + halfYearsInView;
    const maxCenter = YEAR_MAX - halfYearsInView;
    if (maxCenter < minCenter) view.yearCenter = (YEAR_MIN + YEAR_MAX) / 2;
    else {
      if (view.yearCenter < minCenter) view.yearCenter = minCenter;
      if (view.yearCenter > maxCenter) view.yearCenter = maxCenter;
    }
  }

  // ---------- Aggregation ----------
  const byDecade = new Map();  // decade -> { extant: [i,..], unknown: [i,..], demolished: [i,..] }
  const byYear = new Map();    // "year:lane" -> [i,..]
  const yearsList = [];        // sorted unique years present

  function rebuildAggregates() {
    byDecade.clear();
    byYear.clear();
    const yearsSet = new Set();
    for (let i = 0; i < items.length; i += 1) {
      const m = items[i];
      if (!m.year) continue;
      yearsSet.add(m.year);
      const decade = Math.floor(m.year / 10) * 10;
      const lane = statusLane(m.status);
      let d = byDecade.get(decade);
      if (!d) { d = { extant: [], unknown: [], demolished: [] }; byDecade.set(decade, d); }
      d[lane].push(i);
      const yk = m.year + ":" + lane;
      let y = byYear.get(yk);
      if (!y) { y = []; byYear.set(yk, y); }
      y.push(i);
    }
    yearsList.length = 0;
    for (const y of Array.from(yearsSet).sort((a, b) => a - b)) yearsList.push(y);
  }

  // ---------- Sizing ----------
  function shortSide() { return Math.min(width, height); }
  function sizeFor(count) {
    const s = shortSide();
    const base = s * 0.010;
    const cap = s * 0.055;
    let r;
    const mode = settings.sizeMode;
    if (mode === "linear") r = base + s * 0.0016 * count;
    else if (mode === "log") r = base + s * 0.011 * Math.log2(count + 1);
    else r = base + s * 0.0055 * Math.sqrt(count);
    return Math.min(cap, r);
  }
  const LEAF_R_FRAC = 0.006;

  // ---------- Level ----------
  function levelFor(z) {
    if (z < settings.thrDecade) return "DECADE";
    if (z < settings.thrYear) return "YEAR";
    return "LEAF";
  }

  // ---------- Cluster materialization ----------
  // Each cluster: { x, y, r, count, indices, lane, label, year }
  function buildClusters(level) {
    const out = [];
    if (level === "DECADE") {
      for (const [decade, laneMap] of byDecade) {
        for (const lane of LANE_ORDER) {
          const idx = laneMap[lane];
          if (!idx.length) continue;
          const x = yearToScreen(decade + 5);
          const y = laneY(lane);
          const r = idx.length > 1 ? sizeFor(idx.length) : shortSide() * LEAF_R_FRAC;
          out.push({
            x, y, r, count: idx.length,
            indices: idx.slice(),
            lane, label: decade + "s",
            timeCenter: decade + 5,
            timeSpan: 10,
          });
        }
      }
    } else if (level === "YEAR") {
      for (const [key, idx] of byYear) {
        const [yearStr, lane] = key.split(":");
        const year = +yearStr;
        const x = yearToScreen(year);
        const y = laneY(lane);
        const r = idx.length > 1 ? sizeFor(idx.length) : shortSide() * LEAF_R_FRAC;
        out.push({
          x, y, r, count: idx.length,
          indices: idx.slice(),
          lane, label: String(year),
          timeCenter: year,
          timeSpan: 1,
        });
      }
    } else {   // LEAF
      for (let i = 0; i < items.length; i += 1) {
        const m = items[i];
        if (!m.year) continue;
        const x = yearToScreen(m.year);
        const y = laneY(statusLane(m.status));
        const r = shortSide() * LEAF_R_FRAC;
        out.push({
          x, y, r, count: 1,
          indices: [i],
          lane: statusLane(m.status),
          label: m.city || "",
          timeCenter: m.year,
          timeSpan: 0.1,
        });
      }
    }
    return out;
  }

  // ---------- Non-overlap relaxation ----------
  // Only horizontal — keep clusters on their lane's y.
  function relaxHoriz(clusters, gapPx, maxIters) {
    const n = clusters.length;
    for (let iter = 0; iter < maxIters; iter += 1) {
      let moved = 0;
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const a = clusters[i], b = clusters[j];
          if (a.lane !== b.lane) continue;   // разные дорожки не толкают друг друга
          const dx = b.x - a.x;
          const d = Math.abs(dx);
          const minD = a.r + b.r + gapPx;
          if (d < minD) {
            const push = (minD - d) * 0.5;
            const sign = dx >= 0 ? 1 : -1;
            a.x -= sign * push;
            b.x += sign * push;
            moved += 1;
          }
        }
      }
      if (moved === 0) break;
    }
  }

  // ---------- Drawing ----------
  function drawAxis() {
    // Central axis line + lane guides
    ctx.save();
    ctx.strokeStyle = cssColor(palette.window, 0.20);
    ctx.lineWidth = 1;
    for (const lane of LANE_ORDER) {
      const y = laneY(lane);
      ctx.beginPath();
      ctx.moveTo(width * PAD_LEFT_FRAC, y);
      ctx.lineTo(width * (1 - PAD_RIGHT_FRAC), y);
      ctx.stroke();
    }

    // Vertical year gridlines
    const ppy = pxPerYear();
    let step;
    if (ppy > 60) step = 1;
    else if (ppy > 20) step = 5;
    else step = 10;
    ctx.strokeStyle = cssColor(palette.window, 0.10);
    for (let y = Math.ceil(YEAR_MIN / step) * step; y <= YEAR_MAX; y += step) {
      const sx = yearToScreen(y);
      if (sx < 0 || sx > width) continue;
      ctx.beginPath();
      ctx.moveTo(sx, laneY("extant") - height * 0.05);
      ctx.lineTo(sx, laneY("demolished") + height * 0.05);
      ctx.stroke();
    }

    // Year labels (major)
    ctx.fillStyle = cssColor(palette.paper, 0.60);
    const labelStep = ppy > 30 ? 5 : 10;
    const fontPx = Math.max(11, Math.min(height * 0.020, 24)) * settings.labelScale;
    ctx.font = `500 ${fontPx}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const yLabels = laneY("demolished") + height * 0.06;
    for (let y = Math.ceil(YEAR_MIN / labelStep) * labelStep; y <= YEAR_MAX; y += labelStep) {
      const sx = yearToScreen(y);
      if (sx < width * PAD_LEFT_FRAC - 30 || sx > width * (1 - PAD_RIGHT_FRAC) + 30) continue;
      ctx.fillText(String(y), sx, yLabels);
    }

    // Lane labels (left edge)
    ctx.font = `600 ${fontPx * 0.85}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const lx = width * PAD_LEFT_FRAC - 12;
    ctx.fillStyle = cssColor(palette.red, 0.7);
    ctx.fillText("сохранились", lx, laneY("extant"));
    ctx.fillStyle = cssColor(palette.window, 0.6);
    ctx.fillText("судьба ?", lx, laneY("unknown"));
    ctx.fillStyle = cssColor(palette.paper, 0.5);
    ctx.fillText("снесены", lx, laneY("demolished"));

    ctx.restore();
  }

  function drawHistoricalEvents() {
    if (!settings.showEvents) return;
    ctx.save();
    const fontPx = Math.max(10, Math.min(height * 0.017, 20)) * settings.labelScale;
    ctx.font = `400 ${fontPx}px "20 Kopeek", "Courier New", monospace`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.strokeStyle = cssColor(palette.red, 0.40);
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.2;
    const yTop = laneY("extant") - height * 0.08;
    const yBottom = laneY("demolished") + height * 0.08;
    for (const ev of HISTORICAL_EVENTS) {
      const sx = yearToScreen(ev.year);
      if (sx < width * PAD_LEFT_FRAC - 30 || sx > width * (1 - PAD_RIGHT_FRAC) + 30) continue;
      ctx.beginPath();
      ctx.moveTo(sx, yTop);
      ctx.lineTo(sx, yBottom);
      ctx.stroke();
      ctx.fillStyle = cssColor(palette.red, 0.75);
      ctx.fillText(ev.label, sx, yTop - fontPx * 1.6);
      ctx.fillStyle = cssColor(palette.red, 0.55);
      ctx.fillText(String(Math.floor(ev.year)), sx, yTop - fontPx * 0.4);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawLevel(clusters, layerAlpha, level) {
    const gapPx = 4;
    relaxHoriz(clusters, gapPx, 30);
    ctx.save();
    ctx.globalAlpha = layerAlpha;
    // Circles + counts
    for (const cl of clusters) {
      const isCluster = cl.count > 1;
      const isSel = cl.indices.includes(selectedIndex);
      let fill;
      if (isCluster) {
        // Кластер окрашен по своей дорожке (lane == status)
        if (cl.lane === "extant") fill = palette.red;
        else if (cl.lane === "demolished") fill = palette.graphite;
        else fill = palette.window;
      } else {
        fill = statusColor(items[cl.indices[0]].status);
      }
      const alpha = cl.lane === "unknown" ? 0.55 : 0.92;

      // Selection halo
      if (isSel) {
        ctx.beginPath();
        ctx.arc(cl.x, cl.y, cl.r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = palette.brass;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      // Body
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.globalAlpha = alpha * layerAlpha;
      ctx.fill();
      ctx.globalAlpha = layerAlpha;
      // Outline
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.r, 0, Math.PI * 2);
      ctx.strokeStyle = cssColor(palette.paper, 0.55);
      ctx.lineWidth = isCluster ? 1.4 : 1;
      ctx.stroke();

      // Count inside for N>1
      if (isCluster) {
        const fp = Math.max(11, cl.r * 0.75);
        ctx.font = `600 ${fp}px "20 Kopeek", "Courier New", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = cssColor(palette.black, 0.85);
        ctx.fillText(String(cl.count), cl.x, cl.y);
      }
    }

    // Labels
    ctx.textBaseline = "middle";
    const drawn = [];
    function overlap(a, b) {
      return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
    }
    // Sort: bigger circles first (they claim label priority)
    const order = clusters.slice().sort((a, b) => b.r - a.r);
    const isPortrait = height > width;
    for (const cl of order) {
      if (!cl.label) continue;
      // For LEAF в портрете лейбл повёрнут -60°.
      const isLeaf = cl.count === 1 && level === "LEAF";
      const isSel = cl.indices.includes(selectedIndex);
      const fontVpxRaw = Math.max(12, Math.min(28, cl.r * 0.55)) * settings.labelScale;
      const fontVpx = isSel ? fontVpxRaw * 1.15 : fontVpxRaw;
      ctx.font = `${isSel ? 600 : 400} ${fontVpx}px "20 Kopeek", "Courier New", monospace`;

      const text = cl.label;
      const w = ctx.measureText(text).width;
      // Label placed below cluster on lane
      const py = cl.y + cl.r + fontVpx * 0.6 + 4;
      const px = cl.x;
      if (isLeaf && isPortrait) {
        // Rotated -60° label
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-Math.PI / 3);
        ctx.textAlign = "right";
        ctx.fillStyle = cssColor(palette.black, 0.75 * layerAlpha);
        ctx.shadowColor = cssColor(palette.black, 0.6 * layerAlpha);
        ctx.shadowBlur = 4;
        ctx.fillText(text, 1, 1);
        ctx.shadowBlur = 0;
        ctx.fillStyle = isSel ? palette.brass : cssColor(palette.paper, 0.88 * layerAlpha);
        ctx.fillText(text, 0, 0);
        ctx.restore();
        cl.labelRect = null;   // rotated — hit-test via dot only
      } else {
        // Straight label
        const rect = [px - w * 0.5 - 4, py - fontVpx * 0.6, px + w * 0.5 + 4, py + fontVpx * 0.6];
        if (drawn.some(r => overlap(r, rect))) { cl.labelRect = null; continue; }
        drawn.push(rect);
        cl.labelRect = rect;
        ctx.textAlign = "center";
        ctx.fillStyle = cssColor(palette.black, 0.75 * layerAlpha);
        ctx.shadowColor = cssColor(palette.black, 0.6 * layerAlpha);
        ctx.shadowBlur = 4;
        ctx.fillText(text, px + 1, py + 1);
        ctx.shadowBlur = 0;
        ctx.fillStyle = isSel ? palette.brass : cssColor(palette.paper, 0.88 * layerAlpha);
        ctx.fillText(text, px, py);
      }
    }

    ctx.restore();
  }

  // ---------- Cross-fade ----------
  const FADE_HALF = 0.15;
  let lastClusters = [];

  function drawClustersWithFade() {
    const z = view.zoom;
    const thrs = [
      { z: settings.thrDecade, lower: "DECADE", upper: "YEAR" },
      { z: settings.thrYear, lower: "YEAR", upper: "LEAF" },
    ];
    const currentLevel = levelFor(z);
    let band = null;
    if (settings.crossfade) {
      for (const t of thrs) {
        if (Math.abs(z - t.z) < FADE_HALF) { band = t; break; }
      }
    }
    if (!band) {
      const cls = buildClusters(currentLevel);
      drawLevel(cls, 1.0, currentLevel);
      lastClusters = cls;
      return;
    }
    const t = (z - (band.z - FADE_HALF)) / (2 * FADE_HALF);
    const upperAlpha = t;
    const lowerAlpha = 1 - t;
    const lowerCls = buildClusters(band.lower);
    const upperCls = buildClusters(band.upper);
    drawLevel(lowerCls, lowerAlpha, band.lower);
    drawLevel(upperCls, upperAlpha, band.upper);
    lastClusters = upperAlpha >= lowerAlpha ? upperCls.concat(lowerCls) : lowerCls.concat(upperCls);
  }

  // ---------- Animation ----------
  let anim = null;
  function animateTo(targetZoom, targetYearCenter, dur) {
    anim = {
      fromZoom: view.zoom, toZoom: targetZoom,
      fromCenter: view.yearCenter, toCenter: targetYearCenter,
      t0: performance.now(), dur: dur || 420,
    };
    view.velY = 0;
  }
  function updateAnim() {
    if (!anim) return;
    const t = Math.min(1, (performance.now() - anim.t0) / anim.dur);
    const e = 1 - Math.pow(1 - t, 3);
    view.zoom = anim.fromZoom + (anim.toZoom - anim.fromZoom) * e;
    view.yearCenter = anim.fromCenter + (anim.toCenter - anim.fromCenter) * e;
    if (t >= 1) anim = null;
  }

  function drilldownTo(cluster) {
    const cur = levelFor(view.zoom);
    let targetZoom;
    if (cur === "DECADE") targetZoom = settings.thrDecade + 0.15;
    else if (cur === "YEAR") targetZoom = settings.thrYear + 0.15;
    else return;
    // Fit cluster's timeSpan to ~55% of viewport
    const spanYears = Math.max(1, cluster.timeSpan);
    const desired = (TOTAL_YEARS / spanYears) * 0.55;
    const finalZoom = clampZoom(Math.max(targetZoom, Math.min(MAX_ZOOM, desired)));
    animateTo(finalZoom, cluster.timeCenter, 420);
  }
  function goHome() {
    animateTo(1.0, (YEAR_MIN + YEAR_MAX) / 2, 500);
  }
  function zoomOutOneLevel() {
    const cur = levelFor(view.zoom);
    let target;
    if (cur === "LEAF") target = settings.thrDecade + 0.1;
    else if (cur === "YEAR") target = settings.thrDecade - 0.1;
    else target = 1.0;
    animateTo(clampZoom(target), view.yearCenter, 380);
  }

  // ---------- Hit test ----------
  function findClusterAt(cx, cy) {
    // Pass 1 — label rect
    let bestLabel = null, bestLabelD = Infinity;
    for (const cl of lastClusters) {
      const lr = cl.labelRect;
      if (!lr) continue;
      const pad = 6;
      if (cx >= lr[0] - pad && cx <= lr[2] + pad && cy >= lr[1] - pad && cy <= lr[3] + pad) {
        const d = Math.hypot(cx - cl.x, cy - cl.y);
        if (d < bestLabelD) { bestLabelD = d; bestLabel = cl; }
      }
    }
    if (bestLabel) return bestLabel;
    // Pass 2 — dot proximity
    let best = null, bestD = Infinity;
    for (const cl of lastClusters) {
      const d = Math.hypot(cx - cl.x, cy - cl.y);
      const hitR = Math.max(cl.r + 12, 22);
      if (d <= hitR && d < bestD) { bestD = d; best = cl; }
    }
    return best;
  }

  // ---------- Card ----------
  function showMonument(index) {
    selectedIndex = index;
    if (window.MtkCard) window.MtkCard.show(items[index]);
  }
  function hideMonument() {
    if (window.MtkCard) window.MtkCard.hide();
  }
  document.addEventListener("mtk-card-hidden", () => { selectedIndex = -1; });

  // ---------- Home chip ----------
  const homeChip = document.getElementById("home-chip");
  homeChip.addEventListener("click", (e) => { e.stopPropagation(); goHome(); });
  function updateHomeChip() {
    homeChip.hidden = !(view.zoom > 1.05);
  }

  // ---------- Settings panel wiring ----------
  const settingsToggle = document.getElementById("settings-toggle");
  const settingsPanel = document.getElementById("settings-panel");
  settingsToggle.addEventListener("click", () => {
    settingsPanel.hidden = !settingsPanel.hidden;
  });
  settingsPanel.querySelectorAll("[data-size-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      settings.sizeMode = btn.dataset.sizeMode;
      settingsPanel.querySelectorAll("[data-size-mode]").forEach(b => {
        b.classList.toggle("active", b.dataset.sizeMode === settings.sizeMode);
        b.setAttribute("aria-checked", b.dataset.sizeMode === settings.sizeMode ? "true" : "false");
      });
      saveSettings();
    });
    if (btn.dataset.sizeMode === settings.sizeMode) {
      btn.classList.add("active");
      btn.setAttribute("aria-checked", "true");
    }
  });
  function wireRange(id, key, formatter) {
    const el = document.getElementById(id);
    const label = settingsPanel.querySelector(`[data-value-for="${id}"]`);
    el.value = String(settings[key]);
    if (label) label.textContent = formatter(settings[key]);
    el.addEventListener("input", () => {
      const v = parseFloat(el.value);
      settings[key] = v;
      if (label) label.textContent = formatter(v);
      saveSettings();
    });
  }
  wireRange("thr-decade", "thrDecade", v => v.toFixed(2) + "×");
  wireRange("thr-year", "thrYear", v => v.toFixed(2) + "×");
  wireRange("opt-label-scale", "labelScale", v => v.toFixed(2) + "×");
  function wireCheck(id, key) {
    const el = document.getElementById(id);
    el.checked = !!settings[key];
    el.addEventListener("change", () => {
      settings[key] = !!el.checked;
      saveSettings();
    });
  }
  wireCheck("opt-events", "showEvents");
  wireCheck("opt-crossfade", "crossfade");
  (function () {
    const el = document.getElementById("opt-show3d");
    el.checked = !!settings.show3D;
    if (window.MtkCard && window.MtkCard.setShow3D) window.MtkCard.setShow3D(settings.show3D);
    el.addEventListener("change", () => {
      settings.show3D = !!el.checked;
      saveSettings();
      if (window.MtkCard && window.MtkCard.setShow3D) window.MtkCard.setShow3D(settings.show3D);
    });
  })();
  document.getElementById("opt-reset").addEventListener("click", () => {
    Object.assign(settings, DEFAULT_SETTINGS);
    saveSettings();
    document.getElementById("thr-decade").value = settings.thrDecade;
    document.getElementById("thr-year").value = settings.thrYear;
    document.getElementById("opt-label-scale").value = settings.labelScale;
    document.getElementById("opt-events").checked = settings.showEvents;
    document.getElementById("opt-crossfade").checked = settings.crossfade;
    document.getElementById("opt-show3d").checked = settings.show3D;
    if (window.MtkCard && window.MtkCard.setShow3D) window.MtkCard.setShow3D(settings.show3D);
    settingsPanel.querySelectorAll("[data-size-mode]").forEach(b => {
      b.classList.toggle("active", b.dataset.sizeMode === settings.sizeMode);
    });
    settingsPanel.querySelectorAll("[data-value-for]").forEach(span => {
      const id = span.dataset.valueFor;
      if (id === "thr-decade") span.textContent = settings.thrDecade.toFixed(2) + "×";
      else if (id === "thr-year") span.textContent = settings.thrYear.toFixed(2) + "×";
      else if (id === "opt-label-scale") span.textContent = settings.labelScale.toFixed(2) + "×";
    });
  });

  // ---------- Pointer / wheel ----------
  canvas.addEventListener("pointerdown", event => {
    if (!settingsPanel.hidden) settingsPanel.hidden = true;
    ACTIVE_POINTERS.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (ACTIVE_POINTERS.size === 2) {
      const pts = Array.from(ACTIVE_POINTERS.values());
      pinchInitialDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchInitialZoom = view.zoom;
      return;
    }
    dragging = true;
    didDrag = false;
    pressStartX = event.clientX;
    pressStartY = event.clientY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = performance.now();
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
    }
    anim = null;
  });
  canvas.addEventListener("pointermove", event => {
    if (ACTIVE_POINTERS.has(event.pointerId)) {
      ACTIVE_POINTERS.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (ACTIVE_POINTERS.size === 2) {
      const pts = Array.from(ACTIVE_POINTERS.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (pinchInitialDist > 0) {
        const target = pinchInitialZoom * (dist / pinchInitialDist);
        view.zoom = clampZoom(target);
      }
      didDrag = true;
      return;
    }
    if (!dragging) return;
    const dx = event.clientX - lastPointerX;
    if (!didDrag) {
      const totalDx = event.clientX - pressStartX;
      const totalDy = event.clientY - pressStartY;
      if (Math.hypot(totalDx, totalDy) > TAP_THRESHOLD) didDrag = true;
    }
    if (didDrag) {
      const now = performance.now();
      const dt = Math.max(16, now - lastPointerTime) / 1000;
      // dx (screen-px) → yearShift (years). yearShift = -dx / pxPerYear
      const dyYears = -dx / pxPerYear();
      view.yearCenter += dyYears;
      view.velY = dyYears / dt;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastPointerTime = now;
    }
  }, { passive: true });
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    // Zoom relative to cursor position (year under cursor stays put)
    const yearBefore = screenToYear(event.clientX);
    const factor = Math.exp(-event.deltaY * 0.0015);
    const newZoom = clampZoom(view.zoom * factor);
    if (newZoom === view.zoom) return;
    view.zoom = newZoom;
    // Adjust yearCenter so yearBefore is under cursor still
    const yearAfter = screenToYear(event.clientX);
    view.yearCenter += yearBefore - yearAfter;
    clampCamera();
    anim = null;
  }, { passive: false });
  function endPointer(event) {
    ACTIVE_POINTERS.delete(event.pointerId);
    if (ACTIVE_POINTERS.size < 2) pinchInitialDist = 0;
    if (ACTIVE_POINTERS.size === 1) {
      const remaining = Array.from(ACTIVE_POINTERS.values())[0];
      lastPointerX = remaining.x;
      lastPointerY = remaining.y;
      didDrag = true;
    }
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    if (ACTIVE_POINTERS.size === 0 && dragging && !didDrag) {
      const cl = findClusterAt(event.clientX, event.clientY);
      if (cl && cl.count > 1) drilldownTo(cl);
      else if (cl && cl.count === 1) {
        showMonument(cl.indices[0]);
        view.velY = 0;
      } else {
        if (selectedIndex >= 0) hideMonument();
        else zoomOutOneLevel();
      }
    }
    if (ACTIVE_POINTERS.size === 0) dragging = false;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", event => {
    ACTIVE_POINTERS.delete(event.pointerId);
    if (ACTIVE_POINTERS.size === 0) dragging = false;
  });

  // ---------- Dynamics ----------
  function applyDynamics(dt) {
    if (dragging || anim) { clampCamera(); return; }
    view.yearCenter += view.velY * dt;
    view.velY *= Math.pow(0.88, dt * 60);
    if (Math.abs(view.velY) < 0.01) view.velY = 0;
    clampCamera();
  }

  // ---------- Render loop ----------
  function drawHudHint() {
    ctx.save();
    ctx.font = `400 ${Math.max(11, Math.min(width, height) * 0.011)}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = cssColor(palette.brass, 0.55);
    const level = levelFor(view.zoom);
    ctx.fillText(`${level} · ×${view.zoom.toFixed(2)} · PINCH/WHEEL = ZOOM · DRAG = PAN · TAP = DRILL`,
                 width - 12, height - 10);
    ctx.restore();
  }
  function drawLoading() {
    ctx.save();
    ctx.fillStyle = cssColor(palette.paper, 0.45);
    ctx.font = `400 ${Math.min(width, height) * 0.018}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("загрузка хронологии…", width * 0.5, height * 0.5);
    ctx.restore();
  }
  function render(now) {
    const time = (now - start) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, time - previousTime));
    previousTime = time;
    updateAnim();
    applyDynamics(dt);

    ctx.clearRect(0, 0, width, height);
    if (items.length === 0) { drawLoading(); drawHudHint(); requestAnimationFrame(render); return; }
    drawAxis();
    drawHistoricalEvents();
    drawClustersWithFade();
    drawHudHint();
    updateHomeChip();
    requestAnimationFrame(render);
  }

  // ---------- Resize ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clampCamera();
  }
  window.addEventListener("resize", resize);

  // ---------- Boot ----------
  function loadAll() {
    return fetch("../data/mtk41.json").then(r => r.json()).then(data => {
      items = (data.items || []).filter(it => typeof it.year === "number");
      rebuildAggregates();
    });
  }
  resize();
  loadAll().then(() => {
    requestAnimationFrame(render);
  }).catch(err => {
    console.warn("Load failed:", err);
    requestAnimationFrame(render);
  });
  requestAnimationFrame(render);
})();
