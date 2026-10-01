/* Orient: the interface. Every change goes through OrientLogic.apply; this file only renders and routes events. */
(function () {
  "use strict";
  const D = JSON.parse(document.getElementById("oo-data").textContent);
  const L = window.OrientLogic;
  L.init(D);
  const $ = (id) => document.getElementById(id);
  const app = $("app"), announcer = $("announce");
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const TYPE = new Map(D.itemTypes.map((t) => [t.id, t]));
  const OPS = new Map(D.operations.map((o) => [o.id, o]));
  const STAGES = D.stages.map((s) => s.id);
  const LEDGER = { observed: ["obs", "Observed"], inferred: ["inf", "Inferred"], unknown: ["unk", "Unknown"] };
  const MAC = /Mac|iPhone|iPad/.test((typeof navigator !== "undefined" && (navigator.platform || navigator.userAgent)) || "");
  const MOD = MAC ? "⌘" : "Ctrl";

  let S = L.blank(), store = null, storeMsg = "";
  const view = { edit: null, op: null, error: null, draft: {}, inspect: null, allDims: false, moreQ: false, flash: null, animate: null, pending: false };

  /* ---------- storage ---------- */
  try { store = window.localStorage; store.getItem(L.KEY); } catch (e) { store = null; }
  if (store) {
    const r = L.load(store);
    if (r.state) S = r.state;
    if (r.message) storeMsg = r.message;
  } else storeMsg = L.MSG.storage;
  function persist() { if (store && !L.save(store, S)) storeMsg = L.MSG.storage; }

  function announce(msg) { announcer.textContent = ""; setTimeout(() => { announcer.textContent = msg; }, 30); }

  function commit(cmd, msg, opts) {
    const r = L.apply(S, cmd);
    if (r.error) {
      view.error = { at: opts && opts.at || cmd.do, message: r.error.message };
      announce(r.error.message);
      render();
      return null;
    }
    S = r.state;
    view.error = null;
    persist();
    if (msg) announce(msg);
    if (opts && opts.soft) scheduleRender(); else render();
    return r.id === undefined ? true : r.id;
  }
  let pointer = false;
  function scheduleRender() { view.pending = true; if (!pointer) setTimeout(flush, 0); }
  function flush() { if (view.pending) { view.pending = false; render(); } }
  document.addEventListener("pointerdown", () => { pointer = true; }, true);
  document.addEventListener("pointerup", () => { setTimeout(() => { pointer = false; flush(); }, 60); }, true);

  /* ---------- small builders ---------- */
  const attrs = (o) => Object.entries(o || {}).filter(([, v]) => v !== null && v !== undefined && v !== false).map(([k, v]) => (v === true ? " " + k : " " + k + '="' + esc(v) + '"')).join("");
  const btn = (act, label, o) => '<button type="button" data-act="' + act + '"' + attrs(Object.assign({ "data-k": act + ":" + ((o && o["data-id"]) || "") }, o)) + ">" + label + "</button>";
  const draft = (form, name, dflt) => { const d = view.draft[form]; return d && name in d ? d[name] : dflt; };
  const field = (form, name, labelText, value, o) => {
    const id = form + "-" + name, v = draft(form, name, value == null ? "" : value), big = o && o.big;
    return '<label for="' + id + '">' + labelText + "</label>" + (big
      ? '<textarea id="' + id + '" name="' + name + '" rows="2"' + attrs(o && o.a) + ">" + esc(v) + "</textarea>"
      : '<input id="' + id + '" name="' + name + '" value="' + esc(v) + '"' + attrs(o && o.a) + ">");
  };
  const select = (form, name, labelText, options, value, o) => {
    const id = form + "-" + name, v = draft(form, name, value);
    return (labelText ? '<label for="' + id + '">' + labelText + "</label>" : "") + '<select id="' + id + '" name="' + name + '"' + attrs(o) + ">" +
      options.map(([k, t]) => '<option value="' + esc(k) + '"' + (k === v ? " selected" : "") + ">" + esc(t) + "</option>").join("") + "</select>";
  };
  const radios = (form, name, legend, options, value) => '<fieldset><legend>' + legend + '</legend><div class="opts">' + options.map(([k, t]) =>
    '<label class="opt"><input type="radio" name="' + name + '" value="' + esc(k) + '" id="' + form + "-" + name + "-" + k + '" data-redraw="' + form + '"' + (draft(form, name, value) === k ? " checked" : "") + "> " + esc(t) + "</label>").join("") + "</div></fieldset>";
  const yn = [["yes", "Yes"], ["no", "No"], ["unsure", "Unsure"]];
  const errFor = (at) => (view.error && view.error.at === at ? '<p class="err" role="alert">' + esc(view.error.message) + "</p>" : "");
  const item = (id) => S.items.find((i) => i.id === id);
  const orient = (id) => S.orientations.find((o) => o.id === id);
  const typeLabel = (t) => TYPE.get(t).label;
  const live = (i) => i && i.status !== "withdrawn";
  const empty = (text) => '<p class="empty">' + text + "</p>";
  const qualLabel = (q) => D.qualifiers.find((x) => x.id === q).label;

  /* ---------- items ---------- */
  function itemRow(it, ro) {
    const led = LEDGER[it.ledger];
    const tags = ['<span class="tag ' + led[0] + '">' + led[1] + "</span>"].concat(it.type === "unknown" ? [] : ['<span class="tag">' + esc(typeLabel(it.type)) + "</span>"]);
    for (const q of it.provenance) tags.push('<span class="tag q">' + esc(qualLabel(q)) + "</span>");
    if (it.type === "contradiction") tags.push('<span class="tag ' + (it.status === "open" ? "red" : "") + '">' + esc(it.status) + "</span>");
    if (it.status === "weakened") tags.push('<span class="tag red">weakened</span>');
    if (it.status === "supported") tags.push('<span class="tag blue">supported</span>');
    if (it.status === "explained") tags.push('<span class="tag">explained</span>');
    if (it.surprise) tags.push('<span class="tag red">surprise</span>');
    if (it.origin && it.origin.move) tags.push('<span class="tag blue">created</span>');
    if (it.type === "constraint") tags.push('<span class="tag">' + (it.tested ? "tested as fixed" : "untested") + "</span>");
    let acts = "";
    if (!ro) {
      const a = [];
      if (it.ledger === "observed") a.push('<select data-act="qualify" data-id="' + it.id + '" id="q-' + it.id + '" aria-label="Challenge the provenance of: ' + esc(it.text) + '"><option value="">Challenge provenance…</option>' +
        D.qualifiers.filter((q) => !it.provenance.includes(q.id)).map((q) => '<option value="' + q.id + '">' + esc(q.label) + "</option>").join("") + "</select>");
      else if (it.type !== "intention") a.push(btn("promote", "Record as observed…", { class: "link", "data-id": it.id }));
      if (it.type === "contradiction") a.push(it.status === "open" ? btn("resolve", "Resolve…", { class: "link", "data-id": it.id }) + btn("dismiss", "Dismiss…", { class: "link", "data-id": it.id }) : btn("reopen", "Reopen", { class: "link", "data-id": it.id }));
      if (it.type === "assumption") a.push('<select data-act="confidence" data-id="' + it.id + '" id="cf-' + it.id + '" aria-label="Confidence in: ' + esc(it.text) + '">' + ["tenuous", "working", "strong"].map((c) => '<option' + (c === it.confidence ? " selected" : "") + ">" + c + "</option>").join("") + "</select>");
      if (it.type === "constraint") a.push('<label class="opt"><input type="checkbox" data-act="tested" data-id="' + it.id + '" id="t-' + it.id + '"' + (it.tested ? " checked" : "") + "> Tested as fixed</label>");
      if (it.surprise && it.status === "active") a.push(btn("explained", "Mark explained", { class: "link", "data-id": it.id }));
      if (it.type !== "contradiction" && it.type !== "intention") a.push(btn("withdraw", "Withdraw", { class: "link", "data-id": it.id }));
      acts = '<div class="acts">' + a.join("") + "</div>";
      if (view.edit && view.edit.id === it.id) {
        const k = view.edit.kind;
        acts += '<form data-form="' + k + '" data-id="' + it.id + '" class="stack">' +
          (k === "promote" ? field(k, "note", "What did you actually observe, and where?", "", { a: { required: true } }) + field(k, "text", "The observation (a new item; the inference stays)", it.text)
            : field(k, "reason", k === "dismiss" ? "Why dismiss it? (required)" : k === "resolve" ? "How is it resolved?" : "Why withdraw it?", "", { a: { required: k === "dismiss" } })) +
          errFor(k) + '<div class="row"><button type="submit" class="primary small">Save</button>' + btn("cancel-edit", "Cancel", { class: "small" }) + "</div></form>";
      }
    }
    return '<li class="item t-' + it.type + " l-" + it.ledger + '" id="it-' + it.id + '"><div class="meta">' + tags.join("") + "</div><div>" + esc(it.text) + "</div>" + acts + "</li>";
  }

  /* ---------- regions ---------- */
  function reality() {
    const items = S.items.filter(live);
    const col = (title, list, none) => "<div><h3>" + title + " <span class=\"muted\">" + list.length + "</span></h3>" + (list.length ? '<ul class="list">' + list.map((i) => itemRow(i)).join("") + "</ul>" : empty(none)) + "</div>";
    const types = D.itemTypes.map((t) => [t.id, t.label]);
    const ty = draft("add", "type", "signal"), T = TYPE.get(ty);
    return '<section id="reality" class="region reality" data-stage="reality" aria-labelledby="h-reality"><h2 id="h-reality">Reality <span class="tag">ledger</span></h2>' +
      '<p class="hint">Observed, inferred and unknown stay apart. An inference cannot be relabelled as an observation; a doubtful observation is qualified, never deleted.</p><div class="ledger">' +
      col("Observed signals", items.filter((i) => i.ledger === "observed" && i.type !== "contradiction"), "What have you actually seen, heard or measured?") +
      col("Inferred", items.filter((i) => i.ledger === "inferred"), "What are you reading into the signals?") +
      col("Contradictions", items.filter((i) => i.type === "contradiction"), "Nothing currently contradicts this orientation. That does not mean it is correct. Continue testing it.") +
      col("Unknowns", items.filter((i) => i.ledger === "unknown"), "What observation would most change your view?") + "</div>" +
      '<form data-form="add" class="add">' + "<div>" + select("add", "type", "Type", types, ty, { "data-redraw": "add" }) + "</div><div>" +
      (T.fixed ? '<label for="add-ledger-fixed">Ledger</label><input id="add-ledger-fixed" value="' + LEDGER[T.ledger][1] + '" readonly>' : select("add", "ledger", "Ledger", [["inferred", "Inferred"], ["observed", "Observed"]], "inferred")) +
      '</div><div class="grow">' + field("add", "text", "Statement", "") + '</div><div class="go"><button type="submit" class="primary">Add</button></div></form>' + errFor("item") + errFor("contradiction") + stageNav("reality") + "</section>";
  }

  function situationBlock() {
    const intent = S.intent && item(S.intent);
    return '<div class="grid2">' + "<div>" + field("sit", "title", "Situation", S.situation.title, { a: { "data-sit": "title" } }) + "</div><div>" +
      field("sit", "intent", "Intent: what are you trying to preserve, cause, avoid, discover or change?", intent ? intent.text : "", { a: { "data-sit": "intent" } }) + "</div></div>";
  }

  function orientationFields(o, form, ro) {
    const dis = ro ? { disabled: true } : {};
    const f = (name, text, big) => field(form, name, text, o[name], { big, a: Object.assign({ "data-field": name, "data-oid": o.id }, dis) });
    const bounds = S.items.filter((i) => live(i) && i.type === "boundary");
    return '<div class="grid2"><div>' + f("inside", "Model: what story explains the situation? (I think this situation is primarily…)", true) + "</div><div>" +
      f("explains", "Because… (what it explains)", true) + "</div><div>" + f("matters", "The key constraint or opportunity is…") + "</div><div>" +
      f("observe", "Therefore I expect… (an observable prediction)") + "</div><div>" + f("mechanism", "Causal mechanism") + "</div><div>" + f("move", "This orientation opens the move") + "</div><div>" +
      f("fails", "It fails to explain") + "</div><div>" + f("keyAssumption", "Key assumption") + "</div><div>" +
      select(form, "boundary", "System boundary", [["", bounds.length ? "No boundary chosen" : "Add a boundary item to the ledger"]].concat(bounds.map((b) => [b.id, b.text])), o.boundary || "", Object.assign({ "data-field": "boundary", "data-oid": o.id }, dis)) + "</div><div>" +
      f("falsifier", "What observation would make this orientation substantially less credible?") + "</div></div>";
  }

  function roFields(o) {
    const rows = [["Model", o.inside], ["Because", o.explains], ["Key constraint or opportunity", o.matters], ["Prediction", o.observe], ["Causal mechanism", o.mechanism],
      ["Opens the move", o.move], ["Fails to explain", o.fails], ["Key assumption", o.keyAssumption], ["Boundary", L.boundaryText(S, o)], ["Less credible if", o.falsifier || "Hard to test"], ["Confidence", o.confidence]];
    return '<dl class="ro">' + rows.filter((r) => r[1]).map((r) => "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>").join("") + "</dl>" + basisBlock(o);
  }

  function rests(o, ro) {
    const groups = [["Signals", ["signal"]], ["Assumptions and claims", ["assumption", "interpretation", "causal"]], ["Constraints and resources", ["constraint", "resource"]],
      ["Boundary, actors, objects", ["boundary", "actor", "object", "function", "intention"]], ["Unknowns", ["unknown"]]];
    let html = "";
    for (const [title, types] of groups) {
      const list = S.items.filter((i) => live(i) && types.includes(i.type));
      if (!list.length) continue;
      html += "<h4>" + title + '</h4><ul class="uses">' + list.map((i) => '<li><label class="opt"><input type="checkbox" data-act="uses" data-id="' + i.id + '" data-oid="' + o.id + '" id="u-' + o.id + "-" + i.id + '"' +
        (o.items.includes(i.id) ? " checked" : "") + (ro ? " disabled" : "") + "> <span>" + esc(i.text) + ' <span class="tag ' + LEDGER[i.ledger][0] + '">' + LEDGER[i.ledger][1] + "</span></span></label></li>").join("") + "</ul>";
    }
    return html || empty("Add signals, assumptions and constraints in the Reality ledger; then tick the ones this orientation rests on.");
  }

  function basisBlock(o) {
    return '<ul class="basis" aria-label="Empirical basis">' + L.basisText(L.basis(S, o)).map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul>";
  }

  function diagList(list) {
    return list.length ? '<ul class="diag">' + list.map((d) => "<li><b>" + esc(d.title) + ".</b> " + esc(d.message) + (d.detail ? ' <span class="muted">' + esc(d.detail) + "</span>" : "") + "</li>").join("") + "</ul>" : "";
  }
  function raoNote(id) {
    const n = D.methodology.rao.find((x) => x.id === id);
    return '<details class="note"><summary>' + esc(n.title) + "</summary><p>" + esc(n.text) + '</p><p class="prov">' + esc(n.basis) + " See Examples and sources below.</p></details>";
  }

  function orientationNormal(o) {
    const ro = L.locked(S, o);
    const act = S.actions.find((a) => a.orientation === o.id && a.status !== "draft");
    const trig = L.triggers(S), diags = L.diagnostics(S).filter((d) => !["prediction-drift", "low-information", "untraced-action"].includes(d.rule)), mem = L.deepMemory(S, o);
    const hi = S.tempo === "high";
    return '<div data-stage="model">' +
      '<p class="statement" id="or-' + o.id + '" data-statement="' + o.id + '">' + esc(L.statement(o)) + "</p>" +
      (ro ? '<p class="hint">Frozen while ' + L.labelOf(S, act.id) + " relies on it. Past versions stay in the lineage; reorient to revise it.</p>" : '<p class="hint">Editable until an action relying on it starts.</p>') +
      situationBlock() + (ro ? roFields(o) : orientationFields(o, "o", false) +
      '<div class="grid2"><div>' + select("o", "confidence", "Confidence (a self-rating, not evidence)", [["tenuous", "Tenuous"], ["working", "Working"], ["strong", "Strong"]], o.confidence, { "data-field": "confidence", "data-oid": o.id }) +
      basisBlock(o) + "</div><div>" + (o.falsifier ? "" : '<p><span class="tag red">Hard to test</span></p>') + "</div></div>") +
      (hi ? '<details class="panel"><summary>What this orientation rests on</summary>' + rests(o, ro) + "</details>" : '<div class="panel"><h3>What this orientation rests on</h3>' + rests(o, ro) + "</div>") +
      errFor("orient") + "</div>" +
      '<div class="panel ' + (trig.length ? "warn" : "calm") + '" data-stage="model destroy" id="test"><h3>Test the current orientation</h3>' +
      (trig.length ? "<p>Reasons to reorient:</p><ul>" + trig.map((t) => "<li><b>" + esc(t.label) + ".</b> " + esc(t.detail) + "</li>").join("") + "</ul>"
        : "<p><b>No obvious reason to destroy this orientation yet. Test or exploit it.</b></p><p class=\"hint\">The current orientation has no obvious failure signal. Act or gather another observation.</p>") +
      '<div class="row">' + btn("keep", "Keep acting", { class: trig.length ? "" : "primary" }) + btn("reorient", "Reorient", { class: trig.length ? "primary" : "" }) + btn("deep", "Deep reset") + "</div>" +
      (hi ? "" : raoNote("rao-redraw")) + "</div>" +
      (diags.length ? '<div class="panel" data-stage="model"><h3>Diagnostics</h3>' + diagList(diags) + "</div>" : "") +
      (mem.length ? '<div class="panel" data-stage="model"><h3>Deep Memory</h3><ul class="diag mem">' + mem.map((m) => "<li><b>Before.</b> " + esc(m.text) + "</li>").join("") + "</ul></div>" : "");
  }

  function moveView(m) {
    const op = OPS.get(m.op), res = item(m.result);
    const cur = m.targets.map(item);
    return '<dl class="move">' + (cur.length ? "<dt>Current " + esc(typeLabel(cur[0].type)) + '</dt><dd class="gone">' + cur.map((c) => esc(c.text)).join("; ") + "</dd>" : "<dt>Operation</dt><dd>" + esc(op.label) + "</dd>") +
      "<dt>Challenge</dt><dd>" + esc(m.challenge) + "</dd><dt>Replacement</dt><dd class=\"new\">" + esc(res ? res.text : "") + "</dd></dl>";
  }

  function opForm(ws, frags) {
    const op = OPS.get(view.op);
    if (!op) return "";
    const pool = frags.filter((f) => f.kind !== "destroyed" && op.targets.includes(f.item.type));
    let targets = "";
    if (op.targets.length) {
      if (!pool.length) targets = empty("Nothing in this orientation is a " + op.targets.map((t) => typeLabel(t).toLowerCase()).join(" or ") + ". Add one to the ledger and tick it in the model, or choose another operation.");
      else if (op.multi) targets = '<fieldset><legend>Which items?</legend>' + pool.map((f) => '<label class="opt"><input type="checkbox" name="targets" value="' + f.id + '" id="mv-t-' + f.id + '"> ' + esc(f.item.text) + "</label>").join("") + "</fieldset>";
      else targets = select("mv", "target", "Challenge which " + op.targets.map((t) => typeLabel(t).toLowerCase()).join(" or ") + "?", pool.map((f) => [f.id, f.item.text]), pool[0].id);
    }
    return '<form data-form="mv" class="panel calm" id="op-form"><h4>' + esc(op.label) + "</h4>" + targets +
      field("mv", "challenge", "Challenge", op.challenge, { big: true }) +
      select("mv", "rtype", "Replacement type", D.itemTypes.filter((t) => t.id !== "contradiction").map((t) => [t.id, t.label]), op.creates) +
      field("mv", "replacement", "Replacement: what takes its place? (required; only the replacement enters creation)", "", { big: true, a: { required: true } }) + errFor("move") +
      '<div class="row"><button type="submit" class="primary">Record move</button>' + btn("cancel-op", "Cancel") + "</div></form>";
  }

  function destroyStep(ws, frags) {
    const cap = ws.deep ? 8 : 3;
    let picker = "";
    const opBtn = (id, why) => { const op = OPS.get(id); return '<button type="button" data-act="op" data-id="' + id + '" data-k="op:' + id + '" aria-pressed="' + (view.op === id) + '">' + esc(op.label) + (why ? '<span class="why">' + esc(why) + "</span>" : "") + "</button>"; };
    if (ws.mode === "guided") picker = '<div class="ops">' + L.guided(S).map((g) => opBtn(g.op, g.why)).join("") + "</div>";
    else if (ws.mode === "manual") picker = D.families.map((f) => "<h4>" + esc(f.label) + '</h4><div class="ops">' + D.operations.filter((o) => o.family === f.id && (!o.deep || ws.deep)).map((o) => opBtn(o.id, o.challenge)).join("") + "</div>").join("") +
      (ws.deep ? "" : '<p class="hint">Goal operations belong to a deep reset.</p>');
    else { const j = L.jolt(S); picker = '<p class="note">' + esc(j.prompt) + '</p><div class="ops">' + opBtn(j.op) + '</div><div class="row">' + btn("jolt", "Another jolt") + '<span class="hint">Jolt ' + (ws.jolt + 1) + " of " + D.jolts.length + ", in a fixed order.</span></div>"; }
    const modes = [["guided", "Guided"], ["manual", "Manual"], ["jolt", "Random jolt"]];
    return '<div class="step" data-stage="destroy" id="destroy"><h3>Destroy ' + (ws.deep ? '<span class="tag red">deep reset</span>' : "") + "</h3>" +
      '<p class="hint">' + ws.moves.length + " of " + cap + " moves. " + (ws.deep ? "A deep reset may also destroy intent." : "One to three meaningful moves; use Deep reset for broader destruction.") + "</p>" +
      '<div class="modes" role="group" aria-label="Destruction mode">' + modes.map(([k, t]) => '<button type="button" data-act="wsmode" data-id="' + k + '" data-k="wsmode:' + k + '" aria-pressed="' + (ws.mode === k) + '">' + t + "</button>").join("") + "</div>" +
      picker + opForm(ws, frags) + (S.mode !== "environment" ? '<details class="note"><summary>Prompts for ' + esc(D.modes.find((m) => m.id === S.mode).label.toLowerCase()) + "</summary><ul>" + D.modes.find((m) => m.id === S.mode).prompts.map((p) => "<li>" + esc(p) + "</li>").join("") + "</ul></details>" : "") +
      (ws.moves.length ? "<h4>Moves</h4>" + ws.moves.map((m) => '<div class="panel">' + moveView(m) + btn("unmove", "Undo move", { class: "link", "data-id": m.id }) + "</div>").join("") : "") + "</div>";
  }

  function kdc(parts, anim, caption) {
    const col = (cls, title, xs) => '<div class="' + cls + '"><h4>' + title + "</h4>" + (xs.length ? "<ul>" + xs.map((x) => "<li>" + esc(x.text) + ' <span class="sr">(' + title.toLowerCase() + ")</span></li>").join("") + "</ul>" : '<p class="muted">Nothing</p>') + "</div>";
    return '<div class="kdc' + (anim ? " anim" : "") + '" role="group" aria-label="' + esc(caption || "Kept, destroyed and created") + '">' + col("k", "KEPT", parts.kept) + col("d", "DESTROYED", parts.destroyed) + col("c", "CREATED", parts.created) + "</div>";
  }

  function candidateForm(frags) {
    const prompts = L.creationPrompts(S), avail = frags.filter((f) => f.kind !== "destroyed");
    const chosen = draft("cand", "from", null);
    const bounds = avail.filter((f) => f.item.type === "boundary");
    const tag = (d) => select("cand", d.id, d.label, [["", "—"]].concat(d.tags.map((t) => [t, t])), "");
    return "<h4>Prompts, not conclusions</h4>" + (prompts.length ? '<ul class="list">' + prompts.map((p) => '<li class="panel"><span class="tag">' + esc(p.label) + "</span><p>" + esc(p.text) + "</p>" + btn("use-prompt", "Build from these fragments", { class: "link", "data-id": p.id }) + "</li>").join("") + "</ul>" : empty("Make a destructive move first; its replacement becomes a fragment to build from.")) +
      '<form data-form="cand" class="panel" id="cand-form"><h4>New candidate orientation</h4>' +
      '<fieldset><legend>Built from these fragments (untick what this candidate does not use; at least one is required, so its origin stays traceable)</legend><ul class="uses">' + avail.map((f) => '<li><label class="opt"><input type="checkbox" name="from" value="' + f.id + '" id="cf-' + f.id + '"' +
        ((chosen ? chosen.includes(f.id) : true) ? " checked" : "") + "> <span>" + esc(f.item.text) + ' <span class="tag' + (f.kind === "created" ? " blue" : "") + '">' + f.kind + "</span></span></label></li>").join("") + "</ul></fieldset>" +
      '<div class="grid2"><div>' + field("cand", "inside", "We are actually in:", "", { big: true }) + "</div><div>" + field("cand", "matters", "What matters now is:", "", { big: true }) + "</div><div>" +
      field("cand", "explains", "This explains:") + "</div><div>" + field("cand", "fails", "It fails to explain:") + "</div><div>" + field("cand", "keyAssumption", "Key assumption:") + "</div><div>" +
      field("cand", "observe", "If this orientation is useful, I should observe:") + "</div><div>" + field("cand", "move", "This orientation opens the move:") + "</div><div>" + field("cand", "mechanism", "Causal mechanism:") + "</div><div>" +
      select("cand", "boundary", "System boundary", [["", "No boundary"]].concat(bounds.map((f) => [f.id, f.item.text])), (bounds.find((f) => f.kind === "created") || bounds[0] || { id: "" }).id) + "</div><div>" +
      field("cand", "falsifier", "What observation would make it substantially less credible?") + '</div></div><div class="grid3">' + D.dimensions.filter((d) => d.tags).map((d) => "<div>" + tag(d) + "</div>").join("") + "</div>" +
      errFor("candidate") + '<div class="row"><button type="submit" class="primary">Add candidate</button><span class="hint">At most four active candidates.</span></div></form>';
  }

  function candCard(c, diags) {
    const o = orient(c.id), flags = diags.filter((d) => d.target === c.id);
    return '<div class="cand' + (c.current ? " cur" : "") + '" id="or-' + c.id + '"><div class="meta"><span class="tag ' + (c.current ? "blue" : "") + '">' + c.label + (c.current ? " · current" : " · candidate") + "</span>" + (c.hardToTest ? ' <span class="tag red">Hard to test</span>' : "") + "</div>" +
      "<p>" + esc(c.statement) + "</p>" + (c.boundary ? '<p class="hint">Boundary: ' + esc(c.boundary) + "</p>" : "") + (o.creation && o.creation.from && o.creation.from.length ? '<p class="hint">Built from: ' + o.creation.from.map((id) => esc((item(id) || {}).text)).join("; ") + "</p>" : "") +
      diagList(flags) + (c.current ? "" : btn("drop", "Drop candidate", { class: "link", "data-id": c.id })) + "</div>";
  }

  function compareStep(rows) {
    const dims = S.tempo === "high" && !view.allDims ? D.dimensions.filter((d) => ["explained", "contradictions", "speed"].includes(d.id)) : D.dimensions;
    const cell = (r, d) => { const v = r[d.id]; return Array.isArray(v) ? (v.length ? "<ul>" + v.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : '<span class="muted">—</span>') : v ? '<span class="tag">' + esc(v) + "</span>" : '<span class="muted">not tagged</span>'; };
    let html = '<div class="step" data-stage="compare" id="compare"><h3>Contrast</h3>';
    if (rows.length < 2) return html + empty("Destroy one assumption, boundary, goal, category or object-function to create an alternative. A serious comparison needs at least two orientations.") + "</div>";
    html += '<p class="hint">No score: compare what each explains, assumes and predicts. Confidence is shown beside its evidence.</p><div style="overflow-x:auto"><table class="cmp"><thead><tr><th scope="col">Dimension</th>' + rows.map((r) => '<th scope="col">' + r.label + (r.current ? " (current)" : "") + "</th>").join("") + "</tr></thead><tbody>" +
      dims.map((d) => '<tr><th scope="row">' + esc(d.label) + "<span>" + esc(d.question) + "</span></th>" + rows.map((r) => '<td data-o="' + r.label + '">' + cell(r, d) + "</td>").join("") + "</tr>").join("") +
      '<tr><th scope="row">Confidence<span>Self-rating, beside its basis</span></th>' + rows.map((r) => '<td data-o="' + r.label + '"><span class="tag">' + r.confidence + '</span><ul class="basis">' + L.basisText(r.basis).map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul></td>").join("") + "</tr></tbody></table></div>" +
      (S.tempo === "high" ? btn("all-dims", view.allDims ? "Show the compressed comparison" : "Show all dimensions", { class: "link" }) : "") +
      "<h4>Would you take the same action under every candidate?</h4><p class=\"hint\">If yes, acting now may dominate further theorising. If no, the next action should be the observation that most cheaply tells them apart.</p>";
    for (const r of rows.filter((x) => !x.current)) {
      html += '<form data-form="adopt" data-id="' + r.id + '" class="panel"><h4>Adopt ' + r.label + " provisionally?</h4>" + field("adopt-" + r.id, "falsifier", "Before adopting: what observation would make this orientation substantially less credible?", r.falsifier) +
        field("adopt-" + r.id, "note", "What evidence prompted the revision?", "") + (r.hardToTest ? '<p><span class="tag red">Hard to test</span> <span class="hint">You can still adopt it; the label stays.</span></p>' : "") +
        '<button type="submit" class="primary">Adopt ' + r.label + " provisionally</button></form>";
    }
    return html + '<div class="row">' + btn("retain", "Retain the current orientation") + '<span class="hint">Rejected candidates stay in the lineage.</span></div></div>';
  }

  function orientationRegion() {
    const o = L.current(S), ws = S.workspace;
    let body;
    if (!ws) body = orientationNormal(o);
    else {
      const frags = L.fragments(S), rows = L.contrast(S), diags = L.diagnostics(S);
      const parts = { kept: frags.filter((f) => f.kind === "kept").map((f) => f.item), destroyed: frags.filter((f) => f.kind === "destroyed").map((f) => f.item), created: frags.filter((f) => f.kind === "created").map((f) => f.item) };
      body = '<div class="steps"><div class="step" data-stage="model destroy"><h3>Current model · ' + L.label(S, o) + '</h3><p class="statement hist" data-statement="' + o.id + '">' + esc(L.statement(o)) + "</p>" +
        '<div class="row">' + btn("retain", "Retain it and stop reorienting") + (ws.deep ? "" : btn("deep", "Deep reset")) + "</div></div>" + '<p class="down" aria-hidden="true">↓</p>' +
        destroyStep(ws, frags) + '<p class="down" aria-hidden="true">↓</p>' +
        '<div class="step" data-stage="destroy create"><h3>Fragments</h3>' + kdc(parts, false, "Fragments: kept, destroyed and created") + "</div>" + '<p class="down" aria-hidden="true">↓</p>' +
        '<div class="step" data-stage="create" id="create"><h3>Create</h3>' + candidateForm(frags) + "</div>" + '<p class="down" aria-hidden="true">↓</p>' +
        '<div class="step" data-stage="create compare"><h3>Candidates</h3>' + (rows.length > 1 ? '<div class="cands">' + rows.map((r) => candCard(r, diags)).join("") + "</div>" : empty("Destroy one assumption, boundary, goal, category or object-function to create an alternative.")) +
        diagList(diags.filter((d) => d.rule === "boundary-lock")) + "</div>" + compareStep(rows) + errFor("adopt") + errFor("retain") + "</div>";
    }
    return '<section id="orient" class="region orient" data-stage="model destroy create compare" aria-labelledby="h-orient"><h2 id="h-orient">Orientation <span class="tag blue">' + L.label(S, o) + " · " +
      (o.parent ? "adopted provisionally" : "working model") + "</span>" + (ws ? ' <span class="tag red">reorienting</span>' : "") + "</h2>" + body + stageNav() + "</section>";
  }

  function actionRegion() {
    const o = L.current(S), a = L.currentAction(S), rd = L.readiness(S);
    const p = a && a.prediction && S.predictions.find((x) => x.id === a.prediction);
    const strip = '<ol class="decision" aria-label="Decision record">' +
      '<li class="' + (rd.orientation ? "" : "miss") + '"><b>DECISION</b>' + L.label(S, o) + ": " + esc(o.inside || "state the model first") + "</li>" +
      '<li class="' + (rd.action ? "" : "miss") + '"><b>ACTION</b>' + esc(a ? a.text : "not chosen") + "</li>" +
      '<li class="' + (rd.expected ? "" : "miss") + '"><b>EXPECTED SIGNAL</b>' + esc(p ? p.text : "not stated") + "</li>" +
      '<li class="re ' + (rd.reconsider ? "" : "miss") + '"><b>RECONSIDER IF</b>' + esc(a && a.reconsider ? a.reconsider : "not stated") + "</li></ol>";
    const ready = rd.orientation && rd.action && rd.expected && rd.reconsider;
    let body = "";
    if (a && a.status === "started") {
      body = '<p class="sentence" id="ac-' + a.id + '">' + esc(L.actionSentence(S, a)) + '</p><p><span class="tag">' + esc(a.type) + '</span> Started. The prediction is frozen.</p><div class="row">' + btn("goto-observe", "Record what happened", { class: "primary" }) + "</div>";
    } else {
      const F = "act", hi = S.tempo === "high";
      const c = a ? a.consistency : {}, ty = draft(F, "type", a ? a.type : "probe"), same = draft(F, "sameUnderAll", c.sameUnderAll || "");
      const cheap = ty === "probe" || ty === "wait" || hi;
      const mode = D.modes.find((m) => m.id === S.mode);
      const relies = L.itemsOf(S, o).filter((i) => i.type !== "signal");
      body = (a ? '<p class="sentence" id="ac-' + a.id + '">' + esc(L.actionSentence(S, a)) + "</p>" : "") +
        '<form data-form="act" class="stack">' + radios(F, "type", "Action type", D.actionTypes.map((t) => [t.id, t.label]), ty) +
        '<p class="hint">' + esc(D.actionTypes.find((t) => t.id === ty).help) + "</p>" +
        field(F, "text", "Because I currently believe " + esc(L.statement(o).replace(/^I think /, "").split(" because ")[0]) + ", I will…", a ? a.text : "", { big: true }) +
        field(F, "expected", "…and I expect to observe:", L.expectedOf(S, a)) + field(F, "reconsider", "Reconsider if:", a ? a.reconsider : "") +
        (relies.length ? '<fieldset><legend>This action relies on</legend><ul class="uses">' + relies.map((i) => '<li><label class="opt"><input type="checkbox" name="refs" value="' + i.id + '" id="ar-' + i.id + '"' + (draft(F, "refs", a ? a.refs : []).includes(i.id) ? " checked" : "") + "> " + esc(i.text) + "</label></li>").join("") + "</ul></fieldset>" : "") +
        '<fieldset><legend>Before committing</legend>' + radios(F, "follows", "1. Does this action actually follow from the adopted orientation?", yn, c.follows || "") +
        (hi && !view.moreQ ? btn("more-q", "More questions", { class: "link" }) : radios(F, "sameUnderAll", "2. Would you take the same action under every candidate?", yn, same) +
          (same === "yes" ? radios(F, "dominates", "3. Does acting now dominate further theorising?", yn, c.dominates || "") : "") +
          (same !== "yes" ? field(F, "discriminator", "4. What observation most cheaply discriminates between the candidates?", c.discriminator || "") : "")) + "</fieldset>" +
        (cheap ? '<p class="note"><b>Act now</b> is reasonable: the action is cheap, reversible or the tempo is high, so it can itself serve as the discriminating experiment.</p>'
          : '<p class="note">What could you observe next that would distinguish this orientation from the alternatives?</p>') +
        (ty === "commitment" ? '<p class="note"><b>Commitment.</b> Hard to reverse: it needs a clear reconsideration trigger' + (o.confidence === "tenuous" ? ", and this orientation's confidence is only tenuous" : "") + ".</p>" : "") +
        (S.mode !== "environment" ? '<fieldset><legend>Change the information environment: what the other side can…</legend><div class="opts">' + D.infoEnvironment.map((x) => '<label class="opt"><input type="checkbox" name="info" value="' + x + '" id="ai-' + x.replace(/ /g, "-") + '"' + (draft(F, "info", a ? a.info : []).includes(x) ? " checked" : "") + "> " + x + "</label>").join("") + '</div><ul class="hint">' + mode.prompts.map((q) => "<li>" + esc(q) + "</li>").join("") + "</ul></fieldset>" : "") +
        errFor("action") + errFor("editAction") + errFor("start") +
        '<div class="row"><button type="submit" class="' + (a ? "" : "primary") + '">' + (a ? "Save changes" : "Save action") + "</button>" + (a ? btn("start", "Start action", { class: "primary", "data-id": a.id }) : "") +
        '<span class="hint">' + (ready ? "Ready to act." : "Ready when the four fields above exist.") + " Starting freezes the prediction.</span></div></form>";
    }
    const diags = L.diagnostics(S).filter((d) => ["low-information", "untraced-action", "tempo-substitution"].includes(d.rule));
    return '<section id="act" class="region action" data-stage="act" aria-labelledby="h-act"><h2 id="h-act">Action <span class="tag">one move this loop</span></h2>' + strip + diagList(diags) + body + stageNav() + "</section>";
  }

  function triad(before, reality, interp) {
    const lf = (t) => (/^[A-Z][a-z]/.test(t || "") ? t[0].toLowerCase() + t.slice(1) : t || "");
    return '<div class="triad"><div class="before"><b>BEFORE ACTING</b>I expected ' + esc(lf(before)) + '</div><div><b>REALITY</b>' + esc(reality || "not yet recorded") + "</div><div><b>INTERPRETATION</b>" + esc(interp || "—") + "</div></div>";
  }

  function observeRegion() {
    const a = S.actions.find((x) => x.status === "started");
    let form = "";
    if (a) {
      const F = "out", p = a.prediction && S.predictions.find((x) => x.id === a.prediction), o = orient(a.orientation);
      const assumptions = L.itemsOf(S, o).filter((i) => i.type === "assumption" || i.type === "causal");
      const fits = S.orientations.filter((x) => x.status !== "superseded" || x.id === o.id);
      form = '<form data-form="out" class="stack" id="outcome-form"><p class="sentence">' + esc(L.actionSentence(S, a)) + "</p>" +
        (p ? triad(p.original || p.text, draft(F, "observed", ""), draft(F, "interpretation", "")) : "") +
        field(F, "observed", "What happened?", "", { big: true, a: { required: true } }) + field(F, "surprise", "What surprised you?") + field(F, "absent", "What did you expect that did not happen?") +
        radios(F, "changed", "Did your action change the environment itself?", yn, "unsure") +
        (p ? radios(F, "pstatus", "The prediction was…", [["observed", "Observed"], ["partial", "Partially observed"], ["not-observed", "Not observed"], ["unresolved", "Unresolved"]], "unresolved") : "") +
        radios(F, "effect", "Did the action produce the strategic effect you expected?", [["achieved", "Yes"], ["partial", "Partly"], ["not", "No"]], "") +
        select(F, "attribution", "If not, what explains it? (a failed action is not automatically evidence the orientation is false)", D.attributions.map((x) => [x.id, x.label]), "none") +
        (assumptions.length ? '<fieldset><legend>Which assumption became weaker or stronger?</legend>' + assumptions.map((i) => "<div>" + select(F, "as-" + i.id, esc(i.text), [["", "Unchanged"], ["weaker", "Weaker"], ["stronger", "Stronger"]], "") + "</div>").join("") + "</fieldset>" : "") +
        select(F, "fit", "Which orientation now fits better?", [["", "Not sure"]].concat(fits.map((x) => [x.id, L.label(S, x) + ": " + (x.inside || "untitled")])), "") +
        field(F, "reorient", "Do you have a reason to reorient?") + field(F, "interpretation", "Why did reality differ from the prediction (or not)?", "", { big: true }) + errFor("outcome") +
        '<div class="row"><button type="submit" class="primary">Record outcome</button><span class="hint">The before-state cannot be edited.</span></div></form>';
    } else form = empty("Start an action to observe its result. After recording it, the screen routes back to orientation.");
    const preds = S.predictions;
    const ledger = preds.length ? '<div style="overflow-x:auto"><table class="ledger-t"><thead><tr><th scope="col">Prediction</th><th scope="col">Before acting</th><th scope="col">Reality</th><th scope="col">Interpretation</th></tr></thead><tbody>' + preds.map((p) => {
      const before = p.locked ? esc(p.original) + ' <span class="tag">frozen</span>' + (p.original !== p.text ? ' <span class="tag red">drift</span>' : "")
        : '<form data-form="pred" data-id="' + p.id + '"><label class="sr" for="pe-' + p.id + '">Edit prediction</label><input id="pe-' + p.id + '" name="text" value="' + esc(p.text) + '"><button class="small" type="submit">Save</button></form>';
      return '<tr id="pr-' + p.id + '"><th scope="row">' + L.label(S, p) + ' <span class="muted">' + L.labelOf(S, p.orientation) + "</span></th><td>" + before + "</td><td>" +
        (p.status === "pending" ? '<span class="muted">pending</span>' : '<span class="tag ' + (p.status === "not-observed" ? "red" : "") + '">' + esc(p.status) + "</span> " + esc(p.result)) + "</td><td>" + esc(p.interpretation || (p.status === "pending" ? "" : "—")) + "</td></tr>";
    }).join("") + "</tbody></table></div>" : empty("No predictions yet. The action's expected observation becomes a prediction.");
    const outs = S.outcomes.length ? '<ul class="list">' + S.outcomes.map((r) => {
      const ac = S.actions.find((x) => x.id === r.action), p = ac && ac.prediction && S.predictions.find((x) => x.id === ac.prediction);
      return '<li class="panel" id="oc-' + r.id + '"><h4>' + L.label(S, r) + " · loop " + r.loop + " · after " + L.label(S, ac) + "</h4>" + triad(p ? p.original || p.text : "—", r.observed, r.interpretation) +
        (r.surprise ? "<p><b>Surprise.</b> " + esc(r.surprise) + "</p>" : "") + (r.absent ? "<p><b>Did not happen.</b> " + esc(r.absent) + "</p>" : "") +
        '<p class="hint">' + [r.effect && "Effect: " + r.effect, r.attribution && "Explained by: " + D.attributions.find((x) => x.id === r.attribution).label, r.changedEnvironment === "yes" && "Changed the environment"].filter(Boolean).join(" · ") + "</p></li>";
    }).join("") + "</ul>" : "";
    return '<section id="observe" class="region" data-stage="observe" aria-labelledby="h-observe"><h2 id="h-observe">Observe</h2>' + form +
      '<h3 id="predictions">Prediction ledger</h3><p class="hint">A prediction freezes when its action starts. Its result and interpretation are recorded beside it; the original is never rewritten.</p>' + ledger +
      (outs ? "<h3>Outcomes</h3>" + outs : "") + diagList(L.diagnostics(S).filter((d) => d.rule === "prediction-drift")) + "</section>";
  }

  function lineageRegion() {
    const rows = L.lineage(S);
    const last = S.history.filter((h) => h.kind === "transition").slice(-1)[0];
    const ins = view.inspect && orient(view.inspect);
    let detail = "";
    if (ins) {
      const t = S.history.find((h) => h.kind === "transition" && h.to === ins.id);
      detail = '<div class="panel" id="inspect"><h3>' + L.label(S, ins) + " · " + ins.status + " · loop " + ins.loop + ' <span class="tag">read-only</span></h3><p class="statement hist">' + esc(L.statement(ins)) + "</p>" +
        (L.boundaryText(S, ins) ? "<p>Boundary: " + esc(L.boundaryText(S, ins)) + "</p>" : "") + "<p>Falsifier: " + esc(ins.falsifier || "Hard to test") + "</p>" + basisBlock(ins) +
        (t ? kdc(L.signature(S, t.id), false, "Transition into " + L.label(S, ins)) + (t.note ? "<p><b>Why.</b> " + esc(t.note) + "</p>" : "") : "") +
        '<ul class="list">' + L.itemsOf(S, ins).map((i) => itemRow(i, true)).join("") + "</ul>" + btn("close-inspect", "Back to the current orientation") + "</div>";
    }
    return '<section id="lineage" class="region" data-stage="observe" aria-labelledby="h-lineage"><h2 id="h-lineage">Lineage <span class="tag">append-only</span></h2>' +
      '<ol class="tree">' + rows.map((r) => {
        const o = orient(r.id);
        return '<li class="st-' + r.status + '" id="or-' + r.id + '" style="padding-left:' + r.depth * 1.25 + 'rem"><span class="lab">' + (r.depth ? "└ " : "") + r.label + '</span><span class="tag ' + (r.status === "adopted" ? "blue" : r.status === "rejected" ? "" : "") + '">' + r.status + '</span><span class="gist">' + esc(o.inside || "untitled") + "</span>" + btn("inspect", "Inspect", { class: "small", "data-id": r.id }) + "</li>";
      }).join("") + "</ol>" + detail +
      (last && !ins ? "<h3>" + L.signature(S, last.id).from + " → " + L.signature(S, last.id).to + "</h3>" + kdc(L.signature(S, last.id), view.animate === last.id, "Latest transition") + (last.note ? "<p><b>Why.</b> " + esc(last.note) + "</p>" : "") : "") +
      (!last ? empty("When an orientation changes, what was kept, destroyed and created appears here.") : "") + "</section>";
  }

  function examplesBlock() {
    return '<section id="examples" class="region" data-stage="reality" aria-labelledby="h-examples"><h2 id="h-examples">Examples</h2><ul class="cards">' +
      D.examples.map((e) => '<li id="ex-' + e.id + '"><b>' + esc(e.title) + "</b><p>" + esc(e.purpose) + '</p><p class="prov">' + esc(D.provenance[e.provenance].label) + ": " + esc(e.note) + "</p>" + btn("example", "Load this worked example", { class: "small", "data-id": e.id }) + "</li>").join("") + "</ul>" +
      '<h3>Short cards</h3><p class="hint">Applications and interpretations from Yu Jie Teo\'s OODA notes, not quotations from Boyd.</p><ul class="cards">' +
      D.cards.map((c) => '<li id="card-' + c.id + '"><b>' + esc(c.title) + "</b><p>" + esc(c.lesson) + "</p><p>" + esc(c.text) + '</p><p class="prov">Suggested operation: ' + esc(OPS.get(c.op).label) + "</p>" + btn("card", "Start from this card", { class: "small", "data-id": c.id }) + "</li>").join("") + "</ul></section>";
  }

  function landing() {
    return '<section class="landing" aria-labelledby="h-land"><h2 id="h-land">What situation are you trying to understand?</h2>' +
      '<form data-form="start" class="stack">' + field("start", "title", "Describe it in a sentence", "", { big: true }) + errFor("new") +
      '<div class="row"><button type="submit" class="primary">Start blank</button>' + btn("example", "Try an example", { "data-id": "stalled-project" }) + btn("how", "How this works", { class: "link" }) + "</div></form></section>" + examplesBlock();
  }

  function stageNav(stage) {
    const i = STAGES.indexOf(S.uiPreferences.stage);
    return '<nav class="stagenav" aria-label="Stage">' + (i > 0 ? btn("prev", "← " + esc(D.stages[i - 1].label)) : "<span></span>") + (i < STAGES.length - 1 ? btn("next", esc(D.stages[i + 1].label) + " →", { class: "primary" }) : "") + "</nav>";
  }

  function progress() {
    const cur = S.uiPreferences.stage, ws = S.workspace;
    return '<nav class="progress" aria-label="Loop stages"><ol>' + D.stages.map((s) => '<li><button type="button" data-act="stage" data-id="' + s.id + '" data-k="stage:' + s.id + '"' + (s.id === cur ? ' aria-current="step"' : "") +
      (ws && ["destroy", "create", "compare"].includes(s.id) ? ' class="ws"' : "") + ">" + esc(s.label) + "</button></li>").join("") + "</ol></nav>";
  }

  function toolbar(full) {
    return '<div class="bar" role="toolbar" aria-label="Planner">' + '<button type="button" class="search" data-act="palette" data-k="palette:" aria-keyshortcuts="Control+K Meta+K"><span>Search or run a command</span><kbd>' + MOD + " K</kbd></button>" +
      (full ? btn("new", "New") + btn("export", "Export JSON") : "") + btn("import", "Import JSON") + (full ? btn("copy-md", "Copy Markdown") + btn("reset", "Reset", { class: "danger" }) : "") + (full ?
      "<label>Tempo " + select("bar", "tempo", "", [["low", "Low"], ["moderate", "Moderate"], ["high", "High"]], S.tempo, { "data-act": "tempo" }) + "</label><label>Situation " +
      select("bar", "mode", "", D.modes.map((m) => [m.id, m.label]), S.mode, { "data-act": "mode" }) + "</label>" : "") + "</div>" +
      '<p class="store' + (storeMsg ? " warn" : "") + '">' + esc(storeMsg || "Stored only in this browser. Nothing is uploaded.") + "</p>";
  }

  /* ---------- render ---------- */
  function render() {
    const a = document.activeElement;
    const key = a && app.contains && app.contains(a) ? a.id || (a.dataset && a.dataset.k) : null;
    const y = window.scrollY;
    const started = S.orientations.length > 0;
    const stage = S.uiPreferences.stage;
    app.innerHTML = started ? toolbar(true) + progress() + '<div class="sit"><h2>' + esc(S.situation.title || "Untitled situation") + '</h2><p class="hint">Loop ' + S.loop + " · tempo " + S.tempo + (S.tempo === "high" ? " · prompts compressed; a fast wrong orientation is still dangerous" : "") + "</p></div>" +
      reality() + '<p class="flow" aria-hidden="true">REALITY CONSTRAINS ORIENTATION ↓</p>' + orientationRegion() + '<p class="flow" aria-hidden="true">ORIENTATION GENERATES ACTION ↓</p>' + actionRegion() +
      '<p class="flow" aria-hidden="true">ACTION PRODUCES NEW REALITY ↓</p>' + observeRegion() + lineageRegion() + examplesBlock()
      : toolbar(false) + landing();
    app.classList.toggle("staged", started);
    if (started) for (const el of app.querySelectorAll("[data-stage]")) if (el.dataset.stage.split(" ").includes(stage) || (el.querySelector && [...el.querySelectorAll("[data-stage]")].some((c) => c.dataset.stage.split(" ").includes(stage)))) el.classList.add("on");
    $("deck").hidden = !started;
    const strip = app.querySelector(".progress ol"), here = strip && strip.querySelector("[aria-current]");
    if (here && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = here.parentNode.offsetLeft - (strip.clientWidth - here.offsetWidth) / 2;
    if (key) {
      let el = document.getElementById(key);
      if (!el || !app.contains(el)) el = [...app.querySelectorAll("[data-k]")].find((x) => x.dataset.k === key);
      if (el && el.focus) el.focus({ preventScroll: true });
    }
    if (typeof y === "number" && window.scrollTo) window.scrollTo(0, y);
    if (view.flash) { const el = document.getElementById(view.flash); view.flash = null; if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "center" }); if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); } }
    view.animate = null;
  }

  /* ---------- forms ---------- */
  const val = (form, name) => { const el = form.elements[name]; return el ? (el.length !== undefined && !el.tagName ? [...el].filter((x) => x.checked).map((x) => x.value).join("") : el.value) : ""; };
  const checked = (form, name) => [...form.querySelectorAll('input[name="' + name + '"]:checked')].map((x) => x.value);
  const radio = (form, name) => { const x = form.querySelector('input[name="' + name + '"]:checked'); return x ? x.value : ""; };
  const done = (name) => { delete view.draft[name]; };

  function submit(form) {
    const kind = form.dataset.form, id = form.dataset.id;
    if (kind === "start") {
      const title = val(form, "title").trim();
      if (!title) { view.error = { at: "new", message: "Describe the situation in a sentence, or try an example." }; render(); return; }
      if (commit({ do: "new", title, description: "" }, "New situation started")) { done("start"); commit({ do: "stage", stage: "reality" }); focusFirst("add-text"); }
    } else if (kind === "add") {
      const type = val(form, "type"), c = { do: type === "contradiction" ? "contradiction" : "item", type, text: val(form, "text"), ledger: form.elements.ledger ? val(form, "ledger") : undefined };
      if (commit(c, typeLabel(type) + " added")) { view.draft.add = { type }; render(); focusFirst("add-text"); }
    } else if (kind === "promote") {
      if (commit({ do: "promote", id, note: val(form, "note"), text: val(form, "text") }, "Observation recorded beside the inference", { at: "promote" })) { view.edit = null; done("promote"); render(); }
    } else if (kind === "resolve" || kind === "dismiss" || kind === "withdraw") {
      const cmd = kind === "withdraw" ? { do: "withdraw", id, reason: val(form, "reason") } : { do: "resolve", id, status: kind === "dismiss" ? "dismissed" : "resolved", reason: val(form, "reason") };
      if (commit(cmd, kind === "withdraw" ? "Item withdrawn; it stays in history" : "Contradiction " + (kind === "dismiss" ? "dismissed" : "resolved"), { at: kind })) { view.edit = null; done(kind); render(); }
    } else if (kind === "mv") {
      const op = OPS.get(view.op);
      const targets = op.multi ? checked(form, "targets") : form.elements.target ? [val(form, "target")] : [];
      if (commit({ do: "move", op: op.id, targets, challenge: val(form, "challenge"), replacement: { type: val(form, "rtype"), text: val(form, "replacement") } }, "Move recorded: replacement added as a fragment")) { view.op = null; done("mv"); render(); }
    } else if (kind === "cand") {
      const c = { do: "candidate", from: checked(form, "from"), boundary: val(form, "boundary"), prompt: draft("cand", "prompt", ""), tags: {} };
      for (const f of ["inside", "matters", "explains", "fails", "keyAssumption", "observe", "move", "mechanism", "falsifier"]) c[f] = val(form, f);
      for (const d of D.dimensions.filter((x) => x.tags)) c.tags[d.id] = val(form, d.id);
      c.items = c.from.concat(c.boundary ? [c.boundary] : []);
      const oid = commit(c, "Candidate added");
      if (oid) { done("cand"); view.flash = "or-" + oid; render(); }
    } else if (kind === "adopt") {
      const f = "adopt-" + id;
      if (val(form, "falsifier") !== (orient(id).falsifier || "") && !commit({ do: "orient", id, falsifier: val(form, "falsifier") }, null, { at: "adopt" })) return;
      const o = orient(id);
      const ev = o.items.filter((i) => { const it = item(i); return it && (it.ledger === "observed"); });
      const prev = L.current(S);
      if (commit({ do: "adopt", id, note: val(form, "note"), evidence: ev }, L.label(S, o) + " adopted provisionally; " + L.label(S, prev) + " stays in the lineage")) {
        done(f); view.animate = S.history.filter((h) => h.kind === "transition").slice(-1)[0].id; render(); go("act");
      }
    } else if (kind === "act") {
      const a = L.currentAction(S);
      const c = { type: radio(form, "type") || "probe", text: val(form, "text"), expected: val(form, "expected"), reconsider: val(form, "reconsider"), refs: checked(form, "refs"), info: checked(form, "info"),
        consistency: { follows: radio(form, "follows"), sameUnderAll: radio(form, "sameUnderAll"), dominates: radio(form, "dominates"), discriminator: form.elements.discriminator ? val(form, "discriminator") : "" } };
      const ok = a ? commit(Object.assign({ do: "editAction", id: a.id }, c), "Action saved") : commit(Object.assign({ do: "action" }, c), "Action saved; its expected signal is a prediction");
      if (ok) done("act");
      return !!ok;
    } else if (kind === "out") {
      const a = S.actions.find((x) => x.status === "started"), o = orient(a.orientation);
      const weak = [], strong = [];
      for (const i of L.itemsOf(S, o)) { const v = form.elements["as-" + i.id] && form.elements["as-" + i.id].value; if (v === "weaker") weak.push(i.id); if (v === "stronger") strong.push(i.id); }
      const c = { do: "outcome", action: a.id, observed: val(form, "observed"), surprise: val(form, "surprise"), absent: val(form, "absent"), changedEnvironment: radio(form, "changed"),
        effect: radio(form, "effect"), attribution: val(form, "attribution"), weakened: weak, strengthened: strong, betterFit: val(form, "fit"), reorient: val(form, "reorient"), interpretation: val(form, "interpretation"),
        predictions: a.prediction ? [{ id: a.prediction, status: radio(form, "pstatus") || "unresolved" }] : [] };
      if (commit(c, "Outcome recorded. Back to orientation: do you have a reason to reorient?")) { done("out"); go("model"); }
    } else if (kind === "pred") {
      commit({ do: "editPrediction", id, text: val(form, "text") }, "Prediction updated", { at: "editPrediction" });
    }
  }
  function focusFirst(id) { const el = $(id); if (el) el.focus(); }

  /* ---------- navigation ---------- */
  function go(stage, anchor) {
    if (S.orientations.length && stage !== S.uiPreferences.stage) commit({ do: "stage", stage });
    const el = $(anchor || { reality: "reality", model: "orient", destroy: S.workspace ? "destroy" : "test", create: S.workspace ? "create" : "orient", compare: S.workspace ? "compare" : "orient", act: "act", observe: "observe" }[stage]);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" });
  }
  function step(d) { const i = STAGES.indexOf(S.uiPreferences.stage) + d; if (i >= 0 && i < STAGES.length) { go(STAGES[i]); announce("Stage: " + D.stages[i].label); } }

  function loadExample(id) {
    const e = D.examples.find((x) => x.id === id);
    confirmReplace(() => { S = L.replay(e).state; S = L.apply(S, { do: "stage", stage: "model" }).state; persist(); view.inspect = null; render(); announce("Loaded the worked example: " + e.title); go("model"); });
  }
  function confirmReplace(then) {
    if (!S.orientations.length) { then(); return; }
    dialog("Replace this situation?", '<p>This replaces the current situation in this browser. Export JSON first if you want to keep it.</p><div class="row"><button type="button" class="primary" id="dlg-yes">Replace it</button><button type="button" id="dlg-no">Cancel</button></div>', (d) => {
      $("dlg-yes").addEventListener("click", () => { d.close(); then(); });
      $("dlg-no").addEventListener("click", () => d.close());
    });
  }

  app.addEventListener("submit", (e) => { e.preventDefault(); submit(e.target); });
  app.addEventListener("input", (e) => {
    const f = e.target.form, n = e.target.name;
    if (f && f.dataset.form && n && e.target.type !== "checkbox") (view.draft[f.dataset.form] = view.draft[f.dataset.form] || {})[n] = e.target.value;
  });
  app.addEventListener("change", (e) => {
    const t = e.target, act = t.dataset.act, id = t.dataset.id;
    if (t.dataset.field) {
      const c = { do: "orient", id: t.dataset.oid };
      c[t.dataset.field] = t.value;
      const r = commit(c, null, { soft: true, at: "orient" });
      if (r) for (const el of app.querySelectorAll('[data-statement="' + t.dataset.oid + '"]')) el.textContent = L.statement(orient(t.dataset.oid));
      return;
    }
    if (t.dataset.sit) { commit(t.dataset.sit === "intent" ? { do: "intent", text: t.value } : { do: "situation", title: t.value }, null, { soft: true }); return; }
    if (act === "qualify" && t.value) commit({ do: "qualify", id, qualifier: t.value }, "Provenance qualified; the observation stays");
    else if (act === "confidence") commit({ do: "edit", id, confidence: t.value }, "Confidence updated");
    else if (act === "tested") commit({ do: "edit", id, tested: t.checked }, t.checked ? "Constraint marked tested as fixed" : "Constraint marked untested");
    else if (act === "uses") {
      const o = orient(t.dataset.oid), items = t.checked ? o.items.concat([id]) : o.items.filter((x) => x !== id);
      commit({ do: "orient", id: o.id, items, boundary: items.includes(o.boundary) ? o.boundary : "" }, null, { at: "orient" });
    } else if (act === "tempo") commit({ do: "tempo", value: t.value }, "Tempo " + t.value + (t.value === "high" ? ": prompts compressed. Faster is not better if the model is wrong." : ""));
    else if (act === "mode") commit({ do: "mode", value: t.value }, "Situation mode changed");
    else if (t.dataset.redraw) {
      const f = t.dataset.redraw;
      (view.draft[f] = view.draft[f] || {})[t.name] = t.value;
      if (t.form) for (const el of t.form.elements) if (el.name && el.type !== "radio" && el.type !== "checkbox" && el.type !== "submit") view.draft[f][el.name] = el.value;
      if (f === "act" && t.form) { view.draft.act.refs = checked(t.form, "refs"); view.draft.act.info = checked(t.form, "info"); for (const n of ["type", "follows", "sameUnderAll", "dominates"]) view.draft.act[n] = radio(t.form, n); }
      render();
    } else if (t.form && t.form.dataset.form === "cand" && t.name === "from") view.draft.cand = Object.assign(view.draft.cand || {}, { from: checked(t.form, "from") });
  });
  app.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-act]");
    if (!b || b.tagName !== "BUTTON") return;
    const act = b.dataset.act, id = b.dataset.id;
    const H = {
      palette: () => openPalette(b), new: () => run("new"), export: () => run("export"), import: () => run("import"), "copy-md": () => run("copy-markdown"), reset: () => run("reset"), how: () => run("how"),
      stage: () => go(id), prev: () => step(-1), next: () => step(1),
      promote: () => { view.edit = { kind: "promote", id }; render(); focusFirst("promote-note"); },
      resolve: () => { view.edit = { kind: "resolve", id }; render(); focusFirst("resolve-reason"); },
      dismiss: () => { view.edit = { kind: "dismiss", id }; render(); focusFirst("dismiss-reason"); },
      withdraw: () => { view.edit = { kind: "withdraw", id }; render(); focusFirst("withdraw-reason"); },
      "cancel-edit": () => { view.edit = null; view.error = null; render(); },
      reopen: () => commit({ do: "resolve", id, status: "open" }, "Contradiction reopened"),
      explained: () => commit({ do: "edit", id, status: "explained" }, "Surprise marked as explained by the current orientation"),
      keep: () => { if (commit({ do: "keep" }, "Keeping the current orientation. Act, then observe.")) go("act"); },
      reorient: () => { if (commit({ do: "reorient", deep: false }, "Reorientation started: choose one to three destructive moves")) go("destroy"); },
      deep: () => { if (commit({ do: "reorient", deep: true }, "Deep reset: intent, boundaries, actors, categories, causal claims and constraints can all be destroyed")) go("destroy"); },
      wsmode: () => commit({ do: "wsmode", mode: id }, "Destruction mode: " + id),
      jolt: () => commit({ do: "jolt" }, "Another jolt"),
      op: () => { view.op = id; view.draft.mv = {}; view.error = null; render(); focusFirst(OPS.get(id).targets.length ? (OPS.get(id).multi ? "" : "mv-target") : "mv-replacement"); const f = $("op-form"); if (f) f.scrollIntoView({ block: "nearest" }); },
      "cancel-op": () => { view.op = null; render(); },
      unmove: () => commit({ do: "unmove", id }, "Move undone; its replacement is withdrawn"),
      "use-prompt": () => { const p = L.creationPrompts(S).find((x) => x.id === id); view.draft.cand = Object.assign(view.draft.cand || {}, { from: p.from, prompt: p.id }); render(); focusFirst("cand-inside"); },
      drop: () => commit({ do: "drop", id }, "Candidate dropped; it stays in the lineage"),
      retain: () => { if (commit({ do: "retain" }, "Current orientation retained")) go("act"); },
      "all-dims": () => { view.allDims = !view.allDims; render(); },
      "more-q": () => { view.moreQ = true; render(); },
      start: () => { const f = b.form; if (f && submit(f) && commit({ do: "start", id: L.currentAction(S).id }, "Action started. The prediction is frozen.")) go("observe"); },
      "goto-observe": () => go("observe"),
      inspect: () => { view.inspect = id; render(); const el = $("inspect"); if (el) { el.scrollIntoView({ block: "start" }); el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); } announce("Inspecting " + L.labelOf(S, id) + "; the current orientation is unchanged"); },
      "close-inspect": () => { view.inspect = null; render(); },
      example: () => loadExample(id),
      card: () => { const c = D.cards.find((x) => x.id === id); confirmReplace(() => { S = L.apply(L.blank(), { do: "new", title: c.seed, description: c.text + " (From the card “" + c.title + "”, an application from Yu Jie Teo's OODA notes.)" }).state; persist(); render(); announce("Started from the card " + c.title); }); },
    };
    if (H[act]) { e.preventDefault(); H[act](); }
  });

  /* ---------- dialogs ---------- */
  let invoker = null;
  function dialog(title, html, ready) {
    const d = $("dlg");
    if (!d.open) invoker = document.activeElement;
    $("dlg-title").textContent = title;
    $("dlg-body").innerHTML = html;
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
    if (ready) ready(d);
    const f = d.querySelector("textarea,input,button:not(#dlg-close)");
    if (f) f.focus();
  }
  function restoreFocus() { if (invoker && invoker.isConnected && invoker.focus) invoker.focus(); else { const s = document.querySelector(".bar .search"); if (s) s.focus(); } }
  $("dlg").addEventListener("close", restoreFocus);
  $("dlg-close").addEventListener("click", () => $("dlg").close());

  function textDialog(title, text, note, filename) {
    dialog(title, "<p>" + note + '</p><label for="dlg-text">Text</label><textarea id="dlg-text" readonly>' + esc(text) + '</textarea><div class="row">' + (filename ? '<button type="button" class="primary" id="dlg-dl">Download file</button>' : "") + '<button type="button" id="dlg-copy">Copy</button><span id="dlg-msg" class="hint" role="status"></span></div>', () => {
      const ta = $("dlg-text");
      ta.addEventListener("focus", () => ta.select());
      if (filename) $("dlg-dl").addEventListener("click", () => { download(filename, text, "application/json"); $("dlg-msg").textContent = "Download started."; });
      $("dlg-copy").addEventListener("click", async () => { $("dlg-msg").textContent = (await copy(text)) ? "Copied." : "Copying was blocked: the text is selected; copy it with " + MOD + " C."; ta.focus(); ta.select(); });
    });
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || "text/markdown" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.hidden = true;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; } }

  function run(cmd) {
    const C = {
      "add-signal": () => addOf("signal"), "add-assumption": () => addOf("assumption"), "add-contradiction": () => addOf("contradiction"),
      reorient: () => { if (needSit() && commit({ do: "reorient", deep: false }, "Reorientation started")) go("destroy"); },
      "deep-reset": () => { if (needSit() && commit({ do: "reorient", deep: true }, "Deep reset started")) go("destroy"); },
      compare: () => needSit() && go("compare"), "record-outcome": () => needSit() && go("observe", S.actions.some((a) => a.status === "started") ? "outcome-form" : "observe"),
      "open-lineage": () => needSit() && go("observe", "lineage"), "show-predictions": () => needSit() && go("observe", "predictions"),
      new: () => confirmReplace(() => { S = L.blank(); persist(); render(); focusFirst("start-title"); announce("Ready for a new situation"); }),
      reset: () => dialog("Reset?", "<p>Reset clears this situation from this browser. Export JSON first to keep it.</p><div class=\"row\"><button type=\"button\" class=\"danger\" id=\"dlg-yes\">Reset</button><button type=\"button\" id=\"dlg-no\">Cancel</button></div>", (d) => {
        $("dlg-yes").addEventListener("click", () => { S = L.blank(); if (store) L.clear(store); view.inspect = null; d.close(); render(); announce("Situation cleared"); });
        $("dlg-no").addEventListener("click", () => d.close());
      }),
      export: () => textDialog("Export JSON", L.exportJSON(S), "The lossless archive of this situation (schema version " + L.SCHEMA + "). Download it, or copy the text.", "orient-situation.json"),
      "copy-markdown": async () => { const md = L.markdown(S); if (await copy(md)) announce("Markdown copied"); else textDialog("Copy Markdown", md, "Copying was blocked. Select the text below and copy it."); },
      import: () => dialog("Import JSON", '<p>Choose an exported file or paste its text. Your current situation is replaced only if the file is valid.</p><label for="imp-file">File</label><input type="file" id="imp-file" accept="application/json,.json"><label for="imp-text">Or paste JSON</label><textarea id="imp-text"></textarea><p id="imp-msg" class="err" role="alert"></p><div class="row"><button type="button" class="primary" id="imp-go">Import</button></div>', (d) => {
        const go_ = (text) => { const r = L.importText(text); if (!r.ok) { $("imp-msg").textContent = r.message; return; } S = r.state; persist(); view.inspect = null; d.close(); render(); announce(r.migrated ? "Imported and migrated from an older version" : "Situation imported"); };
        $("imp-file").addEventListener("change", (e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => go_(rd.result); rd.onerror = () => { $("imp-msg").textContent = L.MSG.invalid; }; rd.readAsText(f); });
        $("imp-go").addEventListener("click", () => go_($("imp-text").value));
      }),
      how: () => dialog("How this works", $("how-src").innerHTML),
    };
    if (C[cmd]) C[cmd]();
  }
  function needSit() { if (!S.orientations.length) { announce("Start a situation first."); focusFirst("start-title"); return false; } return true; }
  function addOf(type) { if (!needSit()) return; view.draft.add = { type }; go("reality"); render(); focusFirst("add-text"); }

  /* ---------- palette ---------- */
  const pal = $("palette"), pin = $("pal-input"), plist = $("pal-list");
  let results = [], sel = 0, palInvoker = null;
  function openPalette(from) {
    palInvoker = from || document.activeElement;
    pin.value = "";
    draw();
    if (!pal.open) { if (pal.showModal) pal.showModal(); else pal.setAttribute("open", ""); }
    pin.focus();
  }
  function draw() {
    results = L.search(S, pin.value, 40).results;
    sel = 0;
    plist.innerHTML = results.map((r, i) => '<li role="option" id="pal-' + i + '" class="' + (r.kind === "command" ? "cmd" : "") + '" aria-selected="' + (i === sel) + '"><span class="ty">' + esc(r.type) + '</span><span class="ti">' + esc(r.title) + '</span><span class="lo">' + esc(r.location) + (r.loop ? " · Loop " + r.loop : "") + "</span></li>").join("");
    $("pal-count").textContent = results.length ? results.length + " results" : "No results";
    mark();
  }
  function mark() {
    [...plist.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === sel)));
    pin.setAttribute("aria-activedescendant", results.length ? "pal-" + sel : "");
    const li = $("pal-" + sel);
    if (li && li.scrollIntoView) li.scrollIntoView({ block: "nearest" });
  }
  function choose(i) {
    const r = results[i];
    if (!r) return;
    pal.close();
    if (r.kind === "command") { run(r.id); return; }
    const nav = L.navigate(S, r);
    if (nav.stage === "example") { const el = $(r.id.replace(/^ex-/, "ex-")); if (!S.orientations.length || el) { view.flash = r.id; render(); } return; }
    if (nav.stage === "method") { const t = $(nav.id); if (t) { const det = t.closest("details"); if (det) det.open = true; t.classList.add("flash"); t.scrollIntoView({ block: "center" }); t.setAttribute("tabindex", "-1"); t.focus(); } return; }
    if (nav.stage === "lineage") { view.inspect = nav.inspect; go("observe", "lineage"); render(); const el = $("inspect"); if (el) { el.scrollIntoView({ block: "start" }); el.setAttribute("tabindex", "-1"); el.focus(); } announce("Inspecting a historical orientation; the current orientation is unchanged"); return; }
    const prefix = r.type === "Prediction" ? "pr-" : r.type === "Action" ? "ac-" : r.type === "Outcome" ? "oc-" : /orientation/i.test(r.type) ? "or-" : "it-";
    if (S.orientations.length && nav.stage !== S.uiPreferences.stage) S = L.apply(S, { do: "stage", stage: nav.stage }).state, persist();
    view.flash = prefix + nav.id;
    render();
  }
  pin.addEventListener("input", draw);
  pin.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); mark(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === "Home") { e.preventDefault(); sel = 0; mark(); }
    else if (e.key === "End") { e.preventDefault(); sel = results.length - 1; mark(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(sel); }
  });
  plist.addEventListener("click", (e) => { const li = e.target.closest && e.target.closest("li"); if (li) choose(Number(li.id.slice(4))); });
  pal.addEventListener("close", () => { if (!view.flash && palInvoker && palInvoker.isConnected && palInvoker.focus && !pal.dataset.keep) palInvoker.focus(); });
  $("pal-close").addEventListener("click", () => pal.close());

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", (e) => {
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !e.shiftKey && (k === "k" || k === "K")) { e.preventDefault(); if (pal.open) pal.close(); else openPalette(document.activeElement); return; }
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (typing || pal.open || $("dlg").open || !S.orientations.length) return;
    if (mod && k === "Enter") { e.preventDefault(); step(1); }
    else if (e.altKey && !mod && k === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.altKey && !mod && k === "ArrowRight") { e.preventDefault(); step(1); }
    else if (!mod && !e.altKey && (k === "n" || k === "N")) {
      e.preventDefault();
      const st = S.uiPreferences.stage;
      if (st === "act") { go("act"); focusFirst("act-text"); }
      else if (st === "observe" && $("out-observed")) { go("observe"); focusFirst("out-observed"); }
      else if (st === "create" && S.workspace) { go("create"); focusFirst("cand-inside"); }
      else addOf(st === "model" ? "assumption" : "signal");
    } else if (!mod && !e.altKey && (k === "d" || k === "D")) {
      e.preventDefault();
      if (!S.workspace) commit({ do: "reorient", deep: false }, "Reorientation started");
      if (S.workspace && S.workspace.mode === "guided") commit({ do: "wsmode", mode: "manual" }, "All destruction operations");
      go("destroy");
      const b = app.querySelector(".ops button");
      if (b) b.focus();
    }
  });

  /* ---------- beamdswitch ---------- */
  const deckText = () => window.Beamdswitch.deck(window.OrientReport.report(S, L, D));
  const status = $("deck-status");
  $("save-beamdswitch").addEventListener("click", () => { download("ooda-orientation-beamdswitch.md", deckText()); status.textContent = "Saved the narrated deck."; });
  $("copy-beamdswitch").addEventListener("click", async () => { const t = deckText(); if (await copy(t)) status.textContent = "Copied the deck."; else textDialog("Copy deck", t, "Copying was blocked. Select the text below and copy it."); });

  /* ---------- read-only tools for agents ---------- */
  const result = (x) => ({ content: [{ type: "text", text: JSON.stringify(x) }] });
  const mc = (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext);
  mc?.registerTool({ name: "get_data", description: "Return the planner's built-in material: destruction operations, worked examples, cards and methodology.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute() { return result({ operations: D.operations, examples: D.examples.map((e) => ({ id: e.id, title: e.title, purpose: e.purpose })), cards: D.cards, methodology: D.methodology, truncated: false }); } });
  mc?.registerTool({ name: "get_metadata", description: "Return the title, sources and provenance classes.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute() { return result({ title: document.title, sources: D.sources, provenance: D.provenance, schemaVersion: L.SCHEMA, truncated: false }); } });
  mc?.registerTool({ name: "query", description: "Search the current situation and the built-in material without changing anything.", inputSchema: { type: "object", properties: { text: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute(input = {}) { const r = L.search(S, input.text || "", 50); return result({ results: r.results.map((x) => ({ type: x.type, title: x.title, location: x.location, loop: x.loop || null })), total: r.total, truncated: r.total > r.results.length }); } });

  $("static").hidden = true;
  app.hidden = false;
  render();
})();
