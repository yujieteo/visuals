---
name: riemann-roch
description: Use the Divisors, Linear Systems & Riemann–Roch Laboratory to compute L(D), ℓ(D) and the Riemann–Roch balance for a divisor on P¹, a Weierstrass elliptic curve, a hyperelliptic curve, a smooth plane curve or an abstract genus-g curve, apply Riemann–Hurwitz, and export the state as a beamdswitch deck.
---

# Use the Riemann–Roch Laboratory

Live at <https://teoyujie.org/visuals/riemann-roch/>. Choose a curve, draw a divisor (filled points for zeros, rings for poles) and the page runs curve → divisor → L(D) → ℓ(D) → Riemann–Roch → |D| → φ_D : C → Pⁿ. Modules cover principal divisors and Pic, the elliptic group law and E ≅ Pic⁰(E), Riemann–Hurwitz, linear systems, plane curves with an exact Bézout microscope, canonical maps of genus 2, 3 and 4, and a computation mode. Runs offline. To change the laboratory, read [AGENTS.md](AGENTS.md); for what is exact and what is a bound, read [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Compute L(D) and ℓ(D) without touching the page | `compute_linear_system` |
| Read the curve, divisor and results on the page | `get_current_state` |
| Find the genus of a branched cover | `apply_riemann_hurwitz` |
| Check the laboratory's required computations | `run_minimum_computations` |
| Read the curve types, symbolic cases, presets and references | `get_metadata` |
| Keep the state as a talk | the beamdswitch button (or Copy deck) |

## Inputs

`compute_linear_system` takes a curve as text, `P1` or `y^2 = f(x)` (Weierstrass cubics included), and a divisor such as `3inf`, `3O`, `K` or, on P¹, `2[0] + [1] - [inf]`. Unsupported input is refused with an error, never guessed. `apply_riemann_hurwitz` takes `degree` (1 to 50), an optional `target_genus` (default 0) and a list of `ramification` indices.

## WebMCP tools

All read-only; none changes the page.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Title, URL, curve types, the symbolic cases, presets and references |
| `get_current_state` | none | The page's curve, divisor, degree, genus, ℓ(D) (or its bounds), the basis and pole orders when written, the Riemann–Roch terms, K and the map φ_D |
| `compute_linear_system` | `curve`, `divisor` | The basis of L(D), pole orders, ℓ(D), the Riemann–Roch check and whether D is nonspecial, or `ok: false` and an error |
| `apply_riemann_hurwitz` | `degree`, `target_genus`, `ramification` | The genus of the cover from 2g_C − 2 = n(2g_D − 2) + Σ(e_P − 1) |
| `run_minimum_computations` | none | Each required computation with its claim, value and pass flag |

## Exports

- **beamdswitch deck:** `riemann-roch-beamdswitch.md`, a narrated Markdown deck of the state (voice `bf_emma`), or Copy deck.
- **Data:** the presets, the minimum computations and their results, and the references are published as [data.json](https://teoyujie.org/visuals/riemann-roch/data.json).

## Worked example

`compute_linear_system({"curve": "y^2 = x^3 - x + 1", "divisor": "3O"})` returns the basis 1, x, y with pole orders 0, 2, 3, so ℓ(3O) = 3 = deg D and |3O| embeds E in P² as the cubic it came from. `apply_riemann_hurwitz({"degree": 2, "ramification": [2, 2, 2, 2, 2, 2]})` returns g = 2: a double cover of P¹ branched at six points has genus two.
