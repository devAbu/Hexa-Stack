// Hexa Stack - rewarded video service.
//
// The WHOLE game talks to ads only through this object, so replacing the simulation
// with a real AdMob rewarded ad means editing ONLY the body of show() (and init()).
//
// Contract:
//   AdService.init()                  -> Promise, call once at startup
//   AdService.isBusy()                -> true while an ad is showing
//   AdService.cooldownLeft(placement) -> ms until this placement can show again
//   AdService.canShow(placement)      -> boolean
//   AdService.show(placement, onTick) -> Promise<{rewarded: boolean, reason?: string}>
//        onTick(secondsLeft) is called while the (simulated) ad runs.
//
// Placements used by the game: 'swap', 'bomb', 'moves', 'revive'.
(function (root) {
  'use strict';

  const CFG = { countdownMs: 3000, cooldownMs: 20000 };
  const readyAt = {};
  let busy = false;

  const AdService = {
    init: function () { return Promise.resolve(); },

    isBusy: function () { return busy; },

    cooldownLeft: function (placement) {
      return Math.max(0, (readyAt[placement] || 0) - Date.now());
    },

    canShow: function (placement) {
      return !busy && this.cooldownLeft(placement) === 0;
    },

    // ---- SIMULATION. Replace with the real AdMob rewarded flow later. ----
    show: function (placement, onTick) {
      if (!this.canShow(placement)) {
        return Promise.resolve({ rewarded: false, reason: busy ? 'busy' : 'cooldown' });
      }
      busy = true;
      const end = Date.now() + CFG.countdownMs;
      if (onTick) onTick(Math.ceil(CFG.countdownMs / 1000));
      return new Promise(function (resolve) {
        const iv = setInterval(function () {
          const left = end - Date.now();
          if (left <= 0) {
            clearInterval(iv);
            busy = false;
            readyAt[placement] = Date.now() + CFG.cooldownMs;
            resolve({ rewarded: true });
          } else if (onTick) {
            onTick(Math.ceil(left / 1000));
          }
        }, 100);
      });
    }
  };

  root.AdService = AdService;
})(typeof globalThis !== 'undefined' ? globalThis : this);
