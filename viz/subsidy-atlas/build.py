"""Build a self-contained, offline-friendly Subsidy Atlas from curated data."""
import argparse
import json
from datetime import date
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
FILTERS = [('category', 'Categories'), ('subsidiser', 'Subsidisers'), ('depth', 'Depths'), ('stage', 'Stages')]
# Short matrix column heads; the full depth label is the tooltip.
SHORT_DEPTH = {'free': 'Free', 'partial': 'Capped', 'near-cost': 'At cost', 'unknown': 'Unknown'}


def cite(source):
    date_label = source['published'] or 'undated; accessed ' + source['accessed']
    return (f'<a class="cite" href="{escape(source["url"], quote=True)}">'
            f'{escape(source["title"])} ({escape(date_label)})</a>')


def citations(data, ids):
    return ' '.join(cite(data['sources'][id]) for id in ids)


def claim(data, label, block):
    return f'<div class="claim"><h3>{escape(label)}</h3><p>{escape(block["text"])}</p><p class="citations">{citations(data, block["sources"])}</p></div>'


def validate(data):
    """Refuse to render unsourced claims, unknown vocabulary, future-dated sources or unflagged forecasts."""
    as_of = date.fromisoformat(data['as_of'])
    vocab = data['vocabulary']
    ids = [entry['id'] for entry in data['entries']] + [pick['id'] for pick in data['forecasts']]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate record IDs')
    for source in data['sources'].values():
        if not source['url'].startswith('https://') or not source['title']:
            raise ValueError('Sources require a title and HTTPS URL')
        if date.fromisoformat(source['accessed']) > as_of:
            raise ValueError('Source accessed after the review date')
        if source['published'] and date.fromisoformat(source['published']) > as_of:
            raise ValueError('Source published after the review date')

    def sourced(block):
        if not block['text'] or not block['sources'] or any(id not in data['sources'] for id in block['sources']):
            raise ValueError('Claim missing source')
    for entry in data['entries']:
        if entry['speculative'] is not False:
            raise ValueError('Catalogue entries must be evidenced, not speculative')
        if not entry['categories'] or any(cat not in vocab['category'] for cat in entry['categories']):
            raise ValueError('Unknown category')
        for key in ('subsidiser', 'depth', 'stage'):
            if entry[key] not in vocab[key]:
                raise ValueError('Unknown ' + key)
        for key in ('evidence', 'depth_note', 'duration', 'caution'):
            sourced(entry[key])
    for pick in data['forecasts']:
        if pick['speculative'] is not True or not pick['reasoning'] or not pick['changes'] or not pick['signals']:
            raise ValueError('Forecast must be flagged speculative with reasoning, signals and reversal conditions')
        for signal in pick['signals']:
            sourced(signal)


def read_scripts():
    """The inlined scripts; a literal </script would end the inline script early."""
    scripts = {name: (HERE / name).read_text() for name in ('engine.js', 'beamdswitch.js')}
    for name, script in scripts.items():
        if '</script' in script:
            raise ValueError(f'{name} must not contain </script')
    return scripts


def filter_controls(vocab):
    return ''.join(f'<label>{escape(label)}<select name="{key}"><option value="">All {escape(label.lower())}</option>'
                   + ''.join(f'<option value="{id}">{escape(text)}</option>' for id, text in vocab[key].items())
                   + '</select></label>' for key, label in FILTERS)


def product_card(data, entry):
    vocab = data['vocabulary']
    stage = vocab['stage'][entry['stage']]
    cats = ' / '.join(vocab['category'][cat] for cat in entry['categories'])
    return f'''<details id="{entry['id']}" data-product="{entry['id']}" class="product">
<summary><span class="eyebrow">{escape(cats)} · {escape(stage)}</span><span class="name">{escape(entry['name'])}</span><span class="metric">{escape(entry['metric'])}</span><span class="tags">{escape(vocab['subsidiser'][entry['subsidiser']])} · {escape(vocab['depth'][entry['depth']])}</span><span class="more">Evidence & catches <span aria-hidden="true">↗</span></span></summary>
<div class="detail">{claim(data, 'What the evidence establishes', entry['evidence'])}{claim(data, 'Subsidy depth — denominator matters', entry['depth_note'])}{claim(data, 'Window / lifecycle', entry['duration'])}{claim(data, 'The catch', entry['caution'])}
</div></details>'''


