#!/usr/bin/env python3
"""Re-parse the .doc keeping Word cell/row markers, emit the table as JSON."""
import sys, json, struct, olefile

path = sys.argv[1]
ole = olefile.OleFileIO(path)
wd = ole.openstream("WordDocument").read()
flags = struct.unpack_from("<H", wd, 0x000A)[0]
tbl = ole.openstream("1Table" if (flags >> 9) & 1 else "0Table").read()
fcClx, lcbClx = struct.unpack_from("<II", wd, 0x01A2)
clx = tbl[fcClx:fcClx + lcbClx]

i, pcdt = 0, None
while i < len(clx):
    if clx[i] == 0x01:
        i += 3 + struct.unpack_from("<h", clx, i + 1)[0]
    elif clx[i] == 0x02:
        lcb = struct.unpack_from("<I", clx, i + 1)[0]
        pcdt = clx[i + 5: i + 5 + lcb]
        break
    else:
        raise SystemExit("bad clx")

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

# \x07 = end of cell AND end of row (row end is an extra \x07 right after last cell)
# \r inside a cell = paragraph break
rows, cur, cell = [], [], []
j = 0
while j < len(text):
    ch = text[j]
    if ch == "\x07":
        cur.append("".join(cell).strip())
        cell = []
        # a row terminator shows up as the cell-end of a zero-length trailing cell
        if j + 1 < len(text) and text[j + 1] == "\x07":
            rows.append(cur)
            cur = []
            j += 1
    elif ch in "\r\x0b\x0c":
        cell.append("\n")
    else:
        cell.append(ch)
    j += 1
if cur:
    rows.append(cur)

rows = [[c for c in r] for r in rows if any(c.strip() for c in r)]
print(f"rows={len(rows)}", file=sys.stderr)
from collections import Counter
print("widths:", Counter(len(r) for r in rows).most_common(), file=sys.stderr)
json.dump(rows, sys.stdout, ensure_ascii=False, indent=1)
