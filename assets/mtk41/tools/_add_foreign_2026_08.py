#!/usr/bin/env python3
"""Три зарубежных памятника из «Памятник и за границей ещё.doc» (2026-08-01).

Документ маленький (3 строки), таблица нерегулярная — парсер не нужен, данные
внесены вручную. Фотографии куратор прислал отдельными файлами, география — в
их именах: «бюст в венесуэле», «Памятник в Винь», «Зимбабве».

Ценность для корпуса: Винь (2024) становится самым поздним памятником в базе
(было max 2020), а Хараре и Каракас закрывают две пустые части карты — до сих
пор в корпусе не было ни одного объекта в Африке южнее Аддис-Абебы и ни одного
в Южной Америке.

Запуск из корня репозитория:
    /usr/bin/python3 assets/mtk41/tools/_add_foreign_2026_08.py
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA = ROOT / "data/mtk41.json"
ASSETS = ROOT / "assets/mtk41"
HEIGHTS = ASSETS / "heights.json"
MANIFEST = ASSETS / "manifest.json"
INCOMING = ASSETS / "sources/incoming-2026-08-01"
SOURCE = "foreign-2026-08-01"

ITEMS = [
    {
        "id": "vin-2024",
        "title": "Памятник Ленину — Винь",
        "year": 2024,
        "date": "2024",
        "city": "Винь",
        "place": "Винь. Провинция Нгеан. Вьетнам",
        "country": "Вьетнам",
        "country_iso": "VN",
        "lat": 18.6790,
        "lng": 105.6813,
        "coords_verified": False,
        "sculptors": ["И.С. Смиркин"],
        "architects": [],
        "status": "extant",
        "short_text": "Подарок Ульяновской области провинции Нгеан — родине Хо Ши Мина.",
        "note_full": "Подарок Ульяновской области провинции Нгеан — родине Хо Ши Мина.",
        "size_raw": "Бронзовая статуя 3,6 м., постамент 4 м.",
        "kind": "sculpture",
        "kind_ru": "скульптура",
        "source": SOURCE,
        "_photo": "Памятник в Винь.jpeg",
        "_h": {"statue": 3.6, "pedestal": 4.0},
    },
    {
        "id": "karakas-2017",
        "title": "Бюст Ленина — Каракас",
        "year": 2017,
        "date": "2017",
        "city": "Каракас",
        "place": "Каракас. Аллея освободителей, проспект Боливара. Венесуэла",
        "country": "Венесуэла",
        "country_iso": "VE",
        "lat": 10.4806,
        "lng": -66.9036,
        "coords_verified": False,
        "sculptors": ["Кармен Серратоса"],
        "architects": [],
        "status": "extant",
        "short_text": "Установлен на Аллее освободителей на проспекте Боливара к 100-летию Октябрьской революции.",
        "note_full": "Установлен на Аллее освободителей на проспекте Боливара к 100-летию Октябрьской революции.",
        "size_raw": "Бюст 55 см., постамент 2,1 м.",
        "kind": "bust",
        "kind_ru": "бюст",
        "source": SOURCE,
        "_photo": "бюст в венесуэле.jpg",
        "_h": {"statue": 0.55, "pedestal": 2.1},
    },
    {
        "id": "kharare-1980",
        "title": "Памятник Ленину — Хараре",
        "year": 1980,
        "date": "1980",
        "city": "Хараре",
        "place": "Хараре. Зимбабве",
        "country": "Зимбабве",
        "country_iso": "ZW",
        "lat": -17.8252,
        "lng": 31.0335,
        "coords_verified": False,
        "sculptors": [],
        "architects": [],
        "status": "extant",
        "short_text": "Автор неизвестен. Находится в частном владении.",
        "note_full": "Автор неизвестен. Находится в частном владении.",
        "size_raw": "Высота 2 м.",
        "kind": "sculpture",
        "kind_ru": "скульптура",
        "source": SOURCE,
        "_photo": "Зимбабве.jpg",
        "_h": {"statue": 2.0, "pedestal": 0.8},
    },
]


def main():
    cat = json.loads(DATA.read_text(encoding="utf-8"))
    existing = {it["id"] for it in cat["items"]}
    heights = json.loads(HEIGHTS.read_text(encoding="utf-8"))

    added = 0
    for rec in ITEMS:
        photo = rec.pop("_photo")
        h = rec.pop("_h")
        if rec["id"] in existing:
            print(f"  пропуск, уже есть: {rec['id']}")
            continue
        cat["items"].append(rec)
        heights[rec["id"]] = h
        src = INCOMING / photo
        if src.is_file():
            out = ASSETS / rec["id"] / "photos"
            out.mkdir(parents=True, exist_ok=True)
            ext = src.suffix.lower().replace(".jpeg", ".jpg")
            shutil.copy(src, out / f"01_curator{ext}")
        else:
            print(f"  ⚠ нет фото: {photo}")
        added += 1

    cat["count"] = len(cat["items"])
    cat["sources"] = sorted({it.get("source", "") for it in cat["items"]} - {""})
    DATA.write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")
    HEIGHTS.write_text(json.dumps(heights, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"data/mtk41.json: всего {cat['count']} (добавлено {added})")

    manifest = {}
    for d in sorted(p for p in ASSETS.iterdir()
                    if p.is_dir() and p.name not in ("lib", "tools", "sources")):
        pd = d / "photos"
        if not pd.is_dir():
            continue
        photos = sorted(f.name for f in pd.iterdir()
                        if f.suffix.lower() in (".jpg", ".jpeg", ".png"))
        if photos:
            manifest[d.name] = [f"photos/{p}" for p in photos]
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"manifest.json: {len(manifest)} записей")


if __name__ == "__main__":
    main()
