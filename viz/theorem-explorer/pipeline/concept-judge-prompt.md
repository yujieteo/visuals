# Concept judge prompt (tc-judge-prompt/1)

You judge entries of the Theorem Explorer's concept catalog. A concept is a mathematical notion that results are
stated about: a definition, a structure or an object. Score each concept with the rubric in
`data/concept-rubric.json` (tc-rubric/1). Use the evidence in the packet (how many catalog results name the
concept, example results, the mathlib declaration and its doc line, the nLab page, its Idea paragraph and its
backlinks) and your own knowledge, and label inference as inference in `why`.

For each packet, write one JSON object:

| Field | Value |
| --- | --- |
| `id` | the packet id, unchanged |
| `keep` | `true`; `false` only if the entry is not a concept (then add `not_reason`) |
| `name` | the canonical name (you may refine the capitalisation or wording) |
| `kind` | one of `structure`, `space`, `object`, `map`, `property`, `construction`, `invariant`, `number-system`, `logic`, `relation`, `other` |
| `def` | one plain sentence, at most 40 words, that defines the concept; inline TeX in `$...$` is allowed. Your own words, not quoted |
| `al` | other names (0 to 5) |
| `pat` | 1 to 8 lowercase whole-word phrases that name this concept in an arXiv title or abstract, plural forms listed separately ("hilbert space", "hilbert spaces"). A phrase must name this concept or a standard qualified instance of it ("abelian group" names groups). Never a bare everyday word ("group", "ring", "field", "set", "function", "graph", "limit", "measure", "category", "model", "space", "map"): use qualified phrases instead |
| `amb` | `true` if the phrases can still have a common non-mathematical or other-concept sense (so counts are upper bounds) |
| `cat` | 1 to 3 arXiv category ids from `arxiv-categories.txt`, the main one first |
| `lv` | the reader level the definition needs: 0 school, 1 undergraduate, 2 graduate, 3 research |
| `ef` | effort bands `["u", "a", "p"]` for understand, apply, prove, each `"1"` to `"5"` (or `"x"` if the depth does not apply) |
| `pre` | 0 to 5 ids from `ids.txt`: the direct prerequisite concepts that the definition uses (not every ancestor). Never the concept itself. Keep the graph acyclic: a prerequisite is strictly more basic |
| `s` | 7 characters, in the rubric order uni, res, pra, rea, lpb, exa, cmp: `0`-`4`, `u` or `n` |
| `c` | `high`, `medium` or `low` (rubric confidence rules) |
| `why` | 1 or 2 sentences that give the main evidence for the scores |
| `mathlib` | the full name of the Mathlib declaration that defines it (one from the packet, or one you are sure exists, such as `MeasureTheory.Measure`), else `null` |
| `nlab` | the nLab page name if the packet gives one or you are sure it exists, else `null` |

Calibrate the whole scale: `Set`, `Group`, `Vector space`, `Topological space` and `Hilbert space` are near the
top for unifying power and reach; a narrow construction is low. Practical impact needs uses outside pure
mathematics (matrices, probability distributions and Fourier transforms are high; a perverse sheaf is low).
