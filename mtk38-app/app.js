/* МТК 38 «Ленин на языках мира» — киоск-приложение на общем ядре.
 * Пять прежних прототипов стали сценами одной страницы (PLAN-KIOSK.md).
 * Открывать только по http — ES-модули из file:// не идут.
 */
/* ?v= — ТОЧНАЯ версия ядра (канон GRABLI.md): обёртка тянет её из своего адреса
 * и передаёт дальше в kiosk-core.js. Поднимать при каждом merge main, иначе
 * Chrome отдаёт старое ядро: у меня так работало 1.5.0 при 1.7.0 в репозитории
 * и 1.7.0 при 1.8.1. С 1.9.0 ядро само сверит VERSION с меткой и заругается. */
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js?v=1.8.2";

import { globeScene } from "./scenes/globe.js?v=15";
import { rainScene } from "./scenes/rain.js?v=15";
import { mapScene } from "./scenes/map.js?v=15";
import { catalogScene } from "./scenes/catalog.js?v=15";
import { compositionsScene } from "./scenes/compositions.js?v=15";

const app = createApp({
  appId: "mtk38",
  title: { ru: "МТК · 38", en: "MTK · 38", zh: "МТК · 38" },
  configUrl: "./kiosk.config.json",
  i18nUrl: "./i18n/",
  /* Метка кеша словарей (ядро 1.7.0). Поднимать вместе с правкой i18n/*.json,
   * иначе Chrome на киоске покажет прежние подписи. */
  i18nVersion: 10,
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
import { onStandbyStop, stopSceneStandby } from "./scenes/shared.js?v=15";

let rotTimer = 0;
let rotEpoch = 0;   // растёт на каждом входе в standby — метит «свои» тики
function stopRotation() { clearInterval(rotTimer); rotTimer = 0; rotEpoch++; }
onStandbyStop(stopRotation);

/* Список ротации считаем на КАЖДОМ такте, а не один раз при входе: оператор
 * гасит сцены в сервис-панели в любой момент, в том числе посреди ночного
 * простоя, и погашенную ядро показать не даст — оно уведёт на дефолтную.
 * Тик тогда переводил бы в заставку сцену, которой на экране нет, и её кадр
 * дёргал бы фантомный тикер весь слот. (До ядра 1.8.1 увод на уже активную
 * сцену шёл ещё и без resume — с 1.8.1 ядро её резюмирует.) */
const rotationIds = () => {
  const cfg = (app.config && app.config.standby) || {};
  return (cfg.scenes || []).filter(
    (id) => SCENES.some((s) => s.id === id) && app.isSceneEnabled(id));
};

app.on("standby", ({ own }) => {
  const cfg = (app.config && app.config.standby) || {};
  if (cfg.mode !== "rotate" || !own) return;   // сцена не отдала петлю — крутит ядро
  if (rotationIds().length < 2) return;
  /* Активной может быть сцена вне списка (оператор увёл киоск на каталог) —
   * тогда начинаем с начала списка, а не со второго его элемента. */
  const at = rotationIds().indexOf(app.activeSceneId);
  let i = at < 0 ? -1 : at;
  stopRotation();
  const tick = ++rotEpoch;
  rotTimer = setInterval(async () => {
    const ids = rotationIds();
    if (ids.length < 2) return;
    i = (i + 1) % ids.length;
    const want = ids[i];
    stopSceneStandby();
    await app.showScene(want);
    /* Сверка ПОСЛЕ await обязательна. Кроссфейд длится ~350 мс, и касание в это
     * окно уводит киоск в ACTIVE, пока тик ещё висит на await; а если сцену
     * погасили или ядро увело на дефолт, активной окажется вовсе не `want`.
     * Без проверки продолжение тика перевело бы в заставку чужую или
     * несмонтированную сцену, и осиротевшая петля рисовала бы её в общий канвас
     * до ночного рестарта — ссылка на стоп к тому моменту уже перезаписана.
     * Эпоха ловит повторный вход в standby, activeSceneId — увод на дефолт и
     * наложение тиков, если показ занял больше такта. */
    if (tick !== rotEpoch || !rotTimer) return;
    if (app.idleState !== "standby" || app.activeSceneId !== want) return;
    const scene = SCENES.find((s) => s.id === want);
    /* Вне safeCall ядра: падение сцены не должно уносить ротацию. */
    try { if (scene && scene.standby) scene.standby(); }
    catch (e) { console.warn("[standby] сцена «" + want + "» не встала в заставку", e); }
  }, Math.max(8, cfg.rotateSec || 25) * 1000);
});
app.on("standby-exit", stopRotation);

app.start();

/* Ручка для отладки и для аудита переключений из консоли. */
window.mtk38App = app;
