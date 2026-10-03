# Entropy Methods in Combinatorics Lab

Entropy as a counting technology. Choose an object of a finite family
uniformly at random, so that H(X) = log |F|; encode it by coordinates; bound
the information with an entropy inequality; exponentiate to get a counting
bound. The lab walks that chain from uniform entropy to Shearer's inequality,
Loomis–Whitney and Bregman's theorem by random reveal order, and checks every
bound against an exact count.

`index.html` is one self-contained page with no dependencies, no network
requests and no TeX library. It works from `file://`, offline and inside an
iframe, follows the reader's site-wide Light or Dark choice (`localStorage`
`theme`, else the system colour scheme) and reduced motion, and shows a
reference edition (the entropy method, concept map, inequalities, the binomial,
Shearer and Loomis–Whitney proofs, Bregman's proof architecture, techniques,
problems and the master workflow) when JavaScript is off. It is served at
<https://teoyujie.org/visuals/entropy-combinatorics/>; lessons have stable hash
links such as `#shearer`, `#bregman`, `#projection` and `#binomial`, and the
modes use `#guided/<lesson>`, `#problems/<1–16>`, `#compare/<id>` and
`#encode/<family>`.

| File | Role |
| --- | --- |
| `src/engine.js` | The pure maths (`EntropyLab`): exact counts as BigInt (factorials, binomials, multinomials, permanents), entropies of integer-weighted tables, conditional entropy and mutual information, KL divergence, the binomial, multinomial, set-system and Hamming-ball bounds, Shearer and its counting form, Loomis–Whitney, fractional covers, Han averages, perfect matchings, Bregman's bound, random-reveal trajectories and their averages, colourings, cube edges, typical sets, types, sumsets, Huffman codes and deterministic sampling. No DOM. |
| `src/lessons.js` | The single source of truth (`EntropyLessons`): 34 lessons (problem, encoding, variables, theorem, proof steps with justifications and narration, clever move, equality and slack, hints, widget, and a finite check computed from the engine), the three labs, the sixteen-problem ladder, the comparisons, the reference material, the deck model and its beamdswitch Markdown writer, and the self-tests. |
| `src/render.js` | A small renderer (`EntropyRender`) for the lessons' Markdown and a fixed table of TeX commands, written out as HTML and CSS. |
| `src/widgets.js` | The interactive pictures (`EntropyWidgets`), one per visual model: decision tree, probability bars, joint grid, reveal, strings, entropy curve, lit boxes, Shearer cover, cover builder, lattice projections, cube, forgetting, Han, fractional covers, bipartite matchings, colourings, encodings, typical strings, type simplex, incidence matrix and sumsets. |
| `src/ui.js` | The page: hash routing, the five modes, concept map, command palette (⌘K or Ctrl+K), BeamMD Switch menu, presentation mode (P) and the six read-only WebMCP tools. |
| `src/style.css`, `template.html` | Styles and page markup. |
| `build.mjs` | Inlines the sources into `template.html` and renders the no-JavaScript reference from the lessons, so its numbers are the engine's; writes `index.html` and `raw.json`. |
| `raw.json` | Catalogue data, published as `data.json`: lessons with their finite checks, labs, problems, comparisons, presets and self-test results. Generated; the page never fetches it. |

Edit `src/` or `template.html`, then rebuild; never edit `index.html` or
`raw.json` by hand:

```sh
node build.mjs          # write index.html and raw.json
node build.mjs --check  # fail if either is stale
```

## Decks

The BeamMD Switch menu exports the current theorem, proof or problem, or the
full core deck (34 slides in six sections), as a
[beamdswitch](https://teoyujie.org/visuals/beamdswitch/) Markdown deck: front
matter declaring `voice: bf_emma`, `#` sections, `##` frames, `. . .` between
the logical moves of a proof, `::: notes` and `::: narration` on every slide,
and a `<!-- beam-md-switch lesson: … state: … -->` comment naming the lab state
each frame comes from. Presentation mode renders the same deck model in the
page. The decks are written by `toMarkdown` in `src/lessons.js` rather than the
site's four-section report template, because a proof deck follows the proof,
not a set-up/method/results report.

## Numbers

Every number on the page is computed by the engine; none is typed in. Counts are
exact integers and probabilities stay integer weights until a logarithm is
taken. Switching between bits and nats rescales every entropy and leaves every
counting bound unchanged. The specification's sample figures were illustrative,
and several differ from the engine's: for example C(10,3) = 120 against
2^(10·h(0.3)) ≈ 449.7, and C(9,4) = 126 against 2^(9·h(4/9)) ≈ 484.3.

## Tests

The tests live in this repository,
[yujieteo/entropy-combinatorics](https://github.com/yujieteo/entropy-combinatorics),
and its CI runs them; `visuals/entropy-combinatorics/` in yujieteo/site is a
port of the page files without them. `tests/entropy-combinatorics.test.mjs`
runs with Node's built-in runner (`node --test 'tests/*.test.mjs'`). It
checks that `index.html` and `raw.json` are the current build; the engine on
tables, the binomial, multinomial and set-system bounds, Shearer and its
counting form, Loomis–Whitney, fractional covers, permanents and Bregman (C₆: 2
against 2^(3/2); K₃,₃: 6, tight), the reveal-order averaging and the bits/nats
invariance; every self-test; that every lesson's text renders with known TeX
commands only; that every exported deck parses with beamdswitch's own parser
with a voice, narration on every slide and reveals in proofs; and, booting the
page in `node:vm` against a stand-in DOM, the WebMCP tools and the deck download
and copy.
