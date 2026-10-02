/* Snake Lemma + diagram chase: the pure mathematical core.
 *
 * No DOM, storage, clock, randomness or network: the page renders what this returns, and Node's test
 * runner loads the same file. Everything the page shows comes from one model:
 *
 *   diagram     objects, morphisms, exact rows and commuting squares (fixed geometry ids)
 *   hypotheses  the six assumptions Break mode can switch off
 *   graph       the proof-dependency graph: every step names what it needs; it powers hints,
 *               Break mode, the proof trace and the speaker notes
 *   sequences   the guided proof, the four exactness chases and the integer example, as states
 *   lab         a free chase whose legal moves are generated from the diagram and the known facts
 *   url         stable hash states (#proof/lift, #exact/ker-gamma?step=3, #lab?ops=...)
 *   deck        beamdswitch reports (Short, Standard, Full and "this chase") built from the states
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SnakeLemma = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- TeX → readable Unicode (the page shows Unicode; the deck keeps TeX) ---------- */
  const MACROS = {
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", in: "∈", notin: "∉", mapsto: "↦", to: "→", longrightarrow: "⟶",
    circ: "∘", ne: "≠", neq: "≠", subseteq: "⊆", equiv: "≡", Rightarrow: "⇒", implies: "⇒", iff: "⇔", exists: "∃",
    forall: "∀", times: "×", oplus: "⊕", cong: "≅", ker: "ker", ldots: "…", cdots: "⋯", cdot: "·", pm: "±",
    leftarrow: "←", downarrow: "↓", uparrow: "↑", hookrightarrow: "↪", twoheadrightarrow: "↠", bmod: "mod",
    le: "≤", ge: "≥", colon: ":", quad: "  ", qquad: "    ", Leftarrow: "⇐", setminus: "∖", mid: "∣",
  };
  const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", n: "ₙ", k: "ₖ" };
  const SUP = { 2: "²", n: "ⁿ" };
  function uni(tex) {
    let s = String(tex);
    s = s.replace(/\\\{/g, "\u0001").replace(/\\\}/g, "\u0002");
    s = s.replace(/\\(?:operatorname|mathrm|text|mathit)\{([^{}]*)\}/g, "$1");
    s = s.replace(/\\mathbb\{Z\}/g, "ℤ").replace(/\\mathbb\{([A-Z])\}/g, "$1");
    s = s.replace(/\\(?:left|right|big|Big)(?=[()[\]|.])/g, "");
    s = s.replace(/\\[,;:!]/g, (m) => (m === "\\!" ? "" : " "));
    s = s.replace(/\\([A-Za-z]+)/g, (m, name) => (name in MACROS ? MACROS[name] : name));
    s = s.replace(/_\{([^{}]*)\}/g, (m, t) => [...t].map((c) => SUB[c] ?? c).join(""));
    s = s.replace(/_([0-9nk])/g, (m, c) => SUB[c]);
    s = s.replace(/\^\{([^{}]*)\}/g, (m, t) => [...t].map((c) => SUP[c] ?? c).join(""));
    s = s.replace(/\^([2n])/g, (m, c) => SUP[c]);
    s = s.replace(/'/g, "′").replace(/[{}]/g, "").replace(/\u0001/g, "{").replace(/\u0002/g, "}");
    s = s.replace(/ - /g, " − ").replace(/(^|[\s(/])(coker|ker|im)(?=[α-ωA-Za-z])/g, "$1$2 ");
    return s.replace(/[ \t]+/g, " ").trim();
  }

  /* Plain spoken English for narration: no symbols, maths or markup survives. */
  const SPOKEN = [
    [/ker ?γ/g, "the kernel of gamma"], [/ker ?β/g, "the kernel of beta"], [/ker ?α/g, "the kernel of alpha"],
    [/coker ?α/g, "the cokernel of alpha"], [/coker ?β/g, "the cokernel of beta"], [/coker ?γ/g, "the cokernel of gamma"],
    [/ker p′/g, "the kernel of p prime"], [/ker p/g, "the kernel of p"], [/im i′/g, "the image of i prime"], [/im i/g, "the image of i"],
    [/im α/g, "the image of alpha"], [/im β/g, "the image of beta"], [/ℤ\/2ℤ|ℤ\/2/g, "the integers mod two"], [/ℤ²/g, "pairs of integers"], [/ℤ/g, "the integers"],
    [/α/g, "alpha"], [/β/g, "beta"], [/γ/g, "gamma"], [/δ/g, "delta"], [/′/g, " prime"], [/₁/g, " one"], [/₂/g, " two"], [/ₙ/g, " n"],
    [/∈/g, " in "], [/↦/g, " goes to "], [/→/g, " to "], [/=/g, " equals "], [/−/g, " minus "], [/\+/g, " plus "], [/∘/g, " after "],
  ];
  function speak(text) {
    let s = String(text);
    for (const [re, word] of SPOKEN) s = s.replace(re, word);
    s = s.replace(/\[([^\]]*)\]/g, "the class of $1").replace(/([A-Za-z])\(/g, "$1 of ").replace(/[()]/g, " ");
    return s.replace(/[^A-Za-z0-9 ,.;:'?!-]/g, " ").replace(/\s+/g, " ").replace(/\s+([,.;:?!])/g, "$1").trim();
  }

  /* ---------- the diagram: fixed ids, fixed places ---------- */
  const OBJECTS = [
    { id: "Ap", label: "A′", tex: "A'", row: 0, col: 1, letter: "a′", spoken: "A prime" },
    { id: "Bp", label: "B′", tex: "B'", row: 0, col: 2, letter: "b′", spoken: "B prime" },
    { id: "Cp", label: "C′", tex: "C'", row: 0, col: 3, letter: "c′", spoken: "C prime" },
    { id: "A", label: "A", tex: "A", row: 1, col: 1, letter: "a", spoken: "A" },
    { id: "B", label: "B", tex: "B", row: 1, col: 2, letter: "b", spoken: "B" },
    { id: "C", label: "C", tex: "C", row: 1, col: 3, letter: "c", spoken: "C" },
  ];
  const MORPHISMS = [
    { id: "ip", label: "i′", tex: "i'", from: "Ap", to: "Bp", dir: "h", spoken: "i prime" },
    { id: "pp", label: "p′", tex: "p'", from: "Bp", to: "Cp", dir: "h", spoken: "p prime" },
    { id: "i", label: "i", tex: "i", from: "A", to: "B", dir: "h", spoken: "i" },
    { id: "p", label: "p", tex: "p", from: "B", to: "C", dir: "h", spoken: "p" },
    { id: "alpha", label: "α", tex: "\\alpha", from: "Ap", to: "A", dir: "v", spoken: "alpha" },
    { id: "beta", label: "β", tex: "\\beta", from: "Bp", to: "B", dir: "v", spoken: "beta" },
    { id: "gamma", label: "γ", tex: "\\gamma", from: "Cp", to: "C", dir: "v", spoken: "gamma" },
  ];
  /* Each square says g2∘g1 = h2∘h1 (both paths from its top-left to its bottom-right corner). */
  const SQUARES = [
    { id: "left", label: "β∘i′ = i∘α", tex: "\\beta\\, i' = i\\,\\alpha", top: ["ip", "beta"], bottom: ["alpha", "i"], hyp: "left-square-commutes", objects: ["Ap", "Bp", "A", "B"] },
    { id: "right", label: "p∘β = γ∘p′", tex: "p\\,\\beta = \\gamma\\, p'", top: ["pp", "gamma"], bottom: ["beta", "p"], hyp: "right-square-commutes", objects: ["Bp", "Cp", "B", "C"] },
  ];
  const ROWS = [
    { id: "upper", objects: ["Ap", "Bp", "Cp"], maps: ["ip", "pp"], label: "0 → A′ → B′ → C′ → 0" },
    { id: "lower", objects: ["A", "B", "C"], maps: ["i", "p"], label: "0 → A → B → C → 0" },
  ];
  /* Kernels live in the top row, cokernels in the bottom row: the six terms of the snake. */
  const TERMS = [
    { id: "ker-alpha", label: "ker α", tex: "\\ker\\alpha", of: "alpha", object: "Ap", kind: "ker" },
    { id: "ker-beta", label: "ker β", tex: "\\ker\\beta", of: "beta", object: "Bp", kind: "ker" },
    { id: "ker-gamma", label: "ker γ", tex: "\\ker\\gamma", of: "gamma", object: "Cp", kind: "ker" },
    { id: "coker-alpha", label: "coker α", tex: "\\operatorname{coker}\\alpha", of: "alpha", object: "A", kind: "coker" },
    { id: "coker-beta", label: "coker β", tex: "\\operatorname{coker}\\beta", of: "beta", object: "B", kind: "coker" },
    { id: "coker-gamma", label: "coker γ", tex: "\\operatorname{coker}\\gamma", of: "gamma", object: "C", kind: "coker" },
  ];
  const SEQ_MAPS = [
    { from: "ker-alpha", to: "ker-beta", label: "i′", tex: "i'" },
    { from: "ker-beta", to: "ker-gamma", label: "p′", tex: "p'" },
    { from: "ker-gamma", to: "coker-alpha", label: "δ", tex: "\\delta", delta: true },
    { from: "coker-alpha", to: "coker-beta", label: "ī", tex: "\\bar\\imath" },
    { from: "coker-beta", to: "coker-gamma", label: "p̄", tex: "\\bar p" },
  ];
  /* The four junctions whose exactness needs a chase (the two ends need only i′ injective, p onto). */
  const JUNCTIONS = [
    { id: "ker-beta", term: "ker-beta", seq: "exact/ker-beta", label: "ker β", question: "im(ker α → ker β) = ker(ker β → ker γ) ?" },
    { id: "ker-gamma", term: "ker-gamma", seq: "exact/ker-gamma", label: "ker γ", question: "im(ker β → ker γ) = ker δ ?" },
    { id: "coker-alpha", term: "coker-alpha", seq: "exact/coker-alpha", label: "coker α", question: "im δ = ker(coker α → coker β) ?" },
    { id: "coker-beta", term: "coker-beta", seq: "exact/coker-beta", label: "coker β", question: "im(coker α → coker β) = ker(coker β → coker γ) ?" },
  ];
  const obj = (id) => OBJECTS.find((o) => o.id === id);
  const mor = (id) => MORPHISMS.find((m) => m.id === id);

  /* ---------- the hypotheses Break mode can switch off ---------- */
  const HYPOTHESES = [
    { id: "exact-at-B-prime", label: "upper row exact", statement: "ker p′ = im i′", tex: "\\ker p' = \\operatorname{im} i'",
      need: "the upper row to be exact at B′ (ker p′ = im i′)", flash: { morphisms: ["ip", "pp"], objects: ["Bp"] } },
    { id: "exact-at-B", label: "lower row exact", statement: "ker p = im i", tex: "\\ker p = \\operatorname{im} i",
      need: "the lower row to be exact at B (ker p = im i)", flash: { morphisms: ["i", "p"], objects: ["B"] } },
    { id: "left-square-commutes", label: "left square commutes", statement: "β∘i′ = i∘α", tex: "\\beta\\, i' = i\\,\\alpha",
      need: "the left square to commute (β∘i′ = i∘α)", flash: { squares: ["left"], morphisms: ["ip", "beta", "alpha", "i"] } },
    { id: "right-square-commutes", label: "right square commutes", statement: "p∘β = γ∘p′", tex: "p\\,\\beta = \\gamma\\, p'",
      need: "the right square to commute (p∘β = γ∘p′)", flash: { squares: ["right"], morphisms: ["pp", "gamma", "beta", "p"] } },
    { id: "i-injective", label: "i injective", statement: "0 → A → B", tex: "0 \\to A \\xrightarrow{i} B",
      need: "i : A → B to be injective", flash: { morphisms: ["i"], objects: ["A"] } },
    { id: "p-prime-surjective", label: "p′ surjective", statement: "B′ → C′ → 0", tex: "B' \\xrightarrow{p'} C' \\to 0",
      need: "p′ : B′ → C′ to be surjective", flash: { morphisms: ["pp"], objects: ["Cp"] } },
  ];
  const HYP_IDS = HYPOTHESES.map((h) => h.id);
  const hyp = (id) => HYPOTHESES.find((h) => h.id === id);

  /* ---------- the proof-dependency graph ----------
   * Every node names what it needs (hypotheses or earlier nodes). `doing` completes the sentence
   * "Cannot continue. <doing> you need: …"; `reason` is the trace's justification; `note` is the
   * pedagogical point the presenter makes there. */
  const GRAPH = {
    "gamma-c-prime-zero": { needs: [], text: "γ(c′) = 0", reason: "given: c′ ∈ ker γ", doing: "To start" },
    "lift-c-prime": { needs: ["p-prime-surjective"], text: "choose b′ with p′(b′) = c′", reason: "p′ surjective", doing: "To lift c′ to B′", choice: true },
    "compute-beta": { needs: ["lift-c-prime"], text: "compute β(b′)", reason: "apply β", doing: "To move b′ down" },
    "beta-in-kernel-p": { needs: ["right-square-commutes", "gamma-c-prime-zero", "compute-beta"], text: "p(β(b′)) = γ(p′(b′)) = γ(c′) = 0", reason: "commutativity + c′ ∈ ker γ", doing: "To know where β(b′) goes under p" },
    "solve-for-a": { needs: ["exact-at-B", "beta-in-kernel-p"], text: "solve i(a) = β(b′)", reason: "exactness: ker p = im i", doing: "To move β(b′) left to A" },
    "a-unique": { needs: ["i-injective", "solve-for-a"], text: "a is unique once b′ is fixed", reason: "i injective", doing: "To make a unique once b′ is fixed" },
    "quotient-a": { needs: ["a-unique"], text: "send a to [a] ∈ coker α", reason: "quotient by im α", doing: "To pass to coker α" },
    "define-delta": { needs: ["quotient-a"], text: "δ(c′) = [a]", reason: "record of the whole chase", doing: "To define δ" },
    "lifts-differ": { needs: ["exact-at-B-prime", "lift-c-prime"], text: "b′₁ − b′₂ = i′(a′)", reason: "exactness: ker p′ = im i′", doing: "To compare two lifts" },
    "images-differ": { needs: ["left-square-commutes", "lifts-differ"], text: "β(b′₁) − β(b′₂) = i(α(a′))", reason: "left square commutes", doing: "To push the difference down" },
    "a-differ": { needs: ["i-injective", "images-differ", "a-unique"], text: "a₁ − a₂ = α(a′)", reason: "i injective", doing: "To compare a₁ and a₂" },
    "delta-well-defined": { needs: ["a-differ", "define-delta"], text: "[a₁] = [a₂] in coker α", reason: "the difference lies in im α", doing: "To show δ is well defined" },
    "derived-sequence": { needs: ["delta-well-defined"], text: "ker α → ker β → ker γ → coker α → coker β → coker γ", reason: "δ joins the kernel and cokernel rows", doing: "To assemble the six-term sequence" },
    /* exactness at ker β */
    "kb-start": { needs: [], text: "b′ ∈ ker β with p′(b′) = 0", reason: "given", doing: "To start" },
    "kb-lift": { needs: ["exact-at-B-prime", "kb-start"], text: "b′ = i′(a′)", reason: "exactness: ker p′ = im i′", doing: "To write b′ as i′(a′)" },
    "kb-commute": { needs: ["left-square-commutes", "kb-lift"], text: "i(α(a′)) = β(i′(a′)) = β(b′) = 0", reason: "left square commutes", doing: "To push a′ down and across" },
    "kb-inject": { needs: ["i-injective", "kb-commute"], text: "α(a′) = 0", reason: "i injective", doing: "To cancel i" },
    "kb-done": { needs: ["kb-inject"], text: "a′ ∈ ker α maps to b′", reason: "kernel inference", doing: "To conclude" },
    /* exactness at ker γ */
    "kg-start": { needs: ["define-delta"], text: "δ(c′) = [a] = 0", reason: "given", doing: "To start" },
    "kg-image": { needs: ["kg-start"], text: "a = α(a′)", reason: "zero in coker α means a ∈ im α", doing: "To read δ(c′) = 0" },
    "kg-correct": { needs: ["left-square-commutes", "kg-image"], text: "β(b′ − i′(a′)) = i(a) − i(α(a′)) = 0", reason: "left square commutes", doing: "To correct the lift" },
    "kg-still": { needs: ["exact-at-B-prime", "kg-correct"], text: "p′(b′ − i′(a′)) = c′", reason: "p′∘i′ = 0 (upper row)", doing: "To keep the corrected lift over c′" },
    "kg-done": { needs: ["kg-still"], text: "c′ comes from ker β", reason: "kernel inference", doing: "To conclude" },
    /* exactness at coker α */
    "ca-start": { needs: [], text: "[a] ↦ 0 in coker β", reason: "given", doing: "To start" },
    "ca-lift": { needs: ["ca-start"], text: "choose b′ with β(b′) = i(a)", reason: "zero in coker β means i(a) ∈ im β", doing: "To lift i(a) through β", choice: true },
    "ca-commute": { needs: ["right-square-commutes", "exact-at-B", "ca-lift"], text: "γ(p′(b′)) = p(β(b′)) = p(i(a)) = 0", reason: "right square commutes; p∘i = 0", doing: "To show p′(b′) ∈ ker γ" },
    "ca-chase": { needs: ["ca-commute", "i-injective"], text: "δ(p′(b′)) = [a]", reason: "chase p′(b′) with lift b′", doing: "To chase p′(b′) back through δ" },
    /* exactness at coker β */
    "cb-start": { needs: [], text: "[b] ↦ 0 in coker γ: p(b) = γ(c′)", reason: "given", doing: "To start" },
    "cb-lift": { needs: ["p-prime-surjective", "cb-start"], text: "choose b′ with p′(b′) = c′", reason: "p′ surjective", doing: "To lift c′ to B′", choice: true },
    "cb-commute": { needs: ["right-square-commutes", "cb-lift"], text: "p(b − β(b′)) = γ(c′) − γ(p′(b′)) = 0", reason: "right square commutes", doing: "To compare b with β(b′)" },
    "cb-exact": { needs: ["exact-at-B", "cb-commute"], text: "b − β(b′) = i(a)", reason: "exactness: ker p = im i", doing: "To move b − β(b′) left to A" },
    "cb-done": { needs: ["cb-exact"], text: "[b] = [i(a)] in coker β", reason: "quotient by im β", doing: "To conclude" },
    /* the integer example */
    "z-squares": { needs: [], text: "both squares commute for α = 2, β(a,c) = (2a + c, 0), γ = 0", reason: "computed", doing: "To use the example" },
  };
  for (const h of HYPOTHESES) GRAPH[h.id] = { needs: [], text: h.statement, reason: "hypothesis", hyp: true, doing: "" };

  /* Every node the given nodes rest on, hypotheses included (order: first reached). */
  function closure(ids) {
    const seen = new Set(), out = [];
    const visit = (id) => {
      if (seen.has(id)) return;
      seen.add(id);
      const n = GRAPH[id];
      if (!n) throw new Error(`Unknown proof node: ${id}`);
      for (const d of n.needs) visit(d);
      out.push(id);
    };
    for (const id of ids) visit(id);
    return out;
  }
  const hypothesesOf = (ids) => closure(ids).filter((id) => GRAPH[id].hyp);
  /* The hypotheses a step pays for itself (not those inherited from earlier steps). */
  const directHypotheses = (ids) => [...new Set(ids.flatMap((id) => GRAPH[id].needs.filter((d) => GRAPH[d].hyp)))];

  /* ---------- states ----------
   * A state is one moment of one chase. tokens: where elements sit; trail: the arrows just used
   * (kind apply | lift | exact | quotient | commute | correct); facts: what is known; tex: the algebra;
   * uses: the graph nodes this state establishes. */
  const S = (o) => ({ tokens: [], trail: [], facts: [], tex: [], uses: [], focus: {}, regions: [], ...o });
  const PROOF = [
    S({ id: "proof/diagram", title: "The commutative diagram", move: "setting", focus: { rows: ["upper", "lower"], squares: ["left", "right"] },
      lead: "Two short exact rows joined by three vertical maps α, β, γ; both squares commute.",
      tex: ["0 \\to A' \\xrightarrow{i'} B' \\xrightarrow{p'} C' \\to 0", "0 \\to A \\xrightarrow{i} B \\xrightarrow{p} C \\to 0", "p\\,\\beta = \\gamma\\, p', \\qquad \\beta\\, i' = i\\,\\alpha"],
      deckTex: ["\\begin{array}{ccccccccc} 0 & \\to & A' & \\xrightarrow{i'} & B' & \\xrightarrow{p'} & C' & \\to & 0 \\\\ & & \\downarrow{\\scriptstyle \\alpha} & & \\downarrow{\\scriptstyle \\beta} & & \\downarrow{\\scriptstyle \\gamma} & & \\\\ 0 & \\to & A & \\xrightarrow{i} & B & \\xrightarrow{p} & C & \\to & 0 \\end{array}", "p\\,\\beta = \\gamma\\, p', \\qquad \\beta\\, i' = i\\,\\alpha"],
      why: "Exact rows: each map's image is the next map's kernel, i is injective and p′ is surjective. Commuting squares: going across then down equals going down then across.",
      say: "The diagram: two exact rows, three vertical maps, two commuting squares.",
      note: "Keep this picture fixed for the whole talk; every later step happens on these six objects.",
      narration: "We start from two short exact rows joined by three vertical maps, alpha, beta and gamma, with both squares commuting." }),
    S({ id: "proof/goal", title: "What must be constructed?", move: "question", focus: { objects: ["Cp", "A"] }, regions: ["ker-gamma", "coker-alpha"],
      lead: "Goal: a map from ker γ (top right) to coker α (bottom left), the two corners nothing connects yet.",
      tex: ["\\delta : \\ker\\gamma \\longrightarrow \\operatorname{coker}\\alpha \\;?"],
      why: "Kernels sit naturally on the top row and cokernels on the bottom row; the gap is between ker γ and coker α.",
      say: "Goal: construct a map from ker gamma to coker alpha.",
      note: "Do not write the formula for delta. Ask where an element of ker gamma could possibly go.",
      narration: "The question is how an element killed by gamma could produce an element of the cokernel of alpha." }),
    S({ id: "proof/start", title: "Start with c′ ∈ ker γ", move: "given", tokens: [{ at: "Cp", label: "c′", region: "ker-gamma" }], focus: { morphisms: ["gamma"], objects: ["Cp"] }, regions: ["ker-gamma"],
      uses: ["gamma-c-prime-zero"], facts: ["\\gamma(c') = 0", "c' \\in \\ker\\gamma"],
      lead: "Take c′ ∈ C′ with γ(c′) = 0: it lives in C′, and what we know about it is that γ kills it.",
      tex: ["c' \\in \\ker\\gamma", "\\gamma(c') = 0"],
      why: "Kernel inference: γ(c′) = 0 says exactly that c′ lies in ker γ.",
      say: "Start: c prime in C prime, with gamma of c prime equal to zero.",
      note: "The element lives in C prime; what we know about it is that gamma kills it. Keep those two apart.",
      narration: "Begin with an element c prime of C prime that gamma sends to zero." }),
    S({ id: "proof/lift", title: "Lift c′ to B′", move: "lift", choice: true, tokens: [{ at: "Bp", label: "b′", choice: true }, { at: "Cp", label: "c′", ghost: true, region: "ker-gamma" }],
      trail: [{ from: "Cp", to: "Bp", via: "pp", kind: "lift" }], focus: { morphisms: ["pp"] }, regions: ["ker-gamma"],
      uses: ["lift-c-prime"], facts: ["p'(b') = c'"],
      lead: "Because p′ is surjective, choose b′ ∈ B′ with p′(b′) = c′. This is a CHOICE.",
      tex: ["p'(b') = c'"],
      why: "Surjectivity of p′ guarantees some preimage; nothing picks a particular one, so this move is a choice, not a computation.",
      say: "Chosen lift b prime in B prime satisfying p prime of b prime equals c prime.",
      note: "The important point is that b prime is a choice. Do not call delta well defined yet.",
      narration: "Because p prime is surjective we may choose a lift b prime. It is a choice, and we will have to pay for it later." }),
    S({ id: "proof/down", title: "Move down by β", move: "apply", tokens: [{ at: "B", label: "β(b′)" }, { at: "Bp", label: "b′", ghost: true, choice: true }],
      trail: [{ from: "Bp", to: "B", via: "beta", kind: "apply" }], focus: { morphisms: ["beta"] },
      uses: ["compute-beta"], facts: ["\\beta(b') \\in B"],
      lead: "Apply β: b′ ↦ β(b′) ∈ B. Applying a map needs no hypothesis.",
      tex: ["b' \\mapsto \\beta(b')"],
      why: "Applying a map is always allowed: it is a computation, not a choice.",
      say: "Applied beta. The element beta of b prime lives in B.",
      note: "Contrast with the previous move: going along an arrow is free, going against one needs a reason.",
      narration: "Now apply beta. Going along an arrow is always allowed." }),
    S({ id: "proof/ask", title: "Where does β(b′) go under p?", move: "question", tokens: [{ at: "B", label: "β(b′)" }], focus: { morphisms: ["p"], objects: ["C"] },
      uses: ["compute-beta"],
      lead: "Where does β(b′) go under p? Computing p(β(b′)) directly tells us nothing yet.",
      tex: ["p(\\beta(b')) = \\;?"],
      why: "To move left from B we need β(b′) ∈ im i = ker p, so we must know p(β(b′)).",
      say: "Question: where does beta of b prime go under p?",
      note: "Let the audience see that going left needs information we do not have yet.",
      narration: "To go further left we need to know where beta of b prime goes under p." }),
    S({ id: "proof/commutativity", title: "Use commutativity", move: "commute", tokens: [{ at: "B", label: "β(b′)", region: "ker-p" }], regions: ["ker-p"],
      trail: [{ from: "B", to: "C", via: "p", kind: "commute" }, { from: "Bp", to: "Cp", via: "pp", kind: "commute" }, { from: "Cp", to: "C", via: "gamma", kind: "commute" }],
      focus: { squares: ["right"], morphisms: ["p", "pp", "gamma", "beta"] },
      uses: ["beta-in-kernel-p"], facts: ["p(\\beta(b')) = 0", "\\beta(b') \\in \\ker p"],
      lead: "The right square commutes, so p(β(b′)) = γ(p′(b′)) = γ(c′) = 0. Hence β(b′) ∈ ker p.",
      tex: ["p(\\beta(b')) = \\gamma(p'(b'))", "= \\gamma(c')", "= 0"],
      deckTex: ["p(\\beta(b')) = \\gamma(p'(b')) = \\gamma(c') = 0"],
      why: "pβ = γp′ rewrites the unknown path through B into the known path through C′, where c′ is killed by γ.",
      say: "By commutativity, p of beta of b prime equals gamma of c prime, which is zero. So beta of b prime is in the kernel of p.",
      note: "Animate the two paths of the right square at once: they are equal expressions, not a teleport.",
      narration: "The right square commutes, so p of beta of b prime equals gamma of c prime, which is zero. So beta of b prime lies in the kernel of p." }),
    S({ id: "proof/exactness", title: "Use exactness", move: "exact", tokens: [{ at: "A", label: "a" }, { at: "B", label: "β(b′)", ghost: true, region: "ker-p" }], regions: ["ker-p"],
      trail: [{ from: "B", to: "A", via: "i", kind: "exact" }], focus: { morphisms: ["i"] },
      uses: ["solve-for-a", "a-unique"], facts: ["i(a) = \\beta(b')", "a \\text{ unique for this } b'"],
      lead: "β(b′) ∈ ker p = im i, so there is a ∈ A with i(a) = β(b′): a preimage forced to exist by exactness. As i is injective, a is unique once b′ is fixed.",
      tex: ["\\beta(b') \\in \\ker p = \\operatorname{im} i", "i(a) = \\beta(b')"],
      why: "Exactness at B turns a kernel condition into an image condition; injectivity of i makes the preimage unique.",
      say: "By exactness, beta of b prime is i of a for a unique a in A.",
      note: "This backwards move is not a choice: exactness forces a to exist and injectivity makes it unique. But it still depends on b prime.",
      narration: "Exactness of the lower row says the kernel of p is the image of i, so there is an a with i of a equal to beta of b prime. Because i is injective, this a is unique once b prime is fixed." }),
    S({ id: "proof/quotient", title: "Pass to coker α", move: "quotient", tokens: [{ at: "cokerA", label: "[a]", quotient: true }, { at: "A", label: "a", ghost: true }],
      trail: [{ from: "A", to: "cokerA", kind: "quotient" }], regions: ["im-alpha", "coker-alpha"], focus: { objects: ["A"], morphisms: ["alpha"] },
      uses: ["quotient-a"], facts: ["[a] \\in A/\\operatorname{im}\\alpha = \\operatorname{coker}\\alpha"],
      lead: "a still depends on the chosen lift. Send a ↦ [a] ∈ A / im α = coker α: information is deliberately being forgotten here.",
      tex: ["a \\mapsto [a] \\in A/\\operatorname{im}\\alpha = \\operatorname{coker}\\alpha"],
      why: "Changing the lift changes a by an element of im α (shown next); the quotient forgets exactly that.",
      say: "Passed to the quotient: the class of a in coker alpha.",
      note: "We have only produced a candidate representative a. The quotient is where we deliberately forget the choice.",
      narration: "The element a still depends on our choice of lift, so we pass to the cokernel of alpha, deliberately forgetting part of the information." }),
    S({ id: "proof/delta", title: "The connecting morphism δ", move: "define", tokens: [{ at: "cokerA", label: "[a]", quotient: true }, { at: "Cp", label: "c′", ghost: true, region: "ker-gamma" }],
      snake: true, regions: ["ker-gamma", "coker-alpha"], focus: { objects: ["Cp", "Bp", "B", "A"] },
      uses: ["define-delta"], facts: ["\\delta(c') = [a]"],
      lead: "Define δ(c′) = [a]. The snake path C′ ← B′ ↓ B ← A is the compressed record of the whole chase.",
      tex: ["\\delta(c') = [a]", "\\delta : \\ker\\gamma \\longrightarrow \\operatorname{coker}\\alpha"],
      why: "Each move of the chase is one bend of the snake: lift, go down, move left by exactness, then forget.",
      say: "Defined delta of c prime as the class of a. The snake path is drawn.",
      note: "Only now draw the snake. It is the record of moves the audience has just made.",
      narration: "We define delta of c prime to be the class of a. The path we followed bends through the diagram like a snake." }),
    S({ id: "proof/another-lift", title: "Why the lift is not unique", move: "lift", choice: true, pair: true,
      tokens: [{ at: "Bp", label: "b′₁", choice: true }, { at: "Bp", label: "b′₂", choice: true, second: true }, { at: "Cp", label: "c′", ghost: true, region: "ker-gamma" }],
      trail: [{ from: "Cp", to: "Bp", via: "pp", kind: "lift" }], focus: { morphisms: ["pp", "ip"], objects: ["Bp"] }, regions: ["ker-gamma"],
      uses: ["lifts-differ"], facts: ["p'(b'_1) = p'(b'_2) = c'", "b'_1 - b'_2 = i'(a')"],
      lead: "Try another lift: p′(b′₁) = p′(b′₂) = c′, so p′(b′₁ − b′₂) = 0 and b′₁ − b′₂ ∈ ker p′ = im i′.",
      tex: ["p'(b'_1 - b'_2) = 0", "b'_1 - b'_2 \\in \\ker p' = \\operatorname{im} i'", "b'_1 - b'_2 = i'(a')"],
      why: "Two lifts of the same c′ differ by something p′ kills, and exactness of the upper row says that is i′ of something.",
      say: "Two lifts b prime one and b prime two of c prime. Their difference is i prime of a prime.",
      note: "Two honest people can make different choices; the question is how their answers differ.",
      narration: "Another person could choose a different lift. Two lifts differ by something p prime kills, which by exactness of the upper row is i prime of some a prime." }),
    S({ id: "proof/well-defined", title: "Why the answer is well-defined", move: "quotient", pair: true,
      tokens: [{ at: "A", label: "a₁" }, { at: "A", label: "a₂", second: true }, { at: "cokerA", label: "[a]", quotient: true }],
      trail: [{ from: "A", to: "cokerA", kind: "quotient" }], focus: { squares: ["left"], morphisms: ["alpha", "i", "beta", "ip"] }, regions: ["im-alpha", "coker-alpha"],
      uses: ["delta-well-defined"], facts: ["a_1 - a_2 = \\alpha(a')", "[a_1] = [a_2]"],
      lead: "β(b′₁) − β(b′₂) = β(i′(a′)) = i(α(a′)); as i is injective, a₁ − a₂ = α(a′), so [a₁] = [a₂] ∈ A / im α.",
      tex: ["\\beta(b'_1) - \\beta(b'_2) = \\beta(i'(a')) = i(\\alpha(a'))", "a_1 - a_2 = \\alpha(a')", "[a_1] = [a_2] \\in A/\\operatorname{im}\\alpha"],
      why: "Different lifts differ by exactly the information killed by the cokernel.",
      say: "a one minus a two equals alpha of a prime, so their classes in coker alpha coincide.",
      note: "This is the heart of the talk: the ambiguity lives in the image of alpha, and the cokernel kills exactly that.",
      narration: "Pushing the difference down the left square shows that a one and a two differ by alpha of a prime. In the cokernel of alpha they become the same point." }),
    S({ id: "proof/sequence", title: "The full snake sequence", move: "define", sequence: true, snake: true, regions: ["ker-gamma", "coker-alpha"],
      uses: ["derived-sequence"],
      lead: "ker α → ker β → ker γ —δ→ coker α → coker β → coker γ, exact at every term; each junction has its own chase.",
      tex: ["\\ker\\alpha \\to \\ker\\beta \\to \\ker\\gamma \\xrightarrow{\\delta} \\operatorname{coker}\\alpha \\to \\operatorname{coker}\\beta \\to \\operatorname{coker}\\gamma"],
      why: "The kernels inherit i′ and p′, the cokernels inherit i and p, and δ joins the two rows.",
      say: "The six-term exact sequence from ker alpha to coker gamma.",
      note: "Each arrow except delta is induced by the original rows; delta is the only new map, and we built it.",
      narration: "With delta in place the kernels and cokernels join into one six term sequence, and it is exact at every term." }),
  ];

  const EXACT = {
    "exact/ker-beta": { label: "ker β", title: "Exactness at ker β", claim: "\\operatorname{im}(\\ker\\alpha \\to \\ker\\beta) = \\ker(\\ker\\beta \\to \\ker\\gamma)", easy: "p'(i'(a')) = 0, so the composite is zero.", steps: [
      S({ id: "exact/ker-beta/start", title: "Start in ker β", move: "given", tokens: [{ at: "Bp", label: "b′", region: "ker-beta" }], focus: { morphisms: ["beta", "pp"] }, uses: ["kb-start"],
        facts: ["\\beta(b') = 0", "p'(b') = 0"], lead: "Let b′ ∈ ker β whose image in C′ vanishes: β(b′) = 0 and p′(b′) = 0.", tex: ["\\beta(b') = 0, \\quad p'(b') = 0"],
        say: "Start with b prime in ker beta with p prime of b prime equal to zero.", note: "Both facts are about the same element; keep them both on screen.", narration: "Take b prime in the kernel of beta whose image in C prime is zero." }),
      S({ id: "exact/ker-beta/lift", title: "Exactness of the upper row", move: "exact", tokens: [{ at: "Ap", label: "a′" }, { at: "Bp", label: "b′", ghost: true }], trail: [{ from: "Bp", to: "Ap", via: "ip", kind: "exact" }], focus: { morphisms: ["ip", "pp"] }, uses: ["kb-lift"],
        facts: ["b' = i'(a')"], lead: "p′(b′) = 0, so by exactness of the upper row b′ = i′(a′) for some a′ ∈ A′.", tex: ["b' \\in \\ker p' = \\operatorname{im} i'", "b' = i'(a')"],
        say: "By exactness, b prime equals i prime of a prime.", note: "A backwards move justified by exactness, not by surjectivity.", narration: "Since p prime kills b prime, exactness of the upper row writes b prime as i prime of some a prime." }),
      S({ id: "exact/ker-beta/commute", title: "Push a′ down", move: "commute", tokens: [{ at: "A", label: "α(a′)" }], trail: [{ from: "Ap", to: "A", via: "alpha", kind: "apply" }, { from: "A", to: "B", via: "i", kind: "commute" }], focus: { squares: ["left"] }, uses: ["kb-commute"],
        facts: ["i(\\alpha(a')) = 0"], lead: "The left square commutes: i(α(a′)) = β(i′(a′)) = β(b′) = 0.", tex: ["i(\\alpha(a')) = \\beta(i'(a')) = \\beta(b') = 0"],
        say: "By the left square, i of alpha of a prime equals beta of b prime, which is zero.", note: "The same commutativity move as in the construction, on the other square.", narration: "The left square commutes, so i of alpha of a prime equals beta of b prime, which is zero." }),
      S({ id: "exact/ker-beta/inject", title: "Cancel i", move: "kernel", tokens: [{ at: "Ap", label: "a′", region: "ker-alpha" }], focus: { morphisms: ["i", "alpha"] }, regions: ["ker-alpha"], uses: ["kb-inject", "kb-done"],
        facts: ["\\alpha(a') = 0", "a' \\in \\ker\\alpha"], lead: "i is injective, so α(a′) = 0: a′ ∈ ker α and i′(a′) = b′. So b′ comes from ker α.", tex: ["\\alpha(a') = 0", "a' \\in \\ker\\alpha, \\quad i'(a') = b'"],
        say: "Since i is injective, alpha of a prime is zero, so a prime is in ker alpha.", note: "Injectivity of i is what turns a statement in B into one in A.", narration: "Because i is injective, alpha of a prime is zero, so a prime lies in the kernel of alpha and maps to b prime." }),
    ] },
    "exact/ker-gamma": { label: "ker γ", title: "Exactness at ker γ", claim: "\\operatorname{im}(\\ker\\beta \\to \\ker\\gamma) = \\ker\\delta", easy: "For b′ ∈ ker β, use b′ itself as the lift of p′(b′): β(b′) = 0 = i(0), so δ(p′(b′)) = [0].", steps: [
      S({ id: "exact/ker-gamma/start", title: "Start with δ(c′) = 0", move: "given", tokens: [{ at: "Cp", label: "c′", region: "ker-gamma" }, { at: "Bp", label: "b′", ghost: true, choice: true }, { at: "A", label: "a", ghost: true }], regions: ["ker-gamma"], snake: true, uses: ["kg-start"],
        facts: ["\\delta(c') = [a] = 0", "p'(b') = c', \\; i(a) = \\beta(b')"], lead: "Take c′ ∈ ker γ with δ(c′) = 0. Construct δ(c′) = [a] with a lift b′ and i(a) = β(b′).", tex: ["\\delta(c') = [a] = 0"],
        say: "Start with c prime in ker gamma with delta of c prime equal to zero.", note: "Recall the construction: a lift b prime and an a with i of a equal to beta of b prime.", narration: "Take c prime in the kernel of gamma that delta sends to zero, with the lift b prime and the element a from the construction." }),
      S({ id: "exact/ker-gamma/image", title: "Zero in coker α", move: "quotient", tokens: [{ at: "A", label: "a", region: "im-alpha" }, { at: "Ap", label: "a′" }], trail: [{ from: "A", to: "Ap", via: "alpha", kind: "exact" }], regions: ["im-alpha"], uses: ["kg-image"],
        facts: ["a = \\alpha(a')"], lead: "[a] = 0 in coker α means a ∈ im α, so a = α(a′) for some a′ ∈ A′.", tex: ["[a] = 0 \\iff a \\in \\operatorname{im}\\alpha", "a = \\alpha(a')"],
        say: "The class of a is zero, so a equals alpha of a prime.", note: "Interpret zero in a cokernel correctly: it means lying in the image.", narration: "The class of a is zero exactly when a is in the image of alpha, so a equals alpha of some a prime." }),
      S({ id: "exact/ker-gamma/correct", title: "Correct the lift", move: "correct", choice: true, tokens: [{ at: "Bp", label: "b′ − i′(a′)", region: "ker-beta", choice: true }, { at: "Bp", label: "b′", ghost: true, choice: true }], trail: [{ from: "Ap", to: "Bp", via: "ip", kind: "correct" }], focus: { squares: ["left"] }, regions: ["ker-beta"], uses: ["kg-correct"],
        facts: ["\\beta(b' - i'(a')) = 0"], lead: "Use a′ to modify the chosen lift: b′ ↦ b′ − i′(a′). Then β(b′ − i′(a′)) = β(b′) − i(α(a′)) = i(a) − i(a) = 0.",
        tex: ["b' \\mapsto b' - i'(a')", "\\beta(b' - i'(a')) = \\beta(b') - i(\\alpha(a')) = i(a) - i(a) = 0"],
        say: "Corrected the lift to b prime minus i prime of a prime; beta sends it to zero.", note: "The key idea is correcting a lift: subtract exactly the ambiguity.", narration: "Now correct the lift by subtracting i prime of a prime. By the left square, beta sends the corrected lift to zero." }),
      S({ id: "exact/ker-gamma/still", title: "Still a lift of c′", move: "kernel", tokens: [{ at: "Bp", label: "b′ − i′(a′)", region: "ker-beta" }, { at: "Cp", label: "c′", region: "ker-gamma" }], trail: [{ from: "Bp", to: "Cp", via: "pp", kind: "apply" }], regions: ["ker-beta", "ker-gamma"], uses: ["kg-still", "kg-done"],
        facts: ["p'(b' - i'(a')) = c'", "c' \\in \\operatorname{im}(\\ker\\beta \\to \\ker\\gamma)"], lead: "Its image in C′ is still c′, because p′∘i′ = 0. So c′ comes from ker β.", tex: ["p'(b' - i'(a')) = c' - p'(i'(a')) = c'"],
        say: "The corrected lift still maps to c prime, so c prime comes from ker beta.", note: "The correction is invisible downstairs in C prime, which is why it is allowed.", narration: "The correction is invisible in C prime, since p prime after i prime is zero, so c prime comes from the kernel of beta." }),
    ] },
    "exact/coker-alpha": { label: "coker α", title: "Exactness at coker α", claim: "\\operatorname{im}\\delta = \\ker(\\operatorname{coker}\\alpha \\to \\operatorname{coker}\\beta)", easy: "If δ(c′) = [a] then i(a) = β(b′) ∈ im β, so [a] ↦ 0 in coker β.", steps: [
      S({ id: "exact/coker-alpha/start", title: "[a] dies in coker β", move: "given", tokens: [{ at: "cokerA", label: "[a]", quotient: true }, { at: "B", label: "i(a)", region: "im-beta" }], trail: [{ from: "A", to: "B", via: "i", kind: "apply" }], regions: ["im-beta"], uses: ["ca-start"],
        facts: ["[i(a)] = 0 \\in \\operatorname{coker}\\beta", "i(a) \\in \\operatorname{im}\\beta"], lead: "Start with [a] ∈ coker α whose image in coker β is zero. Zero in coker β means i(a) ∈ im β.", tex: ["[i(a)] = 0 \\iff i(a) \\in \\operatorname{im}\\beta"],
        say: "Start with the class of a whose image in coker beta is zero: i of a is in the image of beta.", note: "Again: zero in a cokernel means lying in an image.", narration: "Start with a class of a whose image in the cokernel of beta is zero, which means i of a lies in the image of beta." }),
      S({ id: "exact/coker-alpha/lift", title: "Lift through β", move: "lift", choice: true, tokens: [{ at: "Bp", label: "b′", choice: true }], trail: [{ from: "B", to: "Bp", via: "beta", kind: "lift" }], uses: ["ca-lift"],
        facts: ["\\beta(b') = i(a)"], lead: "Choose b′ ∈ B′ with β(b′) = i(a). This is a CHOICE.", tex: ["\\beta(b') = i(a)"],
        say: "Chosen b prime with beta of b prime equal to i of a.", note: "The reverse construction also starts with a choice.", narration: "Choose b prime with beta of b prime equal to i of a." }),
      S({ id: "exact/coker-alpha/commute", title: "p′(b′) lies in ker γ", move: "commute", tokens: [{ at: "Cp", label: "p′(b′)", region: "ker-gamma" }], trail: [{ from: "Bp", to: "Cp", via: "pp", kind: "apply" }, { from: "Cp", to: "C", via: "gamma", kind: "commute" }], focus: { squares: ["right"] }, regions: ["ker-gamma"], uses: ["ca-commute"],
        facts: ["\\gamma(p'(b')) = 0", "p'(b') \\in \\ker\\gamma"], lead: "γ(p′(b′)) = p(β(b′)) = p(i(a)) = 0, so p′(b′) ∈ ker γ.", tex: ["\\gamma(p'(b')) = p(\\beta(b')) = p(i(a)) = 0"],
        say: "By the right square, gamma of p prime of b prime is zero.", note: "Commutativity read right to left this time.", narration: "The right square and the lower row show that gamma kills p prime of b prime." }),
      S({ id: "exact/coker-alpha/chase", title: "Chase it back through δ", move: "define", tokens: [{ at: "cokerA", label: "[a]", quotient: true }], snake: true, regions: ["ker-gamma", "coker-alpha"], uses: ["ca-chase"],
        facts: ["\\delta(p'(b')) = [a]"], lead: "Chasing p′(b′) through δ with lift b′ gives i(a) = β(b′), hence δ(p′(b′)) = [a]. So [a] ∈ im δ.", tex: ["\\delta(p'(b')) = [a]"],
        say: "Delta of p prime of b prime is the class of a, so the class of a is in the image of delta.", note: "The reverse construction is the forward chase read backwards.", narration: "Running the construction of delta on p prime of b prime, with b prime as the lift, returns the class of a." }),
    ] },
    "exact/coker-beta": { label: "coker β", title: "Exactness at coker β", claim: "\\operatorname{im}(\\operatorname{coker}\\alpha \\to \\operatorname{coker}\\beta) = \\ker(\\operatorname{coker}\\beta \\to \\operatorname{coker}\\gamma)", easy: "p(i(a)) = 0, so the composite is zero.", steps: [
      S({ id: "exact/coker-beta/start", title: "[b] dies in coker γ", move: "given", tokens: [{ at: "B", label: "b" }, { at: "C", label: "p(b)", region: "im-gamma" }], trail: [{ from: "B", to: "C", via: "p", kind: "apply" }], regions: ["im-gamma"], uses: ["cb-start"],
        facts: ["p(b) = \\gamma(c')"], lead: "Start with [b] ∈ coker β whose image in coker γ is zero: p(b) = γ(c′) for some c′ ∈ C′.", tex: ["[p(b)] = 0 \\iff p(b) = \\gamma(c')"],
        say: "Start with the class of b with p of b equal to gamma of c prime.", note: "Same grammar: zero in a cokernel is membership of an image.", narration: "Start with a class of b that dies in the cokernel of gamma, so p of b equals gamma of some c prime." }),
      S({ id: "exact/coker-beta/lift", title: "Lift c′ to B′", move: "lift", choice: true, tokens: [{ at: "Bp", label: "b′", choice: true }, { at: "Cp", label: "c′", ghost: true }], trail: [{ from: "Cp", to: "Bp", via: "pp", kind: "lift" }], uses: ["cb-lift"],
        facts: ["p'(b') = c'"], lead: "p′ is surjective: choose b′ with p′(b′) = c′. This is a CHOICE.", tex: ["p'(b') = c'"],
        say: "Chosen lift b prime of c prime.", note: "The same lift as in the construction of delta.", narration: "Because p prime is surjective, choose a lift b prime of c prime." }),
      S({ id: "exact/coker-beta/commute", title: "Compare b with β(b′)", move: "commute", tokens: [{ at: "B", label: "b − β(b′)", region: "ker-p" }], trail: [{ from: "Bp", to: "B", via: "beta", kind: "apply" }], focus: { squares: ["right"] }, regions: ["ker-p"], uses: ["cb-commute"],
        facts: ["p(b - \\beta(b')) = 0"], lead: "p(b − β(b′)) = γ(c′) − γ(p′(b′)) = 0, by the right square.", tex: ["p(b - \\beta(b')) = \\gamma(c') - \\gamma(p'(b')) = 0"],
        say: "p of b minus beta of b prime is zero.", note: "Subtracting beta of b prime removes what p sees.", narration: "By the right square, p kills b minus beta of b prime." }),
      S({ id: "exact/coker-beta/exact", title: "Move left by exactness", move: "exact", tokens: [{ at: "A", label: "a" }, { at: "cokerB", label: "[b]", quotient: true }], trail: [{ from: "B", to: "A", via: "i", kind: "exact" }], uses: ["cb-exact", "cb-done"],
        facts: ["b - \\beta(b') = i(a)", "[b] = [i(a)]"], lead: "b − β(b′) ∈ ker p = im i, so b − β(b′) = i(a); in coker β, [b] = [i(a)], the image of [a] ∈ coker α.", tex: ["b - \\beta(b') = i(a)", "[b] = [i(a)] \\in \\operatorname{coker}\\beta"],
        say: "b minus beta of b prime is i of a, so the class of b is the image of the class of a.", note: "Quotienting by the image of beta erases the correction.", narration: "Exactness of the lower row writes the difference as i of a, so in the cokernel of beta the class of b is the image of the class of a." }),
    ] },
  };
  const EXACT_IDS = Object.keys(EXACT);

  /* ---------- the integer example ----------
   * Both rows: 0 → ℤ → ℤ² → ℤ → 0 with i(a) = (a, 0), p(a, c) = c. α = 2, γ = 0, β(a, c) = (2a + c, 0). */
  const Z = {
    i: (a) => [a, 0], p: ([, c]) => c, alpha: (a) => 2 * a, gamma: () => 0, beta: ([a, c]) => [2 * a + c, 0],
    mod2: (n) => ((n % 2) + 2) % 2,
    delta: (n) => Z.mod2(n),
    /* The chase with lift parameter k: c′ ↦ (k, c′) ↦ (2k + c′, 0) ↦ a = 2k + c′ ↦ [a]. */
    chase(c, k) {
      const lift = [k, c], image = Z.beta(lift), a = image[0];
      if (Z.p(lift) !== c) throw new Error("not a lift");
      if (Z.p(image) !== 0) throw new Error("β(b′) is not in ker p");
      if (Z.i(a)[0] !== image[0] || Z.i(a)[1] !== image[1]) throw new Error("i(a) ≠ β(b′)");
      return { c, k, lift, image, a, coset: Z.mod2(a) };
    },
    K: [-5, 5], C: [-3, 3],
  };
  const fmtInt = (n) => (n < 0 ? `−${-n}` : String(n));
  const fmtPair = ([a, b]) => `(${fmtInt(a)}, ${fmtInt(b)})`;
  const clampInt = (v, [lo, hi], dflt) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
  const LIFT_ORDER = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];

  function exampleState(c, k) {
    const r = Z.chase(c, k), cl = `[${r.coset}]`;
    return S({ id: "example/integer", title: "Concrete ℤ example", move: "define", snake: true, example: true,
      tokens: [{ at: "cokerA", label: cl, quotient: true }, { at: "A", label: fmtInt(r.a), ghost: true }, { at: "B", label: fmtPair(r.image), ghost: true }, { at: "Bp", label: fmtPair(r.lift), ghost: true, choice: true }, { at: "Cp", label: fmtInt(c), ghost: true, region: "ker-gamma" }],
      regions: ["ker-gamma", "coker-alpha"], uses: ["z-squares"],
      facts: [`c' = ${c}`, `b' = (${k}, ${c})`, `\\beta(b') = (${2 * k + c}, 0)`, `a = ${2 * k + c}`, `\\delta(${c}) = [${r.coset}] \\in \\mathbb{Z}/2\\mathbb{Z}`],
      lead: `c′ = ${fmtInt(c)}; lift b′ = ${fmtPair(r.lift)}; β(b′) = ${fmtPair(r.image)}; a = ${fmtInt(r.a)}; δ(${fmtInt(c)}) = ${cl} ∈ ℤ/2ℤ.`,
      tex: [`b' = (${k}, ${c}) \\mapsto \\beta(b') = (${2 * k + c}, 0) = i(${2 * k + c})`, `\\delta(${c}) = [${2 * k + c}] = [${r.coset}] \\in \\mathbb{Z}/2\\mathbb{Z}`],
      why: "With α = 2, coker α = ℤ/2ℤ; every lift (k, c′) gives the endpoint 2k + c′, which always has the parity of c′.",
      say: `Lift ${k}. Endpoint ${2 * k + c}. Class ${r.coset} in Z mod 2.`,
      note: "Only the lift and the endpoint change as k moves; the class never does.",
      narration: `With lift parameter ${speakInt(k)} the endpoint is ${speakInt(2 * k + c)}, and its class mod two is ${speakInt(r.coset)}.` });
  }
  function speakInt(n) {
    const W = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen"];
    return n < 0 ? `minus ${W[-n] ?? -n}` : W[n] ?? String(n);
  }

  /* The ℤ example's six terms, worked out (and checked in the tests on a range of integers). */
  const Z_SEQUENCE = [
    { term: "ker-alpha", value: "0", why: "2a = 0 only for a = 0" },
    { term: "ker-beta", value: "ℤ·(1, −2)", why: "2a + c = 0" },
    { term: "ker-gamma", value: "ℤ", why: "γ = 0" },
    { term: "coker-alpha", value: "ℤ/2ℤ", why: "A / 2ℤ" },
    { term: "coker-beta", value: "ℤ (via c)", why: "im β = ℤ × 0" },
    { term: "coker-gamma", value: "ℤ", why: "im γ = 0" },
  ];

  /* ---------- sequences and state lookup ---------- */
  const SEQUENCES = { proof: PROOF, ...Object.fromEntries(EXACT_IDS.map((id) => [id, EXACT[id].steps])) };
  const ALL_STATES = [...PROOF, ...EXACT_IDS.flatMap((id) => EXACT[id].steps)];
  const stateById = (id) => ALL_STATES.find((s) => s.id === id);
  const sequenceOf = (id) => (id.startsWith("proof/") ? "proof" : EXACT_IDS.find((s) => id === s || id.startsWith(s + "/")) || null);

  /* Break mode: the first state in a sequence whose proof rests on a switched-off hypothesis. */
  function blockedAt(steps, off) {
    const broken = new Set(off || []);
    if (!broken.size) return null;
    for (let i = 0; i < steps.length; i++) {
      const uses = steps[i].uses;
      if (!uses.length) continue;
      const missing = hypothesesOf(uses).filter((h) => broken.has(h));
      if (!missing.length) continue;
      // Name the step that pays for the missing hypothesis directly when this state has one.
      const node = closure(uses).find((id) => GRAPH[id].needs.some((d) => missing.includes(d))) || uses[0];
      const h = GRAPH[node].needs.find((d) => missing.includes(d)) || missing[0];
      return { index: i, state: steps[i].id, node, hypothesis: h,
        message: `Cannot continue. ${GRAPH[node].doing} you need: ${hyp(h).need}.` };
    }
    return null;
  }

  /* The proof as a program: the trace up to (and including) a state. */
  function trace(steps, uptoIndex) {
    const out = [];
    steps.slice(0, uptoIndex + 1).forEach((s) => {
      for (const id of s.uses) {
        if (out.some((t) => t.node === id)) continue;
        const n = GRAPH[id];
        out.push({ node: id, state: s.id, text: n.text, reason: n.reason, hypotheses: directHypotheses([id]).map((h) => hyp(h).label), choice: !!n.choice });
      }
    });
    return out;
  }

  /* ---------- the Chase Lab ----------
   * Expressions: { v: name } a named element, { f: morphismId, x } an application, { z: true } zero,
   * { q: objectId, x } a class in the cokernel at that object. Facts: equalities and memberships, each
   * with its justification and the hypotheses it used. Legal moves are generated from these. */
  const V = (v) => ({ v }), F = (f, x) => ({ f, x }), ZERO = { z: true };
  const COKER_AT = { A: "alpha", B: "beta", C: "gamma" };
  function show(e) {
    if (e.z) return "0";
    if (e.v) return e.v;
    if (e.q) return `[${show(e.x)}]`;
    return `${mor(e.f).label}(${show(e.x)})`;
  }
  function texOf(e) {
    if (e.z) return "0";
    if (e.v) return e.v.replace(/′/g, "'").replace(/([₀-₉])/g, (c) => `_${"₀₁₂₃₄₅₆₇₈₉".indexOf(c)}`);
    if (e.q) return `[${texOf(e.x)}]`;
    return `${mor(e.f).tex}(${texOf(e.x)})`;
  }
  const same = (a, b) => show(a) === show(b);
  const setTex = (set) => set.replace(/^ker /, "\\ker ").replace(/^im /, "\\operatorname{im} ").replace(/α/g, "\\alpha").replace(/β/g, "\\beta").replace(/γ/g, "\\gamma").replace(/′/g, "'");
  const factText = (f) => (f.t === "eq" ? `${show(f.l)} = ${show(f.r)}` : `${show(f.x)} ∈ ${f.set}`);
  const factTex = (f) => (f.t === "eq" ? `${texOf(f.l)} = ${texOf(f.r)}` : `${texOf(f.x)} \\in ${setTex(f.set)}`);
  const factKey = (f) => (f.t === "eq" ? `eq:${show(f.l)}=${show(f.r)}` : `in:${show(f.x)}:${f.set}`);

  const LAB_STARTS = {
    c: { label: "c′ ∈ ker γ", text: "An element of C′ killed by γ (the construction of δ)", obj: "Cp", name: "c′",
      facts: [{ t: "eq", l: F("gamma", V("c′")), r: ZERO, why: "given" }, { t: "in", x: V("c′"), set: "ker γ", why: "given" }], goal: "Reach coker α." },
    b: { label: "b′ ∈ ker β, p′(b′) = 0", text: "Exactness at ker β: find where b′ comes from", obj: "Bp", name: "b′",
      facts: [{ t: "eq", l: F("beta", V("b′")), r: ZERO, why: "given" }, { t: "eq", l: F("pp", V("b′")), r: ZERO, why: "given" }, { t: "in", x: V("b′"), set: "ker β", why: "given" }], goal: "Reach ker α." },
    a: { label: "a ∈ A, i(a) ∈ im β", text: "Exactness at coker α: [a] dies in coker β", obj: "A", name: "a",
      facts: [{ t: "in", x: F("i", V("a")), set: "im β", why: "given: [a] ↦ 0 in coker β" }], goal: "Find an element of ker γ." },
  };
  const LAB_START_IDS = Object.keys(LAB_STARTS);
  const EXACTNESS = [ // ker g = im f at an object, and the hypothesis that says so
    { at: "Bp", g: "pp", f: "ip", hyp: "exact-at-B-prime" },
    { at: "B", g: "p", f: "i", hyp: "exact-at-B" },
  ];
  const SURJECTIVE = { pp: "p-prime-surjective" };
  const INJECTIVE = { i: "i-injective" };
  const COMPOSITE_ZERO = [{ outer: "p", inner: "i", hyp: "exact-at-B" }, { outer: "pp", inner: "ip", hyp: "exact-at-B-prime" }];

  function labStart(start) {
    const s = LAB_STARTS[start] || LAB_STARTS.c;
    const facts = s.facts.map((f, n) => ({ ...f, id: `f${n + 1}`, from: [], uses: [], op: 0 }));
    return { start: LAB_STARTS[start] ? start : "c", token: { obj: s.obj, x: V(s.name) }, facts, names: [s.name], history: [], ops: [], choices: [], quotient: null };
  }
  const known = (lab, f) => lab.facts.find((g) => factKey(g) === factKey(f));
  const freshName = (lab, objId) => {
    const base = obj(objId).letter;
    if (!lab.names.includes(base)) return base;
    for (let n = 2; ; n++) { const nm = `${base}${"₀₁₂₃₄₅₆₇₈₉"[n] ?? n}`; if (!lab.names.includes(nm)) return nm; }
  };
  /* Rewrite e step by step, with reasons: square rewrites first (only the requested one), then known
   * equalities, composites that vanish, and maps of zero. */
  function simplify(lab, e, off) {
    const chain = [], usesH = new Set(), from = new Set();
    const eqs = lab.facts.filter((f) => f.t === "eq");
    const step = (x) => {
      if (x.z || x.v) return null;
      if (x.q) { const r = step(x.x); return r && { e: { q: x.q, x: r.e }, why: r.why, fact: r.fact, hyp: r.hyp }; }
      const inner = step(x.x);
      if (inner) return { e: F(x.f, inner.e), why: inner.why, fact: inner.fact, hyp: inner.hyp };
      const eq = eqs.find((f) => same(f.l, x) && !same(f.r, x));
      if (eq) return { e: eq.r, why: eq.why === "given" ? `given: ${factText(eq)}` : factText(eq), fact: eq.id };
      if (x.x.z) return { e: ZERO, why: `${mor(x.f).label}(0) = 0` };
      const cz = COMPOSITE_ZERO.find((c) => c.outer === x.f && x.x.f === c.inner);
      if (cz && !off.has(cz.hyp)) return { e: ZERO, why: `${mor(cz.outer).label}∘${mor(cz.inner).label} = 0 (exact row)`, hyp: cz.hyp };
      return null;
    };
    let cur = e;
    const seen = new Set([show(cur)]);
    for (let n = 0; n < 12; n++) {
      const r = step(cur);
      if (!r || seen.has(show(r.e))) break;
      seen.add(show(r.e));
      chain.push({ e: r.e, why: r.why });
      if (r.hyp) usesH.add(r.hyp);
      if (r.fact) from.add(r.fact);
      cur = r.e;
    }
    return { e: cur, chain, uses: [...usesH], from: [...from] };
  }
  /* The other side of a commuting square for g2(g1(y)), if e has that shape. */
  function squareRewrite(e) {
    for (const sq of SQUARES) for (const [a, b] of [[sq.top, sq.bottom], [sq.bottom, sq.top]]) {
      if (e.f === a[1] && e.x && e.x.f === a[0]) return { sq, e: F(b[1], F(b[0], e.x.x)) };
    }
    return null;
  }

  /* Every move the mathematics allows from the current token, and the ones it does not allow yet. */
  function labMoves(lab, offList) {
    const off = new Set(offList || []), t = lab.token, E = t.x, moves = [], blocked = [];
    if (lab.quotient) return { moves, blocked: [{ label: "Classes in a cokernel are the end of this chase.", reason: "Nothing in the diagram leaves a cokernel." }] };
    const add = (m) => moves.push(m);
    const ext = (l, r) => known(lab, { t: "eq", l, r });
    // → apply a map
    for (const m of MORPHISMS.filter((m) => m.from === t.obj)) add({ id: `apply.${m.id}`, kind: "apply", label: `apply ${m.label}`, arrow: "→", via: m.id, uses: [] });
    // ← lift: by surjectivity (a choice) or by a known image fact
    for (const m of MORPHISMS.filter((m) => m.to === t.obj)) {
      const imf = known(lab, { t: "in", x: E, set: `im ${m.label}` });
      const sh = SURJECTIVE[m.id];
      if (imf) add({ id: `solve.${m.id}`, kind: m.dir === "h" && INJECTIVE[m.id] ? "exact" : "lift", label: `${m.dir === "h" ? "solve through" : "choose a preimage under"} ${m.label}`, arrow: "←", via: m.id, uses: [], choice: !INJECTIVE[m.id] && m.id !== "ip" });
      else if (sh && !off.has(sh)) add({ id: `lift.${m.id}`, kind: "lift", label: `choose lift through ${m.label}`, arrow: "←", via: m.id, uses: [sh], choice: true });
      else blocked.push({ label: `move back along ${m.label}`, reason: sh && off.has(sh) ? `This move is not justified yet: it needs ${hyp(sh).need}, which is switched off.` : `This move is not justified yet: it needs ${show(E)} ∈ im ${m.label}${sh ? "" : ` (${m.label} is not known to be surjective)`}.` });
    }
    // kernel inference: from f(E) = 0, or from E = f(Y) = 0
    for (const f of lab.facts.filter((f) => f.t === "eq" && f.r.z)) {
      if (f.l.f && same(f.l.x, E) && !known(lab, { t: "in", x: E, set: `ker ${mor(f.l.f).label}` })) add({ id: `kernel.${f.l.f}`, kind: "kernel", label: `infer ${show(E)} ∈ ker ${mor(f.l.f).label}`, arrow: "ⓘ", uses: [], fact: f.id });
      if (same(f.l, E) && E.f && !known(lab, { t: "in", x: E.x, set: `ker ${mor(E.f).label}` })) add({ id: `kernel.${E.f}`, kind: "kernel", label: `infer ${show(E.x)} ∈ ker ${mor(E.f).label}`, arrow: "ⓘ", uses: [], fact: f.id });
    }
    // exactness: ker g = im f at this object
    for (const ex of EXACTNESS.filter((x) => x.at === t.obj)) {
      const k = known(lab, { t: "in", x: E, set: `ker ${mor(ex.g).label}` });
      if (!k || known(lab, { t: "in", x: E, set: `im ${mor(ex.f).label}` })) continue;
      if (off.has(ex.hyp)) blocked.push({ label: `use exactness at ${obj(t.obj).label}`, reason: `This move is not justified yet: it needs ${hyp(ex.hyp).need}, which is switched off.` });
      else add({ id: `exact.${t.obj}`, kind: "exact", label: `exactness: ker ${mor(ex.g).label} = im ${mor(ex.f).label}`, arrow: "⇒", uses: [ex.hyp], fact: k.id });
    }
    // injectivity: i(E) = 0 ⇒ E = 0
    for (const [m, h] of Object.entries(INJECTIVE)) {
      if (mor(m).from !== t.obj || !ext(F(m, E), ZERO) || ext(E, ZERO)) continue;
      if (off.has(h)) blocked.push({ label: `cancel ${mor(m).label}`, reason: `This move is not justified yet: it needs ${hyp(h).need}, which is switched off.` });
      else add({ id: `inject.${m}`, kind: "inject", label: `${mor(m).label} injective ⇒ ${show(E)} = 0`, arrow: "⇒", uses: [h] });
    }
    // commutativity: rewrite E itself, or compute g(E) through a square
    const own = squareRewrite(E);
    if (own) {
      if (off.has(own.sq.hyp)) blocked.push({ label: `rewrite by the ${own.sq.id} square`, reason: `This move is not justified yet: it needs ${hyp(own.sq.hyp).need}, which is switched off.` });
      else add({ id: `commute.${own.sq.id}`, kind: "commute", label: `use commutativity (${own.sq.label})`, arrow: "↻", uses: [own.sq.hyp] });
    }
    if (E.f) for (const sq of SQUARES) for (const [a, b] of [[sq.top, sq.bottom], [sq.bottom, sq.top]]) {
      if (E.f !== a[0]) continue;
      const g = a[1], target = F(g, E);
      if (ext(target, ZERO) || lab.facts.some((f) => f.t === "eq" && same(f.l, target))) continue;
      if (off.has(sq.hyp)) blocked.push({ label: `ask where ${show(E)} goes under ${mor(g).label}`, reason: `This move is not justified yet: it needs ${hyp(sq.hyp).need}, which is switched off.` });
      else add({ id: `push.${g}`, kind: "commute", label: `use commutativity: where does ${show(E)} go under ${mor(g).label}?`, arrow: "↻", uses: [sq.hyp], square: sq.id });
    }
    // quotient
    if (COKER_AT[t.obj]) add({ id: "quotient", kind: "quotient", label: `pass to coker ${mor(COKER_AT[t.obj]).label}`, arrow: "↓", uses: [] });
    // de-duplicate by id (two facts can offer the same inference)
    const seen = new Set();
    return { moves: moves.filter((m) => !seen.has(m.id) && seen.add(m.id)), blocked };
  }

  function addFact(lab, f, opIndex) {
    if (known(lab, f)) return known(lab, f);
    const g = { ...f, id: `f${lab.facts.length + 1}`, op: opIndex, from: f.from || [], uses: f.uses || [] };
    lab.facts.push(g);
    return g;
  }

  /* Apply one move (by id); returns a new lab state, or null when the move is not available. */
  function labApply(lab0, moveId, offList) {
    const { moves } = labMoves(lab0, offList);
    const m = moves.find((x) => x.id === moveId);
    if (!m) return null;
    const off = new Set(offList || []);
    const lab = structuredCloneSafe(lab0), t = lab.token, E = t.x, n = lab.ops.length + 1;
    const rec = { op: m.id, kind: m.kind, label: m.label, uses: [...m.uses], before: { obj: t.obj, x: show(E) }, facts: [], chain: null, choice: !!m.choice };
    const note = (f) => { const g = addFact(lab, { ...f, uses: f.uses || m.uses }, n); rec.facts.push(g.id); return g; };
    if (m.kind === "apply") {
      const g = mor(m.via), x = F(g.id, E);
      lab.token = { obj: g.to, x };
      const r = simplify(lab, x, off);
      if (r.chain.length && r.e.z) { note({ t: "eq", l: x, r: ZERO, why: r.chain.map((c) => c.why).join("; "), from: r.from, uses: r.uses }); rec.chain = [show(x), ...r.chain.map((c) => show(c.e))]; }
      else if (known(lab, { t: "in", x: E, set: `ker ${g.label}` })) note({ t: "eq", l: x, r: ZERO, why: `${show(E)} ∈ ker ${g.label}` });
      rec.text = `${show(E)} ↦ ${show(x)} ∈ ${obj(g.to).label}`;
    } else if (m.id.startsWith("lift.") || m.id.startsWith("solve.")) {
      const g = mor(m.via), name = freshName(lab, g.from);
      lab.names.push(name);
      const y = V(name);
      note({ t: "eq", l: F(g.id, y), r: E, why: m.id.startsWith("lift.") ? `chosen lift (${g.label} surjective)` : `preimage: ${show(E)} ∈ im ${g.label}`, uses: m.uses });
      if (m.choice) lab.choices.push({ name, via: g.id, of: show(E) });
      lab.token = { obj: g.from, x: y };
      rec.text = `${m.choice ? "CHOICE: " : ""}${name} ∈ ${obj(g.from).label} with ${g.label}(${name}) = ${show(E)}${INJECTIVE[g.id] || g.id === "ip" ? ` (unique: ${g.label} injective)` : ""}`;
    } else if (m.kind === "kernel") {
      const f = lab.facts.find((x) => x.id === m.fact);
      const [x, g] = f.l.f && same(f.l.x, E) ? [E, f.l.f] : [E.x, E.f];
      note({ t: "in", x, set: `ker ${mor(g).label}`, why: `kernel inference from ${factText(f)}`, from: [f.id] });
      rec.text = `${show(x)} ∈ ker ${mor(g).label}`;
    } else if (m.kind === "exact" && m.id.startsWith("exact.")) {
      const ex = EXACTNESS.find((x) => x.at === t.obj);
      note({ t: "in", x: E, set: `im ${mor(ex.f).label}`, why: `exactness: ker ${mor(ex.g).label} = im ${mor(ex.f).label}`, from: [m.fact], uses: [ex.hyp] });
      rec.text = `${show(E)} ∈ ker ${mor(ex.g).label} = im ${mor(ex.f).label}`;
    } else if (m.kind === "inject") {
      const g = m.id.split(".")[1];
      note({ t: "eq", l: E, r: ZERO, why: `${mor(g).label}(${show(E)}) = 0 and ${mor(g).label} is injective` });
      rec.text = `${show(E)} = 0`;
    } else if (m.kind === "commute") {
      const sq = m.id.startsWith("commute.") ? SQUARES.find((s) => s.id === m.id.split(".")[1]) : SQUARES.find((s) => s.id === m.square);
      const lhs = m.id.startsWith("commute.") ? E : F(m.id.split(".")[1], E);
      const sw = squareRewrite(lhs);
      const r = simplify(lab, sw.e, off);
      const chain = [{ e: sw.e, why: `${sq.label} (${sq.id} square)` }, ...r.chain];
      rec.chain = [show(lhs), ...chain.map((c) => show(c.e))];
      rec.uses = [...new Set([...m.uses, ...r.uses])];
      note({ t: "eq", l: lhs, r: r.e, why: chain.map((c) => c.why).join("; "), from: r.from, uses: rec.uses });
      if (m.id.startsWith("commute.")) lab.token = { obj: t.obj, x: E }; // same element, rewritten expression recorded as a fact
      rec.text = rec.chain.join(" = ");
    } else if (m.kind === "quotient") {
      const g = COKER_AT[t.obj];
      lab.token = { obj: `coker${t.obj}`, x: { q: t.obj, x: E } };
      lab.quotient = `coker ${mor(g).label}`;
      rec.text = `${show(E)} ↦ [${show(E)}] ∈ coker ${mor(g).label} = ${obj(t.obj).label} / im ${mor(g).label}`;
    }
    rec.after = { obj: lab.token.obj, x: show(lab.token.x) };
    lab.history.push(rec);
    lab.ops.push(m.id);
    return lab;
  }
  function structuredCloneSafe(v) { return JSON.parse(JSON.stringify(v)); }

  /* Replay a list of move ids from a start; moves that are not (or no longer) legal end the replay. */
  function labReplay(start, ops, offList) {
    let lab = labStart(start);
    for (const op of ops || []) { const next = labApply(lab, op, offList); if (!next) break; lab = next; }
    return lab;
  }
  /* What the chase has established, in the start's own terms. */
  function labOutcome(lab) {
    if (lab.start === "c" && lab.quotient === "coker α") {
      const names = lab.choices.map((c) => c.name);
      return { done: true, text: `Constructed δ(c′) = ${show(lab.token.x)} ∈ coker α${names.length ? ` (lift ${names.join(", ")} was a choice; the class does not depend on it)` : ""}.` };
    }
    if (lab.start === "b" && lab.facts.some((f) => f.t === "in" && f.set === "ker α")) return { done: true, text: "b′ comes from ker α: exactness at ker β." };
    if (lab.start === "a" && lab.facts.some((f) => f.t === "in" && f.set === "ker γ" && f.x.f === "pp")) return { done: true, text: "p′(b′) ∈ ker γ, and chasing it through δ with the lift b′ returns [a]: exactness at coker α." };
    return { done: false, text: LAB_STARTS[lab.start].goal };
  }
  /* Facts with the chain of facts that justified them. */
  function justification(lab, factId) {
    const out = [], seen = new Set();
    const walk = (id) => {
      if (seen.has(id)) return;
      seen.add(id);
      const f = lab.facts.find((x) => x.id === id);
      if (!f) return;
      for (const d of f.from) walk(d);
      out.push({ id: f.id, text: factText(f), why: f.why, uses: f.uses.map((h) => hyp(h).label) });
    };
    walk(factId);
    return out;
  }

  /* ---------- URL state ----------
   * #proof/lift   #exact/ker-gamma?step=3   #example/integer?k=2&c=1   #proof/well-defined?view=mod&lifts=3
   * #lab?start=c&ops=lift.pp,apply.beta   any of them with &off=p-prime-surjective,… (Break mode) */
  const MODES = ["proof", "exact", "example", "lab"];
  function defaultState() {
    return { mode: "proof", id: "proof/start", k: 0, c: 1, view: "raw", lifts: 1, start: "c", ops: [], off: [] };
  }
  function normalize(s0) {
    const d = defaultState(), s = { ...d, ...s0 };
    s.k = clampInt(s.k, Z.K, 0);
    s.c = clampInt(s.c, Z.C, 1);
    s.view = s.view === "mod" ? "mod" : "raw";
    s.lifts = clampInt(s.lifts, [1, LIFT_ORDER.length], 1);
    s.start = LAB_START_IDS.includes(s.start) ? s.start : "c";
    s.off = HYP_IDS.filter((h) => (s.off || []).includes(h));
    s.ops = (s.ops || []).filter((o) => /^[a-z]+(\.[A-Za-z]+)?$/.test(o));
    if (s.mode === "lab") { s.id = "lab"; s.ops = labReplay(s.start, s.ops, s.off).ops; }
    else if (s.mode === "example") s.id = "example/integer";
    else if (!stateById(s.id)) { s.mode = "proof"; s.id = "proof/start"; }
    else s.mode = s.id.startsWith("exact/") ? "exact" : "proof";
    return s;
  }
  function encodeHash(s0) {
    const s = normalize(s0), q = [];
    let path = s.id;
    if (s.mode === "exact") {
      const seq = sequenceOf(s.id), i = SEQUENCES[seq].findIndex((x) => x.id === s.id);
      path = seq;
      if (i > 0) q.push(`step=${i + 1}`);
    }
    if (s.mode === "example") { if (s.k !== 0) q.push(`k=${s.k}`); if (s.c !== 1) q.push(`c=${s.c}`); }
    if (s.mode === "example" || s.id === "proof/well-defined" || s.id === "proof/another-lift") {
      if (s.view !== "raw") q.push(`view=${s.view}`);
      if (s.lifts !== 1) q.push(`lifts=${s.lifts}`);
    }
    if (s.mode === "lab") { if (s.start !== "c") q.push(`start=${s.start}`); if (s.ops.length) q.push(`ops=${s.ops.join(",")}`); }
    if (s.off.length) q.push(`off=${s.off.join(",")}`);
    return `#${path}${q.length ? "?" + q.join("&") : ""}`;
  }
  function decodeHash(hash) {
    const h = String(hash || "").replace(/^#/, "");
    const [path, query = ""] = h.split("?");
    const p = Object.fromEntries(query.split("&").filter(Boolean).map((kv) => { const i = kv.indexOf("="); return i < 0 ? [kv, ""] : [decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1))]; }));
    const s = { ...defaultState(), off: p.off ? p.off.split(",") : [] };
    if (p.k !== undefined) s.k = p.k;
    if (p.c !== undefined) s.c = p.c;
    if (p.view) s.view = p.view;
    if (p.lifts) s.lifts = p.lifts;
    if (!path) return normalize(s);
    if (path === "lab") return normalize({ ...s, mode: "lab", start: p.start || "c", ops: p.ops ? p.ops.split(",") : [] });
    if (path === "example" || path === "example/integer") return normalize({ ...s, mode: "example" });
    if (path === "exact") return normalize({ ...s, mode: "exact", id: EXACT[EXACT_IDS[1]].steps[0].id });
    if (EXACT[path]) { const steps = EXACT[path].steps, i = clampInt(p.step ?? 1, [1, steps.length], 1) - 1; return normalize({ ...s, mode: "exact", id: steps[i].id }); }
    if (path === "proof") return normalize(s);
    return normalize({ ...s, id: path });
  }

  /* ---------- the beamdswitch deck ----------
   * A slide is a frame whose reveals are states: each `. . .` step is one state of the page, tagged
   * with a Markdown comment carrying its stable state id. */
  const SLIDES = {
    diagram: { title: "The commutative diagram", states: ["proof/diagram"] },
    goal: { title: "What must be constructed?", states: ["proof/goal"] },
    start: { title: "Start with c′ ∈ ker γ", states: ["proof/start"] },
    lift: { title: "Lift c′ to B′", states: ["proof/lift"] },
    down: { title: "Move down by β", states: ["proof/down"] },
    commute: { title: "Use commutativity", states: ["proof/ask", "proof/commutativity"] },
    exactness: { title: "Use exactness", states: ["proof/exactness"] },
    quotient: { title: "Pass to coker α", states: ["proof/quotient"] },
    delta: { title: "The connecting morphism δ", states: ["proof/delta"] },
    notUnique: { title: "Why the lift is not unique", states: ["proof/another-lift"] },
    wellDefined: { title: "Why the answer is well-defined", states: ["proof/well-defined"] },
    sequence: { title: "The full snake sequence", states: ["proof/sequence"] },
    kerBeta: { title: "Exactness at ker β", exact: "exact/ker-beta" },
    kerGamma: { title: "Exactness at ker γ", exact: "exact/ker-gamma" },
    cokerAlpha: { title: "Exactness at coker α", exact: "exact/coker-alpha" },
    cokerBeta: { title: "Exactness at coker β", exact: "exact/coker-beta" },
    integer: { title: "Concrete ℤ example", states: ["example/integer"] },
    changeLift: { title: "Change the lift", states: ["example/integer?k=1", "example/integer?k=-2", "example/integer?k=3"] },
    killsAmbiguity: { title: "Quotient kills the ambiguity", states: ["example/integer?view=raw&lifts=5", "example/integer?view=mod&lifts=5"] },
    zSequence: { title: "The ℤ example's six terms", states: ["example/integer?view=mod"], zsequence: true },
    breakIt: { title: "Which hypothesis pays for which move", states: ["proof/sequence"], hypotheses: true },
    lab: { title: "Chase Lab", states: ["lab"], lab: true },
    asChase: { title: "The proof as a diagram chase", states: ["proof/sequence"], key: true },
    shortLift: { title: "Start, lift, move down", states: ["proof/start", "proof/lift", "proof/down"] },
    shortCommute: { title: "Commutativity, then exactness", states: ["proof/ask", "proof/commutativity", "proof/exactness"] },
    shortWell: { title: "Why the answer is well-defined", states: ["proof/another-lift", "proof/well-defined"] },
    shortSetup: { title: "The diagram and the goal", states: ["proof/diagram", "proof/goal"] },
  };
  const PRESETS = {
    short: { label: "Short", about: "about 8 slides: the construction of δ and why it is well defined",
      setup: ["shortSetup"], method: ["shortLift", "shortCommute", "quotient"], results: ["delta", "shortWell", "integer"], checks: ["asChase"] },
    standard: { label: "Standard", about: "about 20 slides: the default deck",
      setup: ["diagram", "goal"], method: ["start", "lift", "down", "commute", "exactness", "quotient"],
      results: ["delta", "notUnique", "wellDefined", "sequence", "kerGamma", "cokerAlpha", "integer", "changeLift", "killsAmbiguity"], checks: ["lab", "asChase"] },
    full: { label: "Full proof", about: "every exactness verification and the concrete integer example",
      setup: ["diagram", "goal"], method: ["start", "lift", "down", "commute", "exactness", "quotient"],
      results: ["delta", "notUnique", "wellDefined", "sequence", "kerBeta", "kerGamma", "cokerAlpha", "cokerBeta", "integer", "changeLift", "killsAmbiguity", "zSequence"], checks: ["breakIt", "lab", "asChase"] },
  };
  const PRESET_IDS = Object.keys(PRESETS);
  const KEY = "Begin with an element killed by γ. Exactness lets us lift it; commutativity tells us where its lift goes; exactness lets us move left. The result depends on a choice, and the dependence lies precisely in im α, so passing to coker α gives the canonical map δ : ker γ → coker α.";

  /* Resolve a state reference ("proof/lift", "example/integer?k=1", "exact/ker-gamma?step=2", "lab") to a page state. */
  function resolveState(ref) {
    const st = decodeHash(ref);
    if (st.mode === "example") return { st, state: exampleState(st.c, st.k) };
    if (st.mode === "lab") return { st, state: S({ id: "lab", title: "Chase Lab", move: "lab", tokens: [{ at: "Cp", label: "c′", region: "ker-gamma" }], regions: ["ker-gamma"], lead: "Click an element and choose a legal move; illegal moves are not offered, and each fact keeps its justification.", tex: [], say: "Chase Lab.", note: "Invite the audience to chase: which move is legal here, and which hypothesis pays for it?", narration: "In the Chase Lab you choose the moves yourself, and only the moves the hypotheses justify are offered." }) };
    return { st, state: stateById(st.id) };
  }
  /* The state tag is a CommonMark comment (an unused link definition): beamdswitch, like every CommonMark
   * renderer, drops it, whereas it escapes raw HTML, so an HTML comment would show on the slide. */
  /* What one reveal shows. A frame with several reveals keeps each one short (its last equation; an
   * exactness step its title) so the finished frame still fits on a 16:9 slide. */
  function revealParts(slideId, state, multi) {
    const sl = SLIDES[slideId], tex = state.deckTex || state.tex;
    if (sl.exact) return { lead: `${state.title}.`, tex: tex.slice(-1) };
    return { lead: state.lead, tex: multi ? tex.slice(-1) : tex };
  }
  const switchComment = (ref, n) => `[//]: # "beam-md-switch visual=snake-lemma state=${ref} switch=${n}"`;
  const display = (tex) => `$$ ${tex} $$`;
  const mdText = (s) => String(s).replace(/([*_`])/g, "\\$1");

  function slideFrame(slideId) {
    const sl = SLIDES[slideId];
    const refs = sl.exact ? EXACT[sl.exact].steps.map((s, i) => (i ? `${sl.exact}?step=${i + 1}` : sl.exact)) : sl.states;
    const parts = [], notes = [], spoken = [];
    if (sl.exact) parts.push(`Claim: $${EXACT[sl.exact].claim}$`, "");
    refs.forEach((ref, i) => {
      const { st, state } = resolveState(ref);
      if (i > 0) parts.push(". . .", "");
      if (sl.zsequence) {
        parts.push("| term | in the ℤ example | because |", "| --- | --- | --- |", ...Z_SEQUENCE.map((z) => `| ${TERMS.find((t) => t.id === z.term).label} | ${z.value} | ${z.why} |`), "");
      } else if (sl.hypotheses) {
        parts.push(...HYPOTHESES.map((h) => `- **${h.label}** (${h.statement}) pays for: ${Object.entries(GRAPH).filter(([, n]) => n.needs.includes(h.id)).map(([, n]) => n.text).slice(0, 3).join("; ")}`), "");
      } else if (st.mode === "example" && slideId === "killsAmbiguity") {
        const ks = LIFT_ORDER.slice(0, st.lifts), ends = ks.map((k) => st.c + 2 * k);
        parts.push(st.view === "raw" ? `Raw A: lifts k = ${ks.map(fmtInt).join(", ")} give endpoints ${ends.map(fmtInt).join(", ")}, all different.` : `Mod out by im α: every endpoint is the class [${Z.mod2(st.c)}] in ℤ/2ℤ.`, "",
          display(st.view === "raw" ? `a \\in \\{${ends.join(", ")}\\} \\subseteq \\mathbb{Z}` : `[a] = [${Z.mod2(st.c)}] \\in \\mathbb{Z}/2\\mathbb{Z}`), "");
      } else {
        const r = revealParts(slideId, state, refs.length > 1);
        parts.push(mdText(r.lead), "");
        for (const t of r.tex) parts.push(display(t), "");
      }
      parts.push(switchComment(ref, i + 1), "");
      if (state.note && !notes.includes(state.note)) notes.push(state.note);
      if (state.narration && !spoken.includes(state.narration)) spoken.push(state.narration);
    });
    if (sl.exact) { notes.push(`The easy inclusion: ${EXACT[sl.exact].easy}`); spoken.unshift(`Now exactness at the ${speak(EXACT[sl.exact].label)}.`); }
    if (sl.lab) { notes.push("Show the move menu: apply a map, choose a lift, exactness, kernel inference, quotient, commutativity. Illegal moves are never offered."); }
    if (sl.hypotheses) { spoken.splice(0, spoken.length, "Each hypothesis pays for specific moves. Switch one off and the proof stops at the first move that needs it."); notes.splice(0, notes.length, "Use Break assumptions live: switch off p prime surjective and the proof stops at the lift."); }
    if (sl.zsequence) { spoken.splice(0, spoken.length, "In the integer example the six terms are zero, a copy of the integers, the integers, the integers mod two, the integers, and the integers."); notes.splice(0, notes.length, "Check exactness by hand: the image of ker beta in ker gamma is the even integers, exactly the kernel of delta."); }
    if (sl.key) { spoken.splice(0, spoken.length, "Begin with an element killed by gamma. Exactness lets us lift it, commutativity tells us where it goes, and exactness lets us move left. The result depends on a choice, and the cokernel of alpha forgets exactly that choice, so a canonical map appears."); notes.splice(0, notes.length, "The Snake Lemma is the inevitable output of following one element as far as the diagram permits."); }
    return { title: sl.title, body: parts.join("\n").trim(), notes: notes.join("\n"), narration: spoken.join(" "), ...(sl.key ? { key: KEY } : {}) };
  }

  const ABELIAN_NOTE = "The Snake Lemma is valid in any abelian category. The moving-element visualisation models the familiar proof in modules/abelian groups; it should not imply that arbitrary abelian categories literally have elements.";
  function report(presetId) {
    const p = PRESETS[presetId] || PRESETS.standard;
    return {
      meta: { title: "The Snake Lemma", subtitle: "Following one element through a commutative diagram", voice: "bf_emma" },
      narration: "The Snake Lemma, discovered by following one element through a commutative diagram with exact rows.",
      notes: `Preset: ${p.label} (${p.about}). ${ABELIAN_NOTE}`,
      setup: p.setup.map(slideFrame), method: p.method.map(slideFrame), results: p.results.map(slideFrame), checks: p.checks.map(slideFrame),
    };
  }
  /* The presentation sequence of a preset: one entry per reveal, in deck order. */
  function presentation(presetId) {
    const p = PRESETS[presetId] || PRESETS.standard, out = [];
    for (const sec of ["setup", "method", "results", "checks"]) for (const id of p[sec]) {
      const sl = SLIDES[id], refs = sl.exact ? EXACT[sl.exact].steps.map((s, i) => (i ? `${sl.exact}?step=${i + 1}` : sl.exact)) : sl.states;
      refs.forEach((ref, i) => out.push({ slide: id, title: sl.title, section: sec, ref, reveal: i + 1, reveals: refs.length }));
    }
    return out;
  }

  /* A mini deck from the moves the user actually made in the Chase Lab. */
  function labReport(start, ops, offList) {
    const lab = labReplay(start, ops, offList), s = LAB_STARTS[lab.start], outcome = labOutcome(lab);
    const ref = encodeHash({ mode: "lab", start: lab.start, ops: [], off: offList || [] }).slice(1);
    const initial = lab.facts.filter((f) => !f.op);
    const KIND = { apply: "Apply a map", lift: "Chosen lift", exact: "Exactness inference", kernel: "Kernel inference", inject: "Injectivity", commute: "Commuting-square rewrite", quotient: "Quotient" };
    const SAY = { apply: "We apply a map, which needs no hypothesis.", lift: "We choose a lift. This is a choice, not a computation.", exact: "Exactness turns a kernel condition into an image condition.", kernel: "A map sends the element to zero, so it lies in that kernel.", inject: "Injectivity cancels the map.", commute: "A commuting square rewrites one path as the other.", quotient: "We pass to a cokernel, deliberately forgetting information." };
    const method = lab.history.map((h, i) => {
      const r = encodeHash({ mode: "lab", start: lab.start, ops: lab.ops.slice(0, i + 1), off: offList || [] }).slice(1);
      const facts = h.facts.map((id) => lab.facts.find((f) => f.id === id));
      const title = `${i + 1}. ${KIND[h.kind] || h.kind}${h.choice ? " (choice)" : ""}`;
      const body = [mdText(`${h.label}: ${h.text}`), "", ...facts.flatMap((f) => [display(factTex(f)), ""]), switchComment(r, 1)].join("\n").trim();
      const uses = [...new Set(h.uses)].map((u) => hyp(u).label);
      return { title, body, notes: `${uses.length ? `Uses: ${uses.join(", ")}.` : "Uses no hypothesis."} ${h.choice ? "This is a choice; the end result must not depend on it." : ""}`.trim(), narration: SAY[h.kind] || "The next move." };
    });
    if (!method.length) method.push({ title: "No moves yet", body: [mdText("Choose moves in the Chase Lab, then export again."), "", switchComment(ref, 1)].join("\n"), narration: "No moves have been made yet." });
    const used = [...new Set(lab.history.flatMap((h) => h.uses))];
    const end = lab.token;
    return {
      meta: { title: "A diagram chase", subtitle: `From ${s.label}`, voice: "bf_emma" },
      narration: "A diagram chase, exported from the Snake Lemma Chase Lab.",
      notes: ABELIAN_NOTE,
      setup: [{ title: "Initial fact", body: [mdText(`${s.text}.`), "", ...initial.flatMap((f) => [display(factTex(f)), ""]), switchComment(ref, 1)].join("\n").trim(), notes: `Goal: ${s.goal}`, narration: "We start from one element and what is known about it." }],
      method,
      results: [{ title: "Where the element ended", body: [mdText(`The token is ${show(end.x)} in ${end.obj.startsWith("coker") ? `coker ${mor(COKER_AT[end.obj.slice(5)]).label}` : obj(end.obj).label}.`), "", mdText(outcome.text)].join("\n"), narration: outcome.done ? "The chase reached its goal." : "The chase stopped here." }],
      checks: [{ title: "Hypotheses used", body: used.length ? used.map((u) => `- ${hyp(u).label}: ${hyp(u).statement}`).join("\n") : "- None: every move was a computation.", key: mdText(outcome.text), narration: "Every backwards move was paid for by a named hypothesis." }],
    };
  }

  /* ---------- challenges (no grading language) ---------- */
  const CHALLENGES = [
    { id: "construct", title: "Construct δ(c′).", kind: "lab", start: "c", hint: "Lift, apply β, use commutativity, infer the kernel, use exactness, solve through i, pass to the quotient." },
    { id: "why-zero", title: "Explain why pβ(b′) = 0.", kind: "choose", options: ["right-square-commutes", "exact-at-B", "p-prime-surjective", "i-injective"], answer: "right-square-commutes",
      because: "p(β(b′)) = γ(p′(b′)) = γ(c′) = 0 uses the right square (and c′ ∈ ker γ)." },
    { id: "which-lift", title: "Find the hypothesis that permits the lift.", kind: "choose", options: ["exact-at-B-prime", "p-prime-surjective", "left-square-commutes", "exact-at-B"], answer: "p-prime-surjective",
      because: "Lifting c′ through p′ needs p′ : B′ → C′ to be surjective." },
    { id: "independent", title: "Show that δ is independent of the lift.", kind: "visit", state: "proof/well-defined", hint: "Try several lifts and switch to Mod out by im α." },
    { id: "exact-ker-gamma", title: "Prove exactness at ker γ.", kind: "visit", state: "exact/ker-gamma/still", hint: "Step through the chase until the corrected lift lies in ker β." },
    { id: "repair", title: "Repair the proof when a different lift is chosen.", kind: "choose", options: ["b' - i'(a')", "b' + i'(a')", "b' - i'(a)", "b' - \\alpha(a')"], answer: "b' - i'(a')",
      because: "β(b′ − i′(a′)) = β(b′) − i(α(a′)) = i(a) − i(a) = 0, and p′ still sends it to c′." },
  ];
  const WHY_NOT = {
    "exact-at-B": "Exactness at B lets us move left once we know β(b′) ∈ ker p; it does not compute p(β(b′)).",
    "p-prime-surjective": "Surjectivity of p′ produced b′; it says nothing about where β(b′) goes.",
    "i-injective": "Injectivity of i makes a unique; it is used after β(b′) ∈ ker p is known.",
    "exact-at-B-prime": "Exactness of the upper row compares two lifts; one lift exists only because p′ is surjective.",
    "left-square-commutes": "The left square moves elements of A′; the lift happens between B′ and C′.",
    "b' + i'(a')": "β(b′ + i′(a′)) = i(a) + i(α(a′)) = i(a) + i(a), which is not known to vanish.",
    "b' - i'(a)": "i′ is defined on A′, and a lives in A, so i′(a) has no meaning.",
    "b' - \\alpha(a')": "α(a′) lives in A, not B′, so it cannot be subtracted from b′.",
  };
  /* Respond to a challenge answer in non-judgemental language. */
  function challengeResponse(id, answer) {
    const c = CHALLENGES.find((x) => x.id === id);
    if (!c || c.kind !== "choose") return null;
    if (answer === c.answer) return { justified: true, text: `This move is justified. ${c.because}` };
    const label = HYP_IDS.includes(answer) ? hyp(answer).label : uni(answer);
    return { justified: false, text: `This move is not justified yet with “${label}”. ${WHY_NOT[answer] || ""} The fact that would justify it: ${c.because}`.replace(/\s+/g, " ").trim() };
  }

  /* ---------- palette: commands and concepts ---------- */
  const COMMANDS = [
    { id: "construct", label: "Construct δ", hash: "#proof/start" },
    { id: "well-defined", label: "Why is δ well-defined?", hash: "#proof/well-defined" },
    { id: "exact-ker-beta", label: "Exactness at ker β", hash: "#exact/ker-beta" },
    { id: "exact-ker-gamma", label: "Exactness at ker γ", hash: "#exact/ker-gamma" },
    { id: "exact-coker-alpha", label: "Exactness at coker α", hash: "#exact/coker-alpha" },
    { id: "exact-coker-beta", label: "Exactness at coker β", hash: "#exact/coker-beta" },
    { id: "integer", label: "Integer example", hash: "#example/integer" },
    { id: "another-lift", label: "Try another lift", action: "another-lift" },
    { id: "hypotheses", label: "Show hypotheses", action: "hypotheses" },
    { id: "break-commutativity", label: "Break commutativity", action: "break-commutativity" },
    { id: "reset", label: "Reset chase", action: "reset" },
    { id: "present", label: "Presentation mode", action: "present" },
    { id: "export", label: "Export Beam MD Switch", action: "export" },
    { id: "lab", label: "Chase lab", hash: "#lab" },
    { id: "trace", label: "Proof trace", action: "trace" },
    { id: "theme", label: "Toggle light/dark theme", action: "theme" },
  ];
  const CONCEPTS = [
    { id: "kernel", label: "kernel", text: "ker f = {x : f(x) = 0}. Knowing f(x) = 0 is what lets us say x ∈ ker f (kernel inference).", hash: "#proof/start" },
    { id: "cokernel", label: "cokernel", text: "coker α = A / im α: elements of A, with anything in im α treated as zero.", hash: "#proof/quotient" },
    { id: "lift", label: "lift", text: "A lift of c′ through p′ is any b′ with p′(b′) = c′. It exists when p′ is surjective, and it is a choice.", hash: "#proof/lift" },
    { id: "exactness", label: "exactness", text: "Exact at B: ker p = im i. It turns ‘p kills it’ into ‘it comes from A’.", hash: "#proof/exactness" },
    { id: "commutativity", label: "commutativity", text: "pβ = γp′: the two paths around a square agree, so one can be rewritten as the other.", hash: "#proof/commutativity" },
    { id: "quotient", label: "quotient", text: "Passing to A / im α forgets exactly the elements of im α, deliberately.", hash: "#proof/quotient" },
    { id: "connecting-morphism", label: "connecting morphism", text: "δ : ker γ → coker α, δ(c′) = [a] where i(a) = β(b′) and p′(b′) = c′.", hash: "#proof/delta" },
    { id: "well-defined", label: "well-defined", text: "Different lifts give a₁ − a₂ = α(a′), so the class [a] does not depend on the choice.", hash: "#proof/well-defined" },
    { id: "abelian-category", label: "abelian category", text: ABELIAN_NOTE, action: "abelian" },
  ];

  /* ---------- everything published as raw.json ---------- */
  function catalogue() {
    const plainState = (s) => ({ id: s.id, title: s.title, move: s.move, uses: s.uses, hypotheses: directHypotheses(s.uses), lead: s.lead, tex: s.tex });
    return {
      title: "Snake Lemma + diagram chase",
      note: ABELIAN_NOTE,
      diagram: { objects: OBJECTS.map(({ id, label, row, col }) => ({ id, label, row, col })), morphisms: MORPHISMS.map(({ id, label, from, to }) => ({ id, label, from, to })), squares: SQUARES.map(({ id, label, hyp: h }) => ({ id, label, hypothesis: h })), rows: ROWS.map(({ id, label }) => ({ id, label })) },
      hypotheses: HYPOTHESES.map(({ id, label, statement, need }) => ({ id, label, statement, need })),
      graph: Object.fromEntries(Object.entries(GRAPH).filter(([, n]) => !n.hyp).map(([id, n]) => [id, { needs: n.needs, text: n.text, reason: n.reason }])),
      derivedSequence: { terms: TERMS.map(({ id, label }) => ({ id, label })), maps: SEQ_MAPS.map(({ from, to, label }) => ({ from, to, label })), junctions: JUNCTIONS.map(({ id, seq, question }) => ({ id, sequence: seq, question })) },
      proof: PROOF.map(plainState),
      exactness: Object.fromEntries(EXACT_IDS.map((id) => [id, { claim: uni(EXACT[id].claim), easy: EXACT[id].easy, steps: EXACT[id].steps.map(plainState) }])),
      example: { rows: "0 → ℤ → ℤ² → ℤ → 0, i(a) = (a, 0), p(a, c) = c", alpha: "α(a) = 2a", beta: "β(a, c) = (2a + c, 0)", gamma: "γ(c) = 0", delta: "δ(n) = n mod 2", lift: "b′ = (k, c′), k ∈ [−5, 5]", sequence: Z_SEQUENCE },
      presets: Object.fromEntries(PRESET_IDS.map((id) => [id, { label: PRESETS[id].label, about: PRESETS[id].about, slides: ["setup", "method", "results", "checks"].flatMap((s) => PRESETS[id][s].map((x) => SLIDES[x].title)) }])),
      states: [...ALL_STATES.map((s) => s.id), "example/integer", "lab"],
      labStarts: Object.fromEntries(LAB_START_IDS.map((id) => [id, { label: LAB_STARTS[id].label, goal: LAB_STARTS[id].goal }])),
    };
  }

  return {
    uni, speak, OBJECTS, MORPHISMS, SQUARES, ROWS, TERMS, SEQ_MAPS, JUNCTIONS, HYPOTHESES, HYP_IDS, GRAPH, closure, hypothesesOf, directHypotheses,
    PROOF, EXACT, EXACT_IDS, SEQUENCES, ALL_STATES, stateById, sequenceOf, blockedAt, trace,
    Z, Z_SEQUENCE, LIFT_ORDER, exampleState, fmtInt, fmtPair,
    LAB_STARTS, LAB_START_IDS, labStart, labMoves, labApply, labReplay, labOutcome, justification, show, factText, factTex,
    MODES, defaultState, normalize, encodeHash, decodeHash, resolveState,
    SLIDES, PRESETS, PRESET_IDS, revealParts, report, presentation, labReport, KEY, ABELIAN_NOTE,
    CHALLENGES, challengeResponse, COMMANDS, CONCEPTS, catalogue, obj, mor, hyp,
  };
});
