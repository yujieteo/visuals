---
name: toulmin
description: Use the Toulmin argument builder to draft an essay as up to twelve Toulmin arguments (claim, grounds, warrant, backing, qualifier, rebuttals), check it against a pilot-style checklist, and read back its paragraph, beamdswitch deck or JSON.
---

# Use the Toulmin argument builder

Live at <https://teoyujie.org/visuals/toulmin/>. One argument per tab, each laid out in Toulmin's diagram arrangement, with a checklist (six automatic and six confirm lines), prompts, definitions with examples from Toulmin's Harry argument, and a template essay on surgical safety checklists to start from. It runs in the browser and uploads nothing; the essay is kept in this browser's storage. To change the tool, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Read the essay and every argument | `get_data` |
| Read one argument | `query` with its id or position |
| Get the generated paragraph, claim-first or grounds-first | `get_paragraph`, or Copy on the page |
| Get the narrated deck with timing estimates | `export_markdown`, or Export (Download .md, Copy deck) |
| Save or reopen an essay | Export (Download .json, Copy JSON), and Import JSON (or drop a `.json` file) |
| Read the timing constants, limits, voices and sources | `get_metadata` |

## Inputs

The essay title, thesis, author, narration voice (`bf_emma` by default, or `bf_isabella`, `bm_george`, `bm_lewis`, `af_heart`, `am_michael`) and speed, and per argument its claim, grounds with sources, warrant, backing, qualifier and rebuttals. Argument ids look like `a1`, `a2`; positions are 1-based.

## WebMCP tools

All read-only; none of them change the essay.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | The essay (title, thesis, author, voice, speed) and one row per argument: id, position, label, every part and its checklist clear/total counts |
| `get_metadata` | none | Title, slug, timing constants (beamdswitch's model at 130 wpm), field limits, voices and the template's sources |
| `query` | `id` (required): argument id or 1-based position | That argument's row, or `null` |
| `get_paragraph` | `ordering` `claim-first` or `grounds-first`, `scope` `essay` or an argument id or position | The paragraph text exactly as the page shows it |
| `export_markdown` | `voice`, `speed` 0.5-2 (optional, this result only) | The beamdswitch deck text, per-frame narration estimates, the total, warnings, voice and speed |

## Exports

- **beamdswitch deck:** a narrated Markdown deck with word-count timing (voice `bf_emma` unless you pick another), downloaded as `.md` or copied.
- **JSON:** the essay as a `toulmin-essay` file that imports back unchanged.
- **Paragraph:** the generated paragraph in either ordering, copied as plain text.

## Worked example

On a fresh page the template essay on surgical safety checklists is loaded, with arguments `a1` to `a3`. `get_paragraph({"scope": "a1", "ordering": "grounds-first"})` returns the first argument as one paragraph that leads with its evidence ("Given the evidence: In eight hospitals in eight cities, inpatient deaths after major surgery fell from 1.5% to 0.8%..."). `export_markdown({"speed": 1.25})` returns the whole essay as a deck whose front matter declares `voice: "bf_emma"` and `speed: "1.25"`, with a total of 4 min 1 s; the essay's saved speed stays 1.
