// The statement whitelist of the SQL editor (src/sqlcheck.js): what it accepts, what it refuses and why, and what it
// reads from a statement for its record. Pure: no engine. The engine's own refusals under the lockdown are in
// tests/engine.test.mjs; the statements' results are in tests/sql-engine.test.mjs.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
/** @type {any} */ const Check = require("../src/sqlcheck.js");

const catalog = { imported: ["orders", "customers"], derived: { lima: "view", totals: "table" } };
const accepted = (/** @type {string} */ sql) => {
  const r = Check.check(sql, catalog);
  assert.ok(r.ok, `accepted: ${sql} (${r.error})`);
  return r.statements;
};
const refused = (/** @type {string} */ sql, /** @type {RegExp} */ why) => {
  const r = Check.check(sql, catalog);
  assert.equal(r.ok, false, `refused: ${sql}`);
  assert.match(r.error, why, sql);
};

test("tokens: strings, quoted names, dollar quotes and comments never split a statement", () => {
  const parts = Check.split("SELECT 'a;b', \"x;y\", $$c;d$$, E'e\\';f' FROM orders -- g;h\n; /* i; /* nested; */ j; */ SELECT 2");
  assert.equal(parts.length, 2);
  assert.match(parts[0].text, /^SELECT 'a;b'/);
  assert.equal(parts[1].text, "SELECT 2");
  const t = Check.tokenize("SELECT \"Mixed \"\"Name\"\"\" FROM t");
  assert.deepEqual(t.map((/** @type {any} */ x) => x.kind), ["word", "ident", "word", "word"]);
  assert.throws(() => Check.tokenize("SELECT 'open"), /is not closed/);
  assert.equal(Check.check("SELECT 'open", catalog).ok, false);
  assert.equal(Check.check("  ;  -- nothing\n", catalog).error, "There is no statement to run.");
});

test("the whitelist: queries, WITH and WITH RECURSIVE, PIVOT and UNPIVOT, CREATE VIEW, CREATE TABLE … AS and DROP of derived objects", () => {
  for (const sql of [
    "SELECT * FROM orders", "FROM orders SELECT city", "VALUES (1), (2)", "(SELECT 1)", "SELECT * FROM lima JOIN totals USING (city)",
    "WITH x AS (SELECT * FROM orders) SELECT * FROM x", "WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < 3) SELECT * FROM r",
    "PIVOT orders ON city USING count(*)", "UNPIVOT customers ON name, tier INTO NAME k VALUE v", "SELECT * FROM (PIVOT orders ON city IN ('Oslo') USING count(*))",
    "CREATE VIEW v1 AS SELECT * FROM orders", "CREATE OR REPLACE VIEW lima AS SELECT 1", "CREATE TABLE t1 AS SELECT * FROM orders", "CREATE TABLE IF NOT EXISTS totals AS SELECT 1",
    "DROP VIEW lima", "DROP TABLE IF EXISTS gone", "SELECT * FROM range(3)", "SELECT * FROM generate_series(1, 3)", "SELECT unnest([1, 2])",
    "SELECT extract(year FROM DATE '2026-01-01'), trim(both FROM ' a '), substring('abc' FROM 2) FROM orders",
    "SELECT * FROM orders o SEMI JOIN customers c ON o.customer = c.customer", "SELECT * FROM orders o ANTI JOIN customers c ON o.customer IS NOT DISTINCT FROM c.customer",
    "SELECT * FROM orders o ASOF JOIN customers c ON o.customer >= c.customer",
  ]) accepted(sql);
  const [v] = accepted("create view v2 (a, b) as select city, amount from orders");
  assert.deepEqual([v.kind, v.name, v.columns], ["create-view", "v2", ["a", "b"]]);
  const [d] = accepted("DROP TABLE totals");
  assert.deepEqual([d.kind, d.name, d.objectKind], ["drop", "totals", "table"]);
});

test("refused statements, each with its reason", () => {
  refused("INSERT INTO orders VALUES (1)", /read-only/);
  refused("UPDATE orders SET city = 'x'", /read-only/);
  refused("DELETE FROM orders", /read-only/);
  refused("WITH x AS (SELECT 1) INSERT INTO orders SELECT * FROM x", /INSERT changes the rows/);
  refused("WITH x AS (SELECT 1) DELETE FROM orders", /DELETE changes the rows/);
  refused("ALTER TABLE orders ADD COLUMN y INT", /read-only/);
  refused("TRUNCATE orders", /empties a table/);
  refused("ATTACH ':memory:' AS m", /another database/);
  refused("COPY orders TO 'out.csv'", /reads or writes files/);
  refused("EXPORT DATABASE 'x'", /writes files/);
  refused("INSTALL httpfs", /extension/);
  refused("LOAD json", /extension/);
  refused("PRAGMA version", /locked/);
  refused("SET threads = 2", /locked at start/);
  refused("RESET threads", /locked/);
  refused("BEGIN TRANSACTION", /Transactions/);
  refused("COMMIT", /Transactions/);
  refused("CHECKPOINT", /administration/);
  refused("CALL duckdb_tables()", /CALL/);
  refused("DESCRIBE orders", /whitelist/);
  refused("SUMMARIZE orders", /profiles/);
  refused("CREATE MACRO m(x) AS x + 1", /CREATE MACRO is not in the whitelist/);
  refused("CREATE TEMP TABLE x AS SELECT 1", /TEMP/);
  refused("CREATE TABLE x (a INT)", /column definitions/);
  refused("CREATE TABLE orders AS SELECT 1", /imported table/);
  refused("CREATE OR REPLACE VIEW orders AS SELECT 1", /imported table/);
  refused("CREATE VIEW \"Bad Name\" AS SELECT 1", /lower-case letters/);
  refused("CREATE VIEW lima AS SELECT 1", /exists already/);
  refused("CREATE TABLE lima AS SELECT 1", /drop it first/);
  refused("DROP TABLE orders", /read-only/);
  refused("DROP VIEW totals", /DROP TABLE totals/);
  refused("DROP VIEW nothing", /no derived view/);
  refused("DROP VIEW lima CASCADE", /CASCADE/);
  refused("DROP TABLE IF EXISTS \"ORDERS\"", /cannot name a derived object/);
  refused("DROP TABLE IF EXISTS \"TOTALS\"", /cannot name a derived object/);
  refused("DROP TABLE IF EXISTS __dw_result", /cannot name a derived object/);
  refused("DROP SCHEMA main", /not in the whitelist/);
  refused("SELECT 1; DELETE FROM orders", /Statement 2 is refused/);
});

