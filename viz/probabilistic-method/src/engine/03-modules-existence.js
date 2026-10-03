/* Part 3: the existence modules — first moment, linearity, alterations, second moment.
 *
 * A module is plain data plus pure functions:
 *   params            the controls (key, label, min, max, step, def; or options for a choice)
 *   fixed(P, seed)    any structure the randomness acts on (a given graph); null when there is none
 *   analyse(P, F)     the proof quantities, every theorem's verdict and its bound
 *   sample(P, r, F)   one random outcome, drawn from the seeded stream r
 *   stat(I, P, F)     the experiment's observable for one outcome
 *   assumptions(P, A) the hypotheses, each holding or broken, with the reason
 *   proof(P, A)       the proof skeleton, each line naming the visual element it lights (focus)
 *   story(P, A, I)    the deck frames: problem, random object, variable, technique, bound, experiment, conclusion, use
 * Text is written for this atlas; the numbers come from analyse, so the lab, proof, deck and export agree.
 */
/**
 * A lab's parameters by key: the seed, numbers, or the option string of a choice control. Each lab reads its own
 * keys, so the values are typed where they are used.
 * @typedef {{ seed: number, [key: string]: any }} Params
 */
/**
 * One control: a number range, or a choice from options; hidden ones carry encoded state such as a set of indices.
 * @typedef {{ key: string, label: string, def: any, min?: number, max?: number, step?: number, options?: [any, string][], hidden?: boolean }} ParamSpec
 */
/** @typedef {{ id: string, label: string, ok: boolean, broken?: string }} Assumption a hypothesis of the theorem, holding or broken */
/** @typedef {{ title: string, focus: string, body: string, narration: string, notes?: string, key?: string }} StoryFrame */
/** @typedef {{ title: string, subtitle: string, narration: string, setup: StoryFrame[], method: StoryFrame[], results: StoryFrame[], checks: StoryFrame[] }} Story */
/**
 * What theory predicts for a lab's experiment: the mean, the event counted and the bound on its frequency.
 * @typedef {{ mean?: number | null, meanLabel?: string, pmf?: number[] | null, event: string, eventTest: (x: number, A: any, P: Params) => boolean,
 bound?: number | null, boundKind?: string, boundLabel?: string, lower?: number, lowerLabel?: string }} Theory
 */
/**
 * A lab: plain data plus pure functions (see above), typed by its analysis A, its sampled outcome I, its fixed structure F
 * and the outcome V the page shows (a lab with view() shows a deterministic picture rather than a sample).
 * @template A, I, F
 * @template [V=I]
 * @typedef {{
 *   id: string, route: string, title: string, short: string, family: string, archetype: string, intuition: string, problem: string,
 *   randomObject: string, variable: string, variableTex: string, why: string, need: string, boundTex: string,
 *   pattern: { controls: string, conclusion: string, worksWhen: string, visual: string },
 *   params: ParamSpec[],
 *   coerce?: (P: Params) => Params,
 *   fixed?: (P: Params, seed: number) => F,
 *   analyse: (P: Params, F: F) => A,
 *   sample: (P: Params, r: Rng, F: F) => I,
 *   view?: (P: Params, F: F) => V,
 *   stat: (I: I, P: Params, F: F) => number,
 *   fastStat?: (P: Params, r: Rng, F: F) => number,
 *   trialCap: (P: Params) => number,
 *   sweep?: (P: Params) => unknown,
 *   experiment: { label: string, theory: (A: A, P: Params) => Theory },
 *   assumptions: (P: Params, A: A) => Assumption[],
 *   breakIt: { label: string, apply: (P: Params, A: A) => Params },
 *   compare: string[],
 *   whyNot: (P: Params, A: A) => { title: string, text: string }[],
 *   proof: (P: Params, A: A) => { text: string, focus: string }[],
 *   asymptotic?: (P: Params, A: A) => { formula: string, terms: [string, number][], total: number, note: string },
 *   story: (P: Params, A: A, I: V) => Story,
 *   scenes: string[],
 * }} ModuleDef
 */
/**
 * Any lab, as the shared machinery and the page handle them: each lab's analysis, outcome and structure have their
 * own shapes, read by that lab's own functions and renderer, so they stay open here.
 * @typedef {ModuleDef<any, any, any, any>} Module
 */
/** @type {Module[]} */
const MODULES = [];
/** @template A, I, F @template [V=I] @param {ModuleDef<A, I, F, V>} m */
const defineModule = (m) => { MODULES.push(m); return m; };

/* Shared pieces of the deck frames: reveals (". . .") and the scene comment that rides along. */
const reveal = (/** @type {(string | false | null | undefined)[]} */ ...parts) => parts.filter(Boolean).join("\n\n. . .\n\n");
/** @param {string} module @param {string} scene @param {Params} P @param {string} focus */
const sceneComment = (module, scene, P, focus) =>

  `<!-- probabilistic-method scene: module=${module}; scene=${scene}; seed=${P.seed}; focus=${focus}; ` +
  Object.keys(P).filter((k) => k !== "seed").sort().map((k) => `${k}=${P[k]}`).join(", ") + " -->";

/* ---------- 1. Basic method and first moment: the Ramsey lower bound ---------- */

/** @type {Record<number, string>} */
const KNOWN_RAMSEY = { 3: "R(3,3) = 6", 4: "R(4,4) = 18", 5: "43 ≤ R(5,5) ≤ 46" };
/** @type {Record<number, string>} */
const KNOWN_RAMSEY_TEX = {
 3: "R(3,3)=6", 4: "R(4,4)=18", 5: "43\\le R(5,5)\\le 46" };

