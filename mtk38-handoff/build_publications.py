#!/usr/bin/env python3
# МТК 38 · build_publications.py
# Источник: assets/mtk38/sources/Ленин на языках народов мира.doc (кураторский, 2026-08-01)
# Разбирает таблицу «Вид / Язык / Письмо / Семья / Ареал / Книга» в data/mtk38-publications.json.
#
# Документ описывает ИЗДАНИЯ, а не языки: один язык → N изданий (испанский — 10 стран,
# английский — 5, арабский — 5, немецкий — 4). Канон языков (data/mtk38.json) не трогаем,
# связь по lang_id (ISO 639-3).
#
# Запуск:  python3 mtk38-handoff/build_publications.py
import json, re, sys, struct, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / "assets/mtk38/sources/Ленин на языках народов мира.doc"
OUT = ROOT / "data/mtk38-publications.json"

SECTIONS = {"Страны бывшего СССР", "Языки народов России", "Европа", "Азия",
            "Африка", "Австралия и Океания", "Латинская Америка", "Северная Америка"}

# Русское название языка → ISO 639-3. Совпадающие с каноном id переиспользуются как есть.
ISO = {
    # бывший СССР
    "Азербайджанский": "aze", "Грузинский": "kat", "Абхазский": "abk", "Армянский": "hye",
    "Белорусский": "bel", "Украинский": "ukr", "Молдавский": "ron", "Эстонский": "est",
    "Латышский": "lav", "Литовский": "lit", "Казахский": "kaz", "Узбекский": "uzb",
    "Каракалпакский": "kaa", "Таджикский": "tgk", "Туркменский": "tuk", "Киргизский": "kir",
    # народы России
    "Адыгейский": "ady", "Алтайский": "alt", "Ассирийский": "aii", "Балкарский": "krc",
    "Башкирский": "bak", "Бурятский": "bua", "Даргинский": "dar", "Идиш": "yid",
    "Ингушский": "inh", "Кабардинский": "kbd", "Калмыцкий": "xal", "Карельский": "krl",
    "Коми-зырянский": "kpv", "Коми-пермяцкий": "koi", "Коми": "kpv",
    "Карачаево-балкарский": "krc", "Карело-финский": "krl", "Крымско-татарский": "crh",
    "Лакский": "lbe", "Лезгинский": "lez", "Лугово-восточный марийский": "mhr",
    "Мокшанский": "mdf", "Ненецкий": "yrk", "Ойратский": "xal", "Осетинский": "oss",
    "Татарский": "tat", "Татский": "ttt", "Тувинский": "tyv", "Удмуртский": "udm",
    "Хакасский": "kjh", "Чеченский": "che", "Чувашский": "chv", "Чукотский": "ckt",
    "Эвенкийский": "evn", "Эрзянский": "myv", "Якутский": "sah", "Цыганский": "rom",
    # Европа
    "Немецкий": "deu", "Албанский": "sqi", "Итальянский": "ita", "Болгарский": "bul",
    "Боснийский": "bos", "Английский": "eng", "Венгерский": "hun", "Греческий": "ell",
    "Датский": "dan", "Испанский": "spa", "Голландский (нидерландский)": "nld",
    "Македонский": "mkd", "Норвежский": "nor", "Польский": "pol", "Португальский": "por",
    "Румынский": "ron", "Сербский": "srp", "Словацкий": "slk", "Словенский": "slv",
    "Финский": "fin", "Французский": "fra", "Хорватский": "hrv", "Черногорский": "cnr",
    "Чешский": "ces", "Шведский": "swe",
    # Азия
    "Пушту": "pus", "Дари": "prs", "Бенгальский": "ben", "Вьетнамский": "vie",
    "Иврит": "heb", "Авадхи": "awa", "Ассами": "asm", "Биласпури (калури)": "bfz",
    "Гуджарати": "guj", "Кашмири": "kas", "Каннада": "kan", "Малаялам": "mal",
    "Маратхи": "mar", "Ория": "ory", "Панджаби": "pan", "Раджастхани": "raj",
    "Тамильский": "tam", "Телугу": "tel", "Сантали": "sat", "Хинди": "hin",
    "Индонезийский": "ind", "Арабский": "ara", "Курдский": "kur",
    "Персидский (фарси)": "fas", "Китайский (упрощ.)": "zho", "Кантонский": "yue",
    "Корейский": "kor", "Лаосский": "lao", "Монгольский": "mon", "Непальский": "nep",
    "Урду": "urd", "Турецкий": "tur", "Сингальский": "sin", "Уйгурский": "uig",
    "Японский": "jpn", "Тибетский": "bod", "Тайский": "tha", "Филиппинский": "fil",
    "Кхмерский": "khm", "Мальдивский (дивехи)": "div", "Манипури (мейтейлон)": "mni",
    # Африка
    "Суахили": "swa", "Амхарский": "amh", "Хауса": "hau",
}

