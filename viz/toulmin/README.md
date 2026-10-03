# Toulmin argument builder

Build an essay out of Toulmin arguments, one argument per tab, each with its
claim, grounds, warrant, backing, qualifier and rebuttals on one page. A
pilot-style checklist and four prompts guide the draft; the outputs are a
read-only paragraph in two orderings, a narrated
[beamdswitch](https://teoyujie.org/visuals/beamdswitch/) Markdown deck and a JSON file that
imports back unchanged. `index.html` is one self-contained file with no
dependencies, no network access and no build step, and it works from `file://`
and inside a sandboxed iframe.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="toulmin-engine">` is the pure core (`self.Toulmin`): the template and example essays, limits, checklist and prompts, paragraph lead-ins, the beamdswitch deck writer with narration and timing, JSON validation, and string builders for the argument page. It has no DOM, storage, clock or network use. `<script id="toulmin-ui">` is the page, `localStorage` persistence and the five read-only WebMCP tools. Edit this file directly. |
| `raw.json` | Catalogue data, published as `data.json`: the template essay, the Harry example, the constants and the connective strings. The page never fetches it; the test says when it has drifted from the engine. |

The tests are `tests/toulmin.test.mjs`, run with Node's built-in runner
(`node --test`). They extract the engine from `index.html` and check the
template deck byte for byte against `tests/fixtures/toulmin-template.md`, parse
decks with beamdswitch's own parser (`tests/fixtures/beamdswitch/deck.mjs`),
compare the sentence splitter with that parser's, check the integer-ms timing,
and cover escaping, JSON round trips and import rejection, the checklist and
prompts, limits, paragraphs, accessible names, the colour contrast of the
shipped tokens and `raw.json`. They
also boot the page script in `node:vm` against a stub DOM and storage to check
the WebMCP tools, the 12-argument limit, tab keys and deck copying.
`tests/toulmin-browser.test.mjs` checks the 320 px layout and the 1280 px diagram
layout in a real Chrome and is skipped unless `TOULMIN_BROWSER_URL` names a remote-debugging endpoint.

## Narration timing

The deck's estimates use beamdswitch's model in integer milliseconds: a
sentence takes `max(800, round(words × 60000 / 130))`, and a frame takes a
350 ms lead, its sentences, 250 ms between sentences and a 600 ms tail. The
sentence splitter is beamdswitch's, unchanged. If beamdswitch is re-vendored
with a different model, the test fails; port the change into `TIMING` and
`splitSentences`, then regenerate the golden deck.

## Changing the template

The template essay lives in three places that must stay identical: `TEMPLATE`
in the engine, `template` in `raw.json`, and the deck it exports in
`tests/fixtures/toulmin-template.md`. After editing `TEMPLATE`, regenerate the
other two from the engine (for example with a short `node` script that loads
the engine script as the test does and writes `T.exportDeck(T.TEMPLATE).text`),
then review the deck by hand. Every figure in the template is checked against
Haynes et al., N Engl J Med 2009;360:491-9 (doi:10.1056/NEJMsa0810119), the
Harvard Gazette's 2009 report and WBUR's 15 January 2009 report.
