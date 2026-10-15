// YouTube DOM adapter: selectors and extraction of videos, titles and channels.
// Selectors are deliberately loose. Logic keys off links, ids and custom element names,
// never off class names, which YouTube renames often.
(() => {
  const P = globalThis.Plakat;

  const SEL = {
    videoLink: 'a[href*="/watch?v="], a[href^="/shorts/"], a[href*="youtube.com/shorts/"]',
    card: [
      'yt-lockup-view-model', 'ytm-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2',
      'ytd-rich-item-renderer', 'ytd-rich-grid-media', 'ytd-video-renderer', 'ytd-compact-video-renderer',
      'ytd-grid-video-renderer', 'ytd-playlist-video-renderer', 'ytd-playlist-panel-video-renderer',
      'ytd-reel-item-renderer', 'ytd-compact-radio-renderer', 'ytd-movie-renderer',
    ].join(','),
    skipThumb: '#movie_player, .html5-video-player, ytd-macro-markers-list-item-renderer, #chapters, ytd-notification-renderer, .ytp-ce-element',
    channelLink: 'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"], a[href*="youtube.com/@"]',
    avatarImg: [
      'yt-avatar-shape img', 'yt-decorated-avatar-view-model img',
      '#avatar img', '#channel-thumbnail img', '#owner img', '#author-thumbnail img',
      'ytd-guide-entry-renderer yt-img-shadow img',
    ].join(','),
    comment: 'ytd-comment-view-model, ytd-comment-renderer',
    // The signed-in user's own avatar, the player and notifications are left alone.
    skipAvatar: 'ytd-masthead, #masthead-container, ytd-topbar-menu-button-renderer, ytd-active-account-header-renderer, ' +
      'ytd-comment-simplebox-renderer, ytd-commentbox, #movie_player, .html5-video-player, ytd-notification-renderer',
    pageHeader: 'yt-page-header-renderer, yt-page-header-view-model, #channel-header, ytd-c4-tabbed-header-renderer',
    owner: '#owner, ytd-video-owner-renderer',
  };

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // Visible text of an element, without our own overlays: their SVG <text> (initials,
  // titles) would otherwise leak into channel names once an overlay sits inside a link.
  const skipOverlays = { acceptNode: (n) => (n.parentElement?.closest('.plakat-ov') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) };
  const textOf = (el) => {
    if (!el) return '';
    if (!el.querySelector('.plakat-ov')) return clean(el.textContent);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, skipOverlays);
    let s = '';
    while (walker.nextNode()) s += walker.currentNode.nodeValue;
    return clean(s);
  };

  const vidFromHref = (href) => {
    if (!href) return null;
    try {
      const u = new URL(href, location.origin);
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
      return u.pathname === '/watch' ? u.searchParams.get('v') : null;
    } catch {
      return null;
    }
  };

  // "/@Handle/videos" -> "@handle", "/channel/UC…" -> "channel:UC…".
  const channelKeyFromPath = (path) => {
    if (!path) return null;
    try {
      path = new URL(path, location.origin).pathname;
    } catch {
      return null;
    }
    const m = path.match(/^\/(@[^/?#]+)/);
    if (m) return decodeURIComponent(m[1]).toLowerCase();
    const m2 = path.match(/^\/(channel|c|user)\/([^/?#]+)/);
    return m2 ? `${m2[1]}:${m2[2]}` : null;
  };

  const linkKey = (a) => channelKeyFromPath(a.getAttribute('href'));
  const linkName = (a) => textOf(a) || clean(a.getAttribute('title'));

  const THUMB_URL = /^https:\/\/i\d?\.ytimg\.com\//;
  const AVATAR_URL = /^https:\/\/(?:yt\d?\.ggpht\.com|yt\d?\.googleusercontent\.com|i\d?\.ytimg\.com)\//;
  const imageUrl = (img, re) => {
    const src = img.currentSrc || img.src || '';
    return re.test(src) ? src : null;
  };

  // ---------- Videos ----------
  const findCard = (a) => {
    const c = a.closest(SEL.card);
    if (c) return c;
    let el = a.parentElement;
    for (let i = 0; i < 6 && el && el !== document.body; i++, el = el.parentElement) {
      if (el.querySelector('h3, #video-title')) return el;
    }
    return a.parentElement || a;
  };

  const findTitle = (card, a, vid) => {
    const vt = card.querySelector('#video-title');
    let t = vt && (clean(vt.getAttribute('title')) || textOf(vt));
    if (!t) {
      for (const l of card.querySelectorAll(SEL.videoLink)) {
        if (l === a || l.querySelector('img') || vidFromHref(l.getAttribute('href')) !== vid) continue;
        t = clean(l.getAttribute('title')) || textOf(l);
        if (t) break;
      }
    }
    if (!t) {
      const h3 = card.querySelector('h3');
      t = h3 && (clean(h3.getAttribute('title')) || textOf(h3));
    }
    if (!t) t = clean(a.getAttribute('title'));
    return t || '';
  };

  // ---------- Channels ----------
  const pageChannelName = () => {
    const el = document.querySelector('yt-page-header-renderer h1, yt-dynamic-text-view-model h1, #channel-header #channel-name #text, ytd-c4-tabbed-header-renderer #text');
    return textOf(el) || clean(document.title.replace(/ - YouTube$/, ''));
  };

  // Channel of the page itself (/@handle, /channel/…), or null elsewhere.
  const pageChannel = () => {
    const key = channelKeyFromPath(location.pathname);
    return key ? { key, name: pageChannelName() || key.replace(/^@/, '') } : null;
  };

  // First channel link under root, preferring one that carries the channel name.
  const channelFromLinks = (root) => {
    let key = null;
    for (const l of root.querySelectorAll(SEL.channelLink)) {
      const k = linkKey(l);
      if (!k) continue;
      key ??= k;
      const name = textOf(l);
      if (name) return { key: k, name };
    }
    return key ? { key, name: '' } : null;
  };

  // Channel of a video card. Without any link it falls back to the page's channel,
  // then to the channel name alone; '_' means unknown.
  const findChannel = (card) => {
    let { key = null, name = '' } = channelFromLinks(card) || {};
    if (!name) {
      const el = card.querySelector('ytd-channel-name #text, #channel-name #text, .yt-content-metadata-view-model__metadata-text, [class*="metadata-text"]');
      name = textOf(el);
    }
    if (!key && !name) ({ key = null, name = '' } = pageChannel() || {});
    if (!key && name) key = 'name:' + name.toLowerCase();
    if (!name && key) name = key.replace(/^@/, '');
    return { key: key || '_', name };
  };

  // Channel the page belongs to: the channel itself on its own pages, the video's owner
  // on /watch, null elsewhere (feed, search, Shorts). YouTube keeps a hidden watch page
  // in the DOM after leaving it, hence the path check before reading #owner.
  const pageChannelKey = () => {
    const key = channelKeyFromPath(location.pathname);
    if (key || location.pathname !== '/watch') return key;
    const owner = document.querySelector(SEL.owner);
    return (owner && channelFromLinks(owner)?.key) || null;
  };

  // Name of channel `key` from the closest link that shows it, searching outwards from el.
  const channelNameNear = (el, key) => {
    if (el.matches(SEL.channelLink) && linkKey(el) === key && linkName(el)) return linkName(el);
    for (let i = 0; el && el !== document.body && i < 6; el = el.parentElement, i++) {
      for (const a of el.querySelectorAll(SEL.channelLink)) {
        if (linkKey(a) === key && linkName(a)) return linkName(a);
      }
    }
    return '';
  };

  // Channel of an avatar <img>: the page's channel in the channel header, the video's
  // owner on the watch page, otherwise the nearest /@handle or /channel/… link.
  const avatarChannel = (img) => {
    if (img.closest(SEL.pageHeader)) {
      const page = pageChannel();
      if (page) return page;
    }
    const owner = img.closest(SEL.owner);
    if (owner) {
      const ch = channelFromLinks(owner);
      if (ch) return ch;
    }
    let link = img.closest(SEL.channelLink);
    let key = link && linkKey(link);
    for (let el = img.parentElement, i = 0; !key && el && el !== document.body && i < 8; el = el.parentElement, i++) {
      link = [...el.querySelectorAll(SEL.channelLink)].find(linkKey);
      key = link && linkKey(link);
    }
    if (!key) return null;
    return { key, name: channelNameNear(link, key) || clean(img.getAttribute('alt')) };
  };

  // ---------- Page metadata ----------
  // Meta tags (title, keywords, category) are server-rendered for the page the document
  // was loaded for. YouTube's SPA navigation leaves them in place, so they are read only
  // while the URL still shows that page.
  const pageId = () => {
    const vid = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
    if (vid) return 'watch:' + vid;
    const key = channelKeyFromPath(location.pathname);
    return key ? 'channel:' + key : null;
  };
  const loadedPage = pageId();
  const meta = (sel) => clean(document.querySelector(sel)?.getAttribute('content'));
  // What YouTube puts in meta keywords on pages that have none of their own.
  const GENERIC_KEYWORDS = 'video, sharing, camera phone, video phone, free, upload';

  // Topic hints of the loaded watch or channel page: { id, channel, item?, keywords? }.
  // null on other pages, after navigating away, and until the watch page shows its owner.
  const pageHints = () => {
    const id = pageId();
    if (!id || id !== loadedPage) return null;
    let keywords = meta('meta[name="keywords"]');
    if (keywords === GENERIC_KEYWORDS) keywords = '';
    if (id.startsWith('channel:')) return keywords ? { id, channel: { key: id.slice(8), name: '' }, keywords } : null;
    const owner = document.querySelector(SEL.owner);
    const channel = owner && channelFromLinks(owner);
    const title = meta('meta[name="title"]') || meta('meta[property="og:title"]');
    if (!channel || !title) return null;
    const item = { vid: id.slice(6), title };
    if (keywords) item.tags = keywords;
    const genre = meta('meta[itemprop="genre"]');
    if (genre) item.genre = genre;
    return { id, channel, item };
  };

  P.yt = {
    SEL, clean, vidFromHref, channelKeyFromPath, findCard, findTitle, findChannel, avatarChannel, pageChannelKey, pageHints,
    thumbUrl: (img) => imageUrl(img, THUMB_URL),
    avatarUrl: (img) => imageUrl(img, AVATAR_URL),
  };
})();
