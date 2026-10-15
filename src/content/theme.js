// Optional theme for YouTube itself (settings.theme). One <style> overrides YouTube's
// colour tokens (--yt-spec-*) with paper and ink, or, in 'channel' mode, with the palette
// of the channel whose watch or channel page is open, so the page matches its posters.
// Typography and square corners are static rules in content.css under html.plakat-theme;
// they read the typefaces from the --plakat-* variables set here.
//
// Both YouTube themes are covered: html[dark] gets ink on paper inverted. Every text
// colour keeps at least 4.5:1 against the surfaces it sits on. The player keeps the
// values YouTube gave it.
(() => {
  const P = globalThis.Plakat;
  const { yt } = P;
  const CLS = 'plakat-theme';
  const MIN_CONTRAST = 4.5;
  const WHITE = '#ffffff', BLACK = '#000000';
  const PLAYER = '#movie_player, .html5-video-player, ytd-player';

  // Pages without a channel (feed, search) and the whole of 'paper' mode: the first Swiss palette.
  const PAPER = { bg: '#f1ede4', fg: '#111111', a1: '#e5322d', a2: '#111111', a3: '#e5322d' };
  const PAPER_FONT = 'Inter Tight';

  const rgba = (hex, a) => `rgba(${P.hexToRgb(hex).join(', ')}, ${a})`;

  // c moved towards `toward` until ok(c) holds.
  const pushUntil = (c, toward, ok) => {
    for (let t = 0; t < 1; t += 0.05) {
      const x = P.mix(c, toward, t);
      if (ok(x)) return x;
    }
    return toward;
  };

  // A palette as paper, ink and signature colours. Paper is its lightest colour and ink
  // its darkest, each pushed out far enough for text to reach the contrast minimum.
  // Signature colours are the chromatic ones, accents first, then the background
  // (Jazz's navy, Swiss red on red).
  const inksOf = (pal) => {
    const byLight = [pal.bg, pal.fg, pal.a1, pal.a2, pal.a3].sort((a, b) => P.luminance(a) - P.luminance(b));
    return {
      paper: pushUntil(byLight[byLight.length - 1], WHITE, (c) => P.luminance(c) >= 0.7),
      ink: pushUntil(byLight[0], BLACK, (c) => P.luminance(c) <= 0.02),
      signature: [pal.a1, pal.bg, pal.a2, pal.a3, pal.fg].filter((c) => P.chroma(c) >= 0.2),
    };
  };

  // The first signature colour that already reads on `on`, else the first one.
  const pickOn = (signature, on) => signature.find((c) => P.contrast(c, on) >= 3) || signature[0];

  // YouTube's tokens for one of its themes.
  const tokens = ({ paper, ink, signature }, dark) => {
    const bg = dark ? ink : paper;
    const text = dark ? paper : ink;
    const layer = (t) => P.mix(bg, text, t);
    const raised = dark ? layer(0.08) : bg;
    const menu = dark ? layer(0.11) : bg;
    const surfaces = [bg, raised, menu, layer(0.09)];
    const text2 = P.withContrast(P.mix(text, bg, 0.35), surfaces, MIN_CONTRAST, text);
    const text3 = P.mix(text, bg, 0.55);
    const accent = signature.length ? P.withContrast(pickOn(signature, bg), surfaces, MIN_CONTRAST, text) : text;
    // Fills with white text on them: the red Subscribe button, LIVE badges.
    const brand = P.withContrast(signature.length ? pickOn(signature, WHITE) : ink, [WHITE], MIN_CONTRAST, BLACK);
    const wash = rgba(text, dark ? 0.1 : 0.06);
    const hover = rgba(text, dark ? 0.16 : 0.1);
    const line = rgba(text, dark ? 0.2 : 0.12);
    return {
      '--yt-spec-base-background': bg,
      '--yt-spec-raised-background': raised,
      '--yt-spec-menu-background': menu,
      '--yt-spec-general-background-a': layer(dark ? 0.04 : 0.03),
      '--yt-spec-general-background-b': layer(dark ? 0.06 : 0.05),
      '--yt-spec-general-background-c': layer(0.09),
      '--yt-spec-inverted-background': text,
      '--yt-spec-additive-background': wash,
      '--yt-spec-badge-chip-background': wash,
      '--yt-spec-suggested-action': wash,
      '--yt-spec-button-chip-background-hover': hover,
      '--yt-spec-mono-tonal-hover': hover,
      '--yt-spec-touch-response': text,
      '--yt-spec-10-percent-layer': line,
      '--yt-spec-outline': line,
      '--yt-spec-text-primary': text,
      '--yt-spec-text-primary-inverse': bg,
      '--yt-spec-text-secondary': text2,
      '--yt-spec-text-disabled': text3,
      '--yt-spec-icon-active-other': text,
      '--yt-spec-icon-inactive': text2,
      '--yt-spec-icon-disabled': text3,
      '--yt-spec-wordmark-text': text,
      '--yt-spec-call-to-action': accent,
      '--yt-spec-themed-blue': accent,
      '--yt-spec-brand-link-text': accent,
      '--yt-spec-brand-icon-active': brand,
      '--yt-spec-brand-button-background': brand,
      '--yt-spec-static-brand-red': brand,
      '--ytd-searchbox-background': bg,
      '--ytd-searchbox-text-color': text,
      '--ytd-searchbox-legacy-border-color': line,
      '--ytd-searchbox-legacy-button-color': layer(dark ? 0.04 : 0.03),
      '--ytd-searchbox-legacy-button-border-color': line,
    };
  };
  const TOKEN_NAMES = Object.keys(tokens(inksOf(PAPER), false));

  // Titles in the series' typeface at its heaviest weight up to 700; labels in Oswald,
  // running text in Inter Tight.
  const fontVars = (font) => {
    const f = P.FONTS[font] || P.FONTS[PAPER_FONT];
    return {
      '--plakat-title-font': f.css,
      '--plakat-title-weight': Math.max(...f.weights.filter((w) => w <= 700)),
      '--plakat-label-font': P.fontCss('Oswald'),
      '--plakat-text-font': P.fontCss('Inter Tight'),
    };
  };

  const block = (selector, vars, important) => `${selector} {\n${Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v}${important ? ' !important' : ''};`).join('\n')}\n}\n`;

  // YouTube's own values of the tokens for its current theme, read with the theme sheet
  // switched off. Tokens YouTube leaves undefined go back to undefined ('initial').
  let sheet = null;
  const youtubeTokens = () => {
    if (sheet?.sheet) sheet.sheet.disabled = true;
    const cs = getComputedStyle(document.documentElement);
    const out = Object.fromEntries(TOKEN_NAMES.map((n) => [n, cs.getPropertyValue(n).trim() || 'initial']));
    if (sheet?.sheet) sheet.sheet.disabled = false;
    return out;
  };

  const cssFor = (look) => {
    const inks = inksOf(look.palette);
    const html = `html.${CLS}`;
    // YouTube marks dark subtrees with [dark] and may redeclare tokens on ytd-app, so
    // both get the theme too. The player is excluded and then reset to YouTube's values;
    // :where() keeps any rule YouTube has for the player itself in charge.
    return [
      block(html, fontVars(look.font), true),
      block(`${html}:not([dark]), ${html}:not([dark]) ytd-app:not([dark])`, tokens(inks, false), true),
      block(`${html}[dark], ${html}[dark] ytd-app, ${html} [dark]:not(${PLAYER}, :is(${PLAYER}) *)`, tokens(inks, true), true),
      block(`:where(${PLAYER})`, youtubeTokens(), false),
    ].join('');
  };

  // What the theme shows on this page: the series of the page's channel in 'channel'
  // mode, paper everywhere else. The channel's topic goes in, as for its posters.
  const lookFor = (settings, topics) => {
    const key = settings.theme === 'channel' ? yt.pageChannelKey() : null;
    if (!key) return { key: '', palette: PAPER, font: PAPER_FONT };
    const { style, salt } = P.resolveStyle(settings, key, topics[key]);
    return { key, palette: P.paletteFor({ style, salt, channelKey: key }), font: P.titleFontOf(style) };
  };

  let current = null;
  let currentTopics = {};
  let lastSig = '';
  let darkObserver = null;

  // Cheap when nothing changed, so it can run on every scan: the sheet is rewritten only
  // when the mode, the page's channel, its series or YouTube's light/dark theme changes.
  // `topics` is the stored channel -> topic map (src/store/seen.js).
  const apply = (settings, topics = {}) => {
    current = settings;
    currentTopics = topics;
    const root = document.documentElement;
    if (!settings || !settings.enabled || settings.theme === 'off') {
      sheet?.remove();
      root.classList.remove(CLS);
      lastSig = '';
      return;
    }
    const look = lookFor(settings, topics);
    const pal = look.palette;
    const palette = [pal.bg, pal.fg, pal.a1, pal.a2, pal.a3].join(' ');
    const sig = [settings.theme, look.key, palette, look.font, root.hasAttribute('dark')].join('|');
    if (sig === lastSig && sheet?.isConnected) return;
    lastSig = sig;

    sheet ??= Object.assign(document.createElement('style'), { id: CLS });
    sheet.textContent = cssFor(look);
    Object.assign(sheet.dataset, { mode: settings.theme, channel: look.key, palette });
    if (!sheet.isConnected) (document.head || root).appendChild(sheet);
    root.classList.add(CLS);

    // YouTube's appearance setting flips html[dark] without a navigation.
    darkObserver ??= new MutationObserver(() => apply(current, currentTopics));
    darkObserver.observe(root, { attributes: true, attributeFilter: ['dark'] });
  };

  P.theme = { apply };
})();
