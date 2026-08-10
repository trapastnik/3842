/* Демо-сцена 2 «Сетка» — дрейфующая решётка. */
import { createCanvasScene } from "./canvas-scene.js?v=1.17.1";

export const gridScene = createCanvasScene({
  id: "grid",
  title: { ru: "Сетка", en: "Grid", zh: "网格" },

  settings: [
    { key: "density", label: { ru: "Плотность сетки", en: "Grid density", zh: "网格密度" },
      type: "range", min: 8, max: 40, step: 1, default: 18 },
    { key: "sparks", label: { ru: "Светлячки", en: "Sparks", zh: "光点" },
      type: "toggle", default: true },
    /* Опции в форме {value, label:{ru,…}} — ядро нормализует подписи так
     * же, как везде. Раньше этот формат рендерился «[object Object]». */
    { key: "tone", label: { ru: "Тон линий", en: "Line tone", zh: "线条色调" },
      type: "select", default: "paper",
      options: [
        { value: "paper", label: { ru: "Бумага", en: "Paper", zh: "纸色" } },
        { value: "brass", label: { ru: "Латунь", en: "Brass", zh: "黄铜" } },
        { value: "red",   label: { ru: "Красный", en: "Red", zh: "红色" } },
      ] },
  ],

  draw(ctx, { t, w, h, state }) {
    const s = state.settings || {};
    const density = s.density == null ? 18 : s.density;
    const sparks = s.sparks !== false;
    const tone = { paper: "247, 249, 239", brass: "210, 183, 115", red: "160, 33, 40" }[s.tone || "paper"];

    ctx.clearRect(0, 0, w, h);
    const step = Math.max(48, Math.min(w, h) / density);
    const drift = (t * 12) % step;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(${tone}, 0.13)`;
    ctx.beginPath();
    for (let x = -step + drift; x < w + step; x += step) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let y = -step + drift; y < h + step; y += step) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();

    /* Узлы-«светлячки»: волна яркости по диагонали. */
    if (!sparks) return;
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
