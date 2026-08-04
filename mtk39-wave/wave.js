/* МТК 39 · «Прилив и отлив».
   Столетие имени на карте мира: 1900 → 2025. Точка вспыхивает в год, когда объект
   получил имя Ленина, и гаснет в год, когда имя сняли.

   Проекция — общий канон проекта: MtkProjection.WinkelTripel из assets/shared/lib
   (порядок аргументов (lat, lng), аспект только из WT.ASPECT — своей математики нет).
   Библиотека подключена классическим <script> — рантайм-CDN в проекте запрещены. */

const CORPUS = "../data/mtk39-corpus.json";
const COUNTRIES = "../data/ne_110m_countries.geojson";
const WT = window.MtkProjection.WinkelTripel;

const FROM = 1900;
const TO = 2025;
const YEARS_PER_SEC = 6;
const FLASH = 2.2;              // сколько лет держится вспышка события

const C = {
  live: "#d2b773",
  gone: "#c9545a",
  bg: "rgba(157, 163, 168, 0.22)",
};

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
// Кап буфера рендера: на 4K с DPR 2 канвас был бы 33 Мп — держим бюджет ~8.3 Мп
// (задача координатора по итогам 4K-смоука 2026-07-22).
const PIXEL_BUDGET = 8.3e6;
function capDpr() {
  const raw = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return Math.max(1, Math.min(raw, 2, Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h))));
}

// Кегли и метки на канвасе заданы в пикселях под ~1600 px ширины — на 49" 4K
// их надо укрупнять пропорционально, иначе получается микротекст.
const uiScale = () => Math.max(1, Math.min(2.6, window.innerWidth / 1600));
let dpr = capDpr();
const nf = new Intl.NumberFormat("ru-RU");

let width = 0;
let height = 0;
let baseW = 0;                // ширина мира при zoom = 1
let baseH = 0;
let worldW = 0;               // с учётом приближения
let worldH = 0;
let offX = 0;
let offY = 0;
let zoom = 1;
let panX = 0;
let panY = 0;
let land = null;              // спроецированные контуры стран (world-px)
let dated = [];               // объекты с годом
let undated = [];             // объекты без года — тихий фон
let year = FROM;
let playing = true;
let lastFrame = 0;

const yearEl = document.querySelector("[data-year]");
const countsEl = document.querySelector("[data-counts]");
const scrub = document.querySelector("[data-scrub]");
const playBtn = document.querySelector("[data-play]");

/* ------------------------------------------------------------------ раскладка */

function layout() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = capDpr();
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // карта занимает ширину сцены, поля — под заголовок и таймлайн
  const availW = width * 0.92;
  const availH = height * 0.66;
  baseW = Math.min(availW, availH * WT.ASPECT);
  baseH = baseW / WT.ASPECT;
  applyView();
}

/* Приближать дальше, чем «карта закрыла экран», незачем: это обзорная сцена,
   а не атлас — за этим пределом начинается разглядывание пикселей. */
const maxZoom = () => (baseW && baseH
  ? Math.max(1, Math.max(width / baseW, height / baseH))
  : 1);

/* Стол, а не браузер: карту нельзя утащить в пустоту. Пока она уже экрана —
   стоит на своём месте, когда шире — ходит ровно в пределах своих краёв. */
function applyView() {
  zoom = Math.max(1, Math.min(maxZoom(), zoom));
  worldW = baseW * zoom;
  worldH = baseH * zoom;

  if (worldW <= width) {
    panX = 0;
  } else {
    const lim = (worldW - width) / 2;
    panX = Math.max(-lim, Math.min(lim, panX));
  }
  if (worldH <= height) {
    panY = -height * 0.05;      // в исходном виде карта приподнята над таймлайном
  } else {
    const lim = (worldH - height) / 2;
    panY = Math.max(-lim, Math.min(lim, panY));
  }

  offX = (width - worldW) / 2 + panX;
  offY = (height - worldH) / 2 + panY;
}

const project = (lat, lng) => {
  const p = WT.project(lat, lng, worldW, worldH);
  return [p.x + offX, p.y + offY];
};

