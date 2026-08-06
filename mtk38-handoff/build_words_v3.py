#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v3 · генератор @font-face → mtk38-v3/fonts/faces.css (из манифеста subset-Noto + бренд 20 Kopeek).

СЛОВА v3 БОЛЬШЕ НЕ ГЕНЕРИРУЮТСЯ в words.js. Все композиции читают канон data/mtk38.json
НАПРЯМУЮ в рантайме через mtk38-v3/engine/data.js (тот же источник, из которого собирается
V2 через build_*.py) — единый источник истины, чистый мердж, правка 52→53 подхватывается сама.
Этот скрипт собирает только @font-face для вендоренных локально шрифтов.

Запуск:  python3 mtk38-handoff/build_words_v3.py
"""
import json, os

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))
FM = os.path.join(ROOT, "mtk38-v3", "fonts", "noto", "manifest.json")
scripts = sorted(json.load(open(FM, encoding="utf-8")).get("scripts", [])) if os.path.exists(FM) else []

faces = []
faces.append('@font-face{font-family:"20 Kopeek";src:url("./kopeek/20-kopeek-book.otf") format("opentype");font-display:swap}')
faces.append('@font-face{font-family:"20 Kopeek";font-weight:600;src:url("./kopeek/20-kopeek-demibold.otf") format("opentype");font-display:swap}')
# 21 Cent — читаемый текст и описания, Nolde — только крупные заголовки
# (дизайн-код 2026-05-12). Лежат локально в mtk38-v3/fonts/, а не ссылкой на
# mtk38-globe/: v3 должен собираться в самодостаточный дистрибутив.
faces.append('@font-face{font-family:"21 Cent";src:url("./cent/21Cent.woff") format("woff");font-display:swap}')
faces.append('@font-face{font-family:"21 Cent";font-weight:700;src:url("./cent/21Cent-Bold.woff") format("woff");font-display:swap}')
faces.append('@font-face{font-family:"Nolde";src:url("./nolde/nolde.otf") format("opentype");font-display:swap}')
NOTO_DIR = os.path.join(ROOT, "mtk38-v3", "fonts", "noto")
for s in scripts:
    faces.append(f'@font-face{{font-family:"noto-{s}";src:url("./noto/{s}.woff2") format("woff2");font-display:swap}}')
    # Полужирное начертание есть не у всех письменностей (у Noto Sans NKo и
    # Tifinagh его нет вовсе). Объявлять несуществующий файл нельзя: браузер
    # молча роняет всё семейство в фолбэк, и текст уходит в тофу — лучше
    # оставить один вес и дать синтезировать жирность.
    if os.path.exists(os.path.join(NOTO_DIR, f"{s}-700.woff2")):
        faces.append(f'@font-face{{font-family:"noto-{s}";font-weight:700;src:url("./noto/{s}-700.woff2") format("woff2");font-display:swap}}')

OUT_CSS = os.path.join(ROOT, "mtk38-v3", "fonts", "faces.css")
with open(OUT_CSS, "w", encoding="utf-8") as f:
    f.write("/* АВТОГЕНЕРАЦИЯ build_words_v3.py — @font-face для v3 (вендорено локально). */\n")
    f.write("\n".join(faces) + "\n")

print(f"written: {OUT_CSS}  ({len(scripts)} письменностей Noto + 20 Kopeek)")
