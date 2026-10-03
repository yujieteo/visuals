#!/usr/bin/env python3
"""Build or --verify the Arm cash conversion page with the shared stock-cases builder (scripts/stock_cases.py)."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "scripts"))
import stock_cases  # noqa: E402

CASE = {
    "name": "Arm", "title": "Arm cash conversion", "ticker": "ARM", "cik": 1973239,
    "headline": "Arm’s fiscal 2026 revenue reached $4.92B and operating cash flow margin rose to 31.0% after a fiscal 2025 dip.",
    "competitors": "RISC-V ecosystems, Intel, AMD and architecture-license alternatives compete for computing design wins.",
    "macro": "Smartphone replacement, cloud capex and AI inference broaden chip-design demand. Royalty timing and customer concentration can move results sharply.",
    "swot": "Strength: pervasive instruction-set ecosystem. Weakness: licensing concentration. Opportunity: data-center CPUs and edge AI. Threat: RISC-V adoption.",
}

if __name__ == "__main__":
    stock_cases.main(HERE, CASE)
