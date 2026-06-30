#!/usr/bin/env python3
"""Parse monuments-ex-ussr-2026-06-30.docx (74 monuments across 14 ex-USSR
countries) and APPEND its records to data/mtk41.json.

Structure differences vs the Russia docx:
  - Table-header at row 1 (skipped via Местоположение=='Местоположение' check)
  - SECTION-HEADER rows split the table by country (single non-empty cell, no
    image, e.g. 'Украина. Восточная и Центральная Европа')
  - Same 6-column layout: photo|Местоположение|Авторы|тех.хар|Год|Примечания
  - Same height/sculptor/architect free-text formats

Also extracts each row's embedded image to assets/mtk41/<id>/photos/01_curator.<ext>.

Run from repo root:
    /usr/bin/python3 assets/mtk41/tools/_parse_ex_ussr_docx.py
"""
import io
import json
import re
import shutil
import sys
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
DOCX = ROOT / "assets/mtk41/sources/monuments-ex-ussr-2026-06-30.docx"
DATA = ROOT / "data/mtk41.json"
ASSETS = ROOT / "assets/mtk41"
HEIGHTS = ASSETS / "heights.json"
MANIFEST = ASSETS / "manifest.json"

# ---------------------------------------------------------------------------
# Country resolution from the section-header text
# ---------------------------------------------------------------------------
COUNTRY = [
    ("Украина", "Украина", "UA"),
    ("Беларусь", "Беларусь", "BY"),
    ("Казахстан", "Казахстан", "KZ"),
    ("Кыргызстан", "Кыргызстан", "KG"),
    ("Таджикистан", "Таджикистан", "TJ"),
    ("Туркменистан", "Туркменистан", "TM"),
    ("Узбекистан", "Узбекистан", "UZ"),
    ("Азербайджан", "Азербайджан", "AZ"),
    ("Грузия", "Грузия", "GE"),
    ("Армения", "Армения", "AM"),
    ("Молдова", "Молдова", "MD"),
    ("Эстон", "Эстония", "EE"),
    ("Латв", "Латвия", "LV"),
    ("Литов", "Литва", "LT"),
]

