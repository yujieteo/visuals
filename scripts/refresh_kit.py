"""The guarded one-command refresh that every visual with a public data source shares.

A visual opts in with viz/<slug>/refresh.py, which defines

    def refresh(source, folder, args) -> Update

It reads its sources only through ``source`` (a Source, or a Replay of recorded answers in its tests) and
never writes: it returns the files it would write, the changes against its current data, the builder to run
after writing and notes for review. It may also define ``add_arguments(parser)`` for flags of its own.
tampines-library-events is the one exception to ``source``: its sources are JSON POST searches, so it reads
them with its own request(), which uses BOT_CHECK, and its tests mock that function.

run() then
  1. fails with exit 2 and writes nothing when a fetch fails, a response is empty or a bot check, or the data
     fails the visual's own schema check (each raises Failed);
  2. compares every file with the one on disk and prints a TOON summary of what would change;
  3. writes every changed file, then runs the visual's builder. When the builder fails, every file in the
     folder goes back to what it was and the exit code is 2, so a refresh never leaves a partial write.
With --dry-run it stops after step 2 and writes nothing.
"""
import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from visuals import ROOT, VIZ

SGT = timezone(timedelta(hours=8))
FAILED = 2  # exit code: no source, an empty answer, a bot check or a schema mismatch
USER_AGENT = "yujieteo-visuals-refresh/1 (+https://teoyujie.org/visuals/)"
BOT_CHECK = re.compile(r"_Incapsula_Resource|x-amzn-waf|<title>[^<]*(?:Just a moment|Attention Required)", re.I)


class Failed(Exception):
    """The refresh cannot be trusted: a source failed, answered empty or with a bot check, or the data is wrong."""


@dataclass
class Update:
    """What a visual's refresh() found, before anything is written.

    files    {path relative to the folder: new text}; only the files the refresh owns, never the builder's output
    changes  (kind, item, detail) rows that say what changed against the current data, for the pull request
    fetched  the date of the data, which becomes visual.json's "fetched" when a file in ``files`` changes
    build    the builder's argv after python3, run from the folder after the files are written
    notes    what a reviewer must still check by reading, such as fixed claims the new numbers may contradict
    source   the URL the data comes from
    """
    files: dict
    fetched: str = ""
    changes: list = field(default_factory=list)
    build: list = field(default_factory=lambda: ["build.py"])
    notes: list = field(default_factory=list)
    source: str = ""


class Source:
    """The network, as the refreshes see it: paced GETs that fail loudly instead of returning nothing."""

    def __init__(self, now=None, user_agent=USER_AGENT):
        self.now = now or datetime.now(SGT).replace(microsecond=0)
        self.user_agent = user_agent

    def wait(self, seconds):
        time.sleep(seconds)

    def text(self, url, headers=None, tries=1, retry=(429, 500, 502, 503, 504), pause=5):
        """The body of a GET; Failed when it is empty or a bot check.

        A status in ``retry`` is tried again up to ``tries`` times, ``pause`` seconds longer each time."""
        sent = {"User-Agent": self.user_agent, **(headers or {})}
        for attempt in range(tries):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=sent), timeout=120) as response:
                    text = response.read().decode("utf-8")
                return checked(url, text)
            except urllib.error.HTTPError as error:
                if error.code not in retry or attempt + 1 == tries:
                    raise Failed(f"{url}: HTTP {error.code}") from error
            except (urllib.error.URLError, TimeoutError, OSError, UnicodeDecodeError) as error:
                if attempt + 1 == tries:
                    raise Failed(f"{url}: {error}") from error
            self.wait(pause * (attempt + 1))
        raise Failed(f"{url}: no answer")

    def json(self, url, **kwargs):
        return parse_json(url, self.text(url, **kwargs))


class Replay(Source):
    """Recorded answers in place of the network, for tests: {url: text}.

    A request with no recorded answer fails, as a source that is gone does. Each request is kept in ``asked``."""

    def __init__(self, answers, now=None):
        super().__init__(now or datetime(2026, 10, 4, 9, 0, tzinfo=SGT))
        self.answers = answers
        self.asked = []

    def wait(self, seconds):
        pass

    def text(self, url, headers=None, **kwargs):
        self.asked.append(url)
        if url not in self.answers:
            raise Failed(f"{url}: no recorded answer")
        answer = self.answers[url]
        if isinstance(answer, Exception):
            raise Failed(f"{url}: {answer}") from answer
        return checked(url, answer)


def checked(url, text):
    if not text.strip():
        raise Failed(f"{url}: empty response")
    if BOT_CHECK.search(text[:2000]):
        raise Failed(f"{url}: answered with a bot check instead of its content; try again later, never get past it")
    return text


def parse_json(url, text):
    try:
        return json.loads(text)
    except ValueError as error:
        raise Failed(f"{url}: not JSON ({error})") from error


def require(condition, message):
    """Failed with ``message`` unless ``condition``: a schema check that stops the refresh."""
    if not condition:
        raise Failed(message)


def today(source):
    """The Singapore date of the retrieval, which becomes visual.json's "fetched"."""
    return source.now.astimezone(SGT).date().isoformat()


def set_fetched(text, day):
    """visual.json's text with only its "fetched" date changed."""
    out, count = re.subn(r'("fetched"\s*:\s*)"[^"]*"', lambda match: f'{match.group(1)}"{day}"', text, count=1)
    require(count, 'visual.json has no "fetched" field')
    return out


def read(folder, name):
    path = folder / name
    return path.read_text(encoding="utf-8") if path.is_file() else None


# ------------------------------------------------------------------ TOON ----

