#!/usr/bin/env python3
"""Parse monuments-world-2026-07-06.docx (~69 monuments across ~25 countries
on 4-5 continents) and APPEND to data/mtk41.json.

Structure differences vs the prior two docx:
  - No section-header rows; single flat table
  - Same 6-column layout: photo|место|авторы|тех.хар|год|примечания
  - Country appears at the end of the place string (e.g. "Афины. 145 Леоф.
    Ираклиу, район Неа-Иония. Греция")
  - City = first sentence of place

Also extracts each row's embedded image to assets/mtk41/<id>/photos/01_curator.<ext>.

Run from repo root:
    /usr/bin/python3 assets/mtk41/tools/_parse_world_docx.py
"""
import json
import re
import shutil
import sys
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
DOCX = ROOT / "assets/mtk41/sources/monuments-world-2026-07-06.docx"
DATA = ROOT / "data/mtk41.json"
ASSETS = ROOT / "assets/mtk41"
HEIGHTS = ASSETS / "heights.json"
MANIFEST = ASSETS / "manifest.json"

# ---------------------------------------------------------------------------
# Country resolution — map free-text (last segment of place string) to
# (russian display name, ISO-2). Ordered list because we match by prefix /
# containment, and specific strings must come before generic ones.
# ---------------------------------------------------------------------------
COUNTRY_MATCH = [
    ("Австрал", "Австралия", "AU"),
    ("Албани", "Албания", "AL"),
    ("Болгар", "Болгария", "BG"),
    ("Северная Ирландия", "Великобритания", "GB"),
    ("Великобритан", "Великобритания", "GB"),
    ("Венгр", "Венгрия", "HU"),
    ("Вьетнам", "Вьетнам", "VN"),
    ("Германи", "Германия", "DE"),
    ("Грец", "Греция", "GR"),
    ("Дани", "Дания", "DK"),
    ("Инди", "Индия", "IN"),
    ("Итал", "Италия", "IT"),
    ("Канад", "Канада", "CA"),
    ("КНР", "Китай", "CN"),
    ("Кита", "Китай", "CN"),
    ("Куб", "Куба", "CU"),
    ("Мавритан", "Маврикий", "MU"),          # rare
    ("Маврик", "Маврикий", "MU"),
    ("Монгол", "Монголия", "MN"),
    ("Нидерланд", "Нидерланды", "NL"),
    ("Польш", "Польша", "PL"),
    ("Румын", "Румыния", "RO"),
    ("КНДР", "КНДР", "KP"),
    ("Северная Корея", "КНДР", "KP"),
    ("США", "США", "US"),
    ("Соединённые Штаты", "США", "US"),
    ("Соединенные Штаты", "США", "US"),
    ("Франц", "Франция", "FR"),
    ("Финлянд", "Финляндия", "FI"),
    ("Чехословак", "Чехия", "CZ"),           # rare — Prague era text
    ("Чехия", "Чехия", "CZ"),
    ("Чешская Республика", "Чехия", "CZ"),
    ("Чешк", "Чехия", "CZ"),                 # covers Чешская + typo Чешкая
    ("Словакия", "Словакия", "SK"),
    ("Словацкая Республика", "Словакия", "SK"),
    ("Словацк", "Словакия", "SK"),
    ("Швец", "Швеция", "SE"),
    ("Швейцари", "Швейцария", "CH"),
    ("Эфиопи", "Эфиопия", "ET"),
]

def resolve_country(place_text):
    """Scan the entire place string for country substrings."""
    for needle, ru, iso in COUNTRY_MATCH:
        if needle in place_text:
            return ru, iso
    return None, None


