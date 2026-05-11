import {
  geoOrthographic,
  geoPath,
  geoGraticule10,
  geoDistance,
  geoInterpolate,
} from "https://esm.sh/d3-geo@3";
import { drag } from "https://esm.sh/d3-drag@3";
import { select } from "https://esm.sh/d3-selection@3";

const USSR_ISO = new Set([
  "RUS", "UKR", "BLR", "MDA", "LVA", "LTU", "EST",
  "GEO", "ARM", "AZE", "KAZ", "UZB", "TKM", "TJK", "KGZ",
]);

const MODES = {
  world: { rotate: [-50, -38, 0], scale: 0.62 },
  ussr:  { rotate: [-55, -50, 0], scale: 1.18 },
};

const MIN_SCALE = 0.28;
const MAX_SCALE = 2.8;

const CATEGORY_LABELS = {
  university: "Университеты",
  military_academy: "Военные училища",
  library: "Библиотеки",
  factory: "Заводы",
  metallurgy: "Металлургия",
  power_plant: "Электростанции",
  nuclear: "АЭС",
  waterway: "Каналы и водные пути",
  railway: "Железная дорога",
  mine: "Шахты",
  stadium: "Стадионы",
  printing: "Типографии",
  foundation: "Фонды",
  research_lab: "Лаборатории",
  museum: "Музеи",
  nature_reserve: "Заповедники",
  mountain: "Горы",
  asteroid: "Астероиды",
  paleontology: "Палеонтология",
  agriculture: "Сельское хозяйство",
};

// Birthplace of Lenin — Ульяновск (Симбирск). Origin point for arcs.
const ORIGIN = [48.4031, 54.3142];

// Priority-ordered key labels (lower index — higher priority when crowded).
const KEY_LABEL_ORDER = [
  "rgb-lenina",
  "leti",
  "lenin-peak",
  "ulyanovsk-tank",
  "dneproges",
  "chaes",
  "mmk",
  "krasmash",
  "bsu",
  "kazakh-polytechnic",
];
const KEY_LABEL_RANK = new Map(KEY_LABEL_ORDER.map((id, i) => [id, i]));

const SETTINGS_KEY = "mtk39:settings:v1";
const DEFAULTS = {
  autoRotate: true,
  autoRotateSpeed: 4,
  atmosphere: true,
  lighting: true,
  stars: true,
  pulsation: true,
  flyIn: true,
  labels: true,
  arcs: true,
  filter: "all",
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

const settings = loadSettings();

const canvas = document.getElementById("globe");
const ctx = canvas.getContext("2d");
const dpr = Math.min(window.devicePixelRatio || 1, 2);

const projection = geoOrthographic().precision(0.3);
const path = geoPath(projection, ctx);

let width = 0;
let height = 0;
let countries = null;
let items = [];
let selected = null;
let mode = "world";
let rotation = MODES.world.rotate.slice();
let scaleFactor = MODES.world.scale;
let stars = [];
let lastFrame = 0;
let lastInteraction = performance.now();
let modeTween = null;
let introT0 = 0;
const pointDelays = new Map();

function generateStars() {
  const count = Math.round(Math.sqrt(width * height) / 6);
  stars = new Array(count).fill(0).map(() => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 1.2 + 0.2,
    a: Math.random() * 0.55 + 0.15,
    phase: Math.random() * Math.PI * 2,
    twinkle: Math.random() * 0.5 + 0.2,
  }));
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  generateStars();
  applyProjection();
}

function applyProjection() {
  const r = (Math.min(width, height) * scaleFactor) / 2;
  projection
    .scale(r)
    .translate([width / 2, height / 2])
    .rotate(rotation);
}

function isVisible(lon, lat) {
  const [rl, rp] = projection.rotate();
  return geoDistance([lon, lat], [-rl, -rp]) < Math.PI / 2;
}

function fillColorFor(feature) {
  const iso = feature.properties.ISO_A3 || feature.properties.ADM0_A3;
  const isSov = USSR_ISO.has(iso);
  if (mode === "ussr") {
    return isSov ? "rgba(210, 183, 115, 0.32)" : "rgba(67, 80, 89, 0.45)";
  }
  return isSov ? "rgba(160, 33, 40, 0.20)" : "rgba(67, 80, 89, 0.55)";
}

