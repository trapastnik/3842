#!/usr/bin/env python3
"""Fetch Lenin-monument photos from Wikimedia Commons into per-monument folders."""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

UA = "MTK41-research/1.0 (https://museum-lenin.example; dimitri@dvn.spb.ru)"
HEADERS = {"User-Agent": UA}


def api(host, params):
    qs = urllib.parse.urlencode(params)
    url = f"https://{host}/w/api.php?{qs}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def commons_search_files(query, limit=10):
    """Search Commons File: namespace for query, return list of file titles."""
    d = api("commons.wikimedia.org", {
        "action": "query", "list": "search",
        "srsearch": query, "srnamespace": 6,
        "srlimit": limit, "format": "json",
    })
    return [r["title"] for r in d.get("query", {}).get("search", [])]


def commons_category_files(category, limit=50):
    """List files in a Commons category."""
    d = api("commons.wikimedia.org", {
        "action": "query", "list": "categorymembers",
        "cmtitle": category, "cmtype": "file",
        "cmlimit": limit, "format": "json",
    })
    return [m["title"] for m in d.get("query", {}).get("categorymembers", [])]


def commons_file_info(file_title):
    """Get URL + license metadata for a Commons file."""
    d = api("commons.wikimedia.org", {
        "action": "query", "titles": file_title,
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata|user",
        "iiurlwidth": 1600,
        "format": "json",
    })
    pages = d.get("query", {}).get("pages", {})
    for _, page in pages.items():
        ii = page.get("imageinfo")
        if ii:
            info = ii[0]
            meta = info.get("extmetadata", {}) or {}
            return {
                "title": file_title,
                "url": info.get("url"),
                "thumburl": info.get("thumburl"),
                "width": info.get("width"),
                "height": info.get("height"),
                "mime": info.get("mime"),
                "license": (meta.get("LicenseShortName") or {}).get("value", ""),
                "license_url": (meta.get("LicenseUrl") or {}).get("value", ""),
                "artist": (meta.get("Artist") or {}).get("value", ""),
                "credit": (meta.get("Credit") or {}).get("value", ""),
                "description": (meta.get("ImageDescription") or {}).get("value", ""),
            }
    return None


def download(url, out_path):
    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        return False
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    with open(out_path, "wb") as f:
        f.write(data)
    return True


