//! Builds index.html: the site's look, the page as it opens, the host script, the WebAssembly module and
//! links.json, packed and compressed, in one offline file. It stops when the data would not come back exactly.
//!
//!     cargo build --release --target wasm32-unknown-unknown -p links --lib
//!     cargo run --release -p links --bin page -- target/wasm32-unknown-unknown/release/links.wasm viz/links/index.html

use links::{app::App, codec, data::Data, search::Index};

const STYLE: &str = r#"
.pl > .lede { margin-bottom: 2rem; }
:root[data-embed] .pl > h1, :root[data-embed] .pl > .lede { display: none; }
.pl [hidden] { display: none !important; }
.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.pl button:disabled { opacity: 0.45; cursor: default; }
.bib { border: 1px solid var(--line); border-radius: 8px; padding: 0.75rem 1rem; margin: 0 0 2rem; font-size: 0.875rem; }
.bib p { margin: 0 0 0.5rem; }
.bib .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.5rem; margin: 0.4rem 0; }
.bib .row > span { flex: 0 0 auto; min-width: 10.5rem; color: var(--fg2); }
.bib button { font-size: 0.8125rem; }
.bib .status { min-height: 1.4em; color: var(--muted); margin: 0.4rem 0 0; }
#bib-fallback { display: block; width: 100%; height: 10rem; margin-top: 0.5rem; font: 0.75rem/1.4 var(--mono); color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 0.5rem; }
.pl .sift { margin-bottom: 1.5rem; }
.sift .field { flex: 1 1 100%; }
.sift .field label { display: block; font-size: 0.8125rem; color: var(--muted); }
.sift .field input { width: 100%; }
#panel { flex: 1 1 100%; padding-top: 0.25rem; }
.tagfind input { width: 100%; font-size: 1rem; }
.facet { border: 0; margin: 1.25rem 0 0; padding: 0; }
.facet legend { font: 0.75rem/1.4 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding: 0; margin-bottom: 0.5rem; }
.tags, .entry-tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.pl .tag { font-size: 0.8125rem; padding: 0.15rem 0.6rem; max-width: 100%; overflow-wrap: anywhere; text-align: left; }
.pl .tag[aria-pressed=true] { color: var(--fg); border-color: var(--fg); }
.tag .n { color: var(--muted); font-size: 0.75rem; }
.tag.site { font: 0.75rem/1.6 var(--mono); }
.facet .more { margin-top: 0.4rem; font-size: 0.8125rem; border: 0; padding: 0.25rem 0; text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 0.2em; }
.sift .note { margin: 1rem 0 0; font-size: 0.8125rem; color: var(--muted); }
.active { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.5rem; margin: -0.5rem 0 1.5rem; font-size: 0.875rem; }
.active > span { color: var(--muted); }
.active ul { display: contents; list-style: none; }
.chip { color: var(--fg); font-size: 0.8125rem; max-width: 100%; overflow-wrap: anywhere; }
.chip span { margin-left: 0.4rem; }
.entry { padding: 1.25rem 0; border-top: 1px solid var(--line); }
.entry-title { font-size: 1.25rem; line-height: 1.35; margin: 0 0 0.4rem; overflow-wrap: anywhere; }
.entry-abstract { margin: 0 0 0.6rem; overflow-wrap: break-word; }
.bib-pick { display: inline-flex; align-items: center; gap: 0.4rem; margin-top: 0.7rem; font-size: 0.875rem; cursor: pointer; }
.bib-pick input { width: 1.1rem; height: 1.1rem; margin: 0; accent-color: var(--fg); }
#empty { color: var(--muted); }
#pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--line); font-size: 0.875rem; }
#pager span { color: var(--muted); font-variant-numeric: tabular-nums; }
.pl math { font-family: var(--math); }
.pl .m { display: inline-block; max-width: 100%; overflow-x: auto; overflow-y: hidden; vertical-align: middle; padding: 0.1em 0; }
.pl .md { display: block; overflow-x: auto; overflow-y: hidden; padding: 0.25em 0; }
.pl .bad { color: var(--warm); }
.error { border: 1px solid var(--warm); border-radius: 6px; padding: 0.55rem 0.8rem; }
"#;

