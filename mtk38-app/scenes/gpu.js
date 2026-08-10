/* МТК 38 · общий WebGPU-рендерер для сцен «Глобус» и «Дождь».
 *
 * Рендерер и канвас ОДИН на приложение и живут всё время работы киоска.
 * Причина простая: WebGPURenderer.init() запрашивает адаптер и девайс, а киоск
 * за смену переключает сцены сотни раз (одно только standby-чередование — раз
 * в 25 с). Создавать девайс на каждый mount — гарантированная утечка контекстов
 * к вечеру. Сцены переносят общий канвас к себе в слой и отдают обратно.
 *
 * Three грузится ЛЕНИВО, из dynamic import: карта и каталог — Canvas 2D, и
 * платить 5 МБ вендора за старт киоска, который открывается на глобусе, но
 * может простоять смену на каталоге, незачем. Импорт-карта — в index.html.
 */
import { GPU_MAX_PIXELS } from "./shared.js?v=28";

let _boot = null;

export function ensureGPU() {
  if (!_boot) _boot = boot();
  return _boot;
}

async function boot() {
  const [THREE, TSL, rendererMod] = await Promise.all([
    import("three"),
    import("three/tsl"),
    import("../../mtk38-v3/engine/renderer.js"),
  ]);
  const canvas = document.createElement("canvas");
  canvas.className = "m38-canvas";
  const { renderer, backend, webgpuAvailable } = await rendererMod.createRenderer({
    canvas, tonemap: "neutral", exposure: 1.0, clear: 0x12161a,
  });
  return { THREE, TSL, renderer, canvas, backend, webgpuAvailable };
}

/* Пост-эффекты подключаются по одному, каждый в своём try: на WebGL2-фоллбэке
 * часть TSL-нод отсутствует, и падение одного эффекта не должно гасить сцену. */
export async function loadPostNodes() {
  const [bloomMod, dofMod, caMod] = await Promise.all([
    import("three/addons/tsl/display/BloomNode.js").catch(() => null),
    import("three/addons/tsl/display/DepthOfFieldNode.js").catch(() => null),
    import("three/addons/tsl/display/ChromaticAberrationNode.js").catch(() => null),
  ]);
  return {
    bloom: bloomMod && bloomMod.bloom,
    dof: dofMod && dofMod.dof,
    ca: caMod && caMod.chromaticAberration,
  };
}

/* Размер по КОНТЕЙНЕРУ, а не по window: сцена живёт в слое ядра, у которого
 * снизу навигация. И жёсткий кап буфера — блокер 4K-смоука: на 3840×2160 при
 * dpr=2 выходило 33 Мп, кадр проваливался. Выше 8.3 Мп режем dpr. */
export function fitTo(renderer, camera, el, maxPixels = GPU_MAX_PIXELS) {
  const r = el.getBoundingClientRect();
  /* ВНИЗ, а не к ближайшему: бокс приходит дробным (3840.4 × 2160.2 на киоске),
   * и округление вверх давало буфер 3841×2161 — 8.30 Мп при потолке 8.3, то
   * есть провал бюджета на ровном месте. Поймано selftest'ом только на окне
   * 3840×2160: на стенде 1280×720 запас прятал грань. */
  const w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
  const raw = Math.min(globalThis.devicePixelRatio || 1, 2);
  /* БЕЗ пола в единицу. Он тут и стоял, и из-за него бюджет не работал: на
   * боксе 4200×2400 dpr оставался 1 и буфер выходил 10.08 Мп при потолке 8.3.
   * Ниже единицы масштаб — законный ответ на слишком большой бокс. */
  const dpr = w * h * raw * raw <= maxPixels ? raw : Math.sqrt(maxPixels / (w * h));
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, true);
  if (camera && camera.isPerspectiveCamera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  return { w, h, dpr };
}

/* Общий канвас переезжает в слой активной сцены.
 *
 * Звать нужно не только в mount, но и в resume: ядро держит сцены смонтированными
 * (keepAlive), поэтому при возврате на сцену mount уже не повторится, а канвас
 * к тому времени уехал к соседке — без этого зритель увидит чёрный экран. */
export function attachCanvas(gpu, host) {
  if (!gpu || !host || gpu.canvas.parentNode === host) return false;
  host.insertBefore(gpu.canvas, host.firstChild);
  return true;
}

export function detachCanvas(gpu) {
  if (gpu && gpu.canvas && gpu.canvas.parentNode) gpu.canvas.remove();
}
