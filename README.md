# DUCK FURY

A playable, original 2D beat ’em up prototype built with **Phaser 3, TypeScript, Vite, and HTML5 Canvas**. Play as Rook, an armored wasteland duck, and defeat Dustjaw at an abandoned desert gas station. All characters, scenery, effects, and interface icons are drawn programmatically; no external art assets are required.

## Run locally

Use Node.js **22.12 or newer** and npm. From this project directory:

```sh
npm install
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`. Click **Enter the wasteland** or press **Enter**. The encounter waits for you to start.

```sh
npm test          # deterministic combat tests
npm run build    # TypeScript validation and production build
npm run preview  # serve the production build, usually on port 4173
```

## Controls and combat

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Drag the directional pad |
| Punch | J or Z | Tap Punch |
| Kick | K or X | Tap Kick |
| Start | Enter | Enter the wasteland |
| Pause / resume | Escape or P | Pause button |

Movement and attack touch controls support simultaneous pointers. Hold the pad with one thumb and tap an attack with the other. Punches use separate presses; tap three times to chain a jab, cross, and finishing punch. A press during the current attack is buffered until it finishes. A pause between punches resets the combo. Kicks have more reach and knockback, with a longer recovery.

Face your opponent and stay in the same movement lane to connect. Dustjaw approaches and visibly winds up before attacking; move up or down to dodge. Hits cause damage, a brief stagger, and knockback. Short invulnerability after taking damage prevents repeated contact damage from one swing. Player and enemy health are shown on screen.

The encounter ends when either fighter runs out of health. Use the encounter replay/restart control to try again. The game pauses when the page loses visibility. Sound effects are synthesized locally, begin after user interaction, and can be muted with the sound button.

## Test on Android

1. Connect an Android phone and your development computer to the same Wi-Fi/LAN.
2. Run `npm run dev` on the computer. The script binds Vite to `0.0.0.0`, allowing LAN connections.
3. Find the computer's LAN IPv4 address: use `ipconfig` on Windows, `ip addr` on Linux, or the active Wi-Fi connection details on macOS. For example, `192.168.1.42`.
4. Open `http://192.168.1.42:5173` in Chrome on the phone, replacing the example address and using Vite's printed port if it changed. `localhost` on the phone refers to the phone itself.
5. Turn the phone to landscape and start the encounter. Check moving and punching simultaneously, diagonal movement, kicks, pause/resume, and replay. Rotate to portrait to check the orientation prompt, then return to landscape.
6. Switch to another app and return to verify that the encounter pauses. Test both muted and enabled sound after tapping Start.

If the page cannot connect, check the computer's firewall for the Vite port and whether the Wi-Fi network blocks connections between devices. A remote development workspace needs its own forwarded URL; a remote workspace's private address is generally not reachable from a phone on your home LAN. A deployed HTTPS version can also be tested directly in Android Chrome.

The layout scales a landscape arena into the available viewport and includes touch controls and safe-area spacing. Browser fullscreen is optional and depends on browser support; rotating the device to landscape works without fullscreen. Physical-device testing is recommended before a release.

## Static deployment

The `.github/workflows/deploy.yml` workflow runs on pushes to `main` and can also be started manually from GitHub Actions. It uses Node.js 24, runs `npm install`, `npm test`, and `npm run build`, then uploads and deploys `dist/` using the official GitHub Pages Actions. Because no `package-lock.json` is committed, installation uses `npm install` without lockfile-based dependency caching.

In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. After a successful deployment, open `https://ghostcod3.github.io/duck-fury/` in Android Chrome and turn the phone to landscape; no development computer is required to play the hosted game.

Vite uses `base: '/duck-fury/'` to match this GitHub Pages project URL. For another host or URL prefix, adjust the base before running `npm run build`, then upload the **contents of `dist/`**. This prototype has no backend, account service, database, or server-side routing requirement.

Serve the build over HTTP or HTTPS; opening `dist/index.html` with a `file://` URL is not the supported launch path. `npm run preview` is useful for checking the built files locally; with this base, open the printed host URL followed by `/duck-fury/`.

## Project structure

```text
index.html                 Page, HUD, start/pause/result overlays, help, touch controls
src/main.ts                Application entry and Phaser integration
src/style.css              Responsive desktop/mobile layout
src/art/DuckView.ts         Procedural duck character drawing and combat poses
src/art/world.ts            Procedural gas station, desert, and parallax scenery
src/game/combat.ts          Pure TypeScript movement, combat, enemy AI, and encounter state
tests/combat.test.ts        Deterministic gameplay tests without a browser
vite.config.ts             GitHub Pages asset base and build configuration
.github/workflows/deploy.yml Automated tests, production build, and Pages deployment
```

`CombatWorld` is independent of Phaser. Create a new instance for a fresh encounter and call:

```ts
const events = world.step(deltaSeconds, {
  x: horizontalInput, // -1 to 1
  y: verticalInput,   // -1 to 1
  punch: punchPressedThisFrame,
  kick: kickPressedThisFrame,
});
```

The simulation exposes `player`, `enemy`, `status` (`playing`, `won`, or `lost`), elapsed `time`, and the current punch `combo`. Each fighter exposes position, facing, health, movement, attack kind, normalized attack progress, hurt state, and death state. Returned `attack`, `hit`, and `death` events drive visual/audio feedback. On attack events, `target` identifies the attacker; on hit and death events, it identifies the affected fighter.

The world is 2,600 units wide. Walkable lanes span Y=460–635, with depth sorting tied to each fighter's Y position. Frontal reach and lane tolerance determine hits; each swing can hit only once. Arena boundaries and fighter separation provide basic collisions. Decorative environment props do not block movement. Frame deltas are capped at 50 ms so a stalled frame cannot skip an entire enemy windup.

The automated tests cover normalized movement and bounds, frame-stall handling, attack direction and lanes, buffered three-hit combos, damage once per attack, combo timeout, kick knockback, AI pursuit and telegraphing, lane dodges, both encounter outcomes, and fighter separation at arena edges. Browser and Android interaction checks complement these simulation tests.

## Optional hand-drawn character sprites

The renderer supports transparent sprite sheets with idle, walk, attack/combo, hurt, and death states. It currently ships with an empty character manifest and continues to display the original procedural ducks. **Final hand-drawn character artwork is not included.**

See [the character sprite contract](docs/character-sprites.md) for Rook and Dustjaw's art direction, required frames, cell dimensions, ground anchors, a complete manifest example, asset loading/fallback behavior, and Android acceptance checks. Adding complete, validated packs in `public/assets/characters/` enables the sprite renderer without changing combat or controls.

## Prototype scope

This is one small, complete encounter with one enemy, one environment, a scrolling camera, and replay. Artwork uses original procedural placeholders and pose animation rather than a finished hand-drawn sprite library. There are no additional levels, enemy waves, pickups, persistent progress, multiplayer, or offline installation features. Balance and animation are intentionally kept compact so the combat loop can be tested and extended.
