/* МТК 39 · замер финдера «до / после отбора».
 *
 * Обе половины таблицы снимаются ОДНИМ прогоном на одной сборке: числа до
 * отбора и после каждого критерия, строка «N из M» из панели, healthcheck на
 * каждом состоянии.
 *
 * Эталон считается ЗДЕСЬ, по сырым данным, своим кодом — не тем, который
 * меряем. Проверка, где эталон и измеряемое ставятся одним вызовом, не
 * проверяет ничего (грабля 38: буфер 2×2 был зелёным, потому что рамку и
 * буфер выставлял один setSize).
 *
 * Таймеров нет: в фоновой вкладке setInterval душится до тика в минуту и
 * длинный прогон выглядит зависанием (стенд 39 встал на 350 переходах).
 *
 * Запуск из консоли страницы mtk39-app:
 *     await mtk39FinderCheck()
 *
 * ВАЖНО про числа. Счётные величины (сколько записей, «N из M», healthcheck)
 * верны в любой вкладке. Абсолютные пиксели раскладки — НЕТ: в фоновой
 * вкладке переходы не доезжают, var() в поддереве слоя не пересчитывается.
 * Геометрию снимать на живом экране; отсюда публиковать только инварианты.
 */
(function () {
  "use strict";

  var norm = function (s) {
    return String(s == null ? "" : s)
      .toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  };
  var FIELDS = ["name", "name_orig", "name_short", "city", "country"];
  var hit = function (rec, q) {
    if (!q) return true;
    for (var i = 0; i < FIELDS.length; i++) {
      if (rec[FIELDS[i]] && norm(rec[FIELDS[i]]).indexOf(q) >= 0) return true;
    }
    return false;
  };
  var offMap = function (r) {
    return r.geolocated === false || r.lat === null || r.lat === undefined
      || r.lng === null || r.lng === undefined;
  };

  /* Сцена → чем считать эталон. Каждый предикат написан здесь заново: если
     импортировать shared.js, сверялись бы две копии одной ошибки. */
  var MODELS = {
    world: {
      set: "corpus",
      pick: function (r, st) {
        return (!st.status || r.status === st.status)
          && !(st.ussr === "hide" && r.continent === "Бывший СССР")
          && hit(r, st.q);
      },
    },
    union: {
      set: "union",
      pick: function (r, st) {
        return (!st.status || r.status === st.status) && hit(r, st.q);
      },
    },
    catalog: {
      set: "corpus",
      pick: function (r, st) {
        return (!st.status || r.status === st.status) && hit(r, st.q);
      },
    },
    globe: {
      set: "picked",
      pick: function (r, st) {
        return (!st.category || r.category === st.category) && hit(r, st.q);
      },
    },
    streets: {
      set: "streets",
      pick: function (r, st) {
        return (!st.country || r.country === st.country) && hit(r, st.q);
      },
    },
  };

  function panelCount() {
    var el = document.querySelector(".kiosk-finder__count");
    return el ? el.textContent.trim() : null;
  }

  /* «N из M» глазами посетителя: строку разбираем обратно в числа, чтобы
     сверять с эталоном, а не с самим собой. */
  function parseCount(text) {
    if (!text) return null;
    var m = text.match(/(\d[\d\s ]*)\D+(\d[\d\s ]*)$/);
    if (!m) return null;
    var num = function (s) { return parseInt(s.replace(/[\s ]/g, ""), 10); };
    return { shown: num(m[1]), total: num(m[2]) };
  }

  async function loadJson(url) {
    var r = await fetch(url);
    if (!r.ok) throw new Error(url + " → " + r.status);
    return r.json();
  }

  window.mtk39FinderCheck = async function (opts) {
    opts = opts || {};
    var app = window.mtk39App;
    if (!app) throw new Error("нет window.mtk39App — открой mtk39-app");

    /* Протокольный замер начинается с ОЧИСТКИ, а не с записи: «поставил
       конфиг» и «нет чужого конфига» — разные гарантии (GRABLI 76). Ключ
       привязан к origin, и остаток прошлого прогона переживает перезагрузку.
       Порядок: очистить → перезагрузить → поставить явно → печатать рядом. */
    var leftovers = Object.keys(localStorage)
      .filter(function (k) { return /kiosk|mtk39/i.test(k) && !/-log$/.test(k); });
    var scales = app.scales();
    var conf = {
      среда: document.hidden ? "ФОНОВАЯ ВКЛАДКА (пиксели недостоверны)" : "живая вкладка",
      "чужой стейт в localStorage": leftovers.length
        ? "ЕСТЬ, замер не протокольный: " + leftovers.join(", ")
        : "нет (чисто)",
      вьюпорт: innerWidth + "×" + innerHeight,
      dpr: devicePixelRatio,
      язык: app.lang,
      a11y: app.a11y,
      "scale.ui": app.getSetting("scale.ui"),
      "scale.content": app.getSetting("scale.content"),
      "итоговый ui": scales.ui,
      "итоговый content": scales.content,
    };

    var corpus = await loadJson("../data/mtk39-corpus.json");
    var picked = await loadJson("../data/mtk39.json");
    var streets = await loadJson("../data/mtk39-streets.json");
    var sets = {
      corpus: corpus.records,
      union: corpus.records.filter(function (r) { return r.continent === "Бывший СССР"; }),
      picked: picked.items,
      streets: streets.items,
    };

    var rows = [];
    var problems = [];
    var ids = Object.keys(MODELS).filter(function (id) { return app.finderSpec(id); });

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var model = MODELS[id];
      var data = sets[model.set];
      var spec = app.finderSpec(id);

      await app.showScene(id);
      app.resetFinder(id);
      app.openFinder(true);

      /* Состояния: «до отбора», затем каждый критерий по отдельности, затем
         запрос, затем связка «фильтр + запрос» — стык, которого нет ни в
         одном одиночном состоянии. */
      var states = [{ name: "до отбора", patch: {}, st: {} }];
      (spec.filters || []).forEach(function (f) {
        var options = typeof f.options === "function" ? f.options(app.context()) : f.options;
        (options || []).forEach(function (o) {
          var v = Array.isArray(o) ? o[0] : o;
          var patch = { filters: {} };
          patch.filters[f.key] = v;
          var st = {};
          st[f.key] = v;
          states.push({ name: "отбор " + f.key + "=" + v, patch: patch, st: st });
        });
      });
      var queries = opts.queries || ["ленина", "lenine", "гавана", "щщщ"];
      queries.forEach(function (q) {
        states.push({ name: 'поиск "' + q + '"', patch: { query: q }, st: { q: norm(q) } });
      });
      if ((spec.filters || []).length) {
        var fk = spec.filters[0].key;
        var first = typeof spec.filters[0].options === "function"
          ? spec.filters[0].options(app.context())[0]
          : spec.filters[0].options[0];
        var fv = Array.isArray(first) ? first[0] : first;
        var both = { filters: {}, query: "ленина" };
        both.filters[fk] = fv;
        var bst = { q: "ленина" };
        bst[fk] = fv;
        states.push({ name: "отбор " + fk + "=" + fv + ' + поиск "ленина"', patch: both, st: bst });
      }
      (spec.sorts || []).forEach(function (o) {
        states.push({ name: "сортировка " + o.key, patch: { sort: o.key }, st: {} });
      });

      for (var j = 0; j < states.length; j++) {
        var s = states[j];
        app.resetFinder(id);
        app.setFinder(s.patch, id);

        var expect = data.filter(function (r) { return model.pick(r, s.st); }).length;
        var shownText = panelCount();
        var parsed = parseCount(shownText);
        /* Сцену берём через app.getScene() — allScenes() отдаёт карточки
           {id,title,enabled}, а не объекты сцен, и проверка молча
           превращалась в «нет healthcheck». Невозможное предусловие не
           проваливает пункт — оно тихо делает его пустым. */
        var scene = app.getScene(id);
        var hc;
        if (!scene || typeof scene.healthcheck !== "function") {
          hc = { ok: false, detail: "сцена не отдала healthcheck — проверять нечем" };
        } else {
          try {
            hc = scene.healthcheck();
          } catch (err) {
            hc = { ok: false, detail: "healthcheck упал: " + (err && err.message) };
          }
        }

        var row = {
          сцена: id,
          состояние: s.name,
          "эталон (сырые данные)": expect,
          "панель «N из M»": shownText || "—",
          "shown из панели": parsed ? parsed.shown : null,
          "total из панели": parsed ? parsed.total : null,
          "на карте / карточек": domCount(id),
          healthcheck: hc.ok === false ? "✗ " + hc.detail : hc.ok === null ? "— " + hc.detail : "✓",
        };
        rows.push(row);

        if (parsed && parsed.shown !== expect) {
          problems.push(id + " · " + s.name + ": панель «" + parsed.shown +
            "», эталон по сырым данным " + expect);
        }
        if (hc.ok === false) {
          problems.push(id + " · " + s.name + ": healthcheck ✗ — " + hc.detail);
        }
      }

      app.resetFinder(id);
      app.openFinder(false);
    }

    console.info("[mtk39] конфигурация замера:");
    console.table(conf);
    console.info("[mtk39] финдер, до и после отбора:");
    console.table(rows);
    if (problems.length) {
      console.warn("[mtk39] расхождения:\n" + problems.join("\n"));
    } else {
      console.info("[mtk39] расхождений нет: панель, сцена и сырые данные сходятся");
    }
    return { conf: conf, rows: rows, problems: problems };
  };

  /* Сколько объектов реально на экране — по DOM, а не по внутреннему счёту
     сцены: канвовые сцены рисуют точки, у них считаем через healthcheck. */
  function domCount(id) {
    if (id === "catalog") return document.querySelectorAll(".m39-card2").length;
    if (id === "streets") return document.querySelectorAll(".m39-leaf").length + " (листов на стене)";
    if (id === "globe") return document.querySelectorAll(".m39-offlist__item").length + " (список не на карте)";
    return "канва";
  }

  /* ---- порог поиска: ОДНА ступень лестницы ----------------------------
   * Ступень снимается с чистого reload и с ЯВНО поставленной конфигурации,
   * а хранилище чистится ДО, а не после: «поставил конфиг» и «нет чужого
   * конфига» — разные гарантии (GRABLI 76). Поэтому функция меряет ровно
   * одну ступень и печатает конфигурацию рядом с числами; лестница
   * собирается из пяти запусков, между ними — перезагрузка.
   *
   *     localStorage.clear(); location.reload();
   *     await mtk39SearchStep({ ui: 1.2, a11y: true })
   */
  window.mtk39SearchStep = async function (step) {
    var app = window.mtk39App;
    if (!app) throw new Error("нет window.mtk39App");
    step = step || {};

    var leftovers = Object.keys(localStorage)
      .filter(function (k) { return /kiosk|mtk39/i.test(k) && !/-log$/.test(k); });

    /* Закрытая панель не имеет измеримой раскладки: с 1.20.11 кит честно
       отвечает fits:null — «спросили не вовремя», а не «не помещается».
       Раньше на этом месте приходило правдоподобное число от несуществующей
       раскладки, и ступень получалась ложной. */
    var closed = app.finderSearchFits();

    if (step.ui != null) app.setSetting("scale.ui", step.ui);
    if (step.a11y != null) app.setA11y(!!step.a11y);
    await app.showScene(step.scene || "catalog");
    app.openFinder(true);

    var open1 = app.finderSearchFits();
    var open2 = app.finderSearchFits();          // идемпотентность обязательна
    var panel = document.querySelector(".kiosk-finder");
    var q = panel && panel.querySelector(".kiosk-finder__q");

    /* Отказ кит пишет МИКРОЗАДАЧЕЙ (1.20.11). Синхронное чтение журнала
       успевает раньше записи и печатает «отказа нет» на ступени, где отказ
       есть, — правдоподобно и неверно. Даём очереди провернуться. */
    await new Promise(function (res) { setTimeout(res, 0); });

    var row = {
      "чужой стейт до замера": leftovers.length
        ? "ЕСТЬ, ступень не протокольная: " + leftovers.join(", ") : "нет (чисто)",
      "scale.ui": app.getSetting("scale.ui"),
      "режим слабовидящих": app.a11y,
      "действующий ui": app.scales().ui,
      вьюпорт: innerWidth + "×" + innerHeight,
      "на закрытой панели": closed && closed.fits === null
        ? "fits:null — не мерил (штатно)" : JSON.stringify(closed),
      вмещаемость: JSON.stringify(open1),
      идемпотентно: JSON.stringify(open1) === JSON.stringify(open2),
      "строка поиска": q && !q.hidden ? "построена" : "НЕ построена",
      "чипов в панели": panel ? panel.querySelectorAll(".kiosk-finder__chip").length : 0,
      отказ: (app.getSessionLog() || [])
        .filter(function (e) { return /поиск недоступен/.test(e.msg || ""); })
        .map(function (e) { return e.msg; })[0] || "—",
    };
    console.table(row);
    if (!row.идемпотентно) {
      console.warn("[mtk39] finderSearchFits() дал два разных числа — ступень недействительна");
    }
    return row;
  };

  /* Геометрия панели — отдельным прогоном, БЕЗ переключения сцен: смена
     сцены закрывает панель по канону «панель принадлежит сцене», и пункт
     стенда с открытой панелью стал бы тихо пустым.
     Проверяем ПОПАДАНИЕМ ПАЛЬЦА, а не наличием узла: закрытая панель уже
     оставалась невидимым кликоблокером именно потому, что проверка смотрела
     на hidden. */
  window.mtk39FinderGeometry = function () {
    var app = window.mtk39App;
    if (!app) throw new Error("нет window.mtk39App");
    var panel = document.querySelector(".kiosk-finder");
    if (!panel) return { ok: false, detail: "панели нет в DOM" };

    var probe = function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return { reachable: false, why: "нулевой размер" };
      var x = r.left + r.width / 2;
      var y = r.top + r.height / 2;
      var top = document.elementFromPoint(x, y);
      return {
        reachable: !!top && (el === top || el.contains(top) || top.contains(el)),
        got: top ? (top.className || top.tagName) : null,
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      };
    };

    var open = app.openFinder(true) && true;
    var chips = [].slice.call(panel.querySelectorAll(".kiosk-finder__chip"));
    var keys = [].slice.call(panel.querySelectorAll(".kiosk-kbd button"));
    var res = {
      среда: document.hidden ? "ФОНОВАЯ — пиксели недостоверны, читать только «достижим/нет»" : "живая",
      открыта: open,
      "чипов в панели": chips.length,
      "чипов недостижимо": chips.filter(function (c) { return !probe(c).reachable; }).length,
      "клавиш в раскладке": keys.length,
      "клавиш недостижимо": keys.filter(function (k) { return !probe(k).reachable; }).length,
      "строка поиска построена": !!panel.querySelector(".kiosk-finder__q:not([hidden])"),
    };

    /* Закрытая панель обязана перестать ловить палец — тот самый
       кликоблокер правого верхнего квадранта. */
    app.openFinder(false);
    var r = panel.getBoundingClientRect();
    if (r.width && r.height) {
      var t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      res["закрытая панель ловит палец"] = !!(t && panel.contains(t));
    } else {
      res["закрытая панель ловит палец"] = false;
    }
    console.table(res);
    return res;
  };
}());
