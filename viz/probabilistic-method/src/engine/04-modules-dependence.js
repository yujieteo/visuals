/* Part 4: dependence and concentration — Local Lemma, Moser–Tardos, Janson and Poisson, Chernoff, martingales. */

/* ---------- the hypergraph shared by the Local Lemma and Moser–Tardos ---------- */

/* A k-uniform "band" hypergraph on a ring of N = m·s vertices: edge i is the k consecutive vertices starting at i·s.
 * The stride s sets how much neighbouring edges overlap (so the dependency degree d), independently of the number m of edges. */
/** @typedef {{ N: number, k: number, m: number, s: number, edges: number[][], nbrs: number[][], d: number, degrees: number[] }} BandHypergraph */
/** @param {number} k @param {number} s @param {number} m @returns {BandHypergraph} */
function bandHypergraph(k, s, m) {
  const N = m * s, edges = [];
  for (let i = 0; i < m; i++) { /** @type {number[]} */ const e = []; for (let j = 0; j < k; j++) e.push((i * s + j) % N); edges.push([...new Set(e)].sort((a, b) => a - b)); }
  const nbrs = dependencyGraph(edges), deg = nbrs.map((x) => x.length);
  return { N, k, m, s, edges, nbrs, d: Math.max(0, ...deg), degrees: deg };
}
const monochromatic = (/** @type {number[]} */ e, /** @type {ArrayLike<number>} */ col) => e.every((v) => col[v] === col[e[0]]);
const LLL_E = Math.E;

/** @param {Params} P @param {BandHypergraph} H */
function lllAnalysis(P, H) {
  const p = 2 ** (1 - P.k), d = H.d, m = H.m, gauge = LLL_E * p * (d + 1), union = m * p;
  const lllLower = gauge <= 1 ? (d === 0 ? (1 - p) ** m : (1 - 1 / (d + 1)) ** m) : null;
  return { p, d, m, N: H.N, gauge, union, ok: gauge <= 1, unionOk: union < 1, lllLower, unionLower: Math.max(0, 1 - union) };
}

