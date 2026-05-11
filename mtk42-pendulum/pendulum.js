// МТК 42 · Маятник оценки
// Items placed in (tone, year) coordinates; smoothed mean drawn as a pendulum curve.

const YEAR_MIN = 1920;
const YEAR_MAX = 2026;
const PX_PER_YEAR = 38;       // chart density
const SIDE_PAD = 64;          // px reserved on each side of plot area
const TOP_PAD = 36;
const BOTTOM_PAD = 36;

const $ = (sel, root = document) => root.querySelector(sel);

(async function init() {
  const [content, portraits] = await Promise.all([
    fetch("../data/mtk42.json").then((r) => r.json()),
    fetch("../assets/mtk42/portraits/manifest.json").then((r) => r.json()).catch(() => ({})),
  ]);

  buildChart(content, portraits);
  bindUi();
})();

function buildChart(content, portraits) {
  const inner = $("#chart-inner");
  const chartHeight = (YEAR_MAX - YEAR_MIN) * PX_PER_YEAR + TOP_PAD + BOTTOM_PAD;
  inner.style.height = chartHeight + "px";

  drawEpochs(inner, content.epochs);
  drawYearRuler(inner);
  drawZeroLine(inner);

  const items = collectItems(content, portraits);
  drawPendulum(inner, items);
  drawDots(inner, items);
}

// ─── Coordinate helpers ──────────────────────────────────────
function yearToY(year) {
  return TOP_PAD + (year - YEAR_MIN) * PX_PER_YEAR;
}

function toneToXPercent(tone) {
  // tone in [-1, 1] → percent in [SIDE_PAD_PCT, 100 - SIDE_PAD_PCT]
  // we keep dots within a plot rectangle that has horizontal padding
  const t = Math.max(-1, Math.min(1, tone));
  const norm = (t + 1) / 2; // [0..1]
  // map norm 0..1 into 8%..92% to leave room for year ruler on right
  return 8 + norm * 84;
}

// ─── Epoch bands ────────────────────────────────────────────
function drawEpochs(root, epochs) {
  for (const ep of epochs) {
    const [y1, y2] = ep.years;
    if (y2 <= YEAR_MIN || y1 >= YEAR_MAX) continue;
    const a = Math.max(YEAR_MIN, y1);
    const b = Math.min(YEAR_MAX, y2);
    const top = yearToY(a);
    const height = (b - a) * PX_PER_YEAR;
    const band = document.createElement("div");
    band.className = `epoch-band epoch-band--${ep.id}`;
    band.style.top = top + "px";
    band.style.height = height + "px";
    root.appendChild(band);

    const label = document.createElement("div");
    label.className = "epoch-label";
    label.style.top = (top + 18) + "px";
    label.innerHTML = `${ep.label}<span class="epoch-label__years">${y1}–${y2}</span>`;
    root.appendChild(label);
  }
}

// ─── Year ruler ─────────────────────────────────────────────
function drawYearRuler(root) {
  const ruler = document.createElement("div");
  ruler.className = "year-ruler";
  for (let y = YEAR_MIN; y <= YEAR_MAX; y += 10) {
    const tick = document.createElement("div");
    tick.className = "year-tick";
    tick.textContent = String(y);
    tick.style.top = yearToY(y) + "px";
    ruler.appendChild(tick);
  }
  root.appendChild(ruler);
}

// ─── Zero line ──────────────────────────────────────────────
function drawZeroLine(root) {
  const line = document.createElement("div");
  line.className = "zero-line";
  line.style.left = toneToXPercent(0) + "%";
  root.appendChild(line);
}

