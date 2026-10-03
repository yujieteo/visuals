/* Generating Functions Lab: the curriculum, problem ladder, verification engine and beamdswitch reports.
 *
 * One data model drives the page, the in-page presentation and the Markdown export: each lesson
 * lists its problem, generating function, coefficient function, independent check and its states
 * (stage, title, formulas, text and narration). The page draws states as steps; the deck writes the
 * same states, in the same order, as frames whose formulas reveal one `. . .` at a time.
 * No DOM. In the browser this is `self.GFLab` (it reads `self.GF`); in Node it requires engine.js.
 */
/** @typedef {GFTypes.Rat} Rat */
/** @typedef {GFTypes.Exact} Exact */
/** @typedef {bigint | Rat} Coef  a coefficient: an integer count, or a rational for EGFs and probabilities */
/**
 * A lesson's parameter values, keyed by parameter name. Each value is one of the choices its spec lists, a
 * number or a string, and each lesson reads its own parameters by name, so the values stay untyped here.
 * @typedef {Record<string, any>} Params
 */
/** @typedef {{ label: string, values: (number | string)[], def: number | string, valid?: (v: any, p: Params) => boolean }} ParamSpec */
/** @typedef {{ id: string, stage: string, title: string, tex: string[], text: string, say: string }} State  one step of a lesson */
/** @typedef {{ name: string, gf: string, other: string, method: string, pass: boolean, tol?: number }} Check */
/** @typedef {{ items: unknown[], total: number }} ObjectList  the first objects of a size, and how many there are */
/**
 * @typedef {object} LessonFields
 * @property {string} id
 * @property {string} sayProblem
 * @property {number} level
 * @property {string} hash
 * @property {string[]} aliases
 * @property {string} title
 * @property {string} nav
 * @property {string} branch
 * @property {number} difficulty
 * @property {string[]} prerequisites
 * @property {string[]} related
 * @property {string[]} techniques
 * @property {string} gfType
 * @property {string} visual
 * @property {string} problem
 * @property {string} discreteModel
 * @property {string} when
 * @property {string} key
 * @property {{ def: number, min: number, max: number } | null} n
 * @property {string | null} gfName
 * @property {(p: Params) => string} [closed]
 * @property {(N: number, p: Params) => Coef[]} [coeffs]
 * @property {((n: number, p: Params) => Coef) | null} [enumerate]
 * @property {string} [enumLabel]
 * @property {(n: number, p: Params) => ObjectList} [objects]
 * @property {(n: number, v: Coef, p: Params) => string} [answer]
 * @property {(p: Params) => Record<string, string>} [reps]
 * @property {(n: number, p: Params) => Check[]} [checks]
 * @property {boolean} [analytic]
 * @property {Record<string, ParamSpec>} [params]
 * @property {boolean | ((p: Params) => boolean)} [egf]
 * @property {string} [variable]
 * @property {boolean} [optional]
 */
/**
 * A lesson. Its states take n as null only when the lesson has no n; the lessons that read n declare it a number.
 * @typedef {LessonFields & { states(p: Params, n: number | null): State[] }} Lesson
 */
/**
 * @typedef {object} Problem  one rung of the problem ladder
 * @property {number} k
 * @property {string} say
 * @property {string} title
 * @property {string} lesson
 * @property {Params} [params]
 * @property {string} technique
 * @property {number} difficulty
 * @property {string} problem
 * @property {string} visualHint
 * @property {{ n: number, value?: Exact, approx?: boolean, lesson?: string }} ask
 * @property {(n: number) => Exact} [answerFn]
 * @property {string[]} hints
 * @property {string} solution
 */
