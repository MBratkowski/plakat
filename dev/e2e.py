#!/usr/bin/env python3
"""End-to-end checks of the extension against dev/mock-youtube.html.

Usage: python3 dev/e2e.py [editor]

Launches Chromium with the unpacked extension, serves the mock for every
https://www.youtube.com/ page (with a Trusted Types CSP, like the real site) and
local images for i.ytimg.com and yt3.ggpht.com. Prints PASS/FAIL per assertion,
saves screenshots to $TMPDIR/plakat-e2e/ and exits non-zero on any failure.
`editor` also opens the style editor on the options page.

Requires: pip install playwright && playwright install chromium
"""
import hashlib
import json
import pathlib
import re
import sys
import tempfile

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEV = ROOT / "dev"
OUT = pathlib.Path(tempfile.gettempdir()) / "plakat-e2e"
YT = "https://www.youtube.com"
# Channel names as dev/mock-youtube.html shows them.
NAMES = {
    "@kanaltechniczny": "Kanał Techniczny", "@androiddevelopers": "Android Developers",
    "@ciekawemiejsca": "Ciekawe Miejsca", "@designtalks": "Design Talks",
    "@rozmowy": "Rozmowy o biznesie", "@biegaczwro": "Biegacz z Wrocławia", "@tylkowmenu": "Kanał Tylko w Menu",
}

failures = []


def check(name, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok or not detail else f"  ({detail})"))
    if not ok:
        failures.append(name)


# ---------- Static checks ----------
def static_checks():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    content_js = manifest["content_scripts"][0]["js"]
    shared = [s for s in content_js if not s.startswith("src/content/")]
    rendering = [s for s in shared if s.startswith(("src/core/", "src/engines/", "src/poster/"))]

    def page_scripts(html):
        srcs = re.findall(r'<script src="([^"]+)"', (ROOT / html).read_text())
        base = (ROOT / html).parent
        return [str((base / s).resolve().relative_to(ROOT)) for s in srcs]

    for html, expected in [("options/options.html", shared), ("popup/popup.html", shared), ("dev/gallery.html", rendering), ("dev/webstore.html", rendering)]:
        got = [s for s in page_scripts(html) if s.startswith("src/")]
        check(f"{html} loads the shared scripts in manifest order", got == expected, f"got {got}")

    offenders = [
        str(f.relative_to(ROOT)) for f in (ROOT / "src").rglob("*.js")
        if re.search(r"\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write", f.read_text())
    ]
    check("no innerHTML-style sinks in src/ (Trusted Types)", not offenders, offenders)

    # User-facing text lives in _locales/pl/messages.json; code refers to it by key.
    catalog = json.loads((ROOT / "_locales" / "pl" / "messages.json").read_text())
    lowered = [k.lower() for k in catalog]
    check("catalog keys are unique ignoring case", len(set(lowered)) == len(lowered))
    sources = {f: f.read_text() for pattern in ("src/**/*.js", "options/*.js", "options/*.html", "popup/*.js", "popup/*.html")
               for f in ROOT.glob(pattern)}
    manifest_text = (ROOT / "manifest.json").read_text()
    used = set(re.findall(r"__MSG_(\w+)__", manifest_text))
    for text in sources.values():
        used |= set(re.findall(r"""P\.t\(\s*['"](\w+)['"]""", text))
        used |= set(re.findall(r'data-i18n(?:-[\w-]+)?="(\w+)"', text))
    missing = sorted(used - set(catalog))
    check("every message key used in code is in the catalog", not missing, missing)
    everything = "\n".join([manifest_text, *sources.values()])
    unused = sorted(k for k in catalog if not re.search(rf"""['"]{k}['"]|__MSG_{k}__""", everything))
    check("every catalog message is used", not unused, unused)
    # src/core/text.js keeps Polish stopwords as data, not UI copy.
    leaks = sorted(str(f.relative_to(ROOT)) for f, text in sources.items()
                   if f.name != "text.js" and re.search(r"[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ„”]", text))
    check("no Polish UI literals outside _locales", not leaks, leaks)


# ---------- Browser helpers ----------
def serve(context):
    mock = (DEV / "mock-youtube.html").read_bytes()
    images = sorted((DEV / "thumbs").glob("*.jpg"))

    def youtube(route):
        if route.request.resource_type == "document":
            route.fulfill(status=200, body=mock, headers={
                "content-type": "text/html; charset=utf-8",
                "content-security-policy": "require-trusted-types-for 'script'; trusted-types mock",
            })
        else:
            route.fulfill(status=404, body="")

    def image(route):
        i = int(hashlib.md5(route.request.url.encode()).hexdigest(), 16) % len(images)
        route.fulfill(status=200, body=images[i].read_bytes(), headers={"content-type": "image/jpeg"})

    context.route(re.compile(r"https://www\.youtube\.com/.*"), youtube)
    context.route(re.compile(r"https://(i\d?\.ytimg\.com|yt\d?\.ggpht\.com)/.*"), image)


