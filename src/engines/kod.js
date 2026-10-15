// Kod: a code editor. The title becomes a function in the channel's language: its first
// words name it, the episode number is its argument and the highlighted line, the full
// title is the string it returns, and the subtitle is a comment above it.
(() => {
  const P = globalThis.Plakat;
  const { h } = P;
  const { WEIGHTS, CAP, photo, lineSize } = P.kit;

  // Roles: kw keyword, fn function name, num number, str string, com comment, p punctuation.
  const LANGS = {
    js: {
      ext: 'js', comment: '//', style: 'camel', ret: 'return ', after: ';', close: '}', brackets: ['{', '}'],
      def: (name, arg) => [['function ', 'kw'], [name, 'fn'], ['(', 'p'], arg && [arg, 'num'], [') {', 'p']],
    },
    py: {
      ext: 'py', comment: '#', style: 'snake', ret: 'return ', after: '', close: null, brackets: ['[', ']'],
      def: (name, arg) => [['def ', 'kw'], [name, 'fn'], ['(', 'p'], arg && [arg, 'num'], ['):', 'p']],
    },
    rs: {
      ext: 'rs', comment: '//', style: 'snake', ret: '', after: '', close: '}', brackets: ['{', '}'],
      def: (name, arg) => [['fn ', 'kw'], [name, 'fn'], ['(', 'p'], arg && [arg, 'num'], [') -> ', 'p'], ['&str', 'kw'], [' {', 'p']],
    },
    lisp: {
      ext: 'lisp', comment: ';;', style: 'kebab', ret: '', after: ')', close: null, brackets: ['(', ')'],
      def: (name, arg) => [['(', 'p'], ['defun ', 'kw'], [name, 'fn'], [' (', 'p'], arg && [arg, 'num'], [')', 'p']],
    },
  };

  const weights = (font) => WEIGHTS[font] || WEIGHTS['JetBrains Mono'];

  // Greedy word wrap with real measurements, so it holds for proportional faces too.
  // Returns null when a single word is wider than the line.
  const wrap = (words, maxW, width) => {
    const lines = [];
    let cur = '';
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (width(cand) <= maxW) cur = cand;
      else {
        if (!cur || width(w) > maxW) return null;
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  P.defineEngine('kod', {
    label: P.t('engineKod'),
    comps: [P.t('kodCompEditor'), P.t('kodCompZoom')],
    defaults: { font: 'JetBrains Mono', case: 'asis', composition: 'auto', showChannel: true, showNumber: true, photo: false, density: 1 },

    series: (x) => ({
      comp: x.comp(2),
      lang: x.c.pick(Object.keys(LANGS)),
      indent: x.c.pick([2, 4]),
    }),

    render(x) {
      const { W, H, u, m, pal, p, v, portrait } = x;
      const { comp, indent } = x.series;
      const lang = LANGS[x.series.lang];
      const font = p.font;
      const wt = weights(font);
      const editor = comp === 0;
      const color = { kw: pal.a1, num: pal.a1, fn: pal.fg, str: pal.a3, com: pal.a2, p: pal.fg };
      const out = [];

      let name = P.titleIdentifier(x.mainRaw, lang.style, portrait ? 1 : 2) || 'main';
      const arg = p.showNumber && x.number ? x.number : null;
      const note = [x.sub, !editor && p.showChannel ? x.channel : null].filter(Boolean).join(' · ') || (p.showChannel ? x.channel : '');

      // Editor chrome: a tab with the file name, the channel as the project on the right.
      let top = m * 0.9;
      const tabH = editor ? u * 0.11 : 0;
      if (editor) {
        const ts = tabH * 0.36;
        const file = `${name}.${lang.ext}`;
        const tabW = Math.min(W * 0.62, P.measure(file, { font, weight: wt.r, size: ts }) + tabH * 1.4);
        out.push(h('rect', { x: 0, y: 0, width: W, height: tabH, fill: pal.fg, opacity: 0.07 }));
        out.push(h('rect', { x: 0, y: 0, width: tabW.toFixed(2), height: tabH.toFixed(2), fill: pal.bg }));
        out.push(h('rect', { x: 0, y: 0, width: tabW.toFixed(2), height: Math.max(2, u * 0.008).toFixed(2), fill: pal.a1 }));
        out.push(h('text', {
          x: (tabH * 0.6).toFixed(2), y: (tabH * 0.62).toFixed(2), fill: pal.fg, 'font-family': P.fontCss(font),
          'font-size': ts.toFixed(2), 'font-weight': wt.r,
        }, P.truncate(file, ts, tabW - tabH * 0.9, { font, weight: wt.r }, false)));
        if (p.showChannel && x.channel) {
          out.push(h('text', {
            x: W - m * 0.8, y: (tabH * 0.62).toFixed(2), 'text-anchor': 'end', fill: pal.a2, 'font-family': P.fontCss(font),
            'font-size': ts.toFixed(2), 'font-weight': wt.r,
          }, P.truncate(x.channel, ts, W - tabW - m * 1.6, { font, weight: wt.r }, false)));
        }
        top = tabH + m * 0.7;
      }

      // Optional split pane with the original thumbnail.
      let right = W - m * 0.8;
      let bottom = H - m * 0.8;
      if (p.photo) {
        if (portrait) {
          const ph = H * 0.28;
          out.push(photo(x, { px: 0, py: H - ph, pw: W, ph, dark: pal.bg, light: pal.a3 }));
          bottom = H - ph - m * 0.6;
        } else {
          const pw = W * 0.34;
          out.push(photo(x, { px: W - pw, py: tabH, pw, ph: H - tabH, dark: pal.bg, light: pal.a3 }));
          right = W - pw - m * 0.6;
        }
      }
      const mapW = editor && !p.photo ? u * 0.07 : 0;
      if (mapW) right -= mapW + m * 0.4;

      // Fit: the largest size at which comment, signature, wrapped string and closing
      // brace all fit; below the minimum the string is cut with an ellipsis.
      const words = x.main.split(/\s+/).filter(Boolean);
      const startLine = arg && +arg >= 2 ? +arg - 1 : v.int(1, 48);
      const lh = 1.32;
      const maxSize = u * (portrait ? 0.12 : editor ? 0.11 : 0.13);
      const minSize = u * 0.04;
      const layout = (s, force) => {
        const measure = (t, w = wt.r) => P.measure(t, { font, weight: w, size: s });
        const cw = measure('0');
        const fixed = 2 + (lang.close ? 1 : 0);
        const digits = String(startLine + fixed + 12).length;
        const gutterW = (digits + 1.6) * cw;
        const codeX = m * 0.6 + gutterW + cw;
        const strX = codeX + indent * cw + measure(lang.ret + '"');
        const room = right - strX;
        const defW = (n) => measure(lang.def(n, arg).filter(Boolean).map((seg) => seg[0]).join(''));
        if (!force && codeX + defW(name) > right) return null;
        while (codeX + defW(name) > right && name.length > 4) name = name.slice(0, -1);
        let lines = wrap(words, room, measure);
        const end = '"' + lang.after;
        if (lines && measure(lines[lines.length - 1] + end) > room) {
          if (!force) return null;
          lines.push('');
        }
        const maxLines = portrait ? 9 : 4;
        const total = (n) => (fixed + n) * s * lh;
        if (!force && (!lines || lines.length > maxLines || total(lines.length) > bottom - top)) return null;
        if (!lines) lines = [P.truncate(x.main, s, room, { font, weight: wt.r }, true)];
        const cap = Math.max(1, Math.min(maxLines, Math.floor((bottom - top) / (s * lh)) - fixed));
        if (lines.length > cap) {
          lines = lines.slice(0, cap);
          lines[cap - 1] = P.truncate(lines[cap - 1], s, room - measure(end), { font, weight: wt.r }, true);
        }
        return { s, cw, gutterW, codeX, strX, lines: lines.filter((l, i) => l || i === lines.length - 1) };
      };
      let L = null;
      for (let s = maxSize; !L && s >= minSize; s *= 0.94) L = layout(s, false);
      L ||= layout(minSize, true);
      const { s, cw, gutterW, codeX, strX } = L;
      const fam = P.fontCss(font);
      const blockH = (L.lines.length + 2 + (lang.close ? 1 : 0)) * s * lh;
      top += Math.max(0, (bottom - top - blockH) / 2); // as if scrolled to the function

      // Lines: [segments, x]. The signature is the current line.
      const rows = [
        [[[P.truncate(`${lang.comment} ${note}`.trimEnd(), s, right - codeX, { font, weight: wt.r }, false), 'com']], codeX],
        [lang.def(name, arg).filter(Boolean), codeX],
        ...L.lines.map((line, i) => [[
          i === 0 && lang.ret ? [lang.ret, 'kw'] : null,
          [(i === 0 ? '"' : '') + line + (i === L.lines.length - 1 ? '"' : ''), 'str'],
          i === L.lines.length - 1 && lang.after ? [lang.after, 'p'] : null,
        ].filter(Boolean), i === 0 ? codeX + indent * cw : strX]),
        lang.close ? [[[lang.close, 'p']], codeX] : null,
      ].filter(Boolean);

      const base = (i) => top + s * lh * i + s * (0.5 * (lh - 1) + 0.86);
      const current = 1;
      out.push(h('rect', {
        x: 0, y: (base(current) - s * (0.5 * (lh - 1) + 0.86)).toFixed(2), width: (right + (mapW ? m * 0.4 : 0)).toFixed(2),
        height: (s * lh).toFixed(2), fill: pal.fg, opacity: 0.06,
      }));
      out.push(h('rect', { x: (m * 0.6 + gutterW + cw * 0.35).toFixed(2), y: top.toFixed(2), width: Math.max(1, u * 0.003).toFixed(2), height: (rows.length * s * lh).toFixed(2), fill: pal.a2, opacity: 0.35 }));
      rows.forEach(([segs, rx], i) => {
        const y = base(i).toFixed(2);
        out.push(h('text', {
          x: (m * 0.6 + gutterW - cw * 0.4).toFixed(2), y, 'text-anchor': 'end', fill: i === current ? pal.a1 : pal.a2,
          'font-family': fam, 'font-size': (s * 0.82).toFixed(2), 'font-weight': i === current ? wt.b : wt.r,
        }, String(startLine + i)));
        out.push(h('text', { x: rx.toFixed(2), y, 'font-family': fam, 'font-size': s.toFixed(2), 'font-weight': wt.r },
          segs.map(([t, role]) => h('tspan', { fill: color[role], 'font-weight': role === 'fn' || role === 'kw' ? wt.b : null }, t))));
      });

      // Minimap: one bar per line of an imaginary file, the visible part framed.
      if (mapW) {
        const mx = right + m * 0.4;
        const n = Math.max(8, Math.round((portrait ? 46 : 22) * p.density));
        const step = (H - tabH - m) / n;
        const seen = Math.floor(n * v.range(0.15, 0.55));
        out.push(h('rect', { x: (mx - 2).toFixed(2), y: (tabH + m * 0.5 + seen * step - 2).toFixed(2), width: (mapW + 4).toFixed(2), height: (rows.length * step + 4).toFixed(2), fill: pal.fg, opacity: 0.07 }));
        for (let i = 0; i < n; i++) {
          if (v.chance(0.18)) continue;
          out.push(h('rect', {
            x: (mx + v.int(0, 3) * mapW * 0.12).toFixed(2), y: (tabH + m * 0.5 + i * step).toFixed(2),
            width: (mapW * v.range(0.25, 0.85)).toFixed(2), height: Math.max(1, step * 0.45).toFixed(2),
            fill: v.pick([pal.a1, pal.a2, pal.a3, pal.fg]), opacity: 0.55,
          }));
        }
      }
      return out;
    },

    // The initials between the language's brackets, on the current-line band.
    renderAvatar(x) {
      const { pal, p } = x;
      const font = p.font;
      const wt = weights(font);
      const [open, close] = LANGS[x.series.lang].brackets;
      const text = P.applyCase(x.initials, p.case);
      const size = lineSize(open + text + close, { font, weight: wt.k, maxW: 70, maxCap: 30 });
      const capH = size * (CAP[font] ?? 0.72);
      return [
        h('rect', { x: 0, y: (50 - capH * 1.05).toFixed(2), width: 100, height: (capH * 2.1).toFixed(2), fill: pal.fg, opacity: 0.07 }),
        h('rect', { x: 0, y: (50 - capH * 1.05).toFixed(2), width: 4, height: (capH * 2.1).toFixed(2), fill: pal.a1 }),
        h('text', {
          x: 50, y: (50 + capH / 2).toFixed(2), 'text-anchor': 'middle', 'font-family': P.fontCss(font),
          'font-size': size.toFixed(2), 'font-weight': wt.k,
        }, h('tspan', { fill: pal.a1 }, open), h('tspan', { fill: pal.fg }, text), h('tspan', { fill: pal.a1 }, close)),
      ];
    },
  });
})();
