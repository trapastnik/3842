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

  /* Ближайший прокручиваемый ПРЕДОК. Мало проверять сам узел: холст
   * внутри скроллера лежит в обычном div-е, и подъём на этот div
   * оставляет подсказку внутри прокрутки — она всё так же уезжает за
   * кромку (ядро ещё и делает такой контейнер position:relative). */
  function scrollParent(el) {
    var p = el.parentElement;
    while (p && p !== document.body) {
      if (scrolls(p)) return p;
      p = p.parentElement;
    }
    return null;
  }

  /* Куда вешать на самом деле.
   *
   * Обе причины подъёма проверяются В ЦИКЛЕ, а не по очереди: холст
   * внутри скроллера проходил canvas-веткой и возвращал прокручиваемого
   * родителя без единой проверки — то есть ровно тот случай y = −188,
   * который считался закрытым (карта 42 вешает именно на холст). */
  function resolveHost(target) {
    if (!target || !target.tagName) return null;

    var node = target, why = null, guard = 0;
    while (node && node !== document.body && guard++ < 64) {
      if (VOID_HOSTS[node.tagName]) {
        /* Содержимое такого тега — запасной контент, браузер его не рисует. */
        why = why || "void";
        node = node.parentElement;
        continue;
      }
      /* Выбираемся из ПРОКРУТКИ ЦЕЛИКОМ, а не на шаг: внутри скроллера
       * absolute считается от высоты содержимого, и подсказка уезжает за
       * кромку — хоть на самом скроллере, хоть на любом его потомке. */
      var sc = scrolls(node) ? node : scrollParent(node);
      if (sc && sc !== document.body) {
        why = "scroll";
        node = sc.parentElement;
        continue;
      }
      break;
    }

    if (!node || node === document.body) {
      console.warn("[KioskHint] не нашёл подходящего контейнера " +
        "(холст без родителя либо всё дерево прокручивается) — подсказка не будет " +
        "видна или уедет за кромку. Передавайте обёртку сцены.");
      return node && node !== document.body ? node : null;
    }
    if (node !== target) {
      console.warn("[KioskHint] подсказка поднята на <" + node.tagName.toLowerCase() +
        ">: исходный контейнер " + (why === "scroll" ? "прокручивается" :
        "не отображает вложенные элементы") + ". Передавайте обёртку сцены, а не холст.");
    }
    return node;
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
      /* Владение считается по ФИНАЛЬНОМУ хосту, а не по тому, что
       * передали: после подъёма два разных контейнера внутри одного
       * скроллера сходятся в один хост. Молчаливая перезапись жеста и
       * подписи — как раз то, обо что спотыкаются сцены со списками. */
      if (opts.gesture && existing.gesture && opts.gesture !== existing.gesture) {
        console.warn("[KioskHint] на этом контейнере уже есть подсказка «" +
          existing.gesture + "», перезаписываю на «" + opts.gesture + "». " +
          "Два владельца сошлись в один хост (частый случай — оба внутри " +
          "одного скроллера). Дайте им разные непрокручиваемые обёртки.");
      }
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

    /* ПОЗИЦИЯ СЧИТАЕТСЯ ОТ РЕАЛЬНОГО НИЗА КОНТЕЙНЕРА, а не от зоны хрома.
     *
     * Голое bottom: var(--chrome-bottom) годится только когда хост — во
     * весь экран. У МТК 40 хост это поле канвы, УЖЕ отбитое от хрома, и
     * отступ считался дважды: подсказка висела на ~92 px выше нужного,
     * им пришлось заводить локальное правило-компенсацию. Считаем, сколько
     * хост уже отбил сам, и добираем только недостающее.
     *
     * Это же снимает вертикальный дефицит из замеров 40: пилюля растёт от
     * ×1.25 на 26 px при зазоре до навигации 12 px, и без пересчёта наехала
     * бы на неё именно в режиме слабовидящих. */
    function place() {
      if (dead || !el.isConnected) return;
      var root = el.closest(".kiosk-app") || document.documentElement;
      var cs = getComputedStyle(root);
      var ui = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue("--ui-scale")) || 1;
      /* Ноль — это ЗНАЧЕНИЕ, а не отсутствие. Через `||` нулевая зона
       * хрома (сцена спрятала навигацию) проваливалась бы до кромки и
       * дальше до 80 px, и подсказка висела бы на пустом месте. */
      var chrome = parseFloat(cs.getPropertyValue("--chrome-bottom"));
      if (!isFinite(chrome)) chrome = parseFloat(cs.getPropertyValue("--edge-safe-bottom"));
      if (!isFinite(chrome)) chrome = 80;
      var host = target.getBoundingClientRect();
      if (!host.height) return;                       /* раскладки ещё нет */
      var cleared = window.innerHeight - host.bottom; /* хост уже отбит на столько */
      var need = Math.max(0, chrome - cleared);

      /* Ставим ПЕРЕМЕННУЮ, а не bottom.
       *
       * Инлайновый bottom бил бы любые правила приложений — а они там не от
       * невежества: кит не знает про НИЖНИЕ КОНТРОЛЫ САМОЙ СЦЕНЫ (плеер со
       * шкалой лет у 39, ряд чипов у 42), и подъём над ними может задать
       * только сцена. Разделяем ответственность: база (обойти хром ядра) —
       * наша, добавка (обойти своё) — их, через --kiosk-hint-lift.
       * Заодно старые правила с bottom продолжают работать как раньше:
       * миграция становится добровольной, а не обязательной в день merge. */
      el.style.setProperty("--kiosk-hint-base", Math.round(need + 12 * ui) + "px");
    }

    function show() { if (dead) return; place(); shown = true; el.classList.add("is-on"); }

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

    /* Пересчёт позиции: хост меняет размер (a11y, поворот, чужая
     * раскладка) — подсказка едет следом. */
    var ro = null;
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(place);
      ro.observe(target);
    }
    window.addEventListener("resize", place, { passive: true });

    /* Одного RO мало. База зависит не только от размера хоста, но и от
     * ТОКЕНОВ ЯДРА (--chrome-bottom, --ui-scale), а они меняются без его
     * участия: оператор включил слабовидящих, кнопки языков перенеслись
     * в две строки, сцена спрятала навигацию. Хост, сверстанный не от зон
     * хрома, при этом не дрогнет — RO промолчит, и база останется от
     * прежней раскладки.
     *
     * Ядро выставляет эти переменные инлайном (--ui-scale на <html>,
     * --chrome-* на .kiosk-app), поэтому ловим мутацию style. Петли нет:
     * place() пишет в el, а он тут не наблюдается. MutationObserver, в
     * отличие от ResizeObserver и rAF, работает и в фоновой вкладке. */
    var mo = null;
    if (typeof MutationObserver === "function") {
      mo = new MutationObserver(place);
      var watch = { attributes: true, attributeFilter: ["style"] };
      mo.observe(document.documentElement, watch);
      var appRoot = el.closest(".kiosk-app");
      if (appRoot && appRoot !== document.documentElement) mo.observe(appRoot, watch);
    }

    /* В фоновой вкладке RO не доставляется вовсе, а resize не приходит:
     * если хост сменил размер, пока вкладку не показывали, база устареет
     * молча. Досчитываем на возврате. (Остаётся один непокрытый случай:
     * хост ПЕРЕЕХАЛ, не изменив размера, — его не видит ни RO, ни MO;
     * он лечится сам при следующем show(), который зовёт place().) */
    function onVis() { if (!document.hidden) place(); }
    document.addEventListener("visibilitychange", onVis);

    firstTimer = setTimeout(show, firstDelay);
    idleTimer = setTimeout(show, idleMs);
    place();

    var handle = {
      show: show,
      hide: hide,
      get gesture() { return gesture; },

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
        if (ro) { ro.disconnect(); ro = null; }
        if (mo) { mo.disconnect(); mo = null; }
        window.removeEventListener("resize", place);
        document.removeEventListener("visibilitychange", onVis);
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
      /* ВСЕ РАЗМЕРЫ — ОТ --ui-scale. Подсказка это контрол, а не контент;
         зашитые пиксели означали, что в режиме слабовидящих растёт весь
         интерфейс, кроме единственного призыва к жесту (находка 40).
         Фолбэк 1 — если кит подключён без ядра. */
      /* База считается в JS от реального низа контейнера (--kiosk-hint-base);
         до первого place() работает фолбэк от зоны хрома. Добавка сцены —
         --kiosk-hint-lift: подъём над СВОИМИ нижними контролами, о которых
         кит знать не может. */
      ".kiosk-hint{position:absolute;left:50%;" +
      "bottom:calc(var(--kiosk-hint-base," +
      "calc(var(--chrome-bottom,var(--edge-safe-bottom,80px)) + 12px * var(--ui-scale,1)))" +
      " + var(--kiosk-hint-lift,0px));" +
      "transform:translateX(-50%) translateY(8px);display:flex;align-items:center;" +
      "gap:calc(18px * var(--ui-scale,1));" +
      /* Цвета — через токены кита, как везде: зашитые каналы молча
         разъезжаются с палитрой при её смене. */
      "padding:calc(18px * var(--ui-scale,1)) calc(28px * var(--ui-scale,1));border-radius:999px;" +
      "background:rgba(var(--kiosk-ink-rgb,12,16,18),.72);" +
      "border:1px solid rgba(var(--brass-rgb,210,183,115),.45);color:var(--brass,#D2B773);" +
      /* Длинная подпись (ZH/EN) при ×1.25 не должна уезжать за кромку:
         ограничиваем ширину рабочей областью и разрешаем перенос. */
      "max-width:calc(100% - 2 * var(--edge-safe,64px));" +
      "opacity:0;pointer-events:none;transition:opacity .5s ease,transform .5s ease;z-index:40;}" +
      ".kiosk-hint.is-on{opacity:1;transform:translateX(-50%) translateY(0);}" +
      ".kiosk-hint__icon{flex:none;width:calc(64px * var(--ui-scale,1));" +
      "height:calc(64px * var(--ui-scale,1));}" +
      ".kiosk-hint__icon svg{width:100%;height:100%;animation:kioskHintPulse 2.4s ease-in-out infinite;}" +
      ".kiosk-hint__label{font-family:'20 Kopeek','Courier New',monospace;" +
      "font-size:calc(26px * var(--ui-scale,1));line-height:1.25;" +
      "letter-spacing:.08em;text-transform:uppercase;color:var(--paper,#F7F9EF);" +
      "white-space:normal;overflow-wrap:anywhere;text-align:center;}" +
      "@keyframes kioskHintPulse{0%,100%{transform:scale(1)}50%{transform:scale(.88)}}";
    document.head.appendChild(s);
  }

  window.KioskHint = { attach: attach };
})();
