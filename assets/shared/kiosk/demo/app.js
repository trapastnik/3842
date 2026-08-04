/* Демо-приложение kiosk-core. Ровно то, что будет писать сессия МТК
 * в своём mtkXX-app/app.js: создать приложение, зарегистрировать сцены,
 * стартовать. Всё остальное — подложка, навигация, преролл, сплэш —
 * делает ядро.
 *
 * Открывать ТОЛЬКО по http (ES-модули не работают из file://). */
import { createApp } from "../kiosk-core.esm.js?v=23";

/* ?v= нужен и на импортах сцен: версия точки входа НЕ пробивает кеш её
 * импортов, и правка сцены иначе не доезжает до киоска. У ядра это
 * решено внутри обёртки, у ваших сцен — нет. */
import { pulseScene } from "./scenes/pulse.js?v=23";
import { gridScene } from "./scenes/grid.js?v=23";
import { cardsScene } from "./scenes/cards.js?v=23";

const app = createApp({
  appId: "kiosk-demo",
  title: { ru: "Демо ядра", en: "Core demo", zh: "内核演示" },
  configUrl: "./kiosk.config.json",
  i18nUrl: "./i18n/",
  i18nVersion: "23",   /* без метки Chrome держит старый словарь после обновления */
});

app.registerScene(pulseScene);
app.registerScene(gridScene);
app.registerScene(cardsScene);

app.start();

/* Ручка для отладки из консоли: window.demoApp.showScene("grid") и т.п. */
window.demoApp = app;
