/* Демо-сцена 1 «Пульс» — концентрические круги, тянут кадр анимацией. */
import { createCanvasScene } from "./canvas-scene.js?v=10";

export const pulseScene = createCanvasScene({
  id: "pulse",
  title: { ru: "Пульс", en: "Pulse", zh: "脉动" },
  draw(ctx, { t, w, h }) {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const base = Math.min(w, h) * 0.06;
    for (let i = 12; i >= 0; i--) {
      const phase = (t * 0.35 + i / 13) % 1;
      const r = base + phase * Math.min(w, h) * 0.42;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = i % 4 === 0
        ? `rgba(160, 33, 40, ${0.55 * (1 - phase)})`
        : `rgba(210, 183, 115, ${0.42 * (1 - phase)})`;
      ctx.lineWidth = i % 4 === 0 ? 8 : 3;
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(210, 183, 115, 0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, base * (1 + 0.08 * Math.sin(t * 2.2)), 0, Math.PI * 2);
    ctx.fill();
  },
});
