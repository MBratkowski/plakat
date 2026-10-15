// Building blocks of the options page and the popup: DOM helpers and poster previews.
(() => {
  const P = globalThis.Plakat;

  const $ = (s, r = document) => r.querySelector(s);

  // el('div', { class, text, onclick, ... }, ...children)
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'checked' || k === 'value') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return e;
  };

  // Static page text: [data-i18n] gets its text, [data-i18n-<attr>] the attribute, from the catalog.
  const I18N_ATTRS = ['placeholder', 'aria-label', 'title'];
  const localize = (root = document) => {
    for (const e of root.querySelectorAll('[data-i18n]')) e.textContent = P.t(e.dataset.i18n);
    for (const attr of I18N_ATTRS) {
      for (const e of root.querySelectorAll(`[data-i18n-${attr}]`)) e.setAttribute(attr, P.t(e.getAttribute(`data-i18n-${attr}`)));
    }
  };

  // Stand-in videos for channels with fewer than a few recorded titles.
  const SAMPLES = [
    { vid: 'sample-1', title: P.t('sampleTitle1') },
    { vid: 'sample-2', title: P.t('sampleTitle2') },
    { vid: 'sample-3', title: P.t('sampleTitle3') },
    { vid: 'sample-4', title: P.t('sampleTitle4') },
    { vid: 'sample-5', title: P.t('sampleTitle5') },
    { vid: 'sample-6', title: P.t('sampleTitle6') },
  ];
  const isSample = (vid) => String(vid).startsWith('sample-');

  const thumb = (style, { title, vid, channelKey, channelName, salt = 0, portrait = false }) => {
    const box = el('div', { class: portrait ? 'thumb portrait' : 'thumb' });
    box.appendChild(P.toDom(P.render({
      style, salt, title, vid, channelKey, channelName,
      thumbUrl: isSample(vid) ? null : P.thumbFor(vid, portrait),
      W: 480, H: portrait ? 853 : 270,
    })));
    return box;
  };

  // `size` in px; without it the avatar fills its grid cell.
  const avatar = (style, { channelKey, channelName, salt = 0, avatarUrl = null, size = null }) => {
    const box = el('div', { class: 'avatar', title: size ? `${size} px` : null });
    if (size) box.style.width = box.style.height = `${size}px`;
    box.appendChild(P.toDom(P.renderAvatar({ style, salt, channelKey, channelName, thumbUrl: avatarUrl })));
    return box;
  };

  const downloadStyle = (style) => {
    const data = { plakatStyle: 1, name: style.name, engine: style.engine, palettes: style.palettes, params: style.params || {} };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const slug = style.name.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || P.t('styleFileFallback');
    el('a', { href: url, download: `plakat-${slug}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  P.ui = { $, el, localize, SAMPLES, thumb, avatar, downloadStyle };
})();
