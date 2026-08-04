/* Перебор состояний фильтров с проверкой healthcheck() — МТК 39.
 *
 * Зачем. Стенд приёмки зовёт healthcheck() один раз, в том состоянии, в каком
 * застал сцену. Это ловит «загружено, но пусто», но не ловит обратную ошибку —
 * когда сцена краснеет на законном состоянии экрана. У нас такие нашлись сразу
 * две: категория «Астероиды», где обе записи живут в списке «не на карте», и
 * комбинация республика × судьба имени с честным нулём точек (Азербайджан +
 * «носит имя»). Обе прошли мимо селфтеста: idle-сброс успевал очистить фильтры
 * посреди замера.
 *
 * Как гонять: открыть приложение по http, в консоли
 *   await filterSweep(mtk39App)
 * Возвращает { checked, failures, bad } — bad пуст, если ложных тревог нет.
 * Таймеров не использует: работает и в фоновой вкладке, где setInterval душится.
 *
 * Селекторы — от разметки МТК 39; для другого МТК меняется только карта SCENES.
 */
window.filterSweep = async function filterSweep(app) {
  const SCENES = [
    { id: "union", controls: [".m39-union .m39-republic", ".m39-union .m39-chip"] },
    { id: "globe", controls: [".m39-globe .m39-chip"] },
    { id: "world", controls: [".m39-world .m39-chip"] },
  ];
  const bad = [];
  let checked = 0;

  const health = (id) => {
    const rec = (app._records || []).find((r) => r.id === id);
    if (!rec || !rec.scene.healthcheck) return null;
    return rec.scene.healthcheck();
  };

  for (const scene of SCENES) {
    await app.showScene(scene.id);
    const groups = scene.controls.map((sel) => [...document.querySelectorAll(sel)]);
    // декартово произведение всех групп контролов сцены
    const walk = (i, trail) => {
      if (i === groups.length) {
        checked += 1;
        const h = health(scene.id);
        if (h && !h.ok) bad.push({ scene: scene.id, state: trail.slice(), detail: h.detail });
        return;
      }
      for (const btn of groups[i]) {
        btn.click();
        walk(i + 1, trail.concat(btn.textContent.trim().replace(/\s+/g, " ")));
      }
    };
    if (groups.every((g) => g.length)) walk(0, []);
  }

  console.info("[filter-sweep] состояний проверено: " + checked +
    ", ложных тревог: " + bad.length);
  if (bad.length) console.table(bad);
  return { checked, failures: bad.length, bad };
};
