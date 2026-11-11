/** Deterministic platform arena simulation. Rendering, input devices and the DOM live elsewhere. */
export type ActorId = 'player' | 'enemy';
export type WeaponKind = 'pistol' | 'shotgun' | 'rocket';
export interface ArenaInput { move: number; jump: boolean; fire: boolean; pickup: boolean; drop: boolean; aim?: 1 | -1 }
export const NO_INPUT: ArenaInput = { move: 0, jump: false, fire: false, pickup: false, drop: false };
export interface Platform { x: number; y: number; w: number; h: number }
export interface ArenaMap { name: string; platforms: Platform[]; weapons: Array<{ x: number; y: number; kind: WeaponKind }> }
export const ARENA_WIDTH = 1280;
export const ARENA_HEIGHT = 720;
export const BODY = { w: 34, h: 94 };
export const WEAPONS = {
  pistol: { label: 'SCRAP PISTOL', ammo: 9, cooldown: .28, speed: 1200, life: 1.1, pellets: 1, spread: 0, recoil: 16 },
  shotgun: { label: 'BOOMSTICK', ammo: 4, cooldown: .75, speed: 1050, life: .48, pellets: 5, spread: .065, recoil: 58 },
  rocket: { label: 'RUST ROCKET', ammo: 2, cooldown: 1, speed: 580, life: 1.9, pellets: 1, spread: 0, recoil: 35 },
} as const;
const floor = { x: 24, y: 638, w: 1232, h: 38 };
export const ARENAS: ArenaMap[] = [
  { name: 'THE FOUNDRY', platforms: [floor, { x: 155, y: 477, w: 260, h: 24 }, { x: 865, y: 477, w: 260, h: 24 }, { x: 478, y: 328, w: 324, h: 24 }],
    weapons: [{ x: 210, y: 638, kind: 'pistol' }, { x: 1070, y: 638, kind: 'pistol' }, { x: 290, y: 477, kind: 'shotgun' }, { x: 995, y: 477, kind: 'shotgun' }, { x: 640, y: 328, kind: 'rocket' }] },
  { name: 'SPLIT LEVEL', platforms: [floor, { x: 94, y: 460, w: 244, h: 24 }, { x: 478, y: 492, w: 324, h: 24 }, { x: 942, y: 460, w: 244, h: 24 }, { x: 480, y: 285, w: 320, h: 24 }],
    weapons: [{ x: 210, y: 638, kind: 'pistol' }, { x: 1070, y: 638, kind: 'pistol' }, { x: 215, y: 460, kind: 'shotgun' }, { x: 1060, y: 460, kind: 'shotgun' }, { x: 640, y: 285, kind: 'rocket' }] },
  { name: 'HIGH VOLTAGE', platforms: [floor, { x: 100, y: 480, w: 240, h: 24 }, { x: 940, y: 480, w: 240, h: 24 }, { x: 420, y: 355, w: 185, h: 24 }, { x: 675, y: 355, w: 185, h: 24 }],
    weapons: [{ x: 210, y: 638, kind: 'pistol' }, { x: 1070, y: 638, kind: 'pistol' }, { x: 220, y: 480, kind: 'shotgun' }, { x: 1060, y: 480, kind: 'shotgun' }, { x: 510, y: 355, kind: 'rocket' }] },
];
export interface ArenaActor {
  id: ActorId; x: number; y: number; vx: number; vy: number; facing: 1 | -1; alive: boolean;
  grounded: boolean; jumps: number; coyote: number; jumpBuffer: number; dropTime: number;
  weapon: WeaponKind | null; ammo: number; cooldown: number; flash: number; aiJump: number;
}
export interface Pickup { id: number; x: number; y: number; kind: WeaponKind; ammo: number; availableAt: number }
export interface Projectile { id: number; owner: ActorId; kind: WeaponKind; x: number; y: number; vx: number; vy: number; life: number }
export interface ArenaEvent { type: 'shot' | 'impact' | 'death' | 'round' | 'next'; x: number; y: number; actor?: ActorId; weapon?: WeaponKind; winner?: ActorId | null }
export type ArenaPhase = 'countdown' | 'playing' | 'roundOver' | 'matchOver';
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const other = (id: ActorId): ActorId => id === 'player' ? 'enemy' : 'player';