# Опечатки исходника → нормальная форма (латинская «x» в «Авадxи» и т.п.)
FIX_NAME = {
    "Авадxи": "Авадхи",
    "Гуаджарати": "Гуджарати",
    "Абхазский язык": "Абхазский",
    "Татарский язык": "Татарский",
}


# ─────────────────────────── чтение .doc (Word 97, piece table) ───────────────────────────
def read_doc_cells(path):
    import olefile
    ole = olefile.OleFileIO(str(path))
    wd = ole.openstream("WordDocument").read()
    flags = struct.unpack_from("<H", wd, 0x000A)[0]
    tbl = ole.openstream("1Table" if (flags >> 9) & 1 else "0Table").read()
    fcClx, lcbClx = struct.unpack_from("<II", wd, 0x01A2)
    clx = tbl[fcClx:fcClx + lcbClx]
    i, pcdt = 0, None
    while i < len(clx):
        if clx[i] == 0x01:
            i += 3 + struct.unpack_from("<h", clx, i + 1)[0]
        elif clx[i] == 0x02:
            lcb = struct.unpack_from("<I", clx, i + 1)[0]
            pcdt = clx[i + 5:i + 5 + lcb]
            break
        else:
            raise SystemExit("Clx: неожиданный токен")
    n = (len(pcdt) - 4) // 12
    cps = list(struct.unpack_from("<%dI" % (n + 1), pcdt, 0))
    parts = []
    for k in range(n):
        off = 4 * (n + 1) + 8 * k
        fc = struct.unpack_from("<I", pcdt, off + 2)[0]
        cch = cps[k + 1] - cps[k]
        if fc & 0x40000000:
            fc = (fc & ~0x40000000) // 2
            parts.append(wd[fc:fc + cch].decode("cp1251", "replace"))
        else:
            parts.append(wd[fc:fc + cch * 2].decode("utf-16-le", "replace"))
    text = "".join(parts)

    rows, cur, cell, j = [], [], [], 0
    while j < len(text):
        ch = text[j]
        if ch == "\x07":
            cur.append("".join(cell).strip()); cell = []
            if j + 1 < len(text) and text[j + 1] == "\x07":
                rows.append(cur); cur = []; j += 1
        elif ch in "\r\x0b\x0c":
            cell.append("\n")
        else:
            cell.append(ch)
        j += 1
    if cur:
        rows.append(cur)
    return [r for r in rows if any(c.strip() for c in r)]


# ─────────────────────────── починка кривых строк ───────────────────────────
# Часть строк в исходнике имеет сбитую разметку ячеек (вертикальные объединения в Word):
# ведущая пустая ячейка сдвигает запись вправо, отсутствующий «Вид» — влево.
# Выравниваем по КОЛОНКЕ ЯЗЫКА: её содержимое всегда есть в словаре ISO — надёжный якорь.
LANG_NAMES = set(ISO) | set(FIX_NAME)


def lang_index(row):
    for k, c in enumerate(row):
        head = (c or "").split("\n")[0].strip()
        if FIX_NAME.get(head, head) in LANG_NAMES:
            return k
    return None


def repair(rows):
    out, i = [], 0
    while i < len(rows):
        r = list(rows[i])
        nonempty = [c for c in r if c.strip()]
        # секция может прийти с ведущей пустой ячейкой: ['', 'Северная Америка']
        if len(nonempty) == 1 and nonempty[0] in SECTIONS:
            out.append(("SECTION", nonempty[0])); i += 1; continue
        if r and r[0].strip() == "Вид":
            i += 1; continue                      # шапка таблицы
        # цыганский: 4 ячейки, «Книга» уехала отдельной строкой ниже
        if len(r) == 4 and i + 1 < len(rows) and len(rows[i + 1]) == 1 \
                and rows[i + 1][0].strip() not in SECTIONS:
            r = r + ["", rows[i + 1][0]]; i += 1
        li = lang_index(r)
        if li is None:
            print(f"  ⚠ строка {i}: не нашёл колонку языка · {[c[:28] for c in r]}", file=sys.stderr)
            i += 1; continue
        if li > 1:
            dropped = r[:li - 1]
            if any(c.strip() for c in dropped):
                print(f"  ⚠ строка {i}: отброшены непустые ячейки {dropped}", file=sys.stderr)
            r = r[li - 1:]
        elif li < 1:
            r = [""] * (1 - li) + r
        r = (r + [""] * 6)[:6]
        out.append(("ROW", r)); i += 1
    return out


