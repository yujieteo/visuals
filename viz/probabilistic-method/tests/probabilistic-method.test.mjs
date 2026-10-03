/* The Probabilistic Method Atlas: the engine's mathematics (spec §85), the
 * consistency of everything the page displays (spec §86), the inventory, the beamdswitch decks and the page itself. */
import assert from "node:assert/strict";
import test from "node:test";
import { parseDeck } from "./fixtures/beamdswitch/deck.mjs";
import { read, assertTemplateCopy, assertInlined, assertStandardDeck, openPage } from "./page-checks.mjs";

const { buildPage, loadEngine, engineSource, uiSource, catalogueText } = await import("../build.mjs");
const PM = loadEngine();
const J = (/** @type {unknown} */ x) => JSON.parse(JSON.stringify(x));
/* Engine values come from another vm realm; compare them as plain JSON. */
/** @param {unknown} a @param {unknown} b @param {string} [msg] */
const deq = (a, b, msg) => assert.deepEqual(J(a), J(b), msg);
const close = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ tol, /** @type {string} */ what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
/* A lab the test names: it must exist. */
const lab = (/** @type {string} */ id) => { const m = PM.moduleById(id); assert.ok(m, id); return m; };
/** @param {string} id @param {Record<string, unknown>} [over] */
const evalDefault = (id, over = {}) => { const m = lab(id); return PM.evaluate(m, { ...PM.defaults(m), ...over }); };
test("index.html and raw.json are the build of the sources, with every script inlined unchanged", () => {
  const html = read("index.html");
  assert.equal(html, buildPage(), "run node build.mjs");
  assert.equal(read("raw.json"), catalogueText(), "raw.json drifted from the engine");
  assertTemplateCopy();
  assertInlined(html, "beamdswitch", read("tests/fixtures/beamdswitch/template.js"), "beamdswitch");
  assertInlined(html, "probabilistic-method-engine", engineSource(), "engine");
  assertInlined(html, "probabilistic-method-ui", uiSource(), "page code");
});

test("the page is self-contained: no external scripts, styles, fonts or requests", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/i);
  assert.doesNotMatch(html, /@import|url\(\s*["']?https?:/i);
  assert.doesNotMatch(html, /\bfetch\(|XMLHttpRequest|new WebSocket|EventSource/);
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>)]+/g)) assert.match(m[0], /^https:\/\/teoyujie\.org\/|^http:\/\/www\.w3\.org\/2000\/svg$/, `unexpected URL ${m[0]}`);
});

test("the no-JavaScript fallback has the worked example and the whole inventory", () => {
  const html = read("index.html"), stat = /** @type {RegExpExecArray} */ (/<div id="static" class="static">([\s\S]*?)<\/div>\n<div id="app" hidden>/.exec(html))[1];
  assert.match(stat, /E\[X\] = 0\.4922 &lt; 1/);
  for (const t of PM.INVENTORY) assert.ok(stat.includes(PM.escapeHtml(t.title)), t.title);
});

test("the built-in self-tests pass", () => {
  const T = PM.selfTests();
  assert.ok(T.length >= 40);
  assert.equal(T.filter((x) => !x.pass).map((x) => x.name).join("\n"), "");
});

/* ---------- §85: mathematical utilities ---------- */

test("numbers are written the same way on the page, in LaTeX and aloud", () => {
  /** @type {[number, string, string, string][]} */
  const cases = [
    [0, "0", "0", "0"], [-1234567, "−1,234,567", "-1234567", "minus 1234567"], [1e9, "1×10⁹", "1 \\times 10^{9}", "1 times ten to the 9"],
    [123456.789, "123500", "123500", "123000"], [-0.000012345, "−1.234×10⁻⁵", "-1.234 \\times 10^{-5}", "minus 1.23 times ten to the minus 5"],
    [0.0005, "0.0005", "0.0005", "5 times ten to the minus 4"], [1 / 3, "0.3333", "0.3333", "0.333"],
    [Infinity, "∞", "\\infty", "infinity"], [-Infinity, "−∞", "-\\infty", "minus infinity"],
  ];
  for (const [x, page, latex, spoken] of cases) deq([PM.fmt(x), PM.tex(x), PM.spokenNumber(x)], [page, latex, spoken], String(x));
  assert.equal(PM.fmt(NaN), "—");
});

