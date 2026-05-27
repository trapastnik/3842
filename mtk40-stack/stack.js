const COLORS = {
  paper: "#F7F9EF",
  brass: "#D2B773",
  red: "#A02128",
  graphite: "#435059",
  ink: "#0C1012",
};

const BUCKET_META = {
  "by-lenin":    { label: "ИМ",    accent: "#A02128" },
  "about-lenin": { label: "О НЁМ", accent: "#D2B773" },
  "in-library":  { label: "ЧИТАЛ", accent: "#5D6970" },
};

// изометрия 30°
const ISO_COS = Math.cos(Math.PI / 6); // 0.866
const ISO_SIN = Math.sin(Math.PI / 6); // 0.5

function adjustHex(hex, delta) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = clamp((n >> 16) + delta);
  const g = clamp(((n >> 8) & 0xff) + delta);
  const b = clamp((n & 0xff) + delta);
  return `rgb(${r},${g},${b})`;
}
function clamp(v) { return Math.max(0, Math.min(255, v | 0)); }

function thicknessOf(item) {
  // 8 → 9px, 80 → 18px, 480 → 27px, 30000 → 44px
  const p = Math.max(8, item.pages_approx || 80);
  return 3 + Math.log2(p) * 3;
}
function coverWidth(item) {
  const h = item.height_cm || 22;
  return 170 * (h / 22);
}
function coverDepth(item) {
  const h = item.height_cm || 22;
  return 115 * (h / 22);
}
const TOWER_SPACING_X = 340;

class StackApp {
  constructor() {
    this.canvas = document.getElementById("stack");
    this.ctx = this.canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.activeId = null;
    this.cardEl = document.getElementById("card");
    this.cardEl.querySelector(".card__close").addEventListener("click", () => this.deselect());
    this.W = 0; this.H = 0;
    this.panX = 0;
    this.panY = 0;
    this.dragging = null;
    this.lift = new Map(); // id → animated lift offset
    this.books = []; // flat list of placed books with world coords
  }

  async start() {
    const r = await fetch("../data/mtk40.json?v=" + Date.now());
    this.data = await r.json();
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
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.round(rect.width * this.dpr);
    this.H = Math.round(rect.height * this.dpr);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.layout();
  }

  layout() {
    // Три башни в линию по оси X (мира). Сортировка внутри по году ↓ (старые сверху, чтобы новые были ближе к зрителю и видимее).
    // Чтобы стопки не вырастали слишком высокими, разбиваем каждую на 2 столбика.
    const portrait = this.H > this.W;
    this.portrait = portrait;
    const scale = portrait ? 0.55 : 1;
    const buckets = ["by-lenin", "about-lenin", "in-library"];
    const towerSpacingX = (portrait ? 200 : TOWER_SPACING_X) * this.dpr;
    const colSpacingZ = (portrait ? 80 : 145) * this.dpr;
    const baseY = 0;
    this.books = [];

    for (let bi = 0; bi < buckets.length; bi++) {
      const b = buckets[bi];
      const items = this.data.items
        .filter((i) => i.bucket === b)
        .sort((a, c) => (a.year_first || 0) - (c.year_first || 0));
      const cols = items.length > 18 ? 2 : 1;
      const colHeights = new Array(cols).fill(0);
      const towerX = (bi - 1) * towerSpacingX;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const colIdx = i % cols;
        const t = thicknessOf(item) * this.dpr * scale;
        const w = coverWidth(item) * this.dpr * scale;
        const d = coverDepth(item) * this.dpr * scale;
        const yBottom = colHeights[colIdx];
        const colZ = (cols === 1 ? 0 : (colIdx === 0 ? -colSpacingZ / 2 : colSpacingZ / 2));
        this.books.push({
          item,
          bucket: b,
          x: towerX,
          z: colZ,
          y: yBottom + baseY,
          w, d, t,
          towerIdx: bi,
        });
        colHeights[colIdx] += t;
      }
      // запомним высоту для рендера подписи
    }

