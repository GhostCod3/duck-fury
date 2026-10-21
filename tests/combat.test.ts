import assert from 'node:assert/strict';
import test from 'node:test';
import { ARENA, CombatWorld, type CombatEvent, type CombatInput } from '../src/game/combat.ts';

const idle: CombatInput = { x: 0, y: 0, punch: false, kick: false };

function advance(world: CombatWorld, seconds: number, input: CombatInput = idle): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let elapsed = 0; elapsed < seconds - 0.000001; elapsed += 1 / 120) {
    events.push(...world.step(Math.min(1 / 120, seconds - elapsed), input));
  }
  return events;
}

function isolated(): CombatWorld {
  const world = new CombatWorld();
  world.enemy.x = 2400;
  return world;
}

test('movement normalizes diagonal input, remains in bounds, and clamps long frames', () => {
  const horizontal = isolated();
  advance(horizontal, 0.25, { ...idle, x: 1 });
  assert.ok(Math.abs(horizontal.player.x - (320 + 210 * 0.25)) < 0.001);

  const diagonal = isolated();
  advance(diagonal, 0.25, { ...idle, x: 1, y: 1 });
  assert.ok(Math.abs(diagonal.player.x - (320 + 210 * 0.25 / Math.SQRT2)) < 0.001);
  assert.ok(Math.abs(diagonal.player.y - (560 + 125 * 0.25 / Math.SQRT2)) < 0.001);

  const bounded = isolated();
  bounded.player.x = ARENA.left;
  bounded.player.y = ARENA.top;
  advance(bounded, 0.2, { ...idle, x: -1, y: -1 });
  assert.equal(bounded.player.x, ARENA.left);
  assert.equal(bounded.player.y, ARENA.top);
  bounded.player.x = ARENA.right;
  bounded.player.y = ARENA.bottom;
  bounded.step(0.05, { ...idle, x: 1, y: 1 });
  assert.equal(bounded.player.x, ARENA.right);
  assert.equal(bounded.player.y, ARENA.bottom);

  const stalled = isolated();
  stalled.step(10, { ...idle, x: 1 });
  assert.equal(stalled.time, 0.05);
  assert.equal(stalled.player.x, 330.5);
});

test('punches require the opponent to be in front and in the same movement lane', () => {
  const behind = new CombatWorld();
  behind.enemy.x = 250;
  behind.enemy.y = behind.player.y;
  behind.player.facing = 1;
  behind.step(1 / 120, { ...idle, punch: true });
  const behindEvents = advance(behind, 0.25);
  assert.equal(behind.enemy.hp, 120);
  assert.equal(behindEvents.filter(event => event.type === 'hit').length, 0);

  const offLane = new CombatWorld();
  offLane.enemy.x = 390;
  offLane.enemy.y = 470;
  offLane.step(1 / 120, { ...idle, punch: true });
  advance(offLane, 0.25);
  assert.equal(offLane.enemy.hp, 120);
});

test('buffered punches form a three-hit combo and each swing deals damage once', () => {
  const world = new CombatWorld();
  world.enemy.x = 395;
  world.enemy.y = world.player.y;
  const events = world.step(1 / 120, { ...idle, punch: true });
  events.push(...advance(world, 0.15));
  assert.equal(world.enemy.hp, 107);
  events.push(...world.step(1 / 120, { ...idle, punch: true }));
  events.push(...advance(world, 0.33));
  assert.equal(world.enemy.hp, 90);
  events.push(...world.step(1 / 120, { ...idle, punch: true }));
  events.push(...advance(world, 0.65));
  assert.deepEqual(events.filter(event => event.type === 'attack' && event.target === 'player')
    .map(event => event.attack), ['punch1', 'punch2', 'punch3']);
  assert.deepEqual(events.filter(event => event.type === 'hit' && event.target === 'enemy')
    .map(event => event.damage), [13, 17, 25]);
  assert.equal(world.enemy.hp, 65);
  assert.ok(world.enemy.x > 395, 'the combo should visibly knock the enemy back');
});

