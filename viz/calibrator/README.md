# Calibrator

A low-friction probability elicitation instrument. An external question generator writes a ranked
session of questions as TOON; Calibrator shows them one at a time, records one probability per
question with a single slider, saves progress on the device, and copies the answered session back
as TOON. Live at <https://teoyujie.org/visuals/calibrator/>.

Calibrator is deliberately dumb: no LLM calls, no news fetching, no search, no question
generation, no backend, no accounts. `index.html` is one self-contained file with no network
requests; it works offline and from `file://`.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="calibrator-engine">` is the pure core (`self.Calibrator`): the TOON codec, the session schema and its validation, and the session state machine (answer, revise, skip, back, export). It has no DOM, storage, clock or network use; callers pass times in milliseconds. `<script id="calibrator-ui">` is the page: paste and file import, the question card, `localStorage` persistence, the export sheets and eight read-only WebMCP tools. The same file holds the life interview mode (below). Edit this file directly; there is no build step. |
| `raw.json` | Catalogue data, published as `data.json` on the site: the schema's format, version, table fields, origins, scores and states. The page never fetches it; the tests fail when it drifts from the engine. |
| `sample-interview.toon` | A ten-question sample life interview batch in the `optchat-interview` import schema. Its answers in the tests are examples, not facts about a person. |
| `sample-session.toon` | A five-question sample session in the import schema, for trying the page and as a target for the generator. |
| `sessions/` | Generated sessions ready to paste, one `YYYY-MM-DD.toon` per session. |
| `scripts/polarity.mjs` | The offline polarity check run before a session is published: `node scripts/polarity.mjs <session.toon>` lists the cards whose high and low actions look swapped, and exits 1 when it flags any. A word heuristic with no network use; it flags cards for reading and never rewrites one. |
| `docs/generation-policy.md` | The canonical policy an external generator follows to choose, write, rank and resolve a session's cards, and how answers are read. |
| `AGENTS.md` | What is specific to changing the tool. |
| `SKILLS.md` | For agents using the page: its tasks, the read-only WebMCP tools and the workflow. |
| `LICENSE` | MIT. |

## Workflow

1. Ask a crewmate for a new session; it writes a session TOON (below) from `data/notes.md`,
   the site's `raw.toon`, current public project state and relevant public news, following the
   [generation policy](docs/generation-policy.md).
2. Copy the TOON, open Calibrator, tap **Paste Session** (or **Import .toon**).
3. Move the slider: the first release saves the probability and moves to the next question.
   **Back** revisits; moving the slider there revises the final probability but never the first.
   **Skip** is one tap. A card with `action_impact` of 80 or more is marked *High impact: take
   your time*, and a first answer to it within 8 seconds asks **Save** or **Think again** before
   it is saved.
4. **Export** (top right, any time; it opens by itself after the last question) shows the
   answered, skipped and unseen counts. **Copy TOON** copies the answered session.
5. Give it to the crewmate, which appends it to `raw.toon` and writes only consequential notes
   (tagged `#calibrator`) to `data/notes.md`. It reads each probability as a belief, not as a
   choice of the card's action ([policy](docs/generation-policy.md#reading-and-recording-answers)).

The active session lives in `localStorage` (`calibrator:session`) and is saved after every
interaction, so closing the page loses nothing. Importing a different session while the current
one has unexported work asks first; a replaced session is kept once under `calibrator:previous`.
Pasting the same `session_id` again resumes it.

## Session TOON schema

TOON as written by yujieteo/site's `scripts/toon.py`: comma delimiter, two-space indentation, no
trailing newline, strings quoted only when needed, `null` for missing values, an empty table as
`name: []`. Every table is a uniform tabular array, so sessions append to `raw.toon` by
concatenating rows. Question order is the generator's ranking under the [generation policy](docs/generation-policy.md);
it is fixed for the session.

### Import (`session.toon`, written by the generator)

```
format: calibrator-session
version: 1
session:
  session_id: …
  generated_at: …
  generator: …
  inputs: …
questions[N]{question_id,session_id,proposition,context,high_action,low_action,origin,info_gain,action_impact,novelty,adversariality,relevance,explore_exploit,resolution_rule,resolution_horizon,resolution_status,outcome,resolution_evidence,generated_at}:
  …
sources[M]{question_id,source_id,title,url,published_at,retrieved_at}:
  …
claims[K]{question_id,source_id,claim}:
  …
```

