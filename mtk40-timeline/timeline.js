const COLORS = {
  paper: "#F7F9EF",
  brass: "#D2B773",
  red: "#A02128",
  graphite: "#435059",
  ink: "#0C1012",
};

const BUCKET_META = {
  "by-lenin":    { label: "ИМ",    accent: "#A02128", note: "что писал сам Ленин" },
  "about-lenin": { label: "О НЁМ", accent: "#D2B773", note: "что писали о нём"     },
  "in-library":  { label: "ЧИТАЛ", accent: "#5D6970", note: "что читал из чужого"  },
};

const CONN_STYLE = {
  "title-borrowing": { color: "#D2B773", width: 2.5, dash: [],          label: "заглавие"  },
  "polemic":         { color: "#A02128", width: 2,   dash: [10, 6],     label: "против"     },
  "source":          { color: "#F7F9EF", width: 1.6, dash: [],          label: "источник"  },
  "framework":       { color: "#7BA3C0", width: 1.6, dash: [],          label: "рамка"     },
  "conspectus":      { color: "#D2B773", width: 2,   dash: [2, 4],      label: "конспект"  },
  "wrote-about":     { color: "#7BA3C0", width: 1.6, dash: [10, 6],     label: "статья о"  },
  "parallel":        { color: "#9DA3A6", width: 1.6, dash: [3, 3],      label: "параллель" },
};

const YEAR_MIN = 1840;
const YEAR_MAX = 2025;

// «Ленинская» лента-разметка — годы-якоря с подписями
const TIMELINE_TICKS = [
  { year: 1848, label: "Манифест" },
  { year: 1870, label: "Рожд." },
  { year: 1895, label: "Союз борьбы" },
  { year: 1903, label: "II съезд" },
  { year: 1914, label: "I мировая" },
  { year: 1917, label: "Октябрь" },
  { year: 1924, label: "† Ленин" },
  { year: 1958, label: "ПСС-5" },
  { year: 1991, label: "распад СССР" },
  { year: 2017, label: "100 лет Окт." },
];

function adjustHex(hex, delta) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = clamp((n >> 16) + delta);
  const g = clamp(((n >> 8) & 0xff) + delta);
  const b = clamp((n & 0xff) + delta);
  return `rgb(${r},${g},${b})`;
}
function clamp(v) { return Math.max(0, Math.min(255, v | 0)); }

class TimelineApp {
  constructor() {
    this.canvas = document.getElementById("timeline");
    this.ctx = this.canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.activeId = null;
    this.cardEl = document.getElementById("card");
    this.cardConnsEl = document.getElementById("card-conns");
    this.cardEl.querySelector(".card__close").addEventListener("click", () => this.deselect());
    this.W = 0; this.H = 0;
    this.scrollY = 0; // не используем, оставлен задел
    this.zoom = 1;    // временный масштаб (drag-pan по X через zoom-окно)
    this.viewYearStart = YEAR_MIN;
    this.viewYearEnd = YEAR_MAX;
    this.dragging = null;
  }

  async start() {
    const r = await fetch("../data/mtk40.json?v=" + Date.now());
    this.data = await r.json();
    this.itemsById = new Map(this.data.items.map((i) => [i.id, i]));
    this.connectionsByItemId = new Map();
    for (const c of this.data.connections) {
      if (!this.connectionsByItemId.has(c.from)) this.connectionsByItemId.set(c.from, []);
      if (!this.connectionsByItemId.has(c.to)) this.connectionsByItemId.set(c.to, []);
      this.connectionsByItemId.get(c.from).push(c);
      this.connectionsByItemId.get(c.to).push(c);
    }
    this.bindEvents();
    this.resize();
    requestAnimationFrame(this.loop);
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.round(rect.width * this.dpr);
    this.H = Math.round(rect.height * this.dpr);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.computeLayout();
  }

  yearToX(year) {
    const sideMargin = 60 * this.dpr;
    const usableW = this.W - 2 * sideMargin;
    const r = (year - this.viewYearStart) / (this.viewYearEnd - this.viewYearStart);
    return sideMargin + r * usableW;
  }
  xToYear(x) {
    const sideMargin = 60 * this.dpr;
    const usableW = this.W - 2 * sideMargin;
    return this.viewYearStart + ((x - sideMargin) / usableW) * (this.viewYearEnd - this.viewYearStart);
  }

