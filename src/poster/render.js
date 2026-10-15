// Render pipeline: style + channel/video data -> virtual <svg>.
//
// Context `x` passed to engines:
//   pal {bg, fg, a1, a2, a3}, p (params), c (channel RNG), comp(n), series (from engine.series),
//   v (variant RNG: per video for thumbnails, per channel for avatars), W, H, u = min(W, H),
//   m (margin), portrait, thumbUrl, uid (counter for local IDs), channel.
//   Thumbnails also get title, main, mainRaw, sub, keyword, number, serial, vid.
//   Avatars also get initials (1–2 letters) and initial (1 letter).
(() => {
  const P = (globalThis.Plakat ??= {});
  const { h } = P;

  P.AVATAR_SIZE = 100;

  const engineOf = (style) => P.ENGINES[style.engine] || P.ENGINES.swiss;

  const paramsOf = (engine, style) => {
    const p = { ...engine.defaults, ...(style.params || {}) };
    if (!P.FONTS[p.font]) p.font = engine.defaults.font;
    return p;
  };

  const channelRng = ({ style, salt, channelKey }) => P.rng(`c|${channelKey}|${salt}|${style.id}`);

  // The palette is always the channel RNG's first draw.
  const paletteOf = (style, c) => {
    const palettes = style.palettes && style.palettes.length ? style.palettes : P.BUILTIN_STYLES[0].palettes;
    const raw = palettes[Math.floor(c() * palettes.length)];
    return { bg: raw[0], fg: raw[1], a1: raw[2], a2: raw[3] ?? raw[1], a3: raw[4] ?? raw[2] };
  };

  // Everything one channel's posters share. The channel RNG is consumed in a fixed
  // order, palette first and then engine.series(), so the avatar and every thumbnail
  // of a channel get the same palette and the same series traits.
  const seriesOf = ({ style, salt, channelKey }) => {
    const engine = engineOf(style);
    const p = paramsOf(engine, style);
    const c = channelRng({ style, salt, channelKey });
    const pal = paletteOf(style, c);
    const comp = (n) => (p.composition === 'auto' || p.composition == null
      ? Math.floor(c() * n)
      : Math.min(n - 1, Math.max(0, +p.composition)));
    const ctx = { engine, p, c, comp, pal };
    ctx.series = engine.series ? engine.series(ctx) : {};
    return ctx;
  };

  const draw = (fn, fallback) => {
    try {
      return fn();
    } catch (e) {
      console.warn('[Plakat] render failed', e);
      return fallback();
    }
  };

  // data-palette identifies the channel's series in the DOM (debugging and e2e checks).
  const svgRoot = (W, H, pal, cls, body) => h('svg', {
    xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid slice',
    width: '100%', height: '100%', class: cls, 'data-palette': [pal.bg, pal.fg, pal.a1, pal.a2, pal.a3].join(' '),
  }, h('rect', { x: 0, y: 0, width: W, height: H, fill: pal.bg }), body);

  // The palette and title typeface of a channel's series, for theming the page around its
  // posters. Reads the channel RNG on its own, so nothing a poster draws changes.
  P.paletteFor = ({ style, salt = 0, channelKey }) => paletteOf(style, channelRng({ style, salt, channelKey }));
  P.titleFontOf = (style) => paramsOf(engineOf(style), style).font;

  P.render = ({ style, salt = 0, title, channelName, channelKey, vid, thumbUrl, W = 480, H = 270 }) => {
    const s = seriesOf({ style, salt, channelKey });
    const clean = P.cleanTitle(title) || '—';
    const { main, sub } = P.splitTitle(clean);
    const u = Math.min(W, H);
    const x = {
      ...s, W, H, u, m: Math.round(u * 0.07), portrait: H > W,
      v: P.rng(`v|${vid}|${salt}|${style.id}`),
      title: clean, main: P.applyCase(main, s.p.case), mainRaw: main, sub, channel: channelName || '',
      vid, thumbUrl, uid: 0,
      number: P.extractNumber(clean),
      keyword: P.extractKeyword(main),
      serial: P.pad(P.hash(String(vid)) % 1000),
    };
    const body = draw(() => s.engine.render(x), () => [
      P.textBlock(P.fit(clean, { font: 'Inter Tight', weight: 700, maxW: W - 40, maxH: H - 40, maxSize: 40, minSize: 10 }), { x: 20, y: 20, fill: s.pal.fg }),
    ]);
    return svgRoot(W, H, s.pal, 'plakat-svg', body);
  };

  // Square avatar for a channel. thumbUrl is the channel's original avatar image, if any.
  P.renderAvatar = ({ style, salt = 0, channelKey, channelName, thumbUrl }) => {
    const s = seriesOf({ style, salt, channelKey });
    const S = P.AVATAR_SIZE;
    const name = channelName || String(channelKey || '').replace(/^(@|name:|vid:|channel:|c:|user:)/, '');
    const initials = P.initials(name);
    const x = {
      ...s, W: S, H: S, u: S, m: Math.round(S * 0.1), portrait: false,
      v: P.rng(`a|${channelKey}|${salt}|${style.id}`),
      channel: name, initials, initial: [...initials][0], thumbUrl, uid: 0,
    };
    const body = draw(() => s.engine.renderAvatar(x), () => [
      h('text', { x: 50, y: 62, 'text-anchor': 'middle', fill: s.pal.fg, 'font-family': P.fontCss('Inter Tight'), 'font-weight': 700, 'font-size': 32 }, initials),
    ]);
    return svgRoot(S, S, s.pal, 'plakat-svg plakat-avatar', body);
  };
})();
