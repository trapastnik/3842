(function () {
  const grid = document.getElementById("grid");
  const cardEl = document.getElementById("card");
  const cardClose = document.getElementById("card-close");
  const cardPhoto = document.getElementById("card-photo");
  const cardYear = document.getElementById("card-year");
  const cardTitle = document.getElementById("card-title");
  const cardPlace = document.getElementById("card-place");
  const cardAuthor = document.getElementById("card-author");
  const cardText = document.getElementById("card-text");
  const cardStatus = document.getElementById("card-status");

  // Brief biographic context — only what's commonly known.
  const SCULPTOR_BIO = {
    "С.Д. Меркуров":      { years: "1881–1952", bio: "Снял посмертную маску Ленина. Главный монументалист 1930-40-х." },
    "Е.В. Вучетич":       { years: "1908–1974", bio: "Автор «Родины-матери» в Волгограде; в Леныиниане — последний по времени гигант, 1973." },
    "Г.Д. Алексеев":      { years: "1881–1951", bio: "Лепил Ленина с натуры в 1919. Первое прижизненное скульптурное изображение." },
    "В.Б. Пинчук":        { years: "1908–1987", bio: "Ленинградская монументалистика; пара с Тауритом — «Ленин и Сталин в Горках»." },
    "Р.К. Таурит":        { years: "1910–1969", bio: "Соавтор Пинчука по «Ленин и Сталин в Горках»." },
    "Хасбулат Аскар-Сарыджа": { years: "1900–1982", bio: "Дагестанский скульптор, автор памятника Ленину в Рыбинске." },
    "Д.Н. Ларионов":      { years: "—",          bio: "Локальный скульптор; памятник Ленину в Уфе, 1924." },
    "Г.В. Нерода":        { years: "1895–1983", bio: "Отец и сын Нерода вместе слепили самую большую голову Ленина в мире — Улан-Удэ." },
    "Ю.Г. Нерода":        { years: "1920–2006", bio: "Сын Г.В. Нероды; соавтор головы Ленина в Улан-Удэ." },
  };

  // Architects we want a thin row for (typically don't get their own card).
  const NOTABLE_ARCHITECTS = new Set([
    "Л.М. Поляков", "А.Н. Душкин", "П.Г. Зильберман",
  ]);

  let monuments = [];
  let photoManifest = {};

  function statusLabel(s) {
    return ({ extant: "Сохранился", demolished: "Снесён", relocated: "Перенесён", unknown: "Судьба неизвестна" }[s]) || "Статус не указан";
  }

  function buildAuthorBuckets() {
    // map: sculptor name → list of monument indices
    const map = new Map();
    const anonIndices = [];

    for (let i = 0; i < monuments.length; i += 1) {
      const m = monuments[i];
      const list = (m.sculptors || []).filter(Boolean);
      if (list.length === 0) {
        anonIndices.push(i);
        continue;
      }
      for (const name of list) {
        if (!map.has(name)) map.set(name, []);
        map.get(name).push(i);
      }
    }

    const buckets = [];
    // Sort: more monuments first, then alphabetic
    const entries = Array.from(map.entries());
    entries.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    for (const [name, indices] of entries) {
      buckets.push({ name, indices, anon: false });
    }
    if (anonIndices.length) {
      buckets.push({ name: "Автор не установлен", indices: anonIndices, anon: true });
    }
    return buckets;
  }

  function render() {
    grid.innerHTML = "";
    const buckets = buildAuthorBuckets();
    for (const b of buckets) {
      const card = document.createElement("div");
      card.className = "author" + (b.anon ? " anon" : "") + (b.indices.length >= 2 ? " featured" : "");

      const nm = document.createElement("h2");
      nm.className = "author-name";
      nm.textContent = b.name;
      card.appendChild(nm);

      const bio = SCULPTOR_BIO[b.name];
      if (bio) {
        const yrs = document.createElement("div");
        yrs.className = "author-years";
        yrs.textContent = bio.years;
        card.appendChild(yrs);
        const bx = document.createElement("p");
        bx.className = "author-bio";
        bx.textContent = bio.bio;
        card.appendChild(bx);
      }

      const works = document.createElement("div");
      works.className = "author-works";
      // Sort works by year (nulls last)
      const sorted = b.indices.slice().sort((a, c) => {
        const ya = monuments[a].year || 9999;
        const yc = monuments[c].year || 9999;
        return ya - yc;
      });
      for (const idx of sorted) {
        const m = monuments[idx];
        const w = document.createElement("div");
        w.className = "work";
        w.setAttribute("data-status", m.status || "unknown");
        const y = document.createElement("span");
        y.className = "work-year";
        y.textContent = m.year ? String(m.year) : "—";
        const t = document.createElement("span");
        t.className = "work-title";
        t.textContent = (m.city ? m.city + " · " : "") + (m.title || "").replace(/^Памятник Ленину /, "");
        w.appendChild(y);
        w.appendChild(t);
        w.addEventListener("click", () => showCard(idx));
        works.appendChild(w);
      }
      card.appendChild(works);

      const cnt = document.createElement("div");
      cnt.className = "author-count";
      cnt.textContent = b.indices.length === 1 ? "1 памятник" :
                        b.indices.length < 5 ? `${b.indices.length} памятника` :
                        `${b.indices.length} памятников`;
      card.appendChild(cnt);

      grid.appendChild(card);
    }
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
    cardEl.hidden = false;
  }

  function hideCard() { cardEl.hidden = true; }
  cardClose.addEventListener("click", hideCard);

  // Tap outside the card closes it
  document.addEventListener("pointerdown", event => {
    if (cardEl.hidden) return;
    if (cardEl.contains(event.target)) return;
    if (event.target.closest(".work")) return;
    hideCard();
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
