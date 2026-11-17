/* Tougelike+ save core: signing, verification and game data.
 * Works in the browser (window.TougeCore) and Node (require). No dependencies.
 *
 * Reverse-engineered from the public game bundle (psx-renderer chunk):
 *   signature = HMAC-SHA256(KEY, scope + "\n" + payload) -> lowercase hex
 *   file  scope "file":   payload = JSON.stringify(export minus integrity.signature, sortedKeysReplacer)
 *   storage scope "garage": payload = JSON.stringify(garage minus integrity.signature)  (insertion order)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TougeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEY = 'tougelike+/savegame/v1/7c41e9a2d05b8f36a1e4c9d27b6f03e5';
  const FORMAT = 'tougelikeplus-save';
  const NOTE = 'Tougelike+ save. Readable and editable, but any edit marks it ALTERED in Options > SAVE.';
  const DEFAULT_GAME = '00.22.41';

  /* ---------- SHA-256 / HMAC (pure JS, so it also works outside secure contexts) ---------- */
  const K = new Uint32Array([
    1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221,
    3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580,
    3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986,
    2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895,
    666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037,
    2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344,
    430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779,
    1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298]);

  function sha256(data) {
    const l = data.length, n = ((l + 9 + 63) >> 6) << 6;
    const b = new Uint8Array(n); b.set(data); b[l] = 0x80;
    const dv = new DataView(b.buffer);
    dv.setUint32(n - 8, Math.floor(l / 0x20000000)); dv.setUint32(n - 4, (l << 3) >>> 0);
    let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64);
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const x = w[i - 15], y = w[i - 2];
        const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, bb, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
      }
      h = [h[0] + a, h[1] + bb, h[2] + c, h[3] + d, h[4] + e, h[5] + f, h[6] + g, h[7] + hh].map((x) => x >>> 0);
    }
    const out = new Uint8Array(32);
    h.forEach((x, i) => { out[i * 4] = x >>> 24; out[i * 4 + 1] = x >>> 16; out[i * 4 + 2] = x >>> 8; out[i * 4 + 3] = x; });
    return out;
  }
  const enc = new TextEncoder();
  const hex = (u) => Array.from(u, (x) => x.toString(16).padStart(2, '0')).join('');
  function hmacHex(keyStr, msgStr) {
    let k = enc.encode(keyStr);
    if (k.length > 64) k = sha256(k);
    const m = enc.encode(msgStr);
    const ipad = new Uint8Array(64 + m.length), opad = new Uint8Array(96);
    for (let i = 0; i < 64; i++) { const v = k[i] || 0; ipad[i] = v ^ 0x36; opad[i] = v ^ 0x5c; }
    ipad.set(m, 64); opad.set(sha256(ipad), 64);
    return hex(sha256(opad));
  }

  /* ---------- canonicalization ---------- */
  // Same replacer as the game: rebuild every plain object with alphabetically sorted keys.
  // (JS itself then lists integer-like keys such as "5","15" first, in numeric order.)
  function sorter(_k, v) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return v;
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = v[k];
    return o;
  }
  const canon = (o) => JSON.stringify(o, sorter) ?? 'null';
  const isObj = (o) => typeof o === 'object' && o !== null && !Array.isArray(o);
  const stripSig = (o) => { const i = { ...(isObj(o.integrity) ? o.integrity : {}) }; delete i.signature; return { ...o, integrity: i }; };

  const signFile = (obj) => hmacHex(KEY, 'file\n' + canon(obj));            // obj must already lack integrity.signature
  const signStorage = (obj) => hmacHex(KEY, 'garage\n' + JSON.stringify(obj)); // insertion-order JSON, like the game's browser save

  /* ---------- detect / verify / build ---------- */
  function detect(text) {
    let obj; try { obj = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { return { kind: 'invalid', error: 'Not valid JSON: ' + e.message }; }
    if (!isObj(obj)) return { kind: 'invalid', error: 'Not a save file.' };
    if (obj.format === FORMAT) {
      if (obj.formatVersion !== 1) return { kind: 'invalid', error: 'Unknown save version ' + obj.formatVersion };
      if (!isObj(obj.garage)) return { kind: 'invalid', error: 'No garage data.' };
      return { kind: 'file', obj };
    }
    if (obj.version === 1 || obj.version === 2) return { kind: 'sav', obj };
    return { kind: 'invalid', error: 'Not a Tougelike+ save.' };
  }
  function verify(kind, obj) {
    const stored = isObj(obj.integrity) && typeof obj.integrity.signature === 'string' ? obj.integrity.signature : null;
    const stripped = stripSig(obj);
    const computed = kind === 'file' ? signFile(stripped) : signStorage(stripped);
    return { state: stored === null ? 'unsigned' : stored === computed ? 'valid' : 'invalid', stored, computed };
  }
  const integrityFor = (status, now) => status === 'altered'
    ? { status: 'altered', alteredAt: now.toISOString(), reason: 'file' }
    : { status: 'genuine', alteredAt: null, reason: null };

  // Mirrors the game's export (XS): garage loses its own integrity block, which moves to the top level.
  function buildFile(doc, opts = {}) {
    const now = opts.now || new Date();
    const garage = { ...doc.garage }; delete garage.integrity;
    const a = {
      format: FORMAT, formatVersion: 1, game: doc.game || DEFAULT_GAME, exportedAt: now.toISOString(), note: NOTE,
      integrity: { ...integrityFor(opts.status || 'genuine', now), algorithm: 'HMAC-SHA-256' },
      best: isObj(doc.best) ? doc.best : { score: 0, distance: 0 }, garage,
    };
    const signature = signFile(a);
    return { text: JSON.stringify({ ...a, integrity: { ...a.integrity, signature } }, null, 2) + '\n', signature };
  }
  // Raw browser-storage format (the game's HS): compact JSON, integrity inside the garage object, scope "garage".
  function buildStorage(garage, opts = {}) {
    const now = opts.now || new Date();
    const n = { ...garage, integrity: { ...integrityFor(opts.status || 'genuine', now), savedAt: now.getTime() } };
    const signature = signStorage(n);
    return { text: JSON.stringify({ ...n, integrity: { ...n.integrity, signature } }), signature };
  }

  /* ---------- game data (from the public bundle, build 00.22.41) ---------- */
  const CARS = [
    ['hachi', 'HACHI 86'], ['roadster', 'SPIDER S2'], ['civic', 'HATCH EK'], ['fd', 'ROTARY FD'], ['skyline', 'RB COUPE'],
    ['integra-dc2', 'VTEC DC2'], ['sileighty', 'SWAP 180'], ['silvia-s14', 'KOUKI S14'], ['300zx-z32', 'TWIN Z32'],
    ['skyline-r32', 'GOJIRA R32'], ['evo5-cp9a', 'RALLY CP9'], ['350z-z33', 'VQ Z33'], ['impreza-22b', 'BOXER 22B'],
    ['nsx-na1', 'MIDSHIP NA1'], ['supra-a80', 'JZ A80'], ['porsche-930', 'WHALE 930'], ['land-cruiser', 'TRAIL 80'],
    ['mega-cruiser', 'GIGA CRUISER'], ['kei-truck', 'KEI TRUCK'], ['street-sedan', 'STREET S13'], ['utility-van', 'KEI VAN'],
  ].map(([id, name]) => ({ id, name, traffic: ['kei-truck', 'street-sedan', 'utility-van'].includes(id) }));
  const PARTS = [['health', 'Chassis'], ['resistance', 'Impact bracing'], ['speed', 'Engine'], ['turning', 'Tires'], ['boostRegen', 'Boost regen']];
  const MAX_PART_LEVEL = 5;
  const MASTERY_STEPS = [0, 120, 300, 550, 850, 1250, 1750, 2400, 3200, 4200]; // XP needed for level 1..10
  const masteryLevel = (xp) => { let l = 1; for (let i = 1; i < MASTERY_STEPS.length; i++) if (xp >= MASTERY_STEPS[i]) l = i + 1; return l; };
  const BOSS_WINS = [5, 15, 25];
  // Rival-boss "first kill" keys the game checks for car unlocks (taken from a fully unlocked save).
  const FIRST_KILLS = ['roadster', 'fd', 'skyline', 'integra-dc2', 'tandem', '300zx-z32', 'skyline-r32', 'evo5-cp9a', '350z-z33',
    'impreza-22b', 'nsx-na1', 'supra-a80', 'porsche-930', 'land-cruiser', 'mega-cruiser'];
  const ACHIEVEMENTS = [
    ['speed-deamon', 'Speed Deamon', 'Drive over 300 km/h.'], ['dragster', 'Dragster', 'Drive over 400 km/h.'],
    ['into-the-void', 'Into the Void', 'Fly off the mountain at over 250 km/h.'], ['donkey-kong', 'Donkey Kong', 'Accumulate 5 minutes of clean drifting.'],
    ['pink-slip', 'Pink Slip', 'Beat the 5 km boss and unlock the Spider S2.'], ['brap-brap', 'Brap Brap', 'Beat the 15 km boss and unlock the Rotary FD.'],
    ['stonks', 'Stonks', 'Beat the 15 km boss with a x5 combo.'], ['vtec-baby', 'VTEC Baby', 'Buy the Hatch EK.'],
    ['dreamcar', 'Dreamcar', 'Unlock the RB Coupe.'], ['riced-out', 'Riced Out', 'Add non-performance upgrades to your car.'],
    ['racecar', 'Racecar', 'Max out all five performance parts on one car.'], ['moneypit', 'Moneypit', 'Spend over $40,000 on a single car.'],
    ['rich-rich', 'Rich Rich', 'Buy everything: every car except traffic cars, every part tier and every finish on each.'],
    ['payday', 'Payday', 'Take home over $10,000 from a single run.'], ['baller', 'Baller', 'Take home over $30,000 from a single run.'],
    ['retirement', 'Retirement', 'Take home over $401,000 across all runs.'], ['godrun', 'Godrun', 'Score over 100,000,000 points in a single run.'],
    ['big-boy-turbo', 'Redline', 'Run a maxed-out turbo part.'], ['time-attack', 'Time Attack', 'Run a maxed-out tires part.'],
    ['tank', 'Tank', 'Max out damage resist with an armor part.'], ['bounty-hunter', 'Bounty Hunter', 'Take 100 boss lives across all runs.'],
    ['fast-lane', 'Fast Lane', 'Shove a boss through a yellow barrier.'], ['multikill', 'Multikill', 'Take down 5 rivals within one second.'],
    ['whiteline', 'Whiteline', 'Get 100 near misses in a single run.'], ['boombox', 'Boombox', 'Play every track in the menu or Soundtrack.'],
    ['bass-boosted', 'Bass Boosted', "Hear one rival's music for over 20 seconds."], ['hoonigan', 'Hoonigan', 'Shoot 20 exhaust pops during one tunnel passage.'],
    ['touge-legend', 'Touge Legend', 'Drive over 50 km in a single run.'], ['cinematic', 'Cinematic', 'Change the driving camera for the first time.'],
    ['retro', 'Retro', 'Complete a run with PSX Low, scanlines on and strong vertex snap throughout.'],
    ['sports-mode', 'Sports Mode', 'Turn off Pause for parts in Options.'], ['summit', 'Summit', 'Clear a Pass: beat the King of the Pass at 40 km.'],
    ['alchemist', 'Alchemist', 'Fuse two level V modules into a legendary.'], ['stars-aligned', 'Stars Aligned', 'Hold 5 legendary modules at once in one run.'],
    ['inferno', 'Inferno', 'Reach heat 10 in one run.'], ['five-stars', 'Five Stars', 'Send a MILITARY POLICE car over a yellow rail.'],
    ['sensei', 'Sensei', 'Raise one car to mastery 10.'], ['deep-diver', 'Deep Diver', 'Beat five bosses past the King of the Pass in one run.'],
    ['full-roster', 'Full Roster', 'Own every car on the roster, traffic cars aside.'], ['secret', 'Secret', 'Take a secret test drive.'],
  ].map(([id, name, condition]) => ({ id, name, condition, hidden: id === 'secret' }));

  return {
    KEY, FORMAT, DEFAULT_GAME, sha256, hmacHex, canon, sorter, stripSig, signFile, signStorage,
    detect, verify, buildFile, buildStorage, isObj,
    DATA: { CARS, PARTS, MAX_PART_LEVEL, MASTERY_STEPS, masteryLevel, BOSS_WINS, FIRST_KILLS, ACHIEVEMENTS },
  };
});
