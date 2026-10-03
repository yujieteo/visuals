/* Part 7: the shared machinery — state, URLs, experiments, decks and exports, search, recommender, maths text, self-tests.
 * One state feeds the lab, the proof lens, deck mode and every Markdown export, so they cannot disagree. */

const URL_BASE = "https://teoyujie.org/visuals/probabilistic-method/";
const DEFAULT_SEED = 17;
const COURSE = ["first-moment", "linearity", "alterations", "second-moment", "local-lemma", "moser-tardos", "chernoff", "martingale", "janson", "nibble", "quasirandom", "phase-transition", "discrepancy", "epsilon-net", "entropy", "derandomization", "testing", "drc"];
const COURSE_STAGES = [
  ["randomness proves existence", ["first-moment"]], ["expectation without independence", ["linearity"]], ["repair imperfect random objects", ["alterations"]],
  ["variance and second moments", ["second-moment"]], ["local dependence", ["local-lemma", "moser-tardos"]], ["concentration", ["chernoff", "martingale", "discrepancy"]],
  ["rare events", ["janson"]], ["iterative randomness", ["nibble", "phase-transition", "drc"]], ["pseudorandomness", ["quasirandom"]], ["derandomisation", ["derandomization"]],
  ["information and sampling", ["epsilon-net", "entropy", "testing"]],
];
const moduleById = (id) => MODULES.find((m) => m.id === id) || null;
const moduleByRoute = (route) => MODULES.find((m) => m.route === route) || null;
const techniqueById = (id) => INVENTORY.find((t) => t.id === id) || null;

/* ---------- parameters and state ---------- */

function defaults(mod) { const P = { seed: DEFAULT_SEED }; for (const p of mod.params) P[p.key] = p.def; return mod.coerce ? mod.coerce(P) : P; }
function coerceParam(p, raw) {
  if (raw === undefined || raw === null || raw === "") return p.def;
  if (p.options) { const hit = p.options.find(([v]) => String(v) === String(raw)); return hit ? hit[0] : p.def; }
  if (p.hidden) return String(raw).replace(/[^0-9,-]/g, "");
  const x = Number(raw);
  if (!Number.isFinite(x)) return p.def;
  const clamped = Math.min(p.max, Math.max(p.min, x)), stepped = Math.round((clamped - p.min) / p.step) * p.step + p.min;
  return Number(stepped.toFixed(6));
}
function withParams(mod, raw) {
  const P = { seed: Number.isInteger(Number(raw.seed)) && Number(raw.seed) >= 0 ? Number(raw.seed) % 4294967296 : DEFAULT_SEED };
  for (const p of mod.params) P[p.key] = coerceParam(p, raw[p.key]);
  return mod.coerce ? mod.coerce(P) : P;
}
/* Everything one module needs, computed once from its parameters and seed. */
function evaluate(mod, P) {
  const F = mod.fixed ? mod.fixed(P, P.seed) : null, A = mod.analyse(P, F);
  const I = mod.view ? mod.view(P, F) : mod.sample(P, rng(P.seed, `${mod.id}:sample`), F);
  return { mod, P, F, A, I };
}

/* ---------- URL state: #route?key=value&… ---------- */

