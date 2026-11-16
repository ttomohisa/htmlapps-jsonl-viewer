'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
for(const location of ['src/index.template.html','jsonl-viewer.html']){
  const html=fs.readFileSync(path.resolve(__dirname,'..',location),'utf8');
  test(location+': field search and responsive export contract',()=>{
    assert.match(html,/id="fieldNameFilter"[^>]+type="search"|id="fieldNameFilter"/);
    assert.match(html,/id="columnNameFilter"/);
    assert.match(html,/data-i18n-placeholder="fieldSearchPlaceholder"/);
    assert.match(html,/fieldSearchPlaceholder:'Search field names'/);
    assert.match(html,/fieldSearchPlaceholder:'フィールド名で検索'/);
    assert.match(html,/fieldSearchEmpty:'No matching fields\.'/);
    assert.match(html,/fieldSearchCount:'\{shown\} of \{total\} fields'/);
    assert.match(html,/function fieldNameMatches\(name,query\)/);
    assert.match(html,/function updateFieldsFilter\(fileState\)/);
    assert.match(html,/function updateColumnsFilter\(\)/);
    assert.match(html,/row\.dataset\.fieldName=field\.name/);
    assert.match(html,/label\.dataset\.fieldName=field\.name/);
    assert.match(html,/fs\.fieldQuery=event\.target\.value/);
    assert.match(html,/\.column-option\[hidden\] \{ display: none; \}/);
    assert.match(html,/id="mobileExportToggle"[^>]*aria-expanded="false"[^>]*aria-controls="exportPanel"/);
    assert.match(html,/id="exportPanel"/);
    assert.match(html,/\.export-section:not\(\.expanded\) \.export-panel \{ display: none; \}/);
    assert.match(html,/section\.classList\.toggle\('expanded'\)/);
    assert.match(html,/mobileExportTitle:'コピー・保存'/);
    assert.match(html,/mobileExportTitle:'Copy & save'/);
  });
  test(location+': filter helper uses literal names without regexp or data mutation',()=>{
    const match=html.match(/function fieldNameMatches\(name,query\)\{[^\n]+\}/);
    assert.ok(match,'fieldNameMatches missing');
    const matching=new Function(match[0]+';return fieldNameMatches;')();
    assert.equal(matching('CustomerID','customer'),true);
    assert.equal(matching('alpha','ALP'),true);
    assert.equal(matching('data[0].x','[0]'),true);
    assert.equal(matching('alpha','beta'),false);
    assert.equal(matching('__value','__value'),true);
    assert.equal(matching('test',''),true);
  });
}
