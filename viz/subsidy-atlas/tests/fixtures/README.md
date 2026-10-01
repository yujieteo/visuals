# Fixtures

`static/css/style.css` is a read-only copy of yujieteo/site's `static/css/style.css`: `build.py` inlines the design tokens
from its head (`Path(__file__).resolve().parents[1] / 'static/css/style.css'`, the site's layout), so the tests copy this
repository beside the fixture and build there. Refresh it when the site's tokens change.
