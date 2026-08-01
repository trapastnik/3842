#!/usr/bin/env python3
# МТК 38 · build_covers.py
# Достаёт фотографии обложек изданий из .doc и раскладывает по assets/mtk38/covers/,
# привязывая к записям data/mtk38-publications.json.
#
# Картинки лежат в OLE-потоке Data. Извлекаем В ПОРЯДКЕ СМЕЩЕНИЯ (PNG и JPEG чередуются),
# порядок совпадает с порядком плейсхолдеров \x01 в тексте документа — это и даёт привязку.
#
# Запуск:  python3 mtk38-handoff/build_covers.py [--dry]
import json, re, shutil, struct, subprocess, sys, tempfile
from pathlib import Path

# те же опечатки источника, что и в build_publications.py
FIX_NAME = {"Авадxи": "Авадхи", "Гуаджарати": "Гуджарати",
            "Абхазский язык": "Абхазский", "Татарский язык": "Татарский"}

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / "assets/mtk38/sources/Ленин на языках народов мира.doc"
PUBS = ROOT / "data/mtk38-publications.json"
OUTDIR = ROOT / "assets/mtk38/covers"


def read_streams():
    import olefile
    ole = olefile.OleFileIO(str(DOC))
    wd = ole.openstream("WordDocument").read()
    flags = struct.unpack_from("<H", wd, 0x000A)[0]
    tbl = ole.openstream("1Table" if (flags >> 9) & 1 else "0Table").read()
    return wd, tbl, ole.openstream("Data").read()


def extract_images(data):
    """PNG (по IEND) и JPEG (по FFD9), отсортованные по смещению.
    Кандидаты, попавшие внутрь уже найденной картинки, отбрасываем — сигнатура
    JPEG встречается и внутри пиксельных данных PNG."""
    found = []
    i = 0
    while (i := data.find(b"\x89PNG\r\n\x1a\n", i)) != -1:
        end = data.find(b"IEND\xaeB`\x82", i)
        if end == -1:
            break
        end += 8
        found.append((i, end, "png", data[i:end]))
        i = end
    i = 0
    while (i := data.find(b"\xff\xd8\xff", i)) != -1:
        end = data.find(b"\xff\xd9", i)
        if end == -1:
            break
        end += 2
        found.append((i, end, "jpg", data[i:end]))
        i = end
    found.sort(key=lambda t: t[0])
    clean, last_end = [], -1
    for start, end, ext, blob in found:
        if start < last_end or len(blob) < 2000:      # вложенная сигнатура / мусор
            continue
        clean.append((start, ext, blob))
        last_end = end
    return clean


def placeholder_order(wd, tbl):
    """Языки в порядке появления плейсхолдеров картинок в тексте документа."""
    fcClx, lcbClx = struct.unpack_from("<II", wd, 0x01A2)
    clx = tbl[fcClx:fcClx + lcbClx]
    i, pcdt = 0, None
    while i < len(clx):
        if clx[i] == 0x01:
            i += 3 + struct.unpack_from("<h", clx, i + 1)[0]
        elif clx[i] == 0x02:
            lcb = struct.unpack_from("<I", clx, i + 1)[0]
            pcdt = clx[i + 5:i + 5 + lcb]
            break
    n = (len(pcdt) - 4) // 12
    cps = list(struct.unpack_from("<%dI" % (n + 1), pcdt, 0))
    parts = []
    for k in range(n):
        off = 4 * (n + 1) + 8 * k
        fc = struct.unpack_from("<I", pcdt, off + 2)[0]
        cch = cps[k + 1] - cps[k]
        if fc & 0x40000000:
            fc = (fc & ~0x40000000) // 2
            parts.append(wd[fc:fc + cch].decode("cp1251", "replace"))
        else:
            parts.append(wd[fc:fc + cch * 2].decode("utf-16-le", "replace"))
    text = "".join(parts)

    # идём по ячейкам; запоминаем, в какой строке встретился \x01
    rows, cur, cell, j = [], [], [], 0
    while j < len(text):
        ch = text[j]
        if ch == "\x07":
            cur.append("".join(cell)); cell = []
            if j + 1 < len(text) and text[j + 1] == "\x07":
                rows.append(cur); cur = []; j += 1
        elif ch in "\r\x0b\x0c":
            cell.append("\n")
        else:
            cell.append(ch)
        j += 1
    if cur:
        rows.append(cur)

    order = []
    for r in rows:
        joined = "".join(r)
        n_ph = joined.count("\x01")
        if not n_ph:
            continue
        # имя языка = первая строка ячейки, начинающейся с кириллического названия
        name = ""
        for c in r:
            head = c.split("\n")[0].strip()
            if re.match(r"^[А-ЯЁ][а-яё\- ()]+$", head):
                name = FIX_NAME.get(head, head)
                break
        order.extend([name] * n_ph)
    return order


def to_webp(blob, ext, dest):
    """Пережимаем в webp: 11 МБ фотографий обложек в git при лимите репо 200 МБ — много."""
    if not shutil.which("cwebp"):
        dest.with_suffix("." + ext).write_bytes(blob)
        return dest.with_suffix("." + ext)
    with tempfile.NamedTemporaryFile(suffix="." + ext, delete=False) as tf:
        tf.write(blob)
        src = tf.name
    try:
        subprocess.run(["cwebp", "-quiet", "-q", "80", "-resize", "0", "900", src, "-o", str(dest)],
                       check=True)
    finally:
        Path(src).unlink(missing_ok=True)
    return dest


def main():
    dry = "--dry" in sys.argv
    wd, tbl, data = read_streams()
    imgs = extract_images(data)
    order = placeholder_order(wd, tbl)
    print(f"картинок в Data: {len(imgs)}   плейсхолдеров в тексте: {len(order)}")
    if len(imgs) != len(order):
        print("⚠ количества не совпали — привязка по порядку ненадёжна", file=sys.stderr)

    doc = json.loads(PUBS.read_text(encoding="utf-8"))
    pubs = doc["publications"]
    by_name = {}
    for p in pubs:
        by_name.setdefault(p["name_ru"], []).append(p)

    if not dry:
        OUTDIR.mkdir(parents=True, exist_ok=True)
    used, report = {}, []
    for k, (_, ext, blob) in enumerate(imgs):
        name = order[k] if k < len(order) else ""
        target = by_name.get(name)
        if not target:
            report.append((k, name or "—", "нет записи", ""))
            continue
        seq = used.get(name, 0)
        used[name] = seq + 1
        p = target[min(seq, len(target) - 1)]
        fn = f"{p['lang_id'] or 'x'}-{k:02d}.webp"
        if not dry:
            to_webp(blob, ext, OUTDIR / fn)
        p.setdefault("covers", []).append(f"assets/mtk38/covers/{fn}")
        p.pop("cover", None)
        report.append((k, name, p["lang_id"], fn, len(blob)))

    for k, name, lid, fn, sz in report:
        out = OUTDIR / fn
        new = f"{out.stat().st_size / 1024:.0f}K" if out.exists() else "—"
        print(f"  {k:02d}  {name:22} {lid:6} {fn:16} {sz/1024:6.0f}K → {new}")
    bound = sum(1 for p in pubs if p.get("covers"))
    print(f"\nобложек привязано: {bound} изданий из {len(pubs)}")
    if not dry:
        PUBS.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"→ {PUBS.relative_to(ROOT)}, {OUTDIR.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
