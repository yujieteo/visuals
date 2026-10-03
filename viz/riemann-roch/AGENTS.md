# Divisors, linear systems and Riemann–Roch

`index.html` and `raw.json` are built by `node build.mjs` from `src/` and `beamdswitch.js`; never hand-edit them. `src/engine.js` is the pure engine (`self.RiemannRoch`: no DOM, storage, clock, randomness or network), `src/ui.js` the page and its WebMCP tools, `src/template.html` and `src/style.css` the markup, no-JavaScript fallback and styles. The page's Content-Security-Policy forbids network access.

Bases are written only where they are exact; everything else is labelled as a Riemann–Roch or Clifford bound, and the page never invents a basis. References are cited at chapter level only. `tests/riemann-roch.test.mjs` covers freshness, every minimum computation, the computation mode, the decks and the WebMCP tools in a stand-in DOM. Rules for every visual: [SKILLS.md](../../SKILLS.md).
