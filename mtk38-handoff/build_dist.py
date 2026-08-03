#!/usr/bin/env python3
# МТК 38 · build_dist.py
# Собирает ИЗОЛИРОВАННУЮ версию МТК 38 в mtk38-build/ — самодостаточную папку под
# подачу и офлайн-киоск: варианты показа, карточки с изданиями, данные, шрифты,
# обложки, вендоренные библиотеки. Ни координаторского хаба, ни остального репозитория.
#
# Приём: раскладка внутри сборки ЗЕРКАЛИТ репозиторий (mtk38-v3/, mtk38-v2/, data/,
# assets/), поэтому относительные пути в страницах менять не нужно вообще —
# '../data/mtk38.json' и '../../assets/shared/lib/projection.js' резолвятся как были.
#
# Папка НЕ коммитится (свой .gitignore внутри): вендоренный Three.js и текстуры
# удвоили бы репозиторий, который и так у лимита 200 МБ. Пересобирается за секунды.
#
# Запуск:  python3 mtk38-handoff/build_dist.py
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "mtk38-build"

# Что кладём. Пути — от корня репозитория, в сборке остаются теми же.
COPY = [
    "mtk38-v3/globe.html", "mtk38-v3/rain.html", "mtk38-v3/map.html",
    "mtk38-v3/engine", "mtk38-v3/scenes", "mtk38-v3/vendor", "mtk38-v3/fonts",
    "mtk38-v2/studio", "mtk38-v2/shared", "mtk38-v2/vendor", "mtk38-v2/fonts",
    "data/mtk38.json", "data/mtk38-publications.json", "data/mtk38-quotes.json",
    "data/ne_110m_countries.geojson",
    "assets/mtk38/covers", "assets/mtk38/textures", "assets/mtk38/lib",
    "mtk38-catalog", "mtk38-cloud", "mtk38-poster", "mtk38-rain", "mtk38-ticker",
    # v2 ссылается на брендовые шрифты наружу (../../assets/shared/fonts/brand) — без них
    # в сборке 20 Kopeek/21 Cent/Nolde не грузились и текст падал на системный
    "assets/shared/fonts/brand",
    "assets/shared/lib/projection.js",
]

# Варианты в переключателе. url — от корня сборки.
VARIANTS = [
    ("v1", "catalog", "Каталог",  "mtk38-catalog/",  "Сетка карточек, 42 языка"),
    ("v1", "poster",  "Постер",   "mtk38-poster/",   "Типографическая композиция"),
    ("v1", "cloud",   "Облако",   "mtk38-cloud/",    "Слова дрейфуют в объёме"),
    ("v1", "rain1",   "Дождь v1", "mtk38-rain/",     "Слова падают с физикой"),
    ("v1", "ticker",  "Лента",    "mtk38-ticker/",   "Бегущие строки"),
    ("v3", "globe", "Глобус", "mtk38-v3/globe.html", "Кольца слов на сфере, WebGPU"),
    ("v3", "rain",  "Дождь",  "mtk38-v3/rain.html",  "Слова всплывают, GPU-частицы"),
    ("v3", "map",   "Карта",  "mtk38-v3/map.html",   "Написания по миру, Winkel Tripel"),
    ("v2", "studio", "Студия", "mtk38-v2/studio/",   "7 композиций в одном движке"),
]

