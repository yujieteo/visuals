/* The page's model, run from the page itself: loading the snapshot, filtering by kind, dates, price, audience and
   time, the calendar grid, the URL fragment, the labels, and the booking links the page will show. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/** @param {string} name */
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const html = read("index.html");
const model = /** @type {RegExpExecArray} */ (/<script id="events-model">\n([\s\S]*?)<\/script>/.exec(html))[1];
/** A fresh model, as the page loads it. @returns {typeof TampinesEvents} */
const load = () => {
  /** @type {{ self?: unknown, TampinesEvents?: typeof TampinesEvents }} */
  const ctx = {};
  ctx.self = ctx;
  vm.runInNewContext(model, ctx);
  return /** @type {typeof TampinesEvents} */ (ctx.TampinesEvents);
};
const M = load();
const raw = JSON.parse(read("data.json"));
const data = M.load(raw);
const plain = (/** @type {unknown} */ v) => JSON.parse(JSON.stringify(v));
/* The model runs in its own realm, so its arrays and objects are compared as JSON. */
const eq = (/** @type {unknown} */ actual, /** @type {unknown} */ expected, /** @type {string} */ message = "") => assert.deepEqual(plain(actual), plain(expected), message);
/** Midnight at the start of a Singapore date, in ms. @param {string} date */
const sgt = (date) => Date.parse(`${date}T00:00:00+08:00`);

/** @param {Partial<ClassEvent> & { id: string }} e @returns {ClassEvent} */
const ev = (e) => ({ title: `Class ${e.id}`, category: "maker", ...e });
const SAMPLE = [
  ev({ id: "1", category: "maker", start: "2026-10-04T15:00:00+08:00", end: "2026-10-04T17:30:00+08:00", free: true, audiences: ["Teenagers (13-17 yo)"] }),
  ev({ id: "2", category: "cooking", start: "2026-10-26T11:00:00+08:00", end: "2026-10-26T13:00:00+08:00", free: true, audiences: ["Seniors (50 yo and above)"] }),
  ev({ id: "3", category: "hands-on", start: "2026-11-28T14:00:00+08:00", end: "2026-11-28T16:00:00+08:00", free: false, audiences: ["Teenagers (13-17 yo)"] }),
  ev({ id: "4", category: "maker", start: "2026-10-01T10:00:00+08:00", end: "2026-10-01T12:00:00+08:00", free: true }),
];
const NOW = sgt("2026-10-03");

