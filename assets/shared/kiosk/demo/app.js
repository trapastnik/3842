/* Демо-приложение kiosk-core. Ровно то, что будет писать сессия МТК
 * в своём mtkXX-app/app.js: создать приложение, зарегистрировать сцены,
 * стартовать. Всё остальное — подложка, навигация, преролл, сплэш —
 * делает ядро.
 *
 * Открывать ТОЛЬКО по http (ES-модули не работают из file://). */
import { createApp } from "../kiosk-core.esm.js?v=1.9.3";

/* ?v= нужен и на импортах сцен: версия точки входа НЕ пробивает кеш её
 * импортов, и правка сцены иначе не доезжает до киоска. У ядра это
 * решено внутри обёртки, у ваших сцен — нет. */
import { pulseScene } from "./scenes/pulse.js?v=1.9.3";
import { gridScene } from "./scenes/grid.js?v=1.9.3";
import { cardsScene } from "./scenes/cards.js?v=1.9.3";

/* Регрессия миграции: ?legacy=1 поднимает демо на конфиге формата 1.6.0
 * (состав экранов в scenes.order/enabled). Ядро обязано перенести его в
 * screens, не тронув правки оператора. Раньше фикстура просто лежала в
 * папке и прогонялась только руками — то есть не прогонялась. */
const legacy = /[?&]legacy=1\b/.test(location.search);

const app = createApp({
  appId: legacy ? "kiosk-demo-legacy" : "kiosk-demo",
  title: { ru: "Демо ядра", en: "Core demo", zh: "内核演示" },
  configUrl: legacy ? "./legacy-1.6.config.json" : "./kiosk.config.json",
  i18nUrl: "./i18n/",
  i18nVersion: "1.9.3",   /* без метки Chrome держит старый словарь после обновления */
});

app.registerScene(pulseScene);
app.registerScene(gridScene);
app.registerScene(cardsScene);

app.start();

/* Ручка для отладки из консоли: window.demoApp.showScene("grid") и т.п. */
window.demoApp = app;
