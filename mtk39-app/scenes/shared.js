/* Общее для сцен МТК 39: пути к данным, палитра судьбы имени, работа с
 * канвасом в бюджете пикселей, карточка объекта и картотека «не на карте».
 *
 * Правила, которые здесь зашиты (kiosk README → «жёсткие правила»):
 *  - строки интерфейса берутся только через app.t(); контент свода (названия,
 *    города, описания) остаётся на русском — это музейный материал, а не UI;
 *  - в рантайме сети нет: снимки уезжают в преролл и живут как data-URL;
 *  - буфер канваса не выходит за 8.3 Мп даже на 4K с DPR 2.
 */

export const DATA = {
  corpus: "../data/mtk39-corpus.json",
  countries: "../data/ne_110m_countries.geojson",
  streets: "../data/mtk39-streets.json",
  picked: "../data/mtk39.json",
};

const ONE_OFF_DIR = "../data/images/mtk39/one-off/";
const ONE_OFF_CREDITS = ONE_OFF_DIR + "credits.json";
const PICKED_DIR = "../data/images/mtk39/";

/* Судьба имени. Ключ — как в корпусе, цвет — брендовый, подпись — из словаря. */
export const STATUS = [
  { key: "носит имя", color: "#d2b773", t: "status.live", cls: "is-live" },
  { key: "переименован", color: "#c9545a", t: "status.gone", cls: "is-gone" },
  { key: "утрачен", color: "#9da3a8", t: "status.lost", cls: "is-lost" },
];
export const STATUS_COLOR = new Map(STATUS.map((s) => [s.key, s.color]));
export const STATUS_CLASS = new Map(STATUS.map((s) => [s.key, s.cls]));
export const statusKey = (k) => (STATUS.find((s) => s.key === k) || {}).t || null;
export const statusLabel = (app, k) => {
  const key = statusKey(k);
  return key ? app.t(key) : k || "";
};

/* Тип объекта → ключ словаря. Сами типы приходят из корпуса по-русски. */
export const KIND_KEY = {
  улица: "kind.street", проспект: "kind.avenue", площадь: "kind.square",
  переулок: "kind.lane", город: "kind.town", район: "kind.district",
  завод: "kind.plant", вуз: "kind.school", культура: "kind.culture",
  парк: "kind.park", памятник: "kind.monument", электростанция: "kind.power",
  колхоз: "kind.farm", транспорт: "kind.transport", вода: "kind.water",
  спорт: "kind.sport", медицина: "kind.medicine", судно: "kind.ship",
  природа: "kind.nature", награда: "kind.award", космос: "kind.space",
  прочее: "kind.other",
};
export const kindLabel = (app, kind) =>
  (KIND_KEY[kind] ? app.t(KIND_KEY[kind]) : kind || "");

export const USSR_ISO = new Set([
  "RUS", "UKR", "BLR", "MDA", "LVA", "LTU", "EST",
  "GEO", "ARM", "AZE", "KAZ", "UZB", "TKM", "TJK", "KGZ",
]);

export const nf = new Intl.NumberFormat("ru-RU");

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ─── канвас ────────────────────────────────────────────────────────────
 * Кап буфера рендера: на 4K с DPR 2 наивный канвас был бы 33 Мп — держим
 * бюджет ~8.3 Мп (4K-смоук координатора 2026-07-22). */
export const PIXEL_BUDGET = 8.3e6;

export function capDpr(w, h) {
  const raw = window.devicePixelRatio || 1;
  return Math.max(1, Math.min(raw, 2, Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h))));
}

/* Размер берём у слоя, а не у окна: сцена живёт внутри слоя ядра. */
export function fitCanvas(canvas, w, h) {
  const dpr = capDpr(w, h);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
}

/* Кегли и точки на канвасе нормированы на ~1600 px ширины; на 49″ 4K их надо
 * укрупнять, а сверху ложится регулятор «Контент сцен» (и режим слабовидящих). */
export function drawScale(app, w) {
  const k = app && app.scales ? app.scales().content : 1;
  return Math.max(1, Math.min(2.6, w / 1600)) * (k || 1);
}

/* Честный жизненный цикл rAF: pause() обязан оставить ноль кадров. */
export function loop(fn) {
  let raf = 0;
  const step = (now) => {
    raf = requestAnimationFrame(step);
    fn(now);
  };
  return {
    start() { if (!raf) raf = requestAnimationFrame(step); },
    stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    get running() { return raf !== 0; },
  };
}