test('combo resets after a pause and a kick has longer reach than a first punch', () => {
  const combo = isolated();
  combo.step(1 / 120, { ...idle, punch: true });
  advance(combo, 1);
  assert.equal(combo.combo, 0);
  combo.step(1 / 120, { ...idle, punch: true });
  assert.equal(combo.player.attack, 'punch1');

  const kick = new CombatWorld();
  kick.enemy.x = 455;
  kick.enemy.y = kick.player.y;
  kick.step(1 / 120, { ...idle, kick: true });
  const events = advance(kick, 0.55);
  assert.equal(kick.enemy.hp, 97);
  assert.equal(events.filter(event => event.type === 'hit' && event.target === 'enemy').length, 1);
  assert.ok(kick.enemy.x > 430, 'kick should push the approaching enemy back');
});

test('enemy approaches, telegraphs its attack, and can be dodged across lanes', () => {
  const chase = new CombatWorld();
  advance(chase, 1);
  assert.ok(chase.enemy.x < 1100);
  assert.equal(chase.player.hp, 100);

  const dodge = new CombatWorld();
  dodge.enemy.x = 390;
  dodge.enemy.y = dodge.player.y;
  const warning = dodge.step(1 / 120, idle);
  assert.ok(warning.some(event => event.type === 'attack' && event.target === 'enemy'));
  advance(dodge, 0.2);
  assert.equal(dodge.player.hp, 100, 'the attack must have a readable windup');
  advance(dodge, 0.4, { ...idle, y: -1 });
  assert.equal(dodge.player.hp, 100, 'leaving the attack lane should avoid damage');
});

test('enemy can damage and defeat an idle player; a finished game stops taking input', () => {
  const world = new CombatWorld();
  world.enemy.x = 390;
  world.enemy.y = world.player.y;
  advance(world, 0.6);
  assert.equal(world.player.hp, 88);
  assert.ok(world.player.hurt);
  advance(world, 0.2);
  assert.equal(world.player.hp, 88, 'one enemy swing cannot repeatedly hit');
  const events = advance(world, 30);
  assert.equal(world.status, 'lost');
  assert.equal(world.player.hp, 0);
  assert.ok(world.player.dead);
  assert.equal(events.filter(event => event.type === 'death').length, 1);
  const finalX = world.player.x;
  assert.deepEqual(world.step(0.05, { ...idle, x: 1, punch: true }), []);
  assert.equal(world.player.x, finalX);
});

test('a player who closes the distance and punches can win the encounter', () => {
  const world = new CombatWorld();
  const events: CombatEvent[] = [];
  for (let frame = 0; frame < 3600 && world.status === 'playing'; frame++) {
    const dx = world.enemy.x - world.player.x;
    const dy = world.enemy.y - world.player.y;
    events.push(...world.step(1 / 60, {
      x: Math.abs(dx) > 75 ? Math.sign(dx) : 0,
      y: Math.abs(dy) > 10 ? Math.sign(dy) : 0,
      punch: Math.abs(dx) < 100 && frame % 10 === 0,
      kick: false,
    }));
  }
  assert.equal(world.status, 'won');
  assert.equal(world.enemy.hp, 0);
  assert.ok(world.enemy.dead);
  assert.ok(world.player.hp > 0);
  assert.equal(events.filter(event => event.type === 'death' && event.target === 'enemy').length, 1);
});

test('fighters cannot walk through each other in the same lane', () => {
  const world = new CombatWorld();
  world.enemy.x = 370;
  world.enemy.y = world.player.y;
  advance(world, 0.15, { ...idle, x: 1 });
  assert.ok(world.enemy.x - world.player.x >= 44 - 0.001);

  const corner = new CombatWorld();
  corner.player.x = ARENA.left;
  corner.enemy.x = ARENA.left + 10;
  corner.enemy.y = corner.player.y;
  corner.step(1 / 60, idle);
  assert.equal(corner.player.x, ARENA.left);
  assert.equal(corner.enemy.x - corner.player.x, 44);
});
