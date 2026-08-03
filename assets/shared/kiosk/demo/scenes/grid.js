/* Демо-сцена 2 «Сетка» — дрейфующая решётка. */
import { createCanvasScene } from "./canvas-scene.js?v=10";

export const gridScene = createCanvasScene({
  id: "grid",
  title: { ru: "Сетка", en: "Grid", zh: "网格" },
  draw(ctx, { t, w, h }) {
    ctx.clearRect(0, 0, w, h);
    const step = Math.max(48, Math.min(w, h) / 18);
    const drift = (t * 12) % step;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(247, 249, 239, 0.13)";
    ctx.beginPath();
    for (let x = -step + drift; x < w + step; x += step) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let y = -step + drift; y < h + step; y += step) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();

    /* Узлы-«светлячки»: волна яркости по диагонали. */
    for (let x = -step + drift, i = 0; x < w + step; x += step, i++) {
      for (let y = -step + drift, j = 0; y < h + step; y += step, j++) {
        const k = Math.sin(t * 1.1 + (i + j) * 0.45);
        if (k < 0.72) continue;
        ctx.fillStyle = `rgba(210, 183, 115, ${(k - 0.72) * 3})`;
        ctx.beginPath();
        ctx.arc(x, y, 5 + (k - 0.72) * 22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
});
