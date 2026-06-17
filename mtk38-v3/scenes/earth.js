// МТК 38 v3 · scenes/earth.js
// Географический глобус ПОД слоем имён. Три варианта карты (переключаются на лету):
//   · 'countries' — контуры стран (Natural Earth 110m vector) латунью на графите;
//   · 'relief'    — grayscale рельеф (горы), тонированный в бренд (тёмный океан → латунь);
//   · 'physical'  — natural-color физическая карта (моря/материки/льды).
// Опц. оверлей границ стран поверх растровых режимов. Своя группа → своя скорость вращения.
// Источники локальные (без CDN): geo/countries.geojson + assets/mtk38/textures/earth-*.jpg.

export async function createEarth(THREE, {
  radius = 2.33,
  res = 4096,
  geoUrl = './geo/countries.geojson',
  reliefUrl = '../assets/mtk38/textures/earth-relief.jpg',
  physicalUrl = '../assets/mtk38/textures/earth-physical.jpg',
  ocean = '#1b232b',
  line = 'rgba(214,189,124,0.85)',
  lineW = 2.2,
  glow = 0.7,
  mode = 'countries',
  borders = false,
} = {}) {
  const data = await (await fetch(geoUrl)).json();
  const loadImg = (url) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; });
  let reliefImg = null, physicalImg = null;
  try { reliefImg = await loadImg(reliefUrl); } catch (e) { console.warn('[relief tex off]', e); }
  try { physicalImg = await loadImg(physicalUrl); } catch (e) { console.warn('[physical tex off]', e); }

  const W = res, H = res / 2;
  const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H;
  const ctx = cnv.getContext('2d');
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.05 });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), mat);
  const group = new THREE.Group(); group.add(sphere);

  const proj = (lon, lat) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
  function strokeBorders() {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = line; ctx.lineWidth = lineW * (W / 4096);
    for (const f of data.features) {
      const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const poly of polys) for (const ring of poly) {
        let px = null; ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const [x, y] = proj(ring[i][0], ring[i][1]);
          if (px === null || Math.abs(x - px) > W * 0.5) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          px = x;
        }
        ctx.stroke();
      }
    }
  }

  function render(m, b) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    if (m === 'physical' && physicalImg) {
      ctx.drawImage(physicalImg, 0, 0, W, H);
      mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = tex; mat.emissiveIntensity = 0.22;
    } else if (m === 'relief' && reliefImg) {
      ctx.drawImage(reliefImg, 0, 0, W, H);              // grayscale высоты
      ctx.globalCompositeOperation = 'multiply';          // ярко(горы)→латунь, тёмно(океан)→тёмное
      ctx.fillStyle = '#D2B773'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighten';           // приподнять океан до графита
      ctx.fillStyle = ocean; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = tex; mat.emissiveIntensity = glow * 0.5;
    } else {
      ctx.fillStyle = ocean; ctx.fillRect(0, 0, W, H);    // 'countries'
      strokeBorders();
      mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = tex; mat.emissiveIntensity = glow;
    }
    if (b && m !== 'countries') strokeBorders();           // оверлей границ на растровых режимах
    tex.needsUpdate = true; mat.needsUpdate = true;
  }
  render(mode, borders);

  return {
    group, sphere, texture: tex, material: mat,
    hasRelief: !!reliefImg, hasPhysical: !!physicalImg,
    setGlow: (v) => { mat.emissiveIntensity = v; },
    setMode: (m, b) => render(m, b),
    dispose: () => { tex.dispose(); mat.dispose(); sphere.geometry.dispose(); },
  };
}