test("combinations", () => {
  assert.equal(PM.choose(10, 5), 252);
  assert.equal(PM.choose(52, 5), 2598960);
  assert.equal(PM.choose(5, 7), 0);
  assert.equal(PM.choose(30, 15), 155117520);
  for (let n = 0; n <= 20; n++) for (let k = 1; k <= n; k++) assert.equal(PM.choose(n, k), PM.choose(n - 1, k - 1) + PM.choose(n - 1, k), `Pascal ${n},${k}`);
  close(PM.logChoose(60, 12), Math.log(PM.choose(60, 12)), 1e-9, "logChoose");
  assert.equal(PM.subsets(6, 3).length, 20);
});

test("binomial probabilities", () => {
  close(PM.binomPmf(10, 3, 0.5), 120 / 1024, 1e-15, "Bin(10,1/2) at 3");
  close(PM.binomPmf(5, 0, 0.2), 0.8 ** 5, 1e-15, "Bin(5,0.2) at 0");
  close(PM.binomUpperTail(4, 3, 0.5), 5 / 16, 1e-15, "Pr[Bin(4,1/2) ≥ 3]");
  close(PM.binomUpperTail(4, 2.5, 0.5), 5 / 16, 1e-15, "non-integer thresholds round up");
  close([...Array(201).keys()].reduce((s, k) => s + PM.binomPmf(200, k, 0.1), 0), 1, 1e-12, "PMF sums to 1");
});

test("expected subgraph counts", () => {
  close(PM.expectedCopies(10, 0.3, 3, 3, 6), PM.choose(10, 3) * 0.3 ** 3, 1e-12, "triangles");
  close(PM.expectedCopies(12, 0.6, 4, 6, 24), PM.choose(12, 4) * 0.6 ** 6, 1e-12, "K4");
  const sm = evalDefault("second-moment");
  close(sm.A.EX, PM.expectedCopies(12, 0.6, 4, 6, 24), 1e-9, "second-moment lab E[X] is the K4 count");
  close(evalDefault("janson").A.mu, PM.expectedCopies(20, 0.1, 3, 3, 6), 1e-12, "Janson μ is the triangle count");
});

test("dependency degrees", () => {
  deq(J(PM.dependencyDegrees([[0, 1], [1, 2], [2, 3], [5, 6]])), [1, 2, 1, 0]);
  /* Band hypergraph: edges of k consecutive ring vertices at stride s meet the 2⌈k/s⌉ − 2 nearest edges. */
  for (const [k, s] of [[6, 2], [6, 1], [5, 3], [4, 4], [8, 3]]) {
    const H = PM.bandHypergraph(k, s, 60);
    assert.equal(H.d, 2 * Math.ceil(k / s) - 2, `k=${k}, s=${s}`);
    assert.ok(H.degrees.every((x) => x === H.d), "every event has the same degree on the ring");
  }
});

test("Chernoff expressions", () => {
  /* (e^δ/(1+δ)^(1+δ))^μ at μ = 20, δ = 1/2 is exp(20(0.5 − 1.5 ln 1.5)). */
  close(PM.chernoffUpper(20, 0.5), Math.exp(20 * (0.5 - 1.5 * Math.log(1.5))), 1e-15, "optimal form");
  close(PM.chernoffSimple(20, 0.5), Math.exp(-0.25 * 20 / 2.5), 1e-15, "δ²μ/(2+δ) form");
  for (const mu of [1, 5, 20, 80]) for (const d of [0.1, 0.5, 1, 2]) assert.ok(PM.chernoffUpper(mu, d) <= PM.chernoffSimple(mu, d) + 1e-15, "the optimal form is the stronger");
  for (const [N, p] of [[200, 0.1], [50, 0.5], [1000, 0.02]]) for (const d of [0.2, 0.5, 1, 2]) {
    const mu = N * p;
    assert.ok(PM.binomUpperTail(N, (1 + d) * mu, p) <= PM.chernoffUpper(mu, d), `Bin(${N},${p}), δ=${d}: Chernoff is an upper bound`);
  }
  const C = evalDefault("chernoff").A;
  close(C.exact, PM.binomUpperTail(200, 30, 0.1), 1e-15, "the lab's exact tail");
  assert.ok(C.mgf <= C.chernoff + 1e-15 && C.exact <= C.mgf, "exact ≤ binomial MGF bound ≤ Poisson-form bound");
  const broken = evalDefault("chernoff", { rho: 0.3, delta: 1 }).A;
  assert.equal(broken.ok, false);
  assert.ok(broken.exact > broken.chernoff, "with correlation the would-be Chernoff bound is actually violated");
  assert.ok(broken.exact <= broken.chebyshev + 1e-12 && broken.exact <= broken.markov, "Chebyshev (true variance) and Markov still hold");
});

