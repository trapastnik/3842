/**
 * Общая карточка памятника для всех прототипов МТК 41.
 *
 * Использование (в любом прототипе):
 *
 *   <link rel="stylesheet" href="../assets/mtk41/lib/card.css">
 *   <aside id="card-host" data-mtk-card hidden></aside>
 *
 *   <script type="importmap">{"imports":{
 *     "three":"../assets/mtk41/lib/three/three.module.min.js",
 *     "three/addons/":"../assets/mtk41/lib/three/addons/"
 *   }}</script>
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
 *   - assets/mtk41/heights.json — для подписи «Высота» и для 3D-плеера
 *   - assets/mtk41/manifest.json — фото
 *   - assets/mtk41/models.json — 3D-модели на Sketchfab
 *   - assets/mtk41/lib/monument-viewer.js — нативный 3D-плеер
 */
import { MonumentViewer, inferMonumentType } from "./monument-viewer.js";

const STATUS_LABEL = {
  extant: "Сохранился",
  demolished: "Снесён",
  relocated: "Перенесён",
  unknown: "Судьба неизвестна",
};

const FALLBACK_MODEL = {
  name: "Памятник Ленину в Дубне (фотограмметрия)",
  url: "https://sketchfab.com/3d-models/none-a14d4ca0163b44829123780f3cfa121b",
  license: "—",
  author: "Alex",
  exact_match: false,
};

const LAYOUT_KEY = "mtk41-card-layout";
const MODE_KEY = "mtk41-card-mode";

const state = {
  heights: {},
  photos: {},
  models: {},
  layout: "stacked",        // stacked | overlay
  mode: "native",            // native | iframe
  current: null,             // active MonumentViewer
  lastMonument: null,        // most-recently shown monument (for mode switching)
  activeSketchfab: null,     // { sorted, index } for the iframe mode
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
    <section class="card-models" data-mtk-models hidden>
      <div class="card-models-heading">3D-модель</div>
      <div class="card-mode-switch">
        <button type="button" class="card-mode-tab active" data-mode="native">Свой плеер</button>
        <button type="button" class="card-mode-tab" data-mode="iframe">Sketchfab · онлайн</button>
      </div>
      <div class="card-model-native" data-mtk-native></div>
      <div class="card-model-viewer" data-mtk-viewer hidden></div>
      <div class="card-model-controls" data-mtk-controls hidden></div>
    </section>
    <div class="card-status" data-mtk-status></div>
  </div>
`;

function $(sel) { return host.querySelector(sel); }

function disposeNative() {
  if (state.current) { state.current.dispose(); state.current = null; }
}

function openNative(monument) {
  const c = $("[data-mtk-native]");
  if (!c) return;
  disposeNative();
  state.current = new MonumentViewer(c, {
    heights: state.heights[monument.id] || { statue: 5, pedestal: 2 },
    status: monument.status,
    type: inferMonumentType(monument.id),
  });
}

function buildSketchfabIframe() {
  const sf = state.activeSketchfab;
  const viewer = $("[data-mtk-viewer]");
  if (!viewer || !sf || !sf.sorted || !sf.sorted[sf.index]) return;
  const m = sf.sorted[sf.index];
  const um = (m.url || "").match(/([a-f0-9]{32})/i);
  const uid = um ? um[1] : null;
  if (!uid) return;
  if (viewer.dataset.uid === uid) return;        // already showing
  viewer.dataset.uid = uid;
  const params = "autostart=0&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=1&dnt=1";
  const iframe = document.createElement("iframe");
  iframe.src = `https://sketchfab.com/models/${uid}/embed?${params}`;
  iframe.setAttribute("frameborder", "0");
  iframe.setAttribute("allow", "autoplay; fullscreen; xr-spatial-tracking");
  iframe.setAttribute("allowfullscreen", "");
  viewer.innerHTML = "";
  viewer.appendChild(iframe);
  viewer.classList.toggle("test", !!sf.isTest);
}

function clearSketchfabIframe() {
  const viewer = $("[data-mtk-viewer]");
  if (!viewer) return;
  viewer.innerHTML = "";
  delete viewer.dataset.uid;
}

function applyMode() {
  host.querySelectorAll(".card-mode-tab").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === state.mode);
  });
  const nativeC = $("[data-mtk-native]");
  const iframeC = $("[data-mtk-viewer]");
  if (state.mode === "native") {
    if (nativeC) nativeC.hidden = false;
    if (iframeC) { iframeC.hidden = true; clearSketchfabIframe(); }
    if (state.lastMonument) openNative(state.lastMonument);
  } else {
    disposeNative();
    if (nativeC) nativeC.hidden = true;
    if (iframeC) iframeC.hidden = false;
    buildSketchfabIframe();
  }
  try { sessionStorage.setItem(MODE_KEY, state.mode); } catch (e) {}
}

