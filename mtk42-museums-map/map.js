// МТК 42 · Институции · Карта
// Winkel Tripel projection (из shared модуля) + world-pixel viewport в стиле
// mtk41-map-hier: worldW/worldH — константы (пересчитываются только на resize
// и при смене проекции); zoom/pan работают через scale+cam в pixel-space.
// Это убирает «глобусный» эффект при зуме, который был в старом lat/lon-view
// подходе с пересчётом WT bounding box на каждом render.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const STATUS_LABEL = {
  active: "Работает",
  transformed: "Трансформирован",
  private: "Частный / восстановленный",
  closed: "Ликвидирован",
};
const STATUS_COLOR = {
  active: "#d2b773",
  transformed: "#9DA3A6",
  private: "rgba(210,183,115,0.55)",
  closed: "#a02128",
};

const VIEW_PRESETS = {
  full:   { lonMin: -12, lonMax: 120, latMin:  8, latMax: 72 },
  core:   { lonMin:  -8, lonMax: 118, latMin: 22, latMax: 72 },
  ussr:   { lonMin:  20, lonMax: 115, latMin: 36, latMax: 70 },
  europe: { lonMin:  -6, lonMax:  56, latMin: 38, latMax: 70 },
};

const DEFAULTS = {
  lonMin: VIEW_PRESETS.core.lonMin,
  lonMax: VIEW_PRESETS.core.lonMax,
  latMin: VIEW_PRESETS.core.latMin,
  latMax: VIEW_PRESETS.core.latMax,
  dotRadius: 10,
  borderWidth: 0.8,
  showCities: true,
  citySize: 11,
  cityOpacity: 70,
  titleSize: 48,
  titleOpacity: 100,
  titleBold: false,
  filterSize: 11,
  filterOpacity: 78,
  filterBold: false,
  projection: "wt",         // "wt" | "flat"
  zoomSensitivity: 1.5,     // wheel factor = exp(-deltaY * zoomSensitivity/1000)
};
const LS_KEY = "mtk42-museums-map-settings-v1";

const state = {
  data: null,
  countries: null,
  status: "all",
  settings: loadSettings(),
  hoverId: null,
  view: null,   // desired lat/lon rect; applyView() → map.zoom/camX/camY
};

// World-pixel viewport (mtk41-hier style).
const map = {
  worldW: 0, worldH: 0,
  camX: 0, camY: 0,
  zoom: 1,
};
const MIN_ZOOM_FLOOR = 0.05;
const MAX_ZOOM = 40;

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}
function saveSettings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.settings)); } catch {}
}

function resetViewFromSettings() {
  state.view = {
    lonMin: state.settings.lonMin,
    lonMax: state.settings.lonMax,
    latMin: state.settings.latMin,
    latMax: state.settings.latMax,
  };
}

(async function init() {
  const [museums, geo] = await Promise.all([
    fetch("../data/mtk42-museums.json").then((r) => r.json()),
    fetch("../data/ne_110m_countries.geojson").then((r) => r.json()),
  ]);
  state.data = museums;
  state.countries = geo;
  applyVisualSettings();
  resetViewFromSettings();
  setupCanvas();
  applyView(state.view);
  render();
  bindUi();
  syncControlsFromState();
  window.addEventListener("resize", () => { setupCanvas(); applyView(state.view); render(); });
})();

// ─── Projection ─────────────────────────────────────────────
// Единый WT / Equirectangular через shared модуль. map.worldW/worldH —
// pixel-размер целого «мира» при zoom=1; ставится в setupCanvas().
function currentProjection() {
  return state.settings.projection === "flat"
    ? MtkProjection.Equirectangular
    : MtkProjection.WinkelTripel;
}
function currentAspect() { return currentProjection().ASPECT; }
function project(lon, lat) {
  return currentProjection().project(lat, lon, map.worldW, map.worldH);
}

// Fit desired lat/lon rect into current canvas viewport at zoom=1 baseline.
// Для WT грани rect'а искривлены — сэмплируем сетку 9×9, берём bounding box
// в world-px, из него считаем zoom + cam.
function applyView(view) {
  if (!canvas || !map.worldW) return;
  const rect = canvas.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  const N = 8;
  let xMin=+Infinity, xMax=-Infinity, yMin=+Infinity, yMax=-Infinity;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const lat = view.latMin + (view.latMax - view.latMin) * (i / N);
      const lon = view.lonMin + (view.lonMax - view.lonMin) * (j / N);
      const p = project(lon, lat);
      if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
    }
  }
  const rectW = Math.max(1, xMax - xMin);
  const rectH = Math.max(1, yMax - yMin);
  map.zoom = clampZoom(Math.min(W / rectW, H / rectH));
  map.camX = (xMin + xMax) / 2 - W / 2;
  map.camY = (yMin + yMax) / 2 - H / 2;
}