test("Poisson probabilities", () => {
  close(PM.poissonPmf(2, 0), Math.exp(-2), 1e-15, "Pr[0]");
  close(PM.poissonPmf(2, 3), Math.exp(-2) * 8 / 6, 1e-15, "Pr[3]");
  close(PM.poissonCdf(1, 1), 2 * Math.exp(-1), 1e-15, "cdf");
  close([...Array(80).keys()].reduce((s, k) => s + PM.poissonPmf(7.5, k), 0), 1, 1e-12, "sums to 1");
});

test("conditional expectations: each node averages its children (cut and Doob martingale)", () => {
  const G = PM.gnp(9, 0.5, PM.rng(5, "t")), a = new Array(9).fill(-1);
  assert.equal(PM.condExpCut(G, a), G.edges.length / 2);
  for (let i = 0; i < 9; i++) { const p = PM.condExpCut(G, a); a[i] = 0; const x = PM.condExpCut(G, a); a[i] = 1; const y = PM.condExpCut(G, a); close(p, (x + y) / 2, 1e-12, `bit ${i}`); a[i] = x >= y ? 0 : 1; }
  for (const stat of ["triangles", "isolated", "edges"]) {
    const n = 6, p = 0.3, x = PM.edgeList(n).map((_, i) => (i * 7) % 3 === 0 ? 1 : 0);
    for (let k = 0; k < x.length; k++) {
      const z = PM.conditionalExpectation(stat, n, p, x, k), x1 = x.slice(), x0 = x.slice(); x1[k] = 1; x0[k] = 0;
      close(z, p * PM.conditionalExpectation(stat, n, p, x1, k + 1) + (1 - p) * PM.conditionalExpectation(stat, n, p, x0, k + 1), 1e-12, `${stat} step ${k}`);
    }
    const full = PM.conditionalExpectation(stat, n, p, x, x.length), G2 = PM.graphFromEdges(n, PM.edgeList(n).filter((_, i) => x[i]));
    const truth = stat === "triangles" ? PM.countTriangles(G2) : stat === "edges" ? G2.edges.length : PM.degrees(G2).filter((d) => d === 0).length;
    assert.equal(full, truth, `${stat}: Z_m is the statistic itself`);
  }
  const D = evalDefault("derandomization").A;
  assert.ok(D.cut >= D.m / 2, "the derandomised cut reaches the mean");
  D.path.slice(1).forEach((/** @type {{ value: number }} */ s, /** @type {number} */ i) => assert.ok(s.value >= D.path[i].value - 1e-12, "the value never falls"));
});

test("seeded PRNG: fixed draws, independent named streams", () => {
  const r = PM.rng(17);
  deq([r(), r(), r()].map((x) => x.toFixed(12)), ["0.148893263657", "0.781719926512", "0.975871476345"]);
  const a = PM.rng(17, "graph"), b = PM.rng(17, "colouring");
  assert.notEqual(a(), b());
  const u = PM.rng(99, "x"); let s = 0; for (let i = 0; i < 20000; i++) s += u(); close(s / 20000, 0.5, 0.01, "mean of uniforms");
});

test("graph generation: seed 17, n = 8, p = 0.5 gives one fixed graph", () => {
  const G = PM.gnp(8, 0.5, PM.rng(17, "graph"));
  deq(J(G.edges), [[0, 3], [0, 4], [0, 5], [0, 6], [1, 2], [1, 7], [2, 5], [3, 4], [3, 6], [4, 5], [4, 6], [4, 7], [5, 6], [5, 7], [6, 7]]);
  for (const [i, j] of G.edges) assert.equal(G.adj[i * 8 + j] + G.adj[j * 8 + i], 2);
  assert.equal(PM.countTriangles(G), 10);
  assert.equal(PM.countCliques(G, 3), 10);
  deq(J(PM.components(5, [[0, 1], [1, 2], [3, 4]]).sizes), [3, 2]);
});

