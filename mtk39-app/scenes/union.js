/* МТК 39 · сцена «Карта Союза».
 * Та часть свода, что лежит в бывшем СССР, — крупным планом, с рубрикатором по
 * республикам. Здесь главный сюжет: имя ушло прежде всего оттуда, где его
 * насаждали, и перевес красного виден без пояснений. Мировая картина осталась
 * в сцене «Мир» — эта намеренно смотрит внутрь.
 *
 * Проекция — общий канон проекта: MtkProjection.WinkelTripel (порядок
 * аргументов (lat, lng), аспект только из WT.ASPECT). Мир считается целиком, а
 * на экран берётся окно нужной республики: масштаб и сетка те же, что в «Мире»,
 * и карты сопоставимы между собой. */

import {
  DATA, STATUS, STATUS_COLOR, nf, esc, fitCanvas, drawScale, loop, sizeWatch,
  objectCardHtml, createCardPanel, createOffmap, isOffMap,
} from "./shared.js?v=5";

const REPUBLIC_ISO = new Set([
  "RUS", "UKR", "BLR", "MDA", "LVA", "LTU", "EST",
  "GEO", "ARM", "AZE", "KAZ", "UZB", "TKM", "TJK", "KGZ",
]);
// названия республик в Natural Earth расходятся с музейными
const NE_ALIAS = {
  Беларусь: "Белоруссия",
  Кыргызстан: "Киргизия",
  Туркменистан: "Туркмения",
  Молдавия: "Молдова",
};

const FLY_MS = 800;
// В файле границ 54 контура из 82 — вырожденные обрезки по 4–5 точек с нулевой
// площадью, лежащие парами Россия/Украина: следы спорных участков в самих
// данных. На приближении они читаются как случайный сор у берега. Порог с
// запасом: следующий по величине контур крупнее в сотни раз, острова целы.
const MIN_RING_AREA = 0.05;

const DEFAULTS = { zoomRange: 2.6, dotSize: 6, minCount: 3 };

