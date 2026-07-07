// МТК 38 v3 · engine/text.js
// Глиф слова «Ленин» → canvas-текстура, резко под 4K. Бренд-стек + Noto-fallback (31 письменность).
// Латиница/кириллица → 20 Kopeek; иначе → Arial Unicode MS / noto-<ISO15924>.

const FAM = (sc) => (sc === 'Latn' || sc === 'Cyrl')
  ? `'20 Kopeek','Arial Unicode MS',sans-serif`
  : `'Arial Unicode MS','noto-${sc}',sans-serif`;

let _meas;
function measureCtx() {
  if (!_meas) _meas = document.createElement('canvas').getContext('2d');
  return _meas;
}

/**
 * @returns {{texture, aspect:number, W:number, H:number}}
 */
export function makeWordTexture(THREE, { text, script, color = '#F7F9EF', weight = 600, res = 232, glow = 0.07 }) {
  const fam = FAM(script);
  const wt = (script === 'Latn' || script === 'Cyrl') ? weight : 400;
  const mc = measureCtx();
  mc.font = `${wt} ${res}px ${fam}`;
  mc.textAlign = 'left';
  mc.textBaseline = 'alphabetic';
  const m = mc.measureText(text);
  // РАЗМЕР ПО ФАКТИЧЕСКИМ ГРАНИЦАМ ГЛИФА (actualBoundingBox), НЕ по кеглю —
  // тибетское/индийские/арабское вылезают за em-box; по res резало бы выносные.
  const ascent  = m.actualBoundingBoxAscent  ?? res * 0.80;
  const descent = m.actualBoundingBoxDescent ?? res * 0.22;
  const left    = m.actualBoundingBoxLeft    ?? 0;
  const right   = m.actualBoundingBoxRight   ?? m.width;
  const gw = Math.max(1, right + left);     // фактическая ширина с боковыми вылетами
  const gh = Math.max(1, ascent + descent); // фактическая высота с над/подстрочными
  const padX = res * 0.12, padY = res * 0.09 + res * glow;  // тугие поля (+запас под свечение)

  const W = Math.ceil(gw + padX * 2), H = Math.ceil(gh + padY * 2);
  const cnv = document.createElement('canvas');
  cnv.width = W; cnv.height = H;
  const ctx = cnv.getContext('2d');
  ctx.font = `${wt} ${res}px ${fam}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const bx = padX + left;     // x базовой линии с учётом левого вылета
  const by = padY + ascent;   // y базовой линии с учётом верхнего вылета
  // мягкое свечение под bloom + чёткое ядро вторым проходом
  ctx.shadowColor = color;
  ctx.shadowBlur = res * glow;
  ctx.fillStyle = color;
  ctx.fillText(text, bx, by);
  ctx.shadowBlur = 0;
  ctx.fillText(text, bx, by);

  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return { texture: tex, aspect: W / H, W, H };
}
