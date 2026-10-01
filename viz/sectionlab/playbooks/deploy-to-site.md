# Deploy to the site

Sectionlab is developed in this repository, where CI runs all of its tests. The
personal site repository carries a port of the page files at `visuals/sectionlab/`
and publishes `index.html` and `raw.json`; it runs no Sectionlab logic tests.

1. Run [Verify](verify.md) here, and merge the change in this repository first.
2. Port it: in the site repository, replace the contents of `visuals/sectionlab/`
   with a copy of this repository minus `tests/` and `.github/` (and minus `.git`).
   Copy files; never symlink.
3. The catalogue entry is `data/visuals/sectionlab.yaml`
   (`html_path: visuals/sectionlab/index.html`, `data_path: visuals/sectionlab/raw.json`,
   the four WebMCP tool names, tags from the site's existing vocabulary). Update its
   `summary` and `fetched` date when the tool changes.
4. Follow the site's own playbook for visualizations built in the repository: rebuild
   the site, run its tests (its `tests/test_sectionlab.py` checks that the published copy
   matches the ported files), and commit the regenerated site output separately from
   the ported files.
5. When the site's shared `templates/beamdswitch.js` or `templates/beamdswitch-report.md`
   changes, bring it here: copy it to `beamdswitch.js` and to
   `tests/fixtures/beamdswitch/template.js` (or `beamdswitch-report.md`), run
   `python build.py`, and verify before porting back.
