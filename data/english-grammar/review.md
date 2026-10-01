# english-grammar: content review log and manual acceptance

## Sources used for references

- Chapter titles, authors and page ranges: the book's contents on Cambridge Core and the
  publisher's front-matter sample held by the Library of Congress (`meta.json`).
- Section numbers, titles and start pages: the contents list printed on each chapter's first
  page, as published on Cambridge Core (Chapters 2–8, 10–12, 14–16), and the front-matter
  sample (Chapter 1). Sections listed on later pages of those contents lists were not visible,
  so they are not cited: fused heads, genitives, supplementation and the Chapter 16 treatment of
  the passive cite the chapter only.
- Page numbers are section start pages from those lists. No other page numbers are given.
- The book's text could not be consulted, and no analysis has been checked against it. Analyses
  follow the book's framework as known to the author. Section references in the table below are
  section titles from the verified contents pages, not checks of the text.

## Analyses settled from memory (informational)

Every analysis below was settled from the author's knowledge of the framework and has not been
checked against the book's text. The explorer does not aim at total fidelity to the book, so this
list is a note for readers and future editors, not a publication blocker.

| Concept / example | Question | Analysis used |
| --- | --- | --- |
| Clause type, auxiliaries | How the book draws main-clause subject–auxiliary inversion (*Is Kim ready?*): flat clause or discontinuous VP | Not settled from available pages. No inverted clause is drawn; interrogatives are shown as subordinate clauses and inversion is described in text and in the technical notes. |
| Noun phrase structure | Whether a nominal (Nom) is drawn when the head noun has no dependents | Nom is stored when the head noun has a modifier or complement, otherwise the NP's head is the noun. Stated in the concept's technical note. |
| Determiners and determinatives | Single-word determiner as `Det: D` while determinatives in other functions are DPs | Kept: a bare determinative in determiner function, a DP when a determinative is a modifier (*big enough*, *much better*, *the three students*). Stated in the technical note. |
| *The three students passed.* | Numeral after *the*: determiner or modifier | Modifier within the nominal; *the* fills the determiner function. |
| Adjuncts | Attachment of adjuncts | Post-verbal and pre-verbal adjuncts are dependents in the VP; front adjuncts are dependents of the clause. No extra VP or clause layer is posited. |
| Passive by-phrase | Function label | Complement, construction "internalised complement (by-phrase)", following the book's term for the passive by-phrase (Ch. 16; section not on the verified contents page). |
| Extraposition | Position and label of the extraposed clause | "Extraposed subject", a dependent in the VP, with dummy *it* as subject (Ch. 16 §7.1, Ch. 4 §3.2.2). |
| *who won the prize* | Subject relatives: is *who* a prenucleus with a subject gap? | Treated as prenucleus plus subject gap, consistent with the other wh relatives. Subject *wh* interrogatives (*Who called?*), where the same question arises, are not used. |
| *which*, *what* | Category of standalone *which* / *what* | Determinative (cited at Ch. 5 §7.13–7.14). Standalone, *which* and *what* are fused determiner-heads, and fused-relative *what* is head fused with prenucleus (Ch. 12 §6). |
| *Kim, my neighbour, fixed the fence.* | Where a supplement attaches | A clause dependent labelled Supplement with an explicit anchor; the subject NP is just *Kim*. |
| Coordination | Category label for a coordination | "Coordination", with the construction field naming what is coordinated (e.g. coordination of NPs). The coordinator is a Marker within the coordinate it introduces. |
| *to* infinitivals | Where infinitival *to* attaches | Marker on the VP (Ch. 14 §1.4.2); *for* marks the clause when there is a subject. |
| Auxiliaries | Dependent-auxiliary or catenative analysis | The catenative analysis (Ch. 14 §4.2.2): the auxiliary is the predicator and takes a non-finite clause complement. |
| *The meeting is on Monday.* | Temporal PP after *be* | Predicative complement (cited at Ch. 4 §5.2 and Ch. 8 §6.1). |
| *Kim knows that Pat left.* | Content clause after *know*: object? | Complement, not object; the explanation says that "object" is reserved for NPs in this analysis. |
| Genitives as determiners | Term and location | Subject-determiner, cited at Ch. 5 §4 (The determiner function). The genitive case itself is treated later in Ch. 5, outside the verified page. |
| Avoided items | Category of *yesterday*, *everyone*, *there* (existential) | Not used in v1 because their category could not be confirmed. |

## Automated checks

`python3 scripts/build_english_grammar.py --verify`, `python3 -m unittest tests/test_english_grammar.py`
and `node --test tests/english-grammar.test.mjs` cover IDs and links, token boundaries, ordinary
nesting, declared gaps, fusions and supplements, sentence/inspector/tree consistency, canonical
names versus aliases, chapter metadata, determinism, zero external requests, release counts,
the size budget, Solarized contrast pairs, and fragment, traversal and search logic.

## Manual acceptance (1 October 2026)

| Check | Result |
| --- | --- |
| Chromium desktop: Chrome 154 (headless, via DevTools), 1280 px | Passed: start view, navigator, search, rail, unfolding, inspector, tree, compare, deep links, Back/Forward, invalid fragment notice. No console errors. |
| Direct `file://` opening | Passed in Chrome. |
| Inside an iframe (`file://` host page) | Passed in Chrome; deep link honoured inside the frame. |
| Offline | Passed: with the network emulated offline the only request is the page itself. |
| 320 px layout | Passed in Chrome mobile emulation: no horizontal page scroll with every disclosure open; tree and strip scroll inside bounded regions. |
| Touch targets | Passed: every visible link, button, input and summary at 320 px is at least 44 × 44 px. |
| Both Solarized modes | Light and dark checked visually in Chrome; contrast ratios checked by the builder. |
| Keyboard traversal | Passed in Chrome: Tab reaches controls; arrows move up, down, left and right; Home goes to the top; selection is announced. |
| Mobile drawer focus | Passed in Chrome emulation: opens as a modal dialog, focus goes to search, the rest is inert, Escape closes and returns focus to the Concepts button. |
| Contrast stacking | Passed: pairs stack at 320 px. |
| Synchronised tree selection | Passed: selecting in either view updates the other and the inspector without moving focus. |
| No-JavaScript fallback | Passed in Chrome with scripts disabled: introduction, analysed start example and chapter index; the note explains what needs JavaScript. |
| Reduced motion | The page has no transitions or animations; the reduced-motion rule was not exercised in a browser. |
| Safari desktop | Not checked: WebDriver needs "Allow remote automation", which is off on this machine. |
| Safari at iPhone size | Not checked (no device or simulator automation available). |
| Firefox | Not checked: not installed. |
| Screen reader | Not checked with a real screen reader; accessible names and live announcements were inspected in the accessibility tree. |
