#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Пересборка ВСЕХ вариантов и инструментов МТК 38 из источника data/mtk38.json (+ quotes).

Запускай после правки данных (вручную или экспортом из editor.html).
НЕ трогает build_data.py (это генератор-источник, перезатёр бы ручные правки) и
build_fonts.py (нужна сеть для subset Google Fonts).

Запуск:  python3 mtk38-handoff/build_all.py
"""
import subprocess, os, sys

HERE = os.path.dirname(__file__)
GENS = [
    "build_globe.py", "build_map.py", "build_studio.py",
    "build_validate.py", "build_analysis.py", "build_editor.py",
    "build_render.py", "build_quotes_viz.py",
]
fail = 0
for g in GENS:
    p = os.path.join(HERE, g)
    if not os.path.exists(p):
        print("—  skip (нет файла):", g); continue
    r = subprocess.run([sys.executable, p], capture_output=True, text=True)
    ok = r.returncode == 0
    last = (r.stdout.strip().splitlines()[-1] if r.stdout.strip() else (r.stderr.strip()[:200] or "?"))
    print(("✓" if ok else "✗"), g, "—", last)
    if not ok:
        fail += 1
        if r.stderr.strip():
            print("    ", r.stderr.strip().splitlines()[-1][:200])

print(f"\nГотово: {len(GENS)-fail}/{len(GENS)} собрано." + (" ЕСТЬ ОШИБКИ!" if fail else ""))
sys.exit(1 if fail else 0)
