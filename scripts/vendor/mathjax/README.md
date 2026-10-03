# Vendored MathJax 4.1.3 and its Fira font

Byte-for-byte copies of the npm packages `mathjax@4.1.3` (TeX input, SVG output, assistive MathML) and
`@mathjax/mathjax-fira-font@4.1.3` (the SVG font built from Fira Math, with every dynamic range), for visuals
generated with `scripts/new_visual.py --mathjax`. `scripts/visual_kit.py` inlines them, after a short
configuration, in one `<script data-vendor="mathjax-4.1.3">` block, so the page typesets offline with no request
and no speech worker. The page shows both licences.

`SOURCES.json` names each package's tarball, its npm integrity and the SHA-256 of every file here.
`scripts/check_repo.py` fails when a file changes, and `scripts/check.py` fails when a page's vendored block is
not the bundle these files make. Never edit a file here. To move to a new version, replace the files from the
new tarballs, update `SOURCES.json`, then run `python3 scripts/new_visual.py --update` for each visual that lists
`scripts/vendor/mathjax` in `uses`.

| Path | From | Licence |
| --- | --- | --- |
| `mathjax/tex-svg-nofont.js`, `mathjax/a11y/assistive-mml.js`, `mathjax/LICENSE` | `mathjax@4.1.3` `package/` | Apache-2.0 |
| `mathjax-fira-font/svg.js`, `mathjax-fira-font/svg/dynamic/*.js` | `@mathjax/mathjax-fira-font@4.1.3` `package/` | Apache-2.0 (the package ships no licence file, so `mathjax-fira-font/LICENSE` is MathJax's Apache-2.0 text) |
| `mathjax-fira-font/FiraMath-LICENSE.txt` | [firamath/firamath `LICENSE`](https://github.com/firamath/firamath/blob/f45db84c23fe513e136ecdcbf84918fb9732dcbe/LICENSE) | SIL Open Font License 1.1, for the Fira Math glyphs |
