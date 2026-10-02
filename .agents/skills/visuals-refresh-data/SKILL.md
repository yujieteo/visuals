---
name: visuals-refresh-data
description: Refresh source data or regenerate an existing visualization page or the root gallery in the visuals repo.
---

# Refresh or regenerate

Builders are dependency-free (`python3 scripts/<builder>`). Running without `--verify` writes the page and rebuilds the root gallery from every `viz/*/index.html`; run twice and confirm the second run changes nothing (`git diff --stat`).

The slug → builder mapping lives in the README Visualizations table (kept sorted by slug). `haze-singapore` is the one refresh exception: run `fetch_haze.py` (from data.gov.sg) first, and `build_haze_singapore.py` also rewrites its README table row. `convex-payoffs` and `fpl-expected-goals` have no builder. For a slug ported from a standalone repository, the order between that repository and this one is in `SKILLS.md` (Where each visualization develops).

Rules:
- Keep fetched source unchanged; update `fetched` in `data/<slug>/meta.json`.
- Editorial text in some builders is derived from the numbers, so a data refresh may rewrite claims; check the diff of the page.
- The README slug/builder/story table is parsed by `build_haze_singapore.py`: keep its header `| Slug | Builder | Story |` and one `` | `slug` | `` row per line, sorted.
- Finish with `.agents/skills/visuals-verify-ci/SKILL.md`.
