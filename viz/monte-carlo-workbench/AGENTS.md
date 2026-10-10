# Monte Carlo Probability Workbench: data

The page of this visual is now 4 notebooks of yujieteo/site. Each notebook reads some of the files in `data/`
through the site's `visuals.lock`:

| Notebook | Source in yujieteo/site | Data files that it reads |
| --- | --- | --- |
| `play/mclaws/` | `content/play/mclaws/index.md` | `laws.json`, `theory.json`, `glossary.json`, `limits.json` |
| `play/mcmodels/` | `content/play/mcmodels/index.md` | `models.json`, `methods.json`, `datasets.json`, `groups.json`, `laws.json`, `interview.json` (the guided interview) |
| `play/mcchains/` | `content/play/mcchains/index.md` | `chains.json` (the Markov chain, sequential and quasi-Monte Carlo lab), `rare.json` (the rare-event lab), `datasets.json` |
| `play/mcphysics/` | `content/play/mcphysics/index.md` | `physics.json` (the statistical-physics lab) |

`site_page` in `visual.json` names the first notebook.

## Pinned files

The site's `visuals.lock` pins one commit of this repository and the SHA-256 of each file that a notebook reads.
Thus a change to a data file has no effect on the site until the site pins the new commit. Change the bytes of a
pinned file only together with a change to the site's `visuals.lock`. The site does not read `raw.json`.

## History

The last commit that has the JavaScript page is 02fcb4f. That commit also has these files:

- `build.py`, the Python builder of the page and of `raw.json`.
- `src/` and `tests/`, the engine of the page and its Node tests.
- `e2e/`, the browser checks.
- `SKILLS.md`, the WebMCP tools of the page.
- `spec.md`, the specification of the owner.

The notebooks port that page. The data keep these rules of the specification:

- Every law has 3 workflows of its own.
- Every method has a suitable example, a failure example and a comparison.
- Every result has a claim tag: theorem, numerical approximation or finite-run observation.
- A notebook never shows a moment that does not exist as a number.
- Synthetic data name the model that makes them. Synthetic parameters are illustrative, never calibrated evidence.

## Builder

The builder is a Rust crate (`Cargo.toml`, `src/`). It writes `raw.json`, the catalogue of the 12 data files,
with the same bytes as `build.py` wrote. `raw.json` holds `format` and `version`, then each data file under its
name, in the order of `DATA` in `src/main.rs`. `src/py.rs` writes JSON as Python's
`json.dumps(value, ensure_ascii=False, indent=1)` does. The repository's `rust-toolchain.toml` pins the compiler.
Run these commands from this folder:

| Command | Result |
| --- | --- |
| `cargo run --release` | It writes `raw.json`. |
| `cargo run --release -- --verify` | It checks that `raw.json` is current and writes nothing. |

After a change to a data file, run `cargo run --release`. The check of this visual is `cargo run --release -- --verify`. Tests are disposable: check a change end to end in the built page, and do not commit regression tests. Do not edit
`raw.json` by hand. `python3 ../../scripts/check.py monte-carlo-workbench` runs the checks of this visual. The rules
for every visual are in [SKILLS.md](../../SKILLS.md).
