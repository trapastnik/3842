#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Тянет ПОДМНОЖЁННЫЕ Noto-шрифты под валидатор МТК 38 v2.

Для каждой не-латинской/кириллической письменности из data/mtk38.json берёт ровно те
символы, что реально нужны (написание «Ленин» + эндоним), и запрашивает у Google Fonts
subset-woff2 (параметр text=). Результат — крошечные файлы (1–5 КБ) в
mtk38-v2/fonts/noto/<iso15924>.woff2 + manifest.json.

Это subset ТОЛЬКО для валидатора (чтобы заказчик видел все письменности на любой машине).
Полные Noto для КИОСКА — отдельная задача координатора (assets/shared/fonts/noto/).

Запуск:  python3 mtk38-handoff/build_fonts.py   (нужна сеть; разовый vendoring-шаг)
"""
import urllib.request, urllib.parse, json, os, re, sys

HERE = os.path.dirname(__file__)
SRC = os.path.normpath(os.path.join(HERE, "..", "data", "mtk38.json"))
OUTDIR = os.path.normpath(os.path.join(HERE, "..", "mtk38-v2", "fonts", "noto"))
os.makedirs(OUTDIR, exist_ok=True)

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# iso15924 -> имя семейства в Google Fonts (латиница/кириллица не нужны — системные)
FAMILY = {
    "Arab":"Noto Sans Arabic","Armn":"Noto Sans Armenian","Beng":"Noto Sans Bengali",
    "Deva":"Noto Sans Devanagari","Ethi":"Noto Sans Ethiopic","Geor":"Noto Sans Georgian",
    "Grek":"Noto Sans","Gujr":"Noto Sans Gujarati","Guru":"Noto Sans Gurmukhi",
    "Hans":"Noto Sans SC","Hant":"Noto Sans TC","Hebr":"Noto Sans Hebrew",
    "Jpan":"Noto Sans JP","Khmr":"Noto Sans Khmer","Knda":"Noto Sans Kannada",
    "Kore":"Noto Sans KR","Laoo":"Noto Sans Lao","Mlym":"Noto Sans Malayalam",
    "Mtei":"Noto Sans Meetei Mayek","Mymr":"Noto Sans Myanmar","Nkoo":"Noto Sans NKo",
    "Olck":"Noto Sans Ol Chiki","Orya":"Noto Sans Oriya","Sinh":"Noto Sans Sinhala",
    "Taml":"Noto Sans Tamil","Telu":"Noto Sans Telugu","Tfng":"Noto Sans Tifinagh",
    "Thaa":"Noto Sans Thaana","Tibt":"Noto Serif Tibetan",
}

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=40).read()

def css_woff2_url(family, text, weight=None):
    fam = family.replace(" ", "+")
    if weight:                       # axis-синтаксис :wght@N — двоеточие/собаку НЕ кодируем
        fam += f":wght@{weight}"
    url = "https://fonts.googleapis.com/css2?family=" + fam + "&text=" + urllib.parse.quote(text)
    css = fetch(url).decode("utf-8")
    m = re.search(r"src:\s*url\(([^)]+)\)", css)
    return m.group(1) if m else None

data = json.load(open(SRC, encoding="utf-8"))
# собрать символы по письменности (написание + эндоним)
chars = {}
for l in data["languages"]:
    iso = l["script"]["iso15924"]
    if iso not in FAMILY:           # Latn/Cyrl и прочее системное — пропускаем
        continue
    s = chars.setdefault(iso, set())
    s.update(l["writing"]); s.update(l["endonym"])

manifest, bold, total = [], [], 0
for iso in sorted(chars):
    text = "".join(sorted(chars[iso]))
    try:
        url = css_woff2_url(FAMILY[iso], text)              # обычный (400)
        if not url:
            print(f"  ✗ {iso} ({FAMILY[iso]}): нет url в CSS", file=sys.stderr); continue
        w = fetch(url)
        open(os.path.join(OUTDIR, f"{iso}.woff2"), "wb").write(w)
        manifest.append(iso); total += len(w); nb = ""
        try:                                                # жирный (700)
            ub = css_woff2_url(FAMILY[iso], text, 700)
            if ub:
                wb = fetch(ub)
                open(os.path.join(OUTDIR, f"{iso}-700.woff2"), "wb").write(wb)
                bold.append(iso); total += len(wb); nb = f"+bold {len(wb)}b"
        except Exception as e:
            print(f"    (bold {iso}: {e})", file=sys.stderr)
        print(f"  ✓ {iso:5} {FAMILY[iso]:22} 400:{len(w):>5}b  {nb}")
    except Exception as e:
        print(f"  ✗ {iso} ({FAMILY[iso]}): {e}", file=sys.stderr)

json.dump({"scripts": manifest, "bold": bold, "note": "subset-Noto (400+700) только для валидатора"},
          open(os.path.join(OUTDIR, "manifest.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print(f"\nписьменностей: {len(manifest)} (+bold {len(bold)}) · суммарно {total/1024:.1f} КБ · {OUTDIR}")
