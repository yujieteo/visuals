# Generation policy

How an external generator chooses, writes, ranks and later resolves the cards of a Calibrator
session, and how a recording agent reads the answers. This is the one canonical policy; a generator
loads it before writing a session. The schema it writes into is in
[README.md](../README.md#session-toon-schema) and is unchanged by this policy.

## Objective

Generate probability cards that help the person choose impactful actions, discover possibilities
they did not know existed, and reconsider their direction. Present them as an ordinary
`calibrator-session` for the person, or their agents, to consider.

Health is the primary goal and a constraint on other pursuits. The person states a health
baseline, a minimum routine they have chosen, in the generator's inputs. Treat it as a planning
requirement the person selected, not as a claim that it alone establishes a health outcome. Cards
may challenge competing projects, routines, methods and goals; they never replace or reduce the
baseline.

## Scope and compatibility

- The policy governs external generation, ranking and the interpretation of responses. The page
  stays an offline probability instrument and gains no generation logic.
- Keep `calibrator-session` version 1 and every existing field, the slider, import and export,
  sources, claims and immutable first answers. Store no additional fields inside a version 1
  document.
- No category quotas. Unfamiliar or out-of-pattern cards have no fixed share and need not be a
  majority, and novelty does not lead the ranking.
- A probability answer is a belief that the proposition is true. It is not an action selection,
  and not permission for an agent to execute an action, stop a project or change a goal.
- Historical sessions and responses stay as they are. This policy changes future generation and
  future interpretation; it does not rewrite old answers or turn earlier readings of them into
  authorization.

## Generation procedure

### 1. Establish the current situation

Read the person's explicit goals, health baseline, recent first-hand observations, answered
sessions, outstanding actions and their outcomes, relevant project state and external sources.
Record the files, commits and retrieval dates in `session.inputs`.

Keep four kinds of input apart: the person's own statements, observed facts, agent-written
interpretations, and missing information. An agent-written note is not independent confirmation
of the inference it repeats. A missing record of an action does not show the action was omitted.

Done when each candidate's personal context traces to evidence or is labelled a hypothesis. Ask
for private information only when a candidate depends on it; otherwise propose a cheap check
rather than inventing the fact.

### 2. Search for opportunities before choosing solutions

Build a compact internal candidate set that covers:

- better execution of the health baseline, including less friction and fewer competing demands;
- familiar, effective actions that remain worth more than another new idea;
- unknown capabilities and established methods from adjacent fields;
- overlooked problems, incorrect assumptions and alternative framings of a problem;
- reducing, stopping or replacing existing work, including genuinely exciting projects;
- cheap, reversible experiments with a low chance of success but a large plausible upside.

Search beyond the person's notes: primary documentation, research, concrete examples and existing
capabilities. Unconventional practices and conventional practices that are new to the person
both qualify. Describe a capability without assuming the person has never heard of it.

For each candidate, write down the problem, mechanism, plausible benefit, evidence, downside,
first step, executor, and any activity it would displace. This working material stays outside the
session document.

Done when every retained candidate has a concrete mechanism and first step. A list of
interesting tools or generic habit advice is not enough.

### 3. Select by impact and feasibility

Health and support for the baseline come first. Compare candidates by plausible size of benefit,
strength of evidence, downside, effort, reversibility, and competition for time and attention.
Count the costs of setup, maintenance, supervision and recovering from failure.

A large plausible upside, little downside and an easy first step can rank an unfamiliar option
above a familiar one despite low confidence. Judge the experiment's cost and information value,
not only the outcome hoped for. State the uncertainty: speculative upside is not established
benefit.

Novelty is a diversity consideration or a tie-breaker, never a substitute for impact. Cluster
candidates by underlying problem and mechanism: several tools for the same opportunity are one
discovery, not several. Keep separate cards only where the choices differ materially in cost,
downside or outcome.

Propose sacrifices where evidence supports a conflict with health or with more impactful work,
and say what would be gained and lost. A new direction may replace an old one, and current plans
do not automatically outrank alternatives; equally, a discovery need not become another
commitment.

Use the requested session size, or the generator's default, with no category quota. When there
are not enough strong candidates, write a shorter valid session and report the shortfall outside
the session rather than padding it. Add follow-up cards when new evidence, a due decision or an
unresolved outcome changes the action; repeat a reminder only when it is consequential.

Done when every card earns its place through impact, decision value or useful learning. Record a
short selection reason per card and the duplicates rejected in a compact generation summary kept
outside the session.

### 4. Write cards in the existing fields

| Field | Required behaviour |
| --- | --- |
| `proposition` | One literal, assessable proposition. Prefer a dated forecast about feasibility, an observable result or a bounded experiment. The slider estimates whether it is true. |
| `context` | Briefly state the opportunity, mechanism and uncertainty. For a sacrifice, name the supported conflict. Label an inferred problem as a hypothesis. |
| `high_action` | A concrete next step that makes sense if the proposition is likely true, with a date or bounded trial, naming a human or agent executor when relevant. |
| `low_action` | A coherent alternative if the proposition is likely false: keep the baseline, defer, drop, reduce the trial or investigate. Check that the two actions are not swapped. |
| Ranking scores | Keep the five required 0–100 scores. An `action_impact` of 80 or more makes a slow card (below), so reserve it for the cards whose answer would change a consequential action. They are the generator's judgements, not measured expected utility. Order the cards by the selection policy above; novelty and adversariality cannot dominate it. |
| `origin`, `explore_exploit` | Use the existing categories honestly. An external method is not necessarily recent news; its source keeps its actual date. |
| `resolution_rule`, `resolution_horizon` | Define the observable result, the evidence needed and the assessment date, naming the exact forecast being resolved. |
| Resolution fields | New cards are `unresolved` with `null` outcome and evidence. Resolve later only when the specified evidence exists. |
| `sources`, `claims` | Checkable support for personal context and external claims. Keep established capability, evidence of benefit and conjectured personal applicability apart. |

Keep each card short enough to answer without opening its sources; sources and claims survive in
the export.

High and low actions describe conditional options, not instructions. A cheap diagnostic
experiment may be sensible at both high and low confidence, so the two actions need not differ.

Done when each card reads consistently from proposition through actions to resolution and needs
no undocumented reading of the slider.

### Effort per card

Answer time should follow the stakes in both directions. Version 1 has no field for expected time,
so the page derives it from `action_impact`: a card scoring 80 or more is a slow card, marked
*High impact: take your time*, and a first answer to it within 8 seconds of the card appearing
asks for confirmation before it is saved. Other cards should be answerable at a glance, so keep
their wording short and their context to one or two sentences. Give 80 or more only to the
decision-changing cards, roughly one in ten; scoring everything high makes the prompt a nag that
is clicked through. The time to answer is a measure of effort, not of the answer's quality.

### 5. Resolve observable outcomes honestly

Use existing activity records or a simple report from the person where available. Keep four
outcomes distinct:

- **Execution:** whether the action or trial happened.
- **Feasibility:** whether it fitted the routine or supported the baseline under a stated
  condition.
- **Learning:** whether a specified test answered a question or exposed a discrepancy.
- **Health outcome:** whether an appropriate measurement supports the claimed change.

Completing a routine resolves an execution forecast, not a health-benefit forecast. Where a
health effect is hard to measure, ask an execution or feasibility question and say that the
benefit remains unverified. Leave a missing or ambiguous result unresolved: the absence of a note
is not a false outcome. Never resolve a card from the person's probability answer, or from an
agent's restatement of that answer.

Health claims behind a card need suitable sources and limited wording. Preserve the baseline and
flag a documented health conflict for the person to assess; this policy gives no authority to
override individualized clinical advice.

Done when every resolved outcome has evidence matching its original rule, and unresolved health
benefits stay explicitly uncertain.

## Reading and recording answers

- Quote each answer as a belief: “I gave 85% that …”. Do not convert a threshold such as 80 or
  more, or 20 or less, into an endorsement of the high or low action.
- Keep the card's high and low actions as proposals. An action becomes a decision only when the
  person separately chooses it, for example in their own words or an explicit instruction, and an
  agent acts on it only within the authorization it already holds.
- Readings recorded before this policy keep the rules in force when they were written; do not
  rewrite them, and do not treat them as authorization for new work.
- Assess usefulness from later trials and the person's feedback. Answering quickly, endorsing a
  card or giving an extreme probability is not evidence of benefit.

## Checks before a session goes out

1. The session decodes and validates with the page's own parser (`validate_session_toon`, or
   `Calibrator.parseSession` from `index.html`), and `node --test 'tests/*.test.mjs'` passes.
