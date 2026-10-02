/* Interface for the page's hours mode (the Next week's hours tab). All numbers come from HoursLogic
 * (hours-logic); this file only reads inputs, renders the view and handles storage and exports. The plan
 * is stored under its own key, apart from the experiment. */
(function () {
  "use strict";
  const H = HoursLogic, D = JSON.parse(document.getElementById("mab-data").textContent);
  const KEY = "multi-armed-bandit:hours:v1", FILE = "multi-armed-bandit-hours";
  const { $, el, svg, say, isoToday, openStore, download } = BanditPage;

  /* ---- State and storage ---- */
  const { store, saved } = openStore(KEY);
  let S, saveTimer = 0, viewOf = null, viewMemo = null, visible = false;
  const view = () => (viewOf === S ? viewMemo : (viewMemo = H.view(viewOf = S)));
  function boot() {
    let msg = store ? "" : "Autosave is unavailable in this browser context; use Export JSON to keep your plan.";
    if (saved) {
      const r = H.parse(saved);
      if (r.error) msg = "Saved plan could not be restored (" + r.error + "); started a blank plan.";
      else { S = r.state; msg = "Restored your autosaved plan."; }
    }
    if (!S) { S = H.blank(D); save(); }
    $("h-store").textContent = msg;
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!store) return;
      try { store.setItem(KEY, H.serialise(S)); }
      catch (e) { $("h-store").textContent = "Autosave failed (storage unavailable or full). The plan still works; use Export JSON to keep it."; }
    }, 300);
  }
  const edited = () => ![H.fromExample(D), H.blank(D)].some((x) => H.serialise(x) === H.serialise(S));
  function commit(next, force) {
    S = next;
    render(force);
    save();
  }
  let pending = null;
  function ask(text, yes, back) {
    if (!edited()) return yes();
    pending = { yes, back };
    $("h-confirm-text").textContent = text;
    $("h-confirm").hidden = false;
    $("h-confirm-yes").focus();
  }
  function settle(ok) {
    const p = pending;
    pending = null;
    $("h-confirm").hidden = true;
    if (!p) return;
    if (ok) p.yes(); else if (p.back) { p.back.focus(); say("Kept your current plan.", $("h-store")); }
  }

  /* ---- Rendering ---- */
  const rowEls = new Map();
  let rowIds = "";
  const active = () => document.activeElement;
  const idx = (id) => S.activities.findIndex((a) => a.id === id);
  const nameOf = (id) => (S.activities.find((a) => a.id === id) || {}).name;
  function invalid(inputs, bad) { for (const x of inputs) x.setAttribute("aria-invalid", bad ? "true" : "false"); }
  function buildRows() {
    const body = $("ht-body");
    body.textContent = "";
    rowEls.clear();
    S.activities.forEach((a) => {
      const tr = el("tr"), c = {};
      const cell = (label, cls) => { const td = el("td", { "data-label": label }); if (cls) td.className = cls; tr.append(td); return td; };
      const input = (id, err, numeric) => el("input", Object.assign({ type: "text", id: id + "-" + a.id, autocomplete: "off", "aria-describedby": err + "-" + a.id }, numeric ? { inputmode: "numeric" } : {}));
      c.name = input("hn", "herr-name"); c.nameErr = el("p", { class: "err", id: "herr-name-" + a.id });
      cell("Activity", "wide").append(c.name, c.nameErr);
      c.w = input("hw", "herr-w", true); c.wErr = el("p", { class: "err", id: "herr-w-" + a.id });
      cell("Worthwhile blocks").append(c.w, c.wErr);
      c.x = input("hx", "herr-x", true); c.xErr = el("p", { class: "err", id: "herr-x-" + a.id });
      cell("Not-worthwhile blocks").append(c.x, c.xErr);
      for (const [k, label] of [["n", "Past blocks"], ["mean", "Posterior mean"], ["ci", "95% credible interval"], ["pb", "Chance best"], ["ts", "Thompson hours"], ["ucb", "UCB1 hours"]]) c[k] = cell(label, "n");
      c.rm = el("button", { type: "button", class: "rm" }, "Remove");
      cell("").append(c.rm);
      c.name.addEventListener("change", () => {
        const r = H.rename(S, idx(a.id), c.name.value);
        c.nameErr.textContent = r.error || ""; invalid([c.name], r.error);
        if (r.state && !r.unchanged) commit(r.state);
      });
      const count = (field, input, err) => input.addEventListener("change", () => {
        const r = H.setCount(S, idx(a.id), field, input.value);
        err.textContent = r.error || ""; invalid([input], r.error);
        if (r.state && !r.unchanged) { commit(r.state); say("Updated blocks for " + nameOf(a.id) + "; plan recalculated.", $("h-status")); }
      });
      count("worthwhile", c.w, c.wErr);
      count("notWorthwhile", c.x, c.xErr);
      c.rm.addEventListener("click", () => {
        const name = nameOf(a.id), r = H.removeActivity(S, idx(a.id));
        if (r.error) return say(r.error, $("h-status"));
        commit(r.state);
        $("h-add").focus();
        say("Removed " + name + "; plan recalculated.", $("h-status"));
      });
      c.tr = tr;
      rowEls.set(a.id, c);
      body.append(tr);
    });
    rowIds = S.activities.map((a) => a.id).join();
  }
  function render(force) {
    const V = view();
    const ex = S.basis !== "blank";
    $("h-basis").textContent = { blank: "Your own plan", example: "Fictional example counts", edited: "Fictional example, edited" }[S.basis];
    $("h-basis").className = "badge" + (ex ? " fic" : "");
    $("h-note").textContent = ex ? D.hours.note : "";
    $("h-clear").hidden = !ex;
    if (rowIds !== S.activities.map((a) => a.id).join()) buildRows();
    V.rows.forEach((r, i) => {
      const c = rowEls.get(r.id), a = S.activities[i];
      c.name.setAttribute("aria-label", "Name of activity " + (i + 1));
      c.w.setAttribute("aria-label", "Worthwhile blocks for " + r.name);
      c.x.setAttribute("aria-label", "Not-worthwhile blocks for " + r.name);
      c.rm.setAttribute("aria-label", "Remove " + r.name);
      c.rm.disabled = S.activities.length <= H.LIMITS.minActivities;
      const keep = (x) => !force && (active() === x || x.getAttribute("aria-invalid") === "true");
      if (!keep(c.name)) c.name.value = r.name;
      if (!keep(c.w)) c.w.value = String(a.worthwhile);
      if (!keep(c.x)) c.x.value = String(a.notWorthwhile);
      if (force) { c.nameErr.textContent = ""; c.wErr.textContent = ""; c.xErr.textContent = ""; invalid([c.name, c.w, c.x], false); }
      c.n.textContent = r.text.blocks;
      c.mean.textContent = r.text.mean;
      c.mean.title = "Posterior " + r.text.posterior;
      c.ci.textContent = r.text.interval;
      c.pb.textContent = r.text.probBest;
      c.ts.textContent = r.text.thompson;
      c.ucb.textContent = r.text.ucb;
    });
    $("h-add").disabled = S.activities.length >= H.LIMITS.maxActivities;
    $("h-count").textContent = S.activities.length + " activities (" + H.LIMITS.minActivities + " to " + H.LIMITS.maxActivities + "). Past blocks in all: " + V.totalBlocks + ".";
    const hours = $("h-hours");
    if (force || (active() !== hours && hours.getAttribute("aria-invalid") !== "true")) hours.value = String(S.hours);
    if (force) { $("e-hours").textContent = ""; hours.setAttribute("aria-invalid", "false"); }
    const plan = (k) => V.rows.filter((r) => r[k]).sort((a, b) => b[k] - a[k]).map((r) => r.name + " " + r[k] + " h").join(" · ");
    $("h-ts-pick").textContent = plan("thompson");
    $("h-ts-why").textContent = V.tsWhy;
    $("h-ucb-pick").textContent = plan("ucb");
    $("h-ucb-why").textContent = V.ucbWhy;
    $("h-agree").textContent = V.agreement;
    const sens = $("h-sens");
    sens.textContent = "";
    for (const x of V.sensitivity) sens.append(el("li", null, x));
    if (visible || force) chart(V);
  }
  function chart(V) {
    const w = $("h-chart").clientWidth, W = Math.max(280, Math.min(1100, w || 640)), left = Math.min(170, W * 0.34), right = 64, rowH = 38, top = 6;
    const most = Math.max(1, ...V.rows.map((r) => Math.max(r.thompson, r.ucb))), step = [1, 2, 5, 10, 20, 50].find((u) => u * 5 >= most), max = step * Math.ceil(most / step);
    const Ht = top + V.rows.length * rowH + 28;
    const x = (h) => left + (W - left - right) * h / max;
    const g = svg("svg", { viewBox: "0 0 " + W + " " + Ht, role: "img", "aria-labelledby": "hc-title hc-desc" });
    g.append(svg("title", { id: "hc-title" }, "Planned hours per activity: Thompson Sampling and UCB1"),
      svg("desc", { id: "hc-desc" }, V.rows.map((r) => r.name + ": Thompson " + r.text.thompson + ", UCB1 " + r.text.ucb).join("; ") + ". The table lists every value."));
    for (let h = 0; h <= max; h += step) {
      const xx = x(h);
      g.append(svg("line", { x1: xx, x2: xx, y1: top, y2: Ht - 22, class: "grid" }), svg("text", { x: xx, y: Ht - 6, "text-anchor": "middle", class: "ax" }, h + " h"));
    }
    V.rows.forEach((r, i) => {
      const y = top + i * rowH, name = r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name;
      g.append(svg("text", { x: 0, y: y + rowH / 2 + 4 }, name),
        svg("rect", { x: left, y: y + 4, width: Math.max(0, x(r.thompson) - left), height: 13, class: "bar-ts" }),
        svg("text", { x: x(r.thompson) + 5, y: y + 15, class: "ax" }, r.thompson + " h"),
        svg("rect", { x: left, y: y + 20, width: Math.max(0, x(r.ucb) - left), height: 13, class: "bar-ucb" }),
        svg("text", { x: x(r.ucb) + 5, y: y + 31, class: "ax" }, r.ucb + " h"));
    });
    $("h-chart").replaceChildren(g);
  }

  /* ---- Exports ---- */
  function showText(label, text) {
    $("h-export-label").textContent = label;
    $("h-export-text").value = text;
  }
  const planText = () => H.markdown(S, view(), D, isoToday());
  function wire() {
    $("h-add").addEventListener("click", () => {
      const r = H.addActivity(S);
      if (r.error) return say(r.error, $("h-status"));
      commit(r.state);
      const a = S.activities[S.activities.length - 1];
      $("hn-" + a.id).focus();
      say("Added " + a.name + " with no blocks; plan recalculated.", $("h-status"));
    });
    $("h-hours").addEventListener("change", () => {
      const r = H.setHours(S, $("h-hours").value);
      $("e-hours").textContent = r.error || "";
      $("h-hours").setAttribute("aria-invalid", r.error ? "true" : "false");
      if (r.state && !r.unchanged) { commit(r.state); say("Planning " + view().hoursText + "; Thompson Sampling gives " + view().lead + " the most.", $("h-status")); }
    });
    $("h-confirm-yes").addEventListener("click", () => settle(true));
    $("h-confirm-no").addEventListener("click", () => settle(false));
    $("h-save-md").addEventListener("click", () => {
      const text = planText();
      showText("Plan Markdown (" + FILE + "-plan.md)", text);
      try { download(FILE + "-plan.md", text, "text/markdown"); say("Saved " + FILE + "-plan.md. If no download appears, select the text under Export as text.", $("h-store")); }
      catch (e) { $("h-fallback").open = true; say("Saving is not allowed here; select the text under Export as text instead.", $("h-store")); }
    });
    $("h-copy-md").addEventListener("click", async () => {
      const text = planText();
      showText("Plan Markdown (" + FILE + "-plan.md)", text);
      try { await navigator.clipboard.writeText(text); say("Copied the plan as Markdown.", $("h-store")); }
      catch (e) { $("h-fallback").open = true; say("Copying is not allowed here. Use Save plan, or select the text under Export as text.", $("h-store")); }
    });
    $("h-export").addEventListener("click", () => {
      const text = H.serialise(S);
      showText("Plan JSON (" + FILE + ".json)", text);
      try { download(FILE + ".json", text, "application/json"); say("Exported " + FILE + ".json. If no download appears, select the text under Export as text.", $("h-store")); }
      catch (e) { $("h-fallback").open = true; say("Saving is not allowed here; select the text under Export as text instead.", $("h-store")); }
    });
    $("h-import").addEventListener("change", (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        ev.target.value = "";
        const r = H.parse(String(reader.result));
        if (r.error) return say("Import rejected: " + r.error + " Your current plan is unchanged.", $("h-store"));
        ask("Replace your edited plan with the imported file?", () => { commit(r.state, true); say("Imported " + file.name + ".", $("h-store")); }, $("h-import"));
      };
      reader.onerror = () => say("The file could not be read.", $("h-store"));
      reader.readAsText(file);
    });
    $("h-example").addEventListener("click", () => ask("Load the fictional example and discard your edited plan?", () => { commit(H.fromExample(D), true); say("Loaded the fictional example plan.", $("h-store")); }, $("h-example")));
    const toBlank = (btn) => () => ask("Start a blank plan and discard your edited plan?", () => { commit(H.blank(D), true); $("hn-a1").focus(); say("Started a blank plan with two activities and no blocks.", $("h-store")); }, btn);
    $("h-clear").addEventListener("click", toBlank($("h-clear")));
    $("h-blank").addEventListener("click", toBlank($("h-blank")));
    if (typeof ResizeObserver !== "undefined") {
      let last = 0, rw = 0;
      new ResizeObserver(() => {
        const w = $("main").clientWidth;
        if (w === last || !visible) return;
        last = w;
        cancelAnimationFrame(rw);
        rw = requestAnimationFrame(() => chart(view()));
      }).observe($("main"));
    }
  }

  /* ---- What the page's get_data tool reports ---- */
  function snapshot() {
    const V = view();
    return { basis: S.basis, hours: S.hours,
      activities: V.rows.map((r) => ({ name: r.name, pastBlocks: r.n, evidence: r.text.evidence, worthwhileShare: r.text.share, posteriorMean: r.text.mean, interval95: r.text.interval,
        chanceBest: r.text.probBest, thompsonHours: r.thompson, ucb1Hours: r.ucb, ucb1Score: r.text.score })),
      thompson: { why: V.tsWhy }, ucb1: { why: V.ucbWhy }, agreement: V.agreement, sensitivity: V.sensitivity };
  }

  boot();
  wire();
  render(true);
  self.HoursPage = { snapshot, shown(on) { visible = on; if (on) chart(view()); } };
})();
