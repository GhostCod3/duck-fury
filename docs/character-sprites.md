# Character sprite asset contract

This upgrade provides the loader, validation, animation-state selection, and sprite renderer. **No final hand-drawn character artwork is included.** The shipped manifest is intentionally empty, so the original procedural Rook and Dustjaw remain the visible characters.

## Art direction

Create original, serious, intimidating wasteland warriors with duck heads and large, powerful human-like bodies. Use a readable three-quarter side view suitable for movement across a shallow fighting plane. Aim for detailed hand-drawn 2D animation, with consistent silhouettes, lighting, volumes, scars, leather, weathered metal, rust, and improvised armor. Do not copy characters, poses, costumes, or assets from another game.

- **Rook:** white feathers, a muscular survivor's build, a red scarf, and improvised tactical armor. Preserve his face and scarf silhouette across punches and direction changes.
- **Dustjaw:** larger and heavier than Rook, brutal raider proportions, an aggressive expression, a red mohawk, and spiked shoulder armor. His attack must have a visible windup.

Author genuine distinct poses for every clip. A single image with position/scale changes is not an animation. The renderer rejects clips with fewer than two distinct frame indices; artists must also ensure those indices contain distinct authored poses.

## Files and export

1. Add the transparent sheets to `public/assets/characters/rook.png` and `public/assets/characters/dustjaw.png` (RGBA PNG preferred; transparent WebP is also supported).
2. Replace `public/assets/characters/manifest.json` with the definitions below. Both characters are optional independently; only a complete, valid pack replaces its procedural character.
3. Commit the assets and manifest. The existing workflow tests, builds, and deploys them. No renderer or combat code change is needed.

Export each character facing **right**, in a uniform grid with **384 × 384 pixel cells**, no spacing or margins, and no trimming. Frames are numbered from zero, left-to-right then top-to-bottom. Keep the same ground contact anchor at **(192, 350)** within every cell, including punches, airborne feet, hurt, and death. Reserve transparent space for extended fists, kicks, armor, scarf, and a falling silhouette; never center individual poses separately.

Use eight columns. Rook's 60 frames occupy eight rows (**3072 × 3072**, with four unused transparent cells); Dustjaw's 42 frames occupy six rows (**3072 × 2304**, with six unused cells). Neither sheet may exceed 4096 pixels on either axis. These sheets decode to about **63 MiB total** before Canvas/browser overhead, even if the downloaded PNGs are small. Optimize outlines and transparent padding; test memory and frame rate on actual Android hardware before shipping final art. Keep higher-resolution working files outside the game. Other cell dimensions up to 1024 pixels are supported when the manifest and complete grid agree.

The normalized origin is `(0.5, 350 / 384)`. Rook's constant uniform display scale is `0.55`; Dustjaw's is `0.62`, making his drawing larger. These display settings do not resize hitboxes or change movement lanes. The sprite is mirrored horizontally for left-facing poses. Avoid readable text or important handed asymmetry that would become incorrect when mirrored. Do not bake a ground shadow into the sheet; the renderer supplies one.

## Required frames

All states in a character's column are mandatory before its pack is activated. Each clip must contain at least two distinct frames, including idle, hurt, and death.

| State | Rook frame indices | Dustjaw frame indices | Playback |
| --- | --- | --- | --- |
| idle | 0–7 (8) | 0–7 (8) | Loop, 8 fps |
| walk | 8–17 (10) | 8–17 (10) | Loop, 12 fps; used for all four movement directions |
| punch1 | 18–23 (6) | — | Combat progress, 0.31 seconds |
| punch2 | 24–29 (6) | — | Combat progress, 0.34 seconds |
| punch3 | 30–37 (8) | — | Combat progress, 0.47 seconds |
| kick | 38–45 (8) | — | Combat progress, 0.57 seconds |
| attack | — | 18–27 (10) | Combat progress, 0.78 seconds |
| hurt | 46–49 (4) | 28–31 (4) | 20 fps, hold final frame until stagger ends |
| death | 50–59 (10) | 32–41 (10) | 12 fps, play once and hold final frame |

Attacks use `floor(attackProgress × clipLength)`, clamped to the last frame, so damage timing remains authoritative in `CombatWorld`. Frame rate metadata does not override attack duration. Draw the contact poses at approximately Rook frame **20** (punch1, 0.12 s), **26** (punch2, 0.14 s), **33** (punch3, 0.22 s), **41** (kick, 0.25 s), and Dustjaw frame **24** (attack, 0.51 s). Exact step sampling can advance a frame slightly past these boundaries. Changes to damage, reach, or timings belong to a separate combat change, not the art export.

