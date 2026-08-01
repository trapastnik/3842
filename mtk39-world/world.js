/* МТК 39 · «Имя на карте мира».
   Весь свод (1 147 геолоцированных объектов из 1 216) на одной сцене, которая
   разворачивается из глобуса в карту и сворачивается обратно.
   Цвет точки — судьба имени: латунь «носит имя», красный «переименовано»,
   серый «утрачено». Размер одинаковый: считываем плотность, а не важность.

   Морфинг сделан по классической схеме d3: интерполируем не картинку, а сами
   raw-проекции — ортографическую (шар) и Winkel Tripel (карта). WT берём из
   канона проекта assets/shared/lib/projection.js: своей WT-математики здесь нет,
   из константы используется только WT.ASPECT.

   d3 подключён локально (./vendor/d3.v7.min.js) классическим <script> —
   музейный киоск работает офлайн, рантайм-CDN запрещены (COORDINATION.md). */

const {
  geoProjection, geoOrthographicRaw, geoPath, geoGraticule10, geoDistance, drag, select,
} = window.d3;
const WT = window.MtkProjection.WinkelTripel;

const CORPUS = "../data/mtk39-corpus.json";
const CREDITS = "../data/images/mtk39/one-off/credits.json";
const IMG_DIR = "../data/images/mtk39/one-off/";
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
const MORPH_MS = 1500;         // разворачивание шара в карту

let credits = {};

const canvas = document.getElementById("globe");
const ctx = canvas.getContext("2d");
// Кап буфера рендера: на 4K с DPR 2 канвас был бы 33 Мп — держим бюджет ~8.3 Мп
// (задача координатора по итогам 4K-смоука 2026-07-22).
const PIXEL_BUDGET = 8.3e6;
function capDpr() {
  const raw = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return Math.max(1, Math.min(raw, 2, Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h))));
}

// Кегли и метки на канвасе заданы в пикселях под ~1600 px ширины — на 49" 4K
// их надо укрупнять пропорционально, иначе получается микротекст.
const uiScale = () => Math.max(1, Math.min(2.6, window.innerWidth / 1600));
let dpr = capDpr();

// alpha: 0 — шар, 1 — карта. Промежуточные значения — кадры разворачивания.
let alpha = 0;

// Winkel Tripel в «сырых» радианных единицах, восстановленный из канонической
// библиотеки: она отдаёт нормализованные world-px, здесь возвращаем их в тот же
// масштаб, в котором работают raw-проекции d3 (широта ±π/2).
const WT_X_SPAN = WT.ASPECT * Math.PI;           // полная ширина мира в raw-единицах
const WT_HALF_X = WT_X_SPAN / 2;

function wtRaw(lambda, phi) {
  const p = WT.project((phi * 180) / Math.PI, (lambda * 180) / Math.PI, 1, 1);
  return [(p.x - 0.5) * WT_X_SPAN, (0.5 - p.y) * Math.PI];
}

function morphRaw(lambda, phi) {
  const [x0, y0] = geoOrthographicRaw(lambda, phi);
  if (alpha === 0) return [x0, y0];
  const [x1, y1] = wtRaw(lambda, phi);
  return [x0 + (x1 - x0) * alpha, y0 + (y1 - y0) * alpha];
}

const projection = geoProjection(morphRaw).precision(0.4);
const path = geoPath(projection, ctx);

let width = 0;
let height = 0;
let countries = null;
let points = [];
let visible = [];
let selected = null;
let rotation = DEFAULT_ROTATE.slice();
let tilt = DEFAULT_ROTATE[1];   // наклон шара; на карте гасится до нуля
let scaleFactor = DEFAULT_SCALE;
let lastFrame = 0;
let lastInteraction = performance.now();
let filter = "all";
let hideUssr = false;
let mode = "globe";            // globe | map
let morph = null;

const nf = new Intl.NumberFormat("ru-RU");

/* ------------------------------------------------------------------ основа */

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = capDpr();
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  applyProjection();
}

