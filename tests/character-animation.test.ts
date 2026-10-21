import assert from 'node:assert/strict';
import test from 'node:test';
import { CharacterAnimation, parseCharacterManifest, stateForPose, validSheetGrid, type CharacterId, type CharacterPose, type CharacterSheet } from '../src/art/characterManifest.ts';
import { CombatWorld } from '../src/game/combat.ts';

const frames = (start: number, count: number) => Array.from({ length: count }, (_, i) => start + i);
function sheet(id: CharacterId = 'rook'): CharacterSheet {
  return {
    sheet: `${id}.png`, frameWidth: 384, frameHeight: 384,
    frameCount: id === 'rook' ? 60 : 42,
    origin: { x: .5, y: 350 / 384 }, scale: id === 'rook' ? .55 : .62,
    animations: id === 'rook' ? {
      idle: { frames: frames(0, 8), frameRate: 8 }, walk: { frames: frames(8, 10), frameRate: 12 },
      punch1: { frames: frames(18, 6), frameRate: 20 }, punch2: { frames: frames(24, 6), frameRate: 20 },
      punch3: { frames: frames(30, 8), frameRate: 20 }, kick: { frames: frames(38, 8), frameRate: 20 },
      hurt: { frames: frames(46, 4), frameRate: 20 }, death: { frames: frames(50, 10), frameRate: 12 },
    } : {
      idle: { frames: frames(0, 8), frameRate: 8 }, walk: { frames: frames(8, 10), frameRate: 12 },
      attack: { frames: frames(18, 10), frameRate: 13 },
      hurt: { frames: frames(28, 4), frameRate: 20 }, death: { frames: frames(32, 10), frameRate: 12 },
    },
  };
}
const pose: CharacterPose = { facing: 1, moving: false, attack: null, progress: 0, hurt: false, dead: false, time: 0 };
const parse = (rook: unknown, dustjaw?: unknown) => parseCharacterManifest({ version: 1, characters: { rook, dustjaw } });

test('empty and malformed manifests preserve the procedural fallback', () => {
  assert.deepEqual(parseCharacterManifest({ version: 1, characters: {} }), { characters: {}, warnings: [] });
  for (const input of [null, [], {}, { version: 2, characters: {} }, { version: 1, characters: [] }]) {
    const parsed = parseCharacterManifest(input);
    assert.deepEqual(parsed.characters, {});
    assert.equal(parsed.warnings.length, 1);
  }
});

test('complete sprite packs are accepted independently for Rook and Dustjaw', () => {
  const parsed = parse(sheet(), sheet('dustjaw'));
  assert.deepEqual(Object.keys(parsed.characters), ['rook', 'dustjaw']);
  assert.deepEqual(parsed.warnings, []);
  const brokenRook = sheet();
  delete brokenRook.animations.punch3;
  const partial = parse(brokenRook, sheet('dustjaw'));
  assert.equal(partial.characters.rook, undefined);
  assert.ok(partial.characters.dustjaw);
  assert.match(partial.warnings[0], /punch3.*procedural fallback/);
});

test('a static image or repeated single-frame clip cannot masquerade as an animation', () => {
  for (const indices of [[0], [0, 0, 0]]) {
    const definition = sheet();
    definition.animations.idle!.frames = indices;
    assert.equal(parse(definition).characters.rook, undefined);
  }
  assert.equal(parse({ ...sheet(), frameCount: 1 }).characters.rook, undefined);
});

test('out-of-range frames and invalid playback rates reject a pack', () => {
  for (const indices of [[-1, 2], [0, 60], [.5, 1], [0, Infinity]]) {
    const definition = sheet();
    definition.animations.kick!.frames = indices;
    assert.equal(parse(definition).characters.rook, undefined);
  }
  for (const frameRate of [0, -1, 61, NaN]) {
    const definition = sheet();
    definition.animations.walk!.frameRate = frameRate;
    assert.equal(parse(definition).characters.rook, undefined);
  }
});

