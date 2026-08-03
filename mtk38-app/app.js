/* МТК 38 «Ленин на языках мира» — киоск-приложение на общем ядре.
 * Пять прежних прототипов стали сценами одной страницы (PLAN-KIOSK.md).
 * Открывать только по http — ES-модули из file:// не идут.
 */
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js";

import { globeScene } from "./scenes/globe.js?v=6";
import { rainScene } from "./scenes/rain.js?v=6";
import { mapScene } from "./scenes/map.js?v=6";
import { catalogScene } from "./scenes/catalog.js?v=6";
import { compositionsScene } from "./scenes/compositions.js?v=6";

const app = createApp({
  appId: "mtk38",
  title: { ru: "МТК · 38", en: "MTK · 38", zh: "МТК · 38" },
  configUrl: "./kiosk.config.json",
  i18nUrl: "./i18n/",
});

/* Порядок регистрации = порядок стрелок навигации.
 * Глобус первый — он же сцена по умолчанию (kiosk.config.json). */
const SCENES = [globeScene, rainScene, mapScene, catalogScene, compositionsScene];
SCENES.forEach((s) => app.registerScene(s));

/* Настройки объявлены схемой в самих сценах (settings:[] + applySettings) —
 * ядро 1.5.0 исполняет её само: рисует группу в сервис-панели, хранит значения
 * по пути scenes.<id>.<key> и зовёт applySettings. Мост из эталона 42 (он писался
 * под ядро 1.1.0) здесь не нужен и продублировал бы строки панели. */

/* Аттрактор-чередование: ядро 1.5.0 умеет отдать standby одной сцене, но не
 * переключать их по кругу. Пока не умеет — крутим здесь, по списку из конфига.
 * Смысл: с трёх метров зритель должен видеть движение и разные картины, иначе
 * киоск читается как выключенный экран. */
let rotTimer = 0;
function stopRotation() { clearInterval(rotTimer); rotTimer = 0; }

app.on("standby", () => {
  const cfg = (app.config && app.config.standby) || {};
  if (cfg.mode !== "rotate") return;
  const ids = (cfg.scenes || []).filter((id) => SCENES.some((s) => s.id === id));
  if (ids.length < 2) return;
  let i = Math.max(0, ids.indexOf(app.activeSceneId));
  stopRotation();
  rotTimer = setInterval(() => {
    i = (i + 1) % ids.length;
    app.showScene(ids[i]);
  }, Math.max(8, cfg.rotateSec || 25) * 1000);
});
app.on("standby-exit", stopRotation);

app.start();

/* Ручка для отладки и для аудита переключений из консоли. */
window.mtk38App = app;