# ---------------------------------------------------------------------------
# City coordinates (lat, lng) — OSM / Wikipedia centres. coords_verified: false
# ---------------------------------------------------------------------------
COORDS = {
    # Australia
    "Леура": (-33.7150, 150.3200),                # Blue Mountains NSW
    # Albania
    "Тирана": (41.3275, 19.8189),
    # Bulgaria
    "Баня": (41.9333, 23.1000),                    # Blagoevgrad oblast; village
    "Новград": (43.7000, 25.4500),                 # Ruse oblast
    "София": (42.6977, 23.3219),
    "Перник": (42.6000, 23.0333),
    # UK / Northern Ireland
    "Белфаст": (54.5973, -5.9301),
    "Лондон": (51.5074, -0.1278),
    "Графство Нортхемптоншир": (52.2726, -0.8779),  # Thenford House
    # Hungary
    "Будапешт": (47.4979, 19.0402),
    "Дунауйварош": (46.9600, 18.9350),
    "Ходмезёвашархей": (46.4166, 20.3300),
    # Vietnam
    "Ханой": (21.0285, 105.8542),
    # Germany
    "Берлин": (52.5200, 13.4050),
    "Вюнсдорф": (52.1667, 13.4833),
    "Лютерштадт-Айслебен": (51.5286, 11.5486),
    "Марсебург": (51.3556, 11.9917),               # Merseburg
    "Мерзебург": (51.3556, 11.9917),               # alt spelling
    "Дрезден": (51.0504, 13.7373),
    "Шверин": (53.6355, 11.4012),
    "Эберсвальде": (52.8347, 13.8189),
    "Гельзенкирхен": (51.5177, 7.0857),
    # Greece
    "Афины": (37.9838, 23.7275),
    # Denmark
    "Копенгаген": (55.6761, 12.5683),
    "Пос. Лунд": (56.1500, 9.1500),                 # nr. Herning
    "Лунд (Дания)": (56.1500, 9.1500),
    # India
    "Виджаявада": (16.5062, 80.6480),
    "Дели": (28.6139, 77.2090),
    "Калькутта": (22.5726, 88.3639),
    "Морджим": (15.6300, 73.7333),
    # Italy
    "Кавриаго": (44.7100, 10.5700),
    "Остров Капри": (40.5500, 14.2333),
    "Капри": (40.5500, 14.2333),
    "Рим": (41.9028, 12.4964),
    # Canada
    "Ванкувер": (49.1667, -123.1333),               # Richmond
    # China
    "Кульджа": (43.9200, 81.3300),                  # Yining
    "Дачжоу": (31.2094, 107.5000),
    # Cuba
    "Гавана": (23.1136, -82.3666),
    "Регла": (23.1256, -82.3319),                   # Cuba
    # Mauritius
    "Порт-Луи": (-20.1667, 57.5000),
    # Mongolia
    "Улан-Батор": (47.8864, 106.9057),
    # Netherlands
    "Тьюхем": (53.2900, 6.7167),                    # Tjuchem, Groningen
    # Poland
    "Краков": (50.0647, 19.9450),
    "Поронин": (49.3400, 20.0100),
    # Romania
    "Бухарест": (44.4268, 26.1025),
    # North Korea
    "Пхеньян": (39.0392, 125.7625),
    # USA
    "Атлантик-Сити": (39.3643, -74.4229),
    "Сиэтл": (47.6511, -122.3495),                  # Fremont
    "Нью-Йорк": (40.7228, -73.9822),                # Manhattan East Village
    "Лос-Анжелес": (34.0522, -118.2437),
    "Лос-Анджелес": (34.0522, -118.2437),
    "Даллас": (32.7767, -96.7970),
    "Арлингтон": (38.8797, -77.1057),               # Virginia
    # France
    "Монпелье": (43.6109, 3.8763),
    "Мант": (48.9917, 1.7167),                      # Mantes-la-Jolie
    # Finland
    "Котка": (60.4667, 26.9458),
    "Турку": (60.4518, 22.2666),
    # Czech Republic
    "Карловы Вары": (50.2306, 12.8720),
    "Брно": (49.1951, 16.6068),
    "Градец-Кралове": (50.2094, 15.8324),
    "Прага": (50.0755, 14.4378),
    "Хеб": (50.0793, 12.3700),
    "Оломоуц": (49.5938, 17.2509),
    # Slovakia
    "Галанта": (48.1928, 17.7275),
    "Дриетома": (48.9083, 17.9333),
    "Жилина": (49.2231, 18.7394),
    "Кошице": (48.7164, 21.2611),
    # Sweden
    "Виттше": (56.2833, 13.6167),                   # Vittsjö
    "Стокгольм": (59.3293, 18.0686),
    "Хиллерсторп": (57.3100, 13.8600),
    # Switzerland
    "Женева": (46.2044, 6.1432),
    # Ethiopia
    "Аддис-Абеба": (9.0300, 38.7400),
}

DISPLAY = {
    "Леура": "Леура",
    "Лос-Анжелес": "Лос-Анджелес",
    "Марсебург": "Мерзебург",
    "Тьюхем": "Тьюхем",
    "Виттше": "Виттсшё",
    "Кульджа": "Кульджа",
    "Ходмезёвашархей": "Ходмезёвашархей",
    "Пос. Лунд": "Лунд",
}

