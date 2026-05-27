const COLORS = {
  paper: "#F7F9EF",
  brass: "#D2B773",
  brassSoft: "rgba(210,183,115,0.55)",
  red: "#A02128",
  graphite: "#435059",
  graphiteDeep: "#2B3338",
  ink: "#0C1012",
};

const BUCKET_META = {
  "by-lenin":    { label: "ИМ",    accent: "#A02128", note: "что писал сам Ленин" },
  "about-lenin": { label: "О НЁМ", accent: "#D2B773", note: "что писали о нём"     },
  "in-library":  { label: "ЧИТАЛ", accent: "#5D6970", note: "что читал из чужого"  },
};

const BUCKET_ORDER = ["by-lenin", "about-lenin", "in-library"];

function adjustHex(hex, delta) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = clamp((n >> 16) + delta);
  const g = clamp(((n >> 8) & 0xff) + delta);
  const b = clamp((n & 0xff) + delta);
  return `rgb(${r},${g},${b})`;
}
function clamp(v) { return Math.max(0, Math.min(255, v | 0)); }

function spineWidth(item, portrait) {
  const p = Math.max(8, item.pages_approx || 80);
  const base = 14 + Math.log2(p) * 7;
  if (portrait) return Math.max(34, Math.min(160, base * 1.45));
  return Math.max(22, Math.min(110, base));
}

class ShelfApp {
  constructor() {
    this.canvas = document.getElementById("shelf");
    this.ctx = this.canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.shelves = [];
    this.dragging = null;
    this.activeId = null;
    this.hoverId = null;
    this.cardEl = document.getElementById("card");
    this.cardCloseEl = this.cardEl.querySelector(".card__close");
    this.W = 0; this.H = 0;
  }

  async start() {
    const r = await fetch("../data/mtk40.json?v=" + Date.now());
    this.data = await r.json();
    this.shelves = BUCKET_ORDER.map((b) => {
      const items = this.data.items
        .filter((i) => i.bucket === b)
        .sort((a, b) => (a.year_first || 0) - (b.year_first || 0));
      return { bucket: b, items, scrollX: 0, velocityX: 0, spineRects: [], totalWidth: 0 };
    });
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
    this.canvas.addEventListener("pointerleave", this.onPointerUp);
    this.cardCloseEl.addEventListener("click", () => this.hideCard());
  }

  isPortrait() {
    return this.H > this.W;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.W = Math.round(rect.width * this.dpr);
    this.H = Math.round(rect.height * this.dpr);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    for (const shelf of this.shelves) this.layoutShelf(shelf);
  }

  titleAreaPx() {
    return (this.isPortrait() ? 150 : 110) * this.dpr;
  }

  shelfBaseHeight() {
    return (this.H - this.titleAreaPx()) / 3;
  }

  layoutShelf(shelf) {
    const portrait = this.isPortrait();
    const baseH = this.shelfBaseHeight();
    const maxSpineH = baseH * (portrait ? 0.82 : 0.78);
    let x = 0;
    shelf.spineRects = [];
    for (const item of shelf.items) {
      const w = spineWidth(item, portrait) * this.dpr;
      const hRatio = (item.height_cm || 22) / 22;
      const h = maxSpineH * Math.max(0.66, Math.min(1.18, hRatio));
      shelf.spineRects.push({ item, x, w, h });
      x += w + 2 * this.dpr;
    }
    shelf.totalWidth = x;
  }

  onPointerDown = (ev) => {
    ev.preventDefault();
    this.canvas.setPointerCapture(ev.pointerId);
    const x = ev.offsetX * this.dpr;
    const y = ev.offsetY * this.dpr;
    const shelfIdx = this.shelfIndexAtY(y);
    if (shelfIdx < 0) return;
    this.dragging = {
      shelfIdx,
      startX: x, startY: y, startT: performance.now(),
      lastX: x, lastT: performance.now(),
      lastVx: 0,
      moved: false,
    };
    this.shelves[shelfIdx].velocityX = 0;
  };

  onPointerMove = (ev) => {
    if (!this.dragging) return;
    const x = ev.offsetX * this.dpr;
    const now = performance.now();
    const dx = x - this.dragging.lastX;
    const dt = Math.max(1, now - this.dragging.lastT);
    this.shelves[this.dragging.shelfIdx].scrollX -= dx;
    this.dragging.lastX = x;
    this.dragging.lastT = now;
    this.dragging.lastVx = -dx / dt;
    if (Math.abs(x - this.dragging.startX) > 6 * this.dpr) this.dragging.moved = true;
  };

