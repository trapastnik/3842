#!/usr/bin/env python3
"""Parse the curated 94-monument table from monuments-list-2026-06-29.docx
into data/mtk41.json + assets/mtk41/heights.json.

Backs up the prior versions to *.bak-YYYY-MM-DD.

Run from the repo root:
    /usr/bin/python3 assets/mtk41/tools/_parse_monuments_docx.py
"""

import json
import re
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent  # repo root
SOURCE = ROOT / "assets/mtk41/sources/monuments-list-2026-06-29.docx"
OUT_JSON = ROOT / "data/mtk41.json"
OUT_HEIGHTS = ROOT / "assets/mtk41/heights.json"
TODAY = datetime.now().strftime("%Y-%m-%d")
BACKUP_SUFFIX = f".bak-{TODAY}"


# --- Geocoding: centres of cities/places mentioned in the source ---------
# Coordinates from OpenStreetMap / Wikipedia (city centres). They are NOT
# exact monument locations — coords_verified is set to False for all.

COORDS = {
    "Абакан": (53.7222, 91.4437),
    "Анадырь": (64.7350, 177.5081),
    "Антарктида": (-82.1000, 54.9667),  # «Полюс Недоступности»
    "Архангельск": (64.5390, 40.5180),
    "Астрахань": (46.3470, 48.0330),
    "Барнаул": (53.3548, 83.7697),
    "Белгород": (50.5953, 36.5870),
    "Биробиджан": (48.7950, 132.9210),
    "Благовещенск": (50.2900, 127.5273),
    "Брянск": (53.2434, 34.3645),
    "Владивосток": (43.1198, 131.8869),
    "Владикавказ": (43.0240, 44.6797),
    "Владимир-Соборная": (56.1290, 40.4070),       # площадь Соборная
    "Владимир-Ленина": (56.1340, 40.4180),         # площадь Ленина (немного восточнее)
    "Волгоград-Ленина": (48.7080, 44.5133),        # площадь Ленина (центр)
    "Волгоград-Красноармейский": (48.5450, 44.5660),  # вход в Волго-Донской канал
    "Вологда": (59.2200, 39.8910),
    "Воронеж": (51.6720, 39.1843),
    "Горки": (55.5072, 37.7656),                    # Горки Ленинские
    "Горно-Алтайск": (51.9583, 85.9603),
    "Грозный": (43.3170, 45.6940),
    "Горки Ленинские": (55.5072, 37.7656),
    "Дубна": (56.7333, 37.1667),
    "Екатеринбург": (56.8389, 60.6057),
    "Иваново": (57.0000, 40.9739),
    "Ижевск": (56.8527, 53.2115),
    "Иркутск": (52.2870, 104.3050),
    "Йошкар-Ола": (56.6388, 47.8908),
    "Казань": (55.7887, 49.1221),
    "Калининград": (54.7100, 20.4500),
    "Калуга": (54.5293, 36.2754),
    "Кемерово": (55.3543, 86.0890),
    "Киров": (58.6035, 49.6680),
    "Кострома": (57.7670, 40.9269),
    "Краснодар-Ленина": (45.0355, 38.9753),
    "Краснодар-Вишняковский": (45.0290, 38.9866),
    "Красноярск": (56.0103, 92.8521),
    "Курган": (55.4410, 65.3411),
    "Курск": (51.7373, 36.1873),
    "Кызыл": (51.7191, 94.4378),
    "Липецк": (52.6088, 39.5990),
    "Магадан": (59.5638, 150.8035),
    "Майкоп": (44.6090, 40.1006),
    "Махачкала": (42.9849, 47.5047),
    "Москва-Калужская": (55.7264, 37.6027),         # Калужская площадь
    "Москва-Кремль": (55.7510, 37.6172),             # Тайницкий сад (Кремль)
    "Мурманск": (68.9707, 33.0750),
    "Нальчик": (43.4940, 43.6172),
    "Нарьян-Мар": (67.6383, 53.0067),
    "Нижний Новгород": (56.3260, 44.0050),
    "Великий Новгород": (58.5215, 31.2755),
    "Новосибирск": (55.0084, 82.9357),
    "Омск": (54.9885, 73.3242),
    "Орел": (52.9650, 36.0780),
    "Оренбург": (51.7682, 55.0974),
    "Пенза": (53.1959, 45.0184),
    "Пермь": (58.0093, 56.2300),
    "Петрозаводск": (61.7849, 34.3469),
    "Петропавловск-Камчатский": (53.0245, 158.6432),
    "Санкт-Петербург-Финляндский": (59.9555, 30.3550),   # площадь Ленина у Финляндского вокзала
    "Санкт-Петербург-Московская": (59.8500, 30.3220),    # Московская площадь
    "Вознесенье": (61.0167, 35.4833),                # Ленинградская обл.
    "Псков": (57.8194, 28.3320),
    "Ростов-на-Дону": (47.2225, 39.7187),
    "Рязань": (54.6293, 39.7416),
    "Салехард": (66.5300, 66.6020),
    "Самара": (53.1953, 50.1006),
    "Саранск": (54.1837, 45.1750),
    "Саратов": (51.5336, 46.0344),
    "Севастополь": (44.6166, 33.5254),
    "Симферополь": (44.9521, 34.1024),
    "Смоленск": (54.7826, 32.0453),
    "Ставрополь": (45.0428, 41.9734),
    "Сыктывкар": (61.6680, 50.8351),
    "Тамбов": (52.7212, 41.4523),
    "Тверь": (56.8587, 35.9176),
    "Томск": (56.4977, 84.9744),
    "Тула": (54.1961, 37.6182),
    "Тюмень": (57.1530, 65.5343),
    "Улан-Удэ": (51.8272, 107.6064),
    "Ульяновск-Соборная": (54.3170, 48.4023),
    "Ульяновск-Привокзальная": (54.3083, 48.3678),
    "Уфа": (54.7388, 55.9721),
    "Хабаровск": (48.4827, 135.0838),
    "Ханты-Мансийск": (61.0042, 69.0019),
    "Чебоксары": (56.1322, 47.2519),
    "Челябинск": (55.1644, 61.4368),
    "Черкесск": (44.2238, 42.0492),
    "Чита": (52.0340, 113.4994),
    "Шпицберген-Пирамида": (78.6566, 16.3267),
    "Шпицберген-Баренцбург": (78.0648, 14.2335),
    "Элиста": (46.3083, 44.2700),
    "Южно-Сахалинск": (46.9588, 142.7386),
    "Якутск": (62.0270, 129.7320),
    "Ярославль": (57.6261, 39.8845),
}


