// Avatar pass: channel avatars get a poster avatar from the same series (palette,
// forms, angle) as the channel's thumbnails. Comment authors are people rather than
// channels with a series, so they are skipped unless settings.commentAvatars is on.
(() => {
  const P = globalThis.Plakat;
  const { yt } = P;
  const CLS = 'plakat-av';
  const MIN_SIZE = 16;

  const isBox = (el) => !['inline', 'contents'].includes(getComputedStyle(el).display);

  // The image's nearest box ancestor; `after` is the host's child that holds the image.
  const hostInfo = (img) => {
    let after = img, host = img.parentElement;
    for (let i = 0; host && i < 3 && !isBox(host); i++) {
      after = host;
      host = host.parentElement;
    }
    return host ? { host, after } : null;
  };

  // The overlay fills the host (inset: 0) unless the host is larger than the image,
  // in which case it is placed over the image box.
  const place = (ov, img, host) => {
    const r = img.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    const same = Math.abs(r.left - hr.left) < 1.5 && Math.abs(r.top - hr.top) < 1.5
      && Math.abs(r.width - hr.width) < 1.5 && Math.abs(r.height - hr.height) < 1.5;
    Object.assign(ov.style, same
      ? { inset: '', left: '', top: '', width: '', height: '' }
      : {
        inset: 'auto',
        left: `${r.left - hr.left - host.clientLeft}px`,
        top: `${r.top - hr.top - host.clientTop}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
  };

  const allowed = (img, settings) => {
    if (!settings.avatars || img.closest(yt.SEL.skipAvatar)) return false;
    return settings.commentAvatars || !img.closest(yt.SEL.comment);
  };

  P.avatarPass = {
    selector: yt.SEL.avatarImg,

    process(img, env) {
      const { settings } = env;
      if (!settings.enabled || !img.isConnected) return;
      const info = hostInfo(img);
      if (!info) return;
      const { host, after } = info;
      if (!allowed(img, settings)) {
        P.overlay.remove(host, CLS);
        return;
      }
      const r = img.getBoundingClientRect();
      if (r.width < MIN_SIZE || r.height < MIN_SIZE) return;
      const ch = yt.avatarChannel(img);
      if (!ch) return;
      const name = ch.name || env.names.get(ch.key) || ch.key.replace(/^@/, '');
      const src = yt.avatarUrl(img);
      const { style, salt } = P.resolveStyle(settings, ch.key, env.topics[ch.key]);
      const sig = `${env.version}|${ch.key}|${name}|${style.id}|${salt}|${src || ''}`;
      const current = P.overlay.find(host, CLS);
      if (current && current.dataset.sig === sig) return;

      const vnode = P.overlay.memo(`av|${sig}`, () => P.renderAvatar({
        style, salt, channelKey: ch.key, channelName: name, thumbUrl: src,
      }));
      const ov = P.overlay.mount(host, after, CLS);
      place(ov, img, host);
      P.overlay.show(ov, sig, vnode);
      host.classList.add('plakat-av-host');
      if (!img.closest(yt.SEL.comment)) P.seenRecorder.avatar({ key: ch.key, name }, src);
    },
  };
})();