test("incidence matrices", () => {
  deq(J(PM.incidenceMatrix([[0, 2], [1], [0, 1, 3]], 4)), [[1, 0, 1, 0], [0, 1, 0, 0], [1, 1, 0, 1]]);
  const E = evalDefault("discrepancy");
  E.F.A.forEach((/** @type {number[]} */ row, /** @type {number} */ i) => assert.equal(row.reduce((a, b) => a + b, 0), E.F.sets[i].length));
  deq(J(PM.rowSums([[1, 1, 0], [0, 1, 1]], [1, -1, 1])), [0, 0]);
});

/* ---------- §86: what the page displays is consistent ---------- */

test("displayed expectation equals the sum of the displayed indicator expectations", () => {
  for (const [n, k] of [[8, 4], [10, 5], [12, 4]]) {
    const A = lab("first-moment").analyse({ n, k, seed: 17 }, null);
    const sum = PM.subsets(n, k).reduce((s) => s + 2 ** (1 - PM.choose(k, 2)), 0);
    close(A.EX, sum, 1e-12, `n=${n}, k=${k}`);
  }
  /* The second moment table, against a brute-force sum over every ordered pair of k-sets. */
  const n = 8, k = 3, p = 0.4, K = 3, sets = PM.subsets(n, k);
  let brute = 0; for (const S of sets) for (const T of sets) { const j = S.filter((v) => T.includes(v)).length; brute += p ** (2 * K - PM.choose(j, 2)); }
  close(lab("second-moment").analyse({ n, k, p, cluster: "off", seed: 17 }, null).EX2, brute, 1e-9, "E[X²]");
  /* Janson's Δ against every ordered pair of triangles sharing an edge. */
  const tri = PM.subsets(7, 3); let pairs = 0; for (const a of tri) for (const b of tri) if (a !== b && a.filter((v) => b.includes(v)).length === 2) pairs++;
  close(lab("janson").analyse({ n: 7, p: 0.2, rho: 0, seed: 17 }, null).Delta, pairs * 0.2 ** 5, 1e-12, "Δ");
  /* Dependent random choice: E|A′| and E[Y] are sums over vertices and bad pairs. */
  const D = evalDefault("drc");
  let EA = 0; for (const row of D.F.adj) EA += (row.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / D.P.N) ** D.P.t;
  close(D.A.EA, EA, 1e-12, "E|A′|");
  /* Alterations: E[X − Y] = nq − mq². */
  const Al = evalDefault("alterations"); close(Al.A.EXY, Al.P.n * Al.P.q - Al.F.edges.length * Al.P.q ** 2, 1e-12, "E[X − Y]");
});

test("displayed dependency degree equals the actual maximum", () => {
  for (const over of [{}, { s: 1 }, { k: 3, s: 3 }, { k: 8, s: 3, m: 37 }]) {
    for (const id of ["local-lemma", "moser-tardos"]) {
      const E = evalDefault(id, over), real = Math.max(...E.F.edges.map((/** @type {number[]} */ e, /** @type {number} */ i) => E.F.edges.filter((/** @type {number[]} */ f, /** @type {number} */ j) => j !== i && f.some((v) => e.includes(v))).length));
      assert.equal(E.A.d, real, `${id} ${JSON.stringify(over)}`);
      assert.ok(E.A.rows.some((/** @type {string[]} */ [l, v]) => /dependency degree/.test(l) && v === String(real)));
    }
  }
});

