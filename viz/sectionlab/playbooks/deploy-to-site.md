# Deploy to the site

Sectionlab is developed inside the personal site repository at
`visuals/sectionlab/`, and the standalone `sectionlab` repository is an exact
mirror of that folder. The site publishes `index.html` and `raw.json`.

1. Run [Verify](verify.md) in this folder.
2. In the site repository, the catalogue entry is `data/visuals/sectionlab.yaml`
   (`html_path: visuals/sectionlab/index.html`, `data_path: visuals/sectionlab/raw.json`,
   the four WebMCP tool names, tags from the site's existing vocabulary). Update its
   `summary` and `fetched` date when the tool changes.
3. Follow the site's own playbook for visualizations built in the repository: rebuild
   the site, run its tests (they include this folder's Node and Python tests), and
   commit the regenerated site output separately from the source change.
4. After the site change merges, the folder is mirrored to the standalone repository
   unchanged; do not edit the mirror directly.
