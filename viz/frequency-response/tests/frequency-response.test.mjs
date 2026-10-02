import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const engineSrc = /<script id="fr-engine">([\s\S]*?)<\/script>/.exec(html)[1];
const load = (ctx = {}) => { vm.createContext(ctx); vm.runInContext(engineSrc, ctx); return ctx.FreqResponse; };
const F = load();

const close = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected} (±${tol})`);
const third = (K, extra = {}) => ({ plant: { form: "tf", num: [1], den: [1, 3, 2, 0] }, K, ...extra });

test("in-page self-tests (spec section 11, all phases) all pass", () => {
  const t = F.selfTests();
  assert.ok(t.length >= 100);
  assert.equal(t.filter((x) => !x.pass).map((x) => `${x.name}: ${x.detail}`).join("\n"), "");
  assert.ok(t.every((x) => x.tolerance), "every self-test states its tolerance");
});

test("K/(s(s+1)(s+2)): critical gain 6 at √2 rad/s, stable below and unstable above", () => {
  const r6 = F.analyze(third(6));
  assert.equal(r6.margins.phaseCrossovers.length, 1);
  close(r6.margins.phaseCrossovers[0].w, Math.SQRT2, 1e-9, "ω_pc");
  close(r6.margins.phaseCrossovers[0].gmDb, 0, 1e-9, "GM at K = 6");
  assert.equal(r6.checks.find((c) => c.id === "gm").pass, false);
  assert.equal(r6.closedLoop.verdict, "marginal");
  for (const [K, unstable] of [[1, 0], [3, 0], [5.9, 0], [6.1, 2], [9, 2], [60, 2]]) {
    assert.equal(F.analyze(third(K)).closedLoop.unstable, unstable, `K = ${K}`);
  }
  const r3 = F.analyze(third(3));
  close(r3.margins.governing.gmUpper.dB, 20 * Math.log10(2), 1e-9, "GM at K = 3");
  assert.ok(r3.margins.governing.pm.deg > 0);
});

test("phase and delay margins match closed forms", () => {
  // L = 1/s: ω_gc = 1, PM = 90°, delay margin π/2.
  const r = F.analyze({ plant: { form: "tf", num: [1], den: [1, 0] }, K: 1 });
  close(r.margins.governing.pm.w, 1, 1e-12, "ω_gc");
  close(r.margins.governing.pm.deg, 90, 1e-9, "PM");
  close(r.margins.governing.delayMargin.seconds, Math.PI / 2, 1e-9, "DM");
  // L = 2/(s + 1): ω_gc = √3, PM = 180° − atan(√3) = 120°; with τ equal to the delay margin, PM → 0.
  const a = F.analyze({ plant: { form: "tf", num: [2], den: [1, 1] }, K: 1 });
  close(a.margins.governing.pm.deg, 120, 1e-9, "PM of 2/(s+1)");
  const dm = a.margins.governing.delayMargin.seconds;
  close(dm, (120 * Math.PI) / 180 / Math.sqrt(3), 1e-12, "DM of 2/(s+1)");
  const b = F.analyze({ plant: { form: "tf", num: [2], den: [1, 1] }, K: 1, delay: dm });
  close(b.margins.governing.pm.deg, 0, 1e-7, "PM with τ = DM");
});

test("a delay adds exactly −ωτ of phase and every phase crossover is found even when the phase moves fast", () => {
  const tau = 0.5;
  const r = F.analyze(third(3, { delay: tau, range: { auto: false, wMin: 0.01, wMax: 1000, pointsPerDecade: 50 } }));
  assert.equal(r.closedLoop.available, false);
  assert.match(r.closedLoop.message, /delay/);
  // Phase of 3/(jω(jω+1)(jω+2)) − ωτ is monotone, so it crosses each −180° + k·360° once up to its value at ω_max.
  const end = F.responseAt(third(3, { delay: tau }), 1000).phaseDeg;
  const expected = Math.floor((-180 - end) / 360) + 1;
  assert.equal(r.margins.phaseCrossovers.length, expected);
  for (const c of r.margins.phaseCrossovers) close(F.responseAt(third(3, { delay: tau }), c.w).phaseDeg, c.phaseDeg, 1e-6, `crossover at ${c.w}`);
  for (const w of [0.3, 3, 30]) {
    const d = F.responseAt(third(3, { delay: tau }), w).phaseDeg - F.responseAt(third(3), w).phaseDeg;
    close(d, (-w * tau * 180) / Math.PI, 1e-9, `delay phase at ${w}`);
  }
});

test("a conditionally stable loop reports an upper and a lower gain margin and checks both", () => {
  const cond = (K) => ({ plant: { form: "zpk", zeros: [{ re: -0.1, im: 0 }, { re: -0.1, im: 0 }], poles: [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: -10, im: 0 }, { re: -20, im: 0 }], gain: 1 }, K });
  for (const K of [200, 400]) {
    const r = F.analyze(cond(K));
    assert.equal(r.closedLoop.verdict, "stable", `K = ${K}`);
    const { gmUpper, gmLower } = r.margins.governing;
    assert.ok(gmUpper.dB > 6 && gmLower.dB < -6, `K = ${K}: upper ${gmUpper.dB}, lower ${gmLower.dB}`);
    assert.equal(r.checks.find((c) => c.id === "gm").pass, true, `K = ${K}`);
    for (const g of [gmUpper, gmLower]) close(-20 * Math.log10(F.responseAt(cond(K), g.w).mag), g.dB, 1e-9, `GM at ${g.w}`);
    const md = F.toMarkdown(cond(K), r);
    assert.match(md, /\| Upper gain margin \(gain increase\) \| \d/);
    assert.match(md, /\| Lower gain margin \(gain reduction\) \| −\d/);
  }
  const at200 = F.analyze(cond(200)).margins.governing;
  close(at200.gmLower.dB, -25.76, 0.01, "lower margin at K = 200");
  close(at200.gmUpper.dB, 29.28, 0.01, "upper margin at K = 200");
  // Scaling K by the lower margin puts the loop on the boundary.
  assert.equal(F.analyze(cond(200 * Math.pow(10, at200.gmLower.dB / 20))).closedLoop.verdict, "marginal");
  // A lower margin inside the threshold fails the check.
  assert.equal(F.analyze({ ...cond(200), thresholds: { gmDb: 30, pmDeg: 45, ms: 2 } }).checks.find((c) => c.id === "gm").pass, false);
});

test("a finite negative real DC gain is a phase crossover at ω = 0", () => {
  const r = F.analyze({ plant: { form: "tf", num: [2], den: [1, -1] }, K: 1 });
  assert.equal(r.closedLoop.verdict, "stable");
  assert.deepEqual([...r.margins.phaseCrossovers.map((c) => c.w)], [0]);
  close(r.margins.governing.gmLower.dB, -20 * Math.log10(2), 1e-12, "lower GM of 2/(s − 1)");
  assert.equal(r.margins.governing.gmUpper, null);
  assert.equal(r.checks.find((c) => c.id === "gm").pass, true);
  assert.equal(F.analyze({ plant: { form: "tf", num: [2], den: [1, -1] }, K: 0.5 }).closedLoop.verdict, "marginal");
  const neg = F.analyze({ plant: { form: "tf", num: [1], den: [1, 1] }, K: -0.5 });
  assert.equal(neg.margins.phaseCrossovers[0].w, 0);
  close(neg.margins.governing.gmUpper.dB, 20 * Math.log10(2), 1e-12, "upper GM of −0.5/(s + 1)");
  // Biproper loop with L(∞) real negative: the crossover sits at ω = ∞.
  const bi = F.analyze({ plant: { form: "tf", num: [-0.5, -2], den: [1, 1] }, K: 1 });
  assert.equal(bi.margins.governing.gmUpper.w, Infinity);
  close(bi.margins.governing.gmUpper.dB, 20 * Math.log10(2), 1e-12, "upper GM of L(∞) = −0.5");
  assert.equal(bi.margins.governing.gmUpper.atInfinity, true);
  assert.deepEqual([...bi.margins.phaseCrossovers.map((c) => [c.w, c.atInfinity])], [[0, false], [Infinity, true]]);
  assert.equal(r.margins.governing.gmLower.atInfinity, false);
  const biX = { plant: { form: "tf", num: [-0.5, -2], den: [1, 1] }, K: 1 };
  const exported = JSON.parse(F.toResultsJSON(biX, bi)).results.margins;
  assert.deepEqual(exported.governing.gmUpper, { dB: bi.margins.governing.gmUpper.dB, w: null, atInfinity: true });
  assert.deepEqual(exported.phaseCrossovers.map((c) => [c.w, c.atInfinity]), [[0, false], [null, true]]);
});

test("ω = 0 and ω = ∞ crossovers take the limiting phase, not the grid endpoint's", () => {
  const far = (plant, wMin, wMax) => F.analyze({ plant, K: 1, range: { auto: false, wMin, wMax, pointsPerDecade: 50 } });
  const cubic = { form: "zpk", zeros: [], poles: [{ re: -1, im: 0 }, { re: -2, im: 0 }, { re: -3, im: 0 }], gain: -0.5 };
  const dc = far(cubic, 100, 1000).margins.phaseCrossovers.find((c) => c.w === 0);
  assert.equal(dc.phaseDeg, -180);
  close(dc.gmDb, -20 * Math.log10(0.5 / 6), 1e-12, "DC GM");
  // Two RHP zeros: the phase is +180° at DC and −180° at ∞; a range far below the corners must not label ∞ as +180°.
  const bi = { form: "zpk", zeros: [{ re: 1, im: 0 }, { re: 2, im: 0 }], poles: [{ re: -1, im: 0 }, { re: -2, im: 0 }], gain: -0.5 };
  const pcs = far(bi, 0.001, 0.01).margins.phaseCrossovers;
  assert.deepEqual([...pcs.filter((c) => c.w === 0 || c.atInfinity).map((c) => [c.w, c.phaseDeg])], [[0, 180], [Infinity, -180]]);
});

test("a gain crossover with PM ≤ 0 leaves a delay margin of 0", () => {
  const r = F.analyze({ plant: { form: "zpk", zeros: [], poles: [{ re: 0, im: 1 }, { re: 0, im: -1 }], gain: 1 }, K: 0.5 });
  assert.equal(r.margins.gainCrossovers.length, 2);
  assert.equal(r.closedLoop.verdict, "marginal");
  const dm = r.margins.governing.delayMargin;
  assert.equal(dm.seconds, 0);
  close(dm.w, Math.sqrt(1.5), 1e-9, "zero-PM crossover");
  assert.match(dm.message, /PM ≤ 0/);
  assert.match(F.toMarkdown({ plant: { form: "zpk", zeros: [], poles: [{ re: 0, im: 1 }, { re: 0, im: -1 }], gain: 1 }, K: 0.5 }, r), /\| Delay margin \| 0 s \(A gain crossover/);
});

test("|T(0)| cancels common origin zeros and poles", () => {
  // PI(1, 1)·s/(s + 1) = 1, so T = 1/2 at every frequency.
  const x = { plant: { form: "tf", num: [1, 0], den: [1, 1] }, controller: { form: "preset", preset: "pi", params: { kp: 1, ti: 1 } }, K: 1 };
  const r = F.analyze(x);
  close(F.responseAt(x, 1).T, 0.5, 1e-12, "|T|");
  assert.equal(r.margins.resonance.ok, true);
  close(r.margins.resonance.mrDb, 0, 1e-9, "Mr");
});

test("sensitivity peaks, vector margin and bandwidth are consistent with the response", () => {
  const x = third(3);
  const r = F.analyze(x);
  const { Ms, Mt, vectorMargin, bandwidth } = r.margins;
  assert.ok(Ms.ok && Mt.ok && bandwidth.ok);
  close(vectorMargin.value, 1 / Ms.value, 1e-15, "VM = 1/Ms");
  close(F.responseAt(x, Ms.w).S, Ms.value, 1e-12, "|S| at its peak");
  for (const f of [0.9, 1.1]) assert.ok(F.responseAt(x, Ms.w * f).S < Ms.value);
  // Type-1 loop: |T(0)| = 1, so the bandwidth is where |T| = 1/√2.
  close(F.responseAt(x, bandwidth.w).T, Math.SQRT1_2, 1e-9, "|T| at the bandwidth");
});

test("validation blocks bad input with a message and flags soft warnings", () => {
  const bad = F.analyze({ plant: { form: "tf", num: [NaN], den: [0, 0] }, K: 0, delay: -1, range: { auto: false, wMin: 10, wMax: 1, pointsPerDecade: 200 } });
  assert.equal(bad.ok, false);
  const text = bad.errors.map((e) => e.message).join("\n");
  for (const re of [/K must be a non-zero/, /Delay τ must be/, /ω_min must be less than ω_max/, /numerator coefficients/]) assert.match(text, re);
  assert.equal(F.analyze({ plant: { form: "tf", num: [1], den: [0, 0] } }).errors[0].field, "plant.den");
  assert.match(F.analyze({ plant: { form: "zpk", zeros: [{ re: -1, im: 1 }], poles: [], gain: 1 } }).errors[0].message, /conjugate pairs/);
  assert.match(F.analyze({ timeDomain: "hybrid" }).errors[0].message, /continuous or discrete/);
  const codes = (x) => F.analyze(x).warnings.map((w) => w.code);
  assert.ok(codes({ plant: { form: "tf", num: [1, 0, 0], den: [1, 1] } }).includes("improper"));
  assert.ok(codes({ plant: { form: "tf", num: [1], den: [1, -1] }, K: 2 }).includes("rhp-pole"));
  assert.ok(codes({ plant: { form: "tf", num: [1, 1], den: [1, 3, 2] } }).includes("cancellation"));
  assert.ok(codes({ plant: { form: "preset", preset: "second-order", params: { k: 1, wn: 1, zeta: 0 } }, K: 0.5 }).includes("axis-pole"));
  assert.ok(codes(third(3, { delay: 0.1 })).includes("delay-no-poles"));
  assert.ok(codes(third(9)).includes("cl-unstable"));
  const cond = { plant: { form: "zpk", zeros: [{ re: -0.1, im: 0 }, { re: -0.1, im: 0 }], poles: [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: -10, im: 0 }, { re: -20, im: 0 }], gain: 1 }, K: 200 };
  assert.ok(codes(cond).includes("conditional"));
});

test("presets and the three input forms describe the same loop", () => {
  const pid = { form: "preset", preset: "pid", params: { kp: 2, ti: 1.5, td: 0.4, n: 8 } };
  const asTf = F.blockTf(pid), asZpk = F.blockZpk(pid);
  const plant = { form: "tf", num: [1], den: [1, 2, 1, 0] };
  const rs = [pid, asTf, asZpk].map((controller) => F.analyze({ plant, controller, K: 1 }));
  for (const r of rs.slice(1)) {
    close(r.margins.governing.pm.deg, rs[0].margins.governing.pm.deg, 1e-9, "PM");
    close(r.margins.Ms.value, rs[0].margins.Ms.value, 1e-9, "Ms");
  }
  for (const [name, p] of Object.entries(F.PRESETS)) {
    const r = F.analyze({ plant: { form: "preset", preset: name, params: p.params }, K: 1 });
    assert.equal(r.ok, true, name);
  }
});

test("exports carry the disclaimer, use canonical units and round-trip through import", () => {
  const x = F.normalise({ plant: { form: "zpk", zeros: [{ re: -2, im: 0 }], poles: [{ re: -1, im: 3 }, { re: -1, im: -3 }, { re: 0, im: 0 }], gain: 5 }, K: 1.2, delay: 0.02, displayUnits: { freq: "Hz", mag: "abs", phase: "rad", wrapPhase: true } });
  const r = F.analyze(x);
  const md = F.toMarkdown(x, r), res = F.toResultsJSON(x, r), inp = F.toInputsJSON(x), csv = F.toCSV(x);
  for (const text of [md, res, inp, csv]) assert.ok(text.includes(F.DISCLAIMER));
  assert.match(md, /unsourced default/);
  assert.match(md, /## Conventions/);
  const parsed = JSON.parse(res);
  assert.equal(parsed.schemaVersion, F.SCHEMA_VERSION);
  assert.deepEqual(parsed.results.loop.poles[0], { re: -1, im: 3 });
  assert.equal(parsed.displayUnits.freq, "Hz");
  // CSV stays in rad/s and degrees whatever the display toggles say.
  const line = csv.split("\n")[3].split(",").map(Number);
  close(line[1], line[0] / (2 * Math.PI), 1e-12, "Hz column");
  close(line[4], F.responseAt(x, line[0]).phaseDeg, 1e-9, "phase column in unwrapped degrees");
  for (const text of [res, inp]) {
    const back = F.importJSON(text);
    assert.equal(F.canonicalJSON(back), F.canonicalJSON(x));
    assert.equal(F.canonicalJSON(F.analyze(back)), F.canonicalJSON(r));
  }
  assert.throws(() => F.importJSON("{"), /Not valid JSON/);
  assert.throws(() => F.importJSON(JSON.stringify({ schemaVersion: 99 })), /newer/);
  assert.equal(F.importJSON(JSON.stringify({ K: 4 })).K, 4, "a bare inputs object imports too");
});


/* ---------- phase 2: discrete time ---------- */
const Ts = 0.1;
const inZ = (plant, extra = {}) => ({ timeDomain: "discrete", Ts, plant, controller: { form: "tf", num: [1], den: [1] }, discretization: { plant: "z", controller: "z", prewarp: 0 }, K: 1, ...extra });
const fromS = (plant, method, extra = {}) => ({ timeDomain: "discrete", Ts, plant, controller: { form: "tf", num: [1], den: [1] }, discretization: { plant: method, controller: "z", prewarp: 0 }, K: 1, ...extra });
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const horner = (p, z) => p.reduce((v, c) => ({ re: v.re * z.re - v.im * z.im + c, im: v.re * z.im + v.im * z.re }), { re: 0, im: 0 });
const Gs = (s) => cdiv(horner([1, 2], s), horner([1, 0.4, 4], s)); // (s + 2)/(s² + 0.4s + 4)
const plant2 = { form: "tf", num: [1, 2], den: [1, 0.4, 4] };

test("Tustin (with and without prewarp), forward and backward Euler equal G(s) at the substituted s", () => {
  const subs = {
    tustin: (z) => cmul({ re: 2 / Ts, im: 0 }, cdiv({ re: z.re - 1, im: z.im }, { re: z.re + 1, im: z.im })),
    forward: (z) => ({ re: (z.re - 1) / Ts, im: z.im / Ts }),
    backward: (z) => cdiv({ re: z.re - 1, im: z.im }, { re: z.re * Ts, im: z.im * Ts }),
  };
  for (const [method, sub] of Object.entries(subs)) {
    for (const w of [0.3, 2, 9, 25]) {
      const z = { re: Math.cos(w * Ts), im: Math.sin(w * Ts) };
      const got = F.responseAt(fromS(plant2, method), w), want = Gs(sub(z));
      close(got.re, want.re, 1e-9, `${method} Re at ${w}`);
      close(got.im, want.im, 1e-9, `${method} Im at ${w}`);
    }
  }
  const wp = 15, c = wp / Math.tan((wp * Ts) / 2);
  for (const w of [1, 15, 30]) {
    const z = { re: Math.cos(w * Ts), im: Math.sin(w * Ts) };
    const got = F.responseAt(fromS(plant2, "tustin", { discretization: { plant: "tustin", controller: "z", prewarp: wp } }), w);
    const want = Gs(cmul({ re: c, im: 0 }, cdiv({ re: z.re - 1, im: z.im }, { re: z.re + 1, im: z.im })));
    close(got.re, want.re, 1e-9, `prewarped Re at ${w}`);
    close(got.im, want.im, 1e-9, `prewarped Im at ${w}`);
  }
});

test("zero-order hold maps poles to e^(pTs), keeps the DC gain and matches the first-order closed form", () => {
  const r = F.analyze(fromS(plant2, "zoh"));
  const pc = F.analyze({ plant: plant2, K: 1 }).loop.poles;
  for (const p of pc) {
    const e = { re: Math.exp(p.re * Ts) * Math.cos(p.im * Ts), im: Math.exp(p.re * Ts) * Math.sin(p.im * Ts) };
    assert.ok(r.loop.poles.some((q) => Math.hypot(q.re - e.re, q.im - e.im) < 1e-12), `pole e^(pTs) for ${JSON.stringify(p)}`);
  }
  const dc = F.responseAt(fromS(plant2, "zoh"), 1e-6);
  close(dc.re, 0.5, 1e-6, "DC gain G(0) = 0.5");
  // ZOH of a/(s + a) is (1 − e^(−aTs))/(z − e^(−aTs)).
  const a = 3, q = Math.exp(-a * Ts), fo = F.analyze(fromS({ form: "tf", num: [a], den: [1, a] }, "zoh"));
  close(fo.loop.numerator[0], 1 - q, 1e-14, "ZOH numerator");
  close(fo.loop.denominator[1], -q, 1e-14, "ZOH pole");
});

test("relative degree 3: Tustin zeros exactly at −1, backward Euler zeros exactly at 0, s = 0 poles exactly at z = 1", () => {
  const type1 = { form: "tf", num: [1], den: [1, 3, 2, 0] }, distinct = { form: "tf", num: [1], den: [1, 6, 11, 6] };
  for (const plant of [type1, distinct]) {
    for (const [method, z0] of [["tustin", -1], ["backward", 0]]) {
      for (const prewarp of method === "tustin" ? [0, 5] : [0]) {
        const r = F.analyze(fromS(plant, method, { discretization: { plant: method, controller: "z", prewarp } }));
        const label = `${method} prewarp ${prewarp} of ${plant.den}`;
        assert.equal(JSON.stringify(r.loop.zeros.map((z) => [z.re, z.im])), JSON.stringify([[z0, 0], [z0, 0], [z0, 0]]), label);
        if (plant === type1) assert.ok(r.loop.poles.some((p) => p.re === 1 && p.im === 0), `${label}: pole exactly at z = 1`);
        assert.ok(!r.warnings.some((w) => ["rhp-zero", "nonconvergence"].includes(w.code)), `${label}: ${r.warnings.map((w) => w.message).join("; ")}`);
        assert.ok(!r.margins.phaseCrossovers.some((c) => c.atNyquist), `${label}: no crossover at π/Ts`);
        if (method === "tustin") assert.equal(JSON.stringify(r.warnings.filter((w) => w.code === "axis-zero").map((w) => w.message.split(",")[0])), JSON.stringify(["L has 3 zeros at z = −1"]), `${label}: zeros at z = −1 reported once`);
        // num/den agree with the factored form and with the state-space discretisation.
        for (const w of [0.5, 3, 20]) {
          const z = { re: Math.cos(w * Ts), im: Math.sin(w * Ts) };
          const fromPoly = cdiv(horner(r.loop.numerator, z), horner(r.loop.denominator, z));
          const d = F.discretize(plant.num, plant.den, method, Ts, prewarp), ss = cdiv(horner(d.num, z), horner(d.den, z));
          close(fromPoly.re, ss.re, 1e-9 * Math.hypot(ss.re, ss.im), `${label} Re at ${w}`);
          close(fromPoly.im, ss.im, 1e-9 * Math.hypot(ss.re, ss.im), `${label} Im at ${w}`);
        }
      }
    }
  }
});

test("repeated poles: discretised num/den match G(s(z)) exactly and the phase has no spurious crossover near π/Ts", () => {
  const pow = (root, k) => Array.from({ length: k }).reduce((p) => p.map((c, i) => c - root * (p[i - 1] || 0)).concat(-root * p[p.length - 1]), [1]);
  const subs = {
    tustin: (z) => cmul({ re: 2 / Ts, im: 0 }, cdiv({ re: z.re - 1, im: z.im }, { re: z.re + 1, im: z.im })),
    forward: (z) => ({ re: (z.re - 1) / Ts, im: z.im / Ts }),
    backward: (z) => cdiv({ re: z.re - 1, im: z.im }, { re: z.re * Ts, im: z.im * Ts }),
  };
  const wN = Math.PI / Ts;
  for (const [a, k, num] of [[1, 3, [1]], [2, 5, [1]], [1, 3, [1, 2]]]) {
    const plant = { form: "tf", num, den: pow(-a, k) };
    for (const method of ["zoh", "tustin", "forward", "backward"]) {
      const r = F.analyze(fromS(plant, method)), label = `${method} of (${num})/(s + ${a})^${k}`;
      const L = (z) => cdiv(horner(r.loop.numerator, z), horner(r.loop.denominator, z));
      if (method === "zoh") {
        pow(Math.exp(-a * Ts), k).forEach((c, i) => close(r.loop.denominator[i], c, 1e-12 * Math.max(1, Math.abs(c)), `${label} den[${i}]`));
        close(L({ re: 1, im: 0 }).re, num[num.length - 1] / a ** k, 1e-9, `${label} DC gain`);
      } else {
        for (const w of [0.5, 3, 20]) {
          const z = { re: Math.cos(w * Ts), im: Math.sin(w * Ts) }, got = L(z), want = cdiv(horner(num, subs[method](z)), horner(plant.den, subs[method](z)));
          const tol = 1e-8 * Math.hypot(want.re, want.im);
          close(got.re, want.re, tol, `${label} Re at ${w}`);
          close(got.im, want.im, tol, `${label} Im at ${w}`);
        }
      }
      assert.ok(!r.warnings.some((w) => w.code === "nonconvergence"), `${label}: ${r.warnings.map((w) => w.message).join("; ")}`);
      assert.ok(!r.margins.phaseCrossovers.some((c) => !c.atNyquist && c.w > 0.99 * wN), `${label}: no crossover beside π/Ts`);
    }
  }
});

test("discrete phase keeps the atan2 branch for real roots on or outside the unit circle", () => {
  const phase = (x, w) => F.responseAt(x, w).phaseDeg;
  const integ = inZ({ form: "tf", num: [Ts], den: [1, -1] });
  close(phase(integ, 0.01), -90.029, 1e-3, "Ts/(z − 1) near DC");
  close(phase(integ, Math.PI / Ts), -180, 1e-9, "Ts/(z − 1) at π/Ts");
  assert.equal(F.analyze(integ).margins.phaseCrossovers[0].phaseDeg, -180);
  close(phase(inZ({ form: "tf", num: [Ts], den: [1, -1.5] }), 3), -151.517, 1e-3, "Ts/(z − 1.5)");
  close(phase(inZ({ form: "tf", num: [1, -1.5], den: [1, -0.5] }), 3), 118.533, 1e-3, "(z − 1.5)/(z − 0.5)");
  for (const [method, at3] of [["zoh", -226.470], ["tustin", -218.203], ["forward", -240.260], ["backward", -195.701]]) {
    const x = fromS({ form: "tf", num: [1], den: [1, 3, 2, 0] }, method);
    assert.ok(phase(x, 0.01) < -90 && phase(x, 0.01) > -91, `${method} near DC: ${phase(x, 0.01)}`);
    close(phase(x, 3), at3, 1e-3, `${method} at 3 rad/s`);
    assert.equal(F.analyze(x).margins.phaseCrossovers[0].phaseDeg, -180, `${method} crossover phase`);
  }
});

test("discrete phase stays continuous past the level of a complex pole inside the unit circle", () => {
  const rows = F.curves(fromS(plant2, "zoh")), r = F.analyze(fromS(plant2, "zoh"));
  for (let i = 1; i < rows.length; i++) assert.ok(Math.abs(rows[i].phaseDeg - rows[i - 1].phaseDeg) < 90, `jump at ${rows[i].w}`);
  assert.equal(r.margins.phaseCrossovers.length, 1);
  assert.equal(r.margins.phaseCrossovers[0].atNyquist, true);
});

test("L(z) = K·Ts/(z − 1): one exact crossover at the Nyquist frequency, GM = 20·log₁₀(2/(K·Ts)), stable iff 0 < K·Ts < 2", () => {
  for (const [K, verdict] of [[1, "stable"], [10, "stable"], [19.9, "stable"], [20, "marginal"], [20.1, "unstable"], [40, "unstable"]]) {
    const r = F.analyze(inZ({ form: "tf", num: [Ts], den: [1, -1] }, { K }));
    assert.equal(r.closedLoop.verdict, verdict, `K = ${K}`);
    close(r.closedLoop.poles[0].re, 1 - K * Ts, 1e-12, `pole at K = ${K}`);
    assert.equal(r.margins.phaseCrossovers.length, 1, `K = ${K}: one phase crossover`);
    const c = r.margins.phaseCrossovers[0];
    assert.equal(c.w, Math.PI / Ts);
    assert.equal(c.atNyquist, true);
    close(c.gmDb, 20 * Math.log10(2 / (K * Ts)), 1e-9, `GM at K = ${K}`);
    assert.equal(r.grid.wMax, Math.PI / Ts, "grid ends exactly at π/Ts");
    assert.equal(r.warnings.filter((w) => w.code === "nonconvergence").length, 0);
  }
});

test("an integer-sample delay is exact, and the closed-loop poles stay available with it", () => {
  const d = F.analyze(inZ({ form: "tf", num: [1], den: [1] }, { delaySamples: 2, K: 0.5 }));
  assert.equal(d.closedLoop.available, true);
  // z² + 0.5 = 0: poles ±j√0.5, inside the unit circle.
  assert.equal(d.closedLoop.verdict, "stable");
  for (const p of d.closedLoop.poles) close(Math.hypot(p.re, p.im), Math.sqrt(0.5), 1e-12, "|p|");
  assert.equal(F.analyze(inZ({ form: "tf", num: [1], den: [1] }, { delaySamples: 2, K: 1.5 })).closedLoop.verdict, "unstable");
  for (const w of [0.5, 5, 30]) {
    const e = F.responseAt(inZ({ form: "tf", num: [1], den: [1] }, { delaySamples: 4 }), w);
    close(e.mag, 1, 1e-12, "|z^(−4)|");
    close(e.phaseDeg, (-4 * w * Ts * 180) / Math.PI, 1e-9, "phase −dωTs");
  }
  const dm = F.analyze(fromS(plant2, "zoh", { K: 2 })).margins.governing.delayMargin;
  close(dm.samples, dm.seconds / Ts, 1e-12, "delay margin in samples");
});

test("discrete validation: Ts, fractional delay, prewarp, improper blocks, presets in z and the Nyquist cap", () => {
  const err = (x) => F.analyze(x).errors.map((e) => e.message).join("\n");
  assert.match(err(inZ({ form: "tf", num: [1], den: [1, -0.5] }, { Ts: 0 })), /Sample time Ts/);
  assert.match(err(inZ({ form: "tf", num: [1], den: [1, -0.5] }, { delaySamples: 1.5 })), /fractional delays are not supported/);
  assert.match(err(fromS(plant2, "tustin", { discretization: { plant: "tustin", controller: "z", prewarp: 40 } })), /prewarp frequency must be below the Nyquist/);
  assert.match(err(fromS({ form: "tf", num: [1, 0, 0], den: [1, 1] }, "zoh")), /improper/);
  assert.match(err(inZ({ form: "preset", preset: "first-order", params: { k: 1, tau: 1 } })), /presets are continuous-time prototypes/);
  assert.match(err(inZ({ form: "tf", num: [1], den: [1, -0.5] }, { range: { auto: false, wMin: 40, wMax: 50, pointsPerDecade: 100 } })), /below the Nyquist frequency/);
  const clipped = F.analyze(inZ({ form: "tf", num: [1], den: [1, -0.5] }, { range: { auto: false, wMin: 0.1, wMax: 100, pointsPerDecade: 100 } }));
  assert.ok(clipped.warnings.some((w) => w.code === "nyquist-clip"));
  assert.equal(clipped.grid.wMax, Math.PI / Ts);
  const codes = (x) => F.analyze(x).warnings.map((w) => w.code);
  assert.ok(codes(inZ({ form: "tf", num: [1], den: [1, -1.5] })).includes("rhp-pole"));
  assert.ok(codes(inZ({ form: "zpk", zeros: [], poles: [{ re: 0, im: 1 }, { re: 0, im: -1 }], gain: 1 })).includes("axis-pole"));
  assert.ok(codes(inZ({ form: "tf", num: [1, 0, 0], den: [1, -0.5] })).includes("improper"));
});

test("the continuous overlay is present only when every block is discretised from s", () => {
  const both = F.curves({ ...fromS(plant2, "tustin"), discretization: { plant: "tustin", controller: "tustin", prewarp: 0 } });
  assert.ok(both.every((r) => r.contMag !== null && r.asymMagDb === null));
  // Tustin keeps the DC value, so the two curves meet at low frequency.
  close(both[0].mag, both[0].contMag, 1e-6, "overlay at low frequency");
  assert.ok(F.curves(inZ(plant2)).every((r) => r.contMag === null));
  assert.ok(F.curves({ plant: plant2 }).every((r) => r.contMag === null && r.asymMagDb !== null));
});

test("discrete exports carry rad/sample and Ts, and phase 1 input files still import", () => {
  const x = F.normalise({ ...fromS(plant2, "zoh", { delaySamples: 1 }), displayUnits: { freq: "rad/sample" } });
  const md = F.toMarkdown(x);
  assert.match(md, /Ts = 0\.1 s/);
  assert.match(md, /zero-order hold/);
  assert.match(md, /rad\/sample/);
  const csv = F.toCSV(x).split("\n");
  const cols = csv[2].split(","), row = csv[3].split(",").map(Number);
  close(row[cols.indexOf("omega_rad_per_sample")], row[0] * Ts, 1e-15, "rad/sample column");
  const back = F.importJSON(F.toResultsJSON(x));
  assert.equal(F.canonicalJSON(F.analyze(back)), F.canonicalJSON(F.analyze(x)));
  // A phase 1 (schemaVersion 1) inputs file has no discrete fields and stays continuous.
  const v1 = F.importJSON(JSON.stringify({ kind: "frequency-response-inputs", schemaVersion: 1, inputs: { schemaVersion: 1, timeDomain: "continuous", plant: plant2, K: 2, delay: 0.1 } }));
  assert.equal(v1.timeDomain, "continuous");
  assert.equal(F.analyze(v1).ok, true);
  assert.equal(F.normalise({ displayUnits: { freq: "rad/sample" } }).displayUnits.freq, "rad/s", "rad/sample falls back in continuous time");
  close(F.freqTo(Math.PI / Ts, "rad/sample", Ts), Math.PI, 1e-15, "π rad/sample");
  assert.throws(() => F.freqTo(1, "rad/sample"), /Ts/);
});

test("the Markdown report writes a block entered in z in terms of z and one entered in s in terms of s", () => {
  const zmd = F.toMarkdown(inZ({ form: "tf", num: [Ts], den: [1, -1] }));
  assert.ok(zmd.includes("- Plant G: (0.1) / (z − 1) (entered in z)"), zmd);
  const smd = F.toMarkdown(fromS({ form: "tf", num: [1], den: [1, 1] }, "zoh"));
  assert.ok(smd.includes("- Plant G: (1) / (s + 1) (entered in s, discretised by"), smd);
});

test("matrix exponential, characteristic polynomial and state-space round trip", () => {
  const E = F.expm([[-1, 2, 0], [0, -1, 0], [0, 0, 0.5]]);
  // Jordan block [[−1, 2], [0, −1]]: e^(At) = e^(−t)·[[1, 2t], [0, 1]].
  close(E[0][0], Math.exp(-1), 1e-14, "e^A[0][0]"); close(E[0][1], 2 * Math.exp(-1), 1e-14, "e^A[0][1]"); close(E[2][2], Math.exp(0.5), 1e-14, "e^A[2][2]");
  close(E[1][0], 0, 1e-15, "e^A[1][0]");
  assert.equal(F.charPoly([[2, 0], [0, 3]]).map((c) => Math.round(c * 1e12) / 1e12).join(), "1,-5,6");
  const ss = F.tf2ss([2, 3, 1], [1, 4, 5, 2]), back = F.ss2tf(ss);
  const want = [2, 3, 1];
  back.num.forEach((c, i) => close(c, want[i], 1e-12, `num[${i}]`));
  [1, 4, 5, 2].forEach((c, i) => close(back.den[i], c, 1e-12, `den[${i}]`));
});

/* ---------- phase 3: Nyquist and Nichols ---------- */
const nyq = (x) => { const r = F.analyze(x); assert.equal(r.ok, true); return { r, n: r.nyquist }; };

test("Nyquist count Z = N + P agrees with the closed-loop poles across continuous and discrete cases", () => {
  const cases = [
    [{ plant: { form: "tf", num: [1], den: [1, 3, 2, 0] }, K: 3 }, 0, 0, 0],
    [{ plant: { form: "tf", num: [1], den: [1, 3, 2, 0] }, K: 9 }, 2, 0, 2],
    [{ plant: { form: "tf", num: [2], den: [1, -1] }, K: 1 }, -1, 1, 0],
    [{ plant: { form: "tf", num: [0.5], den: [1, -1] }, K: 1 }, 0, 1, 1],
    [{ plant: { form: "tf", num: [1, 1], den: [1, 5, 6, 0, 0] }, K: 3 }, 0, 0, 0],
    [{ plant: { form: "tf", num: [-0.5, -2], den: [1, 1] }, K: 1 }, 1, 0, 1],
    [{ plant: { form: "tf", num: [1, 0, 0], den: [1, 1] }, K: 1 }, 0, 0, 0],
    [inZ({ form: "tf", num: [Ts], den: [1, -1] }, { K: 5 }), 0, 0, 0],
    [inZ({ form: "tf", num: [Ts], den: [1, -1] }, { K: 25 }), 1, 0, 1],
    [inZ({ form: "tf", num: [1], den: [1] }, { delaySamples: 2, K: 1.5 }), 2, 0, 2],
    [fromS({ form: "tf", num: [2], den: [1, -1] }, "zoh"), -1, 1, 0],
    [fromS({ form: "tf", num: [20], den: [1, 3, 2, 0] }, "tustin"), 2, 0, 2],
  ];
  for (const [x, N, P, Z] of cases) {
    const { r, n } = nyq(x);
    const label = JSON.stringify(x.plant) + ` K=${x.K} ${x.timeDomain || "continuous"}`;
    assert.equal(n.available, true, label);
    assert.equal(n.N, N, `N for ${label}`); assert.equal(n.P, P, `P for ${label}`); assert.equal(n.Z, Z, `Z for ${label}`);
    assert.equal(n.unresolved, false, `resolved for ${label}`);
    assert.equal(n.crossCheck.agree, true, `agrees for ${label}`);
    assert.equal(r.closedLoop.unstable, Z);
    close(n.winding, -N, 1e-6, `integer winding for ${label}`);
  }
});

test("the Nyquist count does not depend on a manual display range above a boundary pole", () => {
  const manual = (lo, hi) => ({ range: { auto: false, wMin: lo, wMax: hi, pointsPerDecade: 100 } });
  const cases = [
    // (s − 1)/(s³ + s² + s + 1): poles at ±j and −1, one unstable closed-loop pole at K = 5.
    [{ plant: { form: "tf", num: [1, -1], den: [1, 1, 1, 1] }, K: 5 }, manual(3, 1000)],
    // Ts/(z − 1)·1/(z + 0.5): a unit-circle pole at z = 1 and ω_min far above the auto lower bound.
    [inZ({ form: "tf", num: [Ts], den: [1, -0.5, -0.5] }, { K: 25 }), manual(5, 20)],
    // A unit-circle pair at ±j (ω = π/(2Ts)) with ω_min above it.
    [inZ({ form: "tf", num: [1, -0.2], den: [1, 0, 1] }, { K: 4 }), manual(1.5 * Math.PI / (2 * Ts), 30)],
  ];
  for (const [x, m] of cases) {
    const auto = nyq(x).n, man = nyq({ ...x, ...m });
    const label = JSON.stringify(x.plant) + ` ${x.timeDomain || "continuous"}`;
    assert.equal(auto.unresolved, false, `auto resolved for ${label}`);
    assert.equal(auto.crossCheck.agree, true, `auto agrees for ${label}`);
    for (const k of ["N", "P", "Z", "unresolved"]) assert.equal(man.n[k], auto[k], `${k} for ${label}`);
    assert.equal(man.n.crossCheck.agree, true, `manual agrees for ${label}`);
    assert.ok(!man.r.warnings.some((w) => w.code === "nyquist-unresolved" || w.code === "nyquist-mismatch"), `no Nyquist warning for ${label}`);
    assert.deepEqual(F.nyquistLocus({ ...x, ...m }), F.nyquistLocus(x), `same locus for ${label}`);
  }
});

test("with a continuous delay the Nyquist count is the only verdict and matches the analytic critical delay", () => {
  // 2e^(−sτ)/(s + 1): |L| = 1 at ω = √3; instability once ωτ exceeds π − atan √3, i.e. τ > 2π/(3√3).
  const tauC = (2 * Math.PI) / (3 * Math.sqrt(3));
  for (const [tau, Z] of [[0.9 * tauC, 0], [1.1 * tauC, 2], [3, 2]]) {
    const { r, n } = nyq({ plant: { form: "tf", num: [2], den: [1, 1] }, K: 1, delay: tau });
    assert.equal(r.closedLoop.available, false);
    assert.equal(n.crossCheck.available, false);
    assert.equal(n.Z, Z, `τ = ${tau}`);
    assert.equal(n.unresolved, false);
  }
  const bad = F.analyze({ plant: { form: "tf", num: [1, 0, 0], den: [1, 1] }, K: 1, delay: 0.1 });
  assert.equal(bad.nyquist.available, false);
  assert.ok(bad.warnings.some((w) => w.code === "nyquist-unavailable"));
});

test("a closed-loop pole on the boundary makes the count undefined and is reported, not miscounted", () => {
  const { n, r } = nyq({ plant: { form: "tf", num: [1], den: [1, 3, 2, 0] }, K: 6 });
  assert.equal(n.onContour, true);
  assert.equal(n.verdict, "marginal");
  assert.ok(r.warnings.some((w) => w.code === "nyquist-boundary"));
  assert.ok(!r.warnings.some((w) => w.code === "nyquist-unresolved"));
  const d = nyq(inZ({ form: "tf", num: [Ts], den: [1, -1] }, { K: 20 })).n;
  assert.equal(d.onContour, true);
});

test("the Nyquist locus is the upper contour with indentations; exports mirror it by conjugate symmetry", () => {
  const x = { plant: { form: "tf", num: [1], den: [1, 3, 2, 0] }, K: 3 };
  const loc = F.nyquistLocus(x);
  assert.ok(loc.length > 100);
  assert.equal(loc[0].kind, "indent", "the contour starts round the pole at s = 0");
  const pos = loc.filter((p) => p.kind === "pos");
  const w = pos.map((p) => p.w);
  assert.ok(w.every((v, i) => i === 0 || v >= w[i - 1]), "frequency increases along the upper half");
  for (const p of pos.filter((_, i) => i % 97 === 0)) {
    const e = F.responseAt(x, p.w);
    close(p.re, e.re, 1e-9 * Math.max(1, Math.hypot(e.re, e.im)), `Re L at ${p.w}`);
    close(p.im, e.im, 1e-9 * Math.max(1, Math.hypot(e.re, e.im)), `Im L at ${p.w}`);
  }
  const csv = F.toCSV(x, "nyquist").split("\n").filter((l) => /^(pos|neg|indent|arc),/.test(l)).map((l) => l.split(","));
  assert.equal(csv.length, 2 * loc.length);
  const first = csv[0], mirrored = csv[csv.length - 1];
  close(Number(first[2]), Number(mirrored[2]), 0, "mirror keeps Re L");
  close(Number(first[3]), -Number(mirrored[3]), 0, "mirror negates Im L");
  assert.ok(csv.some((r) => r[0] === "neg" && Number(r[1]) < 0), "negative frequencies are listed");
  const nic = F.toCSV(x, "nichols").split("\n").filter((l) => /^[0-9]/.test(l)).map((l) => l.split(",").map(Number));
  const rows = F.curves(x);
  assert.equal(nic.length, rows.length);
  close(nic[10][1], rows[10].phaseDeg, 0, "Nichols phase column"); close(nic[10][2], 20 * Math.log10(rows[10].mag), 1e-12, "Nichols dB column");
});

test("Nichols contours: closed M > 1 contours, open M < 1 contours, N-contours and the Ms boundary hold their defining values", () => {
  assert.equal(F.mContour(2, -180).length, 2, "two branches round the critical point for M > 1");
  assert.equal(F.mContour(2, -60).length, 0, "no branch far from −180° for M = 2");
  assert.equal(F.mContour(0.5, -60).length, 1, "a single branch for M < 1");
  close(F.mContour(1, -180)[0], 0.5, 1e-15, "M = 1 at φ = −180° is |L| = 1/2");
  for (const [M, ph] of [[2, -170], [0.5, -300], [1.4, -200], [0.9, -45]]) for (const r of F.mContour(M, ph)) {
    const L = { re: r * Math.cos((ph * Math.PI) / 180), im: r * Math.sin((ph * Math.PI) / 180) };
    close(Math.hypot(L.re, L.im) / Math.hypot(1 + L.re, L.im), M, 1e-12, `|T| on M = ${M} at ${ph}°`);
  }
  for (const [psi, ph] of [[-30, -60], [-90, -150], [-120, -170]]) {
    const r = F.nContour(psi, ph);
    assert.ok(r > 0, `N-contour ψ = ${psi} exists at φ = ${ph}`);
    const L = { re: r * Math.cos((ph * Math.PI) / 180), im: r * Math.sin((ph * Math.PI) / 180) };
    const T = cdiv(L, { re: 1 + L.re, im: L.im });
    close(Math.atan2(T.im, T.re), (psi * Math.PI) / 180, 1e-12, `∠T on ψ = ${psi}`);
  }
  for (const r of F.msBoundary(2, -170)) close(Math.hypot(1 + r * Math.cos((-170 * Math.PI) / 180), r * Math.sin((-170 * Math.PI) / 180)), 0.5, 1e-12, "|1 + L| on the Ms boundary");
  assert.equal(F.msBoundary(2, -90).length, 0, "the Ms = 2 boundary does not reach φ = −90°");
  // The loop's own Ms boundary touches its locus: the smallest |1 + L| along the locus is 1/Ms.
  const x = { plant: { form: "tf", num: [1], den: [1, 3, 2, 0] }, K: 3 }, r = F.analyze(x);
  close(Math.min(...F.curves(x).map((d) => 1 / d.S)), 1 / r.margins.Ms.value, 5e-3, "min |1 + L| on the grid is 1/Ms (to grid resolution)");
});

test("the report and WebMCP summary carry the Nyquist count and its convention", () => {
  const x = { plant: { form: "tf", num: [2], den: [1, -1] }, K: 1 };
  const md = F.toMarkdown(x);
  assert.match(md, /## Nyquist stability count/);
  assert.match(md, /N = −?-?1 .*P = 1.*Z = N \+ P = 0/);
  assert.match(md, /Cross-check with the closed-loop poles: agrees/);
  assert.match(md, /clockwise encirclements of −1/);
  const json = JSON.parse(F.toResultsJSON(x));
  assert.equal(json.results.nyquist.Z, 0);
  assert.equal(json.results.nyquist.P, 1);
});

/* ---------- phase 4: MIMO ---------- */
const I2 = [[1, 0], [0, 1]];
const mimo = (mi, extra = {}) => ({ system: "mimo", K: 1, ...extra, mimo: { breakAt: "output", ...mi } });
const sat = () => F.MIMO_PRESETS["spinning-satellite"].make();
const diagTfm = (e1, e2) => ({ form: "tfm", entries: [[e1, { num: [0], den: [1] }], [{ num: [0], den: [1] }, e2]] });

test("a diagonal MIMO loop reproduces its single loops: eigenvalue loci, singular values and det(I + L) winding", () => {
  for (const extra of [{}, { timeDomain: "discrete", Ts, discretization: { plant: "zoh", controller: "z", prewarp: 0 } }]) {
    const e1 = { num: [2], den: [1, -1] }, e2 = { num: [9], den: [1, 3, 2, 0] };
    const x = mimo({ plant: diagTfm(e1, e2), controller: { form: "gain", K: I2 } }, extra);
    const r = F.analyze(x), c = F.mimoCurves(x);
    const one = (e) => ({ plant: { form: "tf", ...e }, controller: { form: "tf", num: [1], den: [1] }, K: 1, ...extra });
    const s1 = F.analyze(one(e1)).nyquist, s2 = F.analyze(one(e2)).nyquist;
    assert.equal(r.nyquist.N, s1.N + s2.N, `N (${extra.timeDomain || "continuous"})`);
    assert.equal(r.nyquist.P, s1.P + s2.P, "P");
    assert.equal(r.nyquist.Z, s1.Z + s2.Z, "Z");
    assert.equal(r.nyquist.crossCheck.agree, true);
    for (const row of c.rows.filter((_, i) => i % 40 === 0)) {
      const a = F.responseAt(one(e1), row.w), b = F.responseAt(one(e2), row.w);
      const want = [a, b].map((v) => ({ re: v.re, im: v.im }));
      const err = (p, q) => Math.hypot(p.re - q.re, p.im - q.im);
      const best = Math.min(err(row.eig[0], want[0]) + err(row.eig[1], want[1]), err(row.eig[0], want[1]) + err(row.eig[1], want[0]));
      assert.ok(best <= 1e-9 * Math.max(1, a.mag, b.mag), `eigenvalues at ${row.w}`);
      const mags = [a.mag, b.mag].sort((p, q) => q - p);
      close(row.sv[0], mags[0], 1e-9 * mags[0], "σ1"); close(row.sv[1], mags[1], 1e-9 * Math.max(mags[1], 1e-12), "σ2");
    }
  }
});

test("generalised Nyquist on det(I + L) agrees with the closed-loop eigenvalues, and a delay leaves it as the only verdict", () => {
  const cases = [
    [mimo({ ...sat() }), 0],
    [mimo({ ...sat() }, { K: -0.5 }), null],
    [mimo({ ...F.MIMO_PRESETS["distillation-lv"].make(), breakAt: "input" }), 0],
    [mimo({ ...sat(), delays: [1, 0] }, { timeDomain: "discrete", Ts: 0.01, discretization: { plant: "zoh", controller: "z", prewarp: 0 } }), null],
    [mimo({ ...sat() }, { K: 3, timeDomain: "discrete", Ts: 0.05, discretization: { plant: "tustin", controller: "z", prewarp: 0 } }), null],
  ];
  for (const [x, Z] of cases) {
    const r = F.analyze(x);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.nyquist.crossCheck.agree, true, `agrees: ${JSON.stringify(x.mimo.preset || x.K)}`);
    assert.equal(r.nyquist.unresolved, false);
    if (Z !== null) assert.equal(r.nyquist.Z, Z);
  }
  const delayed = F.analyze(mimo({ ...sat(), delays: [0.02, 0] }));
  assert.equal(delayed.closedLoop.available, false);
  assert.equal(delayed.nyquist.available, true);
  assert.ok(delayed.warnings.some((w) => w.code === "delay-no-poles"));
});

test("a non-square plant gives the same count at its input and output (Sylvester: det(I + GC) = det(I + CG))", () => {
  const plant = { form: "ss", A: [[-1, 0], [0, -3]], B: [[1, 0, 2], [0, 1, 1]], C: [[1, 0], [1, 1]], D: [[0, 0, 0], [0, 0, 0]] };
  const controller = { form: "gain", K: [[2, 0], [0, 1], [1, -1]] };
  const out = F.analyze(mimo({ plant, controller, breakAt: "output" }, { K: 4 })), inp = F.analyze(mimo({ plant, controller, breakAt: "input" }, { K: 4 }));
  assert.equal(out.loop.outputs, 2); assert.equal(out.loop.inputs, 3);
  assert.equal(out.margins.output.size, 2); assert.equal(out.margins.input.size, 3);
  assert.equal(out.nyquist.Z, inp.nyquist.Z);
  assert.equal(out.nyquist.N, inp.nyquist.N);
  assert.equal(out.margins.chosen.at, "output"); assert.equal(inp.margins.chosen.at, "input");
  close(out.margins.output.returnDifference.alpha, inp.margins.output.returnDifference.alpha, 1e-12, "both breaking points are always reported");
});

test("the stacked transfer-matrix path warns about hidden modes and still agrees with its own eigenvalues", () => {
  // Both entries of the first row share the pole at s = 1: the stacked realisation duplicates it.
  const plant = { form: "tfm", entries: [[{ num: [1], den: [1, -1] }, { num: [2], den: [1, -1] }], [{ num: [1], den: [1, 2] }, { num: [1], den: [1, 3] }]] };
  const r = F.analyze(mimo({ plant, controller: { form: "gain", K: [[3, 0], [0, 3]] } }));
  assert.equal(r.loop.realisation, "stacked transfer matrix");
  assert.equal(r.loop.plantStates, 4);
  assert.ok(r.warnings.some((w) => w.code === "hidden-modes"));
  assert.ok(r.warnings.some((w) => w.code === "hidden-modes-likely"));
  assert.equal(r.loop.openLoopUnstable, 2, "the duplicated unstable pole is counted twice in P");
  assert.equal(r.nyquist.crossCheck.agree, true);
  assert.match(F.toMarkdown(mimo({ plant, controller: { form: "gain", K: I2 } })), /hidden/);
});

test("a 1 × 1 MIMO loop matches the single-loop path, including discretisation", () => {
  // 3/(s(s + 1)(s + 2)) in controllable canonical form; its crossovers are well away from the ±180° phase-margin ambiguity.
  const siso = { plant: { form: "tf", num: [1], den: [1, 3, 2, 0] }, controller: { form: "tf", num: [1], den: [1] }, K: 3 };
  const ss = { form: "ss", A: [[0, 1, 0], [0, 0, 1], [0, -2, -3]], B: [[0], [0], [1]], C: [[1, 0, 0]], D: [[0]] };
  for (const extra of [{}, { timeDomain: "discrete", Ts: 0.1, discretization: { plant: "zoh", controller: "z", prewarp: 0 } }, { timeDomain: "discrete", Ts: 0.1, discretization: { plant: "tustin", controller: "z", prewarp: 3 } }]) {
    const x = mimo({ plant: ss, controller: { form: "gain", K: [[1]] }, delays: [0] }, { K: 3, ...extra });
    const c = F.mimoCurves(x);
    for (const row of c.rows.filter((_, i) => i % 60 === 0)) {
      const e = F.responseAt({ ...siso, ...extra }, row.w), m = row.entries[0][0];
      close(m.re, e.re, 1e-9 * Math.max(1, e.mag), `Re at ${row.w}`); close(m.im, e.im, 1e-9 * Math.max(1, e.mag), `Im at ${row.w}`);
    }
    const a = F.analyze(x), b = F.analyze({ ...siso, ...extra });
    assert.equal(a.nyquist.Z, b.nyquist.Z);
    close(a.margins.chosen.loopAtATime[0].pm.deg, b.margins.governing.pm.deg, 1e-6, "loop-at-a-time PM = SISO PM");
    close(a.margins.chosen.eigenLocus.pm.deg, b.margins.governing.pm.deg, 1e-6, "eigenvalue-locus PM = SISO PM");
    close(a.margins.chosen.sensitivity.maxSigmaS.value, b.margins.Ms.value, 1e-6, "max σ(S) = Ms");
  }
});

test("MIMO validation blocks bad dimensions, too many channels and fractional discrete delays", () => {
  const err = (x) => F.analyze(x).errors.map((e) => e.message).join("\n");
  assert.match(err(mimo({ plant: { form: "ss", A: [[0]], B: [[1, 1]], C: [[1]], D: [[0, 0], [0, 0]] }, controller: { form: "gain", K: I2 } })), /matching dimensions/);
  assert.match(err(mimo({ ...sat(), controller: { form: "gain", K: [[1, 0, 0], [0, 1, 0]] } })), /Controller C must be 2 × 2/);
  const big = Array.from({ length: 7 }, (_, i) => Array.from({ length: 7 }, (_, j) => (i === j ? 1 : 0)));
  assert.match(err(mimo({ plant: { form: "ss", A: [], B: [], C: [], D: big }, controller: { form: "gain", K: big } })), /At most 6 inputs and 6 outputs/);
  assert.match(err(mimo({ ...sat(), delays: [0.5, 0] }, { timeDomain: "discrete", Ts: 0.1, discretization: { plant: "zoh", controller: "z", prewarp: 0 } })), /whole number of samples/);
  assert.match(err(mimo({ ...sat(), delays: [1] })), /one per plant input/);
  assert.match(err(mimo({ plant: { form: "tfm", entries: [[{ num: [1, 0, 0], den: [1, 1] }]] }, controller: { form: "gain", K: [[1]] } })), /improper/);
});

test("high-gain MIMO loops close the det(I + L) contour where it has settled and agree with the closed-loop eigenvalues", () => {
  // 1/(s + 1)² is stable for every K > 0; before the contour ran far enough, K = 1e6 and 1e8 gave a spurious Z = 1.
  const lag2 = { form: "ss", A: [[0, 1], [-1, -2]], B: [[0], [1]], C: [[1, 0]], D: [[0]] };
  // (s + 2)/(s + 1) has feedthrough 1, so det(I + L) tends to 1 + K rather than 1.
  const lead = { form: "ss", A: [[-1]], B: [[1]], C: [[1]], D: [[1]] };
  const twoByTwo = { form: "ss", A: [[0, 1, 0, 0], [-1, -2, 0, 0], [0, 0, -1, 0], [0, 0, 0, -3]], B: [[0, 0], [1, 0], [1, 1], [0, 1]], C: [[1, 0, 1, 0], [0, 0, 0, 1]], D: [[0, 0], [0, 0]] };
  for (const [plant, K] of [[lag2, 1e4], [lag2, 1e6], [lag2, 1e8], [lead, 1e6], [twoByTwo, 1e6], [twoByTwo, 1e8]]) {
    const size = plant.D.length;
    const r = F.analyze(mimo({ plant, controller: { form: "gain", K: plant.D[0].map((_, i) => plant.D.map((__, j) => (i === j ? 1 : 0))) } }, { K }));
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.closedLoop.available, true);
    assert.equal(r.nyquist.Z, r.closedLoop.unstable, `${size} × ${size} at K = ${K}: Z = ${r.nyquist.Z}, eigenvalues ${r.closedLoop.unstable}`);
    assert.equal(r.nyquist.crossCheck.agree, true);
    assert.ok(!r.warnings.some((w) => w.code === "nyquist-mismatch"));
  }
});

test("a continuous delay keeps the det(I + L) contour running until it settles, and a delayed feedthrough path gives no count", () => {
  // (s + 2)/(s + 1) with a 0.01 s input delay and controller 1/(s + 1), K = 1e6: only the plant has feedthrough, so det(I + L) → 1.
  // Stopping at 100/τ = 1e4 rad/s used to report Z = 32. |L| ≈ K/ω stays above 1 up to 1e6 rad/s while the delay turns it once per
  // 2π/τ, so each half of the contour encircles the origin 1592 times (checked against a dense sweep): Z = 3184, the same as the single loop.
  const plant = { form: "ss", A: [[-1]], B: [[1]], C: [[1]], D: [[1]] };
  const r = F.analyze(mimo({ plant, controller: { form: "ss", A: [[-1]], B: [[1]], C: [[1]], D: [[0]] }, delays: [0.01] }, { K: 1e6 }));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.closedLoop.available, false);
  assert.ok(r.nyquist.wHigh >= 1e7, `contour ends at ${r.nyquist.wHigh} rad/s`);
  assert.equal(r.nyquist.unresolved, false);
  assert.equal(r.nyquist.Z, 3184);
  assert.equal(F.analyze({ plant: { form: "tf", num: [1, 2], den: [1, 2, 1] }, K: 1e6, delay: 0.01 }).nyquist.Z, 3184, "single-loop count of the same loop");
  // A gain controller passes the delayed plant feedthrough straight round the loop: det(I + L) never settles.
  const fed = F.analyze(mimo({ plant, controller: { form: "gain", K: [[1]] }, delays: [0.01] }, { K: 0.5 }));
  assert.equal(fed.ok, true);
  assert.equal(fed.nyquist.available, false);
  assert.match(fed.nyquist.message, /delayed feedthrough/);
  assert.ok(fed.warnings.some((w) => w.code === "nyquist-unavailable"));
  // The same loop without the delay settles at det(I + D_G·D_C) = 1.5 and agrees with its eigenvalues.
  const free = F.analyze(mimo({ plant, controller: { form: "gain", K: [[1]] }, delays: [0] }, { K: 0.5 }));
  assert.equal(free.nyquist.crossCheck.agree, true);
});

test("an undelayed feedthrough channel does not force delay refinement of det(I + L) to the evaluation cap", () => {
  // diag(e^(−0.1s)/(s + 1), 1) with K·I: det(I + L) = (1 + K·e^(−0.1s)/(s + 1))·(1 + K), so the count is that of the single delayed loop.
  const plant = { form: "ss", A: [[-1]], B: [[1, 0]], C: [[1], [0]], D: [[0, 0], [0, 1]] };
  for (const K of [1, 100, 1e4]) {
    const r = F.analyze(mimo({ plant, controller: { form: "gain", K: I2 }, delays: [0.1, 0] }, { K }));
    const single = F.analyze({ plant: { form: "tf", num: [1], den: [1, 1] }, K, delay: 0.1 }).nyquist;
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.nyquist.unresolved, false, `K = ${K}: ${r.nyquist.evaluations} evaluations`);
    assert.equal(single.unresolved, false);
    assert.equal(r.nyquist.Z, single.Z, `K = ${K}`);
  }
});

test("MIMO peaks and crossings are refined between grid points, so the grid density does not change them", () => {
  const coarse = { range: { auto: false, wMin: 0.1, wMax: 1000, pointsPerDecade: 10 } }, fine = { range: { auto: false, wMin: 0.1, wMax: 1000, pointsPerDecade: 60 } };
  for (const breakAt of ["output", "input"]) {
    const a = F.analyze(mimo({ ...F.MIMO_PRESETS["distillation-lv"].make(), breakAt }, coarse)).margins.chosen;
    const b = F.analyze(mimo({ ...F.MIMO_PRESETS["distillation-lv"].make(), breakAt }, fine)).margins.chosen;
    close(a.sensitivity.maxSigmaS.value, b.sensitivity.maxSigmaS.value, 1e-6, `max σ(S) at the ${breakAt}`);
    close(a.sensitivity.maxSigmaT.value, b.sensitivity.maxSigmaT.value, 1e-6, `max σ(T) at the ${breakAt}`);
    close(a.eigenLocus.pm.deg, b.eigenLocus.pm.deg, 1e-6, `eigenvalue-locus PM at the ${breakAt}`);
    a.loopAtATime.forEach((c, i) => c.pm && close(c.pm.deg, b.loopAtATime[i].pm.deg, 1e-6, `loop-at-a-time PM ${i + 1}`));
  }
  assert.equal(F.analyze(mimo({ ...sat() }, { range: { auto: true, wMin: 0.01, wMax: 100, pointsPerDecade: 2000 } })).grid.pointsPerDecade, 60);
});

test("transfer-matrix plants of any size default to zero delays shaped for the plant", () => {
  const e = (a) => ({ num: [1], den: [1, a] });
  for (const entries of [[[e(1)]], [[e(1), e(2), e(3)]], [[e(1)], [e(2)], [e(3)]]]) {
    const plant = { form: "tfm", entries }, p = entries.length, m = entries[0].length;
    const controller = { form: "gain", K: Array.from({ length: m }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? 1 : 0))) };
    const x = { system: "mimo", K: 1, mimo: { plant, controller } };
    const r = F.analyze(x);
    assert.equal(r.ok, true, `${p} × ${m}: ${JSON.stringify(r.errors)}`);
    const plain = (v) => JSON.parse(JSON.stringify(v));
    assert.deepEqual(plain(r.loop.delays), new Array(m).fill(0));
    assert.deepEqual(plain(F.normalise(x).mimo.delays), new Array(m).fill(0));
    assert.deepEqual(plain(F.normalise({ ...x, mimo: { ...x.mimo, delayAt: "output" } }).mimo.delays), new Array(p).fill(0));
    assert.deepEqual(plain(F.normalise({ ...x, mimo: { ...x.mimo, delayAt: "entry" } }).mimo.delays), Array.from({ length: p }, () => new Array(m).fill(0)));
  }
});

test("MIMO delays per plant output and per plant entry are exact in continuous and discrete time", () => {
  const ph = (row, i, j) => Math.atan2(row.entries[i][j].im, row.entries[i][j].re);
  const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  const cases = [
    ["output", [0.02, 0.05], (i) => [0.02, 0.05][i]],
    ["entry", [[0.01, 0], [0.04, 0.03]], (i, j) => [[0.01, 0], [0.04, 0.03]][i][j]],
    ["input", [0.03, 0.01], (i, j) => [0.03, 0.01][j]],
  ];
  for (const [delayAt, delays, tau] of cases) {
    // K = I and the loop broken at the output: L = G_τ, so each entry is G_ij·e^(−jωτ_ij).
    const range = { auto: false, wMin: 0.1, wMax: 100, pointsPerDecade: 50 };
    const free = F.mimoCurves(mimo({ ...sat() }, { range })), x = mimo({ ...sat(), delayAt, delays }, { range });
    const c = F.mimoCurves(x), r = F.analyze(x);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.loop.delayAt, delayAt);
    assert.equal(r.closedLoop.available, false);
    assert.equal(r.nyquist.available, true);
    assert.equal(c.rows.length, free.rows.length);
    c.rows.filter((_, k) => k % 20 === 0).forEach((row) => {
      const k = c.rows.indexOf(row);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        close(row.entries[i][j].mag, free.rows[k].entries[i][j].mag, 1e-12 * Math.max(1, row.entries[i][j].mag), `|L${i + 1}${j + 1}| ${delayAt}`);
        close(wrap(ph(row, i, j) - ph(free.rows[k], i, j) + row.w * tau(i, j)), 0, 1e-9, `∠L${i + 1}${j + 1} ${delayAt} at ${row.w}`);
      }
    });
  }
  // Discrete: whole-sample delays become shift-register states, so the closed-loop eigenvalues stay available and agree.
  // Per entry, each output row gets its own copy of the plant, so the plant must be stable for the copies to stay harmless.
  // K = 0.01·I broken at the output keeps L = 0.01·G_τ and the closed loop stable.
  const disc = { timeDomain: "discrete", Ts: 0.5, discretization: { plant: "zoh", controller: "z", prewarp: 0 }, range: { auto: false, wMin: 0.001, wMax: 6, pointsPerDecade: 50 } };
  const lv = () => ({ plant: F.MIMO_PRESETS["distillation-lv"].make().plant, controller: { form: "gain", K: [[0.01, 0], [0, 0.01]] } });
  const dcases = [["output", [2, 1], (i) => [2, 1][i], 3], ["entry", [[1, 0], [2, 1]], (i, j) => [[1, 0], [2, 1]][i][j], 2 + 4]];
  for (const [delayAt, delays, d, extraStates] of dcases) {
    const free = F.mimoCurves(mimo({ ...lv() }, disc)), x = mimo({ ...lv(), delayAt, delays }, disc);
    const c = F.mimoCurves(x), r = F.analyze(x);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.loop.plantStates, 2 + extraStates, `${delayAt} realisation size`);
    assert.equal(r.nyquist.crossCheck.available, true);
    assert.equal(r.nyquist.crossCheck.agree, true, `${delayAt}: Z = ${r.nyquist.Z}, eigenvalues ${r.closedLoop.unstable}`);
    assert.equal(c.rows.length, free.rows.length);
    for (const k of [0, 60, 120, c.rows.length - 1]) {
      const row = c.rows[k];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        close(row.entries[i][j].mag, free.rows[k].entries[i][j].mag, 1e-9 * Math.max(1, row.entries[i][j].mag), `|L${i + 1}${j + 1}| ${delayAt} discrete`);
        close(wrap(ph(row, i, j) - ph(free.rows[k], i, j) + row.w * 0.5 * d(i, j)), 0, 1e-9, `∠L${i + 1}${j + 1} ${delayAt} discrete at ${row.w}`);
      }
    }
    if (delayAt === "entry") assert.ok(r.warnings.some((w) => w.code === "delay-copies"));
  }
  const err = (x) => F.analyze(x).errors.map((e) => e.message).join("\n");
  assert.match(err(mimo({ ...sat(), delayAt: "output", delays: [0.1] })), /one per plant output/);
  assert.match(err(mimo({ ...sat(), delayAt: "entry", delays: [0.1, 0.2] })), /2 × 2 matrix/);
  assert.match(err(mimo({ ...sat(), delayAt: "sideways" })), /per plant entry/);
  assert.match(F.toMarkdown(mimo({ ...sat(), delayAt: "entry", delays: [[0.01, 0], [0.04, 0.03]] })), /Delays: 0\.01, 0; 0\.04, 0\.03 s \(per plant entry\)/);
});

test("a 6 × 6 MIMO loop at the state limit is analysed in full, and more states are refused", () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const plant = (n) => ({
    form: "ss", A: Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? -1 - 0.3 * i : 0.2 * rnd()))),
    B: Array.from({ length: n }, () => Array.from({ length: 6 }, rnd)), C: Array.from({ length: 6 }, () => Array.from({ length: n }, rnd)), D: Array.from({ length: 6 }, () => new Array(6).fill(0)),
  });
  const K = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => (i === j ? 5 : 0)));
  const r = F.analyze(mimo({ plant: plant(48), controller: { form: "gain", K } }));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.nyquist.crossCheck.agree, true);
  for (const at of ["output", "input"]) assert.equal(r.margins[at].loopAtATime.length, 6);
  assert.match(F.analyze(mimo({ plant: plant(51), controller: { form: "gain", K } })).errors.map((e) => e.message).join("\n"), /about 50 states/);
});

test("MIMO exports carry both breaking points, every view as CSV, and round-trip through import", () => {
  const x = F.normalise(mimo({ ...F.MIMO_PRESETS["distillation-lv"].make(), breakAt: "input", delays: [1, 0] }, { timeDomain: "discrete", Ts: 0.5, discretization: { plant: "zoh", controller: "tustin", prewarp: 0 }, K: 0.8 }));
  const r = F.analyze(x);
  const md = F.toMarkdown(x, r);
  for (const re of [/Plant output \(L_o\) \| Plant input \(L_i\)/, /Return difference/, /Loop-at-a-time/, /Generalised Nyquist on det\(I \+ L\)/, /Disk margins and structured singular value/]) assert.match(md, re);
  assert.ok(md.includes(F.DISCLAIMER));
  for (const [view, head] of [["bode", "mag_L11"], ["singular", "sigma_min_I_plus_L"], ["nyquist", "re_det_I_plus_L"], ["eig", "re_lambda_1"], ["nichols", "phase_deg_lambda_1"]]) {
    const csv = F.toCSV(x, view);
    assert.ok(csv.includes(F.DISCLAIMER), view);
    assert.ok(csv.includes(head), `${view} has ${head}`);
  }
  const back = F.importJSON(F.toResultsJSON(x, r));
  assert.equal(F.canonicalJSON(F.analyze(back)), F.canonicalJSON(r));
  assert.equal(back.system, "mimo");
  const siso = F.importJSON(JSON.stringify({ kind: "frequency-response-inputs", schemaVersion: 2, inputs: { plant: { form: "tf", num: [1], den: [1, 1] }, K: 2 } }));
  assert.equal(siso.system, "siso", "older files without system stay single-loop");
});

test("kernel: Hessenberg-QR eigenvalues keep trace and determinant, and the Jacobi SVD matches eig(AᴴA)", () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (const n of [3, 8, 25]) {
    const A = Array.from({ length: n }, () => Array.from({ length: n }, rnd));
    const { values, converged } = F.ceig(A);
    assert.equal(converged, true);
    const tr = A.reduce((t, row, i) => t + row[i], 0);
    close(values.reduce((t, v) => t + v.re, 0), tr, 1e-10, `trace n = ${n}`);
    close(values.reduce((t, v) => t + v.im, 0), 0, 1e-10, `imaginary sum n = ${n}`);
    const det = F.cdet(F.toC(A)), prod = values.reduce((p, v) => ({ re: p.re * v.re - p.im * v.im, im: p.re * v.im + p.im * v.re }), { re: 1, im: 0 });
    close(prod.re, det.re, 1e-9 * Math.max(1, Math.abs(det.re)), `det n = ${n}`);
    const sv = F.csvd(A), AtA = A[0].map((_, i) => A[0].map((__, j) => A.reduce((t, row) => t + row[i] * row[j], 0)));
    const ev = F.ceig(AtA).values.map((v) => Math.sqrt(Math.max(0, v.re))).sort((a, b) => b - a);
    sv.forEach((v, i) => close(v, ev[i], 1e-8 * Math.max(1, ev[0]), `σ${i + 1} n = ${n}`));
  }
});

test("raw.json is the published metadata and default example of the page", async () => {
  const raw = JSON.parse(await readFile(new URL("../raw.json", import.meta.url), "utf8"));
  const { schemaVersion, example, ...meta } = raw;
  assert.equal(schemaVersion, F.SCHEMA_VERSION);
  assert.deepEqual(example, JSON.parse(JSON.stringify(F.defaultInputs())));
  assert.deepEqual(meta, JSON.parse(JSON.stringify(F.META)));
});

test("the engine runs without DOM, storage, clock or randomness and is deterministic", () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`
    for (const name of ["document", "window", "localStorage", "location", "navigator"])
      Object.defineProperty(globalThis, name, { get() { throw new Error(name + " touched"); } });
    Math.random = () => { throw new Error("Math.random touched"); };
    Date = new Proxy(Date, { get() { throw new Error("Date touched"); }, construct() { throw new Error("Date touched"); } });
    var self = globalThis;`, ctx);
  const G = load(ctx);
  const run = (api) => JSON.stringify([api.analyze(api.defaultInputs()), api.toCSV(third(3, { delay: 0.1 })), api.selfTests()]);
  assert.equal(run(G), run(G));
  assert.equal(run(G), run(F));
});

test("the delivered page is a single file that loads no external resources", () => {
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+stylesheet|https?:\/\/(?!www\.w3\.org)/);
});

test("page registers its WebMCP tools", async () => {
  // The tools the page registers; the site's catalogue stub (data/visuals/frequency-response.yaml in yujieteo/site) names the same set.
  const names = ["get_metadata", "get_current_system", "analyze_loop", "run_self_tests"];
  const inert = () => new Proxy(function () {}, {
    get: (t, k) => (k === "modelContext" ? undefined : k === Symbol.iterator ? [][Symbol.iterator] : k === Symbol.toPrimitive ? () => 0 : inert()),
    set: () => true, apply: () => inert(), construct: () => inert(),
  });
  const tools = [];
  const ctx = vm.createContext({
    document: inert(), addEventListener() {}, requestAnimationFrame() {}, cancelAnimationFrame() {}, getComputedStyle: inert(),
    navigator: { modelContext: { registerTool: (t) => tools.push(t) } }, Blob: function () {}, URL: inert(),
  });
  ctx.self = ctx; ctx.window = ctx;
  for (const m of html.matchAll(/<script id="[^"]+">([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
  assert.deepEqual(tools.map((t) => t.name), names);
  const call = async (name, input) => JSON.parse((await tools.find((t) => t.name === name).execute(input)).content[0].text);
  const a = await call("analyze_loop", third(6));
  close(a.phase_crossovers[0].gmDb, 0, 1e-9, "analyze_loop GM");
  close(a.phase_crossovers[0].w, Math.SQRT2, 1e-9, "analyze_loop ω_pc");
  const inf = await call("analyze_loop", { plant: { form: "tf", num: [-0.5, -2], den: [1, 1] }, K: 1 });
  assert.equal(inf.governing.gmUpper.atInfinity, true);
  assert.deepEqual(inf.phase_crossovers.map((c) => c.atInfinity), [false, true]);
  assert.match((await call("analyze_loop", { K: 0 })).errors[0].message, /non-zero/);
  const cur = await call("get_current_system", {});
  assert.equal(cur.inputs.K, 3);
  assert.equal(cur.closed_loop.verdict, "stable");
  const t = await call("run_self_tests", {});
  assert.equal(t.passed, t.total);
  const meta = await call("get_metadata", {});
  assert.match(meta.disclaimer, /EXPLORATION ONLY/);
  assert.equal(meta.thresholdDefaults.source, "unsourced default");
  const m = await call("analyze_loop", { system: "mimo", K: 1, mimo: { ...F.MIMO_PRESETS["spinning-satellite"].make(), breakAt: "output" } });
  assert.equal(m.system, "mimo");
  close(m.margins.chosen.eigenLocus.pm.deg, (Math.atan(0.1) * 180) / Math.PI, 1e-6, "analyze_loop MIMO eigenvalue-locus PM");
});

test("Mr and bandwidth explain why they are undefined when |T(0)| is 0 or unbounded", () => {
  // A zero at DC makes L(0) = 0, so |T(0)| = 0.
  const r0 = F.analyze({ plant: { form: "tf", num: [1, 0], den: [1, 1, 1] }, K: 1 }).margins;
  assert.equal(r0.resonance.ok, false);
  assert.match(r0.resonance.message, /\|T\(0\)\| = 0/);
  assert.equal(r0.bandwidth.message, r0.resonance.message);
  // L = −1/(s + 1) gives 1 + L(0) = 0: a closed-loop pole at s = 0 and a 0 dB gain margin at DC.
  const r1 = F.analyze({ plant: { form: "tf", num: [1], den: [1, 1] }, K: -1 }).margins;
  assert.equal(r1.resonance.ok, false);
  assert.match(r1.resonance.message, /1 \+ L vanishes at DC \(a closed-loop pole at s = 0\)/);
  assert.equal(r1.governing.gmUpper.w, 0);
  close(r1.governing.gmUpper.dB, 0, 1e-12, "GM at DC");
});

test("every CSV view of blocked inputs carries the disclaimer and the reason, and no data rows", () => {
  for (const system of ["siso", "mimo"]) {
    for (const view of ["bode", "singular", "nyquist", "nichols", "eig"]) {
      const csv = F.toCSV({ system, K: NaN }, view);
      assert.equal(csv, `# ${F.DISCLAIMER}\n# No data: the inputs have blocking errors.\n`, `${system} ${view}`);
    }
  }
});
