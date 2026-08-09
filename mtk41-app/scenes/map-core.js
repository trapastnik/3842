/* Математика иерархии карты МТК 41 — макро-регионы, агломеративное дерево,
 * материализация уровня на экран и разведение кружков.
 *
 * Вынесено из прототипа mtk41-map-hier/map.js без изменений по существу:
 * алгоритм проверен на корпусе и на приёмке хаба, переписывать его заново
 * ради переезда на контракт сцены смысла нет. Здесь только чистые функции —
 * ни DOM, ни канвы, ни настроек: сцена передаёт им данные и получает
 * геометрию.
 *
 * Единственная правка при переносе: параметры, которые в прототипе брались
 * из замыкания (settings, map, dep.width/dep.height), стали аргументами. */

export function createMapCore(dep) {
  /* Дерево живёт внутри фабрики: у каждой сцены своё, пересобирается
   * в buildTree() при смене данных или порогов кластеризации. */
  const tree = { children: [] };


  /* ─── Макро-регионы: ручная разметка мира на 16 частей ─────────────── */

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

  /* ─── Русские названия стран из корпуса ────────────────────────────── */

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

  /* ─── Агломеративное дерево: лист → узел → уровень ─────────────────── */

  function makeLeaf(itemIdx) {
    const m = dep.monuments[itemIdx];
    const p = dep.project(m.lat, m.lng);
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
      const iso = dep.monuments[mi].country_iso ||
                  (dep.monuments[mi].country === "СССР" ? "RU" : null);
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

  function computeThresholds() {
    return {
      country: dep.map.worldW * 0.125,
      region:  dep.map.worldW * 0.030,
      city:    dep.map.worldW * 0.010,
    };
  }

  function buildTree() {
    // Bucket items by macro
    const buckets = new Map();
    for (let i = 0; i < dep.monuments.length; i += 1) {
      const key = assignMacro(dep.monuments[i]);
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
        const p = dep.project(dep.monuments[mi].lat, dep.monuments[mi].lng);
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

  /* ─── Размер кружка и материализация уровня ───────────────────────── */

  const LEAF_R_MULT = 0.006;   // доля короткой стороны экрана

  function sizeFor(count, mode) {
    const s = dep.shortSide();
    const base = s * 0.010;
    const cap = s * 0.055;
    let r;
    if (mode === "linear") r = base + s * 0.0018 * count;
    else if (mode === "log") r = base + s * 0.012 * Math.log2(count + 1);
    else r = base + s * 0.006 * Math.sqrt(count);
    return Math.min(cap, r);
  }

  function buildLevelClusters(level) {
    const out = [];
    for (const macroNode of tree.children) {
      if (macroNode.isOutlier && !dep.settings.showOutliers) continue;
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
          const m = dep.monuments[mi];
          const p = dep.project(m.lat, m.lng);
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
    // (it's centered on w/2 and spans dep.width/zoom). Without this correction
    // world-preset (zoom 0.42) culled Америки, Океанию и т.д.
    const zoom = Math.max(0.01, dep.map.zoom);
    const halfViewW = dep.width / (2 * zoom);
    const halfViewH = dep.height / (2 * zoom);
    const viewMinX = dep.width * 0.5 - halfViewW;
    const viewMaxX = dep.width * 0.5 + halfViewW;
    const viewMinY = dep.height * 0.5 - halfViewH;
    const viewMaxY = dep.height * 0.5 + halfViewH;
    for (const c of clustersWorld) {
      const s = dep.pointToScreen(c.worldX, c.worldY);
      const rVpx = c.count > 1
        ? sizeFor(c.count, sizeMode)
        : dep.shortSide() * LEAF_R_MULT;
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

  return {
    tree,
    MACRO_REGIONS, COUNTRY_NAME_RU, assignMacro, makeLeaf, mergeNodes,
    agglomerativeSnapshot, computeThresholds, buildTree, sizeFor,
    buildLevelClusters, labelForNode, materializeToScreen, relaxNonOverlap,
  };

}
