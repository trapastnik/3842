/* МТК 39 · «Имя на карте мира».
   Весь свод (1 162 геолоцированных объекта из 1 216) на ортографическом глобусе.
   Цвет точки — судьба имени: латунь «носит имя», красный «переименовано»,
   серый «утрачено». Размер одинаковый: считываем плотность, а не важность.

   d3 подключён локально (./vendor/d3.v7.min.js) классическим <script> —
   музейный киоск работает офлайн, рантайм-CDN запрещены (COORDINATION.md). */

const { geoOrthographic, geoPath, geoGraticule10, geoDistance, drag, select } = window.d3;

const CORPUS = "../data/mtk39-corpus.json";
const COUNTRIES = "../data/ne_110m_countries.geojson";

const USSR_ISO = new Set([
  "RUS", "UKR", "BLR", "MDA", "LVA", "LTU", "EST",
  "GEO", "ARM", "AZE", "KAZ", "UZB", "TKM", "TJK", "KGZ",
]);

const STATUS = [
  { key: "носит имя", color: "#d2b773", label: "носит имя сегодня" },
  { key: "переименован", color: "#c9545a", label: "переименовано" },
  { key: "утрачен", color: "#9da3a8", label: "утрачено" },
];
const COLOR = new Map(STATUS.map((s) => [s.key, s.color]));

const DEFAULT_ROTATE = [-40, -30, 0];
const DEFAULT_SCALE = 1.16;
const MIN_SCALE = 0.4;
const MAX_SCALE = 9;
const IDLE_MS = 9000;          // после этого глобус снова начинает вращаться
const ROTATE_SPEED = 3.2;      // градусов в секунду

const canvas = document.getElementById("globe");
const ctx = canvas.getContext("2d");
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const projection = geoOrthographic().precision(0.4);
const path = geoPath(projection, ctx);

let width = 0;
let height = 0;
let countries = null;
let points = [];
let visible = [];
let selected = null;
let rotation = DEFAULT_ROTATE.slice();
let scaleFactor = DEFAULT_SCALE;
let lastFrame = 0;
let lastInteraction = performance.now();
let filter = "all";

const nf = new Intl.NumberFormat("ru-RU");

/* ------------------------------------------------------------------ основа */

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  applyProjection();
}

function applyProjection() {
  projection
    .scale((Math.min(width, height) * scaleFactor) / 2)
    .translate([width / 2, height / 2])
    .rotate(rotation);
}

function isVisible(lng, lat) {
  const [rl, rp] = projection.rotate();
  return geoDistance([lng, lat], [-rl, -rp]) < Math.PI / 2;
}

const passes = (p) => filter === "all" || p.status === filter;

/* ------------------------------------------------------------------ отрисовка */

function render(now) {
  ctx.clearRect(0, 0, width, height);

  // шар
  ctx.beginPath();
  path({ type: "Sphere" });
  const grad = ctx.createRadialGradient(
    width / 2, height * 0.42, 10,
    width / 2, height * 0.42, Math.min(width, height) * 0.62,
  );
  grad.addColorStop(0, "rgba(58, 70, 78, 0.95)");
  grad.addColorStop(1, "rgba(18, 24, 28, 1)");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  path(geoGraticule10());
  ctx.strokeStyle = "rgba(247, 249, 239, 0.05)";
  ctx.lineWidth = 1;
  ctx.stroke();

  if (countries) {
    for (const f of countries.features) {
      const iso = f.properties.ISO_A3 || f.properties.ADM0_A3;
      ctx.beginPath();
      path(f);
      ctx.fillStyle = USSR_ISO.has(iso)
        ? "rgba(210, 183, 115, 0.16)"
        : "rgba(67, 80, 89, 0.5)";
      ctx.fill();
      ctx.strokeStyle = "rgba(247, 249, 239, 0.13)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  // край шара
  ctx.beginPath();
  path({ type: "Sphere" });
  ctx.strokeStyle = "rgba(210, 183, 115, 0.4)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // точки: сначала приглушённые, потом активные — активные не тонут в общей массе
  visible = [];
  const r = Math.max(2, Math.min(4.6, projection.scale() / 190));
  for (const pass of [false, true]) {
    for (const p of points) {
      if (passes(p) !== pass) continue;
      if (!isVisible(p.lng, p.lat)) continue;
      const pt = projection([p.lng, p.lat]);
      if (!pt) continue;
      if (pass) visible.push({ p, x: pt[0], y: pt[1] });

      const sel = selected === p;
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], sel ? r + 3.5 : r, 0, Math.PI * 2);
      ctx.fillStyle = pass ? COLOR.get(p.status) : "rgba(157, 163, 168, 0.14)";
      ctx.globalAlpha = pass ? 0.9 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (pass) {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    }
  }

  // подпись выбранной точки
  if (selected && isVisible(selected.lng, selected.lat)) {
    const pt = projection([selected.lng, selected.lat]);
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], r + 11, 0, Math.PI * 2);
    const glow = ctx.createRadialGradient(pt[0], pt[1], r, pt[0], pt[1], r + 15);
    glow.addColorStop(0, "rgba(247, 249, 239, 0.5)");
    glow.addColorStop(1, "rgba(247, 249, 239, 0)");
    ctx.fillStyle = glow;
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ цикл */

function tick(now) {
  const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
  lastFrame = now;
  if (!selected && now - lastInteraction > IDLE_MS) {
    rotation[0] = (rotation[0] + ROTATE_SPEED * dt) % 360;
    applyProjection();
  }
  render(now);
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ ввод */

function touched() {
  lastInteraction = performance.now();
  document.querySelector("[data-hint]").classList.add("is-off");
}

function pick(x, y) {
  let best = null;
  let bestD = 26 * 26;
  for (const v of visible) {
    const d = (v.x - x) ** 2 + (v.y - y) ** 2;
    if (d < bestD) { bestD = d; best = v.p; }
  }
  return best;
}

function setScale(next) {
  scaleFactor = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
  applyProjection();
}

function bindInput() {
  let moved = 0;
  select(canvas).call(
    drag()
      .on("start", () => { moved = 0; touched(); })
      .on("drag", (e) => {
        moved += Math.abs(e.dx) + Math.abs(e.dy);
        const k = 0.26 / Math.sqrt(scaleFactor);
        rotation[0] += e.dx * k * 1.6;
        rotation[1] = Math.max(-89, Math.min(89, rotation[1] - e.dy * k * 1.6));
        applyProjection();
        touched();
      })
      .on("end", (e) => {
        if (moved < 6) showCard(pick(e.x, e.y));
        touched();
      }),
  );

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    setScale(scaleFactor * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    touched();
  }, { passive: false });

  let pinch = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) pinch = { d: dist(e.touches), s: scaleFactor };
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (pinch && e.touches.length === 2) {
      setScale(pinch.s * (dist(e.touches) / pinch.d));
      touched();
    }
  }, { passive: true });
  canvas.addEventListener("touchend", () => { pinch = null; }, { passive: true });

  window.addEventListener("resize", resize, { passive: true });
}

