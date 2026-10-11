# Paper links (links)

The folder is a sealed artifact (`"sealed": true` in `visual.json`). The crate in it, with `look/` (the site's
theme, fonts and header), builds `index.html`: the whole page, with the search compiled to WebAssembly and
`links.json` packed, compressed and inlined, so the page fetches nothing. The Links page of yujieteo/site
(`teoyujie.org/notes/links/`) embeds that page, and the site's `visuals.lock` pins its SHA-256, so a change
here takes effect only when the site pins the new commit.

Never hand-edit `index.html`. After a change to `src/`, `look/` or `links.json`, rebuild it from the repository root:

```sh
cargo build --release --target wasm32-unknown-unknown -p links --lib
cargo run --release -q -p links --bin page -- target/wasm32-unknown-unknown/release/links.wasm viz/links/index.html
```

The page builder stops when the compressed data does not decode back to `links.json` byte for byte. The
checks in `visual.json` rebuild the page and compare it with `index.html`. Tests are disposable: check a change
end to end in the built page, and do not commit regression tests. In an iframe (the site's embed), the page
hides its header, title and lede, does not write the search to the URL, and follows the site's mode and
theme. The WebMCP tools are in `src/tools.json`; `visual.json` names the same tools.

## Provenance

`links.json` held 2,523 of the 16,431 records of `data/paper-links/paper-links.yaml` in yujieteo/sitedumb
(private) at commit 8a823b9bd4007b3116d21c12593f227baed2a806, the last commit with the old Paper Links page. It
was converted once from YAML to JSON, one record a line, with the keys `title`, `url`, `category`, `tags`,
`authors` and `year` (when the record has them) and `note`. Then every record on `github.com` (9,000) and
`gitlab.com` (4,908) was removed, because those URLs open a viewer page, not the file. Records on `*.github.io`,
`*.gitlab.io` and all other hosts stay, in order and unchanged. Do not rewrite a viewer URL to a raw URL: a raw URL
downloads the file.
After that, 416 new records were added at the end: 277 Beamer slide PDFs (tag `slides`) and 139 pure-maths papers
(tag `paper`). Each one is a PDF on a university web server. Each one opened as `application/pdf` with HTTP 200
when it was added. The slides show Beamer in the PDF metadata and have landscape pages. No old record changed.
`data/resources/resources.yaml` of the old site is not part of it. Edit `links.json` itself from now on.

In `links.json`, the slash after `/home` or `/Users` is written `\/`. JSON reads it as the same slash, but
`scripts/check_repo.py` then finds no text that looks like a home folder (some URLs and notes hold one).
`src/json.rs` writes the same escape, and the page builder checks that the data decodes back to the file.

## What the page keeps from the old page

| File | Holds |
| --- | --- |
| `src/search.rs` | The search of `static/js/corpus.js`: every word must occur in the title, note, site or tags after `normalize("NFKC").toLowerCase()`; a word scores 8 in the title, 5 in the tags, 2 in the note, plus 1; ties keep the data order. Tags in one facet match any of them, and facets must all match. The facets are those of `scripts/filter_lists.py`, plus Site (the category). |
| `src/bib.rs` | `static/js/bibtex.js` with the citation of `scripts/paper_tags.py`: the same keys, fields and escaping. A selection exports in data order, the filtered export in ranked order. |
| `src/app.rs` | The page's state, HTML and events (`static/js/filter.js` and `paper-bib.js`): ten links a page, eight tags a facet before "Show all", the tag finder, the chips, the Cite boxes, the copy and download buttons and their messages. |
| `src/tex.rs` | TeX in titles and notes as MathML Core, with MathJax's delimiters (`$...$`, `\(...\)`, `$$...$$`, `\[...\]`, `\$` for a dollar). A formula it cannot read shows as its source. |
| `src/fold.rs` | The NFKC and NFKD folds that the search and the citation keys need. It covers the characters in `links.json`; a new kind of character may need a line here. |
| `src/data.rs`, `src/codec.rs` | The columns the page carries, and their compression: LZ77 with an optimal parse and an adaptive range coder, in the manner of LZMA. |
| `src/wasm.rs`, `src/bin/page.rs` | The WebAssembly entry, and the page builder with the host script, which only touches the DOM. |
