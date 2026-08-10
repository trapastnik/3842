/* МТК 39 · сцена «Глобус избранного».
 * Отобранные объекты с фотографиями и карточками — тот самый первый
 * прототип МТК 39, переехавший на киоск-платформу. Число объектов нигде не
 * прописано словами: подзаголовок берёт его из набора (в словаре стояло
 * «пятьдесят семь» при 64 записях). Настройки художника
 * (вращение, атмосфера, освещение, звёзды, пульсация, прилёт точек, подписи,
 * дуги) больше не живут в собственной панели и в localStorage прототипа:
 * они объявлены схемой и крутятся из сервис-панели ядра.
 *
 * d3 подключён локально классическим <script> — офлайн-киоск. */

import {
  DATA, esc, plural, fitCanvas, drawScale, loop, sizeWatch,
  preloadPictures, filePicture, createCardPanel, isOffMap,
  FINDER_SEARCH, normQuery, matchesQuery,
} from "./shared.js?v=14";

const USSR_ISO = new Set([
  "RUS", "UKR", "BLR", "MDA", "LVA", "LTU", "EST",
  "GEO", "ARM", "AZE", "KAZ", "UZB", "TKM", "TJK", "KGZ",
]);

const CATEGORY_LABELS = {
  university: "Университеты", military_academy: "Военные училища",
  library: "Библиотеки", factory: "Заводы", metallurgy: "Металлургия",
  power_plant: "Электростанции", nuclear: "АЭС", waterway: "Каналы и водные пути",
  railway: "Железная дорога", mine: "Шахты", stadium: "Стадионы",
  printing: "Типографии", foundation: "Фонды", research_lab: "Лаборатории",
  museum: "Музеи", nature_reserve: "Заповедники", mountain: "Горы",
  asteroid: "Астероиды", paleontology: "Палеонтология",
  agriculture: "Сельское хозяйство",
};

// Родина Ленина — Ульяновск (Симбирск): начало дуг
const ORIGIN = [48.4031, 54.3142];

// Приоритет подписей: чем раньше в списке, тем важнее при тесноте
const KEY_LABEL_ORDER = [
  "rgb-lenina", "leti", "lenin-peak", "ulyanovsk-tank", "dneproges",
  "chaes", "mmk", "krasmash", "bsu", "kazakh-polytechnic",
];
const KEY_LABEL_RANK = new Map(KEY_LABEL_ORDER.map((id, i) => [id, i]));

const DEFAULT_ROTATE = [-55, -50, 0];
const DEFAULT_SCALE = 1.18;
const MIN_SCALE = 0.28;
const MAX_SCALE = 8.5;

const DEFAULTS = {
  autoRotate: true, autoRotateSpeed: 4, atmosphere: true, lighting: true,
  stars: true, pulsation: true, flyIn: true, labels: true, arcs: true,
};

