/* МТК 39 · сцена «Имени Ленина — свод в цифрах».
 * Горизонтальный стори по data/mtk39-corpus.json: семь экранов, свайп вправо.
 * Без зависимостей — SVG собирается вручную, тяжёлая масса точек на canvas.
 *
 * Правила отображения данных:
 *  · величина — латунь (одна краска, длина решает);
 *  · «имя ушло» — сигнальный красный, «утрачено» — серый; цвет всегда
 *    продублирован подписью, соседние сегменты разделены зазором;
 *  · ни одной диаграммы с двумя шкалами. */

import { DATA, KIND_KEY, nf, esc, plural, capDpr, sizeWatch } from "./shared.js?v=4";

const NS = "http://www.w3.org/2000/svg";
const W = 1000;   // ширина системы координат svg; высота у каждого графика своя

const C = {
  brass: "#d2b773",
  red: "#c9545a",
  grey: "#9da3a8",
  greyDim: "rgba(157, 163, 168, 0.34)",
};

const DEFAULTS = { screens: "all" };

const el = (name, attrs = {}, parent = null) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(node);
  return node;
};

const svg = (host, height) => {
  host.replaceChildren();
  return el("svg", { viewBox: `0 0 ${W} ${height}`, role: "img" }, host);
};

const countBy = (items, key) => {
  const m = new Map();
  for (const it of items) {
    const k = typeof key === "function" ? key(it) : it[key];
    if (k === null || k === undefined || k === "—") continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

/* Скруглены только «растущие» концы: основание полосы остаётся на оси. */
function barRow(g, { x, y, w, h, fill, radius = 4 }) {
  const r = Math.min(radius, w);
  const d = w <= r
    ? `M${x} ${y}h${w}v${h}h${-w}z`
    : `M${x} ${y}h${w - r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - r)}z`;
  return el("path", { d, fill }, g);
}

function legendBox(items) {
  const box = document.createElement("div");
  box.className = "m39-chartlegend";
  for (const [color, text] of items) {
    const item = document.createElement("span");
    item.className = "m39-chartlegend__item";
    item.innerHTML = '<span class="m39-chartlegend__swatch" style="background:' + color +
      '"></span>' + esc(text);
    box.appendChild(item);
  }
  return box;
}

function noteBox(text) {
  const p = document.createElement("p");
  p.className = "m39-chart__note";
  p.textContent = text;
  return p;
}

export const statsScene = {
  id: "stats",
  title: { ru: "Свод в цифрах", en: "The corpus in numbers", zh: "数据中的名录" },
  keepAlive: true,

  preload: {
    data: { corpus: DATA.corpus },
    // Канва не запускает загрузку шрифта сама (находка 40 ядра), а рисует
    // подписи начертанием 600 — просим его явно. Ядро грузит список один раз
    // на приложение, так что дубли в сценах ничего не стоят.
    fonts: ["1em '20 Kopeek'", "600 1em '20 Kopeek'", "1em 'Nolde'", "1em '21 Cent'"],
  },

  opt: Object.assign({}, DEFAULTS),
  applySettings(values) { this.opt = Object.assign({}, DEFAULTS, values || {}); },

  mount(el_, ctx) {
    const app = ctx.app;
    const data = ctx.data.corpus;
    const R = data.records;

    const SCREENS = [
      { key: "title" }, { key: "where" }, { key: "countries" },
      { key: "kinds" }, { key: "wave" }, { key: "fate" }, { key: "mass" },
    ];

    el_.classList.add("m39-scene", "m39-stats");
    el_.innerHTML =
      '<div class="m39-scroll kiosk-scroll">' +
      SCREENS.map((s, i) =>
        '<section class="m39-screen m39-screen--' + s.key + '" data-screen="' + i + '">' +
        '<div class="m39-screen__text">' +
          (i === 0
            ? '<h1 class="m39-display"></h1><p class="m39-lede"></p><p class="m39-srcnote"></p>'
            : '<h2 class="m39-screen__head"></h2><p class="m39-screen__sub"></p>' +
              '<p class="m39-screen__foot"></p>') +
        "</div>" +
        '<div class="m39-screen__vis">' +
          (i === 0 ? '<div class="m39-hero"></div>'
            : s.key === "mass" ? '<canvas class="m39-mass"></canvas>'
              : '<div class="m39-chart"></div>') +
        "</div></section>").join("") +
      "</div>" +
      '<nav class="m39-dots" aria-label="Экраны"></nav>';

    const scroll = el_.querySelector(".m39-scroll");
    const dots = el_.querySelector(".m39-dots");
    const screens = [...el_.querySelectorAll(".m39-screen")];
    const massCanvas = el_.querySelector(".m39-mass");

    const at = (i) => screens[i];
    const vis = (i, sel) => at(i).querySelector(sel);

    /* ---- 0. титул ---- */
    function renderHero() {
      const host = vis(0, ".m39-hero");
      const stats = [
        [nf.format(R.length), "stats.hero.records"],
        [new Set(R.map((r) => r.country)).size, "stats.hero.countries"],
        [nf.format(new Set(R.map((r) => r.city).filter(Boolean)).size), "stats.hero.places"],
        [nf.format(data.russia_summary.total_all), "stats.hero.streets"],
      ];
      host.replaceChildren();
      for (const [num, key] of stats) {
        const item = document.createElement("div");
        item.className = "m39-hero__item";
        item.innerHTML = '<div class="m39-hero__num">' + esc(num) + "</div>" +
          '<div class="m39-hero__cap">' + esc(app.t(key)) + "</div>";
        host.appendChild(item);
      }
    }

    /* ---- 1. континенты ---- */
    function renderContinents() {
      const host = vis(1, ".m39-chart");
      const foot = vis(1, ".m39-screen__foot");
      const rows = countBy(R, "continent");
      const max = rows[0][1];
      const rowH = 68;
      const labelW = 300;
      const barW = W - labelW - 90;
      const s = svg(host, rows.length * rowH + 20);

      rows.forEach(([name, n], i) => {
        const y = i * rowH + 8;
        el("text", { x: labelW - 22, y: y + 34, "text-anchor": "end",
          class: "m39-t-label", "font-size": 27 }, s).textContent = name;
        el("rect", { x: labelW, y: y + 10, width: barW, height: 34,
          fill: "rgba(247,249,239,0.05)" }, s);
        const w = Math.round((n / max) * barW);
        barRow(s, { x: labelW, y: y + 10, w, h: 34, fill: C.brass });
        el("text", { x: labelW + w + 16, y: y + 34, class: "m39-t-value",
          "font-size": 27 }, s).textContent = nf.format(n);
      });

      const world = R.filter((r) => r.continent !== "Бывший СССР").length;
      foot.textContent = app.t("stats.foot.where", {
        n: world, word: plural(world, "объект", "объекта", "объектов"),
      });
    }

    /* ---- 2. страны ---- */
    function renderCountries() {
      const host = vis(2, ".m39-chart");
      const foot = vis(2, ".m39-screen__foot");
      const all = countBy(R, "country");
      const rows = all.slice(0, 20);
      const max = rows[0][1];
      const perCol = 10;
      const rowH = 46;
      const colW = W / 2;
      const labelW = 190;
      const barW = colW - labelW - 90;
      const s = svg(host, perCol * rowH + 16);

      rows.forEach(([name, n], i) => {
        const x0 = Math.floor(i / perCol) * colW;
        const y = (i % perCol) * rowH + 6;
        el("text", { x: x0 + labelW - 18, y: y + 26, "text-anchor": "end",
          class: "m39-t-label", "font-size": 24 }, s).textContent = name;
        const w = Math.max(2, Math.round((n / max) * barW));
        barRow(s, { x: x0 + labelW, y: y + 8, w, h: 24, fill: C.brass });
        el("text", { x: x0 + labelW + w + 14, y: y + 26, class: "m39-t-value",
          "font-size": 23 }, s).textContent = nf.format(n);
      });

      const tail = all.length - rows.length;
      const tailSum = all.slice(20).reduce((a, [, n]) => a + n, 0);
      foot.textContent = app.t("stats.foot.countries", {
        tail, tailWord: plural(tail, "страна", "страны", "стран"),
        sum: tailSum, sumWord: plural(tailSum, "запись", "записи", "записей"),
      });
    }

    /* ---- 3. типы объектов ---- */
    function renderKinds() {
      const host = vis(3, ".m39-chart");
      const foot = vis(3, ".m39-screen__foot");
      const world = R.filter((r) => r.src === "world");
      const ussr = R.filter((r) => r.src === "ussr");
      const wc = new Map(countBy(world, "kind"));
      const uc = new Map(countBy(ussr, "kind"));
      const kinds = countBy(R, "kind").filter(([k]) => k !== "прочее").slice(0, 10).map(([k]) => k);

      // доли внутри своего свода: сравниваем состав, а не объём (своды разного
      // размера, и «улиц» за границей столько, что прочее схлопнулось бы)
      const shareW = (k) => (wc.get(k) || 0) / world.length;
      const shareU = (k) => (uc.get(k) || 0) / ussr.length;
      const max = Math.max(...kinds.map((k) => Math.max(shareW(k), shareU(k))));
      const rowH = 50;
      const mid = W / 2;
      const gap = 380;              // окно под подпись категории
      const half = mid - gap / 2 - 74;
      const s = svg(host, kinds.length * rowH + 60);

      el("text", { x: mid - gap / 2 - 6, y: 22, "text-anchor": "end",
        class: "m39-t-mute", "font-size": 22 }, s).textContent = app.t("stats.outside");
      el("text", { x: mid + gap / 2 + 6, y: 22, class: "m39-t-mute",
        "font-size": 22 }, s).textContent = app.t("stats.inside");

      const pct = (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

      kinds.forEach((k, i) => {
        const y = 46 + i * rowH;
        const w = wc.get(k) || 0;
        const u = uc.get(k) || 0;
        const lw = Math.round((shareW(k) / max) * half);
        const uw = Math.round((shareU(k) / max) * half);

        el("text", { x: mid, y: y + 18, "text-anchor": "middle", class: "m39-t-label",
          "font-size": 21 }, s).textContent = KIND_KEY[k] ? app.t(KIND_KEY[k]) : k;

        if (lw > 0) {
          const g = el("g", { transform: `translate(${mid - gap / 2},0) scale(-1,1)` }, s);
          barRow(g, { x: 0, y: y + 2, w: lw, h: 20, fill: C.brass });
        }
        if (uw > 0) barRow(s, { x: mid + gap / 2, y: y + 2, w: uw, h: 20, fill: C.grey });

        if (w) {
          el("text", { x: mid - gap / 2 - lw - 12, y: y + 18, "text-anchor": "end",
            class: "m39-t-value", "font-size": 20 }, s)
            .textContent = `${pct(shareW(k))} · ${w}`;
        }
        if (u) {
          el("text", { x: mid + gap / 2 + uw + 12, y: y + 18, class: "m39-t-value",
            "font-size": 20, style: `fill:${C.grey}` }, s)
            .textContent = `${pct(shareU(k))} · ${u}`;
        }
      });

      host.appendChild(legendBox([
        [C.brass, app.t("stats.kinds.legendWorld", { n: world.length })],
        [C.grey, app.t("stats.kinds.legendUssr", { n: ussr.length })],
      ]));
      host.appendChild(noteBox(app.t("stats.kinds.note")));

      const streets = world.filter((r) =>
        ["улица", "проспект", "площадь", "переулок"].includes(r.kind)).length;
      foot.textContent = app.t("stats.foot.kinds", {
        share: Math.round((streets / world.length) * 100),
      });
    }

    /* ---- 4. волна по годам ---- */
    function renderYears() {
      const host = vis(4, ".m39-chart");
      const foot = vis(4, ".m39-screen__foot");
      const FROM = 1900;
      const TO = 2025;
      const STEP = 5;
      const bins = [];
      for (let y = FROM; y <= TO; y += STEP) bins.push({ y, named: 0, renamed: 0 });
      const idx = (y) => Math.floor((Math.min(Math.max(y, FROM), TO) - FROM) / STEP);

      let withYear = 0;
      for (const r of R) {
        if (r.year_named || r.year_renamed) withYear += 1;
        if (r.year_named) bins[idx(r.year_named)].named += 1;
        if (r.year_renamed) bins[idx(r.year_renamed)].renamed += 1;
      }

      const max = Math.max(...bins.map((b) => Math.max(b.named, b.renamed)));
      const height = 520;
      const axis = height / 2;
      const padL = 34;
      const plotW = W - padL * 2;
      const scale = (v) => (v / max) * (axis - 58);
      const x = (i) => padL + (i / (bins.length - 1)) * plotW;
      const s = svg(host, height);

      for (let y = 1900; y <= 2020; y += 20) {
        const gx = padL + ((y - FROM) / (TO - FROM)) * plotW;
        el("line", { x1: gx, y1: 40, x2: gx, y2: height - 40,
          stroke: "rgba(247,249,239,0.07)", "stroke-width": 1 }, s);
        el("text", { x: gx, y: height - 14, "text-anchor": "middle",
          class: "m39-t-axis", "font-size": 21 }, s).textContent = y;
      }

      const area = (key, dir, fill, stroke) => {
        const pts = bins.map((b, i) => `${x(i)},${axis + dir * scale(b[key])}`);
        el("path", { d: `M${padL},${axis} L${pts.join(" L")} L${padL + plotW},${axis} Z`,
          fill, stroke: "none" }, s);
        el("path", { d: `M${pts.join(" L")}`, fill: "none", stroke,
          "stroke-width": 2, "stroke-linejoin": "round" }, s);
      };
      area("named", -1, "rgba(210,183,115,0.34)", C.brass);
      area("renamed", 1, "rgba(201,84,90,0.30)", C.red);
      el("line", { x1: padL, y1: axis, x2: padL + plotW, y2: axis,
        stroke: C.greyDim, "stroke-width": 2 }, s);

      // подписи пиков — только два, остальное читается формой
      const peak = (key, dir, text) => {
        let best = 0;
        bins.forEach((b, i) => { if (b[key] > bins[best][key]) best = i; });
        const px = x(best);
        const py = axis + dir * scale(bins[best][key]);
        el("circle", { cx: px, cy: py, r: 5, fill: dir < 0 ? C.brass : C.red }, s);
        el("text", { x: px + (dir < 0 ? 14 : -14), y: py + (dir < 0 ? -16 : 8),
          "text-anchor": dir < 0 ? "start" : "end", class: "m39-t-value",
          "font-size": 24, style: `fill:${dir < 0 ? C.brass : C.red}` }, s)
          .textContent = `${text} · ${bins[best][key]}`;
      };
      peak("named", -1, "1920-е");
      peak("renamed", 1, "1991");

      el("text", { x: padL, y: 24, class: "m39-t-mute", "font-size": 22,
        style: `fill:${C.brass}` }, s).textContent = app.t("stats.years.up");
      el("text", { x: padL, y: axis + 30, class: "m39-t-mute", "font-size": 22,
        style: `fill:${C.red}` }, s).textContent = app.t("stats.years.down");

      foot.textContent = app.t("stats.foot.wave", {
        n: withYear, word: plural(withYear, "запись", "записи", "записей"),
        total: nf.format(R.length),
      });
    }

    /* ---- 5. судьба имени по континентам ---- */
    function renderStatus() {
      const host = vis(5, ".m39-chart");
      const foot = vis(5, ".m39-screen__foot");
      const order = ["носит имя", "переименован", "утрачен"];
      const color = { "носит имя": C.brass, переименован: C.red, утрачен: C.grey };
      const conts = countBy(R, "continent").map(([c]) => c);
      const rowH = 70;
      const labelW = 300;
      const barW = W - labelW - 120;
      const s = svg(host, conts.length * rowH + 20);

      conts.forEach((c, i) => {
        const y = i * rowH + 10;
        const items = R.filter((r) => r.continent === c);
        const total = items.length;
        el("text", { x: labelW - 22, y: y + 30, "text-anchor": "end",
          class: "m39-t-label", "font-size": 26 }, s).textContent = c;

        let cursor = labelW;
        order.forEach((st) => {
          const n = items.filter((r) => r.status === st).length;
          if (!n) return;
          const w = (n / total) * barW;
          barRow(s, { x: cursor, y: y + 8, w: Math.max(2, w - 2), h: 32,
            fill: color[st], radius: 3 });
          if (w > 74) {
            el("text", { x: cursor + w / 2 - 1, y: y + 30, "text-anchor": "middle",
              class: "m39-t-value", "font-size": 22, style: "fill:#1b2226" }, s)
              .textContent = `${Math.round((n / total) * 100)}%`;
          }
          cursor += w;
        });

        el("text", { x: labelW + barW + 16, y: y + 30, class: "m39-t-mute",
          "font-size": 22 }, s).textContent = nf.format(total);
      });

      host.appendChild(legendBox([
        [C.brass, app.t("status.live")],
        [C.red, app.t("status.gone")],
        [C.grey, app.t("status.lost")],
      ]));

      foot.textContent = app.t("stats.foot.fate", {
        fr: R.filter((r) => r.country === "Франция" && r.status === "носит имя").length,
        kz: R.filter((r) => r.country === "Казахстан" && r.status === "носит имя").length,
      });
    }

    /* ---- 6. масса улиц РФ ---- */
    function drawMass() {
      const rect = massCanvas.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const total = data.russia_summary.total_all;
      const dpr = capDpr(rect.width, rect.height);
      massCanvas.width = Math.round(rect.width * dpr);
      massCanvas.height = Math.round(rect.height * dpr);
      const g = massCanvas.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, rect.width, rect.height);

      const cols = Math.ceil(Math.sqrt((total * rect.width) / rect.height));
      const rows = Math.ceil(total / cols);
      const cw = rect.width / cols;
      const ch = rect.height / rows;
      const r = Math.max(0.6, Math.min(cw, ch) * 0.3);
      const named = data.russia_summary.streets;   // «улица», прочее — переулки

      for (let i = 0; i < total; i++) {
        const cx = (i % cols) * cw + cw / 2;
        const cy = Math.floor(i / cols) * ch + ch / 2;
        g.fillStyle = i < named ? "rgba(210,183,115,0.85)" : "rgba(157,163,168,0.5)";
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();
      }
    }

    function renderMass() {
      const foot = vis(6, ".m39-screen__foot");
      const s = data.russia_summary;
      foot.textContent = app.t("stats.foot.mass", {
        streets: nf.format(s.streets), lanes: nf.format(s.lanes),
        total: nf.format(s.total_all), year: s.year,
        rest: nf.format(R.length),
        restWord: plural(R.length, "запись", "записи", "записей"),
      });
      drawMass();
    }

    /* ---- навигация ---- */
    function buildDots() {
      dots.replaceChildren();
      screens.forEach((sc, i) => {
        const b = document.createElement("button");
        b.className = "m39-dots__dot kiosk-target";
        b.type = "button";
        b.setAttribute("aria-label", app.t("stats.screenN", { n: i + 1 }));
        b.addEventListener("click", () => {
          scroll.scrollTo({ left: sc.offsetLeft, behavior: "smooth" });
        });
        dots.appendChild(b);
      });
    }

    // активный экран считаем от позиции прокрутки: надёжнее IntersectionObserver
    // при программных переходах и мгновенных свайпах
    function sync() {
      const i = Math.round(scroll.scrollLeft / Math.max(1, scroll.clientWidth));
      screens.forEach((sc, j) => {
        if (j <= i) sc.classList.add("is-live");
        if (dots.children[j]) dots.children[j].setAttribute("aria-current", String(i === j));
      });
    }

    const onScroll = () => sync();
    scroll.addEventListener("scroll", onScroll, { passive: true });

    const watch = sizeWatch(el_, () => { drawMass(); sync(); });

    function retext() {
      vis(0, ".m39-display").textContent = app.t("stats.title");
      vis(0, ".m39-lede").textContent = app.t("stats.lede");
      vis(0, ".m39-srcnote").textContent = app.t("stats.source");
      const keys = ["", "where", "countries", "kinds", "wave", "fate", "mass"];
      for (let i = 1; i < screens.length; i++) {
        vis(i, ".m39-screen__head").textContent = app.t("stats.screen." + keys[i]);
        vis(i, ".m39-screen__sub").textContent = app.t("stats.sub." + keys[i]);
      }
      if (hint) hint.setLabel(app.t("stats.hint"));
      buildDots();
      renderHero();
      renderContinents();
      renderCountries();
      renderKinds();
      renderYears();
      renderStatus();
      renderMass();
      sync();
    }

    this.api = {
      retext,
      redraw: () => { drawMass(); sync(); },
      reset() {
        scroll.scrollTo({ left: 0, behavior: "auto" });
        sync();
        if (hint) hint.show();   // экран вернулся к первому — зовём жест сразу
      },
      health() {
        const charts = el_.querySelectorAll(".m39-chart svg").length;
        const bars = el_.querySelectorAll(".m39-chart svg path").length;
        const hero = el_.querySelectorAll(".m39-hero__item").length;
        if (!hero) return { ok: false, detail: "титульные цифры не собраны" };
        if (charts < 5) return { ok: false, detail: "построено графиков: " + charts + " из 5" };
        if (!bars) return { ok: false, detail: "графики пусты: ни одной полосы" };
        return { ok: true, detail: "экранов 7, графиков " + charts + ", фигур " + bars };
      },
      destroy() {
        scroll.removeEventListener("scroll", onScroll);
        watch.destroy();
        if (hint) hint.destroy();
      },
    };

    /* Хост — контейнер сцены, а не прокручиваемая лента экранов: внутри
       скроллера absolute считается от высоты содержимого, и подсказка уехала
       бы за кромку (грабли кита). */
    const hint = window.KioskHint
      ? window.KioskHint.attach(el_, { gesture: "swipe", label: app.t("stats.hint") })
      : null;

    retext();
    watch.measure(true);
  },

  resume() { if (this.api) this.api.redraw(); },
  reset() { if (this.api) this.api.reset(); },
  setLang() { if (this.api) this.api.retext(); },
  setA11y() { if (this.api) this.api.redraw(); },

  healthcheck() {
    return this.api ? this.api.health() : { ok: false, detail: "сцена не смонтирована" };
  },

  unmount() {
    if (this.api) this.api.destroy();
    this.api = null;
  },
};
