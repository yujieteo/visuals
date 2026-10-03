#!/usr/bin/env python3
"""Refresh raw.json from SEC Company Facts for the Arm page with the shared stock-cases refresh (scripts/stock_cases.py).

Run python3 refresh.py [--dry-run], or python3 ../../scripts/refresh.py arm [--dry-run].
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "scripts"))
import refresh_kit  # noqa: E402
import stock_cases  # noqa: E402


def refresh(source, folder, args):
    from build import CASE  # here, so an import error is a TOON failed report
    return stock_cases.refresh(source, folder, CASE)


if __name__ == "__main__":
    sys.exit(refresh_kit.main(slug=HERE.name))
