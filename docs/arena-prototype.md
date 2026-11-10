# Last Duck Standing — arena prototype

The default game is now a platform arena shooter inspired by the short, one-hit rounds and weapon scavenging of Duck Game. DUCK FURY keeps its original warrior-duck artwork, scarf animation and painted wasteland. No Duck Game assets or level layouts are included.

## Play

- One human player versus one bot. First to five round wins.
- A / D or left / right: move and face. Space / W / up / K: jump; press again for one air jump.
- Hold J / Z: fire. E: equip or swap a nearby gun, preserving ammunition in the dropped gun.
- S / down: drop through a raised platform. Escape / P: pause.
- Landscape touch: independent movement, jump, fire and equip pointers, with capture/cancellation handling.
- Standard-mapped Gamepad API input is included: left stick, bottom button jump, left button fire, right button equip, Start pause. Physical controller support is not yet verified.

Every round starts unarmed, with a countdown and freshly placed weapons. There are three original industrial platform layouts. A scrap pistol, five-pellet shotgun and self-dangerous rocket launcher have distinct ammunition, cadence, speed, range and recoil. The bot finds weapons, follows reachable ledges and shoots only when its horizontal line of sight is clear. One bullet kills. Simultaneous deaths and 45-second stalemates are draws. The next round follows the KO; the fifth win opens the replay screen.

The classic brawler is preserved at `/duck-fury/classic.html`, including its existing HUD, controls, combat and tests. The home page links to it. Vite builds both entry points beneath the original `/duck-fury/` base. The existing main-only Pages workflow is unchanged.

## Architecture

- `src/arena/ArenaWorld.ts`: deterministic model, one-way landing, coyote time, buffered/double jumps, swept projectile collision, blast occlusion, scoring, bot routes, bounded projectiles/pickups and fixed 120 Hz accumulator.
- `ArenaControls.ts`: keyboard, pointer ownership, cancellation and standard gamepad polling. Pause/visibility/restart reset input and accumulated time; the first resumed elapsed frame is ignored.
- `ShooterScene.ts`: sole Phaser update/render loop, three platform sets, original procedural gun silhouettes, capped particles, scoreboard, loadout and round/match overlays.
- `ArenaDuckView.ts`: the approved segmented rig at constant arena scale, air poses, articulated weapon grips and existing full KO. A simple original duck silhouette remains playable if the rig cannot load.
- `RigCharacterView` accepts an optional presentation state. The existing classic default is unchanged.

Presentation continues independently after a kill. Both actors can finish landing, the victim completes its existing KO, and the winner idles. Match-over input cannot restart combat. Full reset replaces the world and resets all actor presentation while immutable assets remain cached.

## Verification

Local commands: `npm install --no-audit --no-fund`, `npm test`, `npm run build`. Node.js 24 is required for the native TypeScript unit-test runner. `npm test` now uses `node --test` so it does not need the tsx CLI's Unix IPC pipe.

The 39 existing tests are preserved, plus 15 arena regressions for countdown, double jump, platforms/drop-through, swapping ammo, swept hits and draws, weapon limits, projectile blocking/self-blast, ordinary bot play, upper-platform routing, match/reset, arena cycling, fixed-rate input/resource bounds and collision edge cases.

Seven additional Playwright scenarios exercise actual equipment/bot play, jumping/drop-through, one-hit scoring/KO/next arena, first-to-five/replay, pause/visibility, three simultaneous touch pointers/cancellation/rotation, production assets/classic entry and missing-rig fallback. The existing classic scenarios navigate to `classic.html`; the baseline fixture remains unchanged.

Local Chromium launch is blocked by the executor's Unix-socket restriction (`socket() failed: Operation not permitted`). The shared browser also cannot reach the local development server (`ERR_CONNECTION_REFUSED`). Browser verification and real screenshots therefore run in the existing non-deploying PR workflow. Review its actual results rather than assuming local browser coverage.

Current scope: solo versus a bot, keyboard and touch. Online multiplayer, local two-player setup, controller hardware verification and physical Android performance verification are not part of this first prototype. No merge or production deployment is performed by preparing this branch.