  computeLayout() {
    // Три горизонтальные «ленты» — по вертикали:
    // by-lenin (top), about-lenin (middle), in-library (bottom)
    const titleArea = 130 * this.dpr;
    const bottomArea = 70 * this.dpr;
    const usableH = this.H - titleArea - bottomArea;
    const order = ["by-lenin", "in-library", "about-lenin"];
    const sectionH = usableH / 3;
    const sections = {};
    for (let i = 0; i < order.length; i++) {
      sections[order[i]] = {
        top: titleArea + i * sectionH,
        height: sectionH,
        baseline: titleArea + (i + 1) * sectionH - 18 * this.dpr,
      };
    }
    this.layout = { sections, order };

    // resolve item positions (year_first → x). Для items без year_first ставим в начало.
    this.placedItems = [];
    for (const item of this.data.items) {
      const year = item.year_first || YEAR_MIN;
      const sec = sections[item.bucket];
      if (!sec) continue;
      this.placedItems.push({ item, year, sec });
    }
    // jitter для перекрывающихся (одинаковый год + бакет)
    this.placedItems.sort((a, b) => a.year - b.year);
    this.computeStackOffsets();
  }

  computeStackOffsets() {
    // если несколько items в близком году → размещаем их вертикально друг над другом в пределах секции
    const grouped = new Map();
    for (const p of this.placedItems) {
      const key = `${p.item.bucket}:${Math.round(p.year / 2)}`; // ~2-летние группы
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(p);
    }
    for (const arr of grouped.values()) {
      const sec = arr[0].sec;
      const slotH = Math.min(28 * this.dpr, (sec.height - 30 * this.dpr) / Math.max(1, arr.length));
      for (let i = 0; i < arr.length; i++) {
        arr[i].slotIdx = i;
        arr[i].slotH = slotH;
      }
    }
  }

  onPointerDown = (ev) => {
    ev.preventDefault();
    this.canvas.setPointerCapture(ev.pointerId);
    const x = ev.offsetX * this.dpr;
    const y = ev.offsetY * this.dpr;
    this.dragging = {
      startX: x, startY: y,
      lastX: x,
      moved: false,
      startViewStart: this.viewYearStart,
      startViewEnd: this.viewYearEnd,
    };
  };

  onPointerMove = (ev) => {
    if (!this.dragging) return;
    const x = ev.offsetX * this.dpr;
    const dx = x - this.dragging.startX;
    if (Math.abs(dx) > 6 * this.dpr) this.dragging.moved = true;
    if (this.dragging.moved) {
      // pan по времени
      const usableW = this.W - 120 * this.dpr;
      const yearsPerPx = (this.dragging.startViewEnd - this.dragging.startViewStart) / usableW;
      const yearShift = -dx * yearsPerPx;
      let s = this.dragging.startViewStart + yearShift;
      let e = this.dragging.startViewEnd + yearShift;
      const span = e - s;
      if (s < YEAR_MIN - 20) { s = YEAR_MIN - 20; e = s + span; }
      if (e > YEAR_MAX + 20) { e = YEAR_MAX + 20; s = e - span; }
      this.viewYearStart = s;
      this.viewYearEnd = e;
    }
  };

  onPointerUp = (ev) => {
    if (!this.dragging) return;
    if (!this.dragging.moved) {
      const x = ev.offsetX * this.dpr;
      const y = ev.offsetY * this.dpr;
      const hit = this.hitTest(x, y);
      if (hit) {
        this.activeId = hit.item.id;
        this.showCard(hit.item);
      } else {
        this.deselect();
      }
    }
    this.dragging = null;
  };

  onWheel = (ev) => {
    ev.preventDefault();
    const factor = ev.deltaY > 0 ? 1.12 : 0.88;
    const x = ev.offsetX * this.dpr;
    const yearAtCursor = this.xToYear(x);
    const newStart = yearAtCursor - (yearAtCursor - this.viewYearStart) * factor;
    const newEnd = yearAtCursor + (this.viewYearEnd - yearAtCursor) * factor;
    if (newEnd - newStart > 8 && newEnd - newStart < 400) {
      this.viewYearStart = Math.max(YEAR_MIN - 30, newStart);
      this.viewYearEnd = Math.min(YEAR_MAX + 30, newEnd);
    }
  };

  hitTest(px, py) {
    for (const p of this.placedItems) {
      const x = this.yearToX(p.year);
      const y = p.sec.baseline - (p.slotIdx + 1) * p.slotH + p.slotH / 2;
      const r = 7 * this.dpr;
      if (Math.abs(px - x) <= r * 2 && Math.abs(py - y) <= p.slotH / 2) return p;
    }
    return null;
  }