test("the Local Lemma condition is e·p·(d+1) ≤ 1 and its guarantee is a true lower bound", () => {
  const A = evalDefault("local-lemma").A;
  close(A.gauge, Math.E * 2 ** -5 * 5, 1e-12, "e·p·(d+1) at k = 6, d = 4");
  assert.equal(A.ok, true);
  close(A.lllLower, 0.8 ** 100, 1e-15, "(1 − 1/(d+1))^m");
  assert.equal(evalDefault("local-lemma", { s: 1 }).A.ok, true, "k = 6, stride 1: d = 10 and e·p·11 < 1 still");
  assert.equal(evalDefault("local-lemma", { s: 1, k: 5 }).A.ok, false, "k = 5, stride 1: d = 8 and e·9/16 > 1");
  /* A tiny instance where Pr[no monochromatic edge] can be enumerated exactly. */
  const H = PM.bandHypergraph(3, 3, 4), P = /** @type {Params} lllAnalysis reads only k */ (/** @type {unknown} */ ({ k: 3, s: 3, m: 4 })), B = PM.lllAnalysis(P, H);
  let good = 0; for (let x = 0; x < 1 << H.N; x++) { const col = Array.from({ length: H.N }, (_, v) => (x >> v) & 1); if (H.edges.every((e) => !e.every((v) => col[v] === col[e[0]]))) good++; }
  assert.ok(B.lllLower !== null && good / 2 ** H.N >= B.lllLower - 1e-12);
  assert.equal(lab("moser-tardos").analyse(P, H).bound, 4 * B.p / (1 - B.p), "d = 0 uses x = p");
});

test("histograms use exactly the stated number of trials, and trials are deterministic", () => {
  for (const m of PM.MODULES) {
    const E = PM.evaluate(m, PM.defaults(m)), N = Math.min(37, m.trialCap(E.P)), v = PM.runTrials(E, 0, N), s = PM.summarise(E, v);
    assert.equal(s.N, N, m.id);
    assert.equal(s.hist.bins.reduce((a, b) => a + b.count, 0), N, `${m.id}: histogram counts`);
    deq(J(PM.runTrials(E, 0, N)), J(v), `${m.id}: same seed, same trials`);
    deq(J(PM.runTrials(E, 10, 20)), J(v.slice(10, 20)), `${m.id}: chunking does not change trials`);
  }
});

test("experiments agree with the theory they illustrate", () => {
  const rate = (/** @type {string} */ id, /** @type {Record<string, unknown>} */ over, /** @type {number} */ N) => { const E = evalDefault(id, over), v = PM.runTrials(E, 0, N), s = PM.summarise(E, v); return { E, s }; };
  { const { E, s } = rate("first-moment", {}, 600); close(s.mean, E.A.EX, 0.2, "mean number of monochromatic 5-sets"); assert.ok(s.frac >= E.A.markovZero - 0.06); }
  { const { E, s } = rate("chernoff", {}, 4000); close(s.frac, E.A.exact, 0.012, "Chernoff lab exact tail"); }
  { const { E, s } = rate("testing", {}, 3000); close(s.frac, E.A.rej, 0.03, "tester rejection rate"); }
  { const { E, s } = rate("linearity", {}, 1500); close(s.mean, E.A.EX, 6, "mean Hamiltonian paths"); }
  { const { E, s } = rate("janson", {}, 2000); assert.ok(s.frac >= E.A.harris - 0.04 && s.frac <= E.A.janson + 0.04, `triangle-free rate ${s.frac}`); }
  { const { s } = rate("testing", { type: "free" }, 500); assert.equal(s.hits, 0, "one-sided: triangle-free graphs are never rejected"); }
});

test("every sample from the labs is what the lab says it is", () => {
  const Al = evalDefault("alterations"); assert.ok(Al.I.independent && Al.I.survivors >= Al.I.guaranteed);
  const Dr = evalDefault("drc"); for (let i = 0; i < Dr.I.U.length; i++) for (let j = i + 1; j < Dr.I.U.length; j++) assert.ok(Dr.F.co[Dr.I.U[i]][Dr.I.U[j]] >= Dr.P.m);
  const Mt = evalDefault("moser-tardos"); assert.ok(Mt.I.done && Mt.F.edges.every((/** @type {number[]} */ e) => !e.every((v) => Mt.I.final[v] === Mt.I.final[e[0]])));
  const Nb = evalDefault("nibble"); const used = new Set(); for (const e of Nb.I.matching) for (const v of e) { assert.ok(!used.has(v), "matching edges are disjoint"); used.add(v); }
  const Qr = evalDefault("quasirandom"); assert.ok(Qr.A.regular); close(Qr.A.lambda, (1 + Math.sqrt(29)) / 2, 1e-9, "Paley λ = (1+√q)/2"); assert.ok(Qr.I.dev <= Qr.I.bound + 1e-9, "expander mixing holds");
  const En = evalDefault("entropy").A; assert.ok(En.H <= En.sumHi + 1e-12 && En.logV <= En.bound);
  close(PM.giantFraction(2), 1 - Math.exp(-2 * PM.giantFraction(2)), 1e-12, "β = 1 − e^(−cβ)"); assert.equal(PM.giantFraction(0.9), 0);
  const Ep = evalDefault("epsilon-net").A; assert.equal(Ep.phi, 1 + 200 + PM.choose(200, 2)); assert.ok(Ep.fail < 1);
  assert.equal(PM.traces("intervals", [[0.2, 0], [0.5, 0], [0.8, 0]]).filter((t) => !t.realised).length, 1, "three points: only 101 fails for intervals");
  assert.ok(PM.traces("halfplanes", [[0.2, 0.2], [0.8, 0.3], [0.5, 0.8]]).every((t) => t.realised), "three points in general position are shattered by halfplanes");
  assert.equal(PM.traces("halfplanes", [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]).filter((t) => !t.realised).length, 2, "a square: the two diagonal labellings fail");
});

