"""The large-data fixture: exact size, the same bytes for the same seed, and the generator's own sums equal to
an independent reading of the file (ref_csv.py, the csv module and integer cents).

The 100,000,000-byte file is made only by tests/gate (it is kept out of Git, in build/); these tests use small
files, which take the same code path, including the last-row fit.
"""
import hashlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "fixtures"))
import gen_csv  # noqa: E402
import ref_csv  # noqa: E402


def make(size, seed=gen_csv.SEED):
    out = io.BytesIO()
    summary = gen_csv.generate(out, size, seed)
    return out.getvalue(), summary


class Fixture(unittest.TestCase):
    def test_exact_size_and_repeatable(self):
        for size in (120, 121, 997, 250_000):
            data, _ = make(size)
            self.assertEqual(len(data), size)
            self.assertTrue(data.endswith(b"\n"))
            self.assertEqual(hashlib.sha256(data).digest(), hashlib.sha256(make(size)[0]).digest(), size)
        self.assertNotEqual(make(10_000)[0], make(10_000, seed=1)[0], "the seed changes the file")

    def test_generator_sums_equal_the_independent_reference(self):
        data, summary = make(2_000_000)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "f.csv"
            path.write_bytes(data)
            self.assertEqual(ref_csv.reference(path), summary)
        self.assertEqual(len(summary["totals"]), 12)
        for column, count in summary["empty"].items():
            self.assertGreater(count, 0, f"{column} has missing values")
        self.assertTrue(0 < summary["kept"] < summary["rows"])

    def test_totals_csv_is_the_reference_in_order(self):
        text = gen_csv.totals_csv({"totals": {"b": [5, 1], "a": [123456, 2]}})
        self.assertEqual(text, "category,total,count\na,1234.56,2\nb,0.05,1\n")

    def test_too_small_a_size_is_refused(self):
        with self.assertRaises(SystemExit):
            make(len(gen_csv.HEADER) + 5)


if __name__ == "__main__":
    unittest.main()
