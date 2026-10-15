// Built-in styles and picking a style for a channel.
// A style is { id, name, engine, palettes[[bg, fg, a1, a2, a3]], params }.
(() => {
  const P = (globalThis.Plakat ??= {});

  // The order is part of the seed: resolveStyle() picks by index from the pool.
  P.BUILTIN_STYLES = [
    {
      id: 'swiss', name: P.t('builtinSwiss'), engine: 'swiss', params: {},
      palettes: [
        ['#f1ede4', '#111111', '#e5322d', '#111111', '#e5322d'],
        ['#e5322d', '#ffffff', '#111111', '#f1ede4', '#111111'],
        ['#111111', '#f1ede4', '#e5322d', '#8a8a8a', '#e5322d'],
        ['#f1ede4', '#111111', '#1f4fd8', '#f2b705', '#1f4fd8'],
        ['#f2b705', '#111111', '#111111', '#e5322d', '#111111'],
        ['#dde3e6', '#0f1b2a', '#ff5a1f', '#0f1b2a', '#ff5a1f'],
      ],
    },
    {
      id: 'bauhaus', name: P.t('builtinBauhaus'), engine: 'bauhaus', params: {},
      palettes: [
        ['#efe6d2', '#1c1c1c', '#d6382c', '#1f4e9c', '#f2b705'],
        ['#1c1c1c', '#efe6d2', '#d6382c', '#2f6fd0', '#f2b705'],
        ['#f4f0e8', '#1c1c1c', '#e0603a', '#2d6a4f', '#e9c46a'],
        ['#e9e3d5', '#22223b', '#c1121f', '#003049', '#fdf0d5'],
      ],
    },
    {
      id: 'konstrukt', name: P.t('builtinKonstrukt'), engine: 'konstrukt', params: {},
      palettes: [
        ['#ece3cf', '#151515', '#c8201e', '#151515', '#c8201e'],
        ['#e8dcc2', '#1a1a1a', '#b5121b', '#1a1a1a', '#b5121b'],
        ['#d9d4c7', '#111111', '#d1442b', '#111111', '#d1442b'],
      ],
    },
    {
      id: 'jazz', name: P.t('builtinJazz'), engine: 'jazz', params: {},
      palettes: [
        ['#0e3a5b', '#f4f1ea', '#f5c518', '#0b2236', '#8fc1e3'],
        ['#121212', '#f4f1ea', '#e94f37', '#121212', '#d9d4c7'],
        ['#f4f1ea', '#121212', '#1d6fa5', '#1d3557', '#e8e2d4'],
        ['#2d4a3e', '#f4f1ea', '#f2a541', '#16261f', '#c9dcb3'],
        ['#5b1e3d', '#f6e7d8', '#f7b32b', '#2e0f20', '#f2b5d4'],
      ],
    },
    {
      id: 'ma', name: P.t('builtinMa'), engine: 'ma', params: {},
      palettes: [
        ['#f3eee4', '#1b1b1b', '#c0392b', '#8a8174', '#c0392b'],
        ['#141414', '#eee7da', '#d4492f', '#7a7266', '#d4492f'],
        ['#e9e4d8', '#2b2b2b', '#2b2b2b', '#8f8778', '#2b2b2b'],
      ],
    },
  ];
  for (const s of P.BUILTIN_STYLES) s.builtin = true;
  P.BUILTIN_POOL = P.BUILTIN_STYLES.map((s) => s.id);

  P.allStyles = (settings) => [...P.BUILTIN_STYLES, ...((settings && settings.customStyles) || [])];

  // A pinned style wins; otherwise the channel seed picks one from the pool.
  P.resolveStyle = (settings, channelKey) => {
    const styles = P.allStyles(settings);
    const conf = (settings.channels || {})[channelKey] || {};
    const salt = conf.salt || 0;
    let style = conf.styleId && styles.find((s) => s.id === conf.styleId);
    const pinned = !!style;
    if (!style) {
      const pool = styles.filter((s) => (settings.pool || P.BUILTIN_POOL).includes(s.id));
      const list = pool.length ? pool : styles;
      style = list[Math.floor(P.rng(`pool|${channelKey}|${salt}`)() * list.length)];
    }
    return { style, salt, pinned };
  };
})();
