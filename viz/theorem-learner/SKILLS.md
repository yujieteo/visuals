---
name: theorem-learner
description: Use Theorem Learner: proofs from concepts to results to read a theorem, compare its proofs, follow how each hypothesis is used, open concept reminders, explore the theory graph and prerequisite trees, and keep a proof as a narrated beamdswitch deck.
---

# Use Theorem Learner: proofs from concepts to results

Live at <https://teoyujie.org/visuals/theorem-learner/>. It extends the [Theorem Explorer](../theorem-explorer/SKILLS.md): the same catalog of results and concepts, taught through proofs. Each theorem has its exact statement and one or more separate proofs; each proof shows how its hypotheses feed its steps and its conclusion, with a small diagram, terse step slogans and a reminder on every marked concept word. A theory graph joins concepts, proof mechanisms, proofs and theorems with no fixed study order. Works offline. To change the page, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Read the fields of the view, their bounds and defaults | `get_metadata` |
| Read the current view, its derived values and the URL that restores it | `get_state` |
| Read the current view (the selected proof) as a Markdown record | `get_markdown` |
| Read a theorem and one of its proofs: roles, steps, inputs and outputs, mechanisms, source and verification | `get_proof` |
| Find theorems or concepts by name, statement, Lean declaration or module | `search` |
| Read a concept: reminder, definition, examples, generality links and the proofs that use it | `get_concept` |
| Read the theory-graph neighbourhood of a node | `get_graph_neighbourhood` |
| Read the prerequisite tree of a theorem or a concept | `get_prerequisite_tree` |
| Keep the selected proof as a talk or a document | the beamdswitch and Markdown buttons |

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title, summary, state schema version and every state field with its type, bounds and default |
| `get_state` | none | The current state, the values derived from it, the JSON that "Load view JSON" restores and the URL |
| `get_markdown` | none | The Markdown record: the deck's frames without narration |
| `get_proof` | `theorem` (required), for example `wd:Q752375`; `proof` (a slug such as `local-bounds`) | The statement, hypotheses and conclusion; the proof's slogan, scope, roles (hypothesis, why, steps or unused), steps (slogan, detail, inputs, outputs, hypotheses, concepts, lemmas), conclusion step, mechanisms, source (lean, web, cited or authored) and the four verification statuses |
| `search` | `query` (required), `kind` (`all`, `theorems`, `concepts`, `declarations`), `page` | Ten results per page, the total count and the page count |
| `get_concept` | `id` (required), for example `c:compact-space` | The reminder, definition and its basis, examples, requirements, generality links with their steps, incoming links and the proofs and steps that use it |
| `get_graph_neighbourhood` | `focus` (required), `expand` (comma-separated ids) | The nodes, the typed edges (defines, used at, supplies, proves, special case of, occurs in) and every neighbour list |
| `get_prerequisite_tree` | `id` (required), `depth` (1 to 6) | The nested tree and a study order of the items not marked known |

## Verification statuses

A proof here is an authored explanation. A formal declaration of the theorem in the pinned mathlib is evidence about the theorem, not about the explanation; "checked correspondence" and "Lean-checked proof" are separate statuses, and no explanation in this snapshot holds either. Read them from `get_proof` before you rely on a proof.

## Exports

- **beamdswitch deck:** `theorem-learner-beamdswitch.md`, a narrated Markdown deck of the selected proof (voice `bf_emma`): statement, concept reminders, hypotheses and roles, one slide per step, conclusion, alternatives and connections, evidence.
- **Markdown record:** `theorem-learner-record.md`, the same frames without narration.
- **JSON view:** `theorem-learner-view.json`, which "Load view JSON" restores. The URL holds the same view.
- **Data:** [data.json](https://teoyujie.org/visuals/theorem-learner/data.json) (`raw.json` here).
