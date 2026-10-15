// Thumbnail pass: every /watch or /shorts link that wraps an <img> gets a poster.
(() => {
  const P = globalThis.Plakat;
  const { yt } = P;
  const CLS = 'plakat-thumb';
  const W = 480, H_LANDSCAPE = 270, H_PORTRAIT = 853;

  // Where the poster goes: next to the <img> if its parent is a box inside the link,
  // otherwise next to the link's child that contains the image.
  const hostInfo = (a, img) => {
    let host = img.parentElement;
    let after = img;
    const disp = host && getComputedStyle(host).display;
    if (!host || disp === 'inline' || disp === 'contents' || !a.contains(host)) {
      host = a;
      after = img;
      while (after.parentElement && after.parentElement !== a) after = after.parentElement;
    }
    return { host, after };
  };

  P.thumbnailPass = {
    selector: yt.SEL.videoLink,

    process(a, env) {
      const { settings } = env;
      if (!settings.enabled || !a.isConnected) return;
      const vid = yt.vidFromHref(a.getAttribute('href'));
      if (!vid) return;
      const img = a.querySelector('img');
      if (!img || a.closest(yt.SEL.skipThumb)) return;
      const { host, after } = hostInfo(a, img);
      const rect = host.getBoundingClientRect();
      if (rect.width < 96 || rect.height < 48) return;
      const card = yt.findCard(a);
      const title = yt.findTitle(card, a, vid);
      if (!title) return; // wait until YouTube renders the metadata
      const ch = yt.findChannel(card);
      // No channel at all (e.g. the Shorts shelf): one series per video, not one for everything.
      if (ch.key === '_') ch.key = 'vid:' + vid;
      const portrait = rect.width / rect.height < 0.8;
      const { style, salt } = P.resolveStyle(settings, ch.key);
      const sig = `${env.version}|${vid}|${ch.key}|${style.id}|${salt}|${portrait ? 'p' : 'l'}|${title}`;
      const current = P.overlay.find(host, CLS);
      if (current && current.dataset.sig === sig) return;

      const vnode = P.overlay.memo(sig, () => P.render({
        style, salt, title, channelName: ch.name, channelKey: ch.key, vid,
        thumbUrl: yt.thumbUrl(img) || P.thumbFor(vid, portrait), W, H: portrait ? H_PORTRAIT : H_LANDSCAPE,
      }));
      const ov = P.overlay.mount(host, after, CLS);
      ov.style.borderRadius = getComputedStyle(img).borderRadius || getComputedStyle(host).borderRadius;
      P.overlay.show(ov, sig, vnode);
      a.classList.add('plakat-a');
      env.names.set(ch.key, ch.name);
      P.seenRecorder.video(ch, vid, title);
    },
  };
})();
