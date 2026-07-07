/**
 * МТК 41 · Иерархическая карта.
 *
 * Отличается от mtk41-map:
 *  1) Три уровня кластеров + макро-регионы (Балтика/Кавказ/…), а не один слой.
 *  2) Кружки не пересекаются — force-based релаксация каждый кадр.
 *  3) Размер кружка ∝ количество памятников (не год), формула переключается
 *     в панели настроек (√N / N / log N).
 *  4) Тап на кружок = анимированный drilldown к следующему уровню.
 *
 * Coordinate system:
 *  - Все world-coords идут через project(lat, lng) → { x, y } в world-px.
 *  - Кластеры хранят world-coords; при отрисовке считаем screen-coords
 *    и делим радиус/линии/шрифт на map.zoom так, чтоб on-screen размер
 *    оставался постоянным (кружок не «растёт» с зумом).
 */
(function () {
  const canvas = document.getElementById("map");
  const ctx = canvas.getContext("2d", { alpha: true });

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    graphite: "#435059",
    window: "#9DA3A6",
    black: "#000000",
  };

  const map = {
    worldW: 0, worldH: 0,
    camX: 0, camY: 0,
    camVX: 0, camVY: 0,
    dragging: false,
    geojson: null,
    cached: null,
    zoom: 0.8,
  };
  const MIN_ZOOM_FLOOR = 0.4;         // hard-floor for safety
  const MAX_ZOOM = 8;
  // Dynamic min-zoom computed in resize(): zoom at which the world exactly
  // fills the viewport, so the user can't zoom out further and see empty
  // canvas beyond the map's top/bottom or left/right edges.
  function currentMinZoom() {
    if (!map.worldW || !map.worldH) return MIN_ZOOM_FLOOR;
    return Math.max(
      MIN_ZOOM_FLOOR,
      width / map.worldW,
      height / map.worldH,
    );
  }
  function clampZoom(z) {
    return Math.max(currentMinZoom(), Math.min(MAX_ZOOM, z));
  }
  const ACTIVE_POINTERS = new Map();
  let pinchInitialDist = 0;
  let pinchInitialZoom = 1;

  let width = 0, height = 0, dpr = 1;
  let geoLoaded = false;
  let monuments = [];

  let selectedIndex = -1;
  let didDrag = false;
  let lastPointerX = 0, lastPointerY = 0, lastPointerTime = 0;
  let pressStartX = 0, pressStartY = 0;
  const TAP_THRESHOLD = 8;

  let start = performance.now();
  let previousTime = 0;

  // ---------- Settings ---------------------------------------------------

  const SETTINGS_KEY = "mtk41-map-hier-settings";
  const DEFAULT_SETTINGS = {
    viewPreset: "eurasia",    // world | eurasia | ex-ussr
    sizeMode: "sqrt",         // sqrt | linear | log
    thrMacro: 1.0,            // z < thrMacro → LEVEL_MACRO
    thrCountry: 1.7,          // thrMacro..thrCountry → LEVEL_COUNTRY
    thrRegion: 2.3,           // thrCountry..thrRegion → LEVEL_REGION (sub-country)
    thrCity: 3.2,             // thrRegion..thrCity → LEVEL_CITY; ≥thrCity → LEVEL_LEAF
    gap: 6,                   // vpx между кружками при relaxation
    labelScale: 1.4,          // multiplier для размера всех подписей
    showConnectors: true,
    showOutliers: true,
    crossfade: true,
    showMacroLabels: true,    // labels на LEVEL_MACRO кружках
    show3D: true,             // 3D-модель в карточке
  };

  // Preset view configurations (lat, lng of camera target, zoom level).
  // Applied via applyViewPreset() at boot and when user picks in panel.
  const VIEW_PRESETS = {
    "world":   { lat: 15,  lng: 20,  zoom: 0.50 },  // World fit — clamped to viewport-fill
    "eurasia": { lat: 42,  lng: 30,  zoom: 0.75 },  // Europe + ex-USSR in main view
    "ex-ussr": { lat: 55,  lng: 55,  zoom: 1.20 },  // Original ex-USSR closeup
  };
  function loadSettings() {
    try {
      const raw = sessionStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) { return { ...DEFAULT_SETTINGS }; }
  }
  function saveSettings() {
    try { sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }
  const settings = loadSettings();

  // ---------- Utilities --------------------------------------------------

  function cssColor(hex, alpha) {
    const v = hex.replace("#", "");
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Winkel Tripel projection — full-world aspect ratio (2+π)/π ≈ 1.637.
  // Better for continents at high latitude than equirectangular.
  const WT_COS_PHI1 = 2 / Math.PI;
  const WT_X_HALF = (2 + Math.PI) / 2;
  const WT_Y_HALF = Math.PI / 2;

  function project(lat, lng) {
    const phi = lat * Math.PI / 180;
    const lambda = lng * Math.PI / 180;
    const cosphi = Math.cos(phi);
    const cosLambdaHalf = Math.cos(lambda / 2);
    const alpha = Math.acos(cosphi * cosLambdaHalf);
    const sinc = alpha < 1e-9 ? 1 : Math.sin(alpha) / alpha;
    const wx = 0.5 * (lambda * WT_COS_PHI1 + 2 * cosphi * Math.sin(lambda / 2) / sinc);
    const wy = 0.5 * (phi + Math.sin(phi) / sinc);
    const x = (wx + WT_X_HALF) / (2 * WT_X_HALF) * map.worldW;
    const y = (WT_Y_HALF - wy) / (2 * WT_Y_HALF) * map.worldH;
    return { x, y };
  }

  function statusColor(status) {
    switch (status) {
      case "extant":     return palette.red;
      case "demolished": return palette.graphite;
      case "relocated":  return palette.brass;
      default:           return palette.window;
    }
  }

  // ---------- Macro regions + ISO → macro mapping ------------------------

  // MACRO_REGIONS declares the FULL ordered list of macros (used for tree
  // iteration + naming). Bbox fields are used only for RU items lacking
  // country_iso (via RU_MACRO_BBOX_ORDER below); non-RU items are dispatched
  // by ISO_TO_MACRO. World macros carry a "world" flag so RU never matches.
  const MACRO_REGIONS = [
    // Outliers first (small bboxes)
    { key: "antarctica",       name: "Антарктида",         minLat: -90, maxLat: -60, minLng: -180, maxLng: 180, isOutlier: true },
    { key: "spitzbergen",      name: "Шпицберген",         minLat: 75,  maxLat: 82,  minLng: 5,    maxLng: 35,  isOutlier: true },
    // ex-USSR bbox-driven macros
    { key: "baltic",           name: "Балтика",            minLat: 54,  maxLat: 60,  minLng: 20,   maxLng: 29 },
    { key: "caucasus",         name: "Кавказ",             minLat: 38,  maxLat: 45,  minLng: 36,   maxLng: 52 },
    { key: "central_asia",     name: "Средняя Азия",       minLat: 35,  maxLat: 50,  minLng: 50,   maxLng: 80 },
    { key: "east_europe",      name: "Восточная Европа",   minLat: 44,  maxLat: 53,  minLng: 21,   maxLng: 40 },
    { key: "urals",            name: "Урал",               minLat: 50,  maxLat: 66,  minLng: 60,   maxLng: 70 },
    { key: "far_east",         name: "Дальний Восток",     minLat: 42,  maxLat: 75,  minLng: 130,  maxLng: 180 },
    { key: "siberia",          name: "Сибирь",             minLat: 45,  maxLat: 73,  minLng: 70,   maxLng: 130 },
    { key: "eur_russia",       name: "Европейская Россия", minLat: 44,  maxLat: 72,  minLng: 27,   maxLng: 60 },
    // World macros — ISO-only, never fire bbox test for RU
    { key: "western_europe",   name: "Западная Европа",    minLat: 43,  maxLat: 60,  minLng: -10,  maxLng: 15,  isWorld: true },
    { key: "central_europe",   name: "Центральная Европа", minLat: 45,  maxLat: 55,  minLng: 14,   maxLng: 27,  isWorld: true },
    { key: "northern_europe",  name: "Северная Европа",    minLat: 55,  maxLat: 72,  minLng: 4,    maxLng: 32,  isWorld: true },
    { key: "southern_europe",  name: "Южная Европа",       minLat: 34,  maxLat: 46,  minLng: -10,  maxLng: 20,  isWorld: true },
    { key: "balkans",          name: "Балканы",            minLat: 39,  maxLat: 48,  minLng: 18,   maxLng: 30,  isWorld: true },
    { key: "north_america",    name: "Северная Америка",   minLat: 25,  maxLat: 70,  minLng: -170, maxLng: -50, isWorld: true },
    { key: "latin_america",    name: "Латинская Америка",  minLat: -60, maxLat: 30,  minLng: -120, maxLng: -30, isWorld: true },
    { key: "east_asia",        name: "Восточная Азия",     minLat: 10,  maxLat: 45,  minLng: 90,   maxLng: 145, isWorld: true },
    { key: "south_asia",       name: "Южная Азия",         minLat: -25, maxLat: 40,  minLng: 55,   maxLng: 95,  isWorld: true },
    { key: "africa",           name: "Африка",             minLat: -35, maxLat: 37,  minLng: -20,  maxLng: 55,  isWorld: true },
    { key: "oceania",          name: "Океания",            minLat: -50, maxLat: -5,  minLng: 110,  maxLng: 180, isWorld: true },
    { key: "other",            name: "Прочие",             minLat: -90, maxLat: 90,  minLng: -180, maxLng: 180 },
  ];

  const ISO_TO_MACRO = {
    // ex-USSR
    UA: "east_europe", BY: "east_europe", MD: "east_europe",
    EE: "baltic", LV: "baltic", LT: "baltic",
    AM: "caucasus", AZ: "caucasus", GE: "caucasus",
    KZ: "central_asia", UZ: "central_asia", KG: "central_asia", TJ: "central_asia", TM: "central_asia",
    // Western Europe
    DE: "western_europe", FR: "western_europe", GB: "western_europe",
    NL: "western_europe", CH: "western_europe", DK: "western_europe",
    BE: "western_europe", IE: "western_europe", LU: "western_europe",
    // Central Europe
    PL: "central_europe", CZ: "central_europe", SK: "central_europe",
    HU: "central_europe", RO: "central_europe", AT: "central_europe",
    // Northern Europe (Scandinavia + Iceland, кроме прибалтики)
    SE: "northern_europe", FI: "northern_europe",
    NO: "northern_europe", IS: "northern_europe",
    // Southern Europe
    IT: "southern_europe", GR: "southern_europe",
    ES: "southern_europe", PT: "southern_europe",
    // Balkans
    BG: "balkans", AL: "balkans",
    RS: "balkans", HR: "balkans", SI: "balkans",
    MK: "balkans", ME: "balkans", BA: "balkans",
    // North America
    US: "north_america", CA: "north_america",
    // Latin America
    CU: "latin_america",
    // East Asia
    CN: "east_asia", KP: "east_asia", KR: "east_asia", VN: "east_asia", JP: "east_asia",
    // Siberia (per user's decision — Mongolia + RU Siberia together)
    MN: "siberia",
    // South Asia
    IN: "south_asia", MU: "south_asia", PK: "south_asia", BD: "south_asia", LK: "south_asia",
    // Africa
    ET: "africa",
    // Oceania
    AU: "oceania", NZ: "oceania",
  };

  const COUNTRY_NAME_RU = {
    RU: "Россия", UA: "Украина", KZ: "Казахстан", BY: "Беларусь", MD: "Молдова",
    EE: "Эстония", LV: "Латвия", LT: "Литва", GE: "Грузия", AM: "Армения",
    AZ: "Азербайджан", KG: "Кыргызстан", TJ: "Таджикистан", UZ: "Узбекистан",
    TM: "Туркменистан",
    // World (new)
    DE: "Германия", FR: "Франция", GB: "Великобритания", NL: "Нидерланды",
    CH: "Швейцария", DK: "Дания", BE: "Бельгия", IE: "Ирландия",
    PL: "Польша", CZ: "Чехия", SK: "Словакия", HU: "Венгрия", RO: "Румыния",
    AT: "Австрия", SE: "Швеция", FI: "Финляндия", NO: "Норвегия", IS: "Исландия",
    IT: "Италия", GR: "Греция", ES: "Испания", PT: "Португалия",
    BG: "Болгария", AL: "Албания", RS: "Сербия", HR: "Хорватия",
    SI: "Словения", MK: "Северная Македония", ME: "Черногория", BA: "Босния",
    US: "США", CA: "Канада", CU: "Куба",
    CN: "Китай", KP: "КНДР", KR: "Южная Корея", VN: "Вьетнам", JP: "Япония",
    MN: "Монголия",
    IN: "Индия", MU: "Маврикий", PK: "Пакистан", BD: "Бангладеш", LK: "Шри-Ланка",
    ET: "Эфиопия",
    AU: "Австралия", NZ: "Новая Зеландия",
  };

  // RU-specific bbox order: skip macros that belong to other ex-USSR states
  // (east_europe, central_asia — those come only from ISO_TO_MACRO).
  const RU_MACRO_BBOX_ORDER = ["antarctica", "spitzbergen", "baltic",
                               "caucasus", "far_east", "urals", "siberia", "eur_russia"];

  function assignMacro(item) {
    // Non-RU ex-USSR states → ISO map wins (UA→east_europe, KZ→central_asia, …)
    if (item.country_iso && ISO_TO_MACRO[item.country_iso]) {
      return ISO_TO_MACRO[item.country_iso];
    }
    // Non-USSR outliers by name
    if (item.country) {
      if (item.country.includes("Шпицберген")) return "spitzbergen";
      if (item.country.includes("Антарктида")) return "antarctica";
    }
    // Assume Russian item — bbox test only against RU macros (не Украина/Казахстан).
    for (const key of RU_MACRO_BBOX_ORDER) {
      const macro = MACRO_REGIONS.find(m => m.key === key);
      if (!macro) continue;
      if (item.lat >= macro.minLat && item.lat <= macro.maxLat &&
          item.lng >= macro.minLng && item.lng <= macro.maxLng) {
        return key;
      }
    }
    // Fallback for out-of-Russia points we couldn't classify
    return "eur_russia";
  }

  // ---------- Agglomerative snapshots -----------------------------------
  //
  // For a set of leaf nodes (each with world x,y and a member index), produce
  // snapshots at each threshold — merging pairs whose distance ≤ T. Each
  // snapshot is computed FRESH from the leaves (not incrementally), so the
  // thresholds don't have to be monotonic.

  function makeLeaf(itemIdx) {
    const m = monuments[itemIdx];
    const p = project(m.lat, m.lng);
    return {
      x: p.x, y: p.y,
      count: 1,
      memberIndices: [itemIdx],
      cityKey: m.city || null,
      country: m.country_iso || (m.country === "СССР" ? "RU" : null),
    };
  }

  function mergeNodes(a, b) {
    const total = a.count + b.count;
    const merged = {
      x: (a.x * a.count + b.x * b.count) / total,
      y: (a.y * a.count + b.y * b.count) / total,
      count: total,
      memberIndices: a.memberIndices.concat(b.memberIndices),
      cityKey: (a.cityKey && a.cityKey === b.cityKey) ? a.cityKey : null,
      country: null,
    };
    // Country by plurality among leaves
    const tally = new Map();
    for (const mi of merged.memberIndices) {
      const iso = monuments[mi].country_iso ||
                  (monuments[mi].country === "СССР" ? "RU" : null);
      if (iso) tally.set(iso, (tally.get(iso) || 0) + 1);
    }
    let bestC = null, bestN = 0;
    for (const [c, n] of tally) {
      if (n > bestN) { bestN = n; bestC = c; }
    }
    if (bestC && bestN / merged.count >= 0.6) merged.country = bestC;
    return merged;
  }

  function agglomerativeSnapshot(leafItems, T) {
    let nodes = leafItems.map(makeLeaf);
    while (nodes.length > 1) {
      let bi = -1, bj = -1, bd = Infinity;
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (d < bd) { bd = d; bi = i; bj = j; }
        }
      }
      if (bd > T) break;
      const merged = mergeNodes(nodes[bi], nodes[bj]);
      nodes = nodes.filter((_, k) => k !== bi && k !== bj);
      nodes.push(merged);
    }
    return nodes;
  }

  // ---------- Tree assembly (one-shot at init) --------------------------

  const tree = { children: [] };   // filled by buildTree()

  // Agglomerative thresholds — fractions of worldW so they scale with the
  // projection. country ≈ 12% of world width (rough country-level grouping),
  // region ≈ 3% (splits Россия into ~5 sub-clusters), city ≈ 1% (individual
  // cities merged only when practically overlapping).
  function computeThresholds() {
    return {
      country: map.worldW * 0.125,
      region:  map.worldW * 0.030,
      city:    map.worldW * 0.010,
    };
  }

  function buildTree() {
    // Bucket items by macro
    const buckets = new Map();
    for (let i = 0; i < monuments.length; i += 1) {
      const key = assignMacro(monuments[i]);
      let arr = buckets.get(key);
      if (!arr) { arr = []; buckets.set(key, arr); }
      arr.push(i);
    }
    tree.children.length = 0;
    for (const macro of MACRO_REGIONS) {
      const memberIndices = buckets.get(macro.key) || [];
      if (memberIndices.length === 0) continue;
      // Weighted centroid for MACRO-level position
      let sx = 0, sy = 0;
      for (const mi of memberIndices) {
        const p = project(monuments[mi].lat, monuments[mi].lng);
        sx += p.x; sy += p.y;
      }
      const cx = sx / memberIndices.length;
      const cy = sy / memberIndices.length;
      // Three agglomerative snapshots — country / sub-country region / city
      const leafItems = memberIndices;
      const T = computeThresholds();
      const countrySnap = agglomerativeSnapshot(leafItems, T.country);
      const regionSnap  = agglomerativeSnapshot(leafItems, T.region);
      const citySnap    = agglomerativeSnapshot(leafItems, T.city);
      tree.children.push({
        key: macro.key,
        name: macro.name,
        isOutlier: !!macro.isOutlier,
        macroX: cx,
        macroY: cy,
        memberIndices,
        countrySnap,
        regionSnap,
        citySnap,
      });
    }
  }

  // ---------- World cache (country outlines) ----------------------------

  function buildWorldCache() {
    if (!map.geojson) return;
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.floor(map.worldW));
    off.height = Math.max(1, Math.floor(map.worldH));
    const g = off.getContext("2d");

    g.fillStyle = "rgba(247, 249, 239, 0.02)";
    g.fillRect(0, 0, off.width, off.height);

    const features = map.geojson.features || [];
    for (let i = 0; i < features.length; i += 1) {
      const f = features[i];
      const geom = f.geometry;
      if (!geom) continue;
      const polys =
        geom.type === "Polygon" ? [geom.coordinates] :
        geom.type === "MultiPolygon" ? geom.coordinates :
        null;
      if (!polys) continue;
      const props = f.properties || {};
      const isRussia = (props.ADMIN === "Russia") || (props.NAME === "Russia") || (props.ISO_A2 === "RU");
      // Аннексионный overlay — сильнее заливка + ярче обводка, чтобы
      // визуально забить оставшийся под ним контур Украины (границы РФ
      // на 2026: Крым + Херсонская + Запорожская + Донецкая + Луганская).
      const isAnnex = !!props._ru_annex_2026;
      const fillColor = isAnnex ? "rgba(210, 183, 115, 0.22)"
                       : isRussia ? "rgba(210, 183, 115, 0.10)"
                                  : "rgba(157, 163, 166, 0.05)";
      const strokeColor = isAnnex ? cssColor(palette.brass, 0.85)
                        : isRussia ? cssColor(palette.brass, 0.55)
                                   : cssColor(palette.window, 0.40);
      for (const poly of polys) {
        const ring = poly[0];
        if (!ring || ring.length < 2) continue;
        g.beginPath();
        for (let k = 0; k < ring.length; k += 1) {
          const [lng, lat] = ring[k];
          const x = ((lng + 180) / 360) * map.worldW;
          const y = ((90 - lat) / 180) * map.worldH;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.fillStyle = fillColor;
        g.strokeStyle = strokeColor;
        g.lineWidth = isAnnex ? 1.4 : (isRussia ? 1.1 : 0.7);
        g.fill();
        g.stroke();
      }
    }
    // Parallels
    g.strokeStyle = cssColor(palette.brass, 0.08);
    g.lineWidth = 0.5;
    g.setLineDash([2, 12]);
    for (let lat = -80; lat <= 80; lat += 10) {
      const y = ((90 - lat) / 180) * map.worldH;
      g.beginPath(); g.moveTo(0, y); g.lineTo(map.worldW, y); g.stroke();
    }
    g.setLineDash([]);
    map.cached = off;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Worldwide default. Winkel Tripel aspect (2+π)/π ≈ 1.637.
    // targetLngSpan = width of viewport in degrees of longitude at zoom=1.
    // Default zoom 0.7 shows most of the world; user can zoom out further
    // via panel preset or wheel to see antarctica/oceania.
    const isPortrait = height > width;
    const targetLngSpan = isPortrait ? 130 : 180;
    map.worldW = (width / targetLngSpan) * 360;
    map.worldH = map.worldW / 1.637;

    // Стартовый центр — задаётся через applyViewPreset(). Пока прописываем
    // умолчание (Европа+ex-USSR) — reset после загрузки данных подстроит.
    const center = project(40, 30);
    map.camX = center.x - width * 0.5;
    map.camY = center.y - height * 0.5;

    if (map.geojson) buildWorldCache();
    if (monuments.length) buildTree();
  }

  // ---------- Screen-space transforms -----------------------------------

  function pointToScreen(worldX, worldY) {
    // Same convention as mtk41-map: draw coords are pre-zoom, but the ctx
    // transform (below) applies scale around viewport centre.
    return { x: worldX - map.camX, y: worldY - map.camY };
  }

  function clientToWorld(cx, cy) {
    // Invert: unzoom around viewport centre → pre-zoom → un-camera.
    return {
      x: (cx - width * 0.5) / map.zoom + width * 0.5 + map.camX,
      y: (cy - height * 0.5) / map.zoom + height * 0.5 + map.camY,
    };
  }

  // ---------- Sizing formulas -------------------------------------------

  function shortSide() { return Math.min(width, height); }

  function sizeFor(count, mode) {
    const s = shortSide();
    const base = s * 0.010;
    const cap = s * 0.055;
    let r;
    if (mode === "linear") r = base + s * 0.0018 * count;
    else if (mode === "log") r = base + s * 0.012 * Math.log2(count + 1);
    else r = base + s * 0.006 * Math.sqrt(count);
    return Math.min(cap, r);
  }

  // Individual monument (leaf) radius — constant, no year scaling
  const LEAF_R_MULT = 0.006;   // fraction of short side

  // ---------- Level selection -------------------------------------------

  function levelFor(z) {
    if (z < settings.thrMacro) return "MACRO";
    if (z < settings.thrCountry) return "COUNTRY";
    if (z < settings.thrRegion) return "REGION";
    if (z < settings.thrCity) return "CITY";
    return "LEAF";
  }

  function nextLevelThreshold(level) {
    if (level === "MACRO") return settings.thrMacro;
    if (level === "COUNTRY") return settings.thrCountry;
    if (level === "REGION") return settings.thrRegion;
    if (level === "CITY") return settings.thrCity;
    return null;
  }

  // Build the array of world-space cluster records for a given level.
  // Records: { worldX, worldY, count, memberIndices, name, macroKey }.
  function buildLevelClusters(level) {
    const out = [];
    for (const macroNode of tree.children) {
      if (macroNode.isOutlier && !settings.showOutliers) continue;
      if (level === "MACRO") {
        out.push({
          worldX: macroNode.macroX,
          worldY: macroNode.macroY,
          count: macroNode.memberIndices.length,
          memberIndices: macroNode.memberIndices,
          name: macroNode.name,
          macroKey: macroNode.key,
        });
      } else if (level === "COUNTRY") {
        for (const n of macroNode.countrySnap) {
          out.push({
            worldX: n.x, worldY: n.y, count: n.count,
            memberIndices: n.memberIndices,
            name: labelForNode(n, macroNode.name),
            macroKey: macroNode.key,
          });
        }
      } else if (level === "REGION") {
        for (const n of macroNode.regionSnap) {
          out.push({
            worldX: n.x, worldY: n.y, count: n.count,
            memberIndices: n.memberIndices,
            name: labelForNode(n, macroNode.name),
            macroKey: macroNode.key,
          });
        }
      } else if (level === "CITY") {
        for (const n of macroNode.citySnap) {
          out.push({
            worldX: n.x, worldY: n.y, count: n.count,
            memberIndices: n.memberIndices,
            name: labelForNode(n, macroNode.name),
            macroKey: macroNode.key,
          });
        }
      } else {  // LEAF
        for (const mi of macroNode.memberIndices) {
          const m = monuments[mi];
          const p = project(m.lat, m.lng);
          out.push({
            worldX: p.x, worldY: p.y, count: 1,
            memberIndices: [mi],
            name: m.city || "",
            macroKey: macroNode.key,
          });
        }
      }
    }
    return out;
  }

  function labelForNode(node, parentName) {
    if (node.cityKey) return node.cityKey;
    if (node.country && COUNTRY_NAME_RU[node.country]) return COUNTRY_NAME_RU[node.country];
    return parentName;
  }

  // ---------- Screen-space materialization + relaxation -----------------
  //
  // Convert world-space clusters to on-screen positions and radii, filter to
  // viewport, then relax to eliminate overlaps.

  function materializeToScreen(clustersWorld, sizeMode) {
    const arr = [];
    // Visible pre-zoom range accounts for the ctx.scale(zoom) transform:
    // at zoom < 1 the viewport shows MORE than [0..width] in pre-zoom coords
    // (it's centered on w/2 and spans width/zoom). Without this correction
    // world-preset (zoom 0.42) culled Америки, Океанию и т.д.
    const zoom = Math.max(0.01, map.zoom);
    const halfViewW = width / (2 * zoom);
    const halfViewH = height / (2 * zoom);
    const viewMinX = width * 0.5 - halfViewW;
    const viewMaxX = width * 0.5 + halfViewW;
    const viewMinY = height * 0.5 - halfViewH;
    const viewMaxY = height * 0.5 + halfViewH;
    for (const c of clustersWorld) {
      const s = pointToScreen(c.worldX, c.worldY);
      const rVpx = c.count > 1
        ? sizeFor(c.count, sizeMode)
        : shortSide() * LEAF_R_MULT;
      const margin = 100 + rVpx / zoom;
      if (s.x < viewMinX - margin || s.x > viewMaxX + margin ||
          s.y < viewMinY - margin || s.y > viewMaxY + margin) continue;
      arr.push({
        // anchor = original world → screen point (undisplaced)
        anchorX: s.x, anchorY: s.y,
        // current position (may drift after relaxation)
        sx: s.x, sy: s.y,
        // radius in viewport-px
        rVpx,
        worldX: c.worldX, worldY: c.worldY,
        count: c.count,
        memberIndices: c.memberIndices,
        name: c.name,
        macroKey: c.macroKey,
      });
    }
    return arr;
  }

  function relaxNonOverlap(arr, gapVpx, maxIters) {
    const n = arr.length;
    for (let iter = 0; iter < maxIters; iter += 1) {
      let moved = 0;
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const a = arr[i], b = arr[j];
          const dx = b.sx - a.sx;
          const dy = b.sy - a.sy;
          const d = Math.hypot(dx, dy) || 0.01;
          const minD = a.rVpx + b.rVpx + gapVpx;
          if (d < minD) {
            const push = (minD - d) * 0.5;
            const nx = dx / d;
            const ny = dy / d;
            a.sx -= nx * push; a.sy -= ny * push;
            b.sx += nx * push; b.sy += ny * push;
            moved += 1;
          }
        }
      }
      if (moved === 0) break;
    }
  }

  // ---------- Drawing ---------------------------------------------------

  function drawBaseMap() {
    if (!map.cached) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(map.cached, -map.camX, -map.camY);
    ctx.restore();
  }

  // Draw a single level onto the (already-zoom-transformed) context.
  // On-screen sizes are constant regardless of zoom because we divide by
  // map.zoom before drawing (context is scaled by zoom).
  function drawLevel(clustersScreen, layerAlpha, level) {
    const zoom = map.zoom;
    // Caller has already run relaxNonOverlap.
    // Label rendering can be muted at LEVEL_MACRO via settings toggle.
    const skipLabels = level === "MACRO" && !settings.showMacroLabels;
    ctx.save();
    ctx.globalAlpha = layerAlpha;

    // 1) Connectors (drawn under everything else)
    if (settings.showConnectors) {
      ctx.strokeStyle = cssColor(palette.brass, 0.35 * layerAlpha);
      ctx.lineWidth = 1 / zoom;
      for (const cl of clustersScreen) {
        const dx = cl.sx - cl.anchorX;
        const dy = cl.sy - cl.anchorY;
        if (Math.hypot(dx, dy) > 4) {
          ctx.beginPath();
          ctx.moveTo(cl.anchorX, cl.anchorY);
          ctx.lineTo(cl.sx, cl.sy);
          ctx.stroke();
          // small anchor dot
          ctx.beginPath();
          ctx.arc(cl.anchorX, cl.anchorY, 2 / zoom, 0, Math.PI * 2);
          ctx.fillStyle = cssColor(palette.brass, 0.55 * layerAlpha);
          ctx.fill();
        }
      }
    }

    // 2) Selection halo
    for (const cl of clustersScreen) {
      const isSel = cl.memberIndices.includes(selectedIndex);
      if (!isSel) continue;
      const r = cl.rVpx / zoom;
      ctx.beginPath(); ctx.arc(cl.sx, cl.sy, r * 3.2, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(palette.brass, 0.18 * layerAlpha); ctx.fill();
      ctx.beginPath(); ctx.arc(cl.sx, cl.sy, r * 2.0, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(palette.brass, 0.32 * layerAlpha); ctx.fill();
    }

    // 3) Circles + count
    for (const cl of clustersScreen) {
      const isCluster = cl.count > 1;
      const isSel = cl.memberIndices.includes(selectedIndex);
      const r = cl.rVpx / zoom;
      // Fill by extant/demolished mix
      let fill, alpha = 0.92;
      if (isCluster) {
        let extant = 0, demo = 0;
        for (const mi of cl.memberIndices) {
          const st = monuments[mi].status;
          if (st === "extant") extant += 1;
          else if (st === "demolished") demo += 1;
        }
        if (extant === 0) fill = palette.graphite;
        else if (demo === 0) fill = palette.red;
        else fill = palette.brass;
      } else {
        const m = monuments[cl.memberIndices[0]];
        fill = statusColor(m.status);
        alpha = m.status === "unknown" ? 0.55 : 0.92;
      }
      if (isSel) {
        ctx.beginPath(); ctx.arc(cl.sx, cl.sy, r + 4 / zoom, 0, Math.PI * 2);
        ctx.strokeStyle = palette.brass;
        ctx.lineWidth = 2 / zoom; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cl.sx, cl.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.globalAlpha = alpha * layerAlpha; ctx.fill();
      ctx.globalAlpha = layerAlpha;
      ctx.beginPath(); ctx.arc(cl.sx, cl.sy, r, 0, Math.PI * 2);
      ctx.strokeStyle = cssColor(palette.paper, 0.55 * layerAlpha);
      ctx.lineWidth = (isCluster ? 1.5 : 1) / zoom; ctx.stroke();

      // Count inside for N>1
      if (isCluster) {
        const fontPx = Math.max(11, r * zoom * 0.55) / zoom;
        ctx.save();
        ctx.font = `600 ${fontPx}px "20 Kopeek", "Courier New", monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = cssColor(palette.black, 0.85 * layerAlpha);
        ctx.fillText(String(cl.count), cl.sx, cl.sy);
        ctx.restore();
      }
    }

    // 4) Labels (8-slot compass; never overlap circles or other labels).
    // Skipped entirely when at MACRO level with the toggle off.
    ctx.textBaseline = "middle";
    const drawnRects = [];
    function rectsOverlap(a, b) {
      return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
    }
    if (skipLabels) { ctx.restore(); return; }
    const SLOTS = [
      { dx: +1, dy:  0, align: "left"  },  // E
      { dx: +1, dy: -1, align: "left"  },  // NE
      { dx:  0, dy: -1, align: "center"},  // N
      { dx: -1, dy: -1, align: "right" },  // NW
      { dx: -1, dy:  0, align: "right" },  // W
      { dx: -1, dy: +1, align: "right" },  // SW
      { dx:  0, dy: +1, align: "center"},  // S
      { dx: +1, dy: +1, align: "left"  },  // SE
    ];
    // Sort largest first so big regions claim slots
    const order = clustersScreen.slice().sort((a, b) => {
      const aSel = a.memberIndices.includes(selectedIndex);
      const bSel = b.memberIndices.includes(selectedIndex);
      if (aSel !== bSel) return bSel - aSel;
      return b.rVpx - a.rVpx;
    });
    for (const cl of order) {
      cl.labelRect = null;   // reset — set below only if actually drawn
      if (!cl.name) continue;
      const isSel = cl.memberIndices.includes(selectedIndex);
      const r = cl.rVpx / zoom;
      // Font (in pre-zoom units so on-screen size = fontVpx)
      // Base font in vpx, then user multiplier from settings.
      const scale = Math.max(0.4, Math.min(4, settings.labelScale || 1));
      const fontVpxRaw = Math.max(14, Math.min(34, cl.rVpx * 0.42)) * scale;
      const fontVpx = isSel ? fontVpxRaw * 1.15 : fontVpxRaw;
      const font = fontVpx / zoom;
      ctx.font = `${isSel ? 600 : 400} ${font}px "20 Kopeek", "Courier New", monospace`;
      const text = cl.count > 1 ? cl.name : cl.name;
      const w = ctx.measureText(text).width;
      const h = font;
      // Try slots in order, first non-overlapping wins
      let placed = null;
      for (const slot of SLOTS) {
        const px = 8 / zoom;
        let tx, ty;
        if (slot.align === "left")   tx = cl.sx + r + px;
        else if (slot.align === "right")  tx = cl.sx - r - px - w;
        else                              tx = cl.sx - w / 2;
        ty = cl.sy + slot.dy * (r + px + h * 0.5);
        const rect = [tx - 2 / zoom, ty - h * 0.6, tx + w + 2 / zoom, ty + h * 0.6];
        if (drawnRects.some(dr => rectsOverlap(rect, dr))) continue;
        placed = { tx, ty, rect, align: slot.align };
        break;
      }
      if (!placed) continue;   // couldn't fit — drop label
      drawnRects.push(placed.rect);
      // Persist rect in PRE-ZOOM screen space so findClusterAt can hit-test it
      cl.labelRect = placed.rect;
      ctx.textAlign = "left";
      // shadow
      ctx.fillStyle = cssColor(palette.black, 0.75 * layerAlpha);
      ctx.shadowColor = cssColor(palette.black, 0.6 * layerAlpha);
      ctx.shadowBlur = 6 / zoom;
      ctx.fillText(text, placed.tx + 1 / zoom, placed.ty + 1 / zoom);
      ctx.shadowBlur = 0;
      ctx.fillStyle = isSel ? palette.brass : cssColor(palette.paper, 0.90 * layerAlpha);
      ctx.fillText(text, placed.tx, placed.ty);
    }

    ctx.restore();
  }

  // ---------- Cross-fade support ----------------------------------------

  const FADE_HALF = 0.15;   // ±0.15 zoom band around each threshold

  function drawLevelsWithFade() {
    const z = map.zoom;
    const gapVpx = Math.max(0, Math.min(30, settings.gap));
    const thrs = [
      { z: settings.thrMacro,   lower: "MACRO",   upper: "COUNTRY" },
      { z: settings.thrCountry, lower: "COUNTRY", upper: "REGION" },
      { z: settings.thrRegion,  lower: "REGION",  upper: "CITY" },
      { z: settings.thrCity,    lower: "CITY",    upper: "LEAF" },
    ];
    const currentLevel = levelFor(z);
    let band = null;
    if (settings.crossfade) {
      for (const t of thrs) {
        if (Math.abs(z - t.z) < FADE_HALF) { band = t; break; }
      }
    }
    if (!band) {
      const cls = materializeToScreen(buildLevelClusters(currentLevel), settings.sizeMode);
      relaxNonOverlap(cls, gapVpx, 30);
      drawLevel(cls, 1.0, currentLevel);
      // Labels populated cl.labelRect during drawLevel — save for hit-test.
      lastScreenClusters = cls;
      return;
    }
    const t = (z - (band.z - FADE_HALF)) / (2 * FADE_HALF);
    const upperAlpha = t;
    const lowerAlpha = 1 - t;
    const lowerCls = materializeToScreen(buildLevelClusters(band.lower), settings.sizeMode);
    const upperCls = materializeToScreen(buildLevelClusters(band.upper), settings.sizeMode);
    relaxNonOverlap(lowerCls, gapVpx, 30);
    relaxNonOverlap(upperCls, gapVpx, 30);
    drawLevel(lowerCls, lowerAlpha, band.lower);
    drawLevel(upperCls, upperAlpha, band.upper);
    // Hit priority: whichever alpha is dominant. Both arrays included so a
    // stray click during the fade lands on something reasonable.
    lastScreenClusters = upperAlpha >= lowerAlpha
      ? upperCls.concat(lowerCls)
      : lowerCls.concat(upperCls);
  }

  // ---------- Zoom / drilldown animation --------------------------------

  let anim = null;   // { from, to, t0, dur }
  function animateTo(targetZoom, targetCamX, targetCamY, dur) {
    anim = {
      fromZoom: map.zoom, toZoom: targetZoom,
      fromCamX: map.camX, toCamX: targetCamX,
      fromCamY: map.camY, toCamY: targetCamY,
      t0: performance.now(), dur: dur || 400,
    };
    map.camVX = 0; map.camVY = 0;
  }
  function updateAnim() {
    if (!anim) return;
    const t = Math.min(1, (performance.now() - anim.t0) / anim.dur);
    const e = 1 - Math.pow(1 - t, 3);
    map.zoom = anim.fromZoom + (anim.toZoom - anim.fromZoom) * e;
    map.camX = anim.fromCamX + (anim.toCamX - anim.fromCamX) * e;
    map.camY = anim.fromCamY + (anim.toCamY - anim.fromCamY) * e;
    if (t >= 1) anim = null;
  }

  function drilldownTo(cluster) {
    // Compute target zoom = next-level threshold + 0.1 (land inside next level)
    const currentLevel = levelFor(map.zoom);
    let targetZoom;
    if (currentLevel === "MACRO") targetZoom = settings.thrMacro + 0.15;
    else if (currentLevel === "COUNTRY") targetZoom = settings.thrCountry + 0.15;
    else if (currentLevel === "REGION") targetZoom = settings.thrRegion + 0.15;
    else if (currentLevel === "CITY") targetZoom = settings.thrCity + 0.15;
    else return;
    targetZoom = clampZoom(targetZoom);
    // Bbox of cluster's members in world coords
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const mi of cluster.memberIndices) {
      const p = project(monuments[mi].lat, monuments[mi].lng);
      if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x;
      if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y;
    }
    const worldCX = (mnx + mxx) / 2;
    const worldCY = (mny + mxy) / 2;
    // Fit: want bbox × targetZoom = ~55% of viewport
    const spanW = Math.max(60, mxx - mnx);
    const spanH = Math.max(60, mxy - mny);
    const desiredZoom = Math.min(
      (width * 0.55) / spanW,
      (height * 0.55) / spanH,
      targetZoom * 1.5
    );
    const finalZoom = Math.max(targetZoom, Math.min(MAX_ZOOM, desiredZoom));
    // Camera so that (worldCX, worldCY) lands at viewport centre.
    // With zoom transform around viewport centre:
    //   screen_x = w/2 + (worldX - camX - w/2) * zoom
    // Want screen_x = w/2 → worldX - camX - w/2 = 0 → camX = worldX - w/2
    const targetCamX = worldCX - width * 0.5;
    const targetCamY = worldCY - height * 0.5;
    animateTo(finalZoom, targetCamX, targetCamY, 420);
  }

  function goHome() {
    // "Home" = whatever the user's selected view preset is.
    applyViewPreset(settings.viewPreset || "eurasia");
  }

  // Move the camera to a named preset. Animates smoothly.
  function applyViewPreset(name) {
    const preset = VIEW_PRESETS[name] || VIEW_PRESETS.eurasia;
    const target = project(preset.lat, preset.lng);
    animateTo(clampZoom(preset.zoom),
              target.x - width * 0.5,
              target.y - height * 0.5,
              500);
  }
  // Same but no animation (used at boot before first render).
  function applyViewPresetInstant(name) {
    const preset = VIEW_PRESETS[name] || VIEW_PRESETS.eurasia;
    const target = project(preset.lat, preset.lng);
    map.zoom = clampZoom(preset.zoom);
    map.camX = target.x - width * 0.5;
    map.camY = target.y - height * 0.5;
    map.camVX = 0; map.camVY = 0;
    clampCamera();
  }

  function zoomOutOneLevel() {
    const currentLevel = levelFor(map.zoom);
    let target;
    if (currentLevel === "LEAF") target = settings.thrCity - 0.1;
    else if (currentLevel === "CITY") target = settings.thrRegion - 0.1;
    else if (currentLevel === "REGION") target = settings.thrCountry - 0.1;
    else if (currentLevel === "COUNTRY") target = settings.thrMacro - 0.1;
    else target = 0.8;
    target = clampZoom(target);
    animateTo(target, map.camX, map.camY, 380);
  }

  // ---------- Hit test --------------------------------------------------

  // We remember the last-drawn set of screen clusters for hit-testing
  let lastScreenClusters = [];

  function findClusterAt(cx, cy) {
    const zoom = map.zoom;
    const hw = width * 0.5, hh = height * 0.5;
    // Pass 1 — label rect hit (priority over dot proximity)
    let bestLabel = null, bestLabelD = Infinity;
    for (const cl of lastScreenClusters) {
      const lr = cl.labelRect;
      if (!lr) continue;
      const rx0 = hw + (lr[0] - hw) * zoom;
      const ry0 = hh + (lr[1] - hh) * zoom;
      const rx1 = hw + (lr[2] - hw) * zoom;
      const ry1 = hh + (lr[3] - hh) * zoom;
      const pad = 6;
      if (cx >= rx0 - pad && cx <= rx1 + pad &&
          cy >= ry0 - pad && cy <= ry1 + pad) {
        const screenX = hw + (cl.sx - hw) * zoom;
        const screenY = hh + (cl.sy - hh) * zoom;
        const d = Math.hypot(cx - screenX, cy - screenY);
        if (d < bestLabelD) { bestLabelD = d; bestLabel = cl; }
      }
    }
    if (bestLabel) return bestLabel;
    // Pass 2 — dot proximity
    let best = null, bestD = Infinity;
    for (const cl of lastScreenClusters) {
      const screenX = hw + (cl.sx - hw) * zoom;
      const screenY = hh + (cl.sy - hh) * zoom;
      const d = Math.hypot(cx - screenX, cy - screenY);
      const hitR = Math.max(cl.rVpx + 12, 22);
      if (d <= hitR && d < bestD) { bestD = d; best = cl; }
    }
    return best;
  }

  // ---------- Card wiring -----------------------------------------------

  function showMonument(index) {
    selectedIndex = index;
    if (window.MtkCard) window.MtkCard.show(monuments[index]);
  }
  function hideMonument() {
    if (window.MtkCard) window.MtkCard.hide();
  }
  document.addEventListener("mtk-card-hidden", () => { selectedIndex = -1; });

  // ---------- Home chip DOM ---------------------------------------------

  const homeChip = document.getElementById("home-chip");
  homeChip.addEventListener("click", (e) => {
    e.stopPropagation();
    goHome();
  });
  function updateHomeChip() {
    const shouldShow = map.zoom > settings.thrMacro + 0.05 && levelFor(map.zoom) !== "MACRO";
    if (shouldShow) homeChip.hidden = false;
    else homeChip.hidden = true;
  }

  // ---------- Settings panel DOM ----------------------------------------

  const settingsToggle = document.getElementById("settings-toggle");
  const settingsPanel = document.getElementById("settings-panel");
  settingsToggle.addEventListener("click", () => {
    settingsPanel.hidden = !settingsPanel.hidden;
  });

  // View-preset segmented — animate camera + save default
  settingsPanel.querySelectorAll("[data-view-preset]").forEach(btn => {
    btn.addEventListener("click", () => {
      settings.viewPreset = btn.dataset.viewPreset;
      settingsPanel.querySelectorAll("[data-view-preset]").forEach(b => {
        b.classList.toggle("active", b.dataset.viewPreset === settings.viewPreset);
        b.setAttribute("aria-checked", b.dataset.viewPreset === settings.viewPreset ? "true" : "false");
      });
      applyViewPreset(settings.viewPreset);
      saveSettings();
    });
    if (btn.dataset.viewPreset === settings.viewPreset) {
      btn.classList.add("active");
      btn.setAttribute("aria-checked", "true");
    } else {
      btn.classList.remove("active");
      btn.setAttribute("aria-checked", "false");
    }
  });

  // Size-mode segmented
  settingsPanel.querySelectorAll("[data-size-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      settings.sizeMode = btn.dataset.sizeMode;
      settingsPanel.querySelectorAll("[data-size-mode]").forEach(b => {
        b.classList.toggle("active", b.dataset.sizeMode === settings.sizeMode);
        b.setAttribute("aria-checked", b.dataset.sizeMode === settings.sizeMode ? "true" : "false");
      });
      saveSettings();
    });
    if (btn.dataset.sizeMode === settings.sizeMode) {
      btn.classList.add("active");
      btn.setAttribute("aria-checked", "true");
    }
  });

  function wireRange(id, key, formatter) {
    const el = document.getElementById(id);
    const label = settingsPanel.querySelector(`[data-value-for="${id}"]`);
    el.value = String(settings[key]);
    if (label) label.textContent = formatter(settings[key]);
    el.addEventListener("input", () => {
      const v = parseFloat(el.value);
      settings[key] = v;
      if (label) label.textContent = formatter(v);
      saveSettings();
    });
  }
  wireRange("thr-macro", "thrMacro", v => v.toFixed(2) + "×");
  wireRange("thr-country", "thrCountry", v => v.toFixed(2) + "×");
  wireRange("thr-region", "thrRegion", v => v.toFixed(2) + "×");
  wireRange("thr-city", "thrCity", v => v.toFixed(2) + "×");
  wireRange("opt-gap", "gap", v => String(Math.round(v)));
  wireRange("opt-label-scale", "labelScale", v => v.toFixed(2) + "×");

  function wireCheck(id, key) {
    const el = document.getElementById(id);
    el.checked = !!settings[key];
    el.addEventListener("change", () => {
      settings[key] = !!el.checked;
      saveSettings();
    });
  }
  wireCheck("opt-macro-labels", "showMacroLabels");
  wireCheck("opt-connectors", "showConnectors");
  wireCheck("opt-outliers", "showOutliers");
  wireCheck("opt-crossfade", "crossfade");
  // 3D-модель — special: prox through MtkCard.setShow3D so open card refreshes
  (function () {
    const el = document.getElementById("opt-show3d");
    el.checked = !!settings.show3D;
    if (window.MtkCard && window.MtkCard.setShow3D) window.MtkCard.setShow3D(settings.show3D);
    el.addEventListener("change", () => {
      settings.show3D = !!el.checked;
      saveSettings();
      if (window.MtkCard && window.MtkCard.setShow3D) window.MtkCard.setShow3D(settings.show3D);
    });
  })();

  document.getElementById("opt-reset").addEventListener("click", () => {
    Object.assign(settings, DEFAULT_SETTINGS);
    saveSettings();
    // Re-sync inputs
    document.getElementById("thr-macro").value = settings.thrMacro;
    document.getElementById("thr-country").value = settings.thrCountry;
    document.getElementById("thr-region").value = settings.thrRegion;
    document.getElementById("thr-city").value = settings.thrCity;
    document.getElementById("opt-gap").value = settings.gap;
    document.getElementById("opt-label-scale").value = settings.labelScale;
    document.getElementById("opt-macro-labels").checked = settings.showMacroLabels;
    document.getElementById("opt-connectors").checked = settings.showConnectors;
    document.getElementById("opt-outliers").checked = settings.showOutliers;
    document.getElementById("opt-crossfade").checked = settings.crossfade;
    document.getElementById("opt-show3d").checked = settings.show3D;
    if (window.MtkCard && window.MtkCard.setShow3D) window.MtkCard.setShow3D(settings.show3D);
    settingsPanel.querySelectorAll("[data-size-mode]").forEach(b => {
      b.classList.toggle("active", b.dataset.sizeMode === settings.sizeMode);
    });
    settingsPanel.querySelectorAll("[data-view-preset]").forEach(b => {
      b.classList.toggle("active", b.dataset.viewPreset === settings.viewPreset);
    });
    applyViewPreset(settings.viewPreset);
    settingsPanel.querySelectorAll("[data-value-for]").forEach(span => {
      const id = span.dataset.valueFor;
      if (id === "opt-gap") span.textContent = String(Math.round(settings.gap));
      else if (id === "opt-label-scale") span.textContent = settings.labelScale.toFixed(2) + "×";
      else if (id.startsWith("thr-")) {
        const key =
          id === "thr-macro"   ? "thrMacro" :
          id === "thr-country" ? "thrCountry" :
          id === "thr-region"  ? "thrRegion" :
          "thrCity";
        span.textContent = settings[key].toFixed(2) + "×";
      }
    });
  });

  // ---------- Pointer / wheel -------------------------------------------

  canvas.addEventListener("pointerdown", event => {
    // Close settings on any canvas touch
    if (!settingsPanel.hidden) settingsPanel.hidden = true;
    ACTIVE_POINTERS.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (ACTIVE_POINTERS.size === 2) {
      const pts = Array.from(ACTIVE_POINTERS.values());
      pinchInitialDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchInitialZoom = map.zoom;
      return;
    }
    map.dragging = true;
    didDrag = false;
    pressStartX = event.clientX;
    pressStartY = event.clientY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = performance.now();
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
    }
    // Interrupt any running animation on user touch
    anim = null;
  });

  canvas.addEventListener("pointermove", event => {
    if (ACTIVE_POINTERS.has(event.pointerId)) {
      ACTIVE_POINTERS.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (ACTIVE_POINTERS.size === 2) {
      const pts = Array.from(ACTIVE_POINTERS.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (pinchInitialDist > 0) {
        const target = pinchInitialZoom * (dist / pinchInitialDist);
        map.zoom = clampZoom(target);
      }
      didDrag = true;
      return;
    }
    if (!map.dragging) return;
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    if (!didDrag) {
      const totalDx = event.clientX - pressStartX;
      const totalDy = event.clientY - pressStartY;
      if (Math.hypot(totalDx, totalDy) > TAP_THRESHOLD) didDrag = true;
    }
    if (didDrag) {
      const now = performance.now();
      const dt = Math.max(16, now - lastPointerTime) / 1000;
      map.camX -= dx / map.zoom;
      map.camY -= dy / map.zoom;
      map.camVX = -dx / dt / map.zoom;
      map.camVY = -dy / dt / map.zoom;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastPointerTime = now;
    }
  }, { passive: true });

  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    const newZoom = clampZoom(map.zoom * factor);
    if (newZoom === map.zoom) return;
    map.zoom = newZoom;
    anim = null;   // wheel interrupts anim
  }, { passive: false });

  function endPointer(event) {
    ACTIVE_POINTERS.delete(event.pointerId);
    if (ACTIVE_POINTERS.size < 2) pinchInitialDist = 0;
    if (ACTIVE_POINTERS.size === 1) {
      const remaining = Array.from(ACTIVE_POINTERS.values())[0];
      lastPointerX = remaining.x;
      lastPointerY = remaining.y;
      didDrag = true;
    }
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    if (ACTIVE_POINTERS.size === 0 && map.dragging && !didDrag) {
      const cl = findClusterAt(event.clientX, event.clientY);
      if (cl && cl.count > 1) {
        drilldownTo(cl);
      } else if (cl && cl.count === 1) {
        showMonument(cl.memberIndices[0]);
        map.camVX = 0; map.camVY = 0;
      } else {
        // Empty tap: hide card if open, else zoom out one level
        if (selectedIndex >= 0) hideMonument();
        else zoomOutOneLevel();
      }
    }
    if (ACTIVE_POINTERS.size === 0) map.dragging = false;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", event => {
    ACTIVE_POINTERS.delete(event.pointerId);
    if (ACTIVE_POINTERS.size === 0) map.dragging = false;
  });

  window.addEventListener("resize", resize);

  // ---------- Dynamics + clamp ------------------------------------------

  // Clamp the camera so no matter the zoom, the visible viewport stays
  // inside the world [0..worldW] × [0..worldH]. Prevents any empty canvas
  // above/below/beside the map.
  // Clamp cam so that at any zoom no empty canvas appears beyond the world's
  // top/bottom/left/right edges. Derivation:
  //   world x=0 at screen x=0 → camX = w/(2z) - w/2
  //   world x=worldW at screen x=w → camX = worldW - w/2 - w/(2z)
  //   For "no empty space on left" the world must extend at or beyond the
  //   left edge → camX ≥ w/(2z) - w/2. Analogously for other sides.
  function clampCamera() {
    if (!map.worldW || !map.worldH) return;
    const z = map.zoom || 1;
    const halfW = width * 0.5 / z;
    const halfH = height * 0.5 / z;
    const cxMin = halfW - width * 0.5;
    const cxMax = map.worldW - width * 0.5 - halfW;
    const cyMin = halfH - height * 0.5;
    const cyMax = map.worldH - height * 0.5 - halfH;
    if (cxMax < cxMin) map.camX = (map.worldW - width) * 0.5;
    else if (map.camX < cxMin) map.camX = cxMin;
    else if (map.camX > cxMax) map.camX = cxMax;
    if (cyMax < cyMin) map.camY = (map.worldH - height) * 0.5;
    else if (map.camY < cyMin) map.camY = cyMin;
    else if (map.camY > cyMax) map.camY = cyMax;
  }

  function applyDynamics(dt) {
    if (map.dragging || anim) {
      clampCamera();
      return;
    }
    map.camX += map.camVX * dt;
    map.camY += map.camVY * dt;
    map.camVX *= Math.pow(0.88, dt * 60);
    map.camVY *= Math.pow(0.88, dt * 60);
    if (Math.abs(map.camVX) < 0.4) map.camVX = 0;
    if (Math.abs(map.camVY) < 0.4) map.camVY = 0;
    clampCamera();
  }

  function drawLoadingState() {
    ctx.save();
    ctx.fillStyle = cssColor(palette.paper, 0.45);
    ctx.font = `400 ${Math.min(width, height) * 0.018}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("загрузка карты…", width * 0.5, height * 0.5);
    ctx.restore();
  }

  function drawHudHint() {
    ctx.save();
    ctx.font = `400 ${Math.max(11, Math.min(width, height) * 0.011)}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = cssColor(palette.brass, 0.55);
    const level = levelFor(map.zoom);
    ctx.fillText(
      `${level} · ×${map.zoom.toFixed(2)} · PINCH/WHEEL = ZOOM · DRAG = PAN · TAP = DRILL`,
      width - 12, height - 10
    );
    ctx.restore();
  }

  // ---------- Render loop -----------------------------------------------

  function render(now) {
    const time = (now - start) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, time - previousTime));
    previousTime = time;

    updateAnim();
    applyDynamics(dt);

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width * 0.5, height * 0.5);
    ctx.scale(map.zoom, map.zoom);
    ctx.translate(-width * 0.5, -height * 0.5);
    if (geoLoaded) drawBaseMap();
    if (monuments.length && tree.children.length) {
      // drawLevelsWithFade materializes + relaxes + draws, then publishes
      // the drawn cluster array into lastScreenClusters (with cl.labelRect
      // populated) so findClusterAt can hit-test both dot and label.
      drawLevelsWithFade();
    }
    ctx.restore();

    if (!geoLoaded) drawLoadingState();
    drawHudHint();
    updateHomeChip();

    requestAnimationFrame(render);
  }

  // ---------- Boot ------------------------------------------------------

  function loadAll() {
    return Promise.all([
      fetch("../data/ne_110m_countries.geojson").then(r => r.json()).catch(() => null),
      fetch("../data/mtk41.json").then(r => r.json()),
    ]).then(([geo, mtk]) => {
      if (geo) {
        map.geojson = geo;
        if (map.worldW) buildWorldCache();
        geoLoaded = true;
      }
      monuments = (mtk.items || []).filter(it => typeof it.lat === "number" && typeof it.lng === "number");
      buildTree();
    });
  }

  resize();
  // Apply saved view preset instantly so the first frame lands where the
  // user last was (or on the default "eurasia" for a fresh session).
  applyViewPresetInstant(settings.viewPreset);
  loadAll().then(() => {
    if (map.geojson && !map.cached) buildWorldCache();
    // Re-apply preset in case tree building shifted things or viewport changed
    applyViewPresetInstant(settings.viewPreset);
    requestAnimationFrame(render);
  }).catch(err => {
    console.warn("Load failed:", err);
    requestAnimationFrame(render);
  });
  requestAnimationFrame(render);
})();