function applyProjection() {
  // масштаб тоже интерполируем: у шара raw-радиус 1, у карты полуширина WT_HALF_X
  const globeK = (Math.min(width, height) * scaleFactor) / 2;
  const mapK = (Math.min(width * 0.94, height * 0.78 * WT.ASPECT) * scaleFactor)
    / (2 * WT_HALF_X);
  rotation[1] = tilt * (1 - alpha);
  projection
    .scale(globeK + (mapK - globeK) * alpha)
    .translate([width / 2, height / 2])
    .rotate(rotation)
    // на полностью развёрнутой карте складки нет — отсечение выключаем,
    // иначе край отсечения даёт шов поперёк мира
    .clipAngle(alpha >= 1 ? null : clipAngle());
  projection.precision(0.4);
}

// у шара видно полушарие, у карты — почти весь мир; окно раскрывается по мере
// разворачивания, поэтому обратная сторона «выплывает», а не появляется рывком
function clipAngle() {
  return 90 + 89 * alpha;
}

function isVisible(lng, lat) {
  if (alpha >= 1) return true;
  const [rl, rp] = projection.rotate();
  return geoDistance([lng, lat], [-rl, -rp]) < (clipAngle() * Math.PI) / 180;
}

const passes = (p) => (filter === "all" || p.status === filter)
  && !(hideUssr && p.continent === "Бывший СССР");

/* ------------------------------------------------------------------ отрисовка */

