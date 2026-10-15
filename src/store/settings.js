// User settings in chrome.storage.local:
//   settings: { enabled, hoverReveal, avatars, commentAvatars, theme, pool[], customStyles[],
//               channels{ key: { styleId?, salt? } }, byTopic, topicPools{ topic: styleId[] } }
(() => {
  const P = (globalThis.Plakat ??= {});

  P.DEFAULTS = {
    enabled: true,
    hoverReveal: true,
    avatars: true,
    // Comment authors are people, not channels with a series: off unless asked for.
    commentAvatars: false,
    // Restyling YouTube itself is opt-in: 'off', 'paper' or 'channel' (P.THEMES).
    theme: 'off',
    pool: P.BUILTIN_POOL.slice(),
    customStyles: [],
    channels: {},
    // Style by channel topic: off by default, so channels keep the look they have.
    // A topic with an empty pool draws from `pool` like any other channel.
    byTopic: false,
    topicPools: { tech: ['terminal', 'kod'] },
  };

  P.THEMES = ['off', 'paper', 'channel'];

  P.normalizeSettings = (s) => {
    s = s || {};
    return {
      ...P.DEFAULTS,
      ...s,
      theme: P.THEMES.includes(s.theme) ? s.theme : P.DEFAULTS.theme,
      pool: Array.isArray(s.pool) ? s.pool : P.DEFAULTS.pool.slice(),
      customStyles: Array.isArray(s.customStyles) ? s.customStyles : [],
      channels: s.channels && typeof s.channels === 'object' ? { ...s.channels } : {},
      byTopic: !!s.byTopic,
      // Every topic gets an array; topics missing from storage (or added later) get the default.
      topicPools: Object.fromEntries(P.TOPICS.map(({ id }) => {
        const ids = s.topicPools?.[id];
        return [id, Array.isArray(ids) ? ids.slice() : (P.DEFAULTS.topicPools[id] || []).slice()];
      })),
    };
  };

  P.loadSettings = async () => {
    const { settings } = await chrome.storage.local.get('settings');
    return P.normalizeSettings(settings);
  };

  P.saveSettings = (s) => chrome.storage.local.set({ settings: s });

  P.newStyleId = () => 'u_' + Math.random().toString(36).slice(2, 9);

  // Validates an imported style (JSON from someone else). Messages are shown to the user.
  P.sanitizeStyle = (raw) => {
    if (!raw || typeof raw !== 'object') throw new Error(P.t('importNotStyle'));
    const engine = P.ENGINES[raw.engine] ? raw.engine : null;
    if (!engine) throw new Error(P.t('importUnknownEngine', raw.engine));
    const hex = /^#[0-9a-f]{6}$/i;
    const palettes = (Array.isArray(raw.palettes) ? raw.palettes : [])
      .filter((p) => Array.isArray(p) && p.length >= 3 && p.every((c) => hex.test(c)))
      .slice(0, 12)
      .map((p) => p.slice(0, 5));
    if (!palettes.length) throw new Error(P.t('importNoPalette'));
    const params = {};
    for (const f of P.ENGINES[engine].schema) {
      const v = raw.params?.[f.key];
      if (v == null) continue;
      if (f.type === 'bool') params[f.key] = !!v;
      else if (f.type === 'range') params[f.key] = Math.min(f.max, Math.max(f.min, +v || f.min));
      else if (f.type === 'select' && f.options.some(([val]) => val === String(v))) params[f.key] = String(v);
    }
    return {
      id: P.newStyleId(),
      name: String(raw.name || P.t('importDefaultName')).slice(0, 40),
      engine,
      palettes,
      params,
    };
  };
})();
