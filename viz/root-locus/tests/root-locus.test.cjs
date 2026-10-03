const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const raw = JSON.parse(fs.readFileSync(path.join(dir, 'raw.json'), 'utf8'));

// The page has two inline scripts: the shared beamdswitch report template, then the numeric core, its
// module.exports guard, then UI code that only runs when a document exists. Loading the core here is
// exactly what the guard is for.
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.equal(scripts.length, 2);
const [templateScript, coreScript] = scripts;
/** @typedef {typeof import('../.typecheck/inline/script-3.js')} Core the page's numeric core, typed from its extracted copy */
/** @typedef {Parameters<Core['analyze']>[0]} Inputs */
/** @returns {Core} */
function loadCore() {
  const module = {exports: {}};
  vm.runInNewContext(coreScript, {module, console});
  return /** @type {Core} */ (module.exports);
}
const R = loadCore();
/* A loop's inputs: the blank defaults with the given fields, requirements and settings. */
/** @param {Partial<Omit<Inputs, 'fields' | 'requirements'>> & { fields?: Partial<Inputs['fields']>, requirements?: Partial<Inputs['requirements']> }} over @returns {Inputs} */
const s = over => {
  const base = {schema_version: 1, mode: 's', sampleTime: null, method: null, fields: {C: '1', G: '1', H: '1'},
    delay: {value: 0, padeOrder: 2}, kMax: null, k: 1,
    requirements: {zetaMin: null, wnMin: null, wnMax: null, settlingTime: null}, pins: []};
  return {...base, ...over, fields: {...base.fields, ...(over.fields || {})},
    requirements: {...base.requirements, ...(over.requirements || {})}};
};
// Values created inside the vm context have that context's prototypes; clone them before deep comparisons.
/** @template T @param {T} value @returns {T} */
const plain = value => structuredClone(value);
/** @param {unknown} actual @param {unknown} expected @param {string} [message] */
const same = (actual, expected, message) => assert.deepEqual(plain(actual), expected, message);
/** @param {number} actual @param {number} expected @param {number} tol @param {string} label */
const close = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected}`);
/* The analysis of a loop that computes, and a field that parses. */
/** @param {ReturnType<Core['analyze']>} a */
const computed = a => { assert.ok(a.ok, 'the loop computes'); return a; };
/** @param {ReturnType<Core['parseField']>} f */
const parsed = f => { assert.ok(f.ok, 'the field parses'); return f; };
/* A loop that does not compute, and a field that does not parse. */
/** @param {ReturnType<Core['analyze']>} a */
const refused = a => { assert.ok(!a.ok, 'the loop is refused'); return a; };
/** @param {ReturnType<Core['parseField']>} f */
const unparsed = f => { assert.ok(!f.ok, 'the field is refused'); return f; };

// A minimal browser stand-in: enough DOM for the UI block to run, with traps that record any reach for
// the network, storage or dynamic code.
function loadPage() {
  /** @type {string[]} */
  const reached = [];
  const trap = (/** @type {string} */ name) => ({get() { reached.push(name); return undefined; }, configurable: true});
  /** @type {PropertyDescriptorMap} */
  const traps = {};
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'localStorage', 'sessionStorage',
    'indexedDB', 'eval', 'Function', 'importScripts']) traps[name] = trap(name);
  /** @type {Record<string | symbol, unknown>} */
  const canvasState = {};
  const ctx2d = new Proxy(canvasState, {get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({width: 0}) : () => {}});
  /** @type {Map<string, ReturnType<typeof element>>} */
  const elements = new Map();
  const element = () => {
    /** @type {Record<string, ((event: { type: string }) => void)[]>} */
    const listeners = {};
    return {
      raw: '', get value() { return this.raw; }, set value(v) { this.raw = String(v); }, textContent: '', innerHTML: '', hidden: false, open: false, disabled: false, placeholder: '', width: 0, height: 0,
      scrollHeight: 0, style: {}, dataset: {}, validity: {badInput: false}, files: [], attrs: /** @type {Record<string, string>} */ ({}),
      classList: {add() {}, remove() {}},
      setAttribute(/** @type {string} */ k, /** @type {unknown} */ v) { this.attrs[k] = String(v); }, getAttribute(/** @type {string} */ k) { return this.attrs[k]; },
      addEventListener(/** @type {string} */ type, /** @type {(event: { type: string }) => void} */ fn) { (listeners[type] ||= []).push(fn); },
      dispatchEvent(/** @type {{ type: string }} */ e) { (listeners[e.type] || []).forEach(fn => fn(e)); return true; },
      appendChild() {}, contains() { return false; }, remove() {}, focus() {}, select() {}, click() {}, close() {}, showModal() {},
      scrollIntoView() {}, getBoundingClientRect: () => ({width: 600, height: 400, left: 0, top: 0}), getContext: () => ctx2d,
    };
  };
  const document = {
    activeElement: null, body: element(), documentElement: element(), addEventListener() {}, execCommand: () => true,
    createElement: element,
    getElementById: (/** @type {string} */ id) => { if (!elements.has(id)) elements.set(id, element()); return /** @type {ReturnType<typeof element>} */ (elements.get(id)); },
  };
  Object.defineProperty(document, 'cookie', trap('document.cookie'));
  const window = {devicePixelRatio: 1, addEventListener() {}, matchMedia: () => ({matches: false, addEventListener() {}})};
  Object.defineProperties(window, traps);
  /** @type {Record<string, any>} the page's global scope: browser stand-ins and the module the core exports to */
  const context = {module: {exports: {}}, console, document, window, navigator: {}, location: {search: ''},
    setTimeout: (/** @type {() => void} */ fn) => { fn(); return 0; }, clearTimeout() {}, getComputedStyle: () => ({getPropertyValue: () => '', fontFamily: 'serif'}),
    Event: class { constructor(/** @type {string} */ type) { this.type = type; } }};
  Object.defineProperties(context, traps);
  vm.createContext(context);
  // In a browser there is no module, so the template defines Beamdswitch on the page.
  const module = context.module;
  context.module = undefined;
  vm.runInContext(templateScript, context);
  context.module = module;
  vm.runInContext(coreScript, context);
  const $ = (/** @type {string} */ id) => document.getElementById(id);
  const fire = (/** @type {string} */ id, /** @type {string} */ type) => $(id).dispatchEvent(new context.Event(type));
  return {core: /** @type {Core} */ (context.module.exports), $, fire, reached};
}

test('the page runs its examples, export, import and self-tests without network, storage or eval', () => {
  const page = loadPage();
  assert.match(page.$('badges').innerHTML, /Stable/);
  page.core.EXAMPLES.forEach((ex, i) => {
    page.$('examples').value = String(i);
    page.fire('examples', 'change');
    assert.doesNotMatch(page.$('badges').innerHTML, /Input error/, ex.id);
    assert.equal(page.$('plotNote').textContent, '', ex.id);
    const md = page.core.exportMarkdown(page.core.EXAMPLES[i].inputs, {date: '2026-09-30'});
    page.$('importText').value = md;
    page.fire('importBtn', 'click');
    assert.equal(page.$('importErr').textContent, '', ex.id);
    page.fire('copyBtn', 'click');
    assert.match(page.$('ioStatus').textContent, /Copied/, ex.id);
  });
  page.fire('testBtn', 'click');
  assert.match(page.$('testSummary').innerHTML, /PASS/);
  same(page.reached, []);
});

test('a number box the browser cannot parse is an inline error, not a blank', () => {
  for (const [id, errId] of [['delayTd', 'eD'], ['zetaMin', 'eR'], ['kMax', 'eK']]) {
    const page = loadPage();
    page.$('examples').value = '4';
    page.fire('examples', 'change');
    assert.equal(page.$(errId).textContent, '', id);
    Object.assign(page.$(id), {value: '', validity: {badInput: true}});
    page.fire(id, 'input');
    assert.notEqual(page.$(errId).textContent, '', id);
    assert.match(page.$('plotNote').textContent, /last valid loop/, id);
  }
  const page = loadPage();
  page.$('kBox').value = '';
  page.$('kBox').validity = {badInput: true};
  page.fire('kBox', 'change');
  assert.equal(page.$('kBox').value, '1');
});

test('every built-in verification case passes in Node', () => {
  const result = R.runSelfTests();
  const failed = result.cases.flatMap(c => c.checks.filter(k => !k.pass).map(k => `${c.name} / ${k.label}: expected ${k.expected}, got ${k.computed}`));
  assert.equal(failed.length, 0, failed.join('\n'));
  assert.equal(result.pass, true);
  assert.ok(result.cases.length >= 9);
});

test('section 8 case 1: L = K/(s(s+1)(s+2))', () => {
  const a = computed(R.analyze(s({fields: {G: '1 / (s * (s + 1) * (s + 2))'}})));
  const cross = a.annotations.crossings.find(c => c.omega > 0);
  assert.ok(cross);
  close(cross.k, 6, 1e-8, 'critical K');
  close(cross.omega, Math.SQRT2, 1e-8, 'crossing frequency');
  const [bp] = a.annotations.breakpoints;
  assert.equal(bp.kind, 'breakaway');
  close(bp.x, -0.42264973, 1e-7, 'breakaway');
  close(bp.k, 0.38490018, 1e-7, 'breakaway K');
  const asymptotes = a.annotations.asymptotes;
  assert.ok(asymptotes);
  close(asymptotes.centroid, -1, 1e-12, 'centroid');
  same(asymptotes.angles.map(v => Math.round(v)), [60, 180, 300]);
  assert.equal(a.scan.intervals.length, 1);
  close(a.scan.intervals[0].hi, 6, 1e-8, 'stable up to');
});

test('section 8 case 2: breakaway and break-in of K(s+3)/(s(s+1))', () => {
  const b = computed(R.analyze(s({fields: {G: '(s + 3) / (s * (s + 1))'}}))).annotations.breakpoints;
  const away = b.find(p => p.kind === 'breakaway'), into = b.find(p => p.kind === 'break-in');
  assert.ok(away && into);
  close(away.x, -3 + Math.sqrt(6), 1e-9, 'breakaway');
  close(away.k, 5 - 2 * Math.sqrt(6), 1e-9, 'breakaway K');
  close(into.x, -3 - Math.sqrt(6), 1e-9, 'break-in');
  close(into.k, 5 + 2 * Math.sqrt(6), 1e-9, 'break-in K');
});

test('section 8 case 3: ZOH of 1/(s+1) at T = 1 and the z = -1 crossing', () => {
  const a = computed(R.analyze(s({mode: 'z', sampleTime: 1, method: 'zoh', fields: {G: '1 / (s + 1)'}})));
  const Gz = a.loop.fields.Gz;
  assert.ok(Gz);
  const {num, den} = Gz;
  close(num[0], 1 - Math.exp(-1), 1e-12, 'numerator');
  assert.equal(num.length, 1);
  same(den.length, 2);
  close(den[0], -Math.exp(-1), 1e-12, 'pole');
  assert.equal(R.factoredStr(num, den, 'z', 5), '0.63212 / (z - 0.36788)');
  const c = a.annotations.crossings.find(x => x.point.re === -1);
  assert.ok(c);
  close(c.k, (1 + Math.exp(-1)) / (1 - Math.exp(-1)), 1e-10, 'critical K');
  close(c.omega, Math.PI, 1e-12, 'crossing frequency');
});

test('section 8 cases 4 to 6: no breakaway, improper input and cancellation', () => {
  const a = computed(R.analyze(s({fields: {G: '(s + 1) / (s * (s + 2))'}})));
  same(a.annotations.breakpoints, []);
  same(a.annotations.segments, [[-Infinity, -2], [-1, 0]]);
  const improper = refused(R.analyze(s({fields: {G: 's**2/(s+1)'}})));
  assert.equal(improper.ok, false);
  assert.match(improper.errors.G, /improper.*numerator order 2 exceeds denominator order 1/);
  const cancel = computed(R.analyze(s({fields: {G: '(s+1)/((s+1)*(s+2))'}})));
  assert.ok(cancel.warnings.some(w => w.kind === 'cancellation' && /s = -1/.test(w.text)));
  const hazard = computed(R.analyze(s({fields: {C: '(s - 1)', G: '1 / ((s - 1) * (s + 2) * (s + 3))'}})));
  assert.ok(hazard.warnings.some(w => w.level === 'hazard' && /s = 1/.test(w.text)));
});

test('the parser rejects unsafe and unknown input and names the token', () => {
  for (const [src, pattern] of /** @type {[string, RegExp][]} */ ([
    ["__import__('os')", /`__import__`/], ['s.real', /Attribute access/], ['(s+1).conjugate()', /Attribute access/],
    ['foo', /Unknown name `foo`/], ["open('x')", /Unknown name `open`/], ['s(1)', /cannot be called/],
    ['1 / (s + 1', /Expected `\)`/], ['2s', /`s` after the number `2`/], ['s @ 2', /Unexpected character `@`/],
    ['lambda: 1', /Unknown name `lambda`|Unexpected/], ['s ** 0.5', /whole numbers/], ['[1, 2]', /bare list/],
  ])) {
    const r = unparsed(R.parseField(src, 's', 'G'));
    assert.equal(r.ok, false, src);
    assert.match(r.error, pattern, src);
  }
  const z = unparsed(R.parseField('1 / (s + 1)', 'z', 'C'));
  assert.equal(z.ok, false);
  assert.match(z.error, /in z-mode C is entered in z/);
});

test('the parser accepts the documented forms and normalises polynomials', () => {
  const forms = ['1 / (s * (s + 1) * (s + 2))', "s = tf('s')\n1 / (s * (s + 1) * (s + 2))", 'tf([1], [1, 3, 2, 0])',
    'num = [1,]\nden = [1, 3, 2, 0,]', 'zpk([], [0, -1, -2], 1)', '  0.5 * 2 / (s**3 + 3*s**2 + 2*s)  ', '1/(s^3 + 3*s^2 + 2*s)'];
  for (const src of forms) {
    const r = R.parseField(src, 's', 'G');
    assert.equal(r.ok, true, `${src}: ${r.ok ? '' : r.error}`);
    assert.ok(r.ok);
    same(r.den, [0, 2, 3, 1], src);
    same(r.num, [1], src);
  }
  assert.equal(parsed(R.parseField('1/(s^2 + 1)', 's', 'G')).hints.length, 1);
  const pair = parsed(R.parseField('zpk([], [-1+2j, -1-2j], 5)', 's', 'G'));
  same(pair.den, [5, 2, 1]);
  assert.equal(R.parseField('zpk([], [-1+2j], 5)', 's', 'G').ok, false);
  assert.equal(R.parseField('', 's', 'H').ok, true);
});

test('Tustin, matched and Pade match hand results; order above 12 is refused', () => {
  const tu = R.tustinDiscretise([1], [1, 1], 1);
  close(tu.den[0], -1 / 3, 1e-14, 'Tustin pole');
  close(tu.num[0], 1 / 3, 1e-14, 'Tustin zero term');
  const mt = R.matchedDiscretise([1], [1, 1], 1);
  close(mt.num[1], (1 - Math.exp(-1)) / 2, 1e-14, 'matched gain');
  const zoh2 = R.zohDiscretise([1], [0, 0, 1], 0.5);
  close(zoh2.num[1], 0.125, 1e-13, 'ZOH double integrator');
  close(zoh2.num[0], 0.125, 1e-13, 'ZOH double integrator');
  const p = R.padeApprox(2, 1);
  same(p, {num: [1, -1], den: [1, 1]});
  const big = refused(R.analyze(s({fields: {G: '1 / (s + 1)**13'}})));
  assert.equal(big.ok, false);
  assert.match(big.errors.G, /G has order 13; the limit is 12/);
});

test('ZOH maps repeated poles to exact repeated z-poles and keeps the DC gain', () => {
  for (const [G, T, poles, tol] of /** @type {[string, number, number[], number][]} */ ([['1 / (s + 1)**3', 0.1, [-1, -1, -1], 1e-9], ['1 / (s + 1)**6', 0.5, Array(6).fill(-1), 1e-9],
    ['1 / (s + 1)**12', 0.1, Array(12).fill(-1), 1e-5], ['1 / ((s - 3) * (s + 1)**11)', 0.1, [3, ...Array(11).fill(-1)], 1e-4]])) {
    const g = parsed(R.parseField(G, 's', 'G')), z = R.zohDiscretise(g.num, g.den, T);
    const want = R.pfromRoots(poles.map(p => R.cx(Math.exp(p * T))));
    z.den.forEach((c, i) => close(c, want[i], 1e-12 * Math.max(...want.map(Math.abs)), `${G}: z-denominator coefficient ${i}`));
    const dc = R.pevalR(z.num, 1) / poles.reduce((acc, p) => acc * (1 - Math.exp(p * T)), 1), dcWant = g.num[0] / g.den[0];
    close(dc, dcWant, tol * Math.abs(dcWant), `${G} at T = ${T}: DC gain`);
  }
});

test('distinct close roots stay distinct while true repeated roots merge', () => {
  for (const [G, want] of [['1 / ((s + 1) * (s + 1.0001))', '1 / ((s + 1)*(s + 1.0001))'], ['1 / ((s + 10) * (s + 10.001))', '1 / ((s + 10)*(s + 10.001))'],
    ['1 / (s + 1)**12', '1 / (s + 1)**12'], ['1 / ((s - 3) * (s + 1)**11)', '1 / ((s - 3)*(s + 1)**11)']]) {
    const g = parsed(R.parseField(G, 's', 'G'));
    assert.equal(R.factoredStr(g.num, g.den, 's', 6), want, G);
  }
});

test('on-screen factored form (4 sig figs) never shows distinct close roots as a repeated root', () => {
  for (const [G, want] of [['1 / ((s + 1) * (s + 1.0001))', '1 / ((s + 1)*(s + 1.0001))'], ['1 / ((s + 1) * (s + 2))', '1 / ((s + 1)*(s + 2))'],
    ['1 / (s + 1)**12', '1 / (s + 1)**12'], ['1 / (s**2 * (s + 1.0001) * (s + 1))', '1 / (s**2*(s + 1)*(s + 1.0001))']]) {
    const g = parsed(R.parseField(G, 's', 'G'));
    assert.equal(R.factoredStr(g.num, g.den, 's', 4), want, G);
  }
});

test('ZOH warns when the polynomial G(z) no longer matches the sampled plant', () => {
  const z = (/** @type {string} */ G, /** @type {number} */ T) => computed(R.analyze(s({mode: 'z', sampleTime: T, method: 'zoh', fields: {G}}))).warnings.filter(w => w.kind === 'discretisation');
  same(z('1 / (s + 1)**3', 0.1), []);
  same(z('1 / ((s + 1)**2 * (s**2 + 2*s + 5)**2)', 0.2), []);
  for (const [G, T] of /** @type {[string, number][]} */ ([['1 / (s + 1)**12', 0.1], ['1 / (s + 1)**8', 0.01]])) {
    const [w] = z(G, T);
    assert.ok(w && w.level === 'warn' && /ZOH check/.test(w.text), G);
  }
});

test('an improper plant is flagged even when C makes the loop proper, and a NaN delay is an error', () => {
  const a = computed(R.analyze(s({fields: {C: '1 / (s + 1)**2', G: 's**2 / (s + 1)'}})));
  assert.equal(a.ok, true);
  assert.ok(a.warnings.some(w => w.kind === 'improper' && /^G is improper/.test(w.text)));
  const nan = refused(R.analyze(s({fields: {G: '1 / (s + 1)'}, delay: {value: NaN, padeOrder: 2}})));
  assert.equal(nan.ok, false);
  assert.match(nan.errors.delay, /zero or positive/);
});

test('Markdown export has the sections in order and round-trips through import', () => {
  const inputs = s({fields: {G: '1 / (s * (s + 1) * (s + 2))'}, k: 2, requirements: {zetaMin: 0.5}, pins: [{k: 0.5}, {k: 2}]});
  const md = R.exportMarkdown(inputs, {date: '2026-09-30'});
  const order = ['# Root locus design check', 'Date: 2026-09-30', '## Mode', '## Loop', '## Chosen gain and closed loop',
    '## Closed-loop poles at K = 2', '## Locus annotations', '## Requirements and verdict', '## Pinned points', '## Warnings', '```json'];
  let at = -1;
  for (const heading of order) { const i = md.indexOf(heading); assert.ok(i > at, heading); at = i; }
  assert.match(md, /K = 6 at ω = 1\.41421 rad\/s/);
  assert.match(md, /breakaway at s = -0\.42265 \(K = 0\.3849\)/);
  assert.match(md, /Verdict at K = 2: FAIL/);
  const session = R.createSession();
  const back = R.applyImport(session, md);
  assert.equal(back.error, null);
  same(back.session.inputs.fields, inputs.fields);
  same(back.session.inputs.pins, inputs.pins);
  assert.equal(back.session.inputs.requirements.zetaMin, 0.5);
  assert.equal(R.exportMarkdown(back.session.inputs, {date: '2026-09-30'}), md);
});

