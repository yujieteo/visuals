/* Entropy Methods in Combinatorics Lab: a tiny renderer for the lessons' text.
 *
 * Markdown (paragraphs, "- " lists, **bold**, *italic*) with TeX maths in $...$ and $$...$$. The TeX
 * side is a fixed table of the commands the lessons use (fractions, binomials, sums, scripts, roots,
 * relations, Greek and calligraphic letters), written out as HTML and CSS: no TeX library and no
 * symbolic algebra. An unknown command is shown as its name and recorded in `unknown`, which the tests
 * keep empty. Pure: no DOM.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EntropyRender = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const SYM = {
    le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", in: "∈", notin: "∉", subseteq: "⊆", subset: "⊂", cup: "∪", cap: "∩", times: "×", cdot: "·",
    cdots: "⋯", ldots: "…", dots: "…", to: "→", rightarrow: "→", Rightarrow: "⇒", iff: "⇔", approx: "≈", lesssim: "≲", sim: "∼", infty: "∞",
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", varepsilon: "ε", epsilon: "ε", pi: "π", mu: "μ", sigma: "σ", lambda: "λ", Omega: "Ω",
    mid: " ∣ ", "|": "‖", "{": "{", "}": "}", lceil: "⌈", rceil: "⌉", lfloor: "⌊", rfloor: "⌋", otimes: "⊗", setminus: "∖", "#": "#", "%": "%",
    pm: "±", star: "⋆", emptyset: "∅", ",": " ", ";": " ", ":": " ", "!": "", quad: " ", qquad: "  ", " ": " ",
    langle: "⟨", rangle: "⟩", propto: "∝", ni: "∋", vert: "|", prime: "′", sum: "∑", prod: "∏",
  };
  const OPS = new Set(["log", "ln", "exp", "max", "min", "Pr", "lim", "deg", "per", "supp"]);
  const IGNORE = new Set(["left", "right", "big", "Big", "bigl", "bigr", "Bigl", "Bigr", "displaystyle", "textstyle", "limits"]);
  const CAL = { A: "𝒜", B: "ℬ", C: "𝒞", D: "𝒟", E: "ℰ", F: "ℱ", G: "𝒢", H: "ℋ", L: "ℒ", M: "ℳ", P: "𝒫", S: "𝒮", T: "𝒯", X: "𝒳" };
  const BB = { E: "𝔼", Z: "ℤ", R: "ℝ", N: "ℕ", P: "ℙ" };
  /* Symbols set as relations (with relation spacing); \sum and \prod are set as big operators. */
  const RELS = new Set(["le", "leq", "ge", "geq", "ne", "neq", "in", "subseteq", "approx", "lesssim", "to", "Rightarrow", "iff"]);
  const BIG = new Set(["sum", "prod"]);
  const alphabet = (map) => (t) => [...t].map((ch) => map[ch] || ch).join("");
  const frac = (a, b, cls = "frac") => `<span class="${cls}"><span>${a}</span><span>${b}</span></span>`;
  /* Commands with arguments: each reads its arguments through the parser p ({ group, rawText }). */
  const COMMANDS = {
    frac: (p) => frac(p.group(), p.group()),
    binom: (p) => `<span class="binom"><span class="paren">(</span>${frac(p.group(), p.group(), "frac nobar")}<span class="paren">)</span></span>`,
    sqrt: (p) => `√<span class="ol">${p.group()}</span>`,
    text: (p) => `<span class="up">${esc(p.rawText())}</span>`,
    operatorname: (p) => `<span class="up op">${esc(p.rawText())}</span>`,
    mathcal: (p) => alphabet(CAL)(p.rawText()),
    mathbb: (p) => alphabet(BB)(p.rawText()),
    mathbf: (p) => `<b>${esc(p.rawText())}</b>`,
  };
  COMMANDS.tfrac = COMMANDS.dfrac = COMMANDS.frac;
  COMMANDS.mathrm = COMMANDS.textrm = COMMANDS.text;

  function tex(src, unknown = []) {
    let i = 0;
    const s = String(src);
    function group() {
      /* Read one argument: a {group}, a \command or one character. */
      while (s[i] === " ") i++;
      if (s[i] === "{") { i++; const out = seq("}"); i++; return out; }
      if (s[i] === "\\") return command();
      const ch = s[i++];
      return ch === undefined ? "" : atom(ch);
    }
    function atom(ch) {
      if (/[A-Za-z]/.test(ch)) return `<i>${ch}</i>`;
      if (ch === "-") return "−";
      if (ch === "'") return "′";
      if (ch === "*") return "∗";
      if (/[=<>+]/.test(ch)) return `<span class="rel">${esc(ch)}</span>`;
      return esc(ch);
    }
    function rawText() {
      if (s[i] !== "{") return "";
      let depth = 0, out = "";
      for (; i < s.length; i++) {
        if (s[i] === "{") { if (depth++) out += "{"; continue; }
        if (s[i] === "}") { if (--depth === 0) { i++; break; } out += "}"; continue; }
        out += s[i];
      }
      return out;
    }
    function command() {
      i++;
      let name = "";
      if (/[A-Za-z]/.test(s[i] || "")) while (/[A-Za-z]/.test(s[i] || "")) name += s[i++];
      else name = s[i++] || "";
      if (name === "\\") return "";
      if (IGNORE.has(name)) return "";
      if (Object.hasOwn(COMMANDS, name)) return COMMANDS[name](parser);
      if (OPS.has(name)) return `<span class="up op">${name}</span>`;
      if (name in SYM) return BIG.has(name) ? `<span class="bigop">${SYM[name]}</span>` : RELS.has(name) ? `<span class="rel">${SYM[name]}</span>` : SYM[name];
      unknown.push(name);
      return esc("\\" + name);
    }
    function seq(stop) {
      let out = "";
      while (i < s.length && s[i] !== stop) {
        const ch = s[i];
        if (ch === "^" || ch === "_") { i++; const g = group(); out += ch === "^" ? `<sup>${g}</sup>` : `<sub>${g}</sub>`; continue; }
        if (ch === "{") { i++; out += seq("}"); i++; continue; }
        if (ch === "\\") { out += command(); continue; }
        if (ch === " ") { i++; continue; }
        i++;
        out += atom(ch);
      }
      return out;
    }
    const parser = { group, rawText };
    return seq(undefined);
  }

  /* Inline Markdown on text that has no maths in it. */
  const inline = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/`([^`]+)`/g, "<code>$1</code>");
  /* Text with $...$ and $$...$$. */
  function mixed(text, unknown) {
    let out = "", rest = String(text);
    const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/;
    let m;
    while ((m = re.exec(rest))) {
      out += inline(rest.slice(0, m.index));
      out += m[1] !== undefined ? `<span class="math display" role="math">${tex(m[1], unknown)}</span>` : `<span class="math" role="math">${tex(m[2], unknown)}</span>`;
      rest = rest.slice(m.index + m[0].length);
    }
    return out + inline(rest);
  }
  function md(text, unknown = []) {
    const blocks = String(text || "").replace(/\r\n?/g, "\n").split(/\n\s*\n/);
    return blocks.map((b) => {
      const lines = b.split("\n").filter((l) => l.trim());
      if (!lines.length) return "";
      if (lines.every((l) => /^\s*- /.test(l))) return `<ul>${lines.map((l) => `<li>${mixed(l.replace(/^\s*- /, ""), unknown)}</li>`).join("")}</ul>`;
      const one = lines.join(" ");
      if (/^\$\$[\s\S]*\$\$$/.test(one.trim())) return `<div class="mathblock">${mixed(one.trim(), unknown)}</div>`;
      return `<p>${mixed(one, unknown)}</p>`;
    }).join("");
  }
  /* Plain text for aria labels and the command palette. */
  const text = (s) => String(s || "").replace(/\$\$?([^$]*)\$\$?/g, (_, m) => m.replace(/\\[a-zA-Z]+/g, (c) => SYM[c.slice(1)] || (OPS.has(c.slice(1)) ? c.slice(1) : "")).replace(/[{}^_\\]/g, "")).replace(/[*`]/g, "");

  return { esc, tex, md, mixed, inline, text };
});
