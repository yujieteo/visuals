---
name: scientific-modelling
description: Use the Scientific Modelling and Dimensional Analysis page to check a physical model's dimensions, units and conditions, to find its independent dimensionless groups with exact arithmetic (Buckingham Pi), to write the model in dimensionless form with its scales, common factors, parameters and an exact reverse substitution, to map where each simple model of a declared model is accurate (dominant balance, asymptotic analysis, regime maps), and to find where a steady state loses stability and which branches start there (stability and bifurcation analysis, for declared models and custom ODE systems), with every step, status and source. This preview (piece 4 of 9) runs the Dimensionless Number Finder, the Model Nondimensionalizer and the Regime Map Builder with the declared models of four conduction families, buoyancy convection and radiation.
---

# Use the Scientific Modelling page

Live at <https://teoyujie.org/visuals/scientific-modelling/>. One versioned model record holds the purpose, variables, equations, geometry, conditions, assumptions, scales, analyses, evidence and history. The page interprets the current version, checks it before any analysis, and runs the Dimensionless Number Finder, the Model Nondimensionalizer and the Regime Map Builder only on a version that the researcher confirmed. The algebra is exact: BigInt fractions, and canonical sums of products for the Nondimensionalizer and the asymptotic expansions. The solutions of the declared models, the eigenvalue problems and the continuation are double-precision numerics, each with its stated tolerance and checked against mpmath, SymPy or published data. To change the page, read [AGENTS.md](AGENTS.md).

A record follows a declared model of the catalogue (spec section 10) when its purpose names it (`purpose.declaration`, such as `slab-convection`) and the Nondimensionalizer's dimensionless equations and conditions equal the declared ones exactly. Declared models now: `lumped-convection`, `slab-convection`, `cylinder-convection`, `sphere-convection`, `slab-source`, `multilayer-wall` and `fin` (piece 3), and `boussinesq-box`, `lumped-radiation`, `surface-radiation` and `convection-radiation` (piece 4). Pieces 5 to 9 add the other families.

Stability and bifurcation (hand calculation 9) run for a declared model of piece 4 and for a custom finite ODE system: equations `d(x,t) = f(x)`, first order in one time coordinate. For a custom system, `purpose.analysis` names the control parameter and its range (`{"control": "v-Da", "range": "0.2..0.6"}`, and optionally `control2` and `range2` for the fold curves), and the value of each state variable (such as `0..40`) is the box of the equilibrium search. The page finds equilibria from a grid of seeds, follows each branch by pseudo-arclength continuation, and marks folds, branch points and Hopf points; it classifies each only with its checked conditions (nonzero normal-form coefficients, an exact symmetry for a pitchfork, a nonzero first Lyapunov coefficient for a Hopf point) and states the coverage of the search, which is never exhaustive. Stability and bifurcation of a custom PDE stay unsupported.

## Tasks

| The request is to... | Use |
| --- | --- |
| Read the current model record, its version, confirmation and the checks before analysis | `get_model` |
| Find the dimensionless groups of the current record, or of a variable list | `find_groups` |
| Write the current confirmed record in dimensionless form: scales, variables, derivatives, every equation and condition, parameters, the Pi basis and the checks | `nondimensionalize` |
| Use another scale for a variable | "Use this scale" in the Nondimensionalizer, or a row in the model's scales; then confirm the new version |
| Map where each approximation of the record's declared model meets a tolerance, with the balances, boundaries, unresolved points, intersections and limit paths | `get_regime_map` |
| Inspect one point of the declared model: each layer there, the reduced models, the checks and the dimensional values | `get_regime_point` |
| Read the declared model catalogue: the six parts of a declaration and its acceptance result | `get_catalogue` |
| Read the stability and bifurcation analysis: base state, perturbation equations, growth rates, neutral curve, branches, classification and coverage | `get_stability` |
| Read the derivation: steps, row operations, exponent equations, checks, and each result with its status | `get_derivation` |
| Read the view state and the URL that restores it | `get_state` |
| Keep the analysis as a talk | "Save beamdswitch deck" |
| Keep or move the model record | "Save model JSON" and "Load model JSON" |

## Inputs

Variables have a symbol (such as `c_p` or `T_inf`), a unit (`W/(m^2*K)`), a dimension formula (`M L^-1 T^-1`) or a quantity, a value or a range (`0.01..0.1`), a kind (parameter, field, coordinate, constant), a domain and a Pi-set flag. A lone `degC` is an absolute temperature; `delta_degC`, and °C inside a compound unit, are differences. Equations use plain syntax, such as `rho*c_p*d(T,t) = k*d(T,x,x)`, or a LaTeX subset. Conditions have a location such as `x = L`. Scales have a variable, a scale expression such as `L^2/alpha`, an optional offset such as `T_inf`, an optional dimensionless symbol and a reason; a scale in the record replaces the suggested one. The purpose can name a declared model (`declaration`), and the geometry can name the shape of a lumped body (`shape`: slab, cylinder, sphere or cube). Examples: `heat-transfer-pi`, `straight-fin`, `transient-slab`, `lumped-body`, `transient-cylinder`, `transient-sphere`, `volumetric-source`, `multilayer-wall`, `rayleigh-benard`, `enclosure-convection`, `lumped-radiation`, `surface-radiation`, `convection-radiation`, the custom ODE systems `custom-ignition` and `custom-lorenz`, and the failure examples `fail-dimensions`, `fail-zero-scale`, `fail-zero-temperature-scale`, `fail-dependent`, `fail-conditions`, `fail-entry`, `fail-unsupported`.

