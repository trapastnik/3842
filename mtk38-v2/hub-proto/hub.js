/* ПРОТОТИП enhanced-хаба (зона МТК 38, для передачи координатору в assets/shared/hub/).
 * Базируется на текущем assets/shared/hub/hub.js. Добавлено (всё обратно-совместимо):
 *
 *  1) ВЕРСИИ. У варианта опц. поле `version` ("v1"/"v2"/"v3"). Если у кого-то оно есть —
 *     в баре сегмент версий; стрелки/точки/свайп листают ВНУТРИ активной версии.
 *     Нет `version` ни у кого → как раньше (одна группа).
 *
 *  2) URL. `frame.src = v.url || `../${v.slug}/`` — вариантом может быть вложенный файл
 *     (mtk38-v3/globe.html), не только папка-slug.
 *
 *  3) СЛУЖЕБНАЯ КНОПКА. window.HUB_TOOLS=[{name,url}] → дискретная «⚙» в баре, открывает
 *     инструменты приёмки оверлеем. Гейт: показывается только при ?service=1 или тройном
 *     тапе по заголовку (чтобы посетитель музея не открыл редактор данных).
 *
 * Каждый /mtkXX/index.html даёт window.HUB_VARIANTS (+ опц. window.HUB_TOOLS), затем грузит этот файл.
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

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

/* ── версии ── */
const versions = [...new Set(VARIANTS.map(v => v.version).filter(Boolean))];
let activeVersion = versions.length ? versions[versions.length - 1] : null;   // по умолчанию — новейшая
function vis() { return activeVersion ? VARIANTS.filter(v => v.version === activeVersion) : VARIANTS.slice(); }
function entryUrl(v) { return v.url || `../${v.slug}/`; }

let i = 0;

/* Top-edge hotspot. */
const edge = el("div", "hub__edge");
document.body.appendChild(edge);

/* Corner nav (kiosk). */
const prevCorner = el("button", "hub__corner-nav hub__corner-nav--prev", "‹");
const nextCorner = el("button", "hub__corner-nav hub__corner-nav--next", "›");
prevCorner.type = nextCorner.type = "button";
prevCorner.setAttribute("aria-label", "Предыдущая идея");
nextCorner.setAttribute("aria-label", "Следующая идея");
document.body.appendChild(prevCorner);
document.body.appendChild(nextCorner);

/* Версии-сегмент (только если версий >1). */
let verEl = null;
if (versions.length > 1) {
  verEl = el("div", "hub__ver");
  verEl.setAttribute("role", "group");
  verEl.setAttribute("aria-label", "Версия");
  versions.forEach(ver => {
    const b = el("button", null, ver.toUpperCase());
    b.type = "button"; b.dataset.ver = ver;
    b.addEventListener("click", () => setVersion(ver));
    verEl.appendChild(b);
  });
  title.parentNode.insertBefore(verEl, title.nextSibling);
}

/* Ориентация Гор/Верт. */
const orientEl = el("div", "hub__orient");
orientEl.setAttribute("role", "group");
orientEl.setAttribute("aria-label", "Ориентация");
orientEl.innerHTML =
  '<button type="button" data-o="h" aria-label="Горизонтально">Гор</button>' +
  '<button type="button" data-o="v" aria-label="Вертикально (киоск 2160×3840)">Верт</button>';
nav.parentNode.insertBefore(orientEl, nav);

/* Служебная кнопка (инструменты приёмки). */
let svcBtn = null, svcPop = null;
if (TOOLS.length) {
  const gateOn = new URLSearchParams(location.search).get("service") === "1";
  svcBtn = el("button", "hub__service", "⚙");
  svcBtn.type = "button"; svcBtn.title = "Служебное · данные и приёмка";
  svcBtn.setAttribute("aria-label", "Служебное");
  svcBtn.style.display = gateOn ? "" : "none";

  svcPop = el("div", "hub__service-pop");
  svcPop.hidden = true;
  TOOLS.forEach(t => {
    const b = el("button", null, t.name);
    b.type = "button";
    b.addEventListener("click", () => { svcPop.hidden = true; openTool(t); });
    svcPop.appendChild(b);
  });
  svcBtn.addEventListener("click", () => { svcPop.hidden = !svcPop.hidden; });
  bar.appendChild(svcBtn);
  document.body.appendChild(svcPop);

  /* Скрытый жест: тройной тап по заголовку раскрывает кнопку (если гейта в URL нет). */
  let taps = [];
  title.addEventListener("click", () => {
    const now = Date.now(); taps = taps.filter(x => now - x < 800); taps.push(now);
    if (taps.length >= 3) { svcBtn.style.display = ""; taps = []; }
  });
}

function openTool(t) {
  const ov = el("div", "hub__tool-overlay");
  ov.innerHTML =
    '<div class="hub__tool-head"><span>' + t.name + '</span>' +
    '<button type="button" class="hub__tool-close" aria-label="Закрыть">✕</button></div>' +
    '<iframe class="hub__tool-frame" src="' + t.url + '"></iframe>';
  ov.querySelector(".hub__tool-close").addEventListener("click", () => ov.remove());
  document.body.appendChild(ov);
}

/* ── карусель (в пределах активной версии) ── */
function buildDots() {
  dotsEl.innerHTML = "";
  vis().forEach((v, idx) => {
    const b = el("button", "hub__dot");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-label", v.name);
    b.addEventListener("click", () => goto(idx));
    dotsEl.appendChild(b);
  });
}

function goto(idx) {
  const list = vis(); if (!list.length) return;
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
  history.replaceState(null, "", `#${v.slug || (v.version + "-" + i)}`);
  updateNavVisibility();
}

function setVersion(ver) {
  activeVersion = ver;
  if (verEl) verEl.querySelectorAll("button").forEach(b => {
    b.classList.toggle("is-active", b.dataset.ver === ver);
    b.setAttribute("aria-pressed", b.dataset.ver === ver ? "true" : "false");
  });
  buildDots();
  goto(0);
}

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
window.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
window.addEventListener("touchend", (e) => {
  if (touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 60) goto(i + (dx < 0 ? 1 : -1));
  touchStartX = null;
}, { passive: true });

/* Deep-link: #slug → выставить его версию активной + индекс. */
const initSlug = decodeURIComponent(location.hash.replace("#", ""));
const initVariant = VARIANTS.find(v => v.slug === initSlug);
if (initVariant && initVariant.version) activeVersion = initVariant.version;
if (verEl) verEl.querySelectorAll("button").forEach(b => b.classList.toggle("is-active", b.dataset.ver === activeVersion));
buildDots();
const startIdx = Math.max(0, vis().findIndex(v => v.slug === initSlug));
goto(startIdx >= 0 ? startIdx : 0);

/* ── ориентация (как в оригинале) ── */
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
  const u = new URL(location.href); u.searchParams.set("o", o);
  history.replaceState(null, "", u.toString());
}
orientEl.querySelectorAll("button").forEach(b => b.addEventListener("click", () => setOrient(b.dataset.o)));
setOrient(readOrient());

/* ── авто-скрытие бара ── */
const HIDE_AFTER_MS = 4000;
let hideTimer = null;
function showBar() {
  bar.classList.remove("is-hidden");
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => bar.classList.add("is-hidden"), HIDE_AFTER_MS);
}
edge.addEventListener("mouseenter", showBar);
edge.addEventListener("touchstart", showBar, { passive: true });
bar.addEventListener("mousemove", showBar);
bar.addEventListener("touchstart", showBar, { passive: true });
window.addEventListener("keydown", showBar);
showBar();
