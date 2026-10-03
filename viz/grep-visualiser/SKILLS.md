---
name: grep-visualiser
description: See what ripgrep, GNU grep, PowerShell and VS Code would match for a pattern, and build a correctly quoted command, with the Grep Visualiser or its read-only WebMCP tools.
---

# Grep Visualiser

A live match visualiser and scratchpad: paste text, type a pattern and see what ripgrep 14, GNU grep 3.x, PowerShell 7 and VS Code (Find and Search) would match, with an honest confidence level for each emulation. Open it at <https://teoyujie.org/visuals/grep-visualiser/>; everything
runs in the browser and works offline. The page registers read-only WebMCP
tools through the browser's `modelContext` API when the browser offers it;
each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| See what a pattern matches in a given tool, with how faithful the emulation is | `run_pattern` |
| Build the command for a pattern, quoted for bash or PowerShell | `build_command` |
| Read the page's current preset, patterns, options and latest result | `get_current_state` |
| List presets, confidence levels, matching models, flags and replace syntaxes | `get_metadata` |
| Run the self-test | `run_self_tests` |

## Inputs

- A preset: `rg` (ripgrep 14), `grep` (GNU grep 3.x), `pwsh` (PowerShell 7), `vsfind` (VS Code Find) or `vssearch` (VS Code Search).
- One or more patterns, the input text and its line endings (LF or CRLF).
- The preset's options (case, word, fixed strings, matcher, context and so on) and an optional replacement in that tool's own syntax.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The presets and target versions, confidence levels, matching models, supported flags and replace syntaxes. |
| `get_current_state` | none | The page's preset, patterns, replacement, line-ending mode, options, files and the latest result. |
| `run_pattern` | `preset`, `patterns`, `text`; optional `eol`, `options`, `replacement` | The JavaScript translation with its confidence (exact, differs, cannot, error), match counts and spans, the tool's output lines and the replace preview, or a timeout after 1.5 s. Does not change the page. |
| `build_command` | `preset`, `patterns`; optional `options`, `replacement`, `shell` (`bash` or `pwsh`) | The command line, quoted for that shell. |
| `run_self_tests` | none | `passed`, `total` and each result (dialect translation, matching models, line endings, quoting, replace syntaxes, no network use). |

## Exports

- The command, quoted for bash or PowerShell, copies from the Command card (or `build_command`).
- JSON: `raw.json`, published as `data.json`, holds the engine's metadata.
- No file downloads and no beamdswitch deck.

## Worked example

Call `run_pattern` with grep's extended syntax:

```json
{"preset": "grep", "patterns": ["colou?r"], "text": "color\ncolour\ncolr\n", "options": {"matcher": "E"}}
```

The translation's `level` is “exact”, `totals` is 2 matches on 2 lines, and
the output is `color` and `colour`. `build_command` with the same input and
`"shell": "bash"` returns `grep -E 'colou?r' input.txt`.

## Rules

1. Quote the tool's own numbers; do not re-derive them by hand.
2. Where the confidence is “differs” or “cannot”, say so: the result is an emulation, not the real tool's output.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md); for each file's role, [README.md](README.md).
