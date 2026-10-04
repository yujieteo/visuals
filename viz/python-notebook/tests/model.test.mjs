// The notebook document: .ipynb import and export, ids, cell edits and safe file names, run as the page runs them.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const M = require("../src/model.js");
const S = require("../src/store.js");

const TRICKY = "</script><!-- ${x}   é\r\nno newline at end";

test("export then import gives the same notebook, with unknown fields and outputs kept", () => {
  const input = {
    nbformat: 4, nbformat_minor: 4, metadata: { custom: { keep: [1, { two: 2 }] } }, extra_top: true,
    cells: [
      { cell_type: "markdown", id: "a", metadata: {}, source: ["# T\n", TRICKY], attachments: { "x.png": { "image/png": "iVBORw0KGgo=" } } },
      { cell_type: "code", id: "b", metadata: { tags: ["t"] }, execution_count: 7, source: "print(1)\n\n",
        outputs: [
          { output_type: "stream", name: "stdout", text: ["one\n", "two"] },
          { output_type: "execute_result", execution_count: 7, metadata: {}, data: { "text/plain": ["a\n", "b"], "application/x-custom": { k: 1 } } },
          { output_type: "error", ename: "ValueError", evalue: "bad", traceback: ["line"] },
          { output_type: "future_kind", payload: [1] },
        ] },
      { cell_type: "raw", id: "c", metadata: { format: "text/html" }, source: TRICKY },
    ],
  };
  const { notebook, newIds } = M.parseIpynb(JSON.stringify(input));
  assert.equal(newIds, 0);
  assert.equal(notebook.nbformat_minor, 5, "a notebook with ids is nbformat 4.5");
  assert.equal(notebook.cells[0].source, `# T\n${TRICKY}`);
  assert.equal(notebook.cells[1].outputs[0].text, "one\ntwo");
  const text = M.toIpynb(notebook);
  const out = JSON.parse(text);
  assert.equal(out.extra_top, true);
  assert.deepEqual(out.metadata, input.metadata);
  assert.deepEqual(out.cells[0].attachments, input.cells[0].attachments);
  assert.deepEqual(out.cells[0].source, ["# T\n", "</script><!-- ${x}   é\r\n", "no newline at end"], "source is written as Jupyter's list of lines");
  assert.deepEqual(out.cells[1].source, ["print(1)\n", "\n"]);
  assert.deepEqual(out.cells[1].outputs[0].text, ["one\n", "two"]);
  assert.deepEqual(out.cells[1].outputs[1].data, input.cells[1].outputs[1].data);
  assert.deepEqual(out.cells[1].outputs[2], input.cells[1].outputs[2]);
  assert.deepEqual(out.cells[1].outputs[3], input.cells[1].outputs[3], "an unknown output type goes out unchanged");
  assert.deepEqual(M.parseIpynb(text).notebook, notebook, "import of the export is the same notebook");
  assert.equal(M.toIpynb(M.parseIpynb(text).notebook), text, "export is stable");
});

test("missing, bad and repeated cell ids get new ids, and the count says how many", () => {
  const cell = (id) => ({ cell_type: "raw", id, metadata: {}, source: "" });
  const { notebook, newIds } = M.parseIpynb(JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {},
    cells: [cell("ok"), cell("ok"), cell("has space"), cell("x".repeat(65)), { cell_type: "raw", source: "" }] }));
  assert.equal(newIds, 4);
  const ids = notebook.cells.map((c) => c.id);
  assert.equal(ids[0], "ok");
  assert.equal(new Set(ids).size, 5);
  for (const id of ids) assert.match(id, /^[a-zA-Z0-9_-]{1,64}$/);
});

