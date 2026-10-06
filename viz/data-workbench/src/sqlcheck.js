/* Universal Data Workbench: the statement whitelist of the SQL editor.
 *
 * check(text, catalog) splits what the person wrote into statements and decides each one before anything runs:
 * the whitelist of spec.md ("SQL dialect") is SELECT (with DuckDB's FROM-first form and VALUES), WITH and WITH
 * RECURSIVE, PIVOT and UNPIVOT, CREATE [OR REPLACE] VIEW and CREATE [OR REPLACE] TABLE … AS for derived names, and
 * DROP of derived objects. Everything else is refused with its reason, and so are, inside a query: a file or URL
 * read as a table, a table function other than range, generate_series and unnest, a function that runs SQL from
 * text (query, query_table), a name that is not a table of the workbench, NATURAL and POSITIONAL joins.
 *
 * The engine's own lockdown (src/sql.js setup) stays underneath: no URL, no file outside the registered ones, no
 * extension, no setting. This file keeps the workbench's model on top of it: imports are read-only, derived objects
 * have names of their own, and every table a query reads is one the person can see.
 *
 * It also reads what a transformation record needs from a statement without running it: the tables it reads, the
 * names it defines, whether it orders its rows, its FROM and WHERE clauses, its TRY_CASTs, its aggregates over a
 * column, and its joins of two named tables on plain key equalities. These are a tokenizer's readings, not a
 * parser's: a statement the readings cannot follow is still run, and its record says what was not counted.
 *
 * The page loads this file as a plain script (window.DWSqlCheck); the checks load it with require().
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWSqlCheck = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- tokens ---------- */

  /**
   * A token: kind word (a bare name or keyword), ident (a "quoted" name), string, number, op (operators and
   * punctuation), with its text, its value (a name's lower-case form, a string's content) and its place.
   * @typedef {{ kind: "word" | "ident" | "string" | "number" | "op", text: string, value: string, start: number, end: number }} Token
   */

  /** The tokens of SQL text, without comments; an unterminated string, name or comment is an error. @param {string} text */
  function tokenize(text) {
    /** @type {Token[]} */
    const out = [];
    const n = text.length;
    let i = 0;
    const fail = (what, at) => { throw new Error(`${what} that starts at character ${at + 1} is not closed.`); };
    while (i < n) {
      const c = text[i];
      if (/\s/.test(c)) { i += 1; continue; }
      if (c === "-" && text[i + 1] === "-") { while (i < n && text[i] !== "\n") i += 1; continue; }
      if (c === "/" && text[i + 1] === "*") {
        const at = i;
        let depth = 0;
        do {
          if (text[i] === "/" && text[i + 1] === "*") { depth += 1; i += 2; } else if (text[i] === "*" && text[i + 1] === "/") { depth -= 1; i += 2; } else i += 1;
        } while (depth > 0 && i < n);
        if (depth > 0) fail("A comment", at);
        continue;
      }
      const start = i;
      // A string: '…' with '' inside, or E'…' with backslash escapes; prefixes E, X, B and N.
      if (c === "'" || (/[eEbBxXnN]/.test(c) && text[i + 1] === "'")) {
        const escapes = c === "e" || c === "E";
        if (c !== "'") i += 1;
        i += 1;
        let value = "";
        for (;;) {
          if (i >= n) fail("A string", start);
          if (escapes && text[i] === "\\") { value += text[i + 1] ?? ""; i += 2; continue; }
          if (text[i] === "'") {
            if (text[i + 1] === "'") { value += "'"; i += 2; continue; }
            i += 1;
            break;
          }
          value += text[i];
          i += 1;
        }
        out.push({ kind: "string", text: text.slice(start, i), value, start, end: i });
        continue;
      }
      // A dollar-quoted string: $$…$$ or $tag$…$tag$.
      const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i, i + 64));
      if (dollar) {
        const close = text.indexOf(dollar[0], i + dollar[0].length);
        if (close < 0) fail("A string", start);
        i = close + dollar[0].length;
        out.push({ kind: "string", text: text.slice(start, i), value: text.slice(start + dollar[0].length, close), start, end: i });
        continue;
      }
      if (c === '"') {
        i += 1;
        let value = "";
        for (;;) {
          if (i >= n) fail("A quoted name", start);
          if (text[i] === '"') {
            if (text[i + 1] === '"') { value += '"'; i += 2; continue; }
            i += 1;
            break;
          }
          value += text[i];
          i += 1;
        }
        out.push({ kind: "ident", text: text.slice(start, i), value: value.toLowerCase(), start, end: i });
        continue;
      }
      if (/[A-Za-z_\u0080-￿]/.test(c)) {
        while (i < n && /[A-Za-z0-9_$\u0080-￿]/.test(text[i])) i += 1;
        const t = text.slice(start, i);
        out.push({ kind: "word", text: t, value: t.toLowerCase(), start, end: i });
        continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(text[i + 1] ?? ""))) {
        const m = /^(0[xX][0-9A-Fa-f_]+|[0-9_]*\.?[0-9_]*([eE][+-]?[0-9]+)?)/.exec(text.slice(i));
        i += Math.max(1, m ? m[0].length : 1);
        out.push({ kind: "number", text: text.slice(start, i), value: text.slice(start, i), start, end: i });
        continue;
      }
      const two = text.slice(i, i + 2);
      const op = ["::", "<=", ">=", "<>", "!=", "||", "->", "=>", "**", "//", "<<", ">>", "==", "~~", "!~"].includes(two) ? two : c;
      i += op.length;
      out.push({ kind: "op", text: op, value: op, start, end: i });
    }
    return out;
  }

  /** The statements of a text: its tokens split at each ; outside brackets, with each statement's own text. @param {string} text */
  function split(text) {
    const tokens = tokenize(text);
    const out = [];
    let depth = 0, from = 0;
    const push = (to) => {
      const part = tokens.slice(from, to);
      if (part.length) out.push({ tokens: part, text: text.slice(part[0].start, part[part.length - 1].end) });
    };
    tokens.forEach((t, k) => {
      if (t.kind !== "op") return;
      if (t.text === "(" || t.text === "[" || t.text === "{") depth += 1;
      else if (t.text === ")" || t.text === "]" || t.text === "}") depth = Math.max(0, depth - 1);
      else if (t.text === ";" && depth === 0) { push(k); from = k + 1; }
    });
    push(tokens.length);
    return out;
  }

  /* ---------- the whitelist ---------- */

  /** Why a statement that starts with this word is refused. */
  const REFUSED = {
    insert: "INSERT changes the rows of a table. Imported tables are read-only; make a derived table with CREATE TABLE … AS instead.",
    update: "UPDATE changes the rows of a table. Imported tables are read-only; make a derived table with CREATE TABLE … AS instead.",
    delete: "DELETE changes the rows of a table. Imported tables are read-only; make a derived table with CREATE TABLE … AS instead.",
    truncate: "TRUNCATE empties a table. Imported tables are read-only.",
    merge: "MERGE changes the rows of a table. Imported tables are read-only.",
    alter: "ALTER changes a table. Imported tables are read-only; make a derived table with CREATE TABLE … AS instead.",
    attach: "ATTACH opens another database. The workbench reads only the files you import.",
    detach: "DETACH closes a database. The workbench has one database, of the files you import.",
    use: "USE changes the database. The workbench has one database, of the files you import.",
    copy: "COPY reads or writes files. Import files with Import; the export package writes the results.",
    export: "EXPORT writes files. The export package writes the results.",
    import: "IMPORT reads files. Import files with Import.",
    install: "INSTALL adds an extension. The engine runs with the Parquet extension only, loaded at start.",
    load: "LOAD loads an extension. The engine runs with the Parquet extension only, loaded at start.",
    pragma: "PRAGMA changes or reads the engine's settings, which are locked.",
    set: "SET changes a setting. The engine's settings are locked at start, so no SET is in the whitelist.",
    reset: "RESET changes a setting. The engine's settings are locked at start.",
    begin: "Transactions are not part of the workbench: each statement takes effect when it runs.",
    start: "Transactions are not part of the workbench: each statement takes effect when it runs.",
    commit: "Transactions are not part of the workbench: each statement takes effect when it runs.",
    rollback: "Transactions are not part of the workbench: each statement takes effect when it runs.",
    abort: "Transactions are not part of the workbench: each statement takes effect when it runs.",
    end: "Transactions are not part of the workbench: each statement takes effect when it runs.",
    checkpoint: "CHECKPOINT is database administration, which the workbench leaves out.",
    vacuum: "VACUUM is database administration, which the workbench leaves out.",
    analyze: "ANALYZE is database administration, which the workbench leaves out.",
    call: "CALL runs a function as a statement. Use SELECT … FROM a table instead.",
    describe: "DESCRIBE is not in the whitelist: the workbench shows the columns and types of every result, and Inspect profiles a table.",
    show: "SHOW is not in the whitelist: the workbench lists its tables and the columns of every result.",
    summarize: "SUMMARIZE is not in the whitelist: Inspect profiles every column of an analysed table.",
    explain: "EXPLAIN is not in the whitelist.",
    execute: "EXECUTE runs a prepared statement, which the whitelist leaves out.",
    prepare: "PREPARE is not in the whitelist.",
    deallocate: "DEALLOCATE is not in the whitelist.",
    grant: "Permissions are not part of the workbench.",
    revoke: "Permissions are not part of the workbench.",
    comment: "COMMENT changes the catalog, which the whitelist leaves out.",
    update_extensions: "Extensions cannot change: the engine runs with the Parquet extension only.",
  };

  /** Functions that read files or URLs, or run SQL from text, refused wherever they are called. */
  const FILE_FUNCTIONS = new Set(["query", "query_table", "glob", "sniff_csv", "csv_scan", "parquet_scan", "parquet_metadata", "parquet_schema", "parquet_file_metadata",
    "parquet_kv_metadata", "parquet_bloom_probe", "json_execute_serialized_sql", "sql_auto_complete", "load_extension", "duckdb_secrets", "which_secret"]);
  const fileFunction = (name) => FILE_FUNCTIONS.has(name) || /^read_/.test(name) || /_scan$/.test(name) || /^(sqlite|postgres|mysql|iceberg|delta|st)_/.test(name);
  /** The table functions a query may read: they make rows from numbers or a list, not from a file. */
  const TABLE_FUNCTIONS = new Set(["range", "generate_series", "unnest"]);
  /** Words that end a FROM clause at its level. */
  const CLAUSES = new Set(["where", "group", "having", "qualify", "window", "order", "limit", "offset", "union", "intersect", "except", "select", "returning", "fetch", "pivot", "unpivot", "set"]);
  /** Words after which a FROM item is a join kind, not an alias. */
  const JOIN_WORDS = new Set(["join", "inner", "left", "right", "full", "outer", "cross", "semi", "anti", "asof", "natural", "positional", "lateral"]);
  /** Aggregates whose NULL skipping a record counts, as COUNT(*) beside COUNT(column). */
  const AGGREGATES = new Set(["sum", "avg", "mean", "min", "max", "count", "median", "mode", "stddev", "stddev_samp", "stddev_pop", "variance", "var_samp", "var_pop",
    "quantile", "quantile_cont", "quantile_disc", "first", "last", "any_value", "string_agg", "list", "array_agg", "product", "skewness", "kurtosis", "entropy",
    "bool_and", "bool_or", "approx_count_distinct", "mad", "avg_distinct"]);
  /** A derived name: lower-case letters, digits and _, starting with a letter, at most 63. */
  const NAME = /^[a-z][a-z0-9_]{0,62}$/;

  /**
   * What the workbench holds: imported tables and derived objects by name, each derived one with its kind.
   * @typedef {{ imported: string[], derived: Record<string, "view" | "table"> }} Catalog
   */

  /**
   * Decide every statement of a text before anything runs.
   * @param {string} text @param {Catalog} catalog
   * @returns {{ ok: boolean, error: string, statements: any[] }}
   */
  function check(text, catalog) {
    let parts;
    try {
      parts = split(text);
    } catch (error) {
      return { ok: false, error: String(/** @type {any} */ (error).message), statements: [] };
    }
    if (!parts.length) return { ok: false, error: "There is no statement to run.", statements: [] };
    const statements = parts.map((p, i) => ({ n: i + 1, ...statement(p, catalog) }));
    const refused = statements.find((s) => !s.ok);
    return { ok: !refused, error: refused ? `Statement ${refused.n} is refused: ${refused.reason}` : "", statements };
  }

  /** Decide one statement: its kind, and a reason when it is refused. */
  function statement(part, catalog) {
    const t = part.tokens;
    const base = { text: part.text, kind: "", name: "", replace: false, ifExists: false, ok: false, reason: "", query: null };
    const w = (k) => (t[k]?.kind === "word" ? t[k].value : "");
    const first = w(0);
    if (first === "create") return create(t, part.text, catalog, base);
    if (first === "drop") return drop(t, catalog, base);
    if (["select", "from", "values", "with", "pivot", "unpivot", "pivot_wider", "pivot_longer"].includes(first) || (t[0].kind === "op" && t[0].text === "(")) {
      const q = query(t, 0, t.length, catalog, part.text);
      return { ...base, kind: "query", ok: !q.reason, reason: q.reason, query: q };
    }
    if (first === "table") return { ...base, reason: "TABLE … is not in the whitelist: write SELECT * FROM the table." };
    const why = REFUSED[first] ?? (first ? `${t[0].text.toUpperCase()} is not in the statement whitelist (SELECT, WITH, PIVOT, UNPIVOT, CREATE VIEW, CREATE TABLE … AS, DROP).` : "The statement does not start with a keyword of the whitelist.");
    return { ...base, reason: why };
  }

  /** The name a token gives, for a derived object: a bare name in lower case, or a quoted one as written. */
  function nameOf(token) {
    if (!token) return null;
    if (token.kind === "word") return token.value;
    if (token.kind === "ident") return token.text.slice(1, -1).replace(/""/g, '"');
    return null;
  }

  /** Why a name cannot name a derived object, or "". */
  function nameProblem(name, catalog) {
    if (name === null) return "CREATE needs a name for the new view or table.";
    if (!NAME.test(name)) return `${JSON.stringify(name)} cannot name a derived object: use lower-case letters, digits and _, starting with a letter (at most 63).`;
    if (catalog.imported.includes(name)) return `${name} is an imported table, which is read-only: choose another name.`;
    return "";
  }

  /** CREATE [OR REPLACE] VIEW|TABLE [IF NOT EXISTS] name [(columns)] AS query. */
  function create(t, text, catalog, base) {
    let k = 1;
    const w = (i) => (t[i]?.kind === "word" ? t[i].value : "");
    let replace = false;
    if (w(k) === "or" && w(k + 1) === "replace") { replace = true; k += 2; }
    if (w(k) === "temp" || w(k) === "temporary") return { ...base, reason: "CREATE TEMP is not in the whitelist: every derived object lasts while the page is open, so make it without TEMP." };
    const kind = w(k);
    if (kind !== "view" && kind !== "table") return { ...base, reason: `CREATE ${String(t[k]?.text ?? "").toUpperCase()} is not in the whitelist: only CREATE VIEW and CREATE TABLE … AS make derived objects.` };
    k += 1;
    let ifNotExists = false;
    if (w(k) === "if" && w(k + 1) === "not" && w(k + 2) === "exists") { ifNotExists = true; k += 3; }
    if (t[k + 1]?.kind === "op" && t[k + 1].text === ".") return { ...base, reason: "Name a derived object without a schema or database." };
    const name = nameOf(t[k]);
    const problem = nameProblem(name, catalog);
    if (problem) return { ...base, reason: problem };
    k += 1;
    const columns = [];
    if (t[k]?.kind === "op" && t[k].text === "(") {
      if (kind === "table") return { ...base, reason: "CREATE TABLE with column definitions is not in the whitelist: make a derived table with CREATE TABLE name AS a query." };
      const close = matching(t, k);
      for (let i = k + 1; i < close; i += 1) if (t[i].kind === "word" || t[i].kind === "ident") columns.push(nameOf(t[i]));
      k = close + 1;
    }
    if (w(k) !== "as") return { ...base, reason: kind === "table" ? "CREATE TABLE is in the whitelist only as CREATE TABLE name AS a query." : "CREATE VIEW needs AS and a query." };
    const existing = catalog.derived[name];
    if (existing && existing !== kind && (replace || !ifNotExists)) return { ...base, reason: `${name} is a derived ${existing}; drop it first to make a ${kind} of that name.` };
    if (existing && !replace && !ifNotExists) return { ...base, reason: `A derived ${existing} named ${name} exists already: write CREATE OR REPLACE, or choose another name.` };
    const q = query(t, k + 1, t.length, catalog, text);
    return { ...base, kind: kind === "view" ? "create-view" : "create-table", name, replace, ifNotExists, columns, ok: !q.reason, reason: q.reason, query: q,
      queryText: q.text };
  }

  /** DROP VIEW|TABLE [IF EXISTS] name, of a derived object only. */
  function drop(t, catalog, base) {
    const w = (i) => (t[i]?.kind === "word" ? t[i].value : "");
    const kind = w(1);
    if (kind !== "view" && kind !== "table") return { ...base, reason: `DROP ${String(t[1]?.text ?? "").toUpperCase()} is not in the whitelist: only DROP VIEW and DROP TABLE of derived objects.` };
    let k = 2, ifExists = false;
    if (w(k) === "if" && w(k + 1) === "exists") { ifExists = true; k += 2; }
    const name = nameOf(t[k]);
    if (name === null) return { ...base, reason: "DROP needs the name of a derived view or table." };
    if (t.length > k + 1) {
      const rest = w(k + 1);
      if (rest === "cascade") return { ...base, reason: "DROP … CASCADE is not in the whitelist: drop the objects that read this one first." };
      if (rest !== "restrict" || t.length > k + 2) return { ...base, reason: "DROP takes one name: drop each object in a statement of its own." };
    }
    if (catalog.imported.includes(name)) return { ...base, reason: `${name} is an imported table, which is read-only. "Remove this table" in Inspect removes it from the workbench.` };
    if (!NAME.test(name)) return { ...base, reason: `${JSON.stringify(name)} cannot name a derived object: DROP takes the name of a derived view or table as it was made.` };
    const existing = catalog.derived[name];
    if (!existing && !ifExists) return { ...base, reason: `There is no derived ${kind} named ${name}.` };
    if (existing && existing !== kind) return { ...base, reason: `${name} is a derived ${existing}: write DROP ${existing.toUpperCase()} ${name}.` };
    return { ...base, kind: "drop", name, objectKind: kind, ifExists, ok: true };
  }

  /** The index of the bracket that closes the one at k. */
  function matching(t, k) {
    let depth = 0;
    for (let i = k; i < t.length; i += 1) {
      if (t[i].kind !== "op") continue;
      if (t[i].text === "(" || t[i].text === "[" || t[i].text === "{") depth += 1;
      else if (t[i].text === ")" || t[i].text === "]" || t[i].text === "}") { depth -= 1; if (depth === 0) return i; }
    }
    return t.length - 1;
  }

  const isOp = (tok, text) => tok?.kind === "op" && tok.text === text;
  const isWord = (tok, value) => tok?.kind === "word" && tok.value === value;

  /**
   * Check a query (tokens a to b) and read what a record needs. Returns { reason } when refused, and always the
   * tables it reads (refs), the names its WITH clauses define (ctes), whether it orders its rows at its own level,
   * and, for one SELECT at its own level, the text of its WITH, FROM and WHERE clauses, its TRY_CASTs, its
   * aggregates over a column and its joins of two named tables on key equalities.
   */
  function query(t, a, b, catalog, text) {
    const out = { text: text.slice(t[a]?.start ?? 0, t[b - 1]?.end ?? 0), reason: "", refs: /** @type {string[]} */ ([]), ctes: /** @type {string[]} */ ([]),
      ordered: false, single: false, withText: "", fromText: "", whereText: "", tryCasts: /** @type {any[]} */ ([]), aggregates: /** @type {any[]} */ ([]), joins: /** @type {any[]} */ ([]),
      recursive: false };
    if (a >= b) { out.reason = "The statement has no query."; return out; }
    // The names every WITH of the statement defines, at any level: a reference to one is not a table.
    for (let k = a; k < b; k += 1) {
      if (!isWord(t[k], "with")) continue;
      let i = k + 1;
      if (isWord(t[i], "recursive")) { out.recursive = true; i += 1; }
      for (;;) {
        const name = nameOf(t[i]);
        if (name === null) break;
        out.ctes.push(name.toLowerCase());
        i += 1;
        if (isOp(t[i], "(")) i = matching(t, i) + 1;
        if (!isWord(t[i], "as")) break;
        i += 1;
        if (isWord(t[i], "not")) i += 1;
        if (isWord(t[i], "materialized")) i += 1;
        if (!isOp(t[i], "(")) break;
        i = matching(t, i) + 1;
        if (!isOp(t[i], ",")) break;
        i += 1;
      }
    }
    // The statement under its WITH list: a query, never INSERT, UPDATE or DELETE.
    let main = a;
    if (isWord(t[a], "with")) main = afterWith(t, a);
    const head = t[main]?.kind === "word" ? t[main].value : t[main]?.text;
    if (main < b && !["select", "from", "values", "pivot", "unpivot", "pivot_wider", "pivot_longer", "("].includes(String(head))) {
      out.reason = REFUSED[String(head)] ?? `A WITH clause may only lead to a query, not ${String(t[main]?.text ?? "").toUpperCase()}.`;
      return out;
    }
    const known = new Set([...catalog.imported, ...Object.keys(catalog.derived)]);
    const ctes = new Set(out.ctes);
    /** The tokens' bracket depth, and at each depth whether a comma starts a FROM item. */
    let depth = 0;
    const fromAt = new Map();
    /** Whether a SELECT opened the query at each depth: a FROM in a function call (EXTRACT, TRIM) is not a clause. */
    const selectAt = new Map();
    const refuse = (why) => { if (!out.reason) out.reason = why; };
    /** A FROM item at k: a table of the workbench, a subquery, or an allowed table function. */
    const item = (k) => {
      let i = k;
      if (isWord(t[i], "lateral")) i += 1;
      const tok = t[i];
      if (!tok || isOp(tok, "(")) return;
      if (tok.kind === "string") return refuse(`${tok.text} reads a file or URL as a table. Import files with Import; a query reads only the workbench's tables.`);
      if (tok.kind !== "word" && tok.kind !== "ident") return;
      const name = tok.kind === "word" ? tok.value : tok.value;
      if (isOp(t[i + 1], "(")) {
        if (fileFunction(name)) return refuse(`${tok.text}() reads files or runs SQL from text; a query reads only the workbench's tables.`);
        if (!TABLE_FUNCTIONS.has(name)) return refuse(`The table function ${tok.text}() is not in the whitelist: only range, generate_series and unnest make rows.`);
        return;
      }
      if (isOp(t[i + 1], ".")) return refuse(`${tok.text}.${t[i + 2]?.text ?? ""}: name tables without a schema or database.`);
      if (ctes.has(name)) return;
      if (name.startsWith("__")) return refuse(`${tok.text} is one of the workbench's own working tables, which queries do not read.`);
      if (!known.has(name)) return refuse(`${tok.text} is not a table of the workbench. The tables are: ${[...known].join(", ") || "none yet"}.`);
      if (!out.refs.includes(name)) out.refs.push(name);
    };
    for (let k = a; k < b; k += 1) {
      const tok = t[k];
      if (tok.kind === "op") {
        if (tok.text === "(" || tok.text === "[" || tok.text === "{") { depth += 1; fromAt.delete(depth); selectAt.delete(depth); }
        else if (tok.text === ")" || tok.text === "]" || tok.text === "}") { fromAt.delete(depth); selectAt.delete(depth); depth -= 1; }
        else if (tok.text === "," && fromAt.get(depth)) item(k + 1);
        continue;
      }
      if (tok.kind !== "word") continue;
      const v = tok.value;
      if (isOp(t[k + 1], "(") && !isOp(t[k - 1], ".") && fileFunction(v)) { refuse(`${tok.text}() reads files or runs SQL from text; a query reads only the workbench's tables.`); continue; }
      if (v === "natural") refuse("NATURAL JOIN matches columns by their names, which does not make a relationship: write JOIN … ON or JOIN … USING.");
      if (v === "positional") refuse("POSITIONAL JOIN pairs rows by their place, and tables have no order of their own: write JOIN … ON keys.");
      if (v === "select") selectAt.set(depth, true);
      // FROM opens a clause after SELECT at its level, or first in a query (DuckDB's FROM-first form); never in
      // IS NOT DISTINCT FROM or inside a function call such as EXTRACT(year FROM x).
      const opens = k === a || k === main || isOp(t[k - 1], "(") || ["union", "intersect", "except", "all", "by"].includes(t[k - 1]?.value ?? "");
      if ((v === "from" && !isWord(t[k - 1], "distinct") && (selectAt.get(depth) || opens)) || v === "join") { fromAt.set(depth, true); item(k + 1); continue; }
      if ((v === "pivot" || v === "unpivot" || v === "pivot_wider" || v === "pivot_longer") && (k === a || k === main)) { item(k + 1); continue; }
      if (CLAUSES.has(v) && !isOp(t[k - 1], ".")) fromAt.set(depth, false);
    }
    if (out.reason) return out;
    readShape(t, main, b, text, out);
    if (isWord(t[a], "with")) out.withText = text.slice(t[a].start, t[main - 1].end);
    return out;
  }

  /** The index of the statement under a WITH list that starts at a. */
  function afterWith(t, a) {
    let i = a + 1;
    if (isWord(t[i], "recursive")) i += 1;
    for (;;) {
      i += 1;
      if (isOp(t[i], "(")) i = matching(t, i) + 1;
      if (isWord(t[i], "as")) i += 1;
      if (isWord(t[i], "not")) i += 1;
      if (isWord(t[i], "materialized")) i += 1;
      if (isOp(t[i], "(")) i = matching(t, i) + 1;
      if (!isOp(t[i], ",")) return i;
      i += 1;
    }
  }

  /**
   * Read the shape of the statement at its own level (tokens m to b): whether it orders its rows, and for a single
   * SELECT its FROM and WHERE clauses, TRY_CASTs, aggregates over a column and key joins.
   */
  function readShape(t, m, b, text, out) {
    let depth = 0;
    /** @type {Record<string, number>} the first index of each clause word at the statement's own level */
    const at = {};
    let setOp = false;
    for (let k = m; k < b; k += 1) {
      const tok = t[k];
      if (tok.kind === "op") {
        if (tok.text === "(" || tok.text === "[" || tok.text === "{") depth += 1;
        else if (tok.text === ")" || tok.text === "]" || tok.text === "}") depth -= 1;
        continue;
      }
      if (depth !== 0 || tok.kind !== "word") continue;
      if (["union", "intersect", "except"].includes(tok.value)) setOp = true;
      if (tok.value === "order" && isWord(t[k + 1], "by")) out.ordered = true;
      for (const c of ["select", "from", "where", "group", "having", "qualify", "window", "order", "limit", "offset"]) if (tok.value === c && at[c] === undefined) at[c] = k;
    }
    // One SELECT … FROM at the statement's own level: its clauses can be probed apart.
    if (setOp || !isWord(t[m], "select") || at.from === undefined) return;
    out.single = true;
    const end = (start) => Math.min(...["where", "group", "having", "qualify", "window", "order", "limit", "offset"].map((c) => (at[c] !== undefined && at[c] > start ? at[c] : b)));
    const fromEnd = end(at.from);
    out.fromText = text.slice(t[at.from + 1].start, t[fromEnd - 1].end);
    if (at.where !== undefined) {
      const whereEnd = end(at.where);
      out.whereText = text.slice(t[at.where + 1].start, t[whereEnd - 1].end);
    }
    // TRY_CASTs and aggregates in the SELECT list and WHERE, outside any subquery.
    const scope = (lo, hi) => {
      const sub = [];
      for (let k = lo; k < hi; k += 1) {
        if (isOp(t[k], "(") && ["select", "with", "from", "values"].includes(t[k + 1]?.value ?? "") && t[k + 1].kind === "word") { const c = matching(t, k); sub.push([k, c]); k = c; continue; }
        const tok = t[k];
        if (tok.kind !== "word" || !isOp(t[k + 1], "(") || isOp(t[k - 1], ".")) continue;
        const close = matching(t, k + 1);
        if (tok.value === "try_cast") {
          // TRY_CAST(expression AS type): the AS at the call's own level splits them.
          let d = 0, as = -1;
          for (let i = k + 2; i < close; i += 1) {
            if (isOp(t[i], "(")) d += 1; else if (isOp(t[i], ")")) d -= 1;
            else if (d === 0 && isWord(t[i], "as")) as = i;
          }
          if (as > k + 2 && as < close - 1) out.tryCasts.push({ expr: text.slice(t[k + 2].start, t[as - 1].end), type: text.slice(t[as + 1].start, t[close - 1].end) });
        } else if (AGGREGATES.has(tok.value) && !isWord(t[close + 1], "over")) {
          // An aggregate over one column, perhaps qualified, perhaps DISTINCT: f(col), f(DISTINCT t.col).
          let i = k + 2;
          if (isWord(t[i], "distinct")) i += 1;
          const ref = columnRef(t, i);
          if (ref && ref.next === close) {
            const col = text.slice(t[i].start, t[close - 1].end);
            if (!out.aggregates.some((x) => x.column === col)) out.aggregates.push({ fn: tok.value, column: col });
          }
        }
      }
    };
    scope(m + 1, at.from);
    if (at.where !== undefined) scope(at.where + 1, end(at.where));
    readJoins(t, at.from + 1, fromEnd, text, out);
  }

  /** A column reference at i: name or qualifier.name; returns its parts and the index after it. */
  function columnRef(t, i) {
    const n1 = nameOf(t[i]);
    if (n1 === null || (t[i].kind === "word" && ["distinct", "case", "not", "null", "true", "false"].includes(t[i].value))) return null;
    if (isOp(t[i + 1], ".")) {
      const n2 = nameOf(t[i + 2]);
      if (n2 === null) return null;
      return { qualifier: n1.toLowerCase(), column: n2, next: i + 3 };
    }
    if (isOp(t[i + 1], "(")) return null;
    return { qualifier: null, column: n1, next: i + 1 };
  }

  /**
   * The joins of the FROM clause (tokens a to b) whose sides are named tables or WITH names and whose condition is
   * key equalities (ON x.k = y.k AND …, or IS NOT DISTINCT FROM, or USING (k, …)): each with its kind, its two sides
   * and its key pairs. A join the readings cannot follow is listed with why its diagnostics are not computed.
   */
  function readJoins(t, a, b, text, out) {
    /** @type {{ name: string | null, alias: string | null }[]} */
    const items = [];
    let k = a;
    const readItem = () => {
      const tok = t[k];
      let name = null;
      if (tok && (tok.kind === "word" || tok.kind === "ident") && !isOp(t[k + 1], "(") && !isOp(t[k + 1], ".")) { name = nameOf(tok).toLowerCase(); k += 1; }
      else if (tok && isOp(tok, "(")) k = matching(t, k) + 1;
      else if (tok) { k += 1; if (isOp(t[k], "(")) k = matching(t, k) + 1; }
      let alias = null;
      if (isWord(t[k], "as")) k += 1;
      if (t[k] && (t[k].kind === "ident" || (t[k].kind === "word" && !JOIN_WORDS.has(t[k].value) && !["on", "using", "where"].includes(t[k].value)))) { alias = nameOf(t[k]).toLowerCase(); k += 1; }
      if (isOp(t[k], "(") && alias) k = matching(t, k) + 1;
      items.push({ name, alias });
    };
    readItem();
    while (k < b) {
      if (isOp(t[k], ",")) { k += 1; readItem(); out.joins.push({ kind: "cross", diagnostics: false, why: "a comma join pairs every row; its condition, if any, is in WHERE" }); continue; }
      const words = [];
      while (k < b && t[k].kind === "word" && JOIN_WORDS.has(t[k].value) && t[k].value !== "join") { words.push(t[k].value); k += 1; }
      if (!isWord(t[k], "join")) { k += 1; continue; }
      k += 1;
      const kind = words.includes("cross") ? "cross" : words.includes("semi") ? "semi" : words.includes("anti") ? "anti" : words.includes("asof") ? "asof"
        : words.includes("left") ? "left" : words.includes("right") ? "right" : words.includes("full") ? "full" : "inner";
      const right = items.length;
      readItem();
      const join = { kind, right: items[right], left: null, keys: /** @type {any[]} */ ([]), nullsMatch: false, diagnostics: false, why: "" };
      out.joins.push(join);
      if (kind === "cross") { join.why = "a cross join has no keys"; continue; }
      if (kind === "asof") { join.why = "an ASOF join matches the nearest key, not equal keys"; }
      const sides = items.slice(0, right);
      if (isWord(t[k], "using") && isOp(t[k + 1], "(")) {
        const close = matching(t, k + 1);
        for (let i = k + 2; i < close; i += 1) if (t[i].kind === "word" || t[i].kind === "ident") join.keys.push({ left: nameOf(t[i]), right: nameOf(t[i]) });
        k = close + 1;
        if (sides.length === 1 && sides[0].name) join.left = sides[0];
        else join.why = join.why || "USING after more than one table: the left side is not one named table";
      } else if (isWord(t[k], "on")) {
        // ON: key pairs joined by AND, each side a qualified column of one side of the join.
        k += 1;
        let end = k, depth = 0;
        while (end < b) {
          if (isOp(t[end], "(")) depth += 1; else if (isOp(t[end], ")")) depth -= 1;
          else if (depth === 0 && t[end].kind === "word" && (JOIN_WORDS.has(t[end].value) || t[end].value === "join")) break;
          else if (depth === 0 && isOp(t[end], ",")) break;
          end += 1;
        }
        const label = (it) => it.alias ?? it.name;
        const rightLabel = label(items[right]);
        let i = k, ok = true;
        /** @type {any} */
        let leftItem = null;
        while (i < end && ok) {
          const x = columnRef(t, i);
          if (!x) { ok = false; break; }
          i = x.next;
          let nulls = false;
          if (isOp(t[i], "=")) i += 1;
          else if (isWord(t[i], "is") && isWord(t[i + 1], "not") && isWord(t[i + 2], "distinct") && isWord(t[i + 3], "from")) { nulls = true; i += 4; }
          else { ok = false; break; }
          const y = columnRef(t, i);
          if (!y) { ok = false; break; }
          i = y.next;
          if (!x.qualifier || !y.qualifier) { ok = false; break; }
          const [r, l] = x.qualifier === rightLabel ? [x, y] : y.qualifier === rightLabel ? [y, x] : [null, null];
          const li = l ? sides.find((it) => label(it) === l.qualifier) : null;
          if (!r || !li || (leftItem && leftItem !== li)) { ok = false; break; }
          leftItem = li;
          join.keys.push({ left: l.column, right: r.column });
          if (join.keys.length > 1 && nulls !== join.nullsMatch) { ok = false; break; }
          join.nullsMatch = nulls;
          if (isWord(t[i], "and")) i += 1;
          else if (i < end) { ok = false; break; }
        }
        k = end;
        if (ok && leftItem?.name && sides.length === 1) join.left = leftItem;
        else if (ok && leftItem?.name) join.why = join.why || "ON after more than one table: the left side is not one named table";
        else join.why = join.why || "the condition is not key equalities between two named tables";
      }
      if (!join.why && join.left?.name && join.right?.name && join.keys.length) join.diagnostics = true;
      else if (!join.why) join.why = "a side of the join is not a named table";
    }
  }

  return { tokenize, split, check, NAME, REFUSED, TABLE_FUNCTIONS, fileFunction, nameProblem };
});
