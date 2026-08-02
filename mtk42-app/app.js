/* МТК 42 «Осмысление наследия» — киоск-приложение на общем ядре.
 * Пилот фазы 1 (PLAN-KIOSK.md): четыре прежних прототипа стали сценами
 * одной страницы. Открывать только по http — ES-модули из file:// не идут. */
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js";

import { pendulumScene } from "./scenes/pendulum.js";
import { archiveScene } from "./scenes/archive.js";
import { timelineScene } from "./scenes/timeline.js";
import { mapScene } from "./scenes/map.js";

const app = createApp({
  appId: "mtk42",
  title: { ru: "МТК · 42", en: "MTK · 42", zh: "МТК · 42" },
  configUrl: "./kiosk.config.json",
  i18nUrl: "./i18n/",
});

/* Порядок регистрации = порядок стрелок навигации. */
app.registerScene(pendulumScene);
app.registerScene(archiveScene);
app.registerScene(timelineScene);
app.registerScene(mapScene);

/* Операторские настройки сцен. Подписи здесь русские намеренно: панель
 * сидит за гейтом ?service=1 и посетителю не показывается. */
app.addSettings("Маятник", [
  { type: "range", path: "pendulum.dotSize", label: "Размер точек", min: 64, max: 200, step: 8, unit: " px" },
  { type: "toggle", path: "pendulum.showPendulum", label: "Кривая маятника" },
]);

app.addSettings("Институции", [
  { type: "range", path: "museums.dotRadius", label: "Размер точек на карте", min: 6, max: 24, step: 1, unit: " px" },
  { type: "toggle", path: "museums.showCities", label: "Названия городов" },
]);

app.start();

/* Ручка для отладки и для аудита переключений из консоли. */
window.mtk42App = app;
