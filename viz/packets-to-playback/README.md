# From Packets to Playback

Probability, information and renormalisation in a live stream. A streaming
calculator chooses the bitrate of the next segment (4K, 1080p, 720p or 480p);
Show why unfolds the Euclidean field-theory notation behind it as a language
for probability and information theory, in eleven guided steps or all at once
in Explore mode. `index.html` is one self-contained file with no dependencies,
no network requests and no build step; it works from `file://`, offline and
inside a sandboxed iframe, and without JavaScript it shows the central
question, the identity p = e^{−S}/Z, coarse-graining, RG against the
information bottleneck, and the dictionary.

| File | Role |
| --- | --- |
| `index.html` | The whole page. `<script id="packets-to-playback-engine">` is the pure core (`self.PacketsPlayback`): special functions, the seeded synthetic process, stall probability and utility, Gaussian couplings, the RG flow and its truncated projection, scaling of perturbations, the CLT and stable-law flows, exponential tilting, the quartic expansion, the information bottleneck, packets, schematic playback and the beamdswitch report. It has no DOM, storage, clock or network use. `<script id="packets-to-playback-ui">` is the page, the remembered mode and vocabulary (`localStorage`, optional), the drawn football scene and the four read-only WebMCP tools. `<script id="beamdswitch">` is `beamdswitch.js` inlined unchanged. Edit this file directly. |
| `beamdswitch.js` | The site's standard report template, a verbatim copy of `templates/beamdswitch.js`. |
| `raw.json` | Catalogue data, published as `data.json`: the initial scenario, rungs, presets, candidate models, limits, model constants and assumptions. The page never fetches it; the test says when it has drifted from the engine. |
| `AGENTS.md` | Notes for coding agents: where changes go (the standalone repository, where this visualisation and its tests develop; yujieteo/site holds a port of the page files), how to build and test, how to port to yujieteo/site, and the conventions. |
| `SKILLS.md` | For agents using the tool: its tasks, inputs, read-only WebMCP tools, exports and a worked example. |
| `LICENSE` | MIT. |

## Model

Everything is synthetic and seeded; no trace is a measurement of a real
network, broadcaster or viewer.

- **Windows.** Throughput is measured per 125 ms window as b_t = m x_t, with m
  the recent average. The x_t are a Gaussian-copula process: a latent
  stationary AR(1) chain (lag-1 correlation ρ, the persistence) pushed through
  the quantile function of one candidate family, floored at 2% of the mean.
  The heavy-tailed families share the Gaussian's middle half (interquartile
  range) and add deeper, rarer dips. 125 ms rather than 100 ms windows make
  every RG step an exact pair average up to 1 s, 2 s segments and 8 s.
- **Decision.** A segment of D seconds at bitrate R downloads at the average
  throughput of its windows, T = R D / (1 − loss) / (m x̄). P(T > B) and
  E[(T − B)⁺] come from 4,096 consecutive synthetic segments. Quality is the
  rate–distortion function of a Gaussian source, Q(R) = 1 − 2^(−2R/R₀) with
  R₀ = 4 Mbps, and the recommendation maximises U(R) = Q(R) − α P(T > B) − β E[L].
  This is an explanatory decision model, not a production ABR algorithm.
- **RG.** A 4,096-window trace is block-averaged six times (125 ms to 8 s).
  Each level reports the exact aggregate, its sample statistics and KL to the
  moment-matched Gaussian, and the couplings g₂ and g∇ of a truncated Gaussian
  AR(1) projection, whose prediction for the next level is compared with the
  exact aggregate. The projection is labelled an approximation everywhere.
- **Bottleneck.** 12,000 seeded 4 s histories from four hidden regimes; I(Z;X)
  = H(Z) with the Miller–Madow correction, and I(Z;Y) estimated on held-out
  histories, a conservative estimate.

## Tests

`tests/packets-to-playback.test.mjs` runs with Node's built-in runner
(`node --test`). It loads the engine from `index.html` and covers the special
functions, the decision and its edge cases (zero variability, an empty
buffer, very low and very high bandwidth, extreme tails and persistence, bad
input) with a scan for NaN and Infinity, determinism for the fixed seed,
cumulants from the derivatives of W against direct moments, the exact Gaussian
AR(1) action, Gaussian block aggregation staying Gaussian while a heavy tail
does not, the truncated projection, the quartic expansion, the bottleneck,
`raw.json` and the stub. It also boots the page in `node:vm` against a
stand-in DOM to check the WebMCP tools, Reset, and that the beamdswitch and
Copy deck buttons export the deck of the page as set, parsed with
beamdswitch's own parser.
