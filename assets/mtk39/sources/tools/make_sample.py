#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Выборка корпуса МТК 39 для сверки куратором.

Зачем: поля `status`, `year_named`, `year_renamed` не взяты из материалов готовыми —
они выведены из формулировок описаний («ныне», «бывш.», «в 1936–1991 годах
назывался»). Правила покрывают типовые обороты, но не все. Пока никто не сверил
выборку с исходным текстом, мы не знаем величину ошибки — а именно эти поля идут
на экран цифрами («61% переименовано») и цветом точки.

Что делает скрипт: берёт случайную, но воспроизводимую (seed фиксирован) выборку,
разложенную по клеткам «свод × статус», плюс отдельно записи с годами. К каждой
строке кладёт исходный текст описания — чтобы проверять, не открывая docx.

Выход: assets/mtk39/sources/verify-sample.csv (UTF-8 с BOM — Excel открывает
как надо, кириллица не ломается).

Запуск (из корня worktree):
    python3 assets/mtk39/sources/tools/make_sample.py
"""
import csv
import json
import os
import random

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
CORPUS = os.path.join(ROOT, 'data', 'mtk39-corpus.json')
OUT = os.path.join(ROOT, 'assets', 'mtk39', 'sources', 'verify-sample.csv')

SEED = 39                     # фиксируем: повторный запуск даёт ту же выборку
PER_CELL = 20                 # записей на клетку «свод × статус»
WITH_YEARS = 40               # плюс отдельная порция записей с годами

HEADER = [
    'id', 'свод', 'название', 'город', 'страна',
    'наш статус', 'год имени', 'год снятия',
    'исходное описание из материалов',
    'статус верен? (да/нет)', 'верный статус', 'годы верны? (да/нет)', 'комментарий',
]

SRC_LABEL = {'world': 'вне СССР', 'ussr': 'СССР'}


def main():
    with open(CORPUS, encoding='utf-8') as f:
        records = json.load(f)['records']

    rnd = random.Random(SEED)
    picked, seen = [], set()

    def take(pool, n, note):
        pool = [r for r in pool if r['id'] not in seen]
        rnd.shuffle(pool)
        for r in pool[:n]:
            seen.add(r['id'])
            picked.append((r, note))

    # клетки «свод × статус» — чтобы редкие сочетания не потерялись
    for src in ('world', 'ussr'):
        for status in ('носит имя', 'переименован', 'утрачен'):
            take([r for r in records if r['src'] == src and r['status'] == status],
                 PER_CELL, f'{SRC_LABEL[src]} / {status}')

    # отдельно — записи, у которых мы вывели годы
    take([r for r in records if r['year_named'] or r['year_renamed']],
         WITH_YEARS, 'проверка годов')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(HEADER)
        for r, note in picked:
            w.writerow([
                r['id'], note, r['name'], r['city'], r['country'],
                r['status'], r['year_named'] or '', r['year_renamed'] or '',
                r['desc'], '', '', '', '',
            ])

    print('строк в выборке: %d' % len(picked))
    print('→ %s' % OUT)


if __name__ == '__main__':
    main()
