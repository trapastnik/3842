/* Hub shell logic. Each /mtkXX/index.html provides:
 *   window.HUB_VARIANTS = [{slug, tag, name}, ...]
 * Then loads this script. Switching variants:
 *  - prev / next arrow buttons
 *  - clickable dots
 *  - keyboard ← / →
 *  - horizontal touch swipe (60+ px)
 *  - URL hash (deep-linking to a specific variant)
 */

const VARIANTS = window.HUB_VARIANTS || [];
const frame  = document.getElementById("frame");
const label  = document.getElementById("label");
const dotsEl = document.getElementById("dots");
const prev   = document.getElementById("prev");
const next   = document.getElementById("next");

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