defineModule({
  id: "first-moment", route: "first-moment/ramsey", title: "Basic method and first moment", short: "First moment",
  family: "elementary", archetype: "Ramsey lower bound",
  intuition: "If the expected number of failures is below one, some outcome has no failure at all.",
  problem: "Find a red/blue colouring of the edges of K_n with no monochromatic K_k. Its existence proves R(k,k) > n.",
  randomObject: "Colour every edge of K_n red or blue by an independent fair coin.",
  variable: "X = number of k-vertex sets whose C(k,2) edges all have one colour.",
  variableTex: "X=\\sum_{|S|=k} I_S,\\qquad I_S=\\mathbf 1[S\\text{ is monochromatic}]",
  why: "X is a nonnegative integer. If E[X] < 1, X cannot be at least 1 on every outcome, so some colouring has X = 0.",
  need: "We want an object avoiding every bad set, and the bad sets are few enough on average: the cheapest possible tool.",
  boundTex: "\\mathbb E[X]=\\binom nk 2^{1-\\binom k2}<1\\;\\Longrightarrow\\;\\Pr[X=0]>0",
  pattern: { controls: "E[X]", conclusion: "an outcome with X = 0 exists", worksWhen: "total expected failure is below 1", visual: "histogram of the bad count" },
  params: [
    { key: "n", label: "n (vertices of K_n)", min: 4, max: 14, step: 1, def: 10 },
    { key: "k", label: "k (forbidden clique size)", min: 3, max: 6, step: 1, def: 5 },
  ],
  analyse(P) {
    const { n, k } = P, K = choose(k, 2), sets = choose(n, k), pBad = 2 ** (1 - K), EX = sets * pBad;
    let proofN = k - 1;
    while (choose(proofN + 1, k) * pBad < 1 && proofN < 400) proofN++;
    const ln = Math.log;
    return {
      K, sets, pBad, EX, ok: EX < 1, proofN, known: KNOWN_RAMSEY[k] || null,
      markovZero: Math.max(0, 1 - EX),
      asym: { exact: ln(EX), knLogN: k * ln(n), logKFact: -logFactorial(k), edges: -K * ln(2), two: ln(2), lowerOrder: logChoose(n, k) - (k * ln(n) - logFactorial(k)) },
      rows: [
        ["k-sets S", fmt(sets), `\\binom{${n}}{${k}}=${sets}`],
        ["Pr[A_S] = 2^(1−C(k,2))", fmt(pBad), `2^{1-${K}}=${tex(pBad)}`],
        ["E[X] = Σ Pr[A_S]", fmt(EX), `\\mathbb E[X]=${tex(EX)}`],
      ],
    };
  },
  sample(P, r) {
    const { n, k } = P, col = new Int8Array(n * n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) col[i * n + j] = col[j * n + i] = r() < 0.5 ? 1 : 0;
    const mono = [];
    for (const S of subsets(n, k)) {
      const c = col[S[0] * n + S[1]];
      let same = true;
      for (let a = 0; a < k && same; a++) for (let b = a + 1; b < k; b++) if (col[S[a] * n + S[b]] !== c) { same = false; break; }
      if (same) mono.push({ set: S, colour: c ? "red" : "blue" });
    }
    return { n, k, col, mono, X: mono.length };
  },
  stat: (I) => I.X,
  trialCap: (P) => Math.max(200, Math.min(10000, Math.floor(3e7 / (choose(P.n, P.k) * choose(P.k, 2))))),
  experiment: { label: "X = monochromatic k-sets in one colouring", theory: (A) => ({ mean: A.EX, event: "X = 0", eventTest: (x) => x === 0, bound: A.markovZero, boundKind: "at least", boundLabel: "Pr[X = 0] ≥ 1 − E[X]" }) },
  assumptions(P, A) {
    return [
      { id: "uniform", label: "Each edge is red or blue with probability 1/2, independently", ok: true },
      { id: "integer", label: "X counts bad sets, so it is a nonnegative integer", ok: true },
      { id: "below-one", label: "E[X] < 1", ok: A.ok, broken: `E[X] = ${fmt(A.EX)} ≥ 1. The argument stopped working. The desired colouring may still exist, but this proof no longer establishes it.` },
    ];
  },
  breakIt: { label: "Push n past the proof threshold", apply: (P, A) => (A.proofN < 14 ? { ...P, n: A.proofN + 1 } : { ...P, n: 14, k: 5 }) },
  compare: ["local-lemma", "alterations", "second-moment"],
  whyNot(P, A) {
    return [
      { title: "Why not the Local Lemma?", text: `Every k-set shares an edge with almost every other, so each bad event depends on ${fmt(A.sets - 1 - choose(P.n - P.k, P.k) - P.k * choose(P.n - P.k, P.k - 1))} of the other ${fmt(A.sets - 1)}. The Local Lemma still works asymptotically and gains a factor of 2 in the Ramsey bound, but the first moment is simpler and already exponential.` },
      { title: "Why not alterations?", text: "Alterations colour a larger K_n and delete one vertex from each bad set. They beat the plain first moment by a constant factor; this lab shows the cleanest version first." },
    ];
  },
  proof(P, A) {
    return [
      { text: `Let Ω be the 2^${choose(P.n, 2)} colourings of the edges of K_${P.n}, all equally likely.`, focus: "random-object" },
      { text: `For each ${P.k}-set S let I_S = 1 exactly when all ${A.K} edges inside S share a colour.`, focus: "witnesses" },
      { text: "Set X = Σ_S I_S, the number of monochromatic k-sets.", focus: "variable" },
      { text: `By linearity, E[X] = C(${P.n},${P.k}) · 2^(1−${A.K}) = ${fmt(A.EX)}.`, focus: "bound" },
      A.ok ? { text: `E[X] = ${fmt(A.EX)} < 1 and X is a nonnegative integer, so Pr[X = 0] > 0.`, focus: "transition" }
        : { text: `E[X] = ${fmt(A.EX)} ≥ 1, so this step fails: the inequality no longer forces an outcome with X = 0.`, focus: "transition" },
      A.ok ? { text: `Therefore some colouring of K_${P.n} has no monochromatic K_${P.k}, and R(${P.k},${P.k}) > ${P.n}.`, focus: "conclusion" }
        : { text: `No conclusion about K_${P.n}. The proof works up to n = ${A.proofN}.`, focus: "conclusion" },
    ];
  },
  asymptotic(P, A) {
    return {
      formula: "ln E[X] ≈ k ln n − ln k! − C(k,2) ln 2 + ln 2",
      terms: [["k ln n", A.asym.knLogN], ["− ln k!", A.asym.logKFact], ["− C(k,2) ln 2", A.asym.edges], ["+ ln 2", A.asym.two], ["correction (ln C(n,k) − k ln n + ln k!)", A.asym.lowerOrder]],
      total: A.asym.exact,
      note: "The C(k,2) ln 2 term is quadratic in k and wins: E[X] < 1 as long as n is below roughly k·2^(k/2)/(e√2), the classical first-moment Ramsey bound.",
    };
  },
  story(P, A, I) {
    const f = (/** @type {number} */ x) => tex(x);
    return {
      title: `The first moment: no monochromatic K_${P.k} in K_${P.n}`,
      subtitle: "Expected failures below one force a perfect outcome",
      narration: `This deck proves that some two colouring of the complete graph on ${P.n} vertices has no single coloured clique on ${P.k} vertices, using only an expectation.`,
      setup: [
        { title: "Problem: avoid every monochromatic clique", focus: "problem", body: reveal(`Colour the edges of $K_{${P.n}}$ red or blue.`, `Goal: no ${P.k}-vertex set whose $\\binom{${P.k}}{2}=${A.K}$ edges share one colour.`, `Such a colouring proves $R(${P.k},${P.k})>${P.n}$.`),
          narration: `We want a colouring of the complete graph on ${P.n} vertices with no clique of size ${P.k} in one colour. Finding one would prove a Ramsey lower bound.` },
        { title: "Random object: a fair coin on every edge", focus: "random-object", body: reveal(`Each of the $\\binom{${P.n}}{2}=${choose(P.n, 2)}$ edges is red or blue with probability $\\tfrac12$, independently.`, `With seed ${P.seed} this colouring has ${I.X} monochromatic ${P.k}-sets.`),
          narration: `Instead of searching, we toss a fair coin for each of the ${choose(P.n, 2)} edges. The sampled colouring with seed ${P.seed} has ${I.X} single coloured sets of size ${P.k}.` },
      ],
      method: [
        { title: "Key random variable: count the bad sets", focus: "variable", body: reveal("For each $k$-set $S$ let $I_S=1$ when $S$ is monochromatic.", "$$X=\\sum_{|S|=k} I_S$$", `$$\\Pr[I_S=1]=2\\cdot 2^{-${A.K}}=2^{1-${A.K}}$$`),
          narration: "Attach an indicator to every set of the given size. It equals one when the set is single coloured. Their sum X counts the bad sets." },
        { title: "Technique: the first moment", focus: "transition", body: reveal("$X$ is a nonnegative integer.", "If $\\mathbb E[X]<1$ then $X\\ge1$ cannot hold on every outcome.", "So some outcome has $X=0$."),
          narration: "The method needs one fact. A nonnegative integer variable with average below one must be zero somewhere." },
      ],
      results: [
        { title: `The bound: E[X] = ${fmt(A.EX)}`, focus: "bound", body: reveal(`$$\\mathbb E[X]=\\binom{${P.n}}{${P.k}}\\,2^{1-${A.K}}=${A.sets}\\cdot ${f(A.pBad)}=${f(A.EX)}$$`, A.ok ? `$${f(A.EX)}<1$: the inequality holds.` : `$${f(A.EX)}\\ge1$: the inequality fails.`),
          narration: `By linearity the expected number of bad sets is ${spokenNumber(A.EX)}. ${A.ok ? "That is below one." : "That is not below one, so the proof stops here."}` },
        { title: "Experiment: what this sample shows", focus: "experiment", body: reveal(`Seed ${P.seed}: $X=${I.X}$.`, "A simulation illustrates the distribution of $X$; it proves nothing. The proof is the inequality on the previous slide."),
          notes: "In the lab, Run 1,000 draws the histogram of X with E[X] marked.",
          narration: `This sample has ${I.X} bad sets. Simulations only illustrate. The existence claim rests on the inequality alone.` },
      ],
      checks: [
        { title: A.ok ? "Conclusion: a good colouring exists" : "Conclusion: the proof is silent", focus: "conclusion", body: A.ok ? reveal("$$\\mathbb E[X]<1\\;\\Longrightarrow\\;\\exists\\,\\omega:\\;X(\\omega)=0$$", `So $R(${P.k},${P.k})>${P.n}$. The proof works up to $n=${A.proofN}$${A.known ? `; the truth is $${KNOWN_RAMSEY_TEX[P.k]}$` : ""}.`) : reveal("The argument stopped working.", "The desired colouring may still exist; this proof no longer establishes it.", `It works up to $n=${A.proofN}$.`),
          narration: A.ok ? `Since the expectation is below one, some colouring has no bad set at all. So the Ramsey number exceeds ${P.n}.` : `The expectation is at least one, so this proof says nothing about ${P.n} vertices. It works up to ${A.proofN} vertices.` },
        { title: "When to use it", focus: "conclusion", body: "- You need one object avoiding a family of bad events.\n- The expected number of bad events can be pushed below one.\n- Next: when it cannot, try the Local Lemma or alterations.",
          key: "Expected failures below one force an outcome with no failure.",
          narration: "Use the first moment when the expected number of failures can be made smaller than one. When it cannot, the Local Lemma and alterations take over." },
      ],
    };
  },
  scenes: ["problem", "random-object", "witnesses", "variable", "bound", "experiment", "transition", "conclusion"],
});

