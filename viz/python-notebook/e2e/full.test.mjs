// Python Notebook, the fuller checks that need no Python: the harness stages the page without the runtime
// files, so these drive cells, keys, commands, .ipynb export and import, themes and motion. tests/gate/ runs
// Python itself, in both forms, with the pinned runtime.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertDarkMode, assertReducedMotion, blur, fullSuite, saved, using } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const cells = (page) => page.$$eval(".cell", (nodes) => nodes.map((n) => /** @type {HTMLElement} */ (n).dataset.type));
const mod = process.platform === "darwin" ? "Meta" : "Control";

await fullSuite("python-notebook", {
  keyboard: (ctx) => using(ctx.open, async (s) => {
    const before = await cells(s.page);
    await blur(s.page);
    await s.page.locator(".cell").first().focus();
    await s.page.keyboard.press("b");
    const after = await cells(s.page);
    assert.equal(after.length, before.length + 1, "B adds a cell below");
    assert.equal(after[1], "code");
    assert.equal(await s.page.evaluate(() => document.activeElement?.classList.contains("cell") && document.activeElement.matches(".cell:nth-child(2)")), true, "the new cell is selected");
    await s.page.keyboard.press("Enter");
    const editor = s.page.locator(".cell:nth-child(2) textarea");
    await assert.doesNotReject(editor.evaluate((el) => { if (el !== document.activeElement) throw new Error("Enter does not edit the cell"); }));
    await s.page.keyboard.type("if True:");
    await s.page.keyboard.press("Enter");
    await s.page.keyboard.press("Tab");
    await s.page.keyboard.type("x = 1");
    assert.equal(await editor.inputValue(), "if True:\n    x = 1", "Tab indents in the editor");
    await s.page.keyboard.press("Escape");
    assert.equal(await s.page.evaluate(() => document.activeElement?.matches(".cell:nth-child(2)")), true, "Escape leaves the editor for the cell");
    await s.page.keyboard.press("Tab");
    assert.equal(await s.page.evaluate(() => document.activeElement?.closest(".cell:nth-child(2)") !== null && document.activeElement?.tagName === "BUTTON"), true, "after Escape, Tab moves focus on");
    await s.page.locator(".cell:nth-child(2)").focus();
    await s.page.keyboard.press("m");
    assert.equal((await cells(s.page))[1], "markdown", "M makes the cell Markdown");
    await s.page.keyboard.press("Escape");
    await s.page.locator(".cell:nth-child(2)").focus();
    await s.page.keyboard.press("Alt+ArrowUp");
    assert.equal((await cells(s.page))[0], "markdown", "Alt+Up moves the cell up");
    await blur(s.page);
    await s.page.keyboard.press("?");
    await s.page.locator("dialog[open]").getByRole("heading", { name: "Keyboard shortcuts" }).waitFor();
    await s.page.keyboard.press("Escape");
    assert.equal(await s.page.locator("dialog[open]").count(), 0, "Escape closes the dialog");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    const before = await cells(s.page);
    await blur(s.page);
    await s.page.keyboard.press(`${mod}+k`);
    const search = s.page.getByRole("combobox", { name: "Search commands" });
    await search.fill("add markdown");
    await search.press("Enter");
    // The command runs on the dialog's close event, which fires in a later task.
    await s.page.waitForFunction((n) => document.querySelectorAll(".cell").length === n, before.length + 1);
    const after = await cells(s.page);
    assert.equal(after.length, before.length + 1);
    assert.ok(after.includes("markdown") && after.filter((t) => t === "markdown").length === before.filter((t) => t === "markdown").length + 1, "the command adds a Markdown cell");
    assert.equal(await s.page.locator("dialog[open]").count(), 0, "the palette closes");
  }),

  "json-round-trip": (ctx) => using(ctx.open, async (s) => {
    // An .ipynb with delimiters in text, an opaque field and output, and a script-like HTML output.
    const tricky = "</script><!-- <script>alert(1)</script> ${x}   é";
    /** @type {any} */
    const input = {
      nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: "python3", display_name: "Python 3" }, custom: { keep: [1, 2] } },
      cells: [
        { cell_type: "markdown", id: "md-1", metadata: { tags: ["t"] }, source: ["# Title\n", tricky] },
        { cell_type: "code", id: "code-1", metadata: {}, execution_count: 3, source: `print(${JSON.stringify(tricky)})`,
          outputs: [
            { output_type: "stream", name: "stdout", text: [tricky, "\n"] },
            { output_type: "display_data", metadata: {}, data: { "text/html": ["<img src=\"https://example.invalid/x.png\" onerror=\"window.__pwned=1\">", "<script>window.__pwned=2</script><b>bold</b>"], "text/plain": "<HTML>" } },
            { output_type: "display_data", metadata: {}, data: { "application/vnd.custom+json": { a: 1 }, "text/plain": "custom" } },
          ] },
        { cell_type: "raw", id: "raw-1", metadata: { format: "text/html" }, source: tricky },
      ],
    };
    await s.page.locator("#open-ipynb").setInputFiles({ name: "Tricky.ipynb", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(input)) });
    await s.page.waitForFunction(() => document.querySelector("#nb-name")?.textContent === "Tricky");
    assert.deepEqual(await cells(s.page), ["markdown", "code", "raw"]);
    assert.equal(await s.page.evaluate(() => /** @type {any} */ (window).__pwned), undefined, "imported HTML runs no script and no handler");
    assert.equal(await s.page.locator(".output-html b").innerText(), "bold", "safe HTML is shown");
    assert.equal(await s.page.locator(".cell[data-type=code]").getAttribute("data-state"), "idle", "import runs no cell");
    assert.equal(await s.page.locator(".cell[data-type=raw] textarea").inputValue(), tricky, "raw text is shown as it is");
    const { name, text } = await saved(s.page, () => s.page.locator("#export-ipynb").click());
    assert.equal(name, "Tricky.ipynb");
    const out = JSON.parse(text);
    const join = (/** @type {string | string[]} */ v) => (Array.isArray(v) ? v.join("") : v);
    assert.deepEqual(out.metadata.custom, input.metadata.custom, "unknown notebook metadata is kept");
    assert.deepEqual(out.cells.map((/** @type {any} */ c) => c.id), ["md-1", "code-1", "raw-1"]);
    assert.deepEqual(out.cells.map((/** @type {any} */ c) => join(c.source)), input.cells.map((/** @type {any} */ c) => join(c.source)), "sources keep their exact text");
    assert.deepEqual(out.cells[0].metadata, { tags: ["t"] });
    assert.equal(out.cells[1].execution_count, 3);
    assert.equal(join(out.cells[1].outputs[0].text), `${tricky}\n`);
    assert.deepEqual(out.cells[1].outputs[1].data["text/html"].join(""), input.cells[1].outputs[1].data["text/html"].join(""), "HTML output is kept unchanged for export");
    assert.deepEqual(out.cells[1].outputs[2].data["application/vnd.custom+json"], { a: 1 }, "an output the page cannot show is kept");
    // The export opens again to the same notebook.
    await s.page.locator("#open-ipynb").setInputFiles({ name: "Again.ipynb", mimeType: "application/json", buffer: Buffer.from(text) });
    await s.page.waitForFunction(() => document.querySelector("#nb-name")?.textContent === "Again");
    const again = JSON.parse((await saved(s.page, () => s.page.locator("#export-ipynb").click())).text);
    assert.deepEqual(again, out, "export, import and export give the same file");
    const bad = await readFile(new URL("../tests/fixtures/not-a-notebook.ipynb", import.meta.url));
    await s.page.locator("#open-ipynb").setInputFiles({ name: "Bad.ipynb", mimeType: "application/json", buffer: bad });
    await s.page.locator("#notice").getByText("Bad.ipynb was not opened").waitFor();
    assert.equal(await s.page.locator("#nb-name").textContent(), "Again", "a bad file leaves the open notebook as it was");
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, (page) => page.locator("#add-code").click()),
});
