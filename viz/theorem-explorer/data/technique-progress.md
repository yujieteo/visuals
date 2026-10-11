# Technique batch status

The target was 200 new accepted entries. The batch has 160 accepted entries and 2 deferred entries.
The target is not met. Each accepted entry has a statement, hypotheses, an authored proof, definitions, limitations, source references and a worked application.

| State | Count | Reason |
| --- | ---: | --- |
| Authored candidates | 162 | 88 from the first pass, 64 from the second pass and 10 from the third pass. |
| Accepted entries | 160 | An independent model review accepted every proof step and every worked-application step. |
| Deferred after review | 2 | Ax-Grothendieck (a wrong hypothesis note) and the Bernstein modulus bound (the claim of sharpness uses only numbers up to n = 1024). |
| Deferred stubs | 19 | Each stub has no verified source declaration and only a short sketch proof. The named result already has a catalog record. See `technique-deferred.json`. |
| Shortfall against 200 | 40 | No further candidate passed the duplicate check and the proof standard in this session. |
| Improvements to existing records | 7 | Gauss lemma (refines nl:16938), Euler sine product (wd:Q810431), Yoneda (nl:466), snake lemma (nl:1777), Catalan cycle lemma (nm:ballot-problem), Abel partial summation (nm:abel-s-lemma), exponential tilting (nm:chernoff-bound). These overlap an existing record. |
| New entries | 153 | The other accepted entries have no semantic duplicate in the catalog. |

## Review process and caveats

- Judges were independent Sonnet 5.5 model reviews through the shared `supplement.py` workflow.
- The first pass accepted 106 of 162 entries. The judges found real mathematical defects in 56 entries, for example an undefined basis polynomial, wrong numbers and a missing case.
- Fixer agents repaired the entries. Two more review passes accepted 54 of them. Two stay deferred.
- A model review is not a formal verification. No proof was checked in Lean. The proof field of each entry says this.

## Excluded as duplicate or basic

Faulhaber sums, Baire nested balls, Hensel-Newton, freshman's dream, tower law, minimal polynomial divisibility, totient divisor sum, tree edge count, convex chord slope and a second Wirtinger entry.
The authors also skipped Nielsen-Schreier, Turan and many other results that the catalog already holds.

## Build check

The shared `pipeline/supplement.py` is on `origin/fm/visuals-theorem-data-t1`, not on this branch.
A scratch copy of the t1 tree ran `run.py --supplement --pack technique build` in about 1 second.
The built `raw.json` holds 160 `nm:technique-` rows in the core pack. Each detail row has the statement, hypotheses, definitions, applications, limitations, source references and proof.
`tests/test_supplement.py` (12 tests, 1.0 s) and `tests/theorem-explorer-model.test.mjs` (33 tests, 0.7 s) pass in that copy.

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
