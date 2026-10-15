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
    "@linuxodpodstaw": "Linux od podstaw", "@kodikawa": "Kod i Kawa", "@graniespokojnie": "Granie na Spokojnie",
}
# Channels of the mock's "programowanie" search page, and the styles of the tech topic pool.
TECH_CHANNELS = {"@linuxodpodstaw", "@kodikawa"}
TECH_STYLES = {"terminal", "kod"}

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


# Channel key -> style ids of its thumbnails and avatars, from the overlay signatures.
def styles_by_channel(page):
    out = {}
    for o in overlays(page):
        out.setdefault(o["key"], set()).add(o["sig"].split("|")[3])
    return out


# Loads url (or reloads) in the YouTube tab and brings it to the front: a background tab
# gets no IntersectionObserver callbacks, so nothing new would render there.
def show(page, url=None, wait=2500):
    if url:
        page.goto(url)
    else:
        page.reload()
    page.bring_to_front()
    page.wait_for_timeout(wait)


# seen and topics from storage, polled until ok(stored) holds (the content script writes every 4 s).
def wait_stored(opts, ok, seconds=12):
    for _ in range(seconds * 2):
        st = opts.evaluate("async () => chrome.storage.local.get(['seen', 'topics'])")
        st = {"seen": st.get("seen") or {}, "topics": st.get("topics") or {}}
        if ok(st):
            break
        opts.wait_for_timeout(500)
    return st


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
    topics_count = "async () => Object.keys((await chrome.storage.local.get('topics')).topics || {}).length"
    topics_before = opts.evaluate(topics_count)
    opts.click("#clearSeen")
    opts.click("#clearSeen")
    opts.wait_for_timeout(300)
    left = opts.evaluate("async () => Object.keys((await chrome.storage.local.get('seen')).seen || {}).length")
    check("options: clearing empties the channel list", left == 0 and opts.locator(".ch-row").count() == 0, left)
    topics_left = opts.evaluate(topics_count)
    check("options: clearing also forgets channel topics", topics_before > 0 and topics_left == 0, (topics_before, topics_left))
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


