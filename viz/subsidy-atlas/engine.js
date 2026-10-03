(function (root) {
  'use strict';
  const FILTER_KEYS = ['category', 'subsidiser', 'depth', 'stage'];
  function filterEntries(data, filters = {}) {
    for (const key of FILTER_KEYS) {
      if (filters[key] && !Object.hasOwn(data.vocabulary[key], filters[key])) {
        throw new Error(`Unknown ${key}: ${filters[key]}`);
      }
    }
    if (filters.q != null && typeof filters.q !== 'string') throw new Error('Search must be text');
    const query = (filters.q || '').trim().toLocaleLowerCase();
    return data.entries.filter(entry => {
      if (!filters.includeHistorical && entry.stage === 'historical') return false;
      if (filters.category && !entry.categories.includes(filters.category)) return false;
      if (['subsidiser', 'depth', 'stage'].some(key => filters[key] && entry[key] !== filters[key])) return false;
      const text = [entry.name, entry.metric, entry.evidence.text, entry.caution.text,
        ...entry.categories.map(key => data.vocabulary.category[key]), data.vocabulary.subsidiser[entry.subsidiser]].join(' ').toLocaleLowerCase();
      return !query || text.includes(query);
    });
  }
  function matrix(data, entries) {
    return Object.keys(data.vocabulary.stage).flatMap(stage =>
      Object.keys(data.vocabulary.depth).map(depth => ({stage, depth,
        ids: entries.filter(entry => entry.stage === stage && entry.depth === depth).map(entry => entry.id)})));
  }
  /* The overview counts every depth × lifecycle cell, so it ignores the depth and stage filters. */
  const overview = (data, filters) => matrix(data, filterEntries(data, {...filters, depth: '', stage: ''}));
  const currentCount = entries => entries.filter(entry => entry.stage !== 'historical').length;
  const countLine = (data, entries) =>
    `${entries.length} of ${data.entries.length} records · ${currentCount(entries)} current programmes / reported incentives`;
  function getProduct(data, id) {
    return data.entries.find(entry => entry.id === id) || data.forecasts.find(entry => entry.id === id) || null;
  }
  /* The catalogue as shown, as a beamdswitch report: the standard template (beamdswitch.js,
     `Beamdswitch.deck`) writes it as a narrated Markdown deck. Every number and claim is the
     dataset's own text, cited as the cards cite it. */
  const md = text => String(text ?? '').replace(/\s+/g, ' ').trim().replace(/[\\$*_`|<>[\]]/g, '\\$&');
  const SCALE = {B: 'billion', M: 'million', K: 'thousand'};
  const say = text => String(text ?? '')
    .replace(/\b(US|S|A)?\$\s?(\d[\d,.]*\d|\d)(?:\s?(billion|million|B|M|K)\b)?/g, (_, cur, n, scale) =>
      `${n}${scale ? ' ' + (SCALE[scale] || scale) : ''} ${cur === 'S' ? 'Singapore ' : cur === 'US' ? 'US ' : ''}dollars`)
    .replace(/(\d)\s?%/g, '$1 percent').replace(/&/g, ' and ').replace(/\s\/\s/g, ', ').replace(/\//g, ' per ')
    .replace(/→/g, ' to ').replace(/[“”"]/g, '').replace(/[$\\`*_#|<>[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const spokenDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'});
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const sentences = (text, n) => (String(text).match(/[^.!?]+[.!?]+/g) || [String(text)]).slice(0, n).join('').trim();
  const cite = (data, id) => {
    const s = data.sources[id];
    return `[${md(s.title)}](${s.url}) (${s.published || 'undated; accessed ' + s.accessed})`;
  };
  function report(data, filters = {}) {
    const vocab = data.vocabulary, entries = filterEntries(data, filters);
    const current = currentCount(entries);
    const count = countLine(data, entries);
    const active = [filters.q && filters.q.trim() && `search “${md(filters.q.trim())}”`,
      ...FILTER_KEYS.filter(key => filters[key]).map(key => md(vocab[key][filters[key]]))].filter(Boolean);
    const scope = active.length ? active.join(' · ') : 'all records';
    const history = filters.includeHistorical ? 'historical evidence included' : 'historical evidence hidden (not current deals)';
    const stages = Object.keys(vocab.stage).filter(stage => filters.includeHistorical || stage !== 'historical');
    const cells = overview(data, filters);
    const label = (key, id) => say(vocab[key][id].replace(' / ', ' or ')).toLowerCase();
    const ids = [...new Set(entries.flatMap(entry => ['evidence', 'depth_note', 'duration', 'caution'].flatMap(key => entry[key].sources)))];
    const card = entry => ({
      title: `${entry.name}: ${entry.metric}`,
      body: [
        `${md(entry.categories.map(cat => vocab.category[cat]).join(' / '))} · ${md(vocab.stage[entry.stage])} · ${md(vocab.subsidiser[entry.subsidiser])} · ${md(vocab.depth[entry.depth])}`,
        '',
        `- **What the evidence establishes.** ${md(entry.evidence.text)}`,
        `- **Window / lifecycle.** ${md(entry.duration.text)}`,
        `- **The catch.** ${md(entry.caution.text)}`,
        '',
        `Sources: ${[...new Set(['evidence', 'duration', 'caution'].flatMap(key => entry[key].sources))].map(id => cite(data, id)).join('; ')}`,
      ].join('\n'),
      notes: `Subsidy depth, denominator matters: ${md(entry.depth_note.text)}`,
      narration: `${say(entry.name)}: ${say(entry.metric)}. It is classed as ${label('depth', entry.depth)}, ${label('subsidiser', entry.subsidiser)}, at the stage ${label('stage', entry.stage)}. ${say(sentences(entry.caution.text, 2))}`,
    });
    const results = [{
      title: `What kind of cheap? ${entries.length} records by lifecycle and depth`,
      body: [
        `| Lifecycle | ${Object.values(vocab.depth).map(md).join(' | ')} |`,
        `| --- | ${Object.keys(vocab.depth).map(() => '---:').join(' | ')} |`,
        ...stages.map(stage => `| ${md(vocab.stage[stage])} | ${Object.keys(vocab.depth).map(depth => cells.find(cell => cell.stage === stage && cell.depth === depth).ids.length || '—').join(' | ')} |`),
      ].join('\n'),
      notes: 'Each cell counts matching records, with the depth and lifecycle filters cleared, as the overview on the page does. Depth bands describe the offer, not comparable cost percentages.',
      narration: `Counting records by lifecycle: ${stages.map(stage => {
        const n = cells.filter(cell => cell.stage === stage).reduce((sum, cell) => sum + cell.ids.length, 0);
        return `${label('stage', stage)}, ${n ? n : 'no'} ${n === 1 ? 'record' : 'records'}`;
      }).join('; ')}.`,
    }];
    if (entries.length) results.push(...entries.map(card));
    else results.push({title: 'No matches', body: 'No matches. Reset the filters, or include historical evidence for older loss reports.', narration: 'No record matches these filters. Reset them, or include historical evidence for older loss reports.'});
    const dates = ids.map(id => data.sources[id]).map(s => s.published || s.accessed).sort();
    return {
      meta: {title: `Subsidy Atlas: ${active.length ? active.join(', ').replace(/\\/g, '') : 'who pays for cheap?'}`, subtitle: count, date: `As of ${data.as_of}`},
      narration: `This talk walks through ${entries.length} of the ${data.entries.length} sourced records in the Subsidy Atlas, places where someone else covers part of the bill, as reviewed on ${spokenDate(data.as_of)}. Depth bands describe the offer, not comparable cost percentages.`,
      notes: 'Cheap is not the same as below cost. A loss-making company can sell profitable tokens.',
      setup: [{
        title: `The catalogue: ${count}`,
        body: [
          `- Filters: ${scope}; ${history}.`,
          `- ${count}.`,
          `- Evidence reviewed ${data.as_of}. “Current” means a published programme or latest reported incentives, not guaranteed availability to you.`,
          `- The speculative watchlist (${data.forecasts.length} picks) is separate from the evidence and is not in this deck.`,
        ].join('\n'),
        narration: `With ${active.length ? 'the filters ' + say(active.join(', ').replace(/^search “(.*)”/, 'a search for $1')) : 'no filters'}, and historical evidence ${filters.includeHistorical ? 'included' : 'hidden'}, the catalogue shows ${entries.length} of ${data.entries.length} records, ${current} of them current programmes or reported incentives. The speculative watchlist is kept out of this talk.`,
      }],
      method: [{
        title: 'Depth bands describe the offer, not comparable cost percentages',
        body: [
          ...Object.entries(vocab.depth).map(([, label]) => `- Depth: ${md(label)}`),
          ...Object.entries(vocab.stage).map(([, label]) => `- Lifecycle: ${md(label)}`),
          '',
          'Free charges, capped rebates, at-cost hardware and reported losses are different measurements, so the records are counted in descriptive bands rather than ranked by a single percent below cost.',
        ].join('\n'),
        narration: 'Free charges, capped rebates, at-cost hardware and reported losses are different measurements. So each record is placed in a depth band and a lifecycle stage, rather than ranked by one percent below cost. Unknown means a reported loss without a unit-cost denominator.',
      }],
      results,
      checks: [{
        title: `Every claim is sourced: ${plural(ids.length, 'source', 'sources')} behind ${plural(entries.length, 'record', 'records')}`,
        body: [
          `- ${ids.length} distinct sources, ${ids.filter(id => data.sources[id].published).length} with a publication date and ${ids.filter(id => !data.sources[id].published).length} live terms with an access date.`,
          ...(dates.length ? [`- Dates run from ${dates[0]} to ${dates.at(-1)}, none after the review date ${data.as_of}.`] : []),
          `- Historical records keep their dated labels: ${entries.filter(entry => entry.stage === 'historical').length} shown here.`,
        ].join('\n'),
        narration: `Every claim block cites its sources: ${plural(ids.length, 'distinct source stands', 'distinct sources stand')} behind ${entries.length === 1 ? 'this record' : `these ${entries.length} records`}, none dated after the review date. Historical records keep their dated labels and are not current deals.`,
      }, {
        title: 'Takeaway',
        key: `Cheap is not the same as below cost. ${current} of ${plural(entries.length, 'record', 'records')} shown ${current === 1 ? 'is a current programme or reported incentive' : 'are current programmes or reported incentives'}; check live terms before acting.`,
        narration: `Cheap is not the same as below cost. Of ${plural(entries.length, 'record', 'records')} here, ${current} ${current === 1 ? 'is a current programme or reported incentive' : 'are current programmes or reported incentives'}, so check the live terms before acting.`,
      }],
    };
  }
  const api = {filterEntries, matrix, getProduct, report};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SubsidyAtlas = api;
  if (typeof document === 'undefined') return;
  const data = JSON.parse(document.getElementById('atlas-data').textContent);
  const form = document.getElementById('filters');
  const field = name => form.elements.namedItem(name);
  const readFilters = () => ({q: field('q').value, category: field('category').value,
    subsidiser: field('subsidiser').value, depth: field('depth').value,
    stage: field('stage').value, includeHistorical: field('includeHistorical').checked});
  const cards = [...document.querySelectorAll('[data-product]')];
  const chart = document.getElementById('matrix');
  function render() {
    const filters = readFilters();
    const entries = filterEntries(data, filters);
    const ids = new Set(entries.map(entry => entry.id));
    cards.forEach(card => { card.hidden = !ids.has(card.dataset.product); });
    document.getElementById('count').textContent = countLine(data, entries);
    document.getElementById('empty').hidden = entries.length > 0;
    const cells = overview(data, filters);
    for (const button of chart.querySelectorAll('button')) {
      const cell = cells.find(cell => cell.depth === button.dataset.depth && cell.stage === button.dataset.stage);
      const selected = cell.depth === filters.depth && cell.stage === filters.stage;
      button.textContent = cell.ids.length || '—';
      button.disabled = cell.ids.length === 0 && !selected;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `${data.vocabulary.stage[cell.stage]}, ${data.vocabulary.depth[cell.depth]}: ${cell.ids.length} records. ${selected ? 'Clear cell filter' : 'Filter catalogue'}.`);
    }
    chart.querySelector('[data-history-row]').hidden = !filters.includeHistorical;
    chart.hidden = false;
  }
  form.addEventListener('input', event => {
    if (event.target.name === 'stage' && field('stage').value === 'historical') field('includeHistorical').checked = true;
    if (event.target.name === 'includeHistorical' && !field('includeHistorical').checked && field('stage').value === 'historical') field('stage').value = '';
    render();
  });
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('reset', () => { setTimeout(render, 0); });
  const PRESETS = {llm: {category: 'llm'}, free: {depth: 'free'}, policy: {stage: 'tapering'}, history: {stage: 'historical'}};
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    form.reset();
    for (const [name, value] of Object.entries(PRESETS[button.dataset.preset])) field(name).value = value;
    field('includeHistorical').checked = button.dataset.preset === 'history';
    render();
  }));
  chart.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const selected = button.getAttribute('aria-pressed') === 'true';
    field('depth').value = selected ? '' : button.dataset.depth;
    field('stage').value = selected ? '' : button.dataset.stage;
    render();
    document.getElementById('catalogue').focus();
  });
  function registerTools() {
    const mc = document.modelContext;
    if (!mc?.registerTool) return;
    const tools = [
      {name: 'get_metadata', description: 'Get the Subsidy Atlas date, vocabulary and sources. Depth is not a comparable cost percentage.',
        inputSchema: {type: 'object', properties: {}, additionalProperties: false},
        execute: async () => ({as_of: data.as_of, vocabulary: data.vocabulary, sources: data.sources})},
      {name: 'search_products', description: 'Search evidenced products. Historical evidence excluded unless includeHistorical is true. Forecasts are separate.',
        inputSchema: {type: 'object', properties: {q: {type: 'string'}, includeHistorical: {type: 'boolean'},
          ...Object.fromEntries(FILTER_KEYS.map(key => [key, {type: 'string', enum: Object.keys(data.vocabulary[key])}]))}, additionalProperties: false},
        execute: async filters => ({as_of: data.as_of, entries: filterEntries(data, filters)})},
      {name: 'get_product', description: 'Get one evidenced product or explicitly speculative forecast by its ID, with source references.',
        inputSchema: {type: 'object', properties: {id: {type: 'string'}}, required: ['id'], additionalProperties: false},
        execute: async ({id}) => ({as_of: data.as_of, product: getProduct(data, id), sources: data.sources})},
    ];
    for (const tool of tools) mc.registerTool({...tool, annotations: {readOnlyHint: true},
      execute: async args => ({content: [{type: 'text', text: JSON.stringify(await tool.execute(args))}]})});
  }
  /* The beamdswitch buttons save or copy the catalogue as shown as a narrated deck. */
  const deck = () => root.Beamdswitch.deck(report(data, readFilters()));
  const deckStatus = document.getElementById('deck-status');
  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.getElementById('save-beamdswitch').addEventListener('click', async () => {
    const text = deck(), name = 'subsidy-atlas-beamdswitch.md';
    try {
      save(new Blob([text], {type: 'text/markdown'}), name);
      deckStatus.textContent = `Saved ${name}: open it in beamdswitch.`;
    } catch {
      try { await navigator.clipboard.writeText(text); deckStatus.textContent = 'Copied the beamdswitch deck, as saving is blocked here: paste it into beamdswitch.'; }
      catch { deckStatus.textContent = 'Could not save or copy the beamdswitch deck here.'; }
    }
  });
  document.getElementById('copy-beamdswitch').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(deck()); deckStatus.textContent = 'Copied the beamdswitch deck: paste it into beamdswitch.'; }
    catch { deckStatus.textContent = 'Could not copy the beamdswitch deck here: use the beamdswitch button to save it.'; }
  });
  registerTools();
  render();
})(typeof globalThis === 'undefined' ? this : globalThis);
