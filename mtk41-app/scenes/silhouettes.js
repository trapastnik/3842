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
import { scaleScene } from "./scale.js?v=66";
import { DATA, HUMAN_HEIGHT_M, PALETTE, cssColor, emptyVerdict, fillTextIfFits,
  preloadThumbs, statusColor } from "./shared.js?v=66";

/* Хранилище силуэтов — на уровне МОДУЛЯ, а не в ctx.
 * ctx у ядра одноразовый: context() отдаёт новый объект и прероллу, и mount().
 * Первая версия писала в ctx.__sil из custom(), а сцена читала свой ctx —
 * другой — и всегда видела пусто. Сцена одна, глобального состояния тут нет. */

/* ─── Нефигуративные объекты ────────────────────────────────────────────
 * Одиннадцать объектов корпуса — не статуи: барельефы, наскальные
 * изображения, геоглифы, доска, стальной профиль. Силуэт ФИГУРЫ им не
 * положен, но и выкидывать их нельзя — геоглиф длиной 590 м рядом с
 * 57-метровым Волгоградом это ровно тот масштабный шок, ради которого сцена
 * существует (решение координатора).
 *
 * Показываем ТРЕМЯ способами, и способ выбран не по типу объекта, а по тому,
 * ЧТО ИМЕННО описывает известное число:
 *
 *  · BOX — число описывает сам объект по ВЕРТИКАЛИ: Капри 5 м, Ветлосян 33 м.
 *    Их можно ставить в общую шкалу высот честно.
 *
 *  · RULER — число горизонтальное: у геоглифа нет высоты, есть след на земле.
 *    Ставить 590 м на ось высот нельзя, поэтому отдельная линейка внизу со
 *    СВОЕЙ осью и явной подписью, что ось другая.
 *
 *  · ICON — числа нет либо оно описывает НЕ объект. У Пятигорска «400 м» это
 *    высота горы Машук, у Кызылташа «50 м» — скала. Прямоугольник по такому
 *    числу был бы ложью пропорциями: посетитель прочтёт «барельеф высотой с
 *    сорокаэтажный дом». Поэтому — значок типа вне шкалы, без масштаба.
 */
