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

/* Метка версии нужна и ДАННЫМ, не только коду: правка json без ?v= не
 * доезжает до страницы — Chrome отдаёт файл из кеша, и на экране остаётся
 * старый корпус при свежем репо (грабля 40-го). Одна константа на все сцены,
 * поднимать вместе с меткой модулей. */
const DATA_V = "?v=60";

export const DATA = {
  monuments: "../data/mtk41.json" + DATA_V,
  heights: "../assets/mtk41/heights.json" + DATA_V,
  photos: "../assets/mtk41/manifest.json" + DATA_V,
  thumbs: "../assets/mtk41/thumbs.json" + DATA_V,
  cards: "../assets/mtk41/cards.json" + DATA_V,
  silhouettes: "../assets/mtk41/silhouettes_paths.json" + DATA_V,
  cutouts: "../assets/mtk41/cutouts.json" + DATA_V,
  countries: "../data/ne_110m_countries.geojson" + DATA_V,
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

/* ─── Подпись на объекте: не влезла — не рисуем ────────────────────────
 * Канон подписей (GRABLI): обрубок — это мусор. Правило относится к подписи
 * НА ОБЪЕКТЕ (фигура на шкале, кружок на карте): объект различим и без
 * подписи, имя даёт тап. На горизонтальной строке списка усечение законно —
 * там оно читается как строка, а не как огрызок.
 *
 * Считаем рамку в УСТРОЙСТВЕННЫХ координатах через getTransform(), а не по
 * x + measureText().width: подписи на шкале повёрнуты на 60°, и наивная
 * проверка по ширине для них не значит ничего. Первая версия этой проверки
 * так и ошиблась — насчитала 420 «выходов за кромку» там, где их не было.
 *
 * Возвращает true, если нарисовали.
 */
export function fillTextIfFits(ctx, text, x, y, pad) {
  const s = String(text == null ? "" : text);
  if (!s) return false;
  const c = ctx.canvas;
  const m = ctx.measureText(s);
  const w = m.width;
  const asc = m.actualBoundingBoxAscent || 0;
  const desc = m.actualBoundingBoxDescent || 0;
  const dx = ctx.textAlign === "center" ? -w / 2
    : (ctx.textAlign === "right" || ctx.textAlign === "end" ? -w : 0);
  const corners = [[x + dx, y - asc], [x + dx + w, y - asc],
                   [x + dx + w, y + desc], [x + dx, y + desc]];
  const t = ctx.getTransform();
  let lo = Infinity, hi = -Infinity, top = Infinity, bot = -Infinity;
  for (const [px, py] of corners) {
    const ux = t.a * px + t.c * py + t.e;
    const uy = t.b * px + t.d * py + t.f;
    if (ux < lo) lo = ux;
    if (ux > hi) hi = ux;
    if (uy < top) top = uy;
    if (uy > bot) bot = uy;
  }
  const p = pad == null ? 0 : pad;
  if (lo < p || hi > c.width - p || top < p || bot > c.height - p) return false;
  ctx.fillText(s, x, y);
  return true;
}

/* Призыв к жесту при пустой выборке ГАСИМ: «Листайте шкалу вбок» над пустым
 * полем — это обещание того, чего сцена не делает. Кит с 1.13 даёт suppress()
 * ровно для «убрать надолго»; при возврате объектов снимаем. */
export function hintForEmpty(scene, isEmpty) {
  const hint = scene && scene._hint;
  if (!hint) return;
  /* Только НА ПЕРЕХОДЕ. Первая редакция звала это каждый кадр, и rearm()
   * шестьдесят раз в секунду перезаводил бы таймер показа — подсказка не
   * появилась бы никогда. Ровно та же ошибка, что была с poke() в заставке,
   * только с обратным знаком. */
  if (scene._hintEmpty === isEmpty) return;
  scene._hintEmpty = isEmpty;
  if (isEmpty && hint.suppress) hint.suppress();
  else if (!isEmpty && hint.rearm) hint.rearm();
}

/* Заглушка «ничего не найдено» на канве. Панель честно пишет «0 из 283», но
 * сама сцена без подписи — это чистый экран без объяснения: посетитель не
 * поймёт, что произошло и как вернуться. */
export function drawEmptyState(ctx, w, h, app) {
  /* Ставим в ВЕРХНЮЮ треть, а не по центру: по центру заглушка попадала прямо
   * под призыв к жесту и читалась сквозь него. */
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = cssColor(PALETTE.paper, 0.8);
  ctx.font = `600 ${Math.max(16, Math.min(h * 0.045, 34))}px "20 Kopeek", monospace`;
  ctx.fillText(app.t("finder.empty"), w / 2, h * 0.30);
  ctx.fillStyle = cssColor(PALETTE.window, 0.75);
  ctx.font = `400 ${Math.max(12, Math.min(h * 0.026, 20))}px "20 Kopeek", monospace`;
  ctx.fillText(app.t("finder.emptyHint"), w / 2, h * 0.30 + Math.max(26, h * 0.055));
  ctx.restore();
}

/* ─── Призыв к жесту ───────────────────────────────────────────────────
 * Тач-стандарт, п. 4: у жестовой сцены обязана быть подсказка — на киоске
 * никто не догадается тянуть карту, если об этом не сказать.
 *
 * Куда вешать (обе грабли уже собраны другими сессиями):
 *  · НЕ на <canvas> — браузер не рисует детей канвы, подсказка невидима с
 *    рождения; так она и жила у пяти сцен 38 и на карте 42. Кит с 1.8.2 сам
 *    перевешивается на родителя, но полагаться на спасение чужим кодом нельзя.
 *  · НЕ на прокручиваемый контейнер — absolute отсчитывается от высоты
 *    СОДЕРЖИМОГО, и подсказка уезжает в минус (у маятника 42 висела на −188).
 * Поэтому цель — «стол» сцены (обёртка канвы) или корень сцены, но не грид.
 *
 * Подпись — всегда из словаря: хардкод-русский вылезает на EN и ZH. Ключ
 * запоминаем, чтобы setLang() мог перечитать его тем же путём.
 */
export function createHint(target, gesture, key, app) {
  if (!window.KioskHint || !target) return null;
  const handle = window.KioskHint.attach(target, { gesture, label: app.t(key) });
  handle.relabel = () => handle.setLabel(app.t(key));
  return handle;
}

/* ─── Канва ────────────────────────────────────────────────────────────
 * Общий помощник: буфер под потолком 8.3 Мп и честный жизненный цикл rAF.
 * Наблюдатель размеров гардится на ноль — скрытый слой имеет 0×0, и сцена,
 * пересобирающаяся по этому событию, иначе делит на ноль. */

/**
 * Размер буфера канвы под данный бокс — ОДНА формула на отрисовку и на
 * проверку. Раньше её копия жила и в measure(), и в healthcheck: при первой
 * же правке копии разошлись бы, и проверка сверяла бы буфер с собственной
 * устаревшей арифметикой (образец МТК 40).
 *
 * Пола в единицу здесь нет намеренно. Он тут был — `Math.max(1, …)` — и
 * превращал кап в фикцию: на боксе крупнее 4K множитель бюджета уходит ниже
 * единицы, пол возвращал его обратно к 1, и буфер спокойно перелезал 8.3 Мп.
 * Комментарий рядом при этом честно утверждал, что кап работает (грабля 38-го,
 * там же формулировка «комментарий про поведение своего кода — не
 * доказательство»).
 *
 * Округление ТОЛЬКО вниз: при round обе стороны идут вверх и произведение
 * перелезает кап на полторы тысячи пикселей (грабля 40-го). floor даёт
 * cw·ch ≤ w·h·scale² = кап.
 */
export function bufferFor(w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = w * h * dpr * dpr > PIXEL_BUDGET
    ? Math.sqrt(PIXEL_BUDGET / (w * h))
    : dpr;
  return {
    scale,
    w: Math.max(1, Math.floor(w * scale)),
    h: Math.max(1, Math.floor(h * scale)),
  };
}

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
      const buf = bufferFor(w, h);
      host.dpr = buf.scale;
      canvas.width = buf.w;
      canvas.height = buf.h;
      /* Трансформ — от ФАКТИЧЕСКОГО буфера, не от scale: buf.w прошёл через
       * floor, и на дробном множителе рисунок иначе уезжал бы на полпикселя
       * от правой и нижней кромок. */
      ctx2d.setTransform(buf.w / w, 0, 0, buf.h / h, 0, 0);
      return true;
    },

    /* Живой размер бокса ПРЯМО СЕЙЧАС, а не запомненный при последнем
     * measure(). Разница принципиальная и на неё указывает канон кита:
     * host.width — это по сути флаг «меня однажды измерили», он переживает
     * скрытие слоя и разойдётся с действительностью. Слой неактивной сцены
     * имеет 0×0, и спрашивать надо у него, а не у памяти о прошлом. */
    liveBox() {
      const r = canvas.getBoundingClientRect();
      return { w: Math.floor(r.width), h: Math.floor(r.height) };
    },

    /* Сверка буфера с ожиданием ПО ФАКТИЧЕСКОМУ dpr — для healthcheck.
     * Счётчик сущностей этого не ловит: сцена честно рисует все объекты, но
     * может делать это в чужом разрешении (у карты 42 так вышло 4%). */
    bufferOk() {
      const r = canvas.getBoundingClientRect();
      const w = Math.floor(r.width), h = Math.floor(r.height);
      if (!w || !h) return { ok: true, detail: "слой скрыт" };
      const exp = bufferFor(w, h);
      const ok = Math.abs(canvas.width - exp.w) <= 1 &&
                 Math.abs(canvas.height - exp.h) <= 1;
      const mpx = (canvas.width * canvas.height / 1e6).toFixed(2);
      const size = canvas.width + "×" + canvas.height + " (" + mpx + " Мп)";
      /* У ПРИОСТАНОВЛЕННОЙ сцены расхождение законно: буфер перемеряется
       * только в кадре, а на паузе кадров нет. Стоит переключить режим
       * слабовидящих — бокс всех неактивных сцен меняется, и их буферы
       * остаются от прежней раскладки. Это не поломка: первый же кадр после
       * resume() пересчитает (проверено — карта ушла с 900 на 856 и позеленела
       * ровно за один показ). Строго спрашиваем только с той сцены, которая
       * сейчас рисует; иначе проверка ругалась бы на исправные сцены, а это
       * ровно тот перебор, что покрасил 278 ложных у плаката 38. */
      if (!ok && !host._raf) {
        return { ok: true, detail: size + ", пересчёт при возобновлении" };
      }
      return { ok, detail: size + (ok ? "" : " вместо " + exp.w + "×" + exp.h) };
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

/* ─── Финдер: общий отбор на все семь сцен ──────────────────────────────
 * Ядро держит СОСТОЯНИЕ отбора и рисует панель; сопоставление — наше, и
 * пишется оно один раз здесь. Семь копий этой функции разъехались бы при
 * первой же правке, а расхождение отбора между сценами посетитель прочитает
 * как поломку данных, а не как разную логику.
 *
 * Порядок канона: ОТБОР → ПОИСК → СОРТИРОВКА.
 */

/* Поля поиска одни на все сцены. `place` не берём намеренно: это адрес внутри
 * города («сквер имени Ленина»), он совпадёт почти со всем и обесценит
 * выдачу. Свободный текст (short_text, note_full) — тоже нет: там ошибки
 * источника, и объяснить посетителю ложное попадание нечем (прецедент 39). */
export const FINDER_FIELDS = [
  { key: "title", label: { ru: "Название", en: "Title" } },
  { key: "city", label: { ru: "Город", en: "City" } },
  { key: "country", label: { ru: "Страна", en: "Country" } },
  { key: "sculptors", label: { ru: "Скульптор", en: "Sculptor" } },
];

const STATUS_ORDER = ["extant", "demolished", "relocated", "unknown"];

/* Корпус на уровне МОДУЛЯ, а не на экземпляре сцены.
 *
 * Декларация finder читается ядром, когда данных ещё нет, поэтому options
 * задаются функцией. Соблазн написать `scaleScene._src` — ловушка: «Силуэты»
 * наследуют декларацию «Масштаба» через Object.assign и смотрели бы в ЧУЖОЙ
 * экземпляр, а если та сцена ни разу не смонтирована — в undefined, и фасеты
 * пришли бы пустыми. Корпус у всех семи сцен один, поэтому и держим его один. */
let CORPUS = [];
let APP_REF = null;
export function setCorpus(items, app) { CORPUS = items || []; if (app) APP_REF = app; }
/* Подписи статусов переводятся, значит опциям нужен app. Он один на всё
 * приложение, поэтому держим ссылку рядом с корпусом. */
export function APP() { return APP_REF; }

/* Значения фасетов выводятся из ДАННЫХ, а не из зашитого списка: корпус
 * дополняется, и зашитый список молча отстанет. */
export function statusOptions(app, items) {
  const seen = new Set((items || CORPUS).map((m) => m.status || "unknown"));
  return STATUS_ORDER.filter((s) => seen.has(s))
    .map((s) => [s, app.t(STATUS_KEY[s])]);
}

export function countryOptions(items) {
  const c = new Map();
  for (const m of (items || CORPUS)) {
    const k = m.country || "—";
    c.set(k, (c.get(k) || 0) + 1);
  }
  /* По убыванию числа: 47 стран, и посетителю нужнее СССР со 131 записью,
   * чем алфавит, где он окажется в середине. */
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => [k, k]);
}

