// МТК 42 · Институции · Карта
// Equirectangular map focused on Eurasia (Russia + neighbours);
// same interaction pattern as mtk41-map.

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

// Preset views. "core" is the default — Ленинская сеть от Парижа до
// Улан-Батора; Аден выпадает, но получаем плотный кадр по СССР+В.Европе.
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
  projection: "wt", // "wt" (Winkel Tripel, как в МТК 41) | "flat" (equirectangular)
};
const LS_KEY = "mtk42-museums-map-settings-v1";

const state = {
  data: null,
  countries: null,
  status: "all",
  settings: loadSettings(),
  hoverId: null,
  // Live view (mutated by zoom / pan); starts from settings bounds.
  view: null,
};

function resetViewFromSettings() {
  state.view = {
    lonMin: state.settings.lonMin,
    lonMax: state.settings.lonMax,
    latMin: state.settings.latMin,
    latMax: state.settings.latMax,
  };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}
function saveSettings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.settings)); } catch {}
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
  render();
  bindUi();
  syncControlsFromState();
  window.addEventListener("resize", () => { setupCanvas(); render(); });
})();

// ─── Projection ─────────────────────────────────────────────
// Winkel Tripel — та же проекция что в mtk41-map, для единого вида карт.
// Reference: en.wikipedia.org/wiki/Winkel_tripel_projection
const WT_COS_PHI1 = 2 / Math.PI;
const WT_X_HALF   = (2 + Math.PI) / 2;
const WT_Y_HALF   = Math.PI / 2;

function projectWT(lat, lon) {
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  const cosphi = Math.cos(phi);
  const cosLambdaHalf = Math.cos(lambda / 2);
  const alpha = Math.acos(cosphi * cosLambdaHalf);
  const sinc = alpha < 1e-9 ? 1 : Math.sin(alpha) / alpha;
  const wx = 0.5 * (lambda * WT_COS_PHI1 + 2 * cosphi * Math.sin(lambda / 2) / sinc);
  const wy = 0.5 * (phi + Math.sin(phi) / sinc);
  return [wx, wy];
}

// Bounding box of the current state.view rectangle in WT space,
// recomputed on each render (fast, ~80 samples).
let wtBounds = null;
function computeWTBounds() {
  const v = state.view;
  const N = 8;
  let wxMin = +Infinity, wxMax = -Infinity, wyMin = +Infinity, wyMax = -Infinity;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const lat = v.latMin + (v.latMax - v.latMin) * (i / N);
      const lon = v.lonMin + (v.lonMax - v.lonMin) * (j / N);
      const [wx, wy] = projectWT(lat, lon);
      if (wx < wxMin) wxMin = wx; if (wx > wxMax) wxMax = wx;
      if (wy < wyMin) wyMin = wy; if (wy > wyMax) wyMax = wy;
    }
  }
  wtBounds = { wxMin, wxMax, wyMin, wyMax };
}

function project(lon, lat, canvasW, canvasH) {
  const v = state.view;
  if (state.settings.projection === "flat") {
    const x = ((lon - v.lonMin) / (v.lonMax - v.lonMin)) * canvasW;
    const y = ((v.latMax - lat) / (v.latMax - v.latMin)) * canvasH;
    return [x, y];
  }
  const [wx, wy] = projectWT(lat, lon);
  const b = wtBounds;
  const x = (wx - b.wxMin) / (b.wxMax - b.wxMin) * canvasW;
  const y = (b.wyMax - wy) / (b.wyMax - b.wyMin) * canvasH;
  return [x, y];
}

// Inverse projection — used only for pan/zoom pixel→geo delta. Exact inverse
// of WT is iterative; a linear approx via the view rectangle is enough
// for interactive nudges (Newton would be overkill here).
function unproject(px, py, canvasW, canvasH) {
  const v = state.view;
  const lon = v.lonMin + (px / canvasW) * (v.lonMax - v.lonMin);
  const lat = v.latMax - (py / canvasH) * (v.latMax - v.latMin);
  return [lon, lat];
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
}

// ─── Filtered items ─────────────────────────────────────────
function filteredItems() {
  return state.data.items.filter((it) => state.status === "all" || it.status === state.status);
}

// ─── Draw ───────────────────────────────────────────────────
function render() {
  const rect = canvas.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);
  if (state.settings.projection === "wt") computeWTBounds();

  // Background gradient tint
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 50, W * 0.5, H * 0.5, Math.max(W, H));
  bg.addColorStop(0, "rgba(67, 80, 89, 0.4)");
  bg.addColorStop(1, "rgba(12, 16, 18, 0.0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawCountries(W, H);
  drawGraticule(W, H);
  drawDots(W, H);
  if (state.settings.showCities) drawCityLabels(W, H);
}