# ---------------------------------------------------------------------------
# Geocoded city centres (lat, lng). All from OSM / Wikipedia city pages.
# coords_verified: false everywhere — these are city centres, not exact
# monument coordinates. Curator can refine later.
# ---------------------------------------------------------------------------
COORDS = {
    # Украина
    "Винница": (49.2331, 28.4682),
    "Днепропетровск": (48.4647, 35.0462),       # Днипро
    "Донецк": (48.0159, 37.8028),
    "Житомир": (50.2547, 28.6587),
    "Запорожье": (47.8388, 35.1396),
    "Ивано-Франковск": (48.9226, 24.7111),
    "Киев": (50.4501, 30.5234),
    "Крапивницкий": (48.5079, 32.2623),         # Кропивницкий, был Кировоград
    "Краматорск": (48.7389, 37.5848),
    "Луганск": (48.5740, 39.3070),
    "Луцк": (50.7472, 25.3254),
    "Львов": (49.8397, 24.0297),
    "Мариуполь": (47.0971, 37.5434),
    "Николаев": (46.9750, 31.9946),
    "Одесса": (46.4825, 30.7233),
    "Полтава": (49.5883, 34.5514),
    "Ровно": (50.6199, 26.2516),
    "Северодонецк": (48.9482, 38.4913),
    "Сумы": (50.9077, 34.7981),
    "Тернополь": (49.5535, 25.5948),
    "Ужгород": (48.6208, 22.2879),
    "Харьков": (49.9935, 36.2304),
    "Херсон": (46.6354, 32.6169),
    "Хмельницкий": (49.4229, 26.9871),
    "Черкассы": (49.4444, 32.0598),
    "Чернигов": (51.4982, 31.2893),
    "Черновцы": (48.2921, 25.9358),
    # Беларусь
    "Брест": (52.0976, 23.7341),
    "Витебск": (55.1904, 30.2049),
    "Гомель": (52.4345, 30.9754),
    "Гродно": (53.6884, 23.8258),
    "Минск": (53.9006, 27.5590),
    "Могилев": (53.9006, 30.3326),
    "Мозырь": (52.0512, 29.2454),
    "Молодечно": (54.3167, 26.8500),
    # Казахстан
    "Актау": (43.6500, 51.1500),
    "Актобе": (50.2839, 57.1670),
    "Алма-Ата": (43.2389, 76.8897),              # Алматы
    "Байконур": (45.6166, 63.3158),
    "Астана": (51.1605, 71.4704),                # = Нур-Султан → снова Астана
    "Атырау": (47.1167, 51.8833),
    "Жезказган": (47.7894, 67.7167),
    "Караганда": (49.8047, 73.1094),
    "Кокшетау": (53.2842, 69.3925),
    "Костанай": (53.2141, 63.6246),
    "Павлодар": (52.2873, 76.9674),
    "Петропавловск": (54.8825, 69.1622),         # Petropavl, KZ (≠ Камчатский)
    "Семей": (50.4225, 80.2275),                 # бывший Семипалатинск
    "Тараз": (42.9000, 71.3667),
    # Кыргызстан
    "Бешкек": (42.8746, 74.5698),                # Бишкек (опечатка в docx)
    "Ош": (40.5283, 72.7985),
    "Кировское водохранилище": (42.6500, 71.6000),  # ~Талас region
    # Таджикистан
    "Душанбэ": (38.5598, 68.7870),               # Душанбе
    "Истаравшан": (39.9111, 69.0083),
    "Худжанд": (40.2842, 69.6203),
    # Туркменистан
    "Ашхабад": (37.9601, 58.3261),
    # Узбекистан
    "Ташкент": (41.2995, 69.2401),
    "Самарканд": (39.6542, 66.9597),
    # Азербайджан
    "Баку": (40.4093, 49.8671),
    # Грузия
    "Мцхета": (41.8453, 44.7197),
    "Тбилиси": (41.7151, 44.8271),
    # Армения
    "Ереван": (40.1872, 44.5152),
    # Молдова
    "Кишинёв": (47.0105, 28.8638),
    "Тирасполь": (46.8403, 29.6433),             # PMR, de facto
    "Бендеры": (46.8281, 29.4744),
    # Эстония
    "Таллинн": (59.4370, 24.7536),
    "Нарва": (59.3771, 28.1903),
    "Тарту": (58.3776, 26.7290),
    # Латвия
    "Рига": (56.9496, 24.1052),
    "Даугавпилс": (55.8714, 26.5161),
    "Вентспилс": (57.3897, 21.5618),
    # Литва
    "Вильнюс": (54.6872, 25.2797),
    "Клайпеда": (55.7033, 21.1443),
}

# ---------------------------------------------------------------------------
# Transliteration — Cyrillic → Latin slug (matches existing parser convention)
# ---------------------------------------------------------------------------
TRANSLIT = {
    'А': 'a', 'Б': 'b', 'В': 'v', 'Г': 'g', 'Д': 'd', 'Е': 'e', 'Ё': 'e',
    'Ж': 'zh', 'З': 'z', 'И': 'i', 'Й': 'i', 'К': 'k', 'Л': 'l', 'М': 'm',
    'Н': 'n', 'О': 'o', 'П': 'p', 'Р': 'r', 'С': 's', 'Т': 't', 'У': 'u',
    'Ф': 'f', 'Х': 'kh', 'Ц': 'ts', 'Ч': 'ch', 'Ш': 'sh', 'Щ': 'shch',
    'Ы': 'y', 'Э': 'e', 'Ю': 'iu', 'Я': 'ia',
    'Ъ': '', 'Ь': '',
}
TRANSLIT.update({k.lower(): v for k, v in TRANSLIT.items()})


