# Contributing

Each visualization is one story from one dataset, shipped as a single
standalone HTML page. See `README.md` for the layout and commands.

## Change an existing visualization

1. Change the source data in `data/<slug>/`, `design-tokens.json`, or the
   builder in `scripts/`. Do not hand-edit `viz/<slug>/index.html` or the root
   `index.html`; they are generated.
2. Regenerate: `python3 scripts/<builder>.py` (see the Generation list in
   `README.md`). Running it twice must leave no further diff.
3. Verify: `for s in scripts/build*.py; do python3 "$s" --verify || break; done`.

## Add a visualization

- Save the unchanged source as `data/<slug>/raw.csv` or `raw.json`, with a
  `meta.json` holding the public source label or URL, the ISO fetch date, and
  whether a key file was used.
- Add `scripts/build_<slug>.py` (standard library only, with a `--verify` mode),
  modelled on an existing builder.
- Add the builder to `.github/workflows/verify.yml` and to the README Generation
  and Verification lists, and add a row to the README visualization table
  (sorted by slug).
- The workflow that agents follow is in `.agents/skills/visuals-new-visualization/SKILL.md`.

## Rules

- Pages are self-contained: inline CSS, data, and JavaScript; no external
  assets, and mobile friendly.
- Never commit credentials, host details, private paths, or deployment
  configuration, and never write an absolute user-home path (macOS or Linux home prefix) in any file.