function parseHash(hash) {
  const h = String(hash || "").replace(/^#/, ""), [path, query = ""] = h.split("?"), q = {};
  for (const part of query.split("&").filter(Boolean)) { const [k, v = ""] = part.split("="); try { q[decodeURIComponent(k)] = decodeURIComponent(v); } catch { continue; } }
  const mod = moduleByRoute(path);
  if (mod) return { view: "lab", module: mod.id, P: withParams(mod, q), deck: q.deck === "1", frame: Math.max(0, Number(q.frame) || 0), step: Math.max(0, Number(q.switch) || 0), lens: q.lens === "proof" || q.lens === "experiment" ? q.lens : "lab", asym: q.view === "asymptotic", focus: q.scene || "" };
  const m = /^technique\/([a-z0-9-]+)$/.exec(path);
  if (m && techniqueById(m[1])) return { view: "technique", technique: m[1] };
  const c = /^compare\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(path);
  if (c) return { view: "compare", a: c[1], b: c[2] };
  if (path === "recommend") return { view: "recommend" };
  return { view: "atlas" };
}
function stateHash(s) {
  if (s.view === "technique") return `#technique/${s.technique}`;
  if (s.view === "compare") return `#compare/${s.a}/${s.b}`;
  if (s.view === "recommend") return "#recommend";
  if (s.view !== "lab") return "#atlas";
  const mod = moduleById(s.module), def = defaults(mod), q = [];
  for (const p of mod.params) if (String(s.P[p.key]) !== String(def[p.key])) q.push(`${p.key}=${encodeURIComponent(s.P[p.key])}`);
  q.push(`seed=${s.P.seed}`);
  if (s.lens && s.lens !== "lab") q.push(`lens=${s.lens}`);
  if (s.asym) q.push("view=asymptotic");
  if (s.deck) q.push("deck=1", `frame=${s.frame || 0}`, `switch=${s.step || 0}`);
  if (s.focus) q.push(`scene=${encodeURIComponent(s.focus)}`);
  return `#${mod.route}?${q.join("&")}`;
}

/* ---------- experiments ---------- */

function trialValue(E, t) {
  const r = rng(E.P.seed, `${E.mod.id}:trial:${t}`);
  return E.mod.fastStat ? E.mod.fastStat(E.P, r, E.F) : E.mod.stat(E.mod.sample(E.P, r, E.F), E.P, E.F);
}
function runTrials(E, from, to) { const out = []; for (let t = from; t < to; t++) out.push(trialValue(E, t)); return out; }
function histogram(values) {
  if (!values.length) return { bins: [], N: 0 };
  const allInt = values.every((v) => Number.isInteger(v)), lo = Math.min(...values), hi = Math.max(...values);
  if (allInt && hi - lo <= 60) {
    const bins = Array.from({ length: hi - lo + 1 }, (_, i) => ({ x0: lo + i, x1: lo + i + 1, label: String(lo + i), count: 0 }));
    for (const v of values) bins[v - lo].count++;
    return { bins, N: values.length, integer: true };
  }
  const k = 30, w = (hi - lo) / k || 1, bins = Array.from({ length: k }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, label: fmt(lo + i * w, 3), count: 0 }));
  for (const v of values) bins[Math.min(k - 1, Math.floor((v - lo) / w))].count++;
  return { bins, N: values.length, integer: false };
}
function summarise(E, values) {
  const th = E.mod.experiment.theory(E.A, E.P), N = values.length;
  const hits = values.filter((x) => th.eventTest(x, E.A, E.P)).length, mean = N ? values.reduce((a, b) => a + b, 0) / N : NaN;
  return { N, mean, hits, frac: N ? hits / N : NaN, theory: th, hist: histogram(values) };
}

/* ---------- decks: the shared beamdswitch template, and the full course ---------- */

