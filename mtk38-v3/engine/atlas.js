// МТК 38 v3 · engine/atlas.js
// Атлас глифов для GPU-частиц (1 draw call). КАЖДОЕ слово рисуется по СВОИМ фактическим
// границам чернил (actualBoundingBox + поля) и пакуется полками — НИКАКОГО фикс. кегля/
// ячеек со скейлом. Так выносные элементы сложных письменностей (тибетское/индийские/
// арабское/лаосское/кхмерское/…) НЕ обрезаются. Белые глифы (тон задаётся в шейдере).
// Источник слов и шрифт-стек идентичны globe (engine/data.js → data/mtk38.json + text.js FAM).

const FAM = (sc) => (sc === 'Latn' || sc === 'Cyrl')
  ? `'20 Kopeek','Arial Unicode MS',sans-serif`
  : `'Arial Unicode MS','noto-${sc}',sans-serif`;

/**
 * @returns {{texture, rects:Array<{x,y,w,h,aspect}>, W, H, count}}
 *   rects[i] — нормализованный UV-rect плотной рамки слова i (по чернилам + поля) + аспект.
 */
export function makeWordAtlas(THREE, words, { fontPx = 170, pad = 12, maxW = 4096 } = {}) {
  const meas = document.createElement('canvas').getContext('2d');

  // 1) измерить каждое слово ПО ФАКТИЧЕСКИМ ГРАНИЦАМ (actualBoundingBox), не по кеглю
  const boxes = words.map((wd) => {
    const wt = (wd.sc === 'Latn' || wd.sc === 'Cyrl') ? 600 : 400;
    const fam = FAM(wd.sc);
    meas.font = `${wt} ${fontPx}px ${fam}`;
    meas.textAlign = 'left'; meas.textBaseline = 'alphabetic';
    const m = meas.measureText(wd.w);
    const left = m.actualBoundingBoxLeft ?? 0;
    const right = m.actualBoundingBoxRight ?? m.width;
    const asc = m.actualBoundingBoxAscent ?? fontPx * 0.82;   // реальный верхний вынос
    const desc = m.actualBoundingBoxDescent ?? fontPx * 0.22; // реальный нижний вынос
    const gw = Math.max(1, left + right), gh = Math.max(1, asc + desc);
    return { wd, wt, fam, left, asc, w: Math.ceil(gw) + pad * 2, h: Math.ceil(gh) + pad * 2 };
  });

  // 2) упаковка полками (shelf packing) в ширину maxW
  let x = 0, y = 0, rowH = 0;
  for (const b of boxes) {
    if (x + b.w > maxW && x > 0) { x = 0; y += rowH; rowH = 0; }
    b.x = x; b.y = y; x += b.w; rowH = Math.max(rowH, b.h);
  }
  const W = maxW, H = y + rowH;

  // 3) отрисовка белым + плотные UV-rect (глиф ровно в своей рамке с полем pad → не режется)
  const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  const rects = boxes.map((b) => {
    ctx.font = `${b.wt} ${fontPx}px ${b.fam}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(b.wd.w, b.x + pad + b.left, b.y + pad + b.asc);
    return { x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H, aspect: b.w / b.h };
  });

  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return { texture: tex, rects, W, H, count: words.length };
}
