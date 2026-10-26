"""Turn the single-file build (dist-artifact/index.html) into an Artifact page fragment.

The Artifact host supplies the <!doctype>/<head>/<body> skeleton, so the page is:
title first (scanned in the first 8 KB), then the inlined CSS, the root element, and the inlined app script.
Usage: python3 scripts/make-artifact.py <output.html>
"""
import re, sys
from pathlib import Path

src = Path(__file__).resolve().parent.parent / "dist-artifact" / "index.html"
html = src.read_text()
style = re.search(r"<style[^>]*>([\s\S]*?)</style>", html).group(1)
script = re.search(r'<script type="module"[^>]*>([\s\S]*?)</script>', html).group(1)
page = (
    "<title>Wayline</title>\n"
    '<meta name="description" content="A free path from your first English word to confident, independent English.">\n'
    f"<style>{style}</style>\n"
    '<div id="root"></div>\n'
    "<noscript>Wayline needs JavaScript to run.</noscript>\n"
    f'<script type="module">{script}</script>\n'
)
Path(sys.argv[1]).write_text(page)
print(f"wrote {sys.argv[1]} ({len(page) / 1e6:.2f} MB)")