# --- Transliteration for ids ---------------------------------------------

TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def slugify(s):
    out = []
    for ch in s.lower():
        if ch in TRANSLIT:
            out.append(TRANSLIT[ch])
        elif ch.isascii() and ch.isalnum():
            out.append(ch)
        elif ch in " -_":
            out.append("-")
        # else: drop char
    slug = "".join(out)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug


# --- Parsing helpers -----------------------------------------------------

YEAR_RE = re.compile(r"\b(19\d\d|20\d\d)\b")
HEIGHT_TOTAL_RE = re.compile(r"общ\w*\s+высот\w+[^,\d]*?(\d+[,.]?\d*)\s*м", re.IGNORECASE)
HEIGHT_STATUE_RE = re.compile(r"(?:высот\w+\s+)?(?:бронзов\w+\s+)?скульптур\w*[^,\d]*?(\d+[,.]?\d*)\s*м", re.IGNORECASE)
HEIGHT_PEDESTAL_RE = re.compile(r"(?:высот\w+\s+)?(?:гранитн\w+\s+)?(?:постамент\w*|пьедестал\w*)[^,\d]*?(\d+[,.]?\d*)\s*м", re.IGNORECASE)


MONTHS = {
    "январ": 1, "феврал": 2, "март": 3, "апрел": 4, "ма": 5, "июн": 6,
    "июл": 7, "август": 8, "сентябр": 9, "октябр": 10, "ноябр": 11, "декабр": 12,
}


