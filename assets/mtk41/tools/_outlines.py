#!/usr/bin/env python3
"""Generate clean outline-only PNGs from rembg silhouettes.

For each curated silhouette in silhouettes.json, produces an outline
version next to it (suffix `_outline.png`). The outline is the 2-pixel
contour of the alpha mask, drawn in a chosen color on transparent bg.

Usage:
    /usr/bin/python3 assets/mtk41/tools/_outlines.py
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent       # assets/mtk41/
STROKE_COLOR = (247, 249, 239, 235)                 # paper-white, slightly transparent
STROKE_WIDTH = 3                                     # px
ALPHA_THRESHOLD = 80                                 # cut off feathered edges


def silhouette_to_outline(src_path, out_path):
    """Boundary stroke only (transparent inside, paper-colored 3px ring)."""
    import numpy as np
    img = Image.open(src_path).convert("RGBA")
    alpha = img.split()[3]
    mask = alpha.point(lambda p: 255 if p >= ALPHA_THRESHOLD else 0)
    eroded = mask.filter(ImageFilter.MinFilter(2 * STROKE_WIDTH + 1))
    m_arr = np.array(mask, dtype=np.int16)
    e_arr = np.array(eroded, dtype=np.int16)
    ring = np.clip(m_arr - e_arr, 0, 255).astype(np.uint8)
    h, w = ring.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0] = STROKE_COLOR[0]
    rgba[..., 1] = STROKE_COLOR[1]
    rgba[..., 2] = STROKE_COLOR[2]
    rgba[..., 3] = (ring.astype(np.uint16) * STROKE_COLOR[3] // 255).astype(np.uint8)
    out_img = Image.fromarray(rgba)
    bbox = out_img.getbbox()
    if bbox:
        out_img = out_img.crop(bbox)
    out_img.save(out_path, "PNG", optimize=True)


def silhouette_to_flat(src_path, out_path, fill_color=(247, 249, 239, 220)):
    """Flat solid silhouette — original shape, single uniform color."""
    import numpy as np
    img = Image.open(src_path).convert("RGBA")
    alpha = img.split()[3]
    # Soft threshold: keep alpha gradient for slight anti-aliasing
    mask = alpha.point(lambda p: 0 if p < 40 else min(255, p))
    a_arr = np.array(mask, dtype=np.uint8)
    h, w = a_arr.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0] = fill_color[0]
    rgba[..., 1] = fill_color[1]
    rgba[..., 2] = fill_color[2]
    rgba[..., 3] = (a_arr.astype(np.uint16) * fill_color[3] // 255).astype(np.uint8)
    out_img = Image.fromarray(rgba)
    bbox = out_img.getbbox()
    if bbox:
        out_img = out_img.crop(bbox)
    out_img.save(out_path, "PNG", optimize=True)


def main():
    with (ROOT / "silhouettes.json").open(encoding="utf-8") as f:
        catalog = json.load(f)

    outline_paths = {}
    flat_paths = {}
    for monument_id, rel in catalog.items():
        if monument_id.startswith("_") or not rel:
            outline_paths[monument_id] = None
            flat_paths[monument_id] = None
            continue
        src = ROOT / monument_id / rel
        if not src.exists():
            print(f"  ! missing: {src}", file=sys.stderr)
            outline_paths[monument_id] = None
            flat_paths[monument_id] = None
            continue
        out_rel = rel.replace(".png", "_outline.png")
        flat_rel = rel.replace(".png", "_flat.png")
        try:
            silhouette_to_outline(src, ROOT / monument_id / out_rel)
            silhouette_to_flat(src, ROOT / monument_id / flat_rel)
            outline_paths[monument_id] = out_rel
            flat_paths[monument_id] = flat_rel
            print(f"  + {monument_id}")
        except Exception as e:
            print(f"  ! {monument_id}: {e}", file=sys.stderr)
            outline_paths[monument_id] = None
            flat_paths[monument_id] = None

    with (ROOT / "outlines.json").open("w", encoding="utf-8") as f:
        json.dump({"_comment": "Boundary-only stroke around silhouette.",
                   **outline_paths}, f, ensure_ascii=False, indent=2)
    with (ROOT / "silhouettes_flat.json").open("w", encoding="utf-8") as f:
        json.dump({"_comment": "Flat single-color filled silhouette (no photo content).",
                   **flat_paths}, f, ensure_ascii=False, indent=2)
    print(f"\n=== {sum(1 for v in outline_paths.values() if v)} outline + flat pairs")


if __name__ == "__main__":
    main()
