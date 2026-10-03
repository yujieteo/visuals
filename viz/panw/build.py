#!/usr/bin/env python3
"""Build or --verify the Palo Alto Networks cash conversion page with the shared stock-cases builder (scripts/stock_cases.py)."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "scripts"))
import stock_cases  # noqa: E402

CASE = {
    "name": "Palo Alto Networks", "title": "Palo Alto Networks cash conversion", "ticker": "PANW", "cik": 1327567,
    "headline": "Palo Alto Networks’ cash generation has stayed above 39% of revenue as its security platform scales.",
    "competitors": "CrowdStrike, Fortinet, Cisco and Zscaler compete across endpoint, network and cloud security.",
    "macro": "Enterprise security budgets, cloud adoption and breach risk support demand. IT-budget pauses and vendor consolidation are counterweights.",
    "swot": "Strength: platform breadth. Weakness: execution across many products. Opportunity: AI security. Threat: intense platform competition.",
}

if __name__ == "__main__":
    stock_cases.main(HERE, CASE)
