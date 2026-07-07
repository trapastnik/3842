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
const TOOLS    = window.HUB_TOOLS || [];
const hub    = document.querySelector(".hub");
const frame  = document.getElementById("frame");
const bar    = document.querySelector(".hub__bar");
const nav    = document.querySelector(".hub__nav");
const title  = document.querySelector(".hub__title");
const label  = document.getElementById("label");
const dotsEl = document.getElementById("dots");
const prev   = document.getElementById("prev");
const next   = document.getElementById("next");

/* ---- Версии (опц. поле variant.version) — обратно-совместимо ----
 * Если хотя бы у одного варианта есть `version`, в баре появляется сегмент
 * версий, а стрелки/точки/свайп листают ВНУТРИ активной версии. Нет `version`
 * ни у кого → одноуровневая карусель как раньше (МТК 39–42 не затронуты).
 * Точка входа варианта: `url` (произвольный путь/файл) или `../<slug>/` (папка). */
const versions = [...new Set(VARIANTS.map(v => v.version).filter(Boolean))];
let activeVersion = versions.length ? versions[versions.length - 1] : null; // по умолчанию — новейшая
function vis() { return activeVersion ? VARIANTS.filter(v => v.version === activeVersion) : VARIANTS.slice(); }
function entryUrl(v) { return v.url || `../${v.slug}/`; }

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

/* Полосы на фоне рендерятся самими прототипами на своём штатном z-index
 * (контент выше полос — фикс через z-index, а не яркость). Хаб ими НЕ
 * управляет: оператор-слайдер и запись --stripe-opacity убраны. Причина —
 * баг `Number(null)===0` в старом loadStripe гасил полосы на любом свежем
 * браузере, а на офлайн-киоске залипшее затемнение некому сбросить.
 * Историю см. COORDINATION.md → «Хронология слияний».
 * Подчищаем legacy-ключ, чтобы старые браузеры не таскали мёртвое значение. */
try { localStorage.removeItem("bmk-hub-stripe"); } catch { /* приватный режим */ }

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

settings.querySelector(".hub__settings__reset").addEventListener("click", () => {
  navCfg = { ...NAV_DEFAULTS };
  applyNav();
  localStorage.setItem(NAV_KEY, JSON.stringify(navCfg));
  settings.querySelectorAll("input[data-key]").forEach(input => {
    const spec = NAV_SPEC.find(s => s.key === input.dataset.key);
    input.value = navCfg[input.dataset.key];
    settings.querySelector(`[data-val="${input.dataset.key}"]`).textContent = navCfg[input.dataset.key] + spec.unit;
  });
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

/* Сегмент версий (только если версий >1) — визуально как .hub__orient, рядом с заголовком. */
let verEl = null;
if (versions.length > 1) {
  verEl = document.createElement("div");
  verEl.className = "hub__ver";
  verEl.setAttribute("role", "group");
  verEl.setAttribute("aria-label", "Версия");
  versions.forEach(ver => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.ver = ver;
    b.textContent = ver.toUpperCase();
    b.addEventListener("click", () => setVersion(ver));
    verEl.appendChild(b);
  });
  if (title) title.parentNode.insertBefore(verEl, title.nextSibling);
  else nav.parentNode.insertBefore(verEl, nav);
}

/* ---- Служебная кнопка (HUB_TOOLS): бэк-инструменты приёмки, НЕ витрина ----
 * Скрыта от посетителя: показывается только при ?service=1 в URL хаба ИЛИ по
 * тройному тапу по заголовку МТК (escape-hatch для персонала без правки URL).
 * Открывает инструмент оверлеем поверх хаба. Нет HUB_TOOLS → кнопки нет
 * (МТК без бэк-инструментов не затронуты). Глиф ⚒ — отличать от nav-⚙. */
let svcBtn = null, svcPop = null;
if (TOOLS.length) {
  const gateOn = new URLSearchParams(location.search).get("service") === "1";
  svcBtn = document.createElement("button");
  svcBtn.type = "button";
  svcBtn.className = "hub__service";
  svcBtn.textContent = "⚒";
  svcBtn.title = "Служебное · данные и приёмка";
  svcBtn.setAttribute("aria-label", "Служебное");
  svcBtn.style.display = gateOn ? "" : "none";

  svcPop = document.createElement("div");
  svcPop.className = "hub__service-pop";
  svcPop.hidden = true;
  TOOLS.forEach(t => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = t.name;
    b.addEventListener("click", () => { svcPop.hidden = true; openTool(t); });
    svcPop.appendChild(b);
  });
  svcBtn.addEventListener("click", () => { svcPop.hidden = !svcPop.hidden; });
  bar.appendChild(svcBtn);
  document.body.appendChild(svcPop);

  /* Скрытый жест: 3 тапа по заголовку за 800 мс раскрывают кнопку. */
  if (title) {
    let taps = [];
    title.addEventListener("click", () => {
      const now = performance.now();
      taps = taps.filter(x => now - x < 800);
      taps.push(now);
      if (taps.length >= 3) { svcBtn.style.display = ""; taps = []; }
    });
  }
}
function openTool(t) {
  const ov = document.createElement("div");
  ov.className = "hub__tool-overlay";
  ov.innerHTML =
    '<div class="hub__tool-head"><span></span>' +
    '<button type="button" class="hub__tool-close" aria-label="Закрыть">✕</button></div>' +
    '<iframe class="hub__tool-frame"></iframe>';
  ov.querySelector(".hub__tool-head span").textContent = t.name;
  ov.querySelector(".hub__tool-frame").src = t.url;
  ov.querySelector(".hub__tool-close").addEventListener("click", () => ov.remove());
  document.body.appendChild(ov);
}

