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
    };
  });
}

export async function loadQuotes(url = '../data/mtk38-quotes.json') {
  try {
    const d = await (await fetch(url)).json();
    return (d.quotes || []).filter((q) => q.show !== false).map((q) => ({
      ru: q.ru || '', en: q.en || '', work: q.work || '', pss: q.pss || '', src: q.source || '',
    }));
  } catch (_) { return []; }
}
