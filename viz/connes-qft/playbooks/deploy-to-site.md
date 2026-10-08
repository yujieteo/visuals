# Publish through the site

This folder is the source of truth in yujieteo/visuals. The site publishes `index.html` and `raw.json` from its pinned visuals revision. It has no second source copy.

1. Run `python3 ../../scripts/check.py --toon connes-qft` and the browser checks.
2. Merge the visuals change after review.
3. In yujieteo/site, update `visuals.commit` with `scripts/update_visuals_pin.py`.
4. Follow the site deployment playbook. Keep `site/` out of Git.
