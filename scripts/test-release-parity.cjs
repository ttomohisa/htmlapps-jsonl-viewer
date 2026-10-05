const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative));
const readable = read('dist/index.html');
assert.ok(read('jsonl-viewer.html').equals(readable), 'Root download must match the default readable build');
const wrapper = read('dist/index.self-extract.html').toString('utf8');
const payload = wrapper.match(/id="self-extract-payload"[^>]*>([A-Za-z0-9+/=\r\n]+)<\/script>/);
assert.ok(payload, 'Self-extract payload must exist');
assert.ok(gunzipSync(Buffer.from(payload[1], 'base64')).equals(readable), 'Self-extract payload must match the readable build');
function normalize(html) {
  for (const [name, placeholder] of [['APP_CONFIG', '__APP_CONFIG_JSON__'], ['BUILD_MANIFEST', '__BUILD_MANIFEST_JSON__'], ['assetBundle', '__EMBEDDED_ASSET_BUNDLE_JSON__']]) {
    html = html.replace(new RegExp(`const ${name} = [^\\r\\n]*;`), `const ${name} = ${placeholder};`);
  }
  return html;
}
assert.ok(normalize(readable.toString('utf8')) === normalize(read('src/index.template.html').toString('utf8')), 'Readable release must contain the current complete source template');
console.log('PASS: source, readable, root download and decompressed self-extract parity');