def slugify(text):
    out = []
    for ch in text:
        if ch in TRANSLIT:
            out.append(TRANSLIT[ch])
        elif ch.isascii() and (ch.isalnum() or ch in '-_'):
            out.append(ch.lower())
        elif ch in ' .,/—–-':
            out.append('-')
        # else drop
    s = ''.join(out)
    s = re.sub(r'-+', '-', s).strip('-')
    return s or 'monument'


# ---------------------------------------------------------------------------
# Field extractors (mirror _parse_monuments_docx.py)
# ---------------------------------------------------------------------------
def parse_authors(text):
    """Marker-based segmentation: find Скульптор/Архитектор/Консультировал
    starts, slice between them. Handles Russian initials like 'Ю.П.' which
    break naïve [^.]+? regexes."""
    if not text:
        return [], []
    sculptors, architects = [], []
    markers = []
    for m in re.finditer(r'(Скульпторы?|Архитекторы?|Консультировал)[\s:]*', text):
        markers.append((m.start(), m.end(), m.group(1)))
    markers.append((len(text), len(text), 'END'))
    for i in range(len(markers) - 1):
        _, end, kind = markers[i]
        nxt_start, _, _ = markers[i + 1]
        seg = text[end:nxt_start].strip(' .,;:\n\t')
        if not seg:
            continue
        # Split by commas around names
        names = [n.strip(' .,;:') for n in re.split(r'[,;]', seg) if n.strip(' .,;:')]
        if kind.startswith('Скульптор'):
            sculptors.extend(names)
        elif kind.startswith('Архитектор'):
            architects.extend(names)
        elif kind.startswith('Консультировал'):
            sculptors.extend(names)   # consultants → sculptors bucket
    return sculptors, architects


def parse_heights(text):
    """Returns dict {statue: m, pedestal: m} (estimated from total if needed)."""
    if not text:
        return None
    total_m = re.search(r'(?:общая\s+высота\s+памятника|высота\s+памятника)\D*([\d.,]+)\s*м', text, re.I)
    statue_m = re.search(r'(?:высота\s+(?:бронзовой\s+)?скульптуры|высота\s+статуи|скульптур\w+\s+(?:высот\w+\s+)?)\D*([\d.,]+)\s*м', text, re.I)
    pedestal_m = re.search(r'(?:высота\s+(?:гранитного\s+)?постамента|постамент\w*\s+(?:высот\w+\s+)?)\D*([\d.,]+)\s*м', text, re.I)

    def to_f(m):
        return float(m.group(1).replace(',', '.')) if m else None

    statue = to_f(statue_m)
    pedestal = to_f(pedestal_m)
    total = to_f(total_m)
    if statue and pedestal:
        return {"statue": statue, "pedestal": pedestal}
    if total and statue:
        return {"statue": statue, "pedestal": max(0.5, total - statue)}
    if total and pedestal:
        return {"statue": max(1.0, total - pedestal), "pedestal": pedestal}
    if total:
        return {"statue": total * 0.65, "pedestal": total * 0.35}
    if statue:
        return {"statue": statue, "pedestal": statue * 0.4}
    return None


def parse_status(note):
    if not note:
        return "unknown"
    nl = note.lower()
    if any(w in nl for w in ['демонтирован', 'снес', 'снос', 'разруш',
                              'уничтож', 'низверг', 'свалили',
                              'демонтаж', 'разобран', 'убран']):
        return "demolished"
    if any(w in nl for w in ['перенес', 'перенос', 'переехал',
                              'перемещен', 'перевезен']):
        return "relocated"
    return "extant"


