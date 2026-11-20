// Hexa Stack - sound effects + music, synthesized with Web Audio (no files, works offline).
// Separate switches for music and effects, plus vibration.
(function (root) {
  'use strict';

  let ctx = null, master = null, sfxBus = null, musBus = null, delay = null, noiseBuf = null;
  let sfxOn = true, musicOn = true, vibeOn = true;
  let mode = 'off';            // 'off' | 'menu' | 'game'
  let timer = null, nextTime = 0, step = 0, active = 0;

  const midi = function (n) { return 440 * Math.pow(2, (n - 69) / 12); };

  function init() {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = musicOn ? 0.3 : 0; musBus.connect(master);
    delay = ctx.createDelay(1); delay.delayTime.value = 0.32;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const dl = ctx.createGain(); dl.gain.value = 0.33;
    delay.connect(fb); fb.connect(delay); delay.connect(dl); dl.connect(musBus);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function tone(freq, dur, type, vol, slideTo, delaySec, bus) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delaySec || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.03);
    active++; o.onended = function () { active--; };
  }

  function noise(dur, f0, f1, vol, delaySec) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delaySec || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
    active++; src.onended = function () { active--; };
  }

  const SFX = {
    click: function () { tone(660, 0.07, 'triangle', 0.18); },
    pick: function () { tone(520, 0.09, 'sine', 0.2, 760); },
    place: function () { tone(180, 0.14, 'sine', 0.35, 90); tone(320, 0.06, 'triangle', 0.1); },
    hop: function (i) { tone(midi(64 + Math.min(i, 9) * 2), 0.11, 'triangle', 0.16, midi(68 + Math.min(i, 9) * 2)); },
    clear: function (combo) {
      const c = Math.min(combo || 1, 6);
      noise(0.55, 400, 5200, 0.5);
      for (let i = 0; i < 4; i++) tone(midi(72 + c * 2 + [0, 4, 7, 12][i]), 0.35, 'sine', 0.18, null, i * 0.055);
    },
    bomb: function () { noise(0.5, 1800, 120, 0.7); tone(120, 0.35, 'sawtooth', 0.3, 40); },
    deal: function () { tone(440, 0.06, 'triangle', 0.12); tone(554, 0.06, 'triangle', 0.12, null, 0.06); tone(659, 0.08, 'triangle', 0.12, null, 0.12); },
    spawn: function () { tone(150, 0.18, 'square', 0.12, 80); },
    win: function () { [0, 4, 7, 12, 16].forEach(function (n, i) { tone(midi(67 + n), 0.4, 'triangle', 0.25, null, i * 0.1); }); },
    lose: function () { [0, -3, -7].forEach(function (n, i) { tone(midi(62 + n), 0.5, 'sine', 0.3, null, i * 0.16); }); },
    reward: function () { [0, 7, 12].forEach(function (n, i) { tone(midi(76 + n), 0.22, 'sine', 0.22, null, i * 0.08); }); },
    error: function () { tone(200, 0.12, 'square', 0.1, 140); }
  };

  // ---- music: slow generative pad + sparse pentatonic pluck ----
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const PENTA = [69, 72, 74, 76, 79, 81];
  const BEAT = 0.75;

  function schedule() {
    if (!ctx || mode === 'off' || !musicOn) return;
    while (nextTime < ctx.currentTime + 0.3) {
      const t = nextTime - ctx.currentTime;
      const bar = (step >> 3) & 3;
      if (step % 8 === 0) {
        CHORDS[bar].forEach(function (n) { tone(midi(n), BEAT * 7, 'triangle', 0.07, null, Math.max(0, t), musBus); });
      }
      if (Math.random() < (mode === 'game' ? 0.55 : 0.4) && step % 2 === 0) {
        const n = PENTA[(Math.random() * PENTA.length) | 0];
        const o = ctx.createOscillator(), g = ctx.createGain();
        const t0 = ctx.currentTime + Math.max(0, t);
        o.type = 'sine'; o.frequency.value = midi(n);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
        o.connect(g); g.connect(musBus); g.connect(delay);
        o.start(t0); o.stop(t0 + 1.2);
      }
      nextTime += BEAT / 2; step++;
    }
  }

  function startMusic() {
    if (timer || !ctx || !musicOn || mode === 'off') return;
    nextTime = ctx.currentTime + 0.1;
    timer = setInterval(schedule, 120);
  }
  function stopMusic() { if (timer) { clearInterval(timer); timer = null; } }

  const Sfx = {
    unlock: function () {
      if (!init()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (musicOn && mode !== 'off') startMusic();
    },
    play: function (name, arg) {
      if (!sfxOn || !ctx || active > 18) return;
      const f = SFX[name];
      if (f) f(arg);
    },
    vib: function (ms) {
      if (!vibeOn) return;
      try { if (root.navigator && root.navigator.vibrate) root.navigator.vibrate(ms); } catch (e) { /* ignore */ }
    },
    setSfx: function (on) { sfxOn = on; if (sfxBus) sfxBus.gain.value = on ? 1 : 0; },
    setMusic: function (on) {
      musicOn = on;
      if (musBus) musBus.gain.value = on ? 0.3 : 0;
      if (on) startMusic(); else stopMusic();
    },
    setVibe: function (on) { vibeOn = on; },
    musicMode: function (m) {
      mode = m;
      if (m === 'off') stopMusic(); else startMusic();
    },
    suspend: function () { stopMusic(); if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume: function () { if (ctx) { ctx.resume(); startMusic(); } }
  };

  root.Sfx = Sfx;
})(typeof globalThis !== 'undefined' ? globalThis : this);
