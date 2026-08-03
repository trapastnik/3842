/* МТК 38 «Ленин на языках мира» — киоск-приложение на общем ядре.
 * Пять прежних прототипов стали сценами одной страницы (PLAN-KIOSK.md).
 * Открывать только по http — ES-модули из file:// не идут.
 */
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js";

import { globeScene } from "./scenes/globe.js?v=7";
import { rainScene } from "./scenes/rain.js?v=7";
import { mapScene } from "./scenes/map.js?v=7";
import { catalogScene } from "./scenes/catalog.js?v=7";
import { compositionsScene } from "./scenes/compositions.js?v=7";

/* Словари грузим сами и отдаём ядру объектом, а не через i18nUrl.
 * Причина практическая: ядро запрашивает ./i18n/<lang>.json без версии, и
 * Chrome на киоске держит старый словарь после обновления сборки — правка
 * подписей не доезжает. С `?v=` этого не происходит. (Заявка ядру: принимать
 * версию для словарей; тогда этот блок уйдёт.) */
const I18N_V = 7;
const i18n = {};
await Promise.all(["ru", "en", "zh"].map((l) =>
  fetch(`./i18n/${l}.json?v=${I18N_V}`)
    .then((r) => r.json())
    .then((d) => { i18n[l] = d; })
    .catch((e) => console.warn("[i18n] словарь " + l + " не прочитан", e))));

const app = createApp({
  appId: "mtk38",
  title: { ru: "МТК · 38", en: "MTK · 38", zh: "МТК · 38" },
  configUrl: "./kiosk.config.json",
  i18n,
});

/* Порядок регистрации = порядок стрелок навигации.
 * Глобус первый — он же сцена по умолчанию (kiosk.config.json). */
const SCENES = [globeScene, rainScene, mapScene, catalogScene, compositionsScene];
SCENES.forEach((s) => app.registerScene(s));

/* Настройки объявлены схемой в самих сценах (settings:[] + applySettings) —
 * ядро 1.5.0 исполняет её само: рисует группу в сервис-панели, хранит значения
 * по пути scenes.<id>.<key> и зовёт applySettings. Мост из эталона 42 (он писался
 * под ядро 1.1.0) здесь не нужен и продублировал бы строки панели. */

/* Аттрактор-чередование поверх контракта сцен.
 *
 * Ядро умеет отдать standby ОДНОЙ сцене: та возвращает стоп-функцию своей
 * тротлённой петли, и ядро не гасит её и не закрывает своим оверлеем. Крутить
 * сцены по кругу ядро пока не умеет — это делается здесь, по списку из конфига.
 *
 * Порядок в такте важен: сперва гасим петлю уходящей сцены, потом показываем
 * следующую (ядро на показе поднимет ей обычную петлю), и сразу переводим её в
 * заставочный режим. Иначе после первой же смены киоск ночью рисовал бы на
 * полных 60 кадрах. Стоп-функция у всех сцен одна и та же ссылка (shared.js),
 * поэтому ядру неважно, какая сцена окажется активной к приходу посетителя. */
import { onStandbyStop, stopSceneStandby } from "./scenes/shared.js?v=7";

let rotTimer = 0;
function stopRotation() { clearInterval(rotTimer); rotTimer = 0; }
onStandbyStop(stopRotation);

app.on("standby", ({ own }) => {
  const cfg = (app.config && app.config.standby) || {};
  if (cfg.mode !== "rotate" || !own) return;   // сцена не отдала петлю — крутит ядро
  const ids = (cfg.scenes || []).filter((id) => SCENES.some((s) => s.id === id));
  if (ids.length < 2) return;
  let i = Math.max(0, ids.indexOf(app.activeSceneId));
  stopRotation();
  rotTimer = setInterval(async () => {
    i = (i + 1) % ids.length;
    stopSceneStandby();
    await app.showScene(ids[i]);
    const scene = SCENES.find((s) => s.id === ids[i]);
    if (scene && scene.standby) scene.standby();
  }, Math.max(8, cfg.rotateSec || 25) * 1000);
});
app.on("standby-exit", stopRotation);

app.start();

/* Ручка для отладки и для аудита переключений из консоли. */
window.mtk38App = app;
