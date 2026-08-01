#!/usr/bin/env python3
"""Parse monuments-first-geoglyphs-2026-08-01.docx (45 rows) into data/mtk41.json.

Two thematic blocks in one flat 6-column table (photo|место|авторы|тех.хар|год|прим.):

  rows 1..40  — «первые» памятники Ленину, 1919–1927: самая ранняя волна,
                до сих пор в корпусе почти не представленная (было 12 записей
                до 1930 г. на 236 памятников).
  rows 41..45 — нескульптурные монументальные образы: геоглифы из деревьев,
                высеченные и написанные на скалах портреты, стальной силуэт
                на горе. Для них вводится поле `kind`.

Новое по сравнению с предыдущими тремя парсерами:

  * поле **kind** — тип объекта: sculpture | bust | relief | rock-image |
    rock-carving | geoglyph | steel-silhouette | plaque. Проставляется всем
    236 старым записям тоже (по эвристике из size_raw/title), чтобы поле было
    сплошным.
  * поле **wave** — "first" для рядов 1..40 (волна 1919–1927).
  * **enrich вместо дубля**: если памятник уже есть в корпусе (kaluga-1925),
    запись обогащается, а не добавляется второй раз.
  * **legacy-id reuse**: четыре памятника соответствуют старым папкам ассетов
    с уже собранными фото (ufa-1924-larionov, moscow-oktyabrskaya-1925,
    nizhny-tagil-1925, chelyabinsk-aloe-pole-1925) — берём их id, чтобы
    подключить кураторские фото обратно.

Запуск из корня репозитория:
    /usr/bin/python3 assets/mtk41/tools/_parse_first_geoglyphs_docx.py [--dry-run]
"""
import json
import re
import shutil
import sys
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
DOCX = ROOT / "assets/mtk41/sources/monuments-first-geoglyphs-2026-08-01.docx"
DATA = ROOT / "data/mtk41.json"
ASSETS = ROOT / "assets/mtk41"
HEIGHTS = ASSETS / "heights.json"
MANIFEST = ASSETS / "manifest.json"
SOURCE = "monuments-first-geoglyphs-2026-08-01"

DRY = "--dry-run" in sys.argv

