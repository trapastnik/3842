/* МТК 39 · сцена «Гербарий улиц».
 * Каждый лист — настоящая геометрия объекта из OpenStreetMap
 * (data/mtk39-streets.json, собрано assets/mtk39/sources/tools/geocode.py).
 * Без библиотек: проекция локальная, отрисовка — SVG-path.
 *
 * Масштаб у листов разный (каждый вписан в свою рамку) — поэтому на каждом
 * листе стоит масштабная линейка: форма сравнивается глазом, размер читается
 * по линейке. */

import { DATA, nf, esc } from "./shared.js?v=3";

const NS = "http://www.w3.org/2000/svg";
const DEFAULTS = { leafW: 380, stroke: 2.6 };

const fmtLen = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} км` : `${m} м`);

const svgEl = (name, attrs = {}, parent = null) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(node);
  return node;
};

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
  return { pts: pts.map(([x, y]) => [x * s + offX, y * s + offY]), scale: s };
}

const isClosed = (item) => item.geometry[0][0] === item.geometry.at(-1)[0]
  && item.geometry[0][1] === item.geometry.at(-1)[1];

function drawLeaf(item, w, h, { stroke = 2.2, pad = 10, ruler = true } = {}) {
  const s = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, role: "img" });
  s.setAttribute("aria-label", `${item.name}, ${item.city}`);
  const pts = project(item.geometry);
  const f = fit(pts, w, h, pad + (ruler ? 8 : 0));

  const d = `M${f.pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L")}`;
  svgEl("path", {
    d, fill: isClosed(item) ? "rgba(210,183,115,0.12)" : "none",
    stroke: "#d2b773", "stroke-width": stroke,
    "stroke-linecap": "round", "stroke-linejoin": "round",
  }, s);

  if (ruler) {
    // линейка: круглая длина, влезающая примерно в треть ширины листа.
    // Одна единица проекции по вертикали = 1° широты; по горизонтали масштаб
    // тот же — долгота уже умножена на cos(lat0).
    const upm = f.scale / 111320;
    const target = (w / 3) / upm;
    const nice = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000]
      .reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    const len = Math.min(nice * upm, w - pad * 2);
    const y = h - 7;
    svgEl("path", {
      d: `M${pad} ${y - 3}v3h${len}v-3`, fill: "none",
      stroke: "rgba(157,163,168,0.75)", "stroke-width": 1.2,
    }, s);
    const t = svgEl("text", {
      x: pad + len + 6, y: y + 1.5, fill: "rgba(157,163,168,0.85)",
      "font-size": 9.5, "font-family": "20 Kopeek, monospace",
    }, s);
    t.textContent = nice >= 1000 ? `${nice / 1000} км` : `${nice} м`;
  }
  return s;
}

