import assert from 'node:assert/strict';
import test from 'node:test';
import { AttackRecovery, CONTACT_FOOTPRINT, presentationPositions } from '../src/art/CharacterPresentation.ts';
import { RigState, type RigSnapshot } from '../src/art/rig/RigState.ts';
import { depthScale } from '../src/art/rig/RigMath.ts';
import { ARENA, CombatWorld, getAttackPresentation, type AttackKind, type Fighter } from '../src/game/combat.ts';

const idle = { x: 0, y: 0, punch: false, kick: false };
const snapshot = (f: Fighter): RigSnapshot => ({ ...f, progress: f.attackProgress, time: 0 });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('close-contact roots fit the boots at every lane depth, facing, and wall without mutating combat', () => {
  for (const y of [460, 560, 635]) for (const facing of [1, -1] as const) for (const x of [80, 540, 2476]) {
    const left = x, right = x + 44;
    const player = { x: facing === 1 ? left : right, y, facing }, enemy = { x: facing === 1 ? right : left, y };
    const before = JSON.stringify([player, enemy]), roots = presentationPositions(player, enemy);
    near(Math.abs(roots.player.x - roots.enemy.x), CONTACT_FOOTPRINT * depthScale(y));
    assert.ok(roots.player.x >= ARENA.left && roots.enemy.x >= ARENA.left);
    assert.ok(roots.player.x <= ARENA.right && roots.enemy.x <= ARENA.right);
    assert.equal(JSON.stringify([player, enemy]), before);
  }
  const player = { x: 320, y: 560, facing: 1 as const }, enemy = { x: 1100, y: 550 };
  assert.deepEqual(presentationPositions(player, enemy), { player: { x: 320, y: 560 }, enemy });
  assert.deepEqual(presentationPositions(player, { x: 350, y: 635 }).player, { x: 320, y: 560 });
});

test('normal enemy approach still attacks and deals exactly the same damage with contact projection enabled', () => {
  const world = new CombatWorld(), control = new CombatWorld(); let hit = false;
  for (let step = 0; step < 1200 && !hit; step++) {
    const events = world.step(1 / 120, idle), expected = control.step(1 / 120, idle);
    const roots = presentationPositions(world.player, world.enemy);
    assert.deepEqual(events, expected); assert.deepEqual(world, control);
    if (events.some(e => e.type === 'hit' && e.target === 'player')) {
      hit = true; assert.equal(world.player.hp, 88);
      assert.ok(Math.abs(world.player.x - world.enemy.x) <= getAttackPresentation('enemy').range);
      assert.ok(Math.abs(roots.player.x - roots.enemy.x) >= 110);
    }
  }
  assert.ok(hit, 'enemy must close the actual initial distance and hit');
});

test('the real 44-unit collision limit remains reachable and the enemy can hit there', () => {
  for (const facing of [1, -1] as const) {
    const world = new CombatWorld(); world.player.x = 540; world.enemy.x = 540 + facing * 70;
    world.player.y = world.enemy.y = 560;
    let minimum = Infinity, hit = false;
    for (let step = 0; step < 240; step++) {
      const events = world.step(1 / 120, { ...idle, x: facing });
      const gap = Math.abs(world.enemy.x - world.player.x); minimum = Math.min(gap, minimum);
      const roots = presentationPositions(world.player, world.enemy);
      assert.ok(Math.abs(roots.enemy.x - roots.player.x) >= CONTACT_FOOTPRINT * depthScale(560) - 1e-8);
      hit ||= events.some(e => e.type === 'hit' && e.target === 'player');
    }
    near(minimum, 44); assert.ok(hit);
  }
});

