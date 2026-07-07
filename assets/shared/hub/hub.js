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

/* Inject the two large corner nav buttons — duplicate of the bar arrows,
 * always visible at bottom-left (prev) and bottom-right (next).
 * This is the primary kiosk affordance — visitor doesn't need to find
 * the slim top bar. Same circular goto() logic. */
const prevCorner = document.createElement("button");
prevCorner.type = "button";
prevCorner.className = "hub__corner-nav hub__corner-nav--prev";
prevCorner.setAttribute("aria-label", "Предыдущая идея");
prevCorner.textContent = "‹";

const nextCorner = document.createElement("button");
nextCorner.type = "button";
nextCorner.className = "hub__corner-nav hub__corner-nav--next";
nextCorner.setAttribute("aria-label", "Следующая идея");
nextCorner.textContent = "›";

document.body.appendChild(prevCorner);
document.body.appendChild(nextCorner);

/* ---- Настройки стрелок (позиция/яркость/размер), общие для всех МТК ---- */
const NAV_KEY = "bmk-hub-nav";
const NAV_DEFAULTS = { y: 50, x: 28, opacity: 100, size: 88 };
const NAV_SPEC = [
  { key: "y",       label: "Положение · вертикаль", min: 5,  max: 95,  step: 1, unit: "%",  cssVar: "--nav-y",       toCss: v => v + "%" },
  { key: "x",       label: "Положение · горизонталь", min: 0, max: 200, step: 2, unit: "px", cssVar: "--nav-x",       toCss: v => v + "px" },
  { key: "opacity", label: "Яркость",              min: 20, max: 100, step: 5, unit: "%",  cssVar: "--nav-opacity", toCss: v => (v / 100).toFixed(2) },
  { key: "size",    label: "Размер",               min: 44, max: 160, step: 4, unit: "px", cssVar: "--nav-size",    toCss: v => v + "px" },
];

function loadNav() {
  try {
    const s = JSON.parse(localStorage.getItem(NAV_KEY) || "{}");
    return { ...NAV_DEFAULTS, ...s };
  } catch { return { ...NAV_DEFAULTS }; }
}
let navCfg = loadNav();

function applyNav() {
  NAV_SPEC.forEach(s => {
    document.documentElement.style.setProperty(s.cssVar, s.toCss(navCfg[s.key]));
  });
}
applyNav();

/* ---- Настройка полос на фоне (--stripe-opacity, 0..1) ----
 * Полосы живут ВНУТРИ прототипа (iframe), не в хабе. Хаб ставит переменную
 * в документ iframe (same-origin) и переприменяет при каждой смене варианта.
 * Прототипы, у которых нет полос, переменную просто игнорируют.
 * Конвенция: если у прототипа есть фоновые полосы — заведи их на
 * `opacity: var(--stripe-opacity, 1)`, и хаб сможет ими управлять. */
const STRIPE_KEY = "bmk-hub-stripe";
const STRIPE_DEFAULT = 100; /* % → 1.0, как дефолт прототипа */
function loadStripe() {
  const v = Number(localStorage.getItem(STRIPE_KEY));
  return Number.isFinite(v) && v >= 0 ? v : STRIPE_DEFAULT;
}
let stripeCfg = loadStripe();
function applyStripes() {
  try {
    const doc = frame.contentDocument;
    if (doc) doc.documentElement.style.setProperty("--stripe-opacity", (stripeCfg / 100).toFixed(2));
  } catch { /* cross-origin — молча пропускаем */ }
}
/* Переприменяем после загрузки каждого варианта. */
frame.addEventListener("load", applyStripes);

/* Шестерёнка в баре (перед .hub__nav) */
const gear = document.createElement("button");
gear.type = "button";
gear.className = "hub__gear";
gear.setAttribute("aria-label", "Настройки стрелок");
gear.textContent = "⚙";

/* Панель настроек справа */
const settings = document.createElement("aside");
settings.className = "hub__settings";
settings.innerHTML =
  '<div class="hub__settings__head">' +
  '  <span class="hub__settings__title">Стрелки навигации</span>' +
  '  <button type="button" class="hub__settings__close" aria-label="Закрыть">✕</button>' +
  '</div>' +
  NAV_SPEC.map(s =>
    `<div class="hub__set-row">` +
    `<label>${s.label}<span class="val" data-val="${s.key}">${navCfg[s.key]}${s.unit}</span></label>` +
    `<input type="range" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${navCfg[s.key]}">` +
    `</div>`
  ).join("") +
  '<div class="hub__settings__group">Фон прототипа</div>' +
  '<div class="hub__set-row">' +
  `<label>Полосы на фоне<span class="val" data-val="stripe">${stripeCfg}%</span></label>` +
  `<input type="range" data-stripe min="0" max="100" step="5" value="${stripeCfg}">` +
  '</div>' +
  '<button type="button" class="hub__settings__reset">Сбросить</button>';
document.body.appendChild(settings);

function openSettings(open) {
  settings.classList.toggle("is-open", open);
  gear.classList.toggle("is-open", open);
}
gear.addEventListener("click", () => openSettings(!settings.classList.contains("is-open")));
settings.querySelector(".hub__settings__close").addEventListener("click", () => openSettings(false));

/* Слайдеры стрелок (ставят переменные в документ хаба) */
settings.querySelectorAll("input[data-key]").forEach(input => {
  input.addEventListener("input", () => {
    const key = input.dataset.key;
    const spec = NAV_SPEC.find(s => s.key === key);
    navCfg[key] = Number(input.value);
    settings.querySelector(`[data-val="${key}"]`).textContent = navCfg[key] + spec.unit;
    document.documentElement.style.setProperty(spec.cssVar, spec.toCss(navCfg[key]));
    localStorage.setItem(NAV_KEY, JSON.stringify(navCfg));
  });
});

/* Слайдер полос (ставит переменную в документ прототипа = iframe) */
const stripeInput = settings.querySelector("input[data-stripe]");
stripeInput.addEventListener("input", () => {
  stripeCfg = Number(stripeInput.value);
  settings.querySelector('[data-val="stripe"]').textContent = stripeCfg + "%";
  applyStripes();
  localStorage.setItem(STRIPE_KEY, String(stripeCfg));
});

settings.querySelector(".hub__settings__reset").addEventListener("click", () => {
  navCfg = { ...NAV_DEFAULTS };
  applyNav();
  localStorage.setItem(NAV_KEY, JSON.stringify(navCfg));
  settings.querySelectorAll("input[data-key]").forEach(input => {
    const spec = NAV_SPEC.find(s => s.key === input.dataset.key);
    input.value = navCfg[input.dataset.key];
    settings.querySelector(`[data-val="${input.dataset.key}"]`).textContent = navCfg[input.dataset.key] + spec.unit;
  });
  stripeCfg = STRIPE_DEFAULT;
  applyStripes();
  localStorage.setItem(STRIPE_KEY, String(stripeCfg));
  stripeInput.value = stripeCfg;
  settings.querySelector('[data-val="stripe"]').textContent = stripeCfg + "%";
});

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

/* Шестерёнка настроек стрелок — в бар, перед .hub__nav */
nav.parentNode.insertBefore(gear, nav);

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
prevCorner.addEventListener("click", () => goto(i - 1));
nextCorner.addEventListener("click", () => goto(i + 1));

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
  prev.style.display       = "none";
  next.style.display       = "none";
  dotsEl.style.display     = "none";
  prevCorner.style.display = "none";
  nextCorner.style.display = "none";
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
