/* ============================================================
 * BMK 38-42 · KioskHint — призыв к жесту (зона координатора)
 * Единый вид «рука-пинч / потяните» для всех МТК.
 *
 * Подключение (после kiosk.css, обычный script):
 *   <script src="../assets/shared/kiosk/hint.js"></script>
 *   KioskHint.attach(stageEl, { gesture: "pinch" });               // зум щипком
 *   KioskHint.attach(stageEl, { gesture: "drag",  label: "Тяните карту" });
 *   KioskHint.attach(stageEl, { gesture: "swipe", label: "Листайте" });
 *
 * Поведение: подсказка видна при простое; гаснет по первому
 * pointerdown/wheel на контейнере; возвращается после idleMs (30 с)
 * без взаимодействий. Никаких зависимостей, чистый vanilla.
 * ============================================================ */
(function () {
  "use strict";

  var ICONS = {
    /* два пальца сходятся — щипок */
    pinch:
      '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">' +
      '<circle cx="30" cy="26" r="7"/><circle cx="66" cy="26" r="7"/>' +
      '<path d="M30 36 L40 52 M66 36 L56 52"/>' +
      '<path d="M24 78 C24 64 34 56 48 56 C62 56 72 64 72 78"/>' +
      "</svg>",
    /* ладонь тянет в сторону */
    drag:
      '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">' +
      '<circle cx="48" cy="44" r="9"/>' +
      '<path d="M14 44 H30 M66 44 H82"/>' +
      '<path d="M22 36 L14 44 L22 52 M74 36 L82 44 L74 52"/>' +
      "</svg>",
    /* палец касается — круги расходятся */
    tap:
      '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">' +
      '<circle cx="48" cy="40" r="8"/>' +
      '<circle cx="48" cy="40" r="18" opacity=".55"/>' +
      '<circle cx="48" cy="40" r="28" opacity=".25"/>' +
      '<path d="M34 74 C34 62 40 56 48 56 C56 56 62 62 62 74"/>' +
      "</svg>",
    /* горизонтальный свайп */
    swipe:
      '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">' +
      '<path d="M20 60 C34 44 62 44 76 60"/>' +
      '<path d="M64 54 L76 60 L70 72"/>' +
      '<circle cx="26" cy="34" r="7"/>' +
      "</svg>",
  };

  var DEFAULT_LABEL = {
    pinch: "Сведите или разведите пальцы",
    drag: "Тяните, чтобы перемещаться",
    tap: "Коснитесь, чтобы открыть",
    swipe: "Листайте свайпом",
  };

  /* Элементы, внутрь которых браузер НЕ РИСУЕТ детей: их содержимое —
   * запасной контент для тех, кто тег не поддерживает. Подсказка,
   * повешенная на <canvas>, невидима с рождения — так она и жила у пяти
   * сцен МТК 38 и на карте 42, пока не вскрылось ревью. */
  var VOID_HOSTS = { CANVAS: 1, IMG: 1, VIDEO: 1, IFRAME: 1, OBJECT: 1 };

  function scrolls(el) {
    var cs = getComputedStyle(el);
    return /(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX);
  }

  /* Куда вешать на самом деле: сам контейнер либо его родитель. */
  function resolveHost(target) {
    if (!target || !target.tagName) return null;

    /* Прокручиваемый контейнер: absolute внутри него отсчитывается от
     * ВЫСОТЫ СОДЕРЖИМОГО, а не от видимой области — у маятника 42
     * подсказка встала на y = −188, за верхней кромкой. Поднимаемся до
     * первого непрокручиваемого предка. */
    if (!VOID_HOSTS[target.tagName] && scrolls(target)) {
      var up = target.parentElement;
      while (up && up !== document.body && scrolls(up)) up = up.parentElement;
      if (up && up !== document.body) {
        console.warn("[KioskHint] контейнер прокручивается — подсказка повешена на " +
          "ближайшего непрокручиваемого предка. Внутри скроллера absolute считается " +
          "от высоты содержимого, и подсказка уезжает за кромку.");
        return up;
      }
      console.warn("[KioskHint] контейнер прокручивается, непрокручиваемого предка " +
        "нет — подсказка может уехать за кромку. Передавайте обёртку сцены.");
      return target;
    }

    if (!VOID_HOSTS[target.tagName]) return target;
    var parent = target.parentElement;
    if (!parent) {
      console.warn("[KioskHint] <" + target.tagName.toLowerCase() + "> не отображает " +
        "вложенные элементы, а родителя нет — подсказка не будет видна. " +
        "Передавайте контейнер сцены, а не холст.");
      return null;
    }
    console.warn("[KioskHint] подсказка повешена на родителя: <" +
      target.tagName.toLowerCase() + "> не отображает вложенные элементы " +
      "(его содержимое — запасной контент). Передавайте контейнер сцены.");
    return parent;
  }

  var EVENTS = ["pointerdown", "wheel", "touchstart"];

  /* Уже созданные подсказки: контейнер → ручка. Нужен, чтобы повторный
   * attach на тот же контейнер ОБНОВЛЯЛ подсказку, а не вешал вторую.
   * Типовой паттерн сцен — «destroy + attach на смену языка» — иначе
   * копил бы слушатели и таймеры весь день (сцены keepAlive, контейнер
   * живёт до перезагрузки). */
  var attached = typeof WeakMap === "function" ? new WeakMap() : null;

  function attach(target, opts) {
    if (!target) return null;
    opts = opts || {};

    /* Холст детей не рисует — вешаемся на родителя. Иначе подсказка
     * существует в DOM и не видна никогда. */
    target = resolveHost(target);
    if (!target) return null;

    /* Повторный вызов — не новая подсказка, а обновление прежней.
     * И БЕЗ firstDelay: он для первого показа после загрузки, а на
     * смене языка вспыхивал бы посреди взаимодействия. */
    var existing = attached && attached.get(target);
    if (existing) {
      existing.update(opts);
      return existing;
    }

    if (opts.gesture && !ICONS[opts.gesture]) {
      console.warn("[KioskHint] нет жеста «" + opts.gesture + "», беру pinch. " +
        "Доступны: " + Object.keys(ICONS).join(", "));
    }
    var gesture = ICONS[opts.gesture] ? opts.gesture : "pinch";
    var idleMs = opts.idleMs || 30000;
    var firstDelay = opts.firstDelay || 1200; /* не мигать во время загрузки */

    var el = document.createElement("div");
    el.className = "kiosk-hint";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML =
      '<div class="kiosk-hint__icon">' + ICONS[gesture] + "</div>" +
      '<div class="kiosk-hint__label"></div>';
    injectCss();

    var labelEl = el.querySelector(".kiosk-hint__label");
    var iconEl = el.querySelector(".kiosk-hint__icon");
    labelEl.textContent = opts.label || DEFAULT_LABEL[gesture];

    /* позиционируемся относительно контейнера */
    var cs = getComputedStyle(target);
    if (cs.position === "static") target.style.position = "relative";
    target.appendChild(el);

    var idleTimer = null, firstTimer = null, shown = false, dead = false;

    function show() { if (dead) return; shown = true; el.classList.add("is-on"); }

    /* hide() ПЕРЕВЗВОДИТ цикл. Раньше он только снимал класс, а таймер
     * оставался отстрелянным: сцена, гасившая подсказку руками (например,
     * при уходе в заставку), больше не показывала её никогда — у МТК 40
     * будящее касание уходит в оверлей и до poke() не доходит. */
    function hide() {
      shown = false;
      el.classList.remove("is-on");
      if (dead) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(show, idleMs);
    }
    function poke() {
      if (dead) return;
      if (shown) hide();
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(show, idleMs);
    }

    EVENTS.forEach(function (ev) {
      target.addEventListener(ev, poke, { passive: true });
    });

    firstTimer = setTimeout(show, firstDelay);
    idleTimer = setTimeout(show, idleMs);

    var handle = {
      show: show,
      hide: hide,

      /* Публичный перевзвод: сцена отмечает взаимодействие, которое до
       * контейнера не дошло (жест перехвачен, касание съел оверлей). */
      poke: poke,
      rearm: function () {
        if (dead) return handle;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(show, idleMs);
        return handle;
      },

      /* Сменить подпись (и, если нужно, жест) без пересоздания. */
      setLabel: function (text) {
        if (dead) return handle;
        labelEl.textContent = text || DEFAULT_LABEL[gesture];
        return handle;
      },
      update: function (next) {
        if (dead) return handle;
        next = next || {};
        if (next.gesture && ICONS[next.gesture] && next.gesture !== gesture) {
          gesture = next.gesture;
          iconEl.innerHTML = ICONS[gesture];
        }
        if (next.idleMs && next.idleMs !== idleMs) {
          idleMs = next.idleMs;
          /* Перевзводим взведённый таймер: иначе новый интервал начал бы
           * действовать только после следующего касания. */
          if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(show, idleMs);
          }
        }
        handle.setLabel(next.label);
        return handle;
      },

      /* Снимает ВСЁ своё: элемент, слушатели, оба таймера. Раньше уходил
       * только элемент — слушатели на контейнере и взведённый таймер
       * жили до перезагрузки страницы. */
      destroy: function () {
        if (dead) return;
        dead = true;
        if (idleTimer) clearTimeout(idleTimer);
        if (firstTimer) clearTimeout(firstTimer);
        idleTimer = firstTimer = null;
        EVENTS.forEach(function (ev) { target.removeEventListener(ev, poke); });
        el.remove();
        if (attached) attached["delete"](target);
      }
    };

    if (attached) attached.set(target, handle);
    return handle;
  }

  var cssDone = false;
  function injectCss() {
    if (cssDone) return;
    cssDone = true;
    var s = document.createElement("style");
    s.textContent =
      /* От --chrome-bottom, а не от кромки: под навигацией уже занято, и
         подсказка ложилась прямо на неё (замер 42: хинт 1974..2076 при
         навигации 1882..2080). Кромка — фолбэк, если ядра рядом нет. */
      ".kiosk-hint{position:absolute;left:50%;" +
      "bottom:calc(var(--chrome-bottom,var(--edge-safe-bottom,80px)) + 12px);" +
      "transform:translateX(-50%) translateY(8px);display:flex;align-items:center;gap:18px;" +
      /* Цвета — через токены кита, как везде: зашитые каналы молча
         разъезжаются с палитрой при её смене. */
      "padding:18px 28px;border-radius:999px;" +
      "background:rgba(var(--kiosk-ink-rgb,12,16,18),.72);" +
      "border:1px solid rgba(var(--brass-rgb,210,183,115),.45);color:var(--brass,#D2B773);" +
      "opacity:0;pointer-events:none;transition:opacity .5s ease,transform .5s ease;z-index:40;}" +
      ".kiosk-hint.is-on{opacity:1;transform:translateX(-50%) translateY(0);}" +
      ".kiosk-hint__icon{width:64px;height:64px;}" +
      ".kiosk-hint__icon svg{width:100%;height:100%;animation:kioskHintPulse 2.4s ease-in-out infinite;}" +
      ".kiosk-hint__label{font-family:'20 Kopeek','Courier New',monospace;font-size:26px;" +
      "letter-spacing:.08em;text-transform:uppercase;color:var(--paper,#F7F9EF);white-space:nowrap;}" +
      "@keyframes kioskHintPulse{0%,100%{transform:scale(1)}50%{transform:scale(.88)}}";
    document.head.appendChild(s);
  }

  window.KioskHint = { attach: attach };
})();
