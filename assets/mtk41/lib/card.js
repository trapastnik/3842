/**
 * Общая карточка памятника для всех прототипов МТК 41.
 *
 * Использование (в любом прототипе):
 *
 *   <link rel="stylesheet" href="../assets/mtk41/lib/card.css">
 *   <aside id="card-host" data-mtk-card hidden></aside>
 *
 *   <script type="module">
 *     import { initMtkCard } from "../assets/mtk41/lib/card.js";
 *     initMtkCard();   // монтирует разметку и навешивает обработчики
 *   </script>
 *
 *   // потом из обычного скрипта прототипа:
 *   window.MtkCard.show(monument);
 *   window.MtkCard.hide();
 *
 * Зависимости карточки (загружаются здесь же):
 *   - assets/mtk41/heights.json — для подписи «Высота»
 *   - assets/mtk41/manifest.json — фото
 *
 * 3D убран (2026-08-02, решение пользователя): секция «3D-модель» показывала
 * либо процедурный болван вместо конкретного памятника, либо iframe с
 * sketchfab.com — то есть тянула сеть в рантайме, чего офлайн-киоск не
 * переживёт. Вместе с ней удалены monument-viewer.js, models.json и
 * вендоренный Three.js.
 */

const STATUS_LABEL = {
  extant: "Сохранился",
  demolished: "Снесён",
  relocated: "Перенесён",
  unknown: "Судьба неизвестна",
};


const LAYOUT_KEY = "mtk41-card-layout";

const state = {
  heights: {},
  photos: {},
  layout: "stacked",        // stacked | overlay
  lastMonument: null,       // most-recently shown monument
};

let host = null;            // mount element

const CARD_HTML = `
  <button class="card-close" data-mtk-close aria-label="Закрыть">×</button>
  <div class="card-layout-switch">
    <button type="button" class="card-layout-tab active" data-layout="stacked">Под фото</button>
    <button type="button" class="card-layout-tab" data-layout="overlay">На фото</button>
  </div>
  <div class="card-photo" data-mtk-photo></div>
  <div class="card-body">
    <div class="card-year" data-mtk-year></div>
    <h2 class="card-title" data-mtk-title></h2>
    <div class="card-place" data-mtk-place></div>
    <div class="card-author" data-mtk-author></div>
    <p class="card-text" data-mtk-text></p>
    <div class="card-height" data-mtk-height hidden></div>
    <div class="card-status" data-mtk-status></div>
  </div>
`;

function $(sel) { return host.querySelector(sel); }






function applyLayout() {
  host.classList.toggle("layout-overlay", state.layout === "overlay");
  host.classList.toggle("layout-stacked", state.layout !== "overlay");
  host.querySelectorAll(".card-layout-tab").forEach(b => {
    b.classList.toggle("active", b.dataset.layout === state.layout);
  });
  try { sessionStorage.setItem(LAYOUT_KEY, state.layout); } catch (e) {}
}



/** Public API: show card for the given monument object (from data/mtk41.json). */
function show(monument) {
  if (!host || !monument) return;
  state.lastMonument = monument;

  $("[data-mtk-year]").textContent = monument.year ? String(monument.year) : "год не установлен";
  $("[data-mtk-title]").textContent = monument.title || "";
  $("[data-mtk-place]").textContent = [monument.city, monument.country].filter(Boolean).join(" · ");

  const auth = [];
  if (monument.sculptors && monument.sculptors.length) auth.push("Скульптор: " + monument.sculptors.join(", "));
  if (monument.architects && monument.architects.length) auth.push("Архитектор: " + monument.architects.join(", "));
  $("[data-mtk-author]").textContent = auth.join(" · ");

  $("[data-mtk-text]").textContent = monument.short_text || "";

  const statusEl = $("[data-mtk-status]");
  statusEl.textContent = STATUS_LABEL[monument.status] || "Статус не указан";
  statusEl.setAttribute("data-status", monument.status || "unknown");

  // Height (scale prototype likes to show this)
  const heightEl = $("[data-mtk-height]");
  const h = state.heights[monument.id];
  if (h && (h.statue + h.pedestal) > 0.1) {
    const total = h.statue + h.pedestal;
    heightEl.textContent = `Высота: ${total.toFixed(total < 10 ? 1 : 0)} м (фигура ${h.statue} м + постамент ${h.pedestal} м)`;
    heightEl.hidden = false;
  } else {
    heightEl.hidden = true;
  }

  // Photo
  const photoEl = $("[data-mtk-photo]");
  photoEl.style.backgroundImage = "";
  photoEl.classList.remove("empty");
  photoEl.textContent = "";
  const photos = state.photos[monument.id];
  if (photos && photos.length) {
    const src = `../assets/mtk41/${monument.id}/${photos[0]}`;
    photoEl.style.backgroundImage = `url("${encodeURI(src)}")`;
  } else {
    photoEl.classList.add("empty");
    photoEl.textContent = "фото не найдено";
  }

  host.hidden = false;
}

function hide() {
  if (!host) return;
  host.hidden = true;
  state.lastMonument = null;
  document.dispatchEvent(new CustomEvent("mtk-card-hidden"));
}


/**
 * Mount the card into the host element with [data-mtk-card] (or pass one explicitly).
 * Idempotent — safe to call once at startup.
 */
export function initMtkCard(target) {
  host = target || document.querySelector("[data-mtk-card]");
  if (!host) {
    console.warn("[MtkCard] no [data-mtk-card] element found");
    return null;
  }
  host.classList.add("card");
  host.innerHTML = CARD_HTML;

  // Restore persisted preferences
  try {
    state.layout = sessionStorage.getItem(LAYOUT_KEY) === "overlay" ? "overlay" : "stacked";
  } catch (e) {}

  applyLayout();

  // Close
  host.addEventListener("click", e => {
    const close = e.target.closest("[data-mtk-close]");
    if (close) { hide(); return; }
    const layoutTab = e.target.closest(".card-layout-tab");
    if (layoutTab) {
      state.layout = layoutTab.dataset.layout === "overlay" ? "overlay" : "stacked";
      applyLayout();
    }
  });

  // Load shared data once
  const fetchJson = (url) => fetch(url).then(r => r.json()).catch(() => ({}));
  Promise.all([
    fetchJson("../assets/mtk41/heights.json"),
    fetchJson("../assets/mtk41/manifest.json"),
  ]).then(([heights, manifest]) => {
    state.heights = heights || {};
    state.photos = manifest || {};
    // If a monument was queued before data loaded, refresh
    if (state.lastMonument && !host.hidden) show(state.lastMonument);
  });


  // Expose to non-module scripts
  window.MtkCard = { show, hide };
  return { show, hide };
}
