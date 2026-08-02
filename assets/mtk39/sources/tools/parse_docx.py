#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Разбор исходных материалов МТК 39 (docx) в нормализованный корпус.

Вход:  assets/mtk39/sources/*.docx
Выход: data/mtk39-corpus.json

Запуск (из корня worktree):
    python3 assets/mtk39/sources/tools/parse_docx.py

Скрипт детерминированный и офлайновый — сеть не нужна. Координаты добавляет
отдельный шаг geocode.py (он дописывает lat/lng в тот же файл).
"""
import json
import os
import re
import zipfile
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'mtk39', 'sources')
OUT = os.path.join(ROOT, 'data', 'mtk39-corpus.json')

FILES = [
    ('world', 'Ленинские улицы, вне СССР.docx'),
    ('ussr', 'СССР.docx'),
]

# ---------------------------------------------------------------- docx → строки


def _txt(el):
    return ' '.join(''.join(t.text or '' for t in el.iter(NS + 't')).split()).strip()


def _rows(tbl):
    """Строки таблицы; вложенные таблицы разворачиваются, обёртка отбрасывается."""
    out = []
    for tr in tbl.findall(NS + 'tr'):
        tcs = tr.findall(NS + 'tc')
        for tc in tcs:
            for nested in tc.findall(NS + 'tbl'):
                out.extend(_rows(nested))
        if len(tcs) >= 4:
            out.append([_txt(tc) for tc in tcs])
    return out


def walk(path):
    """Проход по body в порядке документа; абзац-заголовок задаёт секцию."""
    body = ET.fromstring(zipfile.ZipFile(path).read('word/document.xml')).find(NS + 'body')
    section, out = '', []
    for el in body:
        if el.tag == NS + 'p':
            t = _txt(el)
            if t and len(t) < 60 and not t.startswith('http'):
                section = t
        elif el.tag == NS + 'tbl':
            out.extend((section, cells) for cells in _rows(el))
    return out


# ---------------------------------------------------------------- нормализация

HEADER_WORDS = {'наименование', 'название', 'город', 'страна', 'описание', 'ссылка', '№'}

# Родовые слова, с которых начинается русский перевод, склеенный с оригиналом:
# "Avenida LenineПроспект Ленина" → "Avenida Lenine" + "Проспект Ленина"
GENERIC = (
    'Улица|Улиця|Площадь|Проспект|Бульвар|Парк|Сад|Сквер|Деревня|Село|Посёлок|Поселок|'
    'Населенный|Населённый|Городок|Город|Река|Ручей|Мост|Музей|Библиотека|Больница|Госпиталь|'
    'Школа|Университет|Институт|Академия|Завод|Фабрика|Комбинат|Стадион|Театр|Кинотеатр|'
    'Дворец|Дом|Жилой|Район|Квартал|Терраса|Дорога|Аллея|Набережная|Станция|Памятник|Бюст|'
    'Холм|Спортивный|Почтовое|Танцевальный|Производственная|Кафе|Ресторан|Отель|Гостиница|'
    'Проезд|Переулок|Тупик|Шоссе|Магистраль|Центр|Клуб|Лагерь|Пляж|Остров|Гора|Пик|Канал|'
    'Озеро|Колхоз|Совхоз|Кооператив|Организация|Газета|Гидроэлектростанция|Электростанция|'
    'Мемориал|Скульптура|Статуя|Кладбище|Церковь|Рынок|Кинотеатр|Пещера|Водопад|Перевал'
)
SPLIT_RE = re.compile(r'(?<=[^\s])(?=(?:%s)\b)' % GENERIC)

CYR = r'Ѐ-ӿ'
LATIN = r'A-Za-zÀ-ɏ'
# «Rue LénineУлица Ленина», «Lenin Village Деревня Ленин» — оригинал слева
FWD_RE = re.compile(r'^([^%s]*[%s][^%s]*?)\s*([%s].*)$' % (CYR, LATIN, CYR, CYR), re.S)
# «Проспект ЛенинаAvenida Lenin» — оригинал справа
BWD_RE = re.compile(r'^([%s][^%s]*?)\s*([%s][^%s]*)$' % (CYR, LATIN, LATIN, CYR), re.S)


def _letters(s):
    return len(re.findall(r'[^\W\d_]', s, re.U))


def _tidy(s):
    """Убирает скобку, оставшуюся от разреза «Астероид (852) Владилена (Wladilena)»."""
    s = s.strip(' -–—/,')
    if s.count('(') > s.count(')'):
        s = s.rstrip('( ').strip()
    if s.count(')') > s.count('('):
        s = s.rstrip(') ').strip() if s.endswith(')') else s.lstrip(') ').strip()
    return s


def split_name(raw):
    """→ (name_ru, name_orig). Оригинальное написание отделяется от русского."""
    raw = raw.strip()
    if not raw:
        return '', None
    if not re.search(r'[%s]' % CYR, raw):
        return raw, raw  # только оригинал, перевода нет

    # предпочитаем границу перед родовым словом («…)Жилой комплекс»),
    # иначе — первый кириллический символ
    for m in reversed(list(re.finditer(r'(?:%s)\b' % GENERIC, raw))):
        left, right = raw[:m.start()], raw[m.start():]
        if (re.search(r'[%s]' % LATIN, left) and _letters(left) >= 3
                and _letters(right) >= 3 and not re.search(r'[%s]' % LATIN, right)):
            return _tidy(right), _tidy(left)

    m = FWD_RE.match(raw)
    if m and _letters(m.group(1)) >= 3 and _letters(m.group(2)) >= 3:
        return _tidy(m.group(2)), _tidy(m.group(1))
    m = BWD_RE.match(raw)
    if m and _letters(m.group(1)) >= 3 and _letters(m.group(2)) >= 3:
        return _tidy(m.group(1)), _tidy(m.group(2))

    # склейка без смены алфавита: «ЛењиноваУлица Ленина» (сербская кириллица)
    parts = SPLIT_RE.split(raw, maxsplit=1)
    if len(parts) == 2 and parts[0].strip() and re.search(r'[јљњћђџ]', parts[0]):
        return _tidy(parts[1]), _tidy(parts[0])

    # «(ПГЕЕ)Профессиональная гимназия…», «…Steelworks)Металлургический комбинат…» —
    # закрывающая скобка вплотную к русскому названию
    m = re.match(r'^(.{10,}\))([А-ЯЁ][а-яё].{6,})$', raw, re.S)
    if m:
        return _tidy(m.group(2)), _tidy(m.group(1))

    # «Сейчас Хан Кубратулица Ленин» — слева нынешнее название, справа ленинское;
    # оба по-русски, разделителя нет
    m = re.match(r'^((?:Сейчас|Ныне|Сега)\b.*?)((?:улица|площад|булевард|бульвар|проспект)'
                 r'[а-яё]*\s+Лен[а-яё]+.*)$', raw, re.I)
    if m and _letters(m.group(1)) >= 3:
        return _tidy(m.group(2)), None
    return raw, None


CONTINENTS = [
    ('Бывший СССР', ['Россия', 'Украина', 'Беларусь', 'Казахстан', 'Узбекистан', 'Таджикистан',
                     'Кыргызстан', 'Киргизия', 'Туркменистан', 'Азербайджан', 'Армения', 'Грузия',
                     'Молдавия', 'Латвия', 'Литва', 'Эстония', 'Абхазия', 'Приднестровская',
                     'Южная Осетия']),
    ('Африка', ['Ангола', 'Бенин', 'Камерун', 'Мадагаскар', 'Мозамбик', 'Нигерия', 'Конго',
                'Сенегал', 'Сомали', 'Танзания', 'Тунис', 'ЮАР', 'Реюньон', 'Египет', 'Эфиопия']),
    ('Азия', ['Китай', 'Вьетнам', 'Монголия', 'Индия', 'Малайзия', 'Йемен', 'Япония', 'Сирия',
              'Ирак', 'Иран', 'Непал', 'Шри-Ланка', 'Бангладеш']),
    ('Америка', ['Куба', 'Мексика', 'Бразилия', 'Колумбия', 'Перу', 'Чили', 'Эквадор',
                 'Коста-Рика', 'Никарагуа', 'Венесуэла', 'Аргентина', 'США', 'Канада', 'Уругвай']),
    ('Западная Европа', ['Англия', 'Великобритания', 'Германия', 'Ирландия', 'Испания', 'Италия',
                         'Португалия', 'Финляндия', 'Франция', 'Швеция', 'Швейцария', 'Австрия',
                         'Бельгия', 'Нидерланды', 'Норвегия', 'Дания', 'Греция', 'Кипр']),
    ('Восточная Европа', ['Албания', 'Болгария', 'Босния', 'Венгрия', 'Польша', 'Румыния',
                          'Македония', 'Сербия', 'Словакия', 'Словения', 'Хорватия', 'Черногория',
                          'Чехия', 'Косово']),
]
SECTION_CONT = {'АФРИКА': 'Африка', 'АЗИЯ': 'Азия', 'АМЕРИКА': 'Америка',
                'ЗАПАДНАЯ ЕВРОПА': 'Западная Европа', 'ВОСТОЧНАЯ ЕВРОПА': 'Восточная Европа'}


def continent(country, section):
    for name, keys in CONTINENTS:
        for k in keys:
            if k.lower() in country.lower():
                return name
    for key, val in SECTION_CONT.items():
        if key in section.upper():
            return val
    return '—'


TYPES = [
    ('проспект',    r'проспек|бульвар|avenu|avenid|bulevar|аллея|набережн|шоссе|магистрал'),
    ('площадь',     r'площад|plaza|piazza|\bplace\b|\btrg\b|\bplac\b|largo'),
    ('переулок',    r'переул|проезд|тупик'),
    ('улица',       r'\bулиц|\bулиця|\bul\.|street|strada|calle|\brua\b|\bvia\b|ulica|utca|\brue\b|sarani|\broad\b|\bdrive\b|chemin|\bwadada'),
    ('памятник',    r'памятник|бюст|монумент|statue|скульптур|мемориал|мавзолей'),
    ('город',       r'\bгород\b|посёл|посел|\bсело\b|деревн|станиц|хутор|\bаул\b|кишлак|населённ|населенн|\bпгт\b|агрогород|село,|\bсельсовет'),
    ('район',       r'\bрайон|\bобласт|\bокруг'),
    ('завод',       r'завод|фабрик|комбинат|мастерск|верф|шахт|рудник|прииск|объединение|трест|\bгмк\b'),
    ('электростанция', r'\bгэс\b|грэс|тэц|тэс\b|электростанц|\bаэс\b'),
    ('вуз',         r'институт|университет|академи|училищ|\bшкол|техникум|\bвуз'),
    ('культура',    r'библиотек|музей|театр|дворец культуры|\bклуб\b|кинотеатр|филармони|дом культуры'),
    ('парк',        r'\bпарк|\bсад\b|park\b|сквер|công viên'),
    ('колхоз',      r'колхоз|совхоз|артель|кооператив'),
    ('транспорт',   r'метрополит|\bметро\b|вокзал|железн|аэропорт|\bпорт\b|станция метро'),
    ('вода',        r'канал\b|водохранилищ|\bрек[аи]\b|плотин|ручей|\bозеро\b'),
    ('судно',       r'пароход|ледокол|теплоход|\bсудно|корабл|крейсер|танкер'),
    ('спорт',       r'стадион|спорткомпл|дворец спорта|спортивный'),
    ('природа',     r'\bпик\b|вершин|ледник|заповедн|\bостров\b|\bмыс\b|\bгора\b|пещер'),
    ('медицина',    r'больниц|госпитал|санатор|клиник|поликлин|hospital'),
    ('награда',     r'\bорден|преми|награ'),
    ('космос',      r'астероид|планет|кратер'),
]


def kind(name, desc):
    s = (name + ' ' + desc).lower()
    for label, pat in TYPES:
        if re.search(pat, s):
            return label
    return 'прочее'


LOST = re.compile(r'упразднён|упразднен|ликвидирован|снесён|снесен|демонтирован|уничтожен|'
                  r'погиб|исчез|заброшен|разрушен', re.I)
RENAMED = re.compile(r'→|ныне|бывш|переименов|прежнее назван|renamed|носил[аи]? (?:имя|название)|'
                     r'\bдо \d{4}|возвращено|советского периода|в советское время', re.I)


def status(name, desc):
    s = (name + ' ' + desc).lower()
    if LOST.search(s):
        return 'утрачен'
    if RENAMED.search(s):
        return 'переименован'
    return 'носит имя'


Y = r'(1[89]\d\d|20[0-2]\d)'
RANGE_PATTERNS = [
    re.compile(r'[сС]\s+(?:\d{1,2}\s+\S+\s+)?' + Y + r'\s*(?:год[а-я]*\s*)?(?:по|до)\s+(?:\d{1,2}\s+\S+\s+)?' + Y),
    re.compile(r'\bв\s+' + Y + r'\s*[–—-]\s*' + Y + r'\s*(?:год|гг)', re.I),
    re.compile(r'\(' + Y + r'\s*[–—-]\s*' + Y + r'\)'),
    re.compile(r'\b' + Y + r'\s*[–—-]\s*' + Y + r'\s*(?:год[а-яё]*|гг\.?)', re.I),
]
NAME_VERB = re.compile(r'\b(?:основан|построен|открыт|заложен|создан|возник|образован|'
                       r'назван|наименован|присвоен|получил|вступил)[а-яё]{0,3}\b', re.I)
RENAME_VERB = re.compile(r'\b(?:переименован[а-яё]*|возвращено|сменил[а-яё]*\s+назван[а-яё]*|'
                         r'верну[а-яё]+\s+(?:историческ|прежн|стар)[а-яё]*|renamed)\b', re.I)
NAMING_CTX = re.compile(r'назван|называ|назывался|название|наименован|носил|носившее|именем|'
                        r'имени|переименован|присвоен|звался', re.I)
LENIN = re.compile(r'ленин|ильич|ульянов|владилен', re.I)
YEAR_RE = re.compile(Y)


def _ok(y):
    return y and 1870 <= y <= 2030


def years(name, desc):
    """→ (год имянаречения, год переименования). Оба могут быть None.

    Сначала диапазоны («в 1936–1991 годах назывался»), затем разбор по
    предложениям: глагол переименования + Ленин ПОСЛЕ него = имянаречение,
    без Ленина = уход имени.
    """
    s = name + ' ' + desc
    sentences = re.split(r'(?<=[.;])\s+', s)

    # 1. диапазон «носил имя с 1936 по 1991» — только если предложение про имя
    for sent in sentences:
        if not NAMING_CTX.search(sent):
            continue
        for pat in RANGE_PATTERNS:
            m = pat.search(sent)
            if m:
                a, b = int(m.group(1)), int(m.group(2))
                if _ok(a) and _ok(b) and a <= b:
                    return a, b

    # 2. пофразовый разбор: имя пришло / имя ушло
    named_lenin, named_founded, renamed = [], [], []
    for sent in sentences:
        ys = [int(y) for y in YEAR_RE.findall(sent) if _ok(int(y))]
        if not ys:
            continue
        rv = RENAME_VERB.search(sent)
        if rv and LENIN.search(sent[rv.end():rv.end() + 90]):
            named_lenin.append(ys[0])
        elif NAME_VERB.search(sent) and LENIN.search(sent):
            named_lenin.append(ys[0])
        elif rv:
            renamed.append(ys[0])
        elif NAME_VERB.search(sent):
            named_founded.append(ys[0])
        elif re.search(r'\b(?:до|по)\s+' + Y + r'\s*год', sent) and NAMING_CTX.search(sent):
            renamed.append(ys[-1])

    n = min(named_lenin) if named_lenin else (min(named_founded) if named_founded else None)
    r = max(renamed) if renamed else None
    if n and r and r < n:
        r = None
    return n, r


LINK_KINDS = [
    ('osm_object', r'openstreetmap\.org/(?:way|relation|node)/\d+'),
    ('osm_search', r'openstreetmap|nominatim'),
    ('commons', r'commons\.wikimedia'),
    ('wikipedia', r'wikipedia\.org|ruwiki\.ru'),
]
OSM_RE = re.compile(r'openstreetmap\.org/(way|relation|node)/(\d+)')


def link_info(url):
    if not url.startswith('http'):
        return None, None
    for label, pat in LINK_KINDS:
        if re.search(pat, url):
            return label, None
    return 'other', None


# В колонке «Город» источник местами повторяет соседнюю строку, а настоящее место
# названо в описании: «улица Ленин | Долна Златица» с текстом «Улица Ленина в селе
# Книжовник». Из-за этого возникают ложные дубли. Доверяем описанию.
PLACE_IN_DESC = re.compile(
    r'\bв\s+(?:селе|городе|коммуне|посёлке|поселке|деревне|общине|местечке)\s+'
    r'([А-ЯЁA-ZÀ-ÿ][^,.;:()]{1,40})')


def refine_city(city, desc):
    m = PLACE_IN_DESC.search(desc or '')
    if not m:
        return city
    place = m.group(1).strip()
    if not place or place.lower() in (city or '').lower():
        return city
    # колонку оставляем как уточнение (район, область), место ставим первым
    tail = re.sub(r'^[^,]+,\s*', '', city or '') if ',' in (city or '') else ''
    return '%s, %s' % (place, tail) if tail else place


# Строки-агрегаты в исходниках выглядят как объекты, но объектами не являются:
# «Статистика по улицам Ленина», «Декоммунизация (общий процесс)».
SUMMARY_ROW = re.compile(r'статистик|декоммунизац|^всего\b', re.I)


def slug(s, n=40):
    s = re.sub(r'[^\w\s-]', '', s.lower(), flags=re.U)
    s = re.sub(r'[\s_-]+', '-', s).strip('-')
    return s[:n] or 'x'


# ---------------------------------------------------------------- сборка

def build():
    records, ru_streets, seen = [], [], set()
    for src, fname in FILES:
        for section, cells in walk(os.path.join(SRC, fname)):
            low = [c.lower() for c in cells]
            if len([c for c in low if c in HEADER_WORDS]) >= 3:
                continue

            # выборка улиц Ульяновской области — другая схема (7 колонок)
            if len(cells) == 7 and cells[1] in ('улица', 'переулок', 'проезд', 'площадь',
                                                'бульвар', 'проспект', 'шоссе', 'аллея',
                                                'тупик', 'квартал'):
                ru_streets.append({'type': cells[1], 'name': cells[2],
                                   'settlement_type': cells[3], 'settlement': cells[4],
                                   'district': cells[5], 'region': cells[6]})
                continue

            if len(cells) < 6:
                continue
            raw_name, city, country, desc, link = (cells[1], cells[2], cells[3], cells[4],
                                                   cells[5])
            if not (raw_name or city) or country in ('', 'Страна'):
                continue

            name, name_orig = split_name(raw_name)
            city = refine_city(city, desc)
            if city and country and city.strip().lower() == country.strip().lower():
                city = ''       # «Ленинбунд · Германия · Германия» — место не указано
            if not name and desc:
                # имя потерялось при разборе — восстанавливаем начало описания
                name = re.split(r'\s+в\s+(?:селе|городе|коммуне)\b', desc)[0].strip(' .,')
            y_named, y_renamed = years(raw_name, desc)
            if y_named and y_named < 1917:
                y_named = None
            lk, _ = link_info(link)
            m = OSM_RE.search(link)

            rid = '%s-%s-%s' % (src, slug(country, 12), slug(name or city, 28))
            if rid in seen:
                i = 2
                while '%s-%d' % (rid, i) in seen:
                    i += 1
                rid = '%s-%d' % (rid, i)
            seen.add(rid)

            records.append({
                'id': rid,
                'src': src,
                'section': section,
                'name': name,
                'name_orig': name_orig,
                'city': city,
                'country': country,
                'continent': continent(country, section),
                'kind': kind(raw_name, desc),
                'status': status(raw_name, desc),
                'year_named': y_named,
                'year_renamed': y_renamed,
                'desc': desc,
                'link': link if link.startswith('http') else None,
                'link_kind': lk,
                'osm': {'type': m.group(1), 'id': int(m.group(2))} if m else None,
                'lat': None,
                'lng': None,
                'geo_src': None,
            })

    # агрегаты — отдельно от объектов
    summaries = [r for r in records if SUMMARY_ROW.search(r['name'])]
    records = [r for r in records if not SUMMARY_ROW.search(r['name'])]

    # схлопываем настоящие дубли: совпали название, место, страна и описание
    seen_rec, deduped, dropped = {}, [], 0
    for r in records:
        k = (re.sub(r'\W+', '', (r['name'] or '').lower()),
             re.sub(r'\W+', '', (r['city'] or '').lower()),
             re.sub(r'\W+', '', (r['country'] or '').lower()),
             re.sub(r'\W+', '', (r['desc'] or '').lower()))
        if k in seen_rec:
            dropped += 1
            continue
        seen_rec[k] = True
        deduped.append(r)
    records = deduped

    # один объект, записанный дважды с разными формулировками: источник сам метит
    # такие как «(повторная запись)», а иногда вторая строка добавляет нынешнее имя
    by_place = {}
    order = []
    merged = 0
    for r in records:
        k = (re.sub(r'\W+', '', (r['name'] or '').lower()),
             re.sub(r'\W+', '', (r['city'] or '').lower()),
             re.sub(r'\W+', '', (r['country'] or '').lower()))
        if k in by_place:
            merged += 1
            keep = by_place[k]
            # оставляем более содержательную запись
            if len(r['desc'] or '') > len(keep['desc'] or ''):
                by_place[k] = r
                order[order.index(keep)] = r
        else:
            by_place[k] = r
            order.append(r)
    records = order

    # один и тот же OSM-объект, прилепленный к разным местам, — ошибка источника:
    # привязку оставляем первой записи, остальные пойдут геокодироваться по городу
    osm_seen = set()
    unlinked = 0
    for r in records:
        if not r['osm']:
            continue
        k = '%s/%s' % (r['osm']['type'], r['osm']['id'])
        if k in osm_seen:
            r['osm'] = None
            unlinked += 1
        else:
            osm_seen.add(k)

    print('дублей схлопнуто: %d (точных) + %d (по месту), агрегатов вынесено: %d, '
          'повторных OSM-ссылок снято: %d' % (dropped, merged, len(summaries), unlinked))

    data = {
        'mtk': 39,
        'title': 'Имени Ленина — корпус',
        'sources': [f for _, f in FILES],
        'note': ('Разобрано автоматически из docx музея. Поля kind/status/year_* — '
                 'эвристика по тексту описания, требуют выборочной проверки. '
                 'Координаты добавляет geocode.py.'),
        'russia_summary': {
            'streets': 8486,
            'lanes': 518,
            'total_all': 9452,
            'total_main': 8889,
            'year': 2020,
            'source': 'Мы живём на улице Ленина — Борис Гиршберг / Strelka Mag',
        },
        'ru_streets_sample': ru_streets,
        'summaries': [{'name': r['name'], 'country': r['country'], 'text': r['desc'],
                       'link': r['link']} for r in summaries],
        'records': records,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return data


if __name__ == '__main__':
    d = build()
    r = d['records']
    print('записей: %d (world %d / ussr %d)' % (
        len(r), sum(1 for x in r if x['src'] == 'world'), sum(1 for x in r if x['src'] == 'ussr')))
    print('с оригинальным написанием: %d' % sum(1 for x in r if x['name_orig']))
    print('с годом имянаречения: %d, с годом переименования: %d' % (
        sum(1 for x in r if x['year_named']), sum(1 for x in r if x['year_renamed'])))
    print('с OSM-объектом: %d' % sum(1 for x in r if x['osm']))
    print('выборка улиц РФ: %d' % len(d['ru_streets_sample']))
    print('→ %s' % OUT)
