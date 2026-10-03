"""The published dataset and generated HTML are intentional public contracts."""
import copy
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# build.py reads the site's static/css/style.css two directories up, so build in a copy laid out like the site:
# <work>/visuals/subsidy-atlas/ beside <work>/static/css/style.css (the fixture copy).
WORK = Path(tempfile.mkdtemp(prefix='subsidy-atlas-'))
HERE = WORK / 'visuals' / 'subsidy-atlas'
shutil.copytree(ROOT, HERE, ignore=shutil.ignore_patterns('__pycache__', '.git', '.github', 'tests'))
shutil.copytree(ROOT / 'tests' / 'fixtures' / 'static', WORK / 'static')
spec = importlib.util.spec_from_file_location('subsidy_atlas_build', HERE / 'build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.products = set()
        self.links = set()
        self.external_assets = set()
        self.ids = []
        self.tools_data = ''
        self.in_data = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if attrs.get('data-product'):
            self.products.add(attrs['data-product'])
        if tag == 'a':
            self.links.add(attrs.get('href'))
        asset = attrs.get('src') or (attrs.get('href') if tag == 'link' and attrs.get('rel') == 'stylesheet' else None)
        if asset and asset.startswith(('https://', 'http://', '//')):
            self.external_assets.add(asset)
        if tag == 'script' and attrs.get('id') == 'atlas-data':
            self.in_data = True

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_data = False

    def handle_data(self, text):
        if self.in_data:
            self.tools_data += text


class SubsidyAtlasTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((HERE / 'raw.json').read_text())

    def test_fixed_vocabulary_and_dates(self):
        expected = {
            'category': {'llm', 'cloud', 'transport', 'delivery', 'energy', 'hardware', 'streaming', 'finance'},
            'subsidiser': {'investors', 'cross-subsidy', 'government', 'merchants'},
            'depth': {'free', 'partial', 'near-cost', 'unknown'},
            'stage': {'acquisition', 'ongoing', 'tapering', 'historical'},
        }
        for key, values in expected.items():
            self.assertEqual(set(self.data['vocabulary'][key]), values)
        builder.validate(self.data)
        as_of = date.fromisoformat(self.data['as_of'])
        for source in self.data['sources'].values():
            self.assertLessEqual(date.fromisoformat(source['accessed']), as_of)
            if source['published']:
                self.assertLessEqual(date.fromisoformat(source['published']), as_of)

    def test_every_record_sourced_and_forecasts_separate(self):
        for entry in self.data['entries']:
            self.assertIs(entry['speculative'], False)
            for key in ('evidence', 'depth_note', 'duration', 'caution'):
                self.assertTrue(entry[key]['sources'], (entry['id'], key))
                for source in entry[key]['sources']:
                    self.assertIn(source, self.data['sources'])
        for pick in self.data['forecasts']:
            self.assertIs(pick['speculative'], True)
            self.assertTrue(pick['signals'])
            self.assertTrue(pick['changes'])
        categories = {cat for entry in self.data['entries'] for cat in entry['categories']}
        self.assertEqual(categories, set(self.data['vocabulary']['category']))

    def test_invalid_data_cannot_publish(self):
        cases = [
            ('missing source', lambda d: d['entries'][0]['evidence'].update(sources=[])),
            ('unknown source', lambda d: d['entries'][0]['duration'].update(sources=['absent'])),
            ('unknown depth', lambda d: d['entries'][0].update(depth='guessed-90-percent')),
            ('unflagged forecast', lambda d: d['forecasts'][0].update(speculative=False)),
            ('forecast in catalogue', lambda d: d['entries'][0].update(speculative=True)),
            ('duplicate ID', lambda d: d['forecasts'][0].update(id=d['entries'][0]['id'])),
            ('future source', lambda d: d['sources']['gemini'].update(published='2099-01-01')),
        ]
        for label, mutate in cases:
            with self.subTest(label=label):
                invalid = copy.deepcopy(self.data)
                mutate(invalid)
                with self.assertRaises(ValueError):
                    builder.render(invalid)

    def test_generated_public_page_is_fresh_complete_and_offline(self):
        subprocess.run([sys.executable, str(HERE / 'build.py'), '--verify'], check=True, cwd=WORK)
        page = Page()
        page.feed((HERE / 'index.html').read_text())
        self.assertEqual(page.products, {entry['id'] for entry in self.data['entries']})
        self.assertEqual(len(page.ids), len(set(page.ids)))
        self.assertEqual(json.loads(page.tools_data), self.data)
        self.assertFalse(page.external_assets)
        for source in self.data['sources'].values():
            self.assertIn(source['url'], page.links)
        for link in page.links:
            if link and link.startswith('#'):
                self.assertIn(link[1:], page.ids)

    def test_curated_data_is_reproducible(self):
        author_spec = importlib.util.spec_from_file_location('subsidy_atlas_author', HERE / 'author.py')
        author = importlib.util.module_from_spec(author_spec)
        author_spec.loader.exec_module(author)
        self.assertEqual(author.dataset(), self.data)


def tearDownModule():
    shutil.rmtree(WORK, ignore_errors=True)


if __name__ == '__main__':
    unittest.main()
