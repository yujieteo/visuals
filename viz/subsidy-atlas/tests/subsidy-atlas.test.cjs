const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {filterEntries, matrix, getProduct} = require('../engine.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../raw.json'), 'utf8'));

function loadBrowserAtlas(modelContext) {
  const fields = Object.fromEntries(['q', 'category', 'subsidiser', 'depth', 'stage', 'includeHistorical']
    .map(name => [name, {value: '', checked: false}]));
  const cards = data.entries.map(entry => ({dataset: {product: entry.id}}));
  const buttons = Object.keys(data.vocabulary.stage).flatMap(stage => Object.keys(data.vocabulary.depth).map(depth => {
    const attributes = {};
    return {dataset: {depth, stage}, closest() { return this; },
      setAttribute(name, value) { attributes[name] = value; }, getAttribute: name => attributes[name]};
  }));
  const listeners = {};
  const presets = ['llm', 'free', 'policy', 'history'].map(preset => ({dataset: {preset},
    addEventListener(type, listener) { this.click = listener; }}));
  const nodes = {
    'atlas-data': {textContent: JSON.stringify(data)},
    filters: {elements: {namedItem: name => fields[name]}, addEventListener() {},
      reset() { for (const field of Object.values(fields)) Object.assign(field, {value: '', checked: false}); }},
    matrix: {querySelectorAll: () => buttons, querySelector: () => nodes.history,
      addEventListener(type, listener) { listeners[type] = listener; }},
    catalogue: {focus() {}}, history: {}, count: {}, empty: {},
    'save-beamdswitch': {addEventListener() {}}, 'copy-beamdswitch': {addEventListener() {}}, 'deck-status': {},
  };
  const document = {
    modelContext,
    getElementById: id => nodes[id],
    querySelectorAll: selector => ({'[data-product]': cards, '[data-preset]': presets})[selector] || [],
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../engine.js'), 'utf8'),
    {document, navigator: {}});
  const click = button => listeners.click({target: button});
  return {cards, nodes, fields, buttons, presets, click};
}

test('document WebMCP registers and executes all three read-only tools without navigator WebMCP', async () => {
  const tools = new Map();
  const modelContext = {
    registerTool(tool) {
      assert.equal(this, modelContext);
      assert.ok(!tools.has(tool.name));
      tools.set(tool.name, tool);
    },
  };
  const {cards} = loadBrowserAtlas(modelContext);
  assert.deepEqual([...tools.keys()].sort(), ['get_metadata', 'get_product', 'search_products']);
  for (const tool of tools.values()) assert.equal(tool.annotations.readOnlyHint, true);
  const execute = async (name, input) => {
    const result = await tools.get(name).execute(input);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, 'text');
    return JSON.parse(result.content[0].text);
  };
  assert.deepEqual(await execute('get_metadata', {}),
    {as_of: data.as_of, vocabulary: data.vocabulary, sources: data.sources});
  const current = await execute('search_products', {});
  assert.deepEqual(current.entries, filterEntries(data));
  assert.equal(current.as_of, data.as_of);
  assert.deepEqual(cards.filter(card => !card.hidden).map(card => card.dataset.product),
    current.entries.map(entry => entry.id));
  assert.deepEqual((await execute('search_products', {q: 'ChatGPT Pro'})).entries, []);
  assert.deepEqual((await execute('search_products', {q: 'ChatGPT Pro', includeHistorical: true})).entries
    .map(entry => entry.id), ['pro-2025']);
  for (const id of ['gemini-free', data.forecasts[0].id, 'missing']) {
    assert.deepEqual(await execute('get_product', {id}),
      {as_of: data.as_of, product: getProduct(data, id), sources: data.sources});
  }
  await assert.rejects(() => execute('search_products', {depth: 'made-up'}), /Unknown depth/);
});

test('catalogue renders when document WebMCP is unavailable', () => {
  const {cards, nodes} = loadBrowserAtlas(undefined);
  assert.deepEqual(cards.filter(card => !card.hidden).map(card => card.dataset.product),
    filterEntries(data).map(entry => entry.id));
  assert.equal(nodes.matrix.hidden, false);
  assert.equal(nodes.history.hidden, true);
  assert.equal(nodes.empty.hidden, true);
});

