/* МТК 39 · «Гербарий улиц».
   Каждый лист — настоящая геометрия объекта из OpenStreetMap (data/mtk39-streets.json,
   собрано assets/mtk39/sources/tools/geocode.py). Никаких библиотек: проекция локальная,
   отрисовка — SVG-path.

   Масштаб у листов разный (каждый вписан в свою рамку) — поэтому на каждом листе
   стоит масштабная линейка, а под ней подпись длины: форма сравнивается глазом,
   размер читается по линейке. */

const SRC = "../data/mtk39-streets.json";

const C = {
  brass: "#d2b773",
  paper: "#f7f9ef",
  grey: "#9da3a8",
};

const NS = "http://www.w3.org/2000/svg";
const nf = new Intl.NumberFormat("ru-RU");

const el = (name, attrs = {}, parent = null) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(node);
  return node;
};

const fmtLen = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} км` : `${m} м`);

/* Локальная равнопромежуточная проекция: на масштабе улицы искажения нет,
   долгота сжимается по косинусу широты. */
function project(geometry) {
  const lat0 = geometry.reduce((a, p) => a + p[0], 0) / geometry.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  return geometry.map(([lat, lng]) => [lng * k, -lat]);
}

function fit(pts, w, h, pad) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const s = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const offX = (w - spanX * s) / 2 - minX * s;
  const offY = (h - spanY * s) / 2 - minY * s;
  return { pts: pts.map(([x, y]) => [x * s + offX, y * s + offY]), scale: s, spanX, spanY };
}

/* Сколько экранных единиц приходится на метр (для линейки). */
function unitsPerMeter(item, projected, fitted) {
  const lat0 = item.geometry.reduce((a, p) => a + p[0], 0) / item.geometry.length;
  const metersPerDegLat = 111320;
  // одна единица проекции по вертикали = 1° широты
  return (fitted.scale / metersPerDegLat) * 1;
  // (по горизонтали масштаб тот же: долгота уже умножена на cos(lat0))
}

const isClosed = (item) => item.geometry[0][0] === item.geometry.at(-1)[0]
  && item.geometry[0][1] === item.geometry.at(-1)[1];

function drawLeaf(item, w, h, { stroke = 2.2, pad = 10, ruler = true } = {}) {
  const s = el("svg", { viewBox: `0 0 ${w} ${h}`, role: "img" });
  s.setAttribute("aria-label", `${item.name}, ${item.city}`);
  const pts = project(item.geometry);
  const f = fit(pts, w, h, pad + (ruler ? 8 : 0));
  const closed = isClosed(item);

  const d = `M${f.pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L")}`;
  el("path", {
    d, fill: closed ? "rgba(210,183,115,0.12)" : "none",
    stroke: C.brass, "stroke-width": stroke,
    "stroke-linecap": "round", "stroke-linejoin": "round",
  }, s);

  if (ruler) {
    // линейка: круглая длина, влезающая примерно в треть ширины листа
    const upm = unitsPerMeter(item, pts, f);
    const target = (w / 3) / upm;
    const nice = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000]
      .reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    const len = Math.min(nice * upm, w - pad * 2);
    const y = h - 7;
    el("path", {
      d: `M${pad} ${y - 3}v3h${len}v-3`, fill: "none",
      stroke: "rgba(157,163,168,0.75)", "stroke-width": 1.2,
    }, s);
    const t = el("text", {
      x: pad + len + 6, y: y + 1.5, fill: "rgba(157,163,168,0.85)",
      "font-size": 9.5, "font-family": "20 Kopeek, monospace",
    }, s);
    t.textContent = nice >= 1000 ? `${nice / 1000} км` : `${nice} м`;
  }
  return s;
}

/* ------------------------------------------------------------------ стена */

