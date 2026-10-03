---
name: kent
description: Use Kent: Words of Estimative Probability to translate a probability into Sherman Kent's 1964 words (anchor and band kept apart), a natural frequency, odds and complement, find hedging language in English text, read the page's estimate and forecast calibration, and export the data as JSON or a beamdswitch deck.
---

# Use Kent: Words of Estimative Probability

Live at <https://teoyujie.org/visuals/kent/>. One claim and one 0–100% ruler: the number comes first and Kent's word follows, with his anchor (75% for "probable") kept apart from his band (63–87%). Around it: the writer/reader demonstration, simulated readers (always labelled as generated), evidence notes, updates, decision thresholds, append-only forecasts with calibration and the Brier score, and the Kent laboratory. Runs offline; nothing is uploaded. To change the tool, read [AGENTS.md](AGENTS.md); for the scale and its fidelity notes, read [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Turn a probability into Kent's word, band, frequency, odds and complement | `translate_probability` |
| Find probability language in a piece of English | `find_phrases` |
| Read the Kent 1964 scale | `get_scale` |
| Read the estimate on the page, its updates, threshold and calibration | `get_current_state` |
| Read the conventions, limits and glossary | `get_metadata` |
| Share an estimate | the page URL, `?q=<claim>&p=<0–100>&c=<confidence>` (low, medium or high) |
| Save or reload everything | Export JSON, then Import JSON |
| Keep the estimate as a talk | the beamdswitch button (or Copy deck) |

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Title, URL, scale, conventions and glossary |
| `get_scale` | none | Each Kent word's anchor, band, Kent's own label and the essay's synonyms |
| `get_current_state` | none | Claim, probability, Kent region and band, frequency, odds, complement, confidence, updates, threshold decision, forecast summary and the share URL |
| `translate_probability` | `probability` (0–100) | Kent term or the gap between two terms, anchor, band, natural frequency, odds and complement, without changing the page; out of range returns `problem` |
| `find_phrases` | `text` (up to 2000 characters) | Each phrase found; Kent terms and the essay's synonyms carry Kent's anchor and band, other hedges carry none |

## Exports

- **JSON:** `kent-data.json`, the estimate, forecast ledger, dictionary and lab; imports back (an imported ledger must be append-only history).
- **beamdswitch deck:** `kent-beamdswitch.md`, a narrated Markdown deck of the estimate (voice `bf_emma`), or Copy deck.
- **Data:** the scale, examples, worked example, glossary and messages are published as [data.json](https://teoyujie.org/visuals/kent/data.json).

## Worked example

`translate_probability({"probability": 72})` returns Probable (anchor 75%, band 63–87%, inside the band), "about 7 in 10", odds 2.6 : 1 and a 28% chance it does not happen. `translate_probability({"probability": 15})` lands in the gap between "almost certainly not" and "probably not", which the tool names as a gap rather than filling in. `find_phrases({"text": "It is likely to rain, with a decent chance of thunder."})` gives "likely" Kent's "probable" band (a synonym from his table) and "decent chance" no number, because only the writer knows what they meant.
