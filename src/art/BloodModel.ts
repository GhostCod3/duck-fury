import type { Vec } from './rig/RigMath';
export interface Droplet extends Vec { vx: number; vy: number; ground: number; life: number; r: number }
export interface Stain extends Vec { rx: number; ry: number; angle: number; life: number }

/** Bounded world-space effects. Fighter-local wounds live exclusively on each RigState. */
export class BloodModel {
  droplets: Droplet[] = [];
  stains: Stain[] = [];
  private readonly random: () => number;
  constructor(random: () => number = Math.random) { this.random = random; }
  reset(): void { this.droplets.length = this.stains.length = 0; }
  burst(point: Vec, ground: number, facing: 1 | -1, heavy: boolean, scale: number): void {
    const count = heavy ? 16 : 10, force = heavy ? 1.18 : 1;
    for (let i = 0; i < count; i++) {
      const spread = (i / (count - 1) - .5) * 1.5, speed = (90 + this.random() * 100) * force * scale;
      this.droplets.push({ x: point.x, y: point.y, vx: facing * Math.cos(spread) * speed, vy: Math.sin(spread) * speed - 80, ground: ground + 2 + (this.random() - .5) * 9, life: 1.5, r: (1.15 + this.random() * 1.35) * scale });
    }
    this.droplets = this.droplets.slice(-96);
  }
  advance(dt: number): void {
    for (const q of this.droplets) {
      q.vx *= Math.exp(-dt * 1.2); q.vy += 650 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
      if (q.y >= q.ground && q.vy > 0) { q.life = 0; this.stains.push({ x: q.x, y: q.ground, rx: q.r * 2.1, ry: q.r * .65, angle: (this.random() - .5) * .7, life: 5 }); }
    }
    this.droplets = this.droplets.filter(q => q.life > 0);
    for (const q of this.stains) q.life -= dt;
    this.stains = this.stains.filter(q => q.life > 0).slice(-96);
  }
}
