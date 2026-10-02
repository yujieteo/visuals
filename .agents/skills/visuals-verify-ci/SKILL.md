---
name: visuals-verify-ci
description: Run or fix visuals verifiers, and register a new builder in CI and docs.
---

# Verify and CI

Every `scripts/build*.py` accepts `--verify`: re-reads committed data, rebuilds the model in memory, asserts committed HTML and `meta.json` match, and writes nothing.

```sh
for s in scripts/build*.py; do python3 "$s" --verify || break; done   # all builders
python3 scripts/<builder>.py --verify                                  # one builder
```

- `.github/workflows/verify.yml` ("Verify visualizations") lists each builder explicitly, and `commands.test` in `.no-mistakes.yaml` repeats the same commands for the no-mistakes test step. When adding a builder, add its `--verify` line to both and to the README Generation and Verification lists.
- The workflow also runs the Python and Node tests under `tests/`; the commands are in the README Verification section. These are repository-level checks only (mirror docs, the beamdswitch-deck sweep, and the stale action copies' regression tests). Keep them well under a second each, time any test you add (`time node --test tests/<file>.test.mjs`, `time python3 -m unittest tests.<module>`), and put logic or browser tests in the standalone repository instead.
- `build.py --verify` fails if any file under the repo root (including ignored ones such as `.claude/settings.local.json`) contains an absolute user-home path (macOS or Linux home prefix). Remove the path from the file; do not weaken the check.
- A verify failure after a data or builder change usually means the page is stale: regenerate (`.agents/skills/visuals-refresh-data/SKILL.md`), then re-verify.
- Before committing: `git diff --check`, and validate touched JSON with `python3 -m json.tool <file> >/dev/null`.
