// Bauhaus: a grid of primitives in primary colours, lowercase type.
(() => {
  const P = globalThis.Plakat;
  const { h } = P;
  const { TRACK, WEIGHTS, photo, label } = P.kit;

  const SHAPES = ['square', 'circle', 'half', 'quarter', 'triangle', 'ring', 'stripes', 'dot'];

  // One primitive in the s × s cell whose top-left corner is (cx0, cy0).
  const shapeNode = (shape, cx0, cy0, s, fill, rot) => {
    const cx = cx0 + s / 2, cy = cy0 + s / 2;
    const tf = rot ? `rotate(${rot} ${cx} ${cy})` : null;
    switch (shape) {
      case 'square': return h('rect', { x: cx0 + s * 0.12, y: cy0 + s * 0.12, width: s * 0.76, height: s * 0.76, fill, transform: tf });
      case 'circle': return h('circle', { cx, cy, r: s / 2, fill });
      case 'half': return h('path', { d: `M${cx0} ${cy}A${s / 2} ${s / 2} 0 0 1 ${cx0 + s} ${cy}Z`, fill, transform: tf });
      case 'quarter': return h('path', { d: `M${cx0} ${cy0}L${cx0 + s} ${cy0}A${s} ${s} 0 0 1 ${cx0} ${cy0 + s}Z`, fill, transform: tf });
      case 'triangle': return h('path', { d: `M${cx0} ${cy0 + s}L${cx0 + s} ${cy0 + s}L${cx0} ${cy0}Z`, fill, transform: tf });
      case 'ring': return h('circle', { cx, cy, r: s * 0.34, fill: 'none', stroke: fill, 'stroke-width': s * 0.16 });
      case 'stripes': return h('g', { transform: tf }, [0, 1, 2].map((i) => h('rect', { x: cx0, y: cy0 + s * (0.08 + i * 0.32), width: s, height: s * 0.2, fill })));
      case 'dot': return h('circle', { cx, cy, r: s * 0.2, fill });
      default: return null;
    }
  };

  P.defineEngine('bauhaus', {
    label: P.t('engineBauhaus'),
    comps: [P.t('bauhausCompRight'), P.t('bauhausCompLeft')],
    defaults: { font: 'Jost', case: 'lower', composition: 'auto', showChannel: true, showNumber: true, photo: false, density: 1 },

    // The channel's four-shape vocabulary is what makes its series recognisable.
    series: (x) => ({ side: x.comp(2), vocab: x.c.shuffle(SHAPES).slice(0, 4) }),

    render(x) {
      const { W, H, u, m, pal, p, v, portrait } = x;
      const { side, vocab } = x.series;
      const wt = WEIGHTS[p.font];
      const out = [];
      let rows, cols, s, gx, gy, tx, ty, tw, th;
      if (!portrait) {
        rows = 2; cols = 2; s = (H - 2 * m) / 2;
        gx = side === 0 ? W - m - cols * s : m; gy = m;
        tx = side === 0 ? m : m + cols * s + m; ty = m; tw = W - cols * s - 3 * m; th = H - 2 * m;
      } else {
        rows = 3; cols = 3; s = (W - 2 * m) / 3;
        gx = m; gy = side === 0 ? m : H - m - rows * s;
        tx = m; ty = side === 0 ? m + rows * s + m : m; tw = W - 2 * m; th = H - rows * s - 3 * m;
      }
      const palette = [pal.a1, pal.a2, pal.a3, pal.fg];
      const cells = [];
      for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) cells.push({ x: gx + cc * s, y: gy + r * s });
      const numberCell = p.showNumber && x.number ? v.int(0, cells.length - 1) : -1;
      let photoCell = p.photo ? v.int(0, cells.length - 1) : -1;
      if (photoCell >= 0 && photoCell === numberCell) photoCell = (photoCell + 1) % cells.length;
      let prev = null;
      cells.forEach((cell, i) => {
        if (i === numberCell) {
          out.push(h('rect', { x: cell.x, y: cell.y, width: s, height: s, fill: pal.fg }));
          const ns = Math.min(s * 0.78, (s * 0.8) / Math.max(0.5, P.measure(x.number, { font: p.font, weight: wt.k, size: 1 })));
          out.push(h('text', {
            x: cell.x + s / 2, y: cell.y + s / 2 + ns * 0.36, 'text-anchor': 'middle', fill: pal.bg,
            'font-family': P.fontCss(p.font), 'font-weight': wt.k, 'font-size': ns.toFixed(1),
          }, x.number));
          return;
        }
        if (i === photoCell) {
          const clip = v.chance(0.5) ? h('circle', { cx: cell.x + s / 2, cy: cell.y + s / 2, r: s / 2 })
            : h('path', { d: `M${cell.x} ${cell.y}L${cell.x + s} ${cell.y}A${s} ${s} 0 0 1 ${cell.x} ${cell.y + s}Z`, transform: `rotate(${v.int(0, 3) * 90} ${cell.x + s / 2} ${cell.y + s / 2})` });
          out.push(photo(x, { px: cell.x, py: cell.y, pw: s, ph: s, dark: pal.fg, light: v.pick([pal.a1, pal.a2, pal.a3]), clip }));
          return;
        }
        const col = v.pick(palette.filter((k) => k !== prev));
        prev = col;
        let shapeFill = col;
        if (v.chance(0.45 * p.density)) {
          out.push(h('rect', { x: cell.x, y: cell.y, width: s, height: s, fill: col }));
          shapeFill = v.pick([pal.bg, ...palette].filter((k) => k !== col));
        }
        out.push(shapeNode(v.pick(vocab), cell.x, cell.y, s, shapeFill, v.int(0, 3) * 90));
      });

      // Text column
      const ruleH = Math.max(2, u * 0.022);
      out.push(h('rect', { x: tx, y: ty, width: tw, height: ruleH, fill: pal.fg }));
      const chS = u * 0.04;
      const reserved = (p.showChannel ? chS * 2.2 : 0) + (x.sub ? u * 0.045 * 2.4 : 0);
      const f = P.fit(P.applyCase(x.main, p.case), {
        font: p.font, weight: wt.b, tracking: TRACK[p.font], maxW: tw, maxH: th - ruleH - u * 0.05 - reserved,
        maxSize: u * (portrait ? 0.13 : 0.12), minSize: u * 0.045, lh: 1.04, maxLines: 7,
      });
      out.push(P.textBlock(f, { x: tx, y: ty + ruleH + u * 0.045, fill: pal.fg }));
      let by = ty + th;
      if (p.showChannel) {
        out.push(h('rect', { x: tx, y: by - chS * 0.86, width: chS * 0.86, height: chS * 0.86, fill: pal.a1 }));
        out.push(label(x.channel, { px: tx + chS * 1.35, py: by - chS * 0.02, size: chS, fill: pal.fg, font: p.font, weight: wt.k, tracking: 0.08, maxW: tw - chS * 1.4 }));
        by -= chS * 2.2;
      }
      if (x.sub) {
        out.push(label(P.applyCase(x.sub, p.case), { px: tx, py: by, size: u * 0.045, fill: pal.fg, font: p.font, weight: wt.r, tracking: 0, maxW: tw, upper: false }));
      }
      return out;
    },

    // 2×2 cells, one shape from the channel's vocabulary in each, on a diagonal of colour.
    renderAvatar(x) {
      const { pal, v } = x;
      const palette = [pal.a1, pal.a2, pal.a3, pal.fg];
      const shapes = v.shuffle(x.series.vocab);
      const filled = v.chance(0.5) ? [0, 3] : [1, 2];
      const s = 50;
      const out = [];
      let prev = null;
      [[0, 0], [s, 0], [0, s], [s, s]].forEach(([cx, cy], i) => {
        const col = v.pick(palette.filter((k) => k !== prev));
        prev = col;
        let fill = col;
        if (filled.includes(i)) {
          out.push(h('rect', { x: cx, y: cy, width: s, height: s, fill: col }));
          fill = v.pick([pal.bg, ...palette].filter((k) => k !== col));
        }
        out.push(shapeNode(shapes[i], cx, cy, s, fill, v.int(0, 3) * 90));
      });
      return out;
    },
  });
})();
