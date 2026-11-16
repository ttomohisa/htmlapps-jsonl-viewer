'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/index.template.html'), 'utf8');
function between(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Unable to locate source fragment: ' + start);
  return source.slice(a, b);
}
const api = new Function(
  "const state={language:'en'};const renderData=()=>{};\n"
  + between('class JsonlExactInteger', 'function summarizeValue')
  + between('function visibleFields', 'function cellNode')
  + between('function csvEscape', 'function normalizedFilenameBase')
  + "\nreturn {parseJsonPreservingIntegers,normalizeRecordValue,cellText,prettyValue,valueForField,sortRows,buildCurrentCsv,csvEscape,csvHeaders,typeOfValue};"
)();

function row(raw, lineNumber) {
  const value = api.parseJsonPreservingIntegers(raw);
  return {valid: true, lineNumber, raw, value, record: api.normalizeRecordValue(value)};
}
const big = row('{"id":9007199254740993,"nested":[-9007199254740995,{"n":999999999999999999999999999999}],"text":"9007199254740993"}', 1);
assert.equal(api.cellText(big.value.id), '9007199254740993');
assert.equal(api.cellText(big.value.nested), '[-9007199254740995,{"n":999999999999999999999999999999}]');
assert.equal(api.typeOfValue(big.value.id), 'integer');
assert.match(api.prettyValue(big.value), /"id": 9007199254740993/);
assert.equal(big.value.text, '9007199254740993');
assert.equal(api.cellText(row('9007199254740993', 1).value), '9007199254740993');
assert.equal(api.cellText(row('{"n":3.5}', 1).value.n), '3.5');
assert.equal(api.cellText(row('{"n":-42}', 1).value.n), '-42');
assert.throws(() => api.parseJsonPreservingIntegers('{"x":01}'), SyntaxError);

const fields = ['id', 'nested', 'text'].map((name, index) => ({name, index, virtual:false}));
let fileState = {fields, rows:[big], hiddenFields:new Set(), sort:null};
assert.ok(api.buildCurrentCsv(fileState).includes('9007199254740993'));
assert.ok(api.buildCurrentCsv(fileState).includes('999999999999999999999999999999'));
const smaller = row('{"id":9007199254740992}', 2);
fileState.rows = [big, smaller];
fileState.sort={fieldName:'id',fieldIndex:0,direction:'asc'};
assert.deepEqual(api.sortRows(fileState,fileState.rows).map(x=>x.lineNumber),[2,1]);
fileState.sort.direction='desc';
assert.deepEqual(api.sortRows(fileState,fileState.rows).map(x=>x.lineNumber),[1,2]);

const unsafe = row('{"__line":"=1+1","__status":"+cmd","__raw":"-cmd","field:__line":"@cmd","value":"  =SUM(1,1)","negative":-5}',1);
const collidingFields=['__line','__status','__raw','field:__line','value','negative'].map((name,index)=>({name,index,virtual:false}));
const headers=api.csvHeaders(collidingFields);
assert.equal(new Set(['__line','__status','__raw',...headers]).size,headers.length+3);
const csv=api.buildCurrentCsv({fields:collidingFields,rows:[unsafe],hiddenFields:new Set()});
assert.match(csv,/field:__line/);
assert.match(csv,/'=1\+1/);
assert.match(csv,/'\+cmd/);
assert.match(csv,/'-cmd/);
assert.match(csv,/'@cmd/);
assert.match(csv,/'  =SUM/);
assert.match(csv,/,-5(?:\r\n|$)/); // Numeric -5 remains a numeric CSV cell
assert.equal(api.csvEscape('\t=2'), "'\t=2"); // Tab-prefixed formula becomes inert text
assert.equal(api.csvEscape('normal'), 'normal');
assert.equal(api.csvEscape(12), '12');

const objectValue=row('{"__value":"actual"}',1), primitive=row('42',2);
const real={name:'__value',index:0,virtual:false}, virtual={name:'__value',index:1,virtual:true};
assert.equal(api.valueForField(objectValue,real),'actual');
assert.equal(api.valueForField(objectValue,virtual),undefined);
assert.equal(api.valueForField(primitive,real),undefined);
assert.equal(api.valueForField(primitive,virtual),42);
assert.deepEqual(api.csvHeaders([real,virtual]),['__value','__value (top-level)']);
assert.match(source,/event\.target===tab&&\(event\.key==='Enter'/);
const ordinary = row('{"id":1}',3);
for (const name of ['toString','constructor','__proto__','valueOf','hasOwnProperty']) {
  const field={name,index:0,virtual:false};
  assert.equal(api.valueForField(ordinary,field),undefined, 'Missing '+name+' must not resolve a prototype value');
}
const special = row('{"toString":"own text","constructor":"own constructor","__proto__":"own proto"}',4);
for (const [name,expected] of [['toString','own text'],['constructor','own constructor'],['__proto__','own proto']]) {
  assert.equal(api.valueForField(special,{name,index:0,virtual:false}),expected);
}
const specialFields=['toString','constructor','__proto__'].map((name,index)=>({name,index,virtual:false}));
const inheritedCsv=api.buildCurrentCsv({fields:specialFields,rows:[ordinary],hiddenFields:new Set()});
assert.equal(inheritedCsv.split('\r\n')[1],'3,valid,,,,', 'CSV must leave missing prototype-named fields empty');

async function workerStatistics() {
  const workerDeclaration=between('function workerSource()', 'async function analyzeFile(');
  const workerCode=new Function('const CHECKPOINT_INTERVAL=1000, MAX_ISSUES_STORED=1000, MAX_FIELDS=500;\n'+workerDeclaration+'\nreturn workerSource();')();
  const emitted=[],scope={TextDecoder,Uint8Array,self:{postMessage:m=>emitted.push(m)}};
  vm.runInNewContext(workerCode,scope);
  await scope.self.onmessage({data:{file:new Blob(['{"__value":"actual"}\n42\n{"__value":7}\n'])}});
  const result=emitted.find(x=>x.type==='done');
  assert.ok(result,'Worker must complete');
  assert.equal(result.analysis.totalLines,3);
  assert.equal(result.analysis.valid,3);
  const stats=result.analysis.fields.map(x=>({name:x.name,virtual:x.virtual,count:x.count}));
  assert.deepEqual(JSON.parse(JSON.stringify(stats)),[
    {name:'__value',virtual:false,count:2},
    {name:'__value',virtual:true,count:1}
  ]);
}
workerStatistics().then(()=>console.log('PASS data integrity, CSV safety, field statistics, exact integer sorting and tab keyboard guard')).catch(error=>{console.error(error);process.exitCode=1;});
