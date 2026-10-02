---
name: generate-visualization
description: Router for the visuals repo: create, refresh, edit, or verify a story-first, dependency-free visualization. Load the matching sub-skill only.
---

# Visuals router

One standalone page per story: `data/<slug>/` (unchanged source + `meta.json`) -> `scripts/build*.py` -> `viz/<slug>/index.html` + root `index.html` gallery. Layout and commands: `README.md`.

## Where each visualization develops

- The 18 slugs in `MIRRORS` in `tests/test_mirror_docs.py` develop in their standalone `yujieteo/<repo>` repository, which holds their logic, deck and end-to-end tests and CI. `viz/<slug>/` and `data/<slug>/` are byte-for-byte ports of its page and data files (listed in that folder's `AGENTS.md`), and `viz/<slug>/AGENTS.md` stays identical to that repository's copy. A page with a builder is still generated here: change the data or builder, regenerate, copy the result into the standalone repository and pass its tests before landing here. `convex-payoffs` and `fpl-expected-goals` have no builder: edit them in their repository and port the files unchanged.
- yujieteo/site publishes each of those pages (except `tampines-food-map`, an older version of the site's own `tampines-food` page that the site does not publish) at the commit of this repository pinned in its `data/visuals/<slug>.pin`. Land the change here first; updating the pin is a site pull request.
- The three slugs in `EXCLUDED` are stale copies: their current versions live in yujieteo/site `visuals/`. Do not develop them here.

## Always

- Never commit credentials, host details, private paths, or deployment config. Never write an absolute user-home path (macOS or Linux home prefix) in any file; `build.py --verify` scans every file for it.
- `viz/<slug>/index.html` and root `index.html` are generated: never hand-edit; change data, `design-tokens.json`, or the builder, then regenerate.
- Every `viz/<slug>/beamdswitch.js` stays byte-identical to yujieteo/site `templates/beamdswitch.js`.
- Tests use `node --test` and Python `unittest` only; the test-cost rules are in `.agents/skills/visuals-verify-ci/SKILL.md`.
- Do not edit another repo, push, or deploy unless asked.

## Playbook: load one sub-skill by task

| Task | Load |
| --- | --- |
| Add a new visualization from a dataset, site, or API | `.agents/skills/visuals-new-visualization/SKILL.md` |
| Refresh data or regenerate an existing page or gallery | `.agents/skills/visuals-refresh-data/SKILL.md` |
| Change page markup, design tokens, interactions, or model-context tools | `.agents/skills/visuals-page-conventions/SKILL.md` |
| Run verifiers, fix a failing check, edit CI, document a new builder | `.agents/skills/visuals-verify-ci/SKILL.md` |

Quick check for any change: `for s in scripts/build*.py; do python3 "$s" --verify || break; done`
