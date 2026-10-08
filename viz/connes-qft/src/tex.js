/* Connes QFT laboratory: a small TeX subset rendered to HTML, so formulas display without any
 * external library or font. It is a pure string function (Node tests call it directly).
 *
 * Supported: \frac, ^ and _ (braced or single token), \sqrt, \bar and \overline, \tilde, \hat, \dot,
 * \not and \slashed (Feynman slash), \mathcal, \mathbf, \mathbb, \mathrm, \text, \operatorname, \boxed,
 * Greek letters and the operators listed in SYMBOLS, spacing commands, \left/\right (dropped), and
 * \link{key}{…}, which wraps its content in a span with data-link="key" for cross-highlighting.
 */
(function (factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else factory(self.ConnesQFT);
})(function (Q) {
  "use strict";

  const SYMBOLS = {
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
    Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
    partial: "∂", nabla: "∇", infty: "∞", hbar: "ℏ", ell: "ℓ", int: "∫", oint: "∮", sum: "∑", prod: "∏", to: "→", mapsto: "↦", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftrightarrow: "⇔", rightsquigarrow: "⇝", uparrow: "↑", downarrow: "↓", updownarrow: "↕",
    otimes: "⊗", oplus: "⊕", star: "⋆", cdot: "·", cdots: "⋯", ldots: "…", dots: "…", times: "×", circ: "∘", langle: "⟨", rangle: "⟩", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", sim: "∼", simeq: "≃", equiv: "≡", propto: "∝",
    in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", subsetneq: "⊊", supset: "⊃", supseteq: "⊇", setminus: "∖", triangle: "△", vert: "|", lvert: "|", rvert: "|", mid: "|", colon: ":", lbrace: "{", rbrace: "}", infty: "∞", aleph: "ℵ", bigoplus: "⨁", bigotimes: "⨂", gg: "≫", ll: "≪", varrho: "ϱ", varpi: "ϖ", varsigma: "ς", cap: "∩", cup: "∪", pm: "±", mp: "∓", dagger: "†", ast: "∗", perp: "⊥", forall: "∀", exists: "∃", emptyset: "∅", wedge: "∧", vee: "∨", neg: "¬", prime: "′", Re: "Re", Im: "Im",
    "{": "{", "}": "}", "|": "‖", ",": " ", ";": " ", ":": " ", "!": "", quad: " ", qquad: "  ", " ": " ", "\\": "<br>",
    log: "log", exp: "exp", sup: "sup", inf: "inf", lim: "lim", det: "det", min: "min", max: "max", sin: "sin", cos: "cos", Tr: "Tr", tr: "tr",
  };
  const OPERATOR_WORDS = new Set(["log", "exp", "sup", "inf", "lim", "det", "min", "max", "sin", "cos", "Tr", "tr", "Re", "Im"]);
  const CAL = { A: "𝒜", B: "ℬ", C: "𝒞", D: "𝒟", E: "ℰ", F: "ℱ", G: "𝒢", H: "ℋ", I: "ℐ", J: "𝒥", K: "𝒦", L: "ℒ", M: "ℳ", N: "𝒩", O: "𝒪", P: "𝒫", Q: "𝒬", R: "ℛ", S: "𝒮", T: "𝒯", U: "𝒰", V: "𝒱", W: "𝒲", X: "𝒳", Y: "𝒴", Z: "𝒵" };
  const BB = { C: "ℂ", R: "ℝ", Z: "ℤ", N: "ℕ", Q: "ℚ", H: "ℍ", P: "ℙ", F: "𝔽" };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === "\\") {
        const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
        out.push({ t: "cmd", v: m[1] });
        i += m[0].length;
      } else if (ch === "{" || ch === "}" || ch === "^" || ch === "_") { out.push({ t: ch }); i++; }
      else if (/\s/.test(ch)) { out.push({ t: "sp" }); while (i < src.length && /\s/.test(src[i])) i++; }
      else { out.push({ t: "ch", v: ch }); i++; }
    }
    return out;
  }

  function render(src) {
    const toks = tokenize(String(src));
    let pos = 0;
    const group = () => {
      while (toks[pos] && toks[pos].t === "sp") pos++;
      const t = toks[pos];
      if (!t) return "";
      if (t.t === "{") { pos++; const s = seq("}"); pos++; return s; }
      pos++;
      return atom(t);
    };
    const rawGroup = () => {
      // literal text of a braced group (for \text and \link keys)
      while (toks[pos] && toks[pos].t === "sp") pos++;
      if (!toks[pos] || toks[pos].t !== "{") return "";
      pos++;
      let depth = 1, s = "";
      while (pos < toks.length) {
        const t = toks[pos++];
        if (t.t === "{") { depth++; s += "{"; } else if (t.t === "}") { depth--; if (!depth) break; s += "}"; }
        else if (t.t === "cmd") s += t.v.length === 1 ? t.v : `\\${t.v}`;
        else if (t.t === "ch") s += t.v;
        else if (t.t === "sp") s += " ";
        else s += t.t;
      }
      return s;
    };
    const atom = (t) => {
      if (t.t === "ch") return /[A-Za-z]/.test(t.v) ? `<i>${esc(t.v)}</i>` : esc(t.v === "-" ? "−" : t.v === "*" ? "∗" : t.v === "'" ? "′" : t.v);
      if (t.t === "cmd") return command(t.v);
      return "";
    };
    const command = (name) => {
      switch (name) {
        case "frac": case "tfrac": case "dfrac": { const a = group(), b = group(); return `<span class="tx-fr"><span class="tx-n">${a}</span><span class="tx-d">${b}</span></span>`; }
        case "sqrt": return `<span class="tx-sq">√<span class="tx-ov">${group()}</span></span>`;
        case "bar": case "overline": return `<span class="tx-ov">${group()}</span>`;
        case "tilde": case "widetilde": return `<span class="tx-acc">${group()}<span class="tx-a">˜</span></span>`;
        case "hat": case "widehat": return `<span class="tx-acc">${group()}<span class="tx-a">ˆ</span></span>`;
        case "dot": return `<span class="tx-acc">${group()}<span class="tx-a">˙</span></span>`;
        case "ddot": return `<span class="tx-acc">${group()}<span class="tx-a">¨</span></span>`;
        case "not": case "slashed": return `<span class="tx-sl">${group()}</span>`;
        case "mathcal": case "mathscr": { const s = rawGroup(); return s.split("").map((c) => CAL[c] || esc(c)).join(""); }
        case "mathbb": { const s = rawGroup(); return s.split("").map((c) => BB[c] || esc(c)).join(""); }
        case "mathbf": case "boldsymbol": return `<b>${group()}</b>`;
        case "mathrm": case "rm": return `<span class="tx-rm">${esc(rawGroup())}</span>`;
        case "text": case "textrm": case "mbox": return `<span class="tx-rm">${esc(rawGroup())}</span>`;
        case "operatorname": return `<span class="tx-rm">${esc(rawGroup())}</span> `;
        case "boxed": return `<span class="tx-box">${group()}</span>`;
        case "link": { const key = rawGroup(); return `<span class="tx-link" data-link="${esc(key)}">${group()}</span>`; }
        case "left": case "right": case "big": case "Big": case "bigl": case "bigr": case "Bigl": case "Bigr": case "displaystyle": case "textstyle": case "scriptstyle": return "";
        case "begin": case "end": rawGroup(); return "";
        default:
          if (Object.prototype.hasOwnProperty.call(SYMBOLS, name)) {
            const s = SYMBOLS[name];
            if (OPERATOR_WORDS.has(name)) return `<span class="tx-rm">${s}</span> `;
            if (name === "int" || name === "sum" || name === "prod" || name === "oint") return `<span class="tx-big">${s}</span>`;
            return s;
          }
          return esc(`\\${name}`);
      }
    };
    const seq = (stop) => {
      let out = "";
      while (pos < toks.length && !(stop && toks[pos].t === stop)) {
        const t = toks[pos];
        if (t.t === "^" || t.t === "_") {
          pos++;
          const g = group();
          out += t.t === "^" ? `<sup>${g}</sup>` : `<sub>${g}</sub>`;
        } else if (t.t === "sp") { pos++; }
        else if (t.t === "{") { pos++; out += seq("}"); pos++; }
        else if (t.t === "}") { pos++; }
        else { pos++; out += atom(t); }
      }
      return out;
    };
    return `<span class="tx">${seq(null)}</span>`;
  }

  /* Strip a TeX string to plain readable text (for narration fallbacks and titles). */
  function plain(src) {
    return String(src)
      .replace(/\\link\{[^}]*\}/g, "")
      .replace(/\\(?:text|mathrm|operatorname)\{([^}]*)\}/g, "$1")
      .replace(/\\mathcal\{([A-Z])\}/g, (_, c) => CAL[c] || c)
      .replace(/\\mathbb\{([A-Z])\}/g, (_, c) => BB[c] || c)
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
      .replace(/\\([A-Za-z]+)/g, (_, n) => (Object.prototype.hasOwnProperty.call(SYMBOLS, n) ? SYMBOLS[n] : n))
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const api = { render, plain, SYMBOLS };
  Q.tex = api;
  return api;
});
