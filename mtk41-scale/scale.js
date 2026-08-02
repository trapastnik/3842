/**
 * МТК 41 · «В одном масштабе» — 283 памятника Ленину на общей шкале высот.
 *
 * Навигация. 283 памятника при слоте 84 px дают ленту в 23 772 px: на киоске
 * 3840 это 6,2 экрана драга, где посетитель не понимает ни где он, ни сколько
 * осталось. Три способа это решить сведены в один прототип переключателем —
 * материал у них общий, разница только в том, как двигаться по ленте:
 *
 *   СКРАББЕР    полоса внизу, в которую сжата вся хронология. Штрих на
 *               памятник высотой ~ его росту, так что полоса читается и как
 *               спарклайн: видна вспышка 1925-го и пик 1970-го. Тап — прыжок,
 *               драг — промотка через весь корпус одним жестом.
 *   ЗУМ         ширина слота переменная. «Весь корпус» сжимает 283 фигуры в
 *               экран: подписи нечитаемы, зато видна форма массива — редкие
 *               1930-40-е, частокол 1950-70-х, обрыв после 1991-го.
 *   ДЕСЯТИЛЕТИЯ промотки нет вовсе, страницы по десятилетиям.
 *
 * Во всех режимах масштаб метра в пикселях считается ОДИН РАЗ по всему корпусу
 * и не зависит от того, что сейчас на экране. Это принципиально: посчитай его
 * по видимым — и на странице 1920-х четырёхметровый бюст займёт ту же высоту,
 * что колосс 57 м, а «в одном масштабе» перестанет быть правдой. Пустота над
 * ранними фигурами — не изъян раскладки, а само сообщение.
 *
 * Инерция на драге общая для всех режимов: без неё шесть экранов требуют шести
 * отдельных свайпов.
 */
