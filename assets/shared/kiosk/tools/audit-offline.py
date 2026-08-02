#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BMK 38-42 · Аудит автономности — поиск обращений в сеть по всем МТК.

Музейный киоск может стоять офлайн. Любая рантайм-зависимость от внешнего
хоста = чёрный экран на стенде. Это уже ломало прод МТК 39 (глобус тянул
d3 с esm.sh). Скрипт ищет такие места до, а не после приёмки.

Запуск (из корня репозитория):
    python3 assets/shared/kiosk/tools/audit-offline.py

    --path <dir>   проверить только поддерево (например, mtk42-app)
    --json         машинный вывод
    --all          показать и заметки (по умолчанию только ошибки)

Код возврата: 1, если найдено хоть одно рантайм-обращение в сеть.

Что НЕ считается нарушением:
  * XML-неймспейсы (xmlns="http://www.w3.org/2000/svg") — это идентификатор,
    а не адрес: браузер по нему никуда не ходит;
  * localhost / 127.0.0.1 — дев-сервер;
  * ссылки в комментариях и в .md — они никуда не ведут в рантайме
    (выводятся как заметки при --all).

ГРАНИЦА МЕТОДА. Скрипт видит только литералы в исходниках. Если адрес
приходит из данных через переменную (img.src = item.source, где source
лежит в data/mtkXX.json), grep его не поймает — такие адреса попадают в
заметки как упоминания в json. Поэтому аудит не заменяет проверку в
браузере: открыть DevTools → Network, offline-режим, прогнать все сцены
и убедиться, что после преролла запросов нет вовсе.
"""

import argparse
import json
import os
import re
import sys

# Расширения, которые реально исполняются в браузере.
SCAN_EXT = {".html", ".htm", ".js", ".mjs", ".css", ".json"}

# Каталоги, куда не заглядываем.
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".claude", "venv", ".venv"}

# Хосты-исключения: адрес присутствует, но сети не бывает.
ALLOW_HOST = re.compile(
    r"^https?://("
    r"localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]"      # дев-сервер
    r"|www\.w3\.org|www\.inkscape\.org|purl\.org"     # XML/SVG/RDF-неймспейсы
    r"|creativecommons\.org/ns"
    r")",
    re.I,
)

URL = r"""https?://[^\s'"()<>\\]+"""

# (имя правила, регулярка, пояснение). Порядок важен: первое совпадение — оно.
RULES = [
    ("iframe",
     re.compile(r"""<iframe[^>]*\bsrc\s*=\s*['"]?(""" + URL + r""")""", re.I),
     "<iframe> на внешний хост"),
    ("script-src",
     re.compile(r"""<script[^>]*\bsrc\s*=\s*['"]?(""" + URL + r""")""", re.I),
     "<script src> на внешний хост"),
    ("link-href",
     re.compile(r"""<link[^>]*\bhref\s*=\s*['"]?(""" + URL + r""")""", re.I),
     "<link href> (стили/шрифты) на внешний хост"),
    ("img-src",
     re.compile(r"""<(?:img|video|audio|source|track)[^>]*\bsrc\s*=\s*['"]?(""" + URL + r""")""", re.I),
     "медиа-тег на внешний хост"),
    ("css-import",
     re.compile(r"""@import\s+(?:url\()?\s*['"]?(""" + URL + r""")""", re.I),
     "@import из CSS на внешний хост"),
    ("css-url",
     re.compile(r"""\burl\(\s*['"]?(""" + URL + r""")""", re.I),
     "url() в CSS на внешний хост"),
    ("esm-import",
     re.compile(r"""\bimport\s+(?:[\w*{}\s,]+\s+from\s+)?['"](""" + URL + r""")['"]""", re.I),
     "ES-импорт с CDN"),
    # Многострочный импорт: сам "import {" остался выше, а адрес — здесь.
    # Именно так спрятался esm.sh в mtk38-poster/poster.js.
    ("from-url",
     re.compile(r"""\bfrom\s+['"](""" + URL + r""")['"]"""),
     "ES-импорт с CDN (многострочный)"),
    ("dynamic-import",
     re.compile(r"""\bimport\s*\(\s*['"](""" + URL + r""")['"]""", re.I),
     "динамический import() с CDN"),
    ("fetch",
     re.compile(r"""\bfetch\s*\(\s*['"`](""" + URL + r""")""", re.I),
     "fetch() на внешний хост"),
    ("xhr",
     re.compile(r"""\.open\s*\(\s*['"][A-Z]+['"]\s*,\s*['"`](""" + URL + r""")""", re.I),
     "XMLHttpRequest на внешний хост"),
    ("image-src",
     re.compile(r"""\.src\s*=\s*['"`](""" + URL + r""")""", re.I),
     "присваивание .src внешнего адреса (Image/script/iframe)"),
    ("websocket",
     re.compile(r"""new\s+(?:WebSocket|EventSource)\s*\(\s*['"`](wss?://[^\s'"`]+|""" + URL + r""")""", re.I),
     "WebSocket/EventSource наружу"),
    ("worker",
     re.compile(r"""new\s+(?:Worker|SharedWorker)\s*\(\s*['"`](""" + URL + r""")""", re.I),
     "Worker с внешнего адреса"),
    ("font-json",
     re.compile(r""""(?:src|url|href)"\s*:\s*"(""" + URL + r""")\"""", re.I),
     "внешний адрес в данных (json)"),
]