/* ---------- inventory and module schema ---------- */

test("the inventory has stable ids for every technique, and built techniques point at real labs", () => {
  assert.equal(PM.INVENTORY.length, 92);
  deq(PM.INVENTORY.map((t) => t.n), [...Array(92).keys()].map((i) => i + 1));
  assert.equal(new Set(PM.INVENTORY.map((t) => t.id)).size, 92);
  for (const t of PM.INVENTORY) {
    assert.match(t.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(PM.FAMILIES.some((f) => f.id === t.family), t.id);
    if (t.module) { const m = PM.moduleById(t.module); assert.ok(m, t.id); assert.ok(m.scenes.includes(/** @type {string} */ (t.scene)) || PM.focusLabel(/** @type {Evaluated} only the scene name is needed */ ({ A: {} }), /** @type {string} */ (t.scene)) !== t.scene, `${t.id}: scene ${t.scene}`); }
    else assert.equal(t.scene, null);
  }
  /* The spec §88 MVP: every one of these has a lab. */
  for (const id of ["first-moment", "linearity", "alterations", "second-moment", "local-lemma", "moser-tardos", "chernoff", "martingale", "janson", "nibble", "quasirandom", "phase-transition", "discrepancy", "epsilon-net", "entropy", "derandomization", "testing", "drc"]) assert.ok(PM.moduleById(id), id);
  deq(J(PM.COURSE).sort(), J(PM.MODULES.map((m) => m.id)).sort());
});

test("every lab carries the twelve-part technique schema and the four questions", () => {
  for (const m of PM.MODULES) {
    for (const k of /** @type {const} */ (["title", "intuition", "problem", "randomObject", "variable", "variableTex", "why", "need", "boundTex"])) assert.ok(typeof m[k] === "string" && m[k].length > 10, `${m.id}.${k}`);
    const E = PM.evaluate(m, PM.defaults(m));
    assert.ok(m.params.length >= 1 && E.A.rows.length >= 3, `${m.id}: play and bound`);
    assert.ok(m.assumptions(E.P, E.A).every((a) => a.ok), `${m.id}: defaults satisfy every hypothesis`);
    for (const over of [{}, ...m.params.flatMap((p) => (p.options ? p.options.map(([v]) => ({ [p.key]: v })) : [{ [p.key]: p.min }, { [p.key]: p.max }]))]) {
      const from = PM.evaluate(m, { ...E.P, ...over }), broken = PM.evaluate(m, m.breakIt.apply(from.P, from.A));
      assert.ok(m.assumptions(broken.P, broken.A).some((a) => !a.ok && a.broken), `${m.id} from ${JSON.stringify(over)}: Break it breaks a hypothesis, with a reason`);
    }
    assert.ok(m.compare.length >= 1 && m.compare.every(PM.moduleById) && m.whyNot(E.P, E.A).length >= 1, `${m.id}: compare`);
    assert.ok(m.proof(E.P, E.A).length >= 4, `${m.id}: proof`);
  }
});

test("search resolves the specification's alias examples", () => {
  const ids = (/** @type {string} */ q) => PM.search(q).map((r) => r.id);
  for (const [q, want] of /** @type {[string, string[]][]} */ ([["bad events", ["union-bound", "symmetric-lll", "janson"]], ["tails", ["chernoff", "azuma-hoeffding", "talagrand", "kim-vu"]], ["remove randomness", ["conditional-expectation", "k-wise-independence"]], ["common neighbours", ["dependent-random-choice"]]])) {
    const got = ids(q); for (const w of want) assert.ok(got.includes(w), `${q} → ${w}: ${got}`);
  }
});

/* ---------- URL state, decks and Markdown export ---------- */

test("URL state reproduces the scene", () => {
  for (const m of PM.MODULES) {
    const P = { ...PM.defaults(m), seed: 1729 }, st = { view: "lab", module: m.id, P, deck: true, frame: 2, step: 1, lens: "proof" };
    const h = PM.stateHash(st), back = PM.parseHash(h);
    assert.ok(back.view === "lab", h);
    assert.equal(back.module, m.id); deq(J(back.P), J(P)); assert.equal(back.frame, 2); assert.equal(back.step, 1); assert.equal(back.lens, "proof");
    assert.ok(h.startsWith(`#${m.route}?`));
  }
  const lm = lab("local-lemma"), lP = { ...PM.defaults(lm), focus: 12, seed: 17 };
  for (const focus of ["dependency", ""]) {
    const back = PM.parseHash(PM.stateHash({ view: "lab", module: lm.id, P: lP, focus }));
    assert.ok(back.view === "lab");
    deq(J(back.P), J(lP), `selected event survives with scene "${focus}"`); assert.equal(back.focus, focus);
  }
  const bad = PM.parseHash("#first-moment/ramsey?n=10%&k=4");
  assert.ok(bad.view === "lab");
  assert.equal(bad.module, "first-moment"); assert.equal(bad.P.n, 10); assert.equal(bad.P.k, 4, "a malformed escape drops only its own pair");
  const ll = PM.parseHash("#local-lemma/hypergraph-colouring?deck=1&switch=4&seed=17");
  assert.ok(ll.view === "lab");
  assert.equal(ll.module, "local-lemma"); assert.equal(ll.deck, true); assert.equal(ll.step, 4); assert.equal(ll.P.seed, 17);
  const clamped = PM.parseHash("#first-moment/ramsey?n=999&k=abc");
  assert.ok(clamped.view === "lab");
  assert.equal(clamped.P.n, 14, "out-of-range values clamp");
  assert.equal(PM.parseHash("#technique/talagrand").view, "technique");
  assert.equal(PM.parseHash("#nonsense").view, "atlas");
});

test("every technique deck is a standard narrated beamdswitch deck, byte-for-byte deterministic", () => {
  for (const m of PM.MODULES) {
    const E = PM.evaluate(m, PM.defaults(m)), md = PM.techniqueDeck(E);
    const deck = assertStandardDeck(md, m.id);
    assert.equal(deck.meta.voice, "bf_emma");
    assert.equal(PM.techniqueDeck(PM.evaluate(m, PM.defaults(m))), md, `${m.id}: same state, same bytes`);
    assert.match(md, new RegExp(`<!-- probabilistic-method scene: module=${m.id}; scene=[a-z-]+; seed=17; focus=`), `${m.id}: scene state rides along`);
    assert.ok(deck.frames.filter((f) => f.kind === "frame").some((f) => f.steps > 1), `${m.id}: at least one frame uses . . . reveals`);
    /* Deck mode shows the same frames, in the same order, with the same reveal steps. */
    const frames = PM.deckFrames(E), parsed = deck.frames.filter((f) => f.kind === "frame");
    deq(frames.map((f) => f.title), parsed.map((f) => f.title), m.id);
    deq(frames.map((f) => f.steps), parsed.map((f) => f.steps), `${m.id}: switches`);
    assert.doesNotMatch(md, /NaN|undefined|\[object/, m.id);
  }
});

test("deck equations equal lab equations, and the export changes with the scene", () => {
  const E = evalDefault("first-moment"), md = PM.techniqueDeck(E);
  assert.ok(md.includes(`=${PM.tex(E.A.EX)}$$`), "the deck states the lab's E[X]");
  assert.ok(md.includes(String(E.A.sets)) && md.includes(`seed ${E.P.seed}`));
  const L = evalDefault("local-lemma"), mdL = PM.techniqueDeck(L);
  assert.ok(mdL.includes(PM.tex(L.A.gauge)) && mdL.includes(`d=${L.A.d}`), "Local Lemma deck carries e·p·(d+1) and d");
  const other = PM.techniqueDeck(evalDefault("first-moment", { seed: 18 }));
  assert.notEqual(other, md, "a different seed is a different scene");
  const broken = PM.techniqueDeck(evalDefault("first-moment", { n: 12 }));
  assert.match(broken, /The argument stopped working/);
});

test("slide, course and switch-sequence exports are decoded and parse", () => {
  const E = evalDefault("local-lemma");
  const slide = parseDeck(PM.slideMarkdown(E, 2));
  assert.equal(slide.meta.voice, "bf_emma");
  assert.equal(slide.frames.filter((f) => f.kind === "frame").length, 1);
  const course = PM.courseDeck(17), deck = parseDeck(course);
  assert.equal(deck.meta.voice, "bf_emma");
  deq(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), PM.COURSE.map((id) => lab(id).title));
  assert.equal(course.match(/^::: narration$/gm)?.length, deck.frames.length, "every course slide is narrated");
  assert.equal(PM.courseDeck(17), course);
  const seq = PM.switchSequence(E);
  assert.match(seq, /focus: bad event A_7 and its dependency neighbourhood/);
  assert.match(seq, /module: local-lemma\nscene: [a-z-]+\nframe: 0\nswitch: 0\nseed: 17/);
  assert.doesNotMatch(seq, /focus: node-\d|state: \d+$/m, "no opaque ids alone");
});

test("maths text renders without leftover LaTeX", () => {
  for (const m of PM.MODULES) for (const t of [m.boundTex, m.variableTex]) assert.doesNotMatch(PM.texToText(t), /\\[A-Za-z]/, `${m.id}: ${PM.texToText(t)}`);
  assert.equal(PM.texToText("\\binom{n}{k}2^{1-\\binom k2}"), "C(n,k)2^(1−C(k,2))");
  assert.equal(PM.texToText("e\\,p\\,(d+1)\\le 1"), "e p (d+1)≤ 1");
  assert.match(PM.renderMarkdown("a\n\n. . .\n\nb", 0), /class="step later" data-step="1"/);
});

/* ---------- the page ---------- */

test("the page boots, registers read-only WebMCP tools and exports the deck of the page as set", async () => {
  const page = await openPage("probabilistic-method", { hash: "#local-lemma/hypergraph-colouring?k=5&s=1&seed=17" });
  const tools = page.run("self.ProbabilisticMethodTools");
  deq(tools.map((/** @type {WebMcpTool} */ t) => t.name), ["get_metadata", "get_current_state", "analyse_technique", "export_technique_deck", "run_self_tests"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  const meta = JSON.parse((await tools[0].execute()).content[0].text);
  assert.equal(meta.inventory.length, 92); assert.equal(meta.modules.length, 18);
  const state = JSON.parse((await tools[1].execute()).content[0].text);
  assert.equal(state.module, "local-lemma"); assert.equal(state.params.s, 1); assert.equal(state.params.k, 5);
  assert.ok(state.assumptions.some((/** @type {{ holds: boolean }} */ a) => !a.holds), "the broken condition is reported");
  const an = JSON.parse((await tools[2].execute({ module: "chernoff", params: { rho: 0.3 } })).content[0].text);
  assert.ok(an.assumptions.some((/** @type {{ holds: boolean }} */ a) => !a.holds));
  assert.match(JSON.parse((await tools[2].execute({ module: "nope" })).content[0].text).error, /Unknown module/);
  const expected = PM.techniqueDeck(PM.evaluate(lab("local-lemma"), PM.withParams(lab("local-lemma"), { k: 5, s: 1, seed: 17 })));
  assert.equal(JSON.parse((await tools[3].execute({ module: "local-lemma", params: { k: 5, s: 1 }, seed: 17 })).content[0].text).markdown, expected);
  await page.click("save-beamdswitch");
  deq(page.saved, [{ name: "probabilistic-method-local-lemma-beamdswitch.md", text: expected }]);
  await page.click("copy-beamdswitch");
  deq(page.copied, [expected]);
  await page.click("copy-course");
  assert.equal(page.copied[1], PM.courseDeck(17));
  const selfT = JSON.parse((await tools[4].execute()).content[0].text);
  assert.ok(selfT.every((/** @type {{ pass: boolean }} */ x) => x.pass));
});
