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
await import("./kiosk-core.js" + here.search);

const core = window.KioskCore;
if (!core) {
  throw new Error("[kiosk] kiosk-core.js не инициализировался — проверь путь импорта");
}

/* СВЕРКА ВЕРСИЙ ЖИВЁТ ЗДЕСЬ, а не в ядре.
 *
 * Главный кейс залипшего кеша — свежая метка и СТАРОЕ тело ядра. Проверка
 * внутри ядра его не ловит по определению: у версий до 1.9.0 её просто
 * нет, и рассинхрон проходит молча. Обёртка же всегда свежая — её адрес
 * и несёт бампнутую метку, — поэтому сверять надо отсюда.
 *
 * Classic-путь (<script src="kiosk-core.js?v=...">) для СТАРЫХ ядер так
 * не закрыть: там некому сверять, кроме самого залипшего файла. Это
 * принципиальная дыра, она названа в README. */
const SEMVER = /^\d+\.\d+\.\d+$/;

function cmpSemver(a, b) {
  const pa = a.split("."), pb = b.split(".");
  for (let i = 0; i < 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

const requested = here.searchParams.get("v");
let mismatch = null;

if (!requested) {
  /* Метки нет вовсе — сверять не с чем, и залипание пройдёт молча.
   * README объявляет метку обязательной, значит и тишина здесь неуместна. */
  console.info("[kiosk] у kiosk-core.esm.js нет метки ?v= — сверка версий " +
    "отключена, залипший кеш ловиться не будет. Канон: версионировать кит " +
    "точной версией ядра (" + core.version + ").");
} else if (core.version && requested !== core.version) {
  if (!SEMVER.test(requested)) {
    /* Метка не в формате версии ядра (?v=182, ?v=2 — так помечены 38, 39
     * в main). Это нарушение канона версий, но НЕ признак залипшего
     * кеша: файлы могут быть свежайшими. Совет в консоль, журнал не
     * трогаем — иначе приёмка копила бы ложные записи на каждом старте. */
    console.info("[kiosk] метка ?v=" + requested + " не в формате версии ядра (" +
      core.version + "). Канон: версионировать кит точной версией ядра — " +
      "тогда залипший кеш ловится автоматически.");
  } else if (cmpSemver(requested, core.version) > 0) {
    /* Запрошено НОВЕЕ, чем работает, — вот это и есть залипший кеш. */
    mismatch = "запрошено ядро " + requested + ", а работает " + core.version +
      " — браузер отдал файл из кеша. Обнови ?v= у ВСЕХ файлов кита " +
      "(и у импортов сцен: версия точки входа их не пробивает).";
    console.warn("[kiosk] " + mismatch);
  } else {
    /* Запрошено СТАРЕЕ, чем работает: файл свежий, просто метку не
     * подняли после merge. Тоже совет, а не авария. */
    console.info("[kiosk] метка ?v=" + requested + " отстала от ядра " +
      core.version + " — подними её при следующем merge main.");
  }
}

/* ЖУРНАЛИРУЕМ ИЗ ОБЁРТКИ, а не из ядра.
 *
 * Ядро ≤1.9.0 переносить сообщение в журнал не умеет — метода там просто
 * нет, — а именно такие ядра и залипают. Раньше эта половина проверки
 * была мертва ровно для того парка, ради которого затевалась. Пишем сами:
 * формат журнала (localStorage["<appId>-kiosk-log"], кольцо записей
 * {at, level, msg, scene, v, sid}) стабилен с 1.2.0. */
function journal(appId, msg) {
  try {
    const key = appId + "-kiosk-log";
    /* Битый журнал ПЕРЕЗАПИСЫВАЕМ, а не молча теряем запись: так делает
     * core.log, и расхождение поведения было бы хуже самой порчи —
     * предупреждение о залипшем кеше пропадало бы именно там, где с
     * хранилищем уже что-то не так. */
    let list = [];
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) list = parsed;
    } catch (err) {
      list = [];
    }
    list.push({
      at: new Date().toISOString(),
      level: "warn",
      msg: msg,
      scene: null,
      v: core.version,
      sid: "PRELOAD",          /* до старта приложения метки запуска ещё нет */
    });
    localStorage.setItem(key, JSON.stringify(list.slice(-200)));
  } catch (err) {
    /* приватный режим или переполнение — журнал не критичен */
  }
}

export const version = core.version;
export const DEFAULT_CONFIG = core.DEFAULT_CONFIG;
export const KioskApp = core.KioskApp;
export const util = core.util;
export const createApp = (opts) => {
  if (mismatch && opts && opts.appId) journal(opts.appId, mismatch);
  return core.createApp(opts);
};
export default core;
