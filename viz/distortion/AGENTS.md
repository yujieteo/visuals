# AGENTS.md: Structural Distortion Explorer

An exaggerated, qualitative and unit-free 3D view of how axial load, shear, torsion, bending, warping, shear lag and buckling distort thin-walled structures (a circular tube, rectangular box, I-beam and stiffened panel). Not to scale, no units. Live at <https://teoyujie.org/visuals/distortion/>.

## Source of truth

This repository, [yujieteo/distortion](https://github.com/yujieteo/distortion), is the source of truth: the Structural Distortion Explorer and its tests are developed here, and its CI runs them here. `visuals/distortion/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/distortion) is a port of the page files, refreshed whenever the explorer is updated, and the site runs no logic tests for it. Porting copies this repository minus `tests/` and `.github/`, so AGENTS.md and SKILLS.md must not link into either (the site checks that their links resolve).

## Files and data

See [README.md](README.md). `kinematics.js` is the pure deformation model and beamdswitch report (no DOM, no three.js), `template.html` the page, scene and WebMCP tools, `raw.json` the published metadata (published as `data.json`), and `vendor/three.min.js` the checked-in three.js r186 bundle. `build.mjs` inlines them with `beamdswitch.js` into `template.html` to write `index.html`, which is generated.

The tests are in `tests/`, with read-only copies of beamdswitch's deck parsers and the site's shared template in `tests/fixtures/beamdswitch/`.

## Build, test and verify

From the repository root:

```sh
node build.mjs                    # regenerate index.html
node build.mjs --check            # fail if index.html is stale
node --test 'tests/*.test.{mjs,cjs}'
```

CI (`.github/workflows/ci.yml`) runs the `--check` and the tests on every push and pull request: `tests/distortion.test.mjs` (kinematics, presets, the built page and the build) and `tests/beamdswitch.test.mjs` (the beamdswitch deck). yujieteo/site runs no Structural Distortion Explorer logic tests; it only checks its ported copy as part of the site.

## Conventions

- `index.html` is one self-contained HTML file with three.js inlined; it makes no network requests and works offline.
- Label every effect as analytic or an assumed shape, and never add units or calibrated numbers.
- Tests use Node's built-in `node --test` runner only; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template (`beamdswitch.js`, a copy of the site's `templates/beamdswitch.js`) and declares `voice: bf_emma` in its front matter.
