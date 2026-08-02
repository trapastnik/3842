#!/usr/bin/env python3
# МТК 38 · build_canon_expand.py
# Вливает языки из data/mtk38-publications.json в канон data/mtk38.json.
# Существующие 53 записи НЕ трогает (у них выверенные написания и приёмка);
# добавляет только отсутствующие, помечая writing_source=doc-2026-08 / verifier=needs-verification.
#
# Запуск:  python3 mtk38-handoff/build_canon_expand.py [--dry]
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBS = ROOT / "data/mtk38-publications.json"
CANON = ROOT / "data/mtk38.json"

# Русское название письменности из источника → ISO 15924
SCRIPT = {
    "латиница": "Latn", "кириллица": "Cyrl",
    "грузинская (мхедрули)": "Geor", "армянская": "Armn",
    "арабица": "Arab", "арабо-персидская": "Arab",
    "сирийское письмо": "Syrc", "еврейское письмо": "Hebr", "еврейская": "Hebr",
    "греческая": "Grek", "деванагари": "Deva", "девангари": "Deva",
    "бенгальская (восточный нагари)": "Beng", "восточное нагари": "Beng",
    "гурмукхи": "Guru", "гуджарати": "Gujr", "ория": "Orya",
    "тамильская": "Taml", "телугу": "Telu", "каннада": "Knda", "малаялам": "Mlym",
    "сингальская": "Sinh", "тхана": "Thaa", "тибетская": "Tibt",
    "китайская": "Hans", "корейская (хангыль)": "Kore",
    "японская (кандзи + кана)": "Jpan", "лаосская": "Laoo", "тайская": "Thai",
    "кхмерская": "Khmr", "ол-чики": "Olck", "эфиопская": "Ethi",
    "тодо-бичиг": "Mong", "монгольская": "Cyrl",
}