  onPointerUp = (ev) => {
    if (!this.dragging) return;
    const wasDrag = this.dragging.moved;
    if (!wasDrag) {
      const x = ev.offsetX * this.dpr;
      const y = ev.offsetY * this.dpr;
      const hit = this.hitTest(x, y);
      if (hit) {
        this.activeId = hit.item.id;
        this.showCard(hit.item);
      } else {
        this.activeId = null;
        this.hideCard();
      }
    } else {
      const shelf = this.shelves[this.dragging.shelfIdx];
      shelf.velocityX = (this.dragging.lastVx || 0) * 16;
    }
    this.dragging = null;
  };

  shelfIndexAtY(y) {
    const titleArea = this.titleAreaPx();
    if (y < titleArea) return -1;
    const baseH = this.shelfBaseHeight();
    const idx = Math.floor((y - titleArea) / baseH);
    return idx >= 0 && idx <= 2 ? idx : -1;
  }

  hitTest(px, py) {
    const idx = this.shelfIndexAtY(py);
    if (idx < 0) return null;
    const shelf = this.shelves[idx];
    const titleArea = this.titleAreaPx();
    const baseH = this.shelfBaseHeight();
    const top = titleArea + idx * baseH;
    const baseline = top + baseH - 36 * this.dpr;
    const offsetX = 100 * this.dpr;
    for (const rect of shelf.spineRects) {
      const x = rect.x - shelf.scrollX + offsetX;
      if (px >= x && px <= x + rect.w && py >= baseline - rect.h && py <= baseline) {
        return { shelf, rect, item: rect.item };
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
    this.cardEl.hidden = false;
  }
  hideCard() {
    this.cardEl.hidden = true;
    this.activeId = null;
  }

  loop = () => {
    for (const shelf of this.shelves) {
      if (Math.abs(shelf.velocityX) > 0.05) {
        shelf.scrollX += shelf.velocityX;
        shelf.velocityX *= 0.94;
      } else {
        shelf.velocityX = 0;
      }
      const offsetX = 100 * this.dpr;
      const maxScroll = Math.max(0, shelf.totalWidth + offsetX + 60 * this.dpr - this.W);
      if (shelf.scrollX < -40 * this.dpr) {
        shelf.scrollX += (-40 * this.dpr - shelf.scrollX) * 0.18;
        shelf.velocityX *= 0.78;
      } else if (shelf.scrollX > maxScroll + 40 * this.dpr) {
        shelf.scrollX += (maxScroll + 40 * this.dpr - shelf.scrollX) * 0.18;
        shelf.velocityX *= 0.78;
      }
    }
    this.render();
    requestAnimationFrame(this.loop);
  };

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    const titleArea = this.titleAreaPx();
    const baseH = this.shelfBaseHeight();
    for (let i = 0; i < this.shelves.length; i++) {
      this.renderShelf(this.shelves[i], titleArea + i * baseH, baseH);
    }
  }

  renderShelf(shelf, top, height) {
    const ctx = this.ctx;
    const baseline = top + height - 36 * this.dpr;
    const offsetX = 100 * this.dpr;
    const meta = BUCKET_META[shelf.bucket];

    // полка-доска
    ctx.fillStyle = "rgba(210,183,115,0.45)";
    ctx.fillRect(0, baseline + 1, this.W, 4 * this.dpr);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, baseline + 5 * this.dpr, this.W, 14 * this.dpr);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, baseline + 19 * this.dpr, this.W, 6 * this.dpr);

    // секционная метка слева
    ctx.save();
    ctx.fillStyle = meta.accent;
    ctx.font = `600 ${14 * this.dpr}px "20 Kopeek", monospace`;
    ctx.textBaseline = "top";
    ctx.fillText(meta.label, 26 * this.dpr, top + 16 * this.dpr);
    ctx.fillStyle = "rgba(247,249,239,0.55)";
    ctx.font = `400 ${10 * this.dpr}px "20 Kopeek", monospace`;
    ctx.fillText(meta.note.toUpperCase(), 26 * this.dpr, top + 36 * this.dpr);
    // счётчик
    ctx.fillStyle = "rgba(247,249,239,0.5)";
    ctx.font = `400 ${10 * this.dpr}px "20 Kopeek", monospace`;
    ctx.textAlign = "right";
    ctx.fillText(`${shelf.items.length} ед.`, this.W - 26 * this.dpr, top + 16 * this.dpr);
    ctx.textAlign = "left";
    ctx.restore();

