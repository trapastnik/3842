/* МТК 38 · общий слой сцен: данные, шрифты, карточка языка.
 *
 * Канон (data/mtk38.json) и издания (data/mtk38-publications.json) грузятся
 * ОДИН раз на всё приложение — сцены берут готовое из ctx.data.
 *
 * Ключевое для этого МТК: 128 языков дают всего 60 написаний. «Ленин» пишут
 * 36 языков, «Lenin» — 26. Поэтому композиции (глобус, дождь, студия) работают
 * с ФОРМАМИ (groupByWriting), иначе половина сцены — две повторяющиеся строки,
 * а тап по ним даёт формально верный, но случайный для зрителя язык.
 * Карта — исключение: там точки разнесены географией и подписаны языком.
 */

const CANON_URL = "../data/mtk38.json";
const PUBS_URL = "../data/mtk38-publications.json";
const ASSET_BASE = "../";

/* Шрифт написания: бренд для латиницы/кириллицы, своя Noto — для остальных.
 * Nolde только в крупном кегле: он декоративный и мелким нечитаем. */
export const famBig = (sc) =>
  sc === "Latn" || sc === "Cyrl"
    ? "'Nolde','20 Kopeek','noto-fallback','Arial Unicode MS',sans-serif"
    : "'Arial Unicode MS','noto-fallback','noto-" + sc + "',sans-serif";

export const famWord = (sc) =>
  sc === "Latn" || sc === "Cyrl"
    ? "'20 Kopeek','noto-fallback','Arial Unicode MS',sans-serif"
    : "'Arial Unicode MS','noto-fallback','noto-" + sc + "',sans-serif";

export const PAL = {
  paper: "#F7F9EF", brass: "#D2B773", red: "#A02128",
  window: "#9DA3A8", graphite: "#435059", telegrey: "#CFD0CF",
};