| Table | Field | Rule |
| --- | --- | --- |
| `session` | `session_id` | Required; letters, digits, `.`, `_`, `-`. Pasting the same id again resumes that session. |
| | `generated_at` | Required timestamp (ISO 8601). |
| | `generator`, `inputs` | Optional text (or `null`): which generator, and the explicit inputs it read (for example commits of `notes.md` and `raw.toon`). |
| `questions` | `question_id` | Required, unique, immutable for life; letters, digits, `.`, `_`, `-`. The site's Corpus Record is `calibration:<question_id>`. |
| | `session_id` | Must equal `session.session_id`. |
| | `proposition` | Required. The question shown, phrased so the slider is the probability it is true. |
| | `context` | Text, may be empty (`""`). One short line shown under the proposition. |
| | `high_action`, `low_action` | Required. Shown as “High →” and “Low →”. |
| | `origin` | `news`, `notes`, `project`, `calibration` (previous calibration) or `synthesis` (contradiction or synthesis). |
| | `info_gain`, `action_impact`, `novelty`, `adversariality`, `relevance` | Generator scores, numbers from 0 to 100. Used to rank and never shown, except that an `action_impact` of 80 or more marks a slow card (see Workflow). |
| | `explore_exploit` | `explore` or `exploit`. |
| | `resolution_rule`, `resolution_horizon` | Required text: how the question resolves automatically, and by when (a date or a phrase such as `next session`). |
| | `resolution_status` | `unresolved` or `resolved`. A new question is `unresolved`. |
| | `outcome` | `true`, `false` or `null`; always `null` while unresolved. |
| | `resolution_evidence` | Text or `null`. |
| | `generated_at` | Required timestamp. |
| `sources` | `question_id`, `source_id` | The question and a source id unique within it. Every question needs at least one source. |
| | `title`, `url`, `retrieved_at` | Required. |
| | `published_at` | Timestamp or `null` when unknown. |
| `claims` | `question_id`, `source_id`, `claim` | One factual claim extracted from that source. A source may have none or several. |

Unknown fields or top-level keys are rejected, so nothing is silently dropped. Sources and claims
are never shown while answering; they survive in the export.

### Export (`answered-session.toon`, written by Copy TOON)

The import, unchanged, plus:

- `session` gains `question_count`, `imported_at`, `exported_at`, `answered`, `skipped`, `unseen`.
- `responses[N]{question_id,state,first_probability,final_probability,revision_count,time_to_first_answer_ms,time_to_final_answer_ms,first_shown_at,first_answered_at,final_answered_at}`: one row per question, in order.
- `revisions[R]{question_id,revision,probability,at,ms_since_first_shown}`: every later change of an answered question's probability, numbered from 1.

