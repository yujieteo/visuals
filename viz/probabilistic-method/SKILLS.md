---
name: probabilistic-method
description: Use the Probabilistic Method Atlas to compute a probabilistic-method lab's proof quantities and assumptions (first moment, linearity, alterations, second moment, the Local Lemma and Moser-Tardos, Janson, Chernoff, martingales, the nibble, quasirandomness, the giant component, dependent random choice, discrepancy, epsilon-nets, entropy, derandomisation, property testing), read the 92-technique inventory, and export narrated beamdswitch decks.
---

# Use the Probabilistic Method Atlas

Live at <https://teoyujie.org/visuals/probabilistic-method/>. One proof machine (random experiment → observable → dependency → inequality → deterministic consequence) runs through eighteen labs. Each lab has parameters and a seed (default 17), checks its hypotheses, gives the proof steps, runs seeded experiments kept apart from the proof, and exports a narrated deck. Runs offline. To change the atlas, read [AGENTS.md](AGENTS.md); for the files and determinism, read [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| List the labs, their parameters, the technique inventory and the course order | `get_metadata` |
| Read the lab on the page, its quantities and which assumptions hold | `get_current_state` |
| Evaluate a lab at given parameters without touching the page | `analyse_technique` |
| Get a lab's narrated beamdswitch deck | `export_technique_deck`, or the beamdswitch button (or Copy deck) |
| Check the implementation | `run_self_tests` |
| Share or reload a scene | Copy the page URL: the hash carries module, parameters, seed, deck frame and switch |

## Inputs

`analyse_technique` and `export_technique_deck` take `module` (a lab id from `get_metadata`, for example `first-moment`, `local-lemma` or `chernoff`), optional `params` (keys from that lab's parameter list; missing keys take the defaults, out-of-range values clamp) and optional `seed` (a non-negative integer, default 17). An unknown module returns an error.

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The modules (labs) with routes and parameters, the complete technique inventory with stable ids and build status, and the course order |
| `get_current_state` | none | The page as set: view, module, parameters, seed, the proof quantities, every assumption's status and the state URL |
| `analyse_technique` | `module`, `params`, `seed` | One lab's proof quantities, assumptions and proof steps, without changing the page |
| `export_technique_deck` | `module`, `params`, `seed` | The lab's narrated beamdswitch Markdown deck (deterministic) |
| `run_self_tests` | none | Each built-in deterministic self-test and whether it passed |

## Exports

- **beamdswitch deck:** `probabilistic-method-<module>-beamdswitch.md`, the lab's narrated deck in the template's four sections (voice `bf_emma`), or Copy deck; also a one-slide export, a switch-sequence summary and the full course deck.
- **Data:** the catalogue is published as [data.json](https://teoyujie.org/visuals/probabilistic-method/data.json).

## Worked example

`analyse_technique({"module": "first-moment"})` evaluates the Ramsey lab at its defaults, n = 10 and k = 5: the expected number of monochromatic K5 in a random red/blue colouring of K10 is E[X] = 0.4922 < 1, so some colouring has none and R(5,5) > 10. `analyse_technique({"module": "local-lemma"})` checks the Local Lemma for 6-uniform hypergraph colouring at the defaults: dependency degree d = 4 and e·p·(d+1) = 0.4247 ≤ 1, so a proper 2-colouring exists.