test("the inlined snapshot is data.json and every class can be booked on an official NLB or onePA page", () => {
  const inline = /** @type {RegExpExecArray} */ (/<script id="events-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html))[1];
  eq(JSON.parse(inline), raw, "run python3 build.py after refresh.py");
  assert.equal(data.events.length, raw.events.length, "load() keeps every class in the snapshot");
  assert.ok(data.events.length > 0);
  eq(data.categories.map((c) => c.id), M.CATEGORY_IDS);
  for (const e of data.events) {
    assert.ok(M.bookingOk(e.booking_url), `${e.id}: ${e.booking_url}`);
    assert.match(String(e.booking_url), e.source === "onepa" ? /^https:\/\/www\.onepa\.gov\.sg\/(courses|events|interest-groups)\// : /^https:\/\/(nlb\.libcal\.com|www\.nlb\.gov\.sg|go\.gov\.sg)\//);
    assert.ok(e.venue_group, `${e.id} has a venue to filter by`);
    assert.match(String(e.start), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
  }
  assert.match(data.retrieved, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
  eq(data.sources.map((x) => [x.id, x.organiser]), [["nlb", "NLB"], ["onepa", "onePA"]]);
  assert.equal(data.sources[0].listing_url, "https://www.nlb.gov.sg/main/whats-on/events");
  assert.match(data.sources[1].listing_url, /^https:\/\/www\.onepa\.gov\.sg\//);
  eq([...new Set(data.events.map((e) => e.source))].sort(), ["nlb", "onepa"], "both sources contribute classes");
});

test("load drops what it cannot show and sorts by start", () => {
  const got = M.load({ events: [SAMPLE[2], { id: "x", title: "No kind" }, { title: "No id", category: "maker" }, SAMPLE[0], null] });
  eq(got.events.map((e) => e.id), ["1", "3"]);
  eq(plain(M.load(null).events), []);
  eq(plain(M.load("not data").events), []);
});

test("past classes are hidden unless asked for", () => {
  const s = M.defaults();
  eq(M.filter(SAMPLE, s, NOW).map((e) => e.id), ["1", "2", "3"]);
  eq(M.filter(SAMPLE, { ...s, past: true }, NOW).map((e) => e.id), ["1", "2", "3", "4"]);
  assert.equal(M.isPast(SAMPLE[0], Date.parse("2026-10-04T17:29:00+08:00")), false, "running until its end");
  assert.equal(M.isPast(SAMPLE[0], Date.parse("2026-10-04T17:31:00+08:00")), true);
  assert.equal(M.isPast(ev({ id: "9" }), NOW), false, "a class without times is never past");
});

test("each filter narrows the list on its own", () => {
  const s = M.defaults();
  eq(M.filter(SAMPLE, { ...s, categories: ["cooking"] }, NOW).map((e) => e.id), ["2"]);
  eq(M.filter(SAMPLE, { ...s, categories: [] }, NOW), []);
  eq(M.filter(SAMPLE, { ...s, price: "paid" }, NOW).map((e) => e.id), ["3"]);
  eq(M.filter(SAMPLE, { ...s, price: "free" }, NOW).map((e) => e.id), ["1", "2"]);
  eq(M.filter(SAMPLE, { ...s, audience: "Teenagers (13-17 yo)" }, NOW).map((e) => e.id), ["1", "3"]);
  eq(M.filter(SAMPLE, { ...s, from: "2026-10-05", to: "2026-10-31" }, NOW).map((e) => e.id), ["2"]);
  eq(M.filter(SAMPLE, { ...s, from: "2026-10-26", to: "2026-10-26" }, NOW).map((e) => e.id), ["2"], "one day, inclusive");
  eq(M.filter(SAMPLE, { ...s, to: "2026-10-04" }, NOW).map((e) => e.id), ["1"]);
  eq(M.filter(SAMPLE, { ...s, from: "2026-12-01" }, NOW, { ignoreDates: true }).map((e) => e.id), ["1", "2", "3"]);
  eq(M.filter(SAMPLE, { ...s, categories: [] }, NOW, { ignoreCategories: true }).map((e) => e.id), ["1", "2", "3"]);
  eq(M.filter([ev({ id: "5", start: "2026-10-10T10:00:00+08:00" })], { ...s, price: "free" }, NOW), [], "an unpublished fee is neither free nor paid");
});

test("the URL fragment round-trips a state and rejects anything malformed", () => {
  assert.equal(M.encode(M.defaults()), "");
  /** @type {TampinesState} */
  const s = { categories: ["cooking", "maker"], organiser: "onepa", venue: "Tampines East CC", from: "2026-10-05", to: "2026-10-31", price: "free", audience: "Seniors (50 yo and above)", past: true, event: "onepa-c027244088" };
  const hash = M.encode(s);
  assert.equal(hash, "cat=cooking,maker&org=onepa&venue=Tampines%20East%20CC&from=2026-10-05&to=2026-10-31&price=free&aud=Seniors%20(50%20yo%20and%20above)&past=1&event=onepa-c027244088");
  eq(plain(M.decode(`#${hash}`)), s);
  eq(plain(M.decode("#cat=")).categories, [], "no kind chosen survives a reload");
  eq(plain(M.decode("#from=2026-11-01&to=2026-10-01")), { ...M.defaults(), from: "2026-10-01", to: "2026-11-01" }, "a reversed range is swapped");
  eq(plain(M.decode("#cat=cooking,soup&org=pa&price=cheap&from=tomorrow&event=../x&aud=%E0%A4%A&past=yes")), { ...M.defaults(), categories: ["cooking"] });
  eq(plain(M.decode("#event=5975969")).event, "5975969", "NLB's links from before onePA still open their class");
  eq(plain(M.decode("")), M.defaults());
  eq(plain(M.normalize({ categories: ["hands-on", "maker"] })).categories, ["maker", "hands-on"], "kinds keep their fixed order");
});

test("the calendar lays out whole months, Monday first, with each day's classes", () => {
  const months = M.calendar(M.filter(SAMPLE, M.defaults(), NOW));
  eq(months.map((m) => m.label), ["October 2026", "November 2026"]);
  const oct = months[0];
  assert.equal(oct.cells.findIndex((c) => c !== null), 3, "1 October 2026 is a Thursday");
  const days = oct.cells.filter((c) => c !== null);
  assert.equal(days.length, 31);
  eq(days.filter((c) => c.events.length).map((c) => [c.date, c.events.map((e) => e.id)]), [["2026-10-04", ["1"]], ["2026-10-26", ["2"]]]);
  assert.equal(months[1].cells.findIndex((c) => c !== null), 6, "1 November 2026 is a Sunday");
  eq(M.calendar([]), []);
  eq(M.calendar([SAMPLE[0], ev({ id: "6", start: "2027-01-02T10:00:00+08:00" })]).map((m) => m.key), ["2026-10", "2026-11", "2026-12", "2027-01"], "across a new year");
});

test("days group classes in start order", () => {
  const groups = M.byDay([SAMPLE[1], SAMPLE[0], ev({ id: "7", start: "2026-10-04T09:00:00+08:00" })]);
  eq(groups.map((g) => [g.date, g.events.map((e) => e.id)]), [["2026-10-04", ["1", "7"]], ["2026-10-26", ["2"]]]);
});

test("labels say what NLB published and nothing more", () => {
  assert.equal(M.dayLabel("2026-10-04"), "Sun 4 Oct 2026");
  assert.equal(M.dayLabel(""), "Date not published");
  assert.equal(M.durationText(150), "2 h 30 min");
  assert.equal(M.durationText(30), "30 min");
  assert.equal(M.durationText(60), "1 h");
  assert.equal(M.durationText(undefined), "");
  assert.equal(M.timeText(ev({ id: "1", time_label: "15:00 - 17:30" })), "15:00–17:30");
  assert.equal(M.priceText(SAMPLE[0]), "Free");
  assert.equal(M.priceText(SAMPLE[2]), "Paid: the fee is on the NLB page");
  assert.equal(M.priceText(ev({ id: "8" })), "Fee not published");
  eq(plain(M.statusOf({ status: "open", seats_left: 21 }, NOW)), { label: "21 seats left", tone: "ok" });
  eq(plain(M.statusOf({ status: "open", seats_left: 1 }, NOW)), { label: "1 seat left", tone: "ok" });
  eq(plain(M.statusOf({ status: "waitlist" }, NOW)), { label: "Full: waiting list open", tone: "warn" });
  eq(plain(M.statusOf({ status: "full" }, NOW)), { label: "Full", tone: "bad" });
  eq(plain(M.statusOf(undefined, NOW)), { label: "Seats not published", tone: "unknown" });
  assert.equal(M.sgtDate(Date.parse("2026-10-03T16:30:00Z")), "2026-10-04", "after 4 pm UTC it is the next day in Singapore");
  assert.equal(M.addDays("2026-10-28", 6), "2026-11-03");
});

test("booking links must be NLB's or onePA's own https pages", () => {
  for (const url of ["https://nlb.libcal.com/event/5974092", "https://www.nlb.gov.sg/main/whats-on/events", "https://go.gov.sg/lljtampines", "https://www.onepa.gov.sg/courses/breadmaking-c027244088"]) assert.ok(M.bookingOk(url), url);
  for (const url of ["http://nlb.libcal.com/event/1", "https://nlb.libcal.com.evil.example/event/1", "https://example.com/?u=https://go.gov.sg/", "https://onepa.gov.sg.example/x", "javascript:alert(1)", undefined, 5]) {
    assert.equal(M.bookingOk(url), false, String(url));
  }
});

test("describe gives an agent the card's facts and the booking link", () => {
  const e = data.events[0];
  const d = M.describe(e, data.categories, NOW);
  assert.equal(d.id, e.id);
  assert.equal(d.booking_url, e.booking_url);
  assert.equal(d.category_label, data.categories.find((c) => c.id === e.category)?.label);
  assert.equal(d.past, false);
  assert.equal(M.describe({ ...e, booking_url: "https://example.com/x" }, data.categories, NOW).booking_url, undefined);
});

test("the audiences list runs from the youngest age band", () => {
  eq(M.audiences([ev({ id: "1", audiences: ["Seniors (50 yo and above)", "Parents", "Preschoolers (4-6 yo)"] }), ev({ id: "2", audiences: ["Teenagers (13-17 yo)", "Parents"] })]),
    ["Preschoolers (4-6 yo)", "Teenagers (13-17 yo)", "Seniors (50 yo and above)", "Parents"]);
});

const CC = [
  ev({ id: "onepa-c027244088", source: "onepa", organiser: "onePA", venue_group: "Tampines East CC", category: "cooking", start: "2026-11-16T10:30:00+08:00",
    end: "2026-11-16T13:00:00+08:00", free: false, fees: [{ label: "Passion Member", amount: 40 }, { label: "Non Passion Member", amount: 45 }],
    registration: { status: "open", seats_left: 7, capacity: 12 } }),
  ev({ id: "onepa-c027245039", source: "onepa", organiser: "onePA", venue_group: "Tampines Central CC", category: "cooking", start: "2026-10-07T19:00:00+08:00",
    end: "2026-11-11T21:00:00+08:00", session_count: 3, sessions: [{ start: "2026-10-07T19:00:00+08:00", end: "2026-10-07T21:00:00+08:00" },
      { start: "2026-10-14T19:00:00+08:00", end: "2026-10-14T21:00:00+08:00" }, { start: "2026-11-11T19:00:00+08:00", end: "2026-11-11T21:00:00+08:00" }] }),
  ev({ id: "5974092", source: "nlb", organiser: "NLB", venue_group: "Tampines Regional Library", category: "maker", start: "2026-10-04T15:00:00+08:00", free: true }),
];

test("organiser and venue narrow the list to one source or one place", () => {
  const s = M.defaults();
  eq(M.filter(CC, { ...s, organiser: "onepa" }, NOW).map((e) => e.id), ["onepa-c027244088", "onepa-c027245039"]);
  eq(M.filter(CC, { ...s, organiser: "nlb" }, NOW).map((e) => e.id), ["5974092"]);
  eq(M.filter(CC, { ...s, venue: "Tampines Central CC" }, NOW).map((e) => e.id), ["onepa-c027245039"]);
  eq(M.filter(CC, { ...s, organiser: "nlb", venue: "Tampines Central CC" }, NOW), [], "both must hold");
  eq(M.venues(CC), ["Tampines Regional Library", "Tampines Central CC", "Tampines East CC"], "the library first, then the clubs by name");
});

test("onePA classes read with their fees, places, sessions and booking label", () => {
  assert.equal(M.priceText(CC[0]), "$40 Passion Member · $45 Non Passion Member");
  assert.equal(M.priceText(CC[2]), "Free");
  assert.equal(M.priceText(ev({ id: "9", organiser: "onePA", free: false })), "Paid: the fee is on the onePA page");
  eq(M.statusOf(CC[0].registration, NOW), { label: "7 of 12 places left", tone: "ok" });
  eq(M.statusOf({ status: "full", seats_left: 0, capacity: 25 }, NOW), { label: "Full", tone: "bad" });
  assert.equal(M.bookLabel(CC[0]), "Book on onePA");
  assert.equal(M.bookLabel(CC[2]), "Book on NLB");
  assert.equal(M.sessionsText(CC[1]), "3 sessions, Wed 7 Oct 2026 to Wed 11 Nov 2026");
  assert.equal(M.sessionsText(CC[0]), "", "a one-off class says nothing about sessions");
  assert.equal(M.sessionsText(ev({ id: "8", session_count: 6 })), "6 sessions");
  const d = M.describe(CC[0], data.categories, NOW);
  eq([d.organiser, d.venue_group, d.capacity, d.fees], ["onePA", "Tampines East CC", 12, CC[0].fees]);
});

test("a onePA class whose registration has closed says so, though it has not run yet", () => {
  const cookies = ev({ id: "onepa-c027245435", source: "onepa", organiser: "onePA", category: "cooking", title: "Cookie Decorating",
    start: "2026-10-24T15:00:00+08:00", end: "2026-10-24T17:00:00+08:00", booking_url: "https://www.onepa.gov.sg/courses/cookie-decorating-c027245435",
    registration: { status: "open", seats_left: 11, capacity: 12, closes: "2026-10-21T14:59:00+08:00" } });
  const before = Date.parse("2026-10-21T14:58:00+08:00"), after = Date.parse("2026-10-21T15:00:00+08:00");
  eq(M.statusOf(cookies.registration, before), { label: "11 of 12 places left", tone: "ok" });
  eq(M.statusOf(cookies.registration, after), { label: "Registration closed", tone: "unknown" });
  assert.equal(M.registrationClosed(cookies.registration, before), false);
  assert.equal(M.registrationClosed(cookies.registration, after), true);
  assert.equal(M.isPast(cookies, after), false, "it still runs on 24 October");
  const [open, closed] = [before, after].map((t) => M.describe(cookies, data.categories, t));
  eq([open.registration_label, open.registration_closed], ["11 of 12 places left", false]);
  eq([closed.registration_label, closed.registration_closed, closed.registration_closes], ["Registration closed", true, "2026-10-21T14:59:00+08:00"]);
  assert.equal(M.registrationClosed({ status: "open" }, after), false, "a class without a closing time is never closed by the clock");
});
