#!/usr/bin/env python3
"""Миниатюры кураторских фото для преролла киоск-приложения.

Зачем. Ядро киоска грузит `preload.images` на сплэше и держит их в
`ctx.images[url]` — значит, в памяти живут ДЕКОДИРОВАННЫЕ битмапы, а не
файлы. Замер по корпусу: 282 первых фото весят 19 МБ на диске, но в сумме
это 2097 Мп, то есть ~7.8 ГБ в RGBA. Отдать такое в преролл нельзя — киоск
ляжет ещё на сплэше.

Два тира — канонический паттерн для фотокорпусов (PLAN-KIOSK → «Оптимизация»,
решение координатора 2026-08-04):

  thumbs/01.jpg  THUMB_W = 480 px  — в преролл ядра. Плиточные сцены и любые
                 сетки берут только их. 289 шт ≈ 49 Мп ≈ 188 МБ RGBA.
  cards/01.jpg   CARD_W  = 1100 px — НЕ в преролл. Догружается по тапу, когда
                 посетитель открыл карточку одного памятника.

Почему догрузка законна: автономность киоска — про сеть, а не про диск.
Чтение файла рядом с приложением интернета не требует. (До ядра 1.7 проверка
`checkNetwork` в selftest.js этого не различает и ругается на догрузку — этот
один чек игнорируется с пометкой в отчёте приёмки.)

Оригиналы крупнее CARD_W в киоск не кладутся вовсе.

sips — родной macOS, чтобы не тащить Pillow в зависимости репозитория.

Запуск из корня репозитория:
    /usr/bin/python3 assets/mtk41/tools/_make_thumbs.py [--force]
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
ASSETS = ROOT / "assets/mtk41"
MANIFEST = ASSETS / "manifest.json"
THUMBS_INDEX = ASSETS / "thumbs.json"
CARDS_INDEX = ASSETS / "cards.json"
THUMB_W = 480      # преролл: сетки и плитки
CARD_W = 1100      # догрузка по тапу: карточка одного памятника
FORCE = "--force" in sys.argv


def resize(src, out, width):
    """sips -Z вписывает в квадрат width, то есть НЕ увеличивает мелкие
    оригиналы — что и нужно: апскейл дал бы вес без единого лишнего пикселя."""
    out.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ["sips", "-Z", str(width), "-s", "format", "jpeg",
         "-s", "formatOptions", "70", str(src), "--out", str(out)],
        capture_output=True,
    )
    return r.returncode == 0 and out.is_file(), r


def build(manifest, sub, width, index_path, human):
    index = {}
    made = skipped = failed = 0
    for mid, photos in sorted(manifest.items()):
        if not photos:
            continue
        src = ASSETS / mid / photos[0]
        if not src.is_file():
            continue
        out = ASSETS / mid / sub / "01.jpg"
        if out.is_file() and not FORCE:
            index[mid] = f"{sub}/{out.name}"
            skipped += 1
            continue
        ok, r = resize(src, out, width)
        if not ok:
            print(f"  ⚠ не удалось: {mid} — {r.stderr.decode()[:80]}", file=sys.stderr)
            failed += 1
            continue
        index[mid] = f"{sub}/{out.name}"
        made += 1

    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2),
                          encoding="utf-8")
    total = sum((ASSETS / m / p).stat().st_size for m, p in index.items()
                if (ASSETS / m / p).is_file())
    print(f"{human}: {len(index)} (создано {made}, уже были {skipped}, ошибок {failed}), "
          f"{total / 1048576:.1f} МБ → {index_path.relative_to(ROOT)}")


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    build(manifest, "thumbs", THUMB_W, THUMBS_INDEX, "миниатюры (преролл)")
    build(manifest, "cards", CARD_W, CARDS_INDEX, "карточные (по тапу)")


if __name__ == "__main__":
    main()
