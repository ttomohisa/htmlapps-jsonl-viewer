'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const fixture=[
  '{"alpha":1,"beta":"x","sharedFlag":true}',
  '{"alpha":2,"beta":"y","price":20,"__value":"real"}',
  '[1,2,3]',
  'not JSON'
].join('\n');
const variants=[
  {file:'dist/index.html',lang:'ja',width:1360,height:900},
  {file:'dist/index.html',lang:'ja',width:320,height:640},
  {file:'dist/index.html',lang:'en',width:393,height:700},
  {file:'dist/index.self-extract.html',lang:'en',width:360,height:640},
  {file:'jsonl-viewer.html',lang:'ja',width:1360,height:900}
];
(async()=>{
  const browser=await chromium.launch();
  try{
    for(const cfg of variants){
      const name=cfg.file+' '+cfg.lang+' '+cfg.width;
      const context=await browser.newContext({locale:cfg.lang,viewport:{width:cfg.width,height:cfg.height},acceptDownloads:true});
      const page=await context.newPage(),errors=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
      try{
        await page.goto(pathToFileURL(path.resolve(cfg.file)).href);
        if(await page.locator('html').getAttribute('lang')!==cfg.lang)await page.locator('#languageButton').click();
        await page.locator('#fileInput').setInputFiles({name:'sample.jsonl',mimeType:'text/plain',buffer:Buffer.from(fixture)});
        await page.waitForFunction(()=>document.querySelectorAll('#fieldsTableWrap tbody tr').length>=5);
        await page.waitForFunction(()=>!document.querySelector('#downloadCsvButton').disabled);
        const total=await page.locator('#fieldsTableWrap tbody tr').count();
        assert.ok(total>=5,name+': field count');
        const phone=cfg.width<=620;
        if(phone)await page.locator('[data-mobile-target="fields"]').click();
        assert.equal(await page.locator('#fieldNameFilter').isVisible(),true,name+': field name filter');
        await page.locator('#fieldNameFilter').fill('ALP');
        assert.equal(await page.locator('#fieldsTableWrap tbody tr:not([hidden])').count(),1,name+': case insensitive match');
        assert.match(await page.locator('#fieldsFilterCount').textContent(),new RegExp('1.*'+total),name+': filtered count');
        await page.locator('#fieldNameFilter').fill('missing-fields-query');
        assert.equal(await page.locator('#fieldsTableWrap tbody tr:not([hidden])').count(),0,name+': no matching rows');
        assert.equal(await page.locator('#fieldsFilterEmpty').isVisible(),true,name+': field empty state');
        await page.locator('#fieldNameFilter').fill('');
        assert.equal(await page.locator('#fieldsTableWrap tbody tr:not([hidden])').count(),total,name+': clear restores all rows');
        assert.equal(await page.locator('#fieldsFilterEmpty').isVisible(),false,name+': clears empty state');
        if(phone)await page.locator('[data-mobile-target="data"]').click();
        const toggle=page.locator('#mobileExportToggle');
        assert.equal(await toggle.isVisible(),phone,name+': phone-only export toggle');
        assert.equal(await page.locator('#exportPanel').isVisible(),!phone,name+': default export visibility');
        if(phone){
          assert.equal(await toggle.getAttribute('aria-expanded'),'false',name+': collapsed ARIA');
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'),'true',name+': expanded ARIA');
          assert.equal(await page.locator('#exportPanel').isVisible(),true,name+': expanded export panel');
        }
        await page.locator('#columnsButton').click();
        const search=page.locator('#columnNameFilter');
        assert.equal(await search.isVisible(),true,name+': column search visible');
        await search.fill('aLp');
        assert.equal(await page.locator('#columnsList .column-option:not([hidden])').count(),1,name+': column filter matching');
        const alpha=page.locator('#columnsList .column-option:not([hidden]) input[type="checkbox"]');
        assert.equal(await alpha.isChecked(),true,name+': alpha initially checked');
        await alpha.uncheck();
        await search.fill('beta');
        const beta=page.locator('#columnsList .column-option:not([hidden]) input[type="checkbox"]');
        assert.equal(await beta.count(),1,name+': beta present');
        assert.equal(await beta.isChecked(),true,name+': beta state preserved');
        await search.fill('not-found');
        assert.equal(await page.locator('#columnFilterEmpty').isVisible(),true,name+': column empty state');
        await page.locator('#applyColumnsButton').click();
        const headers=await page.locator('#dataTableWrap thead th').allTextContents();
        assert.equal(headers.some(x=>x.includes('alpha')),false,name+': alpha hidden after applying filtered selection');
        assert.equal(headers.some(x=>x.includes('beta')),true,name+': beta remains visible');
        await page.locator('#columnsButton').click();
        assert.equal(await search.inputValue(),'',name+': dialog search reset on reopen');
        await search.fill('alpha');
        assert.equal(await page.locator('#columnsList .column-option:not([hidden]) input').isChecked(),false,name+': hidden checkbox persists');
        await search.fill('beta');
        await page.locator('#showAllColumnsButton').click();
        await page.locator('#applyColumnsButton').click();
        const restored=await page.locator('#dataTableWrap thead th').allTextContents();
        assert.equal(restored.some(x=>x.includes('alpha')),true,name+': show all applies to hidden search results');
        await page.locator('#outputFilename').fill('filter-demo');
        const downloading=page.waitForEvent('download');
        await page.locator('#downloadCsvButton').click();
        const download=await downloading;
        assert.equal(download.suggestedFilename(),'filter-demo.csv',name+': export filename');
        const csv=fs.readFileSync(await download.path(),'utf8');
        assert.match(csv,/"?alpha"?,/i,name+': export includes unfiltered alpha header');
        assert.match(csv,/beta/i,name+': export includes beta');
        assert.match(csv,/not JSON/,name+': invalid source line retained');
        if(phone){
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'),'false');
          assert.equal(await page.locator('#exportPanel').isVisible(),false,name+': collapse hides panel');
          await toggle.click();
          assert.equal(await page.locator('#outputFilename').inputValue(),'filter-demo',name+': filename survives collapse');
          await page.locator('#languageButton').click();
          assert.equal(await toggle.getAttribute('aria-expanded'),'true',name+': language toggle keeps expansion');
          assert.equal(await page.locator('#exportPanel').isVisible(),true,name+': language toggle keeps panel');
          assert.equal(await page.locator('#mobileExportToggle span').textContent(),
            cfg.lang==='ja'?'Copy & save':'コピー・保存',name+': translation');
        }
        // Every field must come from the JSON record, never its Object prototype.
        await page.locator('#fileInput').setInputFiles({name:'prototype.jsonl',mimeType:'text/plain',buffer:Buffer.from(
          '{"toString":"owned","constructor":"field","__proto__":"own proto"}\n{"only":1}\n'
        )});
        await page.waitForFunction(()=>document.querySelector('#dataTableWrap').textContent.includes('owned'));
        await page.waitForFunction(()=>!document.querySelector('#downloadCsvButton').disabled);
        const protoCsvDownload=page.waitForEvent('download');
        await page.locator('#downloadCsvButton').click();
        const protoCsv=fs.readFileSync(await (await protoCsvDownload).path(),'utf8');
        const protoLines=protoCsv.replace(/^\uFEFF/,'').split('\r\n');
        assert.ok(protoLines.length>=3,name+': prototype CSV');
        assert.match(protoLines[0],/toString/,name+': prototype-named column present');
        assert.match(protoLines[0],/constructor/,name+': constructor-named column present');
        assert.match(protoLines[0],/__proto__/,name+': proto-named column present');
        assert.ok(!protoLines[2].includes('function '),name+': missing field not filled with native function');
        assert.ok(!protoLines[2].includes('[object Object]'),name+': missing field not filled with prototype');
        const protoHeaders=protoLines[0].split(',');
        const protoCells=protoLines[2].split(',');
        for(const field of ['toString','constructor','__proto__'])assert.equal(protoCells[protoHeaders.indexOf(field)],'',name+': missing '+field+' stays blank');
        assert.equal(protoCells[protoHeaders.indexOf('only')],'1',name+': own field stays present');

        const mobileClose=page.locator('#mobileCloseFileButton');
        assert.equal(await mobileClose.isVisible(),phone,name+': mobile close visible only on phones');
        if(phone){
          assert.match(await mobileClose.getAttribute('aria-label'),/prototype\.jsonl/,name+': filename in accessible close label');
          await mobileClose.click();
          assert.equal(await page.locator('#fileSelect option').count(),1,name+': current file closed');
          assert.match(await page.locator('#fileSelect option:checked').textContent(),/sample\.jsonl/,name+': successor activated');
          await mobileClose.click();
          assert.equal(await page.locator('#fileManager').isVisible(),false,name+': last file close returns empty');
          assert.equal(await page.locator('#emptyState').isVisible(),true,name+': empty state after close');
          assert.equal(await page.locator('.page-intro').isVisible(),true,name+': hero restored on empty state');
          assert.equal(await page.locator('body').getAttribute('data-mobile-page'),'overview',name+': mobile state reset after last file closes');
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+': no horizontal overflow');
        assert.deepEqual(errors,[],name+': JS errors');
        assert.deepEqual(requests,[],name+': network requests');
        console.log('PASS '+name+': field filtering, column-selection retention, mobile export, language, CSV, offline');
      }finally{await context.close();}
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
