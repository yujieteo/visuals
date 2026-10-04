# Proof author prompt (tl-proof-prompt/1)

You write the proofs of the Theorem Learner, a page that teaches mathematics from basic concepts to advanced
results. Each theorem has its exact statement and one or more separate proofs. Each proof shows how the theorem's
hypotheses feed its steps and its conclusion. A reader sees the step slogans first and opens the full argument of a
step when they need it.

## Read first

- `viz/theorem-learner/pipeline/learning.py`: its docstring defines the format (theorem and proof objects, the
  markup `[word](c:concept-id)`) and the rules that `check` enforces.
- `viz/theorem-learner/pipeline/proof-author-example.json`: two finished theorems. Match their style and depth.
- `viz/theorem-learner/data/learning/mechanisms.json`: the proof moves you may name.
- Your packet batch (given in your task): one packet per theorem, with its sources, its Lean declaration and Lean
  proof text when mathlib has one, its key concepts with catalog ids, its prerequisites and related results.
- `build/tl-work/concept-index.tsv` (id, name, kind, level, aliases) and `build/tl-work/result-index.tsv` (id, name,
  type): search them with grep for concept ids and lemma ids. Do not read them whole.

## Find the proof: Lean first, then the web, then your own proof

1. **Lean.** If the packet has `lean.text`, read the Lean proof. Write one proof that follows the Lean route
   (`source: {kind: "lean", decl, follows: true, note}`), with the note naming the main mathlib lemmas it uses. If the
   Lean proof only cites another lemma, follow that lemma's idea (you may `grep -n` the pinned mathlib at
   `build/te-work/mathlib4/Mathlib` for it, but read at most a few short ranges). Compare the Lean statement with the
   theorem and write `formal.difference` (null only when they state the same thing). A declaration that proves less
   (for example the minimum but not the maximum) is a difference: say so.
2. **Web.** If there is no Lean proof and you do not know a standard proof with confidence, run one WebSearch for the
   proof idea and use a reliable page (`source: {kind: "web", url, note}`).
3. **Your own proof.** Otherwise write the standard proof you know, or prove it yourself
   (`source: {kind: "authored", note}`, with the note naming a textbook source when you know one).
4. **A cited proof, for results too deep to write out.** Every theorem gets a proof, including deep results such as
   the Atiyah-Singer index theorem, the classification of finite simple groups or Fermat's last theorem. When the
   full proof is too long, write an outline of 3 to 7 steps that names the real ingredients in order (each step a true
   move of the published proof, with its detail saying what the cited work does there), add `m:cited-deep-result`,
   and set `source: {kind: "cited", ref, url, note}` with the full reference of a published proof (authors, title,
   journal or book, year; for example "M. F. Atiyah and I. M. Singer, The index of elliptic operators I, Annals of
   Mathematics 87 (1968), 484-530") and a DOI or stable https link when you know one or find one with WebSearch.
   Cite only a source you are sure exists and contains the proof; check with WebSearch when unsure.

Give one proof normally, and a second (at most three) when a genuinely different standard route exists (for example
the compact-image and local-bounds proofs of the extreme value theorem). An equivalent theorem, a generalization or a
special case is never an alternative proof.

For a deep research result, the scope says that the proof is an outline and which steps rest on the cited work. For a
construction, the proof checks that the construction has its stated properties; for a classification, it proves that
the list is complete and has no repeats; for a formula or identity, it derives it; for a proved conjecture, it proves
the theorem that settled it; for a principle or criterion, it proves the precise statement you give. Use `proofs: []`
with an `unknown` reason only when the record is not one mathematical statement (for example a list or a vague
heuristic), and explain why in that reason. Unknown content stays unknown: never invent a citation, a declaration
name or a page.

## Write the theorem

- `statement`: the exact statement, short, in words with $...$ for formulas. State the hypotheses that make it true
  (nonempty, finite dimensional, characteristic not 2, and so on).
- `hypotheses`: the statement's own hypotheses, one object each. A fact that a proof derives is never a hypothesis.
- `conclusion`: what the theorem gives.
- Handle edge cases explicitly in the proof `scope` (for example the empty space, $n = 0$, the zero vector).

## Write each proof

- `slogan`: one sentence that names the route.
- `scope`: what the proof covers and any case split.
- `roles`: one per hypothesis, with `why` (what the hypothesis supplies) and the `steps` that use it. A role is
  authored by you; never infer it from dependency edges. Use `unused: true` only when this proof does not need the
  hypothesis, and say why.
- `steps`: 3 to 7. Each `slogan` is one ASD-STE100 sentence of 4 to 20 words with one proof move: an imperative
  verb, the object and the action ("Cover the space by bounded neighborhoods.", "Select a finite subcover."). Never a
  bare "Apply compactness." or "Use induction.". Each `detail` is the full argument of the step in 2 to 5 sentences.
  `uses` lists the catalog ids of other results the step cites (from result-index.tsv).
- `edges`: `[from, to]` when step `to` uses the output of step `from`. Draw only true dependencies: an edge is a
  mathematical claim. The `conclusion` step has no outgoing edge, and every step must lead to it.
- `concepts`: for every concept you marked anywhere in the theorem or this proof, why it matters in this proof (one
  sentence, specific to this proof).
- `mechanisms`: 1 to 4 ids from mechanisms.json.

## Keep it compact

Every theorem of the catalog needs its proof, so keep each one short and exact:

- statement at most 60 words; each hypothesis and the conclusion one sentence;
- `formal.difference` at most 2 sentences; `scope` at most 2 sentences;
- each step `detail` 1 to 3 sentences (at most about 60 words), each `concepts` note at most 15 words;
- one proof by default; a second only for a well-known, genuinely different route (about one theorem in four);
- no restating of the packet, no commentary outside the fields.

## Link the proofs together

When a step relies on another result of the catalog (a lemma, an earlier theorem, a special case), put its id in the
step's `uses`: find it with `grep -i "<name>" build/tl-work/result-index.tsv`. These links, the shared mechanisms and
the shared concept marks join the proofs into the theory graph, so cite every catalog result that a step really uses.

## Mark concept words

Mark 2 to 8 important concept words per theorem as `[word](c:id)`, in the statement, the hypotheses and the steps.
Find ids with `grep -i -P "\tcompact space\t" build/tl-work/concept-index.tsv` (or grep a word and choose the right
sense). The packet's `concept_ids` are a good start. Never mark inside `$...$`. If a concept that matters has no
catalog id, add it to `new_concepts` with a short reminder and definition (rare).

## Family records and scratch files

- If a record names a family of results ("reciprocity law", "index theorem", "zero-one law"), state and prove the
  member that the packet's explanation, concepts and relations point to, and say in `scope` which other members the
  family includes. Prefer a member that has no record of its own in result-index.tsv. Mark a theorem unknown only when
  no member can be identified.
- Keep scratch scripts in a directory named after your part (for example `<scratchpad>/part-NNN/`), never in the
  scratchpad root: other authors work in the same scratchpad at the same time.

## Language

ASD-STE100: short sentences, simple words, active voice, present tense, one instruction per sentence. Use no gendered pronouns for players, agents or people: write "the player", "player $i$" or "they". Mathematical
terms are allowed. No filler, no "clearly", no "it is easy to see".

## Output and checks

Write your answers as one JSON array, in packet order, to the output file named in your task. Build it with a Python
script (`json.dump`), a few theorems at a time, to avoid escaping errors. Then run

    python3 viz/theorem-learner/pipeline/learning.py check <output file>

and fix every problem until it prints `0 problems`. Edit no other file.
