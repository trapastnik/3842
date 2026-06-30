#!/usr/bin/env python3
"""Extract photos embedded in monuments-list-2026-06-29.docx and place them
under assets/mtk41/<monument-id>/photos/01_curator.<ext>.

Matches images to monuments by table-row order (image inside row N → record N
of mtk41.json). Updates manifest.json afterwards so card.js picks them up.

Run from repo root:
    /usr/bin/python3 assets/mtk41/tools/_extract_docx_photos.py
"""
import io
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
DOCX = ROOT / "assets/mtk41/sources/monuments-list-2026-06-29.docx"
DATA = ROOT / "data/mtk41.json"
ASSETS = ROOT / "assets/mtk41"
MANIFEST = ASSETS / "manifest.json"


def main():
    with zipfile.ZipFile(DOCX) as z:
        doc_xml = z.read("word/document.xml").decode("utf-8")
        rels_xml = z.read("word/_rels/document.xml.rels").decode("utf-8")

        # rId → media path
        rels = {}
        for m in re.finditer(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels_xml):
            rels[m.group(1)] = m.group(2)

        # Walk table rows in document order, find first image rId inside each
        rows = re.findall(r"<w:tr\b[^>]*>(.*?)</w:tr>", doc_xml, re.DOTALL)
        row_image_rids = []
        for row in rows[1:]:  # skip header row (Памятник | Место | Автор | …)
            cells = re.findall(r"<w:tc\b[^>]*>(.*?)</w:tc>", row, re.DOTALL)
            if len(cells) < 2:
                continue
            place_text = re.sub(r"<[^>]+>", " ", cells[1])
            place_text = re.sub(r"\s+", " ", place_text).strip()
            if not place_text:
                continue
            # Find first <a:blip r:embed="rId..."/> in this row
            blip = re.search(r'r:embed="([^"]+)"', row)
            row_image_rids.append((place_text, blip.group(1) if blip else None))

        # Load monument ids in same order
        with open(DATA, encoding="utf-8") as f:
            items = json.load(f)["items"]
        if len(items) != len(row_image_rids):
            print(f"⚠ row count mismatch: {len(items)} items vs {len(row_image_rids)} rows",
                  file=sys.stderr)

        saved = []
        skipped = 0
        for (place, rid), item in zip(row_image_rids, items):
            mid = item["id"]
            if not rid or rid not in rels:
                skipped += 1
                continue
            media_path = rels[rid].lstrip("/")
            if not media_path.startswith("media/"):
                media_path = "word/" + media_path
            try:
                blob = z.read(media_path)
            except KeyError:
                # try alternative resolution
                try:
                    blob = z.read("word/" + media_path)
                except KeyError:
                    skipped += 1
                    continue
            ext = Path(media_path).suffix.lower() or ".jpg"
            if ext == ".jpeg":
                ext = ".jpg"
            out_dir = ASSETS / mid / "photos"
            out_dir.mkdir(parents=True, exist_ok=True)
            out_file = out_dir / f"01_curator{ext}"
            out_file.write_bytes(blob)
            saved.append((mid, out_file.relative_to(ASSETS), place[:50]))

    print(f"saved {len(saved)} curator photos, skipped {skipped}")
    for mid, rel, place in saved[:5]:
        print(f"  + {mid:40} ← {place}")
    print(f"  ... (+{len(saved)-5} more)" if len(saved) > 5 else "")

    # Regenerate manifest.json from current photo folders (this preserves any
    # pre-existing photos like the ones we'd curated for the 5 already-renamed
    # folders).
    manifest = {}
    for d in sorted(p for p in ASSETS.iterdir() if p.is_dir()
                    and p.name not in ("lib", "tools", "sources")):
        photo_dir = d / "photos"
        if not photo_dir.is_dir():
            continue
        photos = sorted([f.name for f in photo_dir.iterdir()
                         if f.suffix.lower() in (".jpg", ".jpeg", ".png")])
        if photos:
            manifest[d.name] = [f"photos/{p}" for p in photos]
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"manifest.json: {len(manifest)} entries")


if __name__ == "__main__":
    main()
