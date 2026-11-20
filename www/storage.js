// Hexa Stack - local progress (level, stars, coins, settings, best score, score table)
(function (root) {
  'use strict';

  const KEY = 'hexastack_v1';
  const defaults = function () {
    return { level: 1, stars: {}, coins: 0, best: 0, scores: [], settings: { music: true, sfx: true, vibe: true } };
  };
  let data = defaults();
  let lastDate = 0;

  function load() {
    try {
      const raw = root.localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        data = Object.assign(defaults(), o);
        data.settings = Object.assign(defaults().settings, o.settings || {});
        if (!Array.isArray(data.scores)) data.scores = [];
      }
    } catch (e) { data = defaults(); }
    return data;
  }

  function save() {
    try { root.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage full / blocked */ }
  }

  // returns true if it is a new best
  function addScore(score, tens) {
    if (score <= 0) return false;
    const isBest = score > data.best;
    if (isBest) data.best = score;
    lastDate = Date.now();
    data.scores.push({ score: score, tens: tens, date: lastDate });
    data.scores.sort(function (a, b) { return b.score - a.score; });
    data.scores.length = Math.min(data.scores.length, 10);
    save();
    return isBest;
  }

  // remove the score added last (used when a run is revived and continues)
  function undoLastScore() {
    data.scores = data.scores.filter(function (x) { return x.date !== lastDate; });
    save();
  }

  root.Store = {
    undoLastScore: undoLastScore,
    data: function () { return data; },
    load: load, save: save, addScore: addScore
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
