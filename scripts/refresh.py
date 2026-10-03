#!/usr/bin/env python3
"""Refresh one visual's data from its public source, guarded: write the changed files, then run its builder.

Usage: python3 scripts/refresh.py SLUG [--dry-run] [--now ISO8601] [the visual's own flags]

It prints a TOON summary of what changed; --dry-run writes nothing. It exits 2 and writes nothing when a source
fails, answers empty or with a bot check, or the data fails its schema check.
scripts/refresh_kit.py says how it works and what a visual's refresh.py defines.
"""
import sys

import refresh_kit

if __name__ == "__main__":
    sys.exit(refresh_kit.main())
