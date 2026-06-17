// МТК 38 v3 · engine/renderer.js
// Единый рендерер: WebGPU с автоматическим фоллбэком на WebGL2.
// Современный Three (ESM, r184) — только http (см. mtk38-handoff/START-v3.md).
// Все библиотеки вендорены локально (mtk38-v3/vendor/three), без рантайм-CDN.

import * as THREE from 'three';
import WebGPU from 'three/addons/capabilities/WebGPU.js';

const TONEMAP = {
  agx:     THREE.AgXToneMapping,
  aces:    THREE.ACESFilmicToneMapping,
  neutral: THREE.NeutralToneMapping,
  none:    THREE.NoToneMapping,
};

/**
 * Создаёт рендерер v3 с честным фоллбэком.
 * @returns {Promise<{THREE, renderer, backend:'WebGPU'|'WebGL2', webgpuAvailable:boolean}>}
 */
export async function createRenderer({
  canvas,
  antialias = true,
  forceWebGL = false,
  maxPixelRatio = 2,          // потолок DPR — бережём кадр на 4K
  tonemap = 'agx',            // кино-тонемап по умолчанию
  exposure = 1.0,
  clear = 0x20272d,           // графит-фон
} = {}) {
  // Решаем бэкенд. WebGPU.isAvailable() уже реально запросил адаптер при импорте модуля.
  let webgpuAvailable = false;
  if (!forceWebGL) {
    try { webgpuAvailable = !!WebGPU.isAvailable(); } catch (_) { webgpuAvailable = false; }
  }
  const useWebGL = forceWebGL || !webgpuAvailable;

  const renderer = new THREE.WebGPURenderer({ canvas, antialias, forceWebGL: useWebGL });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, maxPixelRatio));
  renderer.toneMapping = TONEMAP[tonemap] ?? THREE.AgXToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.setClearColor(clear, 1);

  // WebGPURenderer.init() — асинхронная инициализация бэкенда (адаптер/девайс).
  await renderer.init();

  // Определяем фактический бэкенд после init (на случай авто-фоллбэка внутри Three).
  const b = renderer.backend;
  const isGPU = !!(b && (b.isWebGPUBackend || /WebGPU/i.test(b?.constructor?.name || '')));
  const backend = isGPU ? 'WebGPU' : 'WebGL2';

  return { THREE, renderer, backend, webgpuAvailable };
}

/** Подгоняет рендерер и камеру под размер контейнера (вызывать на resize). */
export function fit(renderer, camera, el = renderer.domElement) {
  const w = el.clientWidth || globalThis.innerWidth;
  const h = el.clientHeight || globalThis.innerHeight;
  renderer.setSize(w, h, false);
  if (camera && camera.isPerspectiveCamera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  return { w, h };
}

export { THREE };
