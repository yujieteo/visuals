# Checklist Manifesto Maker: state and file formats

The page is one self-contained `index.html` (built by `build.py`). It keeps a library of checklists in the browser's
`localStorage` under the key `checklist-manifesto-maker`, and writes and reads two file formats that carry the same
versioned semantic state: the **Markdown profile** and the **Beam MD Switch profile**. This file is their reference.
Both are schema version 1.

## Semantic state

A checklist entry is:

| Field | Meaning |
| --- | --- |
| `checklist` | The draft definition (below). |
| `reviewers` | Reviewer records: `{ id, name, revision, date (YYYY-MM-DD), note }`. User supplied; never a verified approval. A record whose `revision` is not the checklist's revision is stale. |
| `reviewedRevision` | The revision the author last marked reviewed in Review (0 for none). A Run needs it to equal the current revision. |
| `trialNotes` | Free text from the Exercises view; not content, so it makes no revision. |
| `run` | `null`, or the Run (below). |

The definition (`checklist`, and the Run's own copy):

| Field | Meaning |
| --- | --- |
| `id`, `title`, `revision` | Stable checklist id (`cl1`…), its name, and a revision that every content change raises by one. |
| `example` | The bundled example it came from (`day-trip`, `static-page`, `appointment`), or `""`. While set, the page labels it "Example — adapt and review before use". |
| `requiresReview` | When true, a Run needs a reviewer record for the current revision. |
| `details` | `intendedUsers`, `equipment`, `applicability`, `sources`, `notes`: optional text. |
| `originalText` | Pasted or imported text, kept for review. |
| `pausePoints[]` | `{ id, title, mode, details, items[] }`; `mode` is `read-do`, `do-confirm` or `""` (not chosen yet). |
| `items[]` | Normal step `{ id, kind: "step", text, details, required, dependsOn[] }`; critical check adds `applicability` (the rule under which not applicable is allowed; empty means never) and `ifFailed` (the stop instruction). `dependsOn` names critical checks whose failure or correction clears this item's result. |
| `stopConditions[]` | `{ id, text, instruction, escalation, at[] }`: `escalation` names an escalation condition or is empty; `at` lists pause points (empty means every pause point). |
| `escalationConditions[]` | `{ id, text, contact, action, at[] }`: `contact` is the named person or role. |
| `recoveryRoutes[]` | `{ id, title, triggers[], steps[], restartChecks[], restartAt }`: `triggers` name critical checks (on failure) or stop conditions (on report); `steps` are the recovery steps in order; `restartChecks` must each be confirmed; `restartAt` is the restart destination. |
| `none` | `{ stop, escalation, recovery }`: true records "None specified" for a category that has no entries. |
| `seq` | The counter new ids are made from. |

Every id matches `^[a-z][a-z0-9-]{0,63}$` and is unique within the checklist. The Run:

| Field | Meaning |
| --- | --- |
| `id`, `revision`, `checklist` | `run1`…, the revision it runs, and a copy of that revision's definition. Editing the draft never changes it. |
| `status` | `active`, `complete` or `ended`. |
| `current`, `completed[]` | The current pause point, and the confirmed pause points in order from the first. |
| `results` | One `{ value, reason }` per item: steps `pending` or `done`; critical checks `pending`, `passed`, `failed`, `unknown` or `not-applicable`. Only `not-applicable` has a reason, and only with an authored rule. |
| `reports[]` | Reported conditions `{ id: repN, condition, at, status: active | resolved }`. |
| `recovery` | `null`, or the route in progress `{ route, trigger, done[], confirmed[] }`. |
| `hold` | `null`, or `{ reason: restored | imported | correction, text }`: the Run waits for the person to confirm the current pause point. |
| `notice`, `log[]` | The last explanation shown, and the Run's event log. |

Normal progress at a pause point needs every required step done and every required critical check passed (or not
applicable with a reason), no critical check failed or unknown, no active stop report, no recovery in progress and no
hold. A restart needs every recovery step done and every restart check confirmed; it clears the trigger and the results
that depend on it (or, with no authored dependency, every result at the current pause point) and goes to the restart
destination. A correction that makes a result invalid reopens that pause point, clears its dependents and holds the
Run with an explanation.

## Markdown profile, schema version 1

An export is two parts, both generated from the same state, so equal states give equal bytes:

1. **The readable checklist**, for people and printers:
   - `# <title>`, an example notice when `example` is set, and a line naming the profile, the checklist id and the
     revision;
   - `## Checklist details`: the optional fields, the review requirement, the author review and the reviewer records;
   - `## Pause point N: <title> (Read–Do | Do–Confirm)`: the mode's instruction, then one task-list line per item
     (`- [ ] <step>` or `- [ ] **Critical check:** <check>`, with `(optional)` for an optional item and nested
     `Details`, `Not applicable when`, `If it fails` and `Depends on` lines), then the stop conditions that apply there;
   - `## Stop conditions`, `## Escalation conditions`, `## Recovery routes` (one `### Recovery route:` each), an
     optional `## Trial notes`, and `## Run progress`.

   User text is written on one line (line breaks as ` / `) with every character that could start Markdown or HTML
   escaped with a backslash (`` \ ` * _ [ ] < > | ~ # & $ ! ``, and a leading `:`, so no line starts a `:::` block).
2. **The payload**, the last thing in the file:

   ```text
   <!-- checklist-manifesto-maker:state
   { "format": "checklist-manifesto-maker", "schemaVersion": 1, "checklist": …, "reviewers": …,
     "reviewedRevision": …, "trialNotes": …, "run": … }
   -->
   ```

   The JSON is indented by two spaces with keys in a fixed order. `<` and `>` inside it are written as `<` and
   `>`, so no text can end the comment early or open another one.

Import reads the file entirely on the device and changes nothing until the person chooses **Create copy** or
**Replace current checklist** in the preview. It refuses, with the reason: a file over 1 MiB (1,048,576 bytes; never
truncated), more than one payload, a payload without its `-->`, text after the payload, JSON that does not parse, another
format or an unsupported schema version, unknown fields, wrong types, invalid or duplicate ids, references to things
that do not exist, results or categories outside the lists above, and a Run whose own checklist copy has an error
that Review would block. It then rebuilds the readable part from the
payload; if that is not exactly the text before the payload (line endings aside), the readable checklist and the state
disagree and the import is refused, with the first differing line named. The page then offers the plain draft import of
the same text. A file with Run progress asks the person to restore it (held until they confirm the pause point) or to
discard it; nothing advances automatically.

## Beam MD Switch profile, schema version 1

The deck is the output of the site's beamdswitch template (`beamdswitch.js`, byte-identical to yujieteo/site
`templates/beamdswitch.js`), then a blank line and the same payload comment:

- `---` front matter with `title`, `subtitle` (revision, pause points, example notice) and `voice: bf_emma`;
- `# Set-up` (the checklist and who uses it), `# Method` (how each pause point is used), `# Results` with one
  `## Pause point N: <title> (Read–Do | Do–Confirm)` frame per pause point in order, showing its items with the critical
  checks and failure instructions and its stop conditions, and `# Checks and takeaway` (stop and escalation conditions,
  recovery and restart, and a final frame with the one `::: key`);
- every slide has a `::: narration` block of plain spoken prose; item details go in `::: notes`.

Import Beam MD Switch restores this tool's decks exactly, with the same checks as Markdown. It presents the checklist;
it is not an interactive Run. Any other deck is read as a plain draft.

## Plain Markdown and arbitrary decks

A file without a payload (or chosen with **Import plain Markdown as a draft**) becomes a new draft:

- the first `#` heading (a deck's front-matter `title`) is the title;
- each `##` heading is a pause point, except the reserved headings above (Checklist details, Stop conditions, Escalation
  conditions, Recovery routes, Trial notes, Run progress); a leading `Pause point N:` is dropped and a trailing
  `(Read–Do)` or `(Do–Confirm)` (or `read-do`, `do-confirm`) sets the mode;
- each top-level list or task-list entry (`-`, `*`, `+`, `1.`, `1)`) is a normal step; entries before the first `##`
  go into an unnamed pause point.

Everything else (paragraphs, deeper headings, nested lines, tables, code, comments, deck sections and `:::` blocks) is
listed in the preview as unsupported and not imported. A ticked box is imported as not done, a "Critical check:" label
stays text, and no critical status, condition, recovery route, reviewer record or completed work is inferred.

## Pasted process text

Each list entry (with its indented continuation lines) or, when the text has no list markers, each non-empty line
becomes one draft normal step in one pause point, with heading and quote markers removed. Nothing is summarised,
merged or invented; the original text is kept for review, and duplicate or long items are flagged for the person.
