/* Entropy Methods in Combinatorics Lab: the lessons, as plain data (spec §80).
 *
 * One source of truth drives the lab, Guided and Problems modes, the presentation and the beamdswitch
 * export. Text is Markdown with TeX maths in $...$ or $$...$$ (rendered in the page by render.js);
 * `say` is plain spoken prose for narration. Every number is computed by EntropyLab at run time:
 * `example(E)` returns the finite check of each lesson, never a figure typed in by hand.
 */
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./engine.js") : root.EntropyLab);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EntropyLessons = api;
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";
  const f = (x, d = 3) => E.fmt(x, d);
  const c = (b) => E.fmtCount(b);

  /* Shared presets: the page's widgets and the finite checks read the same ones. */
  const MATCHINGS = {
    c6: { label: "Cycle C₆", adj: [[0, 1], [1, 2], [2, 0]] },
    k33: { label: "Complete K₃,₃", adj: [[0, 1, 2], [0, 1, 2], [0, 1, 2]] },
    ferrers: { label: "Ferrers board (degrees 2, 3, 4, 4)", adj: [[0, 1], [0, 1, 2], [0, 1, 2, 3], [0, 1, 2, 3]] },
    irregular: { label: "Irregular (degrees 2, 3, 2, 3)", adj: [[0, 1], [1, 2, 3], [0, 2], [0, 1, 3]] },
  };
  const POINTS3 = {
    staircase: { label: "Staircase x+y+z ≤ 2", pts: () => E.family("staircase", 3, 2) },
    box: { label: "Full 2×2×2 box (tight)", pts: () => E.product([2, 2, 2]) },
    cross: { label: "Three axes", pts: () => [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0], [0, 2, 0], [0, 0, 1], [0, 0, 2]] },
    slab: { label: "Slab with a notch", pts: () => E.product([3, 3, 2]).filter((t) => !(t[0] === 2 && t[1] === 2)) },
  };
  const FAMILY4 = {
    "cyclic-no-adjacent": { label: "No two cyclically adjacent ones", make: () => E.family("cyclic-no-adjacent", 4) },
    "even-weight": { label: "Even number of ones", make: () => E.family("even-weight", 4) },
    "all-binary": { label: "All of {0,1}⁴ (tight)", make: () => E.family("all-binary", 4) },
    "one-hot": { label: "Exactly one 1", make: () => E.family("one-hot", 4) },
  };
  const COVERS4 = {
    cycle: { label: "Cycle pairs {1,2},{2,3},{3,4},{4,1}", sets: [[0, 1], [1, 2], [2, 3], [3, 0]] },
    triples: { label: "All four triples", sets: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]] },
    singletons: { label: "Singletons (subadditivity)", sets: [[0], [1], [2], [3]] },
    halves: { label: "Two halves {1,2},{3,4}", sets: [[0, 1], [2, 3]] },
  };
  /* Candidate fractional covers of three coordinates (x, y, z). */
  const COVER_CANDIDATES = [
    { id: "lw", label: "Loomis–Whitney: ½ on each of xy, xz, yz", weights: [{ set: [0, 1], w: 0.5 }, { set: [0, 2], w: 0.5 }, { set: [1, 2], w: 0.5 }] },
    { id: "xy-z", label: "xy and z, weight 1 each", weights: [{ set: [0, 1], w: 1 }, { set: [2], w: 1 }] },
    { id: "singletons", label: "x, y, z, weight 1 each (subadditivity)", weights: [{ set: [0], w: 1 }, { set: [1], w: 1 }, { set: [2], w: 1 }] },
    { id: "xz-y", label: "xz and y, weight 1 each", weights: [{ set: [0, 2], w: 1 }, { set: [1], w: 1 }] },
    { id: "short", label: "xy and yz, weight ½ each (not a cover)", weights: [{ set: [0, 1], w: 0.5 }, { set: [1, 2], w: 0.5 }] },
  ];
  const HYPEREDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]];

  const L = [];
  const add = (lesson) => { L.push(lesson); return lesson; };

  /* ================= Foundations ================= */
  add({
    id: "counting", group: "Foundations", title: "Counting as information", short: "Counting", difficulty: 1, prereq: [],
    technique: "uniform random object",
    problem: "You have $N$ possible objects. How much information is required to specify one?",
    family: "Any finite family $\\mathcal F$ with $|\\mathcal F| = N$.",
    randomObject: "$X$ uniform on $\\mathcal F$.",
    variables: [{ sym: "X", space: "\\mathcal F", dist: "uniform", support: "N", role: "the object to identify" }],
    identity: "H(X)=\\log_2 |\\mathcal F|",
    theorem: "If $X$ is uniform on a finite set $\\mathcal F$ then $H(X)=\\log_2|\\mathcal F|$ bits.",
    proof: [
      { md: "A yes/no question halves the candidates at best, so $N=2^m$ objects need exactly $m$ questions.", why: "exact", say: "Each yes or no question can at best halve the candidates, so two to the m objects need exactly m questions." },
      { md: "$$H(X)=-\\sum_x \\tfrac1N\\log_2\\tfrac1N=\\log_2 N.$$", why: "definition", say: "For a uniform object the entropy formula collapses to the logarithm of the number of objects." },
      { md: "When $N$ is not a power of two, $\\log_2 N$ is fractional: it is the average number of bits per object over many independent copies.", why: "interpretation", say: "When N is not a power of two the answer is fractional, an average over many copies." },
    ],
    clever: "Replace the question “how many?” by “how many bits to name one?”",
    when: "Always: this identity is the bridge every later lesson crosses.",
    equality: "This is an identity, not an inequality.",
    slack: "None: no information is lost yet.",
    related: ["entropy", "compression"],
    hints: ["Think of a binary decision tree.", "How deep must it be to have $N$ leaves?", "Answer: $\\log_2 N$ bits, fractional on average."],
    widget: { type: "counting", N: 12 },
    example() {
      const rows = [2, 4, 8, 12, 1000].map((N) => ({ label: `N = ${N}`, exact: BigInt(N), bound: Math.pow(2, Math.log2(N)), bits: Math.log2(N), depth: Math.ceil(Math.log2(N)) }));
      return { rows, md: rows.map((r) => `- $N=${r.exact}$: $\\log_2 N = ${f(r.bits)}$ bits, tree depth ${r.depth}`).join("\n"), say: `Two objects need ${f(rows[0].bits)} bit, eight need ${f(rows[2].bits)}, and twelve need ${f(rows[3].bits)}.` };
    },
  });

  add({
    id: "entropy", group: "Foundations", title: "Entropy of a finite distribution", short: "Entropy", difficulty: 1, prereq: ["counting"],
    technique: "maximum entropy",
    problem: "Which distribution on $N$ outcomes is hardest to predict?",
    family: "Distributions $p$ on a set of $N$ outcomes.",
    randomObject: "$X$ with $\\Pr[X=x]=p(x)$.",
    variables: [{ sym: "X", space: "\\{1,\\ldots,N\\}", dist: "p", support: "\\le N", role: "a non-uniform object" }],
    identity: "H(X)=-\\sum_x p(x)\\log_2 p(x)",
    theorem: "$H(X)\\le\\log_2|\\operatorname{supp} X|$, with equality if and only if $X$ is uniform on its support.",
    proof: [
      { md: "$$H(X)=\\sum_x p(x)\\log_2\\frac1{p(x)}$$ is an average of surprisals.", why: "definition", say: "Entropy is the average surprise of the outcome." },
      { md: "$\\log$ is concave, so by Jensen $$\\sum_x p(x)\\log\\frac1{p(x)}\\le\\log\\sum_x p(x)\\frac1{p(x)}=\\log|\\operatorname{supp}X|.$$", why: "Jensen", say: "The logarithm is concave, so the average of logs is at most the log of the average, which is the log of the support size." },
      { md: "Equality in Jensen needs $1/p(x)$ constant: $X$ uniform.", why: "equality case", say: "Equality needs every probability equal, which is the uniform distribution." },
    ],
    clever: "Read entropy as an average description length, then let concavity cap it.",
    when: "Whenever a coordinate takes few values: its entropy is at most the log of that number.",
    equality: "$H(X)=\\log|\\operatorname{supp}X|$ iff $X$ is uniform.",
    slack: "The gap $\\log N-H(X)$ is the KL divergence from uniform.",
    related: ["support-bound", "kl-divergence"],
    hints: ["Write entropy as an expectation.", "Which inequality moves a concave function outside an expectation?", "Jensen gives $H\\le\\log N$, equality iff uniform."],
    widget: { type: "distribution", weights: [6, 3, 2, 1], cap: true },
    example() {
      const P = [6, 3, 2, 1], H = E.entropyCounts(P);
      return { rows: [{ label: "p = (6,3,2,1)/12", bits: H, bound: Math.log2(4) }, { label: "uniform on 4", bits: 2, bound: 2 }],
        md: `- $p=(6,3,2,1)/12$: $H=${f(H)}$ bits $\\le \\log_2 4 = 2$\n- uniform: $H=2$ bits, equality`, say: `The weights six, three, two and one give ${f(H)} bits, below the two bits of the uniform distribution.` };
    },
  });

  add({
    id: "support-bound", group: "Foundations", title: "The support-size bound", short: "Support bound", difficulty: 1, prereq: ["entropy"],
    technique: "support-size entropy bound",
    problem: "A combinatorial coordinate can take at most $d$ values. How much can it say?",
    family: "A coordinate $X_i\\in S_i$ with $|S_i|=d$.",
    randomObject: "$X_i$, a coordinate of a uniformly random object.",
    variables: [{ sym: "X_i", space: "S_i", dist: "induced by the object", support: "\\le d", role: "a local coordinate" }],
    identity: "H(X_i)\\le\\log|S_i|",
    theorem: "If $X_i$ takes values in $S_i$ then $H(X_i)\\le\\log_2|S_i|$.",
    proof: [
      { md: "$\\operatorname{supp}X_i\\subseteq S_i$.", why: "exact", say: "The coordinate only takes allowed symbols." },
      { md: "$$H(X_i)\\le\\log|\\operatorname{supp}X_i|\\le\\log|S_i|.$$", why: "support bound", say: "So its entropy is at most the log of the number of allowed symbols." },
    ],
    clever: "Bound each local piece by counting its alphabet, never its distribution.",
    when: "As the last, local step of almost every entropy proof.",
    equality: "Equality iff $X_i$ is uniform on all of $S_i$.",
    slack: "Unused symbols and non-uniform marginals both leave slack.",
    related: ["subadditivity", "shearer"],
    hints: ["What is the largest entropy on $d$ outcomes?"],
    widget: { type: "distribution", weights: [3, 3, 1, 1], cap: true, symbols: ["a", "b", "c", "d"] },
    example() {
      const H = E.entropyCounts([3, 3, 1, 1]);
      return { rows: [{ label: "X ∈ {a,b,c,d}, weights 3,3,1,1", bits: H, bound: 2 }], md: `- $X_i\\in\\{a,b,c,d\\}$ with weights $3,3,1,1$: $H=${f(H)}\\le 2$ bits`, say: `This coordinate carries ${f(H)} bits, under the cap of two bits for four symbols.` };
    },
  });

  add({
    id: "joint-entropy", group: "Foundations", title: "Joint entropy", short: "Joint entropy", difficulty: 2, prereq: ["support-bound"],
    technique: "joint entropy",
    problem: "A family of pairs occupies some cells of a grid. Is describing $X$ and $Y$ separately wasteful?",
    family: "A set $\\mathcal F\\subseteq S_X\\times S_Y$ of occupied cells.",
    randomObject: "$(X,Y)$ uniform on the occupied cells.",
    variables: [{ sym: "(X,Y)", space: "S_X\\times S_Y", dist: "uniform on \\mathcal F", support: "|\\mathcal F|", role: "the pair" }],
    identity: "H(X,Y)=\\log|\\mathcal F|",
    theorem: "$H(X,Y)\\le H(X)+H(Y)$, with equality iff $X$ and $Y$ are independent.",
    proof: [
      { md: "$H(X,Y)=H(X)+H(Y\\mid X)$.", why: "chain rule", say: "Describe X first, then Y given X." },
      { md: "$H(Y\\mid X)\\le H(Y)$.", why: "conditioning", say: "Knowing X can only help describe Y." },
      { md: "$$\\log|\\mathcal F|=H(X,Y)\\le H(X)+H(Y).$$", why: "combine", say: "So the log of the number of occupied cells is at most the sum of the separate entropies." },
    ],
    clever: "Correlation is information you would pay for twice if you described coordinates separately.",
    when: "When an object splits into a few parts that are individually easy to count.",
    equality: "Independent coordinates: the occupied cells form a product.",
    slack: "The slack is exactly $I(X;Y)$.",
    related: ["mutual-information", "subadditivity", "chain-rule"],
    hints: ["Use the chain rule, then drop the conditioning."],
    widget: { type: "joint", cells: [[1, 1, 0], [0, 1, 1]], preset: "staircase" },
    example() {
      const s = E.jointStats([[1, 1, 0], [0, 1, 1]]);
      return { rows: [{ label: "4 occupied cells", bits: s.HXY, bound: s.HX + s.HY }], md: `- 4 occupied cells: $H(X,Y)=${f(s.HXY)}$, $H(X)+H(Y)=${f(s.HX + s.HY)}$ bits`, say: `${s.occupied} cells give ${f(s.HXY)} bits jointly, against ${f(s.HX + s.HY)} bits described separately.` };
    },
  });

  add({
    id: "chain-rule", group: "Foundations", title: "The chain rule", short: "Chain rule", difficulty: 2, prereq: ["joint-entropy"],
    technique: "chain rule",
    problem: "Reveal an object coordinate by coordinate. How much does each reveal tell you?",
    family: "The $24$ permutations of $\\{1,2,3,4\\}$, written as $(X_1,X_2,X_3,X_4)$.",
    randomObject: "A uniformly random permutation $X$.",
    variables: [{ sym: "X_i", space: "\\{1,\\ldots,4\\}", dist: "uniform marginal", support: "4", role: "the image of i" },
      { sym: "X_{<i}", space: "earlier images", dist: "joint", support: "", role: "what is already known" }],
    identity: "H(X)=\\log 24",
    theorem: "$$H(X_1,\\ldots,X_n)=\\sum_{i=1}^n H(X_i\\mid X_1,\\ldots,X_{i-1}).$$",
    proof: [
      { md: "$H(X,Y)=H(X)+H(Y\\mid X)$ for two variables.", why: "definition", say: "For two variables the joint entropy is the first plus the second given the first." },
      { md: "Apply it to $(X_1,\\ldots,X_{i-1})$ and $X_i$, repeatedly.", why: "induction", say: "Apply it again and again, peeling one coordinate at a time." },
      { md: "For permutations: $\\log 24=\\log 4+\\log 3+\\log 2+\\log 1$.", why: "exact", say: "For permutations of four, the reveals cost log four, log three, log two and nothing." },
    ],
    clever: "Pay for each coordinate only what the earlier ones leave unknown.",
    when: "When choices are made one after another and each depends on the earlier ones.",
    equality: "An identity: no slack until you bound a term.",
    slack: "Slack appears only when a conditional term is replaced by something larger.",
    related: ["conditioning", "random-reveal", "perfect-matchings"],
    hints: ["Two variables first.", "Induct on $n$."],
    widget: { type: "reveal", family: "permutations", n: 4 },
    example() {
      const F = E.family("permutations", 4), r = E.chainRule(F, [0, 1, 2, 3], F[10]);
      return { rows: r.steps.map((s, i) => ({ label: `X${i + 1}`, before: s.before, after: s.after, bits: s.cond })),
        md: r.steps.map((s, i) => `- reveal $X_${i + 1}$: ${s.before} → ${s.after} compatible, $H(X_${i + 1}\\mid X_{<${i + 1}})=${f(s.cond)}$`).join("\n"),
        say: `The compatible permutations shrink through ${r.steps.map((s) => s.before).join(", ")} to ${r.steps.at(-1).after}, and the costs add up to ${f(r.total)} bits.` };
    },
  });

  add({
    id: "conditioning", group: "Foundations", title: "Conditioning reduces entropy", short: "Conditioning", difficulty: 2, prereq: ["chain-rule"],
    technique: "conditioning reduces entropy",
    problem: "Revealing $Y$ shrinks the possible values of $X$. Can it ever make $X$ harder to describe on average?",
    family: "Binary strings of length 5 with no two adjacent ones ($13$ strings).",
    randomObject: "A uniformly random such string.",
    variables: [{ sym: "X_i", space: "\\{0,1\\}", dist: "marginal", support: "2", role: "the coordinate described" },
      { sym: "X_j", space: "\\{0,1\\}", dist: "marginal", support: "2", role: "the coordinate conditioned on" }],
    identity: "H(X)=\\log 13",
    theorem: "$H(X\\mid Y)\\le H(X)$, with equality iff $X$ and $Y$ are independent.",
    proof: [
      { md: "$H(X)-H(X\\mid Y)=I(X;Y)$.", why: "definition", say: "The drop is the mutual information." },
      { md: "$I(X;Y)=D(P_{XY}\\|P_XP_Y)\\ge0$.", why: "Gibbs", say: "Mutual information is a KL divergence, which is never negative." },
      { md: "So a complicated $H(X_i\\mid\\text{past})$ may always be replaced by the simpler $H(X_i)$.", why: "proof move", say: "So any complicated conditional term can be replaced by a simpler unconditional upper bound." },
    ],
    clever: "Throw away conditioning you cannot compute; it only costs slack, never validity.",
    when: "To simplify a chain-rule term into something local.",
    equality: "Independence.",
    slack: "Exactly $I(X;Y)$ per dropped condition.",
    related: ["mutual-information", "subadditivity"],
    hints: ["Compare the difference with mutual information."],
    widget: { type: "reveal", family: "no-adjacent", n: 5, focus: true },
    example() {
      const F = E.family("no-adjacent", 5), a = E.Hproj(F, [1]), b = E.Hcond(F, [1], [0]);
      return { rows: [{ label: "H(X₂)", bits: a }, { label: "H(X₂ | X₁)", bits: b }], md: `- $H(X_2)=${f(a)}$, $H(X_2\\mid X_1)=${f(b)}$ bits`, say: `The second coordinate carries ${f(a)} bits alone and ${f(b)} bits once the first is known.` };
    },
  });

  add({
    id: "subadditivity", group: "Foundations", title: "Subadditivity as a counting theorem", short: "Subadditivity", difficulty: 2, prereq: ["conditioning"],
    technique: "subadditivity",
    problem: "Every object is determined by coordinates $X_1,\\ldots,X_n$. Bound $|\\mathcal F|$ by the coordinate supports.",
    family: "Binary strings of length 5 with no two adjacent ones.",
    randomObject: "$X$ uniform on $\\mathcal F$.",
    variables: [{ sym: "X_i", space: "\\{0,1\\}", dist: "marginal", support: "2", role: "coordinate" }],
    identity: "\\log|\\mathcal F|=H(X)",
    theorem: "$$|\\mathcal F|\\le\\prod_i|\\operatorname{supp}X_i|,\\quad\\text{indeed }\\log|\\mathcal F|\\le\\sum_i H(X_i).$$",
    proof: [
      { md: "$\\log|\\mathcal F|=H(X)=\\sum_i H(X_i\\mid X_{<i})$.", why: "uniform + chain rule", say: "The log of the count is the entropy, which the chain rule splits into conditional terms." },
      { md: "$\\le\\sum_i H(X_i)$.", why: "conditioning", say: "Drop every condition." },
      { md: "$\\le\\sum_i\\log|\\operatorname{supp}X_i|$.", why: "support bound", say: "Bound each coordinate by its support." },
      { md: "Exponentiate: $|\\mathcal F|\\le\\prod_i|\\operatorname{supp}X_i|$.", why: "exponentiate", say: "Exponentiate to get a product bound." },
    ],
    clever: "Forget all correlations at once; the middle line, with real marginal entropies, is often much sharper than the product.",
    when: "When coordinates are nearly independent, or as a first sanity bound.",
    equality: "Product families with uniform coordinates.",
    slack: "Correlation slack, then non-uniform-marginal slack.",
    related: ["shearer", "binomial", "set-systems"],
    hints: ["Chain rule, then drop conditioning, then the support bound."],
    widget: { type: "reveal", family: "no-adjacent", n: 5, ledger: true },
    example() {
      const s = E.subadditivity(E.family("no-adjacent", 5));
      return { rows: [{ label: "|F|", exact: s.size, bound: s.entropyCount, naive: s.product }],
        md: `- $|\\mathcal F|=${c(s.size)}$, $H=${f(s.H)}$\n- $\\sum_i H(X_i)=${f(s.sumH)}$, so $|\\mathcal F|\\le ${f(s.entropyCount, 4)}$\n- $\\sum_i\\log|\\operatorname{supp}X_i|=${f(s.sumLog)}$, so $|\\mathcal F|\\le ${c(s.product)}$`,
        say: `${c(s.size)} strings, against ${f(s.entropyCount, 4)} from marginal entropies and ${c(s.product)} from supports.` };
    },
  });

  add({
    id: "constrained-strings", group: "Foundations", title: "Binary strings with constraints", short: "Constrained strings", difficulty: 2, prereq: ["subadditivity"],
    technique: "conditional entropy",
    problem: "Count binary strings of length $n$ with no two adjacent ones, using conditional entropy.",
    family: "$\\mathcal F_n$, the strings with no $11$.",
    randomObject: "$X=(X_1,\\ldots,X_n)$ uniform on $\\mathcal F_n$.",
    variables: [{ sym: "X_i", space: "\\{0,1\\}", dist: "marginal", support: "2", role: "bit i" }],
    identity: "\\log|\\mathcal F_n|=H(X)",
    theorem: "$$\\log|\\mathcal F_n|\\le H(X_1)+\\sum_{i\\ge2}H(X_i\\mid X_{i-1})\\le\\sum_i H(X_i)\\le n.$$",
    proof: [
      { md: "Chain rule: $H(X)=\\sum_i H(X_i\\mid X_{<i})$.", why: "chain rule", say: "Split the entropy along the string." },
      { md: "Keep only the previous bit: $H(X_i\\mid X_{<i})\\le H(X_i\\mid X_{i-1})$.", why: "conditioning", say: "Keep only the previous bit, which is where the constraint lives." },
      { md: "Dropping that too gives subadditivity, and $H(X_i)\\le1$ gives the naive $2^n$.", why: "support bound", say: "Dropping it as well gives subadditivity, and then the naive two to the n." },
    ],
    clever: "Drop only the dependence you cannot afford to keep: the constraint is local, so keep one neighbour.",
    when: "When the constraint is local along an order.",
    equality: "The Markov bound is tight when the family is a Markov chain with the matching marginals.",
    slack: "Each dropped neighbour costs its mutual information.",
    related: ["chain-rule", "colourings"],
    hints: ["Use the chain rule along the string.", "Which earlier bit actually constrains $X_i$?", "Keep $X_{i-1}$, drop the rest."],
    widget: { type: "strings", n: 8 },
    example() {
      const F = E.family("no-adjacent", 8), n = 8;
      const markov = E.Hproj(F, [0]) + E.range(n - 1).reduce((a, i) => a + E.Hcond(F, [i + 1], [i]), 0);
      const sub = E.subadditivity(F).sumH;
      return { rows: [{ label: "n = 8", exact: BigInt(F.length), bound: Math.pow(2, markov), naive: 256n }],
        md: `- $n=8$: exact ${F.length}; Markov bound $2^{${f(markov)}}=${f(Math.pow(2, markov), 4)}$; subadditivity $2^{${f(sub)}}=${f(Math.pow(2, sub), 4)}$; naive $256$`,
        say: `For length eight there are ${F.length} strings. Keeping one neighbour gives ${f(Math.pow(2, markov), 4)}, dropping it gives ${f(Math.pow(2, sub), 4)}, and the naive bound is 256.` };
    },
  });

  add({
    id: "binary-entropy", group: "Binomial", title: "The binary entropy function", short: "Binary entropy", difficulty: 2, prereq: ["entropy"],
    technique: "binary entropy",
    problem: "How fast does $\\binom{n}{pn}$ grow?",
    family: "The $pn$-subsets of $[n]$.",
    randomObject: "A Bernoulli($p$) bit.",
    variables: [{ sym: "B", space: "\\{0,1\\}", dist: "\\mathrm{Bernoulli}(p)", support: "2", role: "one indicator" }],
    identity: "h(p)=-p\\log_2p-(1-p)\\log_2(1-p)",
    theorem: "$h$ is concave with maximum $h(1/2)=1$, and $\\binom{n}{pn}=2^{nh(p)+O(\\log n)}$.",
    proof: [
      { md: "$h(p)=H(B)$ for $B\\sim\\mathrm{Bernoulli}(p)$; the maximum entropy on two outcomes is at $p=1/2$.", why: "max entropy", say: "The binary entropy is the entropy of a biased coin, largest for a fair coin." },
      { md: "Upper bound $\\binom{n}{pn}\\le2^{nh(p)}$: see the binomial lesson.", why: "subadditivity", say: "The upper bound is the next lesson." },
      { md: "Lower bound $\\binom{n}{pn}\\ge\\frac{2^{nh(p)}}{n+1}$: the $pn$ layer is the most likely of $n+1$ layers.", why: "types", say: "The lower bound holds because the matching layer is the most likely of n plus one layers." },
    ],
    clever: "Read a binomial coefficient as the number of typical strings of a biased coin.",
    when: "Whenever binomial coefficients appear in an exponent.",
    equality: "$h(1/2)=1$ only.",
    slack: "Polynomial, at most a factor $n+1$.",
    related: ["binomial", "typical-set", "antichains"],
    hints: ["Plot $h$.", "Compare $\\log_2\\binom{n}{pn}$ with $nh(p)$."],
    widget: { type: "hcurve", n: 10, p: 0.3 },
    example() {
      const b = E.binomialBound(10, 3);
      return { rows: [{ label: "C(10,3)", exact: b.exact, bound: b.bound, ratio: b.ratio }],
        md: `- $h(0.3)=${f(E.h(0.3), 4)}$\n- $\\binom{10}{3}=${c(b.exact)}\\le2^{10h(0.3)}=${f(b.bound, 4)}$`, say: `The binomial ten choose three is ${c(b.exact)}, below the entropy bound ${f(b.bound, 4)}.` };
    },
  });

  add({
    id: "binomial", group: "Binomial", title: "Entropy proof of the binomial bound", short: "Binomial bound", difficulty: 2, prereq: ["binary-entropy", "subadditivity"],
    technique: "indicator encoding",
    problem: "Bound $\\binom nk$.",
    family: "The $k$-subsets $S\\subseteq[n]$.",
    randomObject: "A uniformly random $k$-subset $S$.",
    variables: [{ sym: "X_i", space: "\\{0,1\\}", dist: "\\mathrm{Bernoulli}(k/n)", support: "2", role: "1 if i ∈ S" }],
    identity: "H(X_1,\\ldots,X_n)=\\log\\binom nk",
    theorem: "$$\\binom nk\\le2^{nh(k/n)}.$$",
    proof: [
      { md: "Encode $S$ by its indicators: $H(X_1,\\ldots,X_n)=\\log\\binom nk$.", why: "uniform", say: "Encode the subset by its n indicator bits. Their joint entropy is the log of n choose k." },
      { md: "$H(X)\\le\\sum_i H(X_i)$.", why: "subadditivity", say: "Forget the dependence between the bits." },
      { md: "By symmetry $\\Pr[X_i=1]=k/n$, so $H(X_i)=h(k/n)$.", why: "symmetry", say: "By symmetry each bit is one with probability k over n." },
      { md: "$\\log\\binom nk\\le nh(k/n)$; exponentiate.", why: "exponentiate", say: "So the log of n choose k is at most n times h of k over n. Exponentiate." },
    ],
    clever: "Encode a random $k$-subset using $n$ dependent Bernoulli coordinates, then deliberately forget their dependence.",
    when: "When a family is described by indicators whose marginals you know.",
    equality: "Only $k=0$ or $k=n$.",
    slack: "A polynomial factor, at most $n+1$: the dependence (exactly $k$ ones) is all that is forgotten.",
    related: ["set-systems", "kl-divergence", "typical-set"],
    hints: ["Choose a random $k$-subset.", "Describe it by indicator bits.", "What is each bit's marginal?", "Use subadditivity."],
    widget: { type: "boxes", n: 10, k: 3 },
    example() {
      const rows = [[10, 3], [9, 4], [12, 6]].map(([n, k]) => ({ label: `C(${n},${k})`, ...E.binomialBound(n, k) }));
      return { rows: rows.map((r) => ({ label: r.label, exact: r.exact, bound: r.bound, ratio: r.ratio })),
        md: rows.map((r) => `- $\\binom{${r.n}}{${r.k}}=${c(r.exact)}\\le2^{${r.n}h(${r.k}/${r.n})}=${f(r.bound, 4)}$, ratio ${f(r.ratio, 3)}`).join("\n"),
        say: `Ten choose three is ${c(rows[0].exact)} against ${f(rows[0].bound, 4)}, and nine choose four is ${c(rows[1].exact)} against ${f(rows[1].bound, 4)}.` };
    },
  });

  add({
    id: "mutual-information", group: "Binomial", title: "Mutual information", short: "Mutual information", difficulty: 2, prereq: ["joint-entropy"],
    technique: "mutual information",
    problem: "Let $X$ be uniform on $\\{0,\\ldots,7\\}$ and $Y$ its parity. How much does $Y$ tell you about $X$?",
    family: "Pairs $(x,f(x))$.",
    randomObject: "$X$ uniform, $Y=f(X)$.",
    variables: [{ sym: "X", space: "\\{0,\\ldots,7\\}", dist: "uniform", support: "8", role: "the object" }, { sym: "Y", space: "\\{0,1\\}", dist: "induced", support: "2", role: "a feature" }],
    identity: "I(X;Y)=H(X)+H(Y)-H(X,Y)",
    theorem: "$I(X;Y)=H(X)-H(X\\mid Y)\\ge0$: how much knowing one variable reduces uncertainty about the other.",
    proof: [
      { md: "$I(X;Y)=H(X)-H(X\\mid Y)$ by the chain rule.", why: "chain rule", say: "Mutual information is the drop in uncertainty about X once Y is known." },
      { md: "Parity: $H(X)=3$, $H(X\\mid Y)=2$, so $I=1$ bit.", why: "exact", say: "For the parity, X has three bits, two remain after the parity, so the parity is worth one bit." },
    ],
    clever: "Treat dependence as a resource: it is exactly what a cleverer encoding can avoid paying for twice.",
    when: "To measure the slack in subadditivity, or the value of a side variable.",
    equality: "$I=0$ iff independent.",
    slack: "This is the slack of subadditivity for two variables.",
    related: ["joint-entropy", "data-processing", "kl-divergence"],
    hints: ["Compute $H(X\\mid Y)$ by counting the values of $X$ in each parity class."],
    widget: { type: "joint", preset: "parity" },
    example() {
      const t = E.range(8).map((x) => [x % 2 ? 0 : 1, x % 2 ? 1 : 0]), s = E.jointStats(t);
      return { rows: [{ label: "I(X; parity)", bits: s.I }], md: `- $H(X)=${f(s.HX)}$, $H(X\\mid Y)=${f(s.HXgY)}$, $I(X;Y)=${f(s.I)}$ bit`, say: `The parity is worth ${f(s.I)} bit about X.` };
    },
  });

  add({
    id: "kl-divergence", group: "Binomial", title: "KL divergence and Gibbs' inequality", short: "KL divergence", difficulty: 3, prereq: ["entropy"],
    technique: "KL divergence",
    problem: "Turn the entropy bound for $\\binom nk$ into the familiar $(en/k)^k$.",
    family: "Distributions on a finite set.",
    randomObject: "$X\\sim P$, compared with a reference $Q$.",
    variables: [{ sym: "X", space: "\\Omega", dist: "P", support: "", role: "the object" }],
    identity: "D(P\\|Q)=\\sum_x p(x)\\log\\frac{p(x)}{q(x)}\\ge0",
    theorem: "$D(P\\|Q)\\ge0$, hence entropy maximisation; and $\\binom nk\\le2^{nh(k/n)}\\le(en/k)^k$.",
    proof: [
      { md: "$-D(P\\|Q)=\\sum p\\log\\frac qp\\le\\log\\sum q=0$.", why: "Jensen", say: "By Jensen the divergence is never negative." },
      { md: "With $Q$ uniform: $D(P\\|U)=\\log N-H(P)$, so the uniform distribution maximises entropy.", why: "Gibbs", say: "Against the uniform distribution this is the maximum entropy principle." },
      { md: "$nh(k/n)=k\\log\\frac nk+(n-k)\\log\\frac n{n-k}\\le k\\log\\frac nk+k\\log e$ since $\\ln(1+x)\\le x$.", why: "analytic", say: "A one line estimate of the second term turns the entropy bound into e n over k to the k." },
    ],
    clever: "Compare with a reference distribution and let non-negativity do the work.",
    when: "To maximise entropy under constraints, or to simplify an entropy exponent.",
    equality: "$P=Q$.",
    slack: "$(en/k)^k$ is looser than $2^{nh(k/n)}$: analytic convenience costs constants.",
    related: ["binomial", "entropy"],
    hints: ["Use Jensen on $\\log$.", "Bound $(1-k/n)\\log\\frac1{1-k/n}$."],
    widget: { type: "distribution", weights: [5, 3, 1, 1], reference: [1, 1, 1, 1], kl: true },
    example() {
      const b = E.binomialBound(10, 3), d = E.kl([5, 3, 1, 1], [1, 1, 1, 1]);
      return { rows: [{ label: "C(10,3)", exact: b.exact, bound: b.bound, naive: b.ek }],
        md: `- $D(P\\|U)=${f(d)}=2-H(P)$ bits for $P\\propto(5,3,1,1)$\n- $\\binom{10}{3}=${c(b.exact)}\\le${f(b.bound, 4)}\\le(10e/3)^3=${f(b.ek, 4)}$`,
        say: `Ten choose three is ${c(b.exact)}, the entropy bound is ${f(b.bound, 4)} and the simpler e n over k bound is ${f(b.ek, 4)}.` };
    },
  });

  /* ================= Projections ================= */
  add({
    id: "shearer", group: "Projections", title: "Shearer's inequality", short: "Shearer", difficulty: 3, prereq: ["subadditivity"],
    technique: "Shearer's inequality",
    problem: "Subsets $A_1,\\ldots,A_m\\subseteq[n]$ cover every coordinate at least $r$ times. Bound $H(X)$ by the entropies of the views $X_{A_j}$.",
    family: "A family $\\mathcal F\\subseteq\\{0,1\\}^4$ and a cover of $\\{1,2,3,4\\}$.",
    randomObject: "$X$ uniform on $\\mathcal F$.",
    variables: [{ sym: "X_{A_j}", space: "\\{0,1\\}^{A_j}", dist: "projection", support: "|\\mathcal F_{A_j}|", role: "a partial view" }],
    identity: "H(X)=\\log|\\mathcal F|",
    theorem: "$$rH(X)\\le\\sum_{j=1}^m H(X_{A_j}).$$",
    proof: [
      { md: "Chain rule inside each view, in the global order: $H(X_{A})=\\sum_{i\\in A}H(X_i\\mid X_{A\\cap[i-1]})$.", why: "chain rule", say: "Inside each view, use the chain rule in the global order of coordinates." },
      { md: "$H(X_i\\mid X_{A\\cap[i-1]})\\ge H(X_i\\mid X_{[i-1]})$.", why: "conditioning", say: "Conditioning on more of the past can only lower each term." },
      { md: "$$\\sum_j H(X_{A_j})\\ge\\sum_j\\sum_{i\\in A_j}H(X_i\\mid X_{<i})\\ge r\\sum_iH(X_i\\mid X_{<i})=rH(X).$$", why: "cover", say: "Each coordinate appears in at least r views, so the views together pay for the whole object at least r times." },
    ],
    clever: "Describe the same information through overlapping partial views.",
    when: "When projections are easy to count but the family is not.",
    equality: "Product families (all of $\\{0,1\\}^4$) make every step an equality.",
    slack: "Correlations inside each view and over-coverage both add slack.",
    related: ["combinatorial-shearer", "loomis-whitney", "fractional-cover", "cover-builder"],
    hints: ["Expand every $H(X_{A_j})$ by the chain rule.", "Compare each term with the global chain rule.", "Count how often each coordinate appears."],
    widget: { type: "cover", family: "cyclic-no-adjacent", cover: "cycle" },
    example() {
      const s = E.shearer(FAMILY4["cyclic-no-adjacent"].make(), COVERS4.cycle.sets);
      return { rows: [{ label: "cyclic, cycle cover", exact: s.size, bound: s.bound, r: s.r }],
        md: `- $|\\mathcal F|=${c(s.size)}$, coverage $r=${s.r}$\n- $${s.r}H(X)=${f(s.rH)}\\le\\sum_jH(X_{A_j})=${f(s.sumH)}$ bits\n- $|\\mathcal F|\\le2^{${f(s.sumH)}/${s.r}}=${f(s.bound, 4)}$`,
        say: `${c(s.size)} strings with every coordinate covered ${s.r} times: twice the entropy is ${f(s.rH)} bits, the views carry ${f(s.sumH)}, so the family has at most ${f(s.bound, 4)} members.` };
    },
  });

  add({
    id: "combinatorial-shearer", group: "Projections", title: "Combinatorial Shearer lemma", short: "Combinatorial Shearer", difficulty: 3, prereq: ["shearer"],
    technique: "combinatorial Shearer",
    problem: "Bound a family of grid points by the sizes of its projections.",
    family: "$\\mathcal F\\subseteq S_1\\times S_2\\times S_3$ with projections $\\mathcal F_{A}$.",
    randomObject: "A uniformly random point of $\\mathcal F$.",
    variables: [{ sym: "X_A", space: "\\mathcal F_A", dist: "projection", support: "|\\mathcal F_A|", role: "a shadow" }],
    identity: "H(X)=\\log|\\mathcal F|",
    theorem: "$$|\\mathcal F|^r\\le\\prod_j|\\mathcal F_{A_j}|.$$",
    proof: [
      { md: "Shearer: $r\\log|\\mathcal F|=rH(X)\\le\\sum_jH(X_{A_j})$.", why: "Shearer", say: "Start from Shearer's inequality." },
      { md: "$H(X_{A_j})\\le\\log|\\mathcal F_{A_j}|$.", why: "support bound", say: "Each view takes at most as many values as the projection has points." },
      { md: "Exponentiate.", why: "exponentiate", say: "Exponentiate to get a pure counting statement." },
    ],
    clever: "Bound each view's entropy by the size of its shadow.",
    when: "When you can count shadows exactly.",
    equality: "Boxes $S_1\\times S_2\\times S_3$.",
    slack: "Shearer slack plus non-uniform shadows.",
    related: ["shearer", "loomis-whitney", "projection"],
    hints: ["Shearer, then the support bound."],
    widget: { type: "grid3", preset: "slab", cover: "pairs" },
    example() {
      const s = E.shearer(POINTS3.slab.pts(), [[0, 1], [0, 2], [1, 2]]);
      return { rows: [{ label: "slab", exact: s.lhs, bound: Number(s.rhs) }], md: `- $|\\mathcal F|=${c(s.size)}$, shadows ${s.parts.map((p) => p.size).join(", ")}\n- $|\\mathcal F|^2=${c(s.lhs)}\\le${c(s.rhs)}$`,
        say: `The notched slab has ${c(s.size)} points. Its square, ${c(s.lhs)}, is at most the product of the shadows, ${c(s.rhs)}.` };
    },
  });

  add({
    id: "loomis-whitney", group: "Projections", title: "The Loomis–Whitney inequality", short: "Loomis–Whitney", difficulty: 3, prereq: ["combinatorial-shearer"],
    technique: "Loomis–Whitney",
    problem: "A finite set of lattice points casts three shadows. How large can it be?",
    family: "$S\\subseteq\\mathbb Z^3$, finite.",
    randomObject: "$X$ uniform on $S$.",
    variables: [{ sym: "\\pi_i(X)", space: "\\pi_i(S)", dist: "projection", support: "|\\pi_i S|", role: "delete coordinate i" }],
    identity: "H(X)=\\log|S|",
    theorem: "$$|S|^{d-1}\\le\\prod_{i=1}^d|\\pi_i(S)|,\\qquad |S|^2\\le|\\pi_{xy}S|\\,|\\pi_{xz}S|\\,|\\pi_{yz}S|.$$",
    proof: [
      { md: "Each coordinate lies in exactly $d-1$ of the deletion projections.", why: "cover", say: "Each coordinate survives in exactly d minus one of the shadows." },
      { md: "$$(d-1)H(X)\\le\\sum_iH(\\pi_iX)\\le\\sum_i\\log|\\pi_i(S)|.$$", why: "Shearer + support", say: "Shearer with r equal to d minus one, then the support bound." },
      { md: "Exponentiate: $|S|^{d-1}\\le\\prod_i|\\pi_i(S)|$.", why: "exponentiate", say: "Exponentiate." },
    ],
    clever: "Recognise deletion projections as a cover with multiplicity $d-1$.",
    when: "Volume versus shadows; dense subsets of products.",
    equality: "Boxes.",
    slack: "Non-box shapes; skewed shadow distributions.",
    related: ["shearer", "projection", "edge-isoperimetric"],
    hints: ["How many times is each coordinate covered by the three shadows?"],
    widget: { type: "grid3", preset: "staircase", cover: "pairs" },
    example() {
      const w = E.loomisWhitney(POINTS3.staircase.pts()), b = E.loomisWhitney(POINTS3.box.pts());
      return { rows: [{ label: "staircase", exact: BigInt(w.size), bound: w.bound }, { label: "2×2×2 box", exact: BigInt(b.size), bound: b.bound }],
        md: `- staircase: $|S|=${w.size}$, shadows ${w.proj.map((p) => p.size).join(", ")}; $|S|^2=${c(w.lhs)}\\le${c(w.rhs)}$, $|S|\\le${f(w.bound, 4)}$\n- box: $|S|^2=${c(b.lhs)}=${c(b.rhs)}$, tight`,
        say: `The staircase has ${w.size} points and shadows of ${w.proj[0].size} each, so it could have had up to ${f(w.bound, 4)}. A box is tight.` };
    },
  });

  add({
    id: "edge-isoperimetric", group: "Projections", title: "Edges inside a subset of the cube", short: "Edge-isoperimetric", difficulty: 3, prereq: ["loomis-whitney"],
    technique: "projection inequalities",
    problem: "How many cube edges can a set $A\\subseteq\\{0,1\\}^n$ span?",
    family: "$A\\subseteq\\{0,1\\}^n$.",
    randomObject: "$X$ uniform on $A$.",
    variables: [{ sym: "X_i", space: "\\{0,1\\}", dist: "marginal", support: "2", role: "bit i" }],
    identity: "H(X)=\\log|A|",
    theorem: "$$e(A)\\le\\tfrac12|A|\\log_2|A|.$$",
    proof: [
      { md: "$H(X_i\\mid X_{-i})$ is $1$ bit at a point whose $i$-neighbour is in $A$, else $0$; averaging, $\\sum_iH(X_i\\mid X_{-i})=2e(A)/|A|$.", why: "exact", say: "Given all other bits, bit i is uncertain exactly when the edge in direction i stays inside A." },
      { md: "$\\sum_iH(X_i\\mid X_{-i})\\le\\sum_iH(X_i\\mid X_{<i})=H(X)$.", why: "conditioning + chain rule", say: "Conditioning on all other bits is more than on the earlier bits, and those add to the entropy." },
      { md: "$2e(A)/|A|\\le\\log|A|$.", why: "combine", say: "So twice the edges over the size is at most the log of the size." },
    ],
    clever: "Read edges as conditional uncertainty of one bit given all the others.",
    when: "Boundary and edge counting in product spaces.",
    equality: "Subcubes.",
    slack: "Non-subcube shapes.",
    related: ["loomis-whitney", "han"],
    hints: ["What is $H(X_i\\mid X_{-i})$ at a single point?"],
    widget: { type: "cube", n: 3, set: [0, 1, 2, 3, 4] },
    example() {
      const a = E.cubeEdges([0, 1, 2, 3, 4], 3), b = E.cubeEdges([0, 1, 2, 3], 3);
      return { rows: [{ label: "5 vertices", exact: BigInt(a.count), bound: a.bound }, { label: "a square", exact: BigInt(b.count), bound: b.bound }],
        md: `- 5 vertices: $e(A)=${a.count}\\le${f(a.bound, 4)}$\n- a square (subcube): $e(A)=${b.count}=${f(b.bound)}$, tight`, say: `Five vertices span at most ${f(a.bound, 4)} edges and the example spans ${a.count}. A square is tight.` };
    },
  });

  add({
    id: "data-processing", group: "Projections", title: "Forgetting information: data processing", short: "Data processing", difficulty: 2, prereq: ["subadditivity"],
    technique: "data processing",
    problem: "Projecting a family collapses objects together. Can the projection carry more information than the object?",
    family: "Permutations of 4 projected onto chosen coordinates.",
    randomObject: "$X$ uniform; $Y=f(X)$.",
    variables: [{ sym: "Y=f(X)", space: "f(\\mathcal F)", dist: "pushforward", support: "|f(\\mathcal F)|", role: "a projection" }],
    identity: "H(X)=\\log|\\mathcal F|",
    theorem: "$H(f(X))\\le H(X)$, and more generally $I(f(X);Z)\\le I(X;Z)$.",
    proof: [
      { md: "$H(X)=H(X,f(X))=H(f(X))+H(X\\mid f(X))\\ge H(f(X))$.", why: "chain rule", say: "X determines f of X, so the pair has the entropy of X, which splits into the image plus what the image forgets." },
      { md: "Combinatorially: forgetting coordinates cannot increase the number of distinguishable states.", why: "interpretation", say: "Forgetting coordinates cannot create new distinguishable states." },
    ],
    clever: "Every projection inequality starts by noticing the shadow is a function of the object.",
    when: "Behind every projection bound.",
    equality: "$f$ injective on $\\mathcal F$.",
    slack: "$H(X\\mid f(X))$, the average log fibre size.",
    related: ["shearer", "mutual-information"],
    hints: ["Use the chain rule on $(X,f(X))$."],
    widget: { type: "forget", family: "permutations", n: 4, keep: [0, 1] },
    example() {
      const r = E.forget(E.family("permutations", 4), [0, 1]);
      return { rows: [{ label: "keep X₁,X₂", exact: BigInt(r.image), bits: r.Himage }], md: `- ${r.size} permutations collapse to ${r.image} pairs $(X_1,X_2)$: $H(Y)=${f(r.Himage)}\\le H(X)=${f(r.H)}$`,
        say: `Keeping two coordinates collapses ${r.size} permutations onto ${r.image} images.` };
    },
  });

  add({
    id: "han", group: "Projections", title: "How much survives in k of n coordinates?", short: "Han averages", difficulty: 4, prereq: ["shearer"],
    technique: "information inequalities",
    problem: "Average the information in all $k$-coordinate views. How does it change with $k$?",
    family: "A family on $n=4$ coordinates.",
    randomObject: "$X$ uniform.",
    variables: [{ sym: "X_A", space: "|A|=k", dist: "projection", support: "", role: "a k-view" }],
    identity: "h_k=\\frac1{\\binom nk}\\sum_{|A|=k}\\frac{H(X_A)}k",
    theorem: "$h_1\\ge h_2\\ge\\cdots\\ge h_n=H(X)/n$ (Han's inequality).",
    proof: [
      { md: "Shearer with all $k$-sets ($r=\\binom{n-1}{k-1}$) gives $h_k\\ge h_n$.", why: "Shearer", say: "Shearer with every k set already shows the k views average at least the full rate." },
      { md: "Applying the same argument inside each $(k+1)$-set gives $h_k\\ge h_{k+1}$.", why: "Shearer, locally", say: "The same argument inside each slightly larger set gives the whole monotone chain." },
    ],
    clever: "Average over all views so symmetry does the bookkeeping.",
    when: "When you need every subset size at once.",
    equality: "Independent coordinates: all $h_k$ equal.",
    slack: "Dependence between coordinates.",
    related: ["shearer", "fractional-cover"],
    hints: ["Use all $k$-subsets as a Shearer cover."],
    widget: { type: "han", family: "cyclic-no-adjacent" },
    example() {
      const r = E.han(FAMILY4["cyclic-no-adjacent"].make());
      return { rows: r.map((x) => ({ label: `k = ${x.k}`, bits: x.perCoord })), md: r.map((x) => `- $h_${x.k}=${f(x.perCoord)}$`).join("\n"),
        say: `The per coordinate information falls from ${f(r[0].perCoord)} to ${f(r[3].perCoord)} bits as views grow.` };
    },
  });

  add({
    id: "fractional-cover", group: "Projections", title: "Fractional covers", short: "Fractional covers", difficulty: 4, prereq: ["shearer"],
    technique: "fractional covers",
    problem: "Give each view $A$ a weight $\\alpha_A\\ge0$ so every coordinate has total weight at least 1. What bound follows?",
    family: "The staircase $S=\\{x+y+z\\le2\\}\\subseteq\\{0,1,2\\}^3$.",
    randomObject: "$X$ uniform on $S$.",
    variables: [{ sym: "\\alpha_A", space: "\\ge0", dist: "weights", support: "", role: "how much each view is trusted" }],
    identity: "H(X)=\\log|S|",
    theorem: "$$H(X)\\le\\sum_A\\alpha_AH(X_A)\\quad\\text{so}\\quad|\\mathcal F|\\le\\prod_A|\\mathcal F_A|^{\\alpha_A}.$$",
    proof: [
      { md: "Repeat Shearer's proof with weights: each $X_i\\mid X_{<i}$ is paid for $\\sum_{A\\ni i}\\alpha_A\\ge1$ times.", why: "weighted Shearer", say: "Repeat Shearer's proof with weights. Each coordinate is paid for at least once in total." },
      { md: "Support bound on each view, then exponentiate.", why: "support + exponentiate", say: "Bound each view by its shadow and exponentiate." },
    ],
    clever: "Shearer with $r$ is the uniform cover $\\alpha=1/r$; any fractional cover works.",
    when: "When the natural views overlap unevenly.",
    equality: "Product families with a tight cover.",
    slack: "Over-coverage and correlation inside views.",
    related: ["hypergraph", "cover-optimization", "shearer"],
    hints: ["Weight Shearer's proof."],
    widget: { type: "fractional", mode: "weights" },
    example() {
      const r = E.fractionalCover(POINTS3.staircase.pts(), COVER_CANDIDATES[0].weights);
      return { rows: [{ label: "½,½,½", exact: r.size, bound: r.countBound }], md: `- coverage ${r.coverage.map((x) => f(x)).join(", ")}; $|S|=${c(r.size)}\\le${f(r.countBound, 4)}$`,
        say: `Half weight on each pair covers every coordinate once and bounds the staircase by ${f(r.countBound, 4)}.` };
    },
  });

  add({
    id: "hypergraph", group: "Projections", title: "Entropy and hypergraphs", short: "Hypergraphs", difficulty: 4, prereq: ["fractional-cover"],
    technique: "hypergraph entropy",
    problem: "Coordinates are vertices and observed views are hyperedges. Which weightings give valid bounds?",
    family: "Cyclic strings of length 4 with no two adjacent ones.",
    randomObject: "$X$ uniform.",
    variables: [{ sym: "\\alpha_e", space: "\\ge0", dist: "edge weights", support: "", role: "a fractional edge cover" }],
    identity: "H(X)=\\log|\\mathcal F|",
    theorem: "$$\\min\\Big\\{\\sum_e\\alpha_e\\log|\\mathcal F_e|:\\sum_{e\\ni v}\\alpha_e\\ge1\\Big\\}\\ \\ge\\ \\log|\\mathcal F|.$$",
    proof: [
      { md: "Every feasible point of the covering LP is a fractional cover.", why: "fractional Shearer", say: "Every feasible weighting is a fractional cover, so it gives a valid bound." },
      { md: "Minimise the objective: the best entropy bound is a linear program.", why: "LP", say: "Choosing the best weighting is a linear program." },
    ],
    clever: "Turn proof design into optimisation.",
    when: "When many views are available.",
    equality: "",
    slack: "",
    related: ["fractional-cover", "cover-optimization"],
    hints: ["Each vertex needs total weight one."],
    widget: { type: "fractional", mode: "hypergraph" },
    example() {
      const F = FAMILY4["cyclic-no-adjacent"].make(), r = E.fractionalCover(F, HYPEREDGES.slice(0, 4).map((s) => ({ set: s, w: 0.5 })));
      return { rows: [{ label: "cycle, ½ each", exact: r.size, bound: r.countBound }], md: `- cycle edges at weight ½: objective $${f(r.logBound)}$ bits, $|\\mathcal F|=${c(r.size)}\\le${f(r.countBound, 4)}$`,
        say: `Half weight on the four cycle edges gives ${f(r.countBound, 4)} for a family of ${c(r.size)}.` };
    },
  });

  add({
    id: "cover-optimization", group: "Projections", title: "Optimising a fractional cover", short: "Cover optimisation", difficulty: 4, prereq: ["hypergraph"],
    technique: "fractional covers",
    problem: "For a fixed family and supplied candidate covers, which gives the best bound?",
    family: "The staircase, or another point set from the projection lab.",
    randomObject: "$X$ uniform.",
    variables: [{ sym: "\\alpha", space: "candidate covers", dist: "", support: "", role: "the choice" }],
    identity: "H(X)=\\log|\\mathcal F|",
    theorem: "$$|\\mathcal F|\\le\\min_{\\alpha\\text{ valid}}\\prod_A|\\mathcal F_A|^{\\alpha_A}.$$",
    proof: [{ md: "Each valid candidate is a fractional cover; take the smallest.", why: "fractional Shearer", say: "Each valid candidate gives a bound; keep the best." }],
    clever: "Different families prefer different covers.",
    when: "Whenever you have a menu of views.",
    equality: "", slack: "",
    related: ["fractional-cover", "projection"],
    hints: ["Score each candidate."],
    widget: { type: "fractional", mode: "candidates" },
    example() {
      const b = E.bestCover(POINTS3.staircase.pts(), COVER_CANDIDATES);
      return { rows: b.scored.map((s) => ({ label: s.label, bound: s.result.valid ? s.result.countBound : null })),
        md: b.scored.map((s) => `- ${s.label}: ${s.result.valid ? f(s.result.countBound, 4) : "not a cover"}`).join("\n"), say: `For the staircase the best supplied cover is ${b.best.label.split(":")[0]}, giving ${f(b.best.result.countBound, 4)}.` };
    },
  });

  /* ================= Matchings ================= */
  add({
    id: "colourings", group: "Matchings", title: "Colourings: local variables on vertices", short: "Colourings", difficulty: 2, prereq: ["chain-rule"],
    technique: "conditional entropy",
    problem: "Count proper $q$-colourings of a path or cycle through local conditional entropies.",
    family: "Proper colourings of $P_n$ or $C_n$.",
    randomObject: "A uniformly random proper colouring.",
    variables: [{ sym: "X_v", space: "[q]", dist: "marginal", support: "q", role: "colour of v" }],
    identity: "H(X)=\\log(\\#\\text{colourings})",
    theorem: "$$H(X)\\le H(X_1)+\\sum_{v\\ge2}H(X_v\\mid X_{v-1})\\le\\log q+(n-1)\\log(q-1).$$",
    proof: [
      { md: "Chain rule along the path; keep only the previous vertex.", why: "chain rule + conditioning", say: "Reveal the vertices in order and keep only the neighbour." },
      { md: "Given its neighbour, $X_v$ has at most $q-1$ options.", why: "support bound", say: "Given the neighbour, a vertex has at most q minus one colours." },
    ],
    clever: "Global family, local variables, local budgets.",
    when: "Homomorphism counting, independent sets.",
    equality: "Paths: exactly $q(q-1)^{n-1}$.",
    slack: "Cycles: the last vertex has fewer options.",
    related: ["perfect-matchings", "constrained-strings"],
    hints: ["Reveal vertices in order along the path."],
    widget: { type: "colour", n: 5, q: 3 },
    example() {
      const p = E.colourings(5, 3, false).length, cy = E.colourings(5, 3, true).length;
      return { rows: [{ label: "P₅, q = 3", exact: BigInt(p), bound: 3 * 2 ** 4 }, { label: "C₅, q = 3", exact: BigInt(cy), bound: 3 * 2 ** 4 }],
        md: `- path $P_5$, $q=3$: ${p} colourings $=3\\cdot2^4$\n- cycle $C_5$: ${cy}$\\le48$`, say: `The path has ${p} colourings, matching the bound exactly; the cycle has ${cy}.` };
    },
  });

  add({
    id: "perfect-matchings", group: "Matchings", title: "Perfect matchings in bipartite graphs", short: "Perfect matchings", difficulty: 3, prereq: ["chain-rule"],
    technique: "perfect matching entropy",
    problem: "Given left degrees $d_1,\\ldots,d_n$, how many perfect matchings can a bipartite graph have?",
    family: "The perfect matchings of a bipartite graph.",
    randomObject: "A uniformly random perfect matching $M$.",
    variables: [{ sym: "X_i", space: "N(i)", dist: "induced", support: "d_i", role: "partner of left vertex i" }],
    identity: "H(X_1,\\ldots,X_n)=\\log\\operatorname{per}(A)",
    theorem: "$$\\operatorname{per}(A)\\le\\prod_id_i\\quad\\text{(naive)}.$$",
    proof: [
      { md: "$M$ is determined by $(X_1,\\ldots,X_n)$, so $H(X)=\\log\\operatorname{per}A$.", why: "uniform", say: "A matching is determined by each left vertex's partner, so its entropy is the log of the permanent." },
      { md: "Subadditivity and $H(X_i)\\le\\log d_i$ give $\\operatorname{per}A\\le\\prod d_i$.", why: "subadditivity + support", say: "Subadditivity gives the product of the degrees, which ignores that partners must be distinct." },
    ],
    clever: "Name the matching by its partners.",
    when: "Permanents, Latin squares, 1-factors.",
    equality: "Only when every row is forced.",
    slack: "Distinct partners are ignored.",
    related: ["bregman", "random-reveal", "matching-lab"],
    hints: ["Choose a matching uniformly at random.", "Describe it by partners."],
    widget: { type: "matching", preset: "c6" },
    example() {
      return { rows: Object.values(MATCHINGS).map((g) => { const b = E.bregman(g.adj); return { label: g.label, exact: b.permanent, naive: b.naive }; }),
        md: Object.values(MATCHINGS).map((g) => { const b = E.bregman(g.adj); return `- ${g.label}: per $=${c(b.permanent)}$, $\\prod d_i=${c(b.naive)}$`; }).join("\n"),
        say: "The naive product of degrees always holds but ignores that partners must differ." };
    },
  });

  add({
    id: "bregman", group: "Matchings", title: "Bregman's theorem", short: "Bregman", difficulty: 5, prereq: ["perfect-matchings", "random-reveal"],
    technique: "Bregman's theorem",
    problem: "Bound the number of perfect matchings from the left degrees.",
    family: "Perfect matchings of a bipartite graph with left degrees $d_i$.",
    randomObject: "A uniformly random perfect matching, revealed in a uniformly random order.",
    variables: [{ sym: "X_i", space: "N(i)", dist: "", support: "d_i", role: "partner of i" }, { sym: "R", space: "S_n", dist: "uniform", support: "n!", role: "reveal order" },
      { sym: "N_i", space: "\\{1,\\ldots,d_i\\}", dist: "uniform given M", support: "d_i", role: "available choices when i is revealed" }],
    identity: "H(M)=\\log\\operatorname{per}(A)",
    theorem: "$$\\operatorname{per}(A)\\le\\prod_i(d_i!)^{1/d_i}.$$",
    proof: [
      { md: "$H(M)=\\log\\operatorname{per}(A)$ with $M=(X_1,\\ldots,X_n)$.", why: "uniform", say: "The entropy of a random matching is the log of the permanent." },
      { md: "For any order: $H(M)=\\sum_iH(X_i\\mid\\text{earlier }X_j)$.", why: "chain rule", say: "For any reveal order, the chain rule splits the entropy." },
      { md: "$H(X_i\\mid\\text{earlier})\\le\\mathbb E[\\log N_i]$: when $i$ is revealed, only $N_i$ neighbours are still free.", why: "support bound", say: "When vertex i is revealed only the still free neighbours remain, so its term is at most the expected log of that number." },
      { md: "Average over a uniformly random order $R$.", why: "averaging", say: "Average this over a uniformly random reveal order." },
      { md: "For fixed $M$, $N_i$ is uniform on $\\{1,\\ldots,d_i\\}$: it is one plus the number of $i$'s neighbours' partners revealed after $i$.", why: "symmetry", say: "For a fixed matching, the number of free neighbours is uniform from one to d i." },
      { md: "$$\\mathbb E\\log N_i=\\frac1{d_i}\\sum_{k=1}^{d_i}\\log k=\\frac{\\log(d_i!)}{d_i}.$$", why: "averaging identity", say: "So its average log is the log of d i factorial over d i." },
      { md: "$$\\log\\operatorname{per}A\\le\\sum_i\\frac{\\log(d_i!)}{d_i};\\ \\text{exponentiate.}$$", why: "sum + exponentiate", say: "Sum over rows and exponentiate." },
    ],
    clever: "Randomise the order of revealing variables so the local option count has a tractable average.",
    when: "Counting 1-factors, Latin squares, permanents of 0-1 matrices.",
    equality: "Disjoint unions of complete bipartite graphs $K_{d,d}$.",
    slack: "Non-regular structure; e.g. $C_6$.",
    related: ["random-reveal", "perfect-matchings", "matching-lab", "probabilistic-method"],
    hints: ["Choose a perfect matching uniformly at random.", "Describe it by the partner chosen by every left vertex.", "Use the chain rule.",
      "The order in which vertices are revealed affects the number of available choices.", "Randomise that reveal order.", "Average log(number of remaining neighbours)."],
    solution: "$$H(M)\\le\\sum_i\\frac{\\log(d_i!)}{d_i}.$$",
    widget: { type: "matching", preset: "ferrers", bound: true },
    example() {
      const rows = Object.values(MATCHINGS).map((g) => ({ label: g.label, ...E.bregman(g.adj) }));
      return { rows: rows.map((r) => ({ label: r.label, exact: r.permanent, bound: r.bound, ratio: r.ratio })),
        md: rows.map((r) => `- ${r.label}: per $=${c(r.permanent)}\\le${f(r.bound, 4)}$${r.tight ? " (tight)" : ""}`).join("\n"),
        say: `The cycle C six has ${c(rows[0].permanent)} matchings against a bound of ${f(rows[0].bound, 4)}. K three three has ${c(rows[1].permanent)}, and the bound is exactly ${f(rows[1].bound, 4)}.` };
    },
  });

  add({
    id: "random-reveal", group: "Matchings", title: "Random reveal ordering", short: "Random reveal", difficulty: 4, prereq: ["perfect-matchings"],
    technique: "random reveal ordering",
    problem: "Why does a random order make the local option count tractable?",
    family: "Perfect matchings of a preset graph.",
    randomObject: "A matching $M$ and an order $R$, both uniform.",
    variables: [{ sym: "N_i", space: "\\{1,\\ldots,d_i\\}", dist: "uniform given M", support: "d_i", role: "available choices" }],
    identity: "H(M)=\\log\\operatorname{per}A",
    theorem: "For fixed $M$ and uniform $R$, $N_i$ is uniform on $\\{1,\\ldots,d_i\\}$, so $\\mathbb E\\log N_i=\\log(d_i!)/d_i$.",
    proof: [
      { md: "$N_i=1+\\#\\{j\\in N(i)\\setminus\\{X_i\\}$ whose owner is revealed after $i\\}$.", why: "exact", say: "The free neighbours are i's own partner plus the neighbours whose owners come later." },
      { md: "In a uniform order, $i$'s position among the $d_i$ owners is uniform.", why: "symmetry", say: "In a random order, vertex i is equally likely to be first, second, and so on among those owners." },
      { md: "So $N_i$ is uniform on $\\{1,\\ldots,d_i\\}$ and $\\mathbb E\\log N_i=\\frac1{d_i}\\log(d_i!)$.", why: "averaging identity", say: "So the count is uniform, and its average log is log d i factorial over d i." },
    ],
    clever: "Randomness is added to the proof, not to the theorem.",
    when: "Whenever a fixed order makes conditional supports messy but symmetric on average.",
    equality: "", slack: "Jensen is not used: the averaging is exact; slack enters only at the support bound.",
    related: ["bregman", "probabilistic-method"],
    hints: ["Who owns the neighbours of $i$?", "Where does $i$ sit among them in a random order?"],
    widget: { type: "matching", preset: "k33", reveal: true },
    example() {
      const g = MATCHINGS.k33.adj, a = E.revealAverages(g);
      return { rows: a.rows.map((r) => ({ label: `vertex ${r.vertex + 1}`, bits: r.avgBits })),
        md: `- ${a.matchings} matchings × ${a.orders} orders: $N_i$ uniform on $\\{1,2,3\\}$ every time: ${a.uniformEveryMatching ? "yes" : "no"}\n- average $\\log_2N_i=${f(a.rows[0].avgBits)}=\\log_2(3!)/3$`,
        say: `Over all ${a.matchings} matchings and ${a.orders} orders, each count is uniform on one to three, with average log ${f(a.rows[0].avgBits)} bits.` };
    },
  });

  /* ================= Compression and asymptotics ================= */
  add({
    id: "compression", group: "Compression", title: "Compression arguments", short: "Compression", difficulty: 2, prereq: ["counting", "chain-rule"],
    technique: "compression method",
    problem: "Every object has a short uniquely decodable description. What does that say about $|\\mathcal F|$?",
    family: "Any finite family with a coordinate description.",
    randomObject: "$X$ uniform on $\\mathcal F$.",
    variables: [{ sym: "C(X)", space: "\\{0,1\\}^*", dist: "", support: "", role: "a description" }],
    identity: "H(X)=\\log|\\mathcal F|\\le\\mathbb E|C(X)|",
    theorem: "If every object has a prefix-free code of length at most $L$ then $|\\mathcal F|\\le2^L$; on average, $\\log|\\mathcal F|\\le\\mathbb E|C(X)|$.",
    proof: [
      { md: "Kraft: $\\sum_x2^{-|C(x)|}\\le1$ for a prefix code.", why: "Kraft", say: "A prefix code satisfies the Kraft inequality." },
      { md: "Gibbs with $q(x)\\propto2^{-|C(x)|}$: $H(X)\\le\\mathbb E|C(X)|$.", why: "Gibbs", say: "Gibbs' inequality then says entropy is at most the expected length." },
      { md: "Classical encoding counts descriptions; entropy allows adaptive, conditional, averaged and overlapping descriptions.", why: "comparison", say: "Classical injections count fixed descriptions; entropy also allows adaptive, conditional and averaged ones." },
    ],
    clever: "A conditional description pays only for what is still unknown.",
    when: "When you can explain how to write an object down.",
    equality: "Optimal codes on dyadic distributions.",
    slack: "Rounding to whole bits.",
    related: ["chain-rule", "counting"],
    hints: ["Describe the object coordinate by coordinate, adaptively."],
    widget: { type: "encode", family: "permutations", n: 4 },
    example() {
      const e = E.encodings(E.family("permutations", 4));
      return { rows: [{ label: "naive", bits: e.naiveTotal }, { label: "Σ H(Xᵢ)", bits: e.marginalTotal }, { label: "chain rule", bits: e.chainTotal }],
        md: `- naive: ${e.naive.join(" + ")} $=${e.naiveTotal}$ bits\n- marginals: $${f(e.marginalTotal)}$ bits\n- adaptive (chain rule): ${e.chain.map((x) => f(x)).join(" + ")} $=${f(e.chainTotal)}$ bits\n- Huffman: average ${f(e.avgHuffman)} bits`,
        say: `Naming each coordinate separately costs ${e.naiveTotal} bits; describing each given the earlier ones costs ${f(e.chainTotal)} bits.` };
    },
  });

  add({
    id: "typical-set", group: "Compression", title: "Typical sets", short: "Typical sets", difficulty: 3, prereq: ["binary-entropy"],
    technique: "typical sets",
    problem: "Independent Bernoulli($p$) bits: where is the probability, and how many strings hold it?",
    family: "$\\{0,1\\}^n$, coloured by the fraction of ones.",
    randomObject: "$X_1,\\ldots,X_n$ i.i.d. Bernoulli($p$).",
    variables: [{ sym: "X", space: "\\{0,1\\}^n", dist: "\\mathrm{Bernoulli}(p)^{\\otimes n}", support: "2^n", role: "a random string" }],
    identity: "H(X)=nh(p)",
    theorem: "A band $|k/n-p|\\le\\varepsilon$ holds most of the probability but only about $2^{nh(p)}$ strings.",
    proof: [
      { md: "Each string with $k$ ones has probability $p^k(1-p)^{n-k}\\approx2^{-nh(p)}$ when $k\\approx pn$.", why: "exact", say: "Each typical string has probability about two to the minus n h of p." },
      { md: "The weak law puts most mass near $k=pn$; so the band has about $2^{nh(p)}$ strings.", why: "law of large numbers", say: "The law of large numbers puts most of the mass in the band, so the band has about two to the n h of p strings." },
    ],
    clever: "Probability mass and counting meet in the band.",
    when: "Asymptotic counting, source coding.",
    equality: "", slack: "Polynomial factors and the band width.",
    related: ["binary-entropy", "method-of-types", "binomial"],
    hints: ["What is the probability of one string with $pn$ ones?"],
    widget: { type: "typical", n: 12, p: 0.25, eps: 0.1 },
    example() {
      const t = E.typical(12, 0.25, 0.1);
      return { rows: [{ label: "band", exact: t.bandCount, bound: t.entropyCount, prob: t.bandProb }],
        md: `- $n=12$, $p=0.25$, $\\varepsilon=0.1$: band holds ${f(100 * t.bandProb, 3)} percent of the mass in ${c(t.bandCount)} of $4096$ strings; $2^{nh(p)}=${f(t.entropyCount, 4)}$`,
        say: `For twelve bits with p one quarter, the band holds ${f(100 * t.bandProb, 3)} percent of the probability in ${c(t.bandCount)} strings.` };
    },
  });

  add({
    id: "method-of-types", group: "Compression", title: "The method of types", short: "Method of types", difficulty: 3, prereq: ["typical-set"],
    technique: "method of types",
    problem: "Group strings over a $q$-letter alphabet by their letter counts. How big is each group?",
    family: "Strings of length $n$ over $\\{a,b,c\\}$.",
    randomObject: "A uniform string of a fixed type $(n_1,\\ldots,n_q)$.",
    variables: [{ sym: "(n_1,\\ldots,n_q)", space: "types", dist: "", support: "\\binom{n+q-1}{q-1}", role: "a point of the simplex" }],
    identity: "\\log\\binom{n}{n_1,\\ldots,n_q}\\approx nH(p)",
    theorem: "$$\\frac{2^{nH(p)}}{(n+1)^{q}}\\le\\binom{n}{n_1,\\ldots,n_q}\\le2^{nH(p)},\\quad p_j=n_j/n.$$",
    proof: [
      { md: "Upper bound: subadditivity, see the multinomial lesson.", why: "subadditivity", say: "The upper bound is subadditivity." },
      { md: "There are at most $(n+1)^q$ types, and the type $p$ is the most likely under $p^{\\otimes n}$.", why: "counting types", say: "There are only polynomially many types, and the matching type is the most likely one." },
    ],
    clever: "Few types, so one of them carries the exponential count.",
    when: "Large deviations, counting by empirical distribution.",
    equality: "", slack: "Polynomial.",
    related: ["multinomial", "typical-set"],
    hints: ["Count the types."],
    widget: { type: "simplex", n: 6, sel: [3, 2, 1] },
    example() {
      const m = E.multinomialBound([3, 2, 1]);
      return { rows: [{ label: "(3,2,1)", exact: m.exact, bound: m.bound }], md: `- type $(3,2,1)$: $\\binom{6}{3,2,1}=${c(m.exact)}$, $nH=${f(m.exponent)}$, $2^{nH}=${f(m.bound, 4)}$`,
        say: `The type three, two, one has ${c(m.exact)} strings, below the entropy estimate ${f(m.bound, 4)}.` };
    },
  });

  add({
    id: "multinomial", group: "Compression", title: "Entropy proof of multinomial bounds", short: "Multinomial", difficulty: 3, prereq: ["binomial"],
    technique: "multinomial entropy",
    problem: "Bound $\\binom{n}{n_1,\\ldots,n_q}$.",
    family: "Strings with exactly $n_j$ copies of letter $j$.",
    randomObject: "A uniform such string.",
    variables: [{ sym: "X_i", space: "[q]", dist: "p_j=n_j/n", support: "q", role: "letter i" }],
    identity: "H(X)=\\log\\binom{n}{n_1,\\ldots,n_q}",
    theorem: "$$\\log\\binom{n}{n_1,\\ldots,n_q}\\le nH(p_1,\\ldots,p_q).$$",
    proof: [
      { md: "$H(X)=\\log\\binom{n}{n_1,\\ldots,n_q}$.", why: "uniform", say: "The entropy of a uniform string of this type is the log of the multinomial." },
      { md: "By symmetry each $X_i$ has distribution $p_j=n_j/n$.", why: "symmetry", say: "By symmetry each letter has the type's distribution." },
      { md: "Subadditivity: $H(X)\\le nH(p)$.", why: "subadditivity", say: "Subadditivity finishes it." },
    ],
    clever: "The same indicator trick, with $q$ letters instead of two.",
    when: "Multinomials and arrangements with repetition.",
    equality: "Only trivial types.", slack: "Polynomial in $n$.",
    related: ["binomial", "method-of-types"],
    hints: ["Repeat the binomial proof with $q$ letters."],
    widget: { type: "simplex", n: 6, sel: [2, 2, 2], table: true },
    example() {
      const rows = [[2, 2, 2], [3, 2, 1], [4, 1, 1]].map((p) => E.multinomialBound(p));
      return { rows: rows.map((m) => ({ label: `(${m.parts})`, exact: m.exact, bound: m.bound, ratio: m.ratio })),
        md: rows.map((m) => `- $(${m.parts.join(",")})$: ${c(m.exact)} $\\le${f(m.bound, 4)}$`).join("\n"), say: `For six letters split two, two, two the count is ${c(rows[0].exact)} against ${f(rows[0].bound, 4)}.` };
    },
  });

  add({
    id: "set-systems", group: "Compression", title: "Entropy and set systems", short: "Set systems", difficulty: 3, prereq: ["binomial"],
    technique: "set-system entropy",
    problem: "Bound a family $\\mathcal F\\subseteq2^{[n]}$ from how often each element is used.",
    family: "A set system on $[5]$, as an incidence matrix.",
    randomObject: "$F$ uniform on $\\mathcal F$.",
    variables: [{ sym: "X_i", space: "\\{0,1\\}", dist: "\\mathrm{Bernoulli}(p_i)", support: "2", role: "1 if i ∈ F" }],
    identity: "H(X)=\\log|\\mathcal F|",
    theorem: "$$\\log|\\mathcal F|\\le\\sum_ih(p_i),\\quad p_i=\\text{fraction of sets containing }i.$$",
    proof: [
      { md: "$H(X)=\\log|\\mathcal F|$ with indicators $X_i$.", why: "uniform", say: "Encode the random set by indicators." },
      { md: "$H(X)\\le\\sum_iH(X_i)=\\sum_ih(p_i)$.", why: "subadditivity", say: "Subadditivity with the column frequencies." },
    ],
    clever: "Column frequencies are enough.",
    when: "Families where elements are rarely used.",
    equality: "Product families.", slack: "Correlations between elements.",
    related: ["binomial", "antichains"],
    hints: ["Read the column frequencies."],
    widget: { type: "incidence", n: 5, sets: [[0, 2], [1, 2], [0, 3], [2, 4], [1, 3], [0, 4]] },
    example() {
      const s = E.setSystem([[0, 2], [1, 2], [0, 3], [2, 4], [1, 3], [0, 4]], 5);
      return { rows: [{ label: "6 sets on [5]", exact: s.size, bound: s.bound }], md: `- $|\\mathcal F|=${c(s.size)}$, $p=(${s.p.map((x) => f(x)).join(", ")})$, $\\sum h(p_i)=${f(s.sum)}$, bound ${f(s.bound, 4)}`,
        say: `Six sets, against an entropy bound of ${f(s.bound, 4)}.` };
    },
  });

  add({
    id: "antichains", group: "Compression", title: "Middle layers and antichains", short: "Antichains", difficulty: 3, prereq: ["binary-entropy"],
    technique: "binary entropy",
    problem: "Where are the big layers of $2^{[n]}$, and what does entropy say about antichains?",
    family: "Layers $\\binom{[n]}{k}$.",
    randomObject: "A uniform $k$-set.",
    variables: [{ sym: "k", space: "0..n", dist: "", support: "", role: "the layer" }],
    identity: "\\log\\binom nk\\le nh(k/n)",
    theorem: "Entropy intuition: $|\\binom{[n]}k|\\lesssim2^{nh(k/n)}$, largest at $k=n/2$. Exact theorem (Sperner, by the LYM inequality, not by entropy): every antichain has at most $\\binom n{\\lfloor n/2\\rfloor}$ sets.",
    proof: [
      { md: "$h$ is maximised at $1/2$, so the entropy estimate peaks at the middle layer.", why: "entropy intuition", say: "The entropy estimate peaks at the middle layer." },
      { md: "That is asymptotic size, not a proof that antichains are small: Sperner's theorem needs the LYM inequality.", why: "honesty", say: "This is intuition about size. The exact extremal theorem is Sperner's, proved by the LYM inequality." },
    ],
    clever: "Use entropy to see where the mass is; use exact combinatorics to prove extremality.",
    when: "As a guide to extremal configurations.",
    equality: "", slack: "",
    related: ["set-systems", "binary-entropy"],
    hints: ["Which $k$ maximises $h(k/n)$?"],
    widget: { type: "hcurve", n: 10, p: 0.5, layers: true },
    example() {
      const L4 = E.largestAntichain(4), mid = E.binom(4, 2);
      return { rows: [{ label: "n = 4 antichain", exact: BigInt(L4), bound: Number(mid) }], md: `- brute force on $n=4$: largest antichain ${L4} $=\\binom42=${c(mid)}$ (Sperner)`,
        say: `On four elements a search over all families finds a largest antichain of ${L4}, and the middle layer has ${c(mid)} sets.` };
    },
  });

  add({
    id: "additive", group: "Compression", title: "A sumset glimpse", short: "Sumsets", difficulty: 4, prereq: ["data-processing"],
    technique: "sumset entropy",
    problem: "Independent $X\\in A$, $Y\\in B$. What does entropy say about $A+B$?",
    family: "$A+B=\\{a+b\\}$.",
    randomObject: "$X$ uniform on $A$, $Y$ uniform on $B$, independent.",
    variables: [{ sym: "X+Y", space: "A+B", dist: "convolution", support: "|A+B|", role: "the sum" }],
    identity: "H(X+Y)\\le\\log|A+B|",
    theorem: "$$\\max(H(X),H(Y))\\le H(X+Y)\\le\\log|A+B|.$$",
    proof: [
      { md: "$X+Y$ takes values in $A+B$: support bound.", why: "support bound", say: "The sum lives in the sumset." },
      { md: "$H(X+Y)\\ge H(X+Y\\mid Y)=H(X)$.", why: "conditioning", say: "Given Y, the sum determines X." },
      { md: "Entropic Plünnecke–Ruzsa inequalities extend this; they are outside this lab's core.", why: "note", say: "Entropic versions of the Plunnecke and Ruzsa inequalities go further." },
    ],
    clever: "A sumset is the support of a sum.",
    when: "Additive combinatorics.",
    equality: "", slack: "",
    related: ["data-processing"],
    hints: ["What is the support of $X+Y$?"],
    widget: { type: "sumset", A: [0, 1, 2, 3], B: [0, 1, 2, 3] },
    example() {
      const s = E.sumset([0, 1, 2, 3], [0, 1, 2, 3]), t = E.sumset([0, 1, 2, 3], [0, 4, 8, 12]);
      return { rows: [{ label: "A = B = {0..3}", exact: BigInt(s.size), bits: s.HS }, { label: "B = {0,4,8,12}", exact: BigInt(t.size), bits: t.HS }],
        md: `- $A=B=\\{0,1,2,3\\}$: $|A+B|=${s.size}$, $H(X+Y)=${f(s.HS)}\\le${f(s.logSize)}$\n- $B=\\{0,4,8,12\\}$: $|A+B|=${t.size}$, $H(X+Y)=${f(t.HS)}=${f(t.logSize)}$`,
        say: `An interval plus itself gives ${s.size} sums and ${f(s.HS)} bits; spreading B out makes all ${t.size} sums distinct.` };
    },
  });

  add({
    id: "probabilistic-method", group: "Synthesis", title: "Entropy and the probabilistic method", short: "Probabilistic method", difficulty: 3, prereq: ["bregman"],
    technique: "probabilistic method",
    problem: "How do entropy methods relate to probabilistic existence proofs?",
    family: "", randomObject: "", variables: [], identity: "H(X)=\\log|\\mathcal F|",
    theorem: "The probabilistic method shows an object exists; the entropy method bounds how many can exist. Both use random sampling, random ordering, random encodings and expectation.",
    proof: [
      { md: "Probabilistic method: $\\Pr[\\text{good}]>0\\Rightarrow$ a good object exists.", why: "existence", say: "The probabilistic method shows that a good object exists." },
      { md: "Entropy method: $H(\\text{uniform object})=\\log|\\mathcal F|\\le\\text{budget}$.", why: "counting", say: "The entropy method bounds how many objects there can be." },
      { md: "Bregman: randomness is introduced into the proof architecture (the reveal order), not into the theorem.", why: "synthesis", say: "In Bregman's theorem the randomness lives in the proof, in the reveal order, not in the statement." },
    ],
    clever: "Randomness as a proof device.", when: "", equality: "", slack: "",
    related: ["bregman", "random-reveal"], hints: [],
    widget: { type: "architecture" },
    example() { return { rows: [], md: "", say: "" }; },
  });

  add({
    id: "proof-design", group: "Synthesis", title: "The entropy method as proof design", short: "Proof design", difficulty: 3, prereq: ["shearer", "bregman"],
    technique: "proof design",
    problem: "Look at a combinatorial family and ask: what random variables determine one object, and how cheaply can I describe them?",
    family: "", randomObject: "", variables: [], identity: "H(X)=\\log|\\mathcal F|",
    theorem: "COUNT → RANDOMIZE → ENCODE → DECOMPOSE INFORMATION → THROW AWAY ONLY THE DEPENDENCE YOU CAN AFFORD → BOUND LOCAL UNCERTAINTY → ADD INFORMATION COSTS → EXPONENTIATE.",
    proof: [
      { md: "Chain rule: reveal an object progressively.", why: "move 1", say: "The chain rule reveals an object progressively." },
      { md: "Shearer: bound an object through overlapping partial views.", why: "move 2", say: "Shearer bounds an object through overlapping partial views." },
      { md: "Random reveal order: make local conditional uncertainty average to something tractable.", why: "move 3", say: "A random reveal order makes local uncertainty average to something tractable." },
    ],
    clever: "Choosing the random variables is the creative part.", when: "", equality: "", slack: "",
    related: ["chain-rule", "shearer", "random-reveal"], hints: [],
    widget: { type: "checklist" },
    example() { return { rows: [], md: "", say: "" }; },
  });

  /* ================= Labs ================= */
  const LABS = [
    { id: "cover-builder", title: "Shearer cover builder", short: "Cover builder", lesson: "shearer", widget: { type: "builder", n: 5 },
      blurb: "Build subsets of five coordinates by toggling or dragging across them. The inequality activates once every coordinate is covered." },
    { id: "projection", title: "Projection laboratory", short: "Projection lab", lesson: "loomis-whitney", widget: { type: "grid3", preset: "staircase", lab: true },
      blurb: "Toggle lattice points in a 2D or 3D grid and watch the shadows, Shearer and Loomis–Whitney update." },
    { id: "matching-lab", title: "Bipartite matching laboratory", short: "Matching lab", lesson: "bregman", widget: { type: "matching", preset: "c6", lab: true, reveal: true, bound: true },
      blurb: "Preset and editable bipartite graphs: exact permanent, degrees, Bregman bound, and deterministic random-reveal runs." },
  ];

  /* ================= Problem ladder (spec §47) ================= */
  const PROBLEMS = [
    { level: 1, title: "How many bits identify one of N objects?", technique: "uniform entropy", lesson: "counting", visual: "decision tree" },
    { level: 2, title: "Maximise entropy on N outcomes", technique: "maximum entropy", lesson: "entropy", visual: "probability bars" },
    { level: 3, title: "Bound a family by coordinate supports", technique: "subadditivity", lesson: "subadditivity", visual: "coordinate box" },
    { level: 4, title: "Bound C(n,k)", technique: "binary entropy", lesson: "binomial", visual: "lit boxes" },
    { level: 5, title: "Bound multinomial coefficients", technique: "subadditivity", lesson: "multinomial", visual: "type simplex" },
    { level: 6, title: "Count constrained binary strings", technique: "conditional entropy", lesson: "constrained-strings", visual: "string list" },
    { level: 7, title: "Bound a set family from marginals", technique: "indicator encoding", lesson: "set-systems", visual: "incidence matrix" },
    { level: 8, title: "Projection bound in 3D", technique: "Shearer", lesson: "combinatorial-shearer", visual: "lattice shadows" },
    { level: 9, title: "Loomis–Whitney", technique: "Shearer", lesson: "loomis-whitney", visual: "three shadows" },
    { level: 10, title: "Optimise a fractional cover", technique: "fractional Shearer", lesson: "cover-optimization", visual: "candidate covers" },
    { level: 11, title: "Bound perfect matchings", technique: "chain rule", lesson: "perfect-matchings", visual: "bipartite graph" },
    { level: 12, title: "Bregman's theorem", technique: "random reveal ordering", lesson: "bregman", visual: "reveal animation" },
    { level: 13, title: "Typical binary strings", technique: "typical sets", lesson: "typical-set", visual: "weight histogram" },
    { level: 14, title: "Method of types", technique: "entropy asymptotics", lesson: "method-of-types", visual: "type simplex" },
    { level: 15, title: "Hypergraph projection problem", technique: "fractional covers", lesson: "hypergraph", visual: "weighted hypergraph" },
    { level: 16, title: "Sumset toy problem", technique: "entropy under maps", lesson: "additive", visual: "sum grid" },
  ];

  /* ================= Compare mode (spec §5, §51) ================= */
  const COMPARISONS = [
    { id: "direct-vs-entropy", title: "Direct counting vs entropy", lesson: "binomial",
      left: { name: "Direct proof", counted: "Subsets, exactly: $\\binom nk$.", dependence: "None discarded.", symmetry: "Not needed.", generalises: "Only to families you can count exactly." },
      right: { name: "Entropy proof", counted: "Bits to name a random $k$-subset.", dependence: "Discarded at subadditivity: the bits must sum to $k$.", symmetry: "Each bit has marginal $k/n$.", generalises: "To any family with known marginals (set systems, types)." },
      numbers() { return [[10, 3], [20, 5], [40, 10]].map(([n, k]) => { const b = E.binomialBound(n, k); return { label: `n = ${n}, k = ${k}`, a: b.exact, b: b.bound, log2a: b.log2Exact, log2b: b.exponent }; }); } },
    { id: "union-vs-entropy", title: "Union bound vs entropy", lesson: "binomial",
      left: { name: "Union of layers", counted: "$\\sum_{i\\le k}\\binom ni\\le(k+1)\\binom nk$.", dependence: "—", symmetry: "Layers are largest near the middle.", generalises: "Any union of known pieces." },
      right: { name: "Entropy", counted: "A random set of size $\\le k$ has $\\Pr[X_i=1]\\le k/n$.", dependence: "Discarded at subadditivity.", symmetry: "Average marginal $\\le k/n\\le1/2$; $h$ increasing there.", generalises: "No $k+1$ factor: $|B(n,k)|\\le2^{nh(k/n)}$ for $k\\le n/2$." },
      numbers() { return [[10, 3], [20, 6], [40, 10]].map(([n, k]) => { const b = E.hammingBall(n, k); return { label: `ball n = ${n}, k ≤ ${k}`, exact: b.exact, a: b.layers, b: b.entropy, log2a: E.log2Big(b.layers), log2b: Math.log2(b.entropy) }; }); } },
    { id: "subadditivity-vs-shearer", title: "Subadditivity vs Shearer", lesson: "shearer",
      left: { name: "Subadditivity", counted: "Each coordinate alone.", dependence: "All of it.", symmetry: "—", generalises: "Product bounds." },
      right: { name: "Shearer", counted: "Overlapping views.", dependence: "Only between views.", symmetry: "Covers with equal multiplicity.", generalises: "Fractional covers, Loomis–Whitney." },
      numbers() { return Object.entries(FAMILY4).map(([, F]) => { const fam = F.make(); const s = E.subadditivity(fam), sh = E.shearer(fam, COVERS4.cycle.sets); return { label: F.label, exact: s.size, a: s.entropyCount, b: sh.bound, log2a: s.sumH, log2b: sh.sumH / sh.r }; }); } },
    { id: "naive-vs-conditional", title: "Naive coordinate count vs conditional count", lesson: "chain-rule",
      left: { name: "Naive", counted: "Each $X_i$ ranges over $n$ values.", dependence: "All of it.", symmetry: "—", generalises: "$n^n$ for permutations." },
      right: { name: "Conditional", counted: "Each $X_i$ given the earlier ones has $n-i+1$ values.", dependence: "None.", symmetry: "—", generalises: "Exactly $n!$; the seed of Bregman." },
      numbers() { return [3, 4, 5, 6].map((n) => ({ label: `permutations of ${n}`, exact: E.factorial(n), a: Number(E.bigPow(n, n)), b: Number(E.factorial(n)), log2a: n * Math.log2(n), log2b: E.log2Big(E.factorial(n)) })); } },
  ];

  /* Encode mode: families whose descriptions are compared. */
  const ENCODE_FAMILIES = {
    permutations: { label: "Permutations of 4", make: () => E.family("permutations", 4) },
    "no-adjacent": { label: "Strings of length 6, no two adjacent ones", make: () => E.family("no-adjacent", 6) },
    "k-subsets": { label: "2-subsets of [6] as indicators", make: () => E.family("k-subsets", 6, 2) },
    matchings: { label: "Perfect matchings of the Ferrers board", make: () => E.perfectMatchings(MATCHINGS.ferrers.adj) },
    staircase: { label: "Staircase points in {0,1,2}³", make: () => POINTS3.staircase.pts() },
  };

  /* ================= Reference (spec §46, §50, §54, §64, §83) ================= */
  const ATLAS = [
    { name: "Maximum entropy", tex: "H(X)\\le\\log|\\operatorname{supp}(X)|", lesson: "entropy" },
    { name: "Chain rule", tex: "H(X,Y)=H(X)+H(Y\\mid X)", lesson: "chain-rule" },
    { name: "Conditioning", tex: "H(X\\mid Y)\\le H(X)", lesson: "conditioning" },
    { name: "Subadditivity", tex: "H(X_1,\\ldots,X_n)\\le\\sum_iH(X_i)", lesson: "subadditivity" },
    { name: "Mutual information", tex: "I(X;Y)\\ge0", lesson: "mutual-information" },
    { name: "Gibbs", tex: "D(P\\|Q)\\ge0", lesson: "kl-divergence" },
    { name: "Data processing", tex: "H(f(X))\\le H(X)", lesson: "data-processing" },
    { name: "Shearer", tex: "rH(X)\\le\\sum_jH(X_{A_j})", lesson: "shearer" },
    { name: "Fractional Shearer", tex: "H(X)\\le\\sum_A\\alpha_AH(X_A)", lesson: "fractional-cover" },
    { name: "Loomis–Whitney", tex: "|S|^{d-1}\\le\\prod_i|\\pi_i(S)|", lesson: "loomis-whitney" },
    { name: "Bregman", tex: "\\operatorname{per}(A)\\le\\prod_i(d_i!)^{1/d_i}", lesson: "bregman" },
  ];
  const TECHNIQUES = ["uniform random object", "support-size entropy bound", "maximum entropy", "binary entropy", "joint entropy", "conditional entropy", "chain rule",
    "conditioning reduces entropy", "subadditivity", "mutual information", "KL divergence", "entropy maximization", "indicator encoding", "random reveal ordering",
    "Shearer's inequality", "combinatorial Shearer", "fractional covers", "Loomis–Whitney", "projection inequalities", "Bregman's theorem", "perfect matching entropy",
    "compression method", "typical sets", "method of types", "multinomial entropy", "set-system entropy", "data processing", "sumset entropy", "hypergraph entropy"];
  const TECHNIQUE_LESSON = { "entropy maximization": "kl-divergence", "conditional entropy": "constrained-strings", "conditioning reduces entropy": "conditioning",
    "Shearer's inequality": "shearer", "support-size entropy bound": "support-bound", "Bregman's theorem": "bregman", "perfect matching entropy": "perfect-matchings" };
  function techniqueLesson(t) {
    if (TECHNIQUE_LESSON[t]) return TECHNIQUE_LESSON[t];
    const hit = L.find((l) => l.technique === t) || L.find((l) => l.title.toLowerCase().includes(t.toLowerCase().split(" ")[0]));
    return hit ? hit.id : "counting";
  }
  const FAILURES = [
    { title: "Choosing the wrong random object", body: "Entropy only helps if $H(X)$ is directly related to the count you care about.", lesson: "counting" },
    { title: "Using coordinates that do not determine the object", body: "If object → coordinates is not injective, account for the lost information $H(X\\mid\\text{coordinates})$.", lesson: "data-processing" },
    { title: "Forgetting dependence too early", body: "Subadditivity may create enormous slack: keep the conditioning that carries the constraint.", lesson: "constrained-strings" },
    { title: "Bounding support instead of actual conditional support", body: "The strength often comes from $H(X_i\\mid\\text{previous})$ rather than $H(X_i)$.", lesson: "bregman" },
    { title: "Assuming independence", body: "The method exploits dependent variables; never assume a product.", lesson: "mutual-information" },
    { title: "Confusing entropy with the logarithm of the support", body: "Only uniform distributions have $H(X)=\\log|\\operatorname{supp}X|$; in general it is an upper bound.", lesson: "entropy" },
    { title: "Treating entropy as an asymptotic-only tool", body: "Many entropy arguments give exact finite inequalities, as every check in this lab shows.", lesson: "edge-isoperimetric" },
  ];
  const WHEN = {
    use: "you want to count a finite family and an object admits a natural coordinate description",
    especially: ["coordinates overlap", "coordinates are dependent", "local projections are easy to count", "conditional choices are easier than global counting",
      "a random reveal order simplifies local complexity", "direct injections are awkward"],
    guide: ["Can I sample a uniform random object?", "Can I encode it by local variables?", "Can I bound their entropy individually or conditionally?", "Try entropy."],
  };
  const CHECKLIST = ["What family am I trying to count?", "Can I sample one object uniformly?", "What variables determine that object?", "Is H(X) literally log of the desired count?",
    "Should I expose coordinates individually, conditionally, or through overlapping projections?", "What simple support bound applies locally?",
    "Would a random order make the conditional supports easier?", "Is there a Shearer/fractional-cover structure?", "Where do I lose information?",
    "What does equality suggest about the extremal configuration?"];
  const ARCHITECTURES = {
    bregman: ["uniform random matching", "coordinate variables", "chain rule", "random reveal order", "bound conditional entropy by available choices", "average", "factorials", "exponentiate"],
    "random-reveal": ["choose a random combinatorial object", "encode it by local variables", "reveal variables in random order", "use chain rule", "bound each conditional entropy by log(number of options)", "average over reveal order", "exponentiate"],
    shearer: ["uniform random object", "coordinates", "overlapping views A₁..A_m", "chain rule inside each view", "conditioning: drop to the global past", "count coverage r", "rH(X) ≤ Σ H(X_A)"],
    "loomis-whitney": ["geometry", "random point", "entropy projections", "Shearer with r = d−1", "support bound on shadows", "geometric counting bound"],
    binomial: ["uniform k-subset", "indicator bits", "subadditivity", "symmetry: marginal k/n", "binary entropy", "exponentiate"],
  };
  function architecture(lesson) {
    if (ARCHITECTURES[lesson.id]) return ARCHITECTURES[lesson.id];
    return ["combinatorial family", "sample uniformly: " + (lesson.identity ? lesson.identity.replace(/\\/g, "") : "H(X) = log|F|"), "choose coordinates",
      ...lesson.proof.map((s) => s.why), "counting bound"].filter((x, i, a) => a.indexOf(x) === i);
  }
  const MAP = {
    nodes: [
      { id: "counting", label: "COMBINATORIAL FAMILY 𝓕", x: 50, y: 5 }, { id: "entropy", label: "H(X) = log |𝓕|", x: 50, y: 17 },
      { id: "support-bound", label: "SUPPORT BOUNDS", x: 14, y: 33 }, { id: "conditioning", label: "CONDITIONING", x: 50, y: 33 }, { id: "shearer", label: "PROJECTIONS", x: 86, y: 33 },
      { id: "chain-rule", label: "CHAIN RULE", x: 50, y: 48 }, { id: "combinatorial-shearer", label: "SHEARER", x: 86, y: 48 },
      { id: "random-reveal", label: "RANDOM REVEAL", x: 50, y: 63 }, { id: "loomis-whitney", label: "LOOMIS–WHITNEY", x: 86, y: 63 },
      { id: "binomial", label: "BINOMIAL BOUNDS", x: 14, y: 63 }, { id: "bregman", label: "BREGMAN", x: 50, y: 78 }, { id: "method-of-types", label: "TYPES", x: 14, y: 78 },
      { id: "typical-set", label: "ASYMPTOTIC COUNTING", x: 14, y: 93 }, { id: "fractional-cover", label: "FRACTIONAL COVERS", x: 86, y: 78 }, { id: "proof-design", label: "PROOF DESIGN", x: 50, y: 93 },
    ],
    edges: [["counting", "entropy"], ["entropy", "support-bound"], ["entropy", "conditioning"], ["entropy", "shearer"], ["conditioning", "chain-rule"], ["shearer", "combinatorial-shearer"],
      ["chain-rule", "random-reveal"], ["combinatorial-shearer", "loomis-whitney"], ["support-bound", "binomial"], ["random-reveal", "bregman"], ["binomial", "method-of-types"],
      ["method-of-types", "typical-set"], ["loomis-whitney", "fractional-cover"], ["bregman", "proof-design"]],
  };

  /* ================= Slides: one model for presentation and Markdown ================= */
  const byId = (id) => L.find((l) => l.id === id) || null;
  const state = (lesson, s) => ({ lesson, state: s });
  function verifyFrame(lesson) {
    const ex = lesson.example(E);
    if (!ex.md) return null;
    return { title: `Verify: ${lesson.short}`, steps: [ex.md], say: ex.say || `The finite check confirms the ${lesson.short} bound.`, state: state(lesson.id, "verify") };
  }
  function theoremFrames(lesson) {
    const out = [{ title: lesson.title, steps: [lesson.problem, lesson.theorem], say: `${plain(lesson.problem) || `The question: ${lesson.title.toLowerCase()}.`} ${lesson.proof[lesson.proof.length - 1].say}`.trim(), state: state(lesson.id, "theorem") }];
    return out;
  }
  function proofFrames(lesson) {
    const frames = [];
    if (lesson.family || lesson.randomObject) frames.push({ title: `${lesson.short}: the encoding`, steps: [[lesson.family && `Family: ${lesson.family}`, lesson.randomObject && `Random object: ${lesson.randomObject}`, lesson.identity && `$$${lesson.identity}$$`].filter(Boolean).join("\n\n")],
      say: `Choose a uniformly random object and encode it.`, state: state(lesson.id, "encoding") });
    frames.push({ title: `${lesson.short}: claim`, steps: [lesson.theorem], say: plain(lesson.proof[lesson.proof.length - 1].say), state: state(lesson.id, "claim") });
    frames.push({ title: `${lesson.short}: proof`, steps: lesson.proof.map((s) => `${s.md} *(${s.why})*`), say: lesson.proof.map((s) => s.say).join(" "), state: state(lesson.id, "proof"),
      notes: lesson.clever ? `Clever move: ${lesson.clever}` : "" });
    const v = verifyFrame(lesson);
    if (v) frames.push(v);
    return frames;
  }
  function problemFrames(lesson) {
    const hints = lesson.hints || [];
    return [
      { title: `Problem: ${lesson.short}`, steps: [lesson.problem], say: plain(lesson.problem) || `The problem: ${lesson.title.toLowerCase()}.`, state: state(lesson.id, "problem") },
      ...(hints.length ? [{ title: "Hints", steps: hints.map((h, i) => `Hint ${i + 1}: ${h}`), say: "Reveal the hints one at a time.", state: state(lesson.id, "hints") }] : []),
      { title: "Solution", steps: [lesson.solution || lesson.theorem, `What was the clever move? ${lesson.clever}`], say: "Here is the solution and its clever move.", state: state(lesson.id, "solution") },
    ];
  }
  /* Spoken text from Markdown: strip maths and markup to plain prose. */
  function plain(s) {
    if (/\$/.test(String(s || ""))) return "";
    return String(s || "").replace(/\$\$?[^$]*\$\$?/g, "this").replace(/[*_`#|<>\\$]/g, "").replace(/\s+/g, " ").trim();
  }
  const CORE_ARC = [
    ["Information and counting", ["counting", "entropy", "support-bound", "joint-entropy", "chain-rule", "conditioning", "subadditivity"]],
    ["Binomial bounds", ["binary-entropy", "binomial", "mutual-information"]],
    ["Projections", ["shearer", "combinatorial-shearer", "loomis-whitney", "fractional-cover", "hypergraph"]],
    ["Matchings", ["perfect-matchings", "random-reveal", "bregman"]],
    ["Compression and asymptotics", ["compression", "typical-set", "method-of-types", "set-systems", "additive"]],
    ["Proof design", ["proof-design"]],
  ];
  function deckModel(kind, lessonId) {
    const lesson = byId(lessonId) || byId("counting");
    const meta = { title: "Entropy Methods in Combinatorics", author: "Yu Jie Teo", voice: "bf_emma" };
    if (kind === "theorem") return { meta: { ...meta, subtitle: lesson.title }, say: `${lesson.title}.`, sections: [{ title: lesson.title, frames: theoremFrames(lesson) }] };
    if (kind === "proof") return { meta: { ...meta, subtitle: `Proof: ${lesson.title}` }, say: `An entropy proof: ${lesson.title}.`, sections: [{ title: lesson.title, frames: proofFrames(lesson) }] };
    if (kind === "problem") return { meta: { ...meta, subtitle: `Problem: ${lesson.title}` }, say: `A problem on ${lesson.short}.`, sections: [{ title: lesson.title, frames: problemFrames(lesson) }] };
    /* The full core deck: one slide per lesson on the arc, proofs revealed step by step, plus a closing. */
    const sections = CORE_ARC.map(([title, ids]) => ({ title, frames: ids.map((id) => {
      const l = byId(id), v = l.example(E);
      return { title: l.title, steps: [l.problem, l.theorem, ...l.proof.map((s) => s.md), ...(v.md ? [v.md] : [])], say: [plain(l.problem), ...l.proof.map((s) => s.say), v.say].filter(Boolean).join(" "),
        state: state(id, "core"), notes: l.clever ? `Clever move: ${l.clever}` : "" };
    }) }));
    sections.at(-1).frames.push(
      { title: "When entropy works", steps: [`Use entropy when ${WHEN.use}, especially when:`, WHEN.especially.map((x) => `- ${x}`).join("\n")], say: "Use entropy when an object has a natural coordinate description, especially when the coordinates overlap or depend on each other.", state: state("proof-design", "when") },
      { title: "Where proof slack enters", steps: FAILURES.slice(2, 5).map((x) => `**${x.title}.** ${x.body}`), say: "Slack enters wherever dependence is forgotten or a conditional support is replaced by a larger one.", state: state("proof-design", "slack") },
      { title: "The master pattern", steps: ["COUNT → RANDOMIZE → ENCODE", "→ DECOMPOSE INFORMATION → THROW AWAY ONLY THE DEPENDENCE YOU CAN AFFORD", "→ BOUND LOCAL UNCERTAINTY → ADD INFORMATION COSTS → EXPONENTIATE"],
        say: "Count, randomise, encode, decompose, throw away only the dependence you can afford, bound local uncertainty, add the costs and exponentiate.", state: state("proof-design", "master"),
        notes: "Ask the audience what is being counted before introducing any random variables. The point is that randomness is being added to the proof, not to the statement of the theorem." });
    return { meta: { ...meta, subtitle: "Entropy as a counting technology" }, say: "Entropy as a counting technology: turning a count into an information budget.", sections };
  }

  /* Write a deck model as beamdswitch Markdown: front matter, # sections, ## frames, `. . .` between
     logical moves, ::: notes and ::: narration, with the lab state riding along as an HTML comment. */
  function toMarkdown(model) {
    const one = (s) => String(s).replace(/\s+/g, " ").trim();
    const say = (s) => one(s).replace(/[$\\`*_#|<>%&≈×·]/g, " ").replace(/\s+/g, " ").trim();
    const safe = (s) => String(s).split("\n").map((ln) => (/^\s*(#{1,6}\s|:{3,})/.test(ln) ? " " + ln.replace(/^\s*/, "") : ln)).join("\n");
    const m = model.meta, out = ["---"];
    for (const k of ["title", "subtitle", "author", "voice"]) if (m[k]) out.push(`${k}: ${one(m[k])}`);
    out.push("---", "", "::: narration", say(model.say), ":::", "");
    for (const sec of model.sections) {
      out.push(`# ${one(sec.title)}`, "", "::: narration", say(`${sec.title}.`), ":::", "");
      for (const fr of sec.frames) {
        out.push(`## ${one(fr.title)}`, "");
        fr.steps.forEach((s, i) => { if (i) out.push(". . .", ""); out.push(safe(s), ""); });
        if (fr.state) out.push("<!-- beam-md-switch", `lesson: ${fr.state.lesson}`, `state: ${fr.state.state}`, "-->", "");
        if (fr.notes) out.push("::: notes", safe(fr.notes), ":::", "");
        out.push("::: narration", say(fr.say) || "This slide continues the argument.", ":::", "");
      }
    }
    return out.join("\n");
  }
  const deck = (kind, lessonId) => toMarkdown(deckModel(kind, lessonId));

  /* ================= Verification (spec §74): deterministic self-tests ================= */
  function selfTests() {
    const T = [], t = (name, pass, detail = "") => T.push({ name, pass: !!pass, detail: String(detail) });
    const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
    t("Uniform entropy: H = log2 N for N = 1..64", E.range(64).every((i) => close(E.entropyCounts(new Array(i + 1).fill(5)), Math.log2(i + 1))));
    t("Maximum entropy: H ≤ log N on 200 deterministic weightings", E.range(200).every((s) => { const g = E.lcg(s + 1), w = E.range(2 + (s % 6)).map(() => Math.floor(g() * 9)); return w.every((x) => !x) || E.entropyCounts(w) <= Math.log2(w.filter((x) => x > 0).length) + 1e-9; }));
    for (const [n, k] of [[10, 3], [9, 4], [12, 6]]) { const b = E.binomialBound(n, k); t(`C(${n},${k}) = ${c(b.exact)} ≤ 2^(${n}·h(${k}/${n})) = ${f(b.bound, 5)}`, Number(b.exact) <= b.bound); }
    t("Binomial bound holds for every 0 ≤ k ≤ n ≤ 30", E.range(31).every((n) => E.range(n + 1).every((k) => { const b = E.binomialBound(n, k); return b.log2Exact <= b.exponent + 1e-9 && b.bound <= b.ek * (1 + 1e-12); })));
    t("Multinomial bound holds for every type with n ≤ 9, q = 3", E.range(10).every((n) => E.types(n, 3).every((m) => m.log2Exact <= m.exponent + 1e-9)));
    t("Hamming ball ≤ 2^(n h(k/n)) for k ≤ n/2, n ≤ 30", E.range(31).every((n) => E.range(Math.floor(n / 2) + 1).every((k) => { const b = E.hammingBall(n, k); return E.log2Big(b.exact) <= Math.log2(b.entropy) + 1e-9; })));
    const c6 = E.bregman(MATCHINGS.c6.adj), k33 = E.bregman(MATCHINGS.k33.adj);
    t(`C₆: per = ${c(c6.permanent)}, Bregman ${f(c6.bound, 5)} = 2^(3/2)`, c6.permanent === 2n && close(c6.bound, Math.pow(2, 1.5)));
    t(`K₃,₃: per = ${c(k33.permanent)} = Bregman bound (tight)`, k33.permanent === 6n && k33.tight);
    t("Bregman holds on every preset", Object.values(MATCHINGS).every((g) => { const b = E.bregman(g.adj); return Number(b.permanent) <= b.bound * (1 + 1e-12) && BigInt(E.perfectMatchings(g.adj).length) === b.permanent; }));
    t("Random reveal: N_i uniform on {1..d_i} for every matching, every preset", Object.values(MATCHINGS).every((g) => E.revealAverages(g.adj).uniformEveryMatching));
    t("Averaging identity: (1/d) Σ log k = log(d!)/d for d = 1..12", E.range(12).every((i) => { const a = E.averagingIdentity(i + 1); return close(a.average, a.logFactOverD); }));
    t("Shearer holds for every family × cover on 4 coordinates", Object.values(FAMILY4).every((F) => Object.values(COVERS4).every((C) => { const s = E.shearer(F.make(), C.sets); return s.r === 0 || (s.entropyHolds && s.countHolds); })));
    t("Shearer is tight on {0,1}⁴ with the cycle cover", E.shearer(FAMILY4["all-binary"].make(), COVERS4.cycle.sets).tight);
    t("Loomis–Whitney |S|² ≤ product of three shadows on every preset", Object.values(POINTS3).every((P) => E.loomisWhitney(P.pts()).holds));
    t("Loomis–Whitney on 300 deterministic subsets of {0,1,2}³", E.range(300).every((s) => { const g = E.lcg(7 * s + 3); return E.loomisWhitney(E.product([3, 3, 3]).filter(() => g() < 0.4)).holds; }));
    t("Loomis–Whitney is tight on a box", E.loomisWhitney(POINTS3.box.pts()).tight);
    t("Edges in A ⊆ {0,1}³: e(A) ≤ ½|A| log2 |A| for all 256 subsets", E.range(256).every((v) => E.cubeEdges(E.range(8).filter((i) => (v >> i) & 1), 3).holds));
    t("Fractional covers: every valid candidate bounds the staircase", E.bestCover(POINTS3.staircase.pts(), COVER_CANDIDATES).scored.every((x) => !x.result.valid || x.result.countBound >= Number(x.result.size) - 1e-9));
    t("Han: average H(X_A)/k is non-increasing in k on every 4-coordinate family", Object.values(FAMILY4).every((F) => E.han(F.make()).every((x, i, a) => !i || x.perCoord <= a[i - 1].perCoord + 1e-9)));
    t("Set-system bound holds on 100 deterministic families over [5]", E.range(100).every((s) => { const g = E.lcg(s + 11), sets = E.range(1 + (s % 9)).map(() => E.range(5).filter(() => g() < 0.5)); const r = E.setSystem(sets, 5); return r.log2Size <= r.sum + 1e-9; }));
    t("Sperner on n = 4: largest antichain = C(4,2) = 6", E.largestAntichain(4) === 6);
    t("Chain rule sums to H(X) in every order for permutations of 4", E.permutations(4).every((o) => close(E.chainRule(E.family("permutations", 4), o).total, Math.log2(24))));
    t("Path colourings: count = q(q−1)^(n−1); cycle formula matches enumeration", [2, 3, 4].every((q) => E.range(7).every((i) => BigInt(E.colourings(i + 2, q, false).length) === E.pathColourCount(i + 2, q) && BigInt(E.colourings(i + 2, q, true).length) === E.cycleColourCount(i + 2, q))));
    t("Bits and nats: counting bounds agree after exponentiation", [3.7, 10 * E.h(0.3), c6.bits].every((b) => close(E.countFrom(E.inUnit(b, "nats"), "nats"), E.countFrom(b, "bits"))));
    t("Sumset: H(X+Y) ≤ log|A+B| on 50 deterministic pairs", E.range(50).every((s) => { const g = E.lcg(s + 5), A = E.range(10).filter(() => g() < 0.4), B = E.range(10).filter(() => g() < 0.4); return !A.length || !B.length || E.sumset(A, B).holds; }));
    t("Every lesson's example runs and every deck parses into frames", L.every((l) => { const ex = l.example(E); return Array.isArray(ex.rows); }));
    return T;
  }

  return { LESSONS: L, LABS, selfTests, PROBLEMS, COMPARISONS, ENCODE_FAMILIES, ATLAS, TECHNIQUES, techniqueLesson, FAILURES, WHEN, CHECKLIST, MAP,
    MATCHINGS, POINTS3, FAMILY4, COVERS4, COVER_CANDIDATES, HYPEREDGES, CORE_ARC,
    byId, architecture, deckModel, toMarkdown, deck, plain };
});
