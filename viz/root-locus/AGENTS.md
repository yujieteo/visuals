# AGENTS.md: Root locus design check

A browser tool for checking a feedback loop by root locus: type the compensator C, plant G and feedback path H, see the s-plane or z-plane locus for K ≥ 0, pick K, and check the closed-loop poles against damping, natural-frequency and settling-time requirements. Live at <https://teoyujie.org/visuals/root-locus/>.

## Source of truth

The standalone repository [yujieteo/root-locus](https://github.com/yujieteo/root-locus) is where this visualisation and its tests develop and where CI runs them. `visuals/root-locus/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/root-locus) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`.

## Files and data

See [README.md](README.md). `index.html` is the whole tool and has no build step: edit it directly. `beamdswitch.js` is the site's standard template, an unchanged copy of `templates/beamdswitch.js`, also pasted unchanged as the page's first script. `raw.json` (published as `data.json`) holds the method notes, examples and verification table.

Tests live in `tests/` of yujieteo/root-locus: `tests/root-locus.test.cjs` (the built-in verification cases plus parser, import, export, tracking and WebMCP checks) and `tests/root-locus-beamdswitch.test.mjs`.

## Build, test and verify

Run from the root of a yujieteo/root-locus checkout:

```sh
node --test tests/root-locus.test.cjs tests/root-locus-beamdswitch.test.mjs
```

Open `index.html?selftest` to see the same verification cases in the page.

## Conventions

- `index.html` is one self-contained HTML file with inline CSS and vanilla JavaScript; it makes no network requests.
- The core parses a Python subset by hand; never use `eval`.
- When `templates/beamdswitch.js` changes in yujieteo/site, copy it here and paste it over the page's first script.
- Tests use Node's built-in `node --test` runner only; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template and declares `voice: bf_emma` in its front matter.