# id → (country_iso, region_ru, lat, lng). Точка — столица страны либо центр региона.
GEO = {
    # бывший СССР
    "abk": ("GE", "Абхазия", 43.00, 41.02),      "aze": ("AZ", "Азербайджан", 40.41, 49.87),
    "ukr": ("UA", "Украина", 50.45, 30.52),      "ron": ("RO", "Румыния", 44.43, 26.10),
    "est": ("EE", "Эстония", 59.44, 24.75),      "kaz": ("KZ", "Казахстан", 51.17, 71.43),
    "uzb": ("UZ", "Узбекистан", 41.31, 69.24),   "kaa": ("UZ", "Каракалпакстан", 42.46, 59.61),
    "tgk": ("TJ", "Таджикистан", 38.56, 68.79),  "tuk": ("TM", "Туркменистан", 37.95, 58.38),
    "kir": ("KG", "Кыргызстан", 42.87, 74.59),
    # народы России
    "ady": ("RU", "Адыгея", 44.61, 40.10),       "alt": ("RU", "Республика Алтай", 51.96, 85.96),
    "aii": ("RU", "Краснодарский край", 45.04, 38.98),
    "krc": ("RU", "Кабардино-Балкария", 43.48, 43.61),
    "bak": ("RU", "Башкортостан", 54.74, 55.97), "bua": ("RU", "Бурятия", 51.83, 107.58),
    "dar": ("RU", "Дагестан", 42.98, 47.50),     "inh": ("RU", "Ингушетия", 43.17, 44.81),
    "kbd": ("RU", "Кабардино-Балкария", 43.48, 43.61),
    "xal": ("RU", "Калмыкия", 46.31, 44.27),     "krl": ("RU", "Карелия", 61.79, 34.35),
    "kpv": ("RU", "Республика Коми", 61.67, 50.84),
    "koi": ("RU", "Коми-Пермяцкий округ", 59.02, 54.65),
    "crh": ("RU", "Республика Крым", 44.95, 34.10),
    "lbe": ("RU", "Дагестан", 42.98, 47.50),     "lez": ("RU", "Дагестан", 42.06, 48.29),
    "mhr": ("RU", "Республика Марий Эл", 56.63, 47.90),
    "mdf": ("RU", "Мордовия", 54.18, 45.18),
    "yrk": ("RU", "Ямало-Ненецкий автономный округ", 66.53, 66.60),
    "oss": ("RU", "Северная Осетия", 43.03, 44.68), "tat": ("RU", "Татарстан", 55.79, 49.11),
    "ttt": ("RU", "Дагестан", 42.06, 48.29),     "tyv": ("RU", "Тыва", 51.72, 94.44),
    "udm": ("RU", "Удмуртия", 56.85, 53.20),     "kjh": ("RU", "Хакасия", 53.72, 91.44),
    "che": ("RU", "Чечня", 43.31, 45.69),        "chv": ("RU", "Чувашия", 56.13, 47.25),
    "ckt": ("RU", "Чукотский автономный округ", 64.73, 177.51),
    "evn": ("RU", "Эвенкия, Красноярский край", 64.28, 100.22),
    "myv": ("RU", "Мордовия", 54.18, 45.18),     "sah": ("RU", "Якутия", 62.03, 129.73),
    "rom": (None, None, None, None),             # цыганский — диаспора, без территории
    # Европа
    "deu": ("DE", "Германия", 52.52, 13.40),     "ita": ("IT", "Италия", 41.90, 12.50),
    "bul": ("BG", "Болгария", 42.70, 23.32),     "hun": ("HU", "Венгрия", 47.50, 19.04),
    "dan": ("DK", "Дания", 55.68, 12.57),        "nld": ("NL", "Нидерланды", 52.37, 4.90),
    "mkd": ("MK", "Северная Македония", 42.00, 21.43),
    "nor": ("NO", "Норвегия", 59.91, 10.75),     "pol": ("PL", "Польша", 52.23, 21.01),
    "slk": ("SK", "Словакия", 48.15, 17.11),     "slv": ("SI", "Словения", 46.06, 14.51),
    "fin": ("FI", "Финляндия", 60.17, 24.94),    "hrv": ("HR", "Хорватия", 45.81, 15.98),
    "cnr": ("ME", "Черногория", 42.44, 19.26),   "ces": ("CZ", "Чехия", 50.08, 14.44),
    "swe": ("SE", "Швеция", 59.33, 18.07),
    # Азия
    "pus": ("AF", "Афганистан", 34.53, 69.17),   "vie": ("VN", "Вьетнам", 21.03, 105.85),
    "bfz": ("IN", "Химачал-Прадеш", 31.33, 76.75),
    "kas": ("IN", "Джамму и Кашмир", 34.08, 74.80),
    "mar": ("IN", "Махараштра", 19.08, 72.88),   "raj": ("IN", "Раджастхан", 26.91, 75.79),
    "hin": ("IN", "Индия", 28.61, 77.21),        "ind": ("ID", "Индонезия", -6.21, 106.85),
    "kur": ("IQ", "Иракский Курдистан", 36.19, 44.01),
    "fas": ("IR", "Иран", 35.69, 51.39),         "mon": ("MN", "Монголия", 47.89, 106.91),
    "nep": ("NP", "Непал", 27.72, 85.32),        "tur": ("TR", "Турция", 39.93, 32.86),
    "tha": ("TH", "Таиланд", 13.75, 100.50),     "fil": ("PH", "Филиппины", 14.60, 120.98),
    # Африка
    "swa": ("TZ", "Танзания", -6.79, 39.21),     "hau": ("NG", "Нигерия", 12.00, 8.52),
}

