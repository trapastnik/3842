// МТК 42 · Маятник оценки
// Items placed in (tone, year) coordinates; smoothed mean drawn as a pendulum curve.

const YEAR_MIN = 1920;
const YEAR_MAX = 2026;
const SIDE_PAD = 64;
const TOP_PAD = 36;
const BOTTOM_PAD = 36;

const COMPRESSED_RANGES_DEFINITION = [
  { from: 1934, to: 1985, scale: 0.18 },
];

const DEFAULTS = {
  pxPerYear: 42,
  dotSize: 112,
  strokeWidth: 6,
  compressCanon: true,
  showPendulum: true,
  showRuler: true,
  showEpochs: true,
  catLeaders: true,
  catPolitician: true,
  catResearcher: true,
  catWriters: true,
  // Typography — axis (top labels)
  axisSize: 11,
  axisOpacity: 72,
  axisBold: false,
  // Typography — epoch labels
  epochSize: 28,
  epochOpacity: 20,
  epochBold: false,
  // Typography — year ticks
  yearSize: 22,
  yearOpacity: 65,
  yearBold: false,
  // Card design
  cardDesign: "v1",
  // Pendulum curve extras
  smoothWindow: 7,
  strokeOpacity: 62,
};
const CATEGORY_FLAG = {
  leaders: "catLeaders",
  politician: "catPolitician",
  researcher: "catResearcher",
  writers: "catWriters",
};
const LS_KEY = "mtk42-pendulum-settings-v1";

const state = {
  settings: loadSettings(),
  content: null,
  portraits: null,
  segments: [],
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.settings)); } catch {}
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

(async function init() {
  const [content, portraits] = await Promise.all([
    fetch("../data/mtk42.json").then((r) => r.json()),
    fetch("../assets/mtk42/portraits/manifest.json").then((r) => r.json()).catch(() => ({})),
  ]);
  state.content = content;
  state.portraits = portraits;

  applyVisualSettings();
  rebuildChart();
  bindUi();
  syncControlsFromState();

  // Initial scroll close to 1988 (entry to back-to-lenin) for visual interest.
  requestAnimationFrame(() => {
    const chart = $("#chart");
    chart.scrollTop = yearToY(1988) - chart.clientHeight / 4;
  });
})();

// ─── Segments / compression ─────────────────────────────────
function rebuildSegments() {
  const ranges = state.settings.compressCanon ? COMPRESSED_RANGES_DEFINITION : [];
  const breakpoints = new Set([YEAR_MIN, YEAR_MAX]);
  for (const r of ranges) {
    breakpoints.add(r.from);
    breakpoints.add(r.to);
  }
  const sorted = [...breakpoints]
    .filter((y) => y >= YEAR_MIN && y <= YEAR_MAX)
    .sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const r = ranges.find((rr) => rr.from <= from && to <= rr.to);
    segs.push({ from, to, scale: r ? r.scale : 1 });
  }
  state.segments = segs;
}

function activeCompressedRanges() {
  return state.settings.compressCanon ? COMPRESSED_RANGES_DEFINITION : [];
}

// ─── Coordinate helpers ─────────────────────────────────────
function yearToY(year) {
  const y = Math.max(YEAR_MIN, Math.min(YEAR_MAX, year));
  const px = state.settings.pxPerYear;
  let acc = TOP_PAD;
  for (const s of state.segments) {
    if (y >= s.to) {
      acc += (s.to - s.from) * px * s.scale;
    } else if (y > s.from) {
      acc += (y - s.from) * px * s.scale;
      break;
    } else {
      break;
    }
  }
  return acc;
}

function toneToXPercent(tone) {
  const t = Math.max(-1, Math.min(1, tone));
  const norm = (t + 1) / 2;
  return 12 + norm * 76;
}

// ─── Build chart ────────────────────────────────────────────
function rebuildChart() {
  rebuildSegments();
  const inner = $("#chart-inner");
  inner.innerHTML = "";
  const chartHeight = yearToY(YEAR_MAX) + BOTTOM_PAD;
  inner.style.height = chartHeight + "px";

  drawEpochs(inner, state.content.epochs);
  drawYearRuler(inner);
  drawZeroLine(inner);

  const items = collectItems(state.content, state.portraits);
  drawPendulum(inner, items);
  drawDots(inner, items);
}

