# Beam diagram creator (beamdiag)

The folder is a sealed artifact (`"sealed": true` in `visual.json`). The crate in it, with `look/` (the site's
theme, fonts and header), builds `index.html`: the whole page, with the solver compiled to WebAssembly and
inlined. The Beam diagram notebook of yujieteo/site (`content/play/beamdiag/index.md`, at
`teoyujie.org/play/beamdiag/`) embeds that page and reads the three data files of this folder. The site's
`visuals.lock` pins the SHA-256 of all four, so a change here takes effect only when the site pins the new commit.

Never hand-edit `index.html`. After a change to `src/`, `look/` or `raw.json`, rebuild it from the repository root:

```sh
cargo build --release --target wasm32-unknown-unknown -p beamdiag --lib
cargo run --release -q -p beamdiag --bin page -- target/wasm32-unknown-unknown/release/beamdiag.wasm viz/beamdiag/index.html
```

The checks in `visual.json` rebuild the page and compare it with `index.html`. Tests are disposable: check a change end to end in the built page, and do not commit regression tests. In an iframe (the site's embed), the page hides its header and title, and follows the site's
mode and theme. The WebMCP tools are in `src/tools.json`; `visual.json` names the same tools.

| File | Holds |
| --- | --- |
| `raw.json` | The page data: unit conventions, assumptions, the method, the sources and the Nastran cards. |
| `fixtures.json` | The test beams: pin–pin, fixed–fixed, propped, cantilever, overhang and continuous layouts, up to forty supports, with closed forms where they exist. |
| `reference.json` | The answers of `reference.py`, an exact rational solver by Macaulay integration with only the Python standard library, frozen on 2026-10-10. |
| `random.json` | Seeded random beams with the answers of `reference.py`, frozen on 2026-10-10. |
| `src/` | The page in Rust: the stiffness solver (`engine.rs`), the hand calculations, the figure, the PDF, deck and Nastran exports, the page's events (`app.rs`), the WebAssembly entry (`wasm.rs`) and the page builder (`bin/page.rs`). |

`reference.py`, the old JavaScript page, its builder and its tests are in Git history: the last commit
that has them is 32181d1. Never edit `reference.json` by hand. To add a case, restore `reference.py` from
that commit, add the beam to `fixtures.json`, run it, and commit both files.

Loads are positive upward, couples counter-clockwise, and M is positive when sagging. The data is in SI
(m, N, Pa).
