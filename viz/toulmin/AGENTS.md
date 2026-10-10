# Toulmin argument builder: data

The page of this visual is now the notebook `play/toulmin/` of yujieteo/site (`content/play/toulmin/index.md`).
The notebook reads `raw.json` through `data!("viz/toulmin/raw.json")`. The site's `visuals.lock` pins one commit of
this repository and the SHA-256 of `raw.json`, so a change to `raw.json` has no effect on the site until the site
pins the new commit. Change the bytes of `raw.json` only together with a change to the site's `visuals.lock`.

| Key of `raw.json` | What the notebook does with it |
| --- | --- |
| `parts` | It shows the six parts, why each one matters and Toulmin's Harry example. |
| `checklist` | It marks each automatic line CLEAR or OPEN, and lists the confirm questions. |
| `hints` | It shows the prompts. |
| `connectives.paragraph` | It writes the lead-ins of the paragraph, claim-first and grounds-first. |
| `constants.limits` | It cuts a text at its limit, offers 0 to `items` grounds and rebuttals, and refuses more than `arguments` arguments. |
| `constants.qualifierChips`, `sources` | It shows them in the chapter on the six parts. |
| `template` | Its text is the start value of each text box. |

The notebook does not use `constants.timing`, `constants.voices`, `constants.speed`, `connectives.narration`,
`connectives.numberWords`, `constants.limits.author`, `constants.limits.counterFrom`, `checklist.responses.confirmed`,
`checklist.responses.unconfirmed` or `example`: the old page used them for its narrated deck, its character counters,
its confirm toggles and its example menu. The `description` in `raw.json` still names the old page, but its bytes stay
as the site pins them.

Every figure in the template is from Haynes et al., N Engl J Med 2009;360:491-9 (doi:10.1056/NEJMsa0810119), the
Harvard Gazette's 2009 report and WBUR's 15 January 2009 report. Check a new figure against its source before you
add it.

## History

The last commit that has the old JavaScript page is 7e44130. That commit also has these files:

- `index.html`, the page: the engine, the deck writer, JSON import and export, and the WebMCP tools.
- `tests/`, the Node tests and the golden deck. `e2e/`, the browser checks.
- `SKILLS.md`, the WebMCP tools of the page. `README.md`, the description of the page and its tests.

Tests are disposable: check a change end to end in the built notebook, and do not commit regression tests.
`python3 ../../scripts/check.py toulmin` runs the checks of this visual. The rules for every visual are in
[SKILLS.md](../../SKILLS.md).
