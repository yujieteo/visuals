---
name: entropy-combinatorics
description: Use the Entropy Methods in Combinatorics Lab to read a lesson's theorem, proof and finite check, compute an exact count against its entropy bound (binomial, multinomial, Bregman, Loomis–Whitney, set systems), and export a proof as a beamdswitch deck.
---

# Use the Entropy Methods in Combinatorics Lab

Live at <https://teoyujie.org/visuals/entropy-combinatorics/>. Thirty-four lessons on entropy as a counting technology, from uniform entropy, the chain rule and subadditivity through the binomial and multinomial bounds, mutual information and KL divergence, Shearer, Loomis–Whitney and fractional covers to perfect matchings and Bregman's theorem, with Explore, Guided, Problems, Compare and Encode modes. Runs offline. To change the lab, read [AGENTS.md](AGENTS.md); for the files, read [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| List the lessons, labs, problems and comparisons | `get_metadata` |
| Read the lesson on the page and its entropy budget | `get_current_state` |
| Read one lesson's theorem, proof steps and finite check | `get_lesson` |
| Compare an exact count with its entropy bound | `compute_bound` |
| Keep a theorem, proof, problem or the core deck as a talk | `export_deck`, or the BeamMD Switch menu |
| Check the implementation | `run_self_tests` |
| Link to a lesson or mode | hash links such as `#shearer`, `#guided/bregman`, `#problems/3`, `#compare/<id>`, `#encode/<family>` |

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Lessons with deep links, labs, the problem ladder, comparisons, units and deck kinds |
| `get_current_state` | none | Mode, view, unit (`bits` or `nats`), the current lesson and its widget state with the entropy budget |
| `get_lesson` | `id` | Problem, encoding, theorem, proof steps with justifications, clever move and the finite check computed now, or an error |
| `compute_bound` | `kind`: `binomial` {`n`, `k`}, `multinomial` {`parts`}, `bregman` {`adjacency`: lists of right neighbours}, `loomis_whitney` {`points`: 3-tuples}, `set_system` {`sets`, `n`} | The exact count and its entropy bound, or an error |
| `export_deck` | `kind` (`theorem`, `proof`, `problem` or `core`), optional `lesson` | The beamdswitch Markdown deck (voice `bf_emma`) |
| `run_self_tests` | none | Each deterministic check of exact counts against entropy bounds, with pass or fail |

## Exports

- **beamdswitch deck:** `entropy-<kind>-<lesson>.md` or `entropy-core-deck.md`, a narrated Markdown deck with one reveal per logical move of a proof; or Copy deck.
- **Data:** lessons with their finite checks, labs, problems, comparisons, presets and self-test results are published as [data.json](https://teoyujie.org/visuals/entropy-combinatorics/data.json).

## Worked example

`compute_bound({"kind": "binomial", "n": 9, "k": 4})` returns the exact count 126 against the bound 2^(9·h(4/9)) ≈ 484.3. `compute_bound({"kind": "bregman", "adjacency": [[0, 1, 2], [0, 1, 2], [0, 1, 2]]})` counts the 6 perfect matchings of K₃,₃, where Bregman's bound is tight.
