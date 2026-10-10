# Structural Distortion Explorer: data

The page of this visual is now the story `stories/distortion/` of yujieteo/site (`content/stories/distortion/index.md`).
The story reads `raw.json` through `data!("viz/distortion/raw.json")`. The site's `visuals.lock` pins one commit of
this repository and the SHA-256 of `raw.json`. Thus a change to `raw.json` has no effect on the site until the site
pins the new commit. Change the bytes of `raw.json` only together with a change to the site's `visuals.lock`. No
builder writes `raw.json`. It is the source.

| Key of `raw.json` | What the story does with it |
| --- | --- |
| `disclaimer` | It shows the notice in the first chapter. |
| `structures[].label` | They are the options of each "Shape" choice and the names of the figures. |
| `effects[]`: `id`, `label`, `basis` | It labels each effect on show "analytic" or "assumed shape". |
| `nature`, `effects[].note` | It shows them in the notes, in the table of the effects. |

The story does not use `title`, `version`, `three`, or the `id`, `type` and `boundary` of `structures`. The old page
used them in its WebMCP tools and its beamdswitch deck. Their bytes stay as the site pins them.

Label each effect as analytic or as an assumed shape. Do not add units or calibrated numbers, because the view is
qualitative and not to scale.

## History

The last commit that has the three.js page is 2b2f937. The folder is the same at 02fcb4f, which the site pins. That
commit also has these files:

- `index.html`, the page. `build.mjs` wrote it from `template.html`, `kinematics.js`, `beamdswitch.js`, `raw.json`
  and `vendor/three.min.js` (three.js r186).
- `kinematics.js`, the deformation model. The cells of the story port it to Rust, with the same constants.
- `tests/`, the Node tests. `e2e/`, the browser checks.
- `SKILLS.md`, the WebMCP tools of the page. `README.md`, the description of the page and of its three.js bundle.

Tests are disposable. Check a change end to end in the built story, and do not commit regression tests. This folder
has no checks of its own. `python3 ../../scripts/check.py distortion` runs only the repository rules. The rules for
every visual are in [SKILLS.md](../../SKILLS.md).
