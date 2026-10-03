# AGENTS.md: TOTO ball frequency

How often each Singapore Pools TOTO ball, 1 to 49, was a winning number in the last 3 months, 6 months or 1 year of published draws, coloured by band. Every draw is random, so past counts do not predict future draws. Live at <https://teoyujie.org/visuals/toto-frequency/>.

## Source of truth

The standalone repository [yujieteo/toto-frequency](https://github.com/yujieteo/toto-frequency) is where this visualisation and its tests develop and where CI runs them. `visuals/toto-frequency/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/toto-frequency) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`.

## Files and data

| File | Role |
| --- | --- |
| `fetch.py` | Downloads draw results from Singapore Pools into `draws.csv`, fetching only new draws |
| `draws.csv` | One row per draw: number, date, winning numbers, additional number, source URL, retrieval date |
| `report.js` | The page's numbers as a beamdswitch report |
| `beamdswitch.js` | The site's standard beamdswitch report template, an unchanged copy of `templates/beamdswitch.js` |
| `build.py` | Counts the draws, writes `raw.json` (published as `data.json`) and rewrites the dataset, template and report blocks of `index.html` |

Tests live in `tests/` of yujieteo/toto-frequency: `tests/toto-frequency-beamdswitch.test.mjs`, `tests/toto-frequency-webmcp.test.mjs`, `tests/site-theme.test.mjs` and `tests/test_toto_frequency.py`.

## Build, test and verify

Run from the root of a yujieteo/toto-frequency checkout (Python 3 standard library and Node 22; nothing to install), as CI (`.github/workflows/ci.yml`) does:

```sh
python3 fetch.py           # only to add new draws (needs network)
python3 build.py           # regenerate raw.json and the generated blocks of index.html
python3 build.py --verify  # check both are fresh
node --test 'tests/*.test.{mjs,cjs}'
python3 -m unittest discover -s tests -p 'test_*.py'
```

`build.py` rewrites only the `dataset`, `beamdswitch` and `report` script blocks of `index.html`; edit the rest of the page directly.

## Change workflow

Change and test this repository first, end to end (open `index.html` in a browser, switch the window, save the deck), and run no-mistakes here; then port the page files byte for byte into `visuals/toto-frequency/` of yujieteo/site, where a second no-mistakes run covers only the site's own tests. Logic tests stay here; never add them to the site.

## Conventions

- `index.html` is one self-contained HTML file with its CSS, JavaScript and data inlined; it makes no external requests (only `fetch.py` touches the network).
- Keep the randomness caveat wherever counts are shown or exported.
- Node tests use the built-in `node --test` runner and Python tests use `unittest`; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template and declares `voice: bf_emma` in its front matter.
