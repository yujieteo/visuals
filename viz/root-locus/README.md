# Root locus design check

A browser tool for checking a feedback loop by root locus. Type the
compensator `C`, plant `G` and feedback path `H`, see the s-plane or z-plane
locus of `D_L + K·N_L = 0` for K ≥ 0, pick K, and check the closed-loop poles
against optional damping, natural-frequency and settling-time requirements.
The Markdown record it exports is the save format; nothing is stored in the
browser.

| File | Role |
| --- | --- |
| `index.html` | The whole tool: one self-contained page with inline CSS and vanilla JS, no network requests. Its first script is `beamdswitch.js`, pasted in unchanged; the second starts with the numeric core, then `if (typeof module !== 'undefined') module.exports = {…}`, then UI code that only runs when a `document` exists. |
| `beamdswitch.js` | The standard beamdswitch report template (`deck(report)` writes a report as a beamdswitch Markdown deck); a copy of the site's shared [`templates/beamdswitch.js`](../../templates/beamdswitch.js), kept identical, and identical to the page's first script, by the tests |
| `raw.json` | Method notes, examples and the verification table (published as `data.json`); the tests check its examples match the page. |

There is no build step: edit `index.html` directly. When `templates/beamdswitch.js` changes, copy it
here and paste it over the page's first script.

The core parses a Python subset by hand (never `eval`), finds roots from the
balanced companion matrix with Francis QR, tracks branches over an adaptive K
grid, and computes breakaway points, crossings and asymptotes analytically.
In the z-plane, `G` is entered in s and discretised (ZOH through a matrix
exponential, Tustin, or matched pole-zero) while `C` and `H` are entered in z.

## Tests

`tests/root-locus.test.cjs` loads the page's script in Node and runs the
built-in verification cases (the same ones the page shows at `?selftest`)
plus parser, import, export, tracking and WebMCP checks:

```sh
node --test tests/root-locus.test.cjs tests/root-locus-beamdswitch.test.mjs
```

## beamdswitch deck

The beamdswitch button (under Export and import) saves the check as a narrated
talk for [beamdswitch](https://teoyujie.org/visuals/beamdswitch/): one Markdown
deck with the set-up, method, results and checks, every number at the page's
four significant figures and a spoken narration on every slide, written by
`locusReport` with the site's standard report template
([`templates/beamdswitch-report.md`](../../templates/beamdswitch-report.md)).
Copy deck puts the same deck on the clipboard; if saving is blocked, the
beamdswitch button copies it instead. `tests/root-locus-beamdswitch.test.mjs`
parses the decks with beamdswitch's own parsers and clicks both buttons.