def parse_date(text):
    """Return (year:int|None, date:str|None) from a Russian date string."""
    if not text:
        return None, None
    year_m = YEAR_RE.search(text)
    year = int(year_m.group(1)) if year_m else None
    # Try day-month-year
    m = re.search(r"(\d{1,2})\s+(\w+)\s+(\d{4})", text)
    if m:
        day = int(m.group(1))
        mon_name = m.group(2).lower()
        for prefix, mon_num in MONTHS.items():
            if mon_name.startswith(prefix):
                return year, f"{m.group(3)}-{mon_num:02d}-{day:02d}"
    return year, None


def parse_authors(text):
    """Return (sculptors, architects) lists of names.
    Splits the line into segments by known role markers, since names contain
    periods (initials like 'Ю.П. Поммер') so simple [^.]+ patterns break."""
    if not text:
        return [], []
    # Find positions of role markers (case-insensitive). Each match yields
    # (kind, start, header_end).
    pattern = re.compile(
        r"(скульптор[ыа]?|архитектор[ыа]?|консультировал[аи]?)\s*:?\s*",
        re.IGNORECASE,
    )
    markers = []
    for m in pattern.finditer(text):
        head = m.group(1).lower()
        if head.startswith("скульп"):
            kind = "sculptor"
        elif head.startswith("архит"):
            kind = "architect"
        else:
            kind = "consultant"
        markers.append((kind, m.start(), m.end()))

    sculptors = []
    architects = []
    for i, (kind, _start, hend) in enumerate(markers):
        seg_end = markers[i + 1][1] if i + 1 < len(markers) else len(text)
        names_blob = text[hend:seg_end]
        names = split_names(names_blob)
        if kind == "sculptor":
            sculptors.extend(names)
        elif kind == "architect":
            architects.extend(names)
        # consultants ignored
    return sculptors, architects


def split_names(s):
    s = s.strip().rstrip(".,;:")
    if not s:
        return []
    # Split by comma or " и ". Don't split on "." since initials.
    parts = re.split(r"\s*,\s*|\s+и\s+", s)
    out = []
    for p in parts:
        p = p.strip().rstrip(".,;:").strip()
        if p:
            out.append(p)
    return out


def parse_heights(text):
    """Returns dict {statue, pedestal} in metres, or None."""
    if not text:
        return None
    t = text.replace(",", ".")
    total_m = re.search(r"общая[^.]*?(\d+\.?\d*)\s*м", t, re.IGNORECASE)
    statue_m = re.search(r"скульпт\w*[^.]*?(\d+\.?\d*)\s*м", t, re.IGNORECASE)
    pedestal_m = re.search(r"постамент\w*[^.]*?(\d+\.?\d*)\s*м", t, re.IGNORECASE)
    if not pedestal_m:
        pedestal_m = re.search(r"пьедестал\w*[^.]*?(\d+\.?\d*)\s*м", t, re.IGNORECASE)

    def to_f(m):
        return float(m.group(1)) if m else None

    statue = to_f(statue_m)
    pedestal = to_f(pedestal_m)
    total = to_f(total_m)
    # Derive missing values
    if statue is not None and pedestal is None and total is not None:
        pedestal = max(0.0, total - statue)
    if pedestal is not None and statue is None and total is not None:
        statue = max(0.0, total - pedestal)
    if statue is None and pedestal is None and total is not None:
        # Heuristic: 60% statue, 40% pedestal
        statue = total * 0.6
        pedestal = total * 0.4
    if statue is None and pedestal is None:
        return None
    return {
        "statue": round(statue or 5.0, 2),
        "pedestal": round(pedestal or 2.0, 2),
        "note": text[:160],
    }


def parse_status(note, sizes):
    text = (note or "") + " " + (sizes or "")
    low = text.lower()
    if any(w in low for w in ("демонтирован", "снесён", "снесен", "разрушен", "уничтожен")):
        return "demolished"
    if any(w in low for w in ("перенесён", "перенесен", "перенесли", "перенесено")):
        return "relocated"
    return "extant"