function applyLayout() {
  host.classList.toggle("layout-overlay", state.layout === "overlay");
  host.classList.toggle("layout-stacked", state.layout !== "overlay");
  host.querySelectorAll(".card-layout-tab").forEach(b => {
    b.classList.toggle("active", b.dataset.layout === state.layout);
  });
  try { sessionStorage.setItem(LAYOUT_KEY, state.layout); } catch (e) {}
}

function populateModels(monumentId) {
  const cont = $("[data-mtk-models]");
  if (!cont) return;
  const own = state.models[monumentId] || [];
  let list = own;
  let isTest = false;
  if (!list.length) { list = [FALLBACK_MODEL]; isTest = true; }

  // Sort exact matches first
  const sorted = list.slice().sort(
    (a, b) => (b.exact_match ? 1 : 0) - (a.exact_match ? 1 : 0)
  );

  cont.hidden = false;

  // Drop previous source-link entries (keep heading + viewers)
  cont.querySelectorAll(".card-model").forEach(el => el.remove());

  // Bind active model so iframe mode can lazily build the iframe
  state.activeSketchfab = { sorted, index: 0, isTest };

  // If multiple models, show tab controls
  const controls = $("[data-mtk-controls]");
  if (controls) {
    controls.innerHTML = "";
    if (sorted.length > 1) {
      controls.hidden = false;
      sorted.forEach((m, i) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "card-model" + (i === 0 ? " active" : "") + (m.exact_match ? " exact" : "");
        tab.textContent = m.name || "модель";
        tab.title = m.name || "";
        tab.addEventListener("click", () => {
          state.activeSketchfab.index = i;
          clearSketchfabIframe();
          if (state.mode === "iframe") buildSketchfabIframe();
        });
        controls.appendChild(tab);
      });
    } else {
      controls.hidden = true;
    }
  }

  // Source link
  const active = sorted[0];
  if (active && active.url) {
    const a = document.createElement("a");
    a.className = "card-model" + (active.exact_match ? " exact" : "");
    a.href = active.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = isTest ? "Источник тестовой модели — Sketchfab" : "Открыть на Sketchfab: " + (active.name || "");
    const meta = document.createElement("span");
    meta.className = "card-model-meta";
    const parts = [];
    if (active.license) parts.push("лицензия: " + active.license);
    if (active.author) parts.push("автор: " + active.author);
    meta.textContent = parts.join(" · ");
    a.appendChild(meta);
    cont.appendChild(a);
  }

  // Rebuild current mode's viewer
  if (state.mode === "iframe") buildSketchfabIframe();
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

  populateModels(monument.id);

  // Reveal the card BEFORE initialising the WebGL viewer — otherwise the
  // hidden container measures 0×0 and the renderer is stuck at that size.
  host.hidden = false;

  if (state.mode === "native") openNative(monument);
}

function hide() {
  if (!host) return;
  host.hidden = true;
  disposeNative();
  clearSketchfabIframe();
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
    state.mode = sessionStorage.getItem(MODE_KEY) === "iframe" ? "iframe" : "native";
  } catch (e) {}

  applyLayout();
  applyMode();

  // Close
  host.addEventListener("click", e => {
    const close = e.target.closest("[data-mtk-close]");
    if (close) { hide(); return; }
    const layoutTab = e.target.closest(".card-layout-tab");
    if (layoutTab) {
      state.layout = layoutTab.dataset.layout === "overlay" ? "overlay" : "stacked";
      applyLayout();
      return;
    }
    const modeTab = e.target.closest(".card-mode-tab");
    if (modeTab) {
      const next = modeTab.dataset.mode === "iframe" ? "iframe" : "native";
      if (next !== state.mode) { state.mode = next; applyMode(); }
      return;
    }
  });

  // Load shared data once
  const fetchJson = (url) => fetch(url).then(r => r.json()).catch(() => ({}));
  Promise.all([
    fetchJson("../assets/mtk41/heights.json"),
    fetchJson("../assets/mtk41/manifest.json"),
    fetchJson("../assets/mtk41/models.json"),
  ]).then(([heights, manifest, models]) => {
    state.heights = heights || {};
    state.photos = manifest || {};
    state.models = models || {};
    // If a monument was queued before data loaded, refresh
    if (state.lastMonument && !host.hidden) show(state.lastMonument);
  });

  // Expose to non-module scripts
  window.MtkCard = { show, hide };
  return { show, hide };
}
