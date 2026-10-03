# Contributing

Each visual is one folder, `viz/<slug>/`, shipped as a single standalone HTML
page. See `README.md` for the layout and commands and `SKILLS.md` for the rules.

## Change a visual

1. Change only its folder: the data, `src/` or `build.py` for a generated page
   (then run `python3 build.py` there; never hand-edit the generated
   `index.html`), or `index.html` itself when the folder has no builder.
2. Keep `visual.json` in step with the page, and the visual's tests in its own
   `tests/`.
3. Check: `python3 scripts/check.py <slug>`.

## Add a visual

Create `viz/<slug>/` with `index.html`, its data, `visual.json` and its tests.
Nothing else needs an edit: CI, the catalogue and the site find the folder.

## Rules

- Pages are self-contained: inline CSS, data, and JavaScript; no external
  assets, and mobile friendly.
- A test reads only its own visual's folder and the shared tooling.
- Never commit credentials, host details, private paths, or deployment
  configuration, and never write an absolute user-home path (macOS or Linux home prefix) in any file.
