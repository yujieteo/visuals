---
name: monte-carlo-workbench
description: Use the Monte Carlo Probability Workbench to model a practical problem with the 10 discrete, 13 continuous and 16 positive, heavy-tailed and extreme-value laws, with censored observations, run it with independent sampling, the inverse transform, rejection sampling, stratification, antithetic variables or control variates, with common random numbers or separate streams across the alternatives, and read each estimate with its interval, its reference value, its claim tag, the variance ratio of the method and the decision between alternatives, and read tails on log–log plots. Groups 1 to 3 of 10; the parameters of the synthetic workflows are illustrative, never calibrated evidence.
---

# Use the Monte Carlo Probability Workbench

Live at <https://teoyujie.org/visuals/monte-carlo-workbench/>. A model is a record of parameters, random variables with their laws, definitions, quantities to estimate (a probability, an expectation or a ratio of expectations), decision alternatives, an objective and constraints. The page holds 40 behaviour experiments and 120 workflows, three for each law and for censoring, and an expert editor for a custom model. A line `censoring: right T by C` (or `left`) makes the model observe `T_obs` and `T_event` only. A run draws replicates in blocks of 1,024 from a Philox4x32-10 stream for each seed, stream name, replicate and variable, so the result does not depend on the number of workers. The reference value of a quantity comes from a closed form (also for the maximum, the minimum or the sum of i.i.d. draws where the law is known), from linearity of expectation, from the enumeration of a discrete support, or from adaptive quadrature over the quantile functions of at most 2 continuous variables or over the exact law of one name. The stable law's CDF is a numerical integral, so its references are numerical. Every result has a claim tag: theorem, numerical approximation or finite-run observation. To change the page, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Read the current model, its text, its parameters, the moment status and the reference values | `get_model` |
| Read the current run: status, estimates, intervals, references and the decision | `get_run` |
| Find an example by decision, phenomenon, law or method | `list_catalogue` with `query` |
| Read a law's convention, support, moments, transforms and links | `get_law` |
| Read the view state and the URL that restores it | `get_state` |
| Keep the analysis as a talk or a record | the "Save beamdswitch deck" and "Save Markdown record" buttons, or `get_markdown` |
| Repeat a run exactly | "Save run record", then "Load run record and replay" |
| Reduce the variance of an estimate | the method `stratified`, `antithetic` or `control` (with a `control C = …` line), and `compare=independent` to see the variance ratio |
| See a heavy tail | `plot=tail`: the survival function on log–log axes, with the slope −α of a regularly varying tail |
| Read the extreme-value fit of the rainfall series | `model=gev-rainfall`, `panel=diagnostics` |
| Compare alternatives with common random numbers or not | `streams` (`common` or `separate`); the decision report shows the variance ratio of each paired difference |

## Inputs

The view state is in the URL fragment: `model` (a catalogue id such as `binomial-overbooking`, or `custom`), `params` (settings such as `tickets=190; comp=500`), `method` (`independent`, `inverse`, `rejection`, `stratified`, `antithetic`, `control`), `compare`, `streams` (`common` or `separate`), `strata` (K = 2^strata equal strata, 1 to 6), `stratify` (the stratified variable; empty for the focus variable), `size` (n = 2^size replicates for each alternative, 10 to 22), `plot` (`pmf`, `cdf`, `survival`, `quantile`, `tail`), `seed` (0 to 2^32 − 1) and `failure` (`none`, `envelope`, `stream_reuse`, `table_cut`, `control_mean`). The model text of the editor has one line for each part, for example `X ~ binomial(n = tickets, p = pshow) {passengers}`, `D ~ normal(mu = 400, sigma = 80) {loaves}`, `prob any_bumped = bumped >= 1` and `control C = D` (the control variate, an affine function of variables with known means).

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title, summary, state schema version and the fields of the state |
| `get_state` | none | The view state, what the page derives from it, its JSON and the URL that restores it |
| `get_markdown` | none | The Markdown record: model, assumptions, method, results, diagnostics and limitations |
| `get_model` | none | The model record and text, the parameters in force, the moment status and the reference value of each quantity |
| `get_run` | none | The run record: generator, seed, settings, model, status, and each estimate with its interval and reference |
| `list_catalogue` | `query` (optional) | The laws, the experiments and workflows (filtered by the query), the methods, the theory panels and the 10 groups |
| `get_law` | `id` (required) | One law's catalogue entry |

## Exports

- **Run record:** `<model>-run.json` (`monte-carlo-workbench/run`, version 1): the generator name and version, the stream scheme, the seed, the settings, the model record, the status and the results. Loading it replays the run and compares the estimates.
- **Model record:** `<model>-model.json` (`monte-carlo-workbench/model`, version 1).
- **CSV:** `<model>-results.csv` (one row for each method, alternative and quantity, with the variance ratio of a variance-reduction method and the streams setting) and `<model>-trace.csv` (the estimate after each block).
- **Figures:** each plot as SVG or PNG.
- **beamdswitch deck:** `monte-carlo-workbench-beamdswitch.md` (voice `bf_emma`).
- **Data:** [data.json](https://teoyujie.org/visuals/monte-carlo-workbench/data.json) (`raw.json` here): the catalogue, with four public-domain datasets, among them 128 annual maxima of daily rainfall at Fort Collins (NOAA GHCN-Daily).

## Worked example

`get_run` on the default view (`binomial-overbooking`, seed 2026, n = 65,536) gives, for "Sell 186", P(at least one passenger loses the seat) = 0.009094 from 596 hits, with the Wilson interval 0.008396 to 0.00985 and the reference 0.008732 from the enumeration of the binomial support. The decision picks "Sell 186": it meets the constraint and its paired interval separates it from "Sell 180".