INDEX = """<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>МТК 38 · «Ленин» на языках мира</title>
<style>
  :root{--paper:#F7F9EF;--brass:#D2B773;--red:#A02128;--graphite:#435059;--window:#9DA3A8;--bar:64px}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;overflow:hidden;background:#0f1318;color:var(--paper);
    font-family:"20 Kopeek",ui-monospace,Menlo,monospace}
  #stage{position:fixed;inset:0 0 var(--bar) 0}
  #stage iframe{width:100%;height:100%;border:0;display:block;background:#0f1318}
  #bar{position:fixed;left:0;right:0;bottom:0;height:var(--bar);display:flex;align-items:center;gap:10px;
    padding:0 16px;background:rgba(16,20,26,.94);border-top:1px solid rgba(210,183,115,.28);
    backdrop-filter:blur(10px);overflow-x:auto;-webkit-overflow-scrolling:touch}
  #title{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--window);
    white-space:nowrap;margin-right:6px}
  #title b{color:var(--brass);font-weight:600}
  .v{flex:0 0 auto;height:40px;padding:0 16px;border:1px solid rgba(210,183,115,.34);border-radius:9px;
    background:transparent;color:var(--paper);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
  .v[aria-current="true"]{background:var(--brass);color:#1a1f23;border-color:var(--brass);font-weight:600}
  .v small{display:block;font-size:10px;color:var(--window);letter-spacing:.02em}
  .v[aria-current="true"] small{color:rgba(26,31,35,.7)}
  .gen{flex:0 0 auto;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--window);
    opacity:.7;padding:0 4px}
  #count{margin-left:auto;flex:0 0 auto;font-size:11px;color:var(--window);white-space:nowrap}
</style>
</head><body>
<div id="stage"><iframe id="f" title="вариант показа"></iframe></div>
<nav id="bar">
  <span id="title">МТК 38 · <b>«Ленин»</b> на языках мира</span>
  __BUTTONS__
  <span id="count">__COUNT__ языков · __PUBS__ изданий</span>
</nav>
<script>
  var V = __VARIANTS__;
  var f = document.getElementById('f');
  function go(i, push) {
    var v = V[i];
    f.src = v.url;
    [].forEach.call(document.querySelectorAll('.v'), function (b, k) {
      b.setAttribute('aria-current', k === i ? 'true' : 'false');
    });
    if (push !== false) history.replaceState(null, '', '#' + v.slug);
  }
  [].forEach.call(document.querySelectorAll('.v'), function (b, k) {
    b.addEventListener('click', function () { go(k); });
  });
  var start = V.findIndex(function (v) { return v.slug === location.hash.slice(1); });
  go(start >= 0 ? start : 0, false);
  // стрелки ← → листают варианты (удобно на киоске с клавиатурой)
  addEventListener('keydown', function (e) {
    var cur = V.findIndex(function (v) { return f.src.indexOf(v.url) >= 0; });
    if (e.key === 'ArrowRight') go((cur + 1) % V.length);
    if (e.key === 'ArrowLeft') go((cur - 1 + V.length) % V.length);
  });
</script>
</body></html>
"""


def main():
    import json
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    total = 0
    for rel in COPY:
        src = ROOT / rel
        dst = OUT / rel
        if not src.exists():
            print(f"  ⚠ нет {rel}", file=sys.stderr); continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
        n = sum(f.stat().st_size for f in ([dst] if dst.is_file() else dst.rglob("*")) if f.is_file())
        total += n
        print(f"  {rel:44} {n/1024:8.0f} КБ")

    langs = json.loads((ROOT / "data/mtk38.json").read_text(encoding="utf-8"))["languages"]
    pubs = json.loads((ROOT / "data/mtk38-publications.json").read_text(encoding="utf-8"))["publications"]

    buttons, meta, gen = [], [], None
    for v, slug, label, url, hint in VARIANTS:
        if v != gen:
            buttons.append(f'<span class="gen">{v}</span>')
            gen = v
        buttons.append(f'<button class="v">{label}<small>{hint}</small></button>')
        meta.append({"slug": slug, "url": url})

    html = (INDEX
            .replace("__BUTTONS__", "\n  ".join(buttons))
            .replace("__VARIANTS__", json.dumps(meta, ensure_ascii=False))
            .replace("__COUNT__", str(len(langs)))
            .replace("__PUBS__", str(len(pubs))))
    (OUT / "index.html").write_text(html, encoding="utf-8")

    # сборка не коммитится: вендоренный Three.js и текстуры удвоили бы репозиторий
    (OUT / ".gitignore").write_text("*\n!.gitignore\n", encoding="utf-8")

    print(f"\nсборка: {OUT.relative_to(ROOT)}/  ·  {total/1024/1024:.1f} МБ  ·  "
          f"{len(VARIANTS)} вариантов · {len(langs)} языков · {len(pubs)} изданий")
    print("смотреть: открыть index.html через http (модули v3 требуют http, не file://)")


if __name__ == "__main__":
    main()