# ---------------------------------------------------------------------------
TRANSLIT = {
    'А': 'a', 'Б': 'b', 'В': 'v', 'Г': 'g', 'Д': 'd', 'Е': 'e', 'Ё': 'e',
    'Ж': 'zh', 'З': 'z', 'И': 'i', 'Й': 'i', 'К': 'k', 'Л': 'l', 'М': 'm',
    'Н': 'n', 'О': 'o', 'П': 'p', 'Р': 'r', 'С': 's', 'Т': 't', 'У': 'u',
    'Ф': 'f', 'Х': 'kh', 'Ц': 'ts', 'Ч': 'ch', 'Ш': 'sh', 'Щ': 'shch',
    'Ы': 'y', 'Э': 'e', 'Ю': 'iu', 'Я': 'ia', 'Ъ': '', 'Ь': '',
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
    s = ''.join(out)
    s = re.sub(r'-+', '-', s).strip('-')
    return s or 'monument'


# ---------------------------------------------------------------------------
def parse_authors(text):
    if not text:
        return [], []
    sculptors, architects = [], []
    markers = []
    for m in re.finditer(r'(Скульпторы?|Архитекторы?|Консультировал|Автор)[\s:]*', text):
        markers.append((m.start(), m.end(), m.group(1)))
    markers.append((len(text), len(text), 'END'))
    for i in range(len(markers) - 1):
        _, end, kind = markers[i]
        nxt_start, _, _ = markers[i + 1]
        seg = text[end:nxt_start].strip(' .,;:\n\t')
        if not seg:
            continue
        # Skip stub "не установлен"
        if 'не установл' in seg.lower():
            continue
        names = [n.strip(' .,;:') for n in re.split(r'[,;]', seg) if n.strip(' .,;:')]
        if kind.startswith('Скульптор'):
            sculptors.extend(names)
        elif kind.startswith('Архитектор'):
            architects.extend(names)
        elif kind.startswith('Консультировал'):
            sculptors.extend(names)
        elif kind == 'Автор':
            sculptors.extend(names)  # "Автор ..." usage
    return sculptors, architects


def parse_heights(text):
    if not text:
        return None
    total_m = re.search(r'(?:общая\s+высота\s+памятника|высота\s+памятника)\D*([\d.,]+)\s*м', text, re.I)
    statue_m = re.search(r'(?:высота\s+(?:бронзовой\s+)?скульптуры|высота\s+статуи|скульптур\w+\s+(?:высот\w+\s+)?)\D*([\d.,]+)\s*м', text, re.I)
    pedestal_m = re.search(r'(?:высота\s+(?:гранитного\s+|бетонного\s+|цементного\s+)?постамента|постамент\w*\s+(?:высот\w+\s+)?)\D*([\d.,]+)\s*м', text, re.I)
    # Bust height in cm
    bust_cm = re.search(r'бюст\D*([\d.,]+)\s*см', text, re.I)

    def to_f(m):
        return float(m.group(1).replace(',', '.')) if m else None

    statue = to_f(statue_m)
    pedestal = to_f(pedestal_m)
    total = to_f(total_m)
    bust = None
    if bust_cm:
        try:
            bust = float(bust_cm.group(1).replace(',', '.')) / 100.0
        except ValueError:
            pass
    if statue and pedestal:
        return {"statue": statue, "pedestal": pedestal}
    if total and statue:
        return {"statue": statue, "pedestal": max(0.3, total - statue)}
    if total and pedestal:
        return {"statue": max(0.3, total - pedestal), "pedestal": pedestal}
    if total:
        return {"statue": total * 0.65, "pedestal": total * 0.35}
    if statue:
        return {"statue": statue, "pedestal": statue * 0.4}
    if bust:
        # Bust monument — treat as small figure on modest pedestal
        return {"statue": bust, "pedestal": bust * 0.6}
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
    src = year_cell or note or ''
    year_m = re.search(r'\b(19|20)\d{2}\b', src)
    year = int(year_m.group()) if year_m else None
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


ABBREV_HEAD = {"пос", "пгт", "с", "г", "ст", "д"}   # extend head if first token is abbrev


def extract_city(place_text):
    """First sentence, stripped of parentheticals + trailing junk.

    Handles quirks:
      - unclosed parens (strip them before splitting so 'Хеб (бывший …)' works)
      - abbreviations like "Пос. Лунд" — extend to next token if first is abbrev
      - period without space ("Атлантик-Сити.перед…") — split on any '.'
      - non-breaking hyphen U+2011 in "Улан‑Батор" — normalize to U+002D
    """
    # Normalize dashes so COORDS lookup matches
    text = place_text.replace('‑', '-').replace('‐', '-')
    # Strip parentheticals FIRST (they can contain their own dots)
    text = re.sub(r'\([^)]*\)', '', text)
    parts = [p.strip() for p in text.split('.') if p.strip()]
    if not parts:
        return ""
    first = parts[0]
    if first.lower() in ABBREV_HEAD and len(parts) > 1:
        first = first + '. ' + parts[1]
    first = first.split(',')[0].strip()
    return first


# ---------------------------------------------------------------------------
def main():
    with zipfile.ZipFile(DOCX) as z:
        doc_xml = z.read("word/document.xml").decode("utf-8")
        rels_xml = z.read("word/_rels/document.xml.rels").decode("utf-8")
        rels = {m.group(1): m.group(2)
                for m in re.finditer(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels_xml)}

        rows = re.findall(r"<w:tr\b[^>]*>(.*?)</w:tr>", doc_xml, re.DOTALL)

        records = []
        used_ids = set()

        for row_i, row in enumerate(rows):
            cells = re.findall(r"<w:tc\b[^>]*>(.*?)</w:tc>", row, re.DOTALL)
            texts = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c)).strip() for c in cells]
            nonempty = [t for t in texts if t]
            blip = re.search(r'r:embed="([^"]+)"', row)
            if not nonempty:
                continue
            # Skip table header ("Местоположение" in column 1)
            if len(texts) >= 2 and texts[1] == "Местоположение":
                continue
            if len(texts) < 6 or not texts[1]:
                continue

            place = texts[1]
            authors_raw = texts[2]
            sizes_raw = texts[3]
            year_cell = texts[4]
            note_raw = texts[5]

            city = extract_city(place)
            city_display = DISPLAY.get(city, city)

            coords = COORDS.get(city)
            if not coords:
                print(f"  ⚠ row {row_i}: no coords for {city!r} — place: {place[:80]}",
                      file=sys.stderr)
                continue
            lat, lng = coords

            country_ru, country_iso = resolve_country(place)
            if not country_ru:
                print(f"  ⚠ row {row_i}: no country match in {place[:80]!r}",
                      file=sys.stderr)
                country_ru = "?"

            sculptors, architects = parse_authors(authors_raw)
            heights = parse_heights(sizes_raw)
            status = parse_status(note_raw)
            year, iso_date = parse_year_date(year_cell, note_raw)

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
                "country": country_ru,
                "country_iso": country_iso,
                "lat": lat,
                "lng": lng,
                "coords_verified": False,
                "sculptors": sculptors,
                "architects": architects,
                "status": status,
                "short_text": short_text,
                "note_full": note_raw,
                "size_raw": sizes_raw,
                "source": "monuments-world-2026-07-06",
                "_rid": blip.group(1) if blip else None,
            }
            records.append(rec)

    print(f"parsed {len(records)} records from world docx")

    # ---------------- merge into data/mtk41.json ----------------
    with open(DATA, encoding="utf-8") as f:
        cat = json.load(f)
    existing_ids = {it["id"] for it in cat["items"]}
    shutil.copy(DATA, DATA.with_suffix(".json.bak-2026-07-07"))

    new_items = []
    for rec in records:
        rid_extra = rec.pop("_rid")
        rec["_rid"] = rid_extra
        if rec["id"] in existing_ids:
            iso = rec.get("country_iso") or "??"
            mid = f"{iso.lower()}-{rec['id']}"
            print(f"  id collision, renaming → {mid}", file=sys.stderr)
            rec["id"] = mid
            existing_ids.add(mid)
        new_items.append(rec)
        existing_ids.add(rec["id"])

    cat["items"].extend([{k: v for k, v in r.items() if k != "_rid"} for r in new_items])
    cat["count"] = len(cat["items"])
    cat["sources"] = sorted({it.get("source", "") for it in cat["items"]} - {""})
    DATA.write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"data/mtk41.json: total {cat['count']} items (added {len(new_items)})")

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
