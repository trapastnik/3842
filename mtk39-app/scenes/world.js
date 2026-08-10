/* МТК 39 · сцена «Мир: шар ⇄ карта».
 * Весь геолоцированный свод на одной сцене, которая разворачивается из глобуса
 * в карту и сворачивается обратно. Цвет точки — судьба имени.
 *
 * Морфинг по классической схеме d3: интерполируем не картинку, а сами
 * raw-проекции — ортографическую (шар) и Winkel Tripel (карта). WT берём из
 * канона проекта assets/shared/lib/projection.js: своей WT-математики здесь нет,
 * из константы используется только WT.ASPECT.
 *
 * d3 и projection.js подключены классическими <script> в index.html — киоск
 * офлайн, рантайм-CDN запрещены (COORDINATION.md → «Внешние зависимости»). */

import {
  DATA, STATUS, STATUS_COLOR, USSR_ISO, nf, esc, fitCanvas, drawScale, loop,
  sizeWatch, preloadPictures, objectCardHtml, createCardPanel, createOffmap, isOffMap,
  FINDER_SEARCH, normQuery, matchesQuery,
} from "./shared.js?v=11";

const DEFAULT_ROTATE = [-40, -30, 0];
const DEFAULT_SCALE = 1.16;
const MIN_SCALE = 0.4;
const MAX_SCALE = 9;
const MORPH_MS = 1500;        // разворачивание шара в карту
const IDLE_SPIN_MS = 9000;    // после этого глобус снова начинает вращаться

const DEFAULTS = { mode: "globe", spin: true, spinSpeed: 3.2, dotSize: 4.6 };

