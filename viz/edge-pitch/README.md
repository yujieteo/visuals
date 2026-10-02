# Fastener edge margin and pitch visualiser (EDGEPITCH)

Exploration tool for edge distance, end distance and pitch in riveted and
bolted single-lap and double-shear sheet joints. **Not for certification**:
the page carries a permanent banner and every export repeats it. `index.html`
is one self-contained file with no dependencies that works offline.

| File | Role |
| --- | --- |
| `engine.js` | Pure calculation core: inputs and validation, the strength checks (bearing, shear-out, net section, side edge, inter-rivet buckling, maximum pitch), the geometric margins, the sweeps behind the plots, SI/US conversion, Markdown and JSON export and import, the joint's beamdswitch report (`jointReport`), test vectors and the self-test. No DOM access. Works in the browser (`EdgePitch`) and in Node (`require`). |
| `beamdswitch.js` | The standard beamdswitch report template (`deck(report)` writes a report as a beamdswitch Markdown deck); a copy of the site's shared [`templates/beamdswitch.js`](https://github.com/yujieteo/site/blob/main/templates/beamdswitch.js), kept identical by the tests |
| `template.html` | Page markup, styles, UI, the to-scale schematic, the plots and the WebMCP tools |
| `raw.json` | Checks, assumptions, scope, sources, the test-vector format and the placeholder example (published as `data.json`) |
| `build.py` | Inlines `raw.json`, `engine.js` and `beamdswitch.js` into `template.html` to write `index.html` |
| `AGENTS.md` | Notes for coding agents: where changes go (the standalone repository, where this visualisation and its tests develop; yujieteo/site holds a port of the page files), how to build and test, and the conventions. |
| `SKILLS.md` | For agents using the tool: its tasks, inputs, read-only WebMCP tools, exports and a worked example. |
| `LICENSE` | MIT. |
| `.gitignore` | Keeps Python bytecode (`__pycache__/`, `*.pyc`) and `node_modules/` out of the repository. |

```sh
python build.py   # rebuild index.html after editing template.html, engine.js, beamdswitch.js or raw.json
```

The tests are `tests/edge-pitch.test.mjs` (Node: hand calculations, bearing
interpolation end points, unit round trips, the column function branches,
validation, exports, test-vector import and the page's WebMCP tools),
`tests/edge-pitch-beamdswitch.test.mjs` (Node: the beamdswitch deck, parsed with
beamdswitch's own parsers, and its buttons) and
`tests/test_edge_pitch.py` (Python: build reproducibility and the engine self-test under Node). The page runs the same self-test on every load and shows a
pass/fail badge.

Sources. Items tagged `Niu` are marked "confirm against your copy"; no Niu
table or figure is reproduced. NASA RP-1228 (Barrett, *Fastener Design
Manual*, 1990) states a nominal edge distance of 2D, a minimum of 1.5D and a
nominal spacing of 4D (pp. 21 and 34); those defaults carry its tag. Every
other numeric default, and every starting allowable, is tagged "unsourced
default".

To check against a worked example from your own copy of Niu, import a test
vector on the page (`"kind": "edge-pitch-test-vector"`, canonical SI `inputs`,
and `expected` entries of `path`, `value` and relative `tol`); `raw.json`
gives the shape.

The beamdswitch button saves the joint as a narrated talk for
[beamdswitch](https://teoyujie.org/visuals/beamdswitch/): one Markdown deck
with the set-up, method, results (with the bearing and shear-out margins
against e/D as a plot) and checks, every number as the page shows it and a
spoken narration on every slide, written with the site's standard report
template ([`templates/beamdswitch-report.md`](https://github.com/yujieteo/site/blob/main/templates/beamdswitch-report.md)).
Copy deck puts the same deck on the clipboard; if saving is blocked, the
beamdswitch button copies it instead.