/** @typedef {{ page: "lesson", id: string, n: number | null, params: Params, unknown?: string }} LessonRoute  n is null for a lesson without one */
/** @typedef {{ page: "problem", k: number }} ProblemRoute */
/** @typedef {{ page: "compare", id?: string }} CompareRoute */
/** @typedef {{ page: "fourier", N?: number }} FourierRoute */
/** @typedef {{ page: "problems" | "sandbox" | "map" | "techniques" | "confusions" }} PlainRoute */
/** @typedef {LessonRoute | ProblemRoute | CompareRoute | FourierRoute | PlainRoute} Route  the page a hash names */
/** @typedef {{ page: "lesson", id?: string, n?: number | null, params?: Params } | Exclude<Route, LessonRoute>} RouteRef  a link to a page; a lesson link may leave out n and parameters */
/** @typedef {{ kind: string, label: string, route: RouteRef, text: string }} SearchEntry */
/** @typedef {GFTypes.BeamdswitchFrame & { _state?: { lesson: string, state: string, n?: number | null, params?: Params } }} Frame  a deck frame, with the lab state it shows */
/** @typedef {{ meta: { title: string, subtitle?: string, voice?: string }, narration: string, notes?: string, setup: Frame[], method: Frame[], results: Frame[], checks: Frame[] }} Report */
/** @typedef {{ kind: string, title: string, subtitle?: string, section?: string } & Partial<Frame>} Slide */
(function (root, factory) {
  const G = typeof module === "object" && module.exports ? require("./engine.js") : root.GF;
  const api = factory(G);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GFLab = api;
})(typeof self !== "undefined" ? self : this, /** @param {typeof GF} G */ function (G) {
  "use strict";
  const { B, Q, qstr, fmtInt } = G;
  /** @param {Exact} x */
  const val = (x) => (G.isQ(x) ? qstr(x) : fmtInt(x));
  /** @param {number} n */
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  /* The stages of the lab's cycle; a deck puts object states in Set-up and encode/manipulate states in Method. */
  const STAGES = ["problem", "object", "encode", "manipulate", "read", "answer", "verify"];

  /* Concept-map branches, in curriculum order. */
  const BRANCHES = [
    { id: "ogf", title: "Sequences and OGFs" },
    { id: "recurrence", title: "Recurrences" },
    { id: "products", title: "Products and constructions" },
    { id: "composition", title: "Composition and trees" },
    { id: "egf", title: "Labelled objects (EGF)" },
    { id: "marking", title: "Marking and probability" },
    { id: "fourier", title: "Roots of unity and the DFT" },
    { id: "rational", title: "Automata and partitions" },
    { id: "asymptotics", title: "Asymptotics" },
    { id: "extended", title: "Extensions and synthesis" },
  ];

  /** @type {Record<string, Rat>} */
  const ALPHAS = { "1/2": Q(1, 2), "2/3": Q(2, 3), "1": Q(1), "3/2": Q(3, 2), "2": Q(2), "3": Q(3) };
  /** @param {number} N */
  const fibShift = (N) => G.fibonacciGF(N + 1).slice(1); // 1, 1, 2, 3, 5, …: a_n = F_{n+1}
  /** @param {unknown[]} arr @param {number} [max] @returns {ObjectList} */
  const objList = (arr, max = 60) => ({ items: arr.slice(0, max), total: arr.length });

  /* ---------- lessons ---------- */
  /** @type {Lesson[]} */
  const LESSONS = [
    {
      id: "ogf", sayProblem: "Encode the constant sequence one, one, one, as a single formal power series.", level: 0, hash: "ogf", aliases: ["what-is-a-gf", "sequence-encoding"], title: "What is a generating function?", nav: "Encoding", branch: "ogf", difficulty: 1,
      prerequisites: [], related: ["geometric-series", "shift"], techniques: ["sequence encoding", "coefficient extraction", "ordinary generating functions"], gfType: "OGF", visual: "strip",
      problem: "Encode the constant sequence $1, 1, 1, 1, \\ldots$ as a single formal power series.",
      discreteModel: "One object of every size: a single row of n identical blocks.",
      when: "Use an encoding whenever you want to treat a whole sequence as one algebraic object.",
      key: "A generating function is an encoding of coefficients, not primarily a function to plug numbers into.",
      n: { def: 5, min: 0, max: 20 }, gfName: "A(x)", closed: () => "\\frac{1}{1-x}",
      coeffs: (N) => G.seriesFrom([], N).map(() => 1n),
      enumerate: (n) => BigInt(G.compositionsList([1], n).length), enumLabel: "rows of n unit blocks, listed",
      objects: (n) => objList([n === 0 ? "∅" : "▪".repeat(n)]),
      answer: (n, v) => `There is ${val(v)} object of size ${n}, so the coefficient of x${G.sup(n)} is ${val(v)}.`,
      reps: () => ({ sequence: "1, 1, 1, 1, …", series: "1 + x + x² + x³ + ⋯", closed: "1/(1 − x)", recurrence: "a₀ = 1, aₙ = aₙ₋₁", class: "SEQ(Z) with one object per size", roots: "finite truncation: values at roots of unity in the Fourier lab", asymptotic: "aₙ = 1" }),
      states: () => [
        { id: "strip", stage: "object", title: "A sequence is a strip of coefficients", tex: ["a_0, a_1, a_2, \\ldots = 1, 1, 1, \\ldots"], text: "Each bar of the strip is one number a_n, the count of objects of size n.", say: "Start with the sequence one, one, one, and so on. Each entry counts the objects of one size." },
        { id: "tape", stage: "encode", title: "Attach each coefficient to a power of x", tex: ["A(x) = \\sum_{n\\ge 0} a_n x^n = 1 + x + x^2 + x^3 + \\cdots"], text: "The power of x is a label saying which position a coefficient came from.", say: "Attach each coefficient to a power of x. The exponent is just a label for the position." },
        { id: "fold", stage: "manipulate", title: "The whole tape folds into one expression", tex: ["(1-x)(1 + x + \\cdots + x^N) = 1 - x^{N+1}", "\\frac{1}{1-x} = 1 + x + x^2 + \\cdots"], text: "Multiplying by (1 − x) telescopes every truncation; as formal series the identity holds coefficient by coefficient.", say: "Multiply the truncated tape by one minus x and everything telescopes. So the whole tape is one over one minus x." },
        { id: "extract", stage: "manipulate", title: "Equality means equal coefficients", tex: ["[x^n]\\,\\frac{1}{1-x} = 1"], text: "The bracket [xⁿ] reads off a coefficient; it is how every answer in this lab is decoded.", say: "Equality of generating functions means every coefficient agrees. The coefficient of x to the n of one over one minus x is one." },
      ],
      checks: (n) => {
        const N = n + 1, tape = G.seriesFrom([], N).map(() => 1n), lhs = G.mul([1n, -1n], tape, N + 1), want = G.zeros(N + 1); want[0] = 1n; want[N] = -1n;
        return [{ name: `(1 − x)(1 + ⋯ + x${G.sup(n)}) = 1 − x${G.sup(n + 1)}`, gf: lhs.map(String).join(","), other: want.map(String).join(","), method: "exact polynomial product", pass: lhs.every((c, i) => c === want[i]) }];
      },
    },
    {
      id: "geometric-series", sayProblem: "How many ways can an amount n be built from identical unit pieces?", level: 1, hash: "geometric-series", aliases: ["geometric"], title: "Geometric series", nav: "Geometric series", branch: "ogf", difficulty: 1,
      prerequisites: ["ogf"], related: ["ogf", "compositions", "singularities"], techniques: ["geometric series"], gfType: "OGF", visual: "geometric", analytic: true,
      problem: "How many ways can an amount $n$ be composed entirely of identical unit pieces?",
      discreteModel: "Rows of identical unit pieces; exactly one row has total n.",
      when: "Use the geometric series whenever an object is any number of copies of one thing.",
      key: "The formal identity 1 + x + x² + ⋯ = 1/(1 − x) needs no convergence; |x| < 1 matters only in the analytic view.",
      n: { def: 6, min: 0, max: 20 }, params: { N: { label: "truncate at degree N", values: [2, 4, 6, 8, 12, 16], def: 6 } }, gfName: "A(x)", closed: () => "\\frac{1}{1-x}",
      coeffs: (N) => G.seriesFrom([], N).map(() => 1n),
      enumerate: (n) => BigInt(G.compositionsList([1], n).length), enumLabel: "compositions into unit parts, listed",
      objects: (n) => objList(G.compositionsList([1], n).map((c) => (c.length ? c.map(() => "▪").join("") : "∅"))),
      answer: (n, v) => `There is exactly ${val(v)} way to build ${n} from unit pieces.`,
      reps: () => ({ sequence: "1, 1, 1, …", series: "1 + x + x² + ⋯", closed: "1/(1 − x)", recurrence: "aₙ = aₙ₋₁", class: "SEQ(Z)", asymptotic: "pole at x = 1, aₙ = 1ⁿ" }),
      states: (p) => [
        { id: "blocks", stage: "object", title: "Repeated blocks", tex: ["\\text{one piece} \\mapsto x"], text: "One unit piece has size 1, so it is encoded by x.", say: "One unit piece has size one, so it becomes x." },
        { id: "partial", stage: "encode", title: `Truncate at degree ${p.N}`, tex: [`1 + x + \\cdots + x^{${p.N}} = \\frac{1 - x^{${p.N + 1}}}{1-x}`], text: "Every truncation is an honest polynomial identity.", say: `Cut the series off at degree ${p.N}. That is an honest polynomial identity.` },
        { id: "formal", stage: "manipulate", title: "Formal identity", tex: ["\\sum_{n\\ge0} x^n = \\frac{1}{1-x}"], text: "As formal power series the identity holds because every coefficient agrees, whatever x is.", say: "As formal series, the identity holds coefficient by coefficient. No value of x is involved." },
        { id: "analytic", stage: "manipulate", title: "Analytic convergence", tex: ["\\left|1 + x + \\cdots + x^N - \\frac{1}{1-x}\\right| = \\frac{|x|^{N+1}}{|1-x|} \\to 0 \\text{ for } |x| < 1"], text: "Only when we plug in numbers do we need |x| < 1; the pole at x = 1 is what the analytic view sees.", say: "Only when we plug in a number do we need x smaller than one in size. The pole at one is what the analytic view sees." },
      ],
      checks: (n, p) => {
        const N = p.N, x = 0.5, partial = G.evalAt(G.seriesFrom([], N + 1).map(() => 1n), x), exact = 1 / (1 - x), err = Math.abs(partial - exact), bound = Math.pow(x, N + 1) / (1 - x);
        return [{ name: `partial sum at x = ½ vs 1/(1 − x), N = ${N}`, gf: G.fmtNum(partial, 8), other: G.fmtNum(exact, 8), method: `float, error ${G.fmtNum(err, 3)} equals |x|^{N+1}/|1−x| within 1e−12`, pass: Math.abs(err - bound) < 1e-12, tol: 1e-12 }];
      },
    },
    {
      id: "shift", sayProblem: "Take the shifted Fibonacci strip one, one, two, three, five. What does x cubed times its generating function encode?", level: 2, hash: "shift", aliases: ["shifting"], title: "Shifts", nav: "Shifts", branch: "ogf", difficulty: 1,
      prerequisites: ["ogf"], related: ["fibonacci", "differentiation"], techniques: ["shifting"], gfType: "OGF", visual: "shift",
      problem: "With $a_n = F_{n+1}$ (the strip $1, 1, 2, 3, 5, 8, \\ldots$), what sequence does $x^3A(x)$ encode?",
      discreteModel: "aₙ counts compositions of n into parts 1 and 2; multiplying by x³ prepends three empty positions.",
      when: "Use a shift when a sequence is the same as another one, delayed by a fixed amount.",
      key: "Multiplying by x^k slides the coefficient strip k places right: [xⁿ] x^k A(x) = aₙ₋ₖ.",
      n: { def: 6, min: 0, max: 20 }, params: { k: { label: "shift k", values: [0, 1, 2, 3, 4, 5], def: 3 } }, gfName: "x^kA(x)", closed: (p) => `\\frac{x^{${p.k}}}{1-x-x^2}`,
      coeffs: (N, p) => G.shift(fibShift(N), p.k, N),
      enumerate: (n, p) => (n < p.k ? 0n : BigInt(G.compositionsList([1, 2], n - p.k).length)), enumLabel: "compositions of n − k into 1s and 2s, listed",
      objects: (n, p) => objList(n < p.k ? [] : G.compositionsList([1, 2], n - p.k).map((c) => "···".slice(0, p.k) + "|" + (c.join("+") || "∅"))),
      answer: (n, v, p) => `[x${G.sup(n)}] x${G.sup(p.k)}A(x) = a${G.subs(Math.max(n - p.k, 0))}${n < p.k ? " (none: n < k)" : ""} = ${val(v)}.`,
      reps: (p) => ({ sequence: `${"0, ".repeat(p.k)}1, 1, 2, 3, 5, …`, series: `x${G.sup(p.k)} + x${G.sup(p.k + 1)} + 2x${G.sup(p.k + 2)} + ⋯`, closed: `x${G.sup(p.k)}/(1 − x − x²)`, recurrence: `bₙ = aₙ₋${G.subs(p.k)}` }),
      states: (p) => [
        { id: "strip", stage: "object", title: "The strip of A(x)", tex: ["A(x) = 1 + x + 2x^2 + 3x^3 + 5x^4 + \\cdots"], text: "Here aₙ = Fₙ₊₁, the number of ways to write n as an ordered sum of 1s and 2s.", say: "Take the strip one, one, two, three, five, the Fibonacci numbers shifted by one." },
        { id: "slide", stage: "manipulate", title: `Slide ${p.k} positions`, tex: [`x^{${p.k}}A(x) = \\sum_n a_n x^{n+${p.k}}`], text: "Multiplying every term by x^k raises every exponent by k: the strip moves right and zeros fill in.", say: `Multiplying by x to the ${p.k} raises every exponent by ${p.k}. The strip slides right and zeros fill the gap.` },
        { id: "rule", stage: "manipulate", title: "The shift rule", tex: ["[x^n]\\,x^kA(x) = a_{n-k}"], text: "Read the coefficient by looking k places to the left in the original strip.", say: "So the coefficient of x to the n is the original coefficient k places earlier." },
      ],
      checks: (n, p) => { const a = fibShift(n + 1), s = G.shift(a, p.k, n + 1); return [{ name: "shifted strip equals the strip read k places earlier", gf: fmtInt(s[n]), other: fmtInt(n >= p.k ? a[n - p.k] : 0n), method: "exact", pass: s[n] === (n >= p.k ? a[n - p.k] : 0n) }]; },
    },
    {
      id: "add-subtract", sayProblem: "Piles of blocks are even or odd. Encode each type, merge them, then remove the piles whose size is a multiple of three.", level: 3, hash: "add-subtract", aliases: ["addition", "subtraction"], title: "Addition and subtraction", nav: "Add / subtract", branch: "ogf", difficulty: 1,
      prerequisites: ["geometric-series"], related: ["shift", "symbolic-combinatorics"], techniques: ["addition", "subtraction", "combinatorial sum"], gfType: "OGF", visual: "addsub",
      problem: "Piles of $n$ blocks are either even (type A) or odd (type B). Encode each type, merge them, then remove the forbidden piles whose size is a multiple of 3.",
      discreteModel: "Piles of identical blocks, sorted by parity, with sizes 0, 3, 6, … forbidden at the end.",
      when: "Use addition when objects split into disjoint types, and subtraction to discard a class of forbidden objects.",
      key: "Disjoint union adds generating functions; removing a subclass subtracts its generating function.",
      n: { def: 7, min: 0, max: 24 }, params: { mode: { label: "operation", values: ["A + B", "(A + B) − forbidden"], def: "(A + B) − forbidden" } }, gfName: "G(x)",
      closed: (p) => (p.mode === "A + B" ? "\\frac{1}{1-x^2} + \\frac{x}{1-x^2} = \\frac{1}{1-x}" : "\\frac{1}{1-x} - \\frac{1}{1-x^3}"),
      coeffs: (N, p) => (p.mode === "A + B" ? G.add(G.evenGF(N), G.oddGF(N), N) : G.notMultipleOf3GF(N)),
      enumerate: (n, p) => (p.mode === "A + B" ? 1n : n % 3 === 0 ? 0n : 1n), enumLabel: "direct test of the pile size",
      objects: (n, p) => objList(p.mode === "A + B" || n % 3 ? [(n % 2 ? "B: " : "A: ") + ("▪".repeat(n) || "∅")] : []),
      answer: (n, v) => `${val(v)} allowed pile${v === 1n ? "" : "s"} of size ${n}.`,
      reps: () => ({ sequence: "0, 1, 1, 0, 1, 1, 0, …", series: "x + x² + x⁴ + x⁵ + ⋯", closed: "1/(1 − x) − 1/(1 − x³)" }),
      states: () => [
        { id: "types", stage: "object", title: "Two disjoint types", tex: ["A(x) = \\frac{1}{1-x^2}, \\quad B(x) = \\frac{x}{1-x^2}"], text: "Even piles are encoded by 1 + x² + x⁴ + ⋯ and odd piles by x + x³ + ⋯.", say: "Even piles and odd piles are two disjoint types, each with its own generating function." },
        { id: "stack", stage: "manipulate", title: "Merging stacks the bars", tex: ["(A+B)_n = a_n + b_n", "A(x) + B(x) = \\frac{1+x}{1-x^2} = \\frac{1}{1-x}"], text: "A disjoint union adds counts size by size, so the generating functions add.", say: "Merging the two collections adds their counts size by size, so the generating functions add." },
        { id: "forbid", stage: "manipulate", title: "Subtract the forbidden objects", tex: ["G(x) = \\frac{1}{1-x} - \\frac{1}{1-x^3}"], text: "Removing every pile of size 0, 3, 6, … subtracts 1/(1 − x³). This is the first step towards inclusion and exclusion.", say: "Removing the forbidden piles subtracts their generating function. This is the seed of inclusion and exclusion." },
      ],
    },
    {
      id: "differentiation", sayProblem: "Starting from the constant sequence, produce one, two, three, four, and then the sequence n.", level: 4, hash: "differentiation", aliases: ["derivative", "integration"], title: "Differentiation", nav: "Differentiation", branch: "ogf", difficulty: 2,
      prerequisites: ["geometric-series", "shift"], related: ["shift", "bivariate"], techniques: ["differentiation", "integration"], gfType: "OGF", visual: "diff",
      problem: "Given the sequence $1, 1, 1, \\ldots$, produce $1, 2, 3, 4, \\ldots$ and then the sequence $n$.",
      discreteModel: "A pile of n blocks with one block marked: n choices.",
      when: "Use differentiation when coefficients must be weighted by n, as in marking one atom or computing a mean.",
      key: "d/dx multiplies aₙ by n and shifts left; x·d/dx multiplies by n in place: Σ n xⁿ = x/(1 − x)².",
      n: { def: 5, min: 0, max: 20 }, gfName: "xA'(x)", closed: () => "\\frac{x}{(1-x)^2}",
      coeffs: (N) => G.xDerivative(G.seriesFrom([], N).map(() => 1n)),
      enumerate: (n) => BigInt(n), enumLabel: "marked blocks, counted one by one",
      objects: (n) => objList(range(n).map((i) => "▪".repeat(i) + "◆" + "▪".repeat(n - 1 - i))),
      answer: (n, v) => `${val(v)} ways to mark one block in a pile of ${n}.`,
      reps: () => ({ sequence: "0, 1, 2, 3, …", series: "x + 2x² + 3x³ + ⋯", closed: "x/(1 − x)²", recurrence: "aₙ = aₙ₋₁ + 1", class: "pile with one marked atom (pointing)" }),
      states: () => [
        { id: "start", stage: "object", title: "Start from the constant strip", tex: ["A(x) = \\sum_{n\\ge0} x^n = \\frac{1}{1-x}"], text: "Every coefficient is 1.", say: "Start from the constant strip, one over one minus x." },
        { id: "diff", stage: "manipulate", title: "Differentiate: multiply by n, shift left", tex: ["A'(x) = \\sum_{n\\ge1} n a_n x^{n-1} = \\frac{1}{(1-x)^2}"], text: "Each coefficient aₙ is multiplied by its index and moves one place left: 1, 2, 3, 4, ….", say: "Differentiating multiplies each coefficient by its index and moves it one place left. We get one, two, three, four." },
        { id: "xd", stage: "manipulate", title: "Multiply by x to restore positions", tex: ["\\sum_{n\\ge0} n x^n = x\\frac{d}{dx}\\frac{1}{1-x} = \\frac{x}{(1-x)^2}"], text: "The operator x·d/dx weights aₙ by n without moving it.", say: "Multiplying by x moves everything back, so x times the derivative weights each coefficient by n in place." },
        { id: "integrate", stage: "manipulate", title: "Integration undoes it", tex: ["\\int_0^x \\frac{dt}{1-t} = \\log\\frac{1}{1-x} = \\sum_{n\\ge1}\\frac{x^n}{n}"], text: "Integrating divides aₙ₋₁ by n and shifts right, producing rational coefficients 1/n.", say: "Integration goes the other way. It divides by n and shifts right, and gives the logarithm." },
      ],
      checks: (n) => { const ints = G.integral(G.seriesFrom([], n + 1).map(() => 1n)); return [{ name: "∫ of 1/(1 − x) has [xⁿ] = 1/n", gf: n ? qstr(ints[n]) : "0", other: n ? `1/${n}` : "0", method: "exact rational", pass: n ? G.qeq(ints[n], Q(1, n)) : G.qIsZero(ints[0]) }]; },
    },
    {
      id: "fibonacci", sayProblem: "Find the generating function of the Fibonacci numbers from their recurrence.", level: 5, hash: "fibonacci", aliases: ["recurrence", "recurrence-solving"], title: "Solving a recurrence (Fibonacci)", nav: "Fibonacci recurrence", branch: "recurrence", difficulty: 2,
      prerequisites: ["shift", "add-subtract"], related: ["partial-fractions", "transfer-matrix", "singularities"], techniques: ["recurrence solving", "rational generating functions"], gfType: "OGF", visual: "recurrence",
      problem: "Fibonacci numbers: $F_0 = 0$, $F_1 = 1$, $F_n = F_{n-1} + F_{n-2}$. Find $F(x) = \\sum F_n x^n$.",
      discreteModel: "Fₙ counts compositions of n − 1 into parts 1 and 2 (tilings of a strip of length n − 1 by squares and dominoes).",
      when: "Use recurrence solving when a sequence is specified recursively by finitely many shifted terms.",
      key: "Shifted copies of the recurrence become xF(x) and x²F(x); the recurrence becomes a linear equation for F(x).",
      n: { def: 8, min: 0, max: 30 }, gfName: "F(x)", closed: () => "\\frac{x}{1-x-x^2}",
      coeffs: (N) => G.fibonacciGF(N),
      enumerate: (n) => G.fibonacciDP(n + 1)[n], enumLabel: "dynamic-programming recurrence",
      objects: (n) => objList(n === 0 ? [] : G.compositionsList([1, 2], n - 1).map((c) => c.map((s) => (s === 1 ? "□" : "▭")).join("") || "∅")),
      answer: (n, v) => `F${G.subs(n)} = ${val(v)}.`,
      reps: () => ({ sequence: "0, 1, 1, 2, 3, 5, 8, …", series: "x + x² + 2x³ + 3x⁴ + ⋯", closed: "x/(1 − x − x²)", recurrence: "Fₙ = Fₙ₋₁ + Fₙ₋₂", class: "tilings by squares and dominoes", matrix: "[[1,1],[1,0]]ⁿ", asymptotic: "Fₙ ∼ φⁿ/√5" }),
      states: () => [
        { id: "sequence", stage: "object", title: "The sequence", tex: ["F_n:\\ 0, 1, 1, 2, 3, 5, 8, 13, \\ldots"], text: "Fₙ also counts tilings of a strip of length n − 1 by squares and dominoes.", say: "The Fibonacci numbers start zero, one, one, two, three, five, eight." },
        { id: "recurrence", stage: "object", title: "The recurrence", tex: ["F_n = F_{n-1} + F_{n-2} \\quad (n \\ge 2)"], text: "A tiling ends in a square or a domino.", say: "Each term is the sum of the previous two, because a tiling ends in a square or a domino." },
        { id: "align", stage: "encode", title: "Align shifted sequences", tex: ["F_n:\\ 0, 1, 1, 2, 3, 5, \\ldots", "F_{n-1}:\\ \\cdot, 0, 1, 1, 2, 3, \\ldots", "F_{n-2}:\\ \\cdot, \\cdot, 0, 1, 1, 2, \\ldots"], text: "Write the sequence three times, shifted by 0, 1 and 2 places.", say: "Write the sequence three times, shifted by zero, one and two places." },
        { id: "translate", stage: "encode", title: "Translate rows to F(x), xF(x), x²F(x)", tex: ["F(x) = \\sum F_n x^n,\\quad xF(x) = \\sum F_{n-1}x^n,\\quad x^2F(x) = \\sum F_{n-2}x^n"], text: "Each shifted row is the generating function times a power of x.", say: "Each shifted row is F of x times a power of x." },
        { id: "combine", stage: "manipulate", title: "Combine the rows", tex: ["F(x) - xF(x) - x^2F(x) = x"], text: "Column by column the recurrence cancels everything except the x¹ term, where F₁ = 1 has no partner.", say: "Subtract the rows. The recurrence cancels every column except the x term, which leaves x." },
        { id: "solve", stage: "manipulate", title: "Solve the rational equation", tex: ["F(x) = \\frac{x}{1-x-x^2}"], text: "One linear equation for F(x): a rational generating function.", say: "Solve the linear equation. F of x is x over one minus x minus x squared." },
        { id: "formula", stage: "manipulate", title: "Coefficient formula", tex: ["F(x) = \\frac{1}{\\sqrt5}\\left(\\frac{1}{1-\\varphi x} - \\frac{1}{1-\\psi x}\\right) \\Rightarrow F_n = \\frac{\\varphi^n - \\psi^n}{\\sqrt5}"], text: "Partial fractions (the next level) turn the rational function into Binet's formula.", say: "Partial fractions, the next level, turn this into Binet's formula." },
      ],
    },
    {
      id: "partial-fractions", sayProblem: "Recover Binet's formula from x over one minus x minus x squared.", level: 6, hash: "partial-fractions", aliases: ["binet"], title: "Partial fractions and Binet's formula", nav: "Partial fractions", branch: "recurrence", difficulty: 3,
      prerequisites: ["fibonacci", "geometric-series"], related: ["fibonacci", "singularities"], techniques: ["partial fractions", "rational generating functions"], gfType: "OGF", visual: "partial", analytic: true,
      problem: "Recover Binet's formula from $\\dfrac{x}{1-x-x^2}$.",
      discreteModel: "The Fibonacci tilings again; the formula must agree with direct counting.",
      when: "Use partial fractions when a rational generating function factors into simple poles.",
      key: "Partial fractions turn a complicated rational generating function into a sum of simple coefficient machines.",
      n: { def: 10, min: 0, max: 40 }, gfName: "F(x)", closed: () => "\\frac{1}{\\sqrt5}\\left(\\frac{1}{1-\\varphi x} - \\frac{1}{1-\\psi x}\\right)",
      coeffs: (N) => G.fibonacciGF(N),
      enumerate: (n) => G.binet(n), enumLabel: "Binet's formula, exact in ℚ(√5)",
      answer: (n, v) => `F${G.subs(n)} = (φ${G.sup(n)} − ψ${G.sup(n)})/√5 = ${val(v)}.`,
      reps: () => ({ closed: "x/(1 − x − x²) = (1/√5)(1/(1 − φx) − 1/(1 − ψx))", sequence: "Fₙ = (φⁿ − ψⁿ)/√5", asymptotic: "Fₙ ∼ φⁿ/√5 (pole 1/φ ≈ 0.618)" }),
      states: () => [
        { id: "factor", stage: "encode", title: "Factor the denominator into poles", tex: ["1 - x - x^2 = (1-\\varphi x)(1-\\psi x), \\quad \\varphi = \\frac{1+\\sqrt5}{2},\\ \\psi = \\frac{1-\\sqrt5}{2}"], text: "The poles are at x = 1/φ ≈ 0.618 and x = 1/ψ ≈ −1.618.", say: "Factor the denominator. The poles sit at one over phi and one over psi." },
        { id: "split", stage: "manipulate", title: "Split into two geometric machines", tex: ["\\frac{x}{1-x-x^2} = \\frac{1}{\\sqrt5}\\left(\\frac{1}{1-\\varphi x} - \\frac{1}{1-\\psi x}\\right)"], text: "Each simple pole is a geometric series with ratio φ or ψ.", say: "Split the fraction into two simple pieces. Each piece is a geometric series." },
        { id: "recombine", stage: "manipulate", title: "Coefficients recombine", tex: ["F_n = \\frac{\\varphi^n - \\psi^n}{\\sqrt5}"], text: "Read each geometric coefficient and subtract: Binet's formula. ψⁿ shrinks, so φⁿ/√5 dominates.", say: "Read off each geometric coefficient and subtract. That is Binet's formula, and the phi term dominates." },
      ],
      checks: (n) => [{ name: "Binet (exact in ℚ(√5)) vs DP recurrence", gf: fmtInt(G.binet(n)), other: fmtInt(G.fibonacciDP(n + 1)[n]), method: "exact", pass: G.binet(n) === G.fibonacciDP(n + 1)[n] }],
    },
    {
      id: "convolution", sayProblem: "Count ordered pairs of nonnegative integers i and j that add up to n.", level: 7, hash: "convolution", aliases: ["cauchy-product", "product"], title: "Cauchy product and convolution", nav: "Convolution", branch: "products", difficulty: 2,
      prerequisites: ["geometric-series"], related: ["coin-change", "probability", "cyclic-convolution", "labelled-product"], techniques: ["Cauchy product", "convolution", "combinatorial product"], gfType: "OGF", visual: "grid",
      problem: "Count ordered pairs of nonnegative integers $(i, j)$ with $i + j = n$, using $\\frac{1}{1-x}\\cdot\\frac{1}{1-x}$.",
      discreteModel: "Lattice points (i, j) on the anti-diagonal i + j = n.",
      when: "Use a product when an object decomposes into independently chosen pieces whose sizes add.",
      key: "A product of generating functions is the convolution of coefficients: cₙ = Σ aₖbₙ₋ₖ, a diagonal of the product grid.",
      n: { def: 4, min: 0, max: 12 }, gfName: "A(x)B(x)", closed: () => "\\frac{1}{(1-x)^2}",
      coeffs: (N) => G.mul(G.seriesFrom([], N).map(() => 1n), G.seriesFrom([], N).map(() => 1n), N),
      enumerate: (n) => BigInt(range(n + 1).length), enumLabel: "lattice points on i + j = n, listed",
      objects: (n) => objList(range(n + 1).map((i) => `(${i}, ${n - i})`)),
      answer: (n, v) => `${val(v)} ordered pairs (i, j) with i + j = ${n}.`,
      reps: () => ({ sequence: "1, 2, 3, 4, …", series: "1 + 2x + 3x² + ⋯", closed: "1/(1 − x)²", class: "SEQ(Z) × SEQ(Z)", matrix: "product grid aᵢbⱼ" }),
      /** @param {Params} p @param {number} n */
      states: (p, n) => [
        { id: "two", stage: "object", title: "Two sequences", tex: ["A(x) = \\sum a_n x^n, \\qquad B(x) = \\sum b_n x^n"], text: "Here aₙ = bₙ = 1: one way to choose each coordinate.", say: "Take two sequences, here both all ones." },
        { id: "grid", stage: "manipulate", title: "Multiply: the product grid", tex: ["A(x)B(x) = \\sum_n \\left(\\sum_{k=0}^{n} a_k b_{n-k}\\right) x^n"], text: "Every product aᵢbⱼ sits in cell (i, j) and lands on x^{i+j}.", say: "Multiply. Every product of a term from each series sits in a grid cell and lands on the power i plus j." },
        { id: "diagonal", stage: "manipulate", title: `Coefficient of x${G.sup(n)} is a diagonal`, tex: [`[x^{${n}}]A(x)B(x) = ${range(n + 1).map((k) => `a_{${k}}b_{${n - k}}`).join(" + ")}`], text: "The cells with i + j = n form an anti-diagonal; their sum is the convolution.", say: `The coefficient of x to the ${n} is the sum along one diagonal of the grid. That sum is the convolution.` },
      ],
    },
    {
      id: "coin-change", sayProblem: "How many ways can we make n cents from coins of one, two and five cents?", level: 8, hash: "coin-change", aliases: ["coins"], title: "Coin change", nav: "Coin change", branch: "products", difficulty: 2,
      prerequisites: ["convolution", "geometric-series"], related: ["partitions", "convolution"], techniques: ["combinatorial product", "geometric series"], gfType: "OGF", visual: "coins",
      problem: "How many ways can one make $n$ cents from coins of 1, 2 and 5 cents?",
      discreteModel: "Triples (a, b, c) of coin counts with a + 2b + 5c = n.",
      when: "Use a product of geometric series when each kind of part may be used any number of times independently.",
      key: "Each denomination contributes an independent factor 1/(1 − x^d); [xⁿ] of the product counts the solutions of a + 2b + 5c = n.",
      n: { def: 12, min: 0, max: 40 }, params: { coins: { label: "denominations", values: ["1, 2, 5", "1, 5, 10", "1, 2, 3", "2, 3"], def: "1, 2, 5" } }, gfName: "C(x)",
      closed: (p) => `\\frac{1}{${denoms(p).map((d) => `(1-x${d === 1 ? "" : `^{${d}}`})`).join("")}}`,
      coeffs: (N, p) => G.coinChangeGF(denoms(p), N),
      enumerate: (n, p) => BigInt(G.coinSolutions(denoms(p), n).length), enumLabel: "solutions of Σ cᵢdᵢ = n, listed",
      objects: (n, p) => objList(G.coinSolutions(denoms(p), n).map((t) => t.map((c, i) => `${c}×${denoms(p)[i]}`).join(" + "))),
      answer: (n, v, p) => `${val(v)} ways to make ${n} from coins ${denoms(p).join(", ")}.`,
      reps: (p) => ({ series: G.seriesText(G.coinChangeGF(denoms(p), 9)), closed: `1/${denoms(p).map((d) => `(1 − x${d === 1 ? "" : G.sup(d)})`).join("")}`, class: denoms(p).map((d) => `SEQ(Z${G.sup(d)})`).join(" × ") }),
      /** @param {Params} p @param {number} n */
      states: (p, n) => [
        { id: "tracks", stage: "object", title: "Independent tracks", tex: denoms(p).map((d) => `\\text{${d}-cent: } 1 + ${xp(d)} + ${xp(2 * d)} + \\cdots = \\frac{1}{1-${xp(d)}}`), text: "Each denomination is its own repeatable track; the amount it contributes is a multiple of its value.", say: "Each kind of coin is an independent track that can be used any number of times." },
        { id: "product", stage: "manipulate", title: "Multiply the tracks", tex: [`C(x) = ${denoms(p).map((d) => `\\frac{1}{1-${xp(d)}}`).join("\\,")}`], text: "Choosing a point on each track and adding the amounts is exactly the Cauchy product.", say: "Choosing an amount on each track and adding them up is a product of generating functions." },
        { id: "lattice", stage: "manipulate", title: "Lattice points on the constraint plane", tex: [`${denoms(p).map((d, i) => `${d === 1 ? "" : d}${"abc"[i]}`).join(" + ")} = ${n}`], text: "Each solution is one lattice point; [xⁿ]C(x) counts them.", say: `Each way to pay is a lattice point on the plane where the coins add to ${n}.` },
      ],
    },
    {
      id: "compositions", sayProblem: "Count ordered sums of n using parts of size one, two or three.", level: 9, hash: "compositions", aliases: ["restricted-compositions"], title: "Restricted compositions", nav: "Compositions", branch: "products", difficulty: 2,
      prerequisites: ["geometric-series", "convolution"], related: ["symbolic-combinatorics", "fibonacci", "composition"], techniques: ["sequence construction"], gfType: "OGF", visual: "tiles",
      problem: "Count compositions of $n$ (ordered sums) using parts of sizes 1, 2 or 3.",
      discreteModel: "Rows of coloured tiles of lengths 1, 2 and 3 filling a strip of length n.",
      when: "Use the sequence construction when an object is an ordered list of parts from a fixed class.",
      key: "A sequence of parts from P(x) is 1 + P + P² + ⋯ = 1/(1 − P(x)).",
      n: { def: 5, min: 0, max: 24 }, params: { parts: { label: "allowed parts", values: ["1, 2, 3", "1, 2", "2, 3", "1, 3"], def: "1, 2, 3" } }, gfName: "S(x)",
      closed: (p) => `\\frac{1}{1-(${partsOf(p).map((s) => (s === 1 ? "x" : `x^{${s}}`)).join("+")})}`,
      coeffs: (N, p) => G.compositionsGF(partsOf(p), N),
      enumerate: (n, p) => BigInt(G.compositionsList(partsOf(p), n).length), enumLabel: "compositions, listed one by one",
      objects: (n, p) => objList(G.compositionsList(partsOf(p), n, 200).map((c) => c.join("+") || "∅")),
      answer: (n, v, p) => `${val(v)} compositions of ${n} with parts ${partsOf(p).join(", ")}.`,
      reps: (p) => ({ series: G.seriesText(G.compositionsGF(partsOf(p), 9)), closed: `1/(1 − (${partsOf(p).map((s) => (s === 1 ? "x" : "x" + G.sup(s))).join(" + ")}))`, recurrence: `sₙ = ${partsOf(p).map((s) => `sₙ₋${G.subs(s)}`).join(" + ")}`, class: "SEQ(parts)" }),
      states: (p) => [
        { id: "tiles", stage: "object", title: "Compositions as tiles", tex: ["3 = 1+1+1 = 1+2 = 2+1 = 3"], text: "A composition is a row of tiles; order matters.", say: "A composition is a row of tiles, and the order of the tiles matters." },
        { id: "monomials", stage: "encode", title: "Each tile collapses to a monomial", tex: [partsOf(p).map((s) => `\\text{length ${s}} \\mapsto x^{${s}}`).join(",\\quad "), `P(x) = ${partsOf(p).map((s) => (s === 1 ? "x" : `x^{${s}}`)).join(" + ")}`], text: "One tile of length s contributes xˢ, so one part is P(x).", say: "Each tile becomes a power of x equal to its length. One part is the polynomial P of x." },
        { id: "sequence", stage: "manipulate", title: "A row is a sequence of parts", tex: ["1 + P + P^2 + P^3 + \\cdots = \\frac{1}{1-P(x)}"], text: "k tiles in a row give P(x)^k; any number of tiles gives the geometric series in P.", say: "A row of k tiles is P to the k. Any number of tiles is the geometric series in P." },
      ],
    },
    {
      id: "symbolic-combinatorics", sayProblem: "Build classes from atoms with choice, pair and sequence, and read the generating function from the construction.", level: 10, hash: "symbolic-combinatorics", aliases: ["symbolic", "constructions"], title: "Symbolic combinatorics", nav: "Symbolic method", branch: "products", difficulty: 3,
      prerequisites: ["add-subtract", "convolution", "compositions"], related: ["composition", "catalan", "egf"], techniques: ["combinatorial sum", "combinatorial product", "sequence construction"], gfType: "OGF", visual: "builder",
      problem: "Build classes from atoms with CHOICE, PAIR and SEQUENCE, and read the generating function straight from the construction.",
      discreteModel: "Classes of unlabelled objects built from atoms Z (size 1).",
      when: "Use the symbolic method when you can describe the objects by a grammar of sums, products and sequences.",
      key: "CHOICE is A + B, PAIR is AB (convolution), SEQUENCE is 1/(1 − A): the construction is the equation.",
      n: { def: 7, min: 0, max: 20 }, params: { build: { label: "construction", values: ["SEQ(Z + Z²)", "PAIR(SEQ(Z), SEQ(Z))", "Z + Z²", "SEQ(Z + Z² + Z³)"], def: "SEQ(Z + Z²)" } }, gfName: "A(x)",
      closed: (p) => BUILDS[p.build].tex, coeffs: (N, p) => BUILDS[p.build].coeffs(N),
      enumerate: (n, p) => BigInt(BUILDS[p.build].list(n).length), enumLabel: "objects built and listed",
      objects: (n, p) => objList(BUILDS[p.build].list(n)),
      answer: (n, v, p) => `${val(v)} objects of size ${n} in ${p.build}.`,
      reps: (p) => ({ class: p.build, closed: BUILDS[p.build].text, series: G.seriesText(BUILDS[p.build].coeffs(9)) }),
      states: (p) => [
        { id: "atoms", stage: "object", title: "Atoms and operators", tex: ["\\text{CHOICE} \\mapsto A+B,\\quad \\text{PAIR} \\mapsto AB,\\quad \\text{SEQUENCE} \\mapsto \\frac{1}{1-A}"], text: "An atom Z has size 1 and generating function x.", say: "Atoms have size one and become x. Three operators build everything else." },
        { id: "build", stage: "encode", title: `Construction: ${p.build}`, tex: [BUILDS[p.build].tex], text: "Translate the construction operator by operator.", say: "Translate the construction one operator at a time." },
        { id: "seq", stage: "manipulate", title: "SEQUENCE expands as a geometric series", tex: ["\\text{SEQ}(A) = 1 + A + A^2 + A^3 + \\cdots"], text: "A PAIR inside the sequence is a convolution grid; the sequence sums all powers.", say: "A sequence is the geometric series in the class, and each power is a product grid." },
      ],
    },
    {
      id: "composition", sayProblem: "Fill every slot of an outer row with a nonempty block of atoms. How many objects have total size n?", level: 11, hash: "composition", aliases: ["substitution"], title: "Composition (substitution)", nav: "Composition", branch: "composition", difficulty: 3,
      prerequisites: ["symbolic-combinatorics"], related: ["lagrange-inversion", "exponential-formula", "catalan"], techniques: ["composition"], gfType: "OGF", visual: "nested",
      problem: "Replace each slot of an outer sequence by a nonempty inner block of atoms. How many objects have total size $n$?",
      discreteModel: "An outer row of slots, each slot filled by a block of ≥ 1 atoms: the compositions of n.",
      when: "Use composition when atoms of one structure are replaced by structures of another kind.",
      key: "Product combines independent sizes; composition replaces each atom by a whole structure: A(B(x)).",
      n: { def: 4, min: 0, max: 20 }, gfName: "A(B(x))", closed: () => "\\frac{1}{1-\\frac{x}{1-x}} = \\frac{1-x}{1-2x}",
      coeffs: (N) => G.compositionsAllGF(N),
      enumerate: (n) => BigInt(G.compositionsList(range(n).map((i) => i + 1), n).length), enumLabel: "outer slots filled with inner blocks, listed",
      objects: (n) => objList(G.compositionsList(range(n).map((i) => i + 1), n).map((c) => c.map((s) => `[${"•".repeat(s)}]`).join("") || "∅")),
      answer: (n, v) => `${val(v)} = ${n ? `2${G.sup(n - 1)}` : "1"} nested objects of size ${n}.`,
      reps: () => ({ closed: "A(B(x)) with A(u) = 1/(1 − u), B(x) = x/(1 − x)", series: "1 + x + 2x² + 4x³ + 8x⁴ + ⋯", class: "SEQ(SEQ≥1(Z))", sequence: "1, 1, 2, 4, 8, … = 2ⁿ⁻¹" }),
      states: () => [
        { id: "outer", stage: "object", title: "Outer structure with slots", tex: ["A(u) = \\frac{1}{1-u} \\quad \\text{(a row of slots)}"], text: "The outer structure only says how many slots there are and in what order.", say: "The outer structure is a row of slots." },
        { id: "inner", stage: "object", title: "Inner structure in every slot", tex: ["B(x) = x + x^2 + \\cdots = \\frac{x}{1-x}"], text: "Each slot holds a nonempty block of atoms.", say: "Every slot is filled by a nonempty block of atoms." },
        { id: "substitute", stage: "manipulate", title: "Substitute u = B(x)", tex: ["A(B(x)) = \\frac{1}{1-\\frac{x}{1-x}} = \\frac{1-x}{1-2x}"], text: "Replacing each atom u of the outer structure by an inner structure is substitution, not multiplication.", say: "Replace each slot by a block. That is substitution, A of B of x." },
        { id: "contrast", stage: "manipulate", title: "Product versus composition", tex: ["A(x)B(x): \\text{sizes add}", "A(B(x)): \\text{atoms are replaced}"], text: "A product pairs one A-object with one B-object; a composition puts a B-object into every atom of an A-object.", say: "A product pairs two objects whose sizes add. A composition puts a whole structure into every atom." },
      ],
    },
    {
      id: "catalan", sayProblem: "Count binary trees with n internal nodes, or balanced strings of n pairs of parentheses.", level: 12, hash: "catalan", aliases: ["balanced-parentheses", "binary-trees"], title: "Catalan numbers", nav: "Catalan", branch: "composition", difficulty: 3,
      prerequisites: ["symbolic-combinatorics"], related: ["lagrange-inversion", "singularity-analysis"], techniques: ["implicit equations", "algebraic generating functions"], gfType: "OGF", visual: "trees",
      problem: "Count binary trees with $n$ internal nodes, equivalently balanced strings of $n$ pairs of parentheses.",
      discreteModel: "A binary tree is a leaf, or a root with a left and a right binary tree.",
      when: "Use an implicit equation when the class is defined recursively in terms of itself.",
      key: "C = 1 + xC² is a quadratic; its power-series root (1 − √(1 − 4x))/(2x) gives Cₙ = C(2n, n)/(n + 1).",
      n: { def: 4, min: 0, max: 30 }, gfName: "C(x)", closed: () => "\\frac{1-\\sqrt{1-4x}}{2x}",
      coeffs: (N) => G.catalanGF(N),
      enumerate: (n) => (n <= 12 ? BigInt(G.balancedParens(n).length) : G.catalanClosed(n)), enumLabel: "balanced strings listed (closed form beyond n = 12)",
      objects: (n) => objList(n <= 7 ? G.balancedParens(n) : []),
      answer: (n, v) => `C${G.subs(n)} = ${val(v)} binary trees with ${n} internal nodes.`,
      reps: () => ({ sequence: "1, 1, 2, 5, 14, 42, …", series: "1 + x + 2x² + 5x³ + 14x⁴ + ⋯", closed: "(1 − √(1 − 4x))/(2x)", recurrence: "Cₙ₊₁ = Σ CₖCₙ₋ₖ", class: "C = ε + Z × C × C", asymptotic: "Cₙ ∼ 4ⁿ/(√π n^{3/2})" }),
      states: () => [
        { id: "tree", stage: "object", title: "A binary tree grows recursively", tex: ["\\mathcal{C} = \\varepsilon + \\mathcal{Z}\\times\\mathcal{C}\\times\\mathcal{C}"], text: "Each internal root contributes one x and two subtrees.", say: "A binary tree is empty, or a root with two subtrees." },
        { id: "equation", stage: "encode", title: "The recursive equation", tex: ["C(x) = 1 + xC(x)^2"], text: "The construction translates directly; C appears on both sides.", say: "Translate the construction. C equals one plus x C squared." },
        { id: "quadratic", stage: "manipulate", title: "Solve the quadratic", tex: ["xC^2 - C + 1 = 0 \\Rightarrow C(x) = \\frac{1 \\pm \\sqrt{1-4x}}{2x}"], text: "Pick the minus sign so that C(0) = 1 is a power series.", say: "Solve the quadratic and take the root that is a power series at zero." },
        { id: "coefficients", stage: "manipulate", title: "Extract coefficients", tex: ["C_n = \\frac{1}{n+1}\\binom{2n}{n}: \\ 1, 1, 2, 5, 14, 42, \\ldots"], text: "Expanding √(1 − 4x) by the binomial theorem gives the Catalan numbers.", say: "Expand the square root by the binomial theorem to get the Catalan numbers." },
      ],
      checks: (n) => [{ name: "closed form C(2n, n)/(n + 1)", gf: fmtInt(G.catalanGF(n + 1)[n]), other: fmtInt(G.catalanClosed(n)), method: "exact", pass: G.catalanGF(n + 1)[n] === G.catalanClosed(n) }, ...(n <= 8 ? [{ name: "binary trees enumerated", gf: fmtInt(G.catalanGF(n + 1)[n]), other: String(G.binaryTrees(n).length), method: "exact enumeration", pass: G.catalanGF(n + 1)[n] === BigInt(G.binaryTrees(n).length) }] : [])],
    },
    {
      id: "lagrange-inversion", sayProblem: "Trees satisfy T equals x times phi of T. Find their coefficients without solving for T.", level: 13, hash: "lagrange-inversion", aliases: ["lagrange"], title: "Lagrange inversion", nav: "Lagrange inversion", branch: "composition", difficulty: 4,
      prerequisites: ["catalan", "composition"], related: ["catalan", "egf"], techniques: ["Lagrange inversion", "implicit equations"], gfType: "OGF", visual: "lagrange",
      problem: "Trees satisfy $T(x) = x\\,\\phi(T(x))$ with $\\phi(u) = (1+u)^2$. Find $[x^n]T(x)^k$ without solving for $T$.",
      discreteModel: "Nonempty binary trees by internal nodes (T = C − 1); Tᵏ is an ordered forest of k such trees.",
      when: "Use Lagrange inversion when the generating function is defined implicitly by T = xφ(T).",
      key: "[xⁿ]Tᵏ = (k/n)[uⁿ⁻ᵏ]φ(u)ⁿ: a coefficient of an unknown series becomes a coefficient of a known power.",
      n: { def: 4, min: 1, max: 20 }, params: { k: { label: "power k", values: [1, 2, 3], def: 1 }, phi: { label: "φ(u)", values: ["(1+u)^2", "e^u (labelled, Cayley)"], def: "(1+u)^2" } }, gfName: "T(x)^k",
      closed: (p) => (p.phi === "(1+u)^2" ? "T = x(1+T)^2" : "T = xe^{T}"),
      coeffs: (N, p) => (p.phi === "(1+u)^2" ? G.power(G.implicitSeries([1, 2, 1], N), p.k, N) : range(N).map((n) => (n === 0 ? 0n : cayleyByLagrange(n)))),
      egf: (p) => p.phi !== "(1+u)^2",
      enumerate: (n, p) => (p.phi === "(1+u)^2" ? (n >= p.k ? G.toBig(G.lagrange([1, 2, 1], n, p.k)) : 0n) : n <= 5 ? G.rootedLabelledTrees(n) : cayleyByLagrange(n)),
      enumLabel: "Lagrange's formula (and brute-force trees for n ≤ 5, labelled case)",
      answer: (n, v, p) => (p.phi === "(1+u)^2" ? `[x${G.sup(n)}]T${p.k === 1 ? "" : G.sup(p.k)} = ${p.k}/${n} · [u${G.sup(n - p.k)}](1 + u)${G.sup(2 * n)} = ${val(v)}.` : `${val(v)} = ${n}${G.sup(n - 1)} rooted labelled trees on ${n} vertices.`),
      reps: () => ({ closed: "T = x(1 + T)², T = C − 1", class: "T = Z × (1 + T)²", sequence: "1, 2, 5, 14, 42, … (Catalan)" }),
      /** @param {Params} p @param {number} n */
      states: (p, n) => [
        { id: "implicit", stage: "object", title: "An implicit equation", tex: [p.phi === "(1+u)^2" ? "T(x) = x\\,\\phi(T(x)), \\quad \\phi(u) = (1+u)^2" : "T(x) = x\\,e^{T(x)}"], text: "A root (x) with an ordered pair of optional subtrees φ(T).", say: "The tree is a root times phi of T, an implicit equation." },
        { id: "unfold", stage: "encode", title: "Unfold the substitutions", tex: ["T \\to x\\phi(T) \\to x\\phi(x\\phi(T)) \\to \\cdots"], text: "Iterating fixes one more coefficient each time; this is the fixed-point computation the lab uses as a cross-check.", say: "Substituting the equation into itself fixes one more coefficient each time." },
        { id: "rule", stage: "manipulate", title: "Lagrange inversion", tex: ["[x^n]T(x)^k = \\frac{k}{n}[u^{n-k}]\\phi(u)^n"], text: "The wanted coefficient becomes a coefficient of φ(u)ⁿ, a known polynomial.", say: "Lagrange inversion turns the unknown coefficient into a coefficient of phi to the n." },
        { id: "map", stage: "manipulate", title: `Map the coefficient for n = ${n}`, tex: [p.phi === "(1+u)^2" ? `[x^{${n}}]T^{${p.k}} = \\frac{${p.k}}{${n}}[u^{${n - p.k}}](1+u)^{${2 * n}} = \\frac{${p.k}}{${n}}\\binom{${2 * n}}{${n - p.k}}` : `[x^{${n}}]T = \\frac{1}{${n}}[u^{${n - 1}}]e^{${n}u} = \\frac{${n}^{${n - 1}}}{${n}!}`], text: "With φ = (1 + u)² this is the binomial coefficient C(2n, n − k), which for k = 1 is the Catalan number.", say: "For our phi, the answer is a binomial coefficient, and for k equal to one it is the Catalan number." },
      ],
      checks: (n, p) => {
        if (p.phi !== "(1+u)^2") { const ok = n <= 5; return ok ? [{ name: "rooted labelled trees by brute force vs nⁿ⁻¹", gf: fmtInt(B(n) ** B(n - 1)), other: fmtInt(G.rootedLabelledTrees(n)), method: "exact enumeration over parent maps", pass: B(n) ** B(n - 1) === G.rootedLabelledTrees(n) }] : []; }
        const t = G.power(G.implicitSeries([1, 2, 1], n + 1), p.k, n + 1)[n], l = n >= p.k ? G.toBig(G.lagrange([1, 2, 1], n, p.k)) : 0n;
        const out = [{ name: "fixed-point iteration vs Lagrange", gf: fmtInt(t), other: fmtInt(l), method: "exact", pass: t === l }];
        if (p.k === 1 && n <= 8) out.push({ name: "nonempty binary trees enumerated", gf: fmtInt(l), other: String(G.binaryTrees(n).length), method: "exact enumeration", pass: l === BigInt(G.binaryTrees(n).length) });
        return out;
      },
    },
    {
      id: "egf", sayProblem: "Why divide by n factorial? Count rows of n atoms, first unlabelled, then labelled.", level: 14, hash: "egf", aliases: ["exponential-generating-functions", "labelled"], title: "Exponential generating functions", nav: "Why EGFs?", branch: "egf", difficulty: 3,
      prerequisites: ["symbolic-combinatorics"], related: ["labelled-product", "ogf-egf"], techniques: ["exponential generating functions", "ordinary generating functions"], gfType: "EGF", visual: "labels",
      problem: "Why divide by $n!$? Count linear arrangements of $n$ atoms, unlabelled and then labelled $\\{1, \\ldots, n\\}$.",
      discreteModel: "A row of n atoms. Unlabelled: one shape. Labelled: n! ways to assign the labels.",
      when: "Use an EGF when objects carry distinct labels and decompositions require choosing subsets of those labels.",
      key: "A(x) = Σ aₙxⁿ/n!: dividing by n! removes the ambient permutation factor of the labels.",
      n: { def: 3, min: 0, max: 12 }, params: { view: { label: "objects", values: ["labelled", "ordinary"], def: "labelled" } }, gfName: "A(x)",
      closed: () => "\\sum_{n\\ge0} n!\\,\\frac{x^n}{n!} = \\frac{1}{1-x}",
      coeffs: (N, p) => (p.view === "labelled" ? range(N).map((n) => G.factorial(n)) : range(N).map(() => 1n)),
      egf: (p) => p.view === "labelled",
      enumerate: (n, p) => (p.view === "labelled" ? BigInt(G.permutations(Math.min(n, 8)).length) * (n > 8 ? G.factorial(n) / G.factorial(8) : 1n) : 1n), enumLabel: "label assignments enumerated (n ≤ 8)",
      objects: (n, p) => objList(p.view === "labelled" && n <= 4 ? G.permutations(n).map((q) => q.map((i) => i + 1).join(" ")) : ["•".repeat(n) || "∅"]),
      answer: (n, v, p) => (p.view === "labelled" ? `${val(v)} = ${n}! labelled rows; the EGF coefficient is ${val(v)}/${n}! = 1.` : `${val(v)} unlabelled row of size ${n}.`),
      reps: () => ({ sequence: "aₙ = n!: 1, 1, 2, 6, 24, …", series: "Σ n! xⁿ/n! = Σ xⁿ", closed: "1/(1 − x) as an EGF" }),
      states: () => [
        { id: "atoms", stage: "object", title: "Three labelled atoms", tex: ["\\{1, 2, 3\\} \\Rightarrow 3! = 6 \\text{ rows}"], text: "One unlabelled shape explodes into n! labelled objects.", say: "Take three atoms. Once they carry labels, one row becomes six." },
        { id: "divide", stage: "encode", title: "Divide by n!", tex: ["A(x) = \\sum_{n \\ge 0} a_n \\frac{x^n}{n!}"], text: "The EGF records aₙ/n!, the number of labelled objects per labelling of the atoms.", say: "The exponential generating function divides by n factorial, removing the permutation factor." },
        { id: "same", stage: "manipulate", title: "The same construction, two encodings", tex: ["\\text{OGF: } \\sum x^n = \\frac{1}{1-x}", "\\text{EGF: } \\sum n!\\frac{x^n}{n!} = \\frac{1}{1-x}"], text: "Unlabelled rows (OGF) and labelled rows (EGF) have the same generating function: the n! is absorbed by the encoding.", say: "Unlabelled rows with an ordinary generating function, and labelled rows with an exponential one, give the same function." },
      ],
    },
    {
      id: "labelled-product", sayProblem: "Split a set of labels into an ordered row and an unordered set, and count the results.", level: 15, hash: "labelled-product", aliases: ["egf-product", "binomial-convolution"], title: "The labelled product", nav: "Labelled product", branch: "egf", difficulty: 3,
      prerequisites: ["egf", "convolution"], related: ["convolution", "exponential-formula", "ogf-egf"], techniques: ["labelled product", "exponential generating functions"], gfType: "EGF", visual: "split",
      problem: "Split a labelled set $\\{1, \\ldots, n\\}$ into an ordered part A (arranged in a row) and an unordered part B (a set). Count the results.",
      discreteModel: "Choose k labels for a row (k! orders); the other n − k labels form a set.",
      when: "Use the labelled product when a labelled object splits into two labelled pieces whose label sets partition the labels.",
      key: "cₙ = Σ C(n, k) aₖbₙ₋ₖ: the binomial coefficient is the act of choosing which labels go left; EGFs multiply.",
      n: { def: 3, min: 0, max: 14 }, gfName: "A(x)B(x)", closed: () => "\\frac{1}{1-x}\\cdot e^x", egf: () => true,
      coeffs: (N) => G.arrangementsGF(N),
      enumerate: (n) => (n <= 12 ? G.arrangementsEnumerated(n) : G.arrangementsGF(n + 1)[n]), enumLabel: "every (subset, order) pair enumerated",
      objects: (n) => objList(n <= 4 ? G.arrangementsList(n).map((r) => `(${r.join(" ")}) | {${range(n).map((i) => i + 1).filter((i) => !r.includes(i)).join(",")}}`) : []),
      answer: (n, v) => `${val(v)} labelled splits of {1…${n}}.`,
      reps: () => ({ sequence: "1, 2, 5, 16, 65, 326, …", series: "Σ cₙxⁿ/n!", closed: "eˣ/(1 − x)", class: "SEQ(Z) ⋆ SET(Z)" }),
      /** @param {Params} p @param {number} n */
      states: (p, n) => [
        { id: "dots", stage: "object", title: `Start with ${n} labelled dots`, tex: [`\\{1, \\ldots, ${n}\\} = L \\sqcup R`.replace("\\sqcup", "\\cup")], text: "Choose k labels for the left (A) structure; the remaining n − k go right.", say: "Start with labelled dots and choose which ones go to the left structure." },
        { id: "binomial", stage: "manipulate", title: "The split appears as a binomial", tex: ["c_n = \\sum_{k} \\binom{n}{k} a_k b_{n-k}"], text: "There are C(n, k) ways to choose the left labels; then aₖ and bₙ₋ₖ structures on them.", say: "There are n choose k ways to choose the left labels, then an A structure and a B structure." },
        { id: "egfmul", stage: "manipulate", title: "EGF multiplication produces exactly this", tex: ["\\frac{x^k}{k!}\\cdot\\frac{x^{n-k}}{(n-k)!} = \\binom{n}{k}\\frac{x^n}{n!}"], text: "Multiplying EGFs creates the binomial automatically.", say: "Multiplying exponential generating functions creates the binomial coefficient automatically." },
      ],
      checks: (n) => { const c = G.arrangementsGF(n + 1)[n], d = G.countsFromEgf(G.qmulSeries(G.egfFromCounts(range(n + 1).map((k) => G.factorial(k))), G.egfFromCounts(range(n + 1).map(() => 1n)), n + 1))[n]; return [{ name: "binomial sum vs product of EGFs", gf: fmtInt(c), other: fmtInt(d), method: "exact rational", pass: c === d }]; },
    },
    {
      id: "exponential-formula", sayProblem: "A labelled object is a set of connected components. Find its generating function from the components.", level: 16, hash: "exponential-formula", aliases: ["set-of-components"], title: "The exponential formula", nav: "Exponential formula", branch: "egf", difficulty: 4,
      prerequisites: ["labelled-product", "composition"], related: ["permutations-cycles", "bivariate"], techniques: ["exponential formula", "composition"], gfType: "EGF", visual: "islands",
      problem: "A labelled object is a set of connected components. If components have EGF $C(x)$, what is the EGF of all objects?",
      discreteModel: "Permutations as sets of cycles (principal example); set partitions as sets of blocks.",
      when: "Use the exponential formula when every object is an unordered set of labelled connected components.",
      key: "A(x) = exp(C(x)) = 1 + C + C²/2! + C³/3! + ⋯: k components form a k-fold labelled product, divided by k! because they are unordered.",
      n: { def: 4, min: 0, max: 14 }, params: { kind: { label: "components", values: ["cycles → permutations", "blocks → set partitions"], def: "cycles → permutations" } }, gfName: "A(x)", egf: () => true,
      closed: (p) => (p.kind.startsWith("cycles") ? "\\exp\\left(\\log\\frac{1}{1-x}\\right) = \\frac{1}{1-x}" : "\\exp(e^x - 1)"),
      coeffs: (N, p) => (p.kind.startsWith("cycles") ? G.permutationsByExpFormula(N) : G.bellByExpFormula(N)),
      enumerate: (n, p) => (n <= 8 ? BigInt(p.kind.startsWith("cycles") ? G.permutations(n).length : G.setPartitions(n).length) : p.kind.startsWith("cycles") ? G.factorial(n) : G.bellByExpFormula(n + 1)[n]), enumLabel: "objects enumerated (n ≤ 8)",
      objects: (n, p) => objList(n <= 4 ? (p.kind.startsWith("cycles") ? G.permutations(n).map((q) => G.cyclesOf(q).map((c) => `(${c.map((i) => i + 1).join(" ")})`).join("")) : G.setPartitions(n).map((s) => blocksText(s))) : []),
      answer: (n, v, p) => `${val(v)} ${p.kind.startsWith("cycles") ? "permutations" : "set partitions"} of ${n} labels.`,
      reps: (p) => (p.kind.startsWith("cycles") ? { class: "PERM = SET(CYC)", closed: "exp(Σ xⁿ/n) = 1/(1 − x)", sequence: "n!: 1, 1, 2, 6, 24, …" } : { class: "SETPART = SET(SET≥1(Z))", closed: "exp(eˣ − 1)", sequence: "Bell: 1, 1, 2, 5, 15, 52, …" }),
      states: (p) => [
        { id: "islands", stage: "object", title: "Connected components as islands", tex: [p.kind.startsWith("cycles") ? "C(x) = \\sum_{n\\ge1} (n-1)!\\frac{x^n}{n!} = \\log\\frac{1}{1-x}" : "C(x) = e^x - 1"], text: "Each island is one connected component: a cycle, or a block.", say: "Each island is one connected component." },
        { id: "k", stage: "manipulate", title: "k islands: a labelled product, unordered", tex: ["\\frac{C(x)^k}{k!}"], text: "k components are a k-fold labelled product; dividing by k! forgets their order.", say: "Exactly k islands is a k fold labelled product, divided by k factorial because the islands are unordered." },
        { id: "exp", stage: "manipulate", title: "Sum over k: the exponential", tex: ["A(x) = 1 + C + \\frac{C^2}{2!} + \\frac{C^3}{3!} + \\cdots = \\exp(C(x))"], text: "Summing over the number of components gives exp.", say: "Sum over every number of islands and the exponential appears." },
      ],
    },
    {
      id: "permutations-cycles", sayProblem: "Count permutations of n labels by their number of cycles.", level: 17, hash: "permutations-cycles", aliases: ["permutations", "cycles", "stirling"], title: "Permutations and cycles", nav: "Permutations & cycles", branch: "egf", difficulty: 4,
      prerequisites: ["exponential-formula"], related: ["bivariate", "exponential-formula"], techniques: ["exponential formula", "marking"], gfType: "EGF", visual: "cycles",
      problem: "Count permutations of $n$ labels by their number of cycles.",
      discreteModel: "A permutation drawn as arrows i → σ(i), which close up into cycles.",
      when: "Use PERM = SET(CYC) when you need permutations by cycle structure.",
      key: "PERMUTATION = SET(CYCLE): exp(log 1/(1 − x)) = 1/(1 − x), so n! permutations; marking cycles gives Stirling numbers.",
      n: { def: 4, min: 0, max: 10 }, params: { pick: { label: "permutation shown", values: [0, 1, 2, 3, 4, 5, 6, 7], def: 5 } }, gfName: "P(x)", egf: () => true,
      closed: () => "\\exp\\left(\\sum_{k\\ge1}\\frac{x^k}{k}\\right) = \\frac{1}{1-x}",
      coeffs: (N) => range(N).map((n) => G.factorial(n)),
      enumerate: (n) => (n <= 8 ? BigInt(G.permutations(n).length) : G.factorial(n)), enumLabel: "permutations enumerated (n ≤ 8)",
      answer: (n, v) => `${val(v)} permutations; by cycles: ${G.stirling1(n + 1)[n].map(fmtInt).join(", ")}.`,
      reps: () => ({ class: "PERM = SET(CYC)", closed: "1/(1 − x) (EGF)", matrix: "Stirling numbers c(n, k)", recurrence: "c(n+1, k) = n c(n, k) + c(n, k − 1)" }),
      states: () => [
        { id: "arrows", stage: "object", title: "A permutation as arrows", tex: ["1 \\to 4 \\to 2 \\to 1, \\qquad 3 \\to 5 \\to 3"], text: "Following arrows from any label returns to it: a cycle.", say: "Follow the arrows from any label and you come back to it. That loop is a cycle." },
        { id: "cyc", stage: "encode", title: "Cycles on k labels", tex: ["\\text{CYC}_k: (k-1)! \\text{ cycles}, \\quad \\sum_k (k-1)!\\frac{x^k}{k!} = \\log\\frac{1}{1-x}"], text: "Fix the smallest label first; the rest can follow in (k − 1)! orders.", say: "There are k minus one factorial cycles on k labels. Their generating function is a logarithm." },
        { id: "set", stage: "manipulate", title: "PERMUTATION = SET(CYCLE)", tex: ["\\exp\\left(\\log\\frac{1}{1-x}\\right) = \\frac{1}{1-x} = \\sum n!\\frac{x^n}{n!}"], text: "The exponential formula makes n! inevitable.", say: "A permutation is a set of cycles, and the exponential formula gives n factorial." },
      ],
      checks: (n) => { const t = G.stirling1(n + 1)[n], e = n <= 7 ? G.stirling1Enumerated(n) : null; return e ? [{ name: "Stirling c(n, k) by recurrence vs enumerated cycle counts", gf: t.map(fmtInt).join(","), other: e.map(fmtInt).join(","), method: "exact enumeration", pass: t.every((x, i) => x === e[i]) }] : []; },
    },
    {
      id: "bivariate", sayProblem: "Count permutations by size and number of cycles at once, and find the mean number of cycles.", level: 18, hash: "bivariate", aliases: ["marking", "bgf"], title: "Bivariate generating functions", nav: "Bivariate (marking)", branch: "marking", difficulty: 4,
      prerequisites: ["permutations-cycles", "differentiation"], related: ["probability", "multivariate"], techniques: ["bivariate generating functions", "marking"], gfType: "BGF", visual: "heatmap",
      problem: "Count permutations by size $n$ and number of cycles $k$ at once, and find the mean number of cycles.",
      discreteModel: "Permutations with each cycle marked by a variable y.",
      when: "Use a bivariate generating function when you want a second parameter (marked by y) alongside size.",
      key: "Setting y = 1 marginalises; ∂/∂y at y = 1 sums the marked parameter, giving its mean Hₙ.",
      n: { def: 5, min: 1, max: 10 }, gfName: "A(x, y)", egf: () => true,
      closed: () => "\\exp\\left(y\\log\\frac{1}{1-x}\\right) = (1-x)^{-y}",
      coeffs: (N) => range(N).map((n) => G.factorial(n)),
      enumerate: (n) => BigInt(G.permutations(Math.min(n, 8)).length) * (n > 8 ? G.factorial(n) / G.factorial(8) : 1n), enumLabel: "permutations enumerated",
      answer: (n) => `Mean number of cycles of a random permutation of ${n}: H${G.subs(n)} = ${qstr(harmonic(n))}.`,
      reps: () => ({ closed: "(1 − x)^{−y}", matrix: "aₙ,ₖ = c(n, k) (Stirling, first kind)", sequence: "y = 1: n!", asymptotic: "mean cycles Hₙ ∼ log n" }),
      states: () => [
        { id: "mark", stage: "encode", title: "Mark each cycle with y", tex: ["A(x,y) = \\sum_{n,k} a_{n,k} y^k \\frac{x^n}{n!} = \\exp\\left(y \\log\\frac{1}{1-x}\\right)"], text: "Each component contributes a factor y; the coefficient strip becomes a matrix.", say: "Mark each cycle with a variable y. The strip of coefficients becomes a matrix." },
        { id: "marginal", stage: "manipulate", title: "Marginalise: set y = 1", tex: ["A(x, 1) = \\frac{1}{1-x}"], text: "Summing a row of the matrix over k is the same as putting y = 1.", say: "Summing over k is the same as setting y to one." },
        { id: "mean", stage: "manipulate", title: "Differentiate in y at y = 1", tex: ["\\left.\\frac{\\partial A}{\\partial y}\\right|_{y=1} = \\frac{1}{1-x}\\log\\frac{1}{1-x}", "\\mathbb{E}[\\text{cycles}] = H_n = 1 + \\frac12 + \\cdots + \\frac1n"], text: "The derivative sums k·aₙ,ₖ; dividing by n! gives the mean, the harmonic number.", say: "Differentiate in y at one. That totals the cycles, and the mean is the harmonic number." },
      ],
      checks: (n) => { if (n > 8) return []; const perms = G.permutations(n), total = perms.reduce((s, q) => s + G.cyclesOf(q).length, 0), mean = Q(total, perms.length); const bgf = G.cyclesBGF(n + 1)[n], viaDeriv = Q(bgf.reduce((s, c, k) => s + c * B(k), 0n), G.factorial(n)); return [{ name: "∂A/∂y at y = 1 (exact) vs enumerated mean cycles", gf: qstr(viaDeriv), other: qstr(mean), method: "exact rational", pass: G.qeq(viaDeriv, mean) && G.qeq(mean, harmonic(n)) }]; },
    },
    {
      id: "probability", sayProblem: "Find the distribution of the sum of several fair six sided dice.", level: 19, hash: "probability", aliases: ["pgf", "dice"], title: "Probability generating functions", nav: "Probability GFs", branch: "marking", difficulty: 3,
      prerequisites: ["convolution"], related: ["convolution", "bivariate", "cyclic-convolution"], techniques: ["probability generating functions", "convolution"], gfType: "PGF", visual: "dice",
      problem: "Find the distribution of the sum of $k$ fair six-sided dice.",
      discreteModel: "All 6ᵏ equally likely outcomes, grouped by their sum.",
      when: "Use a probability generating function for sums of independent integer-valued random variables.",
      key: "G_{X+Y}(z) = G_X(z)G_Y(z): counting convolution = probability convolution = polynomial multiplication.",
      n: { def: 7, min: 0, max: 24 }, params: { dice: { label: "dice k", values: [1, 2, 3, 4], def: 2 } }, gfName: "G(z)", variable: "z",
      closed: (p) => `\\left(\\frac{z + z^2 + \\cdots + z^6}{6}\\right)^{${p.dice}}`,
      coeffs: (N, p) => G.qseries(G.dicePGF(p.dice), N),
      enumerate: (n, p) => G.diceEnumerated(p.dice)[n] ?? Q(0), enumLabel: `all 6ᵏ outcomes enumerated`,
      answer: (n, v, p) => `P(sum = ${n}) = ${val(v)} for ${p.dice} dice; mean G′(1) = ${qstr(G.pgfMean(G.dicePGF(p.dice)))}.`,
      reps: (p) => ({ closed: `((z + ⋯ + z⁶)/6)^${p.dice}`, series: G.seriesText(G.dicePGF(p.dice), { variable: "z", terms: 5 }), sequence: "P(X = n) is the coefficient strip" }),
      states: (p) => [
        { id: "one", stage: "encode", title: "One die", tex: ["G_X(z) = \\mathbb{E}[z^X] = \\frac{z + z^2 + \\cdots + z^6}{6}"], text: "The probability histogram is literally the coefficient strip.", say: "For one die the histogram of probabilities is the coefficient strip." },
        { id: "sum", stage: "manipulate", title: "Independent sum = product", tex: ["G_{X+Y}(z) = G_X(z)\\,G_Y(z)"], text: "Two independent dice: every pair of faces is a cell of the convolution grid.", say: "Independent sums multiply probability generating functions. The convolution grid appears again." },
        { id: "mean", stage: "manipulate", title: "Moments by differentiation", tex: [`G'(1) = \\mathbb{E}[X] = ${qstr(G.pgfMean(G.dicePGF(p.dice)))}`], text: "Differentiating at z = 1 gives the mean, as in the bivariate lesson.", say: "Differentiate at one to get the mean." },
      ],
      checks: (n, p) => [{ name: "mean G′(1) vs 3.5k", gf: qstr(G.pgfMean(G.dicePGF(p.dice))), other: qstr(Q(7 * p.dice, 2)), method: "exact rational", pass: G.qeq(G.pgfMean(G.dicePGF(p.dice)), Q(7 * p.dice, 2)) }],
    },
    {
      id: "roots-of-unity", sayProblem: "In one plus x up to x to the eleven, how many exponents are divisible by three?", level: 20, hash: "roots-of-unity", aliases: ["roots-of-unity-filter", "filter", "multisection"], title: "Roots-of-unity filters", nav: "Roots-of-unity filter", branch: "fourier", difficulty: 4,
      prerequisites: ["geometric-series", "convolution"], related: ["finite-vectors", "inverse-dft", "dft"], techniques: ["roots-of-unity filters", "DFT"], gfType: "OGF", visual: "filter",
      problem: "In $A(x) = 1 + x + \\cdots + x^{11}$, how many terms have exponent $n \\equiv r \\pmod m$? (Default: divisible by 3.)",
      discreteModel: "The exponents 0, …, 11, sorted into residue classes mod m.",
      when: "Use a roots-of-unity filter when only coefficients in selected congruence classes matter.",
      key: "(1/m)Σⱼ ω^{j(n−r)} is 1 when n ≡ r (mod m) and 0 otherwise: the phasors of unwanted classes cancel.",
      n: { def: 0, min: 0, max: 11 }, params: { m: { label: "modulus m", values: [2, 3, 4, 6], def: 3 }, r: { label: "residue r", values: [0, 1, 2, 3, 4, 5], def: 0, valid: (v, p) => v < p.m }, poly: { label: "A(x)", values: ["1 + x + ⋯ + x¹¹", "(1 + x)¹²"], def: "1 + x + ⋯ + x¹¹" } }, gfName: "A(x)",
      closed: (p) => (p.poly.startsWith("(") ? "(1+x)^{12}" : "\\frac{1-x^{12}}{1-x}"),
      coeffs: (N, p) => G.seriesFrom(filterPoly(p), N),
      enumerate: null,
      answer: (n, v, p) => `Σ over n ≡ ${p.r % p.m} (mod ${p.m}) of aₙ = ${qstr(G.rootsFilterExact(filterPoly(p), p.m, p.r % p.m))}.`,
      reps: (p) => ({ series: G.seriesText(filterPoly(p), { terms: 6 }), roots: `A(ωʲ) for the ${p.m}th roots of unity`, closed: p.poly.startsWith("(") ? "(1 + x)¹²" : "(1 − x¹²)/(1 − x)" }),
      states: (p) => [
        { id: "classes", stage: "object", title: "Residue classes", tex: [`n \\equiv ${p.r % p.m} \\pmod{${p.m}}`], text: "We want only the coefficients in one congruence class.", say: `We want only the coefficients whose exponent leaves remainder ${p.r % p.m} on division by ${p.m}.` },
        { id: "roots", stage: "encode", title: `The ${p.m}th roots of unity`, tex: [`\\omega = e^{2\\pi i/${p.m}}, \\quad 1, \\omega, \\ldots, \\omega^{${p.m - 1}}`], text: "Evaluate A at every root: A(1), A(ω), ….", say: "Evaluate A at every root of unity." },
        { id: "cancel", stage: "manipulate", title: "Phasors of unwanted classes cancel", tex: ["\\frac1m\\sum_{j=0}^{m-1}\\omega^{j(n-r)} = \\begin{cases}1, & n \\equiv r \\pmod m\\\\ 0, & \\text{otherwise}\\end{cases}"], text: "For each monomial xⁿ the m phasors either all point the same way or spread evenly and sum to zero.", say: "For one monomial, the phasors either line up or spread evenly around the circle and cancel." },
        { id: "filter", stage: "manipulate", title: "The filter", tex: ["\\sum_{n \\equiv r} a_n = \\frac1m\\sum_{j=0}^{m-1}\\omega^{-rj}A(\\omega^j)"], text: "This is a Fourier projection onto one character of ℤ/mℤ.", say: "So the filter is an average over the roots. It is a Fourier projection onto one character of the cyclic group." },
      ],
      checks: (n, p) => { const a = filterPoly(p), f = G.rootsFilterExact(a, p.m, p.r % p.m), d = G.residueSum(a, p.m, p.r % p.m); return [{ name: "filter (exact in ℤ[ζ]) vs explicit residue-class enumeration", gf: qstr(f), other: fmtInt(d), method: "exact cyclotomic arithmetic", pass: G.qeq(f, Q(d)) }]; },
    },
    {
      id: "finite-vectors", sayProblem: "Represent one plus two x plus three x squared plus four x cubed by its coefficients and by its values at the fourth roots of unity.", level: 21, hash: "finite-vectors", aliases: ["evaluation", "finite-gf"], title: "Finite generating functions as vectors", nav: "Finite GFs as vectors", branch: "fourier", difficulty: 3,
      prerequisites: ["roots-of-unity"], related: ["dft", "inverse-dft"], techniques: ["DFT", "coefficient extraction"], gfType: "finite", visual: "vectors",
      problem: "Represent $A(x) = 1 + 2x + 3x^2 + 4x^3$ by its coefficients and by its values at the 4th roots of unity.",
      discreteModel: "A finite coefficient vector (a₀, …, a_{N−1}).",
      when: "Use the evaluation representation when a finite coefficient vector is easier to manipulate through its values.",
      key: "The DFT is the change of coordinates from the coefficients of a polynomial to its values at the roots of unity.",
      n: { def: 1, min: 0, max: 3 }, params: { N: { label: "N", values: [2, 3, 4, 8], def: 4 } }, gfName: "A(x)",
      closed: (p) => polyTex(fourierVec(p.N)), coeffs: (N, p) => G.seriesFrom(fourierVec(p.N), N), enumerate: null,
      answer: (n, v, p) => `A(ω${G.sup(n)}) = ${G.zExactString(G.dftExact(fourierVec(p.N), p.N)[n % p.N], p.N) ?? G.fmtComplex(G.dftFloat(fourierVec(p.N), p.N)[n % p.N])}.`,
      reps: (p) => ({ sequence: `[${fourierVec(p.N).join(", ")}]`, roots: G.dftExact(fourierVec(p.N), p.N).map((z, k) => `A(ω${G.sup(k)}) = ${G.zExactString(z, p.N)}`).join("; "), matrix: `${p.N}×${p.N} DFT matrix` }),
      states: (p) => [
        { id: "coeffs", stage: "object", title: "Coefficient representation", tex: [`[a_0, \\ldots, a_{${p.N - 1}}] = [${fourierVec(p.N).join(", ")}]`], text: "N numbers determine a polynomial of degree < N.", say: "N coefficients determine the polynomial." },
        { id: "values", stage: "encode", title: "Evaluation representation", tex: [`[A(1), A(\\omega), \\ldots, A(\\omega^{${p.N - 1}})]`], text: "N values at N distinct points determine it too (interpolation).", say: "So do its N values at the N roots of unity." },
        { id: "change", stage: "manipulate", title: "The DFT is a change of coordinates", tex: ["\\text{coefficients} \\xrightarrow{\\text{DFT}} \\text{values at roots of unity}".replace("\\xrightarrow{\\text{DFT}}", "\\longmapsto")], text: "Same polynomial, two coordinate systems.", say: "The discrete Fourier transform is just the change between these two coordinate systems." },
      ],
      checks: (n, p) => fourierChecks(p.N),
    },
    {
      id: "dft", sayProblem: "Evaluate one plus two x plus three x squared plus four x cubed at one, i, minus one and minus i with a single matrix.", level: 22, hash: "dft", aliases: ["dft-matrix", "fourier"], title: "The DFT matrix", nav: "DFT matrix", branch: "fourier", difficulty: 3,
      prerequisites: ["finite-vectors"], related: ["inverse-dft", "fft", "character-table"], techniques: ["DFT"], gfType: "finite", visual: "matrix",
      problem: "Evaluate $A(x) = 1 + 2x + 3x^2 + 4x^3$ at $1, i, -1, -i$ with one matrix.",
      discreteModel: "The coefficient vector a and the matrix of powers ω^{kn}.",
      when: "Use the DFT when a finite coefficient vector is easier to manipulate through polynomial values at roots of unity.",
      key: "Row k of the DFT matrix is (1, ωᵏ, ω²ᵏ, …): evaluating A at ωᵏ is a dot product. A(1) = 10, A(i) = −2 − 2i, A(−1) = −2, A(−i) = −2 + 2i.",
      n: { def: 1, min: 0, max: 7 }, params: { N: { label: "N", values: [2, 3, 4, 8], def: 4 } }, gfName: "A(x)",
      closed: (p) => polyTex(fourierVec(p.N)), coeffs: (N, p) => G.seriesFrom(fourierVec(p.N), N), enumerate: null,
      answer: (n, v, p) => `Row ${n % p.N}: A(ω${G.sup(n % p.N)}) = ${G.zExactString(G.dftExact(fourierVec(p.N), p.N)[n % p.N], p.N)}.`,
      reps: (p) => ({ matrix: `F = [ω^{kn}], ${p.N}×${p.N}`, roots: G.dftExact(fourierVec(p.N), p.N).map((z) => G.zExactString(z, p.N)).join("; ") }),
      states: (p) => [
        { id: "matrix", stage: "encode", title: "Vandermonde matrix at the roots of unity", tex: ["\\begin{bmatrix}A(1)\\\\A(\\omega)\\\\A(\\omega^2)\\\\\\vdots\\end{bmatrix} = \\begin{bmatrix}1&1&1&\\cdots\\\\1&\\omega&\\omega^2&\\cdots\\\\1&\\omega^2&\\omega^4&\\cdots\\\\\\vdots&&&\\ddots\\end{bmatrix}\\begin{bmatrix}a_0\\\\a_1\\\\a_2\\\\\\vdots\\end{bmatrix}"], text: "Entry (k, n) is ω^{kn}: the phasor that coefficient aₙ is turned by when evaluating at ωᵏ.", say: "The DFT matrix holds the powers of omega. Entry k, n is the rotation applied to coefficient n at root k." },
        { id: "worked", stage: "manipulate", title: "N = 4, ω = i", tex: ["A(i) = 1 + 2i - 3 - 4i = -2 - 2i"], text: "Each coefficient contributes a rotating vector; head to tail they reach A(i).", say: "With four points omega is i. One plus two i minus three minus four i is minus two minus two i." },
        { id: "all", stage: "manipulate", title: "All four values", tex: ["A(1) = 10,\\ A(i) = -2-2i,\\ A(-1) = -2,\\ A(-i) = -2+2i"], text: "Four views of one transform: coefficients, phasors, matrix, polynomial.", say: "The four values are ten, minus two minus two i, minus two, and minus two plus two i." },
      ],
      checks: (n, p) => fourierChecks(p.N),
    },
    {
      id: "inverse-dft", sayProblem: "Recover the coefficients from the four values at the fourth roots of unity.", level: 23, hash: "inverse-dft", aliases: ["idft"], title: "Inverse DFT as coefficient extraction", nav: "Inverse DFT", branch: "fourier", difficulty: 4,
      prerequisites: ["dft", "roots-of-unity"], related: ["roots-of-unity", "dft"], techniques: ["inverse DFT", "coefficient extraction", "roots-of-unity filters"], gfType: "finite", visual: "idft",
      problem: "Recover the coefficients $a_n$ from the four values $10, -2-2i, -2, -2+2i$.",
      discreteModel: "The values at roots of unity, averaged against ω^{−kn}.",
      when: "Use the inverse DFT to read coefficients back from values at the roots of unity.",
      key: "aₙ = (1/N)Σₖ A(ωᵏ)ω^{−kn}: a finite coefficient-extraction formula, and the same phenomenon as the roots-of-unity filter.",
      n: { def: 2, min: 0, max: 7 }, params: { N: { label: "N", values: [2, 3, 4, 8], def: 4 } }, gfName: "A(x)",
      closed: (p) => polyTex(fourierVec(p.N)), coeffs: (N, p) => G.seriesFrom(fourierVec(p.N), N), enumerate: null,
      answer: (n, v, p) => `a${G.subs(n % p.N)} = (1/${p.N})Σ A(ωᵏ)ω^{−k·${n % p.N}} = ${qstr(G.idftExact(G.dftExact(fourierVec(p.N), p.N))[n % p.N])}.`,
      reps: (p) => ({ sequence: `[${fourierVec(p.N).join(", ")}]`, roots: G.dftExact(fourierVec(p.N), p.N).map((z) => G.zExactString(z, p.N)).join("; ") }),
      /** @param {Params} p @param {number} n */
      states: (p, n) => [
        { id: "formula", stage: "manipulate", title: "Average against the conjugate phasors", tex: ["a_n = \\frac1N\\sum_{k=0}^{N-1} A(\\omega^k)\\,\\omega^{-kn}"], text: "Multiplying by ω^{−kn} rotates the wanted coefficient back to the positive axis; everything else cancels.", say: "Multiply each value by the reverse rotation and average. Only coefficient n survives." },
        { id: "compare", stage: "manipulate", title: "Two kinds of coefficient extraction", tex: ["\\text{ordinary GF: } [x^n]A(x)", "\\text{finite cyclic GF: average } A(\\omega^k)\\omega^{-kn} \\text{ over roots of unity}"], text: "The inverse DFT is the roots-of-unity filter with m = N, applied to xⁿ's residue class.", say: "This is the roots of unity filter again. Filtering and the inverse transform are the same phenomenon." },
        { id: "worked", stage: "manipulate", title: `Recover a${G.subs(n % p.N)}`, tex: [p.N === 4 ? `a_{${n % 4}} = \\tfrac14\\left(10 ${["+ (-2-2i) + (-2) + (-2+2i)", "+ (-2-2i)(-i) + (-2)(-1) + (-2+2i)(i)", "+ (-2-2i)(-1) + (-2)(1) + (-2+2i)(-1)", "+ (-2-2i)(i) + (-2)(-1) + (-2+2i)(-i)"][n % 4]}\\right) = ${n % 4 + 1}` : `a_{${n % p.N}} = ${n % p.N + 1}`], text: "Exact arithmetic in ℤ[ζ] reproduces each coefficient.", say: "Exact arithmetic gives the coefficient back." },
      ],
      checks: (n, p) => fourierChecks(p.N),
    },
    {
      id: "cyclic-convolution", sayProblem: "Compute a cyclic convolution directly and through the discrete Fourier transform.", level: 24, hash: "cyclic-convolution", aliases: ["convolution-theorem"], title: "The cyclic convolution theorem", nav: "Cyclic convolution", branch: "fourier", difficulty: 4,
      prerequisites: ["convolution", "inverse-dft"], related: ["convolution", "fft", "probability"], techniques: ["cyclic convolution", "convolution theorem"], gfType: "finite", visual: "cyclic",
      problem: "Compute $c_n = \\sum_k a_k b_{(n-k) \\bmod N}$ for $a = [1,2,3,4]$, $b = [1,1,0,0]$ directly and via the DFT.",
      discreteModel: "The product grid wrapped around a cylinder: diagonals wrap mod N.",
      when: "Use the convolution theorem when a cyclic convolution is cheaper as pointwise multiplication of DFTs.",
      key: "DFT(a ⊛ b) = DFT(a)·DFT(b): multiplication modulo xᴺ − 1 becomes coordinatewise multiplication.",
      n: { def: 0, min: 0, max: 7 }, params: { N: { label: "N", values: [4, 8], def: 4 } }, gfName: "C(x)",
      closed: (p) => `A(x)B(x) \\bmod (x^{${p.N}} - 1)`,
      coeffs: (N, p) => G.seriesFrom(G.cyclicConvolution(cycA(p.N), cycB(p.N), p.N), N),
      enumerate: (n, p) => G.cyclicByDFT(cycA(p.N), cycB(p.N), p.N)[n % p.N], enumLabel: "IDFT(DFT(a)·DFT(b)), exact",
      answer: (n, v, p) => `c${G.subs(n % p.N)} = ${fmtInt(G.cyclicConvolution(cycA(p.N), cycB(p.N), p.N)[n % p.N])} (wrap-around included).`,
      reps: (p) => ({ sequence: `a = [${cycA(p.N)}], b = [${cycB(p.N)}], c = [${G.cyclicConvolution(cycA(p.N), cycB(p.N), p.N).map(String)}]`, closed: `A(x)B(x) mod (x${G.sup(p.N)} − 1)` }),
      states: () => [
        { id: "direct", stage: "manipulate", title: "Left: cyclic convolution directly", tex: ["c_n = \\sum_k a_k b_{(n-k) \\bmod N}"], text: "The convolution grid is wrapped on a cylinder: diagonals that fall off the end come back at the start.", say: "Directly, the convolution grid wraps around a cylinder, so diagonals that run off the end come back." },
        { id: "transform", stage: "manipulate", title: "Right: transform, multiply, transform back", tex: ["\\hat a_k = A(\\omega^k), \\quad \\hat b_k = B(\\omega^k), \\quad \\hat c_k = \\hat a_k \\hat b_k"], text: "In value coordinates the product is pointwise.", say: "In value coordinates, the convolution is pointwise multiplication." },
        { id: "theorem", stage: "manipulate", title: "Why: ωᴺ = 1", tex: ["x^N \\equiv 1 \\Rightarrow A(\\omega^k)B(\\omega^k) = C(\\omega^k)", "\\mathbb{C}[x]/(x^N - 1) \\cong \\mathbb{C}^N"], text: "Evaluating at an Nth root of unity cannot see the difference between xᴺ and 1, so it respects multiplication mod xᴺ − 1.", say: "At an N th root of unity, x to the N is one, so evaluation respects multiplication modulo x to the N minus one." },
      ],
      checks: (n, p) => { const d = G.cyclicConvolution(cycA(p.N), cycB(p.N), p.N), f = G.cyclicByDFT(cycA(p.N), cycB(p.N), p.N); return [{ name: "direct cyclic convolution vs IDFT(DFT(a)·DFT(b))", gf: d.map(String).join(","), other: f.map(String).join(","), method: "exact in ℤ[ζ]", pass: d.every((x, i) => x === f[i]) }]; },
    },
    {
      id: "fft", sayProblem: "Multiply two small polynomials, and see why evaluating, multiplying and interpolating can be fast.", level: 25, hash: "fft", aliases: ["polynomial-multiplication", "fft-decomposition"], title: "Polynomial multiplication and the FFT", nav: "FFT motivation", branch: "fourier", difficulty: 4,
      prerequisites: ["cyclic-convolution"], related: ["convolution", "cyclic-convolution"], techniques: ["FFT decomposition", "convolution theorem"], gfType: "finite", visual: "fft",
      problem: "Multiply $(1 + 2x + 3x^2)(4 + 5x + 6x^2)$, then see why evaluate → multiply → interpolate can be fast.",
      discreteModel: "Coefficient vectors zero-padded to length 8 so that cyclic convolution equals ordinary convolution.",
      when: "Use the FFT viewpoint when multiplying long polynomials or convolving long sequences.",
      key: "A(x) = A_even(x²) + xA_odd(x²) halves the work at each level: O(n log n) instead of O(n²).",
      n: { def: 2, min: 0, max: 4 }, params: { size: { label: "transform length", values: [8, 16, 64, 1024], def: 8 } }, gfName: "A(x)B(x)",
      closed: () => "(1+2x+3x^2)(4+5x+6x^2)", coeffs: (N) => G.seriesFrom(G.mul([1n, 2n, 3n], [4n, 5n, 6n]), N),
      enumerate: (n) => G.multiplyByDFT([1, 2, 3], [4, 5, 6])[n] ?? 0n, enumLabel: "evaluate → multiply → interpolate, exact",
      answer: (n, v) => `[x${G.sup(n)}] = ${val(v)}; product 4 + 13x + 28x² + 27x³ + 18x⁴.`,
      reps: (p) => ({ sequence: "[4, 13, 28, 27, 18]", closed: "(1 + 2x + 3x²)(4 + 5x + 6x²)", matrix: `naive: ${p.size}² = ${p.size * p.size} products; FFT: (N/2)log₂N = ${(p.size / 2) * Math.log2(p.size)} twiddle products` }),
      states: () => [
        { id: "naive", stage: "manipulate", title: "Coefficient method: O(n²)", tex: ["c_n = \\sum_k a_k b_{n-k}"], text: "Every pair of coefficients meets once.", say: "The direct method multiplies every pair of coefficients." },
        { id: "evaluate", stage: "manipulate", title: "Evaluate, multiply, interpolate", tex: ["A, B \\xrightarrow{\\text{DFT}} \\hat A \\cdot \\hat B \\xrightarrow{\\text{IDFT}} AB".replace(/\\xrightarrow\{\\text\{(\w+)\}\}/g, "\\to")], text: "Pad to N ≥ deg(AB) + 1 so the cyclic product does not wrap.", say: "Evaluate both at the roots of unity, multiply values, and interpolate back." },
        { id: "split", stage: "manipulate", title: "The even/odd split", tex: ["A(x) = A_{\\text{even}}(x^2) + xA_{\\text{odd}}(x^2)"], text: "The squares of the Nth roots are the (N/2)th roots, so two half-size problems solve the whole one.", say: "Split even and odd coefficients. Squaring the roots halves the problem, and recursion gives the fast Fourier transform." },
      ],
      checks: () => { const a = [1, 2, 3, 4, 5, 6, 7, 8], st = { mults: 0 }, f = G.fft(a.map((x) => G.C(x)), st), d = G.dftFloat(a, 8), err = Math.max(...f.map((z, k) => G.cabs(G.csub(z, d[k])))); const prod = G.multiplyByDFT([1, 2, 3], [4, 5, 6]), naive = G.mul([1n, 2n, 3n], [4n, 5n, 6n]);
        return [{ name: "A(x) = A_even(x²) + xA_odd(x²) at every 8th root (exact)", gf: "holds", other: G.evenOddSplitHolds(a, 8) ? "holds" : "fails", method: "exact in ℤ[ζ₈]", pass: G.evenOddSplitHolds(a, 8) }, { name: "radix-2 FFT vs direct evaluation, N = 8", gf: G.fmtComplex(f[1]), other: G.fmtComplex(d[1]), method: `float, max error ${G.fmtNum(err, 2)} ≤ 1e−9`, pass: err <= 1e-9, tol: 1e-9 }, { name: "product via DFT vs coefficient convolution", gf: prod.map(String).join(","), other: naive.map(String).join(","), method: "exact", pass: prod.every((x, i) => x === naive[i]) }]; },
    },
    {
      id: "transfer-matrix", sayProblem: "Count binary strings of length n with no two consecutive ones.", level: 26, hash: "transfer-matrix", aliases: ["automata", "binary-strings", "no-11"], title: "Rational GFs and automata", nav: "Transfer matrices", branch: "rational", difficulty: 3,
      prerequisites: ["fibonacci"], related: ["fibonacci", "partial-fractions"], techniques: ["transfer matrices", "rational generating functions", "recurrence solving"], gfType: "OGF", visual: "automaton",
      problem: "Count binary strings of length $n$ with no two consecutive 1s.",
      discreteModel: "Walks of length n in a two-state automaton: last bit 0 (or empty), last bit 1.",
      when: "Use a transfer matrix when objects are words accepted by a finite automaton.",
      key: "v_{n+1} = Mvₙ gives Σ vₙxⁿ = (I − xM)⁻¹v₀: finite-state constraints give rational generating functions.",
      n: { def: 5, min: 0, max: 24 }, gfName: "S(x)", closed: () => "\\frac{1+x}{1-x-x^2}",
      coeffs: (N) => G.no11GF(N),
      enumerate: (n) => (n <= 16 ? BigInt(G.no11Strings(n).length) : G.transferCounts(n + 1)[n]), enumLabel: "all 2ⁿ strings filtered (n ≤ 16)",
      objects: (n) => objList(n <= 8 ? G.no11Strings(n).map((s) => s || "ε") : []),
      answer: (n, v) => `${val(v)} strings of length ${n} avoid 11.`,
      reps: () => ({ matrix: "M = [[1, 1], [1, 0]]", recurrence: "sₙ = sₙ₋₁ + sₙ₋₂", closed: "(1 + x)/(1 − x − x²)", sequence: "1, 2, 3, 5, 8, 13, …", class: "words accepted by a 2-state automaton" }),
      states: () => [
        { id: "automaton", stage: "object", title: "A finite-state automaton", tex: ["\\text{state 0: last bit 0 (or empty)}, \\quad \\text{state 1: last bit 1}"], text: "From state 0 you may write 0 or 1; from state 1 only 0.", say: "Two states remember the last bit. After a one, only a zero is allowed." },
        { id: "matrix", stage: "encode", title: "The transfer matrix", tex: ["v_{n+1} = Mv_n, \\quad M = \\begin{bmatrix}1&1\\\\1&0\\end{bmatrix}, \\quad v_0 = \\begin{bmatrix}1\\\\0\\end{bmatrix}"], text: "Row i of M lists the transitions into state i.", say: "The transfer matrix moves the counts of strings by state one step." },
        { id: "resolvent", stage: "manipulate", title: "Sum the geometric series of matrices", tex: ["\\sum_{n\\ge0} v_n x^n = (I - xM)^{-1}v_0", "S(x) = \\frac{1+x}{1-x-x^2}"], text: "Cramer's rule makes every entry rational with denominator det(I − xM) = 1 − x − x².", say: "Summing gives the inverse of I minus x M, a rational function with denominator one minus x minus x squared." },
      ],
      checks: (n) => { const t = G.transferCounts(n + 1)[n], g = G.no11GF(n + 1)[n]; return [{ name: "transfer matrix vₙ vs rational GF", gf: fmtInt(g), other: fmtInt(t), method: "exact", pass: t === g }, { name: "equals Fₙ₊₂", gf: fmtInt(g), other: fmtInt(G.fibonacciDP(n + 3)[n + 2]), method: "exact", pass: g === G.fibonacciDP(n + 3)[n + 2] }]; },
    },
    {
      id: "partitions", sayProblem: "Count the ways to write n as an unordered sum of positive integers.", level: 27, hash: "partitions", aliases: ["integer-partitions", "q-series"], title: "Partitions and q-series", nav: "Integer partitions", branch: "rational", difficulty: 3,
      prerequisites: ["coin-change"], related: ["coin-change", "euler-identity"], techniques: ["integer partitions", "q-series"], gfType: "OGF", visual: "ferrers",
      problem: "Count partitions of $n$: ways to write $n$ as an unordered sum of positive integers.",
      discreteModel: "Ferrers diagrams: rows of dots, weakly decreasing.",
      when: "Use an infinite product when each part size can be chosen independently any number of times.",
      key: "Each part size k contributes 1 + xᵏ + x²ᵏ + ⋯; the product over all k is Π 1/(1 − xᵏ).",
      n: { def: 6, min: 0, max: 40 }, params: { kind: { label: "parts", values: ["any", "distinct", "odd", "at most 3"], def: "any" } }, gfName: "P(x)",
      closed: (p) => /** @type {Record<string, string>} */ ({ any: "\\prod_{k\\ge1}\\frac{1}{1-x^k}", distinct: "\\prod_{k\\ge1}(1+x^k)", odd: "\\prod_{k\\ge1}\\frac{1}{1-x^{2k-1}}", "at most 3": "\\frac{1}{(1-x)(1-x^2)(1-x^3)}" })[p.kind],
      coeffs: (N, p) => partGF(p.kind, N),
      enumerate: (n, p) => (n <= 30 ? BigInt(partList(p.kind, n).length) : partGF(p.kind, n + 1)[n]), enumLabel: "partitions listed (n ≤ 30)",
      objects: (n, p) => objList(n <= 12 ? partList(p.kind, n).map((q) => q.join("+") || "∅") : []),
      answer: (n, v, p) => `p${p.kind === "any" ? "" : `_${p.kind}`}(${n}) = ${val(v)}.`,
      reps: (p) => ({ closed: /** @type {Record<string, string>} */ ({ any: "Π 1/(1 − xᵏ)", distinct: "Π (1 + xᵏ)", odd: "Π 1/(1 − x²ᵏ⁻¹)", "at most 3": "1/((1 − x)(1 − x²)(1 − x³))" })[p.kind], series: G.seriesText(partGF(p.kind, 10)) }),
      states: () => [
        { id: "ferrers", stage: "object", title: "Ferrers diagrams", tex: ["5 + 3 + 2 + 1 = 11"], text: "A partition is a multiset of parts, drawn as rows of dots.", say: "A partition is drawn as rows of dots, longest first." },
        { id: "factor", stage: "encode", title: "One factor per part size", tex: ["1 + x^k + x^{2k} + x^{3k} + \\cdots = \\frac{1}{1-x^k}"], text: "Choosing how many parts of size k is a geometric series in xᵏ.", say: "For each part size k, choosing how many copies is a geometric series in x to the k." },
        { id: "product", stage: "manipulate", title: "Multiply all factors", tex: ["P(x) = \\prod_{k \\ge 1}\\frac{1}{1-x^k}"], text: "This is coin change with every coin. Finite truncations k ≤ n are enough for [xⁿ].", say: "Multiply over every part size. It is coin change with a coin of every value." },
      ],
    },
    {
      id: "euler-identity", sayProblem: "Show that partitions into distinct parts are as numerous as partitions into odd parts.", level: 28, hash: "euler-identity", aliases: ["distinct-odd", "euler"], title: "Euler's partition identity", nav: "Euler's identity", branch: "rational", difficulty: 3,
      prerequisites: ["partitions"], related: ["partitions"], techniques: ["integer partitions", "q-series"], gfType: "OGF", visual: "euler",
      problem: "Show that partitions of $n$ into distinct parts are as numerous as partitions into odd parts.",
      discreteModel: "Two families of Ferrers diagrams of the same size.",
      when: "Use an equality of generating functions to prove that two families are equinumerous.",
      key: "Π(1 + xᵏ) = Π(1 − x²ᵏ)/(1 − xᵏ) = Π 1/(1 − x²ᵏ⁻¹): an algebraic identity, also explained by a bijection.",
      n: { def: 7, min: 0, max: 60 }, gfName: "D(x) = O(x)", closed: () => "\\prod_{k\\ge1}(1+x^k) = \\prod_{k\\ge1}\\frac{1}{1-x^{2k-1}}",
      coeffs: (N) => G.partitionsGF(N, { distinct: true }),
      enumerate: (n) => (n <= 40 ? BigInt(G.partitionsList(n, { odd: true }).length) : G.partitionsGF(n + 1, { parts: "odd" })[n]), enumLabel: "odd-part partitions listed",
      objects: (n) => objList(n <= 12 ? G.partitionsList(n, { distinct: true }).map((q) => q.join("+") || "∅") : []),
      answer: (n, v) => `${val(v)} distinct-part partitions = ${val(v)} odd-part partitions of ${n}.`,
      reps: () => ({ closed: "Π(1 + xᵏ) = Π 1/(1 − x²ᵏ⁻¹)", series: G.seriesText(G.partitionsGF(10, { distinct: true })) }),
      states: () => [
        { id: "two", stage: "object", title: "Two families", tex: ["D(x) = \\prod_{k\\ge1}(1+x^k), \\quad O(x) = \\prod_{k\\ge1}\\frac{1}{1-x^{2k-1}}"], text: "Distinct parts: each size used at most once. Odd parts: only odd sizes, any multiplicity.", say: "One family uses each part at most once. The other uses only odd parts." },
        { id: "algebra", stage: "manipulate", title: "Algebraic identity", tex: ["1 + x^k = \\frac{1-x^{2k}}{1-x^k} \\Rightarrow \\prod_k(1+x^k) = \\frac{\\prod_k (1-x^{2k})}{\\prod_k (1-x^k)} = \\prod_k\\frac{1}{1-x^{2k-1}}"], text: "The even factors cancel, leaving only odd ones.", say: "Write one plus x to the k as a quotient. The even factors cancel and only the odd ones remain." },
        { id: "bijection", stage: "manipulate", title: "Or a combinatorial bijection", tex: ["2^j m \\leftrightarrow 2^j \\text{ copies of } m \\ (m \\text{ odd})"], text: "Split each distinct part 2ʲm into 2ʲ copies of the odd part m (Glaisher). Two distinct ways to explain one equality.", say: "Or split each distinct part into equal odd parts. Algebra and bijection are two explanations of one equality." },
      ],
      checks: (n) => { const N = Math.max(n + 1, 31), d = G.partitionsGF(N, { distinct: true }), o = G.partitionsGF(N, { parts: "odd" }); return [{ name: `D(x) = O(x) coefficientwise up to x${G.sup(N - 1)}`, gf: d.slice(0, 8).map(String).join(",") + ",…", other: o.slice(0, 8).map(String).join(",") + ",…", method: "exact series", pass: d.every((x, i) => x === o[i]) }]; },
    },
    {
      id: "singularities", sayProblem: "How fast do the coefficients of one over one minus alpha x grow as the pole moves?", level: 29, hash: "singularities", aliases: ["asymptotics", "poles"], title: "Singularities and growth", nav: "Singularities", branch: "asymptotics", difficulty: 4,
      prerequisites: ["partial-fractions"], related: ["partial-fractions", "singularity-analysis"], techniques: ["singularity analysis", "rational generating functions"], gfType: "OGF", visual: "poles", analytic: true,
      problem: "How fast do the coefficients of $\\frac{1}{1-\\alpha x}$ grow, and how does moving the pole change that?",
      discreteModel: "αⁿ: strings over an alphabet of size α (for integer α), or weights in general.",
      when: "Use singularity analysis when exact formulas matter less than the growth of coefficients.",
      key: "The nearest singularity sets the exponential growth: a pole at ρ gives coefficients ≈ ρ⁻ⁿ.",
      n: { def: 10, min: 0, max: 40 }, params: { alpha: { label: "α (pole at 1/α)", values: Object.keys(ALPHAS), def: "3/2" } }, gfName: "A(x)",
      closed: (p) => `\\frac{1}{1-${p.alpha.includes("/") ? `\\frac{${p.alpha.split("/")[0]}}{${p.alpha.split("/")[1]}}` : p.alpha === "1" ? "" : p.alpha}x}`,
      coeffs: (N, p) => range(N).map((n) => qpow(ALPHAS[p.alpha], n)),
      enumerate: (n, p) => qpow(ALPHAS[p.alpha], n), enumLabel: "αⁿ by repeated exact multiplication",
      answer: (n, v, p) => `[x${G.sup(n)}] = (${p.alpha})${G.sup(n)} = ${val(v)}; pole at x = ${qstr(G.qdiv(Q(1), ALPHAS[p.alpha]))}.`,
      reps: (p) => ({ closed: `1/(1 − ${p.alpha}x)`, asymptotic: `aₙ = (${p.alpha})ⁿ, radius 1/α = ${qstr(G.qdiv(Q(1), ALPHAS[p.alpha]))}` }),
      states: () => [
        { id: "pole", stage: "encode", title: "A single pole", tex: ["A(x) = \\frac{1}{1-\\alpha x}, \\quad [x^n]A(x) = \\alpha^n"], text: "The pole sits at x = 1/α.", say: "One over one minus alpha x has a pole at one over alpha, and coefficients alpha to the n." },
        { id: "move", stage: "manipulate", title: "Move the pole", tex: ["\\log|a_n| = n\\log\\alpha"], text: "As the pole approaches the origin (α grows), the log-coefficient line gets steeper.", say: "Moving the pole towards zero makes the coefficients grow faster." },
        { id: "dominant", stage: "manipulate", title: "The dominant pole wins", tex: ["F_n \\sim \\frac{\\varphi^n}{\\sqrt5}, \\quad \\text{pole at } 1/\\varphi \\approx 0.618"], text: "For Fibonacci the other pole 1/ψ ≈ −1.618 is farther away and its contribution fades.", say: "With several poles, the nearest one dominates. For Fibonacci it is one over phi." },
      ],
      checks: () => { const n = 30, r = G.bigRatio(G.fibonacciDP(n + 1)[n], 1n) / G.fibonacciEstimate(n); return [{ name: "F₃₀ / (φ³⁰/√5) → 1", gf: G.fmtNum(r, 12), other: "1", method: "float, tolerance 1e−10", pass: Math.abs(r - 1) < 1e-10, tol: 1e-10 }]; },
    },
    {
      id: "singularity-analysis", sayProblem: "Estimate the coefficients of one minus x to the minus alpha, and the Catalan numbers, for large n.", level: 30, hash: "singularity-analysis", aliases: ["catalan-asymptotics", "transfer"], title: "Singularity analysis", nav: "Catalan asymptotics", branch: "asymptotics", difficulty: 5,
      prerequisites: ["singularities", "catalan"], related: ["catalan", "singularities", "saddle-point"], techniques: ["singularity analysis"], gfType: "OGF", visual: "asymptotic", analytic: true,
      problem: "Estimate $[x^n](1-x)^{-\\alpha}$ and the Catalan numbers $C_n$ for large $n$.",
      discreteModel: "Catalan trees again, now counted approximately.",
      when: "Use singularity analysis when the generating function has an algebraic singularity on its circle of convergence.",
      key: "Location of the singularity → exponential factor (4ⁿ); its type (square root) → polynomial correction (n^{−3/2}).",
      n: { def: 100, min: 1, max: 1000 }, params: { alpha: { label: "α", values: ["1/2", "3/2", "2", "3"], def: "1/2" } }, gfName: "(1-x)^{-\\alpha}",
      closed: (p) => `(1-x)^{-${p.alpha.includes("/") ? `${p.alpha.split("/")[0]}/${p.alpha.split("/")[1]}` : p.alpha}}`,
      coeffs: (N, p) => range(Math.min(N, 41)).map((n) => G.risingCoefficient(ALPHAS[p.alpha], n)),
      enumerate: null,
      answer: (n, v, p) => { const ex = G.qnum(G.risingCoefficient(ALPHAS[p.alpha], n)), est = G.singularityEstimate(ALPHAS[p.alpha], n); return `[x${G.sup(n)}] = ${G.fmtNum(ex, 6)}; n^{α−1}/Γ(α) = ${G.fmtNum(est, 6)}; ratio ${G.fmtNum(ex / est, 6)}.`; },
      reps: () => ({ asymptotic: "[xⁿ](1 − x)^{−α} ∼ n^{α−1}/Γ(α); Cₙ ∼ 4ⁿ/(√π n^{3/2})", closed: "C(x) = (1 − √(1 − 4x))/(2x)" }),
      states: () => [
        { id: "standard", stage: "encode", title: "The standard scale", tex: ["[x^n](1-x)^{-\\alpha} = \\binom{n+\\alpha-1}{n} \\sim \\frac{n^{\\alpha-1}}{\\Gamma(\\alpha)}"], text: "The exponent of the singularity becomes a power of n.", say: "For one minus x to the minus alpha, the coefficients grow like n to the alpha minus one over gamma of alpha." },
        { id: "catalan", stage: "manipulate", title: "Revisit Catalan", tex: ["C(x) = \\frac{1 - \\sqrt{1-4x}}{2x}, \\quad \\text{singularity at } x = \\tfrac14", "C_n \\sim \\frac{4^n}{\\sqrt{\\pi}\\,n^{3/2}}"], text: "Rescale x = u/4: the square-root singularity at u = 1 has α = −1/2.", say: "The Catalan function has a square root singularity at one quarter." },
        { id: "separate", stage: "manipulate", title: "Two separable contributions", tex: ["\\text{singularity at } \\tfrac14 \\to 4^n", "\\text{square-root type} \\to n^{-3/2}"], text: "Location gives the exponential factor; type gives the polynomial correction.", say: "Where the singularity is gives four to the n. What kind it is gives n to the minus three halves." },
      ],
      checks: (n, p) => {
        const a = ALPHAS[p.alpha], na = Math.max(n, 100), r1 = G.qnum(G.risingCoefficient(a, na)) / G.singularityEstimate(a, na), al = G.qnum(a), tol1 = (Math.abs(al * (al - 1)) / 2 + 0.01) / na * 1.05 + 1e-12;
        const nc = Math.max(n, 100), rc = G.ratioToEstimate(G.catalanClosed(nc), G.catalanLogEstimate(nc)), tolc = 1.2 / nc;
        return [{ name: `[xⁿ](1 − x)^{−${p.alpha}} / (n^{α−1}/Γ(α)) at n = ${na}`, gf: G.fmtNum(r1, 8), other: "1", method: `float; |ratio − 1| ≤ (|α(α−1)|/2 + 0.01)·1.05/n = ${G.fmtNum(tol1, 3)}`, pass: Math.abs(r1 - 1) <= tol1, tol: tol1 }, { name: `Cₙ / (4ⁿ/(√π n^{3/2})) at n = ${nc}`, gf: G.fmtNum(rc, 8), other: "1", method: `float via logs; |ratio − 1| ≤ 1.2/n = ${G.fmtNum(tolc, 3)} (true error ≈ 9/(8n))`, pass: Math.abs(rc - 1) <= tolc, tol: tolc }];
      },
    },
    {
      id: "saddle-point", sayProblem: "The coefficients of e to the x are one over n factorial. Where on a contour does Cauchy's integral get its value?", level: 31, hash: "saddle-point", aliases: ["cauchy-formula", "contour"], title: "Saddle-point intuition", nav: "Saddle point", branch: "asymptotics", difficulty: 5, optional: true,
      prerequisites: ["singularity-analysis"], related: ["singularity-analysis"], techniques: ["Cauchy coefficient formula", "saddle-point intuition"], gfType: "OGF", visual: "saddle", analytic: true,
      problem: "For the entire function $e^x$, $[x^n]e^x = 1/n!$. Where on a contour does the Cauchy integral get its value?",
      discreteModel: "The coefficient 1/n! as an integral around a circle |z| = r.",
      when: "Use the saddle-point view when the generating function is entire or has no useful singularity.",
      key: "Choosing r at the saddle (r ≈ n) concentrates the integral near z = r and recovers Stirling: 1/n! ≈ eⁿ/(nⁿ√(2πn)).",
      n: { def: 10, min: 2, max: 60 }, params: { r: { label: "radius r (×n)", values: ["0.5", "1", "2"], def: "1" } }, gfName: "e^x",
      closed: () => "e^x", coeffs: (N) => range(N).map((n) => Q(1, G.factorial(n))), enumerate: null,
      answer: (n) => `1/${n}! = ${G.fmtNum(1 / G.qnum(Q(G.factorial(n))), 6)}; saddle estimate ${G.fmtNum(G.saddleEstimate(n), 6)}.`,
      reps: () => ({ closed: "eˣ", asymptotic: "1/n! ∼ eⁿ/(nⁿ√(2πn))" }),
      states: () => [
        { id: "cauchy", stage: "encode", title: "Cauchy's coefficient formula", tex: ["[x^n]A(x) = \\frac{1}{2\\pi i}\\oint \\frac{A(z)}{z^{n+1}}\\,dz"], text: "Coefficient extraction is a complex integral around the origin.", say: "Coefficient extraction is a contour integral around the origin." },
        { id: "magnitude", stage: "manipulate", title: "Magnitude around the contour", tex: ["\\left|\\frac{e^z}{z^{n+1}}\\right| = \\frac{e^{r\\cos\\theta}}{r^{n+1}}"], text: "On |z| = r the integrand peaks sharply at θ = 0.", say: "On a circle the size of the integrand peaks sharply at the positive real axis." },
        { id: "saddle", stage: "manipulate", title: "Dominant region → asymptotics", tex: ["r = n:\\ \\frac{1}{n!} \\approx \\frac{e^n}{n^n\\sqrt{2\\pi n}}"], text: "Minimising eʳ/rⁿ gives r = n; a Gaussian approximation near θ = 0 gives Stirling's formula.", say: "Choosing the radius at the saddle and integrating the peak gives Stirling's formula." },
      ],
      checks: (n) => { const r = G.saddleEstimate(n) * G.qnum(Q(G.factorial(n))); return [{ name: `n! · eⁿ/(nⁿ√(2πn)) at n = ${n}`, gf: G.fmtNum(r, 8), other: "1", method: "float; |ratio − 1| ≤ 1/(12n) + 1/n²", pass: Math.abs(r - 1) <= 1 / (12 * n) + 1 / (n * n), tol: 1 / (12 * n) + 1 / (n * n) }]; },
    },
    {
      id: "multivariate", sayProblem: "Count lattice paths with east and north steps, then take the diagonal.", level: 32, hash: "multivariate", aliases: ["lattice-paths", "diagonal"], title: "Multivariate generating functions", nav: "Multivariate", branch: "extended", difficulty: 5, optional: true,
      prerequisites: ["bivariate", "convolution"], related: ["bivariate", "catalan"], techniques: ["multivariate coefficient extraction", "bivariate generating functions"], gfType: "multivariate", visual: "lattice",
      problem: "Count lattice paths from $(0,0)$ to $(m,n)$ with unit East and North steps; then take the diagonal $m = n$.",
      discreteModel: "Monotone lattice paths, coefficients drawn on the integer lattice.",
      when: "Use multivariate generating functions when objects carry several sizes at once.",
      key: "1/(1 − x − y) has a_{m,n} = C(m+n, m); the diagonal [xⁿyⁿ] = C(2n, n) is selected geometrically and has GF 1/√(1 − 4t).",
      n: { def: 4, min: 0, max: 14 }, gfName: "\\Delta A(t)", closed: () => "\\frac{1}{1-x-y} \\to \\sum_n \\binom{2n}{n}t^n = \\frac{1}{\\sqrt{1-4t}}",
      coeffs: (N) => G.centralBinomials(N),
      enumerate: (n) => G.latticeGrid(n + 1)[n][n], enumLabel: "paths counted by lattice dynamic programming",
      answer: (n, v) => `[x${G.sup(n)}y${G.sup(n)}] = C(${2 * n}, ${n}) = ${val(v)} paths.`,
      reps: () => ({ closed: "1/(1 − x − y)", matrix: "a_{m,n} = C(m + n, m)", sequence: "diagonal 1, 2, 6, 20, 70, …" }),
      states: () => [
        { id: "lattice", stage: "object", title: "Coefficients on the lattice", tex: ["A(x,y) = \\sum a_{m,n}x^my^n = \\frac{1}{1-x-y}"], text: "Cell (m, n) holds the number of paths to it.", say: "Put each coefficient on its lattice point." },
        { id: "diagonal", stage: "manipulate", title: "Diagonal extraction", tex: ["[x^ny^n]A(x,y) = \\binom{2n}{n}"], text: "Selecting the diagonal geometrically picks the balanced paths.", say: "The diagonal picks the paths with as many east as north steps." },
        { id: "dgf", stage: "manipulate", title: "The diagonal's own generating function", tex: ["\\sum_n \\binom{2n}{n} t^n = \\frac{1}{\\sqrt{1-4t}}"], text: "Diagonals of rational functions are algebraic here; its square is the geometric series 1/(1 − 4t).", say: "The diagonal has its own generating function, one over the square root of one minus four t." },
      ],
      checks: (n) => { const N = n + 1, d = G.centralBinomials(N), sq = G.mul(d, d, N), want = range(N).map((k) => 4n ** B(k)); return [{ name: "(Σ C(2n,n)tⁿ)² = 1/(1 − 4t), coefficientwise", gf: sq.map(String).slice(0, 6).join(","), other: want.map(String).slice(0, 6).join(","), method: "exact series", pass: sq.every((x, i) => x === want[i]) }]; },
    },
    {
      id: "unification", sayProblem: "Which representation makes a discrete structure simple?", level: 33, hash: "unification", aliases: ["unifying-picture", "synthesis"], title: "The unifying picture", nav: "Unifying picture", branch: "extended", difficulty: 3,
      prerequisites: ["cyclic-convolution", "singularity-analysis", "exponential-formula"], related: ["ogf", "dft", "singularity-analysis"], techniques: ["coefficient extraction", "convolution theorem"], gfType: "all", visual: "unify",
      problem: "Which representation makes this discrete structure simple?",
      discreteModel: "Every structure in the lab, seen as coefficients.",
      when: "Use this map to pick a representation before picking a trick.",
      key: "Generating functions are changes of representation; at roots of unity, convolution becomes multiplication.",
      n: null, gfName: null,
      states: () => [
        { id: "chain", stage: "object", title: "Objects → coefficients → generating functions", tex: ["\\text{objects} \\to \\text{coefficients} \\to A(x)"], text: "A discrete problem becomes coefficients; coefficients become algebra.", say: "A discrete problem becomes coefficients, and coefficients become algebra." },
        { id: "branches", stage: "manipulate", title: "Algebra, combinatorics, analysis", tex: ["\\text{recurrences, convolution, composition} \\mid \\text{constructions, labelled sets, partitions} \\mid \\text{singularities, asymptotics, contours}"], text: "Algebra reveals constructions, recurrences and convolution; complex analysis reveals growth.", say: "Algebra reveals constructions and recurrences. Analysis reveals growth." },
        { id: "fourier", stage: "manipulate", title: "Roots of unity: simpler coordinates", tex: ["\\mathbb{C}[x]/(x^N-1) \\cong \\mathbb{C}^N: \\text{ convolution} \\mapsto \\text{pointwise product}"], text: "Evaluating finite generating polynomials at roots of unity gives Fourier coordinates, where convolution becomes multiplication.", say: "At the roots of unity, convolution becomes multiplication." },
      ],
    },
  ];

  /* ---------- small helpers used by the lessons ---------- */
  /** @param {number} d */
  const xp = (d) => (d === 1 ? "x" : `x^{${d}}`);
  /* A comma-separated choice such as "1, 2, 5" as numbers. */
  /** @param {string} text */
  const numList = (text) => text.split(",").map((s) => Number(s.trim()));
  /** @param {Params} p */
  const denoms = (p) => numList(p.coins);
  /** @param {Params} p */
  const partsOf = (p) => numList(p.parts);
  /** Restricted growth string → its blocks, as "{1,3}{2}". @param {number[]} s */
  function blocksText(s) { const blocks = /** @type {number[][]} */ ([]); s.forEach((b, i) => { (blocks[b] ??= []).push(i + 1); }); return blocks.map((b) => `{${b.join(",")}}`).join(""); }
  /* n! [xⁿ]T for T = x e^T, by Lagrange: n! · (1/n) [u^{n−1}] e^{nu} = n! · n^{n−1}/(n · (n−1)!), exactly. */
  /** @param {number} n */
  function cayleyByLagrange(n) { return G.toBig(G.qmul(Q(G.factorial(n)), G.qdiv(Q(B(n) ** B(n - 1), G.factorial(n - 1)), Q(n)))); }
  /** @param {number} n */
  function harmonic(n) { let h = Q(0); for (let k = 1; k <= n; k++) h = G.qadd(h, Q(1, k)); return h; }
  /** @param {Exact} q @param {number} n */
  function qpow(q, n) { let r = Q(1); for (let i = 0; i < n; i++) r = G.qmul(r, q); return r; }
  /** @param {Params} p */
  function filterPoly(p) { return p.poly.startsWith("(") ? range(13).map((k) => G.binom(12, k)) : range(12).map(() => 1n); }
  /** @param {number} N */
  function fourierVec(N) { return range(N).map((i) => i + 1); }
  /** @param {number} N */
  function cycA(N) { return range(N).map((i) => B(i + 1)); }
  /** @param {number} N */
  function cycB(N) { return range(N).map((i) => (i < 2 ? 1n : 0n)); }
  /** @param {number[]} a */
  function polyTex(a) { return a.map((c, n) => `${n && c >= 0 ? "+" : ""}${c === 1 && n ? "" : c}${n === 0 ? "" : n === 1 ? "x" : `x^{${n}}`}`).join(" "); }
  /* Each partition kind as options for the product (partitionsGF) and for the enumeration (partitionsList); any other kind is unrestricted. */
  /** @type {Record<string, [Parameters<typeof G.partitionsGF>[1], Parameters<typeof G.partitionsList>[1]]>} */
  const PART_KINDS = { distinct: [{ distinct: true }, { distinct: true }], odd: [{ parts: "odd" }, { odd: true }], "at most 3": [{ maxPart: 3 }, { maxPart: 3 }] };
  /** @param {string} kind @param {number} N */
  const partGF = (kind, N) => G.partitionsGF(N, (PART_KINDS[kind] || [])[0]);
  /** @param {string} kind @param {number} n */
  const partList = (kind, n) => G.partitionsList(n, (PART_KINDS[kind] || [])[1]);
  /* Exact DFT checks shared by the Fourier lessons: IDFT(DFT(a)) = a, and the float phasor sums agree. */
  /** @param {number} N @returns {Check[]} */
  function fourierChecks(N) {
    const a = fourierVec(N), v = G.dftExact(a, N), back = G.idftExact(v, N), f = G.dftFloat(a, N);
    const err = Math.max(...v.map((z, k) => G.cabs(G.csub(G.zToComplex(z, N), f[k]))));
    return [
      { name: "IDFT(DFT(a)) = a", gf: back.map(qstr).join(","), other: a.join(","), method: "exact in ℤ[ζ]", pass: back.every((q, i) => G.qeq(q, Q(a[i]))) },
      { name: "exact values vs head-to-tail phasor sums", gf: G.zExactString(v[1 % N], N) ?? G.fmtComplex(G.zToComplex(v[1 % N], N)), other: G.fmtComplex(f[1 % N]), method: `float, max error ${G.fmtNum(err, 2)} ≤ 1e−9`, pass: err <= 1e-9, tol: 1e-9 },
    ];
  }

  /* Constructions for the symbolic-combinatorics builder: each with its GF and an object lister. */
  /** @type {Record<string, { tex: string, text: string, coeffs: (N: number) => bigint[], list: (n: number) => string[] }>} */
  const BUILDS = {
    "SEQ(Z + Z²)": { tex: "\\frac{1}{1-(x+x^2)}", text: "1/(1 − x − x²)", coeffs: (N) => G.compositionsGF([1, 2], N), list: (n) => G.compositionsList([1, 2], n).map((c) => c.map((s) => (s === 1 ? "Z" : "Z²")).join(" ") || "ε") },
    "PAIR(SEQ(Z), SEQ(Z))": { tex: "\\frac{1}{1-x}\\cdot\\frac{1}{1-x}", text: "1/(1 − x)²", coeffs: (N) => G.mul(G.seriesFrom([], N).map(() => 1n), G.seriesFrom([], N).map(() => 1n), N), list: (n) => range(n + 1).map((i) => `(${"Z".repeat(i) || "ε"}, ${"Z".repeat(n - i) || "ε"})`) },
    "Z + Z²": { tex: "x + x^2", text: "x + x²", coeffs: (N) => G.seriesFrom([0, 1, 1], N), list: (n) => (n === 1 ? ["Z"] : n === 2 ? ["Z²"] : []) },
    "SEQ(Z + Z² + Z³)": { tex: "\\frac{1}{1-(x+x^2+x^3)}", text: "1/(1 − x − x² − x³)", coeffs: (N) => G.compositionsGF([1, 2, 3], N), list: (n) => G.compositionsList([1, 2, 3], n, 200).map((c) => c.map((s) => "Z" + (s > 1 ? G.sup(s) : "")).join(" ") || "ε") },
  };

  /* ---------- lesson access ---------- */
  const byId = new Map(LESSONS.map((l) => [l.id, l]));
  /** @param {string | undefined} id */
  const lesson = (id) => (id === undefined ? undefined : byId.get(id));
  /**
   * The lesson with this id, for ids the curriculum itself names; an unknown id is an error.
   * @param {string} id
   */
  const known = (id) => { const l = byId.get(id); if (!l) throw new Error(`Unknown lesson: ${id}`); return l; };
  /** @param {Lesson} l @returns {Params} */
  function defaults(l) { const p = /** @type {Params} */ ({}); for (const [k, spec] of Object.entries(l.params || {})) p[k] = spec.def; return p; }
  /* Parameters with every value checked against the lesson's choices. */
  /** @param {Lesson} l @param {Record<string, unknown>} [given] @returns {Params} */
  function params(l, given = {}) {
    const p = defaults(l);
    for (const [k, spec] of Object.entries(l.params || {})) if (k in given) { const v = spec.values.find((x) => String(x) === String(given[k])); if (v !== undefined) p[k] = v; }
    /* A choice that depends on another (residue r < modulus m) falls back to its first valid value. */
    for (const [k, spec] of Object.entries(l.params || {})) { const valid = spec.valid; if (valid && !valid(p[k], p)) p[k] = spec.values.find((x) => valid(x, p)); }
    return p;
  }
  /* The largest n a lesson offers: a finite vector of length N has coefficients 0 … N − 1. */
  /** @param {Lesson} l @param {Params} [p] */
  function nMax(l, p = {}) { return l.gfType === "finite" && p.N && l.id !== "fft" ? p.N - 1 : /** @type {NonNullable<Lesson["n"]>} */ (l.n).max; } // only lessons with an n reach here
  /** @param {Lesson} l @param {unknown} n @param {Params} [p] */
  function clampN(l, n, p) { if (!l.n) return null; const v = Number.isFinite(Number(n)) ? Math.round(Number(n)) : l.n.def; return Math.min(nMax(l, p || defaults(l)), Math.max(l.n.min, v)); }
  /** @param {Lesson} l @param {Params} p */
  const isEgf = (l, p) => (typeof l.egf === "function" ? l.egf(p) : !!l.egf);
  /* Coefficients a₀ … a_{N−1} of the lesson's generating function (BigInt or rational). */
  /** @param {Lesson} l @param {Params} p @param {number} N @returns {Coef[]} */
  function coefficients(l, p, N) { return l.coeffs ? l.coeffs(N, p) : []; }
  /** @param {Lesson} l @param {Params} p @param {number} n */
  function coefficient(l, p, n) { const a = coefficients(l, p, n + 1); return a[n] ?? 0n; }

  /* ---------- the verification engine ---------- */
  /* Every check the lab can run for a lesson at size n: the GF coefficient against its independent count, then the lesson's own checks. */
  /** @param {Lesson} l @param {Params} p @param {number} n @returns {Check[]} */
  function verify(l, p, n) {
    const out = [];
    if (l.coeffs && l.enumerate) {
      const g = coefficient(l, p, n), e = l.enumerate(n, p);
      out.push({ name: `[x${G.sup(n)}] vs ${l.enumLabel}`, gf: val(g), other: val(e), method: "exact", pass: G.isQ(g) || G.isQ(e) ? G.qeq(G.toQ(g), G.toQ(e)) : B(g) === B(e) });
    }
    if (l.checks) out.push(...l.checks(n, p));
    return out;
  }

  /* ---------- the problem ladder (section 10) ---------- */
  /** @type {Problem[]} */
  const PROBLEMS = [
    { k: 1, say: "Find the generating function of the constant sequence.", title: "Encode 1, 1, 1, …", lesson: "geometric-series", technique: "geometric series", difficulty: 1, problem: "Find the generating function of the constant sequence 1, 1, 1, ….", visualHint: "Watch the truncated tape 1 + x + ⋯ + x^N fold up.", ask: { n: 9 }, hints: ["Write the sum term by term: what is the coefficient of every power?", "Multiply the truncation 1 + x + ⋯ + x^N by (1 − x).", "Everything telescopes to 1 − x^{N+1}."], solution: "\\frac{1}{1-x}" },
    { k: 2, say: "Find the generating function of zero, zero, one, one, one.", title: "Encode 0, 0, 1, 1, …", lesson: "shift", params: { k: 2 }, technique: "shifting", difficulty: 1, problem: "Find the generating function of 0, 0, 1, 1, 1, ….", visualHint: "Slide the constant strip two places right.", ask: { n: 5, lesson: "ogf-shifted" }, hints: ["Compare with 1, 1, 1, ….", "The strip has moved right by two places.", "Multiplying by x^k shifts by k."], solution: "\\frac{x^2}{1-x}", answerFn: (n) => (n >= 2 ? 1n : 0n) },
    { k: 3, say: "Find the generating function of the sequence n.", title: "GF of n", lesson: "differentiation", technique: "differentiation", difficulty: 2, problem: "Find Σ n xⁿ.", visualHint: "Differentiate the constant strip, then multiply by x.", ask: { n: 6 }, hints: ["Start from Σ xⁿ = 1/(1 − x).", "Differentiation multiplies aₙ by n and shifts left.", "Multiply by x to shift back."], solution: "\\frac{x}{(1-x)^2}" },
    { k: 4, say: "Find the generating function of the Fibonacci numbers.", title: "Fibonacci numbers", lesson: "fibonacci", technique: "recurrence", difficulty: 2, problem: "Find F(x) for F₀ = 0, F₁ = 1, Fₙ = Fₙ₋₁ + Fₙ₋₂.", visualHint: "Align the rows Fₙ, Fₙ₋₁, Fₙ₋₂.", ask: { n: 10 }, hints: ["Multiply the recurrence by xⁿ and sum over n ≥ 2.", "Σ Fₙ₋₁xⁿ = xF(x) and Σ Fₙ₋₂xⁿ = x²F(x).", "Only the x¹ term survives: F − xF − x²F = x."], solution: "\\frac{x}{1-x-x^2}" },
    { k: 5, say: "Find a closed formula for the Fibonacci numbers.", title: "Solve Fibonacci explicitly", lesson: "partial-fractions", technique: "partial fractions", difficulty: 3, problem: "Find a closed formula for Fₙ.", visualHint: "Split the rational function at its two poles.", ask: { n: 12 }, hints: ["Factor 1 − x − x² = (1 − φx)(1 − ψx).", "Write x/((1 − φx)(1 − ψx)) as A/(1 − φx) + B/(1 − ψx).", "A = 1/√5 and B = −1/√5."], solution: "F_n = \\frac{\\varphi^n - \\psi^n}{\\sqrt5}" },
    { k: 6, say: "Count pairs of nonnegative integers that add up to n.", title: "Count i + j = n", lesson: "convolution", technique: "convolution", difficulty: 2, problem: "How many pairs (i, j) of nonnegative integers have i + j = n?", visualHint: "Highlight the anti-diagonal of the product grid.", ask: { n: 7 }, hints: ["Each coordinate is chosen independently.", "Choosing i is 1/(1 − x); so is choosing j.", "Multiply and read the diagonal."], solution: "[x^n]\\frac{1}{(1-x)^2} = n+1" },
    { k: 7, say: "Count the ways to make twelve cents from coins of one, two and five.", title: "Coin change", lesson: "coin-change", technique: "product", difficulty: 2, problem: "How many ways to make 12 cents with coins 1, 2, 5?", visualHint: "Count lattice points on a + 2b + 5c = 12.", ask: { n: 12 }, hints: ["Each coin type can be used any number of times.", "A d-cent coin contributes 1/(1 − x^d).", "Multiply the three factors and read [x¹²]."], solution: "[x^{12}]\\frac{1}{(1-x)(1-x^2)(1-x^5)} = 13" },
    { k: 8, say: "Count compositions of seven with parts one, two and three.", title: "Compositions with parts 1, 2, 3", lesson: "compositions", technique: "sequence construction", difficulty: 2, problem: "Count compositions of 7 with parts 1, 2, 3.", visualHint: "Build rows of tiles of length 1, 2, 3.", ask: { n: 7 }, hints: ["What generating function represents choosing one part?", "One part contributes x + x² + x³.", "A composition is a sequence of parts.", "SEQUENCE(A) corresponds to 1/(1 − A)."], solution: "\\frac{1}{1-x-x^2-x^3}" },
    { k: 9, say: "Count binary strings of length six with no two adjacent ones.", title: "Binary strings without 11", lesson: "transfer-matrix", technique: "recurrence / transfer matrix", difficulty: 3, problem: "Count binary strings of length 6 with no two adjacent 1s.", visualHint: "Walk the two-state automaton.", ask: { n: 6 }, hints: ["Remember only the last bit.", "Transitions: 0 → 0, 0 → 1, 1 → 0.", "Sum the geometric series of the transfer matrix: (I − xM)⁻¹."], solution: "\\frac{1+x}{1-x-x^2}" },
    { k: 10, say: "Find the equation for balanced strings of parentheses.", title: "Balanced parentheses", lesson: "catalan", technique: "implicit GF", difficulty: 3, problem: "Find the GF equation for balanced strings of n pairs of parentheses.", visualHint: "Decompose at the partner of the first “(”.", ask: { n: 5 }, hints: ["A nonempty string is ( A ) B.", "A and B are again balanced.", "So C = 1 + xC²."], solution: "C(x) = 1 + xC(x)^2" },
    { k: 11, say: "Solve the Catalan equation and find its coefficients.", title: "Catalan closed form", lesson: "catalan", technique: "algebraic GF", difficulty: 3, problem: "Solve C = 1 + xC² and find Cₙ.", visualHint: "Expand the square root by the binomial theorem.", ask: { n: 6 }, hints: ["It is a quadratic in C.", "Choose the root that is a power series at x = 0.", "Expand √(1 − 4x) with the general binomial theorem."], solution: "C_n = \\frac{1}{n+1}\\binom{2n}{n}" },
    { k: 12, say: "Find the sixth coefficient of a tree generating function by Lagrange inversion.", title: "Rooted tree coefficient", lesson: "lagrange-inversion", technique: "Lagrange inversion", difficulty: 4, problem: "For T = x(1 + T)², find [x⁶]T.", visualHint: "Map the wanted coefficient into φ(u)⁶.", ask: { n: 6 }, hints: ["Here φ(u) = (1 + u)².", "Lagrange: [xⁿ]T = (1/n)[uⁿ⁻¹]φ(u)ⁿ.", "[u⁵](1 + u)¹² = C(12, 5)."], solution: "[x^6]T = \\frac16\\binom{12}{5} = 132" },
    { k: 13, say: "Count labelled selections of four labels.", title: "Labelled selections", lesson: "labelled-product", technique: "EGF", difficulty: 3, problem: "Choose an ordered list from some of the labels {1, …, n}, leaving the rest unordered. How many for n = 4?", visualHint: "Choose which labels go left: C(n, k).", ask: { n: 4 }, hints: ["Left part: arrangements, EGF 1/(1 − x).", "Right part: a set, EGF eˣ.", "Labelled product = product of EGFs."], solution: "n!\\,[x^n]\\frac{e^x}{1-x} = 65" },
    { k: 14, say: "Count permutations of five labels, and those with two cycles.", title: "Permutations by cycles", lesson: "permutations-cycles", technique: "exponential formula", difficulty: 4, problem: "Count permutations of 5 labels, and those with exactly 2 cycles.", visualHint: "Draw each permutation as arrows.", ask: { n: 5 }, hints: ["A permutation is a set of cycles.", "Cycles on k labels: (k − 1)!, so C(x) = log 1/(1 − x).", "Mark cycles with y: (1 − x)^{−y}; [y²] gives c(5, 2) = 50."], solution: "\\exp\\left(\\log\\frac{1}{1-x}\\right) = \\frac{1}{1-x}" },
    { k: 15, say: "Find the probability that two dice sum to seven.", title: "Sum of dice", lesson: "probability", params: { dice: 2 }, technique: "probability GF", difficulty: 3, problem: "Probability that two fair dice sum to 7?", visualHint: "Multiply the one-die histogram by itself.", ask: { n: 7 }, hints: ["One die: (z + ⋯ + z⁶)/6.", "Independent sum = product.", "[z⁷] of the square counts 6 of 36 pairs."], solution: "[z^7]\\left(\\frac{z+\\cdots+z^6}{6}\\right)^2 = \\frac16" },
    { k: 16, say: "Count the exponents up to eleven that are divisible by three.", title: "Coefficients with n ≡ r mod m", lesson: "roots-of-unity", technique: "roots-of-unity filter", difficulty: 4, problem: "In 1 + x + ⋯ + x¹¹, how many exponents are divisible by 3?", visualHint: "Watch the phasors of classes 1 and 2 cancel.", ask: { n: 0, value: 4n }, hints: ["Evaluate A at 1, ω, ω² with ω = e^{2πi/3}.", "A(ω) = A(ω²) = 0 here, since ω¹² = 1.", "Average: (A(1) + A(ω) + A(ω²))/3."], solution: "\\frac13(12 + 0 + 0) = 4" },
    { k: 17, say: "Recover a coefficient from four values at the roots of unity.", title: "Recover a vector from root evaluations", lesson: "inverse-dft", technique: "inverse DFT", difficulty: 4, problem: "Given A(1) = 10, A(i) = −2 − 2i, A(−1) = −2, A(−i) = −2 + 2i, find a₂.", visualHint: "Rotate each value back by ω^{−2k} and average.", ask: { n: 2, value: 3n }, hints: ["aₙ = (1/N)Σ A(ωᵏ)ω^{−kn}.", "For n = 2, ω^{−2k} = (−1)ᵏ.", "(10 − (−2 − 2i) + (−2) − (−2 + 2i))/4."], solution: "a_2 = 3" },
    { k: 18, say: "Compute one entry of a cyclic convolution.", title: "Cyclic convolution", lesson: "cyclic-convolution", technique: "DFT", difficulty: 4, problem: "Compute c₀ for a = [1,2,3,4], b = [1,1,0,0] cyclically.", visualHint: "Follow the wrapped diagonal.", ask: { n: 0, value: 5n }, hints: ["c₀ = Σ aₖ b_{−k mod 4}.", "Terms: a₀b₀ and a₃b₁ (wrap-around).", "Or: pointwise multiply the DFTs and invert."], solution: "c_0 = 1 + 4 = 5" },
    { k: 19, say: "Find one coefficient of a polynomial product.", title: "Polynomial product", lesson: "fft", technique: "FFT viewpoint", difficulty: 4, problem: "Find [x²] of (1 + 2x + 3x²)(4 + 5x + 6x²).", visualHint: "Pad to length 8 and multiply values at 8th roots.", ask: { n: 2 }, hints: ["Diagonal of the product grid.", "1·6 + 2·5 + 3·4.", "Via the DFT: pad so nothing wraps."], solution: "28" },
    { k: 20, say: "Count the partitions of ten.", title: "Integer partitions", lesson: "partitions", technique: "infinite product", difficulty: 3, problem: "How many partitions of 10?", visualHint: "Ferrers diagrams; one factor per part size.", ask: { n: 10 }, hints: ["Each part size k is used any number of times.", "Factor 1/(1 − xᵏ) for each k.", "Multiply k = 1, …, 10 and read [x¹⁰]."], solution: "p(10) = 42" },
    { k: 21, say: "Estimate the hundredth Catalan number.", title: "Catalan asymptotics", lesson: "singularity-analysis", technique: "singularity analysis", difficulty: 5, problem: "Estimate C₁₀₀ to leading order.", visualHint: "Separate the 4ⁿ factor from n^{−3/2}.", ask: { n: 100, approx: true }, hints: ["The dominant singularity is at x = 1/4.", "It is a square-root singularity.", "Transfer: Cₙ ∼ 4ⁿ/(√π n^{3/2})."], solution: "C_n \\sim \\frac{4^n}{\\sqrt{\\pi}\\,n^{3/2}}" },
    { k: 22, say: "Count lattice paths from the origin to five, five.", title: "Multivariate lattice paths", lesson: "multivariate", technique: "multivariate GF", difficulty: 5, problem: "How many E/N lattice paths from (0, 0) to (5, 5)?", visualHint: "Select the diagonal of the coefficient lattice.", ask: { n: 5 }, hints: ["A(x, y) = 1/(1 − x − y).", "a_{m,n} = C(m + n, m).", "Diagonal: C(2n, n)."], solution: "\\binom{10}{5} = 252" },
  ];
  /* The expected answer for a problem's coefficient question, from the lesson engine. */
  /** @param {Problem} pr @returns {Exact} */
  function problemAnswer(pr) {
    if (pr.ask.value !== undefined) return pr.ask.value;
    if (pr.answerFn) return pr.answerFn(pr.ask.n);
    const l = known(pr.lesson);
    if (pr.ask.approx) return G.catalanClosed(pr.ask.n);
    return coefficient(l, params(l, pr.params || {}), pr.ask.n);
  }
  /* Accept "13", "1/6", "−5" (true minus); approximate questions accept within 1%. */
  /** @param {Problem} pr @param {unknown} text */
  function checkAnswer(pr, text) {
    const s = String(text || "").trim().replace(/−/g, "-").replace(/\s+/g, "");
    const want = problemAnswer(pr);
    const m = /^(-?\d+)(?:\/(\d+))?$/.exec(s);
    if (pr.ask.approx) {
      const x = Number(s.replace(/×10\^?/, "e"));
      if (!Number.isFinite(x)) return { ok: false, reason: "Enter a number, for example 9e56." };
      const r = x / G.bigRatio(B(/** @type {bigint} */ (want)), 1n); // approximate answers are integers (Catalan numbers)
      return { ok: Math.abs(r - 1) <= 0.01, reason: `within 1%: ratio ${G.fmtNum(r, 4)}` };
    }
    if (!m) return { ok: false, reason: "Enter an integer or a fraction such as 1/6." };
    const q = Q(B(m[1]), B(m[2] || 1));
    return { ok: G.qeq(q, G.toQ(want)), reason: "" };
  }

  /* ---------- comparisons (Compare mode) ---------- */
  const COMPARISONS = [
    { id: "ogf-egf", title: "OGF vs EGF", left: "convolution", right: "labelled-product", note: "OGF convolution Σ aₖbₙ₋ₖ combines unlabelled pieces; EGF convolution Σ C(n,k)aₖbₙ₋ₖ chooses which labels go where." },
    { id: "linear-cyclic", title: "Linear vs cyclic convolution", left: "convolution", right: "cyclic-convolution", note: "Cyclic convolution wraps diagonals mod N; padding to N ≥ deg + 1 makes them agree." },
    { id: "recurrence-construction", title: "Recurrence solving vs combinatorial construction", left: "fibonacci", right: "compositions", note: "Fₙ₊₁ counts compositions into 1s and 2s: the recurrence and SEQ(Z + Z²) give the same 1/(1 − x − x²)." },
    { id: "partial-singularity", title: "Partial fractions vs singularity analysis", left: "partial-fractions", right: "singularities", note: "Partial fractions give every term exactly; singularity analysis keeps only the dominant pole's contribution." },
    { id: "filter-enumeration", title: "Roots-of-unity filter vs residue-class enumeration", left: "roots-of-unity", right: "inverse-dft", note: "Averaging over roots of unity and listing exponents by residue give the same count; the inverse DFT is the filter applied to every class." },
  ];

  /* ---------- concept-map index, aliases and hash routes ---------- */
  const TECHNIQUES = ["sequence encoding", "coefficient extraction", "geometric series", "shifting", "differentiation", "integration", "addition", "subtraction", "Cauchy product", "convolution", "partial fractions", "recurrence solving", "rational generating functions", "combinatorial sum", "combinatorial product", "sequence construction", "composition", "implicit equations", "Lagrange inversion", "ordinary generating functions", "exponential generating functions", "labelled product", "exponential formula", "marking", "bivariate generating functions", "probability generating functions", "roots-of-unity filters", "DFT", "inverse DFT", "cyclic convolution", "convolution theorem", "FFT decomposition", "transfer matrices", "integer partitions", "q-series", "singularity analysis", "Cauchy coefficient formula", "saddle-point intuition", "multivariate coefficient extraction"];
  /* The lesson that teaches each technique first. */
  /** @param {string} t */
  const techniqueLesson = (t) => LESSONS.find((l) => l.techniques.includes(t));
  const PAGES = /** @type {string[]} */ (["problems", "compare", "fourier", "sandbox", "confusions", "map", "techniques"]);
  /** @param {RouteRef | null | undefined} route */
  function hashFor(route) {
    if (!route || route.page === "lesson") {
      const l = lesson(route?.id) || LESSONS[0], q = [];
      const p = params(l, route?.params || {}), n = l.n ? clampN(l, route?.n ?? l.n.def, p) : null;
      if (n !== null && l.n && n !== l.n.def) q.push(`n=${n}`);
      for (const [k, v] of Object.entries(p)) if (String(v) !== String(l.params?.[k].def)) q.push(`${k}=${encodeURIComponent(v)}`);
      return `#${l.hash}${q.length ? "?" + q.join("&") : ""}`;
    }
    if (route.page === "problem") return `#problem-${route.k}`;
    if (route.page === "compare" && route.id) return `#compare/${route.id}`;
    if (route.page === "fourier" && route.N && route.N !== 4) return `#fourier?N=${route.N}`;
    return `#${route.page}`;
  }
  /** @param {unknown} hash @returns {Route} */
  function parseHash(hash) {
    const raw = String(hash || "").replace(/^#/, ""), [path, query = ""] = raw.split("?"), q = /** @type {Record<string, string>} */ ({});
    for (const part of query.split("&").filter(Boolean)) { const [k, v = ""] = part.split("="); try { q[decodeURIComponent(k)] = decodeURIComponent(v); } catch { q[k] = v; } }
    if (!path) return { page: "lesson", id: LESSONS[0].id, n: LESSONS[0].n?.def ?? null, params: defaults(LESSONS[0]) };
    const pm = /^problem-(\d+)$/.exec(path);
    if (pm && PROBLEMS.some((p) => p.k === Number(pm[1]))) return { page: "problem", k: Number(pm[1]) };
    const cm = /^compare(?:\/([a-z-]+))?$/.exec(path);
    if (cm) return { page: "compare", id: COMPARISONS.some((c) => c.id === cm[1]) ? cm[1] : "ogf-egf" };
    if (path === "fourier" || path === "transform" || path === "fourier-lab") return { page: "fourier", N: [2, 3, 4, 8].includes(Number(q.N)) ? Number(q.N) : 4 };
    if (PAGES.includes(path)) return { page: /** @type {PlainRoute["page"]} */ (path) }; // compare and fourier matched above
    const l = LESSONS.find((x) => x.hash === path || x.id === path || (x.aliases || []).includes(path));
    if (!l) return { page: "lesson", id: LESSONS[0].id, n: LESSONS[0].n?.def ?? null, params: defaults(LESSONS[0]), unknown: path };
    const p = params(l, q);
    return { page: "lesson", id: l.id, n: l.n ? clampN(l, q.n ?? l.n.def, p) : null, params: p };
  }

  /* ---------- search / command palette index ---------- */
  /** @returns {SearchEntry[]} */
  function searchIndex() {
    const out = /** @type {SearchEntry[]} */ ([]);
    for (const l of LESSONS) out.push({ kind: "lesson", label: `Level ${l.level}: ${l.title}`, route: { page: "lesson", id: l.id }, text: [l.title, l.nav, l.hash, ...(l.aliases || []), ...l.techniques, l.gfType, l.problem, l.discreteModel, l.when].join(" ") });
    for (const t of TECHNIQUES) { const l = techniqueLesson(t); if (l) out.push({ kind: "technique", label: t, route: { page: "lesson", id: l.id }, text: `${t} ${l.title}` }); }
    for (const p of PROBLEMS) out.push({ kind: "problem", label: `Problem ${p.k}: ${p.title}`, route: { page: "problem", k: p.k }, text: `${p.title} ${p.technique} ${p.problem}` });
    for (const c of COMPARISONS) out.push({ kind: "compare", label: `Compare: ${c.title}`, route: { page: "compare", id: c.id }, text: `${c.title} ${c.note}` });
    for (const c of CONFUSIONS) out.push({ kind: "confusion", label: `Confusion: ${c.title}`, route: { page: "confusions" }, text: `${c.title} ${c.text}` });
    return out;
  }
  /* Rank entries by how well every query word matches; stable for ties. */
  /** @param {unknown} query @param {number} [limit] */
  function search(query, limit = 12) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean), idx = searchIndex();
    if (!words.length) return idx.slice(0, limit);
    return idx.map((e, i) => {
      const label = e.label.toLowerCase(), text = e.text.toLowerCase();
      let score = 0;
      for (const w of words) { if (label.includes(w)) score += 3; else if (text.includes(w)) score += 1; else return null; }
      return { e, score: score + (label.startsWith(words[0]) ? 1 : 0) + (e.kind === "lesson" ? 0.5 : 0), i };
    }).filter((x) => x !== null).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, limit).map((x) => x.e);
  }

  /* ---------- common confusions (section 35) ---------- */
  const CONFUSIONS = [
    { title: "A generating function is not the sequence", text: "The sequence is a₀, a₁, a₂, …; the generating function is the single object Σ aₙxⁿ that packages it.", lesson: "ogf" },
    { title: "Formal power series do not require convergence", text: "1/(1 − x) = Σ xⁿ holds coefficientwise; |x| < 1 matters only when you substitute numbers.", lesson: "geometric-series" },
    { title: "Product does not mean termwise multiplication", text: "[xⁿ]A·B is the convolution Σ aₖbₙ₋ₖ, a diagonal of the product grid, not aₙbₙ.", lesson: "convolution" },
    { title: "OGF and EGF encode the same coefficients differently", text: "aₙxⁿ versus aₙxⁿ/n!: same numbers, different multiplication law.", lesson: "egf" },
    { title: "Composition is not multiplication", text: "A(x)B(x) pairs two objects; A(B(x)) replaces every atom of an A-object by a B-object.", lesson: "composition" },
    { title: "The DFT is not unrelated signal-processing magic", text: "It is a finite generating polynomial evaluated at the roots of unity.", lesson: "finite-vectors" },
    { title: "Cyclic convolution is not ordinary convolution", text: "Indices wrap mod N; pad with zeros to recover the ordinary product.", lesson: "cyclic-convolution" },
    { title: "Equality of generating functions can encode a combinatorial identity", text: "Π(1 + xᵏ) = Π 1/(1 − x²ᵏ⁻¹) says distinct-part and odd-part partitions are equinumerous, coefficient by coefficient.", lesson: "euler-identity" },
  ];

  /* ---------- beamdswitch reports: the same states, in the same order, as frames ---------- */
  /* Lesson TeX inside the deck's $$…$$; inline $…$ in prose stays as written. */
  /** @param {string} t */
  const disp = (t) => `$$ ${t} $$`;
  /* A frame body: each formula on its own reveal step, then the text, then the state comment. */
  /** @param {State} s @param {Lesson} l @param {Params} p @param {number | null} n */
  function stateBody(s, l, p, n) {
    const parts = [];
    s.tex.forEach((t, i) => { if (i) parts.push(". . ."); parts.push(disp(t)); });
    if (s.text) parts.push(". . .", s.text);
    parts.push(stateComment(l, s.id, p, n));
    return parts.join("\n\n");
  }
  /** @param {Lesson} l @param {string} state @param {Params} p @param {number | null | undefined} n */
  function stateComment(l, state, p, n) {
    const lines = ["<!-- beam-md-switch", `lesson: ${l.hash}`, `state: ${state}`];
    if (n !== null && n !== undefined) lines.push(`n: ${n}`);
    for (const [k, v] of Object.entries(p || {})) lines.push(`${k}: ${v}`);
    lines.push("-->");
    return lines.join("\n");
  }
  /* Spoken numbers: digits are fine; rationals are read as "a over b". */
  /** @param {Exact} v */
  const say = (v) => val(v).replace(/−/g, "minus ").replace(/(\d+)\/(\d+)/g, "$1 over $2");
  /* The lesson's spoken one-liner, safe for narration. */
  /** @param {Lesson} l */
  const spokenKey = (l) => `${l.title}. ${l.when}`.replace(/[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻·∠°σ]/g, " ").replace(/\s+/g, " ");

  /** @param {Lesson} l @param {Params} p @param {number} n */
  function coefficientTable(l, p, n) {
    const N = Math.min(Math.max(n + 1, 8), 12), a = coefficients(l, p, N);
    return [`| n | ${range(a.length).join(" | ")} |`, `| --- | ${a.map(() => "---").join(" | ")} |`, `| ${isEgf(l, p) ? "aₙ (EGF counts)" : "aₙ"} | ${a.map(val).join(" | ")} |`].join("\n");
  }
  /* Frames for one lesson at (p, n), grouped by the template's four sections. */
  /** @param {Lesson} l @param {Params} p @param {number | null} n */
  function lessonFrames(l, p, n) {
    const states = l.states(p, n), setup = /** @type {Frame[]} */ ([]), method = /** @type {Frame[]} */ ([]), results = /** @type {Frame[]} */ ([]), checks = /** @type {Frame[]} */ ([]);
    setup.push({ title: `Problem: ${l.title}`, body: [l.problem, ". . .", `**Discrete model.** ${l.discreteModel}`, stateComment(l, "problem", p, n)].join("\n\n"), narration: l.sayProblem, _state: { lesson: l.id, state: "problem", n, params: p } });
    for (const s of states) (s.stage === "object" ? setup : method).push({ title: s.title, body: stateBody(s, l, p, n), narration: s.say, _state: { lesson: l.id, state: s.id, n, params: p } });
    if (!method.length) method.push(/** @type {Frame} */ (setup.pop())); // setup always holds the problem frame
    if (l.coeffs && n !== null) {
      const v = coefficient(l, p, n);
      results.push({ title: `Read the coefficient: n = ${n}`, body: [disp(`[x^{${n}}]\\,${l.gfName} = ${texVal(v)}`), ". . .", coefficientTable(l, p, n), ". . .", l.answer?.(n, v, p), stateComment(l, "read", p, n)].join("\n\n"), narration: `The coefficient for n equal to ${n} is ${say(v)}.`, _state: { lesson: l.id, state: "read", n, params: p } });
    } else results.push({ title: "The answer", body: [l.key, stateComment(l, "answer", p, n)].join("\n\n"), narration: spokenKey(l), _state: { lesson: l.id, state: "answer", n, params: p } });
    const v = n === null ? verifyAll() : verify(l, p, n);
    const passed = v.filter((c) => c.pass).length;
    checks.push({ title: `Verified: ${passed} of ${v.length} checks agree`, body: [v.length ? v.map((c) => `- ${c.pass ? "✓" : "✗"} ${c.name}: ${c.gf} vs ${c.other} (${c.method})`).join("\n") : "- This lesson's numbers are verified in the lessons it links."].join("\n\n") + "\n\n" + stateComment(l, "verify", p, n), narration: `${passed} of ${v.length} independent checks agree.`, _state: { lesson: l.id, state: "verify", n, params: p } });
    checks.push({ title: "When to use this", body: `- ${l.when}\n- Related: ${l.related.map((id) => lesson(id)?.title ?? (COMPARE_TITLES[id] || id)).join(", ")}`, key: l.key, narration: spokenKey(l), _state: { lesson: l.id, state: "takeaway", n, params: p } });
    return { setup, method, results, checks };
  }
  /** @type {Record<string, string>} */
  const COMPARE_TITLES = { "ogf-egf": "OGF vs EGF lab", "character-table": "character table (Fourier lab)" };
  /** @param {Exact} v */
  const texVal = (v) => (G.isQ(v) ? (v.d === 1n ? v.n.toString() : `\\frac{${v.n}}{${v.d}}`) : B(v).toString());
  /** @param {string} id @param {Record<string, unknown>} [given] @param {unknown} [nGiven] */
  function lessonReport(id, given = {}, nGiven) {
    const l = known(id), p = params(l, given), n = l.n ? clampN(l, nGiven ?? l.n.def, p) : null;
    return { meta: { title: `Generating Functions Lab: ${l.title}`, subtitle: `Level ${l.level}. ${l.key}`, voice: "bf_emma" }, narration: `Generating Functions Lab, level ${l.level}: ${l.title}. We follow one problem from the objects to the coefficient and check the answer.`, notes: "Every frame follows the lab's cycle: problem, discrete object, encode, manipulate, read the coefficient, verify.", ...lessonFrames(l, p, n) };
  }
  /** @param {number} k */
  function problemReport(k) {
    const pr = PROBLEMS.find((x) => x.k === k);
    if (!pr) throw new Error(`Unknown problem: ${k}`);
    const l = known(pr.lesson), p = params(l, pr.params || {}), want = problemAnswer(pr);
    return {
      meta: { title: `Generating Functions Lab, problem ${pr.k}: ${pr.title}`, subtitle: `${pr.technique}, difficulty ${pr.difficulty} of 5`, voice: "bf_emma" },
      narration: `Problem ${pr.k}. ${pr.title}. Try it before each hint appears.`,
      setup: [{ title: pr.title, body: `${pr.problem}\n\n. . .\n\n**Visual hint.** ${pr.visualHint}`, narration: pr.say, _state: { lesson: l.id, state: "problem", n: pr.ask.n, params: p } }],
      method: pr.hints.map((h, i) => ({ title: `Hint ${i + 1}`, body: `${h}\n\n${stateComment(l, `hint-${i + 1}`, p, pr.ask.n)}`, narration: `Hint ${i + 1}.`, _state: { lesson: l.id, state: l.states(p, pr.ask.n)[Math.min(i, l.states(p, pr.ask.n).length - 1)].id, n: pr.ask.n, params: p } })),
      results: [{ title: "Solution", body: disp(pr.solution), narration: `The answer for n equal to ${pr.ask.n} is ${pr.ask.approx ? "about " + G.fmtNum(G.bigRatio(B(/** @type {bigint} */ (want)), 1n), 3).replace(/×10/, " times ten to the power ").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, (c) => "0123456789-"["⁰¹²³⁴⁵⁶⁷⁸⁹⁻".indexOf(c)]) : say(want)}.`, _state: { lesson: l.id, state: "read", n: pr.ask.n, params: p } }],
      checks: [{ title: "Check", body: verify(l, p, l.n ? clampN(l, pr.ask.n, p) ?? 0 : 0).map((c) => `- ${c.pass ? "✓" : "✗"} ${c.name}: ${c.gf} vs ${c.other}`).join("\n") || "- Checked in the linked lesson.", key: `${pr.technique}: ${l.when}`, narration: spokenKey(l), _state: { lesson: l.id, state: "verify", n: pr.ask.n, params: p } }],
    };
  }
  /* The full core deck: one frame per lesson, its key formula revealed after its problem. */
  function fullReport() {
    /** @param {Lesson} l */
    const lessonFrame = (l) => { const p = defaults(l), n = l.n ? l.n.def : null, s = l.states(p, n), last = s[s.length - 1]; return { title: `${l.level}. ${l.title}`, body: [l.problem, ". . .", ...last.tex.map(disp), ". . .", l.key, stateComment(l, last.id, p, n)].join("\n\n"), narration: `${spokenKey(l)}`, _state: { lesson: l.id, state: last.id, n, params: p } }; };
    const all = verifyAll(), passed = all.filter((c) => c.pass).length;
    return {
      meta: { title: "Generating Functions Lab", subtitle: "Generating functions are changes of representation", voice: "bf_emma" },
      narration: "Generating functions as a calculus for discrete structures, from encoding a sequence to the discrete Fourier transform.",
      notes: "Ask why multiplication appeared in three apparently unrelated places: pairs of objects, sums of random variables, and polynomial multiplication. Then reveal that all three are convolution.",
      setup: [
        { title: "What is a generating function?", body: "$$ a_0, a_1, a_2, \\ldots \\longmapsto A(x) = \\sum_{n\\ge0} a_n x^n $$\n\n. . .\n\nA generating function is an encoding of coefficients.", narration: "A generating function packages a whole sequence into one object." },
        { title: "The cycle of the lab", body: "problem → discrete object → encode → manipulate → read coefficient → answer → verify\n\n. . .\n\nThe same states drive the lab, this deck and its export.", narration: "Every lesson runs the same cycle, from a problem to a verified coefficient." },
      ],
      method: LESSONS.filter((l) => l.id !== "unification").map(lessonFrame),
      results: [{ title: "Canonical answers", body: ["| Problem | Answer |", "| --- | --- |", "| Fibonacci F₁₀ | 55 |", "| Coin change, 12 cents with 1, 2, 5 | 13 |", "| Compositions of 7 with parts 1, 2, 3 | 44 |", "| Binary strings of length 6 avoiding 11 | 21 |", "| Catalan C₅ | 42 |", "| Exponents 0–11 divisible by 3 | 4 |", "| DFT of 1 + 2x + 3x² + 4x³ at 1, i, −1, −i | 10, −2 − 2i, −2, −2 + 2i |", "| Partitions p(10) | 42 |"].join("\n"), narration: "Each canonical answer is computed from its generating function and checked independently." }],
      checks: [
        { title: `Verified: ${passed} of ${all.length} checks agree`, body: "Every lesson's coefficient is compared with an independent enumeration or recurrence, exactly; asymptotic checks state their tolerance.", narration: `${passed} of ${all.length} independent checks agree.` },
        { title: "The unifying picture", body: "objects → coefficients → generating functions → algebra, combinatorics, analysis → roots of unity → DFT → simpler coordinates → answer", key: "Generating functions are changes of representation. At the roots of unity, convolution becomes multiplication.", narration: "Ask not which trick to use, but which representation makes the structure simple." },
      ],
    };
  }
  /* Every lesson's checks at its default state. */
  /** @returns {(Check & { lesson: string })[]} */
  function verifyAll() {
    const out = [];
    for (const l of LESSONS) if (l.n) for (const c of verify(l, defaults(l), l.n.def)) out.push({ lesson: l.id, ...c });
    return out;
  }

  /* The deck frames in presentation order, with the section dividers, for the in-page presentation. */
  /** @param {Report} report @returns {Slide[]} */
  function slides(report) {
    const out = /** @type {Slide[]} */ ([{ kind: "title", title: report.meta.title, subtitle: report.meta.subtitle }]);
    for (const [id, title] of /** @type {["setup" | "method" | "results" | "checks", string][]} */ ([["setup", "Set-up"], ["method", "Method"], ["results", "Results"], ["checks", "Checks and takeaway"]])) {
      out.push({ kind: "section", title });
      for (const f of report[id]) out.push({ kind: "frame", section: title, ...f });
    }
    return out;
  }

  /* ---------- self-test: every lesson's checks at several sizes, plus the canonical numbers ---------- */
  /** @returns {{ name: string, pass: boolean, detail: string }[]} */
  function selfTests() {
    const out = /** @type {{ name: string, pass: boolean, detail: string }[]} */ ([]);
    /** @param {string} name @param {unknown} pass @param {string} [detail] */
    const t = (name, pass, detail = "") => out.push({ name, pass: !!pass, detail });
    for (const l of LESSONS) {
      if (!l.n) continue;
      const sizes = [...new Set([l.n.min, l.n.def, Math.min(l.n.max, l.n.def + 3)])];
      for (const n of sizes) for (const c of verify(l, defaults(l), n)) t(`${l.hash} n=${n}: ${c.name}`, c.pass, `${c.gf} vs ${c.other}`);
      for (const [k, spec] of Object.entries(l.params || {})) for (const v of spec.values) { const p = { ...defaults(l), [k]: v }; for (const c of verify(l, p, l.n.def)) t(`${l.hash} ${k}=${v}: ${c.name}`, c.pass, `${c.gf} vs ${c.other}`); }
    }
    t("coin change 1, 2, 5 at n = 12 gives 13", G.coinChangeGF([1, 2, 5], 13)[12] === 13n && G.coinSolutions([1, 2, 5], 12).length === 13);
    t("x⁰…x¹¹ with exponent divisible by 3: 4", G.qeq(G.rootsFilterExact(range(12).map(() => 1n), 3, 0), Q(4)));
    const d4 = G.dftExact([1, 2, 3, 4], 4).map((z) => G.zExactString(z, 4));
    t("N = 4 DFT of 1 + 2x + 3x² + 4x³ is 10, −2 − 2i, −2, −2 + 2i", d4.join(";") === "10;−2 − 2i;−2;−2 + 2i", d4.join("; "));
    t("partitions: distinct = odd up to x⁶⁰", G.partitionsGF(61, { distinct: true }).every((x, i) => x === G.partitionsGF(61, { parts: "odd" })[i]));
    t("every problem's expected answer is defined", PROBLEMS.every((pr) => problemAnswer(pr) !== undefined));
    t("every lesson formula renders without TeX residue", LESSONS.every((l) => { try { const p = defaults(l), n = l.n ? l.n.def : null; return l.states(p, n).every((s) => s.tex.every((x) => !/\\/.test(G.texToHtml(x)))) && (!l.closed || !/\\/.test(G.texToHtml(l.closed(p)))); } catch (e) { return false; } }));
    return out;
  }

  return { STAGES, BRANCHES, LESSONS, PROBLEMS, COMPARISONS, CONFUSIONS, TECHNIQUES, BUILDS, lesson, defaults, params, clampN, isEgf, nMax, coefficients, coefficient, verify, verifyAll, problemAnswer, checkAnswer, techniqueLesson, hashFor, parseHash, search, searchIndex, lessonReport, problemReport, fullReport, slides, selfTests, fourierVec, cycA, cycB, filterPoly, denoms, partsOf, partList, harmonic };
});
