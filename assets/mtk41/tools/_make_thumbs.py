#!/usr/bin/env python3
"""Миниатюры кураторских фото для преролла киоск-приложения.

Зачем. Ядро киоска грузит `preload.images` на сплэше и держит их в
`ctx.images[url]` — значит, в памяти живут ДЕКОДИРОВАННЫЕ битмапы, а не
файлы. Замер по корпусу: 282 первых фото весят 19 МБ на диске, но в сумме
это 2097 Мп, то есть ~7.8 ГБ в RGBA. Отдать такое в преролл нельзя — киоск
ляжет ещё на сплэше.

Что делает. Кладёт рядом с каждым фото уменьшенную копию шириной THUMB_W в
`<id>/thumbs/`. Иконостас и любые плиточные сцены грузят миниатюры (282 ×
480×320 ≈ 43 Мп ≈ 173 МБ RGBA — уже подъёмно), а полноразмерный снимок
открывается только в карточке одного памятника, по тапу, с локального диска.

Сеть тут ни при чём: правило офлайна запрещает ходить в интернет, а не
читать файл рядом. Один снимок по тапу — это чтение с диска, не догрузка
из сети.

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
THUMB_W = 480
FORCE = "--force" in sys.argv


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    index = {}
    made = skipped = failed = 0

    for mid, photos in sorted(manifest.items()):
        if not photos:
            continue
        src = ASSETS / mid / photos[0]
        if not src.is_file():
            continue
        out_dir = ASSETS / mid / "thumbs"
        out = out_dir / "01.jpg"
        if out.is_file() and not FORCE:
            index[mid] = f"thumbs/{out.name}"
            skipped += 1
            continue
        out_dir.mkdir(parents=True, exist_ok=True)
        r = subprocess.run(
            ["sips", "-Z", str(THUMB_W), "-s", "format", "jpeg",
             "-s", "formatOptions", "70", str(src), "--out", str(out)],
            capture_output=True,
        )
        if r.returncode != 0 or not out.is_file():
            print(f"  ⚠ не удалось: {mid} — {r.stderr.decode()[:80]}", file=sys.stderr)
            failed += 1
            continue
        index[mid] = f"thumbs/{out.name}"
        made += 1

    THUMBS_INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2),
                            encoding="utf-8")
    total = sum((ASSETS / m / p).stat().st_size for m, p in index.items()
                if (ASSETS / m / p).is_file())
    print(f"миниатюр: {len(index)} (создано {made}, уже были {skipped}, ошибок {failed})")
    print(f"суммарный вес: {total / 1048576:.1f} МБ")
    print(f"индекс: {THUMBS_INDEX.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
