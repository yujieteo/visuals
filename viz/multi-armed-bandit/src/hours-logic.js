/* Pure logic for the page's hours mode: allocate next week's hours among activities.
 *
 * No DOM, storage or clock. The page inlines this file (compacted) as <script id="hours-logic"> after
 * <script id="mab-logic">, whose incomplete beta function, quantiles and formatting it reuses, and
 * tests/hours.test.mjs runs that shipped copy. Everything is deterministic given the state:
 *
 *   Evidence   each past hour-block of an activity is worthwhile or not (one success or one failure).
 *   Posterior  Beta(1 + s, 1 + f) per activity, from one uniform prior.
 *   Thompson   each hour goes to the activity with the highest posterior draw, so the plan gives every
 *              activity its expected share: H times its probability of the highest draw, rounded to whole
 *              hours by largest remainder. That probability is computed by quadrature, not by random draws,
 *              so the plan has no seed: the integral of pdf_i(x) times the product of the other CDFs,
 *              5-point Gauss-Legendre on the pieces between every activity's posterior sixteenths.
 *   UCB1       the hours are handed out one at a time to the highest s/n + sqrt(2 ln T / n), counting
 *              each planned hour as one more block of that activity (its share held fixed), so the
 *              exploration bonus shrinks as hours are planned; untried activities get the first hours.
 *
 * The hours state is a plain JSON document (autosaved, exported and imported), separate from the
 * experiment's. Its basis says where it came from: "blank" for a plan started blank (the default),
 * "example" for the fictional example as loaded and "edited" for the example after any change.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.HoursLogic = factory(root.BanditLogic);
})(typeof self !== "undefined" ? self : this, function (L) {
  "use strict";

  const FORMAT = "multi-armed-bandit-hours", VERSION = 1, PIECES = 16;
  const LIMITS = { minActivities: 2, maxActivities: 12, maxBlocks: 10000, name: 60, minHours: 1, maxHours: 168 };
  const GL = [[0, 0.5688888888888889], [-0.5384693101056831, 0.4786286704993665], [0.5384693101056831, 0.4786286704993665],
    [-0.906179845938664, 0.23692688505618908], [0.906179845938664, 0.23692688505618908]];
  const BASES = ["blank", "example", "edited"];
  const COUNTS = { worthwhile: "Worthwhile blocks", notWorthwhile: "Not-worthwhile blocks" };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const WHOLE = /^\d+$/;

  /* ---- State ---- */
  function fromExample(D) {
    const ex = D.hours;
    const activities = ex.activities.map((a, i) => ({ id: "a" + (i + 1), name: a.name, worthwhile: a.worthwhile, notWorthwhile: a.notWorthwhile }));
    return { format: FORMAT, version: VERSION, basis: "example", hours: ex.hours, activities, nextId: activities.length + 1 };
  }
  /* A blank plan: two activities with no blocks. */
  function blank(D) {
    const activities = [1, 2].map((i) => ({ id: "a" + i, name: "Activity " + i, worthwhile: 0, notWorthwhile: 0 }));
    return { format: FORMAT, version: VERSION, basis: "blank", hours: D.hours.hours, activities, nextId: 3 };
  }
  const touched = (s) => { if (s.basis === "example") s.basis = "edited"; return s; };

  /* ---- Validation: an error message, or null ---- */
  function wholeError(raw, lo, hi, what) {
    const s = String(raw).trim();
    if (!WHOLE.test(s) || +s < lo || +s > hi) return what + " must be a whole number from " + L.group(lo) + " to " + L.group(hi) + ".";
    return null;
  }
  function nameError(state, index, raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return "Activity name is required.";
    if (s.length > LIMITS.name) return "Activity name must be at most " + LIMITS.name + " characters (now " + s.length + ").";
    if (state.activities.some((a, i) => i !== index && a.name.trim().toLowerCase() === s.toLowerCase())) return "Activity names must be unique, ignoring case.";
    return null;
  }
  const countError = (field, raw) => wholeError(raw, 0, LIMITS.maxBlocks, COUNTS[field]);

  /* ---- Commands return { state } with a new state, or { error }; they never change their input ---- */
  function rename(state, index, raw) {
    const e = nameError(state, index, raw);
    if (e) return { error: e };
    const s = clone(state), name = String(raw).trim();
    if (s.activities[index].name === name) return { state: s, unchanged: true };
    s.activities[index].name = name;
    return { state: touched(s) };
  }
  /* Sets one count, worthwhile or notWorthwhile. */
  function setCount(state, index, field, raw) {
    const e = countError(field, raw);
    if (e) return { error: e };
    const s = clone(state), a = s.activities[index], v = +String(raw).trim();
    if (a[field] === v) return { state: s, unchanged: true };
    a[field] = v;
    return { state: touched(s) };
  }
  function setHours(state, raw) {
    const e = wholeError(raw, LIMITS.minHours, LIMITS.maxHours, "Hours available");
    if (e) return { error: e };
    const s = clone(state), hours = +String(raw).trim();
    if (s.hours === hours) return { state: s, unchanged: true };
    s.hours = hours;
    return { state: touched(s) };
  }
  function addActivity(state) {
    if (state.activities.length >= LIMITS.maxActivities) return { error: "At most " + LIMITS.maxActivities + " activities." };
    const s = clone(state);
    let n = s.activities.length + 1, name;
    do { name = "Activity " + n; n += 1; } while (s.activities.some((a) => a.name.toLowerCase() === name.toLowerCase()));
    s.activities.push({ id: "a" + s.nextId, name, worthwhile: 0, notWorthwhile: 0 });
    s.nextId += 1;
    return { state: touched(s) };
  }
  function removeActivity(state, index) {
    if (state.activities.length <= LIMITS.minActivities) return { error: "At least " + LIMITS.minActivities + " activities are needed." };
    const s = clone(state); s.activities.splice(index, 1);
    return { state: touched(s) };
  }

  /* ---- Model ---- */
  /* Successes s, failures f and blocks n of one activity. */
  const evidence = (a) => ({ s: a.worthwhile, f: a.notWorthwhile, n: a.worthwhile + a.notWorthwhile });
  /* Probability that each Beta(alpha, beta) gives the highest draw: P_i = integral of pdf_i * prod_{j != i} CDF_j. */
  function probBest(params) {
    const cuts = [0, 1];
    for (const [a, b] of params) {
      cuts.push(L.betaQuantile(1e-12, a, b), L.betaQuantile(1 - 1e-12, a, b));
      for (let k = 1; k < PIECES; k += 1) cuts.push(L.betaQuantile(k / PIECES, a, b));
    }
    cuts.sort((x, y) => x - y);
    const lb = params.map(([a, b]) => L.lbeta(a, b)), out = params.map(() => 0);
    for (let c = 1; c < cuts.length; c += 1) {
      const lo = cuts[c - 1], hi = cuts[c], half = (hi - lo) / 2;
      if (!(half > 0)) continue;
      for (const [node, w] of GL) {
        const x = lo + half * (1 + node);
        const F = params.map(([a, b]) => L.ibeta(x, a, b));
        params.forEach(([a, b], i) => {
          let p = w * half * Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - lb[i]);
          for (let j = 0; j < F.length && p > 0; j += 1) if (j !== i) p *= F[j];
          out[i] += p;
        });
      }
    }
    const sum = out.reduce((t, x) => t + x, 0);
    return out.map((x) => x / sum);
  }
  /* Whole hours proportional to shares, summing to H: floors, then the largest remainders (ties to the first). */
  function apportion(shares, H) {
    const q = shares.map((p) => p * H), out = q.map(Math.floor);
    let left = H - out.reduce((t, x) => t + x, 0);
    const order = q.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let k = 0; left > 0; k += 1, left -= 1) out[order[k % order.length][1]] += 1;
    return out;
  }
  /* UCB1 hour by hour; returns the hours and each activity's score after the last planned hour. */
  function ucbPlan(ev, H) {
    const n = ev.map((e) => e.n), mean = ev.map((e) => (e.n ? e.s / e.n : 0)), hours = ev.map(() => 0), order = [];
    const score = (i, T) => mean[i] + Math.sqrt(2 * Math.log(T) / n[i]);
    for (let h = 0; h < H; h += 1) {
      let best = n.findIndex((x) => x === 0);
      if (best < 0) {
        const T = n.reduce((t, x) => t + x, 0);
        best = 0;
        for (let i = 1; i < n.length; i += 1) if (score(i, T) > score(best, T)) best = i;
      }
      hours[best] += 1; n[best] += 1; order.push(best);
    }
    const T = n.reduce((t, x) => t + x, 0);
    return { hours, order, scores: n.map((x, i) => (x ? { mean: mean[i], bonus: Math.sqrt(2 * Math.log(T) / x), score: score(i, T) } : null)) };
  }
  const hrs = (h) => h + (h === 1 ? " hour" : " hours");
  const share = (s, n) => (n ? L.pct(s / n) : "No blocks");
  const evidenceText = (a) => L.group(a.worthwhile) + " worthwhile, " + L.group(a.notWorthwhile) + " not";
  const list = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

  /* Every number the page, the Markdown plan and the tools show, formatted once. */
  function view(state) {
    const H = state.hours;
    const ev = state.activities.map(evidence);
    const params = ev.map((e) => [1 + e.s, 1 + e.f]);
    const pb = probBest(params), ts = apportion(pb, H), u = ucbPlan(ev, H);
    const rows = state.activities.map((a, i) => {
      const [al, be] = params[i], e = ev[i], mean = al / (al + be), lo = L.betaQuantile(0.025, al, be), hi = L.betaQuantile(0.975, al, be);
      return { id: a.id, name: a.name, s: e.s, f: e.f, n: e.n, mean, lo, hi, probBest: pb[i], thompson: ts[i], ucb: u.hours[i], score: u.scores[i],
        text: { evidence: evidenceText(a), blocks: L.group(e.n), share: share(e.s, e.n), mean: L.pct(mean), interval: L.pct(lo) + " to " + L.pct(hi),
          posterior: "Beta(" + +al.toFixed(2) + ", " + +be.toFixed(2) + ")", probBest: L.pct(pb[i]), thompson: hrs(ts[i]), ucb: hrs(u.hours[i]),
          score: u.scores[i] ? L.num(u.scores[i].score) : "—" } };
    });
    const byTs = rows.slice().sort((a, b) => b.thompson - a.thompson || b.probBest - a.probBest);
    const lead = byTs[0], idle = rows.filter((r) => r.thompson === 0).map((r) => r.name);
    const tsWhy = "Thompson Sampling gives each hour to the activity whose draw from its posterior is highest, so each activity gets its chance of the highest draw times the hours. " +
      list(byTs.slice(0, 3).map((r) => r.name + " has " + r.text.probBest)) + ", so " +
      lead.name + " gets " + lead.text.thompson + " of the " + H + (idle.length ? "; " + list(idle) + " " + (idle.length === 1 ? "gets" : "get") + " none, because " + (idle.length === 1 ? "its draw is" : "their draws are") + " rarely the highest" : "") + ".";
    const untried = rows.filter((r) => r.n === 0).map((r) => r.name);
    const byUcb = rows.slice().sort((a, b) => b.ucb - a.ucb);
    const ucbWhy = "UCB1 hands out the hours one at a time, each to the highest score: the worthwhile share plus an exploration bonus that is largest for activities with few blocks. Each planned hour counts as one more block, so the bonus shrinks as hours are added. " +
      (untried.length ? list(untried) + (untried.length === 1 ? " has" : " have") + " no blocks yet, so " + (untried.length === 1 ? "it gets" : "they get") + " the first hours. " : "") +
      byUcb[0].name + " gets the most, " + byUcb[0].text.ucb + ". The scores are not probabilities.";
    const diff = rows.reduce((t, r) => t + Math.abs(r.thompson - r.ucb), 0) / 2;
    const used = (k) => rows.filter((r) => r[k] > 0).length;
    const agreement = diff === 0 ? "Both methods give the same plan." : "The plans differ by " + hrs(diff) + ": Thompson Sampling uses " + used("thompson") + " of the " + rows.length +
      " activities and UCB1 " + used("ucb") + ". Thompson Sampling gives hours in proportion to each activity's chance of being best; UCB1 gives each hour to the highest optimistic score, so it keeps going to one activity until its shrinking bonus lets another overtake it.";
    /* Sensitivity: the leader with one more not-worthwhile block. */
    const worse = clone(state), wi = state.activities.findIndex((a) => a.id === lead.id), wa = worse.activities[wi];
    wa.notWorthwhile += 1;
    const wev = worse.activities.map(evidence);
    const wts = apportion(probBest(wev.map((e) => [1 + e.s, 1 + e.f])), H)[wi];
    const sensitivity = [
      "With one more not-worthwhile block for " + lead.name + ", Thompson Sampling would give it " + hrs(wts) + " instead of " + hrs(lead.thompson) + ".",
      "Rounding to whole hours moves each activity by less than one hour from its exact share; the shares are computed by numerical integration, not random draws, so the same evidence always gives the same plan."];
    return { hours: H, hoursText: hrs(H), rows, tsWhy, ucbWhy, agree: diff === 0, agreement, sensitivity,
      lead: lead.name, totalBlocks: L.group(ev.reduce((t, e) => t + e.n, 0)) };
  }

  /* ---- Markdown plan ---- */
  const cell = (s) => String(s).replace(/\s+/g, " ").trim().replace(/[\\\x60*_<>|[\]]/g, "\\$&");
  function markdown(state, V, D, date) {
    const ex = D.hours, rows = V.rows;
    const table = (head, body, left) => "| " + head.join(" | ") + " |\n|" + head.map((h, i) => (i && !(left || []).includes(i) ? " ---: |" : " --- |")).join("") + "\n" + body.map((r) => "| " + r.join(" | ") + " |").join("\n");
    const basis = { blank: "Counts entered by the user in a plan started blank.", example: "Fictional example counts, for illustration only; not real data.",
      edited: "The fictional example, edited by the user; counts left unchanged are still fictional." }[state.basis];
    return ["# Next week's hours: a plan for " + V.hoursText, "",
      "Made on " + date + " with the Multi-armed Bandit page's Next week's hours tab (https://teoyujie.org/visuals/multi-armed-bandit/). " + basis, "",
      "## Inputs", "",
      "- Hours available: " + V.hours + ", in one-hour blocks.",
      "- Evidence per past block: worthwhile or not.",
      "- Prior: Beta(1, 1) for every activity.", "",
      table(["Activity", "Past blocks", "Evidence"], rows.map((r) => [cell(r.name), r.text.blocks, cell(r.text.evidence)]), [2]), "",
      "## Assumptions", "", ex.assumptions.map((a) => "- " + a).join("\n"), "",
      "## Derived quantities", "",
      table(["Activity", "Worthwhile share", "Posterior", "Posterior mean", "95% credible interval", "Probability best", "UCB1 score after the plan"],
        rows.map((r) => [cell(r.name), r.text.share, r.text.posterior, r.text.mean, r.text.interval, r.text.probBest, r.text.score])), "",
      "## Result", "",
      table(["Activity", "Thompson Sampling", "UCB1"], rows.map((r) => [cell(r.name), r.text.thompson, r.text.ucb])), "",
      "Plan (Thompson Sampling): " + rows.filter((r) => r.thompson).map((r) => cell(r.name) + " " + r.thompson + " h").join(", ") + ".", "",
      cell(V.tsWhy), "", cell(V.ucbWhy), "", V.agreement, "",
      "## Sensitivity", "", V.sensitivity.map((x) => "- " + cell(x)).join("\n"), "",
      "## Notes", "", ex.next.map((x) => "- " + x).join("\n"), ""].join("\n");
  }

  /* ---- Import and storage validation ---- */
  function check(doc) {
    const fail = (m) => { throw new Error(m); };
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) fail("The file is not a JSON object.");
    if (doc.format !== FORMAT) fail("This is not a multi-armed bandit hours plan file.");
    if (doc.version !== VERSION) fail("Unsupported version " + JSON.stringify(doc.version) + "; this page reads version " + VERSION + ".");
    if (!BASES.includes(doc.basis)) fail("Invalid plan basis; it must be \"blank\", \"example\" or \"edited\".");
    if (!Number.isInteger(doc.hours) || wholeError(String(doc.hours), LIMITS.minHours, LIMITS.maxHours, "Hours available")) fail(wholeError(String(doc.hours), LIMITS.minHours, LIMITS.maxHours, "Hours available") || "Hours available must be a whole number.");
    const as = doc.activities;
    if (!Array.isArray(as) || as.length < LIMITS.minActivities || as.length > LIMITS.maxActivities) fail("A plan needs " + LIMITS.minActivities + " to " + LIMITS.maxActivities + " activities.");
    const ids = new Set();
    as.forEach((a, i) => {
      const at = "Activity " + (i + 1) + ": ";
      if (!a || typeof a.id !== "string" || !/^a\d+$/.test(a.id) || ids.has(a.id)) fail(at + "missing or duplicate id.");
      ids.add(a.id);
      if (typeof a.name !== "string") fail(at + "missing name.");
      const ne = nameError({ activities: as.slice(0, i).concat([a]) }, i, a.name);
      if (ne) fail(at + ne);
      for (const f in COUNTS) {
        const ce = countError(f, String(a[f]));
        if (!Number.isInteger(a[f]) || ce) fail(at + (ce || COUNTS[f] + " must be a whole number."));
      }
    });
    if (!Number.isInteger(doc.nextId) || doc.nextId <= Math.max.apply(null, as.map((a) => +a.id.slice(1)))) fail("Invalid next activity id.");
  }
  /* Parses and fully validates a document; returns { state } or { error }. Never partial. */
  function parse(text) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { return { error: "The file is not valid JSON." }; }
    try { check(doc); } catch (e) { return { error: e.message }; }
    return { state: { format: FORMAT, version: VERSION, basis: doc.basis, hours: doc.hours,
      activities: doc.activities.map((a) => ({ id: a.id, name: a.name.trim(), worthwhile: a.worthwhile, notWorthwhile: a.notWorthwhile})), nextId: doc.nextId } };
  }
  const serialise = (state) => JSON.stringify(state, null, 2);

  return { FORMAT, VERSION, PIECES, LIMITS, fromExample, blank, nameError, countError, rename, setCount, setHours,
    addActivity, removeActivity, evidence, probBest, apportion, ucbPlan, view, markdown, parse, serialise, clone };
});
