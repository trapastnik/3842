// МТК 38 v3 · scenes/globe-rings.js
// Кольцевой глобус — структура v1 (mtk38-globe): слова на параллелях-широтах, лежат тангенциально
// на сфере, задняя полусфера отсекается (FrontSide). Но на движке: PBR-тело, кино-свет, bloom-готовые
// светящиеся глифы. Возвращает group (слова + тело) для вращения + список инстансов для raycast.

import { makeWordTexture } from '../engine/text.js';

const PAPER = '#F7F9EF', BRASS = '#D2B773', RED = '#A02128';

export function createGlobe(THREE, { words, radius = 2.5, maxInstances = 760, density = 1.0 } = {}) {
  const group = new THREE.Group();
  const colorFor = (wd) => wd.id === 'rus' ? RED : wd.pr ? BRASS : PAPER;

  // одна текстура / геометрия / материал на слово — переиспользуются всеми инстансами
  const tex = words.map((wd) => makeWordTexture(THREE, { text: wd.w, script: wd.sc, color: colorFor(wd) }));
  const baseH = radius * 0.082;
  const geo = tex.map((t) => new THREE.PlaneGeometry(baseH * t.aspect, baseH));
  const mat = tex.map((t) => new THREE.MeshBasicMaterial({
    map: t.texture, transparent: true, depthWrite: false, side: THREE.FrontSide,
    toneMapped: true,
  }));

  const m4 = new THREE.Matrix4();
  const scl = new THREE.Vector3();
  const n = new THREE.Vector3(), e = new THREE.Vector3(), u = new THREE.Vector3(), pos = new THREE.Vector3();
  const rnd = () => Math.random();

  // ПАСС 1 — матрицы размещений, сгруппированные по слову. Раскладка БЕЗ НАЛЕГАНИЯ:
  //  · вертикаль — ряды-параллели с шагом ≥ макс. высоты слова (соседние ряды не пересекаются);
  //  · горизонталь — слова по дуге через их фактическую ширину + зазор (в ряду не пересекаются);
  //  · джиттера по широте НЕТ (он давал налегание); мягкая вариация размера + кирпичный сдвиг рядов.
  const byWord = words.map(() => []);          // wi → [Matrix4, …]
  let total = 0;
  const SC_MIN = 0.9, SC_MAX = 1.12;
  const rowH = baseH * SC_MAX * 1.03;          // вертикальный шаг ряда
  const dLat = rowH / radius;                  // радиан между рядами
  let ri = 0;
  for (let lat = -Math.PI / 2 + dLat; lat < Math.PI / 2 - dLat * 0.5 && total < maxInstances; lat += dLat, ri++) {
    const cosL = Math.cos(lat), sinL = Math.sin(lat);
    const rr = cosL * radius;
    if (rr < 0.16) continue;
    const circ = 2 * Math.PI * rr;
    const theta0 = ri * 0.7 + (ri % 2) * 0.5;  // сдвиг чёт/нечёт рядов → кирпичная кладка, не решётка
    let arc = 0, k = ri * 5;
    while (total < maxInstances) {
      const wi = ((k % words.length) + words.length) % words.length;
      const t = tex[wi];
      const sc = SC_MIN + rnd() * (SC_MAX - SC_MIN);
      const ww = baseH * sc * t.aspect;
      const gap = ww * 0.16 + baseH * 0.05;    // зазор по горизонтали
      if (arc + ww + gap > circ) break;         // не замыкать кольцо внахлёст со стартом
      const th = theta0 + (arc + ww * 0.5) / rr;
      pos.set(cosL * Math.cos(th) * radius, sinL * radius, cosL * Math.sin(th) * radius);
      n.copy(pos).normalize();
      e.set(Math.sin(th), 0, -Math.cos(th)).normalize();  // текст читается снаружи
      u.crossVectors(n, e).normalize();
      m4.makeBasis(e, u, n);                    // поворот (касательный базис)
      m4.scale(scl.set(sc, sc, sc));            // + масштаб
      m4.setPosition(pos);                      // + позиция → полная TRS
      byWord[wi].push(m4.clone());
      total++;
      arc += ww + gap;
      k++;
    }
  }

  // ПАСС 2 — один InstancedMesh на слово → ~52 draw call вместо сотен.
  // back-cull (FrontSide) и тонемап работают как и с обычными mesh'ами.
  const meshes = [];
  byWord.forEach((mats, wi) => {
    if (!mats.length) return;
    const im = new THREE.InstancedMesh(geo[wi], mat[wi], mats.length);
    for (let i = 0; i < mats.length; i++) im.setMatrixAt(i, mats[i]);
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    im.userData.wi = wi;                        // для будущего raycast → карточка Р2
    group.add(im);
    meshes.push(im);
  });

  // тело глобуса — тёмная сфера-окклюдер (даёт силуэт + свет лепит форму)
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.965, 96, 64),
    // dithering: true — дробит 8-битный бандинг в плавном тёмном градиенте сферы
    new THREE.MeshStandardMaterial({ color: 0x252c33, roughness: 0.83, metalness: 0.16, dithering: true })
  );
  body.renderOrder = -1;
  group.add(body);

  return {
    group, body, meshes, textures: tex,
    count: total,        // всего размещений «Ленин» (для монитора)
    drawWords: meshes.length,  // сколько draw call съедают слова (= число уникальных слов на сфере)
    dispose() {
      geo.forEach((g) => g.dispose());
      mat.forEach((m) => m.dispose());
      tex.forEach((t) => t.texture.dispose());
      meshes.forEach((m) => m.dispose());
      body.geometry.dispose(); body.material.dispose();
    },
  };
}
