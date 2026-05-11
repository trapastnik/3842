#!/usr/bin/env python3
"""Top-up extra Commons searches for under-represented monuments."""
import os, sys, time
sys.path.insert(0, os.path.dirname(__file__) or ".")
import _fetch2 as F


# (folder, additional_searches, additional_categories) — appended to existing photos
EXTRA = [
    ("volgograd-1973-vuchetich",
     ["Lenin Volga-Don canal Volgograd Vuchetich",
      "Памятник Ленину Волгоград Красноармейский",
      "Lenin Krasnoarmeysky Volgograd statue"],
     ["Category:Volga–Don Canal"]),
    ("kaluga-1920s",
     ["Памятник Ленину Калуга площадь Старый Торг",
      "Lenin statue Kaluga Russia",
      "Памятник Ленину город Калуга"],
     []),
    ("kostroma-1928",
     ["Памятник Ленину Сусанинская площадь Кострома",
      "Lenin monument Kostroma Susaninskaya",
      "Памятник Ленину Кострома центр"],
     []),
    ("nizhny-tagil-1925",
     ["Памятник Ленину Нижний Тагил Театральная",
      "Lenin Nizhny Tagil Teatralnaya",
      "Памятник Ленину Нижний Тагил театр"],
     []),
    ("alekseev-1919-bust",
     ["Алексеев Георгий Дмитриевич скульптор",
      "Alekseev sculptor 1919 Lenin"],
     []),
    ("vladivostok-1920s",
     ["Памятник Ленину Владивосток вокзал",
      "Lenin monument Vladivostok station"],
     []),
    ("voznesenye-1925-capital-bust",
     ["Бюст Ленина Капитал",
      "Lenin bust Capital three volumes",
      "Вознесенье посёлок"],
     []),
    ("moscow-oktyabrskaya-1925",
     ["Lenin Moscow Oktyabrskaya station 1925",
      "Памятник Ленину Москва-Октябрьская",
      "Памятник Ленину 1925 Москва станция"],
     []),
]


def topup(folder, searches, categories):
    """Append more photos without clearing existing."""
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), folder)
    photos_dir = os.path.join(out_dir, "photos")
    os.makedirs(photos_dir, exist_ok=True)

    # Read existing titles to avoid dupes
    existing = set()
    for f in os.listdir(photos_dir):
        # filename format: NN_File:Title.ext → extract "File:..." portion
        idx = f.find("_")
        if idx > 0:
            existing.add(f[idx+1:])

    print(f"\n=== TOPUP {folder} (have {len(existing)})")
    new_candidates = []
    seen = set()

    for cat in categories:
        try:
            for t in F.commons_category(cat):
                t = F.normalize_file_title(t)
                if t not in seen and F.is_photo(t):
                    new_candidates.append((f"cat:{cat}", t))
                    seen.add(t)
        except Exception as e:
            print(f"  ! cat {cat}: {e}", file=sys.stderr)

    for q in searches:
        try:
            for t in F.commons_search(q):
                t = F.normalize_file_title(t)
                if t not in seen and F.is_photo(t):
                    new_candidates.append((f"search:{q}", t))
                    seen.add(t)
        except Exception as e:
            print(f"  ! search {q}: {e}", file=sys.stderr)

    print(f"  new candidates: {len(new_candidates)}")
    target_count = 4
    have = sum(1 for f in os.listdir(photos_dir)
               if any(f.lower().endswith(e) for e in (".jpg", ".jpeg", ".png")))
    kept = []
    for source, title in new_candidates:
        if have >= target_count:
            break
        try:
            info = F.file_info(title)
        except Exception as e:
            print(f"  ! info {title}: {e}", file=sys.stderr)
            continue
        if not info:
            continue
        if not F.is_relevant(folder, title, info.get("description", ""), source):
            continue
        if not F.license_is_free(info.get("license", "")):
            continue
        if (info.get("width") or 0) < 600:
            continue
        if not info.get("thumburl"):
            continue
        # next index
        idx = have + 1
        safe = title.replace("File:", "").replace("/", "_")
        local = os.path.join(photos_dir, f"{idx:02d}_{safe}")
        try:
            F.download(info["thumburl"], local)
        except Exception as e:
            print(f"  ! dl {title}: {e}", file=sys.stderr)
            continue
        info["source_method"] = source
        info["local_path"] = os.path.relpath(local, out_dir)
        kept.append(info)
        have += 1
        print(f"  + {title}  [{info.get('license')}]")
        time.sleep(0.5)
    return kept


if __name__ == "__main__":
    for tup in EXTRA:
        try:
            topup(*tup)
        except Exception as e:
            print(f"!! {tup[0]}: {e}", file=sys.stderr)
