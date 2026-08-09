#!/usr/bin/env python3
"""Сборка векторного манифеста силуэтов — то, что реально едет в репозиторий.

    /usr/bin/python3 assets/mtk41/tools/_silhouettes_manifest.py [--ids a b c]

Формат (утверждён координатором 2026-08-09, вектор вместо растра):

    {
      "_comment": "…",
      "_version": "2026-08-09",          ← метка данных, см. GRABLI
      "items": {
        "dubna-1937": { "d": "M…Z", "ar": 0.42, "src": "silhouettes/01_….png" }
      }
    }

Координаты пути нормированы по ВЫСОТЕ: y ∈ [0,1] сверху вниз, x ∈ [0, ar].
Так сцене удобнее всего — она знает высоту фигуры в пикселях (памятник в
метрах × масштаб) и просто умножает. Ширина берётся из `ar`, отдельного
поля с размерами не нужно.

Заливка и обрисовка — ОДИН И ТОТ ЖЕ путь: `fill` с правилом evenodd (дыры
внутри контура уже вложены) либо `stroke`. Цвет в обоих случаях ставит сцена
брендовым токеном, а не пиксели.

Выбор кадра. У 9 памятников корпуса есть несколько снимков. Балл по СЫРОЙ
маске (первая редакция) оказался ненадёжен: Волгоград он улучшил резко
(изрезанность 85→38), но Уфу и Дубну ухудшил — награждал вертикальность, а
получал разорванные ноги. Поэтому кадр выбирается по РЕЗУЛЬТАТУ ЧИСТКИ: чистим
все кадры и берём тот, чей силуэт вышел ровнее. Чистка дешёвая, rembg заново
не гоняется.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT.parent.parent / "data" / "mtk41.json"
OUT = ROOT / "silhouettes_paths.json"
VERSION = "2026-08-09"

# Растровые маски — ИСХОДНИК, а не поставка: в репозиторий едут только вектор и
# манифест (решение координатора 2026-08-09). Их 358 штук на 37 МБ, и репозиторий
# при бюджете 300 МБ занят на ~252 — маски его переполнили бы. Лежат снаружи,
# рядом с репозиторием; пересобираются из фотографий за ~50 с.
MASKS = Path(os.environ.get(
    "MTK41_MASKS", Path.home() / "Desktop/WWWWW/BMK/mtk41-silhouette-masks"))


# Плоские объекты: силуэт ФИГУРЫ им не положен по типу. Это не брак вырезки —
# это неверно поставленный вопрос: у геоглифа и барельефа нет силуэта в том
# смысле, в каком он есть у статуи.
NONFIGURATIVE = {"relief", "rock-image", "geoglyph", "plaque",
                 "rock-carving", "steel-silhouette"}

_spec = importlib.util.spec_from_file_location(
    "sc", Path(__file__).with_name("_silhouettes_clean.py"))
sc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sc)


def normalise(d, box):
    """Путь из единичного квадрата (по большей стороне) — в единицы высоты."""
    _, _, w, h = box
    if not h:
        return d, 1.0
    k = max(w, h) / h                      # во сколько раз растянуть обратно
    out, num = [], ""
    for ch in d:
        if ch in "ML Z,":
            if num:
                out.append(f"{float(num) * k:.3f}".rstrip("0").rstrip("."))
                num = ""
            if ch != " ":
                out.append(ch)
        else:
            num += ch
    if num:
        out.append(f"{float(num) * k:.3f}".rstrip("0").rstrip("."))
    return "".join(out), w / h


def bad_result(r):
    """Годен ли силуэт вообще. Не «лучший из», а «можно показывать»."""
    if not r or not r.get("ok"):
        return "чистка не удалась"
    a = r["after"]
    _, _, w, h = r["box"]
    if a["parts"] > 1:
        return f'кусков {a["parts"]}'
    if a["jag"] > 95:
        return f'изрезанность {a["jag"]:.0f}'
    if a["thin_pct"] > 4:
        return f'тонких отростков {a["thin_pct"]:.1f}%'
    if h and w / h > 2.2:
        return "маска лежачая — выбран не памятник"
    return None


def score_cleaned(r):
    """Чем меньше, тем лучше — но ТОЛЬКО для выбора между кадрами.

    Осторожно с «поменьше изрезанность»: сама по себе она награждает гладкую
    кляксу. Первая редакция так и сделала — у Челябинска, Нижнего Тагила и
    Владивостока выбрала ровный купол вместо узнаваемой фигуры, потому что у
    купола контур глаже. Поэтому в оценку входит и вертикальность: статуя выше,
    чем шире, а клякса — нет.
    """
    if not r or not r.get("ok"):
        return 9e9
    a = r["after"]
    _, _, w, h = r["box"]
    vert = h / max(1.0, w)
    return (a["jag"] + a["thin_pct"] * 8.0 + (a["parts"] - 1) * 25.0
            - min(vert, 4.0) * 22.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", nargs="*")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    corpus = {m["id"]: m for m in json.load(CORPUS.open(encoding="utf-8"))["items"]}
    manifest = json.load((ROOT / "manifest.json").open(encoding="utf-8"))
    overrides = sc.load_overrides()

    ids = args.ids or sorted(corpus)
    items, skipped, failed, multi = {}, [], [], 0
    rescued, unfit, manual = [], [], []

    for mid in ids:
        m = corpus.get(mid)
        if not m:
            continue
        ov = overrides.get(mid) or {}

        # ── ручное поверх автоматики ────────────────────────────────────
        # Если в поправках лежит готовый путь `d`, он берётся как есть и
        # автоматика для этого объекта не запускается вовсе. Так попадают в
        # ряд объекты, которые вырезка не берёт в принципе: у Ветлосяна это
        # ажурные леса с приваренным профилем — rembg отдаёт решётку с
        # просветами, а заливка дыр (пробовал 6/12/20 %) даёт бесформенное
        # пятно вместо профиля. Форма при этом известна буквально, так что
        # обводка руками — не компромисс, а правильный инструмент.
        # Путь ждём в тех же единицах, что и автоматический: y ∈ [0,1].
        if ov.get("d"):
            items[mid] = {"d": ov["d"], "ar": round(float(ov.get("ar", 1.0)), 3),
                          "src": "manual"}
            manual.append((mid, ov.get("note", "")))
            continue

        # Отбраковано человеком в инструменте — в манифест не идёт, сцена
        # рисует процедурную фигуру. Решение человека старше любой метрики.
        if ov.get("drop"):
            skipped.append((mid, "отбраковано вручную"))
            continue

        kind = m.get("kind")
        if kind in NONFIGURATIVE:
            skipped.append((mid, f"нефигуративный ({kind})"))
            continue
        photos = manifest.get(mid) or []
        if not photos:
            skipped.append((mid, "нет снимка"))
            continue

        def clean_frame(rel):
            mask = MASKS / mid / (Path(rel).stem + ".png")
            if not mask.exists():
                return None, None
            try:
                return sc.clean(mask, ov), mask
            except Exception:                                    # noqa: BLE001
                return None, None

        # Кадр 01 — выбор куратора: он же стоит в миниатюрах и карточках.
        # Остальные кадры это СПАСЕНИЕ, а не улучшение: пока первый годен, его
        # и берём. Иначе автоматика меняет узнаваемую фигуру на гладкую кляксу
        # ради метрики — что и случилось в первой редакции.
        best, best_rel = clean_frame(photos[0])
        why = bad_result(best)
        if why and len(photos) > 1:
            multi += 1
            best_s = score_cleaned(best) if best else 9e9
            for rel in photos[1:]:
                r, mask = clean_frame(rel)
                if r is None or bad_result(r):
                    continue
                s = score_cleaned(r)
                if s < best_s:
                    best, best_rel, best_s = r, mask, s
            rescued.append((mid, why,
                            "спасён кадром " + best_rel.name[:22] if best_rel
                            and best_rel.stem != Path(photos[0]).stem else "не спасён"))
        elif why:
            unfit.append((mid, why))
        # best может быть и словарём с ok=False — «после чистки пусто».
        if not best or not best.get("ok"):
            failed.append((mid, (best or {}).get("reason", "маски нет")))
            continue

        d, ar = normalise(best["d"], best["box"])
        items[mid] = {"d": d, "ar": round(ar, 3),
                      "src": "silhouettes/" + best_rel.name}

    data = {
        "_comment": ("Векторные силуэты: один путь на памятник, оба режима "
                     "(заливка/обрисовка) из него же. Координаты в единицах "
                     "ВЫСОТЫ: y от 0 до 1, x от 0 до ar. Растровые маски — "
                     "исходник, в репозиторий не едут."),
        "_version": VERSION,
        "items": items,
    }
    out = Path(args.out)
    with out.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    # Счётчик записей печатаем всегда — у 38 он дважды ловил обвал канона.
    print(f"=== путей {len(items)}, пропущено по типу/снимку {len(skipped)}, "
          f"отказов {len(failed)}; корпус {len(corpus)}")
    print(f"=== кадр 01 не годился у {multi} многокадровых — пробовали запасные")
    print(f"=== НЕ ГОДЯТСЯ и запасного кадра нет: {len(unfit)} (кандидаты в ручной список)")
    print(f"=== ручных путей (manual > auto): {len(manual)}")
    print(f"=== файл {out.name}: {out.stat().st_size / 1024:.0f} КБ")
    for mid, why in skipped[:14]:
        print(f"  пропуск: {mid:34s} {why}")
    for mid, why in failed[:14]:
        print(f"  ОТКАЗ:   {mid:34s} {why}")
    for mid, why, res in rescued:
        print(f"  спасение: {mid:32s} кадр 01: {why:28s} → {res}")
    print("\n── в ручной список (кадр 01 негоден, запасных нет) ──")
    for mid, why in unfit:
        print(f"  {mid:34s} {why}")


if __name__ == "__main__":
    main()
