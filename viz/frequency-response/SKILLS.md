---
name: frequency-response
description: Analyse a SISO or MIMO feedback loop in the frequency domain (margins, sensitivity peaks, closed-loop poles, Nyquist counts) with the Frequency-Response Visualiser or its read-only WebMCP tools. Exploration only, not a verified control-design toolchain.
---

# Frequency-Response Visualiser

An exploration tool for linear feedback loops in the frequency domain: SISO or MIMO, continuous or discrete time, with Bode, singular-value, Nyquist, Nichols and pole-zero views and their margins. Not a substitute for a verified control-design toolchain. Open it at <https://teoyujie.org/visuals/frequency-response/>; everything
runs in the browser and works offline. The page registers read-only WebMCP
tools through the browser's `modelContext` API when the browser offers it;
each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| Get gain, phase and delay margins, Ms, Mt, bandwidth and closed-loop poles for a loop | `analyze_loop` |
| Read the loop and results the page shows | `get_current_system` |
| Read the scope, conventions, presets and threshold defaults | `get_metadata` |
| Run the analytic self-tests | `run_self_tests` |
| Save a report, data or plots | The page's export buttons (below) |

## Inputs

- SISO: plant G and controller C as a transfer function, zeros-poles-gain or a preset; loop gain K; delay τ in seconds (continuous) or whole samples (discrete).
- Continuous or discrete time; in discrete time the sample time Ts and, per block, ZOH, Tustin (with optional prewarp), forward or backward Euler, or entry in z.
- MIMO (up to 6 × 6): plant in state space or a transfer matrix, controller as a gain, state space or transfer matrix, and where the loop is broken.
- Units are canonical: rad/s and seconds. Anything left out takes the default example K/(s(s+1)(s+2)) with K = 3.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The scope, conventions, assumptions, sources, presets, threshold defaults and disclaimer. |
| `get_current_system` | none | The page's loop (canonical inputs) with its margins, crossovers, sensitivity peaks, closed-loop poles, threshold checks and warnings. |
| `analyze_loop` | A loop: `system`, `plant`, `controller`, `K`, `delay` or `delaySamples`, `timeDomain`, `Ts`, `discretization`, `mimo` | SISO: gain, phase and delay margins, Ms, Mt, bandwidth, closed-loop poles and the Nyquist count N, P, Z with its cross-check. MIMO: closed-loop eigenvalues, the generalised Nyquist count on det(I + L) and the multivariable margins. Or the blocking errors. Does not change the page. |
| `run_self_tests` | none | `passed`, `total` and each analytic self-test with its tolerance. |

## Exports

- Markdown report (`frequency-response-report.md`).
- JSON: results (`frequency-response-results.json`) and inputs (`frequency-response-inputs.json`); the page imports its own JSON.
- CSV for the Bode, Nyquist, Nichols and eigenvalue-locus data, and SVG of the Bode, Nyquist, Nichols and pole-zero plots (images); each downloads or copies.
- No beamdswitch deck.

## Worked example

Call `analyze_loop` with the default plant at twice the default gain:

```json
{"plant": {"form": "tf", "num": [1], "den": [1, 3, 2, 0]}, "K": 6}
```

It returns a phase crossover at ω = 1.414 rad/s (√2) with a gain margin of
0 dB and a phase margin of 0°; the closed-loop poles are −3 and ±j1.414,
so `closed_loop.verdict` is “marginal”: K = 6 is the critical gain.

## Rules

1. Quote the tool's own numbers; do not re-derive them by hand.
2. Quote the disclaimer with any result. Margin thresholds are user inputs whose pre-filled values are unsourced defaults.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md).
