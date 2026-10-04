const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

// Delay only the first real Worker so closing an active scan is deterministic.
// Missing cancellation settlement must prevent the next file's visible result.
async function trackWorkers(page, delayFirst) {
  await page.addInitScript(delay => {
    window.workerAudit = { workers: [], urls: new Set() };
    const audit = window.workerAudit;
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); audit.urls.add(url); return url; };
    URL.revokeObjectURL = url => { audit.urls.delete(url); revoke(url); };
    const RealWorker = Worker;
    window.Worker = class extends RealWorker {
      constructor(url) { super(url); audit.workers.push(this); }
      postMessage(message) {
        if (delay && this === audit.workers[0]) {
          this.lateMessage = this.onmessage;
          this.lateError = this.onerror;
        } else super.postMessage(message);
      }
      terminate() { this.terminated = true; super.terminate(); }
    };
  }, delayFirst);
}
const file = (name, body) => ({ name, mimeType: 'application/json', buffer: Buffer.from(body) });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  try {
    for (const artifact of ['dist/index.html', 'dist/index.self-extract.html']) {
      const context = await browser.newContext();
      const errors = [], requests = [];
      context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
      await context.route(/^https?:/, route => { requests.push(route.request().url()); return route.abort(); });
      const page = await context.newPage();
      await trackWorkers(page, true);
      await page.goto(pathToFileURL(path.resolve(__dirname, '..', artifact)).href);
      await page.locator('#fileInput').setInputFiles([
        file('active.jsonl', '{"removed":1}\n'),
        file('queued.jsonl', '{"skip":1}\n'),
        file('remaining.jsonl', '{"survivor":"batch-continues"}\n')
      ]);
      await page.waitForFunction(() => window.workerAudit.workers.length === 1);
      await page.locator('.file-tab-close').nth(1).click();
      await page.locator('.file-tab-close').first().click();
      await page.waitForFunction(() => document.querySelector('#dataTableWrap')?.textContent.includes('batch-continues'), null, { timeout: 3000 });
      assert.equal(await page.locator('.file-tab').count(), 1);
      const before = await page.locator('#summaryGrid').textContent();
      await page.evaluate(() => {
        const first = window.workerAudit.workers[0];
        first.lateMessage({ data: { type: 'progress', progress: 99 } });
        first.lateMessage({ data: { type: 'done', analysis: { totalLines: 999999 } } });
        first.lateError({ message: 'late cancelled worker error' });
      });
      assert.equal(await page.locator('#summaryGrid').textContent(), before);
      assert.deepEqual(await page.evaluate(() => ({ workers: workerAudit.workers.length, terminated: workerAudit.workers.every(w => w.terminated), urls: workerAudit.urls.size })), { workers: 2, terminated: true, urls: 0 });
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, []);
      await context.close();
      console.log(`PASS ${artifact}: active cancellation continues batch, queued removal skipped, stale messages ignored, URLs released`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
