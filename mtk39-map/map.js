/* МТК 39 · «Карта Союза».
   Та часть свода, что лежит в бывшем СССР, — крупным планом, с рубрикатором по
   республикам. Здесь и находится главный сюжет: имя ушло прежде всего оттуда,
   где его насаждали, и на этой карте перевес красного виден без пояснений.
   Мировая картина осталась в «Мире» — этот вариант намеренно смотрит внутрь.

   Проекция — общий канон проекта: MtkProjection.WinkelTripel из assets/shared/lib
   (порядок аргументов (lat, lng), аспект только из WT.ASPECT — своей математики нет).
   Мир считается целиком, а на экран берётся окно нужной республики: так масштаб
   и сетка остаются теми же, что в «Мире», и карты сопоставимы между собой. */

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

// 15 республик; названия в Natural Earth расходятся с музейными
const REPUBLIC_ISO = new Set([
  "RUS", "UKR", "BLR", "MDA", "LVA", "LTU", "EST",
  "GEO", "ARM", "AZE", "KAZ", "UZB", "TKM", "TJK", "KGZ",
]);
const NE_ALIAS = {
  Беларусь: "Белоруссия",
  Кыргызстан: "Киргизия",
  Туркменистан: "Туркмения",
  Молдавия: "Молдова",
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 26;
const FLY_MS = 800;

let credits = {};
let closeOffmapRef = () => {};

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
// Кап буфера рендера: на 4K с DPR 2 канвас был бы 33 Мп — держим бюджет ~8.3 Мп
// (задача координатора по итогам 4K-смоука 2026-07-22).
const PIXEL_BUDGET = 8.3e6;
function capDpr() {
  const raw = window.devicePixelRatio || 1;
  return Math.max(1, Math.min(raw, 2,
    Math.sqrt(PIXEL_BUDGET / Math.max(1, window.innerWidth * window.innerHeight))));
}

// Кегли и метки на канвасе заданы в пикселях под ~1600 px ширины — на 49" 4K
// их надо укрупнять пропорционально, иначе получается микротекст.
const uiScale = () => Math.max(1, Math.min(2.6, window.innerWidth / 1600));
let dpr = capDpr();
const nf = new Intl.NumberFormat("ru-RU");

let width = 0;
let height = 0;
let baseW = 0;             // ширина мира при zoom = 1
let zoom = 1;
let panX = 0;
let panY = 0;
let land = [];             // контуры пятнадцати республик
let unionBox = null;       // общая рамка Союза, считается из контуров
let bboxes = new Map();    // название страны → географический bbox
let points = [];
let visible = [];
let selected = null;
let statusFilter = "all";
let republic = null;       // null = весь Союз
let needsDraw = true;
let fly = null;

/* ------------------------------------------------------------------ раскладка */

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = capDpr();
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  baseW = Math.min(width * 0.98, height * 0.8 * WT.ASPECT);
  clampPan();
  needsDraw = true;
}

const worldW = () => baseW * zoom;
const worldH = () => worldW() / WT.ASPECT;
const originX = () => (width - worldW()) / 2 + panX;
const originY = () => (height - worldH()) / 2 + panY;

function clampPan() {
  const limX = Math.max(0, (worldW() - width) / 2 + width * 0.2);
  const limY = Math.max(0, (worldH() - height) / 2 + height * 0.2);
  panX = Math.max(-limX, Math.min(limX, panX));
  panY = Math.max(-limY, Math.min(limY, panY));
}

function project(lat, lng) {
  const p = WT.project(lat, lng, worldW(), worldH());
  return [p.x + originX(), p.y + originY()];
}

/* Приближение к географическому bbox: считаем нужный масштаб и сдвиг так,
   чтобы область заняла экран с полями под рубрикатор слева. */
/* box — доли мира [minX, minY, maxX, maxY], посчитанные по самим контурам.
   Вписываем в свободное поле справа от рубрикатора. */
function viewFor(box) {
  const baseH = baseW / WT.ASPECT;
  const w = Math.max(1e-6, (box[2] - box[0]) * baseW);
  const h = Math.max(1e-6, (box[3] - box[1]) * baseH);

  const rail = document.querySelector(".rail").getBoundingClientRect();
  const x0 = rail.right + width * 0.02;
  const x1 = width * 0.985;
  const y0 = height * 0.05;
  const y1 = height * 0.88;
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((x1 - x0) / w, (y1 - y0) / h)));
  const cx = ((box[0] + box[2]) / 2) * baseW;
  const cy = ((box[1] + box[3]) / 2) * baseH;
  return {
    zoom: z,
    panX: (x0 + x1) / 2 - (width - baseW * z) / 2 - cx * z,
    panY: (y0 + y1) / 2 - (height - baseH * z) / 2 - cy * z,
  };
}

