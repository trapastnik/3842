/* Мост «схема сцены v1.2 → сервис-панель ядра 1.1.0».
 *
 * PLAN-KIOSK объявил декларативную схему: сцена описывает свои настройки в
 * `settings: [...]`, ядро само рисует их группой и зовёт `applySettings(values)`.
 * Ядро 1.1.0 этого ещё не умеет (заявка kiosk-core), поэтому схема живёт на
 * сценах — как канон для тиража — а этот файл временно её исполняет:
 * регистрирует строки через addSettings() и раздаёт значения сценам.
 *
 * Когда ядро научится схеме, мост удаляется целиком: сцены править не нужно.
 * Хранение уже сейчас по канону — путь `scenes.<sceneId>.<key>`, то есть
 * localStorage["mtk42-kiosk"].scenes[id].
 */

const PREFIX = "scenes";

function pickLabel(label) {
  if (!label) return "";
  return typeof label === "string" ? label : (label.ru || label.en || "");
}

/* Значения одной сцены: дефолты схемы, перекрытые сохранённым. */
export function valuesOf(app, scene) {
  const out = {};
  for (const row of scene.settings || []) {
    const stored = app.getSetting(PREFIX + "." + scene.id + "." + row.key);
    out[row.key] = stored === undefined || stored === null ? row.default : stored;
  }
  return out;
}

export function installSettings(app, scenes) {
  const byPathScene = new Map();

  for (const scene of scenes) {
    const rows = scene.settings || [];
    if (!rows.length) continue;

    const spec = rows.map((row) => {
      const path = PREFIX + "." + scene.id + "." + row.key;
      byPathScene.set(path, scene);
      const out = { type: row.type, path, label: pickLabel(row.label) };
      if (row.type === "range") {
        out.min = row.min; out.max = row.max; out.step = row.step || 1;
        if (row.unit) out.unit = row.unit;
      }
      if (row.type === "choice") {
        out.options = row.options.map((o) => [o.value, pickLabel(o.label)]);
      }
      return out;
    });

    /* Заголовок группы — как в каноне: «Настройки МТК · <сцена>». */
    app.addSettings("Настройки МТК · " + pickLabel(scene.title), spec);
  }

  const push = (scene) => {
    if (scene && typeof scene.applySettings === "function") {
      scene.applySettings(valuesOf(app, scene));
    }
  };

  app.on("started", () => scenes.forEach(push));
  app.on("setting", ({ path }) => {
    if (byPathScene.has(path)) push(byPathScene.get(path));
  });

  return { push };
}