/* ------------------------------------------------------------ приближение */

const hintEl = document.querySelector("[data-zoom-hint]");
const local = (e) => {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};

function zoomAt(factor, cx, cy) {
  const next = Math.max(1, Math.min(maxZoom(), zoom * factor));
  if (Math.abs(next - zoom) < 1e-6) return;
  // точка под пальцем остаётся на месте
  const wx = (cx - offX) / worldW;
  const wy = (cy - offY) / worldH;
  zoom = next;
  panX = cx - (width - baseW * zoom) / 2 - wx * baseW * zoom;
  panY = cy - (height - baseH * zoom) / 2 - wy * baseH * zoom;
  applyView();
  render();
  if (hintEl) hintEl.classList.add("is-off");
}

function bindZoom() {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", (e) => {
    if (zoom <= 1) return;              // тянуть нечего, карта целиком в кадре
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    panX += e.clientX - lastX;
    panY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyView();
    render();
  });
  const stop = () => { dragging = false; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);

  // Колесо — удобство на ноутбуке: на столе масштаб задают щипком.
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const [x, y] = local(e);
    zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, x, y);
  }, { passive: false });

  let pinch = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t) => {
    const r = canvas.getBoundingClientRect();
    return [(t[0].clientX + t[1].clientX) / 2 - r.left,
      (t[0].clientY + t[1].clientY) / 2 - r.top];
  };
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) { dragging = false; pinch = dist(e.touches); }
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (pinch && e.touches.length === 2) {
      const d = dist(e.touches);
      const [cx, cy] = mid(e.touches);
      zoomAt(d / pinch, cx, cy);
      pinch = d;
    }
  }, { passive: true });
  canvas.addEventListener("touchend", () => { pinch = null; }, { passive: true });
}

/* ------------------------------------------------------------------ данные */

function prepareLand(geo) {
  // контуры считаем один раз в мировых пикселях, при ресайзе пересчитываем
  land = [];
  for (const f of geo.features) {
    const polys = f.geometry.type === "Polygon"
      ? [f.geometry.coordinates]
      : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
    for (const poly of polys) {
      for (const ring of poly) {
        if (ring.length < 4) continue;
        land.push(ring);
      }
    }
  }
}

