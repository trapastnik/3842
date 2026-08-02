/* МТК 39 · «Имени Ленина» — корпус в цифрах.
   Горизонтальный стори по data/mtk39-corpus.json (7 экранов, свайп вправо). Без зависимостей: SVG собирается
   вручную, тяжёлая масса точек — на canvas.

   Правила отображения данных:
   · величина — латунь (одна краска, длина решает);
   · «имя ушло» — сигнальный красный, «утрачено» — серый; цвет всегда продублирован
     подписью, соседние сегменты разделены зазором 2px;
   · ни одной диаграммы с двумя шкалами. */

const SRC = "../data/mtk39-corpus.json";

const C = {
  brass: "#d2b773",
  brassDim: "rgba(210, 183, 115, 0.30)",
  red: "#c9545a",
  grey: "#9da3a8",
  greyDim: "rgba(157, 163, 168, 0.34)",
  paper: "#f7f9ef",
};

const NS = "http://www.w3.org/2000/svg";
const W = 1000; // ширина системы координат svg; высота у каждого графика своя

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

const nf = new Intl.NumberFormat("ru-RU");
const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
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

/* ------------------------------------------------------------------ титул */

function renderHero(host, data) {
  const R = data.records;
  const stats = [
    [nf.format(R.length), "объектов в своде"],
    [new Set(R.map((r) => r.country)).size, "стран"],
    [nf.format(new Set(R.map((r) => r.city).filter(Boolean)).size), "городов и мест"],
    [nf.format(data.russia_summary.total_all), "улиц Ленина в России"],
  ];
  host.replaceChildren();
  for (const [num, cap] of stats) {
    const item = document.createElement("div");
    item.className = "hero__item";
    item.innerHTML = `<div class="hero__num">${num}</div><div class="hero__cap">${cap}</div>`;
    host.appendChild(item);
  }
}

/* --------------------------------------------------- 1. континенты (полосы) */

function barRow(g, { x, y, w, h, fill, radius = 4 }) {
  // скруглены только «растущие» концы: основание полосы остаётся на оси
  const r = Math.min(radius, w);
  const d = w <= r
    ? `M${x} ${y}h${w}v${h}h${-w}z`
    : `M${x} ${y}h${w - r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - r)}z`;
  return el("path", { d, fill }, g);
}

function renderContinents(host, foot, R) {
  const rows = countBy(R, "continent");
  const max = rows[0][1];
  const rowH = 68;
  const height = rows.length * rowH + 20;
  const labelW = 300;
  const barW = W - labelW - 90;
  const s = svg(host, height);

  rows.forEach(([name, n], i) => {
    const y = i * rowH + 8;
    el("text", {
      x: labelW - 22, y: y + 34, "text-anchor": "end", class: "t-label",
      "font-size": 27,
    }, s).textContent = name;
    el("rect", { x: labelW, y: y + 10, width: barW, height: 34, fill: "rgba(247,249,239,0.05)" }, s);
    const w = Math.round((n / max) * barW);
    barRow(s, { x: labelW, y: y + 10, w, h: 34, fill: C.brass });
    el("text", {
      x: labelW + w + 16, y: y + 34, class: "t-value", "font-size": 27,
    }, s).textContent = nf.format(n);
  });

  const world = R.filter((r) => r.continent !== "Бывший СССР").length;
  foot.innerHTML = `За пределами бывшего СССР — <b>${world}</b> ${plural(world, "объект", "объекта", "объектов")}, `
    + "то есть почти половина свода. Имя разошлось шире, чем страна, которая его насаждала.";
}

/* ------------------------------------------------------- 2. страны (полосы) */

function renderCountries(host, foot, R) {
  const all = countBy(R, "country");
  const rows = all.slice(0, 20);
  const max = rows[0][1];
  const perCol = 10;
  const rowH = 46;
  const height = perCol * rowH + 16;
  const colW = W / 2;
  const labelW = 190;
  const barW = colW - labelW - 90;
  const s = svg(host, height);

  rows.forEach(([name, n], i) => {
    const col = Math.floor(i / perCol);
    const x0 = col * colW;
    const y = (i % perCol) * rowH + 6;
    el("text", {
      x: x0 + labelW - 18, y: y + 26, "text-anchor": "end", class: "t-label", "font-size": 24,
    }, s).textContent = name;
    const w = Math.max(2, Math.round((n / max) * barW));
    barRow(s, { x: x0 + labelW, y: y + 8, w, h: 24, fill: C.brass });
    el("text", {
      x: x0 + labelW + w + 14, y: y + 26, class: "t-value", "font-size": 23,
    }, s).textContent = nf.format(n);
  });

  const tail = all.length - rows.length;
  const tailSum = all.slice(20).reduce((a, [, n]) => a + n, 0);
  foot.innerHTML = `Ещё <b>${tail}</b> ${plural(tail, "страна", "страны", "стран")} — `
    + `${tailSum} ${plural(tailSum, "запись", "записи", "записей")}: `
    + "Сомали, Бенин, Мадагаскар, Йемен, Малайзия, Коста-Рика — по одной-две на страну.";
}

