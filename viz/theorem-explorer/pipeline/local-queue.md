# Local result-pack queue (te-supplement/1)

A result pack adds complete, hand-authored results to the catalog. No paid API, new service or scheduled refresh is used.
A Codex or Claude agent reads a prepared packet and writes an answer file. The CLI validates the answer and stores it.

## Packs

| Pack | Owner | Records file | Judgments file |
|---|---|---|---|
| `methods` | t1 | `data/methods-results.json` | `data/methods-judgments.json` |
| `technique` | t2 | `data/technique-results.json` | `data/technique-judgments.json` |
| `statphys` | t3 | `data/statphys-results.json` | `data/statphys-judgments.json` |

The CLI finds a pack from the file `data/<pack>-results.json`. All packs are validated together:
IDs, names and aliases are unique across the catalog and all packs. A prerequisite can point to a result in another pack.

## Counts

Counts are read from the files. They are not typed by hand. Run `status` for the current numbers.

- `counted`: accepted results with `selection: core`. Only these count toward the 200 target.
- `support`: accepted results with `selection: support`. A support result stays only if a counted result needs it.
- `deferred`: records with `status: deferred`, or with a judge decision `defer`. They stay outside the catalog.

## Record

A record has: `id` (`nm:...`), `name`, `aliases`, `type`, `cats`, `application_cats`, `statement`, `hypotheses`,
`prerequisites [{id, reason}]`, `concepts`, `concept_prerequisites` (`c:` IDs from the concepts pack), `source`
(mathlib `url`, `revision`, `module`, `declaration`, `lines`, `module_sha256`, `excerpt`, `excerpt_sha256`,
`attribution`, `reuse`, `alignment`), `proof {kind, verification, scope, steps [{id, text, uses}]}`, `proof_status`,
`authored`, `status` (`candidate` or `deferred`), `selection` (`core` or `support`),
`applications [{id, title, inputs, hypotheses, steps [{id, text, expression?, expected?}], conclusion}]`.
A deferred record also has `deferred_reason`. A core record with no prerequisite result has `empty_prerequisites_reason`.
t2 may give one `worked_application`. The CLI turns it into `applications`.

A published source uses `kind: literature`, with `citation`, `module` (chapter or section), `declaration` (theorem or equation),
and `page`. It keeps `url`, `revision`, `alignment`, `attribution`, `reuse`, `excerpt` and `excerpt_sha256`.
These fields identify a published statement. They do not identify a formal declaration. A Mathlib source keeps its existing fields.

A deep result can use `proof.kind: outline`. Its scope must name the outline.
Its `proof.source` must hold `kind: cited`, `ref` (the full reference of the published proof) and a stable HTTPS `url`.
The proof steps must name the real ingredients of that proof. The length check and the worked application check still apply.
The judge must check the published reference and every ingredient. An accepted outline stays labelled as an outline in the catalog.

The validator rejects: unknown prerequisites, concepts or categories; a changed source excerpt; a counted record
with a proof shorter than 350 characters, a proof that is neither authored nor a cited outline, or no worked application; a calculation
step where `expression` and `expected` differ in exact arithmetic; a duplicate name; a prerequisite on a deferred record.

## Commands

Run from `viz/theorem-explorer/pipeline`. Each command prints TOON.

```
python3 run.py --supplement status                                 counts, coverage, unresolved judgments, next command
python3 run.py --supplement --pack P check                         validate the records of pack P
python3 run.py --supplement --pack P prepare [--batch-size N]      write the prompt and packets to build/te-work/supplement/P/
python3 run.py --supplement --pack P accept --batch batch-NNN --answer FILE --identity FILE
python3 run.py --supplement build                                  append accepted results to raw.json and rebuild index.html
```

`prepare` writes `batch-NNN.toon`. Give each packet to a judge in a fresh context. The judge writes four TOON tables:

```
answers[N]{id,type,eff,res,pra,rea,hyp,pro,app,cats,acats,level,effort,pre,rel,conf,why}
reviews[N]{id,decision,conditions,prerequisites,alignment,why}
steps[M]{id,step,verdict,why}
computations[K]{id,application,step,verdict,why}   only when a record has applications
```

The `effort` cell uses `/` between 3 bands. The `pre` cell lists the record's prerequisite result IDs, and may list its concept IDs.
`accept` checks the whole batch before it writes anything. It rejects wrong IDs, categories, scores, prerequisites,
missing explanations, a missing step or calculation review, and an accepted result with a deferred step.

The identity file holds `id`, `model`, `provider`, `session`, `access` and optionally `reasoning`. The real model must be given.
`accept` stores the identity and the hashes of the input, the packet, the answer and the rubric version in each judgment.
Judgments from before this CLI keep their historical identity in `raw.json`. Agent judgments are not formal proofs.
No result carries a Lean claim, because no local Lean check exists.

If a record changes, its input hash changes and its judgment is no longer used. Run `prepare` and judge it again.

## Refresh

`run.py` (full refresh) applies the accepted packs after `assemble`, so a refresh does not drop them.
`run.py --supplement build` applies them to the committed `raw.json` and runs `build.py` and `build.py --verify`.
It stops if any candidate has no accepted judgment.
