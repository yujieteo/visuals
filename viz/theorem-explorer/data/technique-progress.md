# Technique batch status

The batch has 198 accepted entries and 20 deferred entries. The target was about 200, so the shortfall is 2.
Each accepted entry has a statement, hypotheses, an authored proof, definitions, limitations, source references and a worked application.
The accepted entries are in `raw.json` (shared `supplement.py` workflow) and in the Theorem Learner (`te-learning/1` files).

| State | Count | Reason |
| --- | ---: | --- |
| Authored candidates | 218 | 88 from the first pass, 64 from the second pass, 10 from the third pass, 4 removed as duplicates, 60 from the fourth pass. |
| Accepted entries | 198 | An independent model review accepted every proof step and every worked-application step. |
| Deferred after review | 20 | 2 from earlier passes (Ax-Grothendieck, Bernstein modulus bound). 18 from the fourth pass. See the list below. |
| Deferred stubs | 19 | Each stub has no verified source declaration and only a short sketch proof. See `technique-deferred.json`. |
| Shortfall against 200 | 2 | The 18 fourth-pass deferrals are not repaired yet. |
| Removed after the rebase | 4 | 2 duplicates of methods records in the t1 pack and 2 entries that depended on them. |
| Improvements to existing records | 7 | Gauss lemma, Euler sine product, Yoneda, snake lemma, Catalan cycle lemma, Abel partial summation, exponential tilting. These overlap an existing record. |
| New entries | 191 | The other accepted entries have no semantic duplicate in the catalog. |

## Deferred entries from the fourth pass

Most proofs are valid. The judges deferred the entries for a defect in the worked application or a small proof defect.

| Entry | Reason |
| --- | --- |
| Poincare lemma, discrete Fourier transform, character expansion, log-sum inequality, Laplacian bounds, stochastic matrix, Collatz-Wielandt | The worked application uses an object that the record does not state. |
| Donoho-Stark, Courant-Fischer, Weyl, Ky Fan, one-point compactification, quasicomponents | The worked application has an unstated input, a wrong label or a missing case. |
| Partition of unity, Ackermann, Rasiowa-Sikorski, Luroth | A proof step is wrong or incomplete. |
| Cohomology of cyclic groups | The worked application uses a matrix that the record does not define. |

## Review process and caveats

- Judges were independent Sonnet 5.5 model reviews through the shared `supplement.py` workflow.
- The first pass accepted 106 of 162 entries. The judges found real mathematical defects in 56 entries. Fixer agents repaired them.
- The fourth pass judged 60 new entries and accepted 42.
- A model review is not a formal verification. No proof was checked in Lean. The proof field of each entry says this.
- The Learner files for the accepted entries are authored by model agents and pass `cargo run --release -- check` with 0 problems.

## Excluded as duplicate or basic

Faulhaber sums, Baire nested balls, Hensel-Newton, freshman's dream, tower law, minimal polynomial divisibility, totient divisor sum, tree edge count, convex chord slope and a second Wirtinger entry.
The authors also skipped Nielsen-Schreier, Turan, Niven, Chevalley-Warning, Wilson and many other results that the catalog already holds.

## Build check

`python3 pipeline/run.py --supplement --pack technique build` appended the accepted rows to `raw.json` and rebuilt `index.html`.
`python3 scripts/check.py theorem-explorer theorem-learner` passes.

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