test('matrix cells stay navigable: selecting moves between cells and reselecting clears', () => {
  const {cards, fields, buttons, click} = loadBrowserAtlas(undefined);
  const cell = (stage, depth) => buttons.find(button => button.dataset.stage === stage && button.dataset.depth === depth);
  const visible = () => cards.filter(card => !card.hidden).map(card => card.dataset.product);
  const pressed = () => buttons.filter(button => button.getAttribute('aria-pressed') === 'true');
  fields.category.value = 'llm';
  fields.includeHistorical.checked = true;
  const baseline = matrix(data, filterEntries(data, {category: 'llm', includeHistorical: true}));
  const [first, second] = baseline.filter(entry => entry.ids.length > 0);
  assert.ok(first && second);
  click(cell(first.stage, first.depth));
  assert.deepEqual(visible(), first.ids);
  assert.deepEqual(pressed(), [cell(first.stage, first.depth)]);
  for (const {stage, depth, ids} of baseline) {
    assert.equal(cell(stage, depth).textContent, ids.length || '—');
    assert.equal(cell(stage, depth).disabled, ids.length === 0 && !(stage === first.stage && depth === first.depth));
  }
  click(cell(second.stage, second.depth));
  assert.deepEqual(visible(), second.ids);
  assert.deepEqual(pressed(), [cell(second.stage, second.depth)]);
  assert.equal(fields.category.value, 'llm');
  click(cell(second.stage, second.depth));
  assert.deepEqual(pressed(), []);
  assert.deepEqual([fields.depth.value, fields.stage.value], ['', '']);
  assert.deepEqual(visible(), filterEntries(data, {category: 'llm', includeHistorical: true}).map(entry => entry.id));
});

test('quick presets replace every filter with exactly their own and update the count', () => {
  const {cards, nodes, fields, presets} = loadBrowserAtlas(undefined);
  const expected = {llm: {category: 'llm'}, free: {depth: 'free'}, policy: {stage: 'tapering'},
    history: {stage: 'historical', includeHistorical: true}};
  for (const preset of presets) {
    fields.q.value = 'leftover';
    fields.subsidiser.value = 'government';
    preset.click();
    const filters = {q: '', category: '', subsidiser: '', depth: '', stage: '', includeHistorical: false, ...expected[preset.dataset.preset]};
    assert.deepEqual(Object.fromEntries(Object.entries(fields).map(([name, field]) =>
      [name, name === 'includeHistorical' ? field.checked : field.value])), filters, preset.dataset.preset);
    const entries = filterEntries(data, filters);
    assert.ok(entries.length > 0, preset.dataset.preset);
    assert.deepEqual(cards.filter(card => !card.hidden).map(card => card.dataset.product), entries.map(entry => entry.id));
    const current = entries.filter(entry => entry.stage !== 'historical').length;
    assert.equal(nodes.count.textContent, `${entries.length} of ${data.entries.length} records · ${current} current programmes / reported incentives`);
  }
});

test('current catalogue excludes old loss reports and forecasts', () => {
  const result = filterEntries(data);
  assert.ok(result.length > 0);
  assert.ok(result.every(entry => entry.stage !== 'historical' && entry.speculative === false));
  assert.equal(filterEntries(data, {q: 'ChatGPT Pro'}).length, 0);
  assert.equal(filterEntries(data, {q: 'CHATGPT PRO', includeHistorical: true})[0].id, 'pro-2025');
  assert.equal(filterEntries(data, {includeHistorical: true}).length, data.entries.length);
});

test('search combines category, payer, depth and stage and handles two-category products', () => {
  assert.deepEqual(filterEntries(data, {q: '  gemini ', category: 'llm', depth: 'free',
    subsidiser: 'cross-subsidy', stage: 'acquisition'}).map(entry => entry.id), ['gemini-free']);
  for (const category of ['delivery', 'transport']) {
    assert.deepEqual(filterEntries(data, {category}).map(entry => entry.id), ['grab-promos']);
  }
  assert.equal(filterEntries(data, {q: 'Gemini', subsidiser: 'government'}).length, 0);
  assert.equal(filterEntries(data, {q: '<script>'}).length, 0);
  assert.equal(filterEntries(data, {stage: 'historical'}).length, 0);
});

test('all fixed vocabularies reject unsupported filter values', () => {
  for (const key of ['category', 'subsidiser', 'depth', 'stage']) {
    assert.throws(() => filterEntries(data, {[key]: 'made-up'}), /Unknown/);
  }
  assert.throws(() => filterEntries(data, {q: 12}), /text/);
});

test('overview assigns each matching entry exactly once and drilldown preserves counts', () => {
  for (const filters of [{}, {category: 'llm', includeHistorical: true}, {includeHistorical: true}, {q: 'not-a-product'}]) {
    const entries = filterEntries(data, filters);
    const cells = matrix(data, entries);
    assert.equal(cells.length, 16);
    assert.deepEqual(cells.flatMap(cell => cell.ids).sort(), entries.map(entry => entry.id).sort());
    for (const cell of cells) {
      const narrowed = filterEntries(data, {...filters, depth: cell.depth, stage: cell.stage});
      assert.deepEqual(narrowed.map(entry => entry.id).sort(), cell.ids.slice().sort());
    }
  }
});

test('details retain cited evidence and explicit speculation labels', () => {
  assert.equal(getProduct(data, 'missing'), null);
  assert.equal(getProduct(data, 'gemini-free').evidence.sources[0], 'gemini');
  for (const forecast of data.forecasts) {
    const result = getProduct(data, forecast.id);
    assert.equal(result.speculative, true);
    assert.ok(result.signals.every(signal => signal.sources.length > 0));
  }
});