function clampZoom(z) {
  return Math.max(MIN_ZOOM_FLOOR, Math.min(MAX_ZOOM, z));
}

// ─── Camera / screen transforms ─────────────────────────────
function pointToScreen(wx, wy) {
  const rect = canvas.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  return {
    x: W / 2 + (wx - map.camX - W / 2) * map.zoom,
    y: H / 2 + (wy - map.camY - H / 2) * map.zoom,
  };
}
function clientToWorld(cx, cy) {
  const rect = canvas.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  return {
    x: (cx - W / 2) / map.zoom + W / 2 + map.camX,
    y: (cy - H / 2) / map.zoom + H / 2 + map.camY,
  };
}

// ─── Canvas ─────────────────────────────────────────────────
let canvas, ctx, dpr;
function setupCanvas() {
  canvas = $("#map");
  ctx = canvas.getContext("2d");
  dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Пересчёт worldW/worldH. targetLngSpan = сколько градусов долготы влезает
  // в ширину canvas'а при zoom=1. 180° — стандарт mtk41-hier (landscape).
  const targetLngSpan = rect.height > rect.width ? 130 : 180;
  map.worldW = (rect.width / targetLngSpan) * 360;
  map.worldH = map.worldW / currentAspect();
}

// ─── Filtered items ─────────────────────────────────────────
function filteredItems() {
  return state.data.items.filter((it) => state.status === "all" || it.status === state.status);
}

// ─── Draw ───────────────────────────────────────────────────
function render() {
  const rect = canvas.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Background gradient tint — screen-space, без transform
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 50, W * 0.5, H * 0.5, Math.max(W, H));
  bg.addColorStop(0, "rgba(67, 80, 89, 0.4)");
  bg.addColorStop(1, "rgba(12, 16, 18, 0.0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Apply camera + zoom, рисуем в world-coord
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(map.zoom, map.zoom);
  ctx.translate(-W / 2, -H / 2);
  ctx.translate(-map.camX, -map.camY);

  drawCountries();
  drawGraticule();
  drawDots();

  ctx.restore();

  // Labels рисуются в screen-space (позиции = pointToScreen(world)) —
  // так шрифты чёткие и не масштабируются с zoom.
  if (state.settings.showCities) drawCityLabels(W, H);
}

function drawCountries() {
  const bw = state.settings.borderWidth / map.zoom;
  ctx.strokeStyle = "rgba(210, 183, 115, 0.28)";
  ctx.lineWidth = bw;
  ctx.fillStyle = "rgba(67, 80, 89, 0.35)";
  for (const feat of state.countries.features) {
    const g = feat.geometry;
    if (!g) continue;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const poly of polys) {
      ctx.beginPath();
      for (const ring of poly) {
        if (!ring || ring.length === 0) continue;
        let started = false;
        for (const [lon, lat] of ring) {
          const p = project(lon, lat);
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      }
      ctx.fill();
      if (bw > 0) ctx.stroke();
    }
  }
}