test('a corrupt or wrong-version record leaves the session untouched', () => {
  const session = R.createSession(R.EXAMPLES[2].inputs), before = JSON.stringify(session);
  for (const text of ['', 'no json here', '```json\n{"schema_version": 1,\n```', '{"schema_version": 2, "mode": "s", "k": 1}',
    '{"schema_version": 1, "mode": "q", "k": 1}', '{"schema_version": 1, "mode": "s", "k": -1}',
    '{"schema_version": 1, "mode": "s", "k": 1, "fields": {"G": "__import__(\'os\')"}}',
    '{"schema_version": 1, "mode": "s", "k": 1, "extra": true}', '{"schema_version": 1, "mode": "z", "sampleTime": 0, "method": "zoh", "k": 1}']) {
    const r = R.applyImport(session, text);
    assert.ok(r.error, text);
    assert.equal(r.session, session);
    assert.equal(JSON.stringify(session), before);
  }
});

test('branches never swap, including at repeated roots', () => {
  for (const G of ['1 / (s + 1)**3', '1 / (s + 1)**2', '(s + 3) / (s * (s + 1))', '(s**2 + 2*s + 2) / (s*(s + 1)*(s + 5)*(s + 10))', '1 / ((s + 1)**2 * (s + 2)**2)']) {
    const a = computed(R.analyze(s({fields: {G}})));
    assert.equal(R.branchSwaps(a.locus, a.loop.scale), 0, G);
    a.locus.rows.forEach((row, t) => {
      const want = R.proots([...a.loop.den].map((d, i) => d + a.locus.ks[t] * (a.loop.num[i] || 0)));
      assert.equal(row.filter(Boolean).length, want.length, `${G}: root count at sample ${t}`);
    });
  }
});