def extension_id(context):
    page = context.new_page()
    page.goto("chrome://extensions/")
    ids = page.evaluate("""() => new Promise((r) => chrome.developerPrivate.getExtensionsInfo((all) =>
        r(all.filter((e) => e.name.startsWith('Plakat')).map((e) => e.id))))""")
    page.close()
    return ids[0] if ids else None


# Snapshot of every overlay on the page: kind, channel key, palette, and where it sits.
OVERLAYS_JS = """() => [...document.querySelectorAll('.plakat-ov')].map((ov) => {
  const kind = ov.classList.contains('plakat-av') ? 'av' : 'thumb';
  const sig = ov.dataset.sig.split('|');
  const ctx = ['ytd-masthead', 'ytd-comment-view-model', 'ytd-comment-renderer', 'ytd-comment-simplebox-renderer',
    '#movie_player', 'ytd-guide-entry-renderer', '#owner', 'yt-page-header-view-model', 'ytd-video-renderer',
    'yt-lockup-view-model', 'ytd-rich-item-renderer', 'ytm-shorts-lockup-view-model'].find((s) => ov.closest(s)) || '';
  return {
    kind, ctx, key: kind === 'av' ? sig[1] : sig[2], sig: ov.dataset.sig,
    palette: ov.querySelector('svg')?.getAttribute('data-palette'),
    radius: getComputedStyle(ov).borderRadius, opacity: getComputedStyle(ov).opacity,
  };
})"""


def overlays(page, kind=None, ctx=None):
    return [o for o in page.evaluate(OVERLAYS_JS) if (kind is None or o["kind"] == kind) and (ctx is None or o["ctx"] == ctx)]


# Elements whose data-i18n text or attribute is empty or still the bare key.
UNLOCALIZED_JS = """() => [...document.querySelectorAll('*')].flatMap((e) => [...e.attributes]
  .filter((a) => a.name.startsWith('data-i18n'))
  .filter((a) => {
    const v = a.name === 'data-i18n' ? e.textContent : e.getAttribute(a.name.slice('data-i18n-'.length));
    return !v || v === a.value;
  })
  .map((a) => a.value))"""


def count_imgs(page, selector):
    return page.evaluate(f"document.querySelectorAll({json.dumps(selector)}).length")


# ---------- Scenarios ----------
def youtube_checks(page, console):
    page.goto(YT + "/")
    page.wait_for_timeout(3500)  # late hydration at 1.2 s, recycling at 2 s
    page.screenshot(path=str(OUT / "youtube-home.png"), full_page=True)

    thumbs = overlays(page, "thumb")
    by_ctx = lambda c: [o for o in thumbs if o["ctx"] == c]
    check("old DOM: every card has a poster", len(by_ctx("ytd-rich-item-renderer")) == 4, len(by_ctx("ytd-rich-item-renderer")))
    check("new DOM: every lockup has a poster, incl. the late one", len(by_ctx("yt-lockup-view-model")) == 5, len(by_ctx("yt-lockup-view-model")))
    check("Shorts: every short has a poster", len(by_ctx("ytm-shorts-lockup-view-model")) == 6)
    check("search: every result has a poster", len(by_ctx("ytd-video-renderer")) == 2)
    check("player: end screen untouched", not by_ctx("#movie_player"))
    recycled = [o for o in thumbs if "RECYCLED01" in o["sig"]]
    check("recycled card re-rendered for the new video and channel", recycled and recycled[0]["key"] == "@designtalks", recycled)

    avs = overlays(page, "av")
    av_ctx = lambda c: [o for o in avs if o["ctx"] == c]
    check("home (old DOM): card avatars replaced", len(av_ctx("ytd-rich-item-renderer")) == 4, len(av_ctx("ytd-rich-item-renderer")))
    check("home (new DOM): yt-avatar-shape avatars replaced", len(av_ctx("yt-lockup-view-model")) == 5, len(av_ctx("yt-lockup-view-model")))
    check("search: #channel-thumbnail avatars replaced", len(av_ctx("ytd-video-renderer")) == 2)
    check("guide: subscription avatars replaced", len(av_ctx("ytd-guide-entry-renderer")) == 5, len(av_ctx("ytd-guide-entry-renderer")))
    owner = av_ctx("#owner")
    check("watch page: #owner avatar replaced with the owner's channel", len(owner) == 1 and owner[0]["key"] == "@androiddevelopers", owner)
    check("masthead: the user's own avatar untouched", not av_ctx("ytd-masthead"))
    check("comments: untouched by default", not [o for o in avs if o["ctx"].startswith("ytd-comment")])
    check("avatars are round", all(o["radius"] == "50%" for o in avs), {o["radius"] for o in avs})
    recycled_av = [o for o in av_ctx("ytd-rich-item-renderer") if o["key"] == "@designtalks"]
    check("recycled card avatar follows the new channel", len(recycled_av) == 1)

    # Same channel, same series: palettes on avatars and thumbnails must agree.
    thumb_pal = {}
    for o in thumbs:
        thumb_pal.setdefault(o["key"], set()).add(o["palette"])
    shared = [o for o in avs if o["key"] in thumb_pal]
    mismatched = [(o["key"], o["palette"], thumb_pal[o["key"]]) for o in shared if {o["palette"]} != thumb_pal[o["key"]]]
    check("same channel has the same palette on avatar and thumbnail", len({o["key"] for o in shared}) >= 5 and not mismatched,
          mismatched or f"only {len({o['key'] for o in shared})} channels overlap")
    keys = {o["key"]: o["palette"] for o in avs}
    check("different channels get their own series", len(set(keys.values())) >= 3, keys)

    # Hover reveals the original avatar.
    host = page.locator("ytd-guide-entry-renderer .plakat-av-host").first
    host.hover()
    page.wait_for_timeout(500)
    opacity = host.evaluate("(h) => getComputedStyle(h.querySelector(':scope > .plakat-av')).opacity")
    check("hover over an avatar reveals the original", opacity == "0", opacity)
    page.mouse.move(0, 0)

    tt_errors = [m for m in console if "TrustedHTML" in m or "Trusted Type" in m]
    check("no Trusted Types violations", not tt_errors, tt_errors[:3])
    # The probe logs a violation of its own, so it runs after the console check.
    enforced = page.evaluate("() => { try { document.createElement('div').innerHTML = '<b></b>'; return false; } catch { return true; } }")
    check("mock enforces Trusted Types (innerHTML throws)", enforced)


