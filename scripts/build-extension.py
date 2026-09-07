#!/usr/bin/env python3
"""Package the extension/ folder into a .xpi zip ready for Firefox/AMO.

Usage: python3 scripts/build-extension.mjs is wrong — run this directly:
       python3 scripts/build-extension.py          (or via npm: build:extension)
"""

import os
import sys
import zipfile

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTENSION_DIR = os.path.join(REPO_ROOT, "extension")
DIST_DIR = os.path.join(REPO_ROOT, "dist")
OUT_FILE = os.path.join(DIST_DIR, "now-playing-0.1.0.xpi")


def main():
    if not os.path.isdir(EXTENSION_DIR):
        print(f"Extension folder not found: {EXTENSION_DIR}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(DIST_DIR, exist_ok=True)

    with zipfile.ZipFile(OUT_FILE, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(EXTENSION_DIR):
            for name in files:
                full = os.path.join(root, name)
                rel = os.path.relpath(full, EXTENSION_DIR)
                zf.write(full, rel)

    size = os.path.getsize(OUT_FILE)
    print(f"Wrote {OUT_FILE} ({size} bytes)")


if __name__ == "__main__":
    main()
