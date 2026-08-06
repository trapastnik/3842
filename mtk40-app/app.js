/* МТК 40 «Библиотека Ленина» — киоск-приложение на общем ядре.
 * Фаза 2 (PLAN-KIOSK.md): семь прежних прототипов становятся сценами одной
 * страницы. Открывать только по http — ES-модули из file:// не идут.
 *
 * Версию в ?v= поднимать СРАЗУ ВЕЗДЕ: у app.js, у импортов сцен И у импорта
 * shared.js внутри каждой сцены. Ядро пробрасывает версию только себе;
 * цепочка app → сцена → shared обрывается на первом же немодифицированном
 * звене, и правка не доезжает (README ядра, «?v=N не пробивает кеш»).
 * Проверено на себе: обёртка канвы жила в shared.js?v=1 и бралась из кеша,
 * хотя сцена и app уже были свежими.
 */
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js?v=1.9.2";

import { installChromeZones } from "./scenes/chrome-zones.js?v=30";
import { shelfScene } from "./scenes/shelf.js?v=30";
import { mirrorScene } from "./scenes/mirror.js?v=30";
import { timelineScene } from "./scenes/timeline.js?v=30";
import { catalogScene } from "./scenes/catalog.js?v=30";
import { volumeScene } from "./scenes/volume.js?v=30";
import { constellationScene } from "./scenes/constellation.js?v=30";
import { geographyScene } from "./scenes/geography.js?v=30";

const app = createApp({
  appId: "mtk40",
  title: { ru: "МТК · 40", en: "MTK · 40", zh: "МТК · 40" },
  configUrl: "./kiosk.config.json",
  i18nUrl: "./i18n/",
  /* Метка кеша словарей: у ?v= сцен своя цепочка, i18n ядро тянет само.
   * Поднимать при каждой правке i18n/*.json. */
  i18nVersion: "4",
});

/* Порядок регистрации = порядок стрелок навигации. */
app.registerScene(shelfScene);
app.registerScene(mirrorScene);
app.registerScene(timelineScene);
app.registerScene(catalogScene);
app.registerScene(constellationScene);
app.registerScene(geographyScene);
app.registerScene(volumeScene);

/* Настройки сцен объявлены декларативно в самих сценах (settings:[] +
 * applySettings). Ядро 1.5.0 исполняет схему само — мост пилота 42 здесь
 * не нужен. */

/* Реальные зоны хрома в CSS-переменные: ядерные --kiosk-safe-* дают только
 * отступ от кромки, а не место, занятое кнопками языков и навигацией. */
installChromeZones(app);

app.start();

/* Ручка для отладки и приёмочного стенда. */
window.mtk40App = app;
