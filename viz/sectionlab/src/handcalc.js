/* Sectionlab hand calculations: the section's closed-form properties worked by hand, step by step.
 *
 * section.js is authoritative: it integrates each property over the exact boundary of the whole
 * transformed section. This file writes the same answer the way it is worked on paper, by composite
 * parts:
 *
 *   parts       each part's area A_i and centroid (x_i, y_i), and its modular ratio n_i = E_i / E_base
 *               (a void counts −n of its host)
 *   area        A = Σ n_i A_i
 *   centroid    x_c = Σ n_i A_i x_i / A, y_c = Σ n_i A_i y_i / A
 *   own I       each part's I_x,i, I_y,i, I_xy,i about its own centroid, in closed form for a sharp
 *               rectangle, a circle, a circular hollow and a sharp rectangular hollow, and from the
 *               part's exact boundary otherwise
 *   parallel    I_x = Σ n_i (I_x,i + A_i d_y,i²), I_y = Σ n_i (I_y,i + A_i d_x,i²),
 *   axis        I_xy = Σ n_i (I_xy,i + A_i d_x,i d_y,i), with d measured from the centroid
 *   principal   I_1,2 = (I_x + I_y)/2 ± √(((I_x − I_y)/2)² + I_xy²), θ = ½ atan2(−2 I_xy, I_x − I_y)
 *   moduli      S = I / c to each extreme fibre; r = √(I / A); I_p = I_x + I_y, r_p = √(I_p / A)
 *   torsion     the page's closed-form formula with its numbers substituted, or why there is none
 *   plastic     Z_p = M_p / σ0.2 and M_p / M_el, with M_el and M_p from the fibre solver
 *
 * Q_x, Q_y, M_el, M_p and the moment–curvature curve come from numerical integration or iterative
 * solves, so they are quoted from the solver and the derivation says so. Every number shown is the
 * engine's, formatted as the page formats it, in mm, N and MPa. `derive` also carries the hand chain
 * itself (the composite sums from each part's own values), which the tests compare with the engine,
 * with reference/reference.json and with closed forms.
 *
 *   derive(result)                 the derivation as data
 *   frames(result)                 [{ title, blocks, narration }]: blocks are { p } | { eq } |
 *                                  { steps: [tex, ...] } (formula, substitution, result) | { list } |
 *                                  { table: { head, rows } }, with $…$ maths inline in text
 *   body(blocks)                   a frame's blocks as Markdown, with `. . .` between steps
 *   markdown(result)               a Markdown document of the steps that beamdswitch also opens
 *   texNodes(tex), texText(tex)    a small TeX subset as a tree for the page to draw, or as text
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./geometry.js"), require("./section.js"), require("./torsion.js"), require("./report.js"));
  else { const L = root.SectionLab; L.handcalc = factory(L.geometry, L.section, L.torsion, L.report); }
})(typeof self !== "undefined" ? self : this, function (G, S, T, R) {
  "use strict";

  const VOICE = "bf_emma";
  /* Longest sum written out term by term; longer sums point to the table above them. */
  const WRITE_TERMS = 12;
  /* Parts whose closed-form second moments share one slide. */
  const CLOSED_PER_FRAME = 3;
  const { fmt, mdCell } = R;
  const { sayNumber, sayVal, texNumber, spokenName, sayList, count } = R.speech;

  /* ---------- the derivation as data ---------- */

  /* Values at rounding-error level of `scale` are exactly 0, as section.js reports them. */
  const snap = (v, scale) => (Math.abs(v) <= 1e-12 * scale ? 0 : v);

  /* A part's own second moments about its centroid in closed form, when its shape has one. */
  function closedForm(part) {
    const d = part.dims, sharp = part.radii.every((r) => r === 0), turned = part.orientation === 90;
    const wh = () => (turned ? [d.h, d.b] : [d.b, d.h]);
    switch (part.shape) {
      case "rect": {
        if (!sharp) return null;
        const [b, h] = wh();
        return { what: "a sharp rectangle", b, h, Ix: (b * h ** 3) / 12, Iy: (h * b ** 3) / 12, Ixy: 0,
          tex: ["I_{x,i} = \\frac{b h^3}{12}", "I_{y,i} = \\frac{h b^3}{12}"],
          sub: (t) => [`I_{x,i} = \\frac{${t(b)} \\times ${t(h)}^3}{12}`, `I_{y,i} = \\frac{${t(h)} \\times ${t(b)}^3}{12}`] };
      }
      case "circle":
        return { what: "a circle", Ix: (Math.PI * d.d ** 4) / 64, Iy: (Math.PI * d.d ** 4) / 64, Ixy: 0,
          tex: ["I_{x,i} = I_{y,i} = \\frac{\\pi d^4}{64}"], sub: (t) => [`I_{x,i} = I_{y,i} = \\frac{\\pi \\times ${t(d.d)}^4}{64}`] };
      case "chs": {
        const di = d.d - 2 * d.t, I = (Math.PI * (d.d ** 4 - di ** 4)) / 64;
        return { what: "a circular hollow, d_i = d − 2t", di, Ix: I, Iy: I, Ixy: 0,
          tex: ["I_{x,i} = I_{y,i} = \\frac{\\pi (d^4 - d_i^4)}{64}"], sub: (t) => [`I_{x,i} = I_{y,i} = \\frac{\\pi (${t(d.d)}^4 - ${t(di)}^4)}{64}`] };
      }
      case "rhs": {
        if (!sharp) return null;
        const [b, h] = wh(), bi = b - 2 * d.t, hi = h - 2 * d.t;
        return { what: "a sharp rectangular hollow, b_i = b − 2t, h_i = h − 2t", b, h, bi, hi,
          Ix: (b * h ** 3 - bi * hi ** 3) / 12, Iy: (h * b ** 3 - hi * bi ** 3) / 12, Ixy: 0,
          tex: ["I_{x,i} = \\frac{b h^3 - b_i h_i^3}{12}", "I_{y,i} = \\frac{h b^3 - h_i b_i^3}{12}"],
          sub: (t) => [`I_{x,i} = \\frac{${t(b)} \\times ${t(h)}^3 - ${t(bi)} \\times ${t(hi)}^3}{12}`, `I_{y,i} = \\frac{${t(h)} \\times ${t(b)}^3 - ${t(hi)} \\times ${t(bi)}^3}{12}`] };
      }
      default: return null;
    }
  }

  /* `result` is engine.compute's: { model, props, torsion, plastic }. Recomputes each part's own
     moments from its exact contours, then carries the composite sums by hand. */
  function derive(result) {
    const { model, props: P } = result;
    const ext = P.extent, size = Math.hypot(ext.x1 - ext.x0, ext.y1 - ext.y0);
    const mats = Object.fromEntries(model.materials.map((m) => [m.id, m]));
    const parts = model.parts.map((part, i) => {
      const pp = P.parts[i], host = part.void ? model.parts.find((q) => q.id === pp.host) : part;
      const contours = S.partContours(part);
      const m0 = G.moments(contours, { ni: 2, nj: 2 });
      const A = m0[0][0], x = m0[1][0] / A, y = m0[0][1] / A;
      const own = G.moments(G.transformContours(contours, 0, -x, -y), { ni: 3, nj: 3 });
      const Ix = own[0][2], Iy = own[2][0], Ixy = snap(own[1][1], own[0][2] + own[2][0]);
      const E = mats[host.material].E;
      return {
        id: part.id, name: part.name, shape: part.shape, void: part.void, host: part.void ? pp.host : null, material: host.material,
        E, n: pp.n, w: part.void ? -pp.n : pp.n, A, x: snap(x, size), y: snap(y, size), Ix, Iy, Ixy, closed: closedForm(part),
      };
    });
    // The composite sums, by hand.
    const sum = (f) => parts.reduce((s, q) => s + f(q), 0);
    const A = sum((q) => q.w * q.A), SAx = sum((q) => q.w * q.A * q.x), SAy = sum((q) => q.w * q.A * q.y);
    const cx = snap(SAx / A, size), cy = snap(SAy / A, size);
    for (const q of parts) {
      q.dx = snap(q.x - cx, size); q.dy = snap(q.y - cy, size);
      q.cIx = q.w * (q.Ix + q.A * q.dy ** 2); q.cIy = q.w * (q.Iy + q.A * q.dx ** 2); q.cIxy = q.w * (q.Ixy + q.A * q.dx * q.dy);
    }
    const Ix = sum((q) => q.cIx), Iy = sum((q) => q.cIy), Ip = Ix + Iy, Ixy = snap(sum((q) => q.cIxy), Ip);
    const avg = (Ix + Iy) / 2, half = (Ix - Iy) / 2, Rm = Math.hypot(half, Ixy);
    const principal = Ixy === 0;
    let theta = principal ? (Ix >= Iy ? 0 : Math.PI / 2) : 0.5 * Math.atan2(-2 * Ixy, Ix - Iy);
    if (theta > Math.PI / 2) theta -= Math.PI;
    if (theta <= -Math.PI / 2) theta += Math.PI;
    const c = { top: ext.y1 - cy, bottom: cy - ext.y0, right: ext.x1 - cx, left: cx - ext.x0 };
    return {
      model, props: P, torsion: result.torsion, plastic: result.plastic, parts, E_base: model.E_base,
      A, SAx, SAy, cx, cy, Ix, Iy, Ixy, avg, half, R: Rm, I1: avg + Rm, I2: avg - Rm, principal, theta, thetaDeg: (theta * 180) / Math.PI,
      extent: ext, c,
      Sx_top: Ix / c.top, Sx_bottom: Ix / c.bottom, Sy_right: Iy / c.right, Sy_left: Iy / c.left,
      rx: Math.sqrt(Ix / A), ry: Math.sqrt(Iy / A), Ip, rp: Math.sqrt(Ip / A),
      torsionSteps: torsionSteps(result),
    };
  }
  /* The torsion constant's formula, worked with its numbers, from the shape's own dimensions. */
  function torsionSteps(result) {
    const t = result.torsion;
    if (!t || !t.available) return null;
    const part = result.model.parts[0], d = part.dims;
    switch (t.formula) {
      case "circle": return { kind: "circle", d: d.d, J: (Math.PI * d.d ** 4) / 32 };
      case "chs": { const di = d.d - 2 * d.t; return { kind: "chs", d: d.d, t: d.t, di, J: (Math.PI * (d.d ** 4 - di ** 4)) / 32 }; }
      case "semicircle": { const r = d.d / 2; return { kind: "semicircle", r, J: (Math.PI / 2 - 4 / Math.PI) * r ** 4 }; }
      case "triangle-equilateral": return { kind: "triangle", b: d.b, J: (Math.sqrt(3) * d.b ** 4) / 80 };
      case "rect": {
        const b = Math.max(d.b, d.h), h = Math.min(d.b, d.h);
        let S = 0, first = 0;
        for (let n = 1; n < 100001; n += 2) {
          const term = Math.tanh((n * Math.PI * b) / (2 * h)) / n ** 5;
          if (n === 1) first = term;
          S += term;
          if (term < 1e-18 * S) break;
        }
        return { kind: "rect", b, h, first, S, J: ((b * h ** 3) / 3) * (1 - (192 / Math.PI ** 5) * (h / b) * S) };
      }
      case "rhs-bredt-sharp": case "rhs-bredt-rounded": {
        const bm = d.b - d.t, hm = d.h - d.t, rm = [0, 1, 2, 3].map((k) => (part.radii[k] === 0 && part.radii[k + 4] === 0 ? 0 : part.radii[k] - d.t / 2));
        const cutA = rm.reduce((s, r) => s + (1 - Math.PI / 4) * r * r, 0), cutP = rm.reduce((s, r) => s + (2 - Math.PI / 2) * r, 0);
        const Am = bm * hm - cutA, pm = 2 * (bm + hm) - cutP;
        return { kind: "rhs", t: d.t, bm, hm, rm, cutA, cutP, Am, pm, J: (4 * Am * Am * d.t) / pm };
      }
      case "open-thin-wall": {
        const W = {
          ishape: [["flange", d.b, d.tf], ["flange", d.b, d.tf], ["web", d.h - d.tf, d.tw]],
          channel: [["flange", d.b - d.tw / 2, d.tf], ["flange", d.b - d.tw / 2, d.tf], ["web", d.h - d.tf, d.tw]],
          tee: [["flange", d.b, d.tf], ["stem", d.h - d.tf / 2, d.tw]],
          angle: [["both legs", d.b + d.h - d.t, d.t]],
          cross: [["horizontal bar", d.b, d.tb], ["vertical bar", d.h - d.tb, d.th]],
        };
        W.zed = W.channel;
        const walls = W[part.shape].map(([name, L, tw]) => ({ name, L, t: tw, J: (L * tw ** 3) / 3 }));
        return { kind: "open", shape: part.shape, walls, J: walls.reduce((s, w) => s + w.J, 0) };
      }
      case "cold-formed-thin-wall": {
        const bends = { cfangle: 1, cfhat: 4 }[part.shape] ?? (d.c > 0 ? 4 : 2);
        const rm = d.ri + d.t / 2, cut = (2 - Math.PI / 2) * rm, L = T.developedLength(part.shape, d);
        return { kind: "cold", t: d.t, ri: d.ri, rm, bends, cut, Lsharp: L + bends * cut, L, J: (L * d.t ** 3) / 3 };
      }
      default: return null;
    }
  }

  /* ---------- writing the steps ---------- */

  const UNIT_TEX = { mm: "\\text{mm}", "mm²": "\\text{mm}^2", "mm³": "\\text{mm}^3", "mm⁴": "\\text{mm}^4", MPa: "\\text{MPa}", "N·mm": "\\text{N mm}", "°": "^\\circ", "": "" };
  const tx = (v, digits) => texNumber(fmt(v, digits));
  const tp = (v) => (fmt(v).startsWith("−") ? `(${tx(v)})` : tx(v));
  const tq = (v, unit) => `${tx(v)}${unit === "°" ? "" : "\\ "}${UNIT_TEX[unit]}`;
  /* Inline text form of a value with its unit, for tables and prose. */
  const vu = (v, unit) => `${fmt(v)}${unit ? (unit === "°" ? "°" : ` ${unit}`) : ""}`;
  const say = (v, unit) => sayVal(fmt(v), unit);
  /* A sum of terms, written out up to WRITE_TERMS; the page's sums never mix units. */
  const sumOf = (terms) => terms.map((s, i) => (i && !s.startsWith("-") ? ` + ${s}` : i ? ` - ${s.slice(1)}` : s)).join("");
  const label = (q) => (q.void ? `${q.id} (void in ${q.host})` : q.id);

  function frames(result) {
    const D = derive(result), P = D.props, ps = D.parts, many = ps.length > WRITE_TERMS;
    const nTerm = (q) => (q.w === 1 ? "" : `${tp(q.w)} \\times `);
    const out = [];
    const singleMat = ps.every((q) => q.n === 1);

    /* 1. Parts and modular ratios */
    const mats = [...new Map(ps.filter((q) => !q.void).map((q) => [q.material, q])).values()];
    out.push({
      title: "Hand calculation: parts and modular ratios",
      blocks: [
        { p: `Each part is weighted by its modular ratio $n_i = E_i / E_{base}$, with $E_{base}$ = ${vu(D.E_base, "MPa")}; a void counts $-n$ of the part it is cut from. $A_i$ is each part's own area and $(x_i, y_i)$ its centroid.` },
        ...(singleMat ? [] : [{ steps: mats.map((q) => `n_{\\text{${q.material.replace(/[^A-Za-z0-9 .-]/g, "")}}} = \\frac{${tx(q.E)}}{${tx(D.E_base)}} = ${tx(q.n, 4)}`) }]),
        { table: { head: ["Part", "$n_i$", "$A_i$ (mm²)", "$x_i$ (mm)", "$y_i$ (mm)"], rows: ps.map((q) => [label(q), fmt(q.w, 4), fmt(q.A), fmt(q.x), fmt(q.y)]) } },
      ],
      narration: [
        `The section has ${count(ps.length, "part", "parts")}, and each one is taken by itself first, with its own area and centroid.`,
        singleMat ? `Every part has the base modulus of ${say(D.E_base, "MPa")}, so every solid part counts once${ps.some((q) => q.void) ? " and every hole counts minus once" : ""}.`
          : `Each part counts its modular ratio times, its own modulus over the base modulus of ${say(D.E_base, "MPa")}${ps.some((q) => q.void) ? ", and a hole counts minus the ratio of the part it is cut from" : ""}.`,
      ].join(" "),
    });

    /* 2. Area */
    out.push({
      title: `Hand calculation: area A = ${fmt(P.A)} mm²`,
      blocks: [{ steps: [
        "A = \\sum n_i A_i",
        ...(many ? [] : [`A = ${sumOf(ps.map((q) => `${nTerm(q)}${tx(q.A)}`))}`]),
        `A = ${tq(P.A, "mm²")}`,
      ] }, ...(many ? [{ p: `The ${ps.length} terms $n_i A_i$ use the values in the parts table.` }] : [])],
      narration: `The area is the sum of each part's area times its modular ratio, which gives ${say(P.A, "mm²")}.`,
    });

    /* 3. Centroid */
    out.push({
      title: `Hand calculation: centroid (${fmt(P.cx)}, ${fmt(P.cy)}) mm`,
      blocks: [
        { table: { head: ["Part", "$n_i A_i$ (mm²)", "$n_i A_i x_i$ (mm³)", "$n_i A_i y_i$ (mm³)"], rows: ps.map((q) => [label(q), fmt(q.w * q.A), fmt(q.w * q.A * q.x), fmt(q.w * q.A * q.y)]) } },
        { steps: [
          "x_c = \\frac{\\sum n_i A_i x_i}{A}",
          `x_c = \\frac{${many ? tx(D.SAx) : sumOf(ps.map((q) => tx(q.w * q.A * q.x)))}}{${tx(P.A)}}`,
          `x_c = ${tq(P.cx, "mm")}`,
        ] },
        { steps: [
          "y_c = \\frac{\\sum n_i A_i y_i}{A}",
          `y_c = \\frac{${many ? tx(D.SAy) : sumOf(ps.map((q) => tx(q.w * q.A * q.y)))}}{${tx(P.A)}}`,
          `y_c = ${tq(P.cy, "mm")}`,
        ] },
      ],
      narration: `Taking first moments of area about the axes and dividing by the area puts the centroid at x ${say(P.cx, "mm")} and y ${say(P.cy, "mm")}.`,
    });

    /* 4. Each part's own second moments: closed forms (a few parts to a slide), then the table */
    const closed = ps.filter((q) => q.closed);
    const rhs = (t) => t.slice(t.lastIndexOf(" = ") + 3);
    const chain = (q, k) => {
      const lhs = q.closed.tex.length === 1 ? "I_{x,i} = I_{y,i}" : k ? "I_{y,i}" : "I_{x,i}";
      return `${lhs} = ${rhs(q.closed.tex[k])} = ${rhs(q.closed.sub(tx)[k])} = ${tq(k ? q.Iy : q.Ix, "mm⁴")}`;
    };
    for (let i = 0; i < closed.length; i += CLOSED_PER_FRAME) {
      const group = closed.slice(i, i + CLOSED_PER_FRAME);
      out.push({
        title: `Hand calculation: closed-form second moments of ${group.map((q) => q.id).join(", ")}`,
        blocks: group.flatMap((q) => [{ p: `${label(q)}, ${q.closed.what}, about its own centroid:` }, ...q.closed.tex.map((_, k) => ({ steps: [chain(q, k)] }))]),
        narration: `${sayList(group.map((q) => spokenName(q.id))).replace(/^./, (ch) => ch.toUpperCase())} ${group.length === 1 ? "has a" : "have"} textbook closed form${group.length === 1 ? "" : "s"} for the second moment about the part's own centroid, worked here with the part's own dimensions.`,
      });
    }
    out.push({
      title: "Hand calculation: each part's second moments about its own centroid",
      blocks: [
        { p: closed.length === ps.length ? "Every part's values are the closed forms above." : `${closed.length ? "Parts without a closed form above" : "These parts"} are integrated over their exact boundary (lines and circular arcs, by Green's theorem), as the solver does; fillets and rounded corners have no short closed form.` },
        { table: { head: ["Part", "$I_{x,i}$ (mm⁴)", "$I_{y,i}$ (mm⁴)", "$I_{xy,i}$ (mm⁴)"], rows: ps.map((q) => [label(q), fmt(q.Ix), fmt(q.Iy), fmt(q.Ixy)]) } },
      ],
      narration: closed.length === ps.length
        ? "Here are each part's own second moments of area, about axes through its own centroid."
        : `Here are each part's own second moments of area, about axes through its own centroid${closed.length ? "; the parts without a closed form" : ", which"} come from integrating around their exact outlines.`,
    });

    /* 5. Parallel-axis theorem */
    const pa = (sym, own, dd, total, tot) => ({ steps: [
      `${sym} = \\sum n_i \\left(${own} + ${dd}\\right)`,
      ...(many ? [] : [`${sym} = ${sumOf(ps.map((q) => tx(q[tot])))}`]),
      `${sym} = ${tq(total, "mm⁴")}`,
    ] });
    out.push({
      title: `Hand calculation: parallel-axis theorem, I_x = ${fmt(P.Ix)}, I_y = ${fmt(P.Iy)}, I_xy = ${fmt(P.Ixy)} mm⁴`,
      blocks: [
        { p: "Each part's own values move to the section's centroid with $d_{x,i} = x_i - x_c$ and $d_{y,i} = y_i - y_c$." },
        { table: { head: ["Part", "$d_{x,i}$ (mm)", "$d_{y,i}$ (mm)", "$n_i (I_{x,i} + A_i d_{y,i}^2)$", "$n_i (I_{y,i} + A_i d_{x,i}^2)$", "$n_i (I_{xy,i} + A_i d_{x,i} d_{y,i})$"],
          rows: ps.map((q) => [label(q), fmt(q.dx), fmt(q.dy), fmt(q.cIx), fmt(q.cIy), fmt(q.cIxy)]) } },
        pa("I_x", "I_{x,i}", "A_i d_{y,i}^2", P.Ix, "cIx"),
        pa("I_y", "I_{y,i}", "A_i d_{x,i}^2", P.Iy, "cIy"),
        pa("I_{xy}", "I_{xy,i}", "A_i d_{x,i} d_{y,i}", P.Ixy, "cIxy"),
      ],
      narration: [
        "The parallel-axis theorem moves each part's own second moment to the section's centroid, adding its area times the square of the offset.",
        `Summing the parts gives ${say(P.Ix, "mm⁴")} about x, ${say(P.Iy, "mm⁴")} about y, and a product moment of ${say(P.Ixy, "mm⁴")}.`,
      ].join(" "),
    });

    /* 6. Principal axes */
    out.push({
      title: `Hand calculation: principal axes, I_1 = ${fmt(P.I1)}, I_2 = ${fmt(P.I2)} mm⁴ at θ = ${fmt(P.thetaDeg)}°`,
      blocks: [
        { steps: [
          "I_{1,2} = \\frac{I_x + I_y}{2} \\pm \\sqrt{\\left(\\frac{I_x - I_y}{2}\\right)^2 + I_{xy}^2}",
          `I_{1,2} = \\frac{${tx(P.Ix)} + ${tx(P.Iy)}}{2} \\pm \\sqrt{\\left(\\frac{${tx(P.Ix)} - ${tp(P.Iy)}}{2}\\right)^2 + ${tp(P.Ixy)}^2}`,
          `I_{1,2} = ${tx(D.avg)} \\pm ${tx(D.R)}`,
          `I_1 = ${tq(P.I1, "mm⁴")}, \\quad I_2 = ${tq(P.I2, "mm⁴")}`,
        ] },
        D.principal
          ? { p: `$I_{xy}$ = 0, so the x and y axes are principal: the major axis 1 is the ${P.Ix >= P.Iy ? "x" : "y"} axis, θ = ${vu(P.thetaDeg, "°")}.` }
          : { steps: [
            "\\theta = \\frac{1}{2}\\,\\mathrm{atan2}\\left(-2 I_{xy},\\; I_x - I_y\\right)",
            `\\theta = \\frac{1}{2}\\,\\mathrm{atan2}\\left(${tx(-2 * P.Ixy)},\\; ${tx(P.Ix - P.Iy)}\\right)`,
            `\\theta = ${tq(P.thetaDeg, "°")}`,
          ] },
        { p: "θ is measured counter-clockwise from the x axis to the major axis 1." },
      ],
      narration: [
        `The principal second moments are the mean of the two, ${say(D.avg, "mm⁴")}, plus or minus the radius of Mohr's circle, ${say(D.R, "mm⁴")}.`,
        `That gives ${say(P.I1, "mm⁴")} about the major axis and ${say(P.I2, "mm⁴")} about the minor axis, with the major axis at ${sayNumber(fmt(P.thetaDeg))} degrees from x.`,
      ].join(" "),
    });

    /* 7. Section moduli; 8. radii of gyration and the polar moment */
    const e = D.extent;
    const mod = (S, I, cTex, cVal, num) => ({ steps: [`${S} = \\frac{${I}}{${cTex}} = \\frac{${tx(num)}}{${tx(cVal)}}`, `${S} = ${tq(P[{ "S_{x+}": "Sx_top", "S_{x-}": "Sx_bottom", "S_{y+}": "Sy_right", "S_{y-}": "Sy_left" }[S]], "mm³")}`] });
    out.push({
      title: `Hand calculation: section moduli S_x+ = ${fmt(P.Sx_top)}, S_x− = ${fmt(P.Sx_bottom)} mm³`,
      blocks: [
        { p: `The extreme fibres are at y = ${vu(e.y1, "mm")} and ${vu(e.y0, "mm")}, and x = ${vu(e.x1, "mm")} and ${vu(e.x0, "mm")}, so from the centroid $c_{top}$ = ${vu(D.c.top, "mm")}, $c_{bottom}$ = ${vu(D.c.bottom, "mm")}, $c_{right}$ = ${vu(D.c.right, "mm")} and $c_{left}$ = ${vu(D.c.left, "mm")}.` },
        mod("S_{x+}", "I_x", "c_{top}", D.c.top, P.Ix),
        mod("S_{x-}", "I_x", "c_{bottom}", D.c.bottom, P.Ix),
        mod("S_{y+}", "I_y", "c_{right}", D.c.right, P.Iy),
        mod("S_{y-}", "I_y", "c_{left}", D.c.left, P.Iy),
      ],
      narration: [
        `Dividing the second moment about x by the distance to the top and bottom fibres gives section moduli of ${say(P.Sx_top, "mm³")} and ${say(P.Sx_bottom, "mm³")}.`,
        `About y, the moduli to the right and left fibres are ${say(P.Sy_right, "mm³")} and ${say(P.Sy_left, "mm³")}.`,
      ].join(" "),
    });
    out.push({
      title: `Hand calculation: radii of gyration r_x = ${fmt(P.rx)}, r_y = ${fmt(P.ry)} mm and polar moment I_p = ${fmt(P.Ip)} mm⁴`,
      blocks: [
        { steps: [`r_x = \\sqrt{\\frac{I_x}{A}} = \\sqrt{\\frac{${tx(P.Ix)}}{${tx(P.A)}}}`, `r_x = ${tq(P.rx, "mm")}`] },
        { steps: [`r_y = \\sqrt{\\frac{I_y}{A}} = \\sqrt{\\frac{${tx(P.Iy)}}{${tx(P.A)}}}`, `r_y = ${tq(P.ry, "mm")}`] },
        { steps: [`I_p = I_x + I_y = ${tx(P.Ix)} + ${tx(P.Iy)}`, `I_p = ${tq(P.Ip, "mm⁴")}`] },
        { steps: [`r_p = \\sqrt{\\frac{I_p}{A}} = \\sqrt{\\frac{${tx(P.Ip)}}{${tx(P.A)}}}`, `r_p = ${tq(P.rp, "mm")}`] },
        { p: `The first moments $Q_x$ = ${vu(P.Qx, "mm³")} and $Q_y$ = ${vu(P.Qy, "mm³")} (of the area on one side of each centroidal axis) come from the solver, which integrates each part cut at the axis along its exact boundary.` },
      ],
      narration: [
        `The radii of gyration are the square roots of each second moment over the area: ${say(P.rx, "mm")} about x and ${say(P.ry, "mm")} about y.`,
        `The polar moment is the sum of the two, ${say(P.Ip, "mm⁴")}.`,
        "The first moments of area come from the solver's own integration.",
      ].join(" "),
    });

    /* 9. Torsion */
    out.push(torsionFrame(D));

    /* 10. Plastic bending */
    out.push(plasticFrame(D));
    return out;
  }

  function torsionFrame(D) {
    const t = D.torsion, s = D.torsionSteps;
    if (!t || !t.available || !s) {
      return {
        title: "Hand calculation: torsion constant J, n/a",
        blocks: [{ p: `No torsion constant here. ${t ? t.reason : ""} The page gives J only from a closed-form formula whose accuracy has been measured against a numerical Prandtl solution.` }],
        narration: "There is no torsion constant to work by hand: no formula the page has verified covers this section.",
      };
    }
    const Jq = `J = ${tq(t.J, "mm⁴")}`;
    let steps, extra = [];
    switch (s.kind) {
      case "circle": steps = ["J = \\frac{\\pi d^4}{32}", `J = \\frac{\\pi \\times ${tx(s.d)}^4}{32}`, Jq]; break;
      case "chs": steps = ["J = \\frac{\\pi (d^4 - d_i^4)}{32}, \\quad d_i = d - 2t", `J = \\frac{\\pi (${tx(s.d)}^4 - ${tx(s.di)}^4)}{32}`, Jq]; break;
      case "semicircle": steps = ["J = \\left(\\frac{\\pi}{2} - \\frac{4}{\\pi}\\right) r^4", `J = \\left(\\frac{\\pi}{2} - \\frac{4}{\\pi}\\right) \\times ${tx(s.r)}^4`, Jq]; break;
      case "triangle": steps = ["J = \\frac{\\sqrt{3}\\, b^4}{80}", `J = \\frac{\\sqrt{3} \\times ${tx(s.b)}^4}{80}`, Jq]; break;
      case "rect":
        extra = [{ steps: [
          "S = \\sum_{n = 1, 3, 5, \\ldots} \\frac{\\tanh(n \\pi b / 2h)}{n^5}",
          `S = \\tanh\\left(\\frac{\\pi \\times ${tx(s.b)}}{2 \\times ${tx(s.h)}}\\right) + \\ldots = ${tx(s.first, 8)} + \\ldots`,
          `S = ${tx(s.S, 8)}`,
        ] }];
        steps = ["J = \\frac{b h^3}{3}\\left[1 - \\frac{192}{\\pi^5}\\,\\frac{h}{b}\\, S\\right], \\quad h \\le b",
          `J = \\frac{${tx(s.b)} \\times ${tx(s.h)}^3}{3}\\left[1 - \\frac{192}{\\pi^5} \\times \\frac{${tx(s.h)}}{${tx(s.b)}} \\times ${tx(s.S, 8)}\\right]`, Jq];
        break;
      case "rhs": {
        const rounded = s.rm.some((r) => r > 0);
        extra = [{ p: `On the wall's mid-line: $b_m = b - t$ = ${vu(s.bm, "mm")}, $h_m = h - t$ = ${vu(s.hm, "mm")}${rounded ? `, corner mid-line radii $r_m$ = ${s.rm.map((r) => fmt(r)).join(", ")} mm` : ""}.` },
          { steps: rounded
            ? ["A_m = b_m h_m - \\sum \\left(1 - \\frac{\\pi}{4}\\right) r_m^2", `A_m = ${tx(s.bm)} \\times ${tx(s.hm)} - ${tx(s.cutA)}`, `A_m = ${tq(s.Am, "mm²")}`]
            : ["A_m = b_m h_m", `A_m = ${tx(s.bm)} \\times ${tx(s.hm)}`, `A_m = ${tq(s.Am, "mm²")}`] },
          { steps: rounded
            ? ["p_m = 2 (b_m + h_m) - \\sum \\left(2 - \\frac{\\pi}{2}\\right) r_m", `p_m = 2 \\times (${tx(s.bm)} + ${tx(s.hm)}) - ${tx(s.cutP)}`, `p_m = ${tq(s.pm, "mm")}`]
            : ["p_m = 2 (b_m + h_m)", `p_m = 2 \\times (${tx(s.bm)} + ${tx(s.hm)})`, `p_m = ${tq(s.pm, "mm")}`] }];
        steps = ["J = \\frac{4 A_m^2 t}{p_m}", `J = \\frac{4 \\times ${tx(s.Am)}^2 \\times ${tx(s.t)}}{${tx(s.pm)}}`, Jq];
        break;
      }
      case "open":
        extra = [{ table: { head: ["Wall", "$L$ (mm)", "$t$ (mm)", "$L t^3 / 3$ (mm⁴)"], rows: s.walls.map((w) => [w.name, fmt(w.L), fmt(w.t), fmt(w.J)]) } }];
        steps = ["J = \\frac{1}{3} \\sum L t^3", `J = ${sumOf(s.walls.map((w) => tx(w.J)))}`, Jq];
        break;
      case "cold":
        extra = [{ steps: [
          "r_m = r_i + \\frac{t}{2}", `r_m = ${tx(s.ri)} + \\frac{${tx(s.t)}}{2} = ${tq(s.rm, "mm")}`,
        ] }, { steps: [
          "L = L_{sharp} - k \\left(2 - \\frac{\\pi}{2}\\right) r_m",
          `L = ${tx(s.Lsharp)} - ${s.bends} \\times ${tx(s.cut)}`,
          `L = ${tq(s.L, "mm")}`,
        ] }, { p: `$L_{sharp}$ is the mid-line length with sharp corners and $k$ = ${s.bends} is the number of 90° bends; each bend's arc replaces two tangent lengths.` }];
        steps = ["J = \\frac{L t^3}{3}", `J = \\frac{${tx(s.L)} \\times ${tx(s.t)}^3}{3}`, Jq];
        break;
      default: return null;
    }
    const pctS = (x) => `${+(x * 100).toPrecision(2)}%`;
    return {
      title: `Hand calculation: torsion constant J = ${fmt(t.J)} mm⁴`,
      blocks: [{ p: `${t.method === "exact" ? "Exact solution" : t.method}: ${t.text}.` }, ...extra, { steps }, { p: `Stated accuracy against the numerical Prandtl reference: within ${pctS(t.stated)}; largest error measured ${pctS(t.measured)}.` }],
      narration: `The torsion constant comes from the ${spokenName(t.method)} formula with the shape's own dimensions, which gives ${say(t.J, "mm⁴")}.`,
    };
  }

  function plasticFrame(D) {
    const pl = D.plastic;
    if (!pl) {
      return { title: "Hand calculation: plastic bending, from the solver", blocks: [{ p: "The plastic results are not computed yet." }], narration: "The plastic results are not computed yet." };
    }
    if (pl.error) {
      return { title: "Hand calculation: plastic bending, n/a", blocks: [{ p: `The fibre solver could not complete the moment–curvature analysis: ${pl.error}` }], narration: "The moment-curvature analysis could not be completed, so there is nothing to work by hand." };
    }
    const m = D.model.materials.find((x) => D.parts.some((q) => !q.void && q.material === x.id));
    const blocks = [{ p: "$M_{el}$, $M_p$ and the moment–curvature curve come from the fibre solver: Ramberg–Osgood stresses integrated over strips through every part, with the neutral axis found by iteration. They are quoted here, not derived by hand." },
      { list: [`First-yield moment at N = 0, $M_{el}$ = ${vu(pl.Mel, "N·mm")}`, `Fully plastic moment at N = 0, $M_p$ = ${pl.Mp === null ? "n/a" : vu(pl.Mp, "N·mm")}`, `Allowable moment at $\\varepsilon_{lim}$, $M_{lim}$ = ${vu(pl.limit.M, "N·mm")}`] }];
    if (pl.Zp !== null && pl.Zp !== undefined) {
      blocks.push({ steps: ["Z_p = \\frac{M_p}{\\sigma_{0.2}}", `Z_p = \\frac{${tx(pl.Mp)}}{${tx(m.sigma02)}}`, `Z_p = ${tq(pl.Zp, "mm³")}`] });
    } else {
      blocks.push({ p: `$Z_p$: n/a (${pl.ZpNote})` });
    }
    if (pl.shapeFactor !== null && pl.shapeFactor !== undefined) {
      blocks.push({ steps: ["\\text{shape factor} = \\frac{M_p}{M_{el}}", `\\text{shape factor} = \\frac{${tx(pl.Mp)}}{${tx(pl.Mel)}}`, `\\text{shape factor} = ${tx(pl.shapeFactor, 4)}`] });
    }
    return {
      title: "Hand calculation: plastic modulus and shape factor from the solver's moments",
      blocks,
      narration: [
        "The first-yield and fully plastic moments come from the fibre solver, not by hand.",
        pl.Zp !== null && pl.Zp !== undefined ? `Dividing the fully plastic moment by the proof stress gives a plastic modulus of ${say(pl.Zp, "mm³")}.` : "",
        pl.shapeFactor !== null && pl.shapeFactor !== undefined ? `Their ratio, the shape factor, is ${sayNumber(fmt(pl.shapeFactor, 4))}.` : "",
      ].filter(Boolean).join(" "),
    };
  }

  /* ---------- Markdown ---------- */
  const mdText = (s) => String(s).replace(/^(#{1,6}\s|:::)/, "\\$1");
  function body(blocks) {
    const out = [];
    for (const b of blocks) {
      if (b.p != null) out.push(mdText(b.p));
      else if (b.eq != null) out.push(`$$ ${b.eq} $$`);
      else if (b.steps) out.push(b.steps.map((s) => `$$ ${s} $$`).join("\n\n. . .\n\n"));
      else if (b.list) out.push(b.list.map((x) => `- ${x}`).join("\n"));
      else if (b.table) {
        const { head, rows } = b.table;
        out.push([`| ${head.map(mdCell).join(" | ")} |`, `| ${head.map((_, i) => (i ? "---:" : "---")).join(" | ")} |`, ...rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`)].join("\n"));
      }
    }
    return out.join("\n\n");
  }

  /* Deck frames for the standard template: body as Markdown, narration as spoken prose. */
  const deckFrames = (result) => frames(result).map((f) => ({ title: f.title, body: body(f.blocks), narration: f.narration }));

  /* A Markdown document of the steps that beamdswitch also opens as a narrated deck. */
  function markdown(result) {
    const name = String(result.model.title || "Section").replace(/\s+/g, " ").trim();
    const frontTitle = `Hand calculations: ${name}`;
    const block = (text) => {
      for (const line of text.split("\n")) if (/^#{1,2}\s/.test(line) || /^\s*:{3,}/.test(line)) throw new Error(`The hand calculations must not contain a heading or a ::: line: ${line}`);
      return text;
    };
    const out = ["---", `title: ${frontTitle}`, "subtitle: Section properties by composite parts, step by step", `voice: ${VOICE}`, "---", "",
      "::: notes", `${R.NOTICE} ${R.UNITS}`, ":::", "",
      "::: narration", `Hand calculations for ${spokenName(name)}. Each step works the page's own result by hand, by composite parts, in millimetres, newtons and megapascals.`, ":::", "",
      "# Hand calculations", "", "::: narration", "Part 1. Hand calculations.", ":::", ""];
    for (const f of deckFrames(result)) out.push(`## ${f.title}`, "", block(f.body), "", "::: narration", f.narration, ":::", "");
    return out.join("\n");
  }

  /* ---------- a small TeX subset, drawn by the page without a maths library ---------- */
  const SYMBOLS = {
    theta: "θ", sigma: "σ", varepsilon: "ε", pi: "π", sum: "Σ", cdot: "·", times: " × ", pm: " ± ", le: " ≤ ", ge: " ≥ ", ldots: "…", circ: "°", tanh: "tanh",
    quad: "  ", qquad: "   ", ",": " ", " ": " ", ";": " ", "{": "{", "}": "}", "\\": " ",
  };
  /* Nodes are strings or { t: "sup" | "sub" | "text" | "frac" | "sqrt", c | n, d }. */
  function texNodes(src) {
    let i = 0;
    const mathChar = (ch) => (ch === "-" ? "−" : ch === "=" ? " = " : ch);
    const atom = () => {
      if (src[i] === "{") { i++; return seq("}"); }
      if (src[i] === "\\") return command();
      return i < src.length ? [mathChar(src[i++])] : [];
    };
    function command() {
      i++;
      const name = /[A-Za-z]/.test(src[i] || "") ? src.slice(i).match(/^[A-Za-z]+/)[0] : (src[i] || "");
      i += name.length;
      if (/^[A-Za-z]/.test(name)) while (src[i] === " ") i++; // as in TeX, a control word swallows the spaces after it
      if (name === "frac") { const n = atom(), d = atom(); return [{ t: "frac", n, d }]; }
      if (name === "sqrt") return [{ t: "sqrt", c: atom() }];
      if (name === "mathrm") return [{ t: "text", c: atom() }];
      if (name === "text") {
        if (src[i] === "{") { i++; let depth = 1, s = ""; while (i < src.length) { const ch = src[i++]; if (ch === "{") depth++; else if (ch === "}" && !--depth) break; s += ch; } return [{ t: "text", c: [s] }]; }
        return atom();
      }
      if (name === "left" || name === "right") return src[i] === "." ? (i++, []) : [mathChar(src[i++])];
      return [SYMBOLS[name] ?? name];
    }
    function seq(end) {
      const out = [];
      while (i < src.length) {
        const ch = src[i];
        if (end && ch === end) { i++; break; }
        if (ch === "^" || ch === "_") { i++; out.push({ t: ch === "^" ? "sup" : "sub", c: atom() }); continue; }
        if (ch === "\\") { out.push(...command()); continue; }
        if (ch === "{") { i++; out.push(...seq("}")); continue; }
        out.push(mathChar(ch)); i++;
      }
      return out.reduce((acc, n) => { if (typeof n === "string" && typeof acc.at(-1) === "string") acc[acc.length - 1] += n; else acc.push(n); return acc; }, [])
        .map((n) => (typeof n === "string" ? n.replace(/ {2,}/g, " ") : n));
    }
    return seq(null);
  }
  /* Plain text of a TeX string, for accessible labels and tests. */
  function texText(src) {
    const flat = (nodes) => nodes.map((n) => (typeof n === "string" ? n : n.t === "frac" ? `(${flat(n.n)})/(${flat(n.d)})` : n.t === "sqrt" ? `√(${flat(n.c)})` : n.t === "sup" ? `^${flat(n.c)}` : n.t === "sub" ? `_${flat(n.c)}` : flat(n.c))).join("");
    return flat(texNodes(src)).replace(/\s+/g, " ").trim();
  }

  /* Every TeX command the page draws: the symbols plus those texNodes reads itself. */
  const COMMANDS = new Set([...Object.keys(SYMBOLS).filter((k) => /^[A-Za-z]+$/.test(k)), "frac", "sqrt", "mathrm", "text", "left", "right"]);

  return { VOICE, WRITE_TERMS, COMMANDS, closedForm, derive, frames, body, deckFrames, markdown, texNodes, texText };
});