def topic_checks(context, page, ext_id):
    opts = context.new_page()
    opts.goto(f"chrome-extension://{ext_id}/options/options.html")
    opts.wait_for_selector("body[data-ready]")
    check("topics: style by topic is off by default", not opts.is_checked("#byTopic"))

    # Topics are detected from titles whether or not the feature is on.
    show(page, YT + "/results?search_query=programowanie")  # waits past the mock's hydration and recycling
    first = styles_by_channel(page)
    check("topics: tech search results rendered", TECH_CHANNELS <= set(first), sorted(first))
    topics = wait_stored(opts, lambda st: TECH_CHANNELS <= set(st["topics"]))["topics"]
    tech = TECH_CHANNELS | {"@kanaltechniczny", "@androiddevelopers"}
    check("topics: clearly tech channels are detected as tech", all(topics.get(k) == "tech" for k in tech), topics)
    check("topics: channels with unclear titles get no topic", not {"@ciekawemiejsca", "@rozmowy", "@biegaczwro"} & set(topics), topics)

    # Feature off: known topics change nothing.
    show(page)
    off = styles_by_channel(page)
    check("feature off: detected topics change no channel's style", off == first,
          {k: (first.get(k), off.get(k)) for k in set(first) | set(off) if first.get(k) != off.get(k)})
    check("feature off: no channel gets a tech style", not any(v & TECH_STYLES for v in off.values()), off)
    plain = opts.evaluate("""async (keys) => {
        const s = Plakat.normalizeSettings((await chrome.storage.local.get('settings')).settings);
        return Object.fromEntries(keys.map((k) => [k, Plakat.resolveStyle(s, k).style.id]));
    }""", sorted(off))
    check("feature off: every channel keeps its plain pick", all(off[k] == {plain[k]} for k in off), (off, plain))

    # Feature on: tech channels draw from the tech pool, everyone else stays.
    opts.click("#byTopic")
    page.wait_for_timeout(1000)
    on = styles_by_channel(page)
    on_tech = {k: on.get(k) for k in tech if k in off}
    check("feature on: tech channels draw from Terminal and Kod", len(on_tech) >= 3 and all(v and v <= TECH_STYLES for v in on_tech.values()), on_tech)
    rest = {k: (off[k], on.get(k)) for k in off if topics.get(k) != "tech"}
    check("feature on: channels without a tech topic keep their style", rest and all(a == b for a, b in rest.values()), rest)
    pals = {}
    for o in overlays(page):
        if o["key"] in TECH_CHANNELS:
            pals.setdefault(o["key"], {}).setdefault(o["kind"], set()).add(o["palette"])
    check("feature on: avatar and thumbnails of a tech channel still match",
          all(v.get("av") and v["av"] == v.get("thumb") for v in pals.values()) and len(pals) == len(TECH_CHANNELS), pals)
    page.screenshot(path=str(OUT / "youtube-topics.png"), full_page=True)

    # Options: each row shows its topic, topic pools are editable.
    opts.reload()
    opts.wait_for_selector("body[data-ready]")
    rows = opts.evaluate("""() => Object.fromEntries([...document.querySelectorAll('.ch-row')].map((r) => {
        const t = r.querySelector('.ch-topic');
        return [r.querySelector('.ch-key').textContent, [t.dataset.topic, t.textContent]];
    }))""")
    check("options: channel rows show the detected topic",
          rows.get("@kodikawa", [""])[0] == "tech" and "Technologia" in rows["@kodikawa"][1]
          and rows.get("@ciekawemiejsca", ["?"])[0] == "", rows)
    check("options: a tech row says its style comes from the topic pool", "styl z puli tematu" in rows.get("@kodikawa", ["", ""])[1], rows.get("@kodikawa"))
    pool = opts.evaluate("() => [...document.querySelectorAll('.tp-row[data-topic=tech] input:checked')].map((b) => b.value)")
    check("options: one pool row per topic, tech defaults to Terminal and Kod",
          opts.locator(".tp-row").count() == 8 and sorted(pool) == ["kod", "terminal"], pool)
    raw = opts.evaluate(UNLOCALIZED_JS)
    check("options: topic section text comes from the catalog", not raw, raw)
    opts.screenshot(path=str(OUT / "options-topics.png"), full_page=True)
    opts.click(".tp-row[data-topic=tech] input[value=kod]")
    page.wait_for_timeout(1000)
    only = {k: styles_by_channel(page).get(k) for k in TECH_CHANNELS}
    check("options: editing a topic pool applies on YouTube", all(v == {"terminal"} for v in only.values()), only)
    opts.click(".tp-row[data-topic=tech] input[value=kod]")
    page.wait_for_timeout(500)

    # The channel theme takes the same series as the posters, topic included.
    opts.select_option("#theme", "channel")
    show(page, YT + "/watch?v=VID00000001", 1500)
    sheet = page.evaluate("() => ({ ...(document.getElementById('plakat-theme')?.dataset || {}) })")
    owner = overlays(page, "av", "#owner")
    check("feature on: the channel theme follows a tech channel's topic style",
          sheet.get("channel") == "@androiddevelopers" and owner and sheet.get("palette") == owner[0]["palette"]
          and styles_by_channel(page).get("@androiddevelopers", set()) <= TECH_STYLES, (sheet, owner and owner[0]["palette"]))
    opts.select_option("#theme", "off")

    # Sticky: the tech channel posts cooking videos; its topic and look stay.
    show(page, YT + "/results?search_query=kuchnia", 0)
    st = wait_stored(opts, lambda st: len(st["seen"].get("@kodikawa", {}).get("items", [])) >= 9)
    fresh = opts.evaluate("(e) => Plakat.detectTopic(e)", st["seen"].get("@kodikawa"))
    check("sticky: the new titles alone would make the channel a cooking one", fresh == "cooking", fresh)
    check("sticky: the channel keeps its tech topic", st["topics"].get("@kodikawa") == "tech", st["topics"].get("@kodikawa"))
    kod = styles_by_channel(page).get("@kodikawa")
    check("sticky: the channel keeps a tech style", bool(kod) and kod <= TECH_STYLES, kod)

    # Page metadata: channel page keywords, a watch page's tags and category.
    show(page, YT + "/@designtalks", 0)
    st = wait_stored(opts, lambda st: "@designtalks" in st["topics"])
    check("channel page: meta keywords settle the channel's topic",
          st["topics"].get("@designtalks") == "design" and "typografia" in st["seen"].get("@designtalks", {}).get("keywords", ""),
          (st["topics"].get("@designtalks"), st["seen"].get("@designtalks", {}).get("keywords")))
    show(page, YT + "/watch?v=GAME0001", 0)
    st = wait_stored(opts, lambda st: "@graniespokojnie" in st["topics"])
    entry = st["seen"].get("@graniespokojnie", {"items": []})
    item = next((i for i in entry["items"] if i["vid"] == "GAME0001"), {})
    check("watch page: the watched video is recorded with its tags and category",
          item.get("genre") == "Gaming" and "minecraft" in item.get("tags", "") and entry.get("name") == "Granie na Spokojnie", entry)
    titles_only = opts.evaluate("(e) => Plakat.detectTopic({ ...e, items: e.items.map(({ vid, title }) => ({ vid, title })) })", entry)
    check("watch page: tags and category settle the owner's topic where titles alone do not",
          st["topics"].get("@graniespokojnie") == "gaming" and titles_only is None, (st["topics"].get("@graniespokojnie"), titles_only))

    # Feature off again: back to the plain picks.
    opts.click("#byTopic")
    show(page, YT + "/results?search_query=programowanie")
    again = styles_by_channel(page)
    check("feature off again: every channel is back to its plain pick", all(again.get(k) == off[k] for k in off),
          {k: (off[k], again.get(k)) for k in off if again.get(k) != off[k]})


