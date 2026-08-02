#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Изображения для «штучных» объектов МТК 39 (рубрика «В единственном экземпляре»).

Берём заглавную иллюстрацию статьи Википедии, но кладём только то, что лежит на
Викискладе под свободной лицензией: несвободные файлы (fair use, «добросовестное
использование») в экспозицию нельзя, и они пропускаются с пометкой в отчёте.

Выход:
  data/images/mtk39/one-off/<id>.jpg      — картинки, ширина до 1400 px
  data/images/mtk39/one-off/credits.json  — автор, лицензия, ссылка на файл

Запуск (из корня worktree, нужна сеть; повторный запуск не перекачивает то,
что уже лежит):
    python3 assets/mtk39/sources/tools/fetch_images.py
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
CORPUS = os.path.join(ROOT, 'data', 'mtk39-corpus.json')
OUTDIR = os.path.join(ROOT, 'data', 'images', 'mtk39', 'one-off')
CREDITS = os.path.join(OUTDIR, 'credits.json')

UA = 'BMK-3842-museum-prototype/1.0 (mtk39; dimitri@dvn.spb.ru)'
WIDTH = 1400

# та же выборка, что в рубрикаторе mtk39-catalog
ONE_OFF = re.compile(r'геоглиф|мавзолей|ленинланд|leninland|послание|сверхтяжёл|'
                     r'пик ленина|ледокол|астероид|владилена|ульянов \(|комсомол|пионер', re.I)
ONE_OFF_KINDS = ('космос', 'судно', 'природа', 'вода', 'награда')

WIKI_RE = re.compile(r'https?://([a-z]+)\.(wikipedia\.org|ruwiki\.ru)/wiki/([^\s]+)')

# лицензии, с которыми файл можно показывать в экспозиции
FREE = re.compile(r'^(cc|public domain|pd|gfdl|attribution)', re.I)


def http_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def wiki_title(link):
    m = WIKI_RE.search(link or '')
    if not m:
        return None
    title = urllib.parse.unquote(m.group(3).split('#')[0].split('?')[0]).replace('_', ' ')
    return title or None


def lead_image(title):
    """Имя файла заглавной иллюстрации статьи ru-википедии."""
    url = ('https://ru.wikipedia.org/w/api.php?action=query&prop=pageimages'
           '&piprop=name&format=json&formatversion=2&redirects=1&titles=%s'
           % urllib.parse.quote(title))
    pages = http_json(url).get('query', {}).get('pages', [])
    for p in pages:
        if p.get('pageimage'):
            return p['pageimage']
    return None


def commons_file(name):
    """Метаданные файла на Викискладе + ссылка на уменьшенную копию."""
    url = ('https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo'
           '&iiprop=url|extmetadata&iiurlwidth=%d&format=json&formatversion=2&titles=%s'
           % (WIDTH, urllib.parse.quote('File:' + name)))
    pages = http_json(url).get('query', {}).get('pages', [])
    for p in pages:
        if p.get('missing') or not p.get('imageinfo'):
            continue
        info = p['imageinfo'][0]
        meta = info.get('extmetadata', {})

        def field(key):
            v = meta.get(key, {}).get('value', '')
            return re.sub(r'<[^>]+>', '', v).strip()

        return {
            'file': p['title'],
            'thumb': info.get('thumburl') or info.get('url'),
            'page': info.get('descriptionurl'),
            'license': field('LicenseShortName') or field('License'),
            'author': field('Artist') or field('Credit'),
        }
    return None


def download(url, path):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, 'wb') as f:
        f.write(r.read())


def main():
    with open(CORPUS, encoding='utf-8') as f:
        records = json.load(f)['records']
    picked = [r for r in records
              if r['kind'] in ONE_OFF_KINDS or ONE_OFF.search(r['name'])]

    os.makedirs(OUTDIR, exist_ok=True)
    credits = {}
    if os.path.exists(CREDITS):
        with open(CREDITS, encoding='utf-8') as f:
            credits = json.load(f)

    got, skipped = 0, []
    for rec in picked:
        if rec['id'] in credits and os.path.exists(os.path.join(OUTDIR, rec['id'] + '.jpg')):
            got += 1
            continue

        title = wiki_title(rec['link'])
        if not title:
            skipped.append((rec['name'], 'нет ссылки на статью'))
            continue

        try:
            name = lead_image(title)
            time.sleep(0.3)
            if not name:
                skipped.append((rec['name'], 'в статье нет заглавной иллюстрации'))
                continue

            info = commons_file(name)
            time.sleep(0.3)
            if not info:
                skipped.append((rec['name'], 'файл не на Викискладе (вероятно несвободный)'))
                continue
            if not FREE.match(info['license'] or ''):
                skipped.append((rec['name'], 'лицензия «%s» — не для экспозиции' % info['license']))
                continue

            download(info['thumb'], os.path.join(OUTDIR, rec['id'] + '.jpg'))
            credits[rec['id']] = {
                'name': rec['name'],
                'file': info['file'],
                'author': info['author'],
                'license': info['license'],
                'source': info['page'],
            }
            got += 1
            print('  ✓ %s — %s' % (rec['name'][:44], info['license']))
            time.sleep(0.4)
        except Exception as e:                                    # noqa: BLE001
            skipped.append((rec['name'], 'ошибка: %s' % e))

    with open(CREDITS, 'w', encoding='utf-8') as f:
        json.dump(credits, f, ensure_ascii=False, indent=1)

    print('\nскачано: %d из %d' % (got, len(picked)))
    for name, why in skipped:
        print('  — %s: %s' % (name[:50], why), file=sys.stderr)


if __name__ == '__main__':
    main()