function drawCityLabels(W, H) {
  const items = filteredItems();
  const seen = new Set();
  const R = state.settings.dotRadius;
  const size = state.settings.citySize;
  const alpha = state.settings.cityOpacity / 100;
  ctx.save();
  ctx.font = `600 ${size}px "20 Kopeek", "Courier New", monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const it of items) {
    if (typeof it.lat !== "number" || typeof it.lng !== "number") continue;
    if (seen.has(it.city)) continue;
    seen.add(it.city);
    const [x, y] = project(it.lng, it.lat, W, H);
    if (x < -80 || x > W + 40 || y < -20 || y > H + 20) continue;
    const label = it.city;
    const tx = x + R + 6;
    const ty = y;
    // Soft dark backdrop for readability
    ctx.fillStyle = `rgba(0, 0, 0, ${(alpha * 0.65).toFixed(2)})`;
    ctx.fillText(label, tx + 1, ty + 1);
    ctx.fillStyle = `rgba(247, 249, 239, ${alpha.toFixed(2)})`;
    ctx.fillText(label, tx, ty);
  }
  ctx.restore();
}

function drawCountries(W, H) {
  const bw = state.settings.borderWidth;
  ctx.save();
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
          if (lon < state.view.lonMin - 10 || lon > state.view.lonMax + 10) continue;
          if (lat < state.view.latMin - 10 || lat > state.view.latMax + 10) continue;
          const [px, py] = project(lon, lat, W, H);
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
      ctx.fill();
      if (bw > 0) ctx.stroke();
    }
  }
  ctx.restore();
}

function drawGraticule(W, H) {
  ctx.save();
  ctx.strokeStyle = "rgba(210, 183, 115, 0.06)";
  ctx.lineWidth = 0.5;
  for (let lat = -80; lat <= 80; lat += 10) {
    const [_, y] = project(0, lat, W, H);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let lon = -180; lon <= 180; lon += 15) {
    const [x, _] = project(lon, 0, W, H);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDots(W, H) {
  const items = filteredItems();
  ctx.save();
  const R = state.settings.dotRadius;
  for (const it of items) {
    if (typeof it.lat !== "number" || typeof it.lng !== "number") continue;
    const [x, y] = project(it.lng, it.lat, W, H);
    if (x < -R - 4 || x > W + R + 4 || y < -R - 4 || y > H + R + 4) continue;

    ctx.beginPath();
    ctx.arc(x, y, R + 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(12, 16, 18, 0.9)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = STATUS_COLOR[it.status] || STATUS_COLOR.active;
    ctx.fill();

    if (it.notable) {
      ctx.beginPath();
      ctx.arc(x, y, R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(210, 183, 115, 0.55)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ─── Interaction ────────────────────────────────────────────
function hitTest(px, py) {
  const rect = canvas.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  const items = filteredItems();
  const HIT_R = Math.max(22, state.settings.dotRadius + 10);
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (typeof it.lat !== "number") continue;
    const [x, y] = project(it.lng, it.lat, W, H);
    const dx = x - px, dy = y - py;
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
    render();
  } else {
    render();
  }
}

// ─── Zoom / pan ─────────────────────────────────────────────
function zoomAt(px, py, factor) {
  const rect = canvas.getBoundingClientRect();
  const [lonBefore, latBefore] = unproject(px, py, rect.width, rect.height);
  const v = state.view;
  const cx = (v.lonMin + v.lonMax) / 2;
  const cy = (v.latMin + v.latMax) / 2;
  let halfLon = (v.lonMax - v.lonMin) / 2 / factor;
  let halfLat = (v.latMax - v.latMin) / 2 / factor;
  // clamp span
  halfLon = Math.max(0.5, Math.min(180, halfLon));
  halfLat = Math.max(0.3, Math.min(60, halfLat));
  v.lonMin = cx - halfLon; v.lonMax = cx + halfLon;
  v.latMin = cy - halfLat; v.latMax = cy + halfLat;
  const [lonAfter, latAfter] = unproject(px, py, rect.width, rect.height);
  v.lonMin += lonBefore - lonAfter; v.lonMax += lonBefore - lonAfter;
  v.latMin += latBefore - latAfter; v.latMax += latBefore - latAfter;
  render();
}

function bindZoomAndPan() {
  let dragging = false;
  let start = null;
  let moved = 0;

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 1 / 1.18 : 1.18;
    zoomAt(px, py, factor);
  }, { passive: false });

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; moved = 0;
    start = {
      x: e.clientX, y: e.clientY,
      view: { ...state.view },
    };
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    moved = Math.max(moved, Math.hypot(dx, dy));
    const lonSpan = start.view.lonMax - start.view.lonMin;
    const latSpan = start.view.latMax - start.view.latMin;
    const dlon = -dx / rect.width * lonSpan;
    const dlat = dy / rect.height * latSpan; // y-down → lat-down
    state.view.lonMin = start.view.lonMin + dlon;
    state.view.lonMax = start.view.lonMax + dlon;
    state.view.latMin = start.view.latMin + dlat;
    state.view.latMax = start.view.latMax + dlat;
    render();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    if (moved < 4) {
      const rect = canvas.getBoundingClientRect();
      const it = hitTest(e.clientX - rect.left, e.clientY - rect.top);
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

  // Settings panel
  const settings = $("#settings");
  $("#settings-toggle").addEventListener("click", () => settings.classList.toggle("is-open"));
  $(".settings__close").addEventListener("click", () => settings.classList.remove("is-open"));
  $(".settings__reset").addEventListener("click", () => {
    state.settings = { ...DEFAULTS };
    saveSettings();
    applyVisualSettings();
    resetViewFromSettings();
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
      syncControlsFromState();
      render();
    });
  });
  const resetBtn = $("#reset-view");
  if (resetBtn) resetBtn.addEventListener("click", () => { resetViewFromSettings(); render(); });
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
