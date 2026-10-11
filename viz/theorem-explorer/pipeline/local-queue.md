# Local proof and judgment queue

The local queue adds results to the committed snapshot. It uses no model API, paid service, full corpus download, or scheduled refresh.

The batch contains 200 accepted results across 10 official arXiv topics. The catalog count changes from 2,389 to 2,589. Another 14 candidates remain deferred.

| Topic | New results |
| --- | ---: |
| math.LO | 68 |
| math.GN | 34 |
| math.FA | 20 |
| math.CA | 18 |
| math.RA | 16 |
| math.NT | 14 |
| math.CO | 12 |
| math.GR | 6 |
| math.OC | 6 |
| math.PR | 6 |

The source search compared names, aliases, and declaration names against the catalog. It used small individual files from the existing pinned mathlib commit.
The batch excludes direct aliases and repeated forms of the same source result.

Before this batch, the review examined `nm:union-bound`, `nm:pigeonhole-principle`, `wd:Q513028`, and `wd:Q303402` in Theorem Explorer.
Those records expose conditions and source references, but no complete proof text.
The complete Theorem Learner examples `wd:Q752375` and `wd:Q670235` supplied the structure for explicit conditions, numbered steps, and prerequisite links.

## Evidence and limits

`data/supplement-results.json` retains each candidate, statement, conditions, proof, source excerpt, source context, hashes, attribution, and prerequisites.
The 42 authored proofs use explicit mathematical steps. The 158 source proofs retain the exact Lean declarations and their inherited source contexts.
For a source proof, the Lean declaration and context are the statement of record. The catalog does not invent an English translation.

`data/supplement-judgments.json` retains the accepted answers, condition reviews, source alignment, prerequisite reviews, and verdicts for 351 proof steps.
Each judgment retains the model, provider, session, access method, reasoning profile, input hash, packet hash, answer hash, and review date.
The model identity follows the Firstmate dispatch profile. No remote API response exists to confirm the deployment variant.

An agent judgment is not a formal proof. No local Lean check exists for these additions.
The historical snapshot keeps its original judge and source dates. Each new result has its own assessment and source date.
The existing formal extraction counts remain intact. Source proof text does not count as a new imported-build check.

Research influence and practical impact remain unknown because this batch has no documented use measurements.
The rubric stays at `te-rubric/1`. No new rubric component exists. Application categories remain unclassified without evidence.
The prior arXiv popularity pack remains intact. New results have no new paper counts.

The deferred records contain a reason. They remain outside the catalog and do not count toward the 200 accepted results.

## Commands

Run these commands from `viz/theorem-explorer`.
Set `TE_WORK` to a task folder when the default work folder is not suitable.

```sh
python3 pipeline/run.py --supplement status
python3 pipeline/run.py --supplement prepare --batch-size 6 --max-chars 48000
```

Preparation writes `<work>/supplement/index.json` and `batch-NNN.toon` files.
Each packet contains the existing prompt, rubric, complete statement, conditions, proof, and linked evidence.
The bound includes the prompt and rubric. If one complete record exceeds the bound, preparation stops without truncation.
The status output contains coverage, accepted and deferred counts, unresolved judgments, and the next command in TOON.
An unchanged accepted judgment needs no new packet.

Give each packet to a Codex agent in the current session. No script calls a model.
The agent must return all 3 TOON tables that the packet requests.
It must assess every condition, source alignment, prerequisite, and numbered proof step.

Save the actual identity in a JSON file outside the catalog:

```json
{
 "id": "judge/PROVIDER/MODEL/SESSION",
 "model": "ACTUAL_MODEL",
 "provider": "ACTUAL_PROVIDER",
 "session": "ACTUAL_SESSION",
 "access": "Codex session; no model API call",
 "reasoning": "ACTUAL_REASONING_PROFILE"
}
```

Accept one complete answer file:

```sh
python3 pipeline/run.py --supplement accept \
  --batch batch-000 --answer answer.toon --identity identity.json
python3 pipeline/run.py --supplement status
```

Acceptance checks exact batch IDs, duplicates, required fields, scores, official categories, prerequisites, effort bands, and explanations.
It also checks a verdict for every proof step. An accepted result cannot contain a deferred inference.
Malformed or incomplete batches cause no change to the judgment file.
Changed records or linked evidence need new judgments. The build rechecks saved answers and rejects a corrupt judgment cache.

After the unresolved count reaches 0, rebuild and check the page:

```sh
python3 pipeline/run.py --supplement build
python3 build.py --verify
python3 ../../scripts/check.py theorem-explorer --toon
```

The build preserves historical rows and their indices. It appends accepted results, prerequisite edges, and concept links.
It rejects new dependency cycles. It regenerates `raw.json` and `index.html` through the project builder.
If the builder fails, publication restores both prior artifacts.
The normal refresh also applies the supplement before publication. Changed source evidence can require a new local review.

## Add the next batch

Add source records to `data/supplement-results.json` with stable IDs.
Copy the field structure from an accepted record of the same proof kind.
Retain every domain, quantifier, hypothesis, exception, complete proof, exact source reference, and prerequisite reason.
Add missing prerequisite results with the same complete fields. Use catalog concept IDs for the required definitions.
Give incomplete records `status: deferred` and an explicit `deferred_reason`.

Then run `prepare`, answer the packets, run `accept`, and run `build`.
The scripts validate structure and provenance. The agent remains responsible for the mathematical judgment.

The original full refresh uses `<work>/judge/config.json` or per-answer identity files for new model provenance.
A carried answer retains its original identity. A changed answer uses the current configured identity.
The previous hard-coded Claude identity remains only in historical snapshot data.