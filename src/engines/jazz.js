// Jazz '60: a record sleeve. Duotone photo, a block of colour, one huge word.
(() => {
  const P = globalThis.Plakat;
  const { h } = P;
  const { TRACK, WEIGHTS, photo, label, centeredLine, lineSize } = P.kit;

  P.defineEngine('jazz', {
    label: P.t('engineJazz'),
    comps: [P.t('jazzCompLeft'), P.t('jazzCompTop')],
    defaults: { font: 'Oswald', case: 'upper', composition: 'auto', showChannel: true, showNumber: true, photo: true, density: 1 },

    series: (x) => ({ comp: x.comp(2) }),

    render(x) {
      const { W, H, u, m, pal, p, v, portrait } = x;
      const wt = WEIGHTS[p.font];
      const out = [];
      const comp = portrait ? 1 : x.series.comp;
      let pw, ph, ax, ay, aw, ahh;
      if (comp === 0) {
        pw = W * v.range(0.5, 0.58); ph = H;
        ax = pw + m * 0.9; ay = m; aw = W - ax - m; ahh = H - 2 * m;
      } else {
        pw = W; ph = H * (portrait ? 0.5 : v.range(0.5, 0.58));
        ax = m; ay = ph + m * 0.7; aw = W - 2 * m; ahh = H - ay - m;
      }
      if (p.photo) out.push(photo(x, { px: 0, py: 0, pw, ph, dark: pal.a2, light: pal.a3 }));
      else {
        out.push(h('rect', { x: 0, y: 0, width: pw, height: ph, fill: pal.a2 }));
        const n = Math.max(3, Math.round(9 * p.density));
        for (let i = 0; i < n; i++) out.push(h('rect', { x: 0, y: (ph / n) * i, width: pw * v.range(0.2, 1), height: (ph / n) * 0.42, fill: pal.a3, opacity: 0.9 }));
      }
      const bar = Math.max(3, u * 0.03);
      out.push(comp === 0
        ? h('rect', { x: pw, y: 0, width: bar, height: H, fill: pal.a1 })
        : h('rect', { x: 0, y: ph, width: W, height: bar, fill: pal.a1 }));

      let cur = ay;
      if (p.showChannel) {
        const s = u * 0.036;
        out.push(label(x.channel, { px: ax, py: cur + s * 0.8, size: s, fill: pal.fg, weight: 700, tracking: 0.16, maxW: aw * 0.72 }));
        if (p.showNumber && x.number) out.push(label(`Nº ${x.number}`, { px: ax + aw, py: cur + s * 0.8, size: s, fill: pal.a1, weight: 700, tracking: 0.05, anchor: 'end' }));
        cur += s * 2.5;
      }
      // One word across the full width of the text column.
      const kw = P.applyCase(x.keyword, p.case);
      const kf = P.fit(kw, { font: p.font, weight: wt.k, tracking: TRACK[p.font], maxW: aw, maxH: ahh * 0.5, maxSize: u * 0.42, minSize: u * 0.07, lh: 0.9, maxLines: 1 });
      if (comp === 1) cur = Math.max(cur, ph - kf.size * 0.42);
      out.push(P.textBlock(kf, { x: ax, y: cur, fill: pal.a1, capRatio: 0.82 }));
      cur += kf.height + u * 0.03;
      const rest = x.sub ? `${x.mainRaw} — ${x.sub}` : x.mainRaw;
      const rf = P.fit(rest, { font: 'Inter Tight', weight: 500, tracking: -0.01, maxW: aw, maxH: Math.max(u * 0.05, ay + ahh - cur), maxSize: u * 0.068, minSize: u * 0.04, lh: 1.15, maxLines: 4 });
      out.push(P.textBlock(rf, { x: ax, y: cur, fill: pal.fg }));
      return out;
    },

    // The channel's own avatar in duotone, initials on an a1 bar.
    renderAvatar(x) {
      const { pal, p } = x;
      const weight = WEIGHTS[p.font].k;
      const barY = 58, barH = 24;
      const text = P.applyCase(x.initials, p.case);
      const size = lineSize(text, { font: p.font, weight, tracking: 0.06, maxW: 54, maxCap: barH * 0.58 });
      return [
        photo(x, { px: 0, py: 0, pw: 100, ph: 100, dark: pal.a2, light: pal.a3 }),
        h('rect', { x: 0, y: barY, width: 100, height: barH, fill: pal.a1 }),
        centeredLine(text, { cx: 50, cy: barY + barH / 2, size, font: p.font, weight, tracking: 0.06, fill: P.contrastOn(pal.a1, pal.bg, pal.fg) }),
      ];
    },
  });
})();
