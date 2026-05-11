(function () {
  const canon = document.getElementById("canon");

  // Visual weight per monument. Determines grid span — iconic items dominate.
  // 3 = hero (4 cols × 2 rows), 2 = strong (3×2), 1 = standard (2×2).
  const WEIGHTS = {
    "volgograd-1973-vuchetich":     3,
    "moscow-canal-1937-merkurov":   3,
    "ulan-ude-1970-zilberman":      3,
    "chelyabinsk-aloe-pole-1925":   3,
    "merkurov-1958-funeral":        3,

    "kazan-1954-young-volodya":     2,
    "rybinsk-1957-askar-saryja":    2,
    "yaroslavl-1920s":              2,
    "alekseev-1919-bust":           2,
    "gorki-pinchuk-taurit":         2,

    // Remaining default to 1
  };

  const SPAN = {
    3: { col: 4, row: 2 },
    2: { col: 3, row: 2 },
    1: { col: 3, row: 1 },
  };

  let monuments = [];
  let photoManifest = {};

  function statusLabel(s) {
    return ({ extant: "Сохранился", demolished: "Снесён", relocated: "Перенесён", unknown: "Судьба неизвестна" }[s]) || "Статус не указан";
  }

  function buildOrder() {
    // Hero items spread out across the grid; arrange chronologically so the
    // poster reads top-left → bottom-right as 1919 → 1973.
    return monuments
      .map((m, i) => {
        let y = m.year;
        if (typeof y !== "number") {
          if (m.id && m.id.includes("1920s")) y = 1925;
          else if (m.id === "gorki-pinchuk-taurit") y = 1949;
          else y = 1930;
        }
        return { i, year: y, m };
      })
      .sort((a, b) => a.year - b.year || (a.m.city || "").localeCompare(b.m.city || ""));
  }

  let selectedIndex = -1;

  // --- Card delegation ----------------------------------------------------
  // All card UI lives in assets/mtk41/lib/card.{css,js}. Delegate to it.

  function showMonument(index) {
    selectedIndex = index;
    if (window.MtkCard) window.MtkCard.show(monuments[index]);
  }
  function hideMonument() {
    if (window.MtkCard) window.MtkCard.hide();
  }
  document.addEventListener("mtk-card-hidden", () => { selectedIndex = -1; });


  function render() {
    canon.innerHTML = "";
    const order = buildOrder();

    for (const item of order) {
      const m = item.m;
      const w = WEIGHTS[m.id] || 1;
      const span = SPAN[w];

      const tile = document.createElement("button");
      tile.className = "tile";
      tile.type = "button";
      tile.style.gridColumn = `span ${span.col}`;
      tile.style.gridRow = `span ${span.row}`;
      tile.setAttribute("aria-label", `${m.title || ""} ${m.year || ""}`);

      const photos = photoManifest[m.id];
      if (photos && photos.length) {
        const src = `../assets/mtk41/${m.id}/${photos[0]}`;
        tile.style.backgroundImage = `url("${encodeURI(src)}")`;
      } else {
        tile.classList.add("no-photo");
        const sil = document.createElement("div");
        sil.className = "silhouette";
        sil.textContent = "Л";
        tile.appendChild(sil);
      }

      const pip = document.createElement("span");
      pip.className = "tile-status";
      pip.setAttribute("data-status", m.status || "unknown");
      tile.appendChild(pip);

      const cap = document.createElement("div");
      cap.className = "tile-cap";
      const cityLine = document.createElement("div");
      cityLine.className = "tile-city";
      cityLine.textContent = m.city || m.country || "—";
      const yearLine = document.createElement("div");
      yearLine.className = "tile-year";
      yearLine.textContent = m.year ? String(m.year) : (m.id && m.id.includes("1920s")) ? "1920-е" : (m.id === "gorki-pinchuk-taurit") ? "≈1949" : "—";
      cap.appendChild(cityLine);
      cap.appendChild(yearLine);
      tile.appendChild(cap);

      tile.addEventListener("click", () => showMonument(item.i));
      canon.appendChild(tile);
    }
  }


  // Tap outside card closes it
  document.addEventListener("pointerdown", event => {
    const cardEl = document.getElementById("card");
    if (!cardEl || cardEl.hidden) return;
    if (cardEl.contains(event.target)) return;
    if (event.target.closest(".tile")) return;
    hideMonument();
  });

  Promise.all([
    fetch("../data/mtk41.json").then(r => r.json()),
    fetch("../assets/mtk41/manifest.json").then(r => r.json()).catch(() => ({})),
  ]).then(([mtk, manifest]) => {
    monuments = mtk.items || [];
    photoManifest = manifest || {};
    render();
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.warn("Load failed:", err);
  });
})();