export function decadeOptions(items) {
  const d = new Set();
  for (const m of (items || CORPUS)) {
    const y = typeof m.year === "number" ? m.year : null;
    if (y) d.add(Math.floor(y / 10) * 10);
  }
  return [...d].sort((a, b) => a - b).map((x) => [String(x), x + "-е"]);
}

function hay(m, key) {
  const v = m[key];
  if (Array.isArray(v)) return v.join(" ");
  return v == null ? "" : String(v);
}

/**
 * Применяет отбор ядра к списку записей.
 * @param {Array} items записи корпуса
 * @param {{query:string, filters:Object, sort:string}} find состояние от ядра
 */
/* Активен ли отбор. Нужен, чтобы отличить «пусто, потому что посетитель
 * отфильтровал всё» от «пусто, потому что сломалось»: первое — штатное
 * состояние и зелёный healthcheck, второе — авария. Без этого различия
 * сцена рапортует поломку на каждое сочетание фильтров без совпадений. */
export function finderActive(find) {
  const f = find || {};
  if ((f.query || "").trim()) return true;
  const fl = f.filters || {};
  return Object.keys(fl).some((k) => fl[k] != null && fl[k] !== "");
}

/* Ответ healthcheck на пустую выборку — один на все семь сцен. */
export function emptyVerdict(find, whenBroken) {
  return finderActive(find)
    ? { ok: true, detail: "отбор не дал совпадений" }
    : { ok: false, detail: whenBroken };
}

