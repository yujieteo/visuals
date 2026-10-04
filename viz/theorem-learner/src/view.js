/* Theorem Learner: proofs from concepts to results: the views. This file is the visual's own: it decodes the pack,
 * draws the proof surface (statement, proofs, slogans, hypothesis roles, steps and the proof diagram), the concept
 * reminders, the theory graph, the prerequisite tree, the concept page, the paged search and the sources, and adds
 * the domain WebMCP tools and palette commands. The kit (VisualKit.start) owns the state, the URL, Back and Forward,
 * Reset, the view JSON, the Markdown and beamdswitch exports and the shared WebMCP tools. Nothing here reads the
 * network.
 */
(async function () {
  "use strict";

  const D = JSON.parse(/** @type {HTMLElement} */ (document.getElementById("dataset")).textContent ?? "{}");
  const SVG = "http://www.w3.org/2000/svg";
  const PROFILE_KEY = "theorem-learner:known";
  /** @param {string} id @returns {any} */
  const $ = (id) => document.getElementById(id);

  /* ---------- DOM helpers: text is set as text, never parsed as HTML ---------- */

  /** @param {string} tag @param {Record<string, any> | null} [props] @param {...any} kids @returns {any} */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : String(c));
    return e;
  }
  const put = (/** @type {Element} */ el, /** @type {any[]} */ ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  /** @param {string} tag @param {Record<string, string | number>} attrs @param {string} [text] @returns {any} */
  function svg(tag, attrs, text) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  /** @param {string[]} head @param {any[][]} rows */
  const table = (head, rows) => h("div", { class: "table-scroll" }, h("table", { class: "data" },
    h("thead", null, h("tr", null, head.map((x) => h("th", { scope: "col", text: x })))),
    h("tbody", null, rows.map((r) => h("tr", null, r.map((c, j) => (j === 0 ? h("th", { scope: "row" }, c) : h("td", null, c))))))));
  /** @param {[string, any][]} pairs */
  const dl = (pairs) => h("dl", { class: "readout facts" }, pairs.filter((p) => p[1] !== null && p[1] !== undefined && p[1] !== "").map(([k, v]) => [h("dt", { text: k }), h("dd", null, v)]));
  /** TeX in text: MathJax reads the \( \) form after render. @param {string} t */
  const tex = (t) => t.replace(/\$([^$\n]+)\$/g, "\\($1\\)");
  function typeset() {
    const mj = /** @type {any} */ (globalThis).MathJax;
    const els = [...document.querySelectorAll("[data-math='']")];
    if (!els.length || !mj?.typesetPromise) return;
    for (const el of els) el.setAttribute("data-math", "done");
    mj.typesetPromise(els).catch(() => {});
  }

  /* ---------- the pack: decode in the browser, with no network ---------- */

  /** @param {{ gz: string }} p */
  async function decode(p) {
    const bin = atob(p.gz);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }
  const early = VisualKit.fromHash(Model.FIELDS, location.hash);
  if (early.notices.length) $("notice").textContent = early.notices.join(" ");
  try {
    Model.prime(D, "core", await decode(D.packs.core));
  } catch (e) {
    $("loading").textContent = `This browser cannot decode the data (it needs DecompressionStream): ${String(e)}. Use a current Chrome, Edge, Firefox or Safari.`;
    return;
  }
  $("loading").hidden = true;
  const IX = Model.index(D);

  /* ---------- known items: local storage, with a fallback ---------- */

  /** @type {Record<string, number>} */
  let known = {};
  let storageOk = true;
  try { known = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "{}") ?? {}; } catch { storageOk = false; known = {}; }
  D.profile = { known };
  /** @type {any} */
  let app = null;
  /** @param {string} id @param {number | null} depth */
  function setKnown(id, depth) {
    if (depth === null) delete known[id];
    else known[id] = Math.max(known[id] ?? -1, depth);
    D.profile = { known };
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(known)); storageOk = true; } catch { storageOk = false; }
    app.set({}, "replace");
  }
  /** @param {string} line */
  const tell = (line) => { $("export-status").textContent = line; };

  /* ---------- segments: text and concept words ---------- */

  let segKey = 0;
  /**
   * Explicit segments -> nodes: a plain string becomes text (with its TeX typeset), a marked concept word becomes a
   * real button that opens the concept's reminder. `where` names the occurrence, for the reminder's "why here".
   * @param {any[] | null | undefined} segs @param {string} where
   */
  function segs(segs, where) {
    if (!segs) return [];
    return segs.map((x) => {
      if (typeof x === "string") return x.includes("$") ? h("span", { "data-math": "", text: tex(x) }) : x;
      const [text, ci] = x;
      return h("button", { type: "button", class: "cw", "data-ci": ci, "data-where": where, "data-key": `k${segKey++}`, "aria-haspopup": "dialog", "aria-expanded": "false",
        "aria-label": `${text}: concept reminder for ${IX.concepts[ci].n}` }, text.includes("$") ? h("span", { "data-math": "", text: tex(text) }) : text);
    });
  }
  /** @param {string} id @param {string} label @param {Record<string, any>} patch */
  const go = (id, label, patch) => h("button", { type: "button", class: "link", "data-id": id, onclick: () => app.set(patch) }, label);
  const theoremBtn = (/** @type {string} */ id, /** @type {string} */ name) => go(id, name, { view: "proof", sel: id, proof: "", step: "", hyp: "" });
  const conceptBtn = (/** @type {string} */ id, /** @type {string} */ name) => go(id, name, { view: "concepts", concept: id });

  /* ---------- the proof surface ---------- */

  function renderSurface(/** @type {any} */ state, /** @type {any} */ d) {
    segKey = 0;
    const s = d.surface;
    const pick = $("pick");
    if (document.activeElement !== pick) pick.value = s.name;
    const p = s.proof;
    const hl = s.highlight;
    const stepCls = (/** @type {number} */ k) => [hl.steps.includes(k) ? "hl" : "", hl.inputs.includes(k) ? "input" : "", hl.outputs.includes(k) ? "output" : "", hl.mode !== "none" && !hl.steps.includes(k) && !hl.inputs.includes(k) && !hl.outputs.includes(k) ? "dim" : ""].filter(Boolean).join(" ");
    const hypNum = (/** @type {string} */ id) => `H${s.hypotheses.findIndex((/** @type {any} */ x) => x.id === id) + 1}`;
    const parts = [
      h("p", { class: "eyebrow" }, h("span", { text: s.type }), h("span", { text: `${Model.LEVEL_NAMES[Model.LEVELS.indexOf(s.level)]} level` }), h("span", { text: s.id })),
      h("h2", { id: "theorem-name", text: s.name }),
      h("p", { class: "statement" }, segs(s.statement, "the statement")),
      s.statementBasis !== "authored" ? h("p", { class: "note", text: `Statement: ${s.statementBasis}. No authored statement or proof is in this snapshot yet.` }) : null,
    ];
    if (!s.proofs.length) {
      parts.push(h("p", { class: "callout", text: s.unknown ? `No proof: ${s.unknown}` : "No proof is authored for this theorem in this snapshot. The proof content is unknown here, not empty." }));
    } else {
      parts.push(h("div", { class: "proof-picker", role: "group", "aria-label": `Proofs of ${s.name}` },
        h("span", { class: "label", text: s.proofs.length > 1 ? `${s.proofs.length} proofs:` : "Proof:" }),
        s.proofs.map((/** @type {any} */ q) => h("button", { type: "button", "aria-pressed": String(q.slug === p.slug), onclick: () => app.set({ proof: q.slug, step: "", hyp: "" }) }, q.name))));
      parts.push(h("p", { class: "slogan" }, segs(p.slogan, "the proof slogan")));
      const hyps = h("ul", { class: "hyps" }, s.hypotheses.map((/** @type {any} */ hy, /** @type {number} */ k) => {
        const role = p.roles.find((/** @type {any} */ r) => r.h === hy.id);
        const on = hl.hyps.includes(hy.id);
        return h("li", { class: [on ? "hl" : "", hl.mode !== "none" && !on ? "dim" : ""].filter(Boolean).join(" ") || null },
          h("button", { type: "button", class: "chip-btn", "aria-pressed": String(state.hyp === hy.id), "aria-label": `Highlight the steps that use hypothesis ${k + 1}`, onclick: () => app.set({ hyp: state.hyp === hy.id ? "" : hy.id, step: "" }) }, `H${k + 1}`),
          " ", h("span", null, segs(hy.seg, `hypothesis ${k + 1}`)),
          role ? h("p", { class: "role" }, h("span", { class: "label", text: "Role: " }), segs(role.why, `the role of hypothesis ${k + 1}`),
            role.unused ? h("span", { class: "note", text: " Not used in this proof." }) : h("span", { class: "note", text: ` Used at ${role.steps.map((/** @type {number} */ x) => `step ${x + 1}`).join(", ")}.` })) : null);
      }));
      const steps = h("ol", { class: "steps" }, p.steps.map((/** @type {any} */ st) => {
        const needs = [...st.hyps.map(hypNum), ...st.inputs.map((/** @type {number} */ x) => `step ${x + 1}`)];
        const gives = st.conclusion ? ["the conclusion"] : st.outputs.map((/** @type {number} */ x) => `step ${x + 1}`);
        return h("li", { class: stepCls(st.k) || null, id: `step-${st.number}` },
          h("div", { class: "step-head" },
            h("button", { type: "button", class: "chip-btn", "aria-pressed": String(state.step === st.id), "aria-label": `Highlight the inputs and outputs of step ${st.number}`, onclick: () => app.set({ step: state.step === st.id ? "" : st.id, hyp: "" }) }, String(st.number)),
            h("span", { class: "step-slogan" }, segs(st.slogan, `step ${st.number}`))),
          h("p", { class: "io note", text: `Needs: ${needs.join(", ") || "nothing earlier"}. Gives: ${gives.join(", ") || "nothing later"}.` }),
          h("details", { class: "arg" }, h("summary", { text: "Full argument" }), h("p", null, segs(st.detail, `step ${st.number}`)),
            st.lemmas.length ? h("p", { class: "note" }, "Cites: ", st.lemmas.map((/** @type {any} */ l, /** @type {number} */ j) => [j ? ", " : "", theoremBtn(l.id, l.name)])) : null));
      }));
      parts.push(h("div", { class: "proof-grid" },
        h("div", { class: "proof-text" }, h("h3", { text: "Hypotheses and their roles" }), hyps, h("h3", { text: "Steps" }), steps,
          s.conclusion ? h("p", { class: "conclusion" }, h("span", { class: "label", text: "Conclusion: " }), segs(s.conclusion, "the conclusion")) : null),
        h("figure", { class: "diagram card" }, h("figcaption", { class: "label", text: `Diagram of the ${p.name} proof` }), proofDiagram(state, s),
          h("p", { class: "note", text: "Dashed lines: a hypothesis used at a step. Solid arrows: a step whose output the next step uses. Select a hypothesis or a step to highlight it." }))));
      parts.push(disclosures(state, s));
    }
    if (!s.proofs.length) parts.push(disclosures(state, s));
    put($("surface"), ...parts);
    const walk = $("walk");
    $("walk-row").hidden = !p;
    if (p) {
      const k = p.steps.findIndex((/** @type {any} */ st) => st.id === state.step);
      walk.max = String(p.steps.length);
      walk.value = String(k + 1);
      $("walk-value").textContent = k >= 0 ? `step ${k + 1} of ${p.steps.length}` : `the whole proof (${p.steps.length} steps)`;
    }
  }

  /** Scope, connections, evidence and verification, scores and the source note, each behind a disclosure. @param {any} state @param {any} s */
  function disclosures(state, s) {
    const p = s.proof;
    const out = [];
    if (p) {
      out.push(h("details", { class: "more" }, h("summary", { text: "Scope and cases" }), h("p", null, segs(p.scope, "the scope"))));
      const alt = s.proofs.filter((/** @type {any} */ q) => q.slug !== p.slug);
      out.push(h("details", { class: "more" }, h("summary", { text: "Alternative proofs, mechanisms and connections" }),
        h("p", null, h("strong", { text: "Other proofs of this theorem: " }), alt.length ? alt.map((/** @type {any} */ q, /** @type {number} */ j) => [j ? ", " : "", h("button", { type: "button", class: "link", onclick: () => app.set({ proof: q.slug, step: "", hyp: "" }) }, q.name)]) : "none in this snapshot."),
        h("p", null, h("strong", { text: "Proof moves: " }), p.mechanisms.length ? p.mechanisms.map((/** @type {any} */ m, /** @type {number} */ j) => [j ? "; " : "", go(m.id, m.name, { view: "graph", gfocus: m.id, gopen: "" }), ` (${m.slogan.replace(/\.$/, "")}; in ${m.others} other proofs)`]) : "none named."),
        s.relations.length ? h("p", null, h("strong", { text: "Related theorems (not proofs): " }), s.relations.map((/** @type {any} */ r, /** @type {number} */ j) => [j ? "; " : "", `${relPhrase(r)} `, theoremBtn(r.id, r.name)])) : null,
        s.prerequisites.length ? h("p", null, h("strong", { text: "Judged prerequisites: " }), s.prerequisites.map((/** @type {any} */ r, /** @type {number} */ j) => [j ? ", " : "", theoremBtn(r.id, r.name)])) : null,
        h("p", null, go(s.id, "Show this theorem in the theory graph", { view: "graph", gfocus: s.id, gopen: p.id }), " · ", go(s.id, "Show its prerequisite tree", { view: "tree", troot: s.id }))));
      out.push(evidenceBlock(s));
    } else {
      out.push(h("details", { class: "more" }, h("summary", { text: "Evidence and sources" }), evidenceList(s.evidence), formalBlock(s.formal)));
    }
    const comp = Model.COMPONENT_NAMES.map((n, k) => [n, s.scores[k] === "n" ? "na" : s.scores[k]]);
    out.push(h("details", { class: "more" }, h("summary", { text: "Scores and study estimates" }),
      h("p", null, `Aggregate under the ${state.preset} weights: `, h("strong", { class: "num", text: Model.scoreLabel(s.score.v) }), s.score.v === null ? ` (interval ${s.score.lo} to ${s.score.hi})` : "", `. Confidence ${s.confidence}. These are judged scores from the Theorem Explorer (te-rubric/1).`),
      table(["Component", "Score (0 to 4)"], comp),
      h("p", { class: "note", text: `Study estimate (judged band) to understand: ${Model.bandLabel(s.effort[0])}; to apply: ${Model.bandLabel(s.effort[1])}; to prove: ${Model.bandLabel(s.effort[2])}.` }),
      known[s.id] !== undefined ? h("p", null, `Marked known (${Model.DEPTHS[known[s.id]]}). `, h("button", { type: "button", class: "link", onclick: () => setKnown(s.id, null) }, "Unmark it")) : h("button", { type: "button", onclick: () => setKnown(s.id, Model.DEPTHS.indexOf(state.depth)) }, `I know this theorem (${state.depth})`)));
    if (s.note) out.push(h("details", { class: "more" }, h("summary", { text: "Catalog note (Theorem Explorer judge)" }), h("p", { "data-math": "", text: tex(s.note) })));
    return out;
  }

  /** @param {any} r */
  function relPhrase(r) {
    const map = { "special-case": ["is a special case of", "has as a special case"], generalization: ["generalizes", "is generalized by"], consequence: ["is a consequence of", "has as a consequence"], equivalent: ["is equivalent to", "is equivalent to"] };
    return (/** @type {any} */ (map))[r.type]?.[r.dir === "out" ? 0 : 1] ?? r.type;
  }

  /** @param {any} f */
  function formalBlock(f) {
    if (!f) return h("p", { class: "note", text: "Formal declaration: none linked in the pinned mathlib." });
    const e = f.evidence;
    return dl([["Formal declaration", h("code", { text: f.decl })],
      ["Location", e.file ? [`${e.file}, lines ${e.lines[0]}-${e.lines[1]}, mathlib commit ${String(e.revision).slice(0, 12)} `, e.url ? h("a", { href: e.url, rel: "noopener", text: "(online)" }) : null] : `mathlib commit ${String(e.revision).slice(0, 12)}; location not recorded`],
      ["Difference from the statement above", f.difference ?? (f.difference === null ? "none recorded" : null)],
      ["Lean signature", f.sig ? h("pre", { class: "lean", text: f.sig }) : null]]);
  }

  /** @param {any[]} evs */
  function evidenceList(evs) {
    return h("ul", { class: "evidence" }, evs.map((e) => h("li", null, h("strong", { text: `${e.kind} (${e.status})` }), `: ${String(e.claim ?? "").replace(/\s+/g, " ").slice(0, 300)} `,
      h("span", { class: "note", text: [e.location, e.revision ? `revision ${String(e.revision).slice(0, 12)}` : null, e.reuse ? `reuse ${e.reuse}` : null].filter(Boolean).join("; ") }), " ",
      e.url ? h("a", { href: e.url, rel: "noopener", text: "Link (online)" }) : null)));
  }

  /** The four verification statuses, then the evidence of the proof and of the theorem. @param {any} s */
  function evidenceBlock(s) {
    const v = s.proof.verification;
    const src = s.proof.source;
    const srcText = src.kind === "lean" ? `mathlib declaration ${src.decl}: ${src.follows ? "the proof follows its route" : "the proof takes another route"}${src.note ? ` (${src.note})` : ""}`
      : src.kind === "web" ? `web page ${src.url}${src.note ? ` (${src.note})` : ""}` : src.kind === "cited" ? `published proof: ${src.ref}${src.note ? ` (${src.note})` : ""}` : `authored${src.note ? `: ${src.note}` : ""}`;
    return h("details", { class: "more" }, h("summary", { text: "Evidence and verification" }),
      table(["Status", "For this proof", "Meaning"], [
        ["Formal declaration", v.formalDeclaration.present ? `yes: ${v.formalDeclaration.decl}` : "no", "A declaration of the theorem exists in the pinned mathlib. It does not check this explanation."],
        ["Authored explanation", `yes: ${v.authoredExplanation.route}`, "A person or the judge model wrote these steps."],
        ["Checked correspondence", v.checkedCorrespondence.present ? "yes" : "no", "A review confirmed that the steps match the formal proof."],
        ["Lean-checked proof", v.leanCheckedProof.present ? "yes" : "no", "Lean checked this specific proof artifact. No explanation here is a Lean artifact."]]),
      h("p", null, h("strong", { text: "Source of the proof: " }), srcText, src.url && src.kind !== "web" ? [" ", h("a", { href: src.url, rel: "noopener", text: "(online)" })] : null),
      formalBlock(s.formal),
      s.formal && s.formal.difference ? h("p", { class: "callout", text: `The formal declaration differs from the statement: ${s.formal.difference}` }) : null,
      h("h4", { text: "Evidence records" }), evidenceList([...s.proof.evidence, ...s.evidence]));
  }

  /* ---------- the proof diagram ---------- */

  /**
   * A small top-down diagram: hypotheses in the first row, steps in layers (a step sits below every step it uses), and
   * the conclusion last. It draws only the authored roles and edges, so no line claims more than the proof says.
   * @param {any} state @param {any} s
   */
  function proofDiagram(state, s) {
    const p = s.proof, hl = s.highlight;
    const n = p.steps.length;
    const layer = new Array(n).fill(1);
    for (let pass = 0; pass < n; pass++) for (const [a, b] of p.edges) layer[b] = Math.max(layer[b], layer[a] + 1);
    const rows = [s.hypotheses.map((/** @type {any} */ hy, /** @type {number} */ k) => ({ kind: "h", id: hy.id, label: `H${k + 1}`, text: Model.flat(hy.seg) }))];
    const maxL = Math.max(1, ...layer);
    for (let L = 1; L <= maxL; L++) rows.push(p.steps.filter((/** @type {any} */ st) => layer[st.k] === L).map((/** @type {any} */ st) => ({ kind: "s", k: st.k, id: st.id, label: String(st.number), text: Model.flat(st.slogan) })));
    rows.push([{ kind: "c", id: "conclusion", label: "∴", text: "Conclusion" }]);
    const W = 340, rowH = 64, boxH = 46, gap = 8, P = 6;
    const H = P * 2 + rows.length * rowH - (rowH - boxH);
    /** @type {Map<string, { x: number, y: number, w: number }>} */
    const pos = new Map();
    rows.forEach((row, r) => {
      const m = Math.max(1, row.length);
      const w = (W - P * 2 - gap * (m - 1)) / m;
      row.forEach((/** @type {any} */ node, /** @type {number} */ j) => pos.set(node.kind === "s" ? `s${node.k}` : node.kind === "h" ? `h${node.id}` : "c", { x: P + j * (w + gap), y: P + r * rowH, w }));
    });
    const out = svg("svg", { class: "chart pdiag", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Diagram of the ${p.name} proof of ${s.name}: ${n} steps; the step list gives the same structure as text` });
    out.append(svg("defs", {}), svg("g", { class: "edges" }), svg("g", { class: "nodes" }));
    const defs = out.firstChild, eg = out.childNodes[1], ng = out.childNodes[2];
    defs.append(Object.assign(svg("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }), {}));
    defs.firstChild.append(svg("path", { d: "M0 0L10 5L0 10z", class: "arrowhead" }));
    /** @param {string} a @param {string} b @param {string} cls */
    const line = (a, b, cls) => {
      const A = /** @type {any} */ (pos.get(a)), B = /** @type {any} */ (pos.get(b));
      const x1 = A.x + A.w / 2, y1 = A.y + boxH, x2 = B.x + B.w / 2, y2 = B.y;
      eg.append(svg("path", { class: cls, d: `M${x1.toFixed(1)} ${y1}C${x1.toFixed(1)} ${(y1 + y2) / 2} ${x2.toFixed(1)} ${(y1 + y2) / 2} ${x2.toFixed(1)} ${y2 - 2}`, "marker-end": "url(#arrow)" }));
    };
    for (const r of p.roles) for (const k of r.steps) line(`h${r.h}`, `s${k}`, `role${hl.hyps.includes(r.h) && (hl.steps.includes(k) || hl.mode === "hypothesis") ? " hl" : hl.mode !== "none" ? " dim" : ""}`);
    for (const [a, b] of p.edges) line(`s${a}`, `s${b}`, `flow${hl.edges.some((/** @type {number[]} */ e) => e[0] === a && e[1] === b) || (hl.mode === "hypothesis" && hl.steps.includes(a) && hl.steps.includes(b)) ? " hl" : hl.mode !== "none" ? " dim" : ""}`);
    line(`s${p.conclusion}`, "c", "flow");
    for (const row of rows) for (const node of row) {
      const key = node.kind === "s" ? `s${node.k}` : node.kind === "h" ? `h${node.id}` : "c";
      const P0 = /** @type {any} */ (pos.get(key));
      const on = node.kind === "s" ? hl.steps.includes(node.k) : node.kind === "h" ? hl.hyps.includes(node.id) : false;
      const io = node.kind === "s" && (hl.inputs.includes(node.k) ? " input" : hl.outputs.includes(node.k) ? " output" : "");
      const dim = hl.mode !== "none" && !on && !io && node.kind !== "c";
      const g = svg("g", { class: `pnode ${node.kind}${on ? " hl" : ""}${io || ""}${dim ? " dim" : ""}${node.kind === "s" && node.k === p.conclusion ? " concl" : ""}` });
      g.append(svg("rect", { x: P0.x.toFixed(1), y: P0.y, width: P0.w.toFixed(1), height: boxH, rx: node.kind === "h" ? 14 : 4 }));
      const chars = Math.max(6, Math.floor((P0.w - 26) / 6.2));
      const words = node.text.replace(/\$[^$]*\$/g, "…").split(/\s+/);
      const lines = [""];
      for (const w of words) { if ((lines[lines.length - 1] + " " + w).trim().length > chars) { if (lines.length === 2) { lines[1] += "…"; break; } lines.push(w); } else lines[lines.length - 1] = (lines[lines.length - 1] + " " + w).trim(); }
      g.append(svg("text", { class: "badge", x: (P0.x + 6).toFixed(1), y: P0.y + 18 }, node.label));
      lines.forEach((t, j) => g.append(svg("text", { x: (P0.x + 22).toFixed(1), y: P0.y + 18 + j * 14 }, t)));
      g.append(svg("title", {}, `${node.label}: ${node.text}`));
      if (node.kind !== "c") {
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.setAttribute("aria-label", node.kind === "h" ? `Hypothesis ${node.label}: highlight the steps that use it` : `Step ${node.label}: highlight its inputs and outputs`);
        const act = () => app.set(node.kind === "h" ? { hyp: state.hyp === node.id ? "" : node.id, step: "" } : { step: state.step === node.id ? "" : node.id, hyp: "" });
        g.addEventListener("click", act);
        g.addEventListener("keydown", (/** @type {KeyboardEvent} */ ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); act(); } });
      }
      ng.append(g);
    }
    return out;
  }

  /* ---------- concept reminders: hover, focus, click, touch ---------- */

  const pop = $("reminder");
  /** @type {{ key: string, ci: number, where: string } | null} */
  let pinned = null;
  /** @type {any} */
  let hoverAnchor = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let hideTimer;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let showTimer;
  /** True while focus returns to a word after Escape, so that focus does not reopen the reminder. */
  let quiet = false;

  /** The reminder's content: short on hover or focus, expanded when pinned. @param {number} ci @param {string} where @param {boolean} expanded */
  function reminderContent(ci, where, expanded) {
    const r = Model.reminderOf(D, ci, app.derived.surface);
    const def = r.definition;
    const head = h("p", { class: "rem-name" }, h("strong", { text: r.name }), h("span", { class: "note", text: ` ${r.kind}${r.level ? `, ${Model.LEVEL_NAMES[Model.LEVELS.indexOf(r.level)]}` : ""}` }));
    const shortText = r.reminder ? h("p", null, segsPlain(r.reminder)) : def ? h("p", null, segsPlain(def, 220)) : h("p", { class: "note", text: "No reminder is written for this concept yet." });
    if (!expanded) return [head, shortText, h("p", { class: "note", text: "Click, tap or press Enter to pin the full reminder." })];
    const why = r.why ? segsPlain(r.why) : r.proofName ? `The ${r.proofName} proof marks it without a note.` : "No proof is selected.";
    return [head,
      h("p", null, h("span", { class: "label", text: "Definition " }), def ? segsPlain(def) : "no definition text in this snapshot", r.definitionBasis && r.definitionBasis !== "authored" ? h("span", { class: "note", text: ` (${r.definitionBasis})` }) : null),
      r.reminder ? h("p", null, h("span", { class: "label", text: "In short " }), segsPlain(r.reminder)) : null,
      h("p", null, h("span", { class: "label", text: "Why here " }), why, h("span", { class: "note", text: ` (at ${where})` })),
      h("p", null, h("span", { class: "label", text: "Used at " }), r.usedAt.length ? r.usedAt.map((/** @type {any} */ u, /** @type {number} */ j) => [j ? "; " : "", h("a", { href: `#step-${u.number}`, onclick: (/** @type {Event} */ ev) => { ev.preventDefault(); $(`step-${u.number}`)?.scrollIntoView({ block: "center" }); } }, `step ${u.number}`)]) : "no step of this proof", r.hyps.length ? `; hypotheses ${r.hyps.join(", ")}` : ""),
      r.examples.length ? h("details", null, h("summary", { text: "Examples" }), h("ul", null, r.examples.map((/** @type {any[]} */ e) => h("li", null, segsPlain(e))))) : null,
      h("div", { class: "actions" },
        h("button", { type: "button", onclick: () => app.set({ concept: app.state.concept === r.id ? "" : r.id, step: "", hyp: "" }, "replace") }, app.state.concept === r.id ? "Stop highlighting" : "Highlight its steps"),
        h("button", { type: "button", onclick: () => { closePop(false); app.set({ view: "concepts", concept: r.id }); } }, "Open the concept page"),
        h("button", { type: "button", class: "close", "aria-label": "Close the reminder (Escape)", onclick: () => closePop(true) }, "Close"))];
  }
  /** Segments inside a reminder: text only (concept words are plain there), TeX typeset. @param {any[]} sg @param {number} [max] */
  function segsPlain(sg, max) {
    let t = Model.flat(sg);
    if (max && t.length > max) t = `${t.slice(0, max - 1)}…`;
    return t.includes("$") ? h("span", { "data-math": "", text: tex(t) }) : t;
  }

  /** Place the reminder next to its word, inside the viewport. @param {Element} anchor */
  function place(anchor) {
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    pop.style.maxWidth = `${Math.min(360, vw - 16)}px`;
    pop.style.left = "8px";
    pop.style.top = "0px";
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.min(Math.max(8, r.left), vw - pw - 8);
    let top = r.bottom + 6;
    if (top + ph > vh - 8) top = Math.max(8, r.top - ph - 6);
    if (top + ph > vh - 8) top = Math.max(8, vh - ph - 8);
    pop.style.left = `${Math.max(8, left)}px`;
    pop.style.top = `${top}px`;
  }
  /** @param {any} anchor @param {boolean} expanded */
  function openPop(anchor, expanded) {
    clearTimeout(hideTimer);
    const ci = Number(anchor.getAttribute("data-ci")), where = anchor.getAttribute("data-where") ?? "";
    put(pop, ...reminderContent(ci, where, expanded));
    pop.hidden = false;
    pop.className = expanded ? "reminder pinned" : "reminder";
    pop.setAttribute("role", expanded ? "dialog" : "tooltip");
    pop.setAttribute("aria-label", `Reminder: ${IX.concepts[ci].n}`);
    for (const b of document.querySelectorAll(".cw[aria-expanded='true']")) b.setAttribute("aria-expanded", "false");
    if (expanded) anchor.setAttribute("aria-expanded", "true");
    place(anchor);
    typeset();
  }
  /** @param {boolean} refocus */
  function closePop(refocus) {
    const key = pinned?.key;
    pinned = null;
    hoverAnchor = null;
    pop.hidden = true;
    for (const b of document.querySelectorAll(".cw[aria-expanded='true']")) b.setAttribute("aria-expanded", "false");
    if (refocus && key) {
      quiet = true;
      /** @type {HTMLElement | null} */ (document.querySelector(`.cw[data-key="${key}"]`))?.focus();
      quiet = false;
    }
  }
  /** @param {any} b */
  function pin(b) {
    if (pinned && pinned.key === b.getAttribute("data-key")) { closePop(true); return; }
    pinned = { key: b.getAttribute("data-key"), ci: Number(b.getAttribute("data-ci")), where: b.getAttribute("data-where") ?? "" };
    openPop(b, true);
    /** @type {HTMLElement | null} */ (pop.querySelector("button"))?.focus({ preventScroll: true });
  }
  document.addEventListener("mouseover", (ev) => {
    const b = /** @type {Element} */ (ev.target).closest?.(".cw");
    if (b && !pinned) {
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
      hoverAnchor = b;
      showTimer = setTimeout(() => { if (hoverAnchor === b && !pinned) openPop(b, false); }, 180);
    }
  });
  document.addEventListener("mouseout", (ev) => {
    const b = /** @type {Element} */ (ev.target).closest?.(".cw");
    if (b && !pinned) { clearTimeout(showTimer); hideTimer = setTimeout(() => { if (!pinned) { pop.hidden = true; hoverAnchor = null; } }, 250); }
  });
  pop.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  pop.addEventListener("mouseleave", () => { if (!pinned) hideTimer = setTimeout(() => { if (!pinned) pop.hidden = true; }, 250); });
  document.addEventListener("focusin", (ev) => {
    const b = /** @type {Element} */ (ev.target).closest?.(".cw");
    if (b && !pinned && !quiet) openPop(b, false);
    else if (!b && !pinned && !pop.contains(/** @type {Node} */ (ev.target))) pop.hidden = true;
  });
  document.addEventListener("click", (ev) => {
    const b = /** @type {Element} */ (ev.target).closest?.(".cw");
    if (b) { ev.preventDefault(); pin(b); return; }
    if (pinned && !pop.contains(/** @type {Node} */ (ev.target))) closePop(false);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || pop.hidden) return;
    ev.stopPropagation();
    if (pinned) closePop(true);
    else { pop.hidden = true; hoverAnchor = null; }
  }, true);
  window.addEventListener("resize", () => { if (pinned) { const b = document.querySelector(`.cw[data-key="${pinned.key}"]`); if (b) place(b); } else pop.hidden = true; });
  window.addEventListener("scroll", () => { if (pinned) { const b = document.querySelector(`.cw[data-key="${pinned.key}"]`); if (b) place(b); } else pop.hidden = true; }, { passive: true });
  /** After a render the words are new elements: keep a pinned reminder on its word, by its occurrence key. */
  function repin() {
    if (!pinned) return;
    const b = document.querySelector(`.cw[data-key="${pinned.key}"]`);
    if (!b) { closePop(false); return; }
    openPop(b, true);
  }

  /* ---------- the theory graph ---------- */

  const KIND_SHAPE = { concept: "circle", theorem: "square", proof: "diamond", mechanism: "hexagon" };
  function renderGraph(/** @type {any} */ state, /** @type {any} */ d) {
    const g = d.graph;
    const gpick = $("gpick");
    if (document.activeElement !== gpick) gpick.value = g.focus ? Model.nodeLabel(IX, g.focus) : "";
    put($("graph-entry"), g.focus ? null : [h("h3", { text: "Start with a basic concept" }),
      h("ul", { class: "entry" }, g.entry.map((/** @type {any} */ e) => h("li", null, go(e.id, e.name, { gfocus: e.id, gopen: "" }), h("span", { class: "note", text: ` used in ${e.uses} proofs` }))))]);
    $("graph-figure").hidden = !g.focus;
    if (!g.focus) { put($("graph-lists")); return; }
    drawGraph(state, g);
    put($("graph-legend"), legend());
    put($("graph-lists"), g.lists.map((/** @type {any} */ l) => h("section", { class: "card" },
      h("h3", null, `${l.kind}: `, l.label),
      h("div", { class: "actions" },
        l.id !== g.focus ? h("button", { type: "button", onclick: () => app.set({ gfocus: l.id, gopen: "" }) }, "Make it the focus") : null,
        l.id !== g.focus ? h("button", { type: "button", onclick: () => app.set({ gopen: g.open.filter((/** @type {string} */ x) => x !== l.id).join(",") }) }, "Collapse") : null,
        openBtnFor(l.id, l.kind, l.label)),
      l.groups.length ? l.groups.map((/** @type {any} */ gr) => h("details", { open: gr.total <= 12 ? true : null },
        h("summary", { text: `${gr.dir === "out" ? "" : "← "}${/** @type {any} */ (Model.EDGE_TYPES)[gr.type].label}${gr.dir === "out" ? " →" : ""} (${gr.total})` }),
        h("ul", { class: "edge-list" }, gr.items.map((/** @type {any} */ it) => h("li", null,
          h("button", { type: "button", class: "link", onclick: () => app.set({ gopen: [...new Set([...g.open, it.id])].join(",").slice(0, 1000) }) }, it.label),
          h("span", { class: "note", text: ` ${it.kind}; ${it.edge}` })))))) : h("p", { class: "note", text: "No edge in this snapshot." }))));
  }
  /** @param {string} id @param {string} kind @param {string} label */
  function openBtnFor(id, kind, label) {
    if (kind === "theorem") return h("button", { type: "button", onclick: () => app.set({ view: "proof", sel: id, proof: "", step: "", hyp: "" }) }, "Open the theorem");
    if (kind === "concept") return h("button", { type: "button", onclick: () => app.set({ view: "concepts", concept: id }) }, "Open the concept");
    if (kind === "proof") {
      const p = IX.proofs[IX.proofById.get(id)];
      return h("button", { type: "button", onclick: () => app.set({ view: "proof", sel: IX.theorems[p.th].id, proof: Model.slugOf(id), step: "", hyp: "" }) }, "Open the proof");
    }
    return h("span", { class: "note", text: label ? "" : "" });
  }
  function legend() {
    return [h("div", { class: "legend-row" }, Object.entries(Model.EDGE_TYPES).map(([k, v]) => h("span", { class: "legend-item" },
      (() => { const s = svg("svg", { width: 40, height: 10, "aria-hidden": "true" }); s.append(svg("line", { class: `gedge ${k}`, x1: 0, y1: 5, x2: 40, y2: 5 })); return s; })(), ` ${v.label}`))),
    h("div", { class: "legend-row" }, Object.entries(KIND_SHAPE).map(([k]) => h("span", { class: "legend-item" },
      (() => { const s = svg("svg", { width: 14, height: 14, "aria-hidden": "true" }); s.append(shape(k, 7, 7, 5)); return s; })(), ` ${k}`)))];
  }
  /** @param {string} kind @param {number} x @param {number} y @param {number} r */
  function shape(kind, x, y, r) {
    if (kind === "theorem") return svg("rect", { class: `gnode-shape ${kind}`, x: x - r, y: y - r, width: 2 * r, height: 2 * r });
    if (kind === "proof") return svg("path", { class: `gnode-shape ${kind}`, d: `M${x} ${y - r - 1}L${x + r + 1} ${y}L${x} ${y + r + 1}L${x - r - 1} ${y}z` });
    if (kind === "mechanism") { const pts = Array.from({ length: 6 }, (_, k) => `${(x + r * Math.cos((Math.PI / 3) * k)).toFixed(1)},${(y + r * Math.sin((Math.PI / 3) * k)).toFixed(1)}`).join(" "); return svg("polygon", { class: `gnode-shape ${kind}`, points: pts }); }
    return svg("circle", { class: `gnode-shape ${kind}`, cx: x, cy: y, r });
  }
  function drawGraph(/** @type {any} */ state, /** @type {any} */ g) {
    const chart = $("graph-chart");
    const colW = 250, rowH = 24, P = 10;
    /** @type {Map<number, any[]>} */
    const cols = new Map();
    for (const n of g.nodes) { if (!cols.has(n.d)) cols.set(n.d, []); /** @type {any[]} */ (cols.get(n.d)).push(n); }
    const order = { concept: 0, mechanism: 1, proof: 2, theorem: 3 };
    let maxRows = 1;
    /** @type {Map<string, { x: number, y: number }>} */
    const pos = new Map();
    for (const [d, list] of [...cols].sort((a, b) => a[0] - b[0])) {
      list.sort((a, b) => (/** @type {any} */ (order))[a.kind] - (/** @type {any} */ (order))[b.kind] || a.label.localeCompare(b.label));
      maxRows = Math.max(maxRows, list.length);
      list.forEach((n, k) => pos.set(n.id, { x: P + 8 + d * colW, y: P + 10 + k * rowH }));
    }
    const W = P * 2 + colW * cols.size + 60, H = P * 2 + rowH * maxRows + 10;
    chart.setAttribute("viewBox", `0 0 ${W} ${H}`);
    chart.setAttribute("width", String(W));
    chart.setAttribute("height", String(H));
    const eg = svg("g", {}), ng = svg("g", {});
    for (const e of g.edges) {
      const A = pos.get(e.from), B = pos.get(e.to);
      if (!A || !B) continue;
      const x1 = A.x + (A.x < B.x ? 190 : 0), x2 = B.x + (A.x < B.x ? -6 : 190);
      const same = Math.abs(A.x - B.x) < 1;
      const d = same ? `M${A.x - 6} ${A.y}C${A.x - 40} ${A.y} ${B.x - 40} ${B.y} ${B.x - 6} ${B.y}` : `M${x1} ${A.y}C${(x1 + x2) / 2} ${A.y} ${(x1 + x2) / 2} ${B.y} ${x2} ${B.y}`;
      const path = svg("path", { class: `gedge ${e.type}`, d });
      path.append(svg("title", {}, `${Model.nodeLabel(IX, e.from)} ${e.label} ${Model.nodeLabel(IX, e.to)}`));
      eg.append(path);
      if (!same) eg.append(svg("text", { class: "gedge-label", x: ((x1 + x2) / 2).toFixed(1), y: ((A.y + B.y) / 2 - 3).toFixed(1), "text-anchor": "middle" }, e.label.length > 22 ? `${e.label.slice(0, 21)}…` : e.label));
    }
    for (const n of g.nodes) {
      const P0 = /** @type {any} */ (pos.get(n.id));
      const gr = svg("g", { class: `gnode ${n.kind}${n.id === g.focus ? " focus" : ""}${n.open ? " open" : ""}`, tabindex: 0, role: "button", "aria-label": `${n.kind} ${n.label}: ${n.open ? "expanded" : "expand its neighbours"}` });
      gr.append(shape(n.kind, P0.x, P0.y, 6));
      gr.append(svg("text", { x: P0.x + 12, y: P0.y + 4 }, n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label));
      gr.append(svg("title", {}, `${n.kind}: ${n.label}`));
      const act = () => app.set({ gopen: n.id === g.focus ? g.open.join(",") : (n.open ? g.open.filter((/** @type {string} */ x) => x !== n.id) : [...g.open, n.id]).join(",").slice(0, 1000) });
      gr.addEventListener("click", act);
      gr.addEventListener("keydown", (/** @type {KeyboardEvent} */ ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); act(); } });
      ng.append(gr);
    }
    put(chart, eg, ng);
  }

  /* ---------- the prerequisite tree ---------- */

  function renderTree(/** @type {any} */ state, /** @type {any} */ d) {
    const t = d.tree;
    if (!t) { put($("tree-outline"), h("p", { class: "note", text: "No tree: the root is not in this snapshot." })); return; }
    const troot = $("troot");
    if (document.activeElement !== troot) troot.value = t.root.name;
    $("tree-summary").textContent = `${t.root.name} (${t.root.kind}): ${t.unique} distinct items to depth ${t.depth}${t.truncated ? `, cut at ${Model.TREE_NODES} nodes` : ""}; ${t.study.length} not marked known. A theorem needs the lemmas and concepts of its proof and its judged prerequisites; a concept needs the concepts of its definition.`;
    drawTree(t);
    /** @param {any} n @returns {any} */
    const item = (n) => h("li", { class: n.known ? "known" : null },
      h("button", { type: "button", class: "link", onclick: () => app.set({ troot: n.id }) }, n.name),
      h("span", { class: "note", text: ` ${n.kind}${n.level ? `, ${Model.LEVEL_NAMES[Model.LEVELS.indexOf(n.level)]}` : ""}${n.edge ? `; ${n.edge}` : ""}${n.known ? "; known" : ""}${n.ref ? "; shown above" : ""}${n.cycle ? "; closes a cycle" : ""}${n.more ? `; ${n.more} more below` : ""}` }),
      n.children.length ? h("ul", null, n.children.map(item)) : null);
    put($("tree-outline"), h("ul", { class: "outline" }, item(t.root)));
    put($("tree-study"), ...t.study.map((/** @type {any} */ n) => h("li", null, h("button", { type: "button", class: "link", onclick: () => app.set(n.kind === "theorem" ? { view: "proof", sel: n.id, proof: "", step: "", hyp: "" } : { view: "concepts", concept: n.id }) }, n.name),
      h("span", { class: "note", text: ` ${n.kind}, ${Model.bandLabel(n.band)} ` }), h("button", { type: "button", onclick: () => setKnown(n.id, Model.DEPTHS.indexOf(state.depth)) }, "I know it"))));
  }
  /** @param {any} t */
  function drawTree(t) {
    const chart = $("tree-chart");
    const colW = 240, rowH = 22, P = { l: 8, t: 14 }, labelW = 186;
    /** @type {any[]} */
    const nodes = [];
    let leaf = 0;
    /** @param {any} n @param {number} depth @returns {number} */
    function place(n, depth) {
      const kids = n.children.map((/** @type {any} */ c) => place(c, depth + 1));
      const y = kids.length ? (kids[0] + kids[kids.length - 1]) / 2 : leaf++;
      n.__y = y;
      nodes.push({ n, depth, y });
      return y;
    }
    place(t.root, 0);
    const depth = Math.max(...nodes.map((x) => x.depth));
    const W = P.l + colW * (depth + 1) + 40, H = P.t * 2 + rowH * Math.max(1, leaf);
    chart.setAttribute("viewBox", `0 0 ${W} ${H}`);
    chart.setAttribute("width", String(W));
    chart.setAttribute("height", String(H));
    const X = (/** @type {number} */ dp) => P.l + dp * colW + 6, Y = (/** @type {number} */ y) => P.t + y * rowH + rowH / 2;
    const eg = svg("g", {}), ng = svg("g", {});
    for (const x of nodes) {
      for (const c of x.n.children) {
        const x1 = X(x.depth) + labelW, y1 = Y(x.y), x2 = X(x.depth + 1) - 6, y2 = Y(c.__y), mid = (x1 + x2) / 2;
        eg.append(svg("path", { class: "tedge", d: `M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}` }));
      }
      const g = svg("g", { class: `tnode${x.n.known ? " known" : ""}${x.n.ref ? " ref" : ""}`, tabindex: 0, role: "button", "aria-label": `${x.n.name}, ${x.n.kind}: root the tree here` });
      const cx = X(x.depth), cy = Y(x.y);
      g.append(x.n.kind === "theorem" ? svg("rect", { x: cx - 5, y: cy - 5, width: 10, height: 10 }) : svg("circle", { cx, cy, r: 5 }));
      g.append(svg("text", { x: cx + 9, y: cy + 4 }, `${x.n.name.length > 26 ? `${x.n.name.slice(0, 25)}…` : x.n.name}${x.n.ref ? " ↑" : ""}${x.n.more ? ` +${x.n.more}` : ""}`));
      g.append(svg("title", {}, `${x.n.name} (${x.n.kind})${x.n.edge ? `: ${x.n.edge}` : ""}`));
      const act = () => app.set({ troot: x.n.id });
      g.addEventListener("click", act);
      g.addEventListener("keydown", (/** @type {KeyboardEvent} */ ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); act(); } });
      ng.append(g);
    }
    put(chart, eg, ng);
  }

  /* ---------- the concept page ---------- */

  function renderConcept(/** @type {any} */ state, /** @type {any} */ d) {
    segKey = 0;
    const c = d.concept;
    const cpick = $("cpick");
    if (document.activeElement !== cpick) cpick.value = c.name;
    /** @param {any} ln @param {boolean} incoming */
    const linkCard = (ln, incoming) => {
      const special = incoming ? (ln.type === "specializes" ? ln.from : null) : (ln.type === "specializes" ? null : ln.to);
      const title = incoming
        ? (ln.type === "specializes" ? [conceptBtn(ln.from.id, ln.from.name), " is a special case of ", c.name] : [c.name, " is a special case of ", conceptBtn(ln.from.id, ln.from.name)])
        : (ln.type === "specializes" ? [c.name, " is a special case of ", conceptBtn(ln.to.id, ln.to.name)] : [c.name, " generalizes ", conceptBtn(ln.to.id, ln.to.name)]);
      void special;
      return h("div", { class: "lift card" }, h("p", null, h("strong", null, title)),
        h("ol", { class: "lift-steps" }, ln.steps.map((/** @type {any[]} */ st, /** @type {number} */ k) => h("li", null, segs(st, `step ${k + 1} of the link`)))),
        ln.why?.length ? h("p", { class: "note" }, segs(ln.why, "the link")) : null);
    };
    put($("concept-page"),
      h("p", { class: "eyebrow" }, h("span", { text: c.kind }), h("span", { text: c.level ? `${Model.LEVEL_NAMES[Model.LEVELS.indexOf(c.level)]} level` : "level unknown" }), h("span", { text: c.id })),
      h("h2", { id: "concept-name", text: c.name }),
      c.aliases.length ? h("p", { class: "note", text: `Also called: ${c.aliases.join("; ")}.` }) : null,
      c.reminder ? h("p", { class: "slogan" }, segs(c.reminder, "the reminder")) : h("p", { class: "note", text: "No reminder is written for this concept yet." }),
      h("h3", { text: "Definition" }),
      c.definition ? h("p", null, segs(c.definition, "the definition"), c.definitionBasis !== "authored" ? h("span", { class: "note", text: ` (${c.definitionBasis})` }) : null) : h("p", { class: "note", text: "No definition text in this snapshot." }),
      c.examples.length ? [h("h3", { text: "Examples" }), h("ul", null, c.examples.map((/** @type {any[]} */ e, /** @type {number} */ k) => h("li", null, segs(e, `example ${k + 1}`))))] : null,
      h("h3", { text: "It is defined from" }),
      c.requires.length ? h("p", null, c.requires.map((/** @type {any} */ r, /** @type {number} */ j) => [j ? ", " : "", conceptBtn(r.id, r.name)]), h("span", { class: "note", text: ` (${c.requiresBasis})` })) : h("p", { class: "note", text: "No requirement recorded." }),
      h("h3", { text: "More general and more special" }),
      c.links.length || c.incoming.length ? [c.links.map((/** @type {any} */ ln) => linkCard(ln, false)), c.incoming.map((/** @type {any} */ ln) => linkCard(ln, true))] : h("p", { class: "note", text: "No generality link is written for this concept yet." }),
      h("h3", { text: `Used in proofs (${c.uses.length})` }),
      c.uses.length ? h("ul", { class: "uses" }, c.uses.slice(0, 40).map((/** @type {any} */ u) => h("li", null,
        h("button", { type: "button", class: "link", onclick: () => app.set({ view: "proof", sel: u.theorem, proof: u.slug, step: u.steps[0].id, hyp: "", concept: c.id }) }, `${u.theoremName}: ${u.name}`),
        h("span", { class: "note", text: ` at step ${u.steps.map((/** @type {any} */ s) => s.number).join(", ")}` }), u.why ? h("span", { class: "note" }, ". Why there: ", segsPlain(u.why)) : null))) : h("p", { class: "note", text: "No authored proof marks this concept yet." }),
      c.neededBy.length ? [h("h3", { text: "Concepts defined from it" }), h("p", null, c.neededBy.map((/** @type {any} */ r, /** @type {number} */ j) => [j ? ", " : "", conceptBtn(r.id, r.name)]))] : null,
      h("p", null, go(c.id, "Show it in the theory graph", { view: "graph", gfocus: c.id, gopen: "" }), " · ", go(c.id, "Show its prerequisite tree", { view: "tree", troot: c.id })),
      h("details", { class: "more" }, h("summary", { text: "Scores and catalog evidence" }),
        h("p", null, `Aggregate (tc-rubric/1, ${state.preset} weights): `, h("strong", { text: Model.scoreLabel(c.score.v) }), c.score.v === null ? ` (interval ${c.score.lo} to ${c.score.hi})` : "", `; ${c.assessment} assessment; confidence ${c.confidence}.`),
        table(["Component", "Score"], Model.CONCEPT_COMPONENT_NAMES.map((n, k) => [n, c.scores[k] === "u" ? "u" : c.scores[k] === "n" ? "na" : c.scores[k]])),
        dl([["Catalog definition text", c.catalogDefinition ? `${c.catalogDefinition} (${c.catalogBasis})` : null], ["nLab page", c.nlab], ["mathlib declaration", c.mathlib ? h("code", { text: c.mathlib }) : null], ["arXiv papers that name it (to 2020)", c.papers === null ? null : String(c.papers)]])));
  }

  /* ---------- search ---------- */

  function renderFind(/** @type {any} */ state, /** @type {any} */ d) {
    const f = d.find;
    const fq = $("fq");
    if (document.activeElement !== fq) fq.value = state.fq;
    $("find-count").textContent = f.query ? `${f.total.toLocaleString("en")} results; page ${f.page + 1} of ${f.pages}, ${f.size} per page.` : "Type a word: every word must match.";
    put($("find-results"), ...f.items.map((/** @type {any} */ it) => h("li", null,
      it.kind === "theorem" ? theoremBtn(it.id, it.name) : conceptBtn(it.id, it.name),
      h("span", { class: "note", text: ` ${it.kind}, ${it.type}${it.kind === "theorem" ? `, ${it.proofs} proofs` : `, used in ${it.proofs} proofs`}${it.decl ? `, ${it.decl}` : ""}` }))));
    $("find-prev").disabled = f.page <= 0;
    $("find-next").disabled = f.page >= f.pages - 1;
  }

  /* ---------- sources and coverage ---------- */

  let aboutDrawn = false;
  function renderAbout() {
    if (aboutDrawn) return;
    aboutDrawn = true;
    const L = D.coverage.learning, s = D.snapshot;
    put($("about"),
      h("h3", { text: "Snapshot" }),
      dl([["Snapshot", s.id], ["Generated", s.generated_at], ["Source catalog", `${s.source_snapshot} (Theorem Explorer)`], ["Evidence cutoff", s.evidence_cutoff], ["Schema", D.schema], ["Rules", s.rules.join(", ")]]),
      h("p", { class: "note", text: "The page never refreshes its sources. The authored learning data (data/learning/) is separate from the refreshed source catalog, so a source refresh never overwrites a proof explanation (see AGENTS.md)." }),
      h("h3", { text: "Coverage" }),
      table(["Item", "Count"], [
        ["Theorems in the catalog", String(D.coverage.catalog.theorems)], ["Theorems with authored proofs", String(L.theorems_with_proofs)], ["Theorems without a proof here (unknown)", String(L.theorems_without_proofs)],
        ["Proofs", String(L.proofs)], ["Proof steps", String(L.steps)], ["Theorems with alternative proofs", String(L.theorems_with_alternatives)],
        ["Proofs by source", Object.entries(L.proofs_by_source).map(([k, v]) => `${k} ${v}`).join(", ")], ["Proofs that follow the mathlib route", String(L.proofs_following_lean)],
        ["Mechanisms (used)", `${L.mechanisms} (${L.mechanisms_used})`], ["Concepts (with authored reminders)", `${D.coverage.catalog.concepts} (${L.concepts_with_reminders})`],
        ["Concept generality links", String(L.links)], ["Evidence records (formal declarations)", `${L.evidence} (${L.formal_declarations})`]]),
      h("h3", { text: "Verification statuses" }),
      table(["Status", "Meaning", "Proofs"], [
        ["Formal declaration", "A declaration exists in the pinned mathlib library. It is evidence about the theorem, not about an explanation.", "per theorem"],
        ["Authored explanation", "A person or the judge model supplied the proof explanation.", String(L.verification.authored)],
        ["Checked correspondence", "Review confirmed that the explanation matches the formal proof.", String(L.verification.checked_correspondence)],
        ["Lean-checked proof", "Lean checked this specific proof artifact.", String(L.verification.lean_checked)]]),
      h("p", { class: "note", text: "A declaration match never marks an alternative proof as Lean-checked. Hypothesis roles are authored for each proof and never inferred from dependency edges." }),
      h("h3", { text: "Sources" }),
      table(["Source", "Version", "Reuse"], Object.entries(D.sources).map(([k, v]) => [k, String(/** @type {any} */ (v).commit ?? /** @type {any} */ (v).revision ?? /** @type {any} */ (v).version ?? /** @type {any} */ (v).rule ?? ""), String(/** @type {any} */ (v).reuse ?? /** @type {any} */ (v).licence ?? /** @type {any} */ (v).license ?? "")])));
  }

  /* ---------- render ---------- */

  function render(/** @type {any} */ state, /** @type {any} */ d) {
    for (const v of Model.VIEWS) $(`view-${v}`).hidden = state.view !== v;
    if (state.view !== "proof" && pinned) closePop(false);
    if (state.view === "proof") renderSurface(state, d);
    if (state.view === "graph") renderGraph(state, d);
    if (state.view === "tree") renderTree(state, d);
    if (state.view === "concepts") renderConcept(state, d);
    if (state.view === "find") renderFind(state, d);
    if (state.view === "about") renderAbout();
    $("known-line").textContent = `${Object.keys(known).length} items marked known${storageOk ? ", kept in this browser" : "; local storage is not available, so the marks last only while this tab is open"}.`;
    typeset();
    repin();
  }

  /* ---------- WebMCP tools ---------- */

  /** @param {any} value */
  const out = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
  /** @param {any} sg */
  const plainSegs = (sg) => Model.flat(sg);
  /** A proof as plain data for a tool. @param {any} s */
  function proofRecord(s) {
    const p = s.proof;
    return {
      theorem: { id: s.id, name: s.name, statement: plainSegs(s.statement), hypotheses: s.hypotheses.map((/** @type {any} */ x) => ({ id: x.id, text: plainSegs(x.seg) })), conclusion: s.conclusion ? plainSegs(s.conclusion) : null, proofs: s.proofs.map((/** @type {any} */ q) => q.slug), formal: s.formal ? { decl: s.formal.decl, difference: s.formal.difference } : null },
      proof: p ? { id: p.id, name: p.name, slogan: plainSegs(p.slogan), scope: plainSegs(p.scope), roles: p.roles.map((/** @type {any} */ r) => ({ hypothesis: r.h, why: plainSegs(r.why), steps: r.steps.map((/** @type {number} */ k) => p.steps[k].id), unused: r.unused })),
        steps: p.steps.map((/** @type {any} */ st) => ({ id: st.id, slogan: plainSegs(st.slogan), detail: plainSegs(st.detail), inputs: st.inputs.map((/** @type {number} */ k) => p.steps[k].id), outputs: st.outputs.map((/** @type {number} */ k) => p.steps[k].id), hypotheses: st.hyps, concepts: st.concepts.map((/** @type {number} */ c) => IX.concepts[c].id), lemmas: st.lemmas.map((/** @type {any} */ l) => l.id) })),
        conclusionStep: p.steps[p.conclusion].id, mechanisms: p.mechanisms.map((/** @type {any} */ m) => m.id), source: p.source, verification: p.verification } : null,
      unknown: s.unknown,
    };
  }
  /** @type {KitTool[]} */
  const tools = [
    { name: "get_proof", description: "Return a theorem's exact statement, hypotheses and conclusion, and one of its proofs: slogan, scope, hypothesis roles with their steps, steps with inputs, outputs, concepts and lemmas, mechanisms, source and the four verification statuses.",
      inputSchema: { type: "object", properties: { theorem: { type: "string", description: "A theorem id such as wd:Q752375" }, proof: { type: "string", description: "A proof slug; the first proof when left out" } }, required: ["theorem"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ theorem?: string, proof?: string }} */ input = {}) => {
        if (!IX.theoremById.has(String(input.theorem))) return out({ error: `unknown theorem id ${input.theorem}` });
        return out(proofRecord(Model.proofSurface(VisualKit.normalize(Model.FIELDS, { sel: input.theorem, proof: input.proof ?? "" }).state, D, [])));
      } },
    { name: "search", description: "Search theorems (names, aliases, statements, Lean declarations, modules) and concepts (names, aliases, reminders) offline. Every word must match. Returns 10 results per page with the total count.",
      inputSchema: { type: "object", properties: { query: { type: "string" }, kind: { type: "string", enum: Model.FIELDS.fkind.values }, page: { type: "integer", minimum: 0 } }, required: ["query"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ query?: string, kind?: string, page?: number }} */ input = {}) => out(Model.findOf(VisualKit.normalize(Model.FIELDS, { fq: String(input.query ?? "").slice(0, 200), fkind: input.kind ?? "all", fpage: input.page ?? 0 }).state, D)) },
    { name: "get_concept", description: "Return a concept: reminder, definition and its basis, examples, the concepts it is defined from, its generality links with their steps, and the proofs and steps that use it.",
      inputSchema: { type: "object", properties: { id: { type: "string", description: "A concept id such as c:compact-space" } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ id?: string }} */ input = {}) => {
        if (!IX.conceptById.has(String(input.id))) return out({ error: `unknown concept id ${input.id}` });
        const c = Model.conceptPage(VisualKit.normalize(Model.FIELDS, { view: "concepts", concept: input.id }).state, D, []);
        return out({ ...c, reminder: c.reminder ? plainSegs(c.reminder) : null, definition: c.definition ? plainSegs(c.definition) : null, examples: c.examples.map(plainSegs),
          links: c.links.map((/** @type {any} */ l) => ({ type: l.type, to: l.to.id, steps: l.steps.map(plainSegs), why: plainSegs(l.why) })), incoming: c.incoming.map((/** @type {any} */ l) => ({ type: l.type, from: l.from.id })),
          uses: c.uses.map((/** @type {any} */ u) => ({ proof: u.proof, steps: u.steps.map((/** @type {any} */ s) => s.id), why: u.why ? plainSegs(u.why) : null })) });
      } },
    { name: "get_graph_neighbourhood", description: "Return the theory-graph neighbourhood of a node (concept, theorem, proof or mechanism) and of any expanded nodes: nodes, typed edges (defines, used at, supplies, proves, special case of, occurs in) and the full neighbour lists.",
      inputSchema: { type: "object", properties: { focus: { type: "string" }, expand: { type: "string", description: "Comma-separated node ids to expand" } }, required: ["focus"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ focus?: string, expand?: string }} */ input = {}) => out(Model.graphOf(VisualKit.normalize(Model.FIELDS, { view: "graph", gfocus: String(input.focus ?? ""), gopen: String(input.expand ?? "").slice(0, 1000) }).state, D, [])) },
    { name: "get_prerequisite_tree", description: "Return the prerequisite tree of a theorem or a concept, with a study order of the items not marked known.",
      inputSchema: { type: "object", properties: { id: { type: "string" }, depth: { type: "integer", minimum: 1, maximum: 6 } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ id?: string, depth?: number }} */ input = {}) => out(Model.treeOf(VisualKit.normalize(Model.FIELDS, { view: "tree", tdepth: input.depth ?? 3 }).state, D, String(input.id ?? ""), []) ?? { error: "unknown theorem or concept id" }) },
  ];

  /* ---------- start ---------- */

  app = VisualKit.start({
    slug: Model.SLUG,
    title: document.title,
    summary: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    schemaVersion: Model.SCHEMA_VERSION,
    fields: Model.FIELDS,
    derive: (state) => Model.derive(state, D),
    render,
    report: (state, d) => Report.report(state, d, D),
    tools,
    commands: [
      ...Model.EXAMPLES.map((/** @type {KitExample} */ e) => ({ label: `Example: ${e.label}`, run: () => app.set(e.state) })),
      ...Model.VIEWS.map((v) => ({ label: `View: ${v}`, run: () => app.set({ view: v }) })),
    ],
    bind(a) {
      app = a;
      // Name lists fill on first focus: about 2,000 theorem names and 12,000 concept names.
      const fill = (/** @type {string} */ list, /** @type {string[]} */ names) => {
        const frag = document.createDocumentFragment();
        for (const n of new Set(names)) frag.append(h("option", { value: n }));
        $(list).append(frag);
      };
      let filled = { theorems: false, concepts: false, nodes: false };
      $("pick").addEventListener("focus", () => { if (!filled.theorems) { filled.theorems = true; fill("theorem-names", IX.theorems.map((/** @type {any} */ t) => t.n)); } });
      $("cpick").addEventListener("focus", () => { if (!filled.concepts) { filled.concepts = true; fill("concept-names", IX.concepts.map((/** @type {any} */ c) => c.n)); } });
      for (const id of ["gpick", "troot"]) $(id).addEventListener("focus", () => { if (!filled.nodes) { filled.nodes = true; fill("node-names", [...IX.theorems.map((/** @type {any} */ t) => t.n), ...IX.concepts.map((/** @type {any} */ c) => c.n), ...IX.mechanisms.map((/** @type {any} */ m) => m.n)]); } });
      /** @param {string} raw @param {string[]} kinds */
      const findId = (raw, kinds) => {
        const q = raw.trim().toLowerCase();
        if (kinds.includes("theorem")) { const t = IX.theorems.find((/** @type {any} */ x) => x.n.toLowerCase() === q || x.id.toLowerCase() === q); if (t) return t.id; }
        if (kinds.includes("concept")) { const c = IX.concepts.find((/** @type {any} */ x) => x.n.toLowerCase() === q || x.id.toLowerCase() === q); if (c) return c.id; }
        if (kinds.includes("mechanism")) { const m = IX.mechanisms.find((/** @type {any} */ x) => x.n.toLowerCase() === q || x.id === q); if (m) return m.id; }
        return null;
      };
      const miss = (/** @type {string} */ v) => tell(`Nothing is named "${v.slice(0, 60)}". Choose a name from the list.`);
      $("pick").addEventListener("change", () => { const id = findId($("pick").value, ["theorem"]); if (id) a.set({ sel: id, proof: "", step: "", hyp: "", concept: "" }); else miss($("pick").value); });
      $("cpick").addEventListener("change", () => { const id = findId($("cpick").value, ["concept"]); if (id) a.set({ concept: id }); else miss($("cpick").value); });
      $("gpick").addEventListener("change", () => { const id = findId($("gpick").value, ["concept", "theorem", "mechanism"]); if (id) a.set({ gfocus: id, gopen: "" }); else miss($("gpick").value); });
      $("troot").addEventListener("change", () => { const id = findId($("troot").value, ["theorem", "concept"]); if (id) a.set({ troot: id }); else miss($("troot").value); });
      $("graph-reset").addEventListener("click", () => a.set({ gopen: "" }));
      $("walk").addEventListener("input", () => {
        const p = a.derived.surface.proof;
        if (!p) return;
        const k = Number($("walk").value);
        a.set({ step: k > 0 ? p.steps[k - 1].id : "", hyp: "", concept: "" }, "replace");
      });
      /** @type {ReturnType<typeof setTimeout> | undefined} */ let timer;
      $("fq").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => a.set({ fq: $("fq").value.slice(0, 200), fpage: 0 }, "replace"), 200); });
      $("fq").addEventListener("change", () => a.set({ fq: $("fq").value.slice(0, 200), fpage: 0 }));
      $("find-prev").addEventListener("click", () => a.set({ fpage: Math.max(0, a.state.fpage - 1) }));
      $("find-next").addEventListener("click", () => a.set({ fpage: a.state.fpage + 1 }));
      $("reset-known").addEventListener("click", () => { known = {}; D.profile = { known }; try { localStorage.setItem(PROFILE_KEY, "{}"); } catch { storageOk = false; } a.set({}, "replace"); });
      $("deck-fallback").addEventListener("toggle", () => {
        if (!$("deck-fallback").open) return;
        try { $("deck-text").value = a.deck(); } catch (e) { $("deck-text").value = `The deck could not be written: ${String(e)}`; }
      });
    },
  });
})();