  showCard(item) {
    const meta = BUCKET_META[item.bucket];
    this.cardEl.querySelector('[data-bind="cat"]').textContent = `${meta.label} · ${item.year_first || ""}`;
    this.cardEl.querySelector('[data-bind="name"]').textContent = item.title;
    this.cardEl.querySelector('[data-bind="author"]').textContent = item.author || "";
    const where = [item.place_first, item.pages_approx ? `${item.pages_approx} стр.` : null].filter(Boolean).join(" · ");
    this.cardEl.querySelector('[data-bind="where"]').textContent = where;
    this.cardEl.querySelector('[data-bind="short"]').textContent = item.short_text || "";

    const conns = this.connectionsByItemId.get(item.id) || [];
    if (conns.length === 0) {
      this.cardConnsEl.hidden = true;
    } else {
      this.cardConnsEl.innerHTML = "";
      for (const c of conns) {
        const otherId = c.from === item.id ? c.to : c.from;
        const dir = c.from === item.id ? "→" : "←";
        const other = this.itemsById.get(otherId);
        const li = document.createElement("li");
        li.innerHTML = `<b>${CONN_STYLE[c.type].label}</b> ${dir} ${other ? other.title : otherId}`;
        this.cardConnsEl.appendChild(li);
      }
      this.cardConnsEl.hidden = false;
    }
    this.cardEl.hidden = false;
  }

  deselect() {
    this.activeId = null;
    this.cardEl.hidden = true;
  }

  loop = () => {
    this.render();
    requestAnimationFrame(this.loop);
  };

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    if (!this.layout) return;

    // section bands
    for (const b of this.layout.order) {
      const sec = this.layout.sections[b];
      const meta = BUCKET_META[b];
      ctx.fillStyle = `${meta.accent}10`;
      ctx.fillRect(0, sec.top, this.W, sec.height);
      // baseline (полка)
      ctx.fillStyle = "rgba(210,183,115,0.4)";
      ctx.fillRect(40 * this.dpr, sec.baseline, this.W - 80 * this.dpr, 1 * this.dpr);
      // label
      ctx.save();
      ctx.fillStyle = meta.accent;
      ctx.font = `600 ${13 * this.dpr}px "20 Kopeek", monospace`;
      ctx.textBaseline = "top";
      ctx.fillText(meta.label, 28 * this.dpr, sec.top + 8 * this.dpr);
      ctx.fillStyle = "rgba(247,249,239,0.5)";
      ctx.font = `400 ${10 * this.dpr}px "20 Kopeek", monospace`;
      ctx.fillText(meta.note.toUpperCase(), 28 * this.dpr, sec.top + 26 * this.dpr);
      ctx.restore();
    }

    // year ticks across the whole canvas
    this.renderTimeAxis();

    // dim non-related when active
    const activeSlots = new Set();
    if (this.activeId) {
      const conns = this.connectionsByItemId.get(this.activeId) || [];
      for (const c of conns) activeSlots.add(c.from === this.activeId ? c.to : c.from);
      activeSlots.add(this.activeId);
    }

    // books as small spines
    for (const p of this.placedItems) {
      const dim = this.activeId && !activeSlots.has(p.item.id);
      this.renderItem(p, dim);
    }

