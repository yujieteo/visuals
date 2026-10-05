/* Universal Data Workbench: what each chart draws, computed with the engine under the fixed rules of grammar v1.
 *
 * compute(query, spec, ctx) runs the queries of src/chartsql.js for one validated specification and returns its
 * panels (one, or one a facet level), the scales' shared domains and the facts the figure states: rows used, rows
 * left out because a value was missing, a sample, the period, values that could not be placed. A candidate whose
 * rule fails on the data (an interval timeline whose ends come before their starts too often, a chart with no
 * complete row) comes back with `excluded` and the reason.
 *
 * The rules (grammar.md): Freedman–Diaconis bins clamped to 5–100 (40 × 40 cells for binned heatmaps); the top 29
 * levels by count, or 12 for groups and heatmap axes, and the rest as Other; the coarsest period of hour, day, week,
 * month, quarter or year giving at least 20 periods, at most 500; means with n and a 95% t interval; a scatter of
 * every point up to 50,000, else a seeded sample of 50,000; timelines of 500 events a figure, in time order.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./grammar.js"), require("./chartspec.js"), require("./chartsql.js"), require("./render.js"), require("./stats.js"));
  else root.DWCharts = factory(root.DWGrammar, root.DWChartSpec, root.DWChartSql, root.DWRender, root.DWStats);
})(typeof self !== "undefined" ? self : this, function (Grammar, ChartSpec, ChartSql, Render, Stats) {
  "use strict";

  const SCATTER_MAX = 50000;
  const MAX_PERIODS = 500;
  const MIN_PERIODS = 20;

  const { tCdf, tQuantile, meanInterval } = Stats;

  /* ---------- fixed rules ---------- */

  /** Freedman–Diaconis: bin width 2 · IQR · n^(-1/3), the count clamped to 5–100; equal-width bins over [lo, hi]. */
  function fdBins(n, lo, hi, q1, q3) {
    const span = hi - lo;
    if (!(span > 0)) return { bins: 1, width: 1, lo: lo - 0.5, raw: 1 };
    const h = 2 * (q3 - q1) * Math.cbrt(n) ** -1;
    const raw = h > 0 ? Math.ceil(span / h) : 100;
    const bins = Math.min(100, Math.max(5, raw));
    return { bins, width: span / bins, lo, raw };
  }

  const UNITS = Render.UNITS;
  /** The units a precision allows, coarsest first: a date has no hours, a year only years. Decades, centuries and
   * millennia are never chosen by the rule; they only keep a span of more than 500 years within 500 periods. */
  const ALLOWED = { year: ["year"], mixed: ["year", "quarter", "month", "week", "day"], day: ["year", "quarter", "month", "week", "day"], time: ["year", "quarter", "month", "week", "day", "hour"] };
  const floorPeriod = Render.floorPeriod, nextPeriod = Render.nextPeriod;

  /** The periods from the one holding lo to the one holding hi, at most `cap` + 1 of them. */
  function periodsBetween(lo, hi, unit, cap = MAX_PERIODS) {
    const out = [];
    for (let p = floorPeriod(lo, unit); p <= hi && out.length <= cap; p = nextPeriod(p, unit)) out.push(p);
    return out;
  }

  /**
   * The period of a time series: the coarsest unit giving at least 20 periods, else the finest the precision
   * allows; never more than 500 periods. For dates with mixed precision, a unit is used only when at most 5% of the
   * values are too coarse to place in it. `want` other than "auto" is the person's choice.
   * @param {{ lo: number, hi: number, n: number, p_year: number, p_month: number }} range
   */
  function choosePeriod(range, precision, want = "auto") {
    const allowed = ALLOWED[/** @type {keyof typeof ALLOWED} */ (precision ?? "day")] ?? ALLOWED.day;
    const unplaced = (unit) => (precision !== "mixed" ? 0 : (["quarter", "month", "week", "day"].includes(unit) ? range.p_year : 0) + (["week", "day"].includes(unit) ? range.p_month : 0));
    let unit = want;
    if (want === "auto" || !allowed.includes(want)) {
      const usable = allowed.filter((u) => unplaced(u) <= 0.05 * range.n);
      const list = usable.length ? usable : ["year"];
      unit = list.find((u) => periodsBetween(range.lo, range.hi, u).length >= MIN_PERIODS) ?? list[list.length - 1];
    }
    const asked = unit;
    // Coarser until at most 500 periods: past years, 10, 100 or 1,000 years a period.
    while (periodsBetween(range.lo, range.hi, unit).length > MAX_PERIODS && UNITS.indexOf(unit) > 0) unit = UNITS[UNITS.indexOf(unit) - 1];
    return { unit, asked, periods: periodsBetween(range.lo, range.hi, unit), unplaced: unplaced(unit), chosen: want !== "auto" && allowed.includes(want) };
  }

  /* ---------- computing a chart ---------- */

  /**
   * A field of the table as the SQL reads it.
   * @typedef {{ name: string, cls: string, reading: any, textSource: boolean, type: string, precision: string | null, levels: number,
   *   ordered: boolean, zone: string, logRule: boolean, min: number | null, unit: string, additive: boolean }} TableField
   * @typedef {{ table: string, rowColumn: string, rows: number, sample: any, fields: Record<string, TableField> }} Context
   */

  const step = (spec, id) => spec.transform.find((/** @type {any} */ t) => t.id === id);
  const fieldOf = (ctx, spec, channel) => ctx.fields[spec.encoding[channel].field];
  const isLog = (spec, channel) => spec.scale[channel]?.type === "log10";

  /** Panels by facet level, in the facet's level order; one panel without a facet. */
  function panelsOf(rows, facetLevels, make) {
    if (!facetLevels) return [{ facet: null, ...make(rows) }];
    return facetLevels.map((level) => ({ facet: level, ...make(rows.filter((r) => r.f === level)) }));
  }

  /** Order the kept levels: by count, or by value (numbers, dates, yes or no) for ordered categories. */
  function orderLevels(rows, ordered) {
    const list = rows.map((r) => ({ level: r.level, key: r.sort_key, n: r.n }));
    if (ordered) list.sort((a, b) => (a.key ?? 0) - (b.key ?? 0) || String(a.level).localeCompare(String(b.level)));
    return list;
  }

  /**
   * Compute what a validated specification draws.
   * @param {(sql: string) => Promise<any[]>} query @param {any} spec @param {Context} ctx
   */
  async function compute(query, spec, ctx) {
    const facetField = spec.layout.facet ? ctx.fields[spec.layout.facet.field] : null;
    const columns = {}, require = [];
    if (facetField) {
      columns.f = ChartSql.category(facetField).label;
      require.push("f");
    }
    const rel = (cols, req, either) => ChartSql.relation({ table: ctx.table, rowColumn: ctx.rowColumn, columns: { ...columns, ...cols }, require: [...require, ...req], either });
    const facts = { rows: ctx.rows, used: 0, left: 0, sample: ctx.sample ?? null, scatterSample: null, notes: /** @type {string[]} */ ([]), period: null, levelsOther: null };
    /** The facet levels present, in their order. */
    let facetLevels = null;
    if (facetField) {
      const lv = await query(ChartSql.levels(rel({}, []), "f", "f", 12));
      facetLevels = orderLevels(lv, facetField.ordered).map((r) => r.level);
    }
    const done = (used, extra) => {
      facts.used = used;
      facts.left = Math.max(0, ctx.rows - used);
      if (!used) return { excluded: "No row has a value present for every field of the chart." };
      return { kind: spec.kind, facts, facets: facetLevels, ...extra };
    };
    const cat = (f) => ChartSql.category(f);
    const tim = (f) => ChartSql.time(f);
    const meas = (f, log) => ChartSql.measure({ ...f, log });

    switch (spec.kind) {
      case "histogram": {
        const x = fieldOf(ctx, spec, "x");
        const r = rel({ x: meas(x, isLog(spec, "x")) }, ["x"]);
        const s = (await query(ChartSql.numbers(r, ["x"])))[0];
        if (!s.n) return done(0);
        const bin = step(spec, "bin:x");
        let b = fdBins(s.n, s.x_lo, s.x_hi, s.x_q1, s.x_q3);
        if (bin.bins) b = { ...b, bins: bin.bins, width: (s.x_hi - s.x_lo) / bin.bins || 1 };
        const rows = await query(ChartSql.histogram(r, b.lo, b.width, b.bins, !!facetField));
        const panels = panelsOf(rows, facetLevels, (list) => {
          const counts = new Array(b.bins).fill(0);
          for (const row of list) counts[row.bin] += row.n;
          return { counts };
        });
        return done(s.n, { x: { lo: b.lo, hi: b.lo + b.width * b.bins, width: b.width, bins: b.bins, rule: bin.bins ? "set" : "freedman-diaconis", fd: b.raw }, panels });
      }
      case "box": {
        const y = fieldOf(ctx, spec, "y");
        const r = rel({ x: meas(y, isLog(spec, "y")) }, ["x"]);
        const [stats, outs] = [await query(ChartSql.box(r, !!facetField, false)), await query(ChartSql.outliers(r, !!facetField, false))];
        const used = stats.reduce((a, s) => a + s.n, 0);
        const panels = panelsOf(stats, facetLevels, (list) => ({ boxes: list.map((s) => ({ group: null, ...s, outliers: outs.filter((o) => o.f === s.f).map((o) => ({ x: o.x, n: o.n })) })) }));
        return done(used, { panels });
      }
      case "bar": {
        const x = fieldOf(ctx, spec, "x");
        const c = cat(x);
        const r = rel({ c: c.label, k: c.key }, ["c"]);
        const n = step(spec, "top:x").n;
        const top = await query(ChartSql.levels(r, "c", "k", n));
        if (!top.length) return done(0);
        const levels = orderLevels(top, spec.scale.x?.order === "value");
        const total = top[0].rows, otherN = total - top.reduce((a, l) => a + l.n, 0), otherLevels = top[0].levels - top.length;
        facts.levelsOther = otherLevels > 0 ? { levels: otherLevels, n: otherN } : null;
        let panels;
        if (facetField) {
          const rows = await query(ChartSql.grouped(`SELECT *, ${ChartSql.kept("c", top.map((l) => l.level))} AS g FROM (${r})`, { f: "f", g: "g" }, false));
          panels = panelsOf(rows, facetLevels, (list) => ({ bars: barsOf(levels, list, otherLevels) }));
        } else {
          panels = [{ facet: null, bars: [...levels.map((l) => ({ level: l.level, n: l.n, other: false })), ...(otherLevels > 0 ? [{ level: `Other (${otherLevels} levels)`, n: otherN, other: true }] : [])] }];
        }
        return done(total, { levels: levels.map((l) => l.level), panels });
      }
      case "count-series": case "mean-series": case "period-heatmap": {
        const tf = fieldOf(ctx, spec, "x");
        const t = tim(tf);
        const cols = { t: t.t, p: t.precision };
        const req = ["t"];
        let yField = null, cField = null;
        if (spec.kind === "mean-series") {
          yField = fieldOf(ctx, spec, "y");
          cols.y = meas(yField, false);
          req.push("y");
        }
        if (spec.kind === "period-heatmap") {
          cField = fieldOf(ctx, spec, "y");
          const c = cat(cField);
          Object.assign(cols, { c: c.label, k: c.key });
          req.push("c");
        }
        const r = rel(cols, req);
        const range = (await query(ChartSql.timeRange(r)))[0];
        if (!range.n) return done(0);
        const per = choosePeriod(range, tf.precision, step(spec, "period:x").unit);
        facts.period = per.unit;
        if (per.unit !== per.asked) facts.notes.push(`By ${per.asked}, the span would need more than ${MAX_PERIODS} periods: drawn by ${per.unit}.`);
        if (per.unplaced) facts.notes.push(`${per.unplaced} value${per.unplaced === 1 ? " is" : "s are"} known only to the ${per.unit === "week" || per.unit === "day" ? "year or month" : "year"} and cannot be placed in a ${per.unit}: not drawn.`);
        const placed = `SELECT * FROM (${r}) WHERE ${ChartSql.placeable("p", per.unit)}`;
        if (spec.kind === "period-heatmap") {
          const top = await query(ChartSql.levels(placed, "c", "k", step(spec, "top:y").n));
          const levels = orderLevels(top, spec.scale.y?.order === "value");
          const otherLevels = (top[0]?.levels ?? 0) - top.length;
          const rows = await query(ChartSql.grouped(`SELECT *, ${ChartSql.kept("c", top.map((l) => l.level))} AS g FROM (${placed})`, { ...(facetField ? { f: "f" } : {}), p: ChartSql.period("t", per.unit), g: "g" }, false));
          const used = rows.reduce((a, x) => a + x.n, 0);
          const ylevels = [...levels.map((l) => l.level), ...(otherLevels > 0 ? [`Other (${otherLevels} levels)`] : [])];
          const panels = panelsOf(rows, facetLevels, (list) => ({ cells: list.map((x) => ({ p: x.p, g: x.g === null ? ylevels[ylevels.length - 1] : x.g, n: x.n })) }));
          return done(used, { unit: per.unit, periods: per.periods, ylevels, panels });
        }
        const rows = await query(ChartSql.grouped(placed, { ...(facetField ? { f: "f" } : {}), p: ChartSql.period("t", per.unit) }, !!yField));
        const used = rows.reduce((a, x) => a + x.n, 0);
        const fn = step(spec, "aggregate")?.fn ?? "count";
        const panels = panelsOf(rows, facetLevels, (list) => ({
          series: per.periods.map((p) => {
            const row = list.find((x) => x.p === p);
            if (!yField) return { p, n: row?.n ?? 0 };
            if (!row) return { p, n: 0, value: null, lo: null, hi: null };
            const ci = fn === "mean" ? meanInterval(row.n, row.mean, row.sd) : { lo: null, hi: null };
            return { p, n: row.n, value: fn === "sum" ? row.total : row.mean, ...ci };
          }),
        }));
        return done(used, { unit: per.unit, periods: per.periods, fn, panels });
      }
      case "scatter": {
        const x = fieldOf(ctx, spec, "x"), y = fieldOf(ctx, spec, "y");
        const r = rel({ x: meas(x, isLog(spec, "x")), y: meas(y, isLog(spec, "y")) }, ["x", "y"]);
        const s = (await query(ChartSql.numbers(r, ["x", "y"])))[0];
        if (!s.n) return done(0);
        const sample = step(spec, "sample");
        const sampled = s.n > SCATTER_MAX ? { rows: SCATTER_MAX, seed: sample.seed, of: s.n } : null;
        facts.scatterSample = sampled;
        const rows = await query(ChartSql.points(r, !!facetField, sampled));
        const panels = panelsOf(rows, facetLevels, (list) => ({ xs: list.map((p) => p.x), ys: list.map((p) => p.y) }));
        return done(s.n, { x: { lo: s.x_lo, hi: s.x_hi }, y: { lo: s.y_lo, hi: s.y_hi }, panels });
      }
      case "binned-heatmap": {
        const x = fieldOf(ctx, spec, "x"), y = fieldOf(ctx, spec, "y");
        const r = rel({ x: meas(x, isLog(spec, "x")), y: meas(y, isLog(spec, "y")) }, ["x", "y"]);
        const s = (await query(ChartSql.numbers(r, ["x", "y"])))[0];
        if (!s.n) return done(0);
        const cells = step(spec, "bin2d").cells;
        const ax = { lo: s.x_lo, width: (s.x_hi - s.x_lo) / cells[0] || 1, n: cells[0] }, ay = { lo: s.y_lo, width: (s.y_hi - s.y_lo) / cells[1] || 1, n: cells[1] };
        const rows = await query(ChartSql.bins2d(r, ax, ay, cells, !!facetField));
        const panels = panelsOf(rows, facetLevels, (list) => ({ cells: list.map((c) => ({ i: c.i, j: c.j, n: c.n })) }));
        return done(s.n, { x: { ...ax, hi: ax.lo + ax.width * ax.n }, y: { ...ay, hi: ay.lo + ay.width * ay.n }, max: Math.max(...rows.map((c) => c.n)), panels });
      }
      case "box-by-group": case "mean-bar": {
        const x = fieldOf(ctx, spec, "x"), y = fieldOf(ctx, spec, "y");
        const c = cat(x);
        const box = spec.kind === "box-by-group";
        const r = rel({ c: c.label, k: c.key, [box ? "x" : "y"]: meas(y, box && isLog(spec, "y")) }, ["c", box ? "x" : "y"]);
        const top = await query(ChartSql.levels(r, "c", "k", step(spec, "top:x").n));
        if (!top.length) return done(0);
        const levels = orderLevels(top, spec.scale.x?.order === "value");
        const otherLevels = top[0].levels - top.length;
        const groups = [...levels.map((l) => l.level), ...(otherLevels > 0 ? [`Other (${otherLevels} levels)`] : [])];
        const mapped = `SELECT *, ${ChartSql.kept("c", top.map((l) => l.level))} AS g FROM (${r})`;
        const name = (g) => (g === null ? groups[groups.length - 1] : g);
        if (box) {
          const stats = await query(ChartSql.box(mapped, !!facetField, true));
          const outs = await query(ChartSql.outliers(mapped, !!facetField, true));
          const used = stats.reduce((a, s) => a + s.n, 0);
          const panels = panelsOf(stats, facetLevels, (list) => ({ boxes: list.map((s) => ({ ...s, group: name(s.g), outliers: outs.filter((o) => o.f === s.f && o.g === s.g).map((o) => ({ x: o.x, n: o.n })) })) }));
          return done(used, { groups, other: otherLevels > 0 ? groups[groups.length - 1] : null, panels });
        }
        const fn = step(spec, "aggregate").fn;
        const rows = await query(ChartSql.grouped(mapped, { ...(facetField ? { f: "f" } : {}), g: "g" }, true));
        const used = rows.reduce((a, s) => a + s.n, 0);
        const panels = panelsOf(rows, facetLevels, (list) => ({
          bars: list.map((s) => ({ group: name(s.g), n: s.n, value: fn === "sum" ? s.total : s.mean, sd: s.sd, ...(fn === "mean" ? meanInterval(s.n, s.mean, s.sd) : { lo: null, hi: null }) })),
        }));
        return done(used, { groups, other: otherLevels > 0 ? groups[groups.length - 1] : null, fn, panels });
      }
      case "count-heatmap": {
        const xf = fieldOf(ctx, spec, "x"), yf = fieldOf(ctx, spec, "y");
        const cx = cat(xf), cy = cat(yf);
        const r = rel({ cx: cx.label, kx: cx.key, cy: cy.label, ky: cy.key }, ["cx", "cy"]);
        const tx = await query(ChartSql.levels(r, "cx", "kx", step(spec, "top:x").n));
        const ty = await query(ChartSql.levels(r, "cy", "ky", step(spec, "top:y").n));
        if (!tx.length) return done(0);
        const lx = orderLevels(tx, spec.scale.x?.order === "value"), ly = orderLevels(ty, spec.scale.y?.order === "value");
        const ox = tx[0].levels - tx.length, oy = ty[0].levels - ty.length;
        const xlevels = [...lx.map((l) => l.level), ...(ox > 0 ? [`Other (${ox} levels)`] : [])];
        const ylevels = [...ly.map((l) => l.level), ...(oy > 0 ? [`Other (${oy} levels)`] : [])];
        const mapped = `SELECT *, ${ChartSql.kept("cx", tx.map((l) => l.level))} AS gx, ${ChartSql.kept("cy", ty.map((l) => l.level))} AS gy FROM (${r})`;
        const rows = await query(ChartSql.grouped(mapped, { ...(facetField ? { f: "f" } : {}), gx: "gx", gy: "gy" }, false));
        const used = rows.reduce((a, s) => a + s.n, 0);
        const panels = panelsOf(rows, facetLevels, (list) => ({ cells: list.map((s) => ({ x: s.gx ?? xlevels[xlevels.length - 1], y: s.gy ?? ylevels[ylevels.length - 1], n: s.n })) }));
        return done(used, { xlevels, ylevels, other: { x: ox > 0, y: oy > 0 }, max: Math.max(...rows.map((s) => s.n)), panels });
      }
      case "point-timeline": {
        const tf = fieldOf(ctx, spec, "x"), lf = fieldOf(ctx, spec, "label");
        const t = tim(tf);
        const r = rel({ t: t.t, p: t.precision, q: t.qualified, raw: t.raw, label: ChartSql.label(lf) }, ["t", "label"]);
        const page = step(spec, "page");
        const rows = await query(ChartSql.pointEvents(r, page.page, page.size));
        const first = rows[0];
        if (!first) {
          // A page past the last: the pages follow the events once duplicates merge, not the rows.
          const n = (await query(ChartSql.count(r)))[0].n;
          if (!n) return done(0);
          const events = (await query(ChartSql.pointEventCount(r)))[0].n;
          return done(n, { events: [], page: { page: page.page, pages: Math.max(1, Math.ceil(events / page.size)), size: page.size, events, merged: 0 }, panels: [{ facet: null }] });
        }
        const pages = Math.max(1, Math.ceil(first.events / page.size));
        if (first.merged) facts.notes.push(`${first.merged} event${first.merged === 1 ? "" : "s"} with the same label and date ${first.merged === 1 ? "merges" : "merge"} several rows, shown with a count (×n).`);
        return done(first.rows, { zone: tf.zone, precision: tf.precision, events: rows.map((e) => ({ label: e.label, t: e.t, p: e.p, q: !!e.q, raw: e.raw, n: e.n, first: e.first })),
          page: { page: page.page, pages, size: page.size, events: first.events, merged: first.merged }, panels: [{ facet: null }] });
      }
      case "interval-timeline": {
        const sf = fieldOf(ctx, spec, "x"), ef = fieldOf(ctx, spec, "x2"), lf = fieldOf(ctx, spec, "label");
        const s = tim(sf), e = tim(ef);
        const r = rel({ s: s.t, ps: s.precision, qs: s.qualified, sraw: s.raw, e: e.t, pe: e.precision, qe: e.qualified, eraw: e.raw, label: ChartSql.label(lf) }, ["label"], ["s", "e"]);
        const check = (await query(ChartSql.intervalCheck(r)))[0];
        if (!check.rows) return done(0);
        const min = step(spec, "order").min;
        if (!check.both_ends) return { excluded: `No row has both a start (${sf.name}) and an end (${ef.name}).` };
        const share = check.ordered / check.both_ends;
        if (share < min) return { excluded: `${sf.name} to ${ef.name}: the end is at or after the start in ${(Math.floor(share * 1000) / 10).toFixed(1)}% of the ${check.both_ends} rows with both, below the 90% the rule needs.` };
        const page = step(spec, "page");
        const rows = await query(ChartSql.intervalEvents(r, page.page, page.size));
        const range = (await query(ChartSql.intervalRange(r)))[0];
        const head = rows[0] ?? { events: 0, merged: 0, reversed: check.both_ends - check.ordered, rows: check.rows };
        if (head.reversed) facts.notes.push(`${head.reversed} row${head.reversed === 1 ? " ends" : "s end"} before ${head.reversed === 1 ? "its" : "their"} start: not drawn.`);
        if (check.no_start) facts.notes.push(`${check.no_start} interval${check.no_start === 1 ? " has" : "s have"} no start: drawn open to the left edge, "start unknown".`);
        if (check.no_end) facts.notes.push(`${check.no_end} interval${check.no_end === 1 ? " has" : "s have"} no end: drawn open to the right edge, "end unknown".`);
        if (head.merged) facts.notes.push(`${head.merged} interval${head.merged === 1 ? "" : "s"} with the same label, start and end ${head.merged === 1 ? "merges" : "merge"} several rows, shown with a count (×n).`);
        // Rows used are the rows drawn: a row whose end comes before its start is counted in a note, not as used.
        const drawn = done(check.rows - (check.both_ends - check.ordered), { zone: sf.zone, share, range: { lo: range.lo, hi: range.hi },
          events: rows.map((x) => ({ label: x.label, s: x.s, e: x.e, ps: x.ps, pe: x.pe, qs: !!x.qs, qe: !!x.qe, sraw: x.sraw, eraw: x.eraw, n: x.n, first: x.first })),
          page: { page: page.page, pages: Math.max(1, Math.ceil(head.events / page.size)), size: page.size, events: head.events, merged: head.merged }, panels: [{ facet: null }] });
        facts.left = Math.max(0, ctx.rows - check.rows);
        return drawn;
      }
      default:
        throw new Error(`no computation for ${spec.kind}`);
    }
  }

  /** A faceted bar chart's bars in one panel: every kept level, then Other. */
  function barsOf(levels, rows, otherLevels) {
    const n = (g) => rows.find((r) => r.g === g)?.n ?? 0;
    return [...levels.map((l) => ({ level: l.level, n: n(l.level), other: false })), ...(otherLevels > 0 ? [{ level: `Other (${otherLevels} levels)`, n: n(null), other: true }] : [])];
  }

  /**
   * What the rules need of a table's fields (ChartSpec's Context and this file's): the grammar's class and levels
   * with the profile's reading, the log rule, the smallest value and the zone of times.
   * @param {any[]} classes Grammar.classify results @param {any[]} columns the profiles @param {Record<string, boolean>} additive
   */
  function fieldInfo(classes, columns, additive = {}) {
    /** @type {Record<string, TableField>} */
    const out = {};
    for (const f of classes) {
      const col = columns.find((c) => c.name === f.name) ?? {};
      const s = col.summary?.kind === "numeric" ? col.summary : null;
      const zoned = col.reading?.kind === "datetime-zoned" || /WITH TIME ZONE/i.test(col.sourceType ?? "");
      out[f.name] = {
        name: f.name, cls: f.cls, levels: f.levels, reading: col.reading ?? { kind: "text" }, textSource: !!col.textSource, type: col.type ?? "",
        precision: f.precision, ordered: f.cls === "C" && (col.type === "integer" || col.type === "decimal" || col.type === "boolean" || col.role === "ordered category" || col.type === "date" || col.type === "datetime"),
        zone: f.cls === "T" ? (zoned ? "utc" : col.type === "datetime" ? "unknown" : "none") : "none",
        logRule: !!s && s.min > 0 && s.p1 > 0 && s.p99 / s.p1 >= 1000, min: s ? s.min : null, unit: col.unit ?? "", additive: !!additive[f.name],
      };
    }
    return out;
  }

  /**
   * The search of one table: each column's class, the candidates of grammar v1 and the context the rules read.
   * @param {{ name: string, rowColumn: string, rows: number, sample: any, columns: any[], additive?: Record<string, boolean> }} t
   *   columns: every column's profile in order, a column not profiled as { name, position, notProfiled: true }
   */
  function prepare(t) {
    const classes = Grammar.classifyAll(t.columns);
    const plan = Grammar.enumerate(t.name, classes);
    const ctx = { table: t.name, rowColumn: t.rowColumn, rows: t.rows, sample: t.sample ?? null, fields: fieldInfo(classes, t.columns.filter((c) => !c.notProfiled), t.additive ?? {}) };
    return { classes, plan, ctx };
  }

  /**
   * The ranking's rejection rules on the data (spec.md, "Ranking"): a chart with fewer than 5 complete rows, or an
   * encoded field with one value only among them (zero variance), is excluded and never ranked. Labels may repeat.
   * Returns the reason, or "".
   * @param {(sql: string) => Promise<any[]>} query @param {any} spec @param {Context} ctx
   */
  async function rejection(query, spec, ctx) {
    const kind = Grammar.KIND[spec.kind];
    const columns = {}, require = [], either = [], checked = [];
    if (spec.layout.facet) {
      columns.f = ChartSql.category(ctx.fields[spec.layout.facet.field]).label;
      require.push("f");
    }
    kind.channels.forEach((channel, i) => {
      const f = fieldOf(ctx, spec, channel);
      const alias = `c${i}`;
      columns[alias] = f.cls === "Q" ? ChartSql.measure({ ...f, log: isLog(spec, channel) }) : f.cls === "C" ? ChartSql.category(f).label : f.cls === "T" ? ChartSql.time(f).t : ChartSql.label(f);
      if (spec.kind === "interval-timeline" && channel !== "label") either.push(alias); else require.push(alias);
      if (f.cls !== "L") checked.push({ alias, name: f.name });
    });
    const rel = ChartSql.relation({ table: ctx.table, rowColumn: ctx.rowColumn, columns, require, either });
    const r = (await query(ChartSql.check(rel, checked.map((c) => c.alias))))[0];
    if (!r.n) return "No row has a value present for every field of the chart.";
    if (r.n < 5) return `Only ${r.n} row${r.n === 1 ? " has" : "s have"} a value present for every field of the chart: the ranking needs at least 5.`;
    const flat = checked.filter((c) => r[`${c.alias}_one`]).map((c) => c.name);
    if (flat.length) return `Zero variance: every complete row has the same ${flat.join(" and the same ")}.`;
    return "";
  }

  /**
   * One candidate's outcome: its specification validated, computed and drawn. An invalid specification or a rule
   * that fails on the data excludes it with the reason; an error of the engine is thrown for the caller to sort
   * into failed or incomplete (cancelled, the memory budget).
   * @param {(sql: string) => Promise<any[]>} query @param {any} spec @param {Context} ctx
   */
  async function evaluate(query, spec, ctx) {
    const v = ChartSpec.validate(spec, ctx);
    if (!v.ok) return { outcome: "excluded", reason: `Invalid specification: ${v.errors.join("; ")}` };
    const rejected = await rejection(query, spec, ctx);
    if (rejected) return { outcome: "excluded", reason: rejected };
    const data = await compute(query, spec, ctx);
    if (data.excluded) return { outcome: "excluded", reason: data.excluded };
    return { outcome: "valid", reason: "", data, drawn: Render.render(spec, data) };
  }

  return { SCATTER_MAX, prepare, evaluate, rejection, tQuantile, tCdf, meanInterval, fdBins, floorPeriod, nextPeriod, periodsBetween, choosePeriod, compute, fieldInfo };
});
