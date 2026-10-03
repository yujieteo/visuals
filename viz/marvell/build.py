#!/usr/bin/env python3
"""Build or --verify the Marvell cash conversion page with the shared stock-cases builder (scripts/stock_cases.py)."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "scripts"))
import stock_cases  # noqa: E402

CASE = {
    "name": "Marvell", "title": "Marvell cash conversion", "ticker": "MRVL", "cik": 1835632,
    "headline": "Marvell’s revenue rebounded in fiscal 2026, while operating cash flow remained a smaller share of sales than at the prior peak.",
    "competitors": "Broadcom, Nvidia, AMD, Intel and custom-silicon suppliers compete in data-center and networking semiconductors.",
    "macro": "AI data-center capex and networking upgrades can lift demand. Semiconductor inventory cycles and concentrated customers add volatility.",
    "swot": "Strength: data-infrastructure portfolio. Weakness: cyclicality. Opportunity: custom AI silicon. Threat: pricing and execution pressure from larger rivals.",
}

if __name__ == "__main__":
    stock_cases.main(HERE, CASE)