/* ---------- 2. Linearity of expectation: Szele's tournaments ---------- */

/* Number of directed Hamiltonian paths in a tournament, by dynamic programming over vertex subsets. */
/** @param {number} n @param {ArrayLike<number>} beats beats[v * n + w] is 1 when v beats w */
function hamiltonianPaths(n, beats) {
  const full = (1 << n) - 1, dp = new Float64Array((1 << n) * n);
  for (let v = 0; v < n; v++) dp[(1 << v) * n + v] = 1;
  for (let mask = 1; mask <= full; mask++) for (let v = 0; v < n; v++) {
    const c = dp[mask * n + v];
    if (!c) continue;
    for (let w = 0; w < n; w++) if (!(mask & (1 << w)) && beats[v * n + w]) dp[(mask | (1 << w)) * n + w] += c;
  }
  let total = 0;
  for (let v = 0; v < n; v++) total += dp[full * n + v];
  return total;
}
/* Probability that every ordering in a list is a directed Hamiltonian path of a uniformly random tournament. */
/** @param {number[][]} orders */
function jointPathProbability(orders) {
  /** @type {Map<string, number>} */
  const need = new Map();
  for (const o of orders) for (let i = 0; i + 1 < o.length; i++) {
    const a = o[i], b = o[i + 1], key = Math.min(a, b) + "-" + Math.max(a, b), dir = a < b ? 1 : 0;
    if (need.has(key) && need.get(key) !== dir) return 0;
    need.set(key, dir);
  }
  return 2 ** -need.size;
}

