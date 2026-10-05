---
name: scientific-modelling
description: Use the Scientific Modelling and Dimensional Analysis page to check a physical model's dimensions, units and conditions, to find its independent dimensionless groups with exact arithmetic (Buckingham Pi), and to write the model in dimensionless form with its scales, common factors, parameters and an exact reverse substitution, with every step, status and source. This preview (piece 2 of 9) runs the Dimensionless Number Finder and the Model Nondimensionalizer; the Regime Map Builder comes in piece 3.
---

# Use the Scientific Modelling page

Live at <https://teoyujie.org/visuals/scientific-modelling/>. One versioned model record holds the purpose, variables, equations, geometry, conditions, assumptions, scales, analyses, evidence and history. The page interprets the current version, checks it before any analysis, and runs the Dimensionless Number Finder and the Model Nondimensionalizer only on a version that the researcher confirmed. All arithmetic is exact: BigInt fractions, and canonical sums of products for the algebra of the Nondimensionalizer. To change the page, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Read the current model record, its version, confirmation and the checks before analysis | `get_model` |
| Find the dimensionless groups of the current record, or of a variable list | `find_groups` |
| Write the current confirmed record in dimensionless form: scales, variables, derivatives, every equation and condition, parameters, the Pi basis and the checks | `nondimensionalize` |
| Use another scale for a variable | "Use this scale" in the Nondimensionalizer, or a row in the model's scales; then confirm the new version |
| Read the derivation: steps, row operations, exponent equations, checks, and each result with its status | `get_derivation` |
| Read the view state and the URL that restores it | `get_state` |
| Keep the analysis as a talk | "Save beamdswitch deck" |
| Keep or move the model record | "Save model JSON" and "Load model JSON" |

## Inputs

Variables have a symbol (such as `c_p` or `T_inf`), a unit (`W/(m^2*K)`), a dimension formula (`M L^-1 T^-1`) or a quantity, a value or a range (`0.01..0.1`), a kind (parameter, field, coordinate, constant), a domain and a Pi-set flag. A lone `degC` is an absolute temperature; `delta_degC`, and °C inside a compound unit, are differences. Equations use plain syntax, such as `rho*c_p*d(T,t) = k*d(T,x,x)`, or a LaTeX subset. Conditions have a location such as `x = L`. Scales have a variable, a scale expression such as `L^2/alpha`, an optional offset such as `T_inf`, an optional dimensionless symbol and a reason; a scale in the record replaces the suggested one. Examples: `heat-transfer-pi`, `straight-fin`, `transient-slab`, `lumped-body`, and the failure examples `fail-dimensions`, `fail-zero-scale`, `fail-zero-temperature-scale`, `fail-dependent`, `fail-conditions`, `fail-entry`, `fail-unsupported`.

The Nondimensionalizer supports equations that are sums of products of parameters, fields, derivatives and known functions of dimensionless arguments, under affine scalings x = x0 + S x̂. It shows anything else as unsupported, with the reason.

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title, summary, state schema version and the fields of the view state |
| `get_state` | none | The view state, everything the page derives from it, the view JSON and the URL |
| `get_markdown` | none | The Markdown record: the deck's frames without narration |
| `get_model` | none | The model record as the model JSON holds it, its version, confirmation, checks before analysis and the state of each calculation |
| `find_groups` | `variables` (symbol with dimension or unit), `quantity_of_interest`, `repeating` (all optional) | Rank, the groups with their exponents and familiar names, the repeating set, the familiar basis, the relation, constraints and checks |
| `nondimensionalize` | none | Each scale with its reason, candidates, refusals and ratios; the dimensionless variables and inverses; the derivative transformations; every equation and condition in dimensionless form with its common factor; the parameters with their names; the prescribed data; the comparison with the Pi basis; where each parameter enters; the exact checks |
| `get_derivation` | none | The derivation steps with reasons and evidence, every row operation with its matrix, the exponent equations, the checks and each result with its status, inputs and validity |

## Exports

- **Model JSON:** `scientific-modelling-model-<example>-v<version>.json`, the record with its analyses and derivation. Import checks the schema, ids, kinds, domains and references, keeps the current record when a check fails, and asks for a new confirmation.
- **View JSON:** `scientific-modelling-view.json`, the view state only (example, tool, repeating set, step, basis, detail).
- **Markdown record and beamdswitch deck:** `scientific-modelling-record.md` and `scientific-modelling-beamdswitch.md` (voice `bf_emma`): Set-up, Method (the full hand calculation, items 1 to 7), Results, Checks and takeaway, from the same model version as the page.
- **Data:** [data.json](https://teoyujie.org/visuals/scientific-modelling/data.json) (`raw.json` here): the examples, quantities, familiar groups, sources, the build roadmap and the SymPy references (matrices, and the dimensionless forms of the examples with equations).

## Worked example

`find_groups({"variables": [{"symbol": "h", "dimension": "M T^-3 Theta^-1"}, {"symbol": "k", "dimension": "M L T^-3 Theta^-1"}, {"symbol": "rho", "dimension": "M L^-3"}, {"symbol": "mu", "dimension": "M L^-1 T^-1"}, {"symbol": "c_p", "dimension": "L^2 T^-2 Theta^-1"}, {"symbol": "U", "dimension": "L T^-1"}, {"symbol": "L", "dimension": "L"}], "quantity_of_interest": "h", "repeating": ["rho", "U", "L", "k"]})` gives rank 4 and the groups hL/k, μ/(ρUL) and c_p·ρUL/k, as in section 5 of the specification. On the page, the `heat-transfer-pi` example also gives det D_R = −1 and the equivalent familiar basis Nu, Re, Pr.

For the `transient-slab` example, confirm the interpretation, then `nondimensionalize` gives X = x/L, τ = αt/L² and θ = (T − T_∞)/(T_i − T_∞), the forms θ_τ = θ_XX, θ_X = 0 at X = 0, −θ_X = Bi θ at X = 1 and θ = 1 at τ = 0, and one parameter, Bi = hL/k, as in section 7 of the specification.