defineModule({
  id: "local-lemma", route: "local-lemma/hypergraph-colouring", title: "Lovász Local Lemma", short: "Local Lemma",
  family: "local-lemma", archetype: "Hypergraph 2-colouring",
  intuition: "Many bad events are harmless if each one interacts with only a few others.",
  problem: "2-colour the vertices of a k-uniform hypergraph so that no edge is monochromatic.",
  randomObject: "Colour every vertex red or blue by an independent fair coin.",
  variable: "Bad event A_e = edge e is monochromatic, Pr[A_e] = p = 2^(1−k); A_e depends only on the d edges that share a vertex with e.",
  variableTex: "\\Pr[A_e]=p=2^{1-k},\\qquad d=\\max_e\\#\\{f\\neq e:\\ f\\cap e\\neq\\emptyset\\}",
  why: "If e·p·(d+1) ≤ 1 then Pr[no A_e occurs] ≥ (1 − 1/(d+1))^m > 0, however many edges m there are.",
  need: "The union bound needs m·p < 1, which fails as soon as there are many edges. The Local Lemma needs only local sparsity.",
  boundTex: "e\\,p\\,(d+1)\\le 1\\;\\Longrightarrow\\;\\Pr\\Big[\\bigcap_e\\overline{A_e}\\Big]\\ge\\Big(1-\\tfrac1{d+1}\\Big)^m>0",
  pattern: { controls: "local dependency d and p", conclusion: "all bad events avoided at once", worksWhen: "dependence is sparse", visual: "dependency graph" },
  params: [
    { key: "k", label: "k (edge size)", min: 3, max: 8, step: 1, def: 6 },
    { key: "s", label: "stride s (smaller s, more overlap)", min: 1, max: 8, step: 1, def: 2 },
    { key: "m", label: "m (number of edges)", min: 10, max: 200, step: 1, def: 100 },
    { key: "focus", label: "selected event", min: 0, max: 199, step: 1, def: 7 },
  ],
  fixed(P) { return bandHypergraph(P.k, Math.min(P.s, P.k), P.m); },
  analyse(P, H) {
    const A = lllAnalysis(P, H), f = Math.min(P.focus, H.m - 1);
    return {
      ...A, H, focusEvent: f, focusNbrs: H.nbrs[f],
      rows: [["bad events m", fmt(A.m), `m=${A.m}`], ["p = Pr[A_e]", fmt(A.p), `p=2^{1-${P.k}}=${tex(A.p)}`], ["max dependency degree d", fmt(A.d), `d=${A.d}`],
        ["union bound m·p", fmt(A.union), `mp=${tex(A.union)}`], ["Local Lemma e·p·(d+1)", fmt(A.gauge), `e\\,p\\,(d+1)=${tex(A.gauge)}`]],
    };
  },
  sample(P, r, H) {
    const col = new Uint8Array(H.N);
    for (let v = 0; v < H.N; v++) col[v] = r() < 0.5 ? 1 : 0;
    /** @type {number[]} */
    const bad = []; H.edges.forEach((e, i) => { if (monochromatic(e, col)) bad.push(i); });
    return { col, bad, X: bad.length };
  },
  stat: (I) => I.X,
  trialCap: () => 10000,
  experiment: { label: "number of monochromatic edges", theory: (A) => ({ mean: A.union, event: "no bad event (X = 0)", eventTest: (x) => x === 0, bound: A.lllLower ?? A.unionLower, boundKind: "at least", boundLabel: A.ok ? "Pr[X = 0] ≥ (1 − 1/(d+1))^m (Local Lemma)" : "Pr[X = 0] ≥ 1 − m·p (union bound)" }) },
  assumptions(P, A) {
    return [
      { id: "dependency-graph", label: "Each A_e is mutually independent of all events on edges disjoint from e", ok: true },
      { id: "degree", label: `Every event has at most d = ${A.d} neighbours in the dependency graph`, ok: true },
      { id: "condition", label: "e·p·(d+1) ≤ 1", ok: A.ok, broken: `e·p·(d+1) = ${fmt(A.gauge)} > 1: dependencies are too dense. The Local Lemma no longer applies; a good colouring may still exist, but this proof does not show it.` },
    ];
  },
  breakIt: { label: "More overlap, smaller edges (stride 1, k = 5)", apply: (P) => ({ ...P, s: 1, k: Math.min(P.k, 5) }) },
  compare: ["first-moment", "moser-tardos", "janson"],
  whyNot(P, A) {
    return [
      { title: "Why not the union bound?", text: `There are too many bad events: Σ Pr[A_e] = m·p = ${fmt(A.union)}${A.unionOk ? " (here still below 1)" : ", above 1"}. But each bad event depends on only ${A.d} others, and the Local Lemma uses exactly that sparsity: its condition does not mention m.` },
      { title: "Why not Janson?", text: "Janson needs monotone events in a product space and gives a probability estimate; monochromatic events are not monotone. The Local Lemma only needs a dependency graph." },
    ];
  },
  proof(P, A) {
    return [
      { text: `Colour the ${A.N} vertices independently and uniformly red or blue.`, focus: "random-object" },
      { text: `For each of the m = ${A.m} edges let A_e be the event that e is monochromatic: Pr[A_e] = 2^(1−${P.k}) = ${fmt(A.p)}.`, focus: "witnesses" },
      { text: `A_e is determined by the colours on e, so it is mutually independent of all events on edges disjoint from e: at most d = ${A.d} neighbours.`, focus: "dependency" },
      { text: `Union bound: Σ Pr[A_e] = ${fmt(A.union)}${A.unionOk ? " < 1" : " ≥ 1, too large"}. Local Lemma: e·p·(d+1) = ${fmt(A.gauge)}${A.ok ? " ≤ 1" : " > 1"}.`, focus: "condition" },
      A.ok ? { text: `So Pr[no A_e] ≥ (1 − 1/(d+1))^m = ${fmt(A.lllLower)} > 0.`, focus: "transition" } : { text: "The condition fails, so the Local Lemma gives no conclusion here.", focus: "transition" },
      { text: A.ok ? "Therefore a proper 2-colouring of this hypergraph exists." : "No conclusion: increase the stride or the edge size.", focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    return {
      title: `The Lovász Local Lemma: 2-colouring ${A.m} edges of size ${P.k}`,
      subtitle: "Sparse dependence beats a huge union bound",
      narration: `This deck colours a hypergraph with ${A.m} edges of size ${P.k} so that no edge is single coloured, even though the union bound fails.`,
      setup: [
        { title: "Problem: no monochromatic edge", focus: "problem", body: reveal(`A ring of ${A.N} vertices carries ${A.m} edges of ${P.k} consecutive vertices (stride ${Math.min(P.s, P.k)}).`, "Colour the vertices so that every edge sees both colours."),
          narration: `There are ${A.N} vertices on a ring and ${A.m} edges, each made of ${P.k} consecutive vertices. We want every edge to see both colours.` },
        { title: "Random object: a fair coin per vertex", focus: "random-object", body: reveal("Each vertex is red or blue with probability $\\tfrac12$, independently.", `Seed ${P.seed}: ${I.X} monochromatic edges.`),
          narration: `Colour each vertex by a fair coin. With seed ${P.seed} the colouring leaves ${I.X} single coloured edges.` },
      ],
      method: [
        { title: "Bad events and their dependency graph", focus: "dependency", body: reveal(`$A_e$: edge $e$ is monochromatic, $\\Pr[A_e]=2^{1-${P.k}}=${tex(A.p)}$.`, `$A_e$ depends only on edges meeting $e$: at most $d=${A.d}$ of them.`, `Selected: $A_{${A.focusEvent}}$ depends on ${A.focusNbrs.length ? A.focusNbrs.map((x) => `$A_{${x}}$`).join(", ") : "no other event"}.`),
          narration: `Each bad event depends only on the edges it meets, at most ${A.d} of them. The other ${Math.max(0, A.m - 1 - A.d)} or more events are irrelevant to it.` },
        { title: "Technique: the symmetric Local Lemma", focus: "condition", body: reveal("$$\\text{union bound needs } mp<1$$", "$$\\text{Local Lemma needs } e\\,p\\,(d+1)\\le 1$$", "The Local Lemma's condition does not mention $m$."),
          notes: "Narration: the important quantity is no longer the total number of bad events, only the size of each event's dependency neighbourhood.",
          narration: "The union bound asks for the total probability to be below one. The Local Lemma only asks that e times p times d plus one is at most one. The number of events never enters." },
      ],
      results: [
        { title: `The gauge: e·p·(d+1) = ${fmt(A.gauge)}`, focus: "condition", body: reveal(`$$mp=${A.m}\\cdot ${tex(A.p)}=${tex(A.union)}${A.unionOk ? "<1" : ">1"}$$`, `$$e\\,p\\,(d+1)=${tex(A.gauge)}${A.ok ? "\\le 1" : ">1"}$$`),
          narration: `The union bound sum is ${spokenNumber(A.union)}${A.unionOk ? ", still below one" : ", hopelessly above one"}. The Local Lemma quantity is ${spokenNumber(A.gauge)}${A.ok ? ", within its limit" : ", above its limit"}.` },
        { title: "Experiment: how often a random colouring works", focus: "experiment", body: reveal(`Seed ${P.seed}: ${I.X} bad edges.`, A.ok ? `The Local Lemma guarantees $\\Pr[\\text{none}]\\ge ${tex(/** @type {number} A.ok, so the Local Lemma bound exists */ (A.lllLower))}$; samples illustrate how loose that is.` : "Samples may still find good colourings: failure of the condition is not failure of existence."),
          narration: A.ok ? `The Local Lemma guarantees a success probability of at least ${spokenNumber(/** @type {number} */ (A.lllLower))}. Simulation shows the true chance is usually far larger, but proves nothing.` : "Simulation may still find good colourings. A failed condition only means this proof is silent." },
      ],
      checks: [
        { title: A.ok ? "Conclusion: a proper colouring exists" : "Conclusion: the condition fails", focus: "conclusion", body: A.ok ? "$$\\Pr\\Big[\\bigcap_e\\overline{A_e}\\Big]>0$$\n\nSo an outcome avoiding every bad event exists." : "The dependency neighbourhoods are too large; increase the stride or the edge size.",
          narration: A.ok ? "With positive probability no edge is single coloured, so a proper colouring exists." : "Dependencies are too dense, so the Local Lemma gives no conclusion here." },
        { title: "When to use it", focus: "conclusion", body: "- Many bad events, each individually unlikely.\n- Each depends on only a few others.\n- Next: Moser–Tardos turns this existence proof into an algorithm.",
          key: "Avoid all bad events at once when each is unlikely and depends on few others: e·p·(d+1) ≤ 1.",
          narration: "Use the Local Lemma when bad events are individually rare and locally dependent. The total number of events does not matter." },
      ],
    };
  },
  scenes: ["problem", "random-object", "witnesses", "dependency", "union-bound", "condition", "experiment", "conclusion"],
});

/* ---------- Moser–Tardos ---------- */

/* Resample the variables of the lowest-numbered violated edge until none is violated (or maxSteps). */
/** @param {BandHypergraph} H @param {() => number} r */
function moserTardos(H, r, maxSteps = 100000) {
  const col = new Uint8Array(H.N);
  for (let v = 0; v < H.N; v++) col[v] = r() < 0.5 ? 1 : 0;
  const initial = col.slice();
  /** @type {{ event: number, values: number[] }[]} */
  const log = [];
  const violated = () => { for (let i = 0; i < H.m; i++) if (monochromatic(H.edges[i], col)) return i; return -1; };
  let e;
  while ((e = violated()) >= 0 && log.length < maxSteps) {
    const fresh = H.edges[e].map(() => (r() < 0.5 ? 1 : 0));
    H.edges[e].forEach((v, j) => { col[v] = fresh[j]; });
    log.push({ event: e, values: fresh });
  }
  return { initial, final: col, log, resamplings: log.length, done: violated() < 0 };
}
/** @param {ReturnType<typeof lllAnalysis>} A */
function mtBound(A) {
  if (!A.ok) return null;
  const x = A.d === 0 ? A.p : 1 / (A.d + 1);
  return A.m * x / (1 - x);
}

defineModule({
  id: "moser-tardos", route: "moser-tardos/hypergraph-colouring", title: "Moser–Tardos resampling", short: "Moser–Tardos",
  family: "local-lemma", archetype: "Constructive hypergraph colouring",
  intuition: "Fix one violated constraint at a time by resampling only its variables; under the Local Lemma condition this ends fast.",
  problem: "Actually find a proper 2-colouring whose existence the Local Lemma guarantees.",
  randomObject: "A random colouring, then fresh coins for the vertices of each violated edge in turn.",
  variable: "R = total number of resamplings before no edge is monochromatic.",
  variableTex: "\\mathbb E[R]\\le\\sum_e\\frac{x_e}{1-x_e},\\qquad x_e=\\tfrac1{d+1}",
  why: "Moser and Tardos showed that under the asymmetric Local Lemma condition each event is resampled at most x/(1−x) times on average, so the process stops.",
  need: "The Local Lemma's probability (1 − 1/(d+1))^m can be astronomically small; sampling blindly would never find the colouring.",
  boundTex: "\\mathbb E[R]\\le\\frac{m}{d}\\quad(x=\\tfrac1{d+1},\\ d\\ge1)",
  pattern: { controls: "local dependency (as the Local Lemma)", conclusion: "the good object is found quickly", worksWhen: "the Local Lemma condition holds", visual: "resampling history" },
  params: [
    { key: "k", label: "k (edge size)", min: 3, max: 8, step: 1, def: 6 },
    { key: "s", label: "stride s", min: 1, max: 8, step: 1, def: 2 },
    { key: "m", label: "m (number of edges)", min: 10, max: 200, step: 1, def: 100 },
  ],
  fixed(P) { return bandHypergraph(P.k, Math.min(P.s, P.k), P.m); },
  analyse(P, H) {
    const A = lllAnalysis(P, H), bound = mtBound(A);
    return { ...A, H, bound, rows: [["bad events m", fmt(A.m), `m=${A.m}`], ["max dependency degree d", fmt(A.d), `d=${A.d}`], ["e·p·(d+1)", fmt(A.gauge), `e\\,p\\,(d+1)=${tex(A.gauge)}`], ["E[resamplings] ≤", bound === null ? "—" : fmt(bound), bound === null ? "\\text{no guarantee}" : `\\mathbb E[R]\\le ${tex(bound)}`]] };
  },
  sample(P, r, H) { const run = moserTardos(H, r); return { ...run, X: run.resamplings }; },
  stat: (I) => I.X,
  trialCap: () => 2000,
  experiment: { label: "R = resamplings until no edge is monochromatic", theory: (A) => ({ mean: A.bound, meanLabel: "bound on E[R]", event: "R ≤ bound", eventTest: (x, A2) => A2.bound !== null && x <= A2.bound, bound: null, boundLabel: "E[R] ≤ Σ x/(1 − x)" }) },
  assumptions(P, A) {
    return [
      { id: "variables", label: "Every bad event is determined by a set of independent variables (its vertices)", ok: true },
      { id: "condition", label: "Local Lemma condition e·p·(d+1) ≤ 1", ok: A.ok, broken: `e·p·(d+1) = ${fmt(A.gauge)} > 1, so the running-time guarantee is void. The algorithm may still finish, or may run for a very long time.` },
    ];
  },
  breakIt: { label: "Make dependencies dense", apply: (P) => ({ ...P, s: 1, k: Math.min(P.k, 4) }) },
  compare: ["local-lemma", "derandomization", "alterations"],
  whyNot(P, A) {
    return [
      { title: "Why not resample everything?", text: `A full fresh colouring succeeds with probability that may be as small as ${A.lllLower === null ? "—" : fmt(A.lllLower)}. Resampling only the ${P.k} variables of one violated edge changes ${P.k} of ${A.N} variables, leaving the rest of the progress intact.` },
      { title: "Why not conditional expectation?", text: "Derandomising the Local Lemma directly is much harder than derandomising a first-moment argument; Moser–Tardos is the practical route." },
    ];
  },
  proof(P, A) {
    return [
      { text: "Start from a uniformly random colouring.", focus: "random-object" },
      { text: "While some edge is monochromatic, pick one (here the lowest-numbered) and recolour only its vertices with fresh coins.", focus: "resample" },
      { text: `Each step changes ${P.k} of the ${A.N} variables and can only create violations among the ≤ ${A.d} dependent edges.`, focus: "dependency" },
      { text: A.ok ? `Moser–Tardos: with x = ${A.d === 0 ? "p" : "1/(d+1)"}, E[resamplings] ≤ m·x/(1−x) = ${fmt(A.bound)}.` : "Without the condition there is no running-time bound.", focus: "bound" },
      { text: "When it stops, no edge is monochromatic: the colouring is the witness the Local Lemma promised.", focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    const hist = I.log.slice(0, 8).map((s) => `$A_{${s.event}}$`).join(" → ") || "none";
    return {
      title: `Moser–Tardos: finding the colouring, ${A.m} edges of size ${P.k}`,
      subtitle: "The Local Lemma becomes an algorithm",
      narration: "This deck turns the Local Lemma into an algorithm by resampling only the variables of a violated edge.",
      setup: [
        { title: "Problem: construct, don't just prove", focus: "problem", body: reveal("The Local Lemma says a proper colouring exists.", `Its probability bound may be tiny: ${A.lllLower === null ? "here none applies" : `$${tex(/** @type {number} A.ok, so the Local Lemma bound exists */ (A.lllLower))}$`}.`, "We want to find one."),
          narration: "The Local Lemma proves a proper colouring exists, but its probability bound can be tiny. We want an efficient way to find one." },
        { title: "Random object: a colouring, then local fixes", focus: "random-object", body: reveal("Start from a uniformly random colouring.", `Seed ${P.seed}: ${I.log.length ? `the first violated edge is $A_{${I.log[0].event}}$` : "no edge is violated"}.`),
          narration: `Start from a random colouring. With seed ${P.seed} the algorithm needed ${I.resamplings} resamplings.` },
      ],
      method: [
        { title: "Algorithm: resample one violated edge", focus: "resample", body: reveal("1. Find a monochromatic edge.", "2. Recolour only its vertices with fresh coins.", "3. Repeat until no edge is monochromatic."),
          narration: "Find a violated edge, give only its vertices fresh coins, and repeat. Everything else stays as it was." },
        { title: "Why it is local", focus: "dependency", body: reveal(`Each step changes ${P.k} of ${A.N} variables.`, `It can only break the at most $d=${A.d}$ neighbouring edges.`),
          narration: `Each step touches ${P.k} of the ${A.N} variables and can only disturb the at most ${A.d} neighbouring edges.` },
      ],
      results: [
        { title: A.bound === null ? "No running-time guarantee" : `Expected resamplings ≤ ${fmt(A.bound)}`, focus: "bound", body: A.bound === null ? "$e\\,p\\,(d+1)>1$: the theorem gives no bound." : `$$\\mathbb E[R]\\le \\sum_e \\frac{x}{1-x}=${tex(A.bound)}$$`,
          narration: A.bound === null ? "The Local Lemma condition fails, so there is no guarantee on the running time." : `Moser and Tardos bound the expected number of resamplings by ${spokenNumber(A.bound)}.` },
        { title: `Experiment: seed ${P.seed} took ${I.resamplings} resamplings`, focus: "experiment", body: reveal(`History: ${hist}${I.log.length > 8 ? " → …" : ""} → ✓`, "One run illustrates; the expectation bound is the theorem."),
          narration: `This run needed ${I.resamplings} resamplings. One run illustrates the behaviour, and the expectation bound is the theorem.` },
      ],
      checks: [
        { title: "Conclusion: the witness, constructed", focus: "conclusion", body: I.done ? "The final colouring has no monochromatic edge." : "This run hit the step cap before finishing.",
          narration: I.done ? "When the algorithm stops, no edge is single coloured. We hold the object the Local Lemma promised." : "This run stopped at its step cap before finishing." },
        { title: "When to use it", focus: "conclusion", body: "- Bad events are determined by independent variables.\n- The Local Lemma condition holds.\n- You need the object, not just its existence.",
          key: "Under the Local Lemma condition, resampling violated events finds a good outcome quickly.",
          narration: "Use Moser and Tardos when you need the object itself. Under the Local Lemma condition, local resampling finishes quickly." },
      ],
    };
  },
  scenes: ["problem", "random-object", "resample", "dependency", "bound", "experiment", "conclusion"],
});

/* ---------- Janson and Poisson: triangles in G(n, p) ---------- */

/** @param {Params} P @param {Rng} r @returns {Graph & { planted?: number[] }} */
function plantedGraph(P, r) {
  /** @type {Graph & { planted?: number[] }} */
  const G = gnp(P.n, P.p, r);
  if (P.rho > 0 && r() < P.rho) {
    const vs = r.shuffle(Array.from({ length: P.n }, (_, i) => i)).slice(0, 4);
    const set = new Set(G.edges.map(([a, b]) => a * P.n + b));
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) { const x = Math.min(vs[a], vs[b]), y = Math.max(vs[a], vs[b]); if (!set.has(x * P.n + y)) { set.add(x * P.n + y); G.adj[x * P.n + y] = G.adj[y * P.n + x] = 1; G.edges.push([x, y]); } }
    G.planted = vs;
  }
  return G;
}
defineModule({
  id: "janson", route: "poisson/janson-triangles", title: "Janson inequality and the Poisson paradigm", short: "Janson / Poisson",
  family: "rare-events", archetype: "Triangle avoidance in G(n,p)",
  intuition: "Rare, mostly independent events behave like a Poisson count; Janson pays for the overlaps exactly.",
  problem: "Estimate the probability that G(n,p) has no triangle.",
  randomObject: "G(n,p); each of the C(n,3) potential triangles is a rare bad event.",
  variable: "μ = Σ Pr[A_i] = C(n,3)p³ and Δ = Σ over ordered pairs of triangles sharing an edge of Pr[A_i ∩ A_j].",
  variableTex: "\\mu=\\binom n3p^3,\\qquad \\Delta=\\sum_{i\\sim j}\\Pr[A_i\\cap A_j]=\\binom n3\\,3(n-3)\\,p^5",
  why: "For increasing events in a product space, Harris gives Pr[none] ≥ Π(1 − Pr[A_i]) and Janson gives Pr[none] ≤ e^(−μ + Δ/2): when Δ is small both are near e^(−μ).",
  need: "The events are dependent (triangles share edges) and not rare enough for the union bound; the Local Lemma gives only a lower bound.",
  boundTex: "\\prod_i(1-\\Pr[A_i])\\le\\Pr\\Big[\\bigcap_i\\overline{A_i}\\Big]\\le e^{-\\mu+\\Delta/2}",
  pattern: { controls: "μ and the overlap penalty Δ", conclusion: "avoidance probability ≈ e^(−μ)", worksWhen: "rare monotone events with few overlaps", visual: "overlap network" },
  params: [
    { key: "n", label: "n (vertices)", min: 5, max: 40, step: 1, def: 20 },
    { key: "p", label: "p (edge probability)", min: 0.01, max: 0.6, step: 0.005, def: 0.1 },
    { key: "rho", label: "clumping ρ (plant a K₄ with this probability)", min: 0, max: 1, step: 0.05, def: 0 },
  ],
  analyse(P) {
    const { n, p } = P, T = choose(n, 3), mu = T * p ** 3, Delta = T * 3 * (n - 3) * p ** 5;
    const harris = (1 - p ** 3) ** T, janson = Math.exp(-mu + Delta / 2), extended = Delta >= mu && Delta > 0 ? Math.exp(-(mu * mu) / (2 * Delta)) : null;
    return {
      T, mu, Delta, harris, janson: Math.min(1, janson), extended, poisson0: Math.exp(-mu), ok: P.rho === 0,
      pmf: Array.from({ length: 16 }, (_, k) => poissonPmf(mu, k)),
      rows: [["potential triangles", fmt(T), `\\binom{${n}}{3}=${T}`], ["μ = expected triangles", fmt(mu), `\\mu=${tex(mu)}`], ["Δ (ordered overlapping pairs)", fmt(Delta), `\\Delta=${tex(Delta)}`],
        ["Harris lower Π(1 − p³)", fmt(harris), tex(harris)], ["Poisson guess e^(−μ)", fmt(Math.exp(-mu)), tex(Math.exp(-mu))], ["Janson upper e^(−μ+Δ/2)", fmt(Math.min(1, janson)), tex(Math.min(1, janson))]],
    };
  },
  sample(P, r) { const G = plantedGraph(P, r); const tris = []; const { n, adj } = G;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (adj[i * n + j]) for (let k = j + 1; k < n; k++) if (adj[i * n + k] && adj[j * n + k]) tris.push([i, j, k]);
    return { G, tris, X: tris.length }; },
  stat: (I) => I.X,
  trialCap: (P) => Math.max(500, Math.min(10000, Math.floor(4e7 / (P.n ** 3)))),
  experiment: { label: "X = triangles in one G(n,p)", theory: (A) => ({ mean: A.mu, event: "no triangle (X = 0)", eventTest: (x) => x === 0, bound: A.janson, boundKind: "at most", boundLabel: "Pr[X = 0] ≤ e^(−μ+Δ/2) (Janson)", lower: A.harris, lowerLabel: "≥ Π(1 − p³) (Harris)", pmf: A.pmf }) },
  assumptions(P, A) {
    return [
      { id: "product", label: "Edges are independent (a product probability space)", ok: P.rho === 0, broken: "Planting a K₄ makes edges dependent: the space is no longer a product, so Harris and Janson are not justified. Triangles now arrive in clumps of four and the Poisson shape breaks." },
      { id: "monotone", label: "Each A_i (a triangle is present) is an increasing event", ok: true },
      { id: "delta-small", label: "Δ is small compared with μ (so the bounds are tight)", ok: A.Delta < A.mu, broken: `Δ = ${fmt(A.Delta)} ≥ μ = ${fmt(A.mu)}: use the extended Janson bound e^(−μ²/(2Δ)) = ${A.extended === null ? "—" : fmt(A.extended)}.` },
    ];
  },
  breakIt: { label: "Clump the events (ρ = 0.5)", apply: (P) => ({ ...P, rho: 0.5 }) },
  compare: ["local-lemma", "second-moment", "chernoff"],
  whyNot(P, A) {
    return [
      { title: "Why not the union bound?", text: `It only shows Pr[some triangle] ≤ μ = ${fmt(A.mu)}, which says nothing about Pr[no triangle] when μ ≥ 1.` },
      { title: "Why not assume independence?", text: `Triangles sharing an edge are positively correlated. Janson charges exactly for this through Δ = ${fmt(A.Delta)}; when Δ → 0 the Poisson guess e^(−μ) becomes correct.` },
    ];
  },
  proof(P, A) {
    return [
      { text: `Let G ~ G(${P.n}, ${fmt(P.p)}) and A_i be the event that the i-th of the ${fmt(A.T)} triangles is present.`, focus: "random-object" },
      { text: `μ = Σ Pr[A_i] = C(n,3)p³ = ${fmt(A.mu)}.`, focus: "variable" },
      { text: `Triangles sharing one edge overlap: Δ = C(n,3)·3(n−3)·p⁵ = ${fmt(A.Delta)} (ordered pairs; two edges shared would be the same triangle).`, focus: "overlap" },
      { text: `Harris (FKG) lower bound: Pr[no triangle] ≥ Π(1 − p³) = ${fmt(A.harris)}.`, focus: "bound" },
      { text: `Janson upper bound: Pr[no triangle] ≤ e^(−μ+Δ/2) = ${fmt(A.janson)}.`, focus: "bound" },
      { text: "Both bracket the Poisson guess e^(−μ), and the number of triangles is approximately Poisson(μ).", focus: "poisson" },
    ];
  },
  story(P, A, I) {
    return {
      title: `Janson and Poisson: triangles in G(${P.n}, ${fmt(P.p)})`,
      subtitle: "Rare overlapping events, priced exactly",
      narration: "This deck estimates the chance that a random graph has no triangle, and why the triangle count looks Poisson.",
      setup: [
        { title: "Problem: how likely is triangle-free?", focus: "problem", body: reveal(`In $G(${P.n},${tex(P.p)})$, what is $\\Pr[\\text{no triangle}]$?`, "Each potential triangle is a rare bad event; they overlap when they share an edge."),
          narration: "We want the probability that the random graph has no triangle. Each possible triangle is a rare event, and triangles sharing an edge overlap." },
        { title: "Random object: G(n,p)", focus: "random-object", body: reveal(`Seed ${P.seed}: ${I.X} triangles.`, P.rho > 0 ? `Clumping on: a $K_4$ is planted with probability ${tex(P.rho)}.` : "Edges independent."),
          narration: `With seed ${P.seed} the sampled graph has ${I.X} triangles.` },
      ],
      method: [
        { title: "Key quantities: μ and Δ", focus: "overlap", body: reveal(`$$\\mu=\\binom{${P.n}}3p^3=${tex(A.mu)}$$`, `$$\\Delta=\\binom{${P.n}}3\\cdot3(${P.n}-3)\\,p^5=${tex(A.Delta)}$$`),
          narration: `The expected number of triangles is ${spokenNumber(A.mu)}. The overlap penalty, summing over pairs of triangles sharing an edge, is ${spokenNumber(A.Delta)}.` },
        { title: "Technique: Harris below, Janson above", focus: "bound", body: "$$\\prod_i(1-\\Pr A_i)\\le\\Pr\\Big[\\bigcap\\overline{A_i}\\Big]\\le e^{-\\mu+\\Delta/2}$$",
          narration: "For increasing events in a product space, Harris gives a lower bound by pretending independence, and Janson gives an upper bound that pays for the overlaps." },
      ],
      results: [
        { title: "The bracket", focus: "bound", body: `| estimate | value |\n| --- | --- |\n| Harris lower | ${tex(A.harris)} |\n| Poisson guess $e^{-\\mu}$ | ${tex(A.poisson0)} |\n| Janson upper | ${tex(A.janson)} |`,
          narration: `The truth lies between ${spokenNumber(A.harris)} and ${spokenNumber(A.janson)}, close to the Poisson guess of ${spokenNumber(A.poisson0)}.` },
        { title: "Experiment: the count looks Poisson", focus: "poisson", body: reveal(`Seed ${P.seed}: $X=${I.X}$.`, "In the lab the empirical histogram is drawn against $e^{-\\mu}\\mu^k/k!$; it illustrates the Poisson paradigm, it does not prove it."),
          narration: "Across many samples the triangle count follows the Poisson shape. The simulation illustrates this, and the inequalities are the proof." },
      ],
      checks: [
        { title: "Conclusion: Pr[triangle-free] ≈ e^(−μ)", focus: "conclusion", body: A.ok ? `$$${tex(A.harris)}\\le\\Pr[\\text{no triangle}]\\le ${tex(A.janson)}$$` : "With clumping the space is not a product: the bracket is not justified.",
          narration: A.ok ? "The probability of no triangle is pinned between the Harris and Janson bounds." : "With clumping switched on, the hypotheses fail and the bracket is not justified." },
        { title: "When to use it", focus: "conclusion", body: "- Many rare increasing events in a product space.\n- Overlaps are measurable and small ($\\Delta\\ll\\mu$).\n- You want $\\Pr[\\text{none}]$, not just existence.",
          key: "When rare events barely overlap, the chance none occurs is about e^(−μ); Janson charges Δ/2 for the overlaps.",
          narration: "Use Janson for rare increasing events with small overlaps. The chance none occurs is about e to the minus mu." },
      ],
    };
  },
  scenes: ["problem", "random-object", "variable", "overlap", "bound", "poisson", "experiment", "conclusion"],
});

/* ---------- Chernoff: the degree of a vertex ---------- */

/** @param {Params} P */
function chernoffAnalysis(P) {
  const N = P.n - 1, p = P.p, mu = N * p, d = P.delta, a = (1 + d) * mu, rho = P.rho;
  const indepTail = binomUpperTail(N, a, p), allOn = N >= a - 1e-12 ? p : 0;
  const exact = (1 - rho) * indepTail + rho * allOn;
  const varIndep = N * p * (1 - p), EX2 = (1 - rho) * (varIndep + mu * mu) + rho * N * N * p, variance = EX2 - mu * mu;
  const lambda = Math.log1p(d), mgf = Math.min(1, Math.exp(N * Math.log1p(p * (Math.exp(lambda) - 1)) - lambda * a));
  return {
    N, mu, a, exact, chernoff: chernoffUpper(mu, d), simple: chernoffSimple(mu, d), mgf, lambda,
    chebyshev: Math.min(1, variance / ((d * mu) ** 2)), markov: Math.min(1, 1 / (1 + d)), variance,
    normal: normalUpper((Math.ceil(a - 1e-12) - 0.5 - mu) / Math.sqrt(Math.max(variance, 1e-12))), ok: rho === 0,
  };
}
defineModule({
  id: "chernoff", route: "concentration/chernoff", title: "Chernoff bounds", short: "Chernoff",
  family: "concentration", archetype: "Degree concentration in G(n,p)",
  intuition: "A sum of many independent small pieces almost never strays far from its mean: the tail falls exponentially.",
  problem: "Show a fixed vertex of G(n,p) has degree near (n−1)p, with an explicit failure probability.",
  randomObject: "The n − 1 potential edges at a vertex, each present independently with probability p.",
  variable: "X = deg(v) ~ Bin(n−1, p), μ = (n−1)p; the event is X ≥ (1+δ)μ.",
  variableTex: "X\\sim\\operatorname{Bin}(n-1,p),\\qquad \\mu=(n-1)p",
  why: "Markov applied to e^(λX) gives Pr[X ≥ a] ≤ E[e^(λX)]e^(−λa); independence factorises the expectation and λ = ln(1+δ) optimises it.",
  need: "Chebyshev uses only the variance and decays like 1/t²; independence of all summands buys an exponential tail.",
  boundTex: "\\Pr[X\\ge(1+\\delta)\\mu]\\le\\left(\\frac{e^{\\delta}}{(1+\\delta)^{1+\\delta}}\\right)^{\\mu}\\le e^{-\\delta^2\\mu/(2+\\delta)}",
  pattern: { controls: "a sum of independent bounded variables", conclusion: "exponential concentration", worksWhen: "summands are independent", visual: "exact PMF under an exponential envelope" },
  params: [
    { key: "n", label: "n (vertices)", min: 11, max: 2001, step: 10, def: 201 },
    { key: "p", label: "p (edge probability)", min: 0.01, max: 0.9, step: 0.01, def: 0.1 },
    { key: "delta", label: "δ (relative deviation)", min: 0.05, max: 2, step: 0.05, def: 0.5 },
    { key: "rho", label: "correlation ρ (all edges copy one coin with this probability)", min: 0, max: 1, step: 0.05, def: 0 },
  ],
  analyse(P) {
    const C = chernoffAnalysis(P);
    return {
      ...C,
      bars: [["exact Pr[X ≥ a]", C.exact, "truth"], ["Chernoff (optimal)", C.chernoff, C.ok ? "proved" : "not justified"], ["Chernoff e^(−δ²μ/(2+δ))", C.simple, C.ok ? "proved" : "not justified"],
        ["Chebyshev Var/(δμ)²", C.chebyshev, "proved"], ["Markov μ/a", C.markov, "proved"]],
      rows: [["μ = (n−1)p", fmt(C.mu), `\\mu=${tex(C.mu)}`], ["threshold a = (1+δ)μ", fmt(C.a), `a=${tex(C.a)}`], ["exact Pr[X ≥ a]", fmt(C.exact), tex(C.exact)], ["Chernoff bound", fmt(C.chernoff), tex(C.chernoff)],
        ["slack (bound / exact)", fmt(C.exact > 0 ? C.chernoff / C.exact : Infinity), ""], ["normal approximation (heuristic)", fmt(C.normal), ""]],
    };
  },
  sample(P, r) {
    const N = P.n - 1, nb = new Uint8Array(N);
    if (P.rho > 0 && r() < P.rho) { const b = r() < P.p ? 1 : 0; nb.fill(b); } else for (let i = 0; i < N; i++) nb[i] = r() < P.p ? 1 : 0;
    return { nb, X: nb.reduce((s, x) => s + x, 0) };
  },
  stat: (I) => I.X,
  trialCap: (P) => Math.max(1000, Math.min(10000, Math.floor(2e7 / P.n))),
  experiment: { label: "X = degree of the vertex", theory: (A) => ({ mean: A.mu, event: "X ≥ (1+δ)μ", eventTest: (x, A2) => x >= A2.a - 1e-12, bound: A.ok ? A.chernoff : A.markov, boundKind: "at most", boundLabel: A.ok ? "Chernoff upper bound" : "Markov (Chernoff not justified)", exact: A.exact }) },
  assumptions(P, A) {
    return [
      { id: "independent", label: "X₁, …, X_{n−1} are independent", ok: P.rho === 0, broken: `With ρ = ${fmt(P.rho)} the edges are correlated: the MGF no longer factorises. CHERNOFF BOUND not justified. Exact tail ${fmt(A.exact)} ${A.exact > A.chernoff ? `exceeds the would-be bound ${fmt(A.chernoff)}` : `against a would-be bound ${fmt(A.chernoff)}`}. Chebyshev (with the true variance) and Markov still hold.` },
      { id: "bounded", label: "Each summand is a Bernoulli variable in [0, 1]", ok: true },
      { id: "delta", label: "δ > 0 (an upper tail above the mean)", ok: P.delta > 0 },
    ];
  },
  breakIt: { label: "Introduce correlation", apply: (P) => ({ ...P, rho: 0.3, delta: Math.max(P.delta, 1) }) },
  compare: ["martingale", "second-moment", "discrepancy"],
  whyNot(P, A) {
    return [
      { title: "Why not Chebyshev?", text: `Chebyshev gives ${fmt(A.chebyshev)}, decaying like 1/t². Independence of all ${A.N} summands lets Chernoff reach ${fmt(A.chernoff)}, exponentially small in μ.` },
      { title: "Why not Azuma?", text: "Azuma needs only bounded martingale differences, so it survives some dependence, but for a plain independent sum it is the same exponent or worse; Chernoff exploits the small variance of sparse Bernoullis." },
    ];
  },
  proof(P, A) {
    return [
      { text: `X = Σ X_i with X_i ~ Bernoulli(${fmt(P.p)}) independent, n − 1 = ${A.N}, μ = ${fmt(A.mu)}.`, focus: "random-object" },
      { text: `For λ > 0, 1[X ≥ a] ≤ e^(λ(X − a)), so Pr[X ≥ a] ≤ e^(−λa) E[e^(λX)].`, focus: "mgf" },
      { text: `Independence: E[e^(λX)] = Π(1 + p(e^λ − 1)) ≤ e^(μ(e^λ − 1)).`, focus: "mgf" },
      { text: `Choose λ = ln(1+δ) = ${fmt(A.lambda)}: Pr[X ≥ (1+δ)μ] ≤ (e^δ/(1+δ)^(1+δ))^μ = ${fmt(A.chernoff)}.`, focus: "bound" },
      { text: `The exact tail is ${fmt(A.exact)}; Chebyshev would give ${fmt(A.chebyshev)} and Markov ${fmt(A.markov)}.`, focus: "bound" },
      { text: `So deg(v) < ${fmt(A.a)} with probability at least ${fmt(1 - A.chernoff)}.`, focus: "conclusion" },
    ];
  },
  asymptotic(P, A) {
    const h = (1 + P.delta) * Math.log1p(P.delta) - P.delta;
    return { formula: "ln Pr[X ≥ (1+δ)μ] ≤ −μ·((1+δ)ln(1+δ) − δ)", terms: [["μ", A.mu], ["(1+δ)ln(1+δ) − δ", h]], total: -A.mu * h, note: "The exponent is linear in μ: doubling the expected degree squares the bound." };
  },
  story(P, A, I) {
    return {
      title: `Chernoff: the degree of a vertex in G(${P.n}, ${fmt(P.p)})`,
      subtitle: "Independent sums have exponentially thin tails",
      narration: `This deck bounds the chance that a vertex's degree exceeds its mean by a factor of ${spokenNumber(1 + P.delta)}.`,
      setup: [
        { title: "Problem: is the degree near its mean?", focus: "problem", body: reveal(`$X=\\deg(v)\\sim\\operatorname{Bin}(${A.N},${tex(P.p)})$, $\\mu=${tex(A.mu)}$.`, `How likely is $X\\ge(1+\\delta)\\mu=${tex(A.a)}$?`),
          narration: `The degree of a fixed vertex is binomial with mean ${spokenNumber(A.mu)}. How likely is it to reach ${spokenNumber(A.a)}?` },
        { title: "Random object: n − 1 independent coins", focus: "random-object", body: reveal(P.rho > 0 ? `Correlated: with probability ${tex(P.rho)} all edges copy one coin.` : "Each potential edge at $v$ is present independently.", `Seed ${P.seed}: $X=${I.X}$.`),
          narration: `Each of the ${A.N} possible edges is an independent coin. With seed ${P.seed} the degree is ${I.X}.` },
      ],
      method: [
        { title: "Technique: exponentiate, then Markov", focus: "mgf", body: reveal("$$\\mathbf 1[X\\ge a]\\le e^{\\lambda(X-a)}$$", "$$\\Pr[X\\ge a]\\le e^{-\\lambda a}\\,\\mathbb E[e^{\\lambda X}]$$"),
          narration: "The tail indicator lies below an exponential curve. Taking expectations turns Markov's inequality into a bound on the moment generating function." },
        { title: "Independence factorises the MGF", focus: "mgf", body: reveal("$$\\mathbb E[e^{\\lambda X}]=\\prod_i\\big(1+p(e^\\lambda-1)\\big)\\le e^{\\mu(e^\\lambda-1)}$$", `$\\lambda=\\ln(1+\\delta)=${tex(A.lambda)}$`),
          narration: "Because the coins are independent, the expectation of the exponential factorises. The best exponent is the logarithm of one plus delta." },
      ],
      results: [
        { title: `The bound against the truth`, focus: "bound", body: `| quantity | value |\n| --- | --- |\n| exact tail | ${tex(A.exact)} |\n| Chernoff | ${tex(A.chernoff)} |\n| Chebyshev | ${tex(A.chebyshev)} |\n| Markov | ${tex(A.markov)} |`,
          narration: `The exact tail is ${spokenNumber(A.exact)}. Chernoff gives ${spokenNumber(A.chernoff)}, Chebyshev ${spokenNumber(A.chebyshev)}, and Markov ${spokenNumber(A.markov)}.` },
        { title: "Experiment: sampled degrees", focus: "experiment", body: reveal(`Seed ${P.seed}: $X=${I.X}$.`, "Sampled degrees illustrate the shape; the bound is proved, the histogram is not."),
          narration: `This sample has degree ${I.X}. Histograms of many samples illustrate the tail, but the bound is the theorem.` },
      ],
      checks: [
        { title: A.ok ? "Conclusion: exponential concentration" : "Conclusion: Chernoff is not justified", focus: "conclusion", body: A.ok ? `$$\\Pr[X\\ge ${tex(A.a)}]\\le ${tex(A.chernoff)}$$` : "The summands are correlated, so the MGF does not factorise. Only Markov and Chebyshev (with the true variance) remain valid.",
          narration: A.ok ? `The degree exceeds ${spokenNumber(A.a)} with probability at most ${spokenNumber(A.chernoff)}.` : "With correlated edges the Chernoff bound is not justified. Only Markov and Chebyshev remain." },
        { title: "When to use it", focus: "conclusion", body: "- A sum of independent bounded variables.\n- You need a tail exponentially small in the mean.\n- With dependence, move to martingales or Janson.",
          key: "Independent sums have exponentially small tails: Pr[X ≥ (1+δ)μ] ≤ (e^δ/(1+δ)^(1+δ))^μ.",
          narration: "Use Chernoff for sums of independent bounded variables. Its tail falls exponentially in the mean." },
      ],
    };
  },
  scenes: ["problem", "random-object", "mgf", "bound", "experiment", "conclusion"],
});

/* ---------- Martingales: edge exposure ---------- */

/** @type {Record<string, string>} */
const STATISTICS = { triangles: "triangles", isolated: "isolated vertices", edges: "edges" };
/** @param {number} n */
function edgeList(n) { /** @type {Edge[]} */ const e = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) e.push([i, j]); return e; }
/* Lipschitz constant of the statistic under changing one edge. */
/** @param {string} stat @param {number} n */
function lipschitz(stat, n) { return stat === "triangles" ? n - 2 : stat === "isolated" ? 2 : 1; }
/* E[statistic | the first `known` edges in lexicographic order are revealed as x[0..known−1]]. Exact. */
/** @param {string} stat @param {number} n @param {number} p @param {ArrayLike<number>} x @param {number} known */
function conditionalExpectation(stat, n, p, x, known) {
  const E = edgeList(n), idx = (/** @type {number} */ a, /** @type {number} */ b) => { const i = Math.min(a, b), j = Math.max(a, b); return i * n - (i * (i + 1)) / 2 + (j - i - 1); };
  const val = (/** @type {number} */ a, /** @type {number} */ b) => { const e = idx(a, b); return e < known ? x[e] : p; };
  if (stat === "edges") { let s = 0; for (let e = 0; e < known; e++) s += x[e]; return s + (E.length - known) * p; }
  if (stat === "isolated") {
    let s = 0;
    for (let v = 0; v < n; v++) { let pr = 1; for (let u = 0; u < n && pr > 0; u++) if (u !== v) { const e = idx(u, v); pr *= e < known ? 1 - x[e] : 1 - p; } s += pr; }
    return s;
  }
  let s = 0;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { const ab = val(a, b); if (!ab) continue; for (let c = b + 1; c < n; c++) s += ab * val(a, c) * val(b, c); }
  return s;
}
/** @param {string} stat @param {number} n @param {number} p @param {ArrayLike<number>} x */
function doobPath(stat, n, p, x) { const m = (n * (n - 1)) / 2, out = [];
 for (let i = 0; i <= m; i++) out.push(conditionalExpectation(stat, n, p, x, i)); return out; }

defineModule({
  id: "martingale", route: "martingale/exposure", title: "Martingales and bounded differences", short: "Martingales",
  family: "concentration", archetype: "Graph-statistic concentration by edge exposure",
  intuition: "Reveal the random graph one edge at a time; our running prediction of the statistic can only move a little each step.",
  problem: "Show a graph statistic of G(n,p) — triangles, isolated vertices or edges — is concentrated near its mean.",
  randomObject: "G(n,p), with its C(n,2) edges revealed in a fixed order.",
  variable: "Z_i = E[X | first i edges] — the Doob martingale from Z_0 = E[X] to Z_m = X.",
  variableTex: "Z_i=\\mathbb E[X\\mid\\mathcal F_i],\\qquad |Z_i-Z_{i-1}|\\le c",
  why: "If changing one edge moves X by at most c, each step of Z moves by at most c, and Azuma gives Pr[|X − EX| ≥ t] ≤ 2e^(−t²/(2mc²)).",
  need: "X is not a sum of independent pieces (triangles share edges), so Chernoff does not apply directly; bounded differences need only the Lipschitz property.",
  boundTex: "\\Pr\\big[|X-\\mathbb EX|\\ge t\\big]\\le 2\\exp\\!\\Big(-\\frac{t^2}{2\\sum_i c_i^2}\\Big)",
  pattern: { controls: "bounded information increments", conclusion: "concentration of a Lipschitz statistic", worksWhen: "one coordinate moves X by at most c", visual: "prediction path in a corridor" },
  params: [
    { key: "stat", label: "statistic X", options: Object.entries(STATISTICS), def: "edges" },
    { key: "n", label: "n (vertices)", min: 5, max: 14, step: 1, def: 12 },
    { key: "p", label: "p (edge probability)", min: 0.05, max: 0.95, step: 0.05, def: 0.5 },
    { key: "t", label: "t (deviation)", min: 1, max: 150, step: 1, def: 16 },
    { key: "claim", label: "Lipschitz constant used", options: [["true", "the true constant c"], ["one", "claim c = 1"]], def: "true" },
  ],
  analyse(P) {
    const n = P.n, m = (n * (n - 1)) / 2, cTrue = lipschitz(P.stat, n), c = P.claim === "one" ? 1 : cTrue;
    const mean = conditionalExpectation(P.stat, n, P.p, [], 0), azuma = Math.min(1, 2 * Math.exp(-(P.t * P.t) / (2 * m * c * c)));
    const tNeeded = Math.sqrt(2 * m * c * c * Math.log(2 / 0.05));
    return {
      m, c, cTrue, mean, azuma, tNeeded, ok: P.claim !== "one" || cTrue <= 1, vacuous: azuma >= 1,
      rows: [["steps m = C(n,2)", fmt(m), `m=${m}`], ["E[X] = Z₀", fmt(mean), `Z_0=${tex(mean)}`], ["Lipschitz constant c", fmt(c), `c=${c}`], ["Azuma 2e^(−t²/(2mc²))", fmt(azuma), tex(azuma)], ["t for a 5% bound", fmt(tNeeded), tex(tNeeded)]],
    };
  },
  sample(P, r) {
    const n = P.n, E = edgeList(n), x = E.map(() => (r() < P.p ? 1 : 0)), path = doobPath(P.stat, n, P.p, x);
    let maxStep = 0; for (let i = 1; i < path.length; i++) maxStep = Math.max(maxStep, Math.abs(path[i] - path[i - 1]));
    return { x, path, X: path[path.length - 1], maxStep, G: graphFromEdges(n, E.filter((_, i) => x[i])) };
  },
  stat(I) { return I.X; },
  /* Trials only need X, not the whole path. */
  fastStat(P, r) { const n = P.n, E = edgeList(n), x = E.map(() => (r() < P.p ? 1 : 0)); return conditionalExpectation(P.stat, n, P.p, x, E.length); },
  trialCap: (P) => Math.max(500, Math.min(10000, Math.floor(3e7 / P.n ** 3))),
  experiment: { label: "X at the end of the exposure", theory: (A) => ({ mean: A.mean, event: "|X − E X| ≥ t", eventTest: (x, A2, P2) => Math.abs(x - A2.mean) >= P2.t - 1e-9, bound: A.azuma, boundKind: "at most", boundLabel: "Azuma 2e^(−t²/(2mc²))" }) },
  assumptions(P, A) {
    return [
      { id: "martingale", label: "Z_i = E[X | first i edges] is a martingale (edges independent)", ok: true },
      { id: "lipschitz", label: `Changing one edge changes X by at most c (true c = ${A.cTrue} for ${STATISTICS[P.stat]})`, ok: A.ok, broken: `Claimed c = 1, but one edge can move the number of ${STATISTICS[P.stat]} by up to ${A.cTrue}. The increments can leave the corridor, so Azuma is not justified.` },
      { id: "non-vacuous", label: "The bound is below 1 at this t", ok: !A.vacuous, broken: `At t = ${P.t} the bound is ≥ 1 (vacuous). Bounded differences with worst-case c is crude at small n; you need t ≈ ${fmt(A.tNeeded)} for a 5% bound. Talagrand and Kim–Vu use typical rather than worst-case sensitivity.` },
    ];
  },
  breakIt: { label: "Claim a smaller Lipschitz constant", apply: (P) => ({ ...P, claim: "one", stat: P.stat === "edges" ? "triangles" : P.stat }) },
  compare: ["chernoff", "second-moment", "discrepancy"],
  whyNot(P, A) {
    return [
      { title: "Why not Chernoff?", text: `X = number of ${STATISTICS[P.stat]} is not a sum of independent terms${P.stat === "edges" ? " — except for edges, where Azuma reproduces Hoeffding" : ": its pieces share edges"}. Bounded differences need only that one edge moves X by at most c = ${A.cTrue}.` },
      { title: "What is the martingale?", text: "Not the graph statistic itself: it is our changing prediction of its final value as information is revealed, starting at E[X] and ending at X." },
    ];
  },
  proof(P, A) {
    return [
      { text: `Reveal the m = ${A.m} potential edges of G(${P.n}, ${fmt(P.p)}) one at a time.`, focus: "random-object" },
      { text: `Let Z_i = E[X | first i edges]; Z_0 = E[X] = ${fmt(A.mean)} and Z_m = X.`, focus: "variable" },
      { text: "Z is a martingale: on average, the next revelation does not change the prediction.", focus: "variable" },
      { text: `Changing one edge moves X by at most c = ${A.c}, so |Z_i − Z_(i−1)| ≤ c.`, focus: "corridor" },
      { text: `Azuma: Pr[|X − E X| ≥ ${P.t}] ≤ 2e^(−t²/(2mc²)) = ${fmt(A.azuma)}.`, focus: "bound" },
      { text: A.vacuous ? "At this size the bound is vacuous: a 5% bound needs t ≈ " + fmt(A.tNeeded) + "." : `So X lies within ${P.t} of ${fmt(A.mean)} with probability at least ${fmt(1 - A.azuma)}.`, focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    return {
      title: `Martingales: the number of ${STATISTICS[P.stat]} in G(${P.n}, ${fmt(P.p)})`,
      subtitle: "A prediction revealed one edge at a time",
      narration: `This deck shows the Doob martingale for the number of ${STATISTICS[P.stat]}, and what bounded differences prove about it.`,
      setup: [
        { title: "Problem: is the statistic concentrated?", focus: "problem", body: reveal(`$X$ = number of ${STATISTICS[P.stat]} in $G(${P.n},${tex(P.p)})$, $\\mathbb E X=${tex(A.mean)}$.`, `How likely is $|X-\\mathbb EX|\\ge ${P.t}$?`),
          narration: `X counts ${STATISTICS[P.stat]} and has mean ${spokenNumber(A.mean)}. How likely is it to miss the mean by ${P.t} or more?` },
        { title: "Random object: edges revealed in order", focus: "random-object", body: reveal(`The ${A.m} potential edges are revealed one at a time.`, `Seed ${P.seed}: final $X=${fmt(I.X)}$.`),
          narration: `Reveal the ${A.m} possible edges one by one. With seed ${P.seed} the final value is ${spokenNumber(I.X)}.` },
      ],
      method: [
        { title: "Key random variable: the Doob martingale", focus: "variable", body: reveal("$$Z_i=\\mathbb E[X\\mid\\text{first } i \\text{ edges}]$$", `$Z_0=${tex(A.mean)}$, $Z_{${A.m}}=X$.`),
          narration: "Z i is our best prediction of X after seeing i edges. It starts at the mean and ends at the true value." },
        { title: "Technique: bounded differences", focus: "corridor", body: reveal(`One edge moves $X$ by at most $c=${A.c}$.`, "$$|Z_i-Z_{i-1}|\\le c$$", `This sample's largest step: $${tex(I.maxStep)}$.`),
          narration: `One edge can change X by at most ${A.c}, so each step of the prediction stays in a corridor of that width. This sample's largest step was ${spokenNumber(I.maxStep)}.` },
      ],
      results: [
        { title: `Azuma: ${A.vacuous ? "vacuous at this t" : fmt(A.azuma)}`, focus: "bound", body: reveal(`$$\\Pr[|X-\\mathbb EX|\\ge ${P.t}]\\le 2e^{-t^2/(2mc^2)}=${tex(A.azuma)}$$`, `A 5% bound needs $t\\approx ${tex(A.tNeeded)}$.`),
          narration: A.vacuous ? `At this deviation the bound is at least one, so it says nothing. A five in a hundred bound would need a deviation of about ${spokenNumber(A.tNeeded)}.` : `The bound is ${spokenNumber(A.azuma)}.` },
        { title: "Experiment: the statistic does concentrate", focus: "experiment", body: reveal(`Seed ${P.seed}: $X=${tex(I.X)}$.`, "The histogram over many graphs is often far tighter than the bound: an experiment, not a proof."),
          narration: "Across many graphs the statistic is often far more concentrated than the bound says. That is an observation, not a proof." },
      ],
      checks: [
        { title: A.ok ? "Conclusion: what bounded differences prove" : "Conclusion: Azuma is not justified", focus: "conclusion", body: A.ok ? `$$|X-${tex(A.mean)}|<${P.t}\\ \\text{with probability}\\ \\ge ${tex(Math.max(0, 1 - A.azuma))}$$` : "The claimed constant is smaller than the true one, so the corridor is wrong and the inequality does not apply.",
          narration: A.ok ? `X stays within ${P.t} of its mean with probability at least ${spokenNumber(Math.max(0, 1 - A.azuma))}.` : "The claimed Lipschitz constant is wrong, so Azuma's inequality does not apply." },
        { title: "When to use it", focus: "conclusion", body: "- A function of many independent choices.\n- Each choice moves it by a bounded amount.\n- For sharper tails with typical sensitivity, use Talagrand or Kim–Vu.",
          key: "A Lipschitz function of independent choices is concentrated: reveal the choices and bound each step of the prediction.",
          narration: "Use bounded differences when each independent choice can only move the statistic a little." },
      ],
    };
  },
  scenes: ["problem", "random-object", "variable", "corridor", "bound", "experiment", "conclusion"],
});

const DEPENDENCE_API = { bandHypergraph, moserTardos, lllAnalysis, chernoffAnalysis, conditionalExpectation, doobPath, lipschitz, edgeList, STATISTICS };
Object.assign(PM, DEPENDENCE_API);