/* Медленная петля для аттрактора: ядро просит не выше standbyFps. */
export function slowLoop(fn, fps) {
  const period = 1000 / Math.max(1, fps || 10);
  let raf = 0;
  let last = 0;
  const step = (now) => {
    raf = requestAnimationFrame(step);
    if (now - last < period) return;
    last = now;
    fn(now);
  };
  return {
    start() { if (!raf) { last = 0; raf = requestAnimationFrame(step); } },
    stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } },
  };
}

/* ─── преролл снимков ───────────────────────────────────────────────────
 * Снимки уходят в data-URL, а не в <img src>: в рантайме киоск обязан не
 * ходить в сеть вовсе, а обращение к кешу браузера — всё равно запрос
 * (стенд приёмки считает его нарушением). Заодно не держим в памяти
 * декодированные битмапы полусотни снимков — только исходные байты. */
export async function preloadPictures(ctx) {
  const app = ctx.app;
  const pics = Object.create(null);
  const credits = Object.create(null);

  const asDataUrl = async (url) => {
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status + " на " + url);
    const blob = await r.blob();
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error("не читается " + url));
      fr.readAsDataURL(blob);
    });
  };

  const take = async (key, url) => {
    try { pics[key] = await asDataUrl(url); } catch (e) {
      console.warn("[mtk39] снимок не загрузился:", url, e);
    }
  };

  const jobs = [];

  // «штучные» объекты свода: ключ — id записи
  try {
    const raw = await fetch(ONE_OFF_CREDITS, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : {}));
    for (const id of Object.keys(raw)) {
      credits[id] = raw[id];
      jobs.push(take("corpus:" + id, ONE_OFF_DIR + id + ".jpg"));
    }
  } catch (e) {
    console.warn("[mtk39] credits.json не прочитан", e);
  }

  // избранные объекты глобуса: ключ — имя файла
  try {
    const picked = await fetch(DATA.picked, { cache: "force-cache" }).then((r) => r.json());
    for (const it of picked.items || []) {
      if (it.image && it.image.file) jobs.push(take("file:" + it.image.file, PICKED_DIR + it.image.file));
    }
  } catch (e) {
    console.warn("[mtk39] mtk39.json не прочитан", e);
  }

  await Promise.all(jobs);
  app.data.pictures = pics;
  app.data.credits = credits;
}

export const corpusPicture = (ctx, id) =>
  (ctx.data.pictures && ctx.data.pictures["corpus:" + id]) || null;
export const filePicture = (ctx, file) =>
  (ctx.data.pictures && ctx.data.pictures["file:" + file]) || null;
export const creditOf = (ctx, id) => (ctx.data.credits && ctx.data.credits[id]) || null;

/* ─── карточка объекта ──────────────────────────────────────────────────
 * Одна разметка на «Мир», «Карту Союза» и «Картотеку»: посетитель видит
 * один и тот же объект одинаково, из какой бы сцены он его ни открыл. */
export function objectCardHtml(app, ctx, rec) {
  const credit = creditOf(ctx, rec.id);
  const src = corpusPicture(ctx, rec.id);
  const fig = credit && src
    ? '<figure class="m39-card__fig"><img src="' + esc(src) + '" alt="' + esc(rec.name) + '" />' +
      // условие Викисклада: автор и лицензия рядом с изображением
      '<figcaption>' + esc([credit.author, credit.license, "Викисклад"].filter(Boolean).join(" · ")) +
      "</figcaption></figure>"
    : "";

  const orig = rec.name_orig && rec.name_orig !== rec.name
    ? '<div class="m39-card__orig">' + esc(rec.name_orig) + "</div>"
    : "";

  // длинные «цепочки переименований» набирать Nolde нельзя — нечитаемо
  const nameCls = rec.name.length > 110 ? " m39-card__name--xlong"
    : rec.name.length > 62 ? " m39-card__name--long" : "";

  const rows = [];
  const st = statusKey(rec.status);
  if (st) rows.push([app.t("card.fate"), app.t(st)]);
  if (rec.year_named) rows.push([app.t("card.named"), rec.year_named]);
  if (rec.year_renamed) rows.push([app.t("card.renamed"), rec.year_renamed]);
  if (rec.continent) rows.push([app.t("card.continent"), rec.continent]);
  if (String(rec.geo_src || "").startsWith("nominatim")) {
    rows.push(["", app.t("card.coordsCity")]);
  } else if (rec.lat === null || rec.lat === undefined) {
    rows.push(["", app.t("card.noCoords")]);
  }
  const facts = rows.map(([k, v]) =>
    "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>").join("");

  return fig + orig +
    '<h2 class="m39-card__name' + nameCls + '">' + esc(rec.name) + "</h2>" +
    '<p class="m39-card__where">' +
      esc([rec.city, rec.country].filter(Boolean).join(" · ")) + "</p>" +
    (rec.desc ? '<p class="m39-card__text">' + esc(rec.desc) + "</p>" : "") +
    '<dl class="m39-card__facts">' + facts + "</dl>";
}