def parse_year_date(year_cell, note):
    """Returns (year:int|None, iso_date:str|None)."""
    src = year_cell or note or ''
    year_m = re.search(r'\b(19|20)\d{2}\b', src)
    year = int(year_m.group()) if year_m else None
    # Try full date
    months = {
        'январ': 1, 'феврал': 2, 'март': 3, 'апрел': 4, 'мая': 5, 'мае': 5,
        'июн': 6, 'июл': 7, 'август': 8, 'сентябр': 9, 'октябр': 10,
        'ноябр': 11, 'декабр': 12,
    }
    dm = re.search(r'(\d{1,2})\s+(\w+)\s+(\d{4})', src)
    iso = None
    if dm:
        day = int(dm.group(1))
        mword = dm.group(2).lower()
        yr = int(dm.group(3))
        for stem, mnum in months.items():
            if mword.startswith(stem):
                try:
                    iso = date(yr, mnum, day).isoformat()
                except ValueError:
                    pass
                break
    return year, iso


def country_from_section(section_text):
    if not section_text:
        return ("Россия", "RU")
    for prefix, name, iso in COUNTRY:
        if section_text.startswith(prefix) or section_text.startswith("Республика " + prefix):
            return (name, iso)
    return ("?", "??")


# ---------------------------------------------------------------------------
def main():
    with zipfile.ZipFile(DOCX) as z:
        doc_xml = z.read("word/document.xml").decode("utf-8")
        rels_xml = z.read("word/_rels/document.xml.rels").decode("utf-8")
        rels = {m.group(1): m.group(2)
                for m in re.finditer(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels_xml)}

        rows = re.findall(r"<w:tr\b[^>]*>(.*?)</w:tr>", doc_xml, re.DOTALL)

        records = []
        cur_country_name = None
        cur_country_iso = None
        used_ids = set()

        for row in rows:
            cells = re.findall(r"<w:tc\b[^>]*>(.*?)</w:tc>", row, re.DOTALL)
            texts = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c)).strip() for c in cells]
            nonempty = [t for t in texts if t]
            blip = re.search(r'r:embed="([^"]+)"', row)

            if not nonempty:
                continue
            # Section header: single non-empty cell, no image
            if len(nonempty) == 1 and not blip:
                cur_country_name, cur_country_iso = country_from_section(nonempty[0])
                continue
            # Skip table-header row ("Местоположение" in col 1)
            if len(texts) >= 2 and texts[1] == "Местоположение":
                continue
            if len(texts) < 6 or not texts[1]:
                continue

            # Field extraction — column order: 0 image | 1 место | 2 авторы
            # | 3 размеры | 4 год | 5 примечание
            place = texts[1]
            authors_raw = texts[2]
            sizes_raw = texts[3]
            year_cell = texts[4]
            note_raw = texts[5]

            # Trim parenthetical "(район ...)" so city remains short
            place_clean = re.sub(r'\([^)]*\)', '', place).strip()
            city = re.split(r'[.,(\n]', place_clean, 1)[0].strip()
            # City overrides: docx has some quirky spellings; the COORDS dict
            # tolerates the doc spelling, but we keep nice display names
            DISPLAY = {
                "Алма-Ата": "Алматы",
                "Бешкек": "Бишкек",
                "Душанбэ": "Душанбе",
                "Крапивницкий": "Кропивницкий",
                "Днепропетровск": "Днипро",
                "Северодонецк": "Сєвєродонецьк",
                "Ровно": "Рівне",
            }
            city_display = DISPLAY.get(city, city)

            coords = COORDS.get(city)
            if not coords:
                print(f"  ⚠ no coords for {city!r}", file=sys.stderr)
                continue
            lat, lng = coords

            sculptors, architects = parse_authors(authors_raw)
            heights = parse_heights(sizes_raw)
            status = parse_status(note_raw)
            year, iso_date = parse_year_date(year_cell, note_raw)

            # ID: <city-slug>-<year> with uniqueness fallback
            slug_city = slugify(city_display.split()[0].split('-')[0] if '-' in city_display else city_display)
            year_part = str(year) if year else 'nodate'
            mid = f"{slug_city}-{year_part}"
            n = 2
            while mid in used_ids:
                mid = f"{slug_city}-{year_part}-{n}"
                n += 1
            used_ids.add(mid)

            short_text = note_raw[:280] + ('…' if len(note_raw) > 280 else '')

            rec = {
                "id": mid,
                "title": f"Памятник Ленину — {city_display}",
                "year": year,
                "date": iso_date,
                "city": city_display,
                "place": place,
                "country": cur_country_name,
                "country_iso": cur_country_iso,
                "lat": lat,
                "lng": lng,
                "coords_verified": False,
                "sculptors": sculptors,
                "architects": architects,
                "status": status,
                "short_text": short_text,
                "note_full": note_raw,
                "size_raw": sizes_raw,
                "source": "monuments-ex-ussr-2026-06-30",
                "_rid": blip.group(1) if blip else None,
            }
            records.append(rec)

    print(f"parsed {len(records)} records from ex-USSR docx")

    # ---------------- merge into data/mtk41.json ----------------
    with open(DATA, encoding="utf-8") as f:
        cat = json.load(f)
    existing_ids = {it["id"] for it in cat["items"]}
    # back up
    shutil.copy(DATA, DATA.with_suffix(".json.bak-2026-06-30b"))

    new_items = []
    for rec in records:
        rid_extra = rec.pop("_rid")
        rec["_rid"] = rid_extra  # keep for photo extraction pass
        if rec["id"] in existing_ids:
            # collision — use country-iso prefix
            mid = f"{rec['country_iso'].lower()}-{rec['id']}"
            print(f"  id collision, renaming → {mid}", file=sys.stderr)
            rec["id"] = mid
            existing_ids.add(mid)
        new_items.append(rec)
        existing_ids.add(rec["id"])

    cat["items"].extend([{k: v for k, v in r.items() if k != "_rid"} for r in new_items])
    cat["count"] = len(cat["items"])
    cat["sources"] = sorted({it.get("source", "") for it in cat["items"]} - {""})
    DATA.write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"data/mtk41.json: total {cat['count']} items (was {cat['count'] - len(new_items)})")

    # ---------------- merge into heights.json ----------------
    with open(HEIGHTS, encoding="utf-8") as f:
        heights_map = json.load(f)
    added_h = 0
    for rec in new_items:
        h = parse_heights(rec["size_raw"])
        if h:
            heights_map[rec["id"]] = {"statue": round(h["statue"], 2),
                                      "pedestal": round(h["pedestal"], 2)}
            added_h += 1
    HEIGHTS.write_text(json.dumps(heights_map, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"heights.json: +{added_h} entries (total {len(heights_map)})")

    # ---------------- extract photos ----------------
    saved = 0
    with zipfile.ZipFile(DOCX) as z:
        for rec in new_items:
            rid = rec.get("_rid")
            if not rid or rid not in rels:
                continue
            media_path = rels[rid].lstrip("/")
            if not media_path.startswith("media/"):
                media_path = "word/" + media_path
            try:
                blob = z.read(media_path)
            except KeyError:
                try:
                    blob = z.read("word/" + media_path)
                except KeyError:
                    continue
            ext = Path(media_path).suffix.lower() or ".jpg"
            if ext == ".jpeg":
                ext = ".jpg"
            out_dir = ASSETS / rec["id"] / "photos"
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / f"01_curator{ext}").write_bytes(blob)
            saved += 1
    print(f"saved {saved} curator photos")

    # ---------------- regenerate manifest.json ----------------
    manifest = {}
    for d in sorted(p for p in ASSETS.iterdir() if p.is_dir()
                    and p.name not in ("lib", "tools", "sources")):
        photo_dir = d / "photos"
        if not photo_dir.is_dir():
            continue
        photos = sorted([f.name for f in photo_dir.iterdir()
                         if f.suffix.lower() in (".jpg", ".jpeg", ".png")])
        if photos:
            manifest[d.name] = [f"photos/{p}" for p in photos]
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"manifest.json: {len(manifest)} entries")


if __name__ == "__main__":
    main()