def matrix_grid(vocab):
    """The depth × lifecycle buttons; engine.js fills in the counts."""
    grid = '<div class="matrix-head"><span>Lifecycle ↓<br>Depth →</span>' + ''.join(f'<span title="{escape(vocab["depth"][id])}">{SHORT_DEPTH[id]}</span>' for id in vocab['depth']) + '</div>'
    for stage, label in vocab['stage'].items():
        grid += f'<div class="matrix-row" {"data-history-row" if stage == "historical" else ""}><span>{escape(label)}</span>'
        grid += ''.join(f'<button type="button" data-depth="{depth}" data-stage="{stage}">—</button>' for depth in vocab['depth']) + '</div>'
    return grid


def forecast_article(data, pick):
    return f'''<article class="forecast"><p class="eyebrow">Speculative · not an announced future deal</p><h3>{escape(pick['name'])}</h3><p>{escape(pick['reasoning'])}</p>
{''.join(claim(data, 'Observed signals', signal) for signal in pick['signals'])}<h4>What would change the call</h4><p>{escape(pick['changes'])}</p></article>'''


def render(data):
    validate(data)
    vocab = data['vocabulary']
    tokens = (HERE / 'site-tokens.css').read_text().split('\n* {', 1)[0]
    css = (HERE / 'style.css').read_text()
    scripts = read_scripts()
    engine, beamdswitch = scripts['engine.js'], scripts['beamdswitch.js']
    options = filter_controls(vocab)
    cards = [product_card(data, entry) for entry in data['entries']]
    chart = matrix_grid(vocab)
    forecasts = ''.join(forecast_article(data, pick) for pick in data['forecasts'])
    encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Find provider-funded trials, policy rebates and loss-leader products. Sourced evidence, historical lessons and separately labelled speculative picks."><link rel="icon" href="data:,"><title>Subsidy Atlas · Who pays for cheap?</title><script id="site-theme">try {{ var t = localStorage.getItem("theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; }} catch (e) {{}}</script><style>{tokens}\n{css}</style></head><body>