function render(now) {
  ctx.clearRect(0, 0, width, height);

  // шар (на карте тот же путь даёт контур мира)
  ctx.beginPath();
  path({ type: "Sphere" });
  const grad = ctx.createRadialGradient(
    width / 2, height * 0.42, 10,
    width / 2, height * 0.42, Math.min(width, height) * 0.62,
  );
  grad.addColorStop(0, "rgba(58, 70, 78, 0.95)");
  grad.addColorStop(1, "rgba(18, 24, 28, 1)");
  ctx.fillStyle = grad;
  // в середине разворачивания край отсечения вырождается в шов — гасим заливку
  ctx.globalAlpha = alpha > 0 && alpha < 1 ? 1 - alpha * 0.85 : 1;
  ctx.fill();
  ctx.globalAlpha = 1;

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

  // край шара / рамка карты
  if (alpha === 0 || alpha === 1) {
    ctx.beginPath();
    path({ type: "Sphere" });
    ctx.strokeStyle = "rgba(210, 183, 115, 0.4)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // точки: сначала приглушённые, потом активные — активные не тонут в общей массе
  visible = [];
  const u = uiScale();
  const r = Math.max(2 * u, Math.min(4.6 * u, projection.scale() / 190));
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

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

function stepMorph(now) {
  if (!morph) return;
  const t = Math.min(1, (now - morph.t0) / MORPH_MS);
  alpha = morph.from + (morph.to - morph.from) * easeInOut(t);
  applyProjection();
  if (t >= 1) {
    alpha = morph.to;
    morph = null;
  }
}

function setMode(next) {
  if (mode === next) return;
  mode = next;
  morph = { from: alpha, to: next === "map" ? 1 : 0, t0: performance.now() };
  showCard(null);
  syncModeUI();
  touched();
}

function syncModeUI() {
  for (const b of document.querySelectorAll("[data-mode]")) {
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  }
}

function tick(now) {
  const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
  lastFrame = now;
  stepMorph(now);
  if (!selected && !morph && mode === "globe" && now - lastInteraction > IDLE_MS) {
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
  const hit = 26 * uiScale();
  let bestD = hit * hit;
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
        // наклон полюсов имеет смысл только у шара
        tilt = Math.max(-89, Math.min(89, tilt - e.dy * k * 1.6 * (1 - alpha)));
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

  const fig = card.querySelector("[data-fig]");
  const credit = credits[p.id];
  fig.replaceChildren();
  fig.hidden = !credit;
  if (credit) {
    const img = document.createElement("img");
    img.src = IMG_DIR + p.id + ".jpg";
    img.alt = p.name;
    fig.appendChild(img);
    const cap = document.createElement("figcaption");
    // условие Викисклада: автор и лицензия рядом с изображением
    cap.textContent = [credit.author, credit.license, "Викисклад"].filter(Boolean).join(" · ");
    fig.appendChild(cap);
  }

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
    const n = all.filter((p) => p.status === s.key && passes(p)).length;
    const row = document.createElement("div");
    row.className = "legend__row";
    row.innerHTML = `<span class="legend__dot" style="background:${s.color}"></span>`
      + `${s.label} <span class="legend__num">${nf.format(n)}</span>`;
    host.appendChild(row);
  }
}

function buildFilters(host, legendHost) {
  const opts = [["all", "все"], ...STATUS.map((s) => [s.key, s.label])];
  host.replaceChildren();
  const group = document.createElement("div");
  group.className = "chips";
  for (const [key, label] of opts) {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(key === filter));
    b.addEventListener("click", () => {
      filter = key;
      showCard(null);
      [...group.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      buildLegend(legendHost, points);
      touched();
    });
    group.appendChild(b);
  }
  host.appendChild(group);

  // свод на 93% состоит из бывшего СССР и Европы: без ядра видно всё остальное
  const toggle = document.createElement("button");
  toggle.className = "chip chip--toggle";
  toggle.type = "button";
  toggle.textContent = "без бывшего СССР";
  toggle.setAttribute("aria-pressed", "false");
  toggle.addEventListener("click", () => {
    hideUssr = !hideUssr;
    toggle.setAttribute("aria-pressed", String(hideUssr));
    showCard(null);
    buildLegend(legendHost, points);
    touched();
  });
  host.appendChild(toggle);
}


/* ------------------------------------------------------------------ простой

   Музейный киоск: посетитель ушёл, оставив включённым фильтр или зум, — следующий
   подходит к чужому состоянию. Через IDLE_RESET_MS без касаний возвращаем экран
   к исходному виду. */

const IDLE_RESET_MS = 75000;
let idleTimer = null;

function armIdleReset(reset) {
  const rearm = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(reset, IDLE_RESET_MS);
  };
  for (const ev of ["pointerdown", "pointermove", "wheel", "touchstart", "keydown"]) {
    window.addEventListener(ev, rearm, { passive: true });
  }
  rearm();
}

function resetView() {
  filter = "all";
  hideUssr = false;
  scaleFactor = DEFAULT_SCALE;
  tilt = DEFAULT_ROTATE[1];
  rotation = DEFAULT_ROTATE.slice();
  showCard(null);
  setMode("globe");
  const legendHost = document.querySelector("[data-legend]");
  buildFilters(document.querySelector("[data-filters]"), legendHost);
  buildLegend(legendHost, points);
  document.querySelector("[data-hint]").classList.remove("is-off");
  applyProjection();
}

/* ------------------------------------------------------------------ запуск */

async function main() {
  const [corpus, geo, creditsData] = await Promise.all([
    fetch(CORPUS).then((r) => r.json()),
    fetch(COUNTRIES).then((r) => r.json()),
    fetch(CREDITS).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  credits = creditsData;
  countries = geo;
  points = corpus.records.filter((r) => r.lat !== null && r.lng !== null);

  const total = corpus.records.length;
  document.querySelector("[data-sub]").textContent =
    `${nf.format(points.length)} объектов из ${nf.format(total)} нанесены на глобус — `
    + `свод по ${new Set(points.map((p) => p.country)).size} странам. `
    + "Цвет точки — судьба имени.";

  const legendHost = document.querySelector("[data-legend]");
  buildLegend(legendHost, points);
  buildFilters(document.querySelector("[data-filters]"), legendHost);
  for (const b of document.querySelectorAll("[data-mode]")) {
    b.addEventListener("click", () => setMode(b.dataset.mode));
  }
  syncModeUI();
  armIdleReset(resetView);

  resize();
  bindInput();
  requestAnimationFrame(tick);
}

main().catch((e) => {
  console.error(e);
  document.querySelector(".title").textContent = "Данные не загрузились";
});