let i = 0;

function buildDots() {
  dotsEl.innerHTML = "";
  vis().forEach((v, idx) => {
    const b = document.createElement("button");
    b.className = "hub__dot";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-label", v.name);
    b.addEventListener("click", () => goto(idx));
    dotsEl.appendChild(b);
  });
}

function goto(idx) {
  const list = vis();
  if (!list.length) return;
  i = (idx + list.length) % list.length;
  const v = list[i];
  frame.src = entryUrl(v);
  label.innerHTML =
    `<span class="tag">${v.tag}</span> · ${v.name}` +
    `<span class="counter">${i + 1} / ${list.length}</span>`;
  dotsEl.querySelectorAll(".hub__dot").forEach((d, j) => {
    d.classList.toggle("active", j === i);
    d.setAttribute("aria-selected", j === i ? "true" : "false");
  });
  history.replaceState(null, "", `#${v.slug}`);
  updateNavVisibility();
}

/* Переключение версии → пересобрать точки, встать на первый вариант версии. */
function setVersion(ver) {
  activeVersion = ver;
  if (verEl) verEl.querySelectorAll("button").forEach(b => {
    b.classList.toggle("is-active", b.dataset.ver === ver);
    b.setAttribute("aria-pressed", b.dataset.ver === ver ? "true" : "false");
  });
  buildDots();
  goto(0);
}

/* Стрелки/точки/угловые кнопки прячутся, когда в активной версии один вариант. */
function updateNavVisibility() {
  const single = vis().length <= 1;
  [prev, next, dotsEl, prevCorner, nextCorner].forEach(e => { if (e) e.style.display = single ? "none" : ""; });
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

/* Deep-link: #slug → активировать его версию + встать на его индекс внутри версии. */
const initSlug = decodeURIComponent(location.hash.replace("#", ""));
const initVariant = VARIANTS.find(v => v.slug === initSlug);
if (initVariant && initVariant.version) activeVersion = initVariant.version;
if (verEl) verEl.querySelectorAll("button").forEach(b => {
  b.classList.toggle("is-active", b.dataset.ver === activeVersion);
  b.setAttribute("aria-pressed", b.dataset.ver === activeVersion ? "true" : "false");
});
buildDots();
const startIdx = vis().findIndex(v => v.slug === initSlug);
goto(startIdx >= 0 ? startIdx : 0);

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
