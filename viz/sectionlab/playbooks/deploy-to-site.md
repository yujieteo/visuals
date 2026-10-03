# Deploy to the site

Sectionlab is developed in this repository, where CI runs all of its tests. The
personal site repository carries a port of the page files at `visuals/sectionlab/`
and publishes `index.html` and `raw.json`; it runs no Sectionlab logic tests.

1. Run [Verify](verify.md) here, then check the page end to end in the site: take a
   shallow clone (`git clone --depth 1 https://github.com/yujieteo/site`), port the
   change into it as in step 2, and build and browse only this page; never run the full
   site build or the site's test suite here. Run the first no-mistakes pass here and
   merge the change in this repository first.
2. Port it: in the site repository, replace the contents of `visuals/sectionlab/`
   with a copy of this repository minus `tests/` and `.github/` (and minus `.git`),
   byte for byte. Copy files; never symlink.
3. The catalogue entry is `data/visuals/sectionlab.yaml`
   (`html_path: visuals/sectionlab/index.html`, `data_path: visuals/sectionlab/raw.json`,
   the four WebMCP tool names, tags from the site's existing vocabulary). Update its
   `summary` and `fetched` date when the tool changes.
4. Open the site pull request with the ported files and the catalogue entry only (the
   generated `site/` is not committed), and run the second no-mistakes pass there. It
   runs only the site-level tests, among them `tests/test_sectionlab.py`, which checks
   that the published copy matches the ported files. Add no logic tests to the site, and
   time any site test you add. The site's
   [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md)
   owns the details.
5. When the site's shared `templates/beamdswitch.js` or `templates/beamdswitch-report.md`
   changes, bring it here: copy it to `beamdswitch.js` and to
   `tests/fixtures/beamdswitch/template.js` (or `beamdswitch-report.md`), run
   `python build.py`, and verify before porting back.
