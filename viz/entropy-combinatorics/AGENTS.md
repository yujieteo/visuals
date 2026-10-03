# Entropy Methods in Combinatorics Lab

Edit `src/` and `template.html`, never `index.html` or `raw.json`: `build.mjs` inlines the sources (`node build.mjs --check` checks them); the layout is in [README.md](README.md). The engine, `self.EntropyLab`, is pure maths: no DOM, storage, clock or randomness.

Every number is computed by the engine; counts are exact BigInt integers and probabilities stay integer weights until a logarithm is taken.

Decks are written by `toMarkdown` in `src/lessons.js`, not the site's shared report template, and declare `voice: bf_emma`.

Its tests are in `tests/`; `python3 ../../scripts/check.py entropy-combinatorics` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
