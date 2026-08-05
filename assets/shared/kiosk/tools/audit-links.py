#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BMK 38-42 · Аудит локальных ссылок — есть ли файл, на который ссылаемся.

Битая локальная ссылка не падает и не кричит: браузер молча пропускает
её. Кейс соседей по МТК 29 — опечатка в пути к CSS шрифта, и весь текст
поехал в Georgia; на глаз от задуманного почти не отличить, поймали
случайно. Отсюда правило: путей на глаз не проверяем, проверяем скриптом.

Запуск (из корня репозитория), рядом с audit-offline.py:
    python3 assets/shared/kiosk/tools/audit-links.py

    --path <dir>   проверить только поддерево (например, mtk42-app)
    --json         машинный вывод

Код возврата: 1, если хоть одна локальная ссылка ведёт в никуда.

Что проверяем: href/src/srcset в html, url(...) и @import в css,
относительные и абсолютные-от-корня пути. Внешние адреса (http/https,
//, data:, blob:, mailto:, tel:, #якорь) — не наша забота, ими занимается
audit-offline.py.

ГРАНИЦА МЕТОДА. Видны только литералы в разметке и стилях. Путь,
собранный в JS из переменных ("assets/" + id + ".jpg"), скриптом не
проверяется — такие наборы проверяются прогоном сцены и healthcheck().
"""

import argparse
import json
import os
import re
import sys
from urllib.parse import unquote

SCAN_EXT = {".html", ".htm", ".css"}

# JSON-индексы вида {"id": "portraits/01.jpg"} или {"id": {"src": "..."}}:
# по ним сцены собирают пути в рантайме, в разметке этих ссылок нет.
# Находка МТК 41: 7 миниатюр-сирот уезжали в преролл, ни разу не появившись
# на экране, — по html/css такое не видно.
JSON_EXT = {".json"}

# Ключи, значение которых считаем путём к файлу.
JSON_PATH_KEYS = {"src", "url", "path", "file", "image", "img", "thumb",
                  "thumbnail", "preview", "poster", "photo", "asset"}

# Похоже на относительный путь к файлу с расширением (а не на подпись/id).
# ПРОБЕЛЫ РАЗРЕШЕНЫ: в манифесте МТК 41 имена вида
# «photos/01_Памятник Ленину в Костроме.jpg» — обычное дело. Пока пробел
# был запрещён, такие пути (а) не проверялись на существование и (б) не
# попадали в used-набор, отчего 19 живых файлов из 56 числились сиротами.
LOOKS_LIKE_PATH = re.compile(
    r"^[^\n\r:*?\"<>|]+\.(?:jpg|jpeg|png|webp|gif|svg|avif|mp4|webm|mp3|ogg|wav|"
    r"woff2?|otf|ttf|json|geojson|csv|txt)$", re.I)
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".claude", "venv", ".venv"}

# Схемы и формы, которые к файлам на диске отношения не имеют.
EXTERNAL = re.compile(r"^\s*(?:[a-z][a-z0-9+.-]*:|//|#|\{)", re.I)

PATTERNS = [
    ("href", re.compile(r"""\bhref\s*=\s*["']([^"']+)["']""", re.I)),
    ("src", re.compile(r"""\bsrc\s*=\s*["']([^"']+)["']""", re.I)),
    ("srcset", re.compile(r"""\bsrcset\s*=\s*["']([^"']+)["']""", re.I)),
    ("poster", re.compile(r"""\bposter\s*=\s*["']([^"']+)["']""", re.I)),
    ("css-url", re.compile(r"""\burl\(\s*["']?([^"')]+)["']?\s*\)""", re.I)),
    ("css-import", re.compile(r"""@import\s+["']([^"']+)["']""", re.I)),
]


def candidates(kind, raw):
    """srcset — это список «путь дескриптор», остальное — один путь."""
    if kind == "srcset":
        out = []
        for part in raw.split(","):
            part = part.strip()
            if part:
                out.append(part.split()[0])
        return out
    return [raw]


def resolve(repo, src_file, ref):
    """Путь ссылки → путь на диске. None, если проверять нечего."""
    # Раскодируем ДО проверки: ссылка на фрагмент SVG внутри data-URI
    # выглядит как url(%23n) — это filter="url(#n)", а не файл.
    ref = unquote(ref.strip())
    if not ref or EXTERNAL.match(ref):
        return None
    ref = ref.split("#", 1)[0].split("?", 1)[0]
    if not ref:
        return None
    base = repo if ref.startswith("/") else os.path.dirname(src_file)
    return os.path.normpath(os.path.join(base, ref.lstrip("/")))


COMMENTS = re.compile(r"/\*.*?\*/|<!--.*?-->", re.S)


def strip_comments(text):
    """Гасим комментарии, сохраняя разбивку на строки: примеры подключения
    в шапках файлов — не ссылки, и ловить их как битые бессмысленно
    (первый же прогон поймал этим сам себя)."""
    def blank(m):
        return re.sub(r"[^\n]", " ", m.group(0))
    return COMMENTS.sub(blank, text)


def scan_file(path, repo):
    broken = []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            lines = strip_comments(fh.read()).splitlines()
    except OSError as err:
        return [{"file": os.path.relpath(path, repo), "line": 0, "kind": "io",
                 "ref": "", "why": str(err)}]

    for n, line in enumerate(lines, 1):
        for kind, rx in PATTERNS:
            for m in rx.finditer(line):
                for ref in candidates(kind, m.group(1)):
                    target = resolve(repo, path, ref)
                    if target is None or os.path.exists(target):
                        continue
                    broken.append({
                        "file": os.path.relpath(path, repo),
                        "line": n,
                        "kind": kind,
                        "ref": ref,
                        "why": "нет файла " + os.path.relpath(target, repo),
                    })
    return broken


def json_refs(node, owner=None):
    """Пары (путь, ключ-владелец) внутри JSON.

    Владелец — ближайший ключ словаря выше по дереву: у индексов вида
    {"abakan-1970": ["photos/01.jpg"]} он и есть каталог, относительно
    которого путь имеет смысл.

    Берём только строки С РАЗДЕЛИТЕЛЕМ: голое «leti.jpg» — это имя, к
    которому сцена сама приклеивает каталог, и проверять его нечем."""
    out = []
    if isinstance(node, dict):
        for k, v in node.items():
            out.extend(json_refs(v, k))
    elif isinstance(node, list):
        for v in node:
            out.extend(json_refs(v, owner))
    elif isinstance(node, str):
        val = node.strip()
        if "/" in val and LOOKS_LIKE_PATH.match(val):
            out.append((val, owner))
    return out


def scan_json(path, repo):
    """База у каждого индекса своя: у одних пути от каталога самого файла,
    у других от корня репозитория, у третьих от каталога-ключа. Пробуем
    всех кандидатов и ругаемся, только если не нашлось НИ ОДНОГО — иначе
    инструмент тонет в ложных срабатываниях, и ему перестают верить."""
    broken, seen = [], set()
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return broken            # битый json — забота других проверок

    here = os.path.dirname(path)
    for ref, owner in json_refs(data):
        if ref in seen:
            continue
        seen.add(ref)
        clean = unquote(ref.split("#", 1)[0].split("?", 1)[0])
        bases = [here, repo]
        if isinstance(owner, str) and owner and "/" not in owner:
            bases.insert(0, os.path.join(here, owner))
        if any(os.path.exists(os.path.normpath(os.path.join(b, clean))) for b in bases):
            continue
        broken.append({
            "file": os.path.relpath(path, repo),
            "line": 0,
            "kind": "json-index",
            "ref": ref,
            "why": "нет файла ни от одной базы (" +
                   ", ".join(os.path.relpath(b, repo) or "." for b in bases) + ")",
        })
    return broken


# Что в каталоге ассетов не является контентом и сиротой считаться не должно.
ORPHAN_SKIP = re.compile(
    r"(^|/)(_|\.)|\.(md|py|txt|json|yml|yaml|sh|log)$|/(sources|raw|src|tools)/", re.I)


def collect_referenced(root, repo):
    """Все локальные пути, на которые хоть кто-то ссылается."""
    used = set()

    def add(path, ref, owner=None):
        clean = unquote(ref.split("#", 1)[0].split("?", 1)[0])
        if not clean or EXTERNAL.match(clean):
            return
        here = os.path.dirname(path)
        bases = [here, repo]
        if isinstance(owner, str) and owner and "/" not in owner:
            bases.insert(0, os.path.join(here, owner))
        if clean.startswith("/"):
            bases = [repo]
            clean = clean.lstrip("/")
        for b in bases:
            used.add(os.path.normpath(os.path.join(b, clean)))

    for path in walk(root, SCAN_EXT):
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                text = strip_comments(fh.read())
        except OSError:
            continue
        for kind, rx in PATTERNS:
            for m in rx.finditer(text):
                for ref in candidates(kind, m.group(1)):
                    add(path, ref)
    for path in walk(root, JSON_EXT):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            continue
        for ref, owner in json_refs(data):
            add(path, ref, owner)
    return used


def find_orphans(root, repo):
    """Медиа-файлы, на которые не ссылается никто.

    Гигиена диска киоска: лишний файл не ломает экран, но едет на стенд и
    попадает в преролл. Отчёт заведомо неполный — путь, собранный в JS из
    переменных, скрипту не виден, поэтому проверка и живёт под флагом, а
    не в обычном прогоне."""
    used = collect_referenced(root, repo)
    media = re.compile(r"\.(jpg|jpeg|png|webp|gif|svg|avif|mp4|webm|mp3|ogg|wav|woff2?|otf|ttf)$", re.I)

    # Считаем по каталогам: сколько файлов упомянуто, сколько нет.
    by_dir = {}
    for base, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for name in sorted(files):
            if not media.search(name):
                continue
            full = os.path.normpath(os.path.join(base, name))
            rel = os.path.relpath(full, repo)
            if ORPHAN_SKIP.search("/" + rel):
                continue
            d = by_dir.setdefault(os.path.dirname(rel), {"used": 0, "orphans": []})
            if full in used:
                d["used"] += 1
            else:
                d["orphans"].append(rel)

    # Каталог, где НЕ УПОМЯНУТ НИ ОДИН файл, — почти наверняка тот, куда
    # путь собирается в JS из переменной. Перечислять его пофайлово
    # бессмысленно: у МТК 38 это дало бы 400 строк шума, в которых
    # настоящая находка утонет. Показываем одной строкой.
    # Одиночки в каталоге, который в остальном используется, — наоборот,
    # самый ценный сигнал: ровно так выглядели 7 миниатюр-сирот у 41.
    singles, whole = [], []
    for d in sorted(by_dir):
        info = by_dir[d]
        if not info["orphans"]:
            continue
        if info["used"]:
            singles.extend(info["orphans"])
        else:
            whole.append((d, len(info["orphans"])))
    return {"singles": singles, "whole": whole}


def walk(root, exts):
    for base, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for name in sorted(files):
            if os.path.splitext(name)[1].lower() in exts:
                yield os.path.join(base, name)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, "..", "..", "..", ".."))

    ap = argparse.ArgumentParser(description="Аудит локальных ссылок BMK 38-42")
    ap.add_argument("--path", default=repo, help="что проверять (по умолчанию весь репозиторий)")
    ap.add_argument("--json", action="store_true", help="машинный вывод")
    ap.add_argument("--orphans", action="store_true",
                    help="дополнительно: медиа, на которые никто не ссылается (гигиена диска)")
    args = ap.parse_args()

    root = os.path.abspath(args.path)
    broken, scanned = [], 0
    for path in walk(root, SCAN_EXT):
        scanned += 1
        broken.extend(scan_file(path, repo))
    for path in walk(root, JSON_EXT):
        scanned += 1
        broken.extend(scan_json(path, repo))

    orphans = find_orphans(root, repo) if args.orphans else {"singles": [], "whole": []}

    if args.json:
        print(json.dumps({"scanned": scanned, "broken": broken, "orphans": orphans},
                         ensure_ascii=False, indent=1))
        return 1 if broken else 0

    print("Аудит локальных ссылок · проверено файлов: %d" % scanned)
    print("Корень: %s" % root)
    print()

    if args.orphans:
        singles, whole = orphans["singles"], orphans["whole"]
        if singles:
            print("СИРОТЫ-ОДИНОЧКИ (%d) — в каталогах, которые в остальном используются." % len(singles))
            print("Это и есть полезный сигнал: файл лежит и едет на стенд, а показать его некому.")
            for o in singles[:40]:
                print("    %s" % o)
            if len(singles) > 40:
                print("    … и ещё %d" % (len(singles) - 40))
        else:
            print("СИРОТ-ОДИНОЧЕК НЕТ.")
        if whole:
            print("\nКаталоги, где не упомянут ни один файл — почти наверняка путь")
            print("собирается в JS из переменной; пофайлово не перечисляю:")
            for d, n in whole:
                print("    %-52s %d файл(ов)" % (d, n))
        print("\n  (отчёт неполный: путь, собранный в JS, скрипту не виден)")
        print()

    if not broken:
        print("БИТЫХ ССЫЛОК НЕТ.")
        return 0

    print("БИТЫЕ ССЫЛКИ (%d):" % len(broken))
    by_file = {}
    for b in broken:
        by_file.setdefault(b["file"], []).append(b)
    for f in sorted(by_file):
        print("\n  %s" % f)
        for b in by_file[f]:
            print("    :%-5d %-10s %s" % (b["line"], b["kind"], b["ref"]))
            print("            %s" % b["why"])
    return 1


if __name__ == "__main__":
    sys.exit(main())
