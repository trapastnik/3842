#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""МТК 38 · build_v1_ids.py — проставляет прототипам V1 связь с каноном.

Записи V1 хранили только написание, письменность и (в каталоге) эндоним с
регионом: ни ISO-кода, ни русского названия, ни числа носителей. Из-за этого
карточка не могла ни назвать язык по-русски, ни подтянуть издание.

Скрипт добавляет в каждую запись `id` (ISO 639-3), `langRu`, `region`
и `speakers`, взятые из data/mtk38.json. Все пять прототипов V1 несут
ОДИН И ТОТ ЖЕ список из 42 записей в одном порядке — сверка по написанию
это подтверждает, поэтому раскладка идёт по индексу.

Эндоним каталога сходится с каноном у 33 из 42; девять расхождений орфографии
(«Hindi» против «हिन्दी», «Қазақша» против «казақ тілі») разрешены таблицей
MANUAL — руками, а не эвристикой, чтобы результат был воспроизводим.

Запуск:  python3 mtk38-handoff/build_v1_ids.py
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CANON = ROOT / "data/mtk38.json"
VARIANTS = ["catalog", "cloud", "poster", "rain", "ticker"]

MANUAL = {
    "Hindi": "hin", "Bengali": "ben", "Italiano": "ita", "Polski": "pol",
    "Українська": "ukr", "Қазақша": "kaz", "ไทย": "tha", "Amharic": "amh",
    "မြန်မာ": "mya",
}

ENTRY = re.compile(r'\{[^{}]*?text:\s*"[^"]*"[^{}]*?\}')


def norm(s):
    return unicodedata.normalize("NFC", (s or "").strip().lower())


def main():
    canon = json.loads(CANON.read_text(encoding="utf-8"))["languages"]
    by_id = {l["id"]: l for l in canon}
    by_endonym = {}
    for l in canon:
        by_endonym.setdefault(norm(l["endonym"]), l)

    src = (ROOT / "mtk38-catalog/catalog.js").read_text(encoding="utf-8")
    rows = re.findall(
        r'\{\s*text:\s*"([^"]*)",\s*lang:\s*"([^"]*)",\s*script:\s*"([^"]*)",\s*tag:\s*"([^"]*)"[^}]*\}', src)
    if len(rows) != 42:
        raise SystemExit(f"ожидалось 42 записи в каталоге, найдено {len(rows)}")

    meta = []
    for text, lang, script, tag in rows:
        lid = MANUAL.get(lang) or (by_endonym.get(norm(lang)) or {}).get("id")
        if not lid:
            raise SystemExit(f"не разрешён язык: {lang} ({text})")
        c = by_id[lid]
        g = (c.get("geo") or {}).get("primary") or {}
        meta.append({
            "id": lid,
            "langRu": c["name_ru"],
            "lang": lang,
            "region": g.get("region_ru", ""),
            "speakers": c.get("speakers_mln"),
        })

    for v in VARIANTS:
        p = ROOT / f"mtk38-{v}/{v}.js"
        if not p.exists():
            print(f"  ⚠ нет {p.name}", file=sys.stderr); continue
        s = p.read_text(encoding="utf-8")
        found = ENTRY.findall(s)
        if len(found) != 42:
            print(f"  ⚠ {v}: записей {len(found)}, ожидалось 42 — пропускаю", file=sys.stderr); continue

        i = [0]

        def add(m):
            body, k = m.group(0), i[0]; i[0] += 1
            if "id:" in body:                       # уже проставлено — не дублируем
                return body
            e = meta[k]
            extra = f', id: "{e["id"]}", langRu: "{e["langRu"]}"'
            if "lang:" not in body:
                extra += f', lang: "{e["lang"]}"'
            if "region:" not in body and e["region"]:
                extra += f', region: "{e["region"]}"'
            if isinstance(e["speakers"], (int, float)):
                extra += f', speakers: {e["speakers"]}'
            return body[:body.rindex("}")].rstrip().rstrip(",") + extra + " }"

        s = ENTRY.sub(add, s)
        p.write_text(s, encoding="utf-8")
        print(f"  ✓ {v}: 42 записи связаны с каноном")

    print(f"\nсвязано языков: {len({m['id'] for m in meta})}")


if __name__ == "__main__":
    main()
