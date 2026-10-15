#!/usr/bin/env python3
"""Builds the Chrome Web Store upload: dist/plakat-<version>.zip.

Usage: python3 dev/package.py

Packs only what the extension loads (manifest, _locales, src, options, popup, icons,
fonts) and refuses to build when the store would reject the upload or the extension
would break: a file the manifest or an extension page references is missing, a
__MSG_key__ has no message, or the name or description is over the store's limits.
The archive is reproducible: fixed timestamps, sorted entries.
"""
import json
import pathlib
import re
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
INCLUDE = ["manifest.json", "_locales", "src", "options", "popup", "icons", "fonts"]
SKIP_NAMES = {".DS_Store", "Thumbs.db"}
LIMITS = {"name": 75, "short_name": 12, "description": 132}  # Chrome Web Store limits, in characters
FIXED_TIME = (2026, 1, 1, 0, 0, 0)

problems = []


def packed_files():
    out = []
    for entry in INCLUDE:
        path = ROOT / entry
        if path.is_file():
            out.append(path)
        elif path.is_dir():
            out += [p for p in path.rglob("*") if p.is_file() and p.name not in SKIP_NAMES]
        else:
            problems.append(f"missing {entry}")
    return sorted(out)


def rel(path):
    return path.relative_to(ROOT).as_posix()


def referenced(manifest):
    """Every file the manifest and the extension's own pages point at."""
    refs = set()
    for cs in manifest.get("content_scripts", []):
        refs.update(cs.get("js", []) + cs.get("css", []))
    refs.update(manifest.get("icons", {}).values())
    action = manifest.get("action", {})
    refs.update(action.get("default_icon", {}).values())
    pages = [p for p in (action.get("default_popup"), manifest.get("options_ui", {}).get("page")) if p]
    refs.update(pages)
    for page in pages:
        base = (ROOT / page).parent
        html = (ROOT / page).read_text() if (ROOT / page).exists() else ""
        for src in re.findall(r'<(?:script|link|img)[^>]+(?:src|href)="([^"#:]+)"', html):
            refs.add(rel((base / src).resolve()))
    refs.add(f"_locales/{manifest['default_locale']}/messages.json")
    return refs


def message(locale, key):
    path = ROOT / "_locales" / locale / "messages.json"
    return json.loads(path.read_text()).get(key, {}).get("message") if path.exists() else None


def check_text_fields(manifest):
    locales = sorted(p.name for p in (ROOT / "_locales").iterdir() if (p / "messages.json").exists())
    for field, limit in LIMITS.items():
        raw = manifest.get(field, "")
        keys = re.findall(r"__MSG_(\w+)__", raw)
        if not keys:
            if len(raw) > limit:
                problems.append(f"{field} is {len(raw)} characters, the limit is {limit}")
            continue
        for locale in locales:
            text = message(locale, keys[0]) or message(manifest["default_locale"], keys[0])
            if text is None:
                problems.append(f"{field}: no message {keys[0]} in _locales/{locale} or the default locale")
            elif len(text) > limit:
                problems.append(f"{field} ({locale}) is {len(text)} characters, the limit is {limit}")


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    version = manifest["version"]
    if not re.fullmatch(r"\d+(\.\d+){0,3}", version):
        problems.append(f"version {version!r} is not 1 to 4 dot-separated integers")
    files = packed_files()
    names = {rel(p) for p in files}
    for ref in sorted(referenced(manifest)):
        if ref not in names:
            problems.append(f"referenced but not packed: {ref}")
    for war in manifest.get("web_accessible_resources", []):
        for pattern in war.get("resources", []):
            if not any(pathlib.PurePosixPath(n).match(pattern) for n in names):
                problems.append(f"web_accessible_resources {pattern} matches nothing")
    check_text_fields(manifest)
    if problems:
        print("Not built:\n  " + "\n  ".join(problems))
        sys.exit(1)

    out = ROOT / "dist" / f"plakat-{version}.zip"
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in files:
            info = zipfile.ZipInfo(rel(path), FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, path.read_bytes())
    size = out.stat().st_size
    print(f"Built {rel(out)}: {len(files)} files, {size / 1024:.0f} KB (version {version})")


if __name__ == "__main__":
    main()
