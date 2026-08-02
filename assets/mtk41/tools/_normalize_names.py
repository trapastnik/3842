#!/usr/bin/env python3
"""Схлопывание вариантов написания имён авторов в data/mtk41.json.

Четыре источника корпуса набирались разными людьми, и один и тот же скульптор
записан по-разному — почти всегда это только пробел между инициалами:
«В. В. Козлов» и «В.В. Козлов». Для mtk41-authors это не косметика: Козлов
разъезжался на две записи по 13 и 2, и первым по числу памятников выглядел
Томский. После склейки Козлов — 15, Томский — 14.

Ключ сравнения агрессивнее, чем нужно для показа (убирает ё и роль-префикс),
поэтому отображаемое имя не строится из ключа: за каноническое берётся самое
частое из встреченных написаний.

Запуск из корня репозитория:
    /usr/bin/python3 assets/mtk41/tools/_normalize_names.py [--dry-run]
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA = ROOT / "data/mtk41.json"
DRY = "--dry-run" in sys.argv

FIELDS = ("sculptors", "architects")


def key(name):
    """Ключ сравнения. Только для группировки — не для показа."""
    s = name.replace("ё", "е").strip(" .,;:")
    s = re.sub(r"^(скульптор|архитектор|автор)\w*\s+", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s)
    # «В. В. Козлов» → «В.В. Козлов»: пробел между инициалами не значим
    s = re.sub(r"\b([А-ЯA-Z])\.\s+(?=[А-ЯA-Z]\.)", r"\1.", s)
    return s.lower()


def main():
    cat = json.loads(DATA.read_text(encoding="utf-8"))
    variants = defaultdict(Counter)
    for it in cat["items"]:
        for f in FIELDS:
            for n in it.get(f, []):
                variants[key(n)][n] += 1

    # Каноническое написание — самое частое, но приведённое к единому виду
    # инициалов. Иначе Харламов остался бы «М. Я.», а Козлов «В.В.» — просто
    # потому, что у них по-разному сложилось большинство.
    def display(name):
        s = re.sub(r"^(скульптор|архитектор|автор)\w*\s+", "", name.strip(" .,;:"), flags=re.I)
        s = re.sub(r"\s+", " ", s)
        return re.sub(r"\b([А-ЯA-Z])\.\s+(?=[А-ЯA-Z]\.)", r"\1.", s)

    canon = {k: display(min(c.most_common(), key=lambda kv: (-kv[1], len(kv[0])))[0])
             for k, c in variants.items()}

    merged = {k: c for k, c in variants.items() if len(c) > 1}
    originals = sum(len(c) for c in variants.values())
    print(f"написаний в данных: {originals} → уникальных авторов: {len(canon)}")
    print(f"схлопнуто групп: {len(merged)}")
    for k, c in sorted(merged.items(), key=lambda kv: -sum(kv[1].values())):
        print(f"  {canon[k]:26} {sum(c.values()):3}  ← {sorted(c)}")

    changed = 0
    for it in cat["items"]:
        for f in FIELDS:
            if f not in it:
                continue
            new, seen = [], set()
            for n in it[f]:
                c = canon[key(n)]
                if c not in seen:          # один автор дважды в одной записи — не нужен
                    seen.add(c)
                    new.append(c)
            if new != it[f]:
                it[f] = new
                changed += 1
    print(f"записей затронуто: {changed}")

    if DRY:
        print("--- DRY RUN, файл не тронут ---")
        return
    DATA.write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")
    print("data/mtk41.json перезаписан")


if __name__ == "__main__":
    main()
