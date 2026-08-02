/* Демо-приложение kiosk-core. Ровно то, что будет писать сессия МТК
 * в своём mtkXX-app/app.js: создать приложение, зарегистрировать сцены,
 * стартовать. Всё остальное — подложка, навигация, преролл, сплэш —
 * делает ядро.
 *
 * Открывать ТОЛЬКО по http (ES-модули не работают из file://). */
import { createApp } from "../kiosk-core.esm.js";

import { pulseScene } from "./scenes/pulse.js";
import { gridScene } from "./scenes/grid.js";
import { cardsScene } from "./scenes/cards.js";

const app = createApp({
  appId: "kiosk-demo",
  title: { ru: "Демо ядра", en: "Core demo", zh: "内核演示" },
  configUrl: "./kiosk.config.json",
});

app.registerScene(pulseScene);
app.registerScene(gridScene);
app.registerScene(cardsScene);

app.start();

/* Ручка для отладки из консоли: window.demoApp.showScene("grid") и т.п. */
window.demoApp = app;
