/* МТК 39 · «Карта имени».
   Тот же свод, что и на глобусе (mtk39-world), но на плоской карте — чтобы
   сравнить две подачи и выбрать. Цвет точки — судьба имени.

   Проекция — общий канон проекта: MtkProjection.WinkelTripel из assets/shared/lib
   (порядок аргументов (lat, lng), аспект только из WT.ASPECT — своей математики нет).
   Библиотека подключена классическим <script>: рантайм-CDN в проекте запрещены. */

const CORPUS = "../data/mtk39-corpus.json";
const CREDITS = "../data/images/mtk39/one-off/credits.json";
const IMG_DIR = "../data/images/mtk39/one-off/";
const COUNTRIES = "../data/ne_110m_countries.geojson";
const WT = window.MtkProjection.WinkelTripel;

const STATUS = [
  { key: "носит имя", color: "#d2b773", label: "носит имя сегодня" },
  { key: "переименован", color: "#c9545a", label: "переименовано" },
  { key: "утрачен", color: "#9da3a8", label: "утрачено" },
];
const COLOR = new Map(STATUS.map((s) => [s.key, s.color]));

const MIN_ZOOM = 1;
const MAX_ZOOM = 9;

let credits = {};
let closeOffmapRef = () => {};

const canvas = document.getElementById("map");
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
const nf = new Intl.NumberFormat("ru-RU");

let width = 0;
let height = 0;
let baseW = 0;             // ширина карты при zoom = 1
let zoom = 1;
let panX = 0;              // сдвиг в экранных пикселях
let panY = 0;
let land = [];
let points = [];
let visible = [];
let selected = null;
let statusFilter = "all";
let hideUssr = false;
let needsDraw = true;

/* ------------------------------------------------------------------ раскладка */

function fitBase() {
  const availW = width * 0.98;
  const availH = height * 0.8;
  baseW = Math.min(availW, availH * WT.ASPECT);
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = capDpr();
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fitBase();
  clampPan();
  needsDraw = true;
}

const worldW = () => baseW * zoom;
const worldH = () => worldW() / WT.ASPECT;

function originX() { return (width - worldW()) / 2 + panX; }
function originY() { return (height - worldH()) / 2 + panY - height * 0.02; }

function clampPan() {
  // не даём утащить карту за пределы экрана
  const limX = Math.max(0, (worldW() - width) / 2 + width * 0.12);
  const limY = Math.max(0, (worldH() - height) / 2 + height * 0.12);
  panX = Math.max(-limX, Math.min(limX, panX));
  panY = Math.max(-limY, Math.min(limY, panY));
}

function project(lat, lng) {
  const p = WT.project(lat, lng, worldW(), worldH());
  return [p.x + originX(), p.y + originY()];
}

/* ------------------------------------------------------------------ данные */

function prepareLand(geo) {
  land = [];
  for (const f of geo.features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates]
      : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      for (const ring of poly) {
        if (ring.length >= 4) land.push(ring);
      }
    }
  }
}

const shown = (p) => (statusFilter === "all" || p.status === statusFilter)
  && !(hideUssr && p.continent === "Бывший СССР");

/* ------------------------------------------------------------------ отрисовка */

