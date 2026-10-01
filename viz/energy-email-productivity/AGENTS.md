# AGENTS.md

Your energy dips mid-afternoon. Your inbox doesn't.: A stylised workday alertness curve beside measured email-interruption findings: 70% of emails answered within 6 seconds, 64 seconds to refocus, and less stress at three checks a day.

Live: https://teoyujie.org/visuals/energy-email-productivity/

## Source of truth

This folder is `viz/energy-email-productivity/` in [yujieteo/visuals](https://github.com/yujieteo/visuals). The standalone repository [yujieteo/energy-email-productivity](https://github.com/yujieteo/energy-email-productivity) is a read-only exact mirror of this folder. Make every change upstream in `yujieteo/visuals`; do not edit or open pull requests against the mirror.

## Files

| File | Role |
| --- | --- |
| `index.html` | Generated page. Do not hand-edit. |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into `index.html`. |
| `report.js` | Builds the narrated deck from the page's data, inlined into `index.html`. |
| `AGENTS.md`, `SKILLS.md`, `LICENSE` | Agent guides and the MIT licence. |

## Build, test and verify

Run from the root of a `yujieteo/visuals` checkout (Python 3 standard library and Node 22; nothing to install):

```sh
python3 scripts/build_energy_email_productivity.py
python3 scripts/build_energy_email_productivity.py --verify
node --test tests/energy-email-productivity-beamdswitch.test.mjs tests/voice-beamdswitch.test.mjs
```

Change the data or `scripts/build_energy_email_productivity.py`, then regenerate; never hand-edit `index.html`. Before opening a pull request, run the full suite in the upstream README's Verification section, which CI (`.github/workflows/verify.yml`) runs on every push.

## Data and tests

- Data: `data/energy-email-productivity/raw.json` and `meta.json`.
- Deck report: `report.js` in this folder.
- Tests: `tests/energy-email-productivity-beamdswitch.test.mjs`, and `tests/voice-beamdswitch.test.mjs` for every deck page.

## Conventions

- Single self-contained HTML page: CSS, data and JavaScript are inline, with no external requests.
- JavaScript tests run with `node --test` only; never add Vitest or another runner.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- Never commit credentials, host details or absolute home-directory paths.
