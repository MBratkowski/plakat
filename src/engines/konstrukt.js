// Constructivism: diagonals, a red wedge or circle, a title band, photomontage.
(() => {
  const P = globalThis.Plakat;
  const { h } = P;
  const { TRACK, WEIGHTS, photo, label, oneLine, centeredLine, lineSize } = P.kit;

  P.defineEngine('konstrukt', {
    label: P.t('engineKonstrukt'),
    comps: [P.t('konstruktCompCircle'), P.t('konstruktCompWedge')],
    defaults: { font: 'Oswald', case: 'upper', composition: 'auto', showChannel: true, showNumber: true, photo: true, density: 1 },

    // `angle` is the channel's tilt; each video adds a few degrees of its own.
    series(x) {
      const sign = x.c.chance(0.5) ? -1 : 1;
      const angle = sign * x.c.range(8, 14);
      return { sign, angle, motif: x.comp(2) };
    },

    render(x) {
      const { W, H, u, m, pal, p, v, portrait } = x;
      const { sign, angle, motif } = x.series;
      const wt = WEIGHTS[p.font];
      const out = [];
      const ang = angle + sign * v.range(-2.5, 2.5);
      const cy = H * (portrait ? 0.62 : 0.6) + v.range(-0.04, 0.04) * H;

      if (motif === 0) {
        const r = u * v.range(0.5, 0.68);
        out.push(h('circle', { cx: sign > 0 ? W * 0.86 : W * 0.14, cy: H * v.range(0.04, 0.22), r, fill: pal.a1 }));
      } else {
        const tipX = W * v.range(0.48, 0.66), tipY = H * v.range(0.3, 0.5);
        const ex = sign > 0 ? W : 0;
        const pts = [[ex, H * v.range(-0.05, 0.12)], [sign > 0 ? tipX : W - tipX, tipY], [ex, H * v.range(0.62, 0.9)]];
        out.push(h('path', { d: `M${pts.map((q) => q.join(' ')).join('L')}Z`, fill: pal.a1 }));
      }

      if (p.photo) {
        const pw = W * (portrait ? 0.62 : 0.4), ph = pw * (portrait ? 1.1 : 0.62);
        const px = sign > 0 ? W * (portrait ? 0.08 : 0.07) : W - pw - W * (portrait ? 0.08 : 0.07);
        const py = H * (portrait ? 0.08 : 0.07);
        out.push(photo(x, { px, py, pw, ph, dark: pal.fg, light: pal.bg, transform: `rotate(${(-ang * 0.6).toFixed(2)} ${px + pw / 2} ${py + ph / 2})` }));
      }

      if (p.showNumber && x.number) {
        const ns = u * (portrait ? 0.36 : 0.46);
        const nx = sign > 0 ? m : W - m;
        out.push(h('text', {
          x: nx, y: H - m * 0.5, 'text-anchor': sign > 0 ? 'start' : 'end', fill: 'none', stroke: pal.fg,
          'stroke-width': Math.max(1, u * 0.006), 'font-family': P.fontCss(p.font), 'font-weight': wt.k,
          'font-size': ns.toFixed(1), transform: `rotate(${ang.toFixed(2)} ${nx} ${H - m})`,
        }, x.number));
      }

      // Construction lines
      const nLines = Math.max(1, Math.round(2 * p.density));
      for (let i = 0; i < nLines; i++) {
        out.push(h('line', {
          x1: W * v.range(0.15, 0.95), y1: -2, x2: W * v.range(0.05, 0.85), y2: H + 2,
          stroke: pal.fg, 'stroke-width': Math.max(1, u * v.range(0.004, 0.01)),
        }));
      }

      // Title band
      const f = P.fit(P.applyCase(x.main, p.case), {
        font: p.font, weight: wt.k, tracking: TRACK[p.font], maxW: W * (portrait ? 0.84 : 0.8),
        maxH: H * (portrait ? 0.26 : 0.34), maxSize: u * 0.2, minSize: u * 0.06, lh: 0.98, maxLines: 3,
      });
      const bandPad = f.size * 0.32;
      const bandH = f.height + bandPad * 2;
      const tx = W * (portrait ? 0.08 : 0.1);
      const band = [];
      band.push(h('rect', { x: tx, y: cy - bandH / 2 - u * 0.05, width: W * v.range(0.22, 0.42), height: u * 0.028, fill: pal.a1 }));
      band.push(h('rect', { x: -W * 0.3, y: cy - bandH / 2, width: W * 1.6, height: bandH, fill: pal.fg }));
      band.push(P.textBlock(f, { x: tx, y: cy - f.height / 2, fill: pal.bg }));
      if (x.sub) {
        band.push(label(x.sub, { px: tx, py: cy + bandH / 2 + u * 0.06, size: u * 0.045, fill: pal.fg, font: p.font, weight: wt.r, tracking: 0.06, maxW: W * 0.8 }));
      }
      out.push(h('g', { transform: `rotate(${ang.toFixed(2)} ${W / 2} ${cy})` }, band));

      if (p.showChannel) {
        const s = u * 0.042;
        const text = oneLine(P.applyCase(x.channel, 'upper'), { font: p.font, weight: wt.k, size: s, tracking: 0.16, maxW: W * 0.5 });
        const tw = P.measure(text, { font: p.font, weight: wt.k, size: s, tracking: 0.16 }) + s * 1.3;
        const pad = s * 0.45;
        const lx = sign > 0 ? m : W - m - tw;
        out.push(h('rect', { x: lx - pad, y: m - pad, width: tw + pad * 2, height: s * 0.8 + pad * 2, fill: pal.bg }));
        out.push(h('rect', { x: lx, y: m, width: s * 0.8, height: s * 0.8, fill: pal.a1 }));
        out.push(label(text, { px: lx + s * 1.3, py: m + s * 0.8, size: s, fill: pal.fg, font: p.font, weight: wt.k, tracking: 0.16, upper: false }));
      }
      return out;
    },

    // A wedge entering from the channel's side, a construction line and the initial
    // tilted by the channel's angle.
    renderAvatar(x) {
      const { pal, p, v } = x;
      const { sign, angle } = x.series;
      const weight = WEIGHTS[p.font].k;
      const edge = sign > 0 ? 100 : 0;
      const tip = v.range(20, 34);
      const tipX = sign > 0 ? tip : 100 - tip;
      const text = P.applyCase(x.initial, p.case);
      const size = lineSize(text, { font: p.font, weight, maxW: 50, maxCap: 54 });
      return [
        h('path', { d: `M${edge} ${v.range(-4, 14).toFixed(2)}L${tipX.toFixed(2)} ${v.range(42, 58).toFixed(2)}L${edge} ${v.range(82, 104).toFixed(2)}Z`, fill: pal.a1 }),
        h('line', { x1: v.range(24, 76).toFixed(2), y1: -2, x2: v.range(24, 76).toFixed(2), y2: 102, stroke: pal.fg, 'stroke-width': 1.6 }),
        centeredLine(text, { cx: 50, cy: 52, size, font: p.font, weight, fill: pal.fg, extra: { transform: `rotate(${angle.toFixed(2)} 50 52)` } }),
      ];
    },
  });
})();
