// Engine registry and the building blocks shared by all engines.
//
// Engine contract (register with P.defineEngine(id, engine)):
//   label, comps[], defaults{}   UI metadata and default params. label and comps come from
//                                the catalog: P.t('<key>'), see core/i18n.js.
//   series(x) -> {}              Channel-level traits (layout, form vocabulary, angle).
//                                Draws only from x.c() / x.comp(n) and runs once per render,
//                                before render() or renderAvatar(), so a channel's thumbnails
//                                and avatar share them. Never reorder its calls: that would
//                                restyle every existing channel.
//   render(x) -> nodes           Thumbnail. Per-video variation comes from x.v().
//   renderAvatar(x) -> nodes     100×100 avatar shown in a circle. x.v() is seeded per channel.
// See poster/render.js for the full context object `x`.
(() => {
  const P = (globalThis.Plakat ??= {});
  const { h } = P;

  const TRACK = { 'Inter Tight': -0.035, Jost: -0.015, Oswald: 0.005, 'Cormorant Garamond': -0.005, 'JetBrains Mono': 0 };
  const WEIGHTS = {
    'Inter Tight': { r: 400, b: 700, k: 900 },
    Jost: { r: 400, b: 500, k: 700 },
    Oswald: { r: 400, b: 700, k: 700 },
    'Cormorant Garamond': { r: 500, b: 600, k: 600 },
    'JetBrains Mono': { r: 400, b: 700, k: 800 },
  };
  // Cap height as a fraction of the font size, measured on the bundled faces.
  const CAP = { 'Inter Tight': 0.73, Jost: 0.7, Oswald: 0.81, 'Cormorant Garamond': 0.63, 'JetBrains Mono': 0.73 };
  const FONT_OPTIONS = Object.keys(WEIGHTS);

  // Saturate to grey, then map shadows to `dark` and highlights to `light`.
  const duotone = (id, dark, light) => {
    const [r1, g1, b1] = P.hexToRgb(dark).map((n) => n / 255);
    const [r2, g2, b2] = P.hexToRgb(light).map((n) => n / 255);
    const tv = (a, b) => [a, a, (a + b) / 2, b, b].map((n) => n.toFixed(3)).join(' ');
    return h(
      'filter',
      { id, 'color-interpolation-filters': 'sRGB', x: 0, y: 0, width: '100%', height: '100%' },
      h('feColorMatrix', { type: 'saturate', values: 0 }),
      h('feComponentTransfer', {},
        h('feFuncR', { type: 'table', tableValues: tv(r1, r2) }),
        h('feFuncG', { type: 'table', tableValues: tv(g1, g2) }),
        h('feFuncB', { type: 'table', tableValues: tv(b1, b2) })),
    );
  };

  // The original image (x.thumbUrl) in duotone, optionally clipped to a shape.
  // Without an image it draws a flat stand-in in the same two colours.
  const photo = (x, { px, py, pw, ph, dark, light, clip, transform }) => {
    const n = x.uid++;
    const fid = `@duo${n}`, cid = `@clip${n}`;
    if (!x.thumbUrl) {
      return h('g', { transform, 'clip-path': clip ? `url(#${cid})` : null },
        clip ? h('defs', {}, h('clipPath', { id: cid }, clip)) : null,
        h('rect', { x: px, y: py, width: pw, height: ph, fill: dark }),
        h('circle', { cx: px + pw * 0.62, cy: py + ph * 0.45, r: Math.min(pw, ph) * 0.28, fill: light, opacity: 0.85 }));
    }
    return h('g', { transform },
      h('defs', {}, duotone(fid, dark, light), clip ? h('clipPath', { id: cid }, clip) : null),
      h('image', {
        href: x.thumbUrl, x: px, y: py, width: pw, height: ph,
        preserveAspectRatio: 'xMidYMid slice', filter: `url(#${fid})`,
        'clip-path': clip ? `url(#${cid})` : null,
      }));
  };

  // One line, cut with an ellipsis when wider than maxW.
  const oneLine = (text, { font, weight, size, tracking = 0, maxW }) =>
    P.truncate(text, size, maxW, { font, weight, tracking }, false);

  const label = (text, { px, py, size, fill, font = 'Inter Tight', weight = 700, tracking = 0.08, anchor = 'start', maxW, upper = true, extra = {} }) => {
    const t = upper ? P.applyCase(text, 'upper') : text;
    const s = maxW ? oneLine(t, { font, weight, size, tracking, maxW }) : t;
    return h('text', {
      x: px, y: py, fill, 'font-family': P.fontCss(font), 'font-size': size.toFixed(2), 'font-weight': weight,
      'letter-spacing': (tracking * size).toFixed(2), 'text-anchor': anchor, ...extra,
    }, s);
  };

  // A single line whose capitals are vertically centred on (cx, cy).
  const centeredLine = (text, { cx, cy, size, font, weight, fill, tracking = 0, extra = {} }) =>
    h('text', {
      x: cx, y: (cy + (size * (CAP[font] ?? 0.72)) / 2).toFixed(2), fill, 'text-anchor': 'middle',
      'font-family': P.fontCss(font), 'font-size': size.toFixed(2), 'font-weight': weight,
      'letter-spacing': tracking ? (tracking * size).toFixed(2) : null, ...extra,
    }, text);

  // Font size for one line of text in a maxW × maxCap box of the given face.
  const lineSize = (text, { font, weight, tracking = 0, maxW, maxCap }) =>
    P.fitLine(text, { font, weight, tracking, maxW, maxCap, capRatio: CAP[font] ?? 0.72 });

  // Title aligned to the bottom of its box, with the optional subtitle below it.
  const titleBottom = (x, { px, bottom, maxW, maxH, maxSize, minSize, weight, fill, lh = 1, maxLines = 4, subFill }) => {
    const { u, p } = x;
    const out = [];
    let b = bottom;
    if (x.sub) {
      const ss = u * 0.042;
      out.push(label(x.sub, { px, py: b - ss * 0.25, size: ss, fill: subFill || fill, font: 'Inter Tight', weight: 400, tracking: 0, maxW, upper: false }));
      b -= ss * 1.9;
      maxH -= ss * 1.9;
    }
    const f = P.fit(x.main, { font: p.font, weight, tracking: TRACK[p.font], maxW, maxH, maxSize, minSize, lh, maxLines });
    out.unshift(P.textBlock(f, { x: px, y: b - f.height, fill }));
    return { nodes: out, top: b - f.height, fitted: f };
  };

  // Avatar for engines that do not draw their own: initials beside an accent dot.
  const defaultAvatar = (x) => {
    const { pal, p } = x;
    const weight = WEIGHTS[p.font]?.k ?? 700;
    const text = P.applyCase(x.initials, p.case);
    const size = lineSize(text, { font: p.font, weight, maxW: 56, maxCap: 30 });
    return [
      h('circle', { cx: 70, cy: 30, r: 14, fill: pal.a1 }),
      centeredLine(text, { cx: 50, cy: 54, size, font: p.font, weight, fill: pal.fg }),
    ];
  };

  const commonSchema = (comps) => [
    { key: 'font', label: P.t('paramFont'), type: 'select', options: FONT_OPTIONS.map((f) => [f, f]) },
    { key: 'case', label: P.t('paramCase'), type: 'select', options: [['asis', P.t('caseAsIs')], ['lower', P.t('caseLower')], ['upper', P.t('caseUpper')]] },
    { key: 'composition', label: P.t('paramComposition'), type: 'select', options: [['auto', P.t('compositionAuto')], ...comps.map((n, i) => [String(i), n])] },
    { key: 'showChannel', label: P.t('paramShowChannel'), type: 'bool' },
    { key: 'showNumber', label: P.t('paramShowNumber'), type: 'bool' },
    { key: 'photo', label: P.t('paramPhoto'), type: 'bool' },
    { key: 'density', label: P.t('paramDensity'), type: 'range', min: 0.4, max: 1.6, step: 0.1 },
  ];

  // Registration order is the order of the engine picker in the editor.
  P.ENGINES = {};
  P.defineEngine = (id, engine) => {
    engine.id = id;
    engine.schema = commonSchema(engine.comps);
    engine.renderAvatar ??= defaultAvatar;
    P.ENGINES[id] = engine;
    return engine;
  };

  P.kit = { TRACK, WEIGHTS, CAP, photo, oneLine, label, centeredLine, lineSize, titleBottom };
})();
