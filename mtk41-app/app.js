/* МТК 41 «Скульптуры» — киоск-приложение на общем ядре.
 * Фаза 2 (PLAN-KIOSK.md): семь прежних прототипов становятся сценами одной
 * страницы. Открывать только по http — ES-модули из file:// не идут.
 *
 * Версия у импортов сцен обязательна и поднимается вместе с ?v= у app.js:
 * `<script src="./app.js?v=2">` обновит только сам app.js, а его
 * `import "./scenes/canon.js"` без версии браузер отдаст из кеша (README ядра). */
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js?v=2";

import { canonScene } from "./scenes/canon.js?v=2";

const app = createApp({
  appId: "mtk41",
  title: { ru: "МТК · 41", en: "MTK · 41", zh: "МТК · 41" },
  configUrl: "./kiosk.config.json",
  i18nUrl: "./i18n/",
});

/* Порядок регистрации = порядок стрелок навигации. */
app.registerScene(canonScene);

app.start();

/* Ручка для приёмки: KioskSelfTest.run(mtk41App) из консоли. */
window.mtk41App = app;