# Per-monument config: search queries and direct Commons categories.
# Each monument has (folder, [queries], [categories]).
MONUMENTS = [
    ("alekseev-1919-bust", "Alekseev 1919 bust of Lenin / Первое скульптурное изображение Ленина",
     ["Алексеев бюст Ленина 1919", "Alekseev Lenin bust"],
     ["Category:Sculptures by Georgy Alekseev"]),
    ("leningrad-1920s", "Ленин в Ленинграде / Петрограде, 1920-е",
     ["Lenin monument Petrograd 1920s", "Памятник Ленину Ленинград"],
     ["Category:Lenin monuments in Saint Petersburg"]),
    ("kaluga-1920s", "Памятник Ленину в Калуге, 1920-е",
     ["Lenin monument Kaluga"],
     ["Category:Lenin monuments in Kaluga"]),
    ("yaroslavl-1920s", "Памятник Ленину в Ярославле (Красная пл., 1920-е)",
     ["Lenin monument Yaroslavl Red Square"],
     ["Category:Lenin monuments in Yaroslavl", "Category:Lenin Monument (Yaroslavl)"]),
    ("vladivostok-1920s", "Памятник Ленину во Владивостоке",
     ["Lenin monument Vladivostok"],
     ["Category:Lenin monument in Vladivostok"]),
    ("ufa-1924-larionov", "Памятник Ленину в Уфе, Д.Н. Ларионов 1924",
     ["Lenin monument Ufa Larionov", "Памятник Ленину сквер Ленина Уфа"],
     ["Category:Lenin monuments in Ufa"]),
    ("moscow-oktyabrskaya-1925", "Памятник Ленину на станции Москва-Октябрьская, 1925",
     ["Lenin monument Moscow Oktyabrskaya station 1925"],
     ["Category:Lenin monuments in Moscow"]),
    ("nizhny-tagil-1925", "Памятник Ленину в Нижнем Тагиле, 1925",
     ["Lenin monument Nizhny Tagil"],
     ["Category:Lenin monuments in Nizhny Tagil", "Category:Lenin Monument (Nizhny Tagil)"]),
    ("chelyabinsk-aloe-pole-1925", "Памятник-мавзолей Ленину, Алое поле, Челябинск, 1925",
     ["Lenin mausoleum Chelyabinsk Aloye Pole", "Памятник-мавзолей Ленину Челябинск"],
     ["Category:Lenin Monument (Chelyabinsk)", "Category:Lenin monuments in Chelyabinsk"]),
    ("voznesenye-1925-capital-bust", "Бюст Ленина на трёх томах Капитала, Вознесенье, 1925",
     ["Lenin bust Capital three volumes Voznesenye"],
     []),
    ("kostroma-1928", "Памятник Ленину в Костроме, 1928 (на постаменте Романовых)",
     ["Lenin monument Kostroma", "Памятник Ленину Кострома"],
     ["Category:Lenin Monument (Kostroma)", "Category:Lenin monuments in Kostroma"]),
    ("moscow-canal-1937-merkurov", "Памятник Ленину у входа в канал им. Москвы (Дубна), Меркуров 1937",
     ["Lenin monument Dubna Moscow Canal Merkurov"],
     ["Category:Lenin Monument (Dubna)", "Category:Monument to Lenin at the entrance to the Moscow Canal"]),
    ("gorki-pinchuk-taurit", "«Ленин и Сталин в Горках», Пинчук, Таурит",
     ["Lenin Stalin Gorki Pinchuk Taurit"],
     ["Category:Sculptures by Veniamin Pinchuk", "Category:Gorki Leninskiye"]),
    ("kazan-1954-young-volodya", "Памятник молодому Володе Ульянову, Казань, 1954",
     ["Monument to young Volodya Ulyanov Kazan", "Памятник студенту Володе Ульянову Казань"],
     ["Category:Monument to Vladimir Ulyanov-Lenin as a student (Kazan)", "Category:Lenin monuments in Kazan"]),
    ("rybinsk-1957-askar-saryja", "Памятник Ленину на Красной площади в Рыбинске, Аскар-Сарыджа 1957",
     ["Lenin monument Rybinsk Red Square Askar-Sarydzha"],
     ["Category:Lenin Monument (Rybinsk)", "Category:Lenin monuments in Rybinsk"]),
    ("merkurov-1958-funeral", "«Похороны вождя» / «Смерть вождя», Меркуров, 1958",
     ["Death of the Leader Merkurov sculpture", "Смерть вождя Меркуров"],
     ["Category:Sculptures by Sergey Merkurov"]),
    ("ulan-ude-1970-zilberman", "Голова Ленина в Улан-Удэ, 1971, Нерода/Зильберман",
     ["Lenin head Ulan-Ude", "Памятник Ленину Улан-Удэ голова"],
     ["Category:Lenin Monument (Ulan-Ude)", "Category:Lenin monuments in Ulan-Ude"]),
    ("volgograd-1973-vuchetich", "Памятник Ленину у входа в Волго-Донской канал, Вучетич 1973",
     ["Lenin monument Volgograd Volga-Don Canal Vuchetich"],
     ["Category:Lenin Monument (Volgograd, Krasnoarmeysky District)", "Category:Lenin monuments in Volgograd"]),
]


