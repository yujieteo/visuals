---
name: generate-visualization
description: Generate or refresh a self-contained D3 visualization from a local data file, website, or API response.
---

# Generate visualization

## Privacy and scope

- Never commit credentials, host details, private paths, or deployment configuration.
- Keep the fetched source unchanged in `data/<slug>/raw.csv` or `raw.json`.
- Store only a public source label, an ISO fetch date, and whether a key file was used in `meta.json`.
- Do not edit another repository, push, or deploy unless the current request asks for it.

## Workflow

1. Derive a kebab-case slug from the source. Ask only when no clear slug exists.
2. Fetch or read the source. Read credentials at runtime and never persist them.
3. Save the unchanged source and `meta.json` under `data/<slug>/`.
4. Use a compact CSV string for flat data and minimal JSON for hierarchical data.
5. Read `design-tokens.json`. Choose the chart from the data shape.
6. Generate `viz/<slug>/index.html` with inline CSS and JavaScript. The only external asset may be one pinned D3 CDN script.
7. Register read-only `get_data`, `get_metadata`, and `query` tools when `modelContext` exists. Keep the page functional without it.
8. Regenerate the root gallery by scanning `viz/*/index.html` for each page title and summary.
9. Run the generator twice, then its verification mode. Validate JSON, run `git diff --check`, and inspect all untracked files.
10. Commit only after every check passes. Report the commit, changed files, checks, source date, and limitations.

Stop if the source, slug, credentials, or requested publication target cannot be resolved safely.