/// The host: events in, commands out. Every rule, word and number comes from the module.
const HOST: &str = r##"(() => {
"use strict";
const $ = (s) => document.querySelector(s), all = (s) => document.querySelectorAll(s);
const enc = new TextEncoder(), dec = new TextDecoder(), html = document.documentElement, embed = "embed" in html.dataset;
const q = $("#q"), tagq = $("#tagq");
let wasm = null, said = 0;
const bytes = (b64) => { const s = atob(b64), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
const put = (x, b) => { const p = x.alloc(b.length); new Uint8Array(x.memory.buffer, p, b.length).set(b); return p; };
function send(msg) {
  if (!wasm) return {};
  const b = enc.encode(JSON.stringify(msg)), p = wasm.handle(put(wasm, b), b.length);
  return run(JSON.parse(dec.decode(new Uint8Array(wasm.memory.buffer, p, wasm.out_len()))));
}
function save(c) {
  const url = URL.createObjectURL(new Blob([c.data], { type: c.mime })), a = document.createElement("a");
  a.href = url; a.download = c.save;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function copy(c) {
  Promise.resolve().then(() => navigator.clipboard.writeText(c.copy))
    .then(() => send({ ev: "result", tag: c.tag, ok: true }), () => send({ ev: "result", tag: c.tag, ok: false }));
}
function run(cmds) {
  const a = document.activeElement, mark = a && a.dataset ? [a.dataset.act, a.dataset.arg, a.id] : [];
  const out = {};
  let moved = false;
  for (const c of cmds) {
    if ("save" in c) save(c);
    else if ("copy" in c) copy(c);
    else if ("html" in c) all(c.html).forEach((e) => { e.innerHTML = c.v; });
    else if ("text" in c) all(c.text).forEach((e) => { e.textContent = c.v; });
    else if ("value" in c) all(c.value).forEach((e) => { e.value = c.v; });
    else if ("attr" in c) all(c.attr).forEach((e) => (c.v == null ? e.removeAttribute(c.name) : e.setAttribute(c.name, c.v)));
    else if ("hidden" in c) all(c.hidden).forEach((e) => { e.hidden = c.on; });
    else if ("focus" in c) { $(c.focus)?.focus(); moved = true; }
    else if ("select" in c) { const t = $(c.select); t?.focus(); t?.select(); moved = true; }
    else if ("scroll" in c) $(c.scroll)?.scrollIntoView({ block: "start" });
    else if ("say" in c) { const s = $("#bib-status"); s.textContent = ""; clearTimeout(said); said = setTimeout(() => { s.textContent = c.say; }, 50); }
    else if ("url" in c) { if (!embed) try { history.replaceState(history.state, "", location.pathname + (c.url.length ? "?" + new URLSearchParams(c.url) : "") + location.hash); } catch (e) {} }
    else if ("reply" in c) out.reply = c.reply;
  }
  // A focused control that was drawn again keeps the focus.
  if (!moved && a && a !== document.body && !a.isConnected) {
    const [act, arg, id] = mark;
    (act ? document.querySelector(`[data-act="${act}"][data-arg="${arg}"]`) : id ? document.getElementById(id) : null)?.focus({ preventScroll: true });
  }
  return out;
}
q.addEventListener("input", () => send({ ev: "q", v: q.value }));
tagq.addEventListener("input", () => send({ ev: "find", v: tagq.value }));
$("#filter").addEventListener("submit", (e) => e.preventDefault());
document.addEventListener("change", (e) => { const t = e.target; if (t.dataset && t.dataset.cite) send({ ev: "cite", i: +t.dataset.cite, on: t.checked }); });
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button[data-act]"); if (b && !b.disabled) send({ ev: "click", act: b.dataset.act, arg: b.dataset.arg || "" }); });
WebAssembly.instantiate(bytes(WASM)).then(({ instance }) => {
  const x = instance.exports, d = bytes(DATA);
  x.load(put(x, d), d.length);
  wasm = x;
  send({ ev: "start", q: q.value, find: tagq.value, params: embed ? [] : [...new URLSearchParams(location.search)] });
  html.dataset.ready = "true";
  const mc = document.modelContext || navigator.modelContext;
  if (mc) for (const t of send({ ev: "tools" }).reply) {
    mc.registerTool({ ...t, async execute(i) { return { content: [{ type: "text", text: JSON.stringify(send({ ev: "tool", name: t.name, input: i || {} }).reply) }] }; } });
  }
}).catch((e) => { const b = $("#error"); b.hidden = false; b.textContent = `This page could not start its search: ${e.message}.`; });
})();"##;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let [_, wasm, out] = args.as_slice() else { panic!("usage: page <links.wasm> <index.html>") };
    let wasm = std::fs::read(wasm).expect("the WebAssembly module");
    let src = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/links.json")).expect("links.json");
    let data = Data::from_json(&src);
    assert!(data.recs.iter().all(|r| r.url.starts_with("https://") || r.url.starts_with("http://")), "every link is http(s)");
    // The page decodes exactly what links.json holds, record for record and byte for byte.
    let packed = data.pack();
    let z = codec::compress(&packed);
    let back = Data::unpack(&codec::decompress(&z));
    assert!(back.to_json() == src, "links.json comes back from the page's data unchanged");
    let app = App::new(Index::new(back));
    let body = app.body();
    let script = format!("<script>const WASM = \"{}\";\nconst DATA = \"{}\";\n{HOST}</script>", look::base64(&wasm), look::base64(&z));
    let description = "Search 2,523 links to papers, lecture notes, slides, books and talks, filter them by tag or by site, and export BibTeX for the links you pick.";
    let html = look::page(&look::Page { title: "Paper links", description, root: "../../", style: STYLE, body: &body, script: &script });
    assert!(!html.contains("/Users/") && !html.contains("/home/"), "no home paths in the page");
    std::fs::write(out, html).expect("index.html");
}
