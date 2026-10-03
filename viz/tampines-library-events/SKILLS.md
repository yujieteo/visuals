---
name: tampines-library-events
description: Find a cooking, maker-lab (MakeIT) or other hands-on class at Tampines Regional Library and its NLB booking link, on the Hands-on classes page or through its read-only WebMCP tools.
---

# Hands-on classes at Tampines Regional Library

The cooking, maker-lab and other hands-on classes the National Library Board lists at Tampines Regional Library (NLB's "Tampines Library", Our Tampines Hub), from a dated snapshot. Open it at <https://teoyujie.org/visuals/tampines-library-events/>; everything runs in the browser and works offline. The page registers read-only WebMCP tools through the browser's `modelContext` API when the browser offers it; each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| List classes by kind, dates, price or audience | `list_classes`, or the page's filters |
| Read one class's details, seats and booking link | `get_class` |
| Read the snapshot's date, sources and how classes are chosen | `get_metadata` |
| Book a class | Open its `booking_url` (the page's "Book on NLB" link): NLB's own GoLibrary page |

## Inputs

- Kind: `cooking` (Cooking & food), `maker` (Maker lab) or `hands-on` (Other hands-on); data.json's `categories` gives each one's rule.
- Dates: `from` and `to` as Singapore dates, YYYY-MM-DD, inclusive.
- Price: `all`, `free` or `paid`. A class whose fee NLB does not publish is neither.
- Audience: one of NLB's audience names, such as `Teenagers (13-17 yo)`.
- Past classes are left out unless asked for.

The page keeps the same filters in its URL fragment, for example `#cat=maker&price=free&from=2026-10-05&to=2026-10-31&event=5974094`.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The library, the retrieval time, the NLB sources, the three kinds of class with their rules, and how many events NLB listed, kept and left out. |
| `list_classes` | optional `categories`, `from`, `to`, `price`, `audience`, `include_past` | The matching classes in start order, each with its date, time, length, venue, audiences, ages, price, seats as of the snapshot and `booking_url`. |
| `get_class` | `id`, NLB's event id | One class's details as above, or an error naming the id when the snapshot has no such class. |

## Exports

- JSON: `data.json`, published beside the page, is the snapshot: retrieval time, sources and the API query, the kinds and their rules, the kept classes and the titles of the events left out.

## Worked example

Call `list_classes` for free maker-lab classes in the week after the snapshot:

```json
{"categories": ["maker"], "price": "free", "from": "2026-10-03", "to": "2026-10-09"}
```

It returns the MakeIT sessions on 4 and 8 October 2026, each with `booking_url` set to its `https://nlb.libcal.com/event/...` page and `registration_label` such as "Full: waiting list open".

## Rules

1. Seats change quickly: give the snapshot's seats with its date and send the reader to `booking_url`, which is authoritative.
2. Quote NLB's own fields; never construct a booking link or fill in a field the snapshot leaves out.

For how the page is built and tested, see [AGENTS.md](AGENTS.md).
