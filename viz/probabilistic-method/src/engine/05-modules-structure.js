/* Part 5: random structure — Rödl nibble, quasirandomness, the phase transition, dependent random choice. */

/* ---------- Rödl nibble ---------- */

/* A 3-uniform hypergraph on N vertices: the union of D random partitions of the vertices into triples (about D-regular). */
/** @param {number} N @param {number} D @param {Rng} r @returns {number[][]} */
function tripleSystem(N, D, r) {
  const seen = new Set(), edges = [];
  for (let t = 0; t < D; t++) {
    const perm = r.shuffle(Array.from({ length: N }, (_, i) => i));
    for (let i = 0; i + 2 < N; i += 3) {
      const e = perm.slice(i, i + 3).sort((a, b) => a - b), key = e.join(",");
      if (!seen.has(key)) { seen.add(key); edges.push(e); }
    }
  }
  return edges;
}
/** @param {number} N @param {number[][]} edges */
function maxCodegree(N, edges) {
  const co = new Map(); let best = 0;
  for (const e of edges) for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) { const k = e[a] * N + e[b], v = (co.get(k) || 0) + 1; co.set(k, v); if (v > best) best = v; }
  return best;
}
/* Run the nibble: each round, select each live edge with probability ε/D_current, discard selected edges that meet another
 * selected edge, accept the rest, and delete every covered vertex. mode "one-shot" stops after one round. */
/** @param {number} N @param {number[][]} edges @param {number} eps @param {() => number} r */
function runNibble(N, edges, eps, r, mode = "nibble", maxRounds = 60) {
  const alive = new Uint8Array(N).fill(1), rounds = [];
  /** @type {number[][]} */
  const matching = [];
  let liveCount = N;
  for (let round = 1; round <= maxRounds; round++) {
    const live = edges.filter((e) => alive[e[0]] && alive[e[1]] && alive[e[2]]);
    if (!live.length) break;
    const D = (3 * live.length) / liveCount, q = Math.min(1, eps / D);
    const selected = live.filter(() => r() < q);
    /** @type {Map<number, number>} */
    const hits = new Map();
    for (const e of selected) for (const v of e) hits.set(v, (hits.get(v) || 0) + 1);
    /** @type {number[][]} */
    const accepted = [];
    /** @type {number[][]} */
    const collided = [];
    for (const e of selected) (e.every((v) => hits.get(v) === 1) ? accepted : collided).push(e);
    for (const e of accepted) { for (const v of e) alive[v] = 0; matching.push(e); }
    liveCount -= 3 * accepted.length;
    rounds.push({ round, aliveBefore: liveCount + 3 * accepted.length, aliveAfter: liveCount, live: live.length, D, selected, accepted, collided, collisionRate: selected.length ? collided.length / selected.length : 0 });
    if (mode === "one-shot") break;
  }
  return { rounds, matching, uncovered: liveCount, uncoveredFrac: liveCount / N, alive };
}

