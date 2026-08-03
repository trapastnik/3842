/* Мини-хелпер демо-сцен: canvas с DPR, ResizeObserver и честным
 * жизненным циклом rAF. Пример того, как сцена МТК должна вести себя
 * на pause()/resume() — петля обязана останавливаться полностью.
 *
 * Счётчик window.__kioskDemoRaf — для проверки «0 rAF у неактивных сцен»:
 * в консоли после переключения должен быть ровно 1 (активная сцена). */
window.__kioskDemoRaf = 0;

export function createCanvasScene({ id, title, draw, reset }) {
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

  return {
    id,
    title,
    mount(el) {
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
      draw(ctx, { t: 0, w: canvas.clientWidth, h: canvas.clientHeight, state });
    },
    unmount() {
      stop();
      if (ro) { ro.disconnect(); ro = null; }
      if (canvas) { canvas.remove(); canvas = null; }
      ctx = null;
      lastW = lastH = 0;
    },
    pause: stop,
    resume: start,
    reset() {
      state = {};
      if (reset) reset(state);
    },
    setLang() {},
    setA11y() {},
  };
}
