# Technique batch status

The target is 200 new accepted entries. This checkpoint contains 3 authored candidates and 0 accepted entries.
No judgment exists yet. The accepted catalog and the built viewer stay unchanged.

| State | Count | Reason |
| --- | ---: | --- |
| Accepted new entries | 0 | The shared review workflow cannot read this batch yet. |
| Authored candidates | 3 | Each candidate has a statement, hypotheses, source proof, authored proof, definitions, and a worked computation. |
| Deferred mathematical candidates | 0 | No mathematical review occurred yet. |
| Excluded duplicates | 2 | Grönwall and Fredholm alternative already exist in the catalog. |
| Additional entries required | 197 | Candidate selection and complete proofs remain necessary. |
| Improvements to existing records | 0 | No existing record changed. |

## Source-backed topic context

The committed arXiv pack counts 1,590,539 papers through August 2020.
These counts come from the pinned public metadata generation 1597866217014070.
A paper can have more than 1 topic. These counts must not be added as disjoint totals.

| arXiv topic | Papers in the committed source pack |
| --- | ---: |
| math.CO | 44577 |
| math.AP | 40438 |
| math.PR | 39223 |
| math.NT | 28946 |
| math.NA | 22304 |
| math.FA | 21762 |
| math.RT | 19092 |
| math.AC | 9491 |
| math.SP | 7113 |

The existing catalog contains 2,389 records across 78 assigned arXiv topics.
The topic assignments are agent judgments. They are separate from the source-backed paper counts.
No new bulk download occurred.

## Representative candidates

| Candidate | Assigned topics | Worked computation |
| --- | --- | --- |
| Schur complement elimination and inverse | math.NA, math.RA | Reduce a 3-variable saddle-point system to 1 scalar equation. Obtain the unique solution (−1/5,1/5,7/5). |
| Operator Neumann series with a certified truncation error | math.FA, math.NA | Solve a Volterra integral equation. Bound the uniform error of a degree-6 approximation by 1/64. |
| Finite-field Gauss sum magnitude and quadratic square | math.NT, math.RT | Evaluate 2 quadratic exponential sums modulo 5 as √5 and −√5. Select the sign with a separate argument. |

The candidate files preserve source excerpts, exact line locations, module hashes, and source attribution.
The source commit is 119fab72f5ecf69de785450dfb8f8b58ca5f310e.
The authored proofs are separate from the formal source proofs.
No local Lean verification occurred. No accepted mathematical judgment exists yet.

## Shared integration dependency

The shared `pipeline/supplement.py` currently hardcodes `supplement-results.json` and `supplement-judgments.json`.
Its CLI rejects a separate technique file. The exact error is:

```text
supplement.py: error: unrecognized arguments: --results viz/theorem-explorer/data/technique-results.json
```

Its review prompt covers theorem proofs and scores. It does not review the worked application.
Its packet does not include the application, definitions, limitations, or additional source references.
Its build does not include the worked application in the detail pack.
The shared workflow must include these fields before this batch can publish.

Firstmate must coordinate these changes with the first worker:

1. Read both batch files through the shared workflow.
2. Preserve both batches in the final build.
3. Include complete definitions, additional source references, limitations, and applications in each bounded review packet.
4. Review each application hypothesis and each computation step.
5. Include proof and application fields in the built viewer and its result export.
6. Check duplicates and prerequisite links against both batches.

This worker did not edit the first worker's worktree or create another prompt framework.
The first worker's changes must land before final integration and end-to-end tests.
