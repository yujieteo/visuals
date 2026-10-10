# Theorem Learner: proofs from concepts to results

The page is the Theorems notebook of yujieteo/site (`content/play/theorems/index.md`, at `teoyujie.org/play/theorems/`),
which joins this `raw.json` with the Theorem Explorer's through the site's `visuals.lock`. That lock pins the SHA-256 of
`raw.json`, so a new `raw.json` takes effect only when the site pins the new commit. The old JavaScript page and the
Python pipeline are in Git history: the last commit that has them is 32181d1.

This folder keeps the authored learning data and its builder, a Rust crate (`Cargo.toml`, `src/`) that writes the same
bytes as the Python pipeline it replaced. Run it from this folder with `cargo run --release -- <command>`; the
repository's `rust-toolchain.toml` pins the compiler. Rules for every visual: [SKILLS.md](../../SKILLS.md).

## Data: source catalog and authored learning data, kept apart

| Part | Where | Written by |
| --- | --- | --- |
| Source catalog: results, statements, evidence, relations, scores, concepts | `viz/theorem-explorer/raw.json` | the Theorem Explorer's refresh (`viz/theorem-explorer/pipeline/run.py`) |
| Authored learning data (te-learning/1) | `data/learning/` | people and the judge model, through the prompts below; never a refresh |
| The page's data | `raw.json` | `cargo run --release -- assemble` |

`assemble` (`src/assemble.rs`) reads both, checks every authored file (`src/learning.rs`) and writes `raw.json`. A source
refresh changes only the catalog, so a reviewed proof explanation is never overwritten. A theorem without an authored
file keeps its quoted source statement and shows "no proof is authored": unknown content stays unknown.

`data/learning/`:

- `mechanisms.json`: reusable proof moves with ASD-STE100 slogans.
- `theorems/*.json`: theorem objects (statement, hypotheses, conclusion, formal scope note) with their proofs (slogan,
  scope, hypothesis roles, 3 to 7 steps, edges, conclusion, concept notes, mechanisms, source). `aa-gold.json` holds the
  hand-checked examples; the first file that answers a theorem wins, so it overrides a batch answer.
- `concepts/*.json`: concept reminders, definitions, examples, requirements and generality links.

The format and every rule are in the module comment of `src/learning.rs`. Text marks concept words explicitly,
`[word](c:concept-id)`; assembly turns marks into segments, and nothing finds concepts by string replacement.

## Authoring

| Command | Result |
| --- | --- |
| `cargo run --release -- packets --per 30` | `build/tl-work/packets/` (one packet per theorem: sources, the Lean declaration and its proof text, key concepts, prerequisites, relations), `concept-index.tsv`, `result-index.tsv` |
| `cargo run --release -- packets --concepts ids.txt` | `build/tl-work/concept-packets/` for the concept author |
| `cargo run --release -- packets --marked` | concept packets for every catalog concept the authored proofs mark and no concept file answers yet, most used first |
| `cargo run --release -- check FILE...` | every problem of the authored files; 0 problems before a commit |
| `cargo run --release -- assemble` | `raw.json`, with the coverage counts; run `packets` once first, because the checks read its indexes |

Proofs follow `prompts/proof-author-prompt.md` (tl-proof-prompt/1): Lean first (the packet holds the mathlib proof
text at the pinned commit), then a web source, then an authored proof, and for a result too deep to write out an
outline of its real steps with a cited published proof. Every theorem gets a proof; an alternative proof is a different
route, never an equivalent theorem or a generalization. A record that names a family of results states and proves one named member and lists
the others in its scope; a record with no precise statement stays unknown, with the reason. Concepts follow `prompts/concept-author-prompt.md`
(tl-concept-prompt/1). The packets need the pinned mathlib checkout at `build/te-work/mathlib4` (the Theorem
Explorer's work directory; `TE_WORK` moves it).

## Verification statuses

Keep them apart: a formal declaration (exists in the pinned mathlib), an authored explanation, a checked
correspondence (a review confirmed that the explanation matches the formal proof) and a Lean-checked proof (Lean checked
this proof artifact). A declaration match never marks a proof as Lean-checked; set `vf.checked` only after a review, and
never infer a hypothesis role from dependency edges.
