# Plakat: context for Claude Code

A Chrome MV3 extension that overlays YouTube thumbnails and channel avatars with generative SVG posters. Architecture, installation and how to add an engine are in `README.md`.

## Conventions

- No bundler and no modules. Classic scripts share `globalThis.Plakat`, and the load order is in `manifest.json`: `core/` → `engines/` → `poster/` → `store/` → `content/`. Dependencies only point backwards in that order. The options page, popup and `dev/gallery.html` load the same files with `<script>` tags; `dev/e2e.py` fails when those lists drift from the manifest.
- **No `innerHTML` in the content script.** YouTube enforces Trusted Types. Engines return a virtual tree `h(tag, attrs, ...children)` and `P.toDom` creates nodes with `createElementNS`.
- Write SVG IDs as `@name` (e.g. `url(#@clip3)`). `toDom` gives them a unique prefix on every render.
- Determinism: `x.c()` is the channel RNG (the series), `x.v()` the variant RNG (per video, or per channel for avatars). An engine's `series(x)` is the only place that draws from `c()`; thumbnails and avatars both run it, which is what keeps a channel's avatar in the same series as its thumbnails. Reordering `c()` calls, or the built-in styles in `poster/styles.js`, changes the look of existing channels. New built-in styles go at the end with `optIn: true`: that keeps them out of the default pool (and out of the empty-pool fallback), so unpinned channels keep their style until the user adds the new one to the pool.
- YouTube selectors are deliberately loose (a `/watch?v=` or `/shorts/` link with an `<img>` inside; avatars by custom element names and ids). Do not tie logic to class names, YouTube renames them (e.g. `yt-lockup-view-model__*` → `ytThumbnailViewModelImage`).
- Read text from YouTube's DOM with `textOf()` in `content/youtube.js`, never `textContent`: an avatar overlay often sits inside a channel link, and its SVG `<text>` would leak into the channel name.
- Code, comments and docs are in English. User-facing strings (labels, engine and style names, import errors, toasts, sample titles) are Polish and live only in `_locales/pl/messages.json`. Scripts read them with `P.t(key, ...subs)` (`src/core/i18n.js`), HTML with `data-i18n` / `data-i18n-<attr>` filled by `P.ui.localize()`, the manifest with `__MSG_key__`. `dev/e2e.py` fails on unknown or unused keys and on Polish literals in code (`src/core/text.js` stopwords excepted).

## Tests

- `dev/gallery.html?style=<id>`, opened from disk, shows every variant of a style on sample titles, with avatars.
- `python3 dev/e2e.py [editor]` runs Playwright + Chromium with the extension loaded. `youtube.com` is replaced by `dev/mock-youtube.html` (old and new DOM, Shorts, search, player, `#owner`, guide subscriptions, comments, channel header on `/@handle`, element recycling, late hydration, Trusted Types). It prints assertions and saves screenshots to `$TMPDIR/plakat-e2e/`. Requires `pip install playwright && playwright install chromium`.
- Engine refactors must not change existing posters: render a fixed matrix with `P.toString(P.render(...))` before and after, and diff the strings.

## Backlog: from the first run on a real feed

1. **Music titles "Artist - Song"**: `splitTitle` takes the artist as `main`, so the keyword is "BILLY" instead of the song. Detect music (♪ icon next to the duration, a "… - Topic" channel, the title pattern) and then swap `main` and `sub`, or lay it out as "artist / song".
2. **Duotone on dark thumbnails is almost black** (Jazz, Constructivism). Needs auto-levels. Canvas is not an option (cross-origin taint) unless the extension gets `host_permissions` for `i.ytimg.com` and computes a histogram in the background. A simpler alternative is a stronger curve in `feComponentTransfer`.
3. **Safe zone for the duration badge**: in Bauhaus the channel label in the bottom-right corner ends up under the duration badge. All engines should leave the bottom-right corner empty (~22% of the width × 16% of the height).
4. The recommendations panel next to the playing video (watch page) and avatars on live YouTube have not been tested yet.
5. Idea: Gemini Nano (Prompt API in Chrome) extracts a keyword or mood from the title, and the engine picks forms to match.
