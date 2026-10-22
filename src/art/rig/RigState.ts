import type { AttackKind } from '../../game/combat.ts';
import { getAttackPresentation } from '../../game/combat.ts';
import type { CharacterPose } from '../characterManifest';
import { AMBIENT_RATE, KO_END, aimBone, attackPose, boneAngle, clamp, depthScale, extend, lerp, mixAngle, p, rotate, shift, smooth, solveLeg, type AttackPose, type Foot, type Vec } from './RigMath.ts';

export interface RigSnapshot extends CharacterPose { x: number; y: number }
export interface IdlePose { weight: number; breath: number; sway: number; scan: number; guard: number; hands: number; head: number; blink: boolean }
export interface RigPose {
  hip: Vec; neck: Vec; back: Foot; front: Foot; leftHip: Vec; rightHip: Vec;
  farShoulder: Vec; nearShoulder: Vec; attack: AttackPose;
  pu: number; kick: number; wind: number; ph: number; gait: number;
  headAngle: number; idle?: IdlePose; knockedOut?: boolean;
  frontKnee?: Vec; backKnee?: Vec; nearAngles?: [number, number]; farAngles?: [number, number];
  bodyRotation?: number; headOrigin?: Vec;
}
interface KoFrame {
  t: number; hip: Vec; spine: number; nearLeg: [number, number]; farLeg: [number, number];
  nearArm: [number, number]; farArm: [number, number]; bootNear: number; bootFar: number; head: number;
}
export interface ArmPose { shoulder: Vec; elbow: Vec; wrist: Vec }

/** Per-fighter presentation, ported from the approved reference without its gameplay loop. */
export class RigState {
  readonly enemy: boolean;
  snapshot: RigSnapshot;
  pose!: RigPose;
  time = 0;
  idleTime = 0;
  idleBlend = 1;
  gait = 0;
  phase = 0;
  strideX = 1;
  strideY = 0;
  wind = .35;
  wounds = 0;
  flash = 0;
  deadTime = 0;
  scale: number;
  spring = { a: -.18, v: 0, b: 5, w: 0 };
  private frames: KoFrame[] | null = null;
  private spineLength = 105;
  private aim: Vec | null = null;
  private contact: Vec | null = null;
  private previousAttack: AttackKind | null = null;
  private previousProgress = 0;

  constructor(enemy: boolean, snapshot: RigSnapshot) {
    this.enemy = enemy;
    this.snapshot = { ...snapshot };
    this.scale = depthScale(snapshot.y);
    this.pose = this.livePose();
  }

  reset(snapshot: RigSnapshot): void {
    this.snapshot = { ...snapshot };
    this.time = this.idleTime = this.gait = this.phase = this.wounds = this.flash = this.deadTime = 0;
    this.idleBlend = this.strideX = 1;
    this.strideY = 0; this.wind = .35;
    this.spring = { a: -.18, v: 0, b: 5, w: 0 };
    this.frames = this.aim = this.contact = null;
    this.previousAttack = null; this.previousProgress = 0;
    this.scale = depthScale(snapshot.y);
    this.pose = this.livePose();
  }

  addWound(heavy: boolean): void { this.wounds = Math.min(4, this.wounds + (heavy ? 2 : 1)); this.flash = .075; }
  lockContact(world: Vec): void { this.contact = { ...world }; }
  get complete(): boolean { return this.frames !== null && this.deadTime >= KO_END; }

