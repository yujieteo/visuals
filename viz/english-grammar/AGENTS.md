# How English Grammar Works: data

The page of this visual is now a story of yujieteo/site. The story reads 3 files of this folder through the site's
`visuals.lock`:

| Story | Source in yujieteo/site | Files that it reads |
| --- | --- | --- |
| `stories/grammar/` | `content/stories/grammar/index.md` | `concepts.json` (the concepts, the beginner route and the common confusions), `examples.json` (the examples as bracketed trees, and the contrasts), `raw.json` (the CGEL chapter and section outline) |

The story does not read `corpus.json` or `meta.json`.

## Pinned files

The site's `visuals.lock` pins one commit of this repository and the SHA-256 of each file that the story reads. Thus
a change to a data file has no effect on the site until the site pins the new commit. Change the bytes of a pinned
file only together with a change to the site's `visuals.lock`.

## Data

| File | Holds |
| --- | --- |
| `raw.json` | The book, the verification notes and the outline: each chapter with its title, authors, pages and sections. |
| `concepts.json` | 84 concepts: name, location in the book, orientation, examples (`example@node`), related concepts, aliases and a note. Also the beginner route and the common confusions. |
| `examples.json` | The notation, 206 examples (text, bracketed tree, focus, explanation, and for some: kind `word` with segments, punctuation marks, usage, context, a prediction question) and 52 contrasts. |
| `meta.json` | The sources, the date of the check and the assumptions. |
| `corpus.json` | Written by the builder: the data that the old page embedded, every tree expanded into nodes with token spans and heads. |

A tree is `[Function:Category#id{key=value|key=value} children]`. A child is a word of the text, a nested node, or
`~id` for a gap linked to node `id`. Functions joined with `+` mark fusion. The root has no function. Every
sentence, analysis and explanation is original; the analyses follow the book's framework but are not checked against
its text.

## Builder

The builder is a Rust crate (`Cargo.toml`, `src/`). It reads the 4 data files, expands each tree, checks the whole
corpus and writes `corpus.json` with the same bytes as the data that `build.py` embedded in `index.html`. The checks
are those of `build.py`, one function for each part, and each names what is wrong:

- `src/tree.rs`: the tokens, the trees (labels, functions in their categories, heads, spans, gaps, fusion,
  supplements and their anchors, antecedent links), word-internal structure (bases, affixes, spelling alternations)
  and punctuation marks.
- `src/check.rs`: the chapters, the concepts, the examples, the contrasts, the route, the confusions and `meta.json`.
- `src/py.rs`: JSON as Python's `json.dumps(value, ensure_ascii=False, indent=1)` writes it.

The repository's `rust-toolchain.toml` pins the compiler. Run these commands from this folder:

| Command | Result |
| --- | --- |
| `cargo run --release` | It checks the corpus and writes `corpus.json`. |
| `cargo run --release -- --verify` | It checks the corpus and that `corpus.json` is current, and writes nothing. |

After a change to a data file, run `cargo run --release`. Do not edit `corpus.json` by hand.
`python3 ../../scripts/check.py english-grammar` runs the checks of this visual. The rules for every visual are in
[SKILLS.md](../../SKILLS.md).

## History

The last commit that has the JavaScript page is c6d16a7. The site pins 02fcb4f, which has the same folder. These
commits also have:

- `build.py`, the Python builder of the page, and `index.html`, the page.
- `src/*.js` and `src/english-grammar.css`, the sources of the page, with `report.js` and `beamdswitch.js`, its
  narrated deck export.
- `tests/` and `e2e/`, the Node, Python and browser tests, and `review.md`, a review of the page.
- `SKILLS.md`, the WebMCP tools of the page.
