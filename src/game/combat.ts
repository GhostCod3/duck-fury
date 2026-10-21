/** Deterministic combat simulation. Rendering and input devices live outside this module. */
export type AttackKind = 'punch1' | 'punch2' | 'punch3' | 'kick' | 'enemy';
export type FighterId = 'player' | 'enemy';

export interface Fighter {
  id: FighterId;
  x: number;
  y: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  moving: boolean;
  attack: AttackKind | null;
  attackProgress: number;
  hurt: boolean;
  dead: boolean;
}

export interface CombatInput {
  x: number;
  y: number;
  /** Press edges, rather than continuously held buttons. */
  punch: boolean;
  kick: boolean;
}

export interface CombatEvent {
  type: 'hit' | 'attack' | 'death';
  target?: FighterId;
  x: number;
  y: number;
  damage?: number;
  attack?: AttackKind;
  combo?: number;
}

export const WORLD_WIDTH = 2600;
export const ARENA = { left: 80, right: WORLD_WIDTH - 80, top: 460, bottom: 635 } as const;
export const LANE_TOLERANCE = 32;

interface AttackSpec {
  duration: number;
  impact: number;
  range: number;
  damage: number;
  knockback: number;
}

const ATTACKS: Record<AttackKind, AttackSpec> = {
  punch1: { duration: 0.31, impact: 0.12, range: 104, damage: 13, knockback: 105 },
  punch2: { duration: 0.34, impact: 0.14, range: 112, damage: 17, knockback: 125 },
  punch3: { duration: 0.47, impact: 0.22, range: 124, damage: 25, knockback: 275 },
  kick: { duration: 0.57, impact: 0.25, range: 145, damage: 23, knockback: 335 },
  enemy: { duration: 0.78, impact: 0.51, range: 98, damage: 12, knockback: 260 },
};

interface FighterState {
  attackElapsed: number;
  hitChecked: boolean;
  hurtFor: number;
  invulnerableFor: number;
  cooldown: number;
  knockbackX: number;
}

const makeState = (): FighterState => ({
  attackElapsed: 0,
  hitChecked: false,
  hurtFor: 0,
  invulnerableFor: 0,
  cooldown: 0,
  knockbackX: 0,
});

