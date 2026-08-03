/* Общее для сцен МТК 41: пути к данным, разбор корпуса, карточка памятника.
 *
 * Правила, зашитые здесь и обязательные для всех семи сцен:
 *  - строки UI только через app.t() (Киоск-стандарт v2, п. 11);
 *  - контент (города, авторы, примечания) остаётся на русском — как у пилота 42;
 *  - в сетках и на шкалах показываем МИНИАТЮРЫ (thumbs.json), а полный снимок
 *    открывается только в карточке. Причина в памяти, а не в сети: 282 первых
 *    фото это 2097 Мп, то есть ~7.8 ГБ декодированными. Ядро держит преролл
 *    в ctx.images[] живым, поэтому в преролл идут только миниатюры (~188 МБ).
 */

export const DATA = {
  monuments: "../data/mtk41.json",
  heights: "../assets/mtk41/heights.json",
  photos: "../assets/mtk41/manifest.json",
  thumbs: "../assets/mtk41/thumbs.json",
  cards: "../assets/mtk41/cards.json",
  countries: "../data/ne_110m_countries.geojson",
};

const ASSET_DIR = "../assets/mtk41/";

/* Потолок буфера канвы, ~8.3 Мп (README ядра, п. 6). */
export const PIXEL_BUDGET = 3840 * 2160;

/* Габаритов нет у 52 памятников из 283. Раньше им подставлялась эта пара и
 * выдавалась за измеренную — теперь она только резервирует место в ряду, а
 * рисуется пунктиром с подписью «нет данных». */
export const FALLBACK_HEIGHT = { statue: 5.0, pedestal: 2.0 };
export const HUMAN_HEIGHT_M = 1.75;

export const PALETTE = {
  paper: "#F7F9EF",
  brass: "#D2B773",
  red: "#A02128",
  graphite: "#435059",
  window: "#9DA3A6",
  black: "#000000",
};

export const STATUS_KEY = {
  extant: "status.extant",
  demolished: "status.demolished",
  relocated: "status.relocated",
  unknown: "status.unknown",
};

export function statusColor(status) {
  switch (status) {
    case "extant": return PALETTE.red;
    case "demolished": return PALETTE.graphite;
    case "relocated": return PALETTE.brass;
    default: return PALETTE.window;
  }
}