| `state` | Meaning | Other response fields |
| --- | --- | --- |
| `answered` | A probability was given. | `first_probability` (never overwritten) and `final_probability`, integers 0–100; `revision_count`; `time_to_first_answer_ms` (from the question's latest display to the first answer); `time_to_final_answer_ms` (from its first display to the final answer); ISO timestamps. |
| `skipped` | Explicit negative selection: Skip was tapped. | All `null`. |
| `unseen` | No information about preference. | All `null`. |

Skipped and unseen are different and must never be merged. An untouched question has no
probability: there is no 50% default. Skipping an answered question keeps its answer; answering a
skipped question makes it answered.

### raw.toon (the site's history)

yujieteo/site keeps the canonical history at `data/calibrator/raw.toon`, published at
<https://teoyujie.org/calibrator/raw.toon>. It holds the same tables accumulated over sessions:

```
format: calibrator-raw
version: 1
sessions[S]{session_id,generated_at,generator,inputs,question_count,imported_at,exported_at,answered,skipped,unseen}:
questions[…]{…same fields as above…}:
sources[…]{…}:
claims[…]{…}:
responses[…]{…}:
revisions[…]{…}:
```

Appending an export means adding its `session` object as one `sessions` row and its other tables'
rows to the matching tables (an empty table is written `name: []`). Resolution is automatic only:
a later pass may set `resolution_status`, `outcome` and `resolution_evidence` from later notes,
sessions, project state or public facts, and leaves a question `unresolved` when unsure. The site
build turns each answered question into one Corpus Record, `calibration:<question_id>`.

## Life interview

The life interview is a second mode of the same page. It asks written questions about a life, not
probabilities. An external interview generator reads the person's OptChat history and writes a
batch of 10 questions as `optchat-interview` TOON. The generator asks first about gaps in the
timeline, then about subjects and turning points. It does not ask about facts that the history
already records. Calibrator does not generate questions and makes no model calls.

1. Tap **Paste Session** or **Import .toon** and give it the batch. The page reads the `format`
   line and opens the interview mode for an `optchat-interview` document.
2. Write the answer. **When** (optional) takes an approximate date: `2015`, `2015-06`,
   `2015-06-12`, or an interval such as `2014/2016`. **Confidence** (optional) is a whole number
   from 0 to 100.
3. Tap **Submit** to send the answer and go to the next question. The page keeps the first
   submission forever. A changed submission later adds a revision. An unchanged submission adds
   nothing.
4. Tap **I don't remember** when you cannot answer. This is a submission of its own kind, not a
   skip. Tap **Skip** to pass a question. **Back** goes to the previous question.
5. **Export** shows the counts and copies the answered batch as TOON. Give it to OptChat's
   `ingest`. The page never writes OptChat's canonical files.

The page saves the batch and each draft on the device after each change (`calibrator:interview`;
a replaced batch stays once under `calibrator:interview-previous`, and `calibrator:mode` remembers
the open mode). A draft is the form text that you did not submit. Drafts never go into the export.
A probability session and an interview have different keys, so one never changes the other.

## Life interview TOON schema

The same TOON rules as the session schema. The format has its own name and version, apart from
`calibrator-session`.

### Import (`interview.toon`, written by the generator)

```
format: optchat-interview
version: 1
batch:
  batch_id: …
  generated_at: …
  generator: …
  inputs: …
questions[10]{question_id,batch_id,prompt,context,topic,period,gap,generated_at}:
evidence[N]{question_id,ref,reason}:
```

| Field | Meaning |
| --- | --- |
| `batch_id`, `question_id` | Letters, digits, `.`, `_` and `-`. A question ID is permanent: OptChat keys each answer by it. |
| `prompt` | The question that the page shows. |
| `context` | One or two sentences that the page shows below the question, or `""`. |
| `topic` | A short label that the page shows above the question. |
| `period` | The approximate time the question asks about (`YYYY`, `YYYY-MM`, `YYYY-MM-DD` or `A/B`), or `null`. |
| `gap` | What the history does not record, so the reason for the question. The page does not show it. |
| `evidence` | At least 1 row for each question. `ref` is what the generator read: `optchat:<id>` for a message, `optchat:<id>+<n>` for a summary line, or another scheme such as `site:notes.html#note:<hash>`. The page does not show or open it. A public export removes it. |

### Export (`answered-interview.toon`, written by Copy TOON)

The import, unchanged, plus:

- `batch` gains `question_count`, `imported_at`, `exported_at`, `answered`, `dont_remember`, `skipped`, `unseen`.
- `responses[N]{question_id,state,revision_count,first_shown_at,first_submitted_at,final_submitted_at}`: 1 row for each question, in order.
- `answers[A]{question_id,revision,kind,text,confidence,event_date,submitted_at}`: every submission. Revision 1 is the first answer, and the revisions of a question run 1, 2, 3 in order.

| `state` | Meaning |
| --- | --- |
| `answered` | The latest submission has `kind` `answer`, with a `text`. |
| `dont_remember` | The latest submission has `kind` `dont_remember`. Its `text`, `confidence` and `event_date` are `null`. |
| `skipped` | Skip was tapped, and there is no submission. |
| `unseen` | No submission and no skip. |

An exported batch imports again with all its submissions, so a later revision adds the next
revision number. OptChat's `ingest` adds only the `(question_id, revision)` rows that it does not
have yet.

## Tests

`node --test 'tests/*.test.mjs'` (Node 22, as CI runs it). `tests/calibrator.test.mjs` loads
the engine from `index.html` and checks only: valid session import, invalid TOON rejection
(unknown escapes and non-object table rows included), the unanswered state, first-answer capture,
auto-advance, Back and revision preservation, Skip, the answered/skipped/unseen distinction, local
persistence serialization, the export round-trip, the slow-card confirmation, that every file in
`sessions/` still imports, and the polarity check against the ten swapped cards of the first
session, and that a session saved before the life interview existed
(`tests/fixtures/saved-session-v1.json`) restores and exports the same bytes.
`tests/interview.test.mjs` checks the life interview: import and the format switch, schema
rejection, drafts, submission and revisions, I don't remember and Skip, the export round-trip and
the second import, and persistence.
`tests/fixtures/` holds a read-only copy of the site's `scripts/toon.py` and the TOON files it
wrote (`python3 tests/fixtures/make_fixtures.py` regenerates them, `sample-session.toon` and
`sample-interview.toon`);
the tests require the page's codec to write them byte for byte. There are deliberately no browser
end-to-end tests.
