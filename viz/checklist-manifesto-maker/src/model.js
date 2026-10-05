/* Checklist Manifesto Maker: the model. Pure: no DOM, storage, clock or network, and no input is mutated.
 *
 *   SCHEMA      the semantic state, its version and the migration table
 *   DEFINITION  a checklist's content: pause points, the five categories and their links, with stable ids
 *   EDIT        content edits; any content change makes a new revision
 *   REVIEW      draft issues, reviewer records and whether a Run may start
 *   RUN         a Run against a fixed revision: results, gates, reports, recovery and restart
 *   VALIDATE    strict validation of a stored library or an imported checklist before any mutation
 *
 * The page inlines this file unchanged in <script id="model"> (self.ChecklistModel); node tests load it with
 * require(). Nothing here decides whether a procedure is safe: it records what the person reports and applies
 * the authored rules for progress.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ChecklistModel = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- SCHEMA ---------- */

  const FORMAT = "checklist-manifesto-maker";
  const SCHEMA_VERSION = 1;
  const MODES = ["read-do", "do-confirm"];
  const MODE_LABEL = { "read-do": "Read–Do", "do-confirm": "Do–Confirm", "": "Mode not chosen" };
  const MODE_HELP = {
    "read-do": "Read each item, do the action, then record its result.",
    "do-confirm": "Complete the work, then use the checklist to confirm the required items.",
    "": "Choose Read–Do or Do–Confirm in Edit.",
  };
  const KINDS = ["step", "check"];
  const STEP_RESULTS = ["pending", "done"];
  const CHECK_RESULTS = ["pending", "passed", "failed", "unknown", "not-applicable"];
  const RESULT_LABEL = { pending: "No result", done: "Done", passed: "Passed", failed: "Failed", unknown: "Unknown", "not-applicable": "Not applicable" };
  const CATEGORIES = [
    ["step", "Normal step", "An action that the user marks as done."],
    ["check", "Critical check", "A check with an explicit result that controls progress."],
    ["stop", "Stop condition", "A condition that interrupts normal progress."],
    ["escalation", "Escalation condition", "A condition that requires help from a named person or role."],
    ["recovery", "Recovery step", "An authored action after a failure or stop."],
  ];
  const RUN_STATUSES = ["active", "complete", "ended"];
  const HOLDS = ["restored", "correction", "imported"];
  const VIEWS = ["start", "edit", "review", "run", "exercises", "files"];
  const TARGET = { min: 5, max: 9, seconds: 60 };
  const LONG_WORDS = 15;
  const ID = /^[a-z][a-z0-9-]{0,63}$/;

  /**
   * Supported older schema versions and how each becomes the current one. Version 1 is the first published
   * schema, so the table is empty; a later version adds its predecessor here and never reads it implicitly.
   * @type {Record<number, (doc: any) => any>}
   */
  const MIGRATIONS = {};

  const clone = (/** @type {any} */ value) => JSON.parse(JSON.stringify(value));
  const same = (/** @type {any} */ a, /** @type {any} */ b) => JSON.stringify(a) === JSON.stringify(b);
  const str = (/** @type {unknown} */ v) => (typeof v === "string" ? v : "");
  const words = (/** @type {string} */ s) => s.trim().split(/\s+/).filter(Boolean).length;
  const norm = (/** @type {string} */ s) => s.trim().replace(/\s+/g, " ").toLowerCase();

  /* ---------- DEFINITION ---------- */

  /** A blank checklist definition. @param {string} id */
  function blank(id) {
    return definition({ id, title: "", revision: 1, pausePoints: [], seq: 1 });
  }

  /**
   * A definition in canonical key order from a raw, already-validated object, so two equal states serialise to the
   * same text whatever order their keys arrived in.
   * @param {any} d
   */
  function definition(d) {
    const details = d.details ?? {};
    return {
      id: d.id,
      title: str(d.title),
      revision: d.revision,
      example: str(d.example),
      requiresReview: d.requiresReview === true,
      details: {
        intendedUsers: str(details.intendedUsers),
        equipment: str(details.equipment),
        applicability: str(details.applicability),
        sources: str(details.sources),
        notes: str(details.notes),
      },
      originalText: str(d.originalText),
      pausePoints: (d.pausePoints ?? []).map((/** @type {any} */ p) => ({
        id: p.id,
        title: str(p.title),
        mode: str(p.mode),
        details: str(p.details),
        items: (p.items ?? []).map(item),
      })),
      stopConditions: (d.stopConditions ?? []).map((/** @type {any} */ c) => ({ id: c.id, text: str(c.text), instruction: str(c.instruction), escalation: str(c.escalation), at: [...(c.at ?? [])] })),
      escalationConditions: (d.escalationConditions ?? []).map((/** @type {any} */ c) => ({ id: c.id, text: str(c.text), contact: str(c.contact), action: str(c.action), at: [...(c.at ?? [])] })),
      recoveryRoutes: (d.recoveryRoutes ?? []).map((/** @type {any} */ r) => ({
        id: r.id,
        title: str(r.title),
        triggers: [...(r.triggers ?? [])],
        steps: (r.steps ?? []).map((/** @type {any} */ s) => ({ id: s.id, text: str(s.text) })),
        restartChecks: (r.restartChecks ?? []).map((/** @type {any} */ s) => ({ id: s.id, text: str(s.text) })),
        restartAt: str(r.restartAt),
      })),
      none: { stop: d.none?.stop === true, escalation: d.none?.escalation === true, recovery: d.none?.recovery === true },
      seq: d.seq,
    };
  }

  /** An item in canonical key order: critical checks carry their applicability rule and failure instruction. @param {any} i */
  function item(i) {
    const base = { id: i.id, kind: i.kind, text: str(i.text), details: str(i.details), required: i.required !== false, dependsOn: [...(i.dependsOn ?? [])] };
    return i.kind === "check" ? { ...base, applicability: str(i.applicability), ifFailed: str(i.ifFailed) } : base;
  }

  /** Every item of a definition, in order, with its pause point. @param {any} def */
  function items(def) {
    return def.pausePoints.flatMap((/** @type {any} */ p, /** @type {number} */ index) => p.items.map((/** @type {any} */ i) => ({ ...i, pausePoint: p.id, pauseIndex: index })));
  }

  /** Every id a definition uses, with what it names. @param {any} def @returns {Map<string, string>} */
  function ids(def) {
    /** @type {Map<string, string>} */
    const out = new Map();
    const add = (/** @type {string} */ id, /** @type {string} */ what) => { if (!out.has(id)) out.set(id, what); };
    for (const p of def.pausePoints) {
      add(p.id, "pause point");
      for (const i of p.items) add(i.id, i.kind === "check" ? "critical check" : "normal step");
    }
    for (const c of def.stopConditions) add(c.id, "stop condition");
    for (const c of def.escalationConditions) add(c.id, "escalation condition");
    for (const r of def.recoveryRoutes) {
      add(r.id, "recovery route");
      for (const s of r.steps) add(s.id, "recovery step");
      for (const s of r.restartChecks) add(s.id, "restart check");
    }
    return out;
  }

  /** Find anything in a definition by id. @param {any} def @param {string} id */
  function find(def, id) {
    for (const p of def.pausePoints) {
      if (p.id === id) return { type: "pausePoint", node: p, pausePoint: p };
      for (const i of p.items) if (i.id === id) return { type: "item", node: i, pausePoint: p };
    }
    for (const c of def.stopConditions) if (c.id === id) return { type: "stop", node: c };
    for (const c of def.escalationConditions) if (c.id === id) return { type: "escalation", node: c };
    for (const r of def.recoveryRoutes) {
      if (r.id === id) return { type: "route", node: r };
      for (const s of r.steps) if (s.id === id) return { type: "routeStep", node: s, route: r };
      for (const s of r.restartChecks) if (s.id === id) return { type: "restartCheck", node: s, route: r };
    }
    return null;
  }

  /** Names as a list in a sentence: each without its final full stop, joined by semicolons. @param {any} def @param {string[]} list */
  const names = (def, list) => list.map((id) => nameOf(def, id).replace(/[.]+$/, "")).join("; ");

  /** The short name of anything in a definition, for messages and links. @param {any} def @param {string} id */
  function nameOf(def, id) {
    const hit = find(def, id);
    if (!hit) return id;
    const n = hit.node;
    return (hit.type === "pausePoint" || hit.type === "route" ? n.title : n.text) || `(untitled ${ids(def).get(id)})`;
  }

  /** A fresh id from the definition's counter. @param {any} def @param {string} prefix */
  function mint(def, prefix) {
    const taken = ids(def);
    let id = `${prefix}${def.seq}`;
    while (taken.has(id) || id === def.id) id = `${prefix}${++def.seq}`;
    def.seq += 1;
    return id;
  }

  /* ---------- EDIT ---------- */

  /** The content of a definition without its revision: what a revision is a version of. @param {any} def */
  const content = (def) => JSON.stringify({ ...def, revision: 0 });

  /**
   * Apply an edit to a library entry's definition. A content change makes a new revision, which makes earlier
   * reviewer records and the author's review stale; an active Run keeps its own revision. Returns the same entry
   * when nothing changed.
   * @param {any} entry @param {(def: any) => void} change
   */
  function edit(entry, change) {
    const def = clone(entry.checklist);
    change(def);
    const next = definition(def);
    if (content(next) === content(entry.checklist)) return entry;
    next.revision = entry.checklist.revision + 1;
    return { ...entry, checklist: next };
  }

  const FIELDS = {
    checklist: ["title", "requiresReview", "example"],
    details: ["intendedUsers", "equipment", "applicability", "sources", "notes"],
    pausePoint: ["title", "mode", "details"],
    item: ["text", "details", "required", "applicability", "ifFailed"],
    stop: ["text", "instruction", "escalation"],
    escalation: ["text", "contact", "action"],
    route: ["title", "restartAt"],
    routeStep: ["text"],
    restartCheck: ["text"],
  };

  /**
   * Set one field. `id` names the object (the checklist's own id for its title, "details" for the optional
   * fields); a field the object does not have is refused.
   * @param {any} def @param {string} id @param {string} field @param {unknown} value
   */
  function setField(def, id, field, value) {
    if (id === def.id || id === "details") {
      const group = id === "details" ? "details" : "checklist";
      if (!FIELDS[group].includes(field)) throw new Error(`${field} is not a checklist field.`);
      const target = group === "details" ? def.details : def;
      target[field] = field === "requiresReview" ? value === true : str(value);
      return def;
    }
    const hit = find(def, id);
    if (!hit) throw new Error(`Nothing has the id ${id}.`);
    const allowed = /** @type {Record<string, string[]>} */ (FIELDS)[hit.type];
    if (!allowed.includes(field) || (hit.type === "item" && hit.node.kind !== "check" && (field === "applicability" || field === "ifFailed"))) throw new Error(`${field} is not a field of this ${ids(def).get(id)}.`);
    if (field === "mode" && value !== "" && !MODES.includes(/** @type {string} */ (value))) throw new Error(`${String(value)} is not a mode.`);
    if (field === "escalation" && value !== "" && !def.escalationConditions.some((/** @type {any} */ c) => c.id === value)) throw new Error("That escalation condition does not exist.");
    if (field === "restartAt" && value !== "" && !def.pausePoints.some((/** @type {any} */ p) => p.id === value)) throw new Error("That pause point does not exist.");
    hit.node[field] = field === "required" ? value === true : str(value);
    return def;
  }

  /** @param {any[]} list @param {string} id @param {number} delta */
  function shift(list, id, delta) {
    const from = list.findIndex((x) => x.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return false;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    return true;
  }

  /** Remove every reference to ids that no longer exist, so an edit never leaves a broken link. @param {any} def */
  function prune(def) {
    const live = ids(def);
    const checks = new Set(items(def).filter((i) => i.kind === "check").map((i) => i.id));
    const pauses = new Set(def.pausePoints.map((/** @type {any} */ p) => p.id));
    const stops = new Set(def.stopConditions.map((/** @type {any} */ c) => c.id));
    for (const p of def.pausePoints) for (const i of p.items) i.dependsOn = i.dependsOn.filter((/** @type {string} */ d) => checks.has(d) && d !== i.id);
    for (const c of [...def.stopConditions, ...def.escalationConditions]) c.at = c.at.filter((/** @type {string} */ p) => pauses.has(p));
    for (const c of def.stopConditions) if (c.escalation && !live.has(c.escalation)) c.escalation = "";
    for (const r of def.recoveryRoutes) {
      r.triggers = r.triggers.filter((/** @type {string} */ t) => checks.has(t) || stops.has(t));
      if (r.restartAt && !pauses.has(r.restartAt)) r.restartAt = "";
    }
    return def;
  }

  /** @param {any} def @param {string} [title] */
  function addPausePoint(def, title = "") {
    const id = mint(def, "p");
    def.pausePoints.push({ id, title, mode: "", details: "", items: [] });
    return id;
  }

  /** @param {any} def @param {string} id */
  function removePausePoint(def, id) {
    def.pausePoints = def.pausePoints.filter((/** @type {any} */ p) => p.id !== id);
    prune(def);
  }

  /** @param {any} def @param {string} id @param {number} delta */
  const movePausePoint = (def, id, delta) => shift(def.pausePoints, id, delta);

  /** @param {any} def @param {string} pausePoint @param {"step" | "check"} kind @param {string} [text] */
  function addItem(def, pausePoint, kind, text = "") {
    const p = def.pausePoints.find((/** @type {any} */ x) => x.id === pausePoint);
    if (!p) throw new Error("That pause point does not exist.");
    if (!KINDS.includes(kind)) throw new Error(`${kind} is not an item kind.`);
    const id = mint(def, kind === "check" ? "c" : "s");
    p.items.push(item({ id, kind, text, required: true }));
    return id;
  }

  /** @param {any} def @param {string} id */
  function removeItem(def, id) {
    for (const p of def.pausePoints) p.items = p.items.filter((/** @type {any} */ i) => i.id !== id);
    prune(def);
  }

  /** Move an item up or down, across into the neighbouring pause point at either end. @param {any} def @param {string} id @param {number} delta */
  function moveItem(def, id, delta) {
    const hit = find(def, id);
    if (!hit || hit.type !== "item") return false;
    const list = hit.pausePoint.items;
    const at = list.indexOf(hit.node);
    const to = at + delta;
    if (to >= 0 && to < list.length) return shift(list, id, delta);
    const pIndex = def.pausePoints.indexOf(hit.pausePoint) + (delta < 0 ? -1 : 1);
    const next = def.pausePoints[pIndex];
    if (!next) return false;
    list.splice(at, 1);
    if (delta < 0) next.items.push(hit.node);
    else next.items.unshift(hit.node);
    return true;
  }

  /** @param {any} def @param {string} id @param {string} pausePoint */
  function moveItemTo(def, id, pausePoint) {
    const hit = find(def, id);
    const target = def.pausePoints.find((/** @type {any} */ p) => p.id === pausePoint);
    if (!hit || hit.type !== "item" || !target || hit.pausePoint === target) return false;
    hit.pausePoint.items.splice(hit.pausePoint.items.indexOf(hit.node), 1);
    target.items.push(hit.node);
    return true;
  }

  /** Classify an item as a normal step or a critical check; links that only a check can carry are removed. @param {any} def @param {string} id @param {"step" | "check"} kind */
  function setKind(def, id, kind) {
    const hit = find(def, id);
    if (!hit || hit.type !== "item") throw new Error("That item does not exist.");
    if (!KINDS.includes(kind)) throw new Error(`${kind} is not an item kind.`);
    const list = hit.pausePoint.items;
    list[list.indexOf(hit.node)] = item({ ...hit.node, kind });
    prune(def);
  }

  /** @param {any} def @param {string} id @param {string} check @param {boolean} on */
  function setDependency(def, id, check, on) {
    const hit = find(def, id);
    const target = find(def, check);
    if (!hit || hit.type !== "item" || !target || target.type !== "item" || target.node.kind !== "check" || id === check) throw new Error("A dependency names another critical check.");
    const list = hit.node.dependsOn.filter((/** @type {string} */ d) => d !== check);
    if (on) list.push(check);
    const order = items(def).map((i) => i.id);
    hit.node.dependsOn = list.sort((/** @type {string} */ a, /** @type {string} */ b) => order.indexOf(a) - order.indexOf(b));
  }

  /** @param {any} def @param {"stop" | "escalation"} kind */
  function addCondition(def, kind) {
    const id = mint(def, kind === "stop" ? "x" : "e");
    if (kind === "stop") def.stopConditions.push({ id, text: "", instruction: "", escalation: "", at: [] });
    else def.escalationConditions.push({ id, text: "", contact: "", action: "", at: [] });
    def.none[kind] = false;
    return id;
  }

  /** @param {any} def @param {string} id */
  function removeCondition(def, id) {
    def.stopConditions = def.stopConditions.filter((/** @type {any} */ c) => c.id !== id);
    def.escalationConditions = def.escalationConditions.filter((/** @type {any} */ c) => c.id !== id);
    prune(def);
  }

  /** Where a condition applies: none ticked means every pause point. @param {any} def @param {string} id @param {string} pausePoint @param {boolean} on */
  function setConditionAt(def, id, pausePoint, on) {
    const hit = find(def, id);
    if (!hit || (hit.type !== "stop" && hit.type !== "escalation")) throw new Error("That condition does not exist.");
    const order = def.pausePoints.map((/** @type {any} */ p) => p.id);
    if (!order.includes(pausePoint)) throw new Error("That pause point does not exist.");
    const at = hit.node.at.filter((/** @type {string} */ p) => p !== pausePoint);
    if (on) at.push(pausePoint);
    hit.node.at = at.sort((/** @type {string} */ a, /** @type {string} */ b) => order.indexOf(a) - order.indexOf(b));
  }

  /** Record "None specified" for a category, or take it back; it is refused while the category has entries. @param {any} def @param {"stop" | "escalation" | "recovery"} category @param {boolean} on */
  function setNone(def, category, on) {
    const list = category === "stop" ? def.stopConditions : category === "escalation" ? def.escalationConditions : def.recoveryRoutes;
    if (on && list.length) throw new Error("Remove the entries before recording None specified.");
    def.none[category] = on;
  }

  /** @param {any} def */
  function addRoute(def) {
    const id = mint(def, "r");
    def.recoveryRoutes.push({ id, title: "", triggers: [], steps: [], restartChecks: [], restartAt: "" });
    def.none.recovery = false;
    return id;
  }

  /** @param {any} def @param {string} id */
  function removeRoute(def, id) {
    def.recoveryRoutes = def.recoveryRoutes.filter((/** @type {any} */ r) => r.id !== id);
  }

  /** A route's trigger is an explicit link to a critical check (when it fails) or a stop condition (when reported). @param {any} def @param {string} route @param {string} trigger @param {boolean} on */
  function setTrigger(def, route, trigger, on) {
    const r = def.recoveryRoutes.find((/** @type {any} */ x) => x.id === route);
    const t = find(def, trigger);
    if (!r || !t || !((t.type === "item" && t.node.kind === "check") || t.type === "stop")) throw new Error("A trigger names a critical check or a stop condition.");
    const order = [...items(def).map((i) => i.id), ...def.stopConditions.map((/** @type {any} */ c) => c.id)];
    const list = r.triggers.filter((/** @type {string} */ x) => x !== trigger);
    if (on) list.push(trigger);
    r.triggers = list.sort((/** @type {string} */ a, /** @type {string} */ b) => order.indexOf(a) - order.indexOf(b));
  }

  /** @param {any} def @param {string} route @param {"steps" | "restartChecks"} list @param {string} [text] */
  function addRoutePart(def, route, list, text = "") {
    const r = def.recoveryRoutes.find((/** @type {any} */ x) => x.id === route);
    if (!r || (list !== "steps" && list !== "restartChecks")) throw new Error("That recovery route does not exist.");
    const id = mint(def, list === "steps" ? "a" : "k");
    r[list].push({ id, text });
    return id;
  }

  /** @param {any} def @param {string} id */
  function removeRoutePart(def, id) {
    for (const r of def.recoveryRoutes) {
      r.steps = r.steps.filter((/** @type {any} */ s) => s.id !== id);
      r.restartChecks = r.restartChecks.filter((/** @type {any} */ s) => s.id !== id);
    }
  }

  /** @param {any} def @param {string} id @param {number} delta */
  function moveRoutePart(def, id, delta) {
    for (const r of def.recoveryRoutes) if (shift(r.steps, id, delta) || shift(r.restartChecks, id, delta)) return true;
    return false;
  }

  /* ---------- REVIEW ---------- */

  /**
   * Draft issues: errors block a Run; warnings are design targets and suggestions, never enforced. Each names the
   * object it is about (`target`), so the page links to it.
   * @param {any} def
   */
  function issues(def) {
    /** @type {{ level: "error" | "warning", target: string, text: string }[]} */
    const out = [];
    const error = (/** @type {string} */ target, /** @type {string} */ text) => out.push({ level: "error", target, text });
    const warn = (/** @type {string} */ target, /** @type {string} */ text) => out.push({ level: "warning", target, text });
    if (!def.title.trim()) error(def.id, "The checklist has no title.");
    if (!def.pausePoints.length) error(def.id, "Add at least one pause point.");
    def.pausePoints.forEach((/** @type {any} */ p, /** @type {number} */ n) => {
      const where = p.title.trim() || `Pause point ${n + 1}`;
      const seen = new Set();
      if (!p.title.trim()) error(p.id, `Pause point ${n + 1} has no name.`);
      if (!MODES.includes(p.mode)) error(p.id, `${where}: choose Read–Do or Do–Confirm.`);
      if (!p.items.length) error(p.id, `${where} has no items.`);
      if (p.items.length > TARGET.max) warn(p.id, `${where} has ${p.items.length} items; the design target is ${TARGET.min} to ${TARGET.max}. Consider another pause point.`);
      for (const i of p.items) {
        const label = i.kind === "check" ? "critical check" : "step";
        if (!i.text.trim()) { error(i.id, `${where}: a ${label} has no text.`); continue; }
        const key = norm(i.text);
        if (seen.has(key)) warn(i.id, `${where}: “${i.text.trim()}” appears twice. Remove the duplicate or make each item distinct.`);
        else seen.add(key);
        if (words(i.text) > LONG_WORDS) warn(i.id, `“${i.text.trim()}” has ${words(i.text)} words. Shorten it to one action or check, and move the explanation to its details.`);
      }
    });
    if (!def.stopConditions.length && !def.none.stop) error("stop", "Stop conditions: add one, or record None specified.");
    if (!def.escalationConditions.length && !def.none.escalation) error("escalation", "Escalation conditions: add one, or record None specified.");
    if (!def.recoveryRoutes.length && !def.none.recovery) error("recovery", "Recovery routes: add one, or record None specified.");
    for (const c of def.stopConditions) {
      if (!c.text.trim()) error(c.id, "A stop condition has no text.");
      if (!c.instruction.trim()) error(c.id, `Stop condition “${c.text.trim() || "untitled"}” has no stop instruction.`);
    }
    for (const c of def.escalationConditions) {
      if (!c.text.trim()) error(c.id, "An escalation condition has no text.");
      if (!c.contact.trim()) error(c.id, `Escalation condition “${c.text.trim() || "untitled"}” names no person or role.`);
      if (!c.action.trim()) error(c.id, `Escalation condition “${c.text.trim() || "untitled"}” has no escalation action.`);
    }
    const order = def.pausePoints.map((/** @type {any} */ p) => p.id);
    for (const r of def.recoveryRoutes) {
      const where = `Recovery route “${r.title.trim() || "untitled"}”`;
      if (!r.title.trim()) error(r.id, "A recovery route has no name.");
      if (!r.triggers.length) error(r.id, `${where} has no trigger: link it to a critical check or a stop condition.`);
      if (!r.steps.length) error(r.id, `${where} has no recovery steps.`);
      if (!r.restartChecks.length) error(r.id, `${where} has no restart checks.`);
      if (!r.restartAt) error(r.id, `${where} has no restart destination.`);
      for (const s of [...r.steps, ...r.restartChecks]) if (!s.text.trim()) error(s.id, `${where} has an empty step or restart check.`);
      for (const t of r.triggers) {
        const hit = find(def, t);
        if (hit?.type === "item" && r.restartAt && order.indexOf(r.restartAt) > order.indexOf(hit.pausePoint.id)) error(r.id, `${where} restarts after the pause point of “${hit.node.text}”; a restart cannot skip pause points.`);
        if (hit?.type === "stop" && r.restartAt && order.indexOf(r.restartAt) > Math.min(...(hit.node.at.length ? hit.node.at : order).map((/** @type {string} */ p) => order.indexOf(p)))) error(r.id, `${where} restarts after the first pause point where stop condition “${hit.node.text}” applies; a restart cannot skip pause points.`);
      }
    }
    return out;
  }

  /**
   * Derived quantities of a draft: counts per pause point, issues and reviewer status. No single score.
   * @param {any} entry
   */
  function deriveDraft(entry) {
    const def = entry.checklist;
    const list = issues(def);
    const pauses = def.pausePoints.map((/** @type {any} */ p) => ({
      id: p.id,
      title: p.title,
      mode: p.mode,
      items: p.items.length,
      steps: p.items.filter((/** @type {any} */ i) => i.kind === "step").length,
      checks: p.items.filter((/** @type {any} */ i) => i.kind === "check").length,
      required: p.items.filter((/** @type {any} */ i) => i.required).length,
      target: p.items.length < TARGET.min ? "below" : p.items.length > TARGET.max ? "above" : "within",
      stops: conditionsAt(def, "stop", p.id).length,
    }));
    const reviewer = reviewerStatus(entry);
    const reviewed = entry.reviewedRevision === def.revision;
    const errors = list.filter((i) => i.level === "error");
    /** @type {string[]} */
    const blockers = [];
    if (errors.length) blockers.push(`${errors.length} draft ${errors.length === 1 ? "issue blocks" : "issues block"} a Run.`);
    if (!reviewed) blockers.push(`Review revision ${def.revision} first.`);
    if (def.requiresReview && !reviewer.current) blockers.push(`This checklist requires a reviewer record for revision ${def.revision}.`);
    return {
      revision: def.revision,
      pausePoints: pauses,
      items: pauses.reduce((n, p) => n + p.items, 0),
      steps: pauses.reduce((n, p) => n + p.steps, 0),
      checks: pauses.reduce((n, p) => n + p.checks, 0),
      stopConditions: def.stopConditions.length,
      escalationConditions: def.escalationConditions.length,
      recoveryRoutes: def.recoveryRoutes.length,
      recoverySteps: def.recoveryRoutes.reduce((/** @type {number} */ n, /** @type {any} */ r) => n + r.steps.length, 0),
      issues: list,
      errors: errors.length,
      warnings: list.length - errors.length,
      reviewed,
      reviewer,
      canStart: blockers.length === 0,
      blockers,
    };
  }

  /** Reviewer records are user supplied: current for this revision, or stale. Never a verified approval. @param {any} entry */
  function reviewerStatus(entry) {
    const revision = entry.checklist.revision;
    const current = entry.reviewers.filter((/** @type {any} */ r) => r.revision === revision);
    const stale = entry.reviewers.filter((/** @type {any} */ r) => r.revision !== revision);
    const text = current.length
      ? `Reviewer record for revision ${revision} (user supplied, not verified)`
      : stale.length ? `Reviewer records are stale: none is for revision ${revision}` : "No reviewer record";
    return { current: current.length > 0, records: current.length, stale: stale.length, text };
  }

  /**
   * Add a reviewer record for the current revision. Name and date are required; the app records what the person
   * typed and verifies nothing.
   * @param {any} entry @param {{ name: string, date: string, note?: string }} record
   */
  function addReviewer(entry, record) {
    const name = str(record.name).trim();
    const date = str(record.date).trim();
    if (!name) throw new Error("A reviewer record needs a name.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("A reviewer record needs a date (YYYY-MM-DD).");
    const n = entry.reviewers.reduce((/** @type {number} */ max, /** @type {any} */ r) => Math.max(max, Number(/^rev(\d+)$/.exec(r.id)?.[1] ?? 0)), 0) + 1;
    const id = `rev${n}`;
    return { ...entry, reviewers: [...entry.reviewers, { id, name, revision: entry.checklist.revision, date, note: str(record.note).trim() }] };
  }

  /** @param {any} entry @param {string} id */
  const removeReviewer = (entry, id) => ({ ...entry, reviewers: entry.reviewers.filter((/** @type {any} */ r) => r.id !== id) });

  /** The author's own review of the current revision, required before a Run; refused while errors remain. @param {any} entry */
  function markReviewed(entry) {
    const errors = issues(entry.checklist).filter((i) => i.level === "error");
    if (errors.length) throw new Error(`Resolve ${errors.length} draft ${errors.length === 1 ? "issue" : "issues"} before marking the review done.`);
    return { ...entry, reviewedRevision: entry.checklist.revision };
  }

  /** Conditions of a kind that apply at a pause point: those with no pause points ticked apply everywhere. @param {any} def @param {"stop" | "escalation"} kind @param {string} pausePoint */
  function conditionsAt(def, kind, pausePoint) {
    const list = kind === "stop" ? def.stopConditions : def.escalationConditions;
    return list.filter((/** @type {any} */ c) => !c.at.length || c.at.includes(pausePoint));
  }

  /* ---------- RUN ---------- */

  /**
   * A new Run with fresh results against a copy of the current revision. A later edit changes the draft, never this
   * copy. Refused while the draft is not ready.
   * @param {any} entry
   */
  function startRun(entry) {
    const d = deriveDraft(entry);
    if (!d.canStart) throw new Error(d.blockers.join(" "));
    const def = clone(entry.checklist);
    const n = entry.run ? Number(/^run(\d+)$/.exec(entry.run.id)?.[1] ?? 0) + 1 : 1;
    /** @type {Record<string, { value: string, reason: string }>} */
    const results = {};
    for (const i of items(def)) results[i.id] = { value: "pending", reason: "" };
    return {
      ...entry,
      run: {
        id: `run${n}`,
        revision: def.revision,
        checklist: def,
        status: "active",
        current: def.pausePoints[0].id,
        completed: [],
        results,
        reports: [],
        recovery: null,
        hold: null,
        notice: "",
        log: [`Run ${n} started on revision ${def.revision}.`],
      },
    };
  }

  /** Whether a run is still in progress. @param {any} run */
  const unfinished = (run) => Boolean(run && run.status === "active");

  /** A result that lets normal progress continue: done, passed, or not applicable with a reason. @param {any} i @param {any} r */
  function valid(i, r) {
    if (i.kind === "step") return r.value === "done";
    return r.value === "passed" || (r.value === "not-applicable" && r.reason.trim() !== "" && i.applicability.trim() !== "");
  }

  /** Items that depend, directly or through other checks, on any of `roots`, as the author defined them. @param {any} def @param {string[]} roots */
  function dependents(def, roots) {
    const all = items(def);
    const found = new Set();
    let frontier = [...roots];
    while (frontier.length) {
      const next = [];
      for (const i of all) {
        if (found.has(i.id) || roots.includes(i.id)) continue;
        if (i.dependsOn.some((/** @type {string} */ d) => frontier.includes(d))) { found.add(i.id); next.push(i.id); }
      }
      frontier = next;
    }
    return all.filter((i) => found.has(i.id)).map((i) => i.id);
  }

  /**
   * The gate at the current pause point: normal progress is available only when every required step is done, every
   * required critical check is passed or not applicable with a reason, no critical check is failed or unknown, no
   * stop condition is active, and nothing holds the Run.
   * @param {any} run
   */
  function gate(run) {
    const def = run.checklist;
    const p = def.pausePoints.find((/** @type {any} */ x) => x.id === run.current);
    /** @type {{ kind: string, target: string, text: string }[]} */
    const blockers = [];
    if (run.status !== "active") return { open: false, blockers, last: false };
    if (run.hold) blockers.push({ kind: "hold", target: run.current, text: "Confirm the current pause point before continuing." });
    if (run.recovery) blockers.push({ kind: "recovery", target: run.recovery.route, text: "A recovery route is in progress." });
    for (const r of run.reports) {
      if (r.status !== "active" || !def.stopConditions.some((/** @type {any} */ c) => c.id === r.condition)) continue;
      blockers.push({ kind: "stop", target: r.condition, text: `Stop condition reported: ${nameOf(def, r.condition)}` });
    }
    for (const i of p.items) {
      const r = run.results[i.id];
      if (i.kind === "check" && r.value === "failed") blockers.push({ kind: "failed", target: i.id, text: `Critical check failed: ${i.text}` });
      else if (i.kind === "check" && r.value === "unknown") blockers.push({ kind: "unknown", target: i.id, text: `Critical check result unknown: ${i.text}` });
      else if (i.required && !valid(i, r)) blockers.push({ kind: "pending", target: i.id, text: i.kind === "check" ? `Critical check has no valid result: ${i.text}` : `Step not done: ${i.text}` });
    }
    const index = def.pausePoints.indexOf(p);
    return { open: blockers.length === 0, blockers, last: index === def.pausePoints.length - 1 };
  }

  /**
   * Derived quantities of a Run: counts at the current pause point, unresolved checks, active conditions and the gate.
   * Completed boxes do not prove that the physical work is correct, so there is no reliability score.
   * @param {any} run
   */
  function deriveRun(run) {
    const def = run.checklist;
    const p = def.pausePoints.find((/** @type {any} */ x) => x.id === run.current);
    const here = p.items.map((/** @type {any} */ i) => ({ ...i, result: run.results[i.id] }));
    const steps = here.filter((/** @type {any} */ i) => i.kind === "step");
    const checks = here.filter((/** @type {any} */ i) => i.kind === "check");
    const all = items(def).map((i) => ({ ...i, result: run.results[i.id] }));
    const active = run.reports.filter((/** @type {any} */ r) => r.status === "active");
    const failed = all.filter((i) => i.kind === "check" && i.result.value === "failed");
    return {
      revision: run.revision,
      status: run.status,
      pauseIndex: def.pausePoints.indexOf(p),
      pauseCount: def.pausePoints.length,
      stepsDone: steps.filter((/** @type {any} */ i) => i.result.value === "done").length,
      steps: steps.length,
      checksValid: checks.filter((/** @type {any} */ i) => valid(i, i.result)).length,
      checks: checks.length,
      unresolved: all.filter((i) => i.kind === "check" && i.required && !valid(i, i.result)).map((i) => i.id),
      failed: failed.map((i) => i.id),
      activeStops: active.filter((/** @type {any} */ r) => def.stopConditions.some((/** @type {any} */ c) => c.id === r.condition)).map((/** @type {any} */ r) => r.condition),
      activeEscalations: active.filter((/** @type {any} */ r) => def.escalationConditions.some((/** @type {any} */ c) => c.id === r.condition)).map((/** @type {any} */ r) => r.condition),
      routes: routesFor(run).map((r) => r.id),
      gate: gate(run),
    };
  }

  /** @param {any} run @param {string} text */
  const logged = (run, text) => ({ ...run, log: [...run.log, text] });

  /** @param {any} run */
  function requireOpen(run) {
    if (!run || run.status !== "active") throw new Error("There is no Run in progress.");
    if (run.hold) throw new Error("Confirm the current pause point first.");
  }

  /**
   * Record or correct a result. At the current pause point it records; at an earlier, confirmed pause point it is a
   * correction. A change that takes a valid result away clears the results that depend on it (as the author linked
   * them), and when that or the correction invalidates later progress the Run pauses with an explanation.
   * @param {any} run @param {string} id @param {string} value @param {string} [reason]
   */
  function record(run, id, value, reason = "") {
    requireOpen(run);
    if (run.recovery) throw new Error("Finish or cancel the recovery route first.");
    const def = run.checklist;
    const hit = find(def, id);
    if (!hit || hit.type !== "item") throw new Error("That item is not in this Run.");
    const i = hit.node;
    const allowed = i.kind === "step" ? STEP_RESULTS : CHECK_RESULTS;
    if (!allowed.includes(value)) throw new Error(`${value} is not a result for a ${i.kind === "check" ? "critical check" : "normal step"}.`);
    if (value === "not-applicable") {
      if (!i.applicability.trim()) throw new Error("This critical check has no applicability rule, so it cannot be not applicable.");
      if (!reason.trim()) throw new Error("Record why the check is not applicable.");
    }
    const order = def.pausePoints.map((/** @type {any} */ p) => p.id);
    const at = order.indexOf(hit.pausePoint.id);
    const now = order.indexOf(run.current);
    if (at > now) throw new Error("That pause point has not been reached.");
    const before = run.results[id];
    const after = { value, reason: value === "not-applicable" ? reason.trim() : "" };
    if (same(before, after)) return run;
    const results = { ...run.results, [id]: after };
    const lost = valid(i, before) && !valid(i, after);
    const cleared = lost && i.kind === "check" ? dependents(def, [id]).filter((d) => results[d].value !== "pending") : [];
    for (const d of cleared) results[d] = { value: "pending", reason: "" };
    let next = { ...run, results };
    const correction = at < now;
    if (!correction && !cleared.length) return logged(next, `${nameOf(def, id)}: ${RESULT_LABEL[/** @type {keyof RESULT_LABEL} */ (value)]}.`);
    const invalid = correction && !valid(i, after);
    const back = cleared.reduce((min, d) => Math.min(min, order.indexOf(find(def, d)?.pausePoint.id)), invalid ? at : now);
    const kept = run.completed.filter((/** @type {string} */ p) => order.indexOf(p) < back);
    const reopened = run.completed.filter((/** @type {string} */ p) => order.indexOf(p) >= back);
    const parts = [`${correction ? "Correction" : "Changed"}: “${nameOf(def, id)}” is now ${RESULT_LABEL[/** @type {keyof RESULT_LABEL} */ (value)].toLowerCase()}.`];
    if (cleared.length) parts.push(`Cleared the results that depend on it: ${names(def, cleared)}.`);
    if (reopened.length) parts.push(`Reopened ${names(def, reopened)}.`);
    if (!cleared.length && !reopened.length) return logged({ ...next, notice: parts[0] }, parts[0]);
    next = { ...next, completed: kept, current: order[back], hold: { reason: "correction", text: parts.join(" ") }, notice: parts.join(" ") };
    return logged(next, parts.join(" "));
  }

  /** Report a stop or escalation condition. A stop blocks normal progress; the app detects nothing itself. @param {any} run @param {string} condition */
  function report(run, condition) {
    requireOpen(run);
    const def = run.checklist;
    const hit = find(def, condition);
    if (!hit || (hit.type !== "stop" && hit.type !== "escalation")) throw new Error("That condition is not in this Run.");
    if (run.reports.some((/** @type {any} */ r) => r.condition === condition && r.status === "active")) return run;
    const id = `rep${run.reports.length + 1}`;
    const text = `${hit.type === "stop" ? "Stop" : "Escalation"} condition reported at ${nameOf(def, run.current)}: ${nameOf(def, condition)}.`;
    return logged({ ...run, reports: [...run.reports, { id, condition, at: run.current, status: "active" }], notice: "" }, text);
  }

  /** An escalation report is closed when the person records that help was given; a stop is closed only by a restart. @param {any} run @param {string} reportId */
  function resolveEscalation(run, reportId) {
    requireOpen(run);
    const rep = run.reports.find((/** @type {any} */ r) => r.id === reportId);
    if (!rep || rep.status !== "active" || !run.checklist.escalationConditions.some((/** @type {any} */ c) => c.id === rep.condition)) throw new Error("That escalation report is not active.");
    return logged({ ...run, reports: run.reports.map((/** @type {any} */ r) => (r.id === reportId ? { ...r, status: "resolved" } : r)) }, `Help recorded for: ${nameOf(run.checklist, rep.condition)}.`);
  }

  /**
   * The authored recovery routes that apply now: those linked to a failed critical check at the current pause point
   * or to an active stop report. Never chosen by matching words.
   * @param {any} run
   */
  function routesFor(run) {
    const def = run.checklist;
    const p = def.pausePoints.find((/** @type {any} */ x) => x.id === run.current);
    const triggers = new Set([
      ...p.items.filter((/** @type {any} */ i) => i.kind === "check" && run.results[i.id].value === "failed").map((/** @type {any} */ i) => i.id),
      ...run.reports.filter((/** @type {any} */ r) => r.status === "active").map((/** @type {any} */ r) => r.condition),
    ]);
    return def.recoveryRoutes.filter((/** @type {any} */ r) => r.triggers.some((/** @type {string} */ t) => triggers.has(t)))
      .map((/** @type {any} */ r) => ({ ...r, trigger: r.triggers.find((/** @type {string} */ t) => triggers.has(t)) }));
  }

  /** @param {any} run @param {string} route */
  function startRecovery(run, route) {
    requireOpen(run);
    const r = routesFor(run).find((x) => x.id === route);
    if (!r) throw new Error("That recovery route is not linked to a failed check or a reported stop here.");
    return logged({ ...run, recovery: { route, trigger: r.trigger, done: [], confirmed: [] }, notice: "" }, `Recovery route started: ${r.title}.`);
  }

  /** @param {any} run */
  function cancelRecovery(run) {
    requireOpen(run);
    if (!run.recovery) return run;
    return logged({ ...run, recovery: null }, "Recovery route cancelled; the Run stays blocked.");
  }

  /** Mark a recovery step done, or confirm a restart check, explicitly. @param {any} run @param {string} id @param {boolean} on */
  function markRecovery(run, id, on) {
    requireOpen(run);
    if (!run.recovery) throw new Error("No recovery route is in progress.");
    const route = run.checklist.recoveryRoutes.find((/** @type {any} */ r) => r.id === run.recovery.route);
    const key = route.steps.some((/** @type {any} */ s) => s.id === id) ? "done" : route.restartChecks.some((/** @type {any} */ s) => s.id === id) ? "confirmed" : "";
    if (!key) throw new Error("That is not part of this recovery route.");
    const list = run.recovery[key].filter((/** @type {string} */ x) => x !== id);
    if (on) list.push(id);
    const order = [...route.steps, ...route.restartChecks].map((s) => s.id);
    list.sort((/** @type {string} */ a, /** @type {string} */ b) => order.indexOf(a) - order.indexOf(b));
    return { ...run, recovery: { ...run.recovery, [key]: list } };
  }

  /** Whether the restart is available: every recovery step done and every restart check explicitly confirmed. @param {any} run */
  function canRestart(run) {
    if (!run?.recovery) return false;
    const route = run.checklist.recoveryRoutes.find((/** @type {any} */ r) => r.id === run.recovery.route);
    const order = run.checklist.pausePoints.map((/** @type {any} */ p) => p.id);
    return route.steps.every((/** @type {any} */ s) => run.recovery.done.includes(s.id))
      && route.restartChecks.every((/** @type {any} */ s) => run.recovery.confirmed.includes(s.id))
      && order.indexOf(route.restartAt) <= order.indexOf(run.current);
  }

  /**
   * Restart after recovery: clear the trigger and the results that depend on it (or, with no authored dependency,
   * every result at the current pause point), close the stop report, and go to the restart destination. The failed
   * check returns to no result: recovery never passes it.
   * @param {any} run
   */
  function restart(run) {
    requireOpen(run);
    if (!canRestart(run)) throw new Error("Mark every recovery step done and confirm every restart check first.");
    const def = run.checklist;
    const route = def.recoveryRoutes.find((/** @type {any} */ r) => r.id === run.recovery.route);
    const trigger = run.recovery.trigger;
    const deps = find(def, trigger)?.type === "item" ? dependents(def, [trigger]) : [];
    const here = def.pausePoints.find((/** @type {any} */ p) => p.id === run.current);
    const clear = deps.length ? [trigger, ...deps] : here.items.map((/** @type {any} */ i) => i.id);
    if (find(def, trigger)?.type === "item" && !clear.includes(trigger)) clear.push(trigger);
    const results = { ...run.results };
    for (const id of clear) results[id] = { value: "pending", reason: "" };
    const order = def.pausePoints.map((/** @type {any} */ p) => p.id);
    const to = order.indexOf(route.restartAt);
    const reports = run.reports.map((/** @type {any} */ r) => (r.status === "active" && route.triggers.includes(r.condition) ? { ...r, status: "resolved" } : r));
    const text = `Restarted at ${nameOf(def, route.restartAt)} after recovery route “${route.title}”. ${deps.length ? "Cleared the trigger and the results that depend on it" : `No dependencies are authored, so every result at ${nameOf(def, run.current)} was cleared`}: ${names(def, clear)}.`;
    return logged({
      ...run,
      results,
      reports,
      recovery: null,
      current: route.restartAt,
      completed: run.completed.filter((/** @type {string} */ p) => order.indexOf(p) < to),
      notice: text,
    }, text);
  }

  /** Continue to the next pause point, or complete the Run at the last one, only when the gate is open. @param {any} run */
  function advance(run) {
    requireOpen(run);
    const g = gate(run);
    if (!g.open) throw new Error(g.blockers.map((b) => b.text).join(" "));
    const def = run.checklist;
    const order = def.pausePoints.map((/** @type {any} */ p) => p.id);
    const completed = [...run.completed, run.current];
    if (g.last) return logged({ ...run, completed, status: "complete", notice: "" }, `${nameOf(def, run.current)} confirmed. Run complete.`);
    const next = order[order.indexOf(run.current) + 1];
    return logged({ ...run, completed, current: next, notice: "" }, `${nameOf(def, run.current)} confirmed. Now at ${nameOf(def, next)}.`);
  }

  /** Confirm the current pause point after a reload, an import or a correction; nothing else changes. @param {any} run */
  function confirmPausePoint(run) {
    if (!run?.hold) return run;
    return logged({ ...run, hold: null }, `Confirmed the current pause point: ${nameOf(run.checklist, run.current)}.`);
  }

  /** Hold an unfinished Run that was restored from storage or a file until the person confirms where they are. @param {any} run @param {"restored" | "imported"} reason */
  function holdForConfirmation(run, reason) {
    if (!unfinished(run) || run.hold) return run;
    return { ...run, hold: { reason, text: `${reason === "restored" ? "Restored from this device" : "Restored from an imported file"}. Confirm that you are at ${nameOf(run.checklist, run.current)} before continuing.` } };
  }

  /** @param {any} run */
  function endRun(run) {
    if (!unfinished(run)) throw new Error("There is no Run in progress.");
    return logged({ ...run, status: "ended", recovery: null, hold: null, notice: "" }, `Run ended at ${nameOf(run.checklist, run.current)}.`);
  }

  /** Reset Run: the same revision again with fresh results. @param {any} entry */
  function resetRun(entry) {
    if (!entry.run) throw new Error("There is no Run to reset.");
    const def = entry.run.checklist;
    /** @type {Record<string, { value: string, reason: string }>} */
    const results = {};
    for (const i of items(def)) results[i.id] = { value: "pending", reason: "" };
    const n = Number(/^run(\d+)$/.exec(entry.run.id)?.[1] ?? 0) + 1;
    return { ...entry, run: { ...entry.run, id: `run${n}`, status: "active", current: def.pausePoints[0].id, completed: [], results, reports: [], recovery: null, hold: null, notice: "", log: [`Run ${n} reset on revision ${def.revision}; earlier results were removed.`] } };
  }

  /* ---------- LIBRARY ---------- */

  /** An entry from a definition: no reviewer record, no review, no Run. @param {any} def */
  const entryOf = (def) => ({ checklist: definition(def), reviewers: [], reviewedRevision: 0, trialNotes: "", run: null });

  /** An empty library: the semantic state the page keeps on the device. */
  const emptyLibrary = () => ({ format: FORMAT, schemaVersion: SCHEMA_VERSION, seq: 1, active: "", view: "start", checklists: [] });

  /** A checklist id not used in the library. @param {any} lib */
  function newId(lib) {
    let n = lib.seq;
    while (lib.checklists.some((/** @type {any} */ e) => e.checklist.id === `cl${n}`)) n++;
    return { id: `cl${n}`, seq: n + 1 };
  }

  /** An entry under another checklist id, its Run's copy included. @param {any} entry @param {string} id */
  const withId = (entry, id) => ({ ...entry, checklist: { ...entry.checklist, id }, run: entry.run ? { ...entry.run, checklist: { ...entry.run.checklist, id } } : null });

  /** Add an entry as a new checklist and make it current; an id already in use gets a new one. @param {any} lib @param {any} entry */
  function addEntry(lib, entry) {
    const next = { ...lib };
    let e = entry;
    if (lib.checklists.some((/** @type {any} */ x) => x.checklist.id === entry.checklist.id)) {
      const made = newId(lib);
      next.seq = made.seq;
      e = withId(entry, made.id);
    }
    return { ...next, active: e.checklist.id, checklists: [...lib.checklists, e] };
  }

  /** A new draft from a bundled example: revision 1, no results, nothing inherited; saved work is untouched. @param {any} lib @param {any} example */
  function fromExample(lib, example) {
    const made = newId(lib);
    const def = definition({ ...clone(example.checklist), id: made.id, revision: 1, example: example.id, seq: 1 });
    return addEntry({ ...lib, seq: made.seq }, entryOf(def));
  }

  /** @param {any} lib @param {(entry: any) => any} change */
  function updateActive(lib, change) {
    return { ...lib, checklists: lib.checklists.map((/** @type {any} */ e) => (e.checklist.id === lib.active ? change(e) : e)) };
  }

  /** @param {any} lib */
  const active = (lib) => lib.checklists.find((/** @type {any} */ e) => e.checklist.id === lib.active) ?? null;

  /** @param {any} lib @param {string} id */
  function removeEntry(lib, id) {
    const checklists = lib.checklists.filter((/** @type {any} */ e) => e.checklist.id !== id);
    return { ...lib, checklists, active: lib.active === id ? (checklists[0]?.checklist.id ?? "") : lib.active };
  }

  /** Replace the current checklist with an imported entry, keeping the current id so nothing else changes. @param {any} lib @param {any} entry */
  function replaceActive(lib, entry) {
    if (!active(lib)) return addEntry(lib, entry);
    const id = lib.active;
    return { ...lib, checklists: lib.checklists.map((/** @type {any} */ e) => (e.checklist.id === id ? withId(entry, id) : e)) };
  }

  /* ---------- VALIDATE ---------- */

  /**
   * Bring a parsed document to the current schema, or refuse it. A document of another format or of a version this
   * page cannot read is refused with a reason and never read as valid.
   * @param {any} doc
   */
  function migrate(doc) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("The data is not a checklist document.");
    if (doc.format !== FORMAT) throw new Error(`The data is not a ${FORMAT} document.`);
    let version = doc.schemaVersion;
    if (!Number.isInteger(version)) throw new Error("The data has no schema version.");
    let out = doc;
    while (version !== SCHEMA_VERSION) {
      const step = MIGRATIONS[version];
      if (!step) throw new Error(`The data uses schema version ${version}; this page reads version ${SCHEMA_VERSION}${Object.keys(MIGRATIONS).length ? ` and migrates ${Object.keys(MIGRATIONS).join(", ")}` : ""}. Nothing was changed.`);
      out = step(out);
      version = out.schemaVersion;
    }
    return out;
  }

  /** A validator that collects errors with their paths. */
  function checker() {
    /** @type {string[]} */
    const errors = [];
    const fail = (/** @type {string} */ path, /** @type {string} */ text) => { if (errors.length < 50) errors.push(`${path}: ${text}`); };
    /** @param {any} v @param {string} path @param {string[]} keys @param {string[]} [optional] */
    const object = (v, path, keys, optional = []) => {
      if (!v || typeof v !== "object" || Array.isArray(v)) { fail(path, "must be an object"); return false; }
      for (const k of keys) if (!(k in v) && !optional.includes(k)) fail(path, `missing field ${k}`);
      for (const k of Object.keys(v)) if (!keys.includes(k)) fail(path, `unknown field ${k}`);
      return true;
    };
    /** @param {any} v @param {string} path */
    const text = (v, path) => { if (typeof v !== "string") fail(path, "must be text"); };
    /** @param {any} v @param {string} path */
    const flag = (v, path) => { if (typeof v !== "boolean") fail(path, "must be true or false"); };
    /** @param {any} v @param {string} path */
    const id = (v, path) => { if (typeof v !== "string" || !ID.test(v)) fail(path, `is not a valid id (${JSON.stringify(String(v)).slice(0, 40)})`); };
    /** @param {any} v @param {string} path */
    const list = (v, path) => { if (!Array.isArray(v)) { fail(path, "must be a list"); return []; } return v; };
    /** @param {any} v @param {string} path @param {number} min */
    const int = (v, path, min) => { if (!Number.isInteger(v) || v < min) fail(path, `must be a whole number of at least ${min}`); };
    return { errors, fail, object, text, flag, id, list, int };
  }

  /** @param {ReturnType<typeof checker>} c @param {any} d @param {string} path */
  function checkDefinition(c, d, path) {
    if (!c.object(d, path, ["id", "title", "revision", "example", "requiresReview", "details", "originalText", "pausePoints", "stopConditions", "escalationConditions", "recoveryRoutes", "none", "seq"])) return;
    c.id(d.id, `${path}.id`);
    c.text(d.title, `${path}.title`);
    c.int(d.revision, `${path}.revision`, 1);
    c.text(d.example, `${path}.example`);
    c.flag(d.requiresReview, `${path}.requiresReview`);
    c.text(d.originalText, `${path}.originalText`);
    c.int(d.seq, `${path}.seq`, 1);
    if (c.object(d.details, `${path}.details`, FIELDS.details)) for (const k of FIELDS.details) c.text(d.details[k], `${path}.details.${k}`);
    if (c.object(d.none, `${path}.none`, ["stop", "escalation", "recovery"])) for (const k of ["stop", "escalation", "recovery"]) c.flag(d.none[k], `${path}.none.${k}`);
    /** @type {Map<string, string>} */
    const seen = new Map();
    const unique = (/** @type {any} */ id, /** @type {string} */ where, /** @type {string} */ what) => {
      if (typeof id !== "string") return;
      if (seen.has(id) || id === d.id) c.fail(where, `duplicate id ${id}`);
      else seen.set(id, what);
    };
    c.list(d.pausePoints, `${path}.pausePoints`).forEach((/** @type {any} */ p, /** @type {number} */ n) => {
      const pp = `${path}.pausePoints[${n}]`;
      if (!c.object(p, pp, ["id", "title", "mode", "details", "items"])) return;
      c.id(p.id, `${pp}.id`); unique(p.id, `${pp}.id`, "pausePoint");
      c.text(p.title, `${pp}.title`); c.text(p.details, `${pp}.details`);
      if (p.mode !== "" && !MODES.includes(p.mode)) c.fail(`${pp}.mode`, `is not a mode (${JSON.stringify(String(p.mode)).slice(0, 30)})`);
      c.list(p.items, `${pp}.items`).forEach((/** @type {any} */ i, /** @type {number} */ k) => {
        const ip = `${pp}.items[${k}]`;
        const isCheck = i?.kind === "check";
        if (!c.object(i, ip, isCheck ? ["id", "kind", "text", "details", "required", "dependsOn", "applicability", "ifFailed"] : ["id", "kind", "text", "details", "required", "dependsOn"])) return;
        c.id(i.id, `${ip}.id`); unique(i.id, `${ip}.id`, isCheck ? "check" : "step");
        if (!KINDS.includes(i.kind)) c.fail(`${ip}.kind`, "is not a category (step or check)");
        c.text(i.text, `${ip}.text`); c.text(i.details, `${ip}.details`); c.flag(i.required, `${ip}.required`);
        c.list(i.dependsOn, `${ip}.dependsOn`);
        if (isCheck) { c.text(i.applicability, `${ip}.applicability`); c.text(i.ifFailed, `${ip}.ifFailed`); }
      });
    });
    c.list(d.stopConditions, `${path}.stopConditions`).forEach((/** @type {any} */ x, /** @type {number} */ n) => {
      const xp = `${path}.stopConditions[${n}]`;
      if (!c.object(x, xp, ["id", "text", "instruction", "escalation", "at"])) return;
      c.id(x.id, `${xp}.id`); unique(x.id, `${xp}.id`, "stop");
      c.text(x.text, `${xp}.text`); c.text(x.instruction, `${xp}.instruction`); c.text(x.escalation, `${xp}.escalation`); c.list(x.at, `${xp}.at`);
    });
    c.list(d.escalationConditions, `${path}.escalationConditions`).forEach((/** @type {any} */ x, /** @type {number} */ n) => {
      const xp = `${path}.escalationConditions[${n}]`;
      if (!c.object(x, xp, ["id", "text", "contact", "action", "at"])) return;
      c.id(x.id, `${xp}.id`); unique(x.id, `${xp}.id`, "escalation");
      c.text(x.text, `${xp}.text`); c.text(x.contact, `${xp}.contact`); c.text(x.action, `${xp}.action`); c.list(x.at, `${xp}.at`);
    });
    c.list(d.recoveryRoutes, `${path}.recoveryRoutes`).forEach((/** @type {any} */ r, /** @type {number} */ n) => {
      const rp = `${path}.recoveryRoutes[${n}]`;
      if (!c.object(r, rp, ["id", "title", "triggers", "steps", "restartChecks", "restartAt"])) return;
      c.id(r.id, `${rp}.id`); unique(r.id, `${rp}.id`, "route");
      c.text(r.title, `${rp}.title`); c.text(r.restartAt, `${rp}.restartAt`); c.list(r.triggers, `${rp}.triggers`);
      for (const key of ["steps", "restartChecks"]) c.list(r[key], `${rp}.${key}`).forEach((/** @type {any} */ s, /** @type {number} */ k) => {
        if (!c.object(s, `${rp}.${key}[${k}]`, ["id", "text"])) return;
        c.id(s.id, `${rp}.${key}[${k}].id`); unique(s.id, `${rp}.${key}[${k}].id`, key);
        c.text(s.text, `${rp}.${key}[${k}].text`);
      });
    });
    if (c.errors.length) return;
    const kind = (/** @type {string} */ ref) => seen.get(ref);
    for (const [n, p] of d.pausePoints.entries()) for (const [k, i] of p.items.entries()) {
      for (const ref of i.dependsOn) if (kind(ref) !== "check" || ref === i.id) c.fail(`${path}.pausePoints[${n}].items[${k}].dependsOn`, `names ${JSON.stringify(String(ref)).slice(0, 40)}, which is not another critical check`);
    }
    for (const [key, list] of [["stopConditions", d.stopConditions], ["escalationConditions", d.escalationConditions]]) for (const [n, x] of list.entries()) {
      for (const ref of x.at) if (kind(ref) !== "pausePoint") c.fail(`${path}.${key}[${n}].at`, `names ${JSON.stringify(String(ref)).slice(0, 40)}, which is not a pause point`);
      if (new Set(x.at).size !== x.at.length) c.fail(`${path}.${key}[${n}].at`, "names a pause point twice");
    }
    for (const [n, x] of d.stopConditions.entries()) if (x.escalation && kind(x.escalation) !== "escalation") c.fail(`${path}.stopConditions[${n}].escalation`, "is not an escalation condition");
    for (const [n, r] of d.recoveryRoutes.entries()) {
      for (const ref of r.triggers) if (kind(ref) !== "check" && kind(ref) !== "stop") c.fail(`${path}.recoveryRoutes[${n}].triggers`, `names ${JSON.stringify(String(ref)).slice(0, 40)}, which is not a critical check or a stop condition`);
      if (r.restartAt && kind(r.restartAt) !== "pausePoint") c.fail(`${path}.recoveryRoutes[${n}].restartAt`, "is not a pause point");
    }
    for (const [cat, list] of [["stop", d.stopConditions], ["escalation", d.escalationConditions], ["recovery", d.recoveryRoutes]]) {
      if (d.none[cat] && list.length) c.fail(`${path}.none.${cat}`, "records None specified but the category has entries");
    }
  }

  /** @param {ReturnType<typeof checker>} c @param {any} run @param {any} entry @param {string} path */
  function checkRun(c, run, entry, path) {
    if (run === null) return;
    if (!c.object(run, path, ["id", "revision", "checklist", "status", "current", "completed", "results", "reports", "recovery", "hold", "notice", "log"])) return;
    if (typeof run.id !== "string" || !/^run\d+$/.test(run.id)) c.fail(`${path}.id`, "is not a Run id");
    c.int(run.revision, `${path}.revision`, 1);
    const before = c.errors.length;
    checkDefinition(c, run.checklist, `${path}.checklist`);
    if (c.errors.length > before) return;
    const def = run.checklist;
    for (const i of issues(def)) if (i.level === "error") c.fail(`${path}.checklist`, `has a blocking issue: ${i.text}`);
    if (def.id !== entry.checklist?.id) c.fail(`${path}.checklist.id`, "belongs to another checklist");
    if (run.revision !== def.revision) c.fail(`${path}.revision`, `is ${run.revision} but the Run's checklist is revision ${def.revision}`);
    if (entry.checklist && run.revision > entry.checklist.revision) c.fail(`${path}.revision`, "is later than the draft");
    if (!RUN_STATUSES.includes(run.status)) c.fail(`${path}.status`, `is not a Run status (${JSON.stringify(String(run.status)).slice(0, 30)})`);
    const order = def.pausePoints.map((/** @type {any} */ p) => p.id);
    if (!order.length) { c.fail(`${path}.checklist`, "has no pause points"); return; }
    if (!order.includes(run.current)) c.fail(`${path}.current`, "is not a pause point of the Run's revision");
    const done = c.list(run.completed, `${path}.completed`);
    done.forEach((/** @type {any} */ p, /** @type {number} */ k) => { if (p !== order[k]) c.fail(`${path}.completed`, "must list the confirmed pause points in order from the first"); });
    if (run.status === "active" && done.length !== order.indexOf(run.current)) c.fail(`${path}.completed`, "does not end just before the current pause point");
    if (run.status === "complete" && done.length !== order.length) c.fail(`${path}.completed`, "a complete Run confirms every pause point");
    const all = items(def);
    if (c.object(run.results, `${path}.results`, all.map((i) => i.id))) {
      for (const i of all) {
        const r = run.results[i.id];
        const rp = `${path}.results.${i.id}`;
        if (!c.object(r, rp, ["value", "reason"])) continue;
        c.text(r.reason, `${rp}.reason`);
        const allowed = i.kind === "step" ? STEP_RESULTS : CHECK_RESULTS;
        if (!allowed.includes(r.value)) c.fail(`${rp}.value`, `is not a result for a ${i.kind === "check" ? "critical check" : "normal step"} (${JSON.stringify(String(r.value)).slice(0, 30)})`);
        if (r.value === "not-applicable" && (!str(r.reason).trim() || !i.applicability.trim())) c.fail(rp, "not applicable needs an authored applicability rule and a recorded reason");
        if (r.value !== "not-applicable" && r.reason !== "") c.fail(`${rp}.reason`, "only a not-applicable result has a reason");
      }
    }
    const conditions = new Set([...def.stopConditions, ...def.escalationConditions].map((/** @type {any} */ x) => x.id));
    c.list(run.reports, `${path}.reports`).forEach((/** @type {any} */ r, /** @type {number} */ k) => {
      const rp = `${path}.reports[${k}]`;
      if (!c.object(r, rp, ["id", "condition", "at", "status"])) return;
      if (r.id !== `rep${k + 1}`) c.fail(`${rp}.id`, `must be rep${k + 1}`);
      if (!conditions.has(r.condition)) c.fail(`${rp}.condition`, "is not a condition of the Run's revision");
      if (!order.includes(r.at)) c.fail(`${rp}.at`, "is not a pause point");
      if (r.status !== "active" && r.status !== "resolved") c.fail(`${rp}.status`, "must be active or resolved");
    });
    if (run.recovery !== null && c.object(run.recovery, `${path}.recovery`, ["route", "trigger", "done", "confirmed"])) {
      const route = def.recoveryRoutes.find((/** @type {any} */ r) => r.id === run.recovery.route);
      if (!route) c.fail(`${path}.recovery.route`, "is not a recovery route of the Run's revision");
      else {
        if (!route.triggers.includes(run.recovery.trigger)) c.fail(`${path}.recovery.trigger`, "is not a trigger of that route");
        for (const s of c.list(run.recovery.done, `${path}.recovery.done`)) if (!route.steps.some((/** @type {any} */ x) => x.id === s)) c.fail(`${path}.recovery.done`, `names ${JSON.stringify(String(s)).slice(0, 40)}, which is not a step of the route`);
        for (const s of c.list(run.recovery.confirmed, `${path}.recovery.confirmed`)) if (!route.restartChecks.some((/** @type {any} */ x) => x.id === s)) c.fail(`${path}.recovery.confirmed`, `names ${JSON.stringify(String(s)).slice(0, 40)}, which is not a restart check of the route`);
      }
    }
    if (run.hold !== null && c.object(run.hold, `${path}.hold`, ["reason", "text"])) {
      if (!HOLDS.includes(run.hold.reason)) c.fail(`${path}.hold.reason`, "is not a hold reason");
      c.text(run.hold.text, `${path}.hold.text`);
    }
    c.text(run.notice, `${path}.notice`);
    for (const [k, line] of c.list(run.log, `${path}.log`).entries()) c.text(line, `${path}.log[${k}]`);
  }

  /** @param {ReturnType<typeof checker>} c @param {any} e @param {string} path */
  function checkEntry(c, e, path) {
    if (!c.object(e, path, ["checklist", "reviewers", "reviewedRevision", "trialNotes", "run"])) return;
    const before = c.errors.length;
    checkDefinition(c, e.checklist, `${path}.checklist`);
    c.int(e.reviewedRevision, `${path}.reviewedRevision`, 0);
    c.text(e.trialNotes, `${path}.trialNotes`);
    const revs = new Set();
    c.list(e.reviewers, `${path}.reviewers`).forEach((/** @type {any} */ r, /** @type {number} */ k) => {
      const rp = `${path}.reviewers[${k}]`;
      if (!c.object(r, rp, ["id", "name", "revision", "date", "note"])) return;
      c.id(r.id, `${rp}.id`);
      if (revs.has(r.id)) c.fail(`${rp}.id`, `duplicate id ${r.id}`);
      revs.add(r.id);
      c.text(r.name, `${rp}.name`); c.text(r.note, `${rp}.note`); c.int(r.revision, `${rp}.revision`, 1);
      if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) c.fail(`${rp}.date`, "must be a date (YYYY-MM-DD)");
      if (c.errors.length === before && Number.isInteger(r.revision) && r.revision > e.checklist.revision) c.fail(`${rp}.revision`, "is later than the checklist");
    });
    if (c.errors.length === before && e.reviewedRevision > e.checklist.revision) c.fail(`${path}.reviewedRevision`, "is later than the checklist");
    if (c.errors.length === before) checkRun(c, e.run, e, `${path}.run`);
  }

  /** The canonical form of a validated entry. @param {any} e */
  function canonicalEntry(e) {
    const run = e.run && {
      id: e.run.id,
      revision: e.run.revision,
      checklist: definition(e.run.checklist),
      status: e.run.status,
      current: e.run.current,
      completed: [...e.run.completed],
      results: Object.fromEntries(items(e.run.checklist).map((i) => [i.id, { value: e.run.results[i.id].value, reason: e.run.results[i.id].reason }])),
      reports: e.run.reports.map((/** @type {any} */ r) => ({ id: r.id, condition: r.condition, at: r.at, status: r.status })),
      recovery: e.run.recovery && { route: e.run.recovery.route, trigger: e.run.recovery.trigger, done: [...e.run.recovery.done], confirmed: [...e.run.recovery.confirmed] },
      hold: e.run.hold && { reason: e.run.hold.reason, text: e.run.hold.text },
      notice: e.run.notice,
      log: [...e.run.log],
    };
    return {
      checklist: definition(e.checklist),
      reviewers: e.reviewers.map((/** @type {any} */ r) => ({ id: r.id, name: r.name, revision: r.revision, date: r.date, note: r.note })),
      reviewedRevision: e.reviewedRevision,
      trialNotes: e.trialNotes,
      run,
    };
  }

  /**
   * Validate one checklist document (an export's payload) after migration: syntax is the caller's, this checks the
   * schema, ids, references, statuses and categories, and returns the canonical entry or throws with every problem.
   * @param {any} doc
   */
  function readChecklist(doc) {
    const d = migrate(doc);
    const c = checker();
    if (c.object(d, "file", ["format", "schemaVersion", "checklist", "reviewers", "reviewedRevision", "trialNotes", "run"])) {
      const entry = { checklist: d.checklist, reviewers: d.reviewers, reviewedRevision: d.reviewedRevision, trialNotes: d.trialNotes, run: d.run };
      checkEntry(c, entry, "file");
      if (!c.errors.length) return canonicalEntry(entry);
    }
    throw new Error(`The checklist is not valid: ${c.errors.slice(0, 8).join("; ")}${c.errors.length > 8 ? `; and ${c.errors.length - 8} more` : ""}.`);
  }

  /** The export payload of an entry: format, schema version and the entry, in canonical order. @param {any} entry */
  const payloadOf = (entry) => ({ format: FORMAT, schemaVersion: SCHEMA_VERSION, ...canonicalEntry(entry) });

  /**
   * Validate the library the page keeps on the device; same rules as a file, plus the library's own fields.
   * @param {any} doc
   */
  function readLibrary(doc) {
    const d = migrate(doc);
    const c = checker();
    if (c.object(d, "saved data", ["format", "schemaVersion", "seq", "active", "view", "checklists"])) {
      c.int(d.seq, "saved data.seq", 1);
      if (!VIEWS.includes(d.view)) c.fail("saved data.view", "is not a view");
      const seen = new Set();
      c.list(d.checklists, "saved data.checklists").forEach((/** @type {any} */ e, /** @type {number} */ k) => {
        checkEntry(c, e, `saved data.checklists[${k}]`);
        const id = e?.checklist?.id;
        if (seen.has(id)) c.fail(`saved data.checklists[${k}]`, `duplicate checklist id ${id}`);
        seen.add(id);
      });
      if (d.active !== "" && !seen.has(d.active)) c.fail("saved data.active", "names no saved checklist");
      if (!c.errors.length) return { format: FORMAT, schemaVersion: SCHEMA_VERSION, seq: d.seq, active: d.active, view: d.view, checklists: d.checklists.map(canonicalEntry) };
    }
    throw new Error(`The saved data is not valid: ${c.errors.slice(0, 5).join("; ")}.`);
  }

  /* ---------- STORAGE ---------- */

  const STORAGE_KEY = FORMAT;

  /**
   * Read the library from a Storage (localStorage, or a stand-in in tests). Never writes. An unfinished Run comes back
   * held until the person confirms its pause point. Storage that refuses gives "unavailable"; saved data that is
   * not valid or uses an unsupported schema gives "blocked", and the page then never writes over it.
   * @param {{ getItem(key: string): string | null }} store
   */
  function loadLibrary(store) {
    /** @type {string | null} */
    let raw;
    try {
      raw = store.getItem(STORAGE_KEY);
    } catch {
      return { lib: emptyLibrary(), status: { mode: "unavailable", reason: "This browser does not let the page use storage here." }, restored: 0 };
    }
    if (raw === null) return { lib: emptyLibrary(), status: { mode: "ok", reason: "" }, restored: 0 };
    try {
      const loaded = readLibrary(JSON.parse(raw));
      const checklists = loaded.checklists.map((/** @type {any} */ e) => ({ ...e, run: holdForConfirmation(e.run, "restored") }));
      return { lib: { ...loaded, checklists }, status: { mode: "ok", reason: "" }, restored: checklists.filter((/** @type {any} */ e) => e.run?.hold?.reason === "restored").length };
    } catch (e) {
      return { lib: emptyLibrary(), status: { mode: "blocked", reason: `The saved data on this device could not be read and was left unchanged: ${e instanceof Error ? e.message : String(e)}` }, restored: 0 };
    }
  }

  /**
   * Save the library after a committed change and return the new storage status; an empty library removes the key.
   * Blocked saved data is never overwritten, and a refusal is reported, never claimed as saved.
   * @param {{ setItem(key: string, value: string): void, removeItem(key: string): void }} store @param {any} lib @param {{ mode: string, reason: string }} status
   */
  function saveLibrary(store, lib, status) {
    if (status.mode === "blocked") return status;
    try {
      if (lib.checklists.length) store.setItem(STORAGE_KEY, JSON.stringify(lib));
      else store.removeItem(STORAGE_KEY);
      return { mode: "ok", reason: "" };
    } catch {
      return { mode: "unavailable", reason: "The browser refused to save: storage may be full or blocked here." };
    }
  }

  return {
    FORMAT, SCHEMA_VERSION, STORAGE_KEY, loadLibrary, saveLibrary, MIGRATIONS, MODES, MODE_LABEL, MODE_HELP, KINDS, STEP_RESULTS, CHECK_RESULTS, RESULT_LABEL, CATEGORIES,
    VIEWS, TARGET, LONG_WORDS,
    clone, blank, definition, items, find, nameOf, edit, setField, prune,
    addPausePoint, removePausePoint, movePausePoint, addItem, removeItem, moveItem, moveItemTo, setKind, setDependency,
    addCondition, removeCondition, setConditionAt, setNone, addRoute, removeRoute, setTrigger, addRoutePart, removeRoutePart, moveRoutePart,
    issues, deriveDraft, reviewerStatus, addReviewer, removeReviewer, markReviewed, conditionsAt,
    startRun, unfinished, valid, dependents, gate, deriveRun, record, report, resolveEscalation, routesFor, startRecovery, cancelRecovery,
    markRecovery, canRestart, restart, advance, confirmPausePoint, holdForConfirmation, endRun, resetRun,
    entryOf, emptyLibrary, newId, withId, addEntry, fromExample, updateActive, active, removeEntry, replaceActive,
    migrate, readChecklist, readLibrary, payloadOf, canonicalEntry,
  };
});