function drawLand() {
  ctx.beginPath();
  for (const ring of land) {
    let started = false;
    let prevX = 0;
    for (const [lng, lat] of ring) {
      const [x, y] = project(lat, lng);
      if (started && Math.abs(x - prevX) > worldW() * 0.5) started = false;
      if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
      prevX = x;
    }
  }
  ctx.fillStyle = "rgba(72, 86, 95, 0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(247, 249, 239, 0.18)";
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

function render() {
  ctx.clearRect(0, 0, width, height);

  // рамка карты
  const ox = originX();
  const oy = originY();
  ctx.beginPath();
  ctx.rect(ox, oy, worldW(), worldH());
  ctx.strokeStyle = "rgba(210, 183, 115, 0.22)";
  ctx.lineWidth = 1;
  ctx.stroke();

  drawLand();

  visible = [];
  const r = Math.max(1.8, Math.min(5, 2.2 * Math.sqrt(zoom))) * uiScale();
  for (const pass of [false, true]) {
    for (const p of points) {
      if (shown(p) !== pass) continue;
      const [x, y] = project(p.lat, p.lng);
      if (x < -40 || x > width + 40 || y < -40 || y > height + 40) continue;
      if (pass) visible.push({ p, x, y });
      ctx.beginPath();
      ctx.arc(x, y, pass ? r : r * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = pass ? COLOR.get(p.status) : "rgba(157, 163, 168, 0.13)";
      ctx.globalAlpha = pass ? 0.9 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  if (selected && shown(selected)) {
    const [x, y] = project(selected.lat, selected.lng);
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "#f7f9ef";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r + 13, 0, Math.PI * 2);
    const glow = ctx.createRadialGradient(x, y, r, x, y, r + 16);
    glow.addColorStop(0, "rgba(247, 249, 239, 0.4)");
    glow.addColorStop(1, "rgba(247, 249, 239, 0)");
    ctx.fillStyle = glow;
    ctx.fill();
  }
}

function frame() {
  if (needsDraw) {
    needsDraw = false;
    render();
  }
  requestAnimationFrame(frame);
}

const invalidate = () => { needsDraw = true; };

/* ------------------------------------------------------------------ ввод */

function pick(x, y) {
  let best = null;
  const hit = 24 * uiScale();
  let bestD = hit * hit;
  for (const v of visible) {
    const d = (v.x - x) ** 2 + (v.y - y) ** 2;
    if (d < bestD) { bestD = d; best = v.p; }
  }
  return best;
}

function zoomAt(factor, cx, cy) {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
  if (next === zoom) return;

  // точка под пальцем должна остаться на месте: считаем её мировую долю
  // до зума и восстанавливаем сдвиг после
  const wx = (cx - originX()) / worldW();
  const wy = (cy - originY()) / worldH();
  zoom = next;
  panX = cx - (width - worldW()) / 2 - wx * worldW();
  panY = cy - (height - worldH()) / 2 + height * 0.02 - wy * worldH();

  clampPan();
  invalidate();
}

function bindInput() {
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;

  const hint = document.querySelector("[data-hint]");
  const touched = () => hint.classList.add("is-off");

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    touched();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    panX += dx;
    panY += dy;
    clampPan();
    invalidate();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    if (moved < 6) showCard(pick(e.clientX, e.clientY));
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", () => { dragging = false; });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.14 : 1 / 1.14, e.clientX, e.clientY);
    touched();
  }, { passive: false });

  let pinch = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) { dragging = false; pinch = dist(e.touches); }
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (pinch && e.touches.length === 2) {
      const d = dist(e.touches);
      const [cx, cy] = mid(e.touches);
      zoomAt(d / pinch, cx, cy);
      pinch = d;
    }
  }, { passive: true });
  canvas.addEventListener("touchend", () => { pinch = null; }, { passive: true });

  window.addEventListener("resize", resize, { passive: true });
}

/* ------------------------------------------------------------------ карточка */

const card = document.getElementById("card");

