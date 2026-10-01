---
name: delta-cohomology
description: Use the Δ-Complex Cohomology Visualiser to compute the simplicial cohomology of S², T² and RP² from two-triangle Δ-complexes over ℤ, 𝔽₂ or 𝔽₃, with boundary and coboundary matrices, Smith normal forms, generators, cup products and orientation flips, and to export the result as a beamdswitch deck.
---

# Use the Δ-Complex Cohomology Visualiser

Live at <https://teoyujie.org/visuals/delta-cohomology/>. An interactive proof: each space is a unit square cut into two oriented triangles U and L, glued along edges a, b and c. From the gluing alone the page derives the vertex classes, ∂₂ and ∂₁, the coboundaries δᵏ = ∂ₖ₊₁ᵀ, kernels and images, and Hᵏ = ker δᵏ / im δᵏ⁻¹ by Smith normal form, so H²(RP²; ℤ) comes out as ℤ/2. Runs offline. To change the tool, read [AGENTS.md](AGENTS.md); for the model, read [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Compute the cohomology of a space without touching the page | `compute_cohomology` |
| Read the space, coefficients, flips and step on the page with their matrices and groups | `get_current_state` |
| Read the scope, conventions, the three Δ-complexes and the cohomology table | `get_metadata` |
| Check the implementation | `run_self_tests`, or the self-test badge |
| Keep the computation as a talk | the beamdswitch button (or Copy deck) |

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Scope, conventions, the three Δ-complexes (corners, gluing, orientations) and the cohomology table |
| `get_current_state` | none | The page's space, coefficients, orientation flips, mode and step, with the boundary and coboundary matrices, face signs, Smith forms, groups with generators, the ∂² checks and the cup-product ring |
| `compute_cohomology` | `space` (`S2`, `T2` or `RP2`), optional `coefficients` (`Z`, `F2` or `F3`; default `Z`) and `flips` (`{U, L, a, b, c}`, true flips that simplex) | The same results for that choice without changing the page, or an error |
| `run_self_tests` | none | Passed and total counts and each result |

## Exports

- **beamdswitch deck:** `delta-cohomology-beamdswitch.md`, a narrated Markdown deck of the current space, coefficients and orientations (voice `bf_emma`), or Copy deck.
- **Data:** the metadata, gluing data and cohomology table are published as [data.json](https://teoyujie.org/visuals/delta-cohomology/data.json).

## Worked example

`compute_cohomology({"space": "RP2"})` gives H⁰, H¹, H² = ℤ, 0, ℤ/2, with δ¹ in Smith normal form diag(1, 2); `compute_cohomology({"space": "RP2", "coefficients": "F2"})` gives 𝔽₂ in every degree. Flipping any simplex changes signs in the matrices but not the groups.
