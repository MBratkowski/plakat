// Channels seen on YouTube, kept for previews on the options page:
//   seen: { key: { name, avatar?, items: [{ vid, title }], last } }
(() => {
  const P = (globalThis.Plakat ??= {});

  const MAX_CHANNELS = 400;
  const MAX_ITEMS = 12;

  P.loadSeen = async () => (await chrome.storage.local.get('seen')).seen || {};

  // Forgets every seen channel. Settings (pinned styles, rerolls) stay.
  P.clearSeen = () => chrome.storage.local.remove('seen');

  P.thumbFor = (vid, portrait) => `https://i.ytimg.com/vi/${vid}/${portrait ? 'hqdefault' : 'mqdefault'}.jpg`;

  // Pure merge of buffered observations into the stored map. A channel seen only
  // through its avatar (e.g. a subscription in the guide) is not added on its own:
  // the list is meant for channels whose videos the user actually browses.
  P.mergeSeen = (seen, batch, now = Date.now()) => {
    const out = { ...seen };
    for (const [key, e] of batch) {
      const cur = out[key] ? { ...out[key], items: out[key].items.slice() } : null;
      if (!cur && !e.items.length) continue;
      const next = cur || { name: e.name, items: [] };
      next.name = e.name || next.name;
      if (e.avatar) next.avatar = e.avatar;
      for (const it of e.items) if (!next.items.some((i) => i.vid === it.vid)) next.items.unshift(it);
      next.items = next.items.slice(0, MAX_ITEMS);
      if (e.items.length || !cur) next.last = now;
      out[key] = next;
    }
    const keys = Object.keys(out);
    if (keys.length > MAX_CHANNELS) {
      keys.sort((a, b) => (out[a].last || 0) - (out[b].last || 0))
        .slice(0, keys.length - MAX_CHANNELS)
        .forEach((k) => delete out[k]);
    }
    return out;
  };

  P.saveSeenBatch = async (batch) => {
    const seen = P.mergeSeen(await P.loadSeen(), batch);
    await chrome.storage.local.set({ seen });
  };
})();
