# Focused arena polish

The owner reported that the original private preview works. That is a successful manual smoke test, not an exhaustive phone-performance or controller test.

## Behavior

Standard-mapped Gamepad API controllers use left stick or D-pad movement, Cross (0) jump/double-jump, Square (2) held fire, Circle (1) equip/swap and Options (9) pause/resume. D-pad takes priority over the stick. The stick has a rescaled 20% dead zone; opposing D-pad directions cancel. Jump, equip and pause consume rising edges; fire is independent of movement and jumping. Unmapped controllers are ignored rather than guessed from a name.

Connection/replacement, disconnect, blur, visibility, pause and restart suppress held controller inputs until release; sticks must return to neutral. Disconnect pauses the game. Releasing Options then pressing it again resumes. Keyboard and independent touch pointers remain available. The in-arena hint and equip prompt follow the last active device. Touch controls remain usable when a controller is active.

The bot's `BotConfig.reactionDelay` defaults to 0.24 seconds (clamped to 0.08–1). It samples the opponent on that cadence and requires another continuous reaction window with safe sight before opening fire. A vertical dodge or obstruction cancels that window. A short gold **BOT · AIMING** label makes the opening readable. This is deterministic; there is no random aim or decision jitter. The bot still uses the same movement, double jumps, ammunition, cooldowns and projectile collision as the player. Shotgun range and rocket self-danger distance constrain firing. It ignores empty pickups and only swaps when unarmed/empty.

Routes retain their waypoint until landing, accept only ledges within the double-jump height, and expire after `routeTimeout` (2.4 seconds by default). A failed waypoint is avoided for the rest of that round; direct jumps above the reachable height are rejected. Normal rounds reset all bot memory. Regression scenarios cover upper-platform pursuit on every real layout, finite jumps/ammo, configurable reaction timing, dodge cancellation, deterministic replay and pickup discipline.

Pistol has a short high crack; shotgun a broad noisy low blast; rocket a sustained rising tone and low exhaust. All are synthesized with bounded, self-disconnecting audio nodes. Shotgun flashes are wider, rockets have a short layered exhaust trail, and all existing particle caps remain. Nearby guns get an outline; pickup prompts show action, weapon and remaining shots. Empty loadouts explicitly say **EMPTY · SWAP GUN**. Landscape loadout and equip text are larger. Artwork, proportions, complete KO, one-hit rounds, double jump, three layouts and first-to-five remain unchanged. Classic, Vite's `/duck-fury/` base and the main-only Pages workflow are preserved.

## Verification and limits

Baseline encounters were played through the real browser with keyboard movement/equip/jump on all three layouts before bot edits. Recorded baseline rounds showed quick bot wins. After the changes, normal encounters were replayed on all three layouts. Automated upper-platform scenarios supplement this ordinary play; they do not establish overall difficulty balance for every player.

Final local checks: `npm test` passed **62 unit cases**; `npm run build` passed; `QA_BASELINE=1 QA_REFERENCE=1 npm run test:browser` passed **18 checks**, including all 16 preserved checks. `git diff --check` passed. Normal-round landscape video and gameplay/UI captures are produced under `qa-captures/`; CI uploads these as review artifacts and publishes screenshots to its separate evidence branch.

Local Chromium is usable in this environment when run outside the command sandbox, unlike the previous session. Final command results and screenshots are recorded in PR #2. Gamepad tests emulate `navigator.getGamepads()` with standard mappings; touch checks use Chromium CDP and a landscape mobile viewport. Neither establishes physical DualShock 4, Bluetooth mapping, OnePlus 13 rendering speed, thermal behavior, or mobile audio quality. No physical hardware was available during this pass. The owner's earlier preview smoke test is separate evidence.

The non-deploying PR workflow continues to run the full unit/build/browser suite and publish captures separately. GitHub Pages is neither merged nor deployed by this pass.

## DualShock 4 + OnePlus 13 / Chrome checklist

- Pair the DS4, open the private preview in landscape, tap Start, and verify controller hints appear after input.
- Move with left stick and D-pad; check neutral drift and opposing directions. Hold movement + Square, tap Cross twice, and verify movement, shooting and double jump together.
- Equip/swap with Circle; confirm pickup ammo and the empty-gun message. Compare all three weapon sounds, flashes and trails with sound enabled.
- Tap Options to pause; hold it to confirm no repeated toggles, release and tap again to resume. Held movement/fire should require release after resume.
- Disconnect/reconnect while holding movement/fire. Confirm pause, no stuck movement/shots, and clean control after neutral/release. Repeat after switching tabs or locking the phone.
- Use the touch pad, Jump and Fire together, then return to the controller. Play all three layouts; check bot aim cues, dodging/counterfire, readable ammo, fullscreen/safe areas and sustained frame pacing.
