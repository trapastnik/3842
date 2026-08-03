/* МТК 42 «Осмысление наследия» — киоск-приложение на общем ядре.
 * Пилот фазы 1 (PLAN-KIOSK.md): четыре прежних прототипа стали сценами
 * одной страницы. Открывать только по http — ES-модули из file:// не идут. */
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js";
import { installSettings } from "./scenes/settings-bridge.js?v=9";
import { installChromeZones } from "./scenes/chrome-zones.js?v=9";

import { pendulumScene } from "./scenes/pendulum.js?v=9";
import { archiveScene } from "./scenes/archive.js?v=9";
import { timelineScene } from "./scenes/timeline.js?v=9";
import { mapScene } from "./scenes/map.js?v=9";

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

/* Настройки сцен объявлены в самих сценах (схема v1.2, PLAN-KIOSK):
 * `settings:[...]` + `applySettings(values)`. Ядро 1.1.0 схему ещё не
 * исполняет, поэтому её разворачивает мост — он же уйдёт, когда ядро
 * научится. Императивных addSettings() для сцен здесь больше нет. */
installSettings(app, [pendulumScene, archiveScene, timelineScene, mapScene]);

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
