#!/usr/bin/env python3
"""Search Sketchfab API for 3D models matching each monument.
Writes per-monument models.md with results.

Sketchfab API supports anonymous search; downloads require OAuth, so we only
collect URLs + license + downloadable flag.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

UA = "MTK41-research/1.0 (contact: dimitri@dvn.spb.ru)"
HEADERS = {"User-Agent": UA}


def sketchfab_search(query, limit=12):
    """Search Sketchfab. Returns list of model dicts."""
    qs = urllib.parse.urlencode({
        "q": query, "type": "models", "count": limit,
        "sort_by": "-likeCount",
    })
    url = f"https://api.sketchfab.com/v3/search?{qs}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
    except Exception as e:
        print(f"  ! sketchfab '{query}': {e}", file=sys.stderr)
        return []
    out = []
    for m in data.get("results", []) or []:
        out.append({
            "name": m.get("name", ""),
            "uid": m.get("uid", ""),
            "viewerUrl": m.get("viewerUrl", ""),
            "license": (m.get("license") or {}).get("label", "") if m.get("license") else "",
            "isDownloadable": m.get("isDownloadable", False),
            "user": (m.get("user") or {}).get("displayName", ""),
            "description": (m.get("description") or "")[:300],
            "tags": [t.get("name") for t in (m.get("tags") or [])][:8],
            "vertexCount": m.get("vertexCount", 0),
            "faceCount": m.get("faceCount", 0),
        })
    return out


# (folder, label, search queries)
MONUMENTS = [
    ("alekseev-1919-bust", "Алексеев — первый бюст Ленина, 1919", ["lenin bust 1919", "Lenin Alekseev bust"]),
    ("leningrad-1920s", "Памятники Ленину в Ленинграде, 1920-е", ["Lenin Saint Petersburg monument", "Lenin Petrograd statue"]),
    ("kaluga-1920s", "Памятник Ленину в Калуге, 1920-е", ["Lenin Kaluga"]),
    ("yaroslavl-1920s", "Памятник Ленину в Ярославле, 1920-е", ["Lenin Yaroslavl monument"]),
    ("vladivostok-1920s", "Памятник Ленину во Владивостоке", ["Lenin Vladivostok statue"]),
    ("ufa-1924-larionov", "Памятник Ленину в Уфе, 1924, Ларионов", ["Lenin Ufa monument"]),
    ("moscow-oktyabrskaya-1925", "Памятник Ленину на ст. Москва-Октябрьская, 1925", ["Lenin Moscow Oktyabrskaya railway"]),
    ("nizhny-tagil-1925", "Памятник Ленину в Нижнем Тагиле, 1925", ["Lenin Nizhny Tagil"]),
    ("chelyabinsk-aloe-pole-1925", "Памятник-мавзолей, Алое поле, Челябинск", ["Lenin Chelyabinsk mausoleum", "Lenin Aloye Pole"]),
    ("voznesenye-1925-capital-bust", "Бюст Ленина на «Капитале», Вознесенье", ["Lenin Capital Marx bust"]),
    ("kostroma-1928", "Памятник Ленину в Костроме, 1928", ["Lenin Kostroma monument", "Romanov pedestal Kostroma"]),
    ("moscow-canal-1937-merkurov", "Памятник Ленину у канала им. Москвы, Дубна, Меркуров", ["Lenin Dubna Moscow Canal", "Lenin Merkurov monument"]),
    ("gorki-pinchuk-taurit", "«Ленин и Сталин в Горках»", ["Lenin Stalin Gorki", "Lenin Stalin sculpture"]),
    ("kazan-1954-young-volodya", "Памятник молодому Володе Ульянову, Казань", ["young Lenin Kazan", "Volodya Ulyanov Kazan student"]),
    ("rybinsk-1957-askar-saryja", "Памятник Ленину в Рыбинске, 1957", ["Lenin Rybinsk monument"]),
    ("merkurov-1958-funeral", "«Смерть вождя», Меркуров", ["Death of the Leader Merkurov", "Lenin Merkurov funeral"]),
    ("ulan-ude-1970-zilberman", "Голова Ленина в Улан-Удэ", ["Lenin head Ulan-Ude", "Lenin Buryatia monument"]),
    ("volgograd-1973-vuchetich", "Памятник Ленину на Волго-Донском канале, Вучетич", ["Lenin Volgograd Vuchetich", "Lenin Volga-Don canal"]),
]


def filter_relevant(model, monument_label):
    name = (model.get("name") or "").lower()
    desc = (model.get("description") or "").lower()
    text = name + " " + desc
    # Must mention Lenin or Ulyanov (or "Death of Leader" for Merkurov)
    lenin = any(t in text for t in [
        "lenin", "ленин", "ulyanov", "ульянов", "ilyich", "volodya",
        "death of the leader", "смерть вождя",
    ])
    return lenin


def search_for(folder, label, queries):
    print(f"\n=== {folder} — {label}")
    seen = set()
    all_models = []
    for q in queries:
        for m in sketchfab_search(q):
            uid = m.get("uid")
            if uid in seen:
                continue
            seen.add(uid)
            if filter_relevant(m, label):
                all_models.append((q, m))
        time.sleep(1)
    print(f"  found {len(all_models)} relevant models")
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), folder)
    os.makedirs(out_dir, exist_ok=True)
    md = os.path.join(out_dir, "models.md")
    with open(md, "w", encoding="utf-8") as f:
        f.write(f"# 3D-модели — {label}\n\n")
        f.write("Источник: поиск по Sketchfab API. Скачивание моделей с Sketchfab требует "
                "OAuth-аккаунта (бесплатный); здесь — только ссылки и лицензии.\n\n")
        if not all_models:
            f.write("**Подходящих публичных 3D-моделей не найдено.**\n\n")
            f.write("Возможные варианты:\n\n")
            f.write("- заказать фотограмметрию у местного автора (DJI Mini + RealityCapture/Polycam, ~5–20 тыс. ₽ за памятник)\n")
            f.write("- если есть открытый памятник на территории музея — снять самостоятельно\n")
            f.write("- использовать «макет-стилизацию» вместо точной модели (ниже стоимость, проще лицензия)\n")
        else:
            for q, m in all_models:
                f.write(f"## {m['name']}\n\n")
                f.write(f"- URL: {m['viewerUrl']}\n")
                f.write(f"- Лицензия: **{m.get('license') or 'не указана'}**\n")
                f.write(f"- Скачивается: {'да' if m.get('isDownloadable') else 'нет (только просмотр)'}\n")
                f.write(f"- Автор: {m.get('user') or '?'}\n")
                if m.get('vertexCount'):
                    f.write(f"- Вершин: {m['vertexCount']:,} / граней: {m.get('faceCount',0):,}\n")
                if m.get('tags'):
                    f.write(f"- Теги: {', '.join(m['tags'])}\n")
                f.write(f"- Найдено через: `{q}`\n")
                if m.get('description'):
                    f.write(f"- Описание: {m['description']}\n")
                f.write("\n")
    return all_models


if __name__ == "__main__":
    summary = []
    for folder, label, queries in MONUMENTS:
        try:
            models = search_for(folder, label, queries)
        except Exception as e:
            print(f"!! {folder}: {e}", file=sys.stderr)
            models = []
        summary.append((folder, len(models)))
    print("\n=== Sketchfab summary ===")
    for f, n in summary:
        print(f"  {n}  {f}")