test('requirement intervals and the nearest miss', () => {
  const a = computed(R.analyze(s({fields: {G: '1 / (s * (s + 1) * (s + 2))'}, requirements: {zetaMin: 0.5}})));
  assert.equal(a.scan.intervals.length, 1);
  const [iv] = a.scan.intervals;
  const zetaAt = (/** @type {number} */ k) => Math.min(...R.closedLoopAt(a, k, {zetaMin: 0.5}).poles.map(p => p.zeta));
  close(zetaAt(iv.hi), 0.5, 1e-6, 'damping at the upper bound');
  const none = computed(R.analyze(s({fields: {G: '1 / (s * (s + 1) * (s + 2))'}, requirements: {settlingTime: 0.5}})));
  same(none.scan.intervals, []);
  assert.equal(none.scan.nearest?.binding, 'settlingTime');
});

test('raw.json publishes the same examples and schema as the page', () => {
  same(raw.examples, JSON.parse(JSON.stringify(R.EXAMPLES)));
  assert.equal(raw.schema_version, R.SCHEMA_VERSION);
  for (const ex of R.EXAMPLES) assert.equal(R.analyze(ex.inputs).ok, true, ex.id);
});

test('WebMCP tools are read-only and return JSON text', async () => {
  let inputs = R.EXAMPLES[0].inputs;
  const tools = R.webmcpTools(() => inputs);
  same(tools.map(t => t.name), ['get_metadata', 'get_current_check', 'analyze_loop', 'export_markdown', 'run_self_tests']);
  const run = async (/** @type {string} */ name, /** @type {Record<string, any> | undefined} */ input) => {
    const t = tools.find(x => x.name === name);
    assert.ok(t, name);
    assert.equal(t.annotations.readOnlyHint, true);
    const out = await t.execute(input);
    return JSON.parse(out.content[0].text);
  };
  assert.equal((await run('get_metadata', {})).schema_version, 1);
  const current = await run('get_current_check', {});
  assert.equal(current.ok, true);
  assert.equal(current.stable, true);
  const other = await run('analyze_loop', {mode: 'z', sampleTime: 1, fields: {G: '1 / (s + 1)'}, k: 3});
  assert.equal(other.stable, false);
  assert.equal(other.discretisedG, '0.632121 / (z - 0.367879)');
  assert.equal((await run('analyze_loop', {fields: {G: 'foo'}})).ok, false);
  assert.match((await run('export_markdown', {})).markdown, /```json/);
  assert.equal((await run('run_self_tests', {})).pass, true);
});
