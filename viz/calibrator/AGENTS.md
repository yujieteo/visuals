# Calibrator: notes for coding agents

A low-friction probability elicitation instrument: paste a ranked session of questions as TOON, answer each with one slider, and copy the answered session back as TOON. Live at <https://teoyujie.org/visuals/calibrator/>; its schema metadata is published at <https://teoyujie.org/visuals/calibrator/data.json>.

## Where changes go

The standalone repository [yujieteo/calibrator](https://github.com/yujieteo/calibrator) is where this visualisation and its tests develop and where CI runs them. `visuals/calibrator/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/calibrator) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. [README.md](README.md) lists every file here and its role, and defines the session TOON schema.

## Build, test and verify

There is no build step: edit `index.html` directly. Run the tests from the repository root, as CI (`.github/workflows/ci.yml`) does on every push:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

Keep the suite to the high-value deterministic checks it has (import, rejection, unanswered state, first answer, auto-advance, Back and revisions, Skip, the three states, persistence, export round-trip). Never add Playwright, Selenium, browser end-to-end tests or another test framework.

## Porting to yujieteo/site

1. Run the suite above and try the page by hand: paste [sample-session.toon](sample-session.toon), answer, skip, go back, reload, export.
2. Copy this repository minus `tests/` and `.github/` (and `.gitignore`), byte for byte, into `visuals/calibrator/` of yujieteo/site. The site checks only how it publishes the port, the `calibration` Corpus Records it builds from `data/calibrator/raw.toon`, and the `#calibrator` note tag.

## Conventions

- One self-contained `index.html`: no external scripts, stylesheets, fonts or network requests; no links during answering.
- The engine (`<script id="calibrator-engine">`) has no DOM, storage, clock or network use. State is never mutated in place.
- TOON matches yujieteo/site's `scripts/toon.py` byte for byte; `tests/fixtures/toon.py` is a read-only copy of it. When the schema changes, update [README.md](README.md), [raw.json](raw.json) and the site's raw.toon reader together.
- Imported questions are immutable. The first answer is never overwritten; skipped and unseen are never merged; an untouched question has no probability.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/calibrator.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
