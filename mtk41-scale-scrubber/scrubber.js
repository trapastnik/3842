/**
 * МТК 41 · Масштаб, вариант навигации «год-скраббер».
 *
 * Задача: 283 памятника при слоте 84 px дают ленту в 23 772 px — на киоске
 * 3840 это 6,2 экрана сплошного драга, где посетитель не понимает ни где он,
 * ни сколько осталось. Базовый mtk41-scale не даёт никаких ориентиров.
 *
 * Решение: под сценой — полоса во всю ширину, в которую сжата ВСЯ хронология.
 * Каждый памятник — вертикальный штрих высотой ~ его росту, так что полоса
 * заодно читается как спарклайн: видно вспышку 1925-го и пик 1970-го. Текущее
 * окно просмотра подсвечено рамкой. Тап по полосе — прыжок, драг по полосе —
 * быстрая промотка через весь корпус за один жест.
 *
 * Плюс инерция на основном драге: без неё шесть экранов требуют шести свайпов.
 */
(function () {
  const canvas = document.getElementById("scale");
  const ctx = canvas.getContext("2d", { alpha: true });

  const STRIP_H = 74;            // высота полосы-скраббера
  const STRIP_PAD = 28;          // поля полосы по горизонтали
  const FRICTION = 0.93;         // затухание инерции за кадр
  const MIN_VELOCITY = 0.4;      // ниже — считаем, что остановились

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    graphite: "#435059",
    window: "#9DA3A6",
  };

  // Heights loaded from assets/mtk41/heights.json (sourced from the curator's
  // monument table — column «Размеры»). Conservative fallback for entries
  // without a height in the catalog.
  let HEIGHTS = {};
  const FALLBACK_HEIGHT = { statue: 5.0, pedestal: 2.0 };

  const HUMAN_HEIGHT_M = 1.75;

  let width = 0, height = 0, dpr = 1;
  let monuments = [];
  let placed = [];                     // { i, worldX, baseY, w, statueH, pedestalH, totalH }
  let selectedIndex = -1;

  // Horizontal pan state — items keep `worldX` (absolute), `viewOffsetX` scrolls
  let viewOffsetX = 0;
  let contentLeft = 0;                 // first item's leftmost world-x
  let contentRight = 0;                // last item's rightmost world-x
  const PAD_LEFT = 0.13;               // viewport fraction reserved for height-guides + human ref
  const MIN_SLOT_W = 84;               // touch-friendly minimum per monument

  // --- Card delegation ----------------------------------------------------
  // All card UI lives in assets/mtk41/lib/card.{css,js}. Delegate to it.

  function showMonument(index) {
    selectedIndex = index;
    if (window.MtkCard) window.MtkCard.show(monuments[index]);
  }
  function hideMonument() {
    if (window.MtkCard) window.MtkCard.hide();
  }
  document.addEventListener("mtk-card-hidden", () => { selectedIndex = -1; });

  let pressStartX = 0, pressStartY = 0;
  let didDrag = false;
  let pointerDown = false;
  let onStrip = false;           // жест начался на полосе-скраббере
  let velocityX = 0;             // px/кадр, для инерции основного драга
  const TAP_THRESHOLD = 8;

  function stripTop() { return height - STRIP_H; }

  function cssColor(hex, alpha) {
    const v = hex.replace("#", "");
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function statusColor(status) {
    switch (status) {
      case "extant":     return palette.red;
      case "demolished": return palette.graphite;
      case "relocated":  return palette.brass;
      default:           return palette.window;
    }
  }

  function totalHeight(id) {
    const h = HEIGHTS[id] || FALLBACK_HEIGHT;
    return h.statue + h.pedestal;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
  }

  function layout() {
    placed = [];
    if (!monuments.length) return;

    // Sort chronologically (null years assigned to their decade midpoint)
    const items = monuments.map((m, i) => {
      let y = m.year;
      if (typeof y !== "number") {
        if (m.id && m.id.includes("1920s")) y = 1925;
        else if (m.id === "gorki-pinchuk-taurit") y = 1949;
        else y = 1930;
      }
      return { m, i, year: y };
    }).sort((a, b) => a.year - b.year);

    const left = width * PAD_LEFT;
    const right = width * 0.98;
    const viewportW = right - left;
    // Землю поднимаем над полосой-скраббером, иначе подписи городов уезжают
    // под неё: они рисуются на 3 строки ниже baseY.
    const baseY = (height - STRIP_H) * 0.84;         // ground line
    const skyTop = height * 0.20;                    // top reserved for title
    const usableHeight = baseY - skyTop;

    // Find the tallest monument → scale so it fills usableHeight × 0.9
    let maxTotal = 0;
    for (const it of items) maxTotal = Math.max(maxTotal, totalHeight(it.m.id));
    // 1 metre in pixels:
    const mPx = (usableHeight * 0.9) / maxTotal;

    // Slot width: either pack 94 into viewport, or use a touch-friendly minimum
    // (whichever is larger). With min 84px and 94 items the lineup is 7896px
    // wide → user pans horizontally.
    const slotW = Math.max(MIN_SLOT_W, viewportW / items.length);
    const figureW = Math.min(slotW * 0.55, 80);

    for (let k = 0; k < items.length; k += 1) {
      const it = items[k];
      const m = it.m;
      const h = HEIGHTS[m.id] || FALLBACK_HEIGHT;
      const worldX = left + slotW * (k + 0.5);
      const totalH = (h.statue + h.pedestal) * mPx;
      const statueH = h.statue * mPx;
      const pedestalH = h.pedestal * mPx;
      placed.push({
        i: it.i, year: it.year, m,
        worldX, baseY,
        w: figureW,
        statueH, pedestalH, totalH,
        h_statue: h.statue, h_pedestal: h.pedestal,
        // У части памятников в таблице куратора габаритов нет вовсе. Раньше
        // они молча получали FALLBACK_HEIGHT и стояли в ряду как измеренные —
        // мемориальная плита выглядела семиметровой. Помечаем, чтобы отрисовать
        // контуром и подписать «нет данных».
        estimated: !HEIGHTS[m.id],
      });
    }

    contentLeft = left;
    contentRight = left + slotW * items.length;
    // Clamp pan to keep content within the viewport
    clampPan();

    layout.mPx = mPx;
    layout.left = left;
    layout.right = right;
    layout.baseY = baseY;
    layout.slotW = slotW;
  }

  function clampPan() {
    const contentW = contentRight - contentLeft;
    const viewportW = (layout.right || width * 0.98) - (layout.left || width * PAD_LEFT);
    if (contentW <= viewportW) {
      viewOffsetX = 0;
      return;
    }
    const min = viewportW - contentW;     // negative — most panned right
    const max = 0;                         // not panned (showing start)
    if (viewOffsetX > max) viewOffsetX = max;
    if (viewOffsetX < min) viewOffsetX = min;
  }

  function screenX(worldX) {
    return worldX + viewOffsetX;
  }

  function drawScene() {
    const mPx = layout.mPx || 1;
    const baseY = layout.baseY || height * 0.86;

    // Ground line
    ctx.strokeStyle = cssColor(palette.brass, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(width, baseY);
    ctx.stroke();

    // Horizontal height guides (1.75, 5, 10, 25, 50 metres)
    const guides = [1.75, 5, 10, 25, 50];
    ctx.save();
    ctx.font = `400 ${Math.max(11, height * 0.013)}px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const m of guides) {
      const y = baseY - m * mPx;
      if (y < height * 0.05) continue;
      const isHuman = m === HUMAN_HEIGHT_M;
      ctx.strokeStyle = isHuman ? cssColor(palette.brass, 0.4) : cssColor(palette.paper, 0.10);
      ctx.lineWidth = isHuman ? 1.2 : 0.7;
      ctx.setLineDash(isHuman ? [4, 6] : [2, 10]);
      ctx.beginPath();
      ctx.moveTo(width * 0.08, y);
      ctx.lineTo(width * 0.97, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cssColor(palette.paper, isHuman ? 0.9 : 0.45);
      const txt = isHuman ? `${m} м — человек` : `${m} м`;
      ctx.fillText(txt, width * 0.075, y);
    }
    ctx.restore();

    // Human figure for reference (at left edge, in front of the lineup)
    drawHumanFigure(width * 0.045, baseY, HUMAN_HEIGHT_M * mPx);
  }

  function drawHumanFigure(cx, baseY, totalPx) {
    // Stylised silhouette: head, body, legs in graphite tone
    const headR = totalPx * 0.075;
    const bodyT = totalPx * 0.55;     // body top
    const legT = totalPx * 0.20;      // legs start from
    ctx.save();
    ctx.fillStyle = cssColor(palette.paper, 0.55);

    // Head
    ctx.beginPath();
    ctx.arc(cx, baseY - totalPx + headR, headR, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.beginPath();
    ctx.moveTo(cx - totalPx * 0.06, baseY - totalPx + headR * 2);
    ctx.lineTo(cx + totalPx * 0.06, baseY - totalPx + headR * 2);
    ctx.lineTo(cx + totalPx * 0.08, baseY - legT);
    ctx.lineTo(cx - totalPx * 0.08, baseY - legT);
    ctx.closePath();
    ctx.fill();
    // Legs
    ctx.fillRect(cx - totalPx * 0.07, baseY - legT, totalPx * 0.05, legT);
    ctx.fillRect(cx + totalPx * 0.02, baseY - legT, totalPx * 0.05, legT);

    ctx.restore();
  }

  function drawMonuments() {
    for (const pm of placed) {
      const m = pm.m;
      const isSelected = pm.i === selectedIndex;
      const x = screenX(pm.worldX);
      const bottomOfStatue = pm.baseY - pm.pedestalH;

      // Pedestal: graphite rectangle. У записей без габаритов постамент такой
      // же домысел, как и фигура, — рисуем пунктиром, без заливки.
      ctx.save();
      if (!pm.estimated) {
        ctx.fillStyle = isSelected
          ? cssColor(palette.brass, 0.5)
          : cssColor(palette.graphite, 0.92);
        ctx.fillRect(x - pm.w * 0.4, bottomOfStatue, pm.w * 0.8, pm.pedestalH);
      } else {
        ctx.setLineDash([4, 4]);
      }
      ctx.strokeStyle = isSelected
        ? palette.brass
        : cssColor(palette.window, pm.estimated ? 0.7 : 0.5);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(x - pm.w * 0.4, bottomOfStatue, pm.w * 0.8, pm.pedestalH);
      ctx.restore();

      // Statue: stylised — trapezoid body topped with sphere head
      const sBottom = bottomOfStatue;
      const sTop = sBottom - pm.statueH;
      const statueFill = isSelected
        ? palette.brass
        : statusColor(m.status);
      const statueOpacity = m.status === "unknown" ? 0.55 : 0.92;

      // Прямоугольник корпуса + прямоугольник «головы» — stacked blocks.
      const bodyW = pm.w * 0.5;
      const headW = pm.w * 0.32;
      const headH = pm.statueH * 0.22;
      const bodyTop = sTop + headH;

      ctx.save();
      if (pm.estimated) {
        // Габаритов нет — рисуем только пунктирный контур: видно, что фигура
        // занимает место в ряду, но её высота не измерена, а подставлена.
        ctx.strokeStyle = cssColor(isSelected ? palette.brass : palette.window, 0.7);
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x - bodyW * 0.5, bodyTop, bodyW, sBottom - bodyTop);
        ctx.strokeRect(x - headW * 0.5, sTop, headW, headH);
      } else {
        ctx.fillStyle = statueFill;
        ctx.globalAlpha = statueOpacity;
        ctx.fillRect(x - bodyW * 0.5, bodyTop, bodyW, sBottom - bodyTop);
        ctx.fillRect(x - headW * 0.5, sTop, headW, headH);
      }
      ctx.restore();

      if (!pm.estimated) {
        ctx.save();
        ctx.strokeStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.5);
        ctx.lineWidth = isSelected ? 2 : 0.8;
        ctx.strokeRect(x - bodyW * 0.5, bodyTop, bodyW, sBottom - bodyTop);
        ctx.strokeRect(x - headW * 0.5, sTop, headW, headH);
        ctx.restore();
      }
    }

    // Labels (city + year + height) below pedestal.
    // In portrait the slot is narrow → labels rotate -60° so they don't
    // overlap their neighbours.
    const isPortrait = height > width;
    // Ширину слота берём из layout(): placed[k].x не существует (там worldX),
    // и прежнее выражение молча давало NaN — подписи не поворачивались никогда.
    const slotW = layout.slotW || 60;
    const needRotate = isPortrait || slotW < 90;

    for (const pm of placed) {
      const m = pm.m;
      const isSelected = pm.i === selectedIndex;
      const y = pm.baseY + 14;
      const fontSize = isPortrait
        ? Math.max(13, Math.min(slotW * 0.32, height * 0.014))
        : Math.max(10, Math.min(pm.w * 0.32, height * 0.013));
      ctx.save();
      ctx.font = `${isSelected ? 600 : 400} ${fontSize}px "20 Kopeek", "Courier New", monospace`;
      const cityRaw = m.city || m.country || "";
      const city = cityRaw.length > 18 ? cityRaw.slice(0, 16) + "…" : cityRaw;
      const yearLabel = pm.year ? String(pm.year) : "—";
      const heightLabel = pm.estimated
        ? "нет данных"
        : ((pm.h_statue + pm.h_pedestal).toFixed(
            pm.h_statue + pm.h_pedestal < 10 ? 1 : 0)) + " м";

      if (needRotate) {
        // Rotate labels -60° so a long city name doesn't collide with
        // the next slot. Year + height sit on parallel lines.
        ctx.translate(screenX(pm.worldX), y);
        ctx.rotate(-Math.PI / 3);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.85);
        ctx.fillText(city, 0, 0);
        ctx.fillStyle = cssColor(palette.brass, isSelected ? 0.95 : 0.6);
        ctx.fillText(yearLabel, 0, fontSize * 1.25);
        ctx.fillStyle = cssColor(palette.paper, 0.55);
        ctx.fillText(heightLabel, 0, fontSize * 2.5);
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.78);
        ctx.fillText(city, screenX(pm.worldX), y);
        ctx.fillStyle = cssColor(palette.brass, isSelected ? 0.9 : 0.55);
        ctx.fillText(yearLabel, screenX(pm.worldX), y + fontSize * 1.4);
        ctx.fillStyle = cssColor(palette.paper, 0.55);
        ctx.fillText(heightLabel, screenX(pm.worldX), y + fontSize * 2.8);
      }
      ctx.restore();
    }
  }

  // --- Полоса-скраббер -----------------------------------------------------

  /** Доля прокрутки 0..1: 0 — начало ленты, 1 — конец. */
  function scrollFraction() {
    const contentW = contentRight - contentLeft;
    const viewportW = (layout.right || width) - (layout.left || 0);
    const span = contentW - viewportW;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, -viewOffsetX / span));
  }

  /** Обратное к scrollFraction: поставить прокрутку в долю f. */
  function scrollToFraction(f) {
    const contentW = contentRight - contentLeft;
    const viewportW = (layout.right || width) - (layout.left || 0);
    const span = contentW - viewportW;
    if (span <= 0) return;
    viewOffsetX = -Math.min(1, Math.max(0, f)) * span;
    clampPan();
  }

  function drawStrip() {
    if (!placed.length) return;
    const top = stripTop();
    const x0 = STRIP_PAD;
    const x1 = width - STRIP_PAD;
    const w = x1 - x0;
    const barsTop = top + 20;                 // 20 px сверху — под подписи лет
    const barsH = STRIP_H - 30;

    ctx.save();

    // Подложка полосы
    ctx.fillStyle = cssColor(palette.graphite, 0.5);
    ctx.fillRect(0, top, width, STRIP_H);
    ctx.strokeStyle = cssColor(palette.paper, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(width, top);
    ctx.stroke();

    // Штрихи: по одному на памятник, высота ~ его росту. Полоса читается как
    // спарклайн по всему корпусу — сразу видно, где густо, а где пусто.
    let maxTotal = 0;
    for (const pm of placed) maxTotal = Math.max(maxTotal, pm.h_statue + pm.h_pedestal);
    const barW = Math.max(1, w / placed.length - 0.6);
    for (let k = 0; k < placed.length; k += 1) {
      const pm = placed[k];
      const bx = x0 + (w * k) / placed.length;
      const total = pm.h_statue + pm.h_pedestal;
      // sqrt — иначе 57-метровый Волгоград прижимает все остальные к нулю
      const bh = Math.max(2, barsH * Math.sqrt(total / maxTotal));
      ctx.fillStyle = pm.i === selectedIndex
        ? palette.brass
        : cssColor(statusColor(pm.m.status), pm.estimated ? 0.35 : 0.75);
      ctx.fillRect(bx, barsTop + barsH - bh, barW, bh);
    }

    // Подписи десятилетий по фактическому положению в ленте
    ctx.font = `400 11px "20 Kopeek", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let lastLabelX = -Infinity;
    for (let k = 0; k < placed.length; k += 1) {
      const year = placed[k].year;
      if (!year) continue;
      const decade = Math.floor(year / 10) * 10;
      // Метку ставим на ПЕРВЫЙ памятник десятилетия, а не на памятник ровного
      // года: в 1940-е и 2000-е ни один не пришёлся на год, кратный десяти,
      // и эти десятилетия оставались без подписи.
      const prevDecade = k > 0 && placed[k - 1].year
        ? Math.floor(placed[k - 1].year / 10) * 10 : -1;
      if (decade === prevDecade) continue;
      const bx = x0 + (w * k) / placed.length;
      if (bx - lastLabelX < 46) continue;                   // не наслаивать подписи
      lastLabelX = bx;
      ctx.strokeStyle = cssColor(palette.paper, 0.18);
      ctx.beginPath();
      ctx.moveTo(bx, barsTop);
      ctx.lineTo(bx, barsTop + barsH);
      ctx.stroke();
      ctx.fillStyle = cssColor(palette.paper, 0.5);
      ctx.fillText(String(decade), bx, top + 4);
    }

    // Текущее окно просмотра
    const contentW = contentRight - contentLeft;
    const viewportW = (layout.right || width) - (layout.left || 0);
    const winW = Math.max(10, w * Math.min(1, viewportW / contentW));
    const winX = x0 + (w - winW) * scrollFraction();
    ctx.fillStyle = cssColor(palette.paper, 0.10);
    ctx.fillRect(winX, barsTop - 4, winW, barsH + 8);
    ctx.strokeStyle = palette.brass;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(winX, barsTop - 4, winW, barsH + 8);

    ctx.restore();
  }

  function stripFractionAt(clientX) {
    const x0 = STRIP_PAD;
    const w = (width - STRIP_PAD) - x0;
    const viewportW = (layout.right || width) - (layout.left || 0);
    const contentW = contentRight - contentLeft;
    const winW = Math.max(10, w * Math.min(1, viewportW / contentW));
    // Тап ставит центр окна в точку касания, а не его левый край.
    return (clientX - x0 - winW / 2) / Math.max(1, w - winW);
  }

  function render() {
    // Инерция основного драга
    if (!pointerDown && Math.abs(velocityX) > MIN_VELOCITY) {
      viewOffsetX += velocityX;
      velocityX *= FRICTION;
      const before = viewOffsetX;
      clampPan();
      if (viewOffsetX !== before) velocityX = 0;   // упёрлись в край — гасим
    }
    ctx.clearRect(0, 0, width, height);
    drawScene();
    if (placed.length) drawMonuments();
    drawStrip();
    requestAnimationFrame(render);
  }

  function findAt(x, y) {
    let best = -1;
    let bestDist = Infinity;
    for (const pm of placed) {
      const top = pm.baseY - pm.totalH;
      const bottom = pm.baseY;
      const hx = Math.max(pm.w, 24);
      if (x >= screenX(pm.worldX) - hx && x <= screenX(pm.worldX) + hx && y >= top - 14 && y <= bottom + 30) {
        const d = Math.abs(x - screenX(pm.worldX));
        if (d < bestDist) { bestDist = d; best = pm.i; }
      }
    }
    return best;
  }


  let lastPointerX = 0;

  canvas.addEventListener("pointerdown", event => {
    pointerDown = true;
    didDrag = false;
    velocityX = 0;
    pressStartX = event.clientX;
    pressStartY = event.clientY;
    lastPointerX = event.clientX;
    onStrip = event.clientY >= stripTop();
    if (onStrip) scrollToFraction(stripFractionAt(event.clientX));
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
    }
  });

  canvas.addEventListener("pointermove", event => {
    if (!pointerDown) return;
    if (onStrip) {
      // На полосе перетаскивание абсолютное: палец = позиция окна.
      scrollToFraction(stripFractionAt(event.clientX));
      lastPointerX = event.clientX;
      return;
    }
    if (!didDrag &&
        Math.hypot(event.clientX - pressStartX, event.clientY - pressStartY) > TAP_THRESHOLD) {
      didDrag = true;
    }
    if (didDrag) {
      const dx = event.clientX - lastPointerX;
      viewOffsetX += dx;
      velocityX = dx;            // последнее смещение и есть скорость броска
      clampPan();
    }
    lastPointerX = event.clientX;
  }, { passive: true });

  function endPointer(event) {
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    if (pointerDown && !didDrag && !onStrip) {
      const hit = findAt(event.clientX, event.clientY);
      if (hit >= 0) showMonument(hit);
      else hideMonument();
    }
    pointerDown = false;
    onStrip = false;
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => { pointerDown = false; });

  window.addEventListener("resize", resize);

  Promise.all([
    fetch("../data/mtk41.json").then(r => r.json()),
    fetch("../assets/mtk41/heights.json").then(r => r.json()).catch(() => ({})),
  ]).then(([mtk, heights]) => {
    monuments = mtk.items || [];
    HEIGHTS = heights || {};
    // Крайние точки шкалы берём из самих высот: раньше они были вписаны в
    // разметку («от 60-сантиметрового бюста 1919-го») и разъехались с данными.
    Mtk41Stats.setSubtitle(monuments, () => {
      const byId = new Map(monuments.map(m => [m.id, m]));
      const totals = Object.entries(HEIGHTS)
        .map(([id, h]) => ({ id, total: (h.statue || 0) + (h.pedestal || 0) }))
        .filter(e => e.total > 0 && byId.has(e.id))
        .sort((a, b) => a.total - b.total);
      if (!totals.length) return "";
      const lo = totals[0], hi = totals[totals.length - 1];
      const name = e => `${byId.get(e.id).city}, ${byId.get(e.id).year}`;
      const fmt = v => (v < 1 ? `${Math.round(v * 100)} см` : `${(+v.toFixed(1))} м`);
      return `От ${fmt(lo.total)} (${name(lo)}) до ${fmt(hi.total)} (${name(hi)}). `
        + `Полоса внизу — вся хронология: тап или драг по ней перематывает.`;
    });
    resize();
    requestAnimationFrame(render);
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.warn("Load failed:", err);
    resize();
    requestAnimationFrame(render);
  });

  resize();
  requestAnimationFrame(render);
})();