export const unionScene = {
  id: "union",
  title: { ru: "Карта Союза", en: "Map of the Union", zh: "苏联地图" },
  keepAlive: true,
  watchdog: true,

  preload: {
    data: { corpus: DATA.corpus, countries: DATA.countries },
    // Канва не запускает загрузку шрифта сама (находка 40 ядра), а рисует
    // подписи начертанием 600 — просим его явно. Ядро грузит список один раз
    // на приложение, так что дубли в сценах ничего не стоят.
    fonts: ["1em '20 Kopeek'", "600 1em '20 Kopeek'", "1em 'Nolde'", "1em '21 Cent'"],
  },

  settings: [
    { key: "zoomRange", label: { ru: "Запас приближения", en: "Zoom range", zh: "缩放范围" },
      type: "range", min: 1, max: 5, step: 0.1, unit: " ×", default: 2.6 },
    { key: "dotSize", label: { ru: "Размер точек", en: "Dot size", zh: "点的大小" },
      type: "range", min: 3, max: 12, step: 0.5, unit: " px", default: 6 },
    { key: "minCount", label: { ru: "Республика в рубрикаторе от", en: "Republic rail threshold", zh: "分类栏阈值" },
      type: "range", min: 1, max: 20, step: 1, unit: " зап.", default: 3 },
  ],

  opt: Object.assign({}, DEFAULTS),

  applySettings(values) {
    this.opt = Object.assign({}, DEFAULTS, values || {});
    if (this.api) this.api.applyOptions();
  },

  mount(el, ctx) {
    const scene = this;
    const app = ctx.app;
    const WT = window.MtkProjection.WinkelTripel;
    this.appRef = app;

    const corpus = ctx.data.corpus;
    const union = corpus.records.filter((r) => r.continent === "Бывший СССР");
    const points = union.filter((r) => !isOffMap(r));

    el.classList.add("m39-scene", "m39-union");
    el.innerHTML =
      '<canvas class="m39-canvas"></canvas>' +
      '<aside class="m39-rail">' +
        '<header class="m39-rail__head"><h1 class="m39-rail__title"></h1>' +
        '<p class="m39-sub"></p></header>' +
        '<nav class="m39-republics kiosk-scroll" aria-label="Республики"></nav>' +
        '<div class="m39-offhost"></div>' +
      "</aside>" +
      '<aside class="m39-legend"></aside>' +
      '<nav class="m39-filters" aria-label="Что показывать"><div class="m39-chips"></div></nav>';

    const canvas = el.querySelector(".m39-canvas");
    const g = canvas.getContext("2d");
    const rail = el.querySelector(".m39-rail");
    const railTitle = el.querySelector(".m39-rail__title");
    const sub = el.querySelector(".m39-sub");
    const republics = el.querySelector(".m39-republics");
    const legend = el.querySelector(".m39-legend");
    const chips = el.querySelector(".m39-chips");
    const offhost = el.querySelector(".m39-offhost");

    /* ---- состояние ---- */
    let width = 0;
    let height = 0;
    let baseW = 0;              // ширина мира при zoom = 1
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let land = [];              // контуры пятнадцати республик: { ring, name }
    let unionBox = null;
    let bboxes = new Map();
    let visible = [];
    let selected = null;
    let statusFilter = "all";
    let republic = null;        // null — весь Союз
    let activeBox = null;
    let fitZoom = 1;
    let fly = null;
    let dirty = true;
    let lastDrawn = 0;          // точек в последнем кадре (healthcheck)

    const invalidate = () => { dirty = true; };
    const worldW = () => baseW * zoom;
    const worldH = () => worldW() / WT.ASPECT;
    const originX = () => (width - worldW()) / 2 + panX;
    const originY = () => (height - worldH()) / 2 + panY;
    const project = (lat, lng) => {
      const p = WT.project(lat, lng, worldW(), worldH());
      return [p.x + originX(), p.y + originY()];
    };

    /* Свободное поле: всё, что справа от рубрикатора. Карта живёт только в нём. */
    function field() {
      const r = rail.getBoundingClientRect();
      const host = el.getBoundingClientRect();
      const railRight = Math.max(0, r.right - host.left);
      return {
        x0: railRight + width * 0.02,
        x1: width * 0.985,
        y0: height * 0.05,
        y1: height * 0.9,
      };
    }

    /* Стол, а не браузер: карту нельзя утащить в пустоту и нельзя отдалить
       дальше кадра. Пока область меньше поля — держится по центру, больше —
       ходит ровно в пределах своих краёв. */
    function clampView() {
      if (!activeBox) return;
      const range = scene.opt.zoomRange || DEFAULTS.zoomRange;
      zoom = Math.max(fitZoom, Math.min(fitZoom * range, zoom));
      const baseH = baseW / WT.ASPECT;
      const f = field();
      const w = (activeBox[2] - activeBox[0]) * baseW * zoom;
      const h = (activeBox[3] - activeBox[1]) * baseH * zoom;
      const cx = ((activeBox[0] + activeBox[2]) / 2) * baseW * zoom;
      const cy = ((activeBox[1] + activeBox[3]) / 2) * baseH * zoom;

      const screenCX = cx + (width - baseW * zoom) / 2 + panX;
      const screenCY = cy + (height - baseH * zoom) / 2 + panY;
      const fitCX = (f.x0 + f.x1) / 2;
      const fitCY = (f.y0 + f.y1) / 2;
      const limitX = Math.max(0, (w - (f.x1 - f.x0)) / 2);
      const limitY = Math.max(0, (h - (f.y1 - f.y0)) / 2);
      const wantCX = Math.max(fitCX - limitX, Math.min(fitCX + limitX, screenCX));
      const wantCY = Math.max(fitCY - limitY, Math.min(fitCY + limitY, screenCY));
      panX += wantCX - screenCX;
      panY += wantCY - screenCY;
    }

    /* box — доли мира [minX, minY, maxX, maxY], посчитанные по самим контурам. */
    function viewFor(box) {
      const baseH = baseW / WT.ASPECT;
      const w = Math.max(1e-6, (box[2] - box[0]) * baseW);
      const h = Math.max(1e-6, (box[3] - box[1]) * baseH);
      const f = field();
      const z = Math.min((f.x1 - f.x0) / w, (f.y1 - f.y0) / h);
      const cx = ((box[0] + box[2]) / 2) * baseW;
      const cy = ((box[1] + box[3]) / 2) * baseH;
      return {
        zoom: z,
        panX: (f.x0 + f.x1) / 2 - (width - baseW * z) / 2 - cx * z,
        panY: (f.y0 + f.y1) / 2 - (height - baseH * z) / 2 - cy * z,
      };
    }

    function flyTo(view, instant) {
      if (instant) {
        // первый кадр обязан открыться уже наведённым, а не доезжать анимацией
        ({ zoom, panX, panY } = view);
        fly = null;
        dirty = true;
        return;
      }
      fly = { from: { zoom, panX, panY }, to: view, t0: performance.now() };
    }

    /* ---- данные ---- */
    // площадь контура в квадратных градусах — по формуле шнурков
    function ringArea(ring) {
      let a = 0;
      for (let i = 1; i < ring.length; i++) {
        a += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
      }
      return Math.abs(a) / 2;
    }

    function prepareLand(geo) {
      land = [];
      bboxes = new Map();
      unionBox = null;
      for (const f of geo.features) {
        const iso = f.properties.ISO_A3 || f.properties.ADM0_A3;
        if (!REPUBLIC_ISO.has(iso)) continue;   // разговор только про Союз
        const name = f.properties.NAME_RU;
        const gm = f.geometry;
        const polys = gm.type === "Polygon" ? [gm.coordinates]
          : gm.type === "MultiPolygon" ? gm.coordinates : [];
        let box = null;
        for (const poly of polys) {
          for (const ring of poly) {
            if (ring.length < 6 || ringArea(ring) < MIN_RING_AREA) continue;
            land.push({ ring, name });
            for (const [lng, lat] of ring) {
              // Чукотка уходит за антимеридиан и растянула бы рамку России
              // на весь мир — считаем только по восточному полушарию
              if (lng < 0) continue;
              const q = WT.project(lat, lng, 1, 1);
              box = box
                ? [Math.min(box[0], q.x), Math.min(box[1], q.y),
                  Math.max(box[2], q.x), Math.max(box[3], q.y)]
                : [q.x, q.y, q.x, q.y];
            }
          }
        }
        if (name && box) bboxes.set(name, box);
        if (box) {
          unionBox = unionBox
            ? [Math.min(unionBox[0], box[0]), Math.min(unionBox[1], box[1]),
              Math.max(unionBox[2], box[2]), Math.max(unionBox[3], box[3])]
            : box.slice();
        }
      }
    }
    prepareLand(ctx.data.countries);

    const bboxOf = (country) => bboxes.get(NE_ALIAS[country] || country) || null;
    const shown = (p) => (statusFilter === "all" || p.status === statusFilter)
      && (!republic || p.country === republic);

    /* ---- отрисовка ---- */
    /* Выбранная республика горит, соседи приглушены: без этого при приближении
       соседняя земля читается как обрывки — заливка одна на всех, а границы
       на таком масштабе уходят за экран. */
    function drawLand() {
      const u = drawScale(app, width);
      const active = republic ? (NE_ALIAS[republic] || republic) : null;

      const paint = (isActive) => {
        g.beginPath();
        for (const item of land) {
          if ((item.name === active) !== isActive) continue;
          let started = false;
          let prevX = 0;
          for (const [lng, lat] of item.ring) {
            const [x, y] = project(lat, lng);
            if (started && Math.abs(x - prevX) > worldW() * 0.5) started = false;
            if (started) g.lineTo(x, y); else { g.moveTo(x, y); started = true; }
            prevX = x;
          }
        }
        if (isActive) {
          g.fillStyle = "rgba(126, 132, 106, 0.96)";
          g.fill();
          g.strokeStyle = "rgba(210, 183, 115, 0.85)";
          g.lineWidth = 1.6 * u;
        } else {
          g.fillStyle = active ? "rgba(74, 82, 76, 0.75)" : "rgba(96, 104, 92, 0.9)";
          g.fill();
          g.strokeStyle = active ? "rgba(210, 183, 115, 0.22)" : "rgba(210, 183, 115, 0.5)";
          g.lineWidth = 1;
        }
        g.stroke();
      };

      paint(false);
      if (active) paint(true);
    }

    function render() {
      const u = drawScale(app, width);
      g.clearRect(0, 0, width, height);
      drawLand();

      visible = [];
      const cap = (scene.opt.dotSize || DEFAULTS.dotSize);
      const r = Math.max(2, Math.min(cap, 2.4 * Math.sqrt(zoom))) * u;
      for (const pass of [false, true]) {
        for (const p of points) {
          if (shown(p) !== pass) continue;
          const [x, y] = project(p.lat, p.lng);
          if (x < -40 || x > width + 40 || y < -40 || y > height + 40) continue;
          if (pass) visible.push({ p, x, y });
          g.beginPath();
          g.arc(x, y, pass ? r : r * 0.65, 0, Math.PI * 2);
          g.fillStyle = pass ? STATUS_COLOR.get(p.status) : "rgba(157, 163, 168, 0.16)";
          g.globalAlpha = pass ? 0.92 : 1;
          g.fill();
          g.globalAlpha = 1;
        }
      }

      lastDrawn = visible.length;

      if (selected && shown(selected)) {
        const [x, y] = project(selected.lat, selected.lng);
        g.beginPath();
        g.arc(x, y, r + 4, 0, Math.PI * 2);
        g.strokeStyle = "#f7f9ef";
        g.lineWidth = 1.6;
        g.stroke();
      }
    }

    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

    const anim = loop((now) => {
      ctx.beat();
      if (fly) {
        const t = Math.min(1, (now - fly.t0) / FLY_MS);
        const k = ease(t);
        zoom = fly.from.zoom + (fly.to.zoom - fly.from.zoom) * k;
        panX = fly.from.panX + (fly.to.panX - fly.from.panX) * k;
        panY = fly.from.panY + (fly.to.panY - fly.from.panY) * k;
        if (t >= 1) fly = null;
        dirty = true;
      }
      if (dirty) { dirty = false; render(); }
    });

    const watch = sizeWatch(el, (w, h) => {
      width = w; height = h;
      fitCanvas(canvas, w, h);
      baseW = Math.min(w * 0.98, h * 0.8 * WT.ASPECT);
      if (activeBox) {
        const v = viewFor(activeBox);
        fitZoom = v.zoom;
        ({ zoom, panX, panY } = v);
      }
      clampView();
      // первый кадр — сразу, не дожидаясь rAF (см. world.js)
      dirty = false;
      render();
    });

    /* ---- карточка и картотека ---- */
    const card = createCardPanel(el, app, () => { selected = null; invalidate(); });

    function showCard(p) {
      selected = p || null;
      invalidate();
      if (!p) { card.close(); return; }
      card.open(objectCardHtml(app, ctx, p));
    }

    const offmap = createOffmap(offhost, app, union, {
      onPick: showCard,
      countryKey: "union.byRepublic",
    });

    /* ---- панели ---- */
    function buildLegend() {
      legend.replaceChildren();
      for (const s of STATUS) {
        const n = points.filter((p) => p.status === s.key && shown(p)).length;
        const row = document.createElement("div");
        row.className = "m39-legend__row";
        row.innerHTML = '<span class="m39-legend__dot" style="background:' + s.color + '"></span>' +
          esc(app.t(s.t)) + ' <span class="m39-legend__num">' + nf.format(n) + "</span>";
        legend.appendChild(row);
      }
    }

    function buildFilters() {
      chips.replaceChildren();
      const opts = [["all", app.t("status.all")], ...STATUS.map((s) => [s.key, app.t(s.t)])];
      for (const [key, label] of opts) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "m39-chip kiosk-target";
        b.textContent = label;
        b.setAttribute("aria-pressed", String(key === statusFilter));
        b.addEventListener("click", () => {
          statusFilter = key;
          [...chips.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
          showCard(null);
          buildLegend();
          invalidate();
        });
        chips.appendChild(b);
      }
    }

    let allBtn = null;
    const railButtons = new Map();       // название республики → кнопка

    function setRepublic(name, btn, instant) {
      republic = name;
      showCard(null);
      const active = btn || (name ? railButtons.get(name) : allBtn) || allBtn;
      [...republics.children].forEach((c) =>
        c.setAttribute("aria-pressed", String(c === active)));
      buildLegend();
      activeBox = (name ? bboxOf(name) : unionBox) || unionBox;
      const view = viewFor(activeBox);
      fitZoom = view.zoom;
      flyTo(view, !!instant);
      const inCorpus = union.filter((r) => !name || r.country === name).length;
      const onMap = points.filter(shown).length;
      // в рубрикаторе — все записи республики, на карте — только привязанные
      // к точке; разницу проговариваем, чтобы числа не спорили
      sub.textContent = name
        ? app.t("union.subRepublic", { name, total: nf.format(inCorpus), onMap: nf.format(onMap) })
        : app.t("union.sub", { total: nf.format(inCorpus) });
      invalidate();
    }

    function buildRepublics() {
      const counts = new Map();
      for (const r of union) counts.set(r.country, (counts.get(r.country) || 0) + 1);
      const list = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const min = scene.opt.minCount || DEFAULTS.minCount;

      republics.replaceChildren();
      railButtons.clear();
      allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = "m39-republic kiosk-target";
      allBtn.setAttribute("aria-pressed", "true");
      allBtn.innerHTML = "<span>" + esc(app.t("union.all")) + '</span><span class="m39-republic__n">' +
        nf.format(union.length) + "</span>";
      allBtn.addEventListener("click", () => setRepublic(null, allBtn));
      republics.appendChild(allBtn);

      for (const [name, n] of list) {
        // единичные «Абхазия», «Россия / Украина» — в картотеке, не в рубрикаторе
        if (n < min) continue;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "m39-republic kiosk-target";
        b.setAttribute("aria-pressed", String(name === republic));
        b.innerHTML = "<span>" + esc(name) + '</span><span class="m39-republic__n">' +
          nf.format(n) + "</span>";
        b.addEventListener("click", () => setRepublic(name, b));
        railButtons.set(name, b);
        republics.appendChild(b);
      }
    }

    function retext() {
      railTitle.textContent = app.t("union.title");
      if (hint) hint.setLabel(app.t("union.hint"));
      buildFilters();
      buildRepublics();
      offmap.setLang();
      setRepublic(republic, null, true);
      if (selected) card.open(objectCardHtml(app, ctx, selected));
    }

    /* ---- ввод ---- */
    function zoomAt(factor, cx, cy) {
      const range = scene.opt.zoomRange || DEFAULTS.zoomRange;
      const next = Math.max(fitZoom, Math.min(fitZoom * range, zoom * factor));
      if (Math.abs(next - zoom) < 1e-6) return;
      const wx = (cx - originX()) / worldW();
      const wy = (cy - originY()) / worldH();
      zoom = next;
      panX = cx - (width - worldW()) / 2 - wx * worldW();
      panY = cy - (height - worldH()) / 2 - wy * worldH();
      clampView();
      invalidate();
    }

    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;
    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    // подсказку гасит и возвращает сам кит — сцене отмечать нечего

    const onDown = (e) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      fly = null;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      panX += dx;
      panY += dy;
      clampView();
      invalidate();
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      if (moved < 6) {
        const [x, y] = local(e);
        let best = null;
        const hit = 24 * drawScale(app, width);
        let bestD = hit * hit;
        for (const v of visible) {
          const d = (v.x - x) ** 2 + (v.y - y) ** 2;
          if (d < bestD) { bestD = d; best = v.p; }
        }
        showCard(best);
      }
    };
    const onCancel = () => { dragging = false; };
    // Колесо — отладочное удобство на ноутбуке: на столе масштаб задают щипком,
    // а основной способ приблизиться — выбор республики.
    const onWheel = (e) => {
      e.preventDefault();
      fly = null;
      const [x, y] = local(e);
      zoomAt(e.deltaY < 0 ? 1.08 : 1 / 1.08, x, y);
    };

    let pinch = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => {
      const r = canvas.getBoundingClientRect();
      return [(t[0].clientX + t[1].clientX) / 2 - r.left,
        (t[0].clientY + t[1].clientY) / 2 - r.top];
    };
    const onTouchStart = (e) => {
      if (e.touches.length === 2) { dragging = false; fly = null; pinch = dist(e.touches); }
    };
    const onTouchMove = (e) => {
      if (pinch && e.touches.length === 2) {
        const d = dist(e.touches);
        const [cx, cy] = mid(e.touches);
        zoomAt(d / pinch, cx, cy);
        pinch = d;
      }
    };
    const onTouchEnd = () => { pinch = null; };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });

    this.api = {
      anim,
      retext,
      invalidate,
      remeasure: () => watch.measure(true),
      applyOptions() {
        buildRepublics();
        setRepublic(republic, null, true);
        clampView();
        invalidate();
      },
      reset() {
        statusFilter = "all";
        showCard(null);
        offmap.close();
        buildFilters();
        setRepublic(null, allBtn, true);
        if (hint) hint.show();   // экран вернулся в исходный вид — зовём жест сразу
        invalidate();
      },
      /* Комбинация «республика × судьба имени» законно бывает пустой
         (Азербайджан + «носит имя»), и это осмысленный ответ, а не поломка:
         на экране контур республики, легенда с нулём и рубрикатор. Красным
         помечаем только то, из-за чего показывать нечего в принципе. */
      health() {
        if (!land.length) return { ok: false, detail: "контуры республик не построены" };
        if (!points.length) return { ok: false, detail: "в Союзе нет геолоцированных объектов" };
        if (!width || !height) return { ok: false, detail: "холст без размера" };
        return { ok: true, detail: "точек в Союзе " + points.length +
          ", при текущем фильтре " + points.filter(shown).length +
          ", контуров " + land.length + ", в последнем кадре " + lastDrawn };
      },
      destroy() {
        anim.stop();
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onCancel);
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("touchstart", onTouchStart);
        canvas.removeEventListener("touchmove", onTouchMove);
        canvas.removeEventListener("touchend", onTouchEnd);
        watch.destroy();
        offmap.destroy();
        card.destroy();
        if (hint) hint.destroy();
      },
    };

    /* На контейнер сцены, а не на канву: детей холста браузер не рисует. */
    const hint = window.KioskHint
      ? window.KioskHint.attach(el, { gesture: "drag", label: app.t("union.hint") })
      : null;

    railTitle.textContent = app.t("union.title");
    buildFilters();
    buildRepublics();
    watch.measure(true);
    setRepublic(null, allBtn, true);
    anim.start();
  },

  resume() {
    if (!this.api) return;
    this.api.remeasure();
    this.api.anim.start();
  },

  pause() { if (this.api) this.api.anim.stop(); },
  reset() { if (this.api) this.api.reset(); },
  setLang() { if (this.api) this.api.retext(); },

  setA11y() {
    if (!this.api) return;
    this.api.remeasure();
    this.api.invalidate();
  },

  healthcheck() {
    return this.api ? this.api.health() : { ok: false, detail: "сцена не смонтирована" };
  },

  unmount() {
    if (this.api) this.api.destroy();
    this.api = null;
  },
};
