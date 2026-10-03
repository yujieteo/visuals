# Subsidy Atlas

A self-contained consumer guide with 15 sourced records, a depth × lifecycle
count matrix, four filters, search, and three separately flagged speculative
watchlist picks, published at `/visuals/subsidy-atlas/`.

## Update the evidence

Edit `author.py`, the curated data source. Each factual claim block carries
source IDs; the source registry contains URLs, publication dates where known,
and access dates. Historical evidence stays explicitly historical, even when
the product still exists. Check live eligibility before marking a programme
current. Do not infer a per-token subsidy from company losses.

```sh
python3 author.py
python3 build.py
python3 build.py --verify
```

`build.py` inlines the design tokens from `site-tokens.css`, the head of
yujieteo/site's `static/css/style.css` up to its first `* {` rule; refresh it
when the site's tokens change. The site publishes the generated HTML and
`raw.json` as `data.json`. The HTML embeds all styles, JavaScript and data;
external URLs are citations, not assets.

## Evidence boundaries

- Free charges, capped rebates, at-cost hardware and reported losses are
  different measurements. The matrix counts records in descriptive bands;
  it does not rank incomparable economic subsidy percentages.
- Investor/provider classifications describe financing mechanisms, not a
  traced payment per user. Explicit promotional credits and policy support do
  not require a claim of negative unit margins.
- Grab's rides and delivery share one record and one aggregate incentives
  figure, avoiding double-counting. The filing is FY2025 evidence, not a live
  coupon or a personal discount rate.
- Pro losses, Xbox testimony, Kindle margins and Disney's investment phase
  have dated historical labels. Paid LLM APIs and smart speakers are omitted
  where defensible current product-level subsidy evidence was unavailable.
- Forecasts carry `speculative: true`, observed signals with sources, reasoning
  and reversal conditions. They are not announced promotions or purchase-date
  recommendations.

## beamdswitch deck

The beamdswitch button saves the records shown, with the current filters, as
a narrated Markdown deck for [beamdswitch](https://teoyujie.org/visuals/beamdswitch/);
Copy deck puts it on the clipboard. `SubsidyAtlas.report` in `engine.js` builds
the report from the dataset's own claims and citations, and `beamdswitch.js`
is the site's standard template (`templates/beamdswitch.js`, unchanged), which
`build.py` inlines.

## Verify

`python3 ../../scripts/check.py subsidy-atlas` runs `build.py --verify`, the
Node tests and the Python tests; CI runs them on every change to this folder.

Python tests validate the serialized dataset, source references, fixed
vocabularies, speculation boundaries, reproducibility and generated HTML.
Node tests execute filtering, matrix drilldown, detail retrieval and the
site-theme script that applies the reader's Light or Dark choice. Invalid
claim references or unflagged forecasts also prevent the visualization builder
from rendering.

Real-browser evidence and screenshots: [verification](https://github.com/yujieteo/site/blob/main/docs/subsidy-atlas/verification.md) in yujieteo/site.
