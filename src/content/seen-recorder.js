// Buffers channels seen on the page and writes them to storage every few seconds.
(() => {
  const P = globalThis.Plakat;
  const FLUSH_MS = 4000;

  const buffer = new Map(); // key -> { name, avatar?, items: [{ vid, title }] }
  let timer = 0;

  const entry = (key, name) => {
    const e = buffer.get(key) || { name: '', items: [] };
    if (name) e.name = name;
    buffer.set(key, e);
    return e;
  };

  const flush = async () => {
    timer = 0;
    if (!buffer.size) return;
    const batch = [...buffer];
    buffer.clear();
    try {
      await P.saveSeenBatch(batch);
    } catch {
      // The extension context is invalidated after a reload; nothing to save to.
    }
  };
  const schedule = () => {
    timer ||= setTimeout(flush, FLUSH_MS);
  };

  P.seenRecorder = {
    video(ch, vid, title) {
      if (ch.key.startsWith('vid:')) return;
      const e = entry(ch.key, ch.name);
      if (!e.items.some((i) => i.vid === vid)) e.items.push({ vid, title });
      schedule();
    },
    avatar(ch, url) {
      if (!url) return;
      entry(ch.key, ch.name).avatar = url;
      schedule();
    },
  };
})();
