import { getAttackPresentation, type AttackKind } from '../../game/combat.ts';

export interface Vec { x: number; y: number }
export interface Foot extends Vec { angle: number }
export const p = (x: number, y: number): Vec => ({ x, y });
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (t: number): number => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const shift = (a: Vec, x: number, y: number): Vec => p(a.x + x, a.y + y);
export const extend = (a: Vec, length: number, angle: number): Vec => p(a.x + Math.sin(angle) * length, a.y + Math.cos(angle) * length);
export const rotate = (v: Vec, r: number): Vec => p(v.x * Math.cos(r) - v.y * Math.sin(r), v.x * Math.sin(r) + v.y * Math.cos(r));
export const boneAngle = (a: Vec, b: Vec): number => Math.atan2(b.x - a.x, b.y - a.y);
export const mixAngle = (a: number, b: number, t: number): number => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
export const FIT_SCALE = 1.2;
export const AMBIENT_RATE = 1.3;
export const KO_END = 1.25;

export function depthScale(y: number): number { return FIT_SCALE * (.84 + .14 * clamp((y - 460) / 175, 0, 1)); }

export function solveLeg(hip: Vec, ankle: Vec, l1 = 65, l2 = 65): Vec {
  const dx = ankle.x - hip.x, dy = ankle.y - hip.y, raw = Math.max(.001, Math.hypot(dx, dy));
  const d = clamp(raw, .01, l1 + l2 - .1), ux = dx / raw, uy = dy / raw;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return p(hip.x + ux * a + uy * h, hip.y + uy * a - ux * h);
}

/** Two fixed-length segments, choosing the bend closest to the approved reference pose. */
export function aimBone(root: Vec, target: Vec, oldJoint: Vec, length: number): { joint: Vec; end: Vec } {
  const dx = target.x - root.x, dy = target.y - root.y, raw = Math.max(.001, Math.hypot(dx, dy));
  const d = clamp(raw, .01, length * 2 - .1), ux = dx / raw, uy = dy / raw;
  const mid = p(root.x + ux * d / 2, root.y + uy * d / 2), h = Math.sqrt(length * length - d * d / 4);
  const first = p(mid.x + uy * h, mid.y - ux * h), second = p(mid.x - uy * h, mid.y + ux * h);
  const distance = (v: Vec) => Math.hypot(v.x - oldJoint.x, v.y - oldJoint.y);
  return { joint: distance(first) <= distance(second) ? first : second, end: p(root.x + ux * d, root.y + uy * d) };
}

export interface AttackPose { reach: number; windup: number; kind: 'none' | 'punch' | 'kick'; step: number; hand: boolean }
const REFERENCE_ATTACKS = {
  punch1: { duration: .40, wind: .08, extend: .085, hold: .055, step: 1 },
  punch2: { duration: .46, wind: .095, extend: .09, hold: .06, step: 2 },
  punch3: { duration: .59, wind: .14, extend: .10, hold: .065, step: 3 },
  kick: { duration: .69, wind: .16, extend: .115, hold: .065, step: 0 },
  enemy: { duration: .88, wind: .32, extend: .12, hold: .07, step: 1 },
} as const;

export function referenceAttackTime(kind: AttackKind, progress: number): number {
  const site = getAttackPresentation(kind), ref = REFERENCE_ATTACKS[kind], impact = site.impact / site.duration;
  const q = clamp(progress, 0, 1), end = ref.wind + ref.extend;
  return q <= impact ? end * q / impact : end + (ref.duration - end) * (q - impact) / (1 - impact);
}

export function attackPose(kind: AttackKind | null, progress: number): AttackPose {
  if (!kind) return { reach: 0, windup: 0, kind: 'none', step: 0, hand: false };
  const ref = REFERENCE_ATTACKS[kind], t = referenceAttackTime(kind, progress), end = ref.wind + ref.extend;
  let reach = 0, windup = 0;
  if (t < ref.wind) windup = smooth(t / ref.wind);
  else if (t < end) { reach = 1 - Math.pow(1 - clamp((t - ref.wind) / ref.extend, 0, 1), 3); windup = 1 - reach; }
  else if (t < end + ref.hold) reach = 1;
  else reach = 1 - smooth((t - end - ref.hold) / (ref.duration - end - ref.hold));
  return { reach, windup, kind: kind === 'kick' ? 'kick' : 'punch', step: ref.step, hand: ref.step === 2 };
}
