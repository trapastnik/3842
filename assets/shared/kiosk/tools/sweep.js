/* ============================================================
 * BMK 38-42 · Перебор состояний сцены с проверкой healthcheck()
 * (зона kiosk-core; идея и первая реализация — МТК 39,
 *  assets/mtk39/tools/filter-sweep.js)
 *
 * Зачем. Стенд приёмки зовёт healthcheck() ОДИН раз, в том состоянии, в
 * каком застал сцену. Это ловит «загружено, но пусто», но не ловит
 * обратную ошибку — когда сцена краснеет на ЗАКОННОМ состоянии экрана.
 * У МТК 39 таких нашлось две, и обе — на сочетании фильтров, которого
 * поодиночке не видно (республика × судьба имени, честный ноль точек).
 * Перебор — то, чего одно состояние принципиально не покрывает.
 *
 * Отличие от версии 39: НЕ ЗАВИСИТ ОТ РАЗМЕТКИ. Состояния берутся из
 * объявленной схемы настроек сцены (settings:[] + applySettings), а не
 * из CSS-селекторов, которые ломаются при первом же переименовании
 * класса. Посетительские фильтры, которых в схеме нет, сцена может
 * отдать необязательным методом states() — см. ниже.
 *
 * Запуск (приложение уже открыто по http):
 *   <script src="../assets/shared/kiosk/tools/sweep.js"></script>
 *   await KioskSweep.run(app)                    // одиночные + пары
 *   await KioskSweep.run(app, { mode: "single" })
 *   await KioskSweep.run(app, { limit: 5000 })
 *
 * Таймеров не использует — работает и в фоновой вкладке.
 *
 * Необязательный хук сцены для посетительских фильтров:
 *   states() {
 *     return [
 *       { name: "все категории", apply: () => this.setFilter("all") },
 *       { name: "астероиды",     apply: () => this.setFilter("asteroids") },
 *     ];
 *   }
 * Ядро о нём не знает — это договорённость инструмента, сцены без него
 * перебираются только по схеме настроек.
 * ============================================================ */
(function (global) {
  "use strict";

  /* Значения, которыми имеет смысл шевелить настройку. Для диапазона —
   * края и дефолт: именно на краях сцены и ломаются. */
  function valuesOf(s) {
    if (s.type === "toggle") return [true, false];
    if (s.type === "select") {
      return (s.options || []).map(function (o) { return o[0]; });
    }
    var out = [s.min, s["default"], s.max].filter(function (v, i, a) {
      return v != null && a.indexOf(v) === i;
    });
    return out.length ? out : [s["default"]];
  }

  function pairs(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) out.push([list[i], list[j]]);
    }
    return out;
  }

  function health(app, id) {
    var scene = app.getScene(id);
    if (!scene || typeof scene.healthcheck !== "function") return null;
    try {
      return scene.healthcheck();
    } catch (err) {
      return { ok: false, detail: "healthcheck упал: " + (err && err.message) };
    }
  }

  function run(app, opts) {
    opts = opts || {};
    var mode = opts.mode === "single" ? "single" : "pairs";
    var limit = opts.limit || 3000;

    /* Простой и ватчдог глушим по той же причине, что и в стенде: перебор
     * идёт долго и иначе напорется на idle-сброс, который очистит
     * состояние ПОСРЕДИ проверки — ровно так у 39 обе тревоги и прошли
     * мимо приёмки. */
    var hushIdle = typeof app.suspendIdle === "function";
    var hushWd = typeof app.suspendWatchdog === "function";
    if (hushIdle) app.suspendIdle(true);
    if (hushWd) app.suspendWatchdog();
    function unhush() {
      if (hushIdle) app.suspendIdle(false);
      if (hushWd) app.resumeWatchdog();
    }

    var scenes = (opts.scenes || app.listScenes().map(function (s) { return s.id; }));
    var bad = [], checked = 0, skipped = 0, noSchema = [];

    function checkState(id, trail) {
      checked++;
      var h = health(app, id);
      if (h && h.ok === false) {
        bad.push({ scene: id, state: trail.join(" · "), detail: h.detail });
      }
    }

    function sweepScene(id) {
      var schema = typeof app.sceneSchema === "function" ? app.sceneSchema(id) : [];
      var saved = app.sceneSettings(id);
      var custom = [];
      var scene = app.getScene(id);
      if (scene && typeof scene.states === "function") {
        try { custom = scene.states() || []; } catch (err) { custom = []; }
      }
      if (!schema.length && !custom.length) { noSchema.push(id); return Promise.resolve(); }

      return app.showScene(id).then(function () {
        /* Состояния, объявленные сценой (посетительские фильтры). */
        custom.forEach(function (st) {
          try { st.apply(); } catch (err) { /* состояние не встало — не наша беда */ }
          checkState(id, ["состояние: " + (st.name || "?")]);
        });

        /* Одиночные: каждая настройка по очереди, остальные — как были. */
        schema.forEach(function (s) {
          valuesOf(s).forEach(function (v) {
            app.setSceneSetting(id, s.key, v);
            checkState(id, [s.key + "=" + v]);
          });
          app.setSceneSetting(id, s.key, saved[s.key]);
        });

        if (mode === "single") return;

        /* Пары: именно сочетание и ловит то, чего поодиночке не видно. */
        var ps = pairs(schema);
        ps.forEach(function (p) {
          var va = valuesOf(p[0]), vb = valuesOf(p[1]);
          va.forEach(function (a) {
            vb.forEach(function (b) {
              if (checked >= limit) { skipped++; return; }
              app.setSceneSetting(id, p[0].key, a);
              app.setSceneSetting(id, p[1].key, b);
              checkState(id, [p[0].key + "=" + a, p[1].key + "=" + b]);
            });
          });
          app.setSceneSetting(id, p[0].key, saved[p[0].key]);
          app.setSceneSetting(id, p[1].key, saved[p[1].key]);
        });
      }).then(function () {
        /* Возвращаем сцену как было — перебор не должен оставлять следов. */
        Object.keys(saved).forEach(function (k) {
          app.setSceneSetting(id, k, saved[k]);
        });
      });
    }

    var chain = Promise.resolve();
    scenes.forEach(function (id) {
      chain = chain.then(function () { return sweepScene(id); });
    });

    return chain.then(function () {
      unhush();
      return report({ checked: checked, skipped: skipped, bad: bad,
                      noSchema: noSchema, limit: limit, mode: mode });
    }, function (err) {
      unhush();
      throw err;
    });
  }

  function report(r) {
    console.group("%cПеребор состояний · healthcheck", "font-weight:700");
    console.log("режим: " + r.mode + ", проверено состояний: " + r.checked +
      (r.skipped ? ", ПРОПУЩЕНО по лимиту " + r.limit + ": " + r.skipped : ""));
    if (r.noSchema.length) {
      console.log("%cбез схемы и без states(), перебирать нечего: " + r.noSchema.join(", "),
        "color:#9DA3A8");
    }
    if (r.bad.length) {
      console.log("%cсцена краснеет на " + r.bad.length + " состояниях — " +
        "либо ложная тревога healthcheck, либо настоящий дефект:",
        "color:#A02128;font-weight:700");
      console.table(r.bad);
    } else {
      console.log("%cложных тревог нет", "color:#5D8970");
    }
    /* Пропуск по лимиту называем вслух: молчаливое усечение читается как
     * «проверено всё», а это не так. */
    console.groupEnd();
    return r;
  }

  global.KioskSweep = { run: run, valuesOf: valuesOf };
})(typeof window !== "undefined" ? window : this);
