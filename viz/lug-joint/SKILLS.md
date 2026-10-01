---
name: lug-joint
description: Size a double-shear lug and pin joint by AFFDL Stress Analysis Manual chapter 9 with the lug and pin joint calculator or its read-only WebMCP tools. Preliminary static sizing only.
---

# Lug and pin joint calculator

Preliminary static sizing of a double-shear lug and pin joint (one male lug between two female clevis legs on a solid pin) under axial, transverse or oblique ultimate load, by AFFDL *Stress Analysis Manual* (1986) chapter 9. Open it at <https://teoyujie.org/visuals/lug-joint/>; everything
runs in the browser and works offline. The page registers read-only WebMCP
tools through the browser's `modelContext` API when the browser offers it;
each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| Get every failure mode's allowable, safety factor and margin for a joint | `solve_joint` |
| Read the joint and results the page shows | `get_current_joint` |
| Read the method, assumptions, scope, reference notes, examples and sources | `get_metadata` |
| Run the self-tests (Sec. 9.6 worked example, Eq. 9-31 interaction) | `run_self_tests` |
| Save the joint, share it or save a narrated talk | The page's export buttons (below) |

## Inputs

- Geometry: hole diameter D, pin diameter and gap g.
- Load: ultimate load P, its angle α (0–90°) and the factors uf, ff and af.
- Pin material (FtuP, FsuP, kbP) and, for the female leg and the male lug, thickness, widths and material allowables, with an optional bushing.
- Values in N, mm and MPa (the page switches force, length and stress units separately). Fields left out take the Sec. 9.6 example values.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The method, assumptions, scope, units, disclaimer, reference notes, examples, formulas and sources. |
| `get_current_joint` | none | The page's joint (N, mm, MPa) with every failure mode's allowable, factored load, FS and MS, the controlling modes and the warnings. |
| `solve_joint` | A joint in N, mm and MPa: `geometry`, `load`, `pin`, `female`, `male`; `null` clears a field | Every failure mode, the controlling ultimate and yield modes, the joint allowable and warnings, or the blocking errors. Does not change the page. |
| `run_self_tests` | none | `passed`, `total` and each self-test result. |

## Exports

- JSON: Save JSON (`lug-joint.json`) and Load JSON; Copy link keeps the inputs in the URL.
- beamdswitch deck (`lug-joint-beamdswitch.md`): set-up, method, results (with the Eq. 9-31 interaction curve) and checks, narrated; Copy deck puts it on the clipboard.
- Print, for a paper or PDF copy of the page.

## Worked example

Call `solve_joint` with `{}` to solve the chapter's Sec. 9.6 example. It returns
a joint allowable `Pall` of about 168346 N (about 37900 lbf, Eq. 9-19b, weak
pin); the controlling ultimate mode is “Pin bending, stage 2 (load shift)”
(Eqs. 9-16 to 9-18) with MS 0.097, and the controlling yield mode is the male
lug's bushing bearing.

## Rules

1. Quote the tool's own numbers; do not re-derive them by hand.
2. Results are preliminary static sizing; each formula is flagged “not cross-checked” until a Bruhn or Niu reference is entered on the page.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md); for each file's role, [README.md](README.md).
