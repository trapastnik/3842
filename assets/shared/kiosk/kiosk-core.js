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

  var VERSION = "1.0.0";

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
      position: "bottom",        // bottom | top
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
    a11y: { enabled: false },
    service: { gear: "always" }  // always | tripleTap | hidden (решится позже)
  };

  /* ------------------------------------------------------------- утилиты */

  function isObj(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }

  /* Глубокое слияние простых объектов: base не мутируется. */
  function deepMerge(base, over) {
    var out = {}, k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    if (!isObj(over)) return out;
    for (k in over) {
      if (!Object.prototype.hasOwnProperty.call(over, k)) continue;
      if (isObj(out[k]) && isObj(over[k])) out[k] = deepMerge(out[k], over[k]);
      else if (over[k] !== undefined) out[k] = over[k];
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

  /* Ждём n отрисованных кадров — чтобы входящая сцена показала первый кадр
   * ДО старта fade (иначе на кроссфейде видна пустая вспышка).
   *
   * Обязателен фолбэк по таймеру: в скрытой вкладке (фон, свёрнутое окно)
   * requestAnimationFrame не вызывается вообще, и без страховки очередь
   * переключений встала бы навсегда — экран умер бы до перезагрузки. */
  function nextFrames(n, timeoutMs) {
    n = n || 1;
    return new Promise(function (res) {
      var left = n, done = false;
      var timer = setTimeout(finish, timeoutMs || 48 * n + 50);
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        res();
      }
      (function tick() {
        if (done) return;
        if (left-- <= 0) return finish();
        requestAnimationFrame(tick);
      })();
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

  /* Журнал ошибок появится в следующем коммите; пока — консоль + хук. */
  function reportSceneError(rec, method, err) {
    var id = rec && rec.id;
    if (typeof global.__kioskOnError === "function") {
      try { global.__kioskOnError({ scene: id, method: method, error: err }); } catch (e) {}
    }
    console.error("[kiosk] сцена «" + id + "»: ошибка в " + method + "()", err);
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

  function loadJson(url) {
    return fetch(url, { cache: "force-cache" }).then(function (r) {
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
      title: normLabel(def.title) || normLabel(def.id),
      scene: def,
      preload: normPreload(def.preload),
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

  KioskApp.prototype.listScenes = function () {
    var lang = this.lang;
    return this._records.map(function (r) {
      return { id: r.id, title: pickLabel(r.title, lang) };
    });
  };

  Object.defineProperty(KioskApp.prototype, "activeSceneId", {
    get: function () { return this._active ? this._active.id : null; }
  });

  /* ------------------------------------------------------------- контекст */

  KioskApp.prototype.context = function () {
    return {
      app: this,
      lang: this.lang,
      a11y: this.a11y,
      settings: this.config,
      data: this.data,
      images: this.images
    };
  };

  /* ----------------------------------------------------------------- старт */

  KioskApp.prototype.start = function () {
    var self = this;
    if (this._started) return Promise.resolve(this);
    this._started = true;

    return Promise.resolve()
      .then(function () { return self._loadConfig(); })
      .then(function () { return domReady(); })
      .then(function () {
        self._buildChrome();
        self._applyStripes();
        self._applyNavStyle();
        return self._preroll();
      })
      .then(function () {
        var startId = self._pickDefaultSceneId();
        if (!startId) throw new Error("[kiosk] не зарегистрировано ни одной сцены");
        return self.showScene(startId, { instant: true });
      })
      .then(function () {
        self._hideSplash();
        self.emit("started", { app: self });
        return self;
      })
      .catch(function (err) {
        self._splashError(err);
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
      .then(function () { self._applyStoredConfig(); });
  };

  /* Правки оператора из сервис-панели живут поверх файла конфига. */
  KioskApp.prototype._applyStoredConfig = function () {
    var raw;
    try { raw = localStorage.getItem(this.storageKey()); } catch (e) { return; }
    if (!raw) return;
    try {
      this.config = deepMerge(this.config, JSON.parse(raw));
    } catch (err) {
      console.warn("[kiosk] повреждён localStorage-конфиг, игнорирую", err);
    }
    this.lang = this.config.defaultLang || this.lang;
    this.a11y = !!(this.config.a11y && this.config.a11y.enabled);
  };

  KioskApp.prototype.storageKey = function () {
    return this.appId + "-kiosk";
  };

  KioskApp.prototype._pickDefaultSceneId = function () {
    var want = this.config.defaultScene;
    if (want && this._byId[want]) return want;
    return this._records.length ? this._records[0].id : null;
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
      prev: prev, next: next, dots: dots,
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
    this._records.forEach(function (rec) {
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
    var single = this._records.length < 2;
    parts.prev.hidden = single;
    parts.next.hidden = single;
  };

  /* Вид навигации из настроек: позиция, размер таргета, яркость, состав. */
  KioskApp.prototype._applyNavStyle = function () {
    var nav = this._els.nav, parts = this._els.navParts, cfg = this.config.nav || {};
    if (!nav || !parts) return;
    nav.hidden = cfg.show === false;
    nav.setAttribute("data-position", cfg.position === "top" ? "top" : "bottom");
    nav.style.setProperty("--kiosk-nav-size", (cfg.size || 96) + "px");
    nav.style.setProperty("--kiosk-nav-opacity", String(cfg.opacity == null ? 0.92 : cfg.opacity));
    parts.prev.classList.toggle("is-hidden", cfg.showArrows === false);
    parts.next.classList.toggle("is-hidden", cfg.showArrows === false);
    parts.dots.classList.toggle("is-hidden", cfg.showDots === false);
    var titleBox = nav.querySelector(".kiosk-nav__title");
    if (titleBox) titleBox.classList.toggle("is-hidden", cfg.showTitle === false);
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

  KioskApp.prototype._preroll = function () {
    var self = this;
    var images = [], fonts = [], dataMap = {}, customs = [];
    var seenImg = Object.create(null), seenFont = Object.create(null);

    this._records.forEach(function (rec) {
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
    var started = Date.now();

    this._splashProgress(0, total);

    function step() {
      done++;
      self._splashProgress(done, total);
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

    return Promise.all(jobs).then(function () {
      self._buildDots();
      /* Сплэш не должен мигать на быстрой машине. */
      var left = 400 - (Date.now() - started);
      return left > 0 ? sleep(left) : null;
    });
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

  KioskApp.prototype._neighbourId = function (dir) {
    var n = this._records.length;
    if (!n) return null;
    var i = this._active ? this._records.indexOf(this._active) : -1;
    return this._records[((i + dir) % n + n) % n].id;
  };

  KioskApp.prototype._activate = function (id, opts) {
    var self = this;
    var rec = this._byId[id];
    if (!rec) return Promise.reject(new Error("нет сцены «" + id + "»"));
    if (this._active === rec) return Promise.resolve();

    var prev = this._active;
    var fade = opts.instant ? 0 : Number(this.config.timings.fade) || 350;

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
        return fade ? sleep(fade) : nextFrames(1);
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
      .catch(function (err) { reportSceneError(rec, "mount", err); });
  };

  KioskApp.prototype._unmount = function (rec) {
    safeCall(rec, "unmount");
    if (rec.el) rec.el.remove();
    rec.el = null;
    rec.mounted = false;
  };

  /* ------------------------------------------- заготовки след. коммитов */

  /* Сброс всех смонтированных сцен (idle-машина вызовет это в RESET). */
  KioskApp.prototype.resetScenes = function () {
    var self = this;
    this._records.forEach(function (rec) {
      if (rec.mounted) safeCall(rec, "reset");
    });
    this.emit("scenes-reset", { app: this });
    return self;
  };

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
    /* внутреннее, но полезно сценам и демо */
    util: { deepMerge: deepMerge, pickLabel: pickLabel, sleep: sleep, nextFrames: nextFrames }
  };
})(typeof window !== "undefined" ? window : this);