/* Панель-карточка справа (сцены с картой). Idle НЕ замораживаем: посетитель
 * может уйти с открытой карточкой, и сброс обязан её закрыть. */
export function createCardPanel(host, app, onClose) {
  const root = document.createElement("aside");
  root.className = "m39-card";
  root.hidden = true;
  root.innerHTML =
    '<button type="button" class="m39-card__close kiosk-target" aria-label="' +
    esc(app.t("card.close")) + '">✕</button><div class="m39-card__body kiosk-scroll"></div>';
  host.appendChild(root);

  const body = root.querySelector(".m39-card__body");
  const closeBtn = root.querySelector(".m39-card__close");
  const close = () => { root.hidden = true; body.innerHTML = ""; if (onClose) onClose(); };
  closeBtn.addEventListener("click", close);

  return {
    el: root,
    open(html) {
      body.innerHTML = html;
      body.scrollTop = 0;
      root.hidden = false;
      closeBtn.setAttribute("aria-label", app.t("card.close"));
    },
    close,
    isOpen() { return !root.hidden; },
    destroy() { closeBtn.removeEventListener("click", close); root.remove(); },
  };
}

/* ─── «не на карте» ─────────────────────────────────────────────────────
 * Часть записей свода не привязана к точке: кириллическая транслитерация
 * чужого топонима не ищется, а у премии, комсомола и послания в космос точки
 * нет вовсе. Они не пропадают молча — открываются полноценной картотекой с
 * теми же карточками и перегруппировкой по типу, судьбе имени и стране. */
