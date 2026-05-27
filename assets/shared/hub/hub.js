/* Hub shell logic. Each /mtkXX/index.html provides:
 *   window.HUB_VARIANTS = [{slug, tag, name}, ...]
 * Then loads this script. Switching variants:
 *  - prev / next arrow buttons
 *  - clickable dots
 *  - keyboard ← / →
 *  - horizontal touch swipe (60+ px)
 *  - URL hash (deep-linking to a specific variant)
 *
 * The bar auto-hides after 4s of no activity, giving the prototype the
 * full viewport. Bring it back by moving cursor / touching top 12px,
 * pressing any key, or focusing the hub document. (Pointer events
 * inside the iframe don't reach the parent — that's why the top hotspot
 * exists.)
 */

const VARIANTS = window.HUB_VARIANTS || [];
const hub    = document.querySelector(".hub");
const frame  = document.getElementById("frame");
const bar    = document.querySelector(".hub__bar");
const nav    = document.querySelector(".hub__nav");
const label  = document.getElementById("label");
const dotsEl = document.getElementById("dots");
const prev   = document.getElementById("prev");
const next   = document.getElementById("next");

/* Inject top-edge hotspot once. */
const edge = document.createElement("div");
edge.className = "hub__edge";
document.body.appendChild(edge);

/* Inject orientation switch (Гор / Верт) into the bar. The hub renders
 * the iframe full-viewport for horizontal mode, or pinned to 9:16
 * portrait centered + scaled for vertical (kiosk) preview. */
const orientEl = document.createElement("div");
orientEl.className = "hub__orient";
orientEl.setAttribute("role", "group");
orientEl.setAttribute("aria-label", "Ориентация");
orientEl.innerHTML =
  '<button type="button" data-o="h" aria-label="Горизонтально">Гор</button>' +
  '<button type="button" data-o="v" aria-label="Вертикально (киоск 2160×3840)">Верт</button>';
nav.parentNode.insertBefore(orientEl, nav);

let i = 0;

VARIANTS.forEach((v, idx) => {
  const b = document.createElement("button");
  b.className = "hub__dot";
  b.setAttribute("role", "tab");
  b.setAttribute("aria-label", v.name);
  b.addEventListener("click", () => goto(idx));
  dotsEl.appendChild(b);
});

function goto(idx) {
  if (!VARIANTS.length) return;
  i = (idx + VARIANTS.length) % VARIANTS.length;
  const v = VARIANTS[i];
  frame.src = `../${v.slug}/`;
  label.innerHTML =
    `<span class="tag">${v.tag}</span> · ${v.name}` +
    `<span class="counter">${i + 1} / ${VARIANTS.length}</span>`;
  dotsEl.querySelectorAll(".hub__dot").forEach((d, j) => {
    d.classList.toggle("active", j === i);
    d.setAttribute("aria-selected", j === i ? "true" : "false");
  });
  history.replaceState(null, "", `#${v.slug}`);
}

prev.addEventListener("click", () => goto(i - 1));
next.addEventListener("click", () => goto(i + 1));

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft")  goto(i - 1);
  if (e.key === "ArrowRight") goto(i + 1);
});

let touchStartX = null;
window.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });
window.addEventListener("touchend", (e) => {
  if (touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 60) goto(i + (dx < 0 ? 1 : -1));
  touchStartX = null;
}, { passive: true });

const initSlug = decodeURIComponent(location.hash.replace("#", ""));
const initIdx  = VARIANTS.findIndex(v => v.slug === initSlug);
goto(initIdx >= 0 ? initIdx : 0);

if (VARIANTS.length <= 1) {
  prev.style.display   = "none";
  next.style.display   = "none";
  dotsEl.style.display = "none";
}

/* Orientation persistence: query ?o=v|h beats localStorage beats default 'h'. */
const STORAGE_KEY = "bmk-hub-orient";
function readOrient() {
  const q = new URL(location.href).searchParams.get("o");
  if (q === "v" || q === "h") return q;
  const s = localStorage.getItem(STORAGE_KEY);
  return s === "v" ? "v" : "h";
}
function setOrient(o) {
  hub.classList.toggle("hub--vertical", o === "v");
  orientEl.querySelectorAll("button").forEach(b => {
    b.classList.toggle("is-active", b.dataset.o === o);
    b.setAttribute("aria-pressed", b.dataset.o === o ? "true" : "false");
  });
  localStorage.setItem(STORAGE_KEY, o);
  const u = new URL(location.href);
  u.searchParams.set("o", o);
  history.replaceState(null, "", u.toString());
}
orientEl.querySelectorAll("button").forEach(b => {
  b.addEventListener("click", () => setOrient(b.dataset.o));
});
setOrient(readOrient());

/* Bar auto-hide. */
const HIDE_AFTER_MS = 4000;
let hideTimer = null;

function showBar() {
  bar.classList.remove("is-hidden");
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => bar.classList.add("is-hidden"), HIDE_AFTER_MS);
}

/* Trigger reveal on any of these. */
edge.addEventListener("mouseenter", showBar);
edge.addEventListener("touchstart", showBar, { passive: true });
bar.addEventListener("mousemove",   showBar);
bar.addEventListener("touchstart",  showBar, { passive: true });
window.addEventListener("keydown",  showBar);

/* Initial show — visitor sees the bar on first load, then it fades. */
showBar();