/* ------------------------------------------- 3. типы объектов (две стороны) */

const KIND_LABEL = {
  улица: "улицы", проспект: "проспекты и бульвары", площадь: "площади",
  переулок: "переулки", город: "города и сёла", район: "районы и области",
  завод: "заводы и фабрики", вуз: "институты и школы", культура: "музеи, театры, библиотеки",
  парк: "парки", памятник: "памятники", электростанция: "электростанции",
  колхоз: "колхозы и совхозы", транспорт: "транспорт", вода: "каналы и реки",
  спорт: "стадионы", медицина: "больницы", судно: "суда", природа: "горы и заповедники",
  награда: "ордена и премии", космос: "космос", прочее: "прочее",
};

function renderKinds(host, foot, R) {
  const world = R.filter((r) => r.src === "world");
  const ussr = R.filter((r) => r.src === "ussr");
  const wc = new Map(countBy(world, "kind"));
  const uc = new Map(countBy(ussr, "kind"));
  const kinds = countBy(R, "kind")
    .filter(([k]) => k !== "прочее")
    .slice(0, 10)
    .map(([k]) => k);

  // доли внутри своего свода: сравниваем состав, а не объём (своды разного размера,
  // и «улиц» за границей столько, что в абсолютных числах всё прочее схлопывается)
  const shareW = (k) => (wc.get(k) || 0) / world.length;
  const shareU = (k) => (uc.get(k) || 0) / ussr.length;
  const max = Math.max(...kinds.map((k) => Math.max(shareW(k), shareU(k))));
  const rowH = 50;
  const height = kinds.length * rowH + 60;
  const mid = W / 2;
  const gap = 380;      // окно под подпись категории
  const half = mid - gap / 2 - 74;
  const s = svg(host, height);

  el("text", { x: mid - gap / 2 - 6, y: 22, "text-anchor": "end", class: "t-mute", "font-size": 22 }, s)
    .textContent = "вне СССР";
  el("text", { x: mid + gap / 2 + 6, y: 22, class: "t-mute", "font-size": 22 }, s)
    .textContent = "в СССР";

  const pct = (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

  kinds.forEach((k, i) => {
    const y = 46 + i * rowH;
    const w = wc.get(k) || 0;
    const u = uc.get(k) || 0;
    const lw = Math.round((shareW(k) / max) * half);
    const uw = Math.round((shareU(k) / max) * half);

    el("text", {
      x: mid, y: y + 18, "text-anchor": "middle", class: "t-label", "font-size": 21,
    }, s).textContent = KIND_LABEL[k] || k;

    if (lw > 0) {
      const g = el("g", { transform: `translate(${mid - gap / 2},0) scale(-1,1)` }, s);
      barRow(g, { x: 0, y: y + 2, w: lw, h: 20, fill: C.brass });
    }
    if (uw > 0) barRow(s, { x: mid + gap / 2, y: y + 2, w: uw, h: 20, fill: C.grey });

    if (w) {
      el("text", {
        x: mid - gap / 2 - lw - 12, y: y + 18, "text-anchor": "end",
        class: "t-value", "font-size": 20,
      }, s).textContent = `${pct(shareW(k))} · ${w}`;
    }
    if (u) {
      el("text", {
        x: mid + gap / 2 + uw + 12, y: y + 18, class: "t-value", "font-size": 20,
        style: `fill:${C.grey}`,
      }, s).textContent = `${pct(shareU(k))} · ${u}`;
    }
  });

  host.appendChild(legend([
    [C.brass, `вне СССР — ${world.length} записей`],
    [C.grey, `СССР — ${ussr.length} записей`],
  ]));
  host.appendChild(note("длина полосы — доля внутри своего свода"));

  const streets = world.filter((r) => ["улица", "проспект", "площадь", "переулок"].includes(r.kind)).length;
  const share = Math.round((streets / world.length) * 100);
  foot.innerHTML = `За границей имя Ленина — это адрес: улицы, площади и бульвары дают <b>${share}%</b> `
    + "зарубежных записей. В СССР — это работа: заводы, электростанции, институты, целые города.";
}

function note(text) {
  const p = document.createElement("p");
  p.className = "chart__note";
  p.textContent = text;
  return p;
}

function legend(items) {
  const box = document.createElement("div");
  box.className = "legend";
  for (const [color, text] of items) {
    const item = document.createElement("span");
    item.className = "legend__item";
    item.innerHTML = `<span class="legend__swatch" style="background:${color}"></span>${text}`;
    box.appendChild(item);
  }
  return box;
}

/* ---------------------------------------------------- 4. волна по годам */

function renderYears(host, foot, R) {
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

  // сетка десятилетий
  for (let y = 1900; y <= 2020; y += 20) {
    const gx = padL + ((y - FROM) / (TO - FROM)) * plotW;
    el("line", {
      x1: gx, y1: 40, x2: gx, y2: height - 40, stroke: "rgba(247,249,239,0.07)", "stroke-width": 1,
    }, s);
    el("text", {
      x: gx, y: height - 14, "text-anchor": "middle", class: "t-axis", "font-size": 21,
    }, s).textContent = y;
  }

  const area = (key, dir, fill, stroke) => {
    const pts = bins.map((b, i) => `${x(i)},${axis + dir * scale(b[key])}`);
    el("path", {
      d: `M${padL},${axis} L${pts.join(" L")} L${padL + plotW},${axis} Z`,
      fill, stroke: "none",
    }, s);
    el("path", {
      d: `M${pts.join(" L")}`, fill: "none", stroke, "stroke-width": 2,
      "stroke-linejoin": "round",
    }, s);
  };

  area("named", -1, "rgba(210,183,115,0.34)", C.brass);
  area("renamed", 1, "rgba(201,84,90,0.30)", C.red);

  el("line", { x1: padL, y1: axis, x2: padL + plotW, y2: axis, stroke: C.greyDim, "stroke-width": 2 }, s);

  // подписи пиков — только два, остальное читается формой
  const peak = (key, dir, text) => {
    let best = 0;
    bins.forEach((b, i) => { if (b[key] > bins[best][key]) best = i; });
    const px = x(best);
    const py = axis + dir * scale(bins[best][key]);
    el("circle", { cx: px, cy: py, r: 5, fill: dir < 0 ? C.brass : C.red }, s);
    el("text", {
      x: px + (dir < 0 ? 14 : -14), y: py + (dir < 0 ? -16 : 8),
      "text-anchor": dir < 0 ? "start" : "end",
      class: "t-value", "font-size": 24, style: `fill:${dir < 0 ? C.brass : C.red}`,
    }, s).textContent = `${text} · ${bins[best][key]}`;
  };
  peak("named", -1, "1920-е");
  peak("renamed", 1, "1991");

  el("text", { x: padL, y: 24, class: "t-mute", "font-size": 22, style: `fill:${C.brass}` }, s)
    .textContent = "↑ имя пришло";
  el("text", { x: padL, y: axis + 30, class: "t-mute", "font-size": 22, style: `fill:${C.red}` }, s)
    .textContent = "↓ имя ушло";

  foot.innerHTML = `Считаны <b>${withYear}</b> ${plural(withYear, "запись", "записи", "записей")} из `
    + `${nf.format(R.length)} — те, где в материалах назван год. Пик имянаречения — двадцатые, `
    + "второй подъём — пятидесятые и шестидесятые. <i>Отлив</i> начинается в конце восьмидесятых "
    + "и обрушивается на 1991-й.";
}

/* --------------------------------------------- 5. статус по континентам */

const STATUS_ORDER = ["носит имя", "переименован", "утрачен"];
const STATUS_COLOR = { "носит имя": C.brass, переименован: C.red, утрачен: C.grey };

function renderStatus(host, foot, R) {
  const conts = countBy(R, "continent").map(([c]) => c);
  const rowH = 70;
  const height = conts.length * rowH + 20;
  const labelW = 300;
  const barW = W - labelW - 120;
  const s = svg(host, height);

  conts.forEach((c, i) => {
    const y = i * rowH + 10;
    const items = R.filter((r) => r.continent === c);
    const total = items.length;
    el("text", {
      x: labelW - 22, y: y + 30, "text-anchor": "end", class: "t-label", "font-size": 26,
    }, s).textContent = c;

    let cursor = labelW;
    STATUS_ORDER.forEach((st) => {
      const n = items.filter((r) => r.status === st).length;
      if (!n) return;
      const w = (n / total) * barW;
      barRow(s, { x: cursor, y: y + 8, w: Math.max(2, w - 2), h: 32, fill: STATUS_COLOR[st], radius: 3 });
      if (w > 74) {
        el("text", {
          x: cursor + w / 2 - 1, y: y + 30, "text-anchor": "middle",
          class: "t-value", "font-size": 22, style: "fill:#1b2226",
        }, s).textContent = `${Math.round((n / total) * 100)}%`;
      }
      cursor += w;
    });

    el("text", {
      x: labelW + barW + 16, y: y + 30, class: "t-mute", "font-size": 22,
    }, s).textContent = nf.format(total);
  });

  host.appendChild(legend([
    [C.brass, "носит имя сегодня"],
    [C.red, "переименовано"],
    [C.grey, "утрачено"],
  ]));

  const fr = R.filter((r) => r.country === "Франция" && r.status === "носит имя").length;
  const kz = R.filter((r) => r.country === "Казахстан" && r.status === "носит имя").length;
  foot.innerHTML = `Во Франции имя Ленина сегодня носят <b>${fr}</b> объекта, в Казахстане — <i>${kz}</i>. `
    + "Статус выведен из формулировок музейных материалов («ныне», «бывш.», «переименован») "
    + "и требует выборочной проверки.";
}

/* ------------------------------------------------------ 6. масса улиц РФ */

function renderMass(canvas, foot, data) {
  const total = data.russia_summary.total_all;
  const draw = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    // тот же бюджет пикселей, что и в канвас-прототипах (4K-смоук 2026-07-22)
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2,
      Math.sqrt(8.3e6 / Math.max(1, rect.width * rect.height * 4))));
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const cols = Math.ceil(Math.sqrt((total * rect.width) / rect.height));
    const rows = Math.ceil(total / cols);
    const cw = rect.width / cols;
    const ch = rect.height / rows;
    const r = Math.max(0.6, Math.min(cw, ch) * 0.3);
    const named = data.russia_summary.streets; // «улица», остальное — переулки и проезды

    for (let i = 0; i < total; i++) {
      const cx = (i % cols) * cw + cw / 2;
      const cy = Math.floor(i / cols) * ch + ch / 2;
      ctx.fillStyle = i < named ? "rgba(210,183,115,0.85)" : "rgba(157,163,168,0.5)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  draw();
  window.addEventListener("resize", draw, { passive: true });

  const s = data.russia_summary;
  foot.innerHTML = `<b>${nf.format(s.streets)}</b> улиц и <b>${nf.format(s.lanes)}</b> переулков — `
    + `всего ${nf.format(s.total_all)} на ${s.year} год. Весь остальной свод, все семьдесят четыре страны, `
    + `— это ${nf.format(data.records.length)} ${plural(data.records.length, "запись", "записи", "записей")}: `
    + "меньше, чем ленинских улиц "
    + "в одной Ульяновской области.";
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

function setupNav() {
  const screens = [...document.querySelectorAll(".screen")];
  const dots = document.querySelector("[data-dots]");
  const scroll = document.getElementById("scroll");

  screens.forEach((sc, i) => {
    const b = document.createElement("button");
    b.className = "dots__dot";
    b.type = "button";
    b.setAttribute("aria-label", `Экран ${i + 1}`);
    b.addEventListener("click", () => {
      scroll.scrollTo({ top: sc.offsetTop, behavior: "smooth" });
    });
    dots.appendChild(b);
  });

  // активный экран считаем от позиции прокрутки: надёжнее IntersectionObserver
  // при программных переходах и мгновенных свайпах
  const sync = () => {
    const i = Math.round(scroll.scrollLeft / Math.max(1, scroll.clientWidth));
    screens.forEach((sc, j) => {
      if (j <= i) sc.classList.add("is-live");
      dots.children[j].setAttribute("aria-current", String(i === j));
    });
  };
  scroll.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync, { passive: true });
  sync();
}

async function main() {
  const res = await fetch(SRC);
  const data = await res.json();
  const R = data.records;

  const pick = (sel) => document.querySelector(sel);
  renderHero(pick("[data-hero]"), data);
  renderContinents(pick('[data-chart="continents"]'), pick('[data-foot="continents"]'), R);
  renderCountries(pick('[data-chart="countries"]'), pick('[data-foot="countries"]'), R);
  renderKinds(pick('[data-chart="kinds"]'), pick('[data-foot="kinds"]'), R);
  renderYears(pick('[data-chart="years"]'), pick('[data-foot="years"]'), R);
  renderStatus(pick('[data-chart="status"]'), pick('[data-foot="status"]'), R);
  renderMass(pick('[data-chart="mass"]'), pick('[data-foot="mass"]'), data);

  document.querySelectorAll(".screen > *").forEach((n) => n.setAttribute("data-anim", ""));
  setupNav();
  const scroll = document.getElementById("scroll");
  armIdleReset(() => scroll.scrollTo({ left: 0, behavior: "smooth" }));
}

main().catch((e) => {
  console.error(e);
  document.querySelector(".display").textContent = "Данные не загрузились";
});
