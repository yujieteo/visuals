---
name: breeden-litzenberger-density
description: Use the The risk-neutral density is the curvature of the call-price curve visualisation and its read-only WebMCP tools to answer questions from its embedded data or export a narrated beamdswitch deck.
---

# The risk-neutral density is the curvature of the call-price curve

Synthetic Black-Scholes call prices plotted against strike, with the risk-neutral density as e^rT times their second derivative and a butterfly-spread cross-check. Synthetic data, not market prices.

Open `index.html` in a browser, or https://teoyujie.org/visuals/breeden-litzenberger-density/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Read the call price and density at a strike | `query` with `filter.strike`, or drag the strike on the chart |
| Get the full curves and butterfly cross-check | `get_data` |
| Explain the Breeden-Litzenberger result as a talk | beamdswitch or Copy deck for the selected strike |

## Inputs

- Embedded data: a synthetic Black-Scholes model (S0 100, r 0.05, sigma 0.20, T 1.0) evaluated on strikes 60 to 160.
- Controls: the strike on the chart, the butterfly width buttons (0.5, 1, 2, 5) and Reset.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{model, curves, total, truncated, next_steps}`: the model parameters and the call-price and density curves. |
| `get_metadata` | none | JSON `{title, claim, model, disclosure, fetched, sources, next_steps}`. |
| `query` | `filter.strike` (number, required, 60 to 160) | JSON `{strike, call_price, density, disclosure, next_steps}`, or `{error, next_steps}` when the strike is missing or out of range. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `breeden-litzenberger-density-beamdswitch.md`: a narrated talk about the selected strike, with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | `https://teoyujie.org/visuals/breeden-litzenberger-density/data.json` | The source data the site publishes beside the page; not a file in this folder. |

The page has no image export.

## Worked example

1. Call `query` with `{"filter":{"strike":100}}`.
2. It returns `call_price` 10.4506 and `density` 0.019724 at strike 100, with the disclosure that the prices are synthetic.
3. Call `get_metadata` for the model parameters and the Breeden-Litzenberger source to cite.