Only idle and walk loop. The dead/hurt state takes priority over attacks, which take priority over walking and idle. Pause and hit-stop freeze the simulation-driven frames. After a knockout, the presentation clock advances for the existing 0.85-second result delay so the death clip can complete without advancing combat. Restarting an encounter resets the clip clock.

## Complete example manifest

Copy this only **after adding the matching real sheets**:

```json
{
  "version": 1,
  "characters": {
    "rook": {
      "sheet": "rook.png",
      "frameWidth": 384,
      "frameHeight": 384,
      "frameCount": 60,
      "origin": { "x": 0.5, "y": 0.9114583333333334 },
      "scale": 0.55,
      "animations": {
        "idle": { "frames": [0, 1, 2, 3, 4, 5, 6, 7], "frameRate": 8 },
        "walk": { "frames": [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], "frameRate": 12 },
        "punch1": { "frames": [18, 19, 20, 21, 22, 23], "frameRate": 20 },
        "punch2": { "frames": [24, 25, 26, 27, 28, 29], "frameRate": 20 },
        "punch3": { "frames": [30, 31, 32, 33, 34, 35, 36, 37], "frameRate": 20 },
        "kick": { "frames": [38, 39, 40, 41, 42, 43, 44, 45], "frameRate": 20 },
        "hurt": { "frames": [46, 47, 48, 49], "frameRate": 20 },
        "death": { "frames": [50, 51, 52, 53, 54, 55, 56, 57, 58, 59], "frameRate": 12 }
      }
    },
    "dustjaw": {
      "sheet": "dustjaw.png",
      "frameWidth": 384,
      "frameHeight": 384,
      "frameCount": 42,
      "origin": { "x": 0.5, "y": 0.9114583333333334 },
      "scale": 0.62,
      "animations": {
        "idle": { "frames": [0, 1, 2, 3, 4, 5, 6, 7], "frameRate": 8 },
        "walk": { "frames": [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], "frameRate": 12 },
        "attack": { "frames": [18, 19, 20, 21, 22, 23, 24, 25, 26, 27], "frameRate": 13 },
        "hurt": { "frames": [28, 29, 30, 31], "frameRate": 20 },
        "death": { "frames": [32, 33, 34, 35, 36, 37, 38, 39, 40, 41], "frameRate": 12 }
      }
    }
  }
}
```

`sheet` is relative to `public/assets/characters/`; nested local folders are allowed. Absolute URLs, path traversal, and JPEG files are rejected. Asset URLs include Vite's base, so the manifest and images work below `/duck-fury/` on GitHub Pages.

## Rendering architecture and fallback

- `ArenaScene.preload()` queues the manifest. `characterAssets.ts` validates it, queues only configured sheets, and checks the decoded cell grid before making a pack available. Missing manifest/images, malformed JSON, incomplete clips, invalid grids, and failed downloads preserve the procedural renderer. Warnings appear in the browser console.
- `CharacterView` is a ground-anchored Phaser container. Its sprite and the untouched `DuckView` share the same position, facing, and Y-based depth. Sprites use actual `setFrame()` changes on a Phaser sprite; a simulation-driven `CharacterAnimation` cursor avoids an independent animation timer running through pauses or hit-stop.
- `characterManifest.ts` contains the pure validation and frame/state selection code, exercised by `tests/character-animation.test.ts` without requiring a browser.
- `CombatWorld`, attack ranges, lane checks, health, collision separation, keyboard input, and multitouch controls remain unchanged. Sprite dimensions never feed back into collision or damage.

## Acceptance checks when real art is delivered

Run `npm test` and `npm run build`. In Android Chrome, check both characters facing each direction, diagonal movement plus an attack with two thumbs, every punch, kick, damage interrupt, a dodged enemy windup, death, replay, pause, tab switching, and scrolling/Y sorting. Inspect the Network panel for the manifest and both sheet downloads beneath `/duck-fury/assets/characters/`.

Test an empty manifest, one character pack only, a missing image, a malformed manifest, a sheet with the wrong dimensions, and a clip with a single frame. The encounter must still start and use the procedural character for the invalid pack. Keep this fallback until final assets pass these checks. Unit tests and a successful build do not establish that future artwork has been integrated or tested on a physical phone.
