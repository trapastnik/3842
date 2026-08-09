#!/usr/bin/env python3
"""Прогон rembg по ПЕРВОМУ снимку каждого памятника + отбраковка входа.

    /usr/bin/python3 assets/mtk41/tools/_silhouettes_batch.py [--limit N]

Зачем отдельно от _silhouettes.py: тот берёт ВСЕ снимки в папке (у иных их
шесть), а сцене нужен один силуэт на памятник — тот же кадр, что уже стоит в
миниатюрах и карточках. Лишние маски это только вес репозитория.

Главное здесь не сама генерация, а ТРИАЖ. Пилот на 15 масках показал, что
часть входов негодна в принципе: у Рыбинска rembg отдал кляксу площадью
247 px, у Алексеева — эллипс вместо памятника. Пока неизвестно, сколько таких
среди остальных, вопрос «искать другой снимок или рисовать руками» не имеет
цены. Поэтому каждая маска сразу получает вердикт по замерам:

  ok      — чистится автоматически;
  сомнительно  — метрики за порогом, нужен глаз;
  негодно — входа нет: маска почти пуста, либо занимает почти весь кадр
            (rembg не отделил фон), либо не похожа на памятник ни одним
            признаком.

Счётчик записей печатается всегда — у 38 он дважды ловил обвал канона.
"""
import argparse
import io
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT.parent.parent / "data" / "mtk41.json"
MAX_SIDE = 1400


def verdict(mask_img):
    """Вердикт по одной маске. Возвращает (метка, метрики)."""
    import cv2
    a = np.array(mask_img.split()[3], dtype=np.uint8)
    binary = (a >= 160).astype(np.uint8)
    H, W = binary.shape
    total = float(H * W)
    area = float(binary.sum())
    fill = area / total
    if area < total * 0.004:
        return "негодно", dict(reason="маска почти пуста", fill=round(fill, 4))
    if fill > 0.72:
        return "негодно", dict(reason="маска на весь кадр — фон не отделён",
                               fill=round(fill, 3))
    n, _, stats, cent = cv2.connectedComponentsWithStats(binary, 8)
    areas = sorted(stats[1:, cv2.CC_STAT_AREA], reverse=True) if n > 1 else [area]
    main = float(areas[0])
    rest = float(sum(areas[1:])) if len(areas) > 1 else 0.0
    idx = int(np.argmax(stats[1:, cv2.CC_STAT_AREA])) + 1 if n > 1 else 0
    if n > 1:
        _, _, w, h, _ = stats[idx]
    else:
        ys, xs = np.nonzero(binary)
        w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    vert = h / max(1.0, w)
    m = dict(fill=round(fill, 3), parts=int(n - 1),
             rest_pct=round(100 * rest / max(1.0, main + rest), 1),
             vert=round(float(vert), 2), tall=round(float(h) / H, 2))
    # Совсем горизонтальная и мелкая клякса — это не памятник.
    if vert < 0.55 and m["tall"] < 0.45:
        return "негодно", dict(reason="не похоже на памятник", **m)
    if m["rest_pct"] > 12 or vert < 0.9:
        return "сомнительно", m
    return "ok", m


