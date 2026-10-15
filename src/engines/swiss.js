// Swiss: grid, grotesque type, a huge number or circle, rings.
(() => {
  const P = globalThis.Plakat;
  const { h } = P;
  const { WEIGHTS, photo, label, lineSize, titleBottom } = P.kit;

  P.defineEngine('swiss', {
    label: P.t('engineSwiss'),
    comps: [P.t('swissCompNumber'), P.t('swissCompRings'), P.t('swissCompWord')],
    defaults: { font: 'Inter Tight', case: 'lower', composition: 'auto', showChannel: true, showNumber: true, photo: false, density: 1 },

    series: (x) => ({ comp: x.comp(3) }),

    render(x) {
      const { W, H, u, m, pal, p, v, portrait } = x;
      const { comp } = x.series;
      const wt = WEIGHTS[p.font];
      const out = [];
      const metaSize = u * 0.042;
      const topY = p.showChannel ? m + metaSize * 1.35 + m * 0.7 : m;
      let titleOpts = {
        px: m, bottom: H - m, maxW: W * (portrait ? 0.84 : 0.6), maxH: H * (portrait ? 0.34 : 0.44),
        maxSize: u * 0.17, minSize: u * 0.05, weight: wt.b, fill: pal.fg, lh: 0.98,
      };

      if (comp === 0) {
        if (p.showNumber && x.number) {
          let size = portrait ? W * 0.75 : H * 1.08;
          const wmax = W * (portrait ? 0.92 : 0.66);
          const w = P.measure(x.number, { font: p.font, weight: wt.k, size, tracking: -0.06 });
          if (w > wmax) size *= wmax / w;
          out.push(h('text', {
            x: W - m * 0.3 + v.range(0, W * 0.04), y: topY - size * 0.02 + size * 0.73,
            'text-anchor': 'end', fill: pal.a1, 'font-family': P.fontCss(p.font), 'font-weight': wt.k,
            'font-size': size.toFixed(1), 'letter-spacing': (-0.06 * size).toFixed(1),
          }, x.number));
        } else {
          const r = (portrait ? W * 0.4 : H * 0.42) * v.range(0.85, 1.12);
          const cx = portrait ? W * v.range(0.42, 0.62) : W * v.range(0.64, 0.78);
          const cy = portrait ? H * v.range(0.26, 0.34) : H * v.range(0.3, 0.44);
          if (p.photo) {
            out.push(photo(x, { px: cx - r, py: cy - r, pw: 2 * r, ph: 2 * r, dark: P.darker(pal.fg, pal.bg), light: pal.a1, clip: h('circle', { cx, cy, r }) }));
          } else out.push(h('circle', { cx, cy, r, fill: pal.a1 }));
          if (v.chance(0.5)) {
            out.push(h('circle', { cx: cx + r * v.range(0.55, 0.8), cy: cy + r * v.range(0.5, 0.8), r: r * v.range(0.16, 0.28), fill: pal.a2 }));
          } else {
            out.push(h('rect', { x: cx - r * 1.25, y: cy - r * v.range(0.25, 0.6), width: r * 2.5, height: r * 0.11 * p.density, fill: pal.a2 }));
          }
        }
      } else if (comp === 1) {
        const cx = portrait ? W * v.range(0.6, 1.0) : W * v.range(0.76, 1.0);
        const cy = portrait ? H * v.range(0.04, 0.2) : H * v.range(-0.08, 0.22);
        const n = Math.max(3, Math.round(v.range(4, 7) * p.density));
        const step = u * v.range(0.07, 0.1);
        const R0 = u * v.range(0.1, 0.17);
        for (let i = n - 1; i >= 0; i--) {
          const r = R0 + (i + 1) * step;
          out.push(h('circle', {
            cx, cy, r, fill: 'none', stroke: v.chance(0.72) ? pal.a1 : pal.fg,
            'stroke-width': (step * v.pick([0.18, 0.35, 0.55, 0.7])).toFixed(1),
          }));
        }
        if (p.photo) out.push(photo(x, { px: cx - R0, py: cy - R0, pw: 2 * R0, ph: 2 * R0, dark: P.darker(pal.fg, pal.bg), light: pal.a1, clip: h('circle', { cx, cy, r: R0 }) }));
        else out.push(h('circle', { cx, cy, r: R0, fill: pal.a1 }));
      } else {
        const word = P.applyCase(x.keyword, p.case);
        const size = Math.min(portrait ? W * 0.36 : H * 0.5, H - topY - m - H * 0.3);
        out.push(h('text', {
          x: m - size * 0.04, y: topY + size * 0.76, fill: pal.a1, 'font-family': P.fontCss(p.font),
          'font-weight': wt.k, 'font-size': size.toFixed(1), 'letter-spacing': (-0.055 * size).toFixed(1),
        }, word));
        const kwBottom = topY + size * 1.0;
        titleOpts = { ...titleOpts, maxW: W - 2 * m, maxH: H - m - kwBottom - m * 0.4, maxSize: u * 0.11 };
      }

      out.push(...titleBottom(x, titleOpts).nodes);

      if (p.showChannel) {
        const by = m + metaSize * 0.8;
        out.push(label(x.channel, { px: m, py: by, size: metaSize, fill: pal.fg, weight: 700, tracking: 0, upper: false, maxW: W * 0.6 }));
        out.push(label(`Nº ${x.serial}`, { px: W - m, py: by, size: metaSize, fill: pal.fg, weight: 400, tracking: 0, anchor: 'end' }));
        out.push(h('rect', { x: m, y: m + metaSize * 1.35, width: W - 2 * m, height: Math.max(1, u * 0.004), fill: pal.fg }));
      }
      return out;
    },

    // Quarter of an a1 circle in one corner, monogram in the opposite quadrant.
    // The two never overlap, so palettes where fg equals a1 still read.
    renderAvatar(x) {
      const { pal, p, v } = x;
      const weight = WEIGHTS[p.font].k;
      const corner = v.int(0, 3);
      const right = corner === 1 || corner === 2;
      const bottom = corner >= 2;
      const text = P.applyCase(x.initials, p.case);
      const size = lineSize(text, { font: p.font, weight, tracking: -0.04, maxW: 44, maxCap: 28 });
      const capH = size * P.kit.CAP[p.font];
      return [
        h('circle', { cx: right ? 100 : 0, cy: bottom ? 100 : 0, r: v.range(52, 60), fill: pal.a1 }),
        h('text', {
          x: right ? 18 : 82, y: (bottom ? 20 + capH : 80).toFixed(2), 'text-anchor': right ? 'start' : 'end',
          fill: pal.fg, 'font-family': P.fontCss(p.font), 'font-weight': weight,
          'font-size': size.toFixed(2), 'letter-spacing': (-0.04 * size).toFixed(2),
        }, text),
      ];
    },
  });
})();