  advance(dt: number, snapshot: RigSnapshot, target?: Vec): void {
    if (this.complete) return;
    if (snapshot.dead && !this.frames) this.beginKnockout(snapshot);
    if (this.frames) {
      this.deadTime = Math.min(KO_END, this.deadTime + dt * AMBIENT_RATE);
      this.time += dt * AMBIENT_RATE;
      this.flash = Math.max(0, this.flash - dt);
      this.advanceSpring(dt * AMBIENT_RATE, true);
      this.pose = this.knockoutPose();
      return;
    }
    const old = this.snapshot;
    if (snapshot.attack !== this.previousAttack || snapshot.progress < this.previousProgress) this.contact = null;
    this.previousAttack = snapshot.attack; this.previousProgress = snapshot.progress;
    this.snapshot = { ...snapshot };
    this.scale = depthScale(snapshot.y);
    this.time += dt * AMBIENT_RATE;
    this.flash = Math.max(0, this.flash - dt);
    const dx = snapshot.x - old.x, dy = snapshot.y - old.y;
    const walking = snapshot.moving && !snapshot.hurt && !snapshot.attack;
    const speed = dt > 0 ? Math.hypot(dx / (210 * dt), dy / (125 * dt)) : 0;
    this.gait = lerp(this.gait, walking ? clamp(speed, 0, 1) : 0, 1 - Math.exp(-dt * 18));
    if (walking && Math.hypot(dx, dy) > .00001) {
      const n = Math.hypot(dx, dy);
      this.strideX = Math.abs(dx) / n; this.strideY = dy / n;
      // Reference stance phase travels 76 local X / 36 local Y units over 62% of a cycle.
      this.phase += Math.hypot(dx / 76, dy / 36) * Math.PI * 2 * .62 / this.scale;
    }
    const resting = !snapshot.attack && !snapshot.hurt && !walking;
    this.idleBlend = lerp(this.idleBlend, resting ? 1 : 0, 1 - Math.exp(-dt * (resting ? 5 : 18) * AMBIENT_RATE));
    if (resting) this.idleTime += dt * AMBIENT_RATE;
    this.aim = null;
    if (snapshot.attack && target) {
      const dxTarget = (target.x - snapshot.x) * snapshot.facing;
      if (dxTarget >= 0 && dxTarget <= getAttackPresentation(snapshot.attack).range + 40) this.aim = target;
    }
    this.advanceSpring(dt * AMBIENT_RATE, false);
    this.pose = this.livePose();
  }

  private advanceSpring(dt: number, dead: boolean): void {
    const targetA = dead ? 0 : -.12 - this.wind * .25 + (this.gait > .01 ? .04 * Math.sin(this.phase) : 0);
    const targetB = dead ? 42 : 20 - this.wind * 40 + (this.gait > .01 ? 9 * Math.sin(this.phase - 1) : 0);
    const s = this.spring;
    for (let n = 0; n < 3; n++) {
      const h = dt / 3;
      s.v += ((targetA - s.a) * (dead ? 70 : 80) - s.v * (dead ? 15 : 12)) * h; s.a += s.v * h;
      s.w += ((targetB - s.b) * (dead ? 55 : 65) - s.w * (dead ? 13 : 9)) * h; s.b += s.w * h;
    }
  }

  private idleMotion(): IdlePose {
    const t = this.idleTime, seed = this.enemy ? 1.9 : 0;
    const fade = this.snapshot.attack ? 1 - smooth(this.snapshot.progress * getAttackPresentation(this.snapshot.attack).duration / .065) : 1;
    const weight = this.idleBlend * (1 - this.gait) * fade * (this.snapshot.hurt ? 0 : 1);
    const pulse = (phase: number, start: number, duration: number) => { const u = (phase - start) / duration; return u > 0 && u < 1 ? Math.sin(Math.PI * u) ** 2 : 0; };
    const cycle = (t + seed * 1.5) % 8.4, breath = Math.sin(t * 2.05 + seed), blinkPhase = (t + seed * .7) % 5.7;
    return {
      weight, breath: breath * weight, sway: (2.7 * Math.sin(t * .88 + seed) + .6 * Math.sin(t * 1.7 + seed)) * weight,
      scan: pulse(cycle, 2.7, 1.5) * weight, guard: pulse(cycle, 5, 1.25) * weight,
      hands: Math.sin(t * 2.05 + seed - .55) * weight, head: Math.sin(t * .93 + seed - .3) * .018 * weight,
      blink: weight > .92 && blinkPhase > 5.50 && blinkPhase < 5.65,
    };
  }

