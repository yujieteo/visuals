# everyday-actions fixture

`author.py` reads the day-reconstruction table (`drm_table1.csv`) and the evidence file (`evidence.json`) of the
sibling visualisation `everyday-actions` (`Path(__file__).parent.parent / "everyday-actions"`), and the tests compare the
observed ATUS figures with its `atus_estimates.csv`. These are read-only copies of those three files from
[yujieteo/everyday-actions](https://github.com/yujieteo/everyday-actions); the tests place them beside a copy of this
repository so the builder finds them. Refresh them when everyday-actions changes its data.