2. Every card is reviewed against the table above. Schema validity alone does not establish
   recommendation quality.
3. These cases hold:
   - a cheap, low-confidence experiment with a large upside can survive selection;
   - a novel but costly distraction loses to a stronger familiar action;
   - a sacrifice can target an exciting project while the health baseline is preserved;
   - a completed activity does not resolve a health-benefit forecast;
   - no card has its high and low actions reversed. Run `node scripts/polarity.mjs <session.toon>`
     before publishing and read every card it flags; it needs no network and exits 1 when it
     flags any. It is a word heuristic: it found eight of the first session's ten swapped cards
     and flags about one or two sound cards per hundred, so it narrows the review and never
     replaces it, and a flagged card is rewritten only after reading it. A cheap model pass over
     every proposition and its two actions may be added on top, also only to flag.
4. The generation summary, outside the session, lists priorities, sources, duplicates removed,
   uncertainties and any shortfall in strong candidates.

## Example card

This illustrates the semantics only; it is not a ready-to-import card.

- Proposition: “During the seven-day trial ending 18 October, with one recurring review window
  moved away from my planned walk, will I meet my daily step baseline on at least five days?”
- Context: “Hypothesis: review timing may compete with walking. Check the calendar first; this
  tests scheduling feasibility, not a health outcome.”
- High action: “If the calendar confirms overlap, move that review window for 12–18 October and
  record daily steps.”
- Low action: “Keep the review window; check which other demand overlaps the planned walk.”
- Resolution: “True if a confirmed-overlap trial occurs and records show at least five days at the
  baseline; false if the completed trial falls below five; unresolved if the overlap, the trial or
  the records are missing.”

It tests success under the changed schedule. It does not show that the change caused success, and
it leaves the rest of the baseline untouched.
