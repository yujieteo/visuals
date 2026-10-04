"""The Wikidata and Wikipedia adapter (spec section 3.1).

Declared corpus: the Wikidata items that mathlib4's docs/1000.yaml lists (the 1000+ theorems project) at the
pinned mathlib commit. For each item the adapter reads, through the public MediaWiki APIs (no account):

  Wikidata   wbgetentities: English label, aliases and description, the item's last revision, the English
             Wikipedia sitelink, and the claims P31 (instance of), P138 (named after), P575 (time of
             discovery or invention) and P61 (discoverer or inventor)
  Wikipedia  query with prop=extracts (plain-text lead section) and revisions (revision ID and timestamp) for
             the sitelinked English page

Answers are cached in <work>/cache/wiki/ so a run reads each page once; a refresh deletes the cache. Failures
(missing items, pages without a sitelink, HTTP errors) are recorded per item, never dropped. Requests are paced
at one per second with a descriptive User-Agent, within the Wikimedia API etiquette.

Reuse: Wikidata data is CC0. Wikipedia text is CC BY-SA 4.0; the pipeline keeps the first two sentences of the
lead as a quoted, attributed passage with its revision link.
"""
import json
import re
import time
import urllib.parse
import urllib.request

from common import WORK

USER_AGENT = "theorem-explorer-pipeline/1 (https://github.com/yujieteo/visuals; offline research snapshot)"
WIKIDATA = "https://www.wikidata.org/w/api.php"
WIKIPEDIA = "https://en.wikipedia.org/w/api.php"
CACHE = WORK / "cache" / "wiki"
CLAIMS = ("P31", "P138", "P575", "P61")


def _get(url, params, pause=1.0):
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{query}", headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = json.loads(r.read().decode("utf-8"))
            time.sleep(pause)
            return body
        except Exception as e:  # noqa: BLE001 - retried, then recorded as a failure by the caller
            last = e
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")


def _claim_values(entity, prop):
    out = []
    for c in entity.get("claims", {}).get(prop, []):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(v, dict) and "id" in v:
            out.append(v["id"])
        elif isinstance(v, dict) and "time" in v:
            out.append({"time": v["time"], "precision": v.get("precision")})
    return out


def fetch_wikidata(qids):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / "wikidata.json"
    have = json.loads(path.read_text()) if path.is_file() else {}
    todo = [q for q in qids if q not in have]
    batches = [todo[i:i + 50] for i in range(0, len(todo), 50)]
    while batches:
        batch = batches.pop(0)
        try:
            body = _get(WIKIDATA, {"action": "wbgetentities", "ids": "|".join(batch), "format": "json",
                                   "props": "labels|aliases|descriptions|sitelinks|claims|info",
                                   "languages": "en", "sitefilter": "enwiki"})
        except RuntimeError as e:
            for q in batch:
                have[q] = {"failure": str(e)}
            continue
        if "error" in body:
            # one bad ID fails the whole request: ask for each ID alone to find it
            if len(batch) > 1:
                batches = [[q] for q in batch] + batches
            else:
                have[batch[0]] = {"failure": body["error"].get("info", "error")}
            continue
        for q in batch:
            ent = body.get("entities", {}).get(q)
            if not ent or "missing" in ent:
                have[q] = {"failure": "missing item"}
                continue
            have[q] = {
                "label": ent.get("labels", {}).get("en", {}).get("value"),
                "aliases": [a["value"] for a in ent.get("aliases", {}).get("en", [])],
                "description": ent.get("descriptions", {}).get("en", {}).get("value"),
                "revision": ent.get("lastrevid"),
                "modified": ent.get("modified"),
                "enwiki": ent.get("sitelinks", {}).get("enwiki", {}).get("title"),
                "redirect": ent.get("redirects", {}).get("to"),
                **{p: _claim_values(ent, p) for p in CLAIMS},
            }
        path.write_text(json.dumps(have, ensure_ascii=False, indent=0))
    return have


