/* Interface for the grammar laboratory. Logic lives in EGLogic (english-grammar-logic.js). */
(function () {
  "use strict";
  const L = window.EGLogic;
  const D = JSON.parse(document.getElementById("eg-data").textContent);
  const idx = L.index(D);
  const app = document.getElementById("app");
  const narrow = window.matchMedia("(max-width: 56rem)");
  const NS = "http://www.w3.org/2000/svg";

  const state = { concept: null, example: null, node: null, view: null, depth: 1, showAll: false, navOpen: !narrow.matches, notice: "" };

  /* ---------- small DOM helpers ---------- */
  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    (Array.isArray(kids) ? kids : kids === undefined ? [] : [kids]).forEach((k) => { if (k !== null && k !== undefined && k !== false) el.append(k); });
    return el;
  }
  function q(text) { return "“" + text + "”"; }
  function link(label, hash, attrs) { return h("a", Object.assign({ href: hash }, attrs || {}), label); }
  function refText(r) { return r.label + (r.page ? " (p. " + r.page + ")" : ""); }

  /* ---------- static frame ---------- */
  const toggle = h("button", { class: "concepts-btn", type: "button", "aria-controls": "nav", "aria-expanded": "false" }, "Concepts");
  const closeBtn = h("button", { class: "close-btn", type: "button", "aria-label": "Close concepts" }, "Close");
  const searchInput = h("input", { id: "q", type: "search", autocomplete: "off", spellcheck: "false", "aria-describedby": "q-help", "aria-controls": "results" });
  const results = h("div", { id: "results", class: "results", role: "region", "aria-live": "polite", "aria-label": "Search results" });
  const routeList = h("ol", { class: "route" });
  const confusionList = h("ul", { class: "confusions" });
  const outline = h("ul", { class: "outline", id: "outline" });
  const nav = h("nav", { id: "nav", class: "nav", "aria-label": "Concepts" }, [
    h("div", { class: "nav-head" }, [h("h2", { class: "nav-title", id: "nav-title" }, "Concepts"), closeBtn]),
    h("div", { class: "search", role: "search" }, [
      h("label", { for: "q" }, "Search concepts and examples"), searchInput,
      h("p", { id: "q-help", class: "hint" }, "Familiar terms (such as gerund or noun clause) lead to the matching concept; they are shown as aliases, not book terms."),
      results]),
    h("section", { "aria-labelledby": "route-h" }, [h("h3", { id: "route-h" }, "Start here: beginner route"), h("p", { class: "hint" }, "A suggested reading order; every concept stays open."), routeList]),
    h("section", { "aria-labelledby": "conf-h" }, [h("h3", { id: "conf-h" }, "Common confusions"), confusionList]),
    h("section", { "aria-labelledby": "browse-h" }, [h("h3", { id: "browse-h", tabindex: "-1" }, "Browse CGEL"), h("p", { class: "hint" }, "Chapters in the book's order. Muted chapters are not yet expanded in this version."), outline]),
  ]);
  const lab = h("main", { id: "lab", class: "lab", tabindex: "-1" });
  const live = h("div", { class: "sr-only", "aria-live": "polite", role: "status" });
  app.append(h("div", { class: "toolbar" }, [toggle]), h("div", { class: "layout" }, [nav, lab]), live);
  document.getElementById("static").remove();
  app.hidden = false;

  function say(text) { live.textContent = ""; window.setTimeout(() => { live.textContent = text; }, 30); }

  /* ---------- navigator ---------- */
  D.route.forEach((r, i) => routeList.append(h("li", {}, [link(idx.concepts.get(r.concept).name, "#" + r.concept, { "data-concept": r.concept }), h("span", { class: "hint" }, " " + r.orientation)])));
  D.confusions.forEach((f) => confusionList.append(h("li", {}, [link(f.label, "#" + f.concept + "/" + f.example, { "data-concept": f.concept }), h("span", { class: "hint" }, " " + f.orientation)])));
  D.chapters.forEach((ch) => {
    const ids = idx.chapterConcepts.get(ch.n) || [];
    const title = "Chapter " + ch.n + ". " + ch.title;
    if (!ids.length) {
      outline.append(h("li", { class: "chapter muted" }, [h("span", { class: "chapter-name" }, title), h("span", { class: "tag" }, "not yet expanded")]));
      return;
    }
    const list = h("ul", { class: "sections", id: "ch-" + ch.n, hidden: true });
    const groups = new Map();
    ids.forEach((id) => {
      const ref = idx.concepts.get(id).references[0], key = ref.section || "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(id);
    });
    const order = (k) => (k ? k.split(".").map((x) => x.padStart(3, "0")).join(".") : "999");
    [...groups.keys()].sort((a, b) => order(a).localeCompare(order(b))).forEach((key) => {
      const sec = ch.sections.find((s) => s.id === key);
      const head = sec ? "§" + sec.id + " " + sec.title + " (p. " + sec.page + ")" : "Chapter " + ch.n + " (section not cited)";
      list.append(h("li", { class: "section" }, [h("span", { class: "section-name" }, head),
        h("ul", {}, groups.get(key).map((id) => h("li", {}, link(idx.concepts.get(id).name, "#" + id, { "data-concept": id }))))]));
    });
    const btn = h("button", { type: "button", class: "chapter-btn", "aria-expanded": "false", "aria-controls": "ch-" + ch.n },
      [h("span", { class: "chapter-name" }, title), h("span", { class: "tag" }, ids.length + (ids.length === 1 ? " concept" : " concepts"))]);
    btn.addEventListener("click", () => setChapter(ch.n, btn.getAttribute("aria-expanded") !== "true"));
    outline.append(h("li", { class: "chapter" }, [btn, list]));
  });
  function setChapter(n, open) {
    const btn = outline.querySelector('[aria-controls="ch-' + n + '"]');
    if (!btn) return;
    btn.setAttribute("aria-expanded", String(open));
    document.getElementById("ch-" + n).hidden = !open;
  }

  /* Search */
  function renderResults() {
    const r = L.search(idx, searchInput.value, 30);
    results.textContent = "";
    if (!r.query) { results.append(h("p", { class: "hint" }, "Type a term such as object, determiner or gerund, or a word from an example such as cake.")); return; }
    if (!r.results.length) { results.append(h("p", {}, "No matches for " + q(r.query) + ". Try a familiar term, an abbreviation such as NP, or browse the chapters below.")); return; }
    const kind = { concept: "Concept", alias: "Familiar term, not a book term", abbreviation: "Abbreviation", example: "Example" };
    results.append(h("p", { class: "hint" }, r.total + (r.total === 1 ? " match" : " matches") + (r.total > r.results.length ? ", showing " + r.results.length : "")),
      h("ul", { class: "result-list" }, r.results.map((x) => h("li", {}, link([h("span", { class: "r-label" }, x.label), h("span", { class: "r-kind" }, kind[x.type] + (x.type === "concept" ? " · " + x.detail : " → " + x.detail))],
        "#" + x.concept + (x.example ? "/" + x.example : ""), { "data-concept": x.concept })))));
  }
  searchInput.addEventListener("input", renderResults);
  searchInput.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") { const a = results.querySelector("a"); if (a) { ev.preventDefault(); a.focus(); } }
  });
  results.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    const all = [...results.querySelectorAll("a")], i = all.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    if (ev.key === "ArrowUp" && i === 0) searchInput.focus();
    else (all[ev.key === "ArrowDown" ? Math.min(i + 1, all.length - 1) : i - 1]).focus();
  });
  renderResults();

  /* Drawer (phones) and collapsible sidebar (desktop) */
  function setNav(open, focusTarget, quiet) {
    state.navOpen = open;
    toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("nav-open", open);
    if (narrow.matches) {
      if (open) { nav.setAttribute("role", "dialog"); nav.setAttribute("aria-modal", "true"); nav.setAttribute("aria-labelledby", "nav-title"); }
      else { nav.removeAttribute("role"); nav.removeAttribute("aria-modal"); nav.removeAttribute("aria-labelledby"); }
      lab.inert = open; document.querySelector(".top").inert = open; document.querySelector(".foot").inert = open;
      if (quiet) return;
      if (open) (focusTarget || searchInput).focus();
      else toggle.focus();
    } else {
      lab.inert = false; document.querySelector(".top").inert = false; document.querySelector(".foot").inert = false;
      nav.removeAttribute("role"); nav.removeAttribute("aria-modal");
      if (open && focusTarget) focusTarget.focus();
    }
  }
  toggle.addEventListener("click", () => setNav(!state.navOpen));
  closeBtn.addEventListener("click", () => setNav(false));
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && narrow.matches && state.navOpen) { ev.preventDefault(); setNav(false); }
    if (ev.key === "Tab" && narrow.matches && state.navOpen) {
      const f = [...nav.querySelectorAll("a[href], button, input")].filter((el) => !el.closest("[hidden]"));
      if (!f.length) return;
      if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
    }
  });
  nav.addEventListener("click", (ev) => {
    const a = ev.target.closest("a[href^='#']");
    if (a && narrow.matches && state.navOpen) setNav(false);
  });
  narrow.addEventListener("change", () => setNav(!narrow.matches, null, true));

  /* ---------- laboratory ---------- */
  let els = {};

  function renderConcept() {
    const c = idx.concepts.get(state.concept);
    lab.textContent = "";
    if (state.notice) lab.append(h("p", { class: "notice", role: "status" }, state.notice));
    if (state.start) {
      lab.append(h("section", { class: "start", "aria-labelledby": "start-h" }, [
        h("h2", { id: "start-h", class: "start-h" }, "Start here"),
        h("p", {}, "One tiny sentence shows the key distinction. Select a word, then the bracket above it: the word and the phrase get different answers."),
        h("button", { type: "button", class: "btn", onclick: () => { setNav(true, document.getElementById("browse-h")); document.getElementById("browse-h").scrollIntoView({ block: "start" }); } }, "Browse CGEL")]));
    }
    const ri = idx.route.indexOf(c.id);
    const routeNav = ri < 0 ? null : h("p", { class: "routenav" }, [
      h("span", {}, "Beginner route · stop " + (ri + 1) + " of " + idx.route.length),
      ri > 0 ? link("Previous: " + idx.concepts.get(idx.route[ri - 1]).name, "#" + idx.route[ri - 1]) : null,
      ri < idx.route.length - 1 ? link("Next concept: " + idx.concepts.get(idx.route[ri + 1]).name, "#" + idx.route[ri + 1]) : null]);
    const article = h("article", { class: "concept", "aria-labelledby": "concept-h" }, [
      h("p", { class: "ref" }, "CGEL " + refText(c.references[0])),
      h("h2", { id: "concept-h", tabindex: "-1" }, c.name),
      c.aliases ? h("p", { class: "aliases" }, [h("span", {}, "Familiar terms: "), c.aliases.join(", "), h("span", { class: "hint" }, " (aliases, not the book's terms)")]) : null,
      h("p", { class: "orientation" }, c.orientation),
      routeNav]);
    els.rail = h("ul", { class: "rail", "aria-label": "Examples for this concept" });
    els.example = h("section", { class: "example", "aria-labelledby": "ex-h" });
    article.append(h("h3", { id: "ex-h", class: "ex-h" }, "Examples"), els.rail, els.example);
    els.why = h("details", { class: "disc", open: true }, [h("summary", {}, "Why this analysis?")]);
    els.compare = h("details", { class: "disc", "data-view": "compare" }, [h("summary", {}, "Compare")]);
    els.tree = h("details", { class: "disc", "data-view": "tree" }, [h("summary", {}, "Tree")]);
    article.append(els.why, els.compare, els.tree);
    if (c.note) article.append(h("details", { class: "disc" }, [h("summary", {}, "Technical note"), h("p", {}, c.note),
      c.references.length > 1 ? h("p", { class: "hint" }, "Also: " + c.references.slice(1).map(refText).join("; ")) : null]));
    if (c.related.length) article.append(h("details", { class: "disc" }, [h("summary", {}, "Related concepts"),
      h("ul", { class: "related" }, c.related.map((r) => h("li", {}, [link(idx.concepts.get(r).name, "#" + r), h("span", { class: "hint" }, " " + refText(idx.concepts.get(r).references[0]))])))]));
    lab.append(article);
    [els.compare, els.tree].forEach((d) => d.addEventListener("toggle", () => {
      const view = d.open ? d.dataset.view : (state.view === d.dataset.view ? null : state.view);
      if (d.open) { (d === els.tree ? els.compare : els.tree).open = false; }
      if (view !== state.view) { state.view = view; pushHash(); }
      if (d === els.tree && d.open) renderTree();
    }));
    renderRail();
    renderCompare();
    renderExample();
    highlightNav();
  }

  function renderRail() {
    const c = idx.concepts.get(state.concept);
    els.rail.textContent = "";
    const shown = state.showAll ? c.items : c.items.slice(0, 4);
    if (!shown.some((i) => i.ex === state.example)) shown.push(c.items.find((i) => i.ex === state.example));
    shown.forEach((item) => {
      const e = idx.examples.get(item.ex), current = item.ex === state.example;
      els.rail.append(h("li", {}, h("button", { type: "button", class: "rail-btn", "aria-current": current ? "true" : null, "data-ex": item.ex,
        onclick: () => chooseExample(item.ex, true) }, e.text)));
    });
    if (c.items.length > shown.length) {
      els.rail.append(h("li", {}, h("button", { type: "button", class: "more-btn", onclick: () => {
        state.showAll = true; renderRail(); const b = els.rail.querySelectorAll(".rail-btn")[4]; if (b) b.focus();
      } }, "Show more examples (" + (c.items.length - shown.length) + ")")));
    }
  }

  function chooseExample(exId, fromRail) {
    if (exId === state.example) return;
    state.example = exId;
    state.explicitExample = true;
    pushHash();
    applyExample();
    if (fromRail) {
      const b = els.rail.querySelector('[data-ex="' + exId + '"]');
      if (b) b.focus();
      say("Showing example: " + idx.examples.get(exId).text);
    }
  }

  function applyExample() {
    const item = L.primaryItem(idx, state.concept, state.example);
    state.example = item.ex;
    state.node = item.node;
    state.depth = Math.max(1, Math.min(L.maxDepth(idx, item.ex), 1));
    els.rail.querySelectorAll(".rail-btn").forEach((b) => { if (b.dataset.ex === state.example) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
    renderExample();
    renderCompare();
  }

  function renderExample() {
    const e = idx.examples.get(state.example);
    els.example.textContent = "";
    if (e.context) els.example.append(h("p", { class: "context" }, [h("span", { class: "tag" }, "Context"), " " + e.context]));
    els.strip = h("div", { class: "strip", role: "group", "aria-label": "Sentence structure of " + q(e.text), "aria-describedby": "strip-help" });
    els.stripWrap = h("div", { class: "strip-wrap" }, els.strip);
    const depthNote = h("span", { class: "hint", id: "depth-note" });
    const unfold = h("button", { type: "button", class: "btn small", onclick: () => setDepth(state.depth + 1) }, "Unfold one level");
    const fold = h("button", { type: "button", class: "btn small", onclick: () => setDepth(state.depth - 1) }, "Fold one level");
    const all = h("button", { type: "button", class: "btn small", onclick: () => setDepth(L.maxDepth(idx, e.id)) }, "Unfold all");
    els.depthControls = { unfold, fold, all, depthNote };
    els.inspector = h("section", { class: "inspector", "aria-labelledby": "insp-h" });
    [
      h("p", { class: "sentence" }, [h("span", { class: "sr-only" }, "Example: "), e.text]),
      e.usage ? h("p", { class: "usage" }, [h("span", { class: "tag" }, "Usage"), " " + e.usage]) : null,
      els.stripWrap,
      h("p", { id: "strip-help", class: "hint" }, "Select a word, or a band above the words for the phrase or clause. With a part focused, arrow keys move: Up to the containing constituent, Down to its first part, Left and Right to neighbours."),
      h("div", { class: "controls" }, [unfold, fold, all, depthNote]),
      els.inspector].forEach((x) => { if (x) els.example.append(x); });
    if (e.predict) {
      const ans = h("p", { class: "answer", hidden: true }, e.predict.answer);
      const btn = h("button", { type: "button", class: "btn small", "aria-expanded": "false" }, "Reveal the analysis");
      btn.addEventListener("click", () => { ans.hidden = false; btn.setAttribute("aria-expanded", "true"); btn.disabled = true; select(e.predict.node, false); });
      els.example.append(h("div", { class: "predict" }, [h("p", {}, [h("span", { class: "tag" }, "Try it"), " " + e.predict.question]), btn, ans]));
    }
    els.why.querySelectorAll(":scope > :not(summary)").forEach((x) => x.remove());
    els.why.append(h("p", {}, e.explanation));
    drawStrip();
    renderInspector();
    if (els.tree.open) renderTree();
  }

  function setDepth(d) {
    const max = L.maxDepth(idx, state.example);
    state.depth = Math.max(0, Math.min(max, d));
    drawStrip();
    say("Showing " + (state.depth >= max ? "all levels" : state.depth + (state.depth === 1 ? " level" : " levels")) + " of structure");
  }

  /* Sentence strip: one grid column per token (and per gap); bands for visible phrases above the words. */
  function drawStrip() {
    const e = idx.examples.get(state.example), map = idx.nodes.get(e.id);
    const strip = els.strip, hadFocus = strip.contains(document.activeElement);
    strip.textContent = "";
    const gaps = [...map.values()].filter((v) => v.node.gap).map((v) => v.node);
    const col = new Map(), slots = [];
    e.tokens.forEach((t, i) => {
      gaps.filter((g) => g.at === i).forEach((g) => { col.set("g:" + g.id, slots.length + 1); slots.push({ gap: g }); });
      col.set(i, slots.length + 1); slots.push({ token: t, i: i });
    });
    gaps.filter((g) => g.at >= e.tokens.length).forEach((g) => { col.set("g:" + g.id, slots.length + 1); slots.push({ gap: g }); });
    const bands = L.visibleBands(idx, e.id, state.depth, state.node);
    const rows = Math.max(...bands.map((b) => b.depth)) + 1;
    strip.style.gridTemplateColumns = "repeat(" + slots.length + ", max-content)";
    const colOf = (n) => {
      if (n.gap) return [col.get("g:" + n.id), col.get("g:" + n.id) + 1];
      let a = col.get(n.span[0]), b = col.get(n.span[1] - 1) + 1;
      // A gap at a phrase's edge belongs to the innermost phrase containing it.
      gaps.forEach((g) => { if (contains(n, g)) { const c = col.get("g:" + g.id); a = Math.min(a, c); b = Math.max(b, c + 1); } });
      return [a, b];
    };
    bands.forEach((b) => {
      const n = map.get(b.id).node, [a, z] = colOf(n);
      strip.append(nodeButton(e, n, "band", { gridColumn: a + " / " + z, gridRow: String(b.depth + 1) }));
    });
    slots.forEach((s, i) => {
      const style = { gridColumn: String(i + 1), gridRow: String(rows + 1) };
      if (s.gap) strip.append(nodeButton(e, s.gap, "word gap", style));
      else if (s.token.k === "p") strip.append(h("span", { class: "punct", style: "grid-column:" + style.gridColumn + ";grid-row:" + style.gridRow, "aria-hidden": "true" }, s.token.t));
      else {
        const leaf = [...map.values()].find((v) => v.node.word === s.i).node;
        strip.append(nodeButton(e, leaf, "word", style));
      }
    });
    const max = L.maxDepth(idx, e.id);
    els.depthControls.unfold.disabled = state.depth >= max;
    els.depthControls.all.disabled = state.depth >= max;
    els.depthControls.fold.disabled = state.depth <= 0;
    els.depthControls.depthNote.textContent = state.depth >= max ? "All levels shown" : "Showing " + state.depth + " of " + max + " levels";
    if (hadFocus) focusNode(strip);
  }

  function contains(n, target) {
    return (n.children || []).some((k) => k === target || contains(k, target));
  }

  function nodeButton(e, n, kind, style) {
    const sel = n.id === state.node, d = L.describe(idx, e.id, n.id);
    const label = (n.fn ? n.fn + ": " : "") + n.cat;
    const btn = h("button", { type: "button", class: kind + (sel ? " selected" : ""), "data-node": n.id, tabindex: sel ? "0" : "-1",
      "aria-current": sel ? "true" : null,
      "aria-label": (kind === "band" ? "" : "Word ") + L.announce(d) + " (" + (d.level === "gap" ? "gap" : d.level + " level") + ")" });
    btn.style.gridColumn = style.gridColumn;
    btn.style.gridRow = style.gridRow;
    if (kind === "band") btn.append(h("span", { class: "band-label" }, label));
    else {
      btn.append(h("span", { class: "w" }, n.gap ? "__" : e.tokens[n.word].t), h("span", { class: "wl" }, n.cat));
    }
    btn.addEventListener("click", () => select(n.id, false));
    btn.addEventListener("keydown", (ev) => keyNav(ev, btn.parentElement));
    return btn;
  }

  function keyNav(ev, container) {
    const dir = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Home: "home" }[ev.key];
    if (!dir) return;
    ev.preventDefault();
    const next = L.move(idx, state.example, state.node, dir);
    if (next !== state.node) select(next, true, container);
  }

  function focusNode(container) {
    const b = container && container.querySelector('[data-node="' + state.node + '"]');
    if (b) b.focus({ preventScroll: false });
  }

  /* Select a node everywhere (strip, tree, inspector); move focus only within the container in use. */
  function select(nodeId, keepFocus, container) {
    const active = document.activeElement;
    const where = els.treeNodes && els.treeNodes.contains(active) ? "tree" : els.inspector.contains(active) ? "inspector" : null;
    state.node = nodeId;
    drawStrip();
    renderInspector();
    if (els.tree.open) renderTree();
    if (keepFocus && container) focusNode(container.classList.contains("tree-nodes") ? els.treeNodes : els.strip);
    else if (where === "tree") focusNode(els.treeNodes);
    else if (where === "inspector") focusNode(els.strip);
    say("Selected " + L.announce(L.describe(idx, state.example, nodeId)));
  }

  function renderInspector() {
    const d = L.describe(idx, state.example, state.node);
    const ins = els.inspector;
    ins.textContent = "";
    const levelName = { word: "word", phrase: "phrase", clause: "clause", coordination: "coordination", gap: "gap (understood element)" }[d.level];
    ins.append(h("h4", { id: "insp-h" }, [h("span", { class: "tag" }, "Selected " + levelName), " " + q(d.text)]));
    const dl = h("dl", { class: "fields" });
    const row = (term, value) => dl.append(h("div", { class: "field" }, [h("dt", {}, term), h("dd", {}, value)]));
    row("Category", d.category + (d.level === "word" ? " (word level)" : d.level === "phrase" || d.level === "clause" ? " (" + d.level + " level)" : ""));
    if (d.top) row("Function", "None at this level: this is the top-level unit of the example, not part of a larger structure.");
    else row("Function", [h("strong", {}, d.function), " in the " + d.container.category.toLowerCase() + " " + q(d.container.text)]);
    if (d.head) row("Head", [q(d.head.text), " (" + d.head.category.toLowerCase() + ")"]);
    if (d.contains) row("Contains", h("ul", { class: "contains" }, d.contains.map((k) => h("li", {}, [h("button", { type: "button", class: "linkish", onclick: () => select(k.id, false) }, k.function + ": " + k.category), " " + q(k.text)]))));
    if (d.construction) row("Construction", d.construction);
    if (d.form) row("Form / feature", d.form);
    if (d.anchor) row("Anchor", ["Supplement to " + q(d.anchor.text) + "; it is not a dependent of it."]);
    if (d.gap) row("Gap", ["Not pronounced here; understood via " + q(d.gap.text) + "."]);
    if (d.fused) row("Fusion", "One expression with two functions at once (" + d.function.toLowerCase() + ").");
    ins.append(dl);
  }

  /* Contrasts */
  function renderCompare() {
    const ks = D.contrasts.filter((k) => k.concepts.includes(state.concept));
    els.compare.hidden = !ks.length;
    els.compare.querySelectorAll(":scope > :not(summary)").forEach((x) => x.remove());
    if (!ks.length) return;
    ks.sort((a, b) => (b.a.ex === state.example || b.b.ex === state.example) - (a.a.ex === state.example || a.b.ex === state.example));
    ks.forEach((k) => {
      const card = (side) => {
        const e = idx.examples.get(k[side].ex), d = L.describe(idx, e.id, k[side].node), n = idx.nodes.get(e.id).get(k[side].node).node;
        const sent = h("p", { class: "sentence small" });
        e.tokens.forEach((t, i) => {
          const inside = n.span && i >= n.span[0] && i < n.span[1];
          const piece = (sent.childNodes.length && !(t.k === "p" && ".,!?;:".includes(t.t)) ? " " : "") + t.t;
          if (inside) { const last = sent.lastChild; if (last && last.tagName === "MARK") last.textContent += piece; else { if (piece.startsWith(" ")) sent.append(" "); sent.append(h("mark", {}, piece.trim())); } }
          else sent.append(piece);
        });
        const concept = e.concepts.includes(state.concept) ? state.concept : e.concepts[0];
        return h("div", { class: "card" }, [sent,
          h("p", {}, [h("strong", {}, d.top ? "Top level" : d.function), " · " + d.category]),
          h("p", { class: "small-text" }, e.explanation),
          link("Open this example", "#" + concept + "/" + e.id)]);
      };
      els.compare.append(h("section", { class: "contrast" }, [h("div", { class: "pair" }, [card("a"), card("b")]), h("p", { class: "diff" }, [h("strong", {}, "The difference. "), k.explanation])]));
    });
  }

  /* CGEL-style tree, synchronised with the strip, plus a text outline. */
  const measureCtx = document.createElement("canvas").getContext && document.createElement("canvas").getContext("2d");
  function measure(text) {
    if (measureCtx) { measureCtx.font = "13px " + getComputedStyle(document.body).fontFamily; return Math.ceil(measureCtx.measureText(text).width); }
    return text.length * 7.5;
  }
  function renderTree() {
    const e = idx.examples.get(state.example), map = idx.nodes.get(e.id);
    els.tree.querySelectorAll(":scope > :not(summary)").forEach((x) => x.remove());
    const lay = L.layout(idx, e.id, measure);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", lay.width); svg.setAttribute("height", lay.height); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("class", "tree-lines");
    const nodesBox = h("div", { class: "tree-nodes", role: "group", "aria-label": "Tree of " + q(e.text), "aria-describedby": "tree-help" });
    nodesBox.style.width = lay.width + "px"; nodesBox.style.height = lay.height + "px";
    for (const [id, v] of map) {
      const p = lay.pos.get(id);
      if (v.parent) {
        const pp = lay.pos.get(v.parent), line = document.createElementNS(NS, "line");
        line.setAttribute("x1", pp.x); line.setAttribute("y1", pp.y + 40); line.setAttribute("x2", p.x); line.setAttribute("y2", p.y);
        svg.append(line);
      }
      const n = v.node, sel = id === state.node, d = L.describe(idx, e.id, id);
      const b = h("button", { type: "button", class: "tnode" + (sel ? " selected" : "") + (p.leaf ? " leaf" : ""), "data-node": id, tabindex: sel ? "0" : "-1", "aria-current": sel ? "true" : null, "aria-label": L.announce(d) });
      b.style.left = (p.x - Math.max(p.w, 44) / 2) + "px"; b.style.top = p.y + "px"; b.style.width = Math.max(p.w, 44) + "px";
      b.append(h("span", { class: "tl" }, p.label));
      if (p.leaf) b.append(h("span", { class: "tw" }, n.gap ? "__" : p.text));
      b.addEventListener("click", () => select(id, false));
      b.addEventListener("keydown", (ev) => keyNav(ev, nodesBox));
      nodesBox.append(b);
    }
    els.treeNodes = nodesBox;
    const used = new Set(), cats = new Set(), notes = new Set();
    for (const v of map.values()) {
      if (v.node.fn) used.add(v.node.fn);
      cats.add(v.node.cat);
      if (v.node.gap) notes.add("gap");
      if (v.node.fn && v.node.fn.includes("+")) notes.add("fusion");
      if (v.node.anchor) notes.add("supplement");
    }
    const key = h("dl", { class: "tree-key" }, [...used].map((f) => h("div", {}, [h("dt", {}, f), h("dd", {}, D.labels.functions[f])]))
      .concat([...cats].map((c) => h("div", {}, [h("dt", {}, c), h("dd", {}, D.labels.categories[c])]))));
    function outlineList(n) {
      const d = L.describe(idx, e.id, n.id);
      const extra = (n.gap ? " — gap, understood via " + q(d.gap.text) : "") + (n.anchor ? " — supplement anchored to " + q(d.anchor.text) : "");
      return h("li", {}, [(d.top ? "" : d.function + ": ") + d.category + " " + q(d.text) + extra,
        n.children ? h("ul", {}, n.children.map(outlineList)) : null]);
    }
    els.tree.append(
      h("p", { class: "hint", id: "tree-help" }, "Each node shows Function: Category. Selecting here selects the same constituent in the sentence above; arrow keys move as in the sentence."),
      h("div", { class: "tree-wrap", tabindex: "-1" }, h("div", { class: "tree-canvas", style: "width:" + lay.width + "px;height:" + lay.height + "px" }, [svg, nodesBox])),
      h("details", { class: "subdisc" }, [h("summary", {}, "Key to labels and notation"), key,
        ...[...notes].map((k) => h("p", { class: "small-text" }, D.labels.notation[k]))]),
      h("details", { class: "subdisc" }, [h("summary", {}, "Text version of the tree"), h("ul", { class: "outline-text" }, outlineList(e.tree))]));
  }

  function highlightNav() {
    nav.querySelectorAll("a[aria-current]").forEach((a) => a.removeAttribute("aria-current"));
    nav.querySelectorAll('a[data-concept="' + state.concept + '"]').forEach((a) => {
      if (a.closest(".outline")) a.setAttribute("aria-current", "page");
    });
    const ch = idx.concepts.get(state.concept).references[0].chapter;
    setChapter(ch, true);
  }

  /* ---------- fragments and history ---------- */
  let applying = false;
  function pushHash() {
    const h2 = L.formatHash({ concept: state.concept, example: state.example === idx.concepts.get(state.concept).items[0].ex && !state.explicitExample ? null : state.example, view: state.view });
    if (location.hash !== h2) { applying = true; location.hash = h2; }
  }

  function applyHash(initial) {
    const s = L.parseHash(location.hash, idx), hadNotice = !!state.notice, wasStart = state.start;
    state.notice = s.invalid ? "The link #" + s.raw + " does not match anything in this version, so the closest useful page is shown instead." : "";
    state.start = !!s.start || (s.invalid && !idx.concepts.has(String(s.raw).split("/")[0]));
    const conceptChanged = s.concept !== state.concept;
    const example = s.example || (state.start ? D.start : idx.concepts.get(s.concept).items[0].ex);
    state.explicitExample = !!s.example;
    if (conceptChanged || initial || state.notice || hadNotice || state.start !== wasStart) {
      state.concept = s.concept; state.example = example; state.showAll = false; state.view = s.view;
      const item = L.primaryItem(idx, state.concept, state.example);
      state.example = item.ex; state.node = item.node; state.depth = 1;
      renderConcept();
      els.tree.open = s.view === "tree"; els.compare.open = s.view === "compare" && !els.compare.hidden;
      if (!initial) document.getElementById("concept-h").focus();
      say("Concept: " + idx.concepts.get(state.concept).name);
    } else {
      if (example !== state.example) {
        const inRail = els.rail.contains(document.activeElement);
        state.example = example; applyExample(); renderRail();
        if (inRail || document.activeElement === document.body) { const b = els.rail.querySelector('[aria-current="true"]'); if (b) b.focus(); }
      }
      state.view = s.view;
      els.tree.open = s.view === "tree"; els.compare.open = s.view === "compare" && !els.compare.hidden;
    }
    const target = s.view === "tree" ? els.tree : s.view === "compare" ? els.compare : null;
    if (target && !initial) target.scrollIntoView({ block: "nearest" });
  }
  window.addEventListener("hashchange", () => {
    if (applying) { applying = false; return; }
    applyHash(false);
  });
  setNav(!narrow.matches, null, true);
  applyHash(true);

  /* ---------- read-only tools for model context ---------- */
  const result = (v) => ({ content: [{ type: "text", text: JSON.stringify(v) }] });
  const mc = (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext);
  mc?.registerTool({ name: "get_data", description: "Return the concepts, CGEL chapter outline, and example sentences with their analyses.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute() { return result({ chapters: D.chapters, concepts: D.concepts, examples: D.examples.map((e) => ({ id: e.id, text: e.text, concepts: e.concepts })), truncated: true, next_steps: ["Use query with an example id for its full analysis."] }); } });
  mc?.registerTool({ name: "get_metadata", description: "Return the key message, source book, verification notes and assumptions.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute() { return result({ title: document.title, key_message: D.key, book: D.book, verification: D.verification, checked: D.checked, assumptions: D.assumptions, truncated: false }); } });
  mc?.registerTool({ name: "query", description: "Search concepts, aliases and examples, or return one example's full analysis by id.", inputSchema: { type: "object", properties: { text: { type: "string" }, example: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute(input = {}) { if (input.example) { const e = idx.examples.get(input.example); return result(e ? { example: e, truncated: false } : { error: "unknown example", next_steps: ["Call get_data for example ids."] }); } const r = L.search(idx, input.text || "", 50); return result({ results: r.results, total: r.total || 0, truncated: (r.total || 0) > r.results.length }); } });
})();