// ─── Collect items ──────────────────────────────────────────
function collectItems(content, portraits) {
  const items = [];
  for (const q of content.quotes) {
    const p = portraits[q.id] || {};
    items.push({
      id: q.id,
      kind: "quote",
      name: q.author,
      meta: `${q.role} · ${q.year}`,
      year: q.year,
      tone: q.tone,
      text: q.text,
      source: q.source,
      portrait: p.image ? `../assets/mtk42/portraits/${p.image}` : null,
      initials: initialsFromName(q.author),
      tag: "Цитата",
    });
  }
  for (const r of content.researchers) {
    const p = portraits[r.id] || {};
    items.push({
      id: r.id,
      kind: "research",
      name: r.name,
      meta: `${r.role} · ${r.years}`,
      year: r.key_year,
      tone: r.tone,
      text: r.summary,
      source: `«${r.key_work}» · ${r.key_year}`,
      portrait: p.image ? `../assets/mtk42/portraits/${p.image}` : null,
      initials: initialsFromName(r.short || r.name),
      tag: "Исследователь",
    });
  }
  return items;
}

function initialsFromName(fullname) {
  // "Г.М. Кржижановский" → "К"; "Дмитрий Антонович Волкогонов" → "В"; fallback: first letter
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

  // Build year → list of tones
  const buckets = new Map();
  for (const it of items) {
    if (!buckets.has(it.year)) buckets.set(it.year, []);
    buckets.get(it.year).push(it.tone);
  }
  // Smoothed mean by sliding ±7 yr window
  const series = [];
  const HALF_WIN = 7;
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
    if (count > 0) {
      series.push({ y, mean: sum / count });
    }
  }
  if (series.length < 2) {
    root.appendChild(svg);
    return;
  }
  // Build path with cardinal-like smoothing (use simple quadratic blending)
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
  // Simple collision avoidance: sort by year, then iterate and bump x if too close
  const placed = [];
  const sorted = [...items].sort((a, b) => a.year - b.year || a.tone - b.tone);
  const MIN_DIST = 36; // px (in horizontal)
  const containerW = root.clientWidth;
  for (const it of sorted) {
    let xPct = toneToXPercent(it.tone);
    const yPx = yearToY(it.year);
    // detect collisions with already placed items within ±28px vertically
    for (let i = 0; i < 20; i++) {
      let collided = false;
      for (const p of placed) {
        if (Math.abs(p.yPx - yPx) > 38) continue;
        const xPx = (xPct / 100) * containerW;
        const pxPx = (p.xPct / 100) * containerW;
        if (Math.abs(xPx - pxPx) < MIN_DIST) {
          // shift outward from tone-zero
          const direction = it.tone >= 0 ? +1 : -1;
          xPct += direction * 2.4;
          collided = true;
        }
      }
      if (!collided) break;
    }
    placed.push({ ...it, xPct, yPx });
  }

  for (const it of placed) {
    const dot = document.createElement("button");
    dot.className = `dot dot--${it.kind}`;
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

  const marker = $('[data-bind="tone-marker"]', card);
  const norm = (item.tone + 1) / 2;
  marker.style.left = (norm * 100).toFixed(1) + "%";
  $('[data-bind="tone-value"]', card).textContent = (item.tone >= 0 ? "+" : "") + item.tone.toFixed(2);

  // ensure dot is roughly in view
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

// ─── UI bindings ────────────────────────────────────────────
function bindUi() {
  $(".card__close").addEventListener("click", closeCard);
  $("#legend-toggle").addEventListener("click", () => {
    const l = $("#legend");
    l.hidden = !l.hidden;
  });
  $(".legend__close").addEventListener("click", () => ($("#legend").hidden = true));

  // tap outside card / legend closes them
  document.addEventListener("pointerdown", (e) => {
    const card = $("#card");
    if (!card.hidden && !card.contains(e.target) && !e.target.closest(".dot")) {
      closeCard();
    }
    const legend = $("#legend");
    if (!legend.hidden && !legend.contains(e.target) && !e.target.closest("#legend-toggle")) {
      legend.hidden = true;
    }
  });

  // Scroll to "1990s" (entry to деленинизация) on load for visual interest
  requestAnimationFrame(() => {
    const chart = $("#chart");
    chart.scrollTop = yearToY(1988) - chart.clientHeight / 4;
  });
}
