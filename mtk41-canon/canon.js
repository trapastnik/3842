(function () {
  const canon = document.getElementById("canon");
  const cardEl = document.getElementById("card");
  const cardClose = document.getElementById("card-close");
  const cardPhoto = document.getElementById("card-photo");
  const cardYear = document.getElementById("card-year");
  const cardTitle = document.getElementById("card-title");
  const cardPlace = document.getElementById("card-place");
  const cardAuthor = document.getElementById("card-author");
  const cardText = document.getElementById("card-text");
  const cardStatus = document.getElementById("card-status");

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
  let modelsManifest = {};

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

      tile.addEventListener("click", () => showCard(item.i));
      canon.appendChild(tile);
    }
  }

  function populateCardModels(monumentId) {
    const cont = document.getElementById("card-models");
    if (!cont) return;
    const list = modelsManifest[monumentId] || [];
    // remove old entries (keep the heading)
    cont.querySelectorAll(".card-model").forEach(el => el.remove());
    if (!list.length) { cont.hidden = true; return; }
    for (const m of list) {
      const a = document.createElement("a");
      a.className = "card-model" + (m.exact_match ? " exact" : "");
      a.href = m.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = m.name;
      const meta = document.createElement("span");
      meta.className = "card-model-meta";
      const parts = [];
      if (m.license) parts.push("лицензия: " + m.license);
      if (m.author) parts.push("автор: " + m.author);
      if (m.downloadable) parts.push("скачивается: " + m.downloadable);
      meta.textContent = parts.join(" · ");
      a.appendChild(meta);
      cont.appendChild(a);
    }
    cont.hidden = false;
  }

  function showCard(index) {
    const m = monuments[index];
    if (!m) return;

    cardYear.textContent = m.year ? String(m.year) : "год не установлен";
    cardTitle.textContent = m.title || "";
    cardPlace.textContent = [m.city, m.country].filter(Boolean).join(" · ");
    const a = [];
    if (m.sculptors && m.sculptors.length) a.push("Скульптор: " + m.sculptors.join(", "));
    if (m.architects && m.architects.length) a.push("Архитектор: " + m.architects.join(", "));
    cardAuthor.textContent = a.join(" · ");
    cardText.textContent = m.short_text || "";
    cardStatus.textContent = statusLabel(m.status);
    cardStatus.setAttribute("data-status", m.status || "unknown");

    cardPhoto.style.backgroundImage = "";
    cardPhoto.classList.remove("empty");
    cardPhoto.textContent = "";
    const photos = photoManifest[m.id];
    if (photos && photos.length) {
      const src = `../assets/mtk41/${m.id}/${photos[0]}`;
      cardPhoto.style.backgroundImage = `url("${encodeURI(src)}")`;
    } else {
      cardPhoto.classList.add("empty");
      cardPhoto.textContent = "фото не найдено";
    }
    populateCardModels(m.id);
    cardEl.hidden = false;
  }

  function hideCard() { cardEl.hidden = true; }
  cardClose.addEventListener("click", hideCard);

  // Tap outside card closes it
  document.addEventListener("pointerdown", event => {
    if (cardEl.hidden) return;
    if (cardEl.contains(event.target)) return;
    if (event.target.closest(".tile")) return;
    hideCard();
  });

  Promise.all([
    fetch("../data/mtk41.json").then(r => r.json()),
    fetch("../assets/mtk41/manifest.json").then(r => r.json()).catch(() => ({})),
      fetch("../assets/mtk41/models.json").then(r => r.json()).catch(() => ({})),
  ]).then(([mtk, manifest, models]) => {
    monuments = mtk.items || [];
    photoManifest = manifest || {};
      modelsManifest = models || {};
    render();
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.warn("Load failed:", err);
  });
})();
