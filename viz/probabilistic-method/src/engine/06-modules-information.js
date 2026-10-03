/* Part 6: discrepancy, ε-nets and VC dimension, entropy, conditional expectation, property testing. */

/* ---------- Discrepancy ---------- */

/** @param {number} m @param {number} n @param {number} dens @param {Rng} r */
function setSystem(m, n, dens, r) {
  const sets = [];
  for (let i = 0; i < m; i++) { /** @type {number[]} */ const s = []; for (let j = 0; j < n; j++) if (r() < dens) s.push(j); if (!s.length) s.push(r.int(n)); sets.push(s); }
  return sets;
}
const rowSums = (/** @type {number[][]} */ A, /** @type {number[]} */ x) => A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
const discOf = (/** @type {number[][]} */ A, /** @type {number[]} */ x) => Math.max(...rowSums(A, x).map(Math.abs));
/* Pr[|sum of s independent ±1| ≥ t], exactly. */
/** @param {number} s @param {number} t */
function rademacherTail(s, t) { let pr = 0; for (let k = 0; k <= s; k++) if (Math.abs(2 * k - s) >= t - 1e-12) pr += binomPmf(s, k, 0.5); return Math.min(1, pr); }
/** @param {number[]} sizes @param {number} n @param {number} m */
function discrepancyBounds(sizes, n, m) {
  const hoeff = (/** @type {number} */ t) => sizes.reduce((s, z) => s + 2 * Math.exp(-(t * t) / (2 * z)), 0), exact = (/** @type {number} */ t) => sizes.reduce((s, z) => s + rademacherTail(z, t), 0);
  let tH = 1; while (hoeff(tH) >= 1 && tH < 10 * n) tH++;
  let tE = 1; while (exact(tE) >= 1 && tE < 10 * n) tE++;
  return { tHoeff: tH, failHoeff: hoeff(tH), tExact: tE, failExact: exact(tE), generic: Math.sqrt(2 * n * Math.log(2 * m)) };
}
/* Experimental algorithms (no guarantee claimed): greedy signs, then single-flip local search. */
/** @param {number[][]} A @param {number} n @returns {number[]} */
function greedySigns(A, n) {
  const x = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    let best = 1, bestVal = Infinity;
    for (const s of [1, -1]) { x[j] = s; const v = Math.max(...rowSums(A, x).map(Math.abs)); if (v < bestVal) { bestVal = v; best = s; } }
    x[j] = best;
  }
  return x;
}
/** @param {number[][]} A @param {number[]} x0 */
function localSearch(A, x0) {
  const x = x0.slice(); let cur = discOf(A, x), improved = true, guard = 0;
  while (improved && guard++ < 500) {
    improved = false;
    for (let j = 0; j < x.length; j++) { x[j] = -x[j]; const v = discOf(A, x); if (v < cur) { cur = v; improved = true; } else x[j] = -x[j]; }
  }
  return x;
}
defineModule({
  id: "discrepancy", route: "discrepancy/set-system", title: "Discrepancy", short: "Discrepancy",
  family: "discrepancy", archetype: "Balancing a set system with random signs",
  intuition: "Random ±1 signs balance every set to within about √(n log m); no set can be badly unbalanced with much probability.",
  problem: "Colour n elements ±1 so that every one of m sets has a small signed sum.",
  randomObject: "Independent uniform signs x_j ∈ {−1, +1}.",
  variable: "(Ax)_i = Σ_{j∈S_i} x_j for each set; disc(x) = max_i |(Ax)_i|.",
  variableTex: "\\operatorname{disc}(x)=\\max_i\\Big|\\sum_{j\\in S_i}x_j\\Big|=\\|Ax\\|_\\infty",
  why: "Each row sum is a sum of |S_i| independent signs: Pr[|(Ax)_i| ≥ t] ≤ 2e^(−t²/(2|S_i|)). If these sum to less than 1 over all rows, some colouring has every |(Ax)_i| < t.",
  need: "A greedy colouring has no guarantee; Chernoff plus the union bound gives one for every set at once.",
  boundTex: "\\sum_i 2e^{-t^2/(2|S_i|)}<1\\;\\Longrightarrow\\;\\exists x:\\ \\operatorname{disc}(x)<t;\\quad \\exists x:\\ \\operatorname{disc}(x)\\le\\sqrt{2n\\ln(2m)}",
  pattern: { controls: "signed row sums", conclusion: "a balanced colouring exists", worksWhen: "the union over sets is affordable", visual: "incidence matrix times signs" },
  params: [
    { key: "m", label: "m (sets)", min: 4, max: 30, step: 1, def: 12 },
    { key: "n", label: "n (elements)", min: 6, max: 40, step: 1, def: 20 },
    { key: "dens", label: "set density", min: 0.2, max: 1, step: 0.05, def: 0.5 },
    { key: "algo", label: "colouring shown", options: [["random", "random signs (the proof's experiment)"], ["greedy", "greedy (experimental)"], ["search", "greedy + local search (experimental)"]], def: "random" },
  ],
  fixed(P, seed) { const sets = setSystem(P.m, P.n, P.dens, rng(seed, "discrepancy-sets")); return { sets, A: incidenceMatrix(sets, P.n) }; },
  analyse(P, F) {
    const sizes = F.sets.map((s) => s.length), B = discrepancyBounds(sizes, P.n, P.m);
    return {
      sizes, ...B, ok: true, smax: Math.max(...sizes),
      rows: [["sets m × elements n", `${P.m} × ${P.n}`, `${P.m}\\times${P.n}`], ["largest set", fmt(Math.max(...sizes)), ""], ["union bound (Hoeffding): disc < t", fmt(B.tHoeff), `t=${B.tHoeff}`],
        ["union bound (exact tails): disc < t", fmt(B.tExact), `t=${B.tExact}`], ["generic √(2n ln 2m)", fmt(B.generic), tex(B.generic)]],
    };
  },
  sample(P, r, F) {
    /** @type {number[]} */
    let x = Array.from({ length: P.n }, () => (r() < 0.5 ? 1 : -1));
    if (P.algo === "greedy") x = greedySigns(F.A, P.n);
    if (P.algo === "search") x = localSearch(F.A, greedySigns(F.A, P.n));
    const sums = rowSums(F.A, x);
    return { x, sums, X: Math.max(...sums.map(Math.abs)) };
  },
  /* Trials always use random signs: the experiment illustrates the theorem's random colouring. */
  fastStat(P, r, F) { const x = Array.from({ length: P.n }, () => (r() < 0.5 ? 1 : -1)); return discOf(F.A, x); },
  stat: (I) => I.X,
  trialCap: () => 10000,
  experiment: { label: "disc(x) of a random colouring", theory: (A) => ({ mean: null, event: `disc ≥ t (union bound t)`, eventTest: (x, A2) => x >= A2.tExact, bound: A.failExact, boundKind: "at most", boundLabel: "Pr[disc ≥ t] ≤ Σ Pr[|row| ≥ t] < 1" }) },
  assumptions(P, A) {
    return [
      { id: "independent-signs", label: "Signs are independent and uniform", ok: P.algo === "random", broken: "Greedy and local search choose signs deterministically: they are experimental algorithms with no proved guarantee here. The theorem is about the random colouring." },
      { id: "union", label: "Σ Pr[|row i| ≥ t] < 1 at the stated t", ok: A.failExact < 1 },
    ];
  },
  breakIt: { label: "Use greedy (no guarantee)", apply: (P) => ({ ...P, algo: "greedy" }) },
  compare: ["chernoff", "epsilon-net", "derandomization"],
  whyNot(P, A) {
    return [
      { title: "Why not Chebyshev per set?", text: `Chebyshev decays like 1/t²; with ${P.m} sets the union bound would need t around √(${P.m}·n). Chernoff's exponential tail makes the union over sets cost only a √(log m) factor.` },
      { title: "Can we do better?", text: "Yes: Spencer's six-standard-deviations theorem gives disc ≤ 6√n when m = n, and Beck–Fiala gives ≤ 2t − 1 when each element lies in at most t sets. Partial colouring (not yet built) is the tool." },
    ];
  },
  proof(P, A) {
    return [
      { text: `Choose x ∈ {−1,+1}^${P.n} uniformly at random.`, focus: "random-object" },
      { text: "Row i: (Ax)_i is a sum of |S_i| independent signs.", focus: "variable" },
      { text: "Chernoff: Pr[|(Ax)_i| ≥ t] ≤ 2e^(−t²/(2|S_i|)).", focus: "bound" },
      { text: `Union bound over the ${P.m} sets: at t = ${A.tHoeff} the total is ${fmt(A.failHoeff)} < 1 (with exact tails t = ${A.tExact} suffices).`, focus: "bound" },
      { text: `So some colouring has disc(x) < ${A.tExact} — and in general some colouring has disc ≤ √(2n ln 2m).`, focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    return {
      title: `Discrepancy: balancing ${P.m} sets on ${P.n} elements`,
      subtitle: "Random signs and a union bound",
      narration: `This deck shows that some plus or minus one colouring of ${P.n} elements balances all ${P.m} sets.`,
      setup: [
        { title: "Problem: balance every set", focus: "problem", body: reveal(`$A\\in\\{0,1\\}^{${P.m}\\times${P.n}}$, signs $x\\in\\{-1,+1\\}^{${P.n}}$.`, "Make every row sum $(Ax)_i$ small."),
          narration: `We colour ${P.n} elements plus or minus one and want every one of ${P.m} sets to have a small signed sum.` },
        { title: "Random object: random signs", focus: "random-object", body: reveal("Each $x_j=\\pm1$ by a fair coin.", `Seed ${P.seed}: $\\operatorname{disc}=${I.X}$ (${P.algo === "random" ? "random signs" : "experimental algorithm"}).`),
          narration: `Toss a coin for each sign. The shown colouring has discrepancy ${I.X}.` },
      ],
      method: [
        { title: "Key random variable: the worst row", focus: "variable", body: "$$\\operatorname{disc}(x)=\\max_i |(Ax)_i|$$",
          narration: "The discrepancy is the largest absolute row sum." },
        { title: "Technique: Chernoff per row, union over rows", focus: "bound", body: reveal("$$\\Pr[|(Ax)_i|\\ge t]\\le 2e^{-t^2/(2|S_i|)}$$", "$$\\sum_i 2e^{-t^2/(2|S_i|)}<1\\Rightarrow\\exists x$$"),
          narration: "Each row is a sum of independent signs, so Chernoff bounds its tail. If the tails over all rows add to less than one, a colouring avoiding all of them exists." },
      ],
      results: [
        { title: `The bound: disc < ${A.tExact}`, focus: "bound", body: `| bound | t |\n| --- | --- |\n| Hoeffding tails | ${A.tHoeff} |\n| exact binomial tails | ${A.tExact} |\n| $\\sqrt{2n\\ln 2m}$ | ${tex(A.generic)} |`,
          narration: `With exact tails, some colouring has discrepancy below ${A.tExact}. The general formula gives about ${spokenNumber(A.generic)}.` },
        { title: "Experiment: random and searched colourings", focus: "experiment", body: reveal(`Shown colouring: disc $=${I.X}$.`, "Greedy and local search are experiments: they often do better, but nothing here proves it."),
          narration: "Greedy and local search often find better colourings. They are experiments, not proofs." },
      ],
      checks: [
        { title: "Conclusion: a balanced colouring exists", focus: "conclusion", body: `$$\\exists x:\\ \\operatorname{disc}(x)<${A.tExact}$$`,
          narration: `Some colouring keeps every set's signed sum below ${A.tExact} in absolute value.` },
        { title: "When to use it", focus: "conclusion", body: "- Many linear constraints on independent signs.\n- Each constraint has an exponential tail.\n- The union over constraints costs only $\\sqrt{\\log m}$.",
          key: "Random signs plus Chernoff plus a union bound: some colouring has disc ≤ √(2n ln 2m).",
          narration: "Use random signs with a union bound for balancing problems. Partial colouring improves it further." },
      ],
    };
  },
  scenes: ["problem", "random-object", "variable", "bound", "experiment", "conclusion"],
});

/* ---------- ε-nets and VC dimension ---------- */

/** @type {Record<string, { label: string, vc: number }>} */
const RANGE_FAMILIES = { intervals: { label: "intervals on ℝ", vc: 2 }, halfplanes: { label: "halfplanes in ℝ²", vc: 3 } };
const DIRECTIONS = 720;
/** @typedef {[number, number]} Point */
/** @param {Params} P @param {() => number} r @returns {Point[]} */
function pointSet(P, r) { return Array.from({ length: P.N }, () => (P.family === "intervals" ? [r(), 0] : [r(), r()])); }
/* The largest range of the family containing no sample point; exact for intervals, over a 720-direction grid for halfplanes. */
/**
 * @param {Params} P @param {Point[]} pts @param {number[]} sampleIdx
 * @returns {{ count: number, lo?: number, hi?: number, theta?: number, cut?: number }}
 */
function largestMissedRange(P, pts, sampleIdx) {
  if (P.family === "intervals") {
    const xs = pts.map((p) => p[0]).sort((a, b) => a - b), ss = [...new Set(sampleIdx.map((i) => pts[i][0]))].sort((a, b) => a - b);
    let best = { count: 0, lo: 0, hi: 0 }, j = 0;
    const cuts = [-Infinity, ...ss, Infinity];
    for (let g = 0; g + 1 < cuts.length; g++) {
      const lo = cuts[g], hi = cuts[g + 1]; let c = 0;
      while (j < xs.length && xs[j] <= lo) j++;
      let k = j; while (k < xs.length && xs[k] < hi) { c++; k++; }
      if (c > best.count) best = { count: c, lo, hi };
    }
    return best;
  }
  let best = { count: 0, theta: 0, cut: 0 };
  for (let d = 0; d < DIRECTIONS; d++) {
    const th = (2 * Math.PI * d) / DIRECTIONS, ux = Math.cos(th), uy = Math.sin(th);
    let cut = -Infinity; for (const i of sampleIdx) cut = Math.max(cut, pts[i][0] * ux + pts[i][1] * uy);
    let c = 0; for (const p of pts) if (p[0] * ux + p[1] * uy > cut + 1e-12) c++;
    if (c > best.count) best = { count: c, theta: th, cut };
  }
  return best;
}
/* Which of the 2^k labelings of a tiny point set the family realises (intervals exactly; halfplanes by direction search). */
/** @param {string} family @param {number[][]} pts */
function traces(family, pts) {
  const k = pts.length, out = [];
  for (let mask = 0; mask < 1 << k; mask++) {
    const lab = pts.map((_, i) => (mask >> i) & 1);
    let ok;
    if (family === "intervals") { const order = pts.map((p, i) => [p[0], lab[i]]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(""); ok = /^0*1*0*$/.test(order); }
    else {
      ok = lab.every((x) => !x) || lab.every((x) => x);
      for (let d = 0; d < 3600 && !ok; d++) {
        const th = (2 * Math.PI * d) / 3600, pr = pts.map((p, i) => [p[0] * Math.cos(th) + p[1] * Math.sin(th), lab[i]]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).join("");
        ok = /^0*1*$/.test(pr);
      }
    }
    out.push({ labels: lab, realised: ok });
  }
  return out;
}
/** @type {Record<string, number[][][]>} */
const VC_EXAMPLES = { intervals: [[[0.2, 0], [0.5, 0]], [[0.2, 0], [0.5, 0], [0.8, 0]]], halfplanes: [[[0.2, 0.2], [0.8, 0.3], [0.5, 0.8]], [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]] };
defineModule({
  id: "epsilon-net", route: "geometry/epsilon-net", title: "ε-nets and VC dimension", short: "ε-net / VC",
  family: "geometric", archetype: "Hitting every large range with a small random sample",
  intuition: "A modest random sample hits every heavy range at once, because a family of bounded VC dimension has few distinct ranges.",
  problem: "Find a small N ⊆ X meeting every range (interval or halfplane) that contains at least ε|X| points.",
  randomObject: "s points drawn from X independently and uniformly (with repetition).",
  variable: "The heaviest range missed by the sample; it is an ε-net when that range has fewer than ε|X| points.",
  variableTex: "\\Pr[\\text{not an }\\varepsilon\\text{-net}]\\le \\Phi_d(|X|)\\,(1-\\varepsilon)^s,\\qquad \\Phi_d(N)=\\sum_{i\\le d}\\binom Ni",
  why: "By Sauer–Shelah a family of VC dimension d cuts X into at most Φ_d(|X|) distinct ranges; each heavy one is missed with probability ≤ (1 − ε)^s, so a union bound finishes. Haussler–Welzl remove the dependence on |X|.",
  need: "There are infinitely many ranges; the VC dimension is what makes the union bound finite.",
  boundTex: "s\\ge\\max\\Big(\\frac4\\varepsilon\\log_2\\frac2\\delta,\\ \\frac{8d}\\varepsilon\\log_2\\frac{8d}\\varepsilon\\Big)\\Rightarrow\\Pr[\\varepsilon\\text{-net}]\\ge1-\\delta",
  pattern: { controls: "VC complexity", conclusion: "a small hitting set exists", worksWhen: "the range space has bounded VC dimension", visual: "samples and the large ranges they miss" },
  params: [
    { key: "family", label: "ranges", options: Object.entries(RANGE_FAMILIES).map(([k, v]) => [k, v.label]), def: "intervals" },
    { key: "N", label: "|X| (points)", min: 50, max: 400, step: 10, def: 200 },
    { key: "eps", label: "ε (heavy = at least ε|X| points)", min: 0.02, max: 0.5, step: 0.01, def: 0.1 },
    { key: "s", label: "s (sample size)", min: 1, max: 200, step: 1, def: 100 },
    { key: "vc", label: "VC example", options: [["0", "small example"], ["1", "one point more"]], def: "1" },
  ],
  fixed(P, seed) { return { pts: pointSet(P, rng(seed, "epsilon-points")) }; },
  analyse(P) {
    const d = RANGE_FAMILIES[P.family].vc, phi = Array.from({ length: d + 1 }, (_, i) => choose(P.N, i)).reduce((a, b) => a + b, 0);
    const fail = Math.min(1, phi * (1 - P.eps) ** P.s);
    let sUnion = 1; while (phi * (1 - P.eps) ** sUnion >= 1 && sUnion < 100000) sUnion++;
    const hw = Math.ceil(Math.max((4 / P.eps) * Math.log2(2 / 0.5), ((8 * d) / P.eps) * Math.log2((8 * d) / P.eps)));
    const vcPts = VC_EXAMPLES[P.family][Number(P.vc)], tr = traces(P.family, vcPts);
    return {
      d, phi, fail, sUnion, hw, ok: fail < 1, heavy: Math.ceil(P.eps * P.N - 1e-9), vcPts, traces: tr, shattered: tr.every((x) => x.realised),
      rows: [["VC dimension d", String(d), `d=${d}`], ["distinct ranges ≤ Φ_d(|X|)", fmt(phi), `\\Phi_${d}(${P.N})=${phi}`], ["Pr[not an ε-net] ≤ Φ(1−ε)^s", fmt(fail), tex(fail)],
        ["union bound needs s ≥", fmt(sUnion), `s\\ge${sUnion}`], ["Haussler–Welzl s (δ = 1/2, any |X|)", fmt(hw), `s\\ge${hw}`]],
    };
  },
  sample(P, r, F) {
    const idx = Array.from({ length: P.s }, () => r.int(P.N)), miss = largestMissedRange(P, F.pts, idx);
    return { idx, miss, isNet: miss.count < P.eps * P.N, X: miss.count / P.N };
  },
  stat: (I) => I.X,
  trialCap: (P) => (P.family === "intervals" ? 10000 : Math.max(200, Math.min(2000, Math.floor(2e7 / (DIRECTIONS * (P.N + P.s)))))),
  experiment: { label: "heaviest missed range / |X|", theory: (A) => ({ mean: null, event: "not an ε-net (a heavy range missed)", eventTest: (x, A2, P2) => x >= P2.eps - 1e-12, bound: A.fail, boundKind: "at most", boundLabel: "Φ_d(|X|)(1 − ε)^s" }) },
  assumptions(P, A) {
    return [
      { id: "vc", label: `The range family has VC dimension d = ${A.d}`, ok: true },
      { id: "iid", label: "Sample points are independent and uniform over X", ok: true },
      { id: "enough", label: "s is large enough that Φ_d(|X|)(1 − ε)^s < 1", ok: A.ok, broken: `With s = ${P.s} the union bound gives ${fmt(A.fail)}: no guarantee. Increase s to at least ${A.sUnion}.` },
      { id: "exact-check", label: P.family === "intervals" ? "Missed ranges checked exactly" : "Missed halfplanes checked over 720 directions (an approximation of the experiment, not of the theorem)", ok: true },
    ];
  },
  breakIt: { label: "Shrink the sample", apply: (P) => ({ ...P, s: 5 }) },
  compare: ["testing", "discrepancy", "first-moment"],
  whyNot(P, A) {
    return [
      { title: "Why not a union bound over all ranges?", text: "There are infinitely many intervals or halfplanes. Restricted to X, a family of VC dimension d has at most Φ_d(|X|) distinct ranges — polynomial, not exponential, in |X|." },
      { title: "Why not a deterministic construction?", text: `Explicit ε-nets exist for some families, but the random sample of size ≈ (d/ε)log(1/ε) works for all of them at once; here Haussler–Welzl ask for s ≥ ${A.hw} regardless of |X|.` },
    ];
  },
  proof(P, A) {
    return [
      { text: `Draw s = ${P.s} points from X independently and uniformly.`, focus: "random-object" },
      { text: `A range with ≥ ε|X| = ${A.heavy} points is missed with probability ≤ (1 − ε)^s.`, focus: "variable" },
      { text: `By Sauer–Shelah the family cuts X into at most Φ_${A.d}(${P.N}) = ${fmt(A.phi)} distinct ranges.`, focus: "vc" },
      { text: `Union bound: Pr[some heavy range missed] ≤ ${fmt(A.fail)}.`, focus: "bound" },
      { text: A.ok ? "This is below 1, so some sample of this size is an ε-net." : `Not below 1: increase s to ${A.sUnion}.`, focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    return {
      title: `ε-nets: hitting every heavy ${P.family === "intervals" ? "interval" : "halfplane"}`,
      subtitle: "Small random samples see every large range",
      narration: `This deck shows that a random sample of ${P.s} points hits every range containing a ${spokenNumber(P.eps)} fraction of the points.`,
      setup: [
        { title: "Problem: a small hitting set", focus: "problem", body: reveal(`$|X|=${P.N}$ points; a range is heavy if it holds at least $\\varepsilon|X|=${A.heavy}$ points.`, "Find a small set meeting every heavy range."),
          narration: `We have ${P.N} points. We want a small set that meets every range holding at least ${A.heavy} of them.` },
        { title: "Random object: a uniform sample", focus: "random-object", body: reveal(`Draw $s=${P.s}$ points with repetition.`, `Seed ${P.seed}: the heaviest missed range has ${I.miss.count} points — ${I.isNet ? "an ε-net" : "not an ε-net"}.`),
          narration: `Draw ${P.s} points at random. With seed ${P.seed} the heaviest range missed holds ${I.miss.count} points.` },
      ],
      method: [
        { title: "VC dimension tames the union", focus: "vc", body: reveal(`VC dimension $d=${A.d}$: ${A.shattered ? "the example set is shattered" : "the example set is not shattered"}.`, `$$\\Phi_{${A.d}}(${P.N})=\\sum_{i\\le ${A.d}}\\binom{${P.N}}{i}=${A.phi}$$`),
          narration: `The family has VC dimension ${A.d}, so it cuts the points into at most ${spokenNumber(A.phi)} distinct ranges.` },
        { title: "Technique: union bound over distinct ranges", focus: "bound", body: "$$\\Pr[\\text{fail}]\\le\\Phi_d(|X|)(1-\\varepsilon)^s$$",
          narration: "Each heavy range is missed with probability at most one minus epsilon to the power s. Adding over the distinct ranges bounds the failure." },
      ],
      results: [
        { title: `Failure ≤ ${fmt(A.fail)}`, focus: "bound", body: reveal(`$$\\Pr[\\text{not an }\\varepsilon\\text{-net}]\\le ${tex(A.fail)}$$`, `Union bound needs $s\\ge${A.sUnion}$; Haussler–Welzl need $s\\ge${A.hw}$ for any $|X|$.`),
          narration: `The failure probability is at most ${spokenNumber(A.fail)}. The union bound needs ${A.sUnion} points, and Haussler and Welzl need ${A.hw} for any number of points.` },
        { title: "Experiment: repeated samples", focus: "experiment", body: "Repeated samples show how quickly failures vanish as $s$ grows; they illustrate the bound, they do not prove it.",
          narration: "Repeated samples show failures vanishing as the sample grows. They illustrate the bound." },
      ],
      checks: [
        { title: A.ok ? "Conclusion: an ε-net of this size exists" : "Conclusion: the sample is too small", focus: "conclusion", body: A.ok ? `Some ${P.s}-point sample meets every heavy range.` : `Increase $s$ to ${A.sUnion}.`,
          narration: A.ok ? `Some sample of ${P.s} points meets every heavy range.` : `This sample size is too small for the guarantee. ${A.sUnion} points would do.` },
        { title: "When to use it", focus: "conclusion", body: "- Hitting or approximating all ranges of a geometric family.\n- The family has bounded VC dimension.\n- Sample size $O\\big((d/\\varepsilon)\\log(1/\\varepsilon)\\big)$, independent of $|X|$.",
          key: "Bounded VC dimension makes a random sample of size O((d/ε) log(1/ε)) hit every heavy range.",
          narration: "Use random sampling for hitting sets when the range family has bounded VC dimension." },
      ],
    };
  },
  scenes: ["problem", "random-object", "vc", "bound", "experiment", "conclusion"],
});

/* ---------- Entropy ---------- */

/* A Markov chain on bits: X1 ~ Bernoulli(a), each next bit flips the previous one with probability f. */
/** @param {number} n @param {number} a @param {number} f */
function chainDistribution(n, a, f) {
  const out = [];
  for (let x = 0; x < 1 << n; x++) {
    const bits = Array.from({ length: n }, (_, i) => (x >> (n - 1 - i)) & 1);
    let pr = bits[0] ? a : 1 - a;
    for (let i = 1; i < n; i++) pr *= bits[i] === bits[i - 1] ? 1 - f : f;
    out.push({ bits, p: pr });
  }
  return out;
}
/** @param {number} N @param {number} r */
function hammingVolume(N, r) { let s = 0; for (let i = 0; i <= r; i++) s += choose(N, i); return s; }
defineModule({
  id: "entropy", route: "entropy/coding", title: "Entropy and counting", short: "Entropy",
  family: "entropy", archetype: "Hamming balls and subadditivity",
  intuition: "To count a family, pick a uniform member at random: its entropy is log of the count, and entropy splits over coordinates.",
  problem: "Bound the number of subsets of [N] with at most δN elements: show Σ_{i≤δN} C(N,i) ≤ 2^(N·H(δ)).",
  randomObject: "A uniformly random member of the family, read as a bit vector X = (X₁, …, X_N).",
  variable: "H(X) = E[−log₂ Pr(X)] = log₂|family|, compared with Σ H(X_i).",
  variableTex: "\\log_2|\\mathcal F|=H(X)\\le\\sum_i H(X_i)\\le N\\,h(\\delta)",
  why: "Subadditivity H(X) ≤ Σ H(X_i) holds for any random vector; each coordinate is 1 with probability at most δ ≤ 1/2, so H(X_i) ≤ h(δ).",
  need: "Direct binomial sums are messy; entropy turns a counting problem into one inequality per coordinate.",
  boundTex: "\\sum_{i\\le\\delta N}\\binom Ni\\le 2^{N h(\\delta)},\\qquad h(\\delta)=-\\delta\\log_2\\delta-(1-\\delta)\\log_2(1-\\delta)",
  pattern: { controls: "entropy of a uniform random member", conclusion: "a bound on the family size", worksWhen: "coordinates have small individual entropy", visual: "an information block split into coordinates" },
  params: [
    { key: "bits", label: "chain length n (blocks view)", min: 2, max: 6, step: 1, def: 4 },
    { key: "a", label: "Pr[X₁ = 1]", min: 0.05, max: 0.95, step: 0.05, def: 0.3 },
    { key: "f", label: "flip probability f (0 = copy, 0.5 = independent)", min: 0, max: 0.5, step: 0.05, def: 0.1 },
    { key: "N", label: "N (bits, counting view)", min: 10, max: 200, step: 10, def: 60 },
    { key: "delta", label: "δ (weight fraction)", min: 0.05, max: 0.9, step: 0.05, def: 0.2 },
  ],
  analyse(P) {
    const dist = chainDistribution(P.bits, P.a, P.f), H = entropy(dist.map((d) => d.p));
    const marg = Array.from({ length: P.bits }, (_, i) => dist.reduce((s, d) => s + (d.bits[i] ? d.p : 0), 0)), Hi = marg.map(binaryEntropy), sumHi = Hi.reduce((a, b) => a + b, 0);
    const r = Math.floor(P.delta * P.N + 1e-9), V = hammingVolume(P.N, r), logV = Math.log2(V), bound = P.N * binaryEntropy(P.delta);
    const meanWeight = Array.from({ length: r + 1 }, (_, i) => i * choose(P.N, i)).reduce((a, b) => a + b, 0) / V;
    return {
      dist, H, marg, Hi, sumHi, gap: sumHi - H, r, V, logV, bound, coordP: meanWeight / P.N, ok: logV <= bound + 1e-9,
      rows: [["H(X) (joint)", fmt(H), `H(X)=${tex(H)}`], ["Σ H(Xᵢ)", fmt(sumHi), `\\sum H(X_i)=${tex(sumHi)}`], ["gap (shared information)", fmt(sumHi - H), tex(sumHi - H)],
        [`log₂ Σ_{i≤${r}} C(${P.N},i)`, fmt(logV), tex(logV)], ["N·h(δ)", fmt(bound), `N h(\\delta)=${tex(bound)}`]],
    };
  },
  sample(P, r) {
    const bits = []; bits.push(r() < P.a ? 1 : 0);
    for (let i = 1; i < P.bits; i++) bits.push(r() < P.f ? 1 - bits[i - 1] : bits[i - 1]);
    let pr = bits[0] ? P.a : 1 - P.a; for (let i = 1; i < P.bits; i++) pr *= bits[i] === bits[i - 1] ? 1 - P.f : P.f;
    return { bits, p: pr, X: -Math.log2(pr) };
  },
  stat: (I) => I.X,
  trialCap: () => 10000,
  experiment: { label: "surprise −log₂ Pr(X) of one sample", theory: (A) => ({ mean: A.H, meanLabel: "H(X) = E[surprise]", event: "surprise above Σ H(Xᵢ)", eventTest: (x, A2) => x > A2.sumHi, bound: null, boundLabel: "the average surprise is H(X) exactly" }) },
  assumptions(P, A) {
    return [
      { id: "subadditive", label: "Subadditivity H(X) ≤ Σ H(Xᵢ) (always true; equality iff independent)", ok: true },
      { id: "delta-half", label: "δ ≤ 1/2, so h is increasing on [0, δ] and H(Xᵢ) ≤ h(δ)", ok: P.delta <= 0.5, broken: `δ = ${fmt(P.delta)} > 1/2: h decreases past 1/2, so Pr[Xᵢ = 1] = ${fmt(A.coordP)} no longer gives H(Xᵢ) ≤ h(δ).${A.logV > A.bound ? ` The conclusion is false here: log₂|ball| = ${fmt(A.logV)} > N·h(δ) = ${fmt(A.bound)}.` : ""}` },
    ];
  },
  breakIt: { label: "Push δ past 1/2", apply: (P) => ({ ...P, delta: 0.7 }) },
  compare: ["first-moment", "epsilon-net", "derandomization"],
  whyNot(P, A) {
    return [
      { title: "Why not count directly?", text: `Σ_{i≤${A.r}} C(${P.N},i) = 2^${fmt(A.logV)} has no closed form; entropy gives 2^${fmt(A.bound)} in one line, and the exponent is tight to within O(log N).` },
      { title: "What does the gap mean?", text: `Σ H(Xᵢ) − H(X) = ${fmt(A.gap)} bits is the information the coordinates share. With f = 0.5 the bits are independent and the gap is ${P.a === 0.5 ? "0" : "small"}; with f = 0 they copy each other and the gap is largest.` },
    ];
  },
  proof(P, A) {
    return [
      { text: `Let F = subsets of [${P.N}] of size ≤ ${A.r}, and X a uniform member of F, as a bit vector.`, focus: "random-object" },
      { text: "Then H(X) = log₂|F|, since every member has probability 1/|F|.", focus: "variable" },
      { text: "Subadditivity: H(X) ≤ Σ H(Xᵢ).", focus: "bound" },
      { text: `By symmetry Pr[Xᵢ = 1] = E|X|/N = ${fmt(A.coordP)} ≤ δ ≤ 1/2, so H(Xᵢ) ≤ h(δ).`, focus: "counting" },
      { text: `Hence log₂|F| ≤ N·h(δ): ${fmt(A.logV)} ≤ ${fmt(A.bound)}.`, focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    return {
      title: `Entropy: counting subsets of size at most ${A.r} in [${P.N}]`,
      subtitle: "Information splits over coordinates",
      narration: "This deck bounds the size of a Hamming ball using entropy and its subadditivity.",
      setup: [
        { title: "Problem: how big is a Hamming ball?", focus: "problem", body: reveal(`Count subsets of $\\{1,\\dots,${P.N}\\}$ with at most $${A.r}$ elements.`, `$$\\sum_{i\\le ${A.r}}\\binom{${P.N}}{i}=2^{${tex(A.logV)}}$$`),
          narration: `We count the subsets of ${P.N} elements with at most ${A.r} members. The answer is two to the power ${spokenNumber(A.logV)}.` },
        { title: "Random object: a uniform member", focus: "random-object", body: reveal("Pick $X$ uniformly from the family; write it as a bit vector.", `Blocks view: a ${P.bits}-bit chain sample ${I.bits.join("")} has surprise $${tex(I.X)}$ bits.`),
          narration: "Pick a member uniformly at random and read it as a string of bits. Its surprise is minus the logarithm of its probability." },
      ],
      method: [
        { title: "Key random variable: entropy", focus: "variable", body: reveal("$$H(X)=\\mathbb E[-\\log_2\\Pr(X)]=\\log_2|\\mathcal F|$$", `Chain example: $H(X)=${tex(A.H)}$, $\\sum H(X_i)=${tex(A.sumHi)}$.`),
          narration: `Entropy is the average surprise. For a uniform member it is the logarithm of the family size. In the chain example the joint entropy is ${spokenNumber(A.H)} bits against ${spokenNumber(A.sumHi)} for the coordinates.` },
        { title: "Technique: subadditivity", focus: "bound", body: reveal("$$H(X)\\le\\sum_i H(X_i)$$", "Each coordinate is $1$ with probability at most $\\delta\\le\\tfrac12$, so $H(X_i)\\le h(\\delta)$."),
          narration: "The joint entropy is at most the sum of the coordinate entropies. Each coordinate is rarely one, so its entropy is at most h of delta." },
      ],
      results: [
        { title: `The bound: ${fmt(A.logV)} ≤ ${fmt(A.bound)}`, focus: "counting", body: `$$\\log_2\\sum_{i\\le ${A.r}}\\binom{${P.N}}{i}=${tex(A.logV)}\\le N h(\\delta)=${tex(A.bound)}$$`,
          narration: `The logarithm of the count is ${spokenNumber(A.logV)}, below the entropy bound ${spokenNumber(A.bound)}.` },
        { title: "Experiment: average surprise", focus: "experiment", body: "Sampling the chain and averaging the surprise converges to $H(X)$; the inequality is exact, the average illustrates it.",
          narration: "Averaging the surprise of many samples approaches the entropy. The inequality itself is exact." },
      ],
      checks: [
        { title: "Conclusion: the Hamming ball is small", focus: "conclusion", body: `$$\\sum_{i\\le\\delta N}\\binom Ni\\le 2^{N h(\\delta)}$$`,
          narration: "The number of sparse subsets is at most two to the N times h of delta." },
        { title: "When to use it", focus: "conclusion", body: "- Bounding the size of a family.\n- Each coordinate of a uniform member is predictable.\n- Generalises to Shearer's lemma for projections.",
          key: "log of a count is the entropy of a uniform member, and entropy is at most the sum over coordinates.",
          narration: "Use entropy to count. The logarithm of a family size is the entropy of a uniform member, and that splits over coordinates." },
      ],
    };
  },
  scenes: ["problem", "random-object", "variable", "bound", "counting", "experiment", "conclusion"],
});

/* ---------- Conditional expectation: MAX-CUT ---------- */

/* E[cut | b_i fixed where assign[i] is 0 or 1, the rest uniform]. */
/** @param {{ edges: Edge[] }} G @param {number[]} assign each vertex's side, or −1 while undecided */
function condExpCut(G, assign) { let s = 0; for (const [a, b] of G.edges) s += assign[a] < 0 || assign[b] < 0 ? 0.5 : assign[a] !== assign[b] ? 1 : 0; return s; }
/** @param {{ n: number, edges: Edge[] }} G */
function derandomizeCut(G, rule = "better") {
  const n = G.n, assign = new Array(n).fill(-1);
  /** @type {{ i: number, value: number, e0?: number, e1?: number, choice?: number }[]} */
  const path = [{ i: -1, value: condExpCut(G, assign) }];
  for (let i = 0; i < n; i++) {
    assign[i] = 0; const e0 = condExpCut(G, assign);
    assign[i] = 1; const e1 = condExpCut(G, assign);
    const pick = rule === "better" ? (e1 > e0 ? 1 : 0) : (e1 < e0 ? 1 : 0);
    assign[i] = pick;
    path.push({ i, e0, e1, choice: pick, value: pick ? e1 : e0 });
  }
  return { assign, path, cut: condExpCut(G, assign) };
}
defineModule({
  id: "derandomization", route: "derandomization/conditional-expectation", title: "Conditional expectation (derandomisation)", short: "Conditional expectation",
  family: "derandomization", archetype: "A large cut, constructed deterministically",
  intuition: "Fix the random bits one by one, always keeping the conditional expectation from falling; when no randomness is left, the object is at least as good as the average.",
  problem: "Find a cut of a graph with at least half of its edges, deterministically.",
  randomObject: "Each vertex goes to side 0 or 1 by a fair coin; a cut edge has its ends on different sides.",
  variable: "X = number of cut edges; E[X | b₁, …, b_i] is computable: decided edges count 0 or 1, the rest 1/2.",
  variableTex: "\\mathbb E[X\\mid b_1,\\dots,b_i]=\\tfrac12\\big(\\mathbb E[X\\mid\\dots,b_{i+1}=0]+\\mathbb E[X\\mid\\dots,b_{i+1}=1]\\big)",
  why: "Each conditional expectation is the average of its two children, so one child is at least as large. Following it never decreases the value, and at the end X itself is ≥ E[X] = m/2.",
  need: "The random proof only says a good cut exists with positive probability; conditional expectation turns that into an algorithm with no randomness at all.",
  boundTex: "\\mathbb E[X]=\\frac m2\\le \\mathbb E[X\\mid b_1]\\le\\dots\\le X(b_1,\\dots,b_n)",
  pattern: { controls: "conditional averages", conclusion: "a deterministic construction", worksWhen: "conditional expectations are computable", visual: "decision tree with values on every node" },
  params: [
    { key: "n", label: "n (vertices)", min: 4, max: 16, step: 1, def: 10 },
    { key: "p", label: "edge probability of the given graph", min: 0.2, max: 0.9, step: 0.05, def: 0.4 },
    { key: "rule", label: "branch rule", options: [["better", "take the child with larger E"], ["worse", "take the smaller child (breaks the guarantee)"]], def: "better" },
  ],
  fixed(P, seed) { return gnp(P.n, P.p, rng(seed, "maxcut-graph")); },
  analyse(P, G) {
    const m = G.edges.length, run = derandomizeCut(G, P.rule);
    return { m, mean: m / 2, ...run, ok: run.cut >= m / 2 - 1e-9 && P.rule === "better",
      rows: [["edges m", fmt(m), `m=${m}`], ["E[X] = m/2", fmt(m / 2), `\\mathbb E[X]=${tex(m / 2)}`], ["constructed cut", fmt(run.cut), `X=${run.cut}`], ["guarantee X ≥ ⌈m/2⌉", fmt(Math.ceil(m / 2)), String(Math.ceil(m / 2))]] };
  },
  sample(P, r, G) { const side = Array.from({ length: P.n }, () => (r() < 0.5 ? 1 : 0)); return { side, X: condExpCut(G, side) }; },
  stat: (I) => I.X,
  trialCap: () => 10000,
  experiment: { label: "X = cut size of a random assignment", theory: (A) => ({ mean: A.mean, event: "X ≥ m/2", eventTest: (x, A2) => x >= A2.mean - 1e-9, bound: null, boundLabel: "Pr[X ≥ m/2] > 0 — the derandomisation finds one" }) },
  assumptions(P, A) {
    return [
      { id: "computable", label: "E[X | b₁…bᵢ] is computable exactly (each edge contributes 0, 1 or 1/2)", ok: true },
      { id: "average", label: "Each node's value is the average of its two children", ok: true },
      { id: "rule", label: "We always follow a child with value ≥ the parent", ok: P.rule === "better", broken: `Following the smaller child lets the value fall: the construction ends at X = ${A.cut}${A.cut < A.mean ? `, below m/2 = ${fmt(A.mean)}` : ""}. The guarantee comes from the choice rule, not from luck.` },
    ];
  },
  breakIt: { label: "Follow the worse child", apply: (P) => ({ ...P, rule: "worse" }) },
  compare: ["first-moment", "moser-tardos", "quasirandom"],
  whyNot(P, A) {
    return [
      { title: "Why not just sample?", text: `A random cut has X ≥ m/2 with positive probability but not certainty. The method of conditional expectations reaches X = ${A.cut} with no randomness and n = ${P.n} steps.` },
      { title: "Why not pessimistic estimators?", text: "Here the conditional expectation is exact and cheap. Pessimistic estimators (not yet built) replace it by an upper bound when the exact value is hard to compute." },
    ];
  },
  proof(P, A) {
    return [
      { text: `Put each of the ${P.n} vertices on a side by a fair coin; X = cut edges, E[X] = m/2 = ${fmt(A.mean)}.`, focus: "random-object" },
      { text: "E[X | b₁…bᵢ] counts decided edges exactly and undecided ones as 1/2.", focus: "variable" },
      { text: "Each node is the average of its two children, so the larger child is ≥ the node.", focus: "construction" },
      { text: "Fix b₁, b₂, … in turn, always choosing the larger child.", focus: "construction" },
      { text: `The value never decreases, so the final, deterministic cut has X = ${A.cut} ≥ ${fmt(A.mean)}.`, focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    // Every step after the starting value records both branch values.
    const steps = A.path.slice(1, 7).map((s) => `| $b_{${s.i + 1}}$ | ${tex(/** @type {number} */ (s.e0))} | ${tex(/** @type {number} */ (s.e1))} | ${s.choice} |`).join("\n");
    return {
      title: `Conditional expectation: a cut of at least ${fmt(A.mean)} edges`,
      subtitle: "Removing the randomness from a proof",
      narration: `This deck turns a random half cut into a deterministic one, for a graph with ${A.m} edges.`,
      setup: [
        { title: "Problem: a large cut", focus: "problem", body: reveal(`A graph with $n=${P.n}$ vertices and $m=${A.m}$ edges.`, "Split the vertices into two sides so that many edges cross."),
          narration: `We have a graph with ${A.m} edges and want a split of the vertices that cuts many of them.` },
        { title: "Random proof: E[X] = m/2", focus: "random-object", body: reveal("Each vertex picks a side by a fair coin; each edge is cut with probability $\\tfrac12$.", `$$\\mathbb E[X]=\\frac m2=${tex(A.mean)}$$`, `Seed ${P.seed}: a random cut of size ${I.X}.`),
          narration: `A random split cuts each edge with probability one half, so on average ${spokenNumber(A.mean)} edges. Some split is at least that good.` },
      ],
      method: [
        { title: "Key quantity: conditional expectations", focus: "variable", body: "$$\\mathbb E[X\\mid b_1,\\dots,b_i]=\\#\\{\\text{decided cut edges}\\}+\\tfrac12\\#\\{\\text{undecided edges}\\}$$",
          narration: "After fixing some sides, the expected cut counts decided edges exactly and every undecided edge as one half." },
        { title: "Technique: always take the better child", focus: "construction", body: reveal("Each node is the average of its two children.", "So one child is at least as large: follow it.", "| bit | E if 0 | E if 1 | choice |\n| --- | --- | --- | --- |\n" + steps),
          narration: "Each value is the average of its two children, so one child never loses. Following it, we fix the bits one at a time." },
      ],
      results: [
        { title: `The construction ends at X = ${A.cut}`, focus: "construction", body: `$$${tex(A.mean)}=\\mathbb E[X]\\le\\cdots\\le X=${A.cut}$$`,
          narration: `The value never falls along the path, and when no randomness is left the cut has ${A.cut} edges.` },
        { title: "Experiment: random cuts", focus: "experiment", body: reveal(`Seed ${P.seed}: random cut ${I.X}.`, "Random cuts scatter around $m/2$; the derandomised cut is always at least $m/2$."),
          narration: "Random splits scatter around the average. The constructed one is guaranteed to be at least the average." },
      ],
      checks: [
        { title: A.ok ? "Conclusion: a deterministic cut of size ≥ m/2" : "Conclusion: the rule was broken", focus: "conclusion", body: A.ok ? "RANDOM PROOF $\\;\\mathbb E[X]\\ge m/2\\;\\Rightarrow\\;$ DETERMINISTIC OBJECT $\\;X=" + A.cut + "$" : "Following the smaller child loses the guarantee.",
          narration: A.ok ? `The random proof becomes a deterministic object with ${A.cut} cut edges.` : "Following the smaller child loses the guarantee." },
        { title: "When to use it", focus: "conclusion", body: "- An expectation argument over independent bits.\n- Conditional expectations are computable (or boundable).\n- You need a deterministic algorithm.",
          key: "Fix random bits one at a time without letting the conditional expectation drop.",
          narration: "Use conditional expectations whenever the averages are computable. The random proof becomes a deterministic algorithm." },
      ],
    };
  },
  scenes: ["problem", "random-object", "variable", "construction", "experiment", "conclusion"],
});

/* ---------- Property testing: triangle-freeness ---------- */

const TEST_N = 10000;
/** @param {Params} P @param {number} seed */
function testerGraph(P, seed) {
  const perm = rng(seed, "tester-hidden").shuffle(Array.from({ length: TEST_N }, (_, i) => i)), part = new Int8Array(TEST_N).fill(-1);
  if (P.type === "far") { const a = Math.floor((P.alpha * TEST_N) / 3); for (let i = 0; i < 3 * a; i++) part[perm[i]] = Math.floor(i / a); return { part, a, size: a }; }
  const b = Math.floor((P.alpha * TEST_N) / 2); for (let i = 0; i < 2 * b; i++) part[perm[i]] = Math.floor(i / b); return { part, a: 0, size: b };
}
/* Edges: between different labelled parts (complete tripartite K_{a,a,a}, or complete bipartite K_{b,b}); nothing else. */
const testerAdjacent = (/** @type {{ part: Int8Array }} */ F, /** @type {number} */ u, /** @type {number} */ v) => F.part[u] >= 0 && F.part[v] >= 0 && F.part[u] !== F.part[v];
/** @param {Params} P @param {number} a @param {number} s */
function rejectProbability(P, a, s) {
  if (P.type !== "far" || a === 0) return 0;
  const base = logChoose(TEST_N, s), q = (/** @type {number} */ k) =>
 (TEST_N - k >= s ? Math.exp(logChoose(TEST_N - k, s) - base) : 0);
  return Math.max(0, Math.min(1, 1 - (3 * q(a) - 3 * q(2 * a) + q(3 * a))));
}
defineModule({
  id: "testing", route: "testing/triangle-free", title: "Property testing", short: "Property testing",
  family: "testing", archetype: "Testing triangle-freeness",
  intuition: "A graph far from triangle-free has triangles everywhere, so a tiny random sample sees one.",
  problem: "Decide, from a few queries, whether a 10,000-vertex graph is triangle-free or ε-far from it (at least ε·C(n,2) edges must change).",
  randomObject: "s vertices chosen uniformly at random; the tester queries every pair among them.",
  variable: "Whether the induced sample contains a triangle — the tester's only evidence.",
  variableTex: "\\Pr[\\text{reject}]=1-\\Pr[\\text{sample misses a part}]",
  why: "One-sided: a triangle-free graph never yields a triangle, so acceptance is always right. A far graph has many triangles (removal lemma), so a constant-size sample finds one with constant probability.",
  need: "Reading the whole graph costs C(n,2) ≈ 5×10⁷ queries; sampling decides with C(s,2) queries, independent of n.",
  boundTex: "\\varepsilon\\text{-far}\\Rightarrow\\ \\Pr[\\text{sample of size }s(\\varepsilon)\\text{ has a triangle}]\\ge\\tfrac23",
  pattern: { controls: "local sample statistics", conclusion: "a global property, approximately", worksWhen: "far-from-property implies many local witnesses", visual: "tiny sample of a huge graph" },
  params: [
    { key: "type", label: "hidden graph", options: [["far", "ε-far: hidden complete tripartite K_{a,a,a}"], ["free", "triangle-free: hidden complete bipartite"]], def: "far" },
    { key: "alpha", label: "fraction of vertices in the hidden structure", min: 0.03, max: 0.6, step: 0.01, def: 0.3 },
    { key: "s", label: "s (sampled vertices)", min: 3, max: 60, step: 1, def: 20 },
  ],
  fixed(P, seed) { return testerGraph(P, seed); },
  analyse(P, F) {
    const pairs = choose(TEST_N, 2), eps = P.type === "far" ? (F.a * F.a) / pairs : 0, rej = rejectProbability(P, F.a, P.s);
    let sNeed = null; if (P.type === "far") { for (let s = 3; s <= 2000; s++) if (rejectProbability(P, F.a, s) >= 2 / 3) { sNeed = s; break; } }
    const queries = choose(P.s, 2);
    return {
      n: TEST_N, eps, rej, sNeed, queries, seen: queries / pairs, removal: F.a * F.a, ok: true,
      curve: Array.from({ length: 60 }, (_, i) => [i + 3, rejectProbability(P, F.a, i + 3)]),
      rows: [["global graph n", "10,000", "n=10{,}000"], ["edges to delete (distance)", fmt(F.a * F.a), `a^2=${F.a * F.a}`], ["ε (fraction of all pairs)", fmt(eps), `\\varepsilon=${tex(eps)}`],
        ["Pr[reject] with this s", fmt(rej), tex(rej)], ["s for 2/3 confidence", sNeed === null ? "—" : fmt(sNeed), sNeed === null ? "" : `s=${sNeed}`], ["queries C(s,2)", fmt(queries), String(queries)]],
    };
  },
  sample(P, r, F) {
    const chosen = new Set(); while (chosen.size < P.s) chosen.add(r.int(TEST_N));
    const S = [...chosen], edges = [];
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) if (testerAdjacent(F, S[i], S[j])) edges.push([i, j]);
    let witness = null;
    const byPart = [0, 1, 2].map((p) => S.findIndex((v) => F.part[v] === p));
    if (P.type === "far" && byPart.every((x) => x >= 0)) witness = byPart;
    return { S, edges, witness, X: witness ? 1 : 0 };
  },
  stat: (I) => I.X,
  trialCap: () => 10000,
  experiment: { label: "1 if the tester rejects (found a triangle)", theory: (A) => ({ mean: A.rej, meanLabel: "exact Pr[reject]", event: "reject", eventTest: (x) => x === 1, bound: A.rej, boundKind: "exactly", boundLabel: "exact rejection probability" }) },
  assumptions(P, A) {
    return [
      { id: "one-sided", label: "One-sided: reject only on a visible triangle", ok: true },
      { id: "far", label: "The graph is ε-far from triangle-free (or triangle-free)", ok: true },
      { id: "enough", label: "s is large enough for confidence 2/3", ok: P.type === "free" || A.rej >= 2 / 3, broken: `With s = ${P.s} the tester rejects a far graph only with probability ${fmt(A.rej)}; ${A.sNeed === null ? "no feasible s" : `s = ${A.sNeed}`} gives 2/3.` },
    ];
  },
  breakIt: { label: "Sample too few vertices", apply: (P) => ({ ...P, type: "far", s: 4 }) },
  compare: ["epsilon-net", "quasirandom", "janson"],
  whyNot(P, A) {
    return [
      { title: "Why not read the graph?", text: `That is C(10,000, 2) ≈ 5×10⁷ queries. The sample used ${fmt(A.queries)}, a fraction ${fmt(A.seen)} of the pairs.` },
      { title: "How does a general tester know s?", text: "For an arbitrary ε-far graph, the triangle removal lemma guarantees δ(ε)n³ triangles, so s depends only on ε — but δ(ε) is tower-type small. This hidden tripartite graph has exactly a³ triangles, so the exact rejection probability is computed instead." },
    ];
  },
  proof(P, A) {
    return [
      { text: `Choose s = ${P.s} vertices uniformly; query all C(s,2) = ${A.queries} pairs.`, focus: "random-object" },
      { text: "Reject exactly when the sampled graph contains a triangle.", focus: "variable" },
      { text: "If G is triangle-free the tester always accepts: one-sided error.", focus: "conclusion" },
      { text: P.type === "far" ? `Here G hides K_{a,a,a} with a = ${Math.round(Math.sqrt(A.removal))}; it is ${fmt(A.eps)}-far, since its a² edge-disjoint triangles each need an edge removed.` : "Here G is triangle-free: rejection is impossible.", focus: "variable" },
      { text: P.type === "far" ? `A triangle appears iff the sample meets all three parts: Pr[reject] = ${fmt(A.rej)} by inclusion–exclusion.` : "Pr[reject] = 0.", focus: "bound" },
      { text: P.type === "far" ? `So s = ${A.sNeed} samples give confidence 2/3, independent of n.` : "Acceptance is always correct.", focus: "conclusion" },
    ];
  },
  story(P, A, I) {
    return {
      title: "Property testing: is a 10,000-vertex graph triangle-free?",
      subtitle: "Global properties from tiny samples",
      narration: "This deck tests triangle freeness of a graph on ten thousand vertices by looking at a handful of them.",
      setup: [
        { title: "Problem: triangle-free or far from it?", focus: "problem", body: reveal("$n=10{,}000$ vertices; reading every pair would take $\\approx 5\\times10^7$ queries.", P.type === "far" ? `The hidden graph needs ${A.removal} edge deletions: $\\varepsilon=${tex(A.eps)}$.` : "The hidden graph is triangle-free."),
          narration: "The graph has ten thousand vertices. Reading all of it would take about fifty million queries." },
        { title: "Random object: a few random vertices", focus: "random-object", body: reveal(`Sample $s=${P.s}$ vertices; query all $\\binom{${P.s}}2=${A.queries}$ pairs.`, `Seed ${P.seed}: ${I.witness ? "a witness triangle appears" : "no triangle seen"}.`),
          narration: `Sample ${P.s} vertices and query the ${A.queries} pairs among them. ${I.witness ? "This sample shows a triangle." : "This sample shows no triangle."}` },
      ],
      method: [
        { title: "One-sided decision", focus: "variable", body: reveal("Reject only on a visible triangle.", "A triangle-free graph is never rejected."),
          narration: "The tester rejects only when it sees a triangle, so a triangle free graph is never wrongly rejected." },
        { title: "Technique: far means many witnesses", focus: "bound", body: reveal("$\\varepsilon$-far graphs have many triangles (removal lemma).", "Here: a triangle appears iff the sample meets all three hidden parts.", `$$\\Pr[\\text{reject}]=${tex(A.rej)}$$`),
          narration: `A graph far from triangle free must contain many triangles, so a small sample finds one. Here the rejection probability is exactly ${spokenNumber(A.rej)}.` },
      ],
      results: [
        { title: `Queries ${A.queries}, fraction seen ${fmt(A.seen)}`, focus: "bound", body: reveal(`Confidence $2/3$ needs $s=${A.sNeed ?? "\\text{n/a}"}$.`, "The sample size depends on $\\varepsilon$, not on $n$."),
          narration: `The tester looks at a tiny fraction of the pairs. The needed sample size depends on how far the graph is, not on its size.` },
        { title: "Experiment: repeated tests", focus: "experiment", body: "Repeated runs reject at the computed rate for a far graph and never for a triangle-free one; they illustrate the exact probability.",
          narration: "Repeated runs reject far graphs at the computed rate and never reject triangle free ones." },
      ],
      checks: [
        { title: "Conclusion: a global property from local looks", focus: "conclusion", body: P.type === "far" ? `With $s=${A.sNeed}$ samples the tester rejects with probability at least $2/3$.` : "Triangle-free graphs are always accepted.",
          narration: "A constant number of random vertices decides the property approximately, with one sided error." },
        { title: "When to use it", focus: "conclusion", body: "- Far-from-property implies many small witnesses.\n- Queries are expensive; approximation is enough.\n- One-sided testers never reject a yes-instance.",
          key: "If far from a property means many local witnesses, a constant-size random sample decides it.",
          narration: "Use sampling testers when being far from a property forces many small witnesses." },
      ],
    };
  },
  scenes: ["problem", "random-object", "variable", "bound", "experiment", "conclusion"],
});

const INFORMATION_API = { setSystem, rowSums, discOf, rademacherTail, discrepancyBounds, greedySigns, localSearch, largestMissedRange, traces, chainDistribution, hammingVolume, condExpCut, derandomizeCut, rejectProbability, testerGraph, testerAdjacent, TEST_N, RANGE_FAMILIES };
Object.assign(PM, INFORMATION_API);
