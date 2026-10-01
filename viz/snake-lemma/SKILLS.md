---
name: snake-lemma
description: Use the Snake Lemma diagram chase to read the guided construction of the connecting map δ, the exactness chases, the integer example and Chase Lab chases by stable state id, and export any of them as a beamdswitch deck.
---

# Use the Snake Lemma diagram chase

Live at <https://teoyujie.org/visuals/snake-lemma/>. One element is chased through a commutative diagram with exact rows 0 → A′ → B′ → C′ → 0 and 0 → A → B → C → 0 using legal moves only (apply a map, choose a lift, use exactness, infer a kernel, rewrite around a commuting square, pass to a quotient). The guided proof constructs δ : ker γ → coker α and shows it is well defined; the derived six-term sequence opens exactness chases at ker β, ker γ, coker α and coker β; the ℤ example has α = 2, γ = 0, β(a, c) = (2a + c, 0) and δ(n) = n mod 2. Runs offline. To change the lab, read [AGENTS.md](AGENTS.md); for the files and the export format, read [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Read what the lab models: diagram, hypotheses, dependency graph, state ids, presets | `get_metadata` |
| Read the state on the page: token, known facts, switched-off hypotheses, proof trace | `get_current_state` |
| Read any state without changing the page | `get_proof_state` with a state id such as `proof/lift` or `lab?ops=lift.pp,apply.beta` |
| Turn the proof or a chase into a talk | `get_beamdswitch_deck`, or Export → Beam MD Switch on the page |
| Link to a state | its URL hash, for example `#exact/ker-gamma?step=3` or `#example/integer?k=2&c=1` |
| See which hypothesis a step needs | Break mode: add `&off=p-prime-surjective,…` to a state URL |

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The diagram, the six hypotheses, the proof-dependency graph, the derived sequence, the integer example, the stable state ids and the export presets |
| `get_current_state` | none | The page's hash, mode and state, where the element lives and what is known, switched-off hypotheses, where Break mode stops and the live proof trace |
| `get_proof_state` | `state`: a state id | That state's title, statement, algebra, the hypotheses it uses and its speaker note; for a lab state, the token, facts, legal next moves and outcome |
| `get_beamdswitch_deck` | `preset` (`short`, `standard`, `full` or `chase`), and for `chase` a `start` and `ops` | The deterministic beamdswitch Markdown deck |

## Exports

- **beamdswitch deck:** Short (about 8 slides), Standard (about 20) or Full proof, or "This chase" from the Chase Lab, as Download .md, Copy Markdown or Copy deck sequence. Each reveal is one state of the page, tagged with its state id; voice `bf_emma`.
- **Data:** the engine's catalogue is published as [data.json](https://teoyujie.org/visuals/snake-lemma/data.json).

## Worked example

`get_proof_state({"state": "proof/lift"})` returns the lifting step of the construction, which uses the hypothesis "p′ surjective". `get_beamdswitch_deck({"preset": "chase", "start": "c", "ops": ["lift.pp", "apply.beta"]})` returns the deck of a two-move chase from ker γ: lift along p′, then apply β.
