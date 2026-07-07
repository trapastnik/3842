#!/usr/bin/env python3
"""Патчит data/ne_110m_countries.geojson: объединяет полигоны РФ с 4
украинскими областями (Донецкая, Луганская, Херсонская, Запорожская)
через shapely.unary_union → одна непрерывная внешняя граница РФ
без внутренних швов между областями.

Крым уже в Russia's MultiPolygon (наследие ne_110m post-2014).

Полигоны берутся из geoBoundaries UKR ADM1 simplified (OSM, ODbL 1.0).

Запуск: /usr/bin/python3 assets/mtk41/tools/_patch_ru_borders_2026.py
"""
import json
import shutil
import urllib.request
from pathlib import Path

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent.parent.parent
GEOJSON = ROOT / "data/ne_110m_countries.geojson"
UKR_CACHE = ROOT / "assets/mtk41/sources/geoBoundaries-UKR-ADM1_simplified.geojson"

UKR_URL = ("https://github.com/wmgeolab/geoBoundaries/raw/9469f09/"
           "releaseData/gbOpen/UKR/ADM1/geoBoundaries-UKR-ADM1_simplified.geojson")

TARGET_OBLASTS = [
    "Donetsk Oblast",
    "Luhansk Oblast",
    "Kherson Oblast",
    "Zaporizhia Oblast",
]


def download_ukr():
    if UKR_CACHE.exists() and UKR_CACHE.stat().st_size > 100000:
        return
    UKR_CACHE.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading UKR ADM1 → {UKR_CACHE}")
    urllib.request.urlretrieve(UKR_URL, UKR_CACHE)


def load_oblast_shapes():
    with open(UKR_CACHE, encoding="utf-8") as f:
        ukr = json.load(f)
    out = {}
    for name in TARGET_OBLASTS:
        feat = next((f for f in ukr["features"]
                     if f["properties"].get("shapeName") == name), None)
        if not feat:
            raise RuntimeError(f"no {name}")
        out[name] = shape(feat["geometry"])
    return out


def main():
    download_ukr()
    oblasts = load_oblast_shapes()

    with open(GEOJSON, encoding="utf-8") as f:
        gj = json.load(f)

    # Backup once
    bak = GEOJSON.with_suffix(".geojson.bak")
    if not bak.exists():
        shutil.copy(GEOJSON, bak)

    # Idempotent — drop any prior standalone annex feature (previous versions)
    gj["features"] = [ft for ft in gj["features"]
                      if ft.get("properties", {}).get("_ru_annex_2026") is not True]

    ru = next(f for f in gj["features"] if f["properties"].get("ADMIN") == "Russia")
    ua = next(f for f in gj["features"] if f["properties"].get("ADMIN") == "Ukraine")

    ru_shape = shape(ru["geometry"])
    ua_shape = shape(ua["geometry"])

    # Union of Russia + 4 oblasts → new Russia's border
    ru_new = unary_union([ru_shape] + list(oblasts.values()))

    # Subtract those 4 oblasts from Ukraine so Ukraine loses them
    ua_new = ua_shape
    for ob in oblasts.values():
        ua_new = ua_new.difference(ob)

    print(f"Russia: {ru_shape.geom_type} → {ru_new.geom_type}")
    print(f"  area: {ru_shape.area:.2f} → {ru_new.area:.2f}")
    print(f"Ukraine: {ua_shape.geom_type} → {ua_new.geom_type}")
    print(f"  area: {ua_shape.area:.2f} → {ua_new.area:.2f}")

    ru["geometry"] = mapping(ru_new)
    ua["geometry"] = mapping(ua_new)
    # Mark для audita
    ru["properties"]["_ru_2026_borders"] = True

    GEOJSON.write_text(json.dumps(gj, ensure_ascii=False), encoding="utf-8")
    print(f"patched {GEOJSON}")
    print(f"  features: {len(gj['features'])}")
    print(f"  file size: {GEOJSON.stat().st_size} bytes")


if __name__ == "__main__":
    main()
