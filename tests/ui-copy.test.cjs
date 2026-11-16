'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const artifact of ['src/index.template.html','jsonl-viewer.html']){
  const html=fs.readFileSync(path.join(root,artifact),'utf8');
  test(artifact+': short copy and matching translations',()=>{
    assert.match(html,/<h1 id="heroTitle" data-i18n="introTitle">JSONL \/ NDJSONを開く<\/h1>/);
    assert.match(html,/<p data-i18n="lead">データの中身や、読み取れない行を確認できます。<\/p>/);
    assert.match(html,/introTitle:'Open JSONL \/ NDJSON'/);
    assert.match(html,/lead:'Browse records and find lines that cannot be parsed\.'/);
    assert.match(html,/dropTitle:'Drop files here'/);
    assert.match(html,/dropBody:'Or choose a file with the button below\.'/);
    assert.doesNotMatch(html,/helpCancel|helpSuccessor/);
    assert.match(html,/<p class="help-version" id="helpVersion"><\/p>/);
  });
  test(artifact+': header typography and local badge responsive',()=>{
    assert.match(html,/\.brand-name \{[^}]*font-size:\s*16px;/);
    assert.match(html,/\.brand-name \{ font-size: 14px; \}/);
    assert.match(html,/#brandName \{[^}]*font-family:\s*Arial,Helvetica,sans-serif;[^}]*font-size:\s*16px;[^}]*font-weight:\s*700;/);
    assert.match(html,/#brandName \{ font-size: 14px; \}/);
    assert.match(html,/body\[data-mobile-page="fields"\] \.page-intro/);
    assert.match(html,/body\[data-mobile-page="data"\] \.page-intro/);
    assert.match(html,/document\.body\.dataset\.mobilePage=page;/);
    assert.match(html,/-webkit-text-size-adjust:\s*100%/);
    assert.match(html,/@media \(max-width: 620px\) \{[\s\S]*?\.local-badge \{ display: none; \}/);
    assert.match(html,/<div class="local-badge">/);
    assert.match(html,/localBadge:'Fully local processing'/);
    assert.match(html,/connect-src 'none'/);
  });
}
test('release triggers only after merge with separated publish permission',()=>{
  const yaml=fs.readFileSync(path.join(root,'.github/workflows/release-on-merge.yml'),'utf8');
  assert.match(yaml,/pull_request_target:\s*\n\s*types:\s*\[closed\]/);
  assert.match(yaml,/github\.event\.pull_request\.merged == true/);
  assert.match(yaml,/github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(yaml,/persist-credentials:\s*false/);
  assert.match(yaml,/contents:\s*read/);
  assert.match(yaml,/contents:\s*write/);
  assert.match(yaml,/scripts\/check-repository\.ps1/);
  assert.match(yaml,/git merge-base --is-ancestor/);
  assert.match(yaml,/git tag -a/);
  assert.match(yaml,/gh release create/);
  assert.match(yaml,/SHA256SUMS\.txt/);
  assert.match(yaml,/--verify-tag/);
});