function buildWall(items, wall, openSheet) {
  const frag = document.createDocumentFragment();
  for (const item of items) {
    const leaf = document.createElement("article");
    leaf.className = "leaf";
    leaf.tabIndex = 0;

    const plot = document.createElement("div");
    plot.className = "leaf__plot";
    plot.appendChild(drawLeaf(item, 200, 150));
    leaf.appendChild(plot);

    const name = document.createElement("div");
    name.className = "leaf__name";
    name.textContent = item.name_orig || item.name;
    leaf.appendChild(name);

    const where = document.createElement("div");
    where.className = "leaf__where";
    where.textContent = `${item.city.split(",")[0]} · ${item.country}`;
    leaf.appendChild(where);

    const len = document.createElement("div");
    len.className = "leaf__len";
    len.textContent = fmtLen(item.length_m);
    leaf.appendChild(len);

    leaf.addEventListener("click", () => openSheet(item, leaf));
    leaf.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSheet(item, leaf); }
    });
    frag.appendChild(leaf);
  }
  wall.replaceChildren(frag);
}

/* ------------------------------------------------------------------ карточка */

function makeSheet(data) {
  const sheet = document.getElementById("sheet");
  const plot = sheet.querySelector("[data-plot]");
  const orig = sheet.querySelector("[data-orig]");
  const name = sheet.querySelector("[data-name]");
  const where = sheet.querySelector("[data-where]");
  const facts = sheet.querySelector("[data-facts]");
  let active = null;

  const close = () => {
    sheet.hidden = true;
    if (active) active.classList.remove("is-active");
    active = null;
  };
  sheet.querySelector(".sheet__close").addEventListener("click", close);
  sheet.addEventListener("click", (e) => { if (e.target === sheet) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  return (item, leaf) => {
    if (active) active.classList.remove("is-active");
    active = leaf;
    leaf.classList.add("is-active");

    plot.replaceChildren(drawLeaf(item, 400, 300, { stroke: 3, pad: 24 }));
    orig.textContent = item.name_orig && item.name_orig !== item.name ? item.name_orig : "";
    name.textContent = item.name;
    where.textContent = `${item.city} · ${item.country}`;

    const rank = data.items.indexOf(item) + 1;
    const rows = [
      [isClosed(item) ? "периметр" : "длина", fmtLen(item.length_m)],
      ["место в своде", `${rank}-е из ${data.items.length} по протяжённости`],
      ["часть света", item.continent],
      ["объект OSM", `${item.osm.type} ${item.osm.id}`],
    ];
    facts.replaceChildren();
    for (const [k, v] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      facts.append(dt, dd);
    }
    sheet.hidden = false;
  };
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

/* ------------------------------------------------------------------ запуск */

async function main() {
  const data = await (await fetch(SRC)).json();
  const items = data.items;

  const totals = document.querySelector("[data-totals]");
  const totalKm = data.total_length_m / 1000;
  const countries = new Set(items.map((i) => i.country)).size;
  for (const [num, cap] of [
    [nf.format(items.length), "листов"],
    [`${totalKm.toFixed(1)} км`, "общая длина"],
    [countries, "стран"],
  ]) {
    const box = document.createElement("div");
    box.innerHTML = `<div class="total__num">${num}</div><div class="total__cap">${cap}</div>`;
    totals.appendChild(box);
  }

  const longest = items[0];
  const shortest = items.at(-1);
  document.querySelector("[data-legend]").textContent =
    `Самый длинный лист — «${longest.name}», ${longest.city.split(",")[0]}, `
    + `${fmtLen(longest.length_m)}. Самый короткий — ${fmtLen(shortest.length_m)}, `
    + `${shortest.city.split(",")[0]}. Листы отсортированы по длине.`;

  const wall = document.getElementById("wall");
  const openSheet = makeSheet(data);
  buildWall(items, wall, openSheet);
  armIdleReset(() => {
    document.querySelector(".sheet__close").click();
    wall.scrollTo({ left: 0, behavior: "smooth" });
  });
}

main().catch((e) => {
  console.error(e);
  document.querySelector(".title").textContent = "Данные не загрузились";
});
