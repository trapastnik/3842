/* Mtk41Stats — сводка по корпусу data/mtk41.json для подзаголовков прототипов.
 *
 * Зачем: числа в подзаголовках были вписаны руками («236 памятников»,
 * «19 памятников», «Десять скульпторов») и устаревали при каждом пополнении от
 * куратора — на 2026-08-01 половина из них врала на порядок. Считаем из данных.
 *
 * Подключение: <script src="../assets/mtk41/lib/corpus-stats.js"></script>
 * перед скриптом прототипа, затем после загрузки данных —
 *     Mtk41Stats.setSubtitle(s => `${s.count} памятников, ${s.years}`);
 */
(function (global) {
  "use strict";

  /* «283 памятника», «47 стран», «1 памятник» — согласование числительного.
   * forms: [1, 2-4, 5-0]. Названия городов НЕ склоняем нигде в подзаголовках:
   * автоматически это не сделать («от Осташкова», но «от Винь»), поэтому
   * формулировки построены так, чтобы город стоял в именительном. */
  function plural(n, forms) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  function of(items) {
    const list = Array.isArray(items) ? items : [];
    const years = list.map(m => m.year).filter(y => typeof y === "number");
    const dated = list.filter(m => typeof m.year === "number")
                      .sort((a, b) => a.year - b.year);
    const sculptors = new Map();
    const perYear = new Map();
    const kinds = Object.create(null);
    const statuses = Object.create(null);
    for (const m of list) {
      for (const s of (m.sculptors || [])) sculptors.set(s, (sculptors.get(s) || 0) + 1);
      if (typeof m.year === "number") perYear.set(m.year, (perYear.get(m.year) || 0) + 1);
      kinds[m.kind] = (kinds[m.kind] || 0) + 1;
      statuses[m.status] = (statuses[m.status] || 0) + 1;
    }
    let topSculptor = null, peakYear = null, peakCount = 0;
    for (const [name, n] of sculptors) {
      if (!topSculptor || n > topSculptor.count) topSculptor = { name, count: n };
    }
    for (const [y, n] of perYear) {
      if (n > peakCount) { peakCount = n; peakYear = y; }
    }
    const minYear = years.length ? Math.min(...years) : null;
    const maxYear = years.length ? Math.max(...years) : null;
    return {
      count: list.length,
      minYear, maxYear,
      years: minYear ? `${minYear}–${maxYear}` : "",
      first: dated[0] || null,
      last: dated[dated.length - 1] || null,
      sculptorCount: sculptors.size,
      topSculptor, peakYear, peakCount,
      countryCount: new Set(list.map(m => m.country).filter(Boolean)).size,
      kinds, statuses,
      // Сколько объектов не являются скульптурой или бюстом — геоглифы,
      // наскальные изображения, стальной силуэт, мемориальная плита.
      nonSculptural: list.filter(m => m.kind && m.kind !== "sculpture" && m.kind !== "bust").length,
      firstWave: list.filter(m => m.wave === "first").length,
    };
  }

  /** Заполняет .subtitle текущей страницы. compose получает объект статистики. */
  function setSubtitle(items, compose) {
    const el = document.querySelector(".subtitle");
    if (!el) return;
    try {
      const text = compose(of(items));
      if (text) el.textContent = text;
    } catch (e) {
      /* подзаголовок — украшение; молча оставляем то, что в разметке */
    }
  }

  /* Подпись «город · чем этот памятник примечателен».
   *
   * Заголовки в корпусе почти всегда родовые и уже содержат город: «Памятник
   * Ленину — Иваново-Вознесенск», «Памятник Ленину в Абакан». Наивное срезание
   * префикса давало «Воронеж · в Воронеж». Срезаем и родовую часть, и сам
   * город; если после этого ничего не осталось — добавляем тип объекта, но
   * только когда он не «скульптура» (бюст, геоглиф, барельеф — это уже
   * информация, скульптура — умолчание). */
  function label(m) {
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

  global.Mtk41Stats = { of, setSubtitle, plural, label };
})(window);
