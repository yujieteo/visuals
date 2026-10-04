"""The TheoremSearch public-dataset adapter, stage 1: parquet -> JSON lines (spec section 3.1).

Source: the Hugging Face dataset uw-math-ai/theorem-search-dataset-permissive at a pinned revision (run.py
downloads paper.parquet and theorem.parquet from it without an account). This dataset is not the live
TheoremSearch service; its coverage differs, and every record keeps "theoremsearch-dataset" as its source.

This stage needs pyarrow, so run.py runs it as `uv run --with pyarrow python theoremsearch.py`. It writes
<work>/stage/ts-papers.jsonl.gz and <work>/stage/ts-theorems.jsonl.gz, which uses.py reads with the standard
library only.

Paper fields kept: paper_id, title, primary_category, categories (list), last_updated, license, journal_ref.
Theorem fields kept: theorem_id, paper_id, name, body, parsing_method.
"""
import ast
import sys

import pyarrow.parquet as pq

from common import STAGE, WORK, write_jsonl

REPO = "uw-math-ai/theorem-search-dataset-permissive"


def _list(text):
    try:
        v = ast.literal_eval(text) if text else []
        return [str(x) for x in v] if isinstance(v, (list, tuple)) else []
    except (ValueError, SyntaxError):
        return []


def papers(path):
    t = pq.read_table(path, columns=["paper_id", "title", "primary_category", "categories", "last_updated",
                                     "license", "journal_ref"])
    for row in t.to_pylist():
        row["categories"] = _list(row["categories"])
        yield row


def theorems(path):
    pf = pq.ParquetFile(path)
    for batch in pf.iter_batches(columns=["theorem_id", "paper_id", "name", "body", "parsing_method"], batch_size=50000):
        yield from batch.to_pylist()


def build(folder=None):
    folder = folder or WORK / "theoremsearch"
    write_jsonl(STAGE / "ts-papers.jsonl.gz", papers(folder / "paper.parquet"))
    write_jsonl(STAGE / "ts-theorems.jsonl.gz", theorems(folder / "theorem.parquet"))


if __name__ == "__main__":
    build()
    print("wrote", STAGE / "ts-papers.jsonl.gz", STAGE / "ts-theorems.jsonl.gz", file=sys.stderr)
