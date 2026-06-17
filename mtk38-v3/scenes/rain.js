// МТК 38 v3 · scenes/rain.js
// «Дождь имён» наоборот — слова «Ленин» всплывают вверх (anti-gravity), как в v1,
// но на GPU-compute (TSL): десятки тысяч частиц. Логика v1: плавучесть, drag,
// отталкивание пальцем, 4 яруса размеров, respawn снизу, тоны paper/латунь/красный.
// Рендер: InstancedMesh + SpriteNodeMaterial, слово из атласа (1 draw call).
// Запись в storage — ТОЛЬКО целыми векторами (компонентный addAssign ненадёжен).

import { Fn, instancedArray, instanceIndex, uniform, uniformArray, float, vec2, vec3, vec4, texture, uv, If } from 'three/tsl';

export async function createRain(THREE, renderer, {
  atlas,
  count = 7000,
  bounds = { x: 26, y: 17, z: 11 },
  sizes = [0.42, 0.72, 1.2, 2.0],            // 4 яруса (высота слова, мир)
  tones = ['#F7F9EF', '#D2B773', '#A02128'], // paper, латунь, красный
} = {}) {
  const N = atlas.rects.length;
  const HX = bounds.x / 2, HY = bounds.y / 2, HZ = bounds.z / 2;

  // uniform-массивы из атласа/настроек (индексируются в шейдере)
  const rectArr = uniformArray(atlas.rects.map((r) => new THREE.Vector4(r.x, r.y, r.w, r.h)));
  const aspectArr = uniformArray(atlas.rects.map((r) => r.aspect));
  const sizeArr = uniformArray(sizes.slice());
  const toneArr = uniformArray(tones.map((c) => new THREE.Color(c)));

  const posBuf = instancedArray(count, 'vec3');
  const velBuf = instancedArray(count, 'vec3');
  const dataBuf = instancedArray(count, 'vec4');  // x=word, y=tier, z=tone, w=seed

  const hash = (k) => instanceIndex.toFloat().add(k).mul(0.013).sin().mul(43758.5453).fract();
  const riseFor = (tier, seed) => float(0.9).add(tier.mul(0.55)).add(seed.mul(0.8)); // крупнее → быстрее

  // — ИНИЦИАЛИЗАЦИЯ —
  const computeInit = Fn(() => {
    const r0 = hash(0.1), r1 = hash(1.3), r2 = hash(2.7), r3 = hash(3.9), r4 = hash(5.1), r5 = hash(6.3), r6 = hash(7.7);
    const wi = r0.mul(N).floor();
    const tier = r1.mul(r1).mul(4).floor().min(3);                 // смещение к мелким
    const tone = r2.lessThan(0.045).select(float(2), r2.lessThan(0.14).select(float(1), float(0)));
    dataBuf.element(instanceIndex).assign(vec4(wi, tier, tone, r5));
    posBuf.element(instanceIndex).assign(vec3(r3.sub(0.5).mul(HX * 2), r4.sub(0.5).mul(HY * 2), r6.sub(0.5).mul(HZ * 2)));
    velBuf.element(instanceIndex).assign(vec3(0, riseFor(tier, r5), 0));
  })().compute(count);
  await renderer.computeAsync(computeInit);

  // — ОБНОВЛЕНИЕ —
  const uDt = uniform(0), uBuoy = uniform(2.4), uDrag = uniform(0.6), uRepel = uniform(11.0);
  const uPointer = uniform(new THREE.Vector3(0, 0, 0)), uPointerR = uniform(0);
  const uTop = float(HY + 2.5), uBottom = float(-HY - 2.5);

  const computeUpdate = Fn(() => {
    const pos = posBuf.element(instanceIndex);
    const vel = velBuf.element(instanceIndex);
    const data = dataBuf.element(instanceIndex);
    const tier = data.y;
    const mass = float(0.5).add(tier.mul(0.7));

    // плавучесть вверх + базовый подъём, затем drag (целыми векторами)
    vel.addAssign(vec3(0, uBuoy.div(mass).add(0.6), 0).mul(uDt));
    vel.mulAssign(float(1).sub(uDrag.mul(uDt)).max(0.0));

    // отталкивание от пальца (обратно-дистанционное, в пределах радиуса)
    const toP = pos.sub(uPointer);
    const d = toP.length();
    If(uPointerR.greaterThan(0.0).and(d.lessThan(uPointerR)).and(d.greaterThan(0.001)), () => {
      const k = float(1).sub(d.div(uPointerR));
      vel.addAssign(toP.div(d).mul(uRepel.mul(k).mul(k).div(mass)).mul(uDt));
    });

    // интегрирование
    pos.addAssign(vel.mul(uDt));

    // respawn выше верха → вниз (x,z сохраняем), скорость заново
    If(pos.y.greaterThan(uTop), () => {
      pos.assign(vec3(pos.x, uBottom, pos.z));
      vel.assign(vec3(0, riseFor(tier, data.w), 0));
    });
    // горизонтальный wrap
    If(pos.x.greaterThan(float(HX + 2)), () => { pos.assign(vec3(pos.x.sub((HX + 2) * 2), pos.y, pos.z)); });
    If(pos.x.lessThan(float(-(HX + 2))), () => { pos.assign(vec3(pos.x.add((HX + 2) * 2), pos.y, pos.z)); });
  })().compute(count);

  // — РЕНДЕР — слово из атласа, размер по ярусу, тон умножением
  const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
  mat.positionNode = posBuf.element(instanceIndex);
  const data = dataBuf.element(instanceIndex);
  const wi = data.x.toInt();
  const size = sizeArr.element(data.y.toInt());
  const aspect = aspectArr.element(wi);
  mat.scaleNode = vec2(size.mul(aspect), size);
  const rect = rectArr.element(wi);
  const texel = texture(atlas.texture, rect.xy.add(uv().mul(rect.zw)));
  mat.colorNode = toneArr.element(data.z.toInt());
  mat.opacityNode = texel.a.mul(float(0.82).add(data.y.mul(0.06)));

  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, count);
  mesh.frustumCulled = false;

  return {
    mesh, count,
    params: { uBuoy, uDrag, uRepel },
    setPointer(v3, radius) { uPointer.value.copy(v3); uPointerR.value = radius; },
    update(dt) { uDt.value = dt; return renderer.computeAsync(computeUpdate); },
  };
}
