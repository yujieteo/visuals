// Vendored read-only from yujieteo/beamdswitch src/plot.js at commit 7dfd98d; do not edit here.
// The tests parse beamdiag's beamdswitch decks with beamdswitch's own parser.
// ::: plot — function graphs drawn as SVG, which the animation layer draws
// with Manim's Create. Expressions go through a small parser, never eval,
// because decks are shared text.
//
//   ::: plot
//   x: 0, 1
//   y: 0, 0.02            (optional; fitted to the curves otherwise)
//   xlabel: x / L
//   ylabel: deflection
//   y = x^2 * (3 - 5*x + 2*x^2) / 48
//   y = x^2 * (1 - x)^2 / 24
//   :::

const FUNCS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, ln: Math.log, sqrt: Math.sqrt, abs: Math.abs, atan: Math.atan, asin: Math.asin, acos: Math.acos, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, min: Math.min, max: Math.max };
const CONSTS = { pi: Math.PI, e: Math.E };

// Parse an expression in x into a function. Grammar:
//   sum := prod (('+'|'-') prod)*    prod := unary (('*'|'/'|implicit) unary)*
//   unary := '-' unary | pow         pow := atom ('^' unary)?
//   atom := number | x | const | func '(' args ')' | '(' sum ')'
export function compile(src) {
  const toks = String(src).match(/\d*\.?\d+(?:e[+-]?\d+)?|[A-Za-z_]\w*|\*\*|[-+*/^(),]|\S/gi) || [];
  let i = 0;
  const peek = () => toks[i], take = () => toks[i++];
  const expect = t => { if (take() !== t) throw new Error(`expected ${t} in ${src}`); };
  function sum() {
    let a = prod();
    while (peek() === '+' || peek() === '-') { const op = take(), b = prod(), l = a; a = op === '+' ? x => l(x) + b(x) : x => l(x) - b(x); }
    return a;
  }
  function prod() {
    let a = unary();
    for (;;) {
      const t = peek();
      if (t === '*' || t === '/') { take(); const b = unary(), l = a; a = t === '*' ? x => l(x) * b(x) : x => l(x) / b(x); }
      else if (t !== undefined && (t === '(' || /^[A-Za-z_\d.]/.test(t))) { const b = unary(), l = a; a = x => l(x) * b(x); }
      else return a;
    }
  }
  function unary() {
    if (peek() === '-') { take(); const a = unary(); return x => -a(x); }
    if (peek() === '+') { take(); return unary(); }
    return pow();
  }
  function pow() {
    const a = atom();
    if (peek() === '^' || peek() === '**') { take(); const b = unary(); return x => Math.pow(a(x), b(x)); }
    return a;
  }
  function atom() {
    const t = take();
    if (t === undefined) throw new Error(`unexpected end of ${src}`);
    if (/^\d|^\./.test(t)) { const v = parseFloat(t); return () => v; }
    if (t === '(') { const a = sum(); expect(')'); return a; }
    const n = t.toLowerCase();
    if (n === 'x') return x => x;
    if (Object.hasOwn(CONSTS, n)) { const v = CONSTS[n]; return () => v; }
    if (Object.hasOwn(FUNCS, n)) {
      expect('(');
      const args = [sum()];
      while (peek() === ',') { take(); args.push(sum()); }
      expect(')');
      const f = FUNCS[n];
      return x => f(...args.map(a => a(x)));
    }
    throw new Error(`unknown name "${t}" in ${src}`);
  }
  const f = sum();
  if (i < toks.length) throw new Error(`unexpected "${toks[i]}" in ${src}`);
  return f;
}

export function parsePlot(text) {
  const spec = { x: [0, 1], y: null, xlabel: '', ylabel: '', curves: [], errors: [] };
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = /^([xy])\s*:\s*(.+?)\s*,\s*(.+)$/.exec(line))) {
      try { spec[m[1]] = [compile(m[2])(0), compile(m[3])(0)]; } catch (e) { spec.errors.push(e.message); }
    } else if ((m = /^(xlabel|ylabel)\s*:\s*(.*)$/.exec(line))) spec[m[1]] = m[2];
    else if ((m = /^y\s*=\s*(.+)$/.exec(line))) {
      try { spec.curves.push({ src: m[1], f: compile(m[1]) }); } catch (e) { spec.errors.push(e.message); }
    } else spec.errors.push(`not understood: ${line}`);
  }
  return spec;
}

const W = 1000, H = 520, PAD = { l: 60, r: 20, t: 20, b: 40 };
const COLOURS = ['var(--accent)', 'var(--warm)', 'var(--green)', 'var(--secondary)'];
const fmt = v => (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(1) : +v.toPrecision(3)).toString();

// Sample the curves and build the SVG (axes first, then one path per curve).
export function plotSvg(spec, samples = 240) {
  const [x0, x1] = spec.x;
  const pts = spec.curves.map(c => Array.from({ length: samples + 1 }, (_, k) => {
    const x = x0 + (x1 - x0) * k / samples;
    const y = c.f(x);
    return [x, Number.isFinite(y) ? y : NaN];
  }));
  let [y0, y1] = spec.y || [Infinity, -Infinity];
  if (!spec.y) {
    for (const p of pts) for (const [, y] of p) if (!Number.isNaN(y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (!Number.isFinite(y0)) { y0 = 0; y1 = 1; }
    if (y0 > 0) y0 = 0; if (y1 < 0) y1 = 0;
    const pad = (y1 - y0 || 1) * 0.08;
    if (y1 > 0) y1 += pad;
    if (y0 < 0) y0 -= pad;
  }
  const sx = x => PAD.l + (x - x0) / (x1 - x0 || 1) * (W - PAD.l - PAD.r);
  const sy = y => H - PAD.b - (y - y0) / (y1 - y0 || 1) * (H - PAD.t - PAD.b);
  const zeroY = sy(Math.min(Math.max(0, y0), y1)), zeroX = sx(Math.min(Math.max(0, x0), x1));
  const r = v => v.toFixed(2);
  const axes = `<path class="axis" d="M${r(PAD.l)} ${r(zeroY)}H${r(W - PAD.r)}" />` +
    `<path class="axis" d="M${r(zeroX)} ${r(H - PAD.b)}V${r(PAD.t)}" />`;
  const curves = pts.map((p, i) => {
    let d = '', pen = false;
    for (const [x, y] of p) {
      if (Number.isNaN(y)) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${r(sx(x))} ${r(sy(Math.min(Math.max(y, y0 - (y1 - y0)), y1 + (y1 - y0))))}`;
      pen = true;
    }
    return `<path class="curve" style="stroke:${COLOURS[i % COLOURS.length]}" d="${d}" />`;
  }).join('');
  const ticks = `<div class="pticks"><span>${fmt(x0)}</span><span>${spec.xlabel ? escape(spec.xlabel) : ''}</span><span>${fmt(x1)}</span></div>`;
  return `<div class="plot"><div class="pylab"><span>${spec.ylabel ? escape(spec.ylabel) : ''}</span><span>${fmt(y0)} to ${fmt(y1)}</span></div>` +
    `<svg class="psvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${axes}${curves}</svg>${ticks}</div>`;
}

const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