# ---------------------------------------------------------------------------
# Построчная разметка. Ключ — индекс строки <w:tr> в документе (0 = шапка).
#
# id     None → генерируется из города и года; строка → берём как есть
#             (переиспользование legacy-папок ассетов с уже собранными фото).
# st     статус ИМЕННО ЭТОГО объекта. Проставлен вручную по прочтении всех 45
#             примечаний: в ранней волне текст — это биография МЕСТА («поставили
#             → разрушили → заменили → перенесли»), и автомат по ключевым словам
#             ошибается там, где «восстановили» относится к следующему по счёту
#             памятнику, а не к первому. Эвристика parse_status() осталась как
#             запасной путь и логирует расхождения.
# year   переопределение года, когда в колонке две даты и нужна не первая.
# ---------------------------------------------------------------------------
ROWS = {
    1:  dict(id=None, city="Осташков",           lat=57.1450, lng=33.1067, kind="sculpture",   st="demolished"),
    2:  dict(id=None, city="Орёл",               lat=52.9668, lng=36.0625, kind="bust",        st="demolished"),
    3:  dict(id=None, city="Житомир",            lat=50.2547, lng=28.6587, kind="bust",        st="demolished",
             country="Украина", iso="UA"),
    4:  dict(id="verkhniy-fiagdon-1924",         city="Верхний Фиагдон",
             lat=42.8342, lng=44.3053, kind="plaque",     st="extant"),
    5:  dict(id=None, city="Ногинск",            lat=55.8683, lng=38.4442, kind="sculpture",   st="extant"),
    6:  dict(id="zhadovka-1924",                 city="Жадовка",
             lat=53.6500, lng=47.0500, kind="bust",       st="demolished"),
    7:  dict(id=None, city="Одесса",             lat=46.5100, lng=30.7500, kind="bust",        st="demolished",
             country="Украина", iso="UA"),
    8:  dict(id=None, city="Вытегра",            lat=61.0058, lng=36.4489, kind="bust",        st="extant"),
    9:  dict(id=None, city="Можайск",            lat=55.5058, lng=36.0289, kind="sculpture",   st="demolished"),
    10: dict(id="ivanovo-voznesensk-1924",       city="Иваново-Вознесенск",
             lat=57.0000, lng=40.9739, kind="sculpture",  st="relocated"),
    11: dict(id="kazan-leninskiy-sad-1925",      city="Казань",
             lat=55.7906, lng=49.1250, kind="sculpture",  st="relocated"),
    12: dict(id="pyatigorsk-mashuk-1925",        city="Пятигорск",
             lat=44.0450, lng=43.0980, kind="rock-image", st="extant",
             title="Портрет Ленина на Ленинских скалах"),
    13: dict(id=None, city="Кольчугино",         lat=56.2978, lng=39.3778, kind="sculpture",   st="extant"),
    14: dict(id="nizhny-tagil-1925",             city="Нижний Тагил",
             lat=57.9100, lng=59.9817, kind="sculpture",  st="extant"),
    15: dict(id=None, city="Елабуга",            lat=55.7628, lng=52.0664, kind="bust",        st="extant"),
    16: dict(id="moscow-oktyabrskaya-1925",      city="Москва",
             lat=55.7815, lng=37.6560, kind="sculpture",  st="extant"),
    17: dict(id="blagoveshchensk-amur-1925",     city="Благовещенск",
             lat=50.2907, lng=127.5272, kind="sculpture", st="extant"),
    18: dict(id="ufa-1924-larionov",             city="Уфа",
             lat=54.7261, lng=55.9475, kind="sculpture",  st="relocated"),
    19: dict(id="tashkent-teplovozny-1925",      city="Ташкент",
             lat=41.2900, lng=69.3000, kind="sculpture",  st="demolished",
             country="Узбекистан", iso="UZ"),
    20: dict(id=None, city="Заславль",           lat=54.0000, lng=27.2833, kind="sculpture",   st="extant",
             country="Беларусь", iso="BY"),
    21: dict(id=None, city="Оренбург",           lat=51.7727, lng=55.0988, kind="sculpture",   st="extant"),
    22: dict(id=None, city="Реутов",             lat=55.7614, lng=37.8564, kind="sculpture",   st="extant"),
    23: dict(id=None, city="Кулебаки",           lat=55.4269, lng=42.5231, kind="bust",        st="extant"),
    24: dict(id=None, city="Шуя",                lat=56.8556, lng=41.3792, kind="sculpture",   st="demolished"),
    25: dict(id="tver-proletarka-1925",          city="Тверь",              year=1925,
             lat=56.8450, lng=35.8500, kind="sculpture",  st="demolished"),
    26: dict(id=None, city="Омск",               lat=54.9885, lng=73.3242, kind="sculpture",   st="relocated"),
    27: dict(id="vladimir-sobornaya-1925",       city="Владимир",
             lat=56.1290, lng=40.4070, kind="sculpture",  st="demolished"),
    28: dict(id="kaluga-1925",                   city="Калуга",
             lat=54.5293, lng=36.2754, kind="sculpture",  st="extant", enrich=True),
    29: dict(id="chelyabinsk-aloe-pole-1925",    city="Челябинск",
             lat=55.1620, lng=61.3900, kind="bust",       st="extant"),
    30: dict(id=None, city="Новочеркасск",       lat=47.4222, lng=40.0939, kind="sculpture",   st="demolished"),
    31: dict(id="volgograd-pavshikh-1925",       city="Волгоград",
             lat=48.7080, lng=44.5133, kind="sculpture",  st="demolished"),
    32: dict(id=None, city="Красноярск",         lat=56.0100, lng=92.9700, kind="bust",        st="relocated"),
    33: dict(id="vyshniy-volochek-1926",         city="Вышний Волочёк",
             lat=57.5915, lng=34.5620, kind="sculpture",  st="extant"),
    34: dict(id="kislovodsk-krasnye-kamni-1926", city="Кисловодск",         year=1926,
             lat=43.9080, lng=42.7280, kind="relief",     st="extant",
             title="Барельеф Ленина на скале «Красные камни»"),
    35: dict(id=None, city="Златоуст",           lat=55.1714, lng=59.6503, kind="sculpture",   st="extant"),
    36: dict(id=None, city="Владикавказ",        lat=43.0367, lng=44.6678, kind="sculpture",   st="relocated"),
    37: dict(id="sankt-peterburg-obukhovskoy-1926", city="Санкт-Петербург",
             lat=59.8930, lng=30.4290, kind="sculpture",  st="extant"),
    38: dict(id="sankt-peterburg-smolnyy-1927",  city="Санкт-Петербург",
             lat=59.9470, lng=30.3960, kind="sculpture",  st="extant"),
    39: dict(id="nizhniy-novgorod-sormovo-1927", city="Нижний Новгород",
             lat=56.3600, lng=43.8600, kind="sculpture",  st="extant"),
    40: dict(id=None, city="Белгород",           lat=50.5950, lng=36.5870, kind="sculpture",   st="relocated"),
    # --- нескульптурные объекты -------------------------------------------
    41: dict(id="udalovka-bia-1947",             city="Удаловка",
             lat=52.2700, lng=87.0900, kind="rock-carving", st="extant",
             title="Профиль Ленина на скале над Бией"),
    42: dict(id="kyzyltash-1975",                city="Скала Кызылташ",
             lat=52.9500, lng=56.5500, kind="rock-image",   st="extant",
             title="«Три вождя» на скале Кызылташ"),
    43: dict(id="blagoveshchensk-rb-geoglif-1970", city="Благовещенск (РБ)",
             lat=55.0500, lng=55.9600, kind="geoglyph",     st="extant",
             title="Лесной геоглиф «Ленину 100 лет»"),
    44: dict(id="ukhta-vetlosyan-1970",          city="Ухта",
             lat=63.5450, lng=53.6800, kind="steel-silhouette", st="extant",
             title="Профиль Ленина на горе Ветлосян"),
    45: dict(id="makachevo-1924",                city="Макачёво",
             lat=60.9800, lng=36.6500, kind="geoglyph",     st="extant",
             title="Геоглиф-аллея «Ленин»"),
}

