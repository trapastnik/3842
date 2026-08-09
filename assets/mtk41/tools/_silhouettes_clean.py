#!/usr/bin/env python3
"""Чистка силуэтов памятников: маска rembg → вычищенный контур → векторный путь.

    /usr/bin/python3 assets/mtk41/tools/_silhouettes_clean.py [--pilot] [id ...]

Почему не «largest component + морфология», как просилось изначально
────────────────────────────────────────────────────────────────────
Разбор пятнадцати существующих масок показал три РАЗНЫХ отказа, и общий
рецепт лечит только один из них:

1. Ленинград: rembg отдал стену дома 740×710 (площадь 319 147) и сам
   памятник 76×276 (площадь 10 406). Отбор ПО ПЛОЩАДИ здесь не «не помогает»
   — он активно выбирает не тот объект и выбрасывает памятник. Поэтому
   компонента выбирается по «похожести на памятник» (вертикальность,
   близость к центру кадра, доля высоты), а площадь — лишь один из членов.

2. Волгоград: постамент стоит на широкой каменистой отсыпке, приросшей к
   маске. Это не бахрома в пару пикселей, это масса, сравнимая с монументом,
   и морфологическое открытие её не возьмёт ни при каком разумном ядре.
   Режется «раструбом»: снизу вверх ищем строку, где ширина маски резко
   превышает ширину ствола выше, — это и есть переход монумент→ландшафт.

3. Дубна: у ног рваная бахрома (трава, венки, снег в зоне матовости),
   тонкая и приросшая. Вот её и снимает морфология.

Из 15 масок 10 односвязны — «водоросли» в них НЕ отдельные компоненты, а
приросшие к фигуре. Поэтому порядок именно такой: отбор компоненты → раструб
→ морфология, и только потом повторный отбор.

Почему на выходе вектор, а не PNG
─────────────────────────────────
Сцене нужны два режима — заливка и обрисовка. Растром это два файла на
памятник (566 файлов), причём цвет запечён в пиксели и не подчиняется
брендовым токенам, а на 4K видна лесенка. Один полигон даёт оба режима
(fill или stroke), красится токеном в рантайме, режется допуском
Дугласа–Пекера (это же и есть требуемое сглаживание контура) и весит
единицы килобайт вместо сотни. Растровые маски остаются как исходник.
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent          # assets/mtk41/
CORPUS = ROOT.parent.parent / "data" / "mtk41.json"
OVERRIDES = ROOT / "silhouettes_manual.json"

ALPHA_CUT = 160          # порог альфы; ниже — матовая кромка rembg
FLARE_K = 2.30           # во сколько раз строка шире ствола = ландшафт
TRUNK_LO, TRUNK_HI = 0.18, 0.72   # где мерить ствол (доли высоты сверху)
OPEN_FRAC = 0.012        # ядро открытия в долях высоты фигуры
CLOSE_FRAC = 0.010
SIMPLIFY_FRAC = 0.0045   # допуск Дугласа–Пекера в долях диагонали ОБЪЕКТА
MIN_HOLE_FRAC = 0.0008   # дыры мельче — заливаем (шум, а не просвет)
MIN_PART_FRAC = 0.004    # части мельче доли главной — выбрасываем


# ─── 1. выбор компоненты: похожесть на памятник, а не площадь ──────────
def pick_monument(binary):
    """Возвращает маску одной компоненты — той, что похожа на памятник.

    Оценка складывается из четырёх признаков, и ни один не решает сам:
      · вертикальность (h/w) — памятник стоит, стена лежит;
      · доля высоты кадра — памятник занимает кадр по вертикали;
      · близость центра к середине кадра по горизонтали — снимают по центру;
      · площадь — только как слабый член, иначе возвращаемся к ошибке
        Ленинграда, где стена втрое больше памятника.
    """
    n, labels, stats, cent = cv2.connectedComponentsWithStats(binary, 8)
    if n <= 1:
        return binary, []
    H, W = binary.shape
    scored = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < 24:
            continue
        vert = h / max(1.0, w)                       # >1 — вытянут вверх
        tall = h / H                                 # доля высоты кадра
        cx = cent[i][0] / W
        centred = 1.0 - min(1.0, abs(cx - 0.5) * 2)  # 1 в центре, 0 у кромки
        rel_area = area / (H * W)
        score = (min(vert, 6.0) / 6.0) * 3.0 + tall * 2.5 + centred * 1.5 + min(rel_area, 0.25) * 2.0
        scored.append((score, i, dict(w=int(w), h=int(h), area=int(area),
                                      vert=round(vert, 2), tall=round(tall, 2),
                                      centred=round(centred, 2), score=round(score, 2))))
    if not scored:
        return binary, []
    scored.sort(reverse=True, key=lambda t: t[0])
    best = scored[0][1]
    return (labels == best).astype(np.uint8), [s[2] for s in scored[:3]]


# ─── 2. раструб: где монумент кончается и начинается ландшафт ──────────
def flare_cut(binary, k=FLARE_K):
    """Отрезает низ там, где маска резко расширяется ОТНОСИТЕЛЬНО СОСЕДА СВЕРХУ.

    Первая редакция сравнивала каждую строку с медианной шириной ствола по
    всей средней части фигуры — и брала только Волгоград, где отсыпка вчетверо
    шире постамента. На Дубне, Костроме и Уфе (это и есть «водоросли»
    пользователя) она молчала: там мусор шире ЩИКОЛОТОК, но уже, чем пальто
    выше по фигуре, и до глобального порога не дотягивал.

    Поэтому опора локальная — медиана ширины на полосе НЕПОСРЕДСТВЕННО выше
    строки. Тогда оба случая — это одно и то же событие: спускаясь вниз,
    маска резко раздаётся вширь. У Волгограда это постамент→камни, у Дубны
    щиколотки→трава.

    Рез ищем только в нижней части: у бюста плинт законно шире груди, и
    сработай правило вверху — оно срезало бы сам памятник.
    Возвращает (маска, y_реза | None).
    """
    ys, xs = np.nonzero(binary)
    if not len(ys):
        return binary, None
    y0, y1 = ys.min(), ys.max()
    height = y1 - y0 + 1
    cx = int(np.median(xs))

    def run_width(y):
        """Ширина непрерывного отрезка в строке y, содержащего ствол."""
        row = binary[y]
        if not row.any():
            return 0
        x = cx if row[cx] else (np.argmin(np.abs(np.nonzero(row)[0] - cx)) and
                                np.nonzero(row)[0][np.argmin(np.abs(np.nonzero(row)[0] - cx))])
        if not row[x]:
            return 0
        a = x
        while a > 0 and row[a - 1]:
            a -= 1
        b = x
        while b < len(row) - 1 and row[b + 1]:
            b += 1
        return b - a + 1

    prof = np.array([run_width(y) for y in range(y0, y1 + 1)], dtype=float)
    if not prof.any():
        return binary, None

    # Замер профиля показал, что «резкого скачка» искать бесполезно: у
    # Волгограда он есть (287→682), у Дубны мусор нарастает ПЛАВНО от
    # щиколоток 27 px до 86 — ни один порог на соседних строках его не берёт.
    # Общее у обоих другое: НИЖЕ некоторой строки маска раздаётся и больше не
    # возвращается к своей ширине. Это и проверяем — не производную, а факт
    # разрастания под строкой.
    #
    # Идём СНИЗУ ВВЕРХ и берём самый нижний проходящий рез: так срезается
    # ровно земля, а не кусок памятника заодно с ней.
    win = max(3, int(height * 0.04))
    lo_limit = int(height * 0.60)        # рез только в нижних 40 % фигуры

    cut_rel = None
    for i in range(len(prof) - 2, lo_limit, -1):
        above = prof[max(0, i - win):i]
        above = above[above > 0]
        if len(above) < 3:
            continue
        ref = float(np.median(above))
        below = prof[i:]
        if ref > 0 and below.size and float(below.max()) > ref * k:
            cut_rel = i
            break
    if cut_rel is None:
        return binary, None
    cut = y0 + cut_rel
    # Не срезаем больше трети фигуры: если правило захотело столько, значит
    # опознало не землю, а сам памятник, и надёжнее не трогать вовсе.
    if (y1 - cut) > height * 0.34:
        return binary, None
    out = binary.copy()
    out[cut:, :] = 0
    return out, int(cut)


# ─── 2б. полка: тонкий козырёк земли у самого низа ─────────────────────
def trim_shelf(binary, k=1.55):
    """Срезает у самого низа полосу, которая заметно шире фигуры над ней.

    Рез земли берёт САМЫЙ НИЖНИЙ проходящий ряд — чтобы не отхватить кусок
    памятника. Побочный эффект: над резом остаётся тонкий козырёк грунта, и на
    отрисовке он читается как подчёркивание во всю ширину. На заливке его
    почти не видно, на обрисовке — видно отчётливо (та же причина, по которой
    контур вообще требовательнее заливки).

    Поэтому снимаем построчно снизу, пока строка шире соседей сверху. Полка
    тонкая, фигуры это не касается: как только ширина приходит в норму,
    останавливаемся.
    """
    ys, _ = np.nonzero(binary)
    if not len(ys):
        return binary
    y0, y1 = ys.min(), ys.max()
    height = y1 - y0 + 1

    # Сравнивать с СОСЕДОМ СВЕРХУ здесь бесполезно — первая редакция так и
    # делала и не снимала ничего: основание сплошное и равномерное, каждая его
    # строка равна соседней, отношение около единицы, и цикл останавливался на
    # первом же шаге. Опора — ствол памятника (середина фигуры), с ним полка
    # действительно расходится.
    lo, hi = y0 + int(height * 0.40), y0 + int(height * 0.72)
    trunk = [int(binary[t].sum()) for t in range(lo, max(lo + 1, hi))]
    trunk = [t for t in trunk if t > 0]
    if not trunk:
        return binary
    ref = float(np.median(trunk))
    limit = int(height * 0.16)          # полка не может быть в шестую фигуры
    out = binary.copy()
    removed = 0
    y = y1
    while y > y0 + int(height * 0.72) and removed < limit:
        if int(out[y].sum()) <= ref * k:
            break
        out[y, :] = 0
        removed += 1
        y -= 1
    return out


# ─── 3. морфология: бахрома тоньше порога ──────────────────────────────
def morph(binary):
    ys, _ = np.nonzero(binary)
    if not len(ys):
        return binary
    height = ys.max() - ys.min() + 1
    ko = max(3, int(height * OPEN_FRAC) | 1)
    kc = max(3, int(height * CLOSE_FRAC) | 1)
    eo = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ko, ko))
    ec = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kc, kc))
    out = cv2.morphologyEx(binary, cv2.MORPH_OPEN, eo)
    out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, ec)
    return out


# ─── 4. метрики мусора (в отчёт, а не молча) ───────────────────────────
def metrics(binary):
    n, _, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    areas = sorted(stats[1:, cv2.CC_STAT_AREA], reverse=True) if n > 1 else []
    main = int(areas[0]) if areas else 0
    rest = int(sum(areas[1:])) if len(areas) > 1 else 0
    cnts, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    per = sum(cv2.arcLength(c, True) for c in cnts)
    area = float(binary.sum())
    # Изрезанность: у круга 12.57, у рваной кляксы — сотни.
    jag = (per * per / area) if area > 0 else 0.0
    # Доля пикселей, снимаемых открытием, — прокси «тонких отростков».
    k = max(3, int(np.sqrt(area) * 0.05) | 1)
    e = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, e)
    thin = float((binary.sum() - opened.sum()) / max(1.0, area))
    return dict(parts=int(n - 1), main=main, rest=rest,
                rest_pct=round(100 * rest / max(1, main + rest), 2),
                jag=round(jag, 1), thin_pct=round(100 * thin, 1))


# ─── 5. вектор: контуры → упрощённые полигоны ──────────────────────────
def to_paths(binary):
    """[(внешний полигон, [дыры…])…] в координатах исходной маски."""
    area_total = float(binary.sum())
    ys, xs = np.nonzero(binary)
    if not len(ys):
        return []
    # Допуск — от размера САМОГО ОБЪЕКТА, а не кадра. Считая от диагонали
    # снимка, мы применяли к памятнику 76×276 на кадре 1400 тот же допуск,
    # что и к фигуре во весь кадр: Ленинград схлопывался в 8 точек, Рыбинск в
    # 6 — прямоугольник вместо силуэта.
    obj = np.hypot(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1)
    tol = obj * SIMPLIFY_FRAC
    cnts, hier = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hier is None:
        return []
    hier = hier[0]
    out = []
    for i, c in enumerate(cnts):
        if hier[i][3] != -1:            # это дыра, возьмём вместе с родителем
            continue
        if cv2.contourArea(c) < area_total * MIN_PART_FRAC:
            continue
        outer = cv2.approxPolyDP(c, tol, True).reshape(-1, 2)
        holes = []
        j = hier[i][2]
        while j != -1:
            if cv2.contourArea(cnts[j]) >= area_total * MIN_HOLE_FRAC:
                holes.append(cv2.approxPolyDP(cnts[j], tol, True).reshape(-1, 2))
            j = hier[j][0]
        out.append((outer, holes))
    return out


def paths_to_svgd(paths, box):
    """Полигоны → строка path d, нормированная в единичный квадрат."""
    x0, y0, w, h = box
    s = 1.0 / max(w, h)

    def poly(p):
        pts = [(round((x - x0) * s, 4), round((y - y0) * s, 4)) for x, y in p]
        if not pts:
            return ""
        d = "M" + f"{pts[0][0]},{pts[0][1]}"
        d += "".join(f"L{x},{y}" for x, y in pts[1:])
        return d + "Z"

    return "".join(poly(o) + "".join(poly(hl) for hl in hs) for o, hs in paths)


# ─── прогон ────────────────────────────────────────────────────────────
def clean(mask_path, override=None):
    """Полный проход по одной маске. Возвращает словарь с результатом."""
    img = Image.open(mask_path).convert("RGBA")
    alpha = np.array(img.split()[3], dtype=np.uint8)
    binary = (alpha >= ALPHA_CUT).astype(np.uint8)
    before = metrics(binary)

    picked, cand = pick_monument(binary)
    ov = override or {}
    if ov.get("flare") is False:
        cut = None
        after_flare = picked
    else:
        after_flare, cut = flare_cut(picked, ov.get("flare_k", FLARE_K))
    if ov.get("cut_y"):                       # ручная линия земли в пикселях маски
        after_flare = picked.copy()
        after_flare[int(ov["cut_y"]):, :] = 0
        cut = int(ov["cut_y"])
    elif ov.get("cut_norm"):
        """Линия земли В ДОЛЯХ ВЫСОТЫ СИЛУЭТА — так её отдаёт инструмент
        отбраковки: там режется уже вектор, нормированный по высоте, и
        пикселей исходной маски человек не видит и видеть не должен.
        Переводим в пиксели по габаритам ВЫБРАННОЙ компоненты, а не всего
        кадра: доля считалась от фигуры."""
        ys = np.nonzero(picked)[0]
        if len(ys):
            y0, y1 = int(ys.min()), int(ys.max())
            cut = y0 + int(round((y1 - y0 + 1) * float(ov["cut_norm"])))
            after_flare = picked.copy()
            after_flare[cut:, :] = 0

    m = trim_shelf(after_flare)
    m = morph(m)
    m, _ = pick_monument(m)                   # после реза мог остаться хвост
    after = metrics(m)

    ys, xs = np.nonzero(m)
    if not len(ys):
        return dict(ok=False, reason="после чистки пусто")
    box = (int(xs.min()), int(ys.min()),
           int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1))
    paths = to_paths(m)
    return dict(ok=True, mask=m, box=box, cut=cut, paths=paths,
                d=paths_to_svgd(paths, box), before=before, after=after,
                cand=cand, size=(int(binary.shape[1]), int(binary.shape[0])))


def load_overrides():
    if OVERRIDES.exists():
        with OVERRIDES.open(encoding="utf-8") as f:
            return {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--out", default=None, help="куда положить paths.json")
    args = ap.parse_args()

    with (ROOT / "silhouettes.json").open(encoding="utf-8") as f:
        catalog = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    overrides = load_overrides()

    ids = args.ids or sorted(catalog)
    result, report = {}, []
    for mid in ids:
        rel = catalog.get(mid)
        if not rel:
            report.append((mid, "нет маски"))
            continue
        src = ROOT / mid / rel
        if not src.exists():
            report.append((mid, "файл потерян"))
            continue
        r = clean(src, overrides.get(mid))
        if not r["ok"]:
            report.append((mid, r["reason"]))
            continue
        result[mid] = dict(d=r["d"], box=r["box"], w=r["size"][0], h=r["size"][1])
        b, a = r["before"], r["after"]
        report.append((mid,
                       f'частей {b["parts"]}→{a["parts"]}  мусор {b["rest_pct"]}→{a["rest_pct"]}%  '
                       f'тонкое {b["thin_pct"]}→{a["thin_pct"]}%  изрезанность {b["jag"]}→{a["jag"]}  '
                       f'рез={r["cut"] if r["cut"] is not None else "—"}  точек={len(r["d"].split("L"))}'))

    for mid, line in report:
        print(f"  {mid:38s} {line}")
    # Счётчик записей — печатаем всегда: у 38 он дважды ловил обвал канона.
    print(f"\n=== обработано {len(result)} из {len(ids)}; в каталоге {len(catalog)}")

    if args.out:
        out = Path(args.out)
        with out.open("w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
        print(f"=== записано {len(result)} путей в {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