export const streetsScene = {
  id: "streets",
  title: { ru: "Гербарий улиц", en: "Herbarium of streets", zh: "街道标本册" },
  keepAlive: true,

  preload: {
    data: { streets: DATA.streets },
    // Канва не запускает загрузку шрифта сама (находка 40 ядра), а рисует
    // подписи начертанием 600 — просим его явно. Ядро грузит список один раз
    // на приложение, так что дубли в сценах ничего не стоят.
    fonts: ["1em '20 Kopeek'", "600 1em '20 Kopeek'", "1em 'Nolde'", "1em '21 Cent'"],
  },

  settings: [
    { key: "leafW", label: { ru: "Ширина листа", en: "Leaf width", zh: "标本宽度" },
      type: "range", min: 200, max: 640, step: 10, unit: " px", default: 380 },
    { key: "stroke", label: { ru: "Толщина линии", en: "Stroke width", zh: "线条粗细" },
      type: "range", min: 1, max: 6, step: 0.2, unit: " px", default: 2.6 },
  ],

  opt: Object.assign({}, DEFAULTS),

  applySettings(values) {
    this.opt = Object.assign({}, DEFAULTS, values || {});
    if (this.api) this.api.rebuild();
  },

  mount(el, ctx) {
    const scene = this;
    const app = ctx.app;
    const data = ctx.data.streets;
    const items = data.items;

    el.classList.add("m39-scene", "m39-streets");
    el.innerHTML =
      '<header class="m39-head m39-head--row">' +
        '<div><h1 class="m39-title"></h1><p class="m39-sub"></p></div>' +
        '<div class="m39-totals"></div>' +
      "</header>" +
      '<div class="m39-wall kiosk-scroll" aria-label="Листы гербария"></div>' +
      '<footer class="m39-foot"><span class="m39-foot__legend"></span>' +
        '<span class="m39-foot__src"></span></footer>' +
      '<div class="m39-sheet" hidden><div class="m39-sheet__box">' +
        '<button class="m39-sheet__close kiosk-target" type="button">✕</button>' +
        '<div class="m39-sheet__plot"></div>' +
        '<div class="m39-sheet__meta"><div class="m39-sheet__orig"></div>' +
        '<h2 class="m39-sheet__name"></h2><p class="m39-sheet__where"></p>' +
        '<dl class="m39-sheet__facts"></dl></div></div></div>';

    const title = el.querySelector(".m39-title");
    const sub = el.querySelector(".m39-sub");
    const totals = el.querySelector(".m39-totals");
    const wall = el.querySelector(".m39-wall");
    const footLegend = el.querySelector(".m39-foot__legend");
    const footSrc = el.querySelector(".m39-foot__src");
    const sheet = el.querySelector(".m39-sheet");
    const sheetClose = el.querySelector(".m39-sheet__close");
    const sheetPlot = el.querySelector(".m39-sheet__plot");
    const sheetOrig = el.querySelector(".m39-sheet__orig");
    const sheetName = el.querySelector(".m39-sheet__name");
    const sheetWhere = el.querySelector(".m39-sheet__where");
    const sheetFacts = el.querySelector(".m39-sheet__facts");

    let activeLeaf = null;
    let sheetOpen = false;

    function closeSheet() {
      if (!sheetOpen) return;
      sheetOpen = false;
      sheet.hidden = true;
      if (activeLeaf) activeLeaf.classList.remove("is-active");
      activeLeaf = null;
    }

    function openSheet(item, leaf) {
      if (activeLeaf) activeLeaf.classList.remove("is-active");
      activeLeaf = leaf;
      leaf.classList.add("is-active");

      sheetPlot.replaceChildren(drawLeaf(item, 400, 300, {
        stroke: (scene.opt.stroke || DEFAULTS.stroke) * 1.4, pad: 24,
      }));
      sheetOrig.textContent = item.name_orig && item.name_orig !== item.name ? item.name_orig : "";
      sheetName.textContent = item.name;
      sheetWhere.textContent = `${item.city} · ${item.country}`;

      const rank = items.indexOf(item) + 1;
      const rows = [
        [app.t(isClosed(item) ? "streets.perimeter" : "streets.lengthLabel"), fmtLen(item.length_m)],
        [app.t("streets.rank"), app.t("streets.rankValue", { n: rank, total: items.length })],
        [app.t("card.continent"), item.continent],
        ["OSM", `${item.osm.type} ${item.osm.id}`],
      ];
      sheetFacts.replaceChildren();
      for (const [k, v] of rows) {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        sheetFacts.append(dt, dd);
      }
      sheet.hidden = false;
      sheetOpen = true;
    }

    function buildWall() {
      const w = scene.opt.leafW || DEFAULTS.leafW;
      const h = Math.round(w * 0.75);
      const frag = document.createDocumentFragment();
      for (const item of items) {
        const leaf = document.createElement("article");
        leaf.className = "m39-leaf kiosk-target";
        leaf.tabIndex = 0;
        leaf.style.setProperty("--leaf-w", w + "px");

        const plot = document.createElement("div");
        plot.className = "m39-leaf__plot";
        plot.appendChild(drawLeaf(item, w, h, { stroke: scene.opt.stroke || DEFAULTS.stroke }));
        leaf.appendChild(plot);

        const name = document.createElement("div");
        name.className = "m39-leaf__name";
        name.textContent = item.name_orig || item.name;
        leaf.appendChild(name);

        const where = document.createElement("div");
        where.className = "m39-leaf__where";
        where.textContent = `${item.city.split(",")[0]} · ${item.country}`;
        leaf.appendChild(where);

        const len = document.createElement("div");
        len.className = "m39-leaf__len";
        len.textContent = fmtLen(item.length_m);
        leaf.appendChild(len);

        leaf.addEventListener("click", () => openSheet(item, leaf));
        leaf.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSheet(item, leaf); }
        });
        frag.appendChild(leaf);
      }
      wall.replaceChildren(frag);
      wall.scrollLeft = 0;
    }

    function retext() {
      title.textContent = app.t("streets.title");
      sub.textContent = app.t("streets.sub");
      footSrc.textContent = app.t("streets.source");

      const totalKm = data.total_length_m / 1000;
      const countries = new Set(items.map((i) => i.country)).size;
      totals.replaceChildren();
      for (const [num, key] of [
        [nf.format(items.length), "streets.leaves"],
        [`${totalKm.toFixed(1)} км`, "streets.length"],
        [countries, "streets.countries"],
      ]) {
        const box = document.createElement("div");
        box.className = "m39-total";
        box.innerHTML = '<div class="m39-total__num">' + esc(num) + "</div>" +
          '<div class="m39-total__cap">' + esc(app.t(key)) + "</div>";
        totals.appendChild(box);
      }

      const longest = items[0];
      const shortest = items.at(-1);
      footLegend.textContent = app.t("streets.foot", {
        name: longest.name,
        city: longest.city.split(",")[0],
        max: fmtLen(longest.length_m),
        min: fmtLen(shortest.length_m),
        minCity: shortest.city.split(",")[0],
      });
      sheetClose.setAttribute("aria-label", app.t("card.close"));
    }

    const onClose = () => closeSheet();
    const onBackdrop = (e) => { if (e.target === sheet) closeSheet(); };
    sheetClose.addEventListener("click", onClose);
    sheet.addEventListener("click", onBackdrop);

    this.api = {
      rebuild: buildWall,
      retext() { retext(); buildWall(); },
      reset() {
        closeSheet();
        wall.scrollTo({ left: 0, behavior: "auto" });
      },
      health() {
        const leaves = wall.querySelectorAll(".m39-leaf").length;
        const paths = wall.querySelectorAll(".m39-leaf__plot svg path").length;
        if (!leaves) return { ok: false, detail: "ни одного листа в стене" };
        if (!paths) return { ok: false, detail: "листы есть, но геометрия не отрисована" };
        return { ok: true, detail: "листов " + leaves + ", линий " + paths };
      },
      destroy() {
        closeSheet();
        sheetClose.removeEventListener("click", onClose);
        sheet.removeEventListener("click", onBackdrop);
      },
    };

    retext();
    buildWall();
  },

  reset() { if (this.api) this.api.reset(); },
  setLang() { if (this.api) this.api.retext(); },
  setA11y() { if (this.api) this.api.rebuild(); },

  healthcheck() {
    return this.api ? this.api.health() : { ok: false, detail: "сцена не смонтирована" };
  },

  unmount() {
    if (this.api) this.api.destroy();
    this.api = null;
  },
};
