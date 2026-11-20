// Balance simulation: a greedy bot plays every level (several seeds) + endless.
// usage: node tools/sim.js [seeds]
const C = require('../www/core.js');
const seeds = parseInt(process.argv[2] || '5', 10);

function play(mode, level, seed) {
  const s = C.create(mode, level, seed);
  let guard = 0;
  while (!s.won && !s.over && guard++ < 2000) {
    const m = C.bestMove(s);
    if (!m) break;
    C.place(s, m.ti, m.ci);
  }
  return s;
}

let bad = 0;
console.log('level  win%  avgMovesLeft%');
for (let lv = 1; lv <= C.LEVEL_COUNT; lv++) {
  let wins = 0, left = 0;
  for (let k = 0; k < seeds; k++) {
    const s = play('level', lv, k * 131);
    if (s.won) { wins++; left += s.movesLeft / s.movesTotal; }
  }
  const pct = Math.round(100 * wins / seeds);
  console.log(String(lv).padStart(3), String(pct).padStart(6), wins ? String(Math.round(100 * left / wins)).padStart(8) : '       -');
  if (lv <= 3 && pct < 80) { console.error('FAIL: early level too hard for bot (level ' + lv + ')'); bad++; }
}
let tens = 0, placed = 0;
for (let k = 0; k < seeds; k++) {
  const s = play('endless', 0, 7 + k);
  tens += s.cleared; placed += s.placed;
}
console.log('endless: avg tens', (tens / seeds).toFixed(1), 'avg placements', (placed / seeds).toFixed(0));
if (tens === 0) { console.error('FAIL: endless never clears'); bad++; }
process.exit(bad ? 1 : 0);
