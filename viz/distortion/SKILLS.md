---
name: distortion
description: Use the Structural Distortion Explorer to show, qualitatively and without units, how axial load, shear, torsion, bending, warping, shear lag and buckling distort a tube, box, I-beam or stiffened panel, read the strain of a skin patch, and save the view as a beamdswitch deck.
---

# Use the Structural Distortion Explorer

Live at <https://teoyujie.org/visuals/distortion/>. An exaggerated, qualitative and unit-free 3D view of a cantilevered circular tube, rectangular box and I-beam, and a stiffened panel with toggleable stringers and frames. A draggable, rotatable amber patch of skin has a synced 2D inset with principal arrows and the shear-angle arc. Every effect is labelled analytic or assumed shape. **Not to scale, no units**: never quote its output as a number for a real structure. To change the tool, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Show a load case or preset | `set_view`, or the Controls panel |
| Read the structure, loads, patch strain and which plates have buckled | `get_current_view` |
| Read the disclaimer, structures, effects (analytic or assumed), presets and three.js release | `get_metadata` |
| Keep the view as a talk | the beamdswitch button (or Copy deck) |

## Inputs

A preset id (`torsion`, `pure-shear`, `shear-buckling`, `shear-lag`, `compression`, `tension-torsion`), or any of: `structure` (`tube`, `box`, `ibeam`, `panel`), `loads` {`axial`, `shear`, `torsion`, `bending`, `inplane`} each −1 to 1, `exaggeration` 0.5 to 3, `warpingRestraint`, `stringers`, `frames`, `colourMap` (`none`, `shear`, `axial`, `warping`) and `patch` {`along` 0-1, `around` 0-1, `angle` 0-90}.

## WebMCP tools

`get_metadata` and `get_current_view` are read-only; `set_view` changes the page.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The disclaimer, structures, every effect with whether it is analytic or an assumed shape, the presets and the inlined three.js release |
| `get_current_view` | none | Structure, loads, toggles, patch position and its strain (principal directions, shear angle), which plates have buckled, each load's buckling onset and the effects on show |
| `set_view` | the inputs above | The new view, as `get_current_view` returns it |

## Exports

- **beamdswitch deck:** `distortion-<structure>-beamdswitch.md`, a narrated Markdown deck of the view in the page's own words (voice `bf_emma`), or Copy deck.
- **Data:** the effects and their nature are published as [data.json](https://teoyujie.org/visuals/distortion/data.json).

## Worked example

`set_view({"preset": "shear-buckling"})` loads the shear-buckling preset; `get_current_view()` then says which plates have buckled and where each load's buckling onset lies. `set_view({"structure": "box", "loads": {"bending": 1}, "colourMap": "axial"})` shows bending of the box with shear lag in its flanges, which the effects list labels an assumed shape.
