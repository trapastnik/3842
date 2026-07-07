#!/usr/bin/env python3
"""Патчит data/ne_110m_countries.geojson: добавляет РЕАЛЬНЫЕ векторные
полигоны 4 украинских областей (Донецкая, Луганская, Херсонская,
Запорожская) как отдельную feature с ADMIN='Russia' в конце списка.

Крым уже показан в Russia's MultiPolygon (наследие ne_110m post-2014),
поэтому его отдельно не добавляем.

Полигоны берутся из geoBoundaries UKR ADM1 simplified (OSM данные,
Open Data Commons ODbL 1.0). Кэшируется локально в
assets/mtk41/sources/geoBoundaries-UKR-ADM1_simplified.geojson.

Feature добавляется в конец geojson → рендерится ПОСЛЕ Украины →
визуально перекрывает UA-полигон в этих регионах, показывая цвет РФ.

Запуск: /usr/bin/python3 assets/mtk41/tools/_patch_ru_borders_2026.py
"""
import json
import shutil
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
GEOJSON = ROOT / "data/ne_110m_countries.geojson"
UKR_CACHE = ROOT / "assets/mtk41/sources/geoBoundaries-UKR-ADM1_simplified.geojson"

UKR_URL = ("https://github.com/wmgeolab/geoBoundaries/raw/9469f09/"
           "releaseData/gbOpen/UKR/ADM1/geoBoundaries-UKR-ADM1_simplified.geojson")

# Названия областей в geoBoundaries (English)
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


def load_oblast_polygons():
    with open(UKR_CACHE, encoding="utf-8") as f:
        ukr = json.load(f)
    polys = []
    for name in TARGET_OBLASTS:
        feat = next((f for f in ukr["features"]
                     if f["properties"].get("shapeName") == name), None)
        if not feat:
            raise RuntimeError(f"no {name} in {UKR_CACHE}")
        g = feat["geometry"]
        # Convert Polygon → single-poly list; MultiPolygon → its polys
        if g["type"] == "Polygon":
            polys.append(g["coordinates"])
        elif g["type"] == "MultiPolygon":
            polys.extend(g["coordinates"])
        else:
            raise RuntimeError(f"unexpected geom {g['type']} for {name}")
        print(f"  + {name}: {g['type']}, "
              f"outer pts {sum(len(p[0]) for p in ([g['coordinates']] if g['type']=='Polygon' else g['coordinates']))}")
    return polys


def main():
    download_ukr()
    polys = load_oblast_polygons()

    with open(GEOJSON, encoding="utf-8") as f:
        gj = json.load(f)

    # Idempotent — remove any prior patch feature
    gj["features"] = [ft for ft in gj["features"]
                      if ft.get("properties", {}).get("_ru_annex_2026") is not True]

    # Backup once
    bak = GEOJSON.with_suffix(".geojson.bak")
    if not bak.exists():
        shutil.copy(GEOJSON, bak)

    new_feature = {
        "type": "Feature",
        "properties": {
            "ADMIN": "Russia",
            "NAME": "Russia",
            "ISO_A2": "RU",
            "_ru_annex_2026": True,
            "note": ("РФ по состоянию на 2026: 4 украинские области "
                     "(Донецкая, Луганская, Херсонская, Запорожская) "
                     "по итогам 2022. Крым учтён отдельно в основном "
                     "полигоне Russia в ne_110m."),
            "source": "geoBoundaries UKR ADM1 (ODbL 1.0)",
        },
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": polys,
        },
    }

    gj["features"].append(new_feature)
    GEOJSON.write_text(json.dumps(gj, ensure_ascii=False), encoding="utf-8")

    print(f"patched {GEOJSON}")
    print(f"  polygons added: {len(polys)}")
    print(f"  total features: {len(gj['features'])}")
    print(f"  file size: {GEOJSON.stat().st_size} bytes")


if __name__ == "__main__":
    main()
