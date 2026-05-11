import {
  prepareWithSegments,
  layoutNextLineRange,
  materializeLineRange
} from "https://esm.sh/@chenglou/pretext";

const canvas = document.getElementById("poster");
const ctx = canvas.getContext("2d", { alpha: true });

const palette = {
  paper: "#F7F9EF",
  brass: "#D2B773",
  red: "#A02128",
  window: "#9DA3A6",
  graphite: "#435059",
  black: "#000000"
};

const words = [
  { lang: "Русский", text: "Ленин", script: "cyrillic", primary: true },
  { lang: "English", text: "Lenin", script: "latin", primary: true },
  { lang: "Français", text: "Lénine", script: "latin", primary: true },
  { lang: "Español", text: "Lenin", script: "latin", primary: true },
  { lang: "العربية", text: "لينين", script: "arabic", primary: true },
  { lang: "中文", text: "列宁", script: "cjk", primary: true },
  { lang: "Hindi", text: "लेनिन", script: "devanagari" },
  { lang: "Bengali", text: "লেনিন", script: "bengali" },
  { lang: "Português", text: "Lênin", script: "latin" },
  { lang: "Deutsch", text: "Lenin", script: "latin" },
  { lang: "Italiano", text: "Lenin", script: "latin" },
  { lang: "Polski", text: "Lenin", script: "latin" },
  { lang: "Türkçe", text: "Lenin", script: "latin" },
  { lang: "Indonesia", text: "Lenin", script: "latin" },
  { lang: "Tiếng Việt", text: "Lênin", script: "latin" },
  { lang: "Kiswahili", text: "Lenin", script: "latin" },
  { lang: "Українська", text: "Ленін", script: "cyrillic" },
  { lang: "Беларуская", text: "Ленін", script: "cyrillic" },
  { lang: "Қазақша", text: "Ленин", script: "cyrillic" },
  { lang: "Кыргызча", text: "Ленин", script: "cyrillic" },
  { lang: "Монгол", text: "Ленин", script: "cyrillic" },
  { lang: "Հայերեն", text: "Լենին", script: "armenian" },
  { lang: "ქართული", text: "ლენინი", script: "georgian" },
  { lang: "Ελληνικά", text: "Λένιν", script: "greek" },
  { lang: "עברית", text: "לנין", script: "hebrew" },
  { lang: "فارسی", text: "لنین", script: "arabic" },
  { lang: "اردو", text: "لینن", script: "arabic" },
  { lang: "日本語", text: "レーニン", script: "cjk" },
  { lang: "한국어", text: "레닌", script: "hangul" },
  { lang: "ไทย", text: "เลนิน", script: "thai" },
  { lang: "தமிழ்", text: "லெனின்", script: "tamil" },
  { lang: "తెలుగు", text: "లెనిన్", script: "telugu" },
  { lang: "ಕನ್ನಡ", text: "ಲೆನಿನ್", script: "kannada" },
  { lang: "മലയാളം", text: "ലെനിൻ", script: "malayalam" },
  { lang: "ਪੰਜਾਬੀ", text: "ਲੈਨਿਨ", script: "gurmukhi" },
  { lang: "मराठी", text: "लेनिन", script: "devanagari" },
  { lang: "नेपाली", text: "लेनिन", script: "devanagari" },
  { lang: "සිංහල", text: "ලෙනින්", script: "sinhala" },
  { lang: "Amharic", text: "ሌኒን", script: "ethiopic" },
  { lang: "Lao", text: "ເລນິນ", script: "lao" },
  { lang: "Khmer", text: "លេនីន", script: "khmer" },
  { lang: "Burmese", text: "လီနင်", script: "myanmar" }
];

const FALLBACK_FONTS = '"Noto Sans","Noto Serif","Arial Unicode MS","Arial",sans-serif';

let width = 0;
let height = 0;
let dpr = 1;

// World is larger than the visible canvas — heroes live here and wrap when
// they cross the edge.  Camera drift slowly pans the visible window across
// the world, creating an infinite-canvas feel.
const world = { width: 0, height: 0 };
const drift = { x: 0, y: 0, noiseT: 0 };

const heroes = [];
const fillerLayers = [];

// Springy obstacle that lags behind the cursor — feels alive without React
const obstacle = {
  x: -10000,
  y: -10000,
  vx: 0,
  vy: 0,
  targetX: -10000,
  targetY: -10000,
  radius: 0,
  active: false,
  // Spring constants (Hooke + damping). Tuned for ~250–350 ms settle time.
  stiffness: 180,
  damping: 22,
  mass: 1
};