def options_checks(context, page, ext_id, with_editor):
    popup = context.new_page()
    errors = []
    popup.on("pageerror", lambda e: errors.append(str(e)))
    popup.goto(f"chrome-extension://{ext_id}/popup/popup.html")
    popup.wait_for_selector("#preview svg", timeout=5000)
    check("popup renders a preview without errors", popup.is_checked("#enabled") and not errors, errors)
    raw = popup.evaluate(UNLOCALIZED_JS)
    check("popup: static text comes from the catalog", not raw, raw)
    popup.close()

    opts = context.new_page()
    opts.goto(f"chrome-extension://{ext_id}/options/options.html")
    opts.wait_for_selector("body[data-ready]")
    raw = opts.evaluate(UNLOCALIZED_JS)
    check("options: static text comes from the catalog", not raw, raw)
    check("options: engine labels come from the catalog", opts.evaluate("Plakat.ENGINES.swiss.label") == "Szwajcarski")
    check("options: 'Awatary kanałów' on by default", opts.is_checked("#avatars"))
    check("options: 'Awatary w komentarzach' off by default", not opts.is_checked("#commentAvatars"))

    # Comment avatars switch on: both comment DOMs get avatars, the comment box stays.
    opts.click("#commentAvatars")
    page.wait_for_timeout(800)
    in_comments = [o for o in overlays(page, "av") if o["ctx"].startswith("ytd-comment")]
    check("comment switch on: comment avatars replaced", len(in_comments) == 2 and {o["ctx"] for o in in_comments} == {"ytd-comment-view-model", "ytd-comment-renderer"}, in_comments)
    check("comment switch on: the comment box (own avatar) untouched", not [o for o in in_comments if o["ctx"] == "ytd-comment-simplebox-renderer"])
    page.locator("ytd-comments").scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / "youtube-comments.png"))
    opts.click("#commentAvatars")
    page.wait_for_timeout(800)
    check("comment switch off again: comment avatars restored", not [o for o in overlays(page, "av") if o["ctx"].startswith("ytd-comment")])

    opts.click("#avatars")
    page.wait_for_timeout(800)
    check("avatar switch off: all avatars restored", not overlays(page, "av"), len(overlays(page, "av")))
    check("avatar switch off: comment switch disabled", opts.is_disabled("#commentAvatars"))
    check("avatar switch off: thumbnails stay", len(overlays(page, "thumb")) >= 17)
    opts.click("#avatars")
    page.wait_for_timeout(800)
    check("avatar switch on again: avatars back", len(overlays(page, "av")) >= 17, len(overlays(page, "av")))
    # Re-rendering reads names from links that now contain our overlays; their text must not leak in.
    wrong = {(o["key"], o["sig"].split("|")[2]) for o in overlays(page, "av") if NAMES.get(o["key"]) != o["sig"].split("|")[2]}
    check("re-rendered avatars keep the real channel names", not wrong, wrong)
    opts.wait_for_timeout(4500)  # one more flush of the seen buffer after the re-render

    # Seen channels, written by the content script every 4 s, carry the avatar URL.
    seen = {}
    for _ in range(20):
        seen = opts.evaluate("async () => (await chrome.storage.local.get('seen')).seen || {}")
        if seen.get("@kanaltechniczny", {}).get("avatar"):
            break
        opts.wait_for_timeout(500)
    check("seen channels store the original avatar URL", "ggpht" in seen.get("@kanaltechniczny", {}).get("avatar", ""), seen.get("@kanaltechniczny"))
    check("guide-only channels are not added to the channel list", "@tylkowmenu" not in seen and "@kanaltechniczny" in seen, list(seen))
    wrong = {k: v["name"] for k, v in seen.items() if k in NAMES and v["name"] != NAMES[k]}
    check("seen channels keep the real channel names", len(seen) >= 6 and not wrong, wrong or list(seen))

    opts.reload()
    opts.wait_for_selector("body[data-ready]")
    rows = opts.locator(".ch-row")
    first = rows.first
    check("options: a row per seen channel", rows.count() >= 4, rows.count())
    check("options: channel row shows the avatar next to three thumbnails",
          first.locator(".ch-thumbs > .avatar").count() == 1 and first.locator(".ch-thumbs > .thumb").count() == 3)
    row_pal = first.evaluate("""(r) => [r.querySelector('.avatar svg'), ...r.querySelectorAll('.thumb svg')]
        .map((s) => s.getAttribute('data-palette'))""")
    check("options: row avatar matches the row's thumbnails", len(set(row_pal)) == 1, row_pal)
    opts.screenshot(path=str(OUT / "options.png"), full_page=True)

    # Privacy: the data note links the policy, and clearing forgets every seen channel.
    check("options: data note links the privacy policy", (opts.get_attribute("#dataNote a", "href") or "").endswith("/plakat/privacy.html"))
    opts.click("#clearSeen")
    opts.click("#clearSeen")
    opts.wait_for_timeout(300)
    left = opts.evaluate("async () => Object.keys((await chrome.storage.local.get('seen')).seen || {}).length")
    check("options: clearing empties the channel list", left == 0 and opts.locator(".ch-row").count() == 0, left)
    check("options: clear button is disabled on an empty list", opts.is_disabled("#clearSeen"))

    if with_editor:
        opts.click("[data-act=dup]")
        opts.wait_for_selector("#edPreview .thumb")
        opts.wait_for_timeout(200)
        order = opts.evaluate("() => !!(document.querySelector('#edAvatar').compareDocumentPosition(document.querySelector('#edPreview')) & Node.DOCUMENT_POSITION_FOLLOWING)")
        check("editor: avatar preview above the grid", order)
        check("editor: avatar shown at 96, 40 and 24 px", opts.locator("#edAvatar .avatar").count() == 3)
        before = opts.locator("#edAvatar .avatar").first.inner_html()
        opts.select_option("#edEngine", "konstrukt")
        opts.wait_for_timeout(300)
        check("editor: avatar preview follows the engine", opts.locator("#edAvatar .avatar").first.inner_html() != before)
        opts.screenshot(path=str(OUT / "editor.png"))
    opts.close()