export function createOffmap(host, app, records, opts) {
  const off = records.filter((r) => r.lat === null || r.lng === null);
  const countryKey = (opts && opts.countryKey) || "offmap.byCountry";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "m39-chip m39-chip--off kiosk-target";
  toggle.setAttribute("aria-pressed", "false");

  const panel = document.createElement("aside");
  panel.className = "m39-offmap";
  panel.hidden = true;
  panel.innerHTML =
    '<div class="m39-offmap__box">' +
    '<header class="m39-offmap__head"><div>' +
    '<h2 class="m39-offmap__title"></h2>' +
    '<p class="m39-offmap__note"></p></div>' +
    '<button type="button" class="m39-offmap__close kiosk-target" aria-label="' +
    esc(app.t("card.close")) + '">✕</button></header>' +
    '<nav class="m39-offmap__groups"></nav>' +
    '<div class="m39-offmap__wall kiosk-scroll"></div></div>';

  host.appendChild(toggle);
  host.appendChild(panel);

  const wall = panel.querySelector(".m39-offmap__wall");
  const tabs = panel.querySelector(".m39-offmap__groups");
  const title = panel.querySelector(".m39-offmap__title");
  const note = panel.querySelector(".m39-offmap__note");
  const closeBtn = panel.querySelector(".m39-offmap__close");

  const groups = [
    { key: "kind", t: "offmap.byKind", of: (r) => kindLabel(app, r.kind) },
    { key: "status", t: "offmap.byStatus", of: (r) => statusLabel(app, r.status) },
    { key: "country", t: countryKey, of: (r) => r.country || "—" },
  ];
  let groupBy = groups[0];

  function card(rec) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "m39-offcard kiosk-target " + (STATUS_CLASS.get(rec.status) || "");
    const year = rec.year_named && rec.year_renamed
      ? rec.year_named + " — " + rec.year_renamed
      : rec.year_named ? "с " + rec.year_named
        : rec.year_renamed ? app.t("card.renamed") + ": " + rec.year_renamed
          : statusLabel(app, rec.status);
    b.innerHTML =
      (rec.name_orig && rec.name_orig !== rec.name
        ? '<div class="m39-offcard__orig">' + esc(rec.name_orig) + "</div>" : "") +
      '<div class="m39-offcard__name">' + esc(rec.name) + "</div>" +
      '<div class="m39-offcard__where">' +
        esc([rec.city, rec.country].filter(Boolean).join(" · ")) + "</div>" +
      '<div class="m39-offcard__year">' + esc(year) + "</div>";
    b.addEventListener("click", () => {
      setOpen(false);
      if (opts && opts.onPick) opts.onPick(rec);
    });
    return b;
  }

  function renderWall() {
    const map = new Map();
    for (const rec of off) {
      const k = groupBy.of(rec);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(rec);
    }
    const sorted = [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ru"));

    wall.replaceChildren();
    for (const [name, recs] of sorted) {
      const head = document.createElement("div");
      head.className = "m39-offgroup";
      head.innerHTML = '<span class="m39-offgroup__name">' + esc(name) + "</span>" +
        '<span class="m39-offgroup__n">' + recs.length + "</span>" +
        '<span class="m39-offgroup__line"></span>';
      wall.appendChild(head);
      const grid = document.createElement("div");
      grid.className = "m39-offcards";
      for (const rec of recs) grid.appendChild(card(rec));
      wall.appendChild(grid);
    }
    wall.scrollTop = 0;
  }

  function renderTabs() {
    tabs.replaceChildren();
    for (const g of groups) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "m39-chip m39-chip--tab kiosk-target";
      b.textContent = app.t(g.t);
      b.setAttribute("aria-pressed", String(g === groupBy));
      b.addEventListener("click", () => {
        groupBy = g;
        [...tabs.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
        renderWall();
      });
      tabs.appendChild(b);
    }
  }

  /* Простой НЕ замораживаем: посетитель может уйти с открытой картотекой, и
     idle-сброс обязан её закрыть — иначе следующий подходит к чужому экрану
     и киоск никогда не уходит в заставку (правило пилота МТК 42). */
  let isOpen = false;
  function setOpen(open) {
    if (open === isOpen) return;
    isOpen = open;
    panel.hidden = !open;
    toggle.setAttribute("aria-pressed", String(open));
  }

  function retext() {
    toggle.textContent = app.t("offmap.chip", { n: off.length });
    title.textContent = app.t("offmap.title", { n: off.length });
    note.textContent = app.t("offmap.note");
    closeBtn.setAttribute("aria-label", app.t("card.close"));
    renderTabs();
    renderWall();
  }

  const onToggle = () => setOpen(panel.hidden);
  const onClose = () => setOpen(false);
  const onBackdrop = (e) => { if (e.target === panel) setOpen(false); };
  toggle.addEventListener("click", onToggle);
  closeBtn.addEventListener("click", onClose);
  panel.addEventListener("click", onBackdrop);

  if (!off.length) toggle.hidden = true;
  retext();

  return {
    count: off.length,
    close: () => setOpen(false),
    setLang: retext,
    destroy() {
      setOpen(false);
      toggle.removeEventListener("click", onToggle);
      closeBtn.removeEventListener("click", onClose);
      panel.removeEventListener("click", onBackdrop);
      toggle.remove();
      panel.remove();
    },
  };
}

/* Русские числительные — в словари их не унести, это грамматика, а не строка. */
export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/* Наблюдатель размера, который не срабатывает на скрытом слое (0×0) и не
 * дёргает пересборку на каждом переключении сцен. */
export function sizeWatch(el, onResize) {
  let w = 0;
  let h = 0;
  const measure = (force) => {
    const nw = el.clientWidth;
    const nh = el.clientHeight;
    if (!nw || !nh) return false;           // ноль — это «слой спрятан»
    if (!force && nw === w && nh === h) return false;
    w = nw; h = nh;
    onResize(nw, nh);
    return true;
  };
  const ro = new ResizeObserver(() => measure(false));
  ro.observe(el);
  return {
    measure,
    get w() { return w; },
    get h() { return h; },
    destroy() { ro.disconnect(); },
  };
}
