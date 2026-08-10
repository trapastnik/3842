/* Демо-сцена 1 «Пульс» — концентрические круги, тянут кадр анимацией. */
import { createCanvasScene } from "./canvas-scene.js?v=1.17.1";

export const pulseScene = createCanvasScene({
  id: "pulse",
  title: { ru: "Пульс", en: "Pulse", zh: "脉动" },

  /* Настройки объявляются декларативно — ядро само нарисует их в
   * сервис-панели группой «Настройки МТК · Пульс», сохранит и вернёт
   * обратно через applySettings(). */
  settings: [
    { key: "rings", label: { ru: "Колец", en: "Rings", zh: "环数" },
      type: "range", min: 3, max: 24, step: 1, default: 13 },
    { key: "speed", label: { ru: "Скорость", en: "Speed", zh: "速度" },
      type: "range", min: 0.1, max: 1.2, step: 0.05, default: 0.35 },
    { key: "accent", label: { ru: "Красный акцент", en: "Red accent", zh: "红色强调" },
      type: "toggle", default: true },
  ],

  draw(ctx, { t, w, h, state }) {
    const s = state.settings || {};
    const rings = s.rings == null ? 13 : s.rings;
    const speed = s.speed == null ? 0.35 : s.speed;
    const accent = s.accent !== false;
    /* Цвет акцента — из ОБЩЕЙ настройки приложения, одной на обе сцены. */
    const tone = { red: "160, 33, 40", brass: "210, 183, 115", green: "93, 137, 112"
                 }[(state.app || {}).accentTone || "red"];

    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const base = Math.min(w, h) * 0.06;
    for (let i = rings - 1; i >= 0; i--) {
      const phase = (t * speed + i / rings) % 1;
      const r = base + phase * Math.min(w, h) * 0.42;
      const isAccent = accent && i % 4 === 0;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = isAccent
        ? `rgba(${tone}, ${0.55 * (1 - phase)})`
        : `rgba(210, 183, 115, ${0.42 * (1 - phase)})`;
      ctx.lineWidth = isAccent ? 8 : 3;
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(210, 183, 115, 0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, base * (1 + 0.08 * Math.sin(t * 2.2)), 0, Math.PI * 2);
    ctx.fill();
  },
});
