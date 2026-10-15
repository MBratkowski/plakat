// Channels seen on YouTube, kept for previews on the options page and as evidence of
// their topic:
//   seen: { key: { name, avatar?, keywords?, items: [{ vid, title, tags?, genre? }], last } }
//   topics: { key: topicId }
// keywords are the channel page's meta keywords; tags and genre come from a watch page.
(() => {
  const P = (globalThis.Plakat ??= {});

  const MAX_CHANNELS = 400;
  const MAX_ITEMS = 12;
  const MAX_TOPICS = 5000;
  const MAX_TEXT = 400;

  P.loadSeen = async () => (await chrome.storage.local.get('seen')).seen || {};
  P.loadTopics = async () => (await chrome.storage.local.get('topics')).topics || {};

  // Forgets every seen channel and its topic. Settings (pinned styles, rerolls) stay.
  P.clearSeen = () => chrome.storage.local.remove(['seen', 'topics']);

  P.thumbFor = (vid, portrait) => `https://i.ytimg.com/vi/${vid}/${portrait ? 'hqdefault' : 'mqdefault'}.jpg`;

  const short = (s) => String(s).slice(0, MAX_TEXT);

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
      if (e.keywords) next.keywords = short(e.keywords);
      for (const it of e.items) {
        const i = next.items.findIndex((x) => x.vid === it.vid);
        const item = { ...it, ...(it.tags ? { tags: short(it.tags) } : {}) };
        if (i < 0) next.items.unshift(item);
        else if (it.tags || it.genre) next.items[i] = { ...next.items[i], ...item };
      }
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

  // Pure: gives a topic to each of `keys` that has none yet and whose evidence in `seen`
  // is clear. Topics are sticky: once given, a topic is never recomputed, so a channel
  // does not change its look when more titles arrive. They live apart from `seen`, whose
  // eviction would otherwise forget them. Returns `topics` itself when nothing changed.
  P.assignTopics = (topics, seen, keys) => {
    let out = topics;
    for (const key of keys) {
      if (topics[key] || !seen[key]) continue;
      const topic = P.detectTopic(seen[key]);
      if (!topic) continue;
      if (out === topics) out = { ...topics };
      out[key] = topic;
    }
    const all = Object.keys(out);
    // Insertion order is assignment order, so the oldest topics go first.
    if (out !== topics && all.length > MAX_TOPICS) all.slice(0, all.length - MAX_TOPICS).forEach((k) => delete out[k]);
    return out;
  };

  P.saveSeenBatch = async (batch) => {
    const stored = await chrome.storage.local.get(['seen', 'topics']);
    const seen = P.mergeSeen(stored.seen || {}, batch);
    const before = stored.topics || {};
    const topics = P.assignTopics(before, seen, batch.map(([key]) => key));
    await chrome.storage.local.set(topics === before ? { seen } : { seen, topics });
  };
})();
