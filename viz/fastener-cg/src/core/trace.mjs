/* Calculation trace (spec 9.1): a worked calculation for one fastener, each
 * formula shown with substituted numbers.
 *
 * Every number is read from the solver's own results (section properties,
 * reduced load, per-fastener shear and axial records, the tension chain,
 * plate modes, the interaction solve and the ICR solution). Nothing is
 * recomputed here, so the trace cannot disagree with the results: each
 * line's `value` is the solver's value, and the substituted text only
 * formats the solver's inputs to that value.
 */

import { unitLabel } from "./units.mjs";
import { EDGES } from "./contact.mjs";
import { resolveFastener } from "./model.mjs";

/* The governing fastener: the critical one, else the largest in-plane load. */
export function traceFastenerId(result) {
  if (!result || !result.ok || !result.fasteners.length) return null;
  if (result.critical) return result.critical.id;
  return result.fasteners.reduce((a, b) => ((b.basisShear?.Rs ?? b.shear.Rs) > (a.basisShear?.Rs ?? a.shear.Rs) ? b : a)).id;
}

/*
 * Returns { id, sections: [{ title, lines: [{ label, formula, substituted, value, unit }] }] }.
 * `num(v)` formats a number for display (the caller picks the precision).
 */
export function buildTrace(pattern, result, id = traceFastenerId(result), num = (v) => String(Number(v.toPrecision(6)))) {
  if (!result || !result.ok) return null;
  const f = result.fasteners.find((q) => q.id === id);
  if (!f) return null;
  const u = (k) => unitLabel(pattern.unitSystem, k);
  // Substituted numbers: negatives in parentheses so "− (−1500000)" reads correctly; `plain` for tuples.
  const plain = (v) => (typeof v === "number" && Number.isFinite(v) ? num(v) : v === Infinity ? "∞" : "—");
  const n = (v) => (typeof v === "number" && v < 0 && Number.isFinite(v) ? `(${num(v)})` : plain(v));
  const p = result.props, red = result.reduced, sh = f.shear;
  const line = (label, formula, substituted, value, unit = "") => ({ label, formula, substituted, value, unit });
  const sections = [];

  sections.push({
    title: "Reduced load",
    lines: [
      line("Torsion about Cs", "Mz,s = Mz + rx·Fy − ry·Fx", `${plain(pattern.load.Mz)} + ${n(red.shear.rx)}·${n(red.Fy)} − ${n(red.shear.ry)}·${n(red.Fx)}`, red.shear.Mz, u("moment")),
      line("Bending about Ca, x", "Mx,a = Mx + ry·Fz − zp·Fy", `${plain(pattern.load.Mx)} + ${n(red.axial.ry)}·${n(red.Fz)} − ${n(red.axial.zp)}·${n(red.Fy)}`, red.axial.Mx, u("moment")),
      line("Bending about Ca, y", "My,a = My + zp·Fx − rx·Fz", `${plain(pattern.load.My)} + ${n(red.axial.zp)}·${n(red.Fx)} − ${n(red.axial.rx)}·${n(red.Fz)}`, red.axial.My, u("moment")),
    ],
  });

  sections.push({
    title: "Direct shear",
    lines: [
      line("Share", "ks / Σks", `${n(f.ks)} / ${n(p.Ks)}`, sh.share),
      line("Rdx", "Fx·ks/Σks", `${n(red.Fx)}·${n(sh.share)}`, sh.Rdx, u("force")),
      line("Rdy", "Fy·ks/Σks", `${n(red.Fy)}·${n(sh.share)}`, sh.Rdy, u("force")),
    ],
  });

  sections.push({
    title: "Torsional shear (about Cs)",
    lines: [
      line("Position from Cs", "(u, v) = (x − Cs.x, y − Cs.y)", `(${n(f.x)} − ${n(p.Cs.x)}, ${n(f.y)} − ${n(p.Cs.y)})`, `(${plain(sh.u)}, ${plain(sh.v)})`, u("length")),
      line("Rtx", "−Mz,s·ks·v / J", `−${n(red.shear.Mz)}·${n(f.ks)}·${n(sh.v)} / ${n(p.J)}`, sh.Rtx, u("force")),
      line("Rty", "+Mz,s·ks·u / J", `${n(red.shear.Mz)}·${n(f.ks)}·${n(sh.u)} / ${n(p.J)}`, sh.Rty, u("force")),
      line("Resultant", "Rs = √((Rdx + Rtx)² + (Rdy + Rty)²)", `√(${n(sh.Rx)}² + ${n(sh.Ry)}²)`, sh.Rs, u("force")),
    ],
  });

  // Resolved fasteners carry ICR inputs under `icr`; solve replaces them with results only when ICR converged.
  if (result.icr && result.icr.status === "converged" && f.icr && f.icr.ultimate) {
    const ic = result.icr;
    sections.push({
      title: `ICR (${ic.modelLabel})${result.designBasis === "icr" ? ", design basis" : ""}`,
      lines: [
        line("Distance from ICR", "ρ", !ic.icr ? (ic.mode === "translation" ? "uniform translation" : "no in-plane load") : `|(${plain(f.x)}, ${plain(f.y)}) − (${plain(ic.icr.x)}, ${plain(ic.icr.y)})|`, f.icr.ultimate.rho, u("length")),
        line("Deformation", "Δ = Δmax,gov·ρ/ρ_gov", `governing ${ic.governing}`, f.icr.ultimate.delta, u("length")),
        line("Ultimate load", ic.model === "elastic-plastic" ? "R = Rult·min(Δ/Δy, 1)" : "R = Rult·(1 − e^(−μΔ))^λ", `Rult = ${n(resolveFastener(pattern, pattern.fasteners.find((q) => q.id === f.id)).icr.rult)}, Δ = ${n(f.icr.ultimate.delta)}`, f.icr.ultimate.R, u("force")),
        line("γ_ult", ic.mode === "pure-moment" ? "M_u / |Mz,s|" : "P_u / |F|", ic.mode === "pure-moment" ? `${n(ic.Mu)} / ${n(Math.abs(red.shear.Mz))}` : `${n(ic.Pu)} / ${n(Math.hypot(red.Fx, red.Fy))}`, ic.gamma),
        line("At the applied load", "Rs = R / γ_ult (proportional scaling)", `${n(f.icr.ultimate.R)} / ${n(ic.gamma)}`, f.icr.atLoad.Rs, u("force")),
      ],
    });
  }

  const ax = f.axial, am = result.axial;
  if (am.mode === "contact-edge") {
    sections.push({
      title: `Moment-induced tension, method (b): ${EDGES[am.edge].label} of ${am.plateId}`,
      lines: [
        line("Distance from the edge", "d (tension side > 0)", "", ax.d, u("length")),
        line("Tension", "T = M_L·ka·d / Σ(ka·d²)", ax.tensionSide && am.ML > 0 ? `${n(am.ML)}·${n(f.ka)}·${n(ax.d)} / ${n(am.S)}` : "not on the tension side, or M_L ≤ 0", ax.T, u("force")),
        line("Contact reaction", "C = ΣT − Fz", "", am.C, u("force")),
      ],
    });
  } else {
    sections.push({
      title: "Moment-induced tension, method (a): neutral axis through Ca",
      lines: [
        line("Position from Ca", "(p, q)", `(${n(f.x)} − ${n(p.Ca.x)}, ${n(f.y)} − ${n(p.Ca.y)})`, `(${plain(ax.p)}, ${plain(ax.q)})`, u("length")),
        line("Direct", "ka·Fz/Ka", `${n(f.ka)}·${n(red.Fz)}/${n(p.Ka)}`, ax.direct, u("force")),
        am.mode === "general"
          ? line("Bending", "ka·(θx·q − θy·p)", `${n(f.ka)}·(${n(am.thetaX)}·${n(ax.q)} − ${n(am.thetaY)}·${n(ax.p)})`, ax.moment, u("force"))
          : line("Bending", "about the resolved principal axis only", am.mode, ax.moment, u("force")),
        line("Tension", "T = direct + bending", `${n(ax.direct)} + ${n(ax.moment)}`, ax.T, u("force")),
      ],
    });
  }

  const t = f.checks.tension;
  const tension = { title: "Tension chain", lines: [line("External tension", "T_ext = max(T, 0)", n(ax.T), t.Text, u("force"))] };
  const pr = t.prying;
  if (pr.method === "t-stub") {
    tension.lines.push(
      line("b', a', ρ, δ", "b − D/2, min(a, 1.25b) + D/2, b'/a', 1 − d_h/p", "", `${plain(pr.bP)}, ${plain(pr.aP)}, ${plain(pr.rho)}, ${plain(pr.delta)}`),
      line("t_c", "√(4·B·b' / (p·Fp))", `B = ${n(pr.B)}`, pr.tc, u("length")),
      line("α'", "(1/δ)·[(T/B)·(t_c/t)² − 1], clamped to [0, 1]", pr.alphaRaw === null ? "no tension" : `raw ${n(pr.alphaRaw)}`, pr.alpha),
      line("Prying Q", "B·δ·α'·ρ·(t/t_c)²", `${n(pr.B)}·${n(pr.delta)}·${n(pr.alpha)}·${n(pr.rho)}·(${n(pr.t)}/${n(pr.tc)})²`, t.Q, u("force")),
    );
  } else if (pr.method === "manual") {
    tension.lines.push(line("Prying Q (manual factor, W-012)", "(f − 1)·T_ext", `(${n(pr.factor)} − 1)·${n(t.Text)}`, t.Q, u("force")));
  }
  if (t.preload) {
    const pl = t.preload;
    tension.lines.push(
      line("Preload share", "P_max + φ·T_ext", `${n(pl.pMax)} + ${n(pl.phi)}·${n(t.Text)}`, pl.shared, u("force")),
      line("Clamp force", "P_min − (1 − φ)·T_ext", `${n(pl.pMin)} − (1 − ${n(pl.phi)})·${n(t.Text)}`, pl.clamp, u("force")),
      line("Bolt load", "F_b = max(P_max + φT, T) + Q", `max(${n(pl.shared)}, ${n(t.Text)}) + ${n(t.Q)}`, t.Fb, u("force")),
    );
  } else {
    tension.lines.push(line("Bolt tension", "T + Q", `${n(t.Text)} + ${n(t.Q)}`, t.Fb, u("force")));
  }
  sections.push(tension);

  const plates = f.checks.modes.filter((m) => m.plate);
  if (plates.length) {
    const lines = [];
    for (const m of plates) {
      const pl = (pattern.plates || []).find((q) => q.id === m.plate);
      if (m.mode === "bearing") {
        const bearing = m.capacity === undefined ? "not evaluated" : m.basis === "direct-load allowable" ? n(m.capacity) : `${n(pl.bearingAllowable)}·${n(f.diameter)}·${n(pl.thickness)}`;
        lines.push(line(`Bearing, ${m.plate}`, m.basis === "direct-load allowable" ? "R_br,allow keyed" : "R_br,allow = Fbr·D·t", bearing, m.capacity ?? null, u("force")));
        if (m.status === "ok") lines.push(line(`MS bearing, ${m.plate}`, "R_br,allow / Rs − 1", `${n(m.capacity)} / ${n(m.Rs)} − 1`, m.ms));
      } else {
        if (m.e !== undefined) lines.push(line(`Edge distance along ${m.bearsTowards}, ${m.plate}`, "e (ray to the plate edge)", "", m.e, u("length")));
        if (m.status === "ok") {
          lines.push(line(`Tear-out capacity, ${m.plate}`, "2·t·(e − D/2)·Fsu", `2·${n(pl.thickness)}·(${n(m.e)} − ${n(f.diameter)}/2)·${n(pl.shearOutAllowable)}`, m.capacity, u("force")));
          lines.push(line(`MS tear-out, ${m.plate}`, "capacity / Rs − 1", `${n(m.capacity)} / ${n(m.Rs)} − 1`, m.ms));
        }
      }
    }
    sections.push({ title: "Bearing and tear-out", lines });
  }

  const it = f.checks.modes.find((m) => m.mode === "interaction");
  const itLines = [];
  if (it.status === "not-evaluated") itLines.push(line("Interaction", "not evaluated", `no allowable entered: ${it.missing.join(", ")}`, null));
  else if (it.Rs === null) itLines.push(line("Interaction", "not computed", it.reason || "", null));
  else {
    itLines.push(line("IF(1)", `(Rs/Fs)^a + (Rt/Ft)^b`, `(${n(it.Rs)}/${n(it.Fs)})^${n(it.a)} + (${n(it.Rt)}/${n(it.Ft)})^${n(it.b)}`, it.IF1));
    if (it.status === "ok") {
      itLines.push(line("k*", "IF(k*) = 1, bracketed Brent", `${it.iterations} iterations`, it.kStar));
      itLines.push(line("MS interaction", "k* − 1", `${n(it.kStar)} − 1`, it.ms));
    } else {
      itLines.push(line("MS interaction", it.status, it.status === "unloaded" ? "no load on this fastener" : "MS not computed", it.ms));
    }
  }
  if (f.checks.governing) itLines.push(line("Governing MS", `minimum across modes: ${f.checks.governing.label}`, "", f.checks.governing.ms));
  sections.push({ title: `Interaction (${result.designBasis} basis)`, lines: itLines });

  return { id: f.id, governing: id === traceFastenerId(result), sections };
}
