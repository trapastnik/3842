const COLORS = {
  paper: "#F7F9EF",
  brass: "#D2B773",
  red: "#A02128",
  graphite: "#435059",
  ink: "#0C1012",
  slateBlue: "#5D6970",
};

const BUCKET_META = {
  "by-lenin":    { label: "ИМ",    accent: "#A02128", note: "что писал сам Ленин"  },
  "about-lenin": { label: "О НЁМ", accent: "#D2B773", note: "что писали о нём"      },
  "in-library":  { label: "ЧИТАЛ", accent: "#5D6970", note: "что читал из чужого"   },
};

const CONN_STYLE = {
  "title-borrowing": { color: "#D2B773", width: 3, dash: [],          label: "заглавие"  },
  "polemic":         { color: "#A02128", width: 2, dash: [10, 6],     label: "против"     },
  "source":          { color: "#F7F9EF", width: 2, dash: [],          label: "источник"  },
  "framework":       { color: "#7BA3C0", width: 2, dash: [],          label: "рамка"     },
  "conspectus":      { color: "#D2B773", width: 2.5, dash: [2, 4],    label: "конспект"  },
  "wrote-about":     { color: "#7BA3C0", width: 2, dash: [10, 6],     label: "статья о"  },
  "parallel":        { color: "#9DA3A6", width: 2, dash: [3, 3],      label: "параллель" },
};

function adjustHex(hex, delta) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = clamp((n >> 16) + delta);
  const g = clamp(((n >> 8) & 0xff) + delta);
  const b = clamp((n & 0xff) + delta);
  return `rgb(${r},${g},${b})`;
}
function clamp(v) { return Math.max(0, Math.min(255, v | 0)); }

function spineWidthBase(item) {
  const p = Math.max(8, item.pages_approx || 80);
  return Math.max(20, Math.min(96, 12 + Math.log2(p) * 6));
}

