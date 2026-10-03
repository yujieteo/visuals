# Calibrator

No build step: edit `index.html`. `<script id="calibrator-engine">` is the pure core (`self.Calibrator`): no DOM, storage, clock or network use, and state is never mutated in place. The import schema and workflow are in [README.md](README.md).

TOON must match yujieteo/site's `scripts/toon.py` byte for byte; `tests/fixtures/toon.py` is a read-only copy of it. When the schema changes, update README.md, `raw.json` and the site's raw.toon reader together.

Imported questions are immutable: the first answer is never overwritten, skipped and unseen are never merged, and an untouched question has no probability.

Keep the suite to its deterministic checks; it has deliberately no browser end-to-end tests.

Its tests are in `tests/`; `python3 ../../scripts/check.py calibrator` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
