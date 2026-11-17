(() => {
  'use strict';
  const C = window.TougeCore, D = C.DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const S = { kind: null, doc: null, name: '', tab: 'quick' };
  const TABS = [['quick', 'Quick edit'], ['garage', 'Garage'], ['ach', 'Achievements'], ['raw', 'Raw JSON'], ['sign', 'Signature'], ['help', 'Hidden achievement']];

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  }
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); };
  const garage = () => (S.kind === 'file' ? S.doc.garage : S.doc);
  const best = () => (S.kind === 'file' ? (C.isObj(S.doc.best) ? S.doc.best : (S.doc.best = { score: 0, distance: 0 })) : null);
  const obj = (o, k) => (C.isObj(o[k]) ? o[k] : (o[k] = {}));
  const arr = (o, k) => (Array.isArray(o[k]) ? o[k] : (o[k] = []));
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—');
  const carName = (id) => (D.CARS.find((c) => c.id === id) || { name: id }).name;

  /* ---------- load ---------- */
  function load(text, name) {
    const r = C.detect(text);
    if (r.kind === 'invalid') { $('#loadErr').textContent = r.error; return; }
    $('#loadErr').textContent = '';
    S.kind = r.kind; S.doc = r.obj; S.name = name || '';
    S.loaded = C.verify(r.kind, r.obj);
    $('#fmt-sel').value = r.kind === 'sav' ? 'sav' : 'file';
    $('#editor').hidden = false; $('#bar').hidden = false;
    render(); toast('Loaded ' + (name || 'save'));
  }
  const drop = $('#drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) f.text().then((t) => load(t, f.name)); });
  $('#pick').onclick = () => $('#file').click();
  $('#file').onchange = (e) => { const f = e.target.files[0]; if (f) f.text().then((t) => load(t, f.name)); e.target.value = ''; };
  $('#paste').onclick = () => { const t = prompt('Paste the save JSON:'); if (t) load(t, 'pasted save'); };

  /* ---------- render ---------- */
  function render() {
    const v = S.loaded, g = garage();
    $('#status').replaceChildren(
      h('div', { class: 'row' },
        h('b', {}, S.name || 'Save'), h('span', { class: 'chip ' + v.state }, v.state === 'valid' ? 'SIGNATURE VALID' : v.state === 'invalid' ? 'SIGNATURE INVALID (edited)' : 'UNSIGNED'),
        h('span', { class: 'muted' }, S.kind === 'file' ? `game export · v${S.doc.game || '?'} · ${S.doc.exportedAt || ''}` : 'raw browser-storage save'),
        h('span', { class: 'spacer' }),
        h('span', {}, `$${fmt(g.cash)} · ${Object.keys(g.cars || {}).length} cars · ${Object.keys((g.achievements || {}).unlocked || {}).length} achievements`)));
    const tabs = $('#tabs');
    tabs.replaceChildren(...TABS.map(([id, label]) => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(S.tab === id), onclick: () => { S.tab = id; render(); } }, label)));
    const p = $('#panel'); p.replaceChildren(PANELS[S.tab]());
  }

  const num = (label, get, set, o = {}) => {
    const i = h('input', { type: 'number', step: o.step || 1, min: o.min ?? 0, max: o.max, value: get() ?? 0 });
    i.addEventListener('input', () => { const n = parseFloat(i.value); if (Number.isFinite(n)) set(o.int === false ? n : Math.round(n * 1e6) / 1e6); });
    return h('label', { class: 'f' }, label, i);
  };

  /* ---------- bulk actions ---------- */
  const act = {
    cash: () => { garage().cash = 999999999; },
    cars: () => {
      const g = garage();
      g.bossWins = [...D.BOSS_WINS];
      g.purchasedCars = D.CARS.filter((c) => c.id !== 'hachi' && !c.traffic).map((c) => c.id);
      const p = obj(g, 'profile'); p.firstKills = [...new Set([...arr(p, 'firstKills'), ...D.FIRST_KILLS])];
      const m = obj(p, 'mastery'); for (const c of D.CARS) m[c.id] = Math.max(m[c.id] || 0, D.MASTERY_STEPS[9]); // traffic cars unlock via mastery
    },
    upgrades: () => { for (const c of Object.values(garage().cars || {})) { obj(c, 'levels'); for (const [k] of D.PARTS) c.levels[k] = D.MAX_PART_LEVEL; } },
    mastery: () => { const m = obj(obj(garage(), 'profile'), 'mastery'); for (const c of D.CARS) m[c.id] = D.MASTERY_STEPS[9]; },
    ach: () => { const u = obj(obj(garage(), 'achievements'), 'unlocked'); const t = Date.now(); for (const a of D.ACHIEVEMENTS) if (!u[a.id]) u[a.id] = t; },
    achNone: () => { obj(garage(), 'achievements').unlocked = {}; },
  };
  const bulk = (label, fn, msg) => h('button', { class: 'btn', onclick: () => { fn(); render(); toast(msg || label); } }, label);

  /* ---------- panels ---------- */
  const PANELS = {
    quick() {
      const g = garage(), p = obj(g, 'profile'), b = best(), sm = obj(p, 'summit');
      const sel = h('select', { onchange: (e) => { g.selected = e.target.value; } }, D.CARS.map((c) => h('option', { value: c.id, selected: g.selected === c.id }, c.name)));
      return h('div', {},
        h('h2', {}, 'Quick edit'),
        h('div', { class: 'grid' },
          num('Cash ($)', () => g.cash, (n) => { g.cash = n; }, { max: 2 ** 53 - 1 }),
          h('label', { class: 'f' }, 'Selected car', sel),
          b && num('Best score', () => b.score, (n) => { b.score = n; }),
          b && num('Best distance (m)', () => b.distance, (n) => { b.distance = n; }, { int: false, step: 'any' }),
          num('Runs', () => p.runs, (n) => { p.runs = n; }), num('Summit marks', () => p.marksEarned, (n) => { p.marksEarned = n; }),
          num('Pass clears', () => p.passClears, (n) => { p.passClears = n; }), num('Deepest boss past King', () => p.deepest, (n) => { p.deepest = n; }),
          num('Achievement marks', () => p.achievementMarks, (n) => { p.achievementMarks = n; })),
        h('h3', {}, 'Summit upgrades'),
        h('div', { class: 'grid' }, ['hp', 'boost', 'cash', 'xp'].map((k) => num(k.toUpperCase(), () => sm[k], (n) => { sm[k] = n; }))),
        h('h3', {}, 'One-click'),
        h('div', { class: 'row' },
          bulk('Max cash', act.cash, 'Cash set to $999,999,999'), bulk('Unlock all cars', act.cars, 'All cars unlocked'),
          bulk('Max all upgrades', act.upgrades, 'All parts maxed'), bulk('Mastery 10 everywhere', act.mastery, 'Mastery maxed'),
          bulk('Unlock all achievements', act.ach, 'All achievements unlocked (incl. Secret)')),
        h('p', { class: 'muted' }, 'Everything else (statistics, perks, cosmetics, atlas…) is in the Raw JSON tab.'));
    },
    garage() {
      const g = garage(), p = obj(g, 'profile'), m = obj(p, 'mastery'), owned = new Set(g.purchasedCars || []);
      const head = h('tr', {}, ['Car', 'Owned', 'Mastery XP', 'Lv', ...D.PARTS.map(([, n]) => n)].map((t) => h('th', {}, t)));
      const rows = D.CARS.filter((c) => g.cars && g.cars[c.id]).map((c) => {
        const car = g.cars[c.id]; obj(car, 'levels');
        const lv = h('td', {}, String(D.masteryLevel(m[c.id] || 0)));
        const xp = h('input', { type: 'number', min: 0, value: m[c.id] || 0, 'aria-label': c.name + ' mastery XP' });
        xp.oninput = () => { const n = parseFloat(xp.value); if (Number.isFinite(n) && n >= 0) { m[c.id] = n; lv.textContent = D.masteryLevel(n); } };
        const own = c.id === 'hachi' || c.traffic ? h('td', { class: 'muted' }, c.traffic ? 'via mastery' : 'starter')
          : h('td', {}, h('input', { type: 'checkbox', checked: owned.has(c.id), 'aria-label': 'Own ' + c.name, onchange: (e) => { const s = new Set(g.purchasedCars || []); e.target.checked ? s.add(c.id) : s.delete(c.id); g.purchasedCars = [...s]; } }));
        return h('tr', {}, h('td', {}, h('b', {}, c.name)), own, h('td', {}, xp), lv,
          ...D.PARTS.map(([k]) => h('td', {}, h('select', { 'aria-label': c.name + ' ' + k, onchange: (e) => { car.levels[k] = +e.target.value; } },
            [...Array(D.MAX_PART_LEVEL + 1).keys()].map((n) => h('option', { value: n, selected: (car.levels[k] || 0) === n }, n))))));
      });
      const wins = h('div', { class: 'row' }, D.BOSS_WINS.map((n) => h('label', { class: 'row' },
        h('input', { type: 'checkbox', checked: (g.bossWins || []).includes(n), onchange: (e) => { const s = new Set(g.bossWins || []); e.target.checked ? s.add(n) : s.delete(n); g.bossWins = D.BOSS_WINS.filter((x) => s.has(x)); } }), `${n} km boss beaten`)));
      return h('div', {}, h('h2', {}, 'Garage'),
        h('div', { class: 'row' }, bulk('Unlock all cars', act.cars, 'All cars unlocked'), bulk('Max all upgrades', act.upgrades, 'All parts maxed'), bulk('Mastery 10 everywhere', act.mastery, 'Mastery maxed')),
        h('h3', {}, 'Bosses'), wins,
        h('p', { class: 'muted' }, 'Level 10 mastery = 4,200 XP. Unlocking cars also records the rival first-kills the game checks. Traffic cars unlock once ten cars reach mastery level 5.'),
        h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, head), h('tbody', {}, rows))));
    },
    ach() {
      const u = obj(obj(garage(), 'achievements'), 'unlocked');
      const count = D.ACHIEVEMENTS.filter((a) => u[a.id]).length;
      return h('div', {}, h('h2', {}, `Achievements (${count}/${D.ACHIEVEMENTS.length})`),
        h('div', { class: 'row' }, bulk('Unlock all', act.ach, 'All achievements unlocked'), bulk('Clear all', act.achNone, 'Achievements cleared')),
        h('div', {}, D.ACHIEVEMENTS.map((a) => h('label', { class: 'ach' + (a.hidden ? ' hidden-ach' : '') },
          h('input', { type: 'checkbox', checked: !!u[a.id], onchange: (e) => { if (e.target.checked) u[a.id] = Date.now(); else delete u[a.id]; render(); } }),
          h('div', {}, h('b', {}, a.name, a.hidden && ' · HIDDEN'), h('span', {}, a.condition + (a.hidden ? ' See the "Hidden achievement" tab.' : '')))))));
    },
    raw() {
      const ta = h('textarea', { spellcheck: 'false', 'aria-label': 'Save JSON' }, JSON.stringify(S.doc, null, 2));
      const msg = h('span', { class: 'muted' }, 'Edit freely, then press Apply.');
      return h('div', {}, h('h2', {}, 'Raw JSON'), ta,
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'btn primary', onclick: () => { try { const r = C.detect(ta.value); if (r.kind === 'invalid') throw new Error(r.error); S.kind = r.kind; S.doc = r.obj; msg.textContent = 'Applied.'; msg.className = 'muted'; toast('Raw JSON applied'); renderStatusOnly(); } catch (e) { msg.textContent = e.message; msg.className = 'err'; } } }, 'Apply'),
          h('button', { class: 'btn', onclick: () => { ta.value = JSON.stringify(S.doc, null, 2); } }, 'Reset to current'), msg));
    },
    sign() {
      const v = C.verify(S.kind, S.doc), stripped = C.stripSig(S.doc);
      const payload = S.kind === 'file' ? C.canon(stripped) : JSON.stringify(stripped);
      const scope = S.kind === 'file' ? 'file' : 'garage';
      return h('div', {}, h('h2', {}, 'Signature'),
        h('p', {}, h('span', { class: 'chip ' + v.state }, v.state.toUpperCase()), ' for the current in-editor data.'),
        h('p', {}, 'Stored: ', h('code', {}, v.stored || '(none)')), h('p', {}, 'Computed: ', h('code', {}, v.computed)),
        h('h3', {}, 'How it is computed'),
        h('p', {}, h('code', {}, `HMAC-SHA256(key, "${scope}" + "\\n" + payload)`), ' → lowercase hex.'),
        h('p', {}, S.kind === 'file'
          ? 'Payload: the whole export minus integrity.signature, as compact JSON with every object’s keys sorted (integer-like keys such as "5" and "15" come first, as JavaScript orders them).'
          : 'Payload: the garage object minus integrity.signature, as compact JSON in its stored key order.'),
        h('p', {}, 'Key: ', h('code', {}, C.KEY)), h('p', { class: 'muted' }, `Payload length: ${fmt(payload.length)} characters.`));
    },
    help() {
      return h('div', {}, h('h2', {}, 'The hidden achievement: Secret'),
        h('p', {}, 'The game lists 40 achievements, but ', h('b', {}, 'Secret'), ' ("Take a secret test drive.") stays out of the total until you earn it. It is unlocked by driving in ', h('b', {}, 'TEST DRIVE'), ', a mode with no menu entry. You open it with a code on the title screen:'),
        h('div', { class: 'note' }, h('b', {}, 'Keyboard: '), ...['↑', '↑', '↓', '↓', '←', '→', '←', '→', 'B', 'A'].flatMap((k) => [h('kbd', {}, k), ' ']), ' (the Konami code; press each key once, no holding).'),
        h('div', { class: 'note' }, h('b', {}, 'Phone / touch: '), 'on the title screen either swipe ↑ ↑ ↓ ↓ ← → ← → (clear, quick swipes of at least 40 px, not from the screen edge), or tap the Japanese title text 7 times quickly (under 0.6 s between taps).'),
        h('p', {}, 'A TEST DRIVE panel opens: pick any car, including traffic and the non-roster secret cars. You get a fully upgraded run with stock paint and engine; it pays cash and counts in statistics but never unlocks cars, and your garage is untouched. Start driving (the run has to actually begin) and Secret unlocks.'),
        h('p', {}, 'Per the game code, driving any non-roster car for any distance also counts. If you just want it ticked, use the Achievements tab.'),
        h('p', { class: 'muted' }, 'Source: the game bundle (achievement list, the Konami key sequence, the touch handlers) and its changelog, which notes Secret is "earned only by a test drive".'));
    },
  };
  function renderStatusOnly() { S.loaded = C.verify(S.kind, S.doc); render(); }

  /* ---------- export ---------- */
  function output() {
    const status = $('#status-sel').value, fmtSel = $('#fmt-sel').value, now = new Date();
    if (fmtSel === 'file') {
      const doc = S.kind === 'file' ? S.doc : { game: C.DEFAULT_GAME, best: { score: 0, distance: 0 }, garage: S.doc };
      return { ...C.buildFile(doc, { status, now }), name: `tougelikeplus-save-${now.toISOString().slice(0, 10)}-edited.json`, mime: 'application/json' };
    }
    return { ...C.buildStorage(garage(), { status, now }), name: 'touge-like-plus-garage-v1.sav', mime: 'application/json' };
  }
  $('#download').onclick = () => {
    const o = output(), a = h('a', { href: URL.createObjectURL(new Blob([o.text], { type: o.mime })), download: o.name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Signed ' + o.signature.slice(0, 12) + '… downloaded');
  };
  $('#copy').onclick = async () => { const o = output(); try { await navigator.clipboard.writeText(o.text); toast('Signed JSON copied'); } catch { toast('Copy blocked by the browser, use download'); } };

  window.__touge = { S, load, output }; // handy for testing in DevTools
})();
