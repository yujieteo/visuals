# Diagonal tension

No build step: edit `diagonal-tension.html`, then copy it to `index.html` (the tests require them identical). Its blocks are `dt-engine` (the numeric core, `self.DiagonalTension`: no DOM, storage, clock or randomness), `dt-beamdswitch` (the inlined `beamdswitch.js`), `dt-worker` (`text/plain`, the Web Worker's loop, run after the engine text in a Blob) and `dt-ui` (the page and the WebMCP tools).

`raw.json` must equal the engine's `META` and `modelJSON(defaultState())`; after changing either, regenerate it:

```sh
node -e 'const fs=require("fs"),vm=require("vm"),h=fs.readFileSync("diagonal-tension.html","utf8"),c={};c.self=c;vm.createContext(c);vm.runInContext(/<script id="dt-engine">([\s\S]*?)<\/script>/.exec(h)[1],c);const D=c.DiagonalTension;fs.writeFileSync("raw.json",JSON.stringify({meta:D.META,model:JSON.parse(D.modelJSON(D.defaultState(),null))},null,2)+"\n")'
```

Units are mm, N, MPa and kg; tension is positive; comparisons use unsmoothed Gauss-point values. The model stays linear elastic and pre-buckling: post-buckling tension fields, crippling, fastener slip or doubler bending need new, validated elements, not display options. The deck is offered only after a validated run. The model tests cover every acceptance item, with references written independently of the solver; `tests/diagonal-tension-page.test.mjs` drives the page in headless Chrome (set `CHROME_PATH` if it is not found; it skips locally without one and fails in CI) and downloads under `/tmp/diagonal-tension-v1/downloads` or `DT_DOWNLOAD_DIR`. Rules for every visual: [SKILLS.md](../../SKILLS.md).
