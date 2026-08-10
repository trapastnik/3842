/* МТК 42 «Осмысление наследия» — киоск-приложение на общем ядре.
 * Пилот фазы 1 (PLAN-KIOSK.md): четыре прежних прототипа стали сценами
 * одной страницы. Открывать только по http — ES-модули из file:// не идут. */
/* ?v= обязателен: обёртка берёт версию из СВОЕГО адреса и передаёт её
 * ядру (kiosk-core.js?v=…). Без версии Chrome отдаёт обе из кеша и
 * обновление ядра молча не доезжает до киоска. Поднимать при переходе
 * на каждый новый релиз ядра. */
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js?v=1.20.3";

import { pendulumScene } from "./scenes/pendulum.js?v=29";
import { archiveScene } from "./scenes/archive.js?v=29";
import { timelineScene } from "./scenes/timeline.js?v=29";
import { mapScene } from "./scenes/map.js?v=29";

const app = createApp({
  appId: "mtk42",
  title: { ru: "МТК · 42", en: "MTK · 42", zh: "МТК · 42" },
  configUrl: "./kiosk.config.json",
  i18nUrl: "./i18n/",
  /* Метка кеша словарей (ядро 1.7.0): без неё Chrome держал старый ru.json
   * и правки подписей не доезжали — ловил это руками не раз. Поднимать
   * вместе с ?v= остальных ассетов. */
  i18nVersion: "29",

  /* Общая настройка МТК: цвет портретов делят картотека и маятник, поэтому
   * она не принадлежит ни одной сцене. С ядра 1.12.0 для такого есть
   * appSettings — ядро зовёт applyAppSettings() у всех смонтированных сцен.
   * До 1.12.0 приходилось звать императивный addSettings(), который ядро
   * объявляло устаревшим, не имея замены; заявка закрыта, warn ушёл.
   *
   * Монохром базовым — кураторское решение, не техническое: оба флага лишь
   * возвращают снимкам исходный цвет, отдельно для обычного режима и для
   * режима слабовидящих. По умолчанию выключены оба. */
  appSettings: [
    { key: "photoColor", label: { ru: "Цвет фото" },
      type: "toggle", default: false },
    { key: "photoColorA11y", label: { ru: "Цвет фото в режиме слабовидящих" },
      type: "toggle", default: false },
  ],
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

/* Применение цвета портретов живёт в сценах: ядро зовёт applyAppSettings()
 * у каждой смонтированной сцены, общая реализация — applyPhotoMode() в
 * scenes/shared.js. Здесь подписок больше нет. */

app.start();

/* Ручка для отладки и для аудита переключений из консоли. */
window.mtk42App = app;
