const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const fixture = (name, body) => ({name, mimeType:'application/json', buffer:Buffer.from(body)});
(async () => {
  const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
  try {
    for(const artifact of ['dist/index.html','dist/index.self-extract.html']) {
      const context=await browser.newContext({viewport:{width:1360,height:900},locale:'en-US'});
      const page=await context.newPage(),errors=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await context.route(/^https?:/,r=>{requests.push(r.request().url());return r.abort();});
      await page.goto(pathToFileURL(path.resolve(__dirname,'..',artifact)).href);
      await page.locator('#fileInput').setInputFiles([
        fixture('mixed.ndjson','\uFEFF{"name":"alpha","value":1}\r\n{"name":"beta","value":"two"}\r\ninvalid\r\n\r\n[1,2]\r\n'),
        fixture('empty.jsonl','')
      ]);
      await page.waitForFunction(()=>document.querySelector('#dataTableWrap').textContent.includes('alpha'));
      assert.equal(await page.locator('#dataTableWrap tbody tr').count(),5);
      assert.match(await page.locator('#fieldsTableWrap').textContent(),/Mixed/);
      await page.locator('#recordModeButton').click();
      assert.match(await page.locator('#recordList').textContent(),/alpha/);
      await page.locator('#tableModeButton').click();
      await page.locator('#outputFilename').fill('review-custom');
      const downloading=page.waitForEvent('download');await page.locator('#downloadCsvButton').click();
      const download=await downloading;assert.equal(download.suggestedFilename(),'review-custom.csv');
      const csv=fs.readFileSync(await download.path(),'utf8');assert.match(csv,/__line/);assert.match(csv,/alpha/);assert.match(csv,/invalid/);
      await page.locator('.file-tab').nth(1).click();
      await page.waitForFunction(()=>document.querySelector('#statusBanner').textContent.includes('no lines'));
      assert.equal(await page.locator('#dataTableWrap tbody tr').count(),0);
      const large=Array.from({length:12000},(_,i)=>JSON.stringify({index:i,text:'chunk-'.repeat(30)})).join('\n');
      await page.locator('#fileInput').setInputFiles(fixture('large.jsonl',large));
      await page.waitForFunction(()=>document.querySelector('#summaryGrid').textContent.includes('12,000'));
      await page.locator('#pageSizeSelect').selectOption('50');
      await page.waitForFunction(()=>document.querySelectorAll('#dataTableWrap tbody tr').length===50);
      await page.locator('#nextButton').click();
      await page.waitForFunction(()=>document.querySelector('#dataTableWrap tbody tr td').textContent==='51');
      await page.locator('#languageButton').click();assert.equal(await page.locator('html').getAttribute('lang'),'ja');
      await page.locator('#helpButton').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#helpDialog').evaluate(x=>x.open),true);await page.keyboard.press('Escape');
      await page.setViewportSize({width:320,height:700});await page.locator('[data-mobile-target="data"]').click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.reload();assert.equal(await page.locator('.file-tab').count(),0);assert.equal(await page.locator('html').getAttribute('lang'),'ja');
      assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
      await context.close();console.log(`PASS ${artifact}: real Worker, BOM/CRLF, invalid/blank/empty, >2 MiB paging, CSV filename/content, EN/JA, keyboard dialog, 320px, reload, no errors/network`);
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
