import assert from 'node:assert/strict';
import test from 'node:test';
import { RigState, type RigSnapshot } from '../src/art/rig/RigState.ts';
import { attackPose, depthScale, p, solveLeg } from '../src/art/rig/RigMath.ts';
import { getAttackPresentation, type AttackKind } from '../src/game/combat.ts';
import { BloodModel } from '../src/art/BloodModel.ts';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const initial: RigSnapshot = { x: 540, y: 560, facing: 1, moving: false, attack: null, progress: 0, hurt: false, dead: false, time: 0 };
const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x - b.x, a.y - b.y);
function near(actual: number, expected: number) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }

test('approved assets remain byte-identical to the handoff and retain the merged-collar definition', () => {
  const definition = JSON.parse(readFileSync(new URL('../docs/approved-rig/rig-definition.json', import.meta.url), 'utf8'));
  for (const [name, value] of Object.entries(definition.assets)) {
    const item = value as {path:string;sha256:string};
    const local = item.path.replace('reference/', 'public/');
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../${local}`, import.meta.url))).digest('hex'), item.sha256, name);
  }
  assert.equal(definition.head.mergedCollar, true);
  assert.deepEqual(definition.reference.armSegments, [55, 55]);
  assert.deepEqual(definition.reference.legSegments, [65, 65]);
});

test('upright idle locks ankles through breathing, guarding, scanning, and blinking', () => {
  const rig = new RigState(false, initial); let blink = false;
  for (let i = 0; i < 1500; i++) {
    rig.advance(1 / 120, initial); const b = rig.pose;
    near(b.front.x, 274); near(b.front.y, 354); near(b.front.angle, 0);
    near(b.back.x, 226); near(b.back.y, 354); near(b.back.angle, 0);
    assert.ok(b.hip.y > 225 && b.hip.y < 232, 'upright baseline changed');
    blink ||= !!b.idle?.blink;
    for (const [hip, foot] of [[b.leftHip, b.back], [b.rightHip, b.front]]) {
      const knee = solveLeg(hip, foot); near(distance(hip, knee), 65); near(distance(knee, foot), 65);
    }
    for (const far of [false, true]) { const arm = rig.arm(far); near(distance(arm.shoulder, arm.elbow), 55); near(distance(arm.elbow, arm.wrist), 55); }
  }
  assert.ok(blink);
});

test('each actor owns idle, spring, wounds, KO and transition state', () => {
  const rook = new RigState(false, initial), enemy = new RigState(true, { ...initial, x: 610, facing: -1 });
  const unchanged = JSON.stringify(enemy);
  rook.advance(.01, initial); rook.addWound(true);
  assert.equal(JSON.stringify(enemy), unchanged); assert.equal(rook.wounds, 2); assert.equal(enemy.wounds, 0);
  enemy.advance(.01, { ...initial, facing: -1, x: 610 });
  assert.notEqual(rook.pose.headAngle, enemy.pose.headAngle);
});

test('all attack contact poses align to authoritative impact times without changing durations', () => {
  for (const kind of ['punch1', 'punch2', 'punch3', 'kick', 'enemy'] as AttackKind[]) {
    const timing = getAttackPresentation(kind), progress = timing.impact / timing.duration;
    near(attackPose(kind, progress).reach, 1); near(attackPose(kind, 0).reach, 0); near(attackPose(kind, 1).reach, 0);
  }
  const timing = getAttackPresentation('punch1') as { duration: number }; timing.duration = 9;
  assert.equal(getAttackPresentation('punch1').duration, .31);
});

test('contact calibration and mirroring retain fixed arm lengths and finite transitions', () => {
  for (const facing of [1, -1] as const) {
    const rig = new RigState(false, { ...initial, facing });
    const target = rig.worldPoint(p(310, 165)), timing = getAttackPresentation('punch1');
    rig.advance(1 / 120, { ...initial, facing, attack: 'punch1', progress: timing.impact / timing.duration }, target);
    near(distance(rig.strikePoint(), target), 0);
    const arm = rig.arm(false); near(distance(arm.shoulder, arm.elbow), 55); near(distance(arm.elbow, arm.wrist), 55);
    assert.ok(Object.values(rig.pose.hip).every(Number.isFinite));
  }
});

test('KO captures once, keeps scale and bone lengths, completes fully and then remains motionless', () => {
  const rig = new RigState(false, initial); rig.addWound(true);
  rig.advance(.05, { ...initial, moving: true, x: 546 });
  const dead = { ...initial, x: 546, dead: true };
  rig.beginKnockout(dead); const scale = rig.scale;
  for (let i = 0; i < 160; i++) {
    rig.beginKnockout({ ...dead, y: 635 }); rig.advance(1 / 120, { ...dead, y: 635 });
    assert.equal(rig.scale, scale);
    const b = rig.pose;
    near(distance(b.rightHip, b.frontKnee!), 65); near(distance(b.frontKnee!, b.front), 65);
    for (const far of [true, false]) { const arm = rig.arm(far); near(distance(arm.shoulder, arm.elbow), 55); near(distance(arm.elbow, arm.wrist), 55); }
  }
  assert.ok(rig.complete); assert.equal(rig.wounds, 2);
  const settled = JSON.stringify(rig); rig.advance(2, dead); assert.equal(JSON.stringify(rig), settled);
  rig.reset(initial); assert.equal(rig.wounds, 0); assert.equal(rig.deadTime, 0); assert.equal(rig.complete, false); assert.equal(rig.idleTime, 0); assert.equal(rig.gait, 0);
  assert.deepEqual(rig.spring, { a: -.18, v: 0, b: 5, w: 0 }); assert.equal(rig.scale, depthScale(initial.y));
});

test('blood direction, stronger finishers, world-space stains, expiry and pool bounds', () => {
  const blood = new BloodModel(() => .5);
  blood.burst({ x: 100, y: 200 }, 300, -1, false, 1); assert.equal(blood.droplets.length, 10); assert.ok(blood.droplets.every(q => q.vx < 0));
  blood.reset(); blood.burst({ x: 100, y: 200 }, 300, 1, true, 1); assert.equal(blood.droplets.length, 16);
  for (let i = 0; i < 120; i++) blood.advance(1 / 120);
  assert.ok(blood.stains.length > 0); const points = blood.stains.map(q => [q.x, q.y]);
  blood.advance(.1); assert.deepEqual(blood.stains.map(q => [q.x, q.y]), points);
  for (let i = 0; i < 100; i++) { blood.burst({ x: 100, y: 298 }, 300, 1, true, 1); blood.advance(.1); }
  assert.ok(blood.droplets.length <= 96); assert.ok(blood.stains.length <= 96);
  blood.advance(10); blood.advance(10); assert.equal(blood.droplets.length, 0); assert.equal(blood.stains.length, 0);
  blood.burst({ x: 0, y: 0 }, 10, 1, false, 1); blood.reset(); assert.equal(blood.droplets.length + blood.stains.length, 0);
});
