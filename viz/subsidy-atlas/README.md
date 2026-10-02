# Subsidy Atlas

A self-contained consumer guide with 15 sourced records, a depth × lifecycle
count matrix, four filters, search, and three separately flagged speculative
watchlist picks. Published at `/visuals/subsidy-atlas/index.html` by the normal
site build.

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

`build.py` reads the design tokens from yujieteo/site's `static/css/style.css`,
two directories up, so run it inside `visuals/subsidy-atlas/` of a site checkout
(the tests lay out a copy beside `tests/fixtures/static/css/style.css`). The
site's build copies the generated source HTML and publishes `raw.json` as
`data.json`. The HTML embeds all styles, JavaScript and data; external URLs are
citations, not assets. Design tokens come from `static/css/style.css`.

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

From the root of a yujieteo/subsidy-atlas checkout, as CI does:

```sh
node --test 'tests/*.test.{mjs,cjs}'
python3 -m unittest discover -s tests -p 'test_*.py'
```

Python tests validate the serialized dataset, source references, fixed
vocabularies, speculation boundaries, reproducibility and generated HTML.
Node tests execute filtering, matrix drilldown, detail retrieval and the
site-theme script that applies the reader's Light or Dark choice. All are
included in normal CI. Invalid claim references or unflagged forecasts also
prevent the visualization builder from rendering.

Real-browser evidence and screenshots: [verification](https://github.com/yujieteo/site/blob/main/docs/subsidy-atlas/verification.md) in yujieteo/site.
