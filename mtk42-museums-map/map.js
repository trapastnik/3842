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

// Focus window: Russia + Europe + Central Asia + Middle East + Mongolia.
// Extended east to cover Ulaanbaatar / Aden; a bit of Atlantic on the west.
const VIEW = {
  lonMin: -15, lonMax: 145,
  latMin: 5,   latMax: 72,
};

const state = {
  data: null,
  countries: null,
  status: "all",
  view: { ...VIEW },
  hoverId: null,
};

(async function init() {
  const [museums, geo] = await Promise.all([
    fetch("../data/mtk42-museums.json").then((r) => r.json()),
    fetch("../data/ne_110m_countries.geojson").then((r) => r.json()),
  ]);
  state.data = museums;
  state.countries = geo;
  setupCanvas();
  render();
  bindUi();
  window.addEventListener("resize", () => { setupCanvas(); render(); });
})();

// ─── Projection ─────────────────────────────────────────────
function project(lon, lat, canvasW, canvasH) {
  const v = state.view;
  const x = ((lon - v.lonMin) / (v.lonMax - v.lonMin)) * canvasW;
  // Note: latitude increases NORTH; canvas y increases DOWN.
  const y = ((v.latMax - lat) / (v.latMax - v.latMin)) * canvasH;
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
  ctx.save();
  ctx.strokeStyle = "rgba(210, 183, 115, 0.28)";
  ctx.lineWidth = 0.8;
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
          if (lon < state.view.lonMin - 5 || lon > state.view.lonMax + 5) continue;
          if (lat < state.view.latMin - 5 || lat > state.view.latMax + 5) continue;
          const [px, py] = project(lon, lat, W, H);
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
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
  const R = 8;
  for (const it of items) {
    if (typeof it.lat !== "number" || typeof it.lng !== "number") continue;
    const [x, y] = project(it.lng, it.lat, W, H);
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;

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
  // Reverse iterate so top-most (later) dots win.
  const HIT_R = 22;
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

  const legend = $("#legend");
  $("#legend-toggle").addEventListener("click", () => (legend.hidden = !legend.hidden));
  $(".legend__close").addEventListener("click", () => (legend.hidden = true));
}
