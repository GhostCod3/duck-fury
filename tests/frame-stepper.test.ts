import assert from 'node:assert/strict';
import test from 'node:test';
import { FrameStepper, FIXED_STEP } from '../src/game/FrameStepper.ts';
import { CombatWorld, type CombatInput } from '../src/game/combat.ts';
import { RigState, type RigSnapshot } from '../src/art/rig/RigState.ts';
const idle: CombatInput = { x: 0, y: 0, punch: false, kick: false };

test('15, 30, and 60 render FPS produce the same real-time simulation and movement', () => {
  const results = [15, 30, 60].map(hz => {
    const clock = new FrameStepper(), world = new CombatWorld(); world.enemy.x = 2400;
    for (let i = 0; i < hz; i++) clock.advance(1 / hz, { ...idle, x: 1 }, (dt, input) => world.step(dt, input));
    return [world.time, world.player.x];
  });
  for (const [time, x] of results) { assert.ok(Math.abs(time - 1) < 1e-9); assert.ok(Math.abs(x - 530) < 1e-9); }
});

test('15, 30, and 60 FPS drive identical idle, scarf, walking, and KO presentation clocks', () => {
  const results = [15, 30, 60].map(hz => {
    const clock = new FrameStepper();
    const pose: RigSnapshot = { x: 540, y: 560, facing: 1, moving: false, attack: null, progress: 0, hurt: false, dead: false, time: 0 };
    const rig = new RigState(false, pose);
    for (let frame = 0; frame < hz * 3; frame++) {
      clock.advance(1 / hz, idle, dt => {
        const walking = frame >= hz && frame < hz * 2;
        pose.moving = walking;
        if (walking) pose.x += 210 * dt;
        if (frame >= hz * 2) pose.dead = true;
        rig.advance(dt, pose);
      });
    }
    return { pose: rig.pose, spring: rig.spring, idleTime: rig.idleTime, time: rig.time, scale: rig.scale, complete: rig.complete };
  });
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
  assert.equal(results[0].complete, true);
});

test('one press is consumed once across eight substeps, with held movement on every substep', () => {
  const clock = new FrameStepper(), inputs: CombatInput[] = [];
  assert.equal(clock.advance(1 / 15, { ...idle, x: 1, punch: true }, (_dt, input) => inputs.push(input)), 8);
  assert.equal(inputs.filter(i => i.punch).length, 1); assert.ok(inputs.every(i => i.x === 1));
});

test('presses survive zero-step frames, remain ordered, and preserve same-frame kick priority', () => {
  const clock = new FrameStepper(), inputs: CombatInput[] = [];
  clock.advance(0, { ...idle, punch: true }, () => assert.fail('no tick'));
  clock.advance(0, { ...idle, kick: true }, () => assert.fail('no tick'));
  assert.equal(clock.pendingEdges, 2);
  clock.advance(FIXED_STEP * 3, idle, (_dt, input) => inputs.push(input));
  assert.deepEqual(inputs.map(i => i.kick ? 'kick' : i.punch ? 'punch' : 'none'), ['punch', 'kick', 'none']);
  clock.advance(FIXED_STEP, { ...idle, punch: true, kick: true }, (_dt, input) => { assert.equal(input.kick, true); assert.equal(input.punch, false); });
});

test('hit-stop consumes time at every render rate without catch-up bursts or lost edges', () => {
  for (const hz of [15, 30, 60]) {
    const clock = new FrameStepper(); clock.stopFor(.1);
    let active = 0, presses = 0;
    for (let i = 0; i < hz; i++) clock.advance(1 / hz, { ...idle, punch: i === 0 }, (dt, input, stopped) => { if (!stopped) { active += dt; presses += Number(input.punch); } });
    assert.ok(Math.abs(active - .9) < 1e-9); assert.equal(presses, 1);
  }
});

test('pause/visibility/replay reset clears debt and edges; long stalls are bounded', () => {
  const clock = new FrameStepper(); clock.advance(FIXED_STEP / 2, { ...idle, punch: true }, () => assert.fail('no tick'));
  clock.reset(); let steps = 0;
  clock.advance(FIXED_STEP / 2, idle, () => assert.fail('old time debt survived'));
  assert.equal(clock.advance(5, idle, (_dt, input) => { steps++; assert.equal(input.punch, false); }), 30);
  assert.equal(steps, 30); assert.equal(clock.pendingEdges, 0);
  const world = new CombatWorld(); world.step(5, idle); assert.equal(world.time, .05);
});
