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


def silhouette_to_flat(src_path, out_path, fill_color=(247, 249, 239, 235)):
    """Flat solid silhouette — hard binary cut, largest blob only."""
    import numpy as np
    img = Image.open(src_path).convert("RGBA")
    alpha = np.array(img.split()[3], dtype=np.uint8)

    # Hard binary threshold — no feathering, no half-alpha. Aggressive.
    binary = (alpha >= 160).astype(np.uint8)

    # Connected-components labelling, keep only the largest blob (removes
    # water-ripple splashes, grass blobs, lampposts, etc. that the rembg
    # alpha sometimes carries below the actual monument).
    binary = keep_largest_component(binary)

    # Re-add 1px edge feather for slight anti-aliasing so the silhouette
    # doesn't look pixel-jagged at small render sizes
    h, w = binary.shape
    out_alpha = (binary * 255).astype(np.uint8)
    # Optional 1-pixel smoothing
    feathered = Image.fromarray(out_alpha).filter(ImageFilter.GaussianBlur(0.6))
    out_alpha = np.array(feathered)

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0] = fill_color[0]
    rgba[..., 1] = fill_color[1]
    rgba[..., 2] = fill_color[2]
    rgba[..., 3] = (out_alpha.astype(np.uint16) * fill_color[3] // 255).astype(np.uint8)
    out_img = Image.fromarray(rgba)
    bbox = out_img.getbbox()
    if bbox:
        out_img = out_img.crop(bbox)
    out_img.save(out_path, "PNG", optimize=True)


def keep_largest_component(binary):
    """Flood-fill style connected-components; keep only the largest blob.
    Pure numpy/python — no scipy dependency."""
    import numpy as np
    h, w = binary.shape
    labels = np.zeros((h, w), dtype=np.int32)
    sizes = [0]   # index 0 reserved
    cur = 0
    stack = []

    for sy in range(h):
        for sx in range(w):
            if binary[sy, sx] and labels[sy, sx] == 0:
                cur += 1
                size = 0
                stack.append((sy, sx))
                labels[sy, sx] = cur
                while stack:
                    y, x = stack.pop()
                    size += 1
                    if y > 0 and binary[y-1, x] and labels[y-1, x] == 0:
                        labels[y-1, x] = cur; stack.append((y-1, x))
                    if y < h-1 and binary[y+1, x] and labels[y+1, x] == 0:
                        labels[y+1, x] = cur; stack.append((y+1, x))
                    if x > 0 and binary[y, x-1] and labels[y, x-1] == 0:
                        labels[y, x-1] = cur; stack.append((y, x-1))
                    if x < w-1 and binary[y, x+1] and labels[y, x+1] == 0:
                        labels[y, x+1] = cur; stack.append((y, x+1))
                sizes.append(size)

    if cur == 0:
        return binary
    largest = sizes.index(max(sizes[1:])) if cur >= 1 else 0
    return (labels == largest).astype(np.uint8)


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