# --- City key extraction -------------------------------------------------

def city_key(place_text, monument_id_hint=None):
    """Extract city name to look up coordinates. Handles two-monument-cities."""
    # Strip "(район ...)" parenthetical and anything after it on the city line
    # (curator's rows for second-monument-in-city sometimes glue district + title)
    first_seg = re.split(r"[.,]", place_text)[0]
    first = re.sub(r"\s*\([^)]*\)\s*.*$", "", first_seg).strip()
    if not first:
        first = first_seg.strip()
    # Strip "Поселок " etc.
    first = re.sub(r"^(посёлок|поселок|пос\.|г\.|город|село|с\.)\s+", "", first, flags=re.IGNORECASE).strip()
    # Special case: «Южно - Сахалинск» -> "Южно-Сахалинск"
    first = re.sub(r"\s*-\s*", "-", first)
    return first


def disambiguate_city(city, place_text):
    """For cities that have 2 monuments in the list, return a sub-key."""
    place_low = place_text.lower()
    if city == "Владимир":
        if "соборн" in place_low:
            return "Владимир-Соборная"
        return "Владимир-Ленина"
    if city == "Волгоград" or "красноарм" in place_low:
        if "красноарм" in place_low:
            return "Волгоград-Красноармейский"
        return "Волгоград-Ленина"
    if city == "Москва":
        if "кремл" in place_low or "тайницк" in place_low:
            return "Москва-Кремль"
        return "Москва-Калужская"
    if city == "Краснодар":
        if "вишняковск" in place_low:
            return "Краснодар-Вишняковский"
        return "Краснодар-Ленина"
    if city == "Санкт-Петербург":
        if "московск" in place_low:
            return "Санкт-Петербург-Московская"
        return "Санкт-Петербург-Финляндский"
    if city == "Ульяновск":
        if "привокзальн" in place_low:
            return "Ульяновск-Привокзальная"
        return "Ульяновск-Соборная"
    if city == "Шпицберген":
        if "баренцбург" in place_low:
            return "Шпицберген-Баренцбург"
        return "Шпицберген-Пирамида"
    return city


def make_id(city, year, sub_key=None):
    base = slugify(city)
    if sub_key and sub_key != city:
        # Suffix with discriminator from sub-key
        suffix = sub_key.replace(city, "").strip("-")
        base = f"{base}-{slugify(suffix)}"
    if year:
        return f"{base}-{year}"
    return base


# --- Main parsing ---------------------------------------------------------

def parse_docx(path):
    with zipfile.ZipFile(path) as z:
        with z.open("word/document.xml") as f:
            xml = f.read().decode("utf-8")
    rows = re.findall(r"<w:tr\b[^>]*>(.*?)</w:tr>", xml, re.DOTALL)
    mons = []
    for row in rows[1:]:  # skip header
        cells = re.findall(r"<w:tc\b[^>]*>(.*?)</w:tc>", row, re.DOTALL)
        if len(cells) < 6:
            continue
        texts = []
        for c in cells:
            t = re.sub(r"<[^>]+>", "", c)
            t = re.sub(r"\s+", " ", t).strip()
            texts.append(t)
        if texts[1]:  # Место column has content
            mons.append({
                "monument": texts[0],
                "place": texts[1],
                "author": texts[2],
                "size": texts[3],
                "date": texts[4],
                "note": texts[5],
            })
    return mons


