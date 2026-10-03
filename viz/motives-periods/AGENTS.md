# Motives and periods

No build step: edit `index.html`. `<script id="motives-periods-engine">` is the pure engine (`self.MotivesPeriods`: no DOM, storage, clock, randomness or network); `raw.json` must equal `{ meta: META, example: toJSON(defaultState()) }`.

Every mathematical statement on the page is a claim in the engine's `CLAIMS` with at least one source in `SOURCES`; every number the page shows is computed by the engine and checked by a test against an exact value, an independent reference or an identity.

Its tests are in `tests/`; `python3 ../../scripts/check.py motives-periods` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
