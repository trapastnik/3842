/* ============================================================
 * BMK 38-42 · kiosk-core — ES-модульная обёртка (зона kiosk-core)
 *
 * Ядро написано классическим скриптом (window.KioskCore), чтобы работать
 * и без модулей — как hub.js и hint.js. Этот файл даёт тот же самый
 * экземпляр в виде именованных экспортов; дублирования кода нет.
 *
 *   import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js";
 *
 * Импорт классического файла из модуля легален: он ничего не ждёт от
 * контекста, только присваивает window.KioskCore.
 * ============================================================ */
import "./kiosk-core.js";

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
