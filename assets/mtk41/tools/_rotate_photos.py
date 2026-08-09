#!/usr/bin/env python3
"""Поворачивает снимки, помеченные в инструменте отбраковки.

    /usr/bin/python3 assets/mtk41/tools/_rotate_photos.py [--dry]

Читает `rot` из silhouettes_manual.json (градусы по часовой, кратно 90) и
поворачивает ФИЗИЧЕСКИ сам файл снимка, а не только силуэт. Иначе лежащий на
боку кадр остался бы лежать в иконостасе, в карточке и в заставке — то есть
везде, где его видит посетитель.

Порядок после прогона:
  1. _make_thumbs.py      — миниатюра и карточный тир пересобираются с нуля;
  2. _silhouettes_batch.py — маска считается заново с повёрнутого кадра;
  3. _silhouettes_manifest.py — вектор.

Почему маску нельзя просто повернуть вместе с картинкой: автоматическая
чистка (выбор компоненты, раструб, срез полки) считалась в СТАРОЙ ориентации,
и её выводы к повёрнутому кадру не относятся. Дешевле пересчитать.

Поворот записывается в `rot_applied`, а `rot` снимается — иначе повторный
прогон повернул бы снимок второй раз. Это ровно та ошибка, которую нельзя
заметить глазом на одном объекте и очень заметно на пятидесяти.
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OVERRIDES = ROOT / "silhouettes_manual.json"
MASKS = Path.home() / "Desktop/WWWWW/BMK/mtk41-silhouette-masks"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="только показать план")
    args = ap.parse_args()

    if not OVERRIDES.exists():
        print("поправок нет — поворачивать нечего")
        return 0
    cur = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))

    todo = [(k, v) for k, v in cur.items()
            if not k.startswith("_") and v.get("rot")]
    if not todo:
        print("=== снимков с пометкой поворота нет")
        return 0

    done = 0
    for mid, ov in sorted(todo):
        deg = int(ov["rot"]) % 360
        photos = manifest.get(mid) or []
        if deg % 90 or not photos:
            print(f"  пропуск {mid}: угол {deg}° или нет снимка")
            continue
        src = ROOT / mid / photos[0]
        if not src.exists():
            print(f"  пропуск {mid}: файл потерян")
            continue
        if args.dry:
            print(f"  {mid}: {src.name} на {deg}°")
            continue

        im = Image.open(src)
        # PIL крутит ПРОТИВ часовой, инструмент считает ПО часовой.
        im.rotate(-deg, expand=True).save(src, quality=95)

        # Маски этого объекта больше не соответствуют кадру — сносим, чтобы
        # _silhouettes_batch пересчитал, а не взял из кеша.
        mdir = MASKS / mid
        if mdir.is_dir():
            for p in mdir.iterdir():
                p.unlink()

        ov["rot_applied"] = deg + ov.get("rot_applied", 0)
        ov.pop("rot", None)
        done += 1
        print(f"  повёрнут {mid}: {deg}° (маски сброшены)")

    if not args.dry:
        OVERRIDES.write_text(json.dumps(cur, ensure_ascii=False, indent=2) + "\n",
                             encoding="utf-8")
    print(f"\n=== повёрнуто снимков: {done} из {len(todo)}")
    if done:
        print("Дальше: _make_thumbs.py → _silhouettes_batch.py → _silhouettes_manifest.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
