# Sectionlab: data

The page of this visual is now the notebook `play/sectionlab/` of yujieteo/site (`content/play/sectionlab/index.md`).
Its solver is Rust in the cells of the notebook. The notebook reads 2 files of this folder through the site's
`visuals.lock`:

| File | What the notebook reads |
| --- | --- |
| `raw.json` | The notice, the 9 examples (`presets`), the 4 library materials, the method, the conventions, the assumptions and the sources. |
| `reference/torsion-accuracy.json` | The stated and the measured accuracy of each torsion formula. The notebook gives J only from a formula that passes in this file. |

Units are mm, MPa, N and N·mm. Keep the notice "Verify independently" in `raw.json`. Do not say that the results
agree with a design code.

## Pinned files

The site's `visuals.lock` pins one commit of this repository and the SHA-256 of `raw.json` and
`reference/torsion-accuracy.json`. Thus a change to these 2 files has no effect on the site until the site pins a
new commit. Change their bytes only together with a change to the site's `visuals.lock`. No builder writes
`raw.json`: it is the source.

## Model format

`raw.json` (`presets[].model`) and `reference/fixtures.json` (`cases[].model`) keep each section as a model:

- `sectionlab`: the format version, 1. `title`: the name of the section.
- `E_base`: the modulus in MPa for the transformed composite properties. If it is missing, `E_base` is the `E` of
  the first material.
- `materials`: `id`, `name`, `E`, `sigma02` (the 0.2% proof stress), `n` (the Ramberg–Osgood exponent, 1 to 200),
  `eps_lim` (the strain limit) and an optional `compression` with the same 4 values for ε < 0.
- `parts`: `id`, `shape`, `dims`, `radii` (1 for each corner, in the order of the table below, 0 = sharp), `x` and
  `y` (the centre of the bounding box), `orientation` (0 or 90, counter-clockwise), `material` and `void`. A void
  has the material `null` and uses the material of its host part.
- `plastic`: `axis` (`x`, `y`, `major` or `minor`), `N` (the axial force, + is tension) and `solve`. With
  `zero-cross` (b), the neutral axis turns until the cross moment is zero. With `fixed-axis` (a), it stays
  parallel to the axis.

Solid parts can touch, but they must not overlap. A void must be fully inside 1 solid part, and voids must not
overlap. On each edge, the tangent lengths of the 2 fillets must not be more than the length of the edge.

| id | Dimensions | Corners (radii order) |
| --- | --- | --- |
| `rect` | b, h | bottom left, bottom right, top right, top left |
| `circle` | d | none |
| `semicircle` | d (flat side down) | none |
| `triangle` | b, h, a (apex from the left end of the base; any value) | bottom left, bottom right, apex |
| `trapezoid` | b (bottom), bt (top), h, s (top shift; any value) | bottom left, bottom right, top right, top left |
| `polygon` | n (3–12 sides, flat bottom), d (across corners) | corner 1 … n, counter-clockwise from bottom left |
| `rhs` | b, h, t | outer ×4, then inner ×4, each bottom left → top left |
| `chs` | d, t | none |
| `ishape` | b, h, tf, tw (parallel flanges) | bottom-left outer, bottom-right outer, bottom-right flange tip, bottom-right root, top-right root, top-right flange tip, top-right outer, top-left outer, top-left flange tip, top-left root, bottom-left root, bottom-left flange tip |
| `channel` | b, h, tf, tw (web on the left) | bottom back, bottom toe, bottom flange tip, bottom root, top root, top flange tip, top toe, top back |
| `angle` | b (horizontal leg), h (vertical leg), t | heel, horizontal toe, horizontal toe tip, root, vertical toe tip, vertical toe |
| `tee` | b, h, tf, tw (flange on top) | stem bottom left, stem bottom right, right root, right flange tip, right outer, left outer, left flange tip, left root |
| `zed` | b, h, tf, tw (bottom flange right, top flange left) | bottom back, bottom toe, bottom flange tip, bottom root, top back, top toe, top flange tip, top root |
| `cross` | b, h, tb (horizontal bar), th (vertical bar) | right end bottom, right end top, top-right root, top end right, top end left, top-left root, left end top, left end bottom, bottom-left root, bottom end left, bottom end right, bottom-right root |
| `cfangle` | b, h, t, ri (cold-formed; heel bottom-left) | none: bends are ri inside and ri + t outside |
| `cfchannel` | h, b, c (lip; 0 = plain), t, ri (web left, lips turned in) | none |
| `cfzed` | h, b, c (lip; 0 = plain), t, ri (bottom flange right, top flange left) | none |
| `cfhat` | h, b (crown), f (flange overhang beyond the crown), t, ri | none |

## Fixtures

The 3 JSON files in `reference/` are the frozen answers of the Python references. Do not change them:

- `fixtures.json`: 30 cases. Each case has its model and its closed-form values.
- `reference.json`: for each case, the 18 section properties from an exact decomposition into polygons, circular
  segments and disks. For the 27 plastic cases, it also has the angle, κ_lim, M_lim, 9 points of the M–κ curve to
  ε_lim, and M_p (and M_p(N) if N is not 0) from a width integration with 400-point Gauss–Legendre.
- `torsion-accuracy.json`: for each of the 9 torsion formulas, the method, the stated accuracy, the largest measured
  relative error and each case, with `J_formula` and `J_reference`. The reference is the Prandtl stress function,
  solved with linear finite elements and Richardson extrapolation.

A port compares its results with these files to the tolerances of the old tests:

| Result | Relative tolerance |
| --- | --- |
| Section properties against `reference.json`, closed-form values in `fixtures.json` | 1e-9 |
| κ_lim, M_lim, M_p, M_p(N) and the points of the curve | 1e-6 |
| J against `J_formula` in `torsion-accuracy.json` (the file keeps 10 digits) | 1e-9 |

A relative difference uses the larger of the 2 values and the scale of the section: √A to the power of the length
dimension of the property, and M_lim for the moments of the curve.

## History

The last commit that has the Python references (`reference/*.py`) and the old JavaScript page is 7e44130. The folder
is the same at 02fcb4f, which the site pins. That commit also has `build.py`, `template.html`, the engine in `src/`,
`tests/`, `e2e/`, `docs/`, `SKILLS.md` and `playbooks/`.

To add a case, or to measure a torsion formula again:

1. From this folder, restore the references: `git restore --source=7e44130 -- 'reference/*.py' src/torsion.js`.
2. Make a throwaway virtual environment with numpy and scipy. `torsion_accuracy.py` also needs Node.
3. Add the case to `reference/cases.py`. Then run `python3 reference/build_reference.py`, which writes
   `fixtures.json` and `reference.json`.
4. For a torsion formula, change `src/torsion.js`. Then run `python3 reference/torsion_accuracy.py`, which writes
   `torsion-accuracy.json` (about 30 s).
5. Delete the restored files (`rm -r src reference/*.py`), and commit only the JSON files. If a pinned file
   changes, change the site's `visuals.lock` and the notebook too.

## Tests

Tests are disposable. A port compares its results with the fixtures in a throwaway test outside the repository, and
commits no test. The real test is end to end, in the built page of the site. This folder has no checks of its own:
`python3 ../../scripts/check.py sectionlab` runs only the repository rules. The rules for every visual are in
[SKILLS.md](../../SKILLS.md).