function makeRng(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function cssColor(hex, alpha) {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fontStack(script, size, weight) {
  if (script === "latin" || script === "cyrillic" || script === "greek") {
    return `${weight} ${size}px "Nolde", ${FALLBACK_FONTS}`;
  }
  return `${weight} ${size}px ${FALLBACK_FONTS}`;
}

// Generic font for pretext layout — pretext takes a single font per paragraph,
// but Canvas font fallback resolves per-glyph at draw time.
function genericFont(size, weight) {
  return `${weight} ${size}px "Nolde", ${FALLBACK_FONTS}`;
}

function rotatedAabb(cx, cy, w, h, angleRad) {
  const cos = Math.abs(Math.cos(angleRad));
  const sin = Math.abs(Math.sin(angleRad));
  const halfW = (w * cos + h * sin) / 2;
  const halfH = (w * sin + h * cos) / 2;
  return { x0: cx - halfW, y0: cy - halfH, x1: cx + halfW, y1: cy + halfH };
}

function aabbOverlap(a, b) {
  return !(a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0);
}

// Place hero words in world space (1.5x screen on each axis).  Heroes wrap
// when camera drift moves them past the edge.  More heroes than before to
// keep similar visible density now that the world is larger.
function buildHeroes() {
  heroes.length = 0;
  const rng = makeRng(0xA001F00D);
  const shortSide = Math.min(width, height);

  world.width = width * 1.5;
  world.height = height * 1.5;

  const tiers = [
    { size: shortSide * 0.20,  count: 2  },
    { size: shortSide * 0.115, count: 4  },
    { size: shortSide * 0.075, count: 4  },
    { size: shortSide * 0.05,  count: 6  }
  ];

  const heroPicks = [
    words[0], words[1], words[5], words[4],   // Ленин, Lenin, 列宁, لينين
    words[27], words[28], words[6], words[19], // レーニン, 레닌, लेनिन, Кыргызча
    words[3], words[2], words[22], words[24], // Lenin (es), Lénine, ლენინი, לנין
    words[39], words[7], words[14], words[36] // Lao, Bengali, Tiếng Việt, нेपाली
  ];

  let pickIndex = 0;
  const margin = shortSide * 0.04;
  const placed = [];

  tiers.forEach((tier, tierIndex) => {
    for (let i = 0; i < tier.count && pickIndex < heroPicks.length; i += 1, pickIndex += 1) {
      const item = heroPicks[pickIndex];
      const weight = item.primary ? 600 : 400;
      ctx.font = fontStack(item.script, tier.size, weight);
      const metrics = ctx.measureText(item.text);
      const textWidth = metrics.width;
      const textHeight = tier.size * 1.05;

      const angle =
        tierIndex === 0 ? 0 :
        rng() < 0.4 ? -15 * Math.PI / 180 :
        rng() < 0.18 ? 90 * Math.PI / 180 :
        0;

      let cx = 0, cy = 0, box = null, ok = false;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        // place anywhere in the world with margin
        cx = margin + rng() * (world.width - margin * 2);
        cy = margin + rng() * (world.height - margin * 2);
        box = rotatedAabb(cx, cy, textWidth + margin * 0.6, textHeight + margin * 0.3, angle);
        if (box.x0 < margin || box.y0 < margin || box.x1 > world.width - margin || box.y1 > world.height - margin) continue;
        let overlap = false;
        for (let p = 0; p < placed.length; p += 1) {
          if (aabbOverlap(box, placed[p].box)) { overlap = true; break; }
        }
        if (!overlap) { ok = true; break; }
      }
      if (!ok) continue;

      const tone =
        item === words[0] ? "red" :
        rng() < 0.18 ? "brass" :
        rng() < 0.06 ? "red" :
        "paper";

      placed.push({ box });
      heroes.push({
        item,
        worldX: cx,
        worldY: cy,
        size: tier.size,
        angle,
        weight,
        tone,
        tier: tierIndex,
        // Inflated bbox half-extents used both for screen visibility check
        // and as the filler's obstacle (gives a breathing zone).
        inflatedWidth: textWidth + tier.size * 0.5,
        inflatedHeight: textHeight + tier.size * 0.3
      });
    }
  });
}

// Build filler layers — repeated text at different small/medium sizes that
// pretext lays out flowing around heroes + the springy pointer obstacle.
function buildFillerLayers() {
  fillerLayers.length = 0;
  const shortSide = Math.min(width, height);

  // 3 layers, each fills the whole canvas at different size; overlapping draws
  // give size variety.  Lower-density larger sizes are drawn FIRST (back),
  // higher-density small sizes drawn ON TOP for crispness.
  const layerConfigs = [
    { size: shortSide * 0.024, weight: 400, repeats: 14, lineHeight: 1.25, alpha: 0.78, tone: "paper" },
    { size: shortSide * 0.038, weight: 600, repeats: 6,  lineHeight: 1.2,  alpha: 0.55, tone: "brass" },
    { size: shortSide * 0.060, weight: 600, repeats: 3,  lineHeight: 1.15, alpha: 0.18, tone: "paper" }
  ];

  const baseRng = makeRng(0xF11E8521);

  layerConfigs.forEach((config, idx) => {
    const rng = makeRng(0xF11E8521 + idx * 7919);
    // Build a long shuffled word stream
    const stream = [];
    for (let r = 0; r < config.repeats; r += 1) {
      const shuffled = words.slice().sort(() => rng() - 0.5);
      for (let w = 0; w < shuffled.length; w += 1) stream.push(shuffled[w].text);
    }
    const text = stream.join("   ·   "); // bullet glue between words
    const font = genericFont(config.size, config.weight);
    const prepared = prepareWithSegments(text, font);
    fillerLayers.push({ ...config, text, font, prepared, lineHeightPx: config.size * config.lineHeight });
  });

  baseRng;
}

// Stable hash → [0,1) for deterministic per-bbox decisions
function hash01(a, b, c) {
  let h = 2654435761;
  h = ((h ^ (a | 0)) * 16777619) >>> 0;
  h = ((h ^ (b | 0)) * 16777619) >>> 0;
  h = ((h ^ (c | 0)) * 16777619) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Compute available x-segments at a given y, given a list of obstacle bboxes.
// Each obstacle may have `.soft ∈ [0..1]` — fraction of its width allowed to
// be encroached on (acts as inset).  Returns array of {x0, x1}.
function availableSegmentsAt(y, lineHeightPx, obstacleBoxes) {
  const blocks = [];
  for (let i = 0; i < obstacleBoxes.length; i += 1) {
    const b = obstacleBoxes[i];
    if (b.y1 < y || b.y0 > y + lineHeightPx) continue;
    let bx0 = b.x0;
    let bx1 = b.x1;
    if (b.soft && b.soft > 0) {
      const inset = (bx1 - bx0) * b.soft * 0.5;
      bx0 += inset;
      bx1 -= inset;
    }
    blocks.push([Math.max(0, bx0), Math.min(width, bx1)]);
  }
  blocks.sort((a, b) => a[0] - b[0]);

  const segs = [];
  let cursor = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    const [bx0, bx1] = blocks[i];
    if (bx0 > cursor) segs.push({ x0: cursor, x1: Math.min(bx0, width) });
    cursor = Math.max(cursor, bx1);
  }
  if (cursor < width) segs.push({ x0: cursor, x1: width });
  return segs.filter(s => s.x1 - s.x0 > 14); // discard slivers
}

// For a hero, return all on-screen occurrences (1–4) considering wrap by
// world dims.  Near a wrap edge two copies are emitted so the transition is
// seamless (one exiting, one entering).
function visibleHeroOccurrences(hero) {
  if (world.width <= 0 || world.height <= 0) return [];
  const sx0 = ((hero.worldX - drift.x) % world.width + world.width) % world.width;
  const sy0 = ((hero.worldY - drift.y) % world.height + world.height) % world.height;
  const halfW = hero.inflatedWidth * 0.5;
  const halfH = hero.inflatedHeight * 0.5;
  const occs = [];
  // Each candidate offset checks one of: at, wrap-left, wrap-up, wrap-corner
  for (let i = 0; i < 4; i += 1) {
    const ox = (i & 1) ? -world.width : 0;
    const oy = (i & 2) ? -world.height : 0;
    const sx = sx0 + ox;
    const sy = sy0 + oy;
    if (sx + halfW < 0 || sx - halfW > width) continue;
    if (sy + halfH < 0 || sy - halfH > height) continue;
    occs.push({ x: sx, y: sy });
  }
  return occs;
}

// Low-frequency 2D noise drift — feels random without explicit randomness.
function applyDrift(dt) {
  if (world.width <= 0 || world.height <= 0) return;
  drift.noiseT += dt;
  const vx = Math.sin(drift.noiseT * 0.11) * 9 + Math.sin(drift.noiseT * 0.063 + 1.4) * 6;
  const vy = Math.cos(drift.noiseT * 0.087) * 7 + Math.sin(drift.noiseT * 0.051 + 2.3) * 5;
  drift.x = (((drift.x + vx * dt) % world.width) + world.width) % world.width;
  drift.y = (((drift.y + vy * dt) % world.height) + world.height) % world.height;
}

// Build current obstacle list: visible hero occurrences + springy pointer.
function currentObstacles() {
  const list = [];
  for (let i = 0; i < heroes.length; i += 1) {
    const h = heroes[i];
    const occs = visibleHeroOccurrences(h);
    for (let j = 0; j < occs.length; j += 1) {
      const o = occs[j];
      const box = rotatedAabb(o.x, o.y, h.inflatedWidth, h.inflatedHeight, h.angle);
      box.soft = 0;
      list.push(box);
    }
  }
  if (obstacle.active && obstacle.radius > 0) {
    list.push({
      x0: obstacle.x - obstacle.radius,
      y0: obstacle.y - obstacle.radius,
      x1: obstacle.x + obstacle.radius,
      y1: obstacle.y + obstacle.radius,
      soft: 0
    });
  }
  return list;
}

function drawHeroAt(hero, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(hero.angle);
  ctx.font = fontStack(hero.item.script, hero.size, hero.weight);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const color =
    hero.tone === "red" ? palette.red :
    hero.tone === "brass" ? palette.brass :
    palette.paper;

  ctx.shadowColor = cssColor(palette.black, 0.55);
  ctx.shadowBlur = hero.tier === 0 ? 28 : hero.tier === 1 ? 16 : 8;
  ctx.fillStyle = color;
  ctx.globalAlpha = hero.tier === 0 ? 0.96 : hero.tier === 1 ? 0.92 : 0.82;
  ctx.fillText(hero.item.text, 0, 0);

  if (hero.tone === "red" || hero.tone === "brass") {
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = palette.brass;
    ctx.strokeText(hero.item.text, 0, 0);
  }
  ctx.restore();
}

function drawHero(hero) {
  const occs = visibleHeroOccurrences(hero);
  for (let i = 0; i < occs.length; i += 1) {
    drawHeroAt(hero, occs[i].x, occs[i].y);
  }
}

// fillerLayers[0]=small (drawn LAST, on top), [1]=medium, [2]=large (drawn FIRST, in back).
// Render order is large → medium → small, with bboxes accumulating.
// "Soft" means later layers can encroach on this bbox by up to `max` fraction.
// Heroes & pointer always strict (soft=0). Small layer's bboxes irrelevant
// since nothing is drawn after it.
const LAYER_SOFTNESS = [
  { prob: 0,    max: 0    }, // small
  { prob: 0.30, max: 0.18 }, // medium — 30% of bboxes allow up to 18% encroach
  { prob: 0.35, max: 0.20 }  // large  — 35% of bboxes allow up to 20% encroach
];

function drawFillerLayer(layer, layerIndex, obstacleBoxes) {
  ctx.save();
  ctx.font = layer.font;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle =
    layer.tone === "brass" ? palette.brass :
    layer.tone === "red" ? palette.red :
    palette.paper;
  ctx.globalAlpha = layer.alpha;
  ctx.shadowColor = cssColor(palette.black, 0.4);
  ctx.shadowBlur = 4;

  const softCfg = LAYER_SOFTNESS[layerIndex] || { prob: 0, max: 0 };

  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  let y = layer.lineHeightPx;
  const top0 = layer.lineHeightPx * 0.85;
  const bot0 = layer.lineHeightPx * 0.15;

  while (y < height + layer.lineHeightPx) {
    const lineTop = y - top0;
    const lineBot = y + bot0;
    const segs = availableSegmentsAt(lineTop, lineBot - lineTop, obstacleBoxes);
    if (segs.length === 0) {
      y += layer.lineHeightPx;
      continue;
    }

    let advanced = false;
    for (let s = 0; s < segs.length; s += 1) {
      const seg = segs[s];
      const segWidth = seg.x1 - seg.x0 - 6;
      if (segWidth <= 0) continue;
      let range = layoutNextLineRange(layer.prepared, cursor, segWidth);
      if (range === null) {
        // Loop the text stream
        cursor = { segmentIndex: 0, graphemeIndex: 0 };
        range = layoutNextLineRange(layer.prepared, cursor, segWidth);
        if (range === null) break;
      }
      const line = materializeLineRange(layer.prepared, range);
      const drawX = seg.x0 + 3;
      ctx.fillText(line.text, drawX, y);
      cursor = range.end;
      advanced = true;

      // Register the rendered bbox as obstacle for subsequent layers.
      // Some bboxes are "soft" (can be slightly encroached on), seeded by
      // (layerIndex, lineY, segX) so it's stable across frames.
      const renderedWidth = Math.min(line.width || segWidth, segWidth);
      const r = hash01(layerIndex, Math.floor(y), Math.floor(drawX));
      const soft = r < softCfg.prob ? softCfg.max * (0.4 + r / softCfg.prob * 0.6) : 0;

      obstacleBoxes.push({
        x0: drawX - 2,
        y0: lineTop,
        x1: drawX + renderedWidth + 2,
        y1: lineBot,
        soft
      });
    }
    if (!advanced) break;
    y += layer.lineHeightPx;
  }
  ctx.restore();
}

function applySpring(deltaSeconds) {
  if (!obstacle.active) {
    // Fade the radius down when inactive
    obstacle.radius *= Math.pow(0.86, deltaSeconds * 60);
    if (obstacle.radius < 1) obstacle.radius = 0;
    return;
  }
  // Critically-damped spring toward target
  const dx = obstacle.targetX - obstacle.x;
  const dy = obstacle.targetY - obstacle.y;
  const ax = (obstacle.stiffness * dx - obstacle.damping * obstacle.vx) / obstacle.mass;
  const ay = (obstacle.stiffness * dy - obstacle.damping * obstacle.vy) / obstacle.mass;
  obstacle.vx += ax * deltaSeconds;
  obstacle.vy += ay * deltaSeconds;
  obstacle.x += obstacle.vx * deltaSeconds;
  obstacle.y += obstacle.vy * deltaSeconds;

  // Radius targets a value based on viewport
  const targetRadius = Math.min(width, height) * 0.085;
  obstacle.radius += (targetRadius - obstacle.radius) * Math.min(1, deltaSeconds * 6);
}

let start = performance.now();
let previousTime = 0;
function render(now) {
  const time = (now - start) / 1000;
  const deltaSeconds = Math.min(0.05, Math.max(0.001, time - previousTime));
  previousTime = time;

  applySpring(deltaSeconds);
  applyDrift(deltaSeconds);

  ctx.clearRect(0, 0, width, height);

  // Single mutable obstacle list — each filler layer pushes its own bboxes
  // so subsequent (smaller, drawn-on-top) layers avoid them.
  const obstacleBoxes = currentObstacles();

  // Draw filler layers from biggest (back) to smallest (front)
  for (let i = fillerLayers.length - 1; i >= 0; i -= 1) {
    drawFillerLayer(fillerLayers[i], i, obstacleBoxes);
  }

  // Heroes on top
  heroes.forEach(drawHero);

  requestAnimationFrame(render);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(1, Math.floor(rect.width));
  height = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildHeroes();
  buildFillerLayers();
}

window.addEventListener("resize", resize);

canvas.addEventListener("pointermove", event => {
  obstacle.targetX = event.clientX;
  obstacle.targetY = event.clientY;
  if (!obstacle.active) {
    // Snap on first activation, then spring
    obstacle.x = obstacle.targetX;
    obstacle.y = obstacle.targetY;
  }
  obstacle.active = true;
}, { passive: true });

canvas.addEventListener("pointerdown", event => {
  obstacle.targetX = event.clientX;
  obstacle.targetY = event.clientY;
  obstacle.x = obstacle.targetX;
  obstacle.y = obstacle.targetY;
  obstacle.active = true;
});

canvas.addEventListener("pointerleave", () => {
  obstacle.active = false;
});

canvas.addEventListener("pointercancel", () => {
  obstacle.active = false;
});

resize();
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    buildHeroes();
    buildFillerLayers();
    requestAnimationFrame(render);
  });
} else {
  requestAnimationFrame(render);
}
