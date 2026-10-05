/* Checklist Manifesto Maker: the page. It draws every view from the state (state -> render) and turns each
 * control into one call of the model (ChecklistModel) or the formats (ChecklistFormats); it never edits state in
 * place. It also keeps the library on this device, the URL fragment (a view or a bundled example, never content or
 * progress), the command palette and the read-only WebMCP tools.
 *
 *   STATE        the library, the storage status and the page's own transient choices
 *   PERSISTENCE  localStorage after each committed change; "Progress is not saved" when that fails
 *   VIEW HELPERS elements, fields, focus and open panels kept across a redraw
 *   RENDER       Start, Edit, Review, Run, Exercises, Files, the status line and the printable sheet
 *   INTERACTIONS confirmations, imports, exports, the palette, the URL and the keyboard
 *   INITIALIZATION
 */
(function () {
  "use strict";

  const M = /** @type {any} */ (self).ChecklistModel;
  const F = /** @type {any} */ (self).ChecklistFormats;
  const DATA = JSON.parse(/** @type {HTMLElement} */ (document.getElementById("dataset")).textContent ?? "{}");
  const EXAMPLES = DATA.examples;
  /** @param {string} id @returns {any} */
  const $ = (id) => document.getElementById(id);
  /** @param {unknown} e */
  const msg = (e) => (e instanceof Error ? e.message : String(e));

  /* ---------- STATE ---------- */

  /** @type {any} */
  let lib = M.emptyLibrary();
  /** ok: the last save worked; unavailable: storage refused; blocked: saved data this page cannot read is kept untouched */
  let storage = { mode: "ok", reason: "" };
  const ui = {
    view: "start",
    example: "",
    viewing: "",
    naOpen: "",
    reportOpen: false,
    allStops: false,
    notice: "",
    noticeBad: false,
    /** @type {any} */ pending: null,
    /** @type {{ message: string, plain: boolean, text: string } | null} */ importError: null,
    progress: "",
    /** @type {Set<string>} */ open: new Set(),
    focusTarget: "",
  };

  /* ---------- PERSISTENCE ---------- */

  /** localStorage behind a wrapper: reading the property itself throws in a sandboxed frame. */
  const store = {
    getItem: (/** @type {string} */ k) => localStorage.getItem(k),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => localStorage.setItem(k, v),
    removeItem: (/** @type {string} */ k) => localStorage.removeItem(k),
  };

  function persist() {
    storage = M.saveLibrary(store, lib, storage);
  }

  /** @param {string} text @param {boolean} [bad] */
  function say(text, bad = false) {
    ui.notice = text;
    ui.noticeBad = bad;
  }

  const entry = () => M.active(lib);

  /** Replace the current entry with `fn(entry)`, save and redraw; an error becomes a notice. @param {(e: any) => any} fn @param {string} [done] */
  function change(fn, done) {
    try {
      const e = entry();
      if (!e) throw new Error("Open or create a checklist first.");
      const next = fn(e);
      if (next !== e) {
        lib = M.updateActive(lib, () => next);
        persist();
      }
      if (done !== undefined) say(done);
    } catch (err) {
      say(msg(err), true);
    }
    queueRender();
  }

  /** A content edit: the model makes a new revision when the content changes. @param {(def: any) => void} fn */
  const editDef = (fn) => change((e) => M.edit(e, fn));
  /** A Run operation. @param {(run: any) => any} fn @param {string} [done] */
  const runOp = (fn, done) => change((e) => {
    if (!e.run) throw new Error("There is no Run.");
    const run = fn(e.run);
    return run === e.run ? e : { ...e, run };
  }, done);

  /** @param {any} next @param {string} [done] */
  function setLibrary(next, done) {
    lib = next;
    persist();
    if (done !== undefined) say(done);
  }

  /* ---------- VIEW HELPERS ---------- */

  /**
   * An element. Children first, then properties, so a select's value is set after its options exist. A string child
   * is text, never markup.
   * @param {string} tag @param {Record<string, any> | null} [props] @param {...any} kids
   * @returns {any}
   */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "value") /** @type {any} */ (el).value = v;
      else if (k === "checked") /** @type {any} */ (el).checked = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    if (tag === "details" && props?.["data-key"]) {
      const key = props["data-key"];
      if (ui.open.has(key)) el.setAttribute("open", "");
      el.addEventListener("toggle", () => { if (/** @type {HTMLDetailsElement} */ (el).open) ui.open.add(key); else ui.open.delete(key); });
    }
    return el;
  }

  /** @param {string} label @param {Record<string, any>} props */
  const button = (label, props = {}) => h("button", { type: "button", ...props }, label);
  /** @param {string} cls @param {string} text */
  const tag = (cls, text) => h("span", { class: `tag ${cls}` }, text);
  const CATEGORY_TAG = {
    step: () => tag("tag-step", "Step"),
    check: () => tag("tag-check", "◆ Critical check"),
    stop: () => tag("tag-stop", "■ Stop"),
    escalation: () => tag("tag-escalate", "▲ Escalate"),
    recovery: () => tag("tag-recovery", "↺ Recovery"),
  };
  const exampleTag = () => tag("tag-example", "Example — adapt and review before use");
  /** @param {string} mode */
  const modeTag = (mode) => tag(mode ? "tag-mode" : "tag-warn", M.MODE_LABEL[mode]);
  /** @param {string} s @param {string} fallback */
  const or = (s, fallback) => (s && s.trim() ? s : fallback);
  /** @param {number} n @param {string} one @param {string} many */
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  /** How a route's trigger reads: a critical check that fails or a stop condition that is reported. @param {any} def @param {string} id */
  function triggerText(def, id) {
    const hit = M.find(def, id);
    return hit?.type === "item" ? `the critical check “${or(hit.node.text, "(no text)")}” fails` : `the stop condition “${or(hit?.node.text ?? id, "(no text)")}” is reported`;
  }

  /**
   * A text field bound to one field of the draft: it previews on input and commits on change.
   * @param {string} label @param {string} id @param {string} name @param {string} value @param {{ area?: boolean, hint?: string, placeholder?: string }} [opts]
   */
  function field(label, id, name, value, opts = {}) {
    const key = `f:${id}:${name}`;
    const control = h(opts.area ? "textarea" : "input", {
      ...(opts.area ? {} : { type: "text" }),
      "data-key": key,
      id: key,
      value,
      placeholder: opts.placeholder,
      autocomplete: "off",
      oninput: (/** @type {Event} */ ev) => previewWith(id, name, /** @type {HTMLInputElement} */ (ev.target).value),
      onchange: (/** @type {Event} */ ev) => editDef((def) => M.setField(def, id, name, /** @type {HTMLInputElement} */ (ev.target).value)),
    });
    return h("label", { class: "field", for: key }, h("span", null, label), control, opts.hint ? h("span", { class: "note" }, opts.hint) : null);
  }

  /** @param {string} label @param {string} id @param {string} fieldName @param {string} value @param {[string, string][]} options */
  function select(label, id, fieldName, value, options) {
    const key = `f:${id}:${fieldName}`;
    return h("label", { class: "field", for: key }, h("span", null, label),
      h("select", { id: key, "data-key": key, value, onchange: (/** @type {Event} */ ev) => {
        const v = /** @type {HTMLSelectElement} */ (ev.target).value;
        editDef((def) => (fieldName === "kind" ? M.setKind(def, id, v) : M.setField(def, id, fieldName, v)));
      } },
        options.map(([v, text]) => h("option", { value: v }, text))));
  }

  /** @param {string} label @param {string} key @param {boolean} checked @param {(on: boolean) => void} onToggle @param {Record<string, any>} [props] */
  function tick(label, key, checked, onToggle, props = {}) {
    return h("label", { class: "tick" }, h("input", { type: "checkbox", "data-key": key, checked, onchange: (/** @type {Event} */ ev) => onToggle(/** @type {HTMLInputElement} */ (ev.target).checked), ...props }), label);
  }

  function rememberFocus() {
    const el = /** @type {any} */ (document.activeElement);
    if (!el || !el.dataset?.key) return null;
    return { key: el.dataset.key, start: typeof el.selectionStart === "number" ? el.selectionStart : null, end: typeof el.selectionEnd === "number" ? el.selectionEnd : null };
  }

  /** @param {{ key: string, start: number | null, end: number | null } | null} focus */
  function restoreFocus(focus) {
    if (!focus) return;
    const el = /** @type {any} */ (document.querySelector(`[data-key="${CSS.escape(focus.key)}"]`));
    if (!el || el === document.activeElement || el.disabled) return;
    el.focus({ preventScroll: true });
    if (focus.start !== null && typeof el.setSelectionRange === "function" && (el.type === "text" || el.tagName === "TEXTAREA")) {
      try { el.setSelectionRange(focus.start, focus.end); } catch { /* not a text field */ }
    }
  }

  let queued = 0;
  /** Redraw after the current event, so a change that moved focus keeps it on its new field. */
  function queueRender() {
    clearTimeout(queued);
    queued = setTimeout(render, 0);
  }

  /* ---------- RENDER ---------- */

  function render() {
    clearTimeout(queued);
    const focus = rememberFocus();
    renderStatus();
    for (const b of document.querySelectorAll("nav.views [data-view]")) {
      if (b.getAttribute("data-view") === ui.view) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    const notice = $("notice");
    notice.textContent = ui.notice;
    notice.classList.toggle("bad", ui.noticeBad);
    const app = $("app");
    const views = /** @type {Record<string, () => any>} */ ({ start: startView, edit: editView, review: reviewView, run: runView, exercises: exercisesView, files: filesView });
    app.replaceChildren(h("section", { class: "view", "data-view-panel": ui.view, "aria-labelledby": "view-title" }, views[ui.view]()));
    const e = entry();
    $("print-view").replaceChildren(e ? sheet(e.checklist, { print: true, entry: e }) : h("p", null, "No checklist is open."));
    restoreFocus(focus);
    if (ui.focusTarget) {
      const target = ui.focusTarget;
      ui.focusTarget = "";
      const el = /** @type {any} */ (document.querySelector(`[data-id="${CSS.escape(target)}"]`));
      if (el) {
        for (let d = el.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true;
        el.scrollIntoView({ block: "center" });
        /** @type {any} */ (el.querySelector("input, select, textarea, button") ?? el).focus({ preventScroll: true });
      }
    }
    document.documentElement.dataset.ready = "true";
  }

  function renderStatus() {
    const e = entry();
    const run = e?.run;
    const runText = !run ? "no Run" : run.status === "active" ? `Run in progress at ${M.nameOf(run.checklist, run.current)}` : run.status === "complete" ? "Run complete" : "Run ended";
    const saved = storage.mode === "ok"
      ? h("span", { class: lib.checklists.length ? "saved ok" : "saved muted", "data-testid": "save-status" }, lib.checklists.length ? "✓ Saved on this device" : "Nothing saved yet")
      : h("span", { class: "saved not", "data-testid": "save-status" }, "■ Progress is not saved");
    $("status").replaceChildren(...[
      h("span", { class: "current" }, e ? [h("strong", null, or(e.checklist.title, "Untitled checklist")), ` · revision ${e.checklist.revision} · ${runText}`] : "No checklist is open."),
      saved,
      storage.mode !== "ok" ? h("span", { class: "small" }, `${storage.reason} Export your work to keep it.`) : null,
      storage.mode !== "ok" && e ? button("Export Markdown", { "data-key": "status:export", onclick: exportMarkdown }) : null,
      storage.mode === "blocked" ? button("Delete all saved data", { class: "danger", "data-key": "status:delete-all", onclick: deleteAll }) : null,
    ].filter(Boolean));
  }

  /** @param {string} title @param {...any} rest */
  const heading = (title, ...rest) => h("h2", { id: "view-title", tabindex: "-1" }, title, ...rest);

  function needChecklist() {
    return [heading("No checklist is open"), h("p", null, "Start a blank checklist, paste process text, choose an example or import a file."), h("p", { class: "actions" }, button("Go to Start", { class: "primary", "data-key": "go:start", onclick: () => setView("start") }))];
  }

  /* Start */

  function startView() {
    const e = entry();
    return [
      heading("Start"),
      lib.checklists.length ? h("section", { class: "card", "aria-labelledby": "lib-title" },
        h("h3", { id: "lib-title" }, "Your checklists"),
        lib.checklists.length
          ? h("ul", { class: "library" }, lib.checklists.map((/** @type {any} */ x) => {
            const current = e && x.checklist.id === e.checklist.id;
            const run = x.run ? (x.run.status === "active" ? "Run in progress" : x.run.status === "complete" ? "Run complete" : "Run ended") : "no Run";
            return h("li", { "aria-current": current ? "true" : null },
              h("span", null, h("span", { class: "name" }, or(x.checklist.title, "Untitled checklist")), h("span", { class: "muted small" }, ` · revision ${x.checklist.revision} · ${run}`), x.checklist.example ? [" ", exampleTag()] : null),
              current ? h("span", { class: "muted small" }, "Open now") : button("Open", { "data-key": `open:${x.checklist.id}`, "aria-label": `Open ${or(x.checklist.title, "Untitled checklist")}`, onclick: () => { lib = { ...lib, active: x.checklist.id }; persist(); setView("edit"); } }));
          }))
          : null) : null,
      h("section", { class: "card", "aria-labelledby": "examples-title" },
        h("h3", { id: "examples-title" }, "Start from an example"),
        h("p", { class: "small" }, "Each example is a new, editable draft. Choosing one never replaces saved work or carries over results."),
        h("ul", { class: "examples" }, EXAMPLES.map((/** @type {any} */ x) => h("li", { class: ui.example === x.id ? "chosen" : "", "data-example-card": x.id },
          h("strong", null, x.title),
          exampleTag(),
          h("p", null, x.summary),
          h("p", { class: "muted" }, x.checklist.pausePoints.map((/** @type {any} */ p) => `${p.title} (${M.MODE_LABEL[p.mode]})`).join(" · ")),
          button("Use this example", { "data-example": x.id, "data-key": `example:${x.id}`, "aria-label": `Use the example ${x.title}`, onclick: () => useExample(x.id) }))))),
      h("div", { class: "grid2" },
        h("section", { class: "card", "aria-labelledby": "blank-title" },
          h("h3", { id: "blank-title" }, "A blank checklist"),
          h("p", { class: "small" }, "Name the process, add pause points and write each item as one action or check."),
          h("p", { class: "actions" }, button("New blank checklist", { class: "primary", "data-key": "new:blank", onclick: newBlank }))),
        h("section", { class: "card", "aria-labelledby": "paste-title-h" },
          h("h3", { id: "paste-title-h" }, "Paste process text"),
          h("p", { class: "small" }, "Each non-empty line or list entry becomes a draft normal step. Nothing is summarised, inferred or invented; the original text is kept for review."),
          h("label", { class: "field", for: "paste-title" }, h("span", null, "Process title (optional)"), h("input", { id: "paste-title", type: "text", "data-key": "paste:title", autocomplete: "off" })),
          h("label", { class: "field", for: "paste-text" }, h("span", null, "Process text"), h("textarea", { id: "paste-text", rows: "6", "data-key": "paste:text" })),
          h("p", { class: "actions" }, button("Make a draft from the text", { "data-key": "paste:make", onclick: fromPaste })))),
      h("section", { class: "card", "aria-labelledby": "import-title-h" },
        h("h3", { id: "import-title-h" }, "Import a file"),
        h("p", { class: "small" }, "Markdown and Beam MD Switch files from this tool restore exactly; other Markdown becomes a plain draft."),
        h("p", { class: "actions" }, button("Go to Files", { "data-key": "go:files", onclick: () => setView("files") }))),
    ];
  }

  function newBlank() {
    const made = M.newId(lib);
    setLibrary(M.addEntry({ ...lib, seq: made.seq }, M.entryOf(M.blank(made.id))), "A blank checklist is open in Edit. Add its title and a first pause point.");
    setView("edit");
  }

  /** @param {string} id */
  function useExample(id) {
    const example = EXAMPLES.find((/** @type {any} */ x) => x.id === id);
    setLibrary(M.fromExample(lib, example), `A new draft from the example “${example.title}” is open in Edit. Adapt it and review it before use.`);
    ui.example = "";
    setView("edit");
  }

  function fromPaste() {
    const text = /** @type {HTMLTextAreaElement} */ ($("paste-text")).value;
    const title = /** @type {HTMLInputElement} */ ($("paste-title")).value;
    try {
      const made = M.newId(lib);
      const def = F.draftFromText(text, title, made.id);
      setLibrary(M.addEntry({ ...lib, seq: made.seq }, M.entryOf(def)), `Made ${def.pausePoints[0].items.length} draft steps from the text. Remove duplicates and shorten each action, then assign pause points, modes and categories.`);
      setView("edit");
    } catch (e) {
      say(msg(e), true);
      render();
    }
  }

  /* Edit */

  /** Re-draw only the preview with one field's unsaved value. @param {string} id @param {string} fieldName @param {string} value */
  function previewWith(id, fieldName, value) {
    const e = entry();
    const target = $("preview-sheet");
    if (!e || !target) return;
    try {
      target.replaceChildren(sheet(M.setField(M.clone(e.checklist), id, fieldName, value), { preview: true, entry: e }));
    } catch { /* the value is refused on commit */ }
  }

  function editView() {
    const e = entry();
    if (!e) return needChecklist();
    const def = e.checklist;
    const d = M.deriveDraft(e);
    /** @type {Record<string, any[]>} */
    const byTarget = {};
    for (const i of d.issues) (byTarget[i.target] ??= []).push(i);
    /** @param {string} id */
    const inline = (id) => (byTarget[id]?.length ? h("ul", { class: "inline-issues" }, byTarget[id].map((i) => h("li", { class: i.level }, i.text))) : null);
    const checks = M.items(def).filter((/** @type {any} */ i) => i.kind === "check");
    const pauseOptions = def.pausePoints.map((/** @type {any} */ p, /** @type {number} */ n) => [p.id, `Pause point ${n + 1}: ${or(p.title, "untitled")}`]);
    const editor = h("div", { class: "editor" },
      def.example ? h("p", { class: "callout example-banner" }, exampleTag(), h("span", { class: "small" }, "This draft started from a bundled example. It is not an approved procedure."), button("Remove the example label", { "data-key": "edit:unlabel", onclick: () => editDef((x) => M.setField(x, x.id, "example", "")) })) : null,
      h("div", { "data-id": def.id }, field("Checklist title", def.id, "title", def.title, { placeholder: "The process, for example: Publish a static page" })),
      h("p", { class: "revision small muted" }, `Revision ${def.revision}. Each content change makes a new revision; an active Run keeps its own.`),
      inline(def.id),
      h("details", { class: "optional", "data-key": "panel:details" }, h("summary", null, "Intended users, equipment and applicability"),
        field("Intended users", "details", "intendedUsers", def.details.intendedUsers),
        field("Equipment", "details", "equipment", def.details.equipment),
        field("Applicability: when this checklist applies", "details", "applicability", def.details.applicability)),
      h("details", { class: "optional", "data-key": "panel:sources" }, h("summary", null, "Source references and notes"),
        field("Source references", "details", "sources", def.details.sources, { area: true, hint: "Shown as text. Links are not followed." }),
        field("Notes", "details", "notes", def.details.notes, { area: true })),
      reviewerPanel(e),
      def.originalText ? h("details", { class: "optional", "data-key": "panel:original" }, h("summary", null, "Original pasted or imported text"),
        h("p", { class: "small" }, "Kept for review. Compare it with the draft, remove duplicates and shorten each action."),
        h("pre", { class: "original" }, def.originalText),
        h("p", { class: "actions" }, button("Discard the original text", { "data-key": "edit:discard-original", onclick: () => editDef((x) => { x.originalText = ""; }) }))) : null,
      h("h3", null, "Pause points"),
      def.pausePoints.length ? null : h("p", { class: "muted" }, "No pause points yet."),
      def.pausePoints.map((/** @type {any} */ p, /** @type {number} */ n) => pauseEditor(def, p, n, checks, pauseOptions, inline)),
      h("p", { class: "actions" }, button("Add pause point", { "data-key": "edit:add-pause", onclick: () => editDef((x) => { M.addPausePoint(x); }) })),
      conditionEditor(def, "stop", pauseOptions, inline),
      conditionEditor(def, "escalation", pauseOptions, inline),
      routeEditor(def, checks, pauseOptions, inline),
    );
    return [
      heading("Edit"),
      h("p", { class: "small" }, `${d.errors} ${d.errors === 1 ? "issue blocks" : "issues block"} a Run; ${d.warnings} ${d.warnings === 1 ? "suggestion" : "suggestions"}. `, button("Go to Review", { "data-key": "go:review", onclick: () => setView("review") })),
      h("div", { class: "lab" }, editor, h("aside", { class: "preview card", "aria-label": "Checklist preview" }, h("h3", null, "Preview"), h("div", { id: "preview-sheet" }, sheet(def, { preview: true, entry: e })))),
    ];
  }

  /** @param {any} e */
  function reviewerPanel(e) {
    const def = e.checklist;
    const status = M.reviewerStatus(e);
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return h("details", { class: "optional", "data-key": "panel:reviewer", "data-id": "reviewer" }, h("summary", null, `Review requirement and reviewer records (${status.text})`),
      tick("Require a reviewer record for each revision before a Run", "f:review:required", def.requiresReview, (on) => editDef((x) => M.setField(x, x.id, "requiresReview", on))),
      h("p", { class: "note" }, "Reviewer records are user supplied. The app records the name, revision, date and note you enter; it does not verify qualifications or approval."),
      e.reviewers.length ? h("ul", { class: "library" }, e.reviewers.map((/** @type {any} */ r) => h("li", null,
        h("span", null, h("strong", null, r.name), ` · revision ${r.revision} · ${r.date}${r.note ? ` · ${r.note}` : ""} `, r.revision === def.revision ? tag("tag-ok", "Current") : tag("tag-warn", `Stale: the checklist is revision ${def.revision}`)),
        button("Remove", { "data-key": `reviewer:${r.id}:remove`, "aria-label": `Remove the reviewer record of ${r.name}`, onclick: async () => { if (await ask(`Remove the reviewer record of ${r.name}?`, "Remove record")) change((x) => M.removeReviewer(x, r.id)); } })))) : h("p", { class: "muted small" }, "No reviewer records."),
      h("fieldset", null, h("legend", null, `Add a reviewer record for revision ${def.revision}`),
        h("label", { class: "field", for: "reviewer-name" }, h("span", null, "Reviewer name"), h("input", { id: "reviewer-name", type: "text", "data-key": "reviewer:name", autocomplete: "off" })),
        h("label", { class: "field", for: "reviewer-date" }, h("span", null, "Date"), h("input", { id: "reviewer-date", type: "date", "data-key": "reviewer:date", value: iso })),
        h("label", { class: "field", for: "reviewer-note" }, h("span", null, "Note (optional)"), h("input", { id: "reviewer-note", type: "text", "data-key": "reviewer:note", autocomplete: "off" })),
        h("p", { class: "actions" }, button("Add reviewer record", { "data-key": "reviewer:add", onclick: () => change((x) => M.addReviewer(x, { name: $("reviewer-name").value, date: $("reviewer-date").value, note: $("reviewer-note").value }), "Reviewer record added. It is user supplied and not verified.") }))));
  }

  /** @param {any} def @param {any} p @param {number} n @param {any[]} checks @param {any[]} pauseOptions @param {(id: string) => any} inline */
  function pauseEditor(def, p, n, checks, pauseOptions, inline) {
    const count = p.items.length;
    return h("section", { class: "card pause", "data-id": p.id, "aria-label": `Pause point ${n + 1}` },
      h("p", { class: "label" }, `Pause point ${n + 1}`),
      h("div", { class: "pause-head" },
        field("Pause point name", p.id, "title", p.title, { placeholder: "For example: Before departure" }),
        select("Mode", p.id, "mode", p.mode, [["", "Choose a mode"], ["read-do", "Read–Do"], ["do-confirm", "Do–Confirm"]])),
      h("p", { class: "note" }, M.MODE_HELP[p.mode]),
      h("p", { class: `count-line${count > M.TARGET.max ? " long" : ""}` }, `${count} ${count === 1 ? "item" : "items"}. Design target ${M.TARGET.min} to ${M.TARGET.max} items and under a minute to check, confirmed only by a trial with intended users.${count > M.TARGET.max ? " This pause point is long: consider another pause point. Nothing is hidden or cut." : ""}`),
      inline(p.id),
      h("details", { class: "optional", "data-key": `panel:${p.id}:details` }, h("summary", null, "Pause point details"), field("Details", p.id, "details", p.details, { area: true })),
      h("ol", { class: "items", "aria-label": `Items of pause point ${n + 1}` }, p.items.map((/** @type {any} */ i, /** @type {number} */ k) => itemEditor(def, p, i, k, checks, pauseOptions, inline))),
      h("p", { class: "actions" },
        button("Add normal step", { "data-key": `edit:${p.id}:add-step`, onclick: () => editDef((x) => { ui.focusTarget = M.addItem(x, p.id, "step"); }) }),
        button("Add critical check", { "data-key": `edit:${p.id}:add-check`, onclick: () => editDef((x) => { ui.focusTarget = M.addItem(x, p.id, "check"); }) })),
      h("p", { class: "actions" },
        button("Move pause point up", { "data-key": `edit:${p.id}:up`, disabled: n === 0, onclick: () => editDef((x) => { M.movePausePoint(x, p.id, -1); }) }),
        button("Move pause point down", { "data-key": `edit:${p.id}:down`, disabled: n === def.pausePoints.length - 1, onclick: () => editDef((x) => { M.movePausePoint(x, p.id, 1); }) }),
        button("Remove pause point", { class: "danger", "data-key": `edit:${p.id}:remove`, onclick: async () => { if (await ask(`Remove pause point ${n + 1}${p.title ? ` “${p.title}”` : ""} and its ${count} ${count === 1 ? "item" : "items"}?`, "Remove pause point")) editDef((x) => M.removePausePoint(x, p.id)); } })));
  }

  /** @param {any} def @param {any} p @param {any} i @param {number} k @param {any[]} checks @param {any[]} pauseOptions @param {(id: string) => any} inline */
  function itemEditor(def, p, i, k, checks, pauseOptions, inline) {
    const isCheck = i.kind === "check";
    const first = def.pausePoints[0].id === p.id && k === 0;
    const last = def.pausePoints.at(-1).id === p.id && k === p.items.length - 1;
    const label = isCheck ? "Critical check" : "Normal step";
    return h("li", { class: isCheck ? "is-check" : "is-step", "data-id": i.id },
      h("div", { class: "item-head" },
        select("Category", i.id, "kind", i.kind, [["step", "Normal step"], ["check", "Critical check"]]),
        field(isCheck ? "Check: one thing to confirm, with a result" : "Step: one action", i.id, "text", i.text)),
      inline(i.id),
      h("div", { class: "item-tools" },
        tick("Required", `f:${i.id}:required`, i.required, (on) => editDef((x) => M.setField(x, i.id, "required", on))),
        button("Move up", { "data-key": `edit:${i.id}:up`, "aria-label": `Move ${label.toLowerCase()} up`, disabled: first, onclick: () => editDef((x) => { M.moveItem(x, i.id, -1); }) }),
        button("Move down", { "data-key": `edit:${i.id}:down`, "aria-label": `Move ${label.toLowerCase()} down`, disabled: last, onclick: () => editDef((x) => { M.moveItem(x, i.id, 1); }) }),
        button("Remove", { class: "danger", "data-key": `edit:${i.id}:remove`, "aria-label": `Remove ${label.toLowerCase()} ${k + 1}`, onclick: () => editDef((x) => M.removeItem(x, i.id)) })),
      h("details", { class: "optional", "data-key": `panel:${i.id}` }, h("summary", null, isCheck ? "Details, not-applicable rule, failure instruction and dependencies" : "Details, pause point and dependencies"),
        field("Details: a longer explanation", i.id, "details", i.details, { area: true }),
        def.pausePoints.length > 1 ? h("label", { class: "field", for: `move:${i.id}` }, h("span", null, "Pause point"),
          h("select", { id: `move:${i.id}`, "data-key": `move:${i.id}`, value: p.id, onchange: (/** @type {Event} */ ev) => editDef((x) => { M.moveItemTo(x, i.id, /** @type {HTMLSelectElement} */ (ev.target).value); }) },
            pauseOptions.map(([v, text]) => h("option", { value: v }, text)))) : null,
        isCheck ? field("Not applicable when", i.id, "applicability", i.applicability, { hint: "Leave empty when the check always applies. A not-applicable result needs this rule and a recorded reason." }) : null,
        isCheck ? field("If it fails: the stop instruction", i.id, "ifFailed", i.ifFailed) : null,
        checks.filter((c) => c.id !== i.id).length
          ? h("fieldset", null, h("legend", null, "Depends on these critical checks: a failure or correction clears this result"),
            checks.filter((c) => c.id !== i.id).map((c) => tick(or(c.text, "(no text)"), `dep:${i.id}:${c.id}`, i.dependsOn.includes(c.id), (on) => editDef((x) => M.setDependency(x, i.id, c.id, on)))))
          : null));
  }

  /** @param {any} def @param {"stop" | "escalation"} kind @param {any[]} pauseOptions @param {(id: string) => any} inline */
  function conditionEditor(def, kind, pauseOptions, inline) {
    const stop = kind === "stop";
    const list = stop ? def.stopConditions : def.escalationConditions;
    const title = stop ? "Stop conditions" : "Escalation conditions";
    return h("section", { class: "card", "data-id": kind, "aria-labelledby": `${kind}-title` },
      h("h3", { id: `${kind}-title` }, CATEGORY_TAG[kind](), " ", title),
      h("p", { class: "note" }, stop ? "A condition that interrupts normal progress when the person reports it. Write the stop instruction to show." : "A condition that needs help from a named person or role. Write who to ask and what to do."),
      inline(kind),
      h("ol", { class: `items conditions ${stop ? "stop" : "escalate"}` }, list.map((/** @type {any} */ c, /** @type {number} */ n) => h("li", { "data-id": c.id },
        field(stop ? "Stop condition" : "Escalation condition", c.id, "text", c.text),
        stop ? field("Stop instruction", c.id, "instruction", c.instruction) : field("Named person or role", c.id, "contact", c.contact),
        stop ? (def.escalationConditions.length ? select("Relevant escalation", c.id, "escalation", c.escalation, [["", "None"], ...def.escalationConditions.map((/** @type {any} */ x) => [x.id, or(x.text, "(no text)")])]) : null) : field("Escalation action", c.id, "action", c.action),
        inline(c.id),
        pauseOptions.length ? h("fieldset", null, h("legend", null, "Applies at (none ticked: every pause point)"),
          pauseOptions.map(([pid, text]) => tick(text, `at:${c.id}:${pid}`, c.at.includes(pid), (on) => editDef((x) => M.setConditionAt(x, c.id, pid, on))))) : null,
        h("p", { class: "actions" }, button("Remove", { class: "danger", "data-key": `edit:${c.id}:remove`, "aria-label": `Remove ${stop ? "stop" : "escalation"} condition ${n + 1}`, onclick: () => editDef((x) => M.removeCondition(x, c.id)) }))))),
      h("p", { class: "actions" }, button(stop ? "Add stop condition" : "Add escalation condition", { "data-key": `edit:add-${kind}`, onclick: () => editDef((x) => { ui.focusTarget = M.addCondition(x, kind); }) })),
      h("div", { class: "none-row" }, tick("None specified", `none:${kind}`, def.none[kind], (on) => editDef((x) => M.setNone(x, kind, on)), { disabled: list.length > 0 })));
  }

  /** @param {any} def @param {any[]} checks @param {any[]} pauseOptions @param {(id: string) => any} inline */
  function routeEditor(def, checks, pauseOptions, inline) {
    /** @param {any} r @param {"steps" | "restartChecks"} key @param {string} label */
    const parts = (r, key, label) => h("fieldset", null, h("legend", null, label),
      h("ol", { class: "parts" }, r[key].map((/** @type {any} */ s, /** @type {number} */ n) => h("li", { "data-id": s.id }, h("div", { class: "part-row" },
        h("input", { type: "text", "aria-label": `${label} ${n + 1}`, "data-key": `f:${s.id}:text`, value: s.text, autocomplete: "off", onchange: (/** @type {Event} */ ev) => editDef((x) => M.setField(x, s.id, "text", /** @type {HTMLInputElement} */ (ev.target).value)) }),
        button("Up", { "data-key": `edit:${s.id}:up`, "aria-label": `Move ${label.toLowerCase()} ${n + 1} up`, disabled: n === 0, onclick: () => editDef((x) => { M.moveRoutePart(x, s.id, -1); }) }),
        button("Down", { "data-key": `edit:${s.id}:down`, "aria-label": `Move ${label.toLowerCase()} ${n + 1} down`, disabled: n === r[key].length - 1, onclick: () => editDef((x) => { M.moveRoutePart(x, s.id, 1); }) }),
        button("Remove", { class: "danger", "data-key": `edit:${s.id}:remove`, "aria-label": `Remove ${label.toLowerCase()} ${n + 1}`, onclick: () => editDef((x) => M.removeRoutePart(x, s.id)) }))))),
      button(key === "steps" ? "Add recovery step" : "Add restart check", { "data-key": `edit:${r.id}:add-${key}`, onclick: () => editDef((x) => { ui.focusTarget = M.addRoutePart(x, r.id, key); }) }));
    return h("section", { class: "card", "data-id": "recovery", "aria-labelledby": "recovery-title" },
      h("h3", { id: "recovery-title" }, CATEGORY_TAG.recovery(), " Recovery routes"),
      h("p", { class: "note" }, "A route names its trigger (a failed critical check or a reported stop condition), its ordered recovery steps, the restart checks the person must confirm and the pause point to restart at. Routes are linked explicitly, never chosen by matching words."),
      inline("recovery"),
      h("ol", { class: "items routes" }, def.recoveryRoutes.map((/** @type {any} */ r, /** @type {number} */ n) => h("li", { "data-id": r.id },
        field("Route name", r.id, "title", r.title),
        inline(r.id),
        h("fieldset", null, h("legend", null, "Trigger: start this route when"),
          checks.length || def.stopConditions.length ? [
            ...checks.map((c) => tick(`the critical check “${or(c.text, "(no text)")}” fails`, `trigger:${r.id}:${c.id}`, r.triggers.includes(c.id), (on) => editDef((x) => M.setTrigger(x, r.id, c.id, on)))),
            ...def.stopConditions.map((/** @type {any} */ c) => tick(`the stop condition “${or(c.text, "(no text)")}” is reported`, `trigger:${r.id}:${c.id}`, r.triggers.includes(c.id), (on) => editDef((x) => M.setTrigger(x, r.id, c.id, on)))),
          ] : h("p", { class: "muted small" }, "Add a critical check or a stop condition to link.")),
        parts(r, "steps", "Recovery step"),
        parts(r, "restartChecks", "Restart check"),
        pauseOptions.length ? select("Restart at", r.id, "restartAt", r.restartAt, [["", "Choose a pause point"], ...pauseOptions]) : null,
        h("p", { class: "actions" }, button("Remove route", { class: "danger", "data-key": `edit:${r.id}:remove`, "aria-label": `Remove recovery route ${n + 1}`, onclick: () => editDef((x) => M.removeRoute(x, r.id)) }))))),
      h("p", { class: "actions" }, button("Add recovery route", { "data-key": "edit:add-route", onclick: () => editDef((x) => { ui.focusTarget = M.addRoute(x); }) })),
      h("div", { class: "none-row" }, tick("None specified", "none:recovery", def.none.recovery, (on) => editDef((x) => M.setNone(x, "recovery", on)), { disabled: def.recoveryRoutes.length > 0 })));
  }

  /**
   * The checklist as a sheet: the Edit preview, the Review preview and the printed page share it.
   * @param {any} def @param {{ preview?: boolean, print?: boolean, entry?: any }} opts
   */
  function sheet(def, opts) {
    const e = opts.entry;
    const status = e ? M.reviewerStatus({ ...e, checklist: def }) : null;
    return h("div", { class: "sheet" },
      h(opts.print ? "h2" : "h3", null, or(def.title, "Untitled checklist")),
      def.example ? h("p", null, exampleTag()) : null,
      h("p", { class: "muted" }, `Revision ${def.revision}${status ? ` · ${status.text}` : ""}`),
      opts.print && (def.details.intendedUsers || def.details.equipment || def.details.applicability || def.details.sources) ? h("ul", null,
        def.details.intendedUsers ? h("li", null, `Intended users: ${def.details.intendedUsers}`) : null,
        def.details.equipment ? h("li", null, `Equipment: ${def.details.equipment}`) : null,
        def.details.applicability ? h("li", null, `Applicability: ${def.details.applicability}`) : null,
        def.details.sources ? h("li", null, `Source references: ${def.details.sources}`) : null) : null,
      def.pausePoints.length ? null : h("p", { class: "muted" }, "No pause points yet."),
      def.pausePoints.map((/** @type {any} */ p, /** @type {number} */ n) => {
        const stops = M.conditionsAt(def, "stop", p.id);
        return h("div", { class: "sheet-pause" },
          h(opts.print ? "h3" : "h4", null, `Pause point ${n + 1}: ${or(p.title, "untitled")} `, modeTag(p.mode)),
          h("p", { class: "mode" }, M.MODE_HELP[p.mode]),
          p.items.length ? h("ul", null, p.items.map((/** @type {any} */ i) => h("li", { class: i.kind },
            h("span", { class: "box", "aria-hidden": "true" }, i.kind === "check" ? "◇" : "☐"),
            h("span", null, i.kind === "check" ? [CATEGORY_TAG.check(), " "] : null, or(i.text, "(no text)"), i.required ? "" : " (optional)",
              opts.print && i.kind === "check" ? h("span", { class: "muted" }, ` ☐ Passed ☐ Failed ☐ Unknown${i.applicability ? " ☐ Not applicable, because: ______" : ""}`) : null,
              opts.print && i.kind === "check" && i.ifFailed ? h("span", { class: "muted" }, ` If it fails: ${i.ifFailed}`) : null)))) : h("p", { class: "muted" }, "No items yet."),
          h("p", { class: "stopline" }, CATEGORY_TAG.stop(), " ", stops.length ? `Stop if: ${stops.map((/** @type {any} */ c) => or(c.text, "(no text)")).join(" · ")}` : "No stop condition at this pause point."));
      }),
      h(opts.print ? "h3" : "h4", null, "Stop and escalation conditions"),
      h("ul", null,
        def.none.stop ? h("li", null, CATEGORY_TAG.stop(), " None specified.") : def.stopConditions.map((/** @type {any} */ c) => h("li", null, CATEGORY_TAG.stop(), h("span", null, ` ${or(c.text, "(no text)")} Instruction: ${or(c.instruction, "not written yet")}`))),
        def.none.escalation ? h("li", null, CATEGORY_TAG.escalation(), " None specified.") : def.escalationConditions.map((/** @type {any} */ c) => h("li", null, CATEGORY_TAG.escalation(), h("span", null, ` ${or(c.text, "(no text)")} Ask: ${or(c.contact, "not named yet")}. ${or(c.action, "")}`)))),
      h(opts.print ? "h3" : "h4", null, "Recovery routes"),
      def.none.recovery ? h("p", null, CATEGORY_TAG.recovery(), " None specified: a failed check or a reported stop keeps the Run stopped.") : null,
      def.recoveryRoutes.map((/** @type {any} */ r) => h("div", { class: "route" },
        h("p", null, h("strong", null, or(r.title, "Untitled route")), ` · when ${r.triggers.map((/** @type {string} */ t) => triggerText(def, t)).join(", or ") || "(no trigger linked yet)"}`),
        h("ol", null, r.steps.map((/** @type {any} */ s) => h("li", null, CATEGORY_TAG.recovery(), " ", or(s.text, "(no text)")))),
        h("ul", null, r.restartChecks.map((/** @type {any} */ s) => h("li", null, h("span", { class: "box", "aria-hidden": "true" }, "☐"), `Restart check: ${or(s.text, "(no text)")}`))),
        h("p", { class: "muted" }, `Restart at: ${r.restartAt ? M.nameOf(def, r.restartAt) : "not chosen yet"}`))),
      opts.print && e?.run ? runSummary(e.run) : null);
  }

  /** @param {any} run */
  function runSummary(run) {
    const def = run.checklist;
    return h("div", { class: "run-summary" },
      h("h3", null, `${run.id} on revision ${run.revision}: ${run.status === "active" ? `in progress at ${M.nameOf(def, run.current)}` : run.status === "complete" ? "complete" : "ended"}`),
      h("div", { class: "table-wrap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "Pause point"), h("th", null, "Item"), h("th", null, "Result"))),
        h("tbody", null, M.items(def).map((/** @type {any} */ i) => h("tr", null, h("td", null, M.nameOf(def, i.pausePoint)), h("td", null, i.text), h("td", null, `${M.RESULT_LABEL[run.results[i.id].value]}${run.results[i.id].reason ? `: ${run.results[i.id].reason}` : ""}`)))))));
  }

  /* Review */

  function reviewView() {
    const e = entry();
    if (!e) return needChecklist();
    const def = e.checklist;
    const d = M.deriveDraft(e);
    const errors = d.issues.filter((/** @type {any} */ i) => i.level === "error");
    const run = e.run;
    return [
      heading("Review"),
      h("p", null, `Review revision ${def.revision} before a Run: every pause point, item and condition below is what the Run will show. Errors block a Run; suggestions are design targets.`),
      h("section", { class: "card", "aria-labelledby": "issues-title" },
        h("h3", { id: "issues-title" }, d.issues.length ? `${d.errors} blocking ${d.errors === 1 ? "issue" : "issues"}, ${d.warnings} ${d.warnings === 1 ? "suggestion" : "suggestions"}` : "No draft issues"),
        d.issues.length ? h("ul", { class: "issues" }, [...errors, ...d.issues.filter((/** @type {any} */ i) => i.level !== "error")].map((/** @type {any} */ i, /** @type {number} */ n) => h("li", null,
          i.level === "error" ? tag("tag-bad", "■ Blocks a Run") : tag("tag-warn", "△ Suggestion"),
          h("span", { class: "text" }, i.text),
          button("Go to it", { "data-key": `issue:${n}`, "aria-label": `Go to: ${i.text}`, onclick: () => { ui.focusTarget = i.target; setView("edit"); } })))) : h("p", { class: "muted" }, "Every pause point has a name, a mode and items; every condition and route is complete.")),
      h("section", { class: "card", "aria-labelledby": "counts-title" },
        h("h3", { id: "counts-title" }, "Pause points against the design targets"),
        h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, h("th", null, "Pause point"), h("th", null, "Mode"), h("th", { class: "num" }, "Items"), h("th", { class: "num" }, "Steps"), h("th", { class: "num" }, "Critical checks"), h("th", { class: "num" }, "Stop conditions"), h("th", null, "Target 5 to 9"))),
          h("tbody", null, d.pausePoints.map((/** @type {any} */ p, /** @type {number} */ n) => h("tr", null,
            h("td", null, `${n + 1}. ${or(p.title, "untitled")}`), h("td", null, M.MODE_LABEL[p.mode]), h("td", { class: "num" }, p.items), h("td", { class: "num" }, p.steps), h("td", { class: "num" }, p.checks), h("td", { class: "num" }, p.stops),
            h("td", null, p.target === "within" ? "within" : p.target === "above" ? "above: consider another pause point" : "below (fine if nothing essential is missing)")))))),
        h("p", { class: "note" }, `Totals: ${count(d.steps, "normal step", "normal steps")}, ${count(d.checks, "critical check", "critical checks")}, ${count(d.stopConditions, "stop condition", "stop conditions")}, ${count(d.escalationConditions, "escalation condition", "escalation conditions")}, ${count(d.recoveryRoutes, "recovery route", "recovery routes")} with ${count(d.recoverySteps, "recovery step", "recovery steps")}. Under a minute per pause point is a target that only a trial with intended users can confirm.`)),
      h("section", { class: "card", "aria-labelledby": "approve-title" },
        h("h3", { id: "approve-title" }, "Review and start"),
        h("p", null, d.reviewer.text, ". ", def.requiresReview ? "This checklist requires a reviewer record for each revision." : "A reviewer record is optional.", " ",
          button("Reviewer records", { "data-key": "go:reviewer", onclick: () => { ui.open.add("panel:reviewer"); ui.focusTarget = "reviewer"; setView("edit"); } })),
        d.reviewed
          ? h("p", null, tag("tag-ok", "✓ Reviewed"), ` You reviewed revision ${def.revision}.`)
          : h("p", { class: "actions" }, button(`Mark revision ${def.revision} reviewed`, { "data-key": "review:mark", disabled: errors.length > 0, onclick: () => change((x) => M.markReviewed(x), `Revision ${def.revision} is marked reviewed.`) }),
            errors.length ? h("span", { class: "small muted" }, "Resolve the blocking issues first.") : null),
        d.blockers.length ? h("ul", { class: "small" }, d.blockers.map((/** @type {string} */ b) => h("li", null, b))) : null,
        h("p", { class: "actions" }, button(`Start a Run on revision ${def.revision}`, { class: "primary", "data-key": "review:start", disabled: !d.canStart, onclick: startRun }),
          run && M.unfinished(run) ? h("span", { class: "small" }, `An unfinished Run on revision ${run.revision} exists; starting replaces it after you confirm.`) : null)),
      h("section", { class: "card", "aria-label": "Checklist as the Run shows it" }, sheet(def, { entry: e })),
    ];
  }

  async function startRun() {
    const e = entry();
    if (!e) return;
    if (M.unfinished(e.run) && !(await ask(`An unfinished Run on revision ${e.run.revision} exists, at ${M.nameOf(e.run.checklist, e.run.current)}. Start a new Run and remove its progress?`, "Replace the Run"))) return;
    try {
      lib = M.updateActive(lib, (/** @type {any} */ x) => M.startRun(x));
      persist();
      say(`Run started on revision ${e.checklist.revision}.`);
      ui.viewing = "";
      setView("run");
    } catch (err) {
      say(msg(err), true);
      render();
    }
  }

  /* Run */

  function runView() {
    const e = entry();
    if (!e) return needChecklist();
    const run = e.run;
    if (!run) return [heading("Run"), h("p", null, "No Run yet. Review the checklist, then start a Run from Review."), h("p", { class: "actions" }, button("Go to Review", { class: "primary", "data-key": "go:review", onclick: () => setView("review") }))];
    const def = run.checklist;
    const d = M.deriveRun(run);
    const order = def.pausePoints.map((/** @type {any} */ p) => p.id);
    const viewing = ui.viewing && run.completed.includes(ui.viewing) && run.status === "active" ? ui.viewing : run.current;
    const p = def.pausePoints.find((/** @type {any} */ x) => x.id === viewing);
    const n = order.indexOf(viewing);
    const isCurrent = viewing === run.current && run.status === "active";
    const locked = Boolean(run.hold || run.recovery);
    return [
      heading(`Run: ${or(def.title, "Untitled checklist")}`),
      h("p", { class: "run-head small" }, `${run.id} on revision ${run.revision}.`, e.checklist.revision !== run.revision ? ` The draft is now revision ${e.checklist.revision}; edits apply to the next Run, not this one.` : " Editing the draft never changes this Run."),
      run.status === "complete" ? h("p", { class: "callout" }, tag("tag-ok", "✓ Complete"), " Every pause point was confirmed. Completed boxes record what was reported; they do not prove the work is correct.") : null,
      run.status === "ended" ? h("p", { class: "callout" }, tag("tag-bad", "Ended"), ` The Run was ended at ${M.nameOf(def, run.current)} before completion.`) : null,
      run.hold ? h("div", { class: "exception hold", role: "alert" }, h("h3", null, "Confirm where you are"), h("p", null, run.hold.text),
        h("p", { class: "actions" }, button(`Confirm: I am at ${M.nameOf(def, run.current)}`, { class: "primary", "data-key": "run:confirm", onclick: () => runOp((r) => M.confirmPausePoint(r)) }))) : null,
      run.notice && !run.hold ? h("p", { class: "callout", role: "status" }, run.notice) : null,
      h("ol", { class: "stepper", "aria-label": "Pause points" }, def.pausePoints.map((/** @type {any} */ x, /** @type {number} */ k) => {
        const done = run.completed.includes(x.id);
        const current = x.id === run.current && run.status === "active";
        return h("li", { "aria-current": current ? "step" : null },
          h("span", { class: "state" }, done ? "✓ Confirmed" : current ? "▶ Current" : "Not reached"),
          done && run.status === "active" && x.id !== viewing ? button(`${k + 1}. ${or(x.title, "untitled")}`, { "data-key": `run:view:${x.id}`, "aria-label": `View confirmed pause point ${k + 1}, ${or(x.title, "untitled")}`, onclick: () => { ui.viewing = x.id; render(); } }) : h("span", null, `${k + 1}. ${or(x.title, "untitled")}`));
      })),
      run.status !== "active" ? [runSummary(run), h("p", { class: "actions" },
        button("Reset Run", { "data-key": "run:reset", onclick: resetRun }),
        button("Go to Review to start a new Run", { "data-key": "go:review", onclick: () => setView("review") }))] : [
        !isCurrent ? h("div", { class: "callout" }, h("p", null, `You are viewing confirmed pause point ${n + 1}. A change here is a correction: if it makes a result invalid, the Run pauses, clears the results that depend on it and returns here.`),
          h("p", { class: "actions" }, button("Back to the current pause point", { "data-key": "run:back", onclick: () => { ui.viewing = ""; render(); } }))) : null,
        h("section", { class: "card pause-run", "aria-labelledby": "pause-title" },
          h("h3", { id: "pause-title" }, `Pause point ${n + 1} of ${order.length}: ${or(p.title, "untitled")}`),
          h("p", { class: "mode-line" }, modeTag(p.mode), " ", M.MODE_HELP[p.mode]),
          p.details ? h("p", { class: "small muted" }, p.details) : null,
          progressLine(run, p),
          isCurrent ? stopsHere(run, p) : null,
          isCurrent ? exceptions(run, p) : null,
          isCurrent && run.recovery ? recoveryPanel(run) : null,
          locked && isCurrent ? h("p", { class: "small muted" }, run.hold ? "Results are locked until you confirm where you are." : "Results are locked while the recovery route is in progress.") : null,
          h("ol", { class: "run-items", "aria-label": `Items of pause point ${n + 1}` }, p.items.map((/** @type {any} */ i) => runItem(run, p, i, locked))),
          isCurrent ? gatePanel(run, d) : null),
        h("p", { class: "actions" },
          button("Reset Run", { "data-key": "run:reset", onclick: resetRun }),
          button("End Run", { class: "danger", "data-key": "run:end", onclick: endRun })),
      ],
      h("details", { class: "optional", "data-key": "panel:log" }, h("summary", null, `Run log (${run.log.length})`), h("ol", { class: "log" }, run.log.map((/** @type {string} */ line) => h("li", null, line)))),
    ];
  }

  /** @param {any} run @param {any} p */
  function progressLine(run, p) {
    const steps = p.items.filter((/** @type {any} */ i) => i.kind === "step");
    const checks = p.items.filter((/** @type {any} */ i) => i.kind === "check");
    return h("p", { class: "progress", "data-testid": "progress" },
      `Normal steps done: ${steps.filter((/** @type {any} */ i) => run.results[i.id].value === "done").length} of ${steps.length} · Critical checks with a valid result: ${checks.filter((/** @type {any} */ i) => M.valid(i, run.results[i.id])).length} of ${checks.length}`);
  }

  /** @param {any} run @param {any} p */
  function stopsHere(run, p) {
    const def = run.checklist;
    const here = M.conditionsAt(def, "stop", p.id);
    const escalations = M.conditionsAt(def, "escalation", p.id);
    return h("div", { class: "stops-here", "aria-labelledby": "stops-title" },
      h("h4", { id: "stops-title" }, CATEGORY_TAG.stop(), " Stop conditions at this pause point"),
      here.length ? h("ul", null, here.map((/** @type {any} */ c) => h("li", null, c.text))) : h("p", { class: "small muted" }, "None at this pause point."),
      h("p", { class: "actions" },
        button("Report condition", { "data-key": "run:report-open", "aria-expanded": String(ui.reportOpen), disabled: Boolean(run.hold), onclick: () => { ui.reportOpen = !ui.reportOpen; render(); } }),
        button(`All stop conditions (${def.stopConditions.length})`, { "data-key": "run:all-stops", "aria-expanded": String(ui.allStops), onclick: () => { ui.allStops = !ui.allStops; render(); } })),
      ui.reportOpen && !run.hold ? h("div", { class: "report-list" },
        h("p", { class: "small" }, "Report a condition only when you observe it. The app does not detect conditions."),
        here.length || escalations.length ? h("ul", null,
          here.map((/** @type {any} */ c) => h("li", null, button(`Report stop: ${c.text}`, { class: "danger", "data-key": `run:report:${c.id}`, onclick: () => reportCondition(c.id) }))),
          escalations.map((/** @type {any} */ c) => h("li", null, button(`Report escalation: ${c.text}`, { "data-key": `run:report:${c.id}`, onclick: () => reportCondition(c.id) })))) : h("p", { class: "small muted" }, "No condition is authored for this pause point.")) : null,
      ui.allStops ? h("ul", { class: "small", "aria-label": "All stop conditions" }, def.stopConditions.length ? def.stopConditions.map((/** @type {any} */ c) => h("li", null, `${c.text} Instruction: ${c.instruction} (applies at ${c.at.length ? c.at.map((/** @type {string} */ x) => M.nameOf(def, x)).join(", ") : "every pause point"})`)) : h("li", null, def.none.stop ? "None specified." : "None written.")) : null);
  }

  /** @param {string} id */
  async function reportCondition(id) {
    const e = entry();
    if (!e?.run) return;
    const hit = M.find(e.run.checklist, id);
    const stop = hit?.type === "stop";
    if (!(await ask(stop ? `Report the stop condition “${hit.node.text}”? It blocks normal progress until a recovery route restarts the Run, or you end the Run.` : `Report the escalation condition “${hit.node.text}”? The page shows who to ask and what to do.`, stop ? "Report stop condition" : "Report escalation condition"))) return;
    ui.reportOpen = false;
    runOp((r) => M.report(r, id));
  }

  /** The exceptions at the current pause point: never collapsed, each named in words. @param {any} run @param {any} p */
  function exceptions(run, p) {
    const def = run.checklist;
    const routes = M.routesFor(run);
    const out = [];
    /** @param {string} trigger */
    const routeButtons = (trigger) => {
      const linked = routes.filter((/** @type {any} */ r) => r.triggers.includes(trigger));
      if (run.recovery) return null;
      if (!linked.length) return null;
      return h("p", { class: "actions" }, linked.map((/** @type {any} */ r) => button(`Start recovery: ${or(r.title, "untitled route")}`, { class: "primary", "data-key": `run:recover:${r.id}`, disabled: Boolean(run.hold), onclick: () => runOp((x) => M.startRecovery(x, r.id)) })));
    };
    /** @param {any[]} list */
    const escalationOffer = (list) => (list.length ? h("div", null, h("p", { class: "small" }, "If you need help:"), h("ul", null, list.map((/** @type {any} */ c) => h("li", null, CATEGORY_TAG.escalation(), ` ${c.text} Ask: ${c.contact}. ${c.action} `,
      run.reports.some((/** @type {any} */ r) => r.condition === c.id && r.status === "active") ? h("span", { class: "small muted" }, "(reported)") : button("Report this escalation", { "data-key": `run:escalate:${c.id}`, disabled: Boolean(run.hold), onclick: () => reportCondition(c.id) }))))) : null);
    /** @param {string} trigger */
    const noRoute = (trigger) => (routes.some((/** @type {any} */ r) => r.triggers.includes(trigger)) ? null : h("div", null,
      h("p", null, h("strong", null, "No recovery route is authored for this. The Run stays stopped.")),
      h("p", { class: "actions" }, button("End Run", { class: "danger", "data-key": `run:end:${trigger}`, onclick: endRun }))));
    for (const i of p.items) {
      const r = run.results[i.id];
      if (i.kind !== "check" || (r.value !== "failed" && r.value !== "unknown")) continue;
      if (r.value === "unknown") {
        out.push(h("div", { class: "exception", role: "alert", "data-testid": "exception" }, h("h4", null, tag("tag-stop", "■ Unknown"), ` Critical check result unknown: ${i.text}`),
          h("p", null, "An unknown result does not count as passed. Find out, then record Passed or Failed. Normal progress is blocked until then.")));
        continue;
      }
      out.push(h("div", { class: "exception", role: "alert", "data-testid": "exception" },
        h("h4", null, tag("tag-stop", "■ Failed"), ` Critical check failed: ${i.text}`),
        h("p", { class: "instruction" }, i.ifFailed || "No stop instruction is authored for this check. Stop and decide what to do before continuing."),
        routeButtons(i.id),
        escalationOffer(M.conditionsAt(def, "escalation", p.id)),
        noRoute(i.id)));
    }
    for (const rep of run.reports.filter((/** @type {any} */ x) => x.status === "active")) {
      const c = M.find(def, rep.condition);
      if (c.type === "stop") {
        const esc = c.node.escalation ? [M.find(def, c.node.escalation).node] : M.conditionsAt(def, "escalation", p.id);
        out.push(h("div", { class: "exception", role: "alert", "data-testid": "exception" },
          h("h4", null, tag("tag-stop", "■ Stop"), ` Stop condition reported: ${c.node.text}`),
          h("p", { class: "instruction" }, c.node.instruction),
          routeButtons(c.node.id),
          escalationOffer(esc),
          noRoute(c.node.id)));
      } else {
        out.push(h("div", { class: "exception escalate", role: "alert", "data-testid": "escalation" },
          h("h4", null, tag("tag-escalate", "▲ Escalate"), ` Escalation reported: ${c.node.text}`),
          h("p", { class: "instruction" }, `Ask: ${c.node.contact}. ${c.node.action}`),
          h("p", { class: "actions" }, button("Help received", { "data-key": `run:help:${rep.id}`, disabled: Boolean(run.hold), onclick: () => runOp((x) => M.resolveEscalation(x, rep.id)) }))));
      }
    }
    return out;
  }

  /** @param {any} run */
  function recoveryPanel(run) {
    const def = run.checklist;
    const route = def.recoveryRoutes.find((/** @type {any} */ r) => r.id === run.recovery.route);
    const ready = M.canRestart(run);
    const order = def.pausePoints.map((/** @type {any} */ p) => p.id);
    const skips = order.indexOf(route.restartAt) > order.indexOf(run.current);
    return h("div", { class: "exception recovery", "data-testid": "recovery" },
      h("h4", null, CATEGORY_TAG.recovery(), ` Recovery route: ${route.title}`),
      h("p", { class: "small" }, `Trigger: ${M.nameOf(def, run.recovery.trigger).replace(/[.]+$/, "")}. Do each recovery step, then confirm each restart check. Recovery does not approve the restart: you confirm it.`),
      h("ol", null, route.steps.map((/** @type {any} */ s) => {
        const done = run.recovery.done.includes(s.id);
        return h("li", null, h("p", null, s.text), button(done ? "✓ Done" : "Mark done", { class: "done-toggle", "aria-pressed": String(done), "data-key": `run:rec:${s.id}`, "aria-label": `${done ? "Done" : "Mark done"}: ${s.text}`, disabled: Boolean(run.hold), onclick: () => runOp((x) => M.markRecovery(x, s.id, !done)) }));
      })),
      h("h5", null, "Restart checks"),
      h("ul", null, route.restartChecks.map((/** @type {any} */ s) => {
        const ok = run.recovery.confirmed.includes(s.id);
        return h("li", null, h("p", null, s.text), button(ok ? "✓ Confirmed" : "Confirm", { class: "done-toggle", "aria-pressed": String(ok), "data-key": `run:rec:${s.id}`, "aria-label": `${ok ? "Confirmed" : "Confirm"}: ${s.text}`, disabled: Boolean(run.hold), onclick: () => runOp((x) => M.markRecovery(x, s.id, !ok)) }));
      })),
      skips ? h("p", { class: "small" }, "This route restarts at a later pause point; a restart cannot skip pause points, so the Run stays stopped.") : null,
      h("p", { class: "actions" },
        button(`Restart at ${M.nameOf(def, route.restartAt)}`, { class: "primary", "data-key": "run:restart", disabled: !ready || Boolean(run.hold), onclick: () => runOp((x) => M.restart(x)) }),
        button("Cancel recovery", { "data-key": "run:cancel-recovery", disabled: Boolean(run.hold), onclick: () => runOp((x) => M.cancelRecovery(x)) })));
  }

  /** @param {any} run @param {any} p @param {any} i @param {boolean} locked */
  function runItem(run, p, i, locked) {
    const r = run.results[i.id];
    const isCheck = i.kind === "check";
    const nextId = p.mode === "read-do" ? p.items.find((/** @type {any} */ x) => !M.valid(x, run.results[x.id]) && run.results[x.id].value === "pending")?.id : "";
    const symbol = { pending: "○", done: "✓", passed: "✓", failed: "✗", unknown: "?", "not-applicable": "–" }[/** @type {"pending"} */ (r.value)];
    const controls = isCheck
      ? h("div", { class: "results", role: "group", "aria-label": `Result of: ${i.text}` },
        ["passed", "failed", "unknown", "not-applicable"].map((value) => button(M.RESULT_LABEL[value], {
          "data-value": value,
          "data-key": `run:${i.id}:${value}`,
          "aria-pressed": String(r.value === value),
          disabled: locked || (value === "not-applicable" && !i.applicability.trim()),
          onclick: () => {
            if (value === "not-applicable" && r.value !== value) { ui.naOpen = i.id; render(); return; }
            runOp((x) => M.record(x, i.id, r.value === value ? "pending" : value));
          },
        })))
      : button(r.value === "done" ? "✓ Done" : "Mark done", { class: "done-toggle", "aria-pressed": String(r.value === "done"), "data-key": `run:${i.id}:done`, "aria-label": `${r.value === "done" ? "Done" : "Mark done"}: ${i.text}`, disabled: locked, onclick: () => runOp((x) => M.record(x, i.id, r.value === "done" ? "pending" : "done")) });
    return h("li", { class: `${isCheck ? "check" : "step"}${nextId === i.id ? " next" : ""}`, "data-item": i.id },
      h("p", { class: "item-meta" }, isCheck ? CATEGORY_TAG.check() : CATEGORY_TAG.step(), i.required ? "" : h("span", { class: "small muted" }, " optional"), nextId === i.id ? [" ", tag("tag-example", "Next")] : null),
      h("p", { class: "item-text" }, i.text),
      i.details ? h("details", { "data-key": `panel:run:${i.id}` }, h("summary", null, "Details"), h("p", { class: "small" }, i.details)) : null,
      isCheck ? h("p", { class: "small muted" }, i.applicability ? `Not applicable when: ${i.applicability}` : "Not applicable is not allowed: the author wrote no applicability rule.") : null,
      controls,
      isCheck && ui.naOpen === i.id && !locked ? h("div", { class: "na-form" },
        h("label", { class: "field", for: `na:${i.id}` }, h("span", null, `Why is it not applicable? The rule: ${i.applicability}`), h("input", { id: `na:${i.id}`, type: "text", "data-key": `run:${i.id}:reason`, autocomplete: "off" })),
        h("p", { class: "actions" },
          button("Record not applicable", { class: "primary", "data-key": `run:${i.id}:na-save`, onclick: () => { const reason = $(`na:${i.id}`).value; ui.naOpen = ""; runOp((x) => M.record(x, i.id, "not-applicable", reason)); } }),
          button("Cancel", { "data-key": `run:${i.id}:na-cancel`, onclick: () => { ui.naOpen = ""; render(); } }))) : null,
      isCheck ? h("p", { class: "result-line", "data-testid": `result-${i.id}` }, `${symbol} Result: ${M.RESULT_LABEL[r.value]}${r.reason ? `, because ${r.reason}` : ""}`) : null);
  }

  /** @param {any} run @param {any} d */
  function gatePanel(run, d) {
    const def = run.checklist;
    const g = d.gate;
    const order = def.pausePoints.map((/** @type {any} */ p) => p.id);
    const next = order[order.indexOf(run.current) + 1];
    return h("div", { class: `gate${g.open ? " open" : ""}`, "data-testid": "gate" },
      g.open ? h("p", null, tag("tag-ok", "✓ Available"), " Normal progress is available: every required item has a valid result.") : [h("p", null, tag("tag-bad", "■ Blocked"), " Normal progress is blocked:"), h("ul", null, g.blockers.map((/** @type {any} */ b) => h("li", null, b.text)))],
      h("p", { class: "actions" }, button(g.last ? `Confirm ${M.nameOf(def, run.current)} and complete the Run` : `Confirm ${M.nameOf(def, run.current)} and continue to ${M.nameOf(def, next)}`, {
        class: "primary", "data-key": "run:advance", disabled: !g.open, onclick: () => { ui.viewing = ""; runOp((x) => M.advance(x)); },
      })));
  }

  async function resetRun() {
    if (!(await ask("Reset the Run? Every recorded result, report and recovery step of this Run is removed, and it starts again at the first pause point of the same revision.", "Reset Run"))) return;
    ui.viewing = "";
    change((x) => M.resetRun(x), "The Run was reset.");
  }

  async function endRun() {
    if (!(await ask("End the Run now? It stays recorded as ended; you can export it or start a new Run from Review.", "End Run"))) return;
    runOp((x) => M.endRun(x), "The Run was ended.");
  }

  /* Exercises */

  function exercisesView() {
    const e = entry();
    return [
      heading("Exercises"),
      h("p", null, "Optional trial prompts for improving a checklist. They are kept outside Run: nothing here records a result."),
      h("ol", { class: "exercises" }, DATA.exercises.map((/** @type {any} */ x) => h("li", { "data-exercise": x.id }, x.prompt))),
      e ? h("section", { class: "card", "aria-labelledby": "trial-title" },
        h("h3", { id: "trial-title" }, "Trial notes"),
        h("p", { class: "small" }, "Record what a representative user missed or found unclear. Notes are saved with this checklist and are not content, so they make no new revision."),
        h("label", { class: "field", for: "trial-notes" }, h("span", null, `Trial notes for ${or(e.checklist.title, "this checklist")}`),
          h("textarea", { id: "trial-notes", rows: "5", "data-key": "trial:notes", value: e.trialNotes, onchange: (/** @type {Event} */ ev) => change((x) => ({ ...x, trialNotes: /** @type {HTMLTextAreaElement} */ (ev.target).value })) })),
        h("p", { class: "actions" }, button("Revise the draft in Edit", { "data-key": "go:edit", onclick: () => setView("edit") }))) : null,
      h("section", { class: "card", "aria-labelledby": "scenarios-title" },
        h("h3", { id: "scenarios-title" }, "Scenarios in the examples"),
        h("ul", null, EXAMPLES.map((/** @type {any} */ x) => h("li", null, h("strong", null, x.title), `: ${x.scenario} `, button("Use this example", { "data-key": `exercise:example:${x.id}`, "aria-label": `Use the example ${x.title}`, onclick: () => useExample(x.id) }))))),
      h("section", { class: "card", "aria-labelledby": "principles-title" },
        h("h3", { id: "principles-title" }, "Checklist principles"),
        h("ul", null, DATA.principles.map((/** @type {string} */ x) => h("li", null, x)))),
    ];
  }

  /* Files */

  /** @param {string} label @param {string} id @param {(file: File) => void} onFile @param {string} accept */
  const fileButton = (label, id, onFile, accept) => h("label", { class: "btn file-btn", for: id }, label,
    h("input", { type: "file", id, "data-key": `file:${id}`, accept, onchange: (/** @type {Event} */ ev) => {
      const input = /** @type {HTMLInputElement} */ (ev.target);
      const file = input.files?.[0];
      input.value = "";
      if (file) onFile(file);
    } }));

  function filesView() {
    const e = entry();
    const accept = ".md,.markdown,.txt,text/markdown,text/plain";
    return [
      heading("Files"),
      h("section", { class: "card", "aria-labelledby": "export-title" },
        h("h3", { id: "export-title" }, "Export"),
        e ? [
          h("p", { class: "small" }, `Markdown holds the readable checklist and, in one comment, the complete state of “${or(e.checklist.title, "Untitled checklist")}”: its definition, revision, reviewer records and any Run progress. The Beam MD Switch deck presents the checklist as slides and carries the same state.`),
          h("p", { class: "actions" },
            button("Export Markdown", { class: "primary", "data-key": "export:md", onclick: exportMarkdown }),
            button("Copy Markdown", { "data-key": "export:copy", onclick: copyMarkdown }),
            button("Export Beam MD Switch", { id: "export-deck", "data-key": "export:deck", onclick: exportDeck }),
            button("Print checklist", { "data-key": "export:print", onclick: () => print() })),
        ] : h("p", { class: "muted" }, "Open or create a checklist to export it.")),
      h("section", { class: "card", "aria-labelledby": "import-title" },
        h("h3", { id: "import-title" }, "Import"),
        h("p", { class: "small" }, "Files are read on this device and checked (size, syntax, schema, ids, references, results and categories) before anything changes. The limit is 1 MiB; a larger file is refused, never cut. Imported text is shown as text: no HTML, script or link in it runs."),
        h("p", { class: "actions" },
          fileButton("Import Markdown", "import-md", (f) => readImport(f, "markdown"), accept),
          fileButton("Import Beam MD Switch", "import-deck", (f) => readImport(f, "deck"), accept),
          fileButton("Import plain Markdown as a draft", "import-plain", (f) => readImport(f, "plain"), accept)),
        ui.importError ? h("div", { class: "exception", role: "alert", "data-testid": "import-error" },
          h("h4", null, "Import refused"),
          h("p", null, ui.importError.message),
          h("p", { class: "small" }, "Your current draft and Run are unchanged."),
          h("p", { class: "actions" },
            ui.importError.plain ? button("Import as a plain Markdown draft instead", { "data-key": "import:as-plain", onclick: () => { const text = ui.importError?.text ?? ""; ui.importError = null; preparePlain(text, /^---\n/.test(text) ? "deck" : "markdown"); } }) : null,
            button("Dismiss", { "data-key": "import:dismiss", onclick: () => { ui.importError = null; render(); } }))) : null,
        ui.pending ? importPreview() : null),
      h("section", { class: "card", "aria-labelledby": "saved-title" },
        h("h3", { id: "saved-title" }, "Saved on this device"),
        h("p", { class: "small" }, storage.mode === "ok" ? `${lib.checklists.length} ${lib.checklists.length === 1 ? "checklist is" : "checklists are"} saved in this browser after every change.` : `Progress is not saved. ${storage.reason}`),
        h("p", { class: "actions" },
          e ? button("Delete checklist", { class: "danger", "data-key": "delete:one", onclick: deleteChecklist }) : null,
          button("Delete all saved data", { class: "danger", "data-key": "delete:all", onclick: deleteAll }))),
      h("section", { class: "card", "aria-labelledby": "profile-title" },
        h("h3", { id: "profile-title" }, "The Markdown profile"),
        h("ul", { class: "small" },
          h("li", null, `An export is the readable checklist, then one comment that starts “${F.MARKER}” and holds the state as JSON with schema version ${M.SCHEMA_VERSION}. Both come from the same state, so equal states give equal files.`),
          h("li", null, "On import the readable part must be exactly what the state gives; if someone edited one without the other, the import is refused and the plain draft import is offered."),
          h("li", null, "Plain Markdown: “#” is the title, “##” a pause point (“Pause point 2: Name (Read–Do)” is read as written), and list or task-list entries become normal steps. Other headings and text are listed as unsupported."),
          h("li", null, "Plain imports start with fresh progress and set no critical status, recovery route, reviewer record or completed work."))),
    ];
  }

  function importPreview() {
    const pending = ui.pending;
    const e = entry();
    if (pending.kind === "lossless") {
      const s = pending.summary;
      const hasProgress = Boolean(pending.entry.run);
      const chosen = !hasProgress || ui.progress !== "";
      return h("div", { class: "preview-box card", "data-testid": "import-preview" },
        h("h4", null, `Preview: ${pending.profile === "deck" ? "Beam MD Switch" : "Markdown"} file from this tool, restored exactly`),
        h("dl", { class: "readout" },
          h("dt", null, "Title"), h("dd", null, or(s.title, "Untitled checklist")),
          h("dt", null, "Revision"), h("dd", null, String(s.revision)),
          h("dt", null, "Pause points"), h("dd", null, h("ol", null, s.pausePoints.map((/** @type {any} */ p) => h("li", null, `${or(p.title, "untitled")} (${M.MODE_LABEL[p.mode]}): ${p.steps} steps, ${p.checks} critical checks`)))),
          h("dt", null, "Reviewer records"), h("dd", null, `${s.reviewers} (user supplied, not verified)`),
          h("dt", null, "Run progress"), h("dd", null, s.progress || "none")),
        s.example ? h("p", null, exampleTag()) : null,
        hasProgress ? h("fieldset", null, h("legend", null, "The file holds Run progress. Choose:"),
          h("label", { class: "tick" }, h("input", { type: "radio", name: "progress", value: "restore", "data-key": "import:restore", checked: ui.progress === "restore", onchange: () => { ui.progress = "restore"; render(); } }), "Restore the progress; you confirm the pause point before continuing"),
          h("label", { class: "tick" }, h("input", { type: "radio", name: "progress", value: "fresh", "data-key": "import:fresh", checked: ui.progress === "fresh", onchange: () => { ui.progress = "fresh"; render(); } }), "Discard the progress and start a fresh Run later")) : null,
        importButtons(e, chosen));
    }
    const r = pending.recognized;
    return h("div", { class: "preview-box card", "data-testid": "import-preview" },
      h("h4", null, `Preview: plain ${pending.profile === "deck" ? "deck" : "Markdown"} as a new draft`),
      h("dl", { class: "readout" },
        h("dt", null, "Title"), h("dd", null, or(r.title, "(none: add one in Edit)")),
        h("dt", null, "Pause points"), h("dd", null, r.pausePoints.length ? h("ol", null, r.pausePoints.map((/** @type {any} */ p) => h("li", null, `${or(p.title, "unnamed")} (${M.MODE_LABEL[p.mode]}): ${p.items.length} draft ${p.items.length === 1 ? "step" : "steps"}`, h("ul", { class: "small" }, p.items.map((/** @type {string} */ t) => h("li", null, t)))))) : "none recognised")),
      h("ul", { class: "small" }, pending.notes.map((/** @type {string} */ x) => h("li", null, x))),
      pending.unsupported.length ? h("details", { open: true }, h("summary", null, `Unsupported content, not imported (${pending.unsupported.length} lines)`),
        h("ul", { class: "unsupported" }, pending.unsupported.map((/** @type {any} */ u) => h("li", null, `${u.line ? `line ${u.line}: ` : ""}${u.text}`)))) : h("p", { class: "small muted" }, "No unsupported content."),
      importButtons(e, r.pausePoints.length > 0));
  }

  /** @param {any} e @param {boolean} ready */
  function importButtons(e, ready) {
    return h("p", { class: "actions" },
      button("Create copy", { class: "primary", "data-key": "import:copy", disabled: !ready, onclick: () => applyImport("copy") }),
      e ? button("Replace current checklist", { class: "danger", "data-key": "import:replace", disabled: !ready, onclick: () => applyImport("replace") }) : null,
      button("Cancel", { "data-key": "import:cancel", onclick: () => { ui.pending = null; ui.progress = ""; render(); } }));
  }

  /** @param {File} file @param {"markdown" | "deck" | "plain"} kind */
  async function readImport(file, kind) {
    ui.pending = null;
    ui.importError = null;
    ui.progress = "";
    let text = "";
    try {
      F.checkSize(file.size);
      text = await file.text();
      if (kind === "plain") return preparePlain(text, /^\uFEFF?---\r?\n/.test(text) ? "deck" : "markdown");
      ui.pending = F.parseFile(text, kind);
      say(ui.pending.kind === "lossless" ? `Read ${file.name}. Check the preview, then choose Create copy or Replace current checklist.` : `${file.name} carries no state from this tool, so it is shown as a plain draft.`);
    } catch (e) {
      ui.importError = { message: `${file.name}: ${msg(e)}`, plain: Boolean(/** @type {any} */ (e).plain), text };
      say("The import was refused; nothing changed.", true);
    }
    render();
  }

  /** @param {string} text @param {"markdown" | "deck"} profile */
  function preparePlain(text, profile) {
    try {
      F.checkSize(new TextEncoder().encode(text).length);
      ui.pending = F.plain(text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"), profile);
      say("Read as a plain draft. Check the recognised pause points and the unsupported lines.");
    } catch (e) {
      ui.importError = { message: msg(e), plain: false, text: "" };
    }
    render();
  }

  /** @param {"copy" | "replace"} how */
  async function applyImport(how) {
    const pending = ui.pending;
    const current = entry();
    if (!pending) return;
    if (how === "replace" && current && !(await ask(`Replace “${or(current.checklist.title, "Untitled checklist")}” with the imported checklist? Its draft, reviewer records and Run progress are removed.`, "Replace checklist"))) return;
    /** @type {any} */
    let next;
    if (pending.kind === "lossless") {
      const run = pending.entry.run && ui.progress === "restore" ? M.holdForConfirmation(pending.entry.run, "imported") : null;
      next = { ...pending.entry, run };
    } else {
      const made = M.newId(lib);
      lib = { ...lib, seq: made.seq };
      next = M.entryOf(F.draftFromPlain(pending.recognized, made.id, pending.text));
    }
    setLibrary(how === "replace" ? M.replaceActive(lib, next) : M.addEntry(lib, next), how === "replace" ? "The current checklist was replaced by the import." : "The import was added as a new checklist.");
    ui.pending = null;
    ui.progress = "";
    setView(next.run ? "run" : "edit");
  }

  async function deleteChecklist() {
    const e = entry();
    if (!e || !(await ask(`Delete “${or(e.checklist.title, "Untitled checklist")}” from this device, with its reviewer records and Run progress? Export it first to keep a copy.`, "Delete checklist"))) return;
    setLibrary(M.removeEntry(lib, e.checklist.id), "The checklist was deleted from this device.");
    setView("start");
  }

  async function deleteAll() {
    if (!(await ask("Delete all saved data of this tool from this device: every checklist, reviewer record and Run? The site's theme choice is kept.", "Delete all saved data"))) return;
    try {
      store.removeItem(M.STORAGE_KEY);
      storage = { mode: "ok", reason: "" };
    } catch {
      storage = { mode: "unavailable", reason: "The browser refused to change storage here." };
    }
    lib = M.emptyLibrary();
    persist();
    say("All saved data of this tool was deleted from this device.");
    setView("start");
  }

  /* ---------- INTERACTIONS ---------- */

  /**
   * A confirmation dialog for anything that removes retained data or reports a condition.
   * @param {string} text @param {string} action
   * @returns {Promise<boolean>}
   */
  function ask(text, action) {
    const dialog = /** @type {HTMLDialogElement} */ ($("confirm"));
    $("confirm-title").textContent = action;
    $("confirm-text").textContent = text;
    $("confirm-ok").textContent = action;
    return new Promise((resolve) => {
      dialog.returnValue = "";
      dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });
      dialog.showModal();
      $("confirm-cancel").focus();
    });
  }

  /** @param {string} name @param {string} body */
  function download(name, body) {
    const url = URL.createObjectURL(new Blob([body], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportMarkdown() {
    const e = entry();
    if (!e) return;
    const name = `${F.fileName(e.checklist.title)}.md`;
    try {
      download(name, F.toMarkdown(e));
      say(`Exported ${name}.`);
    } catch (err) {
      say(`Could not save ${name} here: ${msg(err)}`, true);
    }
    render();
  }

  async function copyMarkdown() {
    const e = entry();
    if (!e) return;
    const text = F.toMarkdown(e);
    try {
      await navigator.clipboard.writeText(text);
      say("Copied the Markdown, with its state, to the clipboard.");
    } catch {
      const area = h("textarea", { class: "visually-hidden", "aria-hidden": "true" });
      area.value = text;
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      say(ok ? "Copied the Markdown, with its state, to the clipboard." : "Could not copy here: use Export Markdown instead.", !ok);
    }
    render();
  }

  function exportDeck() {
    const e = entry();
    if (!e) return;
    const name = `${F.fileName(e.checklist.title)}.beamdswitch.md`;
    try {
      download(name, F.toDeck(e));
      say(`Exported ${name}: open it in beamdswitch. It presents the checklist; it is not a Run.`);
    } catch (err) {
      say(`Could not export the deck: ${msg(err)}`, true);
    }
    render();
  }

  /** The URL fragment names a view and, on Start, a bundled example; never content or progress. */
  function readHash() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    const view = params.get("view") ?? "";
    const example = params.get("example") ?? "";
    return { view: M.VIEWS.includes(view) ? view : "", example: EXAMPLES.some((/** @type {any} */ x) => x.id === example) ? example : "", known: params.has("view") || params.has("example") };
  }

  /** @param {string} view */
  function hashOf(view) {
    const parts = [];
    if (view !== "start") parts.push(`view=${view}`);
    if (view === "start" && ui.example) parts.push(`example=${ui.example}`);
    return parts.length ? `#${parts.join("&")}` : "";
  }

  /** @param {string} view @param {boolean} [push] */
  function setView(view, push = true) {
    ui.view = view;
    ui.viewing = "";
    ui.reportOpen = false;
    lib = { ...lib, view };
    persist();
    if (push) {
      const url = location.pathname + location.search + hashOf(view);
      if (url !== location.pathname + location.search + location.hash) {
        try { history.pushState(null, "", url); } catch { /* file:// or a sandboxed frame: the view still works */ }
      }
    }
    const keep = ui.focusTarget;
    render();
    if (!keep) {
      $("view-title")?.focus({ preventScroll: true });
      $("app").scrollIntoView?.({ block: "start" });
    }
  }

  function onHash() {
    const s = readHash();
    if (!s.known && location.hash) return;
    ui.example = s.example;
    ui.view = s.view || "start";
    ui.viewing = "";
    render();
    if (ui.example) document.querySelector(`[data-example-card="${ui.example}"]`)?.scrollIntoView({ block: "center" });
  }

  /** The palette's commands, from the state: views, examples, exports, the library and every item. */
  function commands() {
    const e = entry();
    /** @type {{ label: string, run: () => void }[]} */
    const list = [
      ...M.VIEWS.map((/** @type {string} */ v) => ({ label: `Go to ${v[0].toUpperCase()}${v.slice(1)}`, run: () => setView(v) })),
      { label: "New blank checklist", run: newBlank },
      ...EXAMPLES.map((/** @type {any} */ x) => ({ label: `Use example: ${x.title}`, run: () => useExample(x.id) })),
      ...lib.checklists.filter((/** @type {any} */ x) => x.checklist.id !== lib.active).map((/** @type {any} */ x) => ({ label: `Open checklist: ${or(x.checklist.title, "Untitled checklist")}`, run: () => { lib = { ...lib, active: x.checklist.id }; persist(); setView("edit"); } })),
    ];
    if (e) {
      list.push(
        { label: "Export Markdown", run: exportMarkdown },
        { label: "Copy Markdown", run: () => { copyMarkdown(); } },
        { label: "Export Beam MD Switch", run: exportDeck },
        { label: "Print checklist", run: () => print() },
        { label: "Add pause point", run: () => { setView("edit"); editDef((x) => { ui.focusTarget = M.addPausePoint(x); }); } },
      );
      if (M.deriveDraft(e).canStart) list.push({ label: "Start a Run", run: () => { startRun(); } });
      if (e.run) list.push({ label: "Reset Run", run: () => { resetRun(); } });
      for (const i of M.items(e.checklist)) list.push({ label: `Edit item: ${or(i.text, "(no text)")}`, run: () => { ui.focusTarget = i.id; setView("edit"); } });
    }
    return list;
  }

  function palette() {
    const dialog = /** @type {HTMLDialogElement} */ ($("palette"));
    const input = /** @type {HTMLInputElement} */ ($("palette-input"));
    const list = $("palette-list");
    const matches = () => commands().filter((c) => c.label.toLowerCase().includes(input.value.trim().toLowerCase())).slice(0, 40);
    /** @param {{ run(): void }} c */
    const run = (c) => { dialog.close(); c.run(); };
    const show = () => list.replaceChildren(...matches().map((c, i) => h("li", null, h("button", { type: "button", role: "option", "aria-selected": String(i === 0), onclick: () => run(c) }, c.label))));
    const open = () => {
      input.value = "";
      show();
      if (!dialog.open) dialog.showModal();
      input.focus();
    };
    input.addEventListener("input", show);
    input.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      const first = matches()[0];
      if (first) run(first);
    });
    addEventListener("keydown", (ev) => {
      if (ev.key.toLowerCase() !== "k" || !(ev.metaKey || ev.ctrlKey) || ev.altKey) return;
      ev.preventDefault();
      open();
    });
    $("open-palette").addEventListener("click", open);
  }

  /** Read-only WebMCP tools. A browser without WebMCP has no modelContext, and the page works the same. */
  function registerTools() {
    const mc = /** @type {any} */ (document).modelContext || /** @type {any} */ (navigator).modelContext;
    if (!mc || typeof mc.registerTool !== "function") return;
    /** @param {unknown} value */
    const out = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
    const ro = { readOnlyHint: true };
    const none = { type: "object", properties: {}, additionalProperties: false };
    mc.registerTool({ name: "get_metadata", description: "Return the tool's title, schema version, the five categories, modes, result values, design targets and the bundled example ids.", inputSchema: none, annotations: ro,
      execute: async () => out({ title: "Checklist Manifesto Maker", format: M.FORMAT, schemaVersion: M.SCHEMA_VERSION, categories: M.CATEGORIES, modes: M.MODES, stepResults: M.STEP_RESULTS, checkResults: M.CHECK_RESULTS, targets: M.TARGET, views: M.VIEWS, examples: EXAMPLES.map((/** @type {any} */ x) => x.id) }) });
    mc.registerTool({ name: "get_checklist", description: "Return the current checklist's draft definition, revision, reviewer records and its derived counts and draft issues.", inputSchema: none, annotations: ro,
      execute: async () => { const e = entry(); return out(e ? { checklist: e.checklist, reviewers: e.reviewers, reviewedRevision: e.reviewedRevision, derived: M.deriveDraft(e) } : null); } });
    mc.registerTool({ name: "get_run", description: "Return the current Run: its fixed revision, results, reports, recovery and the progress gate at the current pause point.", inputSchema: none, annotations: ro,
      execute: async () => { const e = entry(); return out(e?.run ? { run: e.run, derived: M.deriveRun(e.run) } : null); } });
    mc.registerTool({ name: "get_markdown", description: "Return the current checklist as the lossless Markdown export: the readable checklist and its embedded state.", inputSchema: none, annotations: ro,
      execute: async () => { const e = entry(); return out(e ? { markdown: F.toMarkdown(e) } : null); } });
    mc.registerTool({ name: "get_example", description: "Return one bundled example checklist by id, with its summary and failed-check scenario.", annotations: ro,
      inputSchema: { type: "object", properties: { id: { type: "string", enum: EXAMPLES.map((/** @type {any} */ x) => x.id) } }, required: ["id"], additionalProperties: false },
      execute: async (/** @type {{ id: string }} */ args) => out(EXAMPLES.find((/** @type {any} */ x) => x.id === args?.id) ?? { error: `No example ${String(args?.id)}.` }) });
  }

  /* ---------- INITIALIZATION ---------- */

  const loaded = M.loadLibrary(store);
  lib = loaded.lib;
  storage = loaded.status;
  const start = readHash();
  ui.example = start.example;
  ui.view = start.view || (start.example ? "start" : lib.view);
  if (storage.mode === "blocked") say(`${storage.reason} This session is kept in memory only.`, true);
  else if (loaded.restored) say("Restored from this device. A Run in progress waits for you to confirm its current pause point.");
  for (const b of document.querySelectorAll("nav.views [data-view]")) b.addEventListener("click", () => setView(/** @type {string} */ (b.getAttribute("data-view"))));
  /** @type {HTMLElement} */ (document.querySelector("nav.views")).hidden = false;
  addEventListener("popstate", onHash);
  addEventListener("hashchange", onHash);
  palette();
  registerTools();
  render();
  if (ui.example) document.querySelector(`[data-example-card="${ui.example}"]`)?.scrollIntoView({ block: "center" });
})();
