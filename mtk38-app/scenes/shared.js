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
    fetch(PUBS_URL).then((r) => r.json()).catch(() => ({ publications: [] })),
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

  _cache = { langs, forms: groupByWriting(langs), pubs };
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

/* Кап буфера для WebGPU-сцен: на 4K-смоуке dpr=2 давал 3840×2160×4 = 33 Мп
 * и просадку до неиграбельного. 8.3 Мп — потолок, дальше режем dpr. */
export const GPU_MAX_PIXELS = 8300000;

export function capDpr(w, h, maxPixels = GPU_MAX_PIXELS) {
  const raw = Math.min(globalThis.devicePixelRatio || 1, 2);
  const px = w * h * raw * raw;
  return px <= maxPixels ? raw : Math.max(1, Math.sqrt(maxPixels / (w * h)));
}
