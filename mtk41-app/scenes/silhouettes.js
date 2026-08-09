/* Сцена «Силуэты в одном масштабе» — та же лента, что и «Масштаб», но фигуры
 * заменены реальными силуэтами, вырезанными из фотографий (rembg / U²-Net).
 *
 * Сделана НАДСТРОЙКОЙ над scaleScene, а не копией: у них общие ~600 строк
 * раскладки, промотки, ввода и полосы-скраббера, и две копии разъехались бы
 * при первой же правке. Отличий ровно три — идентичность сцены, преролл
 * силуэтов и отрисовка фигуры.
 *
 * Object.assign даёт НОВЫЙ объект с теми же методами: состояние сцены живёт
 * в this._*, выставляется в mount(), и у двух сцен оно не пересекается.
 *
 * Силуэты — ВЕКТОРНЫЕ (silhouettes_paths.json, ~250 путей на 190 КБ), а не
 * растровые: один контур даёт и заливку, и обводку, красится брендовым
 * токеном в рантайме и не мылится на 4K. Растровые маски живут вне
 * репозитория как исходник.
 *
 * У кого пути нет — процедурный пунктир, как в «Масштабе». Это видно в
 * healthcheck и не выдаётся за реальный обвод. */
import { scaleScene } from "./scale.js?v=35";
import { DATA, PALETTE, cssColor, preloadThumbs, statusColor } from "./shared.js?v=35";

/* Хранилище силуэтов — на уровне МОДУЛЯ, а не в ctx.
 * ctx у ядра одноразовый: context() отдаёт новый объект и прероллу, и mount().
 * Первая версия писала в ctx.__sil из custom(), а сцена читала свой ctx —
 * другой — и всегда видела пусто. Сцена одна, глобального состояния тут нет. */
const SIL = Object.create(null);

/* Пути разбираются в Path2D ОДИН РАЗ на преролле: разбор строки в каждом
 * кадре для 283 фигур — это работа впустую 60 раз в секунду. */
function preloadSilhouettes(ctx) {
  return Promise.all([
    preloadThumbs(ctx),
    fetch(DATA.silhouettes, { cache: "no-cache" })
      .then((r) => r.json())
      .then((idx) => {
        for (const [id, rec] of Object.entries(idx.items || {})) {
          if (!rec || !rec.d) continue;
          try {
            SIL[id] = { path: new Path2D(rec.d), ar: rec.ar || 1 };
          } catch (e) { /* битый путь — пусть рисуется пунктир */ }
        }
      })
      .catch(() => {}),
  ]);
}

export const silhouettesScene = Object.assign({}, scaleScene, {
  id: "silhouettes",
  title: { ru: "Силуэты", en: "Silhouettes", zh: "剪影" },

  preload: {
    data: Object.assign({}, scaleScene.preload.data, { monuments: DATA.monuments }),
    custom: preloadSilhouettes,
  },

  /* Схема та же, плюс тумблер подложки: на реальном силуэте статусная заливка
   * читается хуже, чем на прямоугольнике, и оператор может её убрать. */
  settings: scaleScene.settings.concat([
    { key: "tintSil", label: { ru: "Подкрашивать силуэты по статусу",
      en: "Tint silhouettes by status" }, type: "toggle", default: true },
  ]),

  healthcheck() {
    if (!this._host) return { ok: true, detail: "не смонтирована" };
    /* Канвовая сцена без размера — это «ещё не показывалась», а не поломка:
     * ядро держит слой скрытым (0×0), пока сцену не откроют, и меряться там
     * нечему. Тот же случай, что и «не смонтирована», принятый в канон ядра
     * по заявке МТК 41. */
    if (!this._host.width) return { ok: true, detail: "ещё не показывалась" };

    /* Буфер сверяем ПО ФАКТИЧЕСКОМУ dpr, а не по ширине бокса: счётчик фигур
     * бывает зелёным, пока сцена рисует всё до одной — но в чужом разрешении
     * (карта 42 так рисовала в 4%). Формула одна с отрисовкой — bufferFor(). */
    const buf = this._host.bufferOk();
    if (!buf.ok) return { ok: false, detail: "буфер " + buf.detail };
    if (!this._placed.length) return { ok: false, detail: "на шкале нет ни одной фигуры" };
    const sil = Object.keys(SIL).length;
    /* Не ошибка, но цифру видно на приёмке: сцена обещает «реальные фигуры»,
     * а их пока восемь. */
    return { ok: true, detail: `фигур ${this._placed.length}, реальных силуэтов ${sil}, буфер ${buf.detail}` };
  },

  _renderHead() {
    if (!this._titleEl) return;
    this._titleEl.textContent = this._app.t("silhouettes.title");
    this._subEl.textContent = this._app.t("silhouettes.subtitle");
  },

  /* Единственное содержательное отличие: где есть вырезанный силуэт — рисуем
   * его, где нет — процедурный пунктир, как в «Масштабе». */
  _drawFigures() {
    const h = this._host, ctx = h.ctx, g = this._geom;
    const sil = SIL;
    for (const pm of this._placed) {
      const x = this._screenX(pm.worldX);
      if (x < -80 || x > h.width + 80) continue;
      const sel = pm.i === this._selected;
      const rec = sil[pm.m.id];

      if (rec) {
        /* Путь нормирован по ВЫСОТЕ: y от 0 до 1, x от 0 до ar. Значит масштаб
         * — это ровно высота фигуры в пикселях, а ширина берётся сама. */
        const H = pm.totalH, W = H * rec.ar;
        ctx.save();
        ctx.translate(x - W / 2, pm.baseY - H);
        ctx.scale(H, H);
        ctx.fillStyle = sel ? PALETTE.brass
          : (this._cfg.tintSil !== false
            ? cssColor(statusColor(pm.m.status), 0.9)
            : cssColor(PALETTE.paper, 0.88));
        /* evenodd — дыры внутри контура уже вложены в тот же путь. */
        ctx.fill(rec.path, "evenodd");
        ctx.restore();
        continue;
      }

      /* Фоллбэк — тот же пунктирный контур: у 52 памятников нет даже
       * габаритов, и выдавать подставную фигуру за обмер нельзя. */
      const bottom = pm.baseY - pm.pedestalH;
      const sTop = bottom - pm.statueH;
      const bodyW = pm.w * 0.5, headW = pm.w * 0.32, headH = pm.statueH * 0.22;
      ctx.save();
      ctx.strokeStyle = cssColor(sel ? PALETTE.brass : PALETTE.window, pm.estimated ? 0.55 : 0.8);
      ctx.lineWidth = sel ? 2 : 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x - pm.w * 0.4, bottom, pm.w * 0.8, pm.pedestalH);
      ctx.strokeRect(x - bodyW * 0.5, sTop + headH, bodyW, bottom - sTop - headH);
      ctx.strokeRect(x - headW * 0.5, sTop, headW, headH);
      ctx.restore();
    }

    /* Подписи рисует базовая сцена — вызываем её реализацию, чтобы пороги
     * читаемости и повороты не пришлось повторять. */
    scaleScene._drawLabels.call(this, g);
  },
});