# ─────────────────────────── разбор ячейки «Книга» ───────────────────────────
AUTHOR_RU = re.compile(r"^\s*(?:В\.?\s*И\.?\s*Ленин|Н\.\s*Ленин|Ленин)\s*[.,]?\s*", re.I)
# «Ленин» в любом из встречающихся написаний — опознать строку с именем автора
LENIN_ANY = re.compile(
    r"len+in|лен+ин|ленін|ļeņin|lênin|lénine|lenjin|ленин|"
    r"ლენინი|Լենին|ܠܸܢܸܘܸܢ|לינין|לענין|レーニン|列宁|列寧|레닌|لنین|لينين|لینن|لىنىن",
    re.I)
YEAR = re.compile(r"\b(1[89]\d{2}|20\d{2})(?:\s*[-–—]\s*(1[89]\d{2}|20\d{2}))?\b")
EAST_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
CYR = re.compile(r"[А-Яа-яЁё]")


def deaccent(s):
    """Строчные без диакритики: Lénin / Lênin / Ļeņins → lenin / lenins."""
    n = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in n if not unicodedata.combining(c))


def is_russian(line):
    letters = [c for c in line if c.isalpha()]
    if not letters:
        return False
    return sum(bool(CYR.match(c)) for c in letters) / len(letters) > 0.6


def split_imprint(text):
    """«Заглавие. Город: Издательство, 1970» → (заглавие, выходные данные, год).
    Разбираем С КОНЦА: год — последний в строке (в заглавии тоже бывают годы,
    ср. «Доклад о революции 1905 года. Токио, 1935»), выходные данные — хвост
    после последнего разделителя предложения перед годом."""
    text = text.strip()
    # восточноарабские / персидские цифры (перс. «۱۹۵۲») → ASCII, иначе год не находится
    text = text.translate(EAST_DIGITS)
    ms = list(YEAR.finditer(text))
    if not ms:
        return text.strip(" ,.;:\n"), "", ""
    m = ms[-1]
    year = re.sub(r"\s*(г\.?|гг\.?|-е|-х)\s*$", "", text[m.start():].strip(" ,.;:")).strip()
    head = text[:m.start()]
    # перевод строки — более сильная граница, чем точка: точка встречается внутри
    # выходных данных («Verlag von J. H. W. Reich und Co., 1915») и рвала бы их посередине
    k = head.rfind("\n") if "\n" in head else max(head.rfind("."), head.rfind("?"), head.rfind("!"))
    imprint = head[k + 1:].strip(" ,;:\n")
    title = head[:k + 1].strip(" ,.;:\n") if k >= 0 else ""
    if not title:                      # выходных данных нет — весь хвост это заглавие
        title, imprint = imprint, ""
    return title, imprint, year


