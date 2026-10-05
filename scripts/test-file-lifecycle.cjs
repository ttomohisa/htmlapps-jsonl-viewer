const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { test: runTest } = require('node:test');
const test = (name, fn) => runTest(name, { timeout: 5000 }, fn);
const { File } = require('node:buffer');

// No browser: minimal DOM/Worker adapters execute the app's unchanged functions.
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.listeners = {}; this.value = ''; this.hidden = false; this.disabled = false; this._text = ''; this.classes = new Set(); this.classList = { add: (...xs) => xs.forEach(x => this.classes.add(x)), remove: (...xs) => xs.forEach(x => this.classes.delete(x)), contains: x => this.classes.has(x), toggle: (x, force) => { const on = force === undefined ? !this.classes.has(x) : force; if (on) this.classes.add(x); else this.classes.delete(x); return on; } }; }
  set value(v) { this._value = this.tagName === 'textarea' ? String(v).replace(/\r\n?/g, '\n') : v; }
  get value() { return this._value; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(x => x.textContent).join(''); }
  set className(v) { this.classes = new Set(v.split(/\s+/)); }
  get className() { return [...this.classes].join(' '); }
  append(...xs) { this.children.push(...xs); }
  replaceChildren(...xs) { this._text = ''; this.children = xs; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  async dispatch(type, event = {}) { for (const fn of this.listeners[type] || []) await fn({ target: this, ...event }); }
  setAttribute(name, value) { this[name] = value; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  click() { return this.dispatch('click', { stopPropagation() {} }); }
  remove() {}
  select() {}
  scrollIntoView() {}
}
function descendants(el) { return el.children.flatMap(x => [x, ...descendants(x)]); }
function harness(path, opts = {}) {
  let source = fs.readFileSync(path, 'utf8');
  if (source.includes('id="self-extract-payload"')) source = gunzipSync(Buffer.from(source.match(/id="self-extract-payload"[^>]*>([A-Za-z0-9+/=\r\n]+)<\/script>/)[1], 'base64')).toString('utf8');
  let code = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('function addFiles'));
  const config = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.config.json'), 'utf8');
  code = code.replace('__APP_CONFIG_JSON__', config).replace('__BUILD_MANIFEST_JSON__', '{}').replace('__EMBEDDED_ASSET_BUNDLE_JSON__', '{"dependencies":{}}');
  code = code.replace('      $(\'#versionBadge\').textContent=', '      globalThis.api={state,addFiles,removeFile,activateFile,readPage,analyzeFile,prepareFields,sortRows,cycleSort,buildCurrentCsv,buildCurrentJsonl,visibleFields,renderActive,renderData,normalizedFilenameBase,downloadCsv,copyJsonl,copyCsv,workerSource};\n      $(\'#versionBadge\').textContent=');
  const nodes = new Map(), workers = [], blobs = new Map(), downloads = [], copies = [], fallbackCopies = [];
  const node = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  class WorkerAdapter {
    constructor(url) { this.url = url; this.terminated = false; workers.push(this); }
    postMessage(message) {
      this.message = message;
      if ((opts.delayFirst && workers[0] === this) || opts.delayWorker === workers.length) { this.lateMessage = this.onmessage; this.lateError = this.onerror; return; }
      this.run(message);
    }
    run(message = this.message) {
      const blob = blobs.get(this.url);
      this.task = (async () => {
        const self = { postMessage: data => { if (!this.terminated) this.onmessage?.({ data }); } };
        vm.runInNewContext(await blob.text(), { self, TextDecoder, Uint8Array, Map, Math });
        if (!this.terminated) await self.onmessage({ data: message });
      })().catch(error => this.onerror?.({ message: error.message }));
    }
    terminate() { this.terminated = true; }
  }
  const document = {
    body: new Element('body'), documentElement: new Element('html'), addEventListener() {},
    querySelector: node,
    querySelectorAll(selector) {
      if (selector === '#columnsList input[type="checkbox"]') return descendants(node('#columnsList')).filter(x => x.tagName === 'input');
      if (selector === '#dataTableWrap tbody tr') return descendants(node('#dataTableWrap')).filter(x => x.tagName === 'tbody').flatMap(x => x.children);
      return [];
    },
    createElement(tag) { const el = new Element(tag); if (tag === 'a') el.click = () => downloads.push({ filename: el.download, blob: blobs.get(el.href) }); return el; },
    execCommand() { fallbackCopies.push(document.body.children.at(-1).value); if (opts.fallbackError) throw opts.fallbackError; return opts.fallbackResult ?? true; }
  };
  const context = { document, navigator: { languages: ['en'], clipboard: { writeText: async text => { copies.push(text); return opts.writeText?.(text); } } }, localStorage: { getItem() { return null; }, setItem() {} }, URL: { createObjectURL(blob) { const key = `blob:unit-${blobs.size}-${Math.random()}`; blobs.set(key, blob); return key; }, revokeObjectURL(url) { blobs.delete(url); } }, Worker: WorkerAdapter, Blob, File, TextDecoder, TextEncoder, Uint8Array, Intl, console, setTimeout() { return 1; }, clearTimeout() {}, requestAnimationFrame: fn => fn(), addEventListener() {}, scrollTo() {} };
  context.window = context;
  vm.createContext(context); vm.runInContext(code, context, { filename: path });
  return { api: context.api, node, document, workers, blobs, downloads, copies, fallbackCopies };
}
const file = (name, text) => new File([text], name, { type: 'application/x-ndjson' });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }
const aText = '{"name":"A","score":9}\n';
const bText = '{"name":"Beta","score":30}\n{"name":"Alpha","score":10}\n{"name":"Gamma","score":20}\n';
const exportIds = ['#copyJsonlButton', '#copyCsvButton', '#downloadCsvButton'];
function assertExports(h, enabled) { for (const id of exportIds) assert.equal(h.node(id).disabled, !enabled, id); }
async function pair(artifact, opts) { const h = harness(artifact, opts); await h.api.addFiles([file('A.jsonl', aText), file('B.ndjson', bText)]); return h; }
function deferReads(f) {
  const original = f.file, requests = [];
  f.file = { name: original.name, size: original.size, slice(start, end) { return { arrayBuffer() { return new Promise((resolve, reject) => requests.push({ resolve: async () => resolve(await original.slice(start, end).arrayBuffer()), reject })); } }; } };
  return { requests, restore() { f.file = original; } };
}
module.exports = { harness, file, descendants, tick, settle, deferReads };
const artifacts = process.argv.slice(2);
if (require.main === module) for (const artifact of artifacts.length ? artifacts : [path.join(__dirname, '..', 'src/index.template.html')]) {
  test(`${artifact}: closing active file loads unvisited successor and export contents`, async () => {
    const h = await pair(artifact), [a, b] = h.api.state.files;
    assert.equal(a.rows.length, 1); assert.equal(b.analysis.totalLines, 3); assert.equal(b.rows.length, 0);
    await h.node('#fileTabs').children[0].children[1].click(); await settle();
    assert.equal(h.api.state.activeId, b.id); assert.equal(b.rows.length, 3);
    assert.match(h.node('#dataTableWrap').textContent, /Beta/); assert.equal(h.node('#pageRangeLabel').textContent, 'Lines 1–3 / 3');
    assert.equal(h.api.buildCurrentJsonl(b), bText.trim()); assert.equal(h.api.buildCurrentCsv(b).split('\r\n').length, 4); assertExports(h, true);
    h.node('#outputFilename').value = 'chosen:review.csv'; h.api.downloadCsv();
    assert.equal(h.downloads[0].filename, 'chosen-review.csv');
    assert.equal(Buffer.from(await h.downloads[0].blob.arrayBuffer()).toString('utf8'), '\uFEFF' + h.api.buildCurrentCsv(b));
  });
  test(`${artifact}: visited successor preserves page, record view, columns, sort and filename`, async () => {
    const h = await pair(artifact), [a, b] = h.api.state.files;
    await h.api.activateFile(b.id); b.pageSize = 2; b.page = 2; await h.api.readPage(b);
    b.viewMode = 'record'; b.hiddenFields.add(1); b.sort = { fieldName: 'score', direction: 'desc' }; b.outputFilename = 'selected-page';
    await h.api.activateFile(a.id); h.api.removeFile(a.id); await settle();
    assert.equal(b.page, 2); assert.equal(b.rows.length, 1); assert.equal(b.rows[0].record.name, 'Gamma');
    assert.equal(b.viewMode, 'record'); assert.ok(b.hiddenFields.has(1)); assert.equal(b.sort.direction, 'desc');
    assert.equal(h.node('#outputFilename').value, 'selected-page'); assert.match(h.node('#recordList').textContent, /Gamma/); assertExports(h, true);
  });
  test(`${artifact}: successor stays loading with exports blocked until page read completes`, async () => {
    const h = await pair(artifact), [a, b] = h.api.state.files, reads = deferReads(b);
    h.api.removeFile(a.id); await tick();
    assert.equal(reads.requests.length, 1); assert.equal(b.loading, true); assert.equal(b.rows.length, 0);
    assert.equal(h.node('#dataLoading').classList.contains('show'), true); assertExports(h, false);
    await h.api.copyJsonl(); await h.api.copyCsv(); h.api.downloadCsv(); assert.equal(h.copies.length, 0); assert.equal(h.downloads.length, 0);
    await reads.requests[0].resolve(); await settle(); assert.equal(b.rows.length, 3); assert.equal(b.loading, false);
    assert.equal(h.node('#dataLoading').classList.contains('show'), false); assertExports(h, true);
  });
  test(`${artifact}: analyzing successor completes without another tab click`, async () => {
    const h = harness(artifact, { delayWorker: 2 }); const batch = h.api.addFiles([file('A.jsonl', aText), file('B.ndjson', bText)]);
    await settle(); const [a, b] = h.api.state.files; assert.equal(b.analyzing, true);
    h.api.removeFile(a.id); assertExports(h, false); assert.equal(h.node('#dataLoading').classList.contains('show'), true);
    h.workers[1].run(); await batch; assert.equal(b.rows.length, 3); assertExports(h, true);
  });
  test(`${artifact}: failed successor page read blocks exports and reactivation retries`, async () => {
    const h = await pair(artifact), [a, b] = h.api.state.files, original = b.file;
    b.file = { name: original.name, size: original.size, slice() { throw new Error('Synthetic page failure'); } };
    h.api.removeFile(a.id); await settle(); assert.equal(b.dataError, 'Synthetic page failure'); assert.equal(b.rows.length, 0);
    assert.match(h.node('#statusBanner').textContent, /Synthetic page failure/); assertExports(h, false);
    await h.api.copyCsv(); h.api.downloadCsv(); assert.equal(h.copies.length, 0); assert.equal(h.downloads.length, 0);
    b.file = original; await h.api.activateFile(b.id); assert.equal(b.dataError, ''); assert.equal(b.rows.length, 3); assertExports(h, true);
  });
  test(`${artifact}: analysis failure successor has no inherited loading or export state`, async () => {
    const h = harness(artifact, { delayWorker: 2 }); const batch = h.api.addFiles([file('A.jsonl', aText), file('B.ndjson', bText)]);
    await settle(); const [a, b] = h.api.state.files; h.workers[1].onerror({ message: 'Synthetic analysis failure' }); await batch;
    h.api.removeFile(a.id); await settle(); assert.equal(b.error, 'Synthetic analysis failure');
    assert.match(h.node('#statusBanner').textContent, /Synthetic analysis failure/); assertExports(h, false);
    assert.equal(h.node('#dataLoading').classList.contains('show'), false);
  });
  test(`${artifact}: closing an inactive file does not discard the active page read`, async () => {
    const h = await pair(artifact), [a, b] = h.api.state.files; await h.api.activateFile(b.id);
    b.pageSize = 2; b.page = 2; const reads = deferReads(b);
    const pending = h.api.readPage(b); h.api.removeFile(a.id); await reads.requests[0].resolve(); await pending;
    assert.equal(h.api.state.activeId, b.id); assert.equal(b.rows.length, 1); assert.equal(b.rows[0].record.name, 'Gamma'); assertExports(h, true);
  });
  test(`${artifact}: background analysis does not invalidate the active successor read`, async () => {
    const h = harness(artifact, { delayWorker: 2 }); const batch = h.api.addFiles([file('A.jsonl', bText), file('B.ndjson', aText)]);
    await settle(); const [a] = h.api.state.files; a.pageSize = 2; a.page = 2; const reads = deferReads(a); const pending = h.api.readPage(a);
    h.workers[1].run(); await batch; await reads.requests[0].resolve(); await pending;
    assert.equal(a.rows.length, 1); assert.equal(a.rows[0].record.name, 'Gamma'); assertExports(h, true);
  });
  test(`${artifact}: closing last file ignores its delayed read and clears readiness`, async () => {
    const h = harness(artifact); await h.api.addFiles([file('A.jsonl', aText)]); const [a] = h.api.state.files, reads = deferReads(a);
    const pending = h.api.readPage(a); h.api.removeFile(a.id); await reads.requests[0].resolve(); await pending;
    assert.equal(h.api.state.activeId, null); assert.equal(h.api.state.files.length, 0); assertExports(h, false);
    assert.equal(h.node('#dataLoading').classList.contains('show'), false); assert.equal(h.node('#emptyState').hidden, false);
  });
  test(`${artifact}: stale read rejection cannot erase a newer successor page`, async () => {
    const h = await pair(artifact), [a, b] = h.api.state.files, reads = deferReads(b);
    const first = h.api.activateFile(b.id); await h.api.activateFile(a.id);
    h.api.removeFile(a.id); await tick(); assert.equal(reads.requests.length, 2);
    await reads.requests[1].resolve(); await settle(); assert.equal(b.rows.length, 3);
    reads.requests[0].reject(new Error('Stale read failure')); await first;
    assert.equal(b.rows.length, 3); assert.equal(b.dataError, ''); assert.equal(b.loading, false); assertExports(h, true);
  });
  test(`${artifact}: stale completion cannot clear the current loading state`, async () => {
    const h = await pair(artifact), [, b] = h.api.state.files; await h.api.activateFile(b.id); const reads = deferReads(b);
    const first = h.api.readPage(b), second = h.api.readPage(b);
    await reads.requests[0].resolve(); await first; assert.equal(b.loading, true); assertExports(h, false);
    await reads.requests[1].resolve(); await second; assert.equal(b.loading, false); assert.equal(b.rows.length, 3); assertExports(h, true);
  });
  test(`${artifact}: selecting a currently loading successor does not cancel its read`, async () => {
    const h = await pair(artifact), [, b] = h.api.state.files, reads = deferReads(b);
    const pending = h.api.activateFile(b.id); await h.api.activateFile(b.id);
    assert.equal(reads.requests.length, 1); await reads.requests[0].resolve(); await pending; assert.equal(b.rows.length, 3); assertExports(h, true);
  });
  test(`${artifact}: empty successor finishes with no exportable rows`, async () => {
    const h = harness(artifact); await h.api.addFiles([file('A.jsonl', aText), file('empty.jsonl', '')]); const [a, b] = h.api.state.files;
    h.api.removeFile(a.id); await settle(); assert.equal(b.rows.length, 0); assert.equal(b.loading, false); assertExports(h, false);
    assert.equal(h.node('#statusBanner').textContent, 'The file contains no lines.'); assert.equal(h.node('#dataLoading').classList.contains('show'), false);
  });
  test(`${artifact}: successor preserves malformed rows, JSONL filtering, CSV fields and numeric sorting`, async () => {
    const h = harness(artifact), mixed = '{"score":30}\nnot-json\n\n{"score":10}\nnull\n';
    await h.api.addFiles([file('A.jsonl', aText), file('mixed.jsonl', mixed)]); const [a, b] = h.api.state.files;
    h.api.removeFile(a.id); await settle(); assert.equal(b.analysis.totalLines, 5); assert.equal(b.analysis.valid, 3); assert.equal(b.analysis.invalid, 2);
    assert.equal(b.rows.length, 5); assertExports(h, true); assert.equal(h.api.buildCurrentJsonl(b), '{"score":30}\n{"score":10}\nnull');
    h.api.cycleSort(b, 'score'); assert.deepEqual(Array.from(h.api.sortRows(b, b.rows), r => r.lineNumber), [4, 1, 5, 2, 3]);
    h.api.cycleSort(b, 'score'); assert.deepEqual(Array.from(h.api.sortRows(b, b.rows), r => r.lineNumber), [1, 4, 5, 2, 3]);
    h.api.cycleSort(b, 'score'); assert.equal(b.sort, null);
    b.hiddenFields.add(b.fields.find(f => f.name === 'score').index); assert.equal(h.api.buildCurrentCsv(b).split('\r\n')[0], '__line,__status,__raw,__value');
    await h.api.copyJsonl(); await h.api.copyCsv(); assert.deepEqual(h.copies, [h.api.buildCurrentJsonl(b), h.api.buildCurrentCsv(b)]);
  });
  test(`${artifact}: issue-only successor enables CSV but has no JSONL records to copy`, async () => {
    const h = harness(artifact); await h.api.addFiles([file('A.jsonl', aText), file('invalid.jsonl', 'not-json\n')]); const [a, b] = h.api.state.files;
    h.api.removeFile(a.id); await settle(); assert.equal(b.rows.length, 1); assert.equal(b.rows[0].valid, false);
    assert.equal(h.node('#copyJsonlButton').disabled, true); assert.equal(h.node('#copyCsvButton').disabled, false); assert.equal(h.node('#downloadCsvButton').disabled, false);
    await h.api.copyJsonl(); assert.equal(h.copies.length, 0); await h.api.copyCsv(); assert.match(h.copies[0], /not-json/);
  });
  test(`${artifact}: closing the last-position tab activates its left neighbor`, async () => {
    const h = await pair(artifact), [a, b] = h.api.state.files;
    await h.api.activateFile(b.id); await h.api.removeFile(b.id);
    assert.equal(h.api.state.activeId, a.id); assert.equal(a.rows[0].record.name, 'A'); assertExports(h, true);
  });
  test(`${artifact}: stale rejection leaves the newer page read pending`, async () => {
    const h = await pair(artifact), [, b] = h.api.state.files; await h.api.activateFile(b.id); const reads = deferReads(b);
    const first = h.api.readPage(b), second = h.api.readPage(b); reads.requests[0].reject(new Error('obsolete')); await first;
    assert.equal(b.loading, true); assert.equal(b.dataError, ''); assertExports(h, false);
    await reads.requests[1].resolve(); await second; assert.equal(b.rows.length, 3); assertExports(h, true);
  });
  test(`${artifact}: adding another batch ignores a previous-source read rejection`, async () => {
    const h = await pair(artifact), [a, b] = h.api.state.files, reads = deferReads(a); const pending = h.api.readPage(a);
    await h.api.addFiles([file('C.jsonl', '{"name":"C"}\n')]); const c = h.api.state.files[2]; assert.equal(c.rows[0].record.name, 'C');
    reads.requests[0].reject(new Error('old source')); await pending; assert.equal(c.rows[0].record.name, 'C'); assertExports(h, true);
    await h.api.activateFile(b.id); assert.equal(b.rows.length, 3);
  });
  test(`${artifact}: closing an inactive analyzing file advances its queued active successor`, async () => {
    const h = harness(artifact, { delayFirst: true }); const batch = h.api.addFiles([file('A.jsonl', aText), file('B.ndjson', bText)]);
    const [a, b] = h.api.state.files; await h.api.activateFile(b.id); assert.equal(b.analysis, null); assertExports(h, false);
    h.api.removeFile(a.id); await batch; assert.equal(b.rows.length, 3); assertExports(h, true);
  });
  test(`${artifact}: October 4 cancellation continues batch, skips queued removal, ignores late worker callbacks`, async () => {
    const h = harness(artifact, { delayFirst: true }); const pending = h.api.addFiles([file('cancel.jsonl', aText), file('queued.jsonl', aText), file('survivor.jsonl', bText)]);
    const old = h.workers[0]; h.api.removeFile(h.api.state.files[1].id); h.api.removeFile(h.api.state.files[0].id); await pending;
    const survivor = h.api.state.files[0]; assert.equal(survivor.rows.length, 3); assert.equal(h.workers.length, 2);
    assert.ok(h.workers.every(w => w.terminated)); assert.equal(h.blobs.size, 0);
    old.lateMessage({ data: { type: 'progress', progress: 99 } }); old.lateMessage({ data: { type: 'done', analysis: { totalLines: 99 } } }); old.lateError({ message: 'late' });
    assert.equal(survivor.analysis.totalLines, 3); assert.equal(survivor.rows.length, 3);
  });
}
