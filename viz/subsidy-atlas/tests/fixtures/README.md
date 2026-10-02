# Fixtures

`static/css/style.css` is the head of yujieteo/site's `static/css/style.css`, up to its first `* {` rule: the design tokens
`build.py` inlines (`Path(__file__).resolve().parents[1] / 'static/css/style.css'`, the site's layout, read up to that rule),
so the tests copy this repository beside the fixture and build there. Refresh it when the site's tokens change.
