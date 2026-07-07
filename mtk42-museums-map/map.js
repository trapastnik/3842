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
  full:   { lonMin: -10, lonMax: 115, latMin: 10, latMax: 70 },
  core:   { lonMin:   0, lonMax: 110, latMin: 30, latMax: 68 },
  ussr:   { lonMin:  20, lonMax: 110, latMin: 38, latMax: 68 },
  europe: { lonMin:  -5, lonMax:  50, latMin: 40, latMax: 68 },
};

const DEFAULTS = {
  lonMin: VIEW_PRESETS.core.lonMin,
  lonMax: VIEW_PRESETS.core.lonMax,
  latMin: VIEW_PRESETS.core.latMin,
  latMax: VIEW_PRESETS.core.latMax,
  dotRadius: 10,
  borderWidth: 0.8,
  titleSize: 48,
  titleOpacity: 100,
  titleBold: false,
  filterSize: 11,
  filterOpacity: 78,
  filterBold: false,
};
const LS_KEY = "mtk42-museums-map-settings-v1";

const state = {
  data: null,
  countries: null,
  status: "all",
  settings: loadSettings(),
  hoverId: null,
};

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
  setupCanvas();
  render();
  bindUi();
  syncControlsFromState();
  window.addEventListener("resize", () => { setupCanvas(); render(); });
})();

// ─── Projection ─────────────────────────────────────────────
function project(lon, lat, canvasW, canvasH) {
  const s = state.settings;
  const x = ((lon - s.lonMin) / (s.lonMax - s.lonMin)) * canvasW;
  // Note: latitude increases NORTH; canvas y increases DOWN.
  const y = ((s.latMax - lat) / (s.latMax - s.latMin)) * canvasH;
  return [x, y];
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

  // Background gradient tint
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 50, W * 0.5, H * 0.5, Math.max(W, H));
  bg.addColorStop(0, "rgba(67, 80, 89, 0.4)");
  bg.addColorStop(1, "rgba(12, 16, 18, 0.0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawCountries(W, H);
  drawGraticule(W, H);
  drawDots(W, H);
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
          if (lon < state.settings.lonMin - 5 || lon > state.settings.lonMax + 5) continue;
          if (lat < state.settings.latMin - 5 || lat > state.settings.latMax + 5) continue;
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
}

function applyPreset(name) {
  const p = VIEW_PRESETS[name];
  if (!p) return;
  Object.assign(state.settings, p);
  saveSettings();
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
  } else {
    // view bounds, dot radius, border width — need redraw
    render();
  }
}

function bindUi() {
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const it = hitTest(px, py);
    if (it) openDetail(it);
  });

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
    render();
    syncControlsFromState();
  });
  $$('.settings__preset').forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.viewPreset));
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
