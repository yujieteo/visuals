"""The monthly refresh (spec section 13): one command that makes a new snapshot, or keeps the old one.

  python3 viz/theorem-explorer/pipeline/run.py                 resolve, fetch, extract, stages, judge, assemble
  python3 viz/theorem-explorer/pipeline/run.py --offline       the same from the work directory, no network
  python3 viz/theorem-explorer/pipeline/run.py --from judge    start at a later step (after the judge writes answers)

Steps, in order (each writes <work>/refresh/<step>.log):
  resolve   the newest public version of each source: git ls-remote (mathlib4, nlab-content) and the Hugging Face
            dataset API (TheoremSearch, TheoremGraph). It rewrites data/sources/pins.json; --offline keeps it.
  fetch     the pinned versions into <work>: shallow git fetches, the dataset files, the arXiv taxonomy page and the
            Wikidata and Wikipedia records (wiki.py, cached). Requests are one per second, with no account.
  extract   the Lean extractor (pipeline/lean) over the pinned mathlib build, in SHARDS shards. Skipped when every
            shard header already names the pinned commit (the cache).
  stages    taxonomy, mathlib, nlab, theoremsearch, consolidate, theoremgraph, uses, sources, packets.
  judge     carries each earlier answer to the new packets when its cache key (packet row, prompt, rubric version,
            judge configuration) is unchanged, then lists the results that need an assessment in
            <work>/judge/todo.json. With a non-empty list the run stops here (exit 3): the judge answers, then
            `--from judge` continues. No step calls a remote model.
  assemble  assemble.py, then the snapshot links: the identity map, the previous snapshot ID and the change
            report, split into source, measurement, judge, rubric and identity changes.
  publish   copies the new raw.json into the visual, rebuilds index.html (build.py) and verifies it.

A failed step stops the run before publish, so the committed raw.json and index.html stay the preceding usable
snapshot. Every snapshot that a run sees is kept in <work>/snapshots/<id>/raw.json for later comparisons, and
<work>/refresh/report.json records the steps, the failures, the omissions and the change counts.

This is a command to run by hand. It is not scheduled, and the viewer never runs it.
"""
import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from common import DATA, ROOT, VISUAL, WORK, from_toon, pins, read_json, sha256_bytes, to_toon, write_json

HERE = Path(__file__).resolve().parent
PINS = DATA / "sources" / "pins.json"
OUT = WORK / "out"
LOGS = WORK / "refresh"
SNAPSHOTS = WORK / "snapshots"
SHARDS = 3
STEPS = ["resolve", "fetch", "extract", "stages", "judge", "assemble", "publish"]
STAGES = ["taxonomy", "mathlib", "nlab", "theoremsearch", "consolidate", "theoremgraph", "uses", "sources", "packets"]
USER_AGENT = "theorem-explorer-pipeline/1 (https://github.com/yujieteo/visuals; offline research snapshot)"
HF_API = "https://huggingface.co/api/datasets/"
HF_FILE = "https://huggingface.co/datasets/{repo}/resolve/{revision}/{file}"
TAXONOMY_URL = "https://arxiv.org/category_taxonomy"

# The fields of a core row, by the kind of change a difference in them is.
JUDGE_FIELDS = ("t", "s", "c", "s2", "c2", "cat", "acat", "lv", "ef", "pre")
MEASURE_FIELDS = ("f", "decl", "st", "stb", "sp", "spb", "pu", "hy", "nd", "ncl", "dep", "ax", "ua", "ui", "rs", "tg",
                  "yr", "ev", "evk")
SOURCE_FIELDS = ("n", "src")


class StepFailed(Exception):
    pass


def today():
    return datetime.date.today().isoformat()


def run(cmd, log, cwd=None, env=None):
    """Run one command; its output goes to the step log. A non-zero exit fails the step."""
    with open(log, "a", encoding="utf-8") as f:
        f.write(f"$ {' '.join(str(c) for c in cmd)}\n")
        f.flush()
        code = subprocess.call([str(c) for c in cmd], cwd=cwd, env=env, stdout=f, stderr=subprocess.STDOUT)
    if code:
        raise StepFailed(f"{Path(str(cmd[0])).name} exited {code}; see {log.relative_to(ROOT)}")


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.loads(r.read().decode("utf-8"))
    time.sleep(1)
    return body


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    with urllib.request.urlopen(req, timeout=600) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f)
    tmp.replace(path)
    time.sleep(1)


