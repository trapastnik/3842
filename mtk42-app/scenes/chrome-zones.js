/* Безопасные зоны хрома — временная замена тому, что должно приезжать из ядра.
 *
 * Ядро объявляет `--kiosk-safe-top/bottom`, но это просто отступ от кромки
 * (64/80 px), а не место, реально занятое хромом. Группа «языки + глаз»
 * (.kiosk-tools) и шестерёнка стоят поверх сцены и на 3840 доходят до ~174 px
 * сверху; навигация — снизу. Сцена, сверстанная от --kiosk-safe-top, кладёт
 * свой заголовок ровно под кнопки языков.
 *
 * Пока ядро не экспортирует настоящие зоны (заявка в COORDINATION), меряем
 * элементы хрома сами и публикуем:
 *     --m42-chrome-top     — докуда занято сверху (+ зазор)
 *     --m42-chrome-bottom  — докуда занято снизу (+ зазор)
 * Когда ядро отдаст свои переменные, этот файл удаляется, а в styles.css
 * меняется только имя переменной.
 */

const GAP = 24;                     // воздух между хромом и содержимым сцены

function rectOf(sel) {
  const el = document.querySelector(sel);
  if (!el || el.hidden) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? r : null;
}

export function measureChrome() {
  const vh = window.innerHeight || 0;
  let top = 0, bottom = 0;

  /* Верх: всё, что стоит в верхней половине экрана. */
  for (const sel of [".kiosk-tools", ".kiosk-gear"]) {
    const r = rectOf(sel);
    if (r && r.top < vh / 2) top = Math.max(top, r.bottom);
  }
  /* Низ: навигация (её можно увести наверх — тогда она попадёт в top). */
  const nav = rectOf(".kiosk-nav");
  if (nav) {
    if (nav.top >= vh / 2) bottom = Math.max(bottom, vh - nav.top);
    else top = Math.max(top, nav.bottom);
  }

  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const edge = parseFloat(cs.getPropertyValue("--edge-safe")) || 64;
  const edgeB = parseFloat(cs.getPropertyValue("--edge-safe-bottom")) || 80;

  root.style.setProperty("--m42-chrome-top", Math.round(Math.max(edge, top + GAP)) + "px");
  root.style.setProperty("--m42-chrome-bottom", Math.round(Math.max(edgeB, bottom + GAP)) + "px");
}

export function installChromeZones(app) {
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; measureChrome(); });
  };

  app.on("started", schedule);
  /* Хром меняет размер от: режима слабовидящих, положения/размера навигации,
   * показа переключателя языков и кнопки глаза — всё это ходит через события. */
  app.on("a11y", schedule);
  app.on("setting", schedule);
  app.on("scene-changed", schedule);
  window.addEventListener("resize", schedule, { passive: true });

  /* Первый замер — после того как ядро построило хром. */
  schedule();
  return { measure: measureChrome };
}
