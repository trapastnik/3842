#!/usr/bin/env python3
"""Вливает решения из инструмента отбраковки в поправки силуэтов.

    /usr/bin/python3 assets/mtk41/tools/_apply_triage.py ~/Downloads/mtk41-triage.json

Инструмент — `mtk41-triage/index.html`, открывается по http. Он отдаёт json
вида {"items": {"<id>": {"v": "ok|bad|man", "cut": 0.86}}}, где `cut` — линия
земли В ДОЛЯХ ВЫСОТЫ силуэта: там режется вектор, и пикселей исходной маски
человек не видит.

Что делает скрипт:
  · `cut`      → `cut_norm` в silhouettes_manual.json (авто-рез отключается);
  · `v: bad`   → `drop: true` — объект не попадает в манифест, сцена рисует
                 процедурную фигуру, как и раньше;
  · `v: man`   → `manual_todo: true` — метка «ждёт ручной обводки»; путь
                 подставится, когда в поправке появится поле `d`;
  · `v: ok`    → ничего, это подтверждение автоматики.

Прежние ручные записи НЕ затираются: у них есть поле `note`, написанное
человеком, и терять его нельзя. Скрипт дописывает поля и печатает, что
изменилось.
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OVERRIDES = ROOT / "silhouettes_manual.json"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    src = Path(sys.argv[1]).expanduser()
    if not src.exists():
        print(f"нет файла: {src}")
        return 1

    incoming = json.loads(src.read_text(encoding="utf-8")).get("items") or {}
    cur = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}

    added = changed = 0
    dropped_px = []
    stats = {"ok": 0, "bad": 0, "man": 0, "cut": 0}
    for mid, rec in sorted(incoming.items()):
        v = rec.get("v")
        cut = rec.get("cut")
        if not v and cut is None:
            continue
        if v in stats:
            stats[v] += 1
        if cut is not None:
            stats["cut"] += 1

        entry = cur.get(mid)
        if entry is None:
            entry = cur[mid] = {}
            added += 1
        else:
            changed += 1

        if cut is not None:
            entry["cut_norm"] = cut
            # Старая линия в пикселях снимается: в чистке cut_y проверяется
            # первым, и оставь мы оба — новое решение человека молча
            # проиграло бы старому числу. Свежее решение старше.
            if entry.pop("cut_y", None) is not None:
                dropped_px.append(mid)
        else:
            entry.pop("cut_norm", None)

        entry.pop("drop", None)
        entry.pop("manual_todo", None)
        if v == "bad":
            entry["drop"] = True
        elif v == "man":
            entry["manual_todo"] = True

        if not entry.get("note"):
            entry["note"] = "решение из инструмента отбраковки"

    # Резервная копия рядом: правки в этом файле пишет человек, и затереть их
    # молча нельзя (правило «перед перезаписью посмотри, что там»).
    if OVERRIDES.exists():
        shutil.copy(OVERRIDES, OVERRIDES.with_suffix(".json.bak"))

    OVERRIDES.write_text(json.dumps(cur, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")

    print(f"=== принято решений: годен {stats['ok']}, брак {stats['bad']}, "
          f"руками {stats['man']}, с линией земли {stats['cut']}")
    print(f"=== записей в поправках: новых {added}, обновлено {changed}, "
          f"всего {len([k for k in cur if not k.startswith('_')])}")
    if dropped_px:
        print("=== заменена прежняя линия в пикселях у: " + ", ".join(dropped_px))
    print(f"=== резервная копия: {OVERRIDES.with_suffix('.json.bak').name}")
    print("Дальше: _silhouettes_manifest.py — пересобрать манифест.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
