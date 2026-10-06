/* Universal Data Workbench: the hypothesis family of a table, its tests and the Benjamini–Yekutieli adjustment.
 *
 * One family per analysed table per run (each imported table automatically, each subset the person opens as a
 * family of its own). Its members are enumerated from the fields' classes before any test, ranking or highlight
 * (catalog.md): each pair of measures a monotone association (T1); each category and measure a group difference
 * (T2 or T3); each pair of categories one association (T4, T5 or T6 by eligibility); each time and measure a trend
 * (T7) and a level shift (T8). Each hypothesis has one id, hash(family, pattern, sorted fields, grammar and
 * catalogue versions), so the scatter plot and the binned heatmap of one pair test it once.
 *
 *   members(classes)        the members, in a fixed order
 *   run(query, o)           enumerate, check independence, compute what each test needs (src/statsql.js), then decide
 *   decide(family, study)   eligibility, the tests and the adjustment, from what was computed: a change of the
 *                           study details decides again without a query
 *
 * Statistics use the rows of the chart with every field present, less the values the profile flags as stand-ins
 * for no value (open sentinels), which are counted apart: patterns are measured in usable data.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./grammar.js"), require("./chartsql.js"), require("./charts.js"), require("./stats.js"), require("./statsql.js"), require("./sha256.js"));
  else root.DWFamily = factory(root.DWGrammar, root.DWChartSql, root.DWCharts, root.DWStats, root.DWStatSql, root.DWSha256);
})(typeof self !== "undefined" ? self : this, function (Grammar, ChartSql, Charts, Stats, StatSql, Sha) {
  "use strict";

  const CATALOGUE = "1";
  const ALPHA = 0.05;
  const SEED = 20261005;
  const MAX_GROUPS = 12;
  const REPEATED = 0.1;
  const SERIAL = { r: 0.3, p: 0.01 };

  /** The tests of catalogue v1 by id. */
  const TESTS = {
    T1: "Spearman's rank correlation", T2: "Welch's two-sample t-test", T3: "Welch's one-way ANOVA", T4: "Pearson's chi-square test of independence",
    T5: "Fisher's exact test", T6: "Permutation test of independence", T7: "Mann–Kendall trend test with the Hamed–Rao correction", T8: "CUSUM level-shift test",
  };

  /** The pattern classes the family tests, with the chart kinds that show each and whether its tests assume independent rows. */
  const PATTERNS = {
    monotone: { label: "monotone association", classes: ["Q", "Q"], kinds: ["scatter", "binned-heatmap"], tests: "T1", independent: true },
    difference: { label: "group difference", classes: ["C", "Q"], kinds: ["box-by-group", "mean-bar"], tests: "T2 or T3", independent: true },
    association: { label: "association of categories", classes: ["C", "C"], kinds: ["count-heatmap"], tests: "T4, T5 or T6", independent: true },
    trend: { label: "trend over time", classes: ["T", "Q"], kinds: ["mean-series"], tests: "T7", independent: false },
    shift: { label: "level shift over time", classes: ["T", "Q"], kinds: ["mean-series"], tests: "T8", independent: false },
  };

  const DESIGNS = ["unknown", "simple random", "stratified", "clustered", "convenience"];
  /** No study details: the tests that assume independent rows run, tagged as an assumption. */
  const NO_STUDY = { independent: "unknown", repeated: "", design: "unknown" };

  const pct = (share) => `${(Math.round(share * 1000) / 10).toLocaleString("en-US")}%`;
  const fmt = (x, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d }) : String(x));
  const plural = (n, one, many) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

  /** The members of a family, from the classes of its fields, in a fixed order. @param {{ name: string, cls: string, position: number }[]} classes */
  function members(classes) {
    const of = (cls) => classes.filter((f) => f.cls === cls).sort((a, b) => a.position - b.position);
    const Q = of("Q"), C = of("C"), T = of("T");
    /** @type {{ pattern: string, fields: string[] }[]} */
    const out = [];
    Q.forEach((a, i) => Q.slice(i + 1).forEach((b) => out.push({ pattern: "monotone", fields: [a.name, b.name] })));
    C.forEach((c) => Q.forEach((q) => out.push({ pattern: "difference", fields: [c.name, q.name] })));
    C.forEach((a, i) => C.slice(i + 1).forEach((b) => out.push({ pattern: "association", fields: [a.name, b.name] })));
    T.forEach((t) => Q.forEach((q) => { out.push({ pattern: "trend", fields: [t.name, q.name] }); out.push({ pattern: "shift", fields: [t.name, q.name] }); }));
    return out;
  }

  /** The documented size of a table's family: C(q,2) + qc + C(c,2) + 2tq. */
  const size = ({ q, c, t }) => (q * (q - 1)) / 2 + q * c + (c * (c - 1)) / 2 + 2 * t * q;

  /** A hypothesis's key within a family: its pattern and its fields in sorted order. */
  const keyOf = (pattern, fields) => `${pattern}\u0000${[...fields].sort().join("\u0000")}`;

  /** A hypothesis id: hash(family, pattern, sorted fields, grammar version, catalogue version), the first 12 hex digits of SHA-256. */
  function hypothesisId(family, pattern, fields) {
    const h = Sha.create();
    h.update(new TextEncoder().encode(JSON.stringify([family, pattern, [...fields].sort(), Grammar.VERSION, CATALOGUE])));
    return `h${h.hex().slice(0, 12)}`;
  }

  /** A seed for one permutation test: the first eight hex digits of its hypothesis id. */
  const seedOf = (id) => parseInt(id.slice(1, 9), 16) >>> 0;

  /** The T6 result of a table that T4's rule refuses and Fisher's test does not take, or null; computed once, in the run. */
  function permutationOf(t, id) {
    if (t.length < 2 || t[0].length < 2 || (t.length === 2 && t[0].length === 2) || Stats.expectedRule(t).ok) return null;
    return Stats.permutation(t, { seed: seedOf(id) });
  }

  /** The patterns a chart kind shows: a mean time series shows a trend and a level shift. */
  const patternsOfKind = (kind) => Object.entries(PATTERNS).filter(([, p]) => p.kinds.includes(kind)).map(([id]) => id);

  /* ---------- what each test needs, from the engine ---------- */

  /**
   * The open stand-ins of each numeric field, by field: suspected errors the person has neither approved as missing
   * (the profile then reads them as missing) nor dismissed (then they are values like any other).
   * @param {any[]} columns the profiles @param {string[]} [dismissed] the ids of dismissed suggestions
   */
  function sentinelsOf(columns, dismissed = []) {
    /** @type {Record<string, number[]>} */
    const out = {};
    for (const c of columns) {
      const list = (c.errors ?? []).filter((e) => e.kind === "sentinel" && !dismissed.includes(`${c.name}::sentinel::${e.examples[0]}`))
        .map((e) => Number(e.examples[0])).filter(Number.isFinite);
      if (list.length) out[c.name] = list;
    }
    return out;
  }

  /**
   * Run a family: enumerate its members, check independence, compute what each test and each descriptive measure
   * needs, then decide. Cancel (o.stopped) leaves the family incomplete, with no adjusted p-values.
   * @param {(sql: string) => Promise<any[]>} query
   * @param {{ table: string, name: string, run: number, subset?: { field: string, level: string } | null, ctx: any, classes: any[], columns: any[],
   *   dismissed?: string[], study?: any, stopped?: () => boolean, progress?: (text: string, done: number, total: number) => void }} o
   */
  async function run(query, o) {
    const ctx = o.ctx;
    const subset = o.subset ?? null;
    const classes = o.classes.filter((f) => !subset || f.name !== subset.field);
    const fields = classes.filter((f) => f.cls !== "excluded");
    const counts = { q: 0, c: 0, t: 0 };
    for (const f of fields) if (f.cls === "Q" || f.cls === "C" || f.cls === "T") counts[/** @type {"q" | "c" | "t"} */ (f.cls.toLowerCase())] += 1;
    const list = members(classes).map((m) => ({ ...m, id: hypothesisId(o.name, m.pattern, m.fields), key: keyOf(m.pattern, m.fields) }));
    const sentinels = sentinelsOf(o.columns, o.dismissed ?? []);
    const fam = {
      name: o.name, table: o.table, run: o.run, subset, catalogue: CATALOGUE, grammar: Grammar.VERSION, alpha: ALPHA, method: "Benjamini–Yekutieli",
      counts, size: size(counts), definition: definition(o.name, counts, subset),
      members: list.map((m) => ({ id: m.id, key: m.key, pattern: m.pattern, fields: m.fields, measured: null })),
      measures: { shape: {}, levels: {}, counts: {}, periods: {} }, sentinels, rows: subset ? null : ctx.rows,
      independence: { repeated: [], serial: [], checked: [] }, status: "running", reason: "", study: { ...NO_STUDY },
    };
    const field = (name) => Charts.readOf(ctx, name);
    const rel = (cols, req) => {
      const columns = { ...cols }, require = [...req];
      if (subset) { columns.s = ChartSql.category(field(subset.field)).label; require.push("s"); }
      const r = ChartSql.relation({ table: Charts.source(ctx), rowColumn: ctx.rowColumn, columns, require });
      return subset ? StatSql.within(r, subset.level) : r;
    };
    const meas = (name) => StatSql.usable(ChartSql.measure({ ...field(name), log: false }), sentinels[name] ?? []);
    const cat = (name) => {
      const c = ChartSql.category(field(name));
      const s = sentinels[name] ?? [];
      return { field: name, key: c.key, label: s.length ? `CASE WHEN (${c.key}) NOT IN (${s.join(", ")}) THEN ${c.label} END` : c.label };
    };
    const tim = (name) => ChartSql.time(field(name));

    /** The period means (or counts) of a time field, by the rule of the mean time series. */
    async function series(t, q) {
      const tm = tim(t);
      const cols = { t: tm.t, p: tm.precision, ...(q ? { y: meas(q) } : {}) };
      const r = rel(cols, q ? ["t", "y"] : ["t"]);
      const range = (await query(ChartSql.timeRange(r)))[0];
      if (!range?.n) return { unit: null, points: [], periods: 0, unplaced: 0 };
      const per = Charts.choosePeriod(range, field(t).precision, "auto");
      const rows = await query(ChartSql.grouped(`SELECT * FROM (${r}) WHERE ${ChartSql.placeable("p", per.unit)}`, { p: ChartSql.period("t", per.unit) }, !!q));
      const by = new Map(rows.map((x) => [x.p, x]));
      const points = per.periods.map((p) => ({ p, n: by.get(p)?.n ?? 0, mean: by.get(p)?.mean ?? null }));
      return { unit: per.unit, points, periods: per.periods.length, unplaced: per.unplaced };
    }

    /**
     * The groups of a category against a measure as the chart draws them, its 12 most frequent levels and Other, for
     * the descriptive effect of a category of more than 12 levels (no test takes so many groups).
     */
    async function drawnGroups(k, q) {
      const r = rel({ c: k.label, k: k.key, x: meas(q) }, ["c", "x"]);
      const lv = await kept(r, "c", "k", k.field);
      const other = `Other (${lv.other} levels)`;
      const rows = (await query(StatSql.groups(StatSql.keptLevels(r, lv.levels, other)))).map((g) => ({ level: g.level, n: g.n, mean: g.mean, var: g.var }));
      const at = (l) => (l === other ? lv.levels.length : lv.levels.indexOf(l));
      return rows.sort((x, y) => at(x.level) - at(y.level));
    }

    /** Category levels in their chart order, the 12 most frequent kept and the rest as Other. */
    async function kept(r, a, k, name) {
      const top = await query(ChartSql.levels(r, a, k, MAX_GROUPS));
      const ordered = field(name).ordered;
      const lv = top.map((l) => ({ level: l.level, key: l.sort_key, n: l.n }));
      if (ordered) lv.sort((x, y) => (x.key ?? 0) - (y.key ?? 0) || String(x.level).localeCompare(String(y.level)));
      const other = (top[0]?.levels ?? 0) - top.length;
      return { levels: lv.map((l) => l.level), other };
    }

    /** A table of counts of two categories (each its 12 most frequent levels and Other), or of periods by a category. */
    function crossTable(rows, xs, ys, xOther, yOther, xk = "gx", yk = "gy") {
      const xl = [...xs, ...(xOther ? [null] : [])], yl = [...ys, ...(yOther ? [null] : [])];
      const t = xl.map(() => yl.map(() => 0));
      for (const row of rows) {
        const i = xl.indexOf(row[xk] ?? null), j = yl.indexOf(row[yk] ?? null);
        if (i >= 0 && j >= 0) t[i][j] += row.n;
      }
      const keepRows = t.map((r) => r.some((x) => x > 0));
      const keepCols = yl.map((_, j) => t.some((r) => r[j] > 0));
      const name = (l, other) => (l === null ? `Other (${other} levels)` : l);
      return { table: t.filter((_, i) => keepRows[i]).map((r) => r.filter((_, j) => keepCols[j])),
        rows: xl.filter((_, i) => keepRows[i]).map((l) => name(l, xOther)), cols: yl.filter((_, j) => keepCols[j]).map((l) => name(l, yOther)) };
    }

    const steps = [];
    // Independence first: an identifier that repeats, then serial correlation of each measure in each time's order.
    for (const c of o.columns) {
      if (c.role !== "identifier" || !c.identifier || !(c.valued > 0)) continue;
      const share = c.identifier.repeats / c.valued;
      fam.independence.checked.push(`${c.name}: ${pct(share)} of its values repeat an earlier one.`);
      if (share >= REPEATED) fam.independence.repeated.push({ field: c.name, share, repeats: c.identifier.repeats, valued: c.valued });
    }
    const T = fields.filter((f) => f.cls === "T"), Q = fields.filter((f) => f.cls === "Q"), C = fields.filter((f) => f.cls === "C");
    for (const t of T) for (const q of Q) steps.push({ text: `serial correlation of ${q.name} in ${t.name} order`, run: async () => {
      const s = (await query(StatSql.serial(rel({ t: tim(t.name).t, x: meas(q.name) }, ["t", "x"]))))[0];
      const r1 = s.den > 0 ? s.num / s.den : 0;
      const p = s.n > 3 ? Stats.normSf((r1 + 1 / s.n) * Math.sqrt(s.n)) : 1;
      fam.independence.serial.push({ time: t.name, field: q.name, n: s.n, r1, p, flagged: r1 > SERIAL.r && p < SERIAL.p });
    } });
    // Descriptive measures of single fields, which the ranking reads.
    for (const q of Q) steps.push({ text: `the shape of ${q.name}`, run: async () => {
      const s = (await query(StatSql.shape(rel({ x: meas(q.name) }, ["x"]))))[0];
      fam.measures.shape[q.name] = { ...Stats.shape({ n: s.n, skew: s.skew, kurt: s.kurt, rare: s.rare }), median: s.med, mad: s.mad };
    } });
    for (const c of C) steps.push({ text: `the levels of ${c.name}`, run: async () => {
      const k = cat(c.name);
      const lv = await query(ChartSql.levels(rel({ c: k.label, k: k.key }, ["c"]), "c", "k", Grammar.MAX_LEVELS));
      fam.measures.levels[c.name] = { levels: lv.length, names: lv.slice(0, MAX_GROUPS).map((l) => l.level), rarity: lv.length <= 29 ? Stats.rarity(lv.map((l) => ({ level: l.level, n: l.n }))) : null };
    } });
    for (const t of T) steps.push({ text: `the counts over ${t.name}`, run: async () => {
      const s = await series(t.name, null);
      fam.measures.counts[t.name] = describeSeries(s, s.points.map((p) => p.n));
    } });
    for (const t of T) for (const c of C) steps.push({ text: `${c.name} over ${t.name}`, run: async () => {
      const tm = tim(t.name), k = cat(c.name);
      const r = rel({ t: tm.t, p: tm.precision, c: k.label, k: k.key }, ["t", "c"]);
      const range = (await query(ChartSql.timeRange(r)))[0];
      if (!range?.n) { fam.measures.periods[`${t.name}\u0000${c.name}`] = { n: 0, v: 0, unit: null }; return; }
      const per = Charts.choosePeriod(range, field(t.name).precision, "auto");
      const placed = `SELECT * FROM (${r}) WHERE ${ChartSql.placeable("p", per.unit)}`;
      const lv = await kept(placed, "c", "k", c.name);
      const rows = await query(ChartSql.grouped(`SELECT *, ${ChartSql.kept("c", lv.levels)} AS g FROM (${placed})`, { p: ChartSql.period("t", per.unit), g: "g" }, false));
      const x = crossTable(rows, per.periods, lv.levels, 0, lv.other, "p", "g");
      const n = x.table.reduce((a, row) => a + row.reduce((b, v) => b + v, 0), 0);
      fam.measures.periods[`${t.name}\u0000${c.name}`] = { n, unit: per.unit, v: x.table.length > 1 && x.cols.length > 1 ? Stats.cramerV(Stats.chiStatistic(x.table), n, x.table.length, x.cols.length) : 0 };
    } });
    // What each member's test needs; a trend and a level shift of one pair share their series.
    const shared = new Map();
    fam.members.forEach((m) => steps.push({ text: `${PATTERNS[/** @type {keyof typeof PATTERNS} */ (m.pattern)].label} of ${m.fields.join(" and ")}`, run: async () => {
      const [a, b] = m.fields;
      {
        if (m.pattern === "monotone") {
          const s = (await query(StatSql.spearman(rel({ x: meas(a), y: meas(b) }, ["x", "y"]))))[0];
          m.measured = { n: s.n, rho: s.rho, distinct: [s.dx, s.dy] };
        } else if (m.pattern === "difference") {
          const k = cat(a);
          const groups = (await query(StatSql.groups(rel({ c: k.label, k: k.key, x: meas(b) }, ["c", "x"])))).map((g) => ({ level: g.level, key: g.sort_key, n: g.n, mean: g.mean, var: g.var, skew: g.skew, med: g.med, mad: g.mad, far: g.far }));
          if (field(a).ordered) groups.sort((x, y) => (x.key ?? 0) - (y.key ?? 0) || String(x.level).localeCompare(String(y.level)));
          m.measured = { groups, drawn: groups.length > MAX_GROUPS ? await drawnGroups(k, b) : null };
        } else if (m.pattern === "association") {
          const ka = cat(a), kb = cat(b);
          const r = rel({ cx: ka.label, kx: ka.key, cy: kb.label, ky: kb.key }, ["cx", "cy"]);
          const lx = await kept(r, "cx", "kx", a), ly = await kept(r, "cy", "ky", b);
          const mapped = `SELECT *, ${ChartSql.kept("cx", lx.levels)} AS gx, ${ChartSql.kept("cy", ly.levels)} AS gy FROM (${r})`;
          const rows = await query(ChartSql.grouped(mapped, { gx: "gx", gy: "gy" }, false));
          const x = crossTable(rows, lx.levels, ly.levels, lx.other, ly.other);
          m.measured = { ...x, merged: [lx.other, ly.other], permutation: permutationOf(x.table, m.id) };
        } else {
          const key = `${a}\u0000${b}`;
          if (!shared.has(key)) shared.set(key, series(a, b));
          m.measured = { ...(await shared.get(key)) };
        }
      }
    } }));
    // A stop keeps what was computed; an engine error (the memory budget, for one) stops the run with its reason, and
    // the family is incomplete: an adjustment over fewer members than the family's would understate every p-value.
    let done = 0;
    for (const s of steps) {
      if (o.stopped?.()) break;
      o.progress?.(`Statistics of ${o.name}: ${done + 1} of ${steps.length} (${s.text})`, done, steps.length);
      try {
        await s.run();
      } catch (error) {
        if (!o.stopped?.()) fam.reason = `the engine stopped at ${s.text}: ${String(error?.message ?? error).split("\n")[0].slice(0, 200)}`;
        break;
      }
      done += 1;
    }
    if (done < steps.length) { fam.status = "incomplete"; fam.reason ||= "you cancelled"; }
    else fam.status = "complete";
    return decide(fam, o.study ?? NO_STUDY);
  }

  /** The trend and largest shift of a series, as descriptive measures (no test). */
  function describeSeries(s, values) {
    const k = values.length > 1 ? Stats.kendall(values) : null;
    const shift = values.length > 2 ? Stats.levelShift(values) : null;
    // A series that only steps, with no noise about its two levels, shifts by an unbounded number of SDs.
    return { unit: s.unit, periods: values.length, tau: k ? k.tau : 0, shiftSd: shift && !shift.failed && !Number.isNaN(shift.effect.value) ? shift.effect.value : 0, shift: shift?.shift ?? null };
  }

  /** The family's definition in words. */
  function definition(name, counts, subset) {
    const scope = subset ? `the rows of the table where ${subset.field} is ${subset.level}` : "every row of the table";
    return `Family ${name}: over ${scope}, every hypothesis of catalogue v${CATALOGUE} that the fields' classes give, enumerated before any test: `
      + `each pair of measures a monotone association (T1), each category and measure a group difference (T2 or T3), each pair of categories `
      + `an association (T4, T5 or T6), each time and measure a trend (T7) and a level shift (T8). q = ${counts.q}, c = ${counts.c}, t = ${counts.t}: `
      + `C(q,2) + qc + C(c,2) + 2tq = ${size(counts)} members.`;
  }

  /* ---------- deciding ---------- */

  /** Why a test that assumes independent rows does not apply to a member, or "". */
  function dependence(fam, m, study) {
    if (study.independent === "no") return "Not tested: you said the observations are not independent.";
    if (repeatedBy(study)) return `Not tested: you said the rows hold repeated measurements by ${repeatedBy(study)}.`;
    if (study.design === "clustered") return "Not tested: you said the sample is clustered, and this test assumes independent rows.";
    const rep = fam.independence.repeated[0];
    if (rep) return `Not tested: independence contradicted. The identifier ${rep.field} repeats in ${pct(rep.share)} of its values (repeated measurements).`;
    const s = fam.independence.serial.find((x) => x.flagged && m.fields.includes(x.field));
    if (s) return `Not tested: independence contradicted. ${s.field} has a lag-1 autocorrelation of ${fmt(s.r1)} (p ${s.p < 0.001 ? "< 0.001" : fmt(s.p, 3)}) in the order of ${s.time}.`;
    return "";
  }

  /** The field the person said holds repeated measurements (study.repeated "field:<name>"), or "". */
  const repeatedBy = (study) => (String(study.repeated ?? "").startsWith("field:") ? String(study.repeated).slice(6) : "");

  /** The normality support of a group: n at least 30, or |skewness| at most 1 and no value with robust z above 5. */
  function support(g) {
    if (g.n >= 30) return "";
    if (g.skew === null || Math.abs(g.skew) > 1) return `${g.level} has ${g.n} rows (fewer than 30) and skewness ${g.skew === null ? "unknown" : fmt(g.skew)}`;
    const z = g.mad > 0 ? g.far / (1.4826 * g.mad) : g.far > 0 ? Infinity : 0;
    if (z > 5) return `${g.level} has ${g.n} rows (fewer than 30) and a value with robust z ${Number.isFinite(z) ? fmt(z, 1) : "beyond any bound"}`;
    return "";
  }

  /** The regular periods of a series: those with a value; regular when at most 10% of the periods between the first and last are empty. */
  function regular(s) {
    const pts = s.points ?? [];
    const first = pts.findIndex((p) => p.n > 0), last = pts.length - 1 - [...pts].reverse().findIndex((p) => p.n > 0);
    if (first < 0) return { values: [], empty: 0, span: 0, ok: false };
    const span = pts.slice(first, last + 1);
    const empty = span.filter((p) => p.n === 0).length;
    return { values: span.filter((p) => p.n > 0).map((p) => p.mean), empty, span: span.length, ok: empty <= 0.1 * span.length };
  }

  /** The test a member gets, or why none applies; the descriptive effect either way. */
  function judge(fam, m, study) {
    const pat = PATTERNS[/** @type {keyof typeof PATTERNS} */ (m.pattern)];
    const d = m.measured;
    if (!d) return { status: "not run", reason: "Not computed: the run stopped before this member.", effect: null };
    const out = (reason, effect) => ({ status: "not tested", reason, effect });
    const blocked = pat.independent ? dependence(fam, m, study) : "";
    if (m.pattern === "monotone") {
      const effect = Number.isFinite(d.rho) ? { name: "rho", value: d.rho } : null;
      if (blocked) return out(blocked, effect);
      if (d.n < 10) return out(`Not tested: ${plural(d.n, "complete pair", "complete pairs")}, fewer than the 10 T1 needs.`, effect);
      const few = m.fields.filter((_, i) => d.distinct[i] < 5);
      if (few.length) return out(`Not tested: ${few.join(" and ")} ${few.length === 1 ? "has" : "have"} fewer than 5 distinct values among the complete pairs.`, effect);
      if (!Number.isFinite(d.rho)) return out("Not tested: rho cannot be computed (a field without variance).", null);
      return { status: "tested", result: Stats.spearman({ n: d.n, rho: d.rho }), effect };
    }
    if (m.pattern === "difference") {
      const g = d.groups;
      const shown = d.drawn ?? g;
      const effect = shown.length === 2 && shown.every((x) => x.n > 1 && x.var !== null) ? { name: "Hedges' g", value: Stats.hedges(shown[0], shown[1]).value }
        : shown.length > 2 ? { name: "omega-squared", value: Stats.omegaSquared(shown.map((x) => ({ ...x, var: x.var ?? 0 }))) } : null;
      const good = effect && Number.isFinite(effect.value) ? effect : null;
      if (blocked) return out(blocked, good);
      if (g.length < 2) return out("Not tested: one group only.", null);
      if (g.length > MAX_GROUPS) return out(`Not tested: ${g.length} groups, more than the ${MAX_GROUPS} Welch's ANOVA takes.`, good);
      const small = g.find((x) => x.n < 5);
      if (small) return out(`Not tested: the group ${small.level} has ${plural(small.n, "row", "rows")}, fewer than 5.`, good);
      const flat = g.find((x) => !(x.var > 0));
      if (flat) return out(`Not tested: the group ${flat.level} has no variance.`, good);
      const weak = g.map(support).find(Boolean);
      if (weak) return out(`Not tested: no support for normality: ${weak}.`, good);
      return { status: "tested", result: g.length === 2 ? Stats.welchT(g[0], g[1]) : Stats.welchAnova(g), effect: good, groups: g.map((x) => x.level) };
    }
    if (m.pattern === "association") {
      const t = d.table;
      const n = t.reduce((a, r) => a + r.reduce((b, x) => b + x, 0), 0);
      const effect = t.length > 1 && t[0].length > 1 ? { name: "Cramér's V", value: Stats.cramerV(Stats.chiStatistic(t), n, t.length, t[0].length) } : null;
      if (blocked) return out(blocked, effect);
      if (t.length < 2 || t[0].length < 2) return out("Not tested: one level only among the complete rows.", null);
      const rule = Stats.expectedRule(t);
      if (rule.ok) return { status: "tested", result: Stats.chiSquare(t), effect };
      const why = `T4's rule fails (n ${n}, smallest expected count ${fmt(rule.min)}, ${pct(rule.share5)} of expected counts at least 5)`;
      if (t.length === 2 && t[0].length === 2) return { status: "tested", result: Stats.fisher(t), effect, note: `${why}: Fisher's exact test.` };
      return { status: "tested", result: d.permutation, effect, note: `${why}: a permutation test.` };
    }
    const reg = regular(d);
    const need = m.pattern === "trend" ? 12 : 20;
    const values = reg.values;
    const desc = m.pattern === "trend" ? (values.length > 1 ? { name: "Kendall's tau", value: Stats.kendall(values).tau } : null)
      : (() => { const s = values.length > 2 ? Stats.levelShift(values) : null; return s && !s.failed && !Number.isNaN(s.effect.value) ? { name: "shift in long-run SD", value: s.effect.value } : null; })();
    if (values.length < need) return out(`Not tested: ${plural(values.length, "period", "periods")} with a value (by ${d.unit ?? "period"}), fewer than the ${need} ${m.pattern === "trend" ? "T7" : "T8"} needs.`, desc);
    if (!reg.ok) return out(`Not tested: the periods are not regular: ${reg.empty} of ${reg.span} ${d.unit}s between the first and the last are empty (more than 10%).`, desc);
    const result = m.pattern === "trend" ? Stats.mannKendall(values) : Stats.levelShift(values);
    if (result.failed) return out(`Not tested: the test cannot be computed. ${result.failed}`, desc);
    return { status: "tested", result, effect: desc, unit: d.unit };
  }

  /**
   * Decide every member: its test or why none applies, then the Benjamini–Yekutieli adjustment over the tests that
   * ran (m). Tests are validated before the correction, which never repairs an invalid one. An incomplete family
   * gets no adjusted p-values.
   * @param {any} fam @param {any} study
   */
  function decide(fam, study) {
    const s = { ...NO_STUDY, ...(study ?? {}) };
    if (!DESIGNS.includes(s.design)) s.design = "unknown";
    const tag = s.independent === "yes" ? "Independence stated by you." : "Independence assumed, not confirmed.";
    const decided = fam.members.map((m) => {
      const j = judge(fam, m, s);
      const pat = PATTERNS[/** @type {keyof typeof PATTERNS} */ (m.pattern)];
      const result = j.result && Number.isFinite(j.result.p) ? j.result : null;
      const status = j.status === "tested" && !result ? "not tested" : j.status;
      return { ...m, status, reason: status === "tested" ? "" : j.reason || "Not tested: the test gave no p-value.", test: result ? result.test : null, result, effect: j.effect,
        note: j.note ?? "", unit: j.unit ?? null, groups: j.groups ?? null, assumption: result ? (pat.independent ? tag : "Temporal dependence allowed for: the test corrects for autocorrelation.") : "",
        p: result ? result.p : null, adjusted: null, flag: false };
    });
    const tested = decided.filter((m) => m.status === "tested");
    const complete = fam.status === "complete";
    if (complete) {
      const adj = Stats.by(tested.map((m) => m.p));
      tested.forEach((m, i) => { m.adjusted = adj[i]; m.flag = adj[i] <= ALPHA; });
    }
    return { ...fam, study: s, members: decided, m: tested.length, notTested: decided.length - tested.length, flagged: tested.filter((m) => m.flag).length,
      cautions: designCautions(s) };
  }

  /** What the study design means for every result, in words. */
  function designCautions(s) {
    const out = [];
    if (s.design === "stratified") out.push("A stratified sample: the tests ignore the strata and their weights.");
    if (s.design === "convenience") out.push("A convenience sample: the results describe these rows, not a population.");
    if (s.repeated === "none") out.push("You said no measurement repeats on one unit.");
    return out;
  }

  /** The tested members of a family by key, for the charts that show them. */
  const byKey = (fam) => new Map(fam.members.map((m) => [m.key, m]));

  return { CATALOGUE, ALPHA, SEED, TESTS, PATTERNS, DESIGNS, NO_STUDY, members, size, keyOf, hypothesisId, patternsOfKind, sentinelsOf, repeatedBy, run, decide, byKey, describeSeries };
});
