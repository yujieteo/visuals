/* Entropy Methods in Combinatorics Lab: the interactive pictures.
 *
 * Each widget type is { init(options), controls(st, ctx), view(st, ctx), act: {...}, budget?(st), ledger?(st) }.
 * `controls` holds the inputs and is redrawn only when the structure changes; `view` is redrawn on every
 * change. State is a plain object; the page keeps one per lesson. Inputs carry data-k (the state key
 * they set) and buttons data-act / data-arg. Every number comes from EntropyLab; samples are drawn from
 * a fixed generator, so the same clicks give the same objects everywhere (spec §62).
 */
(function (root) {
  "use strict";
  const E = root.EntropyLab, Ls = root.EntropyLessons, R = root.EntropyRender;
  const esc = R.esc, f = E.fmt, cnt = E.fmtCount;
  const m = (t) => `<span class="math">${R.tex(t)}</span>`;
  const md = (t) => R.md(t);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sub = (i) => String(i + 1).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d]);
  const xs = (i) => `X${sub(i)}`;
  const setName = (A, names) => (A.length ? `{${A.map((i) => (names ? names[i] : i + 1)).join(",")}}` : "∅");

  /* ---------- small HTML builders ---------- */
  const stepper = (k, label, v, min, max, step = 1, show) =>
    `<div class="stepper" role="group" aria-label="${esc(label)}"><span class="lab">${esc(label)}</span>` +
    `<button type="button" data-act="step" data-arg="${k}|${-step}|${min}|${max}" aria-label="Decrease ${esc(label)}" ${v <= min ? "disabled" : ""}>−</button>` +
    `<output aria-live="off">${show !== undefined ? show : esc(v)}</output>` +
    `<button type="button" data-act="step" data-arg="${k}|${step}|${min}|${max}" aria-label="Increase ${esc(label)}" ${v >= max ? "disabled" : ""}>+</button></div>`;
  const slider = (k, label, v, min, max, step = 1) =>
    `<label class="slider"><span class="lab">${esc(label)} <output>${esc(v)}</output></span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
  const select = (k, label, options, v) =>
    `<label class="sel"><span class="lab">${esc(label)}</span><select data-k="${k}" data-str="1">${options.map(([val, l]) => `<option value="${esc(val)}" ${String(val) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const btn = (act, label, arg = "", extra = "") => `<button type="button" class="btn" data-act="${act}" data-arg="${esc(arg)}" ${extra}>${label}</button>`;
  const toggle = (act, arg, on, label, aria) => `<button type="button" class="tog" data-act="${act}" data-arg="${esc(arg)}" aria-pressed="${on}" aria-label="${esc(aria || label)}">${label}</button>`;
  function table(head, rows, cls = "") {
    return `<div class="tablewrap"><table class="${cls}"><thead><tr>${head.map((x) => `<th scope="col">${x}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr${r.cls ? ` class="${r.cls}"` : ""}>${(r.cells || r).map((x, i) => (i ? `<td>${x}</td>` : `<th scope="row">${x}</th>`)).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  /* Information bars on a shared scale; label, value and a pattern, never colour alone. */
  function bars(rows, ctx, scale) {
    const max = scale || Math.max(1e-9, ...rows.map((r) => r.bits));
    return `<div class="bars">${rows.map((r) => `<div class="barrow ${r.cls || ""}"><span class="bl">${r.label}</span><span class="track"><span class="fill" style="width:${clamp((100 * r.bits) / max, 0, 100).toFixed(2)}%"></span>${r.cap !== undefined ? `<span class="cap" style="left:${clamp((100 * r.cap) / max, 0, 100).toFixed(2)}%"></span>` : ""}</span><span class="bv">${ctx.fH(r.bits)}</span></div>`).join("")}</div>`;
  }
  /* One bit budget split into contributions (chain rule): segments with their own labels. */
  function stack(segs, ctx, total) {
    const T = total || segs.reduce((a, s) => a + s.bits, 0) || 1;
    return `<div class="stack" role="img" aria-label="${esc(segs.map((s) => `${R.text(s.label)} ${ctx.fH(s.bits)}`).join(", "))}">${segs.map((s, i) => `<span class="seg s${i % 6}${s.dim ? " dim" : ""}" style="width:${clamp((100 * s.bits) / T, 0, 100).toFixed(2)}%" title="${esc(R.text(s.label))}"><span>${esc(R.text(s.label))}</span></span>`).join("")}</div>` +
      `<ol class="seglist">${segs.map((s, i) => `<li><span class="sw s${i % 6}" aria-hidden="true"></span>${s.label} <b>${ctx.fH(s.bits)}</b></li>`).join("")}</ol>`;
  }
  const verdict = (ok, yes, no) => `<p class="verdict ${ok ? "ok" : "no"}"><span aria-hidden="true">${ok ? "✓" : "✗"}</span> ${ok ? yes : no}</p>`;
  /* A deterministic draw in [0, n): the k-th value of a fixed generator. */
  const draw = (n, k, salt = 0) => Math.floor(E.lcg(2654435761 + 40503 * k + 977 * salt)() * n);
  const key = (t) => t.join("");
  const tup = (t) => `<span class="tuple">${t.join("")}</span>`;

  const FAMILY_MENU = {
    permutations: ["Permutations of 4", () => E.family("permutations", 4)],
    "no-adjacent": ["Length 5, no two adjacent ones", () => E.family("no-adjacent", 5)],
    "even-weight": ["Length 4, even weight", () => E.family("even-weight", 4)],
    "k-subsets": ["2-subsets of [5] as indicators", () => E.family("k-subsets", 5, 2)],
    "cyclic-no-adjacent": ["Cyclic length 4, no two adjacent ones", () => E.family("cyclic-no-adjacent", 4)],
  };
  const famOptions = Object.entries(FAMILY_MENU).map(([k, [l]]) => [k, l]);

  const W = {};

  /* ---------- counting: N objects ↔ tree depth ↔ bits ---------- */
  W.counting = {
    init: (o) => ({ N: o.N || 12, draws: 0, picked: null }),
    controls: (st) => slider("N", "Number of objects N", st.N, 1, 1024) + `<div class="row">${btn("sample", "Sample uniformly")}</div>`,
    view(st, ctx) {
      const N = st.N, H = Math.log2(N), depth = N > 1 ? Math.ceil(H) : 0;
      let tree = "";
      if (N <= 64) {
        const W0 = 640, rowH = depth ? Math.min(46, 220 / depth) : 0, Hh = depth * rowH + 40;
        const leafX = (i) => (W0 * (i + 0.5)) / (1 << depth);
        let lines = "", dots = "";
        for (let d = 0; d < depth; d++) for (let j = 0; j < 1 << d; j++) {
          const x = (W0 * (j + 0.5)) / (1 << d), y = 14 + d * rowH;
          for (const c of [0, 1]) {
            const jj = 2 * j + c, firstLeaf = jj << (depth - d - 1);
            if (firstLeaf >= N) continue;
            lines += `<line x1="${x}" y1="${y}" x2="${(W0 * (jj + 0.5)) / (1 << (d + 1))}" y2="${y + rowH}"/>`;
          }
        }
        for (let i = 0; i < N; i++) dots += `<circle class="${st.picked === i ? "hot" : ""}" cx="${leafX(i)}" cy="${14 + depth * rowH}" r="${Math.max(2.5, Math.min(7, 200 / N))}"/>`;
        tree = `<svg class="tree" viewBox="0 0 ${W0} ${Hh}" role="img" aria-label="A binary decision tree of depth ${depth} with ${N} leaves">${lines}${dots}</svg>`;
      } else tree = `<p class="muted small">A decision tree with ${cnt(N)} leaves has depth ${depth}; the picture is drawn for N ≤ 64.</p>`;
      const code = st.picked !== null && st.picked < N && depth ? st.picked.toString(2).padStart(depth, "0") : null;
      return `${tree}<div class="facts"><div><span class="k">objects</span><b>${cnt(N)}</b></div><div><span class="k">tree depth</span><b>${depth}</b></div><div><span class="k">entropy ${m("\\log_2 N")}</span><b>${ctx.fH(H)}</b></div></div>` +
        (code ? `<p>Sampled object ${st.picked + 1}: its path is <code>${code}</code> (${depth} questions).</p>` : "") +
        (N & (N - 1) ? `<p class="muted">${N} is not a power of two, so ${m("\\log_2 N")} is fractional: the average cost per object when many objects are named together.</p>` : "");
    },
    act: { sample(st, _, ctx) { st.picked = draw(st.N, st.draws++); ctx.say(`Object ${st.picked + 1} of ${st.N} sampled.`); } },
    budget: (st) => ({ rows: [{ label: "H(X) = log N", bits: Math.log2(st.N) }] }),
  };

  /* ---------- distribution: drag probability mass ---------- */
  W.distribution = {
    init: (o) => ({ w: o.weights.slice(), q: (o.reference || []).slice(), kl: !!o.kl, symbols: o.symbols || null }),
    controls(st) {
      return `<div class="row">${btn("preset", "Uniform", "uniform")}${btn("preset", "Concentrated", "point")}${btn("preset", "Skewed", "skew")}${btn("add", "Add outcome", "", st.w.length >= 8 ? "disabled" : "")}${btn("drop", "Remove outcome", "", st.w.length <= 2 ? "disabled" : "")}</div>`;
    },
    view(st, ctx) {
      const N = st.w.length, tot = st.w.reduce((a, b) => a + b, 0) || 1, H = E.entropyCounts(st.w), sup = st.w.filter((x) => x > 0).length, maxw = Math.max(1, ...st.w, ...st.q);
      const lab = (i) => (st.symbols ? st.symbols[i] || String(i + 1) : String(i + 1));
      const col = (arr, which) => `<div class="pbars" data-which="${which}">${arr.map((w, i) => `<div class="pb"><div class="pbt" data-act="drag" data-arg="${which}|${i}" role="slider" tabindex="0" aria-label="Weight of outcome ${esc(lab(i))}${which === "q" ? " in Q" : ""}" aria-valuemin="0" aria-valuemax="12" aria-valuenow="${w}"><span style="height:${(100 * w) / maxw}%"></span></div>` +
        `<div class="pbn">${esc(lab(i))}</div><div class="pbv">${which === "w" ? f(w / tot, 3) : f(w / (arr.reduce((a, b) => a + b, 0) || 1), 3)}</div>` +
        `<div class="pm"><button type="button" data-act="w" data-arg="${which}|${i}|-1" aria-label="Less mass on ${esc(lab(i))}">−</button><button type="button" data-act="w" data-arg="${which}|${i}|1" aria-label="More mass on ${esc(lab(i))}">+</button></div></div>`).join("")}</div>`;
      let out = `<p class="small muted">Drag a bar, use its −/+ buttons, or focus it and press ↑/↓. Probabilities are weight / ${tot}.</p>` + col(st.w, "w");
      out += bars([{ label: "H(X)", bits: H, cap: Math.log2(N) }, { label: `log₂ |supp X| = log₂ ${sup}`, bits: Math.log2(Math.max(1, sup)) }, { label: `log₂ N = log₂ ${N}`, bits: Math.log2(N) }], ctx, Math.log2(N) || 1);
      out += verdict(Math.abs(H - Math.log2(N)) < 1e-9, `Uniform: ${m("H(X)=\\log N")}, equality.`, `Not uniform: ${m("H(X)<\\log N")} by ${ctx.fH(Math.log2(N) - H)} (the KL divergence from uniform).`);
      if (st.kl) {
        const d = E.kl(st.w, st.q);
        out += `<h4>Reference Q</h4>${col(st.q, "q")}<p>${m("D(P\\|Q)")} = <b>${Number.isFinite(d) ? ctx.fH(d) : "∞ (P puts mass where Q has none)"}</b> ≥ 0.</p>`;
        if (st.q.every((x) => x === st.q[0])) out += `<p class="muted">With Q uniform, ${m("D(P\\|Q)=\\log N-H(P)")}: here ${ctx.fH(Math.log2(N))} − ${ctx.fH(H)}.</p>`;
      }
      return out;
    },
    act: {
      w(st, arg, ctx) { const [which, i, d] = arg.split("|"); const a = st[which]; a[+i] = clamp(a[+i] + +d, 0, 12); if (a.every((x) => !x)) a[+i] = 1; ctx.say(`Entropy now ${ctx.fH(E.entropyCounts(st.w))}.`); },
      set(st, arg) { const [which, i, v] = arg.split("|"); st[which][+i] = clamp(+v, 0, 12); if (st[which].every((x) => !x)) st[which][+i] = 1; },
      preset(st, arg) { const N = st.w.length; st.w = arg === "uniform" ? new Array(N).fill(3) : arg === "point" ? [12, ...new Array(N - 1).fill(0)] : E.range(N).map((i) => Math.max(1, 12 >> i)); },
      add(st) { if (st.w.length < 8) { st.w.push(1); if (st.q.length) st.q.push(1); } },
      drop(st) { if (st.w.length > 2) { st.w.pop(); if (st.q.length) st.q.pop(); if (st.w.every((x) => !x)) st.w[0] = 1; } },
    },
    budget: (st) => ({ rows: [{ label: "H(X)", bits: E.entropyCounts(st.w) }, { label: "log N", bits: Math.log2(st.w.length) }] }),
  };

  /* ---------- joint: a grid of occupied cells, or X with a function of X ---------- */
  const JOINT = {
    staircase: [[1, 1, 0], [0, 1, 1]], product: [[1, 1, 1], [1, 1, 1]], diagonal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], full3: [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
  };
  const FUNCS = { parity: ["parity of X", (x) => x % 2], half: ["⌊X/4⌋", (x) => x >> 2], mod4: ["X mod 4", (x) => x % 4], constant: ["a constant", () => 0], identity: ["X itself", (x) => x] };
  W.joint = {
    init: (o) => (o.preset === "parity" ? { fn: "parity", cond: null, cells: null } : { fn: null, cells: (o.cells || JOINT.staircase).map((r) => r.slice()), cond: null }),
    controls(st) {
      if (st.fn) return select("fn", "Y is", Object.entries(FUNCS).map(([k, [l]]) => [k, l]), st.fn);
      return `<div class="row">${Object.keys(JOINT).map((k) => btn("preset", k, k)).join("")}${btn("addrow", "Add X value", "", st.cells.length >= 4 ? "disabled" : "")}${btn("addcol", "Add Y value", "", st.cells[0].length >= 4 ? "disabled" : "")}</div>`;
    },
    table(st) {
      if (!st.fn) return st.cells;
      const g = FUNCS[st.fn][1], ys = [...new Set(E.range(8).map(g))].sort((a, b) => a - b);
      return E.range(8).map((x) => ys.map((y) => (g(x) === y ? 1 : 0)));
    },
    view(st, ctx) {
      const t = W.joint.table(st), s = E.jointStats(t), ny = t[0].length;
      const yLabel = (j) => (st.fn ? String([...new Set(E.range(8).map(FUNCS[st.fn][1]))].sort((a, b) => a - b)[j]) : String(j));
      const live = (i) => st.cond === null || t[i][st.cond] > 0;
      let g = `<div class="tablewrap"><table class="grid"><caption class="sr">Occupied cells of (X, Y)</caption><thead><tr><th scope="col">X \\ Y</th>${E.range(ny).map((j) => `<th scope="col"><button type="button" class="tog small" data-act="cond" data-arg="${j}" aria-pressed="${st.cond === j}" aria-label="Condition on Y = ${yLabel(j)}">Y=${yLabel(j)}</button></th>`).join("")}</tr></thead><tbody>`;
      t.forEach((r, i) => {
        g += `<tr class="${live(i) ? "" : "faded"}"><th scope="row">${i}</th>${r.map((v, j) => `<td>${st.fn ? (v ? "●" : "·") : `<button type="button" class="cell" data-act="cell" data-arg="${i}|${j}" aria-pressed="${!!v}" aria-label="Cell X=${i}, Y=${j}">${v ? "●" : ""}</button>`}</td>`).join("")}</tr>`;
      });
      g += "</tbody></table></div>";
      const cnd = st.cond !== null ? `<p>Knowing <b>Y = ${yLabel(st.cond)}</b> leaves <b>${t.filter((r) => r[st.cond] > 0).length}</b> of ${s.supportX} values of X.</p>` : `<p class="muted small">Press a Y column to condition on it.</p>`;
      const diagram = stack([{ label: "H(X | Y)", bits: s.HXgY }, { label: "I(X;Y)", bits: s.I }, { label: "H(Y | X)", bits: s.HYgX }], ctx);
      return g + cnd + `<p>The pair costs ${m("H(X,Y)")} = <b>${ctx.fH(s.HXY)}</b> = log₂ ${s.occupied}; described separately, ${m("H(X)+H(Y)")} = <b>${ctx.fH(s.HX + s.HY)}</b>.</p>` + diagram +
        verdict(s.independent, "Independent: the occupied cells form a product and subadditivity is tight.", `Correlated: the separate descriptions overpay by ${m("I(X;Y)")} = ${ctx.fH(s.I)}.`);
    },
    act: {
      cell(st, arg) { const [i, j] = arg.split("|").map(Number); st.cells[i][j] = st.cells[i][j] ? 0 : 1; if (st.cells.flat().every((x) => !x)) st.cells[i][j] = 1; },
      cond(st, arg, ctx) { st.cond = st.cond === +arg ? null : +arg; if (st.cond !== null) ctx.say(`Conditioned on Y = ${arg}.`); },
      preset(st, arg) { st.cells = JOINT[arg].map((r) => r.slice()); st.cond = null; },
      addrow(st) { st.cells.push(new Array(st.cells[0].length).fill(0)); },
      addcol(st) { st.cells.forEach((r) => r.push(0)); },
    },
    budget(st) { const s = E.jointStats(W.joint.table(st)); return { rows: [{ label: "H(X,Y)", bits: s.HXY }, { label: "H(X)+H(Y)", bits: s.HX + s.HY }, { label: "I(X;Y)", bits: s.I }] }; },
    ledger(st) { const s = E.jointStats(W.joint.table(st)); return [{ rel: "", tex: "\\log|\\mathcal F|=H(X,Y)", why: "uniform", bits: s.HXY }, { rel: "=", tex: "H(X)+H(Y\\mid X)", why: "chain rule", bits: s.HX + s.HYgX }, { rel: "≤", tex: "H(X)+H(Y)", why: "conditioning", bits: s.HX + s.HY }]; },
  };

  /* ---------- reveal: chain rule, conditioning and subadditivity on one family ---------- */
  W.reveal = {
    init: (o) => ({ fam: o.family in FAMILY_MENU ? o.family : "permutations", order: null, shown: 0, obj: 0, draws: 0, i: 1, j: 0, focus: !!o.focus, ledger: !!o.ledger }),
    F: (st) => FAMILY_MENU[st.fam][1](),
    controls(st) {
      const n = E.dims(W.reveal.F(st));
      const order = st.order && st.order.length === n ? st.order : E.range(n);
      return select("fam", "Family", famOptions, st.fam) +
        `<div class="row" role="group" aria-label="Reveal order">${order.map((c, p) => `<span class="ordchip">${xs(c)}${p ? `<button type="button" data-act="swap" data-arg="${p}" aria-label="Reveal ${xs(c)} earlier">←</button>` : ""}</span>`).join("")}</div>` +
        `<div class="row">${btn("sample", "Sample an object")}${btn("next", "Reveal next coordinate")}${btn("reset", "Start again")}</div>` +
        (st.focus ? `<div class="row">${select("i", "Describe", E.range(n).map((c) => [c, xs(c)]), st.i)}${select("j", "given", E.range(n).map((c) => [c, xs(c)]), st.j)}</div>` : "");
    },
    view(st, ctx) {
      const F = W.reveal.F(st), n = E.dims(F);
      if (!st.order || st.order.length !== n) st.order = E.range(n);
      const obj = F[st.obj % F.length], r = E.chainRule(F, st.order, obj), known = st.order.slice(0, st.shown);
      const compatible = (t) => known.every((c) => t[c] === obj[c]);
      const nComp = F.filter(compatible).length;
      let out = `<div class="chips" aria-label="The family, ${F.length} objects">${F.map((t, i) => `<span class="chip ${compatible(t) ? "" : "faded"} ${i === st.obj % F.length ? "hot" : ""}">${t.map((v, c) => (known.includes(c) ? `<b>${v}</b>` : v)).join("")}</span>`).join("")}</div>`;
      out += `<p>Object ${tup(obj)}: ${st.shown ? `after revealing ${known.map(xs).join(", ")}, <b>${nComp}</b> of ${F.length} objects remain compatible.` : `${F.length} objects are compatible before any reveal.`}</p>`;
      out += table(["step", "compatible", "pointwise log₂(before/after)", `${m("H(X_i\\mid\\text{earlier})")}`, `${m("H(X_i)")}`], r.steps.map((s, p) => ({
        cls: p < st.shown ? "on" : "faded", cells: [`${p + 1}. ${xs(s.coord)}`, `${s.before} → ${s.after}`, ctx.fH(s.pointwise), ctx.fH(s.cond), ctx.fH(s.marginal)] })));
      out += `<h4>Chain rule: the budget ${m("H(X)=\\log|\\mathcal F|")} = ${ctx.fH(r.H)}</h4>` + stack(r.steps.map((s, p) => ({ label: `H(${xs(s.coord)} | earlier)`, bits: s.cond, dim: p >= st.shown })), ctx, r.H);
      if (st.focus) {
        const a = E.Hproj(F, [st.i]), b = E.Hcond(F, [st.i], [st.j]);
        const vals = [...new Set(F.map((t) => t[st.j]))].sort();
        out += `<h4>Conditioning: ${m(`H(X_${st.i + 1}\\mid X_${st.j + 1})\\le H(X_${st.i + 1})`)}</h4>` + bars([{ label: `H(${xs(st.i)})`, bits: a }, { label: `H(${xs(st.i)} | ${xs(st.j)})`, bits: b }], ctx, Math.max(a, 1e-9)) +
          `<ul class="small">${vals.map((v) => { const s = [...new Set(F.filter((t) => t[st.j] === v).map((t) => t[st.i]))].sort(); return `<li>${xs(st.j)} = ${v}: ${xs(st.i)} ∈ {${s.join(", ")}} (${s.length} of ${new Set(F.map((t) => t[st.i])).size} values)</li>`; }).join("")}</ul>` +
          verdict(Math.abs(a - b) < 1e-9, "Independent here: conditioning changes nothing.", `Knowing ${xs(st.j)} saves ${ctx.fH(a - b)} = ${m(`I(X_${st.i + 1};X_${st.j + 1})`)} on average.`);
      }
      if (st.ledger) out += ledgerHtml(W.reveal.ledger(st), ctx);
      return out;
    },
    act: {
      sample(st, _, ctx) { const F = W.reveal.F(st); st.obj = draw(F.length, st.draws++); st.shown = 0; ctx.say(`Sampled ${F[st.obj].join("")}. ${F.length} compatible objects.`); },
      next(st, _, ctx) {
        const F = W.reveal.F(st), n = E.dims(F);
        if (st.shown >= n) return;
        const before = F.filter((t) => st.order.slice(0, st.shown).every((c) => t[c] === F[st.obj % F.length][c])).length;
        st.shown++;
        const after = F.filter((t) => st.order.slice(0, st.shown).every((c) => t[c] === F[st.obj % F.length][c])).length;
        ctx.say(`Coordinate ${st.order[st.shown - 1] + 1} revealed. Compatible objects reduced from ${before} to ${after}.`);
      },
      reset(st) { st.shown = 0; },
      swap(st, arg) { const p = +arg; [st.order[p - 1], st.order[p]] = [st.order[p], st.order[p - 1]]; st.shown = 0; },
    },
    change(st, k) { if (k === "fam") { st.order = null; st.shown = 0; st.obj = 0; st.i = 1; st.j = 0; } },
    budget(st) { const s = E.subadditivity(W.reveal.F(st)); return { rows: [{ label: "H(X) = log|F|", bits: s.H }, { label: "Σ H(Xᵢ)", bits: s.sumH }, { label: "Σ log|supp Xᵢ|", bits: s.sumLog }] }; },
    ledger(st) {
      const F = W.reveal.F(st), s = E.subadditivity(F), r = E.chainRule(F, st.order || E.range(E.dims(F)));
      return [{ rel: "", tex: "\\log|\\mathcal F|=H(X)", why: "uniform", bits: s.H }, { rel: "=", tex: "\\sum_iH(X_i\\mid X_{<i})", why: "chain rule (exact)", bits: r.total },
        { rel: "≤", tex: "\\sum_iH(X_i)", why: "conditioning", bits: s.sumH }, { rel: "≤", tex: "\\sum_i\\log|\\operatorname{supp}X_i|", why: "support bound", bits: s.sumLog }];
    },
  };

  /* An entropy ledger with cumulative slack (spec §52, §56). */
  function ledgerHtml(rows, ctx) {
    if (!rows || !rows.length) return "";
    const base = rows[0].bits, max = Math.max(...rows.map((r) => r.bits), 1e-9);
    return `<div class="ledger" role="list" aria-label="Entropy ledger">${rows.map((r, i) => `<button type="button" class="lline" role="listitem" data-act="lline" data-arg="${i}" aria-label="${esc(`${r.rel || ""} ${R.text("$" + r.tex + "$")}: ${r.why}, ${ctx.fH(r.bits)}, slack ${ctx.fH(r.bits - base)}`)}">` +
      `<span class="rel">${r.rel}</span><span class="lx">${m(r.tex)}</span><span class="why">${esc(r.why)}</span><span class="lv">${ctx.fH(r.bits)}</span>` +
      `<span class="slack"><span class="fill" style="width:${((100 * base) / max).toFixed(2)}%"></span><span class="sl" style="width:${((100 * Math.max(0, r.bits - base)) / max).toFixed(2)}%"></span></span></button>`).join("")}</div>` +
      `<p class="small muted">Dark: the exact entropy. Hatched: slack accumulated by the inequalities so far.</p>`;
  }

  /* ---------- constrained strings: no two adjacent ones ---------- */
  W.strings = {
    init: (o) => ({ n: o.n || 8 }),
    controls: (st) => slider("n", "Length n", st.n, 2, 14),
    view(st, ctx) {
      const n = st.n, F = E.family("no-adjacent", n), s = E.subadditivity(F);
      const markov = E.Hproj(F, [0]) + E.range(n - 1).reduce((a, i) => a + E.Hcond(F, [i + 1], [i]), 0);
      const list = n <= 6 ? `<div class="chips">${F.map((t) => `<span class="chip">${t.join("")}</span>`).join("")}</div>` : `<p class="muted small">${F.length} strings (listed for n ≤ 6).</p>`;
      return list + table(["bound", "entropy", "count"], [
        ["exact", ctx.fH(s.H), `<b>${cnt(s.size)}</b>`],
        [`keep one neighbour ${m("H(X_1)+\\sum H(X_i\\mid X_{i-1})")}`, ctx.fH(markov), f(Math.pow(2, markov), 5)],
        [`subadditivity ${m("\\sum H(X_i)")}`, ctx.fH(s.sumH), f(s.entropyCount, 5)],
        [`naive ${m("n")} bits`, ctx.fH(n), cnt(E.bigPow(2, n))],
      ]) + bars([{ label: "log|F|", bits: s.H }, { label: "Markov", bits: markov }, { label: "Σ H(Xᵢ)", bits: s.sumH }, { label: "n", bits: n }], ctx, n);
    },
    ledger(st) {
      const n = st.n, F = E.family("no-adjacent", n), s = E.subadditivity(F), markov = E.Hproj(F, [0]) + E.range(n - 1).reduce((a, i) => a + E.Hcond(F, [i + 1], [i]), 0);
      return [{ rel: "", tex: "\\log|\\mathcal F_n|", why: "uniform", bits: s.H }, { rel: "≤", tex: "H(X_1)+\\sum_iH(X_i\\mid X_{i-1})", why: "conditioning (keep one)", bits: markov },
        { rel: "≤", tex: "\\sum_iH(X_i)", why: "conditioning (drop all)", bits: s.sumH }, { rel: "≤", tex: "n", why: "support bound", bits: n }];
    },
  };

  /* ---------- binary entropy curve and layers ---------- */
  W.hcurve = {
    init: (o) => ({ n: o.n || 10, p: o.p ?? 0.3, layers: !!o.layers }),
    controls: (st) => slider("p", "p", st.p, 0, 1, 0.01) + slider("n", "n", st.n, 1, 40),
    view(st, ctx) {
      const W0 = 320, H0 = 160, pts = E.range(101).map((i) => `${(W0 * i) / 100},${H0 - H0 * E.h(i / 100) * 0.92}`).join(" ");
      const k = Math.round(st.p * st.n), b = E.binomialBound(st.n, k);
      let out = `<svg class="curve" viewBox="-30 -10 ${W0 + 40} ${H0 + 34}" role="img" aria-label="Binary entropy curve; h(${f(st.p, 2)}) = ${f(E.h(st.p), 4)} bits">` +
        `<line class="axis" x1="0" y1="${H0}" x2="${W0}" y2="${H0}"/><line class="axis" x1="0" y1="0" x2="0" y2="${H0}"/><polyline points="${pts}"/>` +
        `<line class="guide" x1="${W0 * st.p}" y1="${H0}" x2="${W0 * st.p}" y2="${H0 - H0 * E.h(st.p) * 0.92}"/><circle class="hot" cx="${W0 * st.p}" cy="${H0 - H0 * E.h(st.p) * 0.92}" r="5"/>` +
        `<text x="0" y="${H0 + 18}">0</text><text x="${W0 / 2 - 8}" y="${H0 + 18}">½</text><text x="${W0 - 6}" y="${H0 + 18}">1</text><text x="-26" y="${H0 - H0 * 0.92 + 4}">1</text></svg>`;
      out += `<p>${m("h(p)")} = <b>${ctx.fH(E.h(st.p))}</b> per coordinate; maximum ${ctx.fH(1)} at ${m("p=1/2")}.</p>`;
      out += `<p>With n = ${st.n}, k = round(pn) = ${k}: ${m("\\binom{n}{k}")} = <b>${cnt(b.exact)}</b> ≤ ${m("2^{nh(k/n)}")} = <b>${f(b.bound, 5)}</b> (ratio ${f(b.ratio, 4)}; ${m("\\log_2")} exact ${f(b.log2Exact, 4)} vs ${f(b.exponent, 4)}).</p>`;
      if (st.layers) {
        const L = E.layers(st.n), mx = Math.max(...L.map((l) => Math.log2(l.bound) || 0), 1);
        out += `<h4>Layer sizes on a log scale</h4><div class="layers">${L.map((l) => `<div class="layer ${2 * l.k === st.n || 2 * l.k === st.n - 1 || 2 * l.k === st.n + 1 ? "mid" : ""}"><span class="lb" style="height:${(100 * l.log2Exact) / mx}%"></span><span class="lbd" style="bottom:${(100 * l.exponent) / mx}%"></span><span class="lk">${l.k}</span></div>`).join("")}</div>` +
          `<p class="small muted">Bars: ${m("\\log_2\\binom nk")}. Ticks: ${m("nh(k/n)")}. Both peak in the middle layer.</p>` +
          `<div class="note"><b>Entropy intuition, asymptotic size:</b> layer k has about ${m("2^{nh(k/n)}")} sets, largest near ${m("k=n/2")}.<br><b>Exact extremal theorem (Sperner):</b> every antichain has at most ${m("\\binom{n}{\\lfloor n/2\\rfloor}")} = ${cnt(E.binom(st.n, Math.floor(st.n / 2)))} sets. Its proof uses the LYM inequality, not entropy. A brute-force search on n = 4 gives ${E.largestAntichain(4)}.</div>`;
      }
      return out;
    },
  };

  /* ---------- binomial: n boxes, k lit ---------- */
  W.boxes = {
    init: (o) => ({ n: o.n || 10, k: o.k ?? 3, draws: 0, set: null }),
    controls: (st) => slider("n", "n boxes", st.n, 1, 16) + slider("k", "k lit", st.k, 0, 16) + `<div class="row">${btn("sample", "Sample a random k-subset")}</div>`,
    view(st, ctx) {
      const n = st.n, k = Math.min(st.k, n), b = E.binomialBound(n, k);
      let set = st.set && st.set.length === k && st.set.every((x) => x < n) ? st.set : E.range(k);
      const boxes = `<div class="boxes" role="img" aria-label="${n} boxes, lit: ${set.map((x) => x + 1).join(", ") || "none"}">${E.range(n).map((i) => `<span class="box ${set.includes(i) ? "lit" : ""}"><span>${i + 1}</span><small>${f(k / n || 0, 2)}</small></span>`).join("")}</div>`;
      return boxes + `<p class="small muted">Each box is lit with marginal probability ${m("k/n")} = ${f(k / n || 0, 4)}, yet exactly ${k} are lit: the boxes are dependent.</p>` +
        table(["", "count", "log₂"], [["exact " + m("\\binom nk"), `<b>${cnt(b.exact)}</b>`, f(b.log2Exact, 4)], ["entropy " + m("2^{nh(k/n)}"), f(b.bound, 5), f(b.exponent, 4)], [m("(en/k)^k"), f(b.ek, 5), f(Math.log2(b.ek), 4)], ["naive " + m("2^n"), cnt(b.naive), String(n)]]) +
        `<p>Ratio bound / exact = <b>${f(b.ratio, 4)}</b>: the entropy proof keeps the exponential order and loses a polynomial factor.</p>` + ledgerHtml(W.boxes.ledger(st), ctx);
    },
    act: { sample(st, _, ctx) { const n = st.n, k = Math.min(st.k, n), pool = E.range(n), out = []; for (let i = 0; i < k; i++) out.push(pool.splice(draw(pool.length, st.draws, i), 1)[0]); st.draws++; st.set = out.sort((a, b) => a - b); ctx.say(`Lit boxes ${st.set.map((x) => x + 1).join(", ")}.`); } },
    change(st) { st.k = Math.min(st.k, st.n); },
    budget(st) { const b = E.binomialBound(st.n, Math.min(st.k, st.n)); return { rows: [{ label: "log C(n,k)", bits: b.log2Exact }, { label: "n h(k/n)", bits: b.exponent }, { label: "n", bits: st.n }] }; },
    ledger(st) { const n = st.n, k = Math.min(st.k, n), b = E.binomialBound(n, k); return [{ rel: "", tex: "\\log\\binom nk=H(X_1,\\ldots,X_n)", why: "uniform", bits: b.log2Exact }, { rel: "≤", tex: "\\sum_iH(X_i)=nh(k/n)", why: "subadditivity + symmetry", bits: b.exponent }, { rel: "≤", tex: "n", why: "support bound", bits: n }]; },
  };

  /* ---------- Shearer on a circle of four coordinates ---------- */
  const NODE4 = [[150, 40], [260, 150], [150, 260], [40, 150]];
  function coverSvg(sets, n, cov, label) {
    const P = n === 4 ? NODE4 : E.range(n).map((i) => [150 + 110 * Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n), 150 + 110 * Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / n)]);
    let regions = "";
    sets.forEach((A, j) => {
      const pts = A.map((i) => P[i]);
      const cls = `reg r${j % 6}`;
      if (pts.length === 1) regions += `<circle class="${cls}" cx="${pts[0][0]}" cy="${pts[0][1]}" r="${30 + 6 * j}"/>`;
      else if (pts.length === 2) regions += `<line class="${cls}" x1="${pts[0][0]}" y1="${pts[0][1]}" x2="${pts[1][0]}" y2="${pts[1][1]}" style="stroke-width:${30 - 3 * j}px"/>`;
      else { const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length; const srt = pts.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx)); regions += `<polygon class="${cls}" points="${srt.map((p) => p.join(",")).join(" ")}"/>`; }
    });
    const nodes = P.map((p, i) => `<g><circle class="node" cx="${p[0]}" cy="${p[1]}" r="18"/><text x="${p[0]}" y="${p[1] + 5}" text-anchor="middle">${i + 1}</text><text class="cov" x="${p[0]}" y="${p[1] + 38}" text-anchor="middle">×${cov[i]}</text></g>`).join("");
    return `<svg class="cover" viewBox="0 0 300 310" role="img" aria-label="${esc(label)}">${regions}${nodes}</svg>`;
  }
  function shearerReadout(F, sets, n, ctx, names) {
    if (!sets.length) return `<p class="muted">Add a subset to start covering.</p>`;
    const s = E.shearer(F, sets, n);
    let out = `<p>Coverage: ${s.coverage.map((c, i) => `<span class="covtag">coord ${names ? names[i] : i + 1}: <b>${c}</b></span>`).join(" ")} → r = <b>${s.r}</b></p>`;
    if (!s.r) return out + verdict(false, "", "Some coordinate is uncovered: Shearer does not apply yet.");
    out += table(["view", m("|\\mathcal F_A|"), m("H(X_A)")], s.parts.map((p) => [setName(p.set, names), cnt(BigInt(p.size)), ctx.fH(p.H)]));
    out += bars([{ label: `${s.r}·H(X)`, bits: s.rH }, { label: "Σ H(X_A)", bits: s.sumH }, { label: "Σ log|F_A|", bits: s.sumLog }], ctx);
    out += verdict(s.entropyHolds, `${m(`${s.r}H(X)\\le\\sum_jH(X_{A_j})`)}: ${ctx.fH(s.rH)} ≤ ${ctx.fH(s.sumH)}.`, "Violated (this cannot happen).");
    out += `<p>Counting form: ${m(`|\\mathcal F|^{${s.r}}`)} = ${cnt(s.lhs)} ≤ ${m("\\prod_j|\\mathcal F_{A_j}|")} = ${cnt(s.rhs)}${s.tight ? " — <b>tight</b>" : ""}. So ${m("|\\mathcal F|")} = ${cnt(s.size)} ≤ ${f(s.bound, 5)} (entropy) ≤ ${f(s.countBound, 5)} (shadows).</p>`;
    return out;
  }
  W.cover = {
    init: (o) => ({ fam: o.family || "cyclic-no-adjacent", cov: o.cover || "cycle", sets: Ls.COVERS4[o.cover || "cycle"].sets.map((s) => s.slice()) }),
    controls: (st) => select("fam", "Family", Object.entries(Ls.FAMILY4).map(([k, v]) => [k, v.label]), st.fam) + select("cov", "Cover", [...Object.entries(Ls.COVERS4).map(([k, v]) => [k, v.label]), ["custom", "Custom (edit below)"]], st.cov),
    view(st, ctx) {
      const F = Ls.FAMILY4[st.fam].make(), s = st.sets.length ? E.shearer(F, st.sets, 4) : null, cov = s ? s.coverage : [0, 0, 0, 0];
      let out = `<div class="split"><div>${coverSvg(st.sets, 4, cov, `Coordinates 1 to 4 with ${st.sets.length} covering regions; coverage ${cov.join(", ")}`)}</div><div>`;
      out += `<div class="chips">${F.map((t) => `<span class="chip">${t.join("")}</span>`).join("")}</div><p class="small muted">${F.length} objects in ${esc(Ls.FAMILY4[st.fam].label.toLowerCase())}.</p>`;
      out += `<div class="tablewrap"><table class="memb"><caption class="sr">Membership of coordinates in each subset</caption><thead><tr><th scope="col">set</th>${E.range(4).map((i) => `<th scope="col">${i + 1}</th>`).join("")}<th></th></tr></thead><tbody>${st.sets.map((A, j) => `<tr><th scope="row"><span class="sw r${j % 6}" aria-hidden="true"></span>A${sub(j)}</th>${E.range(4).map((i) => `<td><button type="button" class="cell" data-act="mem" data-arg="${j}|${i}" aria-pressed="${A.includes(i)}" aria-label="Coordinate ${i + 1} in A${j + 1}">${A.includes(i) ? "■" : ""}</button></td>`).join("")}<td><button type="button" class="x" data-act="delset" data-arg="${j}" aria-label="Remove A${j + 1}">×</button></td></tr>`).join("")}</tbody></table></div>${btn("addset", "Add a subset", "", st.sets.length >= 6 ? "disabled" : "")}</div></div>`;
      return out + shearerReadout(F, st.sets, 4, ctx);
    },
    act: {
      mem(st, arg, ctx) { const [j, i] = arg.split("|").map(Number); const A = st.sets[j]; const k = A.indexOf(i); if (k >= 0) A.splice(k, 1); else { A.push(i); A.sort(); } st.cov = "custom"; announceCover(st.sets, 4, ctx); },
      addset(st) { st.sets.push([]); st.cov = "custom"; },
      delset(st, arg, ctx) { st.sets.splice(+arg, 1); st.cov = "custom"; announceCover(st.sets, 4, ctx); },
    },
    change(st, k) { if (k === "cov" && st.cov !== "custom") st.sets = Ls.COVERS4[st.cov].sets.map((s) => s.slice()); },
    budget(st) { const s = E.shearer(Ls.FAMILY4[st.fam].make(), st.sets, 4); return { rows: [{ label: `${s.r}·H(X)`, bits: s.rH }, { label: "Σ H(X_A)", bits: s.sumH }] }; },
    ledger(st) { const s = E.shearer(Ls.FAMILY4[st.fam].make(), st.sets, 4); return s.r ? [{ rel: "", tex: `${s.r}\\log|\\mathcal F|=${s.r}H(X)`, why: "uniform", bits: s.rH }, { rel: "≤", tex: "\\sum_jH(X_{A_j})", why: "Shearer", bits: s.sumH }, { rel: "≤", tex: "\\sum_j\\log|\\mathcal F_{A_j}|", why: "support bound", bits: s.sumLog }] : []; },
  };
  const WORDS = ["zero", "once", "twice", "three times", "four times", "five times", "six times"];
  function announceCover(sets, n, ctx) {
    const cov = E.range(n).map((i) => sets.filter((A) => A.includes(i)).length), r = Math.min(...cov);
    ctx.say(r ? `Every coordinate is now covered at least ${WORDS[r] || r + " times"}. Shearer's inequality applies with r equals ${r}.` : `Coordinate ${cov.indexOf(0) + 1} is not covered yet.`);
  }

  /* ---------- the Shearer cover builder: five coordinates, drag to paint ---------- */
  const FAMILY5 = { "no-adjacent": "No two adjacent ones", "cyclic-no-adjacent": "No two cyclically adjacent ones", "even-weight": "Even weight", "all-binary": "All of {0,1}⁵ (tight with any exact cover)" };
  W.builder = {
    init: () => ({ fam: "no-adjacent", sets: [[0, 1, 2], [1, 2, 3], [2, 3, 4]], paint: null }),
    controls: (st) => select("fam", "Family on five coordinates", Object.entries(FAMILY5), st.fam) + `<p class="small muted">Press or drag across coordinates to add them to a subset; press again to remove.</p>`,
    view(st, ctx) {
      const F = E.family(st.fam, 5), cov = E.range(5).map((i) => st.sets.filter((A) => A.includes(i)).length);
      let out = `<div class="builder" data-paintzone="1">${st.sets.map((A, j) => `<div class="brow"><span class="bname"><span class="sw r${j % 6}" aria-hidden="true"></span>A${sub(j)}</span>${E.range(5).map((i) => `<button type="button" class="bchip ${A.includes(i) ? "on r" + (j % 6) : ""}" data-paint="${j}|${i}" aria-pressed="${A.includes(i)}" aria-label="Coordinate ${i + 1} in A${j + 1}">${i + 1}</button>`).join("")}<button type="button" class="x" data-act="delset" data-arg="${j}" aria-label="Remove A${j + 1}">×</button></div>`).join("")}` +
        `<div class="brow cov"><span class="bname">coverage</span>${cov.map((c) => `<span class="bcov ${c ? "" : "zero"}">${c}</span>`).join("")}</div></div>` +
        `<div class="row">${btn("addset", "Add a subset", "", st.sets.length >= 8 ? "disabled" : "")}${btn("preset", "Sliding triples", "triples")}${btn("preset", "Cyclic pairs", "pairs")}${btn("preset", "Singletons", "singles")}</div>`;
      out += `<div class="split"><div>${coverSvg(st.sets, 5, cov, `Five coordinates with ${st.sets.length} subsets`)}</div><div>${shearerReadout(F, st.sets, 5, ctx)}</div></div>`;
      const r = st.sets.length ? Math.min(...cov) : 0;
      if (r) { const s = E.shearer(F, st.sets, 5); out += `<p>${m(`H(X)\\le\\frac1{${r}}\\sum_jH(X_{A_j})`)}: ${ctx.fH(s.H)} ≤ ${ctx.fH(s.sumH / r)}.</p>`; }
      return out;
    },
    act: {
      paint(st, arg, ctx) { const [j, i] = arg.split("|").map(Number); const A = st.sets[j]; if (!A) return; const k = A.indexOf(i); if (st.paint === null) st.paint = k < 0; if (st.paint && k < 0) { A.push(i); A.sort(); } if (!st.paint && k >= 0) A.splice(k, 1); announceCover(st.sets, 5, ctx); },
      endpaint(st) { st.paint = null; },
      addset(st) { st.sets.push([]); },
      delset(st, arg, ctx) { st.sets.splice(+arg, 1); announceCover(st.sets, 5, ctx); },
      preset(st, arg, ctx) { st.sets = arg === "triples" ? [[0, 1, 2], [1, 2, 3], [2, 3, 4], [3, 4, 0], [4, 0, 1]] : arg === "pairs" ? E.range(5).map((i) => [i, (i + 1) % 5].sort()) : E.range(5).map((i) => [i]); announceCover(st.sets, 5, ctx); },
    },
    ledger(st) { const s = E.shearer(E.family(st.fam, 5), st.sets, 5); return s.r ? [{ rel: "", tex: `${s.r}H(X)`, why: "uniform", bits: s.rH }, { rel: "≤", tex: "\\sum_jH(X_{A_j})", why: "Shearer", bits: s.sumH }, { rel: "≤", tex: "\\sum_j\\log|\\mathcal F_{A_j}|", why: "support bound", bits: s.sumLog }] : []; },
  };

  /* ---------- projections of lattice points (combinatorial Shearer, Loomis–Whitney, projection lab) ---------- */
  W.grid3 = {
    init: (o) => ({ d: 3, m: 2, pts: Ls.POINTS3[o.preset || "staircase"].pts().map((p) => p.slice()), preset: o.preset || "staircase", lab: !!o.lab }),
    controls(st) {
      return (st.lab ? select("d", "Dimension", [[2, "d = 2"], [3, "d = 3"]], st.d) : "") + select("m", "Coordinates run 0…m, m =", [[1, "1"], [2, "2"], [3, "3"]], st.m) +
        select("preset", "Preset", [...Object.entries(Ls.POINTS3).map(([k, v]) => [k, v.label]), ["custom", "Custom"]], st.preset) + `<div class="row">${btn("clear", "Clear")}${btn("fill", "Fill the box")}</div>`;
    },
    view(st, ctx) {
      const d = st.d, M = st.m, S = E.uniq(st.pts.filter((p) => p.length === d && p.every((v) => v <= M)));
      const has = new Set(S.map(key));
      const grid2 = (z) => `<div class="lat" style="--n:${M + 1}" role="group" aria-label="${d === 3 ? `Slice z = ${z}` : "Points"}">${E.range(M + 1).reverse().map((y) => E.range(M + 1).map((x) => { const p = d === 3 ? [x, y, z] : [x, y]; const on = has.has(key(p)); return `<button type="button" class="lp" data-act="pt" data-arg="${p.join(",")}" aria-pressed="${on}" aria-label="Point (${p.join(", ")})">${on ? "●" : ""}</button>`; }).join("")).join("")}</div>`;
      let out = `<div class="slices">${d === 3 ? E.range(M + 1).map((z) => `<div><div class="small">z = ${z}</div>${grid2(z)}</div>`).join("") : `<div>${grid2(0)}</div>`}</div>`;
      const names = d === 3 ? ["xy", "xz", "yz"] : ["x", "y"];
      const keepSets = d === 3 ? [[0, 1], [0, 2], [1, 2]] : [[0], [1]];
      const shadow = (keep, label) => {
        const P = new Set(S.map((p) => keep.map((i) => p[i]).join(",")));
        if (keep.length === 1) return `<div class="shadow"><div class="small">${label}: ${P.size}</div><div class="lat mini" style="--n:${M + 1}" aria-hidden="true">${E.range(M + 1).map((a) => `<span class="${P.has(String(a)) ? "on" : ""}"></span>`).join("")}</div></div>`;
        return `<div class="shadow"><div class="small">π<sub>${label}</sub>: ${P.size}</div><div class="lat mini" style="--n:${M + 1}" aria-hidden="true">${E.range(M + 1).reverse().map((b) => E.range(M + 1).map((a) => `<span class="${P.has(`${a},${b}`) ? "on" : ""}"></span>`).join("")).join("")}</div></div>`;
      };
      if (d === 3) out += iso(S, M);
      out += `<div class="shadows">${keepSets.map((k, i) => shadow(k, names[i])).join("")}</div>`;
      const w = E.loomisWhitney(S, d), sh = E.shearer(S, keepSets, d);
      out += table(["quantity", "value"], [["|S|", `<b>${w.size}</b>`], ...w.proj.slice().reverse().map((p, i) => [`|π<sub>${names[i]}</sub>(S)|`, String(w.proj[d - 1 - i].size)])]);
      if (S.length) {
        out += `<p>Loomis–Whitney: ${m(`|S|^{${d - 1}}`)} = ${cnt(w.lhs)} ≤ ${m("\\prod_i|\\pi_i(S)|")} = ${cnt(w.rhs)}${w.tight ? " — <b>tight (a box)</b>" : ""}; so |S| ≤ ${f(w.bound, 5)}.</p>`;
        out += `<p>Shearer (entropy): ${m(`${d - 1}H(X)`)} = ${ctx.fH(sh.rH)} ≤ ${m("\\sum_iH(\\pi_iX)")} = ${ctx.fH(sh.sumH)} ≤ ${m("\\sum_i\\log|\\pi_iS|")} = ${ctx.fH(sh.sumLog)}.</p>`;
        out += ledgerHtml(W.grid3.ledger(st), ctx);
      }
      return out;
    },
    act: {
      pt(st, arg, ctx) { const p = arg.split(",").map(Number), k = st.pts.findIndex((q) => key(q) === key(p)); if (k >= 0) st.pts.splice(k, 1); else st.pts.push(p); st.preset = "custom"; const w = E.loomisWhitney(E.uniq(st.pts.filter((q) => q.length === st.d && q.every((v) => v <= st.m))), st.d); ctx.say(`${k >= 0 ? "Removed" : "Added"} point (${p.join(", ")}). |S| = ${w.size}; shadows ${w.proj.map((x) => x.size).join(", ")}.`); },
      clear(st) { st.pts = []; st.preset = "custom"; },
      fill(st) { st.pts = E.product(new Array(st.d).fill(st.m + 1)); st.preset = "custom"; },
    },
    change(st, k) {
      if (k === "preset" && st.preset !== "custom") { st.d = 3; st.pts = Ls.POINTS3[st.preset].pts().map((p) => p.slice()); st.m = Math.max(1, ...st.pts.flat()); }
      if (k === "d") { st.d = +st.d; st.pts = st.d === 2 ? E.uniq(st.pts.map((p) => p.slice(0, 2))) : st.pts.map((p) => (p.length === 2 ? [...p, 0] : p)); st.preset = "custom"; }
      if (k === "m") st.m = +st.m;
    },
    S: (st) => E.uniq(st.pts.filter((p) => p.length === st.d && p.every((v) => v <= st.m))),
    budget(st) { const S = W.grid3.S(st), w = E.loomisWhitney(S, st.d); return { rows: [{ label: `${st.d - 1}·H(X)`, bits: w.lhsH }, { label: "Σ H(πᵢX)", bits: w.sumH }, { label: "Σ log|πᵢS|", bits: w.sumLog }] }; },
    ledger(st) { const S = W.grid3.S(st), w = E.loomisWhitney(S, st.d); return [{ rel: "", tex: `${st.d - 1}\\log|S|=${st.d - 1}H(X)`, why: "uniform", bits: w.lhsH }, { rel: "≤", tex: "\\sum_iH(\\pi_iX)", why: `Shearer, r = ${st.d - 1}`, bits: w.sumH }, { rel: "≤", tex: "\\sum_i\\log|\\pi_i(S)|", why: "support bound", bits: w.sumLog }]; },
  };
  /* An isometric picture of the points (the slices and counts above are the accessible view). */
  function iso(S, M) {
    const u = 26, P = (x, y, z) => [130 + (x - y) * u * 0.87, 150 + (x + y) * u * 0.5 - z * u];
    let g = "";
    for (let a = 0; a <= M; a++) { const [x1, y1] = P(a, 0, 0), [x2, y2] = P(a, M, 0), [x3, y3] = P(0, a, 0), [x4, y4] = P(M, a, 0); g += `<line class="axis" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="axis" x1="${x3}" y1="${y3}" x2="${x4}" y2="${y4}"/>`; }
    const pts = S.slice().sort((p, q) => p[0] + p[1] - q[0] - q[1] || p[2] - q[2]).map((p) => { const [x, y] = P(p[0], p[1], p[2]); return `<circle class="hot" cx="${x}" cy="${y}" r="6"/>`; }).join("");
    return `<svg class="iso" viewBox="0 0 260 ${190}" aria-hidden="true">${g}${pts}</svg>`;
  }

  /* ---------- the Boolean cube ---------- */
  W.cube = {
    init: (o) => ({ n: o.n || 3, set: (o.set || []).slice() }),
    controls: (st) => select("n", "Dimension", [[3, "n = 3"], [4, "n = 4"]], st.n) + `<div class="row">${btn("preset", "Subcube", "sub")}${btn("preset", "All", "all")}${btn("preset", "Clear", "none")}</div>`,
    view(st, ctx) {
      const n = st.n, A = st.set.filter((v) => v < 1 << n), r = E.cubeEdges(A, n), on = new Set(A);
      const lab = (v) => E.range(n).map((b) => (v >> (n - 1 - b)) & 1).join("");
      let pic = "";
      if (n === 3) {
        const pos = (v) => [70 + 120 * (v & 1) + 50 * ((v >> 2) & 1), 190 - 120 * ((v >> 1) & 1) - 50 * ((v >> 2) & 1)];
        let lines = "";
        for (let v = 0; v < 8; v++) for (let b = 0; b < 3; b++) { const u = v ^ (1 << b); if (u > v) { const [a1, a2] = pos(v), [b1, b2] = pos(u); lines += `<line class="${on.has(u) && on.has(v) ? "in" : "axis"}" x1="${a1}" y1="${a2}" x2="${b1}" y2="${b2}"/>`; } }
        pic = `<svg class="cubepic" viewBox="0 0 280 230" aria-hidden="true">${lines}${E.range(8).map((v) => { const [x, y] = pos(v); return `<circle class="${on.has(v) ? "hot" : "node"}" cx="${x}" cy="${y}" r="9"/>`; }).join("")}</svg>`;
      }
      const toggles = `<div class="chips">${E.range(1 << n).map((v) => toggle("v", v, on.has(v), lab(v), `Vertex ${lab(v)}`)).join("")}</div>`;
      return `<div class="split"><div>${pic}</div><div>${toggles}</div></div>` + table(["", "value"], [["|A|", String(r.size)], ["edges inside A, e(A)", `<b>${r.count}</b>`], [m("\\tfrac12|A|\\log_2|A|"), f(r.bound, 5)], ["shadows (delete one bit)", r.projections.join(", ")]]) +
        verdict(r.holds, r.tight ? "Tight: A is a subcube." : `${m("e(A)\\le\\tfrac12|A|\\log_2|A|")} holds with slack ${f(r.bound - r.count, 4)}.`, "Violated (this cannot happen).") +
        `<p class="small">Entropy reading: ${m("\\sum_iH(X_i\\mid X_{-i})")} = 2e(A)/|A| = ${ctx.fH(r.size ? (2 * r.count) / r.size : 0)} ≤ ${m("H(X)")} = ${ctx.fH(r.size ? Math.log2(r.size) : 0)}.</p>`;
    },
    act: {
      v(st, arg, ctx) { const v = +arg, k = st.set.indexOf(v); if (k >= 0) st.set.splice(k, 1); else st.set.push(v); const r = E.cubeEdges(st.set, st.n); ctx.say(`|A| = ${r.size}, ${r.count} edges inside.`); },
      preset(st, arg) { st.set = arg === "all" ? E.range(1 << st.n) : arg === "sub" ? [0, 1, 2, 3] : []; },
    },
    change(st, k) { if (k === "n") { st.n = +st.n; st.set = st.set.filter((v) => v < 1 << st.n); } },
  };

  /* ---------- data processing: forget coordinates ---------- */
  W.forget = {
    init: (o) => ({ fam: o.family || "permutations", keep: (o.keep || [0, 1]).slice() }),
    controls: (st) => select("fam", "Family", famOptions, st.fam),
    view(st, ctx) {
      const F = FAMILY_MENU[st.fam][1](), n = E.dims(F), keep = st.keep.filter((i) => i < n), r = E.forget(F, keep);
      const groups = new Map(); for (const t of F) { const k2 = keep.map((i) => t[i]).join(""); if (!groups.has(k2)) groups.set(k2, []); groups.get(k2).push(t); }
      return `<div class="row" role="group" aria-label="Coordinates kept">${E.range(n).map((i) => toggle("keep", i, keep.includes(i), `keep ${xs(i)}`)).join("")}</div>` +
        `<div class="fibres">${[...groups.entries()].map(([k2, ts]) => `<div class="fibre"><span class="img">${k2 || "·"}</span>${ts.map((t) => `<span class="chip">${t.join("")}</span>`).join("")}</div>`).join("")}</div>` +
        `<p>${F.length} objects collapse onto <b>${r.image}</b> images. ${m("H(f(X))")} = ${ctx.fH(r.Himage)} ≤ ${m("H(X)")} = ${ctx.fH(r.H)}; the difference ${ctx.fH(r.H - r.Himage)} is ${m("H(X\\mid f(X))")}, the average log fibre size.</p>` +
        bars([{ label: "H(X)", bits: r.H }, { label: "H(f(X))", bits: r.Himage }], ctx);
    },
    act: { keep(st, arg) { const i = +arg, k = st.keep.indexOf(i); if (k >= 0) st.keep.splice(k, 1); else st.keep.push(i); st.keep.sort(); } },
    change(st, k) { if (k === "fam") st.keep = [0]; },
  };

  /* ---------- Han averages ---------- */
  W.han = {
    init: (o) => ({ fam: o.family || "cyclic-no-adjacent" }),
    controls: (st) => select("fam", "Family", Object.entries(Ls.FAMILY4).map(([k, v]) => [k, v.label]), st.fam),
    view(st, ctx) {
      const r = E.han(Ls.FAMILY4[st.fam].make());
      return r.map((x) => `<h4>k = ${x.k}: average ${m("H(X_A)/k")} = ${ctx.fH(x.perCoord)}</h4><div class="chips">${x.subsets.map((s) => `<span class="chip">${setName(s.set)}: ${ctx.fH(s.H)}</span>`).join("")}</div>`).join("") +
        bars(r.map((x) => ({ label: `h${sub(x.k - 1)}`, bits: x.perCoord })), ctx, 1) +
        verdict(r.every((x, i) => !i || x.perCoord <= r[i - 1].perCoord + 1e-9), "Non-increasing in k: the information per observed coordinate falls as views grow.", "Not monotone (this cannot happen).");
    },
  };

  /* ---------- fractional covers, hypergraphs and cover optimisation ---------- */
  const NAMES3 = ["x", "y", "z"];
  const WSETS3 = [[0, 1], [0, 2], [1, 2], [0], [1], [2], [0, 1, 2]];
  W.fractional = {
    init(o) {
      if (o.mode === "hypergraph") return { mode: "hypergraph", fam: "cyclic-no-adjacent", w: Ls.HYPEREDGES.map((_, i) => (i < 4 ? 0.5 : 0)) };
      if (o.mode === "candidates") return { mode: "candidates", preset: "staircase", pick: "lw" };
      return { mode: "weights", preset: "staircase", w: WSETS3.map((_, i) => (i < 3 ? 0.5 : 0)) };
    },
    controls(st) {
      if (st.mode === "hypergraph") return select("fam", "Family", Object.entries(Ls.FAMILY4).map(([k, v]) => [k, v.label]), st.fam);
      return select("preset", "Point set", Object.entries(Ls.POINTS3).map(([k, v]) => [k, v.label]), st.preset);
    },
    view(st, ctx) {
      if (st.mode === "candidates") {
        const S = Ls.POINTS3[st.preset].pts(), b = E.bestCover(S, Ls.COVER_CANDIDATES, 3);
        return `<div class="cands" role="radiogroup" aria-label="Candidate covers">${b.scored.map((c) => `<button type="button" class="cand ${b.best && b.best.id === c.id ? "best" : ""}" role="radio" aria-checked="${st.pick === c.id}" data-act="pick" data-arg="${c.id}"><span>${esc(c.label)}</span><span>${c.result.valid ? `|S| ≤ <b>${f(c.result.countBound, 5)}</b>` : "not a cover"}</span>${b.best && b.best.id === c.id ? `<span class="tag">best</span>` : ""}</button>`).join("")}</div>` +
          `<p>|S| = <b>${S.length}</b>. Current: ${(() => { const c = b.scored.find((x) => x.id === st.pick); return c.result.valid ? `bound ${f(c.result.countBound, 5)}, entropy bound ${ctx.fH(c.result.entropyBound)} vs ${m("H(X)")} = ${ctx.fH(c.result.H)}` : "invalid: some coordinate has total weight below 1"; })()}. Best among the supplied candidates: <b>${b.best ? esc(b.best.label) : "none"}</b>.</p>`;
      }
      const hyper = st.mode === "hypergraph";
      const F = hyper ? Ls.FAMILY4[st.fam].make() : Ls.POINTS3[st.preset].pts(), n = hyper ? 4 : 3, sets = hyper ? Ls.HYPEREDGES : WSETS3;
      const names = hyper ? null : NAMES3, weights = sets.map((s, i) => ({ set: s, w: st.w[i] })).filter((e) => e.w > 0);
      const r = E.fractionalCover(F, weights, n);
      let out = `<div class="wlist">${sets.map((s, i) => `<div class="wrow">${stepper(`w.${i}`, `α ${setName(s, names)}`, st.w[i], 0, 2, 0.25, f(st.w[i], 2))}<span class="small">|F<sub>A</sub>| = ${E.projSize(F, s)}, H = ${ctx.fH(E.Hproj(F, s))}</span></div>`).join("")}</div>`;
      if (hyper) {
        const P = NODE4;
        out += `<svg class="cover" viewBox="0 0 300 300" role="img" aria-label="Hypergraph on four coordinates with edge weights ${esc(Ls.HYPEREDGES.map((e, i) => `${setName(e)} ${st.w[i]}`).join(", "))}">${Ls.HYPEREDGES.map((e, i) => (st.w[i] > 0 ? `<line class="reg r${i % 6}" x1="${P[e[0]][0]}" y1="${P[e[0]][1]}" x2="${P[e[1]][0]}" y2="${P[e[1]][1]}" style="stroke-width:${4 + 16 * st.w[i]}px"/>` : `<line class="axis dash" x1="${P[e[0]][0]}" y1="${P[e[0]][1]}" x2="${P[e[1]][0]}" y2="${P[e[1]][1]}"/>`)).join("")}${P.map((p, i) => `<circle class="node" cx="${p[0]}" cy="${p[1]}" r="18"/><text x="${p[0]}" y="${p[1] + 5}" text-anchor="middle">${i + 1}</text>`).join("")}</svg>`;
      }
      out += `<h4>Coverage</h4><div class="covbars">${r.coverage.map((c, i) => `<div class="covbar"><span class="lab">${hyper ? `vertex ${i + 1}` : `coordinate ${NAMES3[i]}`}</span><span class="track">${weights.filter((e) => e.set.includes(i)).map((e) => `<span class="layer r${sets.findIndex((s) => key(s) === key(e.set)) % 6}" style="width:${(50 * e.w).toFixed(2)}%"></span>`).join("")}<span class="one" aria-hidden="true"></span></span><b>${f(c, 3)}</b>${c >= 1 - 1e-9 ? "" : " (below 1)"}</div>`).join("")}</div>`;
      out += r.valid ? verdict(true, `Valid fractional cover. ${hyper ? "Objective" : "Bound"} ${m("\\sum_A\\alpha_A\\log|\\mathcal F_A|")} = ${ctx.fH(r.logBound)}, so |F| = ${cnt(r.size)} ≤ <b>${f(r.countBound, 5)}</b>; entropy form ${m("\\sum\\alpha_AH(X_A)")} = ${ctx.fH(r.entropyBound)} ≥ ${m("H(X)")} = ${ctx.fH(r.H)}.`, "")
        : verdict(false, "", `Not yet a cover: every ${hyper ? "vertex" : "coordinate"} needs total weight at least 1 before the inequality applies.`);
      return out;
    },
    act: { pick(st, arg) { st.pick = arg; } },
    step(st, k, d) { const i = +k.split(".")[1]; st.w[i] = clamp(Math.round((st.w[i] + d) * 4) / 4, 0, 2); },
  };

  /* ---------- bipartite matchings, Bregman and the random reveal ---------- */
  W.matching = {
    init: (o) => ({ preset: o.preset || "c6", adj: Ls.MATCHINGS[o.preset || "c6"].adj.map((r) => r.slice()), sel: 0, order: 0, shown: 0, focus: 0, lab: !!o.lab, reveal: !!o.reveal, bound: o.bound !== false }),
    controls(st) {
      return select("preset", "Graph", [...Object.entries(Ls.MATCHINGS).map(([k, v]) => [k, v.label]), ...(st.lab ? [["custom", "Custom (edit the matrix)"]] : [])], st.preset) +
        (st.lab ? `<div class="row">${btn("size", "3 × 3", "3")}${btn("size", "4 × 4", "4")}${btn("size", "5 × 5", "5")}</div>` : "");
    },
    view(st, ctx) {
      const adj = st.adj, n = adj.length, Ms = E.perfectMatchings(adj), b = E.bregman(adj);
      const M = Ms.length ? Ms[st.sel % Ms.length] : null, orders = E.permutations(n), order = orders[st.order % orders.length];
      const traj = M ? E.revealTrajectory(adj, M, order) : null, shown = traj ? traj.steps.slice(0, st.shown) : [];
      const taken = new Set(shown.map((s) => s.partner)), cur = traj && st.shown < n ? traj.steps[st.shown] : null;
      const H0 = 60 + 52 * (n - 1), Lx = 70, Rx = 270, y = (i) => 40 + 52 * i;
      let svg = `<svg class="bip" viewBox="0 0 340 ${H0 + 20}" role="img" aria-label="Bipartite graph with ${n} left and ${n} right vertices; ${Ms.length} perfect matchings">`;
      adj.forEach((row, i) => row.forEach((j) => {
        const inM = M && M[i] === j, rev = shown.some((s) => s.vertex === i);
        const cls = st.reveal ? (rev && inM ? "medge" : cur && cur.vertex === i && !taken.has(j) ? "avail" : taken.has(j) && !inM ? "gone" : "edge") : inM ? "medge" : "edge";
        svg += `<line class="${cls}" x1="${Lx}" y1="${y(i)}" x2="${Rx}" y2="${y(j)}"/>`;
      }));
      for (let i = 0; i < n; i++) {
        svg += `<circle class="node ${st.reveal && cur && cur.vertex === i ? "hotring" : ""}" cx="${Lx}" cy="${y(i)}" r="16"/><text x="${Lx}" y="${y(i) + 5}" text-anchor="middle">L${i + 1}</text><text class="small" x="${Lx - 32}" y="${y(i) + 5}" text-anchor="middle">d=${adj[i].length}</text>`;
        svg += `<circle class="node ${st.reveal && taken.has(i) ? "taken" : ""}" cx="${Rx}" cy="${y(i)}" r="16"/><text x="${Rx}" y="${y(i) + 5}" text-anchor="middle">R${i + 1}</text>`;
      }
      svg += "</svg>";
      let out = `<div class="split"><div>${svg}</div><div>`;
      if (st.lab) out += `<div class="tablewrap"><table class="memb"><caption>Adjacency (press to toggle an edge)</caption><thead><tr><th></th>${E.range(n).map((j) => `<th scope="col">R${j + 1}</th>`).join("")}</tr></thead><tbody>${adj.map((row, i) => `<tr><th scope="row">L${i + 1}</th>${E.range(n).map((j) => `<td><button type="button" class="cell" data-act="edge" data-arg="${i}|${j}" aria-pressed="${row.includes(j)}" aria-label="Edge L${i + 1} R${j + 1}">${row.includes(j) ? "■" : ""}</button></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      out += `<p>Perfect matchings: <b>${cnt(b.permanent)}</b> = per(A). ${M ? `Showing matching ${(st.sel % Ms.length) + 1}: ${M.map((j, i) => `L${i + 1}–R${j + 1}`).join(", ")}.` : "None: the bound is vacuous."}</p>` +
        (Ms.length > 1 ? `<div class="row">${btn("msel", "Previous matching", "-1")}${btn("msel", "Next matching", "1")}</div>` : "") + `</div></div>`;
      if (st.bound) {
        out += table(["left vertex", "degree d", m("(d!)^{1/d}"), m("\\log_2(d!)/d")], b.rows.map((r, i) => [`L${i + 1}`, String(r.d), f(r.factor, 5), ctx.fH(r.bits)]));
        out += `<p>Bregman: per(A) = <b>${cnt(b.permanent)}</b> ≤ ${m("\\prod_i(d_i!)^{1/d_i}")} = <b>${f(b.bound, 5)}</b>${b.tight ? " — <b>tight</b>" : ""}; naive ${m("\\prod_id_i")} = ${cnt(b.naive)}.</p>`;
      }
      if (st.reveal && M) {
        out += `<h4>Random reveal: order ${(st.order % orders.length) + 1} of ${orders.length}, ${order.map((i) => `L${i + 1}`).join(" → ")}</h4>` +
          `<div class="row">${btn("rstep", "Reveal next vertex", "", st.shown >= n ? "disabled" : "")}${btn("rrun", "Run random reveal")}${btn("rnext", "Next order")}${btn("rreset", "Reset")}</div>` +
          table(["step", "vertex", "free neighbours N", "log N"], traj.steps.map((s, p) => ({ cls: p < st.shown ? "on" : p === st.shown ? "cur" : "faded", cells: [String(p + 1), `L${s.vertex + 1}`, p <= st.shown ? `${s.N} of ${s.degree}: ${s.available.map((j) => "R" + (j + 1)).join(", ")}` : "?", p < st.shown ? ctx.fH(s.bits) : "—"] })));
        const sumShown = shown.reduce((a, s) => a + s.bits, 0);
        out += `<p>This trajectory pays ${ctx.fH(sumShown)} so far${st.shown === n ? ` (total ${ctx.fH(traj.bits)})` : ""}; the entropy is ${m("H(M)=\\log\\operatorname{per}A")} = ${ctx.fH(b.H)}, and the average over orders is at most ${ctx.fH(b.bits)}.</p>`;
        out += W.matching.averaging(st, ctx);
      }
      return out;
    },
    /* Over every order (and every matching), N_i is uniform on 1..d_i: the averaging identity. */
    averaging(st, ctx) {
      const adj = st.adj, i = st.focus % adj.length, a = E.revealAverages(adj), row = a.rows[i], d = row.d, id = E.averagingIdentity(d);
      const tot = row.hist.reduce((x, y) => x + y, 0) || 1;
      return `<h4>Averaging over all ${a.orders} reveal orders and ${a.matchings} matchings</h4>${select("focus", "Vertex", adj.map((_, k) => [k, `L${k + 1} (d = ${adj[k].length})`]), i)}` +
        `<div class="hist" role="img" aria-label="Distribution of free neighbours for L${i + 1}: ${row.hist.slice(1).map((c, v) => `${v + 1}: ${c}`).join(", ")}">${row.hist.slice(1).map((c, v) => `<div class="hb"><span style="height:${(100 * c * d) / tot / 1.5}%"></span><small>N=${v + 1}</small></div>`).join("")}</div>` +
        verdict(a.uniformEveryMatching, `For every matching, N is uniform on {1, …, d}: each value in exactly 1/d of the orders.`, "Not uniform (this cannot happen).") +
        `<p>${m("\\frac1d\\sum_{k=1}^d\\log k=\\frac{\\log(d!)}d")}: ${id.terms.map((t) => f(E.inUnit(t, ctx.unit), 3)).join(" + ")} over ${d} = <b>${ctx.fH(id.average)}</b> = ${m(`\\log_2(${d}!)/${d}`)}; exponentiated, ${m(`(${d}!)^{1/${d}}`)} = ${f(id.factor, 5)}.</p>`;
    },
    act: {
      msel(st, arg) { st.sel = Math.max(0, st.sel + +arg + 1000) % 1000; st.shown = 0; },
      rstep(st, _, ctx) {
        const adj = st.adj, Ms = E.perfectMatchings(adj); if (!Ms.length || st.shown >= adj.length) return;
        const order = E.permutations(adj.length)[st.order % E.permutations(adj.length).length], s = E.revealTrajectory(adj, Ms[st.sel % Ms.length], order).steps[st.shown];
        st.shown++;
        ctx.say(`L${s.vertex + 1} revealed, matched to R${s.partner + 1}. It had ${s.N} free neighbours of ${s.degree}; contribution ${ctx.fH(s.bits)}.`);
      },
      rrun(st, _, ctx) { st.order = (st.order + 1) % E.permutations(st.adj.length).length; st.shown = 0; ctx.play("rstep", st.adj.length); },
      rnext(st) { st.order = (st.order + 1) % E.permutations(st.adj.length).length; st.shown = 0; },
      rreset(st) { st.shown = 0; },
      edge(st, arg) { const [i, j] = arg.split("|").map(Number), r = st.adj[i], k = r.indexOf(j); if (k >= 0) { if (r.length > 1) r.splice(k, 1); } else { r.push(j); r.sort(); } st.preset = "custom"; st.sel = 0; st.shown = 0; },
      size(st, arg) { const n = +arg; st.adj = E.range(n).map((i) => [i, (i + 1) % n].sort()); st.preset = "custom"; st.sel = 0; st.shown = 0; st.order = 0; st.focus = 0; },
    },
    change(st, k) { if (k === "preset" && st.preset !== "custom") { st.adj = Ls.MATCHINGS[st.preset].adj.map((r) => r.slice()); st.sel = 0; st.shown = 0; st.order = 0; st.focus = 0; } if (k === "focus") st.focus = +st.focus; },
    budget(st) { const b = E.bregman(st.adj); return { rows: [{ label: "H(M) = log per", bits: Math.max(0, b.H) }, { label: "Σ log(dᵢ!)/dᵢ", bits: b.bits }, { label: "Σ log dᵢ", bits: E.log2Big(b.naive) }] }; },
    ledger(st) {
      const b = E.bregman(st.adj); if (b.permanent === 0n) return [];
      return [{ rel: "", tex: "\\log\\operatorname{per}A=H(M)", why: "uniform", bits: b.H }, { rel: "≤", tex: "\\sum_i\\mathbb E\\log N_i", why: "chain rule + support, random order", bits: b.bits },
        { rel: "=", tex: "\\sum_i\\frac{\\log(d_i!)}{d_i}", why: "averaging identity", bits: b.bits }, { rel: "≤", tex: "\\sum_i\\log d_i", why: "naive support bound", bits: E.log2Big(b.naive) }];
    },
  };

  /* ---------- colourings of a path or cycle ---------- */
  W.colour = {
    init: (o) => ({ n: o.n || 5, q: o.q || 3, cycle: false, draws: 0, pick: 0 }),
    controls: (st) => slider("n", "Vertices n", st.n, 2, 8) + slider("q", "Colours q", st.q, 2, 4) + `<div class="row">${toggle("cyc", "", st.cycle, st.cycle ? "Cycle" : "Path", "Cycle instead of path")}${btn("sample", "Sample a colouring")}</div>`,
    view(st, ctx) {
      const F = E.colourings(st.n, st.q, st.cycle), n = st.n;
      if (!F.length) return `<p>No proper colourings.</p>`;
      const c = F[st.pick % F.length], names = ["A", "B", "C", "D"];
      const svg = `<svg class="colour" viewBox="0 0 ${60 * n + 20} 90" role="img" aria-label="${st.cycle ? "Cycle" : "Path"} coloured ${c.map((x) => names[x]).join(" ")}">${E.range(n - 1).map((i) => `<line class="axis" x1="${40 + 60 * i}" y1="40" x2="${100 + 60 * i}" y2="40"/>`).join("")}${st.cycle ? `<path class="axis" d="M40 40 Q ${30 * n + 10} 95 ${40 + 60 * (n - 1)} 40" fill="none"/>` : ""}${c.map((x, i) => `<circle class="col c${x}" cx="${40 + 60 * i}" cy="40" r="18"/><text x="${40 + 60 * i}" y="45" text-anchor="middle">${names[x]}</text>`).join("")}</svg>`;
      const terms = [E.Hproj(F, [0]), ...E.range(n - 1).map((i) => E.Hcond(F, [i + 1], [i]))];
      const bound = Math.log2(st.q) + (n - 1) * Math.log2(st.q - 1), H = Math.log2(F.length);
      return svg + `<p>${F.length} proper colourings (${st.cycle ? `cycle formula ${m("(q-1)^n+(-1)^n(q-1)")} = ${cnt(E.cycleColourCount(n, st.q))}` : `path formula ${m("q(q-1)^{n-1}")} = ${cnt(E.pathColourCount(n, st.q))}`}).</p>` +
        stack(terms.map((t, i) => ({ label: i ? `H(X${sub(i)} | X${sub(i - 1)})` : "H(X₁)", bits: t })), ctx) +
        `<p>${m("H(X)")} = ${ctx.fH(H)} ≤ ${m("\\sum")} local terms = ${ctx.fH(terms.reduce((a, b) => a + b, 0))} ≤ ${m("\\log q+(n-1)\\log(q-1)")} = ${ctx.fH(bound)}${Math.abs(H - bound) < 1e-9 ? " — <b>tight</b>" : ""}.</p>`;
    },
    act: { cyc(st) { st.cycle = !st.cycle; st.pick = 0; }, sample(st) { st.pick = draw(1e6, st.draws++); } },
  };

  /* ---------- descriptions of one object (compression lesson and Encode mode) ---------- */
  W.encode = {
    init: (o) => ({ fam: o.family || "permutations", order: null }),
    controls: (st) => select("fam", "Family", Object.entries(Ls.ENCODE_FAMILIES).map(([k, v]) => [k, v.label]), st.fam),
    view(st, ctx) {
      const F = E.uniq(Ls.ENCODE_FAMILIES[st.fam].make()), n = E.dims(F);
      if (!st.order || st.order.length !== n) st.order = E.range(n);
      const e = E.encodings(F, st.order), max = Math.max(e.naiveTotal, e.fixedIndex, e.marginalTotal, 1);
      let out = `<p>${F.length} objects; ${m("H(X)=\\log|\\mathcal F|")} = <b>${ctx.fH(e.H)}</b>.</p>`;
      out += `<div class="row" role="group" aria-label="Order of the adaptive description">${st.order.map((c, p) => `<span class="ordchip">${xs(c)}${p ? `<button type="button" data-act="swap" data-arg="${p}" aria-label="Describe ${xs(c)} earlier">←</button>` : ""}</span>`).join("")}</div>`;
      out += `<h4>Naive: each coordinate in whole bits</h4>${stack(e.naive.map((b, i) => ({ label: `${xs(i)}: ${b} bits`, bits: b })), ctx, max)}`;
      out += `<h4>Separately, at their entropies ${m("\\sum_iH(X_i)")}</h4>${stack(e.marginal.map((b, i) => ({ label: `H(${xs(i)})`, bits: b })), ctx, max)}`;
      out += `<h4>Adaptive (chain rule) in the order above</h4>${stack(e.chain.map((b, p) => ({ label: `H(${xs(st.order[p])} | earlier)`, bits: b })), ctx, max)}`;
      out += table(["description", "cost"], [["naive coordinates", `${e.naiveTotal} bits`], ["fixed-length index " + m("\\lceil\\log_2|\\mathcal F|\\rceil"), `${e.fixedIndex} bits`], ["Huffman code (average)", ctx.fH(e.avgHuffman) + `, Kraft sum ${f(e.kraft, 4)}`], [m("\\sum_iH(X_i)"), ctx.fH(e.marginalTotal)], ["adaptive " + m("\\sum_iH(X_i\\mid X_{<i})"), `<b>${ctx.fH(e.chainTotal)}</b>`]]);
      out += `<p class="muted">Reorder the coordinates: the adaptive pieces move, but they always add to ${m("H(X)")}. Choosing the random variables is the creative part.</p>`;
      return out;
    },
    act: { swap(st, arg) { const p = +arg; [st.order[p - 1], st.order[p]] = [st.order[p], st.order[p - 1]]; } },
    change(st, k) { if (k === "fam") st.order = null; },
  };

  /* ---------- typical sets ---------- */
  W.typical = {
    init: (o) => ({ n: o.n || 12, p: o.p ?? 0.25, eps: o.eps ?? 0.1 }),
    controls: (st) => slider("n", "n", st.n, 2, 16) + slider("p", "p", st.p, 0.05, 0.95, 0.05) + slider("eps", "band ε", st.eps, 0, 0.5, 0.05),
    view(st, ctx) {
      const t = E.typical(st.n, st.p, st.eps), n = st.n;
      let dots = "";
      if (n <= 10) {
        const all = E.range(1 << n).map((v) => { let k = 0; for (let b = 0; b < n; b++) k += (v >> b) & 1; return k; }).sort((a, b) => a - b);
        const cols = Math.ceil(Math.sqrt(all.length) * 1.6), r = 300 / cols;
        dots = `<svg class="dots" viewBox="0 0 300 ${Math.ceil(all.length / cols) * r + 4}" role="img" aria-label="All ${all.length} strings sorted by number of ones; ${cnt(t.bandCount)} lie in the band">${all.map((k, i) => `<circle class="${Math.abs(k / n - st.p) <= st.eps + 1e-12 ? "hot" : "node"}" style="opacity:${0.35 + (0.65 * k) / n}" cx="${(i % cols) * r + r / 2}" cy="${Math.floor(i / cols) * r + r / 2 + 2}" r="${r * 0.38}"/>`).join("")}</svg><p class="small muted">Every string, ordered by its fraction of ones (darker = more ones); filled dots are in the band.</p>`;
      }
      const maxp = Math.max(...t.layers.map((l) => l.prob));
      const hist = `<div class="hist" role="img" aria-label="Probability of each number of ones">${t.layers.map((l) => `<div class="hb ${l.inBand ? "in" : ""}"><span style="height:${(100 * l.prob) / maxp}%"></span><small>${l.k}</small></div>`).join("")}</div><p class="small muted">Bars: probability of k ones under Bernoulli(${f(st.p, 2)}). Marked bars: ${m("|k/n-p|\\le\\varepsilon")}.</p>`;
      return dots + hist + table(["", "value"], [["strings in the band", `<b>${cnt(t.bandCount)}</b> of ${cnt(t.total)}`], ["probability of the band", f(t.bandProb, 4)], [m("2^{nh(p)}"), f(t.entropyCount, 5)], [m("nh(p)"), ctx.fH(t.nh)]]);
    },
  };

  /* ---------- the simplex of types (method of types, multinomial) ---------- */
  W.simplex = {
    init: (o) => ({ n: o.n || 6, a: o.sel ? o.sel[0] : 2, b: o.sel ? o.sel[1] : 2, table: !!o.table }),
    controls: (st) => slider("n", "Length n", st.n, 1, 12) + stepper("a", "count of a", st.a, 0, st.n) + stepper("b", "count of b", st.b, 0, st.n - st.a),
    view(st, ctx) {
      const n = st.n, a = Math.min(st.a, n), b = Math.min(st.b, n - a), c = n - a - b, T = E.types(n, 3);
      const P = (t) => [20 + (260 * (t[1] + t[2] / 2)) / Math.max(1, n), 240 - (220 * t[2]) / Math.max(1, n)];
      const maxL = Math.max(...T.map((t) => t.log2Exact), 1);
      const svg = `<svg class="simplex" viewBox="0 0 300 260" role="img" aria-label="Simplex of the ${T.length} types of length ${n}"><polygon class="axis" points="20,240 280,240 150,20" fill="none"/>${T.map((t) => { const [x, y] = P(t.parts); const sel = t.parts[0] === a && t.parts[1] === b; return `<circle class="${sel ? "hot" : "node"}" style="opacity:${0.25 + (0.75 * t.log2Exact) / maxL}" cx="${x}" cy="${y}" r="${sel ? 8 : 5}" data-act="type" data-arg="${t.parts[0]}|${t.parts[1]}"/>`; }).join("")}<text x="8" y="255">a</text><text x="282" y="255">b</text><text x="146" y="14">c</text></svg>`;
      const mb = E.multinomialBound([a, b, c]), lower = mb.bound / Math.pow(n + 1, 3);
      let out = `<div class="split"><div>${svg}<p class="small muted">Darker: more strings. Pick a type with the steppers (c = n − a − b) or by tapping a dot.</p></div><div>` +
        table(["type (a, b, c)", `(${a}, ${b}, ${c})`], [["p", `(${[a, b, c].map((x) => f(x / n, 3)).join(", ")})`], ["number of sequences " + m("\\binom{n}{a,b,c}"), `<b>${cnt(mb.exact)}</b>`], [m("H(p)"), ctx.fH(mb.H)], [m("2^{nH(p)}"), f(mb.bound, 5)], [m("2^{nH(p)}/(n+1)^3"), f(lower, 5)], ["types in all", String(T.length)]]) + `</div></div>`;
      if (st.table) out += table(["type", "exact", m("2^{nH}"), "ratio"], T.slice().sort((x, y) => (x.exact < y.exact ? 1 : x.exact > y.exact ? -1 : 0)).slice(0, 8).map((t) => [`(${t.parts.join(",")})`, cnt(t.exact), f(t.bound, 5), f(t.ratio, 3)]));
      return out;
    },
    act: { type(st, arg) { const [a, b] = arg.split("|").map(Number); st.a = a; st.b = b; } },
    change(st) { st.a = Math.min(st.a, st.n); st.b = Math.min(st.b, st.n - st.a); },
  };

  /* ---------- set systems: incidence matrix ---------- */
  W.incidence = {
    init: (o) => ({ n: o.n || 5, sets: o.sets.map((s) => s.slice()) }),
    controls: (st) => `<div class="row">${btn("addset", "Add a set", "", st.sets.length >= 10 ? "disabled" : "")}${btn("preset", "Pairs", "pairs")}${btn("preset", "Everything", "all")}</div>`,
    view(st, ctx) {
      const s = E.setSystem(st.sets, st.n), dup = st.sets.length - s.family.length;
      let out = `<div class="tablewrap"><table class="memb"><caption class="sr">Incidence matrix</caption><thead><tr><th scope="col">set</th>${E.range(st.n).map((i) => `<th scope="col">${i + 1}</th>`).join("")}<th></th></tr></thead><tbody>${st.sets.map((S, j) => `<tr><th scope="row">F${sub(j)}</th>${E.range(st.n).map((i) => `<td><button type="button" class="cell" data-act="mem" data-arg="${j}|${i}" aria-pressed="${S.includes(i)}" aria-label="Element ${i + 1} in F${j + 1}">${S.includes(i) ? "■" : ""}</button></td>`).join("")}<td><button type="button" class="x" data-act="delset" data-arg="${j}" aria-label="Remove F${j + 1}">×</button></td></tr>`).join("")}` +
        `<tr class="foot"><th scope="row">pᵢ</th>${s.p.map((p) => `<td>${f(p, 2)}</td>`).join("")}<td></td></tr><tr class="foot"><th scope="row">h(pᵢ)</th>${s.terms.map((t) => `<td>${f(E.inUnit(t, ctx.unit), 2)}</td>`).join("")}<td></td></tr></tbody></table></div>`;
      if (dup) out += `<p class="small muted">${dup} repeated set${dup > 1 ? "s are" : " is"} counted once: a family is a set of sets.</p>`;
      out += `<p>${m("\\log|\\mathcal F|")} = ${ctx.fH(s.H)} ≤ ${m("\\sum_ih(p_i)")} = ${ctx.fH(s.sum)}, so |F| = <b>${cnt(s.size)}</b> ≤ <b>${f(s.bound, 5)}</b> (naive ${cnt(s.naive)}).</p>` +
        bars([{ label: "log|F|", bits: s.H }, { label: "Σ h(pᵢ)", bits: s.sum }, { label: "n", bits: st.n }], ctx, st.n);
      return out;
    },
    act: {
      mem(st, arg) { const [j, i] = arg.split("|").map(Number), S = st.sets[j], k = S.indexOf(i); if (k >= 0) S.splice(k, 1); else { S.push(i); S.sort(); } },
      addset(st) { st.sets.push([]); },
      delset(st, arg) { if (st.sets.length > 1) st.sets.splice(+arg, 1); },
      preset(st, arg) { st.sets = arg === "pairs" ? E.subsetsOfSize(st.n, 2) : [E.range(st.n)]; if (arg === "all") st.sets = E.range(1 << st.n).map((v) => E.range(st.n).filter((i) => (v >> i) & 1)).slice(0, 10); },
    },
    budget(st) { const s = E.setSystem(st.sets, st.n); return { rows: [{ label: "log|F|", bits: s.H }, { label: "Σ h(pᵢ)", bits: s.sum }] }; },
  };

  /* ---------- sumsets ---------- */
  W.sumset = {
    init: (o) => ({ A: o.A.slice(), B: o.B.slice() }),
    controls: () => `<div class="row">${btn("preset", "Intervals", "int")}${btn("preset", "Spread B", "spread")}${btn("preset", "Progressions", "ap")}</div>`,
    view(st, ctx) {
      const s = E.sumset(st.A, st.B), U = E.range(13);
      const row = (k) => `<div class="row" role="group" aria-label="Set ${k}"><span class="lab">${k}</span>${U.map((v) => `<button type="button" class="tog small" data-act="mem" data-arg="${k}|${v}" aria-pressed="${st[k].includes(v)}" aria-label="${v} in ${k}">${v}</button>`).join("")}</div>`;
      let out = row("A") + row("B");
      if (!s.A.length || !s.B.length) return out + `<p>Pick at least one element of each set.</p>`;
      out += `<div class="tablewrap"><table class="grid"><caption class="sr">Sums a + b</caption><thead><tr><th>+</th>${s.B.map((b) => `<th scope="col">${b}</th>`).join("")}</tr></thead><tbody>${s.A.map((a) => `<tr><th scope="row">${a}</th>${s.B.map((b) => `<td>${a + b}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      const mx = Math.max(...s.weights);
      out += `<div class="hist" role="img" aria-label="Distribution of X + Y">${s.sums.map((v, i) => `<div class="hb"><span style="height:${(100 * s.weights[i]) / mx}%"></span><small>${v}</small></div>`).join("")}</div>`;
      out += `<p>|A + B| = <b>${s.size}</b>. ${m("\\max(H(X),H(Y))")} = ${ctx.fH(s.lower)} ≤ ${m("H(X+Y)")} = <b>${ctx.fH(s.HS)}</b> ≤ ${m("\\log|A+B|")} = ${ctx.fH(s.logSize)}.</p>`;
      return out;
    },
    act: {
      mem(st, arg) { const [k, v] = arg.split("|"), S = st[k], i = S.indexOf(+v); if (i >= 0) S.splice(i, 1); else { S.push(+v); S.sort((a, b) => a - b); } },
      preset(st, arg) { if (arg === "int") { st.A = [0, 1, 2, 3]; st.B = [0, 1, 2, 3]; } else if (arg === "spread") { st.A = [0, 1, 2, 3]; st.B = [0, 4, 8, 12]; } else { st.A = [0, 2, 4, 6]; st.B = [0, 3, 6]; } },
    },
  };

  /* ---------- proof architecture and the checklist ---------- */
  W.architecture = {
    init: () => ({}),
    controls: () => "",
    view: () => `<div class="split"><div class="flow"><h4>Probabilistic method</h4><ol><li>random object</li><li>expectation / union bound</li><li>Pr[good] &gt; 0</li><li><b>an object exists</b></li></ol></div><div class="flow"><h4>Entropy method</h4><ol><li>uniform random object</li><li>random-variable encoding</li><li>information inequalities</li><li><b>at most so many objects</b></li></ol></div></div>` +
      `<p>Shared tools: random sampling, random ordering, random variable encodings, expectation. In Bregman's theorem the randomness (the reveal order) is introduced into the <b>proof architecture</b>, not the theorem.</p>` + flowHtml(Ls.architecture(Ls.byId("bregman"))),
  };
  W.checklist = {
    init: () => ({ done: [] }),
    controls: () => "",
    view: (st) => `<ol class="check">${Ls.CHECKLIST.map((q, i) => `<li><button type="button" class="tog" data-act="tick" data-arg="${i}" aria-pressed="${st.done.includes(i)}">${st.done.includes(i) ? "✓" : "○"}</button> ${esc(q)}</li>`).join("")}</ol>` +
      flowHtml(["COUNT", "RANDOMIZE", "ENCODE", "DECOMPOSE INFORMATION", "THROW AWAY ONLY THE DEPENDENCE YOU CAN AFFORD", "BOUND LOCAL UNCERTAINTY", "ADD INFORMATION COSTS", "EXPONENTIATE"]),
    act: { tick(st, arg) { const i = +arg, k = st.done.indexOf(i); if (k >= 0) st.done.splice(k, 1); else st.done.push(i); } },
  };
  function flowHtml(steps) { return `<ol class="flowline">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`; }

  root.EntropyWidgets = { W, ledgerHtml, flowHtml, stack, bars, table, m, draw };
})(typeof self !== "undefined" ? self : this);