def frame_score(mask_img):
    """Насколько маска годится в силуэт: чем больше, тем лучше.

    Нужна, когда у памятника несколько кадров: дешёвая попытка спасти объект
    другим снимком до дорогой (ручной отрисовки). Считаем то же, на чём стоит
    вердикт: вертикальность, доля кадра по высоте, чистота от посторонних
    кусков и умеренная заливка (маска на весь кадр — это не отделённый фон).
    """
    import cv2
    a = np.array(mask_img.split()[3], dtype=np.uint8)
    binary = (a >= 160).astype(np.uint8)
    H, W = binary.shape
    area = float(binary.sum())
    if area < H * W * 0.004:
        return -1.0
    fill = area / (H * W)
    n, _, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    if n <= 1:
        return -1.0
    order = np.argsort(stats[1:, cv2.CC_STAT_AREA])[::-1] + 1
    i = int(order[0])
    _, _, w, h, main = stats[i]
    rest = float(stats[1:, cv2.CC_STAT_AREA].sum() - main)
    vert = h / max(1.0, w)
    clean = 1.0 - min(1.0, rest / max(1.0, float(main)))
    # Заливка около 0.15–0.45 — здоровая; к 0.72 фон не отделён.
    fill_ok = 1.0 - min(1.0, abs(fill - 0.28) / 0.44)
    return min(vert, 5.0) / 5.0 * 3.0 + (h / H) * 2.0 + clean * 2.0 + fill_ok * 1.5


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--report", default=None)
    ap.add_argument("--all-frames", action="store_true",
                    help="прогнать ВСЕ кадры объекта и взять лучшую маску")
    args = ap.parse_args()

    from rembg import new_session, remove
    session = new_session(model_name="u2net")

    corpus = {m["id"] for m in json.load(CORPUS.open(encoding="utf-8"))["items"]}
    manifest = json.load((ROOT / "manifest.json").open(encoding="utf-8"))
    done = {k for k, v in json.load((ROOT / "silhouettes.json").open(encoding="utf-8")).items()
            if not k.startswith("_")}

    todo = sorted(k for k in corpus if manifest.get(k) and k not in done)
    if args.limit:
        todo = todo[:args.limit]

    out_index, report = {}, []
    t0 = time.time()
    for i, mid in enumerate(todo, 1):
        photos = manifest.get(mid) or []
        if not photos:
            continue
        src = ROOT / mid / photos[0]
        if not src.exists():
            report.append((mid, "негодно", {"reason": "снимок потерян"}))
            continue
        sil_dir = ROOT / mid / "silhouettes"
        sil_dir.mkdir(exist_ok=True)

        def mask_for(rel_photo):
            """Маска для одного кадра — с диска, если уже считана."""
            p = ROOT / mid / rel_photo
            dst = sil_dir / (Path(rel_photo).stem + ".png")
            if dst.exists() and dst.stat().st_size > 0:
                return Image.open(dst).convert("RGBA"), dst
            im = Image.open(io.BytesIO(
                remove(p.read_bytes(), session=session))).convert("RGBA")
            bb = im.getbbox()
            if bb:
                im = im.crop(bb)
            if max(im.size) > MAX_SIDE:
                r = MAX_SIDE / max(im.size)
                im = im.resize((int(im.size[0] * r), int(im.size[1] * r)), Image.LANCZOS)
            im.save(dst, "PNG", optimize=True)
            return im, dst

        try:
            # Несколько кадров — берём лучший по автометрике. Это бесплатная
            # попытка спасти объект до дорогой ручной отрисовки. Кадров больше
            # одного всего у 16 памятников из 283, но среди них Рыбинск и
            # Алексеев — обе кляксы пилота, так что попытка не теоретическая.
            frames = photos if (args.all_frames and len(photos) > 1) else photos[:1]
            best, out, best_s = None, None, -9e9
            for rel in frames:
                if not (ROOT / mid / rel).exists():
                    continue
                im, dst = mask_for(rel)
                s = frame_score(im) if len(frames) > 1 else 0.0
                if s > best_s:
                    best, out, best_s = im, dst, s
            if best is None:
                report.append((mid, "негодно", {"reason": "снимок потерян"}))
                continue
            img = best
            v, m = verdict(img)
            if len(frames) > 1:
                m = dict(m, frames=len(frames), picked=out.name[:28], score=round(best_s, 2))
            report.append((mid, v, m))
            if v != "негодно":
                out_index[mid] = "silhouettes/" + out.name
        except Exception as e:                      # noqa: BLE001
            report.append((mid, "негодно", {"reason": f"{type(e).__name__}: {e}"}))
        if i % 25 == 0:
            print(f"  … {i}/{len(todo)}, {time.time() - t0:.0f} c", flush=True)

    counts = {}
    for _, v, _ in report:
        counts[v] = counts.get(v, 0) + 1
    print("\n=== вердикты: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    print(f"=== обработано {len(report)} из {len(todo)}; годных масок {len(out_index)}")
    print(f"=== время {time.time() - t0:.0f} c")

    if args.report:
        with Path(args.report).open("w", encoding="utf-8") as f:
            json.dump({"index": out_index,
                       "report": [{"id": a, "verdict": b, **c} for a, b, c in report]},
                      f, ensure_ascii=False, indent=1)
        print(f"=== отчёт записан: {args.report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