def fetch_wikipedia(titles):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / "wikipedia.json"
    have = json.loads(path.read_text()) if path.is_file() else {}
    todo = [t for t in dict.fromkeys(titles) if t and t not in have]
    for i in range(0, len(todo), 20):
        batch = todo[i:i + 20]
        try:
            body = _get(WIKIPEDIA, {"action": "query", "format": "json", "formatversion": "2", "redirects": "1",
                                    "prop": "extracts|revisions", "exintro": "1", "explaintext": "1",
                                    "rvprop": "ids|timestamp", "titles": "|".join(batch)})
        except RuntimeError as e:
            for t in batch:
                have[t] = {"failure": str(e)}
            continue
        q = body.get("query", {})
        back = {}
        for n in q.get("normalized", []) + q.get("redirects", []):
            back[n["to"]] = back.get(n["from"], n["from"])
        for page in q.get("pages", []):
            asked = back.get(page.get("title"), page.get("title"))
            asked = back.get(asked, asked)
            if page.get("missing"):
                have[asked] = {"failure": "missing page"}
                continue
            rev = (page.get("revisions") or [{}])[0]
            have[asked] = {"title": page["title"], "pageid": page.get("pageid"), "revision": rev.get("revid"),
                           "timestamp": rev.get("timestamp"), "extract": page.get("extract", "")}
        for t in batch:
            have.setdefault(t, {"failure": "no answer for the title"})
        path.write_text(json.dumps(have, ensure_ascii=False, indent=0))
    return have


_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")


def math_to_tex(text):
    """Plain-text extracts carry each formula twice: a rendered copy (between U+2060 marks, or on indented lines
    that start with a blank indented line), then "{\\displaystyle TeX}" or "{\\textstyle TeX}". Keep only the TeX,
    as $TeX$."""
    out, i = [], 0
    marker = re.compile(r"\{\\(?:displaystyle|textstyle)")
    while True:
        m = marker.search(text, i)
        if not m:
            out.append(text[i:])
            break
        j = m.start()
        starts = [k for k in (text.rfind("\u2060", i, j), text.rfind("\n  \n", i, j)) if k >= 0]
        if not starts:
            # an inline copy: the rendered words just before the brace, as in "a k {\\textstyle k}"
            starts = [j]
        out.append(text[i:max(starts)])
        depth, k = 0, j
        while k < len(text):
            depth += {"{": 1, "}": -1}.get(text[k], 0)
            k += 1
            if depth == 0:
                break
        tex = re.sub(r"^\\(?:display|text)style\s*", "", text[m.end():k - 1].strip())
        out.append(f" ${tex}$")
        rest = re.match(r"[\s\u2060]*", text[k:])
        if rest and "\n" in rest[0]:
            i = k + len(rest[0])
            out.append(" ")
        else:
            i = k
        if text[i:i + 1] == "\u2060":
            i += 1
    return "".join(out)


def lead_passage(extract, sentences=2):
    """The first sentences of a lead section, as the quoted passage, formulas as $TeX$."""
    text = re.sub(r"\s+", " ", math_to_tex(extract or "").replace("\u2060", "")).strip()
    text = re.sub(r"\$ ([,.;:)])", r"$\1", text)
    parts = _SENTENCE.split(text)
    return " ".join(parts[:sentences]).strip()


def fetch():
    """Fetch every declared item (mathlib4's docs/1000.yaml) and the sitelinked Wikipedia leads, through the cache."""
    from names import mathlib_lists
    wikidata = fetch_wikidata(sorted(mathlib_lists()["wikidata"]))
    wikipedia = fetch_wikipedia([v["enwiki"] for v in wikidata.values() if v.get("enwiki")])
    return wikidata, wikipedia


if __name__ == "__main__":
    wd, wp = fetch()
    print(f"wikidata {len(wd)} items ({sum(1 for v in wd.values() if 'failure' in v)} failures), "
          f"wikipedia {len(wp)} pages ({sum(1 for v in wp.values() if 'failure' in v)} failures)")
