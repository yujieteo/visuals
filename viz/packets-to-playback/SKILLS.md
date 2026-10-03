---
name: packets-to-playback
description: Choose the bitrate of the next live-stream segment from stall risk and delay, and read the renormalisation-group flow of a synthetic throughput trace, on From Packets to Playback or through its read-only WebMCP tools.
---

# From Packets to Playback

Probability, information and renormalisation in a live stream: a streaming calculator chooses the bitrate of the next segment, and Show why unfolds the Euclidean field-theory notation behind it as a language for probability and information theory. Every trace is synthetic and seeded. Open it at <https://teoyujie.org/visuals/packets-to-playback/>; everything
runs in the browser and works offline. The page registers read-only WebMCP
tools through the browser's `modelContext` API when the browser offers it;
each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| Evaluate the four quality rungs for a streaming scenario and get the recommended one | `evaluate_bitrate` |
| Get the coarse-graining (RG) flow of the synthetic throughput trace | `get_rg_flow` |
| Read the scenario, recommendation and guided step the page shows | `get_current_state` |
| Read the rungs, presets, tail models, limits, constants and assumptions | `get_metadata` |
| Save the decision as a narrated talk | The page's beamdswitch or Copy deck button |

## Inputs

- A preset (live football, movie or video call) or the scenario itself: buffer and live delay (s), recent throughput (Mbps), variability (cv), persistence (ρ), tail family and its parameter, packet loss and the current rung.
- Every trace is synthetic and seeded; no input is a measurement of a real network.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title and URL, rungs, presets, candidate tail families, limits, the synthetic model's constants and its assumptions. |
| `get_current_state` | none | The page's scenario, the recommended next quality, every rung's stall probability, delay and utility, the guided step, mode and resolution. |
| `evaluate_bitrate` | A scenario: `preset`, `buffer`, `latency`, `mbps`, `cv`, `rho`, `family`, `param`, `loss`, `current` | The scenario, the recommended rung and headline, and for each of 4K, 1080p, 720p and 480p the median segment time, stall probability P(T > B), expected live delay, quality and utility. |
| `get_rg_flow` | The same scenario fields | Each block length's sample statistics, the truncated Gaussian AR(1) couplings g2 and g-gradient, excess kurtosis and KL divergence to the Gaussian projection, labelled as an approximation. |

## Exports

- beamdswitch deck (`packets-to-playback-beamdswitch.md`) from the beamdswitch button; Copy deck puts it on the clipboard.
- JSON: `raw.json`, published as `data.json`, holds the initial scenario, rungs, presets, candidate models, limits, constants and assumptions.

## Worked example

Call `evaluate_bitrate` with `{"preset": "movie"}`. It returns `recommended`
“2160p” with the headline “Switch up to 4K: about 9.0 s to download, stall risk
1.6%, live delay about 30 s.”; the 4K rung has stall probability 0.016 and
utility 0.872, ahead of 1080p at 0.840.

## Rules

1. Quote the tool's own numbers; do not re-derive them by hand.
2. The decision model is explanatory, not a production ABR algorithm, and every trace is synthetic; say so when quoting results.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md); for each file's role, [README.md](README.md).