def scalar(value):
    """One TOON value: bare when it cannot be misread, quoted otherwise."""
    if value is None or isinstance(value, bool):
        return json.dumps(value)
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    if (not text or text != text.strip() or re.search(r'[,:"\\\[\]{}\n\r\t]', text) or text.startswith("- ")
            or re.fullmatch(r"-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null", text, re.I)):
        return json.dumps(text, ensure_ascii=False)
    return text


def toon(report):
    """The report as TOON: scalars as key: value, lists of rows as tables, lists of text as - items."""
    lines = []
    for key, value in report.items():
        if isinstance(value, list) and value and isinstance(value[0], dict):
            fields = list(value[0])
            lines.append(f"{key}[{len(value)}]{{{','.join(fields)}}}:")
            lines += ["  " + ",".join(scalar(row.get(name)) for name in fields) for row in value]
        elif isinstance(value, list):
            lines.append(f"{key}[{len(value)}]:" if value else f"{key}[0]:")
            lines += [f"  - {scalar(item)}" for item in value]
        else:
            lines.append(f"{key}: {scalar(value)}")
    return "\n".join(lines)


# --------------------------------------------------------------- running ----

def module(folder):
    """viz/<slug>/refresh.py, imported with its folder and scripts/ on the path."""
    path = folder / "refresh.py"
    if not path.is_file():
        return None
    for extra in (str(ROOT / "scripts"), str(folder)):
        if extra not in sys.path:
            sys.path.insert(0, extra)
    spec = importlib.util.spec_from_file_location(f"refresh_{folder.name.replace('-', '_')}", path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def compare(folder, files):
    """One row for each file the refresh owns: its status and size before and after."""
    rows = []
    for name, text in files.items():
        old = (folder / name).read_bytes() if (folder / name).is_file() else None
        new = text.encode("utf-8")
        status = "new" if old is None else "unchanged" if old == new else "changed"
        rows.append({"path": name, "status": status, "bytes_before": len(old) if old is not None else 0, "bytes_after": len(new)})
    return rows


def snapshot(folder):
    return {path: path.read_bytes() for path in folder.rglob("*") if path.is_file()}


def restore(folder, before):
    for path in [path for path in folder.rglob("*") if path.is_file()]:
        if path not in before:
            path.unlink()
    for path, content in before.items():
        if not path.is_file() or path.read_bytes() != content:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)


def write(folder, files, build):
    """Write every file, then run the builder; on any failure put the whole folder back and raise Failed."""
    before = snapshot(folder)
    try:
        for name, text in files.items():
            path = folder / name
            temp = path.with_name(f".{path.name}.refresh")
            temp.write_text(text, encoding="utf-8")
            os.replace(temp, path)
        if build:
            done = subprocess.run([sys.executable, *build], cwd=folder, capture_output=True, text=True)
            if done.returncode:
                raise Failed(f"{' '.join(build)} failed, so every file is put back:\n{(done.stdout + done.stderr).strip()}")
    except BaseException:
        restore(folder, before)
        raise


def run(slug, dry_run=False, args=None, source=None, root=ROOT, out=None, hook=None):
    """Refresh one visual: print the TOON summary and return the exit code (0 or FAILED)."""
    out = out or sys.stdout
    folder = root / VIZ / slug
    report = {"slug": slug, "mode": "dry-run" if dry_run else "write"}
    try:
        hook = hook or (module(folder) if folder.is_dir() else None)
        require(hook is not None and hasattr(hook, "refresh"), f"viz/{slug}/refresh.py with a refresh() does not exist; see SKILLS.md, Refresh data")
        update = hook.refresh(source or Source(), folder, args or argparse.Namespace())
        require(update.files, f"viz/{slug}/refresh.py returned no file to write")
        files = dict(update.files)
        news = any(row["status"] != "unchanged" for row in compare(folder, files))
        if news and update.fetched:
            files["visual.json"] = set_fetched(read(folder, "visual.json") or "", update.fetched)
    except Failed as error:
        print(toon({**report, "result": "failed", "error": str(error), "written": "nothing"}), file=out)
        return FAILED
    rows = compare(folder, files)
    report.update({"result": "changes" if news else "up-to-date", "source": update.source, "files": rows,
                   "changes": update.changes, "notes": update.notes,
                   "build": " ".join(["python3", *update.build]) if update.build else "none"})
    if news and not dry_run:
        try:
            write(folder, {row["path"]: files[row["path"]] for row in rows if row["status"] != "unchanged"}, update.build)
        except Failed as error:
            print(toon({**report, "result": "failed", "error": str(error), "written": "nothing"}), file=out)
            return FAILED
        report["written"] = "every changed file, then the builder"
    elif news:
        report["next"] = f"python3 scripts/refresh.py {slug}"
    print(toon(report), file=out)
    return 0


def main(argv=None, slug=None):
    """The command line: scripts/refresh.py SLUG [--dry-run], or a visual's own refresh.py, which passes its slug."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    if slug is None:
        parser.add_argument("slug", help="the visual to refresh: a folder of viz/ with a refresh.py")
    parser.add_argument("--dry-run", action="store_true", help="print what would change and write nothing")
    parser.add_argument("--now", help="the retrieval time to record, ISO 8601 with an offset (default: now)")
    argv = sys.argv[1:] if argv is None else argv
    known, _ = parser.parse_known_args(argv)
    slug = slug or known.slug
    hook = module(ROOT / VIZ / slug) if (ROOT / VIZ / slug).is_dir() else None
    if hook is not None and hasattr(hook, "add_arguments"):
        hook.add_arguments(parser)
    args = parser.parse_args(argv)
    now = datetime.fromisoformat(args.now) if args.now else None
    if now is not None and now.tzinfo is None:
        parser.error("--now needs an offset, such as 2026-10-04T09:00:00+08:00")
    return run(slug, args.dry_run, args, Source(now), hook=hook)
