---
name: calibrator
description: Answer a ranked session of probability questions on the Calibrator page, or read its session state and schema through read-only WebMCP tools.
---

# Calibrator

A probability elicitation instrument. Open it at <https://teoyujie.org/visuals/calibrator/>; everything runs in the browser and nothing is uploaded. The page registers read-only WebMCP tools through the browser's `modelContext` API when the browser offers it; each returns its result as JSON text and none changes the page or the saved session.

## Tasks

| The request is to... | Use |
| --- | --- |
| Write a session for the page | The import schema in [README.md](README.md#session-toon-schema); [sample-session.toon](sample-session.toon) is an example |
| Check that a session TOON will import | `validate_session_toon` |
| Read the schema's tables, fields, origins and states | `get_metadata` |
| See how far the person has got | `get_session_summary` |
| Read the question on screen | `get_current_question` |
| Get the answered session as TOON | `export_session_toon`, or the page's Copy TOON |

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The format and version, the import and export fields of each table, origins, score names and the three question states. |
| `get_session_summary` | none | The session id, the current question number, the answered, skipped, unseen and total counts, and whether it has unexported work; `null` with no session. |
| `get_current_question` | none | The question on screen: number, id, proposition, context, high and low actions, its state and final probability. Never the generator's scores or sources. |
| `export_session_toon` | none | `{ toon }`: the complete exported session, as Copy TOON gives it, without marking it exported. |
| `validate_session_toon` | `toon` | `{ valid, session_id, questions }`, or `{ valid: false, error }` naming the first problem. It never loads the session. |

## Exports

- Copy TOON or Save .toon in the Export sheet: the answered session (every question `answered`, `skipped` or `unseen`), schema in [README.md](README.md#export-answered-sessiontoon-written-by-copy-toon).
- JSON: [raw.json](raw.json), published as `data.json`, describes the schema.

## Rules

1. Calibrator never generates, edits, reorders or resolves questions; a bad question is feedback for the next generation.
2. Never treat `skipped` and `unseen` alike, and never read an unanswered question as 50%.
3. Quote the exported numbers; do not re-derive them by hand.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md).
