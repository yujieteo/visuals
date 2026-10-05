---
name: checklist-manifesto-maker
description: Use Checklist Manifesto Maker to read a person's checklist, its draft issues and its Run progress, or a bundled example, and to keep a checklist as lossless Markdown or a Beam MD Switch deck.
---

# Use Checklist Manifesto Maker

Live at <https://teoyujie.org/visuals/checklist-manifesto-maker/>. A general checklist tool: people create, review, run, save, export and import their own checklists, one pause point at a time, on their own device. To change the page, read [AGENTS.md](AGENTS.md); the file formats are in [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Read the categories, modes, result values, design targets and example ids | `get_metadata` |
| Read the open checklist's draft, revision, reviewer records, counts and draft issues | `get_checklist` |
| Read the open Run: its fixed revision, results, reports, recovery and progress gate | `get_run` |
| Read the open checklist as the lossless Markdown export | `get_markdown` |
| Read one bundled example and its failed-check scenario | `get_example` |
| Keep a checklist as a file or a talk | the Files view: Export Markdown, Copy Markdown, Export Beam MD Switch |

## WebMCP tools

All read-only. None changes a checklist, records a result or reports a condition: those stay with the person.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title, format and schema version, the five categories, the modes, the step and check results, the design targets, the views and the example ids |
| `get_checklist` | none | The open checklist's draft definition, reviewer records (user supplied, never verified), reviewed revision, derived counts and draft issues, or null |
| `get_run` | none | The open Run with its own copy of its revision, results, reports, recovery progress and the progress gate at its current pause point, or null |
| `get_markdown` | none | The lossless Markdown export of the open checklist: the readable checklist and its embedded state |
| `get_example` | `id` (required): `day-trip`, `static-page` or `appointment` | One bundled example: its checklist, summary and scenario |

## Exports

- **Markdown:** `<title>.md`, the readable checklist then one HTML comment holding the complete state (definition, ids, revision, reviewer records and Run progress). Import Markdown restores it exactly.
- **Beam MD Switch:** `<title>.beamdswitch.md`, a narrated deck in the site's report format (Set-up, Method, Results with one frame per pause point, Checks and takeaway) that carries the same state. Import Beam MD Switch restores it exactly.
- **Plain Markdown:** any other Markdown or deck comes in as a draft of normal steps, with a preview of what was recognised and what was not.
- **Data:** [data.json](https://teoyujie.org/visuals/checklist-manifesto-maker/data.json) (`raw.json` here): the three examples, the trial prompts and the principles.