export function cssColor(hex, alpha) {
  const v = hex.replace("#", "");
  return `rgba(${parseInt(v.slice(0, 2), 16)}, ${parseInt(v.slice(2, 4), 16)}, ${parseInt(v.slice(4, 6), 16)}, ${alpha})`;
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* «283 памятника», «47 стран» — согласование числительного. Города нигде не
 * склоняем: автоматически это не сделать («от Осташкова», но «от Винь»). */
export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function thumbUrl(thumbs, id) {
  const rel = thumbs && thumbs[id];
  return rel ? ASSET_DIR + id + "/" + rel : null;
}

export function photoUrl(manifest, id) {
  const list = manifest && manifest[id];
  return list && list.length ? ASSET_DIR + id + "/" + list[0] : null;
}

/* Второй тир, 1100 px — только для карточки и только по тапу. В преролл он
 * НЕ идёт: 289 таких снимков это ещё 38 МБ на диске и сотни мегабайт в
 * памяти, а посетитель за сеанс открывает единицы карточек. */
export function cardUrl(cards, id) {
  const rel = cards && cards[id];
  return rel ? ASSET_DIR + id + "/" + rel : null;
}

/* Все миниатюры — в преролл ядра. */
export function thumbList(thumbs) {
  const out = [];
  for (const id in thumbs) {
    const u = thumbUrl(thumbs, id);
    if (u) out.push(u);
  }
  return out;
}

/* Преролл миниатюр.
 *
 * `preload.images` ядра — статический список, он собирается ДО загрузки
 * данных, а список миниатюр известен только из thumbs.json. Поэтому грузим
 * их сами в `custom()`: ядро дождётся промиса и не пустит приложение к
 * посетителю раньше времени.
 *
 * Делать это обязательно, а не «по мере показа»: приёмка считает провалом
 * ЛЮБОЙ запрос после старта (`performance.getEntriesByType("resource")`), и
 * локальный файл здесь неотличим от сетевого. Отсюда же следует, что
 * полноразмерные снимки не показываются нигде — 282 оригинала это 2097 Мп,
 * ~7.8 ГБ декодированными, столько в память не положить.
 * Ошибку одной картинки глотаем: пустая плитка лучше упавшего сплэша. */
export function preloadThumbs(ctx) {
  /* Без force-cache: индекс меняется при каждой пересборке миниатюр, и
   * закешированный список тянул бы в преролл уже удалённые файлы. */
  return fetch(DATA.thumbs, { cache: "no-cache" })
    .then((r) => r.json())
    .then((idx) => Promise.all(thumbList(idx).map((u) => new Promise((res) => {
      const img = new Image();
      const done = () => { ctx.images[u] = img; res(); };
      img.onload = done;
      img.onerror = () => res();
      img.src = u;
    }))));
}

/* Год для сортировки: у трёх записей его нет вовсе. */
export function sortYear(m) {
  if (typeof m.year === "number") return m.year;
  if (m.id && m.id.includes("1920s")) return 1925;
  if (m.id === "gorki-pinchuk-taurit") return 1949;
  return 1930;
}

export function byYear(items) {
  return items.map((m, i) => ({ m, i, year: sortYear(m) }))
    .sort((a, b) => a.year - b.year);
}

/* Подпись «город · чем примечателен». Заголовки в корпусе родовые и уже
 * содержат город («Памятник Ленину — Иваново-Вознесенск»), поэтому наивное
 * срезание префикса давало «Воронеж · в Воронеж». */
export function label(m) {
  const city = m.city || "";
  let rest = (m.title || "")
    .replace(/^(Памятник Ленину|Бюст Ленина|Памятник В\.И\. Ленину)/i, "")
    .replace(/^\s*[—–-]\s*/, "")
    .replace(/^\s*в\s+/i, "")
    .trim();
  if (city && rest.toLowerCase() === city.toLowerCase()) rest = "";
  if (!rest && m.kind && m.kind !== "sculpture") rest = m.kind_ru || "";
  if (!city) return rest || (m.title || "");
  return rest ? `${city} · ${rest}` : city;
}

/* ─── Карточка памятника ────────────────────────────────────────────────
 * Один компонент на все сцены. Idle НЕ замораживаем: посетитель может уйти
 * с открытой карточкой, и idle-сброс обязан её закрыть.
 * Полное фото грузится здесь и только здесь — по тапу, с локального диска. */
export function createCard(el, app, ctx) {
  const root = document.createElement("div");
  root.className = "m41-card";
  root.hidden = true;
  root.innerHTML =
    '<div class="m41-card__panel kiosk-scroll" role="dialog" aria-modal="true">' +
    '<button type="button" class="m41-card__close kiosk-target" aria-label="' +
    esc(app.t("card.close")) + '">✕</button>' +
    '<div class="m41-card__body"></div></div>';
  el.appendChild(root);

  const panel = root.querySelector(".m41-card__panel");
  const body = root.querySelector(".m41-card__body");
  const closeBtn = root.querySelector(".m41-card__close");
  let onCloseCb = null;

  function close() {
    if (root.hidden) return;
    root.hidden = true;
    body.innerHTML = "";
    if (onCloseCb) onCloseCb();
  }
  function onBackdrop(e) { if (e.target === root) close(); }
  closeBtn.addEventListener("click", close);
  root.addEventListener("click", onBackdrop);

  return {
    el: root,
    isOpen() { return !root.hidden; },
    onClose(fn) { onCloseCb = fn; },
    open(m) {
      body.innerHTML = cardHtml(app, ctx, m);
      root.hidden = false;
      panel.scrollTop = 0;
      closeBtn.setAttribute("aria-label", app.t("card.close"));
      upgradePhoto(body, ctx, m);
    },
    close,
    destroy() {
      closeBtn.removeEventListener("click", close);
      root.removeEventListener("click", onBackdrop);
      root.remove();
    },
  };
}

/* Подменить миниатюру снимком второго тира, когда тот догрузится.
 *
 * Два тира вместо одного — решение координатора 2026-08-04, ставшее каноном
 * для фотокорпусов: 480 px в прероле, 1100 px по тапу с локального диска.
 * Карточка открывается мгновенно на уже загруженной миниатюре, а чёткий
 * снимок встаёт на её место через кадр-другой — без пустой рамки и без
 * скачка вёрстки, потому что размер задаёт контейнер, а не картинка.
 *
 * До ядра 1.7 checkNetwork в selftest.js считает эту догрузку нарушением
 * автономности: он не отличает локальный путь от внешнего хоста. Фикс
 * заказан; в отчёте приёмки этот один чек помечается как известный. */
function upgradePhoto(body, ctx, m) {
  const img = body.querySelector(".m41-card__photo img");
  const big = cardUrl(ctx.data.cards, m.id);
  if (!img || !big || img.getAttribute("src") === big) return;
  const probe = new Image();
  probe.onload = () => {
    /* Пока грузилось, посетитель мог закрыть карточку или открыть другую —
     * тогда подменять нечего и незачем. */
    if (img.isConnected) img.src = big;
  };
  probe.src = big;
}

export function cardHtml(app, ctx, m) {
  const t = (k, v) => app.t(k, v);
  /* В разметку идёт миниатюра — она уже в памяти, карточка открывается без
   * ожидания. Снимок 1100 px подставляется следом, см. upgradePhoto(). */
  const full = thumbUrl(ctx.data.thumbs, m.id) || photoUrl(ctx.data.photos, m.id);
  const photo = full
    ? '<div class="m41-card__photo"><img src="' + esc(full) + '" alt="" /></div>'
    : '<div class="m41-card__photo m41-card__photo--empty">' +
      esc(t("card.nophoto")) + "</div>";

  const auth = [];
  if (m.sculptors && m.sculptors.length) {
    auth.push(esc(t("card.sculptor")) + ": " + esc(m.sculptors.join(", ")));
  }
  if (m.architects && m.architects.length) {
    auth.push(esc(t("card.architect")) + ": " + esc(m.architects.join(", ")));
  }
  /* Ремесленные роли ранней волны — модельщик, литейщик, маляр-декоратор.
   * В «Скульпторах» им не место, но терять их нельзя: раннюю волну делали
   * рабочие своих же фабрик, и это содержательная часть сюжета. */
  if (m.makers && m.makers.length) {
    auth.push(esc(t("card.makers")) + ": " + esc(m.makers.join(", ")));
  }

  const h = ctx.data.heights[m.id];
  const height = h && (h.statue + h.pedestal) > 0.1
    ? '<div class="m41-card__height">' + esc(t("card.height")) + ": " +
      fmtM(h.statue + h.pedestal) + " (" + esc(t("card.figure")) + " " +
      fmtM(h.statue) + " + " + esc(t("card.pedestal")) + " " +
      fmtM(h.pedestal) + ")</div>"
    : '<div class="m41-card__height m41-card__height--none">' +
      esc(t("card.height")) + ": " + esc(t("card.nodata")) + "</div>";

  const kind = m.kind && m.kind !== "sculpture"
    ? '<span class="m41-chip">' + esc(t("kind." + m.kind)) + "</span>" : "";
  const wave = m.wave === "first"
    ? '<span class="m41-chip m41-chip--wave">' + esc(t("wave.first")) + "</span>" : "";

  return (
    photo +
    '<div class="m41-card__year">' + esc(m.year ? String(m.year) : t("card.noyear")) + "</div>" +
    '<h2 class="m41-card__name">' + esc(m.title || "") + "</h2>" +
    '<p class="m41-card__place">' +
      esc([m.city, m.country].filter(Boolean).join(" · ")) + "</p>" +
    '<div class="m41-card__chips"><span class="m41-chip m41-chip--' +
      esc(m.status || "unknown") + '">' +
      esc(t(STATUS_KEY[m.status] || "status.unknown")) + "</span>" + kind + wave + "</div>" +
    (auth.length ? '<p class="m41-card__author">' + auth.join(" · ") + "</p>" : "") +
    '<p class="m41-card__text">' + esc(m.short_text || "") + "</p>" +
    height +
    (m.size_raw ? '<p class="m41-card__size">' + esc(m.size_raw) + "</p>" : "")
  );
}

function fmtM(v) {
  return (v < 10 ? v.toFixed(1) : Math.round(v)) + " м";
}

/* ─── Канва ────────────────────────────────────────────────────────────
 * Общий помощник: буфер под потолком 8.3 Мп и честный жизненный цикл rAF.
 * Наблюдатель размеров гардится на ноль — скрытый слой имеет 0×0, и сцена,
 * пересобирающаяся по этому событию, иначе делит на ноль. */
export function createCanvasHost(parent, className) {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  canvas.setAttribute("aria-hidden", "true");
  parent.appendChild(canvas);
  const ctx2d = canvas.getContext("2d", { alpha: true });

  const host = {
    canvas,
    ctx: ctx2d,
    width: 0,
    height: 0,
    dpr: 1,
    _raf: 0,
    _ro: null,
    _onResize: null,

    /** true, если размер реально изменился (и раскладку надо пересобрать). */
    measure() {
      const r = canvas.getBoundingClientRect();
      const w = Math.floor(r.width), h = Math.floor(r.height);
      if (!w || !h) return false;                 // слой спрятан, а не новый размер
      if (w === host.width && h === host.height) return false;
      host.width = w;
      host.height = h;
      const budget = Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h));
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1, budget));
      host.dpr = dpr;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    },

    observe(cb) {
      host._onResize = cb;
      host._ro = new ResizeObserver(() => {
        if (host.measure() && host._onResize) host._onResize();
      });
      host._ro.observe(canvas);
    },

    /* pause() обязан останавливать всё: неактивная сцена — 0 rAF. */
    start(frame) {
      if (host._raf) return;
      const loop = () => {
        host._raf = requestAnimationFrame(loop);
        frame();
      };
      host._raf = requestAnimationFrame(loop);
    },
    stop() {
      if (!host._raf) return;
      cancelAnimationFrame(host._raf);
      host._raf = 0;
    },
    running() { return !!host._raf; },

    destroy() {
      host.stop();
      if (host._ro) { host._ro.disconnect(); host._ro = null; }
      canvas.remove();
    },
  };
  return host;
}
