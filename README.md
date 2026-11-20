# Hexa Stack

Offline hex-tile stacking puzzle for Android (portrait, one hand, touch only). Plain HTML5 canvas + vanilla JS in a Capacitor wrapper - same stack and build method as `merge-defense`.

**How to play:** drag one of the 3 stacks from the bottom onto an empty hex. If a neighbouring stack has the same colour on top, those tiles hop over and merge. Get 10 tiles of one colour on top of a stack and they vanish. Chain clears for combos. The board full = game over.
Modes: 20 levels (collect N tens in M moves) and Endless (best score, local table).

## Run locally
```bash
npm install            # once (only needed for tests / APK)
npm start              # serves www/ on http://localhost:8080 - open in a browser, use device mode (portrait)
npm run sim            # balance check: a bot plays all levels + endless
npm run smoke          # headless UI test (menus, drag input, rewarded flow, win/lose/revive)
```
`www/index.html` also works from any static server; there is no build step for the game itself.

## Build the APK
Every push runs `.github/workflows/build-apk.yml`: sanity tests -> `npx cap add android` -> portrait lock + vibration permission -> Gradle debug build.
Download **hexa-stack-apk** from the run's *Artifacts* section (Actions tab) and install `hexa-stack.apk`.

Locally (needs JDK 21 + Android SDK): `npm ci && npx cap add android && npx cap sync android && cd android && ./gradlew assembleDebug -I ../android-signing.gradle`

`keystore/debug.keystore` is a fixed DEBUG key so new builds install over old ones. **It is not for Google Play** - a Play release needs your own release keystore and an AAB (`./gradlew bundleRelease`); not set up yet.

## Where things are
| What | File |
|---|---|
| All UI text (English; translate here only) | `www/strings.js` |
| Game rules, board, levels table (`LV`), endless ramp | `www/core.js` |
| Rendering, input, HUD, menus, rewarded flows | `www/main.js` |
| **Rewarded video** (simulated, swap for AdMob) | `www/adservice.js` |
| Sounds + music (Web Audio, no files), vibration | `www/audio.js` |
| Saved progress (level, stars, coins, settings, best, top-10) | `www/storage.js` (localStorage key `hexastack_v1`) |
| Settings screen | Menu -> Settings (music / sound effects / vibration, saved) |
| Tunables | `core.js`: `LV` (colors, tens, moves, prefill, stack size), `CLEAR_N`, `MAX_H`; `adservice.js`: `CFG` (countdown, cooldown) |

## Rewarded ads (the only monetisation)
No banners, no interstitials. Placements: `swap`, `bomb`, `moves` (+3 moves), `revive`. The simulated ad counts down on the button (3 s), grants the reward, then the placement has a 20 s cooldown.
To use real AdMob: implement `init()` and `show(placement, onTick)` in `www/adservice.js` (e.g. with `@capacitor-community/admob` rewarded ads), keeping the same return value `{rewarded: boolean}`. Nothing else in the game talks to ads.