<a class="skip" href="#catalogue">Skip to catalogue</a>
<header><a href="../../visuals.html">← All visuals</a><span>SUBSIDY ATLAS</span><a href="#forecast">Future watchlist ↓</a></header>
<main><section class="hero"><p class="eyebrow">Consumer field guide · As of {data['as_of']}</p><h1>Find the subsidy.<br><span>Know the catch.</span></h1><p class="lede">Free tokens, introductory credits, policy rebates: find where someone else covers part of the bill, and where the cheap phase has already ended.</p>
<div class="hero-note"><strong>Cheap is not the same as below cost.</strong> A loss-making company can sell profitable tokens. Here, free allowances and discounts are distinguished from reported losses and at-cost hardware. No invented subsidy percentages or expiry forecasts.</div>
<nav class="presets" aria-label="Quick catalogue filters"><button data-preset="llm" type="button">LLM tokens</button><button data-preset="free" type="button">Free trials</button><button data-preset="policy" type="button">Policy deadlines</button><button data-preset="history" type="button">Historical lessons</button></nav></section>
<section aria-label="Search and filter"><form id="filters"><label class="search">Find a product<input type="search" name="q" placeholder="Try Gemini, delivery, solar…" autocomplete="off"></label><div class="filter-grid">{options}</div><div class="filter-foot"><label class="check"><input type="checkbox" name="includeHistorical">Include historical evidence (not current deals)</label><button type="reset">Reset filters</button></div></form></section>
<section class="overview" aria-labelledby="overview-title"><div><p class="eyebrow">The overview</p><h2 id="overview-title">What kind of cheap?</h2><p>Each cell counts matching records. Select a cell to narrow the catalogue.</p><p class="note">Depth bands describe the offer, <strong>not comparable cost percentages</strong>. “Unknown” means loss evidence without a unit-cost denominator. Lifecycle is evidenced stage, not predicted remaining runway.</p></div><div id="matrix" class="matrix" hidden aria-label="Catalogue counts by lifecycle stage and offer depth">{chart}</div></section>
<section aria-labelledby="catalogue"><div class="section-head"><h2 id="catalogue" tabindex="-1">The evidenced catalogue</h2><p id="count" role="status" aria-live="polite">{len(data['entries'])} sourced records</p></div><p class="note">“Current” means a published programme or latest reported incentives, not guaranteed availability to you. Open any card for dates, denominators, conditions and sources.</p><div class="deck-row"><button type="button" id="save-beamdswitch" title="Save a narrated Markdown talk about the records shown, to open in beamdswitch">beamdswitch</button><button type="button" id="copy-beamdswitch" title="Copy the narrated Markdown talk, to paste into beamdswitch">Copy deck</button><span id="deck-status" role="status"></span></div><p class="note">The beamdswitch button saves the records shown, with the filters above, as a narrated talk: a Markdown deck with the set-up, method, each record's evidence and catch, and the source checks, every claim as cited here, and a spoken narration on every slide. Open it in <a href="https://teoyujie.org/visuals/beamdswitch/">beamdswitch</a> to get slides, a handout, narration and a video. Copy deck puts the same deck on the clipboard, to paste into beamdswitch if the download does not arrive.</p><p id="empty" hidden>No matches. Reset the filters, or include historical evidence for older loss reports.</p><noscript><p>JavaScript is off: all records, including historical evidence, are shown below. Search and the overview need JavaScript.</p></noscript><div class="catalogue">{''.join(cards)}</div></section>
<section id="forecast" aria-labelledby="forecast-title"><p class="eyebrow">Separate from the evidence · Speculation</p><h2 id="forecast-title">What might be worth trying early?</h2><p class="lede small">A watchlist, not a promise. Use cheap access when it serves an existing need; do not prepay, borrow or buy something merely because it is subsidised.</p><div class="forecasts">{forecasts}</div></section>
<details class="method"><summary>Method, limits & data</summary><p>This is a curated catalogue, not a ranking of economic subsidy rates. Sources report different denominators: waived token charges, billing credits, tax rebates, incentive spending, hardware margins and segment losses. They cannot be plotted as one numerical “percent below cost”.</p><p>Subsidiser and stage labels are editorial classifications of the cited mechanism. “Investor-funded” describes financing context, not traced per-user funding. “Provider / cross-subsidy” includes the provider absorbing promotional charges; it does not assert a particular profitable division pays them.</p><p>Historical records are hidden by default. In particular, January 2025 Pro losses and 2021 Xbox testimony do not prove current losses. Streaming segment losses and fintech interest-free offers likewise do not establish negative marginal unit economics. Smart speakers and individual paid LLM APIs are omitted where a defensible current product-level subsidy could not be established.</p><p>Each claim block links its supporting sources. Publication dates are shown when known; live terms without a publication date show an access date. Forecast reasoning and consumer cautions are judgement, with observed signals cited separately. No estimated end date is supplied when a provider does not state one.</p><p>Global examples have different geographic and customer eligibility. Verify live terms before acting. This is consumer research, not personalised financial advice.</p><p><a href="data.json">Download the sourced JSON dataset</a> · <a href="https://github.com/yujieteo/site/tree/main/visuals/subsidy-atlas">Source & reproducible builder</a></p></details>
</main><footer>Evidence reviewed {data['as_of']}. Historical periods remain labelled. No trackers, external scripts or live price feeds.</footer>
<script type="application/json" id="atlas-data">{encoded}</script><script id="beamdswitch">\n{beamdswitch}</script><script>{engine}</script></body></html>'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    data = json.loads((HERE / 'raw.json').read_text())
    expected = render(data)
    target = HERE / 'index.html'
    if args.verify:
        if target.read_text() != expected:
            raise SystemExit('Stale Subsidy Atlas: run python3 build.py')
    else:
        target.write_text(expected)


if __name__ == '__main__':
    main()
