#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Разовый геокодинг корпуса МТК 39. Результат запекается в репозиторий —
в рантайме киоск в сеть не ходит.

Источники координат, по убыванию точности:
  1. OSM-объект из ссылки (way/relation/node) → Overpass, реальная геометрия
  2. Статья Википедии из ссылки → prop=coordinates
  3. Nominatim по «город, страна» (1 запрос/сек)

Кэш: assets/mtk39/sources/cache/*.json — скрипт перезапускаем, уже полученное
не перезапрашивается.

Выход:
  data/mtk39-corpus.json   — дописывает lat / lng / geo_src
  data/mtk39-streets.json  — геометрии линий улиц для «гербария»

Запуск (из корня worktree):
    python3 assets/mtk39/sources/tools/geocode.py
"""
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
CACHE = os.path.join(ROOT, 'assets', 'mtk39', 'sources', 'cache')
CORPUS = os.path.join(ROOT, 'data', 'mtk39-corpus.json')
BORDERS = os.path.join(ROOT, 'data', 'ne_110m_countries.geojson')
STREETS = os.path.join(ROOT, 'data', 'mtk39-streets.json')

UA = 'BMK-3842-museum-prototype/1.0 (mtk39; dimitri@dvn.spb.ru)'
OVERPASS = 'https://overpass-api.de/api/interpreter'
NOMINATIM = 'https://nominatim.openstreetmap.org/search'


def load(name, default):
    p = os.path.join(CACHE, name)
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    return default


def save(name, obj):
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False)


def http(url, data=None, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:                                    # noqa: BLE001
            if i == tries - 1:
                print('   ! %s → %s' % (url[:60], e), file=sys.stderr)
                return None
            time.sleep(3 * (i + 1))
    return None


# ---------------------------------------------------------------- 1. Overpass

def fetch_osm(records):
    cache = load('osm.json', {})
    want = {}
    for r in records:
        if r['osm']:
            key = '%s/%s' % (r['osm']['type'], r['osm']['id'])
            if key not in cache:
                want.setdefault(r['osm']['type'], []).append(r['osm']['id'])
    if want:
        for typ, ids in want.items():
            for i in range(0, len(ids), 120):
                chunk = ids[i:i + 120]
                q = '[out:json][timeout:180];%s(id:%s);out %s;' % (
                    typ, ','.join(str(x) for x in chunk),
                    'geom' if typ in ('way', 'relation') else '')
                print('  overpass %s ×%d' % (typ, len(chunk)))
                res = http(OVERPASS, q.encode('utf-8'))
                if not res:
                    continue
                for el in res.get('elements', []):
                    key = '%s/%s' % (el['type'], el['id'])
                    if el['type'] == 'node':
                        cache[key] = {'lat': el['lat'], 'lng': el['lon'], 'geometry': None,
                                      'tags': el.get('tags', {})}
                    else:
                        geom = [[p['lat'], p['lon']] for p in el.get('geometry', [])]
                        if not geom:
                            continue
                        cache[key] = {
                            'lat': sum(p[0] for p in geom) / len(geom),
                            'lng': sum(p[1] for p in geom) / len(geom),
                            'geometry': geom,
                            'tags': el.get('tags', {}),
                        }
                time.sleep(2)
        save('osm.json', cache)
    return cache


# ---------------------------------------------------------------- 2. Wikipedia

WIKI_RE = re.compile(r'https?://([a-z]+)\.(wikipedia\.org|ruwiki\.ru)/wiki/([^\s]+)')


def wiki_targets(link):
    """→ [(host_api, title)] из склеенных в одну ячейку ссылок."""
    out = []
    for m in WIKI_RE.finditer(link or ''):
        lang, site, title = m.group(1), m.group(2), m.group(3)
        title = urllib.parse.unquote(title.split('#')[0].split('?')[0]).replace('_', ' ')
        if not title or title.startswith(('File:', 'Файл:', 'Category:', 'Категория:')):
            continue
        # ruwiki.ru — форк; статьи с теми же заголовками ищем в википедии
        host = 'ru.wikipedia.org' if site == 'ruwiki.ru' else '%s.wikipedia.org' % lang
        out.append((host, title))
    return out


def fetch_wiki(records):
    cache = load('wiki.json', {})
    want = {}
    for r in records:
        for host, title in wiki_targets(r['link']):
            if '%s|%s' % (host, title) not in cache:
                want.setdefault(host, set()).add(title)
    for host, titles in want.items():
        titles = sorted(titles)
        for i in range(0, len(titles), 40):
            chunk = titles[i:i + 40]
            url = ('https://%s/w/api.php?action=query&prop=coordinates&redirects=1'
                   '&format=json&formatversion=2&titles=%s'
                   % (host, urllib.parse.quote('|'.join(chunk))))
            print('  wiki %s ×%d' % (host, len(chunk)))
            res = http(url)
            got = {}
            if res:
                for page in res.get('query', {}).get('pages', []):
                    co = (page.get('coordinates') or [{}])[0]
                    if co.get('lat') is not None:
                        got[page['title']] = [co['lat'], co['lon']]
                # учесть нормализацию и редиректы
                for kind in ('normalized', 'redirects'):
                    for n in res.get('query', {}).get(kind, []):
                        if n['to'] in got:
                            got[n['from']] = got[n['to']]
            for t in chunk:
                cache['%s|%s' % (host, t)] = got.get(t)
            time.sleep(0.4)
        save('wiki.json', cache)
    return cache


# ---------------------------------------------------------------- 3. Nominatim

STOP = re.compile(r'\(.*?\)|\bбывш[а-яё]*\.?|\bныне\b|→|\bупразднён|\bликвидирован', re.I)


def src_country(rec):
    """Страна по материалам музея.

    Часть записей отнесена к России по действующим границам РФ (см.
    parse_docx.by_russian_law), но геокодинг обязан оставаться тем же: кеш
    Nominatim лежит по строке запроса, а проверка попадания в контур страны
    идёт по Natural Earth. Иначе разовый прогон перестал бы воспроизводиться
    и выбросил бы девять честных точек как «не попавшие в свою страну».
    """
    return rec.get('country_src') or rec['country']


def place_query(rec):
    city = STOP.sub(' ', rec['city'] or '').strip(' ,-–—')
    country = re.split(r'[/(]', src_country(rec))[0].strip()
    country = {'Англия': 'United Kingdom', 'Кыргызстан': 'Киргизия'}.get(country, country)
    if not city:
        return country or None
    return '%s, %s' % (city, country) if country else city


QUALIFIER = re.compile(
    r'\b(?:департамент|провинци[яи]|штат|регион|земля|область|округ|этрап|коммуна|'
    r'муниципалитет|район)\b[^,;]*', re.I)


def candidates(rec):
    """Варианты запроса для записи, у которой ничего не нашлось.

    Кириллическая транслитерация чужих топонимов («Бобиньи, департамент
    Сен-Сен-Дени») в Nominatim не ищется — зато в скобках часто стоит
    оригинальное написание («Нкайи (Nkayi)»), и оно ищется отлично.
    """
    city = rec['city'] or ''
    country = re.split(r'[/(]', src_country(rec))[0].strip()
    out = []

    for m in re.findall(r'\(([^)]+)\)', city):          # оригинал в скобках
        if re.search(r'[A-Za-zÀ-ɏ]', m):
            out.append(m.strip())
    head = QUALIFIER.sub('', re.sub(r'\([^)]*\)', '', city)).strip(' ,;-–—')
    head = re.split(r'[,;]', head)[0].strip()
    if head:
        out.append('%s, %s' % (head, country) if country else head)
        out.append(head)
    if rec['name_orig'] and head:
        out.append('%s, %s' % (rec['name_orig'].strip(' «»"'), head))
    seen, uniq = set(), []
    for q in out:
        if len(q) > 2 and q not in seen:
            seen.add(q)
            uniq.append(q)
    return uniq[:3]


def fetch_nominatim(queries):
    cache = load('nominatim.json', {})
    todo = [q for q in queries if q and q not in cache]
    print('  nominatim: %d новых запросов (~%d мин)' % (len(todo), math.ceil(len(todo) / 60)))
    for n, q in enumerate(todo, 1):
        url = '%s?%s' % (NOMINATIM, urllib.parse.urlencode(
            {'q': q, 'format': 'json', 'limit': 1, 'accept-language': 'ru'}))
        res = http(url, tries=2)
        cache[q] = [float(res[0]['lat']), float(res[0]['lon'])] if res else None
        if n % 25 == 0:
            print('   %d/%d' % (n, len(todo)))
            save('nominatim.json', cache)
        time.sleep(1.1)                       # политика OSM: не чаще 1 запроса/сек
    save('nominatim.json', cache)
    return cache


# ---------------------------------------------------------------- сборка

# ---------------------------------------------------------------- проверка

# Nominatim по голому названию города иногда отдаёт тёзку на другом континенте
# («Кьюзи» в Италии → село в Удмуртии). Проверяем офлайн по границам стран
# Natural Earth: точка обязана лежать в своей стране (с допуском на упрощение
# контуров 110m и приграничные случаи).
COUNTRY_ALIAS = {
    'Беларусь': 'Белоруссия',
    'Кыргызстан': 'Киргизия',
    'Туркменистан': 'Туркмения',
    'Китай': 'Китайская Народная Республика',
    'Англия': 'Великобритания',
    'Приднестровская Молдавская Республика': 'Молдавия',
    'Абхазия': 'Грузия',
}
TOLERANCE_DEG = 1.2


def country_key(raw):
    # заморские территории в Natural Earth 110m отсутствуют (Реюньон, Мартиника…),
    # проверять их по контуру метрополии нельзя — пропускаем
    if re.search(r'заморск|Реюньон|Мартиник|Гваделуп|Майотт|Гвиан', raw or '', re.I):
        return None
    name = re.sub(r'\(.*?\)', '', raw or '')
    name = re.split(r'[/,]', name)[0].strip()
    return COUNTRY_ALIAS.get(name, name)


def load_borders():
    """→ {название страны: [(bbox, [кольца])]}"""
    with open(BORDERS, encoding='utf-8') as f:
        geo = json.load(f)
    out = {}
    for feat in geo['features']:
        name = feat['properties'].get('NAME_RU')
        if not name:
            continue
        geom = feat['geometry']
        polys = ([geom['coordinates']] if geom['type'] == 'Polygon'
                 else geom['coordinates'] if geom['type'] == 'MultiPolygon' else [])
        shapes = []
        for poly in polys:
            outer = poly[0]
            xs = [p[0] for p in outer]
            ys = [p[1] for p in outer]
            shapes.append(((min(xs), min(ys), max(xs), max(ys)), poly))
        if shapes:
            out.setdefault(name, []).extend(shapes)
    return out


def in_ring(lng, lat, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > lat) != (y2 > lat):
            xx = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if xx > lng:
                inside = not inside
    return inside


def fits_country(lat, lng, shapes, tol=TOLERANCE_DEG):
    for (minx, miny, maxx, maxy), poly in shapes:
        if not (minx - tol <= lng <= maxx + tol and miny - tol <= lat <= maxy + tol):
            continue
        if in_ring(lng, lat, poly[0]):
            if any(in_ring(lng, lat, hole) for hole in poly[1:]):
                continue
            return True
        # допуск: рядом с границей — контуры 110m срезают острова (Сааремаа)
        # и мелкие выступы (Нарва), точность тут не нужна, нужен отлов тёзок
        return True
    return False


def haversine_len(geom):
    """Длина ломаной в метрах."""
    tot = 0.0
    for (a_lat, a_lng), (b_lat, b_lng) in zip(geom, geom[1:]):
        p1, p2 = math.radians(a_lat), math.radians(b_lat)
        dp, dl = p2 - p1, math.radians(b_lng - a_lng)
        h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        tot += 6371000 * 2 * math.asin(min(1, math.sqrt(h)))
    return tot


def main():
    with open(CORPUS, encoding='utf-8') as f:
        data = json.load(f)
    records = data['records']

    print('1/3 OSM-объекты')
    osm = fetch_osm(records)
    print('2/3 Википедия')
    wiki = fetch_wiki(records)

    # что осталось — в Nominatim
    rest = []
    for r in records:
        key = '%s/%s' % (r['osm']['type'], r['osm']['id']) if r['osm'] else None
        if key and osm.get(key):
            continue
        if any(wiki.get('%s|%s' % (h, t)) for h, t in wiki_targets(r['link'])):
            continue
        rest.append(place_query(r))
    print('3/3 Nominatim')
    nomi = fetch_nominatim(sorted({q for q in rest if q}))

    # раскладываем координаты по записям
    streets, stats = [], {'osm': 0, 'wiki': 0, 'nominatim': 0, 'none': 0}
    for r in records:
        lat = lng = src = None
        key = '%s/%s' % (r['osm']['type'], r['osm']['id']) if r['osm'] else None
        if key and osm.get(key):
            o = osm[key]
            lat, lng, src = o['lat'], o['lng'], 'osm'
            if o['geometry'] and len(o['geometry']) > 1:
                streets.append({
                    'id': r['id'], 'name': r['name'], 'name_orig': r['name_orig'],
                    'city': r['city'], 'country': r['country'], 'continent': r['continent'],
                    'kind': r['kind'], 'osm': r['osm'],
                    'length_m': round(haversine_len(o['geometry'])),
                    'geometry': [[round(a, 6), round(b, 6)] for a, b in o['geometry']],
                })
        if lat is None:
            for h, t in wiki_targets(r['link']):
                c = wiki.get('%s|%s' % (h, t))
                if c:
                    lat, lng, src = c[0], c[1], 'wiki'
                    break
        if lat is None:
            c = nomi.get(place_query(r))
            if c:
                lat, lng, src = c[0], c[1], 'nominatim'
        r['lat'] = round(lat, 5) if lat is not None else None
        r['lng'] = round(lng, 5) if lng is not None else None
        r['geo_src'] = src
        stats[src or 'none'] += 1

    # добор: для оставшихся пробуем другие формулировки запроса
    need = [r for r in records if r['lat'] is None]
    if need:
        print('добор: %d записей без координат' % len(need))
        cand = {r['id']: candidates(r) for r in need}
        nomi2 = fetch_nominatim(sorted({q for qs in cand.values() for q in qs}))
        for r in need:
            for q in cand[r['id']]:
                c = nomi2.get(q)
                if c:
                    r['lat'], r['lng'] = round(c[0], 5), round(c[1], 5)
                    r['geo_src'] = 'nominatim-alt'
                    stats['none'] -= 1
                    stats['nominatim-alt'] = stats.get('nominatim-alt', 0) + 1
                    break

    # проверка попадания в свою страну — снимаем координаты у промахов
    borders = load_borders()
    dropped = []
    for r in records:
        if r['lat'] is None or r['geo_src'] == 'osm':
            continue          # OSM-объект взят по id, проверять нечего
        key = country_key(src_country(r))
        shapes = borders.get(key) if key else None
        if not shapes:
            continue          # страны нет в Natural Earth — проверить нечем
        if not fits_country(r['lat'], r['lng'], shapes):
            dropped.append('%s / %s → %.2f,%.2f (%s)'
                           % (src_country(r), r['city'][:28], r['lat'], r['lng'], r['geo_src']))
            stats[r['geo_src']] -= 1
            stats['none'] += 1
            r['lat'] = r['lng'] = r['geo_src'] = None
    if dropped:
        print('снято координат (точка вне своей страны): %d' % len(dropped))
        for d in dropped:
            print('   ' + d)

    data['geo'] = {'stats': stats,
                   'note': 'координаты запечены офлайн, см. tools/geocode.py; '
                           'каждая точка проверена на попадание в свою страну '
                           '(Natural Earth 110m, допуск 1.2°)'}
    with open(CORPUS, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    streets.sort(key=lambda s: -s['length_m'])
    with open(STREETS, 'w', encoding='utf-8') as f:
        json.dump({'mtk': 39, 'title': 'Геометрия улиц Ленина (OpenStreetMap)',
                   'license': 'ODbL, © OpenStreetMap contributors',
                   'total_length_m': sum(s['length_m'] for s in streets),
                   'items': streets}, f, ensure_ascii=False)

    print('\nкоординаты: %s' % stats)
    print('геометрий улиц: %d, суммарно %.1f км'
          % (len(streets), sum(s['length_m'] for s in streets) / 1000))


if __name__ == '__main__':
    main()
