// Content script entry point: loads settings, runs the thumbnail and avatar passes
// over visible elements, and reacts to settings changes and SPA navigation.
(() => {
  const P = globalThis.Plakat;
  if (!P || window.top !== window) return;

  // Shared by the passes. `version` invalidates every overlay signature at once.
  // `topics` is the stored channel -> topic map (src/store/seen.js).
  const env = { settings: null, topics: {}, version: 0, names: new Map() };
  let started = false;

  // Each pass gets its own IntersectionObserver, so only elements near the viewport render.
  const createScanner = (pass) => {
    const visible = new Set();
    const observed = new WeakSet();
    const run = (el) => pass.process(el, env);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          visible.add(e.target);
          run(e.target);
        } else visible.delete(e.target);
      }
    }, { rootMargin: '800px 0px' });
    return {
      scan() {
        for (const el of document.querySelectorAll(pass.selector)) {
          if (!observed.has(el)) {
            observed.add(el);
            io.observe(el);
          } else if (visible.has(el)) run(el);
        }
        for (const el of visible) if (!el.isConnected) visible.delete(el);
      },
      rerender() {
        for (const el of visible) run(el);
      },
    };
  };
  const scanners = [P.thumbnailPass, P.avatarPass].map(createScanner);

  // The loaded watch or channel page tells the channel's topic once per page.
  let hintedPage = null;
  const recordPageHints = () => {
    if (!env.settings?.enabled) return;
    const hints = P.yt.pageHints();
    if (!hints || hints.id === hintedPage) return;
    hintedPage = hints.id;
    P.seenRecorder.page(hints);
  };

  // The theme follows the page's channel, which can change with any DOM update.
  const scan = () => {
    scanners.forEach((s) => s.scan());
    recordPageHints();
    P.theme.apply(env.settings, env.topics);
  };
  let scanTimer = 0;
  const scheduleScan = () => {
    scanTimer ||= setTimeout(() => {
      scanTimer = 0;
      scan();
    }, 120);
  };

  const applyRootClasses = () => {
    const root = document.documentElement;
    root.classList.toggle('plakat-off', !env.settings?.enabled);
    root.classList.toggle('plakat-hover', !!env.settings?.hoverReveal);
  };

  // Re-runs the passes and the theme; only overlays whose signature changed are rebuilt.
  const refresh = () => {
    P.theme.apply(env.settings, env.topics);
    scanners.forEach((s) => s.rerender());
  };

  const rerenderAll = () => {
    env.version++;
    P.overlay.clearCache();
    applyRootClasses();
    P.theme.apply(env.settings, env.topics);
    scanners.forEach((s) => s.rerender());
  };

  // ---------- Alt+Shift+P toggles posters ----------
  const toast = (text) => {
    let t = document.querySelector('.plakat-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'plakat-toast';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 1400);
  };

  window.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey || e.code !== 'KeyP' || !env.settings) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    e.preventDefault();
    env.settings.enabled = !env.settings.enabled;
    toast(P.t(env.settings.enabled ? 'toastOn' : 'toastOff'));
    P.saveSettings(env.settings).catch(() => {});
    rerenderAll();
  }, true);

  // ---------- Start ----------
  const start = async () => {
    try {
      env.settings = await P.loadSettings();
      env.topics = await P.loadTopics();
    } catch {
      return;
    }
    applyRootClasses();
    // Colours before the fonts arrive, so the page does not flash in YouTube's own theme for long.
    P.theme.apply(env.settings, env.topics);
    await P.loadFonts();
    started = true;
    new MutationObserver(scheduleScan).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'title', 'src'],
    });
    scan();
    // Fonts that arrive after the load timeout change every measurement.
    document.fonts.addEventListener?.('loadingdone', () => {
      P.clearMeasureCache();
      rerenderAll();
    });
    window.addEventListener('yt-navigate-finish', () => setTimeout(scan, 300));
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !started) return;
    if (changes.topics) env.topics = changes.topics.newValue || {};
    if (changes.settings) {
      env.settings = P.normalizeSettings(changes.settings.newValue);
      rerenderAll();
    } else if (changes.topics && env.settings.byTopic) refresh();
  });

  start();
})();
