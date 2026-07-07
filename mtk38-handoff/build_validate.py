#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mtk38-v2/validate.html — РЕДИРЕКТ на объединённый инструмент.

Валидатор написаний слит с редактором данных в единый mtk38-v2/editor.html (вкладки
«Данные» / «Приёмка»), оба пишут в один data/mtk38.json. Этот файл оставлен только как
редирект, чтобы старые ссылки (лендинг, навигация, закладки) не падали.

Запуск:  python3 mtk38-handoff/build_validate.py
"""
import os

HERE = os.path.dirname(__file__)
ROOT = os.path.normpath(os.path.join(HERE, ".."))
OUT = os.path.join(ROOT, "mtk38-v2", "validate.html")

HTML = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=./editor.html#review">
<title>Валидация → Данные и приёмка</title>
<style>body{font-family:system-ui,sans-serif;background:#F7F9EF;color:#435059;padding:48px;line-height:1.6}
a{color:#A8863a;font-weight:600}</style>
</head>
<body>
<p>Валидатор написаний объединён с редактором данных.</p>
<p>Переходим → <a href="./editor.html#review">«Данные и приёмка» → вкладка «Приёмка»</a>…</p>
<script>location.replace('./editor.html#review');</script>
</body>
</html>
"""
with open(OUT, "w", encoding="utf-8") as f:
    f.write(HTML)
print(f"written: {OUT}  (редирект на editor.html#review — валидатор слит в единый инструмент)")