defineModule({
  id: "nibble", route: "nibble/hypergraph-matching", title: "Rödl nibble", short: "Rödl nibble",
  family: "semi-random", archetype: "Near-perfect hypergraph matching",
  intuition: "Many gentle random choices, each followed by a clean-up, beat one giant random choice.",
  problem: "In a D-regular 3-uniform hypergraph with small codegrees, find a matching covering almost every vertex.",
  randomObject: "Each round, every surviving edge is tentatively chosen with a small probability ε/D.",
  variable: "The fraction of vertices still uncovered after each round, against the predicted trajectory (1 − εe^(−3ε))^r.",
  variableTex: "\\Pr[v\\text{ covered in a round}]\\approx \\varepsilon e^{-3\\varepsilon}",
  why: "Each round the residual hypergraph is again nearly regular with small codegrees (by concentration), so the same step repeats; as D → ∞ the uncovered fraction tends to 0.",
  need: "One random batch with probability 1/D collides too often: at best about 1/(3e) ≈ 12% of the vertices are covered. Small nibbles keep collisions rare.",
  boundTex: "\\text{codeg}=o(D)\\;\\Longrightarrow\\;\\exists\\text{ matching covering }(1-o(1))N\\text{ vertices}",
  pattern: { controls: "iterated sparse random choices", conclusion: "a near-perfect packing exists", worksWhen: "the residue stays nearly regular", visual: "rounds of candidates, collisions, acceptances" },
  params: [
    { key: "N", label: "N (vertices)", min: 30, max: 300, step: 3, def: 120 },
    { key: "D", label: "D (degree)", min: 3, max: 30, step: 1, def: 12 },
    { key: "eps", label: "ε (nibble size)", min: 0.05, max: 1, step: 0.05, def: 0.25 },
    { key: "mode", label: "strategy", options: [["nibble", "many gentle nibbles"], ["one-shot", "one giant random choice"]], def: "nibble" },
  ],
  fixed(P, seed) { const edges = tripleSystem(P.N, P.D, rng(seed, "nibble-hypergraph")); return { N: P.N, edges, codeg: maxCodegree(P.N, edges), degree: (3 * edges.length) / P.N }; },
  analyse(P, H) {
    const eps = P.eps, perRound = eps * Math.exp(-3 * eps), predicted = Array.from({ length: 41 }, (_, r) => (1 - perRound) ** r);
    return {
      perRound, predicted, oneShotBest: 1 / (3 * Math.E), degree: H.degree, codeg: H.codeg, ok: H.codeg <= Math.max(2, H.degree / 3), edges: H.edges.length,
      rows: [["edges", fmt(H.edges.length), `|E|=${H.edges.length}`], ["average degree D", fmt(H.degree), `D=${tex(H.degree)}`], ["max codegree", fmt(H.codeg), `\\max\\text{codeg}=${H.codeg}`],
        ["covered per round ≈ εe^(−3ε)", fmt(perRound), `\\varepsilon e^{-3\\varepsilon}=${tex(perRound)}`], ["best single round 1/(3e)", fmt(1 / (3 * Math.E)), "1/(3e)"]],
    };
  },
  sample(P, r, H) { const run = runNibble(P.N, H.edges, P.eps, r, P.mode); return { ...run, X: run.uncoveredFrac }; },
  stat: (I) => I.X,
  trialCap: (P) => Math.max(200, Math.min(3000, Math.floor(2e7 / (P.N * P.D * 10)))),
  experiment: { label: "uncovered fraction at the end", theory: (A, P) => ({ mean: P && P.mode === "one-shot" ? 1 - A.perRound : null, event: "uncovered fraction below 10%", eventTest: (x) => x < 0.1, bound: null, boundLabel: "asymptotic theorem: o(1) as D → ∞" }) },
  assumptions(P, A) {
    return [
      { id: "regular", label: "The hypergraph is (nearly) D-regular", ok: true },
      { id: "codegree", label: `Codegrees are small compared with D (max ${A.codeg} against D ≈ ${fmt(A.degree)})`, ok: A.ok, broken: "Pairs of vertices share many edges, so selections near a vertex are strongly correlated and the trajectory prediction fails." },
      { id: "small-bites", label: "Each nibble is small (ε well below 1) and repeated", ok: P.mode === "nibble" && P.eps <= 0.5, broken: P.mode === "one-shot" ? "One giant random choice: collisions destroy most of the selection, so coverage stalls near εe^(−3ε)." : "Large nibbles collide often: each round wastes many selected edges." },
    ];
  },
  breakIt: { label: "One giant random choice", apply: (P) => ({ ...P, mode: "one-shot", eps: 0.35 }) },
  compare: ["alterations", "phase-transition", "chernoff"],
  whyNot(P, A) {
    return [
      { title: "Why not one random batch?", text: `Selecting each edge with probability ε/D and discarding collisions covers each vertex with probability about εe^(−3ε), at most 1/(3e) ≈ ${fmt(A.oneShotBest)}. Iterating small batches compounds instead.` },
      { title: "Why not alterations alone?", text: "A single alteration repairs one random object; the nibble repeats randomise-and-repair many times, re-establishing regularity in between." },
    ];
  },
  proof(P, A) {
    return [
      { text: `Start with a ${fmt(A.degree)}-regular 3-uniform hypergraph on N = ${P.N} vertices, max codegree ${A.codeg}.`, focus: "problem" },
      { text: `Round: select each live edge with probability ε/D (ε = ${fmt(P.eps)}).`, focus: "random-object" },
      { text: "Discard selected edges that meet another selected edge; accept the rest.", focus: "collisions" },
      { text: `A vertex is covered with probability ≈ εe^(−3ε) = ${fmt(A.perRound)}; degrees in the residue shrink proportionally.`, focus: "trajectory" },
      { text: "Concentration keeps the residue nearly regular with small codegrees, so the round can be repeated.", focus: "trajectory" },
      { text: "After many rounds the uncovered fraction is o(1) as D → ∞: a near-perfect matching exists.", focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    const last = I.rounds[I.rounds.length - 1];
    return {
      title: `The Rödl nibble: a matching in a 3-uniform hypergraph on ${P.N} vertices`,
      subtitle: "Many gentle random choices",
      narration: "This deck builds a near-perfect matching by taking many small random bites, each followed by a clean-up.",
      setup: [
        { title: "Problem: cover almost every vertex", focus: "problem", body: reveal(`A 3-uniform hypergraph, average degree $D\\approx${tex(A.degree)}$, codegree at most ${A.codeg}.`, "Find disjoint edges covering almost every vertex."),
          narration: `Each vertex lies in about ${spokenNumber(A.degree)} triples. We want disjoint triples covering nearly every vertex.` },
        { title: "Random object: a small random batch", focus: "random-object", body: reveal(`Each live edge is chosen with probability $\\varepsilon/D$, $\\varepsilon=${tex(P.eps)}$.`, P.mode === "one-shot" ? "Strategy: one round only." : "Strategy: repeat with the survivors."),
          narration: `Each surviving edge is chosen with probability ${spokenNumber(P.eps)} over the current degree.` },
      ],
      method: [
        { title: "Clean up the collisions", focus: "collisions", body: reveal("Selected edges meeting another selected edge are discarded.", "The rest are accepted; their vertices leave the hypergraph."),
          narration: "Chosen edges that collide with another chosen edge are thrown away. The rest are kept and their vertices removed." },
        { title: "Track the trajectory", focus: "trajectory", body: reveal("$$\\Pr[v\\text{ covered}]\\approx\\varepsilon e^{-3\\varepsilon}=" + tex(A.perRound) + "$$", "Predicted uncovered fraction after $r$ rounds: $(1-\\varepsilon e^{-3\\varepsilon})^r$ (a heuristic, not a theorem)."),
          narration: `In each round a vertex is covered with probability about ${spokenNumber(A.perRound)}. Repeating gives a predicted trajectory, which is a heuristic, not a theorem.` },
      ],
      results: [
        { title: `Seed ${P.seed}: ${pct(I.uncoveredFrac)} uncovered after ${I.rounds.length} rounds`, focus: "trajectory", body: `| round | live edges | selected | collided | accepted |\n| --- | --- | --- | --- | --- |\n` + I.rounds.slice(0, 6).map((r) => `| ${r.round} | ${r.live} | ${r.selected.length} | ${r.collided.length} | ${r.accepted.length} |`).join("\n"),
          narration: `With seed ${P.seed}, after ${I.rounds.length} rounds, ${I.uncovered} of ${P.N} vertices remain uncovered.` },
        { title: "Experiment: one giant choice against many nibbles", focus: "experiment", body: reveal(`One round covers at most $1/(3e)\\approx${tex(A.oneShotBest)}$ of the vertices.`, last ? `The final round here had collision rate ${tex(last.collisionRate)}.` : "No rounds ran."),
          narration: "A single random batch covers at most about twelve in every hundred vertices. Iterating small batches covers far more." },
      ],
      checks: [
        { title: "Conclusion: near-perfect matchings exist", focus: "conclusion", body: "As $D\\to\\infty$ with codegrees $o(D)$, the uncovered fraction tends to $0$: a matching covering $(1-o(1))N$ vertices exists.",
          narration: "When degrees grow and codegrees stay small, the uncovered fraction tends to zero. A near-perfect matching exists." },
        { title: "When to use it", focus: "conclusion", body: "- A packing or covering problem with many local collisions.\n- After a small random step, the residue looks like the original.\n- Concentration keeps it regular from round to round.",
          key: "Take many small random bites, clean up collisions, and repeat while the residue stays regular.",
          narration: "Use the nibble when one big random choice collides too often but the leftover structure looks like the start." },
      ],
    };
  },
  scenes: ["problem", "random-object", "collisions", "trajectory", "experiment", "conclusion"],
});

/* ---------- Quasirandomness ---------- */

/* Eigenvalues of a symmetric matrix (array of rows) by the cyclic Jacobi method. */
/** @param {number[][]} M */
function symmetricEigenvalues(M) {
  const n = M.length, a = M.map((r) => r.slice());
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
    }
  }
  return a.map((r, i) => r[i]).sort((x, y) => y - x);
}
/** @param {number} q */
function paleyGraph(q) {
  const sq = new Set(); for (let x = 1; x < q; x++) sq.add((x * x) % q);
  const edges = []; for (let i = 0; i < q; i++) for (let j = i + 1; j < q; j++) if (sq.has((j - i) % q)) edges.push([i, j]);
  return graphFromEdges(q, edges);
}
const PALEY_PRIMES = [5, 13, 17, 29, 37, 41];
/** @param {Params} P @param {number} seed */
function quasiGraph(P, seed) {
  const n = P.q;
  let G;
  if (P.type === "paley") G = paleyGraph(n);
  else if (P.type === "random") G = gnp(n, 0.5, rng(seed, "quasirandom-graph"));
  else if (P.type === "bipartite") { const e = []; const h = Math.floor(n / 2); for (let i = 0; i < h; i++) for (let j = h; j < n; j++) e.push([i, j]); G = graphFromEdges(n, e); }
  else { const e = []; const h = Math.floor(n / 2); for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if ((i < h) === (j < h)) e.push([i, j]); G = graphFromEdges(n, e); }
  const flips = String(P.flips || "").split(",").filter(Boolean).map((s) => s.split("-").map(Number)).filter(([i, j]) => i >= 0 && j >= 0 && i < n && j < n && i !== j);
  if (flips.length) {
    const adj = G.adj.slice();
    for (const [i, j] of flips) { adj[i * n + j] ^= 1; adj[j * n + i] ^= 1; }
    const e = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (adj[i * n + j]) e.push([i, j]);
    G = graphFromEdges(n, e);
  }
  return G;
}
/** @param {Graph} G @param {Iterable<number>} S @param {Iterable<number>} T */
function edgesBetween(G, S, T) { let c = 0; for (const s of S) for (const t of T) if (G.adj[s * G.n + t]) c++; return c; }

