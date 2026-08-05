/* ============================================================
 * BMK 38-42 · kiosk-core — ES-модульная обёртка (зона kiosk-core)
 *
 * Ядро написано классическим скриптом (window.KioskCore), чтобы работать
 * и без модулей — как hub.js и hint.js. Этот файл даёт тот же самый
 * экземпляр в виде именованных экспортов; дублирования кода нет.
 *
 *   import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js?v=1";
 *
 * ВЕРСИЮ ТЯНЕМ ИЗ АДРЕСА САМОЙ ОБЁРТКИ. Раньше здесь стоял статический
 * import "./kiosk-core.js" — без версии. Приложение поднимало ?v= у себя
 * и у CSS, а ядро браузер отдавал из кеша: обновление молча не доезжало
 * до киоска (поймано пилотом МТК 42 — работало 1.0.0 вместо 1.1.0).
 * Теперь kiosk-core.esm.js?v=7 загрузит ядро как kiosk-core.js?v=7:
 * версия поднимается в ОДНОМ месте и расходится по всей цепочке.
 * ============================================================ */
const here = new URL(import.meta.url);
/* Передаём метку до импорта: в модуле document.currentScript пуст, и сам
 * ядро свою запрошенную версию иначе не увидит. По ней оно предупредит,
 * если браузер отдал файл из кеша. */
window.__kioskCoreRequestedVersion = here.searchParams.get("v");
await import("./kiosk-core.js" + here.search);

const core = window.KioskCore;
if (!core) {
  throw new Error("[kiosk] kiosk-core.js не инициализировался — проверь путь импорта");
}

export const version = core.version;
export const DEFAULT_CONFIG = core.DEFAULT_CONFIG;
export const KioskApp = core.KioskApp;
export const util = core.util;
export const createApp = (opts) => core.createApp(opts);
export default core;