# Любой оставшийся внешний адрес — заметка, а не ошибка.
ANY_URL = re.compile(URL)

COMMENT_LINE = re.compile(r"""^\s*(//|/\*|\*|#|<!--)""")


def is_external(url):
    return not ALLOW_HOST.match(url)


def scan_file(path, rel):
    """Возвращает (ошибки, заметки) — списки словарей."""
    errors, notes = [], []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.read().splitlines()
    except OSError as err:
        notes.append({"file": rel, "line": 0, "rule": "io",
                      "why": "не прочитан: %s" % err, "text": ""})
        return errors, notes

    for n, line in enumerate(lines, 1):
        if "http" not in line:
            continue

        hit = None
        for name, rx, why in RULES:
            m = rx.search(line)
            if m and is_external(m.group(1)):
                hit = {"file": rel, "line": n, "rule": name, "why": why,
                       "text": line.strip()[:200], "url": m.group(1)}
                break

        if hit:
            # Правило сработало, но строка закомментирована — это заметка.
            if COMMENT_LINE.match(line):
                hit["why"] += " (в комментарии)"
                notes.append(hit)
            else:
                errors.append(hit)
            continue

        for m in ANY_URL.finditer(line):
            if is_external(m.group(0)):
                notes.append({"file": rel, "line": n, "rule": "mention",
                              "why": "внешний адрес упомянут (не вызов)",
                              "text": line.strip()[:200], "url": m.group(0)})
                break

    return errors, notes


def walk(root):
    for base, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for name in sorted(files):
            if os.path.splitext(name)[1].lower() in SCAN_EXT:
                yield os.path.join(base, name)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", "..", "..", ".."))

    ap = argparse.ArgumentParser(description="Аудит автономности BMK 38-42")
    ap.add_argument("--path", default=repo, help="что проверять (по умолчанию весь репозиторий)")
    ap.add_argument("--json", action="store_true", help="машинный вывод")
    ap.add_argument("--all", action="store_true", help="показать и заметки")
    args = ap.parse_args()

    root = os.path.abspath(args.path)
    errors, notes, scanned = [], [], 0

    for path in walk(root):
        scanned += 1
        rel = os.path.relpath(path, repo)
        e, w = scan_file(path, rel)
        errors.extend(e)
        notes.extend(w)

    if args.json:
        print(json.dumps({"scanned": scanned, "errors": errors, "notes": notes},
                         ensure_ascii=False, indent=1))
        return 1 if errors else 0

    print("Аудит автономности · проверено файлов: %d" % scanned)
    print("Корень: %s" % root)
    print()

    if errors:
        print("НАРУШЕНИЯ (%d) — обращения в сеть в рантайме:" % len(errors))
        by_file = {}
        for e in errors:
            by_file.setdefault(e["file"], []).append(e)
        for f in sorted(by_file):
            print("\n  %s" % f)
            for e in by_file[f]:
                print("    :%-5d %-14s %s" % (e["line"], e["rule"], e["why"]))
                print("            %s" % e["url"])
    else:
        print("НАРУШЕНИЙ НЕТ — рантайм-обращений в сеть не найдено.")

    if notes and args.all:
        print("\nЗаметки (%d) — упоминания адресов, не вызовы:" % len(notes))
        for w in notes:
            print("  %s:%d  %s  %s" % (w["file"], w["line"], w["rule"], w.get("url", "")))
    elif notes:
        print("\n(ещё %d упоминаний внешних адресов вне рантайма — покажет --all)" % len(notes))

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
