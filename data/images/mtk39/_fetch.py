#!/usr/bin/env python3
"""
One-shot fetcher: pulls a representative image for each МТК 39 item from
ru.wikipedia.org, downloads via the Wikipedia API, and resizes to
≤1200px on the long side with the `sips` tool (macOS built-in).

Outputs:
  data/images/mtk39/<id>.<ext>          per-item images
  data/images/mtk39/_index.json         per-item metadata
                                        (file, source page, license placeholder)
  data/images/mtk39/_manual.md          items where auto search did not yield
                                        a usable pageimage — needs human pick

Re-run safe: existing files are kept unless --force is passed.
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # worktree root
DATA = ROOT / "data" / "mtk39.json"
OUT = ROOT / "data" / "images" / "mtk39"
OUT.mkdir(parents=True, exist_ok=True)

WIKI_RU = "https://ru.wikipedia.org/w/api.php"
USER_AGENT = (
    "BMK-Lenin-Center/1.0 "
    "(museum prototype; https://github.com/trapastnik/3842)"
)

# IDs we intentionally skip (per coordination 2026-05-11):
# generic stadium / generic tea / generic weaving — no specific object;
# Leninia, main-rail-workshops, plzen — postpone.
# Asteroids stay in.
SKIP_IDS = {
    "leninia",
    "stadium-lenina-generic",
    "tea-factory",
    "weaving-factory",
    "main-rail-workshops",
    "plzen-lenin-zavod",
}

MAX_LONG_SIDE = 1200


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return urllib.request.urlopen(req, timeout=timeout)


import re

LENIN_TAIL_RE = re.compile(
    r"\s*(имени|им\.)\s+В\.?\s?И\.?\s+(Ульянова-)?Лен[ие]на.*$",
    flags=re.IGNORECASE,
)


def strip_lenin_tail(name):
    return LENIN_TAIL_RE.sub("", name or "").strip()


def query_variants(item):
    seen = set()
    out = []
    for s in (
        item.get("name_short"),
        item.get("name"),
        strip_lenin_tail(item.get("name")),
        strip_lenin_tail(item.get("name_short")),
    ):
        s = (s or "").strip()
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def wiki_opensearch(query, limit=3):
    p = urllib.parse.urlencode({
        "action": "opensearch",
        "search": query,
        "limit": limit,
        "namespace": 0,
        "format": "json",
    })
    data = json.loads(fetch(f"{WIKI_RU}?{p}").read())
    return data[1] if len(data) > 1 else []


def wiki_fulltext(query, limit=3):
    p = urllib.parse.urlencode({
        "action": "query",
        "list": "search",
        "srsearch": query,
        "srlimit": limit,
        "srprop": "",
        "format": "json",
    })
    data = json.loads(fetch(f"{WIKI_RU}?{p}").read())
    return [r["title"] for r in data.get("query", {}).get("search", [])]


def page_image(title):
    p = urllib.parse.urlencode({
        "action": "query",
        "titles": title,
        "prop": "pageimages|info",
        "piprop": "original",
        "inprop": "url",
        "format": "json",
    })
    data = json.loads(fetch(f"{WIKI_RU}?{p}").read())
    pages = data.get("query", {}).get("pages", {})
    for _, page in pages.items():
        img = page.get("original")
        if img:
            return {
                "url": img["source"],
                "page_url": page.get("fullurl"),
                "title": page.get("title"),
            }
    return None


def find_image(item):
    for q in query_variants(item):
        for searcher in (wiki_opensearch, wiki_fulltext):
            try:
                articles = searcher(q)
            except Exception as e:
                print(f"  search failed for {q!r}: {e}")
                continue
            time.sleep(0.2)
            for title in articles:
                try:
                    img = page_image(title)
                except Exception as e:
                    print(f"  page_image failed for {title!r}: {e}")
                    continue
                time.sleep(0.2)
                if img:
                    img["found_via"] = f"{searcher.__name__}: {q}"
                    return img
    return None


def download(url, dest):
    data = fetch(url, timeout=60).read()
    dest.write_bytes(data)
    return len(data)


def resize(path):
    if path.suffix.lower() in {".svg"}:
        return  # sips can't handle svg; leave raster-less
    try:
        subprocess.run(
            ["sips", "-Z", str(MAX_LONG_SIDE), str(path)],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"  sips resize failed for {path.name}: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true",
                    help="re-download even if file exists")
    args = ap.parse_args()

    doc = json.loads(DATA.read_text(encoding="utf-8"))
    items = doc["items"]

    index = []
    manual = []
    stats = {"ok": 0, "no_image": 0, "skipped": 0, "cached": 0, "fail": 0}

    for item in items:
        iid = item["id"]
        name = item.get("name_short") or item.get("name", "")
        if iid in SKIP_IDS:
            stats["skipped"] += 1
            print(f"[skip ] {iid}")
            continue

        existing = list(OUT.glob(f"{iid}.*"))
        if existing and not args.force:
            stats["cached"] += 1
            print(f"[cache] {iid}: {existing[0].name}")
            index.append({"id": iid, "file": existing[0].name})
            continue

        print(f"[fetch] {iid}: searching '{name}'")
        img = find_image(item)
        if not img:
            stats["no_image"] += 1
            manual.append({
                "id": iid,
                "name": item.get("name"),
                "name_short": item.get("name_short"),
                "reason": "Wikipedia search returned no article with a pageimage",
            })
            continue

        url = img["url"]
        ext = url.rsplit(".", 1)[-1].lower().split("?")[0]
        if ext not in {"jpg", "jpeg", "png", "svg", "webp"}:
            ext = "jpg"
        dest = OUT / f"{iid}.{ext}"

        try:
            size = download(url, dest)
        except Exception as e:
            stats["fail"] += 1
            print(f"  download failed: {e}")
            manual.append({
                "id": iid,
                "name": item.get("name"),
                "found_url": url,
                "reason": f"download failed: {e}",
            })
            continue

        resize(dest)
        new_size = dest.stat().st_size

        stats["ok"] += 1
        index.append({
            "id": iid,
            "file": dest.name,
            "source_url": url,
            "page_url": img["page_url"],
            "wiki_title": img["title"],
            "found_via": img.get("found_via"),
            "bytes": new_size,
        })
        print(f"  -> {dest.name} {new_size // 1024}KB (orig {size // 1024}KB)")
        time.sleep(0.4)

    (OUT / "_index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if manual:
        lines = ["# Нужны вручную\n",
                 "Объекты МТК 39, для которых автомат не нашёл подходящего изображения\n",
                 "в ru.wikipedia.org. Дозабрать руками (музей, личные фото, ЦГА).\n"]
        for m in manual:
            lines.append(f"\n## {m.get('name') or m['id']}")
            lines.append(f"- id: `{m['id']}`")
            if m.get("name_short"):
                lines.append(f"- short: {m['name_short']}")
            if m.get("found_url"):
                lines.append(f"- found_url: {m['found_url']}")
            lines.append(f"- reason: {m['reason']}")
        (OUT / "_manual.md").write_text("\n".join(lines) + "\n",
                                        encoding="utf-8")

    print("\n--- summary ---")
    for k, v in stats.items():
        print(f"  {k:8s} {v}")
    print(f"  total    {sum(stats.values())}")


if __name__ == "__main__":
    sys.exit(main())
