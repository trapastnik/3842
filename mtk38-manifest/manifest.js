(function () {
  const canvas = document.getElementById("manifest");
  const ctx = canvas.getContext("2d", { alpha: true });

  const palette = {
    paper: "#F7F9EF",
    brass: "#D2B773",
    red: "#A02128",
    window: "#9DA3A6",
    black: "#000000"
  };

  // Lenin-variants — these are the words to be HIGHLIGHTED inline within the
  // manifesto body, replacing the placeholder marker {LENIN}.
  const leninWords = [
    { text: "Ленин",   lang: "Русский",    script: "cyrillic" },
    { text: "Lenin",   lang: "English",    script: "latin" },
    { text: "Lénine",  lang: "Français",   script: "latin" },
    { text: "Lenin",   lang: "Español",    script: "latin" },
    { text: "لينين",   lang: "العربية",   script: "arabic" },
    { text: "列宁",     lang: "中文",        script: "cjk" },
    { text: "लेनिन",   lang: "Hindi",      script: "devanagari" },
    { text: "লেনিন",   lang: "Bengali",    script: "bengali" },
    { text: "Lênin",   lang: "Português",  script: "latin" },
    { text: "Lenin",   lang: "Deutsch",    script: "latin" },
    { text: "Lenin",   lang: "Italiano",   script: "latin" },
    { text: "Lenin",   lang: "Polski",     script: "latin" },
    { text: "Lenin",   lang: "Türkçe",     script: "latin" },
    { text: "Lenin",   lang: "Indonesia",  script: "latin" },
    { text: "Lênin",   lang: "Tiếng Việt", script: "latin" },
    { text: "Lenin",   lang: "Kiswahili",  script: "latin" },
    { text: "Ленін",   lang: "Українська", script: "cyrillic" },
    { text: "Ленін",   lang: "Беларуская", script: "cyrillic" },
    { text: "Ленин",   lang: "Қазақша",    script: "cyrillic" },
    { text: "Ленин",   lang: "Кыргызча",   script: "cyrillic" },
    { text: "Ленин",   lang: "Монгол",     script: "cyrillic" },
    { text: "Լենին",   lang: "Հայերեն",    script: "armenian" },
    { text: "ლენინი",  lang: "ქართული",   script: "georgian" },
    { text: "Λένιν",   lang: "Ελληνικά",   script: "greek" },
    { text: "לנין",    lang: "עברית",     script: "hebrew" },
    { text: "لنین",    lang: "فارسی",     script: "arabic" },
    { text: "لینن",    lang: "اردو",      script: "arabic" },
    { text: "レーニン", lang: "日本語",      script: "cjk" },
    { text: "레닌",     lang: "한국어",      script: "hangul" },
    { text: "เลนิน",   lang: "ไทย",       script: "thai" },
    { text: "லெனின்",  lang: "தமிழ்",     script: "tamil" },
    { text: "లెనిన్",  lang: "తెలుగు",    script: "telugu" },
    { text: "ಲೆನಿನ್",  lang: "ಕನ್ನಡ",     script: "kannada" },
    { text: "ലെനിൻ",  lang: "മലയാളം",   script: "malayalam" },
    { text: "ਲੈਨਿਨ",   lang: "ਪੰਜਾਬੀ",    script: "gurmukhi" },
    { text: "लेनिन",   lang: "मराठी",     script: "devanagari" },
    { text: "लेनिन",   lang: "नेपाली",    script: "devanagari" },
    { text: "ලෙනින්",  lang: "සිංහල",    script: "sinhala" },
    { text: "ሌኒን",     lang: "Amharic",   script: "ethiopic" },
    { text: "ເລນິນ",   lang: "ລາວ",       script: "lao" },
    { text: "លេនីន",   lang: "ខ្មែរ",     script: "khmer" },
    { text: "လီနင်",   lang: "မြန်မာ",   script: "myanmar" }
  ];

  // Manifesto body — public-domain political vocabulary, neutral compositional placeholder.
  // {LENIN} markers will be replaced by Lenin-variants from leninWords in rotation.
  const manifestoSource = `
Имя {LENIN} прозвучало в начале XX века как формула эпохи, в которой судьба миллионов
оказалась связана с движением масс, с историей классовой борьбы и с верой в иную возможность
устройства общества. Языки, на которых это имя записано, столь же разнообразны, сколь
разнообразны культуры, втянутые в орбиту русского революционного опыта. {LENIN} в Шанхае
звучал иначе, чем {LENIN} в Берлине, и совершенно по-новому проступал {LENIN} в речах
афганских студентов, кубинских поэтов, индийских философов, вьетнамских командиров,
танзанийских профсоюзов и латиноамериканских теологов освобождения.

Мысль о справедливости, о труде как основе человеческого достоинства, о неизбежности
конфликта между трудом и капиталом обрела имя — {LENIN} — и распространилась по континентам
со скоростью телеграфа. Эта мысль оказалась переводимой почти на всё, что может быть
языком, и одновременно она наталкивалась на местные традиции, на местную религию, на
местные обиды и надежды. {LENIN} становился частью национальных мифов, иногда сливаясь
с фигурами учителей и пророков, иногда — с фигурами трибунов и судей.

В рабочих кварталах Парижа и в горных деревнях Перу, в кофейнях Бейрута и в портах Дакки,
в библиотеках Аддис-Абебы и в чайханах Бухары, в студенческих кружках Калькутты и на
плантациях Гаваны, в собраниях аборигенов Андамана и в шахтёрских городках Урала — {LENIN}
читался по-разному. Одни видели в нём вождя угнетённых, другие — теоретика государства,
третьи — диктатора, четвёртые — пророка социального равенства. Но именно множественность
этих прочтений и составляет феномен мирового присутствия одного имени.

Музей собирает эти прочтения. Каждое слово на стене — это голос культуры, которая
встретилась с этой фигурой и приняла её на своих условиях. {LENIN} на тамильском — это
не то же самое, что {LENIN} на хинди; {LENIN} на лаосском не равен {LENIN} на кхмерском.
Письменность хранит память о том, как идея переходила границу — иногда мирно, иногда
с тяжёлыми последствиями для тех, кто её произносил.

XX век сделал имя {LENIN} нарицательным. С ним связано слишком много, чтобы упростить.
Здесь, в этом зале, мы пытаемся не упрощать. Мы предлагаем смотреть на букву, на слог,
на интонацию — и слышать, как одна и та же мысль звучит на сорока двух языках мира.

Скажите вслух: {LENIN}. И ещё раз — {LENIN}. И ещё. Услышите ли вы то же самое имя?
Или каждый раз — что-то новое, чужое, своё?

Здесь нет ответа. Здесь — голоса.
`.trim();

  let width = 0, height = 0, dpr = 1;
  let start = performance.now();
  let previousTime = 0;

  // Layout state: list of token objects with positions
  let tokens = [];     // each: { text, font, size, weight, isLenin, langInfo?, color, x, y, w, h, lineIndex }
  let contentHeight = 0;

  // Scroll state
  const scroll = {
    y: 0,
    autoSpeed: 18,       // px/sec auto-scroll up
    velocity: 0,
    dragging: false
  };

  let hoverLenin = -1;  // index into tokens
  let lastPointerX = 0, lastPointerY = 0, lastPointerTime = 0;

  function fontStack(script, size, weight) {
    const fallback = '"Noto Sans","Noto Serif","Arial Unicode MS","Arial",sans-serif';
    if (script === "latin" || script === "cyrillic" || script === "greek") {
      return `${weight} ${size}px "Nolde", ${fallback}`;
    }
    return `${weight} ${size}px ${fallback}`;
  }

  function cssColor(hex, alpha) {
    const v = hex.replace("#", "");
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function tokenize(text) {
    // Split into tokens, replacing {LENIN} with sequential Lenin-variants
    const result = [];
    let leninCounter = 0;
    const lines = text.split(/(\n+)/);
    for (const piece of lines) {
      if (piece.startsWith("\n")) {
        result.push({ kind: "br", count: (piece.match(/\n/g) || []).length });
        continue;
      }
      const parts = piece.split(/(\s+|\{LENIN\})/g).filter(Boolean);
      for (const part of parts) {
        if (part === "{LENIN}") {
          const variant = leninWords[leninCounter % leninWords.length];
          leninCounter += 1;
          result.push({ kind: "lenin", text: variant.text, lang: variant.lang, script: variant.script });
        } else if (/^\s+$/.test(part)) {
          result.push({ kind: "space", text: " " });
        } else {
          result.push({ kind: "word", text: part });
        }
      }
    }
    return result;
  }

  function layout() {
    tokens = [];
    const shortSide = Math.min(width, height);
    const isPortrait = height >= width;
    const margin = isPortrait ? width * 0.08 : width * 0.12;
    const maxWidth = width - margin * 2;

    const bodySize = isPortrait ? shortSide * 0.026 : shortSide * 0.020;
    const leninSize = bodySize * 1.18;
    const lineHeight = bodySize * 1.7;

    const rawTokens = tokenize(manifestoSource);

    let x = margin;
    let y = lineHeight;
    let lineIndex = 0;

    for (let i = 0; i < rawTokens.length; i += 1) {
      const t = rawTokens[i];

      if (t.kind === "br") {
        // Paragraph break
        x = margin;
        y += lineHeight * (t.count > 1 ? 1.4 : 0.6);
        lineIndex += 1;
        continue;
      }
      if (t.kind === "space") {
        // measure space width in body font
        ctx.font = fontStack("cyrillic", bodySize, 400);
        const sw = ctx.measureText(" ").width;
        // don't add a leading space at the start of a line
        if (x > margin + 0.5) {
          x += sw;
        }
        continue;
      }

      const isLenin = t.kind === "lenin";
      const script = isLenin ? t.script : "cyrillic";
      const size = isLenin ? leninSize : bodySize;
      const weight = isLenin ? 600 : 400;
      const font = fontStack(script, size, weight);

      ctx.font = font;
      const w = ctx.measureText(t.text).width;

      // Wrap if doesn't fit
      if (x + w > margin + maxWidth) {
        x = margin;
        y += lineHeight;
        lineIndex += 1;
      }

      tokens.push({
        text: t.text,
        font,
        size,
        weight,
        script,
        isLenin,
        lang: t.lang,
        x,
        y,
        w,
        h: lineHeight,
        lineIndex
      });

      x += w;
    }

    contentHeight = y + lineHeight;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
  }

  function applyDynamics(dt) {
    if (scroll.dragging) return;
    scroll.y += (scroll.velocity + scroll.autoSpeed) * dt;
    // Decay manual velocity, keep autoSpeed
    scroll.velocity *= Math.pow(0.92, dt * 60);
    if (Math.abs(scroll.velocity) < 0.5) scroll.velocity = 0;

    // Loop: when content has scrolled past the top, reset to bottom
    const maxScroll = contentHeight + height;
    if (scroll.y > maxScroll) {
      scroll.y -= maxScroll;
    }
    if (scroll.y < -height) {
      scroll.y += maxScroll;
    }
  }

  function drawToken(tok, screenY) {
    ctx.font = tok.font;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    if (tok.isLenin) {
      ctx.fillStyle = palette.brass;
      ctx.shadowColor = cssColor(palette.black, 0.65);
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.96;
      ctx.fillText(tok.text, tok.x, screenY);
      // Underline (thin brass)
      ctx.strokeStyle = cssColor(palette.brass, 0.55);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const underY = screenY + tok.size * 0.18;
      ctx.moveTo(tok.x, underY);
      ctx.lineTo(tok.x + tok.w, underY);
      ctx.stroke();
    } else {
      ctx.fillStyle = palette.paper;
      ctx.shadowColor = cssColor(palette.black, 0.45);
      ctx.shadowBlur = 3;
      ctx.globalAlpha = 0.86;
      ctx.fillText(tok.text, tok.x, screenY);
    }
  }

  function drawTooltip(tok, screenY) {
    const label = tok.lang;
    const fontSize = Math.min(width, height) * 0.022;
    ctx.save();
    ctx.font = `400 ${fontSize}px "20 Kopeek", "Courier New", monospace`;
    const padding = fontSize * 0.7;
    const tw = ctx.measureText(label).width + padding * 2;
    const th = fontSize * 1.6 + padding * 0.8;
    let bx = tok.x + tok.w * 0.5 - tw * 0.5;
    let by = screenY - tok.size - th - 6;
    if (bx < 6) bx = 6;
    if (bx + tw > width - 6) bx = width - tw - 6;
    if (by < 6) by = screenY + 10;

    ctx.fillStyle = cssColor(palette.black, 0.86);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, tw, th, 4) : ctx.rect(bx, by, tw, th);
    ctx.fill();

    ctx.strokeStyle = cssColor(palette.brass, 0.75);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = palette.brass;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx + tw * 0.5, by + th * 0.5);
    ctx.restore();
  }

  function render(now) {
    const time = (now - start) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, time - previousTime));
    previousTime = time;
    applyDynamics(dt);

    ctx.clearRect(0, 0, width, height);

    // Render tokens within visible vertical window
    const offset = -scroll.y;
    let hoverTok = null;
    let hoverScreenY = 0;

    for (let i = 0; i < tokens.length; i += 1) {
      const tok = tokens[i];
      const screenY = tok.y + offset;
      if (screenY < -tok.h * 2 || screenY > height + tok.h * 2) continue;
      drawToken(tok, screenY);
      if (i === hoverLenin) {
        hoverTok = tok;
        hoverScreenY = screenY;
      }
    }

    // Tooltip on top
    if (hoverTok) drawTooltip(hoverTok, hoverScreenY);

    requestAnimationFrame(render);
  }

  function findLeninAt(x, y) {
    const offset = -scroll.y;
    for (let i = 0; i < tokens.length; i += 1) {
      const tok = tokens[i];
      if (!tok.isLenin) continue;
      const screenY = tok.y + offset;
      if (y >= screenY - tok.size && y <= screenY + tok.size * 0.3 &&
          x >= tok.x && x <= tok.x + tok.w) {
        return i;
      }
    }
    return -1;
  }

  window.addEventListener("resize", resize);

  canvas.addEventListener("pointermove", event => {
    if (scroll.dragging) {
      const now = performance.now();
      const dy = event.clientY - lastPointerY;
      const dt = Math.max(16, now - lastPointerTime) / 1000;
      scroll.y -= dy;
      scroll.velocity = -dy / dt;
      lastPointerY = event.clientY;
      lastPointerTime = now;
    } else {
      hoverLenin = findLeninAt(event.clientX, event.clientY);
    }
  }, { passive: true });

  canvas.addEventListener("pointerdown", event => {
    scroll.dragging = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = performance.now();
    hoverLenin = findLeninAt(event.clientX, event.clientY);
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointerup", event => {
    if (canvas.releasePointerCapture) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }
    scroll.dragging = false;
  });

  canvas.addEventListener("pointerleave", () => {
    scroll.dragging = false;
    hoverLenin = -1;
  });

  canvas.addEventListener("pointercancel", () => {
    scroll.dragging = false;
    hoverLenin = -1;
  });

  resize();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      layout();
      requestAnimationFrame(render);
    });
  } else {
    requestAnimationFrame(render);
  }
})();
