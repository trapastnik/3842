# kiosk-core — ядро киоск-приложения МТК

Общий рантайм для пяти музейных комплексов. Канон требований —
[PLAN-KIOSK.md](../../../PLAN-KIOSK.md) и COORDINATION.md → «Тач-стандарт киоска»,
«Киоск-стандарт v2». Здесь — как этим пользоваться.

**Зона.** `assets/shared/kiosk/**` ведёт сессия `kiosk-core`. Сессии МТК файлы ядра
не правят: нужна доработка — заявка через пользователя. Свои сцены, свой конфиг и
свои словари вы держите у себя в `mtkXX-app/`.

## Что даёт ядро

Реестр сцен и кроссфейд без перезагрузки · преролл ассетов со сплэшем · навигация
(титул, стрелки, точки) по тач-стандарту · косая подложка · idle-сброс и standby ·
ночной авторестарт · watchdog и журнал ошибок · i18n RU/EN/ZH · режим слабовидящих ·
сервис-панель с единым видом контролов.

Что остаётся вам: сами сцены и честное поведение в `pause()` / `reset()` / `setLang()` /
`setA11y()`.

## Раскладка приложения

```
mtk42-app/
  index.html
  app.js                 создаёт приложение, регистрирует сцены
  kiosk.config.json      дефолты киоска (в git — переживает очистку браузера)
  i18n/{ru,en,zh}.json   строки UI-хрома
  scenes/*.js            сцены
  styles.css             ваши стили
```

## index.html

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>МТК 42</title>
    <link rel="stylesheet" href="../assets/shared/kiosk/kiosk.css?v=1" />
    <link rel="stylesheet" href="../assets/shared/kiosk/kiosk-core.css?v=1" />
    <link rel="stylesheet" href="./styles.css?v=1" />
  </head>
  <body>
    <script type="module" src="./app.js?v=1"></script>
  </body>
</html>
```

`?v=N` обязателен и увеличивается при каждой правке: Chrome кеширует статику
агрессивно, и без версии изменение может просто не доехать до киоска.

Тело пустое — разметку строит ядро. Открывать **только по http** (`ES`-модули из
`file://` не работают).

## app.js

```js
import { createApp } from "../assets/shared/kiosk/kiosk-core.esm.js";
import { mapScene } from "./scenes/map.js";
import { timelineScene } from "./scenes/timeline.js";

const app = createApp({
  appId: "mtk42",                       // ключ localStorage: "mtk42-kiosk"
  title: { ru: "МТК · 42", en: "MTK · 42", zh: "МТК · 42" },
  configUrl: "./kiosk.config.json",
  i18nUrl: "./i18n/",
});

app.registerScene(mapScene);            // порядок регистрации = порядок стрелок
app.registerScene(timelineScene);

app.start();
```

Без сборщика и без модулей — то же самое классическим скриптом:

```html
<script src="../assets/shared/kiosk/kiosk-core.js?v=1"></script>
<script>
  const app = KioskCore.createApp({ appId: "mtk42", /* … */ });
</script>
```

## Контракт сцены

```js
export const mapScene = {
  id: "map",                                  // slug, уникален в приложении
  title: { ru: "Карта", en: "Map", zh: "地图" },

  keepAlive: true,      // деф.: смонтироваться один раз и жить на паузе.
                        // false — выгружаться при уходе (тяжёлые WebGL-сцены)
  watchdog: false,      // true — ядро следит, что сцена зовёт ctx.beat()

  preload: {            // грузится на старте, со сплэшем; в рантайме — ноль сети
    data:   { museums: "../data/mtk42.json" },     // → ctx.data.museums
    images: ["../assets/mtk42/portraits/01.jpg"],  // → ctx.images[url]
    fonts:  ["1em '20 Kopeek'"],
    // custom(ctx) { return somePromise; }
  },

  mount(el, ctx) {},    // построить DOM/canvas внутри el. ctx: {app, lang, a11y,
                        // settings, data, images, beat}. Можно вернуть промис —
                        // ядро дождётся его до старта кроссфейда
  unmount() {},         // снять всё: слушатели, ResizeObserver, таймеры
  pause() {},           // сцена не видна: ОСТАНОВИТЬ rAF и таймеры полностью
  resume() {},          // снова видна
  reset() {},           // idle-сброс: фильтры, зум, открытые карточки, скролл
  setLang(lang) {},     // "ru" | "en" | "zh"
  setA11y(on) {},       // крупнее точки, меньше плотность подписей
  standby() { return null; },  // см. ниже
};
```

Все методы необязательны — ядро зовёт только то, что есть. Ошибка внутри метода
сцены не роняет приложение: она уходит в журнал.

### Жёсткие правила

1. **`pause()` останавливает всё.** Неактивная сцена — 0 rAF и 0 таймеров. Это
   проверяется на приёмке. Схема из демо:

   ```js
   function start() { if (raf) return; raf = requestAnimationFrame(loop); }
   function stop()  { if (!raf) return; cancelAnimationFrame(raf); raf = 0; }
   ```

2. **Верстайтесь от полос ядра.** Ядро объявляет, сколько места заняли навигация,
   переключатель языков и шестерёнка:

   ```css
   .my-scene {
     position: absolute; inset: 0;
     padding: var(--kiosk-safe-top) var(--edge-safe) var(--kiosk-safe-bottom);
   }
   ```

   Хардкодить отступы под хром нельзя: оператор двигает его из настроек, а в режиме
   слабовидящих таргеты растут на четверть.