def build_records(raw_mons):
    items = []
    used_ids = set()
    unknown_cities = []

    for m in raw_mons:
        place = m["place"]
        city_raw = city_key(place)
        sub_key = disambiguate_city(city_raw, place)
        coord_key = sub_key if sub_key in COORDS else city_raw
        coords = COORDS.get(coord_key)
        if coords is None:
            unknown_cities.append(city_raw)

        year, date = parse_date(m["date"])
        sculptors, architects = parse_authors(m["author"])
        heights = parse_heights(m["size"])
        status = parse_status(m["note"], m["size"])

        item_id = make_id(city_raw, year, sub_key)
        # ensure uniqueness
        base_id = item_id
        n = 2
        while item_id in used_ids:
            item_id = f"{base_id}-{n}"
            n += 1
        used_ids.add(item_id)

        # Country: СССР до 1991, Россия после (с поправкой на Антарктиду / Шпицберген)
        if city_raw == "Антарктида":
            country = "Антарктида (Полюс Недоступности)"
        elif city_raw == "Шпицберген":
            country = "Норвегия (Шпицберген, рос. поселение)"
        elif year and year >= 1992:
            country = "Россия"
        elif year:
            country = "СССР"
        else:
            country = "СССР"

        short = m["note"][:280] if m["note"] else ""
        record = {
            "id": item_id,
            "title": "Памятник Ленину в " + city_raw if city_raw else "Памятник Ленину",
            "year": year,
            "date": date,
            "city": city_raw,
            "place": place,
            "country": country,
            "lat": coords[0] if coords else None,
            "lng": coords[1] if coords else None,
            "coords_verified": False,
            "sculptors": sculptors,
            "architects": architects,
            "status": status,
            "short_text": short,
            "note_full": m["note"],
            "size_raw": m["size"],
            "source": "monuments-list-2026-06-29",
        }
        items.append((item_id, record, heights))

    return items, unknown_cities


def merge_legacy(new_items_by_id):
    """Pull in the 8 legacy entries that are not in the new list, marking
    them with source: 'legacy'. Currently disabled — uncomment if needed.
    """
    return []


def write_outputs(items_with_heights, unknown):
    items = [r for (_, r, _) in items_with_heights]
    heights = {iid: h for (iid, _, h) in items_with_heights if h}

    if OUT_JSON.exists():
        backup = OUT_JSON.with_suffix(OUT_JSON.suffix + BACKUP_SUFFIX)
        shutil.copy2(OUT_JSON, backup)
        print(f"  backup: {backup}")

    if OUT_HEIGHTS.exists():
        backup = OUT_HEIGHTS.with_suffix(OUT_HEIGHTS.suffix + BACKUP_SUFFIX)
        shutil.copy2(OUT_HEIGHTS, backup)
        print(f"  backup: {backup}")

    out = {
        "mtk": 41,
        "title": "Скульптуры Ленина",
        "subtitle": "Образ Ленина в монументальном искусстве",
        "source": "assets/mtk41/sources/monuments-list-2026-06-29.docx",
        "generated_at": TODAY,
        "schema": {
            "id": "city-slug + year",
            "title": "название памятника",
            "year": "год установки (int) или null",
            "date": "ISO дата если известна",
            "city": "город",
            "place": "полное место с регионом",
            "country": "СССР / Россия / Антарктида / Норвегия",
            "lat": "широта WGS84",
            "lng": "долгота WGS84",
            "coords_verified": "false — координаты центра города, не точка памятника",
            "sculptors": "массив скульпторов",
            "architects": "массив архитекторов",
            "status": "extant | demolished | relocated",
            "short_text": "обрезанное Примечание (≤280)",
            "note_full": "полный текст Примечания",
            "size_raw": "исходное поле Размеры",
            "source": "monuments-list-2026-06-29",
        },
        "items": items,
    }
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  wrote {OUT_JSON} ({len(items)} items)")

    OUT_HEIGHTS.write_text(json.dumps(heights, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  wrote {OUT_HEIGHTS} ({len(heights)} heights)")

    if unknown:
        print(f"\n  ⚠ unknown cities (no coords): {sorted(set(unknown))}")


def main():
    if not SOURCE.exists():
        print(f"source not found: {SOURCE}", file=sys.stderr)
        sys.exit(1)
    print(f"parsing {SOURCE}…")
    raw = parse_docx(SOURCE)
    print(f"  {len(raw)} non-empty data rows")
    items_with_heights, unknown = build_records(raw)
    print(f"  {len(items_with_heights)} records built")
    write_outputs(items_with_heights, unknown)


if __name__ == "__main__":
    main()
