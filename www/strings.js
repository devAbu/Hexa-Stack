// Hexa Stack - ALL user-facing text lives here (translate this file only).
// Placeholders like {n} are filled by t('key', {n: 3}).
(function (root) {
  'use strict';

  const S = {
    title: 'Hexa Stack',
    play: 'Play',
    levelN: 'Level {n}',
    endless: 'Endless',
    levels: 'Levels',
    bestScores: 'Best scores',
    settings: 'Settings',
    back: 'Back',
    music: 'Music',
    sfx: 'Sound effects',
    vibration: 'Vibration',
    on: 'ON',
    off: 'OFF',
    coins: 'Coins',

    paused: 'Paused',
    resume: 'Resume',
    restart: 'Restart',
    menu: 'Menu',

    movesLabel: 'Moves',
    bestLabel: 'Best',
    scoreN: 'Score {n}',
    tensProgress: '{a} / {b}',
    comboN: 'Combo x{n}',

    levelComplete: 'Level complete!',
    outOfMoves: 'Out of moves',
    boardFull: 'Board is full',
    gameOver: 'Game over',
    next: 'Next level',
    replay: 'Replay',
    retry: 'Try again',
    playAgain: 'Play again',
    newBest: 'New best!',
    scoreLabel: 'Score',
    tensLabel: 'Tens',
    coinsEarned: '+{n} coins',

    toolSwap: 'Swap',
    toolBomb: 'Bomb',
    toolMoves: '+3 Moves',
    toolMovesShort: 'Moves',
    revive: 'Revive',
    adTag: 'AD',
    adCountdown: '{n}',
    adCooldown: '{n}s',

    noScores: 'No scores yet. Play Endless!',
    locked: 'Locked',
    scoreRow: '{score} pts  -  {tens} tens'
  };

  function t(key, vars) {
    let s = S[key];
    if (s === undefined) return key;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }

  root.Strings = { S: S, t: t };
})(typeof globalThis !== 'undefined' ? globalThis : this);
