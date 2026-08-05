/* МТК 42 «Осмысление наследия» — киоск-приложение на общем ядре.
 * Пилот фазы 1 (PLAN-KIOSK.md): четыре прежних прототипа стали сценами
 * одной страницы. Открывать только по http — ES-модули из file:// не идут. */
/* ?v= обязателен: обёртка берёт версию из СВОЕГО адреса и передаёт её
 * ядру (kiosk-core.js?v=…). Без версии Chrome отдаёт обе из кеша и
 * обновление ядра молча не доезжает до киоска. Поднимать при переходе
 * на каждый новый релиз ядра. */
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js?v=1.8.2";

import { pendulumScene } from "./scenes/pendulum.js?v=21";
import { archiveScene } from "./scenes/archive.js?v=21";
import { timelineScene } from "./scenes/timeline.js?v=21";
import { mapScene } from "./scenes/map.js?v=21";

const app = createApp({
  appId: "mtk42",
  title: { ru: "МТК · 42", en: "MTK · 42", zh: "МТК · 42" },
  configUrl: "./kiosk.config.json",
  i18nUrl: "./i18n/",
  /* Метка кеша словарей (ядро 1.7.0): без неё Chrome держал старый ru.json
   * и правки подписей не доезжали — ловил это руками не раз. Поднимать
   * вместе с ?v= остальных ассетов. */
  i18nVersion: "21",
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

/* Зоны хрома с ядра 1.6.0 отдаёт само ядро: --chrome-top/-bottom/-left/-right
 * (и пересчитанные --kiosk-safe-* как синонимы). Временный chrome-zones.js
 * снят — заявка закрыта. */

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
