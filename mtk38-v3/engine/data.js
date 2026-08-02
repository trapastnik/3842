// МТК 38 v3 · engine/data.js
// ЕДИНЫЙ источник слов/цитат для всех v3-композиций — читает КАНОНИЧЕСКИЙ data/mtk38.json
// в рантайме (тот же файл, из которого V2 собирает свои HTML через build_*.py).
// Маппинг полей идентичен build_globe.py / build_words_v3.py:
//   w=writing · sc=script.iso15924 · scn=script.name_ru · n=name_ru · e=endonym ·
//   f=family · r=geo.primary.region_ru (или «диаспора») · also=[geo.also.region_ru] ·
//   src=writing_source · ver=verifier · wt=weight · pr=(weight>=3).
// Никакого отдельного сгенерированного words.js → канон один, мердж с V2 чистый,
// правка 52→53 (и любая) подхватывается без перегенерации.

export async function loadWords(url = '../data/mtk38.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('data/mtk38.json: HTTP ' + res.status);
  const d = await res.json();
  return d.languages.map((l) => {
    const p = l.geo && l.geo.primary;
    const also = ((l.geo && l.geo.also) || []).map((a) => a.region_ru).filter(Boolean);
    return {
      id: l.id, w: l.writing, sc: l.script.iso15924, scn: l.script.name_ru,
      n: l.name_ru, e: l.endonym, f: l.family,
      r: p ? p.region_ru : 'диаспора',
      also, src: l.writing_source, ver: l.verifier, wt: l.weight, pr: l.weight >= 3,
      un: l.un === true,                              // официальный язык ООН (6 шт.)
      lat: p ? p.lat : null, lng: p ? p.lng : null,   // гео-координаты (для карты)
      speakers: l.speakers_mln,
    };
  });
}

// Группировка языков по НАПИСАНИЮ — для композиций (глобус, дождь, студия).
//
// После расширения канона до 128 языков на 60 форм повторы стали доминировать:
// «Ленин» пишут 36 языков, «Lenin» — 26, вместе это половина сферы. Зритель видел
// стену одинаковых слов, а тап по ней давал формально верный, но случайный язык.
// Поэтому в композициях одна ФОРМА = один объект; все её языки — в карточке.
// Карта группировку НЕ использует: там точки разнесены географией и подписаны.
//
// Форма совместима по полям с языком (id, w, sc, wt, pr, un…), поэтому сцены,
// атлас и карточка работают с ней без изменений; отличает её поле `langs`.
export function groupByWriting(words) {
  const byWriting = new Map();
  for (const w of words) {
    if (!byWriting.has(w.w)) byWriting.set(w.w, []);
    byWriting.get(w.w).push(w);
  }
  return [...byWriting.values()].map((langs) => {
    // «главный» язык формы — рабочий язык ООН, иначе самый весомый, иначе первый
    const primary = [...langs].sort((a, b) => (b.un - a.un) || (b.wt - a.wt))[0];
    return {
      ...primary,
      wt: Math.max(...langs.map((l) => l.wt)),
      pr: langs.some((l) => l.pr),
      un: langs.some((l) => l.un),
      langs,
    };
  });
}

// Издания В.И. Ленина по языкам (data/mtk38-publications.json).
// Один язык → N изданий, поэтому возвращаем Map: lang_id → [издание, …].
// base — префикс к путям обложек: они записаны от корня репозитория.
export async function loadPublications(url = '../data/mtk38-publications.json', base = '../') {
  try {
    const d = await (await fetch(url)).json();
    const by = new Map();
    for (const p of d.publications || []) {
      if (!p.lang_id) continue;
      const covers = (p.covers || []).map((c) => base + c);
      if (!by.has(p.lang_id)) by.set(p.lang_id, []);
      by.get(p.lang_id).push({
        area: p.area || '', section: p.section || '',
        titleNative: p.title_native || '', authorNative: p.author_native || '',
        cityNative: p.city_native || '', publisherNative: p.publisher_native || '',
        titleRu: p.title_ru || '', cityRu: p.city_ru || '', publisherRu: p.publisher_ru || '',
        year: p.year || '', covers,
        // координаты ГОРОДА ПЕЧАТИ — для слоя изданий на карте
        cityLat: p.city_lat ?? null, cityLng: p.city_lng ?? null,
      });
    }
    return by;
  } catch (_) { return new Map(); }
}

export async function loadQuotes(url = '../data/mtk38-quotes.json') {
  try {
    const d = await (await fetch(url)).json();
    return (d.quotes || []).filter((q) => q.show !== false).map((q) => ({
      ru: q.ru || '', en: q.en || '', work: q.work || '', pss: q.pss || '', src: q.source || '',
    }));
  } catch (_) { return []; }
}
