/* Theorem Explorer: which result to learn next: the domain model.
 *
 * FIELDS is the semantic state: the view, the rubric weights, the catalog filters and sort, the learning profile
 * fields and the history options. The URL, the view JSON and the exports share it. The reader's known results are
 * the one part of the profile that is not in the state (the list can be long): the page keeps them in local
 * storage and passes them to derive() as data.profile.known, so the same state and profile always give the same
 * values.
 *
 * raw.json holds the snapshot metadata, the rubric, the taxonomy, the comparison cases, the source manifest, the
 * coverage report and two gzip packs (spec section 11.3, lazy decoding): `core` (every named record with its
 * scores, measurements and indices, the use records, the paper activity and the relations) and `detail` (the
 * statements, explanations and evidence records). derive() reads only the core pack. In node the packs decode
 * with zlib; in the browser src/view.js decodes them with DecompressionStream and primes the cache with prime().
 *
 * Scores are 7-character strings in the order eff, res, pra, rea, hyp, pro, app: '0'-'4', 'u' (unknown) or 'n'
 * (not applicable). An unknown or not-applicable component with a weight above 0 makes the aggregate unknown; the
 * interval puts 0 and 4 in for it (spec section 7.4). It touches no DOM, so node tests run it.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Model = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const SLUG = "theorem-explorer";
  const SCHEMA_VERSION = 1;
  const PROFILE_SCHEMA = "te-profile/1";
  const EXPORT_SCHEMA = "te-export/1";
  const LEARN_RULE = "te-learn/1";

  const COMPONENTS = ["eff", "res", "pra", "rea", "hyp", "pro", "app"];
  const COMPONENT_NAMES = ["Effectiveness", "Research influence", "Practical impact", "Reach", "Low hypothesis burden", "Proof simplicity", "Application simplicity"];
  const PRESETS = { balanced: [25, 25, 20, 15, 5, 5, 5], practitioner: [25, 10, 35, 15, 5, 2, 8], researcher: [25, 35, 10, 15, 5, 7, 3] };
  const LEVELS = ["school", "undergrad", "graduate", "research"];
  const LEVEL_NAMES = ["school", "undergraduate", "graduate", "research"];
  const DEPTHS = ["understand", "apply", "prove"];
  const BANDS = ["under 1 hour", "hours", "days", "weeks", "months"];
  const RESULT_TYPES = ["theorem", "lemma", "inequality", "identity", "principle", "formula", "criterion", "conjecture-proved", "construction", "classification", "other-result"];
  const VIEWS = ["learn", "catalog", "compare", "connections", "fields", "about"];
  const CASES = ["tail-binomial", "existence-ksat", "union-three", "euler-genus-two"];
  const SOURCES = ["any", "mathlib", "wikidata", "wikipedia", "nlab", "theoremsearch", "theoremgraph", "freek100", "overview", "undergrad", "curated"];
  const SORTS = ["score", "learn", "lo", "hi", "name", ...COMPONENTS, "level", "statement", "proof", "dependents", "uses", "year"];
  const COLUMNS = ["type", "score", "interval", ...COMPONENTS, "conf", "formal", "level", "effort", "statement", "proof", "dependents", "uses", "year", "fields"];
  const DEFAULT_COLUMNS = "type,score,interval,eff,res,pra,rea,hyp,pro,app,conf,formal,level";
  const NO_YEAR = 2100;

  /** The learning weights of spec section 9.3. */
  const LEARN_WEIGHTS = { value: 0.35, relevance: 0.25, accessibility: 0.15, future_access: 0.15, effort_fit: 0.1 };

  /** The published learning rules (spec section 9.3): matching, effort bands, weights and missing data. */
  const LEARN_RULES = {
    version: LEARN_RULE,
    weights: LEARN_WEIGHTS,
    formula: "learning_priority = 100 * (0.35 value + 0.25 relevance + 0.15 accessibility + 0.15 future_access + 0.10 effort_fit)",
    value: "The aggregate score under the selected weights, divided by 100. If the aggregate is unknown, value is the score interval divided by 100.",
    relevance: "With no interests (the baseline profile), relevance is 1 for every result. Otherwise it is the best match between the interests and the result's theorem and application categories: the same category 1, the same archive 0.5, the same group 0.25, else 0. An interest that names an archive or a group matches every category in it with 1. A result with no category has unknown relevance (0 to 1).",
    accessibility: "The fraction of the result's prerequisite results that the reader marks as known (at any depth). A result with no recorded prerequisite result has accessibility 1. Prerequisite concepts that are not catalog results are shown, but not counted.",
    future_access: "For each result that the reader does not know, if exactly one of its prerequisite results is unknown, that prerequisite gains the later result's relevance (unknown relevance counts 0). The total is divided by the largest total in the catalog. 0 when no result gains anything.",
    effort_fit: "The judged effort band at the selected depth goes up by one band for each reader level that the result needs above the selected reader level (maximum band 5). Fit is 1 when the band is at most the study budget, else 1 - 0.5 x (band - budget), not below 0. The band x (the depth does not apply) gives an unknown fit.",
    bands: "1 under 1 hour, 2 hours, 3 days, 4 weeks, 5 months: judged bands for a reader at the result's needed level, not measured study times.",
    missing: "An unknown component makes the priority incomplete. The page shows its interval (the unknown components at 0 and at 1) and sorts it by the lower end.",
    known: "A result known at the selected depth or deeper is not recommended. A result known only at a lower depth stays, so a reader can study it more deeply.",
    paths: "A prerequisite path follows the judged prerequisite edges back from the selected result and stops at known results. An edge is supported when an extracted formal reference joins the same two results, else it is a judged (uncertain) edge. A cycle is reported, never broken silently. A path is not a guaranteed curriculum and gives no minimum study time.",
  };

  /** How a relation reads from its source (out) and from its target (in), spec section 4.3. */
  const REL_PHRASES = {
    "proof-dependency": ["uses in its formal proof", "is used in the formal proof of"],
    "signature-reference": ["uses in its formal statement", "is used in the formal statement of"],
    prerequisite: ["needs first", "is a prerequisite of"],
    "special-case": ["is a special case of", "has as a special case"],
    generalization: ["generalizes", "is generalized by"],
    consequence: ["is a consequence of", "has as a consequence"],
    equivalent: ["is equivalent to", "is equivalent to"],
    "similar-problem": ["addresses a similar problem to", "addresses a similar problem to"],
    "research-influence": ["influenced", "was influenced by"],
    "shared-application": ["is applied in the same paper as", "is applied in the same paper as"],
    "documentation-link": ["links (nLab) to", "is linked (nLab) from"],
    "candidate-identity": ["is possibly the same result as", "is possibly the same result as"],
  };
  const REL_ORDER = Object.keys(REL_PHRASES);

  const SEARCH_HELP = "Search is offline substring matching. Each word must occur in the result's name, aliases, identifier, key concepts, Lean declaration, type or category names. There is no semantic or problem-description search: no local model and no remote API.";

  /** @param {string} key @param {string} label @param {string[]} values @param {string} def @returns {KitField} */
  const en = (key, label, values, def) => ({ type: "enum", label, values, default: def });
  /** @param {string} label @param {number} def @param {number} min @param {number} max @returns {KitField} */
  const int = (label, def, min, max) => ({ type: "integer", label, default: def, min, max, step: 1 });
  /** @param {string} label @param {string} def @returns {KitField} */
  const str = (label, def = "") => ({ type: "string", label, default: def });

  /** @type {Record<string, KitField>} */
  const FIELDS = {
    view: en("view", "View", VIEWS, "learn"),
    preset: en("preset", "Weights", ["balanced", "practitioner", "researcher", "custom"], "balanced"),
    w_eff: int("Custom weight: effectiveness", 25, 0, 100),
    w_res: int("Custom weight: research influence", 25, 0, 100),
    w_pra: int("Custom weight: practical impact", 20, 0, 100),
    w_rea: int("Custom weight: reach", 15, 0, 100),
    w_hyp: int("Custom weight: low hypothesis burden", 5, 0, 100),
    w_pro: int("Custom weight: proof simplicity", 5, 0, 100),
    w_app: int("Custom weight: application simplicity", 5, 0, 100),
    q: str("Search"),
    sort: en("sort", "Sort by", SORTS, "score"),
    dir: en("dir", "Sort direction", ["desc", "asc"], "desc"),
    rtype: en("rtype", "Result type", ["results", "all", ...RESULT_TYPES, "non-results", "unscored"], "results"),
    grp: str("arXiv group"),
    arch: str("arXiv archive"),
    cat: str("arXiv category"),
    acat: str("Application category"),
    level: en("level", "Needed reader level at most", ["any", ...LEVELS], "any"),
    formal: en("formal", "Formalization", ["any", "formal", "informal"], "any"),
    source: en("source", "Source", SOURCES, "any"),
    ev: en("ev", "Evidence completeness", ["any", "thin", "partial", "broad"], "any"),
    cons: en("cons", "Assessment consistency", ["any", "single", "consistent", "disagreement"], "any"),
    min_hyp: int("Low hypothesis burden at least", 0, 0, 4),
    min_pro: int("Proof simplicity at least", 0, 0, 4),
    min_app: int("Application simplicity at least", 0, 0, 4),
    y0: int("From year (0: no limit)", 0, 0, NO_YEAR),
    y1: int("To year (2100: no limit)", NO_YEAR, 0, NO_YEAR),
    incase: en("incase", "Comparison case", ["any", ...CASES], "any"),
    known: en("known", "Known-result status", ["any", "known", "unknown"], "any"),
    cols: str("Visible columns", DEFAULT_COLUMNS),
    sel: str("Selected result"),
    pins: str("Pinned results"),
    depth: en("depth", "Learning depth", DEPTHS, "understand"),
    reader: en("reader", "Reader level", LEVELS, "undergrad"),
    budget: int("Study budget (effort band)", 3, 1, 5),
    interests: str("Interests (arXiv ids)"),
    cmp: en("cmp", "Comparison case", CASES, "tail-binomial"),
    fview: en("fview", "History", ["application", "influence", "activity", "utility", "formal", "capability", "assessment"], "application"),
    fby: en("fby", "Categories", ["theorem", "application"], "theorem"),
    flevel: en("flevel", "Taxonomy level", ["group", "archive", "category"], "group"),
    mode: en("mode", "Evidence mode", ["historical", "retrospective"], "historical"),
  };

  /** Named states with stable ids. @type {KitExample[]} */
  const EXAMPLES = [
    { id: "calibration", label: "Calibration cases, Researcher weights", state: { view: "catalog", preset: "researcher", rtype: "all", pins: "nm:union-bound,nm:pigeonhole-principle,wd:Q4975963,wd:Q755991", sel: "wd:Q4975963" } },
    { id: "tail-bounds", label: "Tail bounds for 100 coin flips", state: { view: "compare", cmp: "tail-binomial" } },
    { id: "local-lemma", label: "Union bound against the local lemma", state: { view: "compare", cmp: "existence-ksat", preset: "practitioner" } },
    { id: "learn-probability", label: "Learn next: probability, apply depth", state: { view: "learn", interests: "math.PR,stat", depth: "apply", budget: 2 } },
    { id: "azuma-path", label: "Prerequisite path to the Azuma-Hoeffding inequality", state: { view: "connections", sel: "nm:azuma-hoeffding-inequality", depth: "apply" } },
    { id: "atiyah-singer", label: "The Atiyah-Singer index theorem and its relations", state: { view: "connections", sel: "wd:Q755991", reader: "graduate" } },
    { id: "applied-fields", label: "Applications by application category", state: { view: "fields", fby: "application", flevel: "archive" } },
    { id: "no-simplicity", label: "Custom weights without the simplicity components", state: { view: "catalog", preset: "custom", w_eff: 30, w_res: 25, w_pra: 25, w_rea: 20, w_hyp: 0, w_pro: 0, w_app: 0 } },
    { id: "sources", label: "Sources, coverage and rubric", state: { view: "about" } },
  ];

  /* ---------- packs ---------- */

  const cache = new WeakMap();
  /** @param {any} data */
  function slot(data) {
    let s = cache.get(data);
    if (!s) cache.set(data, (s = {}));
    return s;
  }

  /** Put a decoded pack in the cache (the browser decodes asynchronously). @param {any} data @param {string} name @param {any} value */
  function prime(data, name, value) { slot(data)[name] = value; }

  /** A decoded pack: from the cache, else with zlib in node, else null (the browser has not decoded it yet).
   * @param {any} data @param {string} name */
  function pack(data, name) {
    const s = slot(data);
    if (s[name] !== undefined) return s[name];
    const p = data.packs?.[name];
    if (!p) return (s[name] = null);
    if (typeof require !== "function") return null;
    // eslint-disable-next-line no-undef
    const zlib = require("node:zlib");
    s[name] = JSON.parse(zlib.gunzipSync(Buffer.from(p.gz, "base64")).toString("utf8"));
    return s[name];
  }

  /** The core pack (always present once the page has started). @param {any} data */
  const core = (data) => pack(data, "core");
  /** The detail rows, or null while the browser decodes them. @param {any} data */
  const detail = (data) => pack(data, "detail");

  /* ---------- indexes ---------- */

  /** @param {string} s @returns {number[]} -1 unknown, -2 not applicable */
  const parseScores = (s) => [...s].map((c) => (c === "u" ? -1 : c === "n" ? -2 : Number(c)));

  /** Indexes over the core pack, built once per dataset. @param {any} data */
  function index(data) {
    const s = slot(data);
    if (s.index) return s.index;
    const c = core(data);
    const tax = data.taxonomy;
    const archIdx = new Map(tax.archives.map((/** @type {any[]} */ a, /** @type {number} */ i) => [a[0], i]));
    const grpIdx = new Map(tax.groups.map((/** @type {any[]} */ g, /** @type {number} */ i) => [g[0], i]));
    const catIdx = new Map(tax.categories.map((/** @type {any[]} */ k, /** @type {number} */ i) => [k[0], i]));
    const catArch = tax.categories.map((/** @type {any[]} */ k) => archIdx.get(k[2]) ?? -1);
    const catGrp = tax.categories.map((/** @type {any[]} */ k) => grpIdx.get(k[3]) ?? -1);
    const archGrp = tax.archives.map((/** @type {any[]} */ a) => grpIdx.get(a[2]) ?? -1);
    const rows = c.rows;
    const byId = new Map(rows.map((/** @type {any} */ r, /** @type {number} */ i) => [r.id, i]));
    const scores = rows.map((/** @type {any} */ r) => parseScores(r.s));
    const scores2 = rows.map((/** @type {any} */ r) => (r.s2 ? parseScores(r.s2) : null));
    const isResult = rows.map((/** @type {any} */ r) => !r.t.startsWith("not-a-result"));
    const text = rows.map((/** @type {any} */ r) => [r.q, r.id.toLowerCase(), (r.decl ?? "").toLowerCase(), r.t,
      ...[...r.cat, ...r.acat].map((/** @type {number} */ k) => `${tax.categories[k][0]} ${tax.categories[k][1]}`.toLowerCase())].join(" "));
    // Prerequisite results (judged edges), without the result itself.
    const pre = rows.map((/** @type {any} */ r, /** @type {number} */ i) => [...new Set(r.pre)].filter((/** @type {number} */ j) => j !== i && j >= 0 && j < rows.length));
    // Pairs that an extracted formal reference joins: a prerequisite edge between them is supported.
    const formalPairs = new Set();
    /** @type {Map<number, any[]>} */
    const relBy = new Map();
    for (const rel of c.relations) {
      if (rel.type === "proof-dependency" || rel.type === "signature-reference") {
        formalPairs.add(`${rel.source}>${rel.target}`);
        formalPairs.add(`${rel.target}>${rel.source}`);
      }
      for (const end of [rel.source, rel.target]) {
        if (!relBy.has(end)) relBy.set(end, []);
        /** @type {any[]} */ (relBy.get(end)).push(rel);
      }
    }
    const cycleOf = new Map();
    c.cycles.forEach((/** @type {number[]} */ cyc, /** @type {number} */ k) => { for (const i of cyc) cycleOf.set(i, k); });
    const cases = new Map(data.cases.cases.map((/** @type {any} */ k) => [k.id, new Set(k.entries.map((/** @type {any} */ e) => e.result))]));
    s.index = { rows, byId, scores, scores2, isResult, text, pre, formalPairs, relBy, cycleOf, catIdx, archIdx, grpIdx, catArch, catGrp, archGrp, cases };
    return s.index;
  }

  /* ---------- scores ---------- */

  /** The active weights in component order. @param {Record<string, any>} state @returns {number[]} */
  function weightsOf(state) {
    if (state.preset === "custom") return COMPONENTS.map((k) => state[`w_${k}`]);
    return PRESETS[/** @type {"balanced"} */ (state.preset)] ?? PRESETS.balanced;
  }

  /**
   * The aggregate of one score vector: overall = sum(w_i r_i / 4) when every weighted component is known, else
   * null, with the interval that 0 and 4 give for the missing components. A weight of 0 excludes its component.
   * @param {number[]} sc @param {number[]} w
   */
  function aggregate(sc, w) {
    let lo = 0, hi = 0;
    /** @type {string[]} */
    const missing = [];
    for (let i = 0; i < 7; i++) {
      if (!w[i]) continue;
      if (sc[i] >= 0) {
        lo += (w[i] * sc[i]) / 4;
        hi += (w[i] * sc[i]) / 4;
      } else {
        hi += w[i];
        missing.push(`${COMPONENTS[i]} ${sc[i] === -1 ? "u" : "na"}`);
      }
    }
    lo = round(lo, 4);
    hi = round(hi, 4);
    return { v: missing.length ? null : lo, lo, hi, missing };
  }

  /** @param {number} x @param {number} d */
  const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

  /** The consistency of the two assessments of a record (spec section 7.5). @param {any} ix @param {number} i */
  function consistency(ix, i) {
    const a = ix.scores[i], b = ix.scores2[i];
    if (!b) return "single";
    let worst = 0;
    for (let k = 0; k < 7; k++) {
      if ((a[k] < 0) !== (b[k] < 0)) worst = Math.max(worst, 2);
      else if (a[k] >= 0) worst = Math.max(worst, Math.abs(a[k] - b[k]));
    }
    const va = aggregate(a, PRESETS.balanced).v, vb = aggregate(b, PRESETS.balanced).v;
    if (worst >= 2 || (va !== null && vb !== null && Math.abs(va - vb) > 5)) return "disagreement";
    return "consistent";
  }

  /** @param {number} x */
  const scoreText = (x) => (x < 0 ? (x === -1 ? "u" : "na") : String(x));

  /* ---------- profile and interests ---------- */

  /** The known results of the profile: id -> the deepest known depth index. @param {any} data @returns {Record<string, number>} */
  const knownOf = (data) => data.profile?.known ?? {};

  /** @param {string} list @returns {string[]} */
  const splitList = (list) => [...new Set(String(list ?? "").split(",").map((x) => x.trim()).filter(Boolean))];

  /** Interests resolved against the pinned taxonomy, aliases included. @param {any} data @param {string} list */
  function interestsOf(data, list) {
    const ix = index(data);
    /** @type {{ kind: string, idx: number, id: string }[]} */
    const ok = [];
    /** @type {string[]} */
    const unresolved = [];
    for (const raw of splitList(list)) {
      const id = data.taxonomy.aliases?.[raw] ?? raw;
      if (ix.catIdx.has(id)) ok.push({ kind: "cat", idx: ix.catIdx.get(id), id });
      else if (ix.archIdx.has(id) && !ix.grpIdx.has(id)) ok.push({ kind: "arch", idx: ix.archIdx.get(id), id });
      else if (ix.grpIdx.has(id)) ok.push({ kind: "grp", idx: ix.grpIdx.get(id), id });
      else unresolved.push(raw);
    }
    return { ok, unresolved };
  }

  /** Relevance of a record: 1 with no interests, null when it has no category. @param {any} ix @param {number} i @param {any[]} interests */
  function relevance(ix, i, interests) {
    if (!interests.length) return 1;
    const r = ix.rows[i];
    const cats = [...r.cat, ...r.acat];
    if (!cats.length) return null;
    let best = 0;
    for (const c of cats) {
      for (const it of interests) {
        let m = 0;
        if (it.kind === "cat") m = c === it.idx ? 1 : ix.catArch[c] === ix.catArch[it.idx] ? 0.5 : ix.catGrp[c] === ix.catGrp[it.idx] ? 0.25 : 0;
        else if (it.kind === "arch") m = ix.catArch[c] === it.idx ? 1 : ix.catGrp[c] === ix.archGrp[it.idx] ? 0.25 : 0;
        else m = ix.catGrp[c] === it.idx ? 1 : 0;
        if (m > best) best = m;
      }
    }
    return best;
  }

  /* ---------- filters ---------- */

  /** The active filters, with labels, for the chip list and the deck. @param {Record<string, any>} state */
  function activeFilters(state) {
    /** @type {{ key: string, label: string, value: string }[]} */
    const out = [];
    for (const key of ["q", "rtype", "grp", "arch", "cat", "acat", "level", "formal", "source", "ev", "cons", "min_hyp", "min_pro", "min_app", "y0", "y1", "incase", "known"]) {
      if (state[key] !== FIELDS[key].default) out.push({ key, label: FIELDS[key].label, value: String(state[key]) });
    }
    return out;
  }

  /** Does record i pass the filters? @param {Record<string, any>} state @param {any} ix @param {number} i @param {any} ctx */
  function passes(state, ix, i, ctx) {
    const r = ix.rows[i];
    const t = state.rtype;
    if (t === "results" && !ix.isResult[i]) return false;
    if (t === "non-results" && ix.isResult[i]) return false;
    if (RESULT_TYPES.includes(t) && r.t !== t) return false;
    if (t === "unscored" && ctx.agg[i].v !== null) return false;
    if (ctx.grp >= 0 && !r.cat.some((/** @type {number} */ c) => ix.catGrp[c] === ctx.grp)) return false;
    if (ctx.arch >= 0 && !r.cat.some((/** @type {number} */ c) => ix.catArch[c] === ctx.arch)) return false;
    if (ctx.cat >= 0 && !r.cat.includes(ctx.cat)) return false;
    if (ctx.acat >= 0 && !r.acat.includes(ctx.acat)) return false;
    if (state.level !== "any" && r.lv > LEVELS.indexOf(state.level)) return false;
    if (state.formal === "formal" && !r.f) return false;
    if (state.formal === "informal" && r.f) return false;
    if (state.source !== "any" && !sourceMatch(r, state.source)) return false;
    if (state.ev !== "any" && r.ev !== state.ev) return false;
    if (state.cons !== "any" && consistency(ix, i) !== state.cons) return false;
    const sc = ix.scores[i];
    if (state.min_hyp > 0 && !(sc[4] >= state.min_hyp)) return false;
    if (state.min_pro > 0 && !(sc[5] >= state.min_pro)) return false;
    if (state.min_app > 0 && !(sc[6] >= state.min_app)) return false;
    if ((state.y0 > 0 || state.y1 < NO_YEAR) && !(r.yr !== null && r.yr >= state.y0 && r.yr <= state.y1)) return false;
    if (state.incase !== "any" && !ix.cases.get(state.incase)?.has(r.id)) return false;
    if (state.known !== "any" && (r.id in ctx.known) !== (state.known === "known")) return false;
    if (ctx.words.length && !ctx.words.every((/** @type {string} */ w) => ix.text[i].includes(w))) return false;
    return true;
  }

  /** @param {any} r @param {string} source */
  function sourceMatch(r, source) {
    if (source === "mathlib") return r.f === 1 || r.src.includes("docstring");
    if (source === "wikipedia") return r.evk.includes("wikipedia");
    if (source === "theoremsearch") return r.evk.includes("uses") || r.evk.includes("restatement");
    if (source === "theoremgraph") return r.evk.includes("theoremgraph");
    return r.src.includes(source);
  }

  /** A sort key of record i. @param {string} sort @param {any} ix @param {number} i @param {any} ctx */
  function sortKey(sort, ix, i, ctx) {
    const r = ix.rows[i];
    const a = ctx.agg[i];
    switch (sort) {
      case "score": return a.v;
      case "lo": return a.lo;
      case "hi": return a.hi;
      case "learn": return ctx.learn.get(i)?.key ?? null;
      case "level": return r.lv;
      case "statement": return r.st;
      case "proof": return r.sp;
      case "dependents": return r.dep;
      case "uses": return r.ua + r.ui;
      case "year": return r.yr;
      default: {
        const k = COMPONENTS.indexOf(sort);
        return k >= 0 && ix.scores[i][k] >= 0 ? ix.scores[i][k] : null;
      }
    }
  }

  /* ---------- learning ---------- */

  /**
   * Learning priority for every candidate record (spec section 9.3). Each component is an interval [lo, hi] on
   * 0..1; the priority is complete when every interval is a point.
   * @param {Record<string, any>} state @param {any} data @param {any} ix @param {any[]} agg
   */
  function learning(state, data, ix, agg) {
    const known = knownOf(data);
    const depth = DEPTHS.indexOf(state.depth);
    const reader = LEVELS.indexOf(state.reader);
    const { ok: interests, unresolved } = interestsOf(data, state.interests);
    const n = ix.rows.length;
    const rel = ix.rows.map((/** @type {any} */ _, /** @type {number} */ i) => relevance(ix, i, interests));
    const isKnown = (/** @type {number} */ j) => ix.rows[j].id in known;
    // future_access: a later result whose only unknown prerequisite is j gives j its relevance.
    const fa = new Float64Array(n);
    /** @type {number[][]} */
    const later = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      if (!ix.isResult[i] || isKnown(i)) continue;
      const missing = ix.pre[i].filter((/** @type {number} */ j) => !isKnown(j));
      if (missing.length !== 1) continue;
      fa[missing[0]] += rel[i] ?? 0;
      later[missing[0]].push(i);
    }
    const faMax = Math.max(0, ...fa);
    /** @type {Map<number, any>} */
    const out = new Map();
    let excludedKnown = 0;
    for (let i = 0; i < n; i++) {
      if (!ix.isResult[i]) continue;
      const r = ix.rows[i];
      if (r.id in known && known[r.id] >= depth) {
        excludedKnown++;
        continue;
      }
      const a = agg[i];
      const value = a.v !== null ? [a.v / 100, a.v / 100] : [a.lo / 100, a.hi / 100];
      const relevanceI = rel[i] === null ? [0, 1] : [rel[i], rel[i]];
      const pre = ix.pre[i];
      const acc = pre.length ? pre.filter(isKnown).length / pre.length : 1;
      const future = faMax > 0 ? fa[i] / faMax : 0;
      const band = r.ef[depth];
      let fit = /** @type {number[]} */ ([0, 1]);
      let shifted = null;
      if (band !== "x") {
        shifted = Math.min(5, Number(band) + Math.max(0, r.lv - reader));
        const f = shifted <= state.budget ? 1 : Math.max(0, 1 - 0.5 * (shifted - state.budget));
        fit = [f, f];
      }
      const comps = { value, relevance: relevanceI, accessibility: [acc, acc], future_access: [future, future], effort_fit: fit };
      let lo = 0, hi = 0;
      for (const [k, w] of Object.entries(LEARN_WEIGHTS)) {
        lo += w * comps[/** @type {"value"} */ (k)][0];
        hi += w * comps[/** @type {"value"} */ (k)][1];
      }
      lo = round(100 * lo, 2);
      hi = round(100 * hi, 2);
      const complete = lo === hi;
      out.set(i, { i, p: complete ? lo : null, lo, hi, key: lo, comps, band, shifted, later: later[i], missingPre: pre.filter((/** @type {number} */ j) => !isKnown(j)) });
    }
    return { out, interests, unresolved, excludedKnown, rel };
  }

  /** Round the components of a learning record for the derived values. @param {any} rec */
  function compsText(rec) {
    /** @type {Record<string, number[]>} */
    const out = {};
    for (const [k, v] of Object.entries(rec.comps)) out[k] = [round(/** @type {number[]} */ (v)[0], 3), round(/** @type {number[]} */ (v)[1], 3)];
    return out;
  }

  /* ---------- paths and connections ---------- */

  /**
   * The prerequisite path to record `target`: unknown ancestors in an order that puts each prerequisite before the
   * results that need it, with the cycles and the uncertain edges it meets.
   * @param {any} data @param {any} ix @param {number} target
   */
  function prerequisitePath(data, ix, target) {
    const known = knownOf(data);
    /** @type {number[]} */
    const order = [];
    const colour = new Map();
    /** @type {number[][]} */
    const cycles = [];
    /** @type {{ from: number, to: number, supported: boolean }[]} */
    const edges = [];
    /** @type {number[]} */
    const knownStops = [];
    /** @param {number} i @param {number[]} stack */
    function visit(i, stack) {
      colour.set(i, 1);
      for (const j of ix.pre[i]) {
        edges.push({ from: j, to: i, supported: ix.formalPairs.has(`${i}>${j}`) });
        if (ix.rows[j].id in known) {
          if (!knownStops.includes(j)) knownStops.push(j);
          continue;
        }
        const c = colour.get(j);
        if (c === 1) cycles.push([...stack.slice(stack.indexOf(j)), i].filter((x, k, a) => a.indexOf(x) === k));
        else if (c === undefined) visit(j, [...stack, i]);
      }
      colour.set(i, 2);
      order.push(i);
    }
    visit(target, []);
    return { order, cycles, edges, knownStops };
  }

  /** The relations of record i, grouped by type, each side named. @param {any} ix @param {number} i */
  function relationsOf(ix, i) {
    /** @type {Record<string, any[]>} */
    const groups = {};
    for (const rel of ix.relBy.get(i) ?? []) {
      const out = rel.source === i;
      const other = out ? rel.target : rel.source;
      (groups[rel.type] ??= []).push({ id: rel.id, dir: out ? "to" : "from", phrase: REL_PHRASES[/** @type {"prerequisite"} */ (rel.type)]?.[out ? 0 : 1] ?? rel.type, other: ix.rows[other].id, name: ix.rows[other].n, status: rel.status, evidence: rel.evidence, note: rel.note ?? null });
    }
    return groups;
  }

  /* ---------- comparison cases ---------- */

  /** @param {number} n @param {number} k */
  function logChoose(n, k) {
    let s = 0;
    for (let j = 1; j <= k; j++) s += Math.log(n - k + j) - Math.log(j);
    return s;
  }

  /** @param {number} x @param {number} [d] */
  const sig = (x, d = 4) => (Number.isInteger(x) ? String(x) : Number(x.toPrecision(d)).toString());

  /**
   * The formulas of the comparison cases (data/cases.json names them). Each returns the value and the calculation
   * with the inputs put in; tests/test_cases.py recalculates the same values independently.
   * @type {Record<string, { calc(v: any): number, steps(v: any): string, threshold?: { op: string, value: number } }>}
   */
  const CASE_FORMULAS = {
    markov: { calc: (v) => (v.n * v.p) / (v.n * v.p + v.t), steps: (v) => `${v.n * v.p} / ${v.n * v.p + v.t}` },
    chebyshev: { calc: (v) => (v.n * v.p * (1 - v.p)) / v.t ** 2, steps: (v) => `${sig(v.n * v.p * (1 - v.p))} / ${v.t}^2` },
    chernoff_kl: {
      calc: (v) => {
        const a = v.p + v.t / v.n;
        const kl = a * Math.log(a / v.p) + (1 - a) * Math.log((1 - a) / (1 - v.p));
        return Math.exp(-v.n * kl);
      },
      steps: (v) => {
        const a = v.p + v.t / v.n;
        const kl = a * Math.log(a / v.p) + (1 - a) * Math.log((1 - a) / (1 - v.p));
        return `D(${sig(a)} || ${v.p}) = ${sig(kl, 5)}; exp(-${v.n} x ${sig(kl, 5)})`;
      },
    },
    hoeffding: { calc: (v) => Math.exp((-2 * v.t ** 2) / v.n), steps: (v) => `exp(-2 x ${v.t}^2 / ${v.n}) = exp(-${sig((2 * v.t ** 2) / v.n)})` },
    azuma: {
      calc: (v) => Math.exp(-(v.t ** 2) / (2 * v.n * Math.max(v.p, 1 - v.p) ** 2)),
      steps: (v) => `c = ${Math.max(v.p, 1 - v.p)}; exp(-${v.t}^2 / (2 x ${v.n} x ${Math.max(v.p, 1 - v.p)}^2)) = exp(-${sig(v.t ** 2 / (2 * v.n * Math.max(v.p, 1 - v.p) ** 2))})`,
    },
    binomial_tail: {
      calc: (v) => {
        let s = 0;
        for (let k = Math.ceil(v.n * v.p + v.t); k <= v.n; k++) s += Math.exp(logChoose(v.n, k) + k * Math.log(v.p) + (v.n - k) * Math.log(1 - v.p));
        return s;
      },
      steps: (v) => `sum over k from ${Math.ceil(v.n * v.p + v.t)} to ${v.n} of C(${v.n}, k) ${v.p}^k ${sig(1 - v.p)}^(${v.n} - k)`,
    },
    union_condition: { calc: (v) => v.m * 2 ** -v.k, steps: (v) => `${v.m} x 2^-${v.k}`, threshold: { op: "<", value: 1 } },
    lll_symmetric: { calc: (v) => Math.E * 2 ** -v.k * (v.d + 1), steps: (v) => `e x 2^-${v.k} x (${v.d} + 1)`, threshold: { op: "<=", value: 1 } },
    union_sum3: { calc: (v) => v.a + v.b + v.c, steps: (v) => `${v.a} + ${v.b} + ${v.c}` },
    inclusion_exclusion3: {
      calc: (v) => v.a + v.b + v.c - v.ab - v.ac - v.bc + v.abc,
      steps: (v) => `${v.a} + ${v.b} + ${v.c} - ${v.ab} - ${v.ac} - ${v.bc} + ${v.abc}`,
    },
    gauss_bonnet: { calc: (v) => (v.K * v.area_over_pi) / 2, steps: (v) => `(${v.K}) x ${v.area_over_pi} pi / (2 pi)` },
  };

  /** One comparison case, calculated and ranked (spec section 6). @param {any} data @param {any} ix @param {string} id @param {number[]} w */
  function comparison(data, ix, id, w) {
    const k = data.cases.cases.find((/** @type {any} */ c) => c.id === id) ?? data.cases.cases[0];
    const dir = k.metric.direction;
    const entries = k.entries.map((/** @type {any} */ e) => {
      const i = ix.byId.get(e.result) ?? -1;
      const base = { result: e.result, i, name: i >= 0 ? ix.rows[i].n : e.result, score: i >= 0 ? aggregate(ix.scores[i], w) : null, year: e.date?.year ?? null, date: e.date?.basis ?? null, decl: e.decl ?? null, requires: e.requires ?? null, tex: e.tex ?? null };
      if (!e.formula) return { ...base, excluded: e.excluded, value: null, text: null, steps: null, meets: null };
      const f = CASE_FORMULAS[e.formula];
      const value = f.calc(k.inputs);
      const meets = f.threshold ? (f.threshold.op === "<" ? value < f.threshold.value : value <= f.threshold.value) : null;
      return { ...base, formula: e.formula, value: round(value, 10), text: sig(value), steps: f.steps(k.inputs), threshold: f.threshold ?? null, meets, excluded: null };
    });
    const ranked = entries.filter((/** @type {any} */ e) => e.value !== null);
    if (dir !== "none") {
      ranked.sort((/** @type {any} */ a, /** @type {any} */ b) => (dir === "lower" ? a.value - b.value : b.value - a.value) || a.name.localeCompare(b.name));
      // Equal values share a rank: no result dominates another with the same value.
      ranked.forEach((/** @type {any} */ e, /** @type {number} */ r) => { e.rank = r > 0 && ranked[r - 1].value === e.value ? ranked[r - 1].rank : r + 1; });
    }
    const values = new Set(ranked.map((/** @type {any} */ e) => e.value));
    const ref = k.reference ? { label: k.reference.label, value: round(CASE_FORMULAS[k.reference.formula].calc(k.inputs), 10), text: sig(CASE_FORMULAS[k.reference.formula].calc(k.inputs)), steps: CASE_FORMULAS[k.reference.formula].steps(k.inputs) } : null;
    return {
      id: k.id, title: k.title, goal: k.goal, question: k.question, inputs: k.input_text, hypotheses: k.hypotheses, target: k.target,
      metric: k.metric, cutoff: data.cases.cutoff, evaluated: data.cases.evaluated, entries, reference: ref,
      best: dir !== "none" && ranked.length ? ranked[0].result : null,
      dominance: dir === "none" || values.size <= 1 ? "none: the results give the same value or the metric has no direction" : "calculated: the rank follows the metric on these inputs only",
      note: k.note ?? null,
    };
  }

  /* ---------- histories ---------- */

  /**
   * The key index of category c at a taxonomy level. @param {any} ix @param {string} level @param {number} c
   */
  const keyAt = (ix, level, c) => (level === "category" ? c : level === "archive" ? ix.catArch[c] : ix.catGrp[c]);

  /** @param {any} data @param {string} level @param {number} k */
  function keyName(data, level, k) {
    if (k === -1) return "unclassified";
    const t = data.taxonomy;
    return level === "category" ? t.categories[k][0] : level === "archive" ? t.archives[k][0] : t.groups[k][0];
  }

  /**
   * Fractional field counts per year. Each record adds 1/k to each of its k unique canonical categories, then the
   * fractions add up through the hierarchy, so a record has weight 1 at every level (spec section 10.2).
   * @param {any} data @param {any} ix @param {string} level @param {[number, number[], number][]} records [year, categories, weight]
   * @param {number[]} years
   */
  function series(data, ix, level, records, years) {
    /** @type {Map<number, Map<number, number>>} */
    const table = new Map(years.map((y) => [y, new Map()]));
    for (const [year, cats, weight] of records) {
      const row = table.get(year);
      if (!row) continue;
      const unique = [...new Set(cats)];
      if (!unique.length) {
        row.set(-1, (row.get(-1) ?? 0) + weight);
        continue;
      }
      for (const c of unique) {
        const key = keyAt(ix, level, c);
        row.set(key, (row.get(key) ?? 0) + weight / unique.length);
      }
    }
    return shape(data, level, table, years);
  }

  /** Top keys, "other" and "unclassified", shares with no data where the total is 0. @param {any} data @param {string} level @param {Map<number, Map<number, number>>} table @param {number[]} years */
  function shape(data, level, table, years) {
    /** @type {Map<number, number>} */
    const totals = new Map();
    for (const row of table.values()) for (const [k, v] of row) if (k !== -1) totals.set(k, (totals.get(k) ?? 0) + v);
    const top = [...totals].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 8).map(([k]) => k);
    const keys = [...top.map((k) => keyName(data, level, k)), "other", "unclassified"];
    const counts = years.map((y) => {
      const row = /** @type {Map<number, number>} */ (table.get(y));
      const cells = top.map((k) => row.get(k) ?? 0);
      let other = 0;
      for (const [k, v] of row) if (k !== -1 && !top.includes(k)) other += v;
      return [...cells, other, row.get(-1) ?? 0].map((v) => round(v, 4));
    });
    const total = counts.map((c) => round(c.reduce((s, v) => s + v, 0), 4));
    const shares = counts.map((c, j) => (total[j] > 0 ? c.map((v) => round((100 * v) / total[j], 2)) : null));
    return { years, keys, counts, total, shares };
  }

  /** The history that the state selects (spec section 10). @param {Record<string, any>} state @param {any} data @param {any} ix @param {any[]} agg */
  function history(state, data, ix, agg) {
    const c = core(data);
    const cutoffYear = Number(String(data.snapshot.evidence_cutoff).slice(0, 4));
    const allYears = [...c.uses.map((/** @type {any[]} */ u) => u[1]), ...Object.keys(c.activity).map(Number)].filter((y) => y !== null);
    const first = Math.max(state.y0 || 0, Math.min(...allYears));
    const last = Math.min(state.y1, cutoffYear);
    const years = [];
    for (let y = first; y <= last; y++) years.push(y);
    const level = state.flevel;
    const basis = state.mode === "historical"
      ? "Historical mode: each year counts only use records whose source document has that publication year or earlier. The use classification and the categories come from the current snapshot (the only one); no later document enters an earlier year."
      : "Retrospective mode: current evidence about past results. The current scores and classifications apply to every year.";
    const tags = state.fby === "theorem"
      ? "Theorem categories: inferred by the judge for each result (inferred theorem tags)."
      : "Application categories: the arXiv categories of the paper that holds the use passage (original paper tags).";
    const undated = c.uses.filter((/** @type {any[]} */ u) => u[1] === null).length;
    const f = state.fview;
    if (f === "application" || f === "influence" || f === "utility") {
      const want = f === "application" ? [0] : f === "influence" ? [1] : [0, 1];
      /** @type {[number, number[], number][]} */
      const recs = [];
      let excluded = 0;
      for (const u of c.uses) {
        if (!want.includes(u[2]) || u[1] === null) continue;
        let weight = 1;
        if (f === "utility") {
          const v = agg[u[0]].v;
          if (state.mode === "historical" || v === null) { excluded++; continue; }
          weight = v / 100;
        }
        recs.push([u[1], state.fby === "theorem" ? ix.rows[u[0]].cat : u[3], weight]);
      }
      const s = series(data, ix, level, recs, years);
      const label = f === "application" ? "Documented application share" : f === "influence" ? "Documented research-influence share" : "Utility-weighted share (experimental)";
      const unit = f === "utility" ? "use records weighted by the aggregate score / 100 under the selected weights" : "use records (one result, one paper, one use type), 1/k to each of k categories";
      const note = f === "utility" && state.mode === "historical"
        ? "No data in historical mode: the snapshot has no reconstructed evidence set, so past scores are unknown. Switch to retrospective mode to weight past uses with current scores."
        : f === "utility" ? `Experimental. ${excluded} use records have an unknown aggregate score and are left out.` : null;
      return { view: f, label, unit, basis, tags, level, undated, ...s, note, records: recs.length };
    }
    if (f === "activity") {
      const table = new Map(years.map((y) => [y, new Map()]));
      for (const [y, cell] of Object.entries(c.activity)) {
        const row = table.get(Number(y));
        if (!row) continue;
        for (const [k, v] of Object.entries(/** @type {Record<string, number>} */ (cell))) {
          const key = Number(k) === -1 ? -1 : keyAt(ix, level, Number(k));
          row.set(key, (row.get(key) ?? 0) + v);
        }
      }
      return { view: f, label: "Research-activity share", unit: "papers in the TheoremSearch dataset, 1/k to each of their k listed arXiv categories (a separate denominator from theorem uses)", basis, tags: "Paper categories: the arXiv categories of each paper (source-assigned).", level, undated: data.coverage.uses["papers without year"] ?? 0, ...shape(data, level, table, years), note: null };
    }
    if (f === "formal") {
      /** @type {Map<number, number[]>} */
      const by = new Map();
      ix.rows.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
        if (!ix.isResult[i]) return;
        const unique = [...new Set(r.cat.map((/** @type {number} */ k) => keyAt(ix, level, k)))];
        const keys = unique.length ? unique : [-1];
        for (const k of keys) {
          const cell = by.get(k) ?? [0, 0, 0];
          cell[0] += 1 / keys.length;
          if (r.f) { cell[1] += 1 / keys.length; cell[2] += (r.dep ?? 0) / keys.length; }
          by.set(k, cell);
        }
      });
      const bars = [...by].map(([k, v]) => ({ key: keyName(data, level, k), results: round(v[0], 2), formal: round(v[1], 2), dependents: round(v[2], 2), share: v[0] ? round((100 * v[1]) / v[0], 1) : null }))
        .sort((a, b) => b.results - a.results || a.key.localeCompare(b.key));
      return { view: f, label: "Formal-library activity", unit: "named results with a linked mathlib declaration, and the direct dependents of those declarations in the pinned library", basis: `One snapshot (mathlib ${String(data.sources.mathlib.commit).slice(0, 12)}): no change series yet. A later snapshot adds the changes.`, tags, level, bars, note: "The snapshot has no formalization dates, so the view shows the current state, not a timeline." };
    }
    if (f === "capability") {
      const cmp = comparison(data, ix, state.cmp, weightsOf(state));
      const dir = cmp.metric.direction;
      const dated = cmp.entries.filter((/** @type {any} */ e) => e.value !== null && e.year !== null);
      const undatedEntries = cmp.entries.filter((/** @type {any} */ e) => e.value !== null && e.year === null).map((/** @type {any} */ e) => e.name);
      const steps = [];
      if (dir !== "none") {
        const ys = [...new Set(dated.map((/** @type {any} */ e) => e.year))].sort((a, b) => a - b);
        for (const y of ys) {
          const avail = dated.filter((/** @type {any} */ e) => e.year <= y);
          const best = avail.reduce((/** @type {any} */ b, /** @type {any} */ e) => (!b || (dir === "lower" ? e.value < b.value : e.value > b.value) ? e : b), null);
          steps.push({ year: y, value: best.value, text: best.text, by: best.name });
        }
      }
      return { view: f, label: `Capability: ${cmp.title}`, unit: cmp.metric.name, basis: "Each step uses only the results with a dated original publication by that year. The dates are judge-supplied citations, labelled in the case.", tags, level, steps, undatedEntries, direction: dir, note: dir === "none" ? "This case has no metric direction, so it has no capability curve." : null };
    }
    // assessment history
    const changes = [];
    for (let i = 0; i < ix.rows.length; i++) {
      const b = ix.scores2[i];
      if (!b) continue;
      const a = ix.scores[i];
      const diff = COMPONENTS.filter((_, k) => a[k] !== b[k]);
      changes.push({ id: ix.rows[i].id, name: ix.rows[i].n, first: ix.rows[i].s, second: ix.rows[i].s2, components: diff, consistency: consistency(ix, i) });
    }
    return { view: f, label: "Assessment history", unit: "recorded assessments", basis: `One snapshot (${data.snapshot.id}); previous snapshot: none. The second assessment of the same snapshot is the only recorded change.`, tags, level, changes, note: "Cause of each change: the second assessment re-read the same evidence (a judge change within one rubric version)." };
  }

  /* ---------- derive ---------- */

  /**
   * Every value the page shows, from the state, the dataset and the profile only.
   * @param {Record<string, any>} state @param {any} data
   */
  function derive(state, data) {
    const ix = index(data);
    const w = weightsOf(state);
    const sum = w.reduce((s, x) => s + x, 0);
    const weightsOk = sum === 100;
    /** @type {string[]} */
    const notes = [];
    if (!weightsOk) notes.push(`The custom weights add up to ${sum}, not 100. Every aggregate score is unknown until they add up to 100.`);
    const agg = ix.scores.map((/** @type {number[]} */ sc) => (weightsOk ? aggregate(sc, w) : { v: null, lo: 0, hi: 100, missing: ["weights"] }));
    const learn = learning(state, data, ix, agg);
    if (learn.unresolved.length) notes.push(`These interests are not arXiv ids of the pinned taxonomy and are ignored: ${learn.unresolved.join(", ")}.`);

    const tax = ix;
    const lookup = (/** @type {string} */ id, /** @type {Map<string, number>} */ m, /** @type {string} */ what) => {
      if (!id) return -1;
      const v = m.get(data.taxonomy.aliases?.[id] ?? id);
      if (v === undefined) { notes.push(`${what} "${id.slice(0, 40)}" is not in the pinned taxonomy, so the filter matches nothing.`); return -2; }
      return v;
    };
    const ctx = {
      agg, learn: learn.out, known: knownOf(data),
      grp: lookup(state.grp, tax.grpIdx, "The group"), arch: lookup(state.arch, tax.archIdx, "The archive"),
      cat: lookup(state.cat, tax.catIdx, "The category"), acat: lookup(state.acat, tax.catIdx, "The application category"),
      words: String(state.q).toLowerCase().split(/\s+/).filter(Boolean),
    };
    const order = [];
    for (let i = 0; i < ix.rows.length; i++) if (passes(state, ix, i, ctx)) order.push(i);
    const sign = state.dir === "asc" ? 1 : -1;
    const keys = new Map(order.map((i) => [i, sortKey(state.sort, ix, i, ctx)]));
    order.sort((a, b) => {
      const ka = keys.get(a), kb = keys.get(b);
      if (ka === null && kb !== null) return 1;
      if (kb === null && ka !== null) return -1;
      if (ka !== null && kb !== null && ka !== kb) return typeof ka === "string" ? sign * ka.localeCompare(kb) : sign * (ka - kb);
      // Ties: the upper end of the interval, then the name, so the order is total.
      return agg[b].hi - agg[a].hi || ix.rows[a].n.localeCompare(ix.rows[b].n) || a - b;
    });
    if (state.sort === "name") order.sort((a, b) => sign * ix.rows[a].n.localeCompare(ix.rows[b].n) || a - b);

    const knownMap = knownOf(data);
    const counts = {
      records: ix.rows.length,
      results: ix.isResult.filter(Boolean).length,
      shown: order.length,
      shownUnknown: order.filter((i) => agg[i].v === null).length,
      known: Object.keys(knownMap).filter((id) => ix.byId.has(id)).length,
      formalUnnamed: data.coverage.formal.unnamed_unscored,
    };

    // Learn next: the filtered results in priority order.
    const recIdx = order.filter((i) => learn.out.has(i)).sort((a, b) => learn.out.get(b).key - learn.out.get(a).key || learn.out.get(b).hi - learn.out.get(a).hi || ix.rows[a].n.localeCompare(ix.rows[b].n) || a - b);
    const recs = recIdx.slice(0, 25).map((i) => {
      const rec = learn.out.get(i);
      const r = ix.rows[i];
      return {
        i, id: r.id, name: r.n, type: r.t, p: rec.p, lo: rec.lo, hi: rec.hi, complete: rec.p !== null, comps: compsText(rec),
        score: agg[i].v, scoreLo: agg[i].lo, scoreHi: agg[i].hi, band: rec.band, shifted: rec.shifted, level: LEVELS[r.lv],
        missing: rec.missingPre.map((/** @type {number} */ j) => ({ id: ix.rows[j].id, name: ix.rows[j].n })),
        later: rec.later.slice(0, 6).map((/** @type {number} */ j) => ({ id: ix.rows[j].id, name: ix.rows[j].n })), laterCount: rec.later.length,
        knownDepth: r.id in knownMap ? DEPTHS[knownMap[r.id]] : null,
      };
    });

    // The selected result: the state's id, else the top recommendation, else the first row shown.
    let selIdx = state.sel ? ix.byId.get(migrate(data, state.sel)) ?? -1 : -1;
    if (state.sel && selIdx < 0) notes.push(`The result "${state.sel.slice(0, 60)}" is not in this snapshot.`);
    if (selIdx < 0) selIdx = recs[0]?.i ?? order[0] ?? 0;
    const selected = selectedOf(state, data, ix, agg, learn, selIdx);

    const pins = splitList(state.pins).map((id) => ({ id, i: ix.byId.get(migrate(data, id)) ?? -1 }));
    const unresolvedPins = pins.filter((p) => p.i < 0).map((p) => p.id);
    if (unresolvedPins.length) notes.push(`These pinned results are not in this snapshot: ${unresolvedPins.join(", ")}.`);
    const pinned = pins.filter((p) => p.i >= 0).map((p) => rowSummary(ix, agg, p.i));

    return {
      snapshot: data.snapshot.id,
      weights: w, weightSum: sum, weightsOk, preset: state.preset,
      excluded: COMPONENTS.filter((_, k) => w[k] === 0),
      filters: activeFilters(state),
      counts,
      order,
      learn: {
        baseline: !learn.interests.length, interests: learn.interests.map((x) => x.id), depth: state.depth, reader: state.reader, budget: state.budget,
        excludedKnown: learn.excludedKnown, candidates: recIdx.length, incomplete: recIdx.filter((i) => learn.out.get(i).p === null).length, recs,
      },
      selected,
      pinned,
      compare: comparison(data, ix, state.cmp, w),
      fields: history(state, data, ix, agg),
      sensitivity: sensitivity(ix, agg, w, weightsOk),
      notes,
    };
  }

  /** A result's identity in this snapshot, through the snapshot's identity map. @param {any} data @param {string} id */
  function migrate(data, id) {
    const m = (data.snapshot.identity_map ?? []).find((/** @type {any} */ e) => e.from === id);
    return m ? m.to : id;
  }

  /** @param {any} ix @param {any[]} agg @param {number} i */
  function rowSummary(ix, agg, i) {
    const r = ix.rows[i];
    return { i, id: r.id, name: r.n, type: r.t, scores: ix.scores[i].map(scoreText), score: agg[i].v, lo: agg[i].lo, hi: agg[i].hi, missing: agg[i].missing, conf: r.c, ev: r.ev, consistency: consistency(ix, i), level: LEVELS[r.lv], formal: Boolean(r.f), decl: r.decl, effort: r.ef };
  }

  /** @param {Record<string, any>} state @param {any} data @param {any} ix @param {any[]} agg @param {any} learn @param {number} i */
  function selectedOf(state, data, ix, agg, learn, i) {
    const r = ix.rows[i];
    const path = prerequisitePath(data, ix, i);
    const rels = relationsOf(ix, i);
    /** @type {Record<string, any>} */
    const relations = {};
    for (const [type, list] of Object.entries(rels)) relations[type] = { count: list.length, items: list.slice(0, 40) };
    const rec = learn.out.get(i);
    const tax = data.taxonomy;
    return {
      ...rowSummary(ix, agg, i),
      second: r.s2, conf2: r.c2,
      cats: r.cat.map((/** @type {number} */ k) => tax.categories[k][0]), acats: r.acat.map((/** @type {number} */ k) => tax.categories[k][0]),
      sources: r.src, evidenceKinds: r.evk,
      measures: { statement: r.st, statementBasis: r.stb, proof: r.sp, proofBasis: r.spb, proofTerm: r.pu, hypotheses: r.hy, dataArguments: r.nd, typeclasses: r.ncl, dependents: r.dep, axioms: r.ax, sorry: r.sorry ?? null },
      uses: { application: r.ua, influence: r.ui, restatements: r.rs, theoremgraph: r.tg }, year: r.yr,
      learning: rec ? { p: rec.p, lo: rec.lo, hi: rec.hi, comps: compsText(rec), band: rec.band, shifted: rec.shifted } : null,
      path: {
        steps: path.order.map((j) => ({ id: ix.rows[j].id, name: ix.rows[j].n, band: ix.rows[j].ef[DEPTHS.indexOf(state.depth)], level: LEVELS[ix.rows[j].lv], cycle: ix.cycleOf.has(j) })),
        cycles: path.cycles.map((c) => c.map((j) => ix.rows[j].id)),
        uncertain: path.edges.filter((e) => !e.supported).length, supported: path.edges.filter((e) => e.supported).length,
        knownStops: path.knownStops.map((j) => ix.rows[j].id),
      },
      relations,
      inCases: data.cases.cases.filter((/** @type {any} */ k) => ix.cases.get(k.id).has(r.id)).map((/** @type {any} */ k) => k.id),
      rank: agg[i].v === null ? null : 1 + agg.filter((/** @type {any} */ a) => a.v !== null && a.v > /** @type {number} */ (agg[i].v)).length,
    };
  }

  /** Rank sensitivity to the second assessment (spec section 7.5). @param {any} ix @param {any[]} agg @param {number[]} w @param {boolean} ok */
  function sensitivity(ix, agg, w, ok) {
    if (!ok) return [];
    const known = agg.filter((a) => a.v !== null).map((a) => /** @type {number} */ (a.v)).sort((a, b) => b - a);
    const rankOf = (/** @type {number} */ v, /** @type {number} */ self) => {
      let lo = 0, hi = known.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (known[m] > v) lo = m + 1; else hi = m; }
      // Remove the record's own first score from the others when it is above v.
      return 1 + lo - (self > v ? 1 : 0);
    };
    const out = [];
    for (let i = 0; i < ix.rows.length; i++) {
      if (!ix.scores2[i]) continue;
      const a = agg[i].v, b = aggregate(ix.scores2[i], w).v;
      out.push({ id: ix.rows[i].id, name: ix.rows[i].n, first: a, second: b, rank1: a === null ? null : rankOf(a, a), rank2: b === null || a === null ? null : rankOf(b, a), consistency: consistency(ix, i) });
    }
    for (const e of out) /** @type {any} */ (e).shift = e.rank1 !== null && e.rank2 !== null ? e.rank2 - e.rank1 : null;
    return out.sort((x, y) => Math.abs(/** @type {any} */ (y).shift ?? 0) - Math.abs(/** @type {any} */ (x).shift ?? 0) || x.name.localeCompare(y.name));
  }

  /* ---------- exports ---------- */

  /** A CSV cell: text that a spreadsheet could read as a formula gets a leading apostrophe; quoting as RFC 4180. @param {unknown} v */
  function csvCell(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v);
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /** The CSV of the rows the table shows, in its order (spec section 12.2). @param {Record<string, any>} state @param {any} d @param {any} data */
  function csv(state, d, data) {
    const ix = index(data);
    const tax = data.taxonomy;
    const wtext = COMPONENTS.map((k, j) => `${k} ${d.weights[j]}`).join("; ");
    const head = ["id", "name", "type", "overall", "interval_low", "interval_high", "missing", "weights", ...COMPONENTS, "confidence", "evidence", "consistency", "theorem_categories", "application_categories", "reader_level", "formal", "declaration", "sources", "link"];
    const lines = [head.join(",")];
    for (const i of d.order) {
      const r = ix.rows[i];
      const a = d.weightsOk ? aggregate(ix.scores[i], d.weights) : { v: null, lo: null, hi: null, missing: ["weights"] };
      const link = r.decl ? `https://github.com/leanprover-community/mathlib4/search?q=${encodeURIComponent(r.decl)}` : r.id.startsWith("wd:") ? `https://www.wikidata.org/wiki/${r.id.slice(3)}` : r.id.startsWith("nl:") ? "https://ncatlab.org/nlab/" : "";
      lines.push([r.id, r.n, r.t, a.v === null ? "unknown" : a.v, a.lo, a.hi, a.missing.join("; ") || "none", wtext, ...ix.scores[i].map(scoreText), r.c, r.ev, consistency(ix, i),
        r.cat.map((/** @type {number} */ k) => tax.categories[k][0]).join("; ") || "unclassified", r.acat.map((/** @type {number} */ k) => tax.categories[k][0]).join("; ") || "unclassified",
        LEVELS[r.lv], r.f ? "yes" : "no", r.decl ?? "", r.src.join("; "), link].map(csvCell).join(","));
    }
    return `${lines.join("\r\n")}\r\n`;
  }

  /** A profile from the state and the known results. @param {Record<string, any>} state @param {any} data */
  function profileOf(state, data) {
    return { schema: PROFILE_SCHEMA, snapshot: data.snapshot.id, known: { ...knownOf(data) }, interests: state.interests, stance: state.preset, depth: state.depth, reader: state.reader, budget: state.budget, weights: weightsOf(state) };
  }

  /**
   * Read a profile or a te-export file (spec sections 9.1, 11.4, 12.1): validate it, move its ids through the
   * identity map and list the ids this snapshot does not hold. Throws on a file that is not a profile.
   * @param {string} json @param {any} data
   */
  function readProfile(json, data) {
    /** @type {any} */
    let doc;
    try { doc = JSON.parse(json); } catch { throw new Error("The file is not JSON."); }
    if (doc && doc.schema === EXPORT_SCHEMA) doc = doc.profile;
    if (!doc || typeof doc !== "object" || doc.schema !== PROFILE_SCHEMA) throw new Error(`The file is not a ${PROFILE_SCHEMA} profile or a ${EXPORT_SCHEMA} export.`);
    if (!doc.known || typeof doc.known !== "object" || Array.isArray(doc.known)) throw new Error("The profile has no known-results object.");
    const ix = index(data);
    /** @type {Record<string, number>} */
    const known = {};
    /** @type {string[]} */
    const unresolved = [];
    for (const [id, depth] of Object.entries(doc.known)) {
      if (!Number.isInteger(depth) || /** @type {number} */ (depth) < 0 || /** @type {number} */ (depth) > 2) throw new Error(`The depth of ${id.slice(0, 40)} is not 0, 1 or 2.`);
      const now = migrate(data, id);
      if (ix.byId.has(now)) known[now] = Math.max(known[now] ?? 0, /** @type {number} */ (depth));
      else unresolved.push(id);
    }
    /** @type {Record<string, any>} */
    const state = {};
    if (typeof doc.interests === "string") state.interests = doc.interests;
    if (typeof doc.depth === "string") state.depth = doc.depth;
    if (typeof doc.reader === "string") state.reader = doc.reader;
    if (Number.isInteger(doc.budget)) state.budget = doc.budget;
    if (typeof doc.stance === "string") state.preset = doc.stance;
    if (doc.stance === "custom" && Array.isArray(doc.weights)) COMPONENTS.forEach((k, j) => { state[`w_${k}`] = doc.weights[j]; });
    return { known, state, unresolved, from: doc.snapshot ?? null, migrated: doc.snapshot !== data.snapshot.id };
  }

  /**
   * The JSON export (spec section 12.1): the selected and pinned records with their statements, evidence,
   * relations, assessments, the profile and the snapshot metadata. Null while the detail pack is not decoded.
   * @param {Record<string, any>} state @param {any} d @param {any} data
   */
  function exportJson(state, d, data) {
    const det = detail(data);
    if (!det) return null;
    const ix = index(data);
    const ids = [...new Set([d.selected.i, ...d.pinned.map((/** @type {any} */ p) => p.i)])];
    const tax = data.taxonomy;
    const records = ids.map((i) => {
      const r = ix.rows[i], x = det[i];
      return {
        id: r.id, name: r.n, type: r.t, aliases: x.al, arxiv_categories: r.cat.map((/** @type {number} */ k) => tax.categories[k][0]), application_categories: r.acat.map((/** @type {number} */ k) => tax.categories[k][0]),
        statement: { declaration: x.sig, conclusion: x.concl, hypotheses: x.hyps, typeclasses: x.cls, module: x.mod, declarations: x.decls, restatements: x.rs },
        evidence: x.evs, relations: Object.values(relationsOf(ix, i)).flat(),
        assessments: [{ judge: data.snapshot.judge.id, scores: r.s, confidence: r.c, explanation: x.why }, ...(r.s2 ? [{ judge: data.snapshot.judge.id, pass: 2, scores: r.s2, confidence: r.c2, explanation: x.why2 }] : [])],
        aggregate: aggregate(ix.scores[i], d.weights), consistency: consistency(ix, i), measures: d.selected.i === i ? d.selected.measures : null,
        learning: { level: LEVELS[r.lv], effort: Object.fromEntries(DEPTHS.map((k, j) => [k, r.ef[j]])), prerequisites: ix.pre[i].map((/** @type {number} */ j) => ix.rows[j].id), concepts: x.cn },
      };
    });
    const counts = d.counts;
    return {
      schema: EXPORT_SCHEMA, snapshot: data.snapshot, rubric_version: data.rubric.version, learn_rule: LEARN_RULE,
      view: { state, weights: d.weights, excluded: d.excluded, filters: d.filters, shown: counts.shown },
      profile: profileOf(state, data), records,
      path: d.selected.path,
    };
  }

  /* ---------- labels ---------- */

  /** @param {number | null} v */
  const scoreLabel = (v) => (v === null ? "unknown" : (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, ""));
  /** @param {string} band */
  const bandLabel = (band) => (band === "x" ? "does not apply" : `band ${band} (${BANDS[Number(band) - 1]})`);

  return {
    SLUG, SCHEMA_VERSION, FIELDS, EXAMPLES, COMPONENTS, COMPONENT_NAMES, PRESETS, LEVELS, LEVEL_NAMES, DEPTHS, BANDS, RESULT_TYPES, COLUMNS, DEFAULT_COLUMNS,
    LEARN_WEIGHTS, LEARN_RULES, SEARCH_HELP, REL_PHRASES, REL_ORDER, CASE_FORMULAS, PROFILE_SCHEMA, EXPORT_SCHEMA, NO_YEAR,
    derive, prime, pack, core, detail, index, aggregate, weightsOf, consistency, relevance, interestsOf, comparison, history,
    prerequisitePath, relationsOf, csv, csvCell, profileOf, readProfile, exportJson, splitList, scoreLabel, bandLabel, scoreText, migrate,
  };
});
