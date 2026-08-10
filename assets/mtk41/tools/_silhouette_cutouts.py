#!/usr/bin/env python3
"""Цветные вырезки памятников для сцены «Силуэты».

    /usr/bin/python3 assets/mtk41/tools/_silhouette_cutouts.py [--h 600]

Зачем, если есть вектор. Вектор даёт ПЛОСКУЮ форму — силуэт в буквальном
смысле. Но экспозиции нужна не форма, а сам памятник: бронза, гранит, снег на
плечах. Это видно только на вырезке с фотографии, и именно её просил
пользователь.

Материал уже есть: rembg отдаёт исходное изображение с прозрачным фоном, то
есть ЦВЕТ в масках сохранён — я до сих пор брал оттуда только альфу.

Что делает скрипт:
  · берёт маску того же кадра, что и вектор (с учётом поворота);
  · применяет ТУ ЖЕ обрезку и тот же выбор компоненты, что и вектор, — иначе
    цветная вырезка и контур разъедутся, и переключение режимов будет
    показывать разные объекты;
  · режет по границам фигуры и ужимает по высоте до --h;
  · пропускает отбракованных (drop) и нефигуративных — им вырезка не нужна.

Вектор при этом НЕ отменяется: он остаётся для режима обрисовки и как
запасной вариант там, где вырезки нет.
"""
import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT.parent.parent / "data" / "mtk41.json"
MASKS = Path(os.environ.get(
    "MTK41_MASKS", Path.home() / "Desktop/WWWWW/BMK/mtk41-silhouette-masks"))
OUT_INDEX = ROOT / "cutouts.json"
SUBDIR = "cutouts"

_spec = importlib.util.spec_from_file_location(
    "sc", Path(__file__).with_name("_silhouettes_clean.py"))
sc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sc)

_mspec = importlib.util.spec_from_file_location(
    "mf", Path(__file__).with_name("_silhouettes_manifest.py"))
mf = importlib.util.module_from_spec(_mspec)
_mspec.loader.exec_module(mf)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--h", type=int, default=600, help="высота вырезки, px")
    args = ap.parse_args()

    corpus = {m["id"]: m for m in json.load(CORPUS.open(encoding="utf-8"))["items"]}
    manifest = json.load((ROOT / "manifest.json").open(encoding="utf-8"))
    overrides = sc.load_overrides()

    index, skipped, bytes_total = {}, 0, 0
    for mid in sorted(corpus):
        ov = overrides.get(mid) or {}
        if ov.get("drop") or corpus[mid].get("kind") in mf.NONFIGURATIVE:
            skipped += 1
            continue
        photos = manifest.get(mid) or []
        if not photos:
            skipped += 1
            continue
        mask = MASKS / mid / (Path(photos[0]).stem + ".png")
        if not mask.exists():
            skipped += 1
            continue

        r = sc.clean(mask, ov)
        if not r.get("ok"):
            skipped += 1
            continue

        # Цвет берём из ТОЙ ЖЕ маски, а форму — из очищенной: так вырезка и
        # вектор показывают один и тот же объект, и переключение режимов не
        # подменяет памятник.
        src = Image.open(mask).convert("RGBA")
        rgba = np.array(src)
        keep = r["mask"].astype(bool)
        if keep.shape != rgba.shape[:2]:
            skipped += 1
            continue
        rgba[..., 3] = np.where(keep, rgba[..., 3], 0)

        ys, xs = np.nonzero(keep)
        im = Image.fromarray(rgba).crop(
            (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
        if im.height > args.h:
            w = max(1, round(im.width * args.h / im.height))
            im = im.resize((w, args.h), Image.LANCZOS)

        outdir = ROOT / mid / SUBDIR
        outdir.mkdir(exist_ok=True)
        dst = outdir / "01.png"
        im.save(dst, "PNG", optimize=True)
        bytes_total += dst.stat().st_size
        index[mid] = SUBDIR + "/01.png"

    with OUT_INDEX.open("w", encoding="utf-8") as f:
        json.dump({
            "_comment": ("Цветные вырезки памятников: сам объект с фотографии, "
                         "фон снят, форма та же, что у вектора. Высота "
                         f"{args.h} px."),
            "_version": "2026-08-09",
            "items": index,
        }, f, ensure_ascii=False, indent=1)

    # Счётчик записей печатаем всегда — у 38 он дважды ловил обвал канона.
    print(f"=== вырезок {len(index)}, пропущено {skipped}; корпус {len(corpus)}")
    print(f"=== вес {bytes_total / 1e6:.1f} МБ при высоте {args.h} px")
    print(f"=== индекс: {OUT_INDEX.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
