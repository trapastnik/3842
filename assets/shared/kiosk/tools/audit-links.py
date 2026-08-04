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
LOOKS_LIKE_PATH = re.compile(
    r"^[^\s:*?\"<>|]+\.(?:jpg|jpeg|png|webp|gif|svg|avif|mp4|webm|mp3|ogg|wav|"
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
    args = ap.parse_args()

    root = os.path.abspath(args.path)
    broken, scanned = [], 0
    for path in walk(root, SCAN_EXT):
        scanned += 1
        broken.extend(scan_file(path, repo))
    for path in walk(root, JSON_EXT):
        scanned += 1
        broken.extend(scan_json(path, repo))

    if args.json:
        print(json.dumps({"scanned": scanned, "broken": broken},
                         ensure_ascii=False, indent=1))
        return 1 if broken else 0

    print("Аудит локальных ссылок · проверено файлов: %d" % scanned)
    print("Корень: %s" % root)
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
