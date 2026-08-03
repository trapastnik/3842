/* ============================================================
 * BMK 38-42 · Стенд приёмки киоск-приложения (зона kiosk-core)
 *
 * Прогоняет перф- и тач-проверки из PLAN-KIOSK (фаза 4) прямо в
 * работающем приложении — не заменяет глаза, но ловит то, что глазами
 * не видно: утечки при переключении сцен, догрузку из сети в рантайме,
 * буфер сверх бюджета, мелкие тач-таргеты.
 *
 * Подключение (временно, на время прогона):
 *   <script src="../assets/shared/kiosk/tools/selftest.js"></script>
 * и в консоли:
 *   await KioskSelfTest.run(app)              // 50 циклов (канон)
 *   await KioskSelfTest.run(app, {cycles: 10})
 *
 * ВАЖНО: прогонять в ВИДИМОЙ вкладке. В фоне браузер замораживает rAF и
 * душит таймеры — проверки кадров там бессмысленны, и стенд об этом
 * честно скажет, а не покажет зелёный результат.
 * ============================================================ */
(function (global) {
  "use strict";

  var MP_BUDGET = 8.3e6;   /* канон: рендер-буфер ≤ 8.3 Мп */

  function num(v) { return Math.round(Number(v) || 0); }

  function heap() {
    var m = performance.memory;
    return m ? m.usedJSHeapSize : null;
  }

  function domNodes() {
    return document.getElementsByTagName("*").length;
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /* Частота кадров: сколько раз в секунду кто-то просит rAF. На сцене без
   * анимации должно быть около нуля — это и есть проверка «0 rAF у
   * неактивных сцен» (петля ушедшей сцены проявится здесь же). */
  function rafRate(ms) {
    return new Promise(function (res) {
      var n = 0, stop = false;
      var t0 = performance.now();
      (function tick() {
        if (stop) return;
        n++;
        requestAnimationFrame(tick);
      })();
      setTimeout(function () {
        stop = true;
        res(Math.round((n / (performance.now() - t0)) * 1000));
      }, ms);
    });
  }

  function px(name, def) {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return isFinite(v) ? v : def;
  }

  /* ------------------------------------------------------------ проверки */

  /* Запрещена СЕТЬ, а не диск (канон уточнён в PLAN-KIOSK). Локальная
   * догрузка по тапу легальна и обязательна: у МТК 41 282 фотографии —
   * 7,8 ГБ в декодированном виде, прероллить оригиналы невозможно.
   * Валим приёмку только на внешних хостах. */
  function checkNetwork(sinceMs) {
    var late = performance.getEntriesByType("resource").filter(function (e) {
      return e.startTime > sinceMs;
    });
    var external = [], local = [];
    late.forEach(function (e) {
      var host;
      try { host = new URL(e.name, location.href).origin; } catch (err) { host = ""; }
      (host && host !== location.origin ? external : local).push(e.name);
    });
    return {
      name: "Ноль обращений к внешним хостам",
      ok: external.length === 0,
      detail: external.length
        ? external.length + " внешних запрос(ов): " + external.slice(0, 5).join(", ")
        : "внешних нет" + (local.length
            ? "; локальных догрузок после старта: " + local.length + " (это норма)"
            : "; локальных догрузок тоже нет"),
      data: { external: external, local: local }
    };
  }

  /* Структурные проверки не видят «загружено, но пусто»: DOM на месте,
   * сеть чиста, а на экране ничего. Сцена сама знает, что для неё
   * признак живого содержимого. */
  function checkHealth(app) {
    var scenes = app.listScenes();
    var checked = [], bad = [];
    scenes.forEach(function (s) {
      var scene = app.getScene(s.id);
      if (!scene || typeof scene.healthcheck !== "function") return;
      var r;
      try {
        r = scene.healthcheck();
      } catch (err) {
        r = { ok: false, detail: "healthcheck упал: " + (err && err.message) };
      }
      r = r || {};
      checked.push(s.id);
      if (!r.ok) bad.push(s.id + ": " + (r.detail || "без пояснения"));
    });
    if (!checked.length) {
      return {
        name: "Самопроверка сцен",
        ok: null,
        detail: "ни одна сцена не объявила healthcheck() — «загружено, но пусто» не ловится"
      };
    }
    return {
      name: "Самопроверка сцен",
      ok: bad.length === 0,
      detail: bad.length ? bad.join("; ")
        : "проверено " + checked.length + " из " + scenes.length + ": " + checked.join(", ")
    };
  }

  function checkCanvas() {
    var list = Array.prototype.slice.call(document.querySelectorAll("canvas"));
    var over = list.filter(function (c) { return c.width * c.height > MP_BUDGET; });
    return {
      name: "Буфер ≤ 8.3 Мп",
      ok: over.length === 0,
      detail: list.length === 0 ? "canvas нет" :
        (over.length ? over.length + " из " + list.length + " сверх бюджета: " +
          over.map(function (c) { return c.width + "×" + c.height; }).join(", ")
          : list.length + " canvas, максимум " +
            Math.max.apply(null, list.map(function (c) { return c.width * c.height; })) / 1e6 + " Мп")
    };
  }

  /* Тач-стандарт: размер таргетов и отступ от кромки панели. Проверяем
   * только ВИДИМЫЕ интерактивные элементы активной сцены и хрома. */
  function checkTouch() {
    var min = px("--touch-min", 64);
    var edge = px("--edge-safe", 64);
    var edgeBottom = px("--edge-safe-bottom", 80);
    var vw = innerWidth, vh = innerHeight;

    /* В схлопнутом или скрытом окне вся раскладка вырождается в ноль, и
     * «всё у кромки» — не дефект, а отсутствие раскладки. Красный тут
     * хуже пропуска: пара ложных срабатываний, и стенду перестают верить. */
    if (vw < 320 || vh < 320) {
      var why = "окно " + Math.round(vw) + "×" + Math.round(vh) +
        " — раскладки нет, мерить нечего";
      return [
        { name: "Тач-таргеты ≥ " + Math.round(min) + " px", ok: null, detail: why },
        { name: "Отступ от кромки", ok: null, detail: why }
      ];
    }

    var els = Array.prototype.slice.call(
      document.querySelectorAll("button, [role=button], a[href], input, select, .kiosk-touch")
    ).filter(function (el) {
      if (el.closest(".kiosk-service")) return false;   /* панель оператора — не для посетителя */
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    });

    var small = [], nearEdge = [];
    els.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width < min - 0.5 || r.height < min - 0.5) {
        small.push(label(el) + " " + num(r.width) + "×" + num(r.height));
      }
      if (r.left < edge - 0.5 || r.top < edge - 0.5 ||
          vw - r.right < edge - 0.5 || vh - r.bottom < edgeBottom - 0.5) {
        nearEdge.push(label(el));
      }
    });

    return [
      {
        name: "Тач-таргеты ≥ " + num(min) + " px",
        ok: small.length === 0,
        detail: small.length ? small.length + " мелких: " + small.slice(0, 6).join("; ")
          : "проверено " + els.length + " элементов, все в норме"
      },
      {
        name: "Отступ от кромки ≥ " + num(edge) + "/" + num(edgeBottom) + " px",
        ok: nearEdge.length === 0,
        detail: nearEdge.length ? nearEdge.length + " у кромки: " + nearEdge.slice(0, 6).join("; ")
          : "проверено " + els.length + " элементов, все в безопасной зоне"
      }
    ];
  }

  function label(el) {
    return (el.className && String(el.className).split(" ")[0]) || el.tagName.toLowerCase();
  }

  function checkScroll() {
    var bad = Array.prototype.slice.call(document.querySelectorAll("*")).filter(function (el) {
      if (el.closest(".kiosk-service")) return false;
      var cs = getComputedStyle(el);
      var scrolls = /(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX);
      if (!scrolls) return false;
      if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) return false;
      return !el.classList.contains("kiosk-scroll");
    });
    return {
      name: "Видимый скролл (.kiosk-scroll)",
      ok: bad.length === 0,
      detail: bad.length ? bad.length + " контейнер(ов) без класса: " +
        bad.slice(0, 5).map(label).join(", ")
        : "скрытых полос прокрутки нет"
    };
  }

  /* ------------------------------------------------------------- прогон */

  function run(app, opts) {
    opts = opts || {};
    var cycles = opts.cycles || 50;
    var results = [];
    var hidden = document.hidden;
    var startedAt = performance.now();

    var scenes = app.listScenes().length;

    /* Прогревочный круг ДО замера. Сцены с keepAlive (по умолчанию)
     * монтируются один раз и остаются жить — если снять базовую линию до
     * прогрева, их первое построение засчитается как утечка. Течь — это
     * рост ПОСЛЕ того, как все сцены уже поднялись. */
    var warm = Promise.resolve();
    for (var w = 0; w < scenes; w++) {
      warm = warm.then(function () { return app.nextScene(); });
    }

    return warm
      .then(function () { return sleep(300); })
      .then(function () { return rafRate(600); })
      .then(function (rateBefore) {
        var heapBefore = heap();
        var domBefore = domNodes();
        var t0 = performance.now();

        /* Полные циклы по всем сценам. */
        var chain = Promise.resolve();
        for (var i = 0; i < cycles * scenes; i++) {
          chain = chain.then(function () { return app.nextScene(); });
        }

        return chain.then(function () {
          return sleep(400);            /* дать отработать отложенным снятиям */
        }).then(function () {
          return rafRate(600);
        }).then(function (rateAfter) {
          var heapAfter = heap();
          var domAfter = domNodes();
          var secs = ((performance.now() - t0) / 1000).toFixed(1);

          results.push({
            name: cycles + " циклов переключения (" + cycles * scenes + " переходов)",
            ok: true,
            detail: "за " + secs + " с, сцен " + scenes
          });

          results.push({
            name: "DOM не растёт",
            ok: domAfter - domBefore <= 0,
            detail: domBefore + " → " + domAfter + " узлов (" +
              (domAfter - domBefore >= 0 ? "+" : "") + (domAfter - domBefore) +
              ") после прогрева"
          });

          results.push({
            name: "Слоёв не больше, чем сцен",
            ok: document.querySelectorAll(".kiosk-layer").length <= scenes,
            detail: document.querySelectorAll(".kiosk-layer").length + " слоёв на " + scenes +
              " сцен — больше означало бы, что старые слои не снимаются"
          });

          if (heapBefore == null) {
            results.push({
              name: "JS heap",
              ok: null,
              detail: "performance.memory недоступен — запускать Chrome для замера"
            });
          } else {
            var growthMb = (heapAfter - heapBefore) / 1048576;
            results.push({
              /* Порог, а не ноль: без принудительной сборки мусора
               * несколько мегабайт — это ещё не собранный мусор, а не течь. */
              name: "JS heap не растёт",
              ok: growthMb < 8,
              detail: (heapBefore / 1048576).toFixed(1) + " → " + (heapAfter / 1048576).toFixed(1) +
                " МБ (" + (growthMb >= 0 ? "+" : "") + growthMb.toFixed(1) + " МБ)"
            });
          }

          results.push({
            name: "0 rAF у неактивных сцен",
            ok: hidden ? null : rateAfter <= rateBefore + 2,
            detail: hidden
              ? "не измерено: вкладка в фоне, кадров нет вовсе"
              : "до циклов " + rateBefore + " к/с, после " + rateAfter +
                " к/с — рост означает, что петля ушедшей сцены осталась жить"
          });

          results.push(checkNetwork(startedAt));
          results.push(checkHealth(app));
          results.push(checkCanvas());
          results.push(checkScroll());
          checkTouch().forEach(function (r) { results.push(r); });

          return report(results, hidden);
        });
      });
  }

  function report(results, hidden) {
    var pass = results.filter(function (r) { return r.ok === true; }).length;
    var fail = results.filter(function (r) { return r.ok === false; }).length;
    var skip = results.filter(function (r) { return r.ok === null; }).length;

    console.group("%cСтенд приёмки kiosk-core", "font-weight:700");
    results.forEach(function (r) {
      var mark = r.ok === true ? "✓" : r.ok === false ? "✗" : "—";
      var css = r.ok === true ? "color:#5D8970" : r.ok === false ? "color:#A02128;font-weight:700" : "color:#9DA3A8";
      console.log("%c" + mark + " " + r.name + " — " + r.detail, css);
    });
    if (hidden) console.warn("Вкладка была в фоне: проверки кадров пропущены.");
    console.log("Итого: " + pass + " ок, " + fail + " провал, " + skip + " пропущено");
    console.groupEnd();

    return { pass: pass, fail: fail, skip: skip, hidden: hidden, results: results };
  }

  global.KioskSelfTest = { run: run, rafRate: rafRate };
})(typeof window !== "undefined" ? window : this);