def channel_page_checks(page):
    page.goto(YT + "/@designtalks")
    page.wait_for_timeout(1500)
    header = overlays(page, "av", "yt-page-header-view-model")
    designtalks = {o["palette"] for o in overlays(page, "thumb") if o["key"] == "@designtalks"}
    check("channel page: header avatar uses the page's channel", len(header) == 1 and header[0]["key"] == "@designtalks", header)
    check("channel page: header avatar matches the channel's thumbnails", header and {header[0]["palette"]} == designtalks, (header, designtalks))
    page.screenshot(path=str(OUT / "channel-page.png"))


def main():
    with_editor = "editor" in sys.argv[1:]
    OUT.mkdir(parents=True, exist_ok=True)
    static_checks()
    with sync_playwright() as p, tempfile.TemporaryDirectory(prefix="plakat-profile-") as profile:
        context = p.chromium.launch_persistent_context(
            profile, channel="chromium", headless=True, viewport={"width": 1400, "height": 3200},
            args=[f"--disable-extensions-except={ROOT}", f"--load-extension={ROOT}"],
        )
        serve(context)
        ext_id = extension_id(context)
        check("extension loaded", bool(ext_id))
        page = context.new_page()
        console = []
        page.on("console", lambda m: console.append(m.text))
        page.on("pageerror", lambda e: console.append(str(e)))
        youtube_checks(page, console)
        if ext_id:
            options_checks(context, page, ext_id, with_editor)
        channel_page_checks(page)
        context.close()
    print(f"\n{'OK' if not failures else f'{len(failures)} FAILED'}  ·  screenshots: {OUT}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