# The theme: YouTube's tokens on <html> and inside the player, contrast of every text
# pairing, the theme sheet's data-* and a few typography and corner probes.
THEME_JS = """() => {
  const NAMES = ['--yt-spec-base-background', '--yt-spec-raised-background', '--yt-spec-menu-background',
    '--yt-spec-inverted-background', '--yt-spec-text-primary', '--yt-spec-text-secondary', '--yt-spec-text-primary-inverse',
    '--yt-spec-call-to-action', '--yt-spec-brand-button-background', '--yt-spec-static-brand-white',
    '--yt-spec-static-brand-red', '--yt-spec-10-percent-layer', '--yt-spec-badge-chip-background'];
  const PAIRS = [['text-primary', 'base-background'], ['text-secondary', 'base-background'], ['call-to-action', 'base-background'],
    ['text-primary', 'raised-background'], ['text-secondary', 'raised-background'], ['text-secondary', 'menu-background'],
    ['text-primary-inverse', 'inverted-background'], ['text-primary-inverse', 'call-to-action'],
    ['static-brand-white', 'brand-button-background']];
  const ctx = document.createElement('canvas').getContext('2d');
  const rgb = (s) => {
    ctx.fillStyle = '#000';
    ctx.fillStyle = s;
    const v = ctx.fillStyle;
    return v.startsWith('#') ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) : v.match(/[\\d.]+/g).slice(0, 3).map(Number);
  };
  const lum = (c) => {
    const [r, g, b] = rgb(c).map((v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const tokens = (el) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(NAMES.map((n) => [n, cs.getPropertyValue(n).trim()]));
  };
  const root = tokens(document.documentElement);
  const sheet = document.getElementById('plakat-theme');
  const css = (sel, prop) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el)[prop] : null;
  };
  return {
    on: document.documentElement.classList.contains('plakat-theme'),
    sheet: sheet ? { ...sheet.dataset } : null,
    root,
    player: tokens(document.querySelector('#movie_player')),
    bgLum: lum(root['--yt-spec-base-background']),
    contrast: Object.fromEntries(PAIRS.map(([f, b]) => [`${f} on ${b}`, +ratio(root['--yt-spec-' + f], root['--yt-spec-' + b]).toFixed(2)])),
    titleFont: css('#video-title', 'fontFamily'),
    chipFont: css('yt-chip-cloud-chip-renderer', 'fontFamily'),
    thumbRadius: css('ytd-thumbnail img', 'borderRadius'),
    chipRadius: css('yt-chip-cloud-chip-renderer', 'borderRadius'),
    playerThumbRadius: css('#movie_player img', 'borderRadius'),
    playerTitleFont: css('#movie_player .ytp-title', 'fontFamily'),
  };
}"""


def theme(page):
    return page.evaluate(THEME_JS)


def set_dark(page, dark):
    page.evaluate(f"document.documentElement.{'setAttribute' if dark else 'removeAttribute'}('dark', '')")
    page.wait_for_timeout(300)


