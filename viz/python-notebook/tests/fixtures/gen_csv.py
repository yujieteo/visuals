#!/usr/bin/env python3
"""Make the large-data CSV fixture: exactly the bytes asked for, the same bytes for the same seed.

The numbers come from a pure-Python splitmix64 generator, not the random module, so a Python release cannot
change the file. As it writes each row, the generator also adds up what the row holds; that summary is a
second calculation, which tests/test_fixture.py compares with the reference reader (ref_csv.py) of the file.

    python3 tests/fixtures/gen_csv.py OUT.csv [--bytes 100000000] [--seed 20261004]

Columns: id (int), date (ISO date, 2022-01-01 to 2024-12-31), category (12 names, about 1% empty), region
(5 names), value (two decimals, about 3% empty), quantity (int 0-99, about 2% empty), flag (true/false),
note (lowercase letters). The last row's note is cut or padded so the file has the exact size.
"""
import argparse
import datetime
import hashlib
import json
import sys

VERSION = "pynb-csv 1.0.0"
SEED = 20261004
FULL_BYTES = 100_000_000
HEADER = "id,date,category,region,value,quantity,flag,note\n"
CATEGORIES = ("alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliett", "kilo", "lima")
REGIONS = ("north", "south", "east", "west", "central")
START = datetime.date(2022, 1, 1)
DAYS = (datetime.date(2024, 12, 31) - START).days + 1
CUTOFF = "2024-01-01"
MASK = (1 << 64) - 1


class SplitMix64:
    def __init__(self, seed):
        self.state = seed & MASK

    def next(self):
        self.state = (self.state + 0x9E3779B97F4A7C15) & MASK
        z = self.state
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & MASK
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & MASK
        return z ^ (z >> 31)

    def below(self, n):
        return self.next() % n


def summary_start():
    return {"rows": 0, "empty": {"category": 0, "value": 0, "quantity": 0}, "value_cents": 0, "kept": 0, "totals": {}}


def generate(out, size=FULL_BYTES, seed=SEED):
    """Write the fixture to the binary file out; return the summary of what it holds."""
    rng = SplitMix64(seed)
    summary = summary_start()
    written = out.write(HEADER.encode())
    dates = [(START + datetime.timedelta(days=d)).isoformat() for d in range(DAYS)]
    row_id = 0
    while True:
        row_id += 1
        date = dates[rng.below(DAYS)]
        category = "" if rng.below(100) == 0 else CATEGORIES[rng.below(len(CATEGORIES))]
        region = REGIONS[rng.below(len(REGIONS))]
        cents = None if rng.below(100) < 3 else rng.below(1_000_000)
        quantity = None if rng.below(100) < 2 else rng.below(100)
        flag = "true" if rng.below(2) else "false"
        note = "".join(chr(97 + rng.below(26)) for _ in range(rng.below(21)))
        value = "" if cents is None else f"{cents // 100}.{cents % 100:02d}"
        head = f"{row_id},{date},{category},{region},{value},{'' if quantity is None else quantity},{flag},"
        line = f"{head}{note}\n"
        left = size - written
        # The next row could not fit after this one: cut or pad this row's note to end the file exactly.
        if left - len(line) < len(head) + 1:
            room = left - len(head) - 1
            if room < 0:
                raise SystemExit(f"--bytes {size} is too small for a header and one row")
            note = (note * (room // max(len(note), 1) + 1) if note else "z" * room)[:room]
            line = f"{head}{note}\n"
        written += out.write(line.encode())
        summary["rows"] += 1
        summary["empty"]["category"] += category == ""
        summary["empty"]["value"] += cents is None
        summary["empty"]["quantity"] += quantity is None
        summary["value_cents"] += cents or 0
        if date >= CUTOFF and quantity is not None and quantity >= 10 and category and cents is not None:
            summary["kept"] += 1
            total = summary["totals"].setdefault(category, [0, 0])
            total[0] += cents
            total[1] += 1
        if written == size:
            return summary


def totals_csv(summary):
    """totals.csv as the notebook writes it: category, total (two decimals), count, sorted by category."""
    lines = ["category,total,count"]
    lines += [f"{c},{t // 100}.{t % 100:02d},{n}" for c, (t, n) in sorted(summary["totals"].items())]
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("out")
    parser.add_argument("--bytes", type=int, default=FULL_BYTES)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args(argv)
    with open(args.out, "wb") as out:
        summary = generate(out, args.bytes, args.seed)
    with open(args.out, "rb") as f:
        digest = hashlib.file_digest(f, "sha256").hexdigest()
    json.dump({"version": VERSION, "seed": args.seed, "bytes": args.bytes, "sha256": digest, **summary}, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