KIND_RU = {
    "sculpture": "скульптура",
    "bust": "бюст",
    "relief": "барельеф",
    "rock-image": "изображение на скале",
    "rock-carving": "высеченный рельеф",
    "geoglyph": "геоглиф",
    "steel-silhouette": "стальной силуэт",
    "plaque": "мемориальная плита",
}

TRANSLIT = {
    'А': 'a', 'Б': 'b', 'В': 'v', 'Г': 'g', 'Д': 'd', 'Е': 'e', 'Ё': 'e',
    'Ж': 'zh', 'З': 'z', 'И': 'i', 'Й': 'y', 'К': 'k', 'Л': 'l', 'М': 'm',
    'Н': 'n', 'О': 'o', 'П': 'p', 'Р': 'r', 'С': 's', 'Т': 't', 'У': 'u',
    'Ф': 'f', 'Х': 'kh', 'Ц': 'ts', 'Ч': 'ch', 'Ш': 'sh', 'Щ': 'shch',
    'Ы': 'y', 'Э': 'e', 'Ю': 'yu', 'Я': 'ya', 'Ъ': '', 'Ь': '',
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
    return re.sub(r'-+', '-', ''.join(out)).strip('-') or 'monument'


# ---------------------------------------------------------------------------
def parse_authors(text):
    """Разбор колонки «Авторы». Кроме скульпторов/архитекторов здесь встречаются
    ремесленные роли (модельщик, формовщик, литейщик, маляр-декоратор,
    художник-альпинист) — для ранней волны это содержательно: памятники делали
    не академики, а рабочие своих же фабрик. Кладём их в `makers`."""
    if not text:
        return [], [], []
    sculptors, architects, makers = [], [], []
    # Регистр не фиксирован: «Скульптор В.В. Козлов, архитектор А.И. Фролов» —
    # роль после запятой идёт со строчной, поэтому ищем без учёта регистра.
    # Падежи перечислены явно, а не через \w*: в ячейках инициал бывает приклеен
    # к роли («СкульпторС.Д. Меркуров»), и жадный \w* съедал первую букву имени.
    # Голое «Автор» из списка исключено намеренно — оно ловило «нет
    # индивидуального автора» в строке Новочеркасска; имя там даёт «скульптора».
    # Без re.I: лукахед (?![а-яё]) должен отсекать продолжение слова строчными
    # («автора»), но пропускать приклеенный инициал («СкульпторС.Д. Меркуров»).
    # Под re.I класс [а-яё] съел бы и заглавную «С», поэтому регистр первой
    # буквы перечислен вручную — роль после запятой пишется со строчной.
    pat = (r'([Сс]кульпторы|[Сс]кульптора|[Сс]кульптор|'
           r'[Аа]рхитекторы|[Аа]рхитектора|[Аа]рхитектор|'
           r'[Хх]удожники-альпинисты|[Хх]удожники|[Хх]удожник|'
           r'[Мм]астер-литейщик[а-яё]*|[Мм]одельщик|[Фф]ормовщик|'
           r'[Лл]итейщики|[Лл]итейщик|'
           r'[Мм]аляр-декоратор[а-яё]*|[Мм]естный мастер|[Мм]естный учитель|'
           r'[Ии]нициатор посадки[^-]*-|[Кк]онсультировал|'
           r'[Аа]втор проекта)(?![а-яё])[\s:]*')
    markers = [(m.start(), m.end(), m.group(1)) for m in re.finditer(pat, text)]
    if not markers:
        # Безымянные строки вида «У памятника нет индивидуального автора…»
        return [], [], []
    markers.append((len(text), len(text), 'END'))
    for i in range(len(markers) - 1):
        _, end, kind = markers[i]
        nxt = markers[i + 1][0]
        seg = text[end:nxt].strip(' .,;:\n\t')
        if not seg or 'не установл' in seg.lower() or 'еизвест' in seg.lower():
            continue
        names = [n.strip(' .,;:') for n in re.split(r'[,;]', seg) if n.strip(' .,;:')]
        k = kind.lower()
        if k.startswith('скульптор'):
            sculptors.extend(names)
        elif k.startswith('архитектор'):
            architects.extend(names)
        elif k in ('автор', 'автор проекта', 'консультировал'):
            sculptors.extend(names)
        else:
            makers.extend(f"{kind.strip(' -')} {n}" for n in names)
    return sculptors, architects, makers


def parse_heights(text):
    """Высоты в метрах. Для геоглифов и наскальных изображений понятие
    «скульптура + постамент» не работает — такие строки отдают None,
    их габариты живут только в size_raw."""
    if not text:
        return None

    # Скобки выбрасываем: «из шпиатра (100% цинк) 1,7 м» — 100 внутри скобок
    # разрывает поиск числа после метки.
    text = re.sub(r'\([^)]*\)', ' ', text)

    # Значение может идти как «2,8 м», так и «примерно 0,6 - 0,8 м» (диапазон →
    # берём середину) или «примерно3 м» (без пробела). NUM ловит все три.
    NUM = r'(?:около\s*|примерно\s*|ок\.\s*|более\s*)*([\d.,]+)(?:\s*[-–]\s*([\d.,]+))?\s*(м|см)\b'

    def find(label_re, window=60):
        m = re.search(label_re + r'[^\d]{0,%d}?' % window + NUM, text, re.I)
        if not m:
            return None
        try:
            lo = float(m.group(1).replace(',', '.').rstrip('.'))
            hi = float(m.group(2).replace(',', '.').rstrip('.')) if m.group(2) else lo
        except ValueError:
            return None
        v = (lo + hi) / 2
        if m.group(3).lower() == 'см':
            v /= 100.0
        return v if 0.2 <= v <= 120 else None

    total = find(r'(?:общая\s+высота\s+(?:памятника|композиции|монумента)|высота\s+памятника)')
    statue = (find(r'высот\w+\s+(?:\w+\s+){0,3}?(?:скульптуры|статуи|фигуры)')
              # «бронзовая скульптура 2,8 м.» — размер сразу за словом, без «высота»
              or find(r'(?:скульптура|статуя)', window=3))
    # «высота ниши с бюстом 8,2 м» — это не бюст; требуем родительный падеж «бюста».
    bust = find(r'высот\w+\s+(?:\w+\s+){0,3}?бюста') or find(r'бюст\w*\s+высотой')
    # Узкое окно: у Уфы за «постаменте» идёт «рядом с мраморной колонной высотой
    # 10,6 м» — это колонна, не постамент. Своей высоты постамента там нет.
    pedestal = find(r'постамент\w*', window=25)
    figure = statue if statue is not None else bust

    if figure and pedestal:
        return {"statue": figure, "pedestal": pedestal}
    if total and figure:
        return {"statue": figure, "pedestal": max(0.3, total - figure)}
    if total and pedestal:
        return {"statue": max(0.3, total - pedestal), "pedestal": pedestal}
    if total:
        return {"statue": total * 0.55, "pedestal": total * 0.45}
    if figure:
        return {"statue": figure, "pedestal": figure * 0.9}
    return None


def parse_status(note, tech):
    """Статус объекта. Порядок проверок важен: «восстановлен / вернули /
    сохраняется» перебивает более ранние упоминания сноса в той же строке —
    у ранней волны почти каждая биография это «разрушен → восстановлен»."""
    nl = (note or '').lower()
    if not nl:
        return "unknown"
    tail = nl[-400:]
    restored = any(w in tail for w in [
        'восстанов', 'вернули', 'вернулся', 'отреставрирован', 'реставрац',
        'сохраняется', 'сохранился', 'сохранена', 'находится на том же месте',
        'бережно сохран', 'заменил', 'установили нов', 'появился нов',
    ])
    lost = any(w in nl for w in [
        'не сохранился', 'демонтирова', 'снесен', 'снесён', 'уничтож',
        'разрушен', 'пропал', 'исчезла', 'судьба его неизвестна',
        'дальнейшая судьба не известна', 'судьба скульптуры 1925 г. неизвестна',
        'утрачен', 'украден',
    ])
    moved = any(w in nl for w in ['перенес', 'перенос', 'перемест', 'переехал', 'передали'])
    if lost and not restored:
        return "demolished"
    if moved and not lost:
        return "relocated"
    if lost and restored:
        # Объект пережил утрату — если хвост говорит о возвращении, он жив
        return "extant" if any(w in tail for w in ['сохраня', 'вернул', 'восстанов', 'находится']) else "demolished"
    return "extant"


MONTHS = {
    'январ': 1, 'феврал': 2, 'март': 3, 'апрел': 4, 'мая': 5, 'мае': 5, 'май': 5,
    'июн': 6, 'июл': 7, 'август': 8, 'сентябр': 9, 'октябр': 10,
    'ноябр': 11, 'декабр': 12,
}


def parse_year_date(year_cell):
    """Год установки. В колонке часто две даты («Сначала 1924 … Повторно 1970»)
    — для ранней волны интересна ПЕРВАЯ, она и есть «первый памятник»."""
    src = year_cell or ''
    # \b не годится: в ячейках встречается «1 мая1925 г.» — между кириллицей и
    # цифрой границы слова нет, и \b(19|20)\d{2}\b проскакивал мимо первой даты.
    ym = re.search(r'(?<!\d)(?:18|19|20)\d{2}(?!\d)', src)
    year = int(ym.group()) if ym else None
    iso = None
    dm = re.search(r'(\d{1,2})\s*([А-Яа-я]+)\s*(\d{4})', src)
    if dm:
        day, mword, yr = int(dm.group(1)), dm.group(2).lower(), int(dm.group(3))
        for stem, mnum in MONTHS.items():
            if mword.startswith(stem):
                try:
                    iso = date(yr, mnum, day).isoformat()
                except ValueError:
                    pass
                break
    if iso is None and year:
        mm = re.search(r'([А-Яа-я]+)\s*' + str(year), src)
        if mm:
            w = mm.group(1).lower()
            for stem, mnum in MONTHS.items():
                if w.startswith(stem):
                    iso = f"{year}-{mnum:02d}"
                    break
    return year, iso


def guess_kind(item):
    """Эвристика для 236 записей старого корпуса — чтобы поле kind было сплошным."""
    blob = f"{item.get('size_raw','')} {item.get('title','')} {item.get('short_text','')}".lower()
    if 'геоглиф' in blob:
        return 'geoglyph'
    if 'барельеф' in blob or 'горельеф' in blob:
        return 'relief'
    if 'мемориальн' in blob and 'плит' in blob:
        return 'plaque'
    if re.search(r'\bбюст', blob) and not re.search(r'скульптур|статуя|фигур', blob):
        return 'bust'
    return 'sculpture'


# ---------------------------------------------------------------------------
def main():
    with zipfile.ZipFile(DOCX) as z:
        doc_xml = z.read("word/document.xml").decode("utf-8")
        rels_xml = z.read("word/_rels/document.xml.rels").decode("utf-8")
    rels = {m.group(1): m.group(2) for m in
            re.finditer(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels_xml)}
    rows = re.findall(r"<w:tr\b[^>]*>(.*?)</w:tr>", doc_xml, re.DOTALL)

    records = []
    for idx, meta in sorted(ROWS.items()):
        row = rows[idx]
        cells = re.findall(r"<w:tc\b[^>]*>(.*?)</w:tc>", row, re.DOTALL)
        texts = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c)).strip() for c in cells]
        place, authors_raw, tech_raw, year_cell, note_raw = texts[1:6]
        rids = re.findall(r'r:embed="([^"]+)"', row)

        year, iso = parse_year_date(year_cell)
        if meta.get("year") and meta["year"] != year:
            year = meta["year"]
            # Дата пересобирается из той же ячейки, но вокруг нужного года
            m = re.search(r'(\d{1,2})\s*([А-Яа-я]+)\s*' + str(year), year_cell or '')
            iso = None
            if m:
                for stem, mnum in MONTHS.items():
                    if m.group(2).lower().startswith(stem):
                        try:
                            iso = date(year, mnum, int(m.group(1))).isoformat()
                        except ValueError:
                            pass
                        break
            if iso is None:
                iso = str(year)
        sculptors, architects, makers = parse_authors(authors_raw)
        kind = meta["kind"]
        city = meta["city"]

        status = meta["st"]
        guessed = parse_status(note_raw, tech_raw)
        if guessed != status:
            print(f"  · строка {idx} ({city}): статус вручную {status}, "
                  f"эвристика дала {guessed}", file=sys.stderr)

        mid = meta["id"] or f"{slugify(city)}-{year or 'nodate'}"
        title = meta.get("title") or (
            f"Бюст Ленина — {city}" if kind == "bust" else f"Памятник Ленину — {city}")

        rec = {
            "id": mid,
            "title": title,
            "year": year,
            "date": iso,
            "city": city,
            "place": place,
            "country": meta.get("country", "СССР"),
            "lat": meta["lat"],
            "lng": meta["lng"],
            "coords_verified": False,
            "sculptors": sculptors,
            "architects": architects,
            "status": status,
            "short_text": note_raw[:280] + ('…' if len(note_raw) > 280 else ''),
            "note_full": note_raw,
            "size_raw": tech_raw,
            "kind": kind,
            "kind_ru": KIND_RU[kind],
            "source": SOURCE,
        }
        if meta.get("iso"):
            rec["country_iso"] = meta["iso"]
        if makers:
            rec["makers"] = makers
        if idx <= 40:
            rec["wave"] = "first"
        rec["_rids"] = rids
        rec["_enrich"] = meta.get("enrich", False)
        records.append(rec)

    print(f"разобрано строк: {len(records)}")

    # ---------------- слияние в data/mtk41.json ----------------
    cat = json.loads(DATA.read_text(encoding="utf-8"))
    by_id = {it["id"]: it for it in cat["items"]}

    # kind для старого корпуса
    backfilled = 0
    for it in cat["items"]:
        if "kind" not in it:
            k = guess_kind(it)
            it["kind"] = k
            it["kind_ru"] = KIND_RU[k]
            backfilled += 1
    print(f"kind проставлен старым записям: {backfilled}")

    added, enriched, collided = 0, 0, []
    for rec in records:
        rids = rec.pop("_rids")
        do_enrich = rec.pop("_enrich")
        rec["_rids"] = rids
        clean = {k: v for k, v in rec.items() if k != "_rids"}
        if rec["id"] in by_id:
            if not do_enrich:
                collided.append(rec["id"])
            old = by_id[rec["id"]]
            old.setdefault("prev_source", old.get("source"))
            old.update(clean)
            enriched += 1
        else:
            cat["items"].append(clean)
            by_id[rec["id"]] = clean
            added += 1

    if collided:
        print("  ⚠ незаявленные совпадения id:", collided, file=sys.stderr)

    # Порядок массива не трогаем — новые записи в хвост. Прототипы сортируют
    # сами (timeline по городу, canon по году), а пересортировка всего файла
    # дала бы диф на все 236 старых записей ради нуля пользы.
    cat["count"] = len(cat["items"])
    cat["sources"] = sorted({it.get("source", "") for it in cat["items"]} - {""})
    print(f"data/mtk41.json: всего {cat['count']} (добавлено {added}, обогащено {enriched})")

    # ---------------- heights ----------------
    heights_map = json.loads(HEIGHTS.read_text(encoding="utf-8"))
    added_h = 0
    for rec in records:
        h = parse_heights(rec["size_raw"])
        if h and rec["kind"] in ("sculpture", "bust", "relief", "plaque"):
            heights_map[rec["id"]] = {"statue": round(h["statue"], 2),
                                      "pedestal": round(h["pedestal"], 2)}
            added_h += 1

    if DRY:
        print("\n--- DRY RUN, файлы не тронуты ---")
        for rec in records:
            h = parse_heights(rec["size_raw"])
            hs = f"{h['statue']:.2f}/{h['pedestal']:.2f}" if h else "—"
            who = " · ".join(rec["sculptors"] + [f"арх. {a}" for a in rec["architects"]]
                             + rec.get("makers", [])) or "—"
            print(f"{rec['id']:34} {str(rec['year']):5} {rec['kind']:16} "
                  f"{rec['status']:11} {hs:>11}  {who}")
        return

    shutil.copy(DATA, DATA.with_suffix(".json.bak-2026-08-01"))
    DATA.write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")
    HEIGHTS.write_text(json.dumps(heights_map, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"heights.json: +{added_h} (всего {len(heights_map)})")

    # ---------------- фото из docx ----------------
    saved = 0
    with zipfile.ZipFile(DOCX) as z:
        for rec in records:
            out_dir = ASSETS / rec["id"] / "photos"
            existing = sorted(f.name for f in out_dir.iterdir()) if out_dir.is_dir() else []
            n = len(existing)
            for rid in rec["_rids"]:
                target = rels.get(rid)
                if not target:
                    continue
                path = "word/" + target.lstrip("/")
                try:
                    blob = z.read(path)
                except KeyError:
                    continue
                ext = Path(path).suffix.lower().replace(".jpeg", ".jpg") or ".jpg"
                n += 1
                out_dir.mkdir(parents=True, exist_ok=True)
                (out_dir / f"{n:02d}_curator{ext}").write_bytes(blob)
                saved += 1
    print(f"кураторских фото сохранено: {saved}")

    # ---------------- manifest ----------------
    manifest = {}
    for d in sorted(p for p in ASSETS.iterdir()
                    if p.is_dir() and p.name not in ("lib", "tools", "sources")):
        pd = d / "photos"
        if not pd.is_dir():
            continue
        photos = sorted(f.name for f in pd.iterdir()
                        if f.suffix.lower() in (".jpg", ".jpeg", ".png"))
        if photos:
            manifest[d.name] = [f"photos/{p}" for p in photos]
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"manifest.json: {len(manifest)} записей")


if __name__ == "__main__":
    main()