(function () {
  const canvas = document.getElementById("scale");
  const ctx = canvas.getContext("2d", { alpha: true });

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

  const MODES = [
    { id: "scrubber", label: "Скраббер" },
    { id: "zoom", label: "Зум" },
    { id: "decades", label: "Десятилетия" },
  ];
  const STORAGE_KEY = "mtk41-scale-mode";

  const STRIP_H = 74;            // высота полосы-скраббера
  const STRIP_PAD = 28;          // поля полосы по горизонтали
  const FRICTION = 0.93;         // затухание инерции за кадр
  const MIN_VELOCITY = 0.4;      // ниже — считаем, что остановились
  const SLOT_MAX = 120;          // самый крупный слот в режиме зума
  const LABEL_MIN_SLOT = 34;     // уже — подписи городов не влезают
  const YEAR_MIN_SLOT = 16;      // уже — не рисуем и годы
  const TAP_MIN_SLOT = 26;       // уже — тап по фигуре не ловим, только обзор
  const DOUBLE_TAP_MS = 320;

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

  let mode = "scrubber";
  let slotW = 0;                       // режим «зум» — переменная ширина слота
  let fitSlotW = 0;                    // слот, при котором весь корпус влезает
  let activeDecade = null;             // режим «десятилетия»; null — все
  let globalMaxTotal = 0;              // максимум высоты по ВСЕМУ корпусу

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
  let onStrip = false;                 // жест начался на полосе-скраббере
  let velocityX = 0;                   // px/кадр, для инерции драга
  const TAP_THRESHOLD = 8;
  const pointers = new Map();          // активные касания — для пинча
  let pinchStartDist = 0, pinchStartSlot = 0, pinchAnchorX = 0;
  let lastTapAt = 0;

  function hasStrip() { return mode === "scrubber"; }
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
    const all = monuments.map((m, i) => {
      let y = m.year;
      if (typeof y !== "number") {
        if (m.id && m.id.includes("1920s")) y = 1925;
        else if (m.id === "gorki-pinchuk-taurit") y = 1949;
        else y = 1930;
      }
      return { m, i, year: y };
    }).sort((a, b) => a.year - b.year);

    // Масштаб — по всему корпусу, независимо от режима и выбранной страницы.
    globalMaxTotal = 0;
    for (const it of all) globalMaxTotal = Math.max(globalMaxTotal, totalHeight(it.m.id));

    const items = (mode === "decades" && activeDecade !== null)
      ? all.filter(it => Math.floor(it.year / 10) * 10 === activeDecade)
      : all;
    if (!items.length) return;

    const left = width * PAD_LEFT;
    const right = width * 0.98;
    const viewportW = right - left;
    // Землю поднимаем над полосой-скраббером, иначе подписи городов уезжают
    // под неё: они рисуются на 3 строки ниже baseY.
    const baseY = hasStrip() ? (height - STRIP_H) * 0.84 : height * 0.86;
    const skyTop = height * 0.20;                    // top reserved for title
    const usableHeight = baseY - skyTop;
    const mPx = (usableHeight * 0.9) / globalMaxTotal;

    fitSlotW = viewportW / items.length;
    let effSlot;
    if (mode === "zoom") {
      if (!slotW) slotW = fitSlotW;                  // старт — весь корпус
      slotW = Math.min(SLOT_MAX, Math.max(fitSlotW, slotW));
      effSlot = slotW;
    } else if (mode === "decades") {
      // Внутри десятилетия промотки быть не должно — слот ужимаем под страницу.
      // Нижняя граница 30 px: уже палец не попадает, и лента всё-таки станет
      // прокручиваемой (это 1970-е с их 65 памятниками на узком окне).
      effSlot = Math.max(30, Math.min(MIN_SLOT_W * 1.6, fitSlotW));
    } else {
      effSlot = Math.max(MIN_SLOT_W, fitSlotW);
    }
    const figureW = Math.min(effSlot * 0.55, 80);

    for (let k = 0; k < items.length; k += 1) {
      const it = items[k];
      const m = it.m;
      const h = HEIGHTS[m.id] || FALLBACK_HEIGHT;
      placed.push({
        i: it.i, year: it.year, m,
        worldX: left + effSlot * (k + 0.5),
        baseY,
        w: figureW,
        statueH: h.statue * mPx,
        pedestalH: h.pedestal * mPx,
        totalH: (h.statue + h.pedestal) * mPx,
        h_statue: h.statue, h_pedestal: h.pedestal,
        // У части памятников в таблице куратора габаритов нет вовсе. Раньше
        // они молча получали FALLBACK_HEIGHT и стояли в ряду как измеренные —
        // мемориальная плита выглядела семиметровой. Помечаем, чтобы отрисовать
        // контуром и подписать «нет данных».
        estimated: !HEIGHTS[m.id],
      });
    }

    contentLeft = left;
    contentRight = left + effSlot * items.length;
    clampPan();

    layout.mPx = mPx;
    layout.left = left;
    layout.right = right;
    layout.baseY = baseY;
    layout.slotW = effSlot;
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
      if (x < -80 || x > width + 80) continue;      // за кадром — не рисуем
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

      // Statue: прямоугольник корпуса + прямоугольник «головы» — stacked blocks.
      const sBottom = bottomOfStatue;
      const sTop = sBottom - pm.statueH;
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
        ctx.fillStyle = isSelected ? palette.brass : statusColor(m.status);
        ctx.globalAlpha = m.status === "unknown" ? 0.55 : 0.92;
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

    // Ширину слота берём из layout(): в placed лежит worldX, а не x, и прежнее
    // выражение placed[1].x - placed[0].x молча давало NaN — подписи не
    // поворачивались никогда.
    const slot = layout.slotW || 60;
    // На обзорных масштабах подписи сливаются в кашу и мешают увидеть форму
    // корпуса, ради которой в мелкий масштаб и уходят.
    if (slot < YEAR_MIN_SLOT) return;
    const showCity = slot >= LABEL_MIN_SLOT;
    const isPortrait = height > width;
    const needRotate = isPortrait || slot < 90;

    for (const pm of placed) {
      const m = pm.m;
      const sx = screenX(pm.worldX);
      if (sx < -120 || sx > width + 120) continue;
      const isSelected = pm.i === selectedIndex;
      const y = pm.baseY + 14;
      const fontSize = isPortrait
        ? Math.max(13, Math.min(slot * 0.32, height * 0.014))
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
        ctx.translate(sx, y);
        ctx.rotate(-Math.PI / 3);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        let row = 0;
        if (showCity) {
          ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.85);
          ctx.fillText(city, 0, 0);
          row += 1;
        }
        ctx.fillStyle = cssColor(palette.brass, isSelected ? 0.95 : 0.6);
        ctx.fillText(yearLabel, 0, fontSize * 1.25 * row);
        if (showCity) {
          ctx.fillStyle = cssColor(palette.paper, 0.55);
          ctx.fillText(heightLabel, 0, fontSize * 2.5);
        }
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        let row = 0;
        if (showCity) {
          ctx.fillStyle = isSelected ? palette.brass : cssColor(palette.paper, 0.78);
          ctx.fillText(city, sx, y);
          row += 1;
        }
        ctx.fillStyle = cssColor(palette.brass, isSelected ? 0.9 : 0.55);
        ctx.fillText(yearLabel, sx, y + fontSize * 1.4 * row);
        if (showCity) {
          ctx.fillStyle = cssColor(palette.paper, 0.55);
          ctx.fillText(heightLabel, sx, y + fontSize * 2.8);
        }
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

  function scrollToFraction(f) {
    const contentW = contentRight - contentLeft;
    const viewportW = (layout.right || width) - (layout.left || 0);
    const span = contentW - viewportW;
    if (span <= 0) return;
    viewOffsetX = -Math.min(1, Math.max(0, f)) * span;
    clampPan();
  }

  function drawStrip() {
    if (!hasStrip() || !placed.length) return;
    const top = stripTop();
    const x0 = STRIP_PAD;
    const w = (width - STRIP_PAD) - x0;
    const barsTop = top + 20;                 // 20 px сверху — под подписи лет
    const barsH = STRIP_H - 30;

    ctx.save();
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
    const barW = Math.max(1, w / placed.length - 0.6);
    for (let k = 0; k < placed.length; k += 1) {
      const pm = placed[k];
      const bx = x0 + (w * k) / placed.length;
      const total = pm.h_statue + pm.h_pedestal;
      // sqrt — иначе 57-метровый Волгоград прижимает все остальные к нулю
      const bh = Math.max(2, barsH * Math.sqrt(total / globalMaxTotal));
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

  // --- Зум -----------------------------------------------------------------

  function setSlotW(next, anchorScreenX) {
    if (mode !== "zoom") return;
    const clamped = Math.min(SLOT_MAX, Math.max(fitSlotW, next));
    if (clamped === slotW) return;
    // Держим точку под пальцем на месте: пересчитываем смещение так, чтобы
    // мировая координата под anchorScreenX осталась той же после смены слота.
    const worldBefore = (anchorScreenX - viewOffsetX - (layout.left || 0)) / slotW;
    slotW = clamped;
    layout();
    viewOffsetX = anchorScreenX - (layout.left || 0) - worldBefore * slotW;
    clampPan();
    syncControls();
  }

  // --- Панель управления ---------------------------------------------------

  function mkButton(label, count, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (count != null) {
      const s = document.createElement("span");
      s.className = "n";
      s.textContent = String(count);
      b.appendChild(s);
    }
    b.addEventListener("click", onClick);
    return b;
  }

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    viewOffsetX = 0;
    velocityX = 0;
    slotW = 0;                 // зум всегда открывается с «весь корпус»
    activeDecade = null;
    hideMonument();
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) { /* киоск без хранилища */ }
    buildControls();
    resize();
  }

  /** Первый ряд — режим навигации, второй — его собственные органы. */
  function buildControls() {
    const bar = document.getElementById("nav-modes");
    const sub = document.getElementById("nav-sub");
    if (!bar || !sub) return;

    bar.textContent = "";
    for (const m of MODES) {
      const b = mkButton(m.label, null, () => setMode(m.id));
      b.dataset.mode = m.id;
      bar.appendChild(b);
    }

    sub.textContent = "";
    if (mode === "zoom") {
      const all = mkButton("Весь корпус", null, () => setSlotW(fitSlotW, width / 2));
      all.dataset.zoom = "all";
      const zin = mkButton("Крупно", null, () => setSlotW(SLOT_MAX * 0.7, width / 2));
      zin.dataset.zoom = "in";
      sub.append(all, zin);
    } else if (mode === "decades") {
      const counts = new Map();
      for (const m of monuments) {
        const y = typeof m.year === "number" ? m.year : 1930;
        const d = Math.floor(y / 10) * 10;
        counts.set(d, (counts.get(d) || 0) + 1);
      }
      const b = mkButton("Все", monuments.length, () => {
        activeDecade = null; viewOffsetX = 0; hideMonument(); layout(); syncControls();
      });
      b.dataset.decade = "all";
      sub.appendChild(b);
      for (const d of [...counts.keys()].sort((a, b2) => a - b2)) {
        const btn = mkButton(`${d}-е`, counts.get(d), () => {
          activeDecade = d; viewOffsetX = 0; hideMonument(); layout(); syncControls();
        });
        btn.dataset.decade = String(d);
        sub.appendChild(btn);
      }
    }
    syncControls();
  }

  function syncControls() {
    const bar = document.getElementById("nav-modes");
    const sub = document.getElementById("nav-sub");
    if (bar) {
      for (const b of bar.querySelectorAll("button")) {
        b.classList.toggle("is-on", b.dataset.mode === mode);
      }
    }
    if (!sub) return;
    if (mode === "zoom") {
      const atFit = slotW <= fitSlotW + 0.5;
      for (const b of sub.querySelectorAll("button")) {
        b.classList.toggle("is-on", b.dataset.zoom === (atFit ? "all" : "in"));
      }
    } else if (mode === "decades") {
      const want = activeDecade === null ? "all" : String(activeDecade);
      for (const b of sub.querySelectorAll("button")) {
        b.classList.toggle("is-on", b.dataset.decade === want);
      }
    }
  }

  // --- Рендер и ввод -------------------------------------------------------

  function render() {
    // Инерция драга
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
      if (x >= screenX(pm.worldX) - hx && x <= screenX(pm.worldX) + hx
          && y >= top - 14 && y <= bottom + 30) {
        const d = Math.abs(x - screenX(pm.worldX));
        if (d < bestDist) { bestDist = d; best = pm.i; }
      }
    }
    return best;
  }

  let lastPointerX = 0;

  canvas.addEventListener("pointerdown", event => {
    pointers.set(event.pointerId, event.clientX);
    if (mode === "zoom" && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.abs(a - b);
      pinchStartSlot = slotW;
      pinchAnchorX = (a + b) / 2;
      pointerDown = false;
      return;
    }
    pointerDown = true;
    didDrag = false;
    velocityX = 0;
    pressStartX = event.clientX;
    pressStartY = event.clientY;
    lastPointerX = event.clientX;
    onStrip = hasStrip() && event.clientY >= stripTop();
    if (onStrip) scrollToFraction(stripFractionAt(event.clientX));
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(event.pointerId); } catch (e) {}
    }
  });

  canvas.addEventListener("pointermove", event => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, event.clientX);
    if (mode === "zoom" && pointers.size === 2 && pinchStartDist > 0) {
      const [a, b] = [...pointers.values()];
      setSlotW(pinchStartSlot * (Math.abs(a - b) / pinchStartDist), pinchAnchorX);
      return;
    }
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
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    if (pointerDown && !didDrag && !onStrip) {
      const now = performance.now();
      if (mode === "zoom" && now - lastTapAt < DOUBLE_TAP_MS) {
        // Двойной тап — качели между обзором и деталью, в точке касания.
        setSlotW(slotW > fitSlotW + 0.5 ? fitSlotW : SLOT_MAX * 0.7, event.clientX);
        lastTapAt = 0;
      } else {
        lastTapAt = now;
        // На обзорном зуме фигура уже 5 px — попасть в неё пальцем нельзя,
        // и «промах» с закрытием карточки раздражал бы. Просто не ловим.
        if ((layout.slotW || 0) >= TAP_MIN_SLOT) {
          const hit = findAt(event.clientX, event.clientY);
          if (hit >= 0) showMonument(hit);
          else hideMonument();
        }
      }
    }
    pointerDown = false;
    onStrip = false;
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", event => {
    pointers.delete(event.pointerId);
    pointerDown = false;
  });

  canvas.addEventListener("wheel", event => {
    if (mode !== "zoom") return;
    event.preventDefault();
    setSlotW(slotW * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX);
  }, { passive: false });

  window.addEventListener("resize", resize);

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && MODES.some(m => m.id === saved)) mode = saved;
  } catch (e) { /* киоск без хранилища — остаёмся на дефолте */ }

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
        + `Слева — человек 1.75 м. Справа вверху — способ движения по ленте.`;
    });
    buildControls();
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
