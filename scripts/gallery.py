"""Shared root-gallery rule for every scripts/build*.py builder.

The root index.html is rebuilt from every viz/*/index.html page: one card per
page, using its <title>, <meta name="description"> and data/<slug>/meta.json
"fetched" date.
"""
import json
import re
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PAGE = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">'
    "<title>Visuals</title><style>body{max-width:45rem;margin:3rem auto;padding:0 1rem;"
    "font:16px/1.6 system-ui;color:#1d1d1f}a{color:inherit;text-underline-offset:.18em}"
    "article{padding:1.5rem 0;border-top:1px solid #d2d2d7}h1,h2{line-height:1.2}"
    "small{font-size:.875rem}h2 a{display:inline-block;padding:.5rem 0}</style></head><body>"
    "<main><h1>Visuals</h1><p>Standalone, source-backed data visualizations.</p>"
    "%s</main></body></html>\n"
)


def render_gallery(root=ROOT):
    cards = []
    for page in sorted((root / "viz").glob("*/index.html")):
        html = page.read_text(encoding="utf-8")
        title = re.search(r"<title>(.*?)</title>", html, re.S)
        summary = re.search(r'<meta name="description" content="(.*?)">', html, re.S)
        if not title or not summary:
            continue
        slug = page.parent.name
        meta = json.loads((root / "data" / slug / "meta.json").read_text(encoding="utf-8"))
        cards.append(
            f'<article><h2><a href="viz/{slug}/index.html">{escape(title.group(1))}</a></h2>'
            f"<p>{escape(summary.group(1))}</p><small>Source date: {escape(meta['fetched'])}</small></article>"
        )
    return PAGE % "".join(cards)


def write_gallery(root=ROOT):
    (root / "index.html").write_text(render_gallery(root), encoding="utf-8")