const makeFighter = (id: FighterId, x: number, y: number, hp: number): Fighter => ({
  id,
  x,
  y,
  facing: id === 'player' ? 1 : -1,
  hp,
  maxHp: hp,
  moving: false,
  attack: null,
  attackProgress: 0,
  hurt: false,
  dead: false,
});

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export class CombatWorld {
  readonly player: Fighter = makeFighter('player', 320, 560, 100);
  readonly enemy: Fighter = makeFighter('enemy', 1100, 550, 120);
  status: 'playing' | 'won' | 'lost' = 'playing';
  time = 0;
  combo = 0;

  private readonly states: Record<FighterId, FighterState> = {
    player: makeState(),
    enemy: makeState(),
  };
  private comboUntil = 0;
  private bufferedAttack: 'punch' | 'kick' | null = null;
  private bufferUntil = 0;

  /** dt is in seconds; cap stalls so a background tab cannot cause instant defeat. */
  step(dt: number, input: CombatInput): CombatEvent[] {
    if (this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return [];
    const delta = Math.min(dt, 0.05);
    const events: CombatEvent[] = [];
    this.time += delta;

    this.updateTimers(this.player, delta);
    this.updateTimers(this.enemy, delta);
    if (!this.player.attack && this.time > this.comboUntil) this.combo = 0;
    if (this.time > this.bufferUntil) this.bufferedAttack = null;

    let x = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0;
    let y = Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }

    const playerState = this.states.player;
    if (!this.player.attack && !this.player.hurt && x !== 0) {
      this.player.facing = x > 0 ? 1 : -1;
    }
    if (input.punch || input.kick) {
      this.bufferedAttack = input.kick ? 'kick' : 'punch';
      // Keep presses made during an animation until its recovery completes.
      this.bufferUntil = this.time + (this.player.attack ? 0.7 : 0.2);
    }
    this.consumePlayerBuffer(events);
    if (!this.player.attack && !this.player.hurt && playerState.cooldown <= 0) {
      this.move(this.player, x * 210 * delta, y * 125 * delta);
    }

    this.updateEnemy(delta, events);
    this.updateAttack(this.player, this.enemy, delta, events);
    if (this.status === 'playing') this.updateAttack(this.enemy, this.player, delta, events);
    if (this.status === 'playing') this.consumePlayerBuffer(events);
    this.separateFighters();
    return events;
  }

  private updateTimers(fighter: Fighter, dt: number): void {
    const state = this.states[fighter.id];
    state.hurtFor = Math.max(0, state.hurtFor - dt);
    state.invulnerableFor = Math.max(0, state.invulnerableFor - dt);
    state.cooldown = Math.max(0, state.cooldown - dt);
    fighter.hurt = state.hurtFor > 0;
    fighter.moving = false;
    fighter.x = clamp(fighter.x + state.knockbackX * dt, ARENA.left, ARENA.right);
    fighter.y = clamp(fighter.y, ARENA.top, ARENA.bottom);
    state.knockbackX *= Math.exp(-10 * dt);
    if (Math.abs(state.knockbackX) < 1) state.knockbackX = 0;
  }

  private consumePlayerBuffer(events: CombatEvent[]): void {
    if (!this.bufferedAttack || this.player.attack || this.player.hurt ||
        this.states.player.cooldown > 0 || this.player.dead) return;
    const request = this.bufferedAttack;
    this.bufferedAttack = null;
    if (request === 'kick') {
      this.combo = 0;
      this.comboUntil = 0;
      this.startAttack(this.player, 'kick', events);
      return;
    }
    const next = this.time <= this.comboUntil && this.combo > 0 && this.combo < 3
      ? this.combo + 1
      : 1;
    this.combo = next;
    this.startAttack(this.player, `punch${next}` as AttackKind, events);
  }

  private startAttack(fighter: Fighter, attack: AttackKind, events: CombatEvent[]): void {
    const state = this.states[fighter.id];
    fighter.attack = attack;
    fighter.attackProgress = 0;
    fighter.moving = false;
    state.attackElapsed = 0;
    state.hitChecked = false;
    events.push({
      type: 'attack', target: fighter.id, x: fighter.x, y: fighter.y,
      attack, combo: fighter.id === 'player' ? this.combo : undefined,
    });
  }

  private updateAttack(attacker: Fighter, target: Fighter, dt: number, events: CombatEvent[]): void {
    if (!attacker.attack || attacker.dead) return;
    const attack = attacker.attack;
    const spec = ATTACKS[attack];
    const state = this.states[attacker.id];
    state.attackElapsed += dt;
    attacker.attackProgress = clamp(state.attackElapsed / spec.duration, 0, 1);
    if (!state.hitChecked && state.attackElapsed >= spec.impact) {
      state.hitChecked = true;
      const dx = (target.x - attacker.x) * attacker.facing;
      if (dx >= 0 && dx <= spec.range && Math.abs(target.y - attacker.y) <= LANE_TOLERANCE &&
          this.states[target.id].invulnerableFor <= 0 && !target.dead) {
        this.hit(attacker, target, attack, spec, events);
      }
    }
    if (state.attackElapsed >= spec.duration && !attacker.dead) {
      attacker.attack = null;
      attacker.attackProgress = 0;
      if (attacker.id === 'player') {
        this.comboUntil = attack.startsWith('punch') ? this.time + 0.56 : 0;
      } else {
        state.cooldown = 0.64;
      }
    }
  }

  private hit(attacker: Fighter, target: Fighter, attack: AttackKind, spec: AttackSpec,
    events: CombatEvent[]): void {
    const state = this.states[target.id];
    target.hp = Math.max(0, target.hp - spec.damage);
    target.attack = null;
    target.attackProgress = 0;
    target.moving = false;
    target.hurt = true;
    state.hurtFor = target.id === 'player' ? 0.3 : 0.19;
    state.invulnerableFor = target.id === 'player' ? 0.8 : 0.12;
    state.knockbackX = attacker.facing * spec.knockback;
    state.cooldown = target.id === 'enemy' ? 0.28 : 0;
    if (target.id === 'player') {
      this.bufferedAttack = null;
      this.combo = 0;
      this.comboUntil = 0;
    }
    events.push({
      type: 'hit', target: target.id, x: target.x, y: target.y,
      damage: spec.damage, attack, combo: attacker.id === 'player' ? this.combo : undefined,
    });
    if (target.hp === 0) {
      target.dead = true;
      this.status = target.id === 'enemy' ? 'won' : 'lost';
      this.player.moving = false;
      this.enemy.moving = false;
      events.push({ type: 'death', target: target.id, x: target.x, y: target.y });
    }
  }

  private updateEnemy(dt: number, events: CombatEvent[]): void {
    const enemy = this.enemy;
    const state = this.states.enemy;
    if (enemy.dead || enemy.hurt || enemy.attack) return;
    const dx = this.player.x - enemy.x;
    const dy = this.player.y - enemy.y;
    enemy.facing = dx >= 0 ? 1 : -1;
    if (Math.abs(dx) <= 82 && Math.abs(dy) <= 22) {
      if (state.cooldown <= 0) this.startAttack(enemy, 'enemy', events);
      return;
    }
    // Approach a position just within reach; prioritizing the lane allows the player to dodge.
    const stepX = Math.abs(dx) > 70 ? Math.sign(dx) * Math.min(112 * dt, Math.abs(dx) - 70) : 0;
    const stepY = Math.abs(dy) > 8 ? Math.sign(dy) * Math.min(78 * dt, Math.abs(dy) - 8) : 0;
    this.move(enemy, stepX, stepY);
  }

  private move(fighter: Fighter, dx: number, dy: number): void {
    const oldX = fighter.x;
    const oldY = fighter.y;
    fighter.x = clamp(fighter.x + dx, ARENA.left, ARENA.right);
    fighter.y = clamp(fighter.y + dy, ARENA.top, ARENA.bottom);
    fighter.moving = Math.abs(fighter.x - oldX) + Math.abs(fighter.y - oldY) > 0.01;
  }

  private separateFighters(): void {
    if (this.player.dead || this.enemy.dead || Math.abs(this.player.y - this.enemy.y) > 23) return;
    const dx = this.enemy.x - this.player.x;
    if (Math.abs(dx) >= 44) return;
    const direction = dx === 0 ? this.player.facing : Math.sign(dx);
    const overlap = 44 - Math.abs(dx);
    this.player.x = clamp(this.player.x - direction * overlap / 2, ARENA.left, ARENA.right);
    this.enemy.x = clamp(this.enemy.x + direction * overlap / 2, ARENA.left, ARENA.right);
    // If a wall absorbed one fighter's share, put the remaining separation on the other.
    const remaining = 44 - Math.abs(this.enemy.x - this.player.x);
    if (remaining > 0) {
      if (this.player.x === ARENA.left || this.player.x === ARENA.right) {
        this.enemy.x = clamp(this.enemy.x + direction * remaining, ARENA.left, ARENA.right);
      } else {
        this.player.x = clamp(this.player.x - direction * remaining, ARENA.left, ARENA.right);
      }
    }
  }
}