export function finderApply(items, find) {
  const f = find || {};
  let out = items;

  const fl = f.filters || {};
  if (fl.status) out = out.filter((m) => (m.status || "unknown") === fl.status);
  if (fl.country) out = out.filter((m) => (m.country || "—") === fl.country);
  if (fl.decade) {
    const d = Number(fl.decade);
    out = out.filter((m) => typeof m.year === "number"
      && Math.floor(m.year / 10) * 10 === d);
  }

  const q = (f.query || "").trim().toLowerCase();
  if (q) {
    out = out.filter((m) => FINDER_FIELDS.some(
      (fd) => hay(m, fd.key).toLowerCase().includes(q)));
  }
  return out;
}

/* Сортировки объявляются не везде — только где у порядка есть ВИДИМЫЙ эффект.
 * Записи без ключа уходят в конец: выбравший «по высоте» ищет высоты, а не
 * пустоты (прецедент 39 про год). */
export function finderSort(list, sort, heights) {
  if (!sort) return list;
  const arr = list.slice();
  if (sort === "az") {
    arr.sort((a, b) => String(a.city || "").localeCompare(String(b.city || ""), "ru"));
  } else if (sort === "height") {
    const H = (m) => {
      const h = heights && heights[m.id];
      return h ? h.statue + h.pedestal : -1;
    };
    arr.sort((a, b) => {
      const ha = H(a), hb = H(b);
      if (ha < 0 && hb < 0) return 0;
      if (ha < 0) return 1;
      if (hb < 0) return -1;
      return hb - ha;
    });
  }
  return arr;
}
