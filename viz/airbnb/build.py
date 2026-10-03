#!/usr/bin/env python3
"""Build or --verify the Airbnb cash conversion page with the shared stock-cases builder (scripts/stock_cases.py)."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "scripts"))
import stock_cases  # noqa: E402

CASE = {
    "name": "Airbnb", "title": "Airbnb cash conversion", "ticker": "ABNB", "cik": 1559720,
    "headline": "Airbnb’s revenue has grown while operating cash flow has remained above one-third of sales in each of the latest four years.",
    "competitors": "Booking Holdings, Expedia, hotels and local vacation-rental platforms compete for guests, hosts and marketing traffic.",
    "macro": "Disposable income, cross-border travel and currency movements shape bookings. Regulation and a softer travel cycle can constrain supply and demand.",
    "swot": "Strength: global host network. Weakness: regulatory exposure. Opportunity: underpenetrated international travel. Threat: hotel and OTA competition.",
}

if __name__ == "__main__":
    stock_cases.main(HERE, CASE)
