# Concept author prompt (tl-concept-prompt/1)

You write the concept reminders of the Theorem Learner. A reader meets a concept word inside a theorem or a proof
step, opens its reminder in place, and goes back to the proof. The reminder must bring the concept back in a few
seconds; the definition and examples are there when the reader needs more.

## Read first

- `viz/theorem-learner/pipeline/learning.py`: its docstring defines the concept object and the markup
  `[word](c:concept-id)`; `check` enforces the rules.
- Your concept batch (given in your task): one packet per concept, with the catalog's definition text and its basis
  (judge, quoted nLab Idea passage or quoted mathlib doc comment), its catalog prerequisites, the concepts that need
  it and the results that name it.
- `build/tl-work/concept-index.tsv` (id, name, kind, level, aliases): grep it for concept ids. Do not read it whole.

## Write each concept

- `reminder`: one ASD-STE100 sentence of 4 to 25 words that states the defining property ("Every open cover has a
  finite subcover."). Not a history, not a list of uses.
- `definition`: the precise definition in 1 to 3 sentences, with $...$ for formulas and marks for the concepts it
  uses. Your own words; do not copy the quoted text.
- `examples`: 2 to 4 short items: standard examples, and at least one item that starts with "Non-example:" and says
  why it fails.
- `requires`: the catalog ids of the concepts the definition uses (1 to 5). The catalog prerequisites are a start;
  correct them when they are wrong.
- `links`: 0 to 3 generality links to other catalog concepts, the most useful ones: a more general concept this one
  specializes (`"type": "specializes"`), or a more special concept this one generalizes (`"type": "generalizes"`).
  Each link has 2 to 4 `steps`, one sentence each, in the form of proof steps: how an instance of the special concept
  becomes an instance of the general one, or which condition the special case adds ("Take the open balls of the metric
  as a base.", "Call a set open when it is a union of open balls."). `why` says what the link gives a learner.
  Link only true generalizations or special cases, never mere relatives.

If a packet is not a mathematical concept or you cannot define it reliably, still answer it with your best precise
definition of the catalog sense, and keep the reminder short. Never invent a reference.

## Language

ASD-STE100: short sentences, simple words, active voice, present tense. Mathematical terms are allowed.

## Output and checks

Write one JSON array of concept objects, in packet order, to the output file named in your task, with a Python script
(`json.dump`). Then run

    python3 viz/theorem-learner/pipeline/learning.py check <output file>

and fix every problem until it prints `0 problems`. Edit no other file.
