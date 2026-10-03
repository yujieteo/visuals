// Copies examples.json into index.html so the page stays one self-contained
// file with its reference drawings (File menu > Examples).
import fs from "node:fs";

const json = fs.readFileSync(new URL("../examples.json", import.meta.url), "utf8").trim();
const url = new URL("../index.html", import.meta.url);
const html = fs.readFileSync(url, "utf8");
const re = /(<script type="application\/json" id="fbd-examples">)[\s\S]*?(<\/script>)/;
if (!re.test(html)) throw new Error("index.html has no fbd-examples block");
fs.writeFileSync(url, html.replace(re, (_, a, b) => `${a}\n${json.replace(/<\//g, "<\\/")}\n${b}`));
console.log("index.html examples updated");