export const globeScene = {
  id: "globe",
  title: { ru: "Глобус избранного", en: "Globe of highlights", zh: "精选地球仪" },
  keepAlive: true,
  watchdog: true,

  preload: {
    data: { countries: DATA.countries, picked: DATA.picked },
    // Канва не запускает загрузку шрифта сама (находка 40 ядра), а рисует
    // подписи начертанием 600 — просим его явно. Ядро грузит список один раз
    // на приложение, так что дубли в сценах ничего не стоят.
    fonts: ["1em '20 Kopeek'", "600 1em '20 Kopeek'", "1em 'Nolde'", "1em '21 Cent'"],
    custom: preloadPictures,
  },

  settings: [
    { key: "autoRotate", label: { ru: "Авто-вращение", en: "Auto rotation", zh: "自动旋转" },
      type: "toggle", default: true },
    { key: "autoRotateSpeed", label: { ru: "Скорость вращения", en: "Rotation speed", zh: "旋转速度" },
      type: "range", min: 0, max: 20, step: 1, unit: " °/с", default: 4 },
    { key: "pulsation", label: { ru: "Пульсация точек", en: "Point pulsation", zh: "光点脉动" },
      type: "toggle", default: true },
    { key: "flyIn", label: { ru: "Прилёт точек при показе", en: "Points fly in", zh: "光点飞入" },
      type: "toggle", default: true },
    { key: "atmosphere", label: { ru: "Атмосфера", en: "Atmosphere", zh: "大气层" },
      type: "toggle", default: true },
    { key: "lighting", label: { ru: "Псевдо-3D освещение", en: "Pseudo-3D lighting", zh: "伪三维光照" },
      type: "toggle", default: true },
    { key: "stars", label: { ru: "Звёздный фон", en: "Starfield", zh: "星空背景" },
      type: "toggle", default: true },
    { key: "labels", label: { ru: "Подписи ключевых точек", en: "Key labels", zh: "关键标注" },
      type: "toggle", default: true },
    { key: "arcs", label: { ru: "Дуги от Ульяновска", en: "Arcs from Ulyanovsk", zh: "自乌里扬诺夫斯克的弧线" },
      type: "toggle", default: true },
  ],

  /* Категории отдаём ВСЕ двадцать, а не восемь крупнейших, как было чипами:
     панель вертикальная и прокручивается, ограничения «четверть экрана»
     здесь нет — ровно тот случай, ради которого options разрешено задавать
     функцией. Порядок — по числу объектов: он же был у чипов. */
  finder: {
    search: FINDER_SEARCH,
    filters: [
      { key: "category", label: { ru: "Категория", en: "Category", zh: "类别" },
        options: (c) => {
          const counts = new Map();
          for (const it of c.data.picked.items) {
            counts.set(it.category, (counts.get(it.category) || 0) + 1);
          }
          return [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "ru"))
            .map(([cat, n]) => [cat, (CATEGORY_LABELS[cat] || cat) + " · " + n]);
        } },
    ],
  },

  opt: Object.assign({}, DEFAULTS),

  applySettings(values) {
    this.opt = Object.assign({}, DEFAULTS, values || {});
    if (this.api) this.api.invalidate();
  },

  applyFinder(state) {
    return this.api ? this.api.applyFind(state) : undefined;
  },

  mount(el, ctx) {
    const scene = this;
    const app = ctx.app;
    const d3 = window.d3;
    this.appRef = app;

    const countries = ctx.data.countries;
    const items = ctx.data.picked.items;

    el.classList.add("m39-scene", "m39-globe");
    el.innerHTML =
      '<canvas class="m39-canvas"></canvas>' +
      /* Список «не на карте» живёт В ТОЙ ЖЕ колонке, что заголовок, а не
         отдельным слоем от нижней кромки: он растёт снизу вверх, и на семи
         объектах наезжал на подзаголовок. Коэффициентом это не лечится —
         высота списка зависит от числа записей, языка и режима слабовидящих,
         поэтому порядок задаёт поток, а не отступ. */
      '<header class="m39-head m39-head--over m39-head--col">' +
        '<h1 class="m39-title"></h1><p class="m39-sub"></p>' +
        '<aside class="m39-offlist kiosk-scroll" hidden>' +
          '<h2 class="m39-offlist__h"></h2><ul></ul></aside>' +
      "</header>" +
      '<nav class="m39-zoom">' +
        '<button class="m39-zoom__b kiosk-target" type="button" data-z="in">+</button>' +
        '<button class="m39-zoom__b kiosk-target" type="button" data-z="out">−</button>' +
      "</nav>";

    const canvas = el.querySelector(".m39-canvas");
    const g = canvas.getContext("2d");
    const title = el.querySelector(".m39-title");
    const sub = el.querySelector(".m39-sub");
    const zoomNav = el.querySelector(".m39-zoom");
    const offlist = el.querySelector(".m39-offlist");
    const offlistH = el.querySelector(".m39-offlist__h");
    const offlistUl = offlist.querySelector("ul");

    let width = 0;
    let height = 0;
    let rotation = DEFAULT_ROTATE.slice();
    let scaleFactor = DEFAULT_SCALE;
    let selected = null;
    let filter = null;          // зеркало последнего applyFinder
    let query = "";
    let stars = [];
    let lastFrame = 0;
    let lastInteraction = performance.now();
    let modeTween = null;
    let introT0 = 0;
    let labelHits = [];
    let lastDrawn = 0;          // точек в последнем кадре (healthcheck)
    let dragStart = null;
    let dragMoved = false;
    let pinch = null;

    const projection = d3.geoOrthographic().precision(0.3);
    const path = d3.geoPath(projection, g);
    const opt = () => scene.opt;

    // задержки прилёта — по расстоянию от Ульяновска
    const pointDelays = new Map();
    const distances = items.map((it) => ({
      id: it.id,
      d: isOffMap(it) ? Infinity : d3.geoDistance(ORIGIN, [it.lng, it.lat]),
    }));
    distances.sort((a, b) => a.d - b.d);
    distances.forEach((di, i) => pointDelays.set(di.id, i * 35));

    function generateStars() {
      const count = Math.round(Math.sqrt(width * height) / 6);
      stars = new Array(count).fill(0).map((_, i) => {
        // без Math.random: рисунок звёзд должен быть одним и тем же между
        // перезапусками киоска, иначе «мигает» при каждой сборке кадра
        const a = Math.sin(i * 12.9898) * 43758.5453;
        const b = Math.sin(i * 78.233) * 12345.6789;
        const c = Math.sin(i * 4.1414) * 9876.5432;
        const fr = (v) => v - Math.floor(v);
        return {
          x: fr(a) * width, y: fr(b) * height,
          r: fr(c) * 1.2 + 0.2, a: fr(a * 2) * 0.55 + 0.15,
          phase: fr(b * 3) * Math.PI * 2, twinkle: fr(c * 5) * 0.5 + 0.2,
        };
      });
    }

    const applyProjection = () => {
      const r = (Math.min(width, height) * scaleFactor) / 2;
      projection.scale(r).translate([width / 2, height / 2]).rotate(rotation);
    };

    const isVisible = (lon, lat) => {
      const [rl, rp] = projection.rotate();
      return d3.geoDistance([lon, lat], [-rl, -rp]) < Math.PI / 2;
    };

    /* Канон порядка: отбор → поиск. Отбор держит финдер ядра. */
    const filterPasses = (item) => (!filter || item.category === filter)
      && matchesQuery(item, query);

    /* ---- слои картинки ---- */
    function renderStars(now) {
      if (!opt().stars) return;
      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(now / 800 + s.phase) * s.twinkle;
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        g.fillStyle = `rgba(247, 249, 239, ${s.a * tw})`;
        g.fill();
      }
    }

    function renderAtmosphere() {
      if (!opt().atmosphere) return;
      const r = projection.scale();
      const [cx, cy] = projection.translate();
      const grad = g.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.22);
      grad.addColorStop(0, "rgba(146, 174, 196, 0.0)");
      grad.addColorStop(0.35, "rgba(146, 174, 196, 0.22)");
      grad.addColorStop(0.7, "rgba(210, 183, 115, 0.08)");
      grad.addColorStop(1, "rgba(146, 174, 196, 0.0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, r * 1.22, 0, Math.PI * 2);
      g.fill();
    }

    function renderLighting() {
      if (!opt().lighting) return;
      const r = projection.scale();
      const [cx, cy] = projection.translate();
      const sx = cx - r * 0.55;
      const sy = cy - r * 0.45;
      const grad = g.createRadialGradient(sx, sy, r * 0.05, sx, sy, r * 2.0);
      grad.addColorStop(0, "rgba(255, 244, 220, 0.10)");
      grad.addColorStop(0.35, "rgba(0, 0, 0, 0.0)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0.62)");
      g.save();
      g.beginPath();
      path({ type: "Sphere" });
      g.clip();
      g.fillStyle = grad;
      g.fillRect(0, 0, width, height);
      g.restore();
    }

    function renderArc() {
      if (!opt().arcs || !selected) return;
      if (isOffMap(selected)) return;
      if (selected.id === "ulyanovsk-tank") return;      // начало совпадает с целью

      const interp = d3.geoInterpolate(ORIGIN, [selected.lng, selected.lat]);
      const coords = [];
      for (let i = 0; i <= 64; i++) coords.push(interp(i / 64));

      g.save();
      g.beginPath();
      path({ type: "Sphere" });
      g.clip();
      g.beginPath();
      path({ type: "LineString", coordinates: coords });
      g.strokeStyle = "rgba(160, 33, 40, 0.78)";
      g.lineWidth = 1.8;
      g.setLineDash([6, 4]);
      g.stroke();
      g.setLineDash([]);
      g.restore();

      if (isVisible(ORIGIN[0], ORIGIN[1])) {
        const op = projection(ORIGIN);
        if (op) {
          const u = drawScale(app, width);
          g.beginPath();
          g.arc(op[0], op[1], 6 * u, 0, Math.PI * 2);
          g.fillStyle = "#a02128";
          g.fill();
          g.strokeStyle = "rgba(0, 0, 0, 0.6)";
          g.lineWidth = 1;
          g.stroke();
          g.fillStyle = "rgba(247, 249, 239, 0.85)";
          g.font = `600 ${Math.round(11 * u)}px "20 Kopeek", monospace`;
          g.fillText("УЛЬЯНОВСК · 1870", op[0] + 10 * u, op[1] - 8 * u);
        }
      }
    }

    const pointFlyInScale = (id, now) => {
      if (!opt().flyIn) return 1;
      const t0 = introT0 + (pointDelays.get(id) ?? 0);
      if (now < t0) return 0;
      const t = Math.min(1, (now - t0) / 700);
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
    };

    const pulsate = (now) => (opt().pulsation ? 1 + Math.sin((now / 1300) * Math.PI * 2) * 0.14 : 1);

    const rectsOverlap = (a, b) =>
      !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);

    function drawLabels(candidates) {
      if (!candidates.length) return;
      const u = drawScale(app, width);
      candidates.sort((a, b) => (a.tier - b.tier) || (a.sub - b.sub));
      const drawn = [];
      const fs = Math.round(11 * u);
      g.font = `600 ${fs}px "20 Kopeek", "Courier New", monospace`;
      const boxH = fs + 3;

      for (const c of candidates) {
        if (!opt().labels && c.tier !== -1) continue;
        const text = c.item.name_short || c.item.title || "";
        const tw = g.measureText(text).width;
        const px = c.pt[0];
        const py = c.pt[1];
        const r = c.r;

        // четыре якоря: справа → слева → сверху → снизу
        const anchors = [
          { lx: px + r + 8 * u, ly: py + 0.35 * fs },
          { lx: px - r - 8 * u - tw, ly: py + 0.35 * fs },
          { lx: px - tw / 2, ly: py - r - 8 * u },
          { lx: px - tw / 2, ly: py + r + 1.4 * fs },
        ];

        let chosen = null;
        for (const a of anchors) {
          const rect = { x: a.lx - 3, y: a.ly - fs, w: tw + 6, h: boxH };
          if (rect.x < 4 || rect.x + rect.w > width - 4) continue;
          if (rect.y < 4 || rect.y + rect.h > height - 4) continue;
          if (drawn.some((d) => rectsOverlap(rect, d))) continue;
          chosen = { ...a, rect };
          break;
        }
        // выбранная точка всегда побеждает — правый якорь вне зависимости от тесноты
        if (!chosen && c.tier === -1) {
          const a = anchors[0];
          chosen = { ...a, rect: { x: a.lx - 3, y: a.ly - fs, w: tw + 6, h: boxH } };
        }
        if (!chosen) continue;

        g.fillStyle = c.isSel ? "rgba(160, 33, 40, 0.78)" : "rgba(12, 16, 18, 0.72)";
        g.fillRect(chosen.rect.x, chosen.rect.y, chosen.rect.w, chosen.rect.h);
        g.fillStyle = c.isSel ? "#fff"
          : (c.tier === 0 ? "rgba(247, 249, 239, 0.92)" : "rgba(247, 249, 239, 0.78)");
        g.fillText(text, chosen.lx, chosen.ly);
        drawn.push(chosen.rect);

        labelHits.push({
          item: c.item,
          rect: { x: chosen.rect.x - 6, y: chosen.rect.y - 8,
            w: chosen.rect.w + 12, h: chosen.rect.h + 16 },
        });
      }
    }

    function render(now) {
      const u = drawScale(app, width);
      g.clearRect(0, 0, width, height);
      labelHits = [];

      renderStars(now);
      renderAtmosphere();

      g.beginPath();
      path({ type: "Sphere" });
      const grad = g.createRadialGradient(
        width / 2, height * 0.42, 10,
        width / 2, height * 0.42, Math.min(width, height) * 0.6,
      );
      grad.addColorStop(0, "rgba(58, 70, 78, 0.95)");
      grad.addColorStop(1, "rgba(18, 24, 28, 1)");
      g.fillStyle = grad;
      g.fill();

      g.beginPath();
      path(d3.geoGraticule10());
      g.strokeStyle = "rgba(247, 249, 239, 0.06)";
      g.lineWidth = 1;
      g.stroke();

      for (const f of countries.features) {
        const iso = f.properties.ISO_A3 || f.properties.ADM0_A3;
        g.beginPath();
        path(f);
        g.fillStyle = USSR_ISO.has(iso)
          ? "rgba(210, 183, 115, 0.32)" : "rgba(67, 80, 89, 0.45)";
        g.fill();
        g.strokeStyle = "rgba(247, 249, 239, 0.16)";
        g.lineWidth = 0.6;
        g.stroke();
      }

      renderLighting();

      g.beginPath();
      path({ type: "Sphere" });
      g.strokeStyle = "rgba(210, 183, 115, 0.45)";
      g.lineWidth = 1.2;
      g.stroke();

      renderArc();

      const labelCandidates = [];
      for (const item of items) {
        if (isOffMap(item)) continue;
        if (!isVisible(item.lng, item.lat)) continue;
        const pt = projection([item.lng, item.lat]);
        if (!pt) continue;

        const passes = filterPasses(item);
        const isSel = selected && selected.id === item.id;
        const flyIn = pointFlyInScale(item.id, now);
        const pulse = passes ? pulsate(now) : 1;
        const baseR = 6 * u;
        const r = (isSel ? baseR + 3 : baseR) * flyIn * pulse;
        if (r <= 0.3) continue;

        if (isSel) {
          g.beginPath();
          g.arc(pt[0], pt[1], r + 8, 0, Math.PI * 2);
          const glow = g.createRadialGradient(pt[0], pt[1], r, pt[0], pt[1], r + 12);
          glow.addColorStop(0, "rgba(160, 33, 40, 0.7)");
          glow.addColorStop(1, "rgba(160, 33, 40, 0)");
          g.fillStyle = glow;
          g.fill();
        }

        g.beginPath();
        g.arc(pt[0], pt[1], r, 0, Math.PI * 2);
        g.fillStyle = passes ? (isSel ? "#a02128" : "#d2b773") : "rgba(210, 183, 115, 0.22)";
        g.fill();
        g.strokeStyle = "rgba(0, 0, 0, 0.55)";
        g.lineWidth = 1;
        g.stroke();

        if (passes && flyIn > 0.6) {
          const inKey = KEY_LABEL_RANK.has(item.id);
          labelCandidates.push({
            item, pt, r, isSel,
            tier: isSel ? -1 : (inKey ? 0 : 1),
            sub: isSel ? 0
              : inKey ? KEY_LABEL_RANK.get(item.id) / 100
                : (pointDelays.get(item.id) ?? 0) / 1e6,
          });
        }
      }
      lastDrawn = labelCandidates.length;
      drawLabels(labelCandidates);
    }

    /* ---- цикл ---- */
    const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const shortestLonDelta = (a, b) => ((b - a + 540) % 360) - 180;

    function startTween(targetRotate, targetScale, duration = 1100) {
      modeTween = {
        startR: rotation.slice(),
        dLon: shortestLonDelta(rotation[0], targetRotate[0]),
        dLat: targetRotate[1] - rotation[1],
        startS: scaleFactor,
        dS: targetScale - scaleFactor,
        t0: performance.now(),
        dur: duration,
      };
    }

    const anim = loop((now) => {
      ctx.beat();
      const dt = Math.min(50, now - lastFrame);
      lastFrame = now;

      if (modeTween) {
        const t = Math.min(1, (now - modeTween.t0) / modeTween.dur);
        const k = easeInOutCubic(t);
        rotation = [
          modeTween.startR[0] + modeTween.dLon * k,
          modeTween.startR[1] + modeTween.dLat * k, 0,
        ];
        scaleFactor = modeTween.startS + modeTween.dS * k;
        if (t >= 1) { modeTween = null; lastInteraction = now; }
      } else if (opt().autoRotate && !dragStart && now - lastInteraction > 2500) {
        rotation[0] += ((opt().autoRotateSpeed ?? DEFAULTS.autoRotateSpeed) * dt) / 1000;
      }

      applyProjection();
      render(now);
    });

    const watch = sizeWatch(el, (w, h) => {
      width = w; height = h;
      fitCanvas(canvas, w, h);
      generateStars();
      applyProjection();
      render(performance.now());     // первый кадр сразу (см. world.js)
    });

    /* ---- карточка ---- */
    const card = createCardPanel(el, app, () => { selected = null; syncOfflist(); });

    function cardHtml(item) {
      const pic = item.image && item.image.file ? filePicture(ctx, item.image.file) : null;
      const fig = pic
        ? '<figure class="m39-card__fig"><img src="' + esc(pic) + '" alt="' +
          esc(item.name_short || item.title || "") + '" /><figcaption>' +
          esc(item.image.credit || "") + "</figcaption></figure>"
        : "";
      const where = [item.city, item.country].filter(Boolean).join(" · ")
        || (isOffMap(item) ? app.t("card.noCoords") : "");
      return fig +
        '<div class="m39-card__orig">' +
          esc(CATEGORY_LABELS[item.category] || item.category || "") + "</div>" +
        '<h2 class="m39-card__name">' + esc(item.name || item.title || "") + "</h2>" +
        '<p class="m39-card__where">' + esc(where) + "</p>" +
        (item.short_text ? '<p class="m39-card__text">' + esc(item.short_text) + "</p>" : "");
    }

    function showCard(item) {
      selected = item || null;
      if (!item) { card.close(); syncOfflist(); return; }
      card.open(cardHtml(item));
      syncOfflist();
    }

    function syncOfflist() {
      offlistUl.querySelectorAll("li").forEach((li) => {
        li.classList.toggle("is-active", !!selected && li.dataset.id === selected.id);
      });
    }

    /* Список «не на карте» слушается отбора наравне с шаром: иначе при поиске
       «Астероид» шар пуст, а сбоку висит полный список — и посетителю нечем
       связать одно с другим. */
    function buildOfflist() {
      const off = items.filter((it) => isOffMap(it) && filterPasses(it));
      offlist.hidden = off.length === 0;
      offlistH.textContent = app.t("globe.offmap", { n: off.length });
      offlistUl.replaceChildren();
      for (const item of off) {
        const li = document.createElement("li");
        li.className = "m39-offlist__item kiosk-target";
        li.dataset.id = item.id;
        li.textContent = item.name_short || item.title || item.name;
        li.addEventListener("click", () => showCard(item));
        offlistUl.appendChild(li);
      }
    }

    /* ---- ввод ---- */
    const setScale = (s) => {
      modeTween = null;
      scaleFactor = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
      lastInteraction = performance.now();
    };

    function pickPoint(x, y) {
      // подписи первыми — выбранная сверху стопки, потом ключевые, потом прочие
      for (let i = labelHits.length - 1; i >= 0; i--) {
        const r = labelHits[i].rect;
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return labelHits[i].item;
      }
      let best = null;
      const hit = 28 * drawScale(app, width);
      let bestD = hit * hit;
      for (const item of items) {
        if (isOffMap(item)) continue;
        if (!isVisible(item.lng, item.lat)) continue;
        if (!filterPasses(item)) continue;
        const pt = projection([item.lng, item.lat]);
        if (!pt) continue;
        const d2 = (pt[0] - x) ** 2 + (pt[1] - y) ** 2;
        if (d2 < bestD) { bestD = d2; best = item; }
      }
      return best;
    }

    d3.select(canvas).call(
      d3.drag()
        .on("start", (e) => {
          if (pinch) return;
          modeTween = null;
          dragStart = { x: e.x, y: e.y, r: rotation.slice() };
          dragMoved = false;
          lastInteraction = performance.now();
        })
        .on("drag", (e) => {
          if (pinch || !dragStart) return;
          const dx = e.x - dragStart.x;
          const dy = e.y - dragStart.y;
          if (Math.hypot(dx, dy) > 4) dragMoved = true;
          rotation = [
            dragStart.r[0] + dx * 0.32,
            Math.max(-85, Math.min(85, dragStart.r[1] - dy * 0.32)), 0,
          ];
          lastInteraction = performance.now();
        })
        .on("end", (e) => {
          if (pinch) return;
          if (!dragMoved) showCard(pickPoint(e.x, e.y));
          dragStart = null;
          lastInteraction = performance.now();
        }),
    );

    const onWheel = (e) => {
      e.preventDefault();
      setScale(scaleFactor * Math.exp(-e.deltaY * 0.0018));
    };
    const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinch = { d: touchDist(e.touches), s: scaleFactor };
        dragStart = null;
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinch) {
        e.preventDefault();
        setScale(pinch.s * (touchDist(e.touches) / pinch.d));
      }
    };
    const onTouchEnd = (e) => { if (e.touches.length < 2) pinch = null; };
    const onZoom = (e) => {
      const b = e.target.closest("[data-z]");
      if (!b) return;
      setScale(scaleFactor * (b.dataset.z === "in" ? 1.25 : 1 / 1.25));
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);
    zoomNav.addEventListener("click", onZoom);

    function retext() {
      title.textContent = app.t("globe.title");
      // число — из данных: прописью в словаре оно разошлось с набором
      // (говорило «пятьдесят семь» при 64 записях). {word} — падеж, а не
      // строка перевода: в словарь русские числительные не унести.
      sub.textContent = app.t("globe.sub", {
        n: items.length,
        word: plural(items.length, "объект", "объекта", "объектов"),
      });
      if (hint) hint.setLabel(app.t("globe.hint"));
      buildOfflist();
      syncOfflist();
      if (selected) card.open(cardHtml(selected));
    }

    function startIntro() {
      // открываемся не в лоб: шар прилетает из другого ракурса
      if (opt().flyIn) {
        rotation = [120, -10, 0];
        scaleFactor = 0.34;
        applyProjection();
        startTween(DEFAULT_ROTATE.slice(), DEFAULT_SCALE, 1700);
      } else {
        rotation = DEFAULT_ROTATE.slice();
        scaleFactor = DEFAULT_SCALE;
        applyProjection();
      }
      introT0 = performance.now() + 600;
      lastFrame = performance.now();
      lastInteraction = performance.now() + 2200;
    }

    this.api = {
      anim,
      retext,
      invalidate() { /* картинка перерисовывается каждый кадр */ },
      remeasure: () => watch.measure(true),
      applyFind({ query: q, filters }) {
        query = normQuery(q);
        filter = (filters && filters.category) || null;
        showCard(null);
        buildOfflist();
        lastInteraction = performance.now();
        /* Шар перерисовывается каждый кадр — звать нечего; счёт отдаём сразу,
           иначе строка «N из 64» отстала бы от картинки на кадр. */
        return { shown: items.filter(filterPasses).length, total: items.length };
      },
      /* Ядро гасит финдер ДО reset() и зовёт applyFinder заново — в штатном
         пути обнуление здесь дубль. Но reset() дёргают и в обход финдера
         (оператор, стенд), и сцена с чужим отбором при пустой панели — та
         самая загадка без объяснения из возврата 1.17.4. */
      reset() {
        filter = null;
        query = "";
        showCard(null);
        buildOfflist();
        if (hint) hint.show();   // экран вернулся в исходный вид — зовём жест сразу
        startIntro();
      },
      /* Аттрактор: тот же шар, без интерфейса. Петлю даёт ядро, угол считаем
         от секунд простоя — но рисуем по аптайму страницы.

         Две ловушки, обе стоили пустого шара в заставке:
          · интро прогонять нельзя. Твин «прилёта» (0.34 → полный размер)
            двигается только rAF-циклом, а он в заставке остановлен, — шар
            так и застыл бы уменьшенным. Ставим конечную позу сразу;
          · render() принимает аптайм, а не секунды простоя. Прилёт точек и
            мерцание звёзд сверяются с introT0 = performance.now() + 600:
            на киоске, отработавшем день, «секунды простоя» этот порог не
            догонят никогда, и ни одна точка не нарисуется. */
      standby(app_) {
        anim.stop();
        filter = null;
        query = "";
        showCard(null);
        buildOfflist();
        modeTween = null;
        introT0 = 0;                       // точки уже «прилетели»
        rotation = DEFAULT_ROTATE.slice();
        scaleFactor = DEFAULT_SCALE;
        applyProjection();

        const from = rotation[0];
        const stop = app_.standbyTicker((t) => {
          rotation[0] = (from + t * 4) % 360;
          applyProjection();
          render(performance.now());
        });
        return () => {
          stop();
          lastFrame = performance.now();
          this.reset();                    // вернуть открывающий вид с прилётом
          anim.start();
        };
      },
      /* Ловим «загружено, но пусто», а не законные состояния экрана.
         Не последний кадр: точки прилетают анимацией, и первые 600 мс кадр
         честно пуст. Не «сколько точек на шаре»: повёрнутый к Тихому океану
         шар — это норма, а у категории «Астероиды» обе записи вообще без
         координат и живут в списке «не на карте» — это показанный контент,
         а не пустота.

         Ноль по отбору тоже не авария: с приходом финдера у посетителя есть
         поиск, и «ничего не нашлось» — законный ответ экрана, а не поломка
         сцены (канон кита: легально пустые состояния зелёные). */
      health() {
        const total = items.length;
        if (!total) return { ok: false, detail: "список избранного пуст" };
        if (!width || !height) return { ok: false, detail: "холст без размера" };
        const passing = items.filter(filterPasses);
        const onGlobe = passing.filter((it) => !isOffMap(it)).length;
        return { ok: true, detail: "к показу " + passing.length + " из " + total +
          " (на шаре " + onGlobe + ", списком «не на карте» " + (passing.length - onGlobe) +
          "), в последнем кадре " + lastDrawn };
      },
      destroy() {
        anim.stop();
        d3.select(canvas).on(".drag", null);
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("touchstart", onTouchStart);
        canvas.removeEventListener("touchmove", onTouchMove);
        canvas.removeEventListener("touchend", onTouchEnd);
        canvas.removeEventListener("touchcancel", onTouchEnd);
        zoomNav.removeEventListener("click", onZoom);
        watch.destroy();
        card.destroy();
        if (hint) hint.destroy();
      },
    };

    /* На контейнер сцены, а не на канву (грабли кита). */
    const hint = window.KioskHint
      ? window.KioskHint.attach(el, { gesture: "drag", label: app.t("globe.hint") })
      : null;

    retext();
    watch.measure(true);
    startIntro();
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
  setA11y() { if (this.api) this.api.remeasure(); },

  standby() {
    return this.api ? this.api.standby(this.appRef) : null;
  },

  healthcheck() {
    return this.api ? this.api.health() : { ok: false, detail: "сцена не смонтирована" };
  },

  unmount() {
    if (this.api) this.api.destroy();
    this.api = null;
  },
};