function renderStars(now) {
  if (!settings.stars) return;
  for (const s of stars) {
    const tw = 0.5 + 0.5 * Math.sin(now / 800 + s.phase) * s.twinkle;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(247, 249, 239, ${s.a * tw})`;
    ctx.fill();
  }
}

function renderAtmosphere() {
  if (!settings.atmosphere) return;
  const r = projection.scale();
  const [cx, cy] = projection.translate();
  const inner = r * 0.92;
  const outer = r * 1.22;
  const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0, "rgba(146, 174, 196, 0.0)");
  grad.addColorStop(0.35, "rgba(146, 174, 196, 0.22)");
  grad.addColorStop(0.7, "rgba(210, 183, 115, 0.08)");
  grad.addColorStop(1, "rgba(146, 174, 196, 0.0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.fill();
}

function renderLighting() {
  if (!settings.lighting) return;
  const r = projection.scale();
  const [cx, cy] = projection.translate();
  const sx = cx - r * 0.55;
  const sy = cy - r * 0.45;
  const grad = ctx.createRadialGradient(sx, sy, r * 0.05, sx, sy, r * 2.0);
  grad.addColorStop(0, "rgba(255, 244, 220, 0.10)");
  grad.addColorStop(0.35, "rgba(0, 0, 0, 0.0)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.62)");

  ctx.save();
  ctx.beginPath();
  path({ type: "Sphere" });
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function renderArc() {
  if (!settings.arcs || !selected) return;
  if (selected.lat == null || selected.lng == null) return;
  if (selected.id === "ulyanovsk-tank") return; // origin == target, skip

  const interp = geoInterpolate(ORIGIN, [selected.lng, selected.lat]);
  const coords = [];
  for (let i = 0; i <= 64; i++) coords.push(interp(i / 64));
  const line = { type: "LineString", coordinates: coords };

  ctx.save();
  ctx.beginPath();
  path({ type: "Sphere" });
  ctx.clip();

  ctx.beginPath();
  path(line);
  ctx.strokeStyle = "rgba(160, 33, 40, 0.78)";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();

  // origin marker
  if (isVisible(ORIGIN[0], ORIGIN[1])) {
    const op = projection(ORIGIN);
    if (op) {
      ctx.beginPath();
      ctx.arc(op[0], op[1], 6, 0, Math.PI * 2);
      ctx.fillStyle = "#a02128";
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "rgba(247, 249, 239, 0.85)";
      ctx.font = '600 11px "20 Kopeek", monospace';
      ctx.fillText("УЛЬЯНОВСК · 1870", op[0] + 10, op[1] - 8);
    }
  }
}

function pointFlyInScale(itemId, now) {
  if (!settings.flyIn) return 1;
  const delay = pointDelays.get(itemId) ?? 0;
  const t0 = introT0 + delay;
  if (now < t0) return 0;
  const t = Math.min(1, (now - t0) / 700);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function pulsate(now) {
  if (!settings.pulsation) return 1;
  return 1 + Math.sin((now / 1300) * Math.PI * 2) * 0.14;
}

function filterPasses(item) {
  return settings.filter === "all" || item.category === settings.filter;
}

function render(now) {
  if (!countries) return;
  ctx.clearRect(0, 0, width, height);

  renderStars(now);
  renderAtmosphere();

  // sphere fill
  ctx.beginPath();
  path({ type: "Sphere" });
  const grad = ctx.createRadialGradient(
    width / 2, height * 0.42, 10,
    width / 2, height * 0.42, Math.min(width, height) * 0.6,
  );
  grad.addColorStop(0, "rgba(58, 70, 78, 0.95)");
  grad.addColorStop(1, "rgba(18, 24, 28, 1)");
  ctx.fillStyle = grad;
  ctx.fill();

  // graticule
  ctx.beginPath();
  path(geoGraticule10());
  ctx.strokeStyle = "rgba(247, 249, 239, 0.06)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // countries
  for (const f of countries.features) {
    ctx.beginPath();
    path(f);
    ctx.fillStyle = fillColorFor(f);
    ctx.fill();
    ctx.strokeStyle = "rgba(247, 249, 239, 0.16)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // pseudo-3D lighting overlay (inside sphere only)
  renderLighting();

  // sphere outline
  ctx.beginPath();
  path({ type: "Sphere" });
  ctx.strokeStyle = "rgba(210, 183, 115, 0.45)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // arc (origin -> selected)
  renderArc();

  // points (no inline labels — labels handled in a second pass below)
  const labelCandidates = [];
  for (const item of items) {
    if (item.lat == null || item.lng == null) continue;
    if (!isVisible(item.lng, item.lat)) continue;
    const pt = projection([item.lng, item.lat]);
    if (!pt) continue;

    const passes = filterPasses(item);
    const isSel = selected && selected.id === item.id;
    const flyIn = pointFlyInScale(item.id, now);
    const pulse = passes ? pulsate(now) : 1;
    const baseR = mode === "ussr" ? 6 : 5;
    const r = (isSel ? baseR + 3 : baseR) * flyIn * pulse;
    if (r <= 0.3) continue;

    // outer glow on selected
    if (isSel) {
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], r + 8, 0, Math.PI * 2);
      const glow = ctx.createRadialGradient(pt[0], pt[1], r, pt[0], pt[1], r + 12);
      glow.addColorStop(0, "rgba(160, 33, 40, 0.7)");
      glow.addColorStop(1, "rgba(160, 33, 40, 0)");
      ctx.fillStyle = glow;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
    ctx.fillStyle = passes
      ? (isSel ? "#a02128" : "#d2b773")
      : "rgba(210, 183, 115, 0.22)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();

    if (passes && flyIn > 0.6) {
      const inKey = KEY_LABEL_RANK.has(item.id);
      const tier = isSel ? -1 : (inKey ? 0 : 1);
      const sub = isSel
        ? 0
        : inKey
          ? KEY_LABEL_RANK.get(item.id) / 100
          : (pointDelays.get(item.id) ?? 0) / 1e6;
      labelCandidates.push({ item, pt, r, isSel, tier, sub });
    }
  }

  drawLabels(labelCandidates);
}

function rectsOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function drawLabels(candidates) {
  if (candidates.length === 0) return;
  candidates.sort((a, b) => (a.tier - b.tier) || (a.sub - b.sub));
  const drawn = [];
  ctx.font = '600 11px "20 Kopeek", "Courier New", monospace';

  for (const c of candidates) {
    if (!settings.labels && c.tier !== -1) continue;

    const text = c.item.name_short || c.item.title || "";
    const tw = ctx.measureText(text).width;
    const r = c.r;
    const px = c.pt[0];
    const py = c.pt[1];

    // try four anchors: right → left → above → below
    const anchors = [
      { lx: px + r + 8, ly: py + 4 },
      { lx: px - r - 8 - tw, ly: py + 4 },
      { lx: px - tw / 2, ly: py - r - 8 },
      { lx: px - tw / 2, ly: py + r + 16 },
    ];

    let chosen = null;
    for (const a of anchors) {
      const rect = { x: a.lx - 3, y: a.ly - 11, w: tw + 6, h: 14 };
      // viewport clip
      if (rect.x < 4 || rect.x + rect.w > width - 4) continue;
      if (rect.y < 4 || rect.y + rect.h > height - 4) continue;
      if (drawn.some((d) => rectsOverlap(rect, d))) continue;
      chosen = { ...a, rect };
      break;
    }

    // selected always wins — force right anchor regardless of overlap
    if (!chosen && c.tier === -1) {
      const a = anchors[0];
      chosen = { ...a, rect: { x: a.lx - 3, y: a.ly - 11, w: tw + 6, h: 14 } };
    }

    if (!chosen) continue;

    ctx.fillStyle = c.isSel ? "rgba(160, 33, 40, 0.78)" : "rgba(12, 16, 18, 0.72)";
    ctx.fillRect(chosen.rect.x, chosen.rect.y, chosen.rect.w, chosen.rect.h);
    ctx.fillStyle = c.isSel
      ? "#fff"
      : (c.tier === 0 ? "rgba(247, 249, 239, 0.92)" : "rgba(247, 249, 239, 0.78)");
    ctx.fillText(text, chosen.lx, chosen.ly);
    drawn.push(chosen.rect);
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function shortestLonDelta(a, b) {
  return ((b - a + 540) % 360) - 180;
}

function startTween(targetRotate, targetScale, duration = 1100) {
  modeTween = {
    startR: rotation.slice(),
    dLon: shortestLonDelta(rotation[0], targetRotate[0]),
    dLat: targetRotate[1] - rotation[1],
    startS: scaleFactor,
    dS: targetScale - scaleFactor,
    t0: performance.now(),
    dur: duration,
  };
}

function setMode(m) {
  if (!MODES[m] || mode === m) return;
  mode = m;
  document.querySelectorAll(".mode-button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === m);
  });
  startTween(MODES[m].rotate.slice(), MODES[m].scale);
  lastInteraction = performance.now();
}

function tick(now) {
  const dt = Math.min(50, now - lastFrame);
  lastFrame = now;

  if (modeTween) {
    const t = Math.min(1, (now - modeTween.t0) / modeTween.dur);
    const k = easeInOutCubic(t);
    rotation = [
      modeTween.startR[0] + modeTween.dLon * k,
      modeTween.startR[1] + modeTween.dLat * k,
      0,
    ];
    scaleFactor = modeTween.startS + modeTween.dS * k;
    if (t >= 1) {
      modeTween = null;
      lastInteraction = now;
    }
  } else if (
    settings.autoRotate &&
    !dragStart &&
    now - lastInteraction > 2500
  ) {
    rotation[0] += (settings.autoRotateSpeed * dt) / 1000;
  }

  applyProjection();
  render(now);
  requestAnimationFrame(tick);
}

function pickPoint(x, y) {
  let best = null;
  let bestD = 28 * 28;
  for (const item of items) {
    if (item.lat == null || item.lng == null) continue;
    if (!isVisible(item.lng, item.lat)) continue;
    if (!filterPasses(item)) continue;
    const pt = projection([item.lng, item.lat]);
    if (!pt) continue;
    const dx = pt[0] - x;
    const dy = pt[1] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = item;
    }
  }
  return best;
}

const cardEl = document.getElementById("card");
const cardCat = cardEl.querySelector('[data-bind="category"]');
const cardName = cardEl.querySelector('[data-bind="name"]');
const cardWhere = cardEl.querySelector('[data-bind="where"]');
const cardShort = cardEl.querySelector('[data-bind="short"]');

function showCard(item) {
  if (!item) {
    cardEl.hidden = true;
    selected = null;
    return;
  }
  selected = item;
  cardEl.hidden = false;
  cardCat.textContent = CATEGORY_LABELS[item.category] || item.category || "";
  cardName.textContent = item.name || item.title || "";
  const where = [item.city, item.country].filter(Boolean).join(" · ");
  cardWhere.textContent = where || (item.geolocated === false ? "Не локализовано на карте" : "");
  cardShort.textContent = item.short_text || "";
}

document.querySelector(".card__close").addEventListener("click", () => showCard(null));
document.querySelectorAll(".mode-button").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

let dragStart = null;
let dragMoved = false;
let pinch = null;

function setScale(s) {
  modeTween = null;
  scaleFactor = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
  lastInteraction = performance.now();
}

function multiplyScale(k) {
  setScale(scaleFactor * k);
}

select(canvas).call(
  drag()
    .on("start", (e) => {
      if (pinch) return;
      modeTween = null;
      dragStart = { x: e.x, y: e.y, r: rotation.slice() };
      dragMoved = false;
      lastInteraction = performance.now();
    })
    .on("drag", (e) => {
      if (pinch || !dragStart) return;
      const dx = e.x - dragStart.x;
      const dy = e.y - dragStart.y;
      if (Math.hypot(dx, dy) > 4) dragMoved = true;
      const k = 0.32;
      rotation = [
        dragStart.r[0] + dx * k,
        Math.max(-85, Math.min(85, dragStart.r[1] - dy * k)),
        0,
      ];
      lastInteraction = performance.now();
    })
    .on("end", (e) => {
      if (pinch) return;
      if (!dragMoved) {
        const hit = pickPoint(e.x, e.y);
        showCard(hit);
      }
      dragStart = null;
      lastInteraction = performance.now();
    }),
);

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0018);
  multiplyScale(factor);
}, { passive: false });

function touchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

canvas.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    pinch = { d: touchDist(e.touches), startScale: scaleFactor };
    dragStart = null;
  }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && pinch) {
    e.preventDefault();
    setScale(pinch.startScale * (touchDist(e.touches) / pinch.d));
  }
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  if (e.touches.length < 2) pinch = null;
});

canvas.addEventListener("touchcancel", () => { pinch = null; });

document.querySelector(".zoom-in").addEventListener("click", () => multiplyScale(1.25));
document.querySelector(".zoom-out").addEventListener("click", () => multiplyScale(1 / 1.25));

window.addEventListener("resize", resize);

// ---- Settings panel ----

function initSettingsUI() {
  const panel = document.getElementById("settings");
  const toggleBtn = document.getElementById("settings-toggle");
  toggleBtn.addEventListener("click", () => {
    panel.classList.toggle("is-open");
  });
  document.querySelector(".settings__close").addEventListener("click", () => {
    panel.classList.remove("is-open");
  });

  // toggles
  panel.querySelectorAll('input[type="checkbox"][data-setting]').forEach((input) => {
    const key = input.dataset.setting;
    input.checked = !!settings[key];
    input.addEventListener("change", () => {
      settings[key] = input.checked;
      saveSettings();
    });
  });

  // numeric sliders
  panel.querySelectorAll('input[type="range"][data-setting-num]').forEach((input) => {
    const key = input.dataset.settingNum;
    const out = panel.querySelector(`[data-bind-num="${key}"]`);
    input.value = settings[key];
    if (out) out.textContent = input.value;
    input.addEventListener("input", () => {
      settings[key] = Number(input.value);
      if (out) out.textContent = input.value;
      saveSettings();
    });
  });

  // filter dropdown — built from data later
  document.querySelector(".settings__reset").addEventListener("click", () => {
    Object.assign(settings, DEFAULTS);
    saveSettings();
    syncSettingsUI();
    populateFilter();
  });
}

function syncSettingsUI() {
  document.querySelectorAll('input[type="checkbox"][data-setting]').forEach((input) => {
    input.checked = !!settings[input.dataset.setting];
  });
  document.querySelectorAll('input[type="range"][data-setting-num]').forEach((input) => {
    input.value = settings[input.dataset.settingNum];
    const out = document.querySelector(`[data-bind-num="${input.dataset.settingNum}"]`);
    if (out) out.textContent = input.value;
  });
  const sel = document.getElementById("filter-select");
  if (sel) sel.value = settings.filter;
}

function populateFilter() {
  const sel = document.getElementById("filter-select");
  if (!sel) return;
  const counts = new Map();
  for (const it of items) {
    counts.set(it.category, (counts.get(it.category) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "all";
  optAll.textContent = `Все · ${items.length}`;
  sel.appendChild(optAll);
  for (const [cat, n] of sorted) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = `${CATEGORY_LABELS[cat] || cat} · ${n}`;
    sel.appendChild(opt);
  }
  sel.value = settings.filter;
  sel.onchange = () => {
    settings.filter = sel.value;
    saveSettings();
  };
}

// ---- Init ----

(async function init() {
  initSettingsUI();
  const [countriesRes, mtkRes] = await Promise.all([
    fetch("../data/ne_110m_countries.geojson").then((r) => r.json()),
    fetch("../data/mtk39.json").then((r) => r.json()),
  ]);
  countries = countriesRes;
  items = mtkRes.items;

  // compute fly-in delays based on great-circle distance from ORIGIN
  const distances = items.map((it) => ({
    id: it.id,
    d: it.lat == null ? Infinity : geoDistance(ORIGIN, [it.lng, it.lat]),
  }));
  distances.sort((a, b) => a.d - b.d);
  distances.forEach((di, idx) => pointDelays.set(di.id, idx * 35));

  resize();

  // intro: if flyIn, start globe further out and zoomed-out, fly into world view
  if (settings.flyIn) {
    rotation = [120, -10, 0];
    scaleFactor = 0.34;
    applyProjection();
    startTween(MODES.world.rotate.slice(), MODES.world.scale, 1700);
  }

  populateFilter();
  introT0 = performance.now() + 600;
  lastFrame = performance.now();
  lastInteraction = performance.now() + 2200;
  requestAnimationFrame(tick);
})();
