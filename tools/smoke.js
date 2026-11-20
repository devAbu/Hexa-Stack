// Headless smoke test: loads www/index.html in jsdom (canvas stubbed), clicks through menus,
// plays levels with real pointer events + a bot, checks win/lose/revive overlays and rewarded flow.
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', function (e) { errors.push(String(e && e.stack || e)); });
vc.on('error', function (e) { errors.push(String(e)); });

const ctxStub = new Proxy({}, {
  get: function (t, k) {
    if (k === 'createLinearGradient') return function () { return { addColorStop: function () {} }; };
    if (k === 'measureText') return function () { return { width: 10 }; };
    return (k in t) ? t[k] : function () {};
  },
  set: function (t, k, v) { t[k] = v; return true; }
});

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function assert(c, m) { if (!c) { errors.push('ASSERT: ' + m); console.error('ASSERT FAILED:', m); } }

(async function () {
  const dom = await JSDOM.fromFile(path.join(__dirname, '../www/index.html'), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse: function (w) {
      w.HTMLCanvasElement.prototype.getContext = function () { return ctxStub; };
      const mem = {};   // file:// pages have no localStorage in jsdom: in-memory stand-in
      Object.defineProperty(w, 'localStorage', { value: {
        getItem: function (k) { return k in mem ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }, clear: function () {}
      } });
    }
  });
  const w = dom.window, d = w.document;
  await sleep(500);
  const on = function (id) { return d.getElementById(id).classList.contains('on'); };
  const click = function (id) { d.getElementById(id).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const ptr = function (type, x, y) { d.getElementById('c').dispatchEvent(new w.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true })); };
  const H = w.__hexa, Core = w.HexaCore;
  const settle = function () { let g = 0; while (H.busy() && g++ < 4000) H.tick(0.05); };

  assert(on('menu'), 'menu visible at start');
  assert(/Level 1/.test(d.getElementById('mPlay').textContent), 'play button shows Level 1');

  // settings toggles persist
  click('mSettings'); assert(on('settings'), 'settings opens');
  click('tSfx'); assert(JSON.parse(w.localStorage.getItem('hexastack_v1')).settings.sfx === false, 'sfx toggle saved');
  click('tSfx');
  d.querySelector('#settings .back').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  // level 1 with REAL pointer input for the first 3 moves
  click('mPlay'); assert(on('game'), 'game screen');
  let s = H.getState();
  assert(s.level === 1 && s.mode === 'level', 'level 1 state');
  for (let i = 0; i < 3; i++) {
    const g = H.geom(); s = H.getState();
    const m = Core.bestMove(s);
    ptr('pointerdown', g.slotX[m.ti], g.trayBase);
    ptr('pointermove', g.slotX[m.ti] + 3, g.trayBase - 40);
    ptr('pointermove', g.cx[m.ci], g.cy[m.ci] + g.lift);
    ptr('pointerup', g.cx[m.ci], g.cy[m.ci] + g.lift);
    assert(H.busy(), 'move accepted via drag (move ' + i + ')');
    settle();
    assert(H.getState().placed === i + 1, 'placed count ' + (i + 1));
  }
  // tap-select + tap-cell path
  { const g = H.geom(); s = H.getState(); const m = Core.bestMove(s);
    ptr('pointerdown', g.slotX[m.ti], g.trayBase); ptr('pointerup', g.slotX[m.ti], g.trayBase);
    ptr('pointerdown', g.cx[m.ci], g.cy[m.ci]); assert(H.busy(), 'tap-select placement'); settle(); }

  // bot finishes level 1
  let guard = 0;
  while (!H.getState().won && !H.getState().over && guard++ < 100) {
    s = H.getState(); const m = Core.bestMove(s); if (!m) break;
    H.play(Core.place(s, m.ti, m.ci)); settle();
  }
  assert(H.getState().won, 'level 1 won by bot');
  await sleep(700);
  assert(on('overlay') && /Level complete/.test(d.getElementById('card').textContent), 'win card shown');
  const D = JSON.parse(w.localStorage.getItem('hexastack_v1'));
  assert(D.level === 2 && D.stars['1'] >= 1 && D.coins > 0, 'progress saved (level/stars/coins)');
  const nextBtn = Array.from(d.querySelectorAll('#card button')).find(function (b) { return /Next/.test(b.textContent); });
  nextBtn.click();
  assert(H.getState().level === 2, 'next level starts');

  // swap with rewarded ad (simulated countdown)
  click('toolSwap');
  assert(d.getElementById('toolSwap').querySelector('.tag').textContent === '3', 'ad countdown on button');
  await sleep(3400);
  assert(/s$/.test(d.getElementById('toolSwap').querySelector('.tag').textContent), 'cooldown shown after reward');
  settle();

  // bomb: ad -> armed -> tap stack
  click('toolBomb'); await sleep(3400);
  assert(d.getElementById('toolBomb').classList.contains('armed'), 'bomb armed after reward');
  { const g = H.geom(); s = H.getState(); const ci = s.cells.findIndex(function (a) { return a.length; });
    ptr('pointerdown', g.cx[ci], g.cy[ci]); assert(H.getState().cells[ci].length === 0, 'bomb cleared the stack'); settle(); }

  // lose level by running out of moves, then +3 moves reward
  s = H.getState(); s.movesLeft = 1;
  { const m = Core.bestMove(s); H.play(Core.place(s, m.ti, m.ci)); settle(); }
  s = H.getState();
  if (!s.won) {
    await sleep(700);
    assert(s.over && s.reason === 'moves', 'out of moves');
    assert(/Out of moves/.test(d.getElementById('card').textContent), 'lose card');
    const adb = d.querySelector('#card .btn.ad'); assert(!!adb, 'rewarded +3 moves button on lose card');
    adb.click(); await sleep(3400);
    assert(!H.getState().over && H.getState().movesLeft === 3, '+3 moves granted');
  }

  // endless to game over, revive, new best saved
  d.getElementById('btnPause').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  Array.from(d.querySelectorAll('#card button')).find(function (b) { return /Menu/.test(b.textContent); }).click();
  assert(on('menu'), 'back to menu');
  click('mEndless');
  s = H.getState(); assert(s.mode === 'endless', 'endless started');
  guard = 0;
  while (!H.getState().over && guard++ < 600) {
    s = H.getState(); const m = Core.bestMove(s); if (!m) break;
    H.play(Core.place(s, m.ti, m.ci)); settle();
  }
  s = H.getState(); assert(s.over && s.reason === 'full', 'endless ends when board is full (placed ' + s.placed + ')');
  await sleep(700);
  assert(/Game over/.test(d.getElementById('card').textContent), 'game over card');
  const best = JSON.parse(w.localStorage.getItem('hexastack_v1')).best;
  assert(best === s.score && best > 0, 'best score saved');
  const rev = d.querySelector('#card .btn.ad'); rev.click(); await sleep(3400);
  assert(!H.getState().over, 'revive continues the run');
  click('btnPause'); // back to menu
  Array.from(d.querySelectorAll('#card button')).find(function (b) { return /Menu/.test(b.textContent); }).click();
  click('mScores'); assert(d.getElementById('scoreList').children.length >= 1, 'score table has entries');

  // all 20 levels build
  for (let n = 1; n <= Core.LEVEL_COUNT; n++) { H.startRun('level', n); settle(); }

  w.close();
  if (errors.length) { console.error('\nSMOKE FAILED:\n' + errors.join('\n')); process.exit(1); }
  console.log('SMOKE OK');
  process.exit(0);
})().catch(function (e) { console.error('SMOKE CRASH', e); process.exit(1); });