const B = () => (typeof Beamdswitch !== "undefined" ? Beamdswitch : self.Beamdswitch);
/* The live page's link to this exact lab state: the address a deck tells the reader to reproduce it from. */
const labUrl = (E) => `${URL_BASE}${stateHash({ view: "lab", module: E.mod.id, P: E.P })}`;
/* A report's frames in deck order. */
const reportFrames = (R) => [...R.setup, ...R.method, ...R.results, ...R.checks];
function frameWithScene(E, f) {
  const body = [sceneComment(E.mod.id, f.focus, E.P, focusLabel(E, f.focus)), f.body].filter(Boolean).join("\n\n");
  return { title: f.title, body, narration: f.narration, notes: f.notes, key: f.key };
}
/* A human-readable focus for a scene (narration-decoded: never an opaque id alone). */
function focusLabel(E, scene) {
  const names = { problem: "the deterministic goal", "random-object": "the sampled random object", witnesses: "the witnesses that matter", variable: "the key random variable", bound: "the technique's inequality",
    experiment: "the simulation (an illustration, not a proof)", transition: "the step from probability to existence", conclusion: "the deterministic conclusion", overlap: "pairs of witnesses by overlap",
    dependency: `bad event A_${E.A.focusEvent ?? 0} and its dependency neighbourhood`, condition: "the Local Lemma condition e p (d+1) <= 1", "union-bound": "the union-bound sum", resample: "the resampling history", mgf: "the exponential envelope",
    corridor: "the bounded-difference corridor", poisson: "the count against the Poisson law", collisions: "colliding selections", trajectory: "the predicted trajectory", dashboard: "the four quasirandom statistics",
    branching: "graph exploration beside the branching process", vc: "shattered subsets", counting: "the counting bound", construction: "the conditional-expectation path", bad: "bad pairs and their deletion", repair: "the repair step", threshold: "the threshold sweep" };
  return names[scene] || scene;
}
function techniqueReport(E) {
  const s = E.mod.story(E.P, E.A, E.I), wrap = (arr) => arr.map((f) => frameWithScene(E, f));
  return { meta: { title: s.title, subtitle: s.subtitle, author: "The Probabilistic Method Atlas", voice: "bf_emma" }, narration: s.narration,
    notes: `Scene state: module ${E.mod.id}, seed ${E.P.seed}. Reproduce at ${labUrl(E)}`,
    setup: wrap(s.setup), method: wrap(s.method), results: wrap(s.results), checks: wrap(s.checks) };
}
function techniqueDeck(E) { return B().deck(techniqueReport(E)); }
/* The frames deck mode shows, in order, with their reveal steps — the same text the export writes. */
function deckFrames(E) {
  const s = E.mod.story(E.P, E.A, E.I), out = [];
  for (const [id, label] of B().SECTIONS) for (const f of s[id]) out.push({ section: label, title: f.title, focus: f.focus, body: f.body, steps: f.body.split(/\n\s*\.\s\.\s\.\s*\n/).length, narration: f.narration, notes: f.notes || "", key: f.key || "" });
  return out;
}
const oneLine = (x) => String(x ?? "").replace(/\s+/g, " ").trim();
function writeFrame(f) {
  const out = [`## ${oneLine(f.title)}`, "", f.body, ""];
  if (f.key) out.push("::: key", f.key, ":::", "");
  if (f.notes) out.push("::: notes", f.notes, ":::", "");
  out.push("::: narration", oneLine(f.narration), ":::", "");
  return out;
}
/* One technique's frame on its own, as a standalone one-slide deck. */
function slideMarkdown(E, index) {
  const frames = deckFrames(E), f = frames[Math.max(0, Math.min(frames.length - 1, index))], R = techniqueReport(E);
  const g = reportFrames(R)[frames.indexOf(f)];
  return ["---", `title: ${oneLine(R.meta.title)}`, "voice: bf_emma", "---", "", "::: narration", oneLine(R.narration), ":::", "", ...writeFrame(g)].join("\n");
}
/* The full course deck: one # section per technique, in course order, at each module's default parameters and the given seed. */
function courseDeck(seed = DEFAULT_SEED) {
  const out = ["---", "title: The Probabilistic Method Atlas", "subtitle: Random experiment, observable, dependency, inequality, deterministic consequence", "author: The Probabilistic Method Atlas", "voice: bf_emma", "---", "",
    "::: narration", "This course follows one recurring move. Build a probability space, show that good outcomes have positive probability, and conclude that a good object exists.", ":::", ""];
  COURSE.forEach((id, i) => {
    const mod = moduleById(id), E = evaluate(mod, { ...defaults(mod), seed }), R = techniqueReport(E);
    out.push(`# ${mod.title}`, "", "::: narration", `Part ${i + 1}. ${mod.title.replace(/[–—]/g, " ")}.`, ":::", "");
    for (const f of reportFrames(R)) out.push(...writeFrame(f));
  });
  return out.join("\n");
}
/* The Beam MD Switch sequence: every deck state of the technique, decoded into words. */
function switchSequence(E) {
  const frames = deckFrames(E), lines = [`# Beam MD Switch sequence: ${E.mod.title}`, "", `Reproduce: ${labUrl(E)}`, ""];
  frames.forEach((f, i) => {
    for (let s = 0; s < f.steps; s++) {
      lines.push(`<!-- beam-md-switch`, "visual: probabilistic-method", `module: ${E.mod.id}`, `scene: ${f.focus}`, `frame: ${i}`, `switch: ${s}`, `seed: ${E.P.seed}`,
        `focus: ${focusLabel(E, f.focus)}`, `parameters: ${E.mod.params.map((p) => `${p.key}=${E.P[p.key]}`).join(", ")}`, "-->", `- **${f.title}** (step ${s + 1} of ${f.steps}): ${oneLine(f.narration)}`, "");
    }
  });
  return lines.join("\n");
}