test("refused inside a query: files, URLs, SQL from text, other table functions, unknown names, NATURAL and POSITIONAL joins", () => {
  refused("SELECT * FROM read_csv('dw/1/orders.csv')", /reads files/);
  refused("SELECT * FROM read_parquet('https://example.com/x.parquet')", /reads files/);
  refused("SELECT * FROM 'dw/1/orders.csv'", /reads a file or URL as a table/);
  refused("FROM 'https://example.com/x.csv'", /reads a file or URL/);
  refused("SELECT * FROM orders, 'x.csv'", /reads a file or URL/);
  refused("SELECT * FROM orders JOIN 'x.csv' ON true", /reads a file or URL/);
  refused("SELECT * FROM \"x.csv\"", /not a table of the workbench/);
  refused("SELECT * FROM query('SELECT 1')", /runs SQL from text/);
  refused("SELECT * FROM query_table('orders')", /runs SQL from text/);
  refused("SELECT (SELECT count(*) FROM glob('dw/*'))", /reads files/);
  refused("SELECT * FROM duckdb_tables()", /only range, generate_series and unnest/);
  refused("SELECT * FROM main.orders", /without a schema/);
  refused("SELECT * FROM __dw_result", /working tables/);
  refused("SELECT * FROM nowhere", /not a table of the workbench/);
  refused("SELECT * FROM orders WHERE city IN (SELECT city FROM nowhere)", /nowhere is not a table/);
  refused("SELECT * FROM orders NATURAL JOIN customers", /NATURAL JOIN/);
  refused("SELECT * FROM orders POSITIONAL JOIN customers", /POSITIONAL JOIN/);
  refused("CREATE VIEW v AS SELECT * FROM read_csv('x')", /reads files/);
});

test("what a record reads from a statement: tables, WITH names, order, clauses, TRY_CASTs, aggregates and key joins", () => {
  const [s] = accepted("WITH c2 AS (SELECT * FROM customers) SELECT o.city, sum(TRY_CAST(o.amount AS DOUBLE)) AS s, count(DISTINCT o.customer) FROM orders AS o LEFT JOIN c2 ON o.customer = c2.customer AND o.city IS NOT DISTINCT FROM c2.city WHERE o.city <> 'x' GROUP BY 1 ORDER BY 1");
  const q = s.query;
  assert.deepEqual(q.refs, ["customers", "orders"]);
  assert.deepEqual(q.ctes, ["c2"]);
  assert.equal(q.ordered, true);
  assert.equal(q.single, true);
  assert.equal(q.withText, "WITH c2 AS (SELECT * FROM customers)");
  assert.equal(q.fromText, "orders AS o LEFT JOIN c2 ON o.customer = c2.customer AND o.city IS NOT DISTINCT FROM c2.city");
  assert.equal(q.whereText, "o.city <> 'x'");
  assert.deepEqual(q.tryCasts, [{ expr: "o.amount", type: "DOUBLE" }]);
  assert.deepEqual(q.aggregates, [{ fn: "count", column: "o.customer" }], "an aggregate over a column; sum over an expression is not one");
  assert.equal(q.joins.length, 1);
  assert.equal(q.joins[0].diagnostics, false, "key pairs that mix = and IS NOT DISTINCT FROM are not followed");
  const [u] = accepted("SELECT * FROM orders JOIN customers USING (customer)");
  assert.deepEqual(u.query.joins.map((/** @type {any} */ j) => [j.kind, j.left.name, j.right.name, j.keys, j.diagnostics]), [["inner", "orders", "customers", [{ left: "customer", right: "customer" }], true]]);
  const [chain] = accepted("SELECT * FROM orders o JOIN customers c ON o.customer = c.customer JOIN totals t ON c.city = t.city");
  assert.deepEqual(chain.query.joins.map((/** @type {any} */ j) => [j.left?.name ?? null, j.diagnostics]), [["orders", true], [null, false]], "the left side of a later join is the earlier joins, not one table");
  const [x] = accepted("SELECT * FROM orders CROSS JOIN customers");
  assert.deepEqual([x.query.joins[0].kind, x.query.joins[0].diagnostics], ["cross", false]);
  const [set] = accepted("SELECT city FROM orders UNION SELECT name FROM customers");
  assert.deepEqual([set.query.single, set.query.ordered], [false, false], "a set operation is not one SELECT, and has no ORDER BY at its own level");
  const [sub] = accepted("SELECT * FROM (SELECT * FROM orders ORDER BY city) t");
  assert.equal(sub.query.ordered, false, "an ORDER BY inside a subquery does not order the result");
});