function showCard(p) {
  selected = p;
  invalidate();
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
  if (String(p.geo_src).startsWith("nominatim")) {
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

function buildLegend(host) {
  host.replaceChildren();
  for (const s of STATUS) {
    const n = points.filter((p) => p.status === s.key && shown(p)).length;
    const row = document.createElement("div");
    row.className = "legend__row";
    row.innerHTML = `<span class="legend__dot" style="background:${s.color}"></span>`
      + `${s.label} <span class="legend__num">${nf.format(n)}</span>`;
    host.appendChild(row);
  }
}

function buildFilters(host, legendHost) {
  host.replaceChildren();
  const opts = [["all", "все"], ...STATUS.map((s) => [s.key, s.label])];
  const group = document.createElement("div");
  group.className = "chips";
  for (const [key, label] of opts) {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(key === statusFilter));
    b.addEventListener("click", () => {
      statusFilter = key;
      [...group.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      showCard(null);
      buildLegend(legendHost);
      invalidate();
    });
    group.appendChild(b);
  }
  host.appendChild(group);

  // отдельный тумблер: свод на 93% состоит из бывшего СССР и Европы,
  // без ядра видно всё остальное
  const toggle = document.createElement("button");
  toggle.className = "chip chip--toggle";
  toggle.type = "button";
  toggle.textContent = "без бывшего СССР";
  toggle.setAttribute("aria-pressed", "false");
  toggle.addEventListener("click", () => {
    hideUssr = !hideUssr;
    toggle.setAttribute("aria-pressed", String(hideUssr));
    showCard(null);
    buildLegend(legendHost);
    invalidate();
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
  statusFilter = "all";
  hideUssr = false;
  zoom = 1;
  panX = 0;
  panY = 0;
  showCard(null);
  closeOffmapRef();
  const legendHost = document.querySelector("[data-legend]");
  buildFilters(document.querySelector("[data-filters]"), legendHost);
  buildLegend(legendHost);
  document.querySelector("[data-hint]").classList.remove("is-off");
  clampPan();
  invalidate();
}


/* ------------------------------------------------------------ не на карте

   Часть записей свода не удалось привязать к точке: кириллические транслитерации
   итальянских, сербских и индийских топонимов не ищутся, а часть объектов точки
   не имеет в принципе (премия, комсомол, послание в космос). Они не пропадают
   молча — открываются полноценной картотекой с теми же карточками, что и у точек
   на карте, и с перегруппировкой по типу, судьбе имени и стране. */

const KIND_LABEL = {
  улица: "улицы", проспект: "проспекты и бульвары", площадь: "площади",
  переулок: "переулки", город: "города и сёла", район: "районы и области",
  завод: "заводы и фабрики", вуз: "институты и школы", культура: "музеи, театры, библиотеки",
  парк: "парки", памятник: "памятники", электростанция: "электростанции",
  колхоз: "колхозы и совхозы", транспорт: "транспорт", вода: "каналы и реки",
  спорт: "стадионы", медицина: "больницы", судно: "суда", природа: "горы и заповедники",
  награда: "ордена и премии", космос: "космос", прочее: "прочее",
};
const STATUS_CLASS = {
  "носит имя": "offcard--live",
  переименован: "offcard--gone",
  утрачен: "offcard--lost",
};
const OFF_GROUPS = [
  { key: "kind", label: "по типу", of: (r) => KIND_LABEL[r.kind] || r.kind },
  { key: "status", label: "по судьбе имени",
    of: (r) => (STATUS.find((s) => s.key === r.status) || {}).label || r.status },
  { key: "country", label: "по стране", of: (r) => r.country || "—" },
];

function buildOffmap(all) {
  const panel = document.getElementById("offmap");
  const wall = panel.querySelector("[data-off-wall]");
  const tabs = panel.querySelector("[data-off-groups]");
  const toggle = document.getElementById("offmap-toggle");
  const off = all.filter((r) => r.lat === null || r.lng === null);

  if (!off.length) {
    toggle.hidden = true;
    return () => {};
  }
  toggle.querySelector("[data-off-count]").textContent = off.length;
  panel.querySelector("[data-off-total]").textContent = off.length;

  let groupBy = OFF_GROUPS[0];

  const card = (rec) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `offcard ${STATUS_CLASS[rec.status] || ""}`;

    if (rec.name_orig && rec.name_orig !== rec.name) {
      const o = document.createElement("div");
      o.className = "offcard__orig";
      o.textContent = rec.name_orig;
      b.appendChild(o);
    }
    const nm = document.createElement("div");
    nm.className = "offcard__name";
    nm.textContent = rec.name;
    b.appendChild(nm);

    const where = document.createElement("div");
    where.className = "offcard__where";
    where.textContent = [rec.city, rec.country].filter(Boolean).join(" · ");
    b.appendChild(where);

    const year = document.createElement("div");
    year.className = "offcard__year";
    year.textContent = rec.year_named && rec.year_renamed
      ? `${rec.year_named} — ${rec.year_renamed}`
      : rec.year_named ? `с ${rec.year_named}`
        : rec.year_renamed ? `имя снято в ${rec.year_renamed}`
          : (STATUS.find((s) => s.key === rec.status) || {}).label || "";
    b.appendChild(year);

    b.addEventListener("click", () => { setOpen(false); showCard(rec); });
    return b;
  };

  const render = () => {
    const groups = new Map();
    for (const rec of off) {
      const k = groupBy.of(rec);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(rec);
    }
    const sorted = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ru"));

    wall.replaceChildren();
    for (const [title, recs] of sorted) {
      const head = document.createElement("div");
      head.className = "offgroup__head";
      head.innerHTML = `<span class="offgroup__name">${title}</span>`
        + `<span class="offgroup__n">${recs.length}</span>`
        + '<span class="offgroup__line"></span>';
      wall.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "offcards";
      for (const rec of recs) grid.appendChild(card(rec));
      wall.appendChild(grid);
    }
    wall.scrollTop = 0;
  };

  tabs.replaceChildren();
  for (const g of OFF_GROUPS) {
    const b = document.createElement("button");
    b.className = "chip chip--tab";
    b.type = "button";
    b.textContent = g.label;
    b.setAttribute("aria-pressed", String(g === groupBy));
    b.addEventListener("click", () => {
      groupBy = g;
      [...tabs.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      render();
    });
    tabs.appendChild(b);
  }
  render();

  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-pressed", String(open));
  };
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  panel.querySelector(".offmap__close").addEventListener("click", () => setOpen(false));
  panel.addEventListener("click", (e) => { if (e.target === panel) setOpen(false); });
  return () => setOpen(false);
}

/* ------------------------------------------------------------------ запуск */

async function main() {
  const [corpus, geo, creditsData] = await Promise.all([
    fetch(CORPUS).then((r) => r.json()),
    fetch(COUNTRIES).then((r) => r.json()),
    fetch(CREDITS).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  credits = creditsData;
  prepareLand(geo);
  points = corpus.records.filter((r) => r.lat !== null && r.lng !== null);

  document.querySelector("[data-sub]").textContent =
    `${nf.format(points.length)} объектов из ${nf.format(corpus.records.length)} — `
    + `${new Set(points.map((p) => p.country)).size} стран. Цвет точки — судьба имени.`;

  const legendHost = document.querySelector("[data-legend]");
  buildLegend(legendHost);
  closeOffmapRef = buildOffmap(corpus.records);
  buildFilters(document.querySelector("[data-filters]"), legendHost);

  resize();
  bindInput();
  armIdleReset(resetView);
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  document.querySelector(".title").textContent = "Данные не загрузились";
});