def theme_checks(context, page, ext_id):
    page.goto(YT + "/")
    page.wait_for_timeout(2500)
    off = theme(page)
    set_dark(page, False)
    off_light = theme(page)
    set_dark(page, True)
    check("theme: off by default (no sheet, YouTube's own tokens)",
          not off["on"] and off["sheet"] is None and off["root"]["--yt-spec-base-background"] == "#0f0f0f", off["sheet"])
    page.screenshot(path=str(OUT / "theme-off.png"))

    opts = context.new_page()
    opts.goto(f"chrome-extension://{ext_id}/options/options.html")
    opts.wait_for_selector("body[data-ready]")
    check("options: theme select defaults to off", opts.input_value("#theme") == "off", opts.input_value("#theme"))

    def contrast_ok(t, label):
        low = {k: v for k, v in t["contrast"].items() if v < 4.5}
        check(f"{label}: every text pairing has at least 4.5:1", not low, low)

    def player_untouched(t, before, label):
        changed = {k: (v, before["root"][k]) for k, v in t["player"].items() if v != before["root"][k]}
        check(f"{label}: player keeps YouTube's tokens", not changed, changed)

    # Paper and ink.
    opts.select_option("#theme", "paper")
    page.wait_for_timeout(800)
    paper = theme(page)
    overridden = [k for k, v in paper["root"].items() if v != off["root"][k] and k != "--yt-spec-static-brand-white"]
    check("paper: theme sheet on", paper["on"] and paper["sheet"] and paper["sheet"]["mode"] == "paper", paper["sheet"])
    check("paper: YouTube's tokens overridden", len(overridden) == len(paper["root"]) - 1, sorted(set(paper["root"]) - set(overridden)))
    check("paper (dark): dark background", paper["bgLum"] < 0.05, paper["root"]["--yt-spec-base-background"])
    contrast_ok(paper, "paper (dark)")
    player_untouched(paper, off, "paper (dark)")
    check("paper: titles in the theme typeface", "Plakat Inter Tight" in paper["titleFont"], paper["titleFont"])
    check("paper: chips in Oswald", "Plakat Oswald" in paper["chipFont"], paper["chipFont"])
    check("paper: square thumbnails and chips", paper["thumbRadius"] == "0px" and paper["chipRadius"] == "0px", (paper["thumbRadius"], paper["chipRadius"]))
    check("paper: avatars stay round", all(o["radius"] == "50%" for o in overlays(page, "av")))
    check("paper: player keeps its corners and type", paper["playerThumbRadius"] == off["playerThumbRadius"] == "12px"
          and paper["playerTitleFont"] == off["playerTitleFont"], (paper["playerThumbRadius"], paper["playerTitleFont"]))
    page.screenshot(path=str(OUT / "theme-paper-dark.png"))

    set_dark(page, False)
    light = theme(page)
    check("paper (light): light background", light["bgLum"] > 0.6, light["root"]["--yt-spec-base-background"])
    contrast_ok(light, "paper (light)")
    player_untouched(light, off_light, "paper (light)")
    page.screenshot(path=str(OUT / "theme-paper-light.png"))
    set_dark(page, True)

    # Channel palette: the feed stays on paper, watch and channel pages follow the channel.
    opts.select_option("#theme", "channel")
    page.wait_for_timeout(800)
    feed = theme(page)
    check("channel: the feed has no channel and falls back to paper",
          feed["sheet"] and feed["sheet"]["mode"] == "channel" and feed["sheet"]["channel"] == ""
          and feed["sheet"]["palette"] == paper["sheet"]["palette"], feed["sheet"])

    page.goto(YT + "/watch?v=VID00000001")
    page.wait_for_timeout(1500)
    watch = theme(page)
    owner = overlays(page, "av", "#owner")
    check("channel: watch page themed with the owner's series",
          watch["sheet"] and watch["sheet"]["channel"] == "@androiddevelopers" and owner and watch["sheet"]["palette"] == owner[0]["palette"],
          (watch["sheet"], owner and owner[0]["palette"]))
    contrast_ok(watch, "channel (watch, dark)")
    player_untouched(watch, off, "channel (watch, dark)")
    page.locator("ytd-watch-metadata").scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / "theme-channel-watch.png"))

    page.goto(YT + "/@designtalks")
    page.wait_for_timeout(1500)
    chan = theme(page)
    header = overlays(page, "av", "yt-page-header-view-model")
    thumbs = {o["palette"] for o in overlays(page, "thumb") if o["key"] == "@designtalks"}
    check("channel: channel page themed with the channel's series",
          chan["sheet"] and chan["sheet"]["channel"] == "@designtalks" and header
          and {chan["sheet"]["palette"]} == {header[0]["palette"]} == thumbs, (chan["sheet"], thumbs))
    check("channel: different channels, different themes", chan["root"] != watch["root"])
    contrast_ok(chan, "channel (channel page, dark)")
    page.screenshot(path=str(OUT / "theme-channel-page-dark.png"))
    set_dark(page, False)
    chan_light = theme(page)
    contrast_ok(chan_light, "channel (channel page, light)")
    page.screenshot(path=str(OUT / "theme-channel-page-light.png"))
    set_dark(page, True)

    opts.select_option("#theme", "off")
    page.wait_for_timeout(800)
    back = theme(page)
    check("theme off again: sheet removed, YouTube's tokens back", not back["on"] and back["sheet"] is None and back["root"] == off["root"], back["sheet"])
    opts.close()


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
        if ext_id:
            theme_checks(context, page, ext_id)
            topic_checks(context, page, ext_id)
        context.close()
    print(f"\n{'OK' if not failures else f'{len(failures)} FAILED'}  ·  screenshots: {OUT}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