function flyTo(view, instant) {
  if (instant) {
    // первый кадр киоска должен открыться уже наведённым на Союз,
    // а не доезжать анимацией
    ({ zoom, panX, panY } = view);
    fly = null;
    needsDraw = true;
    return;
  }
  fly = { from: { zoom, panX, panY }, to: view, t0: performance.now() };
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

function stepFly(now) {
  if (!fly) return;
  const t = Math.min(1, (now - fly.t0) / FLY_MS);
  const k = easeInOut(t);
  zoom = fly.from.zoom + (fly.to.zoom - fly.from.zoom) * k;
  panX = fly.from.panX + (fly.to.panX - fly.from.panX) * k;
  panY = fly.from.panY + (fly.to.panY - fly.from.panY) * k;
  if (t >= 1) fly = null;
  needsDraw = true;
}

/* ------------------------------------------------------------------ данные */

function prepareLand(geo) {
  land = [];
  bboxes = new Map();
  unionBox = null;
  for (const f of geo.features) {
    const iso = f.properties.ISO_A3 || f.properties.ADM0_A3;
    const name = f.properties.NAME_RU;
    const ussr = REPUBLIC_ISO.has(iso);
    if (!ussr) continue;          // разговор только про Союз — остальной мир не рисуем
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates]
      : g.type === "MultiPolygon" ? g.coordinates : [];
    let box = null;
    for (const poly of polys) {
      for (const ring of poly) {
        if (ring.length < 4) continue;
        land.push({ ring });
        for (const [lng, lat] of ring) {
          // Чукотка уходит за антимеридиан и растянула бы рамку России на весь мир —
          // считаем только по восточному полушарию
          if (lng < 0) continue;
          const q = WT.project(lat, lng, 1, 1);     // доли мира, независимо от масштаба
          box = box
            ? [Math.min(box[0], q.x), Math.min(box[1], q.y),
              Math.max(box[2], q.x), Math.max(box[3], q.y)]
            : [q.x, q.y, q.x, q.y];
        }
      }
    }
    if (name && box) bboxes.set(name, box);
    if (box) {
      unionBox = unionBox
        ? [Math.min(unionBox[0], box[0]), Math.min(unionBox[1], box[1]),
          Math.max(unionBox[2], box[2]), Math.max(unionBox[3], box[3])]
        : box.slice();
    }
  }
}

const bboxOf = (country) => bboxes.get(NE_ALIAS[country] || country) || null;
const shown = (p) => (statusFilter === "all" || p.status === statusFilter)
  && (!republic || p.country === republic);

/* ------------------------------------------------------------------ отрисовка */

function drawLand() {
  ctx.beginPath();
  for (const item of land) {
    let started = false;
    let prevX = 0;
    for (const [lng, lat] of item.ring) {
      const [x, y] = project(lat, lng);
      if (started && Math.abs(x - prevX) > worldW() * 0.5) started = false;
      if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
      prevX = x;
    }
  }
  ctx.fillStyle = "rgba(96, 104, 92, 0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(210, 183, 115, 0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function render() {
  ctx.clearRect(0, 0, width, height);
  drawLand();

  visible = [];
  const r = Math.max(2, Math.min(6, 2.4 * Math.sqrt(zoom))) * uiScale();
  for (const pass of [false, true]) {
    for (const p of points) {
      if (shown(p) !== pass) continue;
      const [x, y] = project(p.lat, p.lng);
      if (x < -40 || x > width + 40 || y < -40 || y > height + 40) continue;
      if (pass) visible.push({ p, x, y });
      ctx.beginPath();
      ctx.arc(x, y, pass ? r : r * 0.65, 0, Math.PI * 2);
      ctx.fillStyle = pass ? COLOR.get(p.status) : "rgba(157, 163, 168, 0.16)";
      ctx.globalAlpha = pass ? 0.92 : 1;
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
  }
}

function frame(now) {
  stepFly(now);
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
  const wx = (cx - originX()) / worldW();
  const wy = (cy - originY()) / worldH();
  zoom = next;
  panX = cx - (width - worldW()) / 2 - wx * worldW();
  panY = cy - (height - worldH()) / 2 - wy * worldH();
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
    fly = null;
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
  canvas.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    if (moved < 6) showCard(pick(e.clientX, e.clientY));
  });
  canvas.addEventListener("pointercancel", () => { dragging = false; });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    fly = null;
    zoomAt(e.deltaY < 0 ? 1.14 : 1 / 1.14, e.clientX, e.clientY);
    touched();
  }, { passive: false });

  let pinch = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) { dragging = false; fly = null; pinch = dist(e.touches); }
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

