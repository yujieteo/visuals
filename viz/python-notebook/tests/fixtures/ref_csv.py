#!/usr/bin/env python3
"""The independent reference for the large-data fixture: the csv module and integer cents, no pandas.

It reads the file as any CSV, so it shares no code with gen_csv.py or with the notebook's pandas cell.

    python3 tests/fixtures/ref_csv.py FILE.csv   # prints the summary as JSON
"""
import csv
import json
import sys


def cents(text):
    whole, _, frac = text.partition(".")
    return int(whole) * 100 + int(frac.ljust(2, "0"))


def reference(path):
    rows = 0
    empty = {"category": 0, "value": 0, "quantity": 0}
    value_cents = kept = 0
    totals = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows += 1
            for column in empty:
                empty[column] += row[column] == ""
            value = cents(row["value"]) if row["value"] else None
            value_cents += value or 0
            quantity = int(row["quantity"]) if row["quantity"] else None
            if row["date"] >= "2024-01-01" and quantity is not None and quantity >= 10 and row["category"] and value is not None:
                kept += 1
                total = totals.setdefault(row["category"], [0, 0])
                total[0] += value
                total[1] += 1
    return {"rows": rows, "empty": empty, "value_cents": value_cents, "kept": kept, "totals": totals}


if __name__ == "__main__":
    json.dump(reference(sys.argv[1]), sys.stdout, indent=1)
    print()