/* ---------- maths text: LaTeX-like source to Unicode for the page ---------- */

const GREEK = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", varepsilon: "ε", epsilon: "ε", lambda: "λ", mu: "μ", pi: "π", rho: "ρ", sigma: "σ", omega: "ω", theta: "θ", Delta: "Δ", Omega: "Ω", Phi: "Φ", Sigma: "Σ" };
const SYMBOLS = { le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", cdot: "·", times: "×", infty: "∞", to: "→", Longrightarrow: "⟹", Rightarrow: "⇒", sum: "Σ", prod: "Π", bigcap: "⋂", cap: "∩", cup: "∪", subseteq: "⊆", sim: "∼",
  mid: "|", in: "∈", dots: "…", ldots: "…", cdots: "⋯", approx: "≈", ll: "≪", gg: "≫", emptyset: "∅", Pr: "Pr", ln: "ln", log: "log", exp: "exp", max: "max", min: "min", "|": "‖", "{": "{", "}": "}", ",": " ", ";": " ", "!": "", quad: "  ", qquad: "    ", " ": " ", partial: "∂" };
const SUPS = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", "−": "⁻", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", k: "ᵏ", t: "ᵗ", r: "ʳ", d: "ᵈ", m: "ᵐ" };
const SUBS = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "-": "₋", i: "ᵢ", j: "ⱼ", k: "ₖ", n: "ₙ", e: "ₑ", m: "ₘ", t: "ₜ", r: "ᵣ", s: "ₛ", p: "ₚ", x: "ₓ" };
/* A term set off as one unit: brackets once it is longer than one character, as in (n−1)/2 or √(2k). */
const unit = (t) => (t.length > 1 ? `(${t})` : t);
function texToText(src) {
  let s = String(src);
  const group = (str, i) => { if (str[i] !== "{") return [str[i] || "", i + 1]; let d = 0, j = i; for (; j < str.length; j++) { if (str[j] === "{") d++; else if (str[j] === "}") { d--; if (!d) break; } } return [str.slice(i + 1, j), j + 1]; };
  const arg = (str, i) => { while (str[i] === " ") i++; if (str[i] === "\\") { const m = /^\\[A-Za-z]+/.exec(str.slice(i)); if (m) return [m[0], i + m[0].length]; } return group(str, i); };
  let out = "", i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)), name = m[1]; i += m[0].length;
      if (name === "frac" || name === "tfrac" || name === "dfrac") { const [a, j] = arg(s, i); const [b, k] = arg(s, j); i = k; const ta = texToText(a), tb = texToText(b); if (ta === "1" && tb === "2") out += "½"; else out += unit(ta) + "/" + unit(tb); continue; }
      if (name === "binom") { const [a, j] = arg(s, i); const [b, k] = arg(s, j); i = k; out += `C(${texToText(a)},${texToText(b)})`; continue; }
      if (name === "sqrt") { const [a, j] = arg(s, i); i = j; out += "√" + unit(texToText(a)); continue; }
      if (name === "rm") continue;
      if (name === "text") { const [a, j] = arg(s, i); i = j; out += a; continue; }
      if (["operatorname", "mathrm", "boxed", "mathbb", "mathcal"].includes(name)) { const [a, j] = arg(s, i); i = j; out += texToText(a); continue; }
      if (name === "mathbf") { const [a, j] = arg(s, i); i = j; out += a.trim() === "1" ? "𝟙" : texToText(a); continue; }
      if (name === "overline" || name === "bar" || name === "hat") { const [a, j] = arg(s, i); i = j; out += texToText(a) + (name === "hat" ? "̂" : "̄"); continue; }
      if (["left", "right", "big", "Big", "bigg", "Bigg"].includes(name)) continue;
      if (GREEK[name]) { out += GREEK[name]; continue; }
      if (name in SYMBOLS) { out += SYMBOLS[name]; continue; }
      out += name; continue;
    }
    if (c === "^" || c === "_") {
      const [a, j] = arg(s, i + 1); i = j; const t = texToText(a), map = c === "^" ? SUPS : SUBS;
      out += [...t].every((ch) => map[ch]) ? [...t].map((ch) => map[ch]).join("") : c + unit(t); continue;
    }
    if (c === "{" || c === "}") { i++; continue; }
    out += c; i++;
  }
  return out.replace(/\s{2,}/g, " ").replace(/(\S)-(\S)/g, "$1−$2").trim();
}
const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* A small Markdown renderer for the frames this atlas writes: paragraphs, lists, tables, $…$ and $$…$$, bold, reveal steps. */
function renderMarkdown(md, upToStep = Infinity) {
  const parts = String(md).replace(/<!--[\s\S]*?-->/g, "").split(/\n\s*\.\s\.\s\.\s*\n/), html = [];
  const inline = (t) => escapeHtml(t).replace(/\$([^$]+)\$/g, (_, x) => `<span class="m">${escapeHtml(texToText(x.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")))}</span>`).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  parts.forEach((part, step) => {
    const hidden = step > upToStep, blocks = part.trim().split(/\n{2,}/);
    for (const b of blocks) {
      let h;
      if (/^\$\$[\s\S]*\$\$$/.test(b.trim())) h = `<div class="mdisp">${escapeHtml(texToText(b.trim().slice(2, -2)))}</div>`;
      else if (/^\|/.test(b.trim())) {
        const rows = b.trim().split("\n").filter((r) => !/^\|\s*-/.test(r)).map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        h = `<table class="mdt"><thead><tr>${rows[0].map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      } else if (/^\s*[-\d]+[.)]?\s/.test(b) && b.split("\n").every((l) => /^\s*(-|\d+\.)\s/.test(l))) {
        const ordered = /^\s*\d/.test(b), items = b.split("\n").map((l) => `<li>${inline(l.replace(/^\s*(-|\d+\.)\s/, ""))}</li>`).join("");
        h = ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
      } else h = `<p>${inline(b.replace(/\n/g, " "))}</p>`;
      html.push(`<div class="step${hidden ? " later" : ""}" data-step="${step}">${h}</div>`);
    }
  });
  return html.join("");
}

/* ---------- search, comparison, recommender, indexes ---------- */

function searchEntries() {
  const out = [];
  for (const m of MODULES) out.push({ kind: "module", id: m.id, title: m.title, text: [m.title, m.short, m.archetype, m.intuition, m.problem, m.variable, m.boundTex, m.family].join(" ").toLowerCase(), built: true });
  for (const t of INVENTORY) out.push({ kind: "technique", id: t.id, title: t.title, text: [t.title, t.problem, t.visual, t.family].join(" ").toLowerCase(), built: !!t.module, module: t.module });
  return out;
}
function search(query, limit = 12) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return [];
  const entries = searchEntries(), score = new Map();
  const bump = (key, s) => score.set(key, (score.get(key) || 0) + s);
  for (const [alias, ids] of Object.entries(ALIASES)) if (alias.includes(q) || q.includes(alias)) ids.forEach((id, i) => bump(`technique:${id}`, 50 - i));
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  for (const e of entries) {
    const key = `${e.kind}:${e.id}`;
    if (e.title.toLowerCase().includes(q)) bump(key, 40);
    for (const w of words) if (e.text.includes(w)) bump(key, 5);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([key]) => entries.find((e) => `${e.kind}:${e.id}` === key)).filter(Boolean);
}
function compareRows(aId, bId) {
  const side = (id) => {
    const m = moduleById(id), t = techniqueById(id);
    if (m) return { title: m.title, built: true, intuition: m.intuition, controls: m.pattern.controls, inequality: texToText(m.boundTex), worksWhen: m.pattern.worksWhen, visual: m.pattern.visual, conclusion: m.pattern.conclusion, problem: m.archetype };
    if (t) { const host = t.module ? moduleById(t.module) : null; return { title: t.title, built: !!host, intuition: host ? `Shown inside the ${host.short} lab.` : "Not yet built in this release.", controls: "—", inequality: host ? texToText(host.boundTex) : "—", worksWhen: "—", visual: t.visual, conclusion: "—", problem: t.problem }; }
    return null;
  };
  return { a: side(aId), b: side(bId) };
}
const KEY_COMPARISONS = [["first-moment", "local-lemma"], ["first-moment", "second-moment"], ["chernoff", "martingale"], ["first-moment", "alterations"], ["local-lemma", "moser-tardos"], ["first-moment", "derandomization"], ["phase-transition", "quasirandom"], ["alterations", "nibble"], ["chernoff", "discrepancy"]];
const RECOMMENDER = {
  start: { q: "What are you trying to prove?", options: [["existence", "An object exists"], ["concentration", "A random quantity is concentrated"], ["rare", "A rare-event probability"], ["pseudo", "A deterministic object behaves randomly"], ["algorithm", "An algorithm finds the object"], ["sampling", "Tiny samples decide something global"]] },
  existence: { q: "Can the expected number of failures be made below 1?", why: "If E[#failures] < 1, some outcome has none: the first moment is the cheapest tool.", options: [["first-moment", "yes → first moment"], ["existence-2", "no"]] },
  "existence-2": { q: "Are failures mostly locally dependent (each depends on few others)?", why: "Then sparse dependence can replace a small total: the Local Lemma needs e·p·(d+1) ≤ 1, not Σp < 1.", options: [["local-lemma", "yes → Local Lemma"], ["existence-3", "no"]] },
  "existence-3": { q: "Can you randomly build something imperfect and repair it cheaply?", why: "If defects are few on average and each costs little to fix, alterations win.", options: [["alterations", "yes → alterations"], ["existence-4", "no"]] },
  "existence-4": { q: "Does existence need X > 0 although E[X] is large?", why: "A large mean is not enough; you must show E[X²] ≈ (E X)².", options: [["second-moment", "yes → second moment"], ["drc", "you need a dense structured subset → dependent random choice"]] },
  concentration: { q: "Is the quantity a sum of independent bounded pieces?", why: "Independence factorises the MGF and gives exponential tails.", options: [["chernoff", "yes → Chernoff"], ["concentration-2", "no, but one choice moves it a little"]] },
  "concentration-2": { q: "Does one coordinate move it by at most c?", why: "Then reveal the coordinates one by one: the Doob martingale has bounded steps.", options: [["martingale", "yes → martingale / Azuma"], ["discrepancy", "you need every set in a family balanced → discrepancy"]] },
  rare: { q: "Are the events rare, increasing, with small overlaps?", why: "Janson prices the overlaps through Δ; the count is then approximately Poisson.", options: [["janson", "yes → Janson / Poisson"], ["local-lemma", "only a lower bound on avoiding them is needed → Local Lemma"]] },
  pseudo: { q: "Does your proof use only a few statistics of randomness (edge distribution, eigenvalues)?", why: "Then any object passing those statistics can replace the random one.", options: [["quasirandom", "yes → quasirandomness"], ["phase-transition", "you study the random object itself → random graphs"]] },
  algorithm: { q: "Is your existence proof a Local Lemma or an expectation argument?", why: "Each has its own constructive counterpart.", options: [["moser-tardos", "Local Lemma → Moser–Tardos"], ["derandomization", "expectation → conditional expectation"], ["nibble", "iterated random choice → Rödl nibble"]] },
  sampling: { q: "Hit every large range, or test a property?", why: "Bounded VC dimension gives ε-nets; far-from-property gives many witnesses for testers.", options: [["epsilon-net", "hit ranges → ε-net / VC"], ["testing", "test a property → property testing"], ["entropy", "count a family → entropy"]] },
};
const PROBLEM_INDEX = [
  ["How can I prove an object exists?", ["first-moment", "alterations", "second-moment", "local-lemma"]],
  ["How do I show a random variable rarely deviates?", ["chernoff", "martingale", "talagrand", "kim-vu"]],
  ["How do I count rare structures?", ["janson", "brun-sieve"]],
  ["How do I iteratively build a near-perfect structure?", ["nibble"]],
  ["How do I replace randomness by deterministic pseudorandomness?", ["quasirandom", "k-wise-independence"]],
  ["How do I turn an existence proof into an algorithm?", ["moser-tardos", "derandomization"]],
  ["How can tiny random samples say something global?", ["epsilon-net", "testing", "vc-dimension"]],
  ["How can dense structure force common neighbourhoods?", ["drc"]],
];
const GALLERY = [
  ["Avoid every bad configuration", "First moment / Local Lemma", ["first-moment", "local-lemma"]],
  ["Prove something random is tightly concentrated", "Chernoff / martingales", ["chernoff", "martingale"]],
  ["Build almost right, then repair", "Alterations", ["alterations", "nibble"]],
  ["Count rare configurations", "Janson / Poisson", ["janson"]],
  ["Remove randomness from the proof", "Derandomisation", ["derandomization", "moser-tardos"]],
  ["Find random-like order", "Quasirandomness / phase transition", ["quasirandom", "phase-transition"]],
  ["Learn from tiny samples", "ε-nets / testing / entropy", ["epsilon-net", "testing", "entropy"]],
];

/* ---------- self-tests (also run by node --test) ---------- */

function selfTests() {
  const T = [], ok = (name, pass, detail = "") => T.push({ name, pass: !!pass, detail });
  ok("C(10,5) = 252", choose(10, 5) === 252);
  ok("C(n,k) = C(n,n−k)", choose(17, 4) === choose(17, 13));
  ok("binomial PMF sums to 1", Math.abs(Array.from({ length: 31 }, (_, k) => binomPmf(30, k, 0.3)).reduce((a, b) => a + b, 0) - 1) < 1e-12);
  ok("Poisson PMF sums to 1", Math.abs(Array.from({ length: 60 }, (_, k) => poissonPmf(3.2, k)).reduce((a, b) => a + b, 0) - 1) < 1e-12);
  ok("Chernoff bound exceeds the exact tail", (() => { for (const d of [0.2, 0.5, 1, 2]) if (binomUpperTail(200, (1 + d) * 20, 0.1) > chernoffUpper(20, d)) return false; return true; })());
  ok("the same seed gives the same graph", JSON.stringify(gnp(8, 0.5, rng(17, "x")).edges) === JSON.stringify(gnp(8, 0.5, rng(17, "x")).edges));
  for (const mod of MODULES) {
    const E = evaluate(mod, defaults(mod));
    ok(`${mod.id}: analysis is finite`, E.A.rows.every((r) => r[1] !== "NaN"));
    ok(`${mod.id}: deck parses into the four standard sections`, (() => { try { const md = techniqueDeck(E); return /voice: bf_emma/.test(md) && (md.match(/^# /gm) || []).length === 4; } catch (e) { return false; } })());
  }
  const fm = moduleById("first-moment"), Pf = { ...defaults(fm), n: 8, k: 4 }, Af = fm.analyse(Pf);
  ok("first moment: E[X] = sum of the indicator expectations", Math.abs(subsets(8, 4).length * 2 ** (1 - 6) - Af.EX) < 1e-12);
  const ll = moduleById("local-lemma"), El = evaluate(ll, defaults(ll));
  ok("Local Lemma: displayed d = actual maximum dependency degree", El.A.d === Math.max(...dependencyDegrees(El.F.edges)));
  ok("conditional expectation: each node is the average of its children", (() => { const G = gnp(9, 0.5, rng(3, "t")), a = new Array(9).fill(-1); a[0] = 1; const p = condExpCut(G, a); a[1] = 0; const x = condExpCut(G, a); a[1] = 1; const y = condExpCut(G, a); return Math.abs(p - (x + y) / 2) < 1e-12; })());
  return T;
}

Object.assign(PM, {
  URL_BASE, DEFAULT_SEED, COURSE, COURSE_STAGES, moduleById, moduleByRoute, techniqueById, defaults, withParams, coerceParam, evaluate, parseHash, stateHash,
  trialValue, runTrials, histogram, summarise, techniqueReport, techniqueDeck, deckFrames, slideMarkdown, courseDeck, switchSequence, focusLabel,
  texToText, renderMarkdown, escapeHtml, search, compareRows, KEY_COMPARISONS, RECOMMENDER, PROBLEM_INDEX, GALLERY, selfTests,
});
self.PM = PM;
