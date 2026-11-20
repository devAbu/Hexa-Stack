// Hexa Stack - pure game logic (no DOM). Works in browser and in Node (tools/sim.js).
(function (root) {
  'use strict';

  const R = 3;               // board radius -> 37 cells
  const CLEAR_N = 10;        // tiles needed on top to clear
  const MAX_H = 16;          // max stack height
  const TRAY_N = 3;
  const NCOL = 6;

  // ---- board geometry (axial coords) ----
  const cells = [];
  for (let q = -R; q <= R; q++) {
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) cells.push({ q: q, r: r });
  }
  const N = cells.length;
  const idxOf = {};
  cells.forEach(function (c, i) { idxOf[c.q + ',' + c.r] = i; });
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const NEI = cells.map(function (c) {
    const out = [];
    DIRS.forEach(function (d) {
      const k = (c.q + d[0]) + ',' + (c.r + d[1]);
      if (idxOf[k] !== undefined) out.push(idxOf[k]);
    });
    return out;
  });

  // ---- levels: [colors, targetTens, moves, prefilledStacks, maxTrayStackSize] ----
  const LV = [
    [3, 1, 12, 7, 4],
    [3, 2, 14, 8, 4],
    [3, 2, 12, 9, 5],
    [3, 3, 17, 9, 5],
    [4, 3, 16, 10, 5],
    [4, 3, 14, 11, 5],
    [4, 4, 20, 10, 6],
    [4, 4, 18, 11, 6],
    [4, 5, 23, 11, 6],
    [5, 4, 18, 12, 6],
    [5, 5, 22, 12, 6],
    [5, 5, 20, 13, 6],
    [5, 6, 26, 12, 6],
    [5, 6, 24, 13, 6],
    [5, 7, 29, 13, 6],
    [6, 6, 24, 14, 6],
    [6, 7, 30, 14, 6],
    [6, 7, 31, 15, 6],
    [6, 8, 35, 15, 6],
    [6, 9, 39, 16, 6]
  ];
  const LEVEL_COUNT = LV.length;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function run(st) {
    const n = st.length;
    if (!n) return 0;
    const c = st[n - 1];
    let k = 0;
    for (let i = n - 1; i >= 0 && st[i] === c; i--) k++;
    return k;
  }

  function emptyCount(s) {
    let e = 0;
    for (let i = 0; i < N; i++) if (!s.cells[i].length) e++;
    return e;
  }

  // ---- stack generation ----
  function pickColor(s, avoid) {
    const rng = s.rng;
    for (let k = 0; k < 8; k++) {
      let c;
      if (rng() < s.bias) {
        const tops = [];
        for (let i = 0; i < N; i++) {
          const st = s.cells[i];
          if (st.length && st[st.length - 1] < s.colors) tops.push(st[st.length - 1]);
        }
        c = tops.length ? tops[(rng() * tops.length) | 0] : (rng() * s.colors) | 0;
      } else {
        c = (rng() * s.colors) | 0;
      }
      if (c !== avoid) return c;
    }
    return (avoid + 1) % s.colors;
  }

  function genStack(s, minSize, maxSize) {
    const rng = s.rng;
    const size = minSize + ((rng() * (maxSize - minSize + 1)) | 0);
    let nc = rng() < s.mono ? 1 : (rng() < 0.7 ? 2 : (rng() < 0.7 ? 3 : 4));
    if (nc > s.maxNc) nc = s.maxNc;
    nc = Math.min(nc, size, s.colors);
    const runs = [];
    for (let i = 0; i < nc; i++) runs.push(1);
    for (let i = nc; i < size; i++) runs[(rng() * nc) | 0]++;
    const st = [];
    let prev = -1;
    for (let i = 0; i < nc; i++) {
      const c = pickColor(s, prev);
      for (let j = 0; j < runs[i]; j++) st.push(c);
      prev = c;
    }
    return st;
  }

  function genTray(s, keep) {
    const out = [];
    for (let i = 0; i < TRAY_N; i++) {
      if (keep && !keep[i]) out.push(null);
      else out.push(genStack(s, s.sizeMin, s.sizeMax));
    }
    return out;
  }

  // ---- resolve: merge equal tops, clear tens. Pushes animation steps. ----
  function resolve(s, steps) {
    let combo = 0;
    for (let guard = 0; guard < 600; guard++) {
      let did = false;
      for (let a = 0; a < N && !did; a++) {
        const A = s.cells[a];
        if (!A.length) continue;
        const ca = A[A.length - 1];
        const nb = NEI[a];
        for (let k = 0; k < nb.length; k++) {
          const b = nb[k];
          const B = s.cells[b];
          if (!B.length || B[B.length - 1] !== ca) continue;
          const ra = run(A), rb = run(B);
          const sa = ra * 100 + (ra === A.length ? 50 : 0) - A.length;
          const sb = rb * 100 + (rb === B.length ? 50 : 0) - B.length;
          let dst, src;
          if (sa >= sb) { dst = a; src = b; } else { dst = b; src = a; }
          const D = s.cells[dst], S = s.cells[src];
          const n = Math.min(run(S), MAX_H - D.length);
          if (n <= 0) continue;
          for (let i = 0; i < n; i++) D.push(S.pop());
          steps.push({ t: 'move', from: src, to: dst, n: n, color: ca });
          did = true;
          // clear tens on destination
          while (run(D) >= CLEAR_N) {
            D.length -= CLEAR_N;
            combo++;
            const pts = 100 * combo;
            const coins = 2 + combo * 2;
            s.cleared++;
            s.score += pts;
            s.coins += coins;
            if (combo > s.bestCombo) s.bestCombo = combo;
            steps.push({ t: 'clear', cell: dst, color: ca, combo: combo, pts: pts, coins: coins,
              cleared: s.cleared, score: s.score });
          }
          break;
        }
      }
      if (!did) break;
    }
    // a stack can already be >= 10 without a move (e.g. after bomb exposes it)
    for (let i = 0; i < N; i++) {
      const D = s.cells[i];
      while (D.length && run(D) >= CLEAR_N) {
        const c = D[D.length - 1];
        D.length -= CLEAR_N;
        combo++;
        const pts = 100 * combo, coins = 2 + combo * 2;
        s.cleared++; s.score += pts; s.coins += coins;
        if (combo > s.bestCombo) s.bestCombo = combo;
        steps.push({ t: 'clear', cell: i, color: c, combo: combo, pts: pts, coins: coins,
          cleared: s.cleared, score: s.score });
        // a clear can expose new merges
        resolve(s, steps);
      }
    }
  }

  function finish(s, steps) {
    if (s.mode === 'level' && s.cleared >= s.target) {
      s.won = true;
      steps.push({ t: 'end', won: true });
      return;
    }
    if (s.tray.every(function (x) { return !x; })) {
      s.tray = genTray(s);
      steps.push({ t: 'deal', tray: s.tray.map(function (x) { return x.slice(); }) });
    }
    if (s.mode === 'level' && s.movesLeft <= 0) {
      s.over = true; s.reason = 'moves';
      steps.push({ t: 'end', won: false, reason: 'moves' });
      return;
    }
    if (emptyCount(s) === 0) {
      s.over = true; s.reason = 'full';
      steps.push({ t: 'end', won: false, reason: 'full' });
    }
  }

  function updateColors(s) {
    if (s.mode === 'endless') {
      s.colors = Math.min(NCOL, 3 + Math.floor(s.cleared / 2));
      s.bias = Math.max(0.15, 0.45 - s.cleared * 0.012);
      s.sizeMax = Math.min(7, 5 + Math.floor(s.cleared / 8));
      s.sizeMin = Math.min(4, 2 + Math.floor(s.cleared / 12));
      s.mono = Math.max(0.03, 0.4 - s.cleared * 0.025);
      s.maxNc = s.cleared >= 8 ? 4 : 3;
    }
  }

  // ---- public actions ----
  function create(mode, level, seed) {
    const s = {
      mode: mode, level: level || 0, cells: [], tray: [], rng: null,
      colors: 3, sizeMax: 5, sizeMin: 2, bias: 0.5, mono: 0.4, maxNc: 3, target: 0, movesTotal: 0, movesLeft: null,
      cleared: 0, score: 0, coins: 0, bestCombo: 0, placed: 0,
      won: false, over: false, reason: null
    };
    for (let i = 0; i < N; i++) s.cells.push([]);
    let prefill;
    if (mode === 'level') {
      const L = LV[level - 1];
      s.bias = Math.max(0.25, 0.5 - level * 0.012);
      s.colors = L[0]; s.target = L[1]; s.movesTotal = s.movesLeft = Math.max(8, Math.round(L[2] * (0.95 - (level - 1) * 0.017))); prefill = L[3]; s.sizeMax = L[4];
      s.rng = mulberry32((seed === undefined ? 1000 + level * 77 : seed + level * 77));
    } else {
      s.colors = 3; s.sizeMax = 5; prefill = 6;
      s.rng = mulberry32(seed === undefined ? (Date.now() & 0x7fffffff) : seed);
    }
    // prefill random cells
    const order = [];
    for (let i = 0; i < N; i++) order.push(i);
    for (let i = N - 1; i > 0; i--) {
      const j = (s.rng() * (i + 1)) | 0;
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (let i = 0; i < prefill; i++) s.cells[order[i]] = genStack(s, 2, 4);
    const tmp = [];
    resolve(s, tmp);
    s.cleared = 0; s.score = 0; s.coins = 0; s.bestCombo = 0;
    s.tray = genTray(s);
    // early levels: first tray stack always matches a board stack so the first move shows a merge
    if (mode === 'level' && level <= 2) {
      for (let i = 0; i < N; i++) {
        const st = s.cells[i];
        if (!st.length) continue;
        const free = NEI[i].some(function (n) { return !s.cells[n].length; });
        if (free) {
          const c = st[st.length - 1];
          s.tray[0] = [c, c, c, c];
          break;
        }
      }
    }
    return s;
  }

  function place(s, ti, ci) {
    const steps = [];
    if (s.over || s.won) return steps;
    const st = s.tray[ti];
    if (!st || s.cells[ci].length) return steps;
    s.cells[ci] = st.slice();
    s.tray[ti] = null;
    if (s.movesLeft !== null) s.movesLeft--;
    s.placed++;
    steps.push({ t: 'place', tray: ti, cell: ci, stack: st.slice(), moves: s.movesLeft });
    resolve(s, steps);
    updateColors(s);
    spawnJunk(s, steps);
    finish(s, steps);
    return steps;
  }

  // endless pressure: every few placements a random stack grows on an empty cell
  function spawnJunk(s, steps) {
    if (s.mode !== 'endless') return;
    const every = Math.max(2, 5 - Math.floor(s.cleared / 10));
    if (s.placed % every !== 0) return;
    const empt = [];
    for (let i = 0; i < N; i++) if (!s.cells[i].length) empt.push(i);
    if (empt.length < 2) return;
    const ci = empt[(s.rng() * empt.length) | 0];
    const st = genStack(s, 2, 4);
    s.cells[ci] = st;
    steps.push({ t: 'spawn', cell: ci, stack: st.slice() });
    resolve(s, steps);
  }

  function bomb(s, ci) {
    const steps = [];
    if (s.over || s.won || !s.cells[ci].length) return steps;
    steps.push({ t: 'bomb', cell: ci, n: s.cells[ci].length });
    s.cells[ci] = [];
    resolve(s, steps);
    updateColors(s);
    finish(s, steps);
    return steps;
  }

  function swap(s) {
    const steps = [];
    if (s.over || s.won) return steps;
    const keep = s.tray.map(function (x) { return !!x; });
    if (!keep.some(Boolean)) return steps;
    s.tray = genTray(s, keep);
    steps.push({ t: 'deal', tray: s.tray.map(function (x) { return x ? x.slice() : null; }) });
    return steps;
  }

  function addMoves(s, n) {
    s.movesLeft += n;
    s.over = false; s.reason = null;
    const steps = [];
    finish(s, steps);   // deals a tray if needed, re-checks a full board
    return steps;
  }

  // board full: remove the 3 tallest stacks
  function revive(s) {
    const steps = [];
    const idx = [];
    for (let i = 0; i < N; i++) idx.push(i);
    idx.sort(function (a, b) { return s.cells[b].length - s.cells[a].length; });
    s.over = false; s.reason = null;
    for (let k = 0; k < 3; k++) {
      const ci = idx[k];
      if (!s.cells[ci].length) break;
      steps.push({ t: 'bomb', cell: ci, n: s.cells[ci].length });
      s.cells[ci] = [];
    }
    resolve(s, steps);
    finish(s, steps);
    return steps;
  }

  // ---- greedy bot / hint ----
  const DUMMY = [];
  function evalMove(s, ti, ci) {
    const sim = { cells: s.cells.map(function (a) { return a.slice(); }), cleared: 0, score: 0, coins: 0, bestCombo: 0 };
    sim.cells[ci] = s.tray[ti].slice();
    DUMMY.length = 0;
    resolve(sim, DUMMY);
    let moved = 0;
    for (let i = 0; i < DUMMY.length; i++) if (DUMMY[i].t === 'move') moved += DUMMY[i].n;
    let emp = 0, pot = 0, tall = 0;
    for (let i = 0; i < N; i++) {
      const st = sim.cells[i];
      if (!st.length) { emp++; continue; }
      const r = run(st);
      pot += r * r;
      if (st.length > 11) tall += st.length - 11;
    }
    return sim.cleared * 1000 + moved * 6 + emp * 5 + pot * 0.5 - tall * 3;
  }

  function bestMove(s) {
    let best = null, bv = -1e9;
    for (let ti = 0; ti < TRAY_N; ti++) {
      if (!s.tray[ti]) continue;
      for (let ci = 0; ci < N; ci++) {
        if (s.cells[ci].length) continue;
        const v = evalMove(s, ti, ci);
        if (v > bv) { bv = v; best = { ti: ti, ci: ci }; }
      }
    }
    return best;
  }

  root.HexaCore = {
    R: R, N: N, CLEAR_N: CLEAR_N, MAX_H: MAX_H, TRAY_N: TRAY_N, NCOL: NCOL, LEVEL_COUNT: LEVEL_COUNT,
    cells: cells, NEI: NEI, LEVELS: LV,
    create: create, place: place, bomb: bomb, swap: swap, addMoves: addMoves, revive: revive,
    bestMove: bestMove, run: run, emptyCount: emptyCount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HexaCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
