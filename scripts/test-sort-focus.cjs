const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const { gunzipSync } = require('node:zlib');
const targets = process.argv.slice(2);
if (!targets.length) targets.push(path.join(__dirname, '../src/index.template.html'));
for (const target of targets) {
let source = fs.readFileSync(target, 'utf8');
const payload = source.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
if (payload) source = gunzipSync(Buffer.from(payload[1].replace(/\s/g, ''), 'base64')).toString('utf8');
function extract(name) {
  const match = new RegExp('^      (?:async )?function ' + name + '\\(', 'm').exec(source);
  assert(match, `Production function ${name} exists`);
  const rest = source.slice(match.index + match[0].length);
  const next = /\n      (?:async )?function |\n      const |\n      \/\//.exec(rest);
  return source.slice(match.index, next ? match.index + match[0].length + next.index : source.indexOf('\n      $(', match.index));
}
// Run the actual render/sort handlers. This minimal DOM records focus on newly
// rendered buttons; native Tab/Enter/Space behavior is verified in Chromium.
function harness() {
  const nodes = new Map();
  let document;
  function element(tag = 'div') {
    const listeners = new Map();
    const node = {tagName:tag.toUpperCase(),children:[],dataset:{},style:{},className:'',textContent:'',
      append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children=children; },
      addEventListener(event, fn) { listeners.set(event, fn); }, click() { return listeners.get('click')?.(); },
      focus() { document.activeElement=this; },
      querySelector(selector) { const index=selector.match(/^\[data-sort-index="(\d+)"\]$/)?.[1]; return descendants(this).find(child => child.dataset.sortIndex === index) || null; }
    };
    node.classList={add(...names) { node.className += ' '+names.join(' '); }};
    return node;
  }
  document={body:element('body'),activeElement:null,createElement:element};
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const context=vm.createContext({document,$:get,state:{language:'en'},formatNumber:String,t:key=>key,cellText:String,openCell(){}});
  context.renderData=file=>context.renderTable(file);
  vm.runInContext(['visibleFields','valueForField','sortRows','cellNode','renderTable','cycleSort'].map(extract).join('\n'),context);
  return {api:context,document,get};
}
function descendants(node) { return node.children.flatMap(child=>[child,...descendants(child)]); }
function fixture() {
  return {fields:[{index:0,name:'amount[\"quoted\"]'}],hiddenFields:new Set(),sort:null,
    rows:[3,1,2].map((value,index)=>({lineNumber:index+1,valid:true,record:{'amount[\"quoted\"]':value}}))};
}
test(`${target}: sort activation retains the replaced header focus through ascending, descending and source order`,()=>{
  const h=harness(),file=fixture();h.api.renderTable(file);
  const buttons=()=>descendants(h.get('#dataTableWrap')).filter(node=>node.className.split(/\s+/).includes('sort-button'));
  for(const [direction,order] of [['asc',[2,3,1]],['desc',[1,3,2]],[null,[1,2,3]]]) {
    const prior=buttons()[0];prior.focus();prior.click();
    assert.notEqual(buttons()[0],prior,'render replaces the header button');
    assert.equal(h.document.activeElement,buttons()[0],'focus returns to the same field button');
    assert.equal(file.sort?.direction ?? null,direction);
    assert.deepEqual(Array.from(h.api.sortRows(file,file.rows),row=>row.lineNumber),order);
    assert.deepEqual(file.rows.map(row=>row.lineNumber),[1,2,3],'source row order stays unchanged');
  }
});
test(`${target}: nonfocused sort activation does not steal another control focus`,()=>{
  const h=harness(),file=fixture();h.api.renderTable(file);const other=h.get('#columnsButton');other.focus();
  descendants(h.get('#dataTableWrap')).find(node=>node.className==='sort-button').click();
  assert.equal(h.document.activeElement,other);
});

}