# Дополнительные ареалы (приглушённая подсветка на карте)
ALSO = {
    "krl": [("FI", "Финляндия")], "swe": [("FI", "Финляндия")],
    "tur": [("CY", "Кипр")],      "nld": [("BE", "Бельгия")],
    "ron": [("MD", "Молдова")],   "krc": [("RU", "Карачаево-Черкесия")],
    "kbd": [("RU", "Карачаево-Черкесия")], "oss": [("GE", "Южная Осетия")],
    "hrv": [("BA", "Босния и Герцеговина"), ("ME", "Черногория")],
    "kir": [("CN", "Китай")],     "nep": [("IN", "Индия")],
    "swa": [("MZ", "Мозамбик")],  "hau": [("NE", "Нигер"), ("TD", "Чад"), ("GH", "Гана")],
    "mon": [("CN", "Внутренняя Монголия")], "xal": [("CN", "Синьцзян"), ("MN", "Монголия")],
    "evn": [("RU", "Якутия")],    "sat": [("IN", "Джаркханд")],
    "aii": [("IQ", "Ирак")],      "mar": [("IN", "Гоа")],
}


# Определяем письменность по САМОМУ написанию, а не по ярлыку: в источнике ярлык часто
# исторический («Латиница (до 1938 г.) / кириллица», «До 1940 г. кириллица / В наст. вр.
# латиница») и не говорит, чем набрано слово. Юникод-блок первой буквы — говорит точно.
UNI = [
    ("CYRILLIC", "Cyrl"), ("LATIN", "Latn"), ("GREEK", "Grek"), ("HEBREW", "Hebr"),
    ("ARABIC", "Arab"), ("SYRIAC", "Syrc"), ("ARMENIAN", "Armn"), ("GEORGIAN", "Geor"),
    ("DEVANAGARI", "Deva"), ("BENGALI", "Beng"), ("GURMUKHI", "Guru"), ("GUJARATI", "Gujr"),
    ("ORIYA", "Orya"), ("TAMIL", "Taml"), ("TELUGU", "Telu"), ("KANNADA", "Knda"),
    ("MALAYALAM", "Mlym"), ("SINHALA", "Sinh"), ("THAANA", "Thaa"), ("THAI", "Thai"),
    ("LAO", "Laoo"), ("TIBETAN", "Tibt"), ("MYANMAR", "Mymr"), ("KHMER", "Khmr"),
    ("HANGUL", "Kore"), ("KATAKANA", "Jpan"), ("HIRAGANA", "Jpan"),
    ("CJK", "Hans"), ("ETHIOPIC", "Ethi"), ("MONGOLIAN", "Mong"), ("OL CHIKI", "Olck"),
    ("MEETEI", "Mtei"), ("NKO", "Nkoo"), ("TIFINAGH", "Tfng"),
]


def script_iso(name_ru, writing=""):
    import unicodedata
    for ch in writing or "":
        if not ch.isalpha():
            continue
        try:
            uname = unicodedata.name(ch)
        except ValueError:
            continue
        for prefix, iso in UNI:
            if uname.startswith(prefix):
                return iso
    first = (name_ru or "").split("/")[0].strip().lower()
    return SCRIPT.get(first) or SCRIPT.get(first.replace("ё", "е")) or ""


def pick_writing(p):
    """Из нескольких написаний выбирает опорное.
    МТК 38 — объект о письменностях мира, поэтому характерная письменность важнее
    порядка в источнике: ассирийский дан как «Lenin / ܠܸܢܸܘܸܢ», но смысл несёт сирийское.
    Если все варианты латиница/кириллица — берём кириллицу для языков народов России
    (там латиница обычно историческая, до 1938 г.)."""
    variants = [p["writing"]] + list(p.get("writing_alt") or [])
    variants = [v for v in variants if v.strip()]
    if len(variants) < 2:
        return (variants[0] if variants else ""), []
    scored = [(v, script_iso("", v)) for v in variants]

    # 1) арбитр — колонка «Письмо» источника: первая названная письменность и есть главная
    #    («Сирийское письмо / В России латиница» → сирийское; «Латиница / арабица» → латиница)
    head = (p.get("script_ru") or "").split("/")[0].strip().lower()
    label = SCRIPT.get(head) or SCRIPT.get(re.sub(r"\s*\([^)]*\)", "", head).strip()) or ""
    best = next((v for v, s in scored if s and s == label), "") if label else ""

    # 2) ярлык не разобрался — берём характерную письменность, а из латиницы/кириллицы
    #    для языков народов России кириллицу (латиница там обычно историческая, до 1938 г.)
    if not best:
        exotic = [v for v, s in scored if s and s not in ("Latn", "Cyrl")]
        if exotic:
            best = exotic[0]
        elif p.get("section") == "Языки народов России":
            best = next((v for v, s in scored if s == "Cyrl"), variants[0])
        else:
            best = variants[0]
    return best, [v for v in variants if v != best]


