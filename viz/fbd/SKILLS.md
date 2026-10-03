---
name: fbd
description: Use FBD Drawer to draw, load, read and export scaled free body diagrams (beams, rods, lines and plates with forces, moments, distributed loads and supports) as JSON, Markdown, SVG, PNG or a beamdswitch deck.
---

# Use FBD Drawer

Live at <https://teoyujie.org/visuals/fbd/>. Draws scaled free body diagrams in which loads are data, not pictures: beams, rods, construction, dimension and leader lines and freeform plates meet at shared joints; point forces, moments, uniform to triangular distributed loads, self-weight and reactions attach to them, with pin, roller and fixed supports. Everything is stored in mm, N and N·mm and entered or shown in SI or imperial, against one rotatable axes triad with engineering and aircraft presets. There is no solver: reactions are drawn, not computed. Works by touch. To change the tool, read [AGENTS.md](AGENTS.md); for the JSON format, read [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Read what a drawing holds, its units and file format | `get_metadata` |
| Read the drawing on the page | `get_drawing` |
| Put a saved drawing on the page | `load_drawing` |
| Start from a reference drawing | `list_examples`, then `load_example` |
| Get the schedules of bodies, joints, loads and supports | `export_markdown` |
| Get the picture | `export_svg`, or File › SVG or PNG on the page |
| Keep the drawing as a talk | File › Save beamdswitch deck (or Copy beamdswitch deck) |

## Inputs

A drawing in the page's JSON format: `format: "fbd-drawer"`, `version: 1`, a `title`, `geometry` (`joints`, `bodies`, `loads`, `supports`, `markers`) in world coordinates in mm with y up and directions in degrees counter-clockwise from world +x, and `view` (display units, triad and toggles). `load_drawing` also takes the page's Markdown export, whose embedded JSON is the source of truth. Ids use only letters, digits, `_` and `-`.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | What a drawing contains, the canonical units, the JSON format and version, the axes conventions, and that there is no solver |
| `get_drawing` | none | The current drawing as JSON, in canonical units |
| `load_drawing` | `text`: JSON or Markdown saved by FBD Drawer | Replaces the drawing; an invalid file is rejected with a list of errors and nothing changes |
| `export_markdown` | none | The drawing as Markdown: an embedded SVG, schedules of bodies, joints, loads and supports (blanks as `—`), the axes definition and the full JSON |
| `export_svg` | optional `background`: `white` or `transparent` | A standalone SVG at a fit-to-content scale |
| `list_examples` | none | The reference drawings and what each tests |
| `load_example` | `id`: `cantilever`, `inclined-plane`, `simply-supported-imperial`, `aircraft-top` or `freeform-plate` | Replaces the drawing with that reference drawing |

## Exports

- **JSON:** the drawing in canonical units; loads back.
- **Markdown:** the drawing as an SVG data URI, the schedules, the axes definition and the full JSON; loads back.
- **SVG and PNG:** at a fit-to-content scale, never the screen zoom, black on white or transparent; PNG also to the clipboard.
- **beamdswitch deck:** a narrated Markdown deck of the drawing, its axes, bodies, loads, supports and dimension checks (voice `bf_emma`), for [beamdswitch](https://teoyujie.org/visuals/beamdswitch/).
- **Data:** the reference drawings are published as [data.json](https://teoyujie.org/visuals/fbd/data.json).

## Worked example

`load_example({"id": "cantilever"})` loads reference drawing 1: a 3000 mm cantilever with a fixed support, a point load, a uniform distributed load, an end moment and a dimension line. `export_markdown()` then returns its schedules, and the dimension line reads 3000 mm at any zoom and in every export.
