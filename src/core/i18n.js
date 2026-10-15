// User-facing text. It lives in _locales/<lang>/messages.json (default_locale "pl")
// and is read through chrome.i18n, so no UI copy sits in the code.
//
// P.t(key, ...subs) returns the message with its placeholders filled from subs.
// Pages without the extension API (dev/gallery.html opened from disk) get the key
// itself, so engines and styles, which name themselves at load time, still load there.
(() => {
  const P = (globalThis.Plakat ??= {});
  const i18n = globalThis.chrome?.i18n;

  P.t = (key, ...subs) => (i18n && i18n.getMessage(key, subs.map(String))) || key;
})();