/* ------------------------------------------------------------------ карточка */

const card = document.getElementById("card");

function showCard(p) {
  selected = p;
  if (!p) { card.hidden = true; return; }

  card.querySelector("[data-orig]").textContent =
    p.name_orig && p.name_orig !== p.name ? p.name_orig : "";
  card.querySelector("[data-name]").textContent = p.name;
  card.querySelector("[data-where]").textContent =
    [p.city, p.country].filter(Boolean).join(" · ");
  card.querySelector("[data-desc]").textContent = p.desc || "";

  const facts = card.querySelector("[data-facts]");
  facts.replaceChildren();
  const rows = [];
  const st = STATUS.find((s) => s.key === p.status);
  if (st) rows.push(["судьба имени", st.label]);
  if (p.year_named) rows.push(["имя присвоено", p.year_named]);
  if (p.year_renamed) rows.push(["имя снято", p.year_renamed]);
  rows.push(["часть света", p.continent]);
  if (p.geo_src === "nominatim" || p.geo_src === "nominatim-alt") {
    rows.push(["координаты", "по городу, не по объекту"]);
  }
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    facts.append(dt, dd);
  }
  card.hidden = false;
}

card.querySelector(".card__close").addEventListener("click", () => showCard(null));

/* ------------------------------------------------------------------ панели */

function buildLegend(host, all) {
  host.replaceChildren();
  for (const s of STATUS) {
    const n = all.filter((p) => p.status === s.key).length;
    const row = document.createElement("div");
    row.className = "legend__row";
    row.innerHTML = `<span class="legend__dot" style="background:${s.color}"></span>`
      + `${s.label} <span class="legend__num">${nf.format(n)}</span>`;
    host.appendChild(row);
  }
}

function buildFilters(host) {
  const opts = [["all", "все"], ...STATUS.map((s) => [s.key, s.label])];
  host.replaceChildren();
  for (const [key, label] of opts) {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(key === filter));
    b.addEventListener("click", () => {
      filter = key;
      showCard(null);
      [...host.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      touched();
    });
    host.appendChild(b);
  }
}

/* ------------------------------------------------------------------ запуск */

async function main() {
  const [corpus, geo] = await Promise.all([
    fetch(CORPUS).then((r) => r.json()),
    fetch(COUNTRIES).then((r) => r.json()),
  ]);
  countries = geo;
  points = corpus.records.filter((r) => r.lat !== null && r.lng !== null);

  const total = corpus.records.length;
  document.querySelector("[data-sub]").textContent =
    `${nf.format(points.length)} объектов из ${nf.format(total)} нанесены на глобус — `
    + `свод по ${new Set(points.map((p) => p.country)).size} странам. `
    + "Цвет точки — судьба имени.";

  buildLegend(document.querySelector("[data-legend]"), points);
  buildFilters(document.querySelector("[data-filters]"));

  resize();
  bindInput();
  requestAnimationFrame(tick);
}

main().catch((e) => {
  console.error(e);
  document.querySelector(".title").textContent = "Данные не загрузились";
});
