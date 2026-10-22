import type { CombatInput } from './combat';

export const FIXED_STEP = 1 / 120;
const EMPTY: CombatInput = { x: 0, y: 0, punch: false, kick: false };

/** Wall-clock budget. CombatWorld retains its own independent direct-call stall protection. */
export class FrameStepper {
  private debt = 0;
  private held: CombatInput = { ...EMPTY };
  private edges: Array<'punch' | 'kick'> = [];
  private hitstop = 0;

  reset(): void {
    this.debt = this.hitstop = 0;
    this.held = { ...EMPTY };
    this.edges.length = 0;
  }

  stopFor(seconds: number): void { this.hitstop = Math.max(this.hitstop, seconds); }

  advance(seconds: number, input: CombatInput, tick: (dt: number, input: CombatInput, stopped: boolean) => void): number {
    this.held = { x: input.x, y: input.y, punch: false, kick: false };
    // Match CombatWorld's kick priority if both arrive in the same sampled frame.
    if (input.kick || input.punch) this.edges.push(input.kick ? 'kick' : 'punch');
    if (!Number.isFinite(seconds) || seconds < 0) return 0;
    this.debt = Math.min(.25, this.debt + Math.min(seconds, .25));
    let count = 0;
    while (this.debt + 1e-10 >= FIXED_STEP && count < 30) {
      this.debt = Math.max(0, this.debt - FIXED_STEP);
      count++;
      const stopped = this.hitstop > 1e-10;
      if (stopped) this.hitstop = Math.max(0, this.hitstop - FIXED_STEP);
      const edge = stopped ? undefined : this.edges.shift();
      tick(FIXED_STEP, { ...this.held, punch: edge === 'punch', kick: edge === 'kick' }, stopped);
    }
    return count;
  }

  get pendingEdges(): number { return this.edges.length; }
}
