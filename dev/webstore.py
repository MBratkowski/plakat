#!/usr/bin/env python3
"""Renders the Chrome Web Store graphics into webstore/.

Usage: python3 dev/webstore.py

1. Loads the extension in Chromium against dev/mock-youtube.html (as dev/e2e.py does)
   and captures the feed with Plakat on and off, the settings page and the style editor
   into webstore/.captures/ (not committed).
2. Renders dev/webstore.html into webstore/screenshots/<lang>/0N-<name>.png (1280×800,
   Polish and English captions), webstore/promo-tile-440x280.png and
   webstore/marquee-1400x560.png.

Requires: pip install playwright && playwright install chromium
"""
import hashlib
import pathlib
import re
import sys
import tempfile

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import e2e  # noqa: E402  (shares the mock server and extension helpers)

ROOT = e2e.ROOT
OUT = ROOT / "webstore"
CAPTURES = OUT / ".captures"
SLIDES = {1: "feed", 2: "off-on", 3: "styles", 4: "avatars", 5: "settings"}
LANGS = ["pl", "en"]

# Bounding box of some elements, padded, in page coordinates.
BOX_JS = """([sel, n, pad]) => {
  const r = [...document.querySelectorAll(sel)].slice(0, n).map((e) => e.getBoundingClientRect());
  const x = Math.min(...r.map((b) => b.left)) - pad, y = Math.min(...r.map((b) => b.top)) - pad;
  return { x: Math.max(0, x), y: Math.max(0, y), width: Math.max(...r.map((b) => b.right)) + pad - x, height: Math.max(...r.map((b) => b.bottom)) + pad - y };
}"""


def distinct_images(context):
    """One placeholder per video and channel, so neighbouring cards differ."""
    images = sorted((ROOT / "dev" / "thumbs").glob("*.jpg"))

    def image(route):
        m = re.search(r"VID0*(\d+)", route.request.url)
        i = int(m.group(1)) + 1 if m else int(hashlib.md5(route.request.url.encode()).hexdigest(), 16)
        route.fulfill(status=200, body=images[i % len(images)].read_bytes(), headers={"content-type": "image/jpeg"})

    context.route(re.compile(r"https://(i\d?\.ytimg\.com|yt\d?\.ggpht\.com)/.*"), image)


def capture(p):
    CAPTURES.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="plakat-profile-") as profile:
        context = p.chromium.launch_persistent_context(
            profile, channel="chromium", headless=True, viewport={"width": 1280, "height": 2000}, device_scale_factor=2,
            args=[f"--disable-extensions-except={ROOT}", f"--load-extension={ROOT}"],
        )
        e2e.serve(context)
        distinct_images(context)
        ext = e2e.extension_id(context)
        page = context.new_page()
        page.goto(e2e.YT + "/?static=1")
        page.wait_for_timeout(2500)
        page.screenshot(path=str(CAPTURES / "feed-on.png"), clip=page.evaluate(BOX_JS, ["#old ytd-rich-item-renderer, #new yt-lockup-view-model", 8, 12]))
        row = page.evaluate(BOX_JS, ["#new yt-lockup-view-model", 4, 12])
        page.screenshot(path=str(CAPTURES / "row-on.png"), clip=row)
        page.keyboard.press("Alt+Shift+KeyP")
        page.wait_for_timeout(1800)
        page.screenshot(path=str(CAPTURES / "row-off.png"), clip=row)
        page.keyboard.press("Alt+Shift+KeyP")
        page.wait_for_timeout(4500)  # back on, and the seen buffer flushes for the settings page

        opts = context.new_page()
        opts.set_viewport_size({"width": 1240, "height": 1800})
        opts.goto(f"chrome-extension://{ext}/options/options.html")
        opts.wait_for_selector("body[data-ready]")
        opts.wait_for_timeout(400)
        opts.screenshot(path=str(CAPTURES / "options.png"), clip=opts.evaluate(BOX_JS, [".ch-row", 3, 20]))
        opts.click("[data-act=dup]")
        opts.wait_for_selector("#edPreview .thumb")
        opts.wait_for_timeout(400)
        opts.screenshot(path=str(CAPTURES / "editor.png"), clip=opts.evaluate(BOX_JS, ["#editor", 1, 0]))
        context.close()


def render(p):
    browser = p.chromium.launch(channel="chromium")
    page_url = (ROOT / "dev" / "webstore.html").as_uri()
    jobs = [(f"?slide={n}&lang={lang}", OUT / "screenshots" / lang / f"0{n}-{name}.png") for lang in LANGS for n, name in SLIDES.items()]
    jobs += [("?slide=tile", OUT / "promo-tile-440x280.png"), ("?slide=marquee", OUT / "marquee-1400x560.png")]
    for query, out in jobs:
        out.parent.mkdir(parents=True, exist_ok=True)
        page = browser.new_page(viewport={"width": 1500, "height": 900}, device_scale_factor=1)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(page_url + query)
        page.wait_for_selector("body[data-ready]")
        page.locator("#frame").screenshot(path=str(out))
        print(f"{out.relative_to(ROOT)}{'  errors: ' + '; '.join(errors) if errors else ''}")
        page.close()
    browser.close()


def main():
    with sync_playwright() as p:
        capture(p)
        render(p)


if __name__ == "__main__":
    main()