def main():
    dry = "--dry" in sys.argv
    canon = json.loads(CANON.read_text(encoding="utf-8"))
    pubs = json.loads(PUBS.read_text(encoding="utf-8"))["publications"]
    have = {l["id"] for l in canon["languages"]}

    seen, added, skipped = {}, [], []
    for p in pubs:
        lid = p["lang_id"]
        if not lid or lid in have or lid in seen:
            continue
        seen[lid] = p

    swapped = []
    for lid, p in seen.items():
        writing, writing_alt = pick_writing(p)
        if writing and writing != p.get("writing"):
            swapped.append((lid, p["name_ru"], p["writing"], writing))
        p = {**p, "writing": writing, "writing_alt": writing_alt}
        iso15924 = script_iso(p.get("script_ru", ""), p.get("writing", ""))
        geo_row = GEO.get(lid)
        if not geo_row or not iso15924 or not p.get("writing"):
            skipped.append((lid, p["name_ru"],
                            "нет гео" if not geo_row else ("нет письменности" if not iso15924 else "нет написания")))
            continue
        iso_c, region, lat, lng = geo_row
        territorial = iso_c is not None
        primary = ({"country_iso": iso_c, "region_ru": region, "lat": lat, "lng": lng}
                   if territorial else None)
        entry = {
            "id": lid,
            "name_ru": p["name_ru"],
            "endonym": (p.get("endonym") or "").split("\n")[0].strip(),
            "writing": p["writing"],
            "script": {"iso15924": iso15924, "name_ru": p.get("script_ru", "")},
            "family": p.get("family", ""),
            "geo": {
                "territorial": territorial,
                "diaspora": not territorial,
                "primary": primary,
                "also": [{"country_iso": c, "region_ru": r} for c, r in ALSO.get(lid, [])],
            },
            # часть языков в источнике даёт два написания (кириллица + латиница)
            **({"writing_alt": p["writing_alt"]} if p.get("writing_alt") else {}),
            "writing_source": "doc-2026-08",
            "verifier": "needs-verification",
            "weight": 1,
            "note": f"из кураторского документа 2026-08-01; раздел «{p.get('section','')}»",
        }
        added.append(entry)

    canon["languages"].extend(added)
    canon["version"] = int(canon.get("version", 1)) + 1
    canon["note"] = (canon.get("note", "").rstrip() +
                     f"\n\n2026-08-01: канон расширен с {len(have)} до {len(have) + len(added)} языков "
                     "из кураторского документа «Ленин на языках народов мира.doc». "
                     "Добавленные записи имеют writing_source=doc-2026-08 и verifier=needs-verification — "
                     "написания взяты из живого Unicode-текста источника, носителем не выверены. "
                     "Издания — отдельным слоем в data/mtk38-publications.json.")
    canon.setdefault("schema", {})["writing_source"] = (
        "pdf-specimen | wiki-interwiki | wikidata-q1394 | triangulated | idml-source | doc-2026-08")

    print(f"было: {len(have)}   добавлено: {len(added)}   стало: {len(canon['languages'])}")
    if swapped:
        print(f"\nопорное написание выбрано не первым из источника ({len(swapped)}):")
        for lid, nm, was, now in swapped:
            print(f"   {lid:5} {nm:24} {was!r} → {now!r}")
    if skipped:
        print(f"\nне добавлены ({len(skipped)}):")
        for lid, nm, why in skipped:
            print(f"   {lid or '—':5} {nm:28} {why}")
    if dry:
        print("\n--dry: файл не записан")
        return
    CANON.write_text(json.dumps(canon, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n→ {CANON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
