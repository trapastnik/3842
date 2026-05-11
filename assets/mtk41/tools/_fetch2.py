#!/usr/bin/env python3
"""
Improved fetcher: uses Wikipedia article images as primary source, plus correct
Commons categories. Heavy throttling to avoid 429s.

Cleans target folder before downloading to avoid stale bad matches.
"""
import json
import os
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request

UA = "MTK41-research/1.0 (contact: dimitri@dvn.spb.ru)"
HEADERS = {"User-Agent": UA}
THROTTLE = 1.2  # seconds between API calls


def api_get(host, params, retries=3):
    qs = urllib.parse.urlencode(params)
    url = f"https://{host}/w/api.php?{qs}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            time.sleep(THROTTLE)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 10 * (attempt + 1)
                print(f"  ! 429, waiting {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError(f"API failed: {url}")


def wp_images(article_title, lang="ru"):
    """Get all image filenames embedded in a Wikipedia article."""
    d = api_get(f"{lang}.wikipedia.org", {
        "action": "query", "titles": article_title,
        "prop": "images", "imlimit": 50, "format": "json",
    })
    out = []
    for _, page in d.get("query", {}).get("pages", {}).items():
        for im in page.get("images", []):
            out.append(im["title"])
    return out


def commons_category(category):
    d = api_get("commons.wikimedia.org", {
        "action": "query", "list": "categorymembers",
        "cmtitle": category, "cmtype": "file",
        "cmlimit": 50, "format": "json",
    })
    return [m["title"] for m in d.get("query", {}).get("categorymembers", [])]


def commons_search(query, limit=10):
    d = api_get("commons.wikimedia.org", {
        "action": "query", "list": "search",
        "srsearch": query, "srnamespace": 6,
        "srlimit": limit, "format": "json",
    })
    return [r["title"] for r in d.get("query", {}).get("search", [])]


def _parse_info(d, host):
    for _, page in d.get("query", {}).get("pages", {}).items():
        if "missing" in page:
            return None
        ii = page.get("imageinfo")
        if ii:
            info = ii[0]
            meta = info.get("extmetadata", {}) or {}
            return {
                "host": host,
                "url": info.get("url"),
                "thumburl": info.get("thumburl") or info.get("url"),
                "width": info.get("width"),
                "height": info.get("height"),
                "mime": info.get("mime"),
                "license": (meta.get("LicenseShortName") or {}).get("value", ""),
                "license_url": re.sub(r"<[^>]+>", "", (meta.get("LicenseUrl") or {}).get("value", "")).strip(),
                "artist": re.sub(r"<[^>]+>", "", (meta.get("Artist") or {}).get("value", ""))[:300],
                "description": re.sub(r"<[^>]+>", "", (meta.get("ImageDescription") or {}).get("value", ""))[:400],
                "description_url": info.get("descriptionurl") or "",
            }
    return None


def file_info(file_title):
    """Look up file on Commons first, then ru.wikipedia (some files are local)."""
    for host in ("commons.wikimedia.org", "ru.wikipedia.org"):
        try:
            d = api_get(host, {
                "action": "query", "titles": file_title,
                "prop": "imageinfo",
                "iiprop": "url|size|mime|extmetadata",
                "iiurlwidth": 1600, "format": "json",
            })
        except Exception:
            continue
        info = _parse_info(d, host)
        if info:
            info["title"] = file_title
            return info
    return None


def download(url, out_path):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    with open(out_path, "wb") as f:
        f.write(data)


# (folder, label, [wp_articles], [commons_categories], [commons_searches])
# WP article images are tried first — most accurate.
MONUMENTS = [
    ("alekseev-1919-bust",
     "Алексеев Г.Д. — первый прижизненный бюст Ленина, 1919",
     ["Алексеев, Георгий Дмитриевич"],
     ["Category:Georgiy Alekseev"],
     ['"Алексеев" Ленин бюст 1919']),

    ("leningrad-1920s",
     "Памятники Ленину в Ленинграде, 1920-е",
     ["Памятник Ленину у Финляндского вокзала", "Памятник Ленину у Смольного"],
     ["Category:Lenin Monument near the Finland Station",
      "Category:Lenin monument near the Smolny",
      "Category:Statues of Lenin in Saint Petersburg"],
     []),

    ("kaluga-1920s",
     "Памятник Ленину в Калуге (город), 1920-е",
     ["Памятник Ленину (Калуга)"],
     ["Category:Statues of Lenin in Kaluga", "Category:Lenin Monument (Kaluga)"],
     ["Памятник Ленину Калуга площадь Старый Торг"]),

    ("yaroslavl-1920s",
     "Памятник Ленину в Ярославле (Красная пл.), 1920-е",
     ["Памятник Ленину (Ярославль, Красная площадь)"],
     ["Category:Lenin Monument on Red Square (Yaroslavl)",
      "Category:Statues of Lenin in Yaroslavl"],
     ["Памятник Ленину Ярославль Красная площадь"]),

    ("vladivostok-1920s",
     "Памятник Ленину во Владивостоке",
     ["Памятник Ленину (Владивосток)"],
     ["Category:Lenin Monument (Vladivostok)",
      "Category:Statue of Lenin in Vladivostok"],
     ["Памятник Ленину Владивосток вокзал"]),

    ("ufa-1924-larionov",
     "Памятник Ленину в Уфе, Д.Н. Ларионов, 1924",
     ["Памятник Ленину (сквер Ленина, Уфа)"],
     ["Category:Lenin Monument (Ufa, Lenin Garden)",
      "Category:Statues of Lenin in Ufa"],
     ["Памятник Ленину Уфа Ларионов"]),

    ("moscow-oktyabrskaya-1925",
     "Памятник Ленину на станции Москва-Октябрьская, 1925",
     [],
     [],
     ["Памятник Ленину Москва-Октябрьская станция",
      "Lenin monument Moskva Oktyabrskaya railway"]),

    ("nizhny-tagil-1925",
     "Памятник Ленину в Нижнем Тагиле, 1925",
     ["Памятник Ленину (Нижний Тагил)"],
     ["Category:Lenin Monument (Nizhny Tagil)",
      "Category:Statues of Lenin in Nizhny Tagil"],
     []),

    ("chelyabinsk-aloe-pole-1925",
     "Памятник-мавзолей Ленину, Алое поле, Челябинск, 1925",
     ["Памятник-мавзолей В. И. Ленину (Челябинск)"],
     ["Category:Lenin Monument (Chelyabinsk, Aloye Pole)",
      "Category:Lenin Mausoleum (Chelyabinsk)"],
     ["Памятник-мавзолей Ленину Алое поле Челябинск"]),

    ("voznesenye-1925-capital-bust",
     "Бюст Ленина на томах «Капитала», Вознесенье (Лен. обл.), 1925",
     [],
     [],
     ["Бюст Ленина Капитал Вознесенье",
      "Lenin bust Capital Voznesenye"]),

    ("kostroma-1928",
     "Памятник Ленину в Костроме, 1928 (на постаменте Романовых)",
     ["Памятник Ленину (Кострома)", "Памятник в честь 300-летия дома Романовых"],
     ["Category:Lenin Monument (Kostroma)",
      "Category:Statues of Lenin in Kostroma"],
     ["Памятник Ленину Кострома Сусанинская площадь"]),

    ("moscow-canal-1937-merkurov",
     "Памятник Ленину у входа в канал им. Москвы, Дубна, Меркуров, 1937",
     ["Памятник Ленину у входа в Канал имени Москвы"],
     ["Category:Statue of Lenin in Dubna"],
     []),

    ("gorki-pinchuk-taurit",
     "«Ленин и Сталин в Горках», Пинчук и Таурит",
     ["Пинчук, Вениамин Борисович", "Таурит, Роберт Карлович"],
     ["Category:Veniamin Pinchuk", "Category:Robert Taurit"],
     ['"Ленин и Сталин" Горки Пинчук Таурит']),

    ("kazan-1954-young-volodya",
     "Памятник молодому Володе Ульянову, Казань, 1954",
     ["Памятник студенту Володе Ульянову (Казань)"],
     ["Category:Monument to Vladimir Ulyanov-Lenin as a student (Kazan)"],
     []),

    ("rybinsk-1957-askar-saryja",
     "Памятник Ленину на Красной пл. в Рыбинске, Аскар-Сарыджа, 1957",
     ["Памятники Рыбинска"],
     ["Category:Lenin Monument (Rybinsk)", "Category:Statues of Lenin in Rybinsk"],
     ["Памятник Ленину Рыбинск Красная площадь",
      "Lenin monument Rybinsk Red Square"]),

    ("merkurov-1958-funeral",
     "«Похороны вождя» / «Смерть вождя», Меркуров, 1958",
     ["Смерть вождя"],
     [],
     ["Смерть вождя Меркуров", "Death of the Leader Merkurov"]),

    ("ulan-ude-1970-zilberman",
     "Голова Ленина на пл. Советов в Улан-Удэ, 1971",
     ["Памятник Ленину (Улан-Удэ)"],
     ["Category:Lenin's Head (Ulan-Ude)",
      "Category:Statues of Lenin in Ulan-Ude",
      "Category:Lenin Monument (Ulan-Ude)"],
     ["Памятник Ленину Улан-Удэ голова площадь Советов"]),

    ("volgograd-1973-vuchetich",
     "Памятник Ленину у входа в Волго-Донской канал, Вучетич, 1973",
     ["Памятник Ленину у входа в Волго-Донской канал"],
     ["Category:Monument to Lenin at the entrance of the Volga-Don canal",
      "Category:Statue of Lenin in Volgograd",
      "Category:Lenin Monument (Volgograd, Krasnoarmeysky District)"],
     ["Памятник Ленину Волго-Донской канал Вучетич",
      "Lenin monument Volgograd Volga-Don canal"]),
]


SKIP_PATTERNS = [
    "stamp", "map of", "plan of", "diagram", "schema", "coat of arms",
    "shema.", ".svg", ".pdf", ".webm", ".ogg", ".gif",
    # generic non-monument
    "telephone exchange", "metro logo",
]

# Tokens that suggest the photo is actually the right monument (for ambiguity-prone cases)
RELEVANCE = {
    "kaluga-1920s": ["калуг", "kaluga"],
    "leningrad-1920s": ["петроград", "ленинград", "finland station", "smolny", "финляндск", "смольн"],
    "yaroslavl-1920s": ["ярослав", "yaroslavl"],
    "kostroma-1928": ["костром", "kostroma"],
    "vladivostok-1920s": ["владивосток", "vladivostok"],
    "ufa-1924-larionov": ["уф", " ufa", "уфе"],
    "nizhny-tagil-1925": ["тагил", "tagil"],
    "rybinsk-1957-askar-saryja": ["рыбин", "rybinsk"],
    "chelyabinsk-aloe-pole-1925": ["челяб", "алое поле", "chelyab", "aloye", "aloe pole"],
    "kazan-1954-young-volodya": ["казан", "kazan", "володя", "ульянов", "ulyanov", "student"],
    "ulan-ude-1970-zilberman": ["улан-удэ", "ulan-ude", "ulan ude", "burjat", "бурят"],
    "volgograd-1973-vuchetich": ["волгоград", "volgograd", "волго-дон", "volga-don"],
    "moscow-canal-1937-merkurov": ["дубн", "dubna", "канал имени москвы", "moscow canal"],
    "gorki-pinchuk-taurit": ["горк", "gorki", "пинчук", "pinchuk", "таурит", "taurit"],
    "merkurov-1958-funeral": ["меркур", "merkurov", "смерт", "death", "funeral", "вожд", "поликарпов"],
    "alekseev-1919-bust": ["алексеев", "alekseev", "alexeyev", "бюст", "bust"],
    "moscow-oktyabrskaya-1925": ["октябрьск", "oktyabr"],
    "voznesenye-1925-capital-bust": ["вознесень", "voznesen", "капитал", "capital"],
}


def is_photo(file_title):
    fn = file_title.lower()
    if not any(fn.endswith(e) for e in (".jpg", ".jpeg", ".png", ".tif", ".tiff")):
        return False
    return not any(b in fn for b in SKIP_PATTERNS)


LENIN_TOKENS = ["ленин", "lenin", "lénin", "ульянов", "ulyanov", "ulianov",
                 "володя", "volodya", "ильич", "ilyich", "ilich", "vladimir ilyich"]
# For these monuments, the photo can lack "Lenin" in the name (it's by alternate title).
ALLOW_LENIN_MISSING = {
    "merkurov-1958-funeral",  # called "Смерть вождя" / "Death of the Leader"
}


def is_relevant(folder, file_title, description, source):
    text = (file_title + " " + description).lower()
    # 1. Require some form of "Lenin" or alternate name in filename or description
    if folder not in ALLOW_LENIN_MISSING:
        if not any(t in text for t in LENIN_TOKENS):
            return False
    else:
        alt = ["смерт", "death", "вожд", "leader", "funeral", "поликарпов", "polikarpov", "меркуров", "merkurov"]
        if not any(t in text for t in alt):
            return False
    # 2. City/monument-specific relevance
    tokens = RELEVANCE.get(folder, [])
    if not tokens:
        return True
    # Trust wp/cat as long as Lenin keyword matched
    if source.startswith("cat:"):
        return True
    return any(t in text for t in tokens)


FAIR_USE_LICENSES = ("fair use", "non-free", "добросовестное использование",
                      "несвободное", "fairuse", "©")


def license_is_free(license_str):
    if not license_str:
        return False  # unknown → skip to be safe
    low = license_str.lower()
    return not any(b in low for b in FAIR_USE_LICENSES)


def normalize_file_title(t):
    """Wikipedia returns 'Файл:...' in Russian locale; Commons wants 'File:...'."""
    for prefix in ("Файл:", "Datei:", "Fichier:", "Archivo:"):
        if t.startswith(prefix):
            return "File:" + t[len(prefix):]
    return t


def process(folder, label, wp_titles, categories, searches, max_keep=4):
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), folder)
    photos_dir = os.path.join(out_dir, "photos")
    # Clean previous downloads
    if os.path.exists(photos_dir):
        for f in os.listdir(photos_dir):
            os.remove(os.path.join(photos_dir, f))
    os.makedirs(photos_dir, exist_ok=True)

    print(f"\n=== {folder} — {label}")
    candidates = []
    seen = set()

    def add(source, titles):
        for t in titles:
            t = normalize_file_title(t)
            if t not in seen and is_photo(t):
                candidates.append((source, t))
                seen.add(t)

    for wpt in wp_titles:
        try:
            add(f"wp:{wpt}", wp_images(wpt))
        except Exception as e:
            print(f"  ! wp '{wpt}': {e}", file=sys.stderr)

    for cat in categories:
        try:
            add(f"cat:{cat}", commons_category(cat))
        except Exception as e:
            print(f"  ! cat '{cat}': {e}", file=sys.stderr)

    for q in searches:
        try:
            add(f"search:{q}", commons_search(q))
        except Exception as e:
            print(f"  ! search '{q}': {e}", file=sys.stderr)

    print(f"  candidates: {len(candidates)}")

    kept = []
    for source, title in candidates:
        if len(kept) >= max_keep:
            break
        try:
            info = file_info(title)
        except Exception as e:
            print(f"  ! info '{title}': {e}", file=sys.stderr)
            continue
        if not info:
            continue
        if not is_relevant(folder, title, info.get("description", ""), source):
            continue
        if not license_is_free(info.get("license", "")):
            print(f"  - skip non-free [{info.get('license')}] {title}")
            continue
        if (info.get("width") or 0) < 600:
            continue
        if not info.get("thumburl"):
            continue
        local = os.path.join(photos_dir,
                             f"{len(kept)+1:02d}_" + title.replace("File:", "").replace("/", "_"))
        try:
            download(info["thumburl"], local)
        except Exception as e:
            print(f"  ! download '{title}': {e}", file=sys.stderr)
            continue
        info["source_method"] = source
        info["local_path"] = os.path.relpath(local, out_dir)
        kept.append(info)
        print(f"  + {title}  [{info.get('license') or '?'}]")
        time.sleep(0.5)

    # photos.md
    md = os.path.join(out_dir, "photos.md")
    with open(md, "w", encoding="utf-8") as f:
        f.write(f"# Фотографии — {label}\n\n")
        f.write(f"Папка: `{folder}/photos/`. Источник: Wikimedia Commons.\n\n")
        if not kept:
            f.write("**Ничего подходящего не найдено в свободных источниках.** "
                    "Скорее всего памятник снесён, неизвестен широко, либо фото только в платных архивах "
                    "(Sovfoto, РИА Новости, ТАСС). Возможные действия:\n\n"
                    "- ручной поиск в Государственном Историческом Архиве, Госкаталог.рф\n"
                    "- запрос в краеведческий музей соответствующего города\n"
                    "- использовать архивные открытки эпохи СССР (часто PD-RU)\n")
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
                    f.write(f"- Автор: {k['artist']}\n")
                if k.get('description'):
                    f.write(f"- Описание: {k['description']}\n")
                f.write(f"- Найдено через: {k['source_method']}\n")
                desc = k.get('description_url') or (
                    f"https://{k.get('host','commons.wikimedia.org')}/wiki/"
                    f"{urllib.parse.quote(k['title'].replace(' ', '_'))}"
                )
                f.write(f"- Оригинал: {desc}\n\n")
    return kept


if __name__ == "__main__":
    only = sys.argv[1] if len(sys.argv) > 1 else None
    summary = []
    for tup in MONUMENTS:
        folder = tup[0]
        if only and folder != only:
            continue
        try:
            kept = process(*tup)
        except Exception as e:
            print(f"!! {folder}: {e}", file=sys.stderr)
            kept = []
        summary.append((folder, len(kept)))
    print("\n=== Summary ===")
    for folder, n in summary:
        print(f"  {n}  {folder}")
