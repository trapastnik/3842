#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v3 · генератор данных → mtk38-v3/words.js (ESM) + mtk38-v3/fonts/faces.css

ИСТОЧНИК ИСТИНЫ — общий с v2: data/mtk38.json (52 языка, схема Р2) + data/mtk38-quotes.json.
v3-страницы по http (ESM), поэтому данные отдаём как ES-модуль (export const WORDS/QUOTES),
а @font-face — отдельным css (шрифты вендорены в mtk38-v3/fonts/). html — артефакт сборки.

Запуск:  python3 mtk38-handoff/build_words_v3.py
"""
import json, os

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))
D = json.load(open(os.path.join(ROOT, "data", "mtk38.json"), encoding="utf-8"))
QP = os.path.join(ROOT, "data", "mtk38-quotes.json")
Q = json.load(open(QP, encoding="utf-8")) if os.path.exists(QP) else {"quotes": []}
FM = os.path.join(ROOT, "mtk38-v3", "fonts", "noto", "manifest.json")
scripts = sorted(json.load(open(FM, encoding="utf-8")).get("scripts", [])) if os.path.exists(FM) else []

words = []
for l in D["languages"]:
    p = l["geo"].get("primary")
    also = [a.get("region_ru") for a in (l["geo"].get("also") or []) if a.get("region_ru")]
    words.append({
        "id": l["id"], "w": l["writing"], "sc": l["script"]["iso15924"],
        "scn": l["script"]["name_ru"], "n": l["name_ru"], "e": l["endonym"],
        "f": l["family"], "r": (p["region_ru"] if p else "диаспора"),
        "also": also, "src": l["writing_source"], "ver": l["verifier"],
        "wt": l["weight"], "pr": l["weight"] >= 3,
    })

quotes = [{"ru": q.get("ru", ""), "en": q.get("en", ""), "work": q.get("work", ""),
           "pss": q.get("pss", ""), "src": q.get("source", "")}
          for q in Q.get("quotes", []) if q.get("show", True)]

OUT_JS = os.path.join(ROOT, "mtk38-v3", "words.js")
with open(OUT_JS, "w", encoding="utf-8") as f:
    f.write("// АВТОГЕНЕРАЦИЯ build_words_v3.py — из data/mtk38.json (источник истины). Руками не править.\n")
    f.write("export const WORDS = " + json.dumps(words, ensure_ascii=False) + ";\n")
    f.write("export const QUOTES = " + json.dumps(quotes, ensure_ascii=False) + ";\n")
    f.write("export const SCRIPTS = " + json.dumps(scripts, ensure_ascii=False) + ";\n")

# @font-face: noto-<iso> (400+700) + бренд 20 Kopeek (book+demibold). Пути относительно fonts/faces.css.
faces = []
faces.append('@font-face{font-family:"20 Kopeek";src:url("./kopeek/20-kopeek-book.otf") format("opentype");font-display:swap}')
faces.append('@font-face{font-family:"20 Kopeek";font-weight:600;src:url("./kopeek/20-kopeek-demibold.otf") format("opentype");font-display:swap}')
for s in scripts:
    faces.append(f'@font-face{{font-family:"noto-{s}";src:url("./noto/{s}.woff2") format("woff2");font-display:swap}}')
    faces.append(f'@font-face{{font-family:"noto-{s}";font-weight:700;src:url("./noto/{s}-700.woff2") format("woff2");font-display:swap}}')
OUT_CSS = os.path.join(ROOT, "mtk38-v3", "fonts", "faces.css")
with open(OUT_CSS, "w", encoding="utf-8") as f:
    f.write("/* АВТОГЕНЕРАЦИЯ build_words_v3.py — @font-face для v3 (вендорено локально). */\n")
    f.write("\n".join(faces) + "\n")

print(f"written: {OUT_JS}  ({len(words)} слов, {len(quotes)} цитат)")
print(f"written: {OUT_CSS}  ({len(scripts)} письменностей Noto + 20 Kopeek)")
