# Work lanyards in Singapore

A throwaway, hand-made snapshot: `data.json` holds what Amazon.sg's public listings showed on its `retrieved` date, with review themes paraphrased from each listing's "Customers say" summary and top reviews; `index.html` inlines the same JSON in its `lanyard-data` block (the tests check they match). Never invent a field; leave what a shop does not show empty. Images are the shop's own, hotlinked. `lanyard-model` is the pure core, `lanyard-ui` the page.
