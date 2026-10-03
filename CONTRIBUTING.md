# Contributing

Each visual is one folder, `viz/<slug>/`, shipped as a single standalone HTML
page. See `README.md` for the layout and commands and `SKILLS.md` for the rules.

## Change a visual

1. Change only its folder: the data, `src/` or `build.py` for a generated page
   (then run `python3 build.py` there; never hand-edit the generated
   `index.html`), or `index.html` itself when the folder has no builder.
2. Keep `visual.json` in step with the page, and the visual's tests in its own
   `tests/`.
3. Check: `npm ci` once, then `python3 scripts/check.py <slug>`. It runs the
   visual's tests and the rules that need no reading: the beamdswitch template
   copies, the page's requests, colour contrast, and dead code. Fix what it
   reports; `allow` in `visual.json` is only for a finding kept on purpose.

## Add a visual

Run `python3 scripts/new_visual.py <slug> --title "..." --summary "..."` (add
`--mathjax` or `--3d` when the visual needs them), then replace the starter
model, views, report and data with the domain and run `python3 build.py` in
the folder. `SKILLS.md` says what the generator writes and what stays manual.
Nothing else needs an edit: CI, the catalogue and the site find the folder.

## Rules

- Pages are self-contained: inline CSS, data, and JavaScript; no external
  assets, and mobile friendly.
- A test reads only its own visual's folder and the shared tooling.
- Never commit credentials, host details, private paths, or deployment
  configuration, and never write an absolute user-home path (macOS or Linux home prefix) in any file.
- Never commit `__pycache__/`, `*.pyc`, `.DS_Store` or AppleDouble `._*` files;
  `python3 scripts/check_repo.py` fails on them. On macOS, run `tar` with
  `COPYFILE_DISABLE=1`.