function drawEpochs(root, epochs) {
  const ranges = activeCompressedRanges();
  for (const ep of epochs) {
    const [y1, y2] = ep.years;
    if (y2 <= YEAR_MIN || y1 >= YEAR_MAX) continue;
    const a = Math.max(YEAR_MIN, y1);
    const b = Math.min(YEAR_MAX, y2);
    const top = yearToY(a);
    const height = yearToY(b) - top;
    const compressed = ranges.some((r) => r.from <= a && b <= r.to);
    const band = document.createElement("div");
    band.className = `epoch-band epoch-band--${ep.id}${compressed ? " epoch-band--compressed" : ""}`;
    band.style.top = top + "px";
    band.style.height = height + "px";
    root.appendChild(band);

    const label = document.createElement("div");
    label.className = "epoch-label" + (compressed ? " epoch-label--compressed" : "");
    label.style.top = compressed
      ? (top + height / 2) + "px"
      : (top + 18) + "px";
    label.innerHTML = `${ep.label}<span class="epoch-label__years">${y1}–${y2}${compressed ? " · сжато" : ""}</span>`;
    root.appendChild(label);
  }
}

function drawYearRuler(root) {
  const ruler = document.createElement("div");
  ruler.className = "year-ruler";
  const ranges = activeCompressedRanges();
  for (let y = YEAR_MIN; y <= YEAR_MAX; y += 10) {
    const inCompressed = ranges.find((r) => y > r.from && y < r.to);
    if (inCompressed) continue;
    const tick = document.createElement("div");
    tick.className = "year-tick";
    tick.textContent = String(y);
    tick.style.top = yearToY(y) + "px";
    ruler.appendChild(tick);
  }
  root.appendChild(ruler);
}

function drawZeroLine(root) {
  const line = document.createElement("div");
  line.className = "zero-line";
  line.style.left = toneToXPercent(0) + "%";
  root.appendChild(line);
}

// ─── Collect items ──────────────────────────────────────────
const CATEGORY_TAG = {
  leaders: "Вождь",
  politician: "Политик",
  researcher: "Исследователь",
  writers: "Литература",
};

function collectItems(content, portraits) {
  const items = [];
  for (const p of content.people) {
    const flag = CATEGORY_FLAG[p.category];
    if (flag && !state.settings[flag]) continue;
    const portraitMeta = portraits[p.id] || {};
    items.push({
      id: p.id,
      category: p.category,
      name: p.name,
      meta: `${p.role} · ${p.years}`,
      year: p.year,
      tone: p.tone,
      text: p.summary || "",
      source: p.key_work ? `«${p.key_work}»` : "",
      quote: p.quote || null,
      portrait: portraitMeta.image ? `../assets/mtk42/portraits/${portraitMeta.image}` : null,
      initials: initialsFromName(p.short || p.name),
      tag: CATEGORY_TAG[p.category] || p.category,
    });
  }
  return items;
}

function initialsFromName(fullname) {
  const parts = fullname.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  const last = parts[parts.length - 1] || fullname;
  return last.charAt(0).toUpperCase();
}

