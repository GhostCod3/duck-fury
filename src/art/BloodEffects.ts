import Phaser from 'phaser';
import { BloodModel } from './BloodModel';
import { clamp } from './rig/RigMath';

export class BloodEffects {
  readonly model = new BloodModel();
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly airborne: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene) {
    this.ground = scene.add.graphics().setDepth(450);
    this.airborne = scene.add.graphics().setDepth(990);
  }
  reset(): void { this.model.reset(); this.draw(); }
  draw(): void {
    this.ground.clear(); this.airborne.clear();
    for (const q of this.model.stains) {
      this.ground.fillStyle(0xb52c38, .62 * clamp(q.life / 1.2, 0, 1));
      this.ground.save().translateCanvas(q.x, q.y).rotateCanvas(q.angle).fillEllipse(0, 0, q.rx * 2, q.ry * 2).restore();
    }
    for (const q of this.model.droplets) {
      const alpha = .92 * clamp(q.life / .18, 0, 1);
      this.airborne.lineStyle(q.r * 1.25, 0xb52c38, alpha).lineBetween(q.x, q.y, q.x - q.vx * .018, q.y - q.vy * .018);
      this.airborne.fillStyle(0xb52c38, alpha).fillCircle(q.x, q.y, q.r);
    }
  }
}