def collect_for(folder, queries, categories, max_files=6):
    """Find unique candidate files for a monument."""
    titles = []
    seen = set()
    for cat in categories:
        try:
            for t in commons_category_files(cat, limit=50):
                if t not in seen:
                    titles.append(("category:" + cat, t))
                    seen.add(t)
        except Exception as e:
            print(f"  ! category {cat}: {e}", file=sys.stderr)
        time.sleep(0.3)
    for q in queries:
        try:
            for t in commons_search_files(q, limit=10):
                if t not in seen:
                    titles.append(("search:" + q, t))
                    seen.add(t)
        except Exception as e:
            print(f"  ! search {q}: {e}", file=sys.stderr)
        time.sleep(0.3)
    return titles[:max_files * 3]  # over-fetch, we'll filter by file type


def is_photo(file_title):
    fn = file_title.lower()
    if not (fn.endswith(".jpg") or fn.endswith(".jpeg") or fn.endswith(".png")):
        return False
    # Skip stamps, diagrams, maps
    bad = ["stamp", "map of", "plan of", "diagram", "schema", "coat of arms", "shema"]
    return not any(b in fn for b in bad)


def process_one(folder, label, queries, categories, max_keep=4):
    print(f"\n=== {folder} — {label}")
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), folder)
    photos_dir = os.path.join(out_dir, "photos")
    os.makedirs(photos_dir, exist_ok=True)

    candidates = collect_for(folder, queries, categories)
    print(f"  candidates: {len(candidates)}")

    kept = []
    for source, title in candidates:
        if len(kept) >= max_keep:
            break
        if not is_photo(title):
            continue
        try:
            info = commons_file_info(title)
        except Exception as e:
            print(f"  ! info {title}: {e}", file=sys.stderr)
            continue
        if not info or not info.get("thumburl"):
            continue
        # Skip if dimensions too small
        if (info.get("width") or 0) < 600:
            continue
        # Download
        safe = title.replace("File:", "").replace("/", "_")
        ext = os.path.splitext(safe)[1].lower() or ".jpg"
        local = os.path.join(photos_dir, f"{len(kept)+1:02d}_{safe}")
        try:
            download(info["thumburl"], local)
        except Exception as e:
            print(f"  ! download {title}: {e}", file=sys.stderr)
            continue
        info["source_method"] = source
        info["local_path"] = os.path.relpath(local, out_dir)
        kept.append(info)
        print(f"  + {title}  [{info.get('license')}]")
        time.sleep(0.3)

    # Write photos.md catalog
    md_path = os.path.join(out_dir, "photos.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(f"# Фотографии — {label}\n\n")
        f.write(f"Папка: `{folder}/photos/`. Источник: Wikimedia Commons.\n\n")
        if not kept:
            f.write("**Ничего не найдено.** Возможно: памятник снесён, неизвестен, нет публичных фото.\n")
            f.write("Попробовать: поиск по ru.wikipedia.org вручную, открытые архивы Sovfoto/РИА Новости (платно).\n")
        else:
            for k in kept:
                f.write(f"## {k['title']}\n\n")
                f.write(f"- Файл: `{k['local_path']}`\n")
                f.write(f"- Размер: {k.get('width')}×{k.get('height')}\n")
                f.write(f"- Лицензия: **{k.get('license') or 'не указана'}**")
                if k.get('license_url'):
                    f.write(f" — {k['license_url']}")
                f.write("\n")
                if k.get('artist'):
                    f.write(f"- Автор: {k['artist'][:300]}\n")
                f.write(f"- Найдено через: {k['source_method']}\n")
                f.write(f"- Оригинал: https://commons.wikimedia.org/wiki/{urllib.parse.quote(k['title'].replace(' ', '_'))}\n\n")
    return kept


if __name__ == "__main__":
    only = sys.argv[1] if len(sys.argv) > 1 else None
    summary = []
    for folder, label, queries, categories in MONUMENTS:
        if only and folder != only:
            continue
        try:
            kept = process_one(folder, label, queries, categories)
        except Exception as e:
            print(f"!! {folder}: {e}", file=sys.stderr)
            kept = []
        summary.append((folder, label, len(kept)))
    print("\n=== Summary ===")
    for folder, label, n in summary:
        print(f"  {n}  {folder}  ({label[:60]})")
