/* МТК 39 «Имени Ленина» — киоск-приложение на общем ядре.
 * Семь прежних прототипов стали сценами одной страницы (фаза «тираж»,
 * PLAN-KIOSK.md). Открывать только по http — ES-модули из file:// не идут.
 *
 * Настройки сцен объявлены схемой в самих сценах (settings[] + applySettings):
 * ядро исполняет её само, моста больше не нужно. */
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js?v=1.23.1";

import { worldScene } from "./scenes/world.js?v=15";
import { unionScene } from "./scenes/union.js?v=15";
import { waveScene } from "./scenes/wave.js?v=15";
import { streetsScene } from "./scenes/streets.js?v=15";
import { catalogScene } from "./scenes/catalog.js?v=15";
import { statsScene } from "./scenes/stats.js?v=15";
import { globeScene } from "./scenes/globe.js?v=15";

const app = createApp({
  appId: "mtk39",
  title: { ru: "МТК · 39", en: "MTK · 39", zh: "МТК · 39" },
  configUrl: "./kiosk.config.json",
  i18nUrl: "./i18n/",
  // Метка кеша словарей — своя нумерация приложения. У файлов кита метка
  // другая и канонная: ровно версия ядра (COORDINATION → «Версионирование
  // кита»), ядро само сверяет её со своей и ругается на залипший кеш.
  i18nVersion: "15",
});

/* Порядок регистрации = порядок стрелок навигации: от общего к частному —
 * мир, Союз, столетие, форма улиц, картотека, цифры и, наконец, избранное
 * с фотографиями. */
app.registerScene(worldScene);
app.registerScene(unionScene);
app.registerScene(waveScene);
app.registerScene(streetsScene);
app.registerScene(catalogScene);
app.registerScene(statsScene);
app.registerScene(globeScene);

app.start();

/* Ручка для отладки и для приёмки из консоли (KioskSelfTest.run(mtk39App)). */
window.mtk39App = app;
