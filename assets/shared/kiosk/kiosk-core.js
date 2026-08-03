/* ============================================================
 * BMK 38-42 · kiosk-core — ядро киоск-приложения МТК (зона kiosk-core)
 *
 * Канон требований: PLAN-KIOSK.md + COORDINATION.md → «Киоск-стандарт v2».
 * Ноль внешних зависимостей, ноль сети в рантайме (кроме преролла
 * собственных файлов приложения), работает только по http (не file://).
 *
 * Подключение — классическим скриптом:
 *   <link rel="stylesheet" href="../assets/shared/kiosk/kiosk.css">
 *   <link rel="stylesheet" href="../assets/shared/kiosk/kiosk-core.css">
 *   <script src="../assets/shared/kiosk/kiosk-core.js"></script>
 *   <script type="module" src="./app.js"></script>   // window.KioskCore готов
 *
 * ...или ES-модулем:
 *   import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js";
 *
 * Оба пути дают ОДИН экземпляр ядра (esm-обёртка реэкспортирует window).
 * ============================================================ */
(function (global) {
  "use strict";

  var VERSION = "1.8.0";

  /* --------------------------------------------------------------- дефолты
   * Полный shape конфига приложения (mtkXX-app/kiosk.config.json).
   * localStorage["<appId>-kiosk"] накладывается поверх (сервис-панель). */
  var DEFAULT_CONFIG = {
    defaultScene: null,          // null → первая зарегистрированная
    defaultLang: "ru",
    timings: {
      fade: 350,                 // мс, кроссфейд сцен (300–400 по канону)
      reset: 90,                 // с, ACTIVE → RESET
      standby: 180,              // с, ACTIVE → STANDBY
      restartAt: "04:00",        // ночной авторестарт страницы; null → выкл
      standbyFps: 10             // потолок FPS аттрактора
    },
    nav: {
      show: true,
      position: "bottom",        // bottom | top — где бар с титулом и точками
      layout: "bar",             // bar — стрелки в баре; sides — по краям экрана
      /* Точное положение боковых стрелок — как было в хабе (он отмирает,
       * настройка не должна пропасть вместе с ним): вертикаль в % высоты,
       * горизонталь — отступ от кромки в px. */
      sideY: 50,                 // 5..95 %
      sideX: 64,                 // 0..200 px от бокового края
      size: 96,                  // px, тач-таргет стрелок (--touch-primary)
      opacity: 0.92,             // яркость хрома навигации
      showTitle: true,
      showArrows: true,
      showDots: true
    },
    stripes: {
      on: true,                  // косая подложка — по умолчанию ВКЛ
      opacity: 1,                // 0..1 → --stripe-opacity
      angle: 105                 // градусы, канон бренда
    },
    i18n: {
      langs: ["ru", "en", "zh"],
      show: true                 // показывать переключатель «РУС · ENG · 中文»
    },
    /* Два независимых масштаба. Общий множитель не годится: крупный
     * интерфейс съедает место у контента и наоборот — что-то одно всегда
     * оказывается плохо видно. */
    scale: {
      ui: 1,                     // хром киоска: кнопки, чипы, подписи контролов
      content: 1                 // содержимое сцен: карточки, подписи, тексты
    },
    /* Поле контента внутри сцены — % от контейнера, в котором сцена его
     * применяет. Приложение всегда во весь экран; поджимается только
     * содержимое: на панели 2160 px шириной строка во всю ширину
     * нечитаема, и это не лечится кеглем. */
    content: {
      width: 100,
      height: 100
    },
    /* Состав и порядок экранов — оперативная настройка киоска.
     * order: массив id в порядке листания (неизвестные игнорируются,
     * недостающие дописываются в порядке регистрации);
     * enabled: id → false выключает экран.
     * ОТДЕЛЬНО от config.scenes[id], где лежат настройки самих сцен:
     * в общем объекте сцена с id «order» затёрла бы состав. */
    screens: {
      order: [],
      enabled: {}
    },
    a11y: {
      enabled: false,
      show: true,                // показывать кнопку режима слабовидящих
      uiBoost: 1.25,             // во сколько режим поднимает масштаб интерфейса
      contentBoost: 1.5          // ...и масштаб контента (канон: кегли ×1.5)
    },
    tools: {
      position: "top-left"       // top-left | top-right | bottom-left | bottom-right
    },
    service: { gear: "always" }, // always | tripleTap | hidden (решится позже)
    watchdog: {
      stallSec: 30,              // главный поток завис дольше → это авария
      sceneTimeoutSec: 20,       // сцена с watchdog:true молчит дольше → авария
      restart: true,             // перезапускать страницу при аварии
      journalLimit: 200          // сколько записей журнала хранить
    }
  };

  var IDLE = { ACTIVE: "active", STANDBY: "standby" };

  /* Подписи языков в переключателе — на своём языке, как в каноне. */
  var LANG_LABEL = { ru: "РУС", en: "ENG", zh: "中文" };

  /* Строки самого ядра. Словари приложения (mtkXX-app/i18n/*.json)
   * накладываются поверх и могут их переопределить. */
  var CORE_STRINGS = {
    ru: {
      "standby.call": "Коснитесь экрана",
      "nav.prev": "Предыдущий экран",
      "nav.next": "Следующий экран",
      "a11y.button": "Режим для слабовидящих",
      "lang.button": "Язык интерфейса",
      "loading": "Загрузка"
    },
    en: {
      "standby.call": "Touch the screen",
      "nav.prev": "Previous screen",
      "nav.next": "Next screen",
      "a11y.button": "Low vision mode",
      "lang.button": "Interface language",
      "loading": "Loading"
    },
    zh: {
      "standby.call": "请触摸屏幕",
      "nav.prev": "上一屏",
      "nav.next": "下一屏",
      "a11y.button": "低视力模式",
      "lang.button": "界面语言",
      "loading": "加载中"
    }
  };

  /* ------------------------------------------------- описание настроек
   * Сервис-панель строится ИЗ ЭТОГО списка — отсюда единый вид контролов
   * во всех пяти МТК: сессия не рисует свои переключатели, а добавляет
   * строку в спецификацию (app.addSettings) и получает тот же облик. */
  var SETTINGS_SPEC = [
    {
      group: "Навигация",
      rows: [
        { type: "choice", path: "nav.layout", label: "Стрелки",
          options: [["bar", "В баре"], ["sides", "По бокам"]] },
        { type: "range", path: "nav.sideY", label: "Стрелки по вертикали", min: 5, max: 95, step: 1, unit: " %" },
        { type: "range", path: "nav.sideX", label: "Стрелки от края", min: 0, max: 200, step: 4, unit: " px" },
        { type: "choice", path: "nav.position", label: "Бар",
          options: [["bottom", "Внизу"], ["top", "Вверху"]] },
        { type: "range", path: "nav.size", label: "Размер кнопок", min: 64, max: 160, step: 8, unit: " px" },
        { type: "range", path: "nav.opacity", label: "Яркость хрома", min: 0.3, max: 1, step: 0.02, pct: true },
        { type: "toggle", path: "nav.showTitle", label: "Заголовок экрана" },
        { type: "toggle", path: "nav.showArrows", label: "Стрелки" },
        { type: "toggle", path: "nav.showDots", label: "Точки" }
      ]
    },
    {
      group: "Масштаб",
      rows: [
        { type: "range", path: "scale.ui", label: "Интерфейс киоска", min: 0.75, max: 2, step: 0.05, x: true },
        { type: "range", path: "scale.content", label: "Контент сцен", min: 0.75, max: 2, step: 0.05, x: true }
      ]
    },
    {
      group: "Поле контента",
      rows: [
        { type: "range", path: "content.width", label: "Ширина поля", min: 30, max: 100, step: 1, unit: " %" },
        { type: "range", path: "content.height", label: "Высота поля", min: 30, max: 100, step: 1, unit: " %" }
      ]
    },
    {
      group: "Косая подложка",
      rows: [
        { type: "toggle", path: "stripes.on", label: "Полосы на фоне" },
        { type: "range", path: "stripes.opacity", label: "Яркость полос", min: 0, max: 1, step: 0.05, pct: true },
        { type: "range", path: "stripes.angle", label: "Угол", min: 75, max: 135, step: 1, unit: "°" }
      ]
    },
    {
      group: "Тайминги простоя",
      rows: [
        { type: "range", path: "timings.reset", label: "Сброс состояния", min: 15, max: 600, step: 5, unit: " с" },
        { type: "range", path: "timings.standby", label: "Уход в заставку", min: 30, max: 1800, step: 10, unit: " с" },
        { type: "range", path: "timings.fade", label: "Кроссфейд сцен", min: 0, max: 800, step: 50, unit: " мс" },
        { type: "range", path: "timings.standbyFps", label: "FPS заставки", min: 1, max: 15, step: 1 },
        { type: "text", path: "timings.restartAt", label: "Ночной рестарт (ЧЧ:ММ)", placeholder: "04:00" }
      ]
    },
    {
      group: "Язык и доступность",
      rows: [
        { type: "toggle", path: "i18n.show", label: "Переключатель языков" },
        { type: "toggle", path: "a11y.show", label: "Кнопка слабовидящих" },
        { type: "choice", path: "tools.position", label: "Их положение",
          options: [["top-left", "Слева вверху"], ["top-right", "Справа вверху"],
                    ["bottom-left", "Слева внизу"], ["bottom-right", "Справа внизу"]] }
      ]
    },
    {
      group: "Умолчания",
      rows: [
        { type: "scene", path: "defaultScene", label: "Стартовый экран" },
        { type: "choice", path: "defaultLang", label: "Язык",
          options: [["ru", "РУС"], ["en", "ENG"], ["zh", "中文"]] }
      ]
    }
  ];

  /* --------------------------------------------- настройки сцены (v1.2)
   * Сцена ОБЪЯВЛЯЕТ свои параметры, ядро само рисует их в сервис-панели,
   * хранит и отдаёт обратно. Так тюнинг-панели прототипов переезжают в
   * одно место одинаково у всех МТК. Опись насчитала до ~60 настроек на
   * МТК — поэтому группы по сценам и сворачивание обязательны. */
  function normSceneSettings(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (s) {
      var type = s.type === "toggle" || s.type === "select" ? s.type : "range";
      var out = {
        key: s.key,
        label: normLabel(s.label) || normLabel(s.key),
        type: type,
        "default": s["default"]
      };
      if (type === "range") {
        out.min = s.min == null ? 0 : Number(s.min);
        out.max = s.max == null ? 1 : Number(s.max);
        out.step = s.step == null ? 1 : Number(s.step);
        out.unit = s.unit || "";
        if (out["default"] == null) out["default"] = out.min;
      } else if (type === "toggle") {
        out["default"] = !!out["default"];
      } else {
        /* options: [[value, label]] либо [{value, label}].
         * Подпись может быть и словарём {ru,en,zh} — как везде в ядре.
         * Без нормализации она рендерилась «[object Object]» (нашли 38). */
        out.options = (s.options || []).map(function (o) {
          if (Array.isArray(o)) return [o[0], normLabel(o[1])];
          return [o.value, normLabel(o.label)];
        });
        if (out["default"] == null && out.options.length) out["default"] = out.options[0][0];
      }
      return out;
    }).filter(function (s) { return !!s.key; });
  }

  function getByPath(obj, path) {
    var parts = path.split("."), cur = obj, i;
    for (i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setByPath(obj, path, value) {
    var parts = path.split("."), cur = obj, i;
    for (i = 0; i < parts.length - 1; i++) {
      if (!isObj(cur[parts[i]])) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    return obj;
  }

  /* События, считающиеся присутствием посетителя. mousemove намеренно нет:
   * на киоске мыши не бывает, а дрожь курсора при отладке держала бы
   * машину вечно в ACTIVE. */
  var ACTIVITY_EVENTS = ["pointerdown", "touchstart", "keydown", "wheel"];

  /* ------------------------------------------------------------- утилиты */

  function isObj(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }

  /* Глубокое слияние простых объектов: base не мутируется.
   *
   * Вложенные объекты ВСЕГДА клонируются, даже когда сливать не с чем.
   * Иначе результат делил бы поддеревья с источником — и правка одного
   * незаметно меняла бы другой. На этом уже попались: config.scenes
   * оказывался тем же объектом, что и патч оператора, и в localStorage
   * утекали все дефолты схемы вместо реально изменённых ключей. */
  function deepMerge(base, over) {
    var out = {}, k;
    for (k in base) {
      if (!Object.prototype.hasOwnProperty.call(base, k)) continue;
      out[k] = isObj(base[k]) ? deepMerge(base[k], null) : base[k];
    }
    if (!isObj(over)) return out;
    for (k in over) {
      if (!Object.prototype.hasOwnProperty.call(over, k)) continue;
      if (over[k] === undefined) continue;
      if (isObj(out[k]) && isObj(over[k])) out[k] = deepMerge(out[k], over[k]);
      else out[k] = isObj(over[k]) ? deepMerge(over[k], null) : over[k];
    }
    return out;
  }

  function resolveEl(v) {
    if (!v) return null;
    return typeof v === "string" ? document.querySelector(v) : v;
  }

  /* Подпись может быть строкой или словарём {ru,en,zh}. */
  function normLabel(v) {
    if (v == null) return null;
    if (typeof v === "string") return { ru: v, en: v, zh: v };
    return v;
  }

  function pickLabel(label, lang) {
    if (!label) return "";
    return label[lang] || label.ru || label.en || label.zh || "";
  }

  function sleep(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }

  function isHidden() {
    return typeof document !== "undefined" && document.hidden === true;
  }

  /* ЛЮБОЕ ожидание внутри ядра проходит через это.
   *
   * В скрытой вкладке браузер (а) не вызывает requestAnimationFrame вообще
   * и (б) душит setInterval/setTimeout до ~одного раза в минуту. То есть
   * даже страховка по таймеру там не страховка. Поэтому: если вкладка уже
   * в фоне — не ждём вовсе; если она ушла в фон посреди ожидания —
   * завершаемся немедленно по visibilitychange (это событие приходит
   * честно, оно не throttling-зависимо).
   *
   * Инвариант: возвращённый промис резолвится ВСЕГДА и детерминированно. */
  function guardedWait(schedule) {
    if (isHidden()) return Promise.resolve();
    return new Promise(function (res) {
      var done = false, cancel = null;
      function finish() {
        if (done) return;
        done = true;
        document.removeEventListener("visibilitychange", onVis);
        if (cancel) cancel();
        res();
      }
      function onVis() { if (isHidden()) finish(); }
      document.addEventListener("visibilitychange", onVis);
      cancel = schedule(finish);
      if (done && cancel) cancel();   // schedule успел позвать finish синхронно
    });
  }

  /* Ждём n отрисованных кадров — чтобы входящая сцена показала первый кадр
   * ДО старта fade (иначе на кроссфейде видна пустая вспышка). */
  function nextFrames(n, timeoutMs) {
    n = n || 1;
    return guardedWait(function (finish) {
      var left = n;
      var timer = setTimeout(finish, timeoutMs || 48 * n + 50);
      (function tick() {
        if (left-- <= 0) return finish();
        requestAnimationFrame(tick);
      })();
      return function () { clearTimeout(timer); };
    });
  }

  /* Ожидание конца CSS-перехода. Отдельно от sleep(): переход, начатый в
   * видимой вкладке и застигнутый уходом в фон, обязан завершиться сразу,
   * а не через задушенный setTimeout. */
  function waitFade(ms) {
    if (!(ms > 0)) return Promise.resolve();
    return guardedWait(function (finish) {
      var timer = setTimeout(finish, ms);
      return function () { clearTimeout(timer); };
    });
  }

  /* Вызов необязательного метода сцены — ошибка сцены не должна ронять ядро. */
  function safeCall(rec, method, arg) {
    var scene = rec && rec.scene;
    if (!scene || typeof scene[method] !== "function") return undefined;
    try {
      return scene[method](arg);
    } catch (err) {
      reportSceneError(rec, method, err);
      return undefined;
    }
  }

  function reportSceneError(rec, method, err) {
    var id = rec && rec.id;
    console.error("[kiosk] сцена «" + id + "»: ошибка в " + method + "()", err);
    if (rec && rec.app) {
      rec.app.log("error", "сцена «" + id + "»: " + method + "() — " + errText(err), { scene: id });
    }
  }

  function errText(err) {
    if (!err) return "неизвестная ошибка";
    if (err.message) return err.message;
    return String(err);
  }

  /* ------------------------------------------------- преролл: нормализация
   * scene.preload может быть:
   *   { images: [url], data: {key: url}, fonts: ["1em '20 Kopeek'"], custom: fn }
   *   либо просто функцией (custom). */
  function normPreload(p) {
    var out = { images: [], data: {}, fonts: [], custom: null };
    if (!p) return out;
    if (typeof p === "function") { out.custom = p; return out; }
    if (Array.isArray(p.images)) out.images = p.images.slice();
    if (isObj(p.data)) out.data = p.data;
    if (Array.isArray(p.fonts)) out.fonts = p.fonts.slice();
    if (typeof p.custom === "function") out.custom = p.custom;
    return out;
  }

  function loadImage(url) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error("не загрузилось изображение: " + url)); };
      img.src = url;
    });
  }

  /* cacheMode: "force-cache" для прероллимых данных (офлайн-киоск берёт
   * их из кеша), "default" для словарей — им нужна ревалидация, иначе
   * старый перевод переживает обновление сборки. */
  function loadJson(url, cacheMode) {
    return fetch(url, { cache: cacheMode || "force-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " на " + url);
      return r.json();
    });
  }

  function loadFont(spec) {
    if (!global.document || !document.fonts || !document.fonts.load) return Promise.resolve();
    return document.fonts.load(spec);
  }

  /* --------------------------------------------------- крошечный эмиттер */

  function Emitter() { this._h = {}; }
  Emitter.prototype.on = function (ev, fn) {
    (this._h[ev] || (this._h[ev] = [])).push(fn);
    return this;
  };
  Emitter.prototype.off = function (ev, fn) {
    var list = this._h[ev];
    if (!list) return this;
    this._h[ev] = list.filter(function (f) { return f !== fn; });
    return this;
  };
  Emitter.prototype.emit = function (ev, payload) {
    var list = this._h[ev];
    if (!list) return this;
    list.slice().forEach(function (fn) {
      try { fn(payload); } catch (err) { console.error("[kiosk] слушатель «" + ev + "»", err); }
    });
    return this;
  };

  /* =====================================================  KioskApp  ===== */

  function KioskApp(opts) {
    opts = opts || {};
    Emitter.call(this);

    this.version = VERSION;
    this.appId = opts.appId || "kiosk";
    this.title = normLabel(opts.title);
    this.configUrl = opts.configUrl || null;
    this.config = deepMerge(DEFAULT_CONFIG, opts.config);

    /* Словари UI-хрома: папка mtkXX-app/i18n/ ({lang}.json) и/или объект.
     * i18nVersion — метка кеша для словарей. Без неё Chrome держал старый
     * словарь после обновления сборки и новые ключи не доезжали (нашли 38):
     * приложение поднимает ?v= у своих файлов, а адрес словаря строит ядро,
     * и версию туда передать было нечем. */
    this.i18nUrl = opts.i18nUrl || null;
    this.i18nVersion = opts.i18nVersion == null ? null : String(opts.i18nVersion);
    this._strings = {};
    this._inlineStrings = opts.i18n || null;

    this.lang = this.config.defaultLang || "ru";
    this.a11y = !!(this.config.a11y && this.config.a11y.enabled);

    this.data = {};          // ключ → распарсенный JSON из преролла
    this.images = {};        // url → HTMLImageElement

    this._rootHost = opts.root || null;   // резолвим в start(), DOM может быть не готов
    this._records = [];                   // порядок сцен = порядок регистрации
    this._byId = Object.create(null);
    this._active = null;                  // текущая запись сцены
    this._queue = Promise.resolve();      // сериализация переключений
    this._started = false;
    this._els = {};

    /* Правки оператора хранятся ПАТЧЕМ, а не полным конфигом: иначе
     * localStorage навсегда затенил бы будущие правки kiosk.config.json. */
    this._override = {};
    this._settingsSpec = SETTINGS_SPEC.map(function (g) {
      return { group: g.group, rows: g.rows.slice() };
    });
    this._openSceneGroups = {};   /* какие группы настроек сцен развёрнуты */

    /* idle-машина */
    this.idleState = IDLE.ACTIVE;
    this._lastActivity = Date.now();
    this._didReset = false;               // RESET за текущий простой уже отработал
    this._idleSuspended = 0;              // >0 — таймеры простоя заморожены (сервис-панель)
    this._ticker = null;
    this._standbyTimer = null;
    this._standbyStop = null;             // стоп-функция собственной петли сцены
    this._restartArmedFor = null;         // дата, на которую ночной рестарт уже отработал
    this._restartPending = false;

    /* watchdog */
    this._lastTick = Date.now();
    this._lastBeat = Date.now();
    this._wdSuspended = 0;

    /* Метка запуска для журнала: различает жизни приложения между
     * перезагрузками (ночной рестарт, перезапуск ватчдогом). */
    this.sessionId = (Date.now().toString(36).slice(-4) +
      Math.random().toString(36).slice(2, 4)).toUpperCase();
  }

  KioskApp.prototype = Object.create(Emitter.prototype);
  KioskApp.prototype.constructor = KioskApp;

  /* ------------------------------------------------------ регистрация сцен */

  KioskApp.prototype.registerScene = function (def) {
    if (this._started) throw new Error("[kiosk] registerScene() после start() — поздно");
    if (!def || !def.id) throw new Error("[kiosk] у сцены обязателен id");
    if (this._byId[def.id]) throw new Error("[kiosk] сцена «" + def.id + "» уже зарегистрирована");

    var rec = {
      id: def.id,
      app: this,
      title: normLabel(def.title) || normLabel(def.id),
      scene: def,
      preload: normPreload(def.preload),
      settings: normSceneSettings(def.settings),
      /* keepAlive: сцена монтируется один раз и живёт на паузе (быстрое
       * переключение). false — выгружается при уходе (тяжёлые WebGL-сцены). */
      keepAlive: def.keepAlive !== false,
      mounted: false,
      el: null
    };
    this._records.push(rec);
    this._byId[def.id] = rec;
    return this;
  };

  KioskApp.prototype.getScene = function (id) {
    var rec = this._byId[id];
    return rec ? rec.scene : null;
  };

  /* ------------------------------------------- состав и порядок экранов
   * Порядок листания и состав — оперативная настройка киоска: оператор
   * гасит незаконченный экран или меняет их местами, не трогая код. */

  /* Все сцены в настроенном порядке. Неизвестные id в order игнорируем,
   * недостающие дописываем в порядке регистрации: список из конфига
   * может отстать от кода, и это не повод потерять сцену. */
  KioskApp.prototype._orderedRecords = function () {
    var self = this;
    var order = ((this.config.screens || {}).order) || [];
    var seen = Object.create(null);
    var out = [];
    if (Array.isArray(order)) {
      order.forEach(function (id) {
        var rec = self._byId[id];
        if (rec && !seen[id]) { seen[id] = 1; out.push(rec); }
      });
    }
    this._records.forEach(function (rec) {
      if (!seen[rec.id]) { seen[rec.id] = 1; out.push(rec); }
    });
    return out;
  };

  KioskApp.prototype.isSceneEnabled = function (id) {
    var map = (this.config.screens || {}).enabled || {};
    return map[id] !== false;
  };

  KioskApp.prototype._enabledRecords = function () {
    var self = this;
    return this._orderedRecords().filter(function (r) { return self.isSceneEnabled(r.id); });
  };

  /* Все сцены приложения — для сервис-панели. */
  KioskApp.prototype.allScenes = function () {
    var self = this, lang = this.lang;
    return this._orderedRecords().map(function (r) {
      return { id: r.id, title: pickLabel(r.title, lang), enabled: self.isSceneEnabled(r.id) };
    });
  };

  /* Сцены, которые видит посетитель: включённые, в настроенном порядке. */
  KioskApp.prototype.listScenes = function () {
    var lang = this.lang;
    return this._enabledRecords().map(function (r) {
      return { id: r.id, title: pickLabel(r.title, lang) };
    });
  };

  KioskApp.prototype.setSceneEnabled = function (id, on) {
    if (!this._byId[id]) return this;
    on = !!on;
    /* Пустой киоск невозможен: последний включённый экран не гасим. */
    if (!on && this._enabledRecords().length <= 1 && this.isSceneEnabled(id)) {
      this.log("warn", "нельзя выключить последний экран «" + id + "»");
      return this;
    }
    var wasOff = !this.isSceneEnabled(id);
    this.setSetting("screens.enabled." + id, on);

    /* Включили обратно в рантайме — её ассетов нет: на старте выключенные
     * экраны не прерольны (в этом и была экономия). Догружаем сейчас,
     * иначе оператор получил бы пустой экран вместо контента. */
    if (on && wasOff && this._started) {
      var self = this, rec = this._byId[id];
      this._preloadRecords([rec]).then(function () {
        self.log("info", "экран «" + id + "» включён, ассеты догружены");
      });
    }
    return this;
  };

  /* Перестановка на одну позицию. Двигаем по ПОЛНОМУ списку, а не по
   * включённым: иначе выключенный экран телепортировался бы при
   * обратном включении. */
  KioskApp.prototype.moveScene = function (id, dir) {
    var ids = this._orderedRecords().map(function (r) { return r.id; });
    var i = ids.indexOf(id);
    var j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= ids.length) return this;
    ids[i] = ids[j];
    ids[j] = id;
    this.setSetting("screens.order", ids);
    return this;
  };

  Object.defineProperty(KioskApp.prototype, "activeSceneId", {
    get: function () { return this._active ? this._active.id : null; }
  });

  /* ------------------------------------------------------------- контекст */

  KioskApp.prototype.context = function () {
    var self = this;
    return {
      app: this,
      lang: this.lang,
      a11y: this.a11y,
      settings: this.config,
      data: this.data,
      images: this.images,
      /* Сцена с watchdog:true обязана звать это из своей петли. */
      beat: function () { self._lastBeat = Date.now(); }
    };
  };

  /* ----------------------------------------------------------------- старт */

  KioskApp.prototype.start = function () {
    var self = this;
    if (this._started) return Promise.resolve(this);
    this._started = true;

    /* Журнал поднимаем первым — чтобы поймать и ошибки самого старта. */
    this._initJournal();

    return Promise.resolve()
      .then(function () { return self._loadConfig(); })
      .then(function () { return self._loadStrings(); })
      .then(function () { self._seedSceneDefaults(); })
      .then(function () { return domReady(); })
      .then(function () {
        self._buildChrome();
        self._applyStripes();
        self._applyNavStyle();
        return self._preroll();
      })
      .then(function () {
        /* Диплинк #scene-id: удобно для отладки и для ссылок из хаба.
         * На выключенный экран не пускаем — _activate уведёт на дефолт. */
        var hash = (location.hash || "").replace(/^#/, "");
        var startId = (hash && self._byId[hash] && self.isSceneEnabled(hash))
          ? hash : self._pickDefaultSceneId();
        if (!startId) throw new Error("[kiosk] не зарегистрировано ни одной сцены");
        return self.showScene(startId, { instant: true });
      })
      .then(function () {
        self._hideSplash();
        self._startIdle();
        /* Одна строка в консоли: «какая версия ядра реально работает» —
         * вопрос, на который после обновления нужен мгновенный ответ. */
        console.info("[kiosk] ядро " + VERSION + " · " + self.appId +
          " · запуск " + self.sessionId);
        if (/[?&]service=1\b/.test(location.search)) self.openService(true);
        self.log("info", "старт: сцен " + self._records.length + ", версия ядра " + VERSION);
        self.emit("started", { app: self });
        return self;
      })
      .catch(function (err) {
        self._splashError(err);
        self.log("fatal", "старт не удался: " + errText(err));
        console.error("[kiosk] старт не удался", err);
        throw err;
      });
  };

  KioskApp.prototype._loadConfig = function () {
    var self = this;
    if (!this.configUrl) { this._applyStoredConfig(); return Promise.resolve(); }
    return loadJson(this.configUrl)
      .then(function (json) { self.config = deepMerge(self.config, json); })
      .catch(function (err) {
        console.warn("[kiosk] kiosk.config.json не прочитан, работаем на дефолтах", err);
      })
      .then(function () {
        self._applyStoredConfig();
        self._migrateScreensKey();
      });
  };

  /* Одноразовая миграция 1.6.0 → 1.8.0: состав экранов переехал из
   * config.scenes.order/enabled в отдельный config.screens. В общем
   * объекте с настройками сцен сцена с id «order» затёрла бы состав,
   * поэтому ключи разведены. Переносим и то, что уже лежит в файле
   * конфига, и то, что оператор накрутил в localStorage. */
  KioskApp.prototype._migrateScreensKey = function () {
    var old = this.config.scenes;
    if (!isObj(old)) return;
    var moved = [];

    if (!isObj(this.config.screens)) this.config.screens = { order: [], enabled: {} };
    if (Array.isArray(old.order)) {
      this.config.screens.order = old.order;
      moved.push("order");
    }
    if (isObj(old.enabled)) {
      this.config.screens.enabled = old.enabled;
      moved.push("enabled");
    }
    delete this.config.scenes.order;
    delete this.config.scenes.enabled;
    if (!moved.length) return;

    /* Патч оператора чиним отдельно: иначе старые ключи оставались бы в
     * localStorage и всплывали при каждом старте. */
    var patch = this._override.scenes;
    if (isObj(patch) && (patch.order || patch.enabled)) {
      if (!isObj(this._override.screens)) this._override.screens = {};
      if (patch.order) this._override.screens.order = patch.order;
      if (patch.enabled) this._override.screens.enabled = patch.enabled;
      delete patch.order;
      delete patch.enabled;
      if (!Object.keys(patch).length) delete this._override.scenes;
      this._saveOverride();
    }
    this.log("info", "состав экранов перенесён scenes." + moved.join("/") + " → screens");
  };

  /* Правки оператора из сервис-панели живут поверх файла конфига. */
  KioskApp.prototype._applyStoredConfig = function () {
    var raw;
    try { raw = localStorage.getItem(this.storageKey()); } catch (e) { return; }
    if (raw) {
      try {
        var patch = JSON.parse(raw);
        if (isObj(patch)) {
          /* Клон, а не сам объект: патч и живой конфиг не должны делить
           * поддеревья, иначе дефолты схемы утекут в сохранённый патч. */
          this._override = deepMerge(patch, null);
          this.config = deepMerge(this.config, patch);
        }
      } catch (err) {
        console.warn("[kiosk] повреждён localStorage-конфиг, игнорирую", err);
      }
    }
    this.lang = this.config.defaultLang || this.lang;
    this.a11y = !!(this.config.a11y && this.config.a11y.enabled);
  };

  /* ------------------------------------------- настройки сцен (v1.2) */

  /* Дефолты схемы кладём в config.scenes[id] под сохранённые значения.
   * Порядок важен: сохранённое оператором должно пережить обновление
   * схемы, а новые ключи схемы — появиться со своими дефолтами. */
  KioskApp.prototype._seedSceneDefaults = function () {
    var self = this;
    if (!isObj(this.config.scenes)) this.config.scenes = {};
    this._records.forEach(function (rec) {
      if (!rec.settings.length) return;
      var stored = isObj(self.config.scenes[rec.id]) ? self.config.scenes[rec.id] : {};
      var merged = {};
      rec.settings.forEach(function (s) {
        merged[s.key] = stored[s.key] === undefined ? s["default"] : stored[s.key];
      });
      self.config.scenes[rec.id] = merged;
    });
  };

  /* Текущие значения настроек сцены — то, что уходит в applySettings. */
  KioskApp.prototype.sceneSettings = function (id) {
    var v = (this.config.scenes || {})[id];
    return isObj(v) ? deepMerge(v, null) : {};
  };

  KioskApp.prototype.setSceneSetting = function (id, key, value) {
    return this.setSetting("scenes." + id + "." + key, value);
  };

  /* Вернуть сцену к дефолтам её схемы. */
  KioskApp.prototype.resetSceneSettings = function (id) {
    var rec = this._byId[id];
    if (!rec) return this;
    var self = this;
    rec.settings.forEach(function (s) {
      setByPath(self.config, "scenes." + id + "." + s.key, s["default"]);
    });
    /* Из ПАТЧА ключи убираем, а не переписываем дефолтами: сохранённый
     * дефолт затенил бы будущую правку схемы навсегда. */
    if (isObj(this._override.scenes)) {
      delete this._override.scenes[id];
      if (!Object.keys(this._override.scenes).length) delete this._override.scenes;
    }
    this._saveOverride();
    this._pushSceneSettings(rec);
    this.log("info", "настройки сцены «" + id + "» сброшены к дефолтам");
    return this;
  };

  KioskApp.prototype._pushSceneSettings = function (rec) {
    if (!rec || !rec.settings.length) return;
    safeCall(rec, "applySettings", this.sceneSettings(rec.id));
  };

  /* ------------------------------------------------------ API настроек */

  KioskApp.prototype.getSetting = function (path) {
    return getByPath(this.config, path);
  };

  /* Правка оператора: пишем и в живой конфиг, и в патч, применяем сразу. */
  KioskApp.prototype.setSetting = function (path, value) {
    setByPath(this.config, path, value);
    setByPath(this._override, path, value);
    this._saveOverride();
    this._applySettings(path);
    this.emit("setting", { path: path, value: value });
    return this;
  };

  KioskApp.prototype._saveOverride = function () {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(this._override));
    } catch (err) {
      this.log("warn", "не сохранились настройки: " + errText(err));
    }
  };

  /* ---------------------------------------- перенос настроек (запомнить)
   *
   * Правки оператора и так сохраняются сразу — в localStorage. Но он
   * умирает вместе с профилем браузера: переустановка киоска, чистка
   * кеша, новый компьютер — и всё выкручено заново. Поэтому выгрузка
   * даёт ГОТОВЫЙ kiosk.config.json: сессия МТК кладёт его в git, и
   * настройки переживают что угодно. */
  KioskApp.prototype.exportSettings = function () {
    var json = JSON.stringify(this.config, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "kiosk.config.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    this.log("info", "настройки выгружены в файл");
    return json;
  };

  /* Загрузка снимка настроек. Ложится поверх файла целиком — оператор
   * восстанавливает ровно то, что было выгружено. Постоянное место
   * настройки всё равно kiosk.config.json в git. */
  KioskApp.prototype.importSettings = function (text) {
    var patch = JSON.parse(text);
    if (!isObj(patch)) throw new Error("это не объект настроек");
    this._override = patch;
    this._saveOverride();
    this.log("info", "настройки загружены из файла");
    this.restart("загрузка настроек");
    return patch;
  };

  /* Сброс к kiosk.config.json. Перезагружаем страницу, а не «размерживаем»
   * патч: файл — единственный источник правды, и это честнее. */
  KioskApp.prototype.resetSettings = function () {
    try { localStorage.removeItem(this.storageKey()); } catch (err) {}
    this._override = {};
    this.restart("сброс настроек");
  };

  /* Итоговые множители: настройка оператора × надбавка режима слабовидящих.
   * Считаем в JS и ставим инлайном на <html>, а не правилом для .a11y:
   * иначе фиксированные значения режима затирали бы масштаб, выставленный
   * оператором, и два регулятора конфликтовали бы между собой. */
  KioskApp.prototype.scales = function () {
    var s = this.config.scale || {}, a = this.config.a11y || {};
    function num(v, def) {
      v = Number(v);
      return isFinite(v) && v > 0 ? v : def;
    }
    return {
      ui: num(s.ui, 1) * (this.a11y ? num(a.uiBoost, 1.25) : 1),
      content: num(s.content, 1) * (this.a11y ? num(a.contentBoost, 1.5) : 1)
    };
  };

  /* Поле контента. Само приложение всегда во весь экран — поджимается
   * только содержимое сцены. Проценты считаются от того контейнера, в
   * который сцена положила .kiosk-content. */
  KioskApp.prototype._applyContentBox = function () {
    var root = this._els.root;
    if (!root) return;
    var c = this.config.content || {};

    function pct(v, def) {
      v = Number(v);
      if (!isFinite(v) || v < 10 || v > 100) v = def;
      return v + "%";
    }
    root.style.setProperty("--kiosk-content-w", pct(c.width, 100));
    root.style.setProperty("--kiosk-content-h", pct(c.height, 100));
  };

  KioskApp.prototype._applyScale = function () {
    var sc = this.scales();
    var root = document.documentElement;
    root.style.setProperty("--ui-scale", sc.ui.toFixed(3));
    root.style.setProperty("--content-scale", sc.content.toFixed(3));
    /* Прежнее имя: сцены и прототипы уже считают кегль от него. */
    root.style.setProperty("--a11y-scale", sc.content.toFixed(3));
  };

  /* Сколько места сверху и снизу занял хром ядра. Сцена обязана верстаться
   * от этих переменных (--kiosk-safe-top / --kiosk-safe-bottom), иначе её
   * контент уедет под навигацию или под переключатель языков. Считаем от
   * настроек, а не измерением DOM: значение стабильно и доступно сразу,
   * до первой раскладки сцены. */
  KioskApp.prototype._applyInsets = function () {
    var root = this._els.root;
    if (!root) return;
    var cs = getComputedStyle(document.documentElement);
    var edge = parseFloat(cs.getPropertyValue("--edge-safe")) || 64;
    var edgeBottom = parseFloat(cs.getPropertyValue("--edge-safe-bottom")) || 80;
    var gap = parseFloat(cs.getPropertyValue("--touch-gap")) || 16;
    /* Размер кнопки — уже с учётом масштаба интерфейса. */
    var size = (Number((this.config.nav || {}).size) || 96) * this.scales().ui;

    var nav = this.config.nav || {};
    var navShown = nav.show !== false && this._records.length > 0;
    var navTop = navShown && nav.position === "top";
    var navBottom = navShown && nav.position !== "top";
    var sides = nav.layout === "sides";

    /* В баре: ряд стрелок + ряд точек. По бокам: в баре остаются только
     * титул и точки — полоса ниже, зато занят край по горизонтали. */
    var navBand = 0;
    if (sides) {
      if (nav.showTitle !== false) navBand += 72 + gap;
      if (nav.showDots !== false) navBand += 64 + gap;
    } else {
      navBand = size + gap + (nav.showDots === false ? 0 : 64 + gap);
    }

    var toolsPos = (this.config.tools || {}).position || "top-left";
    var toolsShown = this._els.tools && !this._els.tools.hidden;
    var toolsTop = toolsShown && toolsPos.indexOf("top") === 0;
    var toolsBottom = toolsShown && toolsPos.indexOf("bottom") === 0;
    var gearTop = this._els.gear && !this._els.gear.hidden;

    var top = edge;
    if (navTop) top += navBand;
    else if (toolsTop || gearTop) top += size + gap;

    var bottom = edgeBottom;
    if (navBottom) bottom += navBand;
    else if (toolsBottom) bottom += size + gap;

    /* Боковые стрелки съедают ширину, а не высоту — сцене нужно знать и
     * про это, иначе её края уедут под кнопки. Считаем от ФАКТИЧЕСКОГО
     * отступа стрелок (nav.sideX), а не от кромки: оператор двигает их
     * до 200 px, и полоса обязана ехать следом. */
    var sideX = Number(nav.sideX);
    if (!isFinite(sideX) || sideX < 0) sideX = 64;
    var sideBand = (sides && navShown && nav.showArrows !== false) ? sideX + size + gap : 0;
    var side = Math.max(edge, sideBand);

    /* Поверх расчёта — фактический замер хрома. Расчёт исходит из
     * конфига и может недооценить реальную высоту: кнопки языков в
     * режиме слабовидящих или на узком экране переносятся в две строки,
     * и шапка сцены уезжает под них (дефект пилота 42). Берём максимум:
     * расчёт доступен сразу, замер — точнее. */
    var m = this._measureChrome(gap);
    top = Math.max(top, m.top);
    bottom = Math.max(bottom, m.bottom);
    side = Math.max(side, m.side);

    var vals = {
      "top": Math.round(top), "bottom": Math.round(bottom),
      "left": Math.round(side), "right": Math.round(side)
    };
    Object.keys(vals).forEach(function (k) {
      /* Канонические имена (заявка координатора) и прежние — синонимы:
       * сцены, уже сверстанные от --kiosk-safe-*, ломать нельзя. */
      root.style.setProperty("--chrome-" + k, vals[k] + "px");
      root.style.setProperty("--kiosk-safe-" + k, vals[k] + "px");
    });
  };

  /* Фактические габариты хрома. В скрытой вкладке и до первой раскладки
   * прямоугольники нулевые — тогда замер не участвует, работает расчёт. */
  KioskApp.prototype._measureChrome = function (gap) {
    var out = { top: 0, bottom: 0, side: 0 };
    var root = this._els.root;
    if (!root) return out;
    var host = root.getBoundingClientRect();
    if (!host.width || !host.height) return out;

    var self = this;
    ["tools", "gear", "nav"].forEach(function (key) {
      var el = self._els[key];
      if (!el || el.hidden) return;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      /* Ближе к какой кромке прижат блок — ту полосу он и занимает. */
      var fromTop = r.bottom - host.top;
      var fromBottom = host.bottom - r.top;
      if (fromTop <= fromBottom) out.top = Math.max(out.top, fromTop + gap);
      else out.bottom = Math.max(out.bottom, fromBottom + gap);
    });

    /* Боковые стрелки в раскладке sides живут прямо в корне. */
    Array.prototype.forEach.call(root.children, function (el) {
      if (!el.classList || !el.classList.contains("kiosk-nav__arrow")) return;
      if (el.hidden) return;
      var r = el.getBoundingClientRect();
      if (!r.width) return;
      out.side = Math.max(out.side,
        r.left - host.left + r.width + gap,
        host.right - r.right + r.width + gap);
    });
    return out;
  };

  KioskApp.prototype._applySettings = function (path) {
    if (!path || path.indexOf("nav.") === 0) this._applyNavStyle();
    if (!path || path.indexOf("stripes.") === 0) this._applyStripes();
    if (!path || /^(tools|i18n|a11y)\./.test(path)) this._applyToolsStyle();
    if (!path || path.indexOf("service.") === 0) this._applyGearMode();
    /* Состав или порядок изменились — перестроить точки и, если оператор
     * погасил экран прямо на нём, увести на дефолтный. */
    if (path && path.indexOf("screens.") === 0) {
      this._buildDots();
      this._syncNav();
      if (this._active && !this.isSceneEnabled(this._active.id)) {
        this.showScene(this._pickDefaultSceneId());
      }
    }
    if (!path || /^(scale|a11y)\./.test(path)) this._applyScale();
    if (!path || path.indexOf("content.") === 0) this._applyContentBox();
    /* Настройка сцены — отдать её самой сцене, без перезагрузки. */
    if (path && path.indexOf("scenes.") === 0) {
      this._pushSceneSettings(this._byId[path.split(".")[1]]);
    }
    this._applyInsets();
    /* Тайминги читаются тикером на лету, отдельного применения не нужно. */
  };

  /* УСТАРЕЛО с v1.2 канона: настройки объявляет сама сцена полем
   * settings:[] + applySettings(values) — тогда ядро группирует их по
   * сценам, сворачивает и сбрасывает к дефолтам схемы. Императивный
   * вызов оставлен рабочим: пилот 42 переезжает следующим шагом. */
  KioskApp.prototype.addSettings = function (group, rows) {
    if (!this._addSettingsWarned) {
      this._addSettingsWarned = true;
      console.warn("[kiosk] addSettings() устарел. Объявляйте настройки в сцене:\n" +
        "  settings: [{ key, label:{ru}, type:'range'|'toggle'|'select', … , default }],\n" +
        "  applySettings(values) { … }\n" +
        "Тогда они попадут в свою сворачиваемую группу и получат честный сброс.");
    }
    this._settingsSpec.push({ group: group, rows: rows.slice() });
    if (this._els.service) this._rebuildService();
    return this;
  };

  KioskApp.prototype.storageKey = function () {
    return this.appId + "-kiosk";
  };

  /* Дефолтная сцена — только из включённых: выключенный экран не должен
   * оказаться стартовым и точкой возврата из простоя. */
  KioskApp.prototype._pickDefaultSceneId = function () {
    var want = this.config.defaultScene;
    if (want && this._byId[want] && this.isSceneEnabled(want)) return want;
    var on = this._enabledRecords();
    if (on.length) return on[0].id;
    var all = this._orderedRecords();
    return all.length ? all[0].id : null;
  };

  /* ------------------------------------------------------------------ DOM */

  KioskApp.prototype._buildChrome = function () {
    var host = resolveEl(this._rootHost) || document.body;
    var doc = document;

    warnIfCssMissing();
    doc.documentElement.classList.add("kiosk-runtime");

    var root = doc.createElement("div");
    root.className = "kiosk-app";
    root.setAttribute("data-app", this.appId);

    /* Косая подложка — рендерит ядро: приложение живёт и вне хаба.
     * Яркость идёт через --stripe-opacity, ту же переменную крутит хаб. */
    var stripes = doc.createElement("div");
    stripes.className = "kiosk-stripes";
    stripes.setAttribute("aria-hidden", "true");

    var stage = doc.createElement("div");
    stage.className = "kiosk-stage";

    /* _buildNav дописывает в this._els.navParts — поэтому объект заводим до него. */
    this._els = { host: host, root: root, stripes: stripes, stage: stage };

    var nav = this._buildNav(doc);
    var splash = this._buildSplash(doc);
    this._els.nav = nav;
    this._els.splash = splash;

    root.appendChild(stripes);
    root.appendChild(stage);
    root.appendChild(nav);
    root.appendChild(splash);
    host.appendChild(root);

    doc.documentElement.setAttribute("lang", this.lang);
    if (this.a11y) doc.documentElement.classList.add("a11y");
    this._applyScale();
    this._buildTools();
    this._buildService();
    this._applyContentBox();
    this._applyInsets();
  };

  KioskApp.prototype._buildNav = function (doc) {
    var self = this;
    var nav = doc.createElement("nav");
    nav.className = "kiosk-nav";
    nav.setAttribute("aria-label", "Навигация по экранам");

    var row = doc.createElement("div");
    row.className = "kiosk-nav__row";

    var prev = doc.createElement("button");
    prev.type = "button";
    prev.className = "kiosk-nav__arrow kiosk-nav__arrow--prev kiosk-touch kiosk-touch--primary";
    prev.setAttribute("aria-label", "Предыдущий экран");
    prev.innerHTML = arrowSvg("prev");

    var titleBox = doc.createElement("div");
    titleBox.className = "kiosk-nav__title";
    var appTitle = doc.createElement("span");
    appTitle.className = "kiosk-nav__app";
    appTitle.textContent = pickLabel(this.title, this.lang);
    var sceneTitle = doc.createElement("span");
    sceneTitle.className = "kiosk-nav__scene";
    titleBox.appendChild(appTitle);
    titleBox.appendChild(sceneTitle);

    var next = doc.createElement("button");
    next.type = "button";
    next.className = "kiosk-nav__arrow kiosk-nav__arrow--next kiosk-touch kiosk-touch--primary";
    next.setAttribute("aria-label", "Следующий экран");
    next.innerHTML = arrowSvg("next");

    var dots = doc.createElement("div");
    dots.className = "kiosk-nav__dots";
    dots.setAttribute("role", "tablist");

    row.appendChild(prev);
    row.appendChild(titleBox);
    row.appendChild(next);
    nav.appendChild(row);
    nav.appendChild(dots);

    prev.addEventListener("click", function () { self.prevScene(); });
    next.addEventListener("click", function () { self.nextScene(); });

    this._els.navParts = {
      prev: prev, next: next, dots: dots, row: row,
      appTitle: appTitle, sceneTitle: sceneTitle
    };
    return nav;
  };

  KioskApp.prototype._buildSplash = function (doc) {
    var splash = doc.createElement("div");
    splash.className = "kiosk-splash is-on";
    splash.innerHTML =
      '<div class="kiosk-splash__inner">' +
      '<div class="kiosk-splash__title"></div>' +
      '<div class="kiosk-splash__bar"><i></i></div>' +
      '<div class="kiosk-splash__note">Загрузка…</div>' +
      "</div>";
    splash.querySelector(".kiosk-splash__title").textContent = pickLabel(this.title, this.lang);
    return splash;
  };

  KioskApp.prototype._buildDots = function () {
    var self = this;
    var parts = this._els.navParts;
    if (!parts) return;
    parts.dots.innerHTML = "";
    this._enabledRecords().forEach(function (rec) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "kiosk-nav__dot kiosk-touch";
      b.setAttribute("role", "tab");
      b.setAttribute("data-scene", rec.id);
      b.setAttribute("aria-label", pickLabel(rec.title, self.lang));
      b.innerHTML = '<i aria-hidden="true"></i>';
      b.addEventListener("click", function () { self.showScene(rec.id); });
      parts.dots.appendChild(b);
    });
  };

  KioskApp.prototype._syncNav = function () {
    var parts = this._els.navParts;
    if (!parts) return;
    var activeId = this.activeSceneId;
    var rec = this._active;
    parts.sceneTitle.textContent = rec ? pickLabel(rec.title, this.lang) : "";
    parts.appTitle.textContent = pickLabel(this.title, this.lang);
    Array.prototype.forEach.call(parts.dots.children, function (b) {
      var on = b.getAttribute("data-scene") === activeId;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    var single = this._enabledRecords().length < 2;
    parts.prev.hidden = single;
    parts.next.hidden = single;
    parts.prev.setAttribute("aria-label", this.t("nav.prev"));
    parts.next.setAttribute("aria-label", this.t("nav.next"));
  };

  /* Вид навигации из настроек: раскладка, позиция, размер, яркость, состав. */
  KioskApp.prototype._applyNavStyle = function () {
    var nav = this._els.nav, parts = this._els.navParts, root = this._els.root;
    var cfg = this.config.nav || {};
    if (!nav || !parts) return;

    nav.hidden = cfg.show === false;
    nav.setAttribute("data-position", cfg.position === "top" ? "top" : "bottom");

    /* Переменные ставим на КОРЕНЬ приложения, а не на .kiosk-nav: в
     * раскладке «по бокам» стрелки живут вне бара и от него ничего не
     * наследуют. */
    /* Через calc, а не готовым числом: размер кнопок должен ехать вместе
     * с масштабом интерфейса, а не жить своей жизнью. */
    root.style.setProperty("--kiosk-nav-size", "calc(" + (cfg.size || 96) + "px * var(--ui-scale))");
    root.style.setProperty("--kiosk-nav-opacity", String(cfg.opacity == null ? 0.92 : cfg.opacity));
    root.style.setProperty("--kiosk-nav-side-y", (cfg.sideY == null ? 50 : cfg.sideY) + "%");
    root.style.setProperty("--kiosk-nav-side-x", (cfg.sideX == null ? 64 : cfg.sideX) + "px");

    this._applyNavLayout(cfg.layout === "sides" ? "sides" : "bar");

    parts.prev.classList.toggle("is-hidden", cfg.showArrows === false);
    parts.next.classList.toggle("is-hidden", cfg.showArrows === false);
    parts.dots.classList.toggle("is-hidden", cfg.showDots === false);
    var titleBox = nav.querySelector(".kiosk-nav__title");
    if (titleBox) titleBox.classList.toggle("is-hidden", cfg.showTitle === false);

    /* Бар может остаться совсем пустым (титул и точки выключены) —
     * тогда прячем его целиком, чтобы не висел прозрачный перехватчик. */
    if (cfg.show !== false) {
      var barEmpty = cfg.layout === "sides" &&
        cfg.showTitle === false && cfg.showDots === false;
      nav.hidden = barEmpty;
    }
  };

  /* Стрелки переносим в DOM, а не прячем-показываем две копии: так у них
   * один обработчик, одно состояние и никакой рассинхронизации.
   * «По бокам» — как в прежнем хабе: круглые кнопки у левого и правого
   * края, по вертикали настраиваются. */
  KioskApp.prototype._applyNavLayout = function (layout) {
    var parts = this._els.navParts, root = this._els.root, nav = this._els.nav;
    nav.setAttribute("data-layout", layout);
    root.setAttribute("data-nav-layout", layout);

    if (layout === "sides") {
      if (parts.prev.parentNode !== root) {
        root.appendChild(parts.prev);
        root.appendChild(parts.next);
      }
    } else if (parts.prev.parentNode !== parts.row) {
      parts.row.insertBefore(parts.prev, parts.row.firstChild);
      parts.row.appendChild(parts.next);
    }
  };

  /* Косая подложка. Управляется настройками МТК; переменная та же, что у хаба. */
  KioskApp.prototype._applyStripes = function () {
    var el = this._els.stripes, cfg = this.config.stripes || {};
    if (!el) return;
    var on = cfg.on !== false;
    el.hidden = !on;
    var op = cfg.opacity == null ? 1 : Number(cfg.opacity);
    if (!isFinite(op)) op = 1;
    /* Ставим на корне приложения, а не на documentElement: хабный слайдер
     * (документ-уровень) остаётся рабочим как более общий фолбэк. */
    this._els.root.style.setProperty("--stripe-opacity", op.toFixed(2));
    this._els.root.style.setProperty("--kiosk-stripe-angle", (cfg.angle || 105) + "deg");
  };

  /* -------------------------------------------------------------- преролл */

  /* Только включённые: ассеты погашенных экранов на старте не нужны —
   * это прямая экономия времени запуска киоска. */
  KioskApp.prototype._preroll = function () {
    var self = this;
    var started = Date.now();
    return this._preloadRecords(this._enabledRecords(), true).then(function () {
      self._buildDots();
      /* Сплэш не должен мигать на быстрой машине. Через waitFade, а не
       * sleep: в свёрнутом окне задушенный таймер подвесил бы весь старт. */
      return waitFade(400 - (Date.now() - started));
    });
  };

  /* Загрузка ассетов набора сцен. Тем же кодом идёт и преролл на старте
   * (со сплэшем), и догрузка экрана, включённого оператором в рантайме. */
  KioskApp.prototype._preloadRecords = function (records, withSplash) {
    var self = this;
    var images = [], fonts = [], dataMap = {}, customs = [];
    var seenImg = Object.create(null), seenFont = Object.create(null);

    records.forEach(function (rec) {
      var p = rec.preload;
      p.images.forEach(function (u) {
        if (!seenImg[u]) { seenImg[u] = 1; images.push(u); }
      });
      p.fonts.forEach(function (f) {
        if (!seenFont[f]) { seenFont[f] = 1; fonts.push(f); }
      });
      Object.keys(p.data).forEach(function (k) { dataMap[k] = p.data[k]; });
      if (p.custom) customs.push({ rec: rec, fn: p.custom });
    });

    var dataKeys = Object.keys(dataMap);
    var total = images.length + fonts.length + dataKeys.length + customs.length;
    var done = 0;

    if (withSplash) this._splashProgress(0, total);

    function step() {
      done++;
      if (withSplash) self._splashProgress(done, total);
    }
    /* Провал одного ассета не должен ронять весь киоск: логируем и идём дальше. */
    function soft(promise, what) {
      return promise.catch(function (err) {
        console.warn("[kiosk] преролл: " + what, err);
        self.emit("preload-error", { what: what, error: err });
      }).then(step);
    }

    var jobs = [];
    dataKeys.forEach(function (key) {
      jobs.push(soft(
        loadJson(dataMap[key]).then(function (json) { self.data[key] = json; }),
        "данные «" + key + "» (" + dataMap[key] + ")"
      ));
    });
    images.forEach(function (url) {
      jobs.push(soft(
        loadImage(url).then(function (img) { self.images[url] = img; }),
        "изображение " + url
      ));
    });
    fonts.forEach(function (spec) {
      jobs.push(soft(loadFont(spec), "шрифт " + spec));
    });
    customs.forEach(function (c) {
      jobs.push(soft(
        Promise.resolve().then(function () { return c.fn(self.context()); }),
        "preload() сцены «" + c.rec.id + "»"
      ));
    });

    return Promise.all(jobs);
  };

  KioskApp.prototype._splashProgress = function (done, total) {
    var splash = this._els.splash;
    if (!splash) return;
    var bar = splash.querySelector(".kiosk-splash__bar i");
    var note = splash.querySelector(".kiosk-splash__note");
    var pct = total ? Math.round((done / total) * 100) : 100;
    if (bar) bar.style.width = pct + "%";
    if (note) note.textContent = total ? "Загрузка… " + pct + "%" : "Загрузка…";
  };

  KioskApp.prototype._hideSplash = function () {
    var splash = this._els.splash;
    if (!splash) return;
    splash.classList.remove("is-on");
    setTimeout(function () { splash.remove(); }, 600);
  };

  KioskApp.prototype._splashError = function (err) {
    var splash = this._els.splash;
    if (!splash) return;
    splash.classList.add("is-error");
    var note = splash.querySelector(".kiosk-splash__note");
    if (note) note.textContent = "Ошибка запуска: " + (err && err.message ? err.message : err);
  };

  /* ------------------------------------------------- переключение сцен */

  /* Публичный вход. Переключения сериализуются: два быстрых тапа по точкам
   * не наложат два кроссфейда друг на друга. */
  KioskApp.prototype.showScene = function (id, opts) {
    var self = this;
    this._queue = this._queue.then(function () {
      return self._activate(id, opts || {});
    }).catch(function (err) {
      console.error("[kiosk] переключение на «" + id + "» не удалось", err);
    });
    return this._queue;
  };

  KioskApp.prototype.nextScene = function () {
    return this.showScene(this._neighbourId(1));
  };

  KioskApp.prototype.prevScene = function () {
    return this.showScene(this._neighbourId(-1));
  };

  /* Листаем по ВКЛЮЧЁННЫМ в настроенном порядке. */
  KioskApp.prototype._neighbourId = function (dir) {
    var list = this._enabledRecords();
    var n = list.length;
    if (!n) return null;
    var i = this._active ? list.indexOf(this._active) : -1;
    return list[((i + dir) % n + n) % n].id;
  };

  KioskApp.prototype._activate = function (id, opts) {
    var self = this;
    var rec = this._byId[id];
    if (!rec) return Promise.reject(new Error("нет сцены «" + id + "»"));

    /* Экран выключен оператором — уводим на дефолтный. Сюда попадают и
     * диплинки: ссылка на погашенную сцену не должна давать пустоту. */
    if (!this.isSceneEnabled(id)) {
      var fallback = this._pickDefaultSceneId();
      this.log("info", "экран «" + id + "» выключен, перевод на «" + fallback + "»");
      if (!fallback || fallback === id) return Promise.resolve();
      rec = this._byId[fallback];
      id = fallback;
    }
    if (this._active === rec) return Promise.resolve();

    var prev = this._active;
    /* В скрытой вкладке анимировать нечего и нечем: rAF заморожен, таймеры
     * задушены. Переключаемся мгновенно — переход обязан завершаться
     * детерминированно, иначе очередь встаёт и сцена не меняется вовсе. */
    var fade = (opts.instant || isHidden()) ? 0 : Number(this.config.timings.fade) || 350;

    this.emit("scene-will-change", { from: prev ? prev.id : null, to: id });

    return Promise.resolve()
      .then(function () { return self._ensureMounted(rec); })
      .then(function () {
        /* Слой уже в потоке, но прозрачный: даём сцене отрисовать первый кадр. */
        rec.el.classList.add("is-visible");
        return nextFrames(2);
      })
      .then(function () {
        safeCall(rec, "resume");
        self._active = rec;
        self._syncNav();

        rec.el.style.transitionDuration = fade + "ms";
        rec.el.classList.add("is-active");
        if (prev) {
          prev.el.style.transitionDuration = fade + "ms";
          prev.el.classList.remove("is-active");
        }
        return waitFade(fade);
      })
      .then(function () {
        if (prev) {
          safeCall(prev, "pause");
          prev.el.classList.remove("is-visible");
          if (!prev.keepAlive) self._unmount(prev);
        }
        self.emit("scene-changed", { from: prev ? prev.id : null, to: id });
      });
  };

  KioskApp.prototype._ensureMounted = function (rec) {
    var self = this;
    if (rec.mounted) return Promise.resolve();
    var el = document.createElement("div");
    el.className = "kiosk-layer";
    el.setAttribute("data-scene", rec.id);
    this._els.stage.appendChild(el);
    rec.el = el;
    rec.mounted = true;
    return Promise.resolve()
      .then(function () { return rec.scene.mount ? rec.scene.mount(el, self.context()) : null; })
      /* Настройки отдаём сразу после монтирования: сцена строится в
       * дефолтном виде, а затем получает то, что накрутил оператор. */
      .then(function () { self._pushSceneSettings(rec); })
      .catch(function (err) { reportSceneError(rec, "mount", err); });
  };

  KioskApp.prototype._unmount = function (rec) {
    safeCall(rec, "unmount");
    if (rec.el) rec.el.remove();
    rec.el = null;
    rec.mounted = false;
  };

  /* Сброс всех смонтированных сцен (idle-машина вызывает это в RESET). */
  KioskApp.prototype.resetScenes = function () {
    this._records.forEach(function (rec) {
      if (rec.mounted) safeCall(rec, "reset");
    });
    this.emit("scenes-reset", { app: this });
    return this;
  };

  /* Возобновить активную сцену (после standby, где все были на паузе). */
  KioskApp.prototype._resumeActive = function () {
    if (this._active) safeCall(this._active, "resume");
  };

  /* ==================================================== idle-машина =====
   *
   *   ACTIVE --T_reset (90 c)--> сцены.reset() + язык→дефолт (состояние ACTIVE)
   *   ACTIVE --T_standby (180 c)--> STANDBY (аттрактор, FPS ≤ 10)
   *   STANDBY --касание--> ACTIVE (дефолтная сцена, дефолтное состояние)
   *
   * Один тикер на приложение обслуживает и простой, и watchdog, и ночной
   * рестарт — лишних таймеров ядро не заводит. */

  KioskApp.prototype._startIdle = function () {
    var self = this;
    if (this._ticker) return;

    this._onActivity = function () { self.poke(); };
    ACTIVITY_EVENTS.forEach(function (ev) {
      window.addEventListener(ev, self._onActivity, { passive: true, capture: true });
    });

    /* Возврат из фона — не фриз. Обнуляем все опорные метки, иначе
     * ватчдог примет паузу браузера за зависание главного потока. */
    this._onVisibility = function () {
      var now = Date.now();
      self._lastTick = now;
      self._lastBeat = now;
      self._lastActivity = now;
      self._didReset = false;
    };
    document.addEventListener("visibilitychange", this._onVisibility);

    this._lastActivity = Date.now();
    this._lastTick = Date.now();
    this._lastBeat = Date.now();
    this._ticker = setInterval(function () { self._tick(); }, 1000);
  };

  /* Отметка активности. Публичная: сцена может позвать её, если ловит
   * взаимодействие, не всплывающее до window (например, внутри canvas
   * с stopPropagation). */
  KioskApp.prototype.poke = function () {
    this._lastActivity = Date.now();
    this._didReset = false;
    if (this.idleState === IDLE.STANDBY) this._exitStandby();
  };

  /* Заморозить простой (сервис-панель открыта — киоск не должен уснуть
   * под руками оператора). Счётчик, а не флаг: вложенные вызовы безопасны. */
  KioskApp.prototype.suspendIdle = function (on) {
    this._idleSuspended = Math.max(0, this._idleSuspended + (on ? 1 : -1));
    if (!on) this.poke();
    return this._idleSuspended;
  };

  /* Заморозить ватчдог — на время долгих операций, которые честно держат
   * поток (тяжёлый импорт, генерация текстур) или когда сцена сознательно
   * не бьётся. Счётчик, как и у простоя: вложенные вызовы безопасны. */
  KioskApp.prototype.suspendWatchdog = function () {
    this._wdSuspended++;
    return this._wdSuspended;
  };

  KioskApp.prototype.resumeWatchdog = function () {
    this._wdSuspended = Math.max(0, this._wdSuspended - 1);
    if (!this._wdSuspended) {
      /* Пауза не должна засчитаться как зависание. */
      this._lastTick = Date.now();
      this._lastBeat = Date.now();
    }
    return this._wdSuspended;
  };

  KioskApp.prototype._tick = function () {
    var now = Date.now();
    var sinceTick = now - this._lastTick;
    this._lastTick = now;

    /* Вкладка в фоне — тикер там не показатель здоровья.
     *
     * Chrome душит setInterval скрытой вкладки до ~одного раза в минуту:
     * разрыв в 60 с означает «браузер экономит», а не «поток завис». Без
     * этой проверки ватчдог перезапускал живое приложение каждую минуту
     * (пилот МТК 42 поймал три рестарта подряд).
     *
     * Простой в фоне тоже не идёт: посетителя перед экраном по определению
     * нет, а уводить в standby невидимый экран бессмысленно. Метки держим
     * свежими, чтобы возврат из фона не выглядел как трёхминутный простой. */
    if (isHidden()) {
      this._lastActivity = now;
      this._lastBeat = now;
      return;
    }

    var wd = this.config.watchdog || {};
    if (!this._wdSuspended) {
      /* Тикер должен приходить раз в секунду. Опоздал сильно → главный
       * поток стоял (тяжёлая сцена, утечка, зависший WebGL). */
      var stallMs = (wd.stallSec || 30) * 1000;
      if (sinceTick > stallMs) {
        this.log("fatal", "главный поток стоял " + Math.round(sinceTick / 1000) + " с");
        if (wd.restart !== false) return this.restart("зависание главного потока");
      }

      /* Сцена с watchdog:true обязана звать ctx.beat(). Молчит — авария. */
      var rec = this._active;
      if (rec && rec.scene.watchdog && this.idleState === IDLE.ACTIVE) {
        var quiet = now - this._lastBeat;
        if (quiet > (wd.sceneTimeoutSec || 20) * 1000) {
          this.log("fatal", "сцена «" + rec.id + "» молчит " + Math.round(quiet / 1000) + " с");
          if (wd.restart !== false) return this.restart("сцена не отвечает");
        }
      }
    }

    this._checkNightRestart(now);

    if (this._idleSuspended) return;

    var idleSec = (now - this._lastActivity) / 1000;
    var t = this.config.timings || {};

    if (!this._didReset && idleSec >= (t.reset || 90) && this.idleState === IDLE.ACTIVE) {
      this._didReset = true;
      this._doIdleReset();
    }
    if (this.idleState === IDLE.ACTIVE && idleSec >= (t.standby || 180)) {
      this._enterStandby();
    }
  };

  /* RESET: посетитель ушёл — снять его следы, но экран пока живой. */
  KioskApp.prototype._doIdleReset = function () {
    this.resetScenes();
    var lang = (this.config.defaultLang) || "ru";
    if (this.lang !== lang) this.setLang(lang);
    if (this.a11y) this.setA11y(false);
    this.emit("idle-reset", { app: this });
    this.log("info", "idle-сброс");
  };

  /* ---------------------------------------------------------- STANDBY */

  KioskApp.prototype._enterStandby = function () {
    if (this.idleState === IDLE.STANDBY) return;
    this.idleState = IDLE.STANDBY;

    var rec = this._active;
    var own = rec ? safeCall(rec, "standby") : null;

    if (own) {
      /* Сцена ведёт собственный аттрактор — она же его и остановит. */
      this._standbyStop = typeof own === "function" ? own
        : (typeof own.stop === "function" ? own.stop.bind(own) : null);
    } else {
      /* Общий аттрактор ядра: все сцены на паузу, GPU отдыхает. */
      this._standbyStop = null;
      this._records.forEach(function (r) { if (r.mounted) safeCall(r, "pause"); });
    }

    this._showStandby(!own);
    this.emit("standby", { app: this, own: !!own });
    this.log("info", "standby");
  };

  KioskApp.prototype._exitStandby = function () {
    if (this.idleState !== IDLE.STANDBY) return;
    this.idleState = IDLE.ACTIVE;
    this._didReset = false;
    this._lastActivity = Date.now();
    this._lastBeat = Date.now();

    if (this._standbyStop) {
      try { this._standbyStop(); } catch (err) { this.log("error", "остановка аттрактора сцены: " + errText(err)); }
      this._standbyStop = null;
    }
    this._hideStandby();

    /* Возврат — на дефолтную сцену в дефолтном состоянии. */
    this._doIdleReset();
    var def = this._pickDefaultSceneId();
    if (def && def !== this.activeSceneId) this.showScene(def);
    else this._resumeActive();

    /* Отложенный ночной рестарт снимаем: у экрана снова кто-то есть,
     * перезагрузимся в следующее ночное окно. */
    this._restartPending = false;
    this.emit("standby-exit", { app: this });
  };

  /* Штатная петля аттрактора для сцены. Возвращать её прямо из standby():
   *
   *   standby() { return this.app.standbyTicker(t => this.drawSlow(t)); }
   *
   * Ровно то, что сцены иначе пишут сами через rAF — и будят композитор
   * каждый vsync, хотя канон standby разрешает не выше standbyFps.
   * Колбэк получает секунды с начала простоя. */
  KioskApp.prototype.standbyTicker = function (draw) {
    var fps = Math.max(1, Math.min(30, (this.config.timings || {}).standbyFps || 10));
    var t0 = Date.now();
    var self = this;
    var id = setInterval(function () {
      try {
        draw((Date.now() - t0) / 1000);
      } catch (err) {
        clearInterval(id);
        self.log("error", "аттрактор сцены упал: " + errText(err));
      }
    }, Math.round(1000 / fps));
    /* Ядро зовёт это при выходе из простоя. */
    return function () { clearInterval(id); };
  };

  KioskApp.prototype._showStandby = function (drawAttractor) {
    var self = this;
    if (!this._els.standby) this._buildStandby();
    var el = this._els.standby;
    el.classList.add("is-on");
    el.hidden = false;
    this._els.root.classList.add("is-standby");

    if (!drawAttractor) {
      /* Аттрактор рисует сама сцена — ядро оставляет только призыв. */
      el.classList.add("is-bare");
      return;
    }
    el.classList.remove("is-bare");

    var fps = Math.max(1, Math.min(30, (this.config.timings || {}).standbyFps || 10));
    var canvas = this._els.standbyCanvas;
    var ctx = canvas.getContext("2d");
    var t0 = Date.now();

    /* setInterval, а не rAF: rAF будил бы композитор 60 раз в секунду,
     * а канон standby — не выше 10 fps (GPU и выгорание панели). */
    this._standbyTimer = setInterval(function () {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      self._drawAttractor(ctx, (Date.now() - t0) / 1000, w, h);
    }, Math.round(1000 / fps));
  };

  KioskApp.prototype._hideStandby = function () {
    if (this._standbyTimer) { clearInterval(this._standbyTimer); this._standbyTimer = null; }
    if (this._els.root) this._els.root.classList.remove("is-standby");
    var el = this._els.standby;
    if (!el) return;
    el.classList.remove("is-on");
    setTimeout(function () { if (!el.classList.contains("is-on")) el.hidden = true; }, 500);
  };

  KioskApp.prototype._buildStandby = function () {
    var doc = document;
    var el = doc.createElement("div");
    el.className = "kiosk-standby";
    el.hidden = true;
    el.innerHTML =
      '<canvas class="kiosk-standby__canvas" aria-hidden="true"></canvas>' +
      '<div class="kiosk-standby__call">' +
      '<div class="kiosk-standby__icon" aria-hidden="true">' +
      '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" ' +
      'stroke-width="4" stroke-linecap="round"><circle cx="48" cy="40" r="10"/>' +
      '<path d="M26 76 C26 60 36 52 48 52 C60 52 70 60 70 76"/>' +
      '<circle cx="48" cy="40" r="24" opacity=".45"/></svg>' +
      "</div>" +
      '<div class="kiosk-standby__label"></div>' +
      "</div>";
    this._els.root.appendChild(el);
    this._els.standby = el;
    this._els.standbyCanvas = el.querySelector(".kiosk-standby__canvas");
    this._els.standbyLabel = el.querySelector(".kiosk-standby__label");
    this._syncStandbyLabel();
  };

  KioskApp.prototype._syncStandbyLabel = function () {
    if (!this._els.standbyLabel) return;
    this._els.standbyLabel.textContent = this.t("standby.call");
  };

  /* Общий аттрактор: медленные концентрические дуги в бренд-цветах.
   * Намеренно скупой — материал МТК даёт сцена через свой standby(). */
  KioskApp.prototype._drawAttractor = function (ctx, t, w, h) {
    ctx.clearRect(0, 0, w, h);
    var cx = w / 2, cy = h * 0.42;
    var base = Math.min(w, h) * 0.08;
    for (var i = 0; i < 7; i++) {
      var phase = (t * 0.05 + i / 7) % 1;
      var r = base + phase * Math.min(w, h) * 0.5;
      var a = 0.3 * (1 - phase);
      ctx.beginPath();
      ctx.arc(cx, cy, r, -0.9, 0.9 + Math.sin(t * 0.15) * 0.3);
      ctx.strokeStyle = i % 3 === 0 ? "rgba(160,33,40," + a + ")" : "rgba(210,183,115," + a + ")";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI - 0.9, Math.PI + 0.9 - Math.sin(t * 0.15) * 0.3);
      ctx.stroke();
    }
  };

  /* ------------------------------------------------ ночной авторестарт */

  KioskApp.prototype._checkNightRestart = function (now) {
    var at = (this.config.timings || {}).restartAt;
    if (!at) return;
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(at));
    if (!m) return;

    var d = new Date(now);
    var stamp = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    var due = Number(m[1]) * 60 + Number(m[2]);
    var cur = d.getHours() * 60 + d.getMinutes();

    /* Окно в 5 минут: тикер мог пропустить точную минуту (сон/лаг). */
    var inWindow = cur >= due && cur < due + 5;
    if (!inWindow) {
      if (this._restartArmedFor === stamp && cur < due) this._restartArmedFor = null;
      return;
    }
    if (this._restartArmedFor === stamp) return;

    /* Если у экрана кто-то стоит — не выдёргиваем стул: ждём standby. */
    if (this.idleState !== IDLE.STANDBY) {
      if (!this._restartPending) {
        this._restartPending = true;
        this.log("info", "ночной рестарт отложен: киоск занят");
      }
      return;
    }
    this._restartArmedFor = stamp;
    this._restartPending = false;
    this.restart("ночной рестарт " + at);
  };

  KioskApp.prototype.restart = function (reason) {
    this.log("warn", "перезапуск: " + (reason || "по требованию"));
    this.emit("restart", { app: this, reason: reason });
    try { location.reload(); } catch (err) { console.error("[kiosk] reload не удался", err); }
  };

  /* ================================================ журнал ошибок ===== */

  KioskApp.prototype.journalKey = function () {
    return this.appId + "-kiosk-log";
  };

  KioskApp.prototype._initJournal = function () {
    var self = this;
    if (this._journalReady) return;
    this._journalReady = true;

    /* Журнал переживает и перезагрузку, и обновление ядра. Записи прошлой
     * версии вперемешку с текущими путают на приёмке: счётчик аварий
     * показывает чужие, а самая первая строка «версия ядра …» — самая
     * старая (пилот МТК 42 из-за этого решил, что ядро не обновилось).
     * Поэтому при смене версии журнал чистим, но факт чистки записываем —
     * чтобы не потерять след аварии, случившейся прямо перед апдейтом. */
    var prev = this.getLog();
    if (prev.length) {
      var prevV = null;
      for (var i = prev.length - 1; i >= 0; i--) {
        if (prev[i] && prev[i].v) { prevV = prev[i].v; break; }
      }
      if (prevV !== VERSION) {
        this.clearLog();
        this.log("info", "журнал очищен при обновлении ядра " +
          (prevV || "(версия не отмечалась)") + " → " + VERSION +
          ", было записей: " + prev.length);
      }
    }

    window.addEventListener("error", function (e) {
      var where = e.filename ? " (" + e.filename + ":" + e.lineno + ")" : "";
      self.log("error", "JS: " + (e.message || "ошибка") + where);
    });
    window.addEventListener("unhandledrejection", function (e) {
      self.log("error", "promise: " + errText(e.reason));
    });
  };

  /* level: info | warn | error | fatal
   * v/sid — версия ядра и метка запуска: без них записи разных версий и
   * разных сессий неразличимы, а после ночного рестарта или перезапуска
   * ватчдогом непонятно, где кончилась одна жизнь приложения и началась
   * другая. */
  KioskApp.prototype.log = function (level, message, extra) {
    var entry = {
      at: new Date().toISOString(),
      level: level || "info",
      msg: String(message),
      scene: (extra && extra.scene) || this.activeSceneId,
      v: VERSION,
      sid: this.sessionId
    };
    this.emit("log", entry);
    try {
      var limit = (this.config.watchdog || {}).journalLimit || 200;
      var list = this.getLog();
      list.push(entry);
      if (list.length > limit) list = list.slice(list.length - limit);
      localStorage.setItem(this.journalKey(), JSON.stringify(list));
    } catch (err) {
      /* Приватный режим / переполненное хранилище — журнал не критичен. */
    }
    return entry;
  };

  KioskApp.prototype.getLog = function () {
    try {
      var raw = localStorage.getItem(this.journalKey());
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  };

  /* Только текущий запуск — то, что обычно и нужно на приёмке. */
  KioskApp.prototype.getSessionLog = function () {
    var sid = this.sessionId;
    return this.getLog().filter(function (e) { return e.sid === sid; });
  };

  KioskApp.prototype.clearLog = function () {
    try { localStorage.removeItem(this.journalKey()); } catch (err) {}
    return this;
  };

  /* ================================================= сервис-панель ===== */

  KioskApp.prototype._buildService = function () {
    var self = this;
    var doc = document;

    /* Шестерёнка. Пока видна всегда (service.gear: "always"); условие
     * показа/скрытия решится позже — режимы уже заложены. */
    var gear = doc.createElement("button");
    gear.type = "button";
    gear.className = "kiosk-gear kiosk-touch kiosk-touch--primary";
    gear.setAttribute("aria-label", "Сервис-панель");
    gear.innerHTML = gearSvg();
    gear.addEventListener("click", function () { self.openService(true); });

    var panel = doc.createElement("aside");
    panel.className = "kiosk-service";
    panel.hidden = true;
    panel.innerHTML =
      '<header class="kiosk-service__head">' +
      "<span>Сервис-панель</span>" +
      '<button type="button" class="kiosk-service__close kiosk-touch" aria-label="Закрыть">✕</button>' +
      "</header>" +
      '<div class="kiosk-service__body kiosk-scroll"></div>' +
      '<footer class="kiosk-service__foot">' +
      '<button type="button" class="kiosk-service__reset kiosk-touch">Сбросить настройки</button>' +
      '<span class="kiosk-service__ver"></span>' +
      "</footer>";

    panel.querySelector(".kiosk-service__close")
      .addEventListener("click", function () { self.openService(false); });
    panel.querySelector(".kiosk-service__reset")
      .addEventListener("click", function () { self.resetSettings(); });
    panel.querySelector(".kiosk-service__ver").textContent =
      "ядро " + VERSION + " · " + this.appId;

    this._els.root.appendChild(gear);
    this._els.root.appendChild(panel);
    this._els.gear = gear;
    this._els.service = panel;
    this._els.serviceBody = panel.querySelector(".kiosk-service__body");

    /* Скрытый файловый вход для загрузки снимка настроек. */
    var file = doc.createElement("input");
    file.type = "file";
    file.accept = "application/json,.json";
    file.style.display = "none";
    file.addEventListener("change", function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          self.importSettings(String(reader.result));
        } catch (err) {
          self.log("error", "не удалось загрузить настройки: " + errText(err));
          alert("Файл настроек не прочитан: " + errText(err));
        }
      };
      reader.readAsText(f);
      file.value = "";
    });
    panel.appendChild(file);
    this._els.importInput = file;

    this._bindServiceBody();
    this._applyGearMode();
    this._bindTripleTap();
  };

  KioskApp.prototype._applyGearMode = function () {
    var mode = (this.config.service || {}).gear || "always";
    if (this._els.gear) this._els.gear.hidden = mode !== "always";
  };

  /* Тройной тап по заголовку — запасной вход, когда шестерёнку спрячут. */
  KioskApp.prototype._bindTripleTap = function () {
    var self = this;
    var titleBox = this._els.nav && this._els.nav.querySelector(".kiosk-nav__title");
    if (!titleBox) return;
    var taps = 0, timer = null;
    titleBox.addEventListener("pointerdown", function () {
      taps++;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { taps = 0; }, 1200);
      if (taps >= 3) {
        taps = 0;
        clearTimeout(timer);
        self.openService(true);
      }
    });
  };

  KioskApp.prototype.openService = function (on) {
    if (!this._els.service) return this;
    on = on !== false;
    if (on === !!this._serviceOpen) return this;
    this._serviceOpen = on;

    var panel = this._els.service;
    this._els.root.classList.toggle("is-service", on);
    if (on) {
      this._rebuildService();
      panel.hidden = false;
      /* nextFrames, а не голый rAF: в скрытой вкладке кадров не бывает и
       * панель осталась бы за краем экрана (страховка по таймеру внутри). */
      nextFrames(1).then(function () { panel.classList.add("is-open"); });
      /* Под руками оператора киоск не засыпает и не перезапускается:
       * оператор может держать поток (правка полей, долгий разбор журнала). */
      this.suspendIdle(true);
      this.suspendWatchdog();
    } else {
      panel.classList.remove("is-open");
      setTimeout(function () { if (!panel.classList.contains("is-open")) panel.hidden = true; }, 350);
      this.suspendIdle(false);
      this.resumeWatchdog();
    }
    this.emit("service", { open: on });
    return this;
  };

  KioskApp.prototype._rebuildService = function () {
    var self = this;
    var body = this._els.serviceBody;
    if (!body) return;
    var html = this._settingsSpec.map(function (g) {
      return '<section class="kiosk-set__group">' +
        '<div class="kiosk-set__title">' + esc(g.group) + "</div>" +
        g.rows.map(function (row) { return self._rowHtml(row); }).join("") +
        "</section>";
    }).join("");

    html = this._screensHtml() + html;
    html += this._sceneGroupsHtml();

    html += '<section class="kiosk-set__group">' +
      '<div class="kiosk-set__title">Запомнить настройки</div>' +
      '<div class="kiosk-set__note">Правки сохраняются сразу, но в этом браузере. ' +
      'Чтобы пережить переустановку — выгрузите файл и отдайте его сессии МТК: ' +
      'это готовый <b>kiosk.config.json</b>.</div>' +
      '<div class="kiosk-set__actions">' +
      '<button type="button" class="kiosk-set__btn kiosk-touch" data-export>Выгрузить в файл</button>' +
      '<button type="button" class="kiosk-set__btn kiosk-touch" data-import>Загрузить из файла</button>' +
      "</div></section>";

    html += '<section class="kiosk-set__group kiosk-set__group--log">' +
      '<div class="kiosk-set__title">' + this._logTitle() +
      ' <button type="button" class="kiosk-set__mini" data-log-clear>Очистить</button></div>' +
      '<div class="kiosk-set__log">' + this._logHtml() + "</div>" +
      "</section>";

    body.innerHTML = html;
  };

  /* Счётчик аварий отдельно за этот запуск и всего: иначе после обновления
   * или рестарта на приёмке видны чужие аварии и непонятно, чьи они. */
  KioskApp.prototype._logTitle = function () {
    var all = this.getLog();
    var sid = this.sessionId;
    function bad(list) {
      return list.filter(function (e) { return e.level === "error" || e.level === "fatal"; }).length;
    }
    var mine = all.filter(function (e) { return e.sid === sid; });
    var t = "Журнал · запуск " + sid + ": " + bad(mine) + " авар. из " + mine.length;
    if (all.length !== mine.length) t += " · всего: " + bad(all) + " из " + all.length;
    return t;
  };

  /* Группа «Экраны»: состав и порядок листания. Идёт первой — это то,
   * ради чего оператор чаще всего открывает панель. */
  KioskApp.prototype._screensHtml = function () {
    var self = this;
    var list = this.allScenes();
    if (list.length < 2) return "";
    var onCount = list.filter(function (s) { return s.enabled; }).length;

    var rows = list.map(function (s, i) {
      var last = onCount <= 1 && s.enabled;   /* последний включённый не гасим */
      return '<div class="kiosk-screen-row' + (s.enabled ? "" : " is-off") + '">' +
        '<button type="button" class="kiosk-screen__move kiosk-touch" data-move="up" ' +
        'data-screen="' + esc(s.id) + '" aria-label="Выше"' + (i === 0 ? " disabled" : "") +
        '><span class="kiosk-screen__chev kiosk-screen__chev--up" aria-hidden="true"></span></button>' +
        '<button type="button" class="kiosk-screen__move kiosk-touch" data-move="down" ' +
        'data-screen="' + esc(s.id) + '" aria-label="Ниже"' +
        (i === list.length - 1 ? " disabled" : "") +
        '><span class="kiosk-screen__chev" aria-hidden="true"></span></button>' +
        '<span class="kiosk-screen__name">' + esc(s.title) + "</span>" +
        '<button type="button" class="kiosk-set__switch kiosk-touch' + (s.enabled ? " is-on" : "") +
        '" data-screen-toggle="' + esc(s.id) + '" role="switch" aria-checked="' +
        (s.enabled ? "true" : "false") + '"' + (last ? " disabled" : "") + "><i></i></button>" +
        "</div>";
    }).join("");

    return '<section class="kiosk-set__group">' +
      '<div class="kiosk-set__title">Экраны <span class="kiosk-set__fold-count">' +
      onCount + " / " + list.length + "</span></div>" +
      '<div class="kiosk-set__note">Порядок листания и состав. Выключенный экран не ' +
      "грузится на старте, его точка скрыта, ссылка на него ведёт на стартовый.</div>" +
      rows + "</section>";
  };

  /* Настройки сцен: своя группа на сцену, свёрнутая по умолчанию.
   * У МТК 38 по описи ~60 параметров — развёрнутыми они превратили бы
   * панель в бесконечную ленту, где не найти ничего. */
  KioskApp.prototype._sceneGroupsHtml = function () {
    var self = this;
    var withSettings = this._records.filter(function (r) { return r.settings.length; });
    if (!withSettings.length) return "";

    return withSettings.map(function (rec) {
      var open = !!self._openSceneGroups[rec.id];
      var rows = rec.settings.map(function (s) {
        return self._rowHtml(self._sceneRowSpec(rec.id, s));
      }).join("");

      return '<section class="kiosk-set__group kiosk-set__group--scene' +
        (open ? " is-open" : "") + '" data-scene-group="' + esc(rec.id) + '">' +
        '<button type="button" class="kiosk-set__fold" data-fold="' + esc(rec.id) + '">' +
        '<span class="kiosk-set__fold-mark" aria-hidden="true"></span>' +
        '<span class="kiosk-set__fold-title">Настройки МТК · ' +
        esc(pickLabel(rec.title, self.lang)) + "</span>" +
        '<span class="kiosk-set__fold-count">' + rec.settings.length + "</span>" +
        "</button>" +
        '<div class="kiosk-set__fold-body">' + rows +
        '<button type="button" class="kiosk-set__mini" data-scene-reset="' + esc(rec.id) +
        '">Сбросить сцену</button>' +
        "</div></section>";
    }).join("");
  };

  /* Настройка сцены — та же строка панели, что и у ядра: единый облик
   * контролов, один путь хранения (scenes.<id>.<key>), одна обработка. */
  KioskApp.prototype._sceneRowSpec = function (sceneId, s) {
    var spec = {
      path: "scenes." + sceneId + "." + s.key,
      label: pickLabel(s.label, this.lang),
      type: s.type === "select" ? "choice" : s.type
    };
    if (s.type === "range") {
      spec.min = s.min; spec.max = s.max; spec.step = s.step; spec.unit = s.unit;
    } else if (s.type === "select") {
      var lang = this.lang;
      spec.options = s.options.map(function (o) {
        return [o[0], pickLabel(o[1], lang)];
      });
    }
    return spec;
  };

  KioskApp.prototype._rowHtml = function (row) {
    var val = getByPath(this.config, row.path);
    var head = '<label class="kiosk-set-row__label">' + esc(row.label) +
      '<span class="kiosk-set-row__val" data-val="' + row.path + '">' +
      esc(fmtValue(row, val)) + "</span></label>";

    if (row.type === "range") {
      return '<div class="kiosk-set-row kiosk-set-row--range">' + head +
        '<input type="range" data-path="' + row.path + '" min="' + row.min + '" max="' + row.max +
        '" step="' + row.step + '" value="' + Number(val) + '">' + "</div>";
    }
    if (row.type === "toggle") {
      return '<div class="kiosk-set-row kiosk-set-row--toggle">' +
        '<label class="kiosk-set-row__label">' + esc(row.label) + "</label>" +
        '<button type="button" class="kiosk-set__switch kiosk-touch' + (val ? " is-on" : "") +
        '" data-path="' + row.path + '" data-toggle role="switch" aria-checked="' + (val ? "true" : "false") +
        '"><i></i></button></div>';
    }
    if (row.type === "choice" || row.type === "scene") {
      /* «Стартовый экран» — только из включённых. */
      var options = row.type === "scene"
        ? this._enabledRecords().map(function (r) { return [r.id, pickLabel(r.title, "ru")]; })
        : row.options;
      return '<div class="kiosk-set-row kiosk-set-row--choice">' +
        '<label class="kiosk-set-row__label">' + esc(row.label) + "</label>" +
        '<div class="kiosk-set__choices">' + options.map(function (o) {
          return '<button type="button" class="kiosk-set__choice kiosk-touch' +
            (String(val) === String(o[0]) ? " is-on" : "") +
            '" data-path="' + row.path + '" data-choice="' + esc(String(o[0])) + '">' +
            esc(o[1]) + "</button>";
        }).join("") + "</div></div>";
    }
    if (row.type === "text") {
      return '<div class="kiosk-set-row kiosk-set-row--text">' +
        '<label class="kiosk-set-row__label">' + esc(row.label) + "</label>" +
        '<input type="text" class="kiosk-set__text" data-path="' + row.path + '" data-text value="' +
        esc(val == null ? "" : String(val)) + '" placeholder="' + esc(row.placeholder || "") + '"></div>';
    }
    return "";
  };

  KioskApp.prototype._logHtml = function () {
    var sid = this.sessionId;
    var list = this.getLog().slice(-50).reverse();
    if (!list.length) return '<div class="kiosk-set__log-empty">Пусто</div>';
    return list.map(function (e) {
      var mine = e.sid === sid;
      /* Записи чужих запусков приглушены и подписаны меткой — читая
       * журнал, сразу видно, где кончилась прошлая жизнь приложения. */
      return '<div class="kiosk-set__log-row' + (mine ? "" : " is-old") +
        '" data-level="' + esc(e.level) + '">' +
        '<span class="kiosk-set__log-at">' + esc(String(e.at).slice(5, 19).replace("T", " ")) + "</span>" +
        (mine ? "" : '<span class="kiosk-set__log-sid">' + esc(e.sid || "—") + "</span>") +
        '<span class="kiosk-set__log-msg">' + esc(e.msg) + "</span></div>";
    }).join("");
  };

  KioskApp.prototype._bindServiceBody = function () {
    var self = this;
    var body = this._els.serviceBody;

    /* Слайдеры — на input, остальное — делегированием на click. */
    body.addEventListener("input", function (e) {
      var input = e.target.closest("input[type=range]");
      if (!input) return;
      var path = input.getAttribute("data-path");
      var row = self._findRow(path);
      self.setSetting(path, Number(input.value));
      var out = body.querySelector('[data-val="' + path + '"]');
      if (out && row) out.textContent = fmtValue(row, Number(input.value));
    });

    body.addEventListener("change", function (e) {
      var input = e.target.closest("input[data-text]");
      if (!input) return;
      var path = input.getAttribute("data-path");
      var v = input.value.trim();
      self.setSetting(path, v === "" ? null : v);
    });

    body.addEventListener("click", function (e) {
      var sw = e.target.closest("[data-toggle]");
      if (sw) {
        var path = sw.getAttribute("data-path");
        var on = !getByPath(self.config, path);
        self.setSetting(path, on);
        sw.classList.toggle("is-on", on);
        sw.setAttribute("aria-checked", on ? "true" : "false");
        return;
      }
      var ch = e.target.closest("[data-choice]");
      if (ch) {
        var p = ch.getAttribute("data-path");
        var v = ch.getAttribute("data-choice");
        self.setSetting(p, v);
        Array.prototype.forEach.call(
          body.querySelectorAll('[data-path="' + p + '"][data-choice]'),
          function (b) { b.classList.toggle("is-on", b === ch); }
        );
        if (p === "defaultLang") self.setLang(v);
        return;
      }
      if (e.target.closest("[data-log-clear]")) {
        self.clearLog();
        var box = body.querySelector(".kiosk-set__log");
        if (box) box.innerHTML = self._logHtml();
        return;
      }
      if (e.target.closest("[data-export]")) { self.exportSettings(); return; }
      if (e.target.closest("[data-import]")) { self._els.importInput.click(); return; }

      var scrTog = e.target.closest("[data-screen-toggle]");
      if (scrTog) {
        var sid = scrTog.getAttribute("data-screen-toggle");
        self.setSceneEnabled(sid, !self.isSceneEnabled(sid));
        self._rebuildService();
        return;
      }
      var mv = e.target.closest("[data-move]");
      if (mv) {
        self.moveScene(mv.getAttribute("data-screen"),
          mv.getAttribute("data-move") === "up" ? -1 : 1);
        self._rebuildService();
        return;
      }

      var fold = e.target.closest("[data-fold]");
      if (fold) {
        var fid = fold.getAttribute("data-fold");
        self._openSceneGroups[fid] = !self._openSceneGroups[fid];
        fold.parentNode.classList.toggle("is-open", self._openSceneGroups[fid]);
        return;
      }
      var sreset = e.target.closest("[data-scene-reset]");
      if (sreset) {
        self.resetSceneSettings(sreset.getAttribute("data-scene-reset"));
        self._rebuildService();
      }
    });
  };

  KioskApp.prototype._findRow = function (path) {
    var found = null;
    this._settingsSpec.forEach(function (g) {
      g.rows.forEach(function (r) { if (r.path === path) found = r; });
    });
    if (found) return found;

    /* Настройки сцен в _settingsSpec не лежат — собираем спеку на лету,
     * иначе подпись значения у слайдера сцены не обновлялась бы. */
    var parts = path.split(".");
    if (parts[0] !== "scenes" || parts.length < 3) return null;
    var rec = this._byId[parts[1]];
    if (!rec) return null;
    var key = parts.slice(2).join(".");
    var self = this;
    rec.settings.forEach(function (s) {
      if (s.key === key) found = self._sceneRowSpec(rec.id, s);
    });
    return found;
  };

  function fmtValue(row, val) {
    if (val == null) return "—";
    if (row.pct) return Math.round(Number(val) * 100) + " %";
    if (row.x) return "×" + Number(val).toFixed(2);
    return String(val) + (row.unit || "");
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function gearSvg() {
    return '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" fill="none" ' +
      'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true"><circle cx="20" cy="20" r="5.5"/>' +
      '<path d="M20 5.5v4M20 30.5v4M5.5 20h4M30.5 20h4M9.7 9.7l2.8 2.8M27.5 27.5l2.8 2.8' +
      'M30.3 9.7l-2.8 2.8M12.5 27.5l-2.8 2.8"/></svg>';
  }

  /* ======================================================== i18n ======= */

  KioskApp.prototype.langs = function () {
    var list = (this.config.i18n || {}).langs;
    return Array.isArray(list) && list.length ? list : ["ru"];
  };

  KioskApp.prototype._loadStrings = function () {
    var self = this;
    var langs = this.langs();

    /* Строки ядра — основа; словари приложения кладутся поверх. */
    langs.forEach(function (l) {
      self._strings[l] = deepMerge(CORE_STRINGS[l] || CORE_STRINGS.ru || {}, null);
    });
    if (this._inlineStrings) this._mergeStrings(this._inlineStrings);
    if (!this.i18nUrl) return Promise.resolve();

    var base = this.i18nUrl.replace(/\/?$/, "/");
    var ver = this.i18nVersion ? (base.indexOf("?") < 0 ? "?v=" : "&v=") + encodeURIComponent(this.i18nVersion) : "";
    return Promise.all(langs.map(function (l) {
      return loadJson(base + l + ".json" + ver, "default")
        .then(function (dict) {
          var one = {};
          one[l] = dict;
          self._mergeStrings(one);
        })
        .catch(function (err) {
          /* Нет словаря — не повод не запускаться: сработает фолбэк на ru. */
          console.warn("[kiosk] словарь " + l + " не прочитан", err);
        });
    }));
  };

  KioskApp.prototype._mergeStrings = function (dicts) {
    var self = this;
    Object.keys(dicts).forEach(function (l) {
      self._strings[l] = deepMerge(self._strings[l] || {}, dicts[l]);
    });
  };

  /* t("scene.map.title") — фолбэк: текущий язык → ru → сам ключ.
   * Ключ вместо пустоты намеренно: непереведённая строка должна быть
   * видна на приёмке, а не молча исчезать. */
  KioskApp.prototype.t = function (key, vars) {
    var cur = this._strings[this.lang] || {};
    var ru = this._strings.ru || CORE_STRINGS.ru;
    var out = cur[key];
    if (out == null) out = ru[key];
    if (out == null) out = key;
    if (vars) {
      out = String(out).replace(/\{(\w+)\}/g, function (m, name) {
        return vars[name] == null ? m : vars[name];
      });
    }
    return out;
  };

  KioskApp.prototype.setLang = function (lang) {
    if (!lang || lang === this.lang) return this;
    if (this.langs().indexOf(lang) < 0) return this;
    this.lang = lang;
    document.documentElement.setAttribute("lang", lang);
    this._records.forEach(function (rec) {
      if (rec.mounted) safeCall(rec, "setLang", lang);
    });
    this._syncNav();
    this._syncStandbyLabel();
    this._syncTools();
    /* Подписи настроек сцен идут через словари — открытую панель
     * перерисовываем, иначе она осталась бы на прежнем языке. */
    if (this._serviceOpen) this._rebuildService();
    this.emit("lang", { lang: lang });
    return this;
  };

  /* ======================================================== a11y ======= */

  KioskApp.prototype.setA11y = function (on) {
    on = !!on;
    if (on === this.a11y) return this;
    this.a11y = on;
    /* Класс на <html>: токены кегля/контраста/таргетов живут в kiosk.css
     * и достаются и ядру, и сценам, и прототипам. */
    document.documentElement.classList.toggle("a11y", on);
    this._records.forEach(function (rec) {
      if (rec.mounted) safeCall(rec, "setA11y", on);
    });
    this._syncTools();
    this._applyScale();           // режим домножает оба масштаба
    this._applyInsets();          // таргеты выросли — полосы хрома тоже
    this.emit("a11y", { on: on });
    this.log("info", "режим слабовидящих: " + (on ? "вкл" : "выкл"));
    return this;
  };

  /* ------------------------------- панель посетителя: язык и доступность */

  KioskApp.prototype._buildTools = function () {
    var self = this;
    var doc = document;
    var box = doc.createElement("div");
    box.className = "kiosk-tools";

    var langs = doc.createElement("div");
    langs.className = "kiosk-lang";
    langs.setAttribute("role", "group");
    langs.setAttribute("aria-label", this.t("lang.button"));

    this.langs().forEach(function (l) {
      var b = doc.createElement("button");
      b.type = "button";
      b.className = "kiosk-lang__btn kiosk-touch kiosk-touch--primary";
      b.setAttribute("data-lang", l);
      b.textContent = LANG_LABEL[l] || l.toUpperCase();
      b.addEventListener("click", function () { self.setLang(l); });
      langs.appendChild(b);
    });

    var eye = doc.createElement("button");
    eye.type = "button";
    eye.className = "kiosk-a11y kiosk-touch kiosk-touch--primary";
    eye.innerHTML = eyeSvg();
    eye.addEventListener("click", function () { self.setA11y(!self.a11y); });

    box.appendChild(langs);
    box.appendChild(eye);
    this._els.root.appendChild(box);
    this._els.tools = box;
    this._els.langBox = langs;
    this._els.eye = eye;

    this._applyToolsStyle();
    this._syncTools();
  };

  KioskApp.prototype._applyToolsStyle = function () {
    var box = this._els.tools;
    if (!box) return;
    box.setAttribute("data-position", (this.config.tools || {}).position || "top-left");
    this._els.langBox.hidden = (this.config.i18n || {}).show === false || this.langs().length < 2;
    this._els.eye.hidden = (this.config.a11y || {}).show === false;
    box.hidden = this._els.langBox.hidden && this._els.eye.hidden;
  };

  KioskApp.prototype._syncTools = function () {
    var self = this;
    if (!this._els.tools) return;
    Array.prototype.forEach.call(this._els.langBox.children, function (b) {
      var on = b.getAttribute("data-lang") === self.lang;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    this._els.eye.classList.toggle("is-on", this.a11y);
    this._els.eye.setAttribute("aria-pressed", this.a11y ? "true" : "false");
    this._els.eye.setAttribute("aria-label", this.t("a11y.button"));
  };

  function eyeSvg() {
    return '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" fill="none" ' +
      'stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true"><path d="M3 20c5-7.5 11-11.2 17-11.2S32 12.5 37 20c-5 7.5-11 11.2-17 11.2S8 27.5 3 20z"/>' +
      '<circle cx="20" cy="20" r="5.2"/></svg>';
  }

  /* ------------------------------------------------------------ хелперы */

  function arrowSvg(dir) {
    var d = dir === "next" ? "M14 8 L26 20 L14 32" : "M26 8 L14 20 L26 32";
    return '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" fill="none" ' +
      'stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  function domReady() {
    if (document.readyState !== "loading") return Promise.resolve();
    return new Promise(function (res) {
      document.addEventListener("DOMContentLoaded", function () { res(); }, { once: true });
    });
  }

  var cssWarned = false;
  function warnIfCssMissing() {
    if (cssWarned) return;
    cssWarned = true;
    var probe = getComputedStyle(document.documentElement).getPropertyValue("--kiosk-core-css");
    if (!probe || !probe.trim()) {
      console.warn("[kiosk] не подключён kiosk-core.css — хром ядра будет без стилей.\n" +
        '  <link rel="stylesheet" href="../assets/shared/kiosk/kiosk-core.css">');
    }
  }

  /* -------------------------------------------------------------- экспорт */

  global.KioskCore = {
    version: VERSION,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    createApp: function (opts) { return new KioskApp(opts); },
    KioskApp: KioskApp,
    /* Внутреннее, но полезно сценам. waitFade/nextFrames/guardedWait —
     * ожидания, переживающие уход вкладки в фон; для собственных
     * анимаций сцены берите их, а не голый setTimeout. */
    util: {
      deepMerge: deepMerge, pickLabel: pickLabel, sleep: sleep,
      nextFrames: nextFrames, waitFade: waitFade, guardedWait: guardedWait,
      isHidden: isHidden
    }
  };
})(typeof window !== "undefined" ? window : this);
