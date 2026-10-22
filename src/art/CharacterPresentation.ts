import { ARENA, LANE_TOLERANCE, getAttackPresentation, type Fighter } from '../game/combat.ts';
import { depthScale, smooth, type Vec } from './rig/RigMath.ts';
import type { RigSnapshot } from './rig/RigState.ts';

/** Approved boot/guard footprint in rig units. Only rendered roots are separated. */
export const CONTACT_FOOTPRINT = 128;
export function presentationPositions(player: Pick<Fighter, 'x' | 'y' | 'facing'>, enemy: Pick<Fighter, 'x' | 'y'>): Record<'player' | 'enemy', Vec> {
  const lane = Math.abs(player.y - enemy.y);
  const weight = 1 - smooth((lane - LANE_TOLERANCE) / 32);
  const distance = CONTACT_FOOTPRINT * (depthScale(player.y) + depthScale(enemy.y)) / 2 * weight;
  const gap = Math.abs(enemy.x - player.x);
  if (gap >= distance) return { player: { x: player.x, y: player.y }, enemy: { x: enemy.x, y: enemy.y } };
  const sign = Math.sign(enemy.x - player.x) || player.facing;
  const extra = (distance - gap) / 2;
  let px = player.x - extra * sign, ex = enemy.x + extra * sign;
  // Transfer separation to the other fighter at a wall rather than clipping boots.
  const correction = Math.max(0, ARENA.left - Math.min(px, ex)) - Math.max(0, Math.max(px, ex) - ARENA.right);
  px += correction; ex += correction;
  return { player: { x: px, y: player.y }, enemy: { x: ex, y: enemy.y } };
}

/** Finish the captured live attack after combat ends; never advance CombatWorld. */
export class AttackRecovery {
  private ended = false;
  private attack: RigSnapshot['attack'] = null;
  private progress = 0;

  reset(): void { this.ended = false; this.attack = null; this.progress = 0; }
  advance(dt: number, snapshot: RigSnapshot, combatStopped: boolean): RigSnapshot {
    if (!combatStopped || snapshot.dead) { this.reset(); return { ...snapshot }; }
    if (!this.ended) {
      this.ended = true; this.attack = snapshot.attack; this.progress = snapshot.progress;
    }
    if (this.attack) {
      this.progress = Math.min(1, this.progress + dt / getAttackPresentation(this.attack).duration);
      if (this.progress >= 1) this.attack = null;
    }
    return { ...snapshot, moving: false, hurt: false, attack: this.attack, progress: this.attack ? this.progress : 0 };
  }
}
