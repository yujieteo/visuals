/* Universal Data Workbench: the ranking of a table's valid charts, the two lists and their distinct highlights.
 *
 * The rules are spec.md's "Ranking" choice, each score logged with the chart:
 *
 *   usefulness       min(1, effect / large) of the chart's pattern: |rho| 0.5, Hedges' |g| 0.8, omega-squared 0.14,
 *                    Cramér's V 0.5, |Kendall's tau| 0.5, a level shift of 2 long-run SDs; for one field, |skewness| 2,
 *                    a bimodality coefficient above 0.555, 1% of values with robust z above 3.5, or a rarest level
 *                    at 1 − k · share 0.95; timelines have no effect measure
 *   penalties        information density below 20% (0.1); label collisions (0.1 each, at most 0.3); more than 12
 *                    categories (0.1); scatter overplotting (0.1); a group or period of fewer than 5 rows shown
 *                    (0.2); more than 30% of rows missing a field (0.2); a sample instead of every row (0.05)
 *   unusualness      usefulness × complete-row share − penalties; ties by chart id
 *   list 1           "Unusual patterns", every ranked chart by unusualness
 *   list 2           "Statistically supported patterns": a chart whose hypothesis passed its test's checks with an
 *                    adjusted p-value of at most 0.05, by adjusted p-value, then usefulness
 *   redundancy       one cluster per hypothesis (pattern and fields), fields that substitute (|rho| or V at least
 *                    0.95) counted as one
 *   highlights       greedy from the top of each list, skipping a chart of a chosen cluster or sharing more than
 *                    one field with a chosen chart; 6 by default, 0 to 50
 *
 * Each highlight keeps what was observed (the numbers) apart from why it is highlighted (the rule scores), and
 * carries fixed cautions that make no causal claim.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./grammar.js"), require("./stats.js"), require("./family.js"), require("./sha256.js"));
  else root.DWRank = factory(root.DWGrammar, root.DWStats, root.DWFamily, root.DWSha256);
})(typeof self !== "undefined" ? self : this, function (Grammar, Stats, Family, Sha) {
  "use strict";

  const LARGE = { rho: 0.5, g: 0.8, omega: 0.14, v: 0.5, tau: 0.5, shift: 2, skew: 2, bc: 0.555, rare: 0.01, rarity: 0.95 };
  const PENALTY = { density: 0.1, collision: 0.1, collisions: 0.3, categories: 0.1, overplot: 0.1, small: 0.2, missing: 0.2, sample: 0.05 };
  const SUBSTITUTE = 0.95;
  const HIGHLIGHTS = { default: 6, min: 0, max: 50 };

  const CAUTIONS = {
    cause: "An association in these rows, not a cause: the numbers do not show that one field changes another.",
    third: "A third field, measured or not, may drive both.",
    time: "A change over time in these rows does not say what brought it about.",
    rare: "Rare and unusual values may be data errors or real rare cases; the data alone cannot tell which.",
    evidence: "An adjusted p-value at or below 0.05 is exploratory evidence worth checking, not proof of a pattern.",
  };

  const r2 = (x, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : x);
  const fmt = (x, d = 2) => (x === null || x === undefined ? "–" : !Number.isFinite(x) ? (x > 0 ? "unbounded" : x < 0 ? "−unbounded" : "–") : Math.abs(x) !== 0 && (Math.abs(x) >= 1e6 || Math.abs(x) < 10 ** -d) ? x.toExponential(2).replace("e+", "e") : x.toLocaleString("en-US", { maximumFractionDigits: d }));
  const whole = (x) => Math.round(x).toLocaleString("en-US");
  const pct = (share) => `${(Math.round(share * 1000) / 10).toLocaleString("en-US")}%`;
  /** A p-value in words: 4 decimals, or 2 significant digits below 0.0001, and "< 1e-300" where it underflows to 0. */
  const pval = (p) => (p === null || p === undefined ? "–" : p < 1e-4 ? (p === 0 ? "< 1e-300" : p.toExponential(1).replace("e+", "e")) : fmt(p, 4));
  const ci = (c, d = 2) => (c ? ` (95% CI ${fmt(c[0], d)} to ${fmt(c[1], d)})` : "");
  const clamp = (x) => Math.max(0, Math.min(1, x));

  /* ---------- what a drawn chart shows ---------- */

  /**
   * What the ranking reads of one valid chart as computed and drawn: the complete-row share, the information
   * density, label collisions, overplotting, small groups and whether it uses a sample.
   * @param {any} spec @param {any} data Charts.compute's answer @param {any} drawn Render.render's answer
   */
  function features(spec, data, drawn) {
    const facts = data.facts ?? {};
    const panels = data.panels ?? [];
    const rows = facts.rows ?? spec.data.rows;
    let cells = 0, filled = 0, small = 0;
    const count = (list, has) => { cells += list.length; filled += list.filter(has).length; };
    switch (spec.kind) {
      case "histogram": for (const p of panels) count(p.counts, (n) => n > 0); break;
      case "binned-heatmap": cells = data.x.n * data.y.n * panels.length; filled = panels.reduce((a, p) => a + p.cells.filter((c) => c.n > 0).length, 0); break;
      case "count-heatmap": cells = data.xlevels.length * data.ylevels.length * panels.length; filled = panels.reduce((a, p) => a + p.cells.filter((c) => c.n > 0).length, 0); break;
      case "period-heatmap": cells = data.periods.length * data.ylevels.length * panels.length; filled = panels.reduce((a, p) => a + p.cells.filter((c) => c.n > 0).length, 0); break;
      case "count-series": case "mean-series": for (const p of panels) count(p.series, (s) => s.n > 0); break;
      default: break;
    }
    if (spec.kind === "box-by-group") small = panels.reduce((a, p) => a + p.boxes.filter((b) => b.n < 5).length, 0);
    if (spec.kind === "mean-bar") small = panels.reduce((a, p) => a + p.bars.filter((b) => b.n < 5).length, 0);
    if (spec.kind === "mean-series") small = panels.reduce((a, p) => a + p.series.filter((s) => s.n > 0 && s.n < 5).length, 0);
    const points = spec.kind === "scatter" ? panels.reduce((a, p) => a + p.xs.length, 0) : 0;
    return {
      rows, used: facts.used ?? 0, complete: rows > 0 ? (facts.used ?? 0) / rows : 0, density: cells ? filled / cells : null,
      collisions: drawn.collisions ?? 0, points, overlapped: drawn.overlapped ?? 0, small, sample: !!spec.data.sample || !!facts.scatterSample,
    };
  }

  /* ---------- usefulness ---------- */

  /** The family members a chart shows, by pattern. */
  function membersOf(cand, keys) {
    return Family.patternsOfKind(cand.kind).map((p) => keys.get(Family.keyOf(p, cand.fields))).filter(Boolean);
  }

  /**
   * A chart's usefulness: min(1, effect / large) of the measure its pattern takes, with the measure and its value.
   * @param {{ kind: string, fields: string[] }} cand @param {any} fam a decided family @param {Map<string, any>} keys
   */
  function usefulness(cand, fam, keys) {
    const part = (name, value, large, scale = Math.abs(value) / large) => ({ name, value, large, score: clamp(Number.isFinite(scale) ? scale : 0) });
    const best = (parts) => parts.reduce((a, p) => (p.score > a.score ? p : a), parts[0]);
    const none = (why) => ({ name: "none", value: null, large: null, score: 0, why });
    const [a, b] = cand.fields;
    const ms = membersOf(cand, keys);
    switch (cand.kind) {
      case "histogram": case "box": {
        const s = fam.measures.shape[a];
        if (!s) return none("No measure of its shape was computed.");
        return best([part("skewness", s.skew ?? 0, LARGE.skew), { name: "bimodality coefficient", value: s.bc, large: LARGE.bc, score: s.bc !== null && s.bc > LARGE.bc ? 1 : 0 },
          part("share of values with robust z above 3.5", s.rare, LARGE.rare)]);
      }
      case "bar": {
        const l = fam.measures.levels[a];
        if (!l?.rarity) return none(l ? `${l.levels} levels: rarity is scored for at most 29.` : "No count of its levels was computed.");
        return part("rarity of the rarest level", l.rarity.value, LARGE.rarity);
      }
      case "count-series": {
        const c = fam.measures.counts[a];
        if (!c) return none("No count over time was computed.");
        return best([part("Kendall's tau of the counts", c.tau, LARGE.tau), part("largest shift in long-run SD", c.shiftSd, LARGE.shift)]);
      }
      case "scatter": case "binned-heatmap": {
        const e = ms[0]?.effect;
        return e ? part("Spearman's rho", e.value, LARGE.rho) : none("Spearman's rho could not be computed.");
      }
      case "box-by-group": case "mean-bar": {
        const e = ms[0]?.effect;
        if (!e) return none("No group difference could be computed.");
        return e.name === "Hedges' g" ? part("Hedges' g", e.value, LARGE.g) : part("omega-squared", e.value, LARGE.omega);
      }
      case "count-heatmap": {
        const e = ms[0]?.effect;
        return e ? part("Cramér's V", e.value, LARGE.v) : none("Cramér's V could not be computed.");
      }
      case "mean-series": {
        const parts = ms.filter((m) => m.effect).map((m) => (m.pattern === "trend" ? part("Kendall's tau", m.effect.value, LARGE.tau) : part("level shift in long-run SD", m.effect.value, LARGE.shift)));
        return parts.length ? best(parts) : none("Too few periods for a trend or a shift.");
      }
      case "period-heatmap": {
        const p = fam.measures.periods[`${a}\u0000${b}`];
        return p ? part("Cramér's V of period and level", p.v, LARGE.v) : none("No table of periods was computed.");
      }
      default: return none("Timelines have no effect measure in ranking v1.");
    }
  }

  /* ---------- scores ---------- */

  /**
   * Every score of one valid chart, logged: usefulness, the complete-row share, each penalty, unusualness.
   * @param {any} cand @param {any} fam @param {Map<string, any>} keys @param {any} ctx the charts' context (field levels)
   */
  function score(cand, fam, keys, ctx) {
    const f = cand.features;
    const use = usefulness(cand, fam, keys);
    const penalties = [];
    const add = (rule, amount, text) => penalties.push({ rule, amount, text });
    if (f.density !== null && f.density < 0.2) add("density", PENALTY.density, `information density ${pct(f.density)}, below 20%`);
    if (f.collisions > 0) add("collisions", Math.min(PENALTY.collisions, PENALTY.collision * f.collisions), `${f.collisions} label collision${f.collisions === 1 ? "" : "s"}`);
    const many = cand.fields.filter((name) => ctx.fields[name]?.cls === "C" && ctx.fields[name].levels > 12);
    if (many.length) add("categories", PENALTY.categories, `more than 12 categories (${many.map((n) => `${n}: ${ctx.fields[n].levels}`).join(", ")})`);
    if (f.points > 0 && f.overlapped / f.points > 0.5) add("overplotting", PENALTY.overplot, `overplotting: ${pct(f.overlapped / f.points)} of the points overlap another`);
    if (f.small > 0) add("small groups", PENALTY.small, `${f.small} group${f.small === 1 ? "" : "s"} or period${f.small === 1 ? "" : "s"} of fewer than 5 rows shown`);
    if (1 - f.complete > 0.3) add("missing", PENALTY.missing, `${pct(1 - f.complete)} of rows miss a field of the chart`);
    if (f.sample) add("sample", PENALTY.sample, "a sample instead of every row");
    const total = penalties.reduce((s, p) => s + p.amount, 0);
    const ms = membersOf(cand, keys);
    const tested = ms.filter((m) => m.status === "tested");
    const flagged = tested.filter((m) => m.flag);
    const adjusted = flagged.length ? Math.min(...flagged.map((m) => m.adjusted)) : null;
    return { usefulness: use, complete: f.complete, density: f.density, penalties, penalty: r2(total, 4), unusualness: r2(use.score * f.complete - total, 6),
      hypotheses: ms.map((m) => m.id), adjusted, supported: flagged.length > 0 };
  }

  /* ---------- redundancy ---------- */

  /** A short stable id: the first 8 hex digits of SHA-256. */
  function shortHash(text) {
    const h = Sha.create();
    h.update(new TextEncoder().encode(text));
    return h.hex().slice(0, 8);
  }

  /**
   * Fields that substitute for each other: pairs of measures with |rho| at least 0.95 and pairs of categories with
   * V at least 0.95, joined into groups; each field maps to the first field of its group in column order.
   * @param {any} fam @param {any[]} classes
   */
  function substitutes(fam, classes) {
    const order = classes.map((c) => c.name);
    const parent = new Map(order.map((n) => [n, n]));
    const find = (n) => { while (parent.get(n) !== n) n = parent.get(n); return n; };
    const join = (x, y) => { const a = find(x), b = find(y); if (a !== b) { const [keep, drop] = order.indexOf(a) <= order.indexOf(b) ? [a, b] : [b, a]; parent.set(drop, keep); } };
    const pairs = [];
    for (const m of fam.members) {
      if ((m.pattern === "monotone" || m.pattern === "association") && m.effect && Math.abs(m.effect.value) >= SUBSTITUTE) {
        join(m.fields[0], m.fields[1]);
        pairs.push({ fields: m.fields, measure: m.effect.name, value: m.effect.value });
      }
    }
    return { of: (n) => (parent.has(n) ? find(n) : n), pairs };
  }

  /** A chart's redundancy cluster: its grammar pattern and its fields, each as its group's first field. */
  function clusterOf(cand, subs) {
    const pattern = Grammar.KIND[cand.kind].pattern;
    const key = `${pattern}:${cand.fields.map(subs.of).sort().join(",")}`;
    return { key, id: `r${shortHash(key)}` };
  }

  /* ---------- the lists ---------- */

  /**
   * Distinct highlights: greedy from the top, skipping an entry whose cluster is chosen or that shares more than
   * one field with a chosen entry.
   * @param {{ id: string, cluster: string, fields: string[] }[]} list @param {number} count
   */
  function distinct(list, count) {
    const chosen = [];
    for (const e of list) {
      if (chosen.length >= count) break;
      if (chosen.some((c) => c.cluster === e.cluster)) continue;
      if (chosen.some((c) => c.fields.filter((f) => e.fields.includes(f)).length > 1)) continue;
      chosen.push(e);
    }
    return chosen;
  }

  /** The highlight count a person chose, held within 0 to 50. */
  const highlightCount = (n) => (Number.isInteger(n) ? Math.max(HIGHLIGHTS.min, Math.min(HIGHLIGHTS.max, n)) : HIGHLIGHTS.default);

  /**
   * Rank a table's valid charts: the scores of each, its cluster, both lists and their distinct highlights.
   * @param {any[]} candidates the table's candidates (valid ones carry `features`) @param {any} fam a decided family
   * @param {{ ctx: any, classes: any[], highlights?: number }} o
   */
  function rank(candidates, fam, o) {
    const keys = Family.byKey(fam);
    const subs = substitutes(fam, o.classes);
    const entries = candidates.filter((c) => c.outcome === "valid" && c.features).map((c) => {
      const cl = clusterOf(c, subs);
      return { id: c.id, kind: c.kind, fields: c.fields, title: c.spec?.annotation.title ?? c.id, cluster: cl.id, clusterKey: cl.key, ...score(c, fam, keys, o.ctx) };
    });
    const sizes = new Map();
    for (const e of entries) sizes.set(e.cluster, (sizes.get(e.cluster) ?? 0) + 1);
    const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const unusual = [...entries].sort((a, b) => b.unusualness - a.unusualness || byId(a, b));
    const supported = entries.filter((e) => e.supported && fam.status === "complete").sort((a, b) => a.adjusted - b.adjusted || b.usefulness.score - a.usefulness.score || byId(a, b));
    const count = highlightCount(o.highlights ?? HIGHLIGHTS.default);
    const hu = distinct(unusual, count), hs = distinct(supported, count);
    const place = (list) => new Map(list.map((e, i) => [e.id, i + 1]));
    return {
      entries: new Map(entries.map((e) => [e.id, e])), clusters: sizes, substitutes: subs.pairs, count,
      unusual: unusual.map((e) => e.id), supported: supported.map((e) => e.id),
      highlights: { unusual: hu.map((e) => e.id), supported: hs.map((e) => e.id) },
      places: { unusual: place(unusual), supported: place(supported) },
      fewer: { unusual: hu.length < count ? hu.length : null, supported: hs.length < count ? hs.length : null },
    };
  }

  /* ---------- explanations ---------- */

  /** A period's start (seconds since 1970, UTC) in words, at the unit's precision. */
  function periodText(t, unit) {
    if (!Number.isFinite(t)) return "–";
    const d = new Date(t * 1000);
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    if (unit === "year" || unit === "decade" || unit === "century" || unit === "millennium") return String(y);
    if (unit === "quarter") return `${y} Q${Math.floor((m - 1) / 3) + 1}`;
    if (unit === "month") return `${y}-${String(m).padStart(2, "0")}`;
    const ymd = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return unit === "hour" ? `${ymd} ${String(d.getUTCHours()).padStart(2, "0")}:00 UTC` : ymd;
  }

  /** What was observed for one chart: its numbers only. */
  function observed(cand, fam, keys) {
    const [a, b] = cand.fields;
    const out = [];
    const ms = membersOf(cand, keys);
    const m0 = ms[0];
    switch (cand.kind) {
      case "histogram": case "box": {
        const s = fam.measures.shape[a];
        if (s) out.push(`${a}: skewness ${fmt(s.skew)}, excess kurtosis ${fmt(s.kurt)}, bimodality coefficient ${fmt(s.bc, 3)}; ${pct(s.rare)} of ${whole(s.n)} values (${whole(s.rareCount)}) with robust z above 3.5; median ${fmt(s.median, 4)}.`);
        break;
      }
      case "bar": {
        const l = fam.measures.levels[a];
        if (l?.rarity?.rarest) out.push(`${a}: ${l.levels} levels; the rarest, ${l.rarity.rarest.level}, holds ${pct(l.rarity.rarest.share)} of ${whole(l.rarity.n)} rows (${whole(l.rarity.rarest.n)}), against an even share of ${pct(1 / l.levels)}.`);
        else if (l) out.push(`${a}: ${whole(l.levels)} levels.`);
        break;
      }
      case "count-series": {
        const c = fam.measures.counts[a];
        if (c?.unit) out.push(`Rows per ${c.unit} over ${a}, ${c.periods} periods: Kendall's tau ${fmt(c.tau)}; the largest shift is ${fmt(c.shiftSd)} long-run SD${c.shift ? `, from ${fmt(c.shift.before, 1)} to ${fmt(c.shift.after, 1)} rows a ${c.unit} after period ${c.shift.at}` : ""}.`);
        break;
      }
      case "scatter": case "binned-heatmap": {
        const d = m0?.measured;
        if (d && Number.isFinite(d.rho)) {
          const r = d.n > 3 ? Stats.spearman({ n: d.n, rho: d.rho }) : null;
          out.push(`Spearman's rho ${fmt(d.rho, 3)}${r ? ci(r.effect.ci, 3) : ""} over ${whole(d.n)} complete pairs.`);
        }
        break;
      }
      case "box-by-group": case "mean-bar": {
        const g = m0?.measured?.groups ?? [];
        if (g.length === 2) {
          const h = Stats.hedges(g[0], g[1]);
          out.push(`Mean ${b}: ${fmt(g[0].mean, 4)} in ${g[0].level} (n ${whole(g[0].n)}) and ${fmt(g[1].mean, 4)} in ${g[1].level} (n ${whole(g[1].n)}); ${g[0].level} − ${g[1].level} = ${fmt(g[0].mean - g[1].mean, 4)}${m0.result?.difference ? ci(m0.result.difference.ci, 4) : ""}.`);
          if (Number.isFinite(h.value)) out.push(`Hedges' g ${fmt(h.value)}${ci(h.ci)}.`);
        } else if (g.length > 2) {
          const lo = g.reduce((x, y) => (y.mean < x.mean ? y : x)), hi = g.reduce((x, y) => (y.mean > x.mean ? y : x));
          out.push(`Mean ${b} by ${a}, ${g.length} groups: from ${fmt(lo.mean, 4)} (${lo.level}, n ${whole(lo.n)}) to ${fmt(hi.mean, 4)} (${hi.level}, n ${whole(hi.n)}); omega-squared ${fmt(m0.effect?.value ?? 0, 3)}.`);
        }
        break;
      }
      case "count-heatmap": {
        const d = m0?.measured;
        if (d?.table) {
          const n = d.table.reduce((s, r) => s + r.reduce((t, x) => t + x, 0), 0);
          out.push(`Cramér's V (bias-corrected) ${fmt(m0.effect?.value ?? 0, 3)} over a ${d.rows.length} × ${d.cols.length} table of ${whole(n)} rows${d.merged?.some((x) => x > 0) ? ", levels beyond the 12 most frequent counted as Other" : ""}.`);
        }
        break;
      }
      case "mean-series": {
        const tr = ms.find((m) => m.pattern === "trend"), sh = ms.find((m) => m.pattern === "shift");
        const d = tr?.measured;
        if (d?.unit) {
          const values = (d.points ?? []).filter((p) => p.n > 0).map((p) => p.mean);
          const k = values.length > 1 ? Stats.kendall(values) : null;
          const s = values.length > 2 ? Stats.levelShift(values) : null;
          const start = (d.points ?? []).find((p) => p.n > 0);
          if (k) out.push(`Mean ${b} by ${d.unit}, ${values.length} periods with rows: Kendall's tau ${fmt(k.tau)}; Sen's slope ${fmt(k.slope, 4)} a ${d.unit}${tr.result?.slope ? ci(tr.result.slope.ci, 4) : ""}.`);
          if (s && !s.failed) {
            const after = (d.points ?? []).filter((p) => p.n > 0)[s.shift.at];
            out.push(`The largest shift: from ${fmt(s.shift.before, 4)} to ${fmt(s.shift.after, 4)} (${fmt(s.shift.value, 4)}, ${fmt(sh?.effect?.value ?? s.effect.value)} long-run SD) from ${after ? periodText(after.p, d.unit) : "–"}${start ? `; the series starts ${periodText(start.p, d.unit)}` : ""}.`);
          }
        }
        break;
      }
      case "period-heatmap": {
        const p = fam.measures.periods[`${a}\u0000${b}`];
        if (p?.unit) out.push(`Cramér's V (bias-corrected) ${fmt(p.v, 3)} between the ${p.unit} of ${a} and ${b}, over ${whole(p.n)} rows.`);
        break;
      }
      default: break;
    }
    const f = cand.features;
    out.push(`${whole(f.used)} of ${whole(f.rows)} rows have every field of the chart (${pct(f.complete)}).`);
    return out;
  }

  /** The statistical status of one chart: each hypothesis it shows, tested or why not. */
  function status(cand, fam, keys) {
    const ms = membersOf(cand, keys);
    if (!ms.length) return [`Descriptive only: catalogue v${Family.CATALOGUE} has no test for a ${Grammar.KIND[cand.kind].label.toLowerCase()}.`];
    return ms.map((m) => {
      const what = Family.PATTERNS[/** @type {keyof typeof Family.PATTERNS} */ (m.pattern)].label;
      if (m.status !== "tested") return `${what[0].toUpperCase()}${what.slice(1)} (hypothesis ${m.id}): ${m.reason}`;
      const r = m.result;
      const stat = `${r.statistic.name} ${fmt(r.statistic.value, 3)}${r.df.length ? `, df ${r.df.map((d) => fmt(d, 1)).join(" and ")}` : ""}`;
      const extra = r.test === "T6" ? `; ${whole(r.permutations)} permutations, seed ${r.seed}, Monte Carlo SE ${fmt(r.mcse, 4)}` : r.test === "T5" ? `; odds ratio ${fmt(r.effect.value)}${ci(r.effect.ci)}` : "";
      const adj = m.adjusted === null ? "no adjusted p-value while the family is incomplete" : `adjusted p-value ${pval(m.adjusted)}${m.flag ? ": exploratory evidence" : ""}`;
      return `${what[0].toUpperCase()}${what.slice(1)} (hypothesis ${m.id}): ${Family.TESTS[/** @type {keyof typeof Family.TESTS} */ (m.test)]} (${m.test}), ${stat}${extra}; n ${whole(r.n)}; raw p ${pval(m.p)}, ${adj} (Benjamini–Yekutieli over the ${fam.m} tests of family ${fam.name}, run ${fam.run}). ${m.note ? `${m.note} ` : ""}${m.assumption}`;
    });
  }

  /**
   * The explanation of one ranked chart: Observed (its numbers), Why highlighted (its rule scores and places),
   * the statistical status and the fixed cautions.
   * @param {any} cand @param {any} ranked rank()'s answer @param {any} fam @param {{ errors?: Record<string, { count: number, sentinels: number }>, sample?: any }} [o]
   */
  function explain(cand, ranked, fam, o = {}) {
    const e = ranked.entries.get(cand.id);
    if (!e) return null;
    const keys = Family.byKey(fam);
    const u = e.usefulness;
    const why = [`Unusualness ${fmt(e.unusualness, 3)} = usefulness ${fmt(u.score, 3)} × complete rows ${pct(e.complete)} − penalties ${fmt(e.penalty, 2)}.`,
      u.name === "none" ? `Usefulness 0: ${u.why}` : `Usefulness: ${u.name} ${fmt(u.value, 3)} against the large value ${u.name === "bimodality coefficient" ? `above ${LARGE.bc}` : fmt(u.large, 3)}.`];
    if (e.density !== null) why.push(`Information density: ${pct(e.density)} of bins or cells hold rows.`);
    why.push(e.penalties.length ? `Penalties: ${e.penalties.map((p) => `${p.text} (${p.amount})`).join("; ")}.` : "No penalty.");
    const pu = ranked.places.unusual.get(cand.id), ps = ranked.places.supported.get(cand.id);
    why.push(`Place ${pu} of ${ranked.unusual.length} in Unusual patterns${ps ? `, and ${ps} of ${ranked.supported.length} in Statistically supported patterns (adjusted p-value ${pval(e.adjusted)}, at most 0.05)` : ""}.`);
    const size = ranked.clusters.get(e.cluster) ?? 1;
    why.push(`Redundancy cluster ${e.cluster}: ${size === 1 ? "no other chart" : `${size - 1} other chart${size === 2 ? "" : "s"}`} with the same hypothesis or substitute fields.`);
    const cautions = [];
    const pattern = Grammar.KIND[cand.kind].pattern;
    if (["QxQ", "CxQ", "CxC", "TxC"].includes(pattern)) cautions.push(CAUTIONS.cause, CAUTIONS.third);
    if (pattern === "TxQ" || pattern === "time-count" || pattern === "TxC") cautions.push(CAUTIONS.time);
    if (pattern === "distribution" || pattern === "levels") cautions.push(CAUTIONS.rare);
    for (const f of cand.fields) {
      const err = o.errors?.[f];
      if (err?.count) cautions.push(`Possible data error: ${f} holds ${whole(err.count)} suspected data error${err.count === 1 ? "" : "s"} (see Inspect)${err.sentinels ? `; the ${whole(err.sentinels)} stand-in${err.sentinels === 1 ? " is" : "s are"} left out of these numbers` : ""}.`);
    }
    if (o.sample) cautions.push(`Sampling: the table is a seeded sample of ${whole(o.sample.rows)} rows (seed ${o.sample.seed}), not every row of the file.`);
    if (cand.facts?.scatterSample) cautions.push(`The figure draws a seeded sample of ${whole(cand.facts.scatterSample.rows)} points; the numbers use every complete row.`);
    if (e.supported) cautions.push(CAUTIONS.evidence);
    cautions.push(...(fam.cautions ?? []));
    return { id: cand.id, title: e.title, kind: cand.kind, fields: cand.fields, cluster: e.cluster, unusualness: e.unusualness, adjusted: e.adjusted,
      observed: observed(cand, fam, keys), why, status: status(cand, fam, keys), cautions,
      transform: (cand.spec?.transform ?? []).map((t) => transformText(t, cand.spec)), scores: { usefulness: u, complete: e.complete, density: e.density, penalties: e.penalties } };
  }

  /** One transformation of a chart's specification in words. */
  function transformText(t, spec) {
    switch (t.op) {
      case "complete": return t.mode === "label-and-either" ? "Rows with a label and at least one end." : `Rows with a value in ${t.fields.join(", ")}.`;
      case "bin": return t.bins ? `${t.bins} equal bins.` : "Freedman–Diaconis bins, 5 to 100.";
      case "bin2d": return `A ${t.cells[0]} × ${t.cells[1]} grid of cells.`;
      case "box": return `Box statistics, whiskers at ${t.whisker} × IQR.`;
      case "top": return `The ${t.n} most frequent levels of ${spec?.encoding[t.channel]?.field ?? t.channel}, the rest as Other.`;
      case "period": return t.unit === "auto" ? "Periods by the rule: the coarsest unit giving at least 20." : `Periods of one ${t.unit}.`;
      case "aggregate": return t.fn === "count" ? "Counts." : t.fn === "mean" ? "Means with 95% t intervals." : "Sums.";
      case "sample": return `All points up to ${whole(t.rows)}, else a seeded sample (seed ${t.seed}).`;
      case "merge-duplicates": return "Events with the same label and date merged, with a count.";
      case "order-check": return `Ends at or after starts in at least ${pct(t.min)} of rows.`;
      case "page": return `${t.size} events a figure, page ${t.page}.`;
      default: return t.op;
    }
  }

  return { LARGE, PENALTY, SUBSTITUTE, HIGHLIGHTS, CAUTIONS, features, usefulness, score, substitutes, clusterOf, distinct, highlightCount, rank, explain, transformText, periodText, pval };
});
