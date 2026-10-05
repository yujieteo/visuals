// Write the Parquet file the browser checks import: 40 rows with an integer id, a decimal, a zoned timestamp, a
// nested column and text. Run as its own process (node tools/write_parquet.mjs OUT), because the pinned engine's Node build
// reads its extension cache from a home folder it sets for itself.
import { engine } from "../tests/engine.mjs";

const out = process.argv[2];
const open = await engine({ locked: false });
await open.query(`COPY (SELECT i AS id, (i * 1.25)::DECIMAL(10,2) AS amount, to_timestamp(1767225600 + i * 3600) AS seen,
  {'a': i} AS nested, 'item ' || i AS label FROM range(1, 41) t(i)) TO '${out.replace(/'/g, "''")}' (FORMAT parquet)`);
