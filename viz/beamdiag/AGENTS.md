# Beam diagram creator (beamdiag)

The page is the Beam diagram notebook of yujieteo/site (`content/play/beamdiag/index.md`, at
`teoyujie.org/play/beamdiag/`). It reads the three files of this folder through the site's `visuals.lock`,
which pins their SHA-256, so a change here takes effect only when the site pins the new commit.

| File | Holds |
| --- | --- |
| `raw.json` | The page data: unit conventions, assumptions, the method, the sources and the Nastran cards. |
| `fixtures.json` | The test beams: pin–pin, fixed–fixed, propped, cantilever, overhang and continuous layouts, up to forty supports, with closed forms where they exist. |
| `reference.json` | The answers of `reference.py`, an exact rational solver by Macaulay integration with only the Python standard library, frozen on 2026-10-10. The notebook's check cell compares its own stiffness solver with every case to 1e-9 of each quantity's largest value. |

`reference.py`, the old JavaScript page, its builder and its tests are in Git history: the last commit
that has them is 32181d1. Never edit `reference.json` by hand. To add a case, restore `reference.py` from
that commit, add the beam to `fixtures.json`, run it, and commit both files.

Loads are positive upward, couples counter-clockwise, and M is positive when sagging. The data is in SI
(m, N, Pa).
