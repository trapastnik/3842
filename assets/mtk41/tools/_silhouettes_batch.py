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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--report", default=None)
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
        out = sil_dir / (Path(photos[0]).stem + ".png")
        try:
            if out.exists() and out.stat().st_size > 0:
                img = Image.open(out).convert("RGBA")
            else:
                img = Image.open(io.BytesIO(
                    remove(src.read_bytes(), session=session))).convert("RGBA")
                bbox = img.getbbox()
                if bbox:
                    img = img.crop(bbox)
                if max(img.size) > MAX_SIDE:
                    r = MAX_SIDE / max(img.size)
                    img = img.resize((int(img.size[0] * r), int(img.size[1] * r)),
                                     Image.LANCZOS)
                img.save(out, "PNG", optimize=True)
            v, m = verdict(img)
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
