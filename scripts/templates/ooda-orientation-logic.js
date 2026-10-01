/* Orient: the planner's pure logic, with no DOM access.
 *
 * The planner state is plain JSON (schemaVersion, situation, intent, tempo, mode, items, orientations,
 * predictions, actions, outcomes, history, links, uiPreferences, plus seq, loop and the open
 * reorientation workspace). Every change goes through apply(state, command), which returns a new state
 * or an error and leaves the input untouched. The rules the page promises are enforced here:
 * an inference cannot be relabelled as an observation, a prediction freezes when its action starts,
 * history is append-only, nothing is deleted, and every action names an existing orientation.
 * Diagnostics, triggers, Deep Memory, search and exports are deterministic functions of the state.
 * init(D) hands it the page's built-in data (data/ooda-orientation/raw.json).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OrientLogic = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SCHEMA = 2;
  const KEY = "ooda-orientation/state";
  const TEMPOS = ["low", "moderate", "high"];
  const CONFIDENCE = ["tenuous", "working", "strong"];
  const PRED_STATUS = ["pending", "observed", "partial", "not-observed", "unresolved"];
  const O_STATUS = ["adopted", "candidate", "rejected", "superseded"];
  const A_STATUS = ["draft", "started", "done", "abandoned"];
  const FIELDS = ["inside", "explains", "fails", "matters", "keyAssumption", "observe", "move", "mechanism", "falsifier"];
  const MSG = {
    invalid: "This file is not a valid Orient state. Your current situation has not been changed.",
    future: "This file was created by a newer version of Orient and cannot be opened safely here.",
    storage: "Browser storage is unavailable. The planner will still work, but refresh will lose unsaved changes. Export JSON to keep the situation.",
  };
  let D = null, TYPES = new Map(), OPS = new Map(), MARKERS = null;

  function init(data) {
    D = data;
    TYPES = new Map(D.itemTypes.map((t) => [t.id, t]));
    OPS = new Map(D.operations.map((o) => [o.id, o]));
    MARKERS = new RegExp("\\b(?:" + D.interpretiveMarkers.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]")).join("|") + ")\\b", "i");
  }

  /* ---------- helpers ---------- */
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const clean = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim();
  const find = (list, id) => list.find((x) => x.id === id);
  const uniq = (xs) => xs.filter((x, i) => xs.indexOf(x) === i);
  const bare = (t) => clean(t).replace(/[.!?;:,]+$/, "");
  const lowerFirst = (t) => { const s = bare(t); return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s; };
  const STOP = new Set("a an the of to in on for and or is are be been we our us i my me it its this that these those with by as at from not only will would can could do does into than then there their they them who what".split(" "));
  function tokens(t) {
    return String(t || "").toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/)
      .filter((w) => w && !STOP.has(w)).map((w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w));
  }
  function similar(x, y) {
    const A = new Set(tokens(x)), B = new Set(tokens(y));
    if (!A.size && !B.size) return true;
    let inter = 0;
    for (const w of A) if (B.has(w)) inter += 1;
    return inter / (A.size + B.size - inter) >= 0.6;
  }
  function nid(s, p) { s.seq += 1; return p + s.seq; }
  function log(s, kind, data) { s.history.push(Object.assign({ id: nid(s, "h"), kind, loop: s.loop }, data)); }
  const err = (code, message) => ({ code, message });

  /* ---------- state ---------- */
  function blank() {
    return {
      schemaVersion: SCHEMA, seq: 0, loop: 1,
      situation: { title: "", description: "" }, intent: null, tempo: "moderate", mode: "environment",
      items: [], orientations: [], predictions: [], actions: [], outcomes: [], history: [], links: [],
      workspace: null, uiPreferences: { stage: "reality" },
    };
  }
  const current = (s) => s.orientations.find((o) => o.status === "adopted") || null;
  const label = (s, x) => {
    for (const [list, p] of [[s.orientations, "O"], [s.predictions, "P"], [s.actions, "A"], [s.outcomes, "R"]]) {
      const i = list.indexOf(x);
      if (i >= 0) return p + (p === "O" ? i : i + 1);
    }
    return "";
  };
  const labelOf = (s, id) => label(s, find(s.orientations, id) || find(s.predictions, id) || find(s.actions, id) || find(s.outcomes, id));
  const open = (a) => a.status === "draft" || a.status === "started";
  const locked = (s, o) => !!o && s.actions.some((a) => a.orientation === o.id && (a.status === "started" || a.status === "done"));
  const live = (i) => i && i.status !== "withdrawn";
  const itemsOf = (s, o, type) => (o ? o.items.map((id) => find(s.items, id)).filter((i) => live(i) && (!type || i.type === type)) : []);

  function newOrientation(s, parent, status, creation) {
    const o = { id: nid(s, "o"), parent, status, loop: s.loop, boundary: null, items: [], confidence: "tenuous", tags: {}, creation };
    for (const f of FIELDS) o[f] = "";
    s.orientations.push(o);
    return o;
  }

  function makeItem(s, c, origin) {
    const T = TYPES.get(c.type);
    if (!T) throw err("bad-type", "Unknown item type: " + c.type);
    const text = clean(c.text);
    if (!text) throw err("empty", "Write the item first.");
    let ledger = T.ledger;
    if (T.fixed && c.ledger && c.ledger !== T.ledger) throw err("bad-ledger", "A " + T.label.toLowerCase() + " is always " + T.ledger + ".");
    if (!T.fixed && c.ledger) {
      if (c.ledger !== "observed" && c.ledger !== "inferred") throw err("bad-ledger", "Choose observed or inferred.");
      ledger = c.ledger;
    }
    const quals = uniq((c.quals || []).filter((q) => D.qualifiers.some((x) => x.id === q)));
    const refs = (c.refs || []).filter((id) => find(s.items, id) || find(s.orientations, id));
    const it = {
      id: nid(s, "i"), type: c.type, text, ledger, provenance: quals,
      status: c.type === "contradiction" ? "open" : c.type === "assumption" ? "untested" : "active",
      confidence: c.type === "assumption" ? "working" : "", refs, loop: s.loop, origin: origin || null,
    };
    if (c.type === "constraint") it.tested = !!c.tested;
    if (c.surprise) it.surprise = true;
    s.items.push(it);
    return it;
  }

  function contradictionsOf(s, o) {
    if (!o) return [];
    return s.items.filter((c) => c.type === "contradiction" && c.status === "open" &&
      (!c.refs.length || c.refs.includes(o.id) || c.refs.some((r) => o.items.includes(r)) || o.items.includes(c.id)));
  }

  /* ---------- reorientation workspace ---------- */
  function destroyedIds(ws) { return uniq(ws ? ws.moves.flatMap((m) => m.targets) : []); }

  function fragments(s) {
    const ws = s.workspace, o = current(s);
    if (!ws || !o) return [];
    const destroyed = new Set(destroyedIds(ws));
    const created = ws.moves.map((m) => m.result);
    const base = uniq([...o.items, ...(s.intent ? [s.intent] : []),
      ...s.items.filter((i) => i.type === "signal" && live(i)).map((i) => i.id)]).filter((id) => !created.includes(id));
    const out = [];
    for (const id of base) {
      const it = find(s.items, id);
      if (live(it)) out.push({ id, kind: destroyed.has(id) ? "destroyed" : "kept", item: it });
    }
    for (const m of ws.moves) {
      const it = find(s.items, m.result);
      if (live(it)) out.push({ id: it.id, kind: "created", item: it, move: m.id, from: m.targets });
    }
    return out;
  }

  /* ---------- commands ---------- */
  function apply(state, command) {
    const s = clone(state);
    try {
      const id = run(s, command || {});
      return { state: s, id };
    } catch (e) {
      if (e && e.code) return { state, error: e };
      throw e;
    }
  }

  function needOrientation(s, id) {
    const o = id ? find(s.orientations, id) : current(s);
    if (!o) throw err("no-orientation", "There is no such orientation.");
    return o;
  }
  function checkIds(s, ids, what) {
    for (const id of ids || []) if (!find(s.items, id)) throw err("bad-ref", what + " refers to an item that does not exist.");
    return uniq(ids || []);
  }
  function setFields(s, o, c) {
    for (const f of FIELDS) if (f in c) o[f] = clean(c[f]);
    if ("confidence" in c) { if (!CONFIDENCE.includes(c.confidence)) throw err("bad-confidence", "Confidence is tenuous, working or strong."); o.confidence = c.confidence; }
    if ("tags" in c) {
      const tags = {};
      for (const d of D.dimensions) if (d.tags && c.tags && d.tags.includes(c.tags[d.id])) tags[d.id] = c.tags[d.id];
      o.tags = tags;
    }
    if ("items" in c) o.items = checkIds(s, c.items, "The orientation");
    if ("boundary" in c) {
      if (!c.boundary) o.boundary = null;
      else {
        const b = find(s.items, c.boundary);
        if (!b || b.type !== "boundary") throw err("bad-boundary", "The boundary must be a boundary item.");
        o.boundary = b.id;
        if (!o.items.includes(b.id)) o.items.push(b.id);
      }
    }
  }

  function run(s, c) {
    const o0 = current(s);
    switch (c.do) {
      case "new": {
        Object.assign(s, blank());
        s.situation = { title: clean(c.title), description: clean(c.description) };
        if (TEMPOS.includes(c.tempo)) s.tempo = c.tempo;
        if (D.modes.some((m) => m.id === c.mode)) s.mode = c.mode;
        const o = newOrientation(s, null, "adopted", { kind: "initial", from: [], prompt: "" });
        log(s, "situation", { orientation: o.id });
        return o.id;
      }
      case "situation":
        if ("title" in c) s.situation.title = clean(c.title);
        if ("description" in c) s.situation.description = clean(c.description);
        return null;
      case "intent": {
        const it = s.intent && find(s.items, s.intent);
        if (it && !(o0 && locked(s, o0))) { it.text = clean(c.text) || it.text; return it.id; }
        const n = makeItem(s, { type: "intention", text: c.text });
        s.intent = n.id;
        if (o0 && !locked(s, o0)) o0.items.push(n.id);
        log(s, "intent", { item: n.id });
        return n.id;
      }
      case "tempo":
        if (!TEMPOS.includes(c.value)) throw err("bad-tempo", "Tempo is low, moderate or high.");
        if (c.value !== s.tempo) { log(s, "tempo", { from: s.tempo, to: c.value }); s.tempo = c.value; }
        return null;
      case "mode":
        if (!D.modes.some((m) => m.id === c.value)) throw err("bad-mode", "Unknown situation mode.");
        s.mode = c.value;
        return null;
      case "stage":
        if (!D.stages.some((x) => x.id === c.stage)) throw err("bad-stage", "Unknown stage.");
        s.uiPreferences.stage = c.stage;
        return null;
      case "item":
      case "contradiction": {
        const it = makeItem(s, Object.assign({}, c, { type: c.do === "contradiction" ? "contradiction" : c.type }));
        const attach = c.attach !== undefined ? c.attach : it.type !== "contradiction";
        if (attach && o0 && !locked(s, o0)) o0.items.push(it.id);
        return it.id;
      }
      case "edit": {
        const it = find(s.items, c.id);
        if (!it) throw err("bad-ref", "There is no such item.");
        if ("ledger" in c && c.ledger !== it.ledger) {
          if (c.ledger === "observed") throw err("observation-integrity", "An inference cannot become an observation by relabelling. Use “Record as observed” to add a separate observation with its source.");
          if (TYPES.get(it.type).fixed || c.ledger !== "inferred") throw err("bad-ledger", "This item type has a fixed ledger kind.");
          it.ledger = "inferred";
        }
        if ("text" in c) { const t = clean(c.text); if (!t) throw err("empty", "An item cannot be empty; withdraw it instead."); it.text = t; }
        if ("confidence" in c && it.type === "assumption") { if (!CONFIDENCE.includes(c.confidence)) throw err("bad-confidence", "Confidence is tenuous, working or strong."); it.confidence = c.confidence; }
        if ("tested" in c && it.type === "constraint") it.tested = !!c.tested;
        if ("status" in c) {
          const ok = it.type === "assumption" ? ["untested", "supported", "weakened"] : it.type === "signal" ? ["active", "explained"] : [];
          if (!ok.includes(c.status)) throw err("bad-status", "That status does not apply to this item.");
          it.status = c.status;
        }
        return it.id;
      }
      case "qualify": {
        const it = find(s.items, c.id);
        if (!it) throw err("bad-ref", "There is no such item.");
        if (!D.qualifiers.some((q) => q.id === c.qualifier)) throw err("bad-qualifier", "Unknown qualification.");
        if (!it.provenance.includes(c.qualifier)) it.provenance.push(c.qualifier);
        return it.id;
      }
      case "promote": {
        const it = find(s.items, c.id);
        if (!it || it.ledger === "observed") throw err("bad-ref", "Only an inference or unknown can be checked against an observation.");
        const note = clean(c.note);
        if (!note) throw err("source-required", "Say what you actually observed and where.");
        const n = makeItem(s, { type: "signal", text: c.text || it.text, refs: [it.id] }, { promotedFrom: it.id, note });
        s.links.push({ id: nid(s, "l"), from: it.id, to: n.id, kind: "observed-as" });
        log(s, "promote", { from: it.id, to: n.id });
        return n.id;
      }
      case "withdraw": {
        const it = find(s.items, c.id);
        if (!it) throw err("bad-ref", "There is no such item.");
        if (it.type === "contradiction") throw err("use-resolve", "Resolve or dismiss a contradiction with a reason instead.");
        it.status = "withdrawn";
        it.reason = clean(c.reason);
        log(s, "withdraw", { item: it.id });
        return it.id;
      }
      case "resolve": {
        const it = find(s.items, c.id);
        if (!it || it.type !== "contradiction") throw err("bad-ref", "There is no such contradiction.");
        if (!["open", "resolved", "dismissed"].includes(c.status)) throw err("bad-status", "Choose open, resolved or dismissed.");
        if (c.status === "dismissed" && !clean(c.reason)) throw err("reason-required", "Dismissing a contradiction needs a reason.");
        it.status = c.status;
        it.reason = clean(c.reason);
        log(s, "resolve", { item: it.id, status: c.status });
        return it.id;
      }
      case "orient": {
        const o = needOrientation(s, c.id);
        if (o.status !== "adopted" && o.status !== "candidate") throw err("historical", "Past orientations are kept as they were.");
        if (locked(s, o)) throw err("orientation-locked", "An action relying on this orientation has started, so it can no longer be edited. Reorient to revise it.");
        setFields(s, o, c);
        return o.id;
      }
      case "reorient": {
        if (!o0) throw err("no-orientation", "Start a situation first.");
        if (s.workspace) {
          if (c.deep) s.workspace.deep = true;
          if (c.mode) s.workspace.mode = c.mode;
          return s.workspace.id;
        }
        s.workspace = { id: nid(s, "w"), from: o0.id, deep: !!c.deep, mode: ["guided", "manual", "jolt"].includes(c.mode) ? c.mode : "guided", jolt: 0, moves: [], candidates: [] };
        log(s, "reorient", { workspace: s.workspace.id, deep: !!c.deep, triggers: triggers(s).map((t) => t.id) });
        s.uiPreferences.stage = "destroy";
        return s.workspace.id;
      }
      case "wsmode":
        if (!s.workspace) throw err("no-workspace", "Reorient first.");
        if (!["guided", "manual", "jolt"].includes(c.mode)) throw err("bad-mode", "Unknown destruction mode.");
        s.workspace.mode = c.mode;
        return null;
      case "jolt":
        if (!s.workspace) throw err("no-workspace", "Reorient first.");
        s.workspace.jolt = (s.workspace.jolt + 1) % D.jolts.length;
        return null;
      case "move": {
        const ws = s.workspace;
        if (!ws) throw err("no-workspace", "Reorient first.");
        const op = OPS.get(c.op);
        if (!op) throw err("bad-op", "Unknown destruction operation.");
        if (op.deep && !ws.deep) throw err("deep-required", "Destroying the goal belongs to a deep reset.");
        const live_ = ws.moves.length;
        if (live_ >= (ws.deep ? 8 : 3)) throw err("move-limit", ws.deep ? "Eight moves is the limit even for a deep reset." : "One to three destructive moves is enough for a normal reorientation. Use Deep reset for broader destruction.");
        const targets = uniq(c.targets || []);
        if (op.targets.length) {
          if (!targets.length || (!op.multi && targets.length !== 1)) throw err("bad-target", op.multi ? "Choose the items to combine." : "Choose one item to challenge.");
          for (const id of targets) {
            const t = find(s.items, id);
            if (!live(t) || !op.targets.includes(t.type)) throw err("bad-target", "“" + op.label + "” applies to: " + op.targets.join(", ") + ".");
          }
        } else if (targets.length) throw err("bad-target", "This operation challenges the whole situation, not one item.");
        const rep = c.replacement || {};
        if (!clean(rep.text)) throw err("replacement-required", "Write the replacement. Clicking a prompt is not progress; only the replacement enters the next stage.");
        const mid = nid(s, "m");
        const it = makeItem(s, { type: rep.type || op.creates, text: rep.text, ledger: rep.ledger }, { move: mid, from: targets });
        ws.moves.push({ id: mid, op: op.id, targets, challenge: clean(c.challenge) || op.challenge, result: it.id });
        for (const t of targets) s.links.push({ id: nid(s, "l"), from: t, to: it.id, kind: "replaced-by" });
        log(s, "move", { move: mid, op: op.id, targets, result: it.id });
        return it.id;
      }
      case "unmove": {
        const ws = s.workspace;
        const m = ws && ws.moves.find((x) => x.id === c.id || x.result === c.id);
        if (!m) throw err("bad-ref", "There is no such move.");
        if (ws.candidates.some((cid) => find(s.orientations, cid).items.includes(m.result))) throw err("in-use", "A candidate is built from this fragment.");
        ws.moves = ws.moves.filter((x) => x !== m);
        const it = find(s.items, m.result);
        it.status = "withdrawn";
        it.reason = "Move undone";
        log(s, "unmove", { move: m.id });
        return m.id;
      }
      case "candidate": {
        const ws = s.workspace;
        if (!ws) throw err("no-workspace", "Reorient first.");
        const active = ws.candidates.filter((id) => find(s.orientations, id).status === "candidate");
        if (active.length >= 4) throw err("candidate-limit", "At most four candidates can be active. Drop one first.");
        const frag = fragments(s).filter((f) => f.kind !== "destroyed").map((f) => f.id);
        const from = uniq(c.from || []);
        if (!from.length || from.some((id) => !frag.includes(id))) throw err("untraced-candidate", "Name the fragments this candidate is built from, so its origin stays traceable.");
        const o = newOrientation(s, ws.from, "candidate", { kind: "candidate", workspace: ws.id, from, prompt: clean(c.prompt) });
        setFields(s, o, Object.assign({ items: from }, c));
        if (c.confidence === undefined) o.confidence = "tenuous";
        ws.candidates.push(o.id);
        log(s, "candidate", { orientation: o.id, from });
        return o.id;
      }
      case "drop": {
        const o = find(s.orientations, c.id);
        if (!o || o.status !== "candidate") throw err("bad-ref", "There is no such candidate.");
        o.status = "rejected";
        o.reason = clean(c.reason) || "Dropped before comparison";
        log(s, "drop", { orientation: o.id });
        return o.id;
      }
      case "adopt": {
        const ws = s.workspace;
        const o = find(s.orientations, c.id);
        if (!ws || !o || o.status !== "candidate" || !ws.candidates.includes(o.id)) throw err("bad-ref", "Adopt one of the open candidates.");
        const prev = current(s);
        const rejected = ws.candidates.filter((id) => id !== o.id && find(s.orientations, id).status === "candidate");
        for (const id of rejected) find(s.orientations, id).status = "rejected";
        prev.status = "superseded";
        o.status = "adopted";
        for (const a of s.actions.filter((x) => x.status === "draft" && x.orientation === prev.id)) {
          a.status = "abandoned";
          log(s, "abandon", { action: a.id, orientation: prev.id });
        }
        const intent = itemsOf(s, o, "intention").find((i) => i.id !== s.intent);
        if (intent) s.intent = intent.id;
        const kept = prev.items.filter((id) => o.items.includes(id));
        /* Observations are never destroyed by leaving them out; only an explicit move can target one. */
        const destroyed = uniq([...destroyedIds(ws), ...prev.items.filter((id) => !o.items.includes(id) && find(s.items, id).ledger !== "observed")]);
        const created = o.items.filter((id) => !prev.items.includes(id));
        log(s, "transition", {
          from: prev.id, to: o.id, kept, destroyed, created, rejected, deep: ws.deep,
          evidence: checkIds(s, c.evidence, "The evidence"), note: clean(c.note),
          moves: ws.moves.map((m) => ({ op: m.op, targets: m.targets, challenge: m.challenge, result: m.result })),
        });
        s.workspace = null;
        s.uiPreferences.stage = "act";
        return o.id;
      }
      case "retain": {
        const ws = s.workspace;
        if (!ws) throw err("no-workspace", "There is no reorientation to close.");
        const rejected = ws.candidates.filter((id) => find(s.orientations, id).status === "candidate");
        for (const id of rejected) find(s.orientations, id).status = "rejected";
        log(s, "retain", { orientation: ws.from, rejected, note: clean(c.note) });
        s.workspace = null;
        s.uiPreferences.stage = "act";
        return ws.from;
      }
      case "keep":
        if (!o0) throw err("no-orientation", "Start a situation first.");
        log(s, "keep", { orientation: o0.id });
        s.uiPreferences.stage = "act";
        return o0.id;
      case "action": {
        const o = c.orientation ? find(s.orientations, c.orientation) : o0;
        if (!o || o.status !== "adopted") throw err("untraced-action", "Every action must follow from the adopted orientation.");
        if (s.actions.some(open)) throw err("one-action", "Finish or edit the current action first: one meaningful next move per loop.");
        if (!D.actionTypes.some((t) => t.id === c.type)) throw err("bad-type", "Choose probe, maneuver, commitment or wait.");
        if (!clean(c.text)) throw err("empty", "Say what you will do.");
        const a = { id: nid(s, "a"), orientation: o.id, type: c.type, text: clean(c.text), prediction: null, reconsider: clean(c.reconsider),
          refs: checkIds(s, c.refs, "The action"), consistency: consistency(c.consistency), info: (c.info || []).filter((x) => D.infoEnvironment.includes(x)), status: "draft", loop: s.loop };
        s.actions.push(a);
        if (clean(c.expected)) a.prediction = addPrediction(s, o.id, a.id, c.expected).id;
        log(s, "action", { action: a.id, orientation: o.id });
        return a.id;
      }
      case "editAction": {
        const a = find(s.actions, c.id);
        if (!a) throw err("bad-ref", "There is no such action.");
        if (a.status !== "draft") throw err("action-started", "The action has started; its record is fixed.");
        if ("type" in c) { if (!D.actionTypes.some((t) => t.id === c.type)) throw err("bad-type", "Choose probe, maneuver, commitment or wait."); a.type = c.type; }
        if ("text" in c) { if (!clean(c.text)) throw err("empty", "Say what you will do."); a.text = clean(c.text); }
        if ("reconsider" in c) a.reconsider = clean(c.reconsider);
        if ("refs" in c) a.refs = checkIds(s, c.refs, "The action");
        if ("consistency" in c) a.consistency = consistency(c.consistency);
        if ("info" in c) a.info = (c.info || []).filter((x) => D.infoEnvironment.includes(x));
        if ("expected" in c) {
          const p = a.prediction && find(s.predictions, a.prediction);
          if (p) p.text = clean(c.expected);
          else if (clean(c.expected)) a.prediction = addPrediction(s, a.orientation, a.id, c.expected).id;
        }
        return a.id;
      }
      case "prediction": {
        const o = needOrientation(s, c.orientation);
        if (o.status !== "adopted" && o.status !== "candidate") throw err("historical", "Past orientations are kept as they were.");
        if (!clean(c.text)) throw err("empty", "Write the prediction.");
        return addPrediction(s, o.id, null, c.text).id;
      }
      case "editPrediction": {
        const p = find(s.predictions, c.id);
        if (!p) throw err("bad-ref", "There is no such prediction.");
        if (p.locked) {
          const known = p.status !== "pending" || s.outcomes.some((r) => r.action === p.action);
          throw err(known ? "prediction-drift" : "prediction-locked", known
            ? "The expected result cannot change after the outcome is known. Record the difference in the interpretation."
            : "The action has started, so this prediction is frozen.");
        }
        if (!clean(c.text)) throw err("empty", "Write the prediction.");
        p.text = clean(c.text);
        return p.id;
      }
      case "start": {
        const a = find(s.actions, c.id);
        if (a && find(s.orientations, a.orientation).status !== "adopted") throw err("untraced-action", "Every action must follow from the adopted orientation.");
        if (!a || a.status !== "draft") throw err("bad-ref", "There is no draft action to start.");
        if (a.type === "commitment" && !a.reconsider) throw err("commitment-trigger", "A commitment needs a reconsideration trigger before it starts.");
        a.status = "started";
        for (const p of s.predictions) {
          if (!p.locked && (p.action === a.id || (!p.action && p.orientation === a.orientation))) { p.locked = true; p.original = p.text; if (!p.action) p.action = a.id; }
        }
        log(s, "start", { action: a.id, predictions: s.predictions.filter((p) => p.action === a.id).map((p) => p.id) });
        s.uiPreferences.stage = "observe";
        return a.id;
      }
      case "outcome": {
        const a = find(s.actions, c.action);
        if (!a || a.status !== "started") throw err("not-started", "Start the action before recording what happened.");
        if (!clean(c.observed)) throw err("empty", "Say what happened.");
        const attribution = D.attributions.some((x) => x.id === c.attribution) ? c.attribution : "";
        const effect = ["achieved", "partial", "not"].includes(c.effect) ? c.effect : "";
        const r = { id: nid(s, "r"), action: a.id, loop: s.loop, observed: clean(c.observed), surprise: clean(c.surprise), absent: clean(c.absent),
          changedEnvironment: ["yes", "no", "unsure"].includes(c.changedEnvironment) ? c.changedEnvironment : "unsure",
          weakened: checkIds(s, c.weakened, "The outcome"), strengthened: checkIds(s, c.strengthened, "The outcome"),
          betterFit: c.betterFit && find(s.orientations, c.betterFit) ? c.betterFit : "", reorient: clean(c.reorient),
          interpretation: clean(c.interpretation), attribution, effect, signals: [] };
        for (const e of c.predictions || []) {
          const p = find(s.predictions, e.id || a.prediction);
          if (!p || p.action !== a.id) throw err("bad-ref", "That prediction does not belong to this action.");
          if (!PRED_STATUS.includes(e.status) || e.status === "pending") throw err("bad-status", "Mark the prediction observed, partially observed, not observed or unresolved.");
          p.status = e.status;
          p.result = clean(e.result) || r.observed;
          p.interpretation = clean(e.interpretation) || r.interpretation;
        }
        const quals = r.changedEnvironment === "yes" ? ["intervention"] : [];
        r.signals.push(makeItem(s, { type: "signal", text: r.observed, quals }, { outcome: r.id }).id);
        if (r.surprise) r.signals.push(makeItem(s, { type: "signal", text: r.surprise, surprise: true, quals }, { outcome: r.id }).id);
        for (const id of r.weakened) { const it = find(s.items, id); if (it.type === "assumption") it.status = "weakened"; }
        for (const id of r.strengthened) { const it = find(s.items, id); if (it.type === "assumption") it.status = "supported"; }
        a.status = "done";
        s.outcomes.push(r);
        log(s, "outcome", { outcome: r.id, action: a.id });
        s.loop += 1;
        s.uiPreferences.stage = "model";
        return r.id;
      }
      case "interpret": {
        const p = find(s.predictions, c.id);
        if (!p || !p.locked) throw err("bad-ref", "Interpret a prediction after its action starts.");
        p.interpretation = clean(c.interpretation);
        return p.id;
      }
      default:
        throw err("bad-command", "Unknown command: " + c.do);
    }
  }

  function consistency(c) {
    const yn = (v) => (["yes", "no", "unsure"].includes(v) ? v : "");
    c = c || {};
    return { follows: yn(c.follows), sameUnderAll: yn(c.sameUnderAll), dominates: yn(c.dominates), discriminator: clean(c.discriminator) };
  }
  function addPrediction(s, orientation, action, text) {
    const p = { id: nid(s, "p"), orientation, action, text: clean(text), locked: false, original: null, status: "pending", result: "", interpretation: "" };
    s.predictions.push(p);
    return p;
  }

  /* ---------- reading the state ---------- */
  function statement(o) {
    const f = (x) => bare(x) || "…";
    return "I think this situation is primarily " + f(o.inside) + " because " + f(o.explains) + ". The key constraint or opportunity is " + f(o.matters) + ". Therefore I expect " + f(o.observe) + ".";
  }
  function claim(o) { return "the situation is primarily " + (bare(o.inside) || "…"); }
  function actionSentence(s, a) {
    const o = find(s.orientations, a.orientation), p = a.prediction && find(s.predictions, a.prediction);
    return "Because I currently believe " + (o ? claim(o) : "…") + ", I will " + (lowerFirst(a.text) || "…") + ", and I expect to observe " + (p ? lowerFirst(p.text) : "…") + ".";
  }
  const expectedOf = (s, a) => { const p = a && a.prediction && find(s.predictions, a.prediction); return p ? p.text : ""; };
  const currentAction = (s) => s.actions.filter(open).slice(-1)[0] || null;

  function basis(s, o) {
    const its = itemsOf(s, o);
    const preds = s.predictions.filter((p) => p.orientation === o.id);
    return {
      supporting: its.filter((i) => i.ledger === "observed" && i.type !== "contradiction").length,
      contradictions: contradictionsOf(s, o).length,
      untested: its.filter((i) => i.type === "assumption" && i.status === "untested").length,
      weakened: its.filter((i) => i.type === "assumption" && i.status === "weakened").length,
      observed: preds.filter((p) => p.status === "observed").length,
      partial: preds.filter((p) => p.status === "partial").length,
      failed: preds.filter((p) => p.status === "not-observed").length,
    };
  }
  function basisText(b) {
    const n = (k, one, many) => k + " " + (k === 1 ? one : many);
    const out = [n(b.supporting, "supporting observation", "supporting observations"), n(b.contradictions, "contradiction", "contradictions"),
      n(b.untested, "untested assumption", "untested assumptions"), n(b.observed, "successful prediction", "successful predictions")];
    if (b.partial) out.push(n(b.partial, "partly observed prediction", "partly observed predictions"));
    if (b.failed) out.push(n(b.failed, "failed prediction", "failed predictions"));
    if (b.weakened) out.push(n(b.weakened, "weakened assumption", "weakened assumptions"));
    return out;
  }
  const outcomesOf = (s, o) => s.outcomes.filter((r) => { const a = find(s.actions, r.action); return a && a.orientation === o.id; });

  function triggers(s) {
    const o = current(s), out = [];
    if (!o) return out;
    const has = new Set(o.items), add = (id, detail) => out.push({ id, label: D.triggers.find((t) => t.id === id).label, detail });
    const surprises = s.items.filter((i) => i.surprise && i.status === "active" && !has.has(i.id));
    if (surprises.length) add("surprise", surprises.map((i) => i.text).join("; "));
    const failed = s.predictions.filter((p) => p.orientation === o.id && p.status === "not-observed");
    if (failed.length >= 2) add("failed-predictions", failed.length + " predictions from " + label(s, o) + " were not observed");
    const contra = contradictionsOf(s, o);
    if (contra.length) add("contradiction", contra.map((i) => i.text).join("; "));
    if (!bare(o.move) && !s.actions.some((a) => a.orientation === o.id)) add("no-action", "The orientation names no move it opens");
    const outs = outcomesOf(s, o);
    const fails = outs.filter((r) => r.effect === "not");
    if (fails.length >= 2) add("action-failures", fails.length + " actions under " + label(s, o) + " did not produce the expected effect");
    const stale = itemsOf(s, o).filter((i) => i.provenance.includes("stale"));
    if (stale.length) add("stale", stale.map((i) => i.text).join("; "));
    if (outs.some((r) => r.changedEnvironment === "yes")) add("environment", "An outcome changed the environment itself");
    if (s.tempo === "high" && outs.filter((r) => r.effect === "not" || r.effect === "partial").length >= 2) add("tempo", "Tempo is high and recent results are worse than expected");
    const causal = new Set(itemsOf(s, o, "causal").map((i) => i.id));
    if (contra.some((c) => c.refs.some((r) => causal.has(r)))) add("causal-break", "An open contradiction refers to a causal claim this orientation depends on");
    return out;
  }

  function boundaryText(s, o) { const b = o.boundary && find(s.items, o.boundary); return b ? b.text : ""; }
  function equivalent(s, a, b) {
    const as = (o) => itemsOf(s, o).filter((i) => i.type === "assumption" || i.type === "causal").map((i) => i.text).sort().join(" | ");
    return similar(boundaryText(s, a), boundaryText(s, b)) && similar(as(a), as(b)) && similar(a.mechanism, b.mechanism) && similar(a.move, b.move);
  }
  const activeCandidates = (s) => (s.workspace ? s.workspace.candidates.map((id) => find(s.orientations, id)).filter((o) => o.status === "candidate") : []);

  function diagnostics(s) {
    const out = [], o = current(s);
    const add = (rule, target, detail) => {
      const d = D.diagnostics.find((x) => x.id === rule);
      out.push({ rule, title: d.title, message: d.message, target, detail: detail || "" });
    };
    const cands = activeCandidates(s);
    const pool = o && cands.length ? [o, ...cands] : [];
    for (let i = 0; i < pool.length; i += 1)
      for (let j = i + 1; j < pool.length; j += 1)
        if (equivalent(s, pool[i], pool[j])) add("rewording", pool[j].id, label(s, pool[j]) + " and " + label(s, pool[i]) + " share the same boundary, assumptions, mechanism and move.");
    if (pool.length >= 2) {
      const bs = pool.map((x) => boundaryText(s, x));
      if (bs[0] && bs.every((b) => similar(b, bs[0]))) add("boundary-lock", o.id, "Shared boundary: " + bs[0]);
    }
    for (const x of o ? [o, ...cands] : []) if (!bare(x.falsifier)) add("untestable", x.id, label(s, x) + " is hard to test.");
    if (o) {
      const fails = outcomesOf(s, o).filter((r) => r.effect === "not");
      if (fails.length >= 2) {
        const adoptedAt = s.history.findIndex((h) => (h.kind === "transition" && h.to === o.id) || (h.kind === "situation" && h.orientation === o.id));
        const raised = s.history.slice(adoptedAt + 1).some((h) => h.kind === "tempo" && TEMPOS.indexOf(h.to) > TEMPOS.indexOf(h.from));
        const again = s.actions.some((a) => a.orientation === o.id && open(a));
        if (s.tempo === "high" || raised || again) add("tempo-substitution", o.id, fails.length + " failed actions under " + label(s, o) + ".");
      }
      for (const k of itemsOf(s, o, "constraint")) if (!k.tested) add("untested-constraint", k.id, k.text);
      const a = currentAction(s);
      if (a) {
        const c = a.consistency;
        if (!bare(expectedOf(s, a)) || (c.sameUnderAll === "yes" && c.dominates !== "yes")) add("low-information", a.id, a.text);
        const ao = find(s.orientations, a.orientation);
        if (!ao || !bare(ao.inside)) add("untraced-action", a.id, a.text);
      }
    }
    for (const it of s.items) if (it.ledger === "observed" && live(it) && MARKERS.test(it.text)) add("collapse", it.id, it.text);
    for (const p of s.predictions) if (p.locked && p.original !== p.text) add("prediction-drift", p.id, "Original: " + p.original);
    return out;
  }

  function deepMemory(s, o) {
    const out = [];
    if (!o) return out;
    const before = s.orientations.filter((p) => p.id !== o.id && (p.status === "superseded" || p.status === "rejected"));
    const mine = itemsOf(s, o).filter((i) => ["assumption", "causal", "interpretation"].includes(i.type)).map((i) => ({ id: i.id, text: i.text }));
    if (bare(o.keyAssumption)) mine.push({ id: null, text: o.keyAssumption });
    const seen = new Set();
    for (const m of mine) {
      for (const p of before) {
        const hit = itemsOf(s, p).find((b) => b.status === "weakened" && (b.id === m.id || similar(b.text, m.text)));
        if (!hit || seen.has(p.id + hit.id)) continue;
        seen.add(p.id + hit.id);
        const r = s.outcomes.find((x) => x.weakened.includes(hit.id));
        out.push({ kind: "assumption", orientation: p.id, item: hit.id,
          text: "You previously used this same assumption in " + label(s, p) + ": “" + hit.text + "”. " + (r ? "It was weakened by outcome " + label(s, r) + "." : "It is marked weakened.") });
      }
    }
    const open = contradictionsOf(s, o);
    for (const p of before.filter((p) => p.status === "superseded")) {
      for (const c of open) if (contradictionsOf(s, p).includes(c)) out.push({ kind: "unexplained", orientation: p.id, item: c.id, text: "A previous orientation, " + label(s, p) + ", was replaced while the same contradiction stayed open: “" + c.text + "”." });
      if (bare(o.fails) && bare(p.fails) && similar(o.fails, p.fails)) out.push({ kind: "unexplained", orientation: p.id, item: null, text: "A previous orientation, " + label(s, p) + ", failed to explain the same thing: “" + bare(p.fails) + "”." });
    }
    return out;
  }

  function guided(s) {
    const o = current(s), ws = s.workspace;
    if (!o) return [];
    const trig = new Set(triggers(s).map((t) => t.id)), diag = new Set(diagnostics(s).map((d) => d.rule));
    const cond = {
      contradiction: contradictionsOf(s, o).length > 0, "boundary-lock": diag.has("boundary-lock"), "action-failures": trig.has("action-failures"),
      "no-falsifier": !bare(o.falsifier), "untested-constraint": itemsOf(s, o, "constraint").some((k) => !k.tested), stale: trig.has("stale"),
      tempo: trig.has("tempo"), objects: itemsOf(s, o).some((i) => i.type === "object" || i.type === "function"), always: true,
    };
    const out = [];
    for (const g of D.guided) {
      if (!cond[g.when]) continue;
      for (const id of g.ops) {
        const op = OPS.get(id);
        if (out.length < 3 && !out.some((x) => x.op === id) && (!op.deep || (ws && ws.deep))) out.push({ op: id, why: g.why });
      }
    }
    return out;
  }
  const jolt = (s) => D.jolts[(s.workspace ? s.workspace.jolt : 0) % D.jolts.length];

  function creationPrompts(s) {
    const frags = fragments(s).filter((f) => f.kind !== "destroyed");
    if (!frags.length) return [];
    const o = current(s), created = frags.filter((f) => f.kind === "created");
    const openRefs = new Set(contradictionsOf(s, o).flatMap((c) => c.refs));
    const unexplained = frags.filter((f) => f.item.type === "signal" && (!o.items.includes(f.id) || openRefs.has(f.id) || f.item.surprise));
    const pick = (type, pool) => (type === "unexplained" ? unexplained[0] : pool.find((f) => f.item.type === type));
    const out = [];
    for (const t of D.creation) {
      const a = pick(t.a, created) || (t.a === "intention" || t.a === "boundary" ? pick(t.a, frags) : null);
      const b = pick(t.b, frags.filter((f) => !a || f.id !== a.id));
      if (a && b) out.push({ id: t.id, label: t.label, text: t.text.replace("{a}", bare(a.item.text)).replace("{b}", bare(b.item.text)), from: [a.id, b.id] });
    }
    return out;
  }

  function contrast(s) {
    const o = current(s);
    if (!o) return [];
    return [o, ...activeCandidates(s)].map((x) => {
      const its = itemsOf(s, x), c = contradictionsOf(s, x);
      return {
        id: x.id, label: label(s, x), current: x === o, statement: statement(x), boundary: boundaryText(s, x),
        explained: its.filter((i) => i.type === "signal").map((i) => i.text).concat(bare(x.explains) ? ["Explains: " + bare(x.explains)] : []),
        contradictions: c.map((i) => i.text).concat(bare(x.fails) ? ["Fails to explain: " + bare(x.fails)] : []),
        assumptions: its.filter((i) => i.type === "assumption" || i.type === "causal").map((i) => i.text).concat(bare(x.keyAssumption) ? ["Key: " + bare(x.keyAssumption)] : []),
        predictions: (bare(x.observe) ? [bare(x.observe)] : []).concat(s.predictions.filter((p) => p.orientation === x.id).map((p) => p.text)),
        moves: bare(x.move) ? [bare(x.move)] : [],
        reversibility: x.tags.reversibility || "", cost: x.tags.cost || "", speed: x.tags.speed || "",
        falsifier: bare(x.falsifier) || "", hardToTest: !bare(x.falsifier), confidence: x.confidence, basis: basis(s, x),
      };
    });
  }

  function readiness(s) {
    const o = current(s), a = currentAction(s);
    return { orientation: !!(o && bare(o.inside)), action: !!a, expected: !!(a && bare(expectedOf(s, a))), reconsider: !!(a && a.reconsider) };
  }

  /* The lineage tree: every orientation under its parent, in creation order, with the transition into it. */
  function lineage(s) {
    const rows = [];
    const walk = (parent, depth) => {
      for (const o of s.orientations.filter((x) => x.parent === parent)) {
        rows.push({ id: o.id, label: label(s, o), status: o.status, depth, loop: o.loop, transition: s.history.find((h) => h.kind === "transition" && h.to === o.id) || null });
        walk(o.id, depth + 1);
      }
    };
    walk(null, 0);
    return rows;
  }
  function currentLineage(s) {
    const chain = [];
    for (let o = current(s); o; o = o.parent ? find(s.orientations, o.parent) : null) chain.unshift(o);
    return chain;
  }
  /* Kept / Destroyed / Created for one transition, resolved to items. Presentation options never change it. */
  function signature(s, transitionId) {
    const t = s.history.find((h) => h.id === transitionId && h.kind === "transition");
    if (!t) return null;
    const res = (ids) => ids.map((id) => find(s.items, id)).filter(Boolean).map((i) => ({ id: i.id, type: i.type, text: i.text }));
    return { from: labelOf(s, t.from), to: labelOf(s, t.to), kept: res(t.kept), destroyed: res(t.destroyed), created: res(t.created) };
  }

  /* ---------- search ---------- */
  const COMMANDS = [
    ["add-signal", "Add signal", "observation reality new"], ["add-assumption", "Add assumption", "inference"], ["add-contradiction", "Add contradiction", "conflict"],
    ["reorient", "Reorient", "destroy destruction creative"], ["deep-reset", "Deep reset", "destroy everything intent goal"], ["compare", "Compare candidates", "contrast"],
    ["record-outcome", "Record outcome", "observe result happened"], ["open-lineage", "Open lineage", "history kept destroyed created"],
    ["show-predictions", "Show prediction ledger", "predictions expected"], ["new", "New situation", "start blank"], ["import", "Import JSON", "load file"],
    ["export", "Export JSON", "save download archive"], ["copy-markdown", "Copy Markdown", "share export"], ["reset", "Reset", "clear delete"], ["how", "How this works", "help method ooda"],
  ];
  const norm = (t) => String(t || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();

  function records(s) {
    const out = [];
    const o = current(s);
    for (const [id, title, keys] of COMMANDS) out.push({ kind: "command", type: "Command", id, title, text: "", keys, location: "Command" });
    if (o) {
      const cands = new Set(activeCandidates(s).map((x) => x.id));
      for (const it of s.items) {
        if (!live(it)) continue;
        const T = TYPES.get(it.type);
        const where = it.type === "contradiction" || it.ledger !== "inferred" ? "Reality ledger" : o.items.includes(it.id) ? "Current orientation" : "Reality ledger · inferred";
        out.push({ kind: "record", type: it.type === "signal" ? "Signal" : T.label, ledger: it.ledger, id: it.id, title: it.text, text: it.provenance.join(" "), location: where, loop: null, target: { stage: it.ledger === "inferred" ? "model" : "reality", id: it.id } });
      }
      for (const x of s.orientations) {
        const historical = x.status === "superseded" || x.status === "rejected";
        out.push({ kind: "record", type: x === o ? "Current orientation" : cands.has(x.id) ? "Candidate orientation" : "Historical orientation", id: x.id,
          title: label(s, x) + ": " + (bare(x.inside) || "untitled"), text: statement(x) + " " + x.move + " " + x.mechanism + " " + boundaryText(s, x),
          location: x === o ? "Current orientation" : cands.has(x.id) ? "Candidates" : "Lineage · " + label(s, x) + " " + x.status, loop: historical ? x.loop : null,
          target: { stage: x === o ? "model" : cands.has(x.id) ? "compare" : "lineage", id: x.id, inspect: historical ? x.id : null } });
      }
      for (const p of s.predictions) out.push({ kind: "record", type: "Prediction", id: p.id, title: p.text, text: p.result + " " + p.interpretation, location: "Prediction ledger", loop: (find(s.actions, p.action) || {}).loop || null, target: { stage: "observe", id: p.id } });
      for (const a of s.actions) out.push({ kind: "record", type: "Action", id: a.id, title: a.text, text: a.reconsider, location: open(a) ? "Action" : "Loop " + a.loop + (a.status === "abandoned" ? " · abandoned" : ""), loop: a.loop, target: { stage: "act", id: a.id } });
      for (const r of s.outcomes) out.push({ kind: "record", type: "Outcome", id: r.id, title: r.observed, text: [r.surprise, r.absent, r.interpretation].join(" "), location: "Outcomes", loop: r.loop, target: { stage: "observe", id: r.id } });
    }
    for (const e of D.examples) out.push({ kind: "record", type: "Example", id: "ex-" + e.id, title: e.title, text: e.purpose + " " + e.note, location: "Examples", target: { stage: "example", id: e.id } });
    for (const c of D.cards) out.push({ kind: "record", type: "Example card", id: "card-" + c.id, title: c.title, text: c.lesson + " " + c.text, location: "Examples · from the author's OODA notes", target: { stage: "example", id: "card-" + c.id } });
    for (const op of D.operations) out.push({ kind: "record", type: "Destruction operation", id: "op-" + op.id, title: op.label, text: op.challenge + " " + D.families.find((f) => f.id === op.family).label, location: "Method", target: { stage: "method", id: "op-" + op.id } });
    for (const m of D.methodology.why.concat(D.methodology.rao)) out.push({ kind: "record", type: "Help", id: m.id, title: m.title, text: m.text, location: "Why this works this way", target: { stage: "method", id: m.id } });
    return out;
  }

  /* Ranks: 0 exact title, 1 title starts with the phrase, 2 phrase contained, 3 every token present, 4 some tokens. */
  function search(s, query, limit) {
    const q = norm(query), all = records(s);
    if (!q) return { results: all.filter((r) => r.kind === "command").slice(0, limit || 50), total: COMMANDS.length };
    const qt = q.split(" ");
    const scored = [];
    all.forEach((r, i) => {
      const t = norm(r.title), h = norm(r.title + " " + r.text + " " + (r.keys || "") + " " + r.type), words = h.split(" ");
      let tier = null, hits = 0;
      if (t === q) tier = 0;
      else if (t.startsWith(q)) tier = 1;
      else if ((" " + h + " ").includes(" " + q) || h.includes(q)) tier = 2;
      else if (qt.every((x) => words.includes(x))) tier = 3;
      else {
        hits = qt.filter((x) => words.some((w) => w.startsWith(x))).length;
        if (hits) tier = 4;
      }
      if (tier !== null) scored.push({ r, tier, hits, i });
    });
    scored.sort((a, b) => a.tier - b.tier || b.hits - a.hits || a.i - b.i);
    return { results: scored.slice(0, limit || 50).map((x) => Object.assign({ rank: x.tier }, x.r)), total: scored.length };
  }
  /* Where a result lives. A pure description of a view; it never changes the planner state. */
  function navigate(s, rec) { return rec && rec.target ? { stage: rec.target.stage, id: rec.target.id, inspect: rec.target.inspect || null } : null; }

  /* ---------- import, export, persistence ---------- */
  function check(st) {
    const bad = [];
    const need = (ok, what) => { if (!ok) bad.push(what); };
    if (!st || typeof st !== "object" || Array.isArray(st)) return ["not an object"];
    need(st.schemaVersion === SCHEMA, "schemaVersion");
    for (const k of ["items", "orientations", "predictions", "actions", "outcomes", "history", "links"]) need(Array.isArray(st[k]), k);
    if (bad.length) return bad;
    need(st.situation && typeof st.situation.title === "string" && typeof st.situation.description === "string", "situation");
    need(TEMPOS.includes(st.tempo), "tempo");
    need(D.modes.some((m) => m.id === st.mode), "mode");
    need(Number.isInteger(st.seq) && Number.isInteger(st.loop) && st.loop >= 1, "counters");
    need(st.uiPreferences && typeof st.uiPreferences === "object", "uiPreferences");
    const ids = new Set();
    for (const k of ["items", "orientations", "predictions", "actions", "outcomes", "history", "links"])
      for (const x of st[k]) { need(x && typeof x.id === "string" && !ids.has(x.id), "unique id " + (x && x.id)); ids.add(x && x.id); }
    if (bad.length) return bad;
    const has = (list, id) => list.some((x) => x.id === id);
    for (const it of st.items) {
      const T = TYPES.get(it.type);
      need(T && typeof it.text === "string" && Array.isArray(it.provenance) && Array.isArray(it.refs), "item " + it.id);
      need(T && (T.fixed ? it.ledger === T.ledger : ["observed", "inferred"].includes(it.ledger)), "ledger of " + it.id);
    }
    need(st.intent === null || has(st.items, st.intent), "intent");
    let adopted = 0;
    for (const o of st.orientations) {
      need(O_STATUS.includes(o.status) && Array.isArray(o.items), "orientation " + o.id);
      need(o.parent === null || has(st.orientations, o.parent), "parent of " + o.id);
      need((o.items || []).every((id) => has(st.items, id)) && (o.boundary === null || has(st.items, o.boundary)), "items of " + o.id);
      for (const f of FIELDS) need(typeof o[f] === "string", f + " of " + o.id);
      if (o.status === "adopted") adopted += 1;
    }
    need(st.orientations.length === 0 || adopted === 1, "exactly one adopted orientation");
    for (const p of st.predictions) {
      need(has(st.orientations, p.orientation), "orientation of " + p.id);
      need(p.action === null || has(st.actions, p.action), "action of " + p.id);
      need(PRED_STATUS.includes(p.status) && typeof p.text === "string" && (!p.locked || typeof p.original === "string"), "prediction " + p.id);
    }
    for (const a of st.actions) need(A_STATUS.includes(a.status) && has(st.orientations, a.orientation) && (a.prediction === null || has(st.predictions, a.prediction)), "action " + a.id);
    need(st.actions.filter(open).length <= 1, "one open action");
    for (const r of st.outcomes) need(has(st.actions, r.action), "outcome " + r.id);
    for (const h of st.history) if (h.kind === "transition") need(has(st.orientations, h.from) && has(st.orientations, h.to), "lineage edge " + h.id);
    if (st.workspace) {
      const w = st.workspace;
      need(has(st.orientations, w.from) && Array.isArray(w.moves) && Array.isArray(w.candidates) && w.candidates.every((id) => has(st.orientations, id)) && w.moves.every((m) => has(st.items, m.result)), "workspace");
    }
    return bad;
  }

  /* schemaVersion 1 was the planner's first draft format: items carried `kind` and `observed: true | false | null`,
   * orientations a `statement` object and a free-text boundary, predictions `frozen`, actions `kind`. */
  const MIGRATIONS = {
    1(v) {
      const s = blank();
      s.situation = { title: String(v.situation && v.situation.title || ""), description: String(v.situation && v.situation.description || "") };
      if (v.situation && TEMPOS.includes(v.situation.tempo)) s.tempo = v.situation.tempo;
      if (v.situation && D.modes.some((m) => m.id === v.situation.mode)) s.mode = v.situation.mode;
      const used = [];
      const keep = (id) => { used.push(id); return id; };
      for (const i of v.items || []) {
        const T = TYPES.get(i.kind) || TYPES.get("interpretation");
        const ledger = T.fixed ? T.ledger : i.observed === true ? "observed" : "inferred";
        s.items.push({ id: keep(String(i.id)), type: T.id, text: clean(i.text), ledger, provenance: (i.notes || []).filter((q) => D.qualifiers.some((x) => x.id === q)),
          status: T.id === "contradiction" ? "open" : T.id === "assumption" ? "untested" : "active", confidence: T.id === "assumption" ? "working" : "", refs: [], loop: 1, origin: null });
        if (T.id === "constraint") s.items[s.items.length - 1].tested = false;
      }
      let n = 0;
      const fresh = (p) => { let id; do { n += 1; id = p + "m" + n; } while (used.includes(id)); return keep(id); };
      if (clean(v.intent)) {
        s.intent = fresh("i");
        s.items.push({ id: s.intent, type: "intention", text: clean(v.intent), ledger: "inferred", provenance: [], status: "active", confidence: "", refs: [], loop: 1, origin: null });
      }
      for (const o of v.orientations || []) {
        const st = o.statement || {};
        const x = { id: keep(String(o.id)), parent: o.parent == null ? null : String(o.parent), status: O_STATUS.includes(o.status) ? o.status : "superseded", loop: 1,
          boundary: null, items: (o.assumptions || []).map(String), confidence: "tenuous", tags: {}, creation: { kind: "migrated", from: [], prompt: "" } };
        for (const f of FIELDS) x[f] = "";
        Object.assign(x, { inside: clean(st.model), explains: clean(st.evidence), matters: clean(st.lever), observe: clean(st.prediction), falsifier: clean(o.falsifier) });
        if (clean(o.boundary)) {
          const b = { id: fresh("i"), type: "boundary", text: clean(o.boundary), ledger: "inferred", provenance: [], status: "active", confidence: "", refs: [], loop: 1, origin: null };
          s.items.push(b);
          x.boundary = b.id;
          x.items.push(b.id);
        }
        if (x.status === "adopted" && s.intent) x.items.push(s.intent);
        s.orientations.push(x);
      }
      for (const p of v.predictions || []) s.predictions.push({ id: keep(String(p.id)), orientation: String(p.orientation), action: p.action == null ? null : String(p.action), text: clean(p.text),
        locked: !!p.frozen, original: p.frozen ? clean(p.text) : null, status: PRED_STATUS.includes(p.outcome) ? p.outcome : "pending", result: "", interpretation: "" });
      for (const a of v.actions || []) {
        const p = s.predictions.find((x) => x.action === String(a.id));
        s.actions.push({ id: keep(String(a.id)), orientation: String(a.orientation), type: D.actionTypes.some((t) => t.id === a.kind) ? a.kind : "probe", text: clean(a.text),
          prediction: p ? p.id : null, reconsider: clean(a.reconsider), refs: [], consistency: consistency(), info: [], status: ["draft", "started", "done"].includes(a.status) ? a.status : "done", loop: 1 });
      }
      for (const r of v.outcomes || []) s.outcomes.push({ id: keep(String(r.id)), action: String(r.action), loop: 1, observed: clean(r.observed), surprise: clean(r.surprise), absent: "",
        changedEnvironment: "unsure", weakened: [], strengthened: [], betterFit: "", reorient: "", interpretation: clean(r.interpretation), attribution: "", effect: "", signals: [] });
      s.seq = used.reduce((m, id) => Math.max(m, Number((/(\d+)$/.exec(id) || [0, 0])[1])), 0);
      s.loop = 1 + s.outcomes.length;
      for (const o of s.orientations) if (o.parent && o.status !== "rejected") s.history.push({ id: nid(s, "h"), kind: "transition", loop: 1, from: o.parent, to: o.id, kept: [], destroyed: [], created: [], rejected: [], deep: false, evidence: [], note: "Migrated from schema version 1", moves: [] });
      return s;
    },
  };
  function migrate(v) {
    let x = v;
    while (x && Number.isInteger(x.schemaVersion) && x.schemaVersion < SCHEMA) {
      const step = MIGRATIONS[x.schemaVersion];
      if (!step) return null;
      x = step(x);
    }
    return x;
  }

  function exportJSON(s) { return JSON.stringify(s, null, 1) + "\n"; }
  function importText(text) {
    let v;
    try { v = JSON.parse(String(text)); } catch (e) { return { ok: false, message: MSG.invalid }; }
    if (!v || typeof v !== "object" || !Number.isInteger(v.schemaVersion)) return { ok: false, message: MSG.invalid };
    if (v.schemaVersion > SCHEMA) return { ok: false, message: MSG.future };
    let st;
    try { st = migrate(v); } catch (e) { st = null; }
    if (!st || check(st).length) return { ok: false, message: MSG.invalid };
    return { ok: true, state: st, migrated: v.schemaVersion !== SCHEMA };
  }
  function save(storage, s) {
    try { storage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  }
  function load(storage) {
    let text;
    try { text = storage.getItem(KEY); } catch (e) { return { state: null, message: MSG.storage, unavailable: true }; }
    if (text == null) return { state: null };
    const r = importText(text);
    return r.ok ? { state: r.state } : { state: null, message: r.message };
  }
  function clear(storage) { try { storage.removeItem(KEY); return true; } catch (e) { return false; } }

  /* ---------- Markdown ---------- */
  function markdown(s) {
    const o = current(s), L = [];
    const it = (i) => (i.type === "signal" ? "" : "[" + TYPES.get(i.type).label + "] ") + i.text + (i.provenance.length ? " (" + i.provenance.map((q) => D.qualifiers.find((x) => x.id === q).label).join(", ") + ")" : "") + (i.status === "weakened" ? " — weakened" : i.status === "supported" ? " — supported" : "");
    const list = (xs, empty) => (xs.length ? xs.map((x) => "- " + x) : ["- " + empty]);
    const items = s.items.filter(live);
    L.push("# " + (s.situation.title || "Untitled situation"), "");
    if (s.situation.description) L.push(s.situation.description, "");
    const intent = s.intent && find(s.items, s.intent);
    L.push("Intent: " + (intent ? intent.text : "not stated") + " · Tempo: " + s.tempo + " · Mode: " + D.modes.find((m) => m.id === s.mode).label + " · Loop " + s.loop, "");
    L.push("## Current reality", "", "### Observed", ...list(items.filter((i) => i.ledger === "observed" && i.type !== "contradiction").map(it), "Nothing recorded"), "");
    L.push("### Inferred", ...list(items.filter((i) => i.ledger === "inferred").map(it), "Nothing recorded"), "");
    L.push("### Unknown", ...list(items.filter((i) => i.ledger === "unknown").map(it), "Nothing recorded"), "");
    L.push("### Contradictions", ...list(items.filter((i) => i.type === "contradiction").map((i) => i.text + " — " + i.status + (i.reason ? " (" + i.reason + ")" : "")), "None recorded"), "");
    L.push("## Orientation lineage", "");
    for (const row of lineage(s)) {
      const x = find(s.orientations, row.id);
      L.push("### " + row.label + " (" + row.status + ")", "", statement(x));
      const b = boundaryText(s, x);
      if (b) L.push("", "Boundary: " + b);
      if (row.transition) {
        const sig = signature(s, row.transition.id), names = (xs) => xs.map((i) => i.text).join("; ") || "nothing";
        L.push("", "From " + sig.from + ": kept " + names(sig.kept) + ". Destroyed " + names(sig.destroyed) + ". Created " + names(sig.created) + ".");
        if (row.transition.note) L.push("", "Why: " + row.transition.note);
      }
      L.push("");
    }
    L.push("## Current orientation", "");
    if (o) {
      L.push(statement(o), "", "Falsifier: " + (bare(o.falsifier) || "Hard to test"), "", "Confidence: " + o.confidence + " (" + basisText(basis(s, o)).join(", ") + ")", "");
    } else L.push("None yet.", "");
    L.push("## Current decision", "");
    const a = currentAction(s) || s.actions.filter((x) => x.status === "done").slice(-1)[0];
    if (a) {
      const x = find(s.orientations, a.orientation);
      L.push("Because " + claim(x) + ",", "I will " + lowerFirst(a.text) + " (" + a.type + "),", "I expect " + (lowerFirst(expectedOf(s, a)) || "…") + ".", "Reconsider if " + (lowerFirst(a.reconsider) || "…") + ".", "");
    } else L.push("No action chosen yet.", "");
    L.push("## Prediction ledger", "");
    if (!s.predictions.length) L.push("No predictions yet.");
    for (const p of s.predictions) {
      L.push("- " + label(s, p) + " (" + labelOf(s, p.orientation) + (p.locked ? ", frozen" : ", editable") + "): before acting I expected " + lowerFirst(p.locked ? p.original : p.text) + ".");
      if (p.status !== "pending") L.push("  Reality (" + p.status + "): " + bare(p.result) + ".", "  Interpretation: " + (bare(p.interpretation) || "not recorded") + ".");
    }
    L.push("", "## Outcomes", "");
    if (!s.outcomes.length) L.push("No outcomes yet.");
    for (const r of s.outcomes) {
      L.push("- " + label(s, r) + " (loop " + r.loop + ", after " + labelOf(s, r.action) + "): " + bare(r.observed) + ".");
      if (r.surprise) L.push("  Surprise: " + bare(r.surprise) + ".");
      if (r.interpretation) L.push("  Interpretation: " + bare(r.interpretation) + ".");
    }
    return L.join("\n") + "\n";
  }

  /* Replays a worked example: its steps are ordinary commands whose "as" names stand for the ids they create. */
  const REFKEYS = ["id", "targets", "refs", "items", "from", "evidence", "action", "boundary", "betterFit", "weakened", "strengthened", "orientation"];
  function replay(example, upto) {
    let s = blank();
    const alias = {}, steps = example.steps.slice(0, upto == null ? example.steps.length : upto);
    const res = (v) => (Array.isArray(v) ? v.map(res) : typeof v === "string" && alias[v] ? alias[v] : v);
    for (const step of steps) {
      const c = {};
      for (const [k, v] of Object.entries(step)) if (k !== "as") c[k] = REFKEYS.includes(k) ? res(v) : v;
      const r = apply(s, c);
      if (r.error) throw new Error(example.id + " step " + step.do + ": " + r.error.message);
      s = r.state;
      if (step.as) alias[step.as] = r.id;
    }
    return { state: s, alias };
  }

  return {
    SCHEMA, KEY, MSG, init, blank, apply, current, label, labelOf, locked, fragments, triggers, diagnostics, deepMemory, guided, jolt, creationPrompts,
    contrast, readiness, lineage, currentLineage, signature, statement, actionSentence, expectedOf, currentAction, basis, basisText, contradictionsOf,
    records, search, navigate, check, migrate, exportJSON, importText, save, load, clear, markdown, replay, similar, equivalent, itemsOf, boundaryText,
  };
});
