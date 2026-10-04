// The notebook interface: cells, outputs, the Python session, saved work, files, exports and settings.
//
// One notebook is active at a time and has at most one Python session. A session belongs to that notebook:
// opening another notebook ends it, so no variable passes between notebooks. Stop and Restart end the
// session's worker (there is no soft interrupt without SharedArrayBuffer) and start a new one; cells, outputs
// and saved files stay. Nothing here runs a cell by itself: only Run cell, Run all and their keys do.
(function () {
  "use strict";
  const { model, portable, render, runtime, store: stores, offline } = /** @type {any} */ (window).PyNb;

  const $ = (selector, root = document) => /** @type {HTMLElement} */ (root.querySelector(selector));
  const $$ = (selector, root = document) => /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll(selector)));
  /** @param {string} tag @param {Record<string, any>} [attrs] @param {...(Node | string)} children */
  function h(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value === null || value === undefined) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : String(value));
    }
    node.append(...children);
    return node;
  }
  const button = (label, onclick, attrs = {}) => h("button", { type: "button", onclick, ...attrs }, label);
  const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
  const bytesText = (bytes) => `${bytes.toLocaleString("en")} bytes (${mb(bytes)})`;
  const sha256 = runtime.sha256;

  const manifest = JSON.parse(/** @type {string} */ ($("#pynb-runtime").textContent));
  const FORM = document.documentElement.dataset.pynbForm === "portable" ? "portable" : "site";
  const RUNTIME_BYTES = manifest.downloads.reduce((sum, f) => sum + f.bytes, 0);

  /** @type {{store: any, record: any, files: any[], active: string | null, editing: Set<string>, dirty: boolean, saveTimer: any, saveFailed: string | null, pyFiles: any[]}} */
  const app = { store: null, record: null, files: [], active: null, editing: new Set(), dirty: false, saveTimer: null, saveFailed: null, pyFiles: [] };

  // Python session ------------------------------------------------------------------------------------------

  const py = {
    /** @type {any} */ session: null,
    state: "off",            // off | loading | starting | ready | failed
    /** @type {Record<string, Blob> | null} */ files: null,
    /** @type {Promise<Record<string, Blob>> | null} */ loading: null,
    /** @type {Set<(done: number, total: number) => void>} */ loadListeners: new Set(),
    /** @type {[number, number] | null} */ loadProgress: null,
    /** @type {Promise<void> | null} */ starting: null,
    /** @type {{cellId: string, runId: string, resolve: (status: string) => void} | null} */ running: null,
    busy: false,
    generation: 0,
    runs: 0,
    requests: new Map(),
    nextRequest: 1,
    info: null,
    refused: 0,
    readySeconds: 0,
  };

  function setPython(state, text) {
    py.state = state;
    $("#py-status").textContent = `Python: ${text}`;
    document.documentElement.dataset.python = state;
    updateControls();
  }

  /** Load the runtime files once; a second caller during the load gets the same promise and the same progress. @param {(done: number, total: number) => void} progress */
  function loadRuntime(progress) {
    if (py.files) return Promise.resolve(py.files);
    py.loadListeners.add(progress);
    if (py.loadProgress) progress(...py.loadProgress);
    if (!py.loading) {
      const report = (done, total) => {
        py.loadProgress = [done, total];
        for (const listener of py.loadListeners) listener(done, total);
      };
      py.loading = (FORM === "portable" ? runtime.loadEmbedded(manifest, document) : runtime.loadFetched(manifest, report))
        .then((files) => (py.files = files))
        .finally(() => { py.loading = null; py.loadListeners.clear(); py.loadProgress = null; });
    }
    return py.loading;
  }

  /** Start Python for the active notebook, once; the promise resolves when the kernel is ready and has the saved files. */
  function startPython() {
    if (py.starting) return py.starting;
    const notebookId = app.record && app.record.id;
    const generation = py.generation;
    py.starting = (async () => {
      if (!py.files) setPython("loading", FORM === "portable" ? "reading the embedded runtime" : `loading the runtime, 0 of ${mb(RUNTIME_BYTES)}`);
      const files = await loadRuntime((done, total) => setPython("loading", `loading the runtime, ${mb(done)} of ${mb(total)}`));
      if (generation !== py.generation) return;
      setPython("starting", "starting");
      const started = performance.now();
      await new Promise((resolve, reject) => {
        const session = new runtime.Session({ manifest, files, onMessage: (message) => onMessage(session, message, resolve, reject) });
        py.session = session;
      });
      py.readySeconds = (performance.now() - started) / 1000;
      if (generation !== py.generation || !app.record || app.record.id !== notebookId) return;
      await writeSavedFiles(app.files);
      setPython("ready", `ready (Python ${py.info.python}, Pyodide ${py.info.pyodide}; started in ${py.readySeconds.toFixed(1)} s)`);
      $("#start-panel").hidden = true;
    })();
    py.starting.catch((error) => {
      if (generation !== py.generation) return;
      py.starting = null;
      if (py.session) py.session.terminate();
      py.session = null;
      setPython("failed", `did not start. ${error.message || error}`);
    });
    return py.starting;
  }

  /** End the session (Stop, Restart, another notebook). The running cell gets a Stopped output. @param {string} why */
  function endSession(why) {
    py.generation++;
    if (py.session) py.session.terminate();
    py.session = null;
    py.starting = null;
    for (const { reject } of py.requests.values()) reject(new Error("Python was stopped"));
    py.requests.clear();
    $$(".ask").forEach((node) => node.remove());
    const running = py.running;
    py.running = null;
    if (running) {
      const cell = cellById(running.cellId);
      if (cell) {
        model.appendOutput(cell, { output_type: "error", ename: "Stopped", evalue: why, traceback: [`Stopped: ${why}`] });
        refreshCell(cell.id);
      }
      running.resolve("stopped");
    }
    $$(".cell[data-state=queued]").forEach((node) => setCellState(node.dataset.id, "idle"));
    app.pyFiles = [];
    renderFiles();
    setPython("off", "not started");
  }

  /** @param {any} session @param {any} message */
  function onMessage(session, message, resolveStart, rejectStart) {
    if (session !== py.session) return;
    switch (message.type) {
      case "ready":
        py.info = message.info;
        app.pyFiles = message.files;
        resolveStart();
        break;
      case "fail":
        if (py.state !== "ready") rejectStart(new Error(message.text.split("\n")[0]));
        else {
          notice(`Python failed: ${message.text.split("\n")[0]}`, "bad");
          if (py.running) { py.running.resolve("error"); py.running = null; }
        }
        break;
      case "out": onOutput(message.id, JSON.parse(message.json)); break;
      case "ask": showAsk(message); break;
      case "files": app.pyFiles = message.files; renderFiles(); break;
      case "refused":
        py.refused++;
        notice(`Python tried to reach ${message.url} (${message.kind}). The request was refused: this notebook makes no network request.`, "warn");
        break;
      case "written": case "file": case "probe": {
        const pending = py.requests.get(message.id);
        py.requests.delete(message.id);
        if (pending) pending.resolve(message);
        break;
      }
      case "error": notice(`Python worker error: ${message.text.split("\n")[0]}`, "bad"); break;
    }
  }

  /** A request to the worker that has an answer. @param {object} message @param {Transferable[]} [transfer] */
  function request(message, transfer) {
    if (!py.session) return Promise.reject(new Error("Python is not running"));
    const id = py.nextRequest++;
    return new Promise((resolve, reject) => {
      py.requests.set(id, { resolve, reject });
      py.session.post({ ...message, id }, transfer);
    });
  }

  async function writeSavedFiles(files) {
    if (!files.length || !py.session) return;
    const answer = await request({ type: "write", files: files.map((f) => ({ path: f.path, blob: f.blob })) });
    app.pyFiles = answer.files;
    renderFiles();
  }

  /** @param {string} runId @param {any} output */
  function onOutput(runId, output) {
    const running = py.running;
    if (!running || running.runId !== runId) return;
    const cell = cellById(running.cellId);
    if (output.kind === "done") {
      if (cell && output.execution_count) cell.execution_count = output.execution_count;
      if (cell) $(`.cell[data-id="${cell.id}"]`)?.setAttribute("data-seconds", String(output.seconds ?? ""));
      running.resolve(output.status);
      return;
    }
    if (!cell) return;
    if (output.kind === "fatal") {
      model.appendOutput(cell, { output_type: "error", ename: "KernelError", evalue: output.text, traceback: [`KernelError: ${output.text}`] });
    } else {
      $(`.cell[data-id="${cell.id}"] .ask`)?.remove();
      model.appendOutput(cell, output);
    }
    refreshOutputs(cell);
  }

  /** @param {{id: string, ask: number, prompt: string, password: boolean}} message */
  function showAsk(message) {
    const running = py.running;
    if (!running || running.runId !== message.id) return;
    const node = $(`.cell[data-id="${running.cellId}"]`);
    if (!node) return;
    const session = py.session;
    const input = /** @type {HTMLInputElement} */ (h("input", { type: message.password ? "password" : "text", "aria-label": message.prompt || "Input for Python", autocomplete: "off" }));
    const answer = (cancelled) => {
      box.remove();
      session.post(cancelled ? { type: "answer", ask: message.ask, cancelled: true } : { type: "answer", ask: message.ask, value: input.value });
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); answer(false); }
      if (event.key === "Escape") { event.preventDefault(); answer(true); }
    });
    const box = h("form", { class: "ask", onsubmit: (event) => { event.preventDefault(); answer(false); } },
      h("label", {}, h("span", { class: "ask-prompt", text: message.prompt || "Python asks for input:" }), input),
      h("button", { type: "submit", class: "primary" }, "Send"),
      button("Cancel", () => answer(true)));
    node.querySelector(".cell-body").append(box);
    input.focus();
  }

  /** Run one code cell; resolves "ok", "error", "stopped" or "busy". @param {string} id */
  async function runOne(id) {
    const cell = cellById(id);
    if (!cell || cell.cell_type !== "code") return "ok";
    const generation = py.generation;
    setCellState(id, "starting");
    try {
      await startPython();
    } catch {
      setCellState(id, "idle");
      return "error";
    }
    if (generation !== py.generation || !py.session) { setCellState(id, "idle"); return "stopped"; }
    cell.outputs = [];
    cell.execution_count = null;
    refreshOutputs(cell);
    setCellState(id, "running");
    const runId = `${id}:${++py.runs}`;
    const status = await new Promise((resolve) => {
      py.running = { cellId: id, runId, resolve };
      py.session.post({ type: "run", id: runId, source: cell.source });
      setPython("ready", `running cell ${indexText(id)}`);
    });
    py.running = null;
    if (py.session) setPython("ready", `ready (Python ${py.info.python}, Pyodide ${py.info.pyodide})`);
    setCellState(id, status === "ok" ? "done" : status === "stopped" ? "stopped" : "error");
    refreshCell(id);
    changed();
    return status;
  }

  /** Run cells in order, one at a time; stop at the first error. @param {string[]} ids */
  async function runCells(ids) {
    if (py.busy) { notice("A cell is running. Wait for it, or press Stop."); return; }
    py.busy = true;
    updateControls();
    const generation = py.generation;
    ids.forEach((id) => setCellState(id, "queued"));
    try {
      for (let i = 0; i < ids.length; i++) {
        if (generation !== py.generation) break;
        const status = await runOne(ids[i]);
        if (status !== "ok") {
          ids.slice(i + 1).forEach((id) => setCellState(id, "idle"));
          if (status === "error" && ids.length > 1) notice(`Run all stopped at cell ${indexText(ids[i])}: it has an error. The cells after it did not run.`, "bad");
          break;
        }
      }
    } finally {
      py.busy = false;
      updateControls();
    }
  }

  function runActive(advance) {
    const cell = app.active && cellById(app.active);
    if (!cell) return;
    if (cell.cell_type === "markdown") { app.editing.delete(cell.id); refreshCell(cell.id); }
    else if (cell.cell_type === "code") runCells([cell.id]);
    if (advance) {
      const index = model.indexOf(app.record.notebook, cell.id);
      const next = app.record.notebook.cells[index + 1];
      if (next) select(next.id, true);
      else addCell("code", true);
    }
  }

  function runAll() {
    runCells(app.record.notebook.cells.filter((c) => c.cell_type === "code").map((c) => c.id));
  }

  function stop() {
    if (!py.session && !py.starting) return;
    endSession("Python was stopped while this cell ran. All Python variables are cleared.");
    notice("Python stopped. All Python variables are cleared. Cells, outputs and saved files are kept. Python starts again now.", "warn");
    startPython().catch(() => {});
  }

  function restart() {
    const wasOn = py.session || py.starting;
    endSession("Python restarted while this cell ran. All Python variables are cleared.");
    if (!wasOn && !py.files && FORM === "site") return startPrompt();
    notice("Python restarted. All Python variables are cleared; run the cells again to make them. Saved files are back in /notebook.");
    startPython().catch(() => {});
  }

  // Cells -----------------------------------------------------------------------------------------------------

  const cellById = (id) => app.record && app.record.notebook.cells.find((c) => c.id === id);
  const indexText = (id) => String(model.indexOf(app.record.notebook, id) + 1);

  const STATE_TEXT = { idle: "", queued: "Queued", starting: "Waiting for Python", running: "Running", done: "Done", error: "Error", stopped: "Stopped" };
  /** @param {string} id @param {string} state */
  function setCellState(id, state) {
    const node = $(`.cell[data-id="${id}"]`);
    if (!node) return;
    node.dataset.state = state;
    const cell = cellById(id);
    let text = STATE_TEXT[state] || "";
    if (state === "done" && node.dataset.seconds) text = `Done in ${Number(node.dataset.seconds).toFixed(2)} s`;
    $(".cell-state", node).textContent = text;
    $(".prompt", node).textContent = cell && cell.cell_type === "code" ? `[${state === "running" ? "*" : cell.execution_count ?? " "}]` : "";
  }

  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /** @param {any} cell */
  function refreshOutputs(cell) {
    const node = $(`.cell[data-id="${cell.id}"] .outputs`);
    if (!node) return;
    node.replaceChildren(...(cell.outputs || []).map((output) => h("div", { class: `output output-${output.output_type}` }, render.output(output, download))));
  }

  function autosize(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }

  /** @param {any} cell */
  function cellNode(cell) {
    const number = model.indexOf(app.record.notebook, cell.id) + 1;
    const kind = cell.cell_type === "code" ? "Code" : cell.cell_type === "markdown" ? "Markdown" : "Raw";
    const node = h("li", { class: "cell", "data-id": cell.id, "data-type": cell.cell_type, "data-state": "idle", tabindex: "0", "aria-label": `${kind} cell ${number}` });
    const head = h("div", { class: "cell-head" },
      h("span", { class: "prompt num", "aria-hidden": "true" }),
      h("span", { class: "cell-kind label", text: `${kind} ${number}` }),
      h("span", { class: "cell-state", role: "status" }),
      h("span", { class: "grow" }),
      cell.cell_type === "code" ? button("Run", () => { select(cell.id); runCells([cell.id]); }, { class: "small", "data-run": "", "aria-label": `Run cell ${number}` }) : "",
      cell.cell_type === "markdown" ? button(app.editing.has(cell.id) ? "Show" : "Edit", () => toggleEdit(cell.id), { class: "small", "aria-label": `${app.editing.has(cell.id) ? "Show" : "Edit"} Markdown cell ${number}` }) : "",
      button("↑", () => move(cell.id, -1), { class: "small", "aria-label": `Move cell ${number} up`, title: "Move up (Alt+↑)" }),
      button("↓", () => move(cell.id, 1), { class: "small", "aria-label": `Move cell ${number} down`, title: "Move down (Alt+↓)" }),
      button("Duplicate", () => duplicate(cell.id), { class: "small", "aria-label": `Duplicate cell ${number}` }),
      button("Delete", () => removeCell(cell.id), { class: "small", "aria-label": `Delete cell ${number}` }));
    const body = h("div", { class: "cell-body" });
    const showSource = cell.cell_type !== "markdown" || app.editing.has(cell.id) || !cell.source.trim();
    if (showSource) {
      const textarea = /** @type {HTMLTextAreaElement} */ (h("textarea", {
        class: "source", spellcheck: "false", autocapitalize: "off", autocomplete: "off", rows: "1",
        "aria-label": `${kind} cell ${number} source`,
      }));
      textarea.value = cell.source;
      textarea.addEventListener("input", () => { cell.source = textarea.value; autosize(textarea); changed(); });
      textarea.addEventListener("keydown", (event) => editorKey(event, cell, textarea));
      textarea.addEventListener("focus", () => select(cell.id));
      body.append(textarea);
      requestAnimationFrame(() => autosize(textarea));
    } else {
      const view = h("div", { class: "markdown", ondblclick: () => toggleEdit(cell.id) });
      view.append(render.markdown(cell.source, cell.attachments));
      body.append(view);
    }
    if (cell.cell_type === "code") body.append(h("div", { class: "outputs", "aria-live": "polite" }));
    node.append(head, body);
    node.addEventListener("focusin", () => select(cell.id));
    node.addEventListener("keydown", (event) => { if (event.target === node) commandKey(event, cell); });
    return node;
  }

  function refreshCell(id) {
    const cell = cellById(id);
    const old = $(`.cell[data-id="${id}"]`);
    if (!cell || !old) return;
    const state = old.dataset.state;
    const seconds = old.dataset.seconds;
    const node = cellNode(cell);
    if (seconds) node.dataset.seconds = seconds;
    old.replaceWith(node);
    refreshOutputs(cell);
    setCellState(id, state);
    if (app.active === id) node.classList.add("selected");
  }

  function renderCells() {
    const list = $("#cells");
    list.replaceChildren(...app.record.notebook.cells.map(cellNode));
    for (const cell of app.record.notebook.cells) { refreshOutputs(cell); setCellState(cell.id, "idle"); }
    if (!cellById(app.active)) app.active = app.record.notebook.cells[0] ? app.record.notebook.cells[0].id : null;
    markSelected();
  }

  function markSelected() {
    $$(".cell.selected").forEach((node) => node.classList.remove("selected"));
    const node = app.active && $(`.cell[data-id="${app.active}"]`);
    if (node) node.classList.add("selected");
    const cell = app.active && cellById(app.active);
    /** @type {HTMLSelectElement} */ ($("#cell-type")).value = cell ? cell.cell_type : "code";
  }

  /** @param {string} id @param {boolean} [focus] */
  function select(id, focus) {
    if (app.active !== id) { app.active = id; markSelected(); }
    if (focus) {
      const node = $(`.cell[data-id="${id}"]`);
      const textarea = node && node.querySelector("textarea");
      (textarea || node)?.focus();
    }
  }

  /** @param {"code" | "markdown"} type @param {boolean} [focus] @param {number} [offset] */
  function addCell(type, focus = true, offset = 1) {
    const cell = model.newCell(type);
    const index = app.active ? model.indexOf(app.record.notebook, app.active) : app.record.notebook.cells.length - 1;
    app.record.notebook.cells.splice(Math.max(0, index + offset), 0, cell);
    if (type === "markdown") app.editing.add(cell.id);
    renderCells();
    select(cell.id, focus);
    changed();
  }

  function move(id, delta) {
    if (!model.moveCell(app.record.notebook, id, delta)) return;
    renderCells();
    select(id, true);
    changed();
  }

  function duplicate(id) {
    const index = model.indexOf(app.record.notebook, id);
    const copy = model.duplicateCell(app.record.notebook.cells[index]);
    app.record.notebook.cells.splice(index + 1, 0, copy);
    renderCells();
    select(copy.id, true);
    changed();
  }

  async function removeCell(id) {
    const cell = cellById(id);
    if (!cell) return;
    if (py.running && py.running.cellId === id) { notice("This cell is running. Stop it first."); return; }
    if (cell.source.trim() && !(await confirmDialog("Delete this cell?", `Cell ${indexText(id)} and its outputs go. This cannot be undone.`, "Delete cell"))) return;
    const index = model.indexOf(app.record.notebook, id);
    app.record.notebook.cells.splice(index, 1);
    if (!app.record.notebook.cells.length) app.record.notebook.cells.push(model.newCell("code"));
    app.active = app.record.notebook.cells[Math.min(index, app.record.notebook.cells.length - 1)].id;
    renderCells();
    select(app.active, true);
    changed();
  }

  function toggleEdit(id) {
    if (app.editing.has(id)) app.editing.delete(id);
    else app.editing.add(id);
    refreshCell(id);
    select(id, true);
  }

  /** @param {string} type */
  function setType(type) {
    const cell = app.active && cellById(app.active);
    if (!cell || cell.cell_type === type) return;
    if (py.running && py.running.cellId === cell.id) return;
    cell.cell_type = type;
    if (type === "code") { cell.outputs = cell.outputs || []; if (cell.execution_count === undefined) cell.execution_count = null; }
    else { delete cell.outputs; delete cell.execution_count; }
    if (type === "markdown") app.editing.add(cell.id);
    renderCells();
    select(cell.id, true);
    changed();
  }

  function clearOutputs() {
    for (const cell of app.record.notebook.cells) if (cell.cell_type === "code") { cell.outputs = []; cell.execution_count = null; }
    renderCells();
    changed();
  }

  /** Keys in a cell editor. @param {KeyboardEvent} event @param {any} cell @param {HTMLTextAreaElement} textarea */
  function editorKey(event, cell, textarea) {
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === "Enter" && (event.shiftKey || mod)) {
      event.preventDefault();
      runActive(event.shiftKey);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (cell.cell_type === "markdown") { app.editing.delete(cell.id); refreshCell(cell.id); }
      /** @type {HTMLElement} */ ($(`.cell[data-id="${cell.id}"]`))?.focus();
    } else if (event.key === "Tab" && !mod && !event.altKey) {
      // Tab indents; Escape first leaves the editor, so Tab never traps the keyboard.
      event.preventDefault();
      const { selectionStart: start, selectionEnd: end, value } = textarea;
      if (event.shiftKey) {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const spaces = /^ {1,4}/.exec(value.slice(lineStart))?.[0].length || 0;
        textarea.setRangeText("", lineStart, lineStart + spaces, "preserve");
      } else {
        textarea.setRangeText("    ", start, end, "end");
      }
      textarea.dispatchEvent(new Event("input"));
    }
  }

  /** Keys on a selected cell (not in its editor). @param {KeyboardEvent} event @param {any} cell */
  function commandKey(event, cell) {
    const cells = app.record.notebook.cells;
    const index = model.indexOf(app.record.notebook, cell.id);
    const key = event.key;
    if (key === "Enter" && (event.shiftKey || event.ctrlKey || event.metaKey)) { event.preventDefault(); runActive(event.shiftKey); }
    else if (key === "Enter") {
      event.preventDefault();
      if (cell.cell_type === "markdown" && !app.editing.has(cell.id)) toggleEdit(cell.id);
      else /** @type {HTMLElement} */ ($(`.cell[data-id="${cell.id}"] textarea`))?.focus();
    }
    else if (key === "ArrowUp" && event.altKey) { event.preventDefault(); move(cell.id, -1); }
    else if (key === "ArrowDown" && event.altKey) { event.preventDefault(); move(cell.id, 1); }
    else if ((key === "ArrowUp" || key === "k") && index > 0) { event.preventDefault(); select(cells[index - 1].id); $(`.cell[data-id="${cells[index - 1].id}"]`).focus(); }
    else if ((key === "ArrowDown" || key === "j") && index < cells.length - 1) { event.preventDefault(); select(cells[index + 1].id); $(`.cell[data-id="${cells[index + 1].id}"]`).focus(); }
    else if (key === "a") { event.preventDefault(); addCell("code", false, 0); $(`.cell[data-id="${app.active}"]`).focus(); }
    else if (key === "b") { event.preventDefault(); addCell("code", false, 1); $(`.cell[data-id="${app.active}"]`).focus(); }
    else if (key === "m") { event.preventDefault(); setType("markdown"); }
    else if (key === "y") { event.preventDefault(); setType("code"); }
  }

  // Saved work ------------------------------------------------------------------------------------------------

  function setSave(text, state) {
    const node = $("#save-status");
    node.textContent = `Saved work: ${text}`;
    node.dataset.state = state;
  }

  function changed() {
    app.dirty = true;
    if (!app.record) return;
    app.record.updated = Date.now();
    if (app.store.kind === "memory") {
      setSave("in this tab only. Use Save HTML copy or Export .ipynb to keep changes.", "memory");
      return;
    }
    clearTimeout(app.saveTimer);
    setSave("saving", "pending");
    app.saveTimer = setTimeout(save, 400);
  }

  async function save() {
    clearTimeout(app.saveTimer);
    if (!app.record || app.store.kind === "memory") return;
    try {
      await app.store.put(app.record);
      await app.store.setMeta("last", app.record.id);
      app.dirty = false;
      app.saveFailed = null;
      setSave(`saved in this browser at ${new Date().toLocaleTimeString("en-GB")}`, "ok");
    } catch (error) {
      app.saveFailed = stores.reason(error);
      setSave(`NOT saved: ${app.saveFailed}. Use Export .ipynb or Save HTML copy to keep your work.`, "bad");
    }
    renderNotebookList();
  }

  async function renderNotebookList() {
    let list = [];
    try { list = await app.store.list(); } catch { list = app.record ? [app.record] : []; }
    $("#nb-list").replaceChildren(...list.map((item) => h("li", {},
      button(item.name, () => openNotebook(item.id), { "aria-current": app.record && item.id === app.record.id ? "true" : false, class: "nb-item" }))));
    $("#nb-name").textContent = app.record ? app.record.name : "";
    document.title = app.record ? `${app.record.name} · Python Notebook` : "Python Notebook";
  }

  function newRecord(name, notebook) {
    const now = Date.now();
    return { schema: model.SCHEMA, id: model.newId(), name, created: now, updated: now, notebook };
  }

  /** Make record the active notebook: its Python session is new, so no variable passes between notebooks. */
  async function activate(record, files) {
    if (app.record) await save();
    endSession("Another notebook was opened.");
    app.record = record;
    app.files = files;
    app.editing.clear();
    app.active = null;
    renderCells();
    renderFiles();
    await renderNotebookList();
    if (app.store.kind === "memory") setSave("in this tab only. Use Save HTML copy or Export .ipynb to keep changes.", "memory");
    else { await save(); }
    if (FORM === "portable" || py.files || py.loading) startPython().catch(() => {});
    else startPrompt();
  }

  async function openNotebook(id) {
    if (app.record && id === app.record.id) return;
    if (py.busy && !(await confirmDialog("Open another notebook?", "A cell is running. Opening another notebook stops Python and clears its variables.", "Open"))) return;
    const record = await app.store.get(id);
    if (!record) { notice("That notebook is not in storage any more."); return renderNotebookList(); }
    await activate(record, await app.store.files(id));
    closeSide();
  }

  async function newNotebook() {
    const list = await app.store.list();
    const record = newRecord(`Untitled ${list.length + 1}`, model.newNotebook());
    await app.store.put(record);
    await activate(record, []);
    select(record.notebook.cells[0].id, true);
  }

  async function renameNotebook() {
    const name = await promptDialog("Rename the notebook", "Name", app.record.name);
    if (name === null || !name.trim()) return;
    app.record.name = name.trim().slice(0, 120);
    changed();
    renderNotebookList();
  }

  async function duplicateNotebook() {
    await save();
    const record = newRecord(`${app.record.name} copy`, structuredClone(app.record.notebook));
    await app.store.put(record);
    const files = app.files.map((f) => ({ ...f, notebook: record.id }));
    for (const file of files) await app.store.putFile(file);
    await activate(record, files);
    notice(`Made "${record.name}" with ${files.length} data file${files.length === 1 ? "" : "s"}. Its Python session is new.`);
  }

  async function deleteNotebook() {
    const record = app.record;
    const ok = await confirmDialog(`Delete "${record.name}"?`, `The notebook and its ${app.files.length} saved data file${app.files.length === 1 ? "" : "s"} are deleted from this browser. This cannot be undone. Export .ipynb or Save HTML copy first to keep a copy.`, "Delete notebook");
    if (!ok) return;
    await app.store.remove(record.id);
    const rest = await app.store.list();
    app.record = null;
    if (rest.length) await activate(await app.store.get(rest[0].id), await app.store.files(rest[0].id));
    else {
      const blank = newRecord("Untitled 1", model.newNotebook());
      await app.store.put(blank);
      await activate(blank, []);
    }
    notice(`Deleted "${record.name}".`);
  }

  // Files -----------------------------------------------------------------------------------------------------

  function renderFiles() {
    const saved = new Map(app.files.map((f) => [f.path, f]));
    $("#file-list").replaceChildren(...(app.files.length ? app.files.map((file) => h("li", {},
      h("span", { class: "file-path", text: file.path }), h("span", { class: "note num", text: bytesText(file.bytes) }),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: file.include, onchange: (e) => setInclude(file, e.target.checked) }), "In HTML copy"),
      h("span", { class: "row" },
        button("Download", () => download(file.path.split("/").pop(), file.blob), { class: "small", "aria-label": `Download ${file.path}` }),
        button("Delete", () => removeFile(file), { class: "small", "aria-label": `Delete ${file.path}` }))))
      : [h("li", { class: "note", text: "No saved files." })]));
    const made = app.pyFiles.filter((f) => !(saved.has(f.path) && saved.get(f.path).bytes === f.bytes));
    $("#py-files").replaceChildren(...(made.length ? made.map((file) => h("li", {},
      h("span", { class: "file-path", text: file.path }), h("span", { class: "note num", text: bytesText(file.bytes) }),
      h("span", { class: "row" },
        button("Download", () => downloadPython(file.path), { class: "small", "aria-label": `Download ${file.path}` }),
        button("Keep", () => keepPython(file.path), { class: "small", "aria-label": `Keep ${file.path} with the notebook` }))))
      : [h("li", { class: "note", text: py.session ? "None yet." : "Python is not running." })]));
  }

  async function setInclude(file, include) {
    file.include = include;
    await storeFile(file);
  }

  async function storeFile(file) {
    try {
      await app.store.putFile(file);
    } catch (error) {
      notice(`${file.path} is NOT saved: ${stores.reason(error)}. It stays in this tab; Save HTML copy includes it.`, "bad");
    }
  }

  async function removeFile(file) {
    if (!(await confirmDialog(`Delete ${file.path}?`, "It goes from the saved files of this notebook. A copy that Python already has stays until Python restarts.", "Delete file"))) return;
    await app.store.removeFile(file.notebook, file.path);
    app.files = app.files.filter((f) => f !== file);
    renderFiles();
  }

  async function readPython(path) {
    const answer = await request({ type: "read", path });
    if (!answer.bytes) throw new Error(`${path} is not in Python's folder any more`);
    return new Blob([answer.bytes]);
  }

  async function downloadPython(path) {
    try { download(path.split("/").pop(), await readPython(path)); } catch (error) { notice(String(error.message || error), "bad"); }
  }

  async function keepPython(path) {
    try {
      const blob = await readPython(path);
      await addFiles([{ path, blob }], false);
    } catch (error) { notice(String(error.message || error), "bad"); }
  }

  /**
   * Save files with the notebook and give them to Python. A path that exists asks: Replace, Keep both or Skip.
   * @param {{path: string, blob: Blob}[]} incoming @param {boolean} toPython
   */
  async function addFiles(incoming, toPython = true) {
    const added = [];
    for (const item of incoming) {
      let path;
      try { path = model.safePath(item.path); } catch (error) { notice(`Not added: ${error.message}.`, "bad"); continue; }
      const taken = new Set(app.files.map((f) => f.path));
      if (taken.has(path)) {
        const choice = await choiceDialog(`${path} exists`, `This notebook already has a file at ${path}.`, [
          { label: "Replace it", value: "replace" }, { label: "Keep both", value: "both" }, { label: "Skip", value: "skip" }]);
        if (choice === "skip" || choice === null) continue;
        if (choice === "both") path = model.freePath(path, taken);
      }
      const bytes = new Uint8Array(await item.blob.arrayBuffer());
      const file = { notebook: app.record.id, path, blob: new Blob([bytes]), bytes: bytes.length, sha256: await sha256(bytes), include: true, added: Date.now() };
      app.files = app.files.filter((f) => f.path !== path).concat(file).sort((a, b) => a.path.localeCompare(b.path));
      await storeFile(file);
      added.push(file);
    }
    renderFiles();
    if (!added.length) return;
    if (toPython && py.session && py.state === "ready") await writeSavedFiles(added);
    notice(`Added ${added.map((f) => f.path).join(", ")}.${py.session ? " Python can read it now." : " Python gets it when it starts."}`);
  }

  // Import and export -----------------------------------------------------------------------------------------

  async function importIpynb(file) {
    let parsed;
    try {
      parsed = model.parseIpynb(await file.text());
    } catch (error) {
      notice(`${file.name} was not opened: ${error.message}. The current notebook did not change.`, "bad");
      return;
    }
    const record = newRecord(file.name.replace(/\.ipynb$/i, "") || "Imported", parsed.notebook);
    try { await app.store.put(record); } catch (error) { notice(`Not saved in the browser: ${stores.reason(error)}.`, "bad"); }
    await activate(record, []);
    notice(`Opened ${file.name}: ${record.notebook.cells.length} cells. No cell ran; outputs are shown as saved.${parsed.newIds ? ` ${parsed.newIds} cell${parsed.newIds === 1 ? "" : "s"} got a new id.` : ""}`);
  }

  const fileStem = () => (app.record.name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "notebook");

  function exportIpynb() {
    download(`${fileStem()}.ipynb`, new Blob([model.toIpynb(app.record.notebook)], { type: "application/x-ipynb+json" }));
    notice(`Exported ${fileStem()}.ipynb: the cells and outputs only. It holds no data files and no Python; Save HTML copy holds both.`);
  }

  /** The runtime files as base64, from memory, the embedded blocks or the site. @param {(text: string) => void} progress */
  async function runtimeBase64(progress) {
    await loadRuntime((done, total) => progress(`Loading the runtime: ${mb(done)} of ${mb(total)}`));
    const out = [];
    for (const file of manifest.downloads) {
      const blob = py.files[runtime.fileName(file.path)];
      out.push({ path: file.path, base64: portable.toBase64(new Uint8Array(await blob.arrayBuffer())) });
    }
    return out;
  }

  async function portableBlob(assets, files) {
    const data = [];
    for (const file of files) data.push(portable.toBase64(new Uint8Array(await file.blob.arrayBuffer())));
    const parts = portable.write({
      csp: manifest.portable_csp,
      headParts: $$("head > [data-pynb-part]").map((node) => node.outerHTML),
      bodyParts: $$("body > [data-pynb-part]").map((node) => node.outerHTML),
      document: { schema: model.SCHEMA, id: app.record.id, name: app.record.name, notebook: app.record.notebook,
        files: files.map((f) => ({ path: f.path, bytes: f.bytes, sha256: f.sha256 })) },
      data, assets,
    });
    return new Blob(parts, { type: "text/html" });
  }

  async function saveHtmlCopy() {
    const dialog = /** @type {HTMLDialogElement} */ ($("#dialog"));
    const size = h("p", { class: "num", text: "Size: calculating…" });
    const checks = app.files.map((file) => h("label", { class: "check" },
      h("input", { type: "checkbox", checked: file.include, onchange: (e) => { file.include = e.target.checked; storeFile(file); measure(); } }),
      `${file.path} (${bytesText(file.bytes)})`));
    const saveButton = /** @type {HTMLButtonElement} */ (h("button", { type: "button", class: "primary", disabled: true }, "Save"));
    let assets = null;
    let blob = null;
    let generation = 0;
    const measure = async () => {
      const mine = ++generation;
      saveButton.disabled = true;
      size.textContent = "Size: calculating…";
      try {
        assets = assets || await runtimeBase64((text) => { size.textContent = text; });
        const made = await portableBlob(assets, app.files.filter((f) => f.include));
        if (mine !== generation) return;
        blob = made;
        size.textContent = `Size: ${bytesText(blob.size)}`;
        saveButton.disabled = false;
      } catch (error) {
        size.textContent = `The copy cannot be made: ${error.message || error}`;
      }
    };
    dialog.replaceChildren(
      h("h2", { id: "dialog-h", text: "Save HTML copy" }),
      h("p", { text: "One HTML file with Python, all its packages, this notebook with its outputs, and the data files you choose. It opens in Chrome or Firefox with no internet, no server and no other file." }),
      h("fieldset", {}, h("legend", { text: "Data files in the copy" }), ...(checks.length ? checks : [h("p", { class: "note", text: "This notebook has no saved data files." })])),
      size,
      h("p", { class: "note", text: "Export .ipynb is different: it saves the cells and outputs only, with no data files and no Python." }),
      h("div", { class: "row" }, saveButton, button("Cancel", () => dialog.close())));
    saveButton.addEventListener("click", () => {
      if (!blob) return;
      download(`${fileStem()}.html`, blob);
      dialog.close();
      app.dirty = false;
      notice(`Saved ${fileStem()}.html: ${bytesText(blob.size)}, with ${app.files.filter((f) => f.include).length} data file(s).`);
    });
    dialog.addEventListener("close", () => { generation++; assets = null; blob = null; }, { once: true });
    dialog.showModal();
    measure();
  }

  // Dialogs ---------------------------------------------------------------------------------------------------

  /** @param {string} title @param {string} text @param {{label: string, value: string}[]} choices @returns {Promise<string | null>} */
  function choiceDialog(title, text, choices) {
    const dialog = /** @type {HTMLDialogElement} */ ($("#dialog"));
    return new Promise((resolve) => {
      let value = null;
      dialog.replaceChildren(h("h2", { id: "dialog-h", text: title }), h("p", { text }),
        h("div", { class: "row" }, ...choices.map((c, i) => button(c.label, () => { value = c.value; dialog.close(); }, { class: i === 0 ? "primary" : "" }))));
      dialog.addEventListener("close", () => resolve(value), { once: true });
      dialog.showModal();
    });
  }

  async function confirmDialog(title, text, action) {
    return (await choiceDialog(title, text, [{ label: action, value: "yes" }, { label: "Cancel", value: "no" }])) === "yes";
  }

  /** @returns {Promise<string | null>} */
  function promptDialog(title, label, value) {
    const dialog = /** @type {HTMLDialogElement} */ ($("#dialog"));
    return new Promise((resolve) => {
      let result = null;
      const input = /** @type {HTMLInputElement} */ (h("input", { type: "text", value, "aria-label": label }));
      const form = h("form", { onsubmit: (e) => { e.preventDefault(); result = input.value; dialog.close(); } },
        h("h2", { id: "dialog-h", text: title }), h("label", { class: "field" }, label, " ", input),
        h("div", { class: "row" }, h("button", { type: "submit", class: "primary" }, "OK"), button("Cancel", () => dialog.close())));
      dialog.replaceChildren(form);
      dialog.addEventListener("close", () => resolve(result), { once: true });
      dialog.showModal();
      input.select();
    });
  }

  function showShortcuts() {
    const dialog = /** @type {HTMLDialogElement} */ ($("#dialog"));
    const rows = [
      ["Shift+Enter", "Run the cell and go to the next one"], ["Ctrl+Enter or ⌘+Enter", "Run the cell"],
      ["Escape", "Leave the cell editor (then Tab moves focus)"], ["Enter", "Edit the selected cell"],
      ["↑ ↓ or K J", "Select the cell above or below"], ["Alt+↑ Alt+↓", "Move the selected cell"],
      ["A, B", "Add a code cell above or below"], ["M, Y", "Make the cell Markdown or code"],
      ["Tab, Shift+Tab", "Indent or outdent in the editor"], ["Ctrl+K or ⌘+K", "Commands"],
      ["Ctrl+S or ⌘+S", "Save now (website) or Save HTML copy (portable file)"], ["?", "These shortcuts"],
    ];
    dialog.replaceChildren(h("h2", { id: "dialog-h", text: "Keyboard shortcuts" }),
      h("table", {}, h("tbody", {}, ...rows.map(([k, d]) => h("tr", {}, h("th", { scope: "row" }, h("kbd", { text: k })), h("td", { text: d }))))),
      h("div", { class: "row" }, button("Close", () => dialog.close(), { class: "primary" })));
    dialog.showModal();
  }

  function showAbout() {
    const dialog = /** @type {HTMLDialogElement} */ ($("#dialog"));
    const vendor = /** @type {any} */ (window).pynbVendor.versions;
    const rows = manifest.downloads.map((f) => h("tr", {}, h("td", { text: f.name || runtime.fileName(f.path) }), h("td", { class: "num", text: f.version || "" }), h("td", { text: f.license }), h("td", { class: "num", text: f.bytes.toLocaleString("en") })));
    const licences = h("pre", { class: "licences", text: $("#pynb-licences").textContent });
    dialog.replaceChildren(h("h2", { id: "dialog-h", text: "About this Python" }),
      h("p", { text: `Python ${manifest.lock_info.python} (CPython for WebAssembly) from Pyodide ${manifest.pyodide}, started by PyScript ${vendor["@pyscript/core"]} (polyscript ${vendor.polyscript}). Markdown by marked ${vendor.marked}; mathematics by KaTeX ${vendor.katex}.` }),
      h("p", { text: `Packages: ${manifest.packages.join(", ")}, with all their dependencies. Every file is checked against its SHA-256 before Python starts.` }),
      h("p", { text: "Limits: code runs in this browser tab only. There is no network (requests are refused and shown), no pip, no threads or processes, no IPython magics or shell commands (! and %), and no Google Drive or Colab features. Large data needs the memory of this tab. Tested in desktop Chrome and Firefox; Safari and phones are not tested." }),
      h("div", { class: "scroll", tabindex: "0", role: "region", "aria-label": "Runtime files" },
        h("table", {}, h("thead", {}, h("tr", {}, ...["Package", "Version", "Licence", "Bytes"].map((t) => h("th", { scope: "col", text: t })))), h("tbody", {}, ...rows))),
      h("details", {}, h("summary", { text: "Licence texts" }), licences),
      h("div", { class: "row" }, button("Close", () => dialog.close(), { class: "primary" })));
    dialog.showModal();
  }

  // Command palette -------------------------------------------------------------------------------------------

  const COMMANDS = () => [
    ["Run cell", () => runActive(false)], ["Run all", runAll], ["Stop", stop], ["Restart Python", restart],
    ["Add code cell", () => addCell("code")], ["Add Markdown cell", () => addCell("markdown")], ["Clear outputs", clearOutputs],
    ["New notebook", newNotebook], ["Rename notebook", renameNotebook], ["Duplicate notebook", duplicateNotebook], ["Delete notebook", deleteNotebook],
    ["Open example notebook", openExample], ["Open .ipynb", () => $("#open-ipynb").click()], ["Export .ipynb", exportIpynb],
    ["Save HTML copy", saveHtmlCopy], ["Add files", () => $("#file-input").click()],
    ["Theme: system", () => setTheme("system")], ["Theme: light", () => setTheme("light")], ["Theme: dark", () => setTheme("dark")],
    ["Larger text", () => setTextSize(textSize + 10)], ["Smaller text", () => setTextSize(textSize - 10)],
    ["Keyboard shortcuts", showShortcuts], ["About this Python", showAbout],
    ...(FORM === "site" && offline.supported() ? [["Prepare offline or check for update", prepareOffline]] : []),
  ];

  function openPalette() {
    const dialog = /** @type {HTMLDialogElement} */ ($("#dialog"));
    const input = /** @type {HTMLInputElement} */ (h("input", { type: "search", "aria-label": "Search commands", placeholder: "Type a command", role: "combobox", "aria-controls": "palette-list", "aria-expanded": "true" }));
    const list = h("ul", { id: "palette-list", class: "palette", role: "listbox" });
    let matches = [];
    let chosen = null;
    const show = () => {
      const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      matches = COMMANDS().filter(([name]) => words.every((w) => name.toLowerCase().includes(w)));
      list.replaceChildren(...matches.map(([name, run], i) => h("li", { role: "option", "aria-selected": i === 0 ? "true" : "false" },
        button(name, () => { chosen = run; dialog.close(); }))));
    };
    input.addEventListener("input", show);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && matches[0]) { event.preventDefault(); chosen = matches[0][1]; dialog.close(); }
    });
    dialog.replaceChildren(h("h2", { id: "dialog-h", text: "Commands" }), input, list);
    dialog.addEventListener("close", () => { if (chosen) chosen(); }, { once: true });
    show();
    dialog.showModal();
    input.focus();
  }

  // Settings --------------------------------------------------------------------------------------------------

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* the setting still applies to this tab */ } },
  };

  /** @param {"system" | "light" | "dark"} choice */
  function setTheme(choice) {
    if (choice === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = choice;
    storage.set("theme", choice === "system" ? null : choice);
    $$("[data-theme-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === choice)));
  }

  let textSize = 100;
  function setTextSize(percent) {
    textSize = Math.min(160, Math.max(80, Math.round(percent / 10) * 10));
    document.documentElement.style.fontSize = `${textSize}%`;
    $("#text-size").textContent = `${textSize}%`;
    storage.set("pynb-text-size", String(textSize));
  }

  // Offline (website) -----------------------------------------------------------------------------------------

  async function showOffline() {
    const text = $("#offline-text");
    const control = /** @type {HTMLButtonElement} */ ($("#prepare-offline"));
    const status = $("#offline-status");
    if (FORM === "portable") {
      $("#offline-panel").hidden = true;
      status.textContent = "Offline: this file holds everything; no network is used";
      return "portable";
    }
    if (!offline.supported()) {
      text.textContent = "Offline use needs this page on the website (https). Save HTML copy works everywhere.";
      control.disabled = true;
      status.textContent = "Offline: not available here";
      return "unsupported";
    }
    let now;
    try { now = await offline.status(); } catch (error) { now = { state: "none" }; text.textContent = String(error.message || error); }
    if (now.state === "ready") {
      text.textContent = `Offline ready: the page and the runtime (${mb(now.pointer.bytes)}) are in this browser, checked on ${new Date(now.pointer.prepared).toLocaleDateString("en-GB")}. The browser can still remove them under storage pressure; this page then says so. Updates come only when you ask.`;
      control.textContent = "Check for update";
      status.textContent = "Offline: ready";
    } else {
      text.textContent = now.state === "incomplete"
        ? `Not prepared: ${now.missing ? `${now.missing} file(s) of the offline copy are missing` : "the offline copy is not active yet; reload the page"}. Prepare again to download ${mb(RUNTIME_BYTES)}.`
        : `Prepare offline downloads ${mb(RUNTIME_BYTES)} (the page and Python with all packages) into this browser, checks every file, and then the page opens with no network.`;
      control.textContent = "Prepare offline";
      status.textContent = "Offline: not prepared";
    }
    return now.state;
  }

  async function prepareOffline() {
    const control = /** @type {HTMLButtonElement} */ ($("#prepare-offline"));
    const bar = /** @type {HTMLProgressElement} */ ($("#offline-progress"));
    control.disabled = true;
    bar.hidden = false;
    $("#offline-status").textContent = "Offline: preparing";
    try {
      const result = await offline.prepare((done, total, path) => {
        bar.value = done / total;
        $("#offline-text").textContent = `Preparing: ${mb(done)} of ${mb(total)} (${path.replace("runtime/", "")})`;
      }, runtime.verify);
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => { navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }); setTimeout(resolve, 5000); });
      }
      await showOffline();
      notice(!result.changed ? "Offline copy is up to date." : `Offline ready: ${mb(result.bytes)} checked.${result.persisted === false ? " The browser did not grant persistent storage, so it can remove the copy under storage pressure." : ""}${result.build !== manifest.build ? " Reload the page to use the new version." : ""}`);
    } catch (error) {
      $("#offline-status").textContent = "Offline: preparation failed";
      $("#offline-text").textContent = `Preparation failed: ${error.message || error}. The previous offline copy, if any, is unchanged.`;
      notice(`Preparation failed: ${error.message || error}`, "bad");
    } finally {
      control.disabled = false;
      bar.hidden = true;
    }
  }

  function startPrompt() {
    if (FORM === "portable" || py.files) return;
    $("#start-text").textContent = `Python runs in this browser. Starting it loads ${mb(RUNTIME_BYTES)} (Pyodide ${manifest.pyodide} with ${manifest.packages.length} packages)${$("#offline-status").textContent === "Offline: ready" ? " from the offline copy in this browser" : " from this site, once per visit unless you prepare offline"}. Run cell starts it too.`;
    $("#start-panel").hidden = false;
  }

  // Page ------------------------------------------------------------------------------------------------------

  let noticeTimer = null;
  function notice(text, kind = "ok") {
    const node = $("#notice");
    node.textContent = text;
    node.dataset.kind = kind;
    node.hidden = false;
    clearTimeout(noticeTimer);
    if (kind === "ok") noticeTimer = setTimeout(() => { node.hidden = true; }, 12000);
  }

  function updateControls() {
    const running = py.busy;
    /** @type {HTMLButtonElement} */ ($("#stop")).disabled = !(py.session || py.starting) || py.state === "off";
    for (const id of ["#run-cell", "#run-all"]) /** @type {HTMLButtonElement} */ ($(id)).disabled = running;
    $$("[data-run]").forEach((b) => { /** @type {HTMLButtonElement} */ (b).disabled = running; });
  }

  function closeSide() {
    document.body.classList.remove("side-open");
    $("#side-toggle").setAttribute("aria-expanded", "false");
  }

  async function openExample() {
    const example = JSON.parse(/** @type {string} */ ($("#pynb-example").textContent));
    const { notebook } = model.parseIpynb(JSON.stringify(example));
    const record = newRecord("Example", notebook);
    await app.store.put(record);
    await activate(record, []);
  }

  /** The notebook and data files of a portable file. */
  async function readDocument() {
    const doc = JSON.parse(/** @type {string} */ ($("#pynb-document").textContent));
    const blocks = new Map($$("script[data-pynb-data]").map((node) => [node.dataset.pynbData, node]));
    const files = [];
    for (const [index, entry] of doc.files.entries()) {
      const node = blocks.get(String(index));
      if (!node) throw new Error(`${entry.path} is listed but not embedded`);
      const bytes = portable.fromBase64(node.textContent.trim());
      const digest = await sha256(bytes);
      if (bytes.length !== entry.bytes || digest !== entry.sha256) throw new Error(`${entry.path} does not match its recorded SHA-256`);
      files.push({ notebook: doc.id, path: entry.path, blob: new Blob([bytes]), bytes: bytes.length, sha256: digest, include: true, added: Date.now() });
    }
    const { notebook } = model.parseIpynb(JSON.stringify(doc.notebook));
    return { record: { schema: model.SCHEMA, id: doc.id, name: doc.name, created: Date.now(), updated: Date.now(), notebook }, files };
  }

  function registerTools() {
    const mc = /** @type {any} */ (document).modelContext || /** @type {any} */ (navigator).modelContext;
    if (!mc || !mc.registerTool) return;
    const out = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
    const empty = { type: "object", properties: {}, additionalProperties: false };
    const summary = (output) => output.output_type === "stream" ? { type: "stream", name: output.name, text: output.text.slice(0, 2000) }
      : output.output_type === "error" ? { type: "error", ename: output.ename, evalue: output.evalue }
      : { type: output.output_type, mime: Object.keys(output.data || {}), text: typeof (output.data || {})["text/plain"] === "string" ? output.data["text/plain"].slice(0, 2000) : null };
    try {
      mc.registerTool({ name: "get_notebook", description: "The active notebook: its name and every cell in order, with type, source, execution count and a summary of each output (text is cut at 2000 characters).", inputSchema: empty, annotations: { readOnlyHint: true },
        async execute() { return out({ name: app.record.name, cells: app.record.notebook.cells.map((c, i) => ({ index: i + 1, id: c.id, type: c.cell_type, source: c.source, execution_count: c.execution_count ?? null, outputs: (c.outputs || []).map(summary) })) }); } });
      mc.registerTool({ name: "get_runtime", description: "The Python runtime: Python and Pyodide versions, PyScript version, the package list, the session state, and the start time in seconds.", inputSchema: empty, annotations: { readOnlyHint: true },
        async execute() { return out({ python: manifest.lock_info.python, pyodide: manifest.pyodide, pyscript: /** @type {any} */ (window).pynbVendor.versions, packages: manifest.packages, state: py.state, ready_seconds: py.readySeconds || null, refused_requests: py.refused, form: FORM, runtime_bytes: RUNTIME_BYTES }); } });
      mc.registerTool({ name: "list_files", description: "The data files saved with the active notebook (path, bytes, SHA-256, in the HTML copy or not) and the files Python made in this session (path, bytes).", inputSchema: empty, annotations: { readOnlyHint: true },
        async execute() { return out({ saved: app.files.map((f) => ({ path: f.path, bytes: f.bytes, sha256: f.sha256, include: f.include })), python: app.pyFiles }); } });
      mc.registerTool({ name: "list_notebooks", description: "The notebooks in this browser (website) or this tab (portable file): id, name and last change, and which one is active.", inputSchema: empty, annotations: { readOnlyHint: true },
        async execute() { return out({ active: app.record && app.record.id, notebooks: await app.store.list() }); } });
    } catch { /* a page works without WebMCP */ }
  }

  function bind() {
    $("#run-cell").addEventListener("click", () => runActive(false));
    $("#run-all").addEventListener("click", runAll);
    $("#stop").addEventListener("click", stop);
    $("#restart").addEventListener("click", restart);
    $("#start-python").addEventListener("click", () => { startPython().catch(() => {}); $("#start-panel").hidden = true; });
    $("#add-code").addEventListener("click", () => addCell("code"));
    $("#add-markdown").addEventListener("click", () => addCell("markdown"));
    $$("[data-add]").forEach((b) => b.addEventListener("click", () => { app.active = app.record.notebook.cells[app.record.notebook.cells.length - 1]?.id || null; addCell(/** @type {any} */ (b.dataset.add)); }));
    $("#cell-type").addEventListener("change", (e) => setType(/** @type {HTMLSelectElement} */ (e.target).value));
    $("#clear-outputs").addEventListener("click", clearOutputs);
    $("#export-ipynb").addEventListener("click", exportIpynb);
    $("#save-html").addEventListener("click", saveHtmlCopy);
    $("#open-palette").addEventListener("click", openPalette);
    $("#show-shortcuts").addEventListener("click", showShortcuts);
    $("#show-about").addEventListener("click", showAbout);
    $("#nb-new").addEventListener("click", newNotebook);
    $("#nb-rename").addEventListener("click", renameNotebook);
    $("#nb-duplicate").addEventListener("click", duplicateNotebook);
    $("#nb-delete").addEventListener("click", deleteNotebook);
    $("#prepare-offline").addEventListener("click", prepareOffline);
    $("#open-ipynb").addEventListener("change", (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      const file = input.files && input.files[0];
      input.value = "";
      if (file) importIpynb(file);
    });
    $("#file-input").addEventListener("change", (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      const files = Array.from(input.files || []).map((f) => ({ path: f.name, blob: f }));
      input.value = "";
      addFiles(files);
    });
    $("#side-toggle").addEventListener("click", () => {
      const open = document.body.classList.toggle("side-open");
      $("#side-toggle").setAttribute("aria-expanded", String(open));
    });
    $$("[data-theme-choice]").forEach((b) => b.addEventListener("click", () => setTheme(/** @type {any} */ (b.dataset.themeChoice))));
    $("#text-smaller").addEventListener("click", () => setTextSize(textSize - 10));
    $("#text-larger").addEventListener("click", () => setTextSize(textSize + 10));
    document.addEventListener("keydown", (event) => {
      const mod = event.ctrlKey || event.metaKey;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(/** @type {HTMLElement} */ (event.target).tagName);
      if (mod && event.key.toLowerCase() === "k") { event.preventDefault(); if (!(/** @type {HTMLDialogElement} */ ($("#dialog")).open)) openPalette(); }
      else if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); if (FORM === "portable") saveHtmlCopy(); else save(); }
      else if (event.key === "?" && !typing && !mod) { event.preventDefault(); showShortcuts(); }
      else if (event.key === "Escape" && document.body.classList.contains("side-open")) closeSide();
    });
    window.addEventListener("beforeunload", (event) => {
      if (app.dirty && (app.store.kind === "memory" || app.saveFailed)) { event.preventDefault(); event.returnValue = ""; }
    });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && app.dirty) save(); });
  }

  async function main() {
    // The vendor bundle is a module script, so it runs after this classic script; it announces itself.
    if (!(/** @type {any} */ (window).pynbVendor)) await new Promise((resolve) => window.addEventListener("pynb-vendor", resolve, { once: true }));
    $("#app").innerHTML = /** @type {string} */ ($("#pynb-body").textContent);
    if (FORM === "portable") {
      $("#visuals-link").setAttribute("href", "https://teoyujie.org/visuals/");
      $("#form-label").textContent = "Portable file";
    }
    const theme = document.documentElement.dataset.theme;
    setTheme(theme === "light" || theme === "dark" ? theme : "system");
    setTextSize(Number(storage.get("pynb-text-size")) || 100);
    bind();
    registerTools();
    const offlineState = await showOffline();
    if (FORM === "portable") {
      app.store = new stores.MemoryStore();
      let loaded;
      try {
        loaded = await readDocument();
      } catch (error) {
        loaded = { record: newRecord("Untitled 1", model.newNotebook()), files: [] };
        notice(`The notebook in this file could not be read: ${error.message || error}. A blank notebook is open.`, "bad");
      }
      await app.store.put(loaded.record);
      for (const file of loaded.files) await app.store.putFile(file);
      await activate(loaded.record, loaded.files);
      app.dirty = false;
    } else {
      app.store = new stores.DatabaseStore();
      try {
        await app.store.open();
        const last = await app.store.meta("last");
        const list = await app.store.list();
        const id = list.some((n) => n.id === last) ? last : list[0] && list[0].id;
        if (id) await activate(await app.store.get(id), await app.store.files(id));
        else await openExample();
      } catch (error) {
        app.store = new stores.MemoryStore();
        app.saveFailed = stores.reason(error);
        await openExample();
        setSave(`NOT saved: ${app.saveFailed}. Work stays in this tab only; use Export .ipynb or Save HTML copy.`, "bad");
        $("#nb-note").textContent = "Saved notebooks cannot be read here, so changes stay in this tab.";
      }
      if (offlineState === "ready") startPrompt();
    }
    document.documentElement.dataset.ready = "true";
  }

  main().catch((error) => {
    document.documentElement.dataset.ready = "true";
    const node = document.getElementById("notice");
    if (node) { node.hidden = false; node.textContent = `The notebook did not start: ${error.message || error}`; }
  });
})();
