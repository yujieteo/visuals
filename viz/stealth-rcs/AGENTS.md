# Stealth aircraft: public RCS evidence

`build.py` reads `data/evidence.json`, `extract/figures/figures.json` and `extract/traces.json`, writes `raw.json` and rewrites the `dataset`, `beamdswitch` and `report` script blocks and the static record of `index.html`; edit the rest of the page directly, then run `python3 build.py`. `report.js` writes the beamdswitch deck and the Markdown record; `beamdswitch.js` is the site's template, unchanged.

The curves come from `extract/`: `fetch_figures.py` crops the NASA figure scans (it needs the PDF and poppler's `pdfimages`, and is the only code that touches the network), `digitize.py` extracts the traces and the review overlays, and `review.py` is the independent second check. Rerun `python3 extract/digitize.py` after a change to the crops or the extraction, then `python3 build.py`.

Keep every rule of the evidence: no aircraft ranking, no RCS value for a service aircraft, dB with the reference not stated, no conversion to dBsm or m², unknown values null with a reason, and no curve from a source whose rights are not cleared (ETRI and IEEE stay records with links). Write reader text in ASD-STE100.

Its tests are in `tests/`; `python3 ../../scripts/check.py stealth-rcs` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
