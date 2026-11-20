// Hexa Stack - rendering, input, UI and game flow.
(function () {
  'use strict';

  const Core = HexaCore;
  const S = Strings.S, t = Strings.t;
  const N = Core.N, CELLS = Core.cells, TRAY_N = Core.TRAY_N, CLEAR_N = Core.CLEAR_N;
  const SQ3 = Math.sqrt(3);
  const PAL = ['#ef4f5f', '#3b8cff', '#35c985', '#ffc83d', '#a56bff', '#ff8a3d'];
  const PCOL = PAL.concat(['#ffffff', '#ffb347', '#ff6b4a', '#9aa7c7']);   // particle colours (+ extras)
  const $ = function (id) { return document.getElementById(id); };

  // ---------------------------------------------------------------- DOM refs
  const canvas = $('c'), ctx = canvas.getContext('2d');
  const hudEl = $('hud'), toolsEl = $('tools'), overlay = $('overlay'), card = $('card');
  const screens = ['game', 'menu', 'levels', 'scores', 'settings'];
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom);pointer-events:none;';
  document.body.appendChild(probe);

  // ---------------------------------------------------------------- icons (drawn with code)
  const ICON = {
    pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/></svg>',
    bomb: '<svg viewBox="0 0 24 24"><circle cx="11" cy="14" r="7" fill="currentColor"/><path d="M15.5 8.5L18 6M18 3.5l.8 2M20.5 6l2 .6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    moves: '<svg viewBox="0 0 24 24"><text x="12" y="18" font-size="16" font-weight="800" text-anchor="middle" fill="currentColor" font-family="system-ui,sans-serif">+3</text></svg>',
    star: function (on) {
      return '<svg viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9.3 16.5,14 18.3,21 12,17 5.7,21 7.5,14 2,9.3 9,9" fill="' +
        (on ? '#ffd666' : 'rgba(255,255,255,.18)') + '"/></svg>';
    }
  };

  // ---------------------------------------------------------------- layout
  let W = 0, H = 0, dpr = 1, s = 28, th = 5, LIFT = 60;
  const cx = new Float32Array(N), cy = new Float32Array(N);
  const slotX = [0, 0, 0];
  let trayBase = 0, trayTop = 0, boardMidX = 0;
  let sprites = [], slotSpr = null, slotHiSpr = null, slotBombSpr = null;
  const order = [];
  for (let i = 0; i < N; i++) order.push(i);
  order.sort(function (a, b) { return CELLS[a].r - CELLS[b].r || CELLS[a].q - CELLS[b].q; });

  function hexPath(g, x, y, r) {
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 180 * (60 * k - 30);
      const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = function (v) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt))); };
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  function newSprite(w, h) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    return { cv: cv, g: g, w: w, h: h, ox: w / 2, oy: s + 2 };
  }

  function buildSprites() {
    const w = Math.ceil(SQ3 * s) + 4, h = Math.ceil(2 * s + th) + 4;
    sprites = PAL.map(function (col) {
      const sp = newSprite(w, h), g = sp.g, x = sp.ox, y = sp.oy, r = s * 0.93;
      g.lineJoin = 'round'; g.lineWidth = 3;
      hexPath(g, x, y + th, r);                      // side
      g.fillStyle = g.strokeStyle = shade(col, -0.42); g.fill(); g.stroke();
      hexPath(g, x, y, r);                           // top face
      const gr = g.createLinearGradient(x - r, y - r, x + r * 0.6, y + r);
      gr.addColorStop(0, shade(col, 0.28)); gr.addColorStop(0.55, col); gr.addColorStop(1, shade(col, -0.12));
      g.fillStyle = gr; g.strokeStyle = shade(col, 0.1); g.fill(); g.stroke();
      hexPath(g, x, y, r * 0.62);                    // inner ring
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.22)'; g.stroke();
      return sp;
    });
    function slot(fill, stroke, lw) {
      const sp = newSprite(w, h), g = sp.g;
      g.lineJoin = 'round';
      hexPath(g, sp.ox, sp.oy + th * 0.5, s * 0.92);
      g.fillStyle = fill; g.fill();
      g.lineWidth = lw; g.strokeStyle = stroke; g.stroke();
      return sp;
    }
    slotSpr = slot('rgba(255,255,255,.055)', 'rgba(255,255,255,.16)', 1.5);
    slotHiSpr = slot('rgba(62,224,192,.30)', '#3ee0c0', 2.5);
    slotBombSpr = slot('rgba(255,107,74,.22)', '#ff6b4a', 2.5);
  }

  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const safeB = probe.offsetHeight || 0;
    const trayH = Math.max(112, Math.min(150, H * 0.18)) + safeB;
    toolsEl.style.bottom = (trayH + 2) + 'px';
    trayTop = H - trayH;
    const hudB = hudEl.getBoundingClientRect().bottom || 60;
    const top = hudB + 6, bottom = H - trayH - 56 - 12;
    s = Math.max(14, Math.min(36, W * 0.97 / (7 * SQ3), (bottom - top - 40) / 11));
    th = Math.max(3, s * 0.17);
    LIFT = s * 2.3;
    boardMidX = W / 2;
    const midY = (top + bottom) / 2 + th * 3;
    for (let i = 0; i < N; i++) {
      cx[i] = boardMidX + s * SQ3 * (CELLS[i].q + CELLS[i].r / 2);
      cy[i] = midY + s * 1.5 * CELLS[i].r;
    }
    trayBase = H - safeB - s * 1.15;
    for (let i = 0; i < TRAY_N; i++) slotX[i] = W * (i + 0.5) / TRAY_N;
    buildSprites();
    dirty = true;
  }

  // ---------------------------------------------------------------- game / view state
  let state = null, inGame = false, dirty = true;
  let vis = [], vtray = [null, null, null];
  const pulse = new Float32Array(N), pend = new Int8Array(N);
  let queue = [], cur = null;
  let hud = { moves: null, cleared: 0, score: 0 };
  let drag = null, sel = -1, armed = false, charges = 0;
  let idle = 0, hint = null, shake = 0, trayIn = 1, time = 0;
  let adBusy = false, adPlacement = null, adLeft = 0;

  // pools (no allocations while playing)
  const flies = [];
  for (let i = 0; i < 90; i++) flies.push({ on: false, kind: 0, c: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 0.3, delay: 0, arc: 0, to: 0, step: null });
  const PN = 240;
  const px = new Float32Array(PN), py = new Float32Array(PN), pvx = new Float32Array(PN), pvy = new Float32Array(PN);
  const plife = new Float32Array(PN), pmax = new Float32Array(PN), psz = new Float32Array(PN), pcol = new Uint8Array(PN);
  const floaters = [];
  for (let i = 0; i < 10; i++) floaters.push({ on: false, text: '', x: 0, y: 0, t: 0, dur: 1, size: 20, color: '#fff' });

  function emit(x, y, n, col, speed, up) {
    for (let i = 0, k = 0; i < PN && k < n; i++) {
      if (plife[i] > 0) continue;
      const a = Math.random() * 6.2832, sp = speed * (0.35 + Math.random() * 0.75);
      px[i] = x; py[i] = y; pvx[i] = Math.cos(a) * sp; pvy[i] = Math.sin(a) * sp - (up || 0);
      plife[i] = pmax[i] = 0.45 + Math.random() * 0.4; psz[i] = 2 + Math.random() * 3.5; pcol[i] = col;
      k++;
    }
  }
  function floatText(text, x, y, color, size, dur) {
    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i];
      if (f.on) continue;
      f.on = true; f.text = text; f.x = x; f.y = y; f.t = 0; f.dur = dur || 1; f.size = size; f.color = color;
      return;
    }
  }
  function getFly() {
    for (let i = 0; i < flies.length; i++) if (!flies[i].on) return flies[i];
    return null;
  }

  function syncVis() {
    vis = state.cells.map(function (a) { return a.slice(); });
    vtray = state.tray.map(function (a) { return a ? a.slice() : null; });
    pend.fill(0);
    hud.moves = state.movesLeft; hud.cleared = state.cleared; hud.score = state.score;
  }

  const baseInput = function () {
    return inGame && state && !state.over && !state.won && !cur && !queue.length &&
      !overlay.classList.contains('on') && !adBusy;
  };

  // ---------------------------------------------------------------- step playback
  function play(steps) {
    for (let i = 0; i < steps.length; i++) queue.push(steps[i]);
    dirty = true;
  }

  function beginStep(st) {
    cur = { s: st, t: 0, k: 0, inflight: 0, wait: 0 };
    const D = Store.data();
    switch (st.t) {
      case 'place':
        vis[st.cell] = st.stack.slice(); vtray[st.tray] = null;
        pulse[st.cell] = 1; hud.moves = st.moves; updateHud();
        Sfx.play('place'); Sfx.vib(14); cur.wait = 0.16;
        break;
      case 'spawn':
        vis[st.cell] = st.stack.slice(); pulse[st.cell] = 1;
        emit(cx[st.cell], cy[st.cell], 10, 9, 90); Sfx.play('spawn'); cur.wait = 0.22;
        break;
      case 'clear': {
        const arr = vis[st.cell], len = arr.length;
        for (let k = 0; k < CLEAR_N; k++) {
          const f = getFly();
          if (!f) break;
          f.on = true; f.kind = 1; f.c = st.color; f.x0 = cx[st.cell]; f.y0 = cy[st.cell] - (len - 1 - k) * th;
          f.x1 = f.x0 + (Math.random() - 0.5) * s * 1.6; f.y1 = f.y0 - s * 3 - k * 7;
          f.t = 0; f.dur = 0.5; f.delay = k * 0.03; f.step = null;
        }
        arr.length = Math.max(0, len - CLEAR_N);
        const ty = cy[st.cell] - Math.max(0, arr.length) * th;
        emit(cx[st.cell], ty, 26, st.color, 190, 40); emit(cx[st.cell], ty, 8, 6, 150, 60);
        floatText('+' + st.pts, cx[st.cell], ty - s, '#fff', 20, 0.9);
        if (st.combo >= 2) floatText(t('comboN', { n: st.combo }), W / 2, cy[Math.floor(N / 2)] - s * 3.2, '#ffd666', 30 + st.combo * 2, 1.1);
        shake = 0.18 + 0.08 * Math.min(st.combo, 4);
        hud.cleared = st.cleared; hud.score = st.score; D.coins += st.coins; updateHud();
        Sfx.play('clear', st.combo); Sfx.vib(st.combo >= 2 ? 60 : 35); cur.wait = 0.5;
        break;
      }
      case 'bomb':
        emit(cx[st.cell], cy[st.cell], 34, 7, 230, 30); emit(cx[st.cell], cy[st.cell], 18, 8, 160);
        vis[st.cell] = []; shake = 0.5; Sfx.play('bomb'); Sfx.vib(50); cur.wait = 0.38;
        break;
      case 'deal':
        vtray = st.tray.map(function (a) { return a ? a.slice() : null; });
        trayIn = 0; Sfx.play('deal'); cur.wait = 0.3;
        break;
      case 'end':
        cur.wait = 0.7; endRun(st);
        break;
    }
    dirty = true;
  }

  function stepDone() {
    const st = cur.s;
    if (st.t === 'move') return cur.k >= st.n && cur.inflight === 0;
    return cur.t >= cur.wait;
  }

  function updateStep(dt) {
    cur.t += dt;
    const st = cur.s;
    if (st.t === 'move') {
      while (cur.k < st.n && cur.t >= cur.k * 0.06) {
        const src = vis[st.from];
        if (!src.length) { cur.k = st.n; break; }
        const c = src.pop(), f = getFly();
        if (!f) { vis[st.to].push(c); cur.k++; continue; }
        f.on = true; f.kind = 0; f.c = c; f.to = st.to; f.step = cur; f.t = 0; f.delay = 0; f.dur = 0.27; f.arc = s * 1.0;
        f.x0 = cx[st.from]; f.y0 = cy[st.from] - src.length * th;
        f.x1 = cx[st.to]; f.y1 = cy[st.to] - (vis[st.to].length + pend[st.to]) * th;
        pend[st.to]++; cur.inflight++;
        Sfx.play('hop', cur.k);
        cur.k++;
      }
    }
  }

  function updateQueue(dt) {
    if (!cur && queue.length) beginStep(queue.shift());
    if (cur) {
      updateStep(dt);
      if (stepDone()) {
        const wasLast = !queue.length;
        cur = null;
        if (wasLast) { syncVis(); updateHud(); afterQueue(); }
      }
    }
  }

  function afterQueue() {
    Store.save();
    refreshTools();
    idle = 0; hint = null;
  }

  // ---------------------------------------------------------------- per-frame update
  function update(dt) {
    time += dt;
    updateQueue(dt);

    for (let i = 0; i < flies.length; i++) {
      const f = flies[i];
      if (!f.on) continue;
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.t += dt / f.dur;
      if (f.t >= 1) {
        f.on = false;
        if (f.kind === 0) {
          vis[f.to].push(f.c); pend[f.to]--; pulse[f.to] = Math.max(pulse[f.to], 0.55);
          if (f.step) f.step.inflight--;
        }
      }
    }
    for (let i = 0; i < PN; i++) {
      if (plife[i] <= 0) continue;
      plife[i] -= dt;
      px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pvy[i] += 380 * dt;
    }
    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i];
      if (f.on) { f.t += dt / f.dur; if (f.t >= 1) f.on = false; }
    }
    for (let i = 0; i < N; i++) if (pulse[i] > 0) pulse[i] = Math.max(0, pulse[i] - dt * 3.2);
    if (shake > 0) shake = Math.max(0, shake - dt);
    if (trayIn < 1) trayIn = Math.min(1, trayIn + dt / 0.3);

    // first-levels hint (animated hand, no text)
    if (state && state.mode === 'level' && state.level <= 3 && baseInput() && !drag && !armed && sel < 0) {
      idle += dt;
      const delay = state.level === 1 ? (state.placed === 0 ? 0.8 : 3) : 5;
      if (!hint && idle >= delay) {
        const m = Core.bestMove(state);
        if (m) hint = { ti: m.ti, ci: m.ci, t: 0 };
      }
      if (hint) hint.t += dt;
    } else if (hint) { hint = null; }
  }

  function animating() {
    if (cur || queue.length || drag || hint || sel >= 0 || armed || shake > 0 || trayIn < 1) return true;
    for (let i = 0; i < flies.length; i++) if (flies[i].on) return true;
    for (let i = 0; i < PN; i++) if (plife[i] > 0) return true;
    for (let i = 0; i < floaters.length; i++) if (floaters[i].on) return true;
    for (let i = 0; i < N; i++) if (pulse[i] > 0) return true;
    return false;
  }

  // ---------------------------------------------------------------- drawing
  function spr(sp, x, y) { ctx.drawImage(sp.cv, x - sp.ox, y - sp.oy, sp.w, sp.h); }

  function drawStack(st, x, y) {
    for (let i = 0; i < st.length; i++) spr(sprites[st[i]], x, y - i * th);
  }

  function drawBadge(st, x, y) {
    const r = Core.run(st);
    if (r < 3) return;
    const ty = y - (st.length - 1) * th;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText(r, x, ty + 1); ctx.fillStyle = r >= 8 ? '#fff6c2' : '#fff'; ctx.fillText(r, x, ty + 1);
  }

  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function draw() {
    dirty = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);
    ctx.font = '800 ' + Math.round(s * 0.6) + 'px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // drop target under the dragged stack
    let target = -1;
    if (drag && drag.moved) target = findTarget(drag.x, drag.y - LIFT);
    else if (hint) target = hint.ci;

    // board
    for (let k = 0; k < N; k++) {
      const i = order[k], st = vis[i];
      if (!st.length) {
        spr(i === target ? slotHiSpr : slotSpr, cx[i], cy[i]);
        continue;
      }
      if (armed) spr(slotBombSpr, cx[i], cy[i]);
      const p = pulse[i];
      if (p > 0.01) {
        ctx.save(); ctx.translate(cx[i], cy[i]); ctx.scale(1 + 0.09 * p, 1 - 0.07 * p);
        drawStack(st, 0, 0); ctx.restore();
      } else {
        drawStack(st, cx[i], cy[i]);
      }
      drawBadge(st, cx[i], cy[i]);
    }

    // tray
    for (let i = 0; i < TRAY_N; i++) {
      spr(slotSpr, slotX[i], trayBase);
      const st = vtray[i];
      if (!st || (drag && drag.ti === i && drag.moved)) continue;
      let y = trayBase + (1 - ease(trayIn)) * 140;
      if (sel === i) y -= 8 + Math.sin(time * 7) * 3;
      drawStack(st, slotX[i], y);
      drawBadge(st, slotX[i], y);
    }

    // flying tiles
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i];
      if (!f.on || f.delay > 0) continue;
      const tt = f.t;
      if (f.kind === 0) {
        const e = ease(tt);
        spr(sprites[f.c], f.x0 + (f.x1 - f.x0) * e, f.y0 + (f.y1 - f.y0) * e - Math.sin(tt * Math.PI) * f.arc);
      } else {
        ctx.globalAlpha = 1 - tt;
        spr(sprites[f.c], f.x0 + (f.x1 - f.x0) * tt, f.y0 + (f.y1 - f.y0) * ease(tt));
        ctx.globalAlpha = 1;
      }
    }

    // dragged stack
    if (drag && drag.moved) {
      const st = vtray[drag.ti];
      if (st) { drawStack(st, drag.x, drag.y - LIFT); }
    }

    // hint hand
    if (hint && vtray[hint.ti]) drawHint();

    // particles
    for (let i = 0; i < PN; i++) {
      if (plife[i] <= 0) continue;
      ctx.globalAlpha = Math.min(1, plife[i] / pmax[i] * 1.4);
      ctx.fillStyle = PCOL[pcol[i]];
      ctx.fillRect(px[i] - psz[i] / 2, py[i] - psz[i] / 2, psz[i], psz[i]);
    }
    ctx.globalAlpha = 1;

    // floating text
    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i];
      if (!f.on) continue;
      const a = f.t < 0.7 ? 1 : 1 - (f.t - 0.7) / 0.3;
      ctx.globalAlpha = a;
      ctx.font = '800 ' + f.size + 'px system-ui,sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.5)';
      const y = f.y - f.t * 36, sc = f.t < 0.15 ? 0.6 + f.t / 0.15 * 0.4 : 1;
      ctx.save(); ctx.translate(f.x, y); ctx.scale(sc, sc);
      ctx.strokeText(f.text, 0, 0); ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawHint() {
    const T = 2.4, tt = hint.t % T;
    const x0 = slotX[hint.ti], y0 = trayBase, x1 = cx[hint.ci], y1 = cy[hint.ci];
    let k = 0, alpha = 1;
    if (tt < 0.35) { k = 0; alpha = tt / 0.35; }
    else if (tt < 1.5) { k = ease((tt - 0.35) / 1.15); }
    else if (tt < 2.0) { k = 1; }
    else { k = 1; alpha = 1 - (tt - 2.0) / 0.4; }
    const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - (k > 0 && k < 1 ? s * 0.8 * Math.sin(k * Math.PI) : 0);
    ctx.globalAlpha = 0.9 * alpha;
    drawStack(vtray[hint.ti], x, y);
    ctx.globalAlpha = alpha;
    // finger: soft circle + ring
    const fy = y + s * 0.9, pressed = tt < 0.35 || tt > 1.5 ? 0.85 : 1;
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.arc(x, fy, s * 0.62 * pressed, 0, 6.2832); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(x, fy, s * 0.9 * pressed, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- input
  function findTarget(x, y) {
    let best = -1, bd = (s * 1.15) * (s * 1.15);
    for (let i = 0; i < N; i++) {
      if (vis[i].length) continue;
      const dx = cx[i] - x, dy = cy[i] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function findStack(x, y) {
    let best = -1, bd = (s * 1.25) * (s * 1.25);
    for (let i = 0; i < N; i++) {
      const L = vis[i].length;
      if (!L) continue;
      const dx = cx[i] - x, dy = cy[i] - (L * th) / 2 - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function placeAt(ti, ci) {
    sel = -1; drag = null; idle = 0; hint = null;
    play(Core.place(state, ti, ci));
  }

  function onDown(e) {
    e.preventDefault();
    Sfx.unlock();
    idle = 0; hint = null; dirty = true;
    if (!baseInput()) return;
    const x = e.clientX, y = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (armed) {
      const ci = findStack(x, y);
      if (ci >= 0) { armed = false; charges--; refreshTools(); play(Core.bomb(state, ci)); }
      return;
    }
    if (y >= trayTop - 6) {
      const ti = Math.max(0, Math.min(TRAY_N - 1, Math.floor(x / (W / TRAY_N))));
      if (vtray[ti]) {
        drag = { ti: ti, x: x, y: y, sx: x, sy: y, moved: false };
        Sfx.play('pick');
      }
      return;
    }
    if (sel >= 0) {
      const ci = findTarget(x, y);
      if (ci >= 0) placeAt(sel, ci); else { sel = -1; Sfx.play('error'); }
    }
  }

  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.moved && Math.hypot(drag.x - drag.sx, drag.y - drag.sy) > 10) drag.moved = true;
    dirty = true;
  }

  function onUp(e) {
    if (!drag) return;
    e.preventDefault();
    const d = drag;
    drag = null; dirty = true;
    if (d.moved) {
      const ci = findTarget(d.x, d.y - LIFT);
      if (ci >= 0 && baseInput()) placeAt(d.ti, ci); else Sfx.play('error');
    } else {
      sel = (sel === d.ti) ? -1 : d.ti;
    }
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', function () { drag = null; dirty = true; });

  // ---------------------------------------------------------------- HUD
  const elTitle = $('hudTitle'), elFill = $('barFill'), elBarText = $('barText');
  const elRLbl = $('hudRightLbl'), elRVal = $('hudRightVal');

  function updateHud() {
    if (!state) return;
    if (state.mode === 'level') {
      elTitle.textContent = t('levelN', { n: state.level });
      elFill.style.width = Math.min(100, hud.cleared / state.target * 100) + '%';
      elBarText.textContent = t('tensProgress', { a: hud.cleared, b: state.target });
      elRLbl.textContent = S.movesLabel; elRVal.textContent = hud.moves;
      elRVal.classList.toggle('low', hud.moves <= 3);
    } else {
      elTitle.textContent = S.endless;
      elFill.style.width = ((hud.cleared % 5) / 5 * 100) + '%';
      elBarText.textContent = t('scoreN', { n: hud.score });
      elRLbl.textContent = S.bestLabel; elRVal.textContent = Math.max(Store.data().best, hud.score);
      elRVal.classList.remove('low');
    }
  }

  // ---------------------------------------------------------------- tools + rewarded ads
  const tools = {};
  function buildTool(id, key, icon, placement) {
    const el = $(id);
    el.innerHTML = icon + '<span class="lbl"></span><span class="tag"></span>';
    tools[placement] = { el: el, lbl: el.querySelector('.lbl'), tag: el.querySelector('.tag') };
    tools[placement].lbl.textContent = S[key];
  }

  function adText(placement) {
    if (adPlacement === placement) return t('adCountdown', { n: adLeft });
    const cd = AdService.cooldownLeft(placement);
    return cd > 0 ? t('adCooldown', { n: Math.ceil(cd / 1000) }) : S.adTag;
  }

  function refreshTools() {
    if (!state) return;
    const can = baseInput();
    const sw = tools.swap, bo = tools.bomb, mv = tools.moves;
    sw.tag.textContent = adText('swap');
    sw.el.disabled = !can || !AdService.canShow('swap') || !state.tray.some(Boolean);
    if (charges > 0) { bo.tag.textContent = 'x' + charges; bo.tag.classList.add('n'); }
    else { bo.tag.textContent = adText('bomb'); bo.tag.classList.remove('n'); }
    bo.el.classList.toggle('armed', armed);
    bo.el.disabled = armed ? false : (!can || (charges === 0 && !AdService.canShow('bomb')));
    mv.el.style.display = state.mode === 'level' ? '' : 'none';
    mv.tag.textContent = adText('moves');
    mv.el.disabled = !can || !AdService.canShow('moves');
    refreshOverlayAds();
  }

  function runAd(placement, onReward) {
    if (!AdService.canShow(placement)) { Sfx.play('error'); return; }
    adBusy = true; adPlacement = placement; adLeft = 3; refreshTools();
    AdService.show(placement, function (left) { adLeft = left; refreshTools(); }).then(function (r) {
      adBusy = false; adPlacement = null;
      if (r.rewarded) { Sfx.play('reward'); Sfx.vib(25); onReward(); }
      refreshTools(); dirty = true;
    });
  }

  function onSwap() { if (baseInput()) runAd('swap', function () { play(Core.swap(state)); }); }
  function onBomb() {
    if (armed) { armed = false; refreshTools(); dirty = true; return; }
    if (!baseInput()) return;
    if (charges > 0) { armed = true; sel = -1; refreshTools(); dirty = true; return; }
    runAd('bomb', function () { charges++; armed = true; sel = -1; });
  }
  function onMoves() {
    if (!baseInput() || state.mode !== 'level') return;
    runAd('moves', function () { play(Core.addMoves(state, 3)); hud.moves = state.movesLeft; updateHud(); });
  }

  // ---------------------------------------------------------------- overlays
  let overlayAds = [];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function btn(text, cls, fn) {
    const b = el('button', 'btn ' + (cls || ''), text);
    b.addEventListener('click', function () { Sfx.play('click'); fn(); });
    return b;
  }
  function adBtn(label, placement, onReward) {
    const b = el('button', 'btn ad');
    const upd = function () {
      b.textContent = label + '  -  ' + adText(placement);
      b.disabled = !AdService.canShow(placement) && adPlacement !== placement;
    };
    b.addEventListener('click', function () {
      if (!AdService.canShow(placement)) return;
      runAd(placement, function () { hideCard(); onReward(); });
    });
    overlayAds.push(upd); upd();
    return b;
  }
  function refreshOverlayAds() { for (let i = 0; i < overlayAds.length; i++) overlayAds[i](); }

  function showCard(nodes) {
    card.innerHTML = '';
    nodes.forEach(function (n) { card.appendChild(n); });
    overlay.classList.add('on');
  }
  function hideCard() { overlay.classList.remove('on'); overlayAds = []; dirty = true; refreshTools(); }

  function pauseGame() {
    if (!inGame || overlay.classList.contains('on') || !state || state.over || state.won) return;
    sel = -1; drag = null;
    showCard([
      el('h2', '', S.paused),
      btn(S.resume, 'primary', hideCard),
      btn(S.restart, '', function () { hideCard(); recordIfEndless(); restartRun(); }),
      btn(S.menu, '', function () { hideCard(); exitToMenu(); })
    ]);
  }

  function recordIfEndless() {
    if (state && state.mode === 'endless' && !state.recorded && state.score > 0) {
      state.recorded = true; Store.addScore(state.score, state.cleared);
    }
  }

  // called when the 'end' step starts playing: commit results, then show the card shortly after
  let resultInfo = null;
  function endRun(st) {
    const D = Store.data();
    resultInfo = { won: st.won, reason: st.reason };
    if (state.mode === 'level') {
      if (st.won) {
        const ratio = state.movesLeft / state.movesTotal;
        const stars = ratio >= 0.4 ? 3 : (ratio >= 0.15 ? 2 : 1);
        const bonus = 15 + state.level;
        D.coins += bonus;
        D.level = Math.max(D.level, Math.min(Core.LEVEL_COUNT, state.level + 1));
        D.stars[state.level] = Math.max(D.stars[state.level] || 0, stars);
        resultInfo.stars = stars; resultInfo.bonus = bonus;
      }
    } else {
      state.recorded = true;
      resultInfo.newBest = Store.addScore(state.score, state.cleared);
    }
    Store.save();
    setTimeout(showResult, 450);
  }

  function showResult() {
    if (!inGame || !state || !resultInfo) return;
    const r = resultInfo, nodes = [];
    overlayAds = [];
    Sfx.play(r.won ? 'win' : 'lose');
    if (state.mode === 'level' && r.won) {
      nodes.push(el('h2', '', S.levelComplete));
      const row = el('div', 'starrow');
      for (let i = 1; i <= 3; i++) row.innerHTML += ICON.star(i <= r.stars);
      nodes.push(row);
      nodes.push(el('div', 'gold', t('coinsEarned', { n: state.coins + r.bonus })));
      if (state.level < Core.LEVEL_COUNT) nodes.push(btn(S.next, 'primary', function () { hideCard(); startRun('level', state.level + 1); }));
      nodes.push(btn(S.replay, '', function () { hideCard(); restartRun(); }));
      nodes.push(btn(S.menu, '', function () { hideCard(); exitToMenu(); }));
    } else if (state.mode === 'level') {
      nodes.push(el('h2', '', r.reason === 'moves' ? S.outOfMoves : S.boardFull));
      nodes.push(el('div', 'muted', t('tensProgress', { a: state.cleared, b: state.target })));
      if (r.reason === 'moves') nodes.push(adBtn(S.toolMoves, 'moves', function () { reviveWith('moves'); }));
      else nodes.push(adBtn(S.revive, 'revive', function () { reviveWith('revive'); }));
      nodes.push(btn(S.retry, 'primary', function () { hideCard(); restartRun(); }));
      nodes.push(btn(S.menu, '', function () { hideCard(); exitToMenu(); }));
    } else {
      nodes.push(el('h2', '', S.gameOver));
      nodes.push(el('div', 'big', String(state.score)));
      if (r.newBest) nodes.push(el('div', 'gold', S.newBest));
      else nodes.push(el('div', 'muted', S.bestLabel + ': ' + Store.data().best));
      nodes.push(el('div', 'muted', S.tensLabel + ': ' + state.cleared));
      nodes.push(adBtn(S.revive, 'revive', function () { reviveWith('revive'); }));
      nodes.push(btn(S.playAgain, 'primary', function () { hideCard(); restartRun(); }));
      nodes.push(btn(S.menu, '', function () { hideCard(); exitToMenu(); }));
    }
    showCard(nodes);
  }

  function reviveWith(kind) {
    if (state.mode === 'endless' && state.recorded) Store.undoLastScore();
    state.recorded = false;
    resultInfo = null;
    if (kind === 'moves') { play(Core.addMoves(state, 3)); hud.moves = state.movesLeft; }
    else play(Core.revive(state));
    updateHud();
  }

  // ---------------------------------------------------------------- screens / flow
  function show(id) {
    screens.forEach(function (n) { $(n).classList.toggle('on', n === id); });
    inGame = id === 'game';
    Sfx.musicMode(id === 'game' ? 'game' : 'menu');
    overlay.classList.remove('on'); overlayAds = [];
    if (id === 'menu') refreshMenu();
    if (id === 'levels') buildLevels();
    if (id === 'scores') buildScores();
    if (id === 'settings') refreshSettings();
    if (inGame) { layout(); dirty = true; }
  }

  function startRun(mode, level) {
    state = Core.create(mode, level);
    queue = []; cur = null; drag = null; sel = -1; armed = false; charges = 0; hint = null; idle = 0;
    resultInfo = null; trayIn = 0;
    flies.forEach(function (f) { f.on = false; });
    plife.fill(0); pulse.fill(0);
    show('game');
    syncVis(); updateHud(); refreshTools();
    Sfx.play('deal');
  }
  function restartRun() { startRun(state.mode, state.level); }
  function exitToMenu() { recordIfEndless(); Store.save(); show('menu'); }

  function refreshMenu() {
    const D = Store.data();
    $('menuCoins').textContent = S.coins + ' ' + D.coins;
    $('mPlay').textContent = S.play + ' - ' + t('levelN', { n: Math.min(D.level, Core.LEVEL_COUNT) });
  }

  function buildLevels() {
    const D = Store.data(), grid = $('levelGrid');
    grid.innerHTML = '';
    for (let n = 1; n <= Core.LEVEL_COUNT; n++) {
      const b = el('button', 'lv' + (n === D.level ? ' cur' : ''));
      b.appendChild(el('span', '', String(n)));
      const st = el('span', 'stars');
      const got = D.stars[n] || 0;
      for (let i = 1; i <= 3; i++) st.innerHTML += ICON.star(i <= got);
      b.appendChild(st);
      if (n > D.level) b.disabled = true;
      b.addEventListener('click', function () { Sfx.play('click'); startRun('level', n); });
      grid.appendChild(b);
    }
  }

  function buildScores() {
    const D = Store.data(), list = $('scoreList');
    list.innerHTML = '';
    if (!D.scores.length) { list.appendChild(el('div', 'muted', S.noScores)); return; }
    D.scores.forEach(function (sc, i) {
      const row = el('div', 'item');
      row.appendChild(el('span', 'rank', String(i + 1)));
      row.appendChild(el('span', '', t('scoreRow', { score: sc.score, tens: sc.tens })));
      list.appendChild(row);
    });
  }

  function refreshSettings() {
    const D = Store.data().settings;
    [['tMusic', 'music'], ['tSfx', 'sfx'], ['tVibe', 'vibe']].forEach(function (p) {
      const b = $(p[0]);
      b.textContent = D[p[1]] ? S.on : S.off;
      b.classList.toggle('off', !D[p[1]]);
    });
  }
  function toggleSetting(key, fn) {
    const D = Store.data().settings;
    D[key] = !D[key]; Store.save(); fn(D[key]); refreshSettings(); Sfx.play('click');
  }

  // ---------------------------------------------------------------- init
  function logo() {
    const svg = $('logo');
    let out = '';
    const cols = [PAL[1], PAL[2], PAL[0], PAL[3]];
    for (let i = 0; i < 4; i++) {
      const y = 86 - i * 17, c = cols[i];
      let pts = '', side = '';
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 180 * (60 * k - 30);
        pts += (60 + 46 * Math.cos(a)).toFixed(1) + ',' + (y + 46 * 0.55 * Math.sin(a)).toFixed(1) + ' ';
        side += (60 + 46 * Math.cos(a)).toFixed(1) + ',' + (y + 9 + 46 * 0.55 * Math.sin(a)).toFixed(1) + ' ';
      }
      out += '<polygon points="' + side + '" fill="' + shade(c, -0.42) + '"/><polygon points="' + pts + '" fill="' + c + '" stroke="' + shade(c, 0.25) + '" stroke-width="1.5"/>';
    }
    svg.innerHTML = out;
  }

  function init() {
    Store.load();
    const D = Store.data();
    Sfx.setMusic(D.settings.music); Sfx.setSfx(D.settings.sfx); Sfx.setVibe(D.settings.vibe);
    AdService.init();

    document.querySelectorAll('[data-s]').forEach(function (n) { n.textContent = S[n.getAttribute('data-s')]; });
    $('btnPause').innerHTML = ICON.pause;
    buildTool('toolSwap', 'toolSwap', ICON.swap, 'swap');
    buildTool('toolBomb', 'toolBomb', ICON.bomb, 'bomb');
    buildTool('toolMoves', 'toolMovesShort', ICON.moves, 'moves');
    logo();

    $('btnPause').addEventListener('click', function () { Sfx.play('click'); pauseGame(); });
    $('toolSwap').addEventListener('click', onSwap);
    $('toolBomb').addEventListener('click', onBomb);
    $('toolMoves').addEventListener('click', onMoves);
    $('mPlay').addEventListener('click', function () { Sfx.unlock(); Sfx.play('click'); startRun('level', Math.min(Store.data().level, Core.LEVEL_COUNT)); });
    $('mEndless').addEventListener('click', function () { Sfx.unlock(); Sfx.play('click'); startRun('endless', 0); });
    $('mLevels').addEventListener('click', function () { Sfx.unlock(); Sfx.play('click'); show('levels'); });
    $('mScores').addEventListener('click', function () { Sfx.unlock(); Sfx.play('click'); show('scores'); });
    $('mSettings').addEventListener('click', function () { Sfx.unlock(); Sfx.play('click'); show('settings'); });
    document.querySelectorAll('.back').forEach(function (b) { b.addEventListener('click', function () { Sfx.play('click'); show('menu'); }); });
    $('tMusic').addEventListener('click', function () { Sfx.unlock(); toggleSetting('music', Sfx.setMusic); });
    $('tSfx').addEventListener('click', function () { toggleSetting('sfx', Sfx.setSfx); });
    $('tVibe').addEventListener('click', function () { toggleSetting('vibe', Sfx.setVibe); });

    window.addEventListener('resize', function () { if (inGame) layout(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { Sfx.suspend(); pauseGame(); } else Sfx.resume();
    });

    // Android hardware back button (works when @capacitor/app is installed)
    try {
      const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (App && App.addListener) {
        App.addListener('backButton', function () {
          if (overlay.classList.contains('on')) { if (state && !state.over && !state.won) hideCard(); else exitToMenu(); }
          else if (inGame) pauseGame();
          else if ($('menu').classList.contains('on')) App.exitApp();
          else show('menu');
        });
      }
    } catch (e) { /* not running inside Capacitor */ }

    // low-power tick for ad buttons (cooldown numbers)
    setInterval(function () { if (inGame && state) refreshTools(); }, 500);

    show('menu');
    let last = performance.now();
    (function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!inGame || !state) return;
      update(dt);
      if (dirty || animating()) draw();
    })(last);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // tiny hook for tools/smoke.js
  window.__hexa = {
    startRun: startRun, getState: function () { return state; }, play: play,
    busy: function () { return !!(cur || queue.length); },
    tick: function (dt) { update(dt); draw(); },
    geom: function () { return { slotX: slotX.slice(), trayBase: trayBase, cx: Array.from(cx), cy: Array.from(cy), lift: LIFT, s: s }; }
  };
})();