    // корешки
    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX - 4 * this.dpr, top + 60 * this.dpr, this.W - offsetX, baseline - top - 60 * this.dpr + 4 * this.dpr);
    ctx.clip();
    for (const rect of shelf.spineRects) {
      const x = rect.x - shelf.scrollX + offsetX;
      if (x + rect.w < offsetX - 8 * this.dpr || x > this.W + 8 * this.dpr) continue;
      this.renderSpine(rect, x, baseline);
    }
    ctx.restore();

    // градиент edge fade слева/справа от корешков (намёк на «полка продолжается»)
    const fadeW = 24 * this.dpr;
    const grL = ctx.createLinearGradient(offsetX, 0, offsetX + fadeW, 0);
    grL.addColorStop(0, "rgba(12,16,18,0.85)");
    grL.addColorStop(1, "rgba(12,16,18,0)");
    ctx.fillStyle = grL;
    ctx.fillRect(offsetX - 4 * this.dpr, top + 60 * this.dpr, fadeW + 4 * this.dpr, baseline - top - 60 * this.dpr);
    const grR = ctx.createLinearGradient(this.W - fadeW, 0, this.W, 0);
    grR.addColorStop(0, "rgba(12,16,18,0)");
    grR.addColorStop(1, "rgba(12,16,18,0.85)");
    ctx.fillStyle = grR;
    ctx.fillRect(this.W - fadeW, top + 60 * this.dpr, fadeW, baseline - top - 60 * this.dpr);
  }

  renderSpine({ item, w, h }, x, baselineY) {
    const ctx = this.ctx;
    const y = baselineY - h;

    // тень
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(x + 2 * this.dpr, y + 4 * this.dpr, w, h);

    // корешок
    ctx.fillStyle = item.cover_color;
    ctx.fillRect(x, y, w, h);

    // светлая «фаска» слева
    ctx.fillStyle = adjustHex(item.cover_color, 28);
    ctx.fillRect(x, y, 2 * this.dpr, h);
    // тёмная «фаска» справа
    ctx.fillStyle = adjustHex(item.cover_color, -28);
    ctx.fillRect(x + w - 2 * this.dpr, y, 2 * this.dpr, h);
    // верхняя «крышка» (каптал)
    ctx.fillStyle = adjustHex(item.cover_color, 18);
    ctx.fillRect(x, y, w, 4 * this.dpr);
    // декоративные тиснёные линии
    ctx.fillStyle = adjustHex(item.cover_color, 36);
    ctx.fillRect(x + 4 * this.dpr, y + 16 * this.dpr, w - 8 * this.dpr, 1 * this.dpr);
    ctx.fillRect(x + 4 * this.dpr, y + h - 22 * this.dpr, w - 8 * this.dpr, 1 * this.dpr);

    // тиснение — заголовок вертикально
    if (w >= 26 * this.dpr) {
      ctx.save();
      ctx.translate(x + w / 2, y + h - 28 * this.dpr);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = adjustHex(item.cover_color, 95);
      const fs = Math.min(14 * this.dpr, w * 0.34);
      ctx.font = `400 ${fs}px Nolde, Georgia, serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const maxChars = Math.floor((h - 60 * this.dpr) / (fs * 0.55));
      let title = item.title;
      if (title.length > maxChars) title = title.slice(0, Math.max(3, maxChars - 1)) + "…";
      ctx.fillText(title, 0, 0);
      ctx.restore();
    }

    // sig=5 → латунная звёздочка снизу
    if (item.significance === 5) {
      ctx.fillStyle = COLORS.brass;
      ctx.fillRect(x + w / 2 - 2 * this.dpr, y + h - 10 * this.dpr, 4 * this.dpr, 4 * this.dpr);
    }

    // активный — подсветка
    if (this.activeId === item.id) {
      ctx.strokeStyle = COLORS.brass;
      ctx.lineWidth = 2 * this.dpr;
      ctx.strokeRect(x - 3 * this.dpr, y - 3 * this.dpr, w + 6 * this.dpr, h + 6 * this.dpr);
    }
  }
}

const app = new ShelfApp();
app.start();