function drawLand() {
  ctx.beginPath();
  for (const ring of land) {
    let started = false;
    let prevX = 0;
    for (const [lng, lat] of ring) {
      const [x, y] = project(lat, lng);
      // разрыв на антимеридиане: не тянем полигон через всю карту
      if (started && Math.abs(x - prevX) > worldW * 0.5) {
        started = false;
      }
      if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      prevX = x;
    }
  }
  ctx.fillStyle = "rgba(72, 86, 95, 0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(247, 249, 239, 0.18)";
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

/* ------------------------------------------------------------------ кадр */

function stateAt(p, y) {
  // 0 — ещё не названо, 1 — носит имя, 2 — имя снято
  if (p.year_named && y < p.year_named) return 0;
  if (p.year_renamed && y >= p.year_renamed) return 2;
  if (!p.year_named && p.year_renamed && y < p.year_renamed) return 1;
  return p.year_named ? 1 : 0;
}

function render() {
  const u = uiScale();
  ctx.clearRect(0, 0, width, height);
  drawLand();

  // фон: объекты, для которых материалы не называют год
  for (const p of undated) {
    const [x, y] = project(p.lat, p.lng);
    ctx.beginPath();
    ctx.arc(x, y, 1.7 * u, 0, Math.PI * 2);
    ctx.fillStyle = C.bg;
    ctx.fill();
  }

  let live = 0;
  let gone = 0;
  const flashes = [];

  for (const p of dated) {
    const st = stateAt(p, year);
    if (st === 0) continue;
    const [x, y] = project(p.lat, p.lng);
    if (st === 1) {
      live += 1;
      ctx.beginPath();
      ctx.arc(x, y, 2.6 * u, 0, Math.PI * 2);
      ctx.fillStyle = C.live;
      ctx.fill();
      if (p.year_named && year - p.year_named < FLASH) {
        flashes.push([x, y, 1 - (year - p.year_named) / FLASH, C.live]);
      }
    } else {
      gone += 1;
      ctx.beginPath();
      ctx.arc(x, y, 2.1 * u, 0, Math.PI * 2);
      ctx.fillStyle = year - p.year_renamed < FLASH
        ? C.gone
        : "rgba(201, 84, 90, 0.34)";
      ctx.fill();
      if (year - p.year_renamed < FLASH) {
        flashes.push([x, y, 1 - (year - p.year_renamed) / FLASH, C.gone]);
      }
    }
  }

  // вспышки — поверх всего, чтобы событие года было видно в общей россыпи
  for (const [x, y, t, color] of flashes) {
    const r = (5 + (1 - t) * 26) * u;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 1.6 * u;
    ctx.strokeStyle = hexToRgba(color, t * 0.8);
    ctx.stroke();
  }

  yearEl.textContent = Math.floor(year);
  countsEl.innerHTML = `<b>${nf.format(live)}</b> носят имя · <i>${nf.format(gone)}</i> лишились`;
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
}

/* ------------------------------------------------------------------ цикл */

function tick(now) {
  const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
  lastFrame = now;
  if (playing) {
    year += dt * YEARS_PER_SEC;
    if (year > TO) year = FROM;
    scrub.value = String(Math.floor(year));
  }
  render();
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ ввод */

function setPlaying(next) {
  playing = next;
  playBtn.textContent = playing ? "❚❚" : "▶";
  playBtn.setAttribute("aria-label", playing ? "Пауза" : "Пуск");
}

playBtn.addEventListener("click", () => setPlaying(!playing));
scrub.addEventListener("input", () => {
  setPlaying(false);
  year = Number(scrub.value);
  render();
});
window.addEventListener("resize", () => { layout(); render(); }, { passive: true });


/* ------------------------------------------------------------------ простой

   Музейный киоск: посетитель ушёл, оставив включённым фильтр или зум, — следующий
   подходит к чужому состоянию. Через IDLE_RESET_MS без касаний возвращаем экран
   к исходному виду. */

const IDLE_RESET_MS = 75000;
let idleTimer = null;

function armIdleReset(reset) {
  const rearm = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(reset, IDLE_RESET_MS);
  };
  for (const ev of ["pointerdown", "pointermove", "wheel", "touchstart", "keydown"]) {
    window.addEventListener(ev, rearm, { passive: true });
  }
  rearm();
}

function resetView() {
  year = FROM;
  scrub.value = String(FROM);
  setPlaying(true);
  zoom = 1;
  panX = 0;
  panY = 0;
  applyView();
  if (hintEl) hintEl.classList.remove("is-off");
}

/* ------------------------------------------------------------------ запуск */

async function main() {
  const [corpus, geo] = await Promise.all([
    fetch(CORPUS).then((r) => r.json()),
    fetch(COUNTRIES).then((r) => r.json()),
  ]);

  const geolocated = corpus.records.filter((r) => r.lat !== null && r.lng !== null);
  dated = geolocated.filter((r) => r.year_named || r.year_renamed);
  undated = geolocated.filter((r) => !r.year_named && !r.year_renamed);

  prepareLand(geo);
  layout();

  const ticks = document.querySelector("[data-ticks]");
  for (let y = FROM; y <= TO; y += 25) {
    const s = document.createElement("span");
    s.textContent = y;
    ticks.appendChild(s);
  }

  document.querySelector("[data-note]").innerHTML =
    `Анимированы ${nf.format(dated.length)} объектов, у которых в материалах назван год. `
    + `Ещё ${nf.format(undated.length)} нанесены серым — даты нет, судьба неизвестна. `
    + "Годы выведены из формулировок описаний и требуют выборочной проверки.";

  setPlaying(true);
  bindZoom();
  armIdleReset(resetView);
  requestAnimationFrame(tick);
}

main().catch((e) => {
  console.error(e);
  document.querySelector(".title").textContent = "Данные не загрузились";
});
