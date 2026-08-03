/* Общее для сцен МТК 40.
 *
 * Палитра, оси корпуса, типы связей и перенос строк берутся из общей базы
 * assets/mtk40/lib/mtk40.js — она подключена классическим скриптом в
 * index.html и остаётся единственным источником истины и для прототипов,
 * и для сцен. ESM-копия развела бы две реализации.
 *
 * Отличие сцены от прототипа:
 *  - рисуем в CSS-пикселях (трансформ канвы уже учитывает DPR и кап буфера),
 *    поэтому в сценах нет умножений на dpr, а координаты указателя берутся
 *    как есть;
 *  - «дизайн-единица» s учитывает не только ширину кадра, но и масштаб
 *    контента из ядра — регулятор оператора и режим слабовидящих работают сами;
 *  - обвязка сцены верстается от полос ядра (--kiosk-safe-*), а не от края.
 */
export const M = window.MTK40;
export const PLACES = window.MTK40_PLACES;

export const DESIGN_W = 1280;
const MAX_BUFFER_PX = 8.3e6;   // канон перф-бюджета

/**
 * Канва сцены с честным жизненным циклом.
 * Петля обязана полностью останавливаться на pause() — это проверяется
 * на приёмке (0 rAF у неактивных сцен).
 */
export function createCanvas(el, { onSize, onFrame }) {
  const canvas = document.createElement("canvas");
  canvas.className = "m40-canvas";
  el.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let raf = 0;
  let lastW = 0, lastH = 0;
  let ro = null;

  function measure() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // Ноль означает «слой спрятан», а не новый размер: скрытый слой 0×0, и
    // ResizeObserver отдаёт сначала ноль, а потом настоящую ширину.
    if (!w || !h) return false;
    if (w === lastW && h === lastH) return false;
    lastW = w; lastH = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let scale = dpr;
    if (w * h * dpr * dpr > MAX_BUFFER_PX) scale = Math.sqrt(MAX_BUFFER_PX / (w * h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    // рисуем в CSS-пикселях: масштаб буфера прячется в трансформе
    ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    return true;
  }

  const api = {
    canvas, ctx,
    get w() { return lastW; },
    get h() { return lastH; },
    /* Меряем сами на входе: в скрытой вкладке ResizeObserver не доставляется,
     * и первая раскладка по нему не придёт. Наблюдатель — только для
     * последующих изменений. */
    sync() { if (measure() && onSize) onSize(lastW, lastH); },
    start() {
      if (raf) return;
      api.sync();
      const tick = () => { raf = requestAnimationFrame(tick); onFrame(); };
      raf = requestAnimationFrame(tick);
    },
    stop() {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    },
    observe() {
      if (ro) return;
      ro = new ResizeObserver(() => { if (measure() && onSize) onSize(lastW, lastH); });
      ro.observe(canvas);
    },
    destroy() {
      api.stop();
      if (ro) { ro.disconnect(); ro = null; }
      canvas.remove();
    },
  };
  return api;
}

/** Дизайн-единица: ширина кадра + масштаб контента из ядра. */
export function unit(app, cssW) {
  const content = app && app.scales ? app.scales().content : 1;
  return (cssW / DESIGN_W) * (content || 1);
}

/** Корпус с индексами — тот же вид, что отдаёт M.loadCorpus() прототипам. */
export function corpusOf(data) {
  const items = data.items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const connsByItem = new Map();
  for (const c of data.connections || []) {
    for (const end of [c.from, c.to]) {
      if (!connsByItem.has(end)) connsByItem.set(end, []);
      connsByItem.get(end).push(c);
    }
  }
  return { data, items, connections: data.connections || [], byId, connsByItem };
}

/**
 * Карточка книги. Разметка одна на все сцены; строки — через словарь ядра,
 * хардкод запрещён контрактом.
 */
export function createCard(el, corpus, app) {
  const box = document.createElement("aside");
  box.className = "m40-card";
  box.hidden = true;
  box.innerHTML =
    '<button class="m40-card__close" type="button"></button>' +
    '<div class="m40-card__cat"></div>' +
    '<h2 class="m40-card__name"></h2>' +
    '<p class="m40-card__author"></p>' +
    '<p class="m40-card__where"></p>' +
    '<p class="m40-card__text"></p>' +
    '<ul class="m40-card__conns kiosk-scroll" hidden></ul>';
  el.appendChild(box);

  const q = (sel) => box.querySelector(sel);
  const closeBtn = q(".m40-card__close");
  let onClose = null;

  function paintChrome() {
    closeBtn.setAttribute("aria-label", app.t("card.close"));
    closeBtn.textContent = "✕";
  }
  closeBtn.addEventListener("click", () => { hide(); if (onClose) onClose(); });

  function show(item) {
    const meta = M.BUCKET_META[item.bucket];
    q(".m40-card__cat").textContent =
      `${app.t("bucket." + item.bucket)} · ${item.year_first ?? ""}`;
    q(".m40-card__name").textContent = item.title;
    q(".m40-card__author").textContent = item.author || "";
    q(".m40-card__where").textContent = [
      item.place_first,
      item.pages_approx ? app.t("card.pages", { n: item.pages_approx }) : null,
      app.t("type." + item.type),
    ].filter(Boolean).join(" · ");
    q(".m40-card__text").textContent = item.short_text || "";
    box.style.setProperty("--m40-accent", meta.accent);

    const list = q(".m40-card__conns");
    const conns = corpus.connsByItem.get(item.id) || [];
    if (!conns.length) list.hidden = true;
    else {
      list.innerHTML = "";
      for (const c of conns) {
        const otherId = c.from === item.id ? c.to : c.from;
        const other = corpus.byId.get(otherId);
        const li = document.createElement("li");
        const b = document.createElement("b");
        b.textContent = app.t("conn." + c.type);
        li.append(b, document.createTextNode(
          ` ${c.from === item.id ? "→" : "←"} ${other ? other.title : otherId}`));
        list.appendChild(li);
      }
      list.hidden = false;
    }
    box.hidden = false;
  }
  function hide() { box.hidden = true; }

  paintChrome();
  return {
    el: box, show, hide,
    get visible() { return !box.hidden; },
    setLang: paintChrome,
    set onClose(fn) { onClose = fn; },
  };
}

/** Кнопка-чип сцены: единый вид фильтров и режимов во всех сценах. */
export function chip(label, { pressed = false, accent = null, count = null, onClick }) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "m40-chip";
  b.setAttribute("aria-pressed", String(pressed));
  b.textContent = label;
  if (count != null) {
    const n = document.createElement("span");
    n.className = "m40-chip__n";
    n.textContent = count;
    b.appendChild(n);
  }
  if (accent) b.style.setProperty("--m40-chip-accent", accent);
  b.addEventListener("click", onClick);
  return b;
}
