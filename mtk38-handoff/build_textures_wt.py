#!/usr/bin/env python3
# МТК 38 · build_textures_wt.py
# Перепроецирует растровые подложки карты из equirectangular в Winkel Tripel.
#
# Зачем: канон проекта — Winkel Tripel (assets/shared/lib/projection.js, как в МТК 41).
# Векторный geojson проецируется в рантайме, а фотоподложки Земли сняты в equirect
# и под WT не встают — их надо пересчитать один раз офлайн.
#
# Обратной формулы у WT нет, поэтому по каждому пикселю назначения решаем прямую
# численно (Ньютон с численным якобианом), затем билинейно сэмплируем исходник.
# Пиксели вне области проекции остаются прозрачными → формат webp с альфой.
#
# Запуск:  python3 mtk38-handoff/build_textures_wt.py
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TEX = ROOT / "assets/mtk38/textures"
OUT_W = 4096
COS_PHI1 = 2 / np.pi
X_HALF = (2 + np.pi) / 2
Y_HALF = np.pi / 2
ASPECT = (2 + np.pi) / np.pi


def forward(lam, phi):
    """(λ, φ) → (wx, wy) в тех же единицах, что и projection.js до нормировки."""
    cosphi = np.cos(phi)
    alpha = np.arccos(np.clip(cosphi * np.cos(lam / 2), -1, 1))
    sinc = np.where(alpha < 1e-9, 1.0, np.sin(alpha) / np.where(alpha < 1e-9, 1.0, alpha))
    wx = 0.5 * (lam * COS_PHI1 + 2 * cosphi * np.sin(lam / 2) / sinc)
    wy = 0.5 * (phi + np.sin(phi) / sinc)
    return wx, wy


def invert(wx, wy, iters=25):
    """Численная инверсия: Ньютон с якобианом по конечным разностям."""
    lam = wx.copy()
    phi = wy.copy()
    h = 1e-6
    for _ in range(iters):
        fx, fy = forward(lam, phi)
        ex, ey = fx - wx, fy - wy
        fx1, fy1 = forward(lam + h, phi)
        fx2, fy2 = forward(lam, phi + h)
        a, c = (fx1 - fx) / h, (fy1 - fy) / h      # ∂/∂λ
        b, d = (fx2 - fx) / h, (fy2 - fy) / h      # ∂/∂φ
        det = a * d - b * c
        det = np.where(np.abs(det) < 1e-12, np.nan, det)
        lam -= (d * ex - b * ey) / det
        phi -= (a * ey - c * ex) / det
        lam = np.clip(lam, -np.pi, np.pi)
        phi = np.clip(phi, -np.pi / 2, np.pi / 2)
    fx, fy = forward(lam, phi)
    ok = np.isfinite(lam) & np.isfinite(phi) & (np.hypot(fx - wx, fy - wy) < 1e-4)
    return lam, phi, ok


def reproject(src_path, dst_path):
    src = Image.open(src_path).convert("RGB")
    S = np.asarray(src, dtype=np.float32)
    sh, sw = S.shape[:2]

    W = OUT_W
    H = int(round(W / ASPECT))
    out = np.zeros((H, W, 4), dtype=np.uint8)

    # по строкам — иначе на 4096×2502 промежуточные массивы съедают гигабайты
    xs = (np.arange(W, dtype=np.float64) + 0.5) / W
    wx_row = xs * (2 * X_HALF) - X_HALF
    for j in range(H):
        wy = Y_HALF - ((j + 0.5) / H) * (2 * Y_HALF)
        lam, phi, ok = invert(wx_row.copy(), np.full(W, wy, dtype=np.float64))
        if not ok.any():
            continue
        u = (np.degrees(lam) + 180.0) / 360.0 * (sw - 1)
        v = (90.0 - np.degrees(phi)) / 180.0 * (sh - 1)
        u = np.clip(u, 0, sw - 1); v = np.clip(v, 0, sh - 1)
        u0 = np.floor(u).astype(np.int32); v0 = np.floor(v).astype(np.int32)
        u1 = np.minimum(u0 + 1, sw - 1); v1 = np.minimum(v0 + 1, sh - 1)
        fu = (u - u0)[:, None]; fv = (v - v0)[:, None]
        px = (S[v0, u0] * (1 - fu) * (1 - fv) + S[v0, u1] * fu * (1 - fv) +
              S[v1, u0] * (1 - fu) * fv + S[v1, u1] * fu * fv)
        out[j, :, :3] = np.clip(px, 0, 255).astype(np.uint8)
        out[j, :, 3] = np.where(ok, 255, 0).astype(np.uint8)
        if j % 250 == 0:
            print(f"    строка {j}/{H}", file=sys.stderr)

    Image.fromarray(out, "RGBA").save(dst_path, "WEBP", quality=82, method=5)
    print(f"  ✓ {dst_path.name}  {W}×{H}  {dst_path.stat().st_size/1024:.0f} КБ")


def main():
    for name in ("earth-relief", "earth-physical"):
        src = TEX / f"{name}.jpg"
        if not src.exists():
            print(f"  ✗ нет {src}", file=sys.stderr); continue
        print(f"{name}: {src.stat().st_size/1024:.0f} КБ → Winkel Tripel")
        reproject(src, TEX / f"{name}-wt.webp")


if __name__ == "__main__":
    main()
