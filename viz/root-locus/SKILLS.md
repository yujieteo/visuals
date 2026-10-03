---
name: root-locus
description: Use the Root locus design check to analyse a continuous or sampled feedback loop by root locus, pick a gain, check closed-loop poles against damping, natural-frequency and settling-time requirements, and export the check as Markdown or a beamdswitch deck.
---

# Use the Root locus design check

Live at <https://teoyujie.org/visuals/root-locus/>. Type a compensator C, plant G and feedback path H, see the s-plane or z-plane locus for K ≥ 0, pick K, and check the closed-loop poles against requirements; the check returns the passing K intervals or the binding requirement. Cancellations, improper loops and coarse sampling are flagged. To change the tool, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Analyse a loop without touching the page | `analyze_loop` |
| Read the check on the page | `get_current_check` |
| Get the Markdown record (re-importable) | `export_markdown`, or Export Markdown / Copy Markdown |
| Run the built-in textbook cases | `run_self_tests`, or `?selftest` |
| Learn the input syntax, modes, methods and examples | `get_metadata` |
| Keep the check as a talk | the beamdswitch button (or Copy deck) |

## Inputs

C, G and H in a small Python syntax: numbers, complex literals such as `1+2j`, lists, `s`, `z`, `pi`, `tf(num, den)`, `tf('s')`, `zpk(zeros, poles, gain)`, `+ - * / **` and parentheses. The mode is `s` or `z`; in the z-plane, G is entered in s and discretised by `zoh`, `tustin` or `matched` at `sampleTime`, while C and H are entered in z. Optional: a delay (`value`, `padeOrder`), `k`, `kMax`, pinned gains and requirements (`zetaMin`, `wnMin`, `wnMax`, `settlingTime`).

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Title, record schema version, maximum order, the syntax, discretisation methods, requirement labels and the examples |
| `get_current_check` | none | The loop on the page, closed-loop poles at the chosen K, critical gains, breakaway points, asymptotes, the verdict and warnings |
| `analyze_loop` | `fields` {C, G, H}, plus optional `mode`, `sampleTime`, `method`, `delay`, `k`, `kMax`, `requirements`, `pins` | The same summary for that loop, without changing the page |
| `export_markdown` | none | `markdown`: the record of the check on the page, with its fenced JSON input block |
| `run_self_tests` | none | Each verification case's expected and computed values with PASS or FAIL |

## Exports

- **Markdown:** `root-locus-check.md`, the save format; paste it back with Import pasted record.
- **beamdswitch deck:** `root-locus-beamdswitch.md`, a narrated Markdown deck of the set-up, method, results and checks (voice `bf_emma`), or Copy deck.
- **JSON:** the input block inside the Markdown record; the method notes, examples and verification table are published as [data.json](https://teoyujie.org/visuals/root-locus/data.json).

## Worked example

The built-in example `type1-third-order` is G = 1 / (s (s + 1) (s + 2)) with C = H = 1:

```json
{"mode": "s", "fields": {"C": "1", "G": "1 / (s * (s + 1) * (s + 2))", "H": "1"}, "k": 1}
```

With `"requirements": {"zetaMin": 0.5}` added, `analyze_loop` returns closed-loop poles at K = 1 of −0.337641 ± 0.56228j (ζ = 0.514802) and −2.32472, the imaginary-axis crossing at K = 6 (1.41421j), a breakaway at s = −0.4226 (K = 0.3849), three asymptotes from −1 at 60°, 180° and 300°, and the verdict "Gains meeting all requirements: 0 < K < 1.03704".
