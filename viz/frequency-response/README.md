# Frequency-Response Visualiser

Exploration tool for linear feedback loops in the frequency domain. It is not
a substitute for a verified control-design toolchain; the page carries a
permanent banner saying so and every export repeats it. `index.html` is one
self-contained file with no dependencies, no network access and no build step.

This is the complete four-phase tool from the design spec. Loops are single
(SISO) or multivariable (MIMO), in continuous time (`s = jω`) or discrete time
(sample time Ts, evaluated up to the Nyquist frequency π/Ts). In discrete time
each block is entered in z or entered in s and discretised in state space by
zero-order hold (hand-written matrix exponential), Tustin with an optional
prewarp frequency, or forward or backward Euler; the continuous response is
overlaid on the discrete one. Delays are exact in continuous time and whole
samples in discrete time.

- **SISO** (`L = K·C·G·e^(−sτ)` or `K·C·G·z^(−d)`): Bode plot with asymptotes,
  gain, phase and delay margins, Ms, Mt, vector margin, resonant peak and
  bandwidth, closed-loop poles, singular values (which reduce to |L|, |1 + L|,
  |S| and |T|), a Nyquist plot with the count Z = N + P cross-checked against
  the closed-loop poles, a Nichols chart with M- and N-contours and the Ms
  boundary, and a pole-zero map.
- **MIMO** (up to 6 × 6, about 50 states): plant in state space, or a transfer
  matrix realised by stacking (with a visible hidden-mode caveat); controller
  as a static gain, state space or transfer matrix; loop broken at the plant
  output (`L_o = G·C`) or input (`L_i = C·G`), with margins at both. Entry-wise
  Bode grid, singular values of L, I + L, S and T, eigenvalue loci with the
  generalised Nyquist count on det(I + L) cross-checked against the closed-loop
  eigenvalues, eigenvalue-locus, uniform-gain, return-difference,
  sensitivity-peak and loop-at-a-time margins, and an illustrative Nichols view
  of the eigenvalue loci. The linear-algebra kernel (complex LU, Hessenberg
  reduction with shifted QR, one-sided Jacobi SVD, matrix exponential, Aberth
  roots) is hand-written. Disk margins and μ are out of scope.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="fr-engine">` is the pure calculation core (no DOM, storage, clock or randomness; `self.FreqResponse` in the browser); `<script id="fr-ui">` is the page, plots and WebMCP tools. Edit this file directly. |
| `raw.json` | Published metadata (scope, conventions, assumptions, sources, presets, threshold defaults) and the default example; must equal the engine's `META` and `defaultInputs()` |
| `AGENTS.md` | Notes for coding agents: where changes go (the standalone repository, where this visualisation and its tests develop; yujieteo/site holds a port of the page files), how to build and test, and the conventions. |
| `SKILLS.md` | For agents using the tool: its tasks, inputs, read-only WebMCP tools, exports and a worked example. |
| `LICENSE` | MIT. |
| `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore` | Type-check tooling only: `npm ci && npm run typecheck` copies the page's inline scripts out of `index.html` (`tests/extract-inline.mjs`) into the ignored `.typecheck/` and runs TypeScript's `tsc` over their JSDoc types and the tests'. No runtime dependencies. |

The tests are `tests/frequency-response.test.mjs`, run with Node's built-in
runner (`node --test`), typed against the engine's own JSDoc through `tests/page-globals.d.ts`. They extract the engine script from `index.html`, run
the in-page self-tests and further analytic checks, and exercise the WebMCP
tools. The page runs the same self-tests on every load and shows a pass/fail
badge with each tolerance. After changing `META` or `defaultInputs()`,
regenerate `raw.json` from the engine; the test says when it has drifted.

Files are canonical: rad/s, seconds, absolute magnitude and degrees. The
display toggles (rad/s, Hz or, in discrete time, rad/sample; dB or absolute;
degrees or radians; wrapped or unwrapped phase) change only what is shown, and
exports record them only so an import restores the view. Margin thresholds are user inputs whose pre-filled
values are labelled "unsourced default".