defineModule({
  id: "quasirandom", route: "quasirandom/expander-mixing", title: "Quasirandomness and expander mixing", short: "Quasirandomness",
  family: "quasirandom", archetype: "Expander mixing in Paley graphs",
  intuition: "A deterministic graph can stand in for a random one if it passes the few statistics a proof actually uses.",
  problem: "Show every pair of vertex sets S, T in a Paley graph spans about the number of edges a random graph would.",
  randomObject: "The sets S and T (each vertex in S, and independently in T, with probability 1/2) — the graph itself may be explicit.",
  variable: "e(S,T) = ordered adjacent pairs (s,t) with s ∈ S, t ∈ T, against d|S||T|/n; the second eigenvalue λ controls the gap.",
  variableTex: "\\Big|e(S,T)-\\frac{d|S||T|}{n}\\Big|\\le\\lambda\\sqrt{|S||T|}",
  why: "For a d-regular graph with second-largest absolute eigenvalue λ, the expander mixing lemma bounds every cut discrepancy by λ√(|S||T|); Paley graphs have λ = (1+√q)/2.",
  need: "A random graph needs a union bound over 4ⁿ pairs of sets; one eigenvalue certifies all of them at once, for an explicit graph.",
  boundTex: "\\Big|e(S,T)-\\frac{d|S||T|}{n}\\Big|\\le\\lambda\\sqrt{|S||T|}",
  pattern: { controls: "proxy statistics (eigenvalue, 4-cycles)", conclusion: "deterministic random-like behaviour", worksWhen: "the graph passes the statistic the proof uses", visual: "four meters" },
  params: [
    { key: "type", label: "graph", options: [["paley", "Paley (quadratic residues)"], ["random", "random G(n, 1/2)"], ["bipartite", "structured: complete bipartite"], ["cliques", "structured: two cliques"]], def: "paley" },
    { key: "q", label: "n (a prime ≡ 1 mod 4)", options: PALEY_PRIMES.map((q) => [q, String(q)]), def: 29 },
    { key: "flips", label: "flipped pairs", hidden: true, def: "" },
  ],
  coerce(P) { return { ...P, q: Number(P.q) }; },
  fixed(P, seed) {
    const G = quasiGraph(P, seed), n = G.n, M = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => G.adj[i * n + j]));
    const eig = symmetricEigenvalues(M), deg = degrees(G);
    return { G, eig, deg, regular: deg.every((x) => x === deg[0]) };
  },
  analyse(P, F) {
    const { G, eig, deg, regular } = F, n = G.n, m = G.edges.length, dens = (2 * m) / (n * (n - 1)), dAvg = (2 * m) / n;
    const lambda = Math.max(...eig.slice(1).map(Math.abs)), trA4 = eig.reduce((s, x) => s + x ** 4, 0), c4 = trA4 / n ** 4, c4Random = (dAvg / n) ** 4;
    return {
      n, m, dens, dAvg, lambda, eig, regular, c4, c4Random, c4Excess: c4 - c4Random, ok: regular, paleyLambda: P.type === "paley" && !P.flips ? (1 + Math.sqrt(n)) / 2 : null,
      meters: [["edge density", dens, `${fmt(dens)}`], ["4-cycle excess t(C₄) − (d/n)⁴", Math.min(1, Math.max(0, (c4 - c4Random) * 16)), fmt(c4 - c4Random)], ["second eigenvalue λ/n", Math.min(1, lambda / n * 2), fmt(lambda / n)]],
      rows: [["vertices n", fmt(n), `n=${n}`], ["edges", fmt(m), `m=${m}`], ["regular?", regular ? `yes, d = ${deg[0]}` : "no", ""], ["λ = max |λᵢ|, i ≥ 2", fmt(lambda), `\\lambda=${tex(lambda)}`],
        ["hom. density t(C₄)", fmt(c4), tex(c4)], ["random value (d/n)⁴", fmt(c4Random), tex(c4Random)]],
    };
  },
  sample(P, r, F) {
    const n = F.G.n, S = [], T = [];
    for (let v = 0; v < n; v++) { if (r() < 0.5) S.push(v); if (r() < 0.5) T.push(v); }
    const e = edgesBetween(F.G, S, T), dAvg = (2 * F.G.edges.length) / n, expected = (dAvg * S.length * T.length) / n;
    const lambda = Math.max(...F.eig.slice(1).map(Math.abs)), bound = lambda * Math.sqrt(S.length * T.length);
    return { S, T, e, expected, dev: Math.abs(e - expected), bound, X: Math.abs(e - expected) / Math.max(1, Math.sqrt(S.length * T.length)) };
  },
  stat: (I) => I.X,
  trialCap: () => 5000,
  experiment: { label: "|e(S,T) − d|S||T|/n| / √(|S||T|) for random S, T", theory: (A) => ({ mean: null, event: "normalised discrepancy above λ", eventTest: (x, A2) => x > A2.lambda + 1e-9, bound: A.ok ? 0 : null, boundKind: "at most", boundLabel: A.ok ? "never, by the mixing lemma (normalised discrepancy ≤ λ)" : "no guarantee (graph not regular)" }) },
  assumptions(P, A) {
    return [
      { id: "regular", label: "The graph is d-regular (needed by this form of the mixing lemma)", ok: A.regular, broken: "The graph is not regular: this form of the expander mixing lemma does not apply. (Irregular versions exist, with normalised adjacency.)" },
      { id: "small-lambda", label: "λ is small compared with d", ok: A.lambda < A.dAvg / 2, broken: `λ = ${fmt(A.lambda)} is comparable to d = ${fmt(A.dAvg)}: the bound is too weak to say the graph mixes. Structured graphs have a large second eigenvalue.` },
    ];
  },
  breakIt: { label: "Use a structured graph", apply: (P) => ({ ...P, type: "cliques" }) },
  compare: ["phase-transition", "derandomization", "testing"],
  whyNot(P, A) {
    return [
      { title: "Why not a random graph?", text: "A random graph has the property only with high probability, and checking it would need all 4ⁿ pairs of sets. An explicit Paley graph certifies it through a single eigenvalue." },
      { title: "Why these four statistics?", text: `Chung, Graham and Wilson showed that for dense graphs, edge density with the right 4-cycle count, a small second eigenvalue and small cut discrepancy are all equivalent. Here t(C₄) exceeds the random value by ${fmt(A.c4Excess)}.` },
    ];
  },
  proof(P, A) {
    return [
      { text: `The graph has n = ${A.n}, ${A.regular ? `is d-regular with d = ${fmt(A.dAvg)}` : "is not regular"}, and eigenvalues d = λ₁ ≥ λ₂ ≥ … .`, focus: "problem" },
      { text: "Write the indicator vectors 1_S, 1_T in the eigenbasis; the top eigenvector is the constant vector.", focus: "variable" },
      { text: "e(S,T) = 1_Sᵀ A 1_T; the constant component contributes exactly d|S||T|/n.", focus: "variable" },
      { text: `The rest is at most λ‖1_S‖‖1_T‖ = λ√(|S||T|), with λ = ${fmt(A.lambda)}${A.paleyLambda ? ` = (1+√q)/2` : ""}.`, focus: "bound" },
      { text: A.regular ? "So every cut is within λ√(|S||T|) of its random value." : "Not regular: the constant vector is not an eigenvector and the argument breaks.", focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    return {
      title: `Quasirandomness: the ${P.type === "paley" ? "Paley" : P.type} graph on ${A.n} vertices`,
      subtitle: "Random-like without randomness",
      narration: "This deck shows how a deterministic graph can pass the statistics a randomness proof needs.",
      setup: [
        { title: "Problem: does the graph mix?", focus: "problem", body: reveal(`A graph on ${A.n} vertices with density ${tex(A.dens)}.`, "Does every pair of sets $S,T$ span about $d|S||T|/n$ edges?"),
          narration: `We have a graph on ${A.n} vertices. We ask whether every pair of vertex sets spans about as many edges as a random graph would.` },
        { title: "Random object: random sets S and T", focus: "random-object", body: reveal(P.type === "paley" ? "The graph is explicit: $i\\sim j$ when $j-i$ is a nonzero square mod $q$." : "The graph is fixed by the seed.", `Seed ${P.seed}: $|S|=${I.S.length}$, $|T|=${I.T.length}$, $e(S,T)=${I.e}$ against ${tex(I.expected)}.`),
          narration: `Only the test sets are random. With seed ${P.seed} the sets span ${I.e} ordered edge pairs, against ${spokenNumber(I.expected)} expected.` },
      ],
      method: [
        { title: "Proxy statistics", focus: "dashboard", body: `| statistic | value |\n| --- | --- |\n| density | ${tex(A.dens)} |\n| $t(C_4)-(d/n)^4$ | ${tex(A.c4Excess)} |\n| $\\lambda$ | ${tex(A.lambda)} |`,
          narration: "Four statistics constrain each other: edge density, the four cycle count, the second eigenvalue and cut discrepancy." },
        { title: "Technique: the expander mixing lemma", focus: "bound", body: "$$\\Big|e(S,T)-\\frac{d|S||T|}{n}\\Big|\\le\\lambda\\sqrt{|S||T|}$$",
          narration: "For a regular graph, every cut deviates from its random value by at most lambda times the square root of the set sizes." },
      ],
      results: [
        { title: `λ = ${fmt(A.lambda)}`, focus: "bound", body: reveal(`Seed ${P.seed}: deviation ${tex(I.dev)} against the bound ${tex(I.bound)}.`, A.regular ? "The bound holds for every pair of sets." : "Not regular: the bound is not justified."),
          narration: `The second eigenvalue is ${spokenNumber(A.lambda)}. This pair of sets deviates by ${spokenNumber(I.dev)}, within a bound of ${spokenNumber(I.bound)}.` },
        { title: "Experiment: many random cuts", focus: "experiment", body: "The lab samples many $(S,T)$; the normalised discrepancy never exceeds $\\lambda$ for a regular graph. The sampling illustrates, the eigenvalue proves.",
          narration: "Sampling many pairs of sets never beats the eigenvalue bound for a regular graph. The samples illustrate, the eigenvalue proves." },
      ],
      checks: [
        { title: "Conclusion: random-like, deterministically", focus: "conclusion", body: A.regular && A.lambda < A.dAvg / 2 ? "Every cut is within $\\lambda\\sqrt{|S||T|}$ of random: the graph replaces randomness in proofs that only use edge distribution." : "This graph fails the test: a large second eigenvalue reveals hidden structure.",
          narration: A.regular && A.lambda < A.dAvg / 2 ? "Every cut behaves randomly up to the eigenvalue bound, so this explicit graph can replace a random one." : "This graph fails: a large second eigenvalue reveals structure." },
        { title: "When to use it", focus: "conclusion", body: "- A proof uses only edge counts between sets.\n- You need an explicit object.\n- Check one eigenvalue instead of exponentially many cuts.",
          key: "Randomness can be replaced by any object passing the statistics the proof actually uses.",
          narration: "Use quasirandomness when a proof needs only a few statistics of randomness. Any object passing them will do." },
      ],
    };
  },
  scenes: ["problem", "random-object", "dashboard", "bound", "experiment", "conclusion"],
});

