/* МТК 42 «Осмысление наследия» — киоск-приложение на общем ядре.
 * Пилот фазы 1 (PLAN-KIOSK.md): четыре прежних прототипа стали сценами
 * одной страницы. Открывать только по http — ES-модули из file:// не идут. */
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js";

import { pendulumScene } from "./scenes/pendulum.js?v=6";
import { archiveScene } from "./scenes/archive.js?v=6";
import { timelineScene } from "./scenes/timeline.js?v=6";
import { mapScene } from "./scenes/map.js?v=6";

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
  { type: "range", path: "pendulum.dotSize", label: "Размер портрета", min: 64, max: 200, step: 8, unit: " px" },
  { type: "range", path: "pendulum.pxPerYear", label: "Расстояние по высоте (px на год)", min: 18, max: 90, step: 2, unit: " px" },
  { type: "range", path: "pendulum.minGap", label: "Расстояние по ширине", min: 0, max: 220, step: 4, unit: " px" },
  { type: "toggle", path: "pendulum.showPendulum", label: "Кривая маятника" },
]);

app.addSettings("Картотека", [
  { type: "range", path: "archive.gapX", label: "Расстояние по ширине", min: 8, max: 96, step: 4, unit: " px" },
  { type: "range", path: "archive.gapY", label: "Расстояние по высоте", min: 8, max: 96, step: 4, unit: " px" },
]);

app.addSettings("Портреты", [
  { type: "toggle", path: "photos.color", label: "Цвет фото" },
  { type: "toggle", path: "photos.a11yColor",
    label: "Цвет фото в режиме слабовидящих" },
]);

app.addSettings("Институции", [
  { type: "range", path: "museums.dotRadius", label: "Размер точек на карте", min: 6, max: 24, step: 1, unit: " px" },
  { type: "toggle", path: "museums.showCities", label: "Названия городов" },
]);

/* Монохром — базовый вид экспозиции, но это кураторское решение, а не
 * техническое: оба флага возвращают снимкам исходный цвет — отдельно для
 * обычного режима и для режима слабовидящих. По умолчанию оба выключены. */
function applyPhotoColor() {
  const root = document.documentElement;
  root.classList.toggle("m42-photo-color", app.getSetting("photos.color") === true);
  root.classList.toggle("m42-a11y-color", app.getSetting("photos.a11yColor") === true);
}
app.on("started", applyPhotoColor);

/* Правка настройки из сервис-панели должна сразу видеться на сцене. */
app.on("setting", ({ path }) => {
  const id = path.split(".")[0];
  if (id === "photos") return applyPhotoColor();
  const map = { pendulum: "pendulum", archive: "archive", museums: null };
  if (id === "museums") {
    ["timeline", "map"].forEach((sid) => {
      const sc = app.getScene(sid);
      if (sc && sc.applySettings) sc.applySettings();
    });
    return;
  }
  const sc = map[id] && app.getScene(map[id]);
  if (sc && sc.applySettings) sc.applySettings();
});

app.start();

/* Ручка для отладки и для аудита переключений из консоли. */
window.mtk42App = app;