    // Сцена: где (0,0,0)? — в портрете чуть выше, чтобы стопки уместились
    this.cx = this.W / 2;
    this.cy = this.H * (portrait ? 0.62 : 0.72);
    this.towerSpacingX = towerSpacingX;
  }

  project(x, y, z) {
    return {
      sx: this.cx + this.panX + (x - z) * ISO_COS,
      sy: this.cy + this.panY + (x + z) * ISO_SIN - y,
    };
  }

  onPointerDown = (ev) => {
    ev.preventDefault();
    this.canvas.setPointerCapture(ev.pointerId);
    const x = ev.offsetX * this.dpr;
    const y = ev.offsetY * this.dpr;
    this.dragging = {
      startX: x, startY: y,
      lastX: x, lastY: y,
      moved: false,
    };
  };

  onPointerMove = (ev) => {
    if (!this.dragging) return;
    const x = ev.offsetX * this.dpr;
    const y = ev.offsetY * this.dpr;
    const dx = x - this.dragging.lastX;
    const dy = y - this.dragging.lastY;
    this.panX += dx;
    this.panY += dy;
    this.dragging.lastX = x;
    this.dragging.lastY = y;
    if (Math.hypot(x - this.dragging.startX, y - this.dragging.startY) > 6 * this.dpr) {
      this.dragging.moved = true;
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
        this.lift.set(hit.item.id, { current: 0, target: 32 * this.dpr });
        this.showCard(hit.item);
      } else {
        this.deselect();
      }
    }
    this.dragging = null;
  };

  hitTest(px, py) {
    // Front-to-back, then top-to-bottom внутри стопки — иначе верхние книги «прозрачны» для клика
    const sorted = [...this.books].sort((a, b) => {
      const dd = this.depthOf(b) - this.depthOf(a);
      if (dd !== 0) return dd;
      return b.y - a.y;
    });
    for (const book of sorted) {
      const lift = (this.lift.get(book.item.id)?.current) || 0;
      const yBot = book.y + lift;
      const yTop = book.y + book.t + lift;
      const x1 = book.x - book.w / 2;
      const x2 = book.x + book.w / 2;
      const z1 = book.z - book.d / 2;
      const z2 = book.z + book.d / 2;
      // top face (обложка)
      const t1 = this.project(x1, yTop, z1);
      const t2 = this.project(x2, yTop, z1);
      const t3 = this.project(x2, yTop, z2);
      const t4 = this.project(x1, yTop, z2);
      if (pointInQuad(px, py, t1, t2, t3, t4)) return book;
      // front face (корешок-фронт, z=z2)
      const f1 = this.project(x1, yBot, z2);
      const f2 = this.project(x2, yBot, z2);
      const f3 = this.project(x2, yTop, z2);
      const f4 = this.project(x1, yTop, z2);
      if (pointInQuad(px, py, f1, f2, f3, f4)) return book;
      // right face (обрез страниц, x=x2)
      const r1 = this.project(x2, yBot, z1);
      const r2 = this.project(x2, yBot, z2);
      const r3 = this.project(x2, yTop, z2);
      const r4 = this.project(x2, yTop, z1);
      if (pointInQuad(px, py, r1, r2, r3, r4)) return book;
    }
    return null;
  }

  depthOf(book) {
    return book.x + book.z;
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

  deselect() {
    if (this.activeId) {
      const l = this.lift.get(this.activeId);
      if (l) l.target = 0;
    }
    this.activeId = null;
    this.cardEl.hidden = true;
  }

  loop = () => {
    // animate lifts
    for (const [id, l] of this.lift) {
      l.current += (l.target - l.current) * 0.18;
      if (Math.abs(l.target - l.current) < 0.5 && l.target === 0) this.lift.delete(id);
    }
    this.render();
    requestAnimationFrame(this.loop);
  };

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // тень-плита под башнями
    this.renderFloor();

    // labels per tower (project to base of each tower) — отрисую перед книгами, они снизу
    const towers = ["by-lenin", "about-lenin", "in-library"];
    for (let bi = 0; bi < towers.length; bi++) {
      const towerX = (bi - 1) * this.towerSpacingX;
      const meta = BUCKET_META[towers[bi]];
      const baseProj = this.project(towerX, 0, 130 * this.dpr);
      ctx.save();
      ctx.fillStyle = meta.accent;
      ctx.font = `600 ${18 * this.dpr}px "20 Kopeek", monospace`;
      ctx.textAlign = "center";
      ctx.fillText(meta.label, baseProj.sx, baseProj.sy + 22 * this.dpr);
      ctx.restore();
    }

    // sort books by depth (back to front)
    const sorted = [...this.books].sort((a, b) => this.depthOf(a) - this.depthOf(b));
    for (const book of sorted) this.renderBook(book);
  }

  renderFloor() {
    const ctx = this.ctx;
    // тень-эллипс под каждой башней
    for (let bi = 0; bi < 3; bi++) {
      const towerX = (bi - 1) * this.towerSpacingX;
      const center = this.project(towerX, 0, 0);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.ellipse(center.sx, center.sy + 6 * this.dpr, 210 * this.dpr, 56 * this.dpr, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  renderBook(book) {
    const ctx = this.ctx;
    const lift = (this.lift.get(book.item.id)?.current) || 0;
    const yBot = book.y + lift;
    const yTop = book.y + book.t + lift;
    const x1 = book.x - book.w / 2;
    const x2 = book.x + book.w / 2;
    const z1 = book.z - book.d / 2;
    const z2 = book.z + book.d / 2;

    const c = book.item.cover_color;
    const isActive = this.activeId === book.item.id;
    const isOther = this.activeId && !isActive;

    // 3 видимые грани при изометрии 30° (камера смотрит -y, +x_right, +z_left):
    // top (y=yTop), front (z=z2), right (x=x2)

    // FRONT face (z=z2) — корешок книги (сверху вниз)
    {
      const p1 = this.project(x1, yBot, z2);
      const p2 = this.project(x2, yBot, z2);
      const p3 = this.project(x2, yTop, z2);
      const p4 = this.project(x1, yTop, z2);
      ctx.fillStyle = isOther ? adjustHex(c, -50) : adjustHex(c, -22);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p3.sx, p3.sy);
      ctx.lineTo(p4.sx, p4.sy);
      ctx.closePath();
      ctx.fill();
    }

    // RIGHT face (x=x2) — обрез страниц, бумажный
    {
      const p1 = this.project(x2, yBot, z1);
      const p2 = this.project(x2, yBot, z2);
      const p3 = this.project(x2, yTop, z2);
      const p4 = this.project(x2, yTop, z1);
      ctx.fillStyle = isOther ? "rgba(180,176,160,0.4)" : "#E8DFC8";
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p3.sx, p3.sy);
      ctx.lineTo(p4.sx, p4.sy);
      ctx.closePath();
      ctx.fill();
      // тонкие горизонтальные линии — листы
      ctx.strokeStyle = "rgba(120,110,90,0.3)";
      ctx.lineWidth = 0.5 * this.dpr;
      const layers = Math.max(3, Math.min(12, Math.round(book.t / (3 * this.dpr))));
      for (let i = 1; i < layers; i++) {
        const yMid = yBot + (book.t * i) / layers;
        const a = this.project(x2, yMid, z1);
        const b = this.project(x2, yMid, z2);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }
    }

    // TOP face (y=yTop) — обложка
    {
      const p1 = this.project(x1, yTop, z1);
      const p2 = this.project(x2, yTop, z1);
      const p3 = this.project(x2, yTop, z2);
      const p4 = this.project(x1, yTop, z2);
      ctx.fillStyle = isOther ? adjustHex(c, -45) : c;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p3.sx, p3.sy);
      ctx.lineTo(p4.sx, p4.sy);
      ctx.closePath();
      ctx.fill();

      // тиснёная рамка
      ctx.strokeStyle = adjustHex(c, isOther ? -10 : 32);
      ctx.lineWidth = 1.2 * this.dpr;
      ctx.beginPath();
      const inset = 9 * this.dpr;
      const i1 = this.project(x1 + inset, yTop, z1 + inset);
      const i2 = this.project(x2 - inset, yTop, z1 + inset);
      const i3 = this.project(x2 - inset, yTop, z2 - inset);
      const i4 = this.project(x1 + inset, yTop, z2 - inset);
      ctx.moveTo(i1.sx, i1.sy);
      ctx.lineTo(i2.sx, i2.sy);
      ctx.lineTo(i3.sx, i3.sy);
      ctx.lineTo(i4.sx, i4.sy);
      ctx.closePath();
      ctx.stroke();

      if (book.item.significance >= 4 && !isOther) {
        // золотая «звёздочка» (точка) в центре обложки для значимых
        const cp = this.project(book.x, yTop + 0.1, book.z);
        ctx.fillStyle = COLORS.brass;
        ctx.beginPath();
        ctx.arc(cp.sx, cp.sy, (book.item.significance === 5 ? 5.5 : 3.5) * this.dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // подпись по центру обложки (на топовых книгах стопки и значимых)
      if (lift > 4 * this.dpr || book.item.significance === 5) {
        const cp = this.project(book.x, yTop + 0.1, book.z);
        ctx.save();
        // лёгкий поворот по изометрической оси
        ctx.translate(cp.sx, cp.sy);
        ctx.rotate(Math.atan2(ISO_SIN, ISO_COS) - Math.PI);
        ctx.fillStyle = adjustHex(c, 100);
        ctx.font = `400 ${15 * this.dpr}px Nolde, Georgia, serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        let title = book.item.title;
        const maxChars = Math.max(10, Math.floor(book.w / (this.dpr * 8)));
        if (title.length > maxChars) title = title.slice(0, maxChars - 1) + "…";
        ctx.fillText(title, 0, 0);
        ctx.restore();
      }
    }

    if (isActive) {
      // золотая обводка вокруг top face
      const p1 = this.project(x1, yTop, z1);
      const p2 = this.project(x2, yTop, z1);
      const p3 = this.project(x2, yTop, z2);
      const p4 = this.project(x1, yTop, z2);
      ctx.strokeStyle = COLORS.brass;
      ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p3.sx, p3.sy);
      ctx.lineTo(p4.sx, p4.sy);
      ctx.closePath();
      ctx.stroke();
    }
  }
}

function pointInQuad(px, py, p1, p2, p3, p4) {
  // тест точки в выпуклом четырёхугольнике (треугольник 1: p1,p2,p3; треугольник 2: p1,p3,p4)
  return pointInTriangle(px, py, p1, p2, p3) || pointInTriangle(px, py, p1, p3, p4);
}
function pointInTriangle(px, py, a, b, c) {
  const v0x = c.sx - a.sx, v0y = c.sy - a.sy;
  const v1x = b.sx - a.sx, v1y = b.sy - a.sy;
  const v2x = px - a.sx, v2y = py - a.sy;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const inv = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;
  return u >= 0 && v >= 0 && u + v <= 1;
}

const app = new StackApp();
app.start();
