// Fonts, text measurement and fitting text into boxes.
(() => {
  const P = (globalThis.Plakat ??= {});

  P.FONTS = {
    'Inter Tight': { css: '"Plakat Inter Tight", "Helvetica Neue", Arial, sans-serif', weights: [400, 700, 900] },
    Jost: { css: '"Plakat Jost", Futura, "Century Gothic", sans-serif', weights: [400, 500, 700] },
    Oswald: { css: '"Plakat Oswald", "Arial Narrow", Impact, sans-serif', weights: [400, 700] },
    'Cormorant Garamond': { css: '"Plakat Cormorant Garamond", Garamond, Georgia, serif', weights: [500, 600] },
  };
  P.fontCss = (name) => (P.FONTS[name] || P.FONTS['Inter Tight']).css;

  // Registers the bundled faces (P.FONT_FACES) and waits for them, at most 2.5 s.
  let fontsPromise = null;
  P.loadFonts = () => {
    if (fontsPromise) return fontsPromise;
    const url = (f) => (globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL(f) : '../' + f);
    const loads = (P.FONT_FACES || []).map((f) => {
      try {
        const face = new FontFace(f.family, `url("${url(f.file)}") format("woff2")`, {
          weight: f.weight, style: f.style, unicodeRange: f.unicodeRange, display: 'block',
        });
        document.fonts.add(face);
        return face.load().catch(() => null);
      } catch {
        return Promise.resolve(null);
      }
    });
    const timeout = new Promise((r) => setTimeout(r, 2500));
    fontsPromise = Promise.race([Promise.all(loads), timeout]);
    return fontsPromise;
  };

  P.applyCase = (s, mode) =>
    mode === 'upper' ? s.toLocaleUpperCase('pl') : mode === 'lower' ? s.toLocaleLowerCase('pl') : s;

  // ---------- Measuring ----------
  // Widths are cached at 100 px and scaled linearly.
  let mctx = null;
  const measureCache = new Map();
  P.measure = (text, { font, weight = 400, style = 'normal', size = 100, tracking = 0 }) => {
    const key = `${font}|${weight}|${style}|${tracking}|${text}`;
    let w100 = measureCache.get(key);
    if (w100 == null) {
      mctx ??= document.createElement('canvas').getContext('2d');
      mctx.font = `${style} ${weight} 100px ${P.fontCss(font)}`;
      w100 = mctx.measureText(text).width + tracking * 100 * Math.max(0, [...text].length - 1);
      if (measureCache.size > 5000) measureCache.clear();
      measureCache.set(key, w100);
    }
    return (w100 * size) / 100;
  };
  P.clearMeasureCache = () => measureCache.clear();

  // ---------- Fitting ----------
  const wrapAt = (words, size, maxW, opts) => {
    const lines = [];
    let cur = '';
    let overflow = false;
    for (const w of words) {
      const cand = cur ? cur + ' ' + w : w;
      if (P.measure(cand, { ...opts, size }) <= maxW) cur = cand;
      else {
        if (cur) lines.push(cur);
        cur = w;
        if (P.measure(w, { ...opts, size }) > maxW) overflow = true;
      }
    }
    if (cur) lines.push(cur);
    return { lines, overflow };
  };

  // Largest size at which the wrapped text fits the box.
  // Returns { size, lines, lh, width, height, font, weight, style, tracking }.
  P.fit = (text, o) => {
    const opts = { font: o.font, weight: o.weight ?? 400, style: o.style ?? 'normal', tracking: o.tracking ?? 0 };
    const lh = o.lh ?? 1.1;
    const maxLines = o.maxLines ?? 4;
    const words = String(text).split(/\s+/).filter(Boolean);
    if (!words.length) return { size: o.minSize, lines: [], lh, width: 0, height: 0 };
    const ok = (size) => {
      const r = wrapAt(words, size, o.maxW, opts);
      return !r.overflow && r.lines.length <= maxLines && r.lines.length * size * lh <= o.maxH ? r : null;
    };
    let lo = o.minSize, hi = o.maxSize, best = null;
    if ((best = ok(hi))) lo = hi;
    else {
      for (let i = 0; i < 14 && hi - lo > 0.5; i++) {
        const mid = (lo + hi) / 2;
        const r = ok(mid);
        if (r) { best = r; lo = mid; } else hi = mid;
      }
    }
    let size = lo;
    let lines;
    if (best) lines = best.lines;
    else {
      // Does not fit even at the minimum size: cut lines and end with an ellipsis.
      size = o.minSize;
      const cap = Math.max(1, Math.min(maxLines, Math.floor(o.maxH / (size * lh))));
      const r = wrapAt(words, size, o.maxW, opts);
      lines = r.lines.slice(0, cap);
      const truncated = r.lines.length > cap || r.overflow;
      lines = lines.map((l) => P.truncate(l, size, o.maxW, opts, false));
      if (truncated) lines[lines.length - 1] = P.truncate(lines[lines.length - 1], size, o.maxW, opts, true);
    }
    const width = Math.max(...lines.map((l) => P.measure(l, { ...opts, size })));
    return { size, lines, lh, width, height: lines.length * size * lh, ...opts };
  };

  P.truncate = (line, size, maxW, opts, forceEllipsis) => {
    if (!forceEllipsis && P.measure(line, { ...opts, size }) <= maxW) return line;
    let s = line;
    while (s.length > 1 && P.measure(s + '…', { ...opts, size }) > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  };

  // Font size at which a single line is at most maxW wide and its capitals at most maxCap tall.
  P.fitLine = (text, { font, weight = 400, style = 'normal', tracking = 0, maxW, maxCap, capRatio = 0.72 }) => {
    const byHeight = maxCap / capRatio;
    const w = P.measure(text, { font, weight, style, tracking, size: 1 });
    return w > 0 ? Math.min(byHeight, maxW / w) : byHeight;
  };

  // A fitted block as <text> with one <tspan> per line.
  // (x, y) is the top-left corner of the box, or top-right with anchor: 'end'.
  P.textBlock = (fitted, { x, y, fill, anchor = 'start', capRatio = 0.74, extra = {} }) => {
    const { size, lh, lines } = fitted;
    const first = y + size * capRatio + (size * lh - size) / 2;
    return P.h(
      'text',
      {
        x, y: first, fill,
        'font-family': P.fontCss(fitted.font),
        'font-size': size.toFixed(2),
        'font-weight': fitted.weight,
        'font-style': fitted.style,
        'letter-spacing': fitted.tracking ? (fitted.tracking * size).toFixed(2) : null,
        'text-anchor': anchor,
        ...extra,
      },
      lines.map((l, i) => P.h('tspan', { x, dy: i === 0 ? 0 : (size * lh).toFixed(2) }, l)),
    );
  };
})();
