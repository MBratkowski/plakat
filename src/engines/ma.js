// Ma (間): emptiness, a single circle, a serif title, a hairline.
(() => {
  const P = globalThis.Plakat;
  const { h } = P;
  const { TRACK, WEIGHTS, photo, label, centeredLine, lineSize } = P.kit;

  P.defineEngine('ma', {
    label: P.t('engineMa'),
    comps: [P.t('maCompSun'), P.t('maCompEnso'), P.t('maCompHorizon')],
    defaults: { font: 'Cormorant Garamond', case: 'asis', composition: 'auto', showChannel: true, showNumber: true, photo: false, density: 1 },

    series: (x) => ({ variant: x.comp(3) }),

    render(x) {
      const { W, H, u, m, pal, p, v, portrait } = x;
      const { variant } = x.series;
      const wt = WEIGHTS[p.font];
      const out = [];
      const M = m * 1.4;
      let hy = null;
      const right = v.chance(0.5);
      const r = u * v.range(0.19, 0.28);
      let cx, cy;
      if (portrait) { cx = W * (right ? 0.64 : 0.36); cy = H * v.range(0.3, 0.38); }
      else { cx = W * (right ? v.range(0.64, 0.74) : v.range(0.26, 0.36)); cy = H * v.range(0.4, 0.5); }

      if (variant === 0) {
        if (p.photo) out.push(photo(x, { px: cx - r, py: cy - r, pw: 2 * r, ph: 2 * r, dark: pal.a1, light: pal.bg, clip: h('circle', { cx, cy, r }) }));
        else out.push(h('circle', { cx, cy, r, fill: pal.a1 }));
      } else if (variant === 1) {
        const circ = 2 * Math.PI * r;
        out.push(h('circle', {
          cx, cy, r, fill: 'none', stroke: pal.fg, 'stroke-width': (u * v.range(0.03, 0.055)).toFixed(1),
          'stroke-linecap': 'round', 'stroke-dasharray': `${(circ * 0.88).toFixed(1)} ${(circ * 0.12).toFixed(1)}`,
          transform: `rotate(${v.int(0, 359)} ${cx} ${cy})`, opacity: 0.92,
        }));
        out.push(h('circle', { cx: cx + r * 0.05, cy: cy - r * 0.05, r: r * 0.12 * p.density, fill: pal.a1 }));
      } else {
        hy = portrait ? H * 0.46 : H * 0.5;
        const n = x.uid++;
        out.push(h('defs', {}, h('clipPath', { id: `@hz${n}` }, h('rect', { x: 0, y: 0, width: W, height: hy }))));
        out.push(h('circle', { cx, cy: hy, r: r * 1.15, fill: pal.a1, 'clip-path': `url(#@hz${n})` }));
        out.push(h('rect', { x: M, y: hy, width: W - 2 * M, height: Math.max(0.8, u * 0.003), fill: pal.fg }));
      }

      // Title on the side opposite the circle
      const tw = portrait ? W - 2 * M : W * 0.42;
      const tx = portrait ? M : right ? M : W - M - tw;
      const f = P.fit(P.applyCase(x.main, p.case), {
        font: p.font, weight: wt.r, tracking: TRACK[p.font], maxW: tw,
        maxH: hy != null ? H - M - hy - u * 0.09 : H * (portrait ? 0.24 : 0.42),
        maxSize: u * 0.1, minSize: u * 0.048, lh: 1.12, maxLines: 4,
      });
      const ty = hy != null ? Math.min(hy + u * 0.09, H - M - f.height) : H - M - f.height;
      if (hy == null) out.push(h('rect', { x: tx, y: ty - u * 0.16, width: Math.max(0.8, u * 0.003), height: u * 0.1, fill: pal.fg }));
      out.push(P.textBlock(f, { x: tx, y: ty, fill: pal.fg }));

      if (p.showChannel) {
        const s = u * 0.038;
        out.push(label(x.channel, { px: M, py: M + s * 0.7, size: s, fill: pal.a2, font: 'Cormorant Garamond', weight: 600, tracking: 0.26, maxW: W * 0.55 }));
      }
      if (p.showNumber && x.number) {
        const s = u * 0.05;
        out.push(h('text', {
          x: W - M, y: M + s * 0.6, 'text-anchor': 'end', fill: pal.a2, 'font-family': P.fontCss('Cormorant Garamond'),
          'font-style': 'italic', 'font-weight': 500, 'font-size': s.toFixed(1),
        }, `nº ${x.number}`));
      }
      return out;
    },

    // One a1 circle pushed off-centre by the seed, a small initial on the other side.
    renderAvatar(x) {
      const { pal, p, v } = x;
      const weight = WEIGHTS[p.font].r;
      const right = v.chance(0.5);
      const cx = 50 + (right ? 1 : -1) * v.range(8, 15);
      const cy = 50 - v.range(4, 12);
      const text = P.applyCase(x.initial, p.case);
      const size = lineSize(text, { font: p.font, weight, maxW: 22, maxCap: 15 });
      return [
        h('circle', { cx: cx.toFixed(2), cy: cy.toFixed(2), r: v.range(19, 25).toFixed(2), fill: pal.a1 }),
        centeredLine(text, { cx: right ? 31 : 69, cy: 73, size, font: p.font, weight, fill: pal.fg }),
      ];
    },
  });
})();
