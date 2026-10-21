# Approved segmented-art integration

The twelve transparent rig parts and `scrap-road.webp` come byte-for-byte from the supplied `duck-fury-codex-handoff.zip`, prepared against commit `a2d111c0033b3ed92036bed8234f435f08ac8ab3`. They are approved artwork, not newly generated approximations. `rig-definition.json` preserves the original dimensions, SHA-256 hashes, pivots, crops, layer order, and source provenance paths; runtime files live under `public/assets/rig/` and `public/assets/world/`. The asset regression test verifies every source image against those hashes.

## Renderer and coordinate adapter

`CharacterView` selects a complete segmented rig first, then a valid existing frame sheet, then the procedural duck. The existing sheet manifest and validation remain independent. Missing or mis-sized rig parts disable the rig while a missing panorama falls back to the old scenery independently.

`RigCharacterView` draws through Phaser's Canvas render hook and camera/container matrix, with no iframe, duplicate game loop, per-frame full-character rasterization, or global mutable current actor. The normal head retains its merged short collar; `headKO` supplies blink and unconscious eyes. Arm segments remain 55+55, legs 65+65, arm thickness 1.18. The supplied pivots, shin crop/boot split, 16 overlapping scarf strips, and far-to-near layer order are retained. Variant canvases are prepared once during preload, producing 64 immutable source/variant images shared between actors. Wounds are drawn per actor and never painted into shared textures.

`RigState` owns each fighter's ambient clock, gait, springs, wounds, transitions, contact anchor, and KO capture. The local root remains (250,382). The fixed global fitting multiplier is 1.2, multiplied by .84..98 across world Y=460..635. Death captures that scale and the current live bones once. KO interpolates the approved recoil/buckle/tip/contact/rebound/rest sequence to source time 1.25, then freezes the whole actor, including springs. Restart clears all mutable presentation state.

The stationary hip baseline is `242 - 14 * (1 - gait)` with breathing and action offsets added afterward. Idle ankles stay at (226,354) and (274,354). Ready-screen idle runs without combat/AI; pause freezes it. Gait follows actual movement, not another movement simulation. Incoming attack progress is mapped piecewise so maximum reference extension occurs at the authoritative impact time. Active limbs can aim toward the opponent's upper torso using fixed-length IK; a successful hit locks the contact point for the rest of that attack. No damage/range/balance values are copied from the reference.

## Clock and hit effects

`FrameStepper` consumes wall time at 120 Hz, bounded to .25 seconds / 30 ticks per frame. Controls are sampled once per rendered frame. Held directions apply to each combat step, press edges survive zero-step frames and hit-stop, and each edge is consumed once. Hit-stop consumes ticks without banking catch-up debt. Pause, visibility changes, replay, and resume reset debt/input; `CombatWorld.step` retains its direct-call stall cap. The 1.3 reference cadence affects ambient/KO/effects presentation, not combat speed.

Successful combat hit events alone create blood and victim wounds. Third punches and kicks emit stronger bursts. Droplets and fading world-anchored decals are capped at 96 each; wounds cap at four levels per fighter and follow the head/torso transforms. Misses create none. Results wait until the renderer finishes KO; the legacy .85-second minimum remains for non-rig rendering. Expiring effects may finish after results while combat and actors remain stopped.

The panorama is reframed behind the scene, with rear asphalt Y=434 and a 24-pixel fade, leaving Y=460..635 clear. Background parallax is .38; road tiles track the world at 1; dust uses .65. Cached mirrored road tiles are culled outside the viewport. Decals use world coordinates and Phaser applies the camera exactly once.

## Verification and review

Commands:

```sh
npm install
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The PR-only `verify.yml` workflow runs Node.js 24 unit tests/build plus Chromium checks, production-prefix/MIME checks, real CDP simultaneous touch inputs, pause/visibility/rotation, KO/reset/resource checks, and before/after screenshots. It checks out the original baseline separately for before captures. The `rig-comparison-screenshots` Actions artifact contains the images; `rig-integration-verification` contains the HTML report and failure traces. Artifacts expire after 14 days. For same-repository PRs, a separate job also preserves the actual captures under `docs/qa/` on `codex/rig-evidence-pr-<number>`, leaving the source PR and `main` untouched. This is desktop headless browser and mobile viewport emulation, not physical Android testing.

The browser suite also records 120 requestAnimationFrame intervals in `headless-frame-pacing.json` for the tested CI environment. This diagnostic is not a phone frame-rate claim. Repeated replay checks compare texture/variant counts and clear transient objects, blood, wounds, and KO state.

The existing Pages workflow remains main-only. This feature branch and PR must not be deployed or merged automatically. Physical Android verification remains a separate acceptance check when a device is available. Camera-edge appearance, neck/limb overlaps, upright stance, attack contact, and settled KO must be reviewed against the handoff's approved captures and runnable reference; native reference checks do not substitute for integrated-browser verification.
