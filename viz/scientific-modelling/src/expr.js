/* Scientific Modelling: the equation parser and the dimension check of every term. Equations are plain text,
 * such as rho*c_p*d(T,t) = k*d(T,x,x), or a LaTeX subset that the parser turns into that plain text first. The
 * parser builds a syntax tree and never evaluates text as code (no eval, no Function).
 *
 *   plain syntax  + - * / ^ ( ), numbers, names (c_p, T_inf, rho), d(f, x, x) for a partial derivative,
 *                 exp log ln sqrt abs sin cos tan sinh cosh tanh erf erfc, and one of = < > <= >= != between sides
 *   LaTeX subset  \frac{a}{b}, \frac{\partial T}{\partial t}, \frac{\partial^2 T}{\partial x^2}, \sqrt{a},
 *                 a^{b}, x_{i}, \cdot, \times, \left( \right), \exp \ln \log \sin ..., Greek letters, \dot{Q},
 *                 \Delta T, and products written side by side
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./units.js"));
  else (root.SM = root.SM || {}).E = factory(root.SM.Q, root.SM.U);
})(typeof self !== "undefined" ? self : this, function (Q, U) {
  "use strict";

  const FUNCTIONS = new Set(["exp", "log", "ln", "log10", "sqrt", "abs", "sin", "cos", "tan", "sinh", "cosh", "tanh", "erf", "erfc"]);
  const RELATIONS = ["<=", ">=", "!=", "=", "<", ">", "≤", "≥", "≠"];
  const REL_NAME = { "≤": "<=", "≥": ">=", "≠": "!=" };

  /* ---------- tokens and the parser ---------- */

  function lex(src) {
    const out = [];
    const re = /\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-zͰ-Ͽ][A-Za-z0-9_Ͱ-Ͽ]*)|(<=|>=|!=|[-+*/^(),=<>≤≥≠]))/y;
    let i = 0;
    while (src.slice(i).trim() !== "") {
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m) {
        const at = i + (src.slice(i).length - src.slice(i).trimStart().length);
        return { error: `The character "${src[at]}" is not part of the equation syntax.`, at };
      }
      const start = re.lastIndex - m[0].trimStart().length;
      if (m[1]) out.push({ t: "num", v: m[1], at: start });
      else if (m[2]) out.push({ t: "name", v: m[2], at: start });
      else out.push({ t: REL_NAME[m[3]] ?? m[3], at: start });
      i = re.lastIndex;
    }
    out.push({ t: "end", at: src.length });
    return { list: out };
  }

  /** A syntax tree from plain text: { ast } or { error, at }. */
  function parse(text) {
    const src = String(text ?? "");
    if (src.trim() === "") return { error: "The equation is empty.", at: 0 };
    const lx = lex(src);
    if (lx.error) return lx;
    const t = lx.list;
    let i = 0;
    const peek = () => t[i];
    const fail = (msg, at = peek().at) => { throw Object.assign(new Error(msg), { at }); };
    const expect = (type, what) => (peek().t === type ? t[i++] : fail(`Expected ${what} here.`));

    function relation() {
      const l = sum();
      if (RELATIONS.includes(peek().t)) {
        const op = t[i++].t;
        const r = sum();
        if (RELATIONS.includes(peek().t)) fail("Write one relation (one = or one inequality) in each line.");
        return { k: "rel", op, l, r };
      }
      return l;
    }
    function sum() {
      const terms = [];
      let neg = false;
      if (peek().t === "+" || peek().t === "-") neg = t[i++].t === "-";
      terms.push(neg ? { k: "neg", a: product() } : product());
      while (peek().t === "+" || peek().t === "-") {
        const n = t[i++].t === "-";
        const p = product();
        terms.push(n ? { k: "neg", a: p } : p);
      }
      return terms.length === 1 ? terms[0] : { k: "add", terms };
    }
    function product() {
      const num = [unary()], den = [];
      while (peek().t === "*" || peek().t === "/") {
        const op = t[i++].t;
        (op === "*" ? num : den).push(unary());
      }
      if (peek().t === "name" || peek().t === "num" || peek().t === "(") fail("Write * between two factors.");
      return num.length === 1 && !den.length ? num[0] : { k: "mul", num, den };
    }
    function unary() {
      if (peek().t === "-") { i++; return { k: "neg", a: unary() }; }
      if (peek().t === "+") { i++; return unary(); }
      return power();
    }
    function power() {
      const b = atom();
      if (peek().t === "^") { i++; return { k: "pow", b, e: unary() }; }
      return b;
    }
    function atom() {
      const tk = peek();
      if (tk.t === "num") { i++; return { k: "num", v: Q.parse(tk.v), src: tk.v }; }
      if (tk.t === "(") { i++; const e = sum(); expect(")", "a )"); return e; }
      if (tk.t === "name") {
        i++;
        if (peek().t !== "(") {
          if (FUNCTIONS.has(tk.v) || tk.v === "d") fail(`${tk.v} is a function: write ${tk.v}(...).`, tk.at);
          return { k: "sym", name: tk.v, at: tk.at };
        }
        i++;
        const args = [sum()];
        while (peek().t === ",") { i++; args.push(sum()); }
        expect(")", "a ) after the arguments");
        if (tk.v === "d") {
          if (args.length < 2) fail("Write a derivative as d(f, x) or d(f, x, x).", tk.at);
          const vars = args.slice(1).map((a) => (a.k === "sym" ? a.name : fail("A derivative variable must be one name, such as x or t.", tk.at)));
          return { k: "d", f: args[0], vars, at: tk.at };
        }
        if (!FUNCTIONS.has(tk.v)) fail(`"${tk.v}" is not a known function. Use one of: ${[...FUNCTIONS].join(", ")}, or d(f, x).`, tk.at);
        if (args.length !== 1) fail(`${tk.v} takes one argument.`, tk.at);
        return { k: "call", f: tk.v === "ln" ? "log" : tk.v, a: args[0], at: tk.at };
      }
      return fail(tk.t === "end" ? "The equation stops before its end." : `Unexpected "${tk.t}".`);
    }

    try {
      const ast = relation();
      if (peek().t !== "end") fail(peek().t === ")" ? "A ) has no matching (." : `Unexpected "${peek().v ?? peek().t}".`);
      return { ast };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e), at: /** @type {any} */ (e).at ?? 0 };
    }
  }

  /* ---------- the LaTeX subset ---------- */

  const GREEK = ["alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "vartheta", "kappa", "lambda", "mu", "nu", "xi", "pi",
    "rho", "sigma", "tau", "phi", "varphi", "chi", "psi", "omega", "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Phi", "Psi", "Omega"];
  const LATEX_FN = { exp: "exp", ln: "ln", log: "log", sin: "sin", cos: "cos", tan: "tan", sinh: "sinh", cosh: "cosh", tanh: "tanh", operatorname: "" };

  /** Does the text look like LaTeX rather than plain syntax? */
  const isLatex = (s) => /\\[A-Za-z]|[{}]/.test(String(s));

  /** Plain text from the LaTeX subset: { text } or { error }. */
  function latexToPlain(src) {
    try {
      return { text: convert(String(src)).replace(/\s+/g, " ").trim() };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
  const D_TOP = /^\s*(?:\\partial|\\mathrm\{d\}|\\mathrm d|d)\s*(?:\^\s*\{?\s*(\d)\s*\}?)?\s*(\S.*)$/s;
  const D_BOTTOM = /(?:\\partial|\\mathrm\{d\}|\\mathrm d|d)\s*([A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?)\s*(?:\^\s*\{?\s*(\d)\s*\}?)?/gy;

  /** One LaTeX text to plain text, with * between factors that stand side by side. */
  function convert(s) {
    let i = 0, prev = null;
    const parts = [];
    const err = (m) => { throw new Error(m); };
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const push = (text, kind) => { if (kind === "atom" && prev === "atom") parts.push("*"); parts.push(text); prev = kind; };
    /** The raw text inside a balanced pair that starts at s[i]. */
    function raw(open = "{", close = "}") {
      ws();
      if (s[i] !== open) {
        // A single character or command stands for a group: \frac12, x^2.
        if (s[i] === "\\") { const m = /^\\[A-Za-z]+/.exec(s.slice(i)); if (m) { i += m[0].length; return m[0]; } }
        if (i >= s.length) err("A command needs an argument.");
        return s[i++];
      }
      let depth = 0;
      const from = i + 1;
      for (; i < s.length; i++) {
        if (s[i] === open) depth++;
        else if (s[i] === close && --depth === 0) { i++; return s.slice(from, i - 1); }
      }
      return err(`A ${open} has no matching ${close}.`);
    }
    function command() {
      const m = /^[A-Za-z]+|^[,;!: ]/.exec(s.slice(i));
      if (!m) err("A \\ has no command name.");
      i += /** @type {RegExpExecArray} */ (m)[0].length;
      return /** @type {RegExpExecArray} */ (m)[0];
    }
    /** The plain name of a subscript: {p} -> p, \infty -> inf, \mathrm{f} -> f. */
    function subscript() {
      const r = raw();
      const t = r.replace(/\\infty/g, "inf").replace(/\\(?:mathrm|text|mathit)\s*/g, "").replace(/\\([A-Za-z]+)/g, "$1").replace(/[{}\s,]/g, "");
      if (!/^[A-Za-z0-9]+$/.test(t)) err(`The subscript "${r}" is not a plain name.`);
      return t;
    }
    /** A name with its subscript, if one follows. */
    function named(base) {
      ws();
      if (s[i] === "_") { i++; return `${base}_${subscript()}`; }
      return base;
    }
    function argument() {
      ws();
      if (s[i] === "(") return convert(raw("(", ")"));
      if (s[i] === "\\" && s.startsWith("\\left(", i)) { i += 5; const inner = raw("(", ")"); return convert(inner.replace(/\\right$/, "")); }
      return convert(raw());
    }
    while (i < s.length) {
      ws();
      if (i >= s.length) break;
      const c = s[i];
      if (c === "\\") {
        i++;
        const w = command();
        if (w === "frac" || w === "dfrac" || w === "tfrac") {
          const a = raw(), b = raw();
          const top = D_TOP.exec(a);
          if (top) {
            let f = "";
            try { f = convert(top[2]).trim(); } catch { f = ""; }
            const vars = [];
            let rest = b.trim(), ok = NAME.test(f);
            while (ok && rest) {
              D_BOTTOM.lastIndex = 0;
              const m = D_BOTTOM.exec(rest);
              if (!m) { ok = false; break; }
              vars.push(...Array(Number(m[2] ?? 1)).fill(m[1].replace(/[{}]/g, "")));
              rest = rest.slice(m[0].length).replace(/^\s*(?:\\,)?\s*/, "");
            }
            if (ok && vars.length && vars.length === Number(top[1] ?? 1)) { push(`d(${f},${vars.join(",")})`, "atom"); continue; }
          }
          push(`((${convert(a)})/(${convert(b)}))`, "atom");
        } else if (w === "sqrt") push(`sqrt(${convert(raw())})`, "atom");
        else if (w === "left" || w === "right" || w === "big" || w === "Big" || w === "bigl" || w === "bigr") continue;
        else if (w === "cdot" || w === "times") push("*", "op");
        else if (w === "infty") push("inf", "atom");
        else if (w === "dot") push(named(`${convert(raw()).trim()}_dot`), "atom");
        else if (w === "mathrm" || w === "text" || w === "mathit" || w === "operatorname") {
          const g = convert(raw()).replace(/[\s*]/g, "");
          if (FUNCTIONS.has(g)) push(`${g}(${argument()})`, "atom");
          else push(named(g), "atom");
        } else if (w === "Delta" && /^\s*[A-Za-z]/.test(s.slice(i))) {
          ws();
          const letter = s[i++];
          push(named(`Delta_${letter}`), "atom");
        } else if (GREEK.includes(w)) push(named(w.replace(/^var/, "")), "atom");
        else if (w in LATEX_FN) push(`${LATEX_FN[w]}(${argument()})`, "atom");
        else if (w === "le" || w === "leq") push("<=", "op");
        else if (w === "ge" || w === "geq") push(">=", "op");
        else if (w === "ne" || w === "neq") push("!=", "op");
        else if (w === "quad" || w === "qquad" || /^[,;!: ]$/.test(w)) continue;
        else err(`The LaTeX command \\${w} is not in the supported subset.`);
      } else if (/[A-Za-z]/.test(c)) {
        i++;
        push(named(c), "atom");
      } else if (/[\d.]/.test(c)) {
        const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
        i += /** @type {RegExpExecArray} */ (m)[0].length;
        push(/** @type {RegExpExecArray} */ (m)[0], "atom");
      } else if (c === "(") push(`(${convert(raw("(", ")"))})`, "atom");
      else if (c === "[") push(`(${convert(raw("[", "]"))})`, "atom");
      else if (c === "{") push(`(${convert(raw())})`, "atom");
      else if (c === "^") {
        i++;
        parts.push(`^(${convert(raw())})`);
        prev = "atom";
      } else if ("+-*/=<>,".includes(c)) { i++; push(c, "op"); }
      else if (c === ")" || c === "]") err(`A ${c} has no matching opening bracket.`);
      else err(`The character "${c}" is not in the supported LaTeX subset.`);
    }
    return parts.join(" ").replace(/ \^/g, "^");
  }

  /** Parse plain text or the LaTeX subset: { ast, plain } or { error }. */
  function read(text) {
    let plain = String(text ?? "");
    if (isLatex(plain)) {
      const l = latexToPlain(plain);
      if (l.error) return { error: l.error, at: 0 };
      plain = /** @type {string} */ (l.text);
    }
    const p = parse(plain);
    return p.error ? { error: p.error, at: p.at } : { ast: p.ast, plain: show(p.ast) };
  }

  /* ---------- walks ---------- */

  function walk(ast, visit) {
    visit(ast);
    if (ast.k === "add") ast.terms.forEach((x) => walk(x, visit));
    else if (ast.k === "mul") [...ast.num, ...ast.den].forEach((x) => walk(x, visit));
    else if (ast.k === "neg") walk(ast.a, visit);
    else if (ast.k === "pow") { walk(ast.b, visit); walk(ast.e, visit); }
    else if (ast.k === "call") walk(ast.a, visit);
    else if (ast.k === "d") walk(ast.f, visit);
    else if (ast.k === "rel") { walk(ast.l, visit); walk(ast.r, visit); }
  }
  /** Every name in the tree, derivative variables included, in first-seen order. */
  function symbols(ast) {
    const out = [];
    walk(ast, (n) => {
      if (n.k === "sym" && !out.includes(n.name)) out.push(n.name);
      if (n.k === "d") for (const v of n.vars) if (!out.includes(v)) out.push(v);
    });
    return out;
  }
  /** Every derivative: { field, order: { x: 2 } } where field is the name differentiated. */
  function derivatives(ast) {
    const out = [];
    walk(ast, (n) => {
      if (n.k !== "d") return;
      const order = {};
      for (const v of n.vars) order[v] = (order[v] ?? 0) + 1;
      out.push({ field: n.f.k === "sym" ? n.f.name : null, order });
    });
    return out;
  }
  /** The additive terms of one side, with their signs. */
  function terms(ast) {
    if (ast.k === "add") return ast.terms.map((x) => (x.k === "neg" ? { sign: -1, node: x.a } : { sign: 1, node: x }));
    if (ast.k === "neg") return [{ sign: -1, node: ast.a }];
    return [{ sign: 1, node: ast }];
  }

  /* ---------- output: plain text and TeX ---------- */

  const PREC = { rel: 0, add: 1, neg: 2, mul: 3, pow: 4, atom: 5 };
  const prec = (n) => (n.k === "add" ? 1 : n.k === "neg" ? 2 : n.k === "mul" ? 3 : n.k === "pow" ? 4 : n.k === "rel" ? 0 : 5);

  /** Plain text that parse() reads back to the same tree. */
  function show(n) {
    const wrap = (x, p) => (prec(x) < p ? `(${show(x)})` : show(x));
    switch (n.k) {
      case "num": return n.src ?? Q.str(n.v);
      case "sym": return n.name;
      case "neg": return `-${wrap(n.a, PREC.mul)}`;
      case "add": return n.terms.map((x, j) => (x.k === "neg" ? ` - ${wrap(x.a, PREC.mul)}` : j ? ` + ${wrap(x, PREC.neg)}` : wrap(x, PREC.neg))).join("").trim();
      case "mul": return [n.num.map((x) => wrap(x, PREC.mul)).join("*"), ...n.den.map((x) => wrap(x, PREC.pow))].join("/");
      case "pow": return `${wrap(n.b, PREC.atom)}^${wrap(n.e, PREC.atom)}`;
      case "call": return `${n.f}(${show(n.a)})`;
      case "d": return `d(${show(n.f)},${n.vars.join(",")})`;
      case "rel": return `${show(n.l)} ${n.op} ${show(n.r)}`;
      default: return "?";
    }
  }

  const GREEK_TEX = new Set(GREEK.filter((g) => !g.startsWith("var")));
  const SUB_TEX = { inf: "\\infty", infty: "\\infty", 0: "0" };
  /** The default TeX of a name: rho -> \rho, c_p -> c_{p}, T_inf -> T_{\infty}, Q_dot -> \dot{Q}, eps -> \varepsilon. */
  function nameTex(name) {
    const [head, ...rest] = String(name).split("_");
    const base = head === "eps" || head === "epsilon" ? "\\varepsilon" : GREEK_TEX.has(head) ? `\\${head}` : head.length > 1 ? `\\mathrm{${head}}` : head;
    const dot = rest[rest.length - 1] === "dot";
    const subs = dot ? rest.slice(0, -1) : rest;
    let out = dot ? `\\dot{${base}}` : base;
    if (subs.length) out += `_{${subs.map((x) => SUB_TEX[x] ?? (GREEK_TEX.has(x) ? `\\${x}` : x.length > 1 ? `\\mathrm{${x}}` : x)).join(",")}}`;
    return out;
  }

  /**
   * TeX of a tree; `texOf(name)` gives each symbol's TeX (the variable table's, else nameTex). Derivatives print
   * as partial derivatives; quotients as \frac.
   */
  function tex(n, texOf = nameTex) {
    const t = (x) => tex(x, texOf);
    const wrap = (x, p) => (prec(x) < p ? `\\left(${t(x)}\\right)` : t(x));
    switch (n.k) {
      case "num": return n.src ?? Q.str(n.v);
      case "sym": return texOf(n.name);
      case "neg": return `-${wrap(n.a, PREC.mul)}`;
      case "add": return n.terms.map((x, j) => (x.k === "neg" ? `-${wrap(x.a, PREC.mul)}` : j ? `+${wrap(x, PREC.neg)}` : wrap(x, PREC.neg))).join("");
      case "mul": {
        const top = n.num.map((x) => wrap(x, PREC.mul)).join("\\,");
        if (!n.den.length) return top;
        return `\\frac{${top}}{${n.den.map((x) => wrap(x, PREC.mul)).join("\\,")}}`;
      }
      case "pow": return `${n.b.k === "sym" || n.b.k === "num" ? t(n.b) : `\\left(${t(n.b)}\\right)`}^{${t(n.e)}}`;
      case "call": {
        if (n.f === "sqrt") return `\\sqrt{${t(n.a)}}`;
        if (n.f === "abs") return `\\left|${t(n.a)}\\right|`;
        const name = ["erf", "erfc", "log10"].includes(n.f) ? `\\operatorname{${n.f === "log10" ? "log_{10}" : n.f}}` : `\\${n.f === "log" ? "ln" : n.f}`;
        return `${name}\\left(${t(n.a)}\\right)`;
      }
      case "d": {
        const counts = [];
        for (const v of n.vars) {
          const last = counts[counts.length - 1];
          if (last && last[0] === v) last[1]++;
          else counts.push([v, 1]);
        }
        const order = n.vars.length;
        const den = counts.map(([v, c]) => `\\partial ${texOf(v)}${c > 1 ? `^{${c}}` : ""}`).join("\\,");
        return `\\frac{\\partial${order > 1 ? `^{${order}}` : ""} ${n.f.k === "sym" ? texOf(n.f.name) : `\\left(${t(n.f)}\\right)`}}{${den}}`;
      }
      case "rel": return `${t(n.l)} ${{ "=": "=", "<": "<", ">": ">", "<=": "\\le", ">=": "\\ge", "!=": "\\ne" }[n.op]} ${t(n.r)}`;
      default: return "?";
    }
  }

  /* ---------- the dimension check ---------- */

  /**
   * The dimension of a tree under `env(name)`, which returns { dim, temperature, domain, affine } for a declared
   * name or null. Returns { dim (null when unknown), temperature, constant, value, issues }. Each issue has a code
   * (undefined-symbol, dimension-mismatch, exponent-dimension, function-argument, domain-required,
   * absolute-temperature-sum, absolute-temperature-scale) and a message; mismatches carry the terms and their dims.
   * `declared(expr)` says whether an assumption declares that expression nonzero or positive.
   */
  function infer(ast, env, declared = () => false) {
    const issues = [];
    const seen = new Set();
    const issue = (x) => {
      const key = `${x.code}|${x.message}`;
      if (!seen.has(key)) { seen.add(key); issues.push(x); }
    };
    const res = (dim, extra = {}) => ({ dim, temperature: null, constant: false, value: null, ...extra });

    function sign(n) {
      // Which sign a factor is known to have from declared domains: "positive", "nonzero" or null.
      if (n.k === "num") return Q.isZero(n.v) ? null : Q.sign(n.v) > 0 ? "positive" : "nonzero";
      if (n.k === "sym") {
        const e = env(n.name);
        const d = e?.domain;
        return d === "positive" ? "positive" : d === "negative" || d === "nonzero" ? "nonzero" : null;
      }
      if (n.k === "mul") {
        const all = [...n.num, ...n.den].map(sign);
        return all.every((x) => x) ? (all.every((x) => x === "positive") ? "positive" : "nonzero") : null;
      }
      if (n.k === "pow") {
        const b = sign(n.b);
        return b === "positive" ? "positive" : b && n.e.k === "num" && Q.isInteger(n.e.v) ? "nonzero" : null;
      }
      if (n.k === "neg") return sign(n.a) ? "nonzero" : null;
      if (n.k === "call" && n.f === "exp") return "positive";
      const declaredSign = declared(show(n));
      return declaredSign || null;
    }

    function go(n) {
      switch (n.k) {
        case "num": return res(U.NONE.slice(), { constant: true, value: n.v });
        case "sym": {
          const e = env(n.name);
          if (!e) {
            issue({ code: "undefined-symbol", symbol: n.name, message: `${n.name} is not in the variable table.` });
            return res(null);
          }
          if (!e.dim) return res(null, { temperature: e.temperature });
          return res(e.dim.slice(), { temperature: e.temperature, affine: e.affine, name: n.name });
        }
        case "neg": { const a = go(n.a); return { ...a, value: a.value && Q.neg(a.value) }; }
        case "add": {
          const parts = n.terms.map((x) => ({ node: x.k === "neg" ? x.a : x, neg: x.k === "neg", r: go(x.k === "neg" ? x.a : x) }));
          const known = parts.filter((p) => p.r.dim);
          const first = known[0];
          if (first && known.some((p) => !U.deq(p.r.dim, first.r.dim))) {
            issue({ code: "dimension-mismatch", message: "The terms of a sum have different dimensions.",
              terms: parts.map((p) => ({ text: show(p.node), dim: p.r.dim ? U.plain(p.r.dim) : null })) });
          }
          // Temperature kinds: abs - abs = difference; abs +- diff = absolute; abs + abs has no physical meaning.
          let temperature = null;
          const kinds = parts.map((p) => ({ kind: p.r.temperature, neg: p.neg }));
          const abs = kinds.filter((k) => k.kind === "absolute");
          if (abs.length) {
            const net = abs.reduce((s, k) => s + (k.neg ? -1 : 1), 0);
            if (net === 0) temperature = "difference";
            else if (net === 1 || net === -1) temperature = "absolute";
            else issue({ code: "absolute-temperature-sum", message: `${show(n)} adds absolute temperatures. Only a difference of absolute temperatures, or a mean, has a physical meaning.` });
          } else if (kinds.some((k) => k.kind === "difference")) temperature = "difference";
          const allConst = parts.every((p) => p.r.constant);
          return res(first ? first.r.dim.slice() : null, { temperature, constant: allConst,
            value: allConst ? parts.reduce((s, p) => Q.add(s, p.neg ? Q.neg(p.r.value) : p.r.value), Q.ZERO) : null });
        }
        case "mul": {
          let dim = U.NONE.slice(), ok = true, constant = true, value = Q.ONE;
          for (const [list, s] of [[n.num, 1], [n.den, -1]]) {
            for (const x of list) {
              const r = go(x);
              if (r.temperature === "absolute") scale(x, r);
              if (!r.dim) ok = false;
              else dim = s > 0 ? U.dadd(dim, r.dim) : U.dsub(dim, r.dim);
              constant = constant && r.constant;
              if (constant && r.value) value = s > 0 ? Q.mul(value, r.value) : (Q.isZero(r.value) ? value : Q.div(value, r.value));
              if (s < 0 && !sign(x)) {
                issue({ code: "domain-required", message: `The divisor ${show(x)} can be zero. Declare a domain that excludes 0, such as ${x.k === "sym" ? `${x.name} positive` : `${show(x)} != 0 in the assumptions`}.`, expr: show(x) });
              }
            }
          }
          return res(ok ? dim : null, { constant, value: constant ? value : null });
        }
        case "pow": {
          const b = go(n.b), e = go(n.e);
          if (e.dim && !U.isNone(e.dim)) issue({ code: "exponent-dimension", message: `The exponent of ${show(n)} has dimension ${U.text(e.dim)}. An exponent must be dimensionless.` });
          if (b.temperature === "absolute") scale(n.b, b);
          if (e.constant && e.value) {
            if (!Q.isInteger(e.value) && sign(n.b) !== "positive" && b.dim && !(b.constant && b.value && Q.sign(b.value) > 0)) {
              issue({ code: "domain-required", message: `The power ${show(n)} has a fractional exponent. Declare ${show(n.b)} positive.`, expr: show(n.b) });
            }
            if (Q.sign(e.value) < 0 && !sign(n.b)) issue({ code: "domain-required", message: `${show(n)} divides by ${show(n.b)}, which can be zero. Declare a domain that excludes 0.`, expr: show(n.b) });
            return res(b.dim ? U.dscale(b.dim, e.value) : null, { constant: b.constant, value: b.constant && b.value && Q.isInteger(e.value) && !(Q.isZero(b.value) && Q.sign(e.value) < 0) ? Q.pow(b.value, e.value.n) : null });
          }
          if (b.dim && !U.isNone(b.dim)) issue({ code: "exponent-dimension", message: `${show(n)} raises a dimensional base to a variable exponent. The base must be dimensionless.` });
          return res(b.dim && U.isNone(b.dim) ? U.NONE.slice() : null);
        }
        case "call": {
          const a = go(n.a);
          if (n.f === "sqrt") {
            if (!sign(n.a) && !(a.constant && a.value && Q.sign(a.value) >= 0)) issue({ code: "domain-required", message: `sqrt(${show(n.a)}) needs a declared domain: declare ${show(n.a)} positive or nonnegative.`, expr: show(n.a) });
            if (a.temperature === "absolute") scale(n.a, a);
            return res(a.dim ? U.dscale(a.dim, Q.q(1, 2)) : null);
          }
          if (n.f === "abs") return res(a.dim, { temperature: a.temperature });
          if (a.dim && !U.isNone(a.dim)) issue({ code: "function-argument", message: `The argument of ${n.f} is ${show(n.a)}, with dimension ${U.text(a.dim)}. The argument of ${n.f} must be dimensionless.` });
          if ((n.f === "log" || n.f === "log10") && sign(n.a) !== "positive" && !(a.constant && a.value && Q.sign(a.value) > 0)) {
            issue({ code: "domain-required", message: `${n.f}(${show(n.a)}) needs a positive argument. Declare ${show(n.a)} positive.`, expr: show(n.a) });
          }
          return res(U.NONE.slice());
        }
        case "d": {
          const f = go(n.f);
          let dim = f.dim ? f.dim.slice() : null;
          for (const v of n.vars) {
            const e = env(v);
            if (!e) { issue({ code: "undefined-symbol", symbol: v, message: `${v} is not in the variable table.` }); dim = null; continue; }
            if (dim && e.dim) dim = U.dsub(dim, e.dim);
            else dim = null;
          }
          return res(dim, { temperature: f.temperature === "absolute" || f.temperature === "difference" ? "difference" : null });
        }
        case "rel": {
          const l = go(n.l), r = go(n.r);
          const zero = (x, node) => x.constant && x.value && Q.isZero(x.value) && node.k === "num";
          if (l.dim && r.dim && !U.deq(l.dim, r.dim) && !zero(l, n.l) && !zero(r, n.r)) {
            issue({ code: "dimension-mismatch", message: "The two sides have different dimensions.",
              terms: [...terms(n.l).map((x) => ({ side: "left", text: show(x.node), dim: dimOf(x.node) })), ...terms(n.r).map((x) => ({ side: "right", text: show(x.node), dim: dimOf(x.node) }))] });
          }
          if (l.temperature && r.temperature && l.temperature !== r.temperature && !zero(l, n.l) && !zero(r, n.r)) {
            issue({ code: "absolute-temperature-sum", message: `One side of ${show(n)} is an absolute temperature and the other side is a temperature difference.` });
          }
          return res(l.dim ?? r.dim, { temperature: l.temperature ?? r.temperature });
        }
        default: return res(null);
      }
    }
    function dimOf(node) {
      const d = infer(node, env, declared).dim;
      return d ? U.plain(d) : null;
    }
    function scale(node, r) {
      const name = node.k === "sym" ? node.name : show(node);
      if (r.affine) issue({ code: "absolute-temperature-scale", level: "info", message: `${name} is an absolute temperature in ${r.affine}. The tool converts it to K before this product, quotient or power.` });
    }

    const out = go(ast);
    return { ...out, issues };
  }

  return { FUNCTIONS, parse, latexToPlain, isLatex, read, walk, symbols, derivatives, terms, show, tex, nameTex, infer };
});
