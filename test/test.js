// Run: node test/test.js [path/to/real-save.json ...]   (extra paths are verified as bonus checks)
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const C = require('../core.js');

let n = 0; const ok = (name) => console.log('ok', ++n, '-', name);

// 1. SHA-256 / HMAC match Node's implementation across padding boundaries and unicode
for (const len of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 100000]) {
  const s = 'a'.repeat(len);
  assert.strictEqual(Buffer.from(C.sha256(new TextEncoder().encode(s))).toString('hex'), crypto.createHash('sha256').update(s).digest('hex'), 'sha256 len ' + len);
}
for (const m of ['', 'file\n{}', 'héllo wörld ✓ 日本語 😀', 'x'.repeat(5000)]) {
  assert.strictEqual(C.hmacHex(C.KEY, m), crypto.createHmac('sha256', C.KEY).update(m, 'utf8').digest('hex'));
  assert.strictEqual(C.hmacHex('k'.repeat(100), m), crypto.createHmac('sha256', 'k'.repeat(100)).update(m, 'utf8').digest('hex'), 'long key');
}
ok('sha256 + hmac match node:crypto');

// 2. canonicalization: sorted keys at every level, integer-like keys first, arrays untouched
assert.strictEqual(C.canon({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null }, 15: 1, 5: 2 }), '{"5":2,"15":1,"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
ok('canonical json');

// 3. build -> detect -> verify round trip, both formats; tampering is caught; key order is irrelevant for files
const garage = { version: 2, profile: { mastery: { hachi: 5, 15: 1 } }, cash: 123, selected: 'hachi', bossWins: [5], integrity: { status: 'altered', alteredAt: 'x', reason: 'file' }, cars: { hachi: { levels: { speed: 5 } } } };
const f = C.buildFile({ game: '1.2.3', best: { score: 9, distance: 8.5 }, garage });
let d = C.detect(f.text); assert.strictEqual(d.kind, 'file');
assert.strictEqual(C.verify('file', d.obj).state, 'valid');
assert.strictEqual(d.obj.integrity.status, 'genuine'); assert.strictEqual(d.obj.garage.integrity, undefined);
assert.ok(f.text.endsWith('}\n'));
const shuffled = JSON.parse(f.text); shuffled.garage = { cars: shuffled.garage.cars, cash: shuffled.garage.cash, ...shuffled.garage };
assert.strictEqual(C.verify('file', shuffled).state, 'valid');
const bad = JSON.parse(f.text); bad.garage.cash = 999; assert.strictEqual(C.verify('file', bad).state, 'invalid');
const unsigned = JSON.parse(f.text); delete unsigned.integrity.signature; assert.strictEqual(C.verify('file', unsigned).state, 'unsigned');
ok('file round trip / tamper / key-order');

const s = C.buildStorage(garage); d = C.detect(s.text); assert.strictEqual(d.kind, 'sav');
assert.strictEqual(C.verify('sav', d.obj).state, 'valid');
const bad2 = JSON.parse(s.text); bad2.cash = 1; assert.strictEqual(C.verify('sav', bad2).state, 'invalid');
const alt = C.buildFile({ garage }, { status: 'altered' }); assert.strictEqual(JSON.parse(alt.text).integrity.status, 'altered');
ok('storage round trip / tamper / altered flag');

// 4. rejects junk
for (const t of ['nope', '[]', '{"a":1}', '{"format":"tougelikeplus-save","formatVersion":2}']) assert.strictEqual(C.detect(t).kind, 'invalid');
ok('rejects junk');

// 5. bonus: real saves passed on the command line must verify (genuine exports) -> proves the scheme against the game
for (const p of process.argv.slice(2)) {
  const r = C.detect(fs.readFileSync(p, 'utf8')); const v = C.verify(r.kind, r.obj);
  console.log(v.state === 'valid' ? 'ok   ' : 'FAIL ', p, v.state); if (v.state !== 'valid') process.exitCode = 1;
}
console.log('all passed');
