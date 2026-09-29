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

- `.github/workflows/verify.yml` ("Verify visualizations") lists each builder explicitly. When adding a builder, add its `--verify` line there and add it to the README Generation and Verification lists.
- `build.py --verify` fails if any file under the repo root (including ignored ones such as `.claude/settings.local.json`) contains an absolute user-home path (macOS or Linux home prefix). Remove the path from the file; do not weaken the check.
- A verify failure after a data or builder change usually means the page is stale: regenerate (`.agents/skills/visuals-refresh-data/SKILL.md`), then re-verify.
- Before committing: `git diff --check`, and validate touched JSON with `python3 -m json.tool <file> >/dev/null`.
