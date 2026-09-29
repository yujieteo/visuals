---
name: generate-visualization
description: Router for the visuals repo: create, refresh, edit, or verify a story-first, dependency-free visualization. Load the matching sub-skill only.
---

# Visuals router

One standalone page per story: `data/<slug>/` (unchanged source + `meta.json`) -> `scripts/build*.py` -> `viz/<slug>/index.html` + root `index.html` gallery. Layout and commands: `README.md`.

## Always

- Never commit credentials, host details, private paths, or deployment config. Never write an absolute user-home path (macOS or Linux home prefix) in any file; `build.py --verify` scans every file for it.
- `viz/<slug>/index.html` and root `index.html` are generated: never hand-edit; change data, `design-tokens.json`, or the builder, then regenerate.
- Do not edit another repo, push, or deploy unless asked.
- `convex-payoffs` and `fpl-expected-goals` have no builder; edit their pages and data directly.

## Playbook: load one sub-skill by task

| Task | Load |
| --- | --- |
| Add a new visualization from a dataset, site, or API | `.agents/skills/visuals-new-visualization/SKILL.md` |
| Refresh data or regenerate an existing page or gallery | `.agents/skills/visuals-refresh-data/SKILL.md` |
| Change page markup, design tokens, interactions, or model-context tools | `.agents/skills/visuals-page-conventions/SKILL.md` |
| Run verifiers, fix a failing check, edit CI, register a new builder | `.agents/skills/visuals-verify-ci/SKILL.md` |

Quick check for any change: `for s in scripts/build*.py; do python3 "$s" --verify || break; done`
