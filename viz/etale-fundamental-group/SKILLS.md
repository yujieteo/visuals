---
name: etale-fundamental-group
description: Use the Étale Fundamental Group laboratory to see loops lift through finite covers, read monodromy permutations, deck groups and fundamental groups of curves, elliptic curves and Spec of a field, analyse a cover of the thrice-punctured line from its monodromy, and export the current computation as a beamdswitch deck.
---

# Use the Étale Fundamental Group laboratory

Live at <https://teoyujie.org/visuals/etale-fundamental-group/>. A geometric laboratory that follows Szamuely's *Galois Groups and Fundamental Groups*: Spec ℂ, Spec ℝ and Spec 𝔽_q with Frobenius necklaces, ℙ¹, 𝔸¹ and 𝔾ₘ with the covers z ↦ zⁿ, ℙ¹ − {0, 1, ∞} as a pair of pants, punctured surfaces of genus 0 to 4, elliptic curves and abelian varieties with their torsion, Artin–Schreier covers and ordinary versus supersingular curves in characteristic p, and Galois acting on roots of unity. Monodromy is computed by lifting loops numerically through the covering equations. Runs offline. To change the laboratory, read [AGENTS.md](AGENTS.md); for what is computed and its scope, read [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Analyse a cover from the monodromy of two loops, without touching the page | `analyse_cover` |
| Read what the laboratory shows now: object, cover, fibre, monodromy and groups | `get_current_state` |
| Read every computation with its assumptions and whether the page's check passed | `get_results_table` |
| Read the objects, computations, presentation progression and Szamuely chapters | `get_metadata` |
| Walk through the story in order | Present (presentation mode), or the Cmd/Ctrl+K palette |
| Keep the current computation as a talk | the beamdswitch button (or Copy deck) |

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Title, URL, objects, the results table, the presentation progression and the Szamuely chapters |
| `get_current_state` | none | The engine state, the view, the status bar (object, model, cover, degree, fibre, monodromy, groups), the loop and its progress |
| `get_results_table` | none | Each computation (X, assumptions, π₁ᵉᵗ, picture) with `checked`, the page's recomputed check |
| `analyse_cover` | `degree` (1 to 8), `a` and `b` in cycle notation on the points 1 to `degree` | Connectedness, orbits, monodromy group order, deck group order, whether the cover is Galois, γ∞, the dessin genus and the Schreier graph edges, or an `error` |

## Exports

- **beamdswitch deck:** `etale-fundamental-group-beamdswitch.md`, a narrated Markdown deck of the current computation (voice `bf_emma`), or Copy deck.
- **Data:** the results table, objects, dictionary and chapters are published as [data.json](https://teoyujie.org/visuals/etale-fundamental-group/data.json).

## Worked example

`analyse_cover({"degree": 3, "a": "(1 2)", "b": "(1 2 3)"})` describes the degree-3 cover of ℙ¹ − {0, 1, ∞} with those monodromies: connected, monodromy group of order 6 (all of S₃), deck group of order 1 (so not Galois), γ∞ = (1 3), and a dessin of genus 0.