class MirrorApp {
  constructor() {
    this.canvas = document.getElementById("mirror");
    this.ctx = this.canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.activeId = null;
    this.cardEl = document.getElementById("card");
    this.cardConnsEl = document.getElementById("card-conns");
    this.cardEl.querySelector(".card__close").addEventListener("click", () => this.deselect());
    this.infoToggle = document.getElementById("info-toggle");
    this.infoModal = document.getElementById("info-modal");
    if (this.infoToggle && this.infoModal) {
      this.infoToggle.addEventListener("click", () => { this.infoModal.hidden = false; });
      this.infoModal.querySelector(".info-modal__close").addEventListener("click", () => { this.infoModal.hidden = true; });
      this.infoModal.querySelector(".info-modal__backdrop").addEventListener("click", () => { this.infoModal.hidden = true; });
    }
    this.W = 0; this.H = 0;
    this.layout = null;
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
    this.canvas.addEventListener("pointerdown", (ev) => {
      const x = ev.offsetX * this.dpr;
      const y = ev.offsetY * this.dpr;
      const hit = this.hitTest(x, y);
      if (hit) {
        this.activeId = hit.item.id;
        this.showCard(hit.item);
      } else {
        this.deselect();
      }
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.round(rect.width * this.dpr);
    this.H = Math.round(rect.height * this.dpr);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.computeLayout();
  }

  computeLayout() {
    const titleArea = 130 * this.dpr;
    const margin = 40 * this.dpr;
    const usableH = this.H - titleArea - margin;
    // by-lenin: 38%, in-library: 22%, about-lenin: 38%, gaps: 2%
    const sectionHs = {
      "by-lenin":    usableH * 0.38,
      "in-library":  usableH * 0.20,
      "about-lenin": usableH * 0.38,
    };
    const order = ["by-lenin", "in-library", "about-lenin"];
    const sections = {};
    let y = titleArea;
    const gap = usableH * 0.02;
    for (const b of order) {
      sections[b] = { top: y, height: sectionHs[b], items: [] };
      y += sectionHs[b] + gap;
    }
    // place items into grid per bucket
    const sideMargin = 50 * this.dpr;
    const usableW = this.W - 2 * sideMargin;

    const portrait = this.H > this.W;
    for (const b of order) {
      const items = this.data.items
        .filter((i) => i.bucket === b)
        .sort((a, c) => (a.year_first || 0) - (c.year_first || 0));
      const sec = sections[b];
      // rows: в портрете теснее по ширине → больше рядов; in-library — пропорционально
      let rows;
      if (b === "in-library") {
        rows = portrait ? Math.ceil(items.length / 10) : Math.ceil(items.length / 18);
      } else {
        rows = portrait ? 3 : 2;
      }
      const cols = Math.ceil(items.length / rows);
      const cellW = usableW / cols;
      const cellH = sec.height / rows;
      sec.cellW = cellW;
      sec.cellH = cellH;
      sec.rows = rows;
      sec.cols = cols;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const row = Math.floor(i / cols);
        const col = i % cols;
        const cellCx = sideMargin + col * cellW + cellW / 2;
        const baselineY = sec.top + (row + 1) * cellH - 8 * this.dpr;
        const sw = Math.min(cellW * 0.78, spineWidthBase(item) * this.dpr);
        const sh = Math.min(cellH * 0.82, cellH * 0.65 * Math.max(0.7, Math.min(1.18, (item.height_cm || 22) / 22)));
        sec.items.push({
          item,
          cx: cellCx,
          cy: baselineY - sh / 2,
          baselineY,
          w: sw,
          h: sh,
        });
      }
    }
    this.layout = { sections, order };
  }

  hitTest(px, py) {
    if (!this.layout) return null;
    for (const b of this.layout.order) {
      const sec = this.layout.sections[b];
      if (py < sec.top || py > sec.top + sec.height) continue;
      for (const slot of sec.items) {
        const x = slot.cx - slot.w / 2;
        const y = slot.baselineY - slot.h;
        if (px >= x && px <= x + slot.w && py >= y && py <= y + slot.h) {
          return slot;
        }
      }
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

    // section labels
    for (const b of this.layout.order) {
      const sec = this.layout.sections[b];
      const meta = BUCKET_META[b];
      ctx.save();
      ctx.fillStyle = meta.accent;
      ctx.font = `600 ${13 * this.dpr}px "20 Kopeek", monospace`;
      ctx.textBaseline = "top";
      ctx.fillText(meta.label, 28 * this.dpr, sec.top + 6 * this.dpr);
      ctx.fillStyle = "rgba(247,249,239,0.5)";
      ctx.font = `400 ${10 * this.dpr}px "20 Kopeek", monospace`;
      ctx.fillText(meta.note.toUpperCase(), 28 * this.dpr, sec.top + 24 * this.dpr);
      ctx.textAlign = "right";
      ctx.fillText(`${sec.items.length} ед.`, this.W - 28 * this.dpr, sec.top + 6 * this.dpr);
      ctx.textAlign = "left";
      ctx.restore();
    }

    // central thin "shelf" lines between sections
    for (const b of this.layout.order) {
      const sec = this.layout.sections[b];
      for (let r = 1; r <= sec.rows; r++) {
        const y = sec.top + r * sec.cellH - 8 * this.dpr;
        ctx.fillStyle = "rgba(210,183,115,0.18)";
        ctx.fillRect(40 * this.dpr, y, this.W - 80 * this.dpr, 1 * this.dpr);
      }
    }

    // spines
    const activeSlots = new Set();
    if (this.activeId) {
      const conns = this.connectionsByItemId.get(this.activeId) || [];
      for (const c of conns) activeSlots.add(c.from === this.activeId ? c.to : c.from);
      activeSlots.add(this.activeId);
    }
    for (const b of this.layout.order) {
      for (const slot of this.layout.sections[b].items) {
        const dim = this.activeId && !activeSlots.has(slot.item.id);
        this.renderSpine(slot, dim);
      }
    }

    // connection ribbons
    if (this.activeId) {
      const conns = this.connectionsByItemId.get(this.activeId) || [];
      const activeSlot = this.findSlot(this.activeId);
      for (const c of conns) {
        const otherId = c.from === this.activeId ? c.to : c.from;
        const otherSlot = this.findSlot(otherId);
        if (!activeSlot || !otherSlot) continue;
        this.renderConnection(activeSlot, otherSlot, c);
      }
      // active marker
      if (activeSlot) this.renderActiveMarker(activeSlot);
    }
  }

  findSlot(id) {
    for (const b of this.layout.order) {
      for (const s of this.layout.sections[b].items) if (s.item.id === id) return s;
    }
    return null;
  }

  renderSpine(slot, dim) {
    const ctx = this.ctx;
    const { item, cx, baselineY, w, h } = slot;
    const x = cx - w / 2;
    const y = baselineY - h;

    const opacity = dim ? 0.22 : 1;
    ctx.globalAlpha = opacity;

    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fillRect(x + 1 * this.dpr, y + 3 * this.dpr, w, h);

    ctx.fillStyle = item.cover_color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = adjustHex(item.cover_color, 26);
    ctx.fillRect(x, y, 1.5 * this.dpr, h);
    ctx.fillStyle = adjustHex(item.cover_color, -26);
    ctx.fillRect(x + w - 1.5 * this.dpr, y, 1.5 * this.dpr, h);
    ctx.fillStyle = adjustHex(item.cover_color, 18);
    ctx.fillRect(x, y, w, 3 * this.dpr);

    if (w >= 22 * this.dpr) {
      ctx.save();
      ctx.translate(cx, baselineY - 12 * this.dpr);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = adjustHex(item.cover_color, 95);
      const fs = Math.min(11 * this.dpr, w * 0.34);
      ctx.font = `400 ${fs}px Nolde, Georgia, serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const maxChars = Math.floor((h - 28 * this.dpr) / (fs * 0.55));
      let title = item.title;
      if (title.length > maxChars) title = title.slice(0, Math.max(3, maxChars - 1)) + "…";
      ctx.fillText(title, 0, 0);
      ctx.restore();
    }
    if (item.significance === 5) {
      ctx.fillStyle = COLORS.brass;
      ctx.fillRect(cx - 2 * this.dpr, y + h - 8 * this.dpr, 4 * this.dpr, 4 * this.dpr);
    }
    ctx.globalAlpha = 1;
  }

  renderActiveMarker(slot) {
    const ctx = this.ctx;
    const { cx, baselineY, w, h } = slot;
    const x = cx - w / 2;
    const y = baselineY - h;
    ctx.strokeStyle = COLORS.brass;
    ctx.lineWidth = 2 * this.dpr;
    ctx.strokeRect(x - 4 * this.dpr, y - 4 * this.dpr, w + 8 * this.dpr, h + 8 * this.dpr);
    ctx.fillStyle = COLORS.brass;
    ctx.beginPath();
    ctx.arc(cx, baselineY + 4 * this.dpr, 3 * this.dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  renderConnection(a, b, conn) {
    const ctx = this.ctx;
    const style = CONN_STYLE[conn.type] || CONN_STYLE.source;
    const ax = a.cx;
    const ay = a.baselineY - a.h / 2;
    const bx = b.cx;
    const by = b.baselineY - b.h / 2;
    // mid-control point pulled toward screen center
    const midY = this.H / 2;
    const c1x = ax;
    const c1y = ay + (midY - ay) * 0.6;
    const c2x = bx;
    const c2y = by + (midY - by) * 0.6;

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

    // type label near midpoint
    const mx = (ax + bx) / 2;
    const my = midY;
    ctx.save();
    ctx.fillStyle = "rgba(12,16,18,0.8)";
    ctx.fillRect(mx - 38 * this.dpr, my - 9 * this.dpr, 76 * this.dpr, 18 * this.dpr);
    ctx.fillStyle = style.color;
    ctx.font = `600 ${10 * this.dpr}px "20 Kopeek", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(style.label.toUpperCase(), mx, my + 1 * this.dpr);
    ctx.restore();
  }
}

const app = new MirrorApp();
app.start();
