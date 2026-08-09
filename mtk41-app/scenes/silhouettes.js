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
 * ⚠️ Силуэтов в корпусе всего 8 из 283. Индекс silhouettes.json собирался под
 * первый набор из 18 ID, и 7 записей в нём указывают на папки, которых в
 * data/mtk41.json больше нет. Остальные памятники рисуются процедурным
 * пунктиром — это видно в healthcheck и не выдаётся за реальный обвод. */
import { scaleScene } from "./scale.js?v=32";
import { DATA, PALETTE, cssColor, preloadThumbs, statusColor } from "./shared.js?v=32";

const SIL_DIR = "../assets/mtk41/";

/* Хранилище силуэтов — на уровне МОДУЛЯ, а не в ctx.
 * ctx у ядра одноразовый: context() отдаёт новый объект и прероллу, и mount().
 * Первая версия писала в ctx.__sil из custom(), а сцена читала свой ctx —
 * другой — и всегда видела пусто. Сцена одна, глобального состояния тут нет. */
const SIL = Object.create(null);

/* Силуэты грузятся в преролл: их всего восемь, это ~единицы мегабайт, и
 * догружать их по ходу нельзя — сцена рисует каждый кадр. */
function preloadSilhouettes(ctx) {
  return Promise.all([
    preloadThumbs(ctx),
    /* Корпус тянем сами, а не берём из ctx.data: custom() ядра выполняется
     * ПАРАЛЛЕЛЬНО с загрузкой данных, и на этот момент ctx.data.monuments
     * ещё не существует. Первая версия из-за этого получала пустое множество
     * id и отсеивала вообще все силуэты — сцена молча рисовала одни пунктиры. */
    Promise.all([
      fetch(DATA.silhouettes, { cache: "no-cache" }).then((r) => r.json()),
      fetch(DATA.monuments, { cache: "force-cache" }).then((r) => r.json()),
    ])
      .then(([idx, corpusJson]) => {
        const corpus = new Set((corpusJson.items || []).map((m) => m.id));
        const jobs = [];
        for (const [id, rel] of Object.entries(idx)) {
          if (id.startsWith("_") || !rel) continue;
          /* Мимо корпуса не грузим: семь записей индекса ссылаются на папки
           * первого набора из 18 ID, которых в данных давно нет. */
          if (!corpus.has(id)) continue;
          jobs.push(new Promise((res) => {
            const img = new Image();
            img.onload = () => { SIL[id] = img; res(); };
            img.onerror = () => res();
            img.src = SIL_DIR + id + "/" + encodeURI(rel);
          }));
        }
        return Promise.all(jobs);
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
      const img = sil[pm.m.id];

      if (img && img.complete && img.naturalWidth) {
        const targetH = pm.totalH;
        const w = targetH * (img.naturalWidth / img.naturalHeight);
        ctx.save();
        if (sel) {
          ctx.shadowColor = PALETTE.brass;
          ctx.shadowBlur = 18;
        } else if (this._cfg.tintSil !== false) {
          ctx.shadowColor = statusColor(pm.m.status);
          ctx.shadowBlur = 12;
        }
        ctx.drawImage(img, x - w / 2, pm.baseY - targetH, w, targetH);
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
