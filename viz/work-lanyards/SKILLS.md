---
name: work-lanyards
description: Compare work and ID-card lanyards buyable in Singapore by price, rating, reviews and best value, and open the shop page to buy one, on the Work lanyards page or through its read-only WebMCP tools.
---

# Work lanyards in Singapore

A dated snapshot of work lanyards listed on Amazon.sg. Open it at <https://teoyujie.org/visuals/work-lanyards/>; it runs in the browser and works offline except for the shops' images. Prices and deals are as of the snapshot's date: check the shop.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The retrieval date, source, notes and item count. |
| `list_lanyards` | optional `sort` (`value`, `price`, `rating`, `reviews`), `maxPrice`, `minRating`, `minReviews`, `feature`, `shop` | Matching lanyards with price, rating, review count, best-value score and shop `url`. |
| `get_lanyard` | `id`, the listing's ASIN | One lanyard's full record, or null. |

Best value is rating × log10(1 + reviews) ÷ price in S$.