/* ---------- Phase transition ---------- */

/* Survival probability β of a Poisson(c) Galton–Watson tree: β = 1 − e^(−cβ), the giant component fraction. */
/** @param {number} c */
function giantFraction(c) {
  if (c <= 1) return 0;
  let b = 1;
  for (let i = 0; i < 500; i++) b = 1 - Math.exp(-c * b);
  return b;
}
/** @param {number} n @param {number[][]} adjList @param {number} root */
function bfsGenerations(n, adjList, root, maxGen = 8) {
  const seen = new Map([[root, 0]]), gens = [[root]];
  /** @type {Map<number, number | null>} */
  const parent = new Map([[root, null]]);
  /** @type {{ generation: number, at: number, from: number, to: number } | null} */
  let collision = null;
  let order = 0;
  for (let g = 0; g < maxGen && gens[g].length; g++) {
    const next = [];
    for (const v of gens[g]) for (const w of adjList[v]) {
      order++;
      if (w === parent.get(v)) continue;
      if (seen.has(w)) { if (collision === null) collision = { generation: g + 1, at: order, from: v, to: w }; continue; }
      seen.set(w, g + 1); parent.set(w, v); next.push(w);
    }
    gens.push(next);
  }
  while (gens.length && !gens[gens.length - 1].length) gens.pop();
  return { gens: gens.map((g) => g.length), parent: [...parent.entries()], collision };
}
/** @param {number} c @param {Rng} r */
function galtonWatson(c, r, maxGen = 8, cap = 400) {
  const gens = [1];
  /** @type {(number | null)[]} */
  const parent = [null];

  let frontier = [0];
  for (let g = 0; g < maxGen && frontier.length && parent.length < cap; g++) {
    const next = [];
    for (const v of frontier) { const k = r.poisson(c); for (let i = 0; i < k && parent.length < cap; i++) { parent.push(v); next.push(parent.length - 1); } }
    if (next.length) gens.push(next.length);
    frontier = next;
  }
  return { gens, parent };
}
defineModule({
  id: "phase-transition", route: "random-graph/phase-transition", title: "Random graph phase transition", short: "Phase transition",
  family: "phase-transition", archetype: "Emergence of the giant component",
  intuition: "Exploring a vertex's component looks like a branching process; average offspring c = np decides between small and giant.",
  problem: "Show that G(n, c/n) has only small components when c < 1 and a unique giant component of size ≈ βn when c > 1.",
  randomObject: "One uniform label U_e for every pair; G_p keeps e when U_e ≤ p. Raising p only adds edges: a genuine coupling.",
  variable: "L₁ = size of the largest component, compared with β(c)n where β = 1 − e^(−cβ).",
  variableTex: "\\beta=1-e^{-c\\beta},\\qquad L_1\\approx\\beta n\\ (c>1)",
  why: "Breadth-first exploration has Bin(n − k, p) ≈ Poisson(c) new neighbours per vertex; a Galton–Watson process with mean c dies out surely if c ≤ 1 and survives with probability β > 0 if c > 1.",
  need: "Moments of component counts are awkward; the branching comparison reduces the question to one generating-function equation.",
  boundTex: "c<1:\\ L_1=O(\\log n);\\qquad c>1:\\ L_1=(1+o(1))\\,\\beta(c)\\,n",
  pattern: { controls: "mean offspring c = np", conclusion: "small components or a unique giant", worksWhen: "exploration is nearly tree-like", visual: "graph exploration beside a branching process" },
  params: [
    { key: "n", label: "n (vertices)", min: 50, max: 400, step: 10, def: 200 },
    { key: "c", label: "c = np", min: 0, max: 3, step: 0.01, def: 0.87 },
  ],
  fixed(P, seed) {
    const n = P.n, r = rng(seed, "phase-labels"), edges = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push({ u: r(), a: i, b: j });
    edges.sort((x, y) => x.u - y.u);
    const pr = rng(seed, "phase-layout"), pos = Array.from({ length: n }, () => [pr(), pr()]);
    return { edges, pos, gwSeed: seed };
  },
  analyse(P) {
    const c = P.c, beta = giantFraction(c), win = P.n ** (-1 / 3);
    const regime = c < 1 - win ? "subcritical" : c > 1 + win ? "supercritical" : "critical window";
    return {
      p: c / P.n, beta, window: [1 - win, 1 + win], regime, ok: true, curve: Array.from({ length: 61 }, (_, i) => [i / 20, giantFraction(i / 20)]),
      rows: [["p = c/n", fmt(c / P.n), `p=${tex(c / P.n)}`], ["np = c", fmt(c), `c=${tex(c)}`], ["regime", regime, ""], ["predicted giant fraction β(c)", fmt(beta), `\\beta=${tex(beta)}`], ["critical window |c − 1| ≲ n^(−1/3)", fmt(win), tex(win)]],
    };
  },
  view(P, F) {
    const p = P.c / P.n;
    /** @type {Edge[]} */
    const present = [];
    for (const e of F.edges) { if (e.u > p) break; present.push([e.a, e.b]); }
    const comp = components(P.n, present), adjList = Array.from({ length: P.n }, () => /** @type {number[]} */ ([]));

    for (const [a, b] of present) { adjList[a].push(b); adjList[b].push(a); }
    const bfs = bfsGenerations(P.n, adjList, 0), gw = galtonWatson(P.c, rng(F.gwSeed, "galton-watson"));
    return { present, comp, L1: comp.sizes[0] || 1, L2: comp.sizes[1] || 0, count: comp.sizes.length, bfs, gw, X: (comp.sizes[0] || 1) / P.n };
  },
  sample(P, r) { const G = gnp(P.n, Math.min(1, P.c / P.n), r), comp = components(P.n, G.edges); return { comp, X: comp.sizes[0] / P.n }; },
  stat: (I) => I.X,
  /* Same law as sample, faster: jump between present edges with geometric gaps instead of testing every pair. */
  fastStat(P, r) {
    const n = P.n, p = Math.min(1, P.c / P.n), total = (n * (n - 1)) / 2, edges = [];
    if (p > 0) {
      const lq = Math.log1p(-Math.min(p, 1 - 1e-12));
      let idx = -1, i = 0, rowStart = 0;
      for (;;) {
        idx += p >= 1 ? 1 : 1 + Math.floor(Math.log(1 - r()) / lq);
        if (idx >= total) break;
        while (idx >= rowStart + (n - 1 - i)) { rowStart += n - 1 - i; i++; }
        edges.push([i, i + 1 + (idx - rowStart)]);
      }
    }
    return components(n, edges).sizes[0] / n;
  },
  trialCap: () => 3000,
  experiment: { label: "largest component / n in a fresh G(n, c/n)", theory: (A) => ({ mean: A.beta, meanLabel: "β(c) (asymptotic)", event: "L₁/n above 0.1", eventTest: (x) => x > 0.1, bound: null, boundLabel: "asymptotic: probability → 1 if c > 1, → 0 if c < 1" }) },
  assumptions(P, A) {
    return [
      { id: "independent", label: "Edges independent with probability p = c/n", ok: true },
      { id: "asymptotic", label: "n → ∞ (β(c) is a limit; finite n blurs the transition)", ok: P.n >= 200, broken: `At n = ${P.n} the critical window |c − 1| ≲ ${fmt(P.n ** (-1 / 3))} is wide: finite graphs blur the transition.` },
      { id: "tree-like", label: "Exploration is tree-like until about √n vertices are found", ok: true },
    ];
  },
  breakIt: { label: "Shrink n (blur the transition)", apply: (P) => ({ ...P, n: 50, c: 1 }) },
  compare: ["second-moment", "nibble", "quasirandom"],
  whyNot(P, A) {
    return [
      { title: "Why not first and second moments?", text: "They locate thresholds for fixed subgraphs. The giant component is a global object of linear size; comparing the exploration with a branching process captures it directly." },
      { title: "Why couple with U_e?", text: "With one label per pair, raising p only adds edges, so the whole sweep is one random experiment and monotone properties appear exactly once." },
    ];
  },
  proof(P, A) {
    return [
      { text: "Give each pair a label U_e ~ U[0,1]; G_p keeps e when U_e ≤ p.", focus: "random-object" },
      { text: `Explore the component of a vertex breadth-first; each explored vertex has Bin(n − k, p) ≈ Poisson(${fmt(P.c)}) new neighbours.`, focus: "branching" },
      { text: "Until about √n vertices are found, collisions are rare, so the exploration is nearly a Poisson Galton–Watson tree.", focus: "branching" },
      { text: `The tree survives with probability β where β = 1 − e^(−cβ): here β = ${fmt(A.beta)}.`, focus: "bound" },
      { text: P.c < 1 ? "c < 1: the tree dies out; every component has O(log n) vertices." : P.c > 1 ? `c > 1: about βn = ${fmt(A.beta * P.n)} vertices lie in one giant component.` : "c = 1: critical; components reach order n^(2/3).", focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    return {
      title: `The phase transition: G(${P.n}, c/n) at c = ${fmt(P.c)}`,
      subtitle: "Branching processes inside random graphs",
      narration: `This deck follows the random graph on ${P.n} vertices as the average degree c passes one.`,
      setup: [
        { title: "Problem: when does a giant component appear?", focus: "problem", body: reveal(`$G(n,c/n)$ with $n=${P.n}$.`, "Below $c=1$ components are small; above it one component holds a positive fraction."),
          narration: "We ask when one component suddenly holds a positive fraction of the vertices." },
        { title: "Random object: coupled edge labels", focus: "random-object", body: reveal("Each pair gets $U_e\\sim U[0,1]$; keep $e$ when $U_e\\le p$.", `At $c=${tex(P.c)}$: ${I.present.length} edges, largest component ${I.L1}.`),
          narration: `Each pair gets a uniform label, and an edge is present when its label is below p. At this c the largest component has ${I.L1} vertices.` },
      ],
      method: [
        { title: "Explore like a branching process", focus: "branching", body: reveal(`BFS generations from vertex 0: ${I.bfs.gens.join(", ")}.`, `Poisson(${tex(P.c)}) Galton–Watson: ${I.gw.gens.join(", ")}.`, I.bfs.collision ? `First collision in generation ${I.bfs.collision.generation}: the graph stops being a tree.` : "No collision in the explored generations."),
          narration: "Exploring from a vertex, each newly found vertex has about c new neighbours, just like a branching process with Poisson offspring. The two agree until the exploration first meets a vertex it has already seen." },
        { title: "Technique: survival probability", focus: "bound", body: "$$\\beta=1-e^{-c\\beta}$$",
          narration: "The branching process survives with probability beta, the positive solution of beta equals one minus e to the minus c beta." },
      ],
      results: [
        { title: `Largest component ${I.L1} against βn = ${fmt(A.beta * P.n)}`, focus: "bound", body: reveal(`Regime: ${A.regime}.`, `$L_1=${I.L1}$, $L_2=${I.L2}$, $\\beta(c)n=${tex(A.beta * P.n)}$.`),
          narration: `We are in the ${A.regime}. The largest component has ${I.L1} vertices, the second ${I.L2}, and the prediction is ${spokenNumber(A.beta * P.n)}.` },
        { title: "Experiment: sweep c", focus: "experiment", body: "Moving the slider reuses the same labels, so components only merge. Fresh samples at fixed $c$ illustrate the spread; the theorem is asymptotic.",
          narration: "Moving c reuses the same labels, so components only ever merge. Fresh samples illustrate the spread at finite size." },
      ],
      checks: [
        { title: "Conclusion: a sharp transition at c = 1", focus: "conclusion", body: "$$c<1:\\ L_1=O(\\log n)\\qquad c>1:\\ L_1\\sim\\beta(c)\\,n$$",
          narration: "Below one, every component is logarithmically small. Above one, a unique giant component holds about beta n vertices." },
        { title: "When to use it", focus: "conclusion", body: "- Local exploration of a sparse random structure.\n- Offspring counts are nearly independent and Poisson.\n- Compare with a branching process until collisions matter.",
          key: "Explore a sparse random graph as a branching process: mean offspring c = np decides small versus giant.",
          narration: "Use the branching comparison for sparse random structures explored locally." },
      ],
    };
  },
  scenes: ["problem", "random-object", "branching", "bound", "experiment", "conclusion"],
});

/* ---------- Dependent random choice ---------- */

/** @param {number} N @param {number} alpha @param {() => number} r */
function bipartiteGraph(N, alpha, r) {
  const adj = Array.from({ length: N }, () => new Uint8Array(N));
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) adj[a][b] = r() < alpha ? 1 : 0;
  return adj;
}
/** @param {Uint8Array[]} adj */
function codegrees(adj) {
  const N = adj.length;
  /** @type {number[][]} */
  const co = [];
  for (let a = 0; a < N; a++) { co.push(new Array(N).fill(0)); }
  for (let a = 0; a < N; a++) for (let c = a + 1; c < N; c++) { let s = 0; for (let b = 0; b < N; b++) s += adj[a][b] & adj[c][b]; co[a][c] = co[c][a] = s; }
  return co;
}
/** @param {{ adj: Uint8Array[], co: number[][] }} F @param {number} t @param {number} mThr */
function drcTerms(F, t, mThr) {

  const N = F.adj.length, deg = F.adj.map((row) => row.reduce((s, x) => s + x, 0));
  let EA = 0; for (const d of deg) EA += (d / N) ** t;
  let Ebad = 0, badPairs = 0;
  for (let a = 0; a < N; a++) for (let c = a + 1; c < N; c++) if (F.co[a][c] < mThr) { badPairs++; Ebad += (F.co[a][c] / N) ** t; }
  return { EA, Ebad, badPairs, gain: EA - Ebad };
}
defineModule({
  id: "drc", route: "drc/common-neighbours", title: "Dependent random choice", short: "Dependent random choice",
  family: "drc", archetype: "A set whose pairs have many common neighbours",
  intuition: "Choose a few random vertices and keep their common neighbourhood: sets with few common neighbours are unlikely to survive together.",
  problem: "In a dense bipartite graph, find a large set U ⊆ A in which every pair has at least m common neighbours.",
  randomObject: "t vertices v₁, …, v_t of B chosen uniformly with repetition; A′ = N(v₁) ∩ … ∩ N(v_t).",
  variable: "|A′| and Y = number of pairs in A′ with fewer than m common neighbours; delete one vertex per bad pair.",
  variableTex: "\\mathbb E|A'|=\\sum_{a}\\Big(\\frac{d(a)}{N}\\Big)^t,\\qquad \\mathbb E[Y]=\\sum_{\\{a,a'\\}\\text{ bad}}\\Big(\\frac{|N(a)\\cap N(a')|}{N}\\Big)^t",
  why: "A pair survives in A′ only if every v_i is a common neighbour, probability (codeg/N)^t — tiny for bad pairs. Some choice has |A′| − Y ≥ E|A′| − E[Y]; deleting one vertex per bad pair leaves U.",
  need: "A uniformly random set would contain bad pairs at the same rate as good ones; choosing dependently, through common neighbours, biases towards well-connected pairs.",
  boundTex: "\\exists\\,U:\\ |U|\\ge \\mathbb E|A'|-\\mathbb E[Y]\\ge N\\alpha^t-\\binom N2\\Big(\\frac mN\\Big)^t",
  pattern: { controls: "common-neighbourhood moments", conclusion: "a dense structured subset", worksWhen: "the graph is dense", visual: "contracting intersection of neighbourhoods" },
  params: [
    { key: "N", label: "N (vertices per side)", min: 10, max: 40, step: 1, def: 24 },
    { key: "alpha", label: "α (density)", min: 0.2, max: 0.9, step: 0.05, def: 0.6 },
    { key: "t", label: "t (random vertices chosen)", min: 1, max: 8, step: 1, def: 3 },
    { key: "m", label: "m (required common neighbours)", min: 1, max: 20, step: 1, def: 6 },
  ],
  fixed(P, seed) { const adj = bipartiteGraph(P.N, P.alpha, rng(seed, "drc-graph")); return { adj, co: codegrees(adj) }; },
  analyse(P, F) {
    const T = drcTerms(F, P.t, P.m), N = P.N, edges = F.adj.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0), dens = edges / (N * N);
    const tradeoff = Array.from({ length: 8 }, (_, i) => ({ t: i + 1, ...drcTerms(F, i + 1, P.m) }));
    return {
      ...T, dens, convexity: N * dens ** P.t, classic: N * dens ** P.t - choose(N, 2) * (P.m / N) ** P.t, guarantee: Math.max(0, Math.ceil(T.gain - 1e-9)), ok: T.gain > 0, tradeoff,
      rows: [["density α̂", fmt(dens), `\\hat\\alpha=${tex(dens)}`], ["E|A′|", fmt(T.EA), `\\mathbb E|A'|=${tex(T.EA)}`], ["bad pairs in A", fmt(T.badPairs), String(T.badPairs)], ["E[Y] (bad pairs surviving)", fmt(T.Ebad), `\\mathbb E[Y]=${tex(T.Ebad)}`], ["E|A′| − E[Y]", fmt(T.gain), tex(T.gain)]],
    };
  },
  sample(P, r, F) {
    const N = P.N, T = Array.from({ length: P.t }, () => r.int(N));
    const steps = [];
    let cur = Array.from({ length: N }, (_, a) => a);
    for (const v of T) { cur = cur.filter((a) => F.adj[a][v]); steps.push(cur.length); }
    const bad = [];
    for (let i = 0; i < cur.length; i++) for (let j = i + 1; j < cur.length; j++) if (F.co[cur[i]][cur[j]] < P.m) bad.push([cur[i], cur[j]]);
    const alive = new Set(cur), deleted = [];
    for (const [a, c] of bad) if (alive.has(a) && alive.has(c)) { alive.delete(c); deleted.push(c); }
    const U = [...alive].sort((a, b) => a - b);
    return { T, Aprime: cur, steps, bad, deleted, U, X: cur.length - bad.length };
  },
  stat: (I) => I.X,
  trialCap: () => 10000,
  experiment: { label: "|A′| − Y in one choice", theory: (A) => ({ mean: A.gain, event: "|A′| − Y ≥ E|A′| − E[Y]", eventTest: (x, A2) => x >= A2.gain - 1e-9, bound: null, boundLabel: "Pr > 0 (averaging)" }) },
  assumptions(P, A) {
    return [
      { id: "with-repetition", label: "The t vertices are chosen independently and uniformly (with repetition)", ok: true },
      { id: "positive", label: "E|A′| − E[Y] > 0", ok: A.ok, broken: `E|A′| − E[Y] = ${fmt(A.gain)} ≤ 0: too many surviving bad pairs. Increase t to punish bad pairs, or lower m.` },
    ];
  },
  breakIt: { label: "Choose only one vertex (t = 1)", apply: (P) => ({ ...P, t: 1, m: 20, alpha: Math.min(0.6, Math.max(0.4, P.alpha)) }) },
  compare: ["alterations", "second-moment", "quasirandom"],
  whyNot(P, A) {
    return [
      { title: "Why not a uniformly random subset?", text: `A uniform subset keeps bad pairs at the same rate as good ones. Here ${A.badPairs} pairs are bad; dependent choice keeps a pair only with probability (codeg/N)^t, so bad pairs vanish much faster than large neighbourhoods do.` },
      { title: "The tradeoff", text: "Larger t shrinks A′ like α^t but kills bad pairs like (m/N)^t; the best t balances them (see the tradeoff chart)." },
    ];
  },
  proof(P, A) {
    return [
      { text: `Pick v₁, …, v_${P.t} uniformly from B with repetition; let A′ be their common neighbourhood in A.`, focus: "random-object" },
      { text: `a ∈ A′ with probability (d(a)/N)^t, so E|A′| = ${fmt(A.EA)} ≥ Nα̂^t = ${fmt(A.convexity)} by convexity.`, focus: "variable" },
      { text: `A pair {a, a′} lies in A′ with probability (codeg/N)^t; for the ${A.badPairs} bad pairs (codeg < ${P.m}) this sums to E[Y] = ${fmt(A.Ebad)}.`, focus: "bad" },
      { text: `Some choice has |A′| − Y ≥ ${fmt(A.gain)}.`, focus: "transition" },
      { text: `Delete one vertex from each bad pair: U has at least ${A.guarantee} vertices, every pair with ≥ ${P.m} common neighbours.`, focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    return {
      title: `Dependent random choice: common neighbours in a bipartite graph on ${P.N} + ${P.N} vertices`,
      subtitle: "Choose through the neighbourhoods",
      narration: "This deck finds a large set in which every pair has many common neighbours, by intersecting random neighbourhoods.",
      setup: [
        { title: "Problem: pairs with many common neighbours", focus: "problem", body: reveal(`Bipartite graph, sides of size ${P.N}, density ${tex(A.dens)}.`, `Find $U\\subseteq A$ with every pair having at least $m=${P.m}$ common neighbours.`),
          narration: `In a bipartite graph with density ${spokenNumber(A.dens)}, we want a large set where every pair shares at least ${P.m} neighbours.` },
        { title: "Random object: t random vertices", focus: "random-object", body: reveal(`Choose $v_1,\\dots,v_{${P.t}}\\in B$ uniformly with repetition.`, `Seed ${P.seed}: the common neighbourhood shrinks ${[P.N, ...I.steps].join(" → ")}.`),
          narration: `Choose ${P.t} random vertices on the other side and keep their common neighbourhood. With seed ${P.seed} it shrinks to ${I.Aprime.length} vertices.` },
      ],
      method: [
        { title: "Key random variables", focus: "variable", body: reveal(`$$\\mathbb E|A'|=\\sum_a(d(a)/N)^t=${tex(A.EA)}$$`, `$$\\mathbb E[Y]=\\sum_{\\text{bad}}(\\text{codeg}/N)^t=${tex(A.Ebad)}$$`),
          narration: `The expected size of the common neighbourhood is ${spokenNumber(A.EA)}. The expected number of bad pairs surviving in it is only ${spokenNumber(A.Ebad)}.` },
        { title: "Technique: alteration after dependent choice", focus: "bad", body: reveal("A bad pair survives only if all $t$ choices are common neighbours.", "Delete one vertex from each surviving bad pair."),
          narration: "A bad pair survives only when every chosen vertex happens to be a common neighbour, which is unlikely. Then delete one vertex from each surviving bad pair." },
      ],
      results: [
        { title: `The bound: |U| ≥ ${A.guarantee}`, focus: "transition", body: `$$\\mathbb E|A'|-\\mathbb E[Y]=${tex(A.gain)}$$`,
          narration: `The expected gain is ${spokenNumber(A.gain)}, so some choice leaves at least ${A.guarantee} vertices after deletion.` },
        { title: "Experiment: this choice", focus: "experiment", body: reveal(`Seed ${P.seed}: $|A'|=${I.Aprime.length}$, bad pairs ${I.bad.length}, $|U|=${I.U.length}$.`, "One draw illustrates; the averaging step proves."),
          narration: `This choice keeps ${I.Aprime.length} vertices with ${I.bad.length} bad pairs, leaving ${I.U.length}.` },
      ],
      checks: [
        { title: A.ok ? "Conclusion: the structured set exists" : "Conclusion: the tradeoff fails here", focus: "conclusion", body: A.ok ? `Some $U$ with $|U|\\ge ${A.guarantee}$ has every pair with at least ${P.m} common neighbours.` : "Too many bad pairs survive: change $t$ or $m$.",
          narration: A.ok ? `A set of at least ${A.guarantee} vertices exists in which every pair has ${P.m} or more common neighbours.` : "Too many bad pairs survive at these settings." },
        { title: "When to use it", focus: "conclusion", body: "- A dense graph and a requirement on common neighbourhoods.\n- Embedding sparse bipartite graphs, Turán-type problems.\n- Tune $t$: large neighbourhoods against few bad sets.",
          key: "Choose random vertices and keep their common neighbourhood: badly connected sets rarely survive.",
          narration: "Use dependent random choice when dense graphs must contain sets with rich common neighbourhoods." },
      ],
    };
  },
  scenes: ["problem", "random-object", "variable", "bad", "transition", "experiment", "conclusion"],
});

const STRUCTURE_API = { tripleSystem, runNibble, maxCodegree, symmetricEigenvalues, paleyGraph, quasiGraph, edgesBetween, giantFraction, bfsGenerations, galtonWatson, bipartiteGraph, codegrees, drcTerms, PALEY_PRIMES };
Object.assign(PM, STRUCTURE_API);