/** Earliest segment contact, including fast bullets crossing a body between ticks. */
export function segmentRect(x: number, y: number, dx: number, dy: number, r: Platform): number | null {
  let lo = 0, hi = 1;
  for (const [p, d, min, max] of [[x, dx, r.x, r.x + r.w], [y, dy, r.y, r.y + r.h]]) {
    if (Math.abs(d) < 1e-9) { if (p < min || p > max) return null; }
    else { const a = (min - p) / d, b = (max - p) / d; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); if (lo > hi) return null; }
  }
  return lo;
}

export interface BotConfig { reactionDelay: number; routeTimeout: number }
export const DEFAULT_BOT: Readonly<BotConfig> = { reactionDelay: .24, routeTimeout: 2.4 };

export class ArenaWorld {
  actors: Record<ActorId, ArenaActor>;
  scores: Record<ActorId, number> = { player: 0, enemy: 0 };
  pickups: Pickup[] = [];
  projectiles: Projectile[] = [];
  phase: ArenaPhase = 'countdown';
  round = 1;
  time = 0;
  phaseTime = 1.4;
  remaining = 45;
  winner: ActorId | null = null;
  readonly target = 5;
  private serial = 0;
  private botLedge: Platform | undefined;
  readonly botConfig: BotConfig;
  private botThink = 0;
  private botTarget: { x:number; y:number } | undefined;
  private botSight = 0;
  private botRouteTime = 0;
  private botAvoid = new Set<Platform>();
  constructor(config: Partial<BotConfig> = {}) {
    this.botConfig = { reactionDelay: clamp(config.reactionDelay ?? DEFAULT_BOT.reactionDelay,.08,1), routeTimeout:clamp(config.routeTimeout ?? DEFAULT_BOT.routeTimeout,1,5) };
    this.actors = { player: this.spawn('player'), enemy: this.spawn('enemy') }; this.placeWeapons();
  }
  get botPreparing(): boolean { return this.botSight > 0 && this.botSight < this.botConfig.reactionDelay; }
  get map(): ArenaMap { return ARENAS[(this.round - 1) % ARENAS.length]; }
  private spawn(id: ActorId): ArenaActor {
    return { id, x: id === 'player' ? 170 : 1110, y: 638, vx: 0, vy: 0, facing: id === 'player' ? 1 : -1, alive: true, grounded: true, jumps: 0, coyote: .085, jumpBuffer: 0, dropTime: 0, weapon: null, ammo: 0, cooldown: 0, flash: 0, aiJump: 0 };
  }
  private placeWeapons(): void { this.pickups = this.map.weapons.map(w => ({ ...w, id: ++this.serial, ammo: WEAPONS[w.kind].ammo, availableAt: this.time })); }
  private nextRound(): void {
    this.botLedge = undefined; this.botThink = 0; this.botTarget = undefined; this.botSight = 0; this.botRouteTime = 0; this.botAvoid.clear();
    this.round++; this.phase = 'countdown'; this.phaseTime = 1.4; this.remaining = 45; this.winner = null;
    this.actors = { player: this.spawn('player'), enemy: this.spawn('enemy') }; this.projectiles = []; this.placeWeapons();
  }
  step(seconds: number, input: ArenaInput, enemyOverride?: ArenaInput): ArenaEvent[] {
    if (!Number.isFinite(seconds) || seconds <= 0 || this.phase === 'matchOver') return [];
    const dt = Math.min(seconds, 1 / 30), events: ArenaEvent[] = [];
    this.time += dt;
    for (const a of Object.values(this.actors)) { a.cooldown = Math.max(0, a.cooldown - dt); a.flash = Math.max(0, a.flash - dt); }
    if (this.phase === 'countdown') { this.phaseTime -= dt; if (this.phaseTime <= 0) this.phase = 'playing'; return events; }
    if (this.phase === 'roundOver') {
      for (const a of Object.values(this.actors)) this.move(a, NO_INPUT, dt);
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) {
        if (Object.values(this.scores).some(score => score >= this.target)) this.phase = 'matchOver';
        else { this.nextRound(); events.push({ type: 'next', x: 0, y: 0 }); }
      }
      return events;
    }
    this.remaining = Math.max(0, this.remaining - dt);
    this.act(this.actors.player, input, dt, events);
    this.act(this.actors.enemy, enemyOverride ?? this.botInput(dt), dt, events);
    this.advanceProjectiles(dt, events);
    for (const a of Object.values(this.actors)) if (a.alive && a.y > 750) this.kill(a, events);
    if (!this.actors.player.alive || !this.actors.enemy.alive || this.remaining <= 0) {
      const p = this.actors.player.alive, e = this.actors.enemy.alive;
      this.winner = p === e ? null : p ? 'player' : 'enemy';
      if (this.winner) this.scores[this.winner]++;
      for (const a of Object.values(this.actors)) a.jumpBuffer = 0;
      this.phase = 'roundOver'; this.phaseTime = 2.2; this.projectiles = [];
      events.push({ type: 'round', x: 640, y: 330, winner: this.winner });
    }
    return events;
  }
  private act(a: ArenaActor, input: ArenaInput, dt: number, events: ArenaEvent[]): void {
    if (!a.alive) { this.move(a, NO_INPUT, dt); return; }
    this.move(a, input, dt);
    if (input.aim) a.facing = input.aim;
    if (input.pickup) {
      const nearby = this.pickups.filter(w => w.availableAt <= this.time && Math.abs(w.x - a.x) < 64 && Math.abs(w.y - a.y) < 62).sort((l, r) => Math.abs(l.x - a.x) - Math.abs(r.x - a.x))[0];
      if (nearby) {
        if (a.weapon && a.ammo > 0 && this.pickups.length < 20) this.pickups.push({ id: ++this.serial, kind: a.weapon, ammo: a.ammo, x: a.x - a.facing * 38, y: a.y, availableAt: this.time + .45 });
        a.weapon = nearby.kind; a.ammo = nearby.ammo; this.pickups = this.pickups.filter(w => w !== nearby);
      }
    }
    if (input.fire && a.weapon && a.ammo > 0 && a.cooldown <= 0 && this.projectiles.length < 90) {
      const kind = a.weapon, w = WEAPONS[kind]; a.ammo--; a.cooldown = w.cooldown; a.flash = .065;
      const x = a.x + 33 * a.facing, y = a.y - 64;
      for (let n = 0; n < w.pellets; n++) {
        const spread = (n - (w.pellets - 1) / 2) * w.spread;
        this.projectiles.push({ id: ++this.serial, owner: a.id, kind, x, y, vx: Math.cos(spread) * w.speed * a.facing, vy: Math.sin(spread) * w.speed, life: w.life });
      }
      a.x = clamp(a.x - w.recoil * a.facing * .12, 42, 1238);
      events.push({ type: 'shot', actor: a.id, weapon: kind, x, y });
    }
  }
  private move(a: ArenaActor, input: ArenaInput, dt: number): void {
    const direction = a.alive ? clamp(input.move, -1, 1) : 0;
    if (Math.abs(direction) > .15) a.facing = direction > 0 ? 1 : -1;
    const acceleration = a.grounded ? 2800 : 1750, target = direction * 310;
    a.vx += clamp(target - a.vx, -acceleration * dt, acceleration * dt);
    a.coyote = a.grounded ? .085 : Math.max(0, a.coyote - dt);
    a.jumpBuffer = input.jump && a.alive ? .1 : Math.max(0, a.jumpBuffer - dt);
    a.dropTime = Math.max(0, a.dropTime - dt);
    if (input.drop && a.grounded && a.y < 630) { a.dropTime = .2; a.y += 4; a.grounded = false; a.coyote = 0; a.jumps = Math.max(1, a.jumps); }
    if (a.jumpBuffer > 0 && a.alive && (a.coyote > 0 || a.jumps < 2)) {
      a.jumps = a.coyote > 0 ? 1 : a.jumps + 1; a.vy = -650; a.grounded = false; a.coyote = 0; a.jumpBuffer = 0;
    }
    const oldY = a.y;
    a.x = clamp(a.x + a.vx * dt, 42, 1238);
    a.vy = Math.min(1050, a.vy + 1750 * dt); a.y += a.vy * dt; a.grounded = false;
    if (a.vy >= 0) for (const surface of this.map.platforms) {
      if (a.dropTime > 0 && surface.y < 630) continue;
      if (a.x + BODY.w / 2 > surface.x && a.x - BODY.w / 2 < surface.x + surface.w && oldY <= surface.y + .01 && a.y >= surface.y) {
        a.y = surface.y; a.vy = 0; a.grounded = true; a.jumps = 0; break;
      }
    }
    // Leaving a ledge consumes the ground jump; the remaining jump is still available.
    if (!a.grounded && a.coyote <= 0 && a.jumps === 0) a.jumps = 1;
  }
  private advanceProjectiles(dt: number, events: ArenaEvent[]): void {
    const live: Projectile[] = [];
    for (const b of this.projectiles) {
      const dx = b.vx * dt, dy = b.vy * dt; let contact = 2; let victim: ArenaActor | undefined;
      for (const surface of this.map.platforms) { const t = segmentRect(b.x, b.y, dx, dy, surface); if (t !== null && t < contact) contact = t; }
      const a = this.actors[other(b.owner)];
      if (a.alive) { const t = segmentRect(b.x, b.y, dx, dy, { x: a.x - BODY.w / 2, y: a.y - BODY.h, w: BODY.w, h: BODY.h }); if (t !== null && t < contact) { contact = t; victim = a; } }
      if (contact <= 1) {
        b.x += dx * contact - Math.sign(dx) * .5; b.y += dy * contact;
        events.push({ type: 'impact', x: b.x, y: b.y, weapon: b.kind });
        if (b.kind === 'rocket') {
          for (const actor of Object.values(this.actors)) {
            const nearestX = clamp(b.x, actor.x - BODY.w / 2, actor.x + BODY.w / 2), nearestY = clamp(b.y, actor.y - BODY.h, actor.y);
            if (Math.hypot(nearestX - b.x, nearestY - b.y) < 76 && !this.occluded(b.x, b.y, nearestX, nearestY)) this.kill(actor, events);
          }
        } else if (victim) this.kill(victim, events);
      } else {
        b.x += dx; b.y += dy; b.life -= dt;
        if (b.life > 0 && b.x > -30 && b.x < 1310 && b.y > -80 && b.y < 750) live.push(b);
      }
    }
    this.projectiles = live;
  }
  private kill(a: ArenaActor, events: ArenaEvent[]): void {
    if (!a.alive) return;
    a.alive = false; a.vx = 0;
    events.push({ type: 'death', actor: a.id, x: a.x, y: a.y - 60 });
  }
  private occluded(x: number, y: number, tx: number, ty: number): boolean {
    return this.map.platforms.some(r => { const t = segmentRect(x, y, tx - x, ty - y, r); return t !== null && t > 1e-6 && t < .999; });
  }
  private botInput(dt: number): ArenaInput {
    const a = this.actors.enemy, player = this.actors.player; a.aiJump = Math.max(0, a.aiJump - dt);
    this.botThink += dt;
    if (this.botThink + 1e-9 >= this.botConfig.reactionDelay) { this.botTarget = {x:player.x,y:player.y}; this.botThink = 0; }
    if (!this.botTarget) return NO_INPUT;
    const target = this.botTarget;
    if (this.botLedge) {
      this.botRouteTime += dt;
      if (this.botRouteTime > this.botConfig.routeTimeout) { this.botAvoid.add(this.botLedge); this.botLedge=undefined; this.botRouteTime=0; }
    }
    let tx = target.x, ty = target.y;
    const needsWeapon = !a.weapon || a.ammo === 0;
    if (needsWeapon) {
      const pickup = this.pickups.filter(w => w.ammo > 0 && w.availableAt <= this.time).sort((l, r) => Math.hypot(l.x - a.x, (l.y - a.y) * 1.4) - Math.hypot(r.x - a.x, (r.y - a.y) * 1.4))[0];
      if (pickup) { tx = pickup.x; ty = pickup.y; }
    }
    // Keep a reachable ledge as a waypoint until landing; an apex must not erase the route.
    if (this.botLedge && a.grounded && Math.abs(a.y - this.botLedge.y) < 1) { this.botLedge = undefined; this.botRouteTime=0; }
    if (!this.botLedge && a.grounded && ty < a.y - 65) {
      this.botLedge = this.map.platforms.filter(p => !this.botAvoid.has(p) && p.y < a.y - 40 && p.y >= a.y - 225)
        .sort((l, r) => Math.abs(clamp(a.x, l.x + 32, l.x + l.w - 32) - a.x) + Math.abs(l.y - ty) * .6 - Math.abs(clamp(a.x, r.x + 32, r.x + r.w - 32) - a.x) - Math.abs(r.y - ty) * .6)[0];
    }
    if (this.botLedge) { tx = clamp(a.x, this.botLedge.x + 32, this.botLedge.x + this.botLedge.w - 32); ty = this.botLedge.y; }
    const dx = tx - a.x, aligned = Math.abs(target.y - a.y) < 45;
    let move = Math.abs(dx) > (needsWeapon || this.botLedge ? 16 : 150) ? Math.sign(dx) : 0;
    if (!needsWeapon && aligned) { a.facing = target.x >= a.x ? 1 : -1; if (Math.abs(dx) < 95) move = -Math.sign(dx); }
    const jump = ty >= a.y - 225 && ty < a.y - (a.grounded ? 55 : 8) && Math.abs(dx) < 235 && a.aiJump <= 0 && (a.grounded || (a.jumps === 1 && a.vy > -130));
    if (jump) a.aiJump = .15;
    const facing = target.x >= a.x ? 1 : -1;
    const range = a.weapon ? WEAPONS[a.weapon].speed * WEAPONS[a.weapon].life : 0;
    const safeShot = !needsWeapon && aligned && Math.abs(target.x-a.x) > (a.weapon === 'rocket' ? 145 : 65) && Math.abs(target.x-a.x) < range*.9
      && Math.abs(player.y-a.y)<45 && (player.x-a.x)*facing>0
      && !this.occluded(a.x+facing*33,a.y-64,player.x,player.y-64);
    this.botSight = safeShot ? this.botSight+dt : 0;
    return { move, jump, aim: !needsWeapon ? (target.x >= a.x ? 1 : -1) : undefined, pickup: needsWeapon, drop: ty > a.y + 110 && a.grounded,
      fire: safeShot && this.botSight + 1e-9 >= this.botConfig.reactionDelay };
  }
}

/** Retains action edges through zero-tick frames and consumes each once. */
export class ArenaStepper {
  private debt = 0;
  private pending = { jump: false, pickup: false, fire: false };
  reset(): void { this.debt = 0; this.pending = { jump: false, pickup: false, fire: false }; }
  advance(seconds: number, input: ArenaInput, tick: (dt: number, input: ArenaInput) => void): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.pending.jump ||= input.jump; this.pending.pickup ||= input.pickup; this.pending.fire ||= input.fire;
    this.debt = Math.min(.25, this.debt + seconds);
    let count = 0;
    while (this.debt + 1e-10 >= 1 / 120 && count++ < 30) {
      this.debt = Math.max(0, this.debt - 1 / 120);
      const edges = this.pending; this.pending = { jump: false, pickup: false, fire: false };
      tick(1 / 120, { ...input, ...edges, fire: input.fire || edges.fire });
    }
  }
}
