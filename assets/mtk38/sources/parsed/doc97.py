#!/usr/bin/env python3
"""Extract text from a Word 97-2003 (.doc) OLE2 file via the piece table."""
import sys, struct, olefile

path = sys.argv[1]
ole = olefile.OleFileIO(path)
print("STREAMS:", [ "/".join(s) for s in ole.listdir() ], file=sys.stderr)

wd = ole.openstream("WordDocument").read()

# FIB
wIdent, nFib = struct.unpack_from("<HH", wd, 0)
flags = struct.unpack_from("<H", wd, 0x000A)[0]
fWhichTblStm = (flags >> 9) & 1
tbl_name = "1Table" if fWhichTblStm else "0Table"
print(f"wIdent={wIdent:#06x} nFib={nFib} table={tbl_name}", file=sys.stderr)

tbl = ole.openstream(tbl_name).read()

fcClx, lcbClx = struct.unpack_from("<II", wd, 0x01A2)
clx = tbl[fcClx:fcClx + lcbClx]

# Walk Clx: 0x01 = Prc (skip), 0x02 = Pcdt
i = 0
pcdt = None
while i < len(clx):
    t = clx[i]
    if t == 0x01:
        cb = struct.unpack_from("<h", clx, i + 1)[0]
        i += 3 + cb
    elif t == 0x02:
        lcb = struct.unpack_from("<I", clx, i + 1)[0]
        pcdt = clx[i + 5: i + 5 + lcb]
        break
    else:
        raise SystemExit(f"unexpected Clx token {t:#x} at {i}")

# PlcPcd: (n+1) CPs (4 bytes each) then n PCDs (8 bytes each)
n = (len(pcdt) - 4) // 12
cps = list(struct.unpack_from("<%dI" % (n + 1), pcdt, 0))
out = []
for k in range(n):
    off = 4 * (n + 1) + 8 * k
    fc = struct.unpack_from("<I", pcdt, off + 2)[0]
    cch = cps[k + 1] - cps[k]
    if fc & 0x40000000:          # 8-bit (cp1251 here)
        fc = (fc & ~0x40000000) // 2
        raw = wd[fc: fc + cch]
        out.append(raw.decode("cp1251", "replace"))
    else:                         # UTF-16LE
        raw = wd[fc: fc + cch * 2]
        out.append(raw.decode("utf-16-le", "replace"))

text = "".join(out)
# Word control chars: \r = para end, \x07 = cell/row end, \x0b = line break
text = (text.replace("\r", "\n").replace("\x07", "\t")
            .replace("\x0b", "\n").replace("\x0c", "\n"))
sys.stdout.write(text)
print(f"\n--- pieces={n} chars={len(text)}", file=sys.stderr)