def parse_book(cell, writing=""):
    """Ячейка «Книга»: блок на языке издания, пустая строка, блок по-русски.
    У части записей (Азия, Африка) блока на языке нет — только русское описание."""
    cell = cell.replace("\x01", "").strip()
    cell = re.sub(r"\x13\s*INCLUDEPICTURE.*?\x15", "", cell, flags=re.S)   # поля-картинки Word
    cell = re.sub(r'INCLUDEPICTURE\s+"[^"]*"(\s*\\\*\s*MERGEFORMAT)?', "", cell)
    lines = [l.strip() for l in cell.split("\n") if l.strip()]
    if not lines:
        return {}
    blocks = [b.strip() for b in re.split(r"\n\s*\n", cell) if b.strip()]
    if len(blocks) >= 2:
        native, ru = blocks[0], "\n".join(blocks[1:])
    elif AUTHOR_RU.match(lines[0]) and is_russian(lines[0]):
        native, ru = "", cell
    else:
        # пустой строки-разделителя нет (курдский): русский блок начинается со строки-автора
        cut = next((i for i, l in enumerate(lines)
                    if i and AUTHOR_RU.match(l) and is_russian(l)), None)
        if cut is not None:
            native, ru = "\n".join(lines[:cut]), "\n".join(lines[cut:])
        else:
            native, ru = cell, ""

    # первая строка блока на языке издания обычно автор — узнаём по написанию «Ленин»
    author_native = ""
    nlines = [l.strip() for l in native.split("\n") if l.strip()]
    if len(nlines) > 1:
        # сравниваем без диакритики: в каноне «LÊNIN», в строке автора «V. I. Lénin»
        base = deaccent(writing or "")
        head = deaccent(nlines[0])
        looks_author = (base and base in head) or LENIN_ANY.search(deaccent(nlines[0]))
        if looks_author and len(nlines[0]) < len(native) * 0.6:
            author_native = nlines[0]
            native = "\n".join(nlines[1:])

    title_native, imprint_native, year_native = split_imprint(native)
    # переводы строк НЕ схлопываем: «Заглавие\nГород, 1970» — граница выходных данных
    ru_body = AUTHOR_RU.sub("", "\n".join(l.strip() for l in ru.split("\n") if l.strip()), count=1).strip()
    title_ru, imprint_ru, year = split_imprint(ru_body)

    city_ru, publisher_ru = imprint_ru, ""
    if ":" in imprint_ru:
        city_ru, publisher_ru = (x.strip() for x in imprint_ru.split(":", 1))
    city_native, publisher_native = imprint_native, ""
    if ":" in imprint_native:
        city_native, publisher_native = (x.strip() for x in imprint_native.split(":", 1))

    return {k: v for k, v in {
        "author_native": author_native,
        "title_native": title_native,
        "city_native": city_native,
        "publisher_native": publisher_native,
        "title_ru": title_ru,
        "city_ru": city_ru,
        "publisher_ru": publisher_ru,
        "year": year or year_native,
        "raw_native": native,
        "raw_ru": ru,
    }.items() if v}


# ─────────────────────────── сборка ───────────────────────────
def main():
    if not DOC.exists():
        raise SystemExit(f"нет исходника: {DOC}")
    rows = repair(read_doc_cells(DOC))

    pubs, section, unknown = [], None, set()
    for kind, payload in rows:
        if kind == "SECTION":
            section = payload; continue
        vid, langcell, script, family, area, book = payload
        lang = [l.strip() for l in langcell.split("\n") if l.strip()]
        name_ru = FIX_NAME.get(lang[0], lang[0]) if lang else ""
        if not name_ru:
            continue
        endonym = "\n".join(lang[1:]).strip()
        iso = ISO.get(name_ru)
        if not iso:
            unknown.add(name_ru)
        writings = [w.strip() for w in vid.split("\n") if w.strip() and "INCLUDEPICTURE" not in w]
        pubs.append({
            "lang_id": iso or "",
            "name_ru": name_ru,
            "endonym": endonym,
            "writing": writings[0] if writings else "",
            "writing_alt": writings[1:],
            "script_ru": script.replace("\n", " / "),
            "family": family.replace("\n", " "),
            "area": area.replace("\n", ", "),
            "section": section,
            "cover": None,                     # проставляется в Э0c
            **parse_book(book, writings[0] if writings else ""),
        })

    doc = {
        "mtk": 38,
        "title": "Издания В.И. Ленина на языках мира",
        "source": "assets/mtk38/sources/Ленин на языках народов мира.doc (куратор, 2026-08-01)",
        "note": ("Документ описывает ИЗДАНИЯ, не языки: один язык → N изданий "
                 "(испанский — 10 стран, английский — 5, арабский — 5, немецкий — 4). "
                 "Связь с каноном языков data/mtk38.json по lang_id (ISO 639-3)."),
        "count": len(pubs),
        "publications": pubs,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")

    langs = {}
    for p in pubs:
        langs.setdefault(p["lang_id"] or p["name_ru"], []).append(p)
    print(f"изданий: {len(pubs)}   языков: {len(langs)}   → {OUT.relative_to(ROOT)}")
    if unknown:
        print(f"⚠ без ISO-кода ({len(unknown)}): {', '.join(sorted(unknown))}", file=sys.stderr)
    multi = {k: len(v) for k, v in langs.items() if len(v) > 1}
    print("несколько изданий:", ", ".join(f"{k}×{n}" for k, n in sorted(multi.items(), key=lambda x: -x[1])))
    nb = [p["name_ru"] for p in pubs if not p.get("title_ru") and not p.get("title_native")]
    print(f"без описания книги: {len(nb)}" + (f" → {', '.join(nb)}" if nb else ""))


if __name__ == "__main__":
    main()
