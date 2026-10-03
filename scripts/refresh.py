#!/usr/bin/env python3
"""Refresh one visual's data from its public source, guarded: a dry run unless --apply.

Usage: python3 scripts/refresh.py SLUG [--check | --apply] [--now ISO8601] [the visual's own flags]
       python3 scripts/refresh.py --list

It prints a TOON summary of what would change. It exits 2 and writes nothing when a source fails, answers
empty or with a bot check, or the data fails its schema check; --check exits 1 when the sources have news.
scripts/refresh_kit.py says how it works and what a visual's refresh.py defines.
"""
import sys

import refresh_kit

if __name__ == "__main__":
    sys.exit(refresh_kit.main())