function drawGraticule() {
  ctx.strokeStyle = "rgba(210, 183, 115, 0.06)";
  ctx.lineWidth = 0.5 / map.zoom;
  // Параллели — для WT кривые, рисуем ломаной по семплам
  for (let lat = -80; lat <= 80; lat += 10) {
    ctx.beginPath();
    let started = false;
    for (let lon = -180; lon <= 180; lon += 5) {
      const p = project(lon, lat);
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  // Меридианы — тоже кривые для WT
  for (let lon = -180; lon <= 180; lon += 15) {
    ctx.beginPath();
    let started = false;
    for (let lat = -85; lat <= 85; lat += 5) {
      const p = project(lon, lat);
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

function drawDots() {
  const items = filteredItems();
  const R = state.settings.dotRadius / map.zoom;
  const halo = 2 / map.zoom;
  const outline = 5 / map.zoom;
  const lw = 1 / map.zoom;
  for (const it of items) {
    if (typeof it.lat !== "number" || typeof it.lng !== "number") continue;
    const p = project(it.lng, it.lat);

    ctx.beginPath();
    ctx.arc(p.x, p.y, R + halo, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(12, 16, 18, 0.9)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    ctx.fillStyle = STATUS_COLOR[it.status] || STATUS_COLOR.active;
    ctx.fill();

    if (it.notable) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, R + outline, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(210, 183, 115, 0.55)";
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }
}

function drawCityLabels(W, H) {
  const items = filteredItems();
  const seen = new Set();
  const R = state.settings.dotRadius; // screen-px (labels — screen-space)
  const size = state.settings.citySize;
  const alpha = state.settings.cityOpacity / 100;
  ctx.save();
  ctx.font = `500 ${size}px "20 Kopeek", "Courier New", monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const it of items) {
    if (typeof it.lat !== "number") continue;
    if (seen.has(it.city)) continue;
    seen.add(it.city);
    const wp = project(it.lng, it.lat);
    const sp = pointToScreen(wp.x, wp.y);
    if (sp.x < -80 || sp.x > W + 40 || sp.y < -20 || sp.y > H + 20) continue;
    const label = it.city;
    const tx = sp.x + R + 6;
    const ty = sp.y;
    ctx.fillStyle = `rgba(0, 0, 0, ${(alpha * 0.65).toFixed(2)})`;
    ctx.fillText(label, tx + 1, ty + 1);
    ctx.fillStyle = `rgba(247, 249, 239, ${alpha.toFixed(2)})`;
    ctx.fillText(label, tx, ty);
  }
  ctx.restore();
}

// ─── Interaction ────────────────────────────────────────────
function hitTest(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left, py = clientY - rect.top;
  const items = filteredItems();
  const HIT_R = Math.max(22, state.settings.dotRadius + 10);
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (typeof it.lat !== "number") continue;
    const wp = project(it.lng, it.lat);
    const sp = pointToScreen(wp.x, wp.y);
    const dx = sp.x - px, dy = sp.y - py;
    if (dx * dx + dy * dy <= HIT_R * HIT_R) return it;
  }
  return null;
}

function regionLabel(id) {
  const r = state.data.regions.find((rr) => rr.id === id);
  return r ? r.label : id;
}

function openDetail(item) {
  const d = $("#detail");
  d.hidden = false;
  $('[data-bind="region"]', d).textContent = regionLabel(item.region);
  $('[data-bind="name"]', d).textContent = item.full_name || item.short;
  $('[data-bind="place"]', d).textContent = `${item.city}${item.country ? " · " + item.country : ""}`;
  $('[data-bind="status"]', d).textContent = STATUS_LABEL[item.status] || item.status;
  const period = item.closed === null || item.closed === undefined
    ? `${item.opened} — сегодня`
    : `${item.opened} — ${item.closed}`;
  $('[data-bind="period"]', d).textContent = period;
  $('[data-bind="description"]', d).textContent = item.description || "";
  const aftermath = $('[data-bind="aftermath-section"]', d);
  if (item.aftermath) {
    aftermath.hidden = false;
    $('[data-bind="aftermath"]', d).textContent = item.aftermath;
  } else {
    aftermath.hidden = true;
  }
}
function closeDetail() { $("#detail").hidden = true; }

// ─── Visual settings (CSS variables) ────────────────────────
function applyVisualSettings() {
  const root = document.documentElement;
  const s = state.settings;
  root.style.setProperty("--title-size", s.titleSize + "px");
  root.style.setProperty("--title-opacity", (s.titleOpacity / 100).toFixed(2));
  root.style.setProperty("--title-weight", s.titleBold ? 700 : 400);
  root.style.setProperty("--filter-size", s.filterSize + "px");
  root.style.setProperty("--filter-opacity", (s.filterOpacity / 100).toFixed(2));
  root.style.setProperty("--filter-weight", s.filterBold ? 700 : 400);
}

function syncControlsFromState() {
  $$('input[type="checkbox"][data-setting]').forEach((el) => {
    el.checked = !!state.settings[el.dataset.setting];
  });
  $$('input[type="range"][data-setting-num]').forEach((el) => {
    el.value = state.settings[el.dataset.settingNum];
    const num = $(`[data-bind-num="${el.dataset.settingNum}"]`);
    if (num) num.textContent = el.value;
  });
  $$('[data-projection]').forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.projection === state.settings.projection);
  });
}

function applyPreset(name) {
  const p = VIEW_PRESETS[name];
  if (!p) return;
  Object.assign(state.settings, p);
  saveSettings();
  resetViewFromSettings();
  applyView(state.view);
  syncControlsFromState();
  render();
}

function onCheckboxChange(el) {
  const key = el.dataset.setting;
  state.settings[key] = !!el.checked;
  saveSettings();
  applyVisualSettings();
}

function onSliderChange(el) {
  const key = el.dataset.settingNum;
  const v = Number(el.value);
  state.settings[key] = v;
  const num = $(`[data-bind-num="${key}"]`);
  if (num) num.textContent = v;
  saveSettings();
  if (key === "titleSize" || key === "titleOpacity" || key === "filterSize" || key === "filterOpacity") {
    applyVisualSettings();
  } else if (key === "lonMin" || key === "lonMax" || key === "latMin" || key === "latMax") {
    resetViewFromSettings();
    applyView(state.view);
    render();
  } else {
    render();
  }
}

// ─── Zoom / pan ─────────────────────────────────────────────
function bindZoomAndPan() {
  let dragging = false;
  let last = null;
  let moved = 0;
  let downClient = null;

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const wBefore = clientToWorld(cx, cy);
    const sens = state.settings.zoomSensitivity / 1000; // slider 0.5..3.0 → 0.0005..0.003
    const factor = Math.exp(-e.deltaY * sens);
    const newZoom = clampZoom(map.zoom * factor);
    if (newZoom === map.zoom) return;
    map.zoom = newZoom;
    // Точка под курсором остаётся под курсором
    const W = rect.width, H = rect.height;
    map.camX = wBefore.x - W / 2 - (cx - W / 2) / map.zoom;
    map.camY = wBefore.y - H / 2 - (cy - H / 2) / map.zoom;
    render();
  }, { passive: false });

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; moved = 0;
    last = { x: e.clientX, y: e.clientY };
    downClient = { x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    moved = Math.max(moved, Math.hypot(e.clientX - downClient.x, e.clientY - downClient.y));
    map.camX -= dx / map.zoom;
    map.camY -= dy / map.zoom;
    last.x = e.clientX; last.y = e.clientY;
    render();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    if (moved < 4) {
      const it = hitTest(e.clientX, e.clientY);
      if (it) openDetail(it);
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
}

function bindUi() {
  bindZoomAndPan();

  $$('.filter[data-status]').forEach((btn) => {
    btn.addEventListener("click", () => {
      $$('.filter[data-status]').forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.status = btn.dataset.status;
      render();
    });
  });

  const detail = $("#detail");
  $(".detail__close").addEventListener("click", closeDetail);
  detail.addEventListener("click", (e) => { if (e.target === detail) closeDetail(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !detail.hidden) closeDetail();
  });

  const settings = $("#settings");
  $("#settings-toggle").addEventListener("click", () => settings.classList.toggle("is-open"));
  $(".settings__close").addEventListener("click", () => settings.classList.remove("is-open"));
  $(".settings__reset").addEventListener("click", () => {
    state.settings = { ...DEFAULTS };
    saveSettings();
    applyVisualSettings();
    resetViewFromSettings();
    setupCanvas();
    applyView(state.view);
    render();
    syncControlsFromState();
  });
  $$('.settings__preset[data-view-preset]').forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.viewPreset));
  });
  $$('.settings__preset[data-projection]').forEach((btn) => {
    btn.addEventListener("click", () => {
      state.settings.projection = btn.dataset.projection;
      saveSettings();
      // worldH зависит от aspect'а проекции — пересобираем canvas
      setupCanvas();
      applyView(state.view);
      syncControlsFromState();
      render();
    });
  });
  const resetBtn = $("#reset-view");
  if (resetBtn) resetBtn.addEventListener("click", () => {
    resetViewFromSettings();
    applyView(state.view);
    render();
  });
  $$('input[type="checkbox"][data-setting]').forEach((el) => {
    el.addEventListener("change", () => onCheckboxChange(el));
  });
  $$('input[type="range"][data-setting-num]').forEach((el) => {
    el.addEventListener("input", () => onSliderChange(el));
  });

  const legend = $("#legend");
  $("#legend-toggle").addEventListener("click", () => (legend.hidden = !legend.hidden));
  $(".legend__close").addEventListener("click", () => (legend.hidden = true));
}
