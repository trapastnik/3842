#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Парсер IDML (InDesign Markup) для МТК 38 — достаёт НАСТОЯЩИЙ текст написаний + шрифты.

IDML = ZIP из XML. Берём:
- Resources/Fonts.xml      → список шрифтов (Name / PostScriptName / семейство)
- Stories/Story_*.xml      → текст по прогонам <Content> + AppliedFont + Capitalization

Для каждого CharacterStyleRange: текст (Content), применённый шрифт (Properties/AppliedFont),
стиль регистра (Capitalization="AllCaps" => визуальный капс при строчном тексте).

Сверяет извлечённый текст с data/mtk38.json (по письменности) и печатает расхождения.

Запуск:  python3 mtk38-handoff/parse_idml.py [путь_к.idml]
По умолчанию берёт самый свежий ~/Downloads/*.idml
"""
import zipfile, glob, os, sys, json, unicodedata
import xml.etree.ElementTree as ET

HERE = os.path.dirname(__file__)
DATA = os.path.normpath(os.path.join(HERE, "..", "data", "mtk38.json"))

def local(tag): return tag.rsplit('}', 1)[-1]
def cps(s): return ' '.join('U+%04X' % ord(c) for c in s)
def main_script(w):
    sc = set()
    for c in w:
        if c.isspace() or unicodedata.category(c)[0] == 'M': continue
        sc.add(unicodedata.name(c, '?').split()[0])
    return sc

def find_idml():
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]): return sys.argv[1]
    g = sorted(glob.glob(os.path.expanduser('~/Downloads/*.idml')), key=os.path.getmtime)
    return g[-1] if g else None

idml = find_idml()
if not idml:
    print("нет .idml (положи в ~/Downloads). Жду файл."); sys.exit(0)
print(f"IDML: {idml}\n")
z = zipfile.ZipFile(idml)

# --- шрифты ---
fonts = set()
for n in z.namelist():
    if n.endswith('Fonts.xml'):
        for e in ET.parse(z.open(n)).getroot().iter():
            lt = local(e.tag)
            if lt in ('Font', 'FontFamily'):
                nm = e.get('Name') or e.get('PostScriptName')
                if nm: fonts.add(nm)
print("=== ШРИФТЫ в документе ===")
for f in sorted(fonts): print("  ", f)

# --- текстовые прогоны ---
runs = []  # (text, font, capitalization)
for n in z.namelist():
    if n.startswith('Stories/') and n.endswith('.xml'):
        for csr in ET.parse(z.open(n)).getroot().iter():
            if local(csr.tag) != 'CharacterStyleRange': continue
            cap = csr.get('Capitalization')
            font, text = None, ''
            for e in csr.iter():
                lt = local(e.tag)
                if lt == 'AppliedFont' and (e.text or '').strip(): font = e.text.strip()
                if lt == 'Content': text += (e.text or '')
            text = text.strip()
            if text and any(unicodedata.category(c)[0] == 'L' for c in text):
                runs.append((text, font, cap))

print(f"\n=== ТЕКСТОВЫЕ ПРОГОНЫ: {len(runs)} ===")
for text, font, cap in runs:
    capn = f" [{cap}]" if cap and cap != 'Normal' else ""
    print(f"  «{text}»{capn}  шрифт={font}")
    print(f"      {cps(text)}")

# --- сверка с data/mtk38.json ---
d = json.load(open(DATA, encoding='utf-8'))
idml_texts = {t for t, _, _ in runs}
print(f"\n=== СВЕРКА с data/mtk38.json ({len(d['languages'])} языков) ===")
match = diff = 0
for l in d['languages']:
    w = l['writing']
    if w in idml_texts:
        match += 1
    else:
        # ищем кандидата той же письменности
        my_sc = main_script(w)
        cands = [t for t in idml_texts if main_script(t) & my_sc]
        diff += 1
        print(f"  ≠ {l['id']:4} {l['name_ru']:22} моё={w!r}  IDML-кандидаты={cands[:3]}")
print(f"\nсовпало точно: {match}/{len(d['languages'])} · расхождений: {diff}")
