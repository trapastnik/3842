/* ============================================================
 * BMK 38-42 · Перебор СОЧЕТАНИЙ НАСТРОЕК (зона kiosk-core)
 *
 * Стенд приёмки (selftest.js) проверяет приложение в ОДНОМ состоянии
 * настроек — обычно дефолтном. Этого мало: настройки оператор крутит из
 * сервис-панели, а ломается не отдельная ручка, а их сочетание. Так и
 * вышло: раскладка «стрелки по бокам» отдавала --chrome-left/right по
 * 1872 px при окне 1920 — сцене доставалась ОТРИЦАТЕЛЬНАЯ ширина, и
 * любая сцена, свёрстанная от зон (жёсткое правило кита), разъезжалась.
 * На дефолтных настройках стенд этого не видел никогда.
 *
 * Подключение (временно, на время прогона):
 *   <script src="../assets/shared/kiosk/tools/audit-settings.js"></script>
 * и в консоли:
 *   KioskSettingsAudit.run(app)
 *
 * Инварианты, независимые от содержания сцены:
 *   1. Полю сцены остаётся положительный размер.
 *   2. Хром кита не залезает в это поле — иначе сцена рисуется под ним.
 *   3. Ни один элемент хрома не уехал за край экрана.
 *
 * Прогон синхронный: _applyInsets считается сразу, а чтение геометрии
 * само вынуждает пересчёт вёрстки. rAF не годится — в фоновой вкладке
 * кадров нет, и прогон бы завис.
 * ============================================================ */
(function (global) {
  "use strict";

  /* Ручки, сочетания которых меняют геометрию. Значения — края и
   * середина диапазона из схемы; перебор полный. */
  var AXES = {
    "nav.layout": ["bar", "sides"],
    "nav.position": ["bottom", "top"],
    "nav.size": [64, 96, 128, 160],
    "scale.ui": [0.75, 1, 1.25, 1.5],
    "a11y": [false, true]
  };

  var CHROME = [".kiosk-nav", ".kiosk-tools", ".kiosk-gear"];

  function run(app, opts) {
    opts = opts || {};
    var root = app && app._els && app._els.root;
    if (!root) return { ошибка: "приложение не запущено" };

    /* Схлопнутое окно даёт зелёный результат на любом коде — это был бы
     * ЛОЖНЫЙ УСПЕХ, поэтому отказываемся вслух. */
    if (window.innerWidth < 400 || window.innerHeight < 300) {
      return { ошибка: "окно " + window.innerWidth + "×" + window.innerHeight +
        " — мерить нечего; прогон в схлопнутом окне прошёл бы всегда" };
    }

    function num(name) {
      return parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;
    }

    function check() {
      var t = num("--chrome-top"), b = num("--chrome-bottom");
      var l = num("--chrome-left"), r = num("--chrome-right");
      var box = { top: t, bottom: window.innerHeight - b,
                  left: l, right: window.innerWidth - r };
      var w = Math.round(box.right - box.left), h = Math.round(box.bottom - box.top);
      var out = { зоны: [t, b, l, r].map(Math.round), поле: w + "×" + h, беды: [] };

      if (w <= 0 || h <= 0) out.беды.push("полю сцены не осталось места: " + w + "×" + h);

      /* Кламп зон спасает вёрстку от развала, но конфигурацию НЕ оправдывает:
       * сцена краем уходит под бар. Без этой проверки правка кита просто
       * закрасила бы плохие сочетания зелёным — и стенд стал бы врать. */
      /* Поиск, отключённый нехваткой высоты, — такой же признанный провал
       * конфигурации, как ужатые зоны: функция пропала, а настройки
       * «работают». Называем поимённо. */
      if (typeof app.finderSearchFits === "function" && app.finderSpec && app.finderSpec()) {
        var f = app.finderSearchFits();
        if (f && !f.fits && f.need) {
          out.беды.push("поиск отключён: клавиатуре " + f.have + " px из " +
            f.need + " — строка поиска не строится");
        }
      }

      if (app._chromeClamped) {
        out.беды.push("хром не помещается на экран, зоны ужаты (" +
          app._chromeClamped.ось + ": " + app._chromeClamped.было + " → " +
          app._chromeClamped.стало + ") — сцена краем под баром");
      }

      CHROME.forEach(function (sel) {
        Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
          if (el.hidden || getComputedStyle(el).display === "none") return;
          var q = el.getBoundingClientRect();
          if (!q.width || !q.height) return;
          var ox = Math.min(q.right, box.right) - Math.max(q.left, box.left);
          var oy = Math.min(q.bottom, box.bottom) - Math.max(q.top, box.top);
          if (ox > 1 && oy > 1) {
            out.беды.push(sel + " залез в поле сцены на " +
              Math.round(Math.min(ox, oy)) + " px — сцена будет под ним");
          }
          if (q.left < -1 || q.top < -1 ||
              q.right > window.innerWidth + 1 || q.bottom > window.innerHeight + 1) {
            out.беды.push(sel + " уехал за край экрана");
          }
        });
      });
      return out;
    }

    /* Снимок настроек оператора — вернём как было, чтобы прогон не
     * оставлял следов в localStorage. */
    var keys = Object.keys(AXES).filter(function (k) { return k !== "a11y"; });
    var saved = {};
    keys.forEach(function (k) { saved[k] = app.getSetting(k); });
    var savedA11y = !!app.a11y;

    /* ЖУРНАЛ ТОЖЕ СЛЕД. Прогон гоняет сотни переключений, каждое пишет
     * запись, и кольцо на 200 вытесняет настоящую историю — а её как раз
     * и смотрят, когда что-то случилось на витрине. «Не оставляет следов»
     * должно быть правдой и про журнал, а не только про настройки. */
    var savedLog = null;
    try { savedLog = localStorage.getItem(app.journalKey()); } catch (e) {}

    var combos = [{}];
    Object.keys(AXES).forEach(function (axis) {
      var next = [];
      combos.forEach(function (c) {
        AXES[axis].forEach(function (v) {
          var copy = JSON.parse(JSON.stringify(c));
          copy[axis] = v;
          next.push(copy);
        });
      });
      combos = next;
    });

    var bad = [];
    combos.forEach(function (c) {
      keys.forEach(function (k) { app.setSetting(k, c[k]); });
      app.setA11y(c["a11y"]);
      void document.body.offsetHeight;   /* вынудить пересчёт вёрстки */
      var res = check();
      if (res.беды.length) bad.push({ настройки: c, зоны: res.зоны, поле: res.поле, беды: res.беды });
    });

    keys.forEach(function (k) { app.setSetting(k, saved[k]); });
    app.setA11y(savedA11y);
    try {
      if (savedLog === null) localStorage.removeItem(app.journalKey());
      else localStorage.setItem(app.journalKey(), savedLog);
    } catch (e) {}

    var report = {
      версия: (global.KioskCore || {}).version,
      окно: window.innerWidth + "×" + window.innerHeight,
      сочетаний: combos.length,
      сломано: bad.length,
      провалы: opts.all ? bad : bad.slice(0, 12)
    };
    if (bad.length > 12 && !opts.all) report.примечание = "показаны первые 12 из " + bad.length + "; run(app, {all:true}) — все";
    try { console.log(JSON.stringify(report, null, 1)); } catch (e) {}
    return report;
  }

  global.KioskSettingsAudit = { run: run, axes: AXES };
})(window);
