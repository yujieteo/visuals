---
name: generating-functions
description: Use the Generating Functions Lab to compute a coefficient of a counting problem's generating function exactly with independent checks, take an exact DFT and its inverse, read the curriculum and problem ladder, and export a lesson as a beamdswitch deck.
---

# Use the Generating Functions Lab

Live at <https://teoyujie.org/visuals/generating-functions/>. Generating functions as a calculus for discrete structures: every lesson runs problem → discrete object → encode → manipulate → read coefficient → answer → verify. Thirty-four levels (31 and 32 optional), a 22-problem ladder with hints, Compare and Transform modes, a Fourier lab, a finite-vector sandbox and a command palette. Runs offline. To change the lab, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Count something with a lesson's generating function, without touching the page | `extract_coefficient` |
| Take an exact DFT of an integer vector, and invert it | `dft` |
| Read what the page shows and its checks | `get_current_view` |
| Read the levels, fragments, techniques, problems and conventions | `get_metadata` |
| Check the implementation | `run_self_tests` |
| Open a lesson, problem or lab page | a deep link such as `#coin-change?n=12&coins=1%2C%202%2C%205`, `#problem-7`, `#fourier?N=8` |
| Keep a lesson as a talk | the beamdswitch button, or Present for the in-page slides |

## Inputs

A lesson is named by its fragment (`fibonacci`, `coin-change`, `catalan`, `dft` and the others in `get_metadata`'s `levels`); `n` is the coefficient index, clamped to the lesson's range, and `params` takes the lesson's own choices (for example `{"coins": "1, 5, 10"}` for coin change). A DFT vector is 1 to 16 integers; exact strings are given for N = 1, 2, 3, 4, 6 and 8.

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Purpose, conventions, the 34 levels with fragments and techniques, the 22-problem ladder and the spec corrections (as `data.json`) |
| `get_current_view` | none | The route and, for a lesson, its parameters, n, the [xⁿ] value, the answer sentence and every verification check |
| `extract_coefficient` | `lesson`, optional `n` and `params` | The exact coefficient, the answer sentence and the independent checks, without changing the page, or an error for an unknown lesson |
| `dft` | `vector` (integers) | N, each value A(ωᵏ) as an exact string and a float, and the exact inverse |
| `run_self_tests` | none | Passed and total counts and any failures of the verification engine |

## Exports

- **Markdown:** the current lesson or problem as a Markdown report, or the full core deck (`generating-functions-core.md`).
- **beamdswitch deck:** a narrated Markdown deck of the current lesson (voice `bf_emma`) whose frames follow the lesson's states.
- **Data:** the metadata is published as [data.json](https://teoyujie.org/visuals/generating-functions/data.json).

## Worked example

`extract_coefficient({"lesson": "coin-change", "n": 12})` returns 13: there are 13 ways to make 12 from coins 1, 2 and 5, and the brute-force count agrees. With `params: {"coins": "1, 5, 10"}` it returns 4. `extract_coefficient({"lesson": "catalan", "n": 5})` returns 42. `dft({"vector": [1, 2, 3, 4]})` returns 10, −2 − 2i, −2 and −2 + 2i (ω = i), and the inverse gives back 1, 2, 3, 4.
