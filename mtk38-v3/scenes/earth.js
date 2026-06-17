// МТК 38 v3 · scenes/earth.js
// Географический глобус ПОД слоем имён: контуры стран (Natural Earth 110m) → equirectangular-
// текстура (латунные линии на графитовом «океане») → сфера. Своя группа → своя скорость вращения.
// Источник: ./geo/countries.geojson (вендорено локально). Без CDN.

export async function createEarth(THREE, {
  radius = 2.33,
  res = 4096,                       // ширина текстуры (H = res/2); 4K-чёткость
  url = './geo/countries.geojson',
  ocean = '#1b232b',                // графитовый «океан»
  line = 'rgba(214,189,124,0.85)',  // латунные контуры
  lineW = 2.2,
  glow = 0.7,
} = {}) {
  const data = await (await fetch(url)).json();
  const W = res, H = res / 2;
  const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = ocean; ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = line; ctx.lineWidth = lineW * (W / 4096);

  const proj = (lon, lat) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
  const drawRing = (ring) => {
    let px = null; ctx.beginPath();
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = proj(ring[i][0], ring[i][1]);
      // разрыв на антимеридиане (скачок >пол-ширины) → не тянуть линию через всю карту
      if (px === null || Math.abs(x - px) > W * 0.5) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      px = x;
    }
    ctx.stroke();
  };
  for (const f of data.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const ring of poly) drawRing(ring);
  }

  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: glow,
    roughness: 0.92, metalness: 0.0,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), mat);
  const group = new THREE.Group(); group.add(sphere);

  return {
    group, sphere, texture: tex, material: mat,
    setGlow: (v) => { mat.emissiveIntensity = v; },
    dispose: () => { tex.dispose(); mat.dispose(); sphere.geometry.dispose(); },
  };
}