defineModule({
  id: "linearity", route: "linearity/tournament", title: "Linearity of expectation", short: "Linearity",
  family: "elementary", archetype: "Szele's tournaments",
  intuition: "The expectation of a sum is the sum of expectations, however tangled the summands are.",
  problem: "Show some tournament on n players has at least n!/2^(n−1) directed Hamiltonian paths.",
  randomObject: "Orient every pair of players by an independent fair coin: a uniformly random tournament.",
  variable: "X = number of orderings v₁ → v₂ → … → vₙ in which every consecutive pair is oriented forwards.",
  variableTex: "X=\\sum_{\\pi\\in S_n} I_\\pi",
  why: "E[X] = Σ_π Pr[I_π = 1] = n!·2^−(n−1). A variable cannot lie below its mean on every outcome, so some tournament has X ≥ E[X].",
  need: "Counting paths directly needs all n! orderings and their dependence; linearity needs only one ordering's probability.",
  boundTex: "\\mathbb E[X]=\\frac{n!}{2^{n-1}}\\;\\Longrightarrow\\;\\exists\\,T:\\;X(T)\\ge \\frac{n!}{2^{n-1}}",
  pattern: { controls: "E[X] = Σ E[I]", conclusion: "an outcome at or above the mean exists", worksWhen: "the target is an average, dependence or not", visual: "one ordering's indicator, summed" },
  params: [
    { key: "n", label: "n (players)", min: 3, max: 10, step: 1, def: 7 },
    { key: "model", label: "tournament", options: [["random", "uniformly random"], ["transitive", "transitive (one fixed tournament)"]], def: "random" },
  ],
  analyse(P) {
    const n = P.n, orders = factorial(n), pOne = 2 ** -(n - 1), EX = orders * pOne;
    const id = Array.from({ length: n }, (_, i) => i), rot = [n - 1, ...id.slice(0, n - 1)], rev = id.slice().reverse();
    const pair = (/** @type {number[]} */ o) => { const j = jointPathProbability([id, o]); return { order: o, joint: j, product: pOne * pOne }; };
    return {
      orders, pOne, EX, ok: true, dependent: [pair(rot), pair(rev)],
      rows: [["orderings π", fmt(orders), `${n}!=${orders}`], ["Pr[I_π = 1]", fmt(pOne), `2^{-${n - 1}}`], ["E[X] = Σ Pr[I_π = 1]", fmt(EX), `\\mathbb E[X]=${tex(EX)}`]],
    };
  },
  sample(P, r) {
    const n = P.n, beats = new Uint8Array(n * n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const fwd = P.model === "transitive" ? 1 : r() < 0.5 ? 1 : 0;
      beats[i * n + j] = fwd; beats[j * n + i] = 1 - fwd;
    }
    const X = hamiltonianPaths(n, beats);
    /* One witness path, found greedily from the DP-free insertion argument (Rédei): insert players one at a time. */
    const path = [0];
    for (let v = 1; v < n; v++) {
      let at = path.findIndex((u) => beats[v * n + u]);
      if (at < 0) at = path.length;
      path.splice(at, 0, v);
    }
    return { n, beats, X, path };
  },
  stat: (I) => I.X,
  trialCap: (P) => Math.max(200, Math.min(10000, Math.floor(4e7 / ((1 << P.n) * P.n * P.n)))),
  experiment: { label: "X = Hamiltonian paths in one tournament", theory: (A) => ({ mean: A.EX, event: "X ≥ E[X]", eventTest: (x, A2) => x >= A2.EX - 1e-9, bound: null, boundLabel: "Pr[X ≥ E[X]] > 0" }) },
  assumptions(P, A) {
    return [
      { id: "finite-mean", label: "Each I_π has a finite expectation (it is 0 or 1)", ok: true },
      { id: "no-independence", label: "Independence of the I_π is NOT needed — and they are strongly dependent", ok: true },
      { id: "random-model", label: "The tournament is uniformly random", ok: P.model === "random", broken: "A fixed transitive tournament has exactly one Hamiltonian path. Averaging promises that SOME tournament reaches the mean, never that every one does." },
    ];
  },
  breakIt: { label: "Look at the transitive tournament", apply: (P) => ({ ...P, model: "transitive" }) },
  compare: ["first-moment", "second-moment", "alterations"],
  whyNot(P, A) {
    return [
      { title: "Why not count the paths directly?", text: `There are ${fmt(A.orders)} orderings and the events overlap heavily: the identity and its rotation share ${P.n - 2} arcs, so Pr[both] = ${fmt(A.dependent[0].joint)} while the product is ${fmt(A.dependent[0].product)}. Linearity ignores all of that.` },
      { title: "Why not the first moment?", text: "We want many paths, not zero bad events: the averaging step uses the mean as a floor, not a ceiling." },
    ];
  },
  proof(P, A) {
    return [
      { text: `Orient each of the C(${P.n},2) pairs by an independent fair coin.`, focus: "random-object" },
      { text: "For each ordering π of the players let I_π = 1 when every consecutive pair is oriented forwards.", focus: "witnesses" },
      { text: `Pr[I_π = 1] = 2^−${P.n - 1}, since π uses ${P.n - 1} distinct pairs.`, focus: "variable" },
      { text: `By linearity, E[X] = ${P.n}! · 2^−${P.n - 1} = ${fmt(A.EX)}, with no independence assumed.`, focus: "bound" },
      { text: "A random variable cannot be below its mean on every outcome, so Pr[X ≥ E[X]] > 0.", focus: "transition" },
      { text: `Therefore some tournament on ${P.n} players has at least ${fmt(Math.ceil(A.EX - 1e-9))} Hamiltonian paths.`, focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    const d = A.dependent[0];
    return {
      title: `Linearity of expectation: Hamiltonian paths in tournaments on ${P.n} players`,
      subtitle: "Expectation adds up even when the events are entangled",
      narration: `This deck shows that some tournament on ${P.n} players has at least ${spokenNumber(A.EX)} Hamiltonian paths, using only linearity of expectation.`,
      setup: [
        { title: "Problem: many Hamiltonian paths", focus: "problem", body: reveal(`A tournament orients every pair of ${P.n} players.`, "A Hamiltonian path visits every player along arcs pointing forwards.", "How many such paths can one tournament have?"),
          narration: "A tournament points an arrow between every pair of players. We want a tournament with many directed paths that visit every player once." },
        { title: "Random object: a fair coin per pair", focus: "random-object", body: reveal(`Orient each of the $\\binom{${P.n}}{2}=${choose(P.n, 2)}$ pairs by a fair coin.`, `With seed ${P.seed} the tournament has $X=${I.X}$ Hamiltonian paths.`),
          narration: `Toss a coin for each pair to choose its direction. With seed ${P.seed} the sampled tournament has ${I.X} Hamiltonian paths.` },
      ],
      method: [
        { title: "Key random variable: one indicator per ordering", focus: "variable", body: reveal("For each ordering $\\pi$ let $I_\\pi=1$ when all its consecutive arcs point forwards.", "$$X=\\sum_{\\pi} I_\\pi,\\qquad \\Pr[I_\\pi=1]=2^{-(n-1)}$$"),
          narration: `Give every ordering of the players an indicator. It is one when all ${P.n - 1} consecutive arrows agree with the ordering, which happens with probability one over two to the ${P.n - 1}.` },
        { title: "Technique: linearity needs no independence", focus: "witnesses", body: reveal("$$\\mathbb E\\Big[\\sum_\\pi I_\\pi\\Big]=\\sum_\\pi \\mathbb E[I_\\pi]$$", `The indicators are dependent: the identity and its rotation share ${P.n - 2} arcs, so $\\Pr[\\text{both}]=${tex(d.joint)}\\ne${tex(d.product)}$.`, "Linearity holds anyway."),
          narration: "The indicators are far from independent. Two orderings sharing most of their arrows tend to succeed together. Linearity of expectation does not care." },
      ],
      results: [
        { title: `The bound: E[X] = ${fmt(A.EX)}`, focus: "bound", body: `$$\\mathbb E[X]=\\frac{${P.n}!}{2^{${P.n - 1}}}=\\frac{${A.orders}}{${2 ** (P.n - 1)}}=${tex(A.EX)}$$`,
          narration: `Adding the expectations gives ${spokenNumber(A.EX)} expected Hamiltonian paths.` },
        { title: "Experiment: tournaments vary", focus: "experiment", body: reveal(`Seed ${P.seed}: $X=${I.X}$.`, "Repeated samples spread around the mean; the histogram illustrates, the averaging argument proves."),
          narration: `This tournament has ${I.X} paths. A histogram of many samples centres on the mean, but only the averaging argument is a proof.` },
      ],
      checks: [
        { title: "Conclusion: an above-average tournament exists", focus: "conclusion", body: reveal("$$\\Pr\\big[X\\ge \\mathbb E[X]\\big]>0$$", `Some tournament on ${P.n} players has at least $${Math.ceil(A.EX - 1e-9)}$ Hamiltonian paths.`),
          narration: `A variable cannot sit below its own average everywhere. So some tournament has at least ${Math.ceil(A.EX - 1e-9)} Hamiltonian paths.` },
        { title: "When to use it", focus: "conclusion", body: "- The quantity is a sum of simple indicators.\n- Each indicator's probability is easy, even if their joint law is not.\n- Averaging then gives an outcome at least as good as the mean.",
          key: "Linearity of expectation never needs independence.",
          narration: "Use linearity whenever a count splits into indicators. The joint behaviour can be as tangled as it likes." },
      ],
    };
  },
  scenes: ["problem", "random-object", "witnesses", "variable", "bound", "experiment", "transition", "conclusion"],
});

/* ---------- 3. Alterations: an independent set by sampling and deleting ---------- */

defineModule({
  id: "alterations", route: "alterations/independent-set", title: "Alterations", short: "Alterations",
  family: "alteration", archetype: "Independent set by sampling and deleting",
  intuition: "Build something slightly wrong at random, then repair it; the repair costs less than it gains.",
  problem: "Show every graph with n vertices and average degree d̄ has an independent set of size at least n/(2d̄).",
  randomObject: "Keep each vertex of the given graph independently with probability q.",
  variable: "X = kept vertices, Y = edges with both ends kept; deleting one end of each such edge leaves at least X − Y vertices.",
  variableTex: "|S_{\\rm final}|\\ge X-Y,\\qquad \\mathbb E[X-Y]=nq-mq^2",
  why: "Some outcome has X − Y ≥ E[X − Y]; repairing it leaves an independent set at least that large.",
  need: "A random set is almost never independent outright; allowing a repair step turns a tiny probability into a guaranteed average.",
  boundTex: "\\alpha(G)\\ge \\max_q\\,(nq-mq^2)=\\frac{n^2}{4m}=\\frac{n}{2\\bar d}",
  pattern: { controls: "E[reward − defects]", conclusion: "a repaired object of that size exists", worksWhen: "defects are rare and cheap to fix", visual: "randomise, then repair" },
  params: [
    { key: "n", label: "n (vertices)", min: 12, max: 80, step: 1, def: 40 },
    { key: "d", label: "target average degree", min: 2, max: 12, step: 1, def: 6 },
    { key: "q", label: "q (keep probability)", min: 0.02, max: 1, step: 0.01, def: 0.15 },
    { key: "repair", label: "repair step", options: [["on", "delete one end of each conflict"], ["off", "skip the repair"]], def: "on" },
  ],
  fixed(P, seed) { return gnp(P.n, Math.min(1, P.d / (P.n - 1)), rng(seed, "alterations-graph")); },
  analyse(P, G) {
    const n = P.n, m = G.edges.length, q = P.q, EX = n * q, EY = m * q * q, EXY = EX - EY;
    const qStar = m > 0 ? Math.min(1, n / (2 * m)) : 1, best = n * qStar - m * qStar * qStar;
    const deg = degrees(G), dbar = (2 * m) / n, caroWei = deg.reduce((s, x) => s + 1 / (x + 1), 0);
    return {
      m, q, EX, EY, EXY, qStar, best, dbar, caroWei, guarantee: Math.max(0, Math.ceil(EXY - 1e-9)), ok: EXY > 0 && P.repair === "on",
      rows: [["edges m", fmt(m), `m=${m}`], ["E[X] = nq", fmt(EX), `nq=${tex(EX)}`], ["E[Y] = mq²", fmt(EY), `mq^2=${tex(EY)}`], ["E[X − Y]", fmt(EXY), `\\mathbb E[X-Y]=${tex(EXY)}`], ["best q* = n/(2m)", fmt(qStar), `q^*=${tex(qStar)}`]],
    };
  },
  sample(P, r, G) {
    const n = P.n, sel = new Uint8Array(n);
    for (let v = 0; v < n; v++) sel[v] = r() < P.q ? 1 : 0;
    const conflicts = G.edges.filter(([a, b]) => sel[a] && sel[b]);
    const alive = sel.slice(), deleted = [];
    if (P.repair === "on") for (const [a, b] of conflicts) if (alive[a] && alive[b]) { alive[b] = 0; deleted.push(b); }
    const X = sel.reduce((s, x) => s + x, 0), Y = conflicts.length, survivors = alive.reduce((s, x) => s + x, 0);
    const remaining = G.edges.filter(([a, b]) => alive[a] && alive[b]).length;
    return { sel, alive, conflicts, deleted, X, Y, survivors, guaranteed: X - Y, independent: remaining === 0, remaining };
  },
  stat: (I) => I.guaranteed,
  trialCap: () => 10000,
  experiment: { label: "X − Y in one sample", theory: (A) => ({ mean: A.EXY, event: "X − Y ≥ E[X − Y]", eventTest: (x, A2) => x >= A2.EXY - 1e-9, bound: null, boundLabel: "Pr[X − Y ≥ E[X − Y]] > 0" }) },
  assumptions(P, A) {
    return [
      { id: "independent-keeps", label: "Vertices are kept independently with the same probability q", ok: true },
      { id: "repair", label: "The repair deletes one end of every conflict edge", ok: P.repair === "on", broken: "Without the repair the kept set still contains edges, so it is not an independent set and X − Y bounds nothing." },
      { id: "positive", label: "E[X − Y] > 0", ok: A.EXY > 0, broken: `With q = ${fmt(P.q)} the expected conflicts outweigh the kept vertices: E[X − Y] = ${fmt(A.EXY)}. Lower q towards q* = ${fmt(A.qStar)}.` },
    ];
  },
  breakIt: { label: "Skip the repair", apply: (P) => ({ ...P, repair: "off" }) },
  compare: ["first-moment", "nibble", "drc"],
  whyNot(P, A) {
    return [
      { title: "Why not sample a perfect object directly?", text: `Keeping every vertex with probability q and hoping for no edge at all: each of the ${A.m} edges must be missed. At q = ${fmt(P.q)} the expected number of conflicts is ${fmt(A.EY)}, so a conflict-free sample of useful size is rare. Repairing costs only one vertex per conflict.` },
      { title: "What does a sharper method give?", text: `A random ordering of the vertices (Caro–Wei; the random permutation method, not yet built here) gives Σ 1/(d(v)+1) = ${fmt(A.caroWei)} for this graph, against n/(2d̄) = ${fmt(A.best)}.` },
    ];
  },
  proof(P, A) {
    return [
      { text: `Keep each of the ${P.n} vertices independently with probability q = ${fmt(P.q)}.`, focus: "random-object" },
      { text: "Let X be the number kept and Y the number of edges with both ends kept.", focus: "witnesses" },
      { text: `E[X] = nq = ${fmt(A.EX)} and E[Y] = mq² = ${fmt(A.EY)}, so E[X − Y] = ${fmt(A.EXY)}.`, focus: "variable" },
      { text: "Delete one endpoint of every kept edge: the rest is independent and has at least X − Y vertices.", focus: "repair" },
      { text: `Some outcome has X − Y ≥ ${fmt(A.EXY)}, so α(G) ≥ ${A.guarantee}.`, focus: "transition" },
      { text: `Optimising, q* = n/(2m) = ${fmt(A.qStar)} gives α(G) ≥ ${fmt(A.best)} = n/(2d̄) for d̄ = ${fmt(A.dbar)}.`, focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    return {
      title: `Alterations: an independent set in a graph on ${P.n} vertices`,
      subtitle: "Randomise, then repair",
      narration: `This deck builds a large independent set by keeping random vertices and then deleting one end of every edge that survived.`,
      setup: [
        { title: "Problem: a large independent set", focus: "problem", body: reveal(`A fixed graph with $n=${P.n}$ vertices and $m=${A.m}$ edges (average degree $${tex(A.dbar)}$).`, "Find many vertices with no edge between any two of them."),
          narration: `We are given a graph with ${P.n} vertices and ${A.m} edges. We want many vertices with no edge among them.` },
        { title: "Random object: keep each vertex with probability q", focus: "random-object", body: reveal(`Keep each vertex independently with probability $q=${tex(P.q)}$.`, `Seed ${P.seed}: ${I.X} kept, ${I.Y} conflicts.`),
          narration: `Keep each vertex with probability ${spokenNumber(P.q)}. With seed ${P.seed} we kept ${I.X} vertices, and ${I.Y} edges have both ends kept.` },
      ],
      method: [
        { title: "Key random variable: reward minus defects", focus: "variable", body: reveal("$X$ = kept vertices, $Y$ = kept edges.", "$$\\mathbb E[X-Y]=nq-mq^2$$"),
          narration: "Let X count the kept vertices and Y the kept edges. The expected difference is n q minus m q squared." },
        { title: "Technique: repair after sampling", focus: "repair", body: reveal("Delete one endpoint of each kept edge.", "$$|S_{\\rm final}|\\ge X-Y$$", `Seed ${P.seed}: ${I.deleted.length} deleted, ${I.survivors} survive.`),
          narration: `Each kept edge costs at most one vertex to repair. In this sample ${I.deleted.length} vertices were deleted and ${I.survivors} survive.` },
      ],
      results: [
        { title: `The bound: E[X − Y] = ${fmt(A.EXY)}`, focus: "bound", body: reveal(`$$\\mathbb E[X-Y]=${tex(P.n * P.q)}-${tex(A.EY)}=${tex(A.EXY)}$$`, `Best $q^*=n/(2m)=${tex(A.qStar)}$ gives $${tex(A.best)}$.`),
          narration: `At this q the expected reward minus defects is ${spokenNumber(A.EXY)}. The best choice of q gives ${spokenNumber(A.best)}.` },
        { title: "Experiment: survivors in samples", focus: "experiment", body: reveal(`Seed ${P.seed}: survivors ${I.survivors}, guaranteed $X-Y=${I.guaranteed}$.`, "Samples illustrate; the expectation argument proves."),
          narration: `This sample guarantees ${I.guaranteed} and actually keeps ${I.survivors}. The proof uses only the expectation.` },
      ],
      checks: [
        { title: "Conclusion: a large independent set exists", focus: "conclusion", body: reveal("$$\\exists\\,\\omega:\\;X-Y\\ge \\mathbb E[X-Y]$$", `So $\\alpha(G)\\ge ${A.guarantee}$, and in general $\\alpha(G)\\ge n/(2\\bar d)$.`),
          narration: `Some sample does at least as well as average, and repairing it leaves an independent set of at least ${A.guarantee} vertices.` },
        { title: "When to use it", focus: "conclusion", body: "- A perfect random object is too rare.\n- Defects are few on average and each is cheap to fix.\n- Tune the sampling rate to balance reward against repair.",
          key: "An imperfect random object plus a cheap repair beats waiting for a perfect one.",
          narration: "Use alterations when perfection is rare but defects are cheap. Sample a little less, then fix what went wrong." },
      ],
    };
  },
  scenes: ["problem", "random-object", "witnesses", "variable", "repair", "bound", "experiment", "conclusion"],
});

/* ---------- 4. Second moment: cliques in G(n, p) ---------- */

const CLUSTER_PI = 0.01;
/** @param {number} n @param {number} k @param {number} p */
function secondMomentTable(n, k, p) {
  const K = choose(k, 2), rows = [];
  for (let j = 0; j <= k; j++) {
    const pairs = choose(n, k) * choose(k, j) * choose(n - k, k - j), joint = p ** (2 * K - choose(j, 2));
    rows.push({ j, pairs, joint, contribution: pairs * joint, independent: j < 2 });
  }
  return rows;
}
defineModule({
  id: "second-moment", route: "second-moment/clique", title: "Second moment method", short: "Second moment",
  family: "moments", archetype: "Clique existence in G(n,p)",
  intuition: "A large mean is not enough: the variance must be small compared with the mean squared.",
  problem: "Show G(n,p) contains a K_k with high probability once p is above the threshold where E[X] grows.",
  randomObject: "The random graph G(n,p): each pair is an edge independently with probability p.",
  variable: "X = number of k-cliques; E[X²] is assembled from pairs of k-sets sorted by their overlap j = |S ∩ T|.",
  variableTex: "X=\\sum_{|S|=k} I_S,\\qquad \\mathbb E[X^2]=\\sum_{S,T}\\Pr[I_S=I_T=1]",
  why: "Chebyshev gives Pr[X = 0] ≤ Var X/(E X)², and Paley–Zygmund gives Pr[X > 0] ≥ (E X)²/E[X²]. A ratio near 1 forces X > 0.",
  need: "The first moment can only show X = 0 is possible. To show X > 0 we must rule out the mean being carried by rare, crowded outcomes.",
  boundTex: "\\Pr[X>0]\\ge\\frac{(\\mathbb E X)^2}{\\mathbb E[X^2]},\\qquad \\Pr[X=0]\\le\\frac{\\operatorname{Var}X}{(\\mathbb E X)^2}",
  pattern: { controls: "E[X] and E[X²]", conclusion: "X > 0 is likely", worksWhen: "pairs of witnesses are nearly independent", visual: "pair-overlap table" },
  params: [
    { key: "n", label: "n (vertices)", min: 6, max: 40, step: 1, def: 12 },
    { key: "k", label: "k (clique size)", min: 3, max: 5, step: 1, def: 4 },
    { key: "p", label: "p (edge probability)", min: 0.05, max: 0.95, step: 0.01, def: 0.6 },
    { key: "cluster", label: "model", options: [["off", "G(n,p)"], ["on", "clustered: complete with probability 0.01, else empty"]], def: "off" },
  ],
  analyse(P) {
    const { n, k, p } = P, K = choose(k, 2), sets = choose(n, k);
    const table = secondMomentTable(n, k, p);
    let EX = sets * p ** K, EX2 = table.reduce((s, r) => s + r.contribution, 0), truth = null;
    if (P.cluster === "on") { EX = CLUSTER_PI * sets; EX2 = CLUSTER_PI * sets * sets; truth = CLUSTER_PI; }
    const ratio = EX2 / (EX * EX), varX = EX2 - EX * EX;
    const threshold = sets ** (-1 / K);
    return {
      K, sets, table, EX, EX2, ratio, varX, threshold, truth,
      cheb: Math.min(1, Math.max(0, ratio - 1)), pz: 1 / ratio, markov: Math.min(1, EX), ok: 1 / ratio > 0.5,
      rows: [["E[X]", fmt(EX), `\\mathbb E[X]=${tex(EX)}`], ["E[X²]", fmt(EX2), `\\mathbb E[X^2]=${tex(EX2)}`], ["E[X²]/E[X]²", fmt(ratio), `\\frac{\\mathbb E[X^2]}{(\\mathbb E X)^2}=${tex(ratio)}`],
        ["Pr[X > 0] ≥ (Paley–Zygmund)", fmt(1 / ratio), `${tex(1 / ratio)}`], ["Pr[X = 0] ≤ (Chebyshev)", fmt(Math.min(1, Math.max(0, ratio - 1))), `${tex(Math.min(1, Math.max(0, ratio - 1)))}`]],
    };
  },
  /** @this {Module} the lab itself, for its own analyse @param {Params} P */
  sweep(P) {
    const out = [];

    for (let i = 1; i < 100; i++) {
      const p = i / 100, a = this.analyse({ ...P, p, cluster: "off" }, null);
      out.push({ p, markov: a.markov, pz: a.pz });
    }
    return out;
  },
  sample(P, r) {
    const { n, k } = P;
    let G;
    if (P.cluster === "on") G = r() < CLUSTER_PI ? graphFromEdges(n, subsets(n, 2)) : graphFromEdges(n, []);
    else G = gnp(n, P.p, r);
    const X = countCliques(G, k);
    /** @type {number[][]} */
    let witnesses = [];
    if (X && choose(n, k) <= 20000) witnesses = subsets(n, k).filter((S) => S.every((a, i) => S.slice(i + 1).every((b) => G.adj[a * n + b]))).slice(0, 40);
    return { G, X, witnesses };
  },
  stat: (I) => I.X,
  trialCap: (P) => Math.max(100, Math.min(10000, Math.floor(2e7 / Math.max(1, choose(P.n, Math.min(P.k, 3)) * P.n)))),
  experiment: { label: "X = k-cliques in one G(n,p)", theory: (A) => ({ mean: A.EX, event: "X > 0", eventTest: (x) => x > 0, bound: A.pz, boundKind: "at least", boundLabel: "Pr[X > 0] ≥ (EX)²/E[X²]" }) },
  assumptions(P, A) {
    return [
      { id: "finite-second", label: "E[X²] is finite (X is bounded)", ok: true },
      { id: "independent-edges", label: "Edges are independent, so disjoint or one-vertex overlaps (j ≤ 1) are uncorrelated", ok: P.cluster === "off", broken: "In the clustered model every indicator moves together; the overlap table no longer describes E[X²]. Paley–Zygmund still holds, but now it honestly reports a tiny lower bound." },
      { id: "ratio-near-one", label: "E[X²]/(EX)² is close to 1", ok: A.ratio < 2, broken: `The ratio is ${fmt(A.ratio)}: the mean is carried by rare crowded outcomes, so the second moment gives only Pr[X > 0] ≥ ${fmt(A.pz)}.` },
    ];
  },
  breakIt: { label: "Cluster the variable", apply: (P) => ({ ...P, cluster: "on" }) },
  compare: ["first-moment", "chernoff", "janson"],
  whyNot(P, A) {
    return [
      { title: "Why not the first moment?", text: `E[X] = ${fmt(A.EX)} is ${A.EX > 1 ? "large" : "small"}. We are not trying to show X = 0 is possible; we need X > 0. A large mean could come from a few outcomes crammed with cliques, and only the second moment can rule that out.` },
      { title: "Why not Janson?", text: "Janson bounds Pr[X = 0] exponentially for monotone events; the second moment is the simpler tool when you only need Pr[X > 0] → 1." },
    ];
  },
  proof(P, A) {
    return [
      { text: `Let G ~ G(${P.n}, ${fmt(P.p)}) and X = Σ_S I_S over the ${fmt(A.sets)} sets of ${P.k} vertices.`, focus: "random-object" },
      { text: `E[X] = C(${P.n},${P.k}) p^${A.K} = ${fmt(A.EX)}.`, focus: "variable" },
      { text: "Group ordered pairs (S,T) by overlap j: when j ≤ 1 they share no edge and are independent.", focus: "overlap" },
      { text: `E[X²] = Σ_j N_j p^(2·${A.K} − C(j,2)) = ${fmt(A.EX2)}.`, focus: "overlap" },
      { text: `Paley–Zygmund: Pr[X > 0] ≥ (EX)²/E[X²] = ${fmt(A.pz)}; Chebyshev: Pr[X = 0] ≤ ${fmt(A.cheb)}.`, focus: "bound" },
      { text: A.ok ? `So G(${P.n}, ${fmt(P.p)}) contains a K_${P.k} with probability at least ${fmt(A.pz)}.` : `The ratio ${fmt(A.ratio)} is too large to conclude X > 0 is likely.`, focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    const tb = A.table.map((r) => `| ${r.j} | ${tex(r.pairs)} | ${tex(r.joint)} | ${tex(r.contribution)} |`).join("\n");
    return {
      title: `The second moment: a K_${P.k} in G(${P.n}, ${fmt(P.p)})`,
      subtitle: "When the mean is large, control the variance",
      narration: `This deck shows when the random graph on ${P.n} vertices with edge probability ${spokenNumber(P.p)} contains a clique on ${P.k} vertices, using first and second moments.`,
      setup: [
        { title: "Problem: does a clique appear?", focus: "problem", body: reveal(`Does $G(${P.n},${tex(P.p)})$ contain $K_${P.k}$?`, "A large expected count is not yet a proof: the count could be zero most of the time."),
          narration: `We ask whether the random graph contains a clique on ${P.k} vertices. A large expected count alone does not answer it.` },
        { title: "Random object: G(n,p)", focus: "random-object", body: reveal(P.cluster === "on" ? "Clustered model: complete with probability $0.01$, else empty." : `Each of the $\\binom{${P.n}}{2}$ pairs is an edge with probability $${tex(P.p)}$.`, `Seed ${P.seed}: $X=${I.X}$ cliques.`),
          narration: `Each pair becomes an edge independently. With seed ${P.seed} the sampled graph has ${I.X} cliques of size ${P.k}.` },
      ],
      method: [
        { title: "Key random variable: pairs of witnesses", focus: "overlap", body: reveal("$$\\mathbb E[X^2]=\\sum_{j=0}^{k} N_j\\,p^{2\\binom k2-\\binom j2}$$", "| overlap j | pairs | joint probability | contribution |\n| --- | --- | --- | --- |\n" + tb),
          narration: "The second moment adds up every ordered pair of candidate cliques, grouped by how many vertices they share. Pairs sharing at most one vertex share no edge and behave independently." },
        { title: "Technique: Chebyshev and Paley–Zygmund", focus: "bound", body: reveal("$$\\Pr[X=0]\\le\\frac{\\operatorname{Var}X}{(\\mathbb E X)^2}$$", "$$\\Pr[X>0]\\ge\\frac{(\\mathbb E X)^2}{\\mathbb E[X^2]}$$"),
          narration: "Chebyshev bounds the chance of no clique by the variance over the mean squared. Paley and Zygmund bound the chance of at least one clique from below by the reciprocal ratio." },
      ],
      results: [
        { title: `The ratio: E[X²]/(EX)² = ${fmt(A.ratio)}`, focus: "bound", body: reveal(`$$\\mathbb E[X]=${tex(A.EX)},\\quad \\mathbb E[X^2]=${tex(A.EX2)}$$`, `$$\\Pr[X>0]\\ge ${tex(A.pz)},\\qquad \\Pr[X=0]\\le ${tex(A.cheb)}$$`),
          narration: `The mean is ${spokenNumber(A.EX)} and the ratio of the second moment to the squared mean is ${spokenNumber(A.ratio)}. So a clique appears with probability at least ${spokenNumber(A.pz)}.` },
        { title: "Experiment: the empirical chance of a clique", focus: "experiment", body: reveal(`Seed ${P.seed}: $X=${I.X}$.`, "Run many graphs in the lab to see how often $X>0$; the bound, not the simulation, is the theorem."),
          narration: `This sample has ${I.X} cliques. Simulations show how often a clique appears, but only the moment bound is proved.` },
      ],
      checks: [
        { title: A.ok ? "Conclusion: a clique is likely" : "Conclusion: the ratio is too large", focus: "conclusion", body: A.ok ? `$$\\Pr[K_${P.k}\\subseteq G]\\ge ${tex(A.pz)}$$` : reveal(`The ratio ${tex(A.ratio)} leaves the bound at $${tex(A.pz)}$.`, "Either the mean is small or the indicators are crowded together."),
          narration: A.ok ? `With probability at least ${spokenNumber(A.pz)} the graph contains a clique, and in particular such graphs exist.` : "Here the ratio is too large. The mean is small or carried by rare crowded outcomes, so no strong conclusion follows." },
        { title: "When to use it", focus: "conclusion", body: "- You need $X>0$, not $X=0$.\n- Pairs of witnesses are nearly independent, so $\\mathbb E[X^2]\\approx(\\mathbb E X)^2$.\n- Threshold proofs pair this with the first moment below the threshold.",
          key: "To show X > 0, show E[X²] is close to (E X)².",
          narration: "Use the second moment to show something does appear. It works when pairs of witnesses are nearly independent." },
      ],
    };
  },
  scenes: ["problem", "random-object", "variable", "overlap", "bound", "experiment", "threshold", "conclusion"],
});

const EXISTENCE_API = { MODULES, hamiltonianPaths, jointPathProbability, secondMomentTable, reveal, sceneComment };
Object.assign(PM, EXISTENCE_API);
