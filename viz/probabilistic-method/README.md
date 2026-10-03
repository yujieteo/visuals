# Probabilistic Method Atlas

A visual laboratory for the probabilistic method, built around one proof machine:
random experiment → observable → dependency → inequality → deterministic consequence.
Eighteen labs (the specification's MVP) each show what was random, which quantity is
controlled, why the bound forces a deterministic conclusion and why that technique was
needed; every lab has Proof, Experiment and Deck modes and exports narrated beamdswitch
Markdown. The complete technique inventory (92 entries, stable ids) is in the page:
techniques without a lab are marked "not yet built" rather than given placeholder pages.

`index.html` is one self-contained file with no network requests; it works from
`file://`, offline and in an iframe, and shows a static worked example and the full
inventory when JavaScript is off.

| File | Role |
| --- | --- |
| `index.html` | The built page. Generated: do not edit it by hand. |
| `build.mjs` | Builds `index.html` and `raw.json` from the sources (`node build.mjs`; `--check` exits 1 when either is stale). |
| `template.html` | Markup and styles (the site style guide's tokens in light and dark, the shared site theme choice, reduced motion, responsive layout) with the inlining markers. |
| `src/engine/*.js` | The pure engine, concatenated into `<script id="probabilistic-method-engine">` as `self.PM`: seeded randomness, combinatorics and distributions, graphs and set systems, the inventory and concept map, the eighteen modules (parameters, analysis, sampling, hypotheses, proofs, deck stories), URL state, experiments, deck and Markdown exports, search, the recommender and self-tests. No DOM, clock or network. |
| `src/ui/*.js` | The page code, concatenated into `<script id="probabilistic-method-ui">`: one SVG renderer per lab, the views (atlas, lab, technique, compare, recommender), deck mode, command palette, keyboard, export menu and the read-only WebMCP tools. |
| `beamdswitch.js` | The site's standard report template, a verbatim copy of `templates/beamdswitch.js` in yujieteo/site, inlined unchanged as `<script id="beamdswitch">`. |
| `package.json`, `package-lock.json`, `tsconfig.json`, `scripts/extract-inline.mjs`, `types/`, `.gitignore` | Development-only type-check tooling: `npm run typecheck` runs the pinned TypeScript over the JSDoc types in `src/`, `build.mjs`, the tests and the template's inline script. Not ported to the site. |
| `raw.json` | Catalogue data, published as `data.json`, generated from the engine: every module's route and parameters, the families, the inventory and the course order. The page never fetches it. |

## Determinism and URLs

All randomness comes from named streams of one seed (mulberry32 keyed by FNV-1a of the
stream name), so a module, its parameters and its seed fix the graph, colouring, sample
and every experiment trial. The URL hash carries that state, for example
`#local-lemma/hypergraph-colouring?k=5&s=1&seed=17&deck=1&frame=3&switch=1`; the export
is byte-for-byte identical for the same state.

## Decks

The technique deck is written by the shared template (`deck(report)`) in its four standard
sections, voice `bf_emma`, with `. . .` reveals and the scene state (module, scene, seed,
focus, parameters) as an HTML comment in each frame. Deck mode in the page renders those
same frames. The full course deck and the one-slide export use the same frame text with
one `#` section per technique. Simulations in decks and labs are labelled as experiments;
conclusions come from the displayed inequalities.

## Tests

This repository, [yujieteo/probabilistic-method](https://github.com/yujieteo/probabilistic-method),
is where the atlas and its tests develop; CI runs them on every push and pull request.
`visuals/probabilistic-method/` in yujieteo/site is a port of the page files without
`tests/`, `.github/` or the type-check tooling.

`tests/probabilistic-method.test.mjs` (`node --test 'tests/*.test.{mjs,cjs}'`) checks that the build is current,
the page is self-contained, every specification §85 utility (combinations, binomial and
Poisson probabilities, expected subgraph counts, dependency degrees, Chernoff expressions,
conditional expectations, the seeded PRNG, graph generation with the fixed seed-17 graph,
incidence matrices), the §86 consistency checks (displayed expectations against sums of
indicator expectations and brute force, displayed dependency degree against the actual
maximum, histogram trial counts, deck equations against lab values, exports against the
scene state), the inventory, every deck with beamdswitch's own parser, and the page booted
in a stand-in DOM with its WebMCP tools and export buttons. `tests/page-checks.mjs` holds
the shared deck and stand-in DOM helpers; beamdswitch's deck parser and read-only copies of the
site's `templates/beamdswitch.js` and `templates/beamdswitch-report.md` are in
`tests/fixtures/beamdswitch/`, with `deck.d.mts` typing the parser for the type check.
