import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const engineSrc = /<script id="grep-engine">([\s\S]*?)<\/script>/.exec(html)[1];
const uiSrc = /<script id="grep-ui">([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = {};
vm.createContext(ctx);
vm.runInContext(engineSrc, ctx);
const G = ctx.GrepViz;

// Engine values come from another vm realm; compare them as plain JSON.
const J = (x) => JSON.parse(JSON.stringify(x));
const opts = (preset, patch) => Object.assign(G.defaultOptions()[preset], patch || {});
const compile = (preset, patterns, patch) => G.compile(preset, opts(preset, patch), patterns);
const run = (preset, patterns, text, patch, replacement = "", files) => {
  const options = G.defaultOptions();
  Object.assign(options[preset], patch || {});
  return G.run({ preset, options, patterns, files: files || [{ name: "input.txt", text }], replacement });
};
const spans = (r, file = 0) => J(r.files[file].matches.map((x) => [x.s, x.e]));
const texts = (r, text) => J(r.files[0].matches.map((x) => text.slice(x.s, x.e)));
const rows = (r) => J(r.rows.map((x) => x.prefix + x.text));
const replaced = (r) => J(r.replace.rows.map((x) => x.text));

test("the in-page self-test passes every case", () => {
  const t = G.selfTests();
  assert.ok(t.length >= 20);
  assert.equal(t.filter((x) => !x.pass).map((x) => `${x.name}: ${x.detail}`).join("\n"), "");
});

test("raw.json publishes the engine's metadata", async () => {
  const raw = JSON.parse(await readFile(new URL("../raw.json", import.meta.url), "utf8"));
  assert.deepEqual(raw, J(G.META));
});

/* ---------- the page script, booted against minimal DOM, storage, clipboard and Worker stubs ---------- */

function bootPage({ saved = null, storageThrows = false, clipboardThrows = false } = {}) {
  let now = 0;
  let timers = [];
  const setTimeout = (fn, ms) => { const t = { fn, at: now + (ms || 0) }; timers.push(t); return t; };
  const clearTimeout = (t) => { timers = timers.filter((x) => x !== t); };
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      now = due.at;
      due.fn();
    }
    now = end;
  };
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      const listeners = {};
      els.set(id, {
        id, textContent: "", innerHTML: "", value: "", checked: false, hidden: false, disabled: false, open: false, placeholder: "", dataset: {},
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        fire(type, e) { return Promise.all((listeners[type] || []).map((fn) => fn(Object.assign({ preventDefault() {}, target: {} }, e)))); },
        querySelectorAll: () => [], insertAdjacentHTML(_, h) { this.innerHTML += h; }, focus() {}, scrollIntoView() {}, closest: () => null,
      });
    }
    return els.get(id);
  };
  el("grep-engine").textContent = engineSrc;
  el("grep-ui").textContent = uiSrc;
  const workers = [];
  class Worker {
    constructor() { this.posted = []; this.terminated = false; workers.push(this); }
    postMessage(m) { this.posted.push(m); }
    terminate() { this.terminated = true; }
  }
  const tools = {};
  const fail = () => { throw new Error("blocked"); };
  const page = {
    setTimeout, clearTimeout, TextEncoder, Worker,
    Blob: class { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => "blob:worker" },
    performance: { getEntriesByType: () => [] },
    getSelection: fail,
    document: {
      getElementById: el, querySelectorAll: () => [], createRange: fail,
      execCommand: clipboardThrows ? fail : () => true,
      modelContext: { registerTool(t) { tools[t.name] = t; } },
    },
    navigator: { clipboard: { writeText: clipboardThrows ? async () => fail() : async () => {} } },
  };
  Object.defineProperty(page, "localStorage", {
    get() {
      if (storageThrows) fail();
      return { getItem: () => (saved ? JSON.stringify(saved) : null), setItem() {} };
    },
  });
  page.self = page;
  vm.createContext(page);
  vm.runInContext(engineSrc, page);
  vm.runInContext(uiSrc, page);
  const PG = page.GrepViz;
  const jobs = () => workers.flatMap((w) => w.posted.map((m) => ({ w, m })));
  const reply = async ({ w, m }) => { w.onmessage({ data: { id: m.id, result: PG.run(m.req) } }); await new Promise((r) => setImmediate(r)); };
  return { el, advance, workers, jobs, reply, tools };
}

test("the footer shows the engine's version and build date", () => {
  assert.match(G.VERSION, /^\d+\.\d+\.\d+$/);
  const p = bootPage();
  assert.equal(p.el("version").textContent, "v" + G.VERSION);
  assert.equal(p.el("build").textContent, "Built " + G.BUILD_DATE);
  assert.match(html, /Runs locally, nothing is sent\./);
});

/* ---------- no network ---------- */

test("the page carries the strict Content-Security-Policy", () => {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  assert.ok(m, "CSP meta tag");
  assert.equal(m[1], "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; worker-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'");
  assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf("<script"), "CSP precedes every script");
});

