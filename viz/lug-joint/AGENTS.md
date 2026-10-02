# Lug and pin joint calculator: notes for coding agents

Preliminary static sizing of a double-shear lug and pin joint (one male lug between two female clevis legs on a solid pin) under axial, transverse or oblique ultimate load, by AFFDL *Stress Analysis Manual* (1986) chapter 9. Live at <https://teoyujie.org/visuals/lug-joint/>; its data is
published at <https://teoyujie.org/visuals/lug-joint/data.json>.

## Where changes go

The standalone repository [yujieteo/lug-joint](https://github.com/yujieteo/lug-joint) is where this visualisation and its tests develop and where CI runs them. `visuals/lug-joint/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/lug-joint) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. The copy is byte for byte, so AGENTS.md and SKILLS.md must not link into either. `README.md` lists every file here and its role.

Change and test here first, then port. The site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md) owns the procedure: run this repository's tests, an end-to-end check of the page in a browser and the first no-mistakes pass here; then port the page files into yujieteo/site and run the second pass there with site-level tests only. Logic and browser tests stay here, never in the site; time every test you add (`time node --test tests/<file>`).

## Build, test and verify

Run these from the root of the yujieteo/lug-joint checkout. `index.html` is generated. Edit `engine.js`, `template.html`, `raw.json` or
`beamdswitch.js`, then rebuild and test:

```sh
python3 build.py
node --test tests/lug-joint.test.mjs tests/lug-joint-beamdswitch.test.mjs
python3 -m unittest discover -s tests -p 'test_lug_joint.py'
```

The Python test checks that the build is reproducible and that the engine self-tests pass under Node.

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
python3 -m unittest discover -s tests -p 'test_*.py'
```

## Data and tests

- `raw.json`: method, assumptions, scope, reference notes, examples and sources, inlined by `build.py` and published as `data.json`.
- `engine.js`: the pure calculation core (`LugJoint` in the browser, `require` in Node), including `REFERENCE_CASES`, the self-tests and the joint's beamdswitch report.
- `template.html`: markup, styles, UI code, charts and WebMCP tools.
- `tests/lug-joint.test.mjs`: the Sec. 9.6 worked example at 1%, the interaction checks, validation, unit and file round trips and the WebMCP tools.
- `tests/lug-joint-beamdswitch.test.mjs`: the beamdswitch deck, parsed with beamdswitch's own parsers, and its buttons.
- `tests/test_lug_joint.py`: build reproducibility and the engine self-tests under Node.

## Conventions

- One self-contained `index.html`, assembled by the build: no external scripts, stylesheets, fonts or network requests. It works offline.
- Never edit or hand-merge the generated `index.html`; change the sources and rerun `build.py`.
- `engine.js` has no DOM access, so it runs in the browser and in Node.
- Values are stored in N, mm and MPa whatever units are displayed. A new reference case goes in `REFERENCE_CASES` in `engine.js`; it then runs in the page's self-tests and both test suites.
- Tests use Node's built-in runner (`node --test`) and Python `unittest` only; never add Vitest, Jest, a `package.json` or another test framework.
- `beamdswitch.js` is a verbatim copy of yujieteo/site's `templates/beamdswitch.js` and is inlined unchanged; the tests check the copy against `tests/fixtures/beamdswitch/beamdswitch.js`, and the site's `tests/beamdswitch-voice.test.mjs` checks the port. Every beamdswitch deck declares the narration voice `bf_emma` in its front matter.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/lug-joint.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