function buildRepublics(host, all, legendHost, subHost) {
  const counts = new Map();
  for (const r of all) counts.set(r.country, (counts.get(r.country) || 0) + 1);
  const list = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  let first = true;
  const setRepublic = (name, btn) => {
    republic = name;
    showCard(null);
    [...host.children].forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
    buildLegend(legendHost);
    const box = (name ? bboxOf(name) : unionBox) || unionBox;
    flyTo(viewFor(box), first);
    first = false;
    const inCorpus = all.filter((r) => !name || r.country === name).length;
    const onMap = points.filter(shown).length;
    subHost.textContent = name
      // в рубрикаторе — все записи республики, на карте — только те, что удалось
      // привязать к точке; разницу проговариваем, чтобы числа не спорили
      ? `${name}: ${nf.format(inCorpus)} ${plural(inCorpus, "объект", "объекта", "объектов")} свода, `
        + `${nf.format(onMap)} на карте.`
      : `${nf.format(inCorpus)} ${plural(inCorpus, "объект", "объекта", "объектов")} `
        + "в пятнадцати республиках. Цвет точки — судьба имени.";
    invalidate();
  };

  host.replaceChildren();
  const all_ = document.createElement("button");
  all_.className = "republic";
  all_.type = "button";
  all_.setAttribute("aria-pressed", "true");
  all_.innerHTML = `<span>Весь Союз</span><span class="republic__n">${nf.format(all.length)}</span>`;
  all_.addEventListener("click", () => setRepublic(null, all_));
  host.appendChild(all_);

  for (const [name, n] of list) {
    if (n < 3) continue;                 // единичные «Абхазия», «Россия / Украина» — в картотеке
    const b = document.createElement("button");
    b.className = "republic";
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<span>${name}</span><span class="republic__n">${nf.format(n)}</span>`;
    b.addEventListener("click", () => setRepublic(name, b));
    host.appendChild(b);
  }
  return () => setRepublic(null, all_);
}

function buildFilters(host, legendHost) {
  const opts = [["all", "все"], ...STATUS.map((s) => [s.key, s.label])];
  host.replaceChildren();
  for (const [key, label] of opts) {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(key === statusFilter));
    b.addEventListener("click", () => {
      statusFilter = key;
      [...host.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      showCard(null);
      buildLegend(legendHost);
      invalidate();
    });
    host.appendChild(b);
  }
}

const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

/* ------------------------------------------------------------ не на карте

   Часть записей свода не удалось привязать к точке: кириллические транслитерации
   чужих топонимов не ищутся, а часть объектов точки не имеет в принципе (премия,
   комсомол, послание в космос). Они не пропадают молча — открываются полноценной
   картотекой с теми же карточками, что и у точек, и с перегруппировкой. */

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
  { key: "country", label: "по республике", of: (r) => r.country || "—" },
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

  const card_ = (rec) => {
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

  const render_ = () => {
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
      for (const rec of recs) grid.appendChild(card_(rec));
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
      render_();
    });
    tabs.appendChild(b);
  }
  render_();

  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-pressed", String(open));
  };
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  panel.querySelector(".offmap__close").addEventListener("click", () => setOpen(false));
  panel.addEventListener("click", (e) => { if (e.target === panel) setOpen(false); });
  return () => setOpen(false);
}

/* ------------------------------------------------------------------ простой

   Музейный киоск: посетитель ушёл, оставив выбранную республику и зум, —
   следующий подходит к чужому экрану. */

const IDLE_RESET_MS = 75000;
let idleTimer = null;
let resetRepublicRef = () => {};

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
  showCard(null);
  closeOffmapRef();
  const legendHost = document.querySelector("[data-legend]");
  buildFilters(document.querySelector("[data-filters]"), legendHost);
  resetRepublicRef();
  document.querySelector("[data-hint]").classList.remove("is-off");
  invalidate();
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

  const union = corpus.records.filter((r) => r.continent === "Бывший СССР");
  points = union.filter((r) => r.lat !== null && r.lng !== null);

  const legendHost = document.querySelector("[data-legend]");
  const subHost = document.querySelector("[data-sub]");
  buildLegend(legendHost);
  buildFilters(document.querySelector("[data-filters]"), legendHost);

  resize();
  resetRepublicRef = buildRepublics(
    document.querySelector("[data-republics]"), union, legendHost, subHost,
  );
  resetRepublicRef();
  closeOffmapRef = buildOffmap(union);
  bindInput();
  armIdleReset(resetView);
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  document.querySelector(".title").textContent = "Данные не загрузились";
});