test("a file that is not an nbformat 4 notebook is refused with the reason", () => {
  const bad = [
    ["{", /not JSON/], ["[]", /top level/], ['{"nbformat":3,"nbformat_minor":0,"cells":[]}', /nbformat 3/],
    ['{"nbformat":4,"nbformat_minor":5}', /cells is not a list/],
    ['{"nbformat":4,"nbformat_minor":5,"cells":[{"cell_type":"python","source":""}]}', /cell 1: cell_type "python"/],
    ['{"nbformat":4,"nbformat_minor":5,"cells":[{"cell_type":"code","source":"","outputs":[{"output_type":"stream","text":"x"}]}]}', /cell 1, output 1: a stream output needs a name/],
    ['{"nbformat":4,"nbformat_minor":5,"cells":[{"cell_type":"code","source":"","execution_count":1.5}]}', /execution_count/],
  ];
  for (const [text, reason] of bad) assert.throws(() => M.parseIpynb(text), (e) => e instanceof M.NotebookError && reason.test(e.message), text);
});

test("streams join as in Jupyter, cells move within bounds and a duplicate gets a new id", () => {
  const cell = M.newCell("code");
  M.appendOutput(cell, { output_type: "stream", name: "stdout", text: "a" });
  M.appendOutput(cell, { output_type: "stream", name: "stdout", text: "b" });
  M.appendOutput(cell, { output_type: "stream", name: "stderr", text: "c" });
  M.appendOutput(cell, { output_type: "stream", name: "stdout", text: "d" });
  assert.deepEqual(cell.outputs.map((o) => o.text), ["ab", "c", "d"]);
  const nb = M.newNotebook();
  nb.cells.push(M.newCell("markdown", "m"), cell);
  const [first, , last] = nb.cells.map((c) => c.id);
  assert.equal(M.moveCell(nb, first, -1), false);
  assert.equal(M.moveCell(nb, last, 1), false);
  assert.equal(M.moveCell(nb, last, -2), true);
  assert.deepEqual(nb.cells.map((c) => c.id), [last, first, nb.cells[2].id]);
  const copy = M.duplicateCell(cell);
  assert.notEqual(copy.id, cell.id);
  copy.outputs[0].text = "changed";
  assert.equal(cell.outputs[0].text, "ab", "a duplicate shares no outputs with its source");
});

test("data file names stay inside the notebook folder, and a taken name gets the next free number", () => {
  assert.equal(M.safePath("./data/sales.csv"), "data/sales.csv");
  assert.equal(M.safePath("é.csv"), "é.csv", "names are NFC");
  for (const bad of ["", "/etc/passwd", "../x", "a/../b", "a//b", "a\\b", ".env", "d/.hidden", "a\u0000b", "x".repeat(256)]) {
    assert.throws(() => M.safePath(bad), M.NotebookError, JSON.stringify(bad));
  }
  assert.equal(M.freePath("d/sales.csv", new Set(["d/sales (2).csv"])), "d/sales (3).csv");
  assert.equal(M.freePath("v1.2/README", new Set()), "v1.2/README (2)", "a dot in a folder is not an extension");
});

test("the memory store keeps copies, sorts and deletes a notebook's files with it", async () => {
  const store = new S.MemoryStore();
  const record = { id: "n1", name: "One", updated: 1, notebook: M.newNotebook() };
  await store.put(record);
  await store.put({ id: "n2", name: "Two", updated: 2, notebook: M.newNotebook() });
  record.name = "changed after put";
  assert.equal((await store.get("n1")).name, "One", "a put keeps a copy");
  assert.deepEqual((await store.list()).map((r) => r.id), ["n2", "n1"], "newest first");
  await store.putFile({ notebook: "n1", path: "b.csv", bytes: new Uint8Array([1]) });
  await store.putFile({ notebook: "n1", path: "a.csv", bytes: new Uint8Array([2]) });
  await store.putFile({ notebook: "n2", path: "a.csv", bytes: new Uint8Array([3]) });
  assert.deepEqual((await store.files("n1")).map((f) => f.path), ["a.csv", "b.csv"]);
  await store.remove("n1");
  assert.equal(await store.get("n1"), undefined);
  assert.deepEqual(await store.files("n1"), []);
  assert.equal((await store.files("n2")).length, 1, "another notebook's file with the same path stays");
});