The Nondimensionalizer supports equations that are sums of products of parameters, fields, derivatives and known functions of dimensionless arguments, under affine scalings x = x0 + S x̂. It shows anything else as unsupported, with the reason.

The Regime Map Builder draws a 2D slice or a 1D diagram of the declared parameters: choose the axes, linear or logarithmic scales, the fixed values (`Bi=0.5, Fo=0.25`), the tolerance (0.1, 0.01 or 0.001), the shading and the layers. Approximation boundaries mark where an approximation's error equals the tolerance; balance crossovers mark where two estimated terms are equal, which is not a transition. The map never draws a boundary across an unresolved point. Select a point or a boundary to inspect it, with its dimensional values. For the models of piece 4 the map also draws stability boundaries (a neutral curve, solid) and bifurcation boundaries (branch points, dashed), with regions of one or more stable states.

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
| `get_regime_map` | `x`, `y` (a parameter id, or `none` for a 1D diagram), `fixed` (such as `Bi=0.5, Fo=0.25`), `tolerance` (`1e-1`, `1e-2` or `1e-3`), all optional | The declared model and its exact match, the axes, fixed and derived parameters, each layer with its criterion, boundary points and regions, the unresolved points with their reasons, the points where no approximation meets the tolerance, the intersections, the limit paths, the inspected point and the acceptance checks |
| `get_regime_point` | `parameters` (such as `{"Bi": 0.5, "Fo": 0.25}`), `tolerance` | The value and region of each layer at that point, the reduced models that meet the tolerance, the profile, the checks and the dimensional reconstruction |
| `get_catalogue` | `declaration` (optional) | Every family with the piece that brings it, and one declaration with its six parts, its methods and its acceptance result on its standard example |
| `get_stability` | none | For a declared model of piece 4: the exact base-state, perturbation and symmetry checks, the growth rates and modes, the neutral curve, the branch with its comparison data, the amplitude equation and the classification. For a custom ODE system: the equilibria with their eigenvalues, the branches with their folds, branch points and Hopf points, the regions of several stable states and the coverage. Each result with its status and tolerance |
| `get_derivation` | none | The derivation steps with reasons and evidence, every row operation with its matrix, the exponent equations, the checks and each result with its status, inputs and validity |

## Exports

- **Model JSON:** `scientific-modelling-model-<example>-v<version>.json`, the record with its analyses, derivation, dimensionless forms and regime map. Import checks the schema, ids, kinds, domains and references, keeps the current record when a check fails, and asks for a new confirmation.
- **View JSON:** `scientific-modelling-view.json`, the view state only (example, tool, repeating set, step, basis, detail, and the map's axes, scales, fixed values, tolerance, layers, shading, point and boundary, and the catalogue's declaration).
- **Markdown record and beamdswitch deck:** `scientific-modelling-record.md` and `scientific-modelling-beamdswitch.md` (voice `bf_emma`): Set-up, Method (the full hand calculation, items 1 to 9), Results, Checks and takeaway, from the same model version as the page.
- **Data:** [data.json](https://teoyujie.org/visuals/scientific-modelling/data.json) (`raw.json` here): the examples, quantities, familiar groups, sources, the build roadmap, the declared model catalogue, the references of SymPy and mpmath (matrices, dimensionless forms, eigenvalues, temperatures, series and exact solutions of the conduction models), and the stability data (Table 1S of Wen, Goluskin and Doering 2022, and the values of `tools/stability_references.py`).

## Worked example

`find_groups({"variables": [{"symbol": "h", "dimension": "M T^-3 Theta^-1"}, {"symbol": "k", "dimension": "M L T^-3 Theta^-1"}, {"symbol": "rho", "dimension": "M L^-3"}, {"symbol": "mu", "dimension": "M L^-1 T^-1"}, {"symbol": "c_p", "dimension": "L^2 T^-2 Theta^-1"}, {"symbol": "U", "dimension": "L T^-1"}, {"symbol": "L", "dimension": "L"}], "quantity_of_interest": "h", "repeating": ["rho", "U", "L", "k"]})` gives rank 4 and the groups hL/k, μ/(ρUL) and c_p·ρUL/k, as in section 5 of the specification. On the page, the `heat-transfer-pi` example also gives det D_R = −1 and the equivalent familiar basis Nu, Re, Pr.

For the `transient-slab` example, confirm the interpretation, then `nondimensionalize` gives X = x/L, τ = αt/L² and θ = (T − T_∞)/(T_i − T_∞), the forms θ_τ = θ_XX, θ_X = 0 at X = 0, −θ_X = Bi θ at X = 1 and θ = 1 at τ = 0, and one parameter, Bi = hL/k, as in section 7 of the specification.

For the `transient-slab` example, confirm the interpretation, then `get_regime_point({"parameters": {"Bi": 0.5, "Fo": 0.25}})` shows that the first mode alone is within 0.7 % of the series there and the lumped model e^{−Bi Fo} is 12 % off, and that this point means h = 1250 W/(m²·K) and t = 8 s for the record's slab. The lumped model is the limit Bi → 0 with Bi·Fo fixed, a coupled limit.

For the `rayleigh-benard` example, confirm the interpretation, then `get_stability` gives the onset Ra_c = 1707.92 of the cell (one roll, a = π) and Ra_c = 1707.76 at a_c = 3.1163 for the unbounded layer, the steady roll branch with Nu = 2.1479 at the record's Ra = 5232, Nu within 4×10⁻⁶ of Table 1S of Wen, Goluskin and Doering (2022) at 15 values of Ra, and a supercritical pitchfork from the amplitude equation. For `custom-lorenz` it gives the pitchfork at r = 1 and a subcritical Hopf point at r = 24.7368 (470/19 exactly, from SymPy).
