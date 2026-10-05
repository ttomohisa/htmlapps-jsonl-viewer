const assert = require('node:assert/strict');
const path = require('node:path');
const { File } = require('node:buffer');
const { test: runTest } = require('node:test');
const { harness, file, descendants, deferReads } = require('./test-file-lifecycle.cjs');
const test = (name, fn) => runTest(name, { timeout: 5000 }, fn);
const cards = h => h.node('#recordList').children;
const buttons = card => descendants(card).filter(n => n.tagName === 'button');
function copyButton(h, index = 0) { const button = buttons(cards(h)[index])[0]; assert.ok(button, 'Valid record must have a Copy JSON button'); return button; }
async function ready(artifact, text = '"hello"\n', opts = {}) {
  const h = harness(artifact, opts); await h.api.addFiles([file('synthetic.jsonl', text)]);
  await h.node('#recordModeButton').click(); return h;
}
const rawRecords = ['{"id":1,"text":"hello"}', '[1,"two",null]', 'null', 'false', 'true', '0', '""', '"null"', '"line\\nbreak"', '"quote\\\"slash\\\\"', '{\"a\":1,\r\"b\":2}', '9007199254740993', '-0', '1.2300e+25', '1e400', '"\\u65e5\\u672c"', ' \t{"same":1,"same":2,"z":-0} \t'];
const artifacts = process.argv.slice(2);
for (const artifact of artifacts.length ? artifacts : [path.join(__dirname, '..', 'src/index.template.html')]) {
  for (const raw of ['"hello"', '""', '"null"', '"line\\nbreak"', '"quote\\\"slash\\\\"', 'null', 'false', '0', '{"s":"hello"}', '["hello",null,false,0]']) {
    test(`${artifact}: Record display retains JSON semantics for ${raw}`, async () => {
      const h = await ready(artifact, `${raw}\n`);
      const pre = descendants(cards(h)[0]).find(n => n.tagName === 'pre');
      assert.equal(pre.textContent, JSON.stringify(JSON.parse(raw), null, 2));
    });
  }
  test(`${artifact}: each valid record copies exact raw text with no newline or extra reads`, async () => {
    const h = await ready(artifact, '\uFEFF' + rawRecords.join('\r\n') + '\r\n');
    const f = h.api.state.files[0], before = JSON.stringify(f.rows);
    f.file = { ...f.file, slice() { assert.fail('Copy must not reread the file'); } };
    for (let i = 0; i < rawRecords.length; i++) {
      await copyButton(h, i).click(); assert.equal(h.copies.at(-1), rawRecords[i]);
    }
    await copyButton(h, rawRecords.length - 1).click();
    assert.equal(h.copies.length, rawRecords.length + 1); assert.equal(JSON.stringify(f.rows), before);
    assert.equal(h.node('#appToastMessage').textContent, `Copied JSON from line ${rawRecords.length}.`);
    assert.equal(h.api.buildCurrentJsonl(f), rawRecords.join('\n'));
  });
  test(`${artifact}: valid-only accessible buttons sit outside disclosure summaries in both languages`, async () => {
    const h = harness(artifact); const input = new File([new Uint8Array([0xff, 10]), 'not-json\n\n"safe"\n'], 'review.jsonl');
    await h.api.addFiles([input]); await h.node('#recordModeButton').click();
    assert.equal(cards(h).length, 4);
    for (let i = 0; i < 3; i++) assert.equal(buttons(cards(h)[i]).length, 0);
    const button = copyButton(h, 3), summary = cards(h)[3].children.find(n => n.tagName === 'summary');
    assert.equal(button.type, 'button'); assert.equal(button.textContent, 'Copy JSON'); assert.equal(button['aria-label'], 'Copy JSON from line 4');
    assert.equal(descendants(summary).includes(button), false);
    const openBefore = cards(h)[3].open; await button.click(); assert.equal(cards(h)[3].open, openBefore);
    await h.node('#languageButton').click(); const japanese = copyButton(h, 3);
    assert.equal(japanese.textContent, 'JSONをコピー'); assert.equal(japanese['aria-label'], '行 4 のJSONをコピー');
    await japanese.click(); assert.equal(h.node('#appToastMessage').textContent, '行 4 のJSONをコピーしました。');
  });
  test(`${artifact}: Cell Inspector strings keep their existing raw display and copy`, async () => {
    const value = 'line\nbreak"\\'; const h = await ready(artifact, JSON.stringify(value) + '\n');
    await h.node('#tableModeButton').click();
    await descendants(h.node('#dataTableWrap')).find(n => n.className === 'cell-button').click();
    assert.equal(h.node('#cellValue').textContent, value); await h.node('#copyCellButton').click(); assert.equal(h.copies[0], value);
  });
  test(`${artifact}: detached buttons cannot copy after switching away and back or closing a file`, async () => {
    const h = await ready(artifact); const a = h.api.state.files[0], old = copyButton(h);
    await h.api.addFiles([file('other.jsonl', '{"other":2}\n')]); await old.click(); assert.equal(h.copies.length, 0);
    await h.api.activateFile(a.id); await old.click(); assert.equal(h.copies.length, 0);
    const current = copyButton(h); await current.click(); assert.equal(h.copies.length, 1);
    await h.api.removeFile(a.id); await current.click(); assert.equal(h.copies.length, 1);
  });
  test(`${artifact}: detached buttons cannot copy during or after page replacement`, async () => {
    const h = await ready(artifact, '1\n2\n3\n'), f = h.api.state.files[0], old = copyButton(h), reads = deferReads(f);
    f.pageSize = 1; f.page = 2; const pending = h.api.readPage(f);
    await old.click(); assert.equal(h.copies.length, 0);
    await reads.requests[0].resolve(); await pending; await old.click(); assert.equal(h.copies.length, 0);
    await copyButton(h).click(); assert.deepEqual(h.copies, ['2']);
    const current = copyButton(h); const failure = h.api.readPage(f); reads.requests[1].reject(new Error('Synthetic read failure')); await failure;
    await current.click(); assert.deepEqual(h.copies, ['2']); assert.equal(h.node('#recordList').textContent, 'No lines to display.');
  });
  test(`${artifact}: record actions require readiness, exact row, page size and page identity`, async () => {
    const h = await ready(artifact), f = h.api.state.files[0], button = copyButton(h);
    for (const [key, value] of [['loading', true], ['analyzing', true], ['error', 'failed'], ['dataError', 'failed'], ['analysis', null], ['page', 2], ['pageSize', 50]]) {
      const original = f[key]; f[key] = value; await button.click(); assert.equal(h.copies.length, 0, key); f[key] = original;
    }
    const rows = f.rows; f.rows = rows.map(row => ({ ...row })); await button.click(); assert.equal(h.copies.length, 0);
    f.rows = rows; rows[0].valid = false; await button.click(); assert.equal(h.copies.length, 0);
    rows[0].valid = true; await button.click(); assert.deepEqual(h.copies, ['"hello"']);
  });
  test(`${artifact}: stale clipboard success cannot report in a new file or after returning`, async () => {
    let resolve; const h = await ready(artifact, '"hello"\n', { writeText: () => new Promise(r => { resolve = r; }) });
    const a = h.api.state.files[0], pending = copyButton(h).click(); assert.equal(h.copies.length, 1);
    await h.api.addFiles([file('next.jsonl', '2\n')]); await h.api.activateFile(a.id);
    h.node('#appToastMessage').textContent = 'Newer message'; resolve(); await pending; assert.equal(h.node('#appToastMessage').textContent, 'Newer message');
  });
  test(`${artifact}: stale clipboard rejection does not start a fallback write or report failure`, async () => {
    let reject; const h = await ready(artifact, '"hello"\n', { writeText: () => new Promise((_, r) => { reject = r; }) });
    const pending = copyButton(h).click(); await h.api.readPage(h.api.state.files[0]); h.node('#appToastMessage').textContent = 'Current message';
    reject(new Error('Permission denied')); await pending;
    assert.equal(h.fallbackCopies.length, 0); assert.equal(h.node('#appToastMessage').textContent, 'Current message');
  });
  test(`${artifact}: clipboard fallback copies exact text and false or throwing failures never report success`, async () => {
    for (const outcome of ['success', 'false', 'throw']) {
      const raw = '  {"big":9007199254740993,"x":-0}  ';
      const h = await ready(artifact, raw + '\n', { writeText: async () => { throw new Error('Unavailable clipboard'); }, fallbackResult: outcome === 'success', fallbackError: outcome === 'throw' ? new Error('Fallback failed') : null });
      await copyButton(h).click(); assert.deepEqual(h.fallbackCopies, [raw]);
      assert.equal(h.node('#appToastMessage').textContent, outcome === 'success' ? 'Copied JSON from line 1.' : 'Could not copy.');
    }
  });
  test(`${artifact}: lossy textarea fallback refuses raw JSON with embedded carriage returns`, async () => {
    const raw = '{"a":1,\r"b":2}';
    const h = await ready(artifact, raw + '\n', { writeText: async () => { throw new Error('Clipboard unavailable'); } });
    await copyButton(h).click();
    assert.deepEqual(h.copies, [raw]); assert.equal(h.fallbackCopies.length, 0);
    assert.equal(h.node('#appToastMessage').textContent, 'Could not copy.');
  });
  test(`${artifact}: pending copy feedback is suppressed when its row is no longer current`, async () => {
    let resolve; const h = await ready(artifact, '1\n2\n', { writeText: () => new Promise(r => { resolve = r; }) });
    const f = h.api.state.files[0], pending = copyButton(h).click(); f.rows = f.rows.slice(1); h.node('#appToastMessage').textContent = 'Keep current';
    resolve(); await pending; assert.equal(h.node('#appToastMessage').textContent, 'Keep current');
  });
}
