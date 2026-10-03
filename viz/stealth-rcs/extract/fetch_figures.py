#!/usr/bin/env python3
"""Crop the magnitude panels of figures 5.10, 5.11 and 5.12 from NASA-CR-191378-VOL-4.

This is the only extraction step that needs the source PDF and poppler's pdfimages; the
crops it writes to figures/ are committed, and digitize.py reads only them.

    python3 fetch_figures.py --pdf <path to 19930005618.pdf> [--retrieved-from <url>]   # use a local copy
    python3 fetch_figures.py                                   # download it first

The PDF must have the SHA-256 below. ntrs.nasa.gov refused automated requests from the
extraction machine on 2026-10-03 (HTTP 403), so the download falls back to the Internet
Archive capture, whose recorded digest matches the NTRS copy's earlier captures. Each page
of figures is one 300 dpi, 1-bit CCITT scan; pdfimages copies it out without resampling.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from geometry import find_frame
from pngio import read_pbm, write_bilevel_png

HERE = Path(__file__).resolve().parent
PDF_URLS = [
    "https://ntrs.nasa.gov/api/citations/19930005618/downloads/19930005618.pdf",
    "https://web.archive.org/web/20260510194933id_/https://ntrs.nasa.gov/api/citations/19930005618/downloads/19930005618.pdf",
]
PDF_SHA256 = "ba90dc215c62d56a248207a0bd92e9529f76f3924d15442776292801a268332c"
PDF_BYTES = 3677750
# Margins around the magnitude frame, in scan pixels: room for the tick labels on the left and below.
MARGIN = {"left": 230, "right": 60, "top": 60, "bottom": 120}
FIGURES = [
    {"id": "fig-5-10", "figure": "5.10", "pdf_page": 97, "printed_page": "87", "frequency_ghz": 4,
     "caption": "Figure 5.10: Comparison between the reconstructed (solid line) and original (dotted line) azimuth response at 4 GHz for the F-117 model, obtained by gating."},
    {"id": "fig-5-11", "figure": "5.11", "pdf_page": 98, "printed_page": "88", "frequency_ghz": 10,
     "caption": "Figure 5.11: Comparison between the reconstructed (solid line) and original (dotted line) azimuth response at 10 GHz for the F-117 model, obtained by gating."},
    {"id": "fig-5-12", "figure": "5.12", "pdf_page": 99, "printed_page": "89", "frequency_ghz": 17,
     "caption": "Figure 5.12: Comparison between the reconstructed (solid line) and original (dotted line) azimuth response at 17 GHz for the F-117 model, obtained by gating."},
]


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def fetch_pdf(target):
    for url in PDF_URLS:
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "visuals-stealth-rcs/1 (figure extraction)"})
            with urllib.request.urlopen(request, timeout=300) as response, open(target, "wb") as out:
                shutil.copyfileobj(response, out)
            if sha256(target) == PDF_SHA256:
                return url
            print(f"fetch_figures.py: {url} returned a file with another digest", file=sys.stderr)
        except OSError as error:
            print(f"fetch_figures.py: {url}: {error}", file=sys.stderr)
    sys.exit("fetch_figures.py: no source returned the expected PDF")


def tool_version(name):
    result = subprocess.run([name, "-v"], capture_output=True, text=True)
    return (result.stdout + result.stderr).strip().splitlines()[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pdf", help="a local copy of 19930005618.pdf")
    parser.add_argument("--retrieved-from", default="local copy", help="where the local copy came from, for the manifest")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        pdf = Path(args.pdf) if args.pdf else Path(tmp) / "19930005618.pdf"
        source = args.retrieved_from if args.pdf else fetch_pdf(pdf)
        if sha256(pdf) != PDF_SHA256:
            sys.exit(f"fetch_figures.py: {pdf} does not have SHA-256 {PDF_SHA256}")
        records = []
        for fig in FIGURES:
            stem = Path(tmp) / fig["id"]
            subprocess.run(["pdfimages", "-f", str(fig["pdf_page"]), "-l", str(fig["pdf_page"]), str(pdf), str(stem)], check=True)
            scans = sorted(Path(tmp).glob(f"{fig['id']}-*.pbm"))
            if len(scans) != 1:
                sys.exit(f"fetch_figures.py: page {fig['pdf_page']} should hold one bilevel scan, found {len(scans)}")
            width, height, rows = read_pbm(scans[0])
            corners = find_frame(rows)
            xs, ys = [c[0] for c in corners], [c[1] for c in corners]
            box = [max(0, int(min(xs)) - MARGIN["left"]), max(0, int(min(ys)) - MARGIN["top"]),
                   min(width, int(max(xs)) + MARGIN["right"]), min(height, int(max(ys)) + MARGIN["bottom"])]
            crop = [row[box[0]:box[2]] for row in rows[box[1]:box[3]]]
            out = HERE / "figures" / f"{fig['id']}-magnitude.png"
            write_bilevel_png(out, crop)
            records.append({
                **fig,
                "page_scan": {"width": width, "height": height, "dpi": 300, "bits": 1, "encoding": "CCITT"},
                "crop_box_in_scan": box,
                "crop_file": out.name,
                "crop_sha256": sha256(out),
            })
            print(f"wrote {out.relative_to(HERE)} ({box[2] - box[0]} x {box[3] - box[1]})")
    manifest = {
        "source": {"report": "NASA-CR-191378-VOL-4", "pdf_url": PDF_URLS[0], "pdf_sha256": PDF_SHA256, "pdf_bytes": PDF_BYTES,
                   "retrieved_from": source},
        "tool": {"crop": "fetch_figures.py", "pdfimages": tool_version("pdfimages")},
        "figures": records,
    }
    (HERE / "figures" / "figures.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote figures/figures.json")


if __name__ == "__main__":
    main()