export const worldScene = {
  id: "world",
  title: { ru: "Мир: шар ⇄ карта", en: "The world: globe ⇄ map", zh: "世界：地球仪 ⇄ 地图" },
  keepAlive: true,
  watchdog: true,

  preload: {
    data: { corpus: DATA.corpus, countries: DATA.countries },
    // Канва не запускает загрузку шрифта сама (находка 40 ядра), а рисует
    // подписи начертанием 600 — просим его явно. Ядро грузит список один раз
    // на приложение, так что дубли в сценах ничего не стоят.
    fonts: ["1em '20 Kopeek'", "600 1em '20 Kopeek'", "1em 'Nolde'", "1em '21 Cent'"],
    // снимки — один раз на всё приложение, data-URL вместо сети (см. shared.js)
    custom: preloadPictures,
  },

  settings: [
    { key: "mode", label: { ru: "Вид при открытии", en: "View on open", zh: "打开时的视图" },
      type: "select", default: "globe",
      options: [["globe", "Глобус"], ["map", "Карта"]] },
    { key: "spin", label: { ru: "Вращение в простое", en: "Idle rotation", zh: "空闲时旋转" },
      type: "toggle", default: true },
    { key: "spinSpeed", label: { ru: "Скорость вращения", en: "Rotation speed", zh: "旋转速度" },
      type: "range", min: 0, max: 12, step: 0.2, unit: " °/с", default: 3.2 },
    { key: "dotSize", label: { ru: "Размер точек", en: "Dot size", zh: "点的大小" },
      type: "range", min: 2, max: 8, step: 0.2, unit: " px", default: 4.6 },
  ],

  /* Отбор ушёл в финдер ядра; чипы «глобус / карта» остались на сцене —
     это переключение вида, а не отбор: в панели оно оказалось бы за два
     касания вместо одного и перестало быть видимым. */
  finder: {
    search: FINDER_SEARCH,
    filters: [
      { key: "status", label: { ru: "Судьба имени", en: "Fate of the name", zh: "名称的命运" },
        options: (c) => STATUS.map((s) => [s.key, c.app.t(s.t)]) },
      // свод на 93 % — бывший СССР и Европа: без ядра видно всё прочее
      { key: "ussr", label: { ru: "Бывший СССР", en: "Former USSR", zh: "前苏联" },
        options: (c) => [["hide", c.app.t("world.noUssr")]] },
    ],
  },

  opt: Object.assign({}, DEFAULTS),

  applySettings(values) {
    this.opt = Object.assign({}, DEFAULTS, values || {});
    if (this.api) this.api.applyOptions();
  },

  applyFinder(state) {
    return this.api ? this.api.applyFind(state) : undefined;
  },

  mount(el, ctx) {
    const scene = this;
    const app = ctx.app;
    const WT = window.MtkProjection.WinkelTripel;
    const d3 = window.d3;
    this.appRef = app;

    const corpus = ctx.data.corpus;
    const countries = ctx.data.countries;
    const points = corpus.records.filter((r) => !isOffMap(r));

    el.classList.add("m39-scene", "m39-world");
    el.innerHTML =
      '<canvas class="m39-canvas"></canvas>' +
      '<header class="m39-head m39-head--over"><p class="m39-sub"></p></header>' +
      '<nav class="m39-modes" aria-label="Вид">' +
        '<button class="m39-chip kiosk-target" type="button" data-mode="globe"></button>' +
        '<button class="m39-chip kiosk-target" type="button" data-mode="map"></button>' +
      "</nav>" +
      /* Нижний левый угол — ОДНА колонка: чип «не на карте» и ярлыки судьбы
         имени. Раздельные absolute-якоря разъехались бы, как только ярлык
         стал контролом с тач-полом: три строки по 64 px × ui-scale выше
         любого подобранного отступа. Порядок задаёт поток. */
      '<div class="m39-corner">' +
        '<div class="m39-offtoggle"></div>' +
        '<aside class="m39-legend"></aside>' +
      "</div>" +
      '<div class="m39-offhost"></div>';

    const canvas = el.querySelector(".m39-canvas");
    const g = canvas.getContext("2d");

    /* ---- состояние ---- */
    let alpha = 0;                   // 0 — шар, 1 — карта
    let width = 0;
    let height = 0;
    let rotation = DEFAULT_ROTATE.slice();
    let tilt = DEFAULT_ROTATE[1];
    let panY = 0;
    let scaleFactor = DEFAULT_SCALE;
    /* Отбор держит ядро (финдер), сцена хранит только зеркало последнего
       applyFinder — своей копии состояния у неё нет. */
    let status = null;
    let hideUssr = false;
    let query = "";
    let mode = "globe";
    let morph = null;
    let selected = null;
    let visible = [];
    let dirty = true;
    let lastDrawn = 0;          // сколько точек легло в последний кадр (healthcheck)
    let lastFrame = 0;
    let lastInteraction = performance.now();

    /* ---- проекция ---- */
    const WT_X_SPAN = WT.ASPECT * Math.PI;
    const WT_HALF_X = WT_X_SPAN / 2;
    const wtRaw = (lambda, phi) => {
      const p = WT.project((phi * 180) / Math.PI, (lambda * 180) / Math.PI, 1, 1);
      return [(p.x - 0.5) * WT_X_SPAN, (0.5 - p.y) * Math.PI];
    };
    const morphRaw = (lambda, phi) => {
      const [x0, y0] = d3.geoOrthographicRaw(lambda, phi);
      if (alpha === 0) return [x0, y0];
      const [x1, y1] = wtRaw(lambda, phi);
      return [x0 + (x1 - x0) * alpha, y0 + (y1 - y0) * alpha];
    };
    const projection = d3.geoProjection(morphRaw).precision(0.4);
    const path = d3.geoPath(projection, g);

    // у шара видно полушарие, у карты — почти весь мир; окно раскрывается по
    // мере разворачивания, поэтому обратная сторона выплывает, а не появляется
    const clipAngle = () => 90 + 89 * alpha;
    const invalidate = () => { dirty = true; };

    function applyProjection() {
      const globeK = (Math.min(width, height) * scaleFactor) / 2;
      const mapK = (Math.min(width * 0.94, height * 0.78 * WT.ASPECT) * scaleFactor)
        / (2 * WT_HALF_X);
      rotation[1] = tilt * (1 - alpha);
      const k = globeK + (mapK - globeK) * alpha;

      // На шаре вертикаль отдана наклону полюсов, на карте наклон бессмыслен —
      // там та же протяжка двигает полотно; иначе после зума верх и низ карты
      // недосягаемы: по горизонтали выручает вращение, по вертикали нет.
      const mapH = k * Math.PI;
      const limit = Math.max(0, (mapH - height) / 2 + height * 0.08);
      panY = Math.max(-limit, Math.min(limit, panY));

      projection
        .scale(k)
        .translate([width / 2, height / 2 + panY * alpha])
        .rotate(rotation)
        // на развёрнутой карте складки нет — отсечение выключаем, иначе
        // край отсечения даёт шов поперёк мира
        .clipAngle(alpha >= 1 ? null : clipAngle());
      projection.precision(0.4);
      dirty = true;
    }

    const isVisible = (lng, lat) => {
      if (alpha >= 1) return true;
      const [rl, rp] = projection.rotate();
      return d3.geoDistance([lng, lat], [-rl, -rp]) < (clipAngle() * Math.PI) / 180;
    };

    /* Канон порядка: отбор → поиск. Сортировки у карты нет — на плоскости
       точек её нечем показать, а чип, ничего не меняющий на экране, считался
       бы критерием на счётчике финдера. */
    const passes = (p) => (!status || p.status === status)
      && !(hideUssr && p.continent === "Бывший СССР")
      && matchesQuery(p, query);

    /* ---- отрисовка ---- */
    function render() {
      const u = drawScale(app, width);
      g.clearRect(0, 0, width, height);

      g.beginPath();
      path({ type: "Sphere" });
      const grad = g.createRadialGradient(
        width / 2, height * 0.42, 10,
        width / 2, height * 0.42, Math.min(width, height) * 0.62,
      );
      grad.addColorStop(0, "rgba(58, 70, 78, 0.95)");
      grad.addColorStop(1, "rgba(18, 24, 28, 1)");
      g.fillStyle = grad;
      // в середине разворачивания край отсечения вырождается в шов — гасим заливку
      g.globalAlpha = alpha > 0 && alpha < 1 ? 1 - alpha * 0.85 : 1;
      g.fill();
      g.globalAlpha = 1;

      g.beginPath();
      path(d3.geoGraticule10());
      g.strokeStyle = "rgba(247, 249, 239, 0.05)";
      g.lineWidth = 1;
      g.stroke();

      for (const f of countries.features) {
        const iso = f.properties.ISO_A3 || f.properties.ADM0_A3;
        g.beginPath();
        path(f);
        g.fillStyle = USSR_ISO.has(iso)
          ? "rgba(210, 183, 115, 0.16)"
          : "rgba(67, 80, 89, 0.5)";
        g.fill();
        g.strokeStyle = "rgba(247, 249, 239, 0.13)";
        g.lineWidth = 0.6;
        g.stroke();
      }

      if (alpha === 0 || alpha === 1) {
        g.beginPath();
        path({ type: "Sphere" });
        g.strokeStyle = "rgba(210, 183, 115, 0.4)";
        g.lineWidth = 1.2;
        g.stroke();
      }

      // сначала приглушённые, потом активные — активные не тонут в общей массе
      visible = [];
      const rMax = (scene.opt.dotSize || DEFAULTS.dotSize) * u;
      const r = Math.max(2 * u, Math.min(rMax, projection.scale() / 190));
      for (const pass of [false, true]) {
        for (const p of points) {
          if (passes(p) !== pass) continue;
          if (!isVisible(p.lng, p.lat)) continue;
          const pt = projection([p.lng, p.lat]);
          if (!pt) continue;
          if (pass) visible.push({ p, x: pt[0], y: pt[1] });

          const sel = selected === p;
          g.beginPath();
          g.arc(pt[0], pt[1], sel ? r + 3.5 : r, 0, Math.PI * 2);
          g.fillStyle = pass ? STATUS_COLOR.get(p.status) : "rgba(157, 163, 168, 0.14)";
          g.globalAlpha = pass ? 0.9 : 1;
          g.fill();
          g.globalAlpha = 1;
          if (pass) {
            g.strokeStyle = "rgba(0, 0, 0, 0.5)";
            g.lineWidth = 0.9;
            g.stroke();
          }
        }
      }

      lastDrawn = visible.length;

      if (selected && isVisible(selected.lng, selected.lat)) {
        const pt = projection([selected.lng, selected.lat]);
        g.beginPath();
        g.arc(pt[0], pt[1], r + 11, 0, Math.PI * 2);
        const glow = g.createRadialGradient(pt[0], pt[1], r, pt[0], pt[1], r + 15);
        glow.addColorStop(0, "rgba(247, 249, 239, 0.5)");
        glow.addColorStop(1, "rgba(247, 249, 239, 0)");
        g.fillStyle = glow;
        g.fill();
      }
    }

    /* ---- цикл ---- */
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

    const anim = loop((now) => {
      ctx.beat();
      const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
      lastFrame = now;

      if (morph) {
        const t = Math.min(1, (now - morph.t0) / MORPH_MS);
        alpha = morph.from + (morph.to - morph.from) * ease(t);
        applyProjection();
        if (t >= 1) { alpha = morph.to; morph = null; }
      }

      if (scene.opt.spin !== false && !selected && !morph && mode === "globe"
        && now - lastInteraction > IDLE_SPIN_MS) {
        rotation[0] = (rotation[0] + (scene.opt.spinSpeed ?? DEFAULTS.spinSpeed) * dt) % 360;
        applyProjection();
      }
      if (dirty) { dirty = false; render(); }
    });

    /* ---- размер ---- */
    const watch = sizeWatch(el, (w, h) => {
      width = w; height = h;
      fitCanvas(canvas, w, h);
      applyProjection();
      // первый кадр — сразу, не дожидаясь rAF: иначе слой проявляется пустым,
      // а healthcheck честно докладывает «ни одной точки»
      dirty = false;
      render();
    });

    /* ---- панели ---- */
    const sub = el.querySelector(".m39-sub");
    const legend = el.querySelector(".m39-legend");
    const modes = el.querySelector(".m39-modes");
    const offhost = el.querySelector(".m39-offhost");

    const card = createCardPanel(el, app, () => { selected = null; invalidate(); });

    function showCard(p) {
      selected = p || null;
      invalidate();
      if (!p) { card.close(); return; }
      card.open(objectCardHtml(app, ctx, p));
    }

    const offmap = createOffmap(offhost, app, corpus.records, {
      onPick: showCard,
      // чип — в общую колонку угла, картотека-оверлей — на слой сцены
      toggleHost: el.querySelector(".m39-offtoggle"),
    });

    /* Легенда — ЯРЛЫК В ФИНДЕР (канон PLAN-KIOSK). Она выглядит как отбор и
       поэтому обязана им быть: посетитель, впервые увидевший экран, тычет в
       «переименовано 462», а не ищет лупу. Своего состояния ярлык не держит —
       зовёт то же самое, что чип панели, и подсвечивается по тому, что ядро
       вернуло в applyFinder.

       Счёт у строки — по всем критериям, КРОМЕ самой судьбы имени: иначе при
       выбранном фильтре у остальных строк стоял бы ноль и ярлык читался бы
       как недоступный. Без фильтра оба счёта совпадают. */
    const passesButStatus = (p) => !(hideUssr && p.continent === "Бывший СССР")
      && matchesQuery(p, query);

    function buildLegend() {
      legend.replaceChildren();
      for (const s of STATUS) {
        const n = points.filter((p) => p.status === s.key && passesButStatus(p)).length;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "m39-legend__row kiosk-target";
        b.dataset.status = s.key;
        b.setAttribute("aria-pressed", String(status === s.key));
        b.innerHTML = '<span class="m39-legend__dot" style="background:' + s.color + '"></span>' +
          '<span class="m39-legend__label">' + esc(app.t(s.t)) + "</span>" +
          '<span class="m39-legend__num">' + nf.format(n) + "</span>";
        // повторный тап снимает фильтр — ровно как повторный тап по чипу
        b.addEventListener("click", () => {
          app.setFinder({ filters: { status: status === s.key ? null : s.key } });
        });
        legend.appendChild(b);
      }
    }

    function syncModeUI() {
      for (const b of modes.querySelectorAll("[data-mode]")) {
        b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
        b.textContent = app.t("world.mode." + b.dataset.mode);
      }
    }

    function setMode(next, instant) {
      if (mode === next && !instant) return;
      mode = next;
      if (next === "globe") panY = 0;
      if (instant) {
        alpha = next === "map" ? 1 : 0;
        morph = null;
        applyProjection();
      } else {
        morph = { from: alpha, to: next === "map" ? 1 : 0, t0: performance.now() };
      }
      showCard(null);
      syncModeUI();
      touched();
    }

    /* Подсказку жеста ведёт кит (KioskHint): он сам гасит её по касанию
       контейнера и возвращает через idleMs. Здесь остаётся только отметка
       времени для авто-вращения. */
    function touched() {
      lastInteraction = performance.now();
    }

    function retext() {
      sub.textContent = app.t("world.sub", {
        shown: nf.format(points.length),
        total: nf.format(corpus.records.length),
        countries: new Set(points.map((p) => p.country)).size,
      });
      if (hint) hint.setLabel(app.t("world.hint"));
      syncModeUI();
      buildLegend();
      offmap.setLang();
      if (selected) card.open(objectCardHtml(app, ctx, selected));
    }

    /* ---- ввод ---- */
    const setScale = (next) => {
      scaleFactor = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
      applyProjection();
    };

    const pick = (x, y) => {
      let best = null;
      const hit = 26 * drawScale(app, width);
      let bestD = hit * hit;
      for (const v of visible) {
        const d = (v.x - x) ** 2 + (v.y - y) ** 2;
        if (d < bestD) { bestD = d; best = v.p; }
      }
      return best;
    };

    let moved = 0;
    d3.select(canvas).call(
      d3.drag()
        .on("start", () => { moved = 0; touched(); })
        .on("drag", (e) => {
          moved += Math.abs(e.dx) + Math.abs(e.dy);
          const k = 0.26 / Math.sqrt(scaleFactor);
          rotation[0] += e.dx * k * 1.6;
          // вертикаль: у шара — наклон, у карты — сдвиг полотна; на кадрах
          // морфинга работают оба, пропорционально степени разворачивания
          tilt = Math.max(-89, Math.min(89, tilt - e.dy * k * 1.6 * (1 - alpha)));
          panY += e.dy * alpha;
          applyProjection();
          touched();
        })
        .on("end", (e) => {
          if (moved < 6) showCard(pick(e.x, e.y));
          touched();
        }),
    );

    const onWheel = (e) => {
      e.preventDefault();
      setScale(scaleFactor * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
      touched();
    };
    let pinch = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e) => {
      if (e.touches.length === 2) pinch = { d: dist(e.touches), s: scaleFactor };
    };
    const onTouchMove = (e) => {
      if (pinch && e.touches.length === 2) {
        setScale(pinch.s * (dist(e.touches) / pinch.d));
        touched();
      }
    };
    const onTouchEnd = () => { pinch = null; };
    const onMode = (e) => {
      const b = e.target.closest("[data-mode]");
      if (b) setMode(b.dataset.mode);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });
    modes.addEventListener("click", onMode);

    /* ---- ручки для контракта сцены ---- */
    this.api = {
      anim,
      retext,
      invalidate,
      remeasure: () => watch.measure(true),
      applyOptions() {
        const want = scene.opt.mode === "map" ? "map" : "globe";
        if (want !== mode) setMode(want, true);
        invalidate();
      },
      /* Один вход на любое изменение отбора — и точки, и картотека «не на
         карте», и легенда пересчитываются одним и тем же предикатом passes.
         Разведи их — и чип «не на карте · 109» начнёт спорить со строкой
         «3 из 1203» в панели. */
      applyFind({ query: q, filters }) {
        query = normQuery(q);
        status = (filters && filters.status) || null;
        hideUssr = !!(filters && filters.ussr === "hide");
        showCard(null);
        offmap.setFilter(passes);
        buildLegend();
        invalidate();
        /* «N из M» считаем по всему своду, а не по точкам на карте: часть
           записей живёт в картотеке «не на карте», и посетитель, у которого
           все совпадения там, иначе прочёл бы «0» при полной картотеке. */
        return { shown: corpus.records.filter(passes).length,
          total: corpus.records.length };
      },
      /* Зеркало отбора чистим и здесь. Ядро гасит финдер ДО reset() и зовёт
         applyFinder заново, так что в штатном пути это дубль; но reset()
         дёргают и в обход финдера (оператор, стенд), и сцена, оставшаяся с
         чужим отбором при пустой панели, — ровно та загадка без объяснения,
         на которой кит поймал возврат 1.17.4. */
      reset() {
        status = null;
        hideUssr = false;
        query = "";
        offmap.setFilter(null);
        scaleFactor = DEFAULT_SCALE;
        tilt = DEFAULT_ROTATE[1];
        panY = 0;
        rotation = DEFAULT_ROTATE.slice();
        showCard(null);
        offmap.close();
        setMode(scene.opt.mode === "map" ? "map" : "globe", true);
        buildLegend();
        if (hint) hint.show();   // экран вернулся в исходный вид — зовём жест сразу
        applyProjection();
      },
      /* Аттрактор: шар без интерфейса. Петлю даёт ядро (standbyTicker держит
         standbyFps и не будит композитор каждый vsync), угол считаем от
         секунд простоя — тогда картинка не зависит от частоты тиков. */
      standby(app_) {
        anim.stop();
        this.reset();
        setMode("globe", true);
        const from = rotation[0];
        const stop = app_.standbyTicker((t) => {
          rotation[0] = (from + t * 3.5) % 360;
          applyProjection();
          render();
        });
        return () => { stop(); lastFrame = 0; anim.start(); };
      },
      /* Проверяем, что сцене есть что показывать, а не текущую комбинацию
         фильтров: «утрачено» без бывшего СССР законно даёт ноль точек, и это
         не повод для тревоги — на экране карта, легенда и счётчики. */
      health() {
        const total = points.length;
        if (!total) return { ok: false, detail: "корпус пуст: ни одной точки" };
        if (!width || !height) return { ok: false, detail: "холст без размера" };
        /* Ноль при отборе — законное состояние, а не авария: «утрачено» без
           бывшего СССР честно пусто, и на экране остаются карта, легенда и
           картотека «не на карте». */
        return { ok: true, detail: "точек в своде " + total +
          ", при текущем отборе " + points.filter(passes).length +
          " (плюс не на карте " + offmap.count() + ")" +
          ", в последнем кадре " + lastDrawn };
      },
      destroy() {
        anim.stop();
        d3.select(canvas).on(".drag", null);
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("touchstart", onTouchStart);
        canvas.removeEventListener("touchmove", onTouchMove);
        canvas.removeEventListener("touchend", onTouchEnd);
        modes.removeEventListener("click", onMode);
        watch.destroy();
        offmap.destroy();
        card.destroy();
        if (hint) hint.destroy();
      },
    };

    /* Вешаем на контейнер сцены, а не на канву: браузер не рисует детей
       холста, и подсказка внутри него невидима с рождения (грабли кита). */
    const hint = window.KioskHint
      ? window.KioskHint.attach(el, { gesture: "drag", label: app.t("world.hint") })
      : null;

    retext();
    watch.measure(true);
    setMode(this.opt.mode === "map" ? "map" : "globe", true);
    anim.start();
  },

  resume() {
    if (!this.api) return;
    this.api.remeasure();
    this.api.anim.start();
  },

  pause() {
    if (this.api) this.api.anim.stop();
  },

  reset() {
    if (this.api) this.api.reset();
  },

  setLang() {
    if (this.api) this.api.retext();
  },

  setA11y() {
    // кегли и точки завязаны на app.scales().content — достаточно перерисовать
    if (!this.api) return;
    this.api.remeasure();
    this.api.invalidate();
  },

  standby() {
    return this.api ? this.api.standby(this.appRef) : null;
  },

  /* Структурные проверки не видят «загружено, но пусто»: DOM на месте,
     сеть чиста, а на шаре ни одной точки. */
  healthcheck() {
    return this.api ? this.api.health() : { ok: false, detail: "сцена не смонтирована" };
  },

  unmount() {
    if (this.api) this.api.destroy();
    this.api = null;
  },
};
