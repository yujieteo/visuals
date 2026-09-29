---
name: visuals-new-visualization
description: Add a new story-first visualization to the visuals repo from a local file, website, or API response.
---

# New visualization

1. Derive a kebab-case slug from the source; use `visualization` as fallback. Never ask for a slug.
2. Fetch or read the source. Read credentials at runtime and never persist them.
3. Save the unchanged source as `data/<slug>/raw.csv` or `raw.json`, plus `data/<slug>/meta.json` (public source label or URL, ISO fetch date, whether a key file was used).
4. Survey every field before choosing a story: role, cardinality, null rate, samples. For non-trivial free text also record lengths, term frequencies, entropy, near-duplicates; treat qualifying text as a primary subject. Otherwise use entropy, concentration, and cardinality surprises.
5. Enumerate two to four candidates internally, each naming its question, fields, and representation. Select by surprise, then write one disputable sentence about the data before choosing the representation.
6. Run exactly one critique: "Is this the most interesting thing in the data, or just the easiest thing to visualize?" If it fails, pick one other candidate, then commit. Never abstain.
7. Write `scripts/build_<slug>.py` (stdlib only; copy the closest existing builder such as `build_energy_email_productivity.py`) that renders `viz/<slug>/index.html`, rebuilds the root gallery with `render_gallery` from `scripts/gallery.py` (import it; never copy the gallery code), and supports `--verify`. Page rules: `.agents/skills/visuals-page-conventions/SKILL.md`.
8. Register the builder: `.agents/skills/visuals-verify-ci/SKILL.md`. Add a row to the README visualization table (keep it sorted by slug).
9. Run the builder twice (output must be identical), then `--verify`. Validate JSON, run `git diff --check`, inspect all untracked files.
10. Commit only after every check passes. Report the commit, changed files, checks, source date, and limitations.

Stop if the source, required credentials, or publication target cannot be resolved safely.
