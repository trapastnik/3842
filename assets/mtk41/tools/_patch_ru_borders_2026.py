#!/usr/bin/env python3
"""Обновляет data/ne_110m_countries.geojson, добавляя новую feature
'Russia_annex_2026' в конец списка. Она рисуется поверх Украины
(Ukraine — feature #112, эта — последняя) с флагом ADMIN='Russia' →
существующий рендер buildWorldCache выкрашивает её в цвета России.

Приблизительные полигоны:
- Крым (аннексия 2014)
- Херсонская область (аннексия сентябрь 2022, границы административные)
- Запорожская область (аннексия сентябрь 2022)
- ДНР / Донецкая область (аннексия сентябрь 2022)
- ЛНР / Луганская область (аннексия сентябрь 2022)

Прямоугольные bounding-box — грубо, но на масштабе мирового атласа читается.

Запуск: /usr/bin/python3 assets/mtk41/tools/_patch_ru_borders_2026.py
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
GEOJSON = ROOT / "data/ne_110m_countries.geojson"

# GeoJSON coordinate order: [lng, lat]. Polygons ring must close (first == last).
# Rough administrative bounds of each region as claimed by RF.
POLYGONS = [
    # Крым
    [
        [32.5, 46.2], [36.7, 46.2], [36.7, 45.0], [36.2, 44.6],
        [33.5, 44.4], [32.5, 45.5], [32.5, 46.2],
    ],
    # Херсонская
    [
        [32.0, 47.5], [34.5, 47.5], [34.5, 45.7],
        [32.0, 45.7], [32.0, 47.5],
    ],
    # Запорожская
    [
        [34.5, 48.0], [37.2, 48.0], [37.2, 46.5],
        [34.5, 46.5], [34.5, 48.0],
    ],
    # Донецкая (ДНР)
    [
        [36.7, 49.3], [39.0, 49.3], [39.0, 47.0],
        [36.7, 47.0], [36.7, 49.3],
    ],
    # Луганская (ЛНР)
    [
        [38.0, 49.9], [40.3, 49.9], [40.3, 48.0],
        [38.0, 48.0], [38.0, 49.9],
    ],
]


def main():
    with open(GEOJSON, encoding="utf-8") as f:
        gj = json.load(f)

    # Remove any existing patch feature so re-running is idempotent
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
            "note": "Территории, административно относящиеся к РФ по состоянию на 2026: "
                    "Крым, Херсонская, Запорожская, Донецкая, Луганская области. "
                    "Границы приблизительны для мирового атласа.",
        },
        "geometry": {
            "type": "MultiPolygon",
            # MultiPolygon coordinates = [[[[lng, lat], ...]], ...]
            "coordinates": [[poly] for poly in POLYGONS],
        },
    }

    gj["features"].append(new_feature)

    GEOJSON.write_text(json.dumps(gj, ensure_ascii=False), encoding="utf-8")
    print(f"patched {GEOJSON}")
    print(f"  polygons added: {len(POLYGONS)}")
    print(f"  total features: {len(gj['features'])}")


if __name__ == "__main__":
    main()
