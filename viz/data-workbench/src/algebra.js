/* Universal Data Workbench: the table algebra of the visual controls, as SQL.
 *
 * A pipeline is a source table and a list of steps; each step is one operation with its parameters, and compiles
 * to one SELECT over its input. The pipeline as a whole is those SELECTs as a chain of WITH clauses, ending in an
 * explicit ORDER BY, so the SQL shown for the controls is the SQL that makes the result, and it can be opened and
 * changed in the SQL editor. Every operation of the whitelist has a step:
 *
 *   columns     choose, order and rename columns
 *   filter      keep rows by conditions (all or any); a comparison with a missing value is unknown, so drops the row
 *   sort        order rows; missing values last unless chosen first; ties keep the order before
 *   limit       the first n rows (after an offset) in the order in effect
 *   distinct    distinct rows of chosen columns; missing values count as one value
 *   compute     a new or replaced column: arithmetic, CASE, a cast (TRY_CAST), a filled missing value (coalesce),
 *               a date part or period start, a string function, a numeric function
 *   readings    columns read as the workbench reads them (the profile's readings, each a TRY_CAST)
 *   aggregate   group by columns (a missing key is its own group) with aggregates and statistics, and HAVING
 *   join        inner, left, right, full, cross, semi or anti, on key pairs (missing keys never match unless chosen)
 *   setop       UNION, UNION ALL, INTERSECT or EXCEPT with another table, by column name
 *   window      row numbers, ranks, lag and lead, running and rolling aggregates, shares of a total
 *   pivot       values of a column as columns, with an aggregate (the values listed in the SQL)
 *   unpivot     columns as name and value rows
 *   hierarchy   a WITH RECURSIVE walk of id and parent columns: each row's depth and root
 *
 * Visual controls always cast with TRY_CAST, so a value that does not convert becomes missing; each step lists its
 * conversions, and the record counts the values that did not convert. Tables have no order of their own: each
 * relation carries the order in effect (the source's row column, __row, by default), and every limit and the final
 * result use it explicitly.
 *
 * The page loads this file as a plain script (window.DWAlgebra); the checks load it with require().
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sql.js"));
  else root.DWAlgebra = factory(root.DWSql);
})(typeof self !== "undefined" ? self : this, function (Sql) {
  "use strict";

  const { ident, literal } = Sql;

  /** The operations, in the order the controls offer them, with their labels and what each does. */
  const OPS = [
    { id: "columns", label: "Choose columns", about: "Keep, order and rename columns." },
    { id: "filter", label: "Filter rows", about: "Keep the rows that meet conditions. A comparison with a missing value is unknown, so that row is dropped." },
    { id: "sort", label: "Sort", about: "Order the rows; missing values last unless you choose first. Ties keep the order before." },
    { id: "limit", label: "Limit", about: "Keep the first rows, in the order in effect." },
    { id: "distinct", label: "Distinct rows", about: "One row for each distinct combination of the chosen columns; missing values count as one value." },
    { id: "compute", label: "Compute a column", about: "Arithmetic, CASE, a cast, a filled missing value, or a date, text or number function." },
    { id: "readings", label: "Use the workbench's readings", about: "Read text columns as the profile reads them, such as numbers with thousands separators or dates." },
    { id: "aggregate", label: "Group and aggregate", about: "Groups by columns, with counts, sums, means, medians, spreads, quantiles and correlations; a missing key is its own group. HAVING keeps groups by an aggregate." },
    { id: "join", label: "Join a table", about: "Inner, left, right, full, cross, semi or anti join on key pairs. Missing keys never match unless you choose so." },
    { id: "setop", label: "Combine with a table", about: "UNION, UNION ALL, INTERSECT or EXCEPT, by column name. These compare missing values as equal." },
    { id: "window", label: "Window function", about: "Row numbers, ranks, lag and lead, running and rolling aggregates, shares of a total, within partitions." },
    { id: "pivot", label: "Pivot", about: "The values of a column become columns, each with an aggregate." },
    { id: "unpivot", label: "Unpivot", about: "Columns become rows of a name and a value." },
    { id: "hierarchy", label: "Walk a hierarchy", about: "A recursive walk of id and parent columns: each row's depth and its root." },
  ];
  const OP = Object.fromEntries(OPS.map((o) => [o.id, o]));

  const NUMERIC = /^(U?(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT)|FLOAT|DOUBLE|REAL|DECIMAL.*)$/i;
  const TIMEISH = /^(DATE|TIMESTAMP.*)$/i;
  const isNumeric = (type) => NUMERIC.test(String(type));
  const isText = (type) => String(type).toUpperCase() === "VARCHAR";
  /** A row column: an import's source positions (__row), carried through, or a joined table's. */
  const isRowColumn = (name) => /^__row/.test(name);
  const CASTS = ["DOUBLE", "BIGINT", "DATE", "TIMESTAMP", "BOOLEAN", "VARCHAR"];
  const AGG = {
    count: { label: "Rows (COUNT(*))", sql: () => "count(*)", column: false },
    count_values: { label: "Values present (COUNT(column))", sql: (c) => `count(${c})`, column: true },
    count_distinct: { label: "Distinct values", sql: (c) => `count(DISTINCT ${c})`, column: true },
    sum: { label: "Sum", sql: (c) => `sum(${c})`, column: true, numeric: true },
    mean: { label: "Mean", sql: (c) => `avg(${c})`, column: true, numeric: true },
    median: { label: "Median", sql: (c) => `median(${c})`, column: true, numeric: true },
    min: { label: "Minimum", sql: (c) => `min(${c})`, column: true },
    max: { label: "Maximum", sql: (c) => `max(${c})`, column: true },
    sd: { label: "Standard deviation (sample)", sql: (c) => `stddev_samp(${c})`, column: true, numeric: true },
    variance: { label: "Variance (sample)", sql: (c) => `var_samp(${c})`, column: true, numeric: true },
    quantile: { label: "Quantile", sql: (c, p) => `quantile_cont(${c}, ${Number(p)})`, column: true, numeric: true },
    corr: { label: "Correlation (Pearson) with a second column", sql: (c, _p, c2) => `corr(${c}, ${c2})`, column: true, numeric: true, second: true },
  };
  const WINDOW = {
    row_number: { label: "Row number", order: true },
    rank: { label: "Rank (ties share a rank, then skip)", order: true },
    dense_rank: { label: "Dense rank (ties share a rank)", order: true },
    lag: { label: "Value k rows before", column: true, order: true, k: true },
    lead: { label: "Value k rows after", column: true, order: true, k: true },
    running_sum: { label: "Running sum", column: true, numeric: true, order: true },
    running_mean: { label: "Running mean", column: true, numeric: true, order: true },
    rolling_mean: { label: "Rolling mean of k rows", column: true, numeric: true, order: true, k: true },
    rolling_sum: { label: "Rolling sum of k rows", column: true, numeric: true, order: true, k: true },
    rolling_min: { label: "Rolling minimum of k rows", column: true, numeric: true, order: true, k: true },
    rolling_max: { label: "Rolling maximum of k rows", column: true, numeric: true, order: true, k: true },
    share: { label: "Share of the partition's total", column: true, numeric: true, order: false },
  };
  const FILTER_OPS = { "=": "is", "<>": "is not", "<": "<", "<=": "≤", ">": ">", ">=": "≥", between: "between", contains: "contains", starts: "starts with", in: "is one of", missing: "is missing", present: "is present" };
  const JOINS = { inner: "INNER JOIN", left: "LEFT JOIN", right: "RIGHT JOIN", full: "FULL JOIN", cross: "CROSS JOIN", semi: "SEMI JOIN", anti: "ANTI JOIN" };
  const SETOPS = { union: "UNION", union_all: "UNION ALL", intersect: "INTERSECT", except: "EXCEPT" };
  const MAX_PIVOT = 50;
  const MAX_DEPTH = 100;

  /**
   * A relation the next step reads: its SQL name, its columns with DuckDB types, and the order in effect: a list
   * of { column, desc, nullsFirst }, or null for every column, left to right.
   * @typedef {{ ref: string, columns: { name: string, type: string }[], order: { column: string, desc?: boolean, nullsFirst?: boolean }[] | null }} Relation
   */

  /** The order of a table read as a source: its row columns, else every column. @param {{ name: string }[]} columns */
  function defaultOrder(columns) {
    const rows = columns.filter((c) => isRowColumn(c.name));
    return rows.length ? rows.map((c) => ({ column: c.name })) : null;
  }

  /** ORDER BY text of an order. */
  function orderSql(order) {
    if (!order || !order.length) return "ORDER BY ALL";
    return `ORDER BY ${order.map((o) => `${ident(o.column)}${o.desc ? " DESC" : ""}${o.nullsFirst ? " NULLS FIRST" : " NULLS LAST"}`).join(", ")}`;
  }

  /** An order in words, for the record. */
  function orderText(order) {
    if (!order || !order.length) return "every column, left to right, missing values last (the result has no row order of its own)";
    return order.map((o) => `${o.column}${o.desc ? " descending" : ""}${o.nullsFirst ? ", missing first" : ""}`).join(", then ");
  }

  /** A number from a control, or an error. */
  function num(v, what) {
    const x = typeof v === "number" ? v : Number(String(v ?? "").trim());
    if (String(v ?? "").trim() === "" || !Number.isFinite(x)) throw new Error(`${what} must be a number.`);
    return x;
  }
  /** A literal for a value typed in a control: a number for a numeric column, else text. */
  const valueFor = (type, v) => (isNumeric(type) ? String(num(v, "The value")) : literal(String(v ?? "")));

  /**
   * Compile one step over its input. Returns its SQL, the output's order, what the record counts (conversions,
   * comparisons that drop missing values, aggregated columns, a join, a set operation, a pivot) and notes.
   * @param {any} step @param {Relation} input @param {{ tables: Record<string, { columns: { name: string, type: string }[] }>, readings?: Record<string, any> }} catalog
   */
  function compileStep(step, input, catalog) {
    const cols = input.columns;
    const has = (name) => cols.find((c) => c.name === name);
    const need = (name, what = "column") => {
      const c = has(name);
      if (!c) throw new Error(`The ${what} ${JSON.stringify(name ?? "")} is not in this step's input.`);
      return c;
    };
    const conversions = [];
    /** The column as a number: itself when numeric, else TRY_CAST to DOUBLE, counted. */
    const asNumber = (name) => {
      const c = need(name);
      if (isNumeric(c.type)) return ident(name);
      conversions.push({ column: name, type: "DOUBLE" });
      return `TRY_CAST(${ident(name)} AS DOUBLE)`;
    };
    const asTime = (name) => {
      const c = need(name);
      if (TIMEISH.test(c.type)) return ident(name);
      conversions.push({ column: name, type: "TIMESTAMP" });
      return `TRY_CAST(${ident(name)} AS TIMESTAMP)`;
    };
    const out = { sql: "", order: input.order, conversions, nullDrops: /** @type {string[]} */ ([]), aggregates: /** @type {{ column: string, expr: string }[]} */ ([]),
      join: /** @type {any} */ (null), setop: /** @type {any} */ (null), pivot: /** @type {any} */ (null), unpivot: /** @type {any} */ (null), hierarchy: /** @type {any} */ (null),
      notes: /** @type {string[]} */ ([]) };
    const from = `FROM ${input.ref}`;
    const p = step;
    switch (p.op) {
      case "columns": {
        const keep = (p.keep ?? []).filter((x) => x);
        if (!keep.length) throw new Error("Choose at least one column.");
        const rows = cols.filter((c) => isRowColumn(c.name) && !keep.includes(c.name)).map((c) => c.name);
        const names = new Set();
        const list = [...rows, ...keep].map((name) => {
          need(name);
          const as = String(p.rename?.[name] ?? "").trim() || name;
          if (names.has(as)) throw new Error(`Two columns would be named ${as}.`);
          names.add(as);
          return as === name ? ident(name) : `${ident(name)} AS ${ident(as)}`;
        });
        out.sql = `SELECT ${list.join(", ")} ${from}`;
        const renamed = (n) => String(p.rename?.[n] ?? "").trim() || n;
        if (input.order && input.order.every((o) => rows.includes(o.column) || keep.includes(o.column))) out.order = input.order.map((o) => ({ ...o, column: renamed(o.column) }));
        else out.order = null;
        if (rows.length) out.notes.push(`The row column${rows.length > 1 ? "s" : ""} ${rows.join(", ")} ${rows.length > 1 ? "are" : "is"} kept, so the rows keep their order.`);
        break;
      }
      case "filter": {
        const conds = (p.conditions ?? []).map((c) => condition(c, need, asNumber, out));
        if (!conds.length) throw new Error("Add at least one condition.");
        out.sql = `SELECT * ${from} WHERE ${conds.join(p.match === "any" ? " OR " : " AND ")}`;
        break;
      }
      case "sort": {
        const keys = (p.keys ?? []).filter((k) => k.column);
        if (!keys.length) throw new Error("Choose a column to sort by.");
        for (const k of keys) need(k.column);
        const order = [...keys.map((k) => ({ column: k.column, desc: !!k.desc, nullsFirst: !!k.nullsFirst }))];
        // Ties keep the order in effect before: its keys follow, and every column when it had none.
        for (const o of input.order ?? []) if (!order.some((x) => x.column === o.column)) order.push(o);
        out.order = input.order ? order : [...order, ...cols.filter((c) => !order.some((x) => x.column === c.name)).map((c) => ({ column: c.name }))];
        out.sql = `SELECT * ${from} ${orderSql(out.order)}`;
        out.notes.push(`Missing values sort ${keys.some((k) => k.nullsFirst) ? "first where you chose so, else last" : "last"}.`);
        break;
      }
      case "limit": {
        const n = Math.floor(num(p.n, "The number of rows"));
        const offset = Math.floor(num(p.offset ?? 0, "The offset"));
        if (n < 0 || offset < 0) throw new Error("The number of rows and the offset must be 0 or more.");
        out.sql = `SELECT * ${from} ${orderSql(input.order)} LIMIT ${n}${offset ? ` OFFSET ${offset}` : ""}`;
        out.notes.push(`The first ${n} rows${offset ? ` after ${offset}` : ""} in the order of ${orderText(input.order)}.`);
        break;
      }
      case "distinct": {
        const chosen = (p.columns ?? []).filter((x) => x);
        const list = chosen.length ? chosen : cols.filter((c) => !isRowColumn(c.name)).map((c) => c.name);
        for (const c of list) need(c);
        out.sql = `SELECT DISTINCT ${list.map(ident).join(", ")} ${from}`;
        out.order = list.map((c) => ({ column: c }));
        out.notes.push("Rows that differ only in their row position are one row; missing values count as one value.");
        break;
      }
      case "compute": {
        const name = String(p.name ?? "").trim();
        if (!name) throw new Error("Name the new column.");
        if (isRowColumn(name)) throw new Error("A computed column cannot take a row column's name.");
        const expr = computed(p, need, asNumber, asTime, conversions);
        out.sql = has(name) ? `SELECT * REPLACE (${expr} AS ${ident(name)}) ${from}` : `SELECT *, ${expr} AS ${ident(name)} ${from}`;
        if (has(name)) out.notes.push(`${name} is replaced.`);
        break;
      }
      case "readings": {
        const readings = catalog.readings ?? {};
        const chosen = (p.columns ?? []).filter((c) => readings[c]);
        if (!chosen.length) throw new Error("No column of this input has a reading other than text: this step applies to an imported table's own columns.");
        for (const c of chosen) {
          need(c);
          conversions.push({ column: c, reading: readings[c] });
        }
        out.sql = `SELECT * REPLACE (${chosen.map((c) => `${Sql.typed(c, readings[c])} AS ${ident(c)}`).join(", ")}) ${from}`;
        out.notes.push("Each value that does not read under its column's reading becomes missing, and is counted.");
        break;
      }
      case "aggregate": {
        const by = (p.by ?? []).filter((x) => x);
        for (const b of by) need(b);
        const measures = (p.measures ?? []).filter((m) => m.fn);
        if (!measures.length && !by.length) throw new Error("Choose columns to group by or an aggregate.");
        const names = new Set(by);
        const list = measures.map((m) => {
          const a = AGG[m.fn];
          if (!a) throw new Error(`Unknown aggregate ${m.fn}.`);
          let c = "", c2 = "";
          if (a.column) {
            c = a.numeric ? asNumber(m.column) : ident(need(m.column).name);
            if (!out.aggregates.some((x) => x.expr === c)) out.aggregates.push({ column: m.column, expr: c });
          }
          if (a.second) c2 = asNumber(m.column2);
          if (m.fn === "quantile") {
            const q = num(m.p, "The quantile");
            if (!(q >= 0 && q <= 1)) throw new Error("The quantile must be from 0 to 1.");
          }
          const as = String(m.as ?? "").trim() || defaultName(m);
          if (names.has(as)) throw new Error(`Two columns would be named ${as}.`);
          names.add(as);
          return { sql: a.sql(c, m.p, c2), as };
        });
        const select = [...by.map(ident), ...list.map((m) => `${m.sql} AS ${ident(m.as)}`)];
        let having = "";
        if (p.having && p.having.measure) {
          const m = list.find((x) => x.as === p.having.measure);
          if (!m) throw new Error(`HAVING names ${p.having.measure}, which is not an aggregate of this step.`);
          if (!["=", "<>", "<", "<=", ">", ">="].includes(p.having.op)) throw new Error("Choose a comparison for HAVING.");
          having = ` HAVING ${m.sql} ${p.having.op} ${num(p.having.value, "The HAVING value")}`;
        }
        out.sql = `SELECT ${select.join(", ")} ${from}${by.length ? ` GROUP BY ${by.map(ident).join(", ")}` : ""}${having}`;
        out.order = by.length ? by.map((b) => ({ column: b })) : null;
        if (by.length) out.notes.push("Rows with a missing key form a group of their own.");
        if (measures.some((m) => AGG[m.fn].column)) out.notes.push("Aggregates skip missing values: the record shows COUNT(*) beside COUNT(column) for each.");
        break;
      }
      case "join": {
        const right = catalog.tables[p.table];
        if (!right) throw new Error(`Choose a table to join: ${JSON.stringify(p.table ?? "")} is not one.`);
        const kind = JOINS[p.kind] ? p.kind : "inner";
        const keys = kind === "cross" ? [] : (p.keys ?? []).filter((k) => k.left && k.right);
        if (kind !== "cross" && !keys.length) throw new Error("Choose at least one pair of key columns: joins are explicit, and matching names do not make a relationship.");
        const eq = p.nullsMatch ? "IS NOT DISTINCT FROM" : "=";
        /** One side's key: as it is, or TRY_CAST to the other side's type when one is text and the other is not. */
        const pair = (k) => {
          const l = need(k.left, "left key"), r = right.columns.find((c) => c.name === k.right);
          if (!r) throw new Error(`The key ${JSON.stringify(k.right)} is not a column of ${p.table}.`);
          // lkey and rkey read the column on its own side, for the join's diagnostics.
          let lkey = ident(l.name), rkey = ident(r.name);
          if (isText(l.type) && !isText(r.type)) { lkey = `TRY_CAST(${lkey} AS ${r.type})`; conversions.push({ column: l.name, type: r.type }); }
          else if (isText(r.type) && !isText(l.type)) { rkey = `TRY_CAST(${rkey} AS ${l.type})`; conversions.push({ column: r.name, type: l.type, table: p.table }); }
          return { le: lkey.replace(ident(l.name), `l.${ident(l.name)}`), re: rkey.replace(ident(r.name), `r.${ident(r.name)}`), lkey, rkey, left: l.name, right: r.name };
        };
        const pairs = keys.map(pair);
        const on = pairs.map((k) => `${k.le} ${eq} ${k.re}`).join(" AND ");
        let select = "l.*";
        if (kind !== "semi" && kind !== "anti") {
          const taken = new Set(cols.map((c) => c.name));
          const rightCols = right.columns.map((c) => {
            let as = isRowColumn(c.name) ? `${c.name}_${p.table}` : c.name;
            if (taken.has(as)) as = `${as}_${p.table}`;
            for (let i = 2; taken.has(as); i += 1) as = `${c.name}_${p.table}_${i}`;
            taken.add(as);
            return as === c.name ? `r.${ident(c.name)}` : `r.${ident(c.name)} AS ${ident(as)}`;
          });
          select = `l.*, ${rightCols.join(", ")}`;
          const rightRows = right.columns.filter((c) => isRowColumn(c.name)).map((c) => ({ column: `${c.name}_${p.table}` }));
          out.order = input.order ? [...input.order, ...rightRows] : null;
          if (kind === "right" || kind === "full") out.order = null;
        }
        out.sql = `SELECT ${select} FROM ${input.ref} AS l ${JOINS[kind]} ${ident(p.table)} AS r${on ? ` ON ${on}` : ""}`;
        out.join = { kind, table: p.table, keys: pairs, nullsMatch: !!p.nullsMatch };
        if (kind !== "cross") out.notes.push(p.nullsMatch ? "Missing keys match each other (IS NOT DISTINCT FROM)." : "A missing key never matches, not even another missing key.");
        break;
      }
      case "setop": {
        const right = catalog.tables[p.table];
        if (!right) throw new Error(`Choose a table to combine with: ${JSON.stringify(p.table ?? "")} is not one.`);
        const op = SETOPS[p.set] ? p.set : "union_all";
        const list = (p.columns ?? []).filter((x) => x);
        if (!list.length) throw new Error("Choose the columns to combine; both tables need each of them.");
        const rightSide = list.map((name) => {
          const l = need(name), r = right.columns.find((c) => c.name === name);
          if (!r) throw new Error(`${p.table} has no column ${JSON.stringify(name)}.`);
          if (r.type === l.type) return ident(name);
          conversions.push({ column: name, type: l.type, table: p.table });
          return `TRY_CAST(${ident(name)} AS ${l.type}) AS ${ident(name)}`;
        });
        out.sql = `SELECT ${list.map(ident).join(", ")} ${from} ${SETOPS[op]} SELECT ${rightSide.join(", ")} FROM ${ident(p.table)}`;
        out.order = list.map((c) => ({ column: c }));
        out.setop = { op, table: p.table };
        out.notes.push(op === "union_all" ? "Every row of both, duplicates kept." : `${SETOPS[op]} keeps distinct rows and compares missing values as equal.`);
        break;
      }
      case "window": {
        const w = WINDOW[p.fn];
        if (!w) throw new Error("Choose a window function.");
        const name = String(p.as ?? "").trim() || p.fn;
        if (has(name)) throw new Error(`${name} is a column already: name the new column.`);
        const partition = (p.partition ?? []).filter((x) => x);
        for (const c of partition) need(c);
        const keys = (p.order ?? []).filter((k) => k.column);
        for (const k of keys) need(k.column);
        if (w.order && !keys.length) throw new Error("Choose a column to order the rows by.");
        // Ties are broken by the order in effect, so the numbers are the same each time.
        const tie = (input.order ?? cols.map((c) => ({ column: c.name }))).filter((o) => !keys.some((k) => k.column === o.column));
        const ordered = [...keys.map((k) => ({ column: k.column, desc: !!k.desc })), ...tie];
        const over = `OVER (${partition.length ? `PARTITION BY ${partition.map(ident).join(", ")}` : ""}${w.order ? `${partition.length ? " " : ""}${orderSql(ordered)}` : ""}`;
        const k = w.k ? Math.floor(num(p.k, "k")) : 0;
        if (w.k && !(k >= 1 && k <= 1000)) throw new Error("k must be from 1 to 1,000.");
        const x = w.column ? (w.numeric ? asNumber(p.column) : ident(need(p.column).name)) : "";
        const frame = (n) => ` ROWS BETWEEN ${n} PRECEDING AND CURRENT ROW`;
        const expr = {
          row_number: () => `row_number() ${over})`, rank: () => `rank() ${over})`, dense_rank: () => `dense_rank() ${over})`,
          lag: () => `lag(${x}, ${k}) ${over})`, lead: () => `lead(${x}, ${k}) ${over})`,
          running_sum: () => `sum(${x}) ${over} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`,
          running_mean: () => `avg(${x}) ${over} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`,
          rolling_mean: () => `avg(${x}) ${over}${frame(k - 1)})`, rolling_sum: () => `sum(${x}) ${over}${frame(k - 1)})`,
          rolling_min: () => `min(${x}) ${over}${frame(k - 1)})`, rolling_max: () => `max(${x}) ${over}${frame(k - 1)})`,
          share: () => `${x} / sum(${x}) ${over})`,
        }[/** @type {keyof typeof WINDOW} */ (p.fn)]();
        out.sql = `SELECT *, ${expr} AS ${ident(name)} ${from}`;
        if (w.order) out.notes.push(`Ties are broken by ${orderText(tie.length ? tie : null)}.`);
        if (w.column) out.notes.push("Missing values are skipped by the aggregate; lag and lead give a missing value past the edge of a partition.");
        break;
      }
      case "pivot": {
        const rows = (p.rows ?? []).filter((x) => x);
        for (const c of rows) need(c);
        const on = need(p.on, "column to pivot on").name;
        if (rows.includes(on)) throw new Error("The column to pivot on cannot also be a row column.");
        const values = (p.values ?? []).filter((v) => v !== null && v !== undefined);
        if (!values.length) throw new Error(`${on} has no value present to make a column of.`);
        if (values.length > MAX_PIVOT) throw new Error(`${on} has ${values.length} values; a pivot makes at most ${MAX_PIVOT} columns. Filter or group first.`);
        const a = AGG[p.fn] ?? AGG.count;
        const x = a.column ? (a.numeric ? asNumber(p.column) : ident(need(p.column).name)) : "";
        if (a.column) out.aggregates.push({ column: p.column, expr: x });
        out.sql = `SELECT * FROM (PIVOT (SELECT ${[...rows, on, ...(a.column ? [p.column] : [])].filter((v, i, l) => l.indexOf(v) === i).map(ident).join(", ")} ${from}) ON ${ident(on)} IN (${values.map((v) => literal(String(v))).join(", ")}) USING ${a.sql(x, p.p)}${rows.length ? ` GROUP BY ${rows.map(ident).join(", ")}` : ""})`;
        out.order = rows.length ? rows.map((c) => ({ column: c })) : null;
        out.pivot = { on, values: values.map(String) };
        out.notes.push(`Rows whose ${on} is missing are in no column. The ${values.length} value${values.length === 1 ? "" : "s"} are listed in the SQL, so the result keeps its columns when it runs again.`);
        break;
      }
      case "unpivot": {
        const list = (p.columns ?? []).filter((x) => x);
        if (list.length < 1) throw new Error("Choose the columns to unpivot.");
        for (const c of list) need(c);
        const name = String(p.name ?? "").trim() || "name", value = String(p.value ?? "").trim() || "value";
        if (has(name) && !list.includes(name)) throw new Error(`${name} is a column already: choose another name.`);
        if (has(value) && !list.includes(value)) throw new Error(`${value} is a column already: choose another name.`);
        const types = [...new Set(list.map((c) => need(c).type))];
        // Columns of different types become one value column: as text, cast with TRY_CAST (every value converts).
        const replace = types.length > 1 ? list.map((c) => `TRY_CAST(${ident(c)} AS VARCHAR) AS ${ident(c)}`) : [];
        const inner = replace.length ? `(SELECT * REPLACE (${replace.join(", ")}) ${from})` : input.ref;
        out.sql = `SELECT * FROM (UNPIVOT ${inner}${p.keepMissing ? " INCLUDE NULLS" : ""} ON ${list.map(ident).join(", ")} INTO NAME ${ident(name)} VALUE ${ident(value)})`;
        out.order = input.order ? [...input.order, { column: name }] : null;
        out.unpivot = { columns: list, keepMissing: !!p.keepMissing };
        out.notes.push(p.keepMissing ? "Missing values are kept as rows." : "A missing value makes no row (UNPIVOT leaves it out); the record counts them.");
        if (types.length > 1) out.notes.push(`The columns have different types (${types.join(", ")}), so the values are written as text.`);
        break;
      }
      case "hierarchy": {
        const id = need(p.id, "id column").name, parent = need(p.parent, "parent column").name;
        if (id === parent) throw new Error("The id and the parent must be two columns.");
        const depth = Math.floor(num(p.maxDepth ?? MAX_DEPTH, "The deepest level"));
        if (!(depth >= 1 && depth <= 1000)) throw new Error("The deepest level must be from 1 to 1,000.");
        for (const n of ["depth", "root"]) if (has(n)) throw new Error(`${n} is a column already; rename it first.`);
        out.sql = `SELECT * FROM (WITH RECURSIVE walk AS (SELECT ${ident(id)} AS node, ${ident(id)} AS root, 0 AS depth ${from} WHERE ${ident(parent)} IS NULL `
          + `UNION ALL SELECT c.${ident(id)}, w.root, w.depth + 1 FROM ${input.ref} AS c JOIN walk AS w ON c.${ident(parent)} = w.node WHERE w.depth < ${depth}) `
          + `SELECT p.*, w.depth, w.root FROM ${input.ref} AS p LEFT JOIN walk AS w ON p.${ident(id)} = w.node)`;
        out.hierarchy = { id, parent, depth };
        out.notes.push(`Roots are rows whose ${parent} is missing. A row not reached from a root, in a cycle or under a parent that is not an id, has a missing depth; the walk stops at depth ${depth}.`);
        break;
      }
      default:
        throw new Error(`Unknown step ${JSON.stringify(p.op)}.`);
    }
    return out;
  }

  /** The default name of an aggregate's column. */
  function defaultName(m) {
    if (m.fn === "count") return "rows";
    const base = m.fn === "count_values" ? "n" : m.fn === "quantile" ? `q${String(m.p).replace(/^0?\./, "")}` : m.fn;
    return `${base}_${m.column}${m.fn === "corr" ? `_${m.column2}` : ""}`.slice(0, 63);
  }

  /** One filter condition as SQL. */
  function condition(c, need, asNumber, out) {
    const col = need(c.column);
    const x = ident(col.name);
    if (c.op === "missing") return isText(col.type) ? `(${x} IS NULL OR trim(${x}) = '')` : `${x} IS NULL`;
    if (c.op === "present") return isText(col.type) ? `(${x} IS NOT NULL AND trim(${x}) <> '')` : `${x} IS NOT NULL`;
    if (!FILTER_OPS[c.op]) throw new Error(`Choose a comparison for ${col.name}.`);
    if (!out.nullDrops.includes(col.name)) out.nullDrops.push(col.name);
    if (c.op === "contains") return `contains(CAST(${x} AS VARCHAR), ${literal(String(c.value ?? ""))})`;
    if (c.op === "starts") return `starts_with(CAST(${x} AS VARCHAR), ${literal(String(c.value ?? ""))})`;
    if (c.op === "in") {
      const items = String(c.value ?? "").split(",").map((s) => s.trim()).filter((s) => s);
      if (!items.length) throw new Error(`List the values of ${col.name}, separated by commas.`);
      return `${x} IN (${items.map((v) => valueFor(col.type, v)).join(", ")})`;
    }
    // A text column compared with a number reads as a number (TRY_CAST); otherwise values compare as they are.
    const numeric = !isNumeric(col.type) && isText(col.type) && ["<", "<=", ">", ">=", "between"].includes(c.op) && Number.isFinite(Number(String(c.value ?? "").trim())) && String(c.value ?? "").trim() !== "";
    const lhs = numeric ? asNumber(col.name) : x;
    const lit = (v) => (numeric ? String(num(v, "The value")) : valueFor(col.type, v));
    if (c.op === "between") return `${lhs} BETWEEN ${lit(c.value)} AND ${lit(c.value2)}`;
    return `${lhs} ${c.op} ${lit(c.value)}`;
  }

  /** The expression of a computed column. */
  function computed(p, need, asNumber, asTime, conversions) {
    const operand = (o) => (o && o.column ? asNumber(o.column) : String(num(o?.value, "A number")));
    switch (p.kind) {
      case "arith": {
        if (!["+", "-", "*", "/"].includes(p.operator)) throw new Error("Choose +, −, × or ÷.");
        return `${operand(p.a)} ${p.operator} ${operand(p.b)}`;
      }
      case "case": {
        const cond = condition({ column: p.column, op: p.test, value: p.value, value2: p.value2 }, need, asNumber, { nullDrops: [] });
        const both = [p.then, p.else].every((s) => /^[+-]?[0-9.eE+-]+$/.test(String(s ?? "").trim()) && Number.isFinite(Number(s)));
        const lit = (s) => (both ? String(Number(s)) : literal(String(s ?? "")));
        return `CASE WHEN ${cond} THEN ${lit(p.then)} ELSE ${lit(p.else)} END`;
      }
      case "convert": {
        need(p.column);
        if (!CASTS.includes(p.type)) throw new Error("Choose a type to convert to.");
        conversions.push({ column: p.column, type: p.type });
        return `TRY_CAST(${ident(p.column)} AS ${p.type})`;
      }
      case "fill": {
        const c = need(p.column);
        if (String(p.value ?? "") === "" && !isText(c.type)) throw new Error("Give the value that fills a missing one.");
        return `coalesce(${ident(c.name)}, ${valueFor(c.type, p.value)})`;
      }
      case "date": {
        const parts = ["year", "quarter", "month", "week", "day", "dayofweek", "hour"];
        if (!parts.includes(p.part)) throw new Error("Choose a part of the date.");
        const t = asTime(p.column);
        if (p.how === "start") {
          if (p.part === "dayofweek") throw new Error("A period start needs year, quarter, month, week, day or hour.");
          return `date_trunc(${literal(p.part)}, ${t})`;
        }
        return `date_part(${literal(p.part)}, ${t})`;
      }
      case "text": {
        const c = ident(need(p.column).name);
        const s = `CAST(${c} AS VARCHAR)`;
        switch (p.fn) {
          case "upper": return `upper(${s})`;
          case "lower": return `lower(${s})`;
          case "trim": return `trim(${s})`;
          case "length": return `length(${s})`;
          case "left": return `left(${s}, ${Math.floor(num(p.n, "The number of characters"))})`;
          default: throw new Error("Choose a text function.");
        }
      }
      case "number": {
        const x = asNumber(p.column);
        switch (p.fn) {
          case "round": return `round(${x}, ${Math.floor(num(p.n ?? 0, "The number of digits"))})`;
          case "abs": return `abs(${x})`;
          case "ln": return `ln(${x})`;
          case "log10": return `log10(${x})`;
          case "sqrt": return `sqrt(${x})`;
          case "floor": return `floor(${x})`;
          case "ceil": return `ceil(${x})`;
          default: throw new Error("Choose a number function.");
        }
      }
      default:
        throw new Error("Choose what to compute.");
    }
  }

  /** The WITH name of step k, distinct from every table name. @param {number} k @param {string[]} taken */
  function stepName(k, taken) {
    let name = `step_${k}`;
    while (taken.includes(name)) name = `${name}_`;
    return name;
  }

  /**
   * The whole pipeline as one statement: each step a WITH clause over the one before, then the result in its order.
   * `compiled` holds each step's SQL compiled over its WITH name's input (compileStep with ref = the name before).
   * @param {string} source @param {{ sql: string }[]} compiled @param {any} order @param {string[]} names
   */
  function chain(source, compiled, order, names) {
    if (!compiled.length) return `SELECT * FROM ${ident(source)} ${orderSql(order)}`;
    const ctes = compiled.map((c, i) => `${ident(names[i])} AS (${c.sql})`);
    return `WITH ${ctes.join(",\n  ")}\nSELECT * FROM ${ident(names[names.length - 1])} ${orderSql(order)}`;
  }

  /**
   * A step's text in words, for the record and the deck.
   * @param {any} s
   */
  function describe(s) {
    switch (s.op) {
      case "columns": return `Keep ${(s.keep ?? []).join(", ")}${Object.entries(s.rename ?? {}).filter(([, v]) => v).map(([k, v]) => `; ${k} as ${v}`).join("")}.`;
      case "filter": return `Keep rows where ${(s.conditions ?? []).map((c) => `${c.column} ${FILTER_OPS[c.op] ?? c.op}${["missing", "present"].includes(c.op) ? "" : ` ${c.value}${c.op === "between" ? ` and ${c.value2}` : ""}`}`).join(s.match === "any" ? " or " : " and ")}.`;
      case "sort": return `Sort by ${(s.keys ?? []).map((k) => `${k.column}${k.desc ? " descending" : ""}`).join(", ")}.`;
      case "limit": return `The first ${s.n} rows${Number(s.offset) ? ` after ${s.offset}` : ""}.`;
      case "distinct": return `Distinct rows of ${(s.columns ?? []).length ? s.columns.join(", ") : "every column"}.`;
      case "compute": return `Compute ${s.name} (${s.kind}).`;
      case "readings": return `Read ${(s.columns ?? []).join(", ")} as the workbench reads them.`;
      case "aggregate": return `Group by ${(s.by ?? []).join(", ") || "nothing"}: ${(s.measures ?? []).map((m) => (AGG[m.fn]?.label ?? m.fn) + (m.column ? ` of ${m.column}` : "")).join(", ")}${s.having?.measure ? `; having ${s.having.measure} ${s.having.op} ${s.having.value}` : ""}.`;
      case "join": return `${JOINS[s.kind] ?? s.kind} ${s.table}${(s.keys ?? []).length ? ` on ${s.keys.map((k) => `${k.left} = ${k.right}`).join(" and ")}` : ""}.`;
      case "setop": return `${SETOPS[s.set] ?? SETOPS.union_all} ${s.table} on ${(s.columns ?? []).join(", ")}.`;
      case "window": return `${WINDOW[s.fn]?.label ?? s.fn}${s.column ? `, of ${s.column}` : ""}${WINDOW[s.fn]?.k ? `, k = ${s.k}` : ""}, as ${s.as || s.fn}.`;
      case "pivot": return `Pivot ${s.on} into columns.`;
      case "unpivot": return `Unpivot ${(s.columns ?? []).join(", ")}.`;
      case "hierarchy": return `Walk ${s.id} and ${s.parent}.`;
      default: return String(s.op);
    }
  }

  return { OPS, OP, AGG, WINDOW, FILTER_OPS, JOINS, SETOPS, CASTS, MAX_PIVOT, isNumeric, isText, isRowColumn, defaultOrder, orderSql, orderText, compileStep, chain, stepName, describe };
});
