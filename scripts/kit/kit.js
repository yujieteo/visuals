/* The shared runtime of every visual that scripts/new_visual.py generates: the mechanical parts of the
 * interactive visual specification, so a visual writes only its domain model and views.
 *
 *   state     versioned semantic state from a field schema: normalize, URL fragment, JSON import and export
 *             (§5, §12, §13, §14), with a notice for every value it resets
 *   export    the Markdown record of a beamdswitch report, and the deck through the site's template (§14, §15)
 *   app       state -> render(), Back and Forward, Reset, the toolbar, the Cmd/Ctrl+K command palette and the
 *             read-only WebMCP tools (§8 to §11)
 *
 * scripts/visual_build.py inlines this file unchanged in <script id="kit">. Node tests load it with require(),
 * where only the pure parts (state and export) run. Nothing here reads the network.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VisualKit = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const VERSION = 1;

  /** A field of the semantic state (scripts/types/kit.d.ts): `values` lists an enum's ids, and `min`, `max` and
   * `step` bound a number. @typedef {KitField} Field */
  /** @typedef {Record<string, Field>} Fields */
  /** @typedef {Record<string, any>} State */
  /** @typedef {{ state: State, notices: string[] }} Normalized */

  /* ---------- state ---------- */

  /** @param {Fields} fields @returns {State} */
  function defaults(fields) {
    /** @type {State} */
    const out = {};
    for (const [key, field] of Object.entries(fields)) out[key] = field.default;
    return out;
  }

  /**
   * One raw value (from a URL, a JSON file or a control) as the field's type, or undefined when it is not valid.
   * @param {Field} field @param {unknown} raw
   */
  function coerce(field, raw) {
    if (field.type === "enum") return typeof raw === "string" && (field.values ?? []).includes(raw) ? raw : undefined;
    if (field.type === "boolean") return raw === true || raw === "1" || raw === "true" ? true : raw === false || raw === "0" || raw === "false" ? false : undefined;
    if (field.type === "string") return typeof raw === "string" && raw.length <= 200 ? raw : undefined;
    const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    if (!Number.isFinite(n) || (field.type === "integer" && !Number.isInteger(n))) return undefined;
    if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) return undefined;
    return n;
  }

  /** @param {unknown} value */
  const shown = (value) => (typeof value === "string" ? `"${value.slice(0, 40)}"` : String(value));

  /**
   * A complete, valid state from any raw object: each field from `raw` when it is valid, else from `base`
   * (the defaults when absent), with a notice for each value it did not accept. Unknown keys are reported, never kept.
   * @param {Fields} fields @param {Record<string, unknown>} raw @param {State} [base] @returns {Normalized}
   */
  function normalize(fields, raw, base) {
    const start = base ?? defaults(fields);
    /** @type {State} */
    const state = {};
    /** @type {string[]} */
    const notices = [];
    for (const [key, field] of Object.entries(fields)) {
      if (!(key in raw) || raw[key] === undefined) {
        state[key] = start[key];
        continue;
      }
      const value = coerce(field, raw[key]);
      if (value === undefined) {
        state[key] = start[key];
        notices.push(`${field.label}: ${shown(raw[key])} is not a valid value, so it stays ${shown(start[key])}.`);
      } else state[key] = value;
    }
    for (const key of Object.keys(raw)) if (!(key in fields)) notices.push(`"${key.slice(0, 40)}" is not part of this view and is ignored.`);
    return { state, notices };
  }

  /** @param {unknown} value */
  const text = (value) => (typeof value === "boolean" ? (value ? "1" : "0") : String(value));

  /**
   * The URL fragment of a state: every field that differs from its default, in schema order, so the default
   * view has an empty fragment and one state has one fragment.
   * @param {Fields} fields @param {State} state
   */
  function toHash(fields, state) {
    const base = defaults(fields);
    const parts = Object.keys(fields).filter((key) => state[key] !== base[key])
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(text(state[key]))}`);
    return parts.length ? `#${parts.join("&")}` : "";
  }

  /** @param {Fields} fields @param {string} hash @returns {Normalized} */
  function fromHash(fields, hash) {
    /** @type {Record<string, string>} */
    const raw = {};
    for (const [key, value] of new URLSearchParams(hash.replace(/^#/, ""))) raw[key] = value;
    return normalize(fields, raw);
  }

  /**
   * The state as JSON (§14): schema version, visual and the semantic state in schema order, with a final newline.
   * @param {{ slug: string, schemaVersion: number, fields: Fields }} spec @param {State} state
   */
  function toJson(spec, state) {
    /** @type {State} */
    const ordered = {};
    for (const key of Object.keys(spec.fields)) ordered[key] = state[key];
    return `${JSON.stringify({ schemaVersion: spec.schemaVersion, visual: spec.slug, state: ordered }, null, 2)}\n`;
  }

  /**
   * A state from exported JSON. A file of another visual or schema version is refused with an error, never read as
   * valid (§13); a valid file's values go through normalize().
   * @param {{ slug: string, schemaVersion: number, fields: Fields }} spec @param {string} json @returns {Normalized}
   */
  function fromJson(spec, json) {
    /** @type {any} */
    let doc;
    try {
      doc = JSON.parse(json);
    } catch {
      throw new Error("The file is not JSON.");
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("The file is not a saved view.");
    if (doc.visual !== spec.slug) throw new Error(`The file is a view of ${shown(doc.visual)}, not of ${spec.slug}.`);
    if (doc.schemaVersion !== spec.schemaVersion) throw new Error(`The file uses schema version ${shown(doc.schemaVersion)}; this page reads version ${spec.schemaVersion}.`);
    if (!doc.state || typeof doc.state !== "object" || Array.isArray(doc.state)) throw new Error("The file has no state object.");
    return normalize(spec.fields, doc.state);
  }

  /* ---------- export ---------- */

  const SECTIONS = [["setup", "Set-up"], ["method", "Method"], ["results", "Results"], ["checks", "Checks and takeaway"]];

  /**
   * The Markdown record of a beamdswitch report (§14): the same frames as the deck, in the same order, without
   * narration, so the record and the deck never disagree.
   * @param {any} report
   */
  function markdown(report) {
    const meta = report.meta ?? {};
    const out = [`# ${meta.title}`, ""];
    if (meta.subtitle) out.push(String(meta.subtitle), "");
    for (const [id, title] of SECTIONS) {
      out.push(`## ${title}`, "");
      for (const frame of report[id] ?? []) {
        out.push(`### ${frame.title}`, "");
        if (frame.body) out.push(String(frame.body).trim(), "");
        if (frame.key) out.push(`**Key:** ${String(frame.key).trim()}`, "");
      }
    }
    return `${out.join("\n").trim()}\n`;
  }

  /* ---------- app (browser only) ---------- */

  /** @param {string} id @returns {any} */
  const byId = (id) => document.getElementById(id);

  /** @param {string} name @param {string} body @param {string} type */
  function save(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Run a visual: the state, the URL, the toolbar, the palette and the WebMCP tools. `spec.render(state, derived)`
   * draws the page from the state alone; `spec.derive(state)` computes everything else; `spec.report(state, derived)`
   * is the beamdswitch report both exports write. `spec.bind(app)` connects the domain's own controls through
   * app.set(). `spec.tools` are the domain's read-only WebMCP tools and `spec.commands` its palette entries.
   * @param {{ slug: string, title: string, summary: string, schemaVersion: number, fields: Fields,
   *   derive(state: State): any, render(state: State, derived: any): void, report(state: State, derived: any): any,
   *   bind?(app: any): void, tools?: any[], commands?: { label: string, run(): void }[] }} spec
   */
  function start(spec) {
    const notice = byId("notice");
    /** @param {string[]} lines */
    const say = (lines) => { if (notice) notice.textContent = lines.join(" "); };
    let state = defaults(spec.fields);
    let derived = spec.derive(state);

    function draw() {
      derived = spec.derive(state);
      for (const el of document.querySelectorAll("[data-field]")) {
        const key = el.getAttribute("data-field"), value = key ? state[key] : undefined;
        if (value === undefined) continue;
        if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = Boolean(value);
        else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) { if (el !== document.activeElement || el.value !== "") el.value = text(value); }
        else if (el instanceof HTMLButtonElement) el.setAttribute("aria-pressed", String(el.value === text(value)));
        else el.textContent = text(value);
      }
      spec.render(state, derived);
      typeset();
    }

    /** @param {"push" | "replace"} mode */
    function publish(mode) {
      const url = location.pathname + location.search + toHash(spec.fields, state);
      if (url === location.pathname + location.search + location.hash) return;
      try {
        if (mode === "push") history.pushState(null, "", url);
        else history.replaceState(null, "", url);
      } catch {
        // file:// in some browsers, or a sandboxed iframe: the view still works without its URL.
      }
    }

    const app = {
      spec,
      get state() { return { ...state }; },
      get derived() { return derived; },
      /**
       * Change some fields; an invalid value keeps its old value with a notice. A change adds a Back entry ("push"),
       * or replaces the current one ("replace") for a value that changes continuously, such as a slider's.
       * @param {Record<string, unknown>} patch @param {"push" | "replace"} [mode]
       */
      set(patch, mode = "push") {
        const next = normalize(spec.fields, { ...state, ...patch }, state);
        say(next.notices);
        const changed = Object.keys(spec.fields).filter((key) => next.state[key] !== state[key]);
        state = next.state;
        draw();
        if (changed.length) publish(mode);
      },
      /** Replace the whole state, as Reset, a link or an imported file does. @param {Normalized} next @param {"push" | "replace" | "none"} mode */
      load(next, mode) {
        state = next.state;
        say(next.notices);
        draw();
        if (mode !== "none") publish(mode);
      },
      reset() { app.load({ state: defaults(spec.fields), notices: ["The view is reset to its defaults."] }, "push"); },
      json() { return toJson(spec, state); },
      report() { return spec.report(state, derived); },
      markdown() { return markdown(app.report()); },
      deck() { return /** @type {any} */ (globalThis).Beamdswitch.deck(app.report()); },
    };

    function typeset() {
      const mj = /** @type {any} */ (globalThis).MathJax;
      const nodes = [...document.querySelectorAll("[data-tex]")];
      for (const el of nodes) {
        const tex = el.getAttribute("data-tex") ?? "";
        if (el.getAttribute("data-typeset") === tex) continue;
        el.textContent = el.tagName === "DIV" ? `\\[${tex}\\]` : `\\(${tex}\\)`;
        el.setAttribute("data-typeset", tex);
        if (mj?.typesetPromise) {
          mj.typesetClear?.([el]);
          mj.typesetPromise([el]).catch((/** @type {unknown} */ e) => say([`The formula could not be typeset: ${String(e)}`]));
        }
      }
    }

    // Controls that name a field (data-field) change it; a slider replaces the history entry, the rest add one.
    for (const el of document.querySelectorAll("[data-field]")) {
      const key = el.getAttribute("data-field") ?? "";
      if (!(key in spec.fields)) continue;
      if (el instanceof HTMLButtonElement) el.addEventListener("click", () => app.set({ [key]: el.value }));
      else if (el instanceof HTMLInputElement && el.type === "checkbox") el.addEventListener("change", () => app.set({ [key]: el.checked }));
      else if (el instanceof HTMLInputElement && el.type === "range") el.addEventListener("input", () => app.set({ [key]: el.value }, "replace"));
      else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.addEventListener("change", () => { if (el.value !== "") app.set({ [key]: el.value }); });
    }
    spec.bind?.(app);

    const status = byId("export-status");
    /** @param {string} line */
    const tell = (line) => { if (status) status.textContent = line; };
    /** @param {string} line @param {() => string} body @param {string} name @param {string} type */
    const saveAs = (line, body, name, type) => {
      try {
        save(name, body(), type);
        tell(line);
      } catch (e) {
        tell(`Could not save ${name} here: ${String(e)}`);
      }
    };
    /** @param {string} line @param {() => string} body */
    const copy = async (line, body) => {
      try {
        await navigator.clipboard.writeText(body());
        tell(line);
      } catch {
        tell("Could not copy here: use the Save button instead.");
      }
    };
    const commands = [
      { label: "Reset the view", run: () => app.reset() },
      { label: "Save view JSON", run: () => saveAs(`Saved ${spec.slug}-view.json.`, app.json, `${spec.slug}-view.json`, "application/json") },
      { label: "Save Markdown record", run: () => saveAs(`Saved ${spec.slug}-record.md.`, app.markdown, `${spec.slug}-record.md`, "text/markdown") },
      { label: "Save beamdswitch deck", run: () => saveAs(`Saved ${spec.slug}-beamdswitch.md: open it in beamdswitch.`, app.deck, `${spec.slug}-beamdswitch.md`, "text/markdown") },
      ...(spec.commands ?? []),
    ];
    /** @type {[string, () => void][]} */
    const buttons = [
      ["reset", commands[0].run],
      ["save-json", commands[1].run],
      ["save-markdown", commands[2].run],
      ["copy-markdown", () => copy("Copied the Markdown record.", app.markdown)],
      ["save-beamdswitch", commands[3].run],
      ["copy-beamdswitch", () => copy("Copied the beamdswitch deck: paste it into beamdswitch.", app.deck)],
    ];
    for (const [id, run] of buttons) byId(id)?.addEventListener("click", run);
    const file = byId("load-json");
    file?.addEventListener("change", async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      try {
        app.load(fromJson(spec, await chosen.text()), "push");
        tell(`Loaded ${chosen.name}.`);
      } catch (e) {
        tell(`${chosen.name} was not loaded: ${e instanceof Error ? e.message : String(e)}`);
      }
      file.value = "";
    });

    palette(commands);
    registerTools(app);
    // A view that draws at its measured width (so chart text keeps its size on a phone) redraws on a resize.
    let frame = 0;
    addEventListener("resize", () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); });
    addEventListener("popstate", () => app.load(fromHash(spec.fields, location.hash), "none"));
    addEventListener("hashchange", () => app.load(fromHash(spec.fields, location.hash), "none"));
    app.load(fromHash(spec.fields, location.hash), "none");
    document.documentElement.dataset.ready = "true";
    api.app = app;
    return app;
  }

  /**
   * The command palette (Cmd/Ctrl+K): a dialog with a filter field and the commands that match it. Enter runs the
   * first match, a click runs the one clicked, Escape closes it.
   * @param {{ label: string, run(): void }[]} commands
   */
  function palette(commands) {
    const dialog = byId("palette"), input = byId("palette-input"), list = byId("palette-list");
    if (!(dialog instanceof HTMLDialogElement) || !input || !list) return;
    const matches = () => commands.filter((c) => c.label.toLowerCase().includes(input.value.trim().toLowerCase()));
    /** @param {{ label: string, run(): void }} c */
    const run = (c) => { dialog.close(); c.run(); };
    function show() {
      list.replaceChildren(...matches().map((c, i) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = c.label;
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", String(i === 0));
        b.addEventListener("click", () => run(c));
        li.append(b);
        return li;
      }));
    }
    input.addEventListener("input", show);
    input.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const first = matches()[0];
      if (first) run(first);
    });
    addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      input.value = "";
      show();
      if (!dialog.open) dialog.showModal();
      input.focus();
    });
    byId("open-palette")?.addEventListener("click", () => { input.value = ""; show(); dialog.showModal(); input.focus(); });
  }

  /**
   * The read-only WebMCP tools: three every generated visual has, then the domain's own. A browser without
   * WebMCP has no modelContext, and the page works the same.
   * @param {any} app
   */
  function registerTools(app) {
    const mc = (typeof document !== "undefined" && /** @type {any} */ (document).modelContext) || (typeof navigator !== "undefined" && /** @type {any} */ (navigator).modelContext);
    if (!mc || typeof mc.registerTool !== "function") return;
    /** @param {unknown} value */
    const out = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
    const ro = { readOnlyHint: true };
    const none = { type: "object", properties: {}, additionalProperties: false };
    const spec = app.spec;
    const tools = [
      { name: "get_metadata", description: "Return the visual's title, summary, state schema version and the fields of its state with their types, bounds and defaults.", inputSchema: none, annotations: ro,
        execute: async () => out({ visual: spec.slug, title: spec.title, summary: spec.summary, schemaVersion: spec.schemaVersion, fields: spec.fields }) },
      { name: "get_state", description: "Return the current view: its semantic state, what the page derives from it, the JSON a reader can save, and the URL that restores it.", inputSchema: none, annotations: ro,
        execute: async () => out({ state: app.state, derived: app.derived, json: JSON.parse(app.json()), url: location.href }) },
      { name: "get_markdown", description: "Return the Markdown record of the current view: the same frames, in the same order, as the narrated beamdswitch deck, without narration.", inputSchema: none, annotations: ro,
        execute: async () => out({ markdown: app.markdown() }) },
      ...(spec.tools ?? []),
    ];
    for (const tool of tools) mc.registerTool(tool);
  }

  const api = { VERSION, SECTIONS, defaults, coerce, normalize, toHash, fromHash, toJson, fromJson, markdown, start, app: /** @type {any} */ (null) };
  return api;
});
