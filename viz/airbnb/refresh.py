#!/usr/bin/env python3
"""Refresh raw.json from SEC Company Facts for the Airbnb page with the shared stock-cases refresh (scripts/stock_cases.py).

A dry run unless --apply: python3 refresh.py [--check | --apply], or python3 ../../scripts/refresh.py airbnb.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "scripts"))
import refresh_kit  # noqa: E402
import stock_cases  # noqa: E402
from build import CASE  # noqa: E402


def refresh(source, folder, args):
    return stock_cases.refresh(source, folder, CASE)


if __name__ == "__main__":
    sys.exit(refresh_kit.main(slug=HERE.name))