  private foot(ph: number, center: number): Foot {
    const q = ((ph % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2), stance = .62;
    let x: number, angle: number, lift = 0;
    if (q < stance) {
      const t = q / stance; x = lerp(38, -38, t);
      angle = t < .17 ? lerp(-.12, 0, smooth(t / .17)) : t > .78 ? .22 * smooth((t - .78) / .22) : 0;
    } else {
      const t = (q - stance) / (1 - stance), m = -76 * (1 - stance) / stance;
      x = (2 * t ** 3 - 3 * t ** 2 + 1) * -38 + (t ** 3 - 2 * t ** 2 + t) * m + (-2 * t ** 3 + 3 * t ** 2) * 38 + (t ** 3 - t ** 2) * m;
      lift = 31 * Math.sin(Math.PI * t) ** 2;
      angle = lerp(.22, -.12, smooth(t)) - .15 * Math.sin(Math.PI * t) ** 2;
    }
    const sole = Math.max(-24 * Math.sin(angle) + 29.35 * Math.cos(angle), 42 * Math.sin(angle) + 29.35 * Math.cos(angle));
    return { x: center + x * this.strideX, y: 382 + 1.35 - sole - lift + x / 38 * 18 * this.strideY, angle };
  }

  private livePose(): RigPose {
    const attack = attackPose(this.snapshot.attack, this.snapshot.progress), pu = attack.kind === 'punch' ? attack.reach : 0;
    const kick = attack.kind === 'kick' ? attack.reach : 0, wind = attack.windup, gait = this.gait, ph = this.phase;
    const idle = this.idleMotion(), breath = Math.sin(this.time * 2.1) * (1 - gait) * (1 - Math.max(pu, kick));
    const bob = 2.6 * Math.cos(ph * 2) * gait + .35 * breath, twist = Math.sin(ph + .35) * gait;
    const recoil = this.snapshot.hurt ? -11 : 0, heavy = attack.step === 3 ? 1.2 : 1;
    const hip = p(250 + 2.8 * Math.sin(ph) * gait + pu * 3 - wind + idle.sway, 242 - 14 * (1 - gait) + bob + kick * 3 + idle.breath * .85 + idle.guard * .5);
    const neck = p(hip.x + 3 + 3.2 * twist + pu * 15 * heavy - wind * 5 - kick * 11 + recoil + idle.sway * .3 + idle.scan * .6, hip.y - 105 + 1.2 * Math.sin(ph * 2 - .3) * gait - .9 * breath - idle.breath * 1.8 - idle.guard * .9);
    const blend = (phase: number, center: number, idleX: number): Foot => {
      const f = this.foot(phase, center);
      return { x: lerp(idleX, f.x, gait), y: lerp(354, f.y, gait), angle: f.angle * gait };
    };
    const back = blend(ph + Math.PI, 243, 226), front = blend(ph, 257, 274);
    const leftHip = shift(hip, -8, 1.2 * Math.sin(ph) * gait), rightHip = shift(hip, 8, -1.2 * Math.sin(ph) * gait);
    if (attack.kind === 'kick') {
      const chamber = shift(rightHip, 22, 62), target = shift(rightHip, 116, -2), prep = wind * (1 - kick);
      front.x = lerp(lerp(front.x, chamber.x, prep), target.x, kick);
      front.y = lerp(lerp(front.y, chamber.y, prep), target.y, kick); front.angle = lerp(0, -.12, kick);
      const aim = this.localAim();
      if (aim) {
        const targetFoot = p(lerp(front.x, aim.x - 20, kick), lerp(front.y, aim.y - 5, kick));
        const solved = aimBone(rightHip, targetFoot, solveLeg(rightHip, front), 65);
        front.x = solved.end.x; front.y = solved.end.y;
      }
    }
    return {
      hip, neck, back, front, leftHip, rightHip, attack, pu, kick, wind, ph, gait, idle,
      farShoulder: shift(neck, -6 - 2 * twist, 16 - 1.5 * twist - idle.breath * .4 - idle.guard * .65),
      nearShoulder: shift(neck, -36 + 2 * twist + 3 * pu, 27 + 1.5 * twist - idle.breath * .7 - idle.guard),
      headAngle: -.035 - Math.sin(ph) * .012 * gait - pu * .025 + idle.head - idle.scan * .055 + idle.guard * .022,
    };
  }

  private localAim(): Vec | null {
    const point = this.contact ?? this.aim;
    return point ? p(250 + (point.x - this.snapshot.x) / this.scale * this.snapshot.facing, 382 + (point.y - this.snapshot.y) / this.scale) : null;
  }

  arm(far: boolean, pose = this.pose): ArmPose {
    const shoulder = far ? pose.farShoulder : pose.nearShoulder;
    if (pose.knockedOut) {
      const angles = (far ? pose.farAngles : pose.nearAngles)!;
      const elbow = extend(shoulder, 55, angles[0]);
      return { shoulder, elbow, wrist: extend(elbow, 55, angles[1]) };
    }
    const at = pose.attack, breathe = Math.sin(this.time * 2.1) * (1 - this.gait), active = at.kind === 'punch' && far === at.hand;
    const idle = pose.idle ?? { hands: 0, guard: 0 };
    let angle = (far ? -.21 : .21) + Math.sin(pose.ph + (far ? Math.PI : 0)) * (far ? -.38 : .38) * this.gait + breathe * .012 + (far ? -.028 : .035) * idle.hands + (far ? -.055 : .09) * idle.guard;
    let bend = 1.95 + breathe * .015 - idle.hands * .045 - idle.guard * (far ? .08 : .13);
    if (active) { angle -= .30 * at.windup; bend += .2 * at.windup; angle = lerp(angle, at.step === 3 ? 1.90 : 1.50, at.reach); bend = lerp(bend, at.step === 3 ? 1 : 1.43, at.reach); }
    else { angle -= .16 * pose.pu + .1 * pose.kick; bend += .20 * pose.pu; }
    let elbow = extend(shoulder, 55, angle), wrist = extend(elbow, 55, bend + Math.sin(pose.ph) * .12 * this.gait * (1 - pose.pu));
    const aim = active ? this.localAim() : null;
    if (aim) {
      const solved = aimBone(shoulder, p(lerp(wrist.x, aim.x, at.reach), lerp(wrist.y, aim.y, at.reach)), elbow, 55);
      elbow = solved.joint; wrist = solved.end;
    }
    return { shoulder, elbow, wrist };
  }

  worldPoint(local: Vec): Vec {
    const x = this.frames ? lerp(this.snapshot.x, clamp(this.snapshot.x, 80 + 60 * this.scale, 2520 - 60 * this.scale), smooth(this.deadTime / .95)) : this.snapshot.x;
    return p(x + (local.x - 250) * this.scale * this.snapshot.facing, this.snapshot.y + (local.y - 382) * this.scale);
  }
  hurtAnchor(from?: Vec): Vec {
    const center = this.worldPoint(p(lerp(this.pose.neck.x, this.pose.hip.x, .35), lerp(this.pose.neck.y, this.pose.hip.y, .35)));
    // Contact the facing surface of the shirt, not the torso's hidden center.
    return from ? shift(center, Math.sign(from.x - center.x) * 32 * this.scale, 0) : center;
  }
  strikePoint(): Vec { return this.worldPoint(this.pose.attack.kind === 'kick' ? shift(this.pose.front, 20, 5) : this.arm(this.pose.attack.hand).wrist); }

  beginKnockout(snapshot: RigSnapshot): void {
    if (this.frames) return;
    const pose = this.pose, near = this.arm(false), far = this.arm(true);
    const nk = solveLeg(pose.rightHip, pose.front), fk = solveLeg(pose.leftHip, pose.back);
    const seed: KoFrame = { t: 0, hip: { ...pose.hip }, spine: boneAngle(pose.hip, pose.neck), nearLeg: [boneAngle(pose.rightHip, nk), boneAngle(nk, pose.front)], farLeg: [boneAngle(pose.leftHip, fk), boneAngle(fk, pose.back)], nearArm: [boneAngle(near.shoulder, near.elbow), boneAngle(near.elbow, near.wrist)], farArm: [boneAngle(far.shoulder, far.elbow), boneAngle(far.elbow, far.wrist)], bootNear: pose.front.angle, bootFar: pose.back.angle, head: pose.headAngle };
    this.scale = depthScale(snapshot.y); this.snapshot = { ...snapshot }; this.deadTime = 0;
    this.spineLength = Math.hypot(pose.neck.x - pose.hip.x, pose.neck.y - pose.hip.y);
    const kneelHip = p(250, 303), kneelSpine = Math.PI - .30, r = Math.PI - kneelSpine;
    const offset = (hip: Vec, v: Vec, angle: number) => { const q = rotate(v, angle); return shift(hip, q.x, q.y); };
    const lh = offset(kneelHip, p(-8, 0), r), rh = offset(kneelHip, p(8, 1), r);
    const nearFoot = p(clamp(pose.front.x, 220, 286), 354), farFoot = p(clamp(pose.back.x, 214, 280), 354);
    const nkk = solveLeg(rh, nearFoot), fkk = solveLeg(lh, farFoot);
    const kneel: KoFrame = { t: .42, hip: kneelHip, spine: kneelSpine, nearLeg: [boneAngle(rh, nkk), boneAngle(nkk, nearFoot)], farLeg: [boneAngle(lh, fkk), boneAngle(fkk, farFoot)], nearArm: [.18, .18], farArm: [-.18, -.1], bootNear: 0, bootFar: 0, head: .34 };
    const rest: KoFrame = { t: 1.25, hip: p(232, 338), spine: Math.PI / 2, nearLeg: [-1.25, -1.72], farLeg: [-1.50, -1.35], nearArm: [.42, -1.45], farArm: [-1.45, -1.03], bootNear: -1.72, bootFar: -1.35, head: Math.PI / 2 };
    const recoil: KoFrame = { ...seed, t: .18, hip: p(seed.hip.x - 4, seed.hip.y + 10), spine: seed.spine + .12, nearArm: [seed.nearArm[0], .9], farArm: [seed.farArm[0], .8], head: seed.head - .16 };
    const midHip = p(242, 303), midSpine = Math.PI - 1.05, mr = Math.PI - midSpine;
    const mfar = offset(midHip, p(-8, 0), mr), mnear = offset(midHip, p(8, 1), mr);
    const mf = p(mfar.x - 55, 354), nf = p(mnear.x - 55, 354), mkf = solveLeg(mfar, mf), mkn = solveLeg(mnear, nf);
    const tip: KoFrame = { ...kneel, t: .60, hip: midHip, spine: midSpine, nearLeg: [boneAngle(mnear, mkn), boneAngle(mkn, nf)], farLeg: [boneAngle(mfar, mkf), boneAngle(mkf, mf)], nearArm: [.36, -.70], farArm: [-.65, -.55], head: 1.12 };
    this.frames = [seed, recoil, kneel, tip, { ...rest, t: .78, hip: p(232, 338), spine: Math.PI - 1.50, head: 1.48 }, { ...rest, t: .94, hip: p(232, 333), spine: Math.PI - 1.64, head: 1.66 }, rest];
  }

  private knockoutPose(): RigPose {
    const frames = this.frames!; let i = 0;
    while (i < frames.length - 2 && this.deadTime > frames[i + 1].t) i++;
    const from = frames[i], to = frames[i + 1], u = smooth((this.deadTime - from.t) / (to.t - from.t));
    const hip = p(lerp(from.hip.x, to.hip.x, u), lerp(from.hip.y, to.hip.y, u)), spine = mixAngle(from.spine, to.spine, u), r = Math.PI - spine;
    const neck = extend(hip, this.spineLength, spine);
    const offset = (root: Vec, v: Vec) => { const q = rotate(v, r); return shift(root, q.x, q.y); };
    const pair = (name: 'nearArm' | 'farArm' | 'nearLeg' | 'farLeg'): [number, number] => [mixAngle(from[name][0], to[name][0], u), mixAngle(from[name][1], to[name][1], u)];
    const nl = pair('nearLeg'), fl = pair('farLeg'), leftHip = offset(hip, p(-8, 0)), rightHip = offset(hip, p(8, 1));
    const frontKnee = extend(rightHip, 65, nl[0]), backKnee = extend(leftHip, 65, fl[0]);
    const front = { ...extend(frontKnee, 65, nl[1]), angle: mixAngle(from.bootNear, to.bootNear, u) };
    const back = { ...extend(backKnee, 65, fl[1]), angle: mixAngle(from.bootFar, to.bootFar, u) };
    return { knockedOut: true, hip, neck, leftHip, rightHip, front, back, frontKnee, backKnee, nearAngles: pair('nearArm'), farAngles: pair('farArm'), nearShoulder: offset(neck, p(-36, 27)), farShoulder: offset(neck, p(-6, 16)), bodyRotation: r, headOrigin: offset(neck, p(-4, -10)), headAngle: mixAngle(from.head, to.head, u), attack: attackPose(null, 0), pu: 0, kick: 0, wind: 0, gait: 0, ph: this.phase };
  }
}
