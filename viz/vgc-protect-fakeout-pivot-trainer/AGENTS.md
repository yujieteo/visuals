# AGENTS.md: Win the turn: Protect, Fake Out and pivots

A VGC turn lab built on Justin Tang's Delphox + Blastoise team in Regulation M-C: pick a position, play the turn, and see both sides' equilibrium mixes, where Protect beats Fake Out at +4 to +3, Quick Guard ties it, and a Parting Shot pivot only works when it connects. Live at <https://teoyujie.org/visuals/vgc-protect-fakeout-pivot-trainer/>.

## Source of truth

The standalone repository [yujieteo/vgc-trainer](https://github.com/yujieteo/vgc-trainer) is where this visualisation and its tests develop and where CI runs them. `visuals/vgc-protect-fakeout-pivot-trainer/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/vgc-protect-fakeout-pivot-trainer) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`.

## Files and data

| File | Role |
| --- | --- |
| `raw.json` | Team sheets, species, moves, items, the lab positions, assumptions and sources (published as `data.json`) |
| `sprites.json` | 16×16 pixel sprites drawn for this page, one per species |
| `engine.js` | The turn engine and matrix-game solver (also run by the Node test) |
| `template.html` | Page markup, styles and UI code |
| `build.py` | Inlines `raw.json`, `sprites.json` and `engine.js` into `template.html` to write `index.html` |

`index.html` is generated: edit the sources and rerun the build. Tests live in `tests/` of yujieteo/vgc-trainer: `tests/vgc-turn-lab.test.mjs` and `tests/test_vgc_turn_lab.py`.

## Build, test and verify

Run from the root of a yujieteo/vgc-trainer checkout (Python 3 standard library and Node 22; nothing to install), as CI (`.github/workflows/ci.yml`) does:

```sh
python3 build.py   # regenerate index.html
node --test 'tests/*.test.{mjs,cjs}'
python3 -m unittest discover -s tests -p 'test_*.py'   # includes a check that index.html is fresh
```

## Change workflow

Change and test this repository first, end to end (open `index.html` in a browser, pick a position, play the turn), and run no-mistakes here; then port the page files byte for byte into `visuals/vgc-protect-fakeout-pivot-trainer/` of yujieteo/site, where a second no-mistakes run covers only the site's own tests. Logic tests stay here; never add them to the site.

## Conventions

- `index.html` is one self-contained HTML file with its CSS, JavaScript, data and sprites inlined; it makes no external requests.
- Keep the engine pure (no DOM access) so Node can load it; list anything the engine does not model in `raw.json`'s `not_modelled`.
- Node tests use the built-in `node --test` runner and Python tests use `unittest`; never add Vitest, Jest or a `package.json`.
- The page has no beamdswitch deck; one added later must use the unchanged shared template, which declares `voice: bf_emma`.
