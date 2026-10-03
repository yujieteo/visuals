---
name: tampines-library-events
description: Find a maker-lab (MakeIT) or hands-on class at Tampines Regional Library, or a cooking or baking class at a Tampines community club, with its NLB or onePA booking link, on the Cooking and maker classes in Tampines page or through its read-only WebMCP tools.
---

# Cooking and maker classes in Tampines

The maker-lab and other hands-on classes the National Library Board lists at Tampines Regional Library (NLB's "Tampines Library", Our Tampines Hub), and the cooking and baking classes the People's Association lists on onePA at the Tampines community clubs, from a dated snapshot of both. Open it at <https://teoyujie.org/visuals/tampines-library-events/>; everything runs in the browser and works offline. The page registers read-only WebMCP tools through the browser's `modelContext` API when the browser offers it; each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| List classes by kind, organiser, venue, dates, price or audience | `list_classes`, or the page's filters |
| Read one class's details, seats and booking link | `get_class` |
| Read the snapshot's date, sources and how classes are chosen | `get_metadata` |
| Book a class | Open its `booking_url` (the page's "Book on NLB" or "Book on onePA" link): the class's own NLB GoLibrary or onePA page |

## Inputs

- Kind: `cooking` (Cooking & food), `maker` (Maker lab) or `hands-on` (Other hands-on); data.json's `categories` gives each one's rule.
- Dates: `from` and `to` as Singapore dates, YYYY-MM-DD, inclusive.
- Organiser: `nlb` (Tampines Regional Library) or `onepa` (the Tampines community clubs).
- Venue: the library or a community club by its onePA name, such as `Tampines East CC`.
- Price: `all`, `free` or `paid`. A class whose fee its source does not publish is neither.
- Audience: one of the sources' audience names, such as `Teenagers (13-17 yo)` or `Children`.
- Past classes are left out unless asked for.

The page keeps the same filters in its URL fragment, for example `#cat=cooking&org=onepa&venue=Tampines%20East%20CC&from=2026-10-05&to=2026-10-31`.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The retrieval time, each source (NLB and onePA) with its URLs, venues and how many listings it had and kept, and the three kinds of class with their rules. |
| `list_classes` | optional `categories`, `organiser`, `venue`, `from`, `to`, `price`, `audience`, `include_past` | The matching classes in start order, each with its organiser, date, time, length, sessions, venue, audiences, ages, fees, places as of the snapshot, onePA's registration closing time (`registration_closes`, with `registration_closed` once it has passed) and `booking_url`. |
| `get_class` | `id`: NLB's event id, or `onepa-` and onePA's class code | One class's details as above, or an error naming the id when the snapshot has no such class. |

## Exports

- JSON: `data.json`, published beside the page, is the snapshot: retrieval time, the kinds and their rules, each source with its query and counts (NLB's left-out titles, onePA's per-club counts) and the kept classes.

## Worked example

Call `list_classes` for onePA cooking classes at Tampines East CC in October 2026:

```json
{"categories": ["cooking"], "organiser": "onepa", "venue": "Tampines East CC", "from": "2026-10-01", "to": "2026-10-31"}
```

It returns the Breadmaking and Basic Baking (Parent-Child) classes there, each with its fees, `booking_url` set to its `https://www.onepa.gov.sg/courses/...` page and `registration_label` such as "7 of 12 places left".

## Rules

1. Seats change quickly: give the snapshot's seats with its date and send the reader to `booking_url`, which is authoritative.
2. Quote the sources' own fields; never construct a booking link or fill in a field the snapshot leaves out.

For how the page is built and tested, see [AGENTS.md](AGENTS.md).
