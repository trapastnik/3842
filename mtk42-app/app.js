/* МТК 42 «Осмысление наследия» — киоск-приложение на общем ядре.
 * Пилот фазы 1 (PLAN-KIOSK.md): четыре прежних прототипа стали сценами
 * одной страницы. Открывать только по http — ES-модули из file:// не идут. */
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js";
import { installChromeZones } from "./scenes/chrome-zones.js?v=14";

import { pendulumScene } from "./scenes/pendulum.js?v=13";
import { archiveScene } from "./scenes/archive.js?v=13";
import { timelineScene } from "./scenes/timeline.js?v=13";
import { mapScene } from "./scenes/map.js?v=13";

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

/* Настройки сцен объявлены в самих сценах (`settings:[...]` +
 * `applySettings(values)`). С ядра 1.5.0 их разворачивает само ядро:
 * группирует в сервис-панели, сеет дефолты в config.scenes[id] и отдаёт
 * значения сцене. Временный settings-bridge.js снят. */

/* Реальные зоны хрома в CSS-переменные: ядро отдаёт только отступ от
 * кромки, а кнопки языков занимают заметно больше. Заявка на экспорт
 * зон из ядра — в COORDINATION; до неё меряем сами. */
installChromeZones(app);

/* Общеприкладная настройка, не принадлежащая ни одной сцене. */
app.addSettings("Портреты", [
  { type: "toggle", path: "photos.color", label: "Цвет фото" },
  { type: "toggle", path: "photos.a11yColor",
    label: "Цвет фото в режиме слабовидящих" },
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
app.on("setting", ({ path }) => {
  if (path.split(".")[0] === "photos") applyPhotoColor();
});

app.start();

/* Ручка для отладки и для аудита переключений из консоли. */
window.mtk42App = app;