    // connections
    if (this.activeId) {
      const conns = this.connectionsByItemId.get(this.activeId) || [];
      for (const c of conns) {
        const other = c.from === this.activeId ? c.to : c.from;
        const a = this.findPlaced(this.activeId);
        const b = this.findPlaced(other);
        if (!a || !b) continue;
        this.renderConnection(a, b, c);
      }
    }
  }

  findPlaced(id) {
    for (const p of this.placedItems) if (p.item.id === id) return p;
    return null;
  }

  renderTimeAxis() {
    const ctx = this.ctx;
    // нижняя ось
    const axisY = this.H - 50 * this.dpr;
    ctx.fillStyle = "rgba(210,183,115,0.6)";
    ctx.fillRect(40 * this.dpr, axisY, this.W - 80 * this.dpr, 1 * this.dpr);

    // годы — крупные деления каждые 10 / 5 лет в зависимости от масштаба
    const span = this.viewYearEnd - this.viewYearStart;
    const stepBig = span > 120 ? 20 : span > 50 ? 10 : 5;
    const stepSmall = stepBig / 2;

    for (let y = Math.ceil(YEAR_MIN / stepSmall) * stepSmall; y <= YEAR_MAX; y += stepSmall) {
      const x = this.yearToX(y);
      if (x < 30 * this.dpr || x > this.W - 30 * this.dpr) continue;
      const big = y % stepBig === 0;
      ctx.fillStyle = big ? "rgba(247,249,239,0.55)" : "rgba(247,249,239,0.18)";
      ctx.fillRect(x, axisY, 1 * this.dpr, big ? 8 * this.dpr : 4 * this.dpr);
      if (big) {
        ctx.fillStyle = "rgba(247,249,239,0.65)";
        ctx.font = `400 ${10 * this.dpr}px "20 Kopeek", monospace`;
        ctx.textAlign = "center";
        ctx.fillText(String(y), x, axisY + 22 * this.dpr);
      }
    }
    ctx.textAlign = "left";

    // ленинские якоря
    for (const t of TIMELINE_TICKS) {
      const x = this.yearToX(t.year);
      if (x < 30 * this.dpr || x > this.W - 30 * this.dpr) continue;
      ctx.fillStyle = "rgba(160,33,40,0.7)";
      ctx.fillRect(x, 130 * this.dpr, 1 * this.dpr, axisY - 130 * this.dpr);
      ctx.fillStyle = COLORS.brass;
      ctx.font = `600 ${10 * this.dpr}px "20 Kopeek", monospace`;
      ctx.textAlign = "left";
      ctx.save();
      ctx.translate(x + 4 * this.dpr, 124 * this.dpr);
      ctx.fillText(`${t.year} · ${t.label}`, 0, 0);
      ctx.restore();
    }
  }

  renderItem(p, dim) {
    const ctx = this.ctx;
    const x = this.yearToX(p.year);
    if (x < 30 * this.dpr || x > this.W - 30 * this.dpr) return;
    const y = p.sec.baseline - (p.slotIdx + 1) * p.slotH + p.slotH / 2;
    const w = 5 * this.dpr;
    const h = Math.max(14 * this.dpr, p.slotH * 0.86);

    ctx.globalAlpha = dim ? 0.16 : 1;
    // тень
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(x - w / 2 + 1, y - h / 2 + 2, w, h);
    // спинка
    ctx.fillStyle = p.item.cover_color;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    // фаска
    ctx.fillStyle = adjustHex(p.item.cover_color, 35);
    ctx.fillRect(x - w / 2, y - h / 2, 1, h);
    ctx.fillStyle = adjustHex(p.item.cover_color, -25);
    ctx.fillRect(x + w / 2 - 1, y - h / 2, 1, h);

    if (p.item.significance >= 4) {
      // подпись для значимых при достаточном масштабе
      const span = this.viewYearEnd - this.viewYearStart;
      if (span < 180) {
        ctx.fillStyle = p.item.significance === 5 ? COLORS.brass : "rgba(247,249,239,0.7)";
        ctx.font = `400 ${10 * this.dpr}px "20 Kopeek", monospace`;
        ctx.textAlign = "left";
        ctx.save();
        ctx.translate(x + 6 * this.dpr, y);
        ctx.rotate(-Math.PI / 6);
        let label = p.item.title;
        if (label.length > 26) label = label.slice(0, 24) + "…";
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }

    if (this.activeId === p.item.id) {
      ctx.strokeStyle = COLORS.brass;
      ctx.lineWidth = 1.5 * this.dpr;
      ctx.strokeRect(x - w / 2 - 3 * this.dpr, y - h / 2 - 3 * this.dpr, w + 6 * this.dpr, h + 6 * this.dpr);
    }
    ctx.globalAlpha = 1;
  }

  renderConnection(a, b, conn) {
    const ctx = this.ctx;
    const style = CONN_STYLE[conn.type] || CONN_STYLE.source;
    const ax = this.yearToX(a.year);
    const ay = a.sec.baseline - (a.slotIdx + 1) * a.slotH + a.slotH / 2;
    const bx = this.yearToX(b.year);
    const by = b.sec.baseline - (b.slotIdx + 1) * b.slotH + b.slotH / 2;
    if ((ax < 0 && bx < 0) || (ax > this.W && bx > this.W)) return;

    // парабола вверх (изгиб вверх между точками)
    const midX = (ax + bx) / 2;
    const dist = Math.abs(bx - ax);
    const arc = Math.min(180 * this.dpr, 30 * this.dpr + dist * 0.18);
    const c1x = ax;
    const c1y = ay - arc;
    const c2x = bx;
    const c2y = by - arc;

    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width * this.dpr;
    ctx.setLineDash(style.dash.map((d) => d * this.dpr));
    ctx.shadowColor = style.color;
    ctx.shadowBlur = 6 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, bx, by);
    ctx.stroke();
    ctx.restore();

    // подпись типа в верхней точке арки
    const peakY = Math.min(ay, by) - arc * 0.55;
    ctx.save();
    ctx.fillStyle = "rgba(12,16,18,0.85)";
    ctx.fillRect(midX - 36 * this.dpr, peakY - 9 * this.dpr, 72 * this.dpr, 18 * this.dpr);
    ctx.fillStyle = style.color;
    ctx.font = `600 ${10 * this.dpr}px "20 Kopeek", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(style.label.toUpperCase(), midX, peakY + 1 * this.dpr);
    ctx.restore();
  }
}

const app = new TimelineApp();
app.start();