export const rgba = (hex, a) => {
  const v = hex.replace("#", "");
  return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)},${a})`;
};

let _cache = null;

export async function loadData() {
  if (_cache) return _cache;
  const [canon, pubsDoc] = await Promise.all([
    fetch(CANON_URL).then((r) => r.json()),
    /* Изданий может не быть — приложение это переживает и показывает языки.
     * Но «файл не прочитался» и «в файле честно пусто» — разные вещи, и
     * healthcheck должен их различать: первое авария, второе нет. */
    fetch(PUBS_URL).then((r) => r.json()).catch((e) => {
      console.warn("[data] издания не прочитаны", e);
      return { publications: [], __failed: true };
    }),
  ]);

  const langs = canon.languages.map((l) => {
    const p = (l.geo && l.geo.primary) || null;
    return {
      id: l.id, w: l.writing, sc: l.script.iso15924, scn: l.script.name_ru,
      n: l.name_ru, e: l.endonym, f: l.family,
      r: p ? p.region_ru : "диаспора",
      also: ((l.geo && l.geo.also) || []).map((a) => a.region_ru).filter(Boolean),
      src: l.writing_source, ver: l.verifier, wt: l.weight,
      pr: l.weight >= 3, un: l.un === true,
      lat: p ? p.lat : null, lng: p ? p.lng : null,
      speakers: l.speakers_mln,
    };
  });

  const pubs = new Map();
  for (const p of pubsDoc.publications || []) {
    if (!p.lang_id) continue;
    if (!pubs.has(p.lang_id)) pubs.set(p.lang_id, []);
    pubs.get(p.lang_id).push({
      area: p.area || "", titleNative: p.title_native || "", titleRu: p.title_ru || "",
      cityNative: p.city_native || "", publisherNative: p.publisher_native || "",
      cityRu: p.city_ru || "", publisherRu: p.publisher_ru || "", year: p.year || "",
      cityLat: p.city_lat ?? null, cityLng: p.city_lng ?? null,
      covers: (p.covers || []).map((c) => ASSET_BASE + c),
    });
  }

  _cache = { langs, forms: groupByWriting(langs), pubs, pubsOk: !pubsDoc.__failed };
  return _cache;
}

/* Языки с одинаковым написанием — в одну форму. Форма совместима по полям с
 * языком, отличает её `langs`, поэтому сцены и карточка работают с ней как есть. */
export function groupByWriting(langs) {
  const by = new Map();
  for (const l of langs) {
    if (!by.has(l.w)) by.set(l.w, []);
    by.get(l.w).push(l);
  }
  return [...by.values()].map((group) => {
    const primary = [...group].sort((a, b) => (b.un - a.un) || (b.wt - a.wt))[0];
    return {
      ...primary,
      wt: Math.max(...group.map((l) => l.wt)),
      pr: group.some((l) => l.pr),
      un: group.some((l) => l.un),
      langs: group,
    };
  });
}

/* ── STANDBY ────────────────────────────────────────────────────────
 *
 * Контракт ядра: scene.standby() зовётся БЕЗ аргумента и возвращает функцию
 * остановки собственного аттрактора. Вернула — ядро не паузит сцены и не
 * рисует свой оверлей поверх, зритель видит саму сцену; не вернула — ядро
 * гасит всё и включает свою заставку.
 *
 * Тонкость МТК 38: аттрактор — не одна сцена, а их чередование (решение
 * пользователя). Ядро запоминает ТУ функцию, что вернула первая сцена, и
 * ротация ему не видна. Поэтому все сцены возвращают ОДНУ и ту же ссылку —
 * `stopStandby` ниже: она гасит и петлю текущей сцены, и саму ротацию, какой
 * бы сцена ни оказалась активной к моменту прихода посетителя.
 */
const SB = { sceneStop: null, onStop: null };

/** Повесить подсказку жеста. Тонкая обёртка над китом: null-guard плюс единое
 * место, если сцене 38 когда-нибудь понадобится общий для всех умолчание.
 *
 * Здесь была подмена firstDelay для сцен, монтируемых во время заставки: кит
 * держал показ на ДВУХ таймерах (цикл простоя и одноразовый первый показ), а
 * poke()/hide() перевзводили только первый — сцена, смонтированная в ротации,
 * через 1.2 с зажигала призыв поверх аттрактора. С ядра 1.13.0 подавление
 * снимает оба таймера, и attach во время заставки рождается подавленным
 * (hint.js: applyMute снимает firstTimer, allOff гейтит show и arm). */
export function attachHint(app, root, opts) {
  if (!window.KioskHint || !root) return null;
  return window.KioskHint.attach(root, opts || {});
}

/** Сцена: вызвать в конце своего standby(), передав app, свой кадр и уборку.
 *
 * Петлю ведёт ядро (app.standbyTicker, 1.7.0) — один источник частоты на весь
 * киоск. Своего setInterval здесь больше нет; осталась только защита от
 * наложения: кадр WebGPU асинхронный и на 4K может не уложиться в такт.
 * `cleanup` — то, что сцена должна вернуть в исходное при выходе из заставки
 * (снять флаг, погасить своё автолистание).
 *
 * Подсказку жеста здесь больше не гасим. Раньше её приходилось дёргать в
 * каждом тике: показ висел на таймере бездействия, а в заставке бездействие
 * вечное — призыв загорался через полминуты поверх аттрактора и горел до утра.
 * С ядра 1.13.0 это гарантия кита: suppressAll(true) встаёт в НАЧАЛЕ
 * _enterStandby, до вызова standby() сцены, и держится через смены сцен
 * ротации; снимается в начале _exitStandby, до стоп-функций.
 */
export function beginStandby(app, tick, cleanup) {
  let busy = false;
  const draw = () => {
    if (busy) return;
    busy = true;
    /* try/catch, а не только .catch(): у карты и каталога кадр синхронный, и
     * синхронный бросок до создания промиса оставил бы busy=true навсегда —
     * заставка замерла бы до ночного рестарта. */
    try {
      Promise.resolve(tick())
        .catch((e) => console.warn("[standby tick]", e))
        .finally(() => { busy = false; });
    } catch (e) {
      busy = false;
      console.warn("[standby tick]", e);
    }
  };
  /* Гасим предыдущую петлю ПЕРЕД тем, как записать свою. Сейчас ротация делает
   * это сама, и сюда мы приходим с пустым SB.sceneStop — но если когда-нибудь
   * придём с непустым (показ сцены занял дольше целого такта), перезапись
   * ссылки осиротила бы старый тикер до ночного рестарта. Одна строка вместо
   * зависимости от порядка вызовов у зовущего. */
  stopSceneStandby();

  const stopTicker = app && app.standbyTicker
    ? app.standbyTicker(draw)
    : fallbackTicker(app, draw);
  SB.sceneStop = () => {
    stopTicker();
    if (cleanup) cleanup();
  };
  return stopStandby;
}

/* На случай ядра старше 1.7.0 (сборка на стенде может отстать). */
function fallbackTicker(app, draw) {
  const t = (app && app.config && app.config.timings) || {};
  const fps = Math.max(1, Math.min(30, t.standbyFps || 10));
  const id = setInterval(draw, Math.round(1000 / fps));
  return () => clearInterval(id);
}

/** app.js: сюда вешается остановка ротации. */
export function onStandbyStop(fn) { SB.onStop = fn; }

/** Ротация: погасить петлю уходящей сцены, не трогая ротацию. */
export function stopSceneStandby() {
  const fn = SB.sceneStop;
  SB.sceneStop = null;
  if (fn) { try { fn(); } catch (e) { console.warn("[standby stop]", e); } }
}

export function stopStandby() {
  stopSceneStandby();
  const fn = SB.onStop;
  if (fn) { try { fn(); } catch (e) { console.warn("[standby rotation stop]", e); } }
}

/* Размер контейнера, снятый в ШТАТНОМ пути отрисовки.
 *
 * ResizeObserver в фоновой вкладке не доставляет вообще — включая ПЕРВИЧНУЮ
 * доставку (грабли МТК 42, COORDINATION). Сцена, смонтированная в скрытом слое,
 * так и осталась бы с нулевым буфером: чёрный экран до первого ресайза окна.
 * Поэтому каждый кадр дёшево сверяем размер и зовём fit только на изменении.
 * Возвращает true, если размер сменился и сцене нужно пересобраться. */
export function pollSize(scene, el) {
  if (!el) return false;
  const w = el.clientWidth | 0, h = el.clientHeight | 0;
  if (!w || !h) return false;                    // слой ещё скрыт — ждём
  if (w === scene._pollW && h === scene._pollH) return false;
  scene._pollW = w; scene._pollH = h;
  return true;
}

/* Сцена смонтирована, но её слой не активен.
 *
 * По clientWidth это НЕ определяется: ядро прячет слои через visibility и
 * content-visibility, и у потомков скрытого слоя ширина сохраняется прежней.
 * Спрашиваем у самого слоя — так же, как стенд ядра. */
export function offScreen(el) {
  if (!el) return true;
  if (!el.clientWidth || !el.clientHeight) return true;
  return !!(el.closest && el.closest(".kiosk-layer:not(.is-active)"));
}

/* Сверка буфера для healthcheck.
 *
 * Канон GRABLI: сравнивать не с шириной бокса, а с ожиданием по ФАКТИЧЕСКОМУ
 * dpr. Кап 8.3 Мп законно опускает масштаб ниже единицы на боксе крупнее 4K,
 * и сравнение с боксом краснело бы на совершенно правильном буфере.
 * Возвращает строку с претензией или null, если всё в порядке. */
export function bufferComplaint(canvas, dpr, box) {
  if (!canvas) return "канваса нет";
  /* Мерим ПО СЛОЮ СЦЕНЫ, а не по самому канвасу. У WebGPU-сцен renderer.setSize
   * с updateStyle=true ставит канвасу CSS-размер тем же вызовом, что и буфер:
   * они согласованы по построению, и сравнение канваса с собой не покраснеет
   * никогда — буфер 2×2 на боксе 1600×1000 проходил как здоровый. */
  const ref = box || canvas;
  const r = ref.getBoundingClientRect();
  if (!r.width || !r.height) return null;        // слой скрыт — не наша беда
  const want = Math.floor(r.width * (dpr || 1));
  if (canvas.width < want * 0.9) {
    return `буфер ${canvas.width}×${canvas.height} при ожидании ${want} по ширине `
      + `(слой ${Math.round(r.width)}×${Math.round(r.height)}, dpr ${(dpr || 1).toFixed(2)})`;
  }
  return null;
}

/* Кап буфера для WebGPU-сцен: на 4K-смоуке dpr=2 давал 3840×2160×4 = 33 Мп
 * и просадку до неиграбельного. 8.3 Мп — потолок, дальше режем dpr. */
export const GPU_MAX_PIXELS = 8300000;

export function capDpr(w, h, maxPixels = GPU_MAX_PIXELS) {
  const raw = Math.min(globalThis.devicePixelRatio || 1, 2);
  const px = w * h * raw * raw;
  /* Пола в единицу нет: он превращал кап в фикцию — на 4K-боксе dpr оставался
   * 1 и буфер выходил за бюджет. Canvas 2D дешевле GPU, но 40 Мп на каталоге
   * — это те же мегапиксели памяти и та же просадка на заливке. */
  return px <= maxPixels ? raw : Math.sqrt(maxPixels / (w * h));
}