def remote_head(repo, branch):
    out = subprocess.run(["git", "ls-remote", repo, f"refs/heads/{branch}"], capture_output=True, text=True, check=True)
    time.sleep(1)
    return out.stdout.split()[0]


# ---------- steps ----------

def resolve(log):
    """The newest version of each source; the new pins replace the old ones."""
    p = pins()
    new = json.loads(json.dumps(p))
    for key in ("mathlib", "nlab"):
        new[key]["commit"] = remote_head(new[key]["repo"], new[key]["branch"])
    for key in ("theoremsearch", "theoremgraph"):
        meta = get_json(HF_API + new[key]["repo"])
        new[key]["revision"] = meta["sha"]
        if "last_modified" in new[key]:
            new[key]["last_modified"] = str(meta.get("lastModified", ""))[:10]
    new["observed"] = new["wiki_retrieved"] = new["taxonomy_retrieved"] = today()
    write_json(PINS, new)
    changed = sorted(k for k in ("mathlib", "nlab", "theoremsearch", "theoremgraph") if new[k] != p[k])
    with open(log, "a", encoding="utf-8") as f:
        f.write(f"changed sources: {', '.join(changed) or 'none'}\n")
    return {"changed": changed}


def checkout(repo, commit, folder, log):
    if not (folder / ".git").is_dir():
        run(["git", "clone", "--depth", "1", repo, folder], log)
    head = subprocess.run(["git", "-C", folder, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    if head != commit:
        run(["git", "-C", folder, "fetch", "--depth", "1", "origin", commit], log)
        run(["git", "-C", folder, "checkout", "--detach", commit], log)
    return head != commit


def lean_env():
    env = dict(os.environ, ELAN_HOME=str(WORK / "elan"))
    env["PATH"] = f"{WORK / 'elan' / 'bin'}{os.pathsep}{env['PATH']}"
    return env


def fetch(log):
    p = pins()
    moved = {}
    moved["mathlib"] = checkout(p["mathlib"]["repo"], p["mathlib"]["commit"], WORK / "mathlib4", log)
    if moved["mathlib"] or not (WORK / "mathlib4" / ".lake" / "build").is_dir():
        if not (WORK / "elan" / "bin" / "lake").is_file():
            raise StepFailed("no Lean toolchain in <work>/elan: install elan there first (AGENTS.md, Refresh)")
        run(["lake", "exe", "cache", "get"], log, cwd=WORK / "mathlib4", env=lean_env())
    moved["nlab"] = checkout(p["nlab"]["repo"], p["nlab"]["commit"], WORK / "nlab-content", log)
    for key, folder in (("theoremsearch", WORK / "theoremsearch"), ("theoremgraph", WORK / "theoremgraph")):
        marker = folder / "revision.txt"
        have = marker.read_text().strip() if marker.is_file() else None
        moved[key] = have != p[key]["revision"]
        if moved[key]:
            for name in p[key]["files"]:
                download(HF_FILE.format(repo=p[key]["repo"], revision=p[key]["revision"], file=name), folder / name)
            marker.write_text(p[key]["revision"] + "\n")
    page = WORK / "arxiv-taxonomy.html"
    if not page.is_file() or datetime.date.fromtimestamp(page.stat().st_mtime).isoformat() != p["taxonomy_retrieved"]:
        download(TAXONOMY_URL, page)
    # A new retrieval date starts a new Wikimedia cache; the old one is kept beside it.
    cache = WORK / "cache" / "wiki"
    stamp = cache / "retrieved.txt"
    if cache.is_dir() and stamp.is_file() and stamp.read_text().strip() != p["wiki_retrieved"]:
        cache.rename(cache.with_name(f"wiki-{stamp.read_text().strip()}"))
    cache.mkdir(parents=True, exist_ok=True)
    stamp.write_text(p["wiki_retrieved"] + "\n")
    run([sys.executable, HERE / "wiki.py"], log, cwd=HERE)
    return {"moved": sorted(k for k, v in moved.items() if v)}


def extract(log):
    commit = pins()["mathlib"]["commit"]
    folder = WORK / "extract"
    headers = []
    for path in sorted(folder.glob("shard-*.jsonl")):
        with open(path, encoding="utf-8") as f:
            first = f.readline()
        headers.append(json.loads(first).get("header", {}) if first.strip() else {})
    if len(headers) == SHARDS and all(h.get("mathlib") == commit and h.get("shards") == SHARDS for h in headers):
        return {"cached": True}
    env = lean_env()
    lean = HERE / "lean"
    shutil.copy(WORK / "mathlib4" / "lean-toolchain", lean / "lean-toolchain")
    run(["lake", "build"], log, cwd=lean, env=env)
    exe = lean / ".lake" / "build" / "bin" / "extract"
    folder.mkdir(parents=True, exist_ok=True)
    procs = []
    for i in range(SHARDS):
        err = open(folder / f"shard-{i}.err", "w", encoding="utf-8")
        procs.append((subprocess.Popen(["lake", "env", str(exe), str(folder / f"shard-{i}.jsonl"), str(i), str(SHARDS), commit],
                                       cwd=WORK / "mathlib4", env=env, stdout=err, stderr=err), err))
    failed = []
    for i, (proc, err) in enumerate(procs):
        if proc.wait():
            failed.append(i)
        err.close()
    if failed:
        raise StepFailed(f"extractor shards {failed} failed; see <work>/extract/shard-N.err")
    return {"cached": False}


def stages(log):
    for name in STAGES:
        args = [pins()["taxonomy_retrieved"]] if name == "taxonomy" else []
        run([sys.executable, HERE / f"{name}.py", *args], log, cwd=HERE)
    return {"stages": STAGES}


def answer_rows(folder):
    """Every raw answer row in <work>/judge/<folder>/, by result id."""
    rows = {}
    for path in sorted((WORK / "judge" / folder).glob("*.toon")):
        for row in from_toon(path.read_text(encoding="utf-8")).get("answers", []):
            rows[str(row["id"])] = row
    return rows


def carry_answers(keys):
    """Rewrite the answer files for the current batches: an answer moves with its result when its cache key holds.

    keys: {folder: {id: cache key}} from the preceding run. Returns {folder: ids that need an assessment}."""
    import judge
    index = read_json(WORK / "judge" / "index.json")
    prompt = (WORK / "judge" / "prompt.txt").read_text(encoding="utf-8")
    config = json.dumps(judge.JUDGE, sort_keys=True)
    todo = {}
    for folder in ("answers", "answers-2"):
        old = answer_rows(folder)
        if not old:
            todo[folder] = []
            continue
        need, out = [], {}
        for entry in index:
            packet = (WORK / "judge" / "packets" / f"{entry['batch']}.toon").read_text(encoding="utf-8")
            rows = judge.packet_rows(packet)
            kept = []
            for rid in entry["ids"]:
                key = sha256_bytes("\n".join([rows.get(rid, ""), prompt, judge.RUBRIC_VERSION, config]).encode())
                if rid in old and keys.get(folder, {}).get(rid, key) == key:
                    kept.append(old[rid])
                elif folder == "answers" or rid in old:
                    need.append(rid)
            out[entry["batch"]] = kept
        target = WORK / "judge" / folder
        for path in target.glob("*.toon"):
            path.unlink()
        for batch, kept in out.items():
            if kept:
                (target / f"{batch}.toon").write_text(to_toon({"answers": kept}) + "\n", encoding="utf-8")
        todo[folder] = need
    return todo


def judge_step(log):
    import judge
    keys_path = WORK / "judge" / "keys.json"
    keys = read_json(keys_path) if keys_path.is_file() else {}
    todo = carry_answers(keys)
    problems = []
    for folder in ("answers", "answers-2"):
        judged, bad = judge.collect(folder)
        problems += [f"{folder}: {p}" for p in bad]
        keys[folder] = {rid: j["cache_key"] for rid, j in judged.items()}
    write_json(keys_path, keys)
    write_json(WORK / "judge" / "todo.json", {"assess": todo["answers"], "second_assessment": todo["answers-2"]})
    with open(log, "a", encoding="utf-8") as f:
        f.write(to_toon({"todo": len(todo["answers"]), "second": len(todo["answers-2"]), "problems": problems or ["none"]}) + "\n")
    if problems:
        raise StepFailed(f"{len(problems)} answer rows fail validation; see {log.relative_to(ROOT)}")
    if todo["answers"] or todo["answers-2"]:
        raise StepFailed(f"the judge must assess {len(todo['answers'])} results (and {len(todo['answers-2'])} second "
                         "assessments) listed in <work>/judge/todo.json; then run with --from judge")
    return {"reused": sum(len(v) for v in keys.values())}


# ---------- snapshot links and the change report ----------

def unpack(raw):
    import base64
    import gzip
    return json.loads(gzip.decompress(base64.b64decode(raw["packs"]["core"]["gz"])).decode("utf-8"))


def named_rows(raw):
    """Core rows by id, with category and prerequisite indices replaced by their ids (stable across snapshots)."""
    core = unpack(raw)
    cats = [c[0] for c in raw["taxonomy"]["categories"]]
    ids = [r["id"] for r in core["rows"]]
    out = {}
    for r in core["rows"]:
        r = dict(r)
        r["cat"] = sorted(cats[k] for k in r["cat"])
        r["acat"] = sorted(cats[k] for k in r["acat"])
        r["pre"] = sorted(ids[j] for j in r["pre"])
        out[r["id"]] = r
    return out


def identity_map(prev, new, carried):
    """Moves from the preceding snapshot: a vanished id whose primary declaration (or Wikidata item) a new id holds."""
    moves = {m["from"]: m["to"] for m in carried}
    by_decl = {}
    for rid, r in new.items():
        if r.get("decl") and rid not in prev:
            by_decl.setdefault(r["decl"], []).append(rid)
    for rid, r in prev.items():
        if rid in new:
            continue
        hits = by_decl.get(r.get("decl")) or []
        if len(hits) == 1:
            moves[rid] = hits[0]
    # follow chains, so an old profile id reaches the current id in one step
    for k in list(moves):
        seen = {k}
        while moves[k] in moves and moves[k] not in seen:
            seen.add(moves[k])
            moves[k] = moves[moves[k]]
    return [{"from": a, "to": b} for a, b in sorted(moves.items()) if b in new]


def change_report(prev_raw, new_raw, moves):
    prev, new = named_rows(prev_raw), named_rows(new_raw)
    moved = {m["from"]: m["to"] for m in moves}
    source = sorted(k for k in set(prev_raw["sources"]) | set(new_raw["sources"])
                    if prev_raw["sources"].get(k) != new_raw["sources"].get(k))
    rubric = [k for k in ("rubric", "taxonomy") if prev_raw[k] != new_raw[k]]
    rubric += [k for k in ("rubric_version", "prompt_version", "schema_version", "taxonomy_version")
               if prev_raw["snapshot"].get(k) != new_raw["snapshot"].get(k)]
    counts = {"source": {}, "measurement": {}, "judge": {}}
    examples = {"source": [], "measurement": [], "judge": []}
    for old_id, r in prev.items():
        rid = moved.get(old_id, old_id)
        n = new.get(rid)
        if n is None:
            continue
        for kind, fields in (("source", SOURCE_FIELDS), ("measurement", MEASURE_FIELDS), ("judge", JUDGE_FIELDS)):
            diff = [f for f in fields if r.get(f) != n.get(f)]
            for f in diff:
                counts[kind][f] = counts[kind].get(f, 0) + 1
            if diff and len(examples[kind]) < 20:
                examples[kind].append({"id": rid, "fields": diff})
    added = sorted(set(new) - set(prev) - set(moved.values()))
    removed = sorted(k for k in set(prev) - set(new) if k not in moved)
    return {
        "from": prev_raw["snapshot"]["id"], "to": new_raw["snapshot"]["id"],
        "source_changes": {"sources": source, "records": counts["source"], "examples": examples["source"]},
        "measurement_changes": {"fields": counts["measurement"], "examples": examples["measurement"]},
        "judge_changes": {"fields": counts["judge"], "examples": examples["judge"],
                          "note": "with a rubric change listed, judge changes can follow from it"},
        "rubric_changes": rubric,
        "identity_changes": {"added": len(added), "removed": len(removed), "moved": len(moves),
                             "added_ids": added[:50], "removed_ids": removed[:50]},
    }


def keep(raw):
    path = SNAPSHOTS / raw["snapshot"]["id"] / "raw.json"
    if not path.is_file():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(raw, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def assemble(log):
    run([sys.executable, HERE / "assemble.py"], log, cwd=HERE)
    new = read_json(OUT / "raw.json")
    current = VISUAL / "raw.json"
    prev = read_json(current) if current.is_file() else None
    if prev and prev["snapshot"]["id"] != new["snapshot"]["id"]:
        keep(prev)
        moves = identity_map(named_rows(prev), named_rows(new), prev["snapshot"].get("identity_map", []))
        new["snapshot"]["identity_map"] = moves
        new["snapshot"]["previous"] = prev["snapshot"]["id"]
        report = change_report(prev, new, moves)
    elif prev:
        new["snapshot"]["identity_map"] = prev["snapshot"].get("identity_map", [])
        new["snapshot"]["previous"] = prev["snapshot"].get("previous")
        report = {"from": prev["snapshot"]["id"], "to": new["snapshot"]["id"], "note": "the same snapshot: no change"}
    else:
        report = {"from": None, "to": new["snapshot"]["id"], "note": "the first snapshot"}
    write_json(OUT / "raw.json", new, indent=None)
    write_json(OUT / "change-report.json", report)
    keep(new)
    return {"snapshot": new["snapshot"]["id"], "previous": new["snapshot"]["previous"]}


def publish(log):
    shutil.copy(OUT / "raw.json", VISUAL / "raw.json")
    run([sys.executable, VISUAL / "build.py"], log, cwd=VISUAL)
    run([sys.executable, VISUAL / "build.py", "--verify"], log, cwd=VISUAL)
    return {"raw": "viz/theorem-explorer/raw.json", "html": "viz/theorem-explorer/index.html"}


ACTIONS = {"resolve": resolve, "fetch": fetch, "extract": extract, "stages": stages, "judge": judge_step,
           "assemble": assemble, "publish": publish}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--offline", action="store_true", help="skip resolve and fetch: use the pins and the work directory")
    ap.add_argument("--from", dest="start", choices=STEPS, default="resolve", help="the first step to run")
    ap.add_argument("--to", dest="stop", choices=STEPS, default="publish", help="the last step to run")
    args = ap.parse_args(argv)
    steps = STEPS[STEPS.index(args.start):STEPS.index(args.stop) + 1]
    if args.offline:
        steps = [s for s in steps if s not in ("resolve", "fetch")]
    LOGS.mkdir(parents=True, exist_ok=True)
    report = {"started": datetime.datetime.now().isoformat(timespec="seconds"), "steps": [], "failure": None}
    code = 0
    for step in steps:
        log = LOGS / f"{step}.log"
        log.write_text("", encoding="utf-8")
        t0 = time.time()
        try:
            result = ACTIONS[step](log)
            report["steps"].append({"step": step, "ok": True, "seconds": round(time.time() - t0, 1), **result})
        except (StepFailed, OSError, subprocess.CalledProcessError, ValueError, KeyError) as e:
            report["steps"].append({"step": step, "ok": False, "seconds": round(time.time() - t0, 1)})
            report["failure"] = {"step": step, "error": str(e)}
            report["kept"] = "the committed raw.json and index.html (the preceding usable snapshot)"
            code = 3 if step == "judge" else 1
            break
    omissions = OUT / "raw.json"
    if omissions.is_file() and not report["failure"]:
        cov = read_json(omissions)["coverage"]
        report["omissions"] = {"unscored": cov["named"]["unscored"], "formal_unnamed_unscored": cov["formal"]["unnamed_unscored"],
                               "unmeasured_source": cov["formal"]["unmeasured_source"]}
    if (OUT / "change-report.json").is_file() and "assemble" in steps and not report["failure"]:
        report["changes"] = read_json(OUT / "change-report.json")
    write_json(LOGS / "report.json", report)
    print(to_toon({"refresh": {"steps": ",".join(s["step"] + ("" if s["ok"] else " (failed)") for s in report["steps"]),
                               "failure": (report["failure"] or {}).get("error", "none"),
                               "report": str((LOGS / "report.json").relative_to(ROOT))}}))
    return code


if __name__ == "__main__":
    sys.exit(main())