test("the code makes no network calls and uses no relative URLs", () => {
  for (const token of ["fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "importScripts", "RTCPeerConnection", "http://", "https://", "import(", "@import", "url("]) {
    assert.ok(!html.includes(token), `index.html contains ${token}`);
  }
  assert.deepEqual(J(G.NETWORK_TOKENS).length, 9);
  // Only the data: favicon may carry an href or src; no external scripts, styles, fonts or frames.
  const refs = [...html.matchAll(/\s(?:href|src|action|srcset|poster)=["']([^"']*)["']/g)].map((m) => m[1]);
  assert.deepEqual(refs, ["data:,"]);
  assert.ok(!/<(?:iframe|object|embed|img|link rel="stylesheet"|base)\b/i.test(html));
  assert.equal((html.match(/<script\b/g) || []).length, 3, "three inline scripts only: site-theme and the two page scripts");
});

test("the page still works when storage and the clipboard are blocked", async () => {
  const p = bootPage({ storageThrows: true, clipboardThrows: true });
  await p.reply(p.jobs()[0]);
  assert.match(p.el("status").innerHTML, /translated/);
  p.el("text").value = "x 1\n";
  await p.el("text").fire("input");
  p.advance(1000);
  assert.equal(p.jobs().length, 2, "a save attempt does not stop the next run");
  await p.el("copy").fire("click");
  assert.equal(p.el("copy").textContent, "Select and copy");
});

test("matching runs in a worker that is terminated after the 1.5 s timeout", async () => {
  assert.equal(G.TIMEOUT_MS, 1500);
  assert.equal(G.MAX_INPUT_BYTES, 2 * 1024 * 1024);
  assert.equal(G.MAX_HIGHLIGHTS, 5000);
  const p = bootPage({ saved: { preset: "rg", patterns: ["(a+)+$"], files: [{ name: "input.txt", text: "aaaa!\n" }] } });
  assert.equal(p.workers.length, 1);
  assert.equal(p.jobs()[0].m.req.patterns[0], "(a+)+$");
  p.advance(G.TIMEOUT_MS - 1);
  assert.equal(p.workers[0].terminated, false);
  p.advance(1);
  await new Promise((r) => setImmediate(r));
  assert.equal(p.workers[0].terminated, true);
  assert.match(p.el("status").innerHTML, /timed out/);
  assert.match(p.el("notes").innerHTML, /Rust regex runs in linear time/);
});

test("a run_pattern timeout that cancels the page's compare run makes the page run again", async () => {
  const p = bootPage({ saved: { preset: "rg", compare: true, patterns: ["\\d+"], files: [{ name: "input.txt", text: "a 1\n" }] } });
  const call = p.tools.run_pattern.execute({ preset: "pwsh", patterns: ["(a+)+$"], text: "aaaa!" });
  await p.reply(p.jobs()[0]);
  assert.equal(p.jobs().length, 3, "the compare run queues its next preset behind the WebMCP job");
  p.advance(G.TIMEOUT_MS);
  assert.equal(JSON.parse((await call).content[0].text).timeout, true);
  await new Promise((r) => setImmediate(r));
  p.advance(200);
  for (let k = 3; k < 20 && p.jobs().length > k; k++) await p.reply(p.jobs()[k]);
  assert.equal((p.el("compare-body").innerHTML.match(/<tr/g) || []).length, G.PRESET_IDS.length);
});

test("switching file tabs keeps the highlights of the latest run", async () => {
  const p = bootPage({ saved: { preset: "rg", patterns: ["\\d+"], files: [{ name: "a.txt", text: "a 1\n" }, { name: "b.txt", text: "b 2\n" }] } });
  await p.reply(p.jobs()[0]);
  await p.el("file-tabs").fire("click", { target: { dataset: { file: "1" } } });
  assert.match(p.el("highlight").innerHTML, /b <mark>2<\/mark>/);
  await p.el("file-tabs").fire("click", { target: { dataset: { file: "0" } } });
  assert.match(p.el("highlight").innerHTML, /a <mark>1<\/mark>/);
});

test("the page labels divergences and constructs it cannot emulate", async () => {
  const differs = bootPage({ saved: { preset: "rg", patterns: ["foo(?=bar)"], files: [{ name: "input.txt", text: "foobar\n" }] } });
  await differs.reply(differs.jobs()[0]);
  assert.match(differs.el("notes").innerHTML, /Differs from real rg:/);
  const cannot = bootPage({ saved: { preset: "rg", options: { rg: { P: true } }, patterns: ["a\\Kb"], files: [{ name: "input.txt", text: "ab\n" }] } });
  await cannot.reply(cannot.jobs()[0]);
  assert.match(cannot.el("notes").innerHTML, /Cannot emulate here:/);
  assert.match(cannot.el("highlight").innerHTML, /^ab/);
});

/* ---------- BRE vs ERE ---------- */

test("BRE: + ? | ( ) { } are literals and their backslashed forms are special", () => {
  const t = "abbc\nab+c\n";
  assert.deepEqual(texts(run("grep", ["ab+c"], t), t), ["ab+c"]);
  assert.deepEqual(texts(run("grep", ["ab\\+c"], t), t), ["abbc"]);
  assert.deepEqual(texts(run("grep", ["a\\(b\\)\\{2\\}c"], t), t), ["abbc"]);
  assert.deepEqual(texts(run("grep", ["x\\|c"], "c\n"), "c\n"), ["c"]);
  assert.deepEqual(texts(run("grep", ["(b)"], "(b) b\n"), "(b) b\n"), ["(b)"]);
  assert.deepEqual(texts(run("grep", ["a{2}"], "a{2} aa\n"), "a{2} aa\n"), ["a{2}"]);
});

test("ERE: + ? | ( ) { } are special and their backslashed forms are literals", () => {
  const E = { matcher: "E" };
  const t = "abbc\nab+c\n";
  assert.deepEqual(texts(run("grep", ["ab+c"], t, E), t), ["abbc"]);
  assert.deepEqual(texts(run("grep", ["ab\\+c"], t, E), t), ["ab+c"]);
  assert.deepEqual(texts(run("grep", ["(b)\\1"], "abbc\n", E), "abbc\n"), ["bb"]);
  assert.deepEqual(texts(run("grep", ["a{2}"], "a{2} aa\n", E), "a{2} aa\n"), ["aa"]);
  assert.deepEqual(texts(run("grep", ["\\(b\\)"], "(b)\n", E), "(b)\n"), ["(b)"]);
});

test("BRE: a leading * and a mid-pattern ^ or $ are literals", () => {
  assert.deepEqual(texts(run("grep", ["*a"], "*a\n"), "*a\n"), ["*a"]);
  assert.deepEqual(texts(run("grep", ["a^b$c"], "a^b$c\n"), "a^b$c\n"), ["a^b$c"]);
  assert.deepEqual(texts(run("grep", ["^ab$"], "ab\nxab\n"), "ab\nxab\n"), ["ab"]);
  assert.equal(run("grep", ["a^b"], "a^b\n", { matcher: "E" }).totals.matches, 0, "ERE ^ is an anchor anywhere");
});

test("grep: backslash is literal inside a bracket expression", () => {
  assert.deepEqual(texts(run("grep", ["[\\d]"], "\\ d 5\n"), "\\ d 5\n"), ["\\", "d"]);
  assert.deepEqual(texts(run("rg", ["[\\d]"], "\\ d 5\n"), "\\ d 5\n"), ["5"]);
});

test("grep: \\d is not a digit class outside -P", () => {
  const r = run("grep", ["\\d"], "d 5\n");
  assert.deepEqual(texts(r, "d 5\n"), ["d"]);
  assert.ok(r.translation.notes.some((n) => /stray \\ before d/.test(n)));
});

/* ---------- POSIX classes ---------- */

test("POSIX classes: Unicode in grep, ASCII in Rust, a plain set in .NET, an error in JavaScript", () => {
  const t = "é1\n";
  assert.equal(run("grep", ["[[:alpha:]]"], t).totals.matches, 1);
  assert.equal(run("grep", ["[[:alpha:]]"], t, { matcher: "E" }).totals.matches, 1);
  assert.equal(run("rg", ["[[:alpha:]]"], t).totals.matches, 0);
  assert.equal(run("rg", ["[[:alpha:]]"], t, { P: true }).totals.matches, 1);
  assert.equal(run("rg", ["[[:^digit:]]"], "a1\n").totals.matches, 1);
  assert.equal(run("grep", ["[[:digit:][:space:]]\\{2\\}"], "a1 b\n").totals.matches, 1);
  // .NET: [[:digit:]] is the set {[ : d i g t} followed by a literal ].
  const net = "7 d] :]\n";
  assert.deepEqual(texts(run("pwsh", ["[[:digit:]]"], net, { AllMatches: true }), net), ["d]", ":]"]);
  const js = compile("vsfind", ["[[:digit:]]"]);
  assert.equal(js.level, "error", "with the u flag a lone ] is a syntax error");
  assert.ok(js.notes.some((n) => /no POSIX classes/.test(n)));
  assert.equal(compile("grep", ["[[:bogus:]]"]).level, "error");
});

/* ---------- Unicode \d and \w ---------- */

test("\\d and \\w are rewritten as Unicode for rg and .NET but stay ASCII in JavaScript", () => {
  const t = "٣٤٥ naïve\n";
  assert.deepEqual(texts(run("rg", ["\\d+"], t), t), ["٣٤٥"]);
  assert.deepEqual(texts(run("rg", ["\\d+"], t, { P: true }), t), ["٣٤٥"]);
  assert.deepEqual(texts(run("pwsh", ["\\d+"], t), t), ["٣٤٥"]);
  assert.equal(run("vsfind", ["\\d+"], t).totals.matches, 0);
  assert.deepEqual(texts(run("rg", ["\\w+"], "naïve\n"), "naïve\n"), ["naïve"]);
  assert.deepEqual(texts(run("pwsh", ["\\w+"], "naïve\n"), "naïve\n"), ["naïve"]);
  assert.deepEqual(texts(run("vsfind", ["\\w+"], "naïve\n"), "naïve\n"), ["na", "ve"]);
  // grep -P (3.11+) keeps \d ASCII.
  assert.equal(run("grep", ["\\d"], t, { matcher: "P" }).totals.matches, 0);
  // \b follows the engine's word class.
  assert.equal(run("rg", ["\\bve\\b"], "naïve\n").totals.matches, 0);
  assert.equal(run("vsfind", ["\\bve\\b"], "naïve\n").totals.matches, 1);
  assert.match(compile("rg", ["\\d"]).source, /\\p\{Nd\}/);
  assert.match(compile("pwsh", ["\\w"]).source, /\\p\{L\}\\p\{Mn\}\\p\{Nd\}\\p\{Pc\}/);
});

/* ---------- groups ---------- */

test("(?P<name>) and (?<name>) become JavaScript named groups", () => {
  for (const [preset, patch] of [["rg", {}], ["rg", { P: true }], ["grep", { matcher: "P" }]]) {
    const c = compile(preset, ["(?P<year>\\d{4})"], patch);
    assert.equal(c.level, "exact", `${preset} ${JSON.stringify(patch)}`);
    assert.match(c.source, /\(\?<year>/);
  }
  assert.match(compile("pwsh", ["(?'y'a)\\k<y>"]).source, /\(\?<y>a\)\\k<y>/);
  assert.equal(run("rg", ["(?P<w>a)(?P=w)"], "aa\n", { P: true }).totals.matches, 1);
});

test(".NET numbers unnamed groups before named ones", () => {
  const c = compile("pwsh", ["(?<y>\\d{4})-(\\d\\d)"]);
  assert.deepEqual(J(c.groupMap), { 1: 2, 2: 1 });
  const r = run("pwsh", ["(?<y>\\d{4})-(\\d\\d)"], "2026-10", { mode: "replace" }, "$1|$2|${y}");
  assert.deepEqual(replaced(r), ["10|2026|2026"]);
  assert.equal(run("pwsh", ["(?<a>x)(y)\\1"], "xyy", { mode: "match" }).totals.matches, 1, "\\1 is the unnamed group");
});

test("grep \\< and \\> are word start and end; rg knows them, PCRE2 reads a literal <", () => {
  const t = "cat concat cats <cat\n";
  assert.deepEqual(spans(run("grep", ["\\<cat\\>"], t)), [[0, 3], [17, 20]]);
  assert.deepEqual(spans(run("grep", ["\\<cat\\>"], t, { matcher: "E" })), [[0, 3], [17, 20]]);
  assert.deepEqual(spans(run("rg", ["\\<cat"], t)), [[0, 3], [11, 14], [17, 20]]);
  assert.deepEqual(spans(run("rg", ["\\<cat"], t, { P: true })), [[16, 20]]);
  assert.deepEqual(spans(run("rg", ["\\b{start}cat\\b{end}"], t)), [[0, 3], [17, 20]]);
});

/* ---------- cannot emulate ---------- */

test("constructs that cannot be emulated produce no result", () => {
  const cases = [
    ["pwsh", ["(?>a+)b"], {}], ["pwsh", ["(?<open-close>x)"], {}], ["pwsh", ["(?'a-b'x)"], {}], ["pwsh", ["\\p{IsGreek}"], {}],
    ["rg", ["\\((?:[^()]|(?R))*\\)"], { P: true }], ["rg", ["(a)(?1)"], { P: true }], ["rg", ["(?&n)"], { P: true }],
    ["rg", ["a\\Kb"], { P: true }], ["rg", ["a++"], { P: true }], ["rg", ["(?(1)a|b)"], { P: true }], ["rg", ["(*SKIP)a"], { P: true }],
    ["rg", ["(?|(a)|(b))"], { P: true }], ["grep", ["\\X"], { matcher: "P" }], ["rg", ["[a~~b]"], {}], ["rg", ["(?-u)a"], {}],
  ];
  for (const [preset, pats, patch] of cases) {
    const r = run(preset, pats, "aab ab (a(b)) x\n", patch, "z");
    assert.equal(r.translation.level, "cannot", `${preset} ${pats[0]}`);
    assert.ok(r.translation.message, "a reason is given");
    assert.equal(r.translation.source, "", "no regex is produced");
    assert.equal(r.files.length, 0, "no file is searched");
    assert.equal(r.rows.length, 0, "no output");
    assert.equal(r.replace, null, "no replace preview");
  }
});

test("known divergences carry a 'differs from real' warning but still run", () => {
  const r = run("rg", ["foo(?=bar)"], "foobar foobaz\n");
  assert.equal(r.translation.level, "differs");
  assert.match(r.translation.differs[0], /real rg rejects look-around without -P/);
  assert.equal(r.translation.real, "rg");
  assert.equal(r.totals.matches, 1);
  assert.equal(compile("rg", ["(a)\\1"]).level, "differs");
  assert.equal(compile("rg", ["foo(?=bar)"], { P: true }).level, "exact");
  assert.equal(compile("rg", ["(?<=a+)b"], { P: true }).level, "differs", "unbounded PCRE2 look-behind");
});

test("real-engine pattern errors are reported, not matched", () => {
  assert.equal(compile("rg", ["a{"]).level, "error");
  assert.equal(compile("rg", ["\\q"]).level, "error");
  assert.equal(compile("pwsh", ["(a"]).level, "error");
  assert.equal(compile("grep", ["\\(a"]).level, "error");
  assert.equal(compile("vsfind", ["(a"]).level, "error");
  assert.equal(compile("pwsh", ["\\2(a)"]).level, "error");
  const r = run("rg", ["a\\nb"], "a\nb\n");
  assert.equal(r.translation.level, "error");
  assert.match(r.translation.message, /-U/);
  assert.equal(run("rg", ["a\\nb"], "a\nb\n", { U: true }).totals.matches, 1);
});

/* ---------- matching models and line endings ---------- */

test("line endings: LF, CRLF and as pasted", () => {
  assert.equal(G.applyEol("a\nb\n", "lf", "crlf"), "a\nb\n");
  assert.equal(G.applyEol("a\nb\n", "crlf", "lf"), "a\r\nb\r\n");
  assert.equal(G.applyEol("a\r\nb\n", "pasted", "crlf"), "a\r\nb\r\n");
  assert.equal(G.applyEol("a\nb", "pasted", "lf"), "a\nb");
  assert.equal(G.detectEol("a\r\nb\r\n"), "crlf");
  assert.equal(G.detectEol("a\nb"), "lf");
  assert.equal(G.detectEol("a\r\nb\n"), "mixed");
});

test("CRLF and $: rg needs --crlf, grep fails, Select-String and VS Code do not care, -match stops before \\n only", () => {
  const t = "task done\r\nnot done yet\r\n";
  assert.equal(run("rg", ["done$"], t).totals.matches, 0);
  assert.equal(run("rg", ["done$"], t, { crlf: true }).totals.matches, 1);
  assert.equal(run("rg", ["done\\r$"], t).totals.matches, 1);
  assert.equal(run("rg", ["done$"], t, { P: true }).totals.matches, 0);
  assert.equal(run("rg", ["done$"], t, { P: true, crlf: true }).totals.matches, 1);
  assert.equal(run("grep", ["done$"], t).totals.matches, 0);
  assert.equal(run("pwsh", ["done$"], t).totals.matches, 1);
  assert.equal(run("vsfind", ["done$"], t).totals.matches, 1);
  assert.equal(run("vssearch", ["done$"], t).totals.matches, 1);
  assert.equal(run("pwsh", ["yet$"], t, { mode: "match" }).totals.matches, 0, ".NET $ does not stop before \\r\\n");
  assert.equal(run("pwsh", ["yet$"], "not done yet\n", { mode: "match" }).totals.matches, 1, ".NET $ stops before a final \\n");
  assert.equal(run("pwsh", ["(?m)done\\r?$"], t, { mode: "match" }).totals.matches, 1);
  // --crlf: . does not match \r
  assert.deepEqual(texts(run("rg", ["e.$"], "ne\r\n", { crlf: true }), "ne\r\n"), []);
  assert.deepEqual(texts(run("rg", ["e."], "ne\r\n"), "ne\r\n"), ["e\r"]);
});

test("matching models: line by line, whole string, whole document, multiline", () => {
  const t = "ab\ncd\n";
  assert.equal(run("rg", ["b.c"], t).totals.matches, 0);
  assert.equal(run("rg", ["(?s)b.c"], t).totals.matches, 0, "rg without -U never crosses lines");
  assert.equal(run("rg", ["(?s)b.c"], t, { U: true }).totals.matches, 1);
  assert.equal(run("rg", ["b.c"], t, { U: true }).totals.matches, 0, ". excludes \\n without (?s)");
  assert.equal(run("grep", ["b.c"], t).totals.matches, 0);
  assert.equal(run("grep", ["b.c"], t, { z: true }).totals.matches, 1, "grep -z: one record, . matches newline");
  assert.equal(run("grep", ["^cd"], t, { z: true }).totals.matches, 0, "grep -z: ^ is the record start");
  assert.equal(run("pwsh", ["b.c"], t, { mode: "match" }).totals.matches, 0);
  assert.equal(run("pwsh", ["(?s)b.c"], t, { mode: "match" }).totals.matches, 1);
  assert.equal(run("pwsh", ["(?s)b.c"], t).totals.matches, 0, "Select-String is line by line");
  assert.equal(run("pwsh", ["^cd"], t, { mode: "match" }).totals.matches, 0);
  assert.equal(run("pwsh", ["(?m)^cd"], t, { mode: "match" }).totals.matches, 1);
  assert.equal(run("vsfind", ["b\\nc"], t).totals.matches, 1);
  assert.equal(run("vsfind", ["b[\\s\\S]c"], t).totals.matches, 0, "no \\n, \\r or \\W: line by line");
  assert.equal(run("vsfind", ["b\\Wc"], t).totals.matches, 1, "\\W makes VS Code search the document");
  assert.equal(run("vsfind", ["^cd$"], t).totals.matches, 1);
  assert.equal(run("vssearch", ["b\\nc"], "ab\r\ncd\r\n").totals.matches, 1, "VS Code Search rewrites \\n as \\r?\\n");
  // VS Code Find offsets map back to the CRLF text.
  const crlf = "ab\r\ncd\r\n";
  assert.deepEqual(texts(run("vsfind", ["cd"], crlf), crlf), ["cd"]);
});

test("rg output: -n, -o, -c, -l, -v, context and several files", () => {
  const t = "alpha\nbeta\ngamma\ndelta\n";
  assert.deepEqual(rows(run("rg", ["ta"], t, { n: true })), ["2:beta", "4:delta"]);
  assert.deepEqual(rows(run("rg", ["a"], t, { o: true, c: true })), ["4"]);
  assert.deepEqual(rows(run("rg", ["e"], t, { v: true })), ["alpha", "gamma"]);
  assert.deepEqual(rows(run("rg", ["mm"], t, { n: true, C: 1 })), ["2-beta", "3:gamma", "4-delta"]);
  assert.deepEqual(rows(run("rg", ["^a|^d"], t, { n: true, A: 0, B: 0, C: 0 })), ["1:alpha", "4:delta"]);
  assert.deepEqual(rows(run("rg", ["alpha", "delta"], t, { n: true, A: 1 })), ["1:alpha", "2-beta", "--", "4:delta"]);
  assert.deepEqual(rows(run("rg", ["l"], t, { o: true, n: true })), ["1:l", "4:l"]);
  const files = [{ name: "a.md", text: "x\n" }, { name: "b.txt", text: "x\ny\n" }, { name: "c.rs", text: "z\n" }];
  assert.deepEqual(rows(run("rg", ["x"], "", {}, "", files)), ["a.md:x", "b.txt:x"]);
  assert.deepEqual(rows(run("rg", ["x"], "", { l: true }, "", files)), ["a.md", "b.txt"]);
  assert.deepEqual(rows(run("rg", ["x"], "", { c: true }, "", files)), ["a.md:1", "b.txt:1"]);
  assert.deepEqual(rows(run("grep", ["x"], "", { c: true }, "", files)), ["a.md:1", "b.txt:1", "c.rs:0"], "grep -c lists zero counts");
  assert.deepEqual(rows(run("rg", ["x"], "", { globs: ["*.md"] }, "", files)), ["a.md:x"]);
  assert.deepEqual(rows(run("rg", ["x"], "", { globs: ["!*.md"] }, "", files)), ["b.txt:x"]);
  assert.deepEqual(rows(run("rg", ["[xz]"], "", { types: ["rust"] }, "", files)), ["c.rs:z"]);
  assert.equal(run("rg", ["x"], "", { types: ["nope"] }, "", files).translation.level, "error");
  assert.deepEqual(rows(run("vssearch", ["x"], "", { include: "*.txt" }, "", files)), ["b.txt (1)", "  1: x"]);
  assert.deepEqual(rows(run("vssearch", ["x"], "", { exclude: "*.txt, *.rs" }, "", files)), ["a.md (1)", "  1: x"]);
});

test("rg -S, -w, -x and several -e patterns", () => {
  assert.equal(run("rg", ["foo"], "FOO\n", { case: "S" }).totals.matches, 1);
  assert.equal(run("rg", ["Foo"], "FOO\n", { case: "S" }).totals.matches, 0);
  assert.equal(run("rg", ["\\Sfoo"], "xFOO\n", { case: "S" }).totals.matches, 1, "\\S is not an uppercase literal");
  assert.deepEqual(spans(run("rg", ["cat"], "cat cats bobcat cat\n", { w: true })), [[0, 3], [16, 19]]);
  assert.equal(run("rg", ["ab"], "ab\nabc\n", { x: true }).totals.matches, 1);
  assert.equal(run("rg", ["ab"], "ab\r\n", { x: true, crlf: true }).totals.matches, 1);
  const r = run("rg", ["(a)", "(b)"], "ab\n", { r: true }, "[$1$2]");
  assert.deepEqual(replaced(r), ["[a][b]"], "groups are numbered across -e patterns");
  assert.deepEqual(texts(run("grep", ["a.c", "x+"], "abc x+ a.c\n", { matcher: "F" }), "abc x+ a.c\n"), ["x+", "a.c"]);
});

test("PowerShell Select-String: first match per line, -AllMatches, -NotMatch, -Context, -SimpleMatch", () => {
  const t = "a1 b2\nnone\nc3\n";
  assert.equal(run("pwsh", ["\\d"], t).totals.matches, 2);
  assert.equal(run("pwsh", ["\\d"], t, { AllMatches: true }).totals.matches, 3);
  assert.deepEqual(rows(run("pwsh", ["\\d"], t, { NotMatch: true })), ["input.txt:2:none"]);
  assert.deepEqual(rows(run("pwsh", ["none"], t, { Context: [1, 0] })), ["  input.txt:1:a1 b2", "> input.txt:2:none"]);
  assert.equal(run("pwsh", ["A1"], t).totals.matches, 1, "case-insensitive by default");
  assert.equal(run("pwsh", ["A1"], t, { CaseSensitive: true }).totals.matches, 0);
  assert.equal(run("pwsh", ["a."], "a. ab\n", { SimpleMatch: true, AllMatches: true }).totals.matches, 1);
  assert.equal(run("pwsh", ["A"], "a", { mode: "cmatch" }).totals.matches, 0);
  assert.deepEqual(rows(run("pwsh", ["(?<y>\\d{4})-(\\d\\d)"], "on 2026-10", { mode: "match" })).map((x) => x.replace(/ +/, " ")), ["True", "", "$Matches", "y 2026", "1 10", "0 2026-10"]);
});

test("VS Code whole word: Find uses word separators, Search adds \\b only beside word characters", () => {
  assert.deepEqual(spans(run("vsfind", ["cat"], "cat cats (cat) bobcat\n", { wholeWord: true })), [[0, 3], [10, 13]]);
  assert.deepEqual(spans(run("vsfind", ["-x"], "a-x b\n", { wholeWord: true })), [[1, 3]], "a separator at the match edge counts");
  assert.deepEqual(spans(run("vssearch", ["cat"], "cat cats bobcat\n", { wholeWord: true })), [[0, 3]]);
  // "\d+" starts with a backslash, which is not a word character, so no leading \b is added.
  assert.deepEqual(spans(run("vssearch", ["\\d+"], "x12\n", { wholeWord: true })), [[1, 3]]);
  assert.match(compile("vssearch", ["a.b"], { regex: false, wholeWord: true }).source, /a\\u\{2e\}b/);
});

test("VS Code Find and Search with Regex off find literal text with - and /", () => {
  const t = "2026-10-01 a/b (x)\n";
  for (const preset of ["vsfind", "vssearch"]) {
    for (const wholeWord of [false, true]) {
      for (const lit of ["2026-10-01", "a/b", "(x)"]) {
        const r = run(preset, [lit], t, { regex: false, wholeWord });
        assert.equal(r.translation.level, "exact", `${preset} ${lit} wholeWord=${wholeWord}`);
        assert.deepEqual(texts(r, t), [lit], `${preset} ${lit} wholeWord=${wholeWord}`);
      }
    }
  }
});

test("rg accepts an escaped non-alphanumeric ASCII character as a literal", () => {
  for (const c of "/\"%:=@!,;'`_") {
    const r = run("rg", ["a\\" + c + "b"], `a${c}b\n`);
    assert.equal(r.translation.level, "exact", `\\${c}`);
    assert.equal(r.totals.matches, 1, `\\${c}`);
    assert.equal(run("rg", ["[\\" + c + "]"], `${c}\n`).totals.matches, 1, `[\\${c}]`);
  }
  assert.equal(run("vssearch", ["a\\/b"], "a/b\n").totals.matches, 1);
  assert.equal(compile("rg", ["\\é"]).level, "error", "non-ASCII escapes are rejected");
  assert.equal(compile("rg", ["[\\é]"]).level, "error");
  assert.deepEqual(texts(run("rg", ["\\<cat\\>"], "cat concat\n"), "cat concat\n"), ["cat"], "\\< and \\> stay word boundaries");
});

test("VS Code Search falls back to PCRE2 for look-around and backreferences", () => {
  const c = compile("vssearch", ["foo(?=bar)"]);
  assert.equal(c.dialect, "pcre2");
  assert.equal(c.level, "exact");
  assert.equal(compile("vssearch", ["(a)\\1"]).dialect, "pcre2");
  assert.equal(compile("vssearch", ["a+"]).dialect, "rust");
  assert.equal(run("vssearch", ["foo"], "FOO\n").totals.matches, 1, "Match Case off ignores case");
  assert.equal(run("vssearch", ["foo"], "FOO\n", { matchCase: true }).totals.matches, 0);
});

test("Rust class set operations and .NET class subtraction", () => {
  assert.deepEqual(texts(run("rg", ["[[a-z]&&[^aeiou]]+"], "strength\n"), "strength\n"), ["str", "ngth"]);
  assert.deepEqual(texts(run("rg", ["[a-z--aeiou]+"], "strength\n"), "strength\n"), ["str", "ngth"]);
  assert.deepEqual(texts(run("pwsh", ["[a-z-[aeiou]]+"], "strength\n", { AllMatches: true }), "strength\n"), ["str", "ngth"]);
});

test("inline flags: (?i), (?x), (?U) and scoped case", () => {
  assert.equal(run("rg", ["(?i)abc"], "ABC\n").totals.matches, 1);
  assert.equal(run("rg", ["(?x) a b c # comment"], "abc\n").totals.matches, 1);
  assert.deepEqual(texts(run("rg", ["(?U)a+"], "aaa\n"), "aaa\n"), ["a", "a", "a"]);
  const mixed = compile("rg", ["a(?i)b"]);
  if (G.HAS_MODIFIERS) {
    assert.equal(mixed.level, "exact");
    assert.equal(run("rg", ["a(?i)b"], "aB AB\n").totals.matches, 1);
  } else assert.equal(mixed.level, "cannot", "no RegExp modifiers: say so instead of guessing");
});

/* ---------- replace ---------- */

test("rg -r: $1 followed by digits is group 10; ${1}0 is group 1 then 0; $name and $$", () => {
  const t = "v1 and v2\n";
  assert.deepEqual(replaced(run("rg", ["v(\\d)"], t, { r: true }, "$10")), [" and "]);
  assert.deepEqual(replaced(run("rg", ["v(\\d)"], t, { r: true }, "${1}0")), ["10 and 20"]);
  assert.deepEqual(replaced(run("rg", ["v(\\d)"], t, { r: true }, "$1_x")), [" and "], "$1_x is the group named 1_x");
  assert.deepEqual(replaced(run("rg", ["v(?P<n>\\d)"], t, { r: true }, "<$n$$>")), ["<1$> and <2$>"]);
  assert.deepEqual(replaced(run("rg", ["v(\\d)"], t, { r: true, o: true }, "#$1")), ["#1", "#2"]);
  assert.deepEqual(replaced(run("rg", ["v(\\d)"], t, { r: true, n: true }, "#$1")), ["#1 and #2"]);
  const reps = run("rg", ["v(\\d)"], t, { r: true, n: true }, "#$1").replace.rows;
  assert.equal(reps[0].prefix, "1:");
});

test(".NET substitutions: $1, ${name}, $10 as literal text, $$ and $&", () => {
  const g = (m) => ({ num: (n) => m[n], has: (n) => n < m.length, name: () => undefined, hasName: () => false });
  const c = { before: "", after: "", input: "", last: "" };
  assert.equal(G.expandDotnet("$10", g(["ab", "a"]), c), "$10");
  assert.equal(G.expandDotnet("${1}0", g(["ab", "a"]), c), "a0");
  assert.equal(G.expandDotnet("$$1 $&", g(["ab", "a"]), c), "$1 ab");
  assert.deepEqual(replaced(run("pwsh", ["(\\w+) (\\w+)"], "Ada Lovelace", { mode: "replace" }, "$2, $1")), ["Lovelace, Ada"]);
});

test("PowerShell quoting: single quotes keep $, double quotes expand it and process backticks", () => {
  assert.equal(G.psSingleQuote("$1 `n it's"), "'$1 `n it''s'");
  assert.equal(G.psSingleQuote("a’b"), "'a’’b'", "curly quotes are quote characters too");
  assert.equal(G.psDoubleQuote('$x "q" `t\n'), '"`$x `"q`" ``t`n"');
  assert.equal(G.psExpandDouble(G.psDoubleQuote('$x "q" `t\n').slice(1, -1)).value, '$x "q" `t\n', "psDoubleQuote round-trips");
  assert.equal(G.psExpandDouble("$2 $1").value, " ");
  assert.equal(G.psExpandDouble("${name}!").value, "!");
  assert.equal(G.psExpandDouble("`$1 and `$2").value, "$1 and $2");
  assert.equal(G.psExpandDouble("a`tb`nc``d`0").value, "a\tb\nc`d\0");
  assert.equal(G.psExpandDouble("`u{263A}").value, "☺");
  assert.equal(G.psExpandDouble("cost $ 5").value, "cost $ 5", "a lone $ stays");
  const single = run("pwsh", ["(\\w+) (\\w+)"], "Ada Lovelace", { mode: "replace", replQuote: "single" }, "$2 $1");
  const double = run("pwsh", ["(\\w+) (\\w+)"], "Ada Lovelace", { mode: "replace", replQuote: "double" }, "$2 $1");
  const escaped = run("pwsh", ["(\\w+) (\\w+)"], "Ada Lovelace", { mode: "replace", replQuote: "double" }, "`$2 `$1");
  assert.deepEqual(replaced(single), ["Lovelace Ada"]);
  assert.deepEqual(replaced(double), [" "]);
  assert.ok(double.replace.notes.some((n) => /single quotes/.test(n)));
  assert.deepEqual(replaced(escaped), ["Lovelace Ada"]);
});

test("bash quoting", () => {
  assert.equal(G.bashQuote("foo"), "foo");
  assert.equal(G.bashQuote(""), "''");
  assert.equal(G.bashQuote("a b"), "'a b'");
  assert.equal(G.bashQuote("it's"), "'it'\\''s'");
  assert.equal(G.bashQuote("$HOME `x` \\d"), "'$HOME `x` \\d'");
  assert.equal(G.bashQuote("*.rs"), "'*.rs'");
});

test("generated commands quote correctly for bash and PowerShell", () => {
  const files = [{ name: "input.txt" }];
  const o = (p, patch) => opts(p, patch);
  assert.equal(G.buildCommand("rg", o("rg", { case: "i", n: true, A: 2 }), ["it's $1"], files, "", "bash"), "rg -i -n -A 2 'it'\\''s $1' input.txt");
  assert.equal(G.buildCommand("rg", o("rg", { case: "i" }), ["it's $1"], files, "", "pwsh"), "rg -i 'it''s $1' input.txt");
  assert.equal(G.buildCommand("rg", o("rg", { r: true }), ["(\\w+)"], files, "${1}0", "bash"), "rg '(\\w+)' -r '${1}0' input.txt");
  assert.equal(G.buildCommand("rg", o("rg"), ["-x"], files, "", "bash"), "rg -e -x input.txt", "a pattern starting with - goes after -e");
  assert.equal(G.buildCommand("rg", o("rg", { crlf: true, U: true }), ["a", "b c"], files, "", "bash"), "rg -U --crlf -e a -e 'b c' input.txt");
  const two = [{ name: "a.md" }, { name: "my file.txt" }];
  assert.equal(G.buildCommand("rg", o("rg", { globs: ["*.md"], types: ["md"] }), ["x"], two, "", "bash"), "rg x -g '*.md' -t md");
  assert.equal(G.buildCommand("grep", o("grep", { matcher: "E", i: true, z: true }), ["a|b"], two, "", "bash"), "grep -E -i -z 'a|b' a.md 'my file.txt'");
  assert.equal(G.buildCommand("grep", o("grep"), ["a|b"], two, "", "pwsh"), "grep 'a|b' a.md 'my file.txt'");
  assert.equal(G.buildCommand("pwsh", o("pwsh", { AllMatches: true, Context: [1, 2] }), ["it's"], [{ name: "a.txt" }], ""), "Select-String -LiteralPath 'a.txt' -Pattern 'it''s' -AllMatches -Context 1,2");
  assert.equal(G.buildCommand("pwsh", o("pwsh", { mode: "replace" }), ["(\\w+) (\\w+)"], files, "$2 $1"), "(Get-Content -Raw -LiteralPath 'input.txt') -replace '(\\w+) (\\w+)', '$2 $1'");
  assert.equal(G.buildCommand("pwsh", o("pwsh", { mode: "replace", replQuote: "double" }), ["x"], files, 'say "hi" $1'), "(Get-Content -Raw -LiteralPath 'input.txt') -replace 'x', \"say `\"hi`\" $1\"");
  assert.equal(G.buildCommand("pwsh", o("pwsh", { mode: "match" }), ["a"], files, ""), "(Get-Content -Raw -LiteralPath 'input.txt') -match 'a'; $Matches");
  assert.match(G.buildCommand("vssearch", o("vssearch", { matchCase: true, include: "*.md" }), ["x"], files, ""), /toggles: Match Case, Regex\nfiles to include: \*\.md/);
});

test("typed flags: supported ones apply, anything else is 'not supported here'", () => {
  const r = G.parseFlags("rg", "-iw -A 2 --crlf -e foo -g '*.md' -t md --sort path -z", opts("rg"), ["x"]);
  assert.equal(r.opts.case, "i");
  assert.equal(r.opts.w, true);
  assert.equal(r.opts.A, 2);
  assert.equal(r.opts.crlf, true);
  assert.deepEqual(J(r.patterns), ["x", "foo"]);
  assert.deepEqual(J(r.opts.globs), ["*.md"]);
  assert.deepEqual(J(r.opts.types), ["md"]);
  assert.deepEqual(J(r.unsupported), ["--sort", "path", "-z"]);
  const rr = G.parseFlags("rg", "-r '$1'", opts("rg"), ["x"]);
  assert.equal(rr.opts.r, true);
  assert.equal(rr.replacement, "$1");
  const g = G.parseFlags("grep", "-E -c --null-data -r", opts("grep"), ["x"]);
  assert.equal(g.opts.matcher, "E");
  assert.equal(g.opts.c, true);
  assert.equal(g.opts.z, true);
  assert.deepEqual(J(g.unsupported), ["-r"]);
  const p = G.parseFlags("pwsh", "-AllMatches -Context 1,2 -Raw -Encoding utf8", opts("pwsh"), ["x"]);
  assert.equal(p.opts.AllMatches, true);
  assert.deepEqual(J(p.opts.Context), [1, 2]);
  assert.deepEqual(J(p.unsupported), ["-Raw", "-Encoding", "utf8"]);
  assert.deepEqual(J(G.parseFlags("vsfind", "--anything", opts("vsfind"), ["x"]).unsupported), ["--anything"]);
});

test("VS Code replace: $1, ${1}, $&, $10 fallback, \\n, case modifiers and Preserve Case", () => {
  const re = { regex: true };
  const g = ["John smith", "John", "smith"];
  assert.equal(G.expandVscode("$2, $1", g, re), "smith, John");
  assert.equal(G.expandVscode("${2}0", g, re), "smith0");
  assert.equal(G.expandVscode("$20", g, re), "smith0", "two digits fall back to $2 then 0");
  assert.equal(G.expandVscode("$9", g, re), "$9");
  assert.equal(G.expandVscode("[$&]", g, re), "[John smith]");
  assert.equal(G.expandVscode("$$1", g, re), "$1");
  assert.equal(G.expandVscode("a\\nb\\tc\\\\", g, re), "a\nb\tc\\");
  assert.equal(G.expandVscode("\\u$2", g, re), "Smith");
  assert.equal(G.expandVscode("\\U$2!", g, re), "SMITH!");
  assert.equal(G.expandVscode("\\l$1", g, re), "john");
  assert.equal(G.expandVscode("\\L$1", g, re), "john");
  assert.equal(G.expandVscode("\\u\\L$1", ["JOHN", "JOHN"], re), "John");
  assert.equal(G.expandVscode("\\U\\E$2", g, re), "smith", "\\E cancels pending modifiers");
  assert.equal(G.expandVscode("$1", ["x"], { regex: false }), "$1", "no substitution without Regex");
  assert.equal(G.preserveCase("color", "colour"), "colour");
  assert.equal(G.preserveCase("Color", "colour"), "Colour");
  assert.equal(G.preserveCase("COLOR", "colour"), "COLOUR");
  assert.equal(G.preserveCase("foo-Bar", "baz-qux"), "baz-Qux");
  assert.equal(G.preserveCase("foo_BAR", "baz_qux"), "baz_QUX");
  const r = run("vsfind", ["color"], "color Color COLOR\n", { replace: true, preserveCase: true }, "colour");
  assert.deepEqual(replaced(r), ["colour Colour COLOUR"]);
  const crlf = run("vsfind", ["b"], "a b\r\n", { replace: true }, "x\\ny");
  assert.deepEqual(J(crlf.replace.rows.map((x) => x.text)), ["a x\r", "y\r"], "\\n inserts the file's line ending");
});

test("grep has no replace; other previews need their replace switch", () => {
  assert.equal(run("grep", ["a"], "a\n").replace.message, "grep has no replace.");
  assert.equal(run("rg", ["a"], "a\n").replace.available, false);
  assert.match(run("pwsh", ["a"], "a\n").replace.message, /Select-String has no replace/);
  assert.equal(run("vsfind", ["a"], "a\n").replace.available, false);
  assert.match(G.META.replace.grep, /grep has no replace/);
});

test("compare all marks presets whose spans differ from the majority", () => {
  const t = "price ٣٤٥ or 345\n";
  const results = G.PRESET_IDS.map((p) => run(p, ["\\d+"], t, p === "pwsh" ? { AllMatches: true } : {}));
  const s = J(G.compareSummary(results));
  assert.deepEqual(s.map((x) => [x.preset, x.matches, x.differs]), [["rg", 2, false], ["grep", 0, true], ["pwsh", 2, false], ["vsfind", 1, true], ["vssearch", 2, false]]);
  const withCannot = G.compareSummary([run("rg", ["a"], "a"), run("pwsh", ["(?>a)"], "a")]);
  assert.equal(withCannot[1].unavailable, true);
  assert.equal(withCannot[1].differs, false);
});

test("highlights stop after 5,000 matches while counts stay complete", () => {
  const t = "a".repeat(6000) + "\n";
  const r = run("rg", ["a"], t);
  assert.equal(r.totals.matches, 6000);
  assert.equal(r.files[0].matches.length, 5000);
  assert.equal(r.capped, true);
  assert.equal(run("vsfind", ["a"], t).files[0].matches.length, 5000);
});

test("empty matches advance by one code point", () => {
  assert.equal(run("rg", ["x*"], "ab\n").totals.matches, 3);
  assert.equal(run("vsfind", ["x*"], "😀\n").totals.matches, 2);
});

test("run results survive structured cloning to the page", () => {
  const r = run("pwsh", ["(?<y>\\d+)"], "a 12", { mode: "match" });
  assert.doesNotThrow(() => structuredClone(r));
});