3. **Размеры — только из переменных кита** (`--touch-min`, `--touch-primary`,
   `--touch-gap`, `--edge-safe`, `--type-min-label`, `--type-min-ui`). Тогда режим
   слабовидящих укрупнит интерфейс сам. Свой кегль масштабируйте через
   `calc(38px * var(--a11y-scale))`.

4. **Скроллы видимые.** Каждому скроллируемому контейнеру — `class="kiosk-scroll"`.

5. **Строки — через словари.** `ctx.app.t("cards.state", { shown, total })`, а не
   хардкод в разметке. Непереведённый ключ показывается как ключ — так его видно
   на приёмке.

6. **Буфер ≤ 8.3 Мп.** На 4K с DPR 2 наивный `canvas.width = clientWidth * dpr`
   вылезает за бюджет — ограничивайте (пример: `demo/scenes/canvas-scene.js`).

7. **Ноль сети.** Только вендоренные библиотеки, никаких CDN. Проверка —
   `tools/audit-offline.py`.

### Свой аттрактор в простое

По умолчанию в standby все сцены встают на паузу и ядро рисует общую заставку.
Если у МТК есть свой материал для заставки — верните из `standby()` функцию
остановки, и ядро оставит только призыв «Коснитесь экрана»:

```js
standby() {
  this.startSlowLoop();               // ваша петля, не выше 10 fps
  return () => this.stopSlowLoop();   // ядро позовёт при касании
}
```

## kiosk.config.json

Полный набор с дефолтами:

```json
{
  "defaultScene": "map",
  "defaultLang": "ru",
  "timings": { "fade": 350, "reset": 90, "standby": 180, "restartAt": "04:00", "standbyFps": 10 },
  "nav": { "show": true, "position": "bottom", "size": 96, "opacity": 0.92,
           "showTitle": true, "showArrows": true, "showDots": true },
  "stripes": { "on": true, "opacity": 1, "angle": 105 },
  "i18n": { "langs": ["ru", "en", "zh"], "show": true },
  "a11y": { "enabled": false, "show": true },
  "tools": { "position": "top-left" },
  "service": { "gear": "always" },
  "watchdog": { "stallSec": 30, "sceneTimeoutSec": 20, "restart": true, "journalLimit": 200 }
}
```

Правки оператора из сервис-панели ложатся **патчем** в
`localStorage["<appId>-kiosk"]` — только то, что реально трогали. Файл остаётся
источником правды: ваши будущие изменения в нём не окажутся затенены навсегда.

## Сервис-панель

Вход: `?service=1` или тройной тап по заголовку; шестерёнка пока видна всегда
(`service.gear: "always"`; режимы `tripleTap` и `hidden` заложены — условие показа
решится позже). Пока панель открыта, простой заморожен.

Своя группа настроек — тем же видом контролов, что у ядра:

```js
app.addSettings("Карта", [
  { type: "range",  path: "map.dotSize", label: "Размер точек", min: 48, max: 160, step: 8, unit: " px" },
  { type: "toggle", path: "map.showLabels", label: "Подписи стран" },
  { type: "choice", path: "map.projection", label: "Проекция",
    options: [["winkel", "Винкель"], ["equirect", "Прямоугольная"]] },
]);

app.on("setting", ({ path, value }) => { /* применить у себя */ });
```

Типы строк: `range`, `toggle`, `choice`, `text`, `scene` (список ваших сцен).

## API приложения

| Вызов | Что делает |
|---|---|
| `app.showScene(id)` | переключить с кроссфейдом; вызовы сериализуются |
| `app.nextScene()` / `app.prevScene()` | по кругу |
| `app.setLang(l)` / `app.setA11y(on)` | язык и режим слабовидящих |
| `app.t(key, vars)` | строка из словаря |
| `app.getSetting(p)` / `app.setSetting(p, v)` | настройки |
| `app.resetScenes()` | сброс состояния всех сцен |
| `app.poke()` | отметить активность (если ловите жест, не всплывающий до window) |
| `app.suspendIdle(true/false)` | заморозить простой (модалка, ваша панель) |
| `app.log(level, msg)` / `app.getLog()` | журнал |
| `app.restart(reason)` | перезапуск страницы |
| `app.on(event, fn)` | `started`, `scene-will-change`, `scene-changed`, `idle-reset`, `standby`, `standby-exit`, `lang`, `a11y`, `setting`, `service`, `log`, `restart` |

## Проверка перед «готово к merge»

```bash
python3 assets/shared/kiosk/tools/audit-offline.py --path mtk42-app
```

Дальше — в Chrome по http:

- пройти все сцены туда-обратно, убедиться, что кроссфейд без вспышек;
- на каждой неактивной сцене — 0 rAF и 0 таймеров (Performance / свой счётчик);
- 50 циклов переключения без роста JS heap;
- DevTools → Network в offline-режиме: после сплэша запросов нет;
- три языка, режим слабовидящих, idle-сброс и standby с укороченными таймингами
  (`localStorage.setItem("mtk42-kiosk", JSON.stringify({timings:{reset:3,standby:6}}))`).

## Демо

`demo/` — рабочее приложение на ядре с тремя фейковыми сценами (две canvas, одна
DOM). Оно и образец кода, и стенд для проверки самого ядра. Открывается на общем
сервере (порт 8092, поднимает координатор из main — свой второй не запускать):
`/assets/shared/kiosk/demo/`.

Полезное там: `scenes/canvas-scene.js` —
хелпер с честным rAF-жизненным циклом, ограничением буфера и DPR; `scenes/cards.js` —
DOM-сцена со сбросом состояния и словарями.