test('visible strikes still contact the shirt at every unchanged attack range and depth in both facings', () => {
  for (const attack of ['punch1', 'punch2', 'punch3', 'kick', 'enemy'] as AttackKind[]) {
    const timing = getAttackPresentation(attack);
    for (const y of [460, 560, 635]) for (const facing of [1, -1] as const) for (const gap of [44, timing.range]) {
      const world = new CombatWorld(); world.player.x = 1200; world.enemy.x = 1200 + facing * gap;
      world.player.y = world.enemy.y = y; world.player.facing = facing; world.enemy.facing = facing === 1 ? -1 : 1;
      const roots = presentationPositions(world.player, world.enemy);
      const source = { ...snapshot(world.player), ...roots.player }, target = { ...snapshot(world.enemy), ...roots.enemy };
      const rig = new RigState(attack === 'enemy', source), victim = new RigState(attack !== 'enemy', target), contact = victim.hurtAnchor(source);
      rig.advance(1 / 120, { ...source, attack, progress: timing.impact / timing.duration }, contact);
      const strike = rig.strikePoint();
      // Wrist/boot pivot may stop inside its fixed-length limit; the authored hand extends 12 rig units past the pivot.
      assert.ok(Math.hypot(strike.x - contact.x, strike.y - contact.y) <= 12 * rig.scale, `${attack}, Y=${y}, gap=${gap}`);
    }
  }
});

test('every frozen lethal attack finishes recovery once and idles at 15, 30, and 60 FPS without changing the snapshot', () => {
  for (const hz of [15, 30, 60]) for (const attack of ['punch1', 'punch2', 'punch3', 'kick', 'enemy'] as AttackKind[]) {
    const timing = getAttackPresentation(attack);
    const frozen: RigSnapshot = { x: 540, y: 560, facing: 1, moving: false, attack, progress: timing.impact / timing.duration, hurt: false, dead: false, time: 0 };
    const before = JSON.stringify(frozen), recovery = new AttackRecovery(), rig = new RigState(false, frozen);
    let previous = frozen.progress, sawRecovery = false;
    for (let frame = 0; frame < hz; frame++) {
      const pose = recovery.advance(1 / hz, frozen, true);
      if (pose.attack) { assert.ok(pose.progress > previous); previous = pose.progress; sawRecovery = true; }
      rig.advance(1 / hz, pose);
    }
    assert.ok(sawRecovery); assert.equal(rig.snapshot.attack, null); assert.equal(rig.pose.attack.kind, 'none');
    assert.ok(rig.idleTime > .5); assert.equal(JSON.stringify(frozen), before);
    const resting = rig.pose.headAngle; rig.advance(.1, recovery.advance(.1, frozen, true)); assert.notEqual(rig.pose.headAngle, resting);
    recovery.reset(); assert.equal(recovery.advance(0, frozen, true).progress, frozen.progress);
    assert.equal(recovery.advance(0, frozen, false).attack, attack);
  }
});

test('both encounter winners recover while combat is stopped and the completed victim stays motionless', () => {
  for (const winner of ['player', 'enemy'] as const) {
    const world = new CombatWorld(); world.enemy.x = world.player.x + 70; world.enemy.y = world.player.y;
    if (winner === 'player') world.enemy.hp = 1; else world.player.hp = 1;
    for (let step = 0; step < 240 && world.status === 'playing'; step++) world.step(1 / 120, { ...idle, punch: winner === 'player' && step === 0 });
    assert.equal(world.status, winner === 'player' ? 'won' : 'lost');
    const living = world[winner], dead = winner === 'player' ? world.enemy : world.player;
    const winnerRig = new RigState(winner === 'enemy', snapshot(living)), victimRig = new RigState(winner !== 'enemy', snapshot(dead));
    const recovery = new AttackRecovery(), frozen = JSON.stringify(world);
    for (let step = 0; step < 180; step++) {
      assert.deepEqual(world.step(1 / 120, { ...idle, x: 1, punch: true, kick: true }), []);
      winnerRig.advance(1 / 120, recovery.advance(1 / 120, snapshot(living), true)); victimRig.advance(1 / 120, snapshot(dead));
    }
    assert.equal(JSON.stringify(world), frozen); assert.equal(winnerRig.snapshot.attack, null); assert.ok(winnerRig.idleTime > .5);
    assert.ok(victimRig.complete); const settled = JSON.stringify(victimRig); victimRig.advance(.5, snapshot(dead)); assert.equal(JSON.stringify(victimRig), settled);
  }
});
