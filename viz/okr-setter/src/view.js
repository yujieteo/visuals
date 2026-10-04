/* OKR Setter: the views. This file is the visual's own: it builds the form, draws the page from the state (§5)
 * and adds the domain's controls, WebMCP tools and palette commands. The kit (VisualKit.start) owns the state,
 * the URL, Back and Forward, Reset, the JSON, Markdown and beamdswitch exports, the command palette and the
 * shared WebMCP tools. The text and number inputs are bound here, not by the kit, because the kit ignores an
 * emptied field and an emptied name must clear its key result.
 */
(function () {
  "use strict";

  const D = JSON.parse(/** @type {HTMLElement} */ (document.getElementById("dataset")).textContent ?? "{}");
  /** @param {string} id @returns {any} */
  const $ = (id) => document.getElementById(id);

  /**
   * An element with attributes and children.
   * @param {string} tag @param {Record<string, string>} attrs @param {(Node | string)[]} [kids]
   */
  function el(tag, attrs, kids = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    node.append(...kids);
    return node;
  }

  /** The inputs that carry a field, in field order. @type {{ key: string, input: HTMLInputElement | HTMLSelectElement }[]} */
  const inputs = [];

  /**
   * A labelled input bound to a field.
   * @param {string} key @param {string} text @param {"text" | "number" | "date" | "select"} type @param {string} [cls]
   */
  function control(key, text, type, cls = "") {
    let input;
    if (type === "select") {
      input = el("select", { id: key }, [el("option", { value: "value" }, ["Number"]), el("option", { value: "score" }, ["Score 0 to 1"])]);
    } else if (type === "number") input = el("input", { id: key, type: "number", step: "any", inputmode: "decimal" });
    else if (type === "date") input = el("input", { id: key, type: "date" });
    else input = el("input", { id: key, type: "text", maxlength: "200", autocomplete: "off" });
    inputs.push({ key, input: /** @type {any} */ (input) });
    return el("label", { class: `field-label ${cls}`.trim(), for: key }, [text, input]);
  }

  /** @param {string} label */
  const bar = (label) => el("div", { class: "bar", role: "progressbar", "aria-label": label, "aria-valuemin": "0", "aria-valuemax": "100" }, [el("div", { class: "fill" })]);

  /** @type {{ card: HTMLElement, bar: HTMLElement, sum: HTMLElement, grade: HTMLElement, checks: HTMLElement, krs: { row: HTMLElement, bar: HTMLElement, sum: HTMLElement, checks: HTMLElement, hide: HTMLElement[], slider: HTMLElement }[] }[]} */
  const parts = [];
  for (let o = 1; o <= Model.OBJECTIVES; o++) {
    const title = el("label", { class: "field-label", for: Model.titleKey(o) }, [`Objective ${o}`]);
    const titleInput = el("input", { id: Model.titleKey(o), class: "obj-title", type: "text", maxlength: "200", autocomplete: "off", placeholder: "What do you want to achieve?" });
    title.append(titleInput);
    inputs.push({ key: Model.titleKey(o), input: /** @type {any} */ (titleInput) });
    const typeLabel = el("label", { class: "field-label", for: Model.typeKey(o) }, ["Type",
      el("select", { id: Model.typeKey(o) }, [el("option", { value: "aspirational" }, ["Aspirational: stretch, 0.6 to 0.7 is the aim"]), el("option", { value: "committed" }, ["Committed: expected to reach 1.0"])])]);
    inputs.push({ key: Model.typeKey(o), input: /** @type {any} */ (typeLabel.lastElementChild) });
    const objBar = bar(`Objective ${o} progress`), objSum = el("p", { class: "sum" }), objGrade = el("p", { class: "sum" }), objChecks = el("ul", { class: "checks", "aria-label": `Objective ${o} checks` });
    const card = el("section", { class: "card objective", "aria-label": `Objective ${o}` }, [title, typeLabel, objBar, objSum, objGrade]);
    const krs = [];
    for (let k = 1; k <= Model.KEY_RESULTS; k++) {
      const key = (/** @type {string} */ part) => Model.krKey(o, k, part);
      const hide = [control(key("start"), "Start", "number"), control(key("target"), "Target", "number"), control(key("unit"), "Unit", "text"), control(key("current"), "Current", "number")];
      // A score is set with a slider, which the kit binds through data-field; the number inputs are for a value.
      const slider = el("label", { class: "field-label", for: `o${o}_k${k}_slider` }, ["Current score",
        el("input", { id: `o${o}_k${k}_slider`, type: "range", min: "0", max: "1", step: "0.05", "data-field": key("current") })]);
      const krBar = bar(`Objective ${o}, key result ${k} progress`), krSum = el("p", { class: "sum" }), krChecks = el("ul", { class: "checks" });
      const row = el("div", { class: "kr" }, [
        control(key("name"), `Key result ${k}`, "text"),
        el("div", { class: "grid" }, [control(key("kind"), "Kind", "select"), slider, ...hide]),
        el("div", { class: "grid" }, [control(key("owner"), "Owner (optional)", "text"), control(key("due"), "Due date (optional)", "date")]),
        krBar, krSum, krChecks,
      ]);
      card.append(row);
      krs.push({ row, bar: krBar, sum: krSum, checks: krChecks, hide, slider });
    }
    card.append(el("h3", {}, ["Checks"]), objChecks);
    $("objectives").append(card);
    parts.push({ card, bar: objBar, sum: objSum, grade: objGrade, checks: objChecks, krs });
  }

  /** @param {HTMLElement} node @param {number | null} progress @param {string} text */
  function setBar(node, progress, text) {
    const fill = /** @type {HTMLElement} */ (node.firstElementChild);
    fill.style.width = progress === null ? "0%" : `${Math.round(progress * 100)}%`;
    node.classList.toggle("done", progress !== null && progress >= 1);
    if (progress === null) node.removeAttribute("aria-valuenow");
    else node.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    node.setAttribute("aria-valuetext", text);
  }

  /** A link to a rule's source. @param {string} id */
  const source = (id) => {
    const found = /** @type {Record<string, { title: string, url: string }>} */ (Model.SOURCES)[id];
    return el("a", { href: found.url, rel: "noopener" }, [`Source: ${found.title.split(" (")[0]}`]);
  };

  /** @param {HTMLElement} list @param {{ pass: boolean, label: string, source: string, detail: string }[]} checks @param {boolean} onlyFix */
  function setChecks(list, checks, onlyFix) {
    const shown = onlyFix ? checks.filter((c) => !c.pass) : checks;
    list.replaceChildren(...shown.map((c) => el("li", {}, [el("span", { class: `mark ${c.pass ? "pass" : "fix"}` }, [c.pass ? "Pass" : "Fix"]), `${c.label}. ${c.detail} `, source(c.source)])));
  }

  /** Draw everything from the state. @param {Record<string, any>} state @param {ReturnType<typeof Model.derive>} d */
  function render(state, d) {
    for (const { key, input } of inputs) if (input !== document.activeElement) input.value = String(state[key]);
    d.objectives.forEach((ob, i) => {
      const part = parts[i];
      part.card.hidden = !(ob.shown || i === 0 || d.objectives[i - 1].shown);
      setBar(part.bar, ob.progress, ob.text.progress);
      part.sum.textContent = ob.progress === null ? "Objective progress: no progress yet" : `Objective progress: ${ob.text.progress}, score ${ob.text.score}`;
      part.grade.textContent = ob.grade ?? "";
      setChecks(part.checks, ob.checks, false);
      ob.slots.forEach((kr, j) => {
        const slot = part.krs[j];
        slot.row.hidden = !(j === 0 || kr.used || ob.slots[j - 1].used);
        for (const node of slot.hide) node.hidden = kr.kind === "score";
        slot.slider.hidden = kr.kind !== "score";
        setBar(slot.bar, kr.progress, kr.text.progress);
        slot.bar.hidden = slot.sum.hidden = slot.checks.hidden = !kr.used;
        slot.sum.textContent = kr.used ? `${kr.text.current} now, from ${kr.text.start} to ${kr.text.target}: ${kr.text.progress}` : "";
        setChecks(slot.checks, kr.checks, true);
      });
    });
    setBar($("overall-bar"), d.progress, d.text.progress);
    $("overall-progress").textContent = d.text.progress;
    $("overall-counts").textContent = `across ${d.objectiveCount} objective${d.objectiveCount === 1 ? "" : "s"} and ${d.keyResultCount} key result${d.keyResultCount === 1 ? "" : "s"}`;
    $("overall-checks").textContent = d.text.checks;
    $("toon").textContent = Model.toToon(d);
    for (const b of document.querySelectorAll("[data-example]")) {
      const example = Model.EXAMPLES.find((/** @type {KitExample} */ e) => e.id === b.getAttribute("data-example"));
      b.setAttribute("aria-pressed", String(example !== undefined && Object.entries(example.state).every(([k, v]) => state[k] === v)));
    }
  }

  $("rules").replaceChildren(...D.rules.map((/** @type {{ source: string, text: string }} */ r) => el("li", {}, [`${r.text} `, source(r.source)])));
  $("examples").replaceChildren(...Model.EXAMPLES.map((/** @type {KitExample} */ e) => el("button", { type: "button", "data-example": e.id }, [e.label])));

  /** @param {KitExample} example */
  const summary = (example) => {
    const state = VisualKit.normalize(Model.FIELDS, example.state).state;
    const d = Model.derive(state);
    return { id: example.id, label: example.label, objectives: d.objectives.filter((ob) => ob.shown).map((ob) => ({ title: ob.title, type: ob.type, progress: ob.progress, grade: ob.grade, keyResults: ob.krs.map((kr) => ({ name: kr.name, progress: kr.progress })) })), progress: d.progress, checks: d.checks };
  };

  /** The domain's read-only WebMCP tools; the kit adds get_metadata, get_state and get_markdown. @type {KitTool[]} */
  const tools = [
    { name: "get_example", description: "Return one named example: its id, label, the values the page derives from it and its progress per objective and key result.",
      inputSchema: { type: "object", properties: { id: { type: "string", enum: Model.EXAMPLES.map((/** @type {KitExample} */ e) => e.id) } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ id?: string }} */ input = {}) => {
        const example = Model.EXAMPLES.find((/** @type {KitExample} */ e) => e.id === input.id);
        return { content: [{ type: "text", text: JSON.stringify(example ? summary(example) : { error: "unknown example id" }, null, 2) }] };
      } },
    { name: "get_toon", description: "Return the current OKR set as TOON: objectives, key results and checks.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true },
      execute: async () => ({ content: [{ type: "text", text: Model.toToon(VisualKit.app.derived) }] }) },
  ];

  const app = VisualKit.start({
    slug: Model.SLUG,
    title: document.title,
    summary: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    schemaVersion: Model.SCHEMA_VERSION,
    fields: Model.FIELDS,
    derive: (state) => Model.derive(state),
    render,
    report: (state, d) => Report.report(state, d),
    tools,
    commands: [
      ...Model.EXAMPLES.map((/** @type {KitExample} */ e) => ({ label: `Example: ${e.label}`, run: () => app.set(e.state) })),
      { label: "Copy TOON", run: () => copyToon() },
      { label: "Save TOON", run: () => saveToon() },
    ],
    bind(app) {
      for (const b of document.querySelectorAll("[data-example]")) {
        const example = Model.EXAMPLES.find((/** @type {KitExample} */ e) => e.id === b.getAttribute("data-example"));
        if (example) b.addEventListener("click", () => app.set(example.state));
      }
      for (const { key, input } of inputs) {
        const live = input instanceof HTMLInputElement && (input.type === "text" || input.type === "number");
        // A text or number input updates as it is typed and keeps one Back entry; an emptied number is ignored.
        if (live) input.addEventListener("input", () => { if (input.type === "text" || input.value !== "") app.set({ [key]: input.value }, "replace"); });
        input.addEventListener("change", () => { if (input.type === "text" || input.type === "date" || input.value !== "") app.set({ [key]: input.value }); });
      }
    },
  });

  const toon = () => Model.toToon(app.derived);
  const say = (/** @type {string} */ line) => { $("export-status").textContent = line; };
  async function copyToon() {
    try {
      await navigator.clipboard.writeText(toon());
      say("Copied the OKR set as TOON.");
    } catch {
      say("Could not copy here: use Save .toon instead.");
    }
  }
  function saveToon() {
    try {
      const url = URL.createObjectURL(new Blob([toon()], { type: "text/plain" }));
      const a = el("a", { href: url, download: `${Model.SLUG}.toon` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say(`Saved ${Model.SLUG}.toon.`);
    } catch (e) {
      say(`Could not save ${Model.SLUG}.toon here: ${String(e)}`);
    }
  }
  $("copy-toon").addEventListener("click", copyToon);
  $("save-toon").addEventListener("click", saveToon);
})();
