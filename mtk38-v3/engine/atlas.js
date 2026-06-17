// МТК 38 v3 · engine/atlas.js
// Упаковка всех слов «Ленин» в ОДИН атлас-текстуру (для GPU-частиц: 1 draw call).
// Глифы — БЕЛЫЕ (тон задаётся в шейдере умножением на цвет). Размер ячейки по фактическим
// границам глифа (actualBoundingBox), хранится плотный UV-rect + аспект каждого слова.

const FAM = (sc) => (sc === 'Latn' || sc === 'Cyrl')
  ? `'20 Kopeek','Arial Unicode MS',sans-serif`
  : `'Arial Unicode MS','noto-${sc}',sans-serif`;

/**
 * @returns {{texture, rects:Array<{x,y,w,h,aspect}>, W:number, H:number, cols:number, rows:number}}
 *   rects[i] — нормализованный UV-прямоугольник плотной рамки слова i + его аспект (w/h).
 */
export function makeWordAtlas(THREE, words, { cols = 8, cell = 320, pad = 0.10, glow = 0.05 } = {}) {
  const n = words.length;
  const rows = Math.ceil(n / cols);
  const cellW = Math.round(cell * 2.0);     // ячейки шире, чем выше (слова широкие)
  const cellH = cell;
  const W = cols * cellW, H = rows * cellH;
  const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H;
  const ctx = cnv.getContext('2d');

  const rects = new Array(n);
  for (let i = 0; i < n; i++) {
    const wd = words[i];
    const col = i % cols, row = Math.floor(i / cols);
    const ox = col * cellW, oy = row * cellH;
    const fam = FAM(wd.sc);
    const wt = (wd.sc === 'Latn' || wd.sc === 'Cyrl') ? 600 : 400;

    // подобрать кегль так, чтобы глиф влез в ячейку с полями
    let fs = cellH * 0.7;
    ctx.font = `${wt} ${fs}px ${fam}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let m = ctx.measureText(wd.w);
    let gw = (m.actualBoundingBoxLeft ?? 0) + (m.actualBoundingBoxRight ?? m.width);
    let gh = (m.actualBoundingBoxAscent ?? fs * 0.8) + (m.actualBoundingBoxDescent ?? fs * 0.2);
    const fit = Math.min((cellW * (1 - pad * 2)) / gw, (cellH * (1 - pad * 2)) / gh, 1);
    fs *= fit;

    ctx.font = `${wt} ${fs}px ${fam}`;
    m = ctx.measureText(wd.w);
    const left = m.actualBoundingBoxLeft ?? 0;
    const right = m.actualBoundingBoxRight ?? m.width;
    const asc = m.actualBoundingBoxAscent ?? fs * 0.8;
    const desc = m.actualBoundingBoxDescent ?? fs * 0.2;
    const dw = Math.max(1, left + right), dh = Math.max(1, asc + desc);

    // позиция базовой линии: центрируем плотную рамку в ячейке
    const bx = ox + (cellW - dw) / 2 + left;
    const by = oy + (cellH - dh) / 2 + asc;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = fs * glow;
    ctx.fillText(wd.w, bx, by);

    // плотный UV-rect (+ небольшой запас под свечение)
    const padPx = fs * glow * 1.2;
    const rx = ox + (cellW - dw) / 2 - padPx;
    const ry = oy + (cellH - dh) / 2 - padPx;
    const rw = dw + padPx * 2, rh = dh + padPx * 2;
    rects[i] = { x: rx / W, y: ry / H, w: rw / W, h: rh / H, aspect: rw / rh };
  }

  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return { texture: tex, rects, W, H, cols, rows };
}
