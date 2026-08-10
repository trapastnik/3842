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
 * Два режима, и они про РАЗНОЕ:
 *
 *  · ФОТО — цветная вырезка памятника (cutouts.json): бронза, гранит, снег на
 *    плечах. Экспозиции нужна не абстрактная форма, а сам объект, и увидеть
 *    его можно только так. 199 вырезок, 6.1 МБ на диске, ~19 МБ в памяти —
 *    рядом с 193 МБ миниатюр это ничто, потому что вырезки узкие.
 *
 *  · КОНТУР — векторный путь (silhouettes_paths.json, 149 КБ): плоская форма,
 *    красится брендовым токеном, не мылится на 4K. Он же запасной вариант там,
 *    где вырезки нет.
 *
 * Форма у обоих ОДНА: вырезка режется той же очищенной маской, что даёт
 * вектор. Иначе переключение режимов подменяло бы объект.
 *
 * У кого нет ни того ни другого — процедурный пунктир, как в «Масштабе». Это
 * видно в healthcheck и не выдаётся за реальный обвод. */
import { scaleScene } from "./scale.js?v=37";
import { DATA, PALETTE, cssColor, preloadThumbs, statusColor } from "./shared.js?v=37";

/* Хранилище силуэтов — на уровне МОДУЛЯ, а не в ctx.
 * ctx у ядра одноразовый: context() отдаёт новый объект и прероллу, и mount().
 * Первая версия писала в ctx.__sil из custom(), а сцена читала свой ctx —
 * другой — и всегда видела пусто. Сцена одна, глобального состояния тут нет. */
const SIL = Object.create(null);   // векторные пути
const CUT = Object.create(null);   // цветные вырезки с фото

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
    /* Вырезки — в преролл, а не по ходу: сцена рисует каждый кадр, и
     * догрузка на лету дала бы и мигание, и запрос после старта, который
     * приёмка считает провалом. */
    fetch(DATA.cutouts, { cache: "no-cache" })
      .then((r) => r.json())
      .then((idx) => Promise.all(
        Object.entries(idx.items || {}).map(([id, rel]) => new Promise((res) => {
          const img = new Image();
          img.onload = () => { CUT[id] = img; res(); };
          img.onerror = () => res();
          img.src = "../assets/mtk41/" + id + "/" + rel;
        }))))
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
    { key: "silMode", label: { ru: "Вид фигуры", en: "Figure mode" },
      type: "select", default: "photo",
      options: [{ value: "photo", label: { ru: "Фото", en: "Photo" } },
                { value: "outline", label: { ru: "Контур", en: "Outline" } }] },
    { key: "tintSil", label: { ru: "Подкрашивать контур по статусу",
      en: "Tint outline by status" }, type: "toggle", default: true },
  ]),

  healthcheck() {
    if (!this._host) return { ok: true, detail: "не смонтирована" };
    /* Канвовая сцена без размера — «ещё не показывалась», а не поломка
     * (канон кита, README п. про healthcheck; конвенция принята по заявке
     * МТК 41). Спрашиваем ЖИВОЙ бокс: host.width — это память о последнем
     * измерении, она переживает скрытие слоя и соврёт по неактивной сцене. */
    if (!this._host.liveBox().w) return { ok: true, detail: "ещё не показывалась" };

    /* Буфер сверяем ПО ФАКТИЧЕСКОМУ dpr, а не по ширине бокса: счётчик фигур
     * бывает зелёным, пока сцена рисует всё до одной — но в чужом разрешении
     * (карта 42 так рисовала в 4%). Формула одна с отрисовкой — bufferFor(). */
    const buf = this._host.bufferOk();
    if (!buf.ok) return { ok: false, detail: "буфер " + buf.detail };
    if (!this._placed.length) return { ok: false, detail: "на шкале нет ни одной фигуры" };
    const sil = Object.keys(SIL).length;
    const cut = Object.keys(CUT).length;
    /* Не ошибка, но цифру видно на приёмке: сцена обещает «реальные фигуры»,
     * а их пока восемь. */
    return { ok: true, detail: `фигур ${this._placed.length}, вырезок ${cut}, контуров ${sil}, буфер ${buf.detail}` };
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

      const photo = this._cfg.silMode !== "outline" ? CUT[pm.m.id] : null;

      if (photo && photo.complete && photo.naturalWidth) {
        const H = pm.totalH, W = H * (photo.naturalWidth / photo.naturalHeight);
        ctx.save();
        if (sel) { ctx.shadowColor = PALETTE.brass; ctx.shadowBlur = 18; }
        ctx.drawImage(photo, x - W / 2, pm.baseY - H, W, H);
        ctx.restore();
        continue;
      }

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
