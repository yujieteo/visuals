# Root locus design check

No build step: edit `index.html` directly. Its first body script is the inlined `beamdswitch.js`; the main script, which has no id, is type-checked as `script-3.js`. The core parses a Python subset by hand: never use `eval`. TypeScript 7 no longer reads ES5 constructor functions, so `InputError` and `Evaluator` stay classes.

`tests/root-locus.test.cjs` runs the built-in verification cases plus parser, import, export, tracking and WebMCP checks; open `index.html?selftest` to see the same cases in the page. Rules for every visual: [SKILLS.md](../../SKILLS.md).