const NONFIG = {
  "ostrov-kapri-1970": { mode: "box", m: 5, kind: "relief" },
  "ukhta-vetlosyan-1970": { mode: "box", m: 33, kind: "steel" },
  "blagoveshchensk-rb-geoglif-1970": { mode: "ruler", len: 590, wide: 283 },
  "makachevo-1924": { mode: "ruler", len: 100, wide: 16 },
  "gorki-leninskie-1958": { mode: "icon", kind: "relief" },
  "kislovodsk-krasnye-kamni-1926": { mode: "icon", kind: "relief" },
  "zheneva-1921": { mode: "icon", kind: "relief" },
  "kyzyltash-1975": { mode: "icon", kind: "rock" },
  "pyatigorsk-mashuk-1925": { mode: "icon", kind: "rock" },
  "udalovka-bia-1947": { mode: "icon", kind: "rock" },
  "verkhniy-fiagdon-1924": { mode: "icon", kind: "plaque" },
};
const KIND_KEY = { relief: "kind.relief", rock: "kind.rock",
  plaque: "kind.plaque", steel: "kind.steel" };

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
    /* _placed может ещё не существовать: _applyFind зовётся из mount() до
     * его инициализации, а healthcheck стенд может позвать в любой момент. */
    if (!(this._placed || []).length) return emptyVerdict(this._find, "на шкале нет ни одной фигуры");
    const sil = Object.keys(SIL).length;
    const cut = Object.keys(CUT).length;
    /* Не ошибка, но цифру видно на приёмке: сцена обещает «реальные фигуры»,
     * а их пока восемь. */
    return { ok: true, detail: `фигур ${(this._placed || []).length}, вырезок ${cut}, контуров ${sil}, буфер ${buf.detail}` };
  },


  /* Габаритный контур и значок типа. Оба намеренно ПУНКТИРНЫЕ и в цвете
   * «нет данных»: это не обвод памятника, а рамка сведений о нём, и путать
   * их с настоящими вырезками нельзя. */
  _drawNonFig(ctx, pm, x, nf, sel, g) {
    const app = this._app;
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = cssColor(sel ? PALETTE.brass : PALETTE.window, 0.75);
    ctx.lineWidth = sel ? 2 : 1;

    if (nf.mode === "box") {
      /* Ширина объекта неизвестна ни у Капри, ни у Ветлосяна — берём узкую
       * условную и говорим об этом подписью. Придумывать ширину нельзя:
       * пропорция читается как измеренная. */
      const H = nf.m * g.mPx;
      const W = Math.min(pm.w * 0.7, H * 0.42);
      ctx.strokeRect(x - W / 2, pm.baseY - H, W, H);
      ctx.setLineDash([]);
      ctx.fillStyle = cssColor(PALETTE.window, 0.85);
      ctx.font = `500 ${Math.max(10, Math.min(pm.w * 0.26, 15))}px "20 Kopeek", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      fillTextIfFits(ctx, app.t(KIND_KEY[nf.kind]) + " · " + nf.m + " м",
        x, pm.baseY - H - 6);
    } else {
      /* Значок типа стоит НИЖЕ оси, чтобы его нельзя было прочитать как
       * высоту: у этих объектов вертикального размера просто нет. */
      const r = Math.min(pm.w * 0.28, 14);
      ctx.beginPath();
      ctx.arc(x, pm.baseY + r + 6, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cssColor(PALETTE.window, 0.8);
      ctx.font = `500 ${Math.max(9, r * 0.9)}px "20 Kopeek", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      fillTextIfFits(ctx, app.t(KIND_KEY[nf.kind] + ".short"), x, pm.baseY + r + 6);
    }
    ctx.restore();
  },

  /* Линейка геоглифов — ОТДЕЛЬНАЯ ось внизу кадра.
   *
   * На оси высот им места нет: 590 м это след на земле, а не рост. Поставить
   * такое число рядом с 57-метровым Волгоградом на одной оси значит соврать
   * дважды — и величиной, и направлением. Поэтому своя ось, свой масштаб и
   * подпись, которая прямо говорит, что ось другая. */
  _drawGeoglyphRuler(ctx, g) {
    const h = this._host, app = this._app;
    const items = Object.entries(NONFIG).filter(([, v]) => v.mode === "ruler");
    if (!items.length) return;
    const maxLen = Math.max(...items.map(([, v]) => v.len));

    /* Линейка живёт в ВЕРХНЕЙ пустой зоне, на своей подложке.
     *
     * Первая редакция ставила её внизу, между осью и полосой-скраббером, и
     * там она легла прямо в повёрнутые подписи городов — текст на текст,
     * читать невозможно. Низ шкалы вообще занят: подписи уходят под 60° и
     * съедают всю полосу под осью.
     *
     * Верх свободен почти всегда: выше 50 м дотягивается один Волгоград.
     * Подложка гарантирует читаемость и там, где дотянулся, и заодно честно
     * говорит «это отдельная врезка, а не часть шкалы». */
    const rowH = Math.max(15, h.height * 0.028);
    const y0 = rowH * 2.2;
    const left = g.left;
    const right = h.width * 0.62;
    const px = (right - left) / maxLen;          // своя, ГОРИЗОНТАЛЬНАЯ ось

    ctx.save();
    /* Подложка врезки: без неё текст ложится на фигуры и на сетку. */
    const padX = rowH * 0.7, padY = rowH * 0.6;
    const boxH = rowH * (items.length + 1.6);
    ctx.fillStyle = cssColor(PALETTE.black, 0.42);
    ctx.fillRect(left - padX, y0 - rowH * 1.5 - padY,
      (right - left) + padX * 6, boxH + padY * 1.4);

    ctx.font = `500 ${Math.max(10, rowH * 0.62)}px "20 Kopeek", monospace`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = cssColor(PALETTE.window, 0.7);
    ctx.textAlign = "left";
    ctx.fillText(app.t("silhouettes.ruler"), left, y0 - rowH);

    items.forEach(([id, v], k) => {
      const y = y0 + k * rowH;
      const w = v.len * px;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = cssColor(PALETTE.brass, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y); ctx.lineTo(left + w, y);
      ctx.moveTo(left, y - 5); ctx.lineTo(left, y + 5);
      ctx.moveTo(left + w, y - 5); ctx.lineTo(left + w, y + 5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cssColor(PALETTE.paper, 0.8);
      ctx.textAlign = "left";
      const item = this._all.find((t) => t.m.id === id);
      const city = item ? (item.m.city || "") : "";
      fillTextIfFits(ctx, city + " · " + v.len + " м", left + w + 10, y);
    });

    /* Человек на ТОЙ ЖЕ горизонтальной оси — иначе число не с чем сравнить. */
    const hw = HUMAN_HEIGHT_M * px;
    ctx.strokeStyle = cssColor(PALETTE.red, 0.8);
    ctx.beginPath();
    ctx.moveTo(left, y0 - rowH * 0.3);
    ctx.lineTo(left + Math.max(hw, 1), y0 - rowH * 0.3);
    ctx.stroke();
    ctx.restore();
  },


  _renderHead() {
    if (!this._titleEl) return;
    this._titleEl.textContent = this._app.t("silhouettes.title");
    this._subEl.textContent = this._app.t("silhouettes.subtitle");
  },

  /* Единственное содержательное отличие: где есть вырезанный силуэт — рисуем
   * его, где нет — процедурный пунктир, как в «Масштабе». */
  /* У силуэта ширина ИДЁТ ОТ ВЫСОТЫ — и у цветной вырезки (пропорции снимка),
   * и у вектора (путь нормирован по высоте, x идёт до ar). Поэтому рост
   * масштаба раздувает фигуру в обе стороны, и раскладка обязана про это
   * знать: слот считается по самой широкой, а масштаб упирается в потолок,
   * когда соседи вот-вот соприкоснутся. У процедурной фигуры «Масштаба»
   * такой связи нет — там базовый _figureAspect и возвращает 0. */
  _figureAspect(m) {
    if (!m) return 0;
    const photo = this._cfg && this._cfg.silMode !== "outline" ? CUT[m.id] : null;
    if (photo && photo.complete && photo.naturalWidth && photo.naturalHeight) {
      return photo.naturalWidth / photo.naturalHeight;
    }
    const rec = SIL[m.id];
    return rec && rec.ar > 0 ? rec.ar : 0;
  },

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

      const nf = NONFIG[pm.m.id];
      if (nf && nf.mode !== "ruler") {
        this._drawNonFig(ctx, pm, x, nf, sel, g);
        continue;
      }
      if (nf) continue;   // геоглифы рисует линейка, не общий цикл

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

    this._drawGeoglyphRuler(ctx, g);

    /* Подписи рисует базовая сцена — вызываем её реализацию, чтобы пороги
     * читаемости и повороты не пришлось повторять. */
    scaleScene._drawLabels.call(this, g);
  },
});