test('asset paths, frame sizes, origin, and uniform scale are validated', () => {
  for (const name of ['../rook.png', '/rook.png', 'https://example.com/rook.png', 'rook.jpg', 'rook.png?v=1']) {
    assert.equal(parse({ ...sheet(), sheet: name }).characters.rook, undefined);
  }
  assert.ok(parse({ ...sheet(), sheet: 'rook/body-v1.webp' }).characters.rook);
  for (const change of [{ frameWidth: 0 }, { frameHeight: 4096 }, { origin: { x: -1, y: 1 } }, { scale: 0 }]) {
    assert.equal(parse({ ...sheet(), ...change }).characters.rook, undefined);
  }
});

test('decoded sheets require complete cells, enough frames, and mobile-sized dimensions', () => {
  const definition = sheet();
  assert.ok(validSheetGrid(definition, 3072, 3072)); // 60 frames plus four empty padding cells.
  assert.equal(validSheetGrid(definition, 3072, 2688), false); // Only 56 cells.
  assert.equal(validSheetGrid(definition, 3073, 3072), false);
  assert.equal(validSheetGrid(definition, 4608, 3072), false);
  assert.equal(validSheetGrid(definition, 0, 0), false);
});

test('death and damage interrupt attacks; enemy attacks select the raider clip', () => {
  assert.equal(stateForPose({ ...pose, moving: true }), 'walk');
  assert.equal(stateForPose({ ...pose, moving: true, attack: 'kick' }), 'kick');
  assert.equal(stateForPose({ ...pose, attack: 'enemy' }), 'attack');
  assert.equal(stateForPose({ ...pose, attack: 'punch3', hurt: true }), 'hurt');
  assert.equal(stateForPose({ ...pose, attack: 'kick', hurt: true, dead: true }), 'death');
});

test('idle and walk loop on simulation time and freeze when the clock stops', () => {
  const animation = new CharacterAnimation();
  const definition = sheet();
  assert.equal(animation.frame(definition, pose), 0);
  assert.equal(animation.frame(definition, { ...pose, time: 250 }), 2);
  assert.equal(animation.frame(definition, { ...pose, time: 250 }), 2);
  assert.equal(animation.frame(definition, { ...pose, time: 1000 }), 0);
  assert.equal(animation.frame(definition, { ...pose, moving: true, time: 1000 }), 8);
  assert.equal(animation.frame(definition, { ...pose, moving: true, time: 1250 }), 11);
});

test('attack frames follow normalized combat progress, independently of frame rate', () => {
  const animation = new CharacterAnimation();
  const definition = sheet();
  assert.equal(animation.frame(definition, { ...pose, attack: 'punch1', progress: 0 }), 18);
  assert.equal(animation.frame(definition, { ...pose, attack: 'punch1', progress: .5, time: 150 }), 21);
  assert.equal(animation.frame(definition, { ...pose, attack: 'punch1', progress: 1, time: 310 }), 23);
  assert.equal(animation.frame(definition, { ...pose, attack: 'punch1', progress: 0, time: 320 }), 18);
  assert.equal(animation.frame(definition, { ...pose, attack: 'kick', progress: .5, time: 400 }), 42);
});

test('death holds its last frame and a restarted encounter resets the animation clock', () => {
  const animation = new CharacterAnimation();
  const definition = sheet();
  assert.equal(animation.frame(definition, { ...pose, dead: true, time: 5000 }), 50);
  assert.equal(animation.frame(definition, { ...pose, dead: true, time: 5800 }), 59);
  assert.equal(animation.frame(definition, { ...pose, dead: true, time: 8000 }), 59);
  assert.equal(animation.frame(definition, pose), 0);
  assert.equal(animation.frame(definition, { ...pose, time: 250 }), 2);
  assert.equal(animation.frame(definition, pose), 0);
});

test('render selection does not mutate fighter data, hitboxes, health, or combat timing', () => {
  const world = new CombatWorld();
  world.enemy.x = 2400;
  world.step(.05, { x: 0, y: 0, punch: true, kick: false });
  const before = JSON.stringify(world);
  const player = world.player;
  const animation = new CharacterAnimation();
  const selected = animation.frame(sheet(), {
    ...player, progress: player.attackProgress, time: world.time * 1000,
  });
  assert.equal(selected, 18);
  assert.equal(JSON.stringify(world), before);
});
