/* Hands-on classes at Tampines Regional Library end to end: index.html from file:// in a real browser, with the
   clock fixed at the snapshot's retrieval time. The filters change the list and the calendar, the fragment
   restores them, and every Book on NLB link is the snapshot's own official NLB link, opening in a new tab. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Run against an isolated Chrome started with --remote-debugging-port=9229 (CI starts a headless one):
// TAMPINES_EVENTS_BROWSER_URL=http://127.0.0.1:9229 node --test tests/browser.test.mjs
const browser = process.env.TAMPINES_EVENTS_BROWSER_URL;
/** @type {TampinesData} */
const data = JSON.parse(readFileSync(new URL("../data.json", import.meta.url), "utf8"));
const NOW = Date.parse(data.retrieved);
const upcoming = data.events.filter((e) => !(Date.parse(e.end || e.start || "") < NOW));

/** @param {string} [hash] */
async function openPage(hash = "") {
  const url = new URL("../index.html", import.meta.url).href + hash;
  const target = await (await fetch(`${browser}/json/new?about:blank`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  /** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>} */
  const pending = new Map();
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const requests = [];
  socket.onmessage = ({ data: message }) => {
    const msg = JSON.parse(String(message));
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    if (msg.method === "Network.requestWillBeSent") requests.push(msg.params.request.url);
    const callbacks = pending.get(msg.id);
    if (!callbacks) return;
    pending.delete(msg.id);
    if (msg.error) callbacks.reject(new Error(msg.error.message));
    else callbacks.resolve(msg.result);
  };
  /** @param {string} method @param {object} [params] @returns {Promise<any>} */
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  /** @param {string} expression */
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    assert.equal(response.exceptionDetails, undefined, response.exceptionDetails?.exception?.description);
    return response.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  // The page reads the clock only through Date.now(): fix it at the snapshot, so "upcoming" means what the data says.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `Date.now = () => ${NOW};` });
  await send("Page.navigate", { url });
  // Ready once the page's own document has loaded, so its inline scripts have rendered (not about:blank, not half-parsed).
  while (!(await evaluate(`!!document.getElementById("events-ui") && document.readyState === "complete"`))) await new Promise((r) => setTimeout(r, 20));
  const close = async () => { socket.close(); await fetch(`${browser}/json/close/${target.id}`); };
  return { evaluate, errors, requests, close };
}

const READ = `(() => ({
  ids: [...document.querySelectorAll("#list article.event")].map((a) => a.dataset.id),
  count: document.getElementById("result-count").textContent,
  hash: location.hash,
  books: [...document.querySelectorAll("#list a.book")].map((a) => ({ id: a.dataset.booking, href: a.getAttribute("href"), target: a.target, rel: a.rel, text: a.textContent })),
  days: [...document.querySelectorAll("#calendar button.day")].map((b) => b.dataset.date),
  empty: [...document.querySelectorAll("#list .empty")].map((p) => p.textContent),
}))()`;

test("the page lists the upcoming classes with their official booking links, and the filters narrow them", { skip: !browser, timeout: 30000 }, async () => {
  const page = await openPage();
  try {
    const { evaluate } = page;
    const first = await evaluate(READ);
    assert.deepEqual(first.ids, upcoming.map((e) => e.id), "every upcoming class, in start order");
    assert.ok(first.ids.length > 0);
    assert.equal(first.books.length, upcoming.length, "each class has a Book on NLB or Book on onePA link");
    for (const book of first.books) {
      const e = data.events.find((x) => x.id === book.id);
      assert.equal(book.href, e?.booking_url, "the link is the snapshot's, unchanged");
      assert.match(book.href, e?.source === "onepa" ? /^https:\/\/www\.onepa\.gov\.sg\// : /^https:\/\/(nlb\.libcal\.com|www\.nlb\.gov\.sg|go\.gov\.sg)\//);
      assert.equal(book.target, "_blank");
      assert.match(book.rel, /noopener/);
      assert.match(book.text, e?.source === "onepa" ? /^Book on onePA/ : /^Book on NLB/);
    }
    const asOf = await evaluate(`document.getElementById("asof").textContent`);
    assert.match(asOf, /^Data as of \w{3} \d{1,2} \w{3} \d{4}, \d{2}:\d{2} Singapore time\./);
    assert.match(asOf, /authoritative/);

    // Kind: switching Maker lab off leaves the other kinds only.
    const noMaker = await evaluate(`(() => { document.querySelector('#categories button[data-category="maker"]').click(); return ${READ}; })()`);
    assert.deepEqual(noMaker.ids, upcoming.filter((e) => e.category !== "maker").map((e) => e.id));
    assert.match(noMaker.hash, /cat=cooking,hands-on/);

    // Organiser and venue: onePA alone, then one community club, then back to every source.
    const onePA = await evaluate(`(() => { document.getElementById("reset").click(); document.querySelector('#organiser button[data-org="onepa"]').click(); return ${READ}; })()`);
    assert.deepEqual(onePA.ids, upcoming.filter((e) => e.source === "onepa").map((e) => e.id));
    assert.ok(onePA.ids.length > 0, "the snapshot has upcoming onePA classes");
    assert.match(onePA.hash, /org=onepa/);
    const club = /** @type {string} */ (upcoming.find((e) => e.source === "onepa")?.venue_group);
    const atClub = await evaluate(`(() => { const s = document.getElementById("venue"); s.value = ${JSON.stringify(club)}; s.dispatchEvent(new Event("change")); return ${READ}; })()`);
    assert.deepEqual(atClub.ids, upcoming.filter((e) => e.source === "onepa" && e.venue_group === club).map((e) => e.id));
    const library = await evaluate(`(() => { document.getElementById("reset").click(); const s = document.getElementById("venue"); s.value = "Tampines Regional Library"; s.dispatchEvent(new Event("change")); return ${READ}; })()`);
    assert.deepEqual(library.ids, upcoming.filter((e) => e.venue_group === "Tampines Regional Library").map((e) => e.id));
    await evaluate(`(() => { document.getElementById("reset").click(); document.querySelector('#categories button[data-category="maker"]').click(); })()`);

    // Price: Paid keeps the classes with a fee.
    const paid = await evaluate(`(() => { document.querySelector('#price button[data-price="paid"]').click(); return ${READ}; })()`);
    assert.deepEqual(paid.ids, upcoming.filter((e) => e.category !== "maker" && e.free === false).map((e) => e.id));
    if (!paid.ids.length) assert.match(paid.empty.join(" "), /No class matches/);

    // Reset, then audience: only classes NLB lists for that audience.
    const audience = "Teenagers (13-17 yo)";
    const teens = await evaluate(`(() => { document.getElementById("reset").click(); const s = document.getElementById("audience"); s.value = ${JSON.stringify(audience)}; s.dispatchEvent(new Event("change")); return ${READ}; })()`);
    assert.deepEqual(teens.ids, upcoming.filter((e) => (e.audiences || []).includes(audience)).map((e) => e.id));

    // Calendar: a day lists only that day's classes; choosing it again clears the day.
    const day = (upcoming[upcoming.length - 1].start || "").slice(0, 10);
    const oneDay = await evaluate(`(() => { document.getElementById("reset").click(); document.querySelector('#calendar button[data-date="${day}"]').click(); return ${READ}; })()`);
    assert.deepEqual(oneDay.ids, upcoming.filter((e) => (e.start || "").startsWith(day)).map((e) => e.id));
    assert.match(oneDay.hash, new RegExp(`from=${day}&to=${day}`));
    assert.equal(await evaluate(`document.getElementById("from").value`), day);
    const cleared = await evaluate(`(() => { document.querySelector('#calendar button[data-date="${day}"]').click(); return ${READ}; })()`);
    assert.deepEqual(cleared.ids, first.ids);

    // Past classes come back on request.
    const past = await evaluate(`(() => { const c = document.getElementById("past"); c.checked = true; c.dispatchEvent(new Event("change")); return ${READ}; })()`);
    assert.deepEqual(past.ids, data.events.map((e) => e.id));

    assert.deepEqual(page.errors, []);
    // Only the page itself (file:) and the browser's own data: images, such as the date picker's icon.
    assert.deepEqual(page.requests.filter((u) => !/^(?:file|data):/.test(u)), [], "the page fetches nothing");
  } finally {
    await page.close();
  }
});

test("a deep link restores the filters and marks the linked class", { skip: !browser, timeout: 30000 }, async () => {
  // A onePA class, linked with its own source, club and price, as "Link to this class" would.
  const target = upcoming.find((e) => e.source === "onepa") || upcoming[0];
  const price = target.free ? "free" : "paid";
  const page = await openPage(`#cat=${target.category}&org=${target.source}&venue=${encodeURIComponent(String(target.venue_group))}&price=${price}&event=${target.id}`);
  try {
    const view = await page.evaluate(`(() => ({ ...${READ},
      pressed: [...document.querySelectorAll("#categories button[aria-pressed=true]")].map((b) => b.dataset.category),
      price: document.querySelector("#price button[aria-pressed=true]").dataset.price,
      organiser: document.querySelector("#organiser button[aria-pressed=true]").dataset.org,
      venue: document.getElementById("venue").value,
      selected: [...document.querySelectorAll("#list article.selected")].map((a) => a.dataset.id) }))()`);
    assert.deepEqual(view.pressed, [target.category]);
    assert.deepEqual([view.price, view.organiser, view.venue], [price, target.source, target.venue_group]);
    assert.deepEqual(view.selected, [target.id]);
    assert.deepEqual(view.ids, upcoming.filter((e) => e.category === target.category && e.source === target.source
      && e.venue_group === target.venue_group && e.free === target.free).map((e) => e.id));
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});
