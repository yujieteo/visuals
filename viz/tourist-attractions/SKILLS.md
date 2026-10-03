---
name: tourist-attractions
description: Use the How Singapore attractions are marketed visualisation and its read-only WebMCP tools to answer questions from its embedded data or export a narrated beamdswitch deck.
---

# How Singapore attractions are marketed

Which words recur in 106 descriptions of Singapore tourist attractions, and where the described places are, as a word cloud beside a map.

Open `index.html` in a browser, or https://teoyujie.org/visuals/tourist-attractions/. d3 is inlined, so it works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Find attractions by text, area, opening hours or marketing word | `query` with `filter`, or the word cloud and map |
| Rank the marketing words and see where they occur | `get_marketing_terms` |
| Present the words and places as a narrated talk | beamdswitch or Copy deck |

## Inputs

- Embedded data: 109 attraction points (106 with descriptions) and 40 ranked marketing terms with regional counts, as compact CSV.
- Controls: the word cloud and the map.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{count, described, term_count, format, attractions_csv, terms_csv, truncated, next_steps}`. |
| `get_metadata` | none | JSON `{title, source, fetched, count, described, term_count, stopwords_version, measure, median, bounds, truncated, next_steps}`. |
| `query` | `filter.text`, `filter.bbox` ([west, south, east, north]), `filter.has_hours`, `filter.marketing_term`, `filter.limit` (1 to 109, default 25); all optional | JSON `{total, returned, truncated, regions, csv, next_steps}`; `csv` holds the matching attractions and `regions` their regional counts. |
| `get_marketing_terms` | `limit` (1 to 40, default 40; optional) | JSON `{total, returned, truncated, csv, next_steps}`; `csv` columns are `term, documents, nw, ne, sw, se`. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `tourist-attractions-beamdswitch.md`: a narrated talk about the words and places, with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | `https://teoyujie.org/visuals/tourist-attractions/data.json` | The source data the site publishes beside the page; not a file in this folder. |

The page has no image export.

## Worked example

1. Call `get_marketing_terms` with `{"limit":5}` for the five most frequent words and their counts in each quadrant (`nw`, `ne`, `sw`, `se`).
2. Call `query` with `{"filter":{"marketing_term":"museum","limit":10}}` for up to 10 attractions whose descriptions use that word, as CSV with `regions` counts.
3. Call `get_metadata` for the source, the stopword list version and the coordinate bounds.
