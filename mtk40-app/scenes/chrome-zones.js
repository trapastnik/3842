/* Безопасные зоны хрома — временная замена тому, что должно приезжать из ядра.
 *
 * Тот же приём, что у пилота 42 (его chrome-zones.js): импортировать из чужой
 * зоны нельзя, поэтому здесь своя копия со своим префиксом переменных. Обе
 * умрут вместе, когда ядро отдаст настоящие зоны — заявка в COORDINATION.
 *
 * Ядро объявляет `--kiosk-safe-top/bottom`, но это просто отступ от кромки
 * (64/80 px), а не место, реально занятое хромом. Группа «языки + глаз»
 * (.kiosk-tools) и шестерёнка стоят поверх сцены и на 3840 доходят до ~174 px
 * сверху; навигация — снизу. Сцена, сверстанная от --kiosk-safe-top, кладёт
 * свой заголовок ровно под кнопки языков.
 *
 * Пока ядро не экспортирует настоящие зоны (заявка в COORDINATION), меряем
 * элементы хрома сами и публикуем:
 *     --m40-chrome-top     — докуда занято сверху (+ зазор)
 *     --m40-chrome-bottom  — докуда занято снизу (+ зазор)
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

  root.style.setProperty("--m40-chrome-top", Math.round(Math.max(edge, top + GAP)) + "px");
  root.style.setProperty("--m40-chrome-bottom", Math.round(Math.max(edgeB, bottom + GAP)) + "px");
}

export function installChromeZones(app) {
  /* Склейка через setTimeout, а не requestAnimationFrame: в неактивной
   * вкладке кадры заморожены, и первый замер просто не случился бы —
   * ровно та же ловушка, на которой спотыкалось ядро 1.0. */
  let timer = 0;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = 0; measureChrome(); }, 0);
  };

  /* Наблюдаем за самими элементами хрома: они меняют размер от режима
   * слабовидящих (таргеты ×1.25), от размера/положения навигации и от
   * скрытия переключателя языков. ResizeObserver срабатывает и сразу при
   * подписке — это же и есть надёжный первый замер: на момент запуска
   * приложения хрома в DOM ещё нет, поэтому «померить один раз в начале»
   * не работает. */
  let ro = null;
  const observeChrome = () => {
    const els = [".kiosk-tools", ".kiosk-gear", ".kiosk-nav"]
      .map((s) => document.querySelector(s)).filter(Boolean);
    if (!els.length) return false;
    if (ro) ro.disconnect();
    ro = new ResizeObserver(schedule);
    els.forEach((el) => ro.observe(el));
    schedule();
    return true;
  };

  app.on("started", () => { observeChrome(); schedule(); });
  app.on("a11y", schedule);
  app.on("setting", () => { observeChrome(); schedule(); });
  app.on("scene-changed", schedule);
  window.addEventListener("resize", schedule, { passive: true });

  /* Хром строится асинхронно внутри start(); если его ещё нет — ждём. */
  if (!observeChrome()) {
    let tries = 0;
    const wait = setInterval(() => {
      if (observeChrome() || ++tries > 40) clearInterval(wait);
    }, 50);
  }
  measureChrome();
  return { measure: measureChrome };
}
