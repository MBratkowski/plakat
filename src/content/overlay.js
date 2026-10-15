// Overlays: an absolutely positioned <div> inserted right after the original <img>,
// so YouTube's own badges (duration, progress) stay above it. The div remembers the
// signature of what it shows, which is how recycled elements are detected.
(() => {
  const P = globalThis.Plakat;

  const cache = new Map(); // signature -> virtual <svg>
  const CACHE_MAX = 800;

  const find = (host, cls) => host.querySelector(`:scope > .${cls}`);

  P.overlay = {
    find,

    // The overlay of class `cls` in host, created after `after` when missing.
    mount(host, after, cls) {
      let ov = find(host, cls);
      if (!ov) {
        ov = document.createElement('div');
        ov.className = `plakat-ov ${cls}`;
        after.after(ov);
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      }
      return ov;
    },

    show(ov, sig, vnode) {
      ov.dataset.sig = sig;
      ov.replaceChildren(P.toDom(vnode));
    },

    remove(host, cls) {
      find(host, cls)?.remove();
    },

    // Virtual trees are cached by signature; the DOM is rebuilt from them on demand.
    memo(sig, build) {
      let vnode = cache.get(sig);
      if (!vnode) {
        vnode = build();
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
        cache.set(sig, vnode);
      }
      return vnode;
    },

    clearCache: () => cache.clear(),
  };
})();
