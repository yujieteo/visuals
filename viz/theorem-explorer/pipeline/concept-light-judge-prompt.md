# Concept light judge prompt (tc-judge-light/1)

You assess entries of the concept universe (tc-universe/1) that the full judge (tc-judge-prompt/1) did not
assess. Use the rubric of `data/concept-rubric.json` (tc-rubric/1), the evidence in each packet (nLab Idea
passage and backlinks, Mathlib declaration and doc line, how many catalog results name it, its documented
prerequisite count) and your own knowledge. The output is shorter than the full judge's: no definition, no
phrases, no prerequisites (the nLab Definition links stand in for them, labelled as documented, not judged).

For each packet write one JSON array, in this order:

`[id, keep, kind, name, s, c, lv, cats, ef, ph]`

| Field | Value |
| --- | --- |
| `id` | the packet id, unchanged |
| `keep` | `1` for a mathematical concept (a definition, structure, object, property, construction, invariant, space, map, relation or a notion of logic or computation that has instances); `0` otherwise |
| `kind` | when keep is 1: one of `structure`, `space`, `object`, `map`, `property`, `construction`, `invariant`, `number-system`, `logic`, `relation`, `other`. When keep is 0, the reason: `result` (a theorem, lemma, proposition or a statement such as "X are Y"), `person`, `reference` (a paper, book, talk, list, timeline or bibliography), `field` (a whole theory or area, such as "concurrency theory"), `physics` (a physical phenomenon, particle, unit, constant or model with no mathematical definition of its own), `technical` (a Mathlib implementation detail with no mathematical meaning of its own, such as a coercion or a notation class), or `other` |
| `name` | a readable name if the packet name is a Mathlib identifier split at its capitals or is badly capitalised ("is fraisse" -> "Fraïssé class", "add left reflect le" -> "" if technical), else `""` (keep the packet name) |
| `s` | 7 characters in the rubric order uni, res, pra, rea, lpb, exa, cmp: `0`-`4`, `u` or `n`. Use `u` only when you cannot judge. Most nLab concepts are specialised: be calibrated (a narrow higher-categorical construction has uni 1-2, pra 0, rea 1) |
| `c` | `medium` if a source in the packet supports the scores, else `low` |
| `lv` | the reader level the definition needs: 0 school, 1 undergraduate, 2 graduate, 3 research |
| `cats` | 1 to 3 arXiv category ids from `arxiv-categories.txt`, the main one first, joined by `;` |
| `ef` | three characters, the effort bands for understand, apply, prove: `1`-`5` (`x` if the depth does not apply) |
| `ph` | `1` if the name and its plural are safe whole-word search phrases for this concept in arXiv abstracts (they rarely mean anything else), else `0` (an everyday word such as "top", "crystal", "spine", "boundary", or a name that other fields use differently) |

Give every field for a keep 0 entry too, with `"uuuuuuu"`, `0`, `""` and `"xxx"` for the parts that do not
apply.