// ─── Pendulum curve ─────────────────────────────────────────
function drawPendulum(root, items) {
  const width = root.clientWidth;
  const height = parseFloat(root.style.height);
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "pendulum-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");

  if (items.length === 0) {
    root.appendChild(svg);
    return;
  }
  const buckets = new Map();
  for (const it of items) {
    if (!buckets.has(it.year)) buckets.set(it.year, []);
    buckets.get(it.year).push(it.tone);
  }
  const series = [];
  const HALF_WIN = Math.max(1, state.settings.smoothWindow || 7);
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
    let sum = 0;
    let count = 0;
    for (let yy = y - HALF_WIN; yy <= y + HALF_WIN; yy++) {
      const arr = buckets.get(yy);
      if (!arr) continue;
      const w = 1 - Math.abs(yy - y) / (HALF_WIN + 1);
      for (const t of arr) {
        sum += t * w;
        count += w;
      }
    }
    if (count > 0) series.push({ y, mean: sum / count });
  }
  if (series.length < 2) {
    root.appendChild(svg);
    return;
  }
  const pts = series.map((s) => {
    const x = (toneToXPercent(s.mean) / 100) * width;
    const yy = yearToY(s.y);
    return [x, yy];
  });
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const mx = (px + cx) / 2;
    const my = (py + cy) / 2;
    d += ` Q ${px.toFixed(1)} ${py.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  d += ` T ${pts[pts.length - 1][0].toFixed(1)} ${pts[pts.length - 1][1].toFixed(1)}`;

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("class", "pendulum-path");
  path.setAttribute("d", d);
  svg.appendChild(path);
  root.appendChild(svg);
}

// ─── Dots ───────────────────────────────────────────────────
function drawDots(root, items) {
  const dotSize = state.settings.dotSize;
  const placed = [];
  const sorted = [...items].sort((a, b) => a.year - b.year || a.tone - b.tone);
  const MIN_DIST = Math.max(40, dotSize - 20);
  const VERT_THRESHOLD = Math.max(60, dotSize - 12);
  const containerW = root.clientWidth;
  const halfPct = ((dotSize / 2 + 4) / containerW) * 100;
  const MIN_X = halfPct;
  const MAX_X = 100 - halfPct;
  for (const it of sorted) {
    let xPct = toneToXPercent(it.tone);
    const yPx = yearToY(it.year);
    for (let i = 0; i < 40; i++) {
      let collided = false;
      for (const p of placed) {
        if (Math.abs(p.yPx - yPx) > VERT_THRESHOLD) continue;
        const xPx = (xPct / 100) * containerW;
        const pxPx = (p.xPct / 100) * containerW;
        if (Math.abs(xPx - pxPx) < MIN_DIST) {
          const direction = it.tone >= 0 ? +1 : -1;
          xPct += direction * 2.0;
          collided = true;
        }
      }
      if (!collided) break;
    }
    xPct = Math.max(MIN_X, Math.min(MAX_X, xPct));
    placed.push({ ...it, xPct, yPx });
  }

  for (const it of placed) {
    const dot = document.createElement("button");
    dot.className = `dot dot--${it.category}`;
    dot.type = "button";
    dot.style.left = it.xPct + "%";
    dot.style.top = it.yPx + "px";
    dot.dataset.id = it.id;
    dot.setAttribute("aria-label", `${it.name}, ${it.year}`);

    if (it.portrait) {
      const img = document.createElement("img");
      img.className = "dot__portrait";
      img.src = it.portrait;
      img.alt = "";
      img.loading = "lazy";
      dot.appendChild(img);
    } else {
      const sp = document.createElement("span");
      sp.className = "dot__initials";
      sp.textContent = it.initials;
      dot.appendChild(sp);
    }
    dot.addEventListener("click", () => openCard(it, dot));
    root.appendChild(dot);
  }
}

// ─── Detail card ────────────────────────────────────────────
let openedDot = null;
function openCard(item, sourceDot) {
  if (openedDot) openedDot.classList.remove("is-open");
  openedDot = sourceDot;
  sourceDot.classList.add("is-open");

  const card = $("#card");
  card.hidden = false;

  const port = $('[data-bind="portrait"]', card);
  port.innerHTML = "";
  if (item.portrait) {
    const img = document.createElement("img");
    img.src = item.portrait;
    img.alt = "";
    port.appendChild(img);
  } else {
    port.textContent = item.initials;
  }

  $('[data-bind="kind"]', card).textContent = item.tag;
  $('[data-bind="name"]', card).textContent = item.name;
  $('[data-bind="meta"]', card).textContent = item.meta;
  $('[data-bind="text"]', card).textContent = item.text;
  $('[data-bind="source"]', card).textContent = item.source;

  const quoteSection = $('[data-bind="quote-section"]', card);
  if (item.quote) {
    quoteSection.hidden = false;
    $('[data-bind="quote-text"]', card).textContent = `«${item.quote.text}»`;
    $('[data-bind="quote-source"]', card).textContent = item.quote.source;
  } else {
    quoteSection.hidden = true;
  }

  const marker = $('[data-bind="tone-marker"]', card);
  const norm = (item.tone + 1) / 2;
  marker.style.left = (norm * 100).toFixed(1) + "%";
  const pct = Math.round(item.tone * 100);
  $('[data-bind="tone-value"]', card).textContent = (pct >= 0 ? "+" : "") + pct + "%";

  const chart = $("#chart");
  const dotRect = sourceDot.getBoundingClientRect();
  const chartRect = chart.getBoundingClientRect();
  const desiredTop = chart.scrollTop + (dotRect.top - chartRect.top) - chartRect.height * 0.35;
  chart.scrollTo({ top: desiredTop, behavior: "smooth" });
}

function closeCard() {
  $("#card").hidden = true;
  if (openedDot) {
    openedDot.classList.remove("is-open");
    openedDot = null;
  }
}

// ─── Visual settings (CSS variables + body flags) ───────────
function applyVisualSettings() {
  const root = document.documentElement;
  const s = state.settings;
  root.style.setProperty("--dot-size", s.dotSize + "px");
  root.style.setProperty("--pendulum-stroke", s.strokeWidth);
  root.style.setProperty("--axis-size",  s.axisSize  + "px");
  root.style.setProperty("--axis-opacity", (s.axisOpacity / 100).toFixed(2));
  root.style.setProperty("--axis-weight", s.axisBold ? 700 : 400);
  root.style.setProperty("--epoch-size", s.epochSize + "px");
  root.style.setProperty("--epoch-opacity", (s.epochOpacity / 100).toFixed(2));
  root.style.setProperty("--epoch-weight", s.epochBold ? 700 : 400);
  root.style.setProperty("--year-size",  s.yearSize  + "px");
  root.style.setProperty("--year-opacity", (s.yearOpacity / 100).toFixed(2));
  root.style.setProperty("--year-weight", s.yearBold ? 700 : 400);
  root.style.setProperty("--pendulum-opacity", (s.strokeOpacity / 100).toFixed(2));
  document.body.classList.toggle("hide-pendulum", !s.showPendulum);
  document.body.classList.toggle("hide-ruler", !s.showRuler);
  document.body.classList.toggle("hide-epochs", !s.showEpochs);
  const card = $("#card");
  if (card) card.dataset.design = s.cardDesign || "v1";
  // Highlight active design preset
  document.querySelectorAll('[data-card-design]').forEach((b) => {
    b.classList.toggle("is-active", b.dataset.cardDesign === (s.cardDesign || "v1"));
  });
}

// ─── Controls ───────────────────────────────────────────────
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

function onCheckboxChange(el) {
  const key = el.dataset.setting;
  state.settings[key] = !!el.checked;
  saveSettings();
  if (key.startsWith("cat") || key === "compressCanon") {
    rebuildChart();
  } else {
    applyVisualSettings();
  }
}

function onSliderChange(el) {
  const key = el.dataset.settingNum;
  const v = Number(el.value);
  state.settings[key] = v;
  const num = $(`[data-bind-num="${key}"]`);
  if (num) num.textContent = v;
  saveSettings();
  if (key === "pxPerYear" || key === "smoothWindow") {
    rebuildChart();
  } else if (key === "dotSize") {
    applyVisualSettings();
    rebuildChart(); // re-run collision avoidance for new dot size
  } else {
    applyVisualSettings();
  }
}

function bindUi() {
  $(".card__close").addEventListener("click", closeCard);

  // Settings panel
  const settings = $("#settings");
  $("#settings-toggle").addEventListener("click", () => settings.classList.toggle("is-open"));
  $(".settings__close").addEventListener("click", () => settings.classList.remove("is-open"));
  $(".settings__reset").addEventListener("click", () => {
    state.settings = { ...DEFAULTS };
    saveSettings();
    applyVisualSettings();
    rebuildChart();
    syncControlsFromState();
  });

  $$('input[type="checkbox"][data-setting]').forEach((el) => {
    el.addEventListener("change", () => onCheckboxChange(el));
  });
  $$('input[type="range"][data-setting-num]').forEach((el) => {
    el.addEventListener("input", () => onSliderChange(el));
  });
  $$('[data-card-design]').forEach((btn) => {
    btn.addEventListener("click", () => {
      state.settings.cardDesign = btn.dataset.cardDesign;
      saveSettings();
      applyVisualSettings();
    });
  });

  // Legend popover (independent of settings)
  const legend = $("#legend");
  $("#legend-toggle").addEventListener("click", () => (legend.hidden = !legend.hidden));
  $(".legend__close").addEventListener("click", () => (legend.hidden = true));

  // tap outside card / settings / legend closes them
  document.addEventListener("pointerdown", (e) => {
    const card = $("#card");
    if (!card.hidden && !card.contains(e.target) && !e.target.closest(".dot")) {
      closeCard();
    }
    if (settings.classList.contains("is-open")
        && !settings.contains(e.target)
        && !e.target.closest("#settings-toggle")) {
      settings.classList.remove("is-open");
    }
    if (!legend.hidden
        && !legend.contains(e.target)
        && !e.target.closest("#legend-toggle")) {
      legend.hidden = true;
    }
  });
}
