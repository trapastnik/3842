/* ============================================================
 * BMK 38-42 · KioskHint — призыв к жесту (зона координатора)
 * Единый вид «рука-пинч / потяните» для всех МТК.
 *
 * Подключение (после kiosk.css, обычный script):
 *   <script src="../assets/shared/kiosk/hint.js"></script>
 *   KioskHint.attach(stageEl, { gesture: "pinch" });               // зум щипком
 *   KioskHint.attach(stageEl, { gesture: "drag",  label: "Тяните карту" });
 *   KioskHint.attach(stageEl, { gesture: "swipe", label: "Листайте" });
 *
 * Поведение: подсказка видна при простое; гаснет по первому
 * pointerdown/wheel на контейнере; возвращается после idleMs (30 с)
 * без взаимодействий. Никаких зависимостей, чистый vanilla.
 * ============================================================ */
(function () {
  "use strict";

  var ICONS = {
    /* два пальца сходятся — щипок */
    pinch:
      '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">' +
      '<circle cx="30" cy="26" r="7"/><circle cx="66" cy="26" r="7"/>' +
      '<path d="M30 36 L40 52 M66 36 L56 52"/>' +
      '<path d="M24 78 C24 64 34 56 48 56 C62 56 72 64 72 78"/>' +
      "</svg>",
    /* ладонь тянет в сторону */
    drag:
      '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">' +
      '<circle cx="48" cy="44" r="9"/>' +
      '<path d="M14 44 H30 M66 44 H82"/>' +
      '<path d="M22 36 L14 44 L22 52 M74 36 L82 44 L74 52"/>' +
      "</svg>",
    /* горизонтальный свайп */
    swipe:
      '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">' +
      '<path d="M20 60 C34 44 62 44 76 60"/>' +
      '<path d="M64 54 L76 60 L70 72"/>' +
      '<circle cx="26" cy="34" r="7"/>' +
      "</svg>",
  };

  var DEFAULT_LABEL = {
    pinch: "Сведите или разведите пальцы",
    drag: "Тяните, чтобы перемещаться",
    swipe: "Листайте свайпом",
  };

  function attach(target, opts) {
    if (!target) return null;
    opts = opts || {};
    var gesture = ICONS[opts.gesture] ? opts.gesture : "pinch";
    var idleMs = opts.idleMs || 30000;
    var firstDelay = opts.firstDelay || 1200; /* не мигать во время загрузки */

    var el = document.createElement("div");
    el.className = "kiosk-hint";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML =
      '<div class="kiosk-hint__icon">' + ICONS[gesture] + "</div>" +
      '<div class="kiosk-hint__label">' + (opts.label || DEFAULT_LABEL[gesture]) + "</div>";
    injectCss();

    /* позиционируемся относительно контейнера */
    var cs = getComputedStyle(target);
    if (cs.position === "static") target.style.position = "relative";
    target.appendChild(el);

    var idleTimer = null, shown = false;

    function show() { shown = true; el.classList.add("is-on"); }
    function hide() { shown = false; el.classList.remove("is-on"); }
    function poke() {
      if (shown) hide();
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(show, idleMs);
    }

    ["pointerdown", "wheel", "touchstart"].forEach(function (ev) {
      target.addEventListener(ev, poke, { passive: true });
    });

    setTimeout(show, firstDelay);
    idleTimer = setTimeout(show, idleMs);

    return { show: show, hide: hide, destroy: function () { el.remove(); } };
  }

  var cssDone = false;
  function injectCss() {
    if (cssDone) return;
    cssDone = true;
    var s = document.createElement("style");
    s.textContent =
      ".kiosk-hint{position:absolute;left:50%;bottom:calc(var(--edge-safe-bottom,80px) + 12px);" +
      "transform:translateX(-50%) translateY(8px);display:flex;align-items:center;gap:18px;" +
      "padding:18px 28px;border-radius:999px;background:rgba(12,16,18,.72);" +
      "border:1px solid rgba(210,183,115,.45);color:var(--brass,#D2B773);" +
      "opacity:0;pointer-events:none;transition:opacity .5s ease,transform .5s ease;z-index:40;}" +
      ".kiosk-hint.is-on{opacity:1;transform:translateX(-50%) translateY(0);}" +
      ".kiosk-hint__icon{width:64px;height:64px;}" +
      ".kiosk-hint__icon svg{width:100%;height:100%;animation:kioskHintPulse 2.4s ease-in-out infinite;}" +
      ".kiosk-hint__label{font-family:'20 Kopeek','Courier New',monospace;font-size:26px;" +
      "letter-spacing:.08em;text-transform:uppercase;color:var(--paper,#F7F9EF);white-space:nowrap;}" +
      "@keyframes kioskHintPulse{0%,100%{transform:scale(1)}50%{transform:scale(.88)}}";
    document.head.appendChild(s);
  }

  window.KioskHint = { attach: attach };
})();
