---
name: phasors
description: Analyse a series or parallel RLC circuit in sinusoidal steady state (impedance, phase, phasors, power, resonance) with the Phasor and Impedance Visualiser or its read-only WebMCP tools.
---

# Phasor and Impedance Visualiser

What a series or parallel RLC circuit does in sinusoidal steady state: a rotating phasor diagram, the impedance (and admittance) plane, waveforms and an optional power triangle, with every number in a readout. Open it at <https://teoyujie.org/visuals/phasors/>; everything
runs in the browser and works offline. The page registers read-only WebMCP
tools through the browser's `modelContext` API when the browser offers it;
each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| Get impedance, admittance, phase, phasors, power and resonance for a circuit | `analyze_circuit` |
| Read the circuit and every readout the page shows | `get_current_circuit` |
| Read the scope, conventions, presets, input ranges and sources | `get_metadata` |
| Run the self-tests | `run_self_tests` |
| Save a report, deck, JSON or diagrams | The page's export buttons (below) |

## Inputs

- Series or parallel mode, with R, L and C each switched on or off.
- R (0.1–10000 Ω), L (1 µH–10 H), C (1 nF–10 mF), frequency (1 Hz–1 MHz) and source voltage (0.1–1000 V RMS).
- Missing fields take the default state: series RLC, R 100 Ω, L 10 mH, C 1 µF, f 2400 Hz, V 10 V. The circuit is also kept in the page URL.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The scope, conventions, presets, input ranges, default state, degenerate cases and sources. |
| `get_current_circuit` | none | The page's circuit (canonical inputs and display options) with every readout value, flags and warnings. |
| `analyze_circuit` | `mode`, `R_on`, `L_on`, `C_on`, `R`, `L`, `C`, `f`, `V` (canonical units) | Impedance, admittance, phase, current, the phasors, real, reactive and apparent power, power factor, resonant frequency, quality factor, flags and a sentence on lag or lead; or validation errors. Does not change the page. |
| `run_self_tests` | none | `passed`, `total` and each self-test result. |

## Exports

- Markdown report (`phasors-report.md`).
- beamdswitch deck (`phasors-deck.md`) with the diagrams embedded as SVG, narrated.
- JSON (`phasors-circuit.json`).
- SVG images of the phasor, impedance, admittance, waveform and power diagrams.

## Worked example

Call `analyze_circuit` with `{}` for the default series RLC circuit. It returns
Z = 100 + j84.5 Ω (|Z| 130.9 Ω), phase 40.2°, current 76.4 mA, V_L 11.5 V,
power factor 0.764 lagging, resonance at 1591.5 Hz, and the sentence “Current
lags voltage by 40.2°: inductive.”

## Rules

1. Quote the tool's own numbers; do not re-derive them by hand.
2. Components are ideal. At resonance with R off, values the page reports as unbounded come back as `null` with a flag; do not replace them with a number.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md); for each file's role, [README.md](README.md).
