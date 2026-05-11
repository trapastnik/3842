#!/usr/bin/env python3
"""Generate transparent-background silhouettes from monument photos using rembg.

Usage:
    /usr/bin/python3 assets/mtk41/tools/_silhouettes.py [monument-id ...]

For each monument folder under assets/mtk41/<id>/photos/, picks the first
photo (01_*.jpg) and produces:
    assets/mtk41/<id>/silhouettes/01_silhouette.png

The model is U²-Net (downloaded to ~/.u2net on first call, ~170 MB).

Idempotent — skips files already present.
"""
import io
import os
import sys
from pathlib import Path

from rembg import new_session, remove
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent       # assets/mtk41/
SESSION = None


def get_session():
    global SESSION
    if SESSION is None:
        # u2netp is the small variant; faster, smaller, slightly lower quality.
        # u2net is the default — best for portraits / human figures.
        SESSION = new_session(model_name="u2net")
    return SESSION


def process_one(monument_dir):
    """Generate silhouettes for ALL photos in the monument folder.
    Returns (count_new, count_existing, count_failed)."""
    photo_dir = monument_dir / "photos"
    sil_dir = monument_dir / "silhouettes"
    if not photo_dir.is_dir():
        return 0, 0, 0
    photos = sorted([p for p in photo_dir.iterdir()
                     if p.suffix.lower() in (".jpg", ".jpeg", ".png")])
    if not photos:
        return 0, 0, 0
    sil_dir.mkdir(exist_ok=True)

    new = existing = failed = 0
    for src in photos:
        # Output: same filename, .png extension
        out_name = src.stem + ".png"
        out = sil_dir / out_name
        if out.exists() and out.stat().st_size > 0:
            existing += 1
            continue
        try:
            with src.open("rb") as f:
                input_bytes = f.read()
            output_bytes = remove(input_bytes, session=get_session())
            img = Image.open(io.BytesIO(output_bytes)).convert("RGBA")
            bbox = img.getbbox()
            if bbox:
                img = img.crop(bbox)
            max_side = 1400
            if max(img.size) > max_side:
                ratio = max_side / max(img.size)
                new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                img = img.resize(new_size, Image.LANCZOS)
            img.save(out, "PNG", optimize=True)
            new += 1
        except Exception as e:
            print(f"  ! {src.name}: {e}", file=sys.stderr)
            failed += 1
    return new, existing, failed


def main():
    only = set(sys.argv[1:])
    folders = sorted([d for d in ROOT.iterdir()
                      if d.is_dir() and not d.name.startswith(("_", ".", "lib", "tools"))])
    total_new = total_existing = 0
    for d in folders:
        if only and d.name not in only:
            continue
        new, existing, failed = process_one(d)
        total_new += new
        total_existing += existing
        if new + existing + failed > 0:
            print(f"  {d.name}: +{new} new, {existing} cached, {failed} failed")
    print(f"\n=== {total_new} new + {total_existing} cached silhouettes")


if __name__ == "__main__":
    main()
