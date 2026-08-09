/* Мини-хелпер демо-сцен: canvas с DPR, ResizeObserver и честным
 * жизненным циклом rAF. Пример того, как сцена МТК должна вести себя
 * на pause()/resume() — петля обязана останавливаться полностью.
 *
 * Счётчик window.__kioskDemoRaf — для проверки «0 rAF у неактивных сцен»:
 * в консоли после переключения должен быть ровно 1 (активная сцена). */
window.__kioskDemoRaf = 0;

export function createCanvasScene({ id, title, draw, reset, settings }) {
  let canvas = null;
  let ctx = null;
  let raf = 0;
  let ro = null;
  let t0 = 0;
  let paused = 0;      // накопленное время на паузе — чтобы анимация не «прыгала»
  let pausedAt = 0;
  let state = {};

  let lastW = 0, lastH = 0;

  function size() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    /* Скрытый слой имеет размер 0×0, и ResizeObserver отдаёт сначала ноль,
     * а потом настоящую ширину — при КАЖДОМ показе сцены. Ноль означает
     * «слой спрятан», а не новый размер: пересобирать по нему нельзя. */
    if (!w || !h) return;
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    /* Буфер ≤ 8.3 Мп по канону перф-бюджета. */
    const maxPx = 8.3e6;
    let scale = dpr;
    if (w * h * dpr * dpr > maxPx) scale = Math.sqrt(maxPx / (w * h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    frames++;
    draw(ctx, {
      t: (now - t0 - paused) / 1000,
      w: canvas.clientWidth,
      h: canvas.clientHeight,
      state,
    });
  }

  function start() {
    if (raf) return;
    /* ResizeObserver не доставляется в скрытой вкладке: если сцену
     * смонтировали или возобновили в фоне, размер мог не примениться.
     * Меряем сами на входе — RO остаётся только для будущих изменений. */
    size();
    if (pausedAt) { paused += performance.now() - pausedAt; pausedAt = 0; }
    window.__kioskDemoRaf++;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
    pausedAt = performance.now();
    window.__kioskDemoRaf--;
  }

  /* Значения настроек сцены: ядро отдаёт их в applySettings и держит
   * между запусками. Петля читает их из того же объекта state. */
  let values = {};
  let app = null;
  let frames = 0;   /* для healthcheck: холст не просто есть, а рисуется */

  return {
    id,
    title,
    settings,
    /* Общая настройка приложения приходит СЮДА же, отдельным методом:
     * ядро зовёт applyAppSettings у всех смонтированных сцен. */
    applyAppSettings(v) {
      state.app = v;
      if (ctx && canvas) {
        frames++;
        draw(ctx, { t: 0, w: canvas.clientWidth, h: canvas.clientHeight, state });
      }
    },
    applySettings(v) {
      values = v;
      state.settings = v;
      /* Перерисовать сразу: оператор крутит слайдер и должен видеть
       * результат, а не ждать следующего кадра паузной сцены. */
      if (ctx && canvas) {
        draw(ctx, { t: 0, w: canvas.clientWidth, h: canvas.clientHeight, state });
      }
    },
    /* Своя петля аттрактора — через штатный тикер ядра: он держит
     * standbyFps из конфига. Самодельный rAF-цикл будил бы композитор
     * каждый vsync, что канон standby запрещает. */
    standby() {
      return app ? app.standbyTicker(function (t) {
        if (ctx && canvas) draw(ctx, { t: t * 0.25, w: canvas.clientWidth, h: canvas.clientHeight, state });
      }) : null;
    },

    /* Структурные проверки не видят «загружено, но пусто»: холст на
     * месте, сеть чиста, а на нём ничего. Признак живого — что холст
     * получил размер и хотя бы раз отрисовался. */
    healthcheck() {
      if (!canvas) return { ok: false, detail: "холст не смонтирован" };
      if (!canvas.width || !canvas.height) return { ok: false, detail: "нулевой буфер холста" };
      if (!frames) return { ok: false, detail: "ни одного отрисованного кадра" };
      return { ok: true, detail: canvas.width + "×" + canvas.height + ", кадров " + frames };
    },

    mount(el, sceneCtx) {
      app = sceneCtx && sceneCtx.app;
      canvas = document.createElement("canvas");
      canvas.className = "demo-canvas";
      el.appendChild(canvas);
      ctx = canvas.getContext("2d");
      t0 = performance.now();
      size();
      ro = new ResizeObserver(size);
      ro.observe(canvas);
      /* Первый кадр рисуем синхронно: ядро запускает кроссфейд только
       * после него, иначе на входе мигнёт пустой слой. */
      frames++;
      draw(ctx, { t: 0, w: canvas.clientWidth, h: canvas.clientHeight, state });
    },
    unmount() {
      stop();
      if (ro) { ro.disconnect(); ro = null; }
      if (canvas) { canvas.remove(); canvas = null; }
      ctx = null;
      lastW = lastH = 0;
      frames = 0;
    },
    pause: stop,
    resume: start,
    reset() {
      state = { settings: values };   /* сброс состояния, но не настроек оператора */
      if (reset) reset(state);
    },
    setLang() {},
    setA11y() {},
  };
}
